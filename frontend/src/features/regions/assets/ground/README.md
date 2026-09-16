# Region ground tiles

The seamless tiles a region profile paints (`plan-region-primitive.md` C4/D13).
A profile's `texture` key in `frontend/src/client-data/terrain-profiles.json`
(or `atmosphere-profiles.json`, for a fog bank — the air is a surface too)
names one of these files **by stem** — `"texture": "pd163"` is `pd163.jpg`.
⚑ The seven `*-placeholder.png` tiles are the RGBA ones here, and the only ones
an atmosphere profile names — a ground tile is opaque, because it IS the ground;
air has to let the world through. (`water-placeholder.png` is the exception that
proves it: a river is ground, so it is RGB.)
Nothing else
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

### `water-` / `bog-` / `lava-placeholder.png` — GENERATED, not from a pack

| | |
|---|---|
| Source | `tools/make-water-tile.mjs` in this repo — run `node tools/make-water-tile.mjs` |
| Author | generated procedurally; no third-party asset involved |
| Licence | same as the repo — nothing to attribute |

⚑ **They are PLACEHOLDERS and say so in their names.** The first exists so
`Water` had a tile to test against at all (plan-world-paths.md); replacing any
of them with real art is a one-line `terrain-profiles.json` edit plus deleting
the file.

⭐ **All three come out of ONE generator because they are the same technique:
RIDGED fields.** A smooth wave sum pushed through `1 - |sin|` raised to a power,
so `sharpness` alone spans three materials that look nothing alike — 4.2 is a
wave crest, 1.4 a broad scum blotch, 7 a thin bright crack. Opaque RGB, because
all three are ground.

⛔ **Two things the tuning taught, both recorded in the script:** a bog at a
midtone gamma reads as a *mossy lawn*, because a bog is dark and wet with scum
as the exception, not the reverse; and lava at a gamma below 1 becomes a *molten
lake with dark islands* rather than crust with veins. ⚑ Lava's gamma matters more
than any other number here because at `scale: 0.35` roughly **nine** tile repeats
cross a 20-unit screen, and a bright high-contrast field repeated nine times
reads as noise and advertises the tiling.

⭐ **Seamless by construction, not by eye.** Every wave in the generator has an
INTEGER wave number, so the image is exactly periodic in both axes — see the
script's header. Re-tune it by editing constants and re-running; the output is
deterministic, with no RNG anywhere.

### The atmosphere tiles — GENERATED, not from a pack

| | |
|---|---|
| Source | `tools/make-fog-tile.mjs` → `fog`, `miasma` |
| | `tools/make-precipitation-tiles.mjs` → `rain`, `snow`, `ash`, `sand-storm`, `fairy` |
| Author | generated procedurally; no third-party asset involved |
| Licence | same as the repo — nothing to attribute |

⭐ **TWO generators, split by what the air IS**, and it is the line to think
along before adding a tile to either:

- **Density fields** (`make-fog-tile.mjs`) cover *every* pixel — a sum of
  integer-frequency waves with a contrast curve deciding where the banks are.
- **Particles** (`make-precipitation-tiles.mjs`) are discrete marks on a
  *mostly-empty* tile. That script hard-fails above 50 % coverage: past there a
  tile has stopped being particles and become a wash, which the other family
  already does better.

Each script carries one constant block per tile, so a new fog or a new snowfall
is a block, not a script. Fog with drops in it is two profiles stacked, not one
tile trying to be both.

⚑ **The two STREAK tiles are coupled to their profile's `scroll`** (`Rain`,
`Sandstorm`): the script reads it and leans the streaks along it, so re-tuning
the drift without re-running the generator leaves rain sliding sideways instead
of falling. The dot tiles are round and do not care.

⛔ **Pick a tint against the ground the air will sit over, never in the
abstract** — this cost two of the five particle tiles a re-tune. A tan sandstorm
over tan `Desert` and a violet fairy dust over violet `Magic Forest` were both
very nearly invisible; snow-white over green was fine. D14 makes `color` a
fallback and **never** a tint, so the tile's own colour is the only lever, and
adding *density* to fix a *contrast* fault just walks a tile toward the other
family (which is exactly how the sandstorm tripped the coverage ceiling).

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
