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

### `forest-` / `wall-placeholder.png` — GENERATED, not from a pack

| | |
|---|---|
| Source | `tools/make-cellular-tiles.mjs` in this repo |
| Author | generated procedurally; no third-party asset involved |
| Licence | same as the repo — nothing to attribute |

⭐ **The fourth family: CELLULAR fields.** A jittered lattice makes the tile out
of PIECES rather than out of waves or marks — a leaf is a piece, a stone is a
piece — and it gets used the two ways a lattice gets used, which is the whole
content of that script:

- **`course()` CUTS**: rows of varying height split into a per-row number of
  columns at jittered joints. Every pixel belongs to a stone; the borders are
  the mortar.
- **`leafCover()` PLACES**: each cell is a SLOT that may or may not hold a leaf,
  and most of the tile is the duff between them.

⛔ **Two things the tuning taught, and neither is guessable from the code.**
① A packed Voronoi of leaves renders as **crazy paving** — every cell outlined,
no gaps — because litter does not tessellate; the lattice had to stop *cutting*
and start *placing*. Random scatter is not the fix either (leaves collide), so
the lattice stayed for its free spacing. ② A Voronoi of a **staggered** lattice
— the half-row offset every masonry pattern starts from — is a **hexagonal**
tiling, and the first wall came out as a bathroom floor. Jitter only makes the
hexagons wobbly. A wall needs a rectangular cut, which is why there are two
partitions in one script instead of one parameterised one.

⭐ **That script adds a check its three siblings lack, and it earned its keep on
the first run: it measures the rendered tile's MEAN COLOUR against the
profile's `color`** and fails past 12/255. The others report where the mean sits
on a *ramp*, which only proves a tile is internally consistent — D14 is a claim
about the IMAGE, since `color` is what paints while the texture loads. The
forest tile failed it at 13/255 (a shadow pass and a second leaf layer pulling
the average warm) and was re-tuned green until it passed. ⚑ Which is also why
`Forest` is a **moss floor with scattered leaves** and not the brown carpet its
one-line brief in `docs/art/assets.csv` asks for: the profile's colour is green,
and a brown tile under a green fallback flips the hue of Zone 2's whole floor
the moment the texture loads. Re-colouring the profile is the alternative, and
it is a one-line change if the look sitting wants it.

⚑ **Seamless by construction like the others, but proved differently per
partition**: waves need integer wave numbers, a lattice needs its jitter hashed
from the cell index taken MODULO the lattice size, and a course needs integer
row and column counts with the row heights renormalised to land exactly on 750.

### The field tiles — GENERATED, not from a pack

| | |
|---|---|
| Source | `tools/make-field-tiles.mjs` → `ploughed`, `ploughed-cross`, `wheat`, `wheat-cross` |
| Author | generated procedurally; no third-party asset involved |
| Licence | same as the repo — nothing to attribute |

⚑ **Not a fifth technique.** A furrow is a RIDGED field — water's `1 - |sin|`
trick pointed along one axis instead of clustered into a swell — and the rest
is ordinary wave sums. It is its own script because one named
`make-water-tile` has no business owning a wheat field.

⭐ **Each material ships TWICE, once per row direction**, and that is the
interesting constraint rather than an indulgence: a profile carries
`texture`/`scale`/`blend`/`color`/`scroll` and **no rotation**, so every plot
wearing one profile has its rows running the same way in world space. One
direction across a whole valley reads as a printing error. Turning a wave 90°
is just swapping `(kx, ky)`, so the variant costs nothing and stays exactly
periodic — and any INTEGER pair is a legal direction, so a diagonal plot is one
constant block away.

⛔ **THE LESSON BOTH TILES TAUGHT, and it is the one to carry to the next
material: a sum of smooth waves is SMOOTH, and smooth ground reads as CLOTH.**
The plough went through two drafts of soft tan ribbons (corduroy) and the wheat
through one of flat mustard, and no amount of contrast or extra frequencies
fixed either. What fixed both was one signed `detail` pass — `ridged` at high
sharpness, which is a net of hard thin lines — subtracted for the plough (the
crevices between clods) and added for the wheat (heads catching the light).
⚑ Same mechanism, opposite sign; nothing else in that script can make a hard
edge.

⚑ **Row spacing is the number to judge, not the colour**: at `scale: 0.35` a
tile spans 2.19 u, so the plough's 5 rows sit **0.44 u** apart against a 0.5 u
player and the drill's 14 sit **0.16 u** apart. Re-tune `scale` and both move.

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
