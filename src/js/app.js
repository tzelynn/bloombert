(function () {
  'use strict';

  // --- State ---
  let puzzle = null;
  let currentInput = '';
  let foundWords = new Set();
  let currentScore = 0;
  let bonusCount = 0;
  let thresholds = {};
  let dateKey = '';
  let stats = {};

  // --- Icon SVGs ---
  const ICON_CLIPBOARD = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
  const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  // --- DOM refs ---
  const $ = (id) => document.getElementById(id);
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
  const toast = $('toast');
  const scoreFloat = $('score-float');
  const btnDelete = $('btn-delete');
  const btnShuffle = $('btn-shuffle');
  const btnEnter = $('btn-enter');
  const btnHowToPlay = $('btn-how-to-play');
  const btnStats = $('btn-stats');
  const btnShare = $('btn-share');
  const btnShareHeader = $('btn-share-header');
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

  // --- Init ---
  function init() {
    dateKey = getTodaysDateKey();
    const seed = getTodaysSeed();
    puzzle = generatePuzzle(seed);
    thresholds = computeRankThresholds(puzzle.commonScore);

    const saved = loadState(dateKey);
    if (saved) {
      foundWords = saved.foundWords instanceof Set ? saved.foundWords : new Set(saved.foundWords);
      // Recalculate score from found words to pick up any scoring rule changes
      currentScore = 0;
      bonusCount = 0;
      for (const w of foundWords) {
        const wb = !COMMON_WORDS.has(w);
        currentScore += scoreWord(w, puzzle.letters, wb);
        if (wb) bonusCount++;
      }
      saveState(dateKey, { foundWords, score: currentScore });
    } else {
      foundWords = new Set();
      currentScore = 0;
      bonusCount = 0;
      saveState(dateKey, { foundWords, score: currentScore });
    }

    stats = loadStats();

    // One-time fix: recalculate gamesPlayed and totalWords from actual day states
    if (!stats.wordCountFixed) {
      let actualPlayed = 0;
      let actualWords = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('bloombert-state-') && k !== `bloombert-state-${dateKey}`) {
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
      stats.gamesPlayed = actualPlayed;
      stats.totalWords = actualWords;
      stats.playedCountFixed = true;
      stats.wordCountFixed = true;
      saveStats(stats);
    }

    // gamesPlayed and streak are updated on first valid word, not on page load

    // Display metadata
    difficultyBadge.textContent = puzzle.difficulty;
    dateDisplay.textContent = formatDate(dateKey);
    streakDisplay.textContent = stats.currentStreak > 1 ? `🔥 ${stats.currentStreak}` : '';

    renderHexGrid();
    renderFoundWords();
    renderRankBar();
    renderInput();
    bindEvents();
  }

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
    currentInput += letter.toLowerCase();
    renderInput();
  }

  function deleteLetter() {
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
    const word = currentInput.toLowerCase();
    if (word.length === 0) return;

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

    saveState(dateKey, { foundWords, score: currentScore });

    // Count this day as played on first valid word
    if (foundWords.size === 1) {
      stats = checkAndUpdateStreak(stats, dateKey);
      stats.gamesPlayed = (stats.gamesPlayed || 0) + 1;
    }
    stats.totalWords = (stats.totalWords || 0) + 1;
    saveStats(stats);

    renderFoundWords();
    renderRankBar();
    clearInput();

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
    }

    if (bloom) {
      document.dispatchEvent(new CustomEvent('Bloombert:bloom', { detail: { word } }));
      bloomWordDisplay.textContent = word.toUpperCase();
      openModal(modalBloom);
    }
  }

  // --- Shuffle ---
  function shuffleOuter() {
    const outer = puzzle.letters.slice(1);
    for (let i = outer.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [outer[i], outer[j]] = [outer[j], outer[i]];
    }
    puzzle.letters = [puzzle.letters[0], ...outer];
    renderHexGrid();
  }

  // --- Toast ---
  let toastTimer = null;
  function showToast(message) {
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

  // --- Modals ---
  function openModal(modal) {
    modal.hidden = false;
  }

  function closeModal(modal) {
    modal.hidden = true;
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
    var data = getDailyWordCounts(dateKey, 7, foundWords.size);
    var maxWords = Math.max.apply(null, data.map(function(d) { return d.words; }));
    if (maxWords === 0) maxWords = 1;
    var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var flowers = ['🌱','🌿','🌼','🌸','🌺','🌻','💐'];

    container.innerHTML = '';
    for (var i = 0; i < data.length; i++) {
      var entry = data[i];
      var pct = Math.round((entry.words / maxWords) * 100);
      var isToday = entry.date === dateKey;
      var dayDate = new Date(entry.date + 'T00:00:00');
      var dayLabel = dayNames[dayDate.getDay()];

      // Pick flower based on word count tier
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
    return formatShareText(dateKey, rank, commonFound, puzzle.commonWords.length, currentScore, bloomCount, bonusCount);
  }

  function shareResults() {
    // Close stats modal if open
    closeModal(modalStats);

    const text = getShareText();
    sharePreview.textContent = text;
    openModal(modalShare);
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

  // --- Events ---
  function bindEvents() {
    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.modal:not([hidden])')) return;

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

    // Share
    if (btnShare) btnShare.addEventListener('click', shareResults);
    if (btnShareHeader) btnShareHeader.addEventListener('click', shareResults);
    if (btnCopyShare) btnCopyShare.addEventListener('click', copyShareText);
    if (btnViewAll) btnViewAll.addEventListener('click', function() {
      renderAllWordsModal();
      openModal(modalAllWords);
    });

    // Modal close — backdrop, X button, and data-modal buttons
    document.querySelectorAll('.modal').forEach((modal) => {
      const backdrop = modal.querySelector('.modal-backdrop');
      if (backdrop) backdrop.addEventListener('click', () => closeModal(modal));
      const closeBtn = modal.querySelector('.modal-close');
      if (closeBtn) closeBtn.addEventListener('click', () => closeModal(modal));
      // "Keep Going" and similar buttons with data-modal
      modal.querySelectorAll('[data-modal]').forEach((btn) => {
        if (!btn.classList.contains('modal-close')) {
          btn.addEventListener('click', () => closeModal(modal));
        }
      });
    });

    // Day rollover — check on visibility change AND periodically
    function checkDayRollover() {
      const newKey = getTodaysDateKey();
      if (newKey !== dateKey) {
        location.reload();
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        checkDayRollover();
      }
    });

    // Check every 60 seconds in case the tab stays open past midnight
    setInterval(checkDayRollover, 60000);
  }

  // --- Start ---
  init();
})();
