// Procedural puzzle generator. Draws a picture-like image, then nudges cells
// until the line solver can finish it, so every generated level has exactly
// one solution and never needs guessing.
(function (root) {
  'use strict';

  const PALETTES = [
    ['#fb6f92', '#ff8fab', '#ffb3c6', '#c9184a'],
    ['#4895ef', '#4cc9f0', '#4361ee', '#3a0ca3'],
    ['#57cc99', '#80ed99', '#38a3a5', '#22577a'],
    ['#f4a261', '#ffd166', '#e76f51', '#ef476f'],
    ['#b5838d', '#cdb4db', '#ffafcc', '#a2d2ff'],
    ['#f28482', '#f6bd60', '#84a59d', '#f5cac3'],
    ['#9b5de5', '#f15bb5', '#fee440', '#00bbf9'],
    ['#606c38', '#dda15e', '#283618', '#bc6c25'],
    ['#ffadad', '#ffd6a5', '#a0c4ff', '#caffbf'],
    ['#2a9d8f', '#e9c46a', '#264653', '#f4a261'],
    ['#ff7b00', '#ffb700', '#ff5400', '#ffd000'],
    ['#6d597a', '#b56576', '#e56b6f', '#eaac8b'],
  ];

  function noise(w, h, p, rng) {
    const a = new Uint8Array(w * h);
    for (let i = 0; i < a.length; i++) a[i] = rng() < p ? 1 : 0;
    return a;
  }

  // Majority vote over each 3x3 neighbourhood: turns static into blobs.
  function smooth(a, w, h, passes) {
    for (let k = 0; k < passes; k++) {
      const b = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let c = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = Math.min(h - 1, Math.max(0, y + dy));
            for (let dx = -1; dx <= 1; dx++) {
              const xx = Math.min(w - 1, Math.max(0, x + dx));
              c += a[yy * w + xx];
            }
          }
          b[y * w + x] = c >= 5 ? 1 : 0;
        }
      }
      a = b;
    }
    return a;
  }

  function mirrorX(a, w, h) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w >> 1; x++) a[y * w + w - 1 - x] = a[y * w + x];
    }
    return a;
  }

  function mirrorY(a, w, h) {
    for (let y = 0; y < h >> 1; y++) {
      for (let x = 0; x < w; x++) a[(h - 1 - y) * w + x] = a[y * w + x];
    }
    return a;
  }

  function stamp(a, w, h, inside, xor) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (inside(x + 0.5, y + 0.5)) a[y * w + x] = xor ? a[y * w + x] ^ 1 : 1;
      }
    }
  }

  function shape(kind, cx, cy, r, rw, rh) {
    switch (kind) {
      case 'circle': return (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      case 'ring': return (x, y) => {
        const d = Math.hypot(x - cx, y - cy);
        return d <= r && d >= r * 0.55;
      };
      case 'rect': return (x, y) => Math.abs(x - cx) <= rw && Math.abs(y - cy) <= rh;
      case 'diamond': return (x, y) => Math.abs(x - cx) + Math.abs(y - cy) <= r;
      default: return (x, y) => y - cy >= -r && y - cy <= r * 0.8 && Math.abs(x - cx) <= (y - cy + r) * 0.62;
    }
  }

  const STYLES = {
    blob(w, h, rng) {
      return smooth(noise(w, h, rng.range(0.5, 0.62), rng), w, h, 2 + rng.int(2));
    },
    symmetric(w, h, rng) {
      return smooth(mirrorX(noise(w, h, rng.range(0.5, 0.62), rng), w, h), w, h, 1 + rng.int(2));
    },
    mandala(w, h, rng) {
      const a = mirrorY(mirrorX(noise(w, h, rng.range(0.5, 0.6), rng), w, h), w, h);
      if (w === h) {
        for (let y = 0; y < h; y++) for (let x = y + 1; x < w; x++) a[y * w + x] = a[x * w + y];
      }
      return smooth(a, w, h, 1);
    },
    sprite(w, h, rng) {
      const a = mirrorX(noise(w, h, rng.range(0.5, 0.6), rng), w, h);
      return Math.max(w, h) > 8 ? smooth(a, w, h, 1) : a;
    },
    shapes(w, h, rng) {
      const a = new Uint8Array(w * h), m = Math.min(w, h);
      const n = 2 + rng.int(4);
      for (let s = 0; s < n; s++) {
        const kind = rng.pick(['circle', 'rect', 'diamond', 'ring', 'tri']);
        const inside = shape(kind, rng.range(0, w), rng.range(0, h), rng.range(m * 0.2, m * 0.5),
          rng.range(m * 0.15, m * 0.45), rng.range(m * 0.15, m * 0.45));
        stamp(a, w, h, inside, s > 0 && rng() < 0.4);
      }
      return rng() < 0.5 ? mirrorX(a, w, h) : a;
    },
    landscape(w, h, rng) {
      const a = new Uint8Array(w * h), m = Math.min(w, h);
      const f1 = rng.range(0.15, 0.45), f2 = rng.range(0.5, 1.1);
      const p1 = rng.range(0, 6.3), p2 = rng.range(0, 6.3);
      const base = h * rng.range(0.35, 0.55), amp = h * rng.range(0.1, 0.22);
      for (let x = 0; x < w; x++) {
        const top = h - (base + amp * (0.65 * Math.sin(x * f1 + p1) + 0.35 * Math.sin(x * f2 + p2)));
        for (let y = 0; y < h; y++) if (y + 0.5 >= top) a[y * w + x] = 1;
      }
      const r = m * rng.range(0.1, 0.18);
      stamp(a, w, h, shape('circle', rng.range(r + 0.5, w - r - 0.5), rng.range(r + 0.5, h * 0.35), r), false);
      if (rng() < 0.6) {
        const cy = rng.range(h * 0.1, h * 0.3), cx = rng.range(0, w), rw = m * rng.range(0.15, 0.3);
        stamp(a, w, h, (x, y) => ((x - cx) / rw) ** 2 + ((y - cy) / (rw * 0.45)) ** 2 <= 1, true);
      }
      return a;
    },
  };

  function chooseStyle(w, h, rng) {
    if (Math.max(w, h) <= 7) return rng.pick(['sprite', 'sprite', 'symmetric', 'shapes', 'blob']);
    const opts = ['blob', 'symmetric', 'symmetric', 'shapes', 'shapes', 'landscape', 'sprite'];
    if (w === h) opts.push('mandala', 'mandala');
    return rng.pick(opts);
  }

  function density(a) {
    let n = 0;
    for (let i = 0; i < a.length; i++) n += a[i];
    return n / a.length;
  }

  // Flips cells the solver could not decide until the puzzle is logic-solvable.
  function makeSolvable(img, w, h, rng) {
    const maxFlips = Math.ceil((w * h) / 4);
    for (let f = 0; f <= maxFlips; f++) {
      const { rows, cols } = root.Solver.clues(img, w, h);
      const res = root.Solver.solve(rows, cols, w, h);
      if (res.solved) return { img, passes: res.passes };
      const unknown = [];
      for (let i = 0; i < res.grid.length; i++) if (res.grid[i] === -1) unknown.push(i);
      img[unknown[rng.int(unknown.length)]] ^= 1;
    }
    return null;
  }

  function mix(hex, toward, t) {
    const a = parseInt(hex.slice(1), 16), b = parseInt(toward.slice(1), 16);
    const ch = (v, s) => (v >> s) & 255;
    const c = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
    return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
  }

  // Colours each connected shape with a palette colour and a soft top-to-bottom shade.
  function colorize(sol, w, h, seed) {
    const rng = root.Rng.make('color:' + seed);
    const palette = rng.pick(PALETTES).slice();
    for (let i = palette.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [palette[i], palette[j]] = [palette[j], palette[i]];
    }
    const comp = new Int32Array(w * h).fill(-1);
    const sizes = [];
    for (let i = 0; i < w * h; i++) {
      if (!sol[i] || comp[i] !== -1) continue;
      const id = sizes.length, stack = [i];
      comp[i] = id;
      let size = 0;
      while (stack.length) {
        const c = stack.pop(), x = c % w, y = (c / w) | 0;
        size++;
        const nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, y > 0 ? c - w : -1, y < h - 1 ? c + w : -1];
        for (const n of nb) if (n >= 0 && sol[n] && comp[n] === -1) { comp[n] = id; stack.push(n); }
      }
      sizes.push(size);
    }
    const order = sizes.map((s, i) => i).sort((a, b) => sizes[b] - sizes[a]);
    const compColor = [];
    order.forEach((id, rank) => { compColor[id] = palette[rank % palette.length]; });
    const colors = new Array(w * h).fill(null);
    for (let i = 0; i < w * h; i++) {
      if (!sol[i]) continue;
      const y = (i / w) | 0, t = h > 1 ? y / (h - 1) : 0.5;
      const base = compColor[comp[i]];
      colors[i] = t < 0.5 ? mix(base, '#ffffff', (0.5 - t) * 0.3) : mix(base, '#000000', (t - 0.5) * 0.25);
    }
    return colors;
  }

  function generate(w, h, seed, style) {
    const rng = root.Rng.make('gen:' + w + 'x' + h + ':' + seed);
    for (let attempt = 0; attempt < 500; attempt++) {
      const s = style || chooseStyle(w, h, rng);
      const img = STYLES[s](w, h, rng);
      const d = density(img);
      if (d < 0.32 || d > 0.78) continue;
      const res = makeSolvable(img, w, h, rng);
      if (!res) continue;
      const d2 = density(res.img);
      if (d2 < 0.3 || d2 > 0.8) continue;
      return { w, h, sol: res.img, style: s, passes: res.passes, colors: colorize(res.img, w, h, seed) };
    }
    throw new Error('Could not generate a ' + w + 'x' + h + ' puzzle');
  }

  root.Generator = { generate, colorize, STYLES };
})(globalThis);
