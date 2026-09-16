# Tiled Zone Editor — Step-by-Step Manual

How to open `api/zones/world.json` in **Tiled**, edit any of its six arrays
visually, and save it straight back. Current as of 2026-08-23.

Tiled edits the same file the in-game editor does, and both write it
byte-identically — you can use either, in any order, on the same zone. Which
one to reach for:

| | Tiled | In-game editor (`docs/manual-zone-editor.md`) |
|---|---|---|
| Select / move / rotate / scale a **placed** piece | ✅ | ✗ delete + re-place |
| Terrain: select an existing blob at all | ✅ | ✗ (backlog §58) |
| Multi-select, copy/paste, undo, snapping | ✅ | ✗ |
| Edit while standing in the live world | ✗ | ✅ |
| See the world exactly as the client draws it | ✗ (approximate) | ✅ |

Definitions — mobs, skills, props, art — are neither: they live in
`docs/manual-content-authoring.md`.

---

## 1. One-time setup

1. **Install Tiled** — https://www.mapeditor.org/ (1.12 or newer).
2. **Install the extension:**

   ```bash
   bash tools/tiled/install.sh
   ```

   It copies `tools/tiled/extensions/aura-zone/` into Tiled's user extensions
   directory. ⚑ A project-local extensions path does *not* load reliably, which
   is why this is a copy rather than a setting.
3. **Restart Tiled.**

That is the whole install, and it is the last time you run it. The extension
carries no game content — adding a mob or a texture never needs a reinstall.

## 2. Open the project, then the zone

**Open `tools/tiled/aura.tiled-project`** (File ▸ Open File or Project), then
double-click `world.json` in the project's folder list on the left.

> ⚑ **Open the project, not just the file.** The mob dropdown, the terrain and
> prop type lists and the spawn colours are *project* state. Opening
> `api/zones/world.json` on its own works — the map loads and saves correctly —
> but you get plain text fields instead of dropdowns. If you prefer that flow,
> import `tools/tiled/palette/propertytypes.json` once via View ▸ Custom Types.

You should see seven object layers, and no tile layers:

| Layer | What it holds | Shape |
|---|---|---|
| `terrain` | ground textures | tile object (the art itself) |
| `props` | trees, stones, houses, walls | tile object at its true physics size |
| `spawns` | every mob and NPC | point, or a **polyline** if it patrols |
| `campfires` | bind points / starting spawns | point |
| `darkAreas` | the unlit circles | ellipse |
| `regions` | named areas that carry their own look | **polygon** |
| `anchors` | named positions the content refers to | point |

## 3. Edit

Ordinary Tiled: **Select Objects** (S) to click, drag, rotate by the handle,
resize by the corners. Multi-select, copy/paste and undo all work.

**Save with Ctrl+S.** It writes `api/zones/world.json` in place — no export
step, no intermediate file.

### The layer is the meaning

Which layer an object sits on decides what it *is*. A tree dragged onto
`spawns` becomes a mob spawn named "Tree", which the server would reject at
boot — so the save refuses instead, and says where it belongs:

```
spawns #4821 "Tree" (spawns[0]): unknown mob "Tree" — "Tree" is a prop type,
so this object belongs in the "props" layer, not "spawns"
```

The number is the object's Tiled id, so **Edit ▸ Select Object by Id** takes
you straight to it. A refused save loses nothing: the document stays open, so
fix and save again.

### Terrain

Drag a texture from the **aura-terrain** tileset onto the `terrain` layer.
Rotate and scale freely. Horizontal and vertical flip (X / Y) both work.

- ⚑ **Both flips at once is not expressible** in the zone format. Use one flip
  plus 180° of rotation; the save refuses otherwise.
- ⚑ **Order within the layer is paint order** — the array's order is what
  covers what. The layer is set to index draw order so the canvas tells the
  truth; use Object ▸ Raise/Lower rather than expecting y-sorting.

### Props

Drag from the **aura-props** tileset. Each prop draws at its **visual
footprint** — the same size it is in game, to the pixel — so the editor is
WYSIWYG.

- ⭐ **Resize a prop to scale it.** The box *is* the size: drag a corner handle
  and the placement gets a `scale` multiplier on its type's body. That is how
  you get one big old tree among saplings, without touching `api/props/`.
  - ⚑ **Hold Shift** so the box keeps its proportions. `world.json` carries one
    uniform multiplier, so a box dragged out of proportion is refused on save.
  - The rail is **0 < scale ≤ 10**; past it the save is refused.
  - A prop you have not resized authors no `scale` key at all, so untouched
    props stay diff-clean.
- ⚑ **The box is what you SEE, not what blocks.** A tree crown overhangs its
  trunk: the drawn box is the crown, and the collider is `body.collisionFactor`
  of it (`api/props/tree.json`, ~0.714 — so a tree blocks about 71% of what you
  see). Houses and walls block their whole box. Keep that in mind when spacing a
  path or a doorway.
- ⭐ **Rotate a prop and it turns in the game.** Grab the rotation handle (or
  set `Rotation` in the Object properties); the angle is streamed and the sprite
  is drawn at it. Shipped 2026-08-23, `plan-prop-scale.md` C2 — before that the
  field was authored and rendered nowhere.
  - ⭐ **Houses and walls collide at the angle you drew them**, since C2b. For
    the few hours between C2 and C2b they rendered turned and blocked upright,
    which the PO caught in-game; that is fixed, and pinned by a test that walks
    a player-sized body into a 45° house from two directions.
  - ⚑ **Rotating a rock or boulder turns its baked shadow with it**, so a field
    of rotated minerals reads as lit from several directions at once. The art
    has one light angle; this is a look call, not a bug.
  - All 798 pre-existing prop rotations were **zeroed** when C2 shipped. They
    were script noise — nothing had ever drawn them — so orientation is now
    something you author deliberately, starting from a world where every prop
    stands upright.
  - The in-game editor has its own prop rotation box and always had; it now
    means something there too. ⚑ It reads and writes **whole degrees**, so
    opening a Tiled-rotated prop in it and saving quantises the angle to 1°.
- ⭐ **A prop BLOCKS unless you say otherwise, and you rarely need to say
  anything.** `blocksMovement` is a dropdown in the Properties panel with three
  values, and a freshly dragged prop arrives at **`(inherit)`**:
  - **`(inherit)`** — take whatever `api/props/<type>.json` says, which for
    every shipped prop is *blocking*. Leave it here. The zone file then carries
    no key at all, so retuning the type later moves every placement of it.
  - **`blocks`** / **`walk through`** — override this ONE placement, for the
    one rock that really is different from every other rock.

  ⚑ **This is new as of 2026-09-17, and the old behaviour was the opposite.**
  `AuraProp` carried no properties at all, so a newly dragged prop showed an
  **empty** Properties panel and saved as non-blocking — a tree you could walk
  through, with nothing said. If you placed props before that date, check them.
- ⚑ **A prop's full editable set, in one place**, because only one of the five
  is a property:
  - **which prop** — the tile you dragged from the `aura-props` tileset.
  - **position** — drag it.
  - **rotation** — the rotation handle, or `Rotation` in the Object section.
  - **size** — resize the box. There is deliberately no `scale` property: the
    box *is* the scale, and a second place to say it would be a second source of
    truth that can disagree with what you see.
  - **`blocksMovement`** — the dropdown above, and the only custom property a
    prop has.

### Spawns

⚑ **Spawns are not tiles.** There is no mob tileset to drag from — a mob's
sprite is picked by hand-written client code, not by anything in `api/mobs`, so
a palette of them would be a hand-maintained list that drifts. Spawns are point
objects instead, and the species is a dropdown.

**Adding one from scratch, in three steps:**

1. Select the `spawns` layer and click once with **Insert Point** (I).
2. In the Properties panel, set **Class** (the top row, above the custom
   properties) to the kind of thing it is: `AuraSpawnCombat`,
   `AuraSpawnTalker`, `AuraSpawnFixture` or `AuraSpawnCompanion`.
   ⭐ **This is the step that brings up the form** — all seven spawn fields
   belong to that class, so a classless point shows nothing. It also gives the
   marker the same colour the in-game editor uses for that kind.
3. Pick the species from the **`mob`** dropdown, and set anything else you want
   to override.

The kind only decides the colour and is not saved to the file, so picking the
"wrong" one is cosmetic — but the save tells you if you forget the Class
entirely, and names the four options.

**Faster than all of that:** copy an existing spawn of the same species
(Ctrl+C / Ctrl+V) and drag the copy where you want it. It arrives with the
class, the mob and every override already set.

Each field is a dropdown or a typed box:

| Field | Meaning |
|---|---|
| `mob` | which species — pick from the list of all 61 |
| `level` | `0` = *use the species' own level* |
| `wanderRadius` | `-1` = *inherit*. **`0` is different**: it forces the mob to stand still |
| `idleSpeedFactor` | `0` = *inherit* |
| `respawnTicks`, `respawnVariancePct` | `-1` = *not authored* (what the NPCs use) |
| `patrolMode` | `pingpong` is the default; `loop` circles the route |

A knob you have not touched shows as the class default — Tiled displays it in
the panel without it being an override on the object. Typing a value makes it
an override; clearing it hands the field back to the default. Both read as
*inherit the species value* in the saved file.

⭐ **The odd-looking numbers are deliberate.** The zone format distinguishes
"not authored" from "authored as zero", and Tiled has no way to show an empty
number — so each field borrows a value the server already rejects to mean
"inherit". You will never see those values in the file; they are stripped on
save. The two that trip people up are the two where `0` is a *real* setting:
`wanderRadius: 0` (stand still) and `respawnTicks: 0` (respawn immediately).

A spawn you drew but never assigned shows `(pick a mob)` and refuses the save.

### Patrol routes

**A patrolling spawn *is* its route** — there is no separate route object.

1. Take **Insert Polyline** on the `spawns` layer.
2. **Click each waypoint, in order.** The first click also sets where the mob
   spawns. Right-click to finish.
3. Set `mob`, and `patrolMode: loop` if it should circle rather than
   ping-pong.

⭐ **Every vertex you draw is a waypoint** — what you see is the route, node 0
included. Two clicks give a two-point route; three give three. Because the mob
spawns on node 0, a route drawn this way starts at home and, in `loop` mode,
comes back to it.

- ⚑ **With only two waypoints, `loop` and `pingpong` walk identically.** Loop
  wraps last→first and ping-pong reverses; over two points both are
  `A → B → A → B`. If toggling the mode seems to do nothing, you need a third
  waypoint.
- Node 0 is not *pinned* to the spawn: drag it away and the mob keeps spawning
  where the object sits, then walks to the route. That is how the routes
  authored in the in-game editor look (5 of the 7 in `world.json` never return
  to their spawn point).
- ⚑ To move a patrolling spawn *and* its route together, move the whole object,
  not the vertices.
- ⚑ A mob cannot both patrol and wander; the save refuses if you set both.
- ⚑ A speed-0 species (TownCrier, Hermit, the totems and stones) cannot patrol
  at all, and the save says so by name.

### Regions

A region is a **polygon** naming a **profile** — a named bag of presentation
properties. Today a profile carries the ground colour under that area; music,
footsteps and atmosphere are later consumers of the same region.

1. Take **Insert Polygon** on the `regions` layer.
2. Click the outline, right-click to close it.
3. Pick `profile` in the Properties panel.

- ⚑ **Polygon, not polyline.** A polyline on this layer is refused — an open
  shape has no inside, so there would be nothing to paint.
- ⚑ **A fresh region says `(pick a profile)`.** That is the placeholder, not a
  profile: the save refuses until you choose one, rather than silently painting
  the ground in whichever profile happens to come first.
- ⚑ **Layer order is resolution order.** The **last** region containing a point
  decides — the same "later covers earlier" rule the `terrain` layer follows.
  A small blob drawn after the zone-sized area paints on top of it.
- ⚑ A profile only overrides what it *declares*. A blob that sets a colour and
  nothing else still takes the surrounding region's music once music exists —
  that is the point of profiles, and why regions may overlap freely.
- **A profile is not a Tiled thing.** The dropdown is generated from
  `frontend/src/client-data/terrain-profiles.json`; adding a profile means
  editing that file and re-running the generator (§6). The save refuses a name
  that is not in it, because the client would silently paint nothing.
- ⭐ **There are TWO profile tables, and two dropdowns** (2026-09-15). The
  ground — `regions`, `paths`, `polygons`, and the `outlineProfile` of the last
  two — reads `terrain-profiles.json` (`AuraProfile`). The **air** —
  `atmospheres` — reads `atmosphere-profiles.json` (`AuraAtmosphereProfile`).
  They used to be one file and therefore one dropdown, which made two silent
  mistakes possible: a ground profile on a fog bank drew **nothing**, and an
  atmosphere profile on a region painted **grey mud**. Neither is offerable now,
  and if one reaches the file by hand the save names the table it belongs to.
- The in-game zone editor has **no region tool** — it carries regions through
  untouched, so a region drawn here survives an in-game save.

### Area effects — making a shape *do* something

A **path**, a **polygon** and an **atmosphere** each carry an optional
`effect` in the Properties panel. Pick a skill from the dropdown and whatever
stands inside the shape gets it: lava burns, a bog rots, miasma poisons — and a
healing spring heals, because the same machinery runs both directions.

- **It sits on the SHAPE, never on the profile.** `Lava` the *material* is
  authored once and looks the same everywhere; how much a particular pool hurts
  is authored on that pool. So a zone-1 pool and a zone-5 pool can wear the same
  profile at different strengths, and tuning one never touches the other.
- ⚑ **`(no effect)` is the default and it means exactly that.** Unlike
  `(pick a profile)`, it is not a mistake — nearly every shape in the world is
  decorative, and one left alone writes no `effect` key at all.
- ⚑ **The dropdown is the skill roster** (`api/skills/`, the mob skills
  included). A name that is not in it is refused at save time, and the server
  refuses the boot on it too — an area whose effect resolves to nothing would
  draw, read as dangerous, and do nothing.
- ⛔ **The visible edge is not the effect edge.** A profile's blend band is
  centred on the polygon you drew, so the art spills about half a band *outside*
  the shape. For a hazard that is the forgiving direction — you see it before it
  touches you. For something *beneficial* it is the wrong way round: a player
  standing in the visible halo gets nothing. Give a kind area a small blend, or
  draw its shape a little larger than its art suggests.
- ⛔ **Restart the server.** A shape drawn in Tiled renders instantly through
  HMR and does nothing until `aurad` is restarted — it reads the zone once, at
  boot. Geometry that looks right and behaves wrong has already cost one
  debugging session.
- **Regions and clearings have no `effect` field**, deliberately. A region is
  the *material underfoot* — footsteps, music, ground colour — not a place; a
  clearing only erases atmosphere, and an erase that also burned you would be one
  shape doing two jobs.

### Campfires, dark areas, anchors

- **Campfire**: a point whose **Name** is the campfire id, which must be
  unique. Tick `startingSpawn` on at least one, or fresh players have nowhere
  to land.
- **Dark area**: an ellipse. ⚑ Hold **Shift** while resizing — the format
  carries one radius, so a stretched ellipse is refused.
- **Anchor**: a point whose **Name** is what content refers to. Unique, and
  inside the zone bounds.

## 4. Make the server use your edit

What needs rebuilding depends on what you touched:

| You changed | What is needed |
|---|---|
| `props`, `spawns`, `anchors`, bounds | **backend restart** |
| `terrain`, `darkAreas`, `regions` | **frontend rebuild** (the client bundles zone terrain) |
| `campfires` | **both** |

```bash
cd backend && ./aurad -dev -content ../api
```

⚑ **Without `-content ../api`** the server runs the *embedded* copy of `api/`,
so your edit needs `make -C backend build` first. Under `npm run start` the
frontend picks terrain changes up on its own — hard-reload the browser.

## 5. When the save is refused

Tiled shows a dialog and keeps the document open. Every line names the layer,
the object's Tiled id and what is wrong. The checks mirror the server's own, so
anything that passes here boots.

If the message is about the palette instead — *"could not find
tools/tiled/palette"* or *"palette missing"* — the zone file is outside the
repo, or the palette has not been generated:

```bash
node tools/tiled/generate-palette.mjs
```

## 6. After adding content to the game

New mob, new ground texture, new prop type? Tiled learns about it in one
command:

```bash
node tools/tiled/generate-palette.mjs   # then reopen the zone
```

No reinstall, no hand-import. The generator reads `api/`, the client's
`Graphics.ts` and both `client-data/*-profiles.json` tables — the same sources
the game loads — and **fails loudly** rather than shipping a gap, including if
a profile name appears in **both** tables (they are separate namespaces).

⚑ **This also runs automatically** as a `prebuild`/`pretest` npm hook
(`frontend/package.json`), so `npm run build` and `npm test` regenerate the
palette before doing anything else — a stale palette can't survive a normal
frontend build. It does NOT run `tools/tiled/verify.sh`'s full round-trip
(that needs the real Tiled binary installed and stays a manual step); it only
guarantees the generated files are never behind what `api/` currently says.

⚑ A **skill** is the same job with no extra step: `api/skills/*.json` is read
straight off disk (subdirectories included, so the mob skills are offered too),
so a new one turns up in the `effect` dropdown the moment you regenerate.

⚑ A **profile** is the same job: add it to
`frontend/src/client-data/terrain-profiles.json` (ground) or
`atmosphere-profiles.json` (air), regenerate, reopen. Until you do, the name is
not in the dropdown and the save refuses it — deliberately, because a profile
the client cannot resolve paints nothing and says nothing.

⛑ **Close the zone before you regenerate, and reopen it after.** If a prop
type's body changes size, every prop of that type in an already-open document
keeps its old box — and because the box IS the scale, saving writes a `scale`
multiplier onto *every one of them*. That is how 574 trees once picked up
`"scale": 0.714` in a single Ctrl+S. The file stays valid and byte-stable, so
nothing catches it; you just find the whole world resized in game.

⚑ Adding a new *field* to the zone format is a different job: it must be taught
to `aura-convert.js` and to `ZoneModel.getZoneAsJSON` in the same change, or
one editor silently deletes what the other wrote. `npm test` goes red by design
if you forget (the completeness pin in `AuraTiledConvert.test.ts`).

⚑ And if you edit the extension's **own code**, re-run `bash tools/tiled/install.sh`
and restart Tiled. The installer *copies*, so Tiled keeps running the version it
was given — this bites hardest in `verify.sh`, which drives the same installed
copy and would otherwise pass against code you have already changed. Its first
leg now refuses to run when the two differ.

## 7. Checking the tooling without opening Tiled

```bash
bash tools/tiled/verify.sh
```

Round-trips `api/zones/world.json` through the real Tiled binary headlessly and
diffs the bytes, then confirms a deliberately broken zone is refused. Run it
after touching anything under `tools/tiled/`.

## Quick reference

| I want to… | Do this |
|---|---|
| Install | `bash tools/tiled/install.sh`, once ever |
| Open | `tools/tiled/aura.tiled-project`, then `world.json` from the folder list |
| Move / rotate / scale a texture | Select Objects (S), drag or use the handles |
| Scale a prop | Select Objects (S), drag a corner handle with **Shift** held |
| Place a mob | Insert Point on `spawns`, set `mob` in the Properties panel |
| Make it patrol | Insert Polyline on `spawns` — every vertex is a waypoint, the first is also the spawn |
| Make it wander | `wanderRadius` above 0, and no route |
| Make it stand still | `wanderRadius` **0** — not `-1`, which means inherit |
| Paint an area's ground | Insert Polygon on `regions`, then pick `profile` |
| Add a new ground profile | edit `frontend/src/client-data/terrain-profiles.json`, then regenerate the palette |
| Add a new atmosphere profile | edit `frontend/src/client-data/atmosphere-profiles.json`, then regenerate the palette |
| Make a pool burn / a spring heal | set `effect` on the path, polygon or atmosphere — then **restart the server** |
| Make a shape purely decorative | leave `effect` at `(no effect)` |
| Use the species defaults | leave the sentinels alone (`-1` / `0` / `pingpong`) |
| Find the object an error names | Edit ▸ Select Object by Id |
| Save | Ctrl+S — it writes `api/zones/world.json` in place |
| See the edit in game | restart `./aurad -dev -content ../api` (terrain: rebuild the frontend) |
| Teach Tiled about new content | `node tools/tiled/generate-palette.mjs` |
| Check the tooling still round-trips | `bash tools/tiled/verify.sh` |
