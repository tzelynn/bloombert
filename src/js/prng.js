// prng.js — Seeded PRNG using Mulberry32
// Seed format: parseInt("YYYYMMDD") from local date string
// e.g. March 20, 2026 → parseInt("20260320") → 20260320

function mulberry32(seed) {
  let t = seed | 0;
  return function () {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function createRNG(seed) {
  const rng = mulberry32(seed);
  return { next: rng };
}
