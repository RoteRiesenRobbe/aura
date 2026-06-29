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
   slot, increment `slot.TickAccumulator`. For each `EffectDef` in the skill's
   `Effects` slice, check whether `TickAccumulator >= effect.TickInterval`; if so,
   read `slot.Collider.Collisions()`, apply the effect (scaling fractions by level),
   and reset `TickAccumulator = 0`. Effects with different `tickInterval` values
   within the same skill each track the accumulator independently against their own
   threshold.
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

### Phase 1 — Skill package and registry (~1 day)

- Create `api/skills/` with `damage-aura.json` and `heal-aura.json` matching
  current hardcoded behavior exactly.
- Implement `pkg/berryhunter/skills/`: `SkillDefinition`, `SkillRegistry`,
  `SkillComponent`.
- Write unit tests: registry loads both JSON files, effect parameters parse
  correctly, invalid JSON returns error.
- No changes to player, mob, or ECS.

### Phase 2 — Player migration (~1 day)

- Add `SkillComponent` to the `player` struct, initialized with `DamageAura`
  and `HealAura` at level 1 in slot 0 and slot 1.
- Implement `SkillSystem` and register it in `core/game.go`.
- `player.Update()` delegates aura logic to `SkillSystem`; the old
  `applyDamageAura` / `applyHealAura` methods remain but are no longer called.
- Existing behavior is preserved: `SetActiveAura` maps to setting
  `SkillComponent.ActiveAuraSlot` (0 for damage, 1 for heal).
- Tests: player takes and deals correct damage after migration.

### Phase 3 — Mob migration (~0.5 days)

- Add `skills` field to all four mob JSON files.
- Initialize `SkillComponent` on mob construction from JSON-declared skills.
- `SkillSystem` handles mob aura application; mob-side hardcoded aura code is
  no longer called.
- Tests: mob damages player correctly via SkillSystem.

### Phase 4 — Wire protocol update (~0.5 days)

- Add skill slot fields to FlatBuffers (see Wire Protocol Changes).
- Update `codec/` to serialize `SkillComponent` state.
- Update frontend to read new skill slot data. Old `active_aura` / `aura_radius`
  fields remain in the schema (deprecated, not removed yet) to avoid a hard
  frontend cutover.

### Phase 5 — Cleanup (~0.5 days)

- Remove `applyDamageAura`, `applyHealAura`, `DamageAuraDamageFraction`,
  `HealAuraHealTickFraction`, `HealAuraSelfDamageTickFraction`, `AuraRadius` from
  `player/`.
- Remove `model.AuraType`, `model.AuraTypeDamage`, `model.AuraTypeHeal`.
- Remove `DamageAuraRadius`, `HealAuraRadius`, `DamageAuraDamageFraction`, etc.
  from `cfg.PlayerConfig`.
- Remove `active_aura` and `aura_radius` from `server.fbs Character` table.
- Remove `aura` field from `client.fbs Input` table.
- Remove `AuraType` enum from `common.fbs`.

---

## Wire Protocol Changes

### `common.fbs`

Add a `SkillCategory` enum:

```flatbuffers
enum SkillCategory: ubyte {
    ActiveAura = 0,
    Passive,
    Cooldown
}
```

### `server.fbs`

Add a `SkillSlot` table and a field on `Character`:

```flatbuffers
table SkillSlot {
    skill_id:        ushort;
    skill_level:     ubyte;
    radius:          ushort;     // active_aura: computed radius in game units * 100
    cooldown_ticks:  ushort;     // cooldown: ticks remaining (0 = ready)
}

// In table Character, add:
    skill_slots:       [SkillSlot];
    active_aura_slot:  byte = -1;  // index into the aura portion of skill_slots; -1 = none
```

`skill_slots` is ordered: aura slots first, then passive slots, then cooldown
slots. Slot index within each category matches the server-side slot array index.
The frontend uses slot index + category to render the correct UI.

### `client.fbs`

Replace the single `aura: AuraType` toggle with a slot index and cooldown
activations:

```flatbuffers
// In table Input, replace:
//   aura: AuraType = Damage;
// with:
    active_aura_slot:      byte = -1;  // which aura slot to make active; -1 = none
    cooldown_activations:  [ubyte];    // cooldown slot indices to activate this tick
```

`active_aura_slot` is the client's requested active aura slot. The server applies
it each tick; switching to a new index resets that slot's `TickAccumulator` to 0.
`cooldown_activations` is a list of slot indices; the server ignores any slot that
is still on cooldown.

After Phase 5, `AuraType` is removed from `common.fbs`.

---

## Open Questions

1. **Skill point budget**: How many skill points does a player earn per level?
   Is there a respec mechanic, and if so, what does it cost? This determines slot
   and level caps in practice.

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

8. **Spellbook wire format**: The spellbook (which skill IDs are discovered) is
   not currently sent to the client. A full spellbook sync is needed for the
   frontend to render the skill UI. Out of scope for this document — design TBD.
