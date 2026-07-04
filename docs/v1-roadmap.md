# v1.0 Roadmap — Non-Skill Systems (Skeleton)

Very rough skeletons of the v1.0 scope items **outside** the skill system.
Each item graduates to its own design doc (or a section here grows into one)
when its work approaches. The skill system has its own plan:
`skill-system-design.md`.

Ordering below is a first guess, not a decision. All numbers [PLACEHOLDER].
**⚑** marks open decision points.

---

## 1. The Resource (single unified stat)

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

## 2. Survival-system removal

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
  **LoS occluder layer** (see item 6): a per-object blocks-LoS flag, curated —
  walls/rocks/cliffs block, decorative trees don't.
- ⚑ Authoring tooling: external editor (e.g. Tiled) vs. custom JSON — biggest
  unknown in this item. *Deliberately left open (2026-07); decide when this
  item starts. Suggested first step: a Tiled spike (build one test zone, load
  it through the existing entity pipeline).*

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
- **Decided: occluders are curated.** A blocks-LoS flag on large objects
  (walls, rocks, cliffs); decorative trees do *not* block — otherwise forest
  combat gets chopped up and feels random. The flag lives in map data (item 4).
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
  `skill-system-design.md`): `heal_aura` has no target flags yet (implicitly
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

## 11. Aura targeting: selector & target cap

**Decided (targeting session): base auras get capped targeting.** The design
pitch changes from "no targeting" to "**no manual aiming**": every aura picks
its own targets by a per-aura rule; positioning controls *who* gets hit.
Current implementation is AoE-all (every matching entity in range) — this item
changes shipped base-aura behavior and is its own step.

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
- First real-values balancing pass over the placeholder numbers.

---

## Path to a multiplayer-playable prototype

Multiplayer itself already works — the game runs as a shared-world WebSocket
server today. The minimal subset for a playable prototype:

1. **Skill system complete** — `skill-system-design.md` Phases ~~3.7 → 1b →
   5 → 6 → 7 → 8~~ → **9 (remaining; design done, implementation open)**.
2. **Items 1 + 2** — single resource, survival systems removed.
3. ~~**Item 10** — participation XP (otherwise support roles can't level).~~ ✓
4. **Item 11** — aura targeting (selector + target cap + hit VFX); the
   prototype should ship the decided base-aura feel, not the AoE-all interim
   state.
5. **Item 12** — initial content pass.

The prototype runs on the existing procedurally assembled world, without
accounts/persistence (session-based, like today). Everything else — zones,
darkness & light, line-of-sight, accounts, mob tiers, chat scoping, remaining
unlock sources — turns the prototype into *v1*.

---

## Explicitly not v1.0

PvP, formal groups, economy, mobile, endgame raid events, character sacrifice
(meta-progression).
