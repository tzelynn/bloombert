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

// `const` declarations don't attach to the vm context, so pull these out explicitly.
const COMMON_WORDS = vm.runInContext('COMMON_WORDS', ctx);
const WORD_LIST = vm.runInContext('WORD_LIST', ctx);

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

// --- Per-puzzle assertions (hard letter-set rules) ---
for (const { dateStr, p } of puzzles) {
  const v = p.letters.filter(l => 'aeiou'.includes(l)).length;
  if (v < 2 || v > 3) failures.push(`${dateStr}: vowel count ${v} not in [2,3]`);

  if ('sxzq'.includes(p.keyLetter)) failures.push(`${dateStr}: forbidden center ${p.keyLetter}`);

  if (p.letters.includes('e') && p.letters.includes('r')) failures.push(`${dateStr}: E+R together`);

  const rare = p.letters.filter(l => 'jqxz'.includes(l)).length;
  if (rare > 1) failures.push(`${dateStr}: ${rare} rare consonants (max 1)`);
}

for (const { dateStr, p } of puzzles) {
  const hasCommon = p.validWords.some(w =>
    new Set(w).size === 7 &&
    p.letters.every(l => w.includes(l)) &&
    COMMON_WORDS.has(w)
  );
  if (!hasCommon) failures.push(`${dateStr}: no common pangram (only obscure)`);
}

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

// 2026-05-01 is a Friday (UTC); 2026-05-02 is a Saturday.
assertEq(ctx.isWeekendSeed(20260501), false, 'isWeekendSeed Fri');
assertEq(ctx.isWeekendSeed(20260502), true, 'isWeekendSeed Sat');
assertEq(ctx.isWeekendSeed(20260503), true, 'isWeekendSeed Sun');
assertEq(ctx.isWeekendSeed(20260504), false, 'isWeekendSeed Mon');

assertEq(ctx.seedToDateStr(20260501), '2026-05-01', 'seedToDateStr');
assertEq(ctx.seedToDateStr(20260101), '2026-01-01', 'seedToDateStr january');

assertEq(ctx.getPrevDaySeeds(20260503, 3), [20260502, 20260501, 20260430], 'getPrevDaySeeds across month');
assertEq(ctx.getPrevDaySeeds(20260101, 3), [20251231, 20251230, 20251229], 'getPrevDaySeeds across year');

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
