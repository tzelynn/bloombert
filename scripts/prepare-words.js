#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

const ENABLE_URL = 'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt';
// 50k frequency-ranked words from OpenSubtitles — better coverage of everyday vocabulary
const COMMON_URL = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt';

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Given a set of base common words, expand with inflected forms
// (plurals, -ed, -ing, -er, -ers) that exist in the full dictionary.
function expandInflections(baseCommon, allWords) {
  const expanded = new Set(baseCommon);
  const suffixes = ['s', 'es', 'ed', 'ing', 'er', 'ers', 'ness', 'ly'];

  for (const word of baseCommon) {
    for (const suffix of suffixes) {
      const inflected = word + suffix;
      if (allWords.has(inflected)) {
        expanded.add(inflected);
      }
    }
    // handle consonant doubling: e.g. "spin" -> "spinning", "spinner"
    if (/[^aeiou][aeiou][^aeiouxwy]$/.test(word)) {
      const last = word[word.length - 1];
      for (const suffix of ['ed', 'ing', 'er', 'ers']) {
        const doubled = word + last + suffix;
        if (allWords.has(doubled)) {
          expanded.add(doubled);
        }
      }
    }
    // handle silent-e drop: e.g. "score" -> "scoring", "scored"
    if (word.endsWith('e')) {
      const stem = word.slice(0, -1);
      for (const suffix of ['ed', 'ing', 'er', 'ers']) {
        const form = stem + suffix;
        if (allWords.has(form)) {
          expanded.add(form);
        }
      }
    }
    // handle -y -> -ies, -ied: e.g. "copy" -> "copies", "copied"
    if (word.endsWith('y') && !/[aeiou]y$/.test(word)) {
      const stem = word.slice(0, -1);
      for (const suffix of ['ies', 'ied', 'ier', 'iers', 'iest']) {
        const form = stem + suffix;
        if (allWords.has(form)) {
          expanded.add(form);
        }
      }
    }
  }

  return expanded;
}

async function main() {
  console.log('Downloading ENABLE word list...');
  const enableText = await fetch(ENABLE_URL);

  console.log('Downloading common words list (50k frequency)...');
  const commonText = await fetch(COMMON_URL);

  // en_50k.txt format: "word frequency" per line
  const baseCommon = new Set(
    commonText
      .split(/\r?\n/)
      .map(line => line.split(/\s+/)[0].trim().toLowerCase())
      .filter(w => w.length >= 4 && /^[a-z]+$/.test(w))
  );

  console.log(`Base common words: ${baseCommon.size} (4+ letters, alpha-only)`);

  const words = enableText
    .split(/\r?\n/)
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length >= 4 && w.length <= 12)
    .filter(w => /^[a-z]+$/.test(w));

  const unique = [...new Set(words)].sort();
  const allWordsSet = new Set(unique);

  // Expand common set with inflections of base common words
  const commonSet = expandInflections(baseCommon, allWordsSet);
  const common = unique.filter(w => commonSet.has(w));

  console.log(`Filtered to ${unique.length} words (4-12 letters, alpha-only)`);
  console.log(`Common words after inflection expansion: ${common.length}`);

  const allItems = unique.map(w => `"${w}"`).join(',\n  ');
  const commonItems = common.map(w => `"${w}"`).join(',\n  ');
  const output = `const WORD_LIST = new Set([\n  ${allItems}\n]);\n\nconst COMMON_WORDS = new Set([\n  ${commonItems}\n]);\n`;

  fs.writeFileSync('words.js', output, 'utf8');
  console.log(`Wrote words.js (${(Buffer.byteLength(output) / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
