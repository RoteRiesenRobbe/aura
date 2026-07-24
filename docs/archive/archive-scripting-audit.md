# Scripting/Expression Layer — Part 1: Current-State Audit

> **ARCHIVED — question decided 2026-07-07, kept for the factual map.** The
> decision (stay on Go effect types; no scripting for effects) and the plan
> that follows from it live in `plan-effect-foundations.md`. §1's data-vs-Go
> map and §2's expressibility list remain accurate as of archiving and are
> referenced from there.

> **Original status: investigation only, no decision, no implementation.**
> Written 2026-07-06. Factual map of where gameplay logic lives as Go code vs.
> as data today. Options and trade-offs live in
> `archive-scripting-options.md`; the decisions that doc listed at its end
> were answered in `plan-effect-foundations.md` §3.
>
> One premise correction against the investigation brief: **Phase 9 (combos) is
> already built and shipped** (PaladinAura, committed 53d6c571, in-game
> verified). The "minimal implementation path" question is therefore answered
> by real code, and the wall it would hit is observable, not hypothetical.

---

## 1. The SkillSystem: what is data, what is Go

### Data-driven today (pure JSON edit, no code)

Everything in `api/skills/*.json`, parsed by `skills/definition.go` into
`SkillDefinition`/`EffectDef`:

- **Skill shell:** id, name, category (`active_aura`/`passive`/`cooldown`),
  maxLevel, cooldownTicks (+PerLevel).
- **Per effect — one of 8 fixed types** (`damage_aura`, `heal_aura`,
  `stat_multiplier`, `instant_damage`, `slow_aura`, `self_heal`,
  `resist_aura`, `resist_passive`), with type-specific parameters:
  - geometry & cadence: `radius`(+PerLevel), `tickInterval`(+PerLevel)
  - amounts: `damageHP`, `healHP`, `selfDamageHP`, `healFractionOfMax`,
    `slowFraction`, `resistFactor` (each +PerLevel)
  - targeting: `selector` (nearest / lowest_health / all), `maxTargets`
    (+PerLevel), `targetsMobs`/`targetsPlayers`/`targetsStructures`/`targetsSelf`
  - typing: `damageTags` (arbitrary strings, default `physical`), `resistTags`
  - presentation: `hitStyle` (auto/slash/fire/none)
  - passives: `stat` + `additivePerLevel`
- **Multi-effect skills** are data (PaladinAura = damage + heal effects, each
  on its own cadence via the monotonic accumulator).
- **Recipes** (`api/recipes/*.json`): result + ingredient thresholds, cascading
  fixpoint evaluation, hard-fail validation. Fully data.
- **Milestone unlocks** (`skills/milestone-unlocks.json`), **mob kill unlocks
  and mob stats/loadouts** (`api/mobs/*.json`: maxHealth, speed, aggroRadius,
  resistances, skills+levels, drop chances), **global balance** (`conf.json`).

The scaling model throughout is one fixed shape: `base + (level−1) ×
perLevel`, floored/clamped per field. Every new scaling axis historically
added a `*PerLevel` field pair to the fat struct.

### Hardcoded in Go today

- **The behavior of each of the 8 effect types.** Dispatch is a `switch` in
  `sys/skills.go:processEntity` (aura types) and `fireCooldown` (cooldown
  types); `stat_multiplier`/`resist_passive` fold into `DerivedStats` at equip
  time. Each case is a hand-written function: eligibility predicate, apply
  loop, side effects (XP participation via `PlayerTouches`, heal-XP window via
  `NoteHealedBy`, VFX stamping via `NoteAuraHit`).
- **The 3 selectors** (`sys/targeting.go`) and the eligibility rules per
  effect type (no friendly fire, never-heal-self, never-hit-caster).
- **The 3 valid stat names** (`validStats`) and — more importantly — their
  **application sites**: `movementSpeed` in `core/input.go`, `maxHealth` via
  `player.MaxHealthFactor`, `damageReduction` in `player.takeDamage`. A new
  stat is a validation entry *plus* a hand-placed hook where it takes effect.
- **Capability restrictions:** mobs can't cast heal auras / self-heals
  (`healCaster` interface split — deliberate, documented, lifted with roadmap
  item 7).
- **Transient-buff mechanics:** slow (2-tick decay, strongest wins), resist
  buffs (interval+1 lifetime, keyed by source skill, stacking rules), the
  min-1 HP rule, resist-multiplier composition order.
- **Damage math composition:** `takeDamage` on mob (base resistances × buffs)
  and player (resist passives × buffs × damageReduction).

### What it takes to add a new effect *type* today

Empirical checklist, derived from the most recent addition (`resist_aura` +
`resist_passive`, item 11 Phase 2, commit c0426e35):

1. `EffectType` const + `effectTypeMap` entry (`skills/definition.go`).
2. New fields on `EffectDef` + the private JSON mirror struct + mapping +
   load-time validation ("fields only valid on type X" hard-fails).
3. Behavior function + dispatch case in `sys/skills.go` (or the
   `DerivedStats` fold for passives).
4. **Often** a new capability interface in `model` (`slowable`,
   `resistBuffable`, `AuraHitNotifier`) implemented on player and/or mob.
5. **Sometimes** new state containers wired into the tick lifecycle
   (`ResistBuffs` on mob *and* player, aged in `ResetTickNumbers`).
6. **Sometimes** wire fields + FlatBuffers regeneration + frontend rendering
   (`aura_hit_style` needed all three).
7. Frontend `Skills.ts` metadata for any skill using it, plus per-skill-ID
   special cases in `Character.setActiveSkill` (ring style: `PALADIN_AURA_SKILL_ID`,
   `FIRE_WARD_SKILL_ID` are hardcoded constants).
8. Tests, `make cp-defs`, rebuild.

Observed cost: Phase 2 (two new effect types + the resist substrate) was one
focused session. Steps 1–3 — the part a scripting layer could replace — are
roughly a third of it. **Steps 4–7 (engine primitives, wire, frontend) are the
majority and no scripting layer removes them**: a script can only compose
capabilities the engine already exposes.

---

## 2. Combos: where the fixed effect-type model hits its wall

Phase 9 is live. The recipe machinery itself is fully data-driven and has no
expressiveness ceiling of its own — its results are just skills. So the wall
is entirely on the **result-skill side**:

**Expressible today (pure JSON):** any result that is a re-parameterized
bundle of the 8 types — multi-effect auras on independent cadences, any
selector/cap/tag/radius/level-curve mix, cross-category results. PaladinAura
(damage+heal at 70% of the bases) is exactly this and needed *one* engine fix
(per-effect cadence), which is now in.

**Not expressible today (each = a new Go effect type):**

- **Conditionals:** "double damage below 30% target HP", "heal becomes damage
  against `undead`-tagged targets".
- **State/ramping:** stacks, "damage grows the longer the target stays in the
  aura", combo-point mechanics.
- **Event reactions:** on-kill procs, retaliation when hit, "on ally death…".
  There is no event/proc substrate at all — effects are polled per tick.
- **Persistent effects:** a DoT that keeps ticking after the target leaves the
  aura (the resist-buff container is the closest primitive, and it is
  resist-specific).
- **Target topology:** chain/bounce, split-damage-among-N, "the same target
  can't be picked twice in a row".
- **Spatial/physics effects:** knockback, pull, teleport, projectile.
- **Meta effects:** summon an entity, transform the aura under a condition,
  modify a *different* equipped skill.

Note that most of these need a **new engine primitive anyway** (an event bus,
a generic buff container, a physics impulse API, spawn-from-skill). The fixed
model's real tax is that primitive + composition are welded together: the
composition ("under 30% HP, and only vs undead") can't be authored without
another Go round trip even when the primitives already exist.

---

## 3. Mob/boss behavior: what exists, and precedent

**What exists** (`model/mob/mob.go` + `sys/skills.go`):

- One universal behavior, ~150 lines: idle at spawn anchor → aggro nearest
  living player in `aggroRadius` → chase to just inside the aura edge → leash
  when the mob leaves its aggro territory → walk home → out-of-combat regen.
  Differences between mobs are **values only** (speed, radii, HP, loadout).
- Cooldown AI lives in the SkillSystem: fire any ready cooldown as soon as it
  would hit something (decided in 8.2: "smarter timing belongs to boss
  scripting later").
- Aura switching mid-fight (`SetActiveAura`) and runtime mob spawning are
  technically possible since Phase 6.1 — **nothing calls them from AI yet**.
- Mob JSON already carries the full loadout, so tiers (normal/elite/boss) are
  largely data.

**Precedent for script-driven behavior: none.** Upstream Berryhunter's mob AI
was the same hardcoded chase loop; there is no interpreter, DSL, or behavior
tree anywhere in the codebase or its history.

**What's planned** (roadmap item 7, already designed in outline):

- Three idle archetypes (stationary / local patrol / route patrol) —
  parameterized data + waypoints in map data, *not* scripting-shaped.
- Support behaviors (move to allied healer-mobs) — new behavior code + lifting
  the two heal limitations.
- **The encounter controller** — the one genuinely scripting-shaped gap
  (phases, sub-objectives, event-driven spawns, immunity gates, timed world
  state, dwell triggers). The roadmap records an explicit recommendation:
  **build it code-defined in Go (one struct per boss behind an interface),
  NOT a data-driven scripting DSL** — "with one boss to author, a DSL is
  YAGNI; revisit when there are many encounters and a non-engineer author."
  Any decision from this investigation has to either uphold or consciously
  overturn that recorded lean.

---

## 4. Other "new content = Go code + rebuild" friction points

- **`go:embed` makes *all* content a rebuild.** Skills, recipes, mobs, and
  milestones are embedded (`pkg/api/*`); even a pure JSON number tweak is
  `make cp-defs` + `make build` + server restart. So today the iteration loop
  for "data-driven" content and for Go code is **the same loop** — this is the
  single biggest iteration-speed tax and it is orthogonal to scripting. (A
  dev-mode disk-load flag would remove it for JSON and any future script files
  alike.)
- **Frontend `Skills.ts`** hardcodes id → name/maxLevel/category for every
  skill, plus per-skill-ID ring/VFX constants — every new skill (even a pure
  JSON combo result) needs a TS edit + frontend rebuild.
- **New mob *name*** requires an `EntityType` enum entry in `server.fbs` +
  regenerated bindings + frontend rendering class (documented ~5-line
  `entityType` override planned for reusing looks).
- **New stat name** for `stat_multiplier`: `validStats` + a hand-placed
  application site (by design — unapplied stats hard-fail).
- **New selector** or hit style: Go enum + map + implementation.
- **Cheats/commands** (`sys/cmd`): Go, fine (dev tooling).
- **conf.json**: restart to apply (no reload) — same restart friction class
  as the embed issue.

## 5. Summary picture

| Layer | Today | New *instance* | New *behavior* |
|---|---|---|---|
| Skill/aura values, scaling, targeting, tags | JSON | JSON edit (+ Skills.ts + rebuild) | — |
| Effect semantics (the 8 types) | Go | — | Go: enum+fields+dispatch, often model/wire/frontend too |
| Recipes / unlocks / milestones | JSON | JSON edit | — (mechanism complete) |
| Mob stats & loadouts | JSON | JSON edit | — |
| Mob behavior | Go (one shared loop) | values only | Go |
| Encounters/boss logic | does not exist | — | to be built (recorded lean: Go structs) |

The codebase's own trajectory is consistent: **mechanisms in Go, content in
data, validation hard-fails at startup** — and the fat-struct + dispatch seam
has absorbed 8 effect types without strain. The question the options doc
addresses is whether the *next* wave of content (combo results with novel
behavior, boss encounters) changes that calculus.
