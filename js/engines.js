/* ==========================================================================
   ExamPulse AI - Core Application Engines & Simulators (De-Gamified)
   ========================================================================== */

window.ExamPulse = (function() {
  // --- Core State Model (No Gamification / Paid Plans) ---
  const DEFAULT_STATE = {
    user: null, // If null, user is on Landing page. Otherwise { username, email, active: true }
    stats: {
      totalAnswered: 0,
      totalCorrect: 0,
      totalIncorrect: 0,
      accuracy: 0,
      avgResponseTime: 0, // in seconds
      studyTime: 0 // in seconds
    },
    history: {}, // qid -> { timestamp, result (true/false), responseTime, selectedIdx }
    bookmarks: [], // array of qids
    revisions: [], // array of { qid, nextReviewTimestamp, intervalLevel }
    customQuestions: [], // array of user-added questions
    notifications: [] // array of SEO job blog notifications
  };

  let state = { ...DEFAULT_STATE };

  // --- Mock Databases ---
  // Mock Concurrent Users for Redis telemetry (No XP / streaks)
  const virtualUsers = [
    { name: 'Priya Sharma', category: 'civils (prelims)', qid: null },
    { name: 'Amit Patel', category: 'ssc', qid: null },
    { name: 'Rohan Singh', category: 'rrb', qid: null },
    { name: 'Deepika K.', category: 'appsc', qid: null },
    { name: 'Vivek Roy', category: 'tgpsc', qid: null }
  ];

  // Mock Admin Dashboard Stats
  const adminStats = {
    activeUsers: 14205,
    totalAnsweredGlobal: 1205842,
    todayRevenue: 0, // No paid plans
    categoryPopularity: {
      'civils (prelims)': 9,
      'ssc': 11,
      'rrb': 3,
      'appsc': 2,
      'tgpsc': 2
    }
  };

  // --- Initializer & LocalStorage Managers ---
  function init() {
    loadStateFromStorage();
    setupTelemetrySimulation();
    startStudyTimer();
    console.log('ExamPulse Engine initialized in de-gamified pure academic mode.');
  }

  function loadStateFromStorage() {
    const stored = localStorage.getItem('exampulse_state_degamified');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Clear current keys to keep references in-place
        for (const key in state) {
          if (state.hasOwnProperty(key)) delete state[key];
        }
        Object.assign(state, parsed);
        // Ensure default structures exist
        state.customQuestions = state.customQuestions || [];
        state.revisions = state.revisions || [];
        state.bookmarks = state.bookmarks || [];
        state.history = state.history || {};
        state.notifications = state.notifications || [];
        state.stats = state.stats || { totalAnswered: 0, totalCorrect: 0, totalIncorrect: 0, accuracy: 0, avgResponseTime: 0, studyTime: 0 };
      } catch (e) {
        console.error('Error loading stored state:', e);
      }
    }
  }

  function saveStateToStorage() {
    localStorage.setItem('exampulse_state_degamified', JSON.stringify(state));
  }

  function resetState() {
    for (const key in state) {
      if (state.hasOwnProperty(key)) delete state[key];
    }
    Object.assign(state, {
      user: null,
      stats: {
        totalAnswered: 0,
        totalCorrect: 0,
        totalIncorrect: 0,
        accuracy: 0,
        avgResponseTime: 0,
        studyTime: 0
      },
      history: {},
      bookmarks: [],
      revisions: [],
      customQuestions: [],
      notifications: []
    });
    saveStateToStorage();
  }

  // --- User Profiles & Live Database Sync ---
  let liveApiBaseUrl = ''; // Change to 'https://yourhostingerdomain.com/' if testing cross-origin

  async function registerLive(name, username, email, password) {
    try {
      const res = await fetch(`${liveApiBaseUrl}api.php?action=register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, email, password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        state.user = { 
          id: data.user.id,
          name: data.user.name, 
          username: data.user.username, 
          email: data.user.email,
          suspended: false 
        };
        saveStateToStorage();
        await syncLiveDatabase();
        return true;
      } else {
        alert(data.error || "Failed to register account.");
        return false;
      }
    } catch (e) {
      console.warn("Register API failed, falling back to offline guest profile.", e);
      login(username, email);
      return true;
    }
  }

  async function loginLive(email, password) {
    try {
      const res = await fetch(`${liveApiBaseUrl}api.php?action=login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        state.user = { 
          id: data.user.id,
          name: data.user.name, 
          username: data.user.username, 
          email: data.user.email,
          suspended: false 
        };
        saveStateToStorage();
        await syncLiveDatabase();
        return true;
      } else {
        alert(data.error || "Invalid sign-in credentials.");
        return false;
      }
    } catch (e) {
      console.warn("Login API failed, falling back to offline guest profile.", e);
      const username = email.split('@')[0];
      login(username, email);
      return true;
    }
  }

  async function syncLiveDatabase() {
    if (!state.user || !state.user.id) return;
    try {
      const res = await fetch(`${liveApiBaseUrl}api.php?action=sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: state.user.id,
          history: state.history,
          bookmarks: state.bookmarks,
          revisions: state.revisions
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        state.history = data.state.history || {};
        state.bookmarks = data.state.bookmarks || [];
        state.revisions = data.state.revisions || [];
        
        // Recalculate local stats based on server database attempts
        const total = Object.keys(state.history).length;
        const correct = Object.values(state.history).filter(h => h.result).length;
        state.stats.totalAnswered = total;
        state.stats.totalCorrect = correct;
        state.stats.totalIncorrect = total - correct;
        state.stats.accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
        
        saveStateToStorage();
        logTerminal('redis', `State synchronized successfully with live Hostinger database! Synced ${total} attempts.`);
      } else if (res.status === 403) {
        state.user.suspended = true;
        saveStateToStorage();
      }
    } catch (e) {
      console.warn("Live database sync failed, operating in offline caching mode.", e);
    }
  }

  async function loadNextQuestionAsync() {
    const cat = activeCategory;
    
    // Determine target difficulty scaling based on history accuracy
    const db = getFullQuestionDatabase();
    const catTotal = db.filter(q => q.category === cat && state.history[q.id]);
    const catCorrect = catTotal.filter(q => state.history[q.id].result).length;
    const catAcc = catTotal.length > 0 ? (catCorrect / catTotal.length) * 100 : 70;
    
    let difficulty = 'Medium';
    if (catAcc > 80) difficulty = 'Hard';
    else if (catAcc < 50) difficulty = 'Easy';
    
    const userId = state.user ? state.user.id : 0;

    // Try fetching dynamic verified PYQ question from live Google Gemini API
    if (window.location.protocol.startsWith('http') || liveApiBaseUrl) {
      try {
        const res = await fetch(`${liveApiBaseUrl}api.php?action=get_question&category=${encodeURIComponent(cat)}&difficulty=${difficulty}&userId=${userId}`);
        const data = await res.json();
        if (data && data.success && data.question) {
          // Double check to make sure it's not already in history (client-side safeguard)
          if (state.history[data.question.id]) {
            logTerminal('redis', `Collision avoidance: Gemini returned QID #${data.question.id} which is already answered. Fetching from local pool instead.`);
            return loadNextQuestionWithLockAsync();
          }
          activeQuestion = data.question;
          logTerminal('rag', `Gemini API Live: Dynamic exam PYQ successfully generated for ${activeCategory}!`);
          triggerRedisLock(activeQuestion.id);
          questionStartTime = Date.now();
          return activeQuestion;
        }
      } catch (e) {
        console.warn("Live Gemini question fetch failed, falling back to local Pyq database.", e);
      }
    }
    
    // Fail-safe Graceful fallback to offline seed database
    return loadNextQuestionWithLockAsync();
  }

  async function loadNextQuestionWithLockAsync() {
    const db = getFullQuestionDatabase();
    // Filter by active category
    const catQuestions = db.filter(q => q.category === activeCategory);

    if (catQuestions.length === 0) {
      activeQuestion = null;
      return null;
    }

    // Filter out already answered questions to prevent repetitions
    const unanswered = catQuestions.filter(q => !state.history[q.id]);

    // AI Smart System: Determine difficulty scaling based on history accuracy
    const catTotal = catQuestions.filter(q => state.history[q.id]);
    const catCorrect = catTotal.filter(q => state.history[q.id].result).length;
    const catAcc = catTotal.length > 0 ? (catCorrect / catTotal.length) * 100 : 70;

    let targetDifficulty = 'Medium';
    if (catAcc > 80) targetDifficulty = 'Hard';
    else if (catAcc < 50) targetDifficulty = 'Easy';

    if (unanswered.length === 0) {
      // Procedurally generate a brand new unique question to guarantee continuous flow!
      const pQuestion = generateProceduralQuestion(activeCategory, targetDifficulty);
      activeQuestion = pQuestion;
      triggerRedisLock(pQuestion.id);
      logTerminal('rag', `Procedural Flow Engine: Dynamically generated unique question QID #${pQuestion.id} for continuous flow in ${activeCategory}.`);
      questionStartTime = Date.now();
      return pQuestion;
    }

    // AI Smart System: Dynamically select question based on topic weakness and user accuracy
    const tagStats = {};
    Object.keys(state.history).forEach(qid => {
      const q = catQuestions.find(cq => cq.id == qid);
      if (q && q.tag) {
        tagStats[q.tag] = tagStats[q.tag] || { correct: 0, total: 0 };
        tagStats[q.tag].total++;
        if (state.history[qid].result) tagStats[q.tag].correct++;
      }
    });

    const weakTags = [];
    Object.keys(tagStats).forEach(tag => {
      const acc = (tagStats[tag].correct / tagStats[tag].total) * 100;
      if (acc < 60) weakTags.push(tag);
    });



    // Prioritize unanswered questions that match weak tags OR match target difficulty
    let candidatePool = unanswered.filter(q => weakTags.includes(q.tag));
    if (candidatePool.length === 0) {
      candidatePool = unanswered.filter(q => q.difficulty === targetDifficulty);
    }
    if (candidatePool.length === 0) {
      candidatePool = unanswered;
    }

    // Shuffle the candidate pool to choose one randomly
    const shuffledPool = [...candidatePool].sort(() => Math.random() - 0.5);

    const userId = state.user ? state.user.id : 0;

    // Iterate candidates and try to acquire lock on api.php
    for (const selected of shuffledPool) {
      if (window.location.protocol.startsWith('http') || liveApiBaseUrl) {
        try {
          const res = await fetch(`${liveApiBaseUrl}api.php?action=lock_question&qid=${selected.id}&userId=${userId}`);
          const data = await res.json();
          if (data && data.success) {
            activeQuestion = selected;
            triggerRedisLock(selected.id);
            logTerminal('rag', `Fallback Local: Locked and selected QID #${selected.id} for practice.`);
            questionStartTime = Date.now();
            return selected;
          }
        } catch (e) {
          console.warn("Lock API failed, operating in offline direct mode.", e);
          activeQuestion = selected;
          triggerRedisLock(selected.id);
          questionStartTime = Date.now();
          return selected;
        }
      } else {
        activeQuestion = selected;
        triggerRedisLock(selected.id);
        questionStartTime = Date.now();
        return selected;
      }
    }

    // If all candidates in the category are locked by other users currently
    activeQuestion = null;
    logTerminal('redis', `All available questions in ${activeCategory} are currently locked by other active users. Please wait a few seconds.`);
    return null;
  }

  function login(username, email) {
    state.user = { username, email, active: true };
    saveStateToStorage();
  }

  function logout() {
    state.user = null;
    saveStateToStorage();
  }

  // --- Study Timer ---
  let studyTimerInterval;
  function startStudyTimer() {
    if (studyTimerInterval) clearInterval(studyTimerInterval);
    studyTimerInterval = setInterval(() => {
      if (state.user) {
        state.stats.studyTime = (state.stats.studyTime || 0) + 1;
        if (state.stats.studyTime % 15 === 0) {
          saveStateToStorage();
        }
      }
    }, 1000);
  }

  // --- Continuous Question Engine (No Repetition & Live Locks) ---
  let activeQuestion = null;
  let activeCategory = 'civils (prelims)';
  let questionStartTime = 0;

  function getActiveQuestion() {
    return activeQuestion;
  }

  function getActiveCategory() {
    return activeCategory;
  }

  function setActiveCategory(cat) {
    activeCategory = cat;
  }

  // Combine standard and custom questions
  function getFullQuestionDatabase() {
    const baseQuestions = window.ExamPulseData ? window.ExamPulseData.questions : [];
    return [...baseQuestions, ...state.customQuestions];
  }

  // Simplified select fallback
  function loadNextQuestion() {
    const db = getFullQuestionDatabase();
    const catQuestions = db.filter(q => q.category === activeCategory);

    if (catQuestions.length === 0) {
      activeQuestion = null;
      return null;
    }

    const unanswered = catQuestions.filter(q => !state.history[q.id]);
    if (unanswered.length === 0) {
      // Procedurally generate a brand new unique question to guarantee continuous flow!
      const pQuestion = generateProceduralQuestion(activeCategory, 'Medium');
      activeQuestion = pQuestion;
      triggerRedisLock(pQuestion.id);
      questionStartTime = Date.now();
      return pQuestion;
    }

    const selected = unanswered[Math.floor(Math.random() * unanswered.length)];
    activeQuestion = selected;
    triggerRedisLock(selected.id);
    questionStartTime = Date.now();
    return selected;
  }

  // Check user answer (CRITICAL: Safely locked. No double submissions allowed.)
  function submitAnswer(selectedOptionIndex) {
    if (!activeQuestion) return null;

    if (state.history[activeQuestion.id]) {
      console.warn(`Question ID #${activeQuestion.id} has already been answered. Action locked.`);
      const record = state.history[activeQuestion.id];
      return {
        isCorrect: record.result,
        correctIndex: activeQuestion.correctOptionIndex,
        explanation: activeQuestion.explanation,
        concept: activeQuestion.concept,
        shortcut: activeQuestion.shortcut,
        source: activeQuestion.source,
        difficulty: activeQuestion.difficulty,
        takeaway: activeQuestion.takeaway,
        alreadyAnswered: true
      };
    }

    const duration = (Date.now() - questionStartTime) / 1000; // in seconds
    const isCorrect = selectedOptionIndex === activeQuestion.correctOptionIndex;

    // 1. Log to history
    state.history[activeQuestion.id] = {
      timestamp: Date.now(),
      result: isCorrect,
      responseTime: duration,
      selectedIdx: selectedOptionIndex
    };

    // 2. Adjust stats
    state.stats.totalAnswered++;
    if (isCorrect) {
      state.stats.totalCorrect++;
    } else {
      state.stats.totalIncorrect++;
    }

    // Calculate accuracy
    state.stats.accuracy = Math.round((state.stats.totalCorrect / state.stats.totalAnswered) * 100);

    // Calculate avg response time
    const totalTime = Object.values(state.history).reduce((acc, curr) => acc + curr.responseTime, 0);
    state.stats.avgResponseTime = parseFloat((totalTime / state.stats.totalAnswered).toFixed(1));

    saveStateToStorage();

    return {
      isCorrect,
      correctIndex: activeQuestion.correctOptionIndex,
      explanation: activeQuestion.explanation,
      concept: activeQuestion.concept,
      shortcut: activeQuestion.shortcut,
      source: activeQuestion.source,
      difficulty: activeQuestion.difficulty,
      takeaway: activeQuestion.takeaway,
      alreadyAnswered: false
    };
  }

  // --- Spaced Repetition Logistics ---
  function addToSpacedRepetition(qid) {
    const existing = state.revisions.find(r => r.qid === qid);

    if (existing) {
      existing.intervalLevel = 5; // Rescheduled for exactly 5 days
      existing.nextReviewTimestamp = Date.now() + (5 * 24 * 60 * 60 * 1000);
    } else {
      state.revisions.push({
        qid: qid,
        intervalLevel: 5, // Reappears after exactly 5 days
        nextReviewTimestamp: Date.now() + (5 * 24 * 60 * 60 * 1000)
      });
    }
  }

  function removeFromSpacedRepetition(qid) {
    state.revisions = state.revisions.filter(r => r.qid !== qid);
  }

  // --- Client-Side Procedural Infinite Question Flow Generator ---
  function generateProceduralQuestion(category, difficulty) {
    const templates = {
      'civils (prelims)': [
        {
          tag: 'Indian Polity',
          concept: 'Constitutional Amendments & Schedules',
          question: (params) => `Under the Constitution of India, which Constitutional Amendment Act introduced Part IX-B dealing with the "Co-operative Societies"?`,
          options: () => ['97th Amendment Act, 2011', '86th Amendment Act, 2002', '44th Amendment Act, 1978', '42nd Amendment Act, 1976'],
          correctIndex: 0,
          explanation: () => 'The 97th Constitutional Amendment Act, 2011, gave constitutional status and protection to co-operative societies. It made the right to form co-operative societies a fundamental right under Article 19(1)(c), added a new DPSP under Article 43-B, and inserted Part IX-B.',
          shortcut: 'Associate Part IX (Panchayats - 73rd), Part IX-A (Municipalities - 74th), and Part IX-B (Co-operatives - 97th).',
          takeaway: 'Part IX-B outlines incorporation, term, and audit parameters for co-operative societies.',
          source: 'UPSC CSE (Prelims)'
        },
        {
          tag: 'Syllogism (CSAT)',
          concept: 'Deductive reasoning using Venn diagrams',
          question: (params) => `Statements:\nI. All ${params.noun1}s are ${params.noun2}s.\nII. Some ${params.noun2}s are ${params.noun3}s.\n\nConclusions:\nI. Some ${params.noun1}s are ${params.noun3}s.\nII. Some ${params.noun3}s are ${params.noun2}s.`,
          options: () => ['Only Conclusion II follows', 'Only Conclusion I follows', 'Both Conclusions I and II follow', 'Neither Conclusion follows'],
          correctIndex: 0,
          explanation: (params) => `Since all ${params.noun1}s are ${params.noun2}s and some ${params.noun2}s are ${params.noun3}s, there is no direct overlapping guarantee between ${params.noun1} and ${params.noun3}. Thus, Conclusion I does not follow. However, since some ${params.noun2}s are ${params.noun3}s, it logically follows that some ${params.noun3}s are also ${params.noun2}s. Hence, Conclusion II follows.`,
          shortcut: 'Draw overlapping circles to instantly test intersection guarantees.',
          takeaway: 'Only definite intersections yield logically valid conclusions in CSAT.',
          source: 'UPSC CSAT'
        }
      ],
      'ssc': [
        {
          tag: 'Time and Work',
          concept: 'Efficiency and combined rates',
          question: (params) => `A can complete a piece of work in ${params.daysA} days, and B can complete the same work in ${params.daysB} days. Working together, how many days will they take to finish the work?`,
          options: (params) => [params.ans, params.optA, params.optB, params.optC],
          correctIndex: 0,
          explanation: (params) => `A's 1-day work = 1/${params.daysA}. B's 1-day work = 1/${params.daysB}. Combined 1-day work = (1/${params.daysA}) + (1/${params.daysB}) = (${params.daysA} + ${params.daysB}) / (${params.daysA} * ${params.daysB}). Total days = (${params.daysA} * ${params.daysB}) / (${params.daysA} + ${params.daysB}) = ${params.ans} days.`,
          shortcut: 'Formula: (A * B) / (A + B)',
          takeaway: 'Total work can be assumed as the LCM of individual days to simplify calculations.',
          source: 'SSC CGL Tier-1'
        },
        {
          tag: 'Profit and Loss',
          concept: 'Cost Price, Selling Price and Net Profit Margin',
          question: (params) => `An article is sold at a loss of ${params.lossPct}%. If it was sold for Rs. ${params.moreAmt} more, there would have been a gain of ${params.gainPct}%. What is the Cost Price of the article?`,
          options: (params) => [`Rs. ${params.cp}`, `Rs. ${params.optA}`, `Rs. ${params.optB}`, `Rs. ${params.optC}`],
          correctIndex: 0,
          explanation: (params) => `Difference in percentages = ${params.lossPct}% + ${params.gainPct}% = ${params.totalPct}%. This ${params.totalPct}% represents Rs. ${params.moreAmt}. Therefore, Cost Price (100%) = (${params.moreAmt} / ${params.totalPct}) * 100 = Rs. ${params.cp}.`,
          shortcut: 'CP = More Amount / (Loss% + Gain%) * 100',
          takeaway: 'Loss represents negative profit; difference between -Loss% and +Gain% is their summation.',
          source: 'SSC CGL Tier-2'
        }
      ],
      'rrb': [
        {
          tag: 'Time, Speed & Distance',
          concept: 'Relative speed of moving bodies',
          question: (params) => `A train ${params.trainLen} meters long crosses a platform of length ${params.platLen} meters in ${params.sec} seconds. What is the speed of the train in km/h?`,
          options: (params) => [`${params.speedKmh} km/h`, `${params.optA} km/h`, `${params.optB} km/h`, `${params.optC} km/h`],
          correctIndex: 0,
          explanation: (params) => `Total distance to cover = Train length + Platform length = ${params.trainLen} + ${params.platLen} = ${params.totDist} meters. Speed in m/s = ${params.totDist} / ${params.sec} = ${params.speedMs} m/s. Speed in km/h = ${params.speedMs} * (18 / 5) = ${params.speedKmh} km/h.`,
          shortcut: 'Multiply m/s by 3.6 to directly convert to km/h.',
          takeaway: 'Always add the train length and stationary platform length to get total distance.',
          source: 'RRB NTPC'
        },
        {
          tag: 'General Physics',
          concept: 'Ohm\'s Law and Electrical Resistance',
          question: (params) => `An electrical appliance of resistance ${params.res} Ohms is connected to a power supply of voltage ${params.volt} Volts. What is the electrical current flowing through the appliance?`,
          options: (params) => [`${params.curr} Amperes`, `${params.optA} Amperes`, `${params.optB} Amperes`, `${params.optC} Amperes`],
          correctIndex: 0,
          explanation: (params) => `According to Ohm's Law: V = I * R. Therefore, Current (I) = Voltage (V) / Resistance (R) = ${params.volt} / ${params.res} = ${params.curr} Amperes.`,
          shortcut: 'Formula: I = V / R',
          takeaway: 'Current is directly proportional to voltage and inversely proportional to resistance.',
          source: 'Railway Group D'
        }
      ],
      'appsc': [
        {
          tag: 'Andhra Pradesh History',
          concept: 'Dynastic rule of Satavahanas',
          question: () => `Who is considered the greatest ruler of the Satavahana dynasty, known for re-establishing the prestige of Satavahanas?`,
          options: () => ['Gautamiputra Satakarni', 'Simuka', 'Hala', 'Yajna Sri Satakarni'],
          correctIndex: 0,
          explanation: () => 'Gautamiputra Satakarni (78–102 CE) was the greatest ruler of the Satavahana Dynasty. He defeated the Shaka king Nahapana and re-established the glory of the Satavahana empire, which is described in the Nasik Prasasti inscription by his mother Gautami Balasri.',
          shortcut: 'Gautamiputra Satakarni is famous as "Eka Brahmana" and "Tri-samudra-toya-pita-vahana".',
          takeaway: 'Satavahanas ruled the Deccan region, with Pratishthana and Amaravati as major administrative centers.',
          source: 'APPSC Group 1'
        },
        {
          tag: 'Andhra Pradesh Geography',
          concept: 'Major River Irrigation and canals',
          question: () => `The Dowleswaram Barrage (Sir Arthur Cotton Barrage), a major irrigation engineering marvel in Andhra Pradesh, is built across which river?`,
          options: () => ['Godavari River', 'Krishna River', 'Pennar River', 'Tungabhadra River'],
          correctIndex: 0,
          explanation: () => 'The Sir Arthur Cotton Barrage (Dowleswaram Barrage) was constructed in 1852 across the Godavari River near Rajahmundry. Sir Arthur Cotton, a British irrigation engineer, planned and executed this barrage to transform the Godavari delta into a highly fertile agricultural zone.',
          shortcut: 'Arthur Cotton = Godavari delta savior (Dowleswaram).',
          takeaway: 'Godavari is the largest river in peninsular India and irrigates the highly fertile East and West Godavari districts.',
          source: 'APPSC Group-2'
        }
      ],
      'tgpsc': [
        {
          tag: 'Telangana History',
          concept: 'Kakatiya dynasty administrative architecture',
          question: () => `The historic Thousand Pillar Temple at Hanumakonda, a masterpiece of Kakatiya sculpture, was constructed during the reign of which Kakatiya ruler?`,
          options: () => ['Rudradeva', 'Ganapatideva', 'Rudramadevi', 'Prataparudra'],
          correctIndex: 0,
          explanation: () => 'The Thousand Pillar Temple (Rudreshwara Swamy Temple) in Hanumakonda was built in 1163 CE by King Rudradeva of the Kakatiya Dynasty. It is built in the unique Trikutalaya style dedicated to Shiva, Vishnu, and Surya.',
          shortcut: 'Rudreshwara Swamy (Thousand Pillar) temple = King Rudradeva.',
          takeaway: 'Kakatiyas were renowned for building massive water bodies (like Ramappa Lake) and intricate sandbox architecture.',
          source: 'TGPSC Group-1'
        },
        {
          tag: 'Telangana Geography',
          concept: 'Telangana Plateau and State borders',
          question: () => `Which is the highest peak/hill range in the state of Telangana, situated in the Adilabad district region?`,
          options: () => ['Lakshmidevipally Hills (in Satmala Range)', 'Ananthagiri Hills', 'Devarakonda Hills', 'Kandikal Hills'],
          correctIndex: 0,
          explanation: () => 'The Satmala Hill range runs across northern Telangana in Adilabad, and the Lakshmidevipally hills represent the prominent high plateau regions of the state. Ananthagiri hills in Vikarabad serve as the origin of the Musi River.',
          shortcut: 'Ananthagiri = Vikarabad (origin of Musi). Satmala = Northern border range (Adilabad).',
          takeaway: 'Telangana is located on the Deccan plateau, characterized by semi-arid terrain and granite formations.',
          source: 'TGPSC Group-2'
        }
      ]
    };

    const pool = templates[category] || templates['civils (prelims)'];
    const template = pool[Math.floor(Math.random() * pool.length)];

    const params = {};
    // Randomize arguments to guarantee no repetitions!
    if (template.tag === 'Syllogism (CSAT)') {
      const nouns = [
        { n1: 'Glider', n2: 'Flyer', n3: 'Bird' },
        { n1: 'Pen', n2: 'Pencil', n3: 'Eraser' },
        { n1: 'Car', n2: 'Truck', n3: 'Bus' },
        { n1: 'Phone', n2: 'Gadget', n3: 'Screen' },
        { n1: 'Tree', n2: 'Plant', n3: 'Flower' }
      ];
      const selected = nouns[Math.floor(Math.random() * nouns.length)];
      params.noun1 = selected.n1;
      params.noun2 = selected.n2;
      params.noun3 = selected.n3;
    } else if (template.tag === 'Time and Work') {
      const workData = [
        { a: 10, b: 15, ans: '6', oA: '5', oB: '7.5', oC: '8' },
        { a: 12, b: 24, ans: '8', oA: '9', oB: '6', oC: '10' },
        { a: 20, b: 30, ans: '12', oA: '10', oB: '15', oC: '14' },
        { a: 15, b: 30, ans: '10', oA: '9', oB: '12', oC: '11' }
      ];
      const selected = workData[Math.floor(Math.random() * workData.length)];
      params.daysA = selected.a;
      params.daysB = selected.b;
      params.ans = selected.ans;
      params.optA = selected.oA;
      params.optB = selected.oB;
      params.optC = selected.oC;
    } else if (template.tag === 'Profit and Loss') {
      const plData = [
        { loss: 10, gain: 10, more: 80, cp: 400, oA: 450, oB: 350, oC: 500 },
        { loss: 12, gain: 8, more: 100, cp: 500, oA: 550, oB: 450, oC: 600 },
        { loss: 5, gain: 15, more: 60, cp: 300, oA: 350, oB: 280, oC: 400 },
        { loss: 8, gain: 12, more: 120, cp: 600, oA: 650, oB: 580, oC: 700 }
      ];
      const selected = plData[Math.floor(Math.random() * plData.length)];
      params.lossPct = selected.loss;
      params.gainPct = selected.gain;
      params.moreAmt = selected.more;
      params.totalPct = selected.loss + selected.gain;
      params.cp = selected.cp;
      params.optA = selected.oA;
      params.optB = selected.oB;
      params.optC = selected.oC;
    } else if (template.tag === 'Time, Speed & Distance') {
      const speedData = [
        { len: 120, plat: 280, s: 20, spd: 72, oA: 60, oB: 80, oC: 90 },
        { len: 150, plat: 250, s: 16, spd: 90, oA: 80, oB: 72, oC: 96 },
        { len: 200, plat: 300, s: 25, spd: 72, oA: 60, oB: 84, oC: 90 },
        { len: 180, plat: 220, s: 18, spd: 80, oA: 72, oB: 88, oC: 96 }
      ];
      const selected = speedData[Math.floor(Math.random() * speedData.length)];
      params.trainLen = selected.len;
      params.platLen = selected.plat;
      params.sec = selected.s;
      params.totDist = selected.len + selected.plat;
      params.speedMs = params.totDist / selected.s;
      params.speedKmh = selected.spd;
      params.optA = selected.oA;
      params.optB = selected.oB;
      params.optC = selected.oC;
    } else if (template.tag === 'General Physics') {
      const physData = [
        { r: 10, v: 220, i: 22, oA: 11, oB: 15, oC: 30 },
        { r: 20, v: 220, i: 11, oA: 22, oB: 10, oC: 5 },
        { r: 40, v: 240, i: 6, oA: 10, oB: 8, oC: 12 },
        { r: 50, v: 100, i: 2, oA: 4, oB: 1.5, oC: 5 }
      ];
      const selected = physData[Math.floor(Math.random() * physData.length)];
      params.res = selected.r;
      params.volt = selected.v;
      params.curr = selected.i;
      params.optA = selected.oA;
      params.optB = selected.oB;
      params.optC = selected.oC;
    }

    const correctOptionIndex = template.correctIndex;
    const rawOptions = template.options(params);
    
    const correctVal = rawOptions[correctOptionIndex];
    const shuffledOptions = [...rawOptions].sort(() => Math.random() - 0.5);
    const finalCorrectIndex = shuffledOptions.indexOf(correctVal);

    const generatedQ = {
      id: 50000 + Math.floor(Math.random() * 50000),
      category: category,
      tag: template.tag,
      question: template.question(params),
      options: shuffledOptions,
      correctOptionIndex: finalCorrectIndex,
      explanation: template.explanation(params),
      concept: template.concept,
      shortcut: template.shortcut,
      source: template.source,
      difficulty: difficulty,
      takeaway: template.takeaway
    };

    while (state.history[generatedQ.id]) {
      generatedQ.id = 50000 + Math.floor(Math.random() * 50000);
    }

    return generatedQ;
  }

  // --- Bookmark Managers ---
  function toggleBookmarkActive(qid) {
    const idx = state.bookmarks.indexOf(qid);
    let bookmarked = false;
    if (idx > -1) {
      state.bookmarks.splice(idx, 1);
    } else {
      state.bookmarks.push(qid);
      bookmarked = true;
    }
    saveStateToStorage();
    return bookmarked;
  }

  function isQuestionBookmarked(qid) {
    return state.bookmarks.includes(qid);
  }


  // --- System Telemetry logs terminal Simulation ---
  let terminalLogs = [];
  const maxLogs = 50;

  function logTerminal(type, text) {
    const ts = new Date().toLocaleTimeString();
    terminalLogs.push({ ts, type, text });
    if (terminalLogs.length > maxLogs) terminalLogs.shift();

    // Broadcast event so UI updates immediately
    const event = new CustomEvent('exampulse_log', { detail: { ts, type, text } });
    window.dispatchEvent(event);
  }

  function getTerminalLogs() {
    return terminalLogs;
  }

  // Simulated Global Redis Locking Engine
  function triggerRedisLock(qid) {
    logTerminal('redis', `[LOCK ACQUIRE] Requesting QID #${qid} for concurrent check. Lock status: OK.`);
    
    // Simulate other active users picking different questions at the same moment
    virtualUsers.forEach(vu => {
      const db = getFullQuestionDatabase();
      const filtered = db.filter(q => q.category === vu.category && q.id !== qid);
      if (filtered.length > 0) {
        const randQ = filtered[Math.floor(Math.random() * filtered.length)];
        vu.qid = randQ.id;
        logTerminal('redis', `[LOCK UNIQUE] Virtual Aspirant "${vu.name}" requested ${vu.category}. Assumed QID #${vu.qid}. Redis lock allocated cleanly.`);
      }
    });

    logTerminal('redis', `[LOCK SUCCESS] Question #${qid} locked successfully for Current User. 0 collisions detected across 14,205 active sessions.`);
  }

  // Periodically flash background telemetry to make the system feel alive
  function setupTelemetrySimulation() {
    setInterval(() => {
      if (state.user && Math.random() > 0.4) {
        const events = [
          'Redis Queue cleanup completed. 0 expired locks released.',
          'Postgres Pool health check: 16 active connections. Latency: 4ms.',
          'Elasticsearch Sync: Category indices updated. Re-indexing time: 8ms.',
          'RAG Vector DB: Matrix multiplication weights re-aligned. Memory utilization: 32%.'
        ];
        const eventText = events[Math.floor(Math.random() * events.length)];
        logTerminal('redis', eventText);

        const randomFriend = virtualUsers[Math.floor(Math.random() * virtualUsers.length)];
        if (Math.random() > 0.8) {
          logTerminal('redis', `Virtual Aspirant "${randomFriend.name}" completed 1 question in ${randomFriend.category}. Session status: OK.`);
        }
      }
    }, 8000);
  }

  // --- SVG Charts Renderer (Chess.com-style statistics, clean, lightweight) ---
  function renderAccuracyTrendLine(svgContainerId, timeRange) {
    const container = document.getElementById(svgContainerId);
    if (!container) return;

    const historyItems = Object.entries(state.history)
      .map(([qid, val]) => ({ qid, ...val }))
      .sort((a, b) => a.timestamp - b.timestamp);

    let filtered = historyItems;
    const now = Date.now();

    if (timeRange === 'Today') {
      filtered = historyItems.filter(h => now - h.timestamp <= 24 * 60 * 60 * 1000);
    } else if (timeRange === '2Days') {
      filtered = historyItems.filter(h => now - h.timestamp <= 2 * 24 * 60 * 60 * 1000);
    } else if (timeRange === '1Week') {
      filtered = historyItems.filter(h => now - h.timestamp <= 7 * 24 * 60 * 60 * 1000);
    } else if (timeRange === '1Month') {
      filtered = historyItems.filter(h => now - h.timestamp <= 30 * 24 * 60 * 60 * 1000);
    }

    if (filtered.length < 2) {
      container.innerHTML = `<div class="empty-state-notice"><h3>Not enough data points</h3><p>Complete at least 2 questions in this time range to display accuracy trends.</p></div>`;
      return;
    }

    // Build rolling accuracy dataset
    let runningCorrect = 0;
    const dataPoints = filtered.map((item, idx) => {
      if (item.result) runningCorrect++;
      const runningAcc = Math.round((runningCorrect / (idx + 1)) * 100);
      return runningAcc;
    });

    const w = container.clientWidth || 340;
    const h = 200;
    const padding = 25;
    const graphW = w - padding * 2;
    const graphH = h - padding * 2;

    const pointsCount = dataPoints.length;
    const xStep = graphW / (pointsCount - 1);

    // Build path coordinates
    let pathD = '';
    dataPoints.forEach((val, idx) => {
      const x = padding + idx * xStep;
      const y = padding + graphH - (val / 100) * graphH;
      if (idx === 0) pathD += `M ${x} ${y}`;
      else pathD += ` L ${x} ${y}`;
    });

    // Render SVG
    container.innerHTML = `
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="overflow: visible;">
        <!-- Grid Lines -->
        <line x1="${padding}" y1="${padding}" x2="${w - padding}" y2="${padding}" stroke="var(--border-color)" stroke-width="1" stroke-dasharray="4" />
        <line x1="${padding}" y1="${padding + graphH / 2}" x2="${w - padding}" y2="${padding + graphH / 2}" stroke="var(--border-color)" stroke-width="1" stroke-dasharray="4" />
        <line x1="${padding}" y1="${padding + graphH}" x2="${w - padding}" y2="${padding + graphH}" stroke="var(--border-color)" stroke-width="1" />
        
        <!-- Y-Axis Labels -->
        <text x="${padding - 5}" y="${padding + 4}" fill="var(--text-muted)" font-size="9" text-anchor="end">100%</text>
        <text x="${padding - 5}" y="${padding + graphH / 2 + 4}" fill="var(--text-muted)" font-size="9" text-anchor="end">50%</text>
        <text x="${padding - 5}" y="${padding + graphH + 4}" fill="var(--text-muted)" font-size="9" text-anchor="end">0%</text>

        <!-- Under-area Gradient -->
        <path d="${pathD} L ${padding + (pointsCount - 1) * xStep} ${padding + graphH} L ${padding} ${padding + graphH} Z" fill="url(#chartGrad)" opacity="0.15" />
        
        <!-- Main Line -->
        <path d="${pathD}" fill="none" stroke="var(--brand-primary)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />

        <!-- Highlight dots -->
        ${dataPoints.map((val, idx) => {
          const x = padding + idx * xStep;
          const y = padding + graphH - (val / 100) * graphH;
          return `<circle cx="${x}" cy="${y}" r="4" fill="var(--brand-primary)" stroke="#fff" stroke-width="1.5" style="cursor: pointer;">
                    <title>Attempt #${idx + 1}: ${val}% Acc</title>
                  </circle>`;
        }).join('')}

        <!-- Gradient Definition -->
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--brand-primary)" />
            <stop offset="100%" stop-color="var(--brand-primary)" stop-opacity="0" />
          </linearGradient>
        </defs>
      </svg>
    `;
  }

  function renderCategoryDashboard(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const db = getFullQuestionDatabase();
    const categories = [
      { name: 'civils (prelims)', emoji: '🏛' },
      { name: 'ssc', emoji: '📊' },
      { name: 'rrb', emoji: '🚂' },
      { name: 'appsc', emoji: '⚖' },
      { name: 'tgpsc', emoji: '🧠' }
    ];

    let html = `<div class="category-bars-grid">`;

    categories.forEach(cat => {
      // Calculate attempts
      const catQIds = db.filter(q => q.category === cat.name).map(q => q.id);
      const attempts = Object.keys(state.history).filter(qid => catQIds.includes(Number(qid)));
      const correctAttempts = attempts.filter(qid => state.history[qid].result);

      const answeredCount = attempts.length;
      const correctCount = correctAttempts.length;
      const acc = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

      html += `
        <div class="cat-bar-item">
          <div class="cat-bar-meta">
            <span class="cat-name">${cat.emoji} ${cat.name}</span>
            <span class="cat-counts">${answeredCount} Answered | ${correctCount} Correct</span>
            <span class="cat-acc" style="color: var(--brand-primary);">${acc}% Accuracy</span>
          </div>
          <div class="cat-progress-track">
            <div class="cat-progress-fill" style="width: ${acc}%"></div>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
  }


  // --- Admin Panel Operations ---
  function addNewQuestion(qData) {
    const nextId = 1000 + Math.floor(Math.random() * 9000);
    const qObj = {
      id: nextId,
      category: qData.category,
      tag: qData.tag || 'General',
      question: qData.question,
      options: [qData.optA, qData.optB, qData.optC, qData.optD],
      correctOptionIndex: Number(qData.correctIdx),
      explanation: qData.explanation,
      concept: qData.concept || 'General Concept',
      shortcut: qData.shortcut || null,
      source: qData.source || 'Exam Pattern',
      difficulty: qData.difficulty || 'Medium',
      takeaway: qData.takeaway || 'Core takeaway for exams'
    };

    state.customQuestions.push(qObj);
    adminStats.totalAnsweredGlobal += Math.floor(Math.random() * 12);
    logTerminal('redis', `[ADMIN] Custom question added. ID #${nextId} pushed cleanly into category "${qData.category}".`);
    saveStateToStorage();
    return qObj;
  }

  function bulkUploadQuestions(text) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        let loaded = 0;
        parsed.forEach(q => {
          if (q.category && q.question && Array.isArray(q.options) && q.correctOptionIndex !== undefined) {
            const nextId = 1000 + Math.floor(Math.random() * 9000);
            q.id = nextId;
            q.tag = q.tag || 'General';
            q.concept = q.concept || 'Concept Analysis';
            q.source = q.source || 'Official Source';
            q.difficulty = q.difficulty || 'Medium';
            q.takeaway = q.takeaway || 'Revision guide';
            state.customQuestions.push(q);
            loaded++;
          }
        });
        logTerminal('redis', `[ADMIN] Bulk upload completed successfully. Loaded ${loaded} questions.`);
        saveStateToStorage();
        return { success: true, count: loaded };
      }
    } catch (e) {
      return { success: false, error: 'Invalid JSON array structure.' };
    }
  }

  function getAdminStats() {
    const db = getFullQuestionDatabase();
    const categories = ['civils (prelims)', 'ssc', 'rrb', 'appsc', 'tgpsc'];
    
    // Clear old properties from categoryPopularity to prevent carrying over Reasoning, Aptitude etc.
    adminStats.categoryPopularity = {};

    categories.forEach(cat => {
      const count = db.filter(q => q.category === cat).length;
      adminStats.categoryPopularity[cat] = count;
    });

    return {
      ...adminStats,
      customQuestionsCount: state.customQuestions.length
    };
  }

  function toggleUserSuspension(suspendStatus) {
    if (state.user) {
      state.user.suspended = suspendStatus;
      saveStateToStorage();
      logTerminal('redis', `[ADMIN] Actual user "${state.user.username}" suspension status updated: ${suspendStatus ? 'Suspended' : 'Active'}.`);
    }
  }

  // --- Real-time Time Period Progress Telemetry ---
  function getProgressStats() {
    const historyItems = Object.values(state.history || {});
    const now = Date.now();

    const cutoff1Day = now - (24 * 60 * 60 * 1000);
    const cutoff2Days = now - (2 * 24 * 60 * 60 * 1000);
    const cutoff1Week = now - (7 * 24 * 60 * 60 * 1000);
    const cutoff1Month = now - (30 * 24 * 60 * 60 * 1000);

    const calculateForCutoff = (cutoff) => {
      const items = historyItems.filter(item => item.timestamp >= cutoff);
      const total = items.length;
      const correct = items.filter(item => item.result === true || item.result === 1).length;
      const incorrect = total - correct;
      return { total, correct, incorrect };
    };

    return {
      '1Day': calculateForCutoff(cutoff1Day),
      '2Days': calculateForCutoff(cutoff2Days),
      '1Week': calculateForCutoff(cutoff1Week),
      '1Month': calculateForCutoff(cutoff1Month)
    };
  }

  // --- CRUD: Job Notifications Blog Posts ---
  async function getNotificationsAsync() {
    if (window.location.protocol.startsWith('http') || liveApiBaseUrl) {
      try {
        const res = await fetch(`${liveApiBaseUrl}api.php?action=get_notifications`);
        const data = await res.json();
        if (data && data.success && data.notifications) {
          state.notifications = data.notifications;
          saveStateToStorage();
          return data.notifications;
        }
      } catch (e) {
        console.warn("Failed to fetch live notifications from Hostinger API, falling back to local memory.", e);
      }
    }
    return state.notifications || [];
  }

  function addNotificationLocally(notifData) {
    const cleanSlug = notifData.slug.toLowerCase().replace(/[^a-z0-9\-]/g, '').replace(/\s+/g, '-');
    const newNotif = {
      id: 1000 + Math.floor(Math.random() * 9000),
      title: notifData.title,
      content: notifData.content,
      slug: cleanSlug || 'job-post',
      meta_title: notifData.meta_title || (notifData.title + " | ExamPulse AI"),
      meta_description: notifData.meta_description || notifData.content.replace(/<[^>]*>/g, '').substring(0, 155),
      meta_keywords: notifData.meta_keywords || "government jobs",
      schema_markup: notifData.schema_markup || "",
      created_at: new Date().toISOString()
    };
    state.notifications = state.notifications || [];
    if (state.notifications.some(n => n.slug === newNotif.slug)) {
      return { success: false, error: 'Slug URL must be unique.' };
    }
    state.notifications.unshift(newNotif);
    saveStateToStorage();
    return { success: true };
  }

  async function addNotificationAsync(notifData) {
    if (window.location.protocol.startsWith('http') || liveApiBaseUrl) {
      try {
        const res = await fetch(`${liveApiBaseUrl}api.php?action=add_notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(notifData)
        });
        const data = await res.json();
        if (data && data.success) {
          await getNotificationsAsync();
          return { success: true };
        }
        return { success: false, error: data.error || 'Server error' };
      } catch (e) {
        console.warn("Failed to post notification to live API, falling back to local memory.", e);
        return addNotificationLocally(notifData);
      }
    } else {
      return addNotificationLocally(notifData);
    }
  }

  async function deleteNotificationAsync(id) {
    if (window.location.protocol.startsWith('http') || liveApiBaseUrl) {
      try {
        const res = await fetch(`${liveApiBaseUrl}api.php?action=delete_notification&id=${id}`);
        const data = await res.json();
        if (data && data.success) {
          await getNotificationsAsync();
          return true;
        }
      } catch (e) {
        console.warn("Delete API failed, removing locally.", e);
      }
    }
    state.notifications = (state.notifications || []).filter(n => n.id !== id);
    saveStateToStorage();
    return true;
  }

  // --- Public APIs ---
  return {
    init,
    get state() { return state; },
    login,
    logout,
    resetState,
    setActiveCategory,
    getActiveCategory,
    getActiveQuestion,
    loadNextQuestion,
    submitAnswer,
    toggleBookmarkActive,
    isQuestionBookmarked,
    getTerminalLogs,
    renderAccuracyTrendLine,
    renderCategoryDashboard,
    addNewQuestion,
    bulkUploadQuestions,
    getAdminStats,
    toggleUserSuspension,
    virtualUsers,
    registerLive,
    loginLive,
    syncLiveDatabase,
    loadNextQuestionAsync,
    loadNextQuestionWithLockAsync,
    getProgressStats,
    getNotificationsAsync,
    addNotificationAsync,
    deleteNotificationAsync
  };
})();
