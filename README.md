# Bloombert 🌸

A daily word puzzle game inspired by NYT's Spelling Bee. Seven letters are arranged in a flower — one centre letter surrounded by six outer letters. Form words that include the centre letter; letters can be reused freely. Score depends on word length, with a special **Bloom** bonus for words using all seven letters.

Built by Claude.

**[Play Bloombert](https://tzelynn.github.io/bloombert)**

## Getting Started

```bash
git clone https://github.com/tzelynn/bloombert.git
cd bloombert
node prepare-words.js   # downloads ENABLE word list and generates words.js
```

Then open `index.html` in a browser, or serve locally:

```bash
npx serve .
```

## How the Puzzle Works

- **7 letters** are chosen deterministically each day using a seeded PRNG (Mulberry32, seeded with `YYYYMMDD`)
- Letters are selected from a weighted pool: vowels at 3× weight, common consonants at 2×, rare consonants at 1×
- Every valid word must contain the **centre letter** and use only the 7 given letters
- Words must be **4+ letters** long (letters can be reused)
- A **Bloom** word uses all 7 unique letters for a +7 point bonus
- Puzzles are validated to have ≥20 valid words, ≥1 Bloom word, and ≥50 total points

### Scoring

| Length | Points |
|--------|--------|
| 4 letters | 1 |
| 5 letters | 5 |
| 6+ letters | 1 per letter |
| Bloom bonus | +7 |

### Ranks

8 tiers based on percentage of the puzzle's total possible score:

| Rank | % of Total |
|------|-----------|
| 🌱 Seedling | 0% |
| 🌿 Sprout | 2% |
| 🌼 Bud | 5% |
| 🌸 Bloom | 10% |
| 🌺 Petal | 25% |
| 🌻 Sunflower | 45% |
| 💐 Bouquet | 70% |
| 🌟 Garden Master | 100% |

## Project Structure

```
bloombert/
├── index.html         # Game page with honeycomb grid, modals, accessibility
├── style.css          # Responsive styles, animations, botanical theme
├── app.js             # UI controller — DOM bridge, input, events, modals
├── puzzle.js          # Daily puzzle generation and word validation
├── scoring.js         # Scoring, rank thresholds, share text
├── prng.js            # Deterministic seeded PRNG (Mulberry32)
├── state.js           # localStorage persistence and streak tracking
├── words.js           # Generated word list (~85-95k words)
├── prepare-words.js   # Node script to download and filter ENABLE word list
└── README.md
```

## Customisation

- **Letter weights**: Edit the `pool` construction in `generatePuzzle()` in `puzzle.js`. Increase repetitions to make a letter more likely.
- **Rank thresholds**: Edit the percentages in `computeRankThresholds()` in `scoring.js`.
- **Word list**: Replace `words.js` with any `Set` of lowercase words. Adjust the filter in `prepare-words.js` (min/max length, character set) and re-run.
- **Scoring rules**: Edit `scoreWord()` and `isBloom()` in `scoring.js`.

## Word List

The word list used in Bloombert is derived from the **ENABLE (Enhanced North American Benchmark Lexicon)** word list, which is in the public domain. Original source: https://github.com/dolph/dictionary. No modifications to the word definitions have been made; only length filtering (4–12 letters, alphabetic only) has been applied.

## License

MIT for original code. The ENABLE word list is public domain.
