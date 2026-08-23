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

You should see six object layers, and no tile layers:

| Layer | What it holds | Shape |
|---|---|---|
| `terrain` | ground textures | tile object (the art itself) |
| `props` | trees, stones, houses, walls | tile object at its true physics size |
| `spawns` | every mob and NPC | point, or a **polyline** if it patrols |
| `campfires` | bind points / starting spawns | point |
| `darkAreas` | the unlit circles | ellipse |
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

Drag from the **aura-props** tileset. Each prop draws at its **true physics
footprint** — a House really is 4×3 units — so what you see is what blocks
movement.

- ⚑ **Resizing a prop does nothing.** Size belongs to the prop *type*
  (`api/props/*.json`), not to the placement, so Tiled discards it on save.
  Per-placement scale is designed but unbuilt (`docs/plan-prop-scale.md`).
- ⚑ **Rotating a prop does nothing either** — the field is authored but never
  rendered. Same plan.
- `blocksMovement` is a checkbox in the Properties panel.

### Spawns

Click with **Insert Point** on the `spawns` layer, then fill in the form in the
Properties panel. Every field is a dropdown or a typed box:

| Field | Meaning |
|---|---|
| `mob` | which species — pick from the list of all 61 |
| `level` | `0` = *use the species' own level* |
| `wanderRadius` | `-1` = *inherit*. **`0` is different**: it forces the mob to stand still |
| `idleSpeedFactor` | `0` = *inherit* |
| `respawnTicks`, `respawnVariancePct` | `-1` = *not authored* (what the NPCs use) |
| `patrolMode` | `pingpong` is the default; `loop` circles the route |

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
2. **First click = where the mob spawns.**
3. Each further click is a waypoint, in order. Right-click to finish.
4. Set `mob`, and `patrolMode: loop` if it should circle rather than
   ping-pong.

You need at least three clicks: the first is the spawn, and a route needs two
or more waypoints.

- ⚑ **Do not drag the first node.** The spawn position is the object's origin,
  not that vertex — dragging node 0 moves the drawn line and changes nothing in
  the file. To move a patrolling spawn, move the whole object.
- ⚑ A mob cannot both patrol and wander; the save refuses if you set both.
- ⚑ A speed-0 species (TownCrier, Hermit, the totems and stones) cannot patrol
  at all, and the save says so by name.

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
| `terrain`, `darkAreas` | **frontend rebuild** (the client bundles zone terrain) |
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

No reinstall, no hand-import. The generator reads `api/` and the client's
`Graphics.ts` — the same sources the game loads — and **fails loudly** rather
than shipping a gap.

⚑ Adding a new *field* to the zone format is a different job: it must be taught
to `aura-convert.js` and to `ZoneModel.getZoneAsJSON` in the same change, or
one editor silently deletes what the other wrote. `npm test` goes red by design
if you forget (the completeness pin in `AuraTiledConvert.test.ts`).

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
| Place a mob | Insert Point on `spawns`, set `mob` in the Properties panel |
| Make it patrol | Insert Polyline on `spawns` — **first click is the spawn** |
| Make it wander | `wanderRadius` above 0, and no route |
| Make it stand still | `wanderRadius` **0** — not `-1`, which means inherit |
| Use the species defaults | leave the sentinels alone (`-1` / `0` / `pingpong`) |
| Find the object an error names | Edit ▸ Select Object by Id |
| Save | Ctrl+S — it writes `api/zones/world.json` in place |
| See the edit in game | restart `./aurad -dev -content ../api` (terrain: rebuild the frontend) |
| Teach Tiled about new content | `node tools/tiled/generate-palette.mjs` |
| Check the tooling still round-trips | `bash tools/tiled/verify.sh` |
