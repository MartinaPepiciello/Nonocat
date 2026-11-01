# Nonocat

A nonogram (picross) puzzle game for the family, in Italian. You install it to
your phone's home screen. Each player picks a nickname, and their progress is
saved online. The game still plays offline and catches up when it's back online.

The game and the save database live together in one free Cloudflare project.

## What's in it

- **Endless levels.** Each level is generated on the phone from its number.
  Boards are 5×5 at first, then mostly 10×10, never bigger than 15×15. You can
  always play up to two levels past your furthest one.
- **Daily puzzle.** 8×8 on Monday, 15×15 on Sunday, 10×10 on most days, with a
  streak counter.
- **Disegni.** 33 hand-drawn pixel-art pictures that appear in colour when solved.
- **Quick play.** A fresh random puzzle from 5×5 to 15×15.
- Every puzzle has exactly one solution and never needs a guess.
- Hearts or free solving with undo, hints, drag to fill, dark mode.

## Nicknames and online saves

The first time the game opens it asks **"Chi gioca?"** Each person types a name.

- Progress is saved on the phone straight away. It's also sent online after each
  solved puzzle, when you leave a puzzle, and when the app goes to the background.
- On a new or reset phone, type the same name and the progress comes back.
  Capital letters and spaces don't matter.
- Two phones with the same name are merged, never overwritten. Solved puzzles
  from both are kept, along with the best times and the newest unfinished game.
- It's deliberately simple: there are no passwords. Anyone who has the game's
  address and types your name can see or change your progress. Use different
  names for each person.
- **Impostazioni** shows when progress was last saved online, and lets you switch
  player or reset progress (on the phone and online).

## Putting it online (one time, free)

You need a free Cloudflare account (https://dash.cloudflare.com/sign-up) and
Node.js (already on this PC). In this folder:

```bash
npm install
```

```bash
npx wrangler login
```

```bash
npm run deploy
```

`wrangler login` opens the browser so you can allow access to your Cloudflare
account. `deploy` uploads the game and creates the save database. At the end it
prints the address, something like `https://nonocat.<your-name>.workers.dev`.
Send that to the family.

To update later, change the files, bump `VERSION` in `public/sw.js`, and run
`npm run deploy` again. Saved progress is kept. Phones pick up the new version
the next time the app is opened online.

**Free plan limits:** about 100,000 saves a day and 5 GB of storage, far beyond
what a family uses. Loading the game files is free and unlimited.

## Install on a phone

Open the address, then:

- **iPhone (Safari):** Share → *Aggiungi alla schermata Home*
- **Android (Chrome):** ⋮ menu → *Installa app* / *Aggiungi a schermata Home*

## Try it on this computer first

```bash
npm run dev
```

This runs the whole thing (game and saves) at http://localhost:8787. Saves go
into a local test database in `.wrangler/` and never reach Cloudflare. To try it
from a phone on the same Wi-Fi:

```bash
npx wrangler dev --ip 0.0.0.0 --port 8080
```

Then open `http://<this PC's IP>:8080` on the phone. The offline install only
works once the game is online over https.

## Checks

```bash
npm test
```

This checks that every picture is valid and that online saves behave. The save
tests need `npm run dev` running in another terminal.

## Files

| Path | What |
| --- | --- |
| `public/` | The game: everything that's sent to phones |
| `public/js/app.js` | Screens, input, players, saving |
| `public/js/sync.js` | Online saves and the merge rules (also used by the server) |
| `public/js/generator.js`, `solver.js` | Level generator and the logic solver that guarantees a single solution |
| `public/js/pictures.js` | Hand-drawn pictures. Add your own here |
| `public/js/config.js` | Where saves are sent (`api/progress`). Set it to `''` to keep progress only on the phone |
| `worker/index.js` | The Cloudflare side: serves the game and stores one record per nickname |
| `wrangler.jsonc` | Cloudflare settings |
| `tools/` | Picture checker, save tests, icon generator |

## Adding a picture

Add an entry to `PICTURES` in `public/js/pictures.js`. Each row is a string, `.`
is empty, and each letter is a colour from `PALETTE`. The maximum size is 15×15.
Run `node tools/check-pictures.js`. If it prints `?` cells, the puzzle has more
than one solution. Add or remove a cell near the `?`s until it passes.
