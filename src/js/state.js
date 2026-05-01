function loadState(dateKey) {
  try {
    const raw = localStorage.getItem(`bloombert-state-${dateKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.foundWords) {
      parsed.foundWords = new Set(parsed.foundWords);
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

function saveState(dateKey, state) {
  try {
    const toSave = {
      ...state,
      foundWords: state.foundWords instanceof Set ? [...state.foundWords] : state.foundWords,
    };
    localStorage.setItem(`bloombert-state-${dateKey}`, JSON.stringify(toSave));
  } catch (e) {
    // quota exceeded or other error
  }
}

function loadTimedState(dateKey) {
  try {
    const raw = localStorage.getItem(`bloombert-timed-state-${dateKey}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveTimedState(dateKey, state) {
  try {
    localStorage.setItem(`bloombert-timed-state-${dateKey}`, JSON.stringify(state));
  } catch (e) {
    // quota exceeded or other error
  }
}

function loadStats() {
  try {
    const raw = localStorage.getItem('bloombert-stats');
    if (!raw) return { gamesPlayed: 0, currentStreak: 0, bestStreak: 0, totalWords: 0, lastPlayedDate: null };
    return JSON.parse(raw);
  } catch (e) {
    return { gamesPlayed: 0, currentStreak: 0, bestStreak: 0, totalWords: 0, lastPlayedDate: null };
  }
}

function saveStats(stats) {
  try {
    localStorage.setItem('bloombert-stats', JSON.stringify(stats));
  } catch (e) {
    // quota exceeded or other error
  }
}

function getDailyWordCounts(todayKey, numDays, todayWords) {
  var counts = [];
  var d = new Date(todayKey + 'T00:00:00');
  for (var i = numDays - 1; i >= 0; i--) {
    var date = new Date(d);
    date.setDate(date.getDate() - i);
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var dd = String(date.getDate()).padStart(2, '0');
    var key = y + '-' + m + '-' + dd;
    var wordCount = 0;
    if (key === todayKey && todayWords !== undefined) {
      wordCount = todayWords;
    } else {
      var state = loadState(key);
      if (state && state.foundWords) {
        wordCount = state.foundWords instanceof Set ? state.foundWords.size : state.foundWords.length;
      }
    }
    counts.push({ date: key, words: wordCount });
  }
  return counts;
}

function checkAndUpdateStreak(stats, todayKey) {
  if (!stats.lastPlayedDate) {
    stats.currentStreak = 1;
  } else {
    const last = new Date(stats.lastPlayedDate + 'T00:00:00');
    const today = new Date(todayKey + 'T00:00:00');
    const diffMs = today.getTime() - last.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      stats.currentStreak += 1;
    } else if (diffDays > 1) {
      stats.currentStreak = 1;
    }
    // diffDays === 0 means same day, no change
  }

  stats.lastPlayedDate = todayKey;
  if (stats.currentStreak > (stats.bestStreak || 0)) {
    stats.bestStreak = stats.currentStreak;
  }
  return stats;
}
