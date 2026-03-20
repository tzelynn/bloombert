function scoreWord(word, letters) {
  const len = word.length;
  let score;
  if (len === 4) score = 1;
  else if (len === 5) score = 5;
  else score = len;

  if (isBloom(word, letters)) {
    score += 7;
  }
  return score;
}

function isBloom(word, letters) {
  const letterSet = new Set(letters);
  const wordLetters = new Set(word.split(''));
  for (const l of letterSet) {
    if (!wordLetters.has(l)) return false;
  }
  return true;
}

function computeRankThresholds(totalScore) {
  return {
    Seedling: 0,
    Sprout: Math.ceil(totalScore * 0.05),
    Bud: Math.ceil(totalScore * 0.12),
    Bloom: Math.ceil(totalScore * 0.25),
    Petal: Math.ceil(totalScore * 0.40),
    Sunflower: Math.ceil(totalScore * 0.60),
    Bouquet: Math.ceil(totalScore * 0.80),
    'Garden Master': totalScore,
  };
}

function getRank(currentScore, thresholds) {
  const ranks = [
    { name: 'Seedling', emoji: '🌱' },
    { name: 'Sprout', emoji: '🌿' },
    { name: 'Bud', emoji: '🌼' },
    { name: 'Bloom', emoji: '🌸' },
    { name: 'Petal', emoji: '🌺' },
    { name: 'Sunflower', emoji: '🌻' },
    { name: 'Bouquet', emoji: '💐' },
    { name: 'Garden Master', emoji: '🌟' },
  ];

  let idx = 0;
  for (let i = ranks.length - 1; i >= 0; i--) {
    if (currentScore >= thresholds[ranks[i].name]) {
      idx = i;
      break;
    }
  }

  const rank = ranks[idx];
  const next = idx < ranks.length - 1 ? ranks[idx + 1] : null;
  const currentThreshold = thresholds[rank.name];
  const nextThreshold = next ? thresholds[next.name] : currentThreshold;
  const range = nextThreshold - currentThreshold;
  const progressPct = range > 0 ? Math.min(100, ((currentScore - currentThreshold) / range) * 100) : 100;

  return {
    name: rank.name,
    emoji: rank.emoji,
    next: next ? next.name : null,
    nextEmoji: next ? next.emoji : null,
    progressPct,
  };
}

function formatShareText(date, rank, foundCount, totalCount, score) {
  return `🌸 Bloombert ${date}\n${rank.emoji} ${rank.name}\n${foundCount}/${totalCount} words · ${score} points\nhttps://tzelynn.github.io/bloombert`;
}
