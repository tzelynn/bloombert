/**
 * Test: Game remains playable after reaching Garden Master rank.
 *
 * Loads the scoring and puzzle logic, simulates reaching Garden Master,
 * then verifies that additional words can still be submitted and scored.
 *
 * Run: node tests/garden-master-playable.test.js
 */

'use strict';

// --- Minimal harness: load source files that use globals ---
const fs = require('fs');
const vm = require('vm');

const ctx = vm.createContext({ Set, Math, console, Map, Array, Object, parseInt, String, Error });

const sourceFiles = [
  'src/js/prng.js',
  'src/js/scoring.js',
];

for (const file of sourceFiles) {
  const code = fs.readFileSync(file, 'utf-8');
  vm.runInContext(code, ctx);
}

// Pull functions out of the sandbox
const { scoreWord, isBloom, computeRankThresholds, getRank, formatShareText } = ctx;

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

// --- Setup: a realistic puzzle scenario ---
const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const commonScore = 100; // Garden Master threshold
const thresholds = computeRankThresholds(commonScore);

console.log('Thresholds:', JSON.stringify(thresholds));
console.log();

// ============================================================
console.log('1. getRank at exactly Garden Master threshold');
// ============================================================
{
  const rank = getRank(commonScore, thresholds);
  assert(rank.name === 'Garden Master', `rank name is "Garden Master" (got "${rank.name}")`);
  assert(rank.emoji === '🌟', 'emoji is 🌟');
  assert(rank.next === null, 'no next rank');
  assert(rank.nextEmoji === null, 'no next emoji');
  assert(rank.progressPct === 100, `progressPct is 100 (got ${rank.progressPct})`);
}

console.log();

// ============================================================
console.log('2. getRank ABOVE Garden Master threshold (bonus words push score higher)');
// ============================================================
{
  const overScore = commonScore + 50;
  const rank = getRank(overScore, thresholds);
  assert(rank.name === 'Garden Master', `still "Garden Master" at ${overScore} pts (got "${rank.name}")`);
  assert(rank.progressPct === 100, `progressPct stays 100 (got ${rank.progressPct})`);
  assert(rank.next === null, 'still no next rank');
}

console.log();

// ============================================================
console.log('3. scoreWord still works after Garden Master');
// ============================================================
{
  // Common word (not bloom, not bonus)
  const pts1 = scoreWord('abcd', letters, false);
  assert(pts1 === 4, `4-letter common word scores 4 (got ${pts1})`);

  // Bonus word (half score)
  const pts2 = scoreWord('abcd', letters, true);
  assert(pts2 === 2, `4-letter bonus word scores 2 (got ${pts2})`);

  // Bloom word (uses all 7 letters) — not bonus
  const bloomWord = 'abcdefg';
  assert(isBloom(bloomWord, letters), `"${bloomWord}" is a bloom`);
  const pts3 = scoreWord(bloomWord, letters, false);
  assert(pts3 === 7 + 7, `bloom word scores ${7 + 7} (got ${pts3})`);

  // Bloom + bonus
  const pts4 = scoreWord(bloomWord, letters, true);
  assert(pts4 === Math.floor((7 + 7) / 2), `bloom bonus word scores ${Math.floor(14 / 2)} (got ${pts4})`);
}

console.log();

// ============================================================
console.log('4. Simulating full game: reach Garden Master, then keep playing');
// ============================================================
{
  let score = 0;
  const foundWords = new Set();

  // Simulate finding words until we hit Garden Master
  // Each word is worth its length; we'll pretend they're 5-letter common words
  while (score < commonScore) {
    const fakeWord = `word${foundWords.size}`;
    foundWords.add(fakeWord);
    score += 5; // pretend each word is 5 pts
  }

  const rankAtGM = getRank(score, thresholds);
  assert(rankAtGM.name === 'Garden Master', `reached Garden Master at ${score} pts`);

  // Now find more words — game should not break
  const prevRank = rankAtGM.name;
  score += 5; // another common word
  foundWords.add('extraword1');

  const rankAfter1 = getRank(score, thresholds);
  assert(rankAfter1.name === 'Garden Master', `still Garden Master after extra word (score=${score})`);
  assert(rankAfter1.name === prevRank, 'no spurious rank change');

  // Find several more bonus words
  for (let i = 2; i <= 10; i++) {
    score += 3; // bonus words score less
    foundWords.add(`bonusword${i}`);
  }

  const rankAfterMany = getRank(score, thresholds);
  assert(rankAfterMany.name === 'Garden Master', `still Garden Master after many bonus words (score=${score})`);
  assert(rankAfterMany.progressPct === 100, 'progress bar stays at 100%');
}

console.log();

// ============================================================
console.log('5. formatShareText works at Garden Master');
// ============================================================
{
  const rank = getRank(commonScore + 30, thresholds);
  const text = formatShareText('2026-03-21', rank, 25, 40, commonScore + 30, 2, 5);
  assert(typeof text === 'string', 'returns a string');
  assert(text.includes('Garden Master'), 'share text includes "Garden Master"');
  assert(text.includes('🌟'), 'share text includes Garden Master emoji');
  assert(text.includes('🌸🌸🌸🌸🌸🌸🌸🌸'), 'progress bar is fully filled (8 blooms)');
  assert(text.includes('130 pts'), `shows correct score (got: ${text.match(/\d+ pts/)})`);
  assert(text.includes('25 words found'), 'shows word count');
  assert(text.includes('+ 5 bonus'), 'shows bonus count');
  assert(text.includes('2 bloom'), 'shows bloom count');
}

console.log();

// ============================================================
console.log('6. Edge case: score exactly 1 below Garden Master, then cross over');
// ============================================================
{
  const justBelow = commonScore - 1;
  const rankBelow = getRank(justBelow, thresholds);
  assert(rankBelow.name === 'Bouquet', `at ${justBelow} pts, rank is Bouquet (got "${rankBelow.name}")`);
  assert(rankBelow.next === 'Garden Master', 'next rank is Garden Master');

  const rankExact = getRank(commonScore, thresholds);
  assert(rankExact.name === 'Garden Master', `at exactly ${commonScore} pts, rank is Garden Master`);

  // This is the rank-up that app.js checks
  assert(rankBelow.name !== rankExact.name, 'rank change detected correctly');
}

console.log();

// --- Summary ---
console.log('='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed!');
}
