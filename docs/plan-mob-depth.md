# Plan — Mob depth & totems (execution step 2)

**Status:** PLANNED (2026-07-09). Execution plan + decision record for
execution-order step 2 (roadmap.md "Execution order"): **roadmap item 7's
remainder** (patrol archetypes, aggro & threat, support mobs, encounter-
controller spine) **+ effect-foundations Step 3** (spawned-entity/totem
lifecycle, briefing: `plan-effect-foundations.md` §8) **+ the companion
cooldown** (added to scope in this planning session). All numbers
[PLACEHOLDER], per the project-wide rule.

> **Boss *scripts* are content** (step 6 / item 12) — this step builds the
> encounter-controller *spine* and verifies it with a throwaway smoke
> encounter, shaped by the documented lava-bridge reference encounter
> (roadmap item 7).

---

## 1. Goal & scope

### 1.1 In scope

1. **Totem** — the first spawned entity: a player cooldown (`SummonTotem`)
   spawns a stationary, owned, aligned, TTL'd aura carrier. Delivers the
   `spawn` effect type, `model.Owned` ownership/attribution, and the faction
   setter (effect-foundations Step 3, §8).
2. **Flee** — mobs can actively run away from an enemy — the inverse of
   the chase movement — later driven by the threat table (run from the
   highest-threat player). Smoke consumer: a "cowardly" mob that flees
   below an HP threshold [PLACEHOLDER].
3. **Aggro & threat rework** — entity-keyed threat table (highest-threat
   targeting), **faction-aware aggro** (mobs acquire any living
   enemy-faction entity — including totems/companions, decided this
   session), state-dependent leash, auras-off-until-aggroed. (Design
   intent: roadmap item 7 "Aggro & threat".)
4. **Obstacle avoidance (steering)** — mobs get minimally smart about
   `blocksMovement` props: a repulsion/deflection away from blockers,
   the inverse of the attraction toward the movement target. No navmesh.
5. **Patrol archetypes — both** — local wander (`wanderRadius` per spawn
   point, respawn rolled within the wander range) **and** route patrol
   (authored waypoints). Waypoints are placed by the level designer;
   **keeping routes clear of blockers is the level designer's
   responsibility** — steering is only the safety net.
6. **Companion cooldown** (decided this session) — a second spawn-effect
   consumer: a friendly mob that follows the owner at a set distance and
   attacks the first mob the owner attacks or that attacks the owner.
7. **Taunt / anti-taunt effect types** — threat-table operations, parked
   here from `plan-effect-foundations.md` §1 exactly for this moment.
8. **Support mobs** — mobs heal/buff each other: lift the two flagged
   Phase-6 limitations (mobs can't cast heal auras; heals target player
   vitals only) + a seek-wounded-ally behavior.
9. **Encounter-controller spine + threat integration** — lifecycle-hook
   controller (Go struct per encounter behind an interface, per roadmap's
   recorded lean), immunity gating, event-driven spawns, sub-objective
   state, scripted flee — verified by a smoke encounter.

### 1.2 Explicitly deferred (the scope line)

| Deferred | Belongs to | Why now-not |
|---|---|---|
| Real boss scripts (lava-bridge & friends) | item 12 (content) | The spine ships here; scripts are content authored against it |
| Friendly-copy aura ("respawn killed mob as ally") = charm | later / content | Needs the faction *flip* on a live hostile mob + the §6 charm-attribution answer; companion covers the friendly-summon need |
| Pets beyond the companion (swarm, clone, decoy) | later | Build on the same machinery when content wants them |
| Timed world-state + dwell-capture (lava-bridge tail) | ⚑ §6.5 | Candidate to slide to the real boss (content pass); decide at chunk 9 |
| Knockback / pull (physics impulse) | effect-foundations §6 | No impulse concept in per-tick velocity movement; parked |
| ~~Aura line-of-sight (`blocksAura` runtime)~~ | — | **CUT 2026-07-10** — auras never blocked (`tdd.md` §4.2); wall-cheese is owned by steering (chunk 4) + leash (§6.7); `blocksAura` sweep pending |
| Player-affecting control effects | F7 | Mobs-only control in v1 |
| Navmesh / A* pathfinding | only if steering fails | Decided: steering (§1.3) |

### 1.3 Confirmed decisions (this planning session, 2026-07-09)

- **Chunk order head: totem → flee → aggro & threat** (clarified 2026-07-09
  — "avoidance" in the ordering discussion meant *flee*, not obstacle
  steering), testing chase + flee together against the threat table
  in-game; **obstacle steering follows as its own chunk directly before
  patrol**; then companion, taunt, support, encounter controller (tail
  order = proposal, adjustable).
- **Mobs aggro summons — in scope (decided 2026-07-09).** Aggro targeting
  becomes faction-aware — a living enemy-faction entity, not a
  `PlayerEntity` type assertion (this is the Step-1 item deferred to
  exactly this step) — so hostile mobs turn on totems/companions. **Threat
  from summon damage credits the summon itself** (pet-tanking gameplay);
  XP attribution stays with the owner — threat and XP deliberately
  diverge.
- **Route patrol ships now, alongside local wander** (not deferred to the
  content pass).
- **Patrol routes are the level designer's problem** — waypoints are authored
  to avoid blockers; the engine does not validate route reachability. Mobs
  still get **minimal smartness**: steering around obstacles as a net.
- **Obstacle avoidance = local steering** (repulsion from blockers — the
  inverse of the attraction toward the chase/patrol target). Navmesh/A* only
  if steering demonstrably fails.
- **The aggro/threat and encounter-controller work is sub-chunked** — both
  looked too massive as single chunks (user call on the controller; aggro
  sub-structured to match).
- **Companion is in scope** as an additional cooldown: friendly mob spawn,
  follows the player at a set distance, attacks the first mob that either
  the player attacks or is attacking the player; otherwise keeps following.
- **Totem open sub-decisions (§8.4/1–6) are NOT pre-decided** — they get
  presented and settled in chunk 1's plan-first discussion (user call).

---

## 2. Current-state anchors (what this touches)

- **Spawn-point system:** `sys/mob.go` — `spawnPoint` state, first-Update
  initial spawn, `onMobDeath` → same-spot respawn timer. **The totem guard
  already falls out for free:** the respawn loop only serves mobs owned by a
  spawn point ("A mob owned by no point … stays dead", `sys/mob.go:86`).
- **Mob behavior skeleton:** `model/mob/mob.go` — `findAggroTarget`
  (**nearest** `PlayerEntity` in the `aggroAura` sensor), `shouldLoseAggro`
  (fixed territory: mob farther than `aggroRadius` from `spawnPosition`),
  `shouldApproachAggroTarget` (hold at aura edge), `moveTowards`
  (straight-line + slow), out-of-combat regen + `participants` combat reset.
  `SetPosition`'s first call initializes `spawnPosition` + the aggro sensor.
- **XP/attribution prior art (threat seed):** `mob.participants` +
  `PlayerEntity.RecentHealers()` (`tryGrantKillRewards`).
- **Caster dispatch sites for ownership:** `sys/skills.go` —
  `applyDamageAura`'s caster type-switch and `tickDots`' caster replay; both
  must check `model.Owned` BEFORE the `MobEntity` case (§8.2).
- **Cooldown dispatch:** `sys/skills.go` `fireCooldown` (instant_damage /
  instant_dot / self_heal) — the `spawn` effect lands here.
- **Effect payload pattern:** `skills/definition.go` — per-type payload
  struct + `effectKeys` allowlist + validator (Step-0 pattern).
- **Zone spawn schema:** `world/zone.go` `Spawn` (mob/x/y/angle/
  respawnTicks/respawnVariancePct) — gains `wanderRadius` + `waypoints`.
- **Editor:** `frontend/src/features/zone-editor/` (`ZoneModel.ts` mirrors
  `world.Zone` field-for-field; `_ZoneEditorPanel.ts` Spawns mode) — gains
  wander-radius control + waypoint authoring.
- **Aura ring frontend constant:** `GraphicsConfig.mobs.*.
  damageAuraRadiusMeters` duplicates the skill's effective radius (CLAUDE.md
  tech debt) — auras-off-until-aggroed collides with this (§6.2).
- **Physics:** `phy` spatial hashing (broadphase) — steering queries for
  nearby static blockers ride it; all dynamic bodies are circles.
- **Heal limitations to lift (chunk 7):** `sys/skills.go` `healCaster`
  (mobs can't cast heal auras) + heal eligibility requiring `PlayerEntity`
  vitals (mobs can't BE healed) — both flagged in `plan-skill-system.md`.

---

## 3. Architecture & data model

### 3.1 Totem (chunk 1) — §8 adapted to the post-sweep code

`plan-effect-foundations.md` §8 is the implementation record; it predates
the 2026-07-09 dead-code sweep and needs **three adaptations**:

1. **No respawn guard needed at all.** §8 planned a `respawnBehavior:"None"`
   enum guard; the sweep deleted the whole mob-def `Generator` block, and the
   chunk-4 spawn-point system only respawns mobs owned by a point. A totem
   has no spawn point → dies and stays dead. Replace the guard with a pinned
   test (an unowned mob added at runtime never respawns).
2. **"Never spawns naturally" is automatic** — `generator.weight/fixed` no
   longer exist; only `zone.spawns` (and now the `spawn` effect) create mobs.
   The totem mob JSON is simply never referenced by a spawn.
3. **`mob.NewMob(def, chaseIntoAuraMargin)`** — the `rndPos`/`radius` params
   are gone; §8.1's spawn-site call shape updates accordingly. Count pins:
   17→19 skills, 4→5 mobs (+1 more each for the companion, chunk 5),
   milestones 6→7.

Everything else in §8 stands: `spawn` effect payload
(`spawnMob`/`ttlTicks`/`ttlTicksPerLevel`), SkillSystem `model.Game` ref,
`owner`/`SetOwner` + `model.Owned` + owned-first attribution through
`PlayerTouches(owner)`, `SetFaction` (first caller), TTL decrement in
`Mob.Update` after the death check, player-layer body trick (collisionLayer
320 / mask 32), `Totem` EntityType regen FIRST, ids SummonTotem 23 /
TotemAura 106. The §8.2 gotcha inventory remains required reading.

### 3.2 Flee (chunk 2)

A movement mode on the shared behavior: steer directly **away** from a
given entity — the inverse of the chase vector — reusing `moveTowards`'s
plumbing (velocity, slow). Built first against the current `aggroTarget`;
chunk 3 re-points it at the highest-threat enemy. Wall handling v1: a
fleeing mob pinned against the `InvAABB` boundary slides/clamps along it
rather than jittering (full blocker repulsion arrives with chunk 4
steering). Smoke consumer so it's testable in-game: a "cowardly" scaffold
mob that flees while below an HP threshold [PLACEHOLDER]; the real
consumers (support mobs, scripted boss flee) come later.

### 3.3 Threat & aggro (chunk 3)

- **Threat table:** per-mob `map[entityID] → threat` + entity refs — keyed
  by **any living enemy-faction entity**, not just players (decided: mobs
  aggro summons). Credited from observed combat events: damage credits
  **the damage-source entity** — a totem's hit builds threat against the
  totem, while its XP rides `PlayerTouches(owner)`; threat and XP
  attribution deliberately diverge (decided 2026-07-09). Healer threat via
  the `RecentHealers` seam — exact crediting rule ⚑ §6.3. Target = highest
  threat, replacing nearest-in-sensor as the *retention* rule (the sensor
  still *acquires*). Reset with combat state (today's "fully regenerated →
  participants cleared" convention extends to threat).
- **Faction-aware acquisition:** `findAggroTarget`'s `PlayerEntity` type
  assertion becomes "living enemy-faction entity" — a small interface
  (position, radius, health-ratio, faction) that players and mobs both
  already satisfy (`HealthRatio()` exists on both since item 11). **No
  sensor/mask change needed:** aligned summons ride the player layer
  (§8's layer trick), which the aggro sensor already masks; the charm-era
  mask widening stays deferred.
- **State-dependent leash:** in combat (anyone inside aura range OR taking
  damage) → extended/no leash; leash countdown starts when combat clears.
- **Auras-off-until-aggroed:** `SetActiveAura` on aggro, deactivate on
  leash/reset (switching is possible since Phase 6.1). Ring visibility on
  the client needs a wire signal — lean: make the mob's effective aura
  radius wire-driven (0 = off), which also retires the
  `damageAuraRadiusMeters` frontend constant (⚑ §6.2).
- **Flee re-pointed:** chunk 2's flee switches from current-aggro-target
  to the threat table (run from the highest-threat enemy); chase + flee
  verified together in-game.

### 3.4 Steering (chunk 4)

One seam: `moveTowards` (used by chase, walk-home, flee, patrol,
companion-follow). Compose the step vector as **attraction toward the
target (or away from it, for flee) + repulsion from nearby
`blocksMovement` static bodies** (query the broadphase around the mob),
normalize to the mob's velocity. Degenerate cases to pin: blocker
directly on the line (deflect consistently, don't oscillate), mob spawned
overlapping a blocker, target inside a blocker (level-design error — mob
holds nearby rather than jitters). Placed directly before patrol so
route/wander movement lands on already-smart legs.

### 3.5 Patrol + spawn-schema extension (chunk 5)

```jsonc
{ "mob": "Dodo", "x": 30.0, "y": 12.0, "angle": 0.0,
  "respawnTicks": 900, "respawnVariancePct": 0.2,
  "wanderRadius": 3.0,                          // 0/absent = stationary
  "waypoints": [ {"x": 34.0, "y": 8.0}, … ] }   // non-empty = route patrol
```

- Archetype resolution: `waypoints` non-empty → route patrol; else
  `wanderRadius > 0` → local wander; else stationary (today). Both set →
  hard-fail at load (curated content style).
- **Wander anchor = the authored spawn point**, not the rolled respawn
  position — otherwise respawn-within-range + wander-around-respawn
  compounds into drift off the authored spot (§4.7).
- Respawn position: rolled uniformly within `wanderRadius` around the
  authored point (refines world-chunk-4's same-spot respawn; roadmap item 7
  "wander-range respawn").
- Editor: wander-radius input + radius preview circle on spawn markers;
  waypoint authoring in Spawns mode (shape ⚑ §6.6).

### 3.6 Companion (chunk 6)

A mob spawned by a player cooldown (`spawn` effect, second consumer), owned
+ aligned like the totem, but **moving**:

- **Follow:** steer toward the owner, hold at a set distance
  [PLACEHOLDER]; teleport-to-owner only if hopelessly far (⚑ §6.4).
- **Assist/defend targeting:** attack the **first** mob that (a) the owner
  attacks or (b) is attacking the owner; sticky until it dies or leaves
  range, then resume following. Both conditions are observable without an
  event bus: (b) = hostile mob whose aggro target is the owner; (a) needs a
  "recently attacked by owner" signal — shape decided in the chunk
  (`participants` has no timestamps; likely a small last-attacker/tick
  stamp on the mob).
- **Attacks with its own mob-skill aura** (loadout in the companion mob
  JSON), damage crediting the owner through the chunk-1 `Owned` path.
- Look/EntityType: new `Companion` EntityType or the known ~5-line
  `entityType` JSON override onto an existing look — pick in the chunk.

### 3.7 Support mobs (chunk 8)

- Mobs can **cast** heal auras: lift the `healCaster` player-only split —
  healing a mob targets its resource (`health`/`maxHealth`), not player
  vitals; eligibility becomes capability-based (has vitals) instead of
  `PlayerEntity`-asserted.
- **Seek-wounded-ally:** a support mob steers toward the lowest-HP-ratio
  allied mob in range while its heal aura ticks (the aura's
  `lowest_health` selector already picks the target; movement follows it).
- Pack buffs (resist/stat auras on allies) need no new machinery — mobs
  already carry `skills.Buffs`; it's `targetsAllies` content.

### 3.8 Encounter controller (chunk 9)

An ECS system owning per-encounter state objects behind an interface —
Go struct per encounter (roadmap's recorded lean, F3), lifecycle hooks
(`OnTick` / `OnMobDeath` / `OnPlayerEnter` / …) reacting to events that
mostly already fire. Capabilities landed as sub-chunks (§5); consumes the
chunk-3 threat table (boss targets by threat, observes heals for healer
threat) and the chunk-1 spawn machinery (scripted adds).

---

## 4. Pitfalls & gotchas

1. **§8 is partially stale** — apply the three §3.1 adaptations; do NOT
   re-add a `respawnBehavior` field or `generator` block. The rest of the
   §8.2 gotcha inventory (EntityType-regen-first, Owned-before-MobEntity,
   death-check-first-then-TTL, embedded milestone JSON, layer arithmetic,
   skill-ID conventions) is current and binding.
2. **`mob.NewMob` fatals on an unknown EntityType name** — schema regen
   lands before any new mob JSON exists in embedded content (totem AND
   companion chunks).
3. **Aura ring is a frontend constant** — auras-off-until-aggroed is
   invisible (or wrong) on the client without a wire signal; resolve §6.2
   in chunk 3c, don't ship the backend half alone.
4. **Threat ≠ participants.** `participants` is XP attribution (cleared on
   full regen), threat is targeting (cleared on leash/reset). Seed one from
   the other's seams but keep them separate stores — unifying them couples
   XP rules to targeting rules.
5. **`SetPosition` first-call latching:** `spawnPosition` + aggro sensor
   initialize on the FIRST `SetPosition` (`mob.go:284`). Wander/patrol/
   respawn-in-range code must call it exactly once with the intended
   anchor semantics (§3.4) — a second "correcting" call won't move the
   sensor.
6. **Steering must stay inside per-tick velocity movement** — no impulses,
   no position teleports (except the companion catch-up if decided). The
   physics resolution still runs after movement; steering reduces
   wall-jamming, collision resolution remains the hard guarantee.
7. **Wander-anchor drift** (§3.4): anchor wander + leash on the authored
   spawn point, not the rolled respawn position.
8. **Zone-schema changes touch four places in lockstep:** `world.Zone`
   structs (+ `DisallowUnknownFields` means old files stay valid only if
   new fields are *omittable*), the editor `ZoneModel` + `getZoneAsJSON`
   field order, the manual (`manual-zone-editor.md`), and both shipped
   zones. Absent `wanderRadius`/`waypoints` must mean "stationary"
   (backward-compatible zero values).
9. **Mobs ignore the totem until chunk 3** — today `findAggroTarget`
   filters `model.PlayerEntity`, so chunk 1 ships with hostile mobs not
   *aggroing* the totem (their auras still hit it via the player-layer
   trick). Decided in scope: faction-aware acquisition + summon
   self-threat close this in chunk 3; the companion (chunk 6) never ships
   with the gap. Related: **threat credits the summon, XP credits the
   owner** — the `Owned` attribution path must NOT route both to the
   owner (#4's separation-of-stores applies to crediting too).
10. **Flee vs the boundary wall:** a fleeing mob pinned into an `InvAABB`
    corner must not jitter. Flee (chunk 2) lands BEFORE steering (chunk
    4): v1 flee clamps/slides along the wall; once chunk 4 lands, wall
    repulsion composes in like any other blocker.
11. **Stale-server trap** (standing): `pkill berryhunterd`,
    `make -C backend build` (NOT `go build`), check boot-log count pins —
    which change **twice** in this step (totem chunk, companion chunk).
12. **Mob-vs-mob damage has no participant tracking** — support-mob heals
    and buffs must not accidentally create XP entitlements; the
    `RecentHealers` window is a *player* concept. Verify the heal-lift
    (chunk 7) doesn't route mob healers into player reward paths.

---

## 5. Chunking (dependency order)

Each chunk is plan-first, TDD'd, independently landable + in-game-verified,
with a pause between chunks (working style). Chunks 1–3 are the confirmed
head order; 4–9 are the proposed tail (steering deliberately parked
directly before patrol).

### Chunk 1 — Totem: spawned-entity lifecycle (backend + wire + content)

> **✓ DONE — implemented + VERIFIED IN-GAME 2026-07-09** (full backend suite
> green after `go clean -testcache`, tsc + webpack green; in-game: offset
> spawn, owner XP on totem kills, TTL expiry, totem renders + burns).
> One bug found during verification: the totem was invisible — a new mob
> layer in `Game.ts` is a TWO-step edit (`createNamedContainer` AND
> `cameraGroup.addChild`); the second was missing. Recorded in
> `manual-content-authoring.md` step 9.
> §8.4 decisions settled — 1/2/3/5 as leaned, **4 amended: two scaling
> sources** (summon-skill level → TTL + loadout level via
> `RaiseLoadoutLevels`; owner player level → bonus max HP + damage/heal
> power multiplier, **never CC**), **6 amended: offset spawn** (random
> unblocked point on the caster ring via new `phy.Space.QueryCircleStatics`,
> fallback caster position) — record in `plan-effect-foundations.md` §8.4.
> Landed: `Totem` EntityType (wire), `spawn` effect payload
> (`spawnMob`/`ttlTicks`(+PerLevel)/`maxHealthPerOwnerLevel`/
> `powerPerOwnerLevel`) with boot-time spawnMob cross-validation in
> `mobs.RegistryFromFS`, `Mob` owner/faction/TTL/`SummonPower`/
> `RaiseMaxHealth`, `model.Owned`, `NewSkillSystem(space, game)` +
> `fireCooldown` spawn case, owned-first dispatch in `applyDamageAura` +
> `tickDots` (dot power frozen at application; caster stays the summon,
> owner resolved at tick time), content totem.json (mob id 5, layer
> 160/mask 16) + totem-aura.json (id 106, dot) + summon-totem.json (id 23)
> + milestone L6, frontend Totem class/layer/SVG/`gameObjectClasses`[17] +
> Skills.ts id 23. Count pins now **19 skills / 5 mobs / 7 milestones**.

- **Goal:** `SKILL SummonTotem` → cooldown spawns an owned, aligned,
  stationary, TTL'd aura carrier; **the owner gains XP on its kills** (the
  defining assertion); it can be buffed by ally auras, killed by hostile
  auras, expires on TTL, never respawns.
- **Do:** the §8.5 sequence minus its step 3 (respawn guard — obsolete),
  with §3.1's adaptations: EntityType regen → `spawn` payload →
  mob owner/faction/TTL + `model.Owned` → MobSystem no-respawn pin →
  SkillSystem game ref + `fireCooldown` spawn case → owned-first
  attribution → content (totem.json, totem-aura.json, summon-totem.json,
  milestone L6) → frontend (rendering entry, SVG placeholder, Skills.ts).
- **Settle first (⚑ §6.1):** the §8.4 sub-decisions 1–6 — ✓ settled
  2026-07-09, see the banner above.
- **Tests:** §8.5's list (minus the RespawnBehavior ones), plus
  unowned-mob-never-respawns in `sys/mob_test.go`.
- **Known interim:** hostile mobs don't *aggro* the totem yet (their auras
  still hit it in range) — chunk 3's faction-aware acquisition closes
  this (#9).

### Chunk 2 — Flee movement mode (backend + smoke content)

> **✓ IMPLEMENTED 2026-07-09; standalone smoke VERIFIED IN-GAME same day;
> full verification — chase + flee against the threat table — VERIFIED
> IN-GAME 2026-07-11 with chunk 3** (full backend suite green, tsc + webpack
> green). User-observed and confirmed-as-designed: the rabbit flees at
> half HP until it crosses its territory edge, then the existing leash drops
> aggro → out-of-combat regen snaps it to full (~2 s, shared placeholder
> constant) → it re-aggros healthy. That regen reset IS the flee exit (no
> hysteresis field); the abrupt leash feel is chunk 3b's job
> (state-dependent leash) and flee re-points at the threat table in 3d.
> Landed: `Mob.moveAwayFrom` (inverse chase vector, shared `stepLength`
> slow/velocity handling, zero-distance threat falls back to the current
> heading), `shouldFlee` on new mob-def **`factors.fleeBelowHealthRatio`**
> (strictly-below trigger; 0/absent = never, 1 = flees whenever damaged,
> hard-fail outside [0, 1]); in `Update`, flee wins over approach while the
> trigger holds. **No exit hysteresis needed:** a fleeing mob leaves its
> territory → existing leash drops aggro → walk-home regen recovers it above
> the threshold. **v1 wall handling confirmed free:** the InvAABB per-axis
> clamp makes an angled flee *slide* along the boundary and a perpendicular
> one pin stationary — pinned through the real `Space.Update()` (corner
> convergence + wall slide, gotcha #10), zero new wall code.
> **Smoke consumer (user call: full new-EntityType path, not a Dodo flag):**
> new **`Rabbit`** EntityType (ordinal 18, `server.fbs` + Go/TS regen) +
> `api/mobs/rabbit.json` (id 6, DodoAura L1, fleeBelowHealthRatio 0.5,
> maxHealth 20, speed 0.8 → 0.044/tick, just under the player's 0.05 so it
> stays catchable — all [PLACEHOLDER]) + 2 scaffold spawns (8,4)/(10,−3)
> @600t + the 5-file frontend path (rabbit.svg, Graphics.ts 22–30/ring 0.6 =
> DodoAura, Mobs.Rabbit, BOTH Game.ts layer steps, gameObjectClasses[18]).
> Mob registry now **6 mobs** (boot log; no hard count pin exists for mobs).
> Pins: `TestMob_Flees*`/`TestMob_AtThreshold*`/`TestMob_FleeRespectsSlow`/
> `TestMob_NoFleeThreshold*`/`TestMob_FleeFromThreatAtOwnPosition*`/
> `TestMob_FleePinnedInBoundaryCornerConverges`/`TestMob_FleeAlongWallSlides`
> + `TestMapMobDefinition_*FleeBelowHealthRatio*`.
> **In-game smoke checklist (works today, formally due with chunk 3):** find
> a Rabbit in scaffold → it chases/nips like a Dodo → damage it below half →
> it turns and runs from you, sliding along walls it hits; break chase → it
> leashes home, regens, and chases normally again on the next aggro.

- **Goal:** a mob can actively run away from an enemy — the inverse of
  chase — visible in-game.
- **Do:** flee as a movement mode on the shared behavior (§3.2): invert
  the chase vector, reuse `moveTowards` plumbing (velocity, slow); v1
  wall handling = slide/clamp along the boundary (full blocker repulsion
  is chunk 4); trigger seam kept generic, with a smoke consumer: a
  "cowardly" scaffold mob that flees while below an HP threshold
  [PLACEHOLDER].
- **Tests:** flee vector points away + respects slow; cowardly trigger
  enters/exits flee at the threshold; boundary corner doesn't jitter;
  chase behavior unchanged without the trigger.
- **Gotchas:** #10.

### Chunk 3 — Aggro & threat rework (backend + small wire), sub-chunked

> **✓ DONE 2026-07-10 — VERIFIED IN-GAME 2026-07-11 (chunks 2+3 together):
> checklist passed except two found issues, BOTH FIXED same day and the
> fixes re-verified in-game same day:** (1) **chase
> flicker** — the leash countdown ran whenever the target was out of *aura
> reach*, so a chased-but-unreachable target inside the aggro sensor expired
> the leash every ~3 s → resetAggro → sensor re-acquire next tick = 1-tick
> aura/ring flicker + threat table wiped mid-chase; fix: in-combat also
> includes **target within the aggro sensor** (`targetWithinSensor`,
> geometric twin of the sensor overlap) — the countdown only runs with the
> target unreachable AND out of sight; pinned by `TestMob_ChasingTarget
> InsideSensorNeverLeashes` (red at exactly tick 91 pre-fix). (2) **healer
> threat never fired on sensor-acquired combat** — crediting filtered on
> `HasThreat(healedID)` only, but a tank who deals no damage has NO threat
> entry (boss acquired them via sensor) → empty table → healer never
> credited; fix **amends the §6.3 decision**: "in combat with the heal
> target" = threat table holds the healed entity **OR the mob's current
> aggro target is the healed entity** (new exported `Mob.TargetsEntity`,
> `threatReceiver` widened); pinned by `TestApplyHealAura_CreditsHealer
> ThreatOnSensorAggroMob` + `TestMob_TargetsEntity`. Note the calibration:
> once the tank DOES deal damage, the healer only pulls when 0.5 × healed HP
> out-threats the tank's damage — intended shape, `healerThreatFactor` is
> the balance knob. (Full backend suite green —
> 21 pkgs, binary rebuilt; tsc + webpack green.) All four §6.3/§6.2-adjacent
> decisions settled at chunk start (user, 2026-07-10): **threat = post-
> mitigation HP** actually lost (resists reduce threat); **healer threat =
> heal-event crediting** — a landed heal credits the healer with healedHP ×
> `healerThreatFactor` [PLACEHOLDER 0.5] on every mob **in combat with** the
> healed entity — threat table holds it OR it is the current aggro target
> (the OR-half amended 2026-07-11, see the fix note above;
> `SkillSystem.creditHealerThreat` iterates
> `s.entities`; self-heal cooldowns deliberately credit nothing);
> **reset-only decay** (threat clears with the combat reset, no per-tick
> bleed); **stationary mobs (speed 0) keep auras always-on** — 3c gating
> would otherwise kill totems (dummy 0.1 aggro sensor; an aligned totem's
> sensor masks the player layer and never sees a mob), and a hazard that
> cannot chase has its aura as its entire behavior. Zero content edits.
> **3a mechanics:** new **`model.Combatant`** (BasicEntity + Factioned +
> Position/Radius/HealthRatio; "living" = HealthRatio() > 0) replaces the
> `PlayerEntity` assertion in `findAggroTarget` (faction-aware: summons ride
> the player layer, no mask change) and retypes `Mob.aggroTarget`. Per-mob
> `threat map[entityID]*threatEntry` (ref + float), seeded in
> `PlayerTouches`/`MobTouches` from `takeDamage`'s now-returned actual loss;
> **`model.Damage` gained `Source Combatant`** — stamped by
> `applyPlayerDamageAura` (owned casts) and `tickDots` (kept alongside the
> owner replacement), so **threat credits the summon while XP rides the
> toucher** (gotcha #9); dead/absent Source falls back to the toucher (an
> expired totem's burn pulls threat to the owner). Retention rule in
> `updateAggro`: table non-empty → target = highest living threat (ties →
> lower ID; dead entries pruned on read), table empty → sensor acquires
> nearest — **a hit from outside the sensor acquires via threat (snipers
> get retaliated)**. **TTL expiry now zeroes health** so stale threat refs
> to a removed summon read dead (rewards untouched — they only flow through
> PlayerTouches). Exported seams `NoteThreat`/`HasThreat`/`TargetsEntity`
> (healer threat now, taunt in chunk 7). **3b:** the fixed territory check
> is GONE — in-combat (target within aura reach OR **inside the aggro
> sensor** OR damage taken since last tick) has
> no leash; combat clear starts `leashTicks`, expiry past
> `leashCountdownTicks` [PLACEHOLDER 90 ≈ 3 s] runs `resetAggro` (target +
> threat cleared, aura off, walk home + regen follow). A mob whose target
> outruns it (leaves the sensor) gives up ~3 s later; the rabbit now flees
> as long as it's chased instead of snapping at the territory edge. **3c:** moving mobs
> spawn with the aura **gated** (`ActiveAuraSlot -1`; sensor still pre-sized
> from slot 0 so the chase stop distance is right from the first aggro
> tick), `setAuraActive` flips on aggro/reset transitions only (idempotent —
> re-calling SetActiveAura would zero the tick accumulator and the aura
> would never fire). Wire: **`Mob.aura_radius:ushort`** appended (px, 0 =
> off; Go + TS regen), `Mob.AuraRadius()` mirrors the player's, codec sends
> it; frontend `Mobs.Mob.setAuraRadius` builds/scales/hides the ring from
> the wire via a new `EntityManager` mob branch — **`damageAuraRadiusMeters`
> deleted from Graphics.ts/Mobs.ts (standing tech debt retired; ring
> texture rasterizes at a fixed [PLACEHOLDER 4 m])**. **3d fell out of 3a:**
> `aggroTarget` IS the highest-threat entity, so flee already runs from it —
> pinned only. **Pins:** `TestMob_ThreatCreditsPostMitigationDamage`,
> `TestMob_PlayerTouches_SummonSourceGetsThreatOwnerGetsXP`/
> `_DeadSourceFallsBackToToucher`, `TestMob_MobTouches_OnlyEnemyFaction*`,
> `TestMob_Update_RetargetsHighestThreat`/`_ThreatFromOutsideSensor*`/
> `_DeadThreatEntryPruned*`, `TestMob_FindAggroTarget_AcquiresEnemyFaction
> Summon`, `TestMob_LeashCountdown*`/`_InCombatHasNoLeash`/
> `_DamageResetsLeashCountdown`/`_ChasingTargetInsideSensorNeverLeashes`,
> `TestMob_TargetsEntity`, `TestNewMob_MovingMobSpawnsAuraGated`/
> `_StationaryMobAuraAlwaysOn`, `TestMob_AuraActivatesOnAggroDeactivates*`,
> `TestMob_FleesFromHighestThreat`, sys `TestApplyDamageAura_OwnedCaster
> StampsSummonSource`/`_DirectPlayerCastHasNilSource`,
> `TestTickDots_OwnedDotKeepsSummonAsSource`, `TestApplyHealAura_Credits
> HealerThreatOnMobsFightingTarget`/`_OnSensorAggroMob`, codec
> `TestMobMarshalFlatbuf_
> AuraRadius`; TTL-zeroing folded into `TestMob_TTLExpiryKills`. **Adapted
> existing pins (by design):** `TestNewMob_SkillLoadoutWiring` (slot -1 at
> spawn), `TestMob_FullOutOfCombatRegenClearsParticipants` (damage seeds
> threat → leash must reset before regen). `applyHealAura` became a
> `SkillSystem` method (rng + entity list); ~11 test callsites moved to a
> `testSkillSystem()` helper.
>
> **In-game checklist (chunks 2+3 — RUN 2026-07-11: passed except the two
> findings fixed above; both fixes re-verified in-game 2026-07-11 — no ring
> flicker while chased-but-unreachable, healer pull with a no-damage tank
> works):** rebuild frontend too (ring
> change); `pkill berryhunterd`, boot log `count=19` skills / 6 mobs.
> 1. **Ring gating:** idle Dodo shows no ring; aggro it → ring appears at
>    the exact aura size; leash it off → ring gone, walk home, regen.
> 2. **Threat retention:** two damage sources — the mob chases the bigger
>    total damage dealer, not the nearer one.
> 3. **Sniper retaliation:** hit a mob from beyond its aggro radius
>    (Ignite) → it comes for you.
> 4. **Leash:** outrun a chaser without fighting back → it gives up after
>    ~3 s; keep hitting it while kiting → it never gives up.
> 5. **Rabbit:** flees below half HP *while chased* (no territory snap),
>    wall-slides; escape → regen → healthy re-aggro.
> 6. **Totem (closes gotcha #9):** summon next to a mob, let it burn —
>    the mob turns on the totem once it out-threats you, kill XP still
>    lands on you; proving-grounds braziers still burn passersby
>    (stationary always-on exemption).
> 7. **Healer threat:** healing someone a mob is fighting eventually draws
>    the mob onto the healer (needs a second player, or fold into #6
>    observationally).

- **3a — threat table + faction-aware acquisition:** entity-keyed threat
  store (§3.3) seeded from the existing damage/heal seams; damage credits
  the source entity (summons build their own threat — decided); the
  `PlayerEntity` aggro filter becomes the living-enemy-faction predicate,
  so mobs acquire totems/companions too; chase target = highest threat
  (sensor still acquires); reset on combat end. ⚑ §6.3 (crediting
  numbers, healer rule) settled at chunk start.
- **3b — state-dependent leash:** in-combat extended chase, countdown
  after combat clears; replaces the fixed territory check.
- **3c — auras-off-until-aggroed:** active aura on at aggro, off at reset;
  wire decision ⚑ §6.2 (lean: wire-driven effective radius, 0 = off; also
  retires the frontend ring constant).
- **3d — flee re-point:** chunk 2's flee switches from
  current-aggro-target to the threat table (run from the highest-threat
  enemy).
- **In-game verification (chunks 2+3 together, user call):** mob chases
  the highest-threat player, holds aggro while in combat, shows its ring
  only while aggroed, leashes home after; the cowardly mob flees the
  highest-threat player; **a hostile mob turns on a summoned totem that
  out-threats the owner** (closes chunk 1's interim gap, #9).
- **Gotchas:** #3, #4, #9.

### Chunk 4 — Obstacle avoidance: steering (backend)

> **Handoff from chunk 3 (2026-07-10) — read before the plan-first start:**
> - **Seam layout after chunk 3:** `moveTowards` serves chase + walk-home,
>   `moveAwayFrom` serves flee; both draw the tick distance from
>   `stepLength()` (velocity × strongest slow). Repulsion composes into the
>   *direction* those two build — `stepLength` stays the magnitude home.
> - **`Mob` has NO `phy.Space` reference** — movement is pure geometry off
>   entity refs today. The ready-made statics query is chunk 1's
>   `phy.Space.QueryCircleStatics` (works pre-Update, mask-filtered), but
>   getting the space (or a query closure) into the mob is a chunk-4
>   design decision to settle plan-first (NewMob param vs. injection via
>   MobSystem/GameConfig — note ~17+ NewMob callsites, mostly tests).
> - **The mob's own body collision set is NOT a lookahead** — it only holds
>   actual overlaps after resolution; repulsion-from-nearby-blockers needs
>   the query above.
> - **3b softened the failure mode:** a mob jammed behind a blocker, out of
>   aura reach and taking no damage, now leashes home after ~3 s instead of
>   jamming forever. Steering is about pursuit *quality*; the
>   stuck-forever case is already gone.
> - Gotchas #5 (SetPosition first-call latching) and #6 (steering stays
>   inside per-tick velocity movement, resolution remains the hard
>   guarantee) are unchanged and binding.

- **Goal:** a mob chasing/fleeing/returning around a blocking prop
  deflects around it instead of jamming.
- **Do:** repulsion-from-blockers composed into `moveTowards` (§3.4);
  broadphase query for nearby static `blocksMovement` bodies; consistent
  deflection side; tune the repulsion falloff [PLACEHOLDER]. Placed
  directly before patrol so route/wander movement benefits.
- **Tests:** unit — straight path blocked → mob makes progress past the
  blocker within N ticks (through the real `Space.Update()`, like the
  prop/InvAABB end-to-end pins); no-blocker path unchanged; corner/pinned
  cases don't oscillate; flee composes with wall repulsion (#10 closed).
- **Gotchas:** #6, #10.

### Chunk 5 — Patrol archetypes + wander respawn (backend + editor + content)
- **5a — local wander:** `wanderRadius` on `world.Spawn` + zone loader
  validation; idle wander behavior anchored on the authored point; respawn
  position rolled within the radius; editor control + marker preview;
  scaffold zone exercises it.
- **5b — route patrol:** `waypoints` on the spawn (⚑ §6.6 schema shape);
  patrol movement (loop/ping-pong ⚑); editor waypoint authoring; route
  validity stays a level-design responsibility (decided).
- **Tests:** archetype resolution + validation hard-fails; wander stays
  within radius; respawn-within-band; waypoint traversal order; leash/
  aggro interplay (patroller aggros mid-route, fights, returns to route).
- **Gotchas:** #5, #7, #8.

### Chunk 6 — Companion cooldown (backend + wire + content)
- **Goal:** a cooldown spawns a friendly mob that follows the owner at a
  set distance and attacks per the §3.6 rule, crediting the owner.
- **Do:** follow behavior (steer toward owner, hold distance); assist/
  defend target acquisition (§3.6 — the "owner attacked X" signal is the
  one new seam); sticky target; EntityType/look decision; content
  (companion mob JSON + companion-summon cooldown JSON); count pins again.
- **Settle first (⚑ §6.4):** lifetime (TTL vs until-death), follow
  distance/catch-up, max-one enforcement.
- **Tests:** follows at distance; acquires on owner-attacked and
  on-owner-attacked; sticky until death/range; owner XP credit; companion
  builds its own threat (a mob can turn on it); no acquisition while
  conditions absent (pure follow).
- **Gotchas:** #2, #9, #11.

### Chunk 7 — Taunt / anti-taunt effect types (backend + content)
- **Goal:** the parked threat-table operations become effect types.
- **Do:** payload structs per the Step-0 pattern (taunt = force-to-top /
  large threat credit; anti-taunt = threat wipe/reduction — exact semantics
  settled at chunk start against the 3a table shape); mob-skill + player-
  skill smoke content.
- **Tests:** threat-table deltas per effect; taunted mob retargets;
  eligibility/faction gates.

### Chunk 8 — Support mobs (backend + content)
- **Goal:** a healer mob keeps its pack alive; a buffer mob's ward is
  visible on allies.
- **Do:** lift `healCaster` + heal-target capability (§3.7); seek-wounded-
  ally movement; smoke content (healer mob + pack in the scaffold zone).
- **Tests:** mob-cast heal aura heals a wounded allied mob (resource, not
  player vitals); no player-reward leakage (#12); healer steers to the
  wounded ally; faction gates hold (no healing players by accident).
- **Gotchas:** #12.

### Chunk 9 — Encounter-controller spine (backend), sub-chunked (user call: break it down)
- **9a — spine:** controller interface + lifecycle hooks + registration in
  `core/game.go`; a smoke encounter driven by `OnTick`/`OnMobDeath` proves
  the loop.
- **9b — immunity gating:** conditional damage immunity the controller
  toggles (the flag is trivial; the controller owns the condition).
- **9c — scripted spawns:** controller-driven mob spawning (reuses the
  chunk-1 spawn machinery; no spawn point → no respawn, already guaranteed).
- **9d — sub-objective state + timers:** "all N dead within a window"
  tracking, respawn timers owned by the encounter.
- **9e — threat integration + scripted flee:** boss targets by threat
  (observing heals for healer threat); the scripted-flee reference (flee
  while spawning adds, threat table retained throughout — roadmap item 7).
- **9f — timed world-state + dwell-capture:** wire-visible timed states
  (bridge open 20 min) + first-player-dwell trigger. **⚑ §6.5: candidate
  to slide to the content pass** with the real lava-bridge boss.
- **Tests:** per sub-chunk; the smoke encounter is throwaway content
  (scaffold zone), not a designed boss.

---

## 6. Open sub-decisions (pin before the relevant chunk)

- **§6.1 — Totem sub-decisions (chunk 1): ✓ DECIDED 2026-07-09** — 1/2/3/5
  as leaned (full `PlayerTouches` path, stale-ref accepted, killable,
  dedicated TotemAura). **4 amended:** summon-skill level scales TTL AND
  loadout level; owner player level scales bonus max HP + a damage/heal
  power multiplier — **never CC parameters**. **6 amended:** offset spawn
  at a random unblocked point on the caster ring (fallback: caster
  position) — the spawn must be instantly visible, never covered by the
  avatar. Full record: `plan-effect-foundations.md` §8.4.
- **§6.2 — Aura-ring visibility wire (chunk 3c): ✓ DECIDED + SHIPPED
  2026-07-10** as leaned — `Mob.aura_radius:ushort` appended (px, 0 = off),
  mirroring `Character.aura_radius`; `damageAuraRadiusMeters` deleted
  (tech debt retired). See the chunk-3 banner.
- **§6.3 — Threat semantics (chunk 3a): ✓ DECIDED 2026-07-10, AMENDED
  2026-07-11** (user, at
  chunk start) on top of the 2026-07-09 keying/attribution decisions:
  **threat = post-mitigation HP** actually lost per hit; **healer threat =
  heal-event crediting** (healedHP × `healerThreatFactor` [PLACEHOLDER 0.5]
  on every mob **in combat with** the healed entity; self-heals credit
  nothing). **Amendment (in-game check 2026-07-11):** "in combat with" =
  threat table holds the healed entity **OR the mob's current aggro target
  is the healed entity** — the original table-only predicate never fired
  for a tank holding sensor-acquired aggro without dealing damage (empty
  table → the healer could heal forever and never pull; found on the
  AngryMammoth). With the fix, the healer's first landed heal creates the
  mob's only threat entry and retention swings it onto the healer;
  **reset-only** (no decay over time — revisit as a tuning knob
  if fights feel too sticky). Bonus decision the chunk surfaced:
  **stationary mobs (speed 0) are exempt from 3c aura gating** (always-on
  hazards; keeps totems/braziers functional with zero content edits).
- **§6.4 — Companion specifics (chunk 6):** lifetime (TTL like the totem
  vs until-death), follow distance + catch-up teleport, max one companion
  (content convention like the totem, or enforced). (Whether hostile mobs
  can target it is DECIDED: yes — it builds its own threat, §1.3.)
- **§6.5 — Encounter 9f cut line:** timed world-state + dwell-capture now
  (complete spine) vs with the real boss (content pass). Lean: slide to
  content — they're the two pieces with wire footprint and no smoke-test
  value.
- **§6.6 — Waypoint schema shape (chunk 5b):** per-spawn inline waypoint
  list (lean — KISS, matches "one spawn = one mob") vs named shared routes;
  loop vs ping-pong traversal; editor UX for placing an ordered point list.
- **§6.7 — No-progress leash rule (PARKED 2026-07-10, user call: not
  scheduled — raise at chunk 4 plan-first or later).** With aura LoS cut
  (`tdd.md` §4.2), this is the **designated leash mechanic against
  wall-cheese**: the chunk-3 combat state ("target within aura reach OR
  inside the aggro sensor OR damage taken" — sensor half added by the
  2026-07-11 flicker fix, and the sensor ignores walls too) means a
  wall-stuck mob being shot through the wall never
  starts its leash countdown — it stands pinned until dead. The rule: a mob
  *trying to approach* its target with no progress for N ticks
  [PLACEHOLDER] treats combat as cleared despite taking damage → normal
  leash countdown → reset, walk home, full out-of-combat regen — the cheese
  yields nothing. Few lines in the chunk-3 leash logic; must not fire on a
  mob legitimately holding at the aura edge (that mob has reached its
  target). Steering (chunk 4) covers small convex blockers; this covers
  walls; navmesh stays the escalation (trigger: wall-cheese in playtests).
- **Content-era movement vocabulary (captured 2026-07-10, not in this
  plan's scope):** telegraphed lunges, arc pursuit, ground-zone denial —
  the GDD §4 Combat Pacing countermeasures against boring ring-riding;
  candidates for later chunks / the content pass (also noted in roadmap
  item 7).

---

## 7. Cross-references

- `plan-effect-foundations.md` §8 — the totem briefing/implementation record
  (read WITH §3.1's adaptations) + §4 Step 3, to be flipped DONE after
  chunk 1.
- `roadmap.md` item 7 — behavior archetypes, aggro & threat design intent,
  boss-encounter audit, lava-bridge reference encounter; "Execution order"
  step 2 (this plan).
- `plan-world-zones.md` — spawn-point system this extends (§3.3, gotcha #7);
  zone schema + editor this reuses (chunk 5).
- `plan-skill-system.md` — mob skill loadouts (Phase 6), the two heal
  limitations chunk 7 lifts.
- `docs/manual-zone-editor.md` — update with wander/waypoint authoring
  (chunk 5).
- `docs/manual-content-authoring.md` — new-mob EntityType path (totem +
  companion chunks).
