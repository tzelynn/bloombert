function getPuzzleDate() {
  const now = new Date();
  now.setHours(now.getHours() - 4);
  return now;
}

function getTodaysSeed() {
  const d = getPuzzleDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return parseInt(`${y}${m}${dd}`, 10);
}

function getTodaysDateKey() {
  const d = getPuzzleDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function generatePuzzle(seed) {
  const vowels = 'aeiou'.split('');
  const commonConsonants = 'bcdfghlmnprst'.split('');
  const rareConsonants = 'jkvwxyz'.split('');

  for (let attempt = 0; attempt < 1000; attempt++) {
    const rng = createRNG(seed * 2654435761 + attempt);

    // Weighted letter pool: vowels 3×, common consonants 2×, rare 1×
    const pool = [];
    for (const v of vowels) { pool.push(v, v, v); }
    for (const c of commonConsonants) { pool.push(c, c); }
    for (const c of rareConsonants) { pool.push(c); }

    const letters = [];
    const used = new Set();
    while (letters.length < 7) {
      const idx = Math.floor(rng.next() * pool.length);
      const letter = pool[idx];
      if (!used.has(letter)) {
        used.add(letter);
        letters.push(letter);
      }
    }

    // Avoid Q, X, Z as key letter — skip and retry
    const keyLetter = letters[0];
    if ('qxz'.includes(keyLetter)) continue;

    const validWords = getAllValidWords(letters, keyLetter);
    const commonWords = validWords.filter(w => COMMON_WORDS.has(w));
    const bonusWords = validWords.filter(w => !COMMON_WORDS.has(w));

    if (commonWords.length < 15) continue;

    let commonScore = 0;
    let totalScore = 0;
    let hasBloom = false;
    for (const word of validWords) {
      const bonus = !COMMON_WORDS.has(word);
      const pts = scoreWord(word, letters, bonus);
      totalScore += pts;
      if (!bonus) commonScore += pts;
      if (isBloom(word, letters)) hasBloom = true;
    }

    if (!hasBloom) continue;
    if (commonScore < 40) continue;

    // Difficulty based on common words (the reachable pool)
    let difficulty;
    if (commonWords.length > 40 && commonScore > 120) {
      difficulty = 'Easy';
    } else if (commonWords.length < 25 || commonScore < 60) {
      difficulty = 'Hard';
    } else {
      difficulty = 'Medium';
    }

    return {
      letters,
      keyLetter,
      validWords,
      commonWords,
      bonusWords,
      commonScore,
      totalScore,
      hasBloom,
      difficulty,
    };
  }

  throw new Error('Could not generate a valid puzzle after 1000 attempts');
}

function getAllValidWords(letters, keyLetter) {
  const letterSet = new Set(letters);
  const results = [];
  for (const word of WORD_LIST) {
    if (word.length < 4) continue;
    if (!word.includes(keyLetter)) continue;
    let valid = true;
    for (const ch of word) {
      if (!letterSet.has(ch)) {
        valid = false;
        break;
      }
    }
    if (valid) results.push(word);
  }
  return results.sort();
}

function isValidGuess(word, letters, keyLetter, foundWords) {
  if (word.length < 4) {
    return { valid: false, reason: 'too_short' };
  }
  if (!word.includes(keyLetter)) {
    return { valid: false, reason: 'missing_key' };
  }
  const letterSet = new Set(letters);
  for (const ch of word) {
    if (!letterSet.has(ch)) {
      return { valid: false, reason: 'invalid_chars' };
    }
  }
  if (!WORD_LIST.has(word)) {
    return { valid: false, reason: 'not_a_word' };
  }
  if (foundWords.has(word)) {
    return { valid: false, reason: 'already_found' };
  }
  return { valid: true };
}
