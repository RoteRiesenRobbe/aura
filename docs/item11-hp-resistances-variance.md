# Item 11 (deferred) — HP system, resistances, stat variance

Graduates the "Deferred from item 11" block of `v1-roadmap.md` into an execution
doc. Three phases, in the mandated sequence. **All numbers [PLACEHOLDER].**

- **Phase 1 — Absolute HP.** *In progress / implementing.*
- **Phase 2 — Resistances & damage tags.** *Documented below, NOT scheduled.*
- **Phase 3 — Stat variance & damage ranges.** *Documented below, NOT scheduled.*

Root problem shared by all three: today "HP" is a single normalized `Health`
fraction (0..1 of `vitals.Max`), identical for every entity, and damage is a
flat per-tick *fraction* of that. Overhead numbers are therefore faked on the
frontend (`HEALTH_DISPLAY_SCALE ≈ 1000`) and are approximate + inconsistent
across mobs. Phase 1 makes HP absolute; Phases 2–3 build on it.

---

## Phase 1 — Absolute HP (implementing)

### Confirmed decisions (A1–A3)

- **A1 — Flat HP damage.** Auras/abilities deal absolute HP; the overhead number
  is the literal HP dealt. Every damage/heal fraction is re-authored as HP.
- **A2 — Wire: replace + `max_health`.** `health` / `damage_taken` /
  `heal_received` become absolute HP; a new `max_health` field is appended so the
  client draws `health / max_health`. `HEALTH_DISPLAY_SCALE` is deleted.
- **A3 — Shared HP scale.** One HP unit means the same for every entity. Base mob
  ≈ 100, player base ≈ 100 (scaled by the existing `MaxHealthFactor`). All
  [PLACEHOLDER].

### Model

- `health` and a new `maxHealth` are stored as **integer HP** (`vitals.VitalSign`
  / `uint32`, reinterpreted from "fraction of Max" to "HP points"). Satiety /
  BodyTemperature keep the old fraction meaning — only `Health` is reinterpreted.
- `HealthRatio()` = `health / maxHealth` (was `health.Fraction()`), so the
  `lowest_health` selector contract is unchanged.
- **Mob:** `maxHealth` comes from `factors.maxHealth` (new JSON field);
  `health` inits to `maxHealth`. `Vulnerability` stays as a per-mob damage-taken
  **multiplier** (kept at 1 in JSON for now; Phase 2 folds it into resistances).
- **Player:** `maxHealth = round(config.baseHealth × MaxHealthFactor())` (level +
  passive `MaxHealthBonus`). Leveling raises max; current HP stays and regens up
  (the old "preserves percentage by construction" note no longer applies).
- **Regen** (mob out-of-combat, player `updateVitalSigns`) becomes absolute:
  `maxHealth × fraction/tick`, clamped at `maxHealth` — same "seconds to full"
  feel, independent of the entity's max.
- **Rounding rule:** damage/heal applied per hit is rounded to the nearest
  integer HP, **min 1 when the raw value > 0** (a small hit never rounds to 0 —
  mirrors today's `vitalUnitsToDisplay` `max(1,…)`). Author per-hit values as
  small integers; slow-tick auras deal bigger chunks, fast-tick auras deal ≥1.

### Effect pipeline

- `EffectDef`: replace `DamageFraction`/`DamageFractionPerLevel`,
  `HealFraction`/`HealFractionPerLevel`, `SelfDamageFraction` with
  `DamageHP`/`DamageHPPerLevel`, `HealHP`/`HealHPPerLevel`, `SelfDamageHP`
  (JSON: `damageHP`, `damageHPPerLevel`, `healHP`, `healHPPerLevel`,
  `selfDamageHP`). `StructureDamageFraction` and `SlowFraction` are unchanged.
- `effectDamageFraction`/`effectHealFraction` → `effectDamageHP`/`effectHealHP`
  (return absolute HP, still `+ (level-1)×perLevel`).
- `takeDamage(fraction)` → `takeDamage(hp)`; heal path adds HP clamped at max;
  self-cost subtracts `SelfDamageHP`. `PlayerTouches`/`MobTouches` carry HP now
  (`mobs.Factors.DamageFraction` renamed → `Damage`); structures keep the
  separate fractional `StructureDamageFraction` path (decorative, out of scope).
- `instant_damage` (NovaBurst / stomp) and `self_heal` use the same HP helpers.

### Wire + codec

- `server.fbs`: append `max_health:uint` to `Mob` and `Character`; `health` /
  `damage_taken` / `heal_received` are now absolute HP (same field IDs, wire-
  compatible). Regenerate Go + frontend FlatBuffers bindings (flatc v24.3.25).
- Codec: add `MobAddMaxHealth` / `CharacterAddMaxHealth`; entities expose
  `MaxHealth()`.

### Frontend

- Read `entity.maxHealth()`; `setHealth(health, maxHealth)` → bar ratio
  `health / maxHealth`. HUD health bar fed the same ratio.
- `vitalUnitsToDisplay` becomes identity (`Math.round`); `damage_taken` /
  `heal_received` are already absolute HP → shown directly. Remove
  `HEALTH_DISPLAY_SCALE` and the `Mob.MAX_HEALTH` / `Character.MAX_HEALTH`
  constants.

### Config

- Add `game.player.baseHealth` (player base max HP, [PLACEHOLDER 100]) →
  `PlayerConfig.BaseHealth`, default 100.

### Proposed placeholder numbers (to confirm)

| Entity        | maxHealth |
|---------------|-----------|
| Player (base) | 100       |
| Dodo          | 40        |
| SaberToothCat | 60        |
| Mammoth       | 120       |
| AngryMammoth  | 400 (boss)|

Per-hit damage/heal HP are converted from the current fractions so DPS/HPS and
"hits-to-kill" stay roughly where they are today; all `vulnerability` set to 1.
Exact per-effect values decided during the edit and flagged [PLACEHOLDER].

### Tests (TDD, Go)

- HP subtract clamps at 0; heal clamps at maxHealth; min-1 rounding rule.
- Regen in absolute units, "seconds to full" independent of maxHealth; no revive
  from 0.
- `HealthRatio` from arbitrary maxHealth; `lowest_health` selector unchanged.
- Mob inits from `factors.maxHealth`; player `MaxHealth` from base × factor.
- Effect HP scaling by level.

### Checkpoint

In-game verify truthful/consistent overhead numbers + health bars; balance pass
before Phase 2.

---

## Phase 2 — Resistances & damage tags (TODO, not scheduled)

Roadmap-decided: damage/resist types are **arbitrary named string TAGS, not a
fixed enum** (so a bespoke `boss_x_lava` composes with general `fire`).

### Sketch

- **Damage carries tags.** `EffectDef.DamageTags []string` (JSON `damageTags`),
  e.g. `["physical"]`, `["fire","boss_x_lava"]`. Untyped default TBD (see Q).
- **Mob resistances.** `factors.resistances map[string]float32` (per-tag
  multiplier; default 1.0). Applied damage = base × aggregate of matching-tag
  multipliers; the overhead number reflects the **post-resistance** value.
- **`Vulnerability` folds in** as the untyped/default multiplier (or is removed).
- **Buff / resist auras.** A `heal_aura`-shaped effect that grants a *transient*
  resistance to allies in range, modeled like `slow_aura` (re-applied each tick,
  short fade → step out of the aura, start taking damage ~1 s later). Enables the
  lava-bridge / carrier role (roadmap item 7). "Current resistance" becomes an
  **aggregated** value at damage time (base + passive + aura-granted), extending
  `skills.Derived`.

### Open questions (answer before implementing)

1. **Aggregation across sources.** Multiple resist sources for the same tag —
   multiply (0.5 × 0.5 = 0.25) or add-then-clamp? What is the floor (immunity =
   0?) and can a value exceed 1 (a *vulnerability* to a tag)?
2. **Untyped damage.** Is damage with no tag treated as a reserved `physical`
   tag, or as "matches nothing / always full damage"? Do all existing auras get
   an explicit default tag in the content pass?
3. **`Vulnerability` fate.** Fold today's per-mob `vulnerability` into the
   untyped resistance multiplier, or drop it entirely once maxHealth exists?
4. **Buff-aura effect type.** New `EffectType` (e.g. `resist_aura` / `buff_aura`)
   or a flag on `heal_aura`? What stat(s) can it grant in v1 (resistance only, or
   general transient stat)? How is the granted resist stored on the target — a
   transient tag→multiplier map with a fade counter, mirroring `slowFraction` /
   `slowTicks`?
5. **Resist bounds & representation.** Multiplier per tag (`{fire:0.5}`) vs.
   percentage; default/uncapped bounds; how a resisted-to-near-zero hit reads in
   the overhead number (show 0? show 1 via the min-1 rule? special "resisted"
   styling?).
6. **Wire visibility.** Does the client need to distinguish resisted hits (tint /
   "RESIST" text), or is the smaller number enough for v1? (Likely defer.)
7. **System ordering.** Confirm the transient-buff model fully sidesteps the
   race where a hazard tick lands before the resist aura re-applies (the reason
   for modeling it like `slow_aura`).

---

## Phase 3 — Stat variance & damage ranges (TODO, not scheduled)

Cheap once Phases 1–2 land; near-pointless before them (fractional HP hides the
effect). The "no two encounters feel identical" axis + the hook for elite/level
scaling.

### Sketch

- **Mob HP range.** `factors.maxHealth` becomes a range (min/max or
  base + variance); rolled **at spawn**, server-authoritative, sent once via
  `max_health`. Same mob type no longer identical.
- **Damage ranges.** `damageHP` becomes a range (`damageHPMin` / `damageHPMax`),
  rolled **per hit**.
- **No crit styling** yet (confirm not needed).

### Open questions (answer before implementing)

1. **Variance source & determinism.** Free RNG or seeded/reproducible? Mob HP
   fixed at spawn (mob already has `m.rand` seeded by entity ID — reuse for HP)
   and each hit rolled per-tick from the caster's/target's RNG?
2. **Scope.** Mobs only initially, or players too? (Proposal: mobs only.)
3. **Range representation.** Absolute min/max, or base ± percentage variance?
   Same choice for HP and for damage, or independent?
4. **Interaction with resistances.** Roll damage first then apply resistance, or
   vice-versa (equivalent for a linear multiplier, but fix the order for the
   overhead number and any future non-linear resist).
5. **Balance surface.** Do ranges widen for elites/bosses (tier-scaled variance),
   or is variance a flat ± for all mobs in v1?
6. **Display.** Show the exact rolled number (current intent); confirm high rolls
   don't need distinct styling.

---

## Cross-cutting

- A single balancing pass rides with Phase 1 (every placeholder fraction
  re-expressed as HP) and is revisited after each phase — ties into item 12's
  content pass.
- Rough cost (roadmap): Phase 1 ≈ one Step (mechanical but touches balance
  everywhere + one FlatBuffers migration); Phases 2–3 small-to-medium, cheap once
  Phase 1 lands.
- Sequence is fixed: **HP units → resistances/tags → variance.**
</content>
</invoke>
