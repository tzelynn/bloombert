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
| `index.html` | Entry point. Loads scripts in dependency order. Contains three top-level screens: `#screen-home`, `#screen-game`, `#screen-yesterday`. |
| `src/data/words.js` | `WORD_LIST` (~150k valid words) and `COMMON_WORDS` (~14k common words). Generated, not hand-edited. |
| `src/js/prng.js` | `createRNG(seed)` — Mulberry32 seeded PRNG. |
| `src/js/scoring.js` | `scoreWord`, `isBloom`, `computeRankThresholds`, `getRank`, `formatShareText`. `formatShareText` takes `(date, rank, foundCount, totalCount, score, bloomCount, bonusCount, puzzleCode, mode)`; when `mode === 'timed'` the header line uses ⏱️ and "Timed Bloombert" instead of 🌷 "Daily Bloombert". |
| `src/js/puzzle.js` | `generatePuzzle(seed)`, `generateTimedPuzzle(seed)`, `generatePuzzleLettersOnly(seed)` (lookback fast-path), `getAllValidWords`, `isValidGuess`, plus seed/date helpers (`getTodaysSeed`, `getTodaysTimedSeed`, `getTodaysDateKey`, `seedToDateStr`, `isWeekendSeed`, `getPrevDaySeeds`), letter helpers (`countVowels`, `countRareConsonants`, `hasERTogether`), and quality-gate functions (`passesHardLetterRules`, `hasCommonPangram`, `passesLookback`). Depends on `WORD_LIST`, `COMMON_WORDS`, `createRNG`, `scoreWord`, `isBloom`. |
| `src/js/state.js` | `loadState`/`saveState` (daily + custom), `loadTimedState`/`saveTimedState` (timed mode, separate namespace), `loadStats`, `saveStats`, `checkAndUpdateStreak`, `checkAndUpdateTimedStreak`, `getDailyWordCounts`, `getTimedWordCounts` (both return `[{ date, words, score }]` for the last N days). Uses `localStorage`. |
| `src/js/app.js` | UI controller — DOM manipulation, event binding, modals, share flow, screen router, timed-mode timer. IIFE, depends on all above. |
| `src/css/style.css` | All styles — responsive, animations, botanical theme. |
| `scripts/prepare-words.js` | Node script to download and filter the ENABLE word list. Output path is hardcoded to `words.js` in CWD — run from project root or update the path. |
| `scripts/verify-puzzles.js` | Node test harness. Loads `words.js`, `prng.js`, `scoring.js`, `puzzle.js` into a `vm` context with a stub `localStorage`, then drives `generatePuzzle(seed)` over a 90-day window and asserts every quality gate. Run after editing `src/js/puzzle.js`. |

**Script load order matters:** `words.js` → `prng.js` → `scoring.js` → `puzzle.js` → `state.js` → `app.js`.

## Screens and routing

The app has three screens that the router toggles via the `hidden` attribute. Routing is URL-driven and integrates with browser back/forward through `pushState`/`popstate`.

| URL | Screen | Mode |
|-----|--------|------|
| `/` | `#screen-home` | (landing) |
| `/?mode=daily` | `#screen-game` | daily |
| `/?mode=timed` | `#screen-game` | timed |
| `/?mode=yesterday` | `#screen-yesterday` | — |
| `/?p=CODE` | `#screen-game` | custom |

Key router functions in `app.js`: `routeFromURL()` (initial load + entry point), `showScreen(name, opts)` (toggles screens, updates history, closes any open modal), `applyShowScreenFromPop(name)` (popstate-only equivalent that doesn't touch history). Per-mode init functions are split: `initHome`, `initDailyPuzzle`, `initTimedPuzzle`, `initCustomPuzzle`, `initYesterdayView`. Persistent listeners are attached once at startup; per-mode inits only refresh data.

Caveat: `showScreen()` closes any currently open modal as part of screen-switch cleanup. If a flow needs to open a modal during init (e.g. `modal-timed-end` for an already-expired timed puzzle), set `pendingTimedEndModal = true` inside `initTimedPuzzle`, then have the caller open the modal *after* `showScreen('game', ...)` returns. Symmetric: set in one place, consumed (and reset) in each routing branch (`routeFromURL`, `attachHomeHandlers`, `popstate`).

## Key conventions

- All game JS lives in IIFEs or bare functions on `window`. No ES modules.
- Puzzle generation is deterministic: seeded with `parseInt("YYYYMMDD")`. Same date = same puzzle everywhere. Timed mode uses `getTodaysSeed() + 100000000` (offset chosen to avoid collision with any plausible `YYYYMMDD` through year 9999).
- Daily/custom game state is keyed per day in `localStorage` (`bloombert-state-YYYY-MM-DD`).
- Timed game state lives in a separate namespace (`bloombert-timed-state-YYYY-MM-DD`). Shape: `{ foundWords (plain array), score, startTimestamp, completed, finalScore }`. Caller wraps `foundWords` in a `Set` if it needs Set semantics.
- Stats are stored in `localStorage` under `bloombert-stats`. Daily and timed modes track stats in **separate fields** on the same object: daily uses `gamesPlayed`/`totalWords`/`currentStreak`/`bestStreak`/`lastPlayedDate`; timed uses `timedGamesPlayed`/`timedMaxWords` (best single-puzzle word count, not total)/`timedCurrentStreak`/`timedBestStreak`/`timedLastPlayedDate`. Custom mode does **not** update stats. One-time backfill flags: `wordCountFixed`, `playedCountFixed`, `timedStatsFixed`.
- The 3-day lookback fast-path caches each day's letter set in `localStorage` (`bloombert-letters-YYYY-MM-DD`). Safe to clear; will be regenerated deterministically.
- Per-day `commonScore` is cached in `localStorage` (`bloombert-commonscore-YYYY-MM-DD` for daily, `bloombert-timed-commonscore-YYYY-MM-DD` for timed) so the stats modal's garden graph can compute each day's rank emoji without regenerating puzzles. Populated proactively in `initDailyPuzzle`/`initTimedPuzzle`; on cache miss `getCommonScoreFor()` regenerates the puzzle. Safe to clear.
- Custom events dispatched on `document`: `Bloombert:success`, `Bloombert:error`, `Bloombert:bloom`, `Bloombert:rankup`.
- Share flow: header share button and stats modal "Share Results" both close stats modal → open share modal with formatted text preview → user clicks "Copy to Clipboard" → inline button feedback ("✅ Copied!"). Uses Clipboard API with `execCommand('copy')` fallback. The timed-end modal also has a "Share Results" button that follows the same flow with `mode='timed'` passed to `formatShareText`.

## Timed mode

3-minute time-attack variant. Constants in `app.js`: `TIMED_DURATION_MS=180000`, `TIMER_WARNING_MS=30000` (last 30s switches `#timer-display` to `.timer-warning`), `TIMER_TICK_MS=250`.

- Timer is timestamp-based: `state.startTimestamp` is captured on first input via `startTimer()`. `tick()` recomputes remaining from `Date.now()`, so leaving and returning to the screen (or reloading) resumes correctly. `initTimedPuzzle` checks elapsed on load — if already expired, the puzzle loads in completed/locked state.
- On expiry: stop interval, set `timedCompleted = true`, persist, lock input (`btn-enter`/`btn-delete`/`btn-shuffle` disabled), launch confetti using the player's rank emoji, open `modal-timed-end`.
- Quality gates are looser than daily (see "Puzzle quality gates" below) so a playable puzzle is found in <1000 attempts.
- Hints button (`#btn-hints-inline`) is hidden in timed mode.

## Modals

- `modal-stats` — player stats and "Share Results" button. Mode-aware: in daily/custom mode the title is "Your Garden 🌷" and shows daily fields with the "Words Found" label (total words across all daily plays); in timed mode the title is "Your Timed Garden ⏱️" and shows timed fields with the "Best Words" label (max words found in a single timed puzzle). The garden-graph bar emoji shows each day's achieved rank, computed from the saved score against that day's puzzle commonScore (mode-matched).
- `modal-share` — share text preview with copy button. Opened via header 📤 button or "Share Results" in stats modal or "Share Results" in `modal-timed-end`.
- `modal-timed-end` — final score / common-words found / rank for an expired timed puzzle. Buttons: "Share Results" (opens `modal-share`), "Back to Home" (returns to `/`).
- `modal-create-puzzle` — opened from the home "Create Your Own" card (no longer from a header `+` button).
- Modals use `hidden` attribute, managed by `openModal()`/`closeModal()`. Each `openModal` call pushes a history entry; `popstate` closes the topmost open modal before falling through to routing logic.

## Scoring rules

- Every word scores 1 point per letter (e.g. 4 letters = 4 pts).
- Bloom (uses all 7 letters) = word score + 7 bonus.
- Words are split into **common** (from a 20k frequency list) and **bonus** (obscure but valid). Rank thresholds are based on common words' total score only, so Garden Master is reachable without knowing obscure words.
- `COMMON_WORDS` set is generated alongside `WORD_LIST` by `prepare-words.js`.

## Puzzle quality gates

`generatePuzzle(seed)` (daily) enforces, in order:

- **Hard letter rules** (`passesHardLetterRules`): 2–3 vowels, no E+R together, ≤1 of {J,Q,X,Z}, S/X/Z/Q never as centre, J/V/W/Y centre rejected 95% of the time.
- **3-day lookback** (`passesLookback`): centre-letter match and ≥6-letter overlap blocked vs the previous 3 days. Neighbour letter sets come from `generatePuzzleLettersOnly`, cached per seed in `localStorage` (`bloombert-letters-YYYY-MM-DD`).
- **Size**: weekday ≥15 common words, ≥40 common score; weekend (Sat/Sun) ≥35 common, ≥100 score, ≥45 total.
- **Pangram**: at least one Bloom word must be in `COMMON_WORDS` (`hasCommonPangram`).
- **Bloom**: at least one valid pangram exists.

If candidates fail repeatedly, a graded fallback ladder drops constraints in order — letter overlap @ attempt 800, weekend gates @ 1100, centre repeat @ 1300, common-pangram @ 1500. Max 2500 attempts before throw. `hasBloom` and the hard letter rules are never relaxed. Each drop logs `[bloombert] dropping ... at attempt N, seed S` to console.

`generateTimedPuzzle(seed)` enforces only the hard letter rules + `hasBloom` (no lookback, no size gates, no common-pangram). Returns the same shape as `generatePuzzle` plus `mode: 'timed'`. Difficulty is derived from common-word count/score using the same heuristic as daily. Max 1000 attempts before throw.

## When editing

- Don't convert to ES modules — the app loads via `<script>` tags with no bundler.
- Keep `words.js` generated — edit `scripts/prepare-words.js` instead.
- If adding a new JS file, add the `<script>` tag in `index.html` in the correct dependency order.
- Test by opening `index.html` directly in a browser (or `npx serve .`).
- After editing `src/js/puzzle.js`, run `node scripts/verify-puzzles.js` — it exercises 90 days of generation and asserts every quality gate.
- The site is deployed to GitHub Pages from `main` branch root — no build step needed.
