# Plan: road pace, a speed buff while on a road that lingers after leaving it

**Drafted 2026-10-14 (planning session). NOT approved. 2 chunks proposed (R1 engine, R2
content + in-game pass). PO answers 2026-10-14 in §6: Q2, Q3, Q5, Q7 RULED; Q1, Q4, Q6 open
(Q4 leaning); Q8 not yet asked. R1 can start once Q1 is ruled.**

⭐ **The feature is content on top of `plan-area-effects.md`, plus the two things that plan
left unfinished.** A road path names an effect (`effect` on the shape, area-effects D2); the
effect is an ordinary `speed_burst` skill whose `speedDurationTicks` IS the linger. While you
stand on the road the area keeps refreshing the buff; when you step off, the same expiry
timer every buff already has runs out over the authored lifetime. No new timer, no new
payload, no new effect type, no wire change.

The two unfinished things, both owned by this plan from now on:

1. **Path containment.** E2 tests "inside" with point-in-polygon for every shape, which is
   wrong for a path (a stroke has no inside; `world/area_effects.go:215` records it). No
   content authored an effect on a path, so it never mattered.
2. **The refresh churn.** E2 re-applies every tick. Every `Apply*` refresh that outlasts
   what is left bumps the buff store's revision (`skills/own_effects.go:98`), and the
   owner-state gate resends the owner block on any revision change (`core/net.go:96`). So
   standing in ANY area effect today would resend the owner block (plus `questMarkers`) 30
   times a second. Latent only because no zone authors an area effect yet. Roads would be
   the first content, and the most walked-on surface in the game.

---

## 1. Why this shape (reuse) and what it costs

| | **A. Area effect + speed buff (recommended)** | B. Terrain multiplier at the walk site |
|---|---|---|
| Mechanism | `effect` on the road path, `AreaEffectSystem` applies `ApplySpeed` | `walkStep` reads "on road?" and a per-player linger counter |
| New concepts | none (a path test and a beat inside an existing system) | a second movement modifier beside `MovementFactor` |
| Player feedback | a buff-tray circle that sweeps out over the linger, free | none, unless built |
| Mobs | players only (Q3) needs a filter in the speed arm | players only for free (the player walk site) |
| Swift interplay | existing rule: speed buffs from different skills multiply | whatever the new code decides |
| Wire | owner block resends at the beat while on a road (§3.3) | NONE |
| Per-tick server cost | one raster lookup per awake entity (§3.1) | one raster lookup per player |

B is strictly cheaper on the wire and simpler in isolation, but it builds a parallel
movement modifier the next "terrain does X" request would have to copy (DRY), and it gives
the player no tell. A reuses the whole buff pipeline, fixes E2's two latent faults on the
way, and makes every future boon or hazard path free content. **Recommendation: A**, with
the wire cost bounded by the beat and measured (§5). Q1 asks the PO.

---

## 2. Decision ledger (proposed, every number [PLACEHOLDER])

| # | Decision | Why |
|---|---|---|
| D1 | The road buff is a `speed_burst` skill file (`RoadPace`), `targetsSelf: true`, never in any spellbook. `speedFactor` is the bonus, `speedDurationTicks` the linger. | Both knobs already exist, are validated (`factor > 0`, `≠ 1`, `duration > 0`) and are tuned without code. |
| D2 | ⛔ **NOT a `speed_aura`.** | The tray's `isSustained` (`BuffTray.ts:92`) draws an aura-category circle STEADY while listed, then sweeps it for another lifetime. The server lists the road buff for the whole linger, so a 3 s linger would read as 6 s. A cooldown-category skill gets the honest wedge: full on the road, one clean 3 s sweep after. |
| D3 | `AreaEffectSystem` gains a `speed_burst` case beside `dot_aura`/`hot_aura`; `CrossValidateAreaEffectShapes` accepts it. The area applies `speedFactor` and `speedDurationTicks` at level 1, as it already does for dot/hot (`areaLevel = 1`). | One new switch arm and one validator line. |
| D4 | **A system-wide BEAT** (`areaBeatTicks = 10`, ~3 Hz): a stream is applied immediately on the first tick an entity has none from that source, then re-applied only on beat ticks. Staggered by entity id so beats spread across ticks. | Cuts the revision churn from 30/s to ~3/s per entity standing in an area, the same rate a speed aura already costs its allies. Entry stays instant (no up-to-333 ms dead zone stepping onto the road). Fixes E2's latent churn for lava and springs too. Needs a `Buffs.Has(source)` map lookup, no per-entity state. |
| D5 | **Path containment is a boot-time raster per effect-bearing path**, built FROM the path's collision corridors (`appendPathCorridors`, nil bridges, taper included). Cell size 0.25 u (the player collider radius). Bounds inflated by `Width/2` + tolerance. | O(1) per lookup, independent of how many points a road has. Collision and pace read one geometry, so a road never blocks or boosts somewhere the other disagrees. Memory: the longest road (72×23 u) is ~3.3 KB of bits. |
| D6 | **On-road = the entity's centre within `Width/2 + tolerance`**, tolerance = player collider radius (0.25 u): any part of the body on the road counts. | Roads are only 1–1.5 u wide (≤ 1 s to walk across at 1.5 u/s). Area-effects L1: art spills half a blend band outside the shape, the wrong direction for a boon (a player on the visible edge gets nothing and thinks it is broken). The tolerance meets the art halfway. Q4. |
| D7 | **Loop flipped to entity-outer**: dormancy (and flight, D8) checked once per entity, areas inner with an AABB prefilter. | Today's walk is areas-outer, so 12 roads would mean 12 `Dormant()` interface assertions per entity per tick. |
| D8 | **Flying entities are skipped.** | `flight.go:67` has its own speed site that ignores buffs, so a buff picked up mid-flight would only show as a surprise linger on landing. You are not on the road while flying. |
| D9 | Linger is the authored lifetime as applied, so with the beat the real linger after leaving is `speedDurationTicks − (0..beat)`: 80–90 ticks (2.7–3.0 s). | Indistinguishable at this length; adding the beat on top would be a second number to explain. |

Starting numbers (PO 2026-10-14, Q5, still [PLACEHOLDER]): **factor 1.15** (1.5 u/s → 1.725 u/s;
Swift is 1.5 at level 1), **linger 90 ticks (3 s)**, **beat 10 ticks**, **tolerance 0.25 u**, **cell 0.25 u**.

---

## 3. Performance (the headline concern)

### 3.1 Server tick

- **Today:** `AreaEffectSystem.Update` returns at once (no resolved areas). Roads turn it on
  for the whole world.
- **Proposed cost per tick:** for each registered entity, one dormancy check; awake
  non-flying ones do ~12 AABB compares (one per road path), and only those inside an
  inflated box do one bit lookup. With ~430 placed mobs (most dormant) plus players, that
  is a few thousand compares, a few µs. Measured, not argued, in R1 (§5).
- **What the raster protects:** a point-to-polyline test on a 30-point road is 30 distance
  computations per entity inside its box; with the raster it is one bit. Road count and
  road detail stop mattering; only the number of awake entities does.
- **Zero per-tick allocation**, pinned by a `sys/areaeffects_alloc_test.go` (the
  `*_alloc_test.go` family). `ApplySpeed` on refresh allocates nothing; a NEW stream
  allocates one `buffEntry` (existing behaviour, once per road visit).
- **Escape hatch if a future world has hundreds of effect paths:** one combined raster per
  zone (540×360 u at 0.25 u is ~390 KB) replaces the per-path box scan. Not built (YAGNI).

### 3.2 Wire

- **No schema change.** The tray already carries `EffectKindSpeed`.
- **Owner block:** with the beat, a player on a road resends it ~3 times a second (each
  send also builds `questMarkers`). Off-road: once on entry, once on expiry. The owner block
  is otherwise change-only with a 5 s heartbeat (`plan-server-performance.md` chunk 3), so
  this is the number to watch. Its byte size is unmeasured; R1 measures it.
- **If the measured cost is too high**, the next step is a "held" bit on `OwnEffect`
  (wire +1 field, client draws steady): the store stops aging a held stream, two resends
  per road visit instead of 3/s. Recorded, not proposed: it is a wire change and a buff-store
  concept for a cost nobody has measured yet. Q6.

### 3.3 Client

- Nothing new to render: the tray circle exists, movement is server-authoritative and Swift
  already proves a server speed change reads correctly on the client.
- The tray wedge on a road dips to ~89 % between beats (10 of 90 ticks) and refills, ~3 Hz.
  At tray size it should read as "full". A feel item for the in-game pass (Q5).

---

## 4. Chunks

### R1: the engine (Go only, content-inert)

1. Red first: path containment fixtures (diagonal, off-grid, a tapered `ends: point` road,
   a closed ring, a point just inside and just outside `Width/2 + tolerance`), the speed
   case applying `RoadPace`-shaped content, the beat (applied on entry tick, refreshed only
   on beats, revision bumps ≤ 1 per beat), flying skipped, dormant skipped.
2. `world`: per-path raster built at `CollectAreaEffects` time; `PlacedAreaEffect` gets a
   `Contains(x, y)` that is point-in-polygon for structures/atmospheres and the bit lookup
   for paths. Bounds inflated for paths.
3. `skills`: `Buffs.Has(source)`.
4. `sys/areaeffects.go`: entity-outer loop, dormancy + flight once, the beat, the
   `speed_burst` arm. Validator accepts `speed_burst`.
5. Alloc pin. Measure owner-block sends per road-walker (expect ~3/s) and its byte size;
   record both.

### R2: content + the in-game pass

1. `api/skills/road-pace.json` via the `add-content` skill (id, icon/glyph, comment says
   what is placeholder).
2. `effect: "RoadPace"` on the road paths in `api/zones/world.json` (in Tiled or the JSON;
   the `AuraEffect` dropdown lists every skill after `node tools/tiled/generate-palette.mjs`,
   and the dropdown wiring is a human check, area-effects E1). Plus one road in
   `api/zones/.debug/world_debug.json` (it already has one) so a harness venue exists.
3. Restart (a zone edit is half-live), `cmd/loadbot -profile` tickstats with several
   clients walking roads vs a control, then the PO walk (§5.3).

---

## 5. Test strategy

### 5.1 Go
Containment fixtures above (⛔ awkward geometry: no axis-aligned or 45° edges on whole
units, zone-polygons P3), beat behaviour, the validator accepting `speed_burst` and still
refusing an effect with nothing applicable, the alloc pin, and a guard that an
area-consumed dot's lifetime exceeds the beat (L1).

### 5.2 Measured numbers to record in the R1/R2 ledgers
- `AreaEffectSystem` share of the tick, before and after, via tickstats at 1× and with
  several clients on roads.
- Owner-block sends per second for a player walking a road, and the block's bytes.

### 5.3 The PO walk (feel)
Walk a long road, step off at a bend and cut the corner, zig-zag along the edge, fight a mob
on a road, cast Swift on a road, walk Cobblestone if Q2 includes it. Questions to answer:
does the speed-up read without looking at the tray, does the linger feel like momentum or
like a bug, does the edge feel fair.

---

## 6. Open questions for the PO

1. **A (area effect + speed buff, recommended) or B (terrain multiplier at the walk site)?**
   §1 has the trade. ⏸ **PO 2026-10-14: uncertain.** ⚑ The Q2 and Q3 rulings bear on it:
   per-road definition (Q2) is native to A (each path names its own skill, each skill carries
   its own factor and linger) and would need new per-path zone fields under B; players-only
   (Q3) removes A's "mobs for free" point and costs A a filter, which B gets for free.
2. ✅ **RULED 2026-10-14 (PO): per path, set up and defined individually.** No profile-wide
   rule; each path opts in by naming an effect, and different roads may name different
   skills (a highway and a footpath can differ in factor and linger). This is area-effects
   D2 (on the shape, never the profile) applied as-is. R2's content step becomes a list of
   paths with the skill each one names, for the PO to fill.
3. ✅ **RULED 2026-10-14 (PO): players only.** A deliberate exception to area-effects D11
   for this effect. Proposed rule (one rule, nothing authored): **the area system's
   `speed_burst` arm applies to players only**; dot/hot areas keep reaching mobs (D11
   untouched). Cheapest form: the speed arm checks a cached `isPlayer` bit stored on the
   `areaEntity` at `AddEntity`, so no per-tick type assertion. Bonus: awake mobs never
   reach the raster lookup for a speed-only area.
4. **Edge tolerance:** any part of the body on the road (centre within width/2 + 0.25 u,
   recommended), or the centre strictly on it? ⏸ **PO 2026-10-14: undecided, "probably any
   part of the body".** Built with the tolerance as one Go const, so the PO walk can settle it.
5. ✅ **RULED 2026-10-14 (PO): factor 1.15, linger 3 s as the starting point** (both
   [PLACEHOLDER], tuned at the walk), and **multiplies with Swift** under the existing rule
   (1.15 × 1.5 ≈ 1.73). No new combining code.
6. **Wire budget:** is ~3 owner-block resends/s per road-walker acceptable pending the R1
   measurement, with the "held" bit (§3.2) only if the number is bad? ⏸ **PO 2026-10-14:
   unsure yet.** R1 step 5's measurement (sends/s and bytes per send) is what this waits on;
   the beat stays a Go const so the rate is one number to move.
7. ✅ **RULED 2026-10-14 (PO): always**, in combat too. A road is just faster ground.
8. **A tell beyond the tray?** (Area-effects Q4 asked the same for hazards.) YAGNI default:
   the tray circle only.

---

## 7. Landmines

- **L1. The beat must be shorter than every area-consumed lifetime.** A stream that expires
  between beats while you stand in the area is re-applied as NEW, which restarts a dot's
  phase and breaks area-effects D6 (hop the edge → never burn). Validate at boot.
- **L2. Path bounds today are the centreline's box** (`BoundsOf(points)`); a player at a
  road's edge fails the prefilter. Inflate by `Width/2` + tolerance.
- **L3. `isSustained` (D2).** Authoring the road as a `speed_aura` doubles the visible
  linger on the tray. The category choice is load-bearing.
- **L4. Area effects key streams by skill**, so two overlapping roads with the same effect
  are one stream (area-effects D8): correct here (no double speed at a crossing).
- **L5. Half-live zone edit**, and the embedded copy: restart after the Tiled save; rebuild
  or `-content ../api` after the skill file; `frontend/dist` bundles `world.json`.
- **L6. The raster is built after `world.Place`** (placed coordinates), the existing
  `CollectAreaEffects` rule; zone-local points look correct on the overworld and are wrong
  everywhere else.

---

## 8. Schema impact

| Layer | Impact |
|---|---|
| DB | NONE |
| Wire | NONE (the tray already carries speed); owner-block send RATE changes, measured in R1 |
| Conf | NONE (the beat is a Go const; [PLACEHOLDER]) |
| Content | +1 skill file; `effect` on road paths |
| Zone format | NONE (the `effect` key exists since area-effects E1) |

## 9. Cross-references

`plan-area-effects.md` (E1/E2 mechanism, D2/D6/D8/D11, L1) · `plan-buff-tray.md`
(sustained rule, D15 owner-state gate) · `plan-server-performance.md` chunk 3 (the owner
block's change-only gate) · `plan-world-paths.md` / `paths_collision.go` (corridors, taper).

## 10. Chunk ledgers

(none yet)
