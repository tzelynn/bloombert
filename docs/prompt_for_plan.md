# Bloombert — Claude Code Multi-Agent Build Prompt

> **Instructions for Claude Code**: You are the **Orchestrator** of a software development team building *Bloombert*, a daily word puzzle game for GitHub Pages. Your job is to coordinate three specialist subagents — a Core Engine Developer, a QA Tester, and a Graphic Designer — using the **Supervisor/Orchestrator multi-agent pattern**. You will spawn each subagent with a focused context and a scoped set of responsibilities. Subagents pass completed artifacts back to you; you validate handoffs before moving to the next phase. Do not begin coding until the Implementation Plan phase is complete and confirmed.

---

## Project Overview

**Bloombert** (`🌸`) is a browser-based daily word puzzle. Seven letters are arranged in a honeycomb — one centre (key) letter surrounded by six outer letters. Players form words that must include the centre letter; letters can be reused freely. Score depends on word length; a special **Bloom** bonus applies to words using all seven letters. Rank thresholds are dynamically computed as percentages of the puzzle's total possible score so difficulty auto-adjusts the achievement curve.

**Hosting**: GitHub Pages (static, zero backend, zero build tool)  
**Stack**: Pure HTML + CSS + Vanilla JS — no frameworks, no bundler  
**Word list**: Bundled as a static JS asset (see §Word List Acquisition below)

---

## Step 0 — Word List Acquisition (Do This First)

Before any code is written, the Orchestrator must obtain and prepare the legal word list. Follow these steps exactly:

### Fetching the ENABLE Word List

The **ENABLE (Enhanced North American Benchmark Lexicon)** word list is public domain and safe to redistribute.

```bash
# Download the ENABLE word list
curl -L https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt -o enable1.txt

# Verify download
wc -l enable1.txt   # Should be ~172,000 lines
```

### Filtering and Bundling as words.js

Run the following Node.js script to filter and emit `words.js`:

```js
// prepare-words.js  — run with: node prepare-words.js
const fs = require("fs");

const raw = fs.readFileSync("enable1.txt", "utf8");
const words = raw
  .split("\n")
  .map(w => w.trim().toLowerCase())
  .filter(w =>
    w.length >= 4 &&        // minimum word length for the game
    w.length <= 12 &&       // cap length to keep puzzle tractable
    /^[a-z]+$/.test(w)      // alpha only, no hyphens or apostrophes
  );

// Deduplicate and sort for deterministic output
const unique = [...new Set(words)].sort();

const output = `// words.js — ENABLE word list, filtered 4–12 letters, public domain
// Source: https://github.com/dolph/dictionary (ENABLE1 list)
// Words: ${unique.length.toLocaleString()}
const WORD_LIST = new Set(${JSON.stringify(unique)});
`;

fs.writeFileSync("words.js", output);
console.log(`Done. ${unique.length.toLocaleString()} words written to words.js`);
```

```bash
node prepare-words.js
# Expected output: ~85,000–95,000 words written to words.js
```

`words.js` should be committed to the repo root. The Set structure gives O(1) lookup at runtime.

### Legal Notes to Include in README

Add the following to the project `README.md` under a **Word List** section:

> The word list used in Bloombert is derived from the **ENABLE (Enhanced North American Benchmark Lexicon)** word list, which is in the public domain. Original source: https://github.com/dolph/dictionary. No modifications to the word definitions have been made; only length filtering has been applied.

---

## Multi-Agent Team Structure

The Orchestrator (you) coordinates three subagents. Each subagent is spawned with a **clean, scoped context** — they receive only the information they need. The Orchestrator validates outputs at each handoff gate before proceeding.

```
┌─────────────────────────────────────────┐
│           ORCHESTRATOR                  │
│  (you — coordinates phases & handoffs)  │
└──────┬──────────────┬───────────────────┘
       │              │               │
       ▼              ▼               ▼
 ┌──────────┐  ┌──────────────┐  ┌──────────────┐
 │  CORE    │  │  QA TESTER   │  │   GRAPHIC    │
 │  ENGINE  │  │              │  │  DESIGNER    │
 │  DEV     │  │              │  │              │
 └──────────┘  └──────────────┘  └──────────────┘
  Phase 2–3       Phase 4          Phase 3 (parallel)
```

**Parallelism note**: Core Engine Dev (Phase 3a) and Graphic Designer (Phase 3b) run in parallel — their work is independent (logic vs visuals). QA Tester runs in Phase 4 once both are integrated.

---

## Phase 1 — Orchestrator: Implementation Plan

**The Orchestrator must produce this plan before delegating any work.**

Write a detailed plan covering:

1. **Word list integration** — how `words.js` is loaded and used (single `<script>` tag, Set for O(1) lookup, no lazy loading needed given static hosting)
2. **PRNG strategy** — use `mulberry32` seeded with `parseInt("YYYYMMDD")` from the current local date. Document how the seed produces a letter set.
3. **Puzzle generation algorithm**:
   - Letter frequency weighting (prefer common letters; avoid Q, X, Z as centre letters)
   - Validity checks: ≥20 valid words including key letter, ≥1 Bloom word, total score ≥50 pts
   - Retry loop: increment seed by 1 until a valid puzzle is found
4. **Scoring rules** (codify exactly):
   - 4-letter word = 1 pt
   - 5-letter word = 5 pts
   - N-letter word (N ≥ 6) = N pts
   - Bloom word (uses all 7 unique letters at least once) = word length + 7 bonus pts
5. **Rank system** (8 tiers, % of total possible score):
   - 🌱 Seedling 0% · 🌿 Sprout 5% · 🌼 Bud 12% · 🌸 Bloom 25% · 🌺 Petal 40% · 🌻 Sunflower 60% · 💐 Bouquet 80% · 🌟 Garden Master 100%
6. **State management** — what lives in memory vs `localStorage` (found words keyed by `YYYYMMDD`, stats, streak); day rollover detection
7. **File structure** (detailed, see §File Structure below)
8. **Component map** — list every UI component, its DOM structure, and its JS responsibilities
9. **Animation inventory** — list every animation, whether it's CSS or JS, and its trigger
10. **GitHub Pages deployment checklist**

---

## Phase 2 — Core Engine Developer Subagent

**Spawn this subagent with the following context and instructions.**

---

### Core Engine Developer — System Prompt

You are the **Core Engine Developer** on the Bloombert project. Your sole responsibility is game logic — no CSS, no visual styling, no DOM layout. You will produce four JavaScript files with clean, well-commented code. Another subagent handles all visual and layout work separately.

#### Deliverables

Produce these files in order:

**`prng.js`**
- Implement `mulberry32(seed)` — a fast, seedable 32-bit PRNG returning floats in [0, 1)
- Export a `createRNG(seed)` factory that returns a stateful `next()` function
- Document the seed format: `parseInt("YYYYMMDD")` from local date string

**`puzzle.js`**
- Import `WORD_LIST` from `words.js` (assume it is a global `Set`)
- Implement `getTodaysSeed()` → integer from today's local date `YYYYMMDD`
- Implement `generatePuzzle(seed)` → `{ letters: string[7], keyLetter: string, validWords: string[], totalScore: number, hasBloom: boolean, difficulty: "Easy"|"Medium"|"Hard" }`
  - Letter selection: use a weighted pool (vowels: A E I O U at 3× weight; common consonants B C D F G H L M N P R S T at 2× weight; rarer letters at 1×). Never select the same letter twice. Avoid Q X Z as key letter.
  - Key letter is always `letters[0]`; `letters[1..6]` are the outer ring
  - Validity gates: ≥20 valid words, ≥1 Bloom word, total score ≥50
  - Retry loop: if invalid, call `generatePuzzle(seed + 1)` recursively (cap at 1000 retries)
  - Difficulty: Easy (>50 words, score >150), Medium (30–50 words, score 80–150), Hard (<30 words or score <80)
- Implement `isValidGuess(word, letters, keyLetter)` → `{ valid: boolean, reason?: string }`
  - Reasons: `"too_short"`, `"missing_key"`, `"invalid_chars"`, `"not_a_word"`, `"already_found"`
  - Pass `foundWords: Set<string>` as third argument
- Implement `getAllValidWords(letters, keyLetter)` → `string[]` (enumerate at puzzle load time)

**`scoring.js`**
- Implement `scoreWord(word, letters)` → `number`
  - 4-letter → 1; 5-letter → 5; N≥6 → N; Bloom → add 7 bonus
  - `isBloom(word, letters)` → `boolean` (word uses all 7 unique letters at least once)
- Implement `computeRankThresholds(totalScore)` → object mapping rank names to minimum score integers
  - Ranks: Seedling 0%, Sprout 5%, Bud 12%, Bloom 25%, Petal 40%, Sunflower 60%, Bouquet 80%, GardenMaster 100%
- Implement `getRank(currentScore, thresholds)` → `{ name: string, emoji: string, next: string, nextEmoji: string, progressPct: number }`
- Implement `formatShareText(date, rank, foundCount, totalCount, score)` → emoji share string

**`state.js`**
- Implement `loadState(dateKey)` → game state from `localStorage` or fresh default
- Implement `saveState(dateKey, state)` → persists to `localStorage`
- Implement `loadStats()` / `saveStats(stats)` for streak and all-time data
- State schema:
  ```js
  {
    date: "YYYYMMDD",
    foundWords: string[],
    currentInput: string,
    score: number,
    rank: string,
    hintsUsed: number
  }
  ```
- Stats schema:
  ```js
  {
    gamesPlayed: number,
    currentStreak: number,
    bestStreak: number,
    totalWords: number,
    lastPlayedDate: "YYYYMMDD"
  }
  ```
- Implement `checkAndUpdateStreak(stats, todayKey)` → updated stats (streak resets if >1 day gap)

#### Code Standards
- Pure ES2020, no external dependencies
- Use `const`/`let` only, no `var`
- All functions are exported as named exports at the bottom of each file using `// Exports` comment block for easy global script tag usage (no ES module syntax — these run as classic `<script>` tags)
- Comprehensive inline comments explaining non-obvious logic
- No DOM manipulation whatsoever

---

## Phase 3 — Parallel Execution

Phases 3a and 3b run simultaneously. The Orchestrator integrates their outputs in Phase 3c.

---

## Phase 3a — Core Engine Developer (continued): app.js

After `prng.js`, `puzzle.js`, `scoring.js`, and `state.js` are complete, the Core Engine Developer produces `app.js`.

**`app.js`** — Main application controller. Bridges game logic and DOM.

Responsibilities:
- On load: call `generatePuzzle(getTodaysSeed())`, restore state from `localStorage`, compute rank thresholds
- Input handling:
  - Physical keyboard: listen for `keydown` — letters append to input, Backspace deletes, Enter submits
  - Hex tile clicks: dispatch same events as keyboard
  - Shuffle button: Fisher-Yates shuffle of `letters[1..6]` only (key letter stays fixed); re-render hex grid
  - Delete button: remove last character from input
  - Enter button: call `submitGuess()`
- `submitGuess()`:
  - Validate via `isValidGuess()`
  - On success: update state, re-render found words, update score and rank, trigger success animation event
  - On failure: trigger shake animation event with reason
  - On Bloom word: trigger bloom celebration event
- Day rollover: check on focus/visibility change; if date has changed, reload puzzle
- Render functions (DOM-only, no styling logic):
  - `renderHexGrid(letters, keyLetter)` — updates hex tile text content
  - `renderFoundWords(foundWords)` — rebuilds found words pill list
  - `renderRankBar(rank, progressPct, thresholds)` — updates rank badge and progress bar fill
  - `renderInput(inputStr)` — updates input display
- Event system: use `CustomEvent` on `document` for animation triggers (`Bloombert:success`, `Bloombert:error`, `Bloombert:bloom`, `Bloombert:rankup`)
- Modal open/close handlers for How to Play, Stats, Yesterday's Answers

---

## Phase 3b — Graphic Designer Subagent

**Spawn this subagent with the following context and instructions.**

---

### Graphic Designer — System Prompt

You are the **Graphic Designer** on the Bloombert project. Your responsibility is all visual output: `style.css`, `index.html` structure, and any inline SVG decorations. You will receive the game's functional specification but you do not write any game logic. JavaScript event names and DOM IDs/classes you must target are provided below — do not change them.

#### Design Brief

**Game name**: Bloombert 🌸  
**Aesthetic**: Organic botanical meets field-notes journal. Bright, airy, fresh. Think pressed flowers, watercolour washes, and nature sketchbook textures — not clinical, not tech-y.  
**Mood**: Calm, delightful, slightly whimsical. The kind of thing you'd play with a coffee in the morning.

**Colour palette** (use as CSS custom properties):
```css
:root {
  --blue-light:    #D6E9F8;   /* tile backgrounds, subtle fills */
  --blue-mid:      #A8C8E8;   /* primary accent, key letter hex */
  --blue-sat:      #5BA3D4;   /* hover states, active elements */
  --cream:         #FDFAF5;   /* page background */
  --cream-dark:    #F0EBE1;   /* card backgrounds */
  --warm-grey:     #6B6560;   /* body text */
  --charcoal:      #2C2825;   /* headings */
  --mint:          #8EC9A2;   /* success states, valid word flash */
  --coral:         #E8857A;   /* error states */
  --gold:          #D4A84B;   /* Bloom word celebration */
  --shadow:        rgba(44,40,37,0.10);
}
```

**Typography** (load from Google Fonts):
- `Fraunces` — display, serif, for the logo, rank name, large score display. Use weight 600.
- `DM Sans` — clean geometric sans, for all body text, labels, button text. Use weights 400 and 500.

**No dark mode.** The entire experience is light.

#### DOM Structure to Produce (index.html)

Produce a complete `index.html`. All JS files are loaded as classic scripts at the bottom of `<body>` in this order: `words.js`, `prng.js`, `puzzle.js`, `scoring.js`, `state.js`, `app.js`.

Required structure with exact IDs/classes (do not change these — they are referenced by `app.js`):

```
<body>
  <!-- Background decoration layer -->
  <div class="bg-petals" aria-hidden="true">
    <!-- 3–5 subtle SVG petal/leaf shapes, absolutely positioned -->
  </div>

  <!-- Main game container -->
  <div class="game-container">

    <!-- Header -->
    <header class="game-header">
      <div class="logo">Bloombert <span class="logo-flower">🌸</span></div>
      <div class="header-meta">
        <span id="streak-display" class="streak"><!-- e.g. 🔥 5 --></span>
        <button id="btn-stats" class="icon-btn" aria-label="Stats">📊</button>
        <button id="btn-how-to-play" class="icon-btn" aria-label="How to play">❓</button>
      </div>
    </header>

    <!-- Rank + progress -->
    <section class="rank-section">
      <div class="rank-badge">
        <span id="rank-emoji" class="rank-emoji">🌱</span>
        <span id="rank-name" class="rank-name">Seedling</span>
      </div>
      <div class="progress-bar-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div id="progress-bar-fill" class="progress-bar-fill"></div>
        <span id="progress-label" class="progress-label">0 pts</span>
      </div>
      <div class="puzzle-meta">
        <span id="difficulty-badge" class="difficulty-badge"><!-- Easy / Medium / Hard --></span>
        <span id="date-display" class="date-display"><!-- Today's date --></span>
      </div>
    </section>

    <!-- Found words -->
    <section class="found-section">
      <div id="found-words-list" class="found-words-list" role="list">
        <!-- Word pills injected here by app.js -->
      </div>
      <div class="found-count-row">
        <span id="found-count" class="found-count">0 words</span>
        <span id="score-display" class="score-display">0 pts</span>
      </div>
    </section>

    <!-- Current input display -->
    <div id="input-display" class="input-display" aria-live="polite">
      <span id="input-text" class="input-text"></span>
      <span class="input-caret" aria-hidden="true"></span>
    </div>

    <!-- Honeycomb grid -->
    <section class="hex-grid-section">
      <div id="hex-grid" class="hex-grid" role="group" aria-label="Letter tiles">
        <!-- 7 hex tiles injected by app.js / or pre-rendered with data-index -->
        <!-- Tile structure:
          <button class="hex-tile" data-letter="A" data-key="true" aria-label="A (key letter)">
            <span class="hex-letter">A</span>
          </button>
        -->
      </div>
    </section>

    <!-- Action buttons -->
    <div class="action-buttons">
      <button id="btn-delete" class="action-btn action-btn--secondary" aria-label="Delete last letter">
        ← Delete
      </button>
      <button id="btn-shuffle" class="action-btn action-btn--ghost" aria-label="Shuffle letters">
        ⟳ Shuffle
      </button>
      <button id="btn-enter" class="action-btn action-btn--primary" aria-label="Submit word">
        Enter
      </button>
    </div>

    <!-- Toast notification -->
    <div id="toast" class="toast" role="alert" aria-live="assertive"></div>

  </div><!-- /.game-container -->

  <!-- Modals -->
  <div id="modal-how-to-play" class="modal" role="dialog" aria-modal="true" aria-labelledby="htp-title" hidden>
    <div class="modal-backdrop"></div>
    <div class="modal-card">
      <button class="modal-close" data-modal="modal-how-to-play" aria-label="Close">✕</button>
      <h2 id="htp-title">How to Play</h2>
      <!-- Rules content here -->
    </div>
  </div>

  <div id="modal-stats" class="modal" role="dialog" aria-modal="true" aria-labelledby="stats-title" hidden>
    <div class="modal-backdrop"></div>
    <div class="modal-card">
      <button class="modal-close" data-modal="modal-stats" aria-label="Close">✕</button>
      <h2 id="stats-title">Your Garden</h2>
      <div id="stats-content"></div>
    </div>
  </div>

  <div id="modal-bloom-celebration" class="modal modal--bloom" role="dialog" aria-modal="true" hidden>
    <div class="modal-backdrop"></div>
    <div class="modal-card modal-card--bloom">
      <div class="bloom-burst" aria-hidden="true"></div>
      <h2>🌟 Bloom Word!</h2>
      <p id="bloom-word-display"></p>
      <button class="action-btn action-btn--primary" data-modal="modal-bloom-celebration">Keep Going!</button>
    </div>
  </div>

</body>
```

#### style.css Requirements

Produce a complete `style.css`. Requirements:

**Layout**
- Mobile-first. Base styles target 375px+ screens.
- `game-container`: max-width 480px, centred with `margin: 0 auto`, padding `0 16px 32px`
- No horizontal scroll on any viewport width
- Comfortable tap targets: all interactive elements ≥ 44×44px

**Honeycomb hex grid**
- Use CSS `clip-path: polygon(...)` for hex shapes (flat-top hexagons)
- 7 tiles in honeycomb arrangement:
  - Row 1 (top): tiles 1, 2 (outer)
  - Row 2 (middle): tiles 3, key, 4 (outer left, centre, outer right)
  - Row 3 (bottom): tiles 5, 6 (outer)
  - Or use a proper offset grid — your choice, but it must look like a honeycomb
- Key letter tile: background `var(--blue-mid)`, text `var(--charcoal)`, font-weight 700
- Outer tiles: background white, border `2px solid var(--blue-light)`, text `var(--charcoal)`
- Hover state (desktop): tile lifts with `transform: translateY(-2px)`, shadow intensifies
- Active/tap state: `transform: scale(0.92)`, brief colour flash to `var(--blue-light)`
- Hex tile size: 80px × 80px on mobile, 96px × 96px on desktop (≥ 640px)

**Animations** — implement all of the following as CSS classes toggled by `app.js`:

| Class added to | Class name | Effect |
|---|---|---|
| `#input-display` | `.shake` | Fast horizontal shake (keyframes), 400ms, removed after |
| Word pill on add | `.pop-in` | Scale from 0.6→1 + fade in, 200ms cubic-bezier |
| `#progress-bar-fill` | Transition | `width` transition 600ms ease-out |
| `.hex-tile` | `.flash-success` | Background pulses to `var(--mint)` then returns, 300ms |
| Score `+N` floater | `.score-float` | Floats up 40px and fades out, 800ms, position absolute |
| Rank badge | `.rankup-shimmer` | Shimmer highlight sweeps across, 500ms |
| `#modal-bloom-celebration` | shown | `.bloom-burst` radiates outward SVG petal burst using CSS animation |
| `.toast` | `.toast--visible` | Slides up from bottom, auto-dismisses after 2s |

**Found words list**
- Horizontal scroll container (`overflow-x: auto`, hide scrollbar with `-webkit-scrollbar: none`)
- Each pill: `background: var(--blue-light)`, `border-radius: 999px`, padding `4px 12px`, `font-size: 13px`
- Bloom word pills get a special `background: var(--gold)` with white text and ✨ prefix
- Newest word animates in from the left

**Progress bar**
- Track: `var(--cream-dark)`, height 8px, border-radius 4px
- Fill: gradient from `var(--blue-mid)` to `var(--blue-sat)`, transitions smoothly

**Modals**
- Backdrop: `rgba(0,0,0,0.3)` blur backdrop
- Card: white, border-radius 20px, padding 28px, max-width 400px, centred
- Entry animation: scale from 0.95 + fade in, 200ms

**Background petals**
- 4–5 SVG botanical shapes (leaf, petal, sprig) in very muted `var(--blue-light)` or `var(--cream-dark)`, `opacity: 0.4`
- Fixed position, pointer-events none, overflow hidden on body
- Do not interfere with gameplay at any viewport size

**Typography application**
- Logo: `Fraunces`, 24px, weight 600, `var(--charcoal)`
- Rank name: `Fraunces`, 18px, weight 600
- Score display: `Fraunces`, 22px, weight 600, `var(--blue-sat)`
- Input display: `Fraunces`, 32px, weight 600, `var(--charcoal)`, letter-spacing 4px
- Hex tile letters: `Fraunces`, 22px, weight 600
- All other text: `DM Sans`

**Responsive breakpoints**
- `≥ 640px`: hex tiles scale up, game container gets more padding, modal card gets min-height

**Accessibility**
- `:focus-visible` rings on all interactive elements using `var(--blue-sat)`
- Sufficient contrast ratios (≥ 4.5:1) for all text
- `prefers-reduced-motion`: disable all non-essential animations, keep functional transitions only

---

## Phase 3c — Orchestrator: Integration

After both Phase 3a and Phase 3b are complete:

1. Review `app.js` — ensure all `document.getElementById` calls match IDs in `index.html`
2. Review `style.css` — ensure all class names toggled in `app.js` exist in CSS
3. Review `index.html` — ensure all script tags are in correct load order
4. Fix any mismatches found
5. Produce the final `README.md` (see §README Requirements below)

---

## Phase 4 — QA Tester Subagent

**Spawn this subagent after integration is complete. Provide it with all completed files as context.**

---

### QA Tester — System Prompt

You are the **QA Tester** on the Bloombert project. You will receive the completed codebase. Your job is to find bugs, logic errors, edge cases, and UX problems. You do not write new features — you audit existing code and produce a bug report, then a fixed patch for each confirmed bug.

#### QA Checklist

Work through each category systematically:

**1. Puzzle Generation Correctness**
- [ ] Verify `mulberry32` produces deterministic output for same seed across calls
- [ ] Verify `generatePuzzle(seed)` always returns ≥20 valid words
- [ ] Verify the key letter appears in every word in `validWords`
- [ ] Verify at least 1 Bloom word exists in every generated puzzle
- [ ] Verify no duplicate letters in the 7-letter set
- [ ] Test that the retry loop terminates (seed + 1 increments correctly, no infinite loop)
- [ ] Verify `getTodaysSeed()` returns same value for same calendar day regardless of time

**2. Scoring Accuracy**
- [ ] Score a 4-letter word → must be 1 pt
- [ ] Score a 5-letter word → must be 5 pts
- [ ] Score a 6-letter word → must be 6 pts
- [ ] Score a 9-letter word → must be 9 pts
- [ ] Score a Bloom word (e.g. 7-letter Bloom) → must be 7 + 7 = 14 pts
- [ ] Score a Bloom word (e.g. 9-letter Bloom) → must be 9 + 7 = 16 pts
- [ ] `computeRankThresholds(100)` → Sprout=5, Bud=12, Bloom=25, etc. (exact integer math)
- [ ] Rank thresholds use `Math.ceil` or `Math.floor` consistently (specify which and verify)

**3. Word Validation Edge Cases**
- [ ] 3-letter word → rejected as "too_short"
- [ ] Word with characters not in the 7 letters → rejected as "invalid_chars"
- [ ] Valid word missing key letter → rejected as "missing_key"
- [ ] Word not in WORD_LIST → rejected as "not_a_word"
- [ ] Already-found word → rejected as "already_found"
- [ ] Valid word with repeated letters (e.g. "letter" uses 'e' twice, 't' twice) → accepted if key letter present
- [ ] Case insensitivity — input should be normalised to lowercase before all checks

**4. State Persistence**
- [ ] Found words survive page refresh (same day)
- [ ] On new day: fresh state, previous day's words not loaded
- [ ] Streak increments on consecutive days
- [ ] Streak resets if a day is skipped
- [ ] `localStorage` keys do not collide between different dates

**5. UI / DOM Integration**
- [ ] Every `document.getElementById(id)` in `app.js` — verify that `id` exists in `index.html`
- [ ] Every CSS class toggled in `app.js` — verify it exists in `style.css`
- [ ] Shuffle button reorders only outer 6 tiles; key letter stays in centre
- [ ] Delete removes exactly one character from input
- [ ] Enter with empty input does nothing (no error thrown)
- [ ] Hex tile click appends correct letter to input
- [ ] Physical keyboard input works for letters A–Z, Backspace, Enter

**6. Mobile UX Audit**
- [ ] No horizontal overflow at 375px viewport width
- [ ] All hex tiles ≥ 44px tap targets
- [ ] Hex grid fits within screen without overflow
- [ ] Scroll not needed to reach Enter button
- [ ] Toast notification does not overlap action buttons
- [ ] Found words list scrolls horizontally without triggering vertical scroll

**7. Accessibility Audit**
- [ ] All buttons have accessible labels (`aria-label` or visible text)
- [ ] `#input-display` has `aria-live="polite"` for screen reader announcements
- [ ] Modals have `role="dialog"`, `aria-modal="true"`, labelled by heading
- [ ] `prefers-reduced-motion` media query disables animations

**8. Share Text**
- [ ] `formatShareText()` output contains date, rank emoji, word count, score
- [ ] Output copies to clipboard without error in a non-HTTPS context (use `navigator.clipboard` with fallback)

#### Bug Report Format

For each bug found, report in this format:

```
BUG-[N]: [Short title]
Severity: Critical / High / Medium / Low
File: [filename]
Line(s): [approx line numbers]
Description: [What is wrong]
Reproduction: [Steps or code snippet to reproduce]
Fix: [Exact code change to apply]
```

After the bug report, produce a **Patch Summary** with the minimum set of code changes needed to fix all Critical and High severity bugs.

---

## Final Deliverables Checklist

The Orchestrator confirms all of the following exist and are complete before declaring the project done:

- [ ] `words.js` — filtered ENABLE word list as global `Set`
- [ ] `prng.js` — seeded mulberry32 PRNG
- [ ] `puzzle.js` — daily puzzle generation and word validation
- [ ] `scoring.js` — scoring, rank thresholds, share text
- [ ] `state.js` — localStorage state and streak management
- [ ] `app.js` — main controller, DOM bridge, event handlers
- [ ] `style.css` — complete responsive styles, all animations
- [ ] `index.html` — complete HTML structure, Google Fonts, script tags
- [ ] `prepare-words.js` — word list preparation script (not deployed, used in setup)
- [ ] `README.md` — setup instructions, word list attribution, GitHub Pages deployment steps
- [ ] QA bug report completed; all Critical/High bugs patched

---

## README Requirements

The `README.md` must include:

1. **Project title and description** with a screenshot placeholder
2. **Live demo link** (`https://[username].github.io/Bloombert`)
3. **Setup — Getting Started**:
   - `git clone` instructions
   - How to run `prepare-words.js` to generate `words.js`
   - How to open locally (`open index.html` or `npx serve .`)
4. **GitHub Pages Deployment**:
   - Go to repo Settings → Pages → Source: Deploy from branch → `main` / `root`
   - No build step needed — push and it deploys
5. **Word List Attribution** (legal notice, see §Word List Acquisition)
6. **Project Structure** — annotated file tree
7. **How the Puzzle Works** — brief algorithm explanation
8. **Customisation** — how to change letter weights, rank thresholds, word list
9. **Licence** — MIT for original code; ENABLE word list is public domain

---

## Orchestrator: Execution Order Summary

```
[1] Orchestrator: produce Implementation Plan
[2] Orchestrator: run word list acquisition (prepare-words.js)
[3a] Core Engine Dev: write prng.js, puzzle.js, scoring.js, state.js
[3b] Graphic Designer: write index.html, style.css        ← parallel with 3a
[4] Core Engine Dev: write app.js (depends on 3b DOM structure)
[5] Orchestrator: integration review and fixes
[6] QA Tester: full audit, bug report, patches
[7] Orchestrator: apply patches, final check, README
```

Do not skip phases or reorder them. Validate each handoff before proceeding to the next phase.
