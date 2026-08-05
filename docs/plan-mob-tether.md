# Plan: The tether — a mob cannot be dragged away from where it lives

> **Status: DESIGNED 2026-08-05, no chunk built.**
> A mob that is chased beyond a maximum distance from where it entered combat
> gives up, becomes **immune and un-aggroable**, and walks home. The PO ask
> (2026-08-05): *"I want mobs to have a max chase distance from their spawn
> position"*, sharpened during the design pass into what it is actually for —
> ⭐ **stopping a high-level player from pulling mobs into low-level players
> and leaving them defenceless.** Reinstates the roadmap's original base
> behavior (roadmap.md §7, *"give up once the mob itself is farther than
> `aggroRadius` from its spawn anchor"*) that mob-depth chunk 3b replaced.
>
> ⚑ **Schema impact: DB NONE, FlatBuffers NONE, content JSON one optional
> field, conf.json one new knob.** No client code is required to ship it (§8.2
> is the open question about whether it *reads* right without one).
>
> ⚑ **Vocabulary, used precisely throughout:** the **leash** is the shipped
> state-dependent countdown (`leashCountdownTicks = 90`, mob-depth 3b). The
> **tether** is this plan's distance rule. They are different mechanisms and
> this plan does not touch the first one's existing conditions.

## 1. What this is

Today a mob's give-up condition is purely state-dependent: the countdown runs
only while its target is out of aura reach **and** out of the aggro sensor
**and** the mob is taking no damage (`mob.go:1316-1330`). Distance from home
appears nowhere. So a player who keeps a mob in combat can walk it anywhere in
the world — 142 × 71 units of it — and park it on somebody else.

This plan adds a distance condition that overrides those exemptions, plus the
protected return that makes overriding them safe.

## 2. Decision ledger — PO rulings 2026-08-05

Taken as choice prompts in this design session. **D5 revises D4 and D6
supersedes D1's reach**; the originals are recorded in §10, not here.

- **D1 — the cap starts the countdown; it does not snap.** Crossing the
  tether radius suppresses the in-combat exemptions so the existing 90-tick
  countdown runs; stepping back inside cancels it. Declined: an instant
  `resetAggro` at the line — mob-depth 3b's whole complaint about the old
  territory check was that it snapped at the edge, and the campfire safe-zone
  is the only place a hard break was ever wanted. Consequence, stated: the
  true maximum distance is the cap **plus ~3 s of chasing**.
- **D2 — the anchor is `returnPos`, the combat-entry point.** Not
  `spawnPosition` and not `wanderAnchor`: a waypoint patroller legitimately
  stands far from its authored spawn and would otherwise leash the instant it
  aggroed at the far end of its route. `returnPos` (`patrol.go:110-121`)
  already records the position on idle→combat and already skips followers —
  the anchor this plan needs exists and is load-bearing for the evade return.
- **D3 — authored as a conf multiplier of the mob's own `aggroRadius`, with
  a per-species absolute override.** One global knob (`mobMaxChaseFactor`)
  gives all 67 defs a sane cap that scales with their own senses; optional
  `body.maxChaseDistance` on a definition pins the ones that matter (the boss
  on its rock, roadmap.md:349). Declined: a bare global (no way to tighten a
  boss), per-species-only (a tiny wolf and a mammoth would share a default
  until someone authored both), and a per-spawn override — §6.8 of mob-depth
  set the counter-precedent that factions are def-level only, and YAGNI until
  a placement actually needs it.
- **D4 → superseded by D5. Original:** no protected evade; keep today's
  gradual out-of-combat regen on the walk home. Recorded in §10.
- **D5 — protected evade.** A mob that has tether-leashed is **immune to all
  damage and cannot re-aggro** until it is home. Chosen after the design pass
  produced primary evidence that the unprotected version is unshippable
  (§3.2 / L1) — with the PO's reservation on record: *"evading in WoW can be
  very annoying"*, which is what §8.2 and the C2 feel pass exist to answer.
  ⚑ D4's substance survives inside D5: there is **no instant full heal**. The
  mob regenerates gradually on the walk home exactly as it does today — the
  immunity is what lets that regen actually finish.
- **D6 — "taking damage" is not an exemption.** The tether governs the fight,
  not just the pursuit. Considered and declined: letting damage hold a mob
  engaged past its cap would leave the drag fully intact (poke it and it
  follows you anywhere), which is precisely the thing the feature exists to
  prevent. A **territory clamp** — the mob refuses to step outside its circle
  but never drops aggro, so there is no evade and no flicker — was designed
  out in full during this pass and declined in favour of the evade (§10).

## 3. The design

### 3.1 The distance condition

One condition added at the head of the existing leash block
(`updateEnemyTargeting`, `mob.go:1316-1330`), which today reads:

```go
if tookDamage || m.fleeOverride || m.targetWithinAuraReach() || m.targetWithinSensor() {
        m.leashTicks = 0
        return
}
```

becomes, in shape:

```go
beyondTether := m.tetherExceeded()   // dist(pos, returnPos) > maxChaseDistance
if m.fleeOverride || (!beyondTether && (tookDamage || m.targetWithinAuraReach() || m.targetWithinSensor())) {
        m.leashTicks = 0
        return
}
```

- **`fleeOverride` stays outside the tether entirely.** Its comment
  (`mob.go:1190-1200`) says a scripted flee deliberately outruns sensor and
  aura range and that expiring the leash there would wipe a threat table the
  encounter needs retained. A boss ordered to run by its script must not be
  tether-leashed mid-script (L3).
- **`returnPosSet` false ⇒ no tether.** A mob that never recorded an entry
  point has no anchor to measure from; followers are the built-in case (D2)
  and the flag is the existing, already-tested expression of it.
- **The damage flag is still consumed on the tethered path.** `tookDamage` is
  read-and-cleared at the top of `updateEnemyTargeting` (`mob.go:1291-1292`),
  so the new condition must keep that clear unconditional — a mob past its cap
  that banks a stale flag fires it the tick it steps back inside (L7).
- Expiry runs the same `resetAggro()` it runs today, and additionally enters
  the evade state (§3.2).

### 3.2 Protected evade — and why it is not optional

The unprotected version was measured, not argued. `SkillComponent.SetActiveAura`
**zeroes the slot's `TickAccumulator`** (`skills/component.go:562-574`, an
anti-exploit guard against rapid-switch DPS stacking), and mob auras are
authored at `tickInterval` 20–90 ticks (0.67–3 s). Without protection, a player
standing just past the cap and still fighting produces: countdown expires →
`resetAggro` → aura off → the next hit re-seeds threat and re-latches through
retention → aura back on **with its cadence restarted**, every ~3 s, forever. A
mob with `tickInterval: 90` deals *literally zero* damage there. That is the
same failure class as the documented thrash landmine (`support.go:184-190`) and
as the 1-tick flicker 3b was written to fix — and the counter-proposal (mob
walks home undefended while being shot) is a free kill instead. Hence D5.

The state is deliberately **one flag with one entry and one exit**:

- **Enter:** tether expiry only. Not the ordinary state-dependent leash — a
  mob that gives up because you simply left is not being cheesed and needs no
  protection, and giving every leash an immunity would change combat feel
  everywhere for a problem that exists only at the tether.
- **While evading:** immune to all damage, accrues no threat, acquires no
  target, aura off (free — `resetAggro` → `applyMode` → `modeIdle`), walking
  to `returnPos` on the shipped evade-return path (`patrol.go:93-99`).
- **Exit:** **one** exit, hooked to the walk-home's existing arrival clear —
  `updateIdleMovement` already tests `arrivedAt(returnPos)` and clears
  `returnPosSet` (`patrol.go:93-99`), so evade ends there rather than
  re-testing arrival independently. Two arrival tests on one journey is what
  produces a mob that is home but still immune (L7). The failsafe below is
  the same exit, reached differently — not a second one.
- **Failsafe (L2):** if the return has not completed within
  `evadeFailsafeTicks` [PLACEHOLDER ~15 s], the mob is **snapped to
  `returnPos`** and exits evade there. Clearing the immunity *in place* is
  the wrong fix and must not be built: a jammed mob is by definition still
  beyond its tether, so dropping protection without moving it re-opens L1's
  flicker at exactly the worst spot. The snap is deliberately blunt — it
  should never fire, and a visible pop is a better failure than an
  invulnerable statue or a damage off-switch.

**The immunity has a seam already**: `takeDamage`'s `invulnerable` gate
(`mob.go:1690-1702`) is documented as *"no HP loss, no floating number, no
combat signal, no status effect, and no threat"* — every property evade needs,
including the two that matter most (no combat signal ⇒ nothing resets the
countdown; no threat ⇒ nothing re-latches through retention). ⚑ **Do not reuse
the flag** — see L4. The acquisition half is not covered by it and needs its
own gate: that gate's own comment notes *"post-lift targeting starts at sensor
acquisition"*, which is exactly the leak evade must close.

### 3.3 Authoring

- **conf:** `game.mob.maxChaseFactor` [PLACEHOLDER **6.0**] — the cap as a
  multiple of the mob's `aggroRadius`. At the authored spread (1.0–4.2, most
  at 3.6) that is a 6–25 unit territory in a 142 × 71 world: wide enough that
  an ordinary fight never touches it, tight enough that a mob cannot be
  walked across a zone. `0` disables the tether globally (the escape hatch if
  it plays badly — and the honest thing to have during the C2 feel pass).
- **def:** `body.maxChaseDistance` (float, absolute units, absent → the
  multiplier). Loader validation `> 0` when present, mirroring the existing
  `body.aggroRadius` check (`definitions.go:370`).
- **No per-spawn field** (D3). If placement-level control is ever wanted, the
  `wanderRadius` tri-state is the pattern to copy, and `plan-mob-levels.md`
  C3's editor pass is where the field would land.

### 3.4 Who is exempt, and why

| Kind | Tethered? | Mechanism |
| --- | --- | --- |
| Followers / companions | no | `returnPosSet` never set (`patrol.go:114-117`); the owner tether already replaces the leash |
| Structures (totems, braziers, campfires) | no | never chase; `applyMode` early-returns for `RoleStructure` |
| Pacifists / conversants | no | acquire no enemy, so no chase to bound |
| Scripted flee (`SetFleeOverride`) | **suspended** | explicit condition, L3 |
| Ordinary health-triggered flee | yes | ⚑ **not** the same path as the row above — see L3 |
| Owned summons | **open** | §8.1 — they have a spawn point but no meaningful territory |
| Everything else, incl. mob-vs-mob | yes | one rule; a mob dragged by another mob is the same problem |

## 4. Current state — facts this plan stands on (verified 2026-08-05)

- The leash block is `mob.go:1316-1330`; `leashCountdownTicks = 90`
  (`mob.go:1208`). Distance appears in it nowhere.
- `returnPos` / `returnPosSet` exist and are set on idle→combat by
  `noteCombatEntry` (`patrol.go:110-121`), which skips followers and
  un-initialized spawns; `updateIdleMovement` walks the mob back before
  resuming its archetype (`patrol.go:93-99`).
- `resetAggro` clears target + threat + countdown (`mob.go:1346-1350`); a
  later hit re-latches through `highestThreatTarget` retention
  (`mob.go:1303-1307`) — the re-aggro path evade must close.
- `SetActiveAura` zeroes `TickAccumulator` on activation
  (`component.go:566-575`); mob `tickInterval`s are 20–90 ticks.
- `invulnerable` is a **single bool written by encounter scripts every tick**
  as an idempotent re-derive (`warlord.go`, `smoke.go:129`), gating
  `takeDamage` at `mob.go:1700`.
- `Body.AggroRadius` is authored on 67 defs, 1.0–4.2, most at 3.6; the world
  spans ~142 × 71 units (485 spawns in `world.json`).
- The stuck watchdog (`stuck.go`) wraps **chase** movement only —
  `chaseTowards`. Walk-home uses bare `moveTowards`, so nothing today detects
  a jammed return (L2).

## 5. Schema impact (stated per the standing rule)

- **DB: NONE.** Mob AI state is per-session and never persisted.
- **FlatBuffers: NONE.** Nothing new crosses the wire — see §8.2 for the open
  question about whether the evade needs a client cue, which is the one thing
  that would change this.
- **Content JSON:** optional `body.maxChaseDistance`, backwards compatible
  (absent = the conf multiplier). No zone-file change.
- **conf.json: one new knob**, `game.mob.maxChaseFactor` — added to all four
  repo confs plus the live server's fifth (`plan-pre-accounts-hygiene.md`
  §35: one value, many homes).

## 6. Interplay

- **`plan-mob-levels.md`** — independent, no shared code, and this is why the
  two stayed separate plans (the same conclusion its §6 reached about
  `plan-xp-formula.md`). The only contact point is hypothetical: if D3 is ever
  revisited into a per-spawn override, its C3 editor pass is where the field
  belongs. Nothing here blocks or is blocked by it.
- **`plan-camps.md`** — a camp is a cluster of spawns with a shared identity;
  a per-camp tether ("the whole camp defends its ground") is the natural
  future shape and would be a per-spawn or per-camp anchor, not a new
  mechanism. Not designed here.
- **The wall-camp ruling (2026-07-20)** stays untouched: a mob stuck against
  geometry *within* its tether still glares and holds aggro. This plan only
  changes what happens past the distance line.

## 7. Chunk breakdown

- **C1 — the tether + protected evade, server-side.** conf knob (five files) ·
  `body.maxChaseDistance` + loader validation · `tetherExceeded` on the
  `returnPos` anchor · the leash-condition change · the `evading` flag with
  its immunity gate, acquisition gate, exit and failsafe · the `fleeOverride`
  suspension. TDD per §9. Headless-verifiable end to end; no client work.
- **C2 — the feel pass.** In-game with the PO: pick `maxChaseFactor`, confirm
  the evade does not read as broken (the D5 reservation), and decide §8.2 —
  whether an immune returning mob needs a client cue or the existing "hit ring
  with no damage number" precedent carries it. Possible outcome: a wire field
  after all, which is why the schema statement in §5 names it.

## 8. Open questions

1. **Owned summons.** They chase, they have an owner, and `returnPos` is set
   for them (they are not followers unless authored so). A summoned pet that
   tether-leashes and walks "home" to where it was cast is probably right, but
   it has never been played. Proposal: tether them like anything else and
   watch it in C2 — flag, don't block.
2. **Does an immune returning mob need to say so?** The `invulnerable`
   precedent accepts the leak (*"a hit ring with no damage number reads as
   'immune' feedback"*), but that fires during scripted boss phases where the
   player has other cues. A wolf that silently stops taking damage mid-fight
   is the PO's stated annoyance risk. Cheapest answers, in order: nothing ·
   a client-side tint on the existing mob sprite while `aura_category` is 0
   and the mob is walking away (no wire change, weak signal) · one appended
   `Mob` bool (wire change, unambiguous).
3. **`maxChaseFactor` value.** 6.0 is a [PLACEHOLDER] reasoned from the
   authored `aggroRadius` spread against world size, not measured. C2 owns it.
4. **Does the tether want to apply to flee movement?** A fleeing mob runs
   *away* from its attacker and can cross its own tether doing so. Today flee
   is health-triggered and the mob heals and returns; leaving it unbounded
   reproduces current behavior exactly. Deliberately untouched in C1.

## 9. Test strategy

- **Tether geometry:** a mob chased past `maxChaseDistance` from `returnPos`
  starts counting despite the target being inside its sensor · stepping back
  inside the radius zeroes the countdown · a mob with `returnPosSet == false`
  never tethers · `body.maxChaseDistance` overrides the conf multiplier ·
  `maxChaseFactor: 0` disables it entirely.
- **The exemption table (§3.4)** as a case table — one test per row, so a
  future refactor that widens the rule fails by name.
- **`fleeOverride` suspension** (L3): a scripted-flee boss dragged past its
  cap keeps its target *and its threat table*, and re-engages when the script
  lifts.
- **The evade state:** damage during evade is a full non-event (no HP loss,
  no threat, no combat signal — the four properties, asserted individually) ·
  a hit during evade does **not** re-aggro (the acquisition gate, L5) · the
  mob arrives and re-aggros normally afterwards · regen runs on the walk home.
- **L1 pin — the aura-cadence flicker.** Fight a mob past its cap for 10 s and
  assert its aura landed the expected number of ticks. This is the test that
  fails if anyone later removes the immunity and keeps the tether; it is the
  reason D5 exists and it must name it in its failure message.
- **L2 pin:** an evading mob whose path home is blocked is **at `returnPos`
  and no longer immune** within the failsafe window — asserting the position,
  not just the flag, is what makes "cleared it in place" fail.
- **L7 pins:** evade and `returnPosSet` clear on the same tick (no
  home-but-immune window) · a mob that took damage on the tick it crossed its
  cap does not fire that flag when it steps back inside.
- **L4 pin:** an encounter script re-deriving `SetInvulnerable(false)` every
  tick does **not** clear an evading mob's immunity, and lifting an
  encounter's immunity on a mob that is also evading leaves it immune.
- **Headless verify (C2):** a WARP-assisted pull past the cap — mob
  disengages, damage numbers stop, mob walks home, re-aggros on approach.

## 10. Landmines

- **L1 — an unprotected tether is an aura off-switch.** The measured one
  (§3.2): `SetActiveAura` zeroes `TickAccumulator`, so a mob that drops and
  re-latches aggro every ~3 s restarts its aura cadence every ~3 s and a
  `tickInterval: 90` mob deals nothing. Any future "simplification" that
  removes the evade immunity while keeping the tether reintroduces it. The §9
  cadence test is the guard.
- **L2 — a jammed return is a permanently immune mob.** The stuck watchdog
  wraps `chaseTowards`, not the walk-home `moveTowards` (§4), so nothing today
  notices a mob that cannot reach `returnPos` — and under D5 that mob is
  invulnerable forever, standing in the world as an unkillable obstacle. The
  failsafe **snaps it home** (§3.2): dropping the immunity where it stands
  would trade an unkillable statue for L1's damage off-switch, since a jammed
  mob is still past its tether.
- **L7 — one journey, one arrival test, one banked flag.** Evade ends where
  the walk-home already ends (`returnPosSet` cleared on arrival) and nowhere
  else; a second independent `arrivedAt` check drifts from the first and
  produces a mob that is home but still immune. Same shape one level down:
  `tookDamage` must keep being consumed on the tethered path (§3.1), or the
  flag is banked past the cap and fires on re-entry.
- **L3 — `fleeOverride` must suspend the tether, and ordinary flee must not.**
  A scripted flee deliberately outruns everything; tether-leashing it wipes
  the threat table the encounter requires retained (`mob.go:1190-1200`) — and
  bosses are the roadmap's *desired* tether consumer (roadmap.md:349), so the
  two meet. ⚑ **There are two flee paths and they get opposite answers**:
  `shouldFlee()` is health-triggered and stays fully tethered (§8.4 leaves it
  alone deliberately, reproducing today's behavior), while `fleeOverride` is
  encounter-owned and exempt. C1 must not unify them for looking alike.
- **L4 — do not reuse `invulnerable`.** Encounter scripts re-derive it every
  tick as an idempotent write (`smoke.go:129`, `warlord.go`), so a boss script
  would clear an evading mob's protection on the very next tick, and an evade
  would outlive a script's lift. Separate storage, one derived reader:
  `Invulnerable() == invulnerable || evading`. *General shape: a flag with an
  existing every-tick writer cannot take a second owner.*
- **L5 — immunity alone is not un-aggroable.** `takeDamage`'s gate stops
  threat, but sensor acquisition (`findAggroTarget`) is a separate path its
  own comment calls out. Evade needs both gates or a returning mob re-latches
  the first player who walks past it and never gets home.
- **L6 — the anchor is not the spawn point.** `spawnPosition` is wrong for
  patrollers (D2) *and* is randomized within the wander radius at spawn
  (`MobSystem.spawnAt` offsets by `randomInDisc(wanderRadius)`), so measuring
  from it would give two mobs of the same species different effective
  territories for no authored reason.

### Superseded rulings

- **D4 (superseded by D5, same session).** Originally: *"keep today's
  behavior — gradual out-of-combat regen"*, i.e. no protected evade. Reversed
  once the aura-cadence evidence (§3.2) showed the unprotected tether hands
  players a positional damage off-switch. D4's actual substance — no instant
  full heal — survives inside D5.
- **The territory clamp (designed, declined).** The alternative that avoids
  evade entirely: clamp the *chase step* to a circle around `returnPos` so the
  mob holds at the edge with aggro, threat and aura intact, and let the
  shipped 3b countdown handle the give-up once the player is genuinely away.
  It makes the drag impossible by construction, has no flicker and no
  free-kill window, and reuses the "a stuck mob glares, it does not reset"
  ruling verbatim. Declined by the PO in favour of the evade. Its known
  residual, for the day it comes back: mob auras are authored 1.0–2.5 units
  while player auras reach 4.0, so a wide-aura player could stand outside a
  clamped mob's reach and plink it — the wall-camp cheese in a new shape.
