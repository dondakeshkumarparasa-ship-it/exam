document.addEventListener('DOMContentLoaded', () => {
      // Initialize Engine state
      window.ExamPulse.init();
      const Engine = window.ExamPulse;

      const els = {
        adminSideBtns: document.querySelectorAll('.admin-sidebar .admin-side-btn'),
        adminSubViews: document.querySelectorAll('.admin-sub-view'),
        adminStatConcurrent: document.getElementById('admin-stat-concurrent'),
        adminStatPractices: document.getElementById('admin-stat-practices'),
        adminStatQuestionsCount: document.getElementById('admin-stat-questions'),
        adminCategoryPopularity: document.getElementById('admin-category-popularity-bars'),
        adminAddForm: document.getElementById('admin-add-question-form'),
        adminBulkInput: document.getElementById('admin-bulk-input'),
        adminBulkBtn: document.getElementById('admin-bulk-submit-btn'),
        adminUsersTable: document.getElementById('admin-users-table-body')
      };

      let activeAdminSubView = 'notifications';

      // Unified Navigation Sync Routing
      const sidebarBtns = document.querySelectorAll('.admin-sidebar .admin-side-btn');
      const bottomNavItems = document.querySelectorAll('.admin-bottom-nav .mobile-bottom-nav-item');
      const hamburgerLinks = document.querySelectorAll('#admin-mobile-nav-overlay .mobile-nav-link');

      function setSubView(subName) {
        activeAdminSubView = subName;
        
        // Sync Sidebar Buttons
        sidebarBtns.forEach(btn => {
          btn.classList.remove('active');
          if (btn.dataset.sub === subName) btn.classList.add('active');
        });
        
        // Sync Bottom Nav Items
        bottomNavItems.forEach(item => {
          item.classList.remove('active');
          if (item.dataset.sub === subName) item.classList.add('active');
        });
        
        // Sync Hamburger Links
        hamburgerLinks.forEach(link => {
          link.classList.remove('active');
          if (link.dataset.sub === subName) link.classList.add('active');
        });
        
        // Close hamburger menu overlay when link is clicked
        const overlay = document.getElementById('admin-mobile-nav-overlay');
        if (overlay) overlay.classList.remove('active');
        
        updateAdminDashboard();
      }

      sidebarBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          setSubView(btn.dataset.sub);
        });
      });

      bottomNavItems.forEach(item => {
        item.addEventListener('click', () => {
          setSubView(item.dataset.sub);
        });
      });

      hamburgerLinks.forEach(link => {
        link.addEventListener('click', () => {
          setSubView(link.dataset.sub);
        });
      });

      // Hamburger Menu Toggle
      const hamburgerBtn = document.getElementById('admin-hamburger-btn');
      const mobileNavOverlay = document.getElementById('admin-mobile-nav-overlay');
      if (hamburgerBtn && mobileNavOverlay) {
        hamburgerBtn.addEventListener('click', () => {
          mobileNavOverlay.classList.toggle('active');
        });
      }

      function updateAdminSubRouting() {
        els.adminSubViews.forEach(view => {
          view.classList.remove('active');
          if (view.id === `admin-sub-${activeAdminSubView}`) {
            view.classList.add('active');
          }
        });
      }

      function updateAdminDashboard() {
        updateAdminSubRouting();
        
        if (activeAdminSubView === 'notifications' || activeAdminSubView === 'posts') {
          loadAdminNotificationsTable();
        }
        
        const adm = Engine.getAdminStats();
        
        els.adminStatConcurrent.textContent = adm.activeUsers.toLocaleString();
        els.adminStatPractices.textContent = adm.totalAnsweredGlobal.toLocaleString();
        
        const db = [...window.ExamPulseData.questions, ...Engine.state.customQuestions];
        els.adminStatQuestionsCount.textContent = db.length;

        // Categories graph list
        els.adminCategoryPopularity.innerHTML = '';
        Object.entries(adm.categoryPopularity).forEach(([cat, val]) => {
          const maxVal = Math.max(...Object.values(adm.categoryPopularity));
          const pct = maxVal > 0 ? Math.round((val / maxVal) * 100) : 0;
          
          const item = document.createElement('div');
          item.className = 'cat-bar-item';
          item.style.marginBottom = '0.85rem';
          item.innerHTML = `
            <div class="cat-bar-meta" style="font-size: 0.75rem;">
              <span><strong>${cat}</strong></span>
              <span class="cat-counts" style="color: var(--text-muted);">${val} Questions Seeded</span>
            </div>
            <div class="cat-progress-track" style="height: 0.4rem;">
              <div class="cat-progress-fill" style="width: ${pct}%; background: linear-gradient(90deg, var(--brand-primary), #6366f1);"></div>
            </div>
          `;
          els.adminCategoryPopularity.appendChild(item);
        });

        // Users lists rendering
        els.adminUsersTable.innerHTML = '';
        
        // Dynamic Live signed-in Student
        if (Engine.state.user) {
          const actualUser = Engine.state.user;
          const isSuspended = actualUser.suspended === true;
          const row = document.createElement('tr');
          row.style.background = 'rgba(16, 185, 129, 0.06)';
          row.innerHTML = `
            <td><strong>${actualUser.username} <span style="color: var(--brand-primary); font-size: 0.7rem;">(You)</span></strong></td>
            <td><span class="badge badge-easy" style="background: rgba(16,185,129,0.05); color: var(--brand-primary); border-color: rgba(16,185,129,0.25);">Practice Mode</span></td>
            <td style="color: var(--text-secondary);">Active Session Student</td>
            <td><span class="badge ${isSuspended ? 'badge-hard' : 'badge-easy'}" id="current-user-status">${isSuspended ? 'Suspended' : 'Active'}</span></td>
            <td>
              <button class="btn btn-secondary btn-sm" id="btn-current-user-suspend" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; background: var(--bg-input); color: ${isSuspended ? 'var(--brand-success)' : ''};">
                ${isSuspended ? 'Reactivate' : 'Suspend'}
              </button>
            </td>
          `;

          const suspendBtn = row.querySelector('#btn-current-user-suspend');
          const statusBadge = row.querySelector('#current-user-status');
          suspendBtn.addEventListener('click', () => {
            const currentlySuspended = Engine.state.user.suspended === true;
            const targetStatus = !currentlySuspended;
            
            Engine.toggleUserSuspension(targetStatus);

            if (targetStatus) {
              suspendBtn.textContent = 'Reactivate';
              suspendBtn.style.color = 'var(--brand-success)';
              statusBadge.textContent = 'Suspended';
              statusBadge.className = 'badge badge-hard';
            } else {
              suspendBtn.textContent = 'Suspend';
              suspendBtn.style.color = '';
              statusBadge.textContent = 'Active';
              statusBadge.className = 'badge badge-easy';
            }
          });
          els.adminUsersTable.appendChild(row);
        }

        // Simulated Virtual candidates
        Engine.virtualUsers.forEach((vu, idx) => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td><strong>${vu.name}</strong></td>
            <td><span class="badge badge-easy" style="background: rgba(255,255,255,0.03); color: var(--text-secondary);">${vu.category}</span></td>
            <td style="color: var(--text-muted);">Simulated Candidate</td>
            <td><span class="badge badge-easy" id="user-status-${idx}">Active</span></td>
            <td>
              <button class="btn btn-secondary btn-sm" id="btn-user-suspend-${idx}" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; background: var(--bg-input);">Suspend</button>
            </td>
          `;

          const suspendBtn = row.querySelector(`#btn-user-suspend-${idx}`);
          const statusBadge = row.querySelector(`#user-status-${idx}`);
          suspendBtn.addEventListener('click', () => {
            if (suspendBtn.textContent === 'Suspend') {
              suspendBtn.textContent = 'Reactivate';
              suspendBtn.style.color = 'var(--brand-success)';
              statusBadge.textContent = 'Suspended';
              statusBadge.className = 'badge badge-hard';
            } else {
              suspendBtn.textContent = 'Suspend';
              suspendBtn.style.color = '';
              statusBadge.textContent = 'Active';
              statusBadge.className = 'badge badge-easy';
            }
          });

          els.adminUsersTable.appendChild(row);
        });
      }

      // --- JOB NOTIFICATIONS BLOG TABLE CRUD ---
      async function loadAdminNotificationsTable() {
        const tbody = document.getElementById('admin-notifications-table-body');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Loading published posts...</td></tr>';
        
        const notifications = await Engine.getNotificationsAsync();
        tbody.innerHTML = '';
        
        if (notifications.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No job announcements published yet.</td></tr>';
          return;
        }
        
        notifications.forEach(notif => {
          const row = document.createElement('tr');
          const dateStr = new Date(notif.created_at).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
          row.innerHTML = `
            <td><strong>${notif.title}</strong></td>
            <td style="color: var(--text-muted); font-family: monospace;">/${notif.slug}</td>
            <td>${dateStr}</td>
            <td>
              <button class="btn btn-secondary btn-sm delete-btn" data-id="${notif.id}" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; border-color: var(--brand-danger); color: var(--brand-danger);">
                Delete
              </button>
            </td>
          `;
          
          row.querySelector('.delete-btn').addEventListener('click', async (e) => {
            const id = Number(e.target.dataset.id);
            if (confirm('Are you sure you want to delete this notification? This action is permanent.')) {
              const deleted = await Engine.deleteNotificationAsync(id);
              if (deleted) {
                loadAdminNotificationsTable();
              }
            }
          });
          tbody.appendChild(row);
        });
      }

      // Slug Auto-Formatter on keypress
      const titleInput = document.getElementById('notif-title');
      const slugInput = document.getElementById('notif-slug');
      if (titleInput && slugInput) {
        titleInput.addEventListener('input', (e) => {
          const title = e.target.value;
          const slug = title.toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-');
          slugInput.value = slug;
        });

        slugInput.addEventListener('input', (e) => {
          e.target.value = e.target.value.toLowerCase()
            .replace(/[^a-z0-9-]/g, '');
        });
      }

      // Meta Character Counters with visual guidelines recommendations
      const metaTitleInput = document.getElementById('notif-meta-title');
      const metaTitleCounter = document.getElementById('meta-title-counter');
      if (metaTitleInput && metaTitleCounter) {
        metaTitleInput.addEventListener('input', () => {
          const len = metaTitleInput.value.length;
          metaTitleCounter.textContent = `(${len} / 60)${len >= 50 && len <= 60 ? ' ✓ Recommended' : ''}`;
          metaTitleCounter.style.color = (len >= 50 && len <= 60) ? 'var(--brand-success)' : 'var(--text-muted)';
        });
      }

      const metaDescInput = document.getElementById('notif-meta-desc');
      const metaDescCounter = document.getElementById('meta-desc-counter');
      if (metaDescInput && metaDescCounter) {
        metaDescInput.addEventListener('input', () => {
          const len = metaDescInput.value.length;
          metaDescCounter.textContent = `(${len} / 160)${len >= 140 && len <= 160 ? ' ✓ Recommended' : ''}`;
          metaDescCounter.style.color = (len >= 140 && len <= 160) ? 'var(--brand-success)' : 'var(--text-muted)';
        });
      }

      // Schema Template Generator
      const schemaTemplateBtn = document.getElementById('btn-generate-schema-template');
      if (schemaTemplateBtn) {
        schemaTemplateBtn.addEventListener('click', () => {
          const title = (titleInput ? titleInput.value.trim() : '') || 'Job Position Title';
          const desc = (metaDescInput ? metaDescInput.value.trim() : '') || 'Detailed recruitment description...';
          const schema = {
            "@context": "https://schema.org/",
            "@type": "JobPosting",
            "title": title,
            "description": desc,
            "hiringOrganization": {
              "@type": "Organization",
              "name": "ExamPulse Government Board Recruitment",
              "sameAs": window.location.origin
            },
            "industry": "Government Sector",
            "employmentType": "FULL_TIME",
            "workHours": "40 hours per week",
            "datePosted": new Date().toISOString().split('T')[0],
            "jobLocation": {
              "@type": "Place",
              "address": {
                "@type": "PostalAddress",
                "addressCountry": "IN"
              }
            }
          };
          document.getElementById('notif-schema').value = JSON.stringify(schema, null, 2);
        });
      }

      // Publish notification form submission handler
      const addNotifForm = document.getElementById('admin-add-notification-form');
      if (addNotifForm) {
        addNotifForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(addNotifForm);
          const notifData = {};
          fd.forEach((val, key) => { notifData[key] = val; });
          
          if (notifData.schema_markup) {
            try {
              JSON.parse(notifData.schema_markup);
            } catch (err) {
              alert('Invalid JSON in Structured Schema Markup. Please correct or leave blank.');
              return;
            }
          }
          
          const res = await Engine.addNotificationAsync(notifData);
          if (res.success) {
            alert('Job Notification published successfully!');
            addNotifForm.reset();
            if (metaTitleCounter) {
              metaTitleCounter.textContent = '(0 / 60)';
              metaTitleCounter.style.color = 'var(--text-muted)';
            }
            if (metaDescCounter) {
              metaDescCounter.textContent = '(0 / 160)';
              metaDescCounter.style.color = 'var(--text-muted)';
            }
            loadAdminNotificationsTable();
          } else {
            alert('Error publishing: ' + res.error);
          }
        });
      }

      // Add verified question form submit
      els.adminAddForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(els.adminAddForm);
        const qData = {};
        fd.forEach((val, key) => { qData[key] = val; });

        Engine.addNewQuestion(qData);
        alert('Question added successfully to shared memory bank!');
        els.adminAddForm.reset();
      });

      // Bulk Upload parse & submit
      els.adminBulkBtn.addEventListener('click', () => {
        const text = els.adminBulkInput.value.trim();
        if (text) {
          const res = Engine.bulkUploadQuestions(text);
          if (res.success) {
            alert(`Parsed successfully. Loaded ${res.count} custom questions to the shared database!`);
            els.adminBulkInput.value = '';
            activeAdminSubView = 'stats';
            updateAdminDashboard();
          } else {
            alert(`Failed parsing: ${res.error}`);
          }
        }
      });

      // Init dashboard load
      updateAdminDashboard();
    });
