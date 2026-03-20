#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

const URL = 'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt';

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

async function main() {
  console.log('Downloading ENABLE word list...');
  const text = await fetch(URL);

  const words = text
    .split(/\r?\n/)
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length >= 4 && w.length <= 12)
    .filter(w => /^[a-z]+$/.test(w));

  const unique = [...new Set(words)].sort();

  console.log(`Filtered to ${unique.length} words (4-12 letters, alpha-only)`);

  const items = unique.map(w => `"${w}"`).join(',\n  ');
  const output = `const WORD_LIST = new Set([\n  ${items}\n]);\n`;

  fs.writeFileSync('words.js', output, 'utf8');
  console.log(`Wrote words.js (${(Buffer.byteLength(output) / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
