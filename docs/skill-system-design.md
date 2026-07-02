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

> **Known, deliberate limitations (to be lifted for mob support behaviors,
> see `v1-roadmap.md` item 7):** `heal_aura` has no target flags yet — it
> implicitly targets players only. And mob entities cannot *cast* heal auras:
> the SkillSystem's `healCaster` capability split skips heal effects on
> casters without player vitals. Both block the planned "mob moves to allied
> mobs with a mob-only heal aura" support behavior; lifting them means target
> flags on `heal_aura` (like `damage_aura`) plus a vitals abstraction for the
> self-damage bookkeeping.

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

**Decided: no per-skill colliders.** An earlier revision gave every
`EquippedSkill` its own `*phy.Circle`; that design predates the one-active-aura
resolution (Open Question 2) and was never wired up — the physics system also
registers bodies only once at `AddEntity`, so per-equip sensors would need new
registration plumbing. Instead each entity owns a **single aura sensor**
(already in its `Bodies()`), and `SkillSystem` resizes it every tick to the
active skill's `EquippedSkill.EffectiveRadius()` — the level-scaled maximum of
`radius + (level-1)*radiusPerLevel` over the skill's effects. The resize
happens after physics resolution, so a new radius takes effect on the next
tick's collisions, consistent with the accumulator reset on switch.

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

*Status: implemented (Phase 6.1). Mobs run on the SkillSystem; the hardcoded
mob aura path is gone.*

Mobs carry the same `SkillComponent`. Because every mob had its own damage
values, **each mob has its own aura skill JSON** in `api/skills/mobs/`
(`DodoAura`, `SaberToothCatAura`, `MammothAura`, `AngryMammothAura`; IDs 101+
[PLACEHOLDER]), values migrated 1:1. Mob-relevant `damage_aura` extensions:
`structureDamageFraction` and `targetsStructures` (the former `damages: "All"`
of the AngryMammoth).

### Mob JSON shape

```json
{
  "id": 1,
  "name": "Dodo",
  "skills": [
    { "skillName": "DodoAura", "level": 1 }
  ]
}
```

`skillName` is resolved against the skill registry at startup (unknown name =
startup failure; load order is items → skills → mobs). `Body.DamageRadius`,
`Body.Damages`, `Factors.DamageFraction` and `Factors.StructureDamageFraction`
were removed from the JSON shape. The `mobs.Factors` struct keeps the two
damage fields as the **MobTouches payload**: the SkillSystem fills them from
the active skill's effect parameters and each target picks its fraction
(players: `DamageFraction`, structures: `StructureDamageFraction`) — the
legacy double dispatch is preserved 1:1. `body.aggroRadius` is now required
(the 4x-damage-radius fallback died with `DamageRadius`).

The aura sensor's collision mask is derived from the active skill's target
flags via `model.AuraMaskFor` (heal auras implicitly target players) — both
radius and mask are re-derived by the SkillSystem every tick, so **mob aura
switching works** the moment an AI/boss script calls `SetActiveAura`. The
whole JSON loadout is equipped into consecutive slots (slot 0 active on
spawn); mobs have no spellbook (`Spellbook == nil`). Mob damage moved from
`MobSystem` time (before physics) to `SkillSystem` time (after physics) —
same per-tick frequency, collisions one physics step fresher.

---

## Migration Plan

The goal is no build break longer than a few hours at any step. Old and new code
run in parallel until Phase 5.

**Execution order:** ~~3.7~~ → ~~1b~~ → ~~Phase 5~~ → ~~6~~ → 7 → 8 → 9.
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

### Phase 5 — Cleanup (~0.5 days) ✓ Done

Player- and wire-side legacy removal. (Mob-side legacy fields are removed in
Phase 6 instead.)

- ✓ Removed `applyDamageAura`, `applyHealAura`, `DamageAuraDamageFraction`,
  `HealAuraHealTickFraction`, `HealAuraSelfDamageTickFraction`,
  `ActiveAura`/`SetActiveAura` from `player/`. `AuraRadius()` was kept but
  re-sourced: it now returns the active skill's `EffectiveRadius()` (0 while
  Nothing is active) and feeds the retained `aura_radius` wire field.
- ✓ Removed `model.AuraType`, `model.AuraTypeDamage`, `model.AuraTypeHeal`,
  and `PlayerInput.Aura`.
- ✓ Removed all `DamageAura*`/`HealAura*` fields from `cfg.PlayerConfig`, the
  conf JSON schema, and all `conf*.json` files (`mobChaseIntoAuraMargin` stays
  — mob-side, Phase 6).
- ✓ Removed `active_aura` from `server.fbs Character`. **Decided:
  `aura_radius` stays** — all clients need it to size the ring, and it remains
  correct when Phase 7 adds level-scaled radii; its meaning is now "effective
  radius of the active aura, 0 = none".
- ✓ Removed `aura` from `client.fbs Input` and the `AuraType` enum from
  `common.fbs`; regenerated bindings for both sides in the same commit
  (field-ID shift on `Input` makes stale client bundles wire-incompatible —
  hard-reload clients after deploying).
- ✓ Frontend: removed the legacy `#auras` buttons, `setActiveAura()` (HUD and
  Character), the `AuraType`=slot hack, and `InputMessage.aura`.
- ✓ Removed the `[SkillSystem] tick` debug log and the dead
  `sys/equip/equip.go RemovePlayer`.
- ✓ **Decided: the `-2` deactivate sentinel stays.** Collapsing it onto `-1`
  would require a new schema default (e.g. `-128` as "no change") for purely
  cosmetic gain at real regression risk in the input path. The sentinel is
  tested and documented; revisit only if the field is ever redesigned anyway.

### Phase 6 — Mob chapter ✓ Done

*Formerly just "mob migration" (the original Phase 3); expanded to pair the
refactor with monster-kill unlocks so the chapter has player-visible payoff.*

**6.1 — Mob migration ✓ Done** (see Mob Integration above)

- ✓ `skills` field in all four mob JSONs; per-mob aura skill JSONs in
  `api/skills/mobs/` (values 1:1); `damage_aura` extended with
  `structureDamageFraction`/`targetsStructures`.
- ✓ `SkillComponent` initialized on mob construction; `SkillSystem` applies
  mob auras via the `MobTouches(Factors)` double dispatch (target flags are
  enforced for player casters too — behavior-neutral, the flags mirror the
  former hardcoded rules); the `skillEntity` interface was split so mobs
  don't need player vitals (heal effects on non-players are skipped).
- ✓ `Body.DamageRadius`/`Body.Damages`/`Factors.DamageFraction`/
  `Factors.StructureDamageFraction` removed from the JSON shape;
  `body.aggroRadius` required. The zombie-mob bug was fixed at the start of
  this chapter.
- ✓ Tests: mob-caster path unit tests + real-mob end-to-end via SkillSystem
  and phy.Space; sensor wiring (radius/mask from skill); mask derivation.
- **Decided: strict 1:1 migration.** All four mobs keep exactly today's
  behavior (radius, damage per tick). Differentiation afterwards is a pure
  JSON edit (which 6.3 then demonstrates).
- **Future-proofing (decided with the boss designation in 6.3):** the full
  loadout is equipped (not just slot 0) and radius+mask are re-derived per
  tick, so later boss scripts can switch auras; add spawning reuses the
  existing mid-game `game.AddEntity` path (`MobSystem.respawnMob` proves it).
  A brand-new mob *name* still needs an `EntityType` (schema+frontend); a
  small JSON `entityType` override is the known ~5-line addition when mob
  tiers (roadmap item 7) introduce variants. Mob *heal* auras (support
  behaviors) are deliberately not possible yet — see the `heal_aura`
  limitation note under Effect Types. Mob behavior requirements (base
  behavior, the three idle archetypes, individual placement/respawn) are
  owned by `v1-roadmap.md` item 7.

**6.2 — Monster-kill unlocks ✓ Done** (unlock source #2 from the vision)

- ✓ `unlocks: [{skillName, chance}]` in the mob JSON, resolved against the
  skill registry at load (unknown skill / chance outside `(0, 1]` = startup
  failure; absent chance = 1.0). On death, **every rewarded participant**
  (damagers + their recent healers, same set as the item-10 XP) rolls each
  unlock independently (`m.rand`); a win calls `Discover()` — the client-side
  spellbook diff (3.7) turns it into the glow with no wire event.
- ✓ First content: `WildAura` (player skill ID 3, damage-aura variant — wider
  ring, lower dps, values [PLACEHOLDER]); guaranteed from the AngryMammoth
  (boss designation in 6.3), 20% from the SaberToothCat [PLACEHOLDER].
- **Decided: mixed model.** The data model supports both guaranteed and
  chance-based unlocks (`chance`, `1.0` = guaranteed). Which mobs unlock
  which skills: content decisions, [PLACEHOLDER].
- **Decided: aura drops only until Phase 8** — a content decision, not a
  technical restriction (the spellbook is category-agnostic). A spellbook entry
  that can't be equipped or used reads as a bug, not a teaser; passive/cooldown
  drops are added in Phase 8 as a pure mob-JSON edit.

**6.3 — Boss designation ✓ Done** *(scope changed by decision: instead of a
new mob / elite variant, the existing big mob becomes the boss)*

- ✓ The **AngryMammoth is the boss**: already the biggest mob by far (body
  1.7 vs. 0.5, sprite 180–220 px vs. 60–80, `bossMobs` render layer, fixed
  single spawn, 1000 XP) — and now also the biggest aura. Implemented purely
  as data: `AngryMammothAura` gained per-level scaling (`radiusPerLevel`
  0.25, `damageFractionPerLevel` 0.002 [PLACEHOLDER]) and the mob equips it
  at **level 3** → effective radius 3.5, damage 0.0107/tick. This is the
  proof that data-driven mobs make content cheap: the boss designation is a
  level knob in two JSON files.
- ✓ Guaranteed `WildAura` unlock on kill (6.2) rounds out the boss reward.
- The original "one new mob purely in JSON" proof moved to roadmap item 7
  (mob tiers/variants), where the `entityType` override lands.

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

All legacy aura wire artifacts (`active_aura` on `Character`, `aura: AuraType`
on `Input`, the `AuraType` enum) were removed in Phase 5. `aura_radius` on
`Character` remains by decision: effective radius of the active aura in px,
0 = none active.

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

- **Respawn loses spellbook unlocks (BUG)** — on death, `sys/state.go` stores
  the player's progression (`LoseCurrentLevelExperience` — the level itself is
  kept) and restores it via `SetProgression` on re-join. But the new player
  entity starts with a fresh spellbook (DamageAura only), and
  `applyMilestoneUnlocks` fires only on level-*ups* inside `AddExperience` —
  so every milestone at or below the restored level (e.g. HealAura at 2) is
  unreachable forever after the first death. Kill unlocks (6.2) are equally
  lost but can at least drop again. Fix sketch: after restoring progression,
  re-apply milestone unlocks for `[1..level]` (`Discover` is idempotent).
  Natural fix window: Phase 7, which reworks the spellbook data model and
  raises the same "what survives death/respawn" questions (see also
  accounts/persistence, roadmap item 3).

- **Equip level=1 gap** — `SkillComponent.Spellbook` is `map[SkillID]bool`
  (discovery only; no per-skill level stored). `EquipSystem` therefore always
  equips at level 1. Revisit when skill-leveling is implemented.

- **Mob aura ring size is a frontend constant** —
  `GraphicsConfig.mobs.<mob>.damageAuraRadiusMeters` duplicates the effective
  radius of the mob's aura skill (player rings are wire-driven via
  `aura_radius`; mob rings are not). The values must be kept in sync manually
  when a mob's skill radius or level changes. Consider serializing mob aura
  radii (or reusing the skill-id → radius mapping) — becomes pressing when
  mobs switch auras mid-fight (boss scripts) or radii scale dynamically.

- **Single tick accumulator per equipped skill** — a multi-effect skill with
  differing `tickInterval` values would fire its shorter-interval effects on
  consecutive ticks near the shared reset (see ECS Integration, Known
  limitation). Move `TickAccumulator` per-effect before shipping such a skill.
  Pinned by `sys/skills_behavior_test.go` `TestSkillSystem_MultiEffectIntervalQuirk`.

- ~~**Zombie-mob bug**~~ — fixed at the start of the Phase 6 chapter:
  `mob.Update()` now checks for death before out-of-combat regeneration.
  Pinned by `model/mob/mob_test.go` `TestMob_Update_DeadMobWithoutAggro_Dies`.
