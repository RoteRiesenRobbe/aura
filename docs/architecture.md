# Architecture & Scaling

Runtime cost model, scaling limits, and the zone/networking architecture.
Grounded in the current code (2026-07); all concrete numbers are
**[PLACEHOLDER]** estimates for reasoning, not measurements.

This doc answers three recurring questions:
1. How bad does performance get at 5 / 50 / 500 players?
2. What does "one physics Space per zone" mean for gameplay, and can transitions
   be fluid like WoW?
3. How expensive are environmental hazards and scripted boss encounters at
   runtime?

---

## 1. Runtime model

- **Fixed 30 Hz tick**, single-threaded. `core/game.go:Loop()` is
  `for { g.update(); <-ticker.C }` — one `update()` per tick, all ECS systems
  run **sequentially in one goroutine**. `constant.TicksPerSecond = 30`
  (33 ms/tick budget).
- One `phy.Space` for the whole world today (zones not yet split — see §6).
- Per tick, the cost that matters concentrates in two systems:
  **physics broadphase** and **network / game-state assembly**. Everything else
  (mob AI, SkillSystem, status effects, NPCs) is O(entities) with cheap bodies.
  (This list previously named `scoreboard`, deleted in the 2026-07-08 prune, and
  `decay`, which still ticks but over a permanently empty slice — see
  `research-code-quality.md` §9 / `backlog.md` §26.)

**The structural ceiling is single-threadedness:** one core caps total
simulation work per tick regardless of how tight each piece is. The escape hatch
is per-zone Spaces (§6), not micro-optimization.

## 2. Physics broadphase (`phy/space.go`)

- Uniform grid, cell size `gridWidth = 10` units. The **dynamic grid is rebuilt
  every tick** (`s.grid = make(...)`) → per-tick map allocation = GC pressure at
  scale. **Static shapes** live in a persistent `gridStatic` inserted once.
- Collision is per-cell brute force: `bruteIntersectShapes` is O(k²) over the
  k shapes in a cell (dynamic×dynamic) plus dynamic×static.
- **Large shapes are the cost amplifier.** A player viewport is a
  `ViewPortWidth × ViewPortHeight = 20 × 12` box → spans ~4–6 cells, and it is
  brute-forced in *every* cell it overlaps. Auras (resized per active skill) add
  more. Roughly 3 shapes per entity (mob: body + aura + aggroAura; player: body
  + aura + viewport).
- Cost ≈ Σ_cells k_c². Uniform density is fine; **clustering is quadratic** —
  N entities piled into a few cells costs ~N² intersection tests.

## 3. Network / area-of-interest (`core/net.go`)

**The classic O(players × all-entities) MMO trap is already avoided.** Each
player is sent **only the entities inside their viewport**:

```
for c := range p.Viewport().Collisions() { entities = append(...) }
```

So send cost = **Σ over players of (entities in that player's viewport)**, each
marshaled into its own FlatBuffers builder and websocket-sent. This is the
single most important scaling property in the codebase.

Consequence: **density, not headcount, is the limit.** Players spread across a
zone each see only their local neighborhood; players piled on one screen each
see everyone → the send set explodes.

## 4. Scaling estimates by player count

Assume ~3 shapes/entity and ~50 bytes/entity on the wire (**[PLACEHOLDER]**).

| Scenario | Physics | Network | Verdict |
|---|---|---|---|
| 5–10, anywhere | <1 ms/tick | trivial | Runs on a potato |
| 50, spread | ~2–5 ms/tick | each sees 10–30 → tiny | Comfortable |
| 500, spread across a large zone | single-thread starts to matter; per-tick grid-rebuild GC | each sees only locals → fine | Probably OK; wants the cheap wins (§5) |
| 500 clustered on one screen | quadratic broadphase blowup (~10M+ tests/tick) | everyone sees everyone: ~250k entity-encodes/tick, hundreds of MB/s out | **Falls over** — CPU *and* bandwidth |

The clustered wall is **bandwidth-first** (a pathological ~375 MB/s), CPU second.
"Hundreds of players on one screen" is a hard problem even for AAA MMOs (Eve
dilates time). It is also outside this game's shape: no PvP, cooperative
role-filling → natural clusters are ~5–20 at a boss.

## 5. Do we need to optimize now? No.

For the prototype and realistic v1 (2–3 zones, tens of players) the current
architecture is fine — the one load-bearing thing (AOI) already exists. When
headroom is needed, in order of effort:

1. **Cheap, high value:** reuse the grid map across ticks (clear + reuse instead
   of `make()` every tick) → kills the per-tick GC allocation. ~an hour.
2. **Structural, already in the design:** one `phy.Space` per zone (§6). Free
   architecturally because the world is already partitioned into zones; each
   zone gets its own core/goroutine/process — the real horizontal-scale path
   and the escape from the single-thread ceiling.
3. **Only if one zone must hold hundreds concentrated:** per-cell parallelism,
   interest-management tuning (cap entities sent), update budgeting. Years away,
   possibly never for this game.

## 6. Zones as physics Spaces

A `phy.Space` is the unit of *everything that can interact*: collision, the AOI
viewport queries, and aura overlap all happen inside one Space. **Two entities
in different Spaces cannot see or touch each other** — no aura reaches across, no
viewport pulls in the neighbor Space, no shared broadphase. A Space boundary is
therefore a **hard wall in the simulation**, not a line on a map.

### "Like WoW" is two different things

- **Seamless within a continent** (Elwynn → Westfall, no loading, see across):
  that whole continent is **one world / one Space**. The "zones" are cosmetic
  labels + audio/quest triggers; there is *no* simulation boundary there.
- **Loading between continents / into dungeons / instances** (boats, portals):
  a genuine handoff to a different simulation → loading screen.

So fluid transitions are fluid precisely **where there is no boundary.** The
moment a real Space split exists, WoW shows a loading screen.

### Three ways to build transitions

- **A — One Space per contiguous landmass (WoW-continent model).** Zones are
  cosmetic. Transitions perfectly fluid by construction; you can see and walk
  across. Cost: that whole landmass is one Space → single-thread ceiling for
  everyone in it. Fine until a landmass's concurrent population outgrows a core.
- **B — Separate Spaces with hidden seams (the design's tunnels).** Put every
  Space boundary where the player *can't see across it* — a dark tunnel, cave
  mouth, doorway, narrow pass. Transition = a handoff at the chokepoint; it
  *feels* fluid because there's nothing to see popping in/out. **The light/dark
  zone-1↔2 tunnel is exactly this seam** (not just a tutorial device). Sweet
  spot: independent Spaces, cheap, fluid feel.
- **C — Separate Spaces with border ghosting (true seamless sharding).** A shared
  overlap strip where each Space mirrors the other's entities as read-only
  ghosts, with an authority handoff on crossing. Lets you see across an *open*
  landscape boundary. Genuinely hard (cross-Space replication, double-sim in the
  overlap, authority transfer). Overkill for v1, probably for v5.

### What a transition requires mechanically

Even option B needs a **handoff**, not a teleport:
- Remove the entity from every system of Space A, add it to Space B; the client's
  entity snapshot resets to B's contents. The connection (websocket/client)
  stays put — only the simulated entity moves. The existing `carriedState`
  pattern (stashing progression + `SkillComponent` across re-adds on respawn) is
  already the shape of this plumbing.
- **In-process** (Spaces as goroutines): mutex-guarded move between Spaces; a
  brief visual reset is the only artifact — hide it behind the tunnel.
- **Cross-process** (the horizontal-scale endgame): serialize player state, hand
  the connection to the other process, resync — a WoW-style micro-load moment,
  deliberately masked.

**Gameplay cost of a split:** players on opposite sides of a boundary can't
interact (a healer one step into the tunnel can't heal someone behind them). So
place seams only at genuine chokepoints where no fight is meant to cross. The
zone-and-tunnel topology is specifically designed to make this a non-issue.

### Recommendation

Don't split until forced. Build each contiguous, viewable area as **one Space**
(A). When population or the single-thread ceiling forces a split, split only at
hideable chokepoints (B) with an in-process handoff. Reserve ghosting (C) for a
hypothetical open vista straddling two Spaces — which the tunnel topology avoids.

## 7. Runtime cost of hazards & scripted encounters

**Essentially free.** The ingredients reuse existing/planned mechanisms:

- **Environmental hazard (e.g. a lava bridge):** a static hazard area = static
  colliders in `gridStatic` (**not** rebuilt per tick) + a DoT tick on
  overlapping players. Cost is O(players near the hazard), independent of bridge
  length. Same "apply a fraction of damage to overlapping entities" as an aura,
  sourced from a stationary shape.
- **Buff / resist aura:** one more aura; same broadphase-overlap + apply cost,
  granting a transient stat instead of dealing damage. *(Since shipped as
  `resist_aura`, item 11 Phase 2 — the cost model held.)*
- **Resistance check at damage time:** a map lookup + a multiply. Nothing new to
  iterate per tick. *(Shipped: `skills.ResistMultiplier`.)*
- **A 20-player boss arena with adds:** trivial on one core — this is exactly the
  spread-tens-of-players regime from §4, and it must live in a single Space (the
  encounter controller iterates boss + adds + players, which requires shared
  collision/visibility). A boss arena is a natural per-zone Space reached through
  a seam (§6).

So hazards and encounters add ~0 to the per-tick budget. Their real cost is
*implementation* (new systems), not runtime — see roadmap.md item 7 (boss
encounters / encounter controller / threat). The HP/resistance/damage-tag
substrate has since shipped (`plan-item11-hp-resist-variance.md`, Phases 1+2).

### Design implication for the damage/resistance system

"Resistance to **this specific lava**, not general fire" means the
damage/resistance types must be **arbitrary named tags** (a set/map), **not a
fixed enum**. A rigid `fire/ice/physical` enum makes bespoke hazards impossible
without a code change each time. **Decided and built exactly this way** (item 11
Phase 2): damage effects carry string tags, resist sources list the tags they
cover, general (`fire`) and bespoke (`boss_x_lava`) multipliers compose.
