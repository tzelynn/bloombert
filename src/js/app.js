(function () {
  'use strict';

  // --- State ---
  let puzzle = null;
  let currentInput = '';
  let foundWords = new Set();
  let currentScore = 0;
  let thresholds = {};
  let dateKey = '';
  let stats = {};

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

  // --- Init ---
  function init() {
    dateKey = getTodaysDateKey();
    const seed = getTodaysSeed();
    puzzle = generatePuzzle(seed);
    thresholds = computeRankThresholds(puzzle.totalScore);

    const saved = loadState(dateKey);
    if (saved) {
      foundWords = saved.foundWords instanceof Set ? saved.foundWords : new Set(saved.foundWords);
      currentScore = saved.score || 0;
    } else {
      foundWords = new Set();
      currentScore = 0;
    }

    stats = loadStats();
    if (!saved) {
      stats = checkAndUpdateStreak(stats, dateKey);
      stats.gamesPlayed += 1;
      saveStats(stats);
    }

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
    const sorted = [...foundWords].sort();
    foundWordsList.innerHTML = '';
    for (const word of sorted) {
      const pill = document.createElement('span');
      pill.className = 'word-pill pop-in';
      pill.setAttribute('role', 'listitem');
      if (isBloom(word, puzzle.letters)) {
        pill.classList.add('word-pill--bloom');
        pill.textContent = '✨ ' + word;
      } else {
        pill.textContent = word;
      }
      foundWordsList.appendChild(pill);
    }
    foundCount.textContent = `${foundWords.size} word${foundWords.size !== 1 ? 's' : ''}`;
    scoreDisplay.textContent = `${currentScore} pts`;
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
    const points = scoreWord(word, puzzle.letters);
    const bloom = isBloom(word, puzzle.letters);

    foundWords.add(word);
    currentScore += points;

    saveState(dateKey, { foundWords, score: currentScore });

    stats.totalWords = (stats.totalWords || 0) + 1;
    saveStats(stats);

    renderFoundWords();
    renderRankBar();
    clearInput();

    showScoreFloat(`+${points}`);
    document.dispatchEvent(new CustomEvent('Bloombert:success', { detail: { word, points } }));

    // Flash success on hex tiles
    hexGrid.querySelectorAll('.hex-tile').forEach(tile => {
      tile.classList.add('flash-success');
      tile.addEventListener('animationend', () => tile.classList.remove('flash-success'), { once: true });
    });

    const newRank = getRank(currentScore, thresholds).name;
    if (newRank !== prevRank) {
      document.dispatchEvent(new CustomEvent('Bloombert:rankup', { detail: { rank: newRank } }));
      const rankInfo = getRank(currentScore, thresholds);
      showToast(`${rankInfo.emoji} ${rankInfo.name}!`);
      const rankSection = document.querySelector('.rank-section');
      if (rankSection) {
        rankSection.classList.add('rankup-shimmer');
        rankSection.addEventListener('animationend', () => rankSection.classList.remove('rankup-shimmer'), { once: true });
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
    $('stat-best-streak').textContent = stats.bestStreak || 0;
  }

  // --- Share ---
  function getShareText() {
    const rank = getRank(currentScore, thresholds);
    const bloomCount = [...foundWords].filter(w => isBloom(w, puzzle.letters)).length;
    return formatShareText(dateKey, rank, foundWords.size, puzzle.validWords.length, currentScore, bloomCount);
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
        btnCopyShare.textContent = '✅ Copied!';
        setTimeout(() => { btnCopyShare.textContent = '📋 Copy to Clipboard'; }, 2000);
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
      btnCopyShare.textContent = '✅ Copied!';
      setTimeout(() => { btnCopyShare.textContent = '📋 Copy to Clipboard'; }, 2000);
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

    // Day rollover
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        const newKey = getTodaysDateKey();
        if (newKey !== dateKey) {
          location.reload();
        }
      }
    });
  }

  // --- Start ---
  init();
})();
