# Puzzle Generation Improvements

## Goal

Daily letter sets feel repetitive and not fun. Adopt NYT Spelling Bee-inspired quality gates so individual puzzles are more varied and weekends feel meatier than weekdays. Scope is letter selection only — no new files, no new UI, no scoring changes.

## Background

Current generation in `src/js/puzzle.js` draws 7 unique letters from a weighted pool (vowels 3×, common consonants 2×, rare 1×), retries up to 1000× until it satisfies a few minimal gates (≥15 common words, ≥1 pangram, ≥40 common score, key letter not in `qxz`, S as key letter skipped 90% of the time). This produces:

- Visible repetition across days — common letters cluster naturally and the only cross-day mechanism is the seed.
- Easy "trivializing" combinations such as E+R together (`-ER` suffix), S in many positions (plurals).
- Weekday and weekend puzzles feel identical.

NYT research (see brainstorming session): puzzles cap vowels at 3, never combine E and R, ban S as center, ban X as center, every puzzle has ≥1 recognizable pangram, weekend puzzles are larger.

## Requirements

### Functional

1. Letter selection enforces stricter quality gates (Section 1).
2. Generation rejects candidates that overlap heavily with the last 3 days (Section 2).
3. Saturday and Sunday puzzles meet stricter size requirements (Section 3).
4. All generation remains deterministic from the date seed — same date → same puzzle for every player.
5. All changes live in `src/js/puzzle.js`. No new files. No `prepare-words.js` changes. No UI changes.

### Non-functional

1. First puzzle generation on page load completes in under 500 ms on a typical desktop.
2. Generation never crashes — graded fallbacks ensure a puzzle is always produced.
3. Console logs every fallback that triggers, including seed and attempt count, for diagnosability.

## Section 1 — Per-puzzle quality gates

For each candidate 7-letter set, apply gates in order. Cheap rejections first.

### Hard letter-set rules (no word scan)

1. **Vowel count must be 2 or 3.** Reject 0, 1, or 4+. Vowels are A, E, I, O, U (Y is a consonant).
2. **Center letter:**
   - Forbidden: S, X, Z, Q.
   - Allowed but rare: J, V, W, Y. When the candidate's center letter is one of these, reject 95% of the time using a draw from the same RNG. Net effect: ~5% of accepted puzzles have a J/V/W/Y center.
   - All other letters allowed as center.
3. **Banned co-occurrence: E and R must not both appear** in the 7-letter set.
4. **Rare-consonant cap: at most 1 of {J, Q, X, Z}** in the 7-letter set.
5. **S handling: S allowed only as outer letter, never as center.** (Item 2 already forbids S as center; this requirement also implies no special skip-rate for S beyond that.)

### Word-scan rules

After hard letter-set rules and lookback rules pass, run `getAllValidWords` and check:

6. **Pangram quality: at least one pangram must be in `COMMON_WORDS`.** A puzzle whose only pangram is obscure is unfair.
7. **Min common words:** ≥15 weekday, ≥35 weekend (Section 3).
8. **Min common score:** ≥40 weekday, ≥100 weekend.
9. **Min total words (weekend only):** ≥45.

## Section 2 — Lookback variety enforcement

When generating today's puzzle, also generate puzzles for the previous 3 days using their date seeds. Reject today's candidate if either:

1. **Center letter matches** any of the last 3 days' center letters.
2. **Letter-set overlap ≥6 of 7 letters** with any of the last 3 days' sets.

### Performance optimization

Neighbor-day generation only needs `letters` and `keyLetter` — no word validation. Add an internal `generatePuzzleLettersOnly(seed)` fast path that runs the letter-draw loop with the same hard letter-set rules from Section 1, but skips the word-scan rules. This means we still produce a valid letter set for each neighbor day cheaply.

### Caching

Cache neighbor-day letter sets in `localStorage` under `bloombert-letters-YYYY-MM-DD` so subsequent loads on the same day skip the recomputation. Key by date (not seed) so it's human-readable and prunable.

The full puzzle for today is already cached implicitly via `bloombert-state-YYYY-MM-DD`; this is a separate, smaller cache for letters only, keyed differently to avoid collision.

### Determinism

The neighbor-day fast path uses the same seed-derivation logic as today's path, so all clients compute the same neighbor letter sets and reach the same accept/reject decision. The lookback comparison itself is pure.

## Section 3 — Weekend difficulty

Saturday and Sunday (UTC-4, matching `getPuzzleDate`) bump the size requirements:

| Day | Min common words | Min common score | Min total words |
|-----|------------------|------------------|-----------------|
| Mon–Fri | ≥15 | ≥40 | (none) |
| Sat–Sun | ≥35 | ≥100 | ≥45 |

The existing `difficulty` label (`'Easy' | 'Medium' | 'Hard'`) is unchanged in formula; weekends will naturally land on 'Medium' or 'Hard' more often. No UI work needed.

Garden Master threshold logic in `scoring.js` is unchanged — it scales naturally with the larger common-word pool.

## Section 4 — Integration & fallback strategy

### Order of operations inside `generatePuzzle(seed)`

Once, before the attempt loop:

- Compute the previous 3 days' letter sets via `generatePuzzleLettersOnly(neighborSeed)`, using cached values from `localStorage` when present. Hold the resulting list of `{letters, keyLetter}` for use in lookback comparisons.

For each attempt (up to 1500):

1. Draw 7 unique letters from the weighted pool (current weighting retained).
2. Apply Section 1 hard letter-set rules. Reject and retry on failure.
3. Apply Section 2 lookback rules against the precomputed neighbor-day list. Reject and retry on failure.
4. Compute `validWords` via `getAllValidWords`.
5. Apply Section 1 word-scan rules. Reject and retry on failure.
6. Return the puzzle.

### Graded fallbacks

If no candidate passes by the listed attempt threshold, drop the constraint and continue:

| After attempt | Drop |
|---------------|------|
| 800 | "≥6 letter-overlap with last 3 days" rule |
| 1100 | Weekend-only size gates (revert to weekday gates) |
| 1300 | Center-letter-repeat lookback rule |
| 1500 | Throw — should never happen in practice |

Each fallback that triggers logs to console with seed, attempt count, and the dropped constraint.

### Files touched

- `src/js/puzzle.js` — all logic changes.
- No changes to `index.html`, scripts, data, or UI.

## Testing

The current codebase has no automated tests. For this change, add an ad-hoc verification script that can be run manually:

1. Generate puzzles for a 30-day stretch (e.g. 2026-05-01 through 2026-05-30).
2. Assert: no center-letter repeats within any 4-day window, no E+R co-occurrence in any puzzle, all weekend puzzles have ≥35 common words, all puzzles have ≥1 common pangram, vowel count is 2 or 3 for every puzzle.
3. Print summary: distribution of center letters, vowel counts, common-word counts.

This script lives in `scripts/verify-puzzles.js` and is run manually after the change. It is not a test framework; it just exercises the same `generatePuzzle` function from Node by stubbing browser globals.

## Out of scope

- Pre-computed daily schedule (Option 1 from brainstorming). May revisit if Option 2 + lookback proves insufficient.
- Themed weeks, special days, multi-pangram modes.
- Scoring or ranking changes.
- New UI surfaces (e.g. displaying pangram count, yesterday's pangram).
- `prepare-words.js` changes — common word list and inflection logic stay as-is.

## Open questions

None — all design decisions resolved during brainstorming.
