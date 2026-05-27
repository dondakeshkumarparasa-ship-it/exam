document.addEventListener('DOMContentLoaded', () => {
      // Initialize state
      window.ExamPulse.init();
      const Engine = window.ExamPulse;
      
      // DOM Elements Cache
      const els = {
        views: document.querySelectorAll('.view-section'),
        navLinks: document.querySelectorAll('.nav-links .nav-link'),
        logo: document.getElementById('header-logo'),
        profileMenuBtn: document.getElementById('profile-menu-btn'),
        profileMenuOverlay: document.getElementById('profile-menu-overlay'),
        profileMenuCloseBtn: document.getElementById('profile-menu-close-btn'),
        submenuAvatar: document.getElementById('submenu-avatar'),
        submenuUsername: document.getElementById('submenu-username'),
        submenuEmail: document.getElementById('submenu-email'),
        submenuStatsGrid: document.getElementById('submenu-stats-grid'),
        btnSubmenuEditProfile: document.getElementById('btn-submenu-edit-profile'),
        btnSubmenuLogout: document.getElementById('btn-submenu-logout'),
        bottomNavItems: document.querySelectorAll('.mobile-bottom-nav-item'),
        logoutBtn: document.getElementById('header-logout-btn'),
        userWidget: document.getElementById('header-user-widget'),
        usernameVal: document.getElementById('header-username'),
        authOverlay: document.getElementById('auth-modal-overlay'),
        authTabRegisterBtn: document.getElementById('btn-tab-register'),
        authTabLoginBtn: document.getElementById('btn-tab-login'),
        authRegisterForm: document.getElementById('auth-register-form'),
        authLoginForm: document.getElementById('auth-login-form'),
        authGateTitle: document.getElementById('auth-gate-title'),
        authGateSub: document.getElementById('auth-gate-sub'),
        practiceCategories: document.getElementById('practice-category-list'),
        practiceMobileSlider: document.getElementById('practice-mobile-category-slider'),
        practiceCardBox: document.getElementById('practice-card-box'),
        practiceDifficulty: document.getElementById('practice-badge-difficulty'),
        practiceSource: document.getElementById('practice-source-text'),
        practiceBookmark: document.getElementById('practice-bookmark-btn'),
        practiceQuestion: document.getElementById('practice-question-text'),
        practiceOptions: document.getElementById('practice-options-grid'),
        practiceExplanationColumn: document.getElementById('practice-explanation-column'),
        practiceExplanationText: document.getElementById('practice-explanation-text'),
        practiceConcept: document.getElementById('practice-highlight-concept'),
        practiceShortcut: document.getElementById('practice-highlight-shortcut'),
        practiceTakeaway: document.getElementById('practice-highlight-takeaway'),
        practiceNextBtn: document.getElementById('practice-next-btn'),
        telemetryTray: document.getElementById('telemetry-tray'),
        telemetryHeader: document.getElementById('telemetry-header'),
        telemetryIndicator: document.getElementById('telemetry-indicator'),
        telemetryConsole: document.getElementById('telemetry-console'),
        telemetryRedisSize: document.getElementById('telemetry-redis-size'),
        asideAvatar: document.getElementById('aside-avatar'),
        asideUsername: document.getElementById('aside-username'),
        asideAnswered: document.getElementById('aside-total-answered'),
        asideAccuracy: document.getElementById('aside-accuracy'),
        asideTime: document.getElementById('aside-study-time'),
        analyticsFilters: document.querySelectorAll('.analytics-filter-options .filter-btn'),
        bookmarksCardsWrapper: document.getElementById('bookmarks-cards-wrapper'),
        notificationsCardsWrapper: document.getElementById('notifications-cards-wrapper'),
        faqQuestions: document.querySelectorAll('.faq-question')
      };

      let currentActiveView = 'practice'; // Landing directly on Start (Practice) view
      let activeAnalyticsFilter = '1Week';
      let authModalActiveTab = 'register';
      let questionAnswered = false; // Strict option lockout state flag

      // --- SPA Routing ---
      function switchView(viewName) {
        currentActiveView = viewName;
        els.views.forEach(view => {
          view.classList.remove('active');
          if (view.id === `view-${viewName}`) view.classList.add('active');
        });

        // Sync Desktop Nav active classes
        els.navLinks.forEach(link => {
          link.classList.remove('active');
          if (link.dataset.view === viewName) link.classList.add('active');
        });

        // Sync Mobile Bottom Nav active classes
        els.bottomNavItems.forEach(item => {
          item.classList.remove('active');
          if (item.dataset.view === viewName) item.classList.add('active');
        });

        if (viewName === 'practice') {
          renderPracticeQuestion();
          restoreDefaultSeoHeaders();
        } else if (viewName === 'analytics') {
          updateProfileSidebar();
          Engine.renderAccuracyTrendLine('svg-accuracy-chart', activeAnalyticsFilter);
          Engine.renderCategoryDashboard('analytics-category-bars');
          restoreDefaultSeoHeaders();
        } else if (viewName === 'bookmarks') {
          updateBookmarksView();
          restoreDefaultSeoHeaders();
        } else if (viewName === 'notifications') {
          // Reset notifications back to list view
          document.getElementById('notification-detail-container').style.display = 'none';
          document.getElementById('notifications-list-container').style.display = 'block';
          restoreDefaultSeoHeaders();
          updateNotificationsView();
        }

        window.scrollTo(0, 0);
      }

      els.navLinks.forEach(link => {
        link.addEventListener('click', () => {
          switchView(link.dataset.view);
        });
      });

      els.bottomNavItems.forEach(item => {
        item.addEventListener('click', () => {
          switchView(item.dataset.view);
        });
      });

      els.logo.addEventListener('click', (e) => {
        e.preventDefault();
        switchView('practice');
      });

      // --- Profile Menu Dropdown Trigger (Replaces Hamburger) ---
      els.profileMenuBtn.addEventListener('click', () => {
        renderSubmenuStats();
        els.profileMenuOverlay.classList.add('active');
      });

      els.profileMenuCloseBtn.addEventListener('click', () => {
        els.profileMenuOverlay.classList.remove('active');
      });

      els.profileMenuOverlay.addEventListener('click', (e) => {
        if (e.target === els.profileMenuOverlay) {
          els.profileMenuOverlay.classList.remove('active');
        }
      });



      // --- Gated Register / Login Popup overlay (Auth) ---
      function openGatedAuthPopup(mode = 'register', blockMessage = false) {
        authModalActiveTab = mode;
        
        // Setup toggle buttons
        if (mode === 'register') {
          els.authTabRegisterBtn.classList.add('active');
          els.authTabLoginBtn.classList.remove('active');
          els.authRegisterForm.classList.add('active');
          els.authLoginForm.classList.remove('active');
        } else {
          els.authTabRegisterBtn.classList.remove('active');
          els.authTabLoginBtn.classList.add('active');
          els.authRegisterForm.classList.remove('active');
          els.authLoginForm.classList.add('active');
        }

        if (blockMessage) {
          els.authGateTitle.textContent = "Save Practice Progress";
          els.authGateSub.textContent = "You have answered 10 government exam questions as a guest candidate! Save your profile locally to keep stats, revisions, and bookmarks synced.";
        } else {
          els.authGateTitle.textContent = "Join ExamPulse AI";
          els.authGateSub.textContent = "Create a secure administrative local profile on your browser in seconds to unlock full revisions.";
        }

        els.authOverlay.classList.add('active');
      }

      // Modal tabs clicks
      els.authTabRegisterBtn.addEventListener('click', () => {
        openGatedAuthPopup('register');
      });

      els.authTabLoginBtn.addEventListener('click', () => {
        openGatedAuthPopup('login');
      });

      // Close modal click safety. If answered questions >= 10, guest is locked out and modal cannot be closed!
      els.authOverlay.addEventListener('click', (e) => {
        if (e.target === els.authOverlay) {
          const guestAttempts = Object.keys(Engine.state.history).length;
          if (!Engine.state.user && guestAttempts >= 10) {
            // Trigger a beautiful, premium visual shake animation on the card
            const modalEl = els.authOverlay.querySelector('.auth-modal');
            if (modalEl) {
              modalEl.classList.remove('shake');
              void modalEl.offsetWidth; // trigger reflow
              modalEl.classList.add('shake');
            }
          } else {
            els.authOverlay.classList.remove('active');
          }
        }
      });

      // Register Submit Form
      document.getElementById('auth-register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('reg-name').value.trim();
        const username = document.getElementById('reg-username').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value.trim();

        if (username && email && password) {
          const success = await Engine.registerLive(name, username, email, password);
          if (success) {
            updateHeaderWidget();
            els.authOverlay.classList.remove('active');
            switchView('practice');
          }
        }
      });

      // Login Submit Form
      document.getElementById('auth-login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value.trim();

        if (email && password) {
          const success = await Engine.loginLive(email, password);
          if (success) {
            updateHeaderWidget();
            els.authOverlay.classList.remove('active');
            switchView('practice');
          }
        }
      });

      els.logoutBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to logout? All local state progress will remain cached.')) {
          Engine.logout();
          updateHeaderWidget();
          window.location.reload();
        }
      });

      els.btnSubmenuLogout.addEventListener('click', () => {
        if (confirm('Are you sure you want to logout? All local state progress will remain cached.')) {
          Engine.logout();
          updateHeaderWidget();
          window.location.reload();
        }
      });

      els.btnSubmenuEditProfile.addEventListener('click', () => {
        els.profileMenuOverlay.classList.remove('active');
        if (Engine.state.user) {
          document.getElementById('edit-profile-name').value = Engine.state.user.name || Engine.state.user.username;
          document.getElementById('edit-profile-username').value = Engine.state.user.username;
          document.getElementById('edit-profile-email').value = Engine.state.user.email || '';
          profileModal.classList.add('active');
        } else {
          openGatedAuthPopup('register');
        }
      });

      // --- PROFILE EDIT SETTINGS TRIGGERS ---
      const profileModal = document.getElementById('profile-modal-overlay');
      const profileTrigger = document.getElementById('btn-edit-profile-trigger');
      const profileCancel = document.getElementById('btn-profile-edit-cancel');
      const profileForm = document.getElementById('profile-edit-form');

      if (profileTrigger && profileModal) {
        profileTrigger.addEventListener('click', () => {
          if (Engine.state.user) {
            document.getElementById('edit-profile-name').value = Engine.state.user.name || Engine.state.user.username;
            document.getElementById('edit-profile-username').value = Engine.state.user.username;
            document.getElementById('edit-profile-email').value = Engine.state.user.email || '';
            profileModal.classList.add('active');
          }
        });
      }

      if (profileCancel && profileModal) {
        profileCancel.addEventListener('click', () => {
          profileModal.classList.remove('active');
        });
        profileModal.addEventListener('click', (e) => {
          if (e.target === profileModal) {
            profileModal.classList.remove('active');
          }
        });
      }

      if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (Engine.state.user) {
            const name = document.getElementById('edit-profile-name').value.trim();
            const username = document.getElementById('edit-profile-username').value.trim();
            const email = document.getElementById('edit-profile-email').value.trim();

            if (name && username && email) {
              Engine.state.user.name = name;
              Engine.state.user.username = username;
              Engine.state.user.email = email;

              // Save and Sync back live in background
              localStorage.setItem('exampulse_state_degamified', JSON.stringify(Engine.state));
              await Engine.syncLiveDatabase();

              updateProfileSidebar();
              updateHeaderWidget();
              profileModal.classList.remove('active');
            }
          }
        });
      }

      function updateHeaderWidget() {
        if (Engine.state.user) {
          // Desktop Status Widget
          els.userWidget.style.display = 'flex';
          els.usernameVal.textContent = Engine.state.user.username;

          // Profile Submenu Status Info
          els.submenuUsername.textContent = Engine.state.user.name || Engine.state.user.username;
          els.submenuEmail.textContent = Engine.state.user.email || 'candidate@exampulse.ai';
          els.submenuAvatar.textContent = (Engine.state.user.name || Engine.state.user.username)[0].toUpperCase();
        } else {
          els.userWidget.style.display = 'none';
          
          els.submenuUsername.textContent = 'Guest Candidate';
          els.submenuEmail.textContent = 'candidate@exampulse.ai';
          els.submenuAvatar.textContent = '👤';
        }
      }

      // Check user session
      updateHeaderWidget();

      // --- Subject Categories Switchers ---
      els.practiceCategories.querySelectorAll('.category-item-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          syncActiveCategorySelection(btn.dataset.category);
          renderPracticeQuestion();
        });
      });

      els.practiceMobileSlider.querySelectorAll('.mobile-slider-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          syncActiveCategorySelection(btn.dataset.category);
          renderPracticeQuestion();
        });
      });

      function syncActiveCategorySelection(category) {
        Engine.setActiveCategory(category);

        els.practiceCategories.querySelectorAll('.category-item-btn').forEach(b => {
          b.classList.remove('active');
          if (b.dataset.category === category) b.classList.add('active');
        });

        els.practiceMobileSlider.querySelectorAll('.mobile-slider-btn').forEach(b => {
          b.classList.remove('active');
          if (b.dataset.category === category) b.classList.add('active');
        });
      }

      // --- PRACTICE CARD ENGINE ---
      async function renderPracticeQuestion() {
        // Safe check: If guest has answered 10 questions, block screen and force register/login modal popup!
        const guestAttempts = Object.keys(Engine.state.history).length;
        if (!Engine.state.user && guestAttempts >= 10) {
          els.practiceQuestion.innerHTML = `<h3 style="color: var(--brand-warning); text-align: center;">Practice Limit Reached</h3><p style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500; margin-top: 0.5rem; text-align: center;">Please register or sign in to save your stats and continue practicing immediately.</p>`;
          els.practiceOptions.innerHTML = '';
          els.practiceExplanationColumn.classList.remove('active');
          els.practiceNextBtn.style.display = 'none';
          openGatedAuthPopup('login', true); // Open LOGIN modal popup centered
          return;
        }

        els.practiceCardBox.className = 'practice-card-box';
        els.practiceExplanationColumn.classList.remove('active');
        els.practiceNextBtn.style.display = 'none';
        questionAnswered = false; // Reset question lock state

        // Display a sleek visual AI loading indicator
        els.practiceQuestion.innerHTML = `<div class="live-ai-loading-glow">⚡ Generating live PYQ from Google Gemini API...</div>`;
        els.practiceOptions.innerHTML = '';

        const q = await Engine.loadNextQuestionAsync();
        if (!q) {
          els.practiceQuestion.innerHTML = `<h3>Subject Pool Empty</h3><p style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500; margin-top: 0.5rem;">Please load custom questions inside the Administrative portal (admin.html).</p>`;
          els.practiceOptions.innerHTML = '';
          return;
        }

        // --- DYNAMIC FONT AUTOSCALER ENGINE ---
        // automatically minimize letter sizes when text descriptions are highly dense
        const qText = q.question;
        if (qText.length > 250) {
          els.practiceQuestion.style.fontSize = '0.78rem';
          els.practiceQuestion.style.lineHeight = '1.25';
        } else if (qText.length > 150) {
          els.practiceQuestion.style.fontSize = '0.88rem';
          els.practiceQuestion.style.lineHeight = '1.3';
        } else {
          els.practiceQuestion.style.fontSize = '1.1rem';
          els.practiceQuestion.style.lineHeight = '1.4';
        }

        els.practiceDifficulty.className = `badge badge-${q.difficulty.toLowerCase()}`;
        els.practiceDifficulty.textContent = q.difficulty;
        els.practiceSource.textContent = q.source;

        els.practiceBookmark.className = Engine.isQuestionBookmarked(q.id) ? 'q-action-icon-btn bookmarked' : 'q-action-icon-btn';

        els.practiceQuestion.textContent = q.question;
        els.practiceOptions.innerHTML = '';

        q.options.forEach((opt, idx) => {
          const prefix = ['A', 'B', 'C', 'D'][idx];
          const btn = document.createElement('button');
          btn.className = 'option-choice-btn';
          btn.dataset.idx = idx;
          btn.innerHTML = `
            <span class="option-prefix-bubble">${prefix}</span>
            <span class="option-text">${opt}</span>
          `;
          
          btn.addEventListener('click', () => {
            // Safe guard: Click will be ignored in any case if already locked
            if (questionAnswered || btn.classList.contains('locked')) return;
            questionAnswered = true;

            // Strict lock options: No changing once answered
            const allBtns = els.practiceOptions.querySelectorAll('.option-choice-btn');
            allBtns.forEach(b => {
              b.classList.add('locked', 'disabled');
            });

            const feedback = Engine.submitAnswer(idx);
            
            if (feedback.isCorrect) {
              btn.classList.remove('disabled');
              btn.classList.add('selected-correct');
              els.practiceCardBox.classList.add('correct-pulse');
              els.practiceNextBtn.style.display = 'block';
              loadRAGExplanationDrawer(feedback);
            } else {
              btn.classList.remove('disabled');
              btn.classList.add('selected-wrong');
              els.practiceCardBox.classList.add('shake', 'wrong-pulse');
              
              const correctBtn = els.practiceOptions.querySelector(`[data-idx="${feedback.correctIndex}"]`);
              if (correctBtn) {
                correctBtn.classList.remove('disabled');
                correctBtn.classList.add('should-have-been');
              }
              els.practiceNextBtn.style.display = 'block';
              loadRAGExplanationDrawer(feedback);
            }

            // Immediately check guest limits after answering the 10th question
            const guestAttempts = Object.keys(Engine.state.history).length;
            if (!Engine.state.user && guestAttempts >= 10) {
              // Lockout: Hide Next Question button
              els.practiceNextBtn.style.display = 'none';
              // Open the LOGIN page pop up centered after a short delay
              setTimeout(() => {
                openGatedAuthPopup('login', true);
              }, 1200);
            }
          });

          els.practiceOptions.appendChild(btn);
        });
      }

      function loadRAGExplanationDrawer(feedback) {
        const expText = feedback.explanation;
        
        // --- DYNAMIC FONT AUTOSCALER (Solution Explanations) ---
        if (expText.length > 300) {
          els.practiceExplanationText.style.fontSize = '0.74rem';
          els.practiceExplanationText.style.lineHeight = '1.3';
        } else if (expText.length > 150) {
          els.practiceExplanationText.style.fontSize = '0.82rem';
          els.practiceExplanationText.style.lineHeight = '1.35';
        } else {
          els.practiceExplanationText.style.fontSize = '0.9rem';
          els.practiceExplanationText.style.lineHeight = '1.45';
        }

        els.practiceExplanationText.textContent = feedback.explanation;
        els.practiceConcept.textContent = feedback.concept || 'General Concept';
        els.practiceShortcut.textContent = feedback.shortcut || 'No Shortcut (Standard Method)';
        els.practiceTakeaway.textContent = feedback.takeaway || 'Core takeaway details.';
        
        // Show solution drawer
        els.practiceExplanationColumn.classList.add('active');
      }

      els.practiceNextBtn.addEventListener('click', () => {
        renderPracticeQuestion();
      });

      // Bookmark
      els.practiceBookmark.addEventListener('click', () => {
        const q = Engine.getActiveQuestion();
        if (q) {
          const isAdded = Engine.toggleBookmarkActive(q.id);
          els.practiceBookmark.className = isAdded ? 'q-action-icon-btn bookmarked' : 'q-action-icon-btn';
        }
      });

      // --- STATS VIEW (De-Gamified) ---
      function updateProfileSidebar() {
        if (Engine.state.user) {
          els.asideAvatar.textContent = Engine.state.user.username[0].toUpperCase();
          els.asideUsername.textContent = Engine.state.user.username;
          
          els.asideAnswered.textContent = Engine.state.stats.totalAnswered;
          
          const correctEl = document.getElementById('aside-total-correct');
          const incorrectEl = document.getElementById('aside-total-incorrect');
          if (correctEl) correctEl.textContent = Engine.state.stats.totalCorrect || 0;
          if (incorrectEl) incorrectEl.textContent = Engine.state.stats.totalIncorrect || 0;
          
          els.asideAccuracy.textContent = `${Engine.state.stats.accuracy}%`;
          
          const mins = Math.round(Engine.state.stats.studyTime / 60);
          els.asideTime.textContent = `${mins}m`;
        }
      }

      els.analyticsFilters.forEach(btn => {
        btn.addEventListener('click', () => {
          els.analyticsFilters.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          activeAnalyticsFilter = btn.dataset.range;
          Engine.renderAccuracyTrendLine('svg-accuracy-chart', activeAnalyticsFilter);
        });
      });

      // --- BOOKMARKS VIEW ---
      function updateBookmarksView() {
        const db = [...window.ExamPulseData.questions, ...Engine.state.customQuestions];
        els.bookmarksCardsWrapper.innerHTML = '';

        const savedIds = [...(Engine.state.bookmarks || [])].reverse();
        const savedQuestions = savedIds
          .map(id => db.find(q => q.id === id))
          .filter(q => q !== undefined);

        if (savedQuestions.length === 0) {
          els.bookmarksCardsWrapper.innerHTML = `
            <div class="empty-state-notice">
              <h3>No bookmarks saved</h3>
              <p>Bookmark questions during practice to review their solutions and shortcuts here.</p>
            </div>
          `;
          return;
        }

        savedQuestions.forEach(q => {
          const card = document.createElement('div');
          card.className = 'bookmark-card-item';
          card.style.cursor = 'pointer';
          card.innerHTML = `
            <div class="bookmark-card-meta">
              <span class="badge badge-${q.difficulty.toLowerCase()}">${q.difficulty}</span>
              <span class="badge badge-easy" style="background: rgba(16,185,129,0.05); color: var(--brand-primary);">${q.category}</span>
              <button class="btn btn-secondary btn-sm remove-bookmark-btn" data-id="${q.id}">Remove</button>
            </div>
            <div class="bookmark-card-question">${q.question}</div>
            <button class="btn btn-secondary btn-sm toggle-solution-btn" style="margin-top: 0.5rem; width: 100%; border-radius: 6px; font-size: 0.75rem;">Show Answer & Solution</button>
            <div class="bookmark-card-explanation" style="display: none; margin-top: 1rem;">
              <strong>Correct Answer:</strong> ${q.options[q.correctOptionIndex]}<br><br>
              <strong>Solution Explanation:</strong> ${q.explanation}<br><br>
              ${q.shortcut ? `<strong>Shortcut:</strong> ${q.shortcut}<br>` : ''}
              <strong>Source Exam:</strong> ${q.source}
            </div>
          `;

          card.querySelector('.remove-bookmark-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            Engine.toggleBookmarkActive(q.id);
            updateBookmarksView();
          });

          card.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-bookmark-btn')) return;
            const expDiv = card.querySelector('.bookmark-card-explanation');
            const toggleBtn = card.querySelector('.toggle-solution-btn');
            
            if (expDiv.style.display === 'none') {
              expDiv.style.display = 'block';
              if (toggleBtn) {
                toggleBtn.textContent = 'Hide Answer & Solution';
                toggleBtn.classList.remove('btn-secondary');
                toggleBtn.classList.add('btn-primary');
              }
            } else {
              expDiv.style.display = 'none';
              if (toggleBtn) {
                toggleBtn.textContent = 'Show Answer & Solution';
                toggleBtn.classList.remove('btn-primary');
                toggleBtn.classList.add('btn-secondary');
              }
            }
          });

          els.bookmarksCardsWrapper.appendChild(card);
        });
      }

      // --- SUB-MENU TELEMETRY PROGRESS METRICS ---
      function renderSubmenuStats() {
        const stats = Engine.getProgressStats();
        const statsGrid = els.submenuStatsGrid;
        if (!statsGrid) return;
        
        statsGrid.innerHTML = '';
        
        const periods = [
          { key: '1Day', label: '1 Day (24h)' },
          { key: '2Days', label: '2 Days (48h)' },
          { key: '1Week', label: '1 Week (7d)' },
          { key: '1Month', label: '1 Month (30d)' }
        ];
        
        periods.forEach(p => {
          const data = stats[p.key];
          const acc = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
          
          const card = document.createElement('div');
          card.className = 'submenu-stat-period-card';
          card.innerHTML = `
            <div class="period-card-header">
              <span class="period-label">${p.label}</span>
              <span class="period-accuracy" style="color: ${data.total > 0 ? 'var(--brand-primary)' : 'var(--text-muted)'}; font-weight:700;">
                ${data.total > 0 ? acc + '% Acc' : 'No attempts'}
              </span>
            </div>
            <div class="period-card-metrics">
              <span class="metric-item">Q: <strong>${data.total}</strong></span>
              <span class="metric-item corr">C: <strong>${data.correct}</strong></span>
              <span class="metric-item incorr">I: <strong>${data.incorrect}</strong></span>
            </div>
            <div class="period-card-progress-track">
              <div class="period-card-progress-fill" style="width: ${acc}%"></div>
            </div>
          `;
          statsGrid.appendChild(card);
        });
      }

      // --- JOB NOTIFICATIONS FEED ENGINE ---
      const defaultTitle = document.title;
      let activeExpandedNotification = null;

      async function updateNotificationsView() {
        els.notificationsCardsWrapper.innerHTML = '<div class="live-ai-loading-glow" style="padding: 1.5rem 1rem;">⚡ Loading verified job notices...</div>';
        
        const notifications = await Engine.getNotificationsAsync();
        els.notificationsCardsWrapper.innerHTML = '';
        
        if (notifications.length === 0) {
          els.notificationsCardsWrapper.innerHTML = `
            <div class="empty-state-notice">
              <h3>No announcements published</h3>
              <p>Check back later for verified public job postings and notifications.</p>
            </div>
          `;
          return;
        }
        
        notifications.forEach(notif => {
          const card = document.createElement('div');
          card.className = 'notification-blog-card';
          const dateStr = new Date(notif.created_at).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
          card.innerHTML = `
            <div class="blog-card-header">
              <span class="badge badge-easy" style="background: rgba(16, 185, 129, 0.05); color: var(--brand-primary); font-size: 0.65rem;">Job Notice</span>
              <span class="blog-card-date">${dateStr}</span>
            </div>
            <h3 class="blog-card-title">${notif.title}</h3>
            <p class="blog-card-excerpt">${notif.content.replace(/<[^>]*>/g, '').substring(0, 140)}...</p>
            <button class="btn btn-secondary btn-sm read-more-btn" style="margin-top: 1rem; width: 100%; border-radius: 6px; font-size: 0.75rem;">
              Read Full Post & Check SEO ➔
            </button>
          `;
          
          card.querySelector('.read-more-btn').addEventListener('click', () => {
            expandNotificationDetail(notif);
          });
          els.notificationsCardsWrapper.appendChild(card);
        });
      }

      function expandNotificationDetail(notif) {
        activeExpandedNotification = notif;
        
        // Hide list, show details
        document.getElementById('notifications-list-container').style.display = 'none';
        const detailContainer = document.getElementById('notification-detail-container');
        detailContainer.style.display = 'block';
        
        // Populate content
        document.getElementById('blog-title').textContent = notif.title;
        const dateStr = new Date(notif.created_at).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        document.getElementById('blog-date').textContent = dateStr;
        document.getElementById('blog-content').innerHTML = notif.content;
        
        // SEO overrides
        const seoTitle = notif.meta_title || (notif.title + " | ExamPulse AI");
        const seoDesc = notif.meta_description || notif.content.replace(/<[^>]*>/g, '').substring(0, 155);
        const seoKeywords = notif.meta_keywords || "government jobs, competitive exams";
        
        document.title = seoTitle;
        updateMetaDescription(seoDesc);
        
        // Populate SEO metrics panel
        document.getElementById('seo-keywords').textContent = seoKeywords;
        document.getElementById('active-doc-title').textContent = document.title;
        document.getElementById('active-meta-desc').textContent = seoDesc;
        
        // Structured JSON-LD schema preview
        const previewPre = document.getElementById('json-ld-preview');
        let schemaObj = null;
        if (notif.schema_markup) {
          try {
            schemaObj = JSON.parse(notif.schema_markup);
          } catch(err) {
            schemaObj = null;
          }
        }
        
        if (!schemaObj) {
          // Generate default on-the-fly JobPosting schema if blank
          schemaObj = {
            "@context": "https://schema.org/",
            "@type": "JobPosting",
            "title": notif.title,
            "description": seoDesc,
            "datePosted": notif.created_at.split('T')[0],
            "hiringOrganization": {
              "@type": "Organization",
              "name": "ExamPulse AI Platform Recruiter"
            }
          };
        }
        previewPre.textContent = JSON.stringify(schemaObj, null, 2);
        
        // Dynamically inject the schema script to document head
        removeActiveJsonLdScript();
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = 'active-json-ld-schema';
        script.textContent = JSON.stringify(schemaObj);
        document.head.appendChild(script);
        
        window.scrollTo(0, 0);
      }

      function removeActiveJsonLdScript() {
        const existing = document.getElementById('active-json-ld-schema');
        if (existing) existing.remove();
      }

      function restoreDefaultSeoHeaders() {
        document.title = defaultTitle;
        updateMetaDescription("ExamPulse AI - One Question. Every Second. Continuous Government Exam practice platform.");
        removeActiveJsonLdScript();
      }

      function updateMetaDescription(descriptionText) {
        let metaDesc = document.querySelector('meta[name="description"]');
        if (!metaDesc) {
          metaDesc = document.createElement('meta');
          metaDesc.setAttribute('name', 'description');
          document.head.appendChild(metaDesc);
        }
        metaDesc.setAttribute('content', descriptionText);
      }

      document.getElementById('btn-back-to-notifications').addEventListener('click', () => {
        restoreDefaultSeoHeaders();
        document.getElementById('notification-detail-container').style.display = 'none';
        document.getElementById('notifications-list-container').style.display = 'block';
        activeExpandedNotification = null;
      });

      // --- ADMINISTRATIVE SUSPENSION CHECKS ---
      function checkUserSuspension() {
        const overlay = document.getElementById('suspension-overlay');
        if (overlay) {
          if (Engine.state.user && Engine.state.user.suspended === true) {
            overlay.style.display = 'flex';
          } else {
            overlay.style.display = 'none';
          }
        }
      }

      // Initial startup triggers
      checkUserSuspension();
      switchView('practice'); // Default load goes directly to Start (Practice) view

      // Hook storage event tab syncs
      window.addEventListener('storage', (e) => {
        if (e.key === 'exampulse_state_degamified') {
          Engine.init();
          checkUserSuspension();
          updateHeaderWidget();
          if (currentActiveView === 'practice') {
            renderPracticeQuestion();
          }
        }
      });

      // --- CLOUD TELEMETRY ---
      els.telemetryHeader.addEventListener('click', () => {
        els.telemetryTray.classList.toggle('expanded');
        els.telemetryIndicator.textContent = els.telemetryTray.classList.contains('expanded') ? '▼ COLLAPSE' : '▲ EXPAND';
      });

      window.addEventListener('exampulse_log', (e) => {
        const d = e.detail;
        const line = document.createElement('div');
        line.className = 'terminal-line';
        
        let tagClass = d.type === 'redis' ? 'tag-redis' : 'tag-rag';
        let tagLabel = d.type === 'redis' ? '[REDIS QUEUE]' : '[RAG EMBED]';

        line.innerHTML = `<span class="ts">[${d.ts}]</span> <span class="${tagClass}">${tagLabel}</span> ${d.text}`;
        els.telemetryConsole.appendChild(line);

        els.telemetryConsole.scrollTop = els.telemetryConsole.scrollHeight;
        els.telemetryRedisSize.textContent = Math.floor(400 + Math.random() * 80);
      });

    });
