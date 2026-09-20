# Plan: Zone / level-editor naming, and the Tiled layer order

**Status:** designed 2026-09-20 (PO session). **N1 BUILT 2026-09-20** (ledger §10, uncommitted); **N2 unstarted.**

PO ask, verbatim: *"i want to plan changing some namings of zone / level editor
elements to better match the intention … i also want to reorder the layers in
tiled to be in a different order matching the level hierarchy better (eg.
regions on the bottom, as it should be the lowest layer)"*, then, the same
session: *"is it possible to make some layers default locked or hidden in tiled,
so they do not block clicking?"*

---

## 1. What this is

Three of the eleven zone arrays are named after the wrong thing, the Tiled layer
stack is close to *inverted* from the order the client actually draws in, and
the two profile enums are asymmetrically named. None of it is a defect — every
one of these ships and works. It is authoring ergonomics, and the layer order is
the half that is actively costing clicks today.

⭐ **The two halves have wildly different costs, and that is what splits the
chunks.** The layer order and the locks are *presentational only* — the zone
file stores no layers at all — so they cost one array edit and no content
migration. A key rename rewrites every zone file on disk through four
serializers.

---

## 2. What was checked, not assumed

Everything in this section was measured this session.

1. ⭐ **The Tiled layer order is free.** The zone JSON has **no layer records**;
   `zoneToModel` synthesizes the layer list on every open and `modelToZone`
   collapses it back by **name**, not by index
   (`aura-convert.js:919`, `:1272` — `if (m.layers[i].name === name)`). So
   reordering the array changes what the PO sees and nothing else. No zone file
   changes, no round-trip risk.
   ⚑ This is the same finding zone-polygons **D5** recorded (*"layer names cost
   nothing at all"*), now applied to layer *order*.

2. ⭐ **`locked` and `visible` are real and settable**, probed headless against
   the installed Tiled **1.12.2** with a throwaway extension:

   ```
   ObjectGroup ok
   locked_before=false   locked_set=true
   visible_before=true   visible_set=false
   opacity=1             tintColor="#ffffff"
   ```

   One assignment each in the `read()` loop of `aura-world-format.js:182-184`,
   beside the existing `group.drawOrder = ObjectGroup.IndexOrder`.

3. ⛔ **Lock and visibility CANNOT persist, and this is the load-bearing
   constraint of the whole lock half.** The zone file has no layer records (fact
   1) and `tools/tiled/aura.tiled-session` stores only `expandedObjectLayers`,
   `scale`, `selectedLayer`, `viewCenter` — **no `locked`, no `visible`**
   (read this session). So whatever the converter hard-codes IS the state on
   every single open, and anything the PO toggles in the Layers panel resets the
   next time the file is opened. A default lock is therefore permanent and free;
   a default lock nobody wants is permanent too.

4. **The enum name never reaches a zone file.** A zone stores `"profile":
   "Fields"` as a bare string; `AuraProfile` is a Tiled *type* name only, living
   in `aura-convert.js:256` (`REGION_ENUMS`), `generate-palette.mjs` (6 call
   sites) and the two generated files it writes. Renaming it is content-free.

5. **The Tiled CLASS name never reaches a zone file either.** `className` is
   written onto the in-memory Tiled object and read back to discriminate a
   shared layer (zone-polygons D5, atmosphere D17); the zone JSON carries only
   the array an object landed in. So `AuraPolygon` → `AuraStructure` is
   content-free as well — it is the *array key* that is not.

6. ⚑ **The test pins layer order POSITIONALLY.** `AuraTiledConvert.test.ts`
   reaches for `model.layers[0]`, `[1]`, `[2]` in ~9 places. The reorder reddens
   all of them. That is a bad pin over a presentational order and gets fixed to
   a by-name lookup in the same chunk rather than renumbered.

7. **Only three zone files exist**: `api/zones/{world,underworld,tunnel}.json`,
   mirrored under `backend/pkg/api/zones/`. The `world - Copy.json` and
   `world_bkp.json` in the session's `recentFiles` are **gone from disk** — so
   the "directory is the zone list" trap (a stale WIP file refusing the boot)
   does not apply here. ⚑ Re-check before N2 anyway; it is one `ls`.

8. ⚑ **The embedded copy is already stale at HEAD**: `api/zones/world.json` is
   8594 bytes, `backend/pkg/api/zones/world.json` is 4375. `cp-defs` has not run
   since the PO's authoring. N2 must not mistake that for a migration bug.

---

## 3. The inventory, element by element

Every name an author can see, with the ruling from the 2026-09-20 session.

| Element | Today | Ruling | Why |
|---|---|---|---|
| ground texture blobs | `terrain` | → **`decals`** ✅ | Holds scattered *decorative patches*, but "terrain" is simultaneously the word for the whole ground concept (`terrain-profiles.json`, `AuraProfile`) — and regions, paths and polygons are all terrain too. |
| filled masses | `polygons` | → **`structures`** ✅ | Names the *geometry*, not the intent; regions, atmospheres, clearings and closed paths are all polygons. The Go doc already supplies the word: *"a Region is filled as a MATERIAL … a Polygon is filled as a THING"*. |
| bind points | `campfires` | → **`bindPoints`** ✅ | Names the art, not the function. Real campfires are **mobs** on `layers.mobs.campfire`; these are bind/respawn points and the ids are already authored `spawnpoint-N`. |
| ground profile enum | `AuraProfile` | → **`AuraTerrainProfile`** ✅ | The only one of the pair without a prefix, against its sibling `AuraAtmosphereProfile`. |
| the unlit circles | `darkAreas` | **PARKED** ✅ | `docs/cleanup.md` entry 1 holds an open ruling on whether this is *retired* entirely. Renaming something that may be deleted is work spent twice. |
| `spawns`, `regions`, `paths`, `atmospheres`, `clearings`, `anchors`, `props` | — | **KEEP** | Each already says its intent. `regions` reads vague but the Go doc pins it precisely (the `resolve()` participant, heading for quest identity) and every alternative collides with `zone`. |

### 3.1 ⭐ Why `decals` is what makes `AuraTerrainProfile` work

These two look like separate items and are not. Today "terrain" means two
different things — the blob array *and* the ground-material vocabulary — which
is why the profile enum could not simply be prefixed: `AuraTerrainProfile`
against a `terrain` layer that is *not* where profiles are used would move the
collision rather than remove it. Freeing the array to `decals` leaves `terrain`
meaning only the material, and `terrain-profiles.json` / `AuraTerrainProfile`
become unambiguous by construction.

⚑ Do them in that order in the write-up, but they can ship apart: the enum is
content-free (fact 4) and rides N1, the array key is not and rides N2.

---

## 4. Design

### 4.1 D1 — the layer order is the CLIENT's draw order, bottom-first

Tiled's `layers[]` is bottom-to-top. Today, against `Game.ts:341-356`:

| | today (bottom → top) | **N1** (bottom → top) | in-game container |
|---|---|---|---|
| 1 | `terrain` | **`regions`** | `terrain.regions` |
| 2 | `props` | **`paths`** (structures + paths) | `terrain.polygons`, `terrain.paths` |
| 3 | `spawns` | **`terrain`** | `terrain.textures` |
| 4 | `campfires` | **`props`** | `resources.*`, `terrain.decks` |
| 5 | `darkAreas` | **`spawns`** | `mobs.*` |
| 6 | `regions` | **`campfires`** | (not rendered from this array) |
| 7 | `paths` | **`darkAreas`** | `darkness` |
| 8 | `atmospheres` | **`atmospheres`** (+ clearings) | `haze`, `darkness` |
| 9 | `anchors` | **`anchors`** | (not rendered) |

The current stack is close to inverted: the blobs sit at the bottom with the
regions *above* them, while in game a region is the ground the blobs are
scattered **on**. Under N1 the Tiled canvas and the client agree.

⚑ `campfires` above `spawns` is arbitrary — both are points, neither occludes
the other, and the array is not rendered at all. Relative order is preserved to
keep the diff honest.

⭐ **This alone fixes most of the click problem the PO reported.** A big region
polygon wins a click today only because it is drawn above the props and spawns
underneath it. Demoted to the bottom, the click lands on the prop.

### 4.2 D2 — `regions` and `atmospheres` ship LOCKED by default

PO ruling 2026-09-20: both, in N1.

The lock is not redundant with D1, and the reason is worth recording. The
reorder stops a big shape **winning a click aimed at something else**; it does
nothing about the other failure, which is **dragging a region vertex by
accident** while working on the layer above it. The lock is what closes that,
and it is the only thing that closes it for `atmospheres` at all — atmospheres
must stay near the top of the stack to match the game's air-over-everything, so
the reorder cannot help them.

- **Locked, not hidden.** A hidden layer stops you seeing what you authored; a
  locked one still draws at full opacity and merely refuses selection. Nothing
  ships with `visible: false`.
- ⚑ **The accepted cost, stated plainly** (fact 3): editing a region means
  unlocking it in the Layers panel, and it is **locked again on the next open**.
  If that turns out to be the wrong trade in practice, the flag is one line.
- The flag lives on the layer spec in `aura-convert.js` (`{name, drawOrder,
  locked, objects}`) rather than in `aura-world-format.js`, so the pure
  converter stays the single source and vitest can see it. `drawOrder` is
  already equally presentational and already lives there.

### 4.3 D3 — internal names are OUT of scope

PO ruling 2026-09-20: *"leave internal name alone."*

The line: **anything an author sees in Tiled or in a zone file is renamed;
anything only code sees is not.**

| Renamed (N2) | Left alone |
|---|---|
| zone JSON keys `terrain`/`polygons`/`campfires` | client feature dir `ground-textures/` |
| Tiled layer names | `GroundTextureManager` and its ~40 call sites |
| Tiled classes `AuraTerrain`/`AuraPolygon`/`AuraCampfire` | Go type names `TerrainTexture`, `Polygon`, `Campfire` |
| Tiled enum `AuraTerrainType` → `AuraDecalType` | `frontend/src/features/polygons/`, `Polygons.ts` |
| palette `terrain.tsx`, tileset `aura-terrain`, `templates/terrain/` | `ZoneModel`'s `ZonePolygon` / `ZoneCampfire` TS types |

⚑ **One judgement call made rather than asked**, flag it if wrong: the three
**fields on the Go `Zone` struct** (`Terrain`, `Polygons`, `Campfires`) are
renamed with their json tags, because a field named `Terrain` carrying
`json:"decals"` is exactly the drift that costs a reader an hour later. Their
**types** keep their names, so the result reads `Decals []TerrainTexture` and
`Structures []Polygon`. Mildly awkward, deliberately so — it is the smallest
thing that keeps the key and its field in step.

---

## 5. Schema impact

- **N1: DB / WIRE / CONF / CONTENT / ZONE FORMAT — ALL NONE.** Presentational
  only (facts 1, 4, 5). Not one byte of any zone file changes.
- **N2: DB / WIRE / CONF NONE · ZONE FORMAT three keys renamed** — a breaking
  format change with no compatibility window by design (see L1).

---

## 6. Chunks

### N1 — layer order, locks, and `AuraTerrainProfile`

Zero content risk; ships independently of everything else.

1. Reorder `model.layers` in `zoneToModel` (`aura-convert.js:869-903`) per D1.
   Reorder the `LAYERS` whitelist (`:25`) to match — order is irrelevant there,
   consistency is not.
2. Add `locked: true` to the `regions` and `atmospheres` layer specs; honour it
   with `group.locked = !!spec.locked` in `aura-world-format.js` `read()`.
3. `AuraProfile` → `AuraTerrainProfile`: `REGION_ENUMS.profile`
   (`aura-convert.js:256`), 6 call sites in `generate-palette.mjs`, then
   `node tools/tiled/generate-palette.mjs` to rewrite `palette/content.json`,
   `palette/propertytypes.json` and the `propertyTypes` block of
   `aura.tiled-project`.
4. Fix `AuraTiledConvert.test.ts` to look layers up **by name** (fact 6), and
   add a leg pinning the new order and the two locks.
5. Docs: the layer table in `manual-tiled-editor.md` §2 — ⚑ it says *"seven
   object layers"* and lists seven; there are **nine**, and it predates
   polygons, atmospheres and clearings entirely.

### N2 — the three key renames

⛔ **Sequenced behind the PO's uncommitted content** (see L2).

Per key, the four writers plus the Tiled surface:

| Writer | `terrain` → `decals` | `polygons` → `structures` | `campfires` → `bindPoints` |
|---|---|---|---|
| `backend/pkg/aura/world/zone.go` | field + json tag | field + json tag | field + json tag |
| `tools/tiled/extensions/aura-zone/aura-convert.js` | `LAYERS`, layer spec, `modelToZone` | same | same |
| `tools/tiled/extensions/aura-zone/aura-world-format.js` | confirm no map-level value (U1/L3) | confirm | confirm |
| `frontend/.../ZoneModel.ts` | field + `getZoneAsJSON` | field | field |
| Tiled class | `AuraTerrain` → `AuraDecal` | `AuraPolygon` → `AuraStructure` | `AuraCampfire` → `AuraBindPoint` |
| Tiled enum | `AuraTerrainType` → `AuraDecalType` | — | — |
| palette | `terrain.tsx` → `decals.tsx`, tileset id `aura-terrain` → `aura-decals`, `templates/terrain/` → `templates/decals/` | — | — |

Then: migrate the three `api/zones/*.json`, `make -C backend cp-defs`,
regenerate the palette, and re-run `verify.sh` through real Tiled.

---

## 7. Test strategy

- **vitest** — the by-name layer lookup (fact 6), a leg pinning the N1 order,
  a leg pinning `locked` on exactly `regions` and `atmospheres`, the existing
  enum-member legs retargeted to `AuraTerrainProfile`, and for N2 the
  completeness pin (both writers emit the same KEYS).
- **`go test -count=1 ./...`** — ⚑ a content edit does not invalidate the Go
  test cache.
- **`bash tools/tiled/verify.sh`** — the only leg that runs real Tiled. ⛔ It
  drives the **installed** copy, so `install.sh` first or every leg is a false
  pass on stale code (verify.sh leg 0 catches this).
- ⛔ **The locks and the layer order are NOT verifiable by `verify.sh`.**
  Headless `--export-map` round-trips values; it cannot see a Layers panel. This
  is [[project-tiled-roundtrip-blind-spot]] exactly — a round-trip leg proves
  names survive, never that the GUI wiring is right. **The lock and the order
  are an explicit human check in the verify footer**, the same posture the
  dropdown check took after A0-A2.
- **In-game** — N1 needs none (nothing the client reads changes). N2 needs a
  boot: `DisallowUnknownFields` turns a missed key into a refused boot, which is
  the loud failure we want.

---

## 8. ⚑ Landmines

- **L1 — the rename has NO compatibility window, on purpose.** Go parses zones
  with `DisallowUnknownFields`, so a zone file still saying `terrain` after N2
  **refuses the boot**. That is the right failure (loud, named, at boot) but it
  means the three `api/zones/*.json`, the three embedded copies under
  `backend/pkg/api/zones/`, and the converter all have to move in **one
  commit**. Accepting both spellings for a while was considered and rejected: it
  would put the old name in the whitelist, which is where it would stay.
- **L2 — ⛔ all three zone files carry UNCOMMITTED PO authoring right now.** N2
  rewrites files the PO is actively editing. Land it immediately after the
  content is committed, or write the migration as an idempotent script run over
  whatever is in the tree — never as a hand edit of a file someone else is in.
  This is the A4 landmine (`world.json`'s migration prepared and not committed)
  repeating.
- **L3 — the fourth writer must be CONFIRMED, not assumed.** `aura-world-format.js`
  maps object properties generically but copies every **map-level** value by
  hand (U1/L3, the `origin` defect). None of the three renamed keys is map-level,
  so it should need nothing — confirm it, do not assume it.
- **L4 — a shared layer's count test.** A4 found `AuraTiledConvert`'s
  layer-count test asserting layer-count == same-named-array-count, wrong since
  zone-polygons D5. `structures` rides the `paths` layer and `clearings` rides
  `atmospheres`; whatever that test looks like after A4, re-read it before
  trusting a green run.
- **L5 — the session file will go stale.** `aura.tiled-session` keys dock state
  by tileset (`world.json#aura-terrain`). Renaming the tileset orphans those
  keys. Cosmetic only — the dock scale resets once — but it will look like a bug.
- **L6 — `tiled.propertyValue` throws with no project loaded**, so
  `aura-world-format.js` falls back to a bare string. Any renamed enum must be
  renamed in `generate-palette.mjs` **and** `REGION_ENUMS` or the fallback hides
  the mismatch silently for a whole session (A0-A2's measured trap).

---

## 9. PO calls

### Answered 2026-09-20

1. Which renames? → `decals`, `structures`, `bindPoints`, `AuraTerrainProfile`.
2. `darkAreas`? → **parked**, pending `cleanup.md` entry 1.
3. Sequencing? → reorder + enum ship first as one chunk (N1).
4. Locks? → **`regions` and `atmospheres`, both, in N1.**
5. Internal names? → **left alone** (D3).

### Still open

1. ⚑ **The Go `Zone` field names** — renamed with their tags by D3's judgement
   call, leaving `Decals []TerrainTexture`. PO may overrule either way.
2. ⚑ **Does the `regions` lock survive contact with authoring?** It cannot
   persist (fact 3), so every region edit costs an unlock, every session. One
   line to revert if it grates.

---

## 10. Chunk ledgers

### N1 — layer order, locks, and `AuraTerrainProfile` ✅ 2026-09-20 (uncommitted)

The Tiled layer stack is now the client's own draw order read bottom-first, the
two big background layers open locked, and the ground profile enum is
`AuraTerrainProfile`. **Not one byte of any zone file changed**, which is the
claim the whole chunk rests on and which `verify.sh` proves through real Tiled.

**Schema: DB / WIRE / CONF / CONTENT / ZONE FORMAT — ALL NONE.**

⭐ **The strongest evidence is a leg that was already there.** `regions` and
`atmospheres` are both locked, and both still round-trip **byte-identically**
through a real Tiled `--export-map`. That is what proves a locked layer is still
read, still written and still saved — the one behaviour worth being nervous
about, confirmed by the existing suite rather than by a new assertion.

⚑ **`group.locked` is honoured in `aura-world-format.js`, and NOTHING automated
can see it.** `--export-map` never builds a Layers panel, so the padlock itself
is only checkable by eye — [[project-tiled-roundtrip-blind-spot]] again. New
**footer items 8 and 9** in `verify.sh` are the check, and item 9 deliberately
tells the reader to unlock, reopen, and expect the padlock BACK, so the one
surprising behaviour is documented where it will be met.

⭐ **A PRE-EXISTING TEST DEFECT FELL OUT, and it is the durable part.**
`terrain paint order is preserved as index draw order` read its fixture out of
the live `world.json` and indexed `src.terrain[last]`. The PO's current
authoring leaves `terrain` **empty**, so `last` was `-1`, `objects[0]` was
`undefined`, and the test died on `.name` with a message naming nothing about
paint order. ⚑ It is [[feedback-tests-derive-not-hardcode]] read one turn too
literally: deriving from live content protects against a *census* changing but
not against the content being *empty*, and "is order preserved" never needed
real content to be true at all. Now three blobs of known, different types.
⛔ **Confirmed pre-existing, not caused here** — it fails identically with every
change of this chunk stashed.

⚑ **The nine positional layer pins are gone.** `layers[0]`/`[1]`/`[2]` meant
terrain/props/spawns and turned a free presentational change into nine red tests
that said nothing about what they guarded. They now go through `layerNamed`, and
the order has **one** test, where a reader will look for it.

⚑ **A stash flips line endings and fakes a stale palette.** During the Go
baseline comparison, `git stash push`/`pop` rewrote `aura.tiled-project`,
`content.json` and `propertytypes.json` with CRLF while the generator writes LF —
so `verify.sh`'s palette leg reported **STALE** with the content identical.
Re-running cleared it. Worth knowing before diagnosing that leg for real.

**Changed:** `aura-convert.js` (stack order + `locked` flags + `LAYERS`
whitelist reordered to match + `REGION_ENUMS.profile`) · `aura-world-format.js`
(`group.locked`) · `generate-palette.mjs` (6 sites) · regenerated
`aura.tiled-project`, `palette/content.json`, `palette/propertytypes.json` (the
enum keeps id **7** — no id churn) · `AuraTiledConvert.test.ts` · `verify.sh`
footer · `manual-tiled-editor.md` §2 (⚑ its table said *"seven object layers"*
and listed seven; there are **nine**, and it predated polygons, atmospheres and
clearings entirely) · a comment in `terrain-profiles.json`.

**Verified:** `go build ./...` **EXIT 0** · `go vet ./...` **EXIT 0** · tsc
**EXIT 0** · **vitest 969/969** (converter file 174/174, +4 new legs) · prod
build compiled · **`verify.sh` all green, 24 legs through real Tiled** including
both locked layers round-tripping byte-identically · **mutation-verified ×5, all
five caught by the intended leg**: reordering the stack, dropping `locked` from
`regions`, locking a third layer, hiding a layer, and desyncing the `LAYERS`
whitelist from the stack.

⚑ **`go test ./...` is RED and none of it is this chunk.** Three packages fail
(`cmd/aurad`, `cmd/simharness`, `pkg/aura/world`) — the failing set is
**identical with this chunk's changes stashed**, so it is the PO's uncommitted
content, not N1. N1 touches no Go at all.

**Owed:** the human checks (footer items 8 and 9) have not been run — the PO has
not opened Tiled since. Open call #2 in §9 is live until they do.
