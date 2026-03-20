 Bloombert Implementation Plan

 Context

 Building Bloombert, a daily word puzzle game (Spelling Bee variant) for GitHub Pages. 7 letters in a honeycomb; players
 form words containing the centre letter. Static site: pure HTML + CSS + vanilla JS, no frameworks or build tools. The
 project directory is empty — greenfield build.

 ---
 Execution Phases

 Phase 1: Word List Acquisition

 prepare-words.js — Node CLI script (not deployed)
 - Download ENABLE word list from https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt
 - Filter: 4-12 letters, alpha-only, lowercase, deduplicated, sorted
 - Output words.js: const WORD_LIST = new Set([...]); (~85-95k words, ~1.5MB)

 Phase 2: Core Engine JS (4 files)

 prng.js
 - mulberry32(seed) — 32-bit PRNG returning floats in [0,1)
 - createRNG(seed) factory returning { next() }
 - Seed format: parseInt("YYYYMMDD")

 scoring.js (must load BEFORE puzzle.js — spec's load order needs adjustment)
 - scoreWord(word, letters) — 4-letter=1pt, 5-letter=5pt, N>=6=Npt, Bloom=+7 bonus
 - isBloom(word, letters) — checks word uses all 7 unique letters
 - computeRankThresholds(totalScore) — 8 tiers at 0/5/12/25/40/60/80/100% using Math.ceil
 - getRank(currentScore, thresholds) — returns { name, emoji, next, nextEmoji, progressPct }
 - formatShareText(date, rank, foundCount, totalCount, score)

 puzzle.js (depends on words.js, prng.js, scoring.js)
 - getTodaysSeed() — parseInt of local date YYYYMMDD
 - generatePuzzle(seed):
   a. Create RNG from seed
   b. Weighted letter pool: vowels 3x, common consonants 2x, rare 1x; Q/X/Z excluded entirely
   c. Pick 7 unique letters; letters[0] = key letter
   d. Enumerate valid words via getAllValidWords() — iterate WORD_LIST, check word contains key letter and only uses the 7
 letters
   e. Compute total score, check for Bloom words
   f. Validity gates: >=20 words, >=1 Bloom, score >=50
   g. On failure: retry with seed+1 (iterative loop, cap 1000)
   h. Difficulty: Easy (>50 words or score>150), Hard (<30 words or score<80), else Medium
 - isValidGuess(word, letters, keyLetter, foundWords) — returns { valid, reason? }
   - Check order: too_short -> missing_key -> invalid_chars -> not_a_word -> already_found
 - getAllValidWords(letters, keyLetter)

 state.js
 - loadState(dateKey) / saveState(dateKey, state) — localStorage key: bloombert-state-YYYYMMDD
 - loadStats() / saveStats(stats) — localStorage key: bloombert-stats
 - checkAndUpdateStreak(stats, todayKey) — uses Date objects for day diff (not integer subtraction, which breaks across
 months)
 - All localStorage calls wrapped in try/catch

 Phase 3a + 3b: Parallel — app.js AND index.html + style.css

 index.html (Phase 3b)
 - Google Fonts: Fraunces (600) + DM Sans (400, 500)
 - DOM structure with exact IDs/classes per spec (20+ IDs: hex-grid, input-display, input-text, btn-delete, btn-shuffle,
 btn-enter, found-words-list, etc.)
 - 7 hex tile buttons with data-index and data-key attributes
 - 3 modals: How to Play, Stats, Bloom Celebration
 - Background SVG petals (4-5 botanical shapes, muted, fixed position)
 - Script load order: words.js, prng.js, scoring.js, puzzle.js, state.js, app.js

 style.css (Phase 3b)
 - CSS custom properties for colour palette (blue-light, blue-mid, cream, mint, coral, gold)
 - Hex grid: flexbox 3-row layout with clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)
 - Hex tile sizes: 80px mobile, 96px desktop (>=640px)
 - Key tile: blue-mid background; outer tiles: white with blue-light border
 - 8 animation classes: .shake, .pop-in, .flash-success, .score-float, .rankup-shimmer, .toast--visible, .bloom-burst,
 progress bar transition
 - Found words: horizontal scroll, pills with border-radius 999px, Bloom pills gold
 - Modals: backdrop blur, white card, scale+fade entry animation
 - Typography: Fraunces for logo/rank/score/input/hex; DM Sans for everything else
 - prefers-reduced-motion media query disables non-essential animations
 - Focus-visible rings on all interactives

 app.js (Phase 3a continued — depends on all logic files + DOM structure)
 - Init: generatePuzzle, loadState, loadStats, checkAndUpdateStreak, renderAll
 - Input: keydown listener (a-z appends, Backspace deletes, Enter submits) + hex tile click delegation
 - submitGuess(): validate -> score -> update state -> save -> render -> dispatch CustomEvent
 - Shuffle: Fisher-Yates on outer 6 letters only (Math.random, not PRNG)
 - Day rollover: visibilitychange listener, reload if date changed
 - Render functions: renderHexGrid, renderFoundWords, renderRankBar, renderInput
 - CustomEvent system: Bloombert:success, Bloombert:error, Bloombert:bloom, Bloombert:rankup
 - Animation wiring: listen for custom events, toggle CSS classes, remove on animationend
 - Toast: show message, add .toast--visible, setTimeout remove after 2s
 - Modal: generic open/close via hidden attribute, close on backdrop/X click
 - Share: navigator.clipboard.writeText with textarea fallback

 Phase 4: Integration Review

 1. Cross-reference every document.getElementById in app.js against index.html IDs
 2. Cross-reference every CSS class toggled in app.js against style.css
 3. Verify script load order matches dependency chain
 4. Fix any mismatches

 Phase 5: QA Audit

 Key bug-prone areas:
 - Puzzle generation: retry loop terminates, no infinite recursion
 - Bloom scoring: +7 bonus ON TOP of length score (not replacing)
 - Streak calculation: must use Date objects, not YYYYMMDD integer subtraction
 - Case sensitivity: all comparisons lowercase
 - Empty input submit: must be no-op
 - localStorage: try/catch for quota exceeded
 - Hex clip-path: ensure clickable area >= 44px

 Phase 6: README + Deployment

 - README.md: description, live demo link, setup (clone + node prepare-words.js), GitHub Pages deployment, ENABLE word list
  attribution, file tree, algorithm overview, MIT license

 ---
 Critical Design Decision: Script Load Order

 The spec says: words.js, prng.js, puzzle.js, scoring.js, state.js, app.js

 Problem: puzzle.js calls scoreWord() from scoring.js during generatePuzzle() to compute totalScore. So scoring.js must
 load before puzzle.js.

 Fix: Load order becomes: words.js, prng.js, scoring.js, puzzle.js, state.js, app.js

 ---
 File Dependency Graph

 words.js (standalone)
 prng.js (standalone)
 scoring.js (standalone)
 puzzle.js (depends on: words.js, prng.js, scoring.js)
 state.js (standalone)
 app.js (depends on ALL above + DOM from index.html)
 style.css (standalone)
 index.html (loads fonts + all scripts)

 ---
 Verification Plan

 1. Word list: Run node prepare-words.js, verify words.js has 85-95k words
 2. PRNG determinism: Same seed produces same sequence across calls
 3. Puzzle validity: generatePuzzle returns >=20 words, >=1 Bloom, score >=50 for today's date
 4. Scoring accuracy: 4-letter=1, 5-letter=5, 6-letter=6, 7-letter Bloom=14 (7+7)
 5. State persistence: Found words survive page refresh (same day)
 6. Visual: Open index.html in browser, verify hex grid renders, animations work, mobile layout fits 375px
 7. Input flow: Type letters via keyboard + hex clicks, submit valid/invalid words, verify toast messages
 8. Day rollover: Change system date, verify puzzle changes on tab focus