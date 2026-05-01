(function () {
  'use strict';

  // --- Constants ---
  const TIMED_DURATION_MS = 180000; // 3 minutes
  const TIMER_WARNING_MS = 30000;   // last 30s — switch to red/coral
  const TIMER_TICK_MS = 250;

  // --- State ---
  let puzzle = null;
  let currentInput = '';
  let foundWords = new Set();
  let currentScore = 0;
  let bonusCount = 0;
  let thresholds = {};
  let dateKey = '';
  let stats = {};
  let hintsUsed = { revealedWords: [], selectedTwoLetterKey: null };
  let isCustomPuzzle = false;
  let customPuzzleCode = null;

  // Mode + routing state
  let mode = 'daily';                 // 'daily' | 'timed' | 'custom'
  let currentScreen = 'home';         // 'home' | 'game' | 'yesterday'
  let homeHandlersAttached = false;

  // Timer state (timed mode)
  let timerInterval = null;
  let timerStartTimestamp = null;     // mirrors timed state.startTimestamp for fast access
  let timedCompleted = false;         // input lock for finished timed puzzle
  // When initTimedPuzzle() detects a saved completed/expired timed game, it
  // sets this flag instead of opening modal-timed-end synchronously. The
  // calling routing code consumes the flag *after* showScreen('game', ...) so
  // the modal isn't immediately closed by showScreen's "close any open modal"
  // logic. Symmetric: set in one place, consumed (and reset) in each caller.
  let pendingTimedEndModal = false;

  // --- Icon SVGs ---
  const ICON_CLIPBOARD = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
  const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  // --- DOM refs ---
  const $ = (id) => document.getElementById(id);
  const screenHome = $('screen-home');
  const screenGame = $('screen-game');
  const screenYesterday = $('screen-yesterday');
  const inputText = $('input-text');
  const inputDisplay = $('input-display');
  const hexGrid = $('hex-grid');
  const foundWordsList = $('found-words-list');
  const foundCount = $('found-count');
  const scoreDisplay = $('score-display');
  const rankEmoji = $('rank-emoji');
  const rankName = $('rank-name');
  const progressBarFill = $('progress-bar-fill');
  const progressLabel = $('progress-label');
  const streakDisplay = $('streak-display');
  const difficultyBadge = $('difficulty-badge');
  const dateDisplay = $('date-display');
  const timerDisplay = $('timer-display');
  const toast = $('toast');
  const scoreFloat = $('score-float');
  const btnDelete = $('btn-delete');
  const btnShuffle = $('btn-shuffle');
  const btnEnter = $('btn-enter');
  const btnHowToPlay = $('btn-how-to-play');
  const btnStats = $('btn-stats');
  const btnShare = $('btn-share');
  const btnShareHeader = $('btn-share-header');
  const btnHome = $('btn-home');
  const modalHowToPlay = $('modal-how-to-play');
  const modalStats = $('modal-stats');
  const modalBloom = $('modal-bloom-celebration');
  const bloomWordDisplay = $('bloom-word-display');
  const modalShare = $('modal-share');
  const sharePreview = $('share-preview');
  const btnCopyShare = $('btn-copy-share');
  const btnViewAll = $('btn-view-all');
  const modalAllWords = $('modal-all-words');
  const allWordsContent = $('all-words-content');
  const btnHints = $('btn-hints');
  const btnHintsInline = $('btn-hints-inline');
  const modalHints = $('modal-hints');

  // --- DOM refs (create modal) ---
  const modalCreate = $('modal-create-puzzle');
  const createCenter = $('create-center');
  const createError = $('create-error');
  const createPreview = $('create-preview');
  const createWordCount = $('create-word-count');
  const btnCreateGo = $('btn-create-go');
  const btnBackToDaily = $('btn-back-to-daily');

  // --- DOM refs (home / yesterday / timed-end) ---
  const homeBtnDaily = $('home-btn-daily');
  const homeBtnTimed = $('home-btn-timed');
  const homeBtnCreate = $('home-btn-create');
  const homeBtnYesterday = $('home-btn-yesterday');
  const yesterdayBtnHome = $('yesterday-btn-home');
  const yesterdayDate = $('yesterday-date');
  const yesterdayLetterRow = $('yesterday-letter-row');
  const yesterdayPangrams = $('yesterday-pangrams');
  const yesterdayWordsList = $('yesterday-words-list');
  const yesterdaySummary = $('yesterday-summary');
  const modalTimedEnd = $('modal-timed-end');
  const timedEndScore = $('timed-end-score');
  const timedEndFound = $('timed-end-found');
  const timedEndTotal = $('timed-end-total');
  const timedEndRank = $('timed-end-rank');
  const timedEndHome = $('timed-end-home');

  // --- Routing ---
  function newUrlForScreen(name, opts) {
    const path = window.location.pathname;
    if (name === 'home') return path;
    if (name === 'yesterday') return path + '?mode=yesterday';
    if (name === 'game') {
      if (opts && opts.customCode) return path + '?p=' + opts.customCode;
      if (opts && opts.gameMode === 'timed') return path + '?mode=timed';
      return path + '?mode=daily';
    }
    return path;
  }

  function showScreen(name, options) {
    options = options || {};
    // Close any open modal so it doesn't leak across screens
    var openModalEl = document.querySelector('.modal:not([hidden])');
    if (openModalEl) closeModal(openModalEl);

    // If leaving game while in timed mode and timer is ticking, stop the
    // interval. Time keeps elapsing in real time via state.startTimestamp;
    // tick() will catch up if/when the user returns.
    if (currentScreen === 'game' && name !== 'game' && mode === 'timed') {
      stopTimerInterval();
    }

    screenHome.hidden = name !== 'home';
    screenGame.hidden = name !== 'game';
    screenYesterday.hidden = name !== 'yesterday';
    currentScreen = name;

    var url = newUrlForScreen(name, options);
    var stateObj = { mode: name };
    if (options.customCode) stateObj.customCode = options.customCode;
    if (options.gameMode) stateObj.gameMode = options.gameMode;
    if (options.pushHistory === false) {
      history.replaceState(stateObj, '', url);
    } else {
      history.pushState(stateObj, '', url);
    }
  }

  function routeFromURL() {
    var params = new URLSearchParams(window.location.search);
    var customParam = params.get('p');
    var modeParam = params.get('mode');

    if (customParam) {
      var ok = initCustomPuzzle(customParam);
      if (ok) {
        showScreen('game', { pushHistory: false, customCode: customPuzzleCode });
      } else {
        // Invalid custom code — fall back to home
        initHome();
        showScreen('home', { pushHistory: false });
      }
      return;
    }

    if (modeParam === 'timed') {
      var ok2 = initTimedPuzzle();
      if (ok2) {
        showScreen('game', { pushHistory: false, gameMode: 'timed' });
        if (pendingTimedEndModal) {
          pendingTimedEndModal = false;
          openTimedEndModal();
        }
      } else {
        initHome();
        showScreen('home', { pushHistory: false });
      }
      return;
    }

    if (modeParam === 'daily') {
      initDailyPuzzle();
      showScreen('game', { pushHistory: false, gameMode: 'daily' });
      return;
    }

    if (modeParam === 'yesterday') {
      var okY = initYesterdayView();
      if (okY) {
        showScreen('yesterday', { pushHistory: false });
      } else {
        initHome();
        showScreen('home', { pushHistory: false });
      }
      return;
    }

    initHome();
    showScreen('home', { pushHistory: false });
  }

  // --- Init: home ---
  function initHome() {
    // Idempotent — only attach handlers once
    if (!homeHandlersAttached) {
      attachHomeHandlers();
      homeHandlersAttached = true;
    }
  }

  function attachHomeHandlers() {
    if (homeBtnDaily) homeBtnDaily.addEventListener('click', function() {
      initDailyPuzzle();
      showScreen('game', { gameMode: 'daily' });
    });
    if (homeBtnTimed) homeBtnTimed.addEventListener('click', function() {
      var ok = initTimedPuzzle();
      if (ok) {
        showScreen('game', { gameMode: 'timed' });
        if (pendingTimedEndModal) {
          pendingTimedEndModal = false;
          openTimedEndModal();
        }
      }
    });
    if (homeBtnCreate) homeBtnCreate.addEventListener('click', function() {
      openModal(modalCreate);
    });
    if (homeBtnYesterday) homeBtnYesterday.addEventListener('click', function() {
      var okY = initYesterdayView();
      if (okY) showScreen('yesterday');
    });
  }

  // --- Init: daily puzzle ---
  function initDailyPuzzle() {
    mode = 'daily';
    isCustomPuzzle = false;
    customPuzzleCode = null;
    timedCompleted = false;
    stopTimerInterval();
    unlockTimedInput();
    if (timerDisplay) timerDisplay.hidden = true;
    if (timerDisplay) timerDisplay.classList.remove('timer-warning');

    dateKey = getTodaysDateKey();
    var seed = getTodaysSeed();
    puzzle = generatePuzzle(seed);
    thresholds = computeRankThresholds(puzzle.commonScore);

    loadDailyState();
    stats = loadStats();
    runOneTimeStatsFix();

    difficultyBadge.textContent = puzzle.difficulty;
    dateDisplay.textContent = formatDate(dateKey);
    streakDisplay.textContent = stats.currentStreak > 1 ? `${stats.currentStreak} 🔥` : '';
    if (btnBackToDaily) btnBackToDaily.hidden = true;

    currentInput = '';
    renderHexGrid();
    renderFoundWords();
    renderRankBar();
    renderInput();
    updateHintNotification();
  }

  // --- Init: custom puzzle ---
  // Returns true on success, false if invalid (caller falls back to home).
  function initCustomPuzzle(customParam) {
    var customData = parseCustomPuzzleParam(customParam);
    if (!customData) return false;

    mode = 'custom';
    isCustomPuzzle = true;
    customPuzzleCode = getCanonicalPuzzleCode(customData.keyLetter, customData.letters);

    timedCompleted = false;
    stopTimerInterval();
    unlockTimedInput();
    if (timerDisplay) timerDisplay.hidden = true;
    if (timerDisplay) timerDisplay.classList.remove('timer-warning');

    // Redirect to canonical URL if needed (preserves /?p=CANONICAL)
    if (customParam.toUpperCase() !== customPuzzleCode) {
      window.location.replace(window.location.pathname + '?p=' + customPuzzleCode);
      return true;
    }

    dateKey = 'custom-' + customPuzzleCode;
    puzzle = generateCustomPuzzle(customData.letters, customData.keyLetter);
    thresholds = computeRankThresholds(puzzle.commonScore);

    loadDailyState();
    stats = loadStats();
    runOneTimeStatsFix();

    difficultyBadge.textContent = puzzle.difficulty;
    dateDisplay.textContent = 'Custom Puzzle';
    streakDisplay.textContent = '';
    if (btnBackToDaily) btnBackToDaily.hidden = false;

    currentInput = '';
    renderHexGrid();
    renderFoundWords();
    renderRankBar();
    renderInput();
    updateHintNotification();
    return true;
  }

  // --- Init: timed puzzle ---
  // Returns true on success, false if generation fails (caller falls back).
  function initTimedPuzzle() {
    mode = 'timed';
    isCustomPuzzle = false;
    customPuzzleCode = null;
    stopTimerInterval();

    var seed = getTodaysTimedSeed();
    try {
      puzzle = generateTimedPuzzle(seed);
    } catch (e) {
      console.error('[bloombert] generateTimedPuzzle failed:', e);
      showToast('Could not generate timed puzzle');
      return false;
    }

    dateKey = getTodaysDateKey();
    thresholds = computeRankThresholds(puzzle.commonScore);

    var saved = loadTimedState(dateKey);
    if (saved) {
      // foundWords is a plain array in timed state — wrap in Set for in-memory use
      foundWords = new Set(saved.foundWords || []);
      // Recalculate score in case scoring rules changed
      currentScore = 0;
      bonusCount = 0;
      for (const w of foundWords) {
        const wb = !COMMON_WORDS.has(w);
        currentScore += scoreWord(w, puzzle.letters, wb);
        if (wb) bonusCount++;
      }
      hintsUsed = { revealedWords: [], selectedTwoLetterKey: null };
      timerStartTimestamp = saved.startTimestamp || null;
      timedCompleted = !!saved.completed;
      // Persist recomputed score/bonus so saved.score doesn't lag if scoring
      // rules ever change. Mirrors loadDailyState's symmetric save.
      saveTimedSnapshot();
    } else {
      foundWords = new Set();
      currentScore = 0;
      bonusCount = 0;
      hintsUsed = { revealedWords: [], selectedTwoLetterKey: null };
      timerStartTimestamp = null;
      timedCompleted = false;
      saveTimedSnapshot();
    }

    stats = loadStats();
    difficultyBadge.textContent = puzzle.difficulty;
    dateDisplay.textContent = '';
    streakDisplay.textContent = '';
    if (btnBackToDaily) btnBackToDaily.hidden = true;

    currentInput = '';
    renderHexGrid();
    renderFoundWords();
    renderRankBar();
    renderInput();
    updateHintNotification();

    if (timerDisplay) {
      timerDisplay.hidden = false;
      timerDisplay.classList.remove('timer-warning');
    }

    if (timedCompleted) {
      // Read-only: lock input and defer end-modal until after caller's
      // showScreen() runs (showScreen closes any open modal as part of its
      // screen-switch cleanup, so opening the modal here would be wiped).
      lockTimedInput();
      timerDisplay.textContent = '0:00';
      pendingTimedEndModal = true;
      return true;
    }
    // Active or not-yet-started: ensure input is unlocked
    unlockTimedInput();
    if (timerStartTimestamp != null) {
      var elapsed = Date.now() - timerStartTimestamp;
      if (elapsed >= TIMED_DURATION_MS) {
        // Time elapsed while away — mark expired and persist, but defer
        // opening the end modal (see comment above; showScreen would close it).
        stopTimerInterval();
        timedCompleted = true;
        saveTimedSnapshot();
        lockTimedInput();
        if (timerDisplay) {
          timerDisplay.textContent = '0:00';
          timerDisplay.classList.add('timer-warning');
        }
        pendingTimedEndModal = true;
      } else {
        // Resume ticking
        renderTimer();
        startTimerInterval();
      }
    } else {
      // Not started yet — display the full duration. Timer starts on first input.
      timerDisplay.textContent = formatTime(TIMED_DURATION_MS);
    }

    return true;
  }

  // --- Init: yesterday view ---
  // Returns true on success, false if generation fails (caller falls back).
  function initYesterdayView() {
    mode = 'daily'; // safe default; we don't actively play in this screen
    var todaySeed = getTodaysSeed();
    var yesterdaySeed = getPrevDaySeeds(todaySeed, 1)[0];
    var yPuzzle;
    try {
      yPuzzle = generatePuzzle(yesterdaySeed);
    } catch (e) {
      console.error('[bloombert] yesterday generatePuzzle failed:', e);
      showToast('Could not load yesterday');
      return false;
    }
    var yDateKey = seedToDateStr(yesterdaySeed);
    var yState = loadState(yDateKey);
    var userFound = yState && yState.foundWords
      ? new Set([...yState.foundWords].map(function(w) { return w.toLowerCase(); }))
      : new Set();

    // Date header
    if (yesterdayDate) {
      var dateObj = new Date(yDateKey + 'T00:00:00');
      yesterdayDate.textContent = dateObj.toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }

    // Letter row — outer letters first, centre last (visually distinct via class)
    if (yesterdayLetterRow) {
      yesterdayLetterRow.innerHTML = '';
      var outer = yPuzzle.letters.filter(function(l) { return l !== yPuzzle.keyLetter; });
      for (var i = 0; i < outer.length; i++) {
        var t = document.createElement('div');
        t.className = 'letter-tile';
        t.textContent = outer[i].toUpperCase();
        yesterdayLetterRow.appendChild(t);
      }
      var c = document.createElement('div');
      c.className = 'letter-tile letter-tile-centre';
      c.textContent = yPuzzle.keyLetter.toUpperCase();
      yesterdayLetterRow.appendChild(c);
    }

    // Pangrams: any valid word that uses all 7 letters
    if (yesterdayPangrams) {
      var pangramsUl = yesterdayPangrams.querySelector('ul');
      var pangramSet = new Set();
      for (var ci = 0; ci < yPuzzle.commonWords.length; ci++) {
        var cw = yPuzzle.commonWords[ci];
        if (isBloom(cw, yPuzzle.letters)) pangramSet.add(cw);
      }
      for (var bi = 0; bi < yPuzzle.bonusWords.length; bi++) {
        var bw = yPuzzle.bonusWords[bi];
        if (isBloom(bw, yPuzzle.letters)) pangramSet.add(bw);
      }
      var pangrams = [...pangramSet].sort();
      if (pangramsUl) {
        pangramsUl.innerHTML = '';
        if (pangrams.length === 0) {
          yesterdayPangrams.hidden = true;
        } else {
          yesterdayPangrams.hidden = false;
          for (var pi = 0; pi < pangrams.length; pi++) {
            var li = document.createElement('li');
            li.textContent = pangrams[pi].toUpperCase();
            pangramsUl.appendChild(li);
          }
        }
      }
    }

    // Common words list — found vs missed
    if (yesterdayWordsList) {
      yesterdayWordsList.innerHTML = '';
      var commonSorted = yPuzzle.commonWords.slice().sort();
      for (var wi = 0; wi < commonSorted.length; wi++) {
        var w = commonSorted[wi];
        var liEl = document.createElement('li');
        liEl.className = userFound.has(w) ? 'word-found' : 'word-missed';
        liEl.textContent = w.toUpperCase();
        yesterdayWordsList.appendChild(liEl);
      }
    }

    // Summary
    if (yesterdaySummary) {
      if (!yState) {
        yesterdaySummary.textContent = "You didn't play yesterday — here's the solution.";
      } else {
        var foundC = 0;
        for (var fi = 0; fi < yPuzzle.commonWords.length; fi++) {
          if (userFound.has(yPuzzle.commonWords[fi])) foundC++;
        }
        yesterdaySummary.textContent = 'You found ' + foundC + ' of ' + yPuzzle.commonWords.length + ' common words';
      }
    }
    return true;
  }

  // --- Daily/custom state load helper (extracted from old init) ---
  function loadDailyState() {
    const saved = loadState(dateKey);
    if (saved) {
      foundWords = saved.foundWords instanceof Set ? saved.foundWords : new Set(saved.foundWords);
      currentScore = 0;
      bonusCount = 0;
      for (const w of foundWords) {
        const wb = !COMMON_WORDS.has(w);
        currentScore += scoreWord(w, puzzle.letters, wb);
        if (wb) bonusCount++;
      }
      hintsUsed = saved.hintsUsed || { revealedWords: [], selectedTwoLetterKey: null };
      saveState(dateKey, { foundWords, score: currentScore, hintsUsed });
    } else {
      foundWords = new Set();
      currentScore = 0;
      bonusCount = 0;
      hintsUsed = { revealedWords: [] };
      saveState(dateKey, { foundWords, score: currentScore, hintsUsed });
    }
  }

  // --- One-time stats migration (extracted from old init, runs idempotently) ---
  function runOneTimeStatsFix() {
    if (stats.wordCountFixed) return;
    let actualPlayed = 0;
    let actualWords = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('bloombert-state-') && !k.startsWith('bloombert-state-custom-') && k !== `bloombert-state-${dateKey}`) {
        try {
          const s = JSON.parse(localStorage.getItem(k));
          if (s && s.foundWords) {
            const wc = Array.isArray(s.foundWords) ? s.foundWords.length : 0;
            if (wc > 0) {
              actualPlayed++;
              actualWords += wc;
            }
          }
        } catch (e) {}
      }
    }
    if (foundWords.size > 0) {
      actualPlayed++;
      actualWords += foundWords.size;
    }
    stats.gamesPlayed = actualPlayed;
    stats.totalWords = actualWords;
    stats.playedCountFixed = true;
    stats.wordCountFixed = true;
    saveStats(stats);
  }

  // --- Timer helpers ---
  function formatTime(ms) {
    if (ms < 0) ms = 0;
    var totalSec = Math.ceil(ms / 1000);
    var m = Math.floor(totalSec / 60);
    var s = totalSec % 60;
    return m + ':' + (s < 10 ? '0' + s : '' + s);
  }

  function renderTimer() {
    if (!timerDisplay) return;
    var remaining = (timerStartTimestamp != null)
      ? (timerStartTimestamp + TIMED_DURATION_MS - Date.now())
      : TIMED_DURATION_MS;
    timerDisplay.textContent = formatTime(remaining);
    if (remaining < TIMER_WARNING_MS) {
      timerDisplay.classList.add('timer-warning');
    } else {
      timerDisplay.classList.remove('timer-warning');
    }
  }

  function tick() {
    if (timerStartTimestamp == null) return;
    var remaining = timerStartTimestamp + TIMED_DURATION_MS - Date.now();
    renderTimer();
    if (remaining <= 0) expireTimer();
  }

  function startTimer() {
    if (timerStartTimestamp != null) return; // already started
    timerStartTimestamp = Date.now();
    saveTimedSnapshot();
    renderTimer();
    startTimerInterval();
  }

  function startTimerInterval() {
    if (timerInterval) return;
    timerInterval = setInterval(tick, TIMER_TICK_MS);
  }

  function stopTimerInterval() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function expireTimer() {
    stopTimerInterval();
    timedCompleted = true;
    saveTimedSnapshot();
    lockTimedInput();
    if (timerDisplay) {
      timerDisplay.textContent = '0:00';
      timerDisplay.classList.add('timer-warning');
    }
    openTimedEndModal();
  }

  function lockTimedInput() {
    if (btnEnter) btnEnter.disabled = true;
    if (btnDelete) btnDelete.disabled = true;
    if (btnShuffle) btnShuffle.disabled = true;
  }

  function unlockTimedInput() {
    if (btnEnter) btnEnter.disabled = false;
    if (btnDelete) btnDelete.disabled = false;
    if (btnShuffle) btnShuffle.disabled = false;
  }

  function saveTimedSnapshot() {
    saveTimedState(dateKey, {
      foundWords: [...foundWords],
      score: currentScore,
      startTimestamp: timerStartTimestamp,
      completed: timedCompleted,
      finalScore: timedCompleted ? currentScore : null,
    });
  }

  function openTimedEndModal() {
    if (!modalTimedEnd) return;
    // If any other modal is currently open (e.g. user opened stats while the
    // timer was still ticking), close it first so we don't end up with two
    // modals stacked at z-index:200 and a doubled modalHistoryCount.
    var openModals = document.querySelectorAll('.modal:not([hidden])');
    for (var i = 0; i < openModals.length; i++) {
      if (openModals[i] !== modalTimedEnd) closeModal(openModals[i]);
    }
    if (timedEndScore) timedEndScore.textContent = currentScore;
    var commonFound = foundWords.size - bonusCount;
    if (timedEndFound) timedEndFound.textContent = commonFound;
    if (timedEndTotal) timedEndTotal.textContent = puzzle.commonWords.length;
    if (timedEndRank) {
      var r = getRank(currentScore, thresholds);
      timedEndRank.textContent = r.emoji + ' ' + r.name;
    }
    openModal(modalTimedEnd);
  }

  // --- Date formatting ---
  function formatDate(key) {
    const [y, m, d] = key.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
  }

  // --- Rendering ---
  function renderHexGrid() {
    const tiles = hexGrid.querySelectorAll('.hex-tile');
    tiles.forEach((tile) => {
      const idx = parseInt(tile.dataset.index, 10);
      const letter = puzzle.letters[idx];
      tile.dataset.letter = letter;
      tile.querySelector('.hex-letter').textContent = letter.toUpperCase();
      tile.setAttribute('aria-label', letter.toUpperCase() + (idx === 0 ? ' (key letter)' : ''));
    });
  }

  function renderFoundWords() {
    const sorted = [...foundWords].reverse();
    foundWordsList.innerHTML = '';
    for (const word of sorted) {
      const pill = document.createElement('span');
      pill.className = 'word-pill pop-in';
      pill.setAttribute('role', 'listitem');
      const isBonus = !COMMON_WORDS.has(word);
      if (isBloom(word, puzzle.letters)) {
        pill.classList.add('word-pill--bloom');
        pill.textContent = '✨ ' + word;
      } else if (isBonus) {
        pill.classList.add('word-pill--bonus');
        pill.textContent = word;
      } else {
        pill.textContent = word;
      }
      foundWordsList.appendChild(pill);
    }
    const commonFound = foundWords.size - bonusCount;
    let countText = `${commonFound} word${commonFound !== 1 ? 's' : ''}`;
    if (bonusCount > 0) {
      countText += ` + ${bonusCount} bonus`;
    }
    foundCount.textContent = countText;
    scoreDisplay.textContent = `${currentScore} pts`;
    foundWordsList.scrollLeft = 0;
    if (btnViewAll) btnViewAll.hidden = foundWords.size < 4;
  }

  function renderAllWordsModal() {
    if (!allWordsContent) return;
    const wordsByLength = {};
    for (const word of foundWords) {
      const len = word.length;
      if (!wordsByLength[len]) wordsByLength[len] = [];
      wordsByLength[len].push(word);
    }
    const lengths = Object.keys(wordsByLength).map(Number).sort((a, b) => b - a);
    allWordsContent.innerHTML = '';
    for (const len of lengths) {
      const words = wordsByLength[len].sort();
      const group = document.createElement('div');
      group.className = 'all-words-group';
      const title = document.createElement('div');
      title.className = 'all-words-group-title';
      title.textContent = len + ' letters (' + words.length + ')';
      group.appendChild(title);
      const list = document.createElement('div');
      list.className = 'all-words-group-list';
      for (const word of words) {
        const pill = document.createElement('span');
        pill.className = 'word-pill';
        const isBonus = !COMMON_WORDS.has(word);
        if (isBloom(word, puzzle.letters)) {
          pill.classList.add('word-pill--bloom');
          pill.textContent = '✨ ' + word;
        } else if (isBonus) {
          pill.classList.add('word-pill--bonus');
          pill.textContent = word;
        } else {
          pill.textContent = word;
        }
        list.appendChild(pill);
      }
      group.appendChild(list);
      allWordsContent.appendChild(group);
    }
  }

  function renderRankBar() {
    const rank = getRank(currentScore, thresholds);
    rankEmoji.textContent = rank.emoji;
    rankName.textContent = rank.name;
    progressBarFill.style.width = rank.progressPct + '%';
    progressLabel.textContent = `${currentScore} pts`;
    const track = progressBarFill.parentElement;
    if (track) track.setAttribute('aria-valuenow', Math.round(rank.progressPct));
  }

  function renderInput() {
    inputText.textContent = currentInput.toUpperCase();
  }

  // --- Input handling ---
  function appendLetter(letter) {
    if (mode === 'timed' && timedCompleted) return;
    // Timed mode: first interaction starts the timer
    if (mode === 'timed' && timerStartTimestamp == null) {
      startTimer();
    }
    currentInput += letter.toLowerCase();
    renderInput();
  }

  function deleteLetter() {
    if (mode === 'timed' && timedCompleted) return;
    if (currentInput.length > 0) {
      currentInput = currentInput.slice(0, -1);
      renderInput();
    }
  }

  function clearInput() {
    currentInput = '';
    renderInput();
  }

  // --- Submit ---
  function submitGuess() {
    if (mode === 'timed' && timedCompleted) return;
    const word = currentInput.toLowerCase();
    if (word.length === 0) return;

    // Timed mode: ensure timer is running on first submit too
    if (mode === 'timed' && timerStartTimestamp == null) {
      startTimer();
    }

    const result = isValidGuess(word, puzzle.letters, puzzle.keyLetter, foundWords);

    if (!result.valid) {
      const messages = {
        too_short: 'Too short — need 4+ letters',
        missing_key: `Must include centre letter "${puzzle.keyLetter.toUpperCase()}"`,
        invalid_chars: 'Only use the given letters',
        not_a_word: 'Not in word list',
        already_found: 'Already found!',
      };
      showToast(messages[result.reason] || 'Invalid word');
      inputDisplay.classList.add('shake');
      inputDisplay.addEventListener('animationend', () => inputDisplay.classList.remove('shake'), { once: true });
      document.dispatchEvent(new CustomEvent('Bloombert:error', { detail: { reason: result.reason } }));
      clearInput();
      return;
    }

    // Valid word
    const prevRank = getRank(currentScore, thresholds).name;
    const isBonus = !COMMON_WORDS.has(word);
    const points = scoreWord(word, puzzle.letters, isBonus);
    const bloom = isBloom(word, puzzle.letters);

    foundWords.add(word);
    currentScore += points;
    if (isBonus) bonusCount++;

    persistGameState();

    // Stats updates only for daily mode (not timed, not custom)
    if (mode === 'daily') {
      if (foundWords.size === 1) {
        stats = checkAndUpdateStreak(stats, dateKey);
        stats.gamesPlayed = (stats.gamesPlayed || 0) + 1;
      }
      stats.totalWords = (stats.totalWords || 0) + 1;
      saveStats(stats);
    }

    renderFoundWords();
    renderRankBar();
    clearInput();
    if (modalHints && !modalHints.hidden) renderHintsModal();

    showScoreFloat(isBonus ? `+${points} bonus` : `+${points}`);
    document.dispatchEvent(new CustomEvent('Bloombert:success', { detail: { word, points } }));

    // Flash success on hex tiles
    hexGrid.querySelectorAll('.hex-tile').forEach(tile => {
      tile.classList.add('flash-success');
      tile.addEventListener('animationend', () => tile.classList.remove('flash-success'), { once: true });
    });

    const newRank = getRank(currentScore, thresholds).name;
    if (newRank !== prevRank) {
      document.dispatchEvent(new CustomEvent('Bloombert:rankup', { detail: { rank: newRank } }));
      const rankSection = document.querySelector('.rank-section');
      if (rankSection) {
        rankSection.classList.remove('rankup-celebrate');
        void rankSection.offsetWidth;
        rankSection.classList.add('rankup-celebrate');
        rankSection.addEventListener('animationend', function handler(e) {
          if (e.target === rankSection) {
            rankSection.classList.remove('rankup-celebrate');
            rankSection.removeEventListener('animationend', handler);
          }
        });
      }
      var newRankIdx = RANK_ORDER.indexOf(newRank);
      if (HINT_UNLOCK_RANKS.indexOf(newRankIdx) !== -1) {
        setTimeout(function() { showToast('💡 New hint unlocked!'); }, 600);
      }
      if (newRank === 'Garden Master') {
        launchConfetti();
        setTimeout(function() { shareResults(); }, 1800);
      }
      updateHintNotification();
    }

    if (bloom) {
      document.dispatchEvent(new CustomEvent('Bloombert:bloom', { detail: { word } }));
      bloomWordDisplay.textContent = word.toUpperCase();
      openModal(modalBloom);
    }
  }

  // Persist current game state to the appropriate storage based on mode
  function persistGameState() {
    if (mode === 'timed') {
      saveTimedSnapshot();
    } else {
      saveState(dateKey, { foundWords, score: currentScore, hintsUsed });
    }
  }

  // --- Shuffle ---
  function shuffleOuter() {
    if (mode === 'timed' && timedCompleted) return;
    const outer = puzzle.letters.slice(1);
    for (let i = outer.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [outer[i], outer[j]] = [outer[j], outer[i]];
    }
    puzzle.letters = [puzzle.letters[0], ...outer];

    var petals = hexGrid.querySelectorAll('.flower-petal');
    petals.forEach(function (p) {
      p.classList.remove('shuffling');
      void p.offsetWidth;
      p.classList.add('shuffling');
      p.addEventListener('animationend', function () { p.classList.remove('shuffling'); }, { once: true });
    });

    setTimeout(renderHexGrid, 140);
  }

  // --- Toast ---
  let toastTimer = null;
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('toast--visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('toast--visible');
    }, 2000);
  }

  // --- Score float ---
  var scoreFloatTimer = null;
  function showScoreFloat(text) {
    clearTimeout(scoreFloatTimer);
    scoreFloat.textContent = text;
    scoreFloat.classList.add('score-float--active');
    scoreFloatTimer = setTimeout(function() {
      scoreFloat.classList.remove('score-float--active');
    }, 2000);
  }

  // --- Confetti (petal-themed) ---
  function launchConfetti() {
    var container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
    var petals = ['🌸', '🌺', '🌼', '💐', '🌻', '🌷', '🌹', '✨', '🌟'];
    for (var i = 0; i < 50; i++) {
      var span = document.createElement('span');
      span.className = 'confetti-petal';
      span.textContent = petals[Math.floor(Math.random() * petals.length)];
      span.style.left = Math.random() * 100 + '%';
      span.style.animationDelay = Math.random() * 2 + 's';
      span.style.animationDuration = (2 + Math.random() * 2) + 's';
      span.style.fontSize = (14 + Math.random() * 14) + 'px';
      container.appendChild(span);
    }
    setTimeout(function() { container.remove(); }, 5000);
  }

  // --- Modals ---
  var modalHistoryCount = 0;
  var popstateSkips = 0;

  function openModal(modal) {
    if (!modal) return;
    modal.hidden = false;
    modalHistoryCount++;
    history.pushState({ bloombert_modal: true }, '');
  }

  function closeModal(modal) {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    if (modalHistoryCount > 0) {
      modalHistoryCount--;
      popstateSkips++;
      history.back();
    }
  }

  // Swap one modal for another, reusing the same history entry
  function swapModal(from, to) {
    from.hidden = true;
    to.hidden = false;
  }

  window.addEventListener('popstate', function(e) {
    // closeModal() pushes a popstateSkips flag and calls history.back().
    // Consume the skip and exit — even though we may have landed on a routing
    // state entry, the user didn't actually navigate; they closed a modal.
    if (popstateSkips > 0) {
      popstateSkips--;
      return;
    }
    var st = e.state;
    // If a modal is open, pressing back closes the modal — even if the popped
    // state is a routing entry. The modal's pushState was on top, so popping
    // means the modal entry was just removed.
    var openModalEl = document.querySelector('.modal:not([hidden])');
    if (openModalEl) {
      openModalEl.hidden = true;
      if (modalHistoryCount > 0) modalHistoryCount--;
      return;
    }
    // Routing state: user navigated between screens via back/forward.
    if (st && st.mode && (st.mode === 'home' || st.mode === 'game' || st.mode === 'yesterday')) {
      if (st.mode === currentScreen) return; // already there
      if (st.mode === 'home') {
        initHome();
        applyShowScreenFromPop('home');
      } else if (st.mode === 'yesterday') {
        var okY = initYesterdayView();
        if (okY) {
          applyShowScreenFromPop('yesterday');
        } else {
          // Generation failed — redirect to home and rewrite URL.
          initHome();
          applyShowScreenFromPop('home');
          history.replaceState({ mode: 'home' }, '', window.location.pathname);
        }
      } else if (st.mode === 'game') {
        var params = new URLSearchParams(window.location.search);
        if (params.get('p')) {
          var ok = initCustomPuzzle(params.get('p'));
          if (ok) applyShowScreenFromPop('game');
        } else if (params.get('mode') === 'timed') {
          if (initTimedPuzzle()) {
            applyShowScreenFromPop('game');
            if (pendingTimedEndModal) {
              pendingTimedEndModal = false;
              openTimedEndModal();
            }
          }
        } else {
          initDailyPuzzle();
          applyShowScreenFromPop('game');
        }
      }
    }
  });

  // Toggle screens without touching history (used in popstate handler)
  function applyShowScreenFromPop(name) {
    if (currentScreen === 'game' && name !== 'game' && mode === 'timed') {
      stopTimerInterval();
    }
    screenHome.hidden = name !== 'home';
    screenGame.hidden = name !== 'game';
    screenYesterday.hidden = name !== 'yesterday';
    currentScreen = name;
  }

  function updateStatsModal() {
    $('stat-played').textContent = stats.gamesPlayed || 0;
    $('stat-words').textContent = stats.totalWords || 0;
    $('stat-streak').textContent = stats.currentStreak || 0;
    $('stat-best-streak').textContent = Math.max(stats.bestStreak || 0, stats.currentStreak || 0);
    renderGardenGraph();
  }

  function renderGardenGraph() {
    var container = $('garden-graph');
    if (!container) return;
    // In non-daily modes, dateKey is either today's date (timed) or
    // 'custom-XXXXX' (custom). Either way, the in-memory foundWords reflects
    // timed/custom progress, not daily — so pass undefined to let the helper
    // read today's daily state from localStorage like every other day. Use
    // getTodaysDateKey() so the "today" highlight still lines up.
    var todayKey = getTodaysDateKey();
    var data = (mode === 'daily')
      ? getDailyWordCounts(dateKey, 7, foundWords.size)
      : getDailyWordCounts(todayKey, 7, undefined);
    var maxWords = Math.max.apply(null, data.map(function(d) { return d.words; }));
    if (maxWords === 0) maxWords = 1;
    var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var flowers = ['🌱','🌿','🌼','🌸','🌺','🌻','💐'];

    container.innerHTML = '';
    for (var i = 0; i < data.length; i++) {
      var entry = data[i];
      var pct = Math.round((entry.words / maxWords) * 100);
      var isToday = entry.date === todayKey;
      var dayDate = new Date(entry.date + 'T00:00:00');
      var dayLabel = dayNames[dayDate.getDay()];

      var flowerIdx = entry.words === 0 ? 0 : Math.min(Math.floor((entry.words / maxWords) * (flowers.length - 1)) + 1, flowers.length - 1);
      var flower = flowers[flowerIdx];

      var col = document.createElement('div');
      col.className = 'garden-col' + (isToday ? ' garden-col--today' : '');

      var flowerEl = document.createElement('div');
      flowerEl.className = 'garden-flower';
      flowerEl.textContent = flower;

      var stemWrap = document.createElement('div');
      stemWrap.className = 'garden-stem-wrap';

      var stem = document.createElement('div');
      stem.className = 'garden-stem';
      stem.style.height = (pct === 0 ? 4 : pct) + '%';

      stemWrap.appendChild(stem);

      var count = document.createElement('div');
      count.className = 'garden-count';
      count.textContent = entry.words;

      var label = document.createElement('div');
      label.className = 'garden-day';
      label.textContent = dayLabel;

      var dateParts = entry.date.split('-');
      var dateLabel = document.createElement('div');
      dateLabel.className = 'garden-date';
      dateLabel.textContent = dateParts[2] + '/' + dateParts[1];

      col.appendChild(flowerEl);
      col.appendChild(stemWrap);
      col.appendChild(count);
      col.appendChild(label);
      col.appendChild(dateLabel);
      container.appendChild(col);
    }
  }

  // --- Share ---
  function getShareText() {
    const rank = getRank(currentScore, thresholds);
    const bloomCount = [...foundWords].filter(w => isBloom(w, puzzle.letters)).length;
    const commonFound = foundWords.size - bonusCount;
    return formatShareText(dateKey, rank, commonFound, puzzle.commonWords.length, currentScore, bloomCount, bonusCount, isCustomPuzzle ? customPuzzleCode : null);
  }

  function shareResults() {
    const text = getShareText();
    sharePreview.textContent = text;
    if (!modalStats.hidden) {
      swapModal(modalStats, modalShare);
    } else {
      openModal(modalShare);
    }
  }

  function copyShareText() {
    const text = getShareText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        btnCopyShare.innerHTML = ICON_CHECK + ' Copied!';
        setTimeout(() => { btnCopyShare.innerHTML = ICON_CLIPBOARD + ' Copy to Clipboard'; }, 2000);
      }).catch(() => {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      btnCopyShare.innerHTML = ICON_CHECK + ' Copied!';
      setTimeout(() => { btnCopyShare.innerHTML = ICON_CLIPBOARD + ' Copy to Clipboard'; }, 2000);
    } catch (e) {
      showToast('Could not copy');
    }
    document.body.removeChild(ta);
  }

  // --- Hints ---
  const RANK_ORDER = ['Seedling', 'Sprout', 'Bud', 'Bloom', 'Petal', 'Sunflower', 'Bouquet', 'Garden Master'];
  var HINT_UNLOCK_RANKS = [1, 3, 4, 5, 6]; // Sprout, Bloom, Petal, Sunflower, Bouquet

  function getCurrentRankIndex() {
    return RANK_ORDER.indexOf(getRank(currentScore, thresholds).name);
  }

  function hasUnseenHints() {
    var seen = hintsUsed.lastSeenRankIdx != null ? hintsUsed.lastSeenRankIdx : -1;
    var current = getCurrentRankIndex();
    return HINT_UNLOCK_RANKS.some(function(r) { return r > seen && r <= current; });
  }

  function updateHintNotification() {
    var show = hasUnseenHints();
    if (btnHints) btnHints.classList.toggle('hint-notify', show);
    if (btnHintsInline) btnHintsInline.classList.toggle('hint-notify', show);
  }

  function openHintsModal() {
    renderHintsModal();
    hintsUsed.lastSeenRankIdx = getCurrentRankIndex();
    persistGameState();
    updateHintNotification();
    openModal(modalHints);
  }

  function getHintWords() {
    var words = puzzle.commonWords.slice();
    for (var i = 0; i < puzzle.bonusWords.length; i++) {
      var w = puzzle.bonusWords[i];
      if (isBloom(w, puzzle.letters)) words.push(w);
    }
    return words;
  }

  function computeWordLengthGrid() {
    var buckets = {};
    var hintWords = getHintWords();
    for (var i = 0; i < hintWords.length; i++) {
      var w = hintWords[i];
      var len = w.length;
      if (!buckets[len]) buckets[len] = { total: 0, found: 0 };
      buckets[len].total++;
      if (foundWords.has(w)) buckets[len].found++;
    }
    return Object.keys(buckets).map(Number).sort(function(a, b) { return a - b; }).map(function(len) {
      return { length: len, found: buckets[len].found, total: buckets[len].total };
    });
  }

  function computeOneLetterList() {
    var groups = {};
    var hintWords = getHintWords();
    for (var i = 0; i < hintWords.length; i++) {
      var w = hintWords[i];
      var letter = w[0].toUpperCase();
      if (!groups[letter]) groups[letter] = { total: 0, remaining: 0 };
      groups[letter].total++;
      if (!foundWords.has(w)) groups[letter].remaining++;
    }
    return Object.keys(groups).sort().map(function(letter) {
      return { letter: letter, remaining: groups[letter].remaining, total: groups[letter].total };
    });
  }


  function getNextRevealWord() {
    var unfound = getHintWords()
      .filter(function(w) { return !foundWords.has(w); })
      .sort(function(a, b) { return a.length - b.length || a.localeCompare(b); });
    return unfound.length > 0 ? unfound[0] : null;
  }

  function renderHintsModal() {
    var rankIdx = getCurrentRankIndex();
    // TODO: remove testing override — forces all hints unlocked
    var testUnlockAll = false;  // unlock all hints toggle
    var effectiveIdx = testUnlockAll ? 6 : rankIdx;
    document.querySelectorAll('.hint-section').forEach(function(section) {
      var requiredIdx = parseInt(section.dataset.unlockRank, 10);
      var unlocked = effectiveIdx >= requiredIdx;
      var lockedEl = section.querySelector('.hint-locked');
      var contentEl = section.querySelector('.hint-content');
      lockedEl.hidden = unlocked;
      contentEl.hidden = !unlocked;
    });
    if (effectiveIdx >= 1) renderLengthGrid();
    if (effectiveIdx >= 3) renderOneLetterList();
    if (effectiveIdx >= 4) renderRevealSection(0);
    if (effectiveIdx >= 5) renderTwoLetterPicker();
    if (effectiveIdx >= 6) renderRevealSection(1);
  }

  function renderLengthGrid() {
    var tbody = $('hint-grid-tbody');
    var data = computeWordLengthGrid();
    tbody.innerHTML = '';
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var remaining = row.total - row.found;
      var tr = document.createElement('tr');
      if (remaining === 0) tr.classList.add('hint-row--complete');
      tr.innerHTML = '<td>' + row.length + '</td><td>' + remaining + '</td>';
      tbody.appendChild(tr);
    }
  }

  function renderOneLetterList() {
    var tbody = $('hint-one-letter-tbody');
    var data = computeOneLetterList();
    tbody.innerHTML = '';
    var allDone = data.every(function(d) { return d.remaining === 0; });
    if (allDone) {
      tbody.innerHTML = '<tr><td colspan="2" class="hint-all-found">All words found!</td></tr>';
      return;
    }
    for (var i = 0; i < data.length; i++) {
      var tr = document.createElement('tr');
      if (data[i].remaining === 0) tr.classList.add('hint-row--complete');
      tr.innerHTML = '<td>' + data[i].letter + '</td><td>' + data[i].remaining + '</td>';
      tbody.appendChild(tr);
    }
  }

  function computeTwoLetterWordsByLetter() {
    var groups = {};
    var hintWords = getHintWords();
    for (var i = 0; i < hintWords.length; i++) {
      var w = hintWords[i];
      var letter = w[0].toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(w);
    }
    return groups;
  }

  function renderTwoLetterPicker() {
    var picker = $('hint-two-letter-picker');
    var wordsContainer = $('hint-two-letter-words');
    var groups = computeTwoLetterWordsByLetter();
    var letters = Object.keys(groups).sort();
    var selected = hintsUsed.selectedTwoLetterKey;

    picker.innerHTML = '';
    for (var i = 0; i < letters.length; i++) {
      var letter = letters[i];
      var unfound = groups[letter].filter(function(w) { return !foundWords.has(w); });
      var btn = document.createElement('button');
      btn.className = 'hint-picker-btn';
      btn.dataset.letter = letter;
      if (selected === letter) {
        btn.classList.add('hint-picker-btn--active');
        btn.textContent = letter;
      } else if (selected) {
        btn.classList.add('hint-picker-btn--locked');
        btn.textContent = letter;
        btn.disabled = true;
      } else if (unfound.length === 0) {
        btn.classList.add('hint-picker-btn--done');
        btn.textContent = letter;
      } else {
        btn.textContent = letter;
      }
      picker.appendChild(btn);
    }

    wordsContainer.innerHTML = '';
    if (selected && groups[selected]) {
      var unfound = groups[selected].filter(function(w) { return !foundWords.has(w); });
      if (unfound.length === 0) {
        wordsContainer.innerHTML = '<p class="hint-all-found">All "' + selected + '" words found! 🌸</p>';
      } else {
        unfound.sort(function(a, b) { return a.length - b.length || a.localeCompare(b); });
        for (var j = 0; j < unfound.length; j++) {
          var w = unfound[j];
          var prefix = w.slice(0, 2).toUpperCase();
          var dashes = '';
          for (var k = 2; k < w.length; k++) dashes += ' _';
          var wordEl = document.createElement('span');
          wordEl.className = 'hint-two-letter-word';
          wordEl.textContent = prefix + dashes;
          wordsContainer.appendChild(wordEl);
        }
      }
    }
  }

  function renderRevealSection(revealIndex) {
    var section = $('hint-reveal-' + (revealIndex + 1));
    var wrap = section.querySelector('.hint-reveal-wrap');
    var display = section.querySelector('.hint-revealed-word');
    var revealedWord = hintsUsed.revealedWords[revealIndex];
    if (revealedWord) {
      if (wrap) wrap.hidden = true;
      display.hidden = false;
      display.textContent = revealedWord.toUpperCase();
      display.className = 'hint-revealed-word';
      if (foundWords.has(revealedWord)) {
        display.classList.add('hint-revealed--found');
      }
    } else {
      if (wrap) wrap.hidden = false;
      display.hidden = true;
      var btn = wrap && wrap.querySelector('.hint-reveal-btn');
      if (btn) {
        var noWords = !getNextRevealWord();
        btn.disabled = noWords;
        btn.classList.toggle('hint-reveal-btn--disabled', noWords);
      }
    }
  }

  function revealWord(revealIndex) {
    if (hintsUsed.revealedWords[revealIndex]) return;

    var word = getNextRevealWord();
    if (!word) {
      showToast('All words found!');
      return;
    }

    hintsUsed.revealedWords[revealIndex] = word;

    var prevRank = getRank(currentScore, thresholds).name;
    var isBonus = !COMMON_WORDS.has(word);
    var points = scoreWord(word, puzzle.letters, isBonus);
    var bloom = isBloom(word, puzzle.letters);

    foundWords.add(word);
    currentScore += points;

    persistGameState();

    if (mode === 'daily') {
      if (foundWords.size === 1) {
        stats = checkAndUpdateStreak(stats, dateKey);
        stats.gamesPlayed = (stats.gamesPlayed || 0) + 1;
      }
      stats.totalWords = (stats.totalWords || 0) + 1;
      saveStats(stats);
    }

    renderFoundWords();
    renderRankBar();
    renderHintsModal();

    showScoreFloat('+' + points + ' (hint)');

    var newRank = getRank(currentScore, thresholds).name;
    if (newRank !== prevRank) {
      document.dispatchEvent(new CustomEvent('Bloombert:rankup', { detail: { rank: newRank } }));
      var rankSection = document.querySelector('.rank-section');
      if (rankSection) {
        rankSection.classList.remove('rankup-celebrate');
        void rankSection.offsetWidth;
        rankSection.classList.add('rankup-celebrate');
        rankSection.addEventListener('animationend', function handler(e) {
          if (e.target === rankSection) {
            rankSection.classList.remove('rankup-celebrate');
            rankSection.removeEventListener('animationend', handler);
          }
        });
      }
      var newRankIdx = RANK_ORDER.indexOf(newRank);
      if (HINT_UNLOCK_RANKS.indexOf(newRankIdx) !== -1) {
        setTimeout(function() { showToast('💡 New hint unlocked!'); }, 600);
      }
      if (newRank === 'Garden Master') {
        launchConfetti();
        setTimeout(function() { shareResults(); }, 1800);
      }
      updateHintNotification();
    }

    if (bloom) {
      document.dispatchEvent(new CustomEvent('Bloombert:bloom', { detail: { word: word } }));
      bloomWordDisplay.textContent = word.toUpperCase();
      openModal(modalBloom);
    }
  }

  // --- Persistent events (registered once at startup) ---
  function bindPersistentEvents() {
    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.modal:not([hidden])')) return;
      if (currentScreen !== 'game') return;
      if (mode === 'timed' && timedCompleted) return;

      if (e.key === 'Backspace') {
        e.preventDefault();
        deleteLetter();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        submitGuess();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        appendLetter(e.key);
      }
    });

    // Hex tile clicks
    hexGrid.addEventListener('click', (e) => {
      if (mode === 'timed' && timedCompleted) return;
      const tile = e.target.closest('.hex-tile');
      if (tile && tile.dataset.letter) {
        appendLetter(tile.dataset.letter);
      }
    });

    // Action buttons
    btnDelete.addEventListener('click', deleteLetter);
    btnShuffle.addEventListener('click', shuffleOuter);
    btnEnter.addEventListener('click', submitGuess);

    // Header buttons
    btnHowToPlay.addEventListener('click', () => openModal(modalHowToPlay));
    btnStats.addEventListener('click', () => {
      updateStatsModal();
      openModal(modalStats);
    });
    if (btnHome) btnHome.addEventListener('click', function() {
      // Stop the timer interval if a timed game is in progress.
      // We deliberately keep state.startTimestamp untouched: time keeps
      // elapsing in real time, and if the user returns mid-window, tick()
      // catches up correctly (or expireTimer fires immediately if elapsed).
      if (mode === 'timed' && !timedCompleted) {
        stopTimerInterval();
      }
      initHome();
      showScreen('home');
    });

    // Yesterday → Home
    if (yesterdayBtnHome) yesterdayBtnHome.addEventListener('click', function() {
      initHome();
      showScreen('home');
    });

    // Timed end modal → Home
    if (timedEndHome) timedEndHome.addEventListener('click', function() {
      closeModal(modalTimedEnd);
      initHome();
      showScreen('home');
    });

    // Share
    if (btnShare) btnShare.addEventListener('click', shareResults);
    if (btnShareHeader) btnShareHeader.addEventListener('click', shareResults);
    if (btnCopyShare) btnCopyShare.addEventListener('click', copyShareText);
    if (btnViewAll) btnViewAll.addEventListener('click', function() {
      renderAllWordsModal();
      openModal(modalAllWords);
    });

    // Hints
    if (btnHints) btnHints.addEventListener('click', openHintsModal);
    if (btnHintsInline) btnHintsInline.addEventListener('click', openHintsModal);
    if (modalHints) modalHints.addEventListener('click', function(e) {
      var revealBtn = e.target.closest('.hint-reveal-btn');
      if (revealBtn) {
        var idx = parseInt(revealBtn.dataset.revealIndex, 10);
        revealWord(idx);
        return;
      }
      var pickerBtn = e.target.closest('.hint-picker-btn');
      if (pickerBtn && !pickerBtn.classList.contains('hint-picker-btn--done') && !hintsUsed.selectedTwoLetterKey) {
        hintsUsed.selectedTwoLetterKey = pickerBtn.dataset.letter;
        persistGameState();
        renderTwoLetterPicker();
      }
    });

    // Back-to-daily (custom puzzle): nav to /
    if (btnBackToDaily) btnBackToDaily.addEventListener('click', function() {
      window.location.href = window.location.pathname;
    });

    // Create puzzle modal — input wiring + submit. The header trigger button
    // (btn-create) was removed; the modal is now opened from the home card.
    if (modalCreate) {
      var createOuterInputs = modalCreate.querySelectorAll('.create-outer');
      var allCreateInputs = [createCenter].concat(Array.from(createOuterInputs));

      function validateCreateInputs() {
        var letters = [];
        var allFilled = true;
        var hasDupe = false;
        var seen = {};
        for (var i = 0; i < allCreateInputs.length; i++) {
          var val = allCreateInputs[i].value.toUpperCase();
          if (!val || !/^[A-Z]$/.test(val)) { allFilled = false; continue; }
          if (seen[val]) hasDupe = true;
          seen[val] = true;
          letters.push(val.toLowerCase());
        }

        if (!allFilled || letters.length < 7) {
          btnCreateGo.disabled = true;
          createError.hidden = true;
          createPreview.hidden = true;
          return;
        }
        if (hasDupe) {
          btnCreateGo.disabled = true;
          createError.textContent = 'Letters must be unique';
          createError.hidden = false;
          createPreview.hidden = true;
          return;
        }

        createError.hidden = true;
        var keyLetter = letters[0];
        var words = getAllValidWords(letters, keyLetter);
        var commonCount = words.filter(function(w) { return COMMON_WORDS.has(w); }).length;
        createWordCount.textContent = commonCount + ' common words, ' + words.length + ' total';
        createPreview.hidden = false;

        if (words.length === 0) {
          createError.textContent = 'No valid words with these letters';
          createError.hidden = false;
          btnCreateGo.disabled = true;
        } else {
          btnCreateGo.disabled = false;
        }
      }

      allCreateInputs.forEach(function(inp, idx) {
        function handleInput() {
          var val = inp.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
          inp.value = val.slice(0, 1);
          if (val && idx < allCreateInputs.length - 1) {
            allCreateInputs[idx + 1].focus();
          }
          validateCreateInputs();
        }
        inp.addEventListener('input', handleInput);
        inp.addEventListener('keyup', function() { validateCreateInputs(); });
        inp.addEventListener('change', handleInput);
        inp.addEventListener('keydown', function(e) {
          if (e.key === 'Backspace' && !inp.value && idx > 0) {
            allCreateInputs[idx - 1].focus();
          }
        });
      });

      btnCreateGo.addEventListener('click', function() {
        var center = createCenter.value.toUpperCase();
        var outer = [];
        createOuterInputs.forEach(function(inp) {
          outer.push(inp.value.toUpperCase());
        });
        var allLetters = [center.toLowerCase()].concat(outer.map(function(l) { return l.toLowerCase(); }));
        var code = getCanonicalPuzzleCode(center.toLowerCase(), allLetters);
        // Full reload — simplest path; the router picks up ?p=CODE.
        window.location.href = window.location.pathname + '?p=' + code;
      });
    }

    // Modal close — backdrop, X button, and data-modal buttons
    document.querySelectorAll('.modal').forEach((modal) => {
      const backdrop = modal.querySelector('.modal-backdrop');
      if (backdrop) backdrop.addEventListener('click', () => closeModal(modal));
      const closeBtn = modal.querySelector('.modal-close');
      if (closeBtn) closeBtn.addEventListener('click', () => closeModal(modal));
      modal.querySelectorAll('[data-modal]').forEach((btn) => {
        if (!btn.classList.contains('modal-close')) {
          btn.addEventListener('click', () => closeModal(modal));
        }
      });
    });

    // Day rollover — reload when the day changes (only when on a daily-mode game)
    function checkDayRollover() {
      if (mode !== 'daily' || currentScreen !== 'game') return;
      const newKey = getTodaysDateKey();
      if (newKey !== dateKey) {
        location.reload();
      }
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkDayRollover();
    });
    setInterval(checkDayRollover, 60000);
  }

  // --- Start ---
  bindPersistentEvents();
  routeFromURL();
})();
