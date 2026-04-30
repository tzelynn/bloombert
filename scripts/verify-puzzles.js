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
