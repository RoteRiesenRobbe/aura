# Item 11 (deferred) — HP system, resistances, stat variance

Graduates the "Deferred from item 11" block of `v1-roadmap.md` into an execution
doc. Three phases, in the mandated sequence. **All numbers [PLACEHOLDER].**

- **Phase 1 — Absolute HP.** *DONE (committed, verified in-game).*
- **Phase 2 — Resistances & damage tags.** *DONE (implemented 2026-07-06; in-game verify pending).*
- **Phase 3 — Stat variance & damage ranges.** *Documented below, NOT scheduled.*

Root problem shared by all three: today "HP" is a single normalized `Health`
fraction (0..1 of `vitals.Max`), identical for every entity, and damage is a
flat per-tick *fraction* of that. Overhead numbers are therefore faked on the
frontend (`HEALTH_DISPLAY_SCALE ≈ 1000`) and are approximate + inconsistent
across mobs. Phase 1 makes HP absolute; Phases 2–3 build on it.

---

## Phase 1 — Absolute HP (DONE)

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

## Phase 2 — Resistances & damage tags (DONE)

Implemented 2026-07-06 (Steps 1–4 in one session; in-game verify pending).
Roadmap-decided: damage/resist types are **arbitrary named string TAGS, not a
fixed enum** (so a bespoke `boss_x_lava` composes with general `fire`).
**Zero wire footprint, zero FlatBuffers changes** — the only frontend change is
cosmetic (FireWard ring style + `Skills.ts` entry).

### Resolved decisions (B1–B7, session 2026-07-05)

1. **B1 — Stacking by source.** Resist contributions are keyed by **source
   skill**: the same skill from two casters does NOT stack (strongest wins,
   mirroring `ApplySlow`); **distinct sources always stack multiplicatively**
   (two different skills, or a passive + an aura: 0.5 × 0.5 = 0.25). Across the
   tags of one hit, matching multipliers also multiply (general `fire` composes
   with bespoke `boss_x_lava`). Multiplicative stacking makes immunity
   unreachable by stacking alone — the result is 0 only if a *single source*
   grants 0 outright. Keeping immunities impossible-or-deliberate is a
   **content-design responsibility** from here on.
2. **B2 — Reserved default tag `physical`.** Untagged damage effects are
   normalized to `["physical"]` at parse time (`skills.DamageTagPhysical`), so
   armor-style resistance works against untyped damage (WoW-armor equivalent).
   There is no "matches nothing" damage.
3. **B3 — `Vulnerability` deleted.** Struct field, JSON key, and takeDamage
   fallback removed (all content was at 1 since Phase 1). A per-mob global
   damage-taken multiplier can come back later as a reserved `"*"` resist key
   if ever needed.
4. **B4 — Effect types.** `resist_aura` (active aura: `resistTags`,
   `resistFactor` + `resistFactorPerLevel`, `targetsSelf`, plus the usual
   radius/tickInterval/selector/maxTargets) and `resist_passive` (permanent
   self-resistance on passives, folded into `DerivedStats.Resistances`).
   Resistance only in v1 — no general transient-stat buffs. Auras may include
   the caster (`targetsSelf`, outside the target cap) or be allies-only —
   per-effect content choice.
5. **B5 — Bounds & display.** Multiplier per tag: 1 normal, 0.5 half, **0 =
   immune**, **> 1 = vulnerability**, no artificial cap (validation only
   requires ≥ 0). Post-resistance damage goes through the min-1 rule (a heavily
   resisted hit shows 1); a fully immune hit is a **non-event** (no HP loss, no
   floating number, no status effect, no hit VFX).
6. **B6 — "RESIST" styling deferred.** An immune hit currently produces no wire
   traffic at all. When content ships a real immunity, add a transient
   per-tick flag on `Mob`/`Character` (same lifecycle as `aura_hit_style`) and
   render "RESIST" — small, known change; do it then, not now.
7. **B7 — Ordering race accepted + pinned.** Buff lifetime = aura tick
   interval + 1, so a buff always survives one full tick boundary — a hazard
   tick landing before the aura re-applies is still resisted (pinned by
   `TestMob_ResistBuff_ComposesWithBaseAndExpires`). Worst case remains the
   very first tick after stepping into the aura; accepted, matches the
   "step out → damage resumes ~1 s later" feel.

### Implementation map

- **Hit payload:** `model.Damage{HP, Tags}` through `Interacter.PlayerTouches`;
  mob-cast hits carry tags in the payload-only `mobs.Factors.DamageTags`. Both
  `applyPlayerDamageAura` / `applyMobDamageAura` fill tags from the effect; the
  cooldown path reuses the same functions (NovaBurst is taggable).
- **Aggregation:** `skills.ResistMultiplier(tags, sources...)` — product over
  matching tags within a source, product across sources.
- **Transient buffs:** `skills.ResistBuffs` on mob + player (keyed by source
  skill; per skill the strongest **currently active** application wins, and
  applications of different strengths age as independent streams — a weaker
  ward's per-tick refresh never keeps a departed stronger ward's factor alive
  (in-game-found bug, pinned by
  `TestResistBuffs_StrongerApplicationFadesBackToWeaker`); `Tick()` on the
  `ResetTickNumbers` lifecycle); granted by `sys.applyResistAura` via the
  local `resistBuffable` interface (reuses the full targeting pipeline).
- **Damage time:** mob = base `factors.resistances` × buffs; player =
  `Derived.Resistances` (resist passives) × buffs; the untyped
  `damageReduction` passive stays as-is on top.
- **Dev/testing:** new **`SKILL <name>` cheat** (spellbook discovery + recipe
  cascade, same seam as real unlocks). Verification content [PLACEHOLDER]:
  `AngryMammothAura` now deals `["fire"]`; new **FireWard** aura (ID 40,
  `api/skills/fire-ward.json`): fire multiplier 0.6/0.5/0.4 at L1–3, allies +
  self, shows the heal-style ring.

### In-game verification (pending)

`SKILL FireWard` → equip → stand in the boss aura: floating numbers drop from
4 to ~2–3 (L1); step out of the ward → full damage resumes after ~1 tick.

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
