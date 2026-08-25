# Region ground tiles

The seamless tiles a region profile paints (`plan-region-primitive.md` C4/D13).
A profile's `texture` key in `frontend/src/client-data/profiles.json` names one
of these files **by stem** — `"texture": "pd163"` is `pd163.jpg`. Nothing else
lists them: `RegionPaint.ts` discovers this folder with `require.context`, so
adding a tile is dropping a file in here, and naming a file that is not here
costs one region its texture and nothing more (D14 paints the profile's colour).

⚑ **Which profile uses which tile is NOT written down here, deliberately.**
`profiles.json` is the mapping and the only source of it (D12) — a table in this
file would be a second copy that goes stale the first time somebody re-picks,
which it did twice on the day C4 shipped.

## Provenance and licence

Files named `pdNNN.jpg` are the pack's **originals, unmodified** (750 × 750
JPEG), renamed from `461223NNN.jpg`:

| | |
|---|---|
| Pack | **100 Seamless Textures** (`pdtextures.zip`, 15.5 MB, 100 files) |
| Source | https://opengameart.org/content/100-seamless-textures |
| Author | Patrick Hoesly ("pdtextures" — http://pdtextures.blogspot.com/) |
| Licence | **CC0 1.0 / Public Domain** — no attribution required |

CC0 asks for nothing, so this is not a legal obligation: it is here so the next
person can find the other ~90 tiles instead of guessing where these came from.

⚑ **Anything not named `pdNNN` came from somewhere else — record it here when
you add it.** A tile with no provenance is one nobody can safely ship later.

## Adding a tile

1. Drop the file in this folder.
2. Name it in `profiles.json`: `"texture": "<file stem>"`.
3. `npm run build` — `require.context` resolves at build time, and `aurad -dev`
   serves `frontend/dist`.

Four rules, each with teeth:

- ⛔ **JPG/PNG only, never SVG.** `webpack.common.js:86` inlines every `.svg` as
  a base64 data URI *into the JS bundle*; rasters go through `type: 'asset'`,
  which emits a separate file and bundles only its URL. A 750 × 750 SVG tile
  would be pasted into `main.js` as text.
- **It must tile seamlessly.** It is a repeating fill, so a non-tiling image
  shows a grid at every tile boundary.
- **One file per stem.** `sand.jpg` and `sand.png` are the SAME stem, and
  whichever `require.context` lists last silently wins. Keep one.
- **Plain stems only**: letters, digits, `-`, `_`. Anything else is rejected by
  `parseTextureName` and the key is dropped **silently** — that profile just
  paints its colour with nothing said. (A *well-formed* stem with no matching
  file does warn in the console.) The same silence applies to `"texture": ""`;
  `null` is the explicit way to say "no tile here".

## The scale knob

`scale` in `profiles.json` is texture→world: at `0.35` a 750 px tile covers
262 world px (≈2.2 world units). It is **the sensitive knob** (§4.8) — the raw
tile reads as either ground or wallpaper depending on it — and it is per
profile, so a coarse tile and a fine one need not share a value. ⚑ A tile that
is not 750 px covers a different amount of world at the same `scale`: the
multiplier is against the file's own pixels, not a fixed size.

## Housekeeping

`require.context` pulls **every** matching file in this folder into the build,
so an unused tile still ships to `dist` even though nothing ever fetches it.
Delete tiles no profile names. Any `pdNNN` can be recovered from the pack above.
