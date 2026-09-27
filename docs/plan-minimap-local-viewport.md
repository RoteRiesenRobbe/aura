# Plan: Minimap Local Viewport (Radar Mode)

> **Status: M1 + M2 + M3 BUILT 2026-09-27 (all chunks). PO 2026-09-27: "looks good". The Map button overlapping the disc's ring predates this plan (C6's margin vs world-map C1's `#mapButton` top) and was left as is.**
> M3: vitest 1336/0 + typecheck clean; `m3-home-pointer.mjs` 7/7. The pointer aims at
> `MapCampfires.homeMarker()` (the marker AS DRAWN, so D12's discovered + active-zone rules
> come free) via the pure `rimPoint`, on the stage, per frame. ⚑ Its margin is **24 px, not
> the ~8 px §3.4 implied**: the compass letters are DOM over the canvas's outer ~20 px and hid
> a due-south pointer under the S. Side effect: a fire in the disc's outer 24 px shows its
> marker AND the pointer. Size 10 / margin 24 [PLACEHOLDER].
> M2: vitest 1332/0 + typecheck clean; `m2-radar-zoom.mjs` 15/15; `m1-minimap-radar.mjs`
> re-run 17/17. Steps live in `RadarZoom.ts`; the preference is `DevicePrefs.radarDiameterM`
> (localStorage, metres); `GROUND_RING_REACH_M` is now derived from the widest step.
> Landmine 9 turned out moot: the ± buttons are siblings of `.wrapper` (which owns
> the open-the-map listener), so no stopPropagation is needed. On the phone they
> alone lift the disc's `pointer-events: none`, and only while the sheet is open.
> Wheel: one ~100 px notch = one step, trackpad travel banked, reset after 300 ms
> or on a reversal [PLACEHOLDER].
> M1: vitest 1314/0 + typecheck clean; `m1-minimap-radar.mjs` 17/17; `c1-world-map`
> 10/12 (the two letterbox legs, already red at HEAD). Schema DB/wire/conf NONE.
> Findings: an ordinary death does not null the map's character (D13 corrected);
> the roster redraw in `updateScaling` lacked the zone origin (fixed in passing).
>
> Finalized 2026-09-27 (PO planning pass + hole-poking pass). 3 chunks, M1 → M3.
> Designed 2026-09-16. The 2026-09-27 passes re-surveyed the code at `39fae167`,
> corrected §0, ruled every decision in §2 and merged the old M1 + M3 (radar +
> terrain) into one chunk.
>
> ⭐ **Context:** the docked minimap (`features/map/logic/MiniMap.ts`,
> `MapScale.ts`) draws the **whole** zone scaled to fit the 15vw HUD disc
> (`scale = viewport.width / bounds.mapWidth`). The world is now **540 × 360 m**,
> so on a ~200 px disc 1 m is **~0.37 px**.
>
> ⚑ **The ask:** the docked minimap becomes a **local, player-centred** tactical
> radar with three zoom steps. The full-screen map (`M`) stays the whole-zone
> navigation map.
>
> ⛔ **Scope boundary:** client-side presentation only. **Schema DB / wire / conf
> NONE**, and no Go changes. The one new piece of persisted state is a
> per-browser `localStorage` preference (M2), which never reaches the server.

---

## 0. Corrections to the 2026-09-16 draft (verified at `39fae167`)

1. **The world is 540 × 360, not 144 × 72.** `Welcome.mapWidth` is 64 800 px.
   Today's docked scale is `200 / 64800 ≈ 0.0031`, and a 50 m radar is a
   **~10.8× zoom**, not the 2.88× the draft computed.
2. **What the docked map actually draws.** Mobs, corpses, other characters,
   `SimpleProp`s and `PropPlaceholder`s all set `visibleOnMinimap = false`. The map
   draws only these:
   - **your own character** (DYNAMIC, `Player.ts:32`);
   - **trees and stones** (`Resources.RoundTree`/`Stone`: 46 trees in `world`).
     These are STATIC icons, so once streamed in they are never removed.
     Their icon is `size × sizeFactor × iconSizeFactor`, i.e. **geographic**:
     it scales with the map, as a radar should;
   - the discovered **campfire markers** (`MapCampfires`) and the other-player
     **roster dots** (`MapPlayers`), both **constant px per state**
     (`MARKER_SIZE` 9/26, `DOT_SIZE` 7/20);
   - full-screen only, the **terrain under the fog**.
3. **Your own icon is the only one that balloons.** `createMinimapIcon` draws it at
   `size × 3`, then `× iconSizeFactor (= scale × 2)`. That is a ~3 m-radius
   footprint, which at 50 m on a 200 px disc is a ~24 px blob. The old M2
   ("icon sizing pass") shrinks to just this one icon and folds into M1 (D6).
   Trees and stones stay geographic.
4. **The minimap canvas renders at resolution 1** (`MiniMap.ts` init:
   `// TODO apply devicePixelDensity`). The upscaling of the terrain bake is
   therefore modest: ~1.05× at 50 m and ~1.75× at 30 m on desktop, and ~1× on
   the phone's 96 px disc. The first finalize pass overstated it as 4-6×.
   D8 (accept soft terrain) stands, and is now a low-risk call.

---

## 1. Chunks

| Chunk | What | Verification |
| --- | --- | --- |
| **M1** | **The radar.** The docked scale comes from a radar diameter (fixed 50 m here). Every docked layer is offset so your character sits at the disc centre. Full-screen resets the layers to the canvas centre. With no character, the radar holds your last position (D13). Your own icon becomes a constant size per state (D6). The baked **terrain + fog** show docked (D4), and a **ground ring** in the zone's `ground` colour fills the area past the bounds (D7). | vitest `MapScale.test.ts` (scale, offset, last-position hold, ring geometry) · in-game: walk, fly, die, toggle `M`, cross into the barn, zone edge |
| **M2** | **Radar zoom steps.** 30 / 50 / 100 m, default 50. The mouse wheel over the disc and ± buttons on the rim step it. The step is remembered per browser. | vitest for step clamping, snapping and the stored-value fallback · in-game: wheel, buttons, reload, phone sheet |
| **M3** | **Home-campfire rim pointer.** When your bound fire is off the radar, a pointer on the disc rim points to it. | vitest for the rim-point math · in-game: walk away from home, cross a zone |

The chunks run in order. Each is its own session with its own in-game pass.

---

## 2. Decision Ledger (all ruled 2026-09-27)

| | Decision | Status | Notes |
| --- | --- | --- | --- |
| **D1** | **Your character is always centred on the docked disc.** The world scrolls underneath, including past the zone edge (D7). | RULED (via D7; "clamp" was rejected) | |
| **D2** | **The docked scale is a fixed diameter in metres, not a zone fraction.** | RULED | `scale = V_w / meter2px(diameter)`. The same metres fit every zone and every disc size; a bigger disc just means more px per metre. |
| **D3** | **The full-screen map stays the whole-zone macro map**: letterboxed, centred, no zoom and no pan. | KEPT AS PROPOSED | The PO asked for zoom on the radar only. |
| **D4** | **The docked radar draws the baked terrain, under the fog mask.** | RULED | It reuses `bakeTerrain`'s texture, so there is no extra bake. |
| **D5** | **North-up, static compass.** | KEPT AS PROPOSED | The camera never rotates. |
| **D6** | **Your own icon is a constant size per state, equal to `DOT_SIZE`** (7 docked / 20 full-screen). It does not change with the zoom step. Trees and stones stay geographic. | RULED | This honours the standing PO ruling that another player's dot is "the same shape and size as your own dot" (`Graphics.ts` `otherPlayer`). That comment's "multiplies by iconSizeFactor" is already stale (MapPlayers uses `DOT_SIZE`) and gets fixed. |
| **D7** | **Past the zone's bounds, the radar shows the zone's `ground` colour. Docked only.** | RULED | This matches the world past the edge in-game (`15e3dc65`). No `ground` means black. The full-screen letterbox is unchanged (D3). |
| **D8** | **The terrain bake is reused as-is; soft terrain is accepted.** | RULED | See §0.4: the upscaling is at most ~1.75×. |
| **D9** | **Radar zoom steps: 30 / 50 / 100 m, default 50.** | RULED, values [PLACEHOLDER] | |
| **D10** | **Zoom controls: the mouse wheel over the disc, plus ± buttons on the rim.** Phones use the buttons. | RULED | The only existing wheel handler is the global ctrl+wheel block (`Game.ts:472`). The radar ignores `ctrlKey` wheels. |
| **D11** | **The zoom step is remembered per browser** (`localStorage`). | RULED | The value is stored in metres and snapped to the current steps (landmine 10). |
| **D12** | **One rim pointer, for the home campfire only.** | RULED | It shows only when the home fire is discovered, in the ACTIVE zone's campfire list, and outside the radar. |
| **D13** | **Without a player character (death, between joins), the radar holds the last position.** It uses the zone centre only if there never was a position; the hold resets on a zone change or a re-setup. | RULED | "Zone centre" would jump the radar to the middle of a 540 m world. ⚑ Corrected at M1 build: an ordinary death does NOT null `playerCharacter` (`CLEAR_MINIMAP_ON_DEATH` is off; the dead character keeps reading where it fell), so death holds by itself. The hold covers `clear()`'s other caller, `reseedMinimap`, and the flag if it is ever turned back on. |
| **D14** | **Roster dots keep their 1 Hz step.** | RULED: accept, judge in-game | On the radar a walker jumps ~6 px/s at 50 m and ~10 px/s at 30 m, and flyers more. If it reads badly, the named fix is to draw the dot at the live 30 Hz entity position when that player is also in AOI. |

---

## 3. Mathematical Architecture

### 3.1 Scale (`MapScale.ts`)

- $V_w, V_h$: the canvas size in CSS pixels (docked 15vw ≈ 190-390 px on desktop; 6rem = 96 px on the phone).
- $W_w, W_h$: the zone bounds in px space (`world` = 64 800 × 43 200).
- $D$: the radar diameter in px space, `meter2px(step)`.

$$\text{scale}_{\text{FULLSCREEN}} = \min\left(\frac{V_w}{W_w}, \frac{V_h}{W_h}\right) \qquad \text{scale}_{\text{DOCKED}} = \frac{V_w}{D}$$

At $V_w = 200$: the 30 m step gives 6.7 px/m, the 50 m step 4.0 px/m and the 100 m step 2.0 px/m. Today it is 0.37 px/m.

⚑ `mapScale()` gains the diameter as an input, and the docked branch stops reading
the bounds. The header note "the docked state deliberately ignores height …
do not fix this to a min()" is **superseded**. Rewrite it, don't keep it as a stale lock.

### 3.2 Layer offset (`MiniMap.ts`)

Everything is placed from the layer origin via
`worldToMap(world, scale, originPx) = (world − origin) × scale`. So in the docked
state **every** layer sits at:

$$X_{\text{layer}} = \frac{V_w}{2} - \text{worldToMap}(X_{\text{focus}}, \text{scale}, X_{\text{origin}}) \qquad Y_{\text{layer}} = \frac{V_h}{2} - \text{worldToMap}(Y_{\text{focus}}, \text{scale}, Y_{\text{origin}})$$

`focus` is your character's position, or the held last position (D13), or the
zone centre (the plain canvas centre) if there never was one. Full-screen always
uses the plain canvas centre. A pure
`layerOffset(state, viewport, scale, focusPx | null, originPx)` in `MapScale.ts`
covers all of it.

⚑ **One `positionLayers()` method, called from BOTH `update()` and
`updateScaling()`.** Otherwise a resize or zoom step shows one frame of the world
snapped to the zone centre. It moves every layer:
`layerContainers` (every entry), `terrainLayer` (which carries the fog mask and
the ground ring), `campfires.layer` and `players.layer`. A layer missed here
does not look wrong at the centre. It looks like markers sliding off their
ground as you walk.

### 3.3 Ground ring past the bounds (M1)

Four rectangles around the zone rectangle, children of `terrainLayer` *below* the
terrain sprite, reaching `50 m + margin` (half the largest step) past each edge.
They are filled with `groundColor(zone.ground)` and resized with `scale` in
`updateScaling()`. They are hidden full-screen.

⛔ **Not a canvas background.** The fog mask would then show the ground colour
over *unexplored ground inside the zone*.

⚑ The ring is **built with the terrain layer** in `setupTerrain()`. That method
re-enters on a zone switch AND on `rebakeTerrain` (region tiles landing), and
it destroys the layer with `{children: true}` each time. A ring built anywhere
else is either destroyed underneath its owner or keeps a stale zone's colour.

### 3.4 Rim pointer (M3)

The home marker's offset from your position in marker space is
$(dx, dy) = \text{marker} - \text{worldToMap(focus)}$. When
$\sqrt{dx^2 + dy^2} > R - m$ (with $R$ the disc radius and $m$ a [PLACEHOLDER]
margin), the pointer is drawn at radius $R - m$ along that angle, in a fixed,
un-offset layer. A pure `rimPoint(dx, dy, radius, margin)` returns the point,
or `null` when the marker is already on the radar.

---

## 4. Landmines & Edge Cases

1. **The offset is per frame; the scale is not.** `updateScaling()` runs only on a
   resize, a state change or (M2) a zoom step. `positionLayers()` runs every
   `update()`, **after** the dynamic icons are re-placed, so your dot never
   lags a frame behind the centre.
2. **Full-screen must never be offset.** `positionLayers()` returns the plain
   centre in FULLSCREEN. The flight hit-test `pickCampfireMarker` assumes marker
   space = canvas minus centre, and `isInsideDrawnMap` assumes a centred map.
3. **Circular clipping is CSS** (`#minimap > .wrapper`: `border-radius: 50%;
   overflow: hidden`), so no pixi mask is needed. Check it on the phone sheet.
4. **Never let a NaN offset through.** A NaN container position blanks the map
   silently. `layerOffset` returns the plain centre for any non-finite input.
5. **Fog is unaffected by the view.** `revealAt()` stamps zone-local
   coordinates. The mask rides `terrainLayer`. F2's `applyRevealed` is independent.
6. **⚑ Phone cost.** Docked used to render a handful of icons. It now renders the
   terrain sprite through an alpha mask **every frame**, in the minimap's own GL
   context. On the phone that happens **even while the sheet is closed**, since the
   disc is only `opacity: 0` (HUD.mobile.less). It is unmeasured. ⛔ If it has
   to be cut, **do not stop the minimap ticker**: `update()` runs on it and is
   what stamps the fog, so stopping it stops exploration. Skip the *render*,
   never the *update*.
7. **Sub-pixel shimmer.** At ~1:1 texel ratio, a fractional layer offset makes
   linearly-filtered terrain alternate sharp and soft as you walk. Round the
   offset to whole pixels, since your icon is placed from the same rounded
   value and stays centred. Judge it in-game.
8. **A zoom step IS a rescale.** Entity icons are kept in canvas px and walked
   from `previousScale` (`rescaleCoordinate`), so a step goes through `onResize`
   → `updateScaling`, never a direct `this.scale =`. `onResize` sets every
   icon's scale to `iconSizeFactor`, so D6's own-icon exception must hold
   there as well as in `add()`.
9. **The ± buttons sit INSIDE `#minimap`, whose `pointerdown` opens the
   full-screen map** (`MiniMap.ts:477`). Their handlers `stopPropagation()` on
   `pointerdown`, never `click` (MouseManager suppresses `click`). The wheel
   listener is `{passive: false}`, calls `preventDefault` only over the docked
   disc, ignores `ctrlKey`, and does nothing full-screen. A trackpad fires
   dozens of events per gesture, so gate it with a cooldown or an accumulated
   `deltaY` [PLACEHOLDER]. Placing the buttons against the compass labels and
   `#mapButton` is a PO look.
10. **The stored zoom must survive a retune.** Store the value in metres, snap it
    to the nearest current step, and fall back to the default on a missing or
    non-finite value. Every `localStorage` access goes in try/catch.
11. **Rim pointer and zones.** The home fire's coordinates come from the zone
    file, which is zone-local and must NOT be offset by the origin (see
    `campfireMarkers`). There is no pointer when home is in another zone.
12. **Tests to rewrite, not delete.** `MapScale.test.ts` pins the old docked
    fit (`width / mapWidth`, "ignores height", `{width: 202}` fixtures). These
    move to the diameter signature. `c1-world-map` / `c2-campfire-markers` are
    already red at HEAD (CLAUDE.md, Known-inconclusive): record any leg whose
    meaning changes, don't chase it.

---

## 5. Verification Plan

### Automated (vitest, `frontend/src/features/map/logic/MapScale.test.ts`)

- **M1**
  - The docked scale is `V_w / meter2px(diameter)` and ignores the bounds.
    Full-screen is unchanged. A degenerate viewport or diameter gives 0.
  - The layer offset puts the focus at the canvas centre, zone origin included
    (the underworld at `{0, 300}`).
  - A null focus gives the plain centre. Full-screen always gives the plain
    centre. A non-finite input gives the plain centre.
  - The ground rectangles tile the outside of the zone without overlapping it
    and reach at least 50 m past each edge.
- **M2:** stepping clamps at both ends. A stored value snaps to the nearest
  step. Garbage and a throwing storage both give the default.
- **M3:** `rimPoint` returns null inside the radar, and a point at `R − m`
  along the correct angle outside it.

### In-game (PO, per chunk)

1. **Centring:** walk and fly. Your dot never leaves the centre, and trees,
   fires and players scroll past.
2. **Death:** die. The radar holds where you fell and does not jump to the
   world's centre. Respawn and tracking resumes.
3. **Toggle:** `M` opens a centred, letterboxed full-screen map. Closing it
   resumes tracking without a jump.
4. **Zone edge / crossing:** at `world`'s edge, Water shows past it. In the
   barn, black shows past it. Crossing redraws the ring in the new colour.
5. **Terrain + fog:** unexplored ground inside the zone stays fogged. The terrain
   is readable, and there is no shimmer while walking.
6. **Zoom (M2):** the wheel and the ± buttons step 30 ↔ 50 ↔ 100. A button press
   does NOT open the full-screen map. A reload keeps the step.
7. **Pointer (M3):** walk away from home and the pointer tracks it. It disappears
   as the fire enters the disc.
8. **Phone:** the radar works in the ☰ sheet, using the buttons. Watch the frame
   rate with the sheet closed (landmine 6).
9. **Roster (D14):** watch another player's dot move at 30 m and decide whether
   the 1 Hz step is acceptable.
