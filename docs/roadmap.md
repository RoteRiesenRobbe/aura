# v1.0 Roadmap — Non-Skill Systems (Skeleton)

Very rough skeletons of the v1.0 scope items **outside** the skill system.
Each item graduates to its own design doc (or a section here grows into one)
when its work approaches. The skill system has its own plan:
`plan-skill-system.md`.

The item **numbering below is an enumeration, not the build order**. The decided
build sequence lives in **"Execution order (decided 2026-07-08)"** near the end
of this file. All numbers [PLACEHOLDER]. **⚑** marks open decision points.

Unscoped ideas that haven't graduated into a roadmap item live in
`backlog.md`.

---

## 1. The Resource (single unified stat) ✓ Done

> **Done (Block 2, 2026-07-04) — see `archive-block2-survival-removal.md`.**
> `Health` is now the single resource; items 1 + 2 were executed together.

Every player and NPC has exactly one resource — HP, mana, everything at once;
0 = death.

- Current state: Berryhunter vitals (health, satiety, body temperature) via
  `VitalSigns`; the health bar (red) is the de-facto resource display already.
- Work: collapse onto a single resource; health likely *becomes* the resource.
- Tightly coupled to survival-system removal (below); probably the same chapter.
- **Decided: costs are effect parameters.** Any skill — cooldowns included —
  *may* declare a self-cost via the existing `selfDamageFraction` pattern
  (the Heal aura already does). No separate cost system; costs stay curatable per
  skill, no new code.

## 2. Survival-system removal ✓ Done

> **Done (Block 2, 2026-07-04) — see `archive-block2-survival-removal.md`.**
> Survival systems, crafting, inventory, equipment, and the item wire protocol
> removed; resources kept as decorative, campfires as inert stubs.

Remove or heavily reduce: satiety/hunger, body temperature, crafting,
food/tool items.

- Current state: **frontend already half-way there** — hunger/cold overlays are
  intentionally disabled and the second HUD bar is repurposed as level progress
  (`vital-signs/logic/VitalSigns.ts`). The **backend still ticks** satiety and
  body temperature (e.g. `sys/daycycle.go`), the values just aren't surfaced.
- Work: remove the backend survival systems, wire vitals fields, crafting, and
  food/tool item definitions.
- **Decided: day/night cycle stays visually.** The existing `day-cycle`
  rendering keeps delivering ambiance/world rhythm for free; only the backend
  temperature coupling is removed. Gameplay darkness remains purely
  area-based (caves/tunnels).
- ⚑ Campfires (existing placeables + heater system): decide during the
  survival-removal design pass, once it's clear how entangled heater/placeables
  really are. The v1.0 campfire system (light/safety/social anchor) stays in
  scope either way.
- The existing `tutorial` feature teaches survival mechanics — remove or
  replace it in this pass (per the vision, the zone-1↔2 tunnel later becomes
  the natural tutorial).
- **Decided: no separate inventory — passives are the item layer.** Crafting,
  items, and item UI are removed entirely. Item-like gear is expressed as
  *item-flavored passives* (e.g. a "Dagger" passive: +flat damage per tick) —
  feels like an item, is a passive. The spellbook, split into its three
  category sections (active auras / passives / cooldowns), *is* the inventory
  UI; world drops (variant auras) go straight into the spellbook on pickup.
  Note: item-flavored passives will grow the `stat_multiplier` stat list
  beyond `movementSpeed`/`maxHealth` (e.g. flat aura damage per tick).

## 3. Accounts & persistence

> **Sequenced after the content pass (see "Execution order").** The game proves
> out session-based first; persistence + the account service are step 8, not a
> content prerequisite.

- Current state: frontend `accounts` feature exists but is localStorage-only
  (player name, tutorial progress, settings) — its own comment says "as long as
  accounts are not persisted in the backend". Join is token-based. (The
  chieftain scoreboard service used to be the only persistence; the scoreboard
  was removed 2026-07-08 and chieftain itself was deleted 2026-07-09 — see
  `plan-rebrand-cleanup.md` §4 A.3.)
- Work: backend account identity + persisting spellbook / skill levels / slots /
  player level across sessions.
- Depends on: skill-system Phases 3–7 defining *what* needs persisting.
- **Decided: anonymous-first with upgrade path.** The server issues an account
  secret on first visit (stored in localStorage) — play without registration.
  Optional email/OAuth linking later secures the account across devices.
- **Decided (2026-07-08, `plan-rebrand-cleanup.md` §4 A.3):** chieftain does
  NOT grow into the account service — the account service starts fresh. Its
  scoreboard-shaped code was **deleted 2026-07-09** (pulled forward from the
  rebrand sweep).

## 4. World & zones

2–3 handcrafted connected zones for different level ranges; persistent shared
open world; open-world dungeons (caves, no instances); environmental
storytelling.

> **First slice PLANNED (2026-07-08) → `docs/archive/plan-world-zones.md`.** Decided:
> in-game editor (extend the MysticWand tool), rectangular single-`Space` world,
> server-authoritative `zone.json` (bounds + props + mob spawn points), resources
> demoted to dead weight, occluders carry `blocksMovement`/`blocksAura` but only
> movement blocking is built now. Includes the placement+respawn half of item 7
> (fixed spawn points + respawn timers, no patrols). Defers Tiled, multi-zone,
> zone transitions, sharding, and items 5/6. Six-chunk breakdown in the plan doc.
> **✅ COMPLETE (2026-07-09) — all 6 chunks done + in-game-verified:** Chunk 1
> (rectangular `phy.InvAABB` boundary) + Chunk 2 (`zone.json` schema/loader,
> procedural generation removed) + Chunk 4 (authored mob spawn points + same-spot
> respawn) + Chunk 3 (props as static entities — dedicated `api/props/` registry,
> lean `model/prop.Prop`) + Chunk 5 (in-game editor: prop+spawn placement + zone
> export) + Chunk 6 (zone-owned free-form terrain §7.1 + multi-zone save/select;
> `Welcome.zone_name`; scaffold zone). Full record: `plan-world-zones.md` §5.
> **NEXT in the execution order = Mob depth + totems** (item 7 remainder +
> effect-foundations Step 3; briefing in `plan-effect-foundations.md` §8).

- Current state: single world assembled procedurally at startup (deterministic
  seeds) — the opposite of the hand-authored target.
- Work: map format + authoring workflow (hand-built, no procgen), zone layout,
  spawn/respawn per zone. The map format must carry **individually placed mob
  instances** (fixed spawn points, per-instance respawn timer + variance) and
  **patrol waypoints/routes** — see item 7 (mob behavior, tiers & spawning),
  which owns the behavior side of these. ~~The map format must also carry the
  occluder layer as two independent per-object flags: `blocks-movement` and
  `blocks-aura`.~~ **Superseded 2026-07-10:** aura LoS was cut (item 6) —
  only `blocks-movement` remains meaningful; the shipped-but-inert
  `blocksAura` flag was deleted 2026-07-11 (see item 6).
- ⚑ Authoring tooling: external editor (e.g. Tiled) vs. custom JSON — biggest
  unknown in this item. *Deliberately left open (2026-07); decide when this
  item starts. Suggested first step: a Tiled spike (build one test zone, load
  it through the existing entity pipeline).*

### Zones as runtime physics Spaces & fluid transitions

A `phy.Space` is the unit of everything that can interact (collision, AOI
viewport queries, aura overlap) — entities in different Spaces cannot see or
touch each other, so a Space boundary is a **hard simulation wall**. Whether a
zone is its own Space is a *performance* decision that becomes a *gameplay* one.
Today the whole world is one Space; splitting per zone is the horizontal-scale
path (and the escape from the single-thread ceiling). Fluid, WoW-style
transitions are possible three ways — one big Space per contiguous landmass
(fluid by construction), separate Spaces with **hidden seams at chokepoints**
(the design's tunnels — the recommended cheap path; the light/dark zone-1↔2
tunnel *is* this seam), or border ghosting (true seamless sharding, hard, later).
A transition is a **handoff** (move the entity between Spaces, reset the client
snapshot; connection stays put — the `carriedState` respawn pattern is its
shape), not a teleport. **Full analysis, per-count scaling estimates, and handoff
mechanics: `docs/architecture.md`.**

## 5. Darkness & light ✓ Done

> **Done (atmosphere & recovery chunk 3, 2026-07-12, verified in-game) —
> see `plan-atmosphere-recovery.md` §3.3.** `light_aura` effect type
> (rendering-only), `light_radius` wire, `zone.darkAreas` circles, client
> darkness overlay with light hole-punch, Light Aura skill (milestone L4),
> campfire light r7 + editor dark mode. Real dark-zone content (the
> zone-1↔2 tunnel) stays with the content pass.

Dark areas (caves, the zone-1↔2 tunnel) as the natural tutorial for role
trade-offs (light aura vs. damage aura).

- Current state: a `day-cycle` frontend feature exists (night darkening) —
  possible rendering starting point.
- Work: darkness as a *zone/area* property rather than a time property, light
  sources (light aura, campfires), dark-area definition in map data.
- Depends on: world & zones (map data), skill system (light aura as a skill).
- **Decided: darkness is purely presentational.** It restricts what the player
  *sees* — no effect on damage, hit chance, aura behavior, or any other
  mechanic. You *can* be hit in the dark; you just can't see well. The value
  of the light-support role is vision for the group (positioning, spotting
  targets). *(Confirmed 2026-07-10: this item is **unaffected by the aura-LoS
  cut** — darkness is area-based and never depended on wall occlusion.)*
- **Gap owned by this item:** a `light_aura` effect type does not exist yet.
  It would be the first effect type whose effect is *rendering* (light radius
  counteracting darkness) rather than damage/heal/stats — design it here, as
  an extension of the skill system's effect types.
- **Campfire = large light + small heal (captured 2026-07-09).** A campfire is
  one entity carrying a **large `light_aura`** plus a **much smaller `heal_aura`**
  (multi-effect entity — Paladin is the precedent), so its light reaches far
  wider than its healing/safety radius.

## 6. ~~Line-of-sight for auras~~ — CUT (2026-07-10)

> **Cut entirely (2026-07-10).** Auras pass through walls and every
> environment object; walls/props remain **movement** blockers (that
> mechanic stays fully intact). Decision prep + full rationale:
> `archive-combat-pacing-recovery.md` §2.C; decision record: `tdd.md` §4.2
> + `gdd.md` §12. Key points: solo LoS is symmetric (no positional value),
> the cost was larger than documented (medium system + blob perf spike +
> an undocumented LoS-aware mob-AI extension), and the light-support pillar
> had already been decoupled by the darkness-is-visual decision.
> **Wall-cheese is owned by mob AI instead:** obstacle steering (mob-depth
> chunk 4) + leash mechanics (no-progress leash rule parked in
> `plan-mob-depth.md` §6); navmesh/A* stays the escalation, with
> wall-cheese in playtests as its explicit trigger. Stationary mobs are
> protected by the GDD §8 placement rule. **Darkness/vision (item 5) is
> unaffected** — it never depended on occlusion.
>
> **Sweep DONE (2026-07-11):** the inert `blocksAura` plumbing is deleted —
> `world/zone.go` schema field, `model/prop.Prop` field + `PropEntity`
> method, the zone-editor checkbox + inner-ring marker, and the authored
> values in `api/zones/*.json`. Re-adding later is a one-line additive
> schema change.

## 7. Mob behavior, tiers & spawning — normal / elite / boss

> **✅ BUILD-OUT COMPLETE (2026-07-12) → `docs/archive/plan-mob-depth.md`** (execution
> step 2, with effect-foundations Step 3 totems + a companion cooldown folded
> in). All chunks done + in-game-verified: totem → flee → aggro & threat
> (entity-keyed threat, state-dependent leash, auras-off-until-aggroed) →
> obstacle steering → patrol archetypes → companion → 6.5 hazard braziers →
> 6.6 mob factions & mob-vs-mob hostility (mayHarm two-layer gate) → 7 taunt/
> Fade → 8 support mobs (seek-healer; own checklist still open) → **9
> encounter-controller spine (verified 2026-07-12: `pkg/aura/encounter`
> lifecycle hooks, conditional immunity, scripted spawns, encounter-owned
> timers, scripted flee with retained threat, THREAT cheat; smoke arena in
> proving-grounds; authoring guide `manual-content-authoring.md` §5)**. Key
> decisions: mobs aggro summons (faction-aware acquisition), entity-keyed
> threat diverging from owner-XP attribution, route validity = level-designer
> responsibility, encounters = Go structs registered per zone (no DSL, no
> zone-schema field yet — backlog 17 captures the editor-template idea).
> **9f (timed world-state + dwell-capture) REMOVED from v1 scope (content
> pass C6, 2026-07-18, per plan-content-zones12.md §B):** the Ork World Boss
> shipped always-present with an encounter-owned respawn timer — no
> kill-counter/spawn-trigger semantics needed in v1. Boss *scripts* landed
> with C6 (the OrcWarlordEncounter is the first designed script).

- Builds directly on skill-system Phase 6 (data-driven mobs): tiers are largely
  JSON loadouts (skills, levels, resource pool) + spawn placement.
- **Current base behavior (Phase 6 state — this stays the shared foundation):**
  all mobs run one identical behavior, parameterized per mob: idle at a spawn
  anchor; aggro the nearest living player inside `aggroRadius`; chase until the
  target sits just inside the aura edge (`chaseIntoAuraMargin`), then hold
  position there; give up once the mob itself is farther than `aggroRadius`
  from its spawn anchor (per-mob **max chase distance**); walk back home;
  regenerate out of combat. No mob flees; differences between mobs are purely
  values (speed, radii, aura), not behavior.
  > **Superseded by "Aggro & threat" below** on two points: (a) the fixed
  > max-chase leash becomes **state-dependent** (in-combat mobs chase far
  > longer); (b) **"No mob flees" is dropped** — flee is a required capability.
  > The idle/chase/hold/regen skeleton itself stays the shared foundation.
- **Behavior archetypes (WoW-Classic-style, required) — ✓ DONE (mob-depth
  chunk 5, 2026-07-11; in-game verify pending):** on top of the shared base,
  three idle-movement archetypes exist:
  1. **Stationary** — stands at its spot until aggroed (the default).
  2. **Local patrol** — wanders randomly within a small radius around its
     spawn anchor until aggroed (`wanderRadius` on the spawn).
  3. **Route patrol** — patrols between fixed waypoints on the map
     (`waypoints` on the spawn, ping-pong traversal).
  Bonus (user decision at chunk-5 plan-first): **WoW-classic evade return** —
  every mob walks back to the exact point where it aggroed before resuming,
  and the aggro sensor follows the body (patrollers aggro mid-route).
- **Per-spawn wander radius + wander-range respawn — ✓ DONE (chunk 5).** The
  local-patrol radius is **authored per spawn point** (`wanderRadius` on the
  `zone.json` spawn + an editor control), so two bridge guards stay put
  (radius 0) while a wild boar roams (radius > 0). On death, respawn rolls a
  **random position within the wander range**, not the exact spot — refined
  world chunk 4's same-spot respawn (`plan-world-zones.md`).
- **Support behaviors:** mobs must be able to **heal each other and buff each
  other**, not only act on players — e.g. "move toward allied mobs with a
  mob-only heal aura active", or hold a resist/stat-buff aura over its pack.
  Both ride the faction/ally targeting from effect-foundations Step 1
  (`targetsAllies`, relative to the caster's faction) — a healer or buffer mob
  targets allied (same-faction) mobs. Two known, deliberate Phase-6 limitations
  must be lifted for the heal case (both flagged in `plan-skill-system.md`):
  `heal_aura` was implicitly players-only, and mob entities cannot cast heal
  auras (the SkillSystem's `healCaster` split — mobs lack player vitals; healing
  a mob targets its resource, not player vitals). Buff auras
  (`resist_aura`/stat buffs) are lighter — mobs already carry the shared
  `skills.Buffs` store (effect-foundations Step 2), so mob→mob buffing mainly
  needs the ally-targeting to point at mobs. **Confirmed (targeting session):
  this stays here — no earlier lift, YAGNI.**
- **Player companions & friendly-copy summons (captured 2026-07-09).** Temporary
  player-summoned companion mobs (a wolf, a heal-pet) and an aura variant that
  **respawns a killed mob in range as a friendly copy** are **consumers of the
  effect-foundations Step-3 spawned-entity/totem machinery** (folded into
  execution step 2): a companion = a totem with velocity + owner attribution; the
  friendly-copy is charm, which needs the parked faction setter
  (`plan-effect-foundations.md §8`). No new spine — they extend the totem build.
- **Pathfinding around obstacles:** mobs must **path around movement-blocking
  obstacles**, not walk straight into them and stick. Current movement is
  straight-line `moveTowards` (steer toward the target vector) — since world
  chunk 3, zones contain `blocksMovement` props (and the rectangular boundary
  wall), so a naive chase can jam a mob against a rock/tree between it and its
  target. Applies to every movement mode: chase, flee, patrol routes, and
  leash-walk-home. Scope of the solution is [PLACEHOLDER] and its own design
  task — from cheapest to richest: local obstacle avoidance / steering (deflect
  around the blocker), vs. a real navmesh/grid A* over the zone's static
  colliders. Depends on the zone/collider data from item 4 (world & zones);
  interacts with patrol routes above (waypoints must be reachable).
  individually configured mob instances, placed by hand at fixed spawn points,
  with per-instance respawn time **at the same spot** plus a random respawn
  variance. This is essential for hand-built zones and environmental
  storytelling. Spawn points and patrol routes live in map data → item 4.
  *Current state:* procedural weight/fixed-count spawning (`generator` in the
  mob JSON); on death an immediate replacement spawns at a new random (or
  procreation-nearby) position — no timer, no fixed spot.
- **Decided: bosses get scripted mechanics (phases, adds).** Scripts
  orchestrate *which* skills fire when, phase transitions, and add spawns —
  combat itself stays aura-only, the skill loadout remains the substrate.
  Aura switching and mid-game mob spawning are already technically possible
  since Phase 6.1. Cost note: this implies a boss-scripting layer (data-driven
  state machine or Go behaviors), which is its own design task inside this
  item, scope [PLACEHOLDER].
- A brand-new mob *name* still requires an `EntityType` (schema + frontend
  rendering class); a small JSON `entityType` override (reuse an existing
  look) is the known ~5-line addition when this item introduces variants.
- **Content-era movement vocabulary (captured 2026-07-10, not scheduled):**
  the GDD §4 Combat Pacing analysis names the countermeasures against
  boring ring-riding — **telegraphed lunges, arc pursuit, ground zones
  blocking the retreat corridor**. These are candidate mob capabilities for
  the content pass / later chunks, recorded so the boredom fix has named
  levers; they do not grow the current `plan-mob-depth.md` 9-chunk scope.

### Boss encounters — feasibility audit & the encounter-controller gap

> **Status 2026-07-12: the 🔴 gap below is CLOSED except its wire tail** —
> mob-depth chunk 9 shipped the encounter controller (lifecycle hooks,
> conditional immunity, event-driven scripted spawns, sub-objective state via
> encounter-owned timers, scripted flee with retained threat), verified by a
> throwaway smoke encounter in proving-grounds. Still open, deliberately with
> the real boss (content pass): **timed world-state** (the 20-min bridge) and
> **dwell-capture** — the two wire-visible pieces (§6.5 in
> `plan-mob-depth.md`). Authoring guide: `manual-content-authoring.md` §5.

Stress-tested against a concrete reference encounter (2026-07): a lava-bridge
approach → boss on a rock in a lava pool, connected by 4 bridges; boss immune
until 3 mini-mobs (one per outer platform, 60 s respawn) die simultaneously;
boss leashes to the rock, targets by **threat**, spawns adds; on death a 5th
(safe) bridge opens for 20 min to a water pool where the **first** player to
dwell 10 s gets a unique unlock, then the pool drains (one-shot ascension VFX).

**Verdict: feasible, no rewrite, no hard architectural blocker.** Every hard
part reduces to *one* missing system. Status of each mechanic:

- ✅ **Now:** static geometry (rock/bridges/pool) = static colliders; mob
  spawning primitives; mob-death events (rewards already fire on death); unlock
  granting (spellbook kill/milestone unlocks already grant auras); **tag-based
  damage/resistances + resist auras** (item 11 Phase 2 shipped:
  `plan-item11-hp-resist-variance.md` — a lava DoT with a bespoke tag and a
  matching ward aura are now pure content).
- 🟡 **Planned/partial:** boss leash to the rock =
  tighten existing `spawnPosition`/aggro-territory leashing. Ascension VFX =
  frontend + a world-state wire bit.
- 🔴 **Missing (all the same gap):** encounter start/lock, conditional damage
  **immunity** (the flag is trivial; the *condition* is not), **event-driven
  scripted spawns** (there is no "spawn" effect), sub-objective state tracking
  ("all 3 dead this window" + 60 s timers), boss-death → **timed world-state**
  (open a passage for 20 min), and the **dwell-capture** trigger (first player,
  10 s, one-shot, consume).

**The single missing spine: an encounter/boss scripting layer.** Mobs have
autonomous AI (aggro nearest, fire auras/cooldowns, leash) but nothing owns
*encounter state*: phases, sub-objective tracking, event-driven spawns, immunity
gating, timed world changes. This is the system to build — **medium, not huge**,
because the events it reacts to mostly already fire (proximity, mob death, boss
death, ticks/timers). It is an ECS system holding per-encounter state objects
with lifecycle hooks (`OnPlayerEnter` / `OnMobDeath` / `OnTick` / `OnBossDeath` /
`OnDwellComplete`) that drive spawns / immunity / world-state.

> **Recommendation: build it code-defined in Go (one struct per boss behind an
> interface), NOT a data-driven scripting DSL.** With one boss to author, a DSL
> is YAGNI. Revisit when there are many encounters and a non-engineer author.
> This aligns with the "bosses get scripted mechanics" decision above — the
> encounter controller *is* that scripting layer.

**Threat table** (needed for "attack the highest-threat player from damage /
aura ticks / cooldowns / heals"): targeting today is **nearest player**
(`mob.findAggroTarget`). A weighted per-player threat table is new — but
**seeded** by the existing combat `participants` + `recentHealers` tracking (XP
attribution). Extend that into accumulated threat and target the max. Moderate.
Cleanest as a table owned by the boss/encounter (heals land on allies, not the
boss, so the boss must *observe* heal/aura/cooldown events to credit threat —
per-mob nearest-target can't express that).

### Aggro & threat — design intent (captured 2026-07-08)

The nearest-player targeting above is a placeholder. The real system is a
**concrete, per-character aggro/threat model**, not a proximity check. All
numbers below are [PLACEHOLDER].

- **State-dependent leash (aggro persistence).** A mob's give-up condition is
  not a fixed `aggroRadius` from its anchor. While it is **in combat** — anyone
  inside its aura range **or** it is currently taking damage — it chases *much*
  longer (extended leash / no reset). The mob only starts counting down toward
  leash-home once combat state clears. This replaces the single fixed
  max-chase-distance rule in the base behavior above.
- **Auras off until aggroed.** Idle mobs run with their aura loadout **off** and
  switch the active aura **on** on aggro (and off again on leash/reset). Mob
  aura switching is already technically possible since Phase 6.1 — this wires it
  to aggro state. Keeps idle zones quiet and makes aggro visible.
  **Frontend consequence (captured 2026-07-09):** the aura *ring* renders only
  while the aura is active, so mobs visibly show their aura **only in combat** —
  no separate "hide ring" mechanic needed.
- **Per-character threat table (individual aggro).** Threat is accumulated
  **per player**, not shared "am I aggroed" state. The mob targets the
  highest-threat player. Threat is credited from observed combat events —
  damage dealt, aura ticks, cooldowns, and **heals** (a healer builds threat
  without ever touching the mob) — which is why the table is owned by the
  mob/encounter and seeded by the existing `participants` + `recentHealers`
  tracking (see Threat table above).
- **Taunts / anti-taunt.** The threat model must accommodate **taunt** effects
  (force-target / large temporary threat) and their inverse. This is the home
  for the taunt/anti-taunt effect types parked here from
  `plan-effect-foundations.md` — they are threat-table operations, so they
  cannot land before this system exists.
- **Flee capability.** Mobs must be able to actively **run away from a player**,
  not just chase or hold. This drops the "No mob flees" limitation in the base
  behavior. Flee is a movement mode on the shared behavior (invert the
  chase-toward vector, respect the same collision/leash plumbing), usable by
  both autonomous archetypes and the encounter controller.
- **Scripted-flee reference (boss).** Concrete encounter behavior the above must
  support, feeding the encounter-controller section below: a boss that **flees
  from players while spawning adds** for X seconds and refuses to engage until
  all its spawned adds are dead. Crucially, **the flee phase does not reset its
  aggro/threat range** — players stay on its threat table the whole time, so the
  moment it flips to engage it already targets correctly. Requires flee +
  auras-off-until-engage + the controller spine + the threat table together.

**Two technical gotchas the encounter surfaces:**
- **One Space required.** The controller iterates boss + 3 sub-mobs + players,
  which must share collision/visibility → the whole arena is a single
  `phy.Space` (perf-trivial at ~20 players + adds; see
  `docs/architecture.md` §7). A boss arena is a natural per-zone
  Space reached through a seam.
- **Timed / one-shot world states must be wire-visible.** The 20-min bridge and
  the already-claimed pool are persistent states clients must see (passable?
  full/drained?) → a couple of small wire fields on a placeable/bridge, with the
  controller owning the timers.

**Rough cost of the reference encounter:** 1 new medium system (encounter
controller — the spine), 1 new medium system (threat table, seeded by existing
tracking), the already-planned HP/resist/damage-tag work (buff auras, immunity,
lava tag), 2 small additions (timed world-state objects; dwell-capture trigger),
1 small AI tweak (leash to the rock), reuse of geometry / spawning / death
events / unlock granting, plus content + frontend feedback. It is a *showcase*
for systems already wanted, not a demand for exotic ones.

## 8. UI chrome

Resource bar, XP bar, ability bar, aura panel, minimap, zone chat.

- Already present: health bar (red) and XP/level-progress bar (purple,
  repurposed second vital bar), minimap (`mini-map` feature), chat (`chat`
  feature), spellbook panel (with skill-point spend controls) + passives
  panel (top-left), and the **ability bar** (skill-system Phase 8.2):
  bottom-center action bars — aura slots as a 2×2 grid (hotkeys 1–4) and
  cooldown slots with remaining-time display (hotkeys Q/E).
- No net-new UI elements remain; what's left is a **styling/UX pass** over
  the interim panel look. The health bar becomes the resource bar via item 1.
- **Polish-pass checklist** (concrete items so the scope is pinned, not
  implied — collected 2026-07-08):
  - [ ] Spellbook: proper panel icon (currently placeholder/none)
  - [x] Spellbook: pagination or scrolling once the skill roster outgrows the
        flat list — **DONE early (2026-07-18, PO: "scrolling only" pulled into
        step 6; icons stay here):** SimpleBar scroll area (`#spellbookScroll`)
        with always-visible scrollbar, panel capped to the viewport so the
        passives panel never gets pushed off-screen; verified headless in-game
        with a 33-skill roster
  - [ ] Per-skill icons — ability bar, spellbook, and passives panel currently
        have no real skill iconography
  - [ ] **Retire the `Skills.ts` hand-sync — KNOWN TECH DEBT.** A skill is
        defined once in `api/skills/*.json` (the source of truth: category,
        effects, damage, cadence, maxLevel), but its **name + maxLevel +
        category** must ALSO be hand-copied into three parallel maps in
        `frontend/src/client-data/Skills.ts`. Miss the copy and the client
        falls back to `Skill #<id>` + the default `'aura'` category — the skill
        mis-lists and highlights the wrong loadout slots (hit in skill-vocab
        chunk 6: Haste id 34 showed under Auras while the backend equipped it as
        the cooldown it is). **Fix:** the server sends a skill-metadata catalog
        message on connect (it already owns every skill's name/maxLevel/
        category), so the three static maps are deleted and a new skill is
        configured in ONE place. Design as ONE metadata wire together with the
        tick-indicator + buff-visibility questions above (not three ad-hoc
        fields). The file's own "revisit when the skill list grows" trigger is
        already met (34 skills); sequenced after the content pass so the catalog
        is built against the final roster rather than churned twice.
  - [ ] Bars: visual styling for the resource (health) + XP bars, including
        the absolute-number text overlays added 2026-07-07
  - [ ] Ability bar: styling for aura 2×2 grid + cooldown slots (hotkey
        labels, cooldown sweep, active-aura highlight)
  - [ ] Minimap restyle (rectangular world since world-foundation chunk 1)
  - [ ] Panel chrome: consistent frame/background/typography across
        spellbook, passives, dev-adjacent HUD panels
  - [ ] Buff/debuff display — on the HUD **and** on the entity tokens; **gated
        on the buff-visibility wire decision** (`plan-effect-foundations.md §6`;
        v1 is VFX-only today, no per-entity buff list on the wire)
  - [ ] Hover info on spellbook / ability entries (name, targeting rule, effects)
        — **PLANNED 2026-07-21 → `plan-ui-polish.md` chunk 1** (skill-catalog
        HTTP endpoint + stats-only tooltips; also retires the Skills.ts
        hand-sync above via the catalog)
  - [ ] Avatar state reactions (damaged / happy / dead) + on-token effect display
        (current damage VFX, DoTs, and other states on the token)
  - [ ] **Aura VFX/animation/polish pass** (named 2026-07-10 — previously no
        step owned it): full visual treatment for auras incl. the **tick-timing
        indicator** (GDD §4 — readable for own AND mob auras; a *minimal*
        functional indicator + its small wire addition land earlier, before
        content-pass balancing; the wire design should be solved together
        with the ⚑ buff-visibility question and the `Skills.ts` metadata
        debt — one design, not three ad-hoc fields)
  - [ ] Icon-unlock track — character/token icons unlocked at milestones,
        level-ups, mob kills, aura unlocks (a cosmetic lane parallel to the
        spellbook unlocks). **Designed together with the avatar picker below as
        one system — see `plan-avatar-system.md` (design sketch 2026-07-14).**
  - [ ] Unlock & level-up popups (collected 2026-07-11) — **PO ruling
        2026-07-21: implement via the existing in-game announcement system
        (AlertBanner lane), not a new overlay mechanism** — designed in-game
        notification with actual text for skill unlocks and level-ups, with a
        **queue** so several events (e.g. level-up + milestone unlock landing
        the same tick) play nicely one after another instead of overlapping.
        Today's only unlock feedback is the spellbook glow (skill-system Phase
        3.7/Q9 — client diffs the spellbook stream, no dedicated wire event);
        that diff is the natural trigger source. Build as **one**
        trigger→overlay/notification system shared with the tutorial overlays
        in the content pass (step 6), not two ad-hoc mechanisms — if step 6
        builds the overlay system first, this item reuses it and only adds the
        queue + the unlock/level-up content.
  - Note: **skill icons + spellbook pagination may want to land earlier**, in
    the content pass (step 6) — that's when the roster grows past the flat
    list. **Decided (PO 2026-07-18): scrolling only was pulled forward (done,
    see above); skill icons stay here in step 8** (candidate source noted:
    game-icons.net — ~4k CC-BY monochrome game SVGs, fits the existing SVG
    pipeline, one credits line).
- **Decided: zone chat is one channel per zone** (broadcast filtered by the
  sender's zone). The existing global chat stays as-is until zones exist.
- **Avatar selection (new-mode).** Start-screen portrait picker; choice
  persisted via `accounts` (item 3) and made multiplayer-visible with one
  `avatar_id` wire field on `Character` + a frontend id→SVG map. Easier than
  the old Berryhunter system because new-mode rendering is one SVG texture per
  character (no hair/hand/beard assembly). The dead Berryhunter variant code
  was removed 2026-07-06 (`Character` renders a single `avatar` SVG), so this
  item starts clean. Portrait art [PLACEHOLDER]. **Design sketch fusing this
  with the icon-unlock track above (unlock gating, per-account ownership,
  mid-game re-selection, wire + build order): `plan-avatar-system.md`
  (2026-07-14).**

## 9. Remaining unlock sources

World-exploration clue anchors (source #3) and NPC teaching incl. harvest-mobs
(source #4).

- Depends on: world & zones, skill-system unlock event (3.7), mob chapter (6).
- NPC teaching needs peaceful NPCs — a new entity behavior.

### Friendly NPCs — reuse map (three of four hard parts already exist)

Peaceful NPCs (teachers, and later dialogue-givers) do **not** need a new
subsystem from scratch — most of the substrate is already built:

- **"Peaceful" = `model.Faction`.** An NPC is `FactionAligned`
  (`model/faction.go`, effect-foundations Step 1): hostile-targeting player
  auras skip it and mobs ignore it, with no new invulnerability flag. This is
  the "no griefing by design" guarantee, already in place.
- **"On approach" = the mob aggro sensor pattern.** `model/mob/mob.go` detects
  nearby players with a sensor `phy.Circle` (`IsSensor=true`,
  `Mask=LayerPlayerCollision`), read via `.Collisions()` each tick. A friendly
  NPC's proximity trigger is the **same** shape; `Collisions()` hands back the
  exact `PlayerEntity` in range — which is what makes the interaction
  **contextual to the approaching player** (their progression/spellbook/faction
  are already server-side, so "have they learned Heal yet?" is a pure `if`).
- **"Static, hand-placed, streams" = `model/prop.Prop`.** Placed once at boot,
  routes through `AddEntity`'s plain-entity case (static body + net streaming,
  no update/decay/respawn). An NPC ≈ a prop that also carries a sensor + a
  per-tick behavior — the same "static active entity" shape as the
  effect-foundations §8 totem, so they will likely share a lightweight seam.
- **The teaching payoff = the 3.7 unlock event** (same seam milestones and
  kill-drops use). No new delivery path for the unlock itself.

**The one genuinely new part is the interaction surface.** Auras deliver
effects; conversation does not. Anything past bare teach-on-approach needs a
server→client dialogue message, a client→server choice message (shaped like the
existing `Cheat`/`ChatMessage` in `client.fbs`), a client dialogue panel, and a
dialogue-tree content format — none of which exist. That whole surface is
captured as **backlog item 2 (Friendly NPCs & the dialogue system)**.

**The scoping fork to resolve before building** (also in backlog item 2): are
v1 NPCs **teach-on-approach only** (proximity → unlock, no wire/UI work, rides
existing seams almost for free) **or full branching dialogue** (a real
wire + UI + content subsystem)? This determines whether item 9's NPC half is a
small feature or a new subsystem. See backlog item 2 for the open questions that
dictate what these NPCs must be able to do.

**Placement authoring note (for the world pass, not now):** the natural home
for NPC placement is an `npcs: [...]` array in `zone.json`, authored in the
zone editor (a fourth mode beside Off/Terrain/Props/Spawns). Adding the array
later is a cheap schema edit; **do not build the editor mode now** (YAGNI —
real NPCs are step 5/content), but keeping the `zone.json` schema open to an
`npcs` sibling of `props`/`spawns` avoids a later reshape.

## 10. XP & participation ✓ Done

Vision: **all combat participants receive XP** (no formal groups in v1).

- ✓ Implemented (Block 3, with the Phase 6 mob chapter): mobs track damage
  contributors (`participants`, keyed by entity ID); on death **every
  participant receives the full XP amount** (no split — no groups, no grief
  potential in v1).
- ✓ **Decided: healing counts.** Any successful heal registers the caster as
  a "recent healer" on the target (`NoteHealedBy`/`RecentHealers`, window
  ~10 s [PLACEHOLDER], refreshed per heal); on mob death the recent healers
  of every damage participant are rewarded too, deduplicated (a
  damager+healer gets XP once). No minimum contribution — KISS for v1.
- ✓ **Combat reset rule:** a mob that fully regenerates out of combat clears
  its participants — contributors to an abandoned fight don't get XP for a
  later kill. No clock needed (regen completion is the reset signal).
- ✓ **Decided: drops stay with the last toucher.** The item system is removed
  with the survival systems (item 2); no investment there.

## 11. Aura targeting: selector & target cap ✓ Done

> **Done (2026-07-04, Steps 1–5 below); the deferred HP/resistance follow-up
> graduated to `plan-item11-hp-resist-variance.md` (all three phases done —
> absolute HP, resistances & damage tags, stat variance).**

**Decided (targeting session): base auras get capped targeting.** The design
pitch changes from "no targeting" to "**no manual aiming**": every aura picks
its own targets by a per-aura rule; positioning controls *who* gets hit.
The pre-item implementation was AoE-all (every matching entity in range) —
this item changed shipped base-aura behavior and was its own step.

- **Effect data fields** (analogous to `tickInterval`): `selector` and
  `maxTargets` on `damage_aura`, `heal_aura`, `instant_damage`.
  - `selector: nearest` — default for *everything* (damage and heal).
    Positioning steers the target directly.
  - `selector: lowest_health` — special auras only; **percentual** (lowest
    current/max ratio, not absolute values), so it picks the most-wounded
    target relative to its pool, not always the small add.
- **Target selection pipeline:** range filter (aura sensor, exists) → ~~LoS
  filter (item 6, later)~~ *(cut 2026-07-10)* → selector sort → take first N.
  "All in range" is the uncapped special case, reserved for late unlock auras.
- **Base auras start with few targets** (initial 1 [PLACEHOLDER]); more
  targets come via per-aura level-ups or dedicated unlocks.
- **Per-aura level-up axes:** what a level-up improves is defined per aura —
  damage/heal, radius, target count, tick rate; multiple axes at once are
  allowed. Schema gains `maxTargetsPerLevel` and `tickIntervalPerLevel`
  [PLACEHOLDER] alongside the existing `*PerLevel` fields. *Balance note for
  the content pass: scaling target count × damage on the same aura is the
  most dangerous multiplier — use deliberately.*
- **Heal:** default nearest on allies; **never heals the caster** — self-heal
  is conceptually a cooldown (not yet implemented).
- **Frontend part of this item: per-tick hit VFX on the struck target**
  (sword slash for slow-ticking auras, constant effect e.g. fire for
  fast-ticking ones). This makes the circle read as *range*, not as a hit
  zone — required for capped targeting to feel right, ships together with it.
- *Deferred:* sticky targeting (keep target until dead/out of range) against
  target flicker with `nearest` on fast ticks — build only if flicker actually
  bothers in practice.
- Depends on: nothing hard — the effect application loop exists since Phase 2.
  Placement: **its own step, at the latest before the content pass (item 12)**,
  since the content pass authors per-aura selectors/caps and the prototype
  should ship the decided base-aura feel.

### Implementation status (2026-07-04)

Executed as Steps 1–3 in a dedicated session; each committed separately.

- ✓ **Step 1 — selector & target-cap machinery (backend).** `EffectDef` gained
  `selector` (`nearest` default / `lowest_health` / `all`), `maxTargets`
  (**0 = uncapped**), plus level scaling `maxTargetsPerLevel` and
  `tickIntervalPerLevel`. Targeting pipeline in `backend/pkg/aura/sys/targeting.go`:
  eligibility filter → selector sort → take N. Applied uniformly to
  `damage_aura` / `heal_aura` / `instant_damage`, so **every ability is
  target-cappable via config** (bursts just leave `maxTargets:0`).
  `lowest_health` ranks by current/max **percentage** (`HealthRatio()` on mob +
  player). `nearest` sorts by distance from the caster's aura collider. Tests:
  `sys/targeting_test.go`, `skills/definition_test.go`.
- ✓ **Step 2 — shipped base auras flipped to single-target.** DamageAura /
  HealAura / WildAura → `selector:nearest` + `maxTargets:1`. NovaBurst +
  AngryMammothStomp stay uncapped AoE bursts. `slow_aura` and mob damage auras
  unchanged (still AoE-all). Edited `api/skills/*.json` source + synced the
  `backend/pkg/api/skills/` embed via `make cp-defs`.
- ✓ **Step 2b — HealAura targets the lowest-%-HP ally** (`selector:lowest_health`,
  still `maxTargets:1`) — heals the single most-wounded ally in range by
  percentage, not absolute HP.
- ✓ **Step 3 — floating damage / heal / XP numbers.** Per-tick accumulators on
  mob + player (`model.TickAccumulators.ResetTickNumbers()`, reset by
  `StatusEffectsSystem` prio 101 which runs first each tick; recorded values
  survive to `NetSystem` prio −100 which serializes last). Recorded at the
  **accurate source**: `mob.takeDamage` / `player.takeDamage` (actual
  post-vulnerability/reduction delta), `applyHealAura` → `NoteHealReceived`,
  `AddExperience`. Wire fields (appended at table end, wire-compatible):
  `Mob.damage_taken`; `Character.damage_taken` / `heal_received` / `xp_gained`
  (VitalSign units for damage/heal, raw for XP; `u64ToU32Clamped` for XP).
  Frontend `GameObject.showFloatingNumber(value, kind)` rises + fades on a new
  topmost `characterAdditions.floatingNumbers` world layer (red damage / green
  heal / gold XP), triggered in `EntityManager.addOrUpdate` (mobs + other
  players) and `Player.updateFromBackend` (own character). Display-scale
  **[PLACEHOLDER]**: full health ≈ 1000 points (`HEALTH_DISPLAY_SCALE` /
  `vitalUnitsToDisplay` in `_GameObject.ts`), never rounds a real hit to 0.
  *(Superseded: since item 11 Phase 1 the numbers are literal absolute HP and
  `HEALTH_DISPLAY_SCALE` is deleted — see `plan-item11-hp-resist-variance.md`.)*
  Note: `xp_gained` rides on *every* `Character`, so a nearby player's XP number
  also shows — harmless; restrict to self if it reads as noise.

- ✓ **Step 4 — per-tick hit VFX on the struck target (slash vs fire).** The
  SkillSystem stamps an *aura-hit style* on each struck damage-aura target via
  `model.AuraHitNotifier.NoteAuraHit(style)`, kept **separate** from the
  `takeDamage` number recording (the SkillSystem knows cadence; `takeDamage`
  knows the post-mitigation amount). Carried on a transient `aura_hit_style:ubyte`
  wire field on `Mob`/`Character` (0 = none / 1 = slash / 2 = fire), reset each
  tick on the `TickAccumulators` lifecycle. Style resolution in
  `sys.auraHitStyleFor`: a **per-effect `hitStyle` override** (`slash`/`fire`/
  `none`) wins; `auto` (default) derives from the tick cadence — interval ≥
  `auraSlashTickThreshold` **[PLACEHOLDER 15]** → slash, else fire — so each aura
  is individually configurable in JSON while cadence remains the default.
  Frontend `GameObject.showAuraHit(style)`: single-instance sprite refreshed per
  hit tick, so a fast-tick aura reads as **sustained fire** (cluster over the
  avatar) and a slow-tick aura as a **discrete slash** (bright streak sweeping
  fully across the model from a random side). Triggered where the floating
  numbers already are. The old `DamagedAmbient` white-flash was removed from mobs
  + characters (this VFX replaces it). Pinned by `sys` tests (`auraHitStyleFor`
  auto/override/none; `applyDamageAura` tagging) + `model` reset tests.
- ✓ **Step 5 — tick-interval verified in-game.** No new code — confirmed
  `tickInterval` cadence + `tickIntervalPerLevel` scaling end-to-end.
- ✓ **Content compensation (with Step 4).** Base auras retuned so a slower tick
  keeps its DPS/HPS (all were interval 1; per-tick fraction scaled by the new
  interval, 30 ticks/s): DamageAura interval 20 (0.009→0.18), MammothAura 20
  (0.0033→0.066), HealAura 60 / 2 s (0.001→0.06, self-dmg 0.0015→0.09), DodoAura
  24 / 0.8 s (0.001→0.024), SaberToothCatAura 10 / 0.33 s (0.004→0.04). Resulting
  auto-styles: DamageAura/Mammoth/Dodo → slash, SaberTooth → fire. `angry-mammoth`
  intentionally left fast/default for now. **All still [PLACEHOLDER].**
- ✓ **Overhead health bars moved below** the avatar (mobs + the player's
  in-world bar); the bottom-right HUD bar is unchanged.

### Graduated from item 11 — HP system, resistances, stat variance/ranges

The "deferred from item 11" block (absolute HP, resistances as arbitrary string
tags, resist auras/passives, stat variance) **graduated to its own execution
doc: `plan-item11-hp-resist-variance.md`**, which holds all decisions (A1–A3,
B1–B7, C1–C6) and the implementation map.

Status: **all three phases ✓** implemented and verified in-game — Phase 1
(absolute HP), Phase 2 (resistances & damage tags), Phase 3 (stat variance &
damage ranges: mob spawn-HP bands, per-hit damage/heal variance). The item-12
content pass assigns real variance values across the roster (currently only
DamageAura + Dodo/Mammoth carry placeholder bands). Runtime-cost reasoning for
hazards/resist auras: `docs/architecture.md` §7.

## 12. Initial content pass (prototype gate)

Systems alone aren't a game. Before the prototype is *playable*, a curated
first content set is needed — almost entirely JSON/data work, no code, but it
needs real design time:

- A first roster of skills beyond Damage + Heal: base auras, passives
  (incl. item-flavored ones), cooldowns — count [PLACEHOLDER].
- **Per-aura targeting config** (selector, initial target count, level-up
  axes — see item 11) for every authored skill, including the balance pass on
  the targets × damage multiplier.
- First combination recipes (secret, curated).
- Mob skill loadouts and kill-unlock/drop tables.
- **Full mob roster (design + replace legacy).** Design the actual Aura
  creature list (name, art, aura loadout, tier). **Remove the legacy
  Berryhunter mobs** (`Dodo`/`SaberToothCat`/`Mammoth`/`AngryMammoth` — whose
  names already don't match their art: dodo→boar, mammoth→skeleton,
  saberToothCat→lion, angryMammoth→demon) and replace with the new roster.
  Rename once, here — touches the `MobType` enum (`server.fbs`) + generated
  bindings + `api/mobs/*.json` + frontend `Mobs.ts`/`Graphics.ts`.
- First real-values balancing pass over the placeholder numbers.
- **Peasant onboarding (decided 2026-07-09, `gdd.md §5`).** Flip the starting
  loadout from Damage Aura to a **utility aura** (Harvest, né Turnip-Pull),
  author the passive **chore harvest-mobs** it tag-gates against, and move the
  **Damage Aura milestone to level 1** so chore-farming to level 1 unlocks combat.
  Content + two config moves, no new systems (tag-resist + milestones already
  ship). Generalizes to per-race starts (backlog).
- **Tutorial overlays.** Trigger-based popups/overlays (first death → death
  tutorial: how death works, where you respawn; plus other first-time beats).
  Needs a small client trigger→overlay system + the overlay content; hooks the
  existing death flow (Obituary kept).
- **Combat-pacing authoring rules (2026-07-10, GDD §4 Combat Pacing / §8):**
  mob tick rates slow + readable (tick-dodging rewarding, never mandatory);
  per-tier facetank thresholds as acceptance criteria (harness stand-still
  bot: normal ~90% / elite ≤ ~60% / boss kills the bot [ALL PLACEHOLDER]);
  stationary mobs never placed in wall pockets covering their aura radius
  (auras ignore walls); two-zone auras as special-occasion content
  candidates; feast content pending the GDD §12 aftereffect question;
  personal recovery cooldown theme picked here.

---

## Execution order (decided 2026-07-08)

The item numbering above is an enumeration, not a sequence. The **decided build
order is systems-first**: build every system the content pass depends on, then
author content **once** against finished systems, and only then productionize.
This consciously **trades a fast playable build for author-once content** — real
fun/balance feedback waits for the content pass (item 12). Accepted deliberately;
mitigated by per-chunk in-game verification and throwaway smoke-content so no
system ships blind.

**Done (prototype systems):** items 1, 2, 10, 11 + skill-system Phases 1–9.

**Remaining, in order:**

1. **World foundation** (item 4) — ✅ **COMPLETE (2026-07-09)**, all 6 chunks
   in-game-verified: in-game editor + `zone.json` loader + rectangular boundary +
   zone-owned free-form terrain + multi-zone save/select + a **scaffold** zone
   proving the pipeline end-to-end. The **real designed zones are authored in the
   content pass** (step 6), not here — keeps content-last honest. Record:
   `plan-world-zones.md` §5.
2. **Mob depth** (item 7 remainder) **+ totems** (effect-foundations Step 3) —
   ✅ **COMPLETE (2026-07-12)**, all chunks in-game-verified: totem → flee →
   aggro & threat → obstacle steering → patrol → companion → 6.5 hazard
   braziers/companion reachability → 6.6 mob factions & mob-vs-mob hostility →
   7 taunt/fade → 8 support mobs (healer) → 9 encounter-controller spine +
   `THREAT` cheat. Boss *scripts* landed in the content pass (C6 Orc
   Warlord); 9f (timed world-state + dwell-capture) was removed from v1
   scope there (always-present boss + encounter-owned respawn timer).
   Record: `plan-mob-depth.md` §5; authoring guide:
   `manual-content-authoring.md` §5.
3. **Atmosphere & recovery** — ✅ **COMPLETE (2026-07-13)**, all 4 chunks
   in-game-verified: regen combat gate → campfires → darkness & light →
   death state + campfire respawn (corpse entity + explicit `Respawn`
   message + name reserved while dead + dwell-bound campfire anchors +
   client-only mob corpse fade). Record: `plan-atmosphere-recovery.md`
   (§3.4 outcome banner: wire appends `Corpse`/`Respawn`/`campfire_bound`/
   `dwell_radius`, latent state.go bugs fixed in passing, open review
   findings listed there).

   Scope = item 5 + the 2026-07-10 recovery/death bundle
   (~~item 6 cut 2026-07-10~~ — the LoS spike and occlusion work are gone):
   darkness/light (the `light_aura` effect type, campfires); item 5
   **extends** the zone schema with dark-area definitions itself (the World
   phase does not ship them — item 5 owns "dark-area definition in map data").
   **+ Campfire death-respawn** (GDD §3; backlog item 9): once campfires are
   real stateful entities here, add the "last visited campfire" tracker — the
   respawn point is set by **dwelling N seconds [PLACEHOLDER] in the campfire's
   fire aura**, not by an instant walk-through — and switch `sys/state.go` from
   random-position respawn to the stored point. **Only fixed world campfires
   qualify (2026-07-10)** — player-placed recovery points are never respawn
   points (GDD §3).
   **+ Death state (2026-07-10, GDD §3):** players persist as a body until
   they actively press Respawn (an explicit client→server message replacing
   the implicit re-join; the revive window), mobs leave a brief corpse
   [PLACEHOLDER duration; **decided 2026-07-12: client-only fade** — zero
   server state/wire]. Same `sys/state.go` death-flow surgery as the respawn
   tracker — one pass, not two.
   **+ Combat-gate player passive regen (2026-07-10, GDD §3):** player regen
   currently runs mid-combat (`model/player/update.go`); introduce the player
   in-combat flag (recent-damage window) and gate regen on it — also the
   prerequisite for the harness stand-still thresholds.
   In-memory only (same shape as the existing `carriedState` pattern) — needs
   **no** accounts/persistence, so it does not wait for step 8. Scope note:
   this builds the tracker + death-respawn; the separate *Recall* cooldown
   ability (backlog item 9) reuses the same tracker but is left to the
   skill-vocabulary/content work.
4. **Skill-vocabulary fill** — ✅ **COMPLETE 2026-07-14** (all 6 chunks done +
   verified in-game, last one `3e9ab8e4`; crit later reworked into a
   character-driven stat, 2026-07-20 — `backlog.md` §23). Record:
   `docs/archive/plan-skill-vocab.md` (6 chunks, execution order 1 → 2 → 4 → 3 →
   5 → 6; review decisions: crit = sanctioned upside-only RNG,
   activation preconditions + rejection feedback, per-entity tick wire +
   tick-rate manipulability) — (effect-foundations
   Step 4 + cheap effect types) —
   shield-as-buff-payload, life steal, execute, crit, berserker, **dash/blink**
   (position set + collision sanity — can't cross `blocksMovement`), … so the
   content pass authors builds against the full effect palette. **New primitive
   here: cast-time + interrupt** — first consumer is the **Recall** ability (10 s
   cast, interrupted by damage/movement; reuses step 3's campfire tracker), so
   recall lands with this step.
   **+ `"*"` wildcard resist key (decided 2026-07-09):** resistance maps accept
   a wildcard default multiplier (`{"*": 0, "key_x": 1}` = "resists everything
   except…") — a small `skills.ResistMultiplier` extension, needed twice by the
   content pass (GDD §5 peasant chore-mobs; backlog item 8 key-aura gates).
   Placed here as the last systems step touching the damage pipeline before
   step 6. Multi-tag semantics pinned at implementation (backlog item 8).
   **+ Recovery-over-time payloads (2026-07-10, GDD §3):** a heal-over-time
   buff payload (the inverse of the shipped dot, rides `skills.Buffs`) and/or
   a channel shape on the cast-time primitive above — the E1-compliant
   building blocks for the personal recovery cooldown and campfire-adjacent
   recovery (instant self-heals stay capped-partial per the GDD §3 boundary).
   **+ Revive effect type (2026-07-10, GDD §3/Appendix A):** an effect
   targeting a *dead* player (consumer of step 3's death state) — no current
   effect type can express it; the Revive *ability* itself is content
   (step 6).
   **+ Minimal aura tick-timing indicator (2026-07-10, GDD §4):** the bare
   readable version + its small wire addition (tick phase/interval) must
   exist **before content-pass balancing** — tuning mob tick rates for
   dodge-ability while players can't see ticks tunes blind. Solve the wire
   design together with the ⚑ buff-visibility question + `Skills.ts`
   metadata debt; the polished VFX lands in step 8's aura pass.
5. **Unlock-source systems** (item 9) — world clue-anchor entities + NPC-teaching
   behavior (needs world **and** mobs). ✅ **DONE — all 6 chunks committed +
   VERIFIED IN-GAME by PO 2026-07-15 → `docs/archive/plan-npc-teaching.md`** (6 chunks;
   order 1 → 2 → 3 → 4 → 5 → 6; editor mode = `00574d4c`). **NEXT = the
   pre-step-6 simulation-harness gate below, then item 6 (content pass).** Scope
   locked with PO: **teaching/lore NPC with one-way speech only** (NOT branching
   dialogue — deferred, backlog item 2); **clue anchors deferred** but the entity
   doubles as a lore-only **sign post**; multi-unlock → one combined bubble;
   **zone-editor `npc` placement mode IN scope** (consciously overrides the
   §9 "don't build the editor mode now" note); reuse existing sprite, no wire-enum
   change. Key finding: chat is already an entity-anchored speech-bubble
   (`EntityMessage`) + the grant primitive is zero-wire, so this is a small
   high-reuse extension.

   > **Pre-step-6 gate: the simulation harness** (GDD §5 "First building
   > block"; made an explicit bullet 2026-07-10 — it previously hid inside
   > the tdd.md §4.1 `f(character level)` note). **PLANNED + APPROVED
   > 2026-07-15 → `docs/archive/plan-sim-harness.md`** (a balancing / what-if
   > *explorer* that drives the real ECS headlessly and reports distributions;
   > 4 chunks — ✅ **ALL COMPLETE**, the harness is live tooling). Metrics: TTK / survival /
   > kills-per-level + the 1-vs-N matrix **+ the stand-still bot test with
   > per-mob-type thresholds, measured as sustainable kills/hour over a
   > chain incl. modeled regen + downtime, run per level bracket** (GDD §5).
   > Prerequisite: the step-3 regen combat gate; recovery models (personal
   > cooldown, time-at-fire) enter the chain model as placeholders and are
   > tuned here. **`f(character level)` design settled this session** (GDD §5:
   > Philosophy A same-tier scale-invariant, steep ~12%/level, max level
   > ~25–35 — supersedes the old 60/50×/6.9% placeholders); live-game wiring
   > stays a step-6 task.

6. ✅ **Initial content pass** (item 12) — **the prove-it gate. COMPLETE
   2026-07-21** (`plan-content-zones12.md` §13). Chunks C0–C8 all executed +
   PO-verified in-game, C8 explicitly CLOSED, plus two intermission sessions
   (`plan-intermission-triage.md`), a post-C8 farm-band pre-chunk, the XP pass
   v1, the crit rework v2, and ad-hoc balance tuning. Shipped: Zones 1+2 with
   a village/farm start beat, dark forest, kobold hideout + tunnel, bandit
   gate, the front, the Orc Warlord world boss, 47 mobs, 78 skills, 10
   combination recipes, teaching NPCs, and the first real balance pass
   (kills/hour-derived XP bands, guardrail asserts). **One deliberate
   remnant:** the combat-feel SFX slice below stayed open past the gate;
   **DEFERRED by PO 2026-07-21** (no placeholder audio assets — background
   music + existing sounds suffice for now; revisit later, natural slot: the
   step-8 audio half).

   Original scope: real zones, full
   mob roster (replace the legacy Berryhunter mobs), boss scripts, skills,
   passives, cooldowns, combination recipes, first real balance pass. **This is
   where the game is validated as fun**, session-based (no accounts yet).
   **Multi-zone assumption:** the v1 "2–3 zones" are authored as **regions of
   the one rectangular Space** (per `architecture.md` — one Space per
   contiguous landmass, don't split until forced), connected by tunnel
   corridors built from props. No new zone-transition/sharding tech is
   scheduled before this step; if the content pass finds it needs separate
   Spaces after all, that's a scope change to surface, not to absorb silently.
   **Combat-feel SFX ride with this pass (split out of step-8 audio 2026-07-14):**
   hit / ability / mob-death / level-up sounds are a core fun-*input*, not polish —
   validating "is combat fun?" on a silent build gives a misleading read at the
   prove-it gate (and at the Phase-0 friends playtest, which may pull into this
   pass, `plan-phase0-deploy.md`). No regions dependency; these are tied to
   *abilities*, which exist by now, so they can be authored once alongside the real
   abilities. **Reuse the existing `frontend/src/features/audio/` scaffold**
   (`@pixi/sound`): `SpatialAudio.ts` (positional playback, listener from the camera),
   `TriggerIntervalMap.ts` (per-trigger throttle for aura-tick / hit spam),
   `SoundData.ts`, and `Audio.ts` (master mute/volume via `GameSettings`) already
   exist — the gap is a sound registry + asset load and the trigger hooks off
   ability/hit/death events, not new infrastructure. The location-music half stays
   at step 8.
7. ✅ **Rebrand to Aura & Berryhunter cleanup** (`plan-rebrand-cleanup.md`) —
   **COMPLETE 2026-07-21.** Dead-feature removal (scoreboard pulled forward
   2026-07-08, chieftain deleted 2026-07-09, A.4 scaffolding prune
   `93fba97e`; A.2 rating delete **cancelled** — Kringel Games links stay),
   legacy tagging (A.5 `d1acf28d`), bare skill names (A.6 `24806352`), then
   the structural rename + branding in one atomic commit **`aa509d95`**:
   module `github.com/RoteRiesenRobbe/aura`, `pkg/aura/` dir, `aurad`
   binary, `AuraApi` FlatBuffers namespace, title "Aura". Sat here because
   the content pass (step 6) had just replaced the legacy
   mobs/sprites/enums ("rename once"), and everything must be final before
   ops tooling (step 9) hardcodes names — which it now is. Residual PO
   calls: replacement art (mascot/splash/favicon), wiki-generator
   keep-or-delete, domain (berryhunter.io URLs kept meanwhile).
8. **Accounts & persistence** (item 3) **+ UI polish / avatar / audio** (item 8) —
   deliberately **after** content: the game proves out session-based first, then
   we invest in persistence, the anonymous-first account service (built fresh —
   chieftain deleted 2026-07-09), the styling pass, and avatar selection.
   **The character-sacrifice loop (pulled into v1 scope, PO 2026-07-19 —
   `plan-intermission-triage.md` item 10) slots directly after this step as
   persistence's first consumer** (max-level detection, retire flow,
   account-wide unlock storage, memorial — all cheap once account identity +
   storage exist).
   **Audio — location-music half only (added 2026-07-09; combat SFX split to
   step 6 on 2026-07-14; needs a go/no-go review when reached; may still be cut):**
   location-based background music (forest vs. cave *within* a zone), music
   crossfade between areas, and combat-music blend in/out. Kept here because this
   half genuinely depends on the **named sub-regions** primitive (known-future —
   `tdd.md §4.6` / `plan-world-zones.md §7.6`) and wants the **real zones from the
   content pass** to score against (author-once). Extends the existing `Music.ts`
   (single background-loop track today) to be region-aware. **Don't
   bundle-and-forget:** as a cuttable rider on must-have infra (accounts /
   persistence) this half is first off the truck under time pressure — the
   combat-SFX slice pulled into step 6 is what guarantees the game isn't silent
   even if this half slips or is cut.
9. **Ops & closed-alpha readiness** — CI tests, crash isolation, observability,
   DB / hosting decisions (`research-v1-readiness.md`; hosting phases + load
   math + persistent-servers decision: `research-hosting.md` — Phase 0 "friends
   playtest" deploy may pull earlier, into the content pass; Phase 0 planned →
   `plan-phase0-deploy.md`).

> **Superseded framing:** earlier drafts called item 12 "the only remaining
> prototype gate" and everything else "turns the prototype into v1." That
> minimal-content-first path was consciously rejected (2026-07-08) in favor of
> the systems-first order above. Multiplayer already works (shared-world
> WebSocket server); the sequence still runs session-based through the content
> pass — persistence and productionization come only once content validates the game.

---

## Explicitly not v1.0

PvP, formal groups, economy, mobile, endgame raid events. (Character
sacrifice (meta-progression) was moved **into** v1 scope on 2026-07-19, PO
ruling `plan-intermission-triage.md` item 10 — it lands right after step 8,
accounts & persistence, as its first consumer; GDD §11 amended to match.)
