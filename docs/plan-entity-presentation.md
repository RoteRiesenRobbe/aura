# Plan: Entity presentation: every state an actor is in shows on its medallion, at a position reserved for it

**Status: APPROVED 2026-10-23 (planning session, PO in chat). R1-R13 RULED, D1-D12 approved,
Q1-Q4 open, nothing built.** Open PO calls in §7. Two chunks here (EP1, EP2, §5) with
`plan-appearance.md` C6 between them; EP1 can start once the plan is approved, and C6 builds on
EP1 right after it.

**Owns:** the actor's state layer: the reserved-position indicator ring on every medallion, the
whole-entity treatments (stealth's alpha, dead's grey), and the composition of the medallion's
tints. **Builds on:** `plan-appearance.md` D37 (one medallion system), D40-D43 (the corpse and
its death art); `plan-entity-medallions.md` (cited M-§n: the token, D11 stance); `plan-buff-tray.md`
D10/D13 (the own player's tray, the harmful/helpful split). **Replaces:** `EffectPips` (the pip
strip under the health bar retires, R5). **Unblocks:** `plan-appearance.md` C6 (D43).
**Schema (as designed):** DB none · wire none in EP1; EP2 +1 `applied_effects` bit value (no
field) · conf none · content none · catalog none · lang none.

⚑ Line references pinned 2026-10-23 at `ace434c7` (main); re-verify before relying on them.

---

## 1. What this is

A calmed or charmed wolf shows a dot under its health bar and nothing else (`EffectPips`); a
player corpse is a gravestone; a stealthed player is translucent through a one-off
`tokenAlpha`. Each state found its own way onto the screen. The PO's founding ruling
(2026-07-29) asked for "a full and comprehensive rework" of how mobs and players present
buffs, debuffs, durations, allegiance, faction and cast bars. On 2026-10-23 this session was
moved ahead of `plan-appearance.md` C6 because a corpse wearing the dead player's look needs a
"dead" state, and the PO wanted that to be the first tenant of a clean system rather than a
one-off on the corpse (D43: "we are looking for clean and correct outcomes, not just quick
solutions").

The design in one sentence: **every state an actor is in is one row in one client table; a
row either reserves a fixed position on the medallion's outside rim, where its indicator
always appears, or names a whole-entity treatment (alpha, grey); the medallion composes them,
so a position always means the same state.**

### 1.1 What already exists and is reused

- `applied_effects` (ushort on `Mob` and `Character`): 13 presence bits, bits 13-15 free
  (`backend/pkg/aura/skills/applied_effects.go`). The own player's value is sent and, today,
  only read for stealth (`frontend/src/features/player/logic/Player.ts:117`).
- `TokenSlots` (`TokenSlots.ts`): named slots, `token` = disc + actualShape + frame, the only
  node a lunge moves.
- `Medallion` (`Medallion.ts`): disc tinted by stance, ring tinted by tier; rings are greyscale
  art coloured only by tint (`client-data/Medallions.ts`).
- `PIP_STYLES` colours in `EffectPips.ts`: they become the indicator fallback colours.
- `lumaGreyscale` (`pixi-js/logic/ColorMatrixFilterExtensions.ts`) and the damage flash's
  filter array on `actualShape` (`StatusEffect.ts:99-103`), which appends rather than replaces.
- The buff tray (`plan-buff-tray.md`): the own player's per-spell effects with timers.
- The "Immune" floating label for a refused hit (`9fb3859d`).

### 1.2 History of this doc

Scope captured 2026-08-24 out of backlog §39; **§39 stays the citation anchor** (many docs
cite it by number; the backlog entry points here). Amended 2026-09-11 by `plan-skill-vfx.md`,
which took the per-hit source, damage numbers and per-effect art (old §6 items 3, 4, 10). The
standing moratorium, in its 2026-09-19 form: **no new independently-anchored overlay on the
sprite.** This plan meets it by construction: the indicators live inside the token's slots.

---

## 2. PO rulings (2026-10-23)

- **R1. One state table, composed in one place.** A row names a whole-entity treatment and/or
  an indicator; states come from wire bits OR from what the entity is (a corpse is dead, no
  wire bit). Accepted as proposed; the adversarial review then moved the parts below (D3-D5).
- **R2. On a corpse everything is grey but the skull.** Disc, ring and portrait grey; the red
  skull (D42) is the only colour.
- **R3. Stealth fades the whole entity, as today**: the alpha goes on `shape` (token, aura
  rings, everything under it), not on the token alone. Mobs get it too (they ignore the bit
  today, `Mobs.ts:483`), and a Mob's plate follows because it mirrors `shape.alpha`. ⚑ "As
  today" for a Character keeps its plate (bar, name, level) at full opacity: it is not on
  `shape` and does not mirror it (`Character.ts:268-273`). The option text said "bar, plate";
  whether a stealthed player's plate fades too was §7 Q5, ruled R13.
- **R4. The mob death fade-out is a written exemption**, not a table row: it runs after the
  entity left the snapshot, so it never fights a state write (L3).
- **R5. Every state gets one reserved position on the medallion, always the same, and the pip
  strip retires.** PO: "an indicator in the 'death' position will always mean death because
  the position is reserved for that state." Type indicators, not spell icons ("that would get
  too noisy").
- **R6. Sides by kind**: harmful on the right half, helpful on the left, stun at 12 o'clock,
  dead at 6 o'clock (the preview layout, angles in D2 [PLACEHOLDER]).
- **R7. Outside the ring**: a halo just beyond the frame, never over the face.
- **R8. The own medallion shows its own indicators too.** PO: "the medallion only shows the
  type of effect, not all individual spells, those can be seen in the buff tray." The tray
  (D10 there) is unchanged.
- **R9. EP1 first, then `plan-appearance.md` C6**, then EP2.
- **R10. Durations for other actors: not now.** The position answers "what"; the tray answers
  "how long" for yourself. Parked (§7 Q3).
- **R11. CC-immune keeps the "Immune" label**; no reserved position.
- **R12. Each state names a glyph icon, with a colour-disc fallback**: until a glyph is picked
  it draws as a disc in today's pip colour. Picking glyphs is a PO/art pass, not a blocker.
- **R13. A stealthed player's plate fades too, like a Mob's** (Q5, at the approval): stealth
  reads the same on every actor; the Character plate mirrors `shape.alpha`.

---

## 3. Design

### D1 - The state table

One client module, `TokenState.ts` (`frontend/src/features/game-objects/logic/`), a regular
array like `PIP_STYLES` so a vitest can enumerate it. A row:

```
{ id, source: AppliedEffectBit | 'dead', angle?: number, colour?: number,
  glyph?: { packIcon, file }, treatment?: { alpha?: number, grey?: true } }
```

A row with `angle` is an indicator; a row with `treatment` is a treatment; stealth is the only
treatment-only bit row today, dead is both (grey + the skull). The only input is
`(mask, dead)`: the wire mask, and whether the entity is a corpse (R1). A pure function
`tokenState(mask, dead) → {alpha, grey, indicators[]}` is what the entity and the medallion
consume; nothing else reads `applied_effects` for drawing. `tokenAlpha` and `STEALTH_ALPHA`
fold into it.

### D2 - The positions: a 22.5° grid of 16, sides by kind

Angles clockwise from 12 o'clock [PLACEHOLDER, R6]. Side = harmful or helpful **to the
wearer** (calm and charm are done to a mob against its will, so they sit on the harmful side,
matching the tray's D13 rule):

| Angle | Right (harmful) | Angle | Left (helpful) |
| --- | --- | --- | --- |
| 0 | **stun** (EP2) | | |
| 22.5 | dot | 337.5 | hot |
| 45 | slow | 315 | speed |
| 67.5 | statDown | 292.5 | statUp |
| 90 | fear | 270 | resist |
| 112.5 | calm | 247.5 | reflect |
| 135 | charm | 225 | tickRate |
| 157.5 | *spare* | 202.5 | *spare* (lifesteal? §7 Q1) |
| 180 | **dead** | | |

Explicit angles, never derived from a count, so adding a state never moves an existing one
(R5's whole point). Each side keeps one spare slot; a state beyond the spares is a PO call.

### D3 - The indicators slot: inside `token`, outside every filter

`TokenSlots` gains `indicators`, a fourth child of `token` after `frame`: it moves with a
lunge (the moratorium), and it is a sibling of `actualShape`, so the portrait's grey filter
(D5) never reaches it and the skull stays red (the review's finding 1). The draw order note in
`TokenSlots.ts` and M-§3's stack name it.

### D4 - `StateIndicators` replaces `EffectPips`

One class per medallion: on a mask change (never per frame) it draws each live indicator at
its angle on a circle of radius `ringRadius + INDICATOR_GAP` [PLACEHOLDER 3 px], as a glyph
sprite when the row has one and its pack or fallback file loaded, else as a disc in its
colour on the dark rim the pips used (`OVERHEAD_BAR_BACKDROP`). Indicator diameter =
`min(INDICATOR_MAX [PLACEHOLDER 12 px], arcSpacing × 0.85)` where arcSpacing = radius × π/8,
with a floor [PLACEHOLDER 6 px]: measured on the smallest token in EP1 (§6). No filter, no
per-frame work; sprites batch.

`EffectPips.ts` is deleted, `OverheadHealthBar` loses `setAppliedEffects` and the pip gap,
`OverheadVitals` (`WireSetters.ts`) loses the member and a new `TokenStateDisplay
{ setAppliedEffects(mask) }` takes it (Character, Mob).

### D5 - Treatments: alpha on the entity, grey split into tint and one portrait filter

- **Alpha** (stealth): the entity writes `shape.alpha` from `tokenState(...).alpha`, Character
  and Mob alike (R3). The Mob plate already mirrors `shape.alpha` per frame (`Mobs.ts:334`), so
  plate, quest glyph and interact badge fade with it; the Character plate gains the same mirror
  (R13).
- **Grey** (dead): disc and ring go grey by **tint** (the medallion's composer, D6), and the
  portrait alone by a `ColorMatrixFilter` with `lumaGreyscale(1)` appended to `actualShape`'s
  filter array, created on the first grey and never on a living token. A corpse has no damage
  flash, so its `actualShape.filters` starts null: create the array then (as
  `StatusEffect.ts:99-103` does). One render pass per
  greyed token, bounded by corpses in view; a pre-greyed texture was weighed and rejected
  (portraits are atlas frames swapped by `setPortraitTexture`, it would need a per-look
  generated-texture cache).
- ⚑ Rule: **a filter treatment is only for a bounded population** (corpses). A future grey
  state on living mobs is a fill-rate question for the PO before it is a row.

### D6 - The medallion owns its final tints

`setTier`, `setStance` and `setRing` stop writing `tint` directly and call one
`applyTints()`: ring = grey ? `GREY_RING` : `ringTint(tier)`, disc = grey ? `GREY_DISC` :
`stanceTint(stance)` [PLACEHOLDER greys]. `setRing` recreates the sprite (`Medallion.ts:94`),
so it must go through `applyTints()` or a late ring load on a corpse brings the colour back
(L2). `Medallion.setState(state)` applies grey + indicators; the entity applies alpha.

### D7 - Three input doors, named

The mask reaches the table through (1) `EntityManager`'s `setAppliedEffects` dispatch for
every other entity, (2) `Player.ts:117` for the own player, which now feeds the whole mask
(R8) instead of only the alpha, and (3) `dead`, set by the corpse class itself (C6), never by
the wire. A fourth door is a design change.

### D8 - Anchors clear the indicator band

The band sticks out `INDICATOR_GAP + diameter` beyond the ring on every side. The Mob bar
(`barAnchorY`, `Mobs.ts:312`) and through it the nameplate, the Character bar on its plate,
the interact badge (measures the art, `InteractBadge.ts:145`), the quest glyph and the
Character's level number all add the band, or indicators sit under them (L4). The level number
is the sharpest case: it sits at `(0.72·size, 0.72·size)` on the plate (`Character.ts:243`),
i.e. at 135° just outside the ring, exactly the charm slot; it moves out by the band. One exported
`indicatorBand(size)` is the single source.

### D9 - Dead, built in C6 on EP1

The `dead` row (grey + skull at 180°) is built and pinned in EP1, unlit. C6
(`plan-appearance.md`) gives it a host: `Corpse` adopts `createTokenSlots` + `Medallion`,
the look-drawing (`Character.ts:124-170`, `drawLook` + `setLook`, incl. the catalog-race retry, M-§5.5) moves into
`Medallion` so Character and Corpse share it, `EntityManager` dispatches `setLook` for corpses
(today only in the Character branch, `EntityManager.ts:143-152`), the client reads `Resource`'s
two new fields, and the corpse calls `setState(0, dead = true)`. The skull glyph: the PONETI
`Rune_Death_nb` `packIcon` with a committed placeholder SVG as `file` (D42).

### D10 - Stun gets its own bit (EP2)

`stunPayload.appliedBit()` returns `AppliedEffectSlow` today (`applied_effects.go:86`), so a
stunned mob reads as slowed and a stun hides a weaker slow. EP2 adds `AppliedEffectStun = 1 << 13`
on both sides and `api/shared-constants.json`, the 0° row, and a swirl glyph. A stunned and
slowed mob then shows both.

### D11 - `aura_category` is a rule, not a chunk

The ubyte is full. Widen it to a ushort in the same change that needs the next ring category,
as `applied_effects` was (effect types round 2 C0). Nothing waits on it today.

### D12 - Not in scope

Cast bars (nothing casts; YAGNI until something does), durations for others (R10), a CC-immune
marker (R11), a shared ascension-ceremony effect (old §6 item 8, parked), faction on the
entity (the tooltip names it), allegiance beyond the stance tint (M-D11, done), stacks.

---

## 4. What changes for the author

Nothing in content. Ring art (the families, and every appearance ring that names one) stays
greyscale, coloured only by tint, or dead's grey breaks on it (L9; already the rule for the
tier tint). A new effect kind that wants an indicator takes a row in `TokenState.ts`
with an angle from a spare slot, and a glyph when one is picked (R12). The `add-content`
skill's effect-type checklist gains that line in EP1.

---

## 5. Chunks

| # | Chunk | Contents | Size |
| --- | --- | --- | --- |
| **EP1** | The state ring | D1-D8: `TokenState.ts`, the `indicators` slot, `StateIndicators`, every existing bit at its angle (colour-disc fallback), pips retire, stealth as entity alpha on Character AND Mob, the own token fed, the tint composer, the grey treatment and the dead row built and pinned (unlit), anchors clear the band | M |
| *(C6)* | *`plan-appearance.md` C6* | *D9: the corpse medallion lights the dead row* | *M, owned there* |
| **EP2** | Stun's own bit | D10: Go bit + shared constant + TS bit + the 0° row + swirl glyph (or fallback disc) | S |

### EP1 - the state ring (M; needs: plan approved)

*Schema: DB none · wire none · conf none · content none.*
**In-game (PO):** a mob under a dot shows its indicator at 22.5°, a slowed one at 45°, both
at once when both; a healed ally at 337.5°; your own token shows your effects while the tray
lists the spells; no strip under any bar; a stealthed player AND a stealthed mob fade whole,
plate included; tier rings and stance discs look exactly as before; nothing sits under a bar,
nameplate, `E` cap or quest glyph; the smallest mob's indicators are legible on the phone.

### EP2 - stun's own bit (S; needs: EP1)

*Schema: DB none · wire +1 `applied_effects` bit value, no field · conf none · content none.*
**In-game (PO):** a stunned mob shows the 0° indicator and no longer the slow; a stun on a
slowed mob shows both.

---

## 6. Test strategy

- **vitest red first (EP1):** `TokenState.test.ts`: every `AppliedEffectBit` has exactly one
  row (completeness, enumerated), every indicator angle is on the 22.5° grid and unique, harmful
  rows sit in (0°, 180°) and helpful in (180°, 360°), dead is at 180° and has grey; `tokenState`
  for 0, stealth (alpha `STEALTH_ALPHA`), dead (grey, skull), and a full mask. `TokenAlpha.test.ts`
  migrates into it.
- `Medallion.test.ts`: tint composition, incl. the boundary case setRing AFTER grey keeps grey
  (L2), setTier/setStance while grey stay grey and come back on ungrey.
- `TokenSlots.test.ts`: `indicators` is a child of `token` and not of `actualShape`.
- `indicatorBand` used by every anchor (a test per anchor that it clears the band).
- `SharedConstants.test.ts` + the Go twin for EP2's bit.
- **Go (EP2):** `stunPayload` reports `AppliedEffectStun`; a stun + slow mask carries both.
- **verify:** extend `c1-medallions` (or a new `ep1-state-ring.mjs`) with a leg that applies a
  dot via cheat and reads the indicator's position from the scene graph.
- **Measure in the EP1 ledger:** the smallest medallion's token diameter and its indicator
  diameter; frame time with 30 mobs each wearing 4 indicators vs none (sprites, no filter, so
  expect noise); C6 records one corpse's pass cost.
- Then the PO's in-game look (§5).

---

## 7. Open PO calls

- **Q1. Lifesteal's indicator**: the backlog §40 note says it should be "the first thing §39
  gives one to". Proposed: yes, bit 14 + the 202.5° spare, in EP2. Not asked this session.
- **Q2. The glyph list** (R12): one PONETI icon per row; proposed as an art pass after EP1,
  with the colour discs standing in.
- **Q3. Durations for others** (R10, parked): if it returns, the hover/tap tooltip with a
  change-only per-entity expiry list (modelled on `own_effects`) was the leading option.
- **Q4. Indicator sizes and the greys** ([PLACEHOLDER]s in D4-D6): judged at the EP1 look.
- ~~**Q5. A stealthed player's plate**~~: RULED 2026-10-23, R13 (it fades, like a Mob's).
- ~~Which sibling overlays merge into the frame~~: RULED 2026-10-23, R5 (pips into the
  medallion), the bar, nameplate, aura rings and badge stay anchored to it (D8).
- ~~Self-presentation vs on-entity~~: RULED 2026-10-23, R8 (both: types on the medallion,
  spells on the tray).
- ~~Mobile fill-rate budget~~: D4 (no filter on indicators), D5 (one bounded pass per corpse).

---

## 8. Landmines

- **L1.** A filter covers every descendant: the grey must sit on `actualShape` only, never on
  `token`, or the skull and every indicator grey out (D3, D5).
- **L2.** `setRing` destroys and recreates the ring sprite and writes `ringTint` itself
  (`Medallion.ts:94-96`): route it through `applyTints()` (D6).
- **L3.** `fadeOutAndHide` (`EntityManager.ts:328`) also writes `shape.alpha`: the R4 exemption.
  It runs after the entity left the snapshot; a state write after it would un-fade a dying mob.
- **L4.** The indicator band collides with the bar, nameplate, `E` cap, quest glyph and the
  Character's level number (135°, the charm slot) unless every anchor adds `indicatorBand` (D8).
- **L9.** Ring art must stay greyscale: the tier colour and dead's grey are both tints, and a
  tint only multiplies (`client-data/Medallions.ts:17-22`). A coloured ring would darken
  instead of greying on a corpse (§4).
- **L5.** A Mob without a medallion spec (`medallion = null`, `Mobs.ts:97`) loses its pips and
  gets no indicators: survey in EP1 which plain objects ever carry effect bits; D37 says a plain
  object is not an actor, so expected none, but measure.
- **L6.** A new bit needs both sides AND `api/shared-constants.json` (pinned by twins), or a
  stun draws as something else (EP2).
- **L7.** The own player is a separate door (`Player.ts:117`, D7): feeding only the alpha there
  silently leaves the own token without indicators (R8).
- **L8.** The corpse look has the catalog race (M-§5.5): a corpse resolved before
  `/appearance` lands keeps the default forever unless re-resolved (C6).

---

## 9. Schema impact

| Layer | EP1 | EP2 |
| --- | --- | --- |
| Database | NONE | NONE |
| Wire | NONE (the own `applied_effects` is already sent) | +1 bit VALUE in `applied_effects` (no field, no fbs edit) |
| Conf | NONE | NONE |
| Content | NONE | NONE |
| Catalog / lang | NONE | NONE |

(C6's own line stays in `plan-appearance.md`: `Resource` +2.)

---

## 10. Cross-references

`plan-appearance.md` D37-D43 and §7 C6 · `plan-entity-medallions.md` §2.5, §3, D11 ·
`plan-buff-tray.md` D10, D13 · `plan-skill-vfx.md` (the per-hit half of the old §6) ·
backlog §39 (anchor), §40 (the lifesteal note).

---

## 11. Chunk ledgers

(none yet)
