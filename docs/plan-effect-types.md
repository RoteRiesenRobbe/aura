# Plan: New effect types, round 1 (vulnerability · retaliate damage · invulnerability · ally speed)

**Status: designed 2026-08-15, nothing built.**
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

*(filled in by the execution sessions)*
