// Seeded random numbers, so a level number or a date always produces the same puzzle.
(function (root) {
  'use strict';

  // xmur3 string hash -> 32-bit seed
  function hash(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }

  // mulberry32 PRNG
  function make(seed) {
    let a = typeof seed === 'number' ? seed >>> 0 : hash(String(seed));
    const next = function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = (n) => Math.floor(next() * n);
    next.range = (lo, hi) => lo + next() * (hi - lo);
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    return next;
  }

  root.Rng = { make, hash };
})(globalThis);
