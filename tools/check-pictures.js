// Checks every hand-drawn picture: rows are the same width and the puzzle
// can be solved by logic alone. Ambiguous cells are printed as '?'.
// Usage: node tools/check-pictures.js
const load = require('./load');
const { Pictures, Solver } = load('rng', 'solver', 'pictures');

let bad = 0;
const ids = new Set();
for (const pic of Pictures.PICTURES) {
  if (ids.has(pic.id)) { console.log(`${pic.id}: duplicate id`); bad++; }
  ids.add(pic.id);
  const w = pic.art[0].length;
  const wrong = pic.art.findIndex((row) => row.length !== w);
  if (wrong >= 0) { console.log(`${pic.id}: row ${wrong} is ${pic.art[wrong].length} wide, expected ${w}`); bad++; continue; }
  if (w > 15 || pic.art.length > 15) { console.log(`${pic.id}: ${w}x${pic.art.length} is bigger than the 15x15 limit`); bad++; }
  const unknownChars = pic.art.join('').replace(/\./g, '').split('').filter((c) => !Pictures.PALETTE[c]);
  if (unknownChars.length) { console.log(`${pic.id}: unknown colours ${[...new Set(unknownChars)].join('')}`); bad++; }
  const p = Pictures.fromPicture(pic);
  const { rows, cols } = Solver.clues(p.sol, p.w, p.h);
  const res = Solver.solve(rows, cols, p.w, p.h);
  if (!res.solved) {
    bad++;
    console.log(`${pic.id} (${p.w}x${p.h}) is not logic-solvable:`);
    for (let y = 0; y < p.h; y++) {
      let line = '';
      for (let x = 0; x < p.w; x++) {
        const v = res.grid[y * p.w + x];
        line += v === -1 ? '?' : v ? '#' : '.';
      }
      console.log('   ' + line + '    ' + pic.art[y]);
    }
  } else {
    console.log(`ok  ${pic.id.padEnd(11)} ${p.w}x${p.h}  passes ${res.passes}`);
  }
}
console.log(bad ? `\n${bad} problem(s)` : `\nAll ${Pictures.PICTURES.length} pictures are fine`);
process.exitCode = bad ? 1 : 0;
