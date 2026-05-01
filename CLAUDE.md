# Bloombert

Daily word puzzle game (Spelling Bee clone) with a botanical theme. Deployed as a static site on GitHub Pages — no build step, no bundler, no framework.

## Quick start

```bash
node scripts/prepare-words.js   # downloads ENABLE list → src/data/words.js
# then open index.html in a browser, or:
npx serve .
```

## Architecture

Vanilla JS loaded via `<script>` tags in `index.html`. No modules, no imports — all files expose globals.

| File | Purpose |
|------|---------|
| `index.html` | Entry point. Loads scripts in dependency order. |
| `src/data/words.js` | `WORD_LIST` (~150k valid words) and `COMMON_WORDS` (~14k common words). Generated, not hand-edited. |
| `src/js/prng.js` | `createRNG(seed)` — Mulberry32 seeded PRNG. |
| `src/js/scoring.js` | `scoreWord`, `isBloom`, `computeRankThresholds`, `getRank`, `formatShareText`. `formatShareText` takes `(date, rank, foundCount, totalCount, score, bloomCount)` and produces NYT-inspired share text with emoji progress bar. |
| `src/js/puzzle.js` | `generatePuzzle(seed)`, `generatePuzzleLettersOnly(seed)` (lookback fast-path), `getAllValidWords`, `isValidGuess`, plus letter/seed/date helpers (`countVowels`, `countRareConsonants`, `hasERTogether`, `seedToDateStr`, `isWeekendSeed`, `getPrevDaySeeds`) and quality-gate functions (`passesHardLetterRules`, `hasCommonPangram`, `passesLookback`). Depends on `WORD_LIST`, `COMMON_WORDS`, `createRNG`, `scoreWord`, `isBloom`. |
| `src/js/state.js` | `loadState`, `saveState`, `loadStats`, `saveStats`, `checkAndUpdateStreak`. Uses `localStorage`. |
| `src/js/app.js` | UI controller — DOM manipulation, event binding, modals, share flow. IIFE, depends on all above. |
| `src/css/style.css` | All styles — responsive, animations, botanical theme. |
| `scripts/prepare-words.js` | Node script to download and filter the ENABLE word list. Output path is hardcoded to `words.js` in CWD — run from project root or update the path. |
| `scripts/verify-puzzles.js` | Node test harness. Loads `words.js`, `prng.js`, `scoring.js`, `puzzle.js` into a `vm` context with a stub `localStorage`, then drives `generatePuzzle(seed)` over a 90-day window and asserts every quality gate. Run after editing `src/js/puzzle.js`. |

**Script load order matters:** `words.js` → `prng.js` → `scoring.js` → `puzzle.js` → `state.js` → `app.js`.

## Key conventions

- All game JS lives in IIFEs or bare functions on `window`. No ES modules.
- Puzzle generation is deterministic: seeded with `parseInt("YYYYMMDD")`. Same date = same puzzle everywhere.
- Game state is keyed per day in `localStorage` (`bloombert-state-YYYY-MM-DD`).
- Stats are stored in `localStorage` under `bloombert-stats`.
- The 3-day lookback fast-path caches each day's letter set in `localStorage` (`bloombert-letters-YYYY-MM-DD`). Safe to clear; will be regenerated deterministically.
- Custom events dispatched on `document`: `Bloombert:success`, `Bloombert:error`, `Bloombert:bloom`, `Bloombert:rankup`.
- Share flow: header share button and stats modal "Share Results" both close stats modal → open share modal with formatted text preview → user clicks "Copy to Clipboard" → inline button feedback ("✅ Copied!"). Uses Clipboard API with `execCommand('copy')` fallback.

## Modals

- `modal-stats` — player stats and "Share Results" button.
- `modal-share` — share text preview with copy button. Opened via header 📤 button or "Share Results" in stats modal.
- Modals use `hidden` attribute, managed by `openModal()`/`closeModal()`.

## Scoring rules

- Every word scores 1 point per letter (e.g. 4 letters = 4 pts).
- Bloom (uses all 7 letters) = word score + 7 bonus.
- Words are split into **common** (from a 20k frequency list) and **bonus** (obscure but valid). Rank thresholds are based on common words' total score only, so Garden Master is reachable without knowing obscure words.
- `COMMON_WORDS` set is generated alongside `WORD_LIST` by `prepare-words.js`.

## Puzzle quality gates

`generatePuzzle(seed)` enforces, in order:

- **Hard letter rules** (`passesHardLetterRules`): 2–3 vowels, no E+R together, ≤1 of {J,Q,X,Z}, S/X/Z/Q never as centre, J/V/W/Y centre rejected 95% of the time.
- **3-day lookback** (`passesLookback`): centre-letter match and ≥6-letter overlap blocked vs the previous 3 days. Neighbour letter sets come from `generatePuzzleLettersOnly`, cached per seed in `localStorage` (`bloombert-letters-YYYY-MM-DD`).
- **Size**: weekday ≥15 common words, ≥40 common score; weekend (Sat/Sun) ≥35 common, ≥100 score, ≥45 total.
- **Pangram**: at least one Bloom word must be in `COMMON_WORDS` (`hasCommonPangram`).
- **Bloom**: at least one valid pangram exists.

If candidates fail repeatedly, a graded fallback ladder drops constraints in order — letter overlap @ attempt 800, weekend gates @ 1100, centre repeat @ 1300, common-pangram @ 1500. Max 2500 attempts before throw. `hasBloom` and the hard letter rules are never relaxed. Each drop logs `[bloombert] dropping ... at attempt N, seed S` to console.

## When editing

- Don't convert to ES modules — the app loads via `<script>` tags with no bundler.
- Keep `words.js` generated — edit `scripts/prepare-words.js` instead.
- If adding a new JS file, add the `<script>` tag in `index.html` in the correct dependency order.
- Test by opening `index.html` directly in a browser (or `npx serve .`).
- After editing `src/js/puzzle.js`, run `node scripts/verify-puzzles.js` — it exercises 90 days of generation and asserts every quality gate.
- The site is deployed to GitHub Pages from `main` branch root — no build step needed.
