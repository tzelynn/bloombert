function scoreWord(word, letters, isBonus) {
  const len = word.length;
  let score = len;

  if (isBloom(word, letters)) {
    score += 7;
  }

  if (isBonus) {
    score = Math.floor(score / 2);
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
    Sprout: Math.ceil(totalScore * 0.10),
    Bud: Math.ceil(totalScore * 0.20),
    Bloom: Math.ceil(totalScore * 0.35),
    Petal: Math.ceil(totalScore * 0.50),
    Sunflower: Math.ceil(totalScore * 0.70),
    Bouquet: Math.ceil(totalScore * 0.90),
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

function formatShareText(date, rank, foundCount, totalCount, score, bloomCount, bonusCount) {
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var parts = date.split('-');
  var prettyDate = months[parseInt(parts[1], 10) - 1] + ' ' + parseInt(parts[2], 10) + ', ' + parts[0];

  // Progress bar: 8 squares based on rank index
  var rankNames = ['Seedling','Sprout','Bud','Bloom','Petal','Sunflower','Bouquet','Garden Master'];
  var idx = rankNames.indexOf(rank.name);
  var filled = idx + 1; // at least 1 filled for Seedling
  var bar = '';
  for (var i = 0; i < 8; i++) {
    bar += i < filled ? '🌸' : '🤍';
  }

  var wordLine = foundCount + ' words found';
  if (bonusCount > 0) {
    wordLine += ' + ' + bonusCount + ' bonus';
  }

  var lines = [
    '🌷 Bloombert · ' + prettyDate,
    rank.emoji + ' ' + rank.name + ' · ' + score + ' pts',
    bar,
    wordLine,
  ];

  if (bloomCount > 0) {
    lines.push('✨ ' + bloomCount + ' bloom' + (bloomCount > 1 ? 's' : ''));
  }

  lines.push('');
  lines.push('https://tzelynn.github.io/bloombert');

  return lines.join('\n');
}
