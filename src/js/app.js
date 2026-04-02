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
  let hintsUsed = { revealedWords: [], selectedTwoLetterKey: null };
  let isCustomPuzzle = false;
  let customPuzzleCode = null;

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
  const btnHints = $('btn-hints');
  const btnHintsInline = $('btn-hints-inline');
  const modalHints = $('modal-hints');

  // --- DOM refs (create modal) ---
  const btnCreate = $('btn-create');
  const modalCreate = $('modal-create-puzzle');
  const createCenter = $('create-center');
  const createError = $('create-error');
  const createPreview = $('create-preview');
  const createWordCount = $('create-word-count');
  const btnCreateGo = $('btn-create-go');
  const btnBackToDaily = $('btn-back-to-daily');

  // --- Init ---
  function init() {
    // Check for custom puzzle in URL
    var params = new URLSearchParams(window.location.search);
    var customParam = params.get('p');
    var customData = customParam ? parseCustomPuzzleParam(customParam) : null;

    if (customData) {
      isCustomPuzzle = true;
      customPuzzleCode = getCanonicalPuzzleCode(customData.keyLetter, customData.letters);
      // Redirect to canonical URL if needed
      if (customParam.toUpperCase() !== customPuzzleCode) {
        window.location.replace(window.location.pathname + '?p=' + customPuzzleCode);
        return;
      }
      dateKey = 'custom-' + customPuzzleCode;
      puzzle = generateCustomPuzzle(customData.letters, customData.keyLetter);
    } else {
      dateKey = getTodaysDateKey();
      var seed = getTodaysSeed();
      puzzle = generatePuzzle(seed);
    }
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
      hintsUsed = saved.hintsUsed || { revealedWords: [], selectedTwoLetterKey: null };
      saveState(dateKey, { foundWords, score: currentScore, hintsUsed });
    } else {
      foundWords = new Set();
      currentScore = 0;
      bonusCount = 0;
      hintsUsed = { revealedWords: [] };
      saveState(dateKey, { foundWords, score: currentScore, hintsUsed });
    }

    stats = loadStats();

    // One-time fix: recalculate gamesPlayed and totalWords from actual day states
    if (!stats.wordCountFixed) {
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
      // Also count today if words were already found
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

    // gamesPlayed and streak are updated on first valid word, not on page load

    // Display metadata
    difficultyBadge.textContent = puzzle.difficulty;
    if (isCustomPuzzle) {
      dateDisplay.textContent = 'Custom Puzzle';
      streakDisplay.textContent = '';
      if (btnBackToDaily) btnBackToDaily.hidden = false;
    } else {
      dateDisplay.textContent = formatDate(dateKey);
      streakDisplay.textContent = stats.currentStreak > 1 ? `🔥 ${stats.currentStreak}` : '';
      if (btnBackToDaily) btnBackToDaily.hidden = true;
    }

    renderHexGrid();
    renderFoundWords();
    renderRankBar();
    renderInput();
    bindEvents();
    updateHintNotification();
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

    saveState(dateKey, { foundWords, score: currentScore, hintsUsed });

    // Count this day as played on first valid word (daily puzzles only)
    if (!isCustomPuzzle) {
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
      updateHintNotification();
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

    var petals = hexGrid.querySelectorAll('.flower-petal');
    petals.forEach(function (p) {
      p.classList.remove('shuffling');
      void p.offsetWidth;
      p.classList.add('shuffling');
      p.addEventListener('animationend', function () { p.classList.remove('shuffling'); }, { once: true });
    });

    // Swap letters while petals overlap at center
    setTimeout(renderHexGrid, 140);
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
    return formatShareText(dateKey, rank, commonFound, puzzle.commonWords.length, currentScore, bloomCount, bonusCount, isCustomPuzzle ? customPuzzleCode : null);
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
    saveState(dateKey, { foundWords, score: currentScore, hintsUsed });
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

    saveState(dateKey, { foundWords, score: currentScore, hintsUsed });

    if (!isCustomPuzzle) {
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
      updateHintNotification();
    }

    if (bloom) {
      document.dispatchEvent(new CustomEvent('Bloombert:bloom', { detail: { word: word } }));
      bloomWordDisplay.textContent = word.toUpperCase();
      openModal(modalBloom);
    }
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
        saveState(dateKey, { foundWords, score: currentScore, hintsUsed });
        renderTwoLetterPicker();
      }
    });

    // Create puzzle modal
    if (btnCreate) btnCreate.addEventListener('click', function() { openModal(modalCreate); });
    if (btnBackToDaily) btnBackToDaily.addEventListener('click', function() {
      window.location.href = window.location.pathname;
    });
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
        // Show word count preview
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
        window.location.href = window.location.pathname + '?p=' + code;
      });
    }

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

    // Day rollover — check on visibility change AND periodically (daily puzzles only)
    if (!isCustomPuzzle) {
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
  }

  // --- Start ---
  init();
})();
