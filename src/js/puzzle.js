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

// --- Letter classification helpers ---

function countVowels(letters) {
  let n = 0;
  for (const c of letters) {
    if ('aeiou'.includes(c)) n++;
  }
  return n;
}

function countRareConsonants(letters) {
  let n = 0;
  for (const c of letters) {
    if ('jqxz'.includes(c)) n++;
  }
  return n;
}

function hasERTogether(letters) {
  let e = false, r = false;
  for (const c of letters) {
    if (c === 'e') e = true;
    if (c === 'r') r = true;
  }
  return e && r;
}

// --- Seed/date helpers ---

function seedToParts(seed) {
  const y = Math.floor(seed / 10000);
  const m = Math.floor((seed % 10000) / 100);
  const d = seed % 100;
  return { y, m, d };
}

function seedToDateStr(seed) {
  const { y, m, d } = seedToParts(seed);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function isWeekendSeed(seed) {
  const { y, m, d } = seedToParts(seed);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

function getPrevDaySeeds(seed, count) {
  const { y, m, d } = seedToParts(seed);
  const base = Date.UTC(y, m - 1, d);
  const out = [];
  for (let i = 1; i <= count; i++) {
    const t = new Date(base - i * 86400000);
    const ny = t.getUTCFullYear();
    const nm = String(t.getUTCMonth() + 1).padStart(2, '0');
    const nd = String(t.getUTCDate()).padStart(2, '0');
    out.push(parseInt(`${ny}${nm}${nd}`, 10));
  }
  return out;
}

function passesHardLetterRules(letters, keyLetter, rng) {
  const v = countVowels(letters);
  if (v < 2 || v > 3) return false;
  if ('sxzq'.includes(keyLetter)) return false;
  if ('jvwy'.includes(keyLetter) && rng.next() < 0.95) return false;
  if (hasERTogether(letters)) return false;
  if (countRareConsonants(letters) > 1) return false;
  return true;
}

function hasCommonPangram(validWords, letters) {
  for (const w of validWords) {
    if (isBloom(w, letters) && COMMON_WORDS.has(w)) return true;
  }
  return false;
}

function readNeighborLetters(seed) {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`bloombert-letters-${seedToDateStr(seed)}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeNeighborLetters(seed, value) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      `bloombert-letters-${seedToDateStr(seed)}`,
      JSON.stringify(value)
    );
  } catch (e) {
    // ignore (quota or private mode)
  }
}

function generatePuzzleLettersOnly(seed) {
  const cached = readNeighborLetters(seed);
  if (cached) return cached;

  const vowels = 'aeiou'.split('');
  const commonConsonants = 'bcdfghlmnprst'.split('');
  const rareConsonants = 'jkvwxyz'.split('');

  for (let attempt = 0; attempt < 500; attempt++) {
    const rng = createRNG(seed * 2654435761 + attempt);

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

    const keyLetter = letters[0];
    if (!passesHardLetterRules(letters, keyLetter, rng)) continue;

    const result = { letters, keyLetter };
    writeNeighborLetters(seed, result);
    return result;
  }

  throw new Error(`generatePuzzleLettersOnly: no candidate after 500 attempts for seed ${seed}`);
}

function passesLookback(letters, keyLetter, prevDays, opts) {
  for (const prev of prevDays) {
    if (!opts.dropCenter && prev.keyLetter === keyLetter) return false;
    if (!opts.dropOverlap) {
      let overlap = 0;
      for (const l of letters) {
        if (prev.letters.includes(l)) overlap++;
      }
      if (overlap >= 6) return false;
    }
  }
  return true;
}

function generatePuzzle(seed) {
  const isWeekend = isWeekendSeed(seed);
  const minCommon = isWeekend ? 35 : 15;
  const minCommonScore = isWeekend ? 100 : 40;
  const minTotal = isWeekend ? 45 : 0;

  const prevDays = getPrevDaySeeds(seed, 3).map(generatePuzzleLettersOnly);

  const vowels = 'aeiou'.split('');
  const commonConsonants = 'bcdfghlmnprst'.split('');
  const rareConsonants = 'jkvwxyz'.split('');

  for (let attempt = 0; attempt < 1500; attempt++) {
    const rng = createRNG(seed * 2654435761 + attempt);

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

    const keyLetter = letters[0];
    if (!passesHardLetterRules(letters, keyLetter, rng)) continue;
    if (!passesLookback(letters, keyLetter, prevDays, { dropCenter: false, dropOverlap: false })) continue;

    const validWords = getAllValidWords(letters, keyLetter);
    const commonWords = validWords.filter(w => COMMON_WORDS.has(w));
    const bonusWords = validWords.filter(w => !COMMON_WORDS.has(w));

    if (commonWords.length < minCommon) continue;

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
    if (!hasCommonPangram(validWords, letters)) continue;
    if (commonScore < minCommonScore) continue;
    if (validWords.length < minTotal) continue;

    let difficulty;
    if (commonWords.length > 40 && commonScore > 120) difficulty = 'Easy';
    else if (commonWords.length < 25 || commonScore < 60) difficulty = 'Hard';
    else difficulty = 'Medium';

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

  throw new Error('Could not generate a valid puzzle after 1500 attempts');
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

function parseCustomPuzzleParam(param) {
  if (!param || param.length !== 7) return null;
  var upper = param.toUpperCase();
  if (!/^[A-Z]{7}$/.test(upper)) return null;
  var seen = {};
  for (var i = 0; i < 7; i++) {
    if (seen[upper[i]]) return null;
    seen[upper[i]] = true;
  }
  var keyLetter = upper[0].toLowerCase();
  var letters = [keyLetter];
  for (var j = 1; j < 7; j++) {
    letters.push(upper[j].toLowerCase());
  }
  return { keyLetter: keyLetter, letters: letters };
}

function getCanonicalPuzzleCode(keyLetter, letters) {
  var outer = [];
  for (var i = 0; i < letters.length; i++) {
    if (letters[i].toLowerCase() !== keyLetter.toLowerCase()) {
      outer.push(letters[i].toUpperCase());
    }
  }
  outer.sort();
  return keyLetter.toUpperCase() + outer.join('');
}

function generateCustomPuzzle(letters, keyLetter) {
  var validWords = getAllValidWords(letters, keyLetter);
  var commonWords = validWords.filter(function(w) { return COMMON_WORDS.has(w); });
  var bonusWords = validWords.filter(function(w) { return !COMMON_WORDS.has(w); });

  var commonScore = 0;
  var totalScore = 0;
  var hasBloom = false;
  for (var i = 0; i < validWords.length; i++) {
    var word = validWords[i];
    var bonus = !COMMON_WORDS.has(word);
    var pts = scoreWord(word, letters, bonus);
    totalScore += pts;
    if (!bonus) commonScore += pts;
    if (isBloom(word, letters)) hasBloom = true;
  }

  var difficulty;
  if (commonWords.length > 40 && commonScore > 120) {
    difficulty = 'Easy';
  } else if (commonWords.length < 25 || commonScore < 60) {
    difficulty = 'Hard';
  } else {
    difficulty = 'Medium';
  }

  return {
    letters: letters,
    keyLetter: keyLetter,
    validWords: validWords,
    commonWords: commonWords,
    bonusWords: bonusWords,
    commonScore: commonScore,
    totalScore: totalScore,
    hasBloom: hasBloom,
    difficulty: difficulty,
  };
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
