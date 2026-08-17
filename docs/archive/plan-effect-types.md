# Plan: New effect types, round 1 (vulnerability · retaliate damage · invulnerability · ally speed)

**Status: COMPLETE 2026-08-17 - all four chunks shipped (C1 `e2261f6f` · C2 `6d79c40c` · C3 `1846dfe6` · C4 `dfdd7281`), archived. Ledger in §9.**
**Source list:** `content-ability-matrix.md` §7 (the vocabulary-hole list the
PO ruled must close before the content pass), picks + rulings PO 2026-08-15.
**Survey verified at `3b2892ed`; re-verify line refs at execution.**

Four items, each its own execution chunk, ordered cheapest first. The other §7
holes (silence, cleanse, knockback, ground-targeting, conditional triggers,
stealth) stay open; the projectile prototype has its own plan
(`plan-prototype-projectile.md`, separate branch posture).

---

## 1. Scope (PO picks + rulings, 2026-08-15)

- **C1 - Vulnerability debuff (enemy-facing).** §7's original item: enemies
  take increased damage, the exploit mechanism for resist lines. Kept
  alongside C3 by explicit ruling ("keep both").
- **C2 - `retaliate_damage`.** The `retaliate_slow` twin (the *Fire Shield*
  idea). **Full attribution ruled**: a reflect kill grants XP and kill credit
  like any other damage the player deals.
- **C3 - Invulnerability grant (ally-facing).** A cooldown that grants the
  nearest ally 5 s [PLACEHOLDER] of immunity to all damage; 3 levels, each
  level +1 protected player. Plus an aura variant that grants it periodically
  to the nearest ally, with a real cost per application. Cost lever ruled:
  **buff lifetime = tick interval** (§3 D7), accepting the flicker window.
  Point pricing: **global curve for now**; the want for per-skill cost
  control is recorded (§8), not built.
- **C4 - Ally speed buffs.** *Fly, You Fools!* (`content-auras.md:37`).
  **Both shapes from the start** (aura + cooldown burst); **speed-only**;
  **invisible-buff accepted** (movement is self-evidencing; a pip is a
  §39 / effect-foundations §6 conversation this plan must not enter).

Ruled out of this round, recorded so nobody re-proposes them: player-targeted
CC (out of v1 by standing ruling), resource drain (excluded by design), root
(already exists: a 100 % slow stands and swings), stealth (blocked on §39).

## 2. Why this is cheap (survey 2026-08-15 at `3b2892ed`)

- **The damage math already knows vulnerability.** `skills.ResistMultiplier`
  documents `> 1 = vulnerable` (`skills/resist.go:14`), and the loader
  accepts any `resistFactor >= 0` (`skills/definition.go:1707`), so an
  amplifying factor loads clean today.
- **Resist auras already honor `targetsEnemies`.** `applyResistAura` runs
  through the shared `eligibleByTargetFlags` predicate
  (`sys/skills.go:1163`, predicate at `:624`): same-faction gated by
  `targetsAllies`, opposing by `targetsEnemies` + `mayHarm`.
- ⚑ **One real defect found (C1's fix):** the buff-store read side picks the
  stream with the *lowest* factor per source as "strongest"
  (`skills/buffs.go:545`). Correct for resists, inverted for
  vulnerabilities: two casters at different levels of the same vuln skill
  land the *weakest* one.
- **Immunity already is the resist system.** Factor 0 = immune, and
  "immunities must be deliberate content, not an emergent stack" is the
  recorded design rule (`skills/resist.go:29`). Invulnerability = a resist
  buff covering every tag at factor 0.
- **The wildcard bubble is a pre-announced one-liner.** The buff store's
  tag-list resists deliberately never learned `"*"` - "no consumer; one
  line when content wants a resist-everything bubble" (`skills/resist.go:74`,
  §4.1 recorded-not-built). C3 is that consumer.
- **The cooldown template exists.** `applyInstantHot` / `applyInstantShield`
  already do one-shot query circle + `targetsAllies` + selector +
  `effectiveMaxTargets` (`sys/skills.go:1301`). An `instant_resist` case is
  a near-verbatim twin, filling the resist row's empty cooldown cell in the
  §2 dispatch grid.
- **C3's leveling shape is authorable today**: `maxLevel: 3`,
  `maxTargets: 1` + `maxTargetsPerLevel: 1` (§1.7 knobs). Authored buff
  lifetimes have precedent: `retaliate_slow` authors its lifetime outright
  (`skills/definition.go:986`).
- **Per-skill point costs do NOT exist** (the one thing C3 wanted that
  isn't there): pricing is the single cap-relative curve
  (`skills.PointCost`, `skills/component.go:790`, numbers-rewrite D10).
  maxLevel 3 prices L2 = 1, L3 = 2 points. Ruled: global curve for now.
- **The cost rule is confirmed**: an aura charges only when application did
  *work*; a refresh at the same factor is not work
  (`skills/buffs.go:224`, `sys/skills.go:1147`, §5.2). Untouched, an invuln
  aura would pay once and hold the ally immortal for free - hence D7.
- **The retaliate trigger site is clean and singular**:
  `player.retaliate` (`model/player/player.go:778`), called from
  `MobTouches`, the one funnel both mob→player damage paths pass through
  (direct hits and DoT ticks). The derived-stats fold precedent is
  `EffectTypeRetaliateSlow` in `skills/component.go:612`.
- **Ally speed groundwork exists**: `Buffs.ApplySpeed` on players and mobs
  (`skills/buffs.go:258`; sys-side interface `sys/skills.go:2007`), read via
  `SpeedFactor`/`MovementFactor`. The existing `speed_burst` is self-only
  by construction; the delivery path is the missing piece, not the buff.

## 3. Decisions

- **D1 - Vulnerability is content on `resist_aura`, no new effect type.**
  Authored as `resistFactor > 1` + `targetsEnemies: true`. C1 is
  verify + fix + pin, not implementation.
- **D2 - The strongest-wins fix picks per direction.** Per source,
  "strongest" becomes the factor furthest from 1 (resists keep lowest-wins;
  vulnerability streams pick highest). A source mixing both sides cannot
  occur in practice (one skill, one factor per level); if it ever does, the
  defensive tie-break is the lower factor. Red-first on the two-caster
  inversion case.
- **D3 - `retaliate_damage` reuses the retaliate spine.** New effect type
  enum + params (damage HP + per-level slope + optional `damageTags`,
  fire for the Fire Shield flavor), folded in `recomputeDerived` like
  `RetaliateSlow` (strongest wins), triggered from the same
  `player.retaliate` site.
- **D4 - Retaliation damage takes the attributed path (PO ruling).** The
  reflect routes through the normal player→mob damage entry (the
  `PlayerTouches` double-dispatch with the player as source), so XP, kill
  credit and participants work. A bare health deduction is explicitly
  rejected. Same GOD-mode and dead-attacker guards as `retaliate_slow`;
  mitigation applies normally (a resist-heavy mob resists the reflect).
  ⚑ Re-entrancy to verify at execution: the reflect deals attributed damage
  from *inside* the attacker's own damage delivery (`MobTouches`), and that
  damage can kill the attacker mid-call. The death sweep is expected to
  tolerate it (health zeroed, MobSystem removes after the loop), but the
  XP/participant stamping firing re-entrantly there is unverified - C2
  step 3 pins it red-first.
- **D5 - Invulnerability is `instant_resist` + wildcard content, not a
  bespoke type.** New cooldown effect type `instant_resist` (the generic
  resist-cooldown twin the dispatch grid lacks); the invuln skill authors
  `resistTags: ["*"]`, `resistFactor: 0`, `durationTicks` ≈ 5 s
  [PLACEHOLDER], `selector: nearest`, `targetsAllies: true`,
  `targetsSelf: false`, `maxTargets: 1` + `maxTargetsPerLevel: 1`,
  `maxLevel: 3`. The wildcard learns the buff store in the recorded
  one-line seam (§2). Generic beats bespoke here because the type also
  opens ordinary resist cooldowns as free content later.
- **D6 - The aura variant is `resist_aura` content** (wildcard + factor 0 +
  `targetsAllies` + `nearest` + `maxTargets: 1`), plus D7's lifetime lever.
  High `costFractionOfMax` per application [PLACEHOLDER].
- **D7 - The invuln aura's buff lifetime = its tick interval (PO ruling),
  via a new optional authored override.** Default stays the interval + 1
  convention for every existing skill. With lifetime = interval, the buff
  expires exactly as re-application arrives: every application opens a new
  stream and *charges* at base cadence; under a `tick_rate` speedup
  (Haste) applications arrive early, still-live buff, refresh, free. That
  is the wanted economy: immortality is expensive unless you invest in
  tick speed. **Accepted flicker (explicit PO ruling):** the + 1 exists so
  a buff always survives to re-application (`sys/skills.go:1136`); at
  lifetime = interval there is a once-per-cycle ordering window where an
  enemy aura processed earlier in the same SkillSystem pass can land one
  hit unprotected. Non-deterministic (entity order), accepted as
  counterplay texture. A test pins the *economy* (charges per cycle at
  base, free under Haste); the flicker is documented, not pinned.
- **D8 - Ally speed ships both shapes (PO ruling).** `speed_aura` (new
  aura effect type: timed `ApplySpeed` factor > 1 to eligible allies in
  range, standard lifetime convention) and the burst via **extending
  `speed_burst` with the standard target flags** (default stays
  `targetsSelf`-only so the shipped Swift skill is untouched; authored
  `targetsAllies: true` + query circle reuses the instant_hot template).
  Extending beats a new type: same payload, same buff, different delivery.
  ⚑ One wrinkle to resolve at execution: `targetsSelf` lives on the
  *payloads* (`effect.Resist.TargetsSelf`, `effect.Hot.TargetsSelf`), not
  on `EffectDef` like `targetsAllies`, and every payload defaults it
  false. Keeping shipped Swift byte-identical means either a speed-payload
  `targetsSelf` defaulting *true* (nonstandard) or a behavior-identical
  edit to Swift's JSON authoring `targetsSelf: true` (then "untouched"
  means behavior, not bytes). Execution-session decision; the pin either
  way is "Swift's runtime behavior unchanged".
- **D9 - Fly, You Fools! excludes the caster**: `targetsAllies: true`,
  `targetsSelf: false`; the caster is never in the in-range set (the
  resist-aura precedent, `sys/skills.go:1161`). The risk/reward in the
  design note comes free.
- **D10 - No visibility work anywhere in this plan.** No new
  `applied_effects` bit (the byte is full, §39), no buff icons
  (effect-foundations §6 stays open). Speed is self-evidencing; invuln
  shows as damage not landing; vulnerability shows as bigger hits.
  Any pip is a §39 conversation.
- **D11 - Schema NONE at every layer, all four chunks.** Buffs are
  transient; skills are content JSON; the spellbook stores id → level
  only. No wire change, no DB change, no migration.

## 4. Chunks

**C1 - Vulnerability: verify + fix + pin (smallest)**
1. Red-first: the D2 inversion (two casters, same vuln skill, different
   levels → the *strongest* must win) in `skills/buffs.go` tests.
2. Fix `Buffs.ResistMultiplier`'s strongest-pick (D2).
3. Pin the end-to-end path in `sys`: `resist_aura` + `targetsEnemies` +
   factor > 1 lands an amplifying buff on an enemy and hits get bigger;
   allies untouched with `targetsAllies: false`.
4. Content: one example vuln skill [PLACEHOLDER numbers], census updates
   per the add-content skill.
5. Doc ripple: `content-ability-matrix.md` §7 row → resolved; §3.1 note.

**C2 - `retaliate_damage` (small)**
1. Params + parsing red-first (`definition.go`: enum, allowed keys,
   validation; damage + slope + optional tags).
2. Derived fold red-first (`component.go`: strongest-wins like
   RetaliateSlow).
3. Trigger red-first in `model/player` + `sys`: attributed damage path
   (D4), XP/credit asserted, GOD guard, mitigated-hit-still-retaliates
   kept, dead-attacker safe, and the D4 re-entrancy case: a retaliation
   killing blow landing mid-delivery leaves the death sweep and the XP
   award correct.
4. Content: *Fire Shield* passive [PLACEHOLDER], census updates.

**C3 - Invulnerability (medium)**
1. Wildcard tag in the buff store, red-first (the §4.1 one-liner + its
   read-side match in `Buffs.ResistMultiplier`).
2. `instant_resist` cooldown type red-first (parse + dispatch case on the
   instant_hot template; whiff-still-pays D9 cooldown cost rule).
3. Authored buff-lifetime override for resist auras red-first (D7),
   default unchanged; pin the economy: charges every cycle at base
   cadence, refresh-free under a tick_rate buff.
4. Content: the invuln cooldown (D5 shape) + the invuln aura (D6) +
   census updates. Global point curve (no code).
5. Doc ripple: dispatch grid resist/cooldown cell → alive.

**C4 - Ally speed buffs (medium)**
1. `speed_aura` type red-first: parse + aura dispatch case applying timed
   `ApplySpeed` to eligible allies; caster excluded (D9); cost charged on
   the §5.2 did-work rule (a fresh buff is work, a refresh is not - the
   standard convention, no D7 lever here).
2. `speed_burst` target flags red-first: default self-only (shipped Swift
   byte-identical behavior), `targetsAllies` opens the query circle.
3. Content: *Fly, You Fools!* aura + an ally-burst cooldown
   [PLACEHOLDER], census updates.
4. ⚑ New aura effect types need an `aura_category.go` entry (compile-time
   map, `skills/aura_category.go:84` precedent) - ring color for the
   client comes from that; missing entry is the silent landmine.

## 5. Schema impact

**NONE** (D11), all four chunks: no wire change, no DB change, no
migration. Content JSON + transient buffs only.

## 6. Test posture and expected fallout

- TDD on every Go layer; red-first named per chunk step above.
- ⚑ `go test -count=1` after every `api/` edit (content never invalidates
  the test cache); the add-content skill lists the censuses each new skill
  ships through.
- simharness guardrails must NOT shift: no existing skill or formula is
  touched (C4's `speed_burst` extension defaults to today's behavior). A
  shift means the change bled; chase it.
- The known-inconclusive list applies unchanged; measure before diagnosing
  any flake as this plan's fallout.
- Frontend: no code change expected (generic spellbook/HUD rendering; C4's
  ring color is a Go-side map entry). `npm run typecheck` + `npm test`
  ride the verify tail anyway.

## 7. Verify tail (per chunk)

`go build ./...` · `go test -count=1 ./...` (at minimum `skills`, `sys`,
`model/player`) · `npm run typecheck` · `npm test` · `make -C backend
build` before booting (stale-binary gotcha) · boot 0 WARN / 0 ERROR · PO
in-game check of the chunk's skill(s).

## 8. Recorded, not built

- **Per-skill point-cost authoring** (PO 2026-08-15: "ultimately we'll
  want more control over the cost of individual skills"). A new authoring
  field touching `PointCost`/`BoundPoints`/`SpentPoints` and the respec
  math. Deliberately not in this plan; belongs with the backlog §37
  skill-level/augment rework conversation.
- **Buff visibility** (icons, pips) for any of these: §39 +
  effect-foundations §6, unchanged by this plan (D10).
- The remaining §7 holes: silence, cleanse (note: `Buffs.Cleanse()`
  already exists wholesale, `skills/buffs.go:427` - a dispel *skill* is
  delivery + scope questions only), knockback, ground-targeting,
  conditional triggers, stealth.

## 9. Ledger

### C1 - Vulnerability: verify + fix + pin ✅ 2026-08-16, `e2261f6f`

**D1 held: vulnerability is pure content.** No new effect type, no new
authoring key, no dispatch case. `resist_aura` with `resistFactor > 1` and
`targetsEnemies: true` loads, applies and amplifies, exactly as §2 predicted.

**The one defect was real and is fixed (D2).** `Buffs.ResistMultiplier` picked
the per-source "strongest" application with `p.factor < strongest.factor`, i.e.
lowest-wins outright. Right for wards, inverted for curses: two casters of one
vulnerability skill at different levels landed the *weakest* of the pair. It now
picks the factor **furthest from 1** through the existing `unityDistance`
helper (the rule speed and tick_rate already use), with an explicit tie-break to
the **lower** factor so a hypothetical equal-distance pair can never turn a
protection into a punishment. Extracted as `strongerResist`; the doc comment on
`ResistMultiplier` now states the rule in both directions.

**Red-first, confirmed.** `TestBuffs_VulnerabilitySameSkillStrongestWins` failed
at HEAD on both application orders ("Max difference between 1.5 and 1.2 allowed
is 1e-06, but difference was 0.2999999523162842") and passes after the fix. Two
companions ride with it: the resist-direction regression guard (0.8/0.6 still
picks 0.6, both orders) and the defensive tie-break (1.5/0.5 picks 0.5, applied
vulnerability-first on purpose so a naive unity-distance-only fix fails it).
Every pre-existing resist test is untouched and green: all shipped resist
content is below 1, where furthest-from-unity and lowest agree.

**Pinned at three layers, so "hits get bigger" is not a claim.** Buff store
(above) · `applyResistAura` eligibility in `sys`
(`TestApplyResistAura_VulnerabilityLandsOnEnemiesAndAmplifies` +
`..._VulnerabilityLeavesAlliesAlone`: the curse lands on an opposing-faction
target, the target's REAL buff store then answers 1.4 for fire and 1.0 for
frost, while a same-faction ally in the same collider set and the caster both
stay clean) · the read seam in `model/player`
(`TestPlayer_TakeDamage_VulnerabilityBuffAmplifies`: a 40 HP fire hit under a
×1.5 curse removes 60, an untagged hit is unamplified) plus the mob half of
that seam, which is the shipped scenario
(`TestMob_VulnerabilityBuff_Amplifies`: base fire resistance 0.5 × curse 1.5
lands a 40 HP hit as 30, so the curse eats into the resistance). The `sys` and
both model pins passed at HEAD by design: step 3 is a pin, not a fix.

**Content: FireVulnerability, id 66** (`api/skills/fire-vulnerability.json`),
active_aura, maxLevel 5, `resist_aura` · `resistTags: ["fire"]` ·
`resistFactor: 1.2 +0.05/L` (×1.2 → ×1.4) · `targetsEnemies: true` ·
`targetsAllies`/`targetsSelf` absent · r1.5 · tickInterval 30 · cost 0.018
+0.00225/L, mirroring FireWard's entry price for the same R2/R3 reason. All
numbers **[PLACEHOLDER]**. SKILL-cheat only, no unlock source yet (the FireWard
precedent) - placement belongs to the content pass. Registry pin bumped 90 → 91
with its reason line.

**Schema: NONE.** Transient buffs plus one content JSON file. No wire change,
no DB change, no migration, no conf change.

**Doc ripple.** `content-ability-matrix.md` §7's vulnerability row struck
through and marked RESOLVED, and §3.2's "unverified half" block rewritten as
verified-and-closed with the defect named. ⚑ The plan's C1 step 5 says "§3.1
note"; the vulnerability block actually lives in **§3.2** (§3.1 is damage by
type and delivery), so the note went where the subject is. Also updated:
`content-skill-inventory.md` (new row, aura count 24 → 25, and the reachability
summary now reads "unreachable without the cheat: ONE, deliberate" instead of
NONE) and `content-auras.md` (design-intent row; FireWard's neighbouring row
carried a stale "the one player skill with no world unlock source" claim that
the inventory has contradicted for a while, corrected in passing).

**PO-found follow-up, same day: the tooltip double minus.** The PO's in-game
look surfaced "Resist fire: −-20% damage taken" on FireVulnerability.
`SkillTooltip.ts`'s resist case predates vulnerabilities: it renders the factor
as a reduction (`pct(1 - factor)`) behind a hard-coded − prefix, so a factor
above 1 produced a negative reduction with a second sign. Fixed red-first
(vitest, `SkillTooltip.test.ts`): the case now branches on the current level's
factor, and above 1 renders `Vulnerable to fire: +20% → 25% damage taken`,
mirroring the shipped ward shape (sign on the first value only). A second test
pins the ward rendering byte-identical, INCLUDING that shipped shape: FireWard
reads `−40% → 45%`, and the guard's first draft expected `−45%` and failed,
which is the pin proving "byte-identical" means the shape that ships, not the
shape one would design. Server side untouched; the Go pins already owned the
math. The same lesson twice in one chunk: widening a value's domain past 1
broke every consumer that assumed one side of it, and the survey caught the
buff store but not the renderer.

**Verified.** `go build ./...` OK · `go test -count=1 ./...` **all packages
green**, run twice, before and after `cp-defs` (simharness guardrails did not
shift, as predicted: sub-1 factors pick the same winner under both rules) ·
`npm run typecheck` clean · vitest **351/351** (349 + the two tooltip pins) ·
`make -C backend build` · `npm run build` (prod dist for the harness) ·
`round4-tooltip.mjs` **green** (⚑ its first run failed at join against a stale
`frontend/dist` - the c2-frost-shield lesson; the harness drives port 2000,
which serves dist, never the HMR dev server) · boot **0 WARN / 0 ERROR**,
census `Loaded skill definitions count=91` (was 90), 58 mobs / 12 factions /
488 spawns. No `-race` run (the `accounts.TestRepeatedFailuresAreThrottled`
known-inconclusive).

**PO in-game check: passed 2026-08-16.** The PO played it the same day; the
one finding was the tooltip double minus above, fixed in-session. The
ally-untouched case stays test-pinned only (nothing in-game aims fire at an
ally; no PvP).

### C2 - `retaliate_damage` + the percentage follow-up ✅ 2026-08-17, `6d79c40c`

**D3 and D4 held.** `retaliate_damage` reuses the retaliate spine: enum + params
(`damageHP`/`damageHPPerLevel`/`damageTags`, a deliberately narrow 3-key
allowlist, absent tags normalize to physical like every damage payload), folded
in `recomputeDerived` strongest-wins-wholesale beside RetaliateSlow, triggered
from `player.retaliate`. The reflect takes the ATTRIBUTED path (D4): it leaves
through `Mob.PlayerTouches` with the wearer as toucher, so participants, threat,
XP and kill credit all work and are pinned; mob-side mitigation applies for free
and is asserted (a fire-resistant mob takes half the fire reflect).

**The dead-attacker guard is NEW code, not inherited.** ApplySlow on a corpse is
a natural no-op; `PlayerTouches` is not (noteParticipant, noteThreat,
tryGrantKillRewards), so a dead DoT caster's tick would re-enter its own reward
path once per tick, forever. The reflect skips attackers at health 0, pinned
red-first (`TestRetaliateDamage_ADeadAttackerIsNotTouched`).

**The flagged re-entrancy risk is pinned SAFE, no fix needed.** A reflect
killing blow lands from inside the attacker's own delivery
(`TestRetaliateDamage/Burst_AReflectKillingMidDeliveryIsSafe`): health floors at
0, `deathRewardGiven` latches on the stack, XP grants exactly once, and the
mob's own hit still lands afterwards - it attacked while alive.

**Two named decisions, documented not silent.** (1) The reflect is RAW AUTHORED
DAMAGE: no crit, no lifesteal, no DamageDealtBonus (the `component.go` comment
now names the exclusion). ⚑ Consequence, tuning-open: the flat reflect rides
neither f(level) nor Strong, so FireShield's 3 HP at L1 is still 3 HP at level
30 - recorded in the JSON and `content-passives.md`, an open PO call. (2) The
Source-nil reflect trips the companion `NoteAttackDealt` assist signal, kept
deliberately (the reflect is the player fighting back).

**Same-day PO follow-up: `retaliate_burst` / Retribution (rulings 2026-08-17).**
The percentage tier as a cooldown: a timed SELF-buff (lifesteal_burst template:
`reflectFraction`/`PerLevel`/`reflectDurationTicks`/`PerLevel`/`damageTags`),
read at the same trigger. Three PO rulings, each test-pinned: the share applies
to the PRE-MITIGATION swing (a tanky build does not weaken its own reflect; a
fully shielded hit still reflects) · reflected damage carries tags AUTHORED ON
THE SKILL, never mirrored from the hit · level scales the FRACTION only,
duration flat. The flat and percentage halves fire independently as TWO
deliveries, deliberately not summed (each bills its own damage type). ⚑
`Buffs.ReflectBurst` reads strongest-wins-wholesale where `LifestealFraction`
sums - forced, since each application carries its own tags. ⚑ A mob-authored
`retaliate_burst` would be silently dead content (`Mob.PlayerTouches` has no
retaliate call); the `reflectApplier` comment says so. `appliedBit` → None
(no pip, §39 / D10). ⚑ First tooltip draft expected "9.9s" for 300 ticks;
TICK_MS is 1000/30, so 10s - the test was wrong, not the code.

**Content.** FireShield id 67 (passive, 3 HP +1/L, fire, no cost) and
Retribution id 68 (cooldown, 0.2 +0.05/L of the swing for 300 ticks, fire,
CD 900 −60/L, cost 0.02 +0.0025/L). All numbers [PLACEHOLDER], SKILL-cheat
only, placement belongs to the content pass. Registry pin 91 → 92 → 93.

**Schema: NONE.** Transient buffs + two content JSON files.

**Doc ripple.** `content-ability-matrix.md`: reflect family row, §7 row
RESOLVED, burst cell filled (30 → 31). `content-skill-inventory.md`: two rows,
reachability ONE → THREE. `content-cooldowns.md`: the old "Fire Shield cooldown
idea" row RESOLVED by Retribution. `content-passives.md`: FireShield row.
Stale-at-HEAD finds, both pre-existing and unowned: `manual-content-authoring.md`
§2's effect-type list was already missing `retaliate_slow` and `stun`;
Bloodthirst is missing from the inventory's own Cooldowns table.

**Verified.** `go build ./...` · `go test -count=1 ./...` all green, before and
after cp-defs, twice re-run by the coordinating session (simharness guardrails
unshifted) · `npm run typecheck` · vitest **358/358** (351 + 3 + 4) ·
`make -C backend build` · `npm run build` (prod dist for the harnesses) ·
`round4-tooltip` green (⚑ first run timed out at join against a long-lived
server session; restart fixed it - dist was already fresh) · `c2-frost-shield`
**7/7** (the retaliate_slow surface this chunk's trigger rewrite could have
broken) · boot **0 WARN / 0 ERROR**, census `count=93` (was 91).

**PO in-game check: passed 2026-08-17.** One finding, resolved as
not-a-defect: with both reflects equipped the on-screen numbers merge, because
damage numbers ride the per-tick `damageTaken` accumulator (one number per
entity per tick, `EntityManager.ts:189`) and both reflects trigger on the same
bite. The observed "-12 instead of 4 + 6" was the wearer's own damage aura
ticking in the same tick, PO-confirmed by re-testing with the aura off.
Per-hit numbers would need per-hit wire events: §39 / backlog §57 territory.

### C3 - Invulnerability + the cost-line and inventory follow-ups ✅ 2026-08-17, `1846dfe6`

**D5 and D6 held: invulnerability is the resist system, asked to cover
everything.** The wildcard learned the buff store in exactly the §4.1 one-liner
(`hitTag == covered || covered == ResistWildcard` in `Buffs.ResistMultiplier`),
with the map source's per-hit-tag semantics pinned by a non-zero case (a
wildcard 0.5 lands a two-tag hit at 0.25, which is what distinguishes per-tag
from once-per-hit). ⭐ Survey find: `resistTags: ["*"]` already PARSED at HEAD.
Resist tags were never vocabulary-closed (only damageTags validate against
`DamageTypes`), so the §2 prediction "one line when content wants a bubble" was
optimistic only about where the line count would land, not the shape. One
deliberate guard added: a `"*"` beside named tags hard-fails (it would apply
twice to those tags' hits).

**`instant_resist` fills the dispatch grid's empty resist/cooldown cell** as a
generic type: enum + parse (resist payload + a required `resistDurationTicks`,
the instant_shield duration-guard twin) + effectKeys row + `AuraCategoryNone`
entry (the completeness test supplied the red for free) + `applyInstantResist`
on the `applyInstantShield` template. ⚑ The hit-bool is a CONTRACT, not a
convenience, and is pinned as one: players pay on cast hit or whiff (D9, the
committed-act rule; `ApplyResist`'s new-vs-refresh answer deliberately
discarded), while MOBS consume the cooldown only on `true`, so whiff → false is
what keeps a mob's bubble ready until an ally wanders into range.

**D7 shipped as the boolean `buffLifetimeMatchesInterval`** (resist_aura only;
passive and instant forms hard-fail the key). A numeric lifetime was considered
and rejected: it only produces the ruled economy while exactly equal to the
tick interval and desyncs silently on a retune. The mechanism rides an existing
split: buff lifetimes were already computed at BASE cadence
(`sys/targeting.go`) while the firing loop applies the caster's tick_rate, so
dropping the +1 makes the buff expire exactly as re-application arrives at base
cadence (fresh stream, did work, CHARGED) and survive under Haste (refresh,
free). The economy pin was genuinely red against the +1 default (80 vs 90 HP
after two cycles); the once-per-cycle flicker window is documented at the read
site, not pinned, per the explicit ruling. Aging-before-firing (StatusEffects
101 vs SkillSystem −65) confirms the +1 convention's claim.

**Content: Sanctuary id 69** (cooldown, `instant_resist`, wildcard factor 0,
150 ticks = 5 s, nearest ally, `maxTargets` 1 +1/L, maxLevel 3, CD 900 FLAT so
a level buys protected allies, never uptime, cost 0.04 +0.005/L) and **Aegis
id 70** (active_aura, `resist_aura`, same wildcard shape, tickInterval 90,
`buffLifetimeMatchesInterval: true`, cost 0.08 +0.01/L: 3.33 %/s at L3 against
the 6 % drain bound, exact-or-conservative under D7 since hasted applications
are free). All [PLACEHOLDER], SKILL-cheat only, placement belongs to the
content pass. Registry pin 93 → 95. An immune target lights the EXISTING teal
resist pip (D10: no new visibility work).

**Frontend.** The tooltip would have rendered "Resist *: −100% damage taken";
the resist case now renders `Immune to all damage` (factor ≤ 0) and "all
damage" for the wildcard in every branch, plus an `instant_resist` case with
the duration (instant_shield shape). The C1 FireWard byte-identical guard
stayed green untouched. TS `durationTicks` added as REQUIRED (the ShieldParams
convention); six fixtures gained the field, every assertion string
byte-identical.

**PO follow-ups, same day (in-game check passed first).** (1) **The Aegis cost
line is now data-driven**: a `costTriggerText(effect)` helper reads
`buffLifetimeMatchesInterval` off the served catalog (the flag rides `/skills`
for free, verified by curl) and renders `every time it re-applies`; every plain
resist aura keeps `when it reaches someone new` byte-identical. ⚑ Deliberately
NOT a `COST_TRIGGER_TEXT` key: that table is pinned exhaustively in BOTH
directions against `api/shared-constants.json`, and this is an authoring
variant within a type that the cross-language taxonomy cannot express. The next
D7-authored skill gets the right line with no edit. (2) **The skill inventory
was repaired by re-derivation, and re-deriving found more rot than scoped**: a
second ghost (Recall id 28, retired into the baseline utilities) beyond the
briefed Wild id 3, and the missing Bloodthirst row had been HIDING a fourth
cheat-only skill from the reachability sweep; the two error classes cancelled
in the cooldown total, which is why increments looked plausible. Now 25 auras /
10 passives / 28 cooldowns, cheat-only SIX, scope 63 + 32 = 95, every row
verified 1:1 against `api/skills/`. Lesson written into the file: re-derive
from disk, never increment. Smell sweep rode along: `content-auras.md`'s Wild
row → cut (numbers rewrite Pass 1, `40d9b204`), `bloodthirst.json`'s stale
"like FireWard" precedent → FireVulnerability.

**⚑ Harness-estate find, fixed in-chunk: five scripts were red at join at
HEAD** (`r1-focus-cost`, `r3-lifesteal-burst`, `r7-strong`, `r7-respec-cost`,
`backlog33-prehot`) - all still drove the pre-accounts `#startForm` join that
step 8a chunk 2 deleted, and none had been run since. Repaired to the shared
`lib/join.mjs` and ALL FIVE are green again (r3 7/7, backlog33 4/4), so the
cost-wording gate this chunk owed (`r1-focus-cost`) actually ran. None of them
was on the known-inconclusive list, which is the miss: a harness nobody runs
rots silently until someone needs it.

**Schema: NONE.** Transient buffs + two content JSON files. No wire change, no
DB change, no migration, no conf change.

**Verified.** `go build ./...` · `go test -count=1 ./...` all green four times
(agent before/after cp-defs, coordinator twice more, DB tests fresh against
`aura_test`: store 26.1 s, accounts 20.5 s) · `npm run typecheck` · vitest
**363/363** (358 + 3 + 2) · `make -C backend build` · `npm run build` · boot
**0 WARN / 0 ERROR**, census `count=95` (was 93) · harnesses: new
`c3-invulnerability` green · `round4-tooltip` green · `c2-frost-shield` 7/7 ·
the five join-repaired scripts all green · `harnessdb -cleanup` (18 accounts)
with aurad stopped. No `-race` run (the known-inconclusive accounts throttle
test).

**PO in-game check: passed 2026-08-17** (before the follow-ups; the cost-line
item was the check's one finding and is fixed above).

**Left open, recorded:** the OTHER design catalogs were not swept for ghosts
(only the inventory was re-derived and only Wild fixed in `content-auras.md`);
the inventory's MaxLv/slope value drift still owes a full regeneration.

**Next in this plan:** C4, ally speed - the last chunk.

### C4 - Ally speed buffs ✅ 2026-08-17, `dfdd7281` — THE LAST CHUNK

**D8 held: extending beat adding.** `speed_aura` is a new effect type but not a
new payload - both forms carry `SpeedParams`, and the only difference is
delivery (a field on a cadence vs. a cast that reaches once). **D9 held
structurally**: the aura form has no `targetsSelf` key at all, so the caster's
exclusion is not authored, it is unauthorable. The aura charges on the §5.2
did-work rule (`Buffs.ApplySpeed` gained the ApplyResist-shaped fresh-vs-refresh
bool; the cooldown site discards it, D9), lifetime = tickInterval + 1, NO D7
lever - exactly as scoped.

**The D8 targetsSelf wrinkle went the pre-blessed JSON route** (settled in the
execution session as the plan allowed): `SpeedParams` gained default-false
`TargetsSelf` (the Resist/Hot/Shield convention) and `swift.json` authors
`"targetsSelf": true` - a byte change, behavior identical. The pin is Swift's
RUNTIME behavior and the evidence is strong: adding the new
neither-flags-hard-fails guard turned four shipped Swift behavior tests red on
the flag alone (`TestCooldown_SpeedBurstBuffsTheCaster` and siblings), green
again once the JSON authors it. `swift-cooldown.mjs` re-measured the game
surface after: 1.52× against the authored 1.5×, pip lifecycle intact.

**Ring: the PO ruled a NEW category in the pip's green** ("match the color we
use on the character pip when the swift cooldown is active"). `AuraCategorySpeed
= 1<<7` - ⚑ the LAST free bit in the `aura_category` wire ubyte, recorded in
both const blocks - colored the existing speed-pip green `0x6ee06e`, which moved
into `AURA_CATEGORY_COLORS.speed` with `EffectPips.ts` now referencing it (the
duplicated literal killed). Ripple pinned both ways via
`api/shared-constants.json` `auraCategoryBits` (7 → 8 entries; both
SharedConstants pins were genuinely red). ⚑ This contradicts §6's "no frontend
code change expected" - that line was a prediction, and the survey behind it had
not noticed no speed color existed in the ring language. No pip work was needed:
the pip rides the buff PAYLOAD, not the effect type, so a hastened ally lights
the existing green pip for free (D10 intact).

**All three surveyed landmines were real, plus one new.** (1) `AuraMaskFor`
gained the `EffectTypeSpeedAura` case and is pinned DIRECTLY
(`TestAuraMaskFor_SpeedAura`) - sys tests inject collider sets, so a missing
mask case survives every unit test and fails only in-game. (2) The
`aura_category` completeness test supplied its red for free. (3) The zero-radius
gate (`definition.go`, allowlist-keyed) would have hard-failed radius-less Swift
at boot the moment `radius` joined speed_burst's allowlist; speed_burst is
carved out and `speedParams` requires radius iff `targetsAllies`, red-first in
both directions. (4) ⭐ NEW: `TICKING_TYPES` in `SkillTooltip.ts` is a
hand-maintained set with no completeness test that fails SILENT - an aura type
missing from it just never prints its cadence line. speed_aura joined;
**a completeness pin for the set is recorded-not-built** (backlog-class find).
⚑ The `speedApplier` widening also confirmed its own trap: the interface is a
runtime assertion, so the bool-returning `ApplySpeed` silently degraded the
burst to a whiff until all three implementations moved - the four Swift tests
were the net.

**Execution calls, each with its reason recorded at the site:** allowlists
narrow (no `targetsEnemies` on either form - a speed buff on an enemy is
nobody's content and slow_aura owns that axis; no duration keys and no
`targetsSelf` on the aura) · aura factor must be > 1 · aura without
`targetsAllies` hard-fails (it is the type's only delivery) · new guards run
AFTER the payload checks so the more specific error wins (§27.3.2 - the three
pre-existing speed_burst failure tests stayed green untouched) · the burst's
ally half grants duration + 1 (the instant_resist tick-boundary convention)
while the self half deliberately does not (Swift's shipped path, nothing
re-applies it), pinned both ways · extended `applySpeedBurst` carries the C3
whiff CONTRACT: self-apply counts as hit, ally-only cast reaching nobody
returns false (a mob keeps its cooldown; a player still pays, D9) ·
`EFFECT_COLOR_KEYS` gained `speed_burst: 'speed'` so Swift's tooltip label goes
green alongside the aura's (PO-revertable one-liner) · Onward is UNCAPPED on
the calm precedent (a shout reaches whoever hears it; Sanctuary levels by
breadth only because factor 0 cannot deepen, this one deepens).

**Content: FlyYouFools id 71** ("Fly, You Fools!", active_aura, maxLevel 5,
`speed_aura` ×1.3 +0.05/L, r2.5, @30t, `targetsAllies`, uncapped, cost 0.03
+0.004/L - under Swift's 1.5 because it reaches a party for no cooldown) and
**Onward id 72** (cooldown, maxLevel 5, `speed_burst` ×1.4 +0.05/L for 150t
+15/L, r3, `targetsAllies` with `targetsSelf` absent - the caster stays behind,
CD 900 −60/L, cost 0.03 +0.004/L). All [PLACEHOLDER], SKILL-cheat only, no
unlock source (the established worked-example convention; placement belongs to
the content pass). Registry pin 95 → 97 with reason lines; cheat-only rises to
EIGHT.

**19 new Go tests + 6 vitest, red-first throughout**, plus a five-mutation
falsification sweep on the appliers (caster-not-skipped, always-reports-work,
ally +1 dropped, dispatch case removed, ally half removed - all killed by the
specific test that claims each). ⚑ Two EXPECTATIONS were wrong, not the code
(the C2 "9.9s" class again): 165 ticks is "5.5s" (Swift's "5s → 6s" is exact
by accident), and the cadence suffix is suppressed for a single-shared-beat
skill (slow_aura proved the house behavior). Tests corrected, renderer
untouched. De-staled in passing: five "seven chargeable types" comments in
`skill_cost_content_test.go` (now eight - `costChargeTrigger` gained
`"speed_aura": "work"` on both pinned sides).

**Schema: NONE.** Transient buffs + two content JSON files + one
shared-constants fixture entry. No wire change (the new AuraCategory bit is a
new VALUE in an existing ubyte), no DB change, no migration, no conf change.

**Verified.** `go build ./...` · `go test -count=1 ./...` all green - agent
before AND after cp-defs, coordinator once more post-cp-defs (35 packages; DB
tests skipped cleanly without `AURA_TEST_DB_URL`, acceptable for schema NONE) ·
`go test -race` green on skills/sys/model/cmd/aurad/simharness (guardrails did
NOT shift) · `npm run typecheck` · vitest **369/369** (363 + 6) · `npm run
build` + `make -C backend build` · boot **0 WARN / 0 ERROR**, census `Loaded
skill definitions count=97` (was 95), 58 mobs / 12 factions / 488 spawns ·
harnesses: new **`c4-ally-speed`** green · `round4-tooltip` green (⚑ first run
timed out at join against a long-lived server session, the recorded flake
class - probed, zero client errors, green on rerun after restart; so did
`swift-cooldown` for the coordinator, same class, same fix) ·
**`swift-cooldown` 4/4** · **`r1-focus-cost`** green (the cost-wording surface
gained the speed_aura entry) · `harnessdb -cleanup` with aurad stopped.

**PO in-game check: passed 2026-08-17.**

**This closes the plan.** All four chunks shipped; the remaining §7 holes
(silence, cleanse, knockback, ground-targeting, conditional triggers, stealth)
and §8's recorded-not-built items stay where they are recorded.
