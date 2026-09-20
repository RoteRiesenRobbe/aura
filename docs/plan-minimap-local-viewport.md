# Plan: Minimap Local Viewport (Radar Mode)

> **Status: DESIGNED, NOTHING BUILT (2026-09-16).**
>
> ⭐ **Context:** Today's docked minimap (`features/map/logic/MiniMap.ts`,
> `MapScale.ts`) draws the **entire** world zone scaled down to fit inside the
> 15vw circular HUD disc (`scale = viewport.width / bounds.mapWidth`). At 144 × 72
> units (and even more so on expanded worlds, e.g. `plan-world-scale.md`), the
> entire world is crammed into ~200 px: 1 meter is ~1.4 px, the player's 20 × 12
> screen viewport is a 28 × 17 px rectangle, and surrounding props, campfires,
> and other players are packed into unreadable sub-pixel clusters.
>
> ⚑ **The ask:** Make the docked minimap show a **local fraction** of the total
> world map centered on the player (a tactical radar), while the full-screen map
> (`M` / overlay) continues to serve as the global macro-navigation map.
>
> ⛔ **Scope boundary:** Client-side presentation only. No wire protocol changes,
> no Go backend changes, no database schema changes.

---

## 1. What this is

A rework of the docked minimap state (`MapState.DOCKED`) from a whole-zone fit to
a **player-centric local viewport**.

| Chunk | What | Purity / Verification |
|---|---|---|
| **M1** | **Local Viewport Math & Camera Follow:** Add local view scale derivation in `MapScale.ts`; translate `MiniMap` layer containers in `update()` so the local player character remains centered at `(width/2, height/2)` on the docked disc. | **Pure logic testable under vitest** (`MapScale.test.ts`); in-game movement verification. |
| **M2** | **Icon & Marker Sizing Pass:** Decouple icon size scaling from the zoom level so resource icons, campfire markers, and player roster dots stay crisp and legible rather than blowing up 3–4×. | **Pure layout tests** in `MapScale.test.ts`; in-game visual check. |
| **M3** | **Terrain & Fog Integration in Docked State:** Enable the baked terrain sprite under the local docked viewport (or formalize its omission per PO ruling D4); ensure session fog mask tracks smoothly with player-relative container offsets. | **In-game / harness verification**; mobile layout check. |

---

## 2. Decision Ledger

| | Decision | Status | Rationale |
|---|---|---|---|
| **D1** | **Player is always centered on the docked minimap.** | PROPOSAL | Standard RPG / MMO minimap convention. The player's blue dot stays at `(width/2, height/2)`; the world scrolls underneath. When approaching the zone edge, out-of-bounds space / ocean naturally shows past the border wall. |
| **D2** | **Docked scale is defined by a fixed local diameter (in meters), not a raw zone fraction.** | PROPOSAL | `plan-world-scale.md` allows zones to grow from 144 units to 10×+ that size. A percentage fraction (e.g. 20 % of world) would scale a 144m world to 29m, but a 1440m world to 288m, breaking readability. A constant local diameter (e.g. **50 meters / ~6000 px**) guarantees identical tactical readability across all zones regardless of size. |
| **D3** | **Full-screen map remains the macro map.** | PROPOSAL | `MapState.FULLSCREEN` continues to letterbox and display the entire zone (`Math.min(w/mapW, h/mapH)`), with static container centering at `(w/2, h/2)`. The two states have complementary roles: docked = local radar, full-screen = world navigation. |
| **D4** | **Terrain on docked minimap: rendered from the existing baked texture.** | OPEN (PO call) | Previously (`plan-world-map.md` §4.1), terrain was disabled docked because a 2048-texel zone squeezed into 200 px was unreadable. At local zoom (e.g. 50m across a 200 px disc), terrain (roads, paths, water, grass) provides valuable orientation. Since `bakeTerrain` already produces a single cached GPU `RenderTexture`, rendering it docked costs 0 extra draw calls. Alternative: keep terrain disabled on docked minimap for ultra-clean radar look. |
| **D5** | **Compass remains static North-up.** | PROPOSAL | `HUD.less` already positions static North/East/South/West labels around `#minimap`. The main game camera does not rotate (fixed 2D perspective), so rotating the minimap would disorient navigation. |
| **D6** | **Icon and marker sizes decoupled from scale multiplier.** | PROPOSAL | Today, `iconSizeFactor = scale * 2`. At local zoom (~4× higher scale), icons would balloon to ~30 px blobs. Icon size factor must use an independent constant or damped curve for docked mode so dots remain pin-point. |

---

## 3. Mathematical Architecture

### 3.1 Scale Derivation (`MapScale.ts`)

Let:
- $V_w, V_h$: Canvas viewport dimensions in CSS/logical pixels (for docked minimap, typically ~190–220 px based on `15vw`).
- $W_w, W_h$: Zone bounds in client pixel space ($144 \times 120 = 17280$ px).
- $D_{local}$: Configured local view diameter in client pixels ($50\text{ m} \times 120\text{ px/m} = 6000$ px).

$$\text{scale}_{\text{FULLSCREEN}} = \min\left(\frac{V_w}{W_w}, \frac{V_h}{W_h}\right)$$

$$\text{scale}_{\text{DOCKED}} = \frac{V_w}{D_{local}}$$

With $V_w = 200$ px:
- Today: $\text{scale}_{\text{DOCKED}} = \frac{200}{17280} \approx 0.01157$ (1 meter = 1.39 px).
- Proposed ($D_{local} = 6000$ px): $\text{scale}_{\text{DOCKED}} = \frac{200}{6000} \approx 0.03333$ (1 meter = 4.0 px; a **2.88× zoom** increase, showing a 50m diameter circle).

### 3.2 Layer Container Positioning (`MiniMap.ts`)

In `MapState.FULLSCREEN`, layer containers are anchored at canvas center:
$$X_{\text{layer}} = \frac{V_w}{2}, \quad Y_{\text{layer}} = \frac{V_h}{2}$$

In `MapState.DOCKED`, to center the player character at $(V_w / 2, V_h / 2)$:
$$X_{\text{player, map}} = (X_{\text{player, world}} - X_{\text{zoneOrigin}}) \times \text{scale}$$
$$Y_{\text{player, map}} = (Y_{\text{player, world}} - Y_{\text{zoneOrigin}}) \times \text{scale}$$

$$X_{\text{layer}} = \frac{V_w}{2} - X_{\text{player, map}}$$
$$Y_{\text{layer}} = \frac{V_h}{2} - Y_{\text{player, map}}$$

Because all child elements (static prop icons, dynamic character icons, campfire markers, roster player dots, terrain, fog) are placed relative to the layer origin via `worldToMap()`, translating the layer containers by $(X_{\text{layer}}, Y_{\text{layer}})$ moves the entire world smoothly under the static player pin:
$$\text{ScreenPosition}(object) = \begin{pmatrix} X_{\text{layer}} + X_{\text{object, map}} \\ Y_{\text{layer}} + Y_{\text{object, map}} \end{pmatrix} = \begin{pmatrix} \frac{V_w}{2} + (X_{\text{object, map}} - X_{\text{player, map}}) \\ \frac{V_h}{2} + (Y_{\text{object, map}} - Y_{\text{player, map}}) \end{pmatrix}$$

For the player character ($object = player$), $\text{ScreenPosition} = (V_w / 2, V_h / 2)$ identically.

---

## 4. Landmines & Edge Cases

1. **`updateScaling()` vs `update()` separation:**
   `updateScaling()` only runs on window resize or state toggle (`DOCKED` $\leftrightarrow$ `FULLSCREEN`). In docked mode, layer container positions change every frame as the player moves. Layer container translation must be updated during `update()`, while container scale and marker base geometry update in `updateScaling()`.
2. **State toggle container reset:**
   When toggling to `FULLSCREEN`, layer container positions must immediately reset to $(V_w / 2, V_h / 2)$, or the full-screen map will open offset to the player's last position instead of centered on the zone.
3. **Circular aperture clipping:**
   The DOM wrapper `#minimap > .wrapper` already has `border-radius: 50%; overflow: hidden;`. This automatically clips any Pixi display objects outside the circle without needing custom stencil masks.
4. **Spectator / Pre-join state:**
   Before character selection, `playerCharacter` is null. When `playerCharacter === null`, docked mode falls back to zone center $(V_w / 2, V_h / 2)$ to avoid NaN coordinates.
5. **Fog mask offset:**
   The fog mask sprite is parented to `terrainLayer`. When `terrainLayer` moves with the player, the fog mask moves with it in lockstep. `MapFog.revealAt()` continues to stamp at zone-local coordinates, so fog accumulation is completely unaffected by minimap viewport movement.

---

## 5. Verification Plan

### Automated Tests
- Unit tests in `frontend/src/features/map/logic/MapScale.test.ts`:
  - Verify `mapScale(MapState.DOCKED, ...)` scales according to local diameter rather than whole zone bounds.
  - Verify container offset calculation yields exact canvas center $(V_w/2, V_h/2)$ for player world position.
  - Verify degenerate bounds / zero viewports return safe fallbacks.

### In-Game Manual Verification
1. **Player Centering:** Move player across zone; verify blue dot remains stationary in the exact center of the minimap circle while props and markers scroll past.
2. **Local Radius / Visibility:** Stand next to campfires, trees, and other players; verify distances and icons match immediate surroundings.
3. **Map State Toggle:** Press `M` to toggle between docked minimap and full-screen map; verify full-screen map opens properly letterboxed and centered, and returning to docked resumes player tracking smoothly.
4. **Zone Boundary:** Walk to the outer zone wall; verify world edges scroll past the minimap disc gracefully without visual glitches.
5. **Mobile Viewport:** Verify docked minimap in mobile sheet menu behaves identically.

