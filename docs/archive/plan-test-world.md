# Plan — the big test world

> **⛔ STATUS: DROPPED 2026-08-22 (PO ruling), superseded by
> `docs/plan-release-map.md`.** This plan will never run. The next map we build
> is the **release iteration**, not a throwaway opt-in test map whose job was to
> show every feature at once, so its premise is gone.
>
> **Archived rather than deleted, because §1 transfers.** F1-F4 and the measured
> `world.json` densities are the only survey anyone has done of what bounds a
> map, and `plan-release-map.md` §5.1 inherits them. ⚑ Two caveats there: the
> line references were pinned 2026-08-02 and need re-verifying, and **F2 has
> moved** - a zone spawn point may author its own `level` since
> `plan-mob-levels.md` C1/C2, so the 13-17 rung hole is no longer a hard cliff.
>
> ⛔ **The rulings below do NOT transfer.** D1-D8 were ruled for a throwaway
> test map: D5 (opt-in file, live world untouched) is dead by definition and D3
> (existing roster only) conflicts with release-ready content. The other six are
> plausible and all need re-ruling. §3.1's area table and §3.2's feature
> checklist are useful *inputs* to the release map's design session, never
> decisions it inherits. See `plan-release-map.md` §5.2.

**Status: planned 2026-08-02 (docs only, no code). Not started.**

A second playable map — `api/zones/testworld.json` — built as large as the
server can actually hold, divided into level-banded areas, quested throughout,
and filled at the *measured* density of the live `world.json`. Its job is to be
a single place where every feature the game has can be seen at once: bands,
quests, teachers, drops, recipes, darkness, campfires, patrols, gated harvest
mobs, elites, a boss and its scripted encounter.

It is a **test** map, opt-in via `-zone testworld`. `world.json` stays the live
world and is not touched.

---

## 1. What "as big as we can build" is bounded by

Four hard walls, found by reading the code before any of this was designed. They
are what make the plan the shape it is.

**F1 — There is one zone, one `phy.Space`, and no transitions.** The server
loads exactly one zone file (`-zone <stem>`, default `conf.game.zone`), and
zone-to-zone handoff does not exist (`architecture.md` §6). So the "different
zones" in the ask are **areas of one contiguous map**, not separate zones. That
is also the model `architecture.md` recommends (option A, the WoW-continent
model): don't split until the single-thread ceiling forces it.

**F2 — Mob level is per species, not per spawn** (`backlog.md` §38).
`MobDefinition.CurveLevel` is authored once per mob type and `world.Spawn`
carries no level. The bands can only be assembled from the rungs that exist:

```
1  2  3  4  5  6  7  _  9  10  11  12  _  _  _  _  _  18  _  20  _  _  23
                     8                 13 14 15 16 17     19     21 22
```

There is a **hole at 13–17** and a smaller one at 8. Ruled acceptable (D3).

**F3 — Size is capped by mob count, not by bounds.** `sys/mob.go:88` updates
*every* spawned mob every tick regardless of whether a player is anywhere near
it, and every mob carries ~3 shapes through the broadphase. `world.json` runs
485 spawn points; at equal density a 4× map is ~1 940 mobs on a single-threaded
33 ms budget. **Nobody has measured that ceiling** — `devops/loadtest.md`
measures the *player* axis (~60–70 clustered), which is a different cost. This
is why chunk 0 exists.

**F4 — Two things are hardcoded to `zone.ID == "world"`.** The Orc Warlord
encounter registration (`cmd/aurad/aurad.go:216`) and, through it, the demand
that four named anchors exist. A new zone id gets no encounter until the check
names it.

Measured density of `world.json` (the target to match, per D-none — it is the
ask): **46.8 spawns**, **74.9 props**, **51.8 terrain textures** per 1 000
sq units, over 144×72 = 10 368 sq units. Per 24×24 cell that is 14–44 spawns
(mean 27) and 18–87 props (mean 43) — the spread is the difference between
village, forest and battlefield, and the generator reproduces it per area rather
than flattening it.

## 2. PO rulings (2026-08-02)

- **D1 — Hybrid authoring.** A generator script places the bulk terrain, props
  and spawns per area from an authored layout spec; landmarks (villages, quest
  hubs, the tunnel, campfires, encounter anchors) are placed by hand. Rejected:
  fully generated (every area reads identical), fully hand-clicked (caps the map
  at roughly today's size and costs many PO editor sessions).
- **D2 — Measure the mob ceiling first, then size to it.** Chunk 0 ramps
  throwaway density-matched maps until the tick breaks, and the real map is
  sized to ~50–60 % of that. "Biggest we can build" becomes a measured number.
- **D3 — Existing mob roster only.** Bands are built from the levels that
  exist; the 13–17 hole is accepted as a cliff, not filled with new mob
  definitions and not closed by building per-spawn levels (§38).
- **D4 — 2–3 quests per area.**
- **D5 — New file, opt-in.** `api/zones/testworld.json`, reached with
  `-zone testworld`. `conf.game.zone` stays `world`; the live deploy is
  unaffected.
- **D6 — Landmarks are authored as JSON coordinates by Claude**, not clicked in
  the editor by the PO. The PO corrects anything that sits wrong afterwards in
  the editor (the map round-trips through it normally).
- **D7 — The Warlord encounter is enabled by adding `testworld` to the existing
  zone-id check.** The hardcode stays; deliberately not generalised to
  "register when the anchors are present".
- **D8 — Skill reachability is best-effort.** No content test pins it. A sweep
  script reports what is and isn't obtainable in the map, and the report is
  read once at the end rather than enforced.

## 3. The map

### 3.1 Bands and areas

Five areas, west → east, plus a dark tunnel. Every mob listed exists today; the
drop/teach column is what the area is *for* beyond its level.

| # | Area | CL | Mobs | What it carries |
|---|---|---|---|---|
| A1 | Village & meadow | 1–2 | Turnip (harvest-gated), Stag, Boar, Wolf, Bramble | Farmer (Harvest), TownCrier (Recall), VillageHealer (FirstAid, Revive), Dog (SummonCompanion), CityGuard (Strong, Taunt), Hermit (Heal, FirstAid, Calm, CharmBeast), Miner (Pickaxe), Lamplighter (Torch), ForestSign. Wolf → Swift. Starting campfire. |
| A2 | Kobold hollow | 3–4 | Kobold, KoboldRanged, Bear, Spider, VenomSpider, PoisonPool (hazard), Rockfall (smash-gated) | VenomSpider → Antivenom. The tunnel mouth and `the-lost-lamp`'s LamplessTraveller. |
| A3 | Bandit road | 5–7 | Bandit, BanditRanged, BanditHealer, BanditPyromancer, EliteWolf, DireWolf, DireBear, EliteBandit, RallyDrummer | Slow, NovaBurst, Dash, Hardy, KeenEye, LongRangeStrike, Berserker, ThickHide, Recover, DamageBurst, Fade, Taunt. Shaman (SummonTotem, Recover, Slow). Patrol waypoints belong here. |
| A4 | Deep woods | 9–12 | GiantSpider, AlphaWolf, Troll, Marauder | Reaper, KeenEye, Tough. The 13–17 cliff sits at its eastern edge — deliberate, signposted by a ForestSign. |
| A5 | The front | 18–23 | ArmySoldier, Orc, OrcGrunt, FireElemental, GreaterFireElemental, SpikeBarricade, WarbannerTotem, **OrcWarlord** | FireWard, FireTotem, Tough, CallForAid, Rejuvenation. FrontCaptain (Vanguard), Emberkeeper (Torch, Ignite, Immolate, BindElemental), Wanderer (Recall). The four warlord anchors + the scripted encounter. |

The dark tunnel (`darkAreas` circles) runs between A2 and A3 — the seam the GDD
designs Lantern around, and the only place a light aura is load-bearing.
Campfires: one `startingSpawn` in A1, one per area after that.

### 3.2 Feature checklist the map must show

Everything below already exists; the map's job is to place it, not build it.

- Level bands & tiers: `normal` / `elite` / `boss` all present.
- Quests: `kill`, `harvest`, `talk_to` objective kinds, plus one two-NPC branch
  turn-in (the `wolves-on-the-road` shape).
- Teachings: as many of the 20 existing teachings as the bands allow.
- Drops: every `unlocks[]` source above.
- Recipes: reachable in principle wherever both ingredients are (best-effort,
  D8).
- Darkness + Lantern; campfires as respawn anchors + safe zones.
- Gated damage: Turnip (`harvest`), Rockfall (`smash`) — and therefore the
  Farmer and the Miner in reach.
- Patrols (`waypoints` + `patrolMode`), wander overrides, idle pace overrides.
- Structures & hazards: PoisonPool, SpikeBarricade, Bramble, WarbannerTotem.
- The scripted Orc Warlord encounter, on its four anchors.
- Props: Tree, Boulder, Rock, GateWall, House — the whole catalog (there are
  only five).
- Terrain: the full `groundTextureTypes` palette, per-area palettes.

### 3.3 Text

All authored text — quest titles, journal lines, trackers, dialogue rows — is
bare instruction. "Kill 8 wolves west of the fire." No lore, no voice, no
flavour. Matches the standing PO ruling already recorded on `the-lost-lamp`
(2026-08-02).

## 4. Chunks

### C0 — Measure the mob ceiling → the size ruling

Deliverable: a table and a chosen `bounds`. No content.

1. Copy `api/` into the scratchpad; generate throwaway probe zones there at
   1× (485 spawns, the control), 2×, 3×, 4× and 6× — density-matched, same
   species mix, no landmarks. **They live in the scratch copy, never in
   `api/zones/`** (L4: anything in that directory is bundled into the frontend).
2. Per probe: `./aurad -content <scratch> -zone probe-N -profile localhost:6060`,
   let it settle, read `/tickstats` idle; then
   `go run ./cmd/loadbot -disperse -steps 10 -hold 40s` and read it again.
3. Break signal: p95 over ~16.5 ms (half the 33 ms budget) with 10 dispersed
   players. Pick the largest probe comfortably under it; the real map is sized
   to that, minus the headroom for summons, totems and companions.
4. Record the numbers in §9 — including the caveat that the dev box is not the
   2-vCPU live box. The test map is local-only (D5), so the local box is the
   right venue, but the ratio is what transfers.

Expected landing zone [PLACEHOLDER]: 3–4× area, i.e. ~250×125 to 288×144, ~1 450
to ~1 940 spawns, ~2 300 to ~3 100 props.

### C1 — `backend/cmd/zonegen`, the generator

A Go command, so it can validate its own output against the real registries.

- **Input A — `zonespec.json`** (authored, lives next to the plan or in
  `api/zones/`… decided in C1: it is *not* a zone file and must not sit where
  the zone loader enumerates): bounds, seed, and per area a rect, a weighted
  spawn table, a weighted prop table, a terrain palette, and density multipliers
  relative to the world.json baseline.
- **Input B — `testworld.hand.json`**: hand-authored props, spawns, campfires,
  dark areas and anchors, plus **keep-out rects** the generator fills with
  nothing. ⭐ **Hand work lives in its own file and is merged at generate time**,
  so the generator stays re-runnable and never destroys a landmark.
- **Output** — `api/zones/testworld.json`, the union, deterministic for a given
  seed.
- **Self-validation before writing**: load the result through
  `world.LoadZoneFS` against the real mob + prop registries (this is what makes
  an unknown mob name or a typo'd key fail in the generator rather than at
  boot), then the placement checks: nothing outside bounds minus a margin, no
  blocking prop overlapping another blocking prop's body, no spawn point inside
  a blocking prop, minimum spacing per kind, and a **grid flood-fill
  connectivity check** so no generated thicket seals a region off (L5).

### C2 — The map

Author `zonespec.json` (the five areas of §3.1) and `testworld.hand.json` (the
village, the quest hubs, the tunnel, five campfires, the four warlord anchors,
the signposts), generate, then boot and walk it — `-content ../api -zone
testworld`, GOD + SPEED + WARP across every area. Fix what reads wrong, regen,
repeat. Hand the PO a running server at the end (D6: they correct placement in
the editor from there).

### C3 — Quests and quest hubs

- **One new conversant mob definition per area** (5 new files under `api/mobs/`),
  each offering 2–3 quests. New defs rather than rows on existing NPCs, because
  **mob definitions are global, not per-zone** (L1) — a quest row added to the
  Farmer would appear in the live world too.
- **10–13 new quest files** under `api/quests/`, covering `kill`, `harvest`,
  `talk_to`, and one two-NPC branch turn-in.
- Existing NPCs are *placed* (spawns) but their definitions are untouched, so
  the four shipped quests keep working exactly as they do today.
- Follow `manual-content-authoring.md` §6 to the letter — the two node-order
  traps and the "every quest node needs a row back to `root`" rule are the whole
  failure surface here.

### C4 — Wiring, verification, docs

- Add `testworld` to the Warlord zone-id check (D7) — one string,
  `cmd/aurad/aurad.go:216`.
- Boot both ways (`-content ../api` and the embedded build after
  `make -C backend build`, which `cp-defs` copies `api/zones` into) and pin the
  counts in the log.
- Run the reachability sweep script (D8) and record the report.
- `docs/README.md` index line, `CLAUDE.md` status banner, `MEMORY.md` line.

## 5. Landmines

- **L1 — Mob definitions are global.** Adding an `interaction` row to an
  existing NPC changes `world.json`'s copy of that NPC too. Quest content for
  this map goes on *new* defs. (Quest *files* are safe: a quest nobody offers is
  inert.)
- **L2 — The zone directory is bundled by the frontend.** `require.context`
  over `api/zones` (`GroundTextureManager.ts:138`) pulls in every `.json` there,
  so probe/scratch zones must not live in it — and the client needs a
  **frontend rebuild** before it renders the new map's terrain and darkness. A
  stale bundle renders *no terrain at all* and only logs
  `No bundled zone data for "testworld"` — it does not fail.
- **L3 — A zone that places campfires must flag at least one
  `startingSpawn`**, or boot hard-fails; and `SetSafeZones` makes each fire a
  hard no-chase zone at `AuraRadius × CampfireSafeRadiusFactor`. Fires placed
  near a quest mob will make it uncatchable.
- **L4 — Blocking props can seal the map.** Randomly placed `blocksMovement`
  props can wall off a region, and co-located equal-radius circles never
  separate (`backlog.md` §34) — a spawn inside a boulder is welded there. Hence
  C1's overlap and flood-fill checks.
- **L5 — Legacy content warns at boot.** ⚑ Stale since zone-editor C3
  (2026-08-16): the ten `legacy: true` defs were deleted with the
  proving-grounds map, so nothing legacy is left to reference; the boot
  warning mechanism itself still exists.
- **L6 — The zone loader runs `DisallowUnknownFields`.** The generator must
  emit exactly the schema keys of `world/zone.go` — a stray field aborts boot by
  name, which is the good case; the bad case is a *dropped* field that silently
  changes behaviour (`wanderRadius` is tri-state: absent inherits the type
  default, explicit `0` forces stationary).
- **L7 — Density is spawn *points*, not live mobs.** Points refill on respawn,
  so live count ≈ point count in steady state, plus summons, totems and
  companions on top. C0's headroom is for those.
- **L8 — 13–17 is a real cliff.** A player leaving A4 for A5 jumps six levels of
  content. Accepted by D3; it should be signposted in-world so it reads as
  design rather than a bug.
- **L9 — The measurement box is not the live box.** C0 runs on the dev machine;
  live is 2 vCPU and the loop cannot use the second core. Read C0's ratios, not
  its absolutes — the same discipline the mobile render-cost pass landed on.

## 6. Verification

- `go build ./...`, `go test ./...`, `gofmt` — C1 and C4 touch Go.
- Boot `-zone testworld` both ways, 0 errors / 0 warnings, counts pinned in §9.
- `/tickstats` on the *final* map, idle and at 10 dispersed bots — the number
  C0 predicted, confirmed on the real thing.
- The `verify` skill's headless smoke against the new zone: join, walk a band,
  take a quest, kill something, turn it in.
- The reachability sweep report (D8).
- `world.json` untouched: `git diff --stat` shows no zone change, and the four
  shipped quests still pass `chunkC4-quests`.

## 7. Open questions

1. **Where does `zonespec.json` live?** Not in `api/zones/` (the loader
   enumerates it, the frontend bundles it). Proposal: `devops/` or a new
   `api/zonespecs/` that no loader reads. Decide in C1.
2. **Does the test map ever get deployed?** D5 says opt-in and local. If it
   should be reachable on the live box (a second port / a query flag), that is a
   deploy question and a separate chunk.
3. **Do the 5 new quest-hub NPCs need art?** They can reuse existing NPC
   sprites; a distinct look is a `plan-avatar-system.md` question, not this one.

## 8. Not in scope

Per-spawn mob levels (§38), new mob definitions to fill 13–17, real zone
transitions / a second `phy.Space`, new prop or terrain art, any change to
`world.json`, and any engine work beyond the one-string encounter registration.

## 9. Chunk ledger

*(filled as chunks land — C0's measurement table goes here first)*
