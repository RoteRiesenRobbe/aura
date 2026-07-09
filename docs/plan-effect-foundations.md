# Effect-System Foundations — Scaling the Effect-Type Vocabulary

> **Status: decided 2026-07-07; execution in progress — Steps 0+1+2 ✓ done
> and verified in-game (2026-07-08). Step 3 (spawned-entity lifecycle) is
> NOT next in the build queue: per the decided execution order
> (roadmap.md "Execution order", 2026-07-08) it folds into execution step 2
> (mob depth) and must run AFTER World foundation chunk 4 rewrites the
> `MobSystem` respawn path (`plan-world-zones.md` §5 gotcha #7). When it
> comes up, start at the §8 briefing.** Decision record + plan for
> growing the effect vocabulary from 8 to ~25+ types. Closes the scripting
> question left open in `archive-scripting-options.md` (decision F1/F2 below);
> the factual data-vs-Go audit behind it lives in `archive-scripting-audit.md`.
> Input was a chat-side design discussion (Robert + Claude) over a concrete
> candidate list of ~35 effect ideas (§1), checked against the codebase.
> All numbers are [PLACEHOLDER], per the project-wide rule.

---

## 1. The demand side — candidate effect ideas

Collected 2026-07-07, unscoped, grouped by design intent. **None of these are
committed content** — they are the workload the architecture must be able to
absorb. Cost clustering (which engine primitive each needs) is in §5.

- **Damage-side:** life steal; execute (bonus damage below X% target HP);
  berserker (damage scales with caster's missing HP); crit chance/multiplier;
  armor penetration (ignore % of resistance); bonus damage vs specific damage
  types; damage reflection (thorns); chain damage (jumps to next target);
  on-death explosion; ramp-up damage (grows while the same target stays ticked).
- **Sustain:** increased regen; regen scaling with missing HP;
  overheal-as-temporary-shield; regen on kill; party-wide lifesteal; resource
  theft (target loses, caster gains, independent of damage).
- **Mobility/control:** speed; dash/blink (cooldown); root/slow as a target
  debuff; knockback; pull; teleport to ally; invisibility/stealth.
- **Summons:** ally-monster summon on-hit; temporary pet with a timer;
  totem/tower (stationary mini-aura); self-clone that draws aggro; swarm
  (many weak instead of one strong).
- **Crowd control:** charm (mob fights for the player for X s); fear (target
  flees uncontrolled).
- **World interaction:** ground effects (burning ground); temporary
  wall/barrier (interacts with planned LoS); blind debuff.
- **Team-utility debuffs:** mark target (visible / more vulnerable to
  everyone); taunt/anti-taunt (**parked to roadmap item 7** — needs the threat
  system that belongs to mob behavior).
- **Misc/cosmetic:** target size/color randomization (no combat effect); decoy
  duplicate (no combat value).

## 2. Findings (investigation 2026-07-07)

### 2.1 The dispatch seam is still clean; three frictions are forming

The per-type structure (`skills/definition.go` parse + validate,
`sys/skills.go` dispatch + behavior functions, `DerivedStats` fold for
passives) has absorbed 8 types without strain; a new type whose primitives
exist costs ~⅓ of a session (measured on the resist pair). But:

1. **`EffectDef` is at its flagged limit** — ~30 fields, a parallel private
   JSON mirror, and a hand-written field-by-field copy in `mapToEffectDef`.
   Its own doc comment calls for the per-type split "when the number of effect
   types grows substantially". 20 more types ≈ triple the fields.
2. **Validator copy-paste with hand-maintained applicability lists** —
   `mapDamageTags` / `mapVariance` / `mapResistFields` / `mapStatFields` all
   repeat the `isXEffect := type == A || type == B` + "fields only valid on…"
   shape. Every new type must be added to or excluded from every list; at 25+
   types that silently rots.
3. **Eligibility predicates duplicate** — the `targetsPlayers`/`targetsMobs`
   gate is already copy-pasted between `applyPlayerDamageAura` and
   `applyResistAura`; each new targeted effect adds another copy.

All three are contained mechanical Go refactors, cheap **before** the type
wave and expensive after → decision F5.

### 2.2 The cost is primitive-clustered, not per-type

"15–20 new types" is the wrong unit of account. Walked against the code,
roughly two-thirds of §1 bottoms out in a handful of missing engine
primitives; once those exist, most types are thin 30–80-line compositions
like the existing eight. Realistic budget: **~5–6 primitives of varying
weight, then ~20 mostly-cheap type additions on top.** The primitives:

| Primitive | Prior art in the codebase | Gap |
|---|---|---|
| **Faction/allegiance** | none — "friendly" is derived from `PlayerEntity` **type assertions** in every eligibility predicate | The real foundation under summons, charm, decoys. Must land before more predicates hardcode the type-assertion idiom. |
| **Status-effect framework** (entity-attached buffs/debuffs with own duration, caster-detached, cleanable) | `skills.ResistBuffs` is ~80% of the design (source-keyed, per-strength streams, refresh, strongest-wins-within-source, `Tick()` aging **already wired on player and mob** via `ResetTickNumbers`); mob slow (`slowFraction`/`slowTicks`) is the degenerate form | Generalize the payload (stat mod / DoT tick / control flag / absorb pool) instead of resist-specific. **Naming trap:** `model.StatusEffects` is a per-tick VFX flag set for the wire — feed it, don't unify with it. |
| **Spawned-entity lifecycle** (player-owned, time-limited entities) | `game.AddEntity` wires anything into all systems; mobs carry full `SkillComponent`s (a totem ≈ a velocity-0 mob with an aura skill — runtime spawn technically possible since Phase 6.1, nothing calls it); `DecaySystem`/`model.Decayer` is the TTL pattern; campfire/`HeatRadiator` is a stationary radius-effect precedent | Ownership: XP attribution for a pet's kills (the `NoteHealedBy` participation window is the attribution prior art), leash-to-owner AI, per-mob-look `EntityType` wire enum. Depends on faction. |
| **Shield/overheal layer** | none as mechanic, but the surface is bounded: all ordinary damage funnels through exactly two `takeDamage` sites (player, mob). Note the heal-aura self-cost deliberately **bypasses** `takeDamage` — whether self-costs pierce shields is a design decision. | Model the shield **as a status-effect payload** (buff with an absorb pool) → a client of the framework, not a third parallel system. Wire: one appended field per entity table + HUD/overhead rendering. |
| **On-death/on-kill event hook** | none — death is detected by polling in the state/mob systems; no event substrate | Needed by on-death explosion, regen-on-kill. Shape (poll vs. bus) decided with the first consumer, not speculatively. |
| Smaller, per-idea: attacker-feedback hook in `takeDamage` (thorns — `PlayerTouches`/`MobTouches` already carry the attacker; reflection loops need a guard rule), chain topology in `targeting.go`, physics impulse (knockback/pull) | — | Each self-contained; build when its effect is scheduled. |

### 2.3 Disproportionate-cost flag: stealth

True information hiding needs per-viewer filtering in the codec/viewport path
— the documented network-assembly hot path. Resolved by decision F9 (v1
stealth is cosmetic), which removes the expensive variant from scope.

## 3. Decisions (F1–F10)

- **F1 — Effect semantics stay hand-written Go effect types. No scripting
  engine (Lua/Starlark/…) for effects — taken off the table, not parked.**
  Rationale: the candidate list is primitive-heavy — a script can only compose
  capabilities the engine exposes, so scripting would relocate the *cheap*
  third of each type (parse/dispatch/math) into a runtime-error domain while
  the expensive two-thirds (primitives, wire, frontend) stay Go regardless.
  It would also trade the project's load-time-hard-fail + pinned-test
  correctness style for mid-tick runtime errors, VM lifecycle, and state
  persistence questions, and its classic wins don't apply here (the `go:embed`
  rebuild makes JSON and Go the same iteration loop; authorship is
  Robert + Claude, nobody is unblocked). At 25+ interacting types the hard
  problem is **composition semantics** (ordering: pen × resist × shield ×
  thorns × lifesteal) — Go primitives force those answers into one audited
  pipeline; scripts would scatter them.
- **F2 — Constrained expression layer (Option B) parked with an explicit
  trigger:** adopt only if item-12+ content authoring shows one-off
  conditional scaling fields multiplying (each new "curve personality"
  spawning another field pair). Execute/berserker alone don't justify it —
  they're plain optional fields on the damage effects.
- **F3 — Encounter-controller lean upheld:** Go structs per boss, no DSL
  (roadmap item 7's recorded lean; unaffected by this decision).
- **F4 — Infrastructure before effect types**, in dependency order: faction →
  status-effect framework → spawned-entity lifecycle → shield-as-buff. The
  event hook lands with its first consumer. Cheap effect types that need no
  new primitive may ship any time after F5.
- **F5 — Pre-refactors land before the type wave:** (a) split `EffectDef`
  into per-type param structs with per-type validation, (b) extract the
  shared eligibility predicate, (c) dev-mode disk-load flag for embedded
  `api/` content (the actual iteration-speed lever; endorsed by both archived
  scripting docs independently of this decision).
- **F6 — Damage-pipeline composition order gets its own decision record**
  (à la B1–B7/C1–C6) before any *two* of {armor pen, shield, thorns,
  lifesteal} coexist — the order is player-observable and effectively
  un-revisable once content depends on it.
- **F7 — Control effects (root, fear, knockback, pull, charm) are mobs-only
  in v1.** Player-affecting control means server-side input
  suppression/override in `core/input.go` and interacts with the
  input-starvation bridge and any future prediction — deferred as a class.
- **F8 — Faction model is binary for now:** player-aligned vs. hostile, as a
  runtime-changeable entity property (charm/decoy flip it), **not** baked
  into collision masks or derived from Go types.
- **F9 — Stealth v1 is cosmetic:** transparency + mobs drop aggro. No
  per-viewer information hiding (see §2.3).
- **F10 — Cleanse taxonomy: "everything cleansable"** until proven otherwise.
  No dispellable/undispellable classes in the framework's first cut; the
  entry enumeration the framework provides anyway keeps the retrofit cheap.

## 4. What to tackle now — sequenced plan

Each step is plan-first per the working style (state the plan, confirm, then
code), TDD'd, and independently shippable. Steps 1–4 are the F4 order.

- **Step 0 — pre-refactors (F5): ✓ DONE 2026-07-07.** `EffectDef` split into
  shared core + exactly-one per-type payload pointer with a per-type JSON key
  allowlist (unknown AND inapplicable keys hard-fail by name — the net caught
  a real stale `damageFraction` fixture on landing); shared
  `eligibleByTargetFlags` builder; `-content <dir>` flag loads the repo api/
  from disk (skips cp-defs + rebuild, boot log states the source). JSON
  format unchanged, gameplay identical, full suite green.
- **Step 1 — faction/allegiance (F8): ✓ DONE 2026-07-07.** `model.Faction`
  (Aligned/Hostile) on players + mobs; **JSON flags became faction-relative**
  — `targetsEnemies`/`targetsAllies` replaced `targetsMobs`/`targetsPlayers`
  (value-preserving per-caster-kind rename across all 11 flag-carrying skill
  files; stale keys hard-fail with a rename hint) — masks derive per caster
  faction (`AuraMaskFor(def, faction)`), eligibility gates on faction equality
  and requires a Factioned target (fixing the latent quirk where a capped
  damage aura could waste its maxTargets slot on a no-op placeable hit).
  Mob-vs-mob exclusion and no-friendly-fire are now the same faction rule.
  Deferred to their consumers: faction setter (charm), enemy-mask widening
  across layers (charm/summons), faction-aware mob aggro (item 7).
- **Step 2 — status-effect framework (F7, F10): ✓ DONE 2026-07-08, verified in-game 2026-07-08.**
  `skills.Buffs` (buffs.go) — ONE generic per-entity store with typed
  payloads (resist, slow, dot), inheriting ResistBuffs' source-keying/
  per-strength-stream/strongest-active-wins semantics; `ResistBuffs` deleted,
  the hand-rolled mob `slowFraction`/`slowTicks` folded in (slow now keyed by
  source skill, lifetime = tick interval + 1 — same convention, and the
  weaker-refresh-extends-stronger quirk is gone). First NEW payload: **dot**
  (`dot_aura`/`instant_dot` effect types) — duration independent of
  re-application, acting site at the top of `SkillSystem.processEntity`
  (aging stays on ResetTickNumbers), damage delivered through
  `PlayerTouches`/`MobTouches` so attribution/mitigation/floating numbers
  ride existing paths. `Cleanse()` in place (F10). Buffs die with the entity
  on death (pinned). Root/mark deliberately skipped — root is a slow-1.0
  payload when a consumer exists, mark needs the visibility decision (§6).
  Sub-decision record in §7.
- **Step 3 — spawned-entity lifecycle:** totem first (closest to expressible
  today: stationary mob + aura skill + `Decayer`-style TTL), then ownership/
  XP attribution; pets/clones/swarm build on it later. Briefing in §8.
  **Execution scheduled (2026-07-09): `plan-mob-depth.md` chunk 1** (the
  companion cooldown, chunk 6 there, is the second consumer); apply the §8
  banner's adaptations.
- **Step 4 — shield layer:** absorb-pool buff payload + the absorb step in
  the two `takeDamage` sites; F6 decision record beforehand if armor
  pen/thorns/lifesteal are already in by then; wire field + HUD.
- **Then — cheap effect-type batch** (any time after Step 0, primitives
  permitting): life steal, execute, berserker, crit, resource theft, regen
  stat variants, bonus-vs-type. Each ≈ the resist-pair cost or less.
  **⚠ `crit` is mechanically cheap but design-gated** — it reintroduces
  per-tick combat RNG, which the GDD (§12) deliberately rejected for
  misses/resists (RNG clashes with the positioning/timing skill expression and
  hits slow-ticking auras hardest). Left explicitly open, **undecided as of
  2026-07-09** (user lean (a): accept as a *sanctioned upside-only* RNG with a
  special crit number; alt (c): make it deterministic — every-Nth /
  cooldown-burst / positional). Resolve the RNG-consistency question (§6)
  before it ships.

Relationship to **item 12 (content pass)**: independent — item 12 needs no
new effect types to proceed and remains the prototype gate; these steps can
interleave with it. New types widen what item 12+ content can author.

## 5. Cost map of the candidate list

| Cluster | Ideas | Gate |
|---|---|---|
| Cheap now (math + existing primitives) | life steal, execute, berserker, crit, resource theft, regen variants (new `validStats` entries + application sites), bonus damage vs type (needs creature-type tags on `mobs.Factors` — small) | Step 0 recommended first |
| Armor penetration | thread a pen parameter through `model.Damage` into `ResistMultiplier` composition | F6 record |
| Status-effect framework | DoT, root, fear*, blind, mark, charm*, ramp-up (per-target stack buff), burning-ground debuff half | Step 2 (*and Step 1) |
| Spawned entities | totem, pet, clone*, swarm, decoy*, burning-ground entity half, wall/barrier (also: LoS interaction, roadmap item 6) | Step 3 (*and Step 1) |
| Shield | overheal-as-shield | Step 4 |
| Own primitive each | on-death explosion + regen-on-kill (event hook), thorns (attacker-feedback + F6), chain damage (targeting topology), knockback/pull (physics impulse; mobs-only per F7), dash/blink + teleport-to-ally (position set + collision sanity + frontend interpolation check) | when scheduled |
| Cosmetic | size/color randomization (wire fields, trivial gameplay), stealth-as-transparency (F9) | cheap, any time |
| Parked elsewhere | taunt/anti-taunt → roadmap item 7 (threat system) | item 7 |

## 6. Open questions (deliberately not decided yet)

- ⚑ F6 specifics: the actual composition order of pen × base resist × buffs ×
  shield × thorns × lifesteal, and whether lifesteal counts overkill —
  decide when the second of those effects is scheduled.
- ⚑ Event-substrate shape (poll vs. bus) — decide with the first consumer.
- ⚑ Buff/debuff **visibility**: do players see icons/timers for what's on
  them and on targets (wire + HUD footprint), or is v1 feedback purely
  VFX-level via `model.StatusEffects` flags?
- ⚑ Physics impulse design for knockback/pull (velocity-driven per-tick
  movement has no impulse concept) — parked until one is scheduled.
- ⚑ Does a charmed mob's aura credit the owning player XP (attribution rule
  shared with pets)?
- ⚑ **Crit's RNG-consistency gate** (new 2026-07-09): crit is cheap to build
  but reintroduces the per-tick combat RNG the GDD deliberately rejected for
  misses/resists (`gdd.md` §12). Decide before shipping crit — accept it as the
  *one* sanctioned (upside-only) RNG, reject it for consistency (lean on the
  shipped ±variance band), or make "crit" deterministic (every-Nth /
  cooldown-burst / positional). User lean = accept-with-nice-VFX (option a); the
  slow-tick swinginess is the open cost. Deferred to execution step 4.

## 7. Step 2 briefing — status-effect framework

> **RESOLVED 2026-07-08 — Step 2 shipped.** The six open sub-decisions below
> were settled as follows (the briefing is kept for rationale):
> 1. **Migration scope:** resist AND slow migrated into the store, dot as the
>    first new payload; root/mark skipped (no consumer / needs visibility).
> 2. **DoT attribution:** the payload carries the caster entity ref (`any` in
>    the skills package; `sys` type-switches) and the acting site replays it
>    through `PlayerTouches`/`MobTouches` — XP participation, kill credit,
>    tags, mitigation and floating numbers all come from the existing paths.
>    Disconnect policy = same as `mob.participants` (ref stays valid).
> 3. **Acting site:** top of `SkillSystem.processEntity` (runs for every
>    tracked entity, before serialization); pure aging stays on
>    `ResetTickNumbers` at tick start. Dots keep two counters: remaining
>    duration (aged at tick start) + acting accumulator (advanced at the
>    acting site, deliberately NOT reset on refresh).
> 4. **Visibility:** v1 is VFX-only — dot events stamp the fire
>    `aura_hit_style` and floating damage numbers come for free; **zero wire
>    changes**. Icons/timers stay an open §6 question.
> 5. **Death/respawn:** buffs die with the entity (store is an entity field,
>    not part of the carried SkillComponent) — pinned in
>    `TestDeathRespawn_RetainsSpellbookAndProgression`.
> 6. **Location:** `skills.Buffs`, one per player + mob, replacing the
>    `resistBuffs` fields.
>
> Duration authoring: `dotTicks` (event count) × `dotTickInterval` (cadence),
> buff lifetime = count×interval+1 — chosen over a raw duration so "3 events
> over 3 s" is exact at the expiry boundary.

Everything below was verified against the code on 2026-07-07 (post Steps
0+1). Goal: ONE generic entity-attached buff/debuff store with typed
payloads, replacing the per-mechanic containers before a third and fourth
copy appear (DoT, root, mark, shield all need one).

### Prior art to generalize (file references current)

- **`skills.ResistBuffs`** (`skills/resist.go`) is ~80% of the design and the
  semantics to inherit: entries keyed by **source skill**; within one skill,
  per-strength streams that age independently (a weaker refresh must never
  keep a departed stronger application alive); refresh = same factor bumps
  the stream's remaining ticks; **strongest active application wins within a
  skill, distinct skills stack**; `Tick()` ages and drops expired entries.
  Lifetime convention for aura-applied buffs: **effect tick interval + 1**
  (survives one tick boundary, fades ~one aura cycle after leaving range).
- **Lifecycle hook already wired on both entity kinds:** `ResetTickNumbers`
  calls `resistBuffs.Tick()` in `model/player/player.go` (~line 241) and
  `model/mob/mob.go` (~line 439). The framework's aging rides the same hook —
  but see open sub-decision 3 for payloads that *act* on tick.
- **Mob slow** (`mob.go`: `slowFraction`/`slowTicks` fields, `ApplySlow`,
  consumed in `moveTowards`) is the degenerate hand-rolled form: 2-tick
  lifetime, strongest wins, re-applied per tick. Folding it into the
  framework deletes the fields and the `slowable` special case.
- **Naming trap:** `model.StatusEffects` is the per-tick **VFX flag set** for
  the wire (cleared every tick, e.g. `DamagedAmbient`, `BurstFired`) — NOT
  this framework. The framework may *feed* it for client feedback; do not
  unify them.
- **Mark is nearly free:** "more vulnerable to everyone" is expressible as a
  resist-style buff with factor > 1 (vulnerability multiplier) — the resist
  payload generalized, plus a wire-visible flag for the "visible to everyone"
  half.

### Constraints already decided (do not re-litigate)

- **F7:** control payloads (root, fear, …) apply to **mobs only** in v1 —
  no player input suppression; mob consult points are `moveTowards`/AI.
- **F10:** everything cleansable; cleanse = enumerate entries + remove, no
  dispel classes in v1 (entry enumeration keeps the retrofit cheap).
- **F6:** before the absorb-pool payload coexists with armor pen / thorns /
  lifesteal, the damage-pipeline composition order needs its own decision
  record. Shield alone on top of today's pipeline is fine.
- Faction is live (Step 1): buff targeting via the existing
  `eligibleByTargetFlags`; new debuff-applying effect types get payload
  structs + allowlist entries per the Step-0 pattern (cheap).
- The defining upgrade over ResistBuffs: durations **independent of
  re-application** (a DoT keeps ticking after the target leaves the aura /
  the caster dies) — today's interval+1 convention is just one duration
  policy among several.

### Open sub-decisions to settle in the plan-first discussion

1. **Migration scope:** build the generic store and migrate `ResistBuffs`
   into it as the first payload (proves the design, deletes the special
   case), then slow, then DoT as the first NEW payload — or keep resist/slow
   parallel initially? (Lean: migrate resist at least; slow is trivial.)
2. **DoT attribution:** a DoT that outlives the caster's presence must carry
   the source player for XP participation (`mob.participants`), floating
   damage numbers, kill credit, and damage tags through the existing
   `takeDamage` paths. Decide the payload's source reference shape (player
   entity ref vs ID) and its behavior when the caster disconnects.
3. **Where acting payloads tick:** `ResetTickNumbers` is
   serialization-adjacent (it clears the floating-number accumulators) —
   a DoT dealing damage there would land in the wrong spot of the tick
   relative to SkillSystem (-65) and the accumulator reset. Likely answer: a
   dedicated tick site (in or next to SkillSystem) for payloads that *act*,
   while pure aging stays on `ResetTickNumbers`; verify the system priority
   chain (`printSystems` boot log) before deciding.
4. **Buff visibility (open question in §6):** v1 feedback via existing
   `model.StatusEffects` VFX flags only, or icons/timers (wire footprint:
   per-entity buff list — decide how much the client needs to see).
5. **Death/respawn:** do buffs/debuffs clear on death? (`carriedState` in
   `sys/state.go` stashes the SkillComponent — the buff store presumably
   does NOT carry over; make it explicit.)
6. **Where the store lives:** `skills` package like `ResistBuffs` (avoids
   the model↔skills import cycle); one store per player + mob replacing the
   `resistBuffs` field if sub-decision 1 says migrate.

### Definition of done (mirrors Steps 0/1)

Plan-first discussion → TDD (ResistBuffs' `resist_test.go` is the template;
behavior-test fakes already carry factions) → full suite green → boot smoke
via `-content ../api` → CLAUDE.md status + this doc updated → in-game check
of the first consumer (DoT or root on a mob).

## 8. Step 3 briefing — spawned-entity lifecycle

> **EXECUTION SCHEDULED (2026-07-09) → `plan-mob-depth.md` chunk 1.** Read
> this briefing **with `plan-mob-depth.md` §3.1's three adaptations** — it
> predates the 2026-07-09 dead-code sweep: (1) **no respawn-guard is needed
> at all** — the `generator` block/`RespawnBehavior` enum were deleted and
> the spawn-point `MobSystem` only respawns point-owned mobs, so a totem
> dies and stays dead (§8.1 item 4's `respawnBehavior:"None"` + §8.5 step 3
> are obsolete; replace with a pinned test); (2) "never spawns naturally"
> (weight/fixed 0) is automatic — only `zone.spawns` and the new `spawn`
> effect create mobs; (3) `NewMob` is now `NewMob(def, chaseIntoAuraMargin)`.
> The §8.4 sub-decisions remain open and are presented at chunk-1 start.
> Also decided in the mob-depth plan: **hostile mobs WILL aggro the totem**
> from its chunk 3 (faction-aware acquisition; entity-keyed threat credits
> the summon, XP the owner) — chunk 1 ships with mobs ignoring it as a
> known interim.

Written 2026-07-08 (expanded same day into a full implementation record for
a future session), verified against the code post Steps 0+1+2. Goal: the
FIRST spawned entity — a player-summoned **totem** (stationary aura carrier
with a TTL). Pets/clones/swarm/decoys build on the ownership machinery
later; they are explicitly out of scope here. All numbers [PLACEHOLDER].

### 8.1 Shape of the build — the totem is a mob

Almost everything already exists, because mobs run on the one SkillSystem:

- **Aura:** mob JSONs declare skill loadouts (Phase 6.1) — the totem's aura
  is one more mob-skill JSON, equipped and ticked by the existing machinery
  (`mob.NewMob` equips declared skills, first aura slot active).
- **Stationary:** `factors.speed: 0` → velocity `0.055 × speed` = 0 →
  `moveTowards` no-ops (`model/mob/mob.go`). Aggro scanning still runs but
  moves nothing; harmless.
- **Never spawns naturally:** `generator.weight: 0` — `wrand.NewWeightedChoice`
  skips weight-0 choices (`wrand/weighted.go:19`) — plus `fixed: 0` (the boot
  fixed-spawn loop in `cmd/berryhunterd/berryhunterd.go:136` iterates 0×).
- **The one new lifecycle piece — TTL + don't respawn:** `MobSystem.Update`
  (`sys/mob.go:40`) respawns ANY mob whose `Update` returns false via
  `respawnMob`. Needs a new `respawnBehavior: "None"` enum value as the
  guard; the TTL is a mob field set by the spawn site, decremented in
  `Mob.Update`, expiry returns false → the existing single removal path
  serves both TTL death and HP death, no rewards on either (kill rewards
  only flow through `PlayerTouches` → `tryGrantKillRewards`).
  **⚠ World-foundation cross-link (`plan-world-zones.md` §5 gotcha #7):**
  World chunk 4 REPLACES this exact respawn path with per-spawn-point
  respawn ("respawn only mobs that belong to a spawn point"). If that has
  landed by the time this step runs (it should — the decided execution
  order puts World first), a totem simply has **no spawn point → dies and
  stays dead**, and the `respawnBehavior: "None"` guard described here
  shrinks or disappears. Re-check `sys/mob.go` against this briefing
  before coding; the mob-JSON `generator` block may also be obsolete for
  world population by then (weight-0/fixed-0 below likewise).

New engine pieces, in dependency order:

1. **`spawn` effect type** (cooldown-fired; Step-0 payload pattern in
   `skills/definition.go`): `SpawnParams{MobName string, TTLTicks int,
   TTLTicksPerLevel float32}` — new payload struct + `effectKeys` allowlist
   entry (`spawnMob`, `ttlTicks`, `ttlTicksPerLevel`) + validator (empty
   name / non-positive base TTL hard-fail) + the exactly-one-payload rule.
   Dispatched from `fireCooldown` (`sys/skills.go`, next to
   instant_damage/instant_dot); a spawn always counts as "hit" (mob AI only
   consumes a cooldown when `fireCooldown` returns true — a spawn has no
   whiff). TTL at level = `skills.Scaled(ttlTicks, ttlTicksPerLevel, level)`
   (the one scaling convention).
2. **Spawn site plumbing:** `SkillSystem` gains a `model.Game` reference
   (`NewSkillSystem` signature change; constructed in `core/game.go`) for
   `AddEntity` + `Mobs()` + `Radius()` + `Config()`. The spawn case looks up
   the mob definition, `mob.NewMob(def, false, radius, margin)`,
   `SetPosition(e.AuraCollider().Position())` (caster position — decision
   8.4/6), sets faction/owner/TTL (below), `game.AddEntity(m)`. `sys`
   already imports `model/mob` (see `sys/mob.go`) — no new import cycle.
3. **Cross-validation of spawn→mob names:** skills load BEFORE mobs (mobs
   resolve their loadouts against the skill registry —
   `cmd/berryhunterd/loaders.go`, order items→skills→recipes→mobs), so a
   spawn effect cannot resolve its mob at skill-parse time. Validate in
   `mobs.RegistryFromFS` (it already receives the `skills.Registry`): after
   building the mob registry, iterate all skill definitions' spawn effects —
   unknown mob name hard-fails at boot naming skill + mob.
4. **Ownership — THE new work (§4):** `owner model.PlayerEntity` field on
   `Mob` + setter, plus a `model.Owned` interface (`Owner() PlayerEntity`).
   The two caster dispatch sites — `applyDamageAura`'s type-switch
   (`sys/skills.go:254`) and `tickDots`' caster replay (`sys/skills.go:199`)
   — check Owned FIRST: an owned mob's damage routes through
   **`PlayerTouches(owner)`** (i.e. `applyPlayerDamageAura(owner, …)` with
   the totem's faction + position), so XP participation, kill credit,
   kill-drop rolls, recipe cascade, floating numbers and damage tags all
   ride the existing player path unchanged. Owner nil → falls through to
   the mob path (mob-cast spawn, e.g. future boss adds, comes nearly free).
   This resolves the §6 attribution question for summons (charm stays open).
5. **Faction setter's first caller** (deferred in Step 1): add
   `Mob.SetFaction` — the spawn site sets `FactionAligned` when the caster
   is a player (in general: the caster's faction).

**Faction/layer — no mask widening needed yet:** author the totem's body
onto the **player layer** via the mob JSON's existing `collisionLayer`
field, and the 1:1 faction↔layer mapping (`model/auramask.go
factionLayers`) survives: hostile mob auras (enemy = player layer) can hit
the totem; the owner's own damage aura (enemy = action layer) can't; ally
auras (FireWard) buff it for free (it carries the generic `skills.Buffs`
store); heal auras skip it (eligibility requires `PlayerEntity` vitals —
the known item-7 gap, so **no heal totem in v1**, and mobs can't CAST heal
auras either, `healCaster` in sys/skills.go); mob aggro ignores it
(`findAggroTarget` filters `model.PlayerEntity`). The Step-1 mask-widening
note only triggers when an ALIGNED entity stays on the ACTION layer (charm).

**Wire footprint:** ONE appended `EntityType` enum value (`Totem`) in
`api/schema/common.fbs` + regenerated Go/TS bindings (append =
wire-compatible; regen via `api/schema/make.sh`, flatc v24.3.25). No new
fields, no new messages. **Frontend:** `Skills.ts` entry (SummonTotem —
ringless like Ignite), Totem entry in the mob rendering path
(`game-objects/logic/Mobs.ts` + GraphicsConfig) + placeholder SVG; if the
totem's aura should show a ring, the known `damageAuraRadiusMeters`
frontend-constant sync applies (CLAUDE.md tech-debt list).

### 8.2 Gotcha inventory (why past sessions got burned — read before coding)

- **`mob.NewMob` fatals on an unknown EntityType name** (`types[d.Name]`
  lookup → `log.Fatalf`, `model/mob/mob.go:28`). The FlatBuffers regen must
  land BEFORE `api/mobs/totem.json` exists in the embedded content, or the
  server won't boot. Do the schema/regen step first.
- **`respawnBehavior` parsing silently defaults**: `mapToMobDefinition`
  (`items/mobs/definitions.go:172`) does a map lookup without an ok-check —
  a typo'd `"none"` becomes RandomLocation silently. When adding the None
  value, ALSO add the missing ok-check hard-fail (project style; pin with a
  test). Keep `RespawnBehaviorNone` appended after the existing iota values
  (RandomLocation is the zero value and the implicit default).
- **`Mob.Update(dt) bool` does not satisfy `model.Updater`/`model.Decayer`**
  (those want `Update(dt)` without return) — that's why the TTL lives in
  MobSystem's existing removal path, NOT DecaySystem. Don't "fix" this by
  changing signatures; a second removal path would still need the
  no-respawn guard.
- **`Mob.Update` order matters:** the `health == 0` death check must stay
  FIRST (zombie-bug regression guard); decrement TTL after it. Note the
  out-of-combat regen (health < max, no aggro) also applies to the totem —
  harmless, TTL bounds its life; don't special-case it.
- **Owned-check order in type-switches:** a totem IS a `model.MobEntity`,
  so both dispatch sites must test `model.Owned` (with non-nil owner)
  BEFORE the MobEntity case, or attribution silently falls into
  `MobTouches` (no XP, no kill credit — mob-vs-mob damage has no
  participant tracking).
- **Embedded content:** `api/` JSONs are embedded via cp-defs
  (`make -C backend cp-defs`, included in `make build`); `go:embed` patterns
  need `*.json **/*.json` for subdirs (pinned by `pkg/api/skills` test —
  `api/skills/mobs/` is a subdir, TotemAura lives there).
  `TestDiskContent_RepoApiLoadsEndToEnd` validates repo `api/` directly.
  **`skills/milestone-unlocks.json` is code-adjacent and ALWAYS embedded**
  — even under `-content ../api`, a milestone edit needs cp-defs + rebuild.
- **Stale-server trap:** before any manual test `pkill berryhunterd`,
  rebuild (`go build ./...` does NOT refresh `./berryhunterd` — use
  `make -C backend build`), and check the boot log count pins
  (**19 skills / 7 milestone entries / 5 mobs** after this step).
- **Count pins to update:** `registry_test` (17→19 skills),
  milestone-unlocks pin (6→7), any mob-count assertions (4→5), and the
  CLAUDE.md boot-log gotcha line (`count=17`→`count=19`).
- **Collision layer arithmetic** (`model/layers.go`, 1<<iota from 0x1):
  PlayerStatic 1, Action 2, Weapon 4, Ressource 8, Heat 16, Border 32,
  Viewport 64, MobStatic 128, Player 256, Placeable 512. Default mob body
  layer = Viewport|Action = 66 (AngryMammoth authors 67 = +PlayerStatic to
  block players; mask 544 = Placeable|Border). **Totem: `collisionLayer`
  320 = Viewport(64)|Player(256)** — Viewport is required or clients never
  see it; Player is the faction-layer trick above. `collisionMask` 32 =
  Border only (non-blocking, nothing pushes it; NewMob's <=0 default would
  give it mob masks — author it explicitly).
- **`body.aggroRadius` is validated > 0** (`definitions.go:179`) even
  though the totem never moves — author a small dummy (0.1).
- **Skill ID conventions:** player auras 1–5, passives 10–11, cooldowns
  20–22 (NovaBurst/Heal/Ignite), combos 30 (PaladinAura), 40 (FireWard),
  mob skills 101–105. → **SummonTotem id 23, TotemAura id 106.**
- **`Skills.ts` duplication tech debt:** every new player-facing skill needs
  its id/name/maxLevel/category duplicated in the frontend `Skills.ts`.
  TotemAura is mob-only → no entry needed (mob skills aren't listed there —
  verify against how 101–105 are handled before assuming).
- **Owner ref goes stale on owner death/respawn** — the respawned player is
  a NEW entity; the totem keeps crediting the old ref. Accepted (decision
  8.4/2), same policy as `DotBuff.Caster` and `mob.participants`; TTLs are
  short. Don't build owner-liveness tracking.
- **Testing cheats:** `SKILL SummonTotem` grants the skill directly;
  `XP <amount>` levels; commands need `backend/tokens.list` + `?token=plz`.

### 8.3 Constraints already decided (do not re-litigate)

- F4 sequencing; F8 faction as runtime property. B/C damage semantics
  untouched — totem damage rides the existing roll-then-mitigate paths.
- **No cap system:** one-totem-at-a-time is a content convention
  (cooldownTicks ≥ TTL) — zero code (KISS/YAGNI). Revisit only if content
  wants deliberate multi-totem overlap.
- Working style: plan-first per sub-step, TDD, sanity checks
  (`go build ./...` + targeted `go test`) after every step, no autonomous
  commits.

### 8.4 Open sub-decisions to settle in the plan-first discussion

Leans presented 2026-07-08, not yet confirmed by Robert:

1. **Attribution scope:** owner credit = the full `PlayerTouches` path (XP +
   kill-unlock rolls + recipe cascade + participants) vs. XP only. Lean:
   full path — one code path, and the totem is an extension of the player.
2. **Owner lifecycle:** owner dies/disconnects → totem ticks out its TTL
   with the stale ref. Lean: accept (see gotcha above).
3. **Killable vs. invulnerable:** lean killable (player-layer body, HP
   pool; exercises the aligned-mob-as-target path charm will need — the
   mirror of `TestApplyDamageAura_SameFactionTargetExcluded`).
4. **Level scaling:** what does the summoning skill's level scale? Lean:
   TTL only in v1; the totem's aura level stays authored in the mob JSON
   (aura-follows-summoner-level is pets-era work).
5. **Content shape:** dedicated TotemAura mob-skill JSON vs. reusing
   DamageAura in the loadout. Lean: dedicated (independent tuning, follows
   the mob-skill convention).
6. **Spawn position:** at caster position vs. offset in heading direction.
   Lean: caster position (auras are radial; body non-blocking). Note
   `Mob.SetPosition`'s first call also initializes `spawnPosition` +
   the aggro sensor — call it exactly once at spawn.

### 8.5 Implementation sequence (TDD, each sub-step plan-first + green)

1. **Wire:** append `Totem` to `EntityType` in `api/schema/common.fbs`;
   regenerate Go (`pkg/api/BerryhunterApi`) + TS bindings. No behavior yet.
2. **skills parse:** `EffectTypeSpawn` + `SpawnParams` + allowlist +
   validator. Tests: `TestMap_SpawnEffect` (fields land, TTL scaling),
   `TestMap_SpawnEffectInvalid` (empty mob name / zero ttlTicks fail); the
   Step-0 allowlist net auto-covers unknown/misplaced keys.
3. **mobs:** `RespawnBehaviorNone` + unknown-string hard-fail; spawn→mob
   cross-validation in `RegistryFromFS`. Tests:
   `TestRegistry_UnknownRespawnBehaviorFails`,
   `TestRegistry_SpawnEffectUnknownMobFails`.
4. **Mob model:** `owner`/`SetOwner`/`Owner`, `SetFaction`, `ttl` +
   `SetTTLTicks` + Update decrement→false. `model.Owned` interface. Tests:
   `TestMob_TTLExpiryKills` (and death check still first),
   `TestMob_SetFactionAndOwner`.
5. **MobSystem:** respawn guard on `RespawnBehaviorNone`. Test:
   `TestMobSystem_NoneBehaviorDoesNotRespawn` (TTL death AND HP death).
6. **SkillSystem spawn:** game ref + `fireCooldown` spawn case (position,
   faction, owner, TTL, AddEntity, returns hit). Test:
   `TestCooldown_SpawnAddsOwnedAlignedMobWithTTL`.
7. **Attribution:** Owned checks in `applyDamageAura` + `tickDots`. Tests:
   `TestTotemAuraDamage_CreditsOwnerXPAndKillRewards` (participants, XP,
   drop roll, floating number via PlayerTouches),
   `TestTickDots_OwnedCasterCreditsOwner`,
   `TestTotem_KillableByHostileMobAura` (layer + eligibility end-to-end),
   `TestOwnedMobWithNilOwner_UsesMobPath`.
8. **Content [ALL PLACEHOLDER]:** `api/mobs/totem.json` (Totem: maxHealth
   ~50, speed 0, aggroRadius 0.1, weight/fixed 0, respawnBehavior "None",
   experience 0, no drops/unlocks, collisionLayer 320 / collisionMask 32,
   loadout TotemAura L1); `api/skills/mobs/totem-aura.json` (id 106,
   damage_aura or dot_aura, fire or physical — pick dot for a second dot
   consumer, nearest-1, interval ~30); `api/skills/summon-totem.json`
   (id 23, cooldown category, `spawn` effect, ttlTicks 300 ≈ 10 s,
   cooldownTicks 450 ≥ TTL); milestone level 6 in
   `skills/milestone-unlocks.json` (embedded! cp-defs + rebuild). Update
   count pins + `Skills.ts`.
9. **Frontend:** Totem rendering entry + SVG placeholder; Skills.ts;
   tsc + webpack green.
10. **Docs:** CLAUDE.md status + this §8 resolution banner (à la §7),
    `plan-skill-system.md` schema table row for `spawn`, memory update.

### 8.6 Definition of done (mirrors Steps 0–2)

Full suite green (`go test -timeout 60s ./...` from `backend/`) → tsc green
→ boot smoke embedded AND `-content ../api` (count pins 19/7/5, content
source line) → CLAUDE.md + this doc updated → in-game check:
`SKILL SummonTotem` → summon: totem appears at the caster with the right
look, its aura burns a nearby mob with floating numbers, **the OWNER gains
XP on the kill** (the defining assertion), FireWard-style ally auras can
buff it, a hostile mob aura can destroy it early, it expires after ~10 s,
and it never respawns. Then flip the §4 Step 3 line to DONE.
