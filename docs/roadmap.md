# v1.0 Roadmap — Non-Skill Systems (Skeleton)

Very rough skeletons of the v1.0 scope items **outside** the skill system.
Each item graduates to its own design doc (or a section here grows into one)
when its work approaches. The skill system has its own plan:
`plan-skill-system.md`.

Ordering below is a first guess, not a decision. All numbers [PLACEHOLDER].
**⚑** marks open decision points.

Unscoped ideas that haven't graduated into a roadmap item live in
`backlog.md`.

---

## 1. The Resource (single unified stat) ✓ Done

> **Done (Block 2, 2026-07-04) — see `plan-block2-survival-removal.md`.**
> `Health` is now the single resource; items 1 + 2 were executed together.

Every player and NPC has exactly one resource — HP, mana, everything at once;
0 = death.

- Current state: Berryhunter vitals (health, satiety, body temperature) via
  `VitalSigns`; the health bar (red) is the de-facto resource display already.
- Work: collapse onto a single resource; health likely *becomes* the resource.
- Tightly coupled to survival-system removal (below); probably the same chapter.
- **Decided: costs are effect parameters.** Any skill — cooldowns included —
  *may* declare a self-cost via the existing `selfDamageFraction` pattern
  (HealAura already does). No separate cost system; costs stay curatable per
  skill, no new code.

## 2. Survival-system removal ✓ Done

> **Done (Block 2, 2026-07-04) — see `plan-block2-survival-removal.md`.**
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

- Current state: frontend `accounts` feature exists but is localStorage-only
  (player name, tutorial progress, settings) — its own comment says "as long as
  accounts are not persisted in the backend". Join is token-based; the
  chieftain service persists scoreboards (SQLite).
- Work: backend account identity + persisting spellbook / skill levels / slots /
  player level across sessions.
- Depends on: skill-system Phases 3–7 defining *what* needs persisting.
- **Decided: anonymous-first with upgrade path.** The server issues an account
  secret on first visit (stored in localStorage) — play without registration.
  Optional email/OAuth linking later secures the account across devices.
- ⚑ Whether chieftain grows into the account service or a new service is
  added.

## 4. World & zones

2–3 handcrafted connected zones for different level ranges; persistent shared
open world; open-world dungeons (caves, no instances); environmental
storytelling.

- Current state: single world assembled procedurally at startup (deterministic
  seeds) — the opposite of the hand-authored target.
- Work: map format + authoring workflow (hand-built, no procgen), zone layout,
  spawn/respawn per zone. The map format must carry **individually placed mob
  instances** (fixed spawn points, per-instance respawn timer + variance) and
  **patrol waypoints/routes** — see item 7 (mob behavior, tiers & spawning),
  which owns the behavior side of these. The map format must also carry the
  **occluder layer** as **two independent per-object flags**, not one:
  `blocks-movement` (physical collision) and `blocks-aura` (LoS occlusion, see
  item 6). They are orthogonal — a **fence** blocks movement but not auras; a
  **large rock/wall** blocks both; a **bush/decoration** blocks neither.
  Curated per object — walls/rocks/cliffs block LoS, decorative trees don't.
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

## 5. Darkness & light

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
  targets). This deliberately decouples the cheap, atmospheric part from the
  server-authoritative LoS occlusion work (item 6).
- **Gap owned by this item:** a `light_aura` effect type does not exist yet.
  It would be the first effect type whose effect is *rendering* (light radius
  counteracting darkness) rather than damage/heal/stats — design it here, as
  an extension of the skill system's effect types.

## 6. Line-of-sight for auras

Aura effects blocked by walls/obstacles.

- Work: occlusion check between aura owner and each target candidate, applied
  in `SkillSystem` effect application (in the targeting pipeline: range filter
  → **LoS filter** → selector sort → take N, see item 11).
- **Decided: occlusion is separate from darkness/vision.** This item is only
  the server-authoritative, combat-relevant part (does a wall block the
  effect?). Vision/darkness is client-side rendering (item 5).
- **Decided: occluders are curated.** A `blocks-aura` flag on large objects
  (walls, rocks, cliffs); decorative trees do *not* block — otherwise forest
  combat gets chopped up and feels random. This is the aura-occlusion flag; it
  is **independent from `blocks-movement`** (a fence blocks movement but not
  auras; a rock blocks both) — both flags live in map data (item 4).
- **Approach (direction, to be validated by a spike):** occluder layer as a
  grid/tilemap + integer raycast (DDA); LoS result caching (recompute every K
  ticks or on movement [PLACEHOLDER]); with capped targets (item 11), raycast
  candidates in selector order with early-out once N targets pass — normally N
  raycasts, not all candidates.
- **Performance model:** cost scales with *co-located* aura casters (the blob:
  boss events, special-event puddle), not total entities; the broadphase is
  the expensive part and `phy` already has spatial hashing. The spike is a
  **blob benchmark**: X synthetic casters, tick time must stay under 33 ms.
- ⚑ Occluder representation: static geometry (pre-bakeable) vs. entities
  (Berryhunter resources are harvestable → potentially dynamic). Depends on
  the map format (item 4).
- Depends on: world & zones providing walls worth occluding; cheap to defer
  until then. Not part of the prototype path.

## 7. Mob behavior, tiers & spawning — normal / elite / boss

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
- **Behavior archetypes (WoW-Classic-style, required):** on top of the shared
  base, three idle-movement archetypes must exist:
  1. **Stationary** — stands at its spot until aggroed (today's behavior).
  2. **Local patrol** — wanders randomly within a small radius around its
     spawn anchor until aggroed.
  3. **Route patrol** — patrols between fixed waypoints on the map.
  Waypoints are map data → depends on item 4 (world & zones authoring format).
- **Support behaviors:** mobs must be able to run behaviors like "move toward
  allied mobs with a mob-only heal aura active". Two known, deliberate Phase-6
  limitations must be lifted for this (both flagged in
  `plan-skill-system.md`): `heal_aura` has no target flags yet (implicitly
  players-only), and mob entities cannot cast heal auras (the SkillSystem's
  `healCaster` split — mobs lack player vitals). **Confirmed (targeting
  session): this stays here — no earlier lift, YAGNI.**
- **Placement & respawn (level design / environmental storytelling):**
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

### Boss encounters — feasibility audit & the encounter-controller gap

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
- **Decided: zone chat is one channel per zone** (broadcast filtered by the
  sender's zone). The existing global chat stays as-is until zones exist.
- **Avatar selection (new-mode).** Start-screen portrait picker; choice
  persisted via `accounts` (item 3) and made multiplayer-visible with one
  `avatar_id` wire field on `Character` + a frontend id→SVG map. Easier than
  the old Berryhunter system because new-mode rendering is one SVG texture per
  character (no hair/hand/beard assembly). Depends on removing the dead variant
  code (see CLAUDE.md tech-debt). Portrait art [PLACEHOLDER].

## 9. Remaining unlock sources

World-exploration clue anchors (source #3) and NPC teaching incl. harvest-mobs
(source #4).

- Depends on: world & zones, skill-system unlock event (3.7), mob chapter (6).
- NPC teaching needs peaceful NPCs — a new entity behavior.

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
> graduated to `plan-item11-hp-resist-variance.md` (Phases 1+2 done, Phase 3
> open).**

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
- **Target selection pipeline:** range filter (aura sensor, exists) → LoS
  filter (item 6, later) → selector sort → take first N. "All in range" is
  the uncapped special case, reserved for late unlock auras.
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
  `tickIntervalPerLevel`. Targeting pipeline in `backend/pkg/berryhunter/sys/targeting.go`:
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
B1–B7), the implementation map, and the remaining open questions.

Status: **Phase 1 (absolute HP) ✓ and Phase 2 (resistances & damage tags) ✓**
are implemented and verified in-game; **Phase 3 (stat variance & damage
ranges)** is documented there but not scheduled. Runtime-cost reasoning for
hazards/resist auras: `docs/architecture.md` §7.

## 12. Initial content pass (prototype gate)

Systems alone aren't a game. Before the prototype is *playable*, a curated
first content set is needed — almost entirely JSON/data work, no code, but it
needs real design time:

- A first roster of skills beyond DamageAura + HealAura: base auras, passives
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

---

## Path to a multiplayer-playable prototype

Multiplayer itself already works — the game runs as a shared-world WebSocket
server today. The minimal subset for a playable prototype:

1. ~~**Skill system complete** — `plan-skill-system.md` Phases 1–9.~~ ✓
2. ~~**Items 1 + 2** — single resource, survival systems removed.~~ ✓
3. ~~**Item 10** — participation XP (otherwise support roles can't level).~~ ✓
4. ~~**Item 11** — aura targeting (selector + target cap + hit VFX), plus the
   graduated HP/resistance phases 1+2.~~ ✓
5. **Item 12** — initial content pass. ← **the only remaining prototype gate**

The prototype runs on the existing procedurally assembled world, without
accounts/persistence (session-based, like today). Everything else — zones,
darkness & light, line-of-sight, accounts, mob tiers, chat scoping, remaining
unlock sources — turns the prototype into *v1*.

---

## Explicitly not v1.0

PvP, formal groups, economy, mobile, endgame raid events, character sacrifice
(meta-progression).
