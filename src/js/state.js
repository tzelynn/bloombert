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
