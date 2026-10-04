# Plan: region identity: a region names a place by a unique id, its ground texture becomes optional, and a "go to" quest objective

**Status:** DESIGNED 2026-10-04 (planning session), **RULED the same day (D2-D9;
D1 ruled in shape, its id-optional half proposed, §3).** Nothing built. Two chunks:
R1 (region ids) → R2 (the `reach` quest objective). Line refs come from a survey
of HEAD `3d0b6738`; re-verify them before executing.

**Origin.** PO, 2026-10-04:

> *"how much effort would it be and how sensible would it be to separate regions
> from their rendered texture? in some cases i might want to define a sub region
> like "Reinhard's Farm" within the same area/zone/region. […] reversely, I might
> want to use a ground type somewhere without changing the region (meaning no new
> region title displays, quests do not progress). A region should in the end be
> unique, while a ground tex is not."*

Then: *"quests like "go to this place" will be a requirement for this. so we can
consider it in the same plan. yes it needs unique id."*

**The revision.** The first draft (same session) split names into a separate
`places` array. The PO rejected it: *"i dont like the idea of having to paint a
region and an equivalent place polygon in tiled. therefore i think regions
should carry an id and an optional texture"*. §9 keeps the rejected draft.

---

## 1. What this is

Today a **region** is a polygon that must paint a ground **material**
(`profile`) and may name a place (`title`, `subtitle`) for the title banner.
After this plan, a region carries **either or both** of:

- an **`id`**: the place it names. Ids come from one list,
  `api/regions/regions.json`, which also holds each place's title and subtitle.
- a **`profile`**: the ground it paints.

| A region with | Paints | Names a place | Example |
| --- | --- | --- | --- |
| `id` + `profile` | yes | yes | the Farmlands, as today |
| `id` only | no | yes | Reinhard's Farm inside the Farmlands |
| `profile` only | yes | no | a dirt patch, today's untitled region |
| neither | refused at load | | |

**One rule decides everything: the region that draws above wins.** That is
already the ground's rule (`plan-region-primitive.md` D0: the last containing
region that declares a property wins). An id is simply one more property, so
the ground lookup skips regions without a profile, the name lookup skips
regions without an id, and both read the same order. "Above" is the flattened
order, which is the world's hierarchy as the PO described it: areas in their
order (area-major, `plan-prop-draw-order.md` D11), then the object order inside
each area's regions layer. An id-only region sits at the place in that order
where it *would* draw.

Then R2 adds the first consumer that needs the id: a quest objective that is
done when the player stands in a region.

---

## 2. What was checked, not assumed

1. **The data today.** `Region` carries `Profile`, `Points`, `Title`, `Subtitle`
   (`world/zone.go:378-390`); `profile` is required (`zone.go:1209`).
2. **The name lookup already skips regions without a name** and takes the last
   titled one containing the point (`RegionNames.ts:29-37`). It moves from
   titles to ids unchanged in spirit.
3. **The ground lookup already skips regions without the property**
   (`Regions.ts:673-682`, `resolveIn`), so a profile-less region falls out of it
   for free.
4. ⛔ **The PAINTER does not skip them for free.** A region whose profile is
   unknown paints the default, *"the base land fill"* (`Regions.ts:836-841`,
   D11). Over another texture that is visible. A region without a profile must
   be dropped before painting, never handed to the painter with an empty name.
5. **A structure is not a ground patch.** `structures` (`Polygon`,
   `zone.go:533`) can paint a non-blocking texture, but it draws above every
   region, has no blend band, and is deliberately kept out of the lookup that
   footsteps and music will read (`zone.go:524-526`). Hence D1(b).
6. **Today's titled regions.** 23 in `world.json`, each title once; 1 in
   `koboldCave.json`; none in `barn`, `tunnel`, `underworld` or the three debug
   zones. 22 of the 23 world titles match an id in `api/areas/areas.json`.
7. **The XP plan waits on the same coupling.** `plan-xp-progression.md` D7(b)
   defers titled sub-regions because *"a sub-region also repaints the ground
   profile"*. An id-only region removes that cost.
8. **Quest objectives.** Kinds `kill`, `harvest`, `talk_to`
   (`quests/quests.go:26-30`). Tracker lines are composed SERVER-side and sent
   as strings (`QuestProgress.objectives`, `server.fbs` ~810; `ledger.go:589`),
   so a new kind needs no wire change.
9. **An objective with no persisted state has a precedent.** The chance
   objective stands alone in its stage, and a hit advances the stage at once
   (`quests.go:46-50`, `validateChance`).
10. **A per-tick server polygon test has a precedent.** `AreaEffectSystem`
    point-tests entities after physics (priority 102), bounds first, then
    `world.PointInPolygon` (`sys/areaeffects.go:142-175`).
11. **What the server reads gets offset.** Regions are client-only today and
    deliberately NOT offset (`world/place.go`, the comment above `Place`). R2
    makes the server read them, so R2 moves them across that line, the
    atmosphere precedent (area effects E2).
12. **Boot order.** Quests load and cross-validate before zones exist
    (`cmd/aurad/loaders.go:226-240`). Checks needing both run after the zones,
    beside `CrossValidateAreaIDs` (`loaders.go:336-374`).
13. **No quest markers.** *"Still no quest markers. No map arrows, no minimap
    pins, no in-world highlighting of goals."* (`gdd.md:639`, §42).

---

## 3. Decisions

### D1: a region carries an id and/or a texture (RULED in shape 2026-10-04; (b) PROPOSED)

- **(a) RULED:** regions carry an `id` and an optional `profile`. No separate
  place polygon is drawn (the PO's objection to the first draft).
- **(b) PROPOSED, PO to confirm: the id is optional too.** A region with only a
  profile is a pure ground patch, which is exactly today's untitled region, so
  it needs no new object type and no migration. At least one of the two is
  required. The PO asked for "another ground texture object for the case where
  a pure texture should be drawn"; this is that object, as the same class.
  - Rejected alternative: structures as the ground patch (§2.5).
  - Rejected alternative: a new `AuraGround` class. It would be today's region
    under a new name, and it would need its own stacking rule against regions.
- **Uniqueness:** the id is unique as a *place*, through the list (D2). Several
  polygons may carry it (D3). A region without an id is not a place.

### D2: ids and text live in one list (RULED 2026-10-04: yes)

`api/regions/regions.json` holds each id with its `title` and optional
`subtitle`. A region picks its id from a Tiled dropdown (an `AuraRegionId` enum
the palette generator writes, exactly as for area ids, D15). Rewording a title
touches neither zones nor quests.

### D3: several polygons may share one id (RULED: yes)

A place is the union of its polygons. Walking between two polygons with one id
announces nothing (today's same-title rule, keyed on the id).

### D4: nesting; the region above wins (RULED: yes)

- **The banner:** only the highest id-carrying region containing you counts.
  Walking from Reinhard's Farm back into the Farmlands announces the Farmlands
  again, subject to the existing 30 s repeat cooldown.
- **Quests:** a `reach` objective tests ITS region's polygons and ignores
  what is above them. Standing in the farm counts as being in the Farmlands
  where the farm lies inside the Farmlands' polygons. This is the PO's *"if we
  have to we can also tell that we are in both regions at once"*.

### D5: done when standing inside while the stage is current (RULED: yes)

Including already standing there when the stage starts (WoW's explore
objectives). No fresh arrival is required.

### D6: a `reach` objective stands alone in its stage (RULED: yes)

Arrival advances the stage at once, so nothing new is persisted. "Go to the
farm, then kill 5 rats there" is two stages.

### D7: the tracker line is "Go to {title}" (RULED)

An authored stage `tracker` overrides it, as for every stage.

### D8: flying does not count (RULED)

A player in flight is skipped, and so is a dead one. No dwell: the first tick
standing inside counts. One check per tick after physics, only for players
whose current stage has a `reach` objective.

### D9: areas stay folders (RULED: the draw-order plan is the hierarchy)

An area (`plan-prop-draw-order.md` P4) is an authoring folder: an id, no shape,
membership by hand. It is not a region and gains no shape. Its only role here
is the one it already has: it orders what it contains, and that order is part
of "the region above wins". A region sits inside an area like any object.

⚑ **"Area" means three things in the docs:** the draw-order folder, the XP
plan's "quest area" (a hub plus a level band, `plan-xp-progression.md` §3), and
casually a place. The XP plan's D7(b) asked for exactly an id-only region.

### Fixed by existing rulings (not choices)

- **No marker of any kind.** A `reach` objective never highlights its region
  on a map, the minimap or in the world (§2.13).
- **Ids are unique across all zones.** A region id may be drawn in any zone,
  the underworld included.

---

## 4. Design

### 4.1 The list

`api/regions/regions.json`, a new content directory (`contentSources` and
`cp-defs` both grow by one, as with `api/areas/`):

```json
{
  "regions": [
    {"id": "farmlands", "title": "Farmlands"},
    {"id": "reinhards-farm", "title": "Reinhard's Farm"},
    {"id": "deep-woods", "title": "Deep Woods", "subtitle": "…"}
  ]
}
```

Ids are slugs (the area-id rule). Order in the list means nothing; the zone
decides order. Every listed id must be drawn somewhere, and every drawn id must
be listed (both are boot errors: an undrawn id can never be reached).

### 4.2 The zone file

```json
"regions": [
  {"id": "farmlands", "profile": "Fields", "points": [ … ]},
  {"profile": "Dirt", "points": [ … ]},
  {"id": "reinhards-farm", "points": [ … ]}
]
```

`title` and `subtitle` leave the zone file.

### 4.3 Server

- `Region` gains `ID`; `Profile` becomes optional; `Title`/`Subtitle` go.
  Validation: at least one of id and profile. The subtitle-needs-a-title check
  moves to the list loader.
- `world.RegionListFromFS` + `CrossValidateRegionIDs(list, zones)` in
  `loaders.go`, beside `CrossValidateAreaIDs`.
- R2 only: regions are offset in `world.Place`.

### 4.4 Client

- The name lookup (`placeAt`) reads `id`, skips regions without one, and keys
  the announcer on the id. The title and subtitle come from the list.
- ⛔ The painter and the texture loader (`Game.ts:810-815`) receive only regions
  that carry a profile (§2.4).
- `ZoneModel` (the in-game editor) carries `id`, unedited, like everything else
  on a region.

### 4.5 Tiled

- `AuraRegion` gains an `id` member (the `AuraRegionId` enum, empty = none);
  its profile becomes optional.
- ⛔ The converter **refuses to open** a file whose regions still carry `title`
  or `subtitle`, naming the migration script. A lenient read would drop every
  title on the next save (the N2 lesson).
- A save-time check: a region with neither id nor profile, reported with its
  object id.

### 4.6 The `reach` objective (R2)

```json
{"kind": "reach", "region": "reinhards-farm"}
```

- `quests`: kind `ObjectiveReach`, target a region id. The loader rejects
  `species`/`npc`/`count`/`chance` on it, and D6's rule (alone in its stage).
- After zones load: an unknown region id refuses the boot.
- `Ledger`: each running quest's current reach target, cached at stage entry
  (never computed per tick). `NoteReached(id)` advances every current stage
  that targets that region.
- `sys`: a small system after physics, beside `AreaEffectSystem`. For each live,
  non-flying player with a reach target, it bounds- and point-tests the
  target's polygons and calls `NoteReached`. The usual case costs one empty
  check per player per tick.
- A stage entered while the player stands inside completes on the next tick
  (D5). A reload mid-stage restores nothing: standing inside completes it, and
  standing elsewhere waits.

---

## 5. Schema impact

| Surface | R1 | R2 |
| --- | --- | --- |
| DB | NONE | NONE (D6) |
| Wire (`.fbs`) | NONE | NONE (objective lines are server-composed strings) |
| `conf.json` | NONE | NONE |
| Content | +1 file `api/regions/regions.json` | quest format +1 kind `reach`, +1 key `region` |
| Zone format | regions +1 key `id`, `profile` optional; ⛔ BREAKING: −2 keys `title`, `subtitle` | NONE |

---

## 6. Chunks

### R1: region ids

1. Go: `ID`, optional profile, validation, the list loader, cross-validation.
   Tests first.
2. `scripts/migrate-region-ids.mjs`, idempotent. Each titled region gets an id
   and loses its title and subtitle; the 24 titles seed `regions.json`. Ids reuse
   the matching area id where one exists, for readability only. Nothing else
   moves, so the game looks and announces exactly as before.
3. Converter + palette (`AuraRegionId`) + the open-refusal + the save-time
   check + `verify.sh` legs.
4. Client: the list, the name lookup on ids, painting only profiled regions.
5. Migrate `world.json` and `koboldCave.json`; `-validate` 0 on both zone sets.

**Done when:** the banner reads exactly as before at every existing place; an
id-only region drawn inside the Farmlands announces itself and changes no
ground; `region-banner.mjs` is green.

**Effort:** smaller than the first draft's, because nothing is duplicated:
about the N2 key renames in breadth, mostly mechanical, guarded by the
whitelist pin.

### R2: the `reach` objective

Quest kind, cross-validation, ledger, the system, the tracker line, offsetting
regions, tests. **Done when:** a quest sends a player to a region and advances
on arrival, including the already-there, flying-over and reload cases. Content
to prove it: a debug quest, or the PO's first real one.

---

## 7. Test strategy

- **Go:** validation (neither id nor profile; unlisted id; listed but undrawn
  id); R2: the offset applies to regions (a non-zero origin, the atmosphere
  trap); ledger cases (arrive later; already inside at entry; leave before
  arriving; abandon; reload mid-stage; two quests to one region); the system
  with a real player (the area-effects "it compiled and matched nothing" trap);
  flying skipped.
- **Frontend (vitest):** the name lookup on ids, the region above wins, two
  polygons of one id announce once; an id-only region is never painted. The
  completeness pin goes red before the writers learn `id`, which is correct.
- **Tiled:** `verify.sh` legs for the `id` round trip and for the refusal on a
  pre-migration file.
- **Harness:** `region-banner.mjs` on ids.
- **In game:** the banner at a handful of existing places; an id-only sub-place;
  R2's quest walked by hand, including a flight over the target.

---

## 8. ⚑ Landmines

- **Four zone writers.** `zone.go` (authoritative), the converter, `ZoneModel`,
  and `aura-world-format.js` (memory: zone-format whitelists).
- **The open-refusal is not optional.** Without it, opening `world.json` in
  Tiled after R1 and saving deletes all 23 titles.
- **The default fill.** An id-only region handed to the painter paints the base
  land fill over whatever is below (§2.4).
- **No `make` on the Windows box.** Run `cp-defs` by hand after any `api/` edit,
  including the new `api/regions/` directory.
- **A zone edit is half-live.** Restart after a Tiled save.
- **Tests derive, never hardcode.** No content test names "Farmlands".
- **No marker sneaks in** through R2.

---

## 9. Superseded

- **The first draft (2026-10-04): a separate `places` array** with an
  `AuraPlace` class, regions reduced to ground only. Rejected by the PO the same
  day: it meant drawing a region and an equivalent place polygon for every
  textured place.
