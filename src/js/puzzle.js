function getTodaysSeed() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return parseInt(`${y}${m}${d}`, 10);
}

function getTodaysDateKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

    if (validWords.length < 20) continue;

    let totalScore = 0;
    let hasBloom = false;
    for (const word of validWords) {
      totalScore += scoreWord(word, letters);
      if (isBloom(word, letters)) hasBloom = true;
    }

    if (!hasBloom) continue;
    if (totalScore < 50) continue;

    // Difficulty: Easy requires BOTH conditions, Hard requires EITHER
    let difficulty;
    if (validWords.length > 50 && totalScore > 150) {
      difficulty = 'Easy';
    } else if (validWords.length < 30 || totalScore < 80) {
      difficulty = 'Hard';
    } else {
      difficulty = 'Medium';
    }

    return {
      letters,
      keyLetter,
      validWords,
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
