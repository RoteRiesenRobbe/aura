# Art pipeline — getting art into the game

How a drawing becomes a sprite on screen, what a swap costs, and what the
four-layer medallion structure needs. Companion to `README.md` (the brief + the
worklist). Authoring reference for *new content* (new mob, new EntityType, new
ability): `../manual-content-authoring.md`.

---

## 1 · How it works today

```
your file  →  webpack require()  →  Pixi Assets.load  →  one baked Texture
           →  PIXI.Sprite  →  container on a render layer
```

Two files own the whole thing:

- **`frontend/src/client-data/Graphics.ts`** — the registry. Every sprite in the
  game has an entry here naming its file and its size.
- **`frontend/src/features/game-objects/logic/Mobs.ts`** (and `Resources.ts` for
  props) — one small class per entity type that registers the texture and builds
  the on-screen container.

A mob entry looks like this:

```ts
wolf: {
    file: require('../features/game-objects/assets/mobs/wolf.svg'),
    minSize: 38,
    maxSize: 46,
},
```

and is consumed once at boot:

```ts
Preloading.registerGameObjectSVG(Wolf, file('wolf'), maxSize('wolf'));
```

**Three consequences worth internalising:**

1. **The texture is baked once, at load.** `registerGameObjectSVG` rasterizes the
   SVG at `GRAPHICS_RESOLUTION (1) × 2 × maxSize` px square. A Wolf at
   `maxSize: 46` becomes a 92×92 texture. **`maxSize` is the resolution knob**,
   not just a layout number — draw finer detail without raising it and the extra
   detail is thrown away at bake time.
2. **The sprite is forced square.** `createInjectedSVG` sets
   `sprite.width = sprite.height = size × 2`. Non-square art squashes. Only
   `House` overrides this, correcting to the 4:3 body from its JSON.
3. **Config numbers are half the on-screen size.** `maxSize: 46` draws at 92 px.
   Every `px` figure in `README.md` is the real on-screen number.

### Sizing: two different rules

| | Size comes from | Result |
| --- | --- | --- |
| **Combat mobs** | `randomInt(minSize, maxSize)` **per instance** | Two wolves side by side are deliberately different sizes |
| **NPCs & props** | the **body radius** in the JSON (`radius × 120 × 2`) | Fixed. Every talking NPC is 0.35 m → exactly 84 px |

For NPCs, the `maxSize` in the `npcs` block is *only* the bake resolution — it
does not affect layout. That is why the village Dog bakes at 45 but draws at 84
(i.e. it is currently a low-res dog).

---

## 2 · Replacing existing art — the cheap path

**Drop the new file in at the same path with the same name. That is the whole
job.** The `require()` resolves by path, so nothing else needs editing.

You do **not** need: a backend rebuild · `make cp-defs` · a schema change · any
edit under `api/`. **Frontend only.**

You **do** need:

- A build pass. `cd frontend && npm run start` picks it up on save (HMR);
  `npm run build` for production.
- **Possibly a size tweak.** If the new drawing carries different visual weight
  inside its box, adjust `minSize` / `maxSize` in the same `Graphics.ts` entry.
  This is the one thing a swap can legitimately require.
- Square canvas, transparent background, and the Portrait Rule for creatures.

### Three traps

- **Read the `Graphics.ts` entry, never the filename.** The two outright liars
  are gone — `boar.svg` (the Dodo) and `skeleton.svg` (the Mammoth) were deleted
  with the legacy roster at zone-editor C3 — but the mapping still isn't 1:1:
  the live Boar draws `wildboar.svg`, and `boar.svg` is now an unused name free
  to reclaim. Confirm the `file:` line before replacing anything.
- **Shared sprites change several things at once.** Replacing `hermit.svg`
  changes 4 NPCs; `signpost.svg` changes 4 objects (including the Ascension
  Stone and the Memorial); `campfire.svg` changes Campfire **and** Camp;
  `stone.svg` changes Boulder **and** Rock. Splitting one of those needs a new
  `Graphics.ts` entry plus a new class in `Mobs.ts`/`Resources.ts` — small, but
  more than a file drop.
- **`maxSize` caps your detail** (see §1).

---

## 3 · File formats: SVG and PNG

### Today

Everything the engine draws is **SVG** — 95 files. The five raster files in the
repo (`hunter.png`, two social icons, `loadingScreen.jpg`, `background.jpg`) are
start-screen chrome loaded via HTML `<img>` and CSS `background-image`. **None of
them goes through Pixi.**

### Can we use PNG?

**Almost certainly yes, but it is unverified on the game-object path** — and
since the art source is not SVG, this is the first thing to settle.

What is already true:

- **Webpack handles it.** `webpack.common.js` has a rule for
  `png|jpg|gif|eot|ttf|woff|woff2` → `type: 'asset'`. That is "auto": inline as a
  base64 data URI under ~8 kB, emit a separate cached file above it. Any
  realistically-sized portrait lands in the second bucket, which is what we want.
- **Pixi v8 loads raster textures natively.** `Assets.load` picks its parser from
  the URL/mime, and PNG is a first-class case.

What is **not** proven: no PNG in this project has ever been loaded through
`Assets.load`. I could not test it here — there is no Node or Docker on this
machine.

> ### ⚑ Run this first — 10 minutes, settles the whole format question
>
> 1. Drop a test PNG into `frontend/src/features/game-objects/assets/mobs/`.
> 2. In `Graphics.ts`, point one cheap mob at it — `turnip` is ideal (6
>    placements, tiny, harmless):
>    `file: require('../features/game-objects/assets/mobs/turnip.png'),`
> 3. `cd frontend && npm run start`, join the game, walk to the turnip field
>    south of the village.
> 4. Turnip renders → **PNG works, the format question is closed.**
>    Turnip missing + a console error → tell me the error and I'll write the
>    loader variant (§3.2). It is a small, contained change either way.

### 3.1 If PNG works — export rules

- **Export at ≥ 2× the drawn size**, and 2× again for high-DPI comfort:

  | Asset | Draws at | Export ≥ |
  | --- | --- | --- |
  | Turnip | 52 px | 104² |
  | Wolf | 92 px | 184² |
  | Bandit | 84 px | 168² |
  | Orc | 120 px | 240² |
  | OrcWarlord | 168 px | 336² |
  | House | 480 × 360 | 960 × 720 |

- **Square canvas, transparent padding.** The renderer forces square; the
  Portrait Rule's circular silhouette makes this natural anyway.
- **`minSize`/`maxSize` still control layout**, but no longer resolution — with a
  PNG the file's own pixel dimensions are the resolution. `maxSize` becomes
  layout-only for that entry.

### 3.2 If PNG does not load

`registerGameObjectSVG` passes `data: { width, height }` to `Assets.load`, which
is consumed by Pixi's **SVG** parser to rasterize at a chosen size. The raster
parser ignores it. If that extra argument confuses the loader, the fix is a
sibling function that omits it:

```ts
export function registerGameObjectImage(
    gameObjectClass: ISvgContainer,
    path: string | { default: string },
) {
    return registerPreload(
        Assets.load(htmlModuleToString(path))
            .then((texture: Texture) => { gameObjectClass.svg = texture; }),
    );
}
```

Roughly ten lines plus one call-site change per mob. Not a blocker.

### 3.3 Bundle size

With `type: 'asset'`, anything over ~8 kB is emitted as its own cache-friendly
file rather than inlined into the JS bundle — so a full raster set is fine.
Watch for *small* PNGs (decor, tiny icons) getting inlined as base64; if that
adds up, change the rule to `asset/resource` for the game-object directories.

---

## 4 · The four-layer medallion

**Target structure** (draw order bottom → top):

```
background   ← by type
portrait     ← by species
decor        ← by level / tier
border       ← by zone + level          ⟵ REPLACES the current tier ring
─────────────────────────────────────────
health bar · effect pips · nameplate · aura ring · interact badge
             ↑ these already live OUTSIDE the medallion and stay there
```

### What already exists

`Mob.initShape` (`Mobs.ts:397`) builds exactly this shape, one layer short:

```
group
├── actualShape (Container) ── the single sprite
└── tierFrame   (Graphics)  ── a ring drawn OVER it
```

So the composition pattern, the render order and a border-over-portrait are all
already there. **The tier ring is the thing your border art replaces** — per the
2026-08-15 ruling, `TIER_FRAME_STYLES` and `tierFrame` come out, and tier is
expressed by the **decor** layer instead.

The HUD elements listed under the line are already siblings drawn outside the
sprite, so they need no change — buffs, name, health and chat keep living
alongside the medallion exactly as they do now.

### ⚑ The fill-fraction rule — read this before drawing anything

**The code sizes an invisible square box; the art decides how much of that box
it occupies.** Those are two independent numbers, and every sizing surprise in
this project so far has come from changing the second one silently.

Every legacy placeholder SVG draws the same template circle — `r=210.333` on a
512 viewBox, or `r=32.491` on a 100 viewBox — i.e. **82% of its canvas**, with
transparent margin around it. Measured on 2026-08-17:

| Asset | old SVG | new PNG | on-screen change |
| --- | --- | --- | --- |
| farmer / player | 82% | 87.5% | 1.07× — imperceptible |
| bandit · marauder · stag · the 3 wolves | 82% | 92.2% | 1.12× |
| hermit | 82% | 99.6% | 1.21× |
| roundTree | **65%** (its crown is `r=32.491`) | 95.5% | **1.47×** |

Two consequences already paid for:

- **The tree needed a code change**, because its size was deliberately matched to
  the collider. `Tree`'s multiplier went `1.8 → 1.15` (`Resources.ts`), which is
  the only knob — `maxSize` does **not** size a raster (see §1).
- **The mob health bar sat at `size * 0.9`**, which lived in the old art's empty
  margin and lands *on* a full-bleed portrait. Now `1.08`, i.e. outside the box
  outright. The player's bar was already at `1.7` and needed nothing.

⚑ **Bigger than a placeholder is not automatically wrong.** Only the tree had a
reason to match its old size. Judge by eye; the numbers just tell you *why*
something moved.

### Wiring a medallion entity (3 lines)

`Mobs.ts` has `registerBorder` / `withBorder`. Per entity:

```ts
const stagBorder = registerBorder(GraphicsConfig.mobs.stag.borderFile, maxSize('stag'));
// inside the class:
override initShape(svg, x, y, size, rotation, anchor?) {
    return withBorder(super.initShape(svg, x, y, size, rotation, anchor), stagBorder, size);
}
```

Plus `file` + `borderFile` in `Graphics.ts`. The border goes on the **outer
group, never `actualShape`** — the damage flash is bound to `actualShape`, so a
frame inside it flashes red with the portrait. `Character` does the same thing
by hand because its avatar already sits in a group with the aura rings.

⚑ **Never rotate art to fix an orientation bug.** `Character` applied its facing
**twice** (once as the constructor's `rotation`, once via `setRotation`), summing
to 180°, and the old `player.svg` had been drawn upside-down to cancel it —
which hid the bug until the first correctly-drawn portrait arrived. Fixed
2026-08-17 (`PORTRAIT_ROTATION = 0`). Art is authored upright.

### What each layer needs to select itself

This is the part that needs planning, because the four selectors are **not**
equally available:

| Layer | Selector | Available now? | What's needed |
| --- | --- | --- | --- |
| **Portrait** | species | ✅ Yes | `entityType` already picks the sprite class. Works today. |
| **Decor** | tier / level | ✅ Yes | Both `tier` (0/1/2) and `level` are per-instance fields on the `Mob` wire table. |
| **Background** | type | ⚠️ Small backend job | The client catalog (`GET /mobs`) ships `curveLevel`, `tier`, `combatTarget`, `conversant` — **no faction or category**. Both exist in `api/mobs/*.json`; adding one server-derived field to the catalog follows the existing `combatTarget` precedent. |
| **Border** | zone + level | ❌ `level` yes, **`zone` does not exist client-side** | See below. |

### ⚑ The zone problem

`level` is fine — it's on the wire per instance. **Zone is not, anywhere.**

And it can't simply be added to the catalog, because **zone is a property of a
placement, not of a species**: there are 109 Wolves scattered across the map, and
Z1/Z2 are design labels inside a single `world` zone rather than engine objects.
A per-species "zone" field would be wrong for exactly the mobs that appear most.

Three ways out, cheapest first:

1. **Ship borders keyed on level bands only, for now.** Level already varies per
   placement and correlates strongly with region — the farm is low, the front is
   high. This works today with zero plumbing and is my recommendation for the
   first pass.
2. **Author zone regions client-side** (rectangles/circles in the zone JSON) and
   resolve a mob's zone from its spawn position. No wire change, moderate work.
3. **Add a per-spawn zone field** to the wire and the zone editor. Most correct,
   most work, and it wants a real zone system behind it.

**This is a PO call, not an art call** — but it determines how many border
variants are actually distinguishable in-game, so it's worth settling before you
draw a full set.

### Production rules for the layers

**The single most important one: every layer of a medallion exports at the same
canvas size with the same center.** The renderer anchors each sprite at
`(0.5, 0.5)` and scales it to the same box, so layers only line up if they share
a canvas. Draw them as a stack, export the stack.

- One shared canvas per medallion size class.
- Transparent everywhere except that layer's own marks.
- Test all four composited *and* the portrait alone — a portrait must still read
  if a layer is missing or fails to load.

### Implementation shape

Three contained changes:

1. **`Graphics.ts`** — the mob entry grows from `{ file, minSize, maxSize }` to
   `{ background, portrait, decor, border, minSize, maxSize }` (each optional
   except `portrait`, so mobs can migrate one at a time).
2. **`Preloading.ts`** — `registerGameObjectSVG` sets a single `.svg` field per
   class; needs a variant that loads a set into named fields.
3. **`Mobs.ts`** — `initShape` composes the stack in order; `TIER_FRAME_STYLES`
   and `tierFrame` are deleted.

### One lever worth knowing

The damage flash (`#BF153A` on hit) is applied to **`actualShape`**, not to the
whole group. So whichever layers you put *inside* `actualShape` flash red on hit,
and whichever are siblings of it do not. Recommended default: **portrait flashes,
border and background do not** — the frame stays stable while the creature
reacts. Cheap to change later; worth deciding when the layers land.

---

## 5 · Verification tail

After any art change:

```bash
cd frontend
npm run typecheck        # only if you touched Graphics.ts / Mobs.ts
npm test                 # vitest
npm run build            # prod build must pass
```

Then look at it in-game — the `playtest` skill gets a server up and hands you a
URL. For a mob, the fastest route is the dev cheats: `WARP <x·120> <y·120>` to
the spawn, or `GOD` first if it bites.

Checks that matter for art specifically:

- Does it read at its **smallest** rolled size, not just the largest?
- Does it survive the **damage flash** (`#BF153A` flood)?
- For anything in the tunnel or a cave — does it read under the **darkness
  overlay**? Test there, not on white.
- Elites and bosses: does it still work once the **tier signal** is on it?
- Console: 0 errors. A missing texture fails quietly into an invisible sprite.
