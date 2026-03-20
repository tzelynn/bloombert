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
| `src/data/words.js` | `WORD_LIST` — a `Set` of ~85k valid words. Generated, not hand-edited. |
| `src/js/prng.js` | `createRNG(seed)` — Mulberry32 seeded PRNG. |
| `src/js/scoring.js` | `scoreWord`, `isBloom`, `computeRankThresholds`, `getRank`, `formatShareText`. `formatShareText` takes `(date, rank, foundCount, totalCount, score, bloomCount)` and produces NYT-inspired share text with emoji progress bar. |
| `src/js/puzzle.js` | `generatePuzzle(seed)`, `getAllValidWords`, `isValidGuess`. Depends on `WORD_LIST`, `createRNG`, `scoreWord`, `isBloom`. |
| `src/js/state.js` | `loadState`, `saveState`, `loadStats`, `saveStats`, `checkAndUpdateStreak`. Uses `localStorage`. |
| `src/js/app.js` | UI controller — DOM manipulation, event binding, modals, share flow. IIFE, depends on all above. |
| `src/css/style.css` | All styles — responsive, animations, botanical theme. |
| `scripts/prepare-words.js` | Node script to download and filter the ENABLE word list. Output path is hardcoded to `words.js` in CWD — run from project root or update the path. |

**Script load order matters:** `words.js` → `prng.js` → `scoring.js` → `puzzle.js` → `state.js` → `app.js`.

## Key conventions

- All game JS lives in IIFEs or bare functions on `window`. No ES modules.
- Puzzle generation is deterministic: seeded with `parseInt("YYYYMMDD")`. Same date = same puzzle everywhere.
- Game state is keyed per day in `localStorage` (`bloombert-state-YYYY-MM-DD`).
- Stats are stored in `localStorage` under `bloombert-stats`.
- Custom events dispatched on `document`: `Bloombert:success`, `Bloombert:error`, `Bloombert:bloom`, `Bloombert:rankup`.
- Share flow: header share button and stats modal "Share Results" both close stats modal → open share modal with formatted text preview → user clicks "Copy to Clipboard" → inline button feedback ("✅ Copied!"). Uses Clipboard API with `execCommand('copy')` fallback.

## Modals

- `modal-stats` — player stats and "Share Results" button.
- `modal-share` — share text preview with copy button. Opened via header 📤 button or "Share Results" in stats modal.
- Modals use `hidden` attribute, managed by `openModal()`/`closeModal()`.

## Scoring rules

- Every word scores 1 point per letter (e.g. 4 letters = 4 pts).
- Bloom (uses all 7 letters) = word score + 7 bonus.
- Puzzle must have ≥20 valid words, ≥1 bloom word, ≥50 total points.

## When editing

- Don't convert to ES modules — the app loads via `<script>` tags with no bundler.
- Keep `words.js` generated — edit `scripts/prepare-words.js` instead.
- If adding a new JS file, add the `<script>` tag in `index.html` in the correct dependency order.
- Test by opening `index.html` directly in a browser (or `npx serve .`).
- The site is deployed to GitHub Pages from `main` branch root — no build step needed.
