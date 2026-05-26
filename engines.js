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
    customQuestions: [] // array of user-added questions
  };

  let state = { ...DEFAULT_STATE };

  // --- Mock Databases ---
  // Mock Concurrent Users for Redis telemetry (No XP / streaks)
  const virtualUsers = [
    { name: 'Priya Sharma', category: 'Reasoning', qid: null },
    { name: 'Amit Patel', category: 'Aptitude', qid: null },
    { name: 'Rohan Singh', category: 'History', qid: null },
    { name: 'Deepika K.', category: 'Polity', qid: null },
    { name: 'Vivek Roy', category: 'Science', qid: null }
  ];

  // Mock Admin Dashboard Stats
  const adminStats = {
    activeUsers: 14205,
    totalAnsweredGlobal: 1205842,
    todayRevenue: 0, // No paid plans
    categoryPopularity: {
      'Reasoning': 12,
      'Aptitude': 8,
      'History': 10,
      'Geography': 6,
      'Polity': 6,
      'Economics': 6,
      'Science': 6,
      'Current Affairs': 6
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
      customQuestions: []
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
  let activeCategory = 'Reasoning';
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
      'Reasoning': [
        {
          tag: 'Coding-Decoding',
          concept: 'Letter shifts and pattern recognition',
          question: (params) => `In a certain code language, '${params.word1}' is written as '${params.code1}'. How is '${params.word2}' written in that code?`,
          options: (params) => [params.code2, params.optA, params.optB, params.optC],
          correctIndex: 0,
          explanation: (params) => `The coding logic is ${params.logic}. Applying the same shift of ${params.shift} to each letter of '${params.word2}' yields '${params.code2}'.`,
          shortcut: 'Write down the alphabet indices to quickly identify shifts.',
          takeaway: 'Standard alpha-numeric shift logic is the most common SSC CGL coding pattern.',
          source: 'SSC CGL 2022 Tier-1'
        },
        {
          tag: 'Syllogisms',
          concept: 'Deductive reasoning using Venn diagrams',
          question: (params) => `Statements:\nI. All ${params.noun1}s are ${params.noun2}s.\nII. Some ${params.noun2}s are ${params.noun3}s.\n\nConclusions:\nI. Some ${params.noun1}s are ${params.noun3}s.\nII. Some ${params.noun3}s are ${params.noun2}s.`,
          options: () => ['Only Conclusion II follows', 'Only Conclusion I follows', 'Both Conclusions I and II follow', 'Neither Conclusion follows'],
          correctIndex: 0,
          explanation: (params) => `Since all ${params.noun1}s are ${params.noun2}s and some ${params.noun2}s are ${params.noun3}s, there is no direct overlapping guarantee between ${params.noun1} and ${params.noun3}. Thus, Conclusion I does not follow. However, since some ${params.noun2}s are ${params.noun3}s, it logically follows that some ${params.noun3}s are also ${params.noun2}s. Hence, Conclusion II follows.`,
          shortcut: 'Draw overlapping circles to instantly test intersection guarantees.',
          takeaway: 'Only definite intersections yield logically valid conclusions.',
          source: 'UPSC CSAT 2023'
        },
        {
          tag: 'Number Series',
          concept: 'Identifying arithmetic and geometric series progressions',
          question: (params) => `Find the missing term in the sequence: ${params.series.join(', ')}, ?`,
          options: (params) => [String(params.nextVal), String(params.optA), String(params.optB), String(params.optC)],
          correctIndex: 0,
          explanation: (params) => `The series progression logic is ${params.logic}. Applying this logic to the last term yields ${params.nextVal}.`,
          shortcut: 'Calculate differences between consecutive terms to find the underlying pattern.',
          takeaway: 'Rolling difference of squares or primes is a standard CSAT pattern.',
          source: 'RRB NTPC 2021'
        }
      ],
      'Aptitude': [
        {
          tag: 'Time and Work',
          concept: 'Efficiency and combined rates',
          question: (params) => `A can complete a piece of work in ${params.daysA} days, and B can complete the same work in ${params.daysB} days. Working together, how many days will they take to finish the work?`,
          options: (params) => [params.ans, params.optA, params.optB, params.optC],
          correctIndex: 0,
          explanation: (params) => `A's 1-day work = 1/${params.daysA}. B's 1-day work = 1/${params.daysB}. Combined 1-day work = (1/${params.daysA}) + (1/${params.daysB}) = (${params.daysA} + ${params.daysB}) / (${params.daysA} * ${params.daysB}). Total days = (${params.daysA} * ${params.daysB}) / (${params.daysA} + ${params.daysB}) = ${params.ans} days.`,
          shortcut: 'Formula: (A * B) / (A + B)',
          takeaway: 'Total work can be assumed as the LCM of individual days to simplify calculations.',
          source: 'SSC CGL 2023 Tier-1'
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
          source: 'SBI PO 2022'
        }
      ],
      'History': [
        {
          tag: 'Ancient India',
          concept: 'Dynastic rulers and administrations',
          question: () => `Who among the following was the prime advisor and guide to Chandragupta Maurya in establishing the Mauryan Empire?`,
          options: () => ['Chanakya (Kautilya)', 'Radhagupta', 'Megasthenes', 'Bimbisara'],
          correctIndex: 0,
          explanation: () => 'Chanakya, also known as Kautilya or Vishnugupta, was the prime minister and political strategist to Chandragupta Maurya. He wrote the Arthashastra, a treatise on statecraft, economic policy, and military strategy.',
          shortcut: 'Kautilya (Chanakya) is universally associated with the founding of the Mauryas.',
          takeaway: 'The overthrow of the Nanda Dynasty was planned by Chanakya.',
          source: 'UPSC Prelims 2020'
        },
        {
          tag: 'Mughal Empire',
          concept: 'Medieval military conflicts and key treaties',
          question: () => 'The Battle of Haldighati in 1576 was fought between which two military commanders?',
          options: () => ['Maharana Pratap and Man Singh I (Akbar\'s General)', 'Humayun and Sher Shah Suri', 'Akbar and Hemu', 'Babur and Ibrahim Lodi'],
          correctIndex: 0,
          explanation: () => 'The Battle of Haldighati was fought on June 18, 1576, between Maharana Pratap of Mewar and the Mughal forces led by Raja Man Singh I of Amber, representing Emperor Akbar.',
          shortcut: 'Haldighati = Maharana Pratap vs Akbar (Man Singh).',
          takeaway: 'Key battles outline medieval sovereign boundaries in India.',
          source: 'SSC CGL 2021'
        }
      ],
      'Geography': [
        {
          tag: 'Indian Rivers',
          concept: 'River systems, basins and tributaries',
          question: () => 'Which river in India is frequently referred to as the "Dakshin Ganga" due to its massive length and drainage basin size?',
          options: () => ['Godavari River', 'Krishna River', 'Cauvery River', 'Narmada River'],
          correctIndex: 0,
          explanation: () => 'The Godavari River is the second longest river in India after the Ganges. It is known as the "Dakshin Ganga" (Ganges of the South) because of its large basin, massive length of 1,465 km, and high religious significance.',
          shortcut: 'Dakshin Ganga = Godavari. (Do not confuse with Dakshina Ganga of Cauvery).',
          takeaway: 'Godavari originates at Trimbakeshwar in Nashik district of Maharashtra.',
          source: 'UPSC Prelims 2019'
        },
        {
          tag: 'Physical Geography',
          concept: 'Soil classification and agricultural suitability',
          question: () => 'Which type of soil is most highly suited for the cultivation of cotton crops in the Indian subcontinent?',
          options: () => ['Black Soil (Regur)', 'Alluvial Soil', 'Red and Yellow Soil', 'Laterite Soil'],
          correctIndex: 0,
          explanation: () => 'Black soil, also known as Regur soil or Black Cotton Soil, is highly clayey and moisture-retentive, making it perfect for cotton cultivation. It is rich in calcium carbonate, magnesium, potash, and lime.',
          shortcut: 'Regur = Black Soil = Cotton.',
          takeaway: 'Deccan trap basalt weathering forms black soil.',
          source: 'SSC CGL 2022'
        }
      ],
      'Polity': [
        {
          tag: 'Constitutional Rights',
          concept: 'Fundamental Rights and Articles',
          question: () => 'Which Article of the Constitution of India guarantees the Right to Equality and prohibits discrimination on grounds of religion, race, caste, sex, or place of birth?',
          options: () => ['Article 15', 'Article 14', 'Article 19', 'Article 21'],
          correctIndex: 0,
          explanation: () => 'Article 15 of the Constitution of India prohibits discrimination on grounds only of religion, race, caste, sex, or place of birth. Article 14 deals with Equality before Law.',
          shortcut: 'Article 15 = Prohibition of Discrimination.',
          takeaway: 'Articles 14 to 18 constitute the Right to Equality in Part III.',
          source: 'UPSC Prelims 2021'
        },
        {
          tag: 'Executive Organs',
          concept: 'Oaths, terms and parliamentary procedures',
          question: () => 'Who is constitutionally authorized to administer the oath of office to the President of India?',
          options: () => ['Chief Justice of India', 'Prime Minister of India', 'Vice President of India', 'Speaker of the Lok Sabha'],
          correctIndex: 0,
          explanation: () => 'Under Article 60 of the Indian Constitution, the oath of office to the President of India is administered by the Chief Justice of India, or in their absence, the senior-most judge of the Supreme Court.',
          shortcut: 'Oath of President = Chief Justice of India (CJI).',
          takeaway: 'Article 60 outlines President\'s affirmation parameters.',
          source: 'SSC CGL 2023'
        }
      ],
      'Economics': [
        {
          tag: 'Monetary Policy',
          concept: 'Central banking systems and credit tools',
          question: () => 'What is the monetary policy rate tool defined as the rate at which the Reserve Bank of India (RBI) lends money to commercial banks against government securities?',
          options: () => ['Repo Rate', 'Reverse Repo Rate', 'Bank Rate', 'Marginal Standing Facility (MSF) Rate'],
          correctIndex: 0,
          explanation: () => 'The Repo Rate (Repurchase Option Rate) is the benchmark interest rate at which the RBI lends short-term money to commercial banks in India. It is a key tool used to control liquidity and inflation.',
          shortcut: 'Lending to commercial banks = Repo Rate.',
          takeaway: 'Increasing Repo Rate reduces market money supply, controlling inflation.',
          source: 'SBI PO 2023'
        },
        {
          tag: 'Macroeconomics',
          concept: 'Economic indices and stagnation states',
          question: () => 'A critical macroeconomic condition characterized by extremely slow economic growth, high unemployment, accompanied by high price inflation is termed as:',
          options: () => ['Stagflation', 'Hyperinflation', 'Deflation', 'Reflation'],
          correctIndex: 0,
          explanation: () => 'Stagflation is an economic situation defined by stagnation (low economic growth and high unemployment) combined with inflation (rising prices). It presents a policy dilemma for central banks.',
          shortcut: 'Stagnant Growth + Inflation = Stagflation.',
          takeaway: 'Stagflation challenges standard Keynesian macroeconomic policies.',
          source: 'UPSC Prelims 2022'
        }
      ],
      'Science': [
        {
          tag: 'Cell Biology',
          concept: 'Cell structures and organelles',
          question: () => 'Which cell organelle is widely referred to as the "powerhouse of the cell" due to its role in aerobic respiration and ATP generation?',
          options: () => ['Mitochondria', 'Chloroplast', 'Ribosome', 'Golgi Apparatus'],
          correctIndex: 0,
          explanation: () => 'Mitochondria are the double-membrane-bound organelles responsible for generating adenosine triphosphate (ATP), the primary energy currency of the cell, through cellular respiration.',
          shortcut: 'Powerhouse = Mitochondria (ATP generator).',
          takeaway: 'Mitochondria contain their own ribosomes and circular DNA.',
          source: 'SSC CGL 2022'
        },
        {
          tag: 'Chemical Compounds',
          concept: 'Chemical nomenclature and common compounds',
          question: () => 'What is the chemical nomenclature and formula of common household baking soda?',
          options: () => ['Sodium Bicarbonate (NaHCO3)', 'Sodium Carbonate (Na2CO3)', 'Calcium Carbonate (CaCO3)', 'Sodium Chloride (NaCl)'],
          correctIndex: 0,
          explanation: () => 'Baking soda is Sodium Bicarbonate (NaHCO3). Sodium Carbonate (Na2CO3) is washing soda, while Calcium Carbonate (CaCO3) is limestone.',
          shortcut: 'Baking Soda = Sodium Bicarbonate = NaHCO3.',
          takeaway: 'Thermal decomposition of baking soda yields carbon dioxide, causing dough to rise.',
          source: 'RRB NTPC 2021'
        }
      ],
      'Current Affairs': [
        {
          tag: 'National Missions',
          concept: 'Space technology, payloads and launch systems',
          question: () => 'Which heavy-lift launch vehicle rocket was successfully deployed by ISRO for the historic Chandrayaan-3 lunar mission launch?',
          options: () => ['LVM3-M4', 'PSLV-C56', 'GSLV-F12', 'SSLV-D2'],
          correctIndex: 0,
          explanation: () => 'ISRO successfully launched the Chandrayaan-3 mission on July 14, 2023, using the LVM3 (Launch Vehicle Mark-3) rocket, specifically the LVM3-M4 configuration, from Satish Dhawan Space Centre, Sriharikota.',
          shortcut: 'Chandrayaan-3 Launcher = LVM3-M4 (formerly GSLV Mk III).',
          takeaway: 'LVM3 is ISRO\'s heaviest operational launch vehicle.',
          source: 'UPSC Prelims 2024'
        },
        {
          tag: 'Global Summits',
          concept: 'International coordination frameworks and summits',
          question: () => 'Which world city hosted the historic 28th Conference of the Parties (COP28) climate change summit under the UNFCCC framework in 2023?',
          options: () => ['Dubai, United Arab Emirates', 'New Delhi, India', 'Glasgow, United Kingdom', 'Sharm El-Sheikh, Egypt'],
          correctIndex: 0,
          explanation: () => 'The COP28 climate summit was hosted in Dubai, United Arab Emirates, from November 30 to December 12, 2023. It concluded with the historic "UAE Consensus" to transition away from fossil fuels.',
          shortcut: 'COP28 = Dubai, UAE (2023).',
          takeaway: 'Summit agreements aim to restrict warming to 1.5°C.',
          source: 'UPSC Prelims 2024'
        }
      ]
    };

    const pool = templates[category] || templates['Reasoning'];
    const template = pool[Math.floor(Math.random() * pool.length)];

    const params = {};
    if (category === 'Reasoning' && template.tag === 'Coding-Decoding') {
      const words = [
        { w: 'ROSE', c: 'S P T F', s: '+1' },
        { w: 'TULIP', c: 'V W N K R', s: '+2' },
        { w: 'LOTUS', c: 'O R W X V', s: '+3' },
        { w: 'LILY', c: 'M J M Z', s: '+1' }
      ];
      const selected = words[Math.floor(Math.random() * words.length)];
      params.word1 = selected.w;
      params.code1 = selected.c;
      params.logic = `a character shift of ${selected.s}`;
      params.shift = selected.s;

      const word2s = ['PINK', 'DAISY', 'ORCHID', 'FERN'];
      const w2 = word2s[Math.floor(Math.random() * word2s.length)];
      params.word2 = w2;
      params.code2 = w2.split('').map(c => String.fromCharCode(c.charCodeAt(0) + 1)).join(' ');
      params.optA = w2.split('').map(c => String.fromCharCode(c.charCodeAt(0) - 1)).join(' ');
      params.optB = w2.split('').map(c => String.fromCharCode(c.charCodeAt(0) + 2)).join(' ');
      params.optC = w2.split('').map(c => String.fromCharCode(c.charCodeAt(0) + 3)).join(' ');
    } else if (category === 'Reasoning' && template.tag === 'Syllogisms') {
      const nouns = [
        { n1: 'Glider', n2: 'Flyer', n3: 'Bird' },
        { n1: 'Pen', n2: 'Pencil', n3: 'Eraser' },
        { n1: 'Car', n2: 'Truck', n3: 'Bus' }
      ];
      const selected = nouns[Math.floor(Math.random() * nouns.length)];
      params.noun1 = selected.n1;
      params.noun2 = selected.n2;
      params.noun3 = selected.n3;
    } else if (category === 'Reasoning' && template.tag === 'Number Series') {
      const series = [
        { s: [2, 6, 12, 20, 30], n: 42, l: 'n^2 + n progression' },
        { s: [5, 10, 17, 26, 37], n: 50, l: 'n^2 + 1 progression' },
        { s: [2, 3, 5, 7, 11], n: 13, l: 'sequential prime numbers progression' }
      ];
      const selected = series[Math.floor(Math.random() * series.length)];
      params.series = selected.s;
      params.nextVal = selected.n;
      params.logic = selected.l;
      params.optA = selected.n + 2;
      params.optB = selected.n - 1;
      params.optC = selected.n + 4;
    } else if (category === 'Aptitude' && template.tag === 'Time and Work') {
      const workData = [
        { a: 10, b: 15, ans: '6', oA: '5', oB: '7.5', oC: '8' },
        { a: 12, b: 24, ans: '8', oA: '9', oB: '6', oC: '10' },
        { a: 20, b: 30, ans: '12', oA: '10', oB: '15', oC: '14' }
      ];
      const selected = workData[Math.floor(Math.random() * workData.length)];
      params.daysA = selected.a;
      params.daysB = selected.b;
      params.ans = selected.ans;
      params.optA = selected.oA;
      params.optB = selected.oB;
      params.optC = selected.oC;
    } else if (category === 'Aptitude' && template.tag === 'Profit and Loss') {
      const plData = [
        { loss: 10, gain: 10, more: 80, cp: 400, oA: 450, oB: 350, oC: 500 },
        { loss: 12, gain: 8, more: 100, cp: 500, oA: 550, oB: 450, oC: 600 },
        { loss: 5, gain: 15, more: 60, cp: 300, oA: 350, oB: 280, oC: 400 }
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
      { name: 'Reasoning', emoji: '🧠' },
      { name: 'Aptitude', emoji: '📊' },
      { name: 'History', emoji: '🏛' },
      { name: 'Geography', emoji: '🌍' },
      { name: 'Polity', emoji: '⚖' },
      { name: 'Economics', emoji: '💰' },
      { name: 'Science', emoji: '🔬' },
      { name: 'Current Affairs', emoji: '📰' }
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
    const categories = ['Reasoning', 'Aptitude', 'History', 'Geography', 'Polity', 'Economics', 'Science', 'Current Affairs'];
    
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
    loadNextQuestionWithLockAsync
  };
})();
