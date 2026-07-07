# Effect-System Foundations — Scaling the Effect-Type Vocabulary

> **Status: decided 2026-07-07; execution in progress — Steps 0+1 ✓ done
> (2026-07-07), next is Step 2 (status-effect framework): start at the §7
> briefing.** Decision record + plan for
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
- **Step 2 — status-effect framework (F7, F10): NEXT — full briefing in §7.**
  Generalize `ResistBuffs` into a typed-payload buff/debuff store (stat mod,
  DoT tick, control flag, absorb pool), same source-keying/stacking/aging
  semantics, cleanse API via entry enumeration. Control payloads apply to
  mobs only. First consumer candidates: DoT, root-as-debuff, mark.
- **Step 3 — spawned-entity lifecycle:** totem first (closest to expressible
  today: stationary mob + aura skill + `Decayer`-style TTL), then ownership/
  XP attribution; pets/clones/swarm build on it later.
- **Step 4 — shield layer:** absorb-pool buff payload + the absorb step in
  the two `takeDamage` sites; F6 decision record beforehand if armor
  pen/thorns/lifesteal are already in by then; wire field + HUD.
- **Then — cheap effect-type batch** (any time after Step 0, primitives
  permitting): life steal, execute, berserker, crit, resource theft, regen
  stat variants, bonus-vs-type. Each ≈ the resist-pair cost or less.

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

## 7. Step 2 briefing — status-effect framework (start here next session)

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
