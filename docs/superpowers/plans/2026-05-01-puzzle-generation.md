# Puzzle Generation Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve daily puzzle generation in `src/js/puzzle.js` with NYT Spelling Bee-inspired letter-set quality gates, 3-day lookback variety enforcement, and weekend difficulty bumps. No new files in `src/`, no UI changes.

**Architecture:** Replace the current single-pass generator with a multi-gate generator. Hard letter-set rules first (cheap), then lookback comparison against the previous 3 days' letter sets (computed via a new `generatePuzzleLettersOnly` fast-path), then word-scan rules (with weekend size bumps). A graded fallback ladder ensures generation never throws. All changes live in `src/js/puzzle.js`. A new `scripts/verify-puzzles.js` exercises generation across a 30-day range as the test harness.

**Tech Stack:** Vanilla JS (browser globals, no modules). Node 18+ for the verify script (uses built-in `vm`, `fs`, `path`).

**Spec:** `docs/superpowers/specs/2026-05-01-puzzle-generation-design.md`

**Convention notes:**
- All globals stay browser-style (no `module.exports` in `src/`).
- Verify script loads `src/data/words.js`, `src/js/prng.js`, `src/js/scoring.js`, `src/js/puzzle.js` into a `vm` context with a stub `localStorage` so node can call `generatePuzzle(seed)` without code changes to those files.
- Each task ends with a green run of `node scripts/verify-puzzles.js` on the constraints introduced so far.

---

## Task 1: Bootstrap the verify script

**Files:**
- Create: `scripts/verify-puzzles.js`

The script generates puzzles across a fixed 30-day window using the existing `generatePuzzle(seed)` and prints summary stats. No assertions yet — just confirms the harness can drive the current generator from Node.

- [ ] **Step 1: Create `scripts/verify-puzzles.js` with the harness shell**

```js
#!/usr/bin/env node
// Test harness for puzzle generation. Loads the browser scripts in a
// shared vm context, then exercises generatePuzzle across a 30-day
// window. Run from repo root: node scripts/verify-puzzles.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const FILES = [
  'src/data/words.js',
  'src/js/prng.js',
  'src/js/scoring.js',
  'src/js/puzzle.js',
];

const storage = {};
const ctx = {
  console, Set, Map, Math, Date, Object, Array, JSON, String, Number, Boolean,
  parseInt, parseFloat, RegExp, Error,
  localStorage: {
    getItem: (k) => Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
  },
};
vm.createContext(ctx);
for (const f of FILES) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}

function dateToSeed(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return parseInt(`${y}${m}${d}`, 10);
}

function dowName(date) {
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getUTCDay()];
}

const START = new Date(Date.UTC(2026, 4, 1)); // 2026-05-01
const DAYS = 30;
const failures = [];
const puzzles = [];

for (let i = 0; i < DAYS; i++) {
  const date = new Date(START.getTime() + i * 86400000);
  const seed = dateToSeed(date);
  const dateStr = date.toISOString().slice(0, 10);
  let p;
  try {
    p = ctx.generatePuzzle(seed);
  } catch (e) {
    failures.push(`${dateStr}: threw ${e.message}`);
    continue;
  }
  puzzles.push({ dateStr, seed, dow: date.getUTCDay(), p });
}

// Summary
console.log(`Generated ${puzzles.length}/${DAYS} puzzles`);
const centerCounts = {};
for (const { p } of puzzles) {
  centerCounts[p.keyLetter] = (centerCounts[p.keyLetter] || 0) + 1;
}
console.log('Center letter distribution:', centerCounts);
const avgCommon = puzzles.reduce((s, x) => s + x.p.commonWords.length, 0) / puzzles.length;
const avgTotal = puzzles.reduce((s, x) => s + x.p.validWords.length, 0) / puzzles.length;
console.log(`Avg common words: ${avgCommon.toFixed(1)}`);
console.log(`Avg total words: ${avgTotal.toFixed(1)}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
} else {
  console.log('\nAll generations succeeded.');
}
```

- [ ] **Step 2: Run the harness against current code**

Run: `node scripts/verify-puzzles.js`
Expected: prints "Generated 30/30 puzzles", a center-letter distribution, average word counts, and "All generations succeeded." Non-zero exit only if generation throws.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-puzzles.js
git commit -m "test: add verify-puzzles harness for daily generation"
```

---

## Task 2: Add letter classification helpers

**Files:**
- Modify: `src/js/puzzle.js` (insert helpers above `generatePuzzle`)
- Modify: `scripts/verify-puzzles.js` (add helper assertions)

These are pure functions consumed by Tasks 4–8. Insert them in `src/js/puzzle.js` directly after the `getTodaysDateKey` function and before `generatePuzzle`.

- [ ] **Step 1: Add a "Helper assertions" block to the verify script**

Insert after the harness loop (right before the summary block):

```js
// --- Helper unit assertions ---
function assertEq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`helper ${label}: got ${a}, expected ${e}`);
}

assertEq(ctx.countVowels(['a','b','e','c','i','o','u']), 5, 'countVowels(5)');
assertEq(ctx.countVowels(['b','c','d','f','g','h','j']), 0, 'countVowels(0)');
assertEq(ctx.countRareConsonants(['j','q','x','z','a','e','i']), 4, 'countRareConsonants');
assertEq(ctx.countRareConsonants(['a','b','c','d','e','f','g']), 0, 'countRareConsonants zero');
assertEq(ctx.hasERTogether(['a','e','r','b','c','d','f']), true, 'hasERTogether yes');
assertEq(ctx.hasERTogether(['a','e','b','c','d','f','g']), false, 'hasERTogether no e');
assertEq(ctx.hasERTogether(['a','r','b','c','d','f','g']), false, 'hasERTogether no r');
```

- [ ] **Step 2: Run verify, observe failures**

Run: `node scripts/verify-puzzles.js`
Expected: ends with non-zero exit; failures include `helper countVowels(5): got undefined, expected 5` (because helpers don't exist yet). The 30/30 generation still succeeds.

- [ ] **Step 3: Add the helpers to `src/js/puzzle.js`**

Insert directly after the `getTodaysDateKey` function (line 21 in the current file) and before `generatePuzzle`:

```js
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
```

- [ ] **Step 4: Run verify, observe pass**

Run: `node scripts/verify-puzzles.js`
Expected: zero failures; "All generations succeeded."

- [ ] **Step 5: Commit**

```bash
git add src/js/puzzle.js scripts/verify-puzzles.js
git commit -m "feat: add letter classification helpers"
```

---

## Task 3: Add seed/date helpers

**Files:**
- Modify: `src/js/puzzle.js`
- Modify: `scripts/verify-puzzles.js`

Helpers used to derive day-of-week and previous-day seeds from the YYYYMMDD seed integer.

- [ ] **Step 1: Add seed/date helper assertions to the verify script**

Append to the helper assertions block from Task 2:

```js
// 2026-05-01 is a Friday (UTC); 2026-05-02 is a Saturday.
assertEq(ctx.isWeekendSeed(20260501), false, 'isWeekendSeed Fri');
assertEq(ctx.isWeekendSeed(20260502), true, 'isWeekendSeed Sat');
assertEq(ctx.isWeekendSeed(20260503), true, 'isWeekendSeed Sun');
assertEq(ctx.isWeekendSeed(20260504), false, 'isWeekendSeed Mon');

assertEq(ctx.seedToDateStr(20260501), '2026-05-01', 'seedToDateStr');
assertEq(ctx.seedToDateStr(20260101), '2026-01-01', 'seedToDateStr january');

assertEq(ctx.getPrevDaySeeds(20260503, 3), [20260502, 20260501, 20260430], 'getPrevDaySeeds across month');
assertEq(ctx.getPrevDaySeeds(20260101, 3), [20251231, 20251230, 20251229], 'getPrevDaySeeds across year');
```

- [ ] **Step 2: Run verify, observe failures**

Run: `node scripts/verify-puzzles.js`
Expected: helper assertions for `isWeekendSeed`, `seedToDateStr`, `getPrevDaySeeds` fail (functions undefined).

- [ ] **Step 3: Add the seed/date helpers to `src/js/puzzle.js`**

Insert after the letter classification helpers from Task 2:

```js
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
```

- [ ] **Step 4: Run verify, observe pass**

Run: `node scripts/verify-puzzles.js`
Expected: zero failures.

- [ ] **Step 5: Commit**

```bash
git add src/js/puzzle.js scripts/verify-puzzles.js
git commit -m "feat: add seed/date helpers"
```

---

## Task 4: Apply hard letter-set rules in `generatePuzzle`

**Files:**
- Modify: `src/js/puzzle.js` (rewrite `generatePuzzle` body up to the word-scan section)
- Modify: `scripts/verify-puzzles.js`

This is the biggest behavioral change. We replace the current key-letter checks with the spec's hard rules: vowel count 2 or 3, S/X/Z/Q forbidden as center, J/V/W/Y center rejected 95% of the time using the same RNG, E+R never together, at most 1 of {J,Q,X,Z}.

- [ ] **Step 1: Add per-puzzle assertions to the verify script**

Insert after the harness loop and before the helper assertions:

```js
// --- Per-puzzle assertions (hard letter-set rules) ---
for (const { dateStr, p } of puzzles) {
  const v = p.letters.filter(l => 'aeiou'.includes(l)).length;
  if (v < 2 || v > 3) failures.push(`${dateStr}: vowel count ${v} not in [2,3]`);

  if ('sxzq'.includes(p.keyLetter)) failures.push(`${dateStr}: forbidden center ${p.keyLetter}`);

  if (p.letters.includes('e') && p.letters.includes('r')) failures.push(`${dateStr}: E+R together`);

  const rare = p.letters.filter(l => 'jqxz'.includes(l)).length;
  if (rare > 1) failures.push(`${dateStr}: ${rare} rare consonants (max 1)`);
}
```

- [ ] **Step 2: Run verify, observe failures**

Run: `node scripts/verify-puzzles.js`
Expected: multiple failures across the 30-day range — typically several E+R co-occurrences and possibly vowel-count violations.

- [ ] **Step 3: Add `passesHardLetterRules` and rewrite the start of `generatePuzzle`**

In `src/js/puzzle.js`, add this helper directly after `getPrevDaySeeds`:

```js
function passesHardLetterRules(letters, keyLetter, rng) {
  const v = countVowels(letters);
  if (v < 2 || v > 3) return false;
  if ('sxzq'.includes(keyLetter)) return false;
  if ('jvwy'.includes(keyLetter) && rng.next() < 0.95) return false;
  if (hasERTogether(letters)) return false;
  if (countRareConsonants(letters) > 1) return false;
  return true;
}
```

Then replace the entire body of `generatePuzzle` (currently lines 23–98). Use this as the new body — note we keep the existing word-scan logic, common/total score computation, difficulty label, and return shape unchanged. Only the hard-rule gating moves into `passesHardLetterRules`:

```js
function generatePuzzle(seed) {
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
```

- [ ] **Step 4: Run verify, observe pass**

Run: `node scripts/verify-puzzles.js`
Expected: zero failures. The center-letter distribution should now never include S, X, Z, or Q. E and R should never appear together.

- [ ] **Step 5: Commit**

```bash
git add src/js/puzzle.js scripts/verify-puzzles.js
git commit -m "feat: enforce hard letter-set rules in puzzle generation"
```

---

## Task 5: Require a common-word pangram

**Files:**
- Modify: `src/js/puzzle.js`
- Modify: `scripts/verify-puzzles.js`

A puzzle whose only pangram is obscure is unfair. Require that at least one pangram is in `COMMON_WORDS`.

- [ ] **Step 1: Add common-pangram assertion**

Append to the per-puzzle assertions block in the verify script:

```js
for (const { dateStr, p } of puzzles) {
  const hasCommon = p.validWords.some(w =>
    new Set(w).size === 7 &&
    p.letters.every(l => w.includes(l)) &&
    ctx.COMMON_WORDS.has(w)
  );
  if (!hasCommon) failures.push(`${dateStr}: no common pangram (only obscure)`);
}
```

- [ ] **Step 2: Run verify**

Run: `node scripts/verify-puzzles.js`
Expected: depending on luck, zero or a small number of failures (current generator may already happen to satisfy this).

- [ ] **Step 3: Add `hasCommonPangram` helper and integrate into `generatePuzzle`**

In `src/js/puzzle.js`, add this helper just above `generatePuzzle` (after `passesHardLetterRules`):

```js
function hasCommonPangram(validWords, letters) {
  for (const w of validWords) {
    if (isBloom(w, letters) && COMMON_WORDS.has(w)) return true;
  }
  return false;
}
```

In `generatePuzzle`, replace the existing `if (!hasBloom) continue;` line with:

```js
    if (!hasBloom) continue;
    if (!hasCommonPangram(validWords, letters)) continue;
```

(Place `hasCommonPangram` check directly after the `hasBloom` check so we only do the COMMON_WORDS scan when we already have a pangram at all.)

- [ ] **Step 4: Run verify, observe pass**

Run: `node scripts/verify-puzzles.js`
Expected: zero failures.

- [ ] **Step 5: Commit**

```bash
git add src/js/puzzle.js scripts/verify-puzzles.js
git commit -m "feat: require pangram to be in COMMON_WORDS"
```

---

## Task 6: Apply weekend size gates

**Files:**
- Modify: `src/js/puzzle.js`
- Modify: `scripts/verify-puzzles.js`

Saturday and Sunday puzzles get larger size requirements: ≥35 common words, ≥100 common score, ≥45 total words.

- [ ] **Step 1: Add weekend-size assertions to the verify script**

Append to the per-puzzle assertions block:

```js
for (const { dateStr, dow, p } of puzzles) {
  const isWeekend = dow === 0 || dow === 6;
  if (isWeekend) {
    if (p.commonWords.length < 35) failures.push(`${dateStr}: weekend common ${p.commonWords.length} < 35`);
    if (p.commonScore < 100) failures.push(`${dateStr}: weekend score ${p.commonScore} < 100`);
    if (p.validWords.length < 45) failures.push(`${dateStr}: weekend total ${p.validWords.length} < 45`);
  } else {
    if (p.commonWords.length < 15) failures.push(`${dateStr}: weekday common ${p.commonWords.length} < 15`);
    if (p.commonScore < 40) failures.push(`${dateStr}: weekday score ${p.commonScore} < 40`);
  }
}
```

- [ ] **Step 2: Run verify, observe failures**

Run: `node scripts/verify-puzzles.js`
Expected: weekend days (2026-05-02, 03, 09, 10, 16, 17, 23, 24, 30) likely fail one or more weekend gates.

- [ ] **Step 3: Wire weekend gates into `generatePuzzle`**

In `src/js/puzzle.js`, at the very top of `generatePuzzle`, compute the gates once:

```js
function generatePuzzle(seed) {
  const isWeekend = isWeekendSeed(seed);
  const minCommon = isWeekend ? 35 : 15;
  const minCommonScore = isWeekend ? 100 : 40;
  const minTotal = isWeekend ? 45 : 0;

  const vowels = 'aeiou'.split('');
  // ... (rest of body unchanged below)
```

Then replace the size checks. Currently we have:

```js
    if (commonWords.length < 15) continue;
    // ...
    if (!hasBloom) continue;
    if (!hasCommonPangram(validWords, letters)) continue;
    if (commonScore < 40) continue;
```

Replace with:

```js
    if (commonWords.length < minCommon) continue;
    // ...
    if (!hasBloom) continue;
    if (!hasCommonPangram(validWords, letters)) continue;
    if (commonScore < minCommonScore) continue;
    if (validWords.length < minTotal) continue;
```

(The `commonWords.length < minCommon` check stays at the same point as the original `< 15` check — before the score loop. The new `< minTotal` check goes after score computation.)

- [ ] **Step 4: Run verify, observe pass**

Run: `node scripts/verify-puzzles.js`
Expected: zero failures. Weekend puzzles now have measurably larger word counts.

- [ ] **Step 5: Commit**

```bash
git add src/js/puzzle.js scripts/verify-puzzles.js
git commit -m "feat: apply larger size gates on Sat/Sun puzzles"
```

---

## Task 7: Add `generatePuzzleLettersOnly` fast-path and cache helpers

**Files:**
- Modify: `src/js/puzzle.js`
- Modify: `scripts/verify-puzzles.js`

Fast path returns the first letter set that passes hard rules for a given seed. Used by Task 8's lookback. The function and its cache live in `src/js/puzzle.js`. Cache uses `localStorage` keyed `bloombert-letters-YYYY-MM-DD`. The fast-path output may differ from the full generator's output (since the full generator may also reject on word-scan rules); the lookback compares against this approximation, which is fine because all clients agree deterministically.

- [ ] **Step 1: Add fast-path assertions to the verify script**

Append to the helper assertions block:

```js
const fastA = ctx.generatePuzzleLettersOnly(20260501);
const fastB = ctx.generatePuzzleLettersOnly(20260501);
assertEq(fastA, fastB, 'fast path deterministic');
if (fastA.letters.length !== 7) failures.push(`fast path: got ${fastA.letters.length} letters`);
if (!fastA.letters.includes(fastA.keyLetter)) failures.push(`fast path: keyLetter not in letters`);
if ('sxzq'.includes(fastA.keyLetter)) failures.push(`fast path: forbidden center ${fastA.keyLetter}`);
const fv = fastA.letters.filter(l => 'aeiou'.includes(l)).length;
if (fv < 2 || fv > 3) failures.push(`fast path: vowel count ${fv}`);
```

- [ ] **Step 2: Run verify, observe failures**

Run: `node scripts/verify-puzzles.js`
Expected: failures referencing `generatePuzzleLettersOnly` (function undefined).

- [ ] **Step 3: Add cache helpers and the fast-path function**

In `src/js/puzzle.js`, add these helpers just before `generatePuzzle` (after `hasCommonPangram`):

```js
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
```

- [ ] **Step 4: Run verify, observe pass**

Run: `node scripts/verify-puzzles.js`
Expected: zero failures.

- [ ] **Step 5: Commit**

```bash
git add src/js/puzzle.js scripts/verify-puzzles.js
git commit -m "feat: add letters-only fast path with localStorage cache"
```

---

## Task 8: Add lookback rejection in `generatePuzzle`

**Files:**
- Modify: `src/js/puzzle.js`
- Modify: `scripts/verify-puzzles.js`

Compute the previous 3 days' letter sets via `generatePuzzleLettersOnly` once at the top of `generatePuzzle`, then reject any candidate whose center matches a neighbor's center, or whose 7 letters share ≥6 with a neighbor's 7 letters.

- [ ] **Step 1: Add lookback assertions to the verify script**

Append after the per-puzzle assertions block (NOT in the helper block — these compare across days). The check uses `generatePuzzleLettersOnly` for prev-day reference, matching what the implementation does:

```js
// --- Lookback assertions (vs fast-path approximation, matching impl behavior) ---
for (const { dateStr, seed, p } of puzzles) {
  const prevSeeds = ctx.getPrevDaySeeds(seed, 3);
  for (let j = 0; j < prevSeeds.length; j++) {
    const prev = ctx.generatePuzzleLettersOnly(prevSeeds[j]);
    if (prev.keyLetter === p.keyLetter) {
      failures.push(`${dateStr}: center matches ${j + 1}-day-prior fast-path (${p.keyLetter})`);
    }
    const overlap = p.letters.filter(l => prev.letters.includes(l)).length;
    if (overlap >= 6) {
      failures.push(`${dateStr}: ${overlap}-letter overlap with ${j + 1}-day-prior fast-path`);
    }
  }
}
```

- [ ] **Step 2: Run verify, observe failures**

Run: `node scripts/verify-puzzles.js`
Expected: at least a few failures across 30 days where today's center happens to match a neighbor's, or letter overlap is ≥6.

- [ ] **Step 3: Add `passesLookback` helper and integrate into `generatePuzzle`**

In `src/js/puzzle.js`, add this helper directly after `generatePuzzleLettersOnly`:

```js
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
```

In `generatePuzzle`, compute neighbor letter sets once at the top (after the gates lines added in Task 6):

```js
function generatePuzzle(seed) {
  const isWeekend = isWeekendSeed(seed);
  const minCommon = isWeekend ? 35 : 15;
  const minCommonScore = isWeekend ? 100 : 40;
  const minTotal = isWeekend ? 45 : 0;

  const prevDays = getPrevDaySeeds(seed, 3).map(generatePuzzleLettersOnly);

  const vowels = 'aeiou'.split('');
  // ... (unchanged below)
```

Inside the attempt loop, immediately after the `passesHardLetterRules` check, add:

```js
    if (!passesHardLetterRules(letters, keyLetter, rng)) continue;
    if (!passesLookback(letters, keyLetter, prevDays, { dropCenter: false, dropOverlap: false })) continue;
```

(The `opts` argument lets Task 9 wire fallback drops in without touching call shape.)

- [ ] **Step 4: Run verify, observe pass**

Run: `node scripts/verify-puzzles.js`
Expected: zero failures. Center-letter distribution should look more even across the 30-day range.

- [ ] **Step 5: Commit**

```bash
git add src/js/puzzle.js scripts/verify-puzzles.js
git commit -m "feat: enforce 3-day lookback variety in puzzle generation"
```

---

## Task 9: Add the graded fallback ladder

**Files:**
- Modify: `src/js/puzzle.js`
- Modify: `scripts/verify-puzzles.js`

Generation must never throw. Drop constraints in order: overlap rule at 800, weekend gates at 1100, center-repeat at 1300, throw at 1500. Each drop logs to console with seed and attempt count for diagnosability.

- [ ] **Step 1: Extend verify range to 90 days for stress test**

In `scripts/verify-puzzles.js`, change `const DAYS = 30;` to `const DAYS = 90;`. Save and continue.

- [ ] **Step 2: Run verify**

Run: `node scripts/verify-puzzles.js`
Expected: 90/90 generations succeed (no throws). Some assertions may pass already because the 1500-attempt budget is generous; we'll harden by adding the ladder explicitly.

- [ ] **Step 3: Wire the fallback ladder into `generatePuzzle`**

Replace the entire attempt loop in `generatePuzzle`. Before the loop, declare the drop flags:

```js
  let dropOverlap = false;
  let dropWeekendGates = false;
  let dropCenterRepeat = false;
```

Inside the loop, at the very top of each iteration (before the RNG draw), add:

```js
    if (attempt === 800 && !dropOverlap) {
      dropOverlap = true;
      console.warn(`[bloombert] dropping letter-overlap rule at attempt ${attempt}, seed ${seed}`);
    }
    if (attempt === 1100 && isWeekend && !dropWeekendGates) {
      dropWeekendGates = true;
      console.warn(`[bloombert] dropping weekend size gates at attempt ${attempt}, seed ${seed}`);
    }
    if (attempt === 1300 && !dropCenterRepeat) {
      dropCenterRepeat = true;
      console.warn(`[bloombert] dropping center-repeat rule at attempt ${attempt}, seed ${seed}`);
    }
```

Replace the `passesLookback` call with the dropped-rule-aware version:

```js
    if (!passesLookback(letters, keyLetter, prevDays, { dropCenter: dropCenterRepeat, dropOverlap })) continue;
```

Replace the size-gate checks to use weekday gates when `dropWeekendGates` is true:

```js
    const activeMinCommon = dropWeekendGates ? 15 : minCommon;
    const activeMinScore = dropWeekendGates ? 40 : minCommonScore;
    const activeMinTotal = dropWeekendGates ? 0 : minTotal;
    if (commonWords.length < activeMinCommon) continue;
```

(Move this block to right before the existing `commonWords.length < minCommon` check, then change that line and the subsequent `commonScore < ...` and `validWords.length < ...` lines to use `activeMinScore` / `activeMinTotal`.)

Final shape of the size checks:

```js
    if (commonWords.length < activeMinCommon) continue;

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
    if (commonScore < activeMinScore) continue;
    if (validWords.length < activeMinTotal) continue;
```

- [ ] **Step 4: Run verify**

Run: `node scripts/verify-puzzles.js`
Expected: 90/90 generations succeed; zero assertion failures. Console may include zero or a small number of `[bloombert] dropping ...` lines (rare in practice — the budget is generous).

- [ ] **Step 5: Stress-test with extended range**

Temporarily change `DAYS = 365` and rerun. Expected: 365/365 succeed; assertion failures still zero (or rarely 1–2 in cases where ladder dropped a constraint to make a puzzle, which is the intended fallback). Revert `DAYS` back to `90` before committing.

- [ ] **Step 6: Commit**

```bash
git add src/js/puzzle.js scripts/verify-puzzles.js
git commit -m "feat: graded fallback ladder for puzzle generation"
```

---

## Task 10: Manual browser smoke test

**Files:** none

Verify the implementation behaves correctly in the actual game UI.

- [ ] **Step 1: Serve and open the site**

Run: `npx serve .` (or open `index.html` directly in a browser)
Open the site. Today's puzzle should load with 7 letters, a center letter, and a valid common pangram findable in the word list.

- [ ] **Step 2: Try a few specific test cases**

Use the custom puzzle URL feature (`?puzzle=` parameter) to verify:
- A puzzle with center S is rejected by `parseCustomPuzzleParam`'s normal flow — actually, `parseCustomPuzzleParam` doesn't apply the new center rules (custom puzzles intentionally bypass quality gates). Confirm a custom URL still loads any letter set; the new gates apply only to the daily generator. This is by design.

Verify the daily puzzle on at least one weekday and one weekend day. If today is mid-week, manually check via a test seed in the browser console:

```js
generatePuzzle(20260502); // Saturday — should have ≥35 common words
generatePuzzle(20260504); // Monday — typical weekday size
```

Confirm both return well-formed puzzle objects.

- [ ] **Step 3: Confirm `localStorage` cache populated**

In the browser DevTools, check `Application > Local Storage`. After loading the daily puzzle once, you should see one or more `bloombert-letters-YYYY-MM-DD` entries from the lookback fast-path.

- [ ] **Step 4: Confirm no console errors**

Open DevTools console while loading the daily puzzle. There should be no errors. `[bloombert] dropping ...` warnings are acceptable but should be rare.

---

## Task 11: Open PR

**Files:** none

- [ ] **Step 1: Push branch**

Run:
```bash
git push -u origin enhance-puzzle-generation
```

- [ ] **Step 2: Create PR**

Run:
```bash
gh pr create --title "Improve daily puzzle generation with NYT-inspired quality gates" --body "$(cat <<'EOF'
## Summary
- Hard letter-set rules: vowel count 2–3, no E+R, S/X/Z/Q never as center, J/V/W/Y rare as center, ≤1 of {J,Q,X,Z}, common-word pangram required.
- 3-day lookback variety enforcement via deterministic letters-only fast-path.
- Saturday and Sunday puzzles get larger size gates (≥35 common words, ≥100 score, ≥45 total).
- Graded fallback ladder ensures generation never throws.
- All changes localized to `src/js/puzzle.js`. New `scripts/verify-puzzles.js` exercises 90 days of generation as the test harness.

See `docs/superpowers/specs/2026-05-01-puzzle-generation-design.md` for the design.

## Test plan
- [ ] `node scripts/verify-puzzles.js` passes with zero failures
- [ ] Manual: today's puzzle loads in the browser without errors
- [ ] Manual: a Saturday seed produces a noticeably larger common-word pool
- [ ] Manual: `bloombert-letters-*` keys appear in localStorage after load

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Return the PR URL when finished.

---

## Self-review notes

- **Spec coverage:** Section 1 → Tasks 4, 5, 6. Section 2 → Tasks 7, 8. Section 3 → Task 6. Section 4 → Task 9. Verify script → Task 1 (and extended in every task). Manual + PR → Tasks 10, 11. Out-of-scope items remain out of scope.
- **No placeholders:** every code step has copyable code; every run step has expected output; all file paths are exact.
- **Type/identifier consistency:** `passesHardLetterRules`, `passesLookback`, `hasCommonPangram`, `generatePuzzleLettersOnly`, `readNeighborLetters`, `writeNeighborLetters`, `seedToParts`, `seedToDateStr`, `isWeekendSeed`, `getPrevDaySeeds`, `countVowels`, `countRareConsonants`, `hasERTogether` — all referenced consistently.
- **Caveat called out:** Lookback compares against fast-path approximation, not actual played letters. This is by design (deterministic across clients, no recursion) and matches the spec.
