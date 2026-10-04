# Content — Level design guide (shared rules for every zone)

**Authoring guide.** How to build a zone with the primitives the engine
actually ships today, and the level-design rules every zone follows. Exact
runtime positions live in the zone JSON authored in Tiled
(`manual-tiled-editor.md`) and are never mirrored here. Numbers are
[PLACEHOLDER] unless marked FINAL.

⭐ **Each zone's design intent lives in its own doc** (PO 2026-10-02):
[`content-zone-1-farmland.md`](content-zone-1-farmland.md) and
[`content-zone-2-woodland.md`](content-zone-2-woodland.md). They were §2 and §3
of this guide from 2026-09-30, when it replaced the archived
`content-zone1.md` / `content-zone2.md` (old 144×72 world); §2 and §3 below are
now pointers. How a zone's XP is budgeted, and how a zone splits into quest
areas: [`plan-xp-progression.md`](plan-xp-progression.md).

## Where each truth lives

One source per thing. When this doc and one of these disagree about the thing
that source owns, **the source wins** and this doc is the one to fix.

| Question | Source of truth |
|---|---|
| What a zone is *for*: flow, POIs, cast, quests, its XP budget | its zone doc: [`content-zone-1-farmland.md`](content-zone-1-farmland.md), [`content-zone-2-woodland.md`](content-zone-2-woodland.md) |
| How to build any zone, and the rules every zone follows | **this doc** |
| Level bands per zone, quest areas, the quest / kill XP split | [`plan-xp-progression.md`](plan-xp-progression.md) |
| Where anything actually stands | [`api/zones/world.json`](../api/zones/world.json) (authored in Tiled), plus the interiors [`tunnel.json`](../api/zones/tunnel.json) and [`barn.json`](../api/zones/barn.json). Read it with `node scripts/zone-census.mjs` (per-region census + placement warnings) |
| The zone list, its order, and which region is which zone | [`content-world.md`](content-world.md) |
| Mob, NPC, quest and skill definitions | `api/mobs/`, `api/quests/`, `api/skills/`; intent per entry in [`content-mobs.md`](content-mobs.md), [`content-npcs.md`](content-npcs.md) |
| The story across zones, and the world's tone | [`content-story.md`](content-story.md), [`content-lore.md`](content-lore.md) |
| The map as a whole: release map, camps, zones as regions (D6) | [`plan-release-map.md`](plan-release-map.md) |
| Art, animation and audio these zones need | [`art/assets.csv`](art/assets.csv) (§5) |
| How to author | [`manual-tiled-editor.md`](manual-tiled-editor.md), [`manual-content-authoring.md`](manual-content-authoring.md), the `add-content` skill |
| How each primitive works (§1) | [`plan-region-primitive.md`](plan-region-primitive.md) · [`plan-world-paths.md`](plan-world-paths.md) · [`plan-zone-polygons.md`](plan-zone-polygons.md) · [`plan-region-atmosphere.md`](plan-region-atmosphere.md) · [`plan-underworld.md`](plan-underworld.md) (interiors and cave doors) · [`plan-area-effects.md`](plan-area-effects.md) (unbuilt) |
| The OLD world (`-debug-zones`) and why it was built that way | [`archive/content-zone1.md`](archive/content-zone1.md), [`archive/content-zone2.md`](archive/content-zone2.md), [`archive/plan-content-zones12.md`](archive/plan-content-zones12.md) |

⚑ **The "world bible" this guide was written from is not in the repo.**
Wherever this doc cites it, this doc is the only written record of what it
says.

---

## 0. Where the zones are, and the conflict that is now closed

### 0.1 ✅ CLOSED 2026-09-24: the zone-split conflict

When this guide was written (2026-09-16), the world bible's **Zone 2 =
Woodland** collided with the shipped map, whose east half held the village, the
City Gates, the war front and the Orc Warlord: the bible's **City / Suburbs**
material, not Woodland. The guide offered three ways to insert Woodland (split
`world.json`, re-theme its east half, or add a third file) and assumed the
split.

**None of the three was taken.** The PO rebuilt `world.json` from scratch
(`06e5c476`, 2026-09-24) as a 540×360 map laid out in the order of
`content-world.md`, and parked the old 144×72 world as the `-debug-zones` set
(`api/zones/.debug/world_debug.json`). Woodland now sits between the farmland
and the City as intended, and the front moved to **The Umberwood**, south of the
City (`8bc9210c`). This is the release map (PO 2026-09-30,
`plan-release-map.md` §9).

### 0.2 Which regions are Zone 1 and Zone 2 (PO 2026-09-30)

A zone is a set of **titled regions** in the one `world.json`, not a file.
Crossing into a region shows its title and subtitle in a banner. ⚑ "Zone" is
used here as the design label; to the engine a `Zone` is a zone FILE
(`world`, `barn`, `tunnel`). Where the two could be confused, say **area** for
the design sense (`plan-underworld.md` §2.1).

| Zone | Region(s) (`title`, `subtitle`, ground profile) | Hostile levels today |
|---|---|---|
| **1 — Farmland & Village** | **Farmlands** ("Home and Hearth", `Fields`) · **Saltgrass Strand** ("Sea and Salt", `Coast`, a thin strip on the north edge). ⛔ **Brackenfold Meadows** ("Plough and Bramble", `FieldsForestBlend`) is leaving Zone 1 (PO 2026-10-02); the map fix is owed | 3 (Farmlands) |
| **2 — Woodland** | **Deep Woods** ("City Outskirts", `Forest`), east of the river | 4–14 |
| City (next) | **Brunnstedt** ("Walls and Wells", `City`) | none |

Interiors off Zone 1, each its own zone file entered through a `CaveMouth`:
**Reinhard's barn** (`barn.json`, 10×10, the Giant Rats) and **the tunnel**
(`tunnel.json`, 48×28, Dire Wolves, both mouths in the Farmlands). The
underworld's two surface exits come up in the Deep Woods.

⚑ The table's levels are a census, not a decision; the intended bands are in
each zone doc and [`plan-xp-progression.md`](plan-xp-progression.md). Re-run
`node scripts/zone-census.mjs` instead of trusting them.

### 0.3 As built vs. the zone docs

Moved with the zones (2026-10-02): each zone doc carries its own "As built vs.
this doc" table.

⚑ **"Shipped" in this doc's examples means the OLD world.** The seam ridge,
the Bandit Horde, the tunnel's lit spider staging area and the north-pasture
herd were built in the 144×72 map (`archive/content-zone1.md`,
`archive/content-zone2.md`), which now loads only under `-debug-zones`. The
patterns still hold; the placements are not in the live map.

---

## 1. The primitives you are designing with

Everything below is authored in Tiled and lands in one zone `.json`. Nothing
here needs Go.

| Layer / array | What it is | Use it for |
|---|---|---|
| `regions` | Filled area naming a **terrain profile** — the ground | The zone's base ground (Fields, Forest, Suburbs) |
| `paths` | Stroked line or **closed ring**, a profile + width, optionally blocking, optionally **`alignTexture`** (runs the tile *along* the path — required by `Fence`, wrong for everything else), **`corners`** (`round` default · `sharp` for a wall) and **`ends`** (`round` default · `flat` · `point`, which narrows the last 2 × width to nothing so a cliff fades out — collision narrows with it; not on a closed ring) | Roads, rivers, hedgerows, fences, cliff edges, cave walls |
| `structures` | Filled closed area, optionally **blocking**, with an outline | Ponds, rock masses, building footprints, walls of a hideout |
| `atmospheres` | The **air** over an area — `darkness` and/or `haze`, plus `sight` | Canopy gloom, forest fog, a dark tunnel, weather |
| `clearings` | A closed area that **erases** atmosphere (`darkness`/`haze`/`both`) | A sunlit glade in the canopy, a lit camp inside the gloom |
| `darkAreas` | Legacy circles of darkness | Existing content only — prefer `atmospheres` for new work |
| `props` | Placed art with a collider (Tree, Rock, Boulder, House, GateWall, Tombstone) | Scatter, buildings, walls |
| `spawns` | A mob or NPC placement, with level / respawn / wander overrides | All life |
| `bindPoints` | Respawn anchor + rest point (drawn as a campfire); one per zone is `startingSpawn` | Village, camp, waypoints |
| `anchors` | Named points a script or a door reads | Encounter geometry, tunnel destinations |
| `effect` *(designed, unbuilt)* | One optional key on a polygon/path/atmosphere naming an authored effect | Bog rot, lava, healing spring |

**Rules that bite during authoring** (all learned the hard way):

- ⛔ **A zone edit is half-live.** Tiled saves render instantly via HMR; the
  server reads the zone **once, at boot**. So geometry can look right and behave
  wrong. Restart after every save: `./scripts/dev-restart-windows.sh server`.
- ⛔ **A half-authored `.json` in `api/zones/` refuses the boot.** Park WIP
  outside the directory.
- **Blocking polygons**: interior cell 0.5 u, boundary stroke 1 u, body cap 256.
  A *jagged* outline blows the budget, not a big one — a big square merges to one
  box. Keep blocking masses **chunky**; use paths for long thin walls.
- **Walls as blocking `paths`, not props.** Path corridors are off the prop
  streaming layer and cost the wire zero; 777 props already cost something.
- **Density target (standing lock)**: one mob visible per ⅔-screen window.
- **Closure is not fill.** A closed path strokes a ring; a lake is a `polygon`.
- **Atmosphere vs region**: two separate profile tables. `Fog` is an atmosphere,
  `Forest` is terrain, and neither is offerable on the other's shape.
- **`darkness` is colour only** — a lantern erases it, nothing else does.
  `haze` is suspended matter — texture and drift, and nothing erases it except a
  clearing. Author both for a smoky cave; their opacities compound.

---

## 2. Zone 1 — moved to [`content-zone-1-farmland.md`](content-zone-1-farmland.md)

Split out 2026-10-02 (PO: Zones 1 and 2 are separate docs). The section
numbers there are unchanged, so a citation of "this guide §2.x" (code
comments, content `_comment`s, SVG headers) means §2.x of that doc.

## 3. Zone 2 — moved to [`content-zone-2-woodland.md`](content-zone-2-woodland.md)

Split out the same day, numbers unchanged: "this guide §3.x" means §3.x there.

---

## 4. Cross-zone level-design rules for the first two zones

These are the ones worth writing down because they are easy to break:

1. **The road is the tutorial for the whole game.** In both zones, the critical
   path is a road, and the road always points at the next zone. Everything
   optional hangs off it laterally.
2. **A seam is sealed except at its designed crossings — and there is usually
   more than one.** What makes a level range enforceable is that the crossings
   are *counted and deliberate*, not that there is only one. ⭐ The shipped Z1→Z2
   seam ridge has **two on purpose** — a solo tunnel and a group-gated road —
   which is a better pattern than one, because it lets the same seam serve a
   lone player and a group differently. The world bible asks for exactly this
   shape at the city: approach from the north **or** find the dark tunnel.
   Verify by flood-fill: plugging the designed crossings must cut the far side
   off. (⚑ `plan-world-paths.md` L3 names a boot-time reachability flood-fill as
   the remedy if authoring proves error-prone; it is not built.)
3. **Brightness is progression.** Zone 1 has no atmosphere; Zone 2 has canopy
   everywhere but the road. The player *feels* the level range change.
4. **Every dark space ends in a lit one.** A `clearing` is a landmark; darkness
   without a destination is just frustration.
5. **Landmarks over minimaps.** Every 15–20 u of travel should put something
   unmistakable in view — a mill, a boulder ring, a burnt cart, a palisade.
6. **Never seal with props.** Props stream and collide individually; walls are
   blocking paths and chunky polygons, with props on top for the look.
7. **Campfire spacing**: one per major POI cluster, ~25–35 u apart
   [PLACEHOLDER]. ⛔ Never put one on top of a cave mouth or a door — the
   campfire dwell circle eats every `E` press.
8. **Author the dangerous thing where the player can see it before entering it.**
   The lit spider staging area at the tunnel mouth is the model.

---

## 5. New assets these two zones need

⭐ **The list itself lives in [`art/assets.csv`](art/assets.csv)** — the asset
tracker, which covers art, animation and audio for the whole game and is the
thing you hand to an artist. Filter it on `zone` = Z1 / Z2, or on
`state` = missing. Read it as [`art/assets.md`](art/assets.md); the standing
brief every row is judged against is [`art/README.md`](art/README.md).

What that list says about these two zones, in one paragraph each:

- **Ground textures are the biggest gap, and `Forest` is the worst of it** —
  it has *no texture at all*, only a flat colour, and it is Zone 2's entire
  floor. `Road` borrows the desert tile. `Fields` and `Suburbs` share one grass
  texture, so farmland and village ground are literally the same image. The
  single highest-value new asset is a **ploughed-field / furrow** texture: it is
  what makes farmland read as farmland, and nothing else in the set can fake it.
- **Props are the second gap and the most visible one.** Six props exist in the
  whole game. **Tree is 74 % of all props and there is exactly one drawing** —
  2–4 variants would change the world's look more than any other single asset.
  Beyond that: the farmland vocabulary (haystack, cart, plough, well, barn,
  cottage variant, bridge deck), the Woodland set (palisade, tent, dead tree,
  stump, fallen log, bush, fern, cave-mouth frame), and a burnt cart for the
  bandit breadcrumb POI.
- **Mobs are nearly free.** Everything the world bible names for Zones 1–2
  already exists except **Goblin**. Alpha Boar, the Shepherd NPC and the named
  bandit leader are content on existing sprites. ⛔ Do not build the rest of the
  bible's roster (Fae, wisps, griffins, dragons, corrupted, elementals beyond
  fire) — they belong to later zones.
- **Atmosphere is numbers, not art, for the ones that matter.** `Canopy`,
  `Gloom` and `Cave Air` are **colour only** — a lantern erases them — so there
  is no file to draw, only a [PLACEHOLDER] opacity to judge in front of the
  game. `Fog` is the one that wants a real tile. Zone 2 will not read correctly
  until that look sitting happens.
- **Audio exists as a system and is empty as content.** `@pixi/sound`,
  `SpatialAudio.ts` and 21 inherited MP3s are wired — including the main theme,
  which is still **`derpy-berryhunter.mp3`**. Footsteps exist for *road* only,
  so a player crossing a grass field sounds like they are on a road. No campfire
  crackle, no aura sound, no level-up. ⛔ **Animation is different: the client has
  no sprite-animation support at all** (no `AnimatedSprite` anywhere), so every
  animation row is blocked on engine work — except water and haze drift, which
  already ship as texture scrolls and are numbers to judge, not frames to draw.

## 6. What this guide does *not* decide

- ~~**The zone-split question in §0** — PO call, blocks everything else.~~
  ✅ Closed by the rebuild (§0.1).
- The **as-built divergences** in each zone doc: for each, whether the map or
  the doc moves.
- Level bands: `plan-xp-progression.md`. Mob counts, respawn timers, campfire
  spacing — all [PLACEHOLDER], tuned in front of the game.
- Whether `darkAreas` is retired in favour of `atmospheres`
  (`docs/cleanup.md` entry 1 argues it both ways, plus a third option: teach the
  atmospheres layer the ellipse tool).
- The **area-effects** feature (`plan-area-effects.md`, designed not built) —
  a bog that rots you would be Woodland's first consumer, but it is unbuilt.

---

## 7. Seamless adjacency — what one-file-per-zone would actually cost

> **✅ ANSWERED 2026-09-24 by the rebuild: option (C), one `world.json` with
> zones as titled regions.** §7.5's named areas shipped as `regions[].title` +
> `subtitle` and the region banner (2026-09-28, `8bc9210c`), so the primitive
> every option needed exists. §7.7 is now the list of costs the chosen option
> actually carries, and the build-time stitch (§7.4 A, `plan-underworld.md`
> §7.2 U6) stays the escape hatch if they bite. Interiors (barn, tunnel,
> underworld) are separate files, per §7.8. Sizes and counts below are the
> 2026-09-16 snapshot of the old world. The rest of the section is kept as the
> reasoning.

§0 asked whether to split the world into per-zone files. The blocking question is
**how adjacent zone files form one contiguous walkable surface with no
teleport**, because that is precisely what the shipped multi-zone mechanism does
*not* do: the underworld is isolated by distance and entered through a door.

### 7.1 Good news first — most of the engine is already seamless

Zones are separated by **distance in one shared coordinate space**, and nothing
downstream knows zones exist. The broadphase, the AOI viewport query, every aura
overlap, entity streaming and the snapshot all work on positions alone. Put two
zone rectangles next to each other and **mobs, players, auras, aggro and
streaming already cross the seam correctly with zero changes.**

`MaxWorldCoordinate` (8192) is also a non-issue for adjacency: neighbouring
origins are ~150 units apart, nowhere near the float32 precision cliff that
forced that ceiling.

### 7.2 The one real blocker: the border wall

`core/game.go` builds **one `phy.InvAABB` per loaded zone**. Walk to the seam
and you stop dead against a wall you cannot see. That is the whole problem, and
everything else on this list is bookkeeping downstream of it.

The fix in principle: **a wall per contiguous GROUP of zones, not per zone.**
Zones that abut share one wall around their union; zones separated by distance
(the underworld, a tunnel) keep their own, exactly as today.

⭐ And the grouping should be **derived from the geometry, not authored** — the
repo's own "the SHAPE is the flag" rule, applied three times already (closed
paths, clearings, area effects). Two zones either abut exactly or clear the
separation distance; a flag saying which could contradict the rectangles.

### 7.3 The full change list

| # | What | Where | Note |
|---|---|---|---|
| 1 | Wall per group, not per zone | `core/game.go` (the `for _, w := range walls` loop) | The load-bearing change |
| 2 | `checkSeparation` currently **refuses** abutment | `world/place.go` | Becomes a three-way rule: exactly abutting, or cleanly separated, or refused |
| 3 | A group's union must be a **rectangle** | `world/place.go` | `InvAABB` is a rect. Ragged edges = refuse at boot, or wall the bounding box and make the author seal the hole with blocking geometry |
| 4 | Client tears down and rebuilds the whole visual world on a zone change | `Game.renderZone`, driven by `ActiveZoneTracker` | Must become **additive at boot** for a group. The client already bundles every zone file, so this is "concatenate with each origin applied" rather than "swap" |
| 5 | Camera clamp, minimap bake, `map.setBounds` are sized to **one zone's rectangle, never a union** (the code says so, L13) | `Game.updateActiveZone` | Group rectangle |
| 6 | `Welcome.map_width/height` ships the primary zone's bounds; `randomSpawnPosition` falls back to them | wire + spawn | Group rectangle |
| 7 | Only the **primary zone** may flag `startingSpawn` | `world/place.go` `checkSetWide` L4 | Becomes primary *group* |
| 8 | The curtain must not fire on a lateral crossing | `noteZoneChange` | Free: a contiguous walk is not a `travel` row at all, so nothing triggers it. The zone change becomes a **name banner only** |
| 9 | `PlayerRoster` ships every live player unfiltered | roster | Already a known bug; contiguity makes it *correct within a group* and still wrong across groups |

⛔ **Item 4 is the sleeper.** Even with one wall, a client that renders only the
active zone shows the neighbour's ground popping in at the seam. Seamless is a
*rendering* requirement as much as a physics one.

### 7.4 Three ways to get there, ranked

**(A) Build-time stitch — author N files, boot 1. ⭐ Recommended.**
A build step merges the authored per-zone files into one generated `world.json`
(applying each origin, concatenating every array). The engine sees exactly one
zone, so **every row of the table above stays untouched** — zero engine work,
zero new failure modes, and the seamlessness is total because there is no seam
at runtime.

- ⭐ It is already half-designed: `plan-underworld.md` §7.2 (**U6**,
  build-time zone placement with a generated placement file) is the same
  machinery, asked for by the PO on 2026-09-08 for the same reason.
- Seam validation lands in the stitcher, which is **the only place that sees
  both sides of a seam** — the right home for it, and impossible in Tiled.
- Costs, honestly: the booted artifact is generated, so debugging reads a
  generated file (mitigate by checking it in and diffing it); per-zone identity
  disappears at runtime unless you add §7.5; and the Tiled round-trip has to
  learn that the generated file is not the one you edit.

**(B) Runtime contiguous groups.** Build the table above. The right long-term
shape — zone files stay real runtime objects, per-zone lazy loading (S1) stays
possible, and a zone can be added without a rebuild. But it is genuinely several
chunks, and items 3 and 4 each carry a silent-failure class.

**(C) Don't split. One `world.json`, named areas inside it.**
What ships today. Zero seam problems, zero engine work. The cost is editing
ergonomics: one file, one editing lock, and you scroll past the farmland to
reach the woodland. Worth saying plainly — **the motivation for splitting is
authoring comfort and per-zone ownership, not engine need.** Today's file is
263 KB and Tiled handles it fine.

⚑ **(A) and (C) converge**, which is the useful observation: both end with one
runtime zone, and both need §7.5. (A) is (C) plus separate source files. So
**§7.5 is worth building first regardless of which option wins** — it is the
part that is useful in all three.

### 7.5 The primitive all three need: named areas

Zone identity should stop being file identity. A `zone.areas` array — a named
rectangle or polygon, client-side only, exactly like `regions` — buys:

- the **"Woodland"** banner when you cross, with no file boundary involved;
- per-area music (the audio pass);
- map labels;
- a level-range hint for the UI.

⭐ This was already anticipated and deliberately deferred: `plan-world-zones.md`
§7.6 ("named sub-regions within a zone", 2026-07-09) predicts exactly this
primitive and says to build nothing until a concrete consumer appears. **This is
that consumer.**

### 7.6 Seam authoring conventions (needed under (A) and (B) alike)

Tiled has no cross-file view, so a mismatched seam is **invisible in the editor**
and only appears in-game. Conventions that make it hard to get wrong:

1. **Fix a tile grid.** Every surface zone the same size (e.g. 144×72) with
   origins on exact multiples. An arbitrary-rectangle packing is a bug farm.
2. **A dead band each side of a shared edge** — ~4–8 u where nothing is placed
   except the crossing itself. No prop ever straddles the edge; a prop belongs to
   exactly one file.
3. **Same terrain profile at the crossing**, on both sides, so the ground does
   not change mid-step. Profile *blends* need the dead band to hide in.
4. **The road crosses at a round coordinate**, agreed between the two files. One
   number in both, written down.
5. **Put a natural funnel on the seam anyway** — the shipped seam-ridge trick.
   A treeline or ridge that leaves only the designed crossings makes the seam a
   threshold instead of an arbitrary line, and it is the same geometry that
   enforces the level range.

### 7.7 If you keep one giant `world.json` — the honest downsides

**First, what is NOT a downside: runtime cost.** Every loaded zone already
shares one `phy.Space`, one entity list and one broadphase, and the client
bundles *every* zone file regardless (`require.context` over `api/zones`). So
"one file" vs "several files, all loaded" is **identical at runtime** — same
physics, same streaming, same download. Splitting buys nothing there until
someone builds lazy loading, and nothing does today. The known entity-count
costs (`SkillSystem` 6.6×, `StatusEffectsSystem` 11.7× walking dormant mobs,
`removeEntityUs` O(total)) are driven by total entities and are the same either
way.

The real costs, ranked:

1. ⛔ **Boot blast radius.** `zoneStems` enumerates zone files *without parsing*
   and only parses the named stems, so a half-authored zone cannot break a boot
   it was never selected for — which is why "park WIP outside the directory"
   works. With one file, a single typo, an unknown prop type, a vertex-less
   shape or an out-of-bounds anchor **refuses the whole world's boot**. There is
   nowhere to park anything.

2. ⛔ **You cannot boot a slice.** `game.zones` lets you load just the tunnel
   (7 KB, 12 spawns) to iterate on it. One file means every restart pays the
   full load — today 494 terrain pieces, 772 props, 492 spawns. And since a
   Tiled save requires a server restart anyway (the half-live seam), **this is
   the cost you pay most often, every single edit.**

3. ⛔ **Point-in-polygon queries scale with the WHOLE world.**
   `Regions.resolveIn` is a reverse linear scan running `pointInPolygon` per
   shape with **no spatial index**, and `DarknessOverlay.inDarkness` +
   `Clearings.clearsAt` sit on top of it per query. Today those arrays are
   replaced per active zone, so a scan is bounded by *one* zone's shapes. One
   giant file makes every such query walk every region, path, polygon,
   atmosphere and clearing in the world — on the client's hot path (nameplate
   visibility). ⭐ **This is the one place where a single file is mechanically,
   not merely ergonomically, worse**, and it gets worse linearly with authoring.

4. **The map loses resolution as the world grows.** `MapTerrain.bakeTerrain`
   rasterises terrain into a single RenderTexture at a fixed `bakeWidth()` in
   texels, and deliberately never re-bakes. Double the world's linear size and
   the map halves in detail per unit. Per-zone bakes stay sharp; one
   whole-world bake cannot.

5. **Git and Tiled ergonomics.** 261 KB today; four to six zones is ~1–1.5 MB of
   one JSON. Every edit touches the same file — genuine merge conflicts if two
   people ever author at once, noisy diffs, and the byte-stability round-trip
   tests (already listed as known-inconclusive on a fresh checkout) get slower
   and more brittle. Tiled gives you layer visibility as the only organiser.

6. **No zone identity at runtime** — no area banner, no per-area music, no map
   labels, no level-range hint. ⚑ But this is solved by `zone.areas` (§7.5),
   which **every option needs anyway**, so it is one small build rather than a
   blocker.

7. ⚑ **You foreclose lazy loading, and this one gets more expensive with time.**
   S1 (webpack `'lazy'` + one await seam) is the designed answer to the client
   downloading the whole world, and it is per-*file*. With one giant file the
   only way to get it back later is to split — the work you were avoiding, done
   on a much bigger file.

8. **No repositioning.** `origin` is per-file, so a single file has exactly one.
   Moving a region of the world means rewriting every coordinate in it.

⭐ **Bottom line:** a single file costs iteration speed and boot blast radius
*now*, query cost and map resolution *as it grows*, and lazy loading *later*. It
costs nothing in physics or networking. If you take it, do two things anyway:
build `zone.areas` (§7.5), and keep the build-time stitch (§7.4 A) open — that
path converts a giant file back into N authored files without touching the
engine, which is the escape hatch that makes this choice reversible.

### 7.8 What does NOT change

Tunnels and the underworld keep today's mechanism **exactly as it is**: a
separate group, separated by distance, entered through an interact with a
curtain. That distinction — contiguous surface vs. doored interior — is the one
this section exists to preserve, and nothing above weakens it.
