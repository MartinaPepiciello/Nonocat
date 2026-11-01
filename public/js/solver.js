// Nonogram line solver. Cell values: -1 unknown, 0 empty, 1 filled.
// A puzzle counts as valid when this solver can finish it by pure logic,
// which also proves the solution is unique (no guessing ever needed).
(function (root) {
  'use strict';

  function lineClue(cells) {
    const out = [];
    let run = 0;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === 1) run++;
      else if (run) { out.push(run); run = 0; }
    }
    if (run) out.push(run);
    return out;
  }

  function clues(sol, w, h) {
    const rows = [], cols = [];
    for (let y = 0; y < h; y++) {
      const line = [];
      for (let x = 0; x < w; x++) line.push(sol[y * w + x] ? 1 : 0);
      rows.push(lineClue(line));
    }
    for (let x = 0; x < w; x++) {
      const line = [];
      for (let y = 0; y < h; y++) line.push(sol[y * w + x] ? 1 : 0);
      cols.push(lineClue(line));
    }
    return { rows, cols };
  }

  // Returns every cell the clue forces given what is already known,
  // or null when the known cells contradict the clue.
  function solveLine(line, clue) {
    const n = line.length, k = clue.length, W = n + 1;
    const zeros = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) zeros[i + 1] = zeros[i] + (line[i] === 0 ? 1 : 0);
    const noZero = (a, b) => zeros[b] === zeros[a];
    const canEmpty = (i) => line[i] !== 1;

    // F[j][i]: the first i cells can hold exactly the first j blocks
    const F = new Uint8Array((k + 1) * W);
    F[0] = 1;
    for (let i = 1; i <= n; i++) F[i] = F[i - 1] && canEmpty(i - 1) ? 1 : 0;
    for (let j = 1; j <= k; j++) {
      const L = clue[j - 1];
      for (let i = 1; i <= n; i++) {
        let v = F[j * W + i - 1] && canEmpty(i - 1);
        const s = i - L;
        if (!v && s >= 0 && noZero(s, i)) {
          v = j === 1 ? F[s] : s >= 1 && canEmpty(s - 1) && F[(j - 1) * W + s - 1];
        }
        F[j * W + i] = v ? 1 : 0;
      }
    }
    if (!F[k * W + n]) return null;

    // B[j][i]: cells i..n-1 can hold exactly blocks j..k-1
    const B = new Uint8Array((k + 1) * W);
    B[k * W + n] = 1;
    for (let i = n - 1; i >= 0; i--) B[k * W + i] = B[k * W + i + 1] && canEmpty(i) ? 1 : 0;
    for (let j = k - 1; j >= 0; j--) {
      const L = clue[j];
      for (let i = n - 1; i >= 0; i--) {
        let v = B[j * W + i + 1] && canEmpty(i);
        const e = i + L;
        if (!v && e <= n && noZero(i, e)) {
          v = j === k - 1 ? B[k * W + e] : e < n && canEmpty(e) && B[(j + 1) * W + e + 1];
        }
        B[j * W + i] = v ? 1 : 0;
      }
    }

    const canBeEmpty = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (!canEmpty(i)) continue;
      for (let j = 0; j <= k; j++) {
        if (F[j * W + i] && B[j * W + i + 1]) { canBeEmpty[i] = 1; break; }
      }
    }

    const cover = new Int32Array(n + 1);
    for (let j = 0; j < k; j++) {
      const L = clue[j];
      for (let s = 0; s + L <= n; s++) {
        const e = s + L;
        if (!noZero(s, e)) continue;
        const left = j === 0 ? F[s] : s >= 1 && canEmpty(s - 1) && F[j * W + s - 1];
        if (!left) continue;
        const right = j === k - 1 ? B[k * W + e] : e < n && canEmpty(e) && B[(j + 1) * W + e + 1];
        if (!right) continue;
        cover[s]++;
        cover[e]--;
      }
    }

    const out = new Int8Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += cover[i];
      const f = acc > 0, e = canBeEmpty[i] === 1;
      if (!f && !e) return null;
      out[i] = f && e ? -1 : f ? 1 : 0;
    }
    return out;
  }

  function getRow(grid, w, y) { return grid.subarray(y * w, y * w + w); }
  function getCol(grid, w, h, x) {
    const c = new Int8Array(h);
    for (let y = 0; y < h; y++) c[y] = grid[y * w + x];
    return c;
  }

  // Repeatedly solves lines until nothing changes.
  function solve(rows, cols, w, h, start) {
    const grid = start ? Int8Array.from(start) : new Int8Array(w * h).fill(-1);
    const rowDirty = new Uint8Array(h).fill(1), colDirty = new Uint8Array(w).fill(1);
    let passes = 0, changed = true;
    while (changed) {
      changed = false;
      passes++;
      for (let y = 0; y < h; y++) {
        if (!rowDirty[y]) continue;
        rowDirty[y] = 0;
        const r = solveLine(getRow(grid, w, y), rows[y]);
        if (!r) return { grid, solved: false, contradiction: true, passes };
        for (let x = 0; x < w; x++) {
          if (grid[y * w + x] !== r[x]) { grid[y * w + x] = r[x]; colDirty[x] = 1; changed = true; }
        }
      }
      for (let x = 0; x < w; x++) {
        if (!colDirty[x]) continue;
        colDirty[x] = 0;
        const r = solveLine(getCol(grid, w, h, x), cols[x]);
        if (!r) return { grid, solved: false, contradiction: true, passes };
        for (let y = 0; y < h; y++) {
          if (grid[y * w + x] !== r[y]) { grid[y * w + x] = r[y]; rowDirty[y] = 1; changed = true; }
        }
      }
    }
    let solved = true;
    for (let i = 0; i < grid.length; i++) if (grid[i] === -1) { solved = false; break; }
    return { grid, solved, contradiction: false, passes };
  }

  // Finds the line where logic reveals the most new cells, for hints.
  function bestDeduction(rows, cols, w, h, known) {
    let best = null;
    const consider = (kind, index, line, clue, toCell) => {
      const r = solveLine(line, clue);
      if (!r) return;
      const cells = [];
      for (let i = 0; i < r.length; i++) {
        if (line[i] === -1 && r[i] !== -1) cells.push({ i: toCell(i), v: r[i] });
      }
      if (cells.length && (!best || cells.length > best.cells.length)) best = { kind, index, cells };
    };
    for (let y = 0; y < h; y++) consider('row', y, getRow(known, w, y), rows[y], (x) => y * w + x);
    for (let x = 0; x < w; x++) consider('col', x, getCol(known, w, h, x), cols[x], (y) => y * w + x);
    return best;
  }

  root.Solver = { lineClue, clues, solveLine, solve, bestDeduction };
})(globalThis);
