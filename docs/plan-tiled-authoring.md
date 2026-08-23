# Plan: Authoring `world.json` in Tiled

> **Status: DESIGNED 2026-08-22 (D1–D8). ✅ C0 + ✅ C1 + ✅ C2 SHIPPED 2026-08-22,
> uncommitted — world.json opens in Tiled with the real game art and saves back
> byte-identical; only C3 (manual + verify leg) is left.** Planning session opened
> by the PO question *"how feasible is an external level editor like LDtk or
> Tiled, and which one?"* Three rulings were taken as choice prompts in the
> same session (tool · integration shape · scope) and are recorded as D1–D3;
> D4–D8 are proposals adopted without a prompt (§8 — the PO may veto any).
>
> ⚑ **This re-opens two recorded rulings, deliberately and by PO request.**
> `plan-world-zones.md` §1.3 (2026-07-09) chose the in-game editor *"not Tiled,
> not hand-written JSON"*, and `plan-content-tooling.md` **D9** (2026-08-09)
> cut the standalone map editor. Neither is contradicted at the level that
> matters: **D7 of that plan still holds** — bulk placement stays AI-side in
> `scripts/world-place.py` / `world-regions.py`. What changes is only the
> *human spot-edit* surface, which is exactly the half D7 assigned to a human
> editor. See §9 for what this closes elsewhere.
>
> ⚑ **Schema impact: NONE. No migration.** Dev-side authoring tooling and
> static content files only; not one byte of the persisted shape moves (§5).

## 1. What this is, and why now

The in-game zone editor is a capable **placement** tool and a poor **editing**
tool. Two gaps, both recorded, both parked:

- **Nothing can be moved.** Repositioning a prop / spawn / campfire / anchor is
  delete + re-place, re-entering every knob, in all seven modes
  (`manual-zone-editor.md` §4, §5b). Designed as `plan-content-tooling.md` C2,
  blocked behind its unbuilt C1 endpoint.
- **Terrain cannot be selected at all** — 537 pieces, the largest array, with
  one-step Undo and nothing else (backlog **§58**, PO-parked 2026-08-21: *"I
  need replacement and rotation control — not yet there it's ok"*). §58's own
  finding is that *the hard part is picking, not editing*: the store is a flat
  `GroundTexture[]` with no addressing, the art is an irregular blob in a square
  canvas so bounds-picking hits empty corners, and `stacking: 'bottom'`
  unshifts, so list index ≠ z-order.

Tiled ships select / move / rotate / scale / flip / multi-select / undo /
copy-paste over exactly those objects, and — unlike LDtk — it can be taught to
**read and write `api/zones/world.json` directly**. The file stays the single
source of truth; there is no conversion step to forget.

**Target state:** open `api/zones/world.json` in Tiled, edit any of its six
arrays visually, Ctrl+S, get a byte-identical-where-unchanged file back that the
server boots and the in-game editor still round-trips.

### 1.1 The feasibility answer

**High — because none of Aura's world is a tilemap.** Every array is freeform
floats and there is no grid and no snapping anywhere in the pipeline (the editor
converts a raw pointer position straight to units, `_ZoneEditorPanel.ts:498`).
The *tile* half of both tools is therefore dead weight, and only the **object
layer** matters. There the two tools diverge decisively:

| Aura needs | Tiled object | LDtk entity |
|---|---|---|
| float x/y | ✅ | ✅ |
| arbitrary rotation (`terrain`, `props`) | ✅ `rotation` | ❌ open issue deepnight/ldtk#841 |
| free scale (`terrain.size`) | ✅ width/height | ❌ int-px resize only |
| h/v flip (`terrain.flipped`) | ✅ tile flip flags | ❌ open issue deepnight/ldtk#978 |
| circles (`darkAreas.radius`) | ✅ ellipse object | ❌ rect/point only |
| polylines (`spawns.waypoints`) | ✅ polyline object | ~ point-array field |
| typed fields per instance | ✅ classes + enums, importable from JSON | ✅ (best in class) |
| **custom format inside the tool** | ✅ `tiled.registerMapFormat` (`read` + `write`) | ❌ no plugin API — a converter is mandatory |

LDtk's entity editor is the nicer of the two, but it would leave the 537-piece
terrain layer — the parked pain — uneditable. **Tiled it is.**

## 2. Decision ledger

D1–D3 taken 2026-08-22 as choice prompts; D4–D8 are §8 proposals.

- **D1 — Tiled**, object layers only. No tile layer is ever created.
- **D2 — Native round-trip, not a converter.** A checked-in Tiled JS extension
  registers `world.json` as a map format with both `read` and `write`. No
  intermediate `.tmj`, no second file that can drift, no conversion command in
  the loop. The same registration is drivable headlessly via `--export-map`.
- **D3 — All six arrays** (`terrain`, `props`, `spawns`, `campfires`,
  `darkAreas`, `anchors`) plus `name` / `bounds`. Same mechanism for all of
  them; the incremental cost over terrain-only is palette generation, and the
  mob sprites already exist as individual PNGs.
- **D4 — Coexistence.** The in-game editor is not retired. It keeps the one
  thing Tiled structurally cannot do — edit while standing in the live world —
  and it is the only surface the Playwright leg drives. D6 is what makes
  coexistence safe.
- **D5 — Layer name selects the array; object class validates it.** A `terrain`
  object landing in the `props` layer is an authoring error the writer rejects,
  not something it guesses at.
- **D6 — Byte-stability is the acceptance criterion, not a nice-to-have.**
  `ZoneModel.getZoneAsJSON()` (`ZoneModel.ts:324-394`) is the canonical
  serializer — field whitelist, fixed key order (also recorded as `KEY_ORDER` in
  `scripts/world-place.py`), x/y/size 2 dp, angles 3 dp, `undefined` keys
  dropped. The extension re-implements it exactly. **Load → save with no edits
  must produce a zero-byte `git diff`.** Without this, every alternating
  Tiled / in-game save produces a 260 KB diff and review dies.
- **D7 — Palettes are generated, never hand-maintained.** Mirrors the in-game
  editor's `require.context` over `api/` (*"so the editor can never drift from
  what the server loads with `-content ../api`"*, `ZoneEditor.ts:47`).
- **D8 — Schema impact NONE**, verified by enumeration (§5).

## 3. What this plan deliberately does NOT cover

- **Bulk placement stays AI-side** — `plan-content-tooling.md` **D7** is
  untouched. `scripts/world-place.py` / `world-regions.py` remain the way 423
  combat spawns get levelled and re-skinned. Tiled is for spot edits.
- **The dev save endpoint** (`plan-content-tooling.md` C1) is neither built nor
  needed here — Tiled writes the file on disk directly. C1 remains owned by
  that plan for the in-game editor's benefit.
- **Hot reload.** Unchanged (that plan's D4): a server restart still applies
  props/spawns, and a frontend rebuild still applies terrain, because the client
  bundles zone terrain via `require.context`
  (`GroundTextureManager.ts:144`).
- **No format change.** Not one field is added, removed or re-meant. If Tiled
  cannot express something, that is recorded (§10), not fixed by widening the
  schema.
- **Encounters stay Go** (backlog §17) — Tiled renders anchors and stops there,
  exactly as the in-game editor does.

## 4. Design

### 4.1 The format, as the extension must see it

`backend/pkg/aura/world/zone.go` is authoritative and parses with
`DisallowUnknownFields` (`:265`) — **the writer must emit exactly the known keys
and nothing else.**

Units: **1 unit = 120 px** (`codec.Points2px` / `BasicConfig.PIXEL_PER_METER`,
both pinned to `api/shared-constants.json` `pointsPerMeter`). Origin is
world-centre and **+y is down**, the same convention Tiled uses. Bounds are
188 × 144 units, so the Tiled map is 188 × 144 tiles of 120 px — the grid is a
visual ruler only, nothing snaps to it.

| world.json | Tiled representation | conversion |
|---|---|---|
| `bounds` | map size in tiles, tile size 120 px | `x_px = (u + width/2) · 120` |
| `terrain[]` | tile object, layer `terrain` | ⚑ **`size` is a HALF-EXTENT** — `createInjectedSVG` doubles it (`InjectedSVG.ts:22-24`) — so object w = h = `size · 2 · 120`; `rotation` rad → deg; `flipped` → tile flip flags |
| `props[]` | tile object, layer `props` | `rotation` rad → deg; `blocksMovement` custom bool |
| `spawns[]` | point object, layer `spawns` | `angle` rad → deg; the rest as custom properties |
| `spawns[].waypoints` | **polyline** object, layer `spawn-routes`, first vertex = the spawn position | pairs to its spawn by object name |
| `campfires[]` | point object, layer `campfires`, object `name` = `id` | `startingSpawn` custom bool |
| `darkAreas[]` | **ellipse** object, layer `darkAreas` | `radius = width/2`; the writer enforces w == h |
| `anchors[]` | point object, layer `anchors`, object `name` = anchor name | — |

### 4.2 Landmines the writer must respect

All measured this session against the shipped file — do not re-derive:

1. **Tri-state pointers.** `wanderRadius`, `idleSpeedFactor` and `level` are
   `*float32` / `*int`: absent means *inherit the species value*, and an
   explicit `0` on `wanderRadius` means *force stationary* — a bridge guard of a
   wandering species (`zone.go:88-99`). A Tiled property that is always present
   would silently rewrite ~226 wandering mobs. Each needs an explicit "inherit"
   sentinel.
2. **Talkers carry no respawn keys at all.** The omit predicate is
   *interaction-presence on the mob def*, never "the input was empty"
   (`ZoneModel.ts:43-51`) — an absent `respawnTicks` parses to `0` server-side,
   which means *respawn next tick*. 17 spawns depend on this.
3. **`patrolMode` is omitted unless `"loop"`**; `waypoints` omitted when empty.
4. **Terrain array order IS paint order** (`GroundTextureManager.ts:23-35`;
   later entries paint over earlier ones). The `terrain` object layer must be
   set to manual draw order (`draworder: index`) or Tiled's default y-sort makes
   the canvas lie about what covers what.
5. **Rotation origin.** Tiled tile objects anchor at their **bottom-left** and
   rotate about that point; Aura rotates about the sprite centre. The conversion
   is invertible but must be exact — this is C0's kill criterion.
6. **`terrain.type` is validated nowhere** — the server ignores the field
   entirely (`zone.go:107-114`) and the client does an unguarded
   `groundTextureTypes[t.type]` (`GroundTextureManager.ts:174`), so a typo fails
   at *render* time in the browser. A generated enum palette closes this for
   free; treat it as a bonus, not scope.

### 4.3 Where it lives

`tools/tiled/extensions/aura-zone/`, checked in and version-controlled, plus
`tools/tiled/aura.tiled-project` for the folder view.

⚑ **C0 finding — the extension cannot stay project-local.** A project
`extensionsPath` does **not** load for Tiled's headless `--export-map` path
(measured: relative, subdirectory *and* absolute all fail; the control proves
the user directory was doing the work). `tools/tiled/install.sh` copies the
extension into Tiled's user extensions directory, once per machine. The source
of truth stays in the repo; only the install is per-machine.

## 5. Schema impact

**NONE — no migration.** By enumeration: C0 and C1 add files under `tools/`
and touch no Go, no wire, no DB. C2 adds generated palette assets. C3 is docs.
The one persisted identity anywhere near this — `Campfire.ID`
(`characters.home_campfire_id`, `zone.go:126-135`, *never reuse a number*) — is
carried through the round-trip verbatim as the Tiled object's `name`, and D6's
byte-stability test is what proves it was not re-minted.

## 6. Chunk breakdown

| Chunk | Contents | Size |
|---|---|---|
| **C0** | Spike: three go/no-go checks (below). Deliverable is a throwaway read-only extension drawing terrain + props as plain rectangles | half a session |
| **C1** | The format extension, `read` + `write`, all six arrays, shapes only — no art | medium |
| **C2** | Generated palette: tilesets + custom types, from `api/` and the frontend assets | small–medium |
| **C3** | `manual-tiled-editor.md`, the verify leg, and the bookkeeping in §9 | small |
| **C4** | Save-time validation: mirror zone.go's rules in the writer, refuse with an object id (§12.1) ✅ SHIPPED | small |
| **C5** | Keeping the editor in step with the game: one-command content refresh, **plus a completeness pin against zone.go's json tags** so a new FIELD cannot be silently dropped (§12.2) ✅ SHIPPED | small |
| **C6** | Dropdowns + typed spawn fields via out-of-range inherit sentinels (§12.3) ✅ SHIPPED | medium |

### C0 — the spike ✅ PASSED (ledger: §11)

- **(a) Assets.** ✅ **PASS.** 15 of 18 terrain textures are SVG and Tiled SVG
  *tile* support is an open issue (mapeditor/tiled#2011) — but the shipped build
  carries `plugins/imageformats/qsvg.dll`, so Qt's image reader loads them as
  **image-collection tiles**. `land1.svg` rendered correctly. **C2 needs no
  rasterization step.**
- **(b) Rotation / origin round-trips exactly.** ✅ **PASS**, fully characterized
  — formulas in §11.
- **(c) A project-local extension loads.** ⚠ **PASS WITH A CAVEAT** — extensions
  load from the *user* directory, not from the project. See §11 and `install.sh`.

### C1 — the format extension ✅ SHIPPED (ledger: §11)

Split so the risky half is testable **without Tiled**:

- `tools/tiled/extensions/aura-convert.js` — **pure functions, no Tiled API**:
  `zoneToModel(json)` / `modelToZone(model)` plus the canonical serializer
  ported from `ZoneModel.ts:324-394` and
  `GroundTextureManager.getTerrainServerUnits()`.
- `tools/tiled/extensions/aura-world-format.js` — Tiled glue only:
  `tiled.registerMapFormat('aura-world', {name, extension: 'json', read, write})`.

### C2 — the generated palette ✅ SHIPPED (ledger: §11)

One generator, `tools/tiled/generate-palette.mjs`, run as an npm script, output
checked in:

- **Image-collection tilesets** for terrain (18 types from
  `Graphics.groundTextureTypes`), props (5, via `api/props/*.json` →
  `entityType` → the `Resources.ts` sprite), and mobs (48 used species; the
  PNGs already exist per-species in `game-objects/assets/mobs/`).
- **Custom types** (`propertytypes.json`, which Tiled can import) generated from
  `api/mobs/` and `api/props/`: enums for mob name / prop type / terrain type /
  `patrolMode` / `flipped`, and classes `AuraSpawn`, `AuraProp`, `AuraTerrain`,
  `AuraCampfire`, `AuraDarkArea`, `AuraAnchor` carrying §4.2's sentinels.

⚑ The generator must **fail loudly** on any content type it cannot resolve to a
sprite, never emit a silent gap — the same hard-fail ethos as the loaders.

## 7. Test strategy

1. **Byte-stability — the gate (D6).** Open in Tiled → Ctrl+S with no edits →
   `git diff --exit-code api/zones/world.json`. Zero bytes, or C1 is not done.
   ⚑ Take the baseline against a *decided* file: `api/zones/world.json` is dirty
   in the working tree right now (`bounds` 144×72 → 188×144 plus one prop
   rotation) and `backend/pkg/api/zones/world.json` is a **stale embedded copy**
   — settle both before measuring, or the gate measures the wrong thing.
2. **Unit tests** (`cd frontend && npm test`) — `aura-convert.js` round-trips the
   shipped `world.json` object-for-object, the same pattern
   `ZoneModel.test.ts` already uses against the same file, plus one targeted case
   per §4.2 landmine: tri-state inherit vs. explicit `0`, a talker keeping zero
   respawn keys, `patrolMode` omission, the terrain half-extent, and a
   rotated + flipped terrain piece.
3. **Headless round-trip** — `tiled --export-map aura-world api/zones/world.json
   <tmp>/out.json`, then diff. No GUI, scriptable, and CI-able if CI ever
   returns (it is off by choice — PO 2026-08-12).
4. **The server boots it** — `./aurad -dev -content ../api`, census unchanged
   (537 terrain / 777 props / 488 spawns / 5 campfires / 35 dark areas /
   4 anchors) at **0 WARN / 0 ERROR**. ⚑ `go test -count=1 ./...` — a content
   edit does not invalidate the Go test cache.
5. **In-game** — the `verify` skill. `c3-zone-editor-level.mjs` must still pass
   unchanged; it drives the in-game editor's real export path, so it is the
   direct proof of D4 coexistence.
6. **Edit-for-real smoke** — move a terrain patch and a prop in Tiled, save,
   restart, confirm both moved in-game; then place a prop in the *in-game*
   editor, export, and confirm Tiled reopens the result cleanly. Both directions,
   or coexistence is unproven.

## 8. Proposals adopted without a choice prompt (PO may veto)

1. **D4 coexistence** — neither editor is retired. Alternative (freeze the
   in-game editor's terrain/prop modes) is cheap to take later and irreversible
   to take now.
2. **D5 layer-name-as-selector** — the alternative, class-only, survives
   layer renames but makes an accidental cross-layer drag silently valid.
3. **D6 byte-stability as a hard gate** rather than "canonicalize once and
   accept one big diff". The one-big-diff route is defensible if the PO would
   rather not spend C1 on serializer fidelity — say so and C1 shrinks
   noticeably.
4. **`tools/tiled/` as the home**, not `frontend/`. Driven by D7's generator
   needing both `api/` and the frontend asset tree, and by the extension being
   Tiled's, not the client's.
5. **Spawn objects are points, not mob sprites, if C2's mob tileset slips** —
   the in-game editor itself only draws coloured diamonds
   (`SPAWN_KIND_STYLE`, `ZoneEditor.ts:171`), so this is not a regression.

## 9. What this closes or re-scopes elsewhere

- **backlog §58** (terrain: no select / move / rotate) — the direct target. Not
  closed until C1 + C2 ship and the PO has moved a real texture.
- **`plan-content-tooling.md` C2** (in-game drag-to-move) — largely obsolete for
  terrain and props if this lands; it retains value for spawns/campfires/anchors
  only if the PO prefers editing those in-world. Re-scope, don't delete.
- **`plan-content-tooling.md` D7/D9** — explicitly **not** overturned; §3 above
  restates the boundary.
- **`roadmap.md` §4's open flag** (*"external editor (e.g. Tiled) vs. custom
  JSON — biggest unknown in this item … decide when this item starts"*) and
  **`tdd.md:69`** — both answered: the custom JSON stays, and Tiled becomes a
  second editor on top of it rather than a replacement format.
- **`plan-world-zones.md` §1.3** (*"not Tiled"*, 2026-07-09) — superseded on the
  editor question only; the zone format that ruling chose is untouched.

## 10. Known costs, stated plainly

- **A second editing surface.** D6 is what keeps that from becoming a merge
  problem, and it is the single biggest risk in this plan.
- **Tiled is a third-party dependency for authoring only.** The game does not
  depend on it and `world.json` stays hand- and script-editable.
- **`props.rotation` is authored but never rendered** (`zone.go:29-34`), and
  rect bodies never rotate at all. Tiled will happily let you rotate a House and
  the server will ignore it — flagged in the manual, not fixed here.
- **`api/props/` carries no anchor/pivot and world.json no z-order.** Prop
  layering is fixed by render class (`Game.ts:212-333`), not authorable. Tiled
  cannot expose what the format does not carry.
- **Terrain edits still need a frontend rebuild**, because the client bundles
  zone terrain itself. Unchanged from today, but it will surprise anyone who
  expects a level editor's save to be enough.

## 11. Chunk ledgers

### C0 — spike ✅ PASSED 2026-08-22 (uncommitted)

Environment: **Tiled 1.12.2**. Everything below was measured **headlessly** —
`tmxrasterizer.exe` ships with Tiled and renders object layers, so the semantics
were read off actual pixels rather than assumed.

**(a) SVG assets — PASS, and it removes work.** `plugins/imageformats/qsvg.dll`
is present, so Qt's image reader loads `.svg` as image-collection tiles even
though *vector tile* support (mapeditor/tiled#2011) is unimplemented.
`land1.svg` rendered correctly beside `sand1.png` and `roundTree.png`.
**C2 loses its rasterization step**; the 15 SVG textures are usable as they are.

**(b) Rotation / origin / flip — PASS, exactly.** Probed with a generated
100×100 four-quadrant marker (TL red · TR green · BL blue · BR white) at
rotations 0/45/90, both flips, and flip+rotation combined. Measured semantics:

- A tile object's `(x, y)` is the **bottom-left corner of the unrotated,
  unflipped box**.
- `rotation` is **degrees, clockwise** (screen +y down), **about `(x, y)`** —
  not about the centre.
- gid flip bits (H `0x80000000`, V `0x40000000`) mirror the image in **local
  space, before rotation**, and do not move the anchor.

Aura's side, confirmed in code: `createInjectedSVG` sets `anchor 0.5/0.5`, so
`(x, y)` is the **centre**; `size *= 2` confirms `size` is a **half-extent**;
`sprite.rotation` is radians clockwise; `GroundTexture.addToMap` flips via
`scale.x/y *= -1`, i.e. local space before rotation. **Same order, same
handedness** — so the mapping is a pure change of anchor:

```
w = h = size · 2 · 120                     (px)
deg   = rad · 180/π
x = cx − ( (w/2)·cos θ + (h/2)·sin θ )
y = cy − ( (w/2)·sin θ − (h/2)·cos θ )     (inverse: swap − for +)
```

⚑ **C1 must use this formula.** The C0 probe still carries the naive
`centre − s/2`, which is correct only at rotation 0.

**(c) Extension loading — PASS with a caveat that changes §4.3.** The extension
loads and works from Tiled's **user** extensions directory: it read the real
`api/zones/world.json` and produced **1846 objects** (`nextobjectid = 1847`),
matching the census exactly. But a project-local `extensionsPath` does **not**
load for `--export-map` — tested relative, in a subdirectory, and absolute; all
exit 1, with a control run proving the user directory was doing the work. Hence
`tools/tiled/install.sh`, run once per machine.

**Bonus finding 1 — the `.json` collision is a non-issue.** `world.json` shares
its extension with Tiled's own JSON map format, which looked like a threat to
D2. It is not: Tiled tries readers in turn and **falls through to ours** when
its own rejects the file. `world.json` opens directly — no rename, no
intermediate file. D2 stands as designed.

**Bonus finding 2 — landmine 4 confirmed live.** The exported layers came back
`draworder = "topdown"`. C1 must set index/manual order explicitly on `terrain`,
or the canvas misrepresents which piece covers which.

**Numerical spot-check** on the first terrain entry
(`{"type":"Land","x":-49.32,"y":26.6,"size":1.75,"rotation":6.176}`): exported
as `width = height = 420`, `x = 5151.6`, `y = 11622`, `rotation = 353.859` — all
four correct against the formulas above.

**Artifacts:** `tools/tiled/aura.tiled-project`,
`tools/tiled/extensions/aura-zone/c0-probe.js` (throwaway, read-only, replaced
by C1), `tools/tiled/install.sh`. A full-world overview render was produced from
the probe and shows terrain, props, spawn points and the 35 dark-area circles in
the right places — including the empty margin left by the uncommitted bounds
widening (§7 item 1).

**Verdict: no kill criterion fired. C1 is unblocked.**

### C1 — the format extension ✅ SHIPPED 2026-08-22 (uncommitted)

`api/zones/world.json` now opens in Tiled and saves back to itself. Built as
two files so the risky half is testable without Tiled, exactly as designed:

- `tools/tiled/extensions/aura-zone/aura-convert.js` — pure, no Tiled API: the
  canonical serializer, the unit/anchor math, the tri-state omit rules.
- `tools/tiled/extensions/aura-zone/aura-world-format.js` — glue only:
  `tiled.registerMapFormat('aura-zone', {read, write})`.
- `frontend/src/features/zone-editor/logic/AuraTiledConvert.test.ts` — 24 cases.

**D6's gate is met, end to end through real Tiled.** `--export-map aura-zone`
over the shipped file returns **266073 bytes, byte-identical**, all 1846
objects — and identically for the committed blob, which uses the *other*
trailing-newline convention (L4).

**L1 — Tiled's `TextFile` writes CRLF on Windows.** It added exactly one byte
per line: 14602 on a 266073-byte file, on every save, against an LF repo. The
writer therefore goes through **`BinaryFile`** with a hand-rolled UTF-8 encoder
(QJSEngine has no `TextEncoder`, and `JSON.stringify` does not escape
non-ASCII, so a non-ASCII zone or mob name would otherwise corrupt silently).
The encoder is pinned against `TextEncoder` in the tests, including over the
whole shipped file.

**L2 — two anchor conventions, not one.** C0 measured tile objects; plain
**rectangles anchor at their TOP-LEFT** and rotate about that, where tile
objects use the bottom-left. C1 has no tilesets, so terrain and props are
rectangles. Both formula pairs are kept and selected by one `ANCHOR` constant,
which is the whole of C2's switch when tilesets arrive.

**L3 — gid flip flags need a tile.** With no tilesets there is nowhere to put
`flipped`, so in C1 it rides a **custom property** (absent = `none`; 76 pieces
carry it). C2 moves it onto real flip flags. Nothing is persisted in the Tiled
shape, so reader and writer simply change together — no migration.

**⭐ L4 — the repo already had TWO zone writers disagreeing by one byte**, found
by running the gate rather than by reading code. `scripts/world-place.py:458`
writes `json.dumps(...) + "\n"`; `ZoneModel.getZoneAsJSON` is a bare
`JSON.stringify` with none. The committed `world.json` ends `0a 7d 0a` (the
Python one), the working copy ends `5d 0a 7d` (none). Taking either side would
leave this tool permanently one byte off the other writer, so it **takes no
side**: the trailing newline found on read is reproduced on write. Verified
against both conventions.

**⚠ L5 — `core.autocrlf = true` with no `.gitattributes`, and this is NOT
fixed here.** Git reports *"LF will be replaced by CRLF the next time Git
touches it"* for `api/zones/world.json`. If a checkout ever rewrites it as
CRLF, every save from **all three** writers (Tiled, the in-game editor, the
Python scripts) produces a whole-file diff — this is a pre-existing repo
condition that C1 merely surfaced, and the byte-stability gate rests on it.
The minimal fix is a `.gitattributes` pinning `api/zones/*.json` (or `*.json`)
to LF. Repo-wide git behaviour is a PO call, so it is flagged, not applied.

**Design notes worth keeping**

- **Layer name selects the array (D5), enforced.** An unrecognised object layer
  makes the writer **refuse the save** rather than silently drop it — a
  dropped layer would delete content.
- **A patrolling spawn IS its route**: a polyline whose origin is the spawn and
  whose first vertex is that origin, so editing a patrol is dragging vertices.
  The 6 routed spawns round-trip exactly, `patrolMode` omission included.
- **`name` and `bounds` ride map properties**, not the tile grid, so fractional
  bounds cannot be lost to `Math.ceil`.
- **Props draw a nominal 1-unit box** and it is DISPLAY ONLY — `world.json` has
  no prop size, so the writer recovers the centre from whatever box Tiled
  reports and emits no size. Resizing a prop in Tiled is silently discarded;
  C2 supplies true per-type sizes from `api/props/` with the tilesets.

**⭐ L6 — the stale `backend/pkg/api/` mirror IS reproducible, and the CLAUDE.md
note about it can be closed.** The standing item reads *"the reported stale
`backend/pkg/api/mobs/` mirror (embedded boot hard-fail, found 2026-08-17) is
still NOT reproducible here — two clean embedded boots since; re-verify on the
finder's checkout before acting."* It reproduces here, on this checkout:
`go test ./...` fails 3 tests in `cmd/simharness`, all one cause —

    mob "AngryMammoth": tier "elite" must author factors.ccImmune

**Why it was missed:** the earlier verifications were *boots*, and a boot with
`-content ../api` never reads the embedded copy. `cmd/simharness`'s tests load
the **embedded** content, so they see a mirror last committed **2026-07-21**
(`aa509d95`) against an `api/` last committed 2026-08-19. It holds **65 mob
defs against 61**, and the 10 extras are exactly the legacy defs deleted at
zone-editor C3 (`angry-mammoth`, `brazier`, `dodo`, `healer`, `mammoth`,
`proving-add`, `proving-boss`, `proving-guard`, `rabbit`, `saber-tooth-cat`).
`backend/pkg/api/zones/world.json` is stale in the same way (still 144×72).

⚠ **Unrelated to this chunk and deliberately NOT fixed here.** Nothing in
`api/` or `backend/` was touched by C1. The fix is one command,
`make -C backend cp-defs`, but it rewrites the whole generated mirror — a
broad diff that belongs in its own commit, not smuggled into a tooling chunk.

**Verified:** vitest **399/399** (26 files, 24 new) · `tsc --noEmit` clean ·
`go build ./...` clean · `go test ./pkg/aura/world/...` green (the zone loader,
the package this chunk is about) · Tiled round-trip byte-identical on both
newline conventions · `api/zones/world.json` untouched by this chunk (its diff
is still only the pre-existing bounds widening plus one prop rotation).
⚠ `go test ./...` is **red at 3 tests** for the pre-existing L6 reason above,
not for anything C1 did.

**Not in C1, by design:** no sprites, so every object is an untextured outline,
and a spawn shows its mob name but none of its knobs as typed fields. That is
C2.

### C2 — the generated palette ✅ SHIPPED 2026-08-22 (uncommitted)

The canvas has real art. Terrain and props are tile objects drawn from the
game's own assets, flips ride real gid flags, props sit at their true physics
footprint, and spawns are coloured by derived kind.

- `tools/tiled/generate-palette.mjs` — one generator, output all checked in.
- `tools/tiled/palette/terrain.tsx` — **16** ground textures.
- `tools/tiled/palette/props.tsx` — 5 props (Boulder, GateWall, House, Rock, Tree).
- `tools/tiled/palette/propertytypes.json` — 5 enums + 8 classes.
- `tools/tiled/extensions/aura-zone/aura-content.js` — generated prop bodies +
  derived mob kinds (61 mobs: 27 combat, 19 talker, 11 fixture, 4 companion).

**The round-trip still holds**, verified in three placements: the normal
`api/zones/world.json`, a copy elsewhere in the repo carrying the *other*
trailing-newline convention, and a file outside the repo (correctly refused).

**Corrections to this plan's own text.** §6 C2 said "18 types" and §4.2 implied
a rasterization step; both were wrong. There are **16** ground textures
(measured from `Graphics.groundTextureTypes`), and C0 had already established
that Qt's SVG plugin loads the 14 SVG textures directly — **no rasterization,
no asset copies**. The tilesets reference the frontend's real files by relative
path, so the art can never drift from what the game draws.

**⭐ Scope cut, invoking §8 proposal 5: no mob sprite tileset.** Only **12 of
61** mob defs carry an `entityType`; a mob's sprite is otherwise chosen by a
hand-written class in `Mobs.ts`, so the palette would have been a hand-
maintained name→sprite table — exactly the drift D7 forbids. Spawns instead
get a **class per derived kind** (`AuraSpawnCombat` / `Talker` / `Fixture` /
`Companion`) carrying the in-game editor's own marker colours verbatim
(`SPAWN_KIND_STYLE`). `kindOf` is mirrored from `ZoneModel.ts`. This is not a
regression: the in-game editor only ever drew coloured diamonds either.

**L7 — `tiled.open()` is GUI-only.** It throws *"Editor not available"* under
`--export-map`, which is precisely how this format is tested and how it would
run in CI. **`tiled.tilesetFormat('tsx').read(path)` works in both** and is
what ships. Worth remembering for any future Tiled scripting here.

**L8 — `tile.setImage()` will not take a path string** ("Passing incompatible
arguments to C++ functions"); `new Image(path)` loads fine (and confirmed SVG
support a second time) but leaves `imageFileName` empty, embedding pixels
instead of referencing files. Moot given L7's answer, recorded so it is not
rediscovered.

**L9 — the palette is found by walking UP from the zone file, not at a fixed
depth.** The first cut assumed `<zone>/../../tools/tiled/palette`, which works
only for a file at exactly `<root>/api/zones/`. It was caught by the
committed-blob round-trip check regressing from C1 — a check that existed only
because of L4. A zone outside the repo now fails with a message naming the
cause instead of dying silently.

**⚑ Deliberately NO class members for the tri-state spawn knobs.** A Tiled
class member carries a default, which would make the property present on every
object and silently rewrite the ~226 spawns that inherit `wanderRadius`. The
classes carry colour only; the enums (`AuraMobName`, `AuraPropType`,
`AuraTerrainType`, `AuraPatrolMode`, `AuraFlipped`) are where the typing value
is, and they cost nothing at write time.

**⚑ One manual step, unavoidable.** Tiled custom types are *project* state, not
map state, so `palette/propertytypes.json` has to be imported once per machine
via the Custom Types editor. The tilesets need no such step.

**Prop resize is now visibly wrong rather than invisibly discarded** — a House
draws at its true 4×3 units. It is still discarded on save (world.json has no
per-prop size); making that authorable is `docs/plan-prop-scale.md`, written
this session off the PO's observation.

**Verified:** vitest **405/405** (30 in `AuraTiledConvert.test.ts`, 6 new for
C2) · `tsc --noEmit` clean · generator idempotent · Tiled round-trip
byte-identical in both trailing-newline conventions · zero tile layers, zero
gids outside the two palettes.

### C3

*(filled per chunk at execution time)*

### C4 — save-time validation ✅ SHIPPED 2026-08-23 (uncommitted)

Everything the server would reject at boot is now refused by Ctrl+S, naming
the **Tiled object id** so *Edit ▸ Select Object by Id* jumps straight to it.
Refusing costs nothing: Tiled keeps the document open, so no edit is lost.

- `aura-convert.js` — `validateModel(model)` → a list of messages, plus
  `formatErrors()` for the one string Tiled shows. Pure, so vitest owns it.
- `aura-world-format.js` — one call in `write()`, before serializing, and the
  Tiled object `id` carried into the model for the sole purpose of the message.
- `generate-palette.mjs` — `aura-content.js` grew the two vocabularies the
  checks needed: `TERRAIN_TYPES` and `MOB_SPEED`.

**⭐ The wrong-layer message says which layer is right.** The chunk was opened
by a Tree tile dropped on the `spawns` layer, so the check does not stop at
*"unknown mob"* — it looks the name up in the other two vocabularies and
answers the actual question:

```
spawns #101 "Tree" (spawns[0]): unknown mob "Tree" — "Tree" is a prop type,
so this object belongs in the "props" layer, not "spawns"
```

The reverse direction works too (a Wolf on `props` points back at `spawns`),
because the vocabularies were already generated and to hand.

**⭐ `terrain.type` is now validated somewhere, for the first time.** The
server has no terrain checks at all and the client dereferences `undefined` at
render time, so a typo used to show up as a broken browser. It was free here:
the enum already existed for the palette.

**⚑ Two checks are Tiled-side only, and neither exists server-side.**

- **A dark area dragged out of round is refused.** `world.json` carries one
  `radius` and the writer reads it off the width, so a stretched ellipse would
  have silently lost its height. Tolerance is half a pixel; the message says to
  hold Shift.
- **`respawnTicks` / `respawnVariancePct` must be non-negative.** The Go
  loader takes any number here (they are plain ints, not pointers), so this is
  the editor being stricter than the format. Deliberate: a negative respawn is
  never intended.

**⚑ The speed check needs content, not just the file.** `zone.go` makes
*"stationary mob cannot wander or patrol"* in `resolve()` rather than
`validate()`, because it needs the bound species. That is the whole reason
`MOB_SPEED` joined the generated content — the rule cannot be checked from
`world.json` alone.

**⚑ The vocabulary checks skip themselves when the generated content is
absent**, so the converter stays usable and unit-testable without
`aura-content.js`. The structural checks (bounds, uniqueness, ranges, route
shape) always run.

**⚑ Headless Tiled reports the refusal as an exit code and nothing else.**
`--export-map` on a bad file exits 1 and writes no output, but prints no
message — the string `write()` returns is surfaced by the GUI's error dialog,
which is where authors will see it. The message text is therefore pinned by
vitest rather than by the CLI. The exit code alone still makes the check
scriptable, which is what a CI leg would want if CI ever returns.

**Message cap: 12.** A layer mistake made in bulk — the likely case, since
these are drag operations — would otherwise scroll its own first line out of
the dialog. The count is always honest (`40 problem(s)`, `… and 28 more.`).

**Verified:** vitest **422/422** (17 new, `AuraTiledConvert.test.ts` 30 → 47) ·
`tsc --noEmit` clean · generator idempotent (identical output twice) · the real
Tiled round-trip on the working `api/zones/world.json` still **byte-identical**
(271937 in, 271937 out) with validation active · a hand-built zone with a Tree
in `spawns` refused, exit 1, no file written · the shipped `world.json` is
pinned clean by a test, so the rules cannot drift into false positives.

**Schema: NONE.** No game code, no content, no wire, no DB — the writer only.

### C5 — keeping the editor in step with the game ✅ SHIPPED 2026-08-23 (uncommitted)

Adding content is now one command, and a new *field* can no longer be dropped
in silence.

**Half 1 — content.** The extension is two script files and carries **no
content at all**; `install.sh` runs once per machine and that is now literal.

- `extensions/aura-zone/aura-content.js` → **`palette/content.json`**, found by
  the same upward walk that finds the tilesets (C2's L9).
- **JSON, not a script.** The extension parses it with `JSON.parse` instead of
  `eval`-ing a file read off disk, and vitest `require`s the identical bytes.
- Custom types are generated **into `tools/tiled/aura.tiled-project`**, patched
  in place so the user's own settings (folders, extensionsPath, commands)
  survive. ⚑ Tiled has **no `propertyTypesFile` key** — measured against the
  shipped binary's strings — so embedding in the project is the only
  declarative option, and it is what removes C2's hand-import.

```
1. add the mob / texture / prop to api/ (or Graphics.ts) as usual
2. node tools/tiled/generate-palette.mjs
3. reopen the zone in Tiled
```

**⚑ The recommended flow changed, and `install.sh` now says so.** Custom types
are *project* state, so they apply only while `aura.tiled-project` is open —
open the project and take the zone from its folder list, rather than opening
`api/zones/world.json` directly. `palette/propertytypes.json` is still
generated for the direct-open flow, deliberately: same run, same source, no
drift.

**⚑ Content is now a HARD dependency, where it used to degrade silently.** A
missing `content.json` fails the open with a message naming the generator
(measured: exit 1, no output written). Before C5 the converter simply ran with
empty vocabularies. Better: an empty vocabulary means props draw at 1×1 and
every validation check quietly skips itself.

**⚑ Loading is cached module-wide, and it has to be.** `write()` cannot always
locate the palette — under `--export-map` the *output* path may be outside the
repo — so `read()` warms the cache, and `write()` only falls back to its own
path for a map built from scratch inside Tiled.

**Half 2 — ⭐ the completeness pin (§12.2.2), PO-asked 2026-08-23.**

Five vitest cases scrape the `json:"…"` tags out of `world/zone.go` and assert
the converter round-trips exactly that key set:

- The converter's side is derived from **behaviour** — a fixture authoring
  every optional key, run through `zoneToModel → modelToZone → serializeZone`,
  with the keys collected off the output. A fourth hand-written list would have
  been the very thing the pin exists to prevent.
- **Both directions** are checked. A key zone.go declares and Tiled drops is
  silent data loss; a key Tiled emits and zone.go does not know hard-fails the
  boot on `DisallowUnknownFields`.
- **`NOT_AUTHORED_IN_TILED`** holds exactly **`legacy`** with its reason, and a
  test asserts each exception is still a real zone.go key — so the list cannot
  rot into a permanent excuse.
- **The scrape guards itself**: a refactor moving the structs out of `zone.go`
  goes red rather than vacuously green.
- The failure message names the key **and both serializers**, since a new field
  must reach `serializeZone` *and* `ZoneModel.getZoneAsJSON` or the two editors
  stop agreeing.

**⭐ The pin was proven RED before being trusted.** Deleting the
`blocksMovement` line from `serializeZone` fails two cases with:

```
zone.go declares blocksMovement, which Tiled would SILENTLY DROP on the next
save. Add it to serializeZone/zoneToModel/modelToZone …
```

That is the whole point of the chunk's second half, so it was worth spending a
run to see it fail on purpose.

**⚑ What the pin does not catch**, so nobody over-trusts it: a changed
*meaning* (a field turning tri-state, a unit changing) and whether a new field
deserves editor UI. It answers one question — *is this key being silently
thrown away?* — which is the one with no other answer.

**⚑ Fixed in passing:** the generator's own summary line claimed "5 enums + 8
classes" for what has always been **9** classes (a hardcoded `4 +` that missed
`AuraTerrain`). Both counts are now derived from the emitted array.

**Verified:** vitest **427/427** (5 new; `AuraTiledConvert.test.ts` 47 → 52) ·
`tsc --noEmit` clean · generator idempotent across all five outputs including
the patched project file · real Tiled round-trip on `api/zones/world.json`
still **byte-identical** · a zone with a Tree in `spawns` still refused (exit 1
— which is the positive proof `content.json` is found and parsed from its new
home, since the byte round-trip alone would pass with empty vocabularies) · a
missing `content.json` hard-fails.

**Schema: NONE.** No game code, no content, no wire, no DB.

### C6 — dropdowns and typed spawn fields ✅ SHIPPED 2026-08-23 (uncommitted)

A spawn now shows one complete typed form — mob picked from a dropdown, every
knob present with a real type — while `world.json` stays byte-identical.

**The mechanism, and why it is safe.** Tiled cannot express "absent": a typed
class member always has a value. So each field borrows a value the loader
already rejects, and the converter maps it back to omitted:

| Field | Sentinel | Why that value and not 0 |
|---|---|---|
| `level` | `0` | `zone.go:302` rejects `< 1`; `Mob.spawnLevel` already encodes "no override" as 0, so the sentinel is the engine's own |
| `wanderRadius` | `-1` | negatives rejected — and **0 is taken**, it means forced stationary (19 spawns rely on it) |
| `idleSpeedFactor` | `0` | valid range is `(0, 1]` |
| `respawnTicks` | `-1` | **0 is taken**: absent parses to 0 = respawn next tick, which is what the 17 NPCs rely on |
| `respawnVariancePct` | `-1` | same |
| `patrolMode` | `pingpong` | the writer already omits anything that is not `loop` |

⭐ **The mapping lives in exactly ONE function**, `readSpawn`, consumed by both
`modelToZone` and `validateModel`. Two copies would have been two chances to
rewrite ~226 spawns, and the validator is the half that would have failed
loudest: range-checking the raw properties would flag every inheriting spawn in
the file as having `level 0` and `wanderRadius -1`.

⭐ **The class defaults are READ FROM the converter, not retyped.** The
generator `require`s `aura-convert.js` and builds the members from
`SPAWN_INHERIT` / `PATROL_INHERIT` / `MOB_UNSET`, so palette and converter are
one definition rather than two a test compares. A test still pins the emitted
JSON against them, because the generator's output is checked in.

⭐ **The design does not depend on Tiled internals we cannot test.** Whether
Tiled stores a property that merely equals its class default, or omits it, the
converter lands on "inherit" either way — because the defaults *are* the
sentinels. A test pins that equivalence directly (`readSpawn` of a stripped
object equals `readSpawn` of a sentinel-filled one). This matters because the
GUI's behaviour here is not reachable from `--export-map`.

**⚑ Which is exactly why `AuraProp` stays memberless.** `blocksMovement` is a
bool with no spare value, so it has no sentinel — a default of `true` plus a
Tiled that drops default-valued properties would silently flip all 777 props to
`false`. The other four non-spawn classes stay memberless for the same reason,
and a test asserts it.

**Mob selection.** Identity moved into a `mob` property typed `AuraMobName`,
with the object's Name kept as a readable label. The typed property wins;
`name` is the fallback, which keeps every hand-authored and script-written zone
working unchanged.

- The enum leads with **`(pick a mob)`**, so a hand-drawn spawn nobody assigned
  refuses the save (*"no mob chosen yet — pick one in the Properties panel"*)
  instead of silently becoming whichever mob sorted first.
- ⚑ **The Name label goes stale when you change the dropdown**, and is
  refreshed on reopen. Deliberately not validated as a mismatch: the primary
  workflow *is* changing the dropdown, so refusing on disagreement would refuse
  every normal edit.

**⚑ Three C4 checks lost the ability to fire on three specific values**, and
the C4 tests were updated to say so: `wanderRadius -1`, `idleSpeedFactor 0` and
`level 0` now read as "inherit" rather than as bad input. Nothing is lost —
Tiled can no longer put those values into the file at all — but it is a real
semantic change and the tests now use `-5`, `-0.5` and `-3` instead.

**⚑ NOT verified headlessly, and it cannot be: the member JSON shape.** Custom
types are *project* state and `tiled.project` is null under `--export-map`, so
whether Tiled renders these members as a form is a **GUI check the PO must
make**. The risk is contained: `world.json` byte-stability does not depend on
it, and a malformed member array fails visibly (no form) rather than silently.
⚑ The scripting API for custom property types exists (NEWS: Tiled 1.12.0,
#3971) but is not on the `tiled` global in this build, so it was not an option.

**Verified:** vitest **439/439** (12 new; `AuraTiledConvert.test.ts` 52 → 64) ·
`tsc --noEmit` clean · generator idempotent across all five outputs · real
Tiled round-trip on `api/zones/world.json` still **byte-identical**, which is
this chunk's acceptance test and covers all 489 spawns at once · the
explicit-`0` `wanderRadius` and the 17 respawn-free NPCs each pinned separately
· `world.json` still validates clean, i.e. the sentinels are not mistaken for
bad values.

**Schema: NONE.** No game code, no content, no wire, no DB.

## 12. Follow-on chunks C4–C6 (planned 2026-08-22; ALL THREE shipped 2026-08-23)

Improvements the PO asked for after using C1–C2 for real — three on
2026-08-22, and §12.2.2 added 2026-08-23 (*"when new fields/keys are added to
the game in future, how will it get known to the editor?"*). All are
**schema NONE** and none touches the game — they are editor-side only.
(The remaining ask, *"rotation and scale should work on all objects"*, is a
**format** change and lives in `docs/plan-prop-scale.md`.)

### 12.1 C4 — validate at SAVE time, not at boot

> **✅ SHIPPED 2026-08-23** — ledger in §11. The section below is the
> design as planned; two checks were added during execution that it does not
> list (a dark area dragged out of round, and non-negative respawn fields), and
> the wrong-layer message turned out able to name the RIGHT layer.

**The problem, in the PO's words:** *"when objects in Tiled are created in the
wrong layer, it will throw an error when the game is started."*

C1 already refuses an **unknown layer**. What it does not catch is an object in
a *known but wrong* layer: drag a Tree tile onto `spawns` and the writer
happily emits `{"mob": "Tree", …}`, which then kills the server at boot with
`spawn 488: unknown mob "Tree"`. The failure is real but arrives late, in a
different tool, pointing at an array index rather than at the thing you
dragged.

**The fix: mirror `world/zone.go`'s `validate()` + `resolve()` in the writer**,
and refuse the save with an object-level message. The vocabularies are already
generated and to hand (`aura-content.js` gains a terrain-type list, §12.2):

| Check | Mirrors |
|---|---|
| terrain name ∈ known texture types | today: nothing — `terrain.type` is validated *nowhere*, and a typo dies in the browser at render time |
| prop name ∈ `api/props` | `zone.go:419-426` |
| spawn name ∈ `api/mobs` | `zone.go:402-405` |
| `wanderRadius >= 0`, mutually exclusive with waypoints | `zone.go:286-291` |
| `idleSpeedFactor ∈ (0, 1]` · `level >= 1` | `zone.go:292-304` |
| `waypoints` length ≠ 1 · `patrolMode` requires waypoints | `zone.go:305-315` |
| `darkArea.radius > 0` | `zone.go:317-321` |
| campfire id non-empty + unique zone-wide; ≥1 `startingSpawn` | `zone.go:325-349` |
| anchor name non-empty, unique, **inside bounds** | `zone.go:350-363` |
| a wandering/patrolling mob must have `speed > 0` | `zone.go:413-416` — needs `speed` in the generated content |

⭐ **The terrain row is a genuine bonus.** `terrain.type` is the one field in
the whole schema that is checked on neither side (the server ignores it,
`GroundTextureManager.ts:174` dereferences `undefined`), so it fails at *render*
time in the browser. Tiled's tileset makes a typo nearly impossible and this
check closes the rest.

**Message shape matters more than the check.** Report the layer, the object's
Tiled **id** (so Tiled's *Select Object by Id* jumps to it), and what was
wrong — not an array index. Refusing the save is safe: Tiled keeps the document
open, so nothing is lost.

⚑ Also mirror `plan-prop-scale.md` §4.2's option-(A) rule here if it is taken —
a rotation Tiled lets you apply but the server rejects is precisely the
late-failure class this chunk exists to kill.

### 12.2 C5 — keeping the editor in step with the game

> **✅ SHIPPED 2026-08-23** — ledger in §11. Built as designed, with one
> change: content moved as **JSON**, not as a script, so the extension parses
> it rather than eval’ing it.

Two different things drift, and they drift differently. Content (a mob, a
texture, a prop) is **already** generated and fails visibly; **fields** are not
guarded at all and fail silently. C5 closes both.

#### 12.2.1 Content: adding it becomes ONE command

**The problem:** *"when new mobs or terrain is added to the game, how will it
get into Tiled?"* Today, honestly, four steps: regenerate, **re-install the
extension** (because `aura-content.js` sits in the extension directory),
**re-import `propertytypes.json`** by hand (Tiled custom types are *project*
state, not map state), then reopen the zone.

Two changes remove the two manual steps:

- **Move `aura-content.js` into `tools/tiled/palette/`** and load it the way
  the tilesets are already loaded — by walking up from the zone file (C2's L9).
  The extension then contains **no content at all**, so it is installed once
  per machine and never again.
- **Generate the custom types straight into `tools/tiled/aura.tiled-project`**,
  which carries a `propertyTypes` array natively. Opening the project is then
  the only thing needed, and the hand-import disappears.

**Result — the whole future workflow:**

```
1. add the mob / texture / prop to api/ (or Graphics.ts) as usual
2. node tools/tiled/generate-palette.mjs
3. reopen the zone in Tiled
```

⚑ The generator must stay **fail-loud** (it already is): a new prop whose
`entityType` has no sprite mapping stops the run rather than shipping a hole.
That is the one hand-maintained table left, and C4's checks are what stop a
gap in it from reaching the game.

⚑ **This does not make the palette self-updating.** Step 2 is a real step, and
forgetting it means new content is missing from Tiled — visibly, not silently.
Making the extension read `api/` directly was considered and rejected: it would
put JSON parsing and `Graphics.ts` scraping inside QJSEngine, where it cannot
be tested by vitest.

#### 12.2.2 ⭐ Fields: a completeness pin, because this half fails SILENTLY

**The problem, PO-asked 2026-08-23:** *"when new fields/keys are added to the
game in future, how will it get known to the editor?"* Today: it does not, and
nothing says so. `serializeZone` is a hand-written whitelist, so a key it has
never heard of is **dropped on the first Tiled save**. Measured on a
hypothetical per-prop `scale`:

```
{"type":"House","x":-62,"y":20.69,"rotation":2.025,"blocksMovement":true}
                                                     ← scale silently gone
```

⚑ **There are now THREE parallel whitelists that must agree**: `zone.go`'s
structs, `ZoneModel.getZoneAsJSON()`, and `aura-convert.js`'s `serializeZone`.
Only the first is authoritative, and none of the three knows about the others.
This is the failure that already ate `spawn.level` once (`plan-prop-scale.md`
L1) — and the *server* direction is fine (`DisallowUnknownFields` hard-fails a
boot on an unknown key), so the gap is one-way and editor-side.

**The existing guard, and its exact window.** D6's byte-stability test does
catch this — but only once the field is actually authored somewhere:

| state | round-trip test |
|---|---|
| the field exists in `zone.go`, nothing authored yet | ✅ passes — **the window** |
| the field is authored into `world.json` | ❌ fails |

So the hole is the span between adding a field and the first placement that
uses it. Anyone opening a zone in Tiled during that span deletes the new data,
with `npm test` green throughout.

**The pin.** A vitest case that scrapes the `json:"…"` tags out of
`backend/pkg/aura/world/zone.go` — the authoritative schema, and all nine zone
structs live in that one file — and asserts the converter round-trips exactly
that key set:

- **Derive the converter's side from behaviour, not a second hand-list**:
  serialize a fixture zone that authors *every* optional key, and collect the
  keys that appear anywhere in the output. A fourth hand-maintained list would
  be the very thing this pin exists to prevent.
- **Drop `json:"-"`** (`Spawn.Def`, `Zone.LegacyRefs`) — never serialized.
- **One explicit exception set, `NOT_AUTHORED_IN_TILED`**, holding exactly
  **`legacy`** today, each entry carrying its reason. ⚑ That entry is not
  hypothetical: `zone.go:175` carries `legacy bool`, no shipped zone authors
  it, and Tiled *would* delete it if one did. In fairness `ZoneModel.ts` drops
  it too — this is a pre-existing repo property Tiled inherited, and the
  exception set is the first place it has ever been written down.
- **The failure message must name the key and both serializers**, since a new
  field needs adding to `serializeZone` *and* `getZoneAsJSON` or the two
  editors stop agreeing.
- **Assert the scrape itself found something** (e.g. `bounds`, `spawns`), so a
  refactor that moves the structs turns into a red test rather than a vacuously
  green one.

⚑ **What the pin does NOT catch**, stated so nobody trusts it too far: a
changed *meaning* (a field becoming tri-state, a unit changing), and whether
the new field deserves editor UI. It answers exactly one question — *is this
key being silently thrown away?* — which is the one with no other answer.

⚑ **Why here and not in C6**, where it would guard the most: C6 is the chunk
that can corrupt ~226 spawns, so the pin should already exist when it starts.
C5 runs first and is already the "keep the editor in step with the game" chunk;
this is just its other half.

⚑ Same class as the standing `TICKING_TYPES` leftover in `SkillTooltip.ts` — a
hand-maintained set with no completeness pin and a silent failure mode. Worth
not shipping a second one.

### 12.3 C6 — dropdowns and typed spawn fields

> **✅ SHIPPED 2026-08-23** — ledger in §11. Built as designed. The one thing
> the design did not anticipate: the sentinels also make the chunk robust to
> whichever way Tiled treats default-valued properties, which is the half that
> could not be tested headlessly.

**The problem:** *"is it possible to get type drop downs and mob selections in
Tiled?"* Yes — partly already true, and the rest is one careful chunk.

**Already solved, better than a dropdown:** terrain and prop *type* selection.
You pick a Sand or Tree tile from the tileset palette and drag it, which is
picking from a visual menu. The enums C2 generated (`AuraTerrainType`,
`AuraPropType`) are currently **unused**, because C2 deliberately gave the
classes no members (a class member carries a default, and a default would
appear on every object).

**Not solved: mob selection.** A spawn's identity is the object's `name`, a
built-in free-text field that cannot take an enum. The fix is to move mob
identity into a **custom property typed as `AuraMobName`** — always present,
so no tri-state risk — and keep `name` mirrored for readability.

**⭐ The tri-state knobs can have typed fields too, via out-of-range
sentinels.** The reason C2 refused class members was that a default would make
`wanderRadius` present on all ~226 inheriting spawns and rewrite them. But
every one of these fields has a value the loader **already rejects**, which
therefore can never collide with real data:

| Field | Sentinel = "inherit" | Why it is safe |
|---|---|---|
| `level` | `0` | `zone.go:302` rejects `< 1`, and `Mob.spawnLevel` already encodes "no override" as 0 — the sentinel is the engine's own |
| `wanderRadius` | `-1` | `zone.go:286` rejects negative; **0 is meaningful** (forced stationary), so 0 must NOT be the sentinel |
| `idleSpeedFactor` | `0` | valid range is `(0, 1]`, so 0 is outside it |
| `respawnTicks` / `respawnVariancePct` | `-1` | absent means 0 server-side ("respawn next tick"), so **0 cannot be the sentinel** |
| `patrolMode` | `pingpong` | the writer already omits anything that is not `loop` |

The writer maps sentinel → omitted, so the file is unchanged while the editor
shows a full typed form with dropdowns.

⚑ **This is the highest-risk chunk in the plan and the acceptance test is
already built.** Get a sentinel wrong and ~226 spawns are silently rewritten —
which is exactly what D6's byte-identical round-trip catches on the first run.
Do not ship C6 without it green, and add one fixture per row of that table.

⚑ **`wanderRadius` and `respawnTicks` are the two rows where the obvious
sentinel (0) is a real authored value.** They are the reason this table exists
rather than "use 0 everywhere".

### 12.4 Suggested order

**C4 → C5 → C6.** C4 is pure gain and independent. C5 removes friction that
C6's new enum would otherwise multiply (every content change would need the
hand-import again). C6 last, because it is the one that can corrupt content and
it wants the other two settled underneath it.
