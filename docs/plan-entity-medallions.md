# Entity Medallions: the token as the base presentation of every actor

> **Status: DESIGN SKETCH 2026-08-10 · REVISED 2026-08-20 (PO mockup session)
> · REVISED 2026-08-22 (artist feedback round 1, D16-D18), nothing scheduled,
> nothing built beyond the shipped border pattern.**
> Opened from PO concept art (a wooden ring in three ornamentation steps) and a
> PO statement of art direction: *"mobs are represented in the world, as
> currently, in medallions or similar to how tokens would be represented in 2d
> pen and paper games. that is a fundamental part of the visual identity."*
> The 2026-08-20 session added a PO mockup that decomposes the token into named
> layers (the `Token_*` vocabulary in §3) and settled six of the open design
> questions; the revised decisions are D9–D15. The artist's 2026-08-22 read of
> the delivery contract settled three more (D16-D18: rim at the bottom of the
> stack, artist-led proportions, in-repo delivery). All numbers are
> [PLACEHOLDER].
>
> ⚑ This is an **art-direction** doc as much as a technical one. If it is
> ratified, `gdd.md` gains a line: the entity presentation is a token in a
> frame, and that outranks any per-feature rendering decision that contradicts
> it.
>
> ⚑ Line refs re-verified 2026-08-20 against HEAD; the 2026-08-10 refs had
> already drifted once (the art overhaul moved `Mobs.ts` around), so re-verify
> again before executing.

---

## 1. Why this doc exists

The question that started it was small: *can we give mobs a decorative border
per mob and tier?* The answer is yes and it is cheap. But the follow-up answer
changed the scope: the frame is not a tier decoration bolted onto mob art, it
is **how every actor in the world is drawn**. A portrait sits inside a circular
frame, the frame carries signal (faction, tier, subtype, allegiance), and
players get frames they can customize.

That is a different piece of work from a tier border. It touches `Mob`,
`Character` and `Corpse`, it re-prices the visual scale of every entity, and it
overlaps a plan that already exists (`plan-avatar-system.md`). Hence a plan doc
rather than a chunk.

---

## 2. What we have today

### 2.1 The composition pattern is already shipped

The art overhaul (2026-08-15/17, `docs/art/pipeline.md` §4) landed the
portrait-in-border pattern for real:

- `Mobs.ts:60` `registerBorder(borderFile, size)` and `Mobs.ts:67`
  `withBorder(group, border, size)` wrap an entity's shape in a border sprite.
  Six mobs (Wolf, Stag, EliteWolf, Bandit, Marauder, DireWolf) and two NPCs
  (Farmer, Hermit) wear it today; `Character` does the same by hand
  (`Character.ts:37` static `border`).
- The border goes on the **outer group, never `actualShape`**, because
  `StatusEffect.forDamaged` scales and floods `actualShape` on every hit. The
  intended read: the portrait squashes inside a stable frame.
- Assets are mixed SVG/PNG; the PNG question is settled and shipped
  (`assets/border/*.png` exists). One texture per species via
  `Preloading.registerGameObjectSVG`, shared by all instances.
- The fill-fraction rule and its two paid consequences (tree multiplier, health
  bar moved from `size*0.9` to `size*1.08`) are documented in
  `docs/art/pipeline.md` §4. **The code sizes an invisible square box; the art
  decides how much of it it occupies. These are two independent numbers.**

### 2.2 The tier ring is still a stroked circle

- The backend sends `Mob.tier` on every snapshot; `setTier` (`Mobs.ts:452`)
  redraws a `PIXI.Graphics` circle only when the rank changes.
  `TIER_FRAME_STYLES` (`Mobs.ts:85`): Elite silver, Boss gold.
- **Normal tier is deliberately unmarked**: "a frame always means this one is
  above baseline". D12 (2026-08-20) **keeps** this rule inside the new art;
  the 2026-08-10 sketch's note that the medallion direction retires it is
  superseded.
- The rank numbering is pinned to the backend by `api/shared-constants.json`
  and `backend/cmd/aurad/shared_constants_test.go`. That pin stays valid and
  stays useful after the swap to leaf ornamentation.
- Per the 2026-08-15 pipeline ruling: `TIER_FRAME_STYLES` and `tierFrame` come
  **out** when the medallion lands; tier moves to the rim-ornamentation layer.

### 2.3 What the client knows per mob, and from where

Two sources, cleanly split:

- **Per-tick wire** (`api/schema/server.fbs:150` `table Mob` →
  `GameStateMessage.ts` → `EntityManager.ts` → typed setters in
  `WireSetters.ts`): `mob_id`, `level` (effective per instance), `tier`,
  `health`/`max_health`/`shield_hp`, `applied_effects` (the pip bitmask),
  `aura_category` (the ring bitmask), radii, damage/heal events, position.
- **Fetched catalog** (`GET /mobs`, `catalog.go`, fetched once at module
  import by `client-data/Mobs.ts`): `id, name, displayName, curveLevel, tier,
  combatTarget, conversant`. `catalog.go:19` calls itself a **deliberately
  minimal projection** (zero-hint policy on drops/resistances/HP); every added
  field is a deliberate exception, `combatTarget` being the sanctioned
  precedent.
- **Not available client-side at all**: faction, hostility/allegiance, any
  subtype. Confirmed on the wire table, in the catalog and by grep; the only
  faction strings the client ever sees are skill-tooltip display names.
- ⚑ Two distinct "status effect" concepts on the wire: `status_effects` is a
  vector of per-tick VFX **events** (damage flash etc.); `applied_effects` is
  the ubyte **state** bitmask that drives the pips. The medallion's "status
  effects" row means the latter. Both `applied_effects` and `aura_category`
  are **full** (8/8 bits used, `AuraRings.ts:23`).

### 2.4 The three entity classes that would need medallions

| Class | Container shape today | Health bar | Notes |
| --- | --- | --- | --- |
| `Mob` (`Mobs.ts:427` `initShape`) | `group = [auraRings?, actualShape, border?, tierFrame, overheadBar]`, rings inserted lazily at index 0 | inside `shape`, anchored `max(30, size*1.08)` (`Mobs.ts:510`) | NPCs and conversants ride this class since the actor merge, but render on `resources.trees` and size from the wire radius |
| `Character` | `group = [auraRings, actualShape(+avatar+border)]`, rings eager | on the unfiltered overlay plate at `size*1.7` | fixed size, one shared avatar texture for every player today |
| `Corpse` (`Corpse.ts:19`) | a bare `GameObject`, no `actualShape` | none | a gravestone sprite on the `corpses` layer |

Neither `Mob` nor `Character` rotates (both `setRotation` overrides are no-ops,
the portrait rule from triage item 16). **A static frame is therefore always
correctly oriented**, which is what makes this direction cheap at all.

### 2.5 The overlays that stay OUTSIDE the medallion

Per the pipeline ruling and re-confirmed 2026-08-20: **health bar, effect
pips, nameplate (name + level), aura rings, tick indicator and interact badge
are siblings of the medallion, not layers of it.** The PO mockup places bar,
pips and name/level *below* the token, which is where they already are:

- `OverheadHealthBar.ts` (shared Mob/Character component) below the token,
- `EffectPips.ts` in a strip under the bar,
- the `mobPlate` nameplate (`"${displayName} ${level}"`, difficulty-tinted)
  on the unfiltered overlay.

Absorbing these *into* one frame is exactly backlog §39's scope and stays out
of this plan (see §6.2 for the one §39 slice this plan does pull forward).
§39 is owned by **`docs/plan-entity-presentation.md`** since 2026-08-24, with
the ordering PO-ruled the same day: **this plan executes first**; that plan's
design session needs D15's sizing ruling and C0's named sub-container refactor
settled, because the token is the anchor its state layer attaches to.

---

## 3. The layer stack (revised 2026-08-20 PO mockup · order revised 2026-08-22 artist feedback)

The PO mockup names six token layers plus the three outside elements. This
vocabulary is now the plan's vocabulary. Draw order bottom → top (the rim
moved to the bottom 2026-08-22, D16):

| # | Mockup name | What it is | Selector | Data source | Available? |
| --- | --- | --- | --- | --- | --- |
| 1 | `Token_BorderTier` | rim ornamentation, counted leaves, emerging from behind the medallion | tier: **Normal bare · Elite · Boss** (D12) | `tier` on the wire, works today | ✅ |
| 2 | `Token_Background` | coloured disc behind the portrait | **runtime allegiance**: hostile / neutral-passive / friendly (mockup example: red / green / blue, [PLACEHOLDER]) | **NEW wire field**, the §39 allegiance slice (D11, §6.2) | ❌ needs one appended FlatBuffers field |
| 3 | `Token_Portrait` | the species art | species | `entityType` → sprite class, works today | ✅ |
| 4 | `Token_BorderStyle` | the ring itself, material/style | **faction art family** (e.g. Wildlife = wood) (D9/D10) | faction via one catalog field + a client family map (§6.1) | ⚠️ small backend job |
| 5 | `Token_BorderAdditions` | subtype marks on the ring (e.g. Beast = horns) | subtype, **visual-only** (D13) | client-local key in `Graphics.ts` | ✅ (new config key) |
| 6 | `Token_BorderDecoration` | species-specific dressing (e.g. Spider = webs on the ring) | species, **visual-only** (D13) | client-local key in `Graphics.ts` | ✅ (new config key) |

Outside the token, unchanged and already in the mockup's position:
`Token_HealthBar` (shipped), `Token_Status_Effects` pips (shipped),
`Token_Name + Level` nameplate (shipped).

⚑ Layer-order contract detail: ring, additions and decoration must sit
**above the portrait** (horns tuck behind the ring but outside the portrait
circle; webs sit on top of the ring). The rim sits **below everything**
(D16) and pays nothing for it: it is a standalone sprite, not part of the
frame bake (§7.2), and whatever it draws inward self-masks behind the
opaque disc and ring. If some *future* decoration must slip under the
portrait, the frame bake splits into a below/above pair; still avoid
authoring that.

---

## 4. Decisions

### From the 2026-08-10 concept-art session (D1–D8)

- **D1. The medallion is the base presentation, not a tier decoration.** Every
  non-prop actor is a portrait inside a circular frame, pen-and-paper-token
  style. Fundamental to the visual identity.
- **D2. Three ring variants, not four.** ~~bare ring / vines / vines+leaves~~
  → **reshaped by D9/D12**: the ring *style* now varies by faction family and
  the *ornamentation count* by tier. D2's surviving core: the disc behind the
  ring is a separate layer, not a fourth ring variant.
- **D3. Leaves may carry an extra denomination on bosses.** Still open and
  still free (client-only ornamentation, not a fourth `TierRank`).
- **D4. The disc carries a signal.** → **RESOLVED by D11: runtime allegiance.**
- **D5. The loose coloured leaves carry a signal.** → **RESOLVED by D12: tier,
  as counted rim ornamentation.**
- **D6. Player character frames are customizable.** (→ §9, avatar-plan lane.)
- **D7. Specific NPCs may get custom or unique frames.**
- **D8. Scope is every non-prop entity**, as bounded by D14.

### From the 2026-08-20 mockup session (D9–D15)

- **D9. The border style is keyed on FACTION, superseding `pipeline.md` §4's
  zone+level idea.** This dissolves the documented "zone problem" (zone exists
  nowhere client-side and is a placement fact, not a species fact); faction is
  a species constant and cheap to ship. `pipeline.md` §4's selector table needs
  a corresponding edit when this doc is ratified.
- **D10. Border art is grouped into curated ART FAMILIES, not the 10 literal
  factions.** Wildlife predator+prey share one family; the human factions
  likely share one; count ~4–5 [PLACEHOLDER]. The faction → family map is
  art direction and lives client-side; membership is an open question (§11).
- **D11. The background disc shows LIVE runtime allegiance, not a static
  species default.** PO ruling: rather than ship a background that lies while
  a mob is charmed, this plan pulls **only the allegiance slice** of backlog
  §39 forward: one appended wire field carrying the mob's current stance
  (hostile / neutral / friendly). The rest of §39 (durations, stack counts,
  cast bars, overlay consolidation) stays unscheduled. Details §6.2.
- **D12. Tier rim is 0 / mid / full: NORMAL STAYS BARE.** Elite and Boss get
  rim ornamentation; the old "decoration means above baseline" rule survives
  inside the new art (reversing the 2026-08-10 sketch's assumption that the
  rule retires). Exact leaf counts are art, [PLACEHOLDER].
- **D13. Subtype (`Token_BorderAdditions`) and species decoration
  (`Token_BorderDecoration`) are CLIENT-SIDE VISUAL CONFIG.** Keys next to
  `file`/`borderFile` in `Graphics.ts`. No mob-JSON authoring, no catalog
  field, no fetch race. If "Beast" ever gains mechanics (resistances,
  bonus-vs-category, quest filters), the axis migrates to authored data then;
  nothing in the client design blocks that migration.
- **D14. Who gets a medallion: the existing nameplate predicate,
  `combatTarget || conversant`, plus summons.** Mobs, NPCs, players,
  summons/totems yes; campfires, hazards (poison pools, brambles, rockfalls),
  obstacles keep bare art. Server-derived, already in the catalog, zero cost.
- **D15. Sizing is OPEN, with a new hard constraint recorded (PO 2026-08-20):
  the medallion must not only explain the entity but REPRESENT it: the ring
  should correspond to the physical entity, i.e. its blocking footprint and
  its eligible hit radius.** Neither "grow the medallion" nor "shrink the art"
  can be picked until we know how far current visual sizes sit from the
  authored colliders. See §5.3 for what this changes.

### From the 2026-08-22 artist feedback (D16–D18)

The artist read the delivery contract (`art/medallion-asset-spec.md`) and
pushed back on four points; all four are accepted and folded in.

- **D16. The tier rim renders at the very BOTTOM of the stack** (artist
  call): the ornaments emerge from *behind* the medallion instead of
  sitting on the ring. Render consequence (§7.2): the rim leaves the frame
  bake and becomes its own sprite below the disc, the bake key drops
  `tier`, and elite/boss entities cost ~4 quads instead of ~3 (normal tier
  has no rim sprite at all).
- **D17. The ring proportions are ARTIST-LED.** The contract's prescriptive
  72 %/56 % fractions confused more than they fixed; they are deleted. The
  artist draws the pilot to look right, the delivered set is measured, and
  the measured numbers are recorded in the spec §3 and frozen. The hard
  rule survives untouched: identical circles across every family and
  variant.
- **D18. The artist works IN THE REPO; there is no hand-off and no source
  deliverable.** The contract's "send files to the dev side, never touch
  the repo" posture was wrong: the artist is the second committer on main
  and runs their own Claude sessions in this project, and commits exported
  PNGs directly to the assets directory. Per-family source files and the
  circle-guide template are dropped; the artist keeps ONE master file for
  all mobs/NPCs (their existing workflow), and the spec's recorded numbers
  are the repo-side ground truth instead.

---

## 5. Constraints and landmines

### 5.1 The medallion must NOT live inside `actualShape`

`StatusEffect.forDamaged` scales `actualShape` 1.1→0.8 and whitens it on every
hit. A frame parented there would squash and flash with the portrait. The
intended read is the opposite: the **portrait squashes inside a stable
frame**. So disc and frame are siblings of `actualShape`, not children. (This
is already how the shipped `withBorder` works.)

Corollary: at scale 1.1 the portrait briefly overflows the inner circle.
Either accept it (reads as impact) or reduce the flash scale. PO eyeball call.

### 5.2 The child-index arithmetic in `shape` is already fragile

Insert conventions coexisting in `Mob` today: aura rings `addChildAt(…, 0)`
lazily · dwell ring `addChildAt(ring, min(1, len))` · health bar plain
`addChild` (lands on top) · `initShape` appends border and `tierFrame` after
`actualShape`. `Character` does it differently again (rings eager).

Adding a disc that must sit **above the aura ring and below the portrait**
(plus, since D16, a rim below even the disc) breaks those assumptions
silently: wrong order, only in combinations where the other consumer is
present.

**Recommendation (unchanged, now first chunk): replace the index arithmetic
with named sub-containers** (`belowArt`, `art`, `aboveArt`) before any
medallion art lands. Small refactor; the difference between this plan costing
one bug and costing three.

### 5.3 Sizing: the D15 constraint reframes grow-vs-shrink

The 2026-08-10 fork was: *grow the medallion* around the current art (one
constant, no species re-tune) vs *shrink the art* into the current footprint
(re-tunes ~60 hand-tuned `minSize`/`maxSize` pairs). D15 adds a third
requirement that cuts across both: **the ring should track the physical
body**, meaning the collider (`body.radius`, what blocks movement) and the
aura-hit eligibility radius.

What makes this non-trivial:

- **Combat mobs' visual size is currently decoupled from their collider**:
  each instance rolls `randomInt(minSize, maxSize)` while `body.radius` is a
  fixed authored number. NPCs and props already size from the wire radius
  (`radius × 120 × 2`), so the "ring = body" rule is *already true* for one
  class of entity and false for the other.
- If the ring pins to the collider, the per-instance size roll either dies,
  becomes variance in `body.radius`, or survives only inside the portrait
  (same ring, slightly varying art). Each is a different feel.
- The visual-vs-collider gap is unmeasured. Wolf-class mobs have
  `body.radius: 0.3` (72 px diameter at world scale) against visual rolls that
  may be substantially larger; the gap also differs per species.

**C0 therefore includes a measurement task**: a table of every medallion-
eligible species with authored `body.radius`, current `minSize`/`maxSize`
roll range, and the ratio. The PO decides D15's final rule off that table,
per-species outliers visible. Until then, neither grow nor shrink is final.

Known offset consequences whichever way it lands (each one expression): the
overhead bar anchor, the nameplate offset, the character name/level offsets,
the floating-number spawn spread (reads `this.size`).

### 5.4 Fill rate is the real cost, and it is the project's proven failure mode

Naively, six token layers are six full-size alpha quads per entity. The mobile
regression was **fill rate**, not CPU. Mitigations are designed in from the
start (§7): the frame stack bakes to **one** shared texture per species, the
disc is one tinted greyscale sprite, the portrait stays live. Target: **~3
quads per normal entity** (disc, portrait, baked frame) instead of six;
elite/boss pay a fourth for the D16 rim sprite.

**A headless framerate number does not settle this.** Headless perf transfers
only as ratios. A real-phone check is an exit criterion, not a nice-to-have.

### 5.5 The catalog race, if any selector is catalog-sourced

`setMobId` and `setTier` early-return on unchanged values. A frame lookup that
misses because the `/mobs` fetch has not resolved would **never retry**. The
nameplate has the same latent hole today; invisible only because the catalog
loads before anyone joins. Any catalog-sourced selector (D9's faction field)
must either be client-local or carry an **explicit re-resolve** (e.g. the
catalog-load promise re-runs medallion resolution for live entities).

### 5.6 "Every entity" collides with the fixtures - RESOLVED

D14: `combatTarget || conversant` plus summons. Fixtures, hazards, obstacles
keep bare art.

### 5.7 The `Corpse` question - still open

Gravestone inside a ring (cheap, consistent) vs the dead character's greyed
portrait in a broken ring (much stronger; needs the corpse to carry an avatar
id it does not carry today). Recorded, not answered.

### 5.8 If leaves ever become a real fourth rank

Boss-only ornamentation is free, purely client-side (D3). A genuine fourth
tier costs a `TierRank` member on both sides, the `shared-constants` pin, the
authoring vocabulary and a content pass. Not currently on the table.

---

## 6. The two data gaps and how they close

### 6.1 Faction → border family (D9/D10)

Faction is authored per species in `api/mobs/*.json` and resolved server-side;
the client has no faction anywhere. Two-part recommendation:

- **The catalog ships the faction name**: one field on `CatalogEntry`
  (`catalog.go`), server-derived, following the `combatTarget` precedent. This
  is the honest species fact and keeps `api/mobs/*.json` the single source of
  truth. It is a deliberate exception to the minimal-projection stance and
  should say so in the catalog comment. Zero-hint policy check: faction is
  already displayed to players in skill tooltips, so it leaks nothing.
- **The faction → art-family map lives client-side** (`Graphics.ts` or a
  sibling table), because family grouping is art direction, not game data.
  ⚑ Hand-maintained client tables have bitten this project three times when
  they lacked completeness pins: this one gets a **vitest pin that every
  faction in the catalog resolves to a family** (unknown faction → loud
  fallback family + console error, never an invisible frame).
- §5.5 applies: faction arrives with the catalog fetch, so medallion
  resolution re-runs when the catalog lands.

Alternative considered and rejected: keying the family per-species purely
client-side (no catalog change). Rejected because it duplicates a fact the
server already owns per species and rots silently as mobs are added.

### 6.2 Runtime allegiance: the §39 slice (D11)

**What comes forward: exactly one appended field on the wire `Mob` table**,
carrying the mob's current stance for presentation:

- Shape sketch [PLACEHOLDER]: `stance: ubyte` with 3 values
  (hostile / neutral / friendly), appended to `table Mob` in `server.fbs`
  (FlatBuffers append = backward compatible), mirrored in the codec and a new
  `WireSetters` entry.
- Server-side the fact already exists: `MobDefinition` carries the resolved
  faction, `AggroMask` and `FriendlyToPlayers`, and charm/calm already flip
  allegiance at runtime (that flip is what made a static background a lie).
  The stance field is a projection of state the server already tracks, not new
  simulation.
- Design questions for the implementing chunk, recorded now: is stance
  viewer-relative or global? (No PvP and no player factions in v1, so
  "stance toward players" is global today; charm's flip is toward the
  charmer's side, which is the player side, so global still reads correctly.
  Revisit if PvP or opposed player factions ever land.) Does a mob mid-flee or
  a prey animal read as neutral or hostile? (Prey retaliates when hit;
  proposal: stance reflects the *current* aggro relationship, so prey is
  neutral until it retaliates.)
- **What does NOT come forward**: effect durations, stack counts, effect
  sources, cast bars, absorbing the six overlays into one frame. Backlog §39
  keeps owning all of that; this field should be designed so §39 can extend it
  rather than replace it (hence its own field, not bits squeezed into the two
  full ubytes).
- The charm pip stays; once the background is live, the pip and the disc agree
  rather than the pip being the only tell.
- At ratification, backlog §39's entry gains a one-line cross-ref that the
  allegiance/stance wire field is owned by this plan's C2, so §39's eventual
  design pass extends it instead of re-planning it.

---

## 7. The compositor: how six layers cost three quads

The "build medallions performantly, efficiently, from individual parts" ask,
concretely:

### 7.1 Declarative spec, not per-class wiring

Today each medallion mob hand-overrides `initShape` and calls `withBorder`.
That does not scale to six layers × ~60 species. Instead, `Graphics.ts` grows
a per-species **medallion spec** next to the existing `file`/`minSize` keys:

```ts
// shape sketch, names [PLACEHOLDER]
wolf: {
  file: './assets/mobs/wolf.png',
  minSize: 30, maxSize: 40,
  medallion: {
    additions: 'beast',      // Token_BorderAdditions key, optional
    decoration: undefined,   // Token_BorderDecoration key, optional
    // family comes from catalog faction via the family map (§6.1)
    // tier rim comes from the wire tier
    // background stance comes from the wire (§6.2)
  }
}
```

One generic resolver (`resolveMedallion(spec, faction, tier)`) replaces the
per-class `withBorder` boilerplate; the existing six medallion mobs migrate
onto it. Species without a `medallion` entry and entities failing the D14
predicate get bare art, exactly as today.

### 7.2 Bake the frame, tint the disc, keep the portrait live (rev 2026-08-22, D16)

- **Frame bake**: border family ring + additions + decoration are all
  species constants, so the composed frame is baked **once per species**
  into a `RenderTexture` at first use and cached (keyed by the resolved
  layer tuple, so species sharing identical tuples share one texture). All
  instances share it, same as portraits today. Since D16 moved the rim out
  of the bake, `tier` is no longer part of the tuple, which makes the bake
  fully static per species and lets more species share one texture.
- **Rim** (D16): NOT baked. One PNG per family × tier is a texture already;
  it renders as its own `Sprite` in `belowArt`, *under* the disc. Only
  elite/boss entities carry one. A wire `tier` change swaps the rim texture
  (the same change-driven caching discipline `setTier` follows today); the
  frame bake is untouched by tier.
- **Disc**: one shared greyscale disc asset, one `Sprite` per entity, tinted
  at runtime by stance (`sprite.tint` multiplies; greyscale tints correctly).
  Tint change on a stance flip is free. Sits in `belowArt`, above the rim.
- **Portrait**: stays a live, separate display object in `art`, because the
  damage flash must squash it inside the stable frame (§5.1). Frame bake
  sits in `aboveArt`; rim and disc in `belowArt`.

Result: ~3 quads per normal entity, ~4 for elite/boss (the rim sprite), one
bake per species tuple (amortized), zero per-frame cost (stance tint and
tier are change-driven, same caching discipline as `setTier` today).

### 7.3 Asset contract (still the load-bearing part)

> **→ The artist-facing contract now lives in `docs/art/medallion-asset-spec.md`
> (2026-08-20, rev 2026-08-22 after the artist's feedback)**, written so art
> can start before implementation. It fixes: 512 × 512 canvas per layer ·
> rim at the bottom of the stack (D16) · rims drawn per family,
> additions/decorations universal · existing portraits untouched (code fits
> them into the window) · a pilot set in a family of the artist's choice
> whose measured proportions become the frozen circle numbers (D17) ·
> in-repo delivery by the artist, no source-file deliverable (D18). The
> bullets below are the design rationale; the spec is the deliverable
> definition. Keep the two in sync.

- Square canvas, ring centred, transparent background, no baked backdrop.
- **Every layer of a medallion exports at the same canvas size with the same
  centre.** The renderer anchors 0.5/0.5 and scales all layers to the same
  box; layers line up only if they share a canvas. Draw as a stack, export the
  stack.
- **The ring's OUTER circle sits at a fixed, documented diameter on the
  canvas, identical across every family and variant** (decorations overflow
  the ring, so the canvas edge is not the reference). The number comes from
  measuring the pilot (D17); once recorded, hold it. **The INNER circle is
  likewise fixed and identical**: it is the portrait's usable area; if it
  varies per variant, art silently changes size relative to its own species.
- The disc ships greyscale (tinting, §7.2). Padding is a cost, not free space
  (transparent margin still rasterizes; decorations tight to the edge).
- Test all layers composited *and* the portrait alone; a portrait must still
  read bare (fixtures, degrade paths).

---

## 8. Schema impact

| Layer | Impact |
| --- | --- |
| **Database** | **NONE**, except player-frame customization, which persists an id per account and lands in `plan-avatar-system.md`'s schema, not here |
| **FlatBuffers** | **ONE appended field** on `table Mob`: the D11 stance ubyte (the §39 allegiance slice). Appended = backward compatible. Player frame id is a separate appended field on the avatar plan's account, not this plan's |
| **`/mobs` catalog JSON** | **ONE added field**: the species faction name (D9, §6.1), `combatTarget` precedent |
| **conf.json** | NONE |

---

## 9. Relationship to `plan-avatar-system.md`

Unchanged from 2026-08-10. D6 (customizable player rings) is structurally the
same lane as the avatar plan: a second cosmetic id beside `avatar_id`, same
unlock triggers, same account-side persistence, same picker UI. **Do not
design a parallel mechanism.** The ring-customization chunk here is blocked on
the avatar plan's decisions; this plan's mob and NPC chunks are not blocked on
it at all. Cross-link both docs when ratified.

---

## 10. Provisional chunk breakdown

Still provisional; D15 (sizing) can move the order. The §39 slice is its own
chunk so the pure-client work never blocks on wire/codec review.

- **C0 - contract, plumbing, and the sizing table.** The asset contract (§7.3)
  written down ✅ + the pilot frame set (one family, three tier states, one
  addition, one decoration), which the artist commits directly per D18 and
  the spec §8; C0 measures it and records the circle numbers in the spec
  (D17). The named sub-container refactor
  (§5.2). The **D15 measurement table** (visual roll vs `body.radius` per
  species, §5.3) for the PO's sizing ruling. One prototype species wearing the
  full stack (background disc statically tinted for now) for the PO to eyeball
  in-game. *Schema: none.*
- **C1 - the frame stack for mobs and NPCs.** The medallion spec + resolver
  (§7.1), the frame bake (§7.2), the catalog faction field + family map with
  its completeness pin (§6.1), tier rim replacing `TIER_FRAME_STYLES`, D14
  predicate, the D15-ruled sizing change and its offset consequences. Exit
  criterion includes the real phone. *Schema: one catalog field.*
- **C2 - the allegiance slice + live background.** The stance wire field
  (§6.2), codec both sides, `WireSetters` entry, disc tint driven by it,
  charm/calm flip verified in-game. *Schema: one appended FlatBuffers field.*
- **C3 - player characters.** `Character` onto the same resolver; note its own
  container layout and overlay-plate bar. One default frame for everyone.
  *Schema: none.*
- **C4 - corpses and summons.** Small; depends on §5.7's answer. *Schema:
  none.*
- **C5 - customization.** D6/D7 unlockable and per-NPC frames. **Blocked on
  `plan-avatar-system.md`.** *Schema: lands in that plan.*

---

## 11. Test strategy

- **vitest** for the pure maths and resolution logic: outer/inner fraction →
  sprite size, offset derivations, and `resolveMedallion` (spec + faction +
  tier → layer tuple) as a table test.
- **Completeness pins** (silent-wiring has bitten three times): every faction
  in the catalog resolves to an art family (§6.1) · every declared frame
  asset key resolves to a loaded texture · every `medallion.additions`/
  `decoration` key used by any species exists in the layer registry. Typos
  fail loudly, never render invisibly.
- **The catalog race** (§5.5): a test that a mob resolved *before* the catalog
  fetch lands gets re-resolved after it.
- **Playwright smoke** via the `verify` skill: join, stand next to a normal,
  an elite and a boss of two different families, assert distinct frames
  on-screen (presence, not art correctness). C2 adds: charm a mob, assert the
  disc tint flips.
- **A real-phone fill-rate check as C1's exit criterion.** Non-negotiable per
  §5.4.
- **Screenshots for the PO at C0 and C1**; most of what this plan changes is
  not assertable.

---

## 12. Open questions

Settled 2026-08-20 (for the record): disc axis → **allegiance** (D11) · leaf
axis → **tier** (D12) · fixtures → **D14 predicate** · frame-selection route →
**catalog faction + client family map** (§6.1) · border selector → **faction,
not zone+level** (D9). Settled 2026-08-22 (artist feedback): rim at the
**bottom** of the stack (D16) · proportions **artist-led, measured at the
pilot** (D17) · delivery **in-repo by the artist, no source files** (D18).

Still open:

1. **D15 / §5.3 sizing**: after C0's measurement table, does the ring pin to
   the collider, and what happens to the per-instance size roll? The one
   question that can reorder the chunks.
2. **D10 family membership**: which factions share which art family, and the
   family count. Art-budget call, decidable at the C0 art test.
3. **Stance colour mapping**: mockup says green/blue/red for
   neutral/friendly/hostile [PLACEHOLDER]; note green-as-neutral vs the
   difficulty palette and colour-blindness before finalizing.
4. **§5.7 corpses**: gravestone in a ring, or greyed portrait in a broken
   ring?
5. **D3**: does Boss get an extra denomination beyond the full rim?
6. **Leaf/decoration animation**: static ships; animation is per-entity
   ticking work, out of scope until asked for.
7. **Minimap**: do medallions apply to minimap icons, or world only? (Mobs
   currently have no minimap presence at all; players/resources are flat
   `Graphics` circles.)
8. **Prey/flee stance semantics** (§6.2): neutral-until-retaliating proposed,
   needs a PO nod in C2.
