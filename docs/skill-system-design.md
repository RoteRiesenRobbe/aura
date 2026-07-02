# Skill System Design

## Overview

The current aura implementation is hardcoded: two aura types (Damage, Heal) are
baked into `model/player/player.go` as concrete methods, with their parameters
living in `cfg.PlayerConfig`. This cannot support a spellbook, skill leveling, or
mob parity without growing into a wall of special cases.

This document describes a generic skill system that replaces that hardcoded logic.
Skills are defined in JSON (mirroring how items and mobs are already defined),
loaded into a registry at startup, and applied per-entity by a new `SkillSystem`
in the ECS game loop. Players and mobs use the same system. The two current auras
become the first two entries in `api/skills/`.

Scope: backend data model, ECS integration, wire protocol additions, and migration
path. Frontend rendering and unlock delivery (milestones, drops) are out of scope
here.

---

## Skill Data Model

### JSON Schema

Skills live in `api/skills/` as individual JSON files, one per skill. The registry
loader walks the directory exactly as the item registry does.

```
api/skills/
  damage-aura.json
  heal-aura.json
  swift-passive.json
  nova-burst.json
  ...
```

Top-level fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | int | yes | Unique across all skills |
| `name` | string | yes | PascalCase, used as identifier in code/logs |
| `category` | string | yes | `"active_aura"`, `"passive"`, or `"cooldown"` |
| `maxLevel` | int | yes | 1–N; all numbers [PLACEHOLDER] |
| `cooldownTicks` | int | cooldown only | Base cooldown at level 1 [PLACEHOLDER] |
| `cooldownTicksPerLevel` | int | cooldown only | Added per level; negative = shorter CD [PLACEHOLDER] |
| `effects` | array | yes | One or more effect definitions (see Effect Types) |

### Example 1 — Active Aura: Damage

```json
{
  "id": 1,
  "name": "DamageAura",
  "category": "active_aura",
  "maxLevel": 5,
  "effects": [
    {
      "type": "damage_aura",
      "radius": 1.0,
      "radiusPerLevel": 0.0,
      "damageFraction": 0.009,
      "damageFractionPerLevel": 0.002,
      "targetsMobs": true,
      "targetsPlayers": false
    }
  ]
}
```

All values marked [PLACEHOLDER]. `targetsPlayers: false` enforces the existing
no-friendly-fire rule declaratively rather than in code.

### Example 2 — Active Aura: Heal (with self-damage cost)

```json
{
  "id": 2,
  "name": "HealAura",
  "category": "active_aura",
  "maxLevel": 5,
  "effects": [
    {
      "type": "heal_aura",
      "radius": 1.0,
      "radiusPerLevel": 0.05,
      "healFraction": 0.001,
      "healFractionPerLevel": 0.0005,
      "selfDamageFraction": 0.0015
    }
  ]
}
```

`selfDamageFraction` is applied to the caster per tick that at least one ally was
healed, matching the existing behavior. [PLACEHOLDER] on all numbers.

### Example 3 — Passive: Movement Speed

```json
{
  "id": 10,
  "name": "SwiftPassive",
  "category": "passive",
  "maxLevel": 3,
  "effects": [
    {
      "type": "stat_multiplier",
      "stat": "movementSpeed",
      "additivePerLevel": 0.05
    }
  ]
}
```

`additivePerLevel` accumulates across levels: level 2 = +0.10, level 3 = +0.15.
Multiple `stat_multiplier` effects on the same stat stack linearly (see Passive
Stacking below). [PLACEHOLDER] on all numbers.

### Example 4 — Cooldown: Burst Damage

```json
{
  "id": 20,
  "name": "NovaBurst",
  "category": "cooldown",
  "maxLevel": 3,
  "cooldownTicks": 300,
  "cooldownTicksPerLevel": -20,
  "effects": [
    {
      "type": "instant_damage",
      "radius": 1.5,
      "radiusPerLevel": 0.1,
      "damageFraction": 0.15,
      "damageFractionPerLevel": 0.03,
      "targetsMobs": true,
      "targetsPlayers": false
    }
  ]
}
```

All [PLACEHOLDER]. `cooldownTicksPerLevel: -20` means level 3 has a 40-tick
shorter cooldown than level 1.

---

## Effect Types

### `damage_aura`

Deals damage per tick to every entity in range that matches the target flags.
Applied while the aura slot is toggled **on**.

| Parameter | Type | Description |
|---|---|---|
| `radius` | float | Base collision circle radius [PLACEHOLDER] |
| `radiusPerLevel` | float | Added per skill level [PLACEHOLDER] |
| `damageFraction` | float | Damage as fraction of target max-health per tick [PLACEHOLDER] |
| `damageFractionPerLevel` | float | Added per skill level [PLACEHOLDER] |
| `targetsMobs` | bool | Whether this hits mobs |
| `targetsPlayers` | bool | Whether this hits other players |
| `tickInterval` | int | Ticks between effect applications; default 1 [PLACEHOLDER] |

### `heal_aura`

Heals nearby allies per tick while the aura slot is toggled on. If at least one
ally was healed and `selfDamageFraction > 0`, the caster takes that much damage.

| Parameter | Type | Description |
|---|---|---|
| `radius` | float | Base collision radius [PLACEHOLDER] |
| `radiusPerLevel` | float | Added per skill level [PLACEHOLDER] |
| `healFraction` | float | Heal as fraction of target max-health per tick [PLACEHOLDER] |
| `healFractionPerLevel` | float | Added per skill level [PLACEHOLDER] |
| `selfDamageFraction` | float | Self-damage fraction per tick when healing occurred [PLACEHOLDER] |
| `tickInterval` | int | Ticks between effect applications; default 1 [PLACEHOLDER] |

### `stat_multiplier`

Additive bonus to a named stat. Applied on equip and re-applied on level-up;
not computed per tick.

Supported stat names (initial set, extensible):

- `movementSpeed`
- `maxHealth`

| Parameter | Type | Description |
|---|---|---|
| `stat` | string | Stat name (see above) |
| `additivePerLevel` | float | Bonus per level, stacks linearly [PLACEHOLDER] |

**Passive stacking**: if two `stat_multiplier` effects target `movementSpeed` with
values A and B, the total modifier is `A + B`. No multiplicative stacking.

### `instant_damage`

Single burst of damage in a radius, applied once when a cooldown skill is
activated. Creates a temporary `*phy.Circle` sensor, reads collisions on that same
tick, then releases it.

| Parameter | Type | Description |
|---|---|---|
| `radius` | float | Burst radius [PLACEHOLDER] |
| `radiusPerLevel` | float | Added per skill level [PLACEHOLDER] |
| `damageFraction` | float | Damage fraction per target hit [PLACEHOLDER] |
| `damageFractionPerLevel` | float | Added per skill level [PLACEHOLDER] |
| `targetsMobs` | bool | |
| `targetsPlayers` | bool | |

---

## ECS Integration

### Go Package Layout

```
backend/pkg/berryhunter/
  skills/
    definition.go   -- SkillDefinition, EffectDef, SkillID, SkillCategory, EffectType
    registry.go     -- SkillRegistry (same pattern as items.Registry)
    component.go    -- SkillComponent, EquippedSkill, Spellbook
  sys/
    skills.go       -- SkillSystem (new ECS system)
```

### SkillComponent

Attached to any entity that can use skills. Players and mobs both carry one.

```go
// MaxAuraSlots, MaxPassiveSlots, MaxCooldownSlots are [PLACEHOLDER] constants,
// e.g. 4, 4, 2 respectively.

type EquippedSkill struct {
    Def             *skills.SkillDefinition
    Level           int
    Collider        *phy.Circle // active_aura only: physics sensor
    CdTicks         int         // cooldown only: ticks remaining (0 = ready)
    TickAccumulator int         // active_aura only: ticks since last effect application
}

type SkillComponent struct {
    AuraSlots      [MaxAuraSlots]*EquippedSkill
    PassiveSlots   [MaxPassiveSlots]*EquippedSkill
    CooldownSlots  [MaxCooldownSlots]*EquippedSkill
    ActiveAuraSlot int                     // index into AuraSlots; -1 = none active
    Spellbook      map[skills.SkillID]bool // nil for mobs
}
```

Each `EquippedSkill.Collider` is a `*phy.Circle` allocated when the skill is
equipped into an aura slot and released when it is unequipped. Physics bodies from
equipped aura skills must be included in the entity's `Bodies()` return value so
the physics system keeps their positions in sync.

When `ActiveAuraSlot` changes, the incoming slot's `TickAccumulator` is reset to
0. The new aura cannot apply its first effect until a full `TickInterval` has
elapsed, closing the rapid-switch DPS exploit.

### SkillSystem

```go
// sys/skills.go
type SkillSystem struct {
    ecs.BasicSystem
    entities []skillEntity
}

// skillEntity is the minimal interface SkillSystem requires.
// Both PlayerEntity and MobEntity will implement it.
type skillEntity interface {
    SkillComponent() *skills.SkillComponent
    VitalSigns() *model.PlayerVitalSigns
    Basic() ecs.BasicFace
    MaxHealthFactor() float32
}
```

Per-tick behavior:

1. **Active aura slot**: Read `sc.ActiveAuraSlot` (−1 = none active). For that
   slot, increment `slot.TickAccumulator`. Each `EffectDef` whose `TickInterval`
   the accumulator has reached fires: read `slot.Collider.Collisions()` and apply
   the effect (scaling fractions by level). There is a **single accumulator per
   equipped skill**, not one per effect; it resets to 0 only once it reaches the
   maximum `TickInterval` across the skill's effects.

   > **Known limitation:** with multiple effects of *different* intervals on one
   > skill, a shorter-interval effect re-fires on every tick between reaching its
   > own threshold and the shared reset (e.g. intervals 2 and 3 → the interval-2
   > effect fires on ticks 2 *and* 3, then again on 5 and 6). Correct for all
   > current skills (each has a single effect). Move the accumulator per-effect
   > before shipping a multi-effect skill with differing intervals.
2. **Cooldown slots**: Decrement `CdTicks` by 1 if `> 0`. A cooldown skill fires
   (apply `instant_damage` effects) only when the game loop receives an explicit
   activation input for that slot index, and `CdTicks == 0`. After firing,
   set `CdTicks = computedCooldown(slot)`.
3. **Passive slots**: No per-tick work. Stat multipliers are applied once when a
   skill is equipped into a passive slot, and re-applied when the skill levels up.

### Game Loop Placement

`SkillSystem` runs **after** physics resolution (so `Collider.Collisions()` is
populated) and **before** `PostUpdate`. In `core/game.go:NewGameWith()` it is
registered between the existing `update` and `postupdate` systems.

---

## Mob Integration

*Status: not implemented — scheduled as Phase 6 (see Migration Plan). Mobs still
use the hardcoded aura path.*

Mobs get the same `SkillComponent`. The current hardcoded damage aura in
`model/mob/mob.go` (driven by `Body.DamageRadius` and `Factors.DamageFraction`)
becomes a `DamageAura` skill.

### Mob JSON changes

Add a `skills` array to each mob JSON:

```json
{
  "id": 1,
  "name": "Dodo",
  "skills": [
    { "skillName": "DamageAura", "level": 1 }
  ]
}
```

The registry loader resolves `skillName` to a `*SkillDefinition` at startup.
`Body.DamageRadius` and `Factors.DamageFraction` are superseded by the skill
definition's effect parameters and can be removed once all mobs declare skills.
During migration both can coexist (mob.go uses old fields if `skills` is absent).

Mobs have no spellbook (`Spellbook == nil`), no slot limits configurable by
players, and no switching — `ActiveAuraSlot` is fixed at 0 on spawn and never
changes.

---

## Migration Plan

The goal is no build break longer than a few hours at any step. Old and new code
run in parallel until Phase 5.

**Execution order:** ~~3.7~~ → ~~1b~~ → Phase 5 → 6 → 7 → 8 → 9.
**⚑** marks open decision points to resolve before (or during) the phase.

### Phase 1 — Skill package and registry (~1 day) ✓ Done

- Create `api/skills/` with `damage-aura.json` and `heal-aura.json` matching
  current hardcoded behavior exactly.
- Implement `pkg/berryhunter/skills/`: `SkillDefinition`, `SkillRegistry`,
  `SkillComponent`.
- Write unit tests: registry loads both JSON files, effect parameters parse
  correctly, invalid JSON returns error.
- No changes to player, mob, or ECS.

### Phase 2 — Player migration (~1 day) ✓ Done

- Add `SkillComponent` to the `player` struct, initialized with `DamageAura`
  and `HealAura` at level 1 in slot 0 and slot 1.
- Implement `SkillSystem` and register it in `core/game.go`.
- `player.Update()` delegates aura logic to `SkillSystem`; the old
  `applyDamageAura` / `applyHealAura` methods remain but are no longer called.
- Existing behavior is preserved: `SetActiveAura` maps to setting
  `SkillComponent.ActiveAuraSlot` (0 for damage, 1 for heal).
- Tests: player takes and deals correct damage after migration.

### Phase 3 — Spellbook chapter (milestone unlocks + equip) ✓ Done

*Renumbered: this phase was originally "Mob migration", which moved to Phase 6
(not yet scheduled). Substep numbers below match commit messages.*

- 3.1 ✓ New players start with only DamageAura in slot 0; HealAura no longer
  pre-equipped.
- 3.2 ✓ HealAura unlocks into the spellbook at level 2 via a milestone table.
- 3.3 ✓ Spellbook state sent to the owning client over the wire
  (`spellbook: [ushort]` on `GameState`).
- 3.4 ✓ Spellbook panel in the frontend (read-only).
- 3.5 ✓ Equip: `Equip` client message + backend `EquipSystem`;
  click-skill-then-click-slot UI. *(3.6, the equip UI, was folded into 3.5.)*
- 3.7 ✓ Unlock glow/pulse animation on the spellbook panel. **Decided: no
  wire event** — the spellbook is already streamed in full every tick, so the
  client detects fresh unlocks by diffing against the previous tick
  (`HUD.ts updateSpellbook`, now rebuilds the DOM only on change). An empty
  known list (join/death/respawn) is adopted as baseline without glow; safe
  because every spawn starts with DamageAura discovered. Any future unlock
  source (6.2 monster kills, Phase 9 combinations) gets the glow for free.
  Also added: `XP <amount>` cheat command (goes through `AddExperience`, so it
  exercises milestone unlocks) for manual testing.

### Phase 4 — Wire protocol update (~0.5 days) ✓ Done

- Add skill slot fields to FlatBuffers (see Wire Protocol Changes).
- Update `codec/` to serialize `SkillComponent` state.
- Update frontend to read new skill slot data. Old `active_aura` / `aura_radius`
  fields remain in the schema (deprecated, not removed yet) to avoid a hard
  frontend cutover.

*Implemented: `spellbook: [ushort]` on `GameState` (discovered skill IDs),
`aura_slots: [ushort]` on `Character` (equipped slot contents, positional),
`active_aura_slot` on `Input`, and `Equip` client message. Spellbook panel and
Aura Slots panel in the frontend. Wire format chose flat ushort arrays rather
than the originally planned `SkillSlot` table (see Wire Protocol Changes →
Rejected) — simpler given current needs.*

### Legacy aura UI replacement (steps 1a / 1b)

Separate track from the numbered phases; replaces the legacy `#auras` buttons
with the Aura Slots panel (`#auraLoadout`). Step names match commit messages
("1a", "1b") and are unrelated to Phase 1.

- 1a ✓ Panel activates/switches/deactivates the active aura: clicking an
  occupied slot sends `active_aura_slot`; clicking the active slot again
  deactivates via the `-2` wire sentinel to a server-authoritative **Nothing**
  state (`SkillComponent.ActiveAuraSlot = -1`). Optimistic client-side
  `.activeSlot` highlight.
- 1b ✓ Server-authoritative active-aura state, incoming. **Implemented as two
  fields, deviating from the plan above** (which wanted `active_aura_slot` on
  `Character`): `aura_slots` actually lives on `GameState` (owning client
  only), so other clients cannot resolve a slot index to a skill — and since
  `EquipSystem` allows the same skill in two slots, the owning client cannot
  derive the slot from a skill ID either. Therefore:
  `Character.active_skill_id` (ushort, 0 = Nothing) drives the on-character
  ring for **all** clients (style via the client-side `Skills.ts` mapping,
  resolved question 6; `Character.setActiveSkill` includes the previously
  missing "no ring" state), and `GameState.active_aura_slot` (byte, -1 =
  Nothing) drives the owning player's panel highlight, overwriting the
  optimistic click highlight each tick. Closes the spawn cosmetic gap. The
  per-tick ring application now reads only the new field; the legacy
  `active_aura` field still exists on the wire but is ignored (removed in
  Phase 5).

### Phase 5 — Cleanup (~0.5 days) — requires 1b

Player- and wire-side legacy removal. (Mob-side legacy fields are removed in
Phase 6 instead.)

- Remove `applyDamageAura`, `applyHealAura`, `DamageAuraDamageFraction`,
  `HealAuraHealTickFraction`, `HealAuraSelfDamageTickFraction`, `AuraRadius` from
  `player/`.
- Remove `model.AuraType`, `model.AuraTypeDamage`, `model.AuraTypeHeal`.
- Remove `DamageAuraRadius`, `HealAuraRadius`, `DamageAuraDamageFraction`, etc.
  from `cfg.PlayerConfig`.
- Remove `active_aura` from the `server.fbs Character` table. **Decided:
  `aura_radius` stays** — all clients need it to size the ring, and it remains
  correct when Phase 7 adds level-scaled radii; its meaning becomes "effective
  radius of the active aura, 0 = none".
- Remove `aura` field from `client.fbs Input` table.
- Remove `AuraType` enum from `common.fbs`.
- Frontend: remove the legacy `#auras` buttons, `setActiveAura()`, and the
  `AuraType`=slot hack.
- Remove the `[SkillSystem] tick` debug log.
- Remove dead `sys/equip/equip.go RemovePlayer` (see Deferred Tech Debt).
- Decide whether to change the `client.fbs` `active_aura_slot` schema default
  so the `-2` deactivate sentinel can collapse onto `-1` (requires regenerating
  bindings for both sides).

### Phase 6 — Mob chapter (~1–2 days)

*Formerly just "mob migration" (the original Phase 3); expanded to pair the
refactor with monster-kill unlocks so the chapter has player-visible payoff.*

**6.1 — Mob migration** (see Mob Integration above)

- Add `skills` field to all four mob JSON files.
- Initialize `SkillComponent` on mob construction from JSON-declared skills.
- `SkillSystem` handles mob aura application; mob-side hardcoded aura code is
  no longer called.
- Remove `Body.DamageRadius` / `Factors.DamageFraction` once all mobs declare
  skills.
- Tests: mob damages player correctly via SkillSystem.
- **Decided: strict 1:1 migration.** All four mobs keep exactly today's
  behavior (radius, damage per tick); tests compare old vs. new so any observed
  deviation is by definition a bug. Differentiation afterwards is a pure JSON
  edit (which 6.3 then demonstrates).

**6.2 — Monster-kill unlocks** (unlock source #2 from the vision)

- Certain mobs add a skill to the killer's spellbook on death; the client-side
  unlock glow (3.7 spellbook diff) picks this up automatically — no delivery
  work needed.
- Drop declaration lives in the mob JSON (e.g. an `unlocks` field).
- **Decided: mixed model.** The data model supports both guaranteed and
  chance-based unlocks from the start (e.g. a `chance` field where `1.0` =
  guaranteed). Which mobs unlock which skills, and the chance values:
  content decisions, [PLACEHOLDER].
- **Decided: aura drops only until Phase 8** — a content decision, not a
  technical restriction (the spellbook is category-agnostic). A spellbook entry
  that can't be equipped or used reads as a bug, not a teaser; passive/cooldown
  drops are added in Phase 8 as a pure mob-JSON edit.

**6.3 — First new mob or elite variant**

*Decided: fixed part of Phase 6 (no longer optional).* Proof that data-driven
mobs make content cheap: one new mob defined purely in JSON (different
skill/level loadout), no new Go code.

### Phase 7 — Skill leveling & skill points (~2–3 days)

Activates every `*PerLevel` parameter (currently dead weight) and closes the
equip-at-level-1 gap.

- Per-skill level storage: replace `Spellbook map[skills.SkillID]bool` with a
  structure storing a level per discovered skill.
- Skill points awarded on player level-up; a spend mechanic raises a skill's
  level up to its `maxLevel`.
- Wire: spellbook entries carry levels; spend/unspend messages client→server;
  `EquipSystem` equips at the stored level.
- **Decided: skill points buy skill levels only.** Slot counts are not
  purchasable with points — no competing point sinks. Slots may still grow via
  *milestones* (e.g. "player level N → additional aura slot", [PLACEHOLDER]):
  that is gifted progression, not a point sink, and stays open as an option.
- **Decided: free respec in v1.** Points can be unspent and redistributed at
  any time, no cost. Data-model consequence: level *decreases* are a
  first-class operation (equipped skills, active auras, and passive
  `DerivedStats` must all handle a level drop live). ⚑ Interaction with
  combination unlocks: see Phase 9 design (to be written during this phase).
- **Decided: spend UI lives in the spellbook panel.** Level + spend/unspend
  controls per entry, remaining-points display in the panel header. No
  dedicated skill screen in v1.
- **Decided: the full combinations design (Phase 9's design section) is
  written during this phase** — design only, no code. Recipes trigger on
  "skills X, Y at levels A, B", so the leveling data model must be shaped
  around the recipe check from the start.
- Points-per-level budget: number stays [PLACEHOLDER] (Open Question 1).

### Phase 8 — Passives & cooldowns (~2–3 days)

Implements the two designed-but-unbuilt skill categories (see Effect Types).
**Decided: passives first, then cooldowns** (8.1 has no input path and no new
wire field — the simpler half informs the harder one). Phase order is settled:
Phase 8 runs after Phase 7.

**8.1 — Passives**

- Equip into `PassiveSlots`; `stat_multiplier` applied via `DerivedStats` on
  equip, unequip, and level change (free respec means level *drops* too).
- Passives run in parallel — all equipped passives are active at once (unlike
  auras).
- Wire: `SkillCategory` enum added to `common.fbs`; passive slot contents
  serialized to the client; passive slot display in the UI.
- Spellbook UI splits into its three category sections (active auras /
  passives / cooldowns). **The passives section doubles as the game's
  "inventory":** item-flavored passives (e.g. a "Dagger" passive adding flat
  damage per tick) act as gear — there is no separate item/inventory system
  (see `v1-roadmap.md`, survival-system removal).

**8.2 — Cooldowns**

- Add `cooldown_activations: [ubyte]` to `client.fbs Input` (see Wire Protocol
  Changes → Planned); `instant_damage` via temporary `*phy.Circle` sensor;
  `CdTicks` bookkeeping in `SkillSystem`; cooldown slot contents + remaining
  ticks serialized to the client.
- **Decided: input is hotkeys + ability-bar click.** Keys (e.g. 1–4,
  [PLACEHOLDER]) and clicking the ability bar both send the same
  `cooldown_activations` entry.
- **Decided: mobs use cooldown skills in this phase too.** Simple AI rule to
  start: fire as soon as ready and a valid target is in range. Smarter timing
  (boss mechanics) belongs to mob-tiers/boss design later.
- UI: ability bar (v1.0 scope) with cooldown state per slot.

### Phase 9 — Combinations (size unknown) — requires 7 & 8

The curated recipe system. Deliberately last: it consumes everything the
earlier phases build (skill levels, all three categories, the unlock event).

- Recipe registry (JSON, mirroring the skill registry): ingredients are
  (skill, level) pairs, cross-category allowed; the result is a skill ID that
  can itself be an ingredient in higher recipes.
- Trigger check on skill level-up: when all ingredients of a recipe reach their
  required levels, the result unlocks into the spellbook (reuses the unlock
  event).
- Recipes are curated content, never documented in-game; added manually over
  time.
- **Decided: combination unlocks are permanent.** Once a recipe triggers, the
  result stays in the spellbook forever — even if ingredient levels later drop
  below the recipe requirement (free respec makes this reachable on purpose).
  Discovery of the secret recipe is the gate, not maintaining the levels.
- Variant auras (rare world drops) enter as ingredients later — out of scope
  for this phase.
- The full design section for this phase is written during Phase 7 (decided
  there). The prepared question catalog for that design pass lives in
  `docs/combo-design-questions.md`.

---

## Wire Protocol Changes

### Implemented

**`server.fbs`** — flat ushort arrays were chosen over the originally planned
`SkillSlot` table (see Rejected below):

```flatbuffers
// In table GameState (owning client only):
    spellbook:        [ushort];   // discovered skill IDs
    aura_slots:       [ushort];   // equipped aura slot contents, positional; 0 = empty
    active_aura_slot: byte = -1;  // active slot index for the panel highlight; -1 = Nothing

// In table Character (visible to all clients):
    active_skill_id:  ushort = 0; // skill ID of the active aura; 0 = Nothing (no ring)
```

(Earlier revisions of this document wrongly listed `aura_slots` on `Character`;
it has always been on `GameState`. The 1b fields are appended at the table ends
so existing field IDs stay stable.)

**`client.fbs`**:

```flatbuffers
// In table Input:
    active_aura_slot: byte = -1;   // requested active aura slot; -1 = no change

table Equip { ... }                // equip a spellbook skill into an aura slot
```

`active_aura_slot` is the client's requested active aura slot. The server
applies it each tick; switching to a new index resets that slot's
`TickAccumulator` to 0.

> **`-2` deactivate sentinel:** the `active_aura_slot` field kept its `= -1`
> schema default (`-1` = "no change / field absent"). Because FlatBuffers omits a
> scalar equal to its default, an explicit `-1` is indistinguishable from an absent
> field, so it cannot signal "deactivate". The client therefore sends a `-2`
> **deactivate sentinel** (paired constants `model.ActiveAuraSlotDeactivate` /
> `DEACTIVATE_AURA_SLOT`), which the server maps to `SkillComponent.ActiveAuraSlot = -1`
> (Nothing). Collapse `-2` back onto `-1` if the schema default is ever changed and
> regenerated (a Linux `flatc` is available via `make -C backend build`).

Legacy fields still present and deprecated until Phase 5: `active_aura` and
`aura_radius` on `Character`, `aura: AuraType` on `Input`, and the `AuraType`
enum in `common.fbs`.

### Planned

**With the cooldown-skill implementation (not yet scheduled) —
`client.fbs Input`:**

```flatbuffers
    cooldown_activations: [ubyte];  // cooldown slot indices to activate this tick
```

The server ignores any listed slot that is still on cooldown.

**`common.fbs` `SkillCategory` enum** — designed (`ActiveAura` / `Passive` /
`Cooldown`) but not added; not needed while only aura slots cross the wire. Add
when passive/cooldown slots are serialized.

### Rejected — `SkillSlot` table

The original design serialized per-slot tables
(`skill_id`/`skill_level`/`radius`/`cooldown_ticks`) in a single ordered
`skill_slots: [SkillSlot]` vector. Flat `[ushort]` ID arrays were chosen instead
(KISS): the current UI only needs skill IDs, and level/radius/cooldown state can
be added when something consumes them.

---

## Open Questions

1. **Skill point budget** (→ Phase 7): How many skill points does a player earn
   per level? This determines level caps in practice. *(Partially resolved:
   respec exists and is free in v1; points buy skill levels only; slots are not
   purchasable but may grow via milestones — see Phase 7. Only the budget
   number itself remains open, [PLACEHOLDER].)*

2. **[Resolved] Aura slot independence**: Only one aura is active at a time.
   The 4 aura slots are a loadout — players switch the active one per tick via
   `active_aura_slot`. Build variation comes from slot composition, combination
   unlocks, and switch timing, not simultaneous stacking.

3. **[Resolved] `instant_damage` sensor lifetime**: Use a temporary `*phy.Circle`
   per activation — create, read collisions, release within the same tick.

4. **[Resolved] Passive stat application**: `SkillComponent` computes a
   `DerivedStats` struct that overrides `cfg.PlayerConfig` values on equip and
   level-up. Config values are never mutated in place.

5. **[Resolved] Mob slot limits**: No hard cap. The mob's JSON is authoritative;
   all declared skills are loaded.

6. **[Resolved] Frontend aura rendering per slot**: Frontend maintains a local
   mapping from `skill_id` to visual style (color, ring graphic). The server sends
   only `skill_id`; style derivation is client-side.

7. **[Resolved] XP from SkillSystem**: XP stays in the `Interacter` interface.
   `SkillSystem` calls the same `PlayerTouches` path as today; no XP logic moves
   into the skill package.

8. **[Resolved] Spellbook wire format**: `spellbook: [ushort]` added to the
   `GameState` FlatBuffers table in `server.fbs`. Codec encodes the player's
   full discovered-skill-ID list each tick. Frontend reads it and renders the
   `#spellbook` panel; skills can be selected and equipped into aura slots via
   the `#auraLoadout` panel using the `Equip` client message.

---

## Deferred Tech Debt

Known issues to address in a future cleanup pass — not blocking current work.

- **`backend/pkg/berryhunter/net/net_test.go`** — not a real test; a manual
  `ListenAndServe` script with no timeout or teardown that hangs `go test ./...`.
  Fix via `t.Skip` or convert to a proper integration test. Safe test scope in
  the meantime: `go test -timeout 30s ./pkg/berryhunter/skills/... ./pkg/berryhunter/codec/... ./pkg/berryhunter/sys/...`

- **`sys/equip/equip.go` `RemovePlayer(equipEntity)`** — dead code. The ECS
  `Remove(ecs.BasicEntity)` method handles entity removal; `RemovePlayer` is
  never called. Remove in Phase 5 cleanup.

- **Equip level=1 gap** — `SkillComponent.Spellbook` is `map[SkillID]bool`
  (discovery only; no per-skill level stored). `EquipSystem` therefore always
  equips at level 1. Revisit when skill-leveling is implemented.

- **Dead aura code** — `applyDamageAura`, `applyHealAura`, the old `aura` wire
  field, and the `[SkillSystem] tick` debug log are all present as dead code.
  Phase 5 cleanup target (see Migration Plan above).

- **Single tick accumulator per equipped skill** — a multi-effect skill with
  differing `tickInterval` values would fire its shorter-interval effects on
  consecutive ticks near the shared reset (see ECS Integration, Known
  limitation). Move `TickAccumulator` per-effect before shipping such a skill.
  Pinned by `sys/skills_behavior_test.go` `TestSkillSystem_MultiEffectIntervalQuirk`.

- **Per-skill aura colliders are not wired up** — `SkillSystem.processEntity`
  reads `e.AuraCollider()` (the entity's single legacy aura sensor, sized via
  legacy `AuraRadius()`), not `EquippedSkill.Collider` (allocated per the
  design above but never read). Consequence: a skill's `radius` /
  `radiusPerLevel` effect parameters currently have **no effect** — every aura
  uses the legacy collider's radius. Works today because both skills use the
  same radius and the `AuraType`=slot hack keeps the legacy sizing alive;
  becomes real work in 1b/Phase 5 when the legacy path is retired.

- **Zombie-mob bug** — `mob.Update()` applies out-of-combat regeneration
  *before* the death check, so a mob reaching 0 health while it has no aggro
  target (reachable by kiting it out of its territory) heals above zero in the
  same tick and survives — with `deathRewardGiven` latched, so it never grants
  XP or drops again. `MobSystem` relies solely on `Update`'s return value.
  Fix: check health before (or immediately after) aura intake in `Update`.
  Pinned by `model/mob/mob_test.go` `TestMob_Update_DeadMobWithoutAggro_ZombieBug`
  — invert its assertions when fixing. Natural fix window: Phase 6 (mob chapter).
