# Medallion asset spec - what the artist delivers

> **Status: CONTRACT DRAFT 2026-08-20 · REVISED 2026-08-22 (artist feedback
> round 1).** Companion to `pipeline.md` (how art gets on screen) and the
> design doc `../plan-entity-medallions.md` (why the layers exist and what
> each one means; the feedback decisions are D16-D18 there). This file is
> the **artist-facing contract**: if a committed file follows every rule
> here, it will composite correctly in-game with zero code negotiation.
> Written before implementation on purpose, so art can start first.
>
> 2026-08-22 changes, from the artist's read of the draft: the **rim moved
> to the very bottom of the stack** (§1) · the circle **proportions are now
> artist-led**, measured from the pilot and only then frozen (§3) · the
> artist **works directly in this repo**, no file hand-off (§5) · **no
> per-family source files**, the artist keeps one master file (§5).
>
> §3's circle numbers stay open until the pilot (§8) locks them.
> **Everything else is decided.** After pilot sign-off the measured numbers
> are recorded in §3, and from then on no file may deviate from them.

---

## 1. The mental model (read this first)

The renderer stacks each medallion layer as its own image, anchored at the
**center**, scaled into the **same square box**. It never repositions a
layer. Therefore:

- **Every layer of the medallion set shares ONE canvas: 512 × 512 px,
  transparent background, common center.** Draw the layers as a stack in one
  source file, export each layer separately at full canvas size.
- Position on the canvas IS position in the game. If the ring is drawn 4 px
  off-center, it renders 4 px off-center under every portrait in the game.
- On-screen size is the code's business, not the art's. Entities draw at
  roughly 60–160 px today; 512 px source downscales cleanly. Do not try to
  compensate for on-screen size in the art.

The layers, bottom to top (game meaning in parentheses; full design:
plan doc §3):

| # | File role | Meaning | Varies by |
| --- | --- | --- | --- |
| 1 | rim | tier ornamentation (elite / boss) | per family × 2 |
| 2 | disc | allegiance background, tinted by code | one file total |
| 3 | portrait | the creature | existing art, NOT part of this delivery |
| 4 | ring | border material (faction family) | per family |
| 5 | addition | subtype marks, e.g. beast horns | universal, per subtype |
| 6 | decoration | species dressing, e.g. spider webs | universal, per species that has one |

**The rim sits at the very BOTTOM of the stack** (artist call, 2026-08-22):
its ornaments emerge from behind the medallion. Anything a rim draws inside
the medallion's own area is hidden by the opaque disc and ring above it, so
inward overlap is harmless (just wasted pixels); the visible mass lives
outside the ring.

Decisions behind this table (PO 2026-08-20): rims are drawn **per family**
(the ornaments grow out of the ring's material, wood ring gets leaf rims);
additions and decorations are drawn **once, universally**, and must sit
acceptably on every family's ring. Normal tier has **no rim file at all**:
a bare ring means a normal mob, ornamentation means elite or boss.

---

## 2. Canvas and format rules (all files)

- **512 × 512 px, PNG-24 with alpha (RGBA), sRGB.**
- **Transparent background. No baked backdrop, no baked drop shadow** that
  assumes a ground color; the medallion floats over arbitrary terrain.
- **Common center**: the ring's center is the canvas center, exactly.
- **Author upright.** Never pre-rotate art to fix an orientation; the
  renderer draws everything unrotated (this has bitten before, see
  `pipeline.md` §4's rotation warning).
- Padding is a cost, not free space: transparent margin still rasterizes.
  The overflow zone (§3) is the only intentional margin.

---

## 3. The three shared circles [artist-led; numbers recorded after the pilot]

Three concentric circles on the shared canvas govern every file:

| Circle | Diameter | Purpose |
| --- | --- | --- |
| **Outer ring edge** | *artist's call in the pilot* | where the ring band ends; the scaling reference for the whole set |
| **Inner ring edge = portrait window** | *artist's call in the pilot* | the disc's size and the area the portrait is scaled into |
| **Canvas edge** | 512 px, fixed | hard limit; everything between the outer ring edge and the canvas edge is the **overflow zone** for rims, horns and webs |

The contract prescribes **no proportions** (rev 2026-08-22; the draft's
percentage table confused more than it fixed). Draw the pilot so it looks
right. After PO sign-off we measure the two circles in the delivered set,
record the pixel values in this table, and from then on they are frozen:
every later family must use the same two circles. Leave enough overflow
zone for the biggest ornament you ever want to draw; the canvas edge is a
hard cut.

Rules that hang off the circles (these hold regardless of the numbers):

- **Identical across every family and every variant.** If two family rings
  disagree on the outer fraction, tiers stop lining up between species and
  each mob's own size roll multiplies the mismatch. This is the single most
  load-bearing rule in the contract.
- **The ring band (between inner and outer edge) must be opaque at its inner
  edge**, full 360°. The portrait is square art scaled into the circular
  window, so its corners tuck under the ring; a gap or translucent stretch in
  the band shows portrait corners.
- **Nothing except the ring and disc may enter the portrait window**, with
  one exception: a decoration (webs) may deliberately overlap the window's
  outer rim by a small amount [PLACEHOLDER: pilot decides how much reads
  well]. Faces must never be obscured.
- Overflow elements (leaves, horns) live in the overflow zone and may touch
  but not cross the canvas edge.

---

## 4. Per-layer rules

### 4.1 `disc.png` (one file, ever)

- A filled circle, diameter = the portrait window.
- **Greyscale only.** The code tints it at runtime (allegiance red / green /
  blue etc.); PixiJS tint multiplies, so pure luminance tints correctly.
  Authoring any hue bakes a color error into every tint.
- A subtle radial gradient is welcome (it survives tinting); mid-grey to
  light works better than pure white for keeping tints saturated.

### 4.2 `ring_<family>.png` (one per border family)

- The border band between inner and outer edge, in the family's material
  (wood, leather, ...). Texture detail free within the band.
- Opaque inner edge (§3). Small material irregularities crossing the outer
  edge into the overflow zone are fine (bark chips, stitching); the band's
  *nominal* circles stay on the shared §3 geometry.

### 4.3 `rim_<family>_elite.png` / `rim_<family>_boss.png`

- Tier ornamentation grown from that family's ring material (wood: leaves).
- Renders at the very bottom of the stack (§1): draw it to read as emerging
  from **behind** the medallion. Its visible mass lives in the overflow
  zone; inward overlap disappears behind the disc and ring.
- Boss must read as strictly "more" than elite at 80 px on-screen size, not
  just different. Squint test: if elite and boss are indistinguishable at
  thumbnail size, the layer fails its purpose.
- Delivered per family; a family is not complete without both.

### 4.4 `addition_<subtype>.png` (universal)

- Subtype marks (first one: `addition_beast.png`, the horns).
- Must sit acceptably on **every** family ring, so: attach at consistent
  clock positions on the band (the mockup's horns at ~11 and ~1 o'clock),
  neutral enough in material to not clash with wood or leather.
- Keep clear of the rim ornaments' primary positions [PLACEHOLDER: pilot
  establishes the clock-position convention, e.g. rims own 4–8 o'clock,
  additions own 10–2].

### 4.5 `decoration_<species>.png` (universal, topmost)

- Species dressing (first one: `decoration_webs.png`), drawn ON TOP of the
  ring, may overlap slightly into window and overflow zone (§3).
- Only some species get one; absence is the norm.

### 4.6 Portraits: explicitly NOT in this delivery

Existing portraits stay untouched (PO 2026-08-20); the code scales the
current full-bleed square art into the portrait window. Future portraits
keep the existing portrait contract (square canvas, transparent, art filling
~90 % of it, authored upright). Nothing here changes portrait authoring.

---

## 5. Naming and repo placement

- Files named exactly as in §4: `disc.png`, `ring_wood.png`,
  `rim_wood_elite.png`, `rim_wood_boss.png`, `addition_beast.png`,
  `decoration_webs.png`. Lowercase, underscores, family/key names agreed
  before drawing (family list is still open, plan doc D10; only the pilot
  family's name needs agreement now).
- **The artist works directly in this repo** (rev 2026-08-22; the draft's
  hand-the-files-to-devs posture was wrong). Exported PNGs are committed
  straight to `frontend/src/features/game-objects/assets/medallion/`.
  The §6 checklist is the pre-commit gate. The renderer-side wiring
  (resolver, bake, config keys) lands via the plan's C-chunks; until C1
  exists, committed assets simply wait in that directory.
- **Source files are NOT a deliverable.** The artist keeps their own
  master file (one file covering all mobs/NPCs, their existing workflow);
  the repo never sees it, and nothing is duplicated per family. The circle
  guides live in that master file.
- Because no source lives in the repo, **this spec is the repo-side ground
  truth**: once the pilot locks the circle numbers they are recorded in §3,
  and every later delivery is checked against §3, not against a source
  file.

---

## 6. Self-check before committing (the artist's checklist)

1. Every PNG is 512 × 512, RGBA, transparent background.
2. The three circles are centered and match the master file's guides
   (after the pilot: the recorded numbers in §3).
3. Ring inner edge opaque all the way around.
4. Composite test A: each rim (bottom) + disc + a portrait + ring +
   addition + decoration, stacked in that order. Nothing misaligned, face
   unobscured.
5. Composite test B: each universal overlay on **every** delivered family
   ring, not just the one it was designed against.
6. Composite test C: ring alone over the disc (a normal-tier mob with no
   subtype); must look complete, not unfinished.
7. Thumbnail test: the full stack at ~80 px; elite vs boss still
   distinguishable, ring material still readable.

---

## 7. What the artist does NOT need to wait for

Recorded so nobody blocks on the wrong thing:

- **On-screen sizing** (plan doc D15, open): changes how big medallions draw,
  never how they are authored. The shared circles decouple the two.
- **Allegiance colors**: the disc is greyscale; colors are a code-side tint
  decision, changeable any time without a redraw.
- **Family membership** (which factions share which family, D10): affects
  how many families get drawn *eventually*. The pilot family needs no such
  decision.
- **Tier leaf counts / boss extra denomination** (D3): "elite" and "boss"
  are the only two rim states; how many leaves each uses is the artist's
  composition call within the "boss reads as more" rule.
- All implementation chunks C0–C5. Art delivery and code land independently;
  the contract is the interface.

---

## 8. The pilot (first delivery)

One family of the **artist's choice** (PO 2026-08-20), full layer coverage:

- `ring_<family>.png`, `rim_<family>_elite.png`, `rim_<family>_boss.png`
- `addition_beast.png`, `decoration_webs.png` (the two universal overlays)
- `disc.png`
- two composites against real existing portraits (e.g. wolf and giant
  spider, artist's pick) at full size and at ~80 px; exported mockups are
  fine, in-game once C1's renderer exists is even better

The pilot's job is to **lock the §3 circle numbers and the §4.4
clock-position convention**. PO signs off on the composites; after sign-off
the delivered set is measured, the numbers are recorded in §3 and frozen,
and further families are mechanical. Expect exactly one revision loop on
the proportions; that is what the pilot is for.
