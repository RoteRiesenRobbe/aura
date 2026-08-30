# Plan: World scale — headroom to grow the one Space

**Status:** **M0 measured 2026-08-04** — the ceiling is **~3.5× today's area**,
**terrain culling is dead**, and the verdict is **S3 → S1 → S2 (deferred)**
(§11). ⭐ M0 also rewrote S3's wake volume as **D6**: derived from the AOI box,
not a hand-set radius — the first draft's "wake 40 units" would have left 91 %
of mobs awake and made the chunk pointless. ⭐ **S3 SHIPPED 2026-08-29** (§11):
mob cost is **area-linear → player-linear**, measured **61.5 ms → 5.7 ms per
tick at the 30× world (14 640 mobs), 10.8×**. **S1 and S2 not started.** Designed 2026-08-04,
rewritten the same day after an adversarial review killed one chunk and halved
another — see §10. Per-chunk ledger: §11.

⚑ This plan **removes ceilings**; it does not author world. The content question
("how big should the map be") belongs to `plan-test-world.md`, and its C0 is the
measurement rig this plan reuses rather than rebuilds.

## 0. Vocabulary — "map" means two things and this doc never lets it

The adversarial review's fatal finding came from conflating these, so the split is
stated first and used everywhere below:

- **the world** — the playable space. `Bounds`, 144 × 72 server units, the thing a
  character walks across.
- **the map panel** — the UI that *depicts* the world: today's docked minimap and
  the full-screen overlay (`features/mini-map/`).

⚑ **The codebase itself violates this.** `MapScale.ts`'s `mapWidth` is
`Welcome.mapWidth`, which is the **world's** width in px — a variable named "map"
that means the world, read by the module that draws the map panel. Don't rename it
(it matches the wire field), but never reason about it without saying which one
you mean. "The map gets worse as the world grows" is the exact sentence that was
wrong in the first draft of this plan, because it was true of one meaning and
false of the other.

## 1. What this is, and its inputs

The world is one zone file, `api/zones/world.json`, **144 × 72 units** (17 280 ×
8 640 px, ~43 AOI-screens, ~96 s wide on foot at 1.5 u/s). The question put to
this plan: how big can it get, and are multiple maps possible?

**The second half reframes the first.** Multiple *running* worlds don't exist, and
`architecture.md` §6 recommends against building them yet — grow one `phy.Space`,
split only when population forces it, and put the seam at the zone-1↔2 tunnel
where nobody can see across. So the whole question is "how big can one Space get".

Inputs: `architecture.md` §§3–6 · `plan-test-world.md` F3 + C0 ·
`plan-server-performance.md` · `plan-world-map.md` §10 (C1/C2 shipped).

## 2. What already exists (surveyed 2026-08-04, don't re-derive)

**Nothing in the engine caps world size.** The four things that look like caps are
not:

- `Bounds` is validated **only `> 0`** — `world/zone.go:22-27`, applied as one
  inverted AABB at `core/game.go:108`. `conf.json` carries a zone *stem*, not a size.
- Wire positions are **float32** (`common.fbs:3-6`, `codec/gamestate.go:17`, ×120
  px). At 17 280 px that is ~0.001 px precision — room for ~1000× growth. (The
  real `uint16` cap, `f32ToU16Px` at `codec/minions.go:10`, is on **radii** — 546
  units max for any single aura/light/burst radius. Unrelated to world size, but
  worth knowing before someone authors a world-spanning aura.)
- The broadphase is a **map-backed uniform spatial hash**, 10-unit cells, empty
  cells never allocate (`phy/space.go:20-73`). Cost is `Σ k_c²` — **density-bound.
  A bigger world at the same entity count is cheaper.**
- The network is **already AOI-gated**: `core/net.go:68-72` sends only entities
  overlapping the player's 20 × 12 sensor box. `architecture.md` §3 calls this the
  single most important scaling property in the codebase, and it makes send cost
  independent of world size.
- Persistence stores **no coordinates and no zone id** — `game.characters` has
  `home_campfire_id TEXT` and nothing spatial.

What is genuinely area-linear, after the review:

1. **Every mob costs twice, every tick, forever** — `sys/mob.go:88-124` runs
   `mob.Update` on every live mob, *and* `phy.Space.Update` (`space.go:62-80`)
   independently resets, re-bounds and re-inserts every mob's ~3 collision shapes
   whether or not its AI ran. This is `plan-test-world.md` **F3**, both halves of
   it, and it is the only thing that makes *server* CPU linear in world area.
2. **Every zone JSON is bundled into every client, twice** — `require.context` at
   `GroundTextureManager.ts:144-149` and independently at `ZoneEditor.ts:48-52`.
   Area-linear **and** zone-count-linear, which matters more (21+ zones planned).
3. **Fog of war degrades with area** — `MapFog.ts` bakes a 1024-texel (512 mobile)
   texture over the whole world, and its reveal stamp is a fixed **world** size
   (the 20 × 12 AOI), not a fixed screen size. At 144 units a stamp is ~142
   texels; at 1440 units it is ~14.
4. Minor: the border wall's deliberately double-size bbox
   (`phy/inv_aabb.go:108-120`) occupies `4 × area / 100` static cells at boot.
   Memory only, one time.

**Not on the list, and this is the review's main correction:** the map panel's
*terrain* texture does not degrade with world size (§10 A), and terrain sprite
culling has no evidence of costing anything today (§10 B).

## 3. Decisions (PO, 2026-08-04)

- **D1 — Always differentiate the world from the map panel.** §0. The conflation
  produced a whole chunk of wrong work; the vocabulary is now load-bearing.
- **D2 — Measure before building.** Culling is a measurement (M0.2) before it is a
  chunk, and the measurement is designed so a null result kills it cheaply.
- **D3 — Dormancy criteria are "pristine, and nothing player-controlled nearby".**
  A mob sleeps only at full health, with no threat, no status effects, no TTL and
  no charm. Anything that *expires* — summons, totems, companions, charmed mobs —
  is excluded from dormancy outright, because the world doesn't author it and it
  goes away on its own. ⭐ This is what makes dormancy *safe*: see §5 L1.
- **D4 — The wake distance is measured from any player-controlled actor**, not
  from players. Players, totems, summons, companions. States itself as: *a mob
  sleeps only when nothing a player controls is anywhere near it* — and it is what
  makes D5 legal.
- **D5 — A dormant mob leaves the physics space entirely.** Not just skipped AI —
  `RemoveShape` on sleep, `AddShape` on wake. Halving the fix was not worth the
  chunk. ⭐ M0 confirmed there is no cheaper alternative: `Space.Update`
  (`space.go:62-96`) rebuilds the whole grid every tick, so a "skip stationary
  shapes" shortcut cannot work — a shape that is not re-inserted becomes
  invisible to every query. Only leaving `s.shapes` drops a mob from all four
  per-shape loops.
- **D6 (PO, after M0) — The wake volume is the AOI box scaled, not a radius.**
  Wake `1.7 ×`, sleep `1.9 ×` [PLACEHOLDER; sleep retuned from 2.2 by the §11 tuning pass 2026-08-30]; the *volume* is derived from
  `constant.ViewPortWidth/Height` rather than authored in units. Replaces the
  first draft's "wake 40 / sleep 50", which M0's arithmetic showed would have
  left 91 % of mobs awake and made the chunk pointless (§4 S3, §11). ⚑ Awake mob
  count scales with the *square* of the margin, so every doubling costs 4 ×.
  ⭐ **CORRECTED by the §11 tuning pass 2026-08-30: the highest-leverage number
  is `sleepMargin`, not `wakeMargin`.** Hysteresis puts the steady state at the
  SLEEP box, so that one sets the awake population while the wake margin only
  buys warning time — and the wake margin's floor is
  `player.FlightViewportScale`, not 1.

## 4. Chunks

Order **M0 → S1 → S2 → S3**. M0 decides whether S1 and S2 are worth doing at
all; S3 is the headline and wants the others' noise out of the way first.

### M0 — Measure (no production code)

Two experiments. Both are cheap and both can return "stop".

**M0.1 — The server ceiling.** Reuse `plan-test-world.md` **C0** verbatim rather
than building a second rig: density-matched probe zones at 1×/2×/3×/4×/6×,
`./aurad -content <scratch> -zone probe-N -profile localhost:6060`, `/tickstats`
idle, then `go run ./cmd/loadbot -disperse -steps 10 -hold 40s` and read again.
Break signal: tick p95 over ~16.5 ms (half the 33 ms budget) at 10 dispersed
players.

⚑ **Its L4 is restated loudly here:** probes live in a **scratchpad copy of
`api/`**, never in `api/zones/` — that directory is bundled into the frontend, so
a measuring stick dropped there ships to every player. Until S1 lands this is a
live footgun.

**M0.2 — Does terrain rendering cost anything?** Don't measure culling; measure
its **upper bound**. Set the terrain container's `visible = false` at runtime and
read the frame-time delta. That is strictly *more* than perfect culling could ever
save, because it removes 100 % of terrain cost rather than the off-screen
fraction. The pieces exist: `terrainTexturesLayer` is the container
(`GroundTextureManager.ts:12`) and the `?develop` panel already samples FPS
(`Fps.ts:13` → `Develop.logFPS`).

Run it on desktop **and on a real phone** — the phone is the platform at its
render ceiling, so if it shows up anywhere it shows up there. Then repeat against
a 4× probe (~2 100 pieces) to find where the curve turns.

**If M0.2 returns ~0 ms, terrain culling is dead** and no implementation rescues
it. Record the number either way; the threshold is the deliverable.

### S1 — Stop bundling every zone into every client

Switch both contexts to webpack's **lazy** mode —
`require.context('../../../../../api/zones', false, /\.json$/, 'lazy')` — so
`keys()` stays synchronous but `zonesContext(key)` returns a Promise and each zone
becomes its own emitted chunk. No backend route, no asset-serving change, no new
dependency.

- Add `ensureZoneLoaded(zoneName): Promise<void>` beside `getZoneData` in
  `GroundTextureManager.ts`, populating the existing `zonesByStem` cache.
- **`getZoneData()` keeps its synchronous signature and its `undefined` degrade.**
  Its three consumers — `DarknessOverlay.ts:96,123`, `MapCampfires.ts:64`,
  `MapTerrain.ts:64` — are all downstream of one seam and need no change.
- Await `ensureZoneLoaded` at that seam: `Game.ts:483-484`, before both `loadZone`
  calls and before the map panel bakes.
- `ZoneEditor.ts` shares the lazy context and awaits on open (`?develop`-only).

**Honest accounting of the win** (the first draft oversold this): only the
*unselected* zones are truly saved — 511 KB of `legacy: true` proving-grounds
today. The active zone's 272 KB is **converted from bundle size into a network
round-trip on the critical path**, ahead of terrain, darkness, campfires and the
bake. The real argument is that the cost **stops growing with zone count**, which
is what matters at `content-world.md`'s planned 21+.

### S2 — Fog of war sizing

The one map-panel cost that is genuinely area-linear (§2.3), because the reveal
stamp is world-sized rather than screen-sized. Make `fogWidth()` in `MapFog.ts`
derived rather than constant, so the stamp keeps a usable texel count as the world
grows, with a cap that respects the mobile budget.

⚑ **Do not touch `MapTerrain.ts`'s `bakeWidth()`.** §10 A: it does not degrade
with world size, and 2048 is already ~1:1 with the panel's on-screen width at any
world size. Raising it is a 4K-display question, not a world-size question, and it
belongs to `plan-world-map.md` if anywhere.

⚑ `MapTerrain.ts:4-15`'s standing warning still applies to the whole module: the
bake happens **once** and must never re-rasterise.

### S3 — Mob dormancy (the headline; lifts both halves of F3)

A mob that nothing player-controlled is near stops thinking **and** stops existing
in the physics space.

**Sleep criteria (D3)** — all must hold:
- owned by an authored spawn point (`liveMobID` links to a `spawnPoint`)
- `health == maxHealth`
- no threat / idle mode
- no status effects
- `ttlTicks == 0` and not charmed

**Wake source (D4):** any player-controlled actor within the wake volume —
players, totems, summons, companions.

**Wake volume (D6, rewritten after M0):** the **AOI box, scaled** — *not* a
radius. Wake at **1.7 × AOI** (34 × 20 u), sleep at **2.2 × AOI** (44 × 26 u);
both margins are dimensionless and [PLACEHOLDER]-tunable, the volume itself is
derived:

```go
hx := constant.ViewPortWidth  / 2 * wakeMargin   // conf: game.mobs.wakeMargin
hy := constant.ViewPortHeight / 2 * wakeMargin
awake := abs(dx) <= hx && abs(dy) <= hy          // no sqrt, two compares
```

⭐ **The first draft's "wake at 40 units, sleep at 50" would have made this whole
chunk pointless** — see §11's M0 verdict. A circle of r = 40 covers 5 027 sq u,
**21 × the 20 × 12 AOI box**, which leaves 91 % of mobs awake at 20 dispersed
players and caps the server at ~7 dispersed players in a large world. Three
things are wrong with it and the derived form fixes all three:

- **Geometry.** The AOI is already a box (`phy.NewBox`, `player.go:51`), so a
  circle was never the natural shape. A box of the same linear margin covers
  ~45 % less area and needs no `sqrt` on a per-mob-per-tick test.
- **Size.** 1.7 × AOI wakes **32 mobs per player** against 235 for r = 40 —
  same safety, 7 × less work (§11's table).
- **Derivation.** "40 units" cannot be checked against anything; a margin can.
  `constant.ViewPortWidth/Height` are **already pinned to
  `api/shared-constants.json`** (`cmd/aurad/shared_constants_test.go:163-166`),
  so the wake volume inherits that cross-language guarantee for free and moves
  automatically if the viewport ever does.

Safety margin at 1.7 ×, measured past the **widest view a player can obtain**
(18 × 9.5 u — `Zoom.ts` caps it there deliberately, see L8): **8.0 u
horizontally, 5.4 u vertically**, i.e. 5.3 s / 3.6 s of warning at 1.5 u/s.
Hysteresis band 5 × 3 u — a player must pace ~2–3 s to thrash sleep/wake.

**On sleep (D5):** `phy.Space.RemoveShape` for the mob's shapes
(`space.go:326`); on wake, `AddShape` (`space.go:299`). Both operate on a map, so
it is cheap. This is what makes the chunk worth doing — skipping `mob.Update`
alone leaves `Space.Update` walking every shape every tick regardless.

**Do not touch** the respawn sweep or `onMobDeath` (`sys/mob.go:117-138`): they are
tick-timer driven and must keep running for dormant regions. Their linear scans
over `n.points` are cheap at 485 and correct at 5 000 — revisit only if M0.1 says
otherwise (YAGNI). Keep the deferred-removal comment at `sys/mob.go:99-102`
intact; dead-mob collection must not fold into the gate (backlog §27.1).

**The dependency to solve first:** `MobSystem` holds `{mobs, game, rnd, points,
space}` and `model.Game` (`model/game.go:13-52`) exposes **no player accessor**.
Collecting player-controlled positions once per `Update` needs either a new
accessor on that interface or a different source; decide it explicitly rather than
widening a core interface by reflex.

## 5. Landmines

- **L1 — Three bugs D3 silently closes; don't lose the reasoning.**
  `Mob.Update` (`model/mob/mob.go:913-937`) opens with the **death check**, then
  the **TTL countdown**, then **charm expiry** — none of which is AI. A naive
  "skip idle mobs" gate breaks all three (the death-check comment names the old
  zombie bug it guards). D3 closes them structurally: full health means a dormant
  mob cannot be at 0 HP, and everything with a TTL or a charm is excluded outright.
  ⚑ If anyone ever relaxes a D3 criterion, these three come back.
- **L2 — D5 makes a mob invisible to every space query, which is why D4 exists.**
  Out of the space means not found by the AOI viewport (harmless *by
  construction* under D6 — the wake volume strictly contains the AOI, so a mob
  is awake before it can be streamed) **and not found by auras**. Without D4, a
  totem planted outside its owner's wake volume would tick beside a sleeping mob
  and pass right through it. D4 is not a nicety; it is what makes D5 legal.
  ⚑ D6 sharpens the first half but not the second: containment is what removes
  the *rendering* risk, and only D4 removes the *aura* risk.
- **L3 — Dormant mobs don't regen.** A player can chip a mob and leave, and it
  stays damaged instead of healing back. Marginal (it wakes on damage, so it regens
  the moment anyone returns) but it is a *gameplay* change riding inside a perf
  chunk — flag it to the PO rather than let it be discovered.
- **L4 — A probe zone in `api/zones/` ships to every player.**
  `plan-test-world.md` L4, restated because this plan's §2.2 is exactly why.
- **L5 — The unknown-zone degrade must survive S1.** The
  `console.warn("No bundled zone data…")` path (`GroundTextureManager.ts:169`)
  fires today on a missing key; after the change a rejected dynamic import must
  produce the same warn-and-render-nothing, not a hang or an unhandled rejection.
- **L6 — S3 changes simulation, so the sim battery will move.** If it does not come
  out byte-identical, that is a finding to explain (which scenario has a mob
  outside the sleep volume of every bot?), not to wave through.
  `plan-pre-accounts-hygiene.md` §11 pins the four battery commands.
- **L7 — A dormant patrol must not teleport on wake.** Patrol routes and steering
  carry accumulated state. D3 does not exclude patrollers, so either freeze-and-
  resume must be proven correct mid-leg, or patrollers join the exclusion list.
  **Decide this in the chunk, with a test.**
- **L8 — The wake volume and the viewport are coupled, so DERIVE it rather than
  pin it.** The original form of this landmine ("if the radius ever drops below
  `ViewPortWidth`, mobs pop into existence on screen — pin it with a guardrail
  assert") described a hand-checked relationship between two independent
  numbers. D6 makes the wake volume a *multiple* of the AOI, which collapses the
  guardrail (`cmd/simharness/guardrail_test.go`) to two invariants that cannot
  drift: **`wakeMargin > 1`** (the wake volume strictly contains the AOI) and
  **`sleepMargin > wakeMargin`** (hysteresis is a band, not an inversion).
  ⚑ **Zoom does not enter this.** `camera/logic/Zoom.ts` is a *fixed* field of
  view — three levels, `[6, 7.6, 9.5]` m of world height — hard-capped by
  `MAX_VISIBLE_WIDTH = 18 m` for the stated reason that beyond it "entities
  visibly pop in/out" of the server's 20 m stream. So the widest obtainable view
  is 18 × 9.5 u, strictly inside the 20 × 12 AOI, and anything that contains the
  AOI contains every zoom level by construction. ⚑ But both zoom values are
  `[PLACEHOLDER]` and `MAX_VISIBLE_WIDTH` sits only **2 m** under
  `ViewPortWidth`: a fourth, wider zoom level would eat that margin and silently
  invalidate the wake volume at the same moment. Deriving from the AOI is what
  keeps those two facts to *one* number to check.

## 6. Relationship to the three neighbouring plans

- **`plan-test-world.md`** owns M0.1 (its C0) and states **F3**. Its **D2 accepts**
  the mob cap and sizes the world to 50–60 % of it; **S3 removes the cap**, which
  moves that plan's expected 3–4× landing zone upward. Run C0 first either way —
  the before/after ratio is the headline number.
- **`plan-world-map.md`** owns `MapTerrain.ts` / `MapFog.ts` / `MapScale.ts` (C1
  `f09d99d0`, C2 `6c0888ff` shipped; C3 open). S2 is a follow-up in its territory,
  cross-referenced from its §9 rather than forked. ⚑ The README's index line still
  calls it "not started" — stale, worth a one-line fix.
- **`plan-server-performance.md`** owns the tick budget (chunk 0 built and
  uncommitted; 1–5 not started, headed by the O(players × entities) encode
  sharing). **S3 is naturally a chunk of that plan** and is filed here only because
  the motivation is area rather than player count. Land it under whichever plan is
  executing — but **not concurrently with that plan's chunk 1**, since both change
  what the tick spends its time on and interleaving makes the measurement
  unreadable.

## 7. Schema impact

**None.** No table, column, or persisted value is touched. Position and zone are
not persisted at all — `game.characters` carries `home_campfire_id TEXT` and no
coordinates. Recorded per CLAUDE.md's standing rule that every change states this
even when the answer is "no change".

⚑ Noted but **out of scope**: `character_campfires.campfire_id` is a bare TEXT
column, while `Campfire.ID` is validated **zone-wide, not globally**. Two zones
could each mint `spawnpoint-1` and collide silently. Harmless while one zone runs;
cheap to prevent now, expensive to untangle after multi-zone. Belongs to whichever
plan first runs two zones — filed here so it is not lost.

## 8. Test strategy

**Backend** — `go build ./...`; `go test -timeout 60s ./...` with
`AURA_TEST_DB_URL` set (green without Postgres is not a pass); `make -C backend
build` (or `-dev` keeps running stale code). S3 is non-trivial game logic, so per
CLAUDE.md the tests come **first**, in `backend/pkg/aura/sys`:

1. A pristine mob far from everything does not tick **and is not in the space**.
2. A damaged mob far from everything **still ticks** (it must regen — L3).
3. A mob with a status effect far from everything still ticks (the poison case).
4. A mob with threat far from everything still ticks — chase/leash must not freeze.
5. A summon/totem/charmed mob is **never** dormant, and its TTL and charm still expire.
6. A dormant mob wakes for a **totem**, not only for a player (D4/L2).
7. Hysteresis: crossing into the wake volume wakes; drifting back into the band
   between wake and sleep does **not** re-sleep.
8. Respawn timers still fire for a spawn point with no player nearby.
9. A dormant mob rejoins the space on wake and is immediately aura-hittable.
10. **D6 containment:** a mob anywhere inside the AOI box is awake — asserted
    against `constant.ViewPortWidth/Height` rather than a literal, so the test
    still holds if the viewport moves.

Plus the L8 guardrail asserts (`wakeMargin > 1`, `sleepMargin > wakeMargin`) and
the four-command sim battery for L6.

**Frontend** — `npm run typecheck`, `npm test`, `npm run build` with the bundle
size compared against M0's baseline.

**In-game** (`playtest` for the manual pass, `verify` for headless) — boot with
`-content ../api`, join at
`http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game`, **0 errors 0
warnings** in the boot log, then:

- S1: terrain, darkness and campfire markers all still appear; the first frame
  after `Welcome` must not race the zone fetch.
- S2: fog reveal still stamps at a sane size; mobile pass required per
  `plan-world-map.md` §7.
- S3: mobs at a spawn cluster behave unchanged; walk away and back and confirm they
  are alive, sanely positioned, and re-engage. Pull a mob, run past the sleep
  volume, and confirm it **leashes** rather than freezing mid-chase. Plant a
  totem, walk away, and confirm it still damages what's next to it (L2).
  ⚑ **Walk in at every zoom level** — D6/L8 argue containment from `Zoom.ts`'s
  fixed FOV, so the in-game pass is where that argument is actually checked. No
  mob may fade in on screen at max zoom-out.

**The headline number** — re-run M0.1's probe ladder after S3 and state the new
break point beside the old one. That before/after is the answer to "how big can we
get", and it belongs in §11.

## 9. Open / [PLACEHOLDER]

- ~~**Wake 40 / sleep 50 units**~~ — **RESOLVED by D6 after M0**: the wake volume
  is the AOI box scaled, wake `1.7 ×` / sleep `2.2 ×`. The two *margins* stay
  [PLACEHOLDER] and TUNING-OPEN (`conf.game.mobs.wakeMargin` / `sleepMargin`);
  the geometry no longer is. Retune them during §8's post-S3 ladder re-run,
  which is where their cost shows up directly. ⚑ M0.1 could **not** confirm
  "nothing observable changes at that distance", as this line originally hoped —
  dormancy does not exist yet to be observed. That confirmation is an S3 in-game
  item, not an M0 one.
- ⭐ **NEW PO CALL — authored mob density is a free lever, and it competes with
  S3.** M0 measured cost as linear in **mob count**; area only matters through
  it. `world.json` runs **46.8 spawns / 1 000 sq u**, and
  `plan-test-world.md` D-none matches that density because "it is the ask" — a
  ruling made *before* anyone had a ceiling number. Halving density doubles the
  area ceiling for **zero engineering**. This is not an argument against S3
  (which changes the cost's *shape*, not just its constant); it is a dial that
  should be ruled on explicitly rather than inherited, because it is the
  cheapest area anyone will ever buy.
- **Where the player-controlled-actor list comes from** — §4 S3's dependency. A new
  `model.Game` accessor is the obvious move and therefore the one to justify rather
  than assume.
- **Patrollers: dormant or excluded?** L7. Needs a decision plus a test.
- **Fog texel target** — [PLACEHOLDER]; a legibility judgement on the real world,
  not a number to settle from code.
- **Where S3 lands** — this plan or `plan-server-performance.md`. Either; not
  concurrent with that plan's chunk 1.
- **How big we actually build** — deliberately not answered here. This plan raises
  the ceiling; `plan-test-world.md` D2 chooses the number under it.

## 10. Adversarial review (2026-08-04) — what the first draft got wrong

Kept because the reasoning is reusable, and because two of these are traps anyone
re-reading the code would fall into again.

**A — The map panel's terrain texture does NOT degrade with world size. Chunk cut.**
The first draft argued from "texels per world unit" (14 today, 1.4 at 10×) and
proposed raising `bakeWidth()` to 4096. Wrong metric. The full-screen panel fits
**both** axes into the viewport (`MapScale.ts:53-58`, `min(w/mapW, h/mapH)`), so it
draws at ~1920 px wide on a 1920 viewport **at any world size**. The quality metric
is texels per *displayed pixel*, and 2048 vs ~1920 is already ~1:1 and stays there.
`MapTerrain.ts:33-38` says so in its own words — *"an upper bound on quality, not a
target"* — and the draft read past it. What actually degrades is **legibility**
(each unit gets fewer screen pixels), whose fix is zoom/pan on the panel, not a
bigger texture. ⭐ The root cause was the §0 conflation: true of the world, false of
the map panel. Fog survived the cut for a reason the draft hadn't stated — its
stamp is world-sized, not screen-sized.

**B — Terrain sprite culling had no evidence and may be a regression. Demoted to
M0.2.** Pixi is `^8.1.5`; static sprites over shared preloaded textures don't
recompute transforms and batch into few draw calls. Culling *adds* a per-child
bounds test every frame to save draws that may already be free. 537 pieces is
probably below the threshold where it pays. The draft listed it as constraint #2
with no measurement behind it.

**C — Dormancy was under-designed and had three latent bugs.** The draft's gate
("idle and no threat") would have broken the death check, TTL expiry and charm
expiry, all of which live at the top of `Mob.Update` and none of which is AI. The
PO's criteria (D3) close all three structurally rather than by enumeration.

**D — Dormancy fixed only half of F3.** The draft skipped `mob.Update` but left
every dormant mob's shapes in `Space.Update`'s per-tick walk. D5 fixes the other
half; D4 is what makes D5 safe.

**E — S1's win was oversold.** "Saves 780 KB" ignored that the active zone still
has to arrive, now as latency on the critical path. Restated honestly in §4.

## 11. Chunk ledger

### M0 — Measure ✅ 2026-08-04 (no production code, no schema impact)

**Headline: the single-`Space` ceiling is ~3.5× today's area, and terrain
culling is dead.** Both experiments returned a usable number; one of them
returned "stop", which is what §3 D2 designed it to be able to do.

#### M0.1 — the server ceiling

Method deviation, deliberate: `plan-test-world.md` C1's `zonegen` does not exist
yet, so probes are **tiled copies of `world.json`** (1×1, 2×1, 3×1, 2×2, 3×2)
rather than generated. Tiling holds density, species mix, prop mix and terrain
count per unit area *exactly* constant instead of statistically — a stronger
guarantee than the generator would give, at ~40 lines. Counts land on that
plan's own 4× estimate to the unit (1 940 spawns / 3 108 props). Generator:
`scripts/probegen.mjs`, kept because §8 requires re-running this ladder after S3.

Rig: `aurad -dev -content <scratch> -zone probe-N -profile localhost:6060`,
`/tickstats?reset` → 30 s idle read, then `loadbot -disperse -steps 10 -hold
40s`. Probes lived only in a scratchpad copy of `api/` (L4); `git status`
confirmed clean afterwards.

| probe | bounds (u) | spawns | props | idle p50 / p95 | 10 bots p50 / p95 | util |
| --- | --- | --- | --- | --- | --- | --- |
| 1× | 144 × 72 | 485 | 777 | 2.50 / 3.52 ms | 3.50 / **5.00** ms | 15.1 % |
| 2× | 288 × 72 | 970 | 1 554 | 5.50 / 7.50 ms | 7.00 / **9.50** ms | 28.8 % |
| 3× | 432 × 72 | 1 455 | 2 331 | 8.51 / 13.00 ms | 9.50 / **12.50** ms | 37.9 % |
| 4× | 288 × 144 | 1 940 | 3 108 | 11.50 / 16.00 ms | 13.01 / **20.00** ms | 60.6 % |
| 6× | 432 × 144 | 2 910 | 4 662 | 17.50 / 25.51 ms | 21.50 / **31.00** ms | 93.9 % |

- **Break signal (p95 > 16.5 ms at 10 dispersed players) falls between 3× and
  4×.** Linear interpolation puts it at **~3.5×**. Largest probe comfortably
  under: **3×**.
- **Cost is dead linear in area — no bend anywhere on the ladder.** Loaded p50
  rises 3.50 → 7.00 → 9.50 → 13.01 → 21.50 ms, i.e. ~3.4 ms of tick per 1× of
  world. §2's claim that F3 is the *only* area-linear server cost is confirmed:
  nothing else showed up, and the broadphase (density-bound) contributed nothing
  measurable.
- ⭐ **The players barely matter.** At every rung, 10 dispersed players add ~1–4 ms
  on top of idle, while the world itself accounts for the rest. At 4× the world
  costs **p95 16.0 ms with nobody playing at all** — the half-budget is gone
  before a single player connects. That is F3 stated as a number, and it is the
  whole argument for S3.
- ⚑ **This moves `plan-test-world.md` D2's landing zone DOWN, not up.** That plan
  expects 3–4× and sizes the real map to 50–60 % of the measured ceiling. 50–60 %
  of ~3.5× is **~1.8–2.1×**, i.e. roughly 200 × 100 to 210 × 105 units — *below*
  its own expected range, before any headroom for summons, totems and
  companions. **S3 is what buys that range back**, which reverses §6's framing:
  S3 is not an optional follow-up to the size ruling, it is a precondition for
  the size the content plan already assumes.
- Caveat, per C0 step 4: this is the dev box (RTX 5070 Ti / desktop CPU), **not
  the 2-vCPU live box**. The ratios transfer; the absolute milliseconds do not.

⚑ **Landmine found, not in any plan doc: a non-`-dev` local boot hangs the ramp
silently.** `devops/loadtest.md` documents `-name-prefix` as a *live* concern —
it bites a local boot identically. Without `-dev` the reserved `hrnss_` prefix is
not grantable, every bot's `POST /api/characters` is refused 400, and `loadbot`
never gets a socket up. It does not error: it sits there. Cost ~15 minutes of
"is the server broken". Boot the ladder with `-dev`, or pass `-name-prefix`.

#### M0.2 — does terrain rendering cost anything? **No. Culling is dead.**

Two corrections to §4's stated method, both required to get a real number:

- ⚑ **`terrainTexturesLayer` is not reachable the way §4 assumes.** `window.game`
  is a curated console object (`BrowserConsole.ts`: `{run, character, pause,
  play, miniMap}`) with no `layers`. The harness walks up from
  `game.character.plate` to the stage and finds the container `Game.ts` labels
  `'textures'` (`CustomData.createNamedContainer` sets `.label`).
- ⚑ **vsync must be off.** At 60 Hz every frame reads ~16.7 ms regardless of what
  it drew, which would report "terrain is free" as a *false negative* — the one
  outcome this experiment must not manufacture. Chromium launched with
  `--disable-gpu-vsync --disable-frame-rate-limit`; frames then run ~1 ms.

The 4×/16×/64× rungs are synthesised by **cloning terrain sprites in-browser**
into a grid, not by bundling a probe zone — same sprite count, same textures,
and it keeps a measuring stick out of `api/zones/` entirely (L4).

⚑ **The first two passes were not reportable and were thrown away**: point-estimate
deltas flipped sign between rungs (+0.77 ms at 8 592 sprites, −0.02 ms at
34 368), which means the effect is smaller than the run-to-run noise. A null from
an instrument that cannot detect a positive proves nothing. Third pass — six
paired A/B measurements per rung, 400 frames each, reported with spread:

| terrain sprites | frame time, terrain ON | Δ (ON − OFF), mean ± sd |
| --- | --- | --- |
| 537 (**the live world**) | 1.087 ms | **+0.020 ± 0.034 ms** |
| 2 148 (4× probe equivalent) | 1.125 ms | +0.183 ± 0.390 ms |
| 8 592 (16×) | 0.864 ms | −0.018 ± 0.193 ms |
| 34 368 (64×) | 0.934 ms | −0.092 ± 0.148 ms |

- **At today's 537 pieces the upper bound on what perfect culling could save is
  under 0.1 ms/frame** — and the measured delta is +0.020 ms against a ±0.034 ms
  noise floor, i.e. indistinguishable from zero.
- ⭐ **The ON column is the load-bearing series, and it is FLAT: 1.087 → 1.125 →
  0.864 → 0.934 ms across a 64× range in sprite count.** Nothing is being spent
  per sprite, so culling has nothing to remove. Every delta past 537 straddles
  zero with a spread wider than its own mean. §10 B's suspicion is confirmed
  outright, and its stronger form holds too: culling would *add* a per-child
  bounds test to save draws that are already free.
- **Verdict: terrain culling is dead at any world size this plan contemplates.**
  No implementation rescues it. Do not revisit without a *new* measurement
  showing a positive.
- ⚑ **The phone half is NOT done** — §4 requires it, and the phone is the platform
  at its render ceiling. Desktop returns a hard null at 64× the piece count, so
  the prior against culling is strong, but the mobile fill-rate story is
  genuinely different and unmeasured. Folds naturally into the mobile real-device
  pass `plan-world-map.md` §7 already owes.

#### Baselines recorded for later chunks

- **S1 bundle baseline** (`npm run build`, prod, 2026-08-04): entrypoint
  **2.94 MiB** — `main.js` 1 529.7 KB · `vendors.js` 1 387.1 KB · `main.css`
  89.3 KB · `runtime.js` 2.6 KB. Zone JSON in the bundle: `world.json` 265.7 KB
  (active) + `proving-grounds.json` 498.9 KB (`legacy: true`, never selected) =
  **764.6 KB**, ~25 % of the entrypoint. §4 S1's honest accounting holds: only
  the 498.9 KB is a true saving; the 265.7 KB converts to a round-trip.
- **Verification run at M0:** `go build ./...` clean · frontend `npm run build`
  clean (3 pre-existing webpack size warnings) · boot 0 errors on all five probes
  and on `world` · `harnessdb -cleanup` run between every rung and at the end
  (bot character names are globally unique and persist).

#### ⭐ The verdict — is the rest worth doing, and in what order

M0's job was to decide this. **S3 yes, S1 yes, S2 defer** — but the ranking only
came out that way after the wake volume was re-derived, and the analysis that
produced D6 is the most reusable thing in this ledger.

**The wake volume is worth more than everything else in the plan combined.**
Awake mob count scales with the **square** of the margin, so this one number
dominates S3's entire value. Against the measured ~1 700-awake-mob budget, at
`world.json`'s density of 0.0468 mobs/sq u:

| wake volume | area / player | mobs woken / player | dispersed players before break |
| --- | --- | --- | --- |
| 1.5 × AOI (30 × 18 u) | 540 sq u | 25 | **67** |
| **1.7 × AOI (34 × 20 u)** | **694 sq u** | **32** | **52** |
| 2.0 × AOI (40 × 24 u) | 960 sq u | 45 | 38 |
| ~~circle r = 40~~ (first draft) | 5 027 sq u | 235 | **7** |

Awake fraction, uniform/dispersed players (pessimistic — real players cluster
and share wake boxes, so these are floors):

| world | 1.7 × AOI @ 10 / 20 / 40 players | ~~r = 40 circle~~ @ 20 players |
| --- | --- | --- |
| 2× | 27 % / 46 % / 73 % | 96 % |
| 3× | 18 % / **35 %** / 53 % | **91 %** |
| 4× | 14 % / 28 % / 46 % | 87 % |
| 6× | 10 % / 18 % / 36 % | 76 % |
| 10× | 6 % / 12 % / 22 % | — |

⚑ **At the first draft's r = 40 the chunk was not worth building**: 9 % saved at
20 players, in exchange for D3's four criteria, D5's space surgery and five
landmines (L1, L2, L3, L7, L8). Worse, it would have converted an area ceiling
into a **~7-dispersed-player ceiling** — a regression on the axis that actually
matters. D6 turns the same chunk into a 7 × reduction at identical safety.

**1 — S3, mob dormancy. Do it; highest impact by a wide margin.** The only chunk
that touches the ceiling, and the only one that changes the *shape* of the cost
rather than its constant: area-linear → **player-linear at ~32 mobs/player**.
World size becomes nearly free, and the binding constraint moves to population
(~52 dispersed against today's budget; far more clustered), which is
`plan-server-performance.md`'s territory — a clean handoff. ⚑ M0.1 also showed
S3 is a **precondition, not a follow-up**: 50–60 % of the measured ~3.5 × is
~2 ×, below `plan-test-world.md` D2's own 3–4 × expectation.

**2 — S1, stop bundling every zone. Do it; independent of everything else.** It
does not touch the ceiling, so it is not a scaling chunk — but it is the only
cost that grows with the **content** plan. Zone JSON is already **764.6 KB, 25 %
of the 2.94 MiB entrypoint at two zones**; `content-world.md` plans 21+, which
is ~5.7 MB on the current trajectory. Cheap (webpack `'lazy'` + one await seam),
and it retires the L4 footgun permanently — which M0 spent a whole chunk
tiptoeing around, twice (§11 M0.1's scratch copy, M0.2's in-browser cloning).

**3 — S2, fog sizing. Defer into `plan-world-map.md`'s mobile pass; do not run
it as its own chunk.** Real but cosmetic: the stamp goes 142 → 47 texels at 3×
desktop (71 → 24 mobile) — degraded, not broken — and it only bites at sizes S3
has to unlock first. It is already in that plan's territory per §6, and M0.2's
outstanding phone half belongs to the same pass.

**Not a chunk, but ranked here because it competes:** authored mob **density** is
a content dial that buys area at zero engineering cost. Filed as a PO call in §9.

#### What M0 answers in §9, and what it does not

- **Answered — "how big can one Space get":** ~3.5× today's area *before* S3,
  measured. The before/after ratio §8 asks for now has its "before".
- **Answered, unexpectedly — the wake volume.** Not by the probes but by
  arithmetic the probes made possible: the ~1 700-mob budget is what turns a
  wake volume into a player ceiling. Resolved as **D6** (derived from the AOI);
  only the two margins remain [PLACEHOLDER].
- **Answered — no cheaper alternative to D5.** `Space.Update` rebuilds the grid
  wholesale, so nothing short of leaving `s.shapes` helps.
- **Unchanged:** the `model.Game` player-accessor question, the patroller
  ruling (L7), and the fog texel target — all still open, all still S2/S3's.
- **New:** the mob-density PO call (§9), and M0.2's phone half (folded into
  `plan-world-map.md` §7's mobile pass).

### S3 — Mob dormancy ✅ SHIPPED 2026-08-29 (schema impact: NONE)

**Headline: the cost changed SHAPE. Area-linear → player-linear, at ~50 awake
mobs per player.** Measured in-process over MobSystem.Update + Space.Update —
both halves of F3 — with 10 dispersed players (`mob_dormancy_bench_test.go`,
kept, since §8 asks for this number):

| mobs (≈ world size) | dormancy OFF | dormancy ON | ratio |
| --- | --- | --- | --- |
| 500 (≈ 1×) | 0.97 ms | 0.61 ms | 1.6× |
| 5 000 (≈ 10×) | 14.38 ms | 2.12 ms | 6.8× |
| **14 640 — the PO's tiled 30× world, exactly** | **61.5 ± 2.0 ms** | **5.7 ± 0.4 ms** | **10.8×** |

⚑ **The 30× row is 5 repeats at `-benchtime 100x`; the two smaller rows are
single runs and are indicative only.** Repeats matter here: a single short run
(`-benchtime 60x`) of the same 14 640-mob workload read **32.6 ms** for the OFF
arm, roughly half the settled value, because the mobs are still spreading out
from their spawn scatter and have not yet reached the clustering the broadphase
actually pays for. **Read the RATIO, not the milliseconds** — the absolutes are
this dev box's (Ryzen 5 3600), exactly as M0.1's were, and the live 2-vCPU box
will differ.

The OFF column is dead linear in mob count, exactly as M0.1's ladder was
(30× the mobs, 56× the cost). The ON column grows ~8× across the same 30×,
and what remains is the sleep/wake *evaluation*, which is O(mobs × sources) by
construction — staggered across `dormancyCheckInterval` ticks to divide it.

⭐ **At the 30× world this is the difference between unplayable and comfortable:**
61.5 ms is **186 % of the whole 33 ms tick budget spent on mobs alone** — before
a single skill, snapshot or socket — i.e. the server cannot hold 30 Hz at that
size even with nobody connected. 5.7 ms is **17 %**, which leaves the rest of
the tick its budget back.

Awake population at that world size, which is the mechanism behind the number:

| dispersed players | awake mobs | % of 14 640 | per player |
| --- | --- | --- | --- |
| 1 | 60 | 0.41 % | 60 |
| 5 | 280 | 1.91 % | 56 |
| 10 | 495 | 3.38 % | 50 |
| 20 | 1 001 | 6.84 % | 50 |

#### ⚑ D6's awake-count arithmetic was understated — the steady state sits at the SLEEP box

M0's §11 table priced the wake volume off `wakeMargin` (1.7 × ⇒ 34 × 20 u ⇒
**32 mobs/player**). Measured, it is **~50 mobs/player** — 47–60 across both
censuses (the 14 640 table above, and 1 / 10 / 40 players over 15 000 mobs at
0.4 % / 3.3 % / 12.6 % awake). It trends DOWN as players are added, because
dispersed players start sharing wake boxes.

The table was reading the wrong box. Hysteresis means a woken mob does not
sleep again until it leaves the **sleep** box, so the steady-state awake set is
bounded by `sleepMargin`, not `wakeMargin`: 44 × 26 u × 0.0468 = **53.5**,
which is what the measurement shows. The wake box only decides where a mob
*starts* being awake.

**Consequences for tuning, not for the design:** M0's "~52 dispersed players
before break" should be read against ~53 mobs/player, i.e. **~32**. And the
highest-leverage knob is now BOTH margins — `sleepMargin` sets the steady-state
population and `wakeMargin` only the safety margin, so a tuning pass should
narrow the band from the sleep side first. Both are conf knobs
(`game.mob.wakeMargin` / `sleepMargin`) and still [PLACEHOLDER].

#### What was built

- **`model/mob/dormancy.go`** — `Pristine()` (D3, clause by clause),
  `PlayerControlled()` (D4), and the `Dormant` flag MobSystem owns.
- **`sys/mob.go`** — the gate: the `WakeSources` seam, the derived box test
  (D6), hysteresis, the staggered re-evaluation, and `setDormant`, which owns
  the space surgery so flag and shapes cannot drift.
- **`phy/space.go`** — `SleepShape`, the D5 transition.
- **`ConnectionStateSystem.AppendWakePositions`** — players **and spectators**.
- Conf: `game.mob.wakeMargin` / `sleepMargin`, defaulted totally in
  `core/gameconf.go`, restated in both `conf.default.json` copies.

#### ⚑ Findings the plan did not have

1. **`RemoveShape` is unusable on this path, and D5 as written would have
   handed the win back.** It purges by walking EVERY shape in the space per
   removed shape — its own doc prices that as affordable "because removal is
   rare". Dormancy makes it per-tick, and a mob carries 3 shapes: ~44 000 map
   deletes × 3 ≈ **2.6 ms for one mob falling asleep** at the 30× world, a cost
   that is itself O(total mobs). New `SleepShape` skips the purge, which is safe
   in three independent layers (order: PhysicsSystem at priority 0 rebuilds every
   collision set later in the SAME tick that MobSystem at 20 sleeps a mob;
   readers: nothing between 20 and 0 reads `Collisions()`; separation: the sleep
   criterion puts every wake source ≥ 22 u away). The full essay is on the
   function — **a departure (death, disconnect, takeoff) must still use
   `RemoveShape`.**
2. **SPECTATORS ARE WAKE SOURCES, and D4 did not say so.** A spectator streams
   the world through `Viewport().Collisions()` exactly like a player
   (`core/net.go`). Dormant mobs are in no viewport at all, so omitting them
   renders the pre-join start screen and every death overlay as an **empty
   world** — and the pre-join spectator sits at the origin, where `world.json`
   authors ~24 props.
3. **Proximity alone is not enough to wake a mob** — found by a test that only
   failed once earlier tests had shifted entity ids enough to change which tick
   the stagger judged on. A mob that slept on its spawn tick could then be handed
   threat (an encounter script's `ForceThreatToTop`, the THREAT cheat — anything
   that finds mobs by walking `MobSystem.mobs` rather than the physics space) and
   **stay asleep with it forever**. Losing pristineness now wakes a mob. Pinned
   by `TestDormancy_LosingPristinenessWakesADormantMob`.
4. **L7 RULED: patrollers sleep.** Freeze-and-resume is correct *by
   construction*, not by care — a dormant mob's `Update` never runs, so nothing
   writes its position, waypoint index, leg timer or steering latch. It thaws
   mid-leg exactly where it froze. Pinned by a test that would catch the
   plausible future regression (recomputing a route on wake, which would show as
   a jump toward a waypoint).
5. **Structures are excluded** (campfires, braziers, totems) — narrowly and
   deliberately. Their aura never gates, several are respawn anchors or quest
   fixtures, and there are a few dozen against ~15 000 wild spawns. Revisit only
   if content authors structures in bulk.
6. **Free win:** `onMobDeath`'s linear scan over every authored spawn became an
   O(1) index lookup (`pointByMob`), which dormancy needed anyway. That scan was
   14 640 iterations per mob death at the 30× world.

#### ⚑ Standing landmines

- **`m.SetWakeSources(s)` in `core.NewGameWith` is the ON-SWITCH.** A nil seam
  disables dormancy entirely — which is what keeps the sim harness and every
  pre-S3 unit test byte-identical (L6, satisfied structurally rather than by
  measurement). **Deleting that line silently restores the old cost and fails
  nothing.**
- The two L8 invariants (`wakeMargin > 1`, `sleepMargin > wakeMargin`) are
  asserted in `cmd/simharness/guardrail_test.go` against the real defaulting path.
- ⭐ **L3 IS CLOSED BY D3, not standing — the plan's two clauses contradicted
  each other and D3 wins.** L3 feared "a player can chip a mob, leave, and find
  it still hurt". That cannot happen: D3 requires `health == MaxHealth()` before
  a mob is *eligible* to sleep, so a wounded mob never becomes dormant in the
  first place — it stays awake and regenerates like any other out-of-combat mob.
  Measured end to end (chip a 40 HP mob to 20, then walk away at 0.05 u/tick):
  **fully healed at t = 5.8 s** with the player 8.8 u away, **asleep at
  t = 14.8 s** at 40/40, i.e. healed with ~9 s to spare. It is true in the narrow
  sense that a *dormant* mob does not regenerate — it just has nothing left to
  regenerate. **PO preference confirmed 2026-08-29: regen-before-dormancy is the
  wanted behaviour, and it is guaranteed structurally.** ⚑ Anyone relaxing D3's
  full-health clause re-opens L3 for real.

#### ⭐ TUNING PASS 2026-08-30 — sleepMargin 2.2 → 1.9, and a floor L8 missed

**`sleepMargin` is the perf knob; `wakeMargin` is the safety knob.** That is the
direct consequence of the hysteresis correction above, and it inverts D6's own
advice ("wakeMargin is the single highest-leverage number in the plan"). Swept
at 14 640 mobs with `wakeMargin` held at 1.7:

| sleep | band | awake/player | vs 2.2 |
| --- | --- | --- | --- |
| 2.2 | 5.0 u | 49.5 | — |
| **1.9 (shipped)** | **2.0 u** | **36.8** | **−26 %** |
| 1.8 | 1.0 u | 32.6 | −34 % |
| 1.7 | 0 u | 29.3 | −41 % |

It holds as population rises — a consistent ~17 % of tick time, growing in
absolute terms: 10 players 5.77 → 4.80 ms · 40 players 11.04 → 8.96 · 80 players
17.25 → 14.41 · 150 players 27.15 → 22.66. Against M0's half-budget break
criterion that moves the mob subsystem's dispersed-player ceiling from **~75 to
~100**.

⚑ Read those player counts narrowly: they measure `MobSystem.Update` +
`Space.Update` ONLY. The real tick also pays encoding (57 % of it pre-S3),
skills and networking, so this is the **mob subsystem's own** ceiling, not the
server's.

⚑ And note what the sweep says about the margins as a *tick-time* lever at
today's scale: at 10 players the whole 2.2 → 1.9 move is 0.97 ms. It is a
CEILING lever, not a tick-time one — if tick time is the target,
`plan-server-performance.md` chunk 1 is the bigger item.

Stopped at 1.9 rather than 1.8: the marginal gain shrinks while the band
collapses, and 2 u is still ~1.3 s of walking to toggle a mob. ⭐ Narrowing is
safe at all because `phy.SleepShape` made the transition **O(1)** — the band no
longer has to protect an expensive purge, which is what the original 0.5 was
sized for.

#### ⚑ L8 CORRECTED — the wake floor is `player.FlightViewportScale`, not 1

L8 argued containment from `Zoom.ts`'s fixed **ground** field of view (18 × 9.5,
strictly inside the 20 × 12 AOI) and concluded `wakeMargin > 1` was the
invariant. It missed a second, larger viewport: **a flying player's server-side
AOI is itself scaled up** (`player.setViewportScale(FlightViewportScale)`, 1.2),
so the box the wake volume actually has to contain is bigger than the ground
AOI. Flight is the binding case, and it is where the margin is thinnest:

| | margin to the streamed edge | warning |
| --- | --- | --- |
| on foot (1.5 u/s) | 8.0 u / 5.4 u | 5.3 s / 3.6 s |
| **in flight (4.2 u/s)** | **5.0 u / 3.0 u** | **1.2 s / 0.7 s** |

Today's 1.7 vs 1.2 has headroom, but `FlightViewportScale` is a [PLACEHOLDER]
that has **already been retuned twice** (2.5 → 1.75 → 1.2) — precisely the drift
L8 exists to catch, in the one viewport it did not look at. Now enforced in code
(`core/gameconf.go` clamps the wake margin against it, not against 1) and
asserted in `cmd/simharness/guardrail_test.go`; the const is exported for that
reason and carries the coupling in its doc.

⚑ **The §8 in-game pass now owes a FLIGHT leg**, not just the zoom levels: fly a
route over a dormant region and confirm nothing fades in at the screen edge.

#### Verification

`go build ./...` clean · `go vet ./...` clean · full `go test ./...` with
**no new failures**. Five pre-existing reds, all confirmed unrelated by
bisecting against the committed world.json: `TestMemorial_*` and
`TestAscensionSites_*` (the PO's uncommitted 30× tiled `world.json` duplicates
each unique stone 30×) and three `pkg/aura/items/mobs` census tests (the
`martin.json` added in `6c2e6d5c` was never added to the census lists).
New: `phy` 3 legs · `model/mob` 12 legs · `sys` 16 legs · 1 guardrail.

**Not done, and owed:** the real probe-ladder re-run on a server
(`scripts/probegen.mjs` is kept for it) and the in-game pass — §8's S3
checklist, in particular walking in **at every zoom level** to check D6/L8's
containment argument by eye, and the totem-beside-a-sleeper case (L2).
