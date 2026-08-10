# Entity Medallions: the token as the base presentation of every actor

> **Status: DESIGN SKETCH 2026-08-10, nothing scheduled, nothing built.**
> Opened from PO concept art (a wooden ring in three ornamentation steps) and a
> PO statement of art direction: *"mobs are represented in the world, as
> currently, in medallions or similar to how tokens would be represented in 2d
> pen and paper games. that is a fundamental part of the visual identity."*
> The PO also said this **needs to be discussed heavily** before it is built,
> so this doc's job is to record what we have, what we want and what we know,
> not to schedule work. All numbers are [PLACEHOLDER].
>
> ⚑ This is an **art-direction** doc as much as a technical one. If it is
> ratified, `gdd.md` gains a line: the entity presentation is a token in a
> frame, and that outranks any per-feature rendering decision that contradicts
> it.

---

## 1. Why this doc exists

The question that started it was small: *can we give mobs a decorative border
per mob and tier?* The answer is yes and it is cheap. But the follow-up answer
changed the scope: the frame is not a tier decoration bolted onto mob art, it
is **how every actor in the world is drawn**. A portrait sits inside a circular
frame, the frame carries signal (tier today, faction or allegiance likely
tomorrow), and players get frames they can customize.

That is a different piece of work from a tier border. It touches `Mob`,
`Character` and `Corpse`, it re-prices the visual scale of every entity, and it
overlaps a plan that already exists (`plan-avatar-system.md`). Hence a plan doc
rather than a chunk.

---

## 2. What we have today

### 2.1 There is already a tier border, it is just a stroked circle

- The backend sends `Mob.tier` as a rank on every snapshot.
  `features/backend/logic/EntityManager.ts:101` forwards it to `setTier(rank)`.
- `features/game-objects/logic/Mobs.ts:55` holds `TIER_FRAME_STYLES`: Elite
  gets a 2 px silver stroke, Boss a 3 px gold one, alpha under 1.
- `Mobs.ts:417` (inside `initShape`) creates the `PIXI.Graphics` and records
  `tierFrameRadius = size`, the instance's own random roll between the species'
  `minSize` and `maxSize`.
- `Mobs.ts:431` (`setTier`) redraws only when the rank actually changes, so the
  30 snapshots per second cost nothing. That caching pattern survives this plan
  unchanged: a texture swap is exactly as cacheable as a redraw.
- **Normal tier is deliberately unmarked** (`Mobs.ts:53`): "a frame always means
  this one is above baseline". The medallion direction retires that rule on
  purpose, not by accident. Note it in the discussion.
- The rank numbering is pinned to the backend by `api/shared-constants.json` and
  `backend/cmd/aurad/shared_constants_test.go:161`, whose failure message
  already says the client draws tier frames off these ranks. **That pin stays
  valid and stays useful** after the swap.

### 2.2 How art gets on screen

- One SVG per species, preloaded once by
  `features/core/logic/Preloading.ts:52` (`registerGameObjectSVG`) into a static
  texture on the class, rasterized at `GRAPHICS_RESOLUTION × 2 × maxSize`
  (`BasicConfig.ts:77` has `GRAPHICS_RESOLUTION: 1` today).
- `createInjectedSVG` (`features/core/logic/InjectedSVG.ts:7`) makes the sprite,
  anchors it centrally and sizes it to `size * 2`.
- Per-species presentation config already lives client-side in
  `client-data/Graphics.ts:40`: `file`, `minSize`, `maxSize`, optional `anchor`.
  NPCs have their own block, read through `npcCfg` (`Mobs.ts:1355`). This is the
  precedent for a per-species frame table.
- Species metadata that the server owns reaches the client through the `/mobs`
  catalog (`backend/pkg/aura/items/mobs/catalog.go:24`): id, name, displayName,
  curveLevel, tier, combatTarget, conversant. The file documents itself as a
  **deliberately minimal projection** (`catalog.go:19`), which is an argument
  against casually adding presentation fields to it.

### 2.3 The three entity classes that would need medallions

| Class | Container shape today | Health bar | Notes |
| --- | --- | --- | --- |
| `Mob` (`Mobs.ts:406`) | `group = [actualShape, tierFrame]`, aura rings inserted lazily at index 0 | inside `shape` (`Mobs.ts:546`) | NPCs and conversants ride this class since the actor merge, but render on `resources.trees` and size from the wire radius |
| `Character` (`Character.ts:103`) | `group = [auraRings, actualShape]`, rings built eagerly | on the unfiltered overlay plate (`Character.ts:348`) | fixed size (`GraphicsConfig.character.size`), **one shared avatar texture for every player today** |
| `Corpse` (`Corpse.ts:19`) | a bare `GameObject`, no `actualShape` at all | none | a gravestone sprite on the `corpses` layer |

Neither `Mob` nor `Character` rotates: both override `setRotation` to a fixed
facing (`Mobs.ts:455`, `Character.ts:131`, the portrait rule from triage item
16). **A static frame is therefore always correctly oriented**, which is what
makes this direction cheap at all.

---

## 3. What we want

Recorded from the PO, verbatim intent:

- **D1. The medallion is the base presentation, not a tier decoration.** Every
  non-prop entity in the world is a portrait inside a circular frame, the way a
  token is drawn in a 2D pen-and-paper game. This is a fundamental part of the
  visual identity.
- **D2. Three ring variants, not four.** The concept art's first two images are
  the same ring; the first simply has a coloured disc behind it. So: bare ring,
  ring with vines, ring with vines and leaves.
- **D3. Leaves may carry an extra denomination on bosses.** The richest ring is
  free to mean "boss" specifically, or a step above boss.
- **D4. The disc behind the portrait carries a signal, axis to be determined;
  faction or allegiance is the likely candidate.**
- **D5. The loose coloured leaves carry a signal too, axis to be determined.**
  Explicitly not the difficulty palette by coincidence; the axis is an open
  design question.
- **D6. Player character frames are customizable.** Rings are part of what a
  player expresses about themselves.
- **D7. Specific NPCs may get custom or unique frames.** A named NPC can be
  visually distinguished by its frame alone.
- **D8. Scope is every non-prop entity**: mobs, NPCs, players, corpses, summons,
  tokens. Higher-fidelity or larger frames for bigger mobs, NPCs and players.
  Props and scenery are excluded.

---

## 4. The asset contract

This is the part that has to be right before any art is commissioned, because
every frame in the set must be interchangeable at any scale.

- **Square viewBox, ring centred, transparent background, no baked backdrop.**
- **The ring's OUTER circle sits at a fixed, documented fraction of the canvas,
  identical across all variants.** The vines and leaves overflow the ring, so
  the canvas edge cannot be the scaling reference. Pick one number (say outer
  diameter = 72 % of canvas [PLACEHOLDER]) and hold it. The sprite is then sized
  `mobSize * 2 / outerFraction`. If two variants disagree, the rings will not
  line up between tiers, and each entity's own `minSize`/`maxSize` roll
  multiplies the mismatch.
- **The ring's INNER circle is also a fixed fraction, identical across
  variants.** That circle is the portrait's usable area. If it differs per
  variant, a boss's art silently changes size relative to its own species.
- **The disc ships as a separate greyscale asset** so it can be tinted at
  runtime by whatever D4 resolves to, without a redraw per colour. PixiJS
  `sprite.tint` multiplies, so a greyscale gradient tints correctly.
- **Padding is a cost, not free space.** Transparent margin is still rasterized
  (see §5.4), so the decorations should be tight against the canvas edge.

---

## 5. What we know: the constraints and the landmines

### 5.1 The medallion must NOT live inside `actualShape`

`StatusEffect.forDamaged` scales `actualShape` from 1.1 to 0.8 and whitens it on
every hit (`StatusEffect.ts:135-136`). A frame parented there would squash and
flash with the portrait. The intended read is the opposite: the **portrait
squashes inside a stable frame**. So the disc and the ring are siblings of
`actualShape`, not children.

Corollary: at scale 1.1 the portrait briefly overflows the inner circle. Either
accept it (it reads as impact) or reduce the flash scale. A PO eyeball call.

### 5.2 The child-index arithmetic in `shape` is already fragile

Three different insert conventions coexist in `Mob`:

- aura rings: `this.shape.addChildAt(container, 0)`, lazily (`Mobs.ts:384`)
- the campfire dwell ring: `addChildAt(ring, Math.min(1, len))` (`Mobs.ts:776`)
- the health bar: plain `addChild`, so it lands on top (`Mobs.ts:546`)
- `initShape` itself appends `tierFrame` after `actualShape` (`Mobs.ts:417`)

Adding a disc that must sit **above the aura ring and below the portrait** will
break those assumptions silently: it will still render, just in the wrong order,
and only in the combination where the other consumer is present. `Character`
does it differently again (rings built eagerly in `initShape`,
`Character.ts:107`).

**Recommendation: replace the index arithmetic with named sub-containers**
(`belowArt`, `art`, `aboveArt`) as the first chunk, before any medallion art
lands. It is a small refactor and it is the difference between this plan costing
one bug and costing three.

### 5.3 Sizing: grow the medallion, do not shrink the art

Two ways to fit a portrait inside a ring:

- **Shrink the art** into the current footprint. Every `minSize`/`maxSize` pair
  in `Graphics.ts` was hand-tuned against the current look, so this silently
  re-tunes ~60 species at once and needs a species-by-species pass.
- **Grow the medallion** around the current art size, i.e. draw the frame at
  `size / innerFraction`. One constant, no retune, and the art keeps the pixel
  size the PO has already accepted.

**Recommendation: grow.** The consequences are bounded and each is one
expression: the overhead bar offset (`Mobs.ts:501`, `Character.ts:309`), the
nameplate offset (`Mobs.ts:241`), the character name and level offsets
(`Character.ts:155`, `Character.ts:176`), and the floating-number spawn spread
in `_GameObject.ts` (which reads `this.size`). Note that entities will occupy
more visual space relative to their **physics** radius, which is a separate
authored number (`body.radius`); that gap already exists and would widen.
Whether it widens too far is a PO feel call after the prototype.

### 5.4 Fill rate is the real cost, and it is the project's proven failure mode

A disc plus a ring on every entity is two extra full-size alpha quads per
entity. The earlier mobile regression was **fill rate**, not CPU
(`MOBILE_MAX_RESOLUTION = 2`, `Game.ts:48`, and the standing "mobile perf
ceiling" item in CLAUDE.md). The medallion makes every entity's rasterized
footprint larger by `1 / innerFraction` squared, roughly a doubling at an inner
fraction around 0.7.

Mitigations, cheapest first: tight transparent padding · one shared texture per
variant (already how `registerGameObjectSVG` works) · tint rather than
duplicate the disc · consider whether the disc can be a `Graphics` circle
instead of a texture when no gradient is wanted.

**A headless framerate number does not settle this.** The project has already
recorded that headless perf transfers only as ratios. A real-phone check is an
exit criterion, not a nice-to-have.

### 5.5 The catalog race, if the frame is looked up per species

`setTier` and `setMobId` both early-return on an unchanged value
(`Mobs.ts:154`, `Mobs.ts:444`). A frame lookup that misses because the `/mobs`
fetch has not resolved yet would therefore **never retry**. The nameplate has
the same latent hole today; it is invisible because the catalog loads before
anyone joins. A per-species frame source must either be client-local (no fetch,
no race) or carry an explicit re-resolve.

### 5.6 "Every entity" collides with the fixtures

`Mob` is not only mobs. Campfires, braziers, poison pools, brambles, rockfalls
and spike barricades are all `MobDefinition`s riding the same class. A poison
pool in a portrait medallion is almost certainly not what D8 means.

**Proposed rule, needs a PO call:** medallions go on anything the nameplate
predicate already accepts, `combatTarget || conversant`
(`Mobs.ts:167`), plus summons (companions, totems). That predicate is
server-derived and already exists, so it costs nothing to reuse. Fixtures,
hazards and obstacles keep bare art.

### 5.7 The `Corpse` question

The PO ticked corpses, but a corpse is a **gravestone** sprite, not a portrait
of the dead character (`Corpse.ts:19`). Two readings: a gravestone inside a
ring (cheap, consistent), or the dead character's own portrait greyed out
inside a broken ring (much stronger, and it needs the corpse to carry the
avatar id it does not carry today). Design question, recorded not answered.

### 5.8 If leaves ever become a real fourth rank

Ornamentation reserved for bosses is **free**, purely client-side. A genuine
fourth tier is not: it costs a `TierRank` member on both sides
(`items/mobs`, `client-data/Mobs.ts:16`), the `api/shared-constants.json` pin,
the mob authoring vocabulary and a content pass over existing bosses. Worth
having on the table during the discussion, because the two look identical in
the concept art.

---

## 6. Where the frame choice comes from

Two routes for "which frame does this entity get", and they can coexist (a
client table with a catalog override, or the reverse):

**Route A - a client table in `client-data/Graphics.ts`.** Keyed by tier, with
per-species overrides for D7's custom NPCs. Zero backend change, no fetch, no
race, and it sits next to the `file`/`minSize`/`anchor` config that already
describes per-species presentation. This is the KISS v1.

**Route B - authored in the mob JSON and served through `/mobs`.** More honest
for content authors and it keeps a species' presentation in one file. Costs a
field on `CatalogEntry` against that file's explicit "minimal projection"
stance, and it inherits §5.5's race.

Whatever D4 and D5 resolve to may force route B anyway: **faction is not on the
wire and not in the catalog today**. If the disc tints by faction, that fact has
to reach the client somehow, and the catalog is the cheap place for it (it is
per-species and constant after boot, exactly like tier). If it tints by aura
category instead, that is already on the wire and already consumed
(`Mobs.ts:376`), so it is free.

---

## 7. Relationship to `plan-avatar-system.md`

D6 (customizable player rings) is **structurally the same lane** as the avatar
plan, which is already designed and unscheduled: a per-account set of unlocked
cosmetic ids, one active id riding on `Character` so other clients render it,
and an id → texture map on the client.

**Do not design a parallel mechanism.** A player's frame is a second cosmetic id
beside `avatar_id`, unlocked through the same milestone/kill triggers, persisted
by the same account-side table, and picked in the same UI. That means:

- the ring customization chunk here is **blocked on the avatar plan's
  decisions**, not on this doc's;
- the avatar plan's wire and schema cost roughly doubles (two ids, not one) and
  its §3 catalog gains a second content directory or a second entry kind;
- conversely, this plan's mob and NPC chunks are **not** blocked on it at all.

Both docs need a cross-link when this one is ratified.

---

## 8. Schema impact

| Layer | Impact |
| --- | --- |
| **Database** | **NONE** for everything except player-frame customization, which persists an id per account and lands in `plan-avatar-system.md`'s schema, not this one |
| **FlatBuffers** | **NONE** for the mob, NPC, corpse and summon work: tier is already on the wire and species is already resolvable from `mob_id`. A player frame id is one appended field, on the avatar plan's account |
| **`/mobs` catalog JSON** | unchanged under route A; one added field under route B or if the disc tints by faction |
| **conf.json** | NONE |

---

## 9. Provisional chunk breakdown

Deliberately provisional: the PO wants the design discussed first, and D4/D5
can move the order.

- **C0 - the contract and the plumbing.** The asset contract written down and
  one commissioned test frame set. The named sub-container refactor from §5.2.
  A single prototype species wearing a medallion, behind nothing, for the PO to
  look at in-game. Nothing else changes. *Schema: none.*
- **C1 - mobs and NPCs.** The three ring variants driven by tier, the disc with
  whatever D4 resolved to, the fixture predicate from §5.6, the sizing change
  from §5.3 and its four offset consequences. Exit criterion includes the real
  phone. *Schema: none, unless D4 is faction (then one catalog field).*
- **C2 - player characters.** `Character` gets the same treatment; note it has
  its own container layout and its bar lives on the overlay plate, so it is not
  a copy-paste of C1. A single default frame for everyone. *Schema: none.*
- **C3 - corpses and summons.** Small, and it depends on §5.7's answer.
  *Schema: none.*
- **C4 - customization.** D6 and D7's unlockable and per-NPC frames.
  **Blocked on `plan-avatar-system.md`.** *Schema: lands in that plan.*

---

## 10. Test strategy

- **vitest** for the pure sizing maths: outer and inner fraction to sprite size,
  and the offset derivations. This is exactly the kind of formatting-and-numbers
  unit the existing vitest setup covers, and it is where a fraction mismatch
  between variants would be caught.
- **A registry-style pin** that every declared frame variant resolves to a
  loaded texture, so a typo'd frame name fails loudly rather than rendering an
  invisible sprite. The project has been bitten by silent-wiring three times.
- **The `verify` skill's Playwright smoke** for presence: join, stand next to a
  normal, an elite and a boss, assert three distinct frames are on screen. Note
  that this proves presence, not correctness of the art.
- **A real-phone fill-rate check as C1's exit criterion.** Non-negotiable per
  §5.4; headless numbers transfer only as ratios.
- **Screenshots for the PO at C0 and C1**, since most of what this plan changes
  is not assertable.

---

## 11. Open questions for the discussion

1. **D4's axis**: what does the disc colour mean? Faction is the PO's likely
   candidate and costs one catalog field; aura category is free; difficulty is
   free but changes as *you* level rather than as the mob changes.
2. **D5's axis**: what do the coloured leaves mean, and is it the same axis as
   the disc or a second one? If they are the same, one signal is drawn twice,
   which is redundancy rather than information.
3. **§5.6**: does "every entity" include the fixtures, hazards and obstacles?
   Proposed answer: no, use the existing `combatTarget || conversant` predicate
   plus summons.
4. **§5.7**: gravestone in a ring, or the dead character's greyed portrait?
5. **§5.3**: grow the medallion (recommended) or shrink the art?
6. **§5.8**: are the leaves boss ornamentation (free) or a fourth rank (not
   free)?
7. **§6**: route A or route B for frame selection, and does D7's custom-NPC
   frame change that answer?
8. Does the loose-leaf **animation** in the concept art ship, or are the leaves
   static? Animation is per-entity ticking work and is deliberately out of scope
   until asked for.
9. Does the medallion apply on the **minimap** icons too, or only in world?
   Today those are flat `Graphics` circles (`Character.ts:288`).
