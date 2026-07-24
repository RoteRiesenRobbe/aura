# Plan — Mob depth & totems (execution step 2)

**Status:** ✅ **COMPLETE (2026-07-12)** — all 9 chunks implemented +
verified in-game (totem → flee → aggro & threat → obstacle steering → patrol →
companion → 6.5 hazard braziers → 6.6 mob factions → 7 taunt/fade → 8 support
mobs → 9 encounter-controller spine + `THREAT` cheat). Boss *scripts* landed
later in the content pass (C6 Orc Warlord); 9f (timed world-state + dwell
capture) was dropped from v1 scope there. Per-chunk outcome banners are inline
below; roadmap record: `roadmap.md` "Execution order" step 2.

*Planned 2026-07-09.* Execution plan + decision record for
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
7. **Taunt / anti-taunt effect types** ✓ **DONE + VERIFIED IN-GAME
   2026-07-11** — threat-table operations, parked here from
   `plan-effect-foundations.md` §1 exactly for this moment. Force-to-top
   Taunt + single-entry-removal Fade, both player cooldowns; two mob threat
   seams; no wire changes (see the chunk-7 banner in §5).
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
- **Heal limitations to lift (chunk 8):** `sys/skills.go` `healCaster`
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
  hard-fail at load (curated content style). *(Implemented — decisions and
  the WoW-classic evade-return amendment in the chunk-5 banner, §5.)*
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
- **Seek-wounded-ally [SHIPPED via the aggro machinery, not a stamp]:** a
  seek-healer's aggro sensor senses allies (`LayerCombatants`) and
  `updateHealerTargeting` acquires the most-wounded same-faction ally as its
  aggro target — so the existing chase + aura-gate machinery move it to the
  ally and turn its heal ring on/off, exactly like a damage mob reacting to a
  player. (The chunk-8 DONE banner in §5 is the authoritative record.)
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
11. **Stale-server trap** (standing): `pkill aurad`,
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

> **STATUS: DONE — IMPLEMENTED + VERIFIED IN-GAME 2026-07-11 (full backend
> suite green 21 pkgs, binary rebuilt; zero wire/frontend/content changes;
> committed same day). Verification ran in two rounds: the first round
> produced the 3 observations below (2 fixed same day), the second round
> confirmed the fixes — curves tight, no stuck mobs.**
>
> **First in-game round (2026-07-11) — 3 observations, 2 fixes same day
> (red-first; re-verified in-game same day):**
> (1) **Wide curves** — mobs rounded props on aura-ring-sized arcs (user
> screenshot): `steeringLookahead` 1.5 was simply too large →
> **reduced to 0.6 [PLACEHOLDER]**; existing pins held. (2) **Perceived
> slowdown** — no code change: step magnitude was never touched (steer
> returns unit directions); the effect was pure path overhead from (1) —
> at lookahead 1.5, almost every path in a prop-dense zone was curved.
> (3) **Side-flip oscillation (real bug)** — a mob jittered in place
> against a tree+rock pair, flipping its deflection side every tick: the
> perpendicular-lean side pick is only stable against a SINGLE blocker;
> between two, each sideways step makes the other blocker's repulsion
> dominate and the lean flips back. The tighter lookahead of (1) also
> exposed the same class in the wall corner
> (`TestMob_FleeIntoCornerEscapesAlongEdge` went red — steeper falloff
> gradient). **Fix: side latch** — `Mob.steerSide` (+1/−1, 0 unset) picks
> the side on the first head-on tick (lean of the combined vector, exact
> line → left) and holds it until the mob is FULLY clear of repulsion
> (rep = 0 resets), committing it to one way around a cluster/corner.
> Pinned by `TestMob_TwoBlockerPocketNoSideFlipOscillation` (reproduced
> the report: mob frozen at the pocket mouth pre-fix).
> Plan-first decisions (user, 2026-07-11): **space access = `NewMob`
> parameter** — `NewMob(def, chaseIntoAuraMargin, space *phy.Space)`, nil =
> no steering (movement stays the exact pre-chunk straight line; all ~34
> test callsites nil-padded, both production spawn sites pass the real
> space: `MobSystem` gained a `space` field via `NewMobSystem(g, seed,
> spawns, space)` ← `p.Space()` in `core/game.go`, `spawnSummon` passes
> `s.space`); **border wall (InvAABB) participates in repulsion** (gotcha
> #10 closed as the plan described, not left to the clamp).
> **Mechanics (`model/mob/steering.go`):** `steer(desired)` bends the unit
> step direction of BOTH `moveTowards` and `moveAwayFrom` (chase, walk-home,
> flee — later patrol/companion — all steer; `stepLength` stays the
> magnitude home, physics resolution stays the non-penetration guarantee,
> gotcha #6). Repulsion = `QueryCircleStatics` probe at
> `m.Radius() + steeringLookahead` [PLACEHOLDER 0.6, was 1.5 — see the
> in-game-round block above] **carrying the mob's
> own body mask** — a mob that walks through a static is never repelled by
> it (the AngryMammoth ignores rocks for free, the Border bit keeps wall
> repulsion on for it). Per-blocker: circles push radially, the InvAABB
> pushes axis-aligned inward per edge within lookahead (corners = both
> axes, the steering twin of `resolveInvAABB`'s clamp); linear falloff 1 at
> body contact/overlap → 0 at lookahead; dead-center-in-blocker falls back
> to the heading (the flee convention). Compose: `desired +
> repulsion × steeringRepulsionWeight` [PLACEHOLDER 1.5], normalized;
> forward component ≤ 0 (head-on cancel/backward) → deflect along the
> perpendicular component (leans to the freer side = tick-stable), exactly
> on the line → always left (`Rot90`), deterministic. Emergent, by design:
> a target INSIDE a blocker makes the mob orbit it ("holds nearby rather
> than jitters", §3.4); a perpendicular flee into the wall slides along it;
> the corner-pinned flee escapes along an edge (the chunk-2 clamp pins are
> now the NIL-space fallback pins — comment updated on
> `TestMob_FleePinnedInBoundaryCornerConverges`, behavior unchanged there).
> **Pins (`steering_test.go`, all through the real `Space.Update()`):**
> `TestMob_SteersAroundBlockerReachesTarget`, `TestMob_NoBlockersPath
> Unchanged` (bit-identical step with an empty space),
> `TestMob_HeadOnBlockerDeflectsConsistently` (side never flips),
> `TestMob_SpawnedOverlappingBlockerEscapes`,
> `TestMob_TargetInsideBlockerHoldsWithoutJitter` (distance band + keeps
> moving + no teleport steps), `TestMob_FleeSteersAroundBlocker`,
> `TestMob_FleePerpendicularIntoWallSlidesAlongIt`,
> `TestMob_FleeIntoCornerEscapesAlongEdge`. All verified red at the exact
> jam points pre-implementation. Perf note: one statics query per moving
> mob per tick (idle mobs never query); fine at proving-grounds scale
> (~360 mobs, most idle), revisit only if profiling says so.
> **In-game checklist (PASSED 2026-07-11, second round):** proving-grounds (`-zone
> proving-grounds`): (1) Grove steering corridor — aggro a cat through the
> parallel tree rows, it threads the corridor instead of grinding on
> trunks; (2) stand dead behind a tree/rock — the chaser rounds it (no
> jamming, no side flip-flop); (3) rabbit fleeing through the Grove
> deflects around trees; (4) flee/chase along the map edge slides smoothly;
> (5) AngryMammoth still walks straight THROUGH the Henge rocks (mask
> exemption) but respects the border; (6) walk-home after a leash rounds
> props on the way back.

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

> **STATUS: DONE — VERIFIED IN-GAME 2026-07-11 ("everything works as
> described"), followed same day by the PACING REWORK below (user findings
> from the verification round; full backend suite green 21 pkgs, binary
> rebuilt, tsc + webpack green, red-first; zero wire changes; pacing rework
> RE-VERIFIED IN-GAME same day — "pacing feels right now"; committed).**
>
> **Pacing rework (2026-07-11, user findings at verification):** (1) full-
> speed patrol + 0.5×/1–4 s wander read as frantic — wanted: "relaxed,
> regular living". Fix: ONE idle pace for wander legs AND patrol marching,
> slower defaults. (2) pace must be tunable per mob TYPE and per SPAWN.
> (3) ping-pong-only killed the circle-a-landmark case — loop traversal
> returned as a per-spawn mode. Confirmed by user: evade return + walk-home
> stay FULL speed (the mob visibly runs back, then drops into the amble);
> starting numbers as proposed. **Knobs:** mob-def `factors` gained
> `idleSpeedFactor` ((0,1], absent → 0.4 [PLACEHOLDER]),
> `idleDwellMin/MaxTicks` (wander stand band, absent → 90–300 ≈ 3–10 s
> [PLACEHOLDER]) and `wanderRadius` (TYPE-default archetype — applied by
> the spawn-point system only, summons unaffected; speed-0 type with a
> default radius fails at registry load). **Dodo grazes by default:
> wanderRadius 2.5, idleSpeedFactor 0.25, dwell 240–900 (8–30 s), all
> [PLACEHOLDER]** — every proving-grounds Dodo wanders with no zone edits.
> **Spawn overrides:** `wanderRadius` is now TRI-STATE (*float32: absent =
> inherit type default, explicit 0 = stationary — the roadmap's
> bridge-guard case —, >0 = override; explicit >0 + waypoints still
> hard-fails), `idleSpeedFactor` per spawn ((0,1]), `patrolMode:
> "pingpong"(default)|"loop"` (loop wraps last→first; mode without
> waypoints hard-fails). `Spawn.EffectiveWanderRadius()` resolves the
> tri-state; `SetWaypoints(points, loop)` + `SetIdleSpeedFactor` are the
> mob seams; `rollDwell` reads the def band. Editor: wander input is
> tri-state (empty = inherit — inherited discs render fainter), idle-speed
> input, traversal select on the selected spawn, loop routes close the
> polygon; serializer exports explicit 0 but omits inherited/default
> values. Content: Henge route flipped to `patrolMode: "loop"` (the
> circling example). New pins: `definitions_test.go` idle-field
> parse/defaults/6 hard-fails; `zone_test.go` tri-state + idleSpeedFactor
> bounds + patrolMode hard-fails; `patrol_test.go` patrol-at-idle-speed,
> def pace, spawn override, dwell band, loop wrap (c→a without revisiting
> b), evade-return-at-full-speed; `sys/mob_test.go` type-default wander
> through the system + explicit-0 override.
>
> **Plan-first decisions (user, 2026-07-11):** (1) **⚑ §6.6 waypoint schema =
> inline per-spawn list** (`waypoints: [{x,y},…]` on the spawn; no shared
> routes — KISS). (2) **Traversal = ping-pong only** (A→B→C→B→A; a closed
> loop is authored as a polygon with the last point near the first).
> (3) **WoW-classic evade behavior (user amendment, replaced the plain
> sensor question):** a mob leaving idle for combat records its position
> (`Mob.returnPos`); after the combat reset it walks back to that exact
> point FIRST, then resumes its archetype — next waypoint (index kept),
> fresh wander pick, or stand-at-spawn. Re-aggro during the return walk
> does NOT overwrite the point, so the mob always resumes from where it
> left its route. This uniformly replaced walk-home-to-spawn for ALL mobs
> (a classic mob's recorded point IS its spawn spot — behavior unchanged);
> implied by the same decision: **the aggro sensor now follows the body**
> (`SetPosition` moves `aggroAura` every call, not just the latching first
> one) — acquisition is mob-centered like the chunk-3 `targetWithinSensor`
> leash check already was; a patroller aggros whatever it walks past.
> (4) **Wander pacing = walk–pause at reduced speed** — amble at
> `wanderSpeedFactor` [PLACEHOLDER 0.5×] with dwells of 30–120 ticks
> [PLACEHOLDER] between legs (chase speed stays a readable aggro signal).
>
> **Mechanics (`model/mob/patrol.go`):** `SetWander(anchor, radius)` /
> `SetWaypoints(points)` are called by `MobSystem.spawnAt` AFTER `NewMob` —
> the wander anchor is the AUTHORED point, never the rolled respawn
> position (gotchas #5/#7; `spawnPosition` still latches on first
> `SetPosition` and stays the stationary fallback home). Update's idle
> branch became `updateIdleMovement()`: finish the evade return first, then
> waypoints → wander → `moveTowards(spawnPosition)`. Wander picks a uniform
> point in the anchor disc from the mob's entity-ID-seeded RNG and budgets
> the leg at 2× straight-line ticks + slack — a point rolled against a
> blocker (steering orbit) expires into a normal dwell + re-roll. Route
> patrol marches at full speed and advances the ping-pong index inside
> `waypointArrivalRadius` [PLACEHOLDER 0.3] (exact-point arrival could
> orbit when steering deflects the last step; route validity stays the
> level designer's responsibility). All movement rides
> `moveTowards`/`moveTowardsScaled` (new speed-scale variant, scale 1 ==
> bit-identical to the old path), so chunk-4 steering and slows apply for
> free. **Schema (`world/zone.go`):** `Spawn.WanderRadius` +
> `Spawn.Waypoints []Waypoint{x,y}`, absent = stationary (gotcha #8,
> backward-compatible zeros); hard-fails: negative radius, both set,
> single-waypoint route, wander/waypoints on a speed-0 mob (checked in
> `resolve()` where Def is bound). **Respawn:** a wander point rolls the
> (re)spawn position uniformly within its radius (`randomInDisc`, system
> RNG); waypoint + stationary spawns keep the exact authored spot.
> **Editor (chunk-5 UX for ⚑ §6.6):** spawn controls gained a wander-radius
> input (disc preview on the marker); with a spawn selected, an
> **"Add on map click" waypoint toggle** appends route points per map
> click (+ Remove last / Clear buttons; numbered dots + polyline from the
> spawn marker); serializer omits zero/empty fields so pre-chunk-5 zones
> round-trip diff-clean; the mutual-exclusion rule is enforced in-panel
> before the backend loader would hard-fail at boot.
> **Content [PLACEHOLDER] — on proving-grounds (same-day zone consolidation,
> user call: scaffold.json + zone.json DELETED, proving-grounds is the one
> canonical debug/test map, `conf.default.json game.zone=proving-grounds`):**
> 21 archetype spawns (360 → 381). Wanderers: 4 hub Rabbits r3 (flee+wander),
> 5 Sand-Flats Dodos r3, 2 Stone-Fields Mammoths r5, 1 Grove cat r4 (disc
> contains trees — wander × steering), 2 Marsh Dodos r3. Patrol routes (all
> ping-pong): hub square loop (±5.5), Grove steering-corridor lane
> (26,19.6)↔(44,19.6), North Tree Line front→gap→back
> (−26,28.5)→(−10,28.5)→(−8,33.5)→(4,33.2), Henge polygon loop
> (−40,15)→(−22,15)→(−22,−1)→(−40,−1)→(−40,13), long east-trail route
> (9,1)→(19.1,−0.2)→(30.9,3)→(42,−2), Ember Ring arc
> (−46,−15.5)→(−36.7,−17)→(−31,−26), slow Marsh Mammoth
> (−4,−24)→(4,−28)→(10.2,−23.5). Every WAYPOINT clearance-checked ≥ 0.35
> against blocking props (a blocked waypoint = eternal orbit outside the
> 0.3 arrival band); mid-SEGMENT blockers deliberately left in — they
> exercise chunk-4 steering en route.
> **Pins:** `world/zone_test.go` (parse + all 4 hard-fails + nested
> unknown-key), `model/mob/patrol_test.go` (wander stays in radius /
> anchors on the given anchor not the rolled spot / dwells + reduced
> speed; ping-pong traversal order; patrol full speed; evade return →
> resumes route toward the KEPT waypoint; re-aggro keeps the original
> return point; classic-mob walk-home unchanged; sensor follows body),
> `sys/mob_test.go` (respawn-roll within band + varied, wanderer anchored
> on authored point through the system, route spawn patrols; the
> spawn-tick assertion allows one step — spawnAt + first mob Update run in
> the same system tick).
> **In-game checklist (proving-grounds — the default zone, no flag
> needed):** (1) hub Rabbits amble-pause within ~3u of their markers,
> visibly slower than flee speed; (2) hub sentry cat marches its ±5.5
> square and reverses along it (ping-pong on a closed polygon); (3) aggro
> the sentry, kite it off the square, break aggro (outrun ~3 s, or die) —
> it runs back to the exact point it left the route and resumes toward the
> SAME next corner; (4) Grove corridor cat threads the 3.2u lane both ways
> without jamming (patrol × steering); (5) Tree Line cat walks the wall
> front, turns through the gap, patrols the back — reversing cleanly at
> both route ends; (6) Henge cat loops the rock ring, steering around
> stray Stone-Fields rocks mid-segment; (7) east-trail cat covers the long
> hub→Sand-Flats route; aggroing it far out and losing it shows the long
> evade run home; (8) Sand-Flats wander-Dodos respawn at VARYING spots
> inside their discs (kill one repeatedly); (9) a wandering Rabbit hit to
> below half HP flees, then evade-returns to its aggro point and resumes
> wandering; (10) Marsh Mammoth plods its 3-point route (slow-mob patrol);
> (11) editor: select a route spawn → numbered polyline renders; wander
> spawns show discs; add/remove/clear waypoints works; Download and diff —
> untouched spawns byte-identical, no `wanderRadius: 0`/`waypoints: []`
> noise.

- **5a — local wander:** `wanderRadius` on `world.Spawn` + zone loader
  validation; idle wander behavior anchored on the authored point; respawn
  position rolled within the radius; editor control + marker preview;
  proving-grounds zone exercises it.
- **5b — route patrol:** `waypoints` on the spawn (⚑ §6.6 schema shape);
  patrol movement (loop/ping-pong ⚑); editor waypoint authoring; route
  validity stays a level-design responsibility (decided).
- **Tests:** archetype resolution + validation hard-fails; wander stays
  within radius; respawn-within-band; waypoint traversal order; leash/
  aggro interplay (patroller aggros mid-route, fights, returns to route).
- **Gotchas:** #5, #7, #8.

### Chunk 6 — Companion cooldown (backend + wire + content)

> **STATUS: DONE — VERIFIED IN-GAME 2026-07-11 ("everything works"; full
> backend suite green 21 pkgs, binary rebuilt, tsc + webpack green,
> red-first; zero wire-field changes — only the EntityType enum append;
> committed same day).**
>
> **Plan-first decisions (user, 2026-07-11 — ⚑ §6.4 closed):**
> (1) **Lifetime = TTL, totem-style** (~60 s [PLACEHOLDER], scaling with the
> summon-skill level; cooldown ≥ TTL). (2) **Catch-up = teleport beyond a
> threshold** (~15 u [PLACEHOLDER]; hold ring ~1.5 u) — the sanctioned
> exception to gotcha #6; steering only handles convex blockers, a wall could
> otherwise strand the companion for its whole TTL. (3) **Max-one = TTL ≤
> cooldown content convention ONLY, and deliberately unenforced: if cooldown
> reduction ever beats the TTL, multiple simultaneous companions are the
> REWARD for that interaction** — no code cap, no owner→summon back-reference.
> (4) **New `Companion` EntityType** (ordinal 19, appended to `server.fbs`,
> Go + TS regen) with placeholder wolf-pup SVG. Leans recorded at plan-first:
> follower = **owned + moving** (`owner != nil && velocity > 0`, no schema
> flag — YAGNI; the totem is speed 0, zone mobs have no owner); **defend
> beats assist** at acquisition; the combat tether measures from the OWNER
> (~10 u [PLACEHOLDER]); followers skip `returnPos` entirely (the chunk-5
> handoff trap — follow IS their return behavior); a follower does NOT
> retaliate for hits on itself (§3.6 is owner-centric; calibration point for
> the in-game check).
>
> **Mechanics:** the §3.6 "owner attacked X" signal became **owner combat
> stamps** — both acquisition conditions are O(1) reads off the owner, no
> sensor/mask changes: `Mob.PlayerTouches` stamps the toucher via optional
> `model.AttackNotifier` on hits with `Damage.Source == nil` (direct casts
> only — summon damage replaying through the owner never counts as "the owner
> attacked"), and `player.MobTouches` stamps the attacker; both age out over
> `combatSignalWindowTicks` [PLACEHOLDER 90 ≈ 3 s] in `ResetTickNumbers`,
> read via optional `model.CombatSignals` (nil when expired or dead).
> **`model/mob/companion.go`** (mirrors patrol.go): `updateIdleMovement` got
> a follower branch FIRST — `updateFollow()` walks at FULL speed toward the
> nearest point on the follow ring (never the idle amble; the arrival clamp
> stops ON the ring, not under the owner), snaps to that ring point beyond
> the teleport threshold, stands inside the ring or when the owner is
> dead/absent (TTL cleans up). `updateAggro` got a follower branch replacing
> sensor acquisition, threat retention AND the leash:
> `updateCompanionTargeting()` holds the sticky target while it lives inside
> the owner tether, else acquires from the stamps (defend first), tether- and
> faction-gated. `setAggroTarget`/`resetAggro` keep driving the chunk-3c aura
> gate, so the ring shows in combat and hides on follow for free; hits on the
> companion still build ITS threat on the attacker's table unchanged (mobs
> turn on it), the companion just never reads its own. `noteCombatEntry`
> skips followers. **Spawn side was free:** `spawnSummon` already handles
> owner/faction/TTL/loadout-level/power/offset placement; owner XP + summon
> threat attribution ride the chunk-1/3 `Owned` path (gotcha #9).
> **Content [ALL PLACEHOLDER]:** `api/mobs/companion.json` (id 7, maxHealth
> 60, speed 1.2 → 0.066/tick, deliberately above the player's 0.05; layer
> 160 = Viewport|Player — the player-layer trick —, mask 17 =
> PlayerStatic|Border so it collides like its owner; aggroRadius 0.1 dummy —
> sensor bypassed); `api/skills/mobs/companion-aura.json` (id 107, physical
> damage aura, nearest-1, 5+1/lvl, interval 20, r 0.8);
> `api/skills/summon-companion.json` (id 24, spawn, ttl 1800+300/lvl ≤
> cooldown 2400 — L3 TTL exactly equals the cooldown —, maxHealthPerOwnerLevel
> 2, powerPerOwnerLevel 0.05); milestone **level 7**. Count pins now **21
> skills** (registry_test + boot log `count=21`), 8 milestones, 7 mobs
> (boot-log line only). **Frontend:** the known path (Companion class, BOTH
> `Game.ts` layer steps, `gameObjectClasses[19]`, `Graphics.ts` entry,
> `companion.svg`, `Skills.ts` id 24 ringless cooldown).
> **Pins:** `companion_test.go` (follows at full speed / holds + converges on
> the ring / teleports when hopelessly far / stands with dead owner; acquires
> on owner-attacked + on-attacker-of-owner / defend-beats-assist / no signals
> = pure follow + aura stays gated / dead- and beyond-tether stamps ignored;
> sticky ignores new stamps / drops on death + beyond-tether → aura gates
> off / own threat table never acquires; skips evade return; PlayerTouches
> stamps direct hits only), `player_test.go` (stamp + window expiry /
> re-stamp refresh / dead reads nil / MobTouches stamps attacker),
> `skills_behavior_test.go` `TestCooldown_SpawnMovingSummonFollowsOwner`
> (spawn → follower through the system).
> **In-game checklist:** (1) `XP` to level 7 (or `SKILL SummonCompanion`),
> equip, fire → wolf pup appears OFFSET beside you and trails you at ~1.5 u
> at full speed (no amble); (2) walk far/behind props — it steers around
> blockers; sprint-cheese it hopelessly far (>15 u) → it snaps beside you;
> (3) attack a Dodo → the companion runs in and bites it (assist), its aura
> ring shows only while fighting; (4) let a mob hit YOU while the companion
> is free → it intercepts (defend); (5) mid-fight, attack a second mob — the
> companion stays on its first target until that dies, then takes the next
> signal or resumes follow; (6) kite a fight >10 u away from yourself → the
> companion abandons the chase and returns; (7) kill via companion only →
> YOU get the XP; a boss aura can kill the companion (it builds threat);
> (8) it expires after ~60–80 s and stays gone; recast only after the
> cooldown (~80 s).**

> **Handoff from chunk 5 (2026-07-11) — read before the plan-first start:**
> - **Idle-movement seam layout:** `Mob.updateIdleMovement()`
>   (`model/mob/patrol.go`) is the no-aggro dispatch — evade return first,
>   then waypoints → wander → walk-home-to-spawn. **Companion FOLLOW is a
>   new branch there** (likely checked before/instead of the others for
>   owned mobs). `moveTowardsScaled(target, speedScale)` exists for pace
>   control; steering + slows apply to all movement automatically
>   (`spawnSummon` already passes `s.space` since chunk 4).
> - **Evade-return trap for followers:** `setAggroTarget` →
>   `noteCombatEntry` records `Mob.returnPos` on EVERY idle→combat
>   transition, and `updateIdleMovement` walks back there before resuming.
>   A companion that assists in a fight would "evade-return" to where the
>   fight started instead of resuming follow — decide at plan-first:
>   owned/following mobs probably skip returnPos entirely (follow IS their
>   return behavior).
> - **Idle pacing is for world mobs:** `idleSpeedFactor` (def default 0.4×
>   [PLACEHOLDER]) scales wander/patrol ambling; a FOLLOWING companion must
>   keep up with the owner (player 0.05/tick > every current mob speed) —
>   follow speed is its own decision, not the idle amble.
> - **Aggro sensor:** follows the body since chunk 5 (mob-centered
>   acquisition), BUT `NewMob` hardcodes the sensor mask to the PLAYER
>   layer — an ALIGNED companion's sensor would see players/summons, not
>   hostile mobs. §3.6's assist/defend rules are event-shaped ("owner
>   attacked X" / "X attacks owner"), so the companion likely bypasses
>   `findAggroTarget` entirely; don't assume the sensor works for it.
> - **Type-default wander (`factors.wanderRadius`) is applied only by
>   `MobSystem.spawnAt`** — `spawnSummon` never applies it, so summons
>   can't accidentally graze; the companion mob JSON should still leave the
>   idle fields unset.
> - **Count pins:** 19 skills (registry_test + boot log `count=19`) — the
>   companion-summon cooldown bumps them; mob registry is 6 (boot-log line
>   only, no hard pin). New-mob path incl. the two-step `Game.ts` layer
>   trap: `manual-content-authoring.md`.
> - Gotchas #2 (EntityType regen FIRST — `mob.NewMob` fatals on an unknown
>   name), #9 (threat credits the summon, XP the owner — wired since chunk
>   3; the companion inherits it via the `Owned` path) and #11 stay
>   binding.

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

### Chunk 6.5 — Hazard braziers + companion reachability (fix chunk)

> **STATUS: DONE — VERIFIED IN-GAME 2026-07-11 ("everything works"; full
> backend suite green 21 pkgs, binary rebuilt, tsc + webpack green,
> red-first; zero wire-FIELD changes — only the EntityType enum append;
> committed same day).**
>
> **Origin (user report, screenshot session 2026-07-11):** at the Ember
> Ring, (1) the boss burned the hostile "brazier" totems (which never hit
> him back), and (2) the companion acquired a brazier that damaged its
> owner, could not scratch it, and died in its aura. Root cause of both:
> the braziers were **world-spawned instances of the player-summon totem
> def**, whose player-layer body (the layer trick, correct for the ALIGNED
> summon) breaks the faction≈layer assumption in both directions — the
> hostile boss's enemy mask (player layer) sees the hostile brazier
> (`applyMobDamageAura` is deliberately mask-only), while the aligned
> companion's/players' enemy mask (action layer) never does. Exactly the
> scenario the NOTE in `model/auramask.go` predicted.
>
> **Decisions (user):** (1) braziers = **unkillable pure hazards** — not
> combatants; (2) companion **refuses aura-unreachable targets**;
> (3) the mob-path faction gate is **deferred into the mob-factions chunk
> (6.6)** — after this fix no same-faction friendly-fire path exists, and
> the factions rework must rebuild eligibility anyway.
>
> **Mechanics:** new **`Brazier` EntityType (ordinal 20**, appended to
> `server.fbs`, Go + TS regen) + `api/mobs/brazier.json` (id 8, hostile,
> speed 0, TotemAura L1; the key line is **`collisionLayer 32` = Viewport
> ONLY** — no damage mask in the game includes that layer, so its body is
> structurally unkillable and interaction-free with zero special-case
> code, while its own aura still burns the player layer since aura masks
> derive from the caster's FACTION, not its body layer; mask 16 = Border).
> Proving-grounds: the 2 Ember Ring Totem spawns → Brazier (the totem def
> itself is untouched — the player summon keeps its layer trick).
> Companion: **`Mob.auraCanReach(t)`** in `updateCompanionTargeting`
> acquisition — the prospective aura mask (**slot 0 + own faction**, NOT
> the stored sensor mask, which is stale/hostile-derived while the aura is
> gated) must intersect the target's `Bodies()[0]` layer; only PROVEN
> unreachability rejects (no body / no aura → acquire as before). Frontend:
> the known 5-file path (`Mobs.Brazier`, BOTH `Game.ts` layer steps,
> `gameObjectClasses[20]`, `Graphics.ts`, stone-fire-bowl `brazier.svg` —
> deliberately not the totem face). **Count pins:** mobs 7 → 8 (boot-log
> line only); skills/milestones unchanged (TotemAura reused).
> **Pins:** `companion_test.go` `TestMob_FollowerIgnoresAuraUnreachableTarget`
> (verified red pre-implementation) + `_FollowerAcquiresAuraReachableBodiedTarget`
> (control; existing stamp fakes are bodiless and keep passing —
> conservative gate).
> **In-game checklist:** (1) Ember Ring braziers render as stone fire
> bowls and still burn you (fire dot numbers); (2) the boss shows NO
> damage stream on them and they never show damage numbers at all;
> (3) stand in a brazier's aura with a companion out → it keeps following,
> never engages, ring stays hidden; (4) control: companion still
> assists/defends against normal mobs; (5) your own summoned totem is
> unchanged (boss can still kill it, HealAura still reaches it).

### Chunk 6.6 — Mob factions & mob-vs-mob hostility — DONE + FULLY VERIFIED IN-GAME 2026-07-11 (incl. the same-day HARM-GATE fix)

> **Status: DONE. Round-1 verification 2026-07-11 ("works as described")
> surfaced TWO findings — one shared root cause, FIXED same day red-first
> (fix record below); fix RE-VERIFIED in-game same day: "honestly, its
> perfect. groups fighting each other, killing each other, following me,
> getting distracted … feels very organic. all tests passed." Full suite
> green (22 pkgs — the new `factions` package is the 22nd), binary
> rebuilt, tsc + webpack green; zero wire changes, zero frontend code
> changes (frontend rebuilt only for the zone/mob JSON bundle).**
>
> **In-game findings (user, 2026-07-11) + the HARM-GATE fix:**
> - **Finding 1:** a tusker Mammoth chasing the player walked through a
>   prey Dodo — its aura splashed it ("different faction = may harm"), the
>   dodo's retaliation threat locked two NEUTRAL factions into a fight to
>   the death neither could have started, both ignoring the player.
> - **Finding 2:** the braziers (default `hostile` faction) legally dotted
>   passing `predator` cats (different faction); the cats retaliated
>   against a Viewport-only body no damage mask reaches — world mobs have
>   no `auraCanReach` gate — and suicided in the burn.
> - **Fix (user: "can't aggro → can't damage"; upgraded to a central seam
>   after the scalability discussion): two-layer harm rule for mob
>   casters.** `mayHarm(A,B) = B.faction ∈ A.aggroSet (STATIC layer) ∪
>   A.hasThreat(B) (DYNAMIC layer)`. Retaliation keeps working (whoever
>   hurt me is on my threat table — passive prey still bites back at cats
>   and players); taunt (chunk 7) gets harm rights for free (taunt =
>   threat credit); encounter scripts (chunk 9) ride the dynamic layer
>   with zero config. Mammoth-vs-dodo can never START (neither lands the
>   first hit); cats are never burned by the brazier (not in its {aligned}
>   set, can never reach its threat table) → no threat → no suicide.
>   Bonus semantic (pinned): a passive-faction mob no longer splashes
>   BYSTANDER players it is not fighting. Players + owned summons
>   unchanged (summons' all-others aggro set makes the gate a no-op).
> - **Fix mechanics:** `model.HostilityGate` (`MayHarm(faction, id)`)
>   implemented by `Mob` (`aggroMask ∪ HasThreat`); **ONE sys seam
>   `mayHarm(caster, target)`**, consulted by `eligibleByTargetFlags`
>   (now takes the ACTING entity instead of a faction —
>   `applyPlayerDamageAura` derives it: the summon on owned casts, the
>   player on direct ones) and by `applyMobDamageAura`'s bespoke
>   predicate. Damage aura, dot aura, instant damage/dot and resist aura
>   all route through it. **RULE: every NEW harmful effect type's enemy
>   eligibility MUST go through `eligibleByTargetFlags`/`mayHarm`** — a
>   per-site copy is how the gate gets forgotten (the AuraMaskFor
>   resist-gap lesson). `applySlowAura` carries a NOTE: it has NO faction
>   eligibility at all (pre-6.6 gap, harmless while no mob slow exists and
>   players cannot be slowed) — route through the seam when one ships.
> - **Fix pins (red-first):** `TestMob_MayHarm_DeclaredHostilityOrCombatLink`
>   (set / neutral / bystander / threat-link); sys
>   `TestApplyMobDamageAura_NeutralFactionNeverSplashed` (finding-1 repro,
>   verified red), `_ThreatTableAttackerIsFairGame` (retaliation through
>   real mobs), `TestApplyDotEffect_MobCasterRespectsHostility` (finding-2
>   repro, verified red; the player still burns).
> - **Scalability record (user discussion 2026-07-11, "will this bite
>   us?"):** hostileTo is the sparse row-wise encoding of a full stance
>   matrix — cross-faction alliances later = additive `friendlyTo` key, no
>   migration. Known deferred friction: **62-faction bitmask cap**
>   (internal only — content authors names; widening touches ~3 places),
>   **global faction namespace** (content pass adopts naming discipline,
>   e.g. `z1-farmers`), **social aggro** (guards assisting faction-mates =
>   an acquisition-side dynamic-layer source, its own chunk someday), a
>   **`THREAT <mob>` debug cheat** once fights get complex (chunk 7 wants
>   it for taunt tuning anyway), and chunk 7's anti-taunt semantics should
>   be decided knowing a full threat wipe also drops dynamic harm rights.
>
> Target design (user, verbatim intent): *mobs can be hostile towards each
> other — a wolf starts chasing a rabbit when they enter each other's aggro
> range; the rabbit flees (slowly) as it would from a player; actual
> frontlines of battle where two factions of mobs spawn or patrol and start
> attacking each other, one of which might also attack the player; the same
> aggro rules apply between mobs.*
>
> **Decisions (user, plan-first 2026-07-11):**
> - **Hostility model = per-faction hostility list** (not a flat
>   different-=-hostile rule, not a stance matrix): each declared faction
>   lists the factions it PROACTIVELY aggros (`hostileTo`, asymmetry legal —
>   the wolf hunts the rabbit, the rabbit only retaliates). The list gates
>   acquisition; **AMENDED by the in-game harm-gate fix (same day, see
>   above):** mob-cast damage eligibility is now the two-layer rule
>   (aggro set ∪ threat table) instead of "different faction = may harm" —
>   a passive faction still fights back / flees per its own rules when hit
>   (the attacker is on its threat table), exactly "the same aggro rules
>   as vs players", but neutral factions can no longer splash each other.
> - **Authoring = mob-def level only** (`"faction": "<name>"` top-level key;
>   no per-spawn override — a frontline fields two different species).
> - **Masks: ALL faction-flag masks widen** to both combatant layers
>   (`model.LayerCombatants` = Player|Action); `factionLayers` + the
>   auramask NOTE are deleted — eligibility does the exact faction check
>   everywhere. Free fix: a player's ally auras (FireWard resist) finally
>   reach their own companion (action-layer body; pinned).
> - **Kill rewards trigger on ANY death**: `MobTouches` now calls
>   `tryGrantKillRewards` like `PlayerTouches` — recorded player
>   participants get full XP/drops when a frontline mob lands the killing
>   blow. A pure mob-vs-mob kill settles the death with zero participants,
>   which also CLOSED A LATENT LEAK: before, a player poking a mob-killed
>   corpse collected full XP (the death was never settled; pinned).
> - **Default rule (deliberate deviation from "hostile to all others"):**
>   a def without `faction`/a faction without relevance = built-in
>   `hostile` faction with aggro set **{aligned} ONLY** — the pre-factions
>   behavior verbatim (attack players, proactively ignore every mob), so
>   declaring new factions never silently changes legacy mobs, and
>   mob-vs-mob hunting is always an explicit `hostileTo` entry.
>
> **Mechanics:** new **`pkg/berryhunter/factions`** registry (mirrors
> props/recipes): `api/factions/*.json`, one file per faction
> (`{name, hostileTo:[...]}`, `_comment` tolerated, otherwise
> DisallowUnknownFields); reserved undeclarable built-ins **`aligned` (ID 0)
> + `hostile` (ID 1)** (both referenceable in hostileTo); declared factions
> get IDs 2+ in sorted-name order (deterministic); hard-fails: missing
> hostileTo (`[]` = explicitly passive), dup/empty/reserved name,
> unknown/self reference, >62 declared (uint64 bitmask cap). The numeric
> `factions.Faction` mirrors `model.Faction` (model imports items/mobs
> imports factions — the boot seam converts, like world's EntityType).
> Factions load BEFORE mobs; `mobs.RegistryFromFS(r, sr, fr, fsys)` +
> `mapToMobDefinition` resolve the def's faction name (absent → hostile
> default; `"aligned"` hard-fails — summon-only via SetFaction; dead
> `RegistryFromPaths` deleted while touching the file).
> `MobDefinition.Faction/AggroMask` → `Mob.faction/aggroMask` (zero-value
> def = hostile default, the defaultMobMaxHealth guard pattern —
> FactionAligned is the zero value). **`findAggroTarget`** keeps the
> equality+liveness skip and adds the aggro-set gate
> (`aggroMask & target.Faction().Bit()`). **The aggro sensor mask follows
> the aggro set** (`aggroSensorMask`): aligned bit → player layer, any mob
> faction → action layer — legacy mobs keep player-only sensors (**zero new
> broadphase pairs except opted-in factions = the perf knob**), a passive
> faction's sensor sees nothing at all. `SetFaction` (summons) recomputes
> aggroMask = all-others + updates the sensor mask. `AuraMaskFor(def)` /
> `InstantDamageMask(e)` lost the faction param (masks are
> faction-independent now). **`applyMobDamageAura` gained the exact-faction
> gate** (the deferred chunk-6.5 item): Factioned targets — same faction
> rejected unless targetsAllies, different requires targetsEnemies, and the
> check runs BEFORE the target cap (a pack mate never eats the nearest-1
> slot); unfactioned structures keep riding the mask (targetsStructures).
> `noteThreat`/`MobTouches` threat crediting worked unchanged (equality
> gates); brazier/boss mutual immunity is now faction-based AND layer-based;
> `auraCanReach` still rejects Viewport-only brazier bodies after widening.
>
> **Content [ALL PLACEHOLDER]:** `api/factions/` — **`prey`** (hostileTo
> `[]`), **`predator`** (`["aligned","prey","tusker"]`), **`tusker`**
> (`["aligned","predator"]`); assignments: Rabbit + Dodo → prey,
> SaberToothCat → predator, Mammoth → tusker (AngryMammoth, Totem,
> Companion, Brazier stay default hostile/aligned). ⚠ Map-wide consequence
> (accepted): cats hunt rabbits + dodos everywhere (the "3 cats hunting 2
> Dodos" herds go live), cats and mammoths fight wherever they meet,
> dodos/rabbits stop proactively attacking players (retaliate only).
> **Frontline showcase:** 4 SaberToothCats (y 9) vs 4 Mammoths (y 13) at
> x 41.5–48.5 east of the Sand Flats (clearance-checked ≥1.0 vs blockers;
> lines 4 u apart = inside both 4-u aggro sensors → immediate engagement),
> respawnTicks 300 ±30% → perpetual staggered battle next to 3 prey Dodos.
> Proving-grounds spawns 381 → 389.
>
> **Count pins:** skills 21 / milestones 8 / mobs 8 unchanged; NEW boot-log
> line `Loaded faction definitions count=5` (3 declared + 2 built-ins);
> suite 21 → 22 packages.
>
> **Pins (red-first):** `factions/factions_test.go` (valid load + IDs
> sorted-name-deterministic + built-ins + builtin refs + all 7 hard-fails);
> `definitions_test.go` faction resolve / absent-default / explicit-hostile /
> unknown-fails / aligned-fails / no-registry-fails;
> `mob/factions_test.go` — sensor-mask-follows-aggro-set (legacy = player
> layer only / predator = both / passive = none), bare-def hostile guard,
> `_AcquiresFactionInAggroSet` (wolf-sees-rabbit, verified red — the old
> player-only sensor mask), `_IgnoresFactionOutsideAggroSet` (seen ≠
> acquired), `_PassiveFactionRetaliatesAndFleesWhenWounded` (threat
> retention + flee vs a mob attacker), `_SameFactionHitNeverBuildsThreat`,
> `_SetFactionRecomputesAggroSet`, `_MobKillingBlowGrantsRewardsToParticipants`
> (verified red) + `_PureMobKillGrantsNothingEvenWhenPokedAfter` (the leak
> pin, verified red); sys `TestApplyMobDamageAura_SameFactionNeverHitNorEatsTargetSlot`
> (verified red) + `_DifferentFactionMobIsHit` + `_UnfactionedStructureStillHit`
> + `TestApplyResistAura_ReachesAlignedMobAlly`; auramask pins rewritten to
> `LayerCombatants`; `TestDiskContent_RepoApiLoadsEndToEnd` loads factions +
> asserts the roster ships ≥1 hunter and ≥1 passive faction.
>
> **In-game checklist — round 1 PASSED 2026-07-11 ("works as described",
> two findings → harm-gate fix); fix re-verify PASSED same day:**
> 1. **Finding 1 repro:** lure a Mammoth through/past Dodos → dodos are
>    NOT damaged, no tusker-vs-prey brawl erupts; the mammoth stays on you.
> 2. **Finding 2 repro:** watch cats path near the Ember Ring braziers →
>    they never take burn damage, never engage the braziers; the braziers
>    still burn YOU.
> 3. Controls: frontline still fights (declared hostility), prey still
>    retaliates when a cat bites it (threat link), rabbit still flees,
>    your totem still burns mobs and the boss still kills it.
>
> _Original round-1 checklist (all passed): boot counts, wolf-chases-
> rabbit + retaliation/flee, perpetual frontline, no-XP-leakage +
> participant-XP-on-mob-blow, FireWard-on-companion, brazier/totem
> controls, perf feel._

### Chunk 7 — Taunt / anti-taunt effect types — DONE + VERIFIED IN-GAME 2026-07-11

> **Status: DONE + VERIFIED IN-GAME 2026-07-11 ("works as intended").**
> Full backend suite green (**22 pkgs**), binary rebuilt, tsc + webpack green,
> TDD red-first (13 new tests), **ZERO wire changes**, one frontend file
> touched (Skills.ts entries only). **Decisions (user, plan-first): (1)
> taunt = force-to-top via a new seam (not a large fixed credit); (2) NO
> separate target lock in v1 — pure threat manipulation, retention does the
> rest; (3) anti-taunt = a player "Fade" cooldown that drops the caster's
> OWN threat; (4) both delivered as cooldowns; (5) Fade = single-entry
> removal.** Accepted-as-v1 caveats: the taunted mob's AURA keeps hitting
> nearest en route (aura targeting is selector-based, not threat-based —
> converges on close); taunt/anti-taunt on a COMPANION no-ops (followers
> never read their own threat table); attribution scoped to **player casts
> only** (no summon-taunt).
>
> **Mechanics — two mob threat seams (`model/mob/mob.go`):**
> `ForceThreatToTop(source, margin)` reads the current max living threat and
> sets `source = max + margin` (strictly exceeds → wins retention's lower-ID
> tiebreak; the handoff's "exceed, don't match"); empty table → source
> becomes the sole entry at `margin`; nil/allied/dead/`margin<=0` dropped
> (the `noteThreat` gates). Because the taunter lands ON the table, the
> chunk-6.6 `MayHarm` gate (`aggroSet ∪ HasThreat`) grants the mob the right
> to hit the taunter **for free** (harm-rights record confirmed). `DropThreat(id)`
> = `delete(m.threat, id)` — retention re-picks the next-highest next tick;
> if the table empties, the current aggro target stays latched (Fade sheds
> to a tank, **no-op solo** — accepted v1); dropping the entry also drops the
> mob's dynamic harm right on that entity until it acts again (the point of
> shedding). **Effect types (`skills/definition.go`, Step-0 pattern):**
> `EffectTypeTaunt`/`EffectTypeDetaunt`, shared `ThreatParams{Margin}`
> payload (detaunt sets an empty struct, ignores Margin); allowlist =
> geometry + targetFlags (+ `threatMargin` for taunt only); validator
> hard-fails `threatMargin <= 0` (a zero margin is a silent no-op — the
> tiebreak lesson). **Apply-site (`sys/skills.go`):** new `fireCooldown`
> early-continue branch → `applyThreatEffect` — a query circle
> (`InstantDamageMask`) of enemy mobs at the caster, eligibility through
> `eligibleByTargetFlags[threatManipulable]` so the faction/`mayHarm` gate
> applies (a player caster bypasses `mayHarm` and reaches any
> different-faction mob; the player is the threat source, itself a
> `model.Combatant`), per mob calling `ForceThreatToTop`/`DropThreat`.
> `threatManipulable` = one local capability interface with both methods
> (every mob implements both). **Content [ALL PLACEHOLDER]:**
> `api/skills/taunt.json` (id 25, cooldown 300 −20/lvl, `taunt` radius 2.0,
> targetsEnemies, `threatMargin` 50, maxLevel 3) + `api/skills/fade.json`
> (id 26, cooldown 300 −20/lvl, `detaunt` radius 2.0, targetsEnemies,
> maxLevel 3); milestone **level 8** unlocks BOTH (mirrors L5 =
> ImmolationAura+Ignite); cp-defs done; `Skills.ts` id 25/26 (ringless
> cooldowns). **Count pins: skills 21→23** (`registry_test` len + boot log
> `count=23`), **milestones 8→10** (no test pins milestone count — file/boot
> only), mobs 8 unchanged. **Pins:** mob seams (`taunt_test.go`:
> exceeds-max-and-becomes-target, empty-table-seeds-margin,
> gates-allied/dead/nil, grants-harm-rights, drop-removes-entry,
> drop-sheds-to-next-highest), definition parse (Taunt/Detaunt payload,
> zero-margin-fails, threatMargin-on-detaunt-fails), sys
> (`skills_behavior_test.go`: taunt-forces-caster-to-top, taunt-skips-allied,
> fade-drops-caster-threat). **Next action: chunk 8 (support mobs), plan-first
> in a NEW session — lift `healCaster`/heal-target capability (§3.7),
> seek-wounded-ally movement, healer-mob smoke content; gotcha #12
> (no player-reward leakage).**
>
> **Original handoff from chunk 6 (2026-07-11) — kept for the rationale trail:**
> - **The threat seams built for this chunk:** `Mob.NoteThreat(source,
>   amount)` (exported in 3a explicitly for taunt) and `Mob.HasThreat(id)`.
>   There is NO exported read of the table or its top entry — "force-to-top"
>   needs either a new seam (e.g. set-to-max+delta inside the mob) or a
>   large-credit semantic. Retention picks the highest LIVING threat with
>   ties breaking toward the LOWER entity ID — a taunt that merely EQUALS
>   the top entry loses the tie unpredictably; exceed, don't match.
> - **`noteThreat` gates:** allied sources, dead sources and amounts ≤ 0 are
>   dropped. A player/ally taunting a hostile mob passes (faction differs);
>   an anti-taunt as "negative credit" does NOT work — there is no reduce
>   path at all today. Full wipe exists only as `resetAggro` (clears target
>   + WHOLE table + gates the aura off — almost certainly too blunt);
>   partial reduction/single-entry removal needs a new mob method.
> - **Chunk-6.6 addendum — threat now also carries HARM RIGHTS:** mob-cast
>   damage eligibility is `aggroSet ∪ HasThreat` (the `mayHarm` seam, §6.8
>   amendment). Taunt-as-threat-credit therefore grants the mob the right
>   to hit the taunter for free; an anti-taunt that WIPES threat also
>   drops the mob's right to harm off-set attackers until they hit again —
>   decide the wipe semantics knowing that. And if taunt ships as a new
>   effect type: route its eligibility through
>   `eligibleByTargetFlags`/`mayHarm`, never a per-site copy.
> - **Chunk-6 caveat — followers never read their own threat table:**
>   `updateAggro` branches to owner-signal targeting before retention, so
>   taunt/anti-taunt on a COMPANION no-ops by design (decide at plan-first
>   whether that's acceptable v1 — likely yes). Same for the leash: none on
>   followers. And the chunk-6 owner combat stamps are a SEPARATE system
>   from threat — taunt must operate on threat tables, not stamps.
> - **Semantic gap to settle at plan-first:** taunt changes the AGGRO target
>   (chase/movement), but mob AURA targeting is selector-based
>   (`nearest`/`lowest_health`), NOT threat-based — a taunted mob walks to
>   the taunter but its aura keeps hitting whoever is nearest en route.
>   Usually converges once it closes; decide whether v1 accepts that.
> - **New-effect-type checklist (Step-0 pattern):** payload struct +
>   per-type key allowlist + validator + dispatch case in
>   `skills/definition.go`, apply site in `sys/skills.go` — AND an
>   **`AuraMaskFor` case** if it ships as an aura (the resist-gap lesson:
>   a missing mask case = the aura sensor never sees its targets).
> - **Attribution if summons can taunt:** credit the SUMMON's threat, not
>   the owner (the `Damage.Source` precedent, gotcha #9) — or scope v1 to
>   player casts only.
> - **Count pins:** 21 skills (registry_test + boot log `count=21`), 8
>   milestones, 7 mobs — smoke content bumps them again; trap #11 stays
>   binding (pkill + `make -C backend build`, check the boot log).

- **Goal:** the parked threat-table operations become effect types.
- **Do:** payload structs per the Step-0 pattern (taunt = force-to-top /
  large threat credit; anti-taunt = threat wipe/reduction — exact semantics
  settled at chunk start against the 3a table shape); mob-skill + player-
  skill smoke content.
- **Tests:** threat-table deltas per effect; taunted mob retargets;
  eligibility/faction gates.

### Chunk 8 — Support mobs (backend + content)

> **✅ DONE + VERIFIED IN-GAME 2026-07-12 (implemented 2026-07-11; full backend suite
> green, binary rebuilt, tsc + webpack green, TDD red-first). Design pivot
> mid-chunk (user steer): the healer reacts to a wounded ally in its AGGRO
> range like a damage mob reacts to a player — NOT a separate seek system.**
> **Heal-lift (`sys/skills.go` `applyHealAura`):** the `!healCaster` early
> return is gone (mobs cast heals); target eligibility retyped
> `PlayerEntity → model.Healable` (new seam = `Combatant` + `Heal(hp) →
> healed`, implemented by player + mob; player heals `PlayerVitalSigns.Health`,
> mob heals its own `health`/`maxHealth` + records a `healReceived` accumulator
> reset in `ResetTickNumbers`); wounded = `HealthRatio() < 1`; write via
> `target.Heal()`. Heal keeps its bespoke implicit-same-faction predicate (NOT
> routed through the shared faction seam — `heal_aura` carries no
> `targetsAllies` flag). **Self-cost stays player-only** (`healCaster` gate);
> mob healers pay none in v1. **Gotcha #12:** `NoteHealedBy` fires only when
> caster AND target are players — a mob heal (even an aligned mob landing on a
> player) creates no XP entitlement; `creditHealerThreat` stays `Combatant`-
> gated (inert for mob→ally). **Seek-healer (`model/mob/healer.go` +
> `mob.go`):** a moving mob whose slot-0 aura is a heal aura (inferred via
> `firstAuraHeals`, no def flag) is a `seekHealer` — its aggro sensor mask
> widens to `LayerCombatants` (senses allies; a passive faction would else be
> blind), and `updateAggro` branches to `updateHealerTargeting` (like the
> companion branch): acquire the most-wounded same-faction ally in the sensor
> (`findWoundedAlly`, lowest ratio, 0<r<1), retain while wounded + in sensor,
> release when full/dead/out-of-range. Everything downstream is the SHARED
> aggro machinery — the heal aura gates on/off via `setAggroTarget`/
> `resetAggro` (ring shows only while healing = "off while not seeking"), the
> chase path moves it to the ally at full speed, the evade-return applies. **No
> new stamp/window machinery, no wire-visible seek state** — an earlier
> SkillSystem-stamp draft was deleted in favor of this. **Wire:** appended
> `Mob.heal_received:uint` + EntityType `Healer` (ordinal 21); Go+TS regen; the
> frontend heal-number render was already generic (`EntityManager` reads
> `entity.healReceived`), only the mob deserializer line + the count. **Content
> [ALL PLACEHOLDER]:** `api/skills/mobs/healer-aura.json` (HealerAura id 108,
> heal_aura r2.0, 6+2/lvl, `lowest_health`, interval 30, no selfDamageHP) +
> `api/mobs/healer.json` (mob id 9, EntityType Healer, faction **predator**,
> speed 0.6, aggroRadius 6, NO damage aura → never attacks/retaliates/flees —
> kill it to stop the healing); one Healer spawn at (45.5, 6.5) behind the cat
> frontline (heals wounded cats; mammoth aggro 4 < 6.5 gap = screened).
> Frontend 5-file path (Mobs.Healer / both Game.ts steps / gameObjectClasses[21]
> / Graphics.ts / green-cross healer.svg). **Count pins: skills 23→24**
> (`registry_test` len + boot `count=24`), **mobs 8→9** (boot-log line only),
> milestones 10 unchanged (the healer is not a player unlock). **Pins:**
> `model/healable.go`/player/mob `Heal` clamps+records+returns delta (both
> types); `mob_test.go` seek-healer spawns-gated-with-ally-sensor /
> acquires-wounded-ally-activates-aura-and-chases / releases-full-healed-ally /
> ignores-wounded-non-ally / non-healer-not-seek-healer; `skills_behavior_test.go`
> mob-heals-wounded-ally-resource / no-player-entitlement(#12) /
> no-heal-across-factions / skips-full-health-ally. **v1 limitation (noted):**
> the healer's `aggroTarget` is semantically a heal target (ally); it bypasses
> threat, so it won't retaliate or flee when attacked — it stands and heals
> until it dies. **Next action: chunk 9 (encounter-controller spine), plan-
> first in a NEW session — sub-chunked 9a–9f; consumes the chunk-3 threat table
> + chunk-1 spawn machinery.**

- **Goal:** a healer mob keeps its pack alive; a buffer mob's ward is
  visible on allies.
- **Do:** lift `healCaster` + heal-target capability (§3.7); seek-wounded-
  ally movement; smoke content (healer mob + pack in the proving-grounds zone).
- **Tests:** mob-cast heal aura heals a wounded allied mob (resource, not
  player vitals); no player-reward leakage (#12); healer steers to the
  wounded ally; faction gates hold (no healing players by accident).
- **Gotchas:** #12.

### Chunk 9 — Encounter-controller spine (backend), sub-chunked (user call: break it down)

> **✅ DONE + VERIFIED IN-GAME 2026-07-12 ("all ingame checks verified and
> working as expected" — full checklist passed; full backend suite green —
> 23 pkgs, the new `encounter` package is the 23rd —, binary rebuilt,
> boot-log verified, TDD red-first; ZERO wire changes, zero frontend code;
> no autonomous commit). Authoring guide written same day:
> `manual-content-authoring.md` §5 (scripted encounter / boss fight).** **Decisions (user, plan-first):
> (1) ⚑ §6.5 RESOLVED — 9f (timed world-state + dwell-capture) slides to the
> content pass with the real lava-bridge boss (the only two pieces with wire
> footprint, no smoke-test value); (2) all of 9a–9e in ONE session (chunk-3
> precedent); (3) encounters bind Go-side only — NO zone-schema field until
> the content pass needs designer-authored bindings; (4) the `THREAT` debug
> cheat (wanted since 6.6/7) shipped with the chunk.**
> **9a spine — new `pkg/berryhunter/encounter`** (statuseffects precedent):
> `Encounter` interface with v1 hooks **`OnTick(s *System)` +
> `OnMobDeath(s *System, mobID)` only** (proximity later = OnTick queries);
> `encounter.System` (priority **15**, directly after MobSystem 20) tracks
> every live mob via a new `addMobEntity` case in `core/game.go` and derives
> the death signal from the existing removal fan-out — **`Remove(basic)` for a
> tracked mob ID IS a mob death** (mobs are only removed dead, incl. TTL; no
> new seam on Mob/MobSystem, no event bus). Deaths are queued in `Remove` and
> drained at the top of `Update` (Remove fires mid-MobSystem-iteration), so
> hooks get ONE well-defined execution point: deaths first, then `OnTick`
> sees post-death state, same tick as the MobSystem detected them.
> Registration: encounters can't ride `cfg.GameConfig` (`model → cfg` import
> direction) → exported `game.RegisterEncounter` behind `encounter.Registrar`,
> type-asserted in `berryhunterd.go` post-construction (the prop-placement
> precedent), gated on `zone.ID == "proving-grounds"` + a boot-log line.
> **The System itself is the hook parameter** — its exported surface
> (`Ticks()`, `SpawnMob`) is the capability API (no context struct, YAGNI).
> **9b immunity — `Mob.SetInvulnerable(on)` / `Invulnerable()`:** one gate at
> the TOP of `takeDamage` returning 0 → an immune hit is a non-event exactly
> like a fully-resisted tag (no HP loss, no floating number, no `tookDamage`
> combat signal, no status-effect flash, no threat — threat = the returned
> post-mitigation loss —, no kill settle; dots/instants funnel through the
> same choke point). **Accepted v1 leaks (documented at the gate):** the sys
> aura-hit VFX still stamps (a hit ring with NO number reads as "immune"
> feedback), `noteParticipant` runs before the gate (hitters of an immune
> boss stay XP participants), and zero threat accrues while immune →
> post-lift targeting starts at sensor acquisition (fine for smoke; revisit
> for the real boss). **9c scripted spawns — `System.SpawnMob(defName, pos)`:**
> mirrors `spawnSummon` minus the summon-only parts (no owner/TTL/faction
> flip/loadout raise): registry lookup → `mob.NewMob` → ONE `SetPosition`
> (gotcha #5) → `game.AddEntity`; returns the `*mob.Mob` handle (the concrete
> type carries the script seams). No spawn point ⇒ dies permanently (already
> pinned); AddEntity routes back into the System ⇒ encounter spawns are
> auto-tracked for death dispatch. **9e scripted flee —
> `Mob.SetFleeOverride(on)`:** `shouldFlee()` returns true regardless of
> health while set, AND the leash in-combat check gains `|| m.fleeOverride`
> — without that, a scripted flee outruns sensor+aura, the ~90-tick countdown
> expires and `resetAggro` WIPES the threat table (the roadmap requires threat
> retained throughout). Re-engage costs zero code: retention re-targets the
> highest living threat the tick the override drops. Accepted edge: all
> threat holders die mid-flee → reset → idle (correct). **9d smoke encounter —
> `encounter/smoke.go` (THROWAWAY proving-grounds content):** plain Go state
> in the struct, no timer/objective framework (YAGNI — extract helpers when
> the real boss is authored). Script: ProvingBoss at **(53, −22)**
> [PLACEHOLDER] (low-traffic ESE pocket; far from the cat frontline ~(44,11)
> and Ember Ring) is **invulnerable while any of 3 ProvingGuards lives**
> (ring r 4 at 0°/120°/240°; immunity re-derived EVERY tick as an idempotent
> flag write — no transition tracking); guards respawn on encounter-owned
> timers (1800t ≈ 60 s [PLACEHOLDER]) — "kill all three inside the window"
> emerges from the timers, zero window code; at ≤50% HP a ONE-SHOT flee
> phase: `SetFleeOverride(true)` + 2 ProvingAdds spawned beside the boss;
> both dead → override off → re-engages by retained threat; boss death →
> `slog` "encounter complete" + full-arena reset after 900t ≈ 30 s
> [PLACEHOLDER] (fresh boss + dead guards, `fled` cleared — repeatable
> in-game; reset clears pending guard timers via `spawnGuard` zeroing its
> slot). **Content — `entityType` mob-JSON override (the enabling schema
> bit):** `NewMob` resolved the wire EntityType via `types[d.Name]`, so a
> throwaway def named `ProvingBoss` would fatal → `MobDefinition.EntityType`
> (JSON `entityType`, optional, validated against
> `BerryhunterApi.EnumValuesEntityType` at LOAD time — the prop-registry
> pattern; empty = the name resolves, all 9 legacy defs untouched); `NewMob`
> falls back name→override. Three throwaway defs reusing existing sprites,
> **zero wire/frontend changes**: `proving-boss.json` (id 10, entityType
> AngryMammoth, 600 HP, speed 0.25, AngryMammothAura L1, NO
> fleeBelowHealthRatio — flee is scripted only), `proving-guard.json` (id 11,
> entityType SaberToothCat, 80 HP), `proving-add.json` (id 12, entityType
> Rabbit, 40 HP) — all [PLACEHOLDER], all WITHOUT a `faction` key = built-in
> hostile default, so roaming predators/tuskers ignore the arena and the
> arena mobs never fight each other. **THREAT cheat (`sys/cmd`):**
> `NewCommandSystem(g, tokens, space)` — the previously-dead `commands`
> struct field now holds an instance map (package map + the space-bound
> closure; `Update` reads `c.commands`); `THREAT` dumps every mob within 15 u
> [PLACEHOLDER] of the player (probe mask spans Action|Player|Viewport body
> layers — companions and braziers included), `THREAT <entityID>` one mob by
> ID; output = one `log` line per mob via `formatThreatReport`: id, def name,
> `Invulnerable()`, aggro-target ID, sorted rows (names where the entity has
> one). Backing seam **`Mob.ThreatSnapshot() ([]ThreatRow, targetID)`** —
> living entries sorted descending (ties: lower ID, matching retention),
> read-only (dead entries skipped, NOT pruned). **Count pins: mobs 9→12**
> (boot-log line only), skills 24 / milestones 10 unchanged, suite 22→23
> pkgs; proving-grounds zone untouched (encounter mobs are not zone spawns —
> boot spawns line stays 390). **Pins:** `encounter/system_test.go` (OnTick
> per update / death dispatched exactly once / deaths-before-tick order /
> non-mob Remove ignored / SpawnMob places+registers / unknown def errors /
> spawned-mob death dispatches), `mob_test.go` (invulnerable player+mob hits
> are non-events incl. no threat + toggle-off restores, VERIFIED RED;
> flee-override flees at FULL health / suspends leash + retains threat past
> 3× the countdown / re-engages top threat on drop, VERIFIED RED;
> entityType-override resolves the wire type, VERIFIED RED; ThreatSnapshot
> sorted-living-only, VERIFIED RED), `definitions_test.go` (entityType
> parse / absent-empty / unknown-fails, VERIFIED RED), `smoke_test.go`
> (6 integration tests through fakeGame + a stepWorld replica of the
> MobSystem death loop: initial spawn immune / immunity lifts on 3 dead /
> guard respawn restores it / half-health flees + spawns adds / adds dead →
> re-engages retained threat / boss death resets arena after the delay),
> `cmd_test.go` (formatThreatReport content / THREAT-by-ID incl. failures /
> mobsNearby via a real `phy.Space`). **In-game checklist (PASSED
> 2026-07-12):** warp
> to ~(53,−22) (`WARP 6360 -2640`); boss (mammoth sprite) + 3 cats present;
> hitting the boss shows hit VFX but NO damage numbers while any cat lives;
> kill all 3 within ~60 s → numbers appear; wait for a cat respawn → immune
> again; at ~half HP the boss runs while 2 rabbits appear — chase it and
> confirm it never resets (no walk-home/regen); kill the rabbits → the boss
> turns and beelines whoever hurt it most; `THREAT` prints tables to the
> server log through all phases; kill the boss → completion log; arena back
> fresh after ~30 s. **Chunk 9 is VERIFIED — plan-mob-depth's build-out is
> COMPLETE (chunk 8's own healer checklist is the only marker still open).
> Next: execution step 3 (atmosphere & recovery), plan-first in a NEW
> session; 9f + real boss scripts (lava-bridge) land in the content pass
> (item 12) against these seams — authoring guide:
> `manual-content-authoring.md` §5. Captured 2026-07-12 (user question at
> verification): editor-configurable encounters / per-mob scripted behavior
> → backlog item 17 (assessment: parameterized encounter TEMPLATES are the
> cheap path; a behavior DSL stays decided-against per F3).**

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
  (proving-grounds zone), not a designed boss.

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
- **§6.4 — Companion specifics (chunk 6) — ✓ DECIDED 2026-07-11 (chunk-6
  plan-first, user):** lifetime = **TTL, totem-style** (~60 s [PLACEHOLDER],
  skill-level-scaled, cooldown ≥ TTL); follow = hold ring ~1.5 u with
  **catch-up teleport** beyond ~15 u [PLACEHOLDER]; max-one = **TTL ≤
  cooldown convention only, deliberately unenforced** — cooldown reduction
  beating the TTL legitimately yields multiple companions (the reward for
  that interaction; no code cap). (Whether hostile mobs can target it was
  already DECIDED: yes — it builds its own threat, §1.3.) Record: chunk-6
  banner (§5).
- **§6.5 — Encounter 9f cut line — ✓ DECIDED 2026-07-11 (chunk-9 plan-first,
  user): slide to the content pass** as leaned — timed world-state +
  dwell-capture land with the real lava-bridge boss (item 12); they're the
  only two pieces with wire footprint and have no smoke-test value. Chunk 9
  therefore shipped with ZERO wire changes. Record: chunk-9 banner (§5).
- **§6.6 — Waypoint schema shape (chunk 5b) — DECIDED 2026-07-11 (chunk-5
  plan-first, user):** per-spawn inline waypoint list (the lean; no shared
  routes); traversal = **ping-pong only** (closed loops are authored as
  polygons); editor UX = waypoint toggle on the selected spawn ("Add on map
  click" + Remove last / Clear, polyline + numbered dots). Bonus decision
  the chunk surfaced: **WoW-classic evade return** — record the position on
  leaving idle for combat, walk back there after the reset, resume the
  archetype; sensor follows the body. Record: chunk-5 banner (§5).
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
- **§6.8 — Faction model (chunk 6.6) — ✓ DECIDED 2026-07-11 (chunk-6.6
  plan-first, user), AMENDED same day (in-game harm-gate fix):**
  per-faction **hostility list** (`hostileTo`, asymmetry legal); authoring
  **def-level only** (no per-spawn override); **all faction masks widen**
  to both combatant layers (`factionLayers` deleted, eligibility exact
  everywhere); **kill rewards on any death** (mob killing blow rewards
  recorded participants; also closed the poke-the-corpse XP leak).
  Default = built-in `hostile` with aggro set {aligned} only — the
  pre-factions behavior verbatim; mob hunting is always explicit content.
  **Amendment (user, after in-game findings): mob-cast harm follows the
  two-layer rule** — aggro set (static) ∪ threat table (dynamic) — via
  the single `mayHarm` seam in sys; "different faction = may harm" now
  applies to player-sourced damage only. Record: chunk-6.6 banner (§5),
  incl. the scalability record (bitmask cap, friendlyTo extension path,
  social aggro, THREAT cheat).
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
