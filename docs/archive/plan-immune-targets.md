# Plan - an aura prefers targets it can hurt

**Status:** DESIGNED + PO-RULED 2026-10-04 (planning session, docs only,
nothing built). One chunk, backend only. **Schema: DB NONE · wire NONE ·
conf NONE · content NONE · client NONE.** Not scheduled yet: where it sits
relative to buff tray C3 is the PO's call. Ledger: §9.

**PO feedback 2026-10-04** (`docs/feedback.md`): *"damage attacks
harvestables. that makes sense based on how the game works but feels bad in
combat when the player attacks a harvestable like bramble. we should fix that
somehow."*

---

## 1. The defect

Every targeted effect picks its targets first (faction check, then the
selector, then the cap) and only afterwards asks the target what the hit does.
The selector is blind to the outcome.

A gated structure mob (`resistances: {"*": 0}` + `gateKeys`) authors no faction,
loads as `FactionHostile` and passes `eligibleByTargetFlags` like any enemy. A
combat aura with `selector: nearest, maxTargets: 1` (the starting Damage aura,
13 of the 18 player damage auras) therefore picks the Bramble whenever it
stands nearer than the wolf. The wildcard zeroes the hit, "Immune" rises over
the wall, and **the real enemy gets no tick at all**.

The same blindness has two more faces in today's content:

- **The mirror.** Harvest beside a wolf picks the wolf, the gate refuses the
  hit silently, and the turnip gets no tick.
- **Tag immunity.** Skeleton, Skeleton Archer and Death Knight author
  `poison: 0`. A poison aura's single target can be soaked by a skeleton while
  a ghoul stands beside it.

## 2. The rule

> **An effect that deals damage picks targets it can hurt before targets it
> can never hurt.**

"Can never hurt" is read from the target's species file only, with the math
the hit already uses:

- the hit carries a gate key the target does not list in `factors.gateKeys`, or
- the hit carries damage tags and the target's authored `factors.resistances`
  multiply them to exactly 0.

Nothing else changes. An immune target stays a valid target; it only stands
at the back of the line.

| Situation | Today | With the rule |
|---|---|---|
| Damage aura, Bramble nearer than the wolf | Bramble soaks the hit | wolf gets the hit |
| Damage aura, alone at the Bramble | strike plays, "Immune" shows | unchanged |
| Nearest-3 aura, one wolf and a Bramble in range | both struck | unchanged |
| Harvest, wolf nearer than the turnip | wolf soaks it silently | turnip gets the hit |
| Poison aura, Skeleton nearer than a Ghoul | Skeleton soaks it | Ghoul gets the hit |
| Sanctuary, Aegis, the Warlord with banners up | targeted, "Immune" shows | unchanged |
| Bear (`frost: 0.5`) nearer than a Drakeling (`frost: 1.5`) | Bear is hit | unchanged |

## 3. PO rulings (2026-10-04)

- **D1 - immune goes last.** Targets the hit can damage are picked first; an
  immune one fills only a slot nobody else takes.
- **D2 - authored immunity only.** The rule reads the species file and never a
  temporary state. PO: *"I want short term immunities to still be targeted and
  work right now."* A bubble (Sanctuary, Aegis) and the Warlord's scripted
  invulnerability keep today's behaviour exactly.
- **D3 - a partial resistance never steers the pick.** 0.25, 0.5, 1.25 and 1.5
  change how much a hit does, never who gets hit. Positioning stays the only
  targeting skill; only an exact authored zero matters to the selector.
- **D4 - the effect still plays on a wrong-aura hit.** PO: *"I want the effect
  to still play when hitting with a non fitting aura."* Alone at the wall, or
  with a slot to spare, the Bramble is struck as it is today: the strike draws,
  "Immune" shows, and the zero hit costs and counts exactly as before.
- **D5 - one rule, no extras.** PO, on the first design round: *"This seems to
  become a very complicated set of extra rules."* Withdrawn the same session:
  the "free and inert" zero hit (a round-1 answer that needed a separate hit
  path with four exemptions) and the "only when nothing else is in range"
  variant. Pure ordering answers both.

## 4. Design decisions (mine, flag if wrong)

- **Every effect type that deals damage**, through the appliers they already
  share: `damage_aura`, `instant_damage`, `dot_aura`, `instant_dot`. A dot
  reads its own tags against the same authored map.
- **Every caster.** Players, mobs, summons and charmed mobs run the same
  ordering. A player has no species file, so a player is never "immune" to
  the selector (D2 covers passives and buffs: both are build or temporary
  state). In practice the rule only ever demotes mobs. ⛔ A target that is
  not a `Mob` is NEVER demoted and never rejected: it simply counts as "can
  hurt", so a mob's bite keeps picking players exactly as it does today.
- **No reordering when nobody is dropped.** The uncapped path (selector `all`,
  cap 0, or fewer candidates than the cap) returns everyone as it does today.
  The demotion applies only where the cap actually cuts the list.

## 5. Not in scope

- **CC effects.** A nearest-1 stun can pick a `ccImmune` elite and whiff, and
  a slow aura's single slot can go to a speed-0 Bramble. Same blindness, not
  this plan. If it shows in play it is a new `feedback.md` row.
- **What a zero hit costs.** Read from the code during the survey, not
  observed in-game: a hit that lands on an immune mob still charges the aura's
  cost, enters the player into combat, records XP participation and sets the
  companion's assist signal. D4 leaves all four as they are. In a fight they
  stop mattering because the wolf takes the hit.
- **Any change to the resistance numbers, the gate keys or the "Immune"
  label.**
- **A "prefer the weakest resistance" selector.** Not built (D3). If content
  ever wants it, it is an authorable selector on single skills.

## 6. The change (line refs as of 2026-10-04, `c032424c` + working tree)

- **`model/mob`**: one method on `Mob` that answers "can this species ever be
  damaged by this hit" from `m.definition.Factors` alone: gate key present and
  `!skills.GateOpensFor(...)`, else `skills.ResistMultiplier(tags,
  Factors.Resistances) == 0`. `takeDamage` keeps its behaviour byte for byte.
- **`sys/targeting.go`**: `selectTargets` takes the demotion predicate and
  applies it as a STABLE partition after the selector sort and before the cap,
  so ties and application order stay deterministic.
- **`sys/skills.go`**: the three damage call sites pass the predicate:
  `applyDotEffect` (:460), `applyPlayerDamageAura` (:771),
  `applyMobDamageAura` (:825). The instant variants reach the same appliers
  (:2175, :2183). Every other `selectTargets` caller (heal, hot, shield,
  resist, slow, stun, speed, calm, charm, threat) passes none.

## 7. Landmines

- **L1 - the predicate reads the DEFINITION, never `m.buffs` or
  `m.invulnerable`.** Reusing `takeDamage`'s full multiplier would pull bubbles
  and the Warlord in and break D2 silently.
- **L2 - the discriminator is not `role: structure`.** Totems, the war banner,
  the spike barricade and the web share the role and must stay ordinary
  targets.
- **L3 - a runtime `x.(Iface)` assertion degrades silently** when the method's
  signature drifts (the effect-types lesson). Pin the capability at compile
  time.
- **L4 - multi-tag hits.** `ResistMultiplier` multiplies per tag; call it, do
  not re-derive "is any tag zero".
- **L5 - determinism.** The partition must be stable and must not run when the
  cap drops nobody, or the sim harness's fixed-seed roll order changes for
  fights that contain no immune target.
- **L6 - a negative-space pin needs a capable subject.** The D2 pins must put
  an invulnerable mob NEARER than a damageable one, or they pass by accident.

## 8. Test strategy and verification

Red-first Go tests (`sys/targeting_test.go`, `sys/skills_test.go`,
`model/mob`):

1. nearest-1, gate-locked mob nearer than a normal mob: the normal mob is hit
   (red today).
2. Alone with the gate-locked mob: it is hit and stamps `HitKindImmune`
   (green today, must stay).
3. Nearest-3, one normal mob plus the gate-locked one: both are hit.
4. The mirror: a gated hit prefers the key holder over a nearer mob without
   the key.
5. Tag immunity: a `poison` hit prefers a normal mob over a nearer
   `poison: 0` one; the same leg for a dot.
6. D2 pins: an `invulnerable` mob nearer than an add is still picked; a mob's
   nearest-1 bite still picks a player under a wildcard-0 resist buff.
7. D3 pin: a 0.25 resister nearer than a 1.5 one is still picked.
8. A mob caster and an owned summon follow the same ordering.
9. The predicate itself on `Mob`: gate match, gate mismatch, wildcard 0,
   tag 0, partial, no resistances.

Tail: `go build ./...` · `go test -count=1` on `sys`, `model/mob`, `skills` ·
the simharness guardrail battery unchanged (it places no structures) ·
`immune-feedback.mjs` still green at the Bramble wall (alone at the wall is
unchanged by D4).

In-game, DEBUG zones (`world_debug.json` places 4 Brambles, 6 Turnips,
2 Rockfalls), GOD off, in daylight (skill FX draw below darkness):

- Pull a mob to the Bramble wall and stand with the Bramble nearer: the mob
  takes every Damage tick.
- Alone at the wall with Damage on: the strike draws and "Immune" shows, as
  before.
- Harvest on a Turnip with a mob standing nearer: the Turnip pops.

## 9. Chunk ledger

- **C1 - the ordering rule**: not built.
