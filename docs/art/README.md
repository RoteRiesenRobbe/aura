# Art assets — the brief

**What every asset in the game has to be and survive.** The *list* of assets is
[`assets.csv`](assets.csv) (read it as [`assets.md`](assets.md)); this file is
the standing brief that list is judged against, and it changes rarely.

Counts, sizes and wiring below were generated 2026-08-15 from the shipped data and
client code: `api/mobs/`, `api/props/`, `api/zones/`, `client-data/Graphics.ts`,
`features/game-objects/`, `features/ground-textures/`. Identity, placement and tone
come from `gdd.md` §10, `content-mobs.md`, `content-npcs.md`, `content-lore.md`, the
two zone docs, and the portrait checklist in `manual-content-authoring.md` §4.

Legacy Berryhunter content is excluded and parked in an appendix at the bottom —
don't draw it.

> ⭐ **New 2026-08-20, rev 2026-08-22: the medallion layer set has its own
> delivery contract, `medallion-asset-spec.md`** (512×512 shared canvas,
> per-family rings and rims with the rim at the bottom of the stack,
> universal overlays, the greyscale disc, and the pilot whose measured
> proportions become the frozen circle numbers; the artist commits assets
> directly into the repo). It is designed to be drawable NOW, before any
> implementation; start there if you are working on medallions. Design
> rationale: `../plan-entity-medallions.md`.

---

## ⭐ The Portrait Rule — governs every creature

The project's binding art direction (GDD §10 + `manual-content-authoring.md` §4).
It's easy to get wrong because it contradicts what "top-down game" implies:

> **The *world* is top-down. The *entities* are not.**
> Players, NPCs and mobs render as **portrait icons** — a bust looking *at the
> viewer* — not as creatures seen from above.

Every creature/humanoid asset must tick all of these:

- **Circle silhouette** — reads as a round icon: face-in-circle, or a bust filling
  a circular footprint.
- **Front-facing** — looks *at* the viewer, never down from above.
- **No directionality** — no pointing pose, no top-down body axis.
- **Never rotated at runtime.** `Mob.setRotation` and `Character.setRotation` are
  deliberate no-ops that discard the wire heading and hold a fixed downward facing —
  the local player included. Don't design art that relies on rotation.

**Inanimate props and hazards are exempt** — pools, campfires, barricades, trees,
rocks, buildings.

Reference files: `wolf.svg`, `wildboar.svg`, `bear.svg` (the same three the
manual's §4 names).

## Art direction & tone (GDD §10)

- **No pixel art.** **Fully top-down world** — not 2.5D, not isometric.
- **Low-poly**, icons for abilities, portraits for players/NPCs.
- **References:** Hotline Miami, Gods Trigger, Monaco, Rimworld, Gothic 1+2.
- **Tone — the Gothic register:** gritty, grounded, unglamorous. Dirty and
  matter-of-fact, not high-fantasy pathos. NPCs are workers, guards and scoundrels;
  nobody proclaims destiny. Signs are practical or worn, never ornate. Environmental
  storytelling favours the shabby and specific — a collapsed fence, a poacher's camp,
  a fresh grave — over the mythic. Holds at every stage, including late content.
- **Why it matters more than usual:** there is **no quest log and no map markers**.
  The world communicates through NPC speech, clue anchors, and *what places look
  like*. Environmental readability is load-bearing here.

## Scale

The world is in **meters**; the client draws at **120 px per meter**.

- One screen = **20 × 12 m** = **2400 × 1440 px**. About five trees fit across it.
- The whole world is 144 × 72 m. Player = 60 px, Wolf 76–92 px, House 480 px,
  world boss 168 px.
- **All `px` figures in the tables below are real on-screen pixels at zoom 1.**
  ⚠️ The numbers in `Graphics.ts` are *half* these — the renderer doubles them.
- **Mostly SVG, and that is changing.** The medallion spike shipped the first
  raster art (`farmer.png`, `npcBorder.png`, both 256×256); painted work ships as
  PNG from here on, because an SVG export of a painting only ever wrapped an
  embedded raster anyway. See `pipeline.md` §3.
  Non-square drawings get squashed unless the code corrects for it (only `House` does).
- **Combat mobs roll a random size per instance** inside their range, so two wolves
  side by side are deliberately different sizes. Design for the range.
- **NPCs and props size from their body radius in the JSON**, not from a config
  number — which is why every talking NPC is exactly 84 px.

## Rendering constraints new art must survive

- **The darkness overlay** — 35 dark zones. Spiders, kobolds, the poison pool and
  the rockfall live under an alpha mask with soft light holes. Test against the
  overlay, not on white.
- **The damage flash** — every sprite gets flooded with `#BF153A` on hit. Art
  already sitting near that red loses its hit feedback.
- **Tier rings** — silver on elites, gold on the boss, drawn *over* the sprite.
  Don't build those colours into an outline. (⚑ Scheduled for replacement by the
  medallion rim layer, `medallion-asset-spec.md` §4.3; the constraint stands
  until that ships.)
- **Rotation — almost nothing rotates.** Creatures never do. Trees, rocks and
  buildings all sit at rotation 0, so each is only ever seen at one angle (a rock's
  shadow can safely be baked in). Only the **ground decals** (authored rotation +
  flip) and the **tree ground spot** (random) rotate.
- **The land colour is `#006030`**, a dark green. Everything sits on it.

## Where the value is concentrated

The world is not evenly populated. One tree, one rock and one wolf are most of what
a player ever looks at.

| Asset | Count | Share |
| --- | --- | --- |
| Tree | 573 | 74 % of all props |
| Sand ground decal | 372 | 69 % of all terrain |
| Boulder + Rock (one SVG) | 168 | 22 % of all props |
| Wolf | 109 | 22 % of all mob spawns |
| Boar | 58 | 12 % |
| DireWolf | 43 | 9 % |
| House | 12 | the entire village |

## Legend

`⚠ shared` = renders using another entity's art; needs its own to exist as a
distinct thing. `⭐` = unusually high stakes, see the note. **#** = placements in
the live world (`player` = summoned, `enc.` = encounter-spawned).

---

# The worklist moved

⭐ **The 108 tickable rows that used to live here are now
[`assets.csv`](assets.csv)**, rendered for reading as [`assets.md`](assets.md).
This file keeps the **brief** — the Portrait Rule, the tone register, scale, and
the rendering constraints above — which is what every row in the tracker is
judged against. It is no longer a worklist.

Why the split (2026-09-16): the tracker has to be **shareable with artists and
musicians who do not have the repo**, so it is a CSV that imports straight into
Google Sheets, with `owner` and `status` columns for them to fill. It also grew
past art — animation and audio rows live there too. A markdown table could do
neither job.

The tracker also closes a hole this file had: it was generated **2026-08-15** and
therefore predates **every ground- and air-painting primitive** — world paths
(2026-09-07), zone polygons (2026-09-10), atmospheres and clearings (2026-09-16).
It has no rows at all for terrain-profile textures or atmosphere textures, which
is most of what the world is painted with today.

```
node tools/asset-tracker.mjs            # regenerate assets.md from assets.csv
node tools/asset-tracker.mjs --check    # fail if assets.md is stale
node tools/asset-tracker.mjs --stats    # counts only
```

⚑ **The counts in "Where the value is concentrated" above are from 2026-08-15**
and the world has been re-authored since (772 props / 494 terrain pieces at HEAD,
against the 537 that table was built on). Treat the shape of the argument as true
and the numbers as indicative; `assets.csv` carries the current ones.

---

# Appendix · Legacy — deleted, nothing to draw

The inherited Berryhunter roster is **gone as of zone-editor C3** (`e9a0894c`,
2026-08-16), which retired all 10 legacy mobs (Dodo · SaberToothCat · Mammoth ·
AngryMammoth · Rabbit · Healer · Brazier · ProvingBoss · ProvingGuard ·
ProvingAdd), the `proving-grounds` zone, and their 13 asset files.

This inventory was generated the day before, so read it with three corrections:

1. **The two mis-wired filenames no longer exist.** `boar.svg` (which drew the
   Dodo) and `skeleton.svg` (the Mammoth) were deleted with the roster. The
   cleanup this appendix asked for happened.
2. **`boar.svg` is a free name now.** The live Boar still draws `wildboar.svg`;
   reclaiming the good name is a one-line `Graphics.ts` change plus a file
   rename, and is worth doing whenever the Boar's art gets redrawn.
3. **The upper size reference moved.** `AngryMammoth` was the 440 px outlier;
   with it gone the live ceiling is what §Scale already states — world boss
   168 px, House 480 px, and no mob above 180 px.
