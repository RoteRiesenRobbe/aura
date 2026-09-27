# Plan: Map Fog Persistence

> **Status: COMPLETE 2026-09-27, archived: F1 + F2 built, PO in-game pass "works fine"** (commit `[uncommitted]`; ledger: §9). Design approved by
> the PO in chat the same day ("design sounds good. add it to a plan"); the
> three §6 questions ruled the same day; then **revised the same day to
> CHUNKED, EXPLORED-ONLY storage keyed by WORLD coordinates** (PO: "ok, you
> convinced me"), after the PO pointed out `world.json` will definitely be a
> very large zone. Every number below is a [PLACEHOLDER].
>
> ⭐ **The ask (PO, 2026-09-27):** *"how will uncovering the fog on the map be
> saved in the characters profile? it seems to get lost atm."*
>
> ⚑ **Losing it is not a bug today, it is a recorded choice.** `MapFog.ts`'s
> header: *"SESSION-ONLY. The reveal lives in this object and nowhere else — no
> wire field, no column, no migration … Persistence can join part 2's
> migration, which already stores discovered campfires. Logging in re-fogs the
> world; that is the accepted cost, not a bug."* That migration shipped as
> `000002_character_campfires` without the fog, so the reveal has had no owner
> since. **This plan reverses the session-only half of that ruling**; the
> "a reveal is the AOI" half stands unchanged.
>
> **Schema: DB +1 table (migration `000003` pair) · wire +2 tables, +1
> `GameState` field · conf NONE · content NONE.**

---

## 1. What is lost today, and when

The reveal is a `RenderTexture` per zone inside `MiniMap.fogByZone`
(`frontend/src/features/map/logic/MiniMap.ts:104`). `Game.startRendering`
calls `MiniMap.setup()` on every `Welcome`, and `setup()` destroys every zone's
fog (`MiniMap.ts:190-194`). So the reveal dies on:

- a page reload,
- a new login (the same or another character),
- any reconnect that delivers a fresh `Welcome`.

It survives a zone crossing (`switchZone` keeps `fogByZone` on purpose).

⚑ **The docked minimap and the full-screen map are ONE module with ONE fog**
(`MiniMap.ts:667-673` moves a single canvas between the two). The fog is the
terrain sprite's mask, and the docked state never draws terrain
(`MiniMap.ts:710`), so today the fog is only VISIBLE on the full-screen map.
Persisting it covers both states; the docked minimap shows it only once
`plan-minimap-local-viewport.md` D4 turns docked terrain on.

## 2. Chunks

| Chunk | What | Verification |
|---|---|---|
| **F1** | **Server: track + persist.** A per-character set of explored FOG CHUNKS in world coordinates, marked on the loop from the character's position; a new table; `persist.CharacterState` carries it; `store` saves and loads it; `harnessdb -cleanup` learns the table. No wire, no client. | Go TDD: cell/chunk math incl. negative coordinates, marking, persist round-trip, `store` tests against `aura_test`. |
| **F2** | **Wire + client: restore.** A one-shot `GameState` field published on entering the world; the client paints the chunks that overlap each zone into that zone's fog texture, then keeps revealing locally exactly as today. | vitest on the pure chunk→zone-texel decode; a Playwright leg that walks, reloads, and asserts the earlier area is still revealed and an unwalked one is not. In-game PO check. |

F1 ships nothing visible alone, which is why it is safe to land first.

---

## 3. Decision ledger

| | Decision | Status | Rationale |
|---|---|---|---|
| **D1** | **The SERVER tracks the reveal; the client never uploads it.** | PO-APPROVED 2026-09-27 | The server already knows every character's position and the AOI it streams (`constant.ViewPortWidth/Height`, 20 × 12). A client upload would be a new client→server message, spoofable, and lost with a crashed tab. The discovered-campfire set is the precedent: server-owned, persisted, published to the owner. |
| **D2** | **Stored as fixed-size CHUNKS of a coverage bitmap, and ONLY the explored ones**, in a real table, one row per chunk. | PO-APPROVED 2026-09-27 (revised) | The first draft stored one flat bitmap per zone, which costs memory, storage and fingerprint work in proportion to the zone's AREA: ~6 KB at today's 540 × 360 `world.json`, ~600 KB per online character at 10× per side. The PO confirmed a very large world is certain. Explored-only chunks make every cost proportional to what the character has SEEN. `game.character_campfires` is the precedent for a per-character set in a real table rather than `character_flags` JSONB. |
| **D3** | **Cell = 2 × 2 units; chunk = 64 × 64 cells** (128 × 128 units, 4096 bits = **512 bytes**). [PLACEHOLDER] both. | PROPOSAL | `world.json` (540 × 360 since 2026-09-27, spanning x −270…+270, y −180…+180) touches a 6 × 4 grid: chunks x −3…2, y −2…1 = **24 chunks ≈ 12 KB fully explored**; the outer x columns hold only a 14-unit strip of the zone each, which costs a whole chunk only once explored. At today's fog texture (1024 texels across 540 units, `MapFog.fogWidth`) a cell is ~4 texels, so a restored edge is a slightly blocky version of the live one; at the radar zoom of `plan-minimap-local-viewport.md` that becomes ~8 px steps, so **revisit the cell size at that plan's look sitting**. The grid parameters are stored per row, so changing either is not a migration (D10). |
| **D4** | **A bit is COVERAGE, not "where I stood".** Every cell the 20 × 12 AOI rectangle overlaps is set. | PROPOSAL | Restoring "where I stood" means replaying one stamp per stored cell, tens of thousands of `renderer.render` calls at login for an explored world. Coverage restores in one draw per zone (§4.4). Overlap (not containment) errs toward revealing, never toward hiding what was seen. |
| **D5** | **Marked only when the character enters a new cell.** | PROPOSAL | The same rule `MapFog.revealAt` already uses client-side (a per-cell early return), so a standing character costs one comparison per tick. On a cell change: at most ~66 bit-sets (11 × 6 cells at 2 u), touching at most 4 chunks. |
| **D6** | **Fog NEVER forces a save; it rides the existing save triggers.** | PROPOSAL | A forced save per newly revealed cell would write constantly while exploring. The 5-minute autosave (`saveIntervalTicks`), logout, session expiry and shutdown flush already cover it. A crash can lose up to 5 minutes of reveal, the same exposure every other field already accepts (`plan-accounts-implementation.md` §1). |
| **D7** | **Published once on ENTERING the world, never per tick.** | PROPOSAL | Exactly `discovered_campfires`' rule (`server.fbs:917-943`): join, reconnect, respawn, revive. ⚑ Absent = no change, never "cleared"; the set only grows. Respawn re-sends a set the client already has; the client merges by union, so a repeat is harmless. |
| **D8** | **The client MERGES, it does not replace.** | PROPOSAL | Between two saves the client's live reveal is ahead of the stored copy, and a publish may carry areas the client never drew this session. Union is correct in both directions. |
| **D9** | **Keyed by WORLD coordinates. No zone id is stored anywhere.** A chunk is `(chunk_x, chunk_y)` in the one shared coordinate space every zone is placed into. | PO-APPROVED 2026-09-27 (revised; replaces the first draft's "zone key = file stem") | The world is divided into logical areas by design that are NOT the zone files (today they are painted regions inside `world.json`, which carry no id or name and are repainted freely, so they cannot be a key either). World-keyed chunks do not care how the space is cut into files: **resizing a zone keeps its reveal, and extracting an area into its own file is a single fixed offset per cell** (L8's remap). ⛔ An extracted area can NOT keep its world position: `world.Place` requires zone centres further apart than the SUM of both full sizes (`separationFor`, `world/place.go:175`), so it must move to a distant origin, like the underworld. Chunks are storage pages only; they need not match any zone's size or edge, because the reveal is exact to a cell (2 u). Each zone still has its OWN map (underworld D3): which map shows a chunk is a display question answered on the client (§4.4), not a storage one. |
| **D10** | **Only a changed GRID drops stored reveal**: a row whose `cell_size` / `chunk_cells` differ from the server's is skipped silently at load. | PO-RULED 2026-09-27, then made moot by D9 | The PO first ruled *"a resized zone drops its reveal"* for the per-zone draft. Under D9 a resize changes nothing, so nothing drops. What remains: a deliberate grid change is a reset, and **moving a zone's `origin`** moves its ground out from under its stored cells (they stay at the old world position). Both are rare authoring events; "unresolvable is skipped, never a boot failure" is the standing campfire rule. |
| **D11** | **Flying reveals exactly what walking does**: the fixed 20 × 12 AOI, not the flight's scaled viewport. | PO-RULED 2026-09-27 ("same as walking") | Stored and live reveals agree (the client stamps the fixed `BasicConfig.VIEWPORT` either way), and a flight between two fires does not uncover a wider band than walking the route would. §5 L4. |
| **D12** | **Death and ascension change nothing about the reveal.** | PO-RULED 2026-09-27 ("no") | The reveal belongs to the character's life, the discovered campfires' scope (flight-paths D10: per character, not per account or slot). A dead character keeps its map; an ascended character's rows stay like its campfire rows do. |

---

## 4. Design

### 4.1 Coordinates: nothing to author, nothing to look up

- **Server positions are already world coordinates in units.** `world.Place`
  shifts every zone's props, spawns, campfires and anchors by its `origin` at
  boot (`world/place.go:92-130`), so the character's position IS the world
  coordinate. Marking needs **no zone lookup**.
- **Cell and chunk math** (units, world space):
  - `cell = floor(coord / cellSize)`, `chunk = floor(cell / chunkCells)`,
    bit within the chunk = `cell - chunk × chunkCells`, row-major.
  - ⛔ **`math.Floor`, never Go's integer conversion.** `world.json` spans
    −270…+270 in x and −180…+180 in y; conversion truncates toward zero and merges cells −1 and 0
    (and chunks −1 and 0). The negative quadrant is where this ships wrong.
- **The grid is already bounded.** `world.MaxWorldCoordinate = 8192`
  (`world/place.go:27`) keeps every zone's far edge within ±8192 units, so
  cells stay within ±4096 and chunks within ±64: `SMALLINT` / `short` hold them.
- **The client already knows each zone's rectangle**: its bundled zone file's
  `origin` ± `bounds / 2` (zones are origin-centred; `ActiveZoneTracker` holds
  both). Client coordinates are px (`meter2px`, × 120).

### 4.2 Server model (F1)

- **Where it lives.** A fog component on the player, next to the discovered
  campfire set: `map[chunkKey]*[512]byte` for explored chunks only, plus the
  last marked cell (D5).
- **Who marks.** The system that already runs on the character's position each
  tick after movement (pick at execution; ConnectionState vs. a small new
  system — ⚑ read the ecs priority notes in `archive/plan-world-map.md` C2
  finding 2 first). Spectators, the start-screen tour and flying characters:
  §5 L4.
- **AOI rectangle:** position ± (`ViewPortWidth/2`, `ViewPortHeight/2`), the
  constants, not the live viewport body (L4). No clamp to the zone: cells
  outside every zone are harmless, no map ever draws them, and the border wall
  keeps the character inside anyway.

### 4.3 Persistence (F1)

```sql
-- 000003_character_map_fog.up.sql
CREATE TABLE game.character_map_fog (
    character_id  BIGINT NOT NULL REFERENCES game.characters(id),
    chunk_x       SMALLINT NOT NULL,   -- world space, may be negative
    chunk_y       SMALLINT NOT NULL,
    cell_size     SMALLINT NOT NULL,   -- units; D10: a mismatch is skipped
    chunk_cells   SMALLINT NOT NULL,   -- cells per chunk side
    bits          BYTEA NOT NULL,      -- chunk_cells² bits, row-major
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (character_id, chunk_x, chunk_y)
);
```

- No `ON DELETE CASCADE` (standing schema rule, `manual-db-migrations.md`).
- Save = `INSERT … ON CONFLICT (character_id, chunk_x, chunk_y) DO UPDATE` per
  explored chunk. Overwrite is correct because the in-memory set is always
  seeded from the load; an OR of stored and incoming bits is the
  belt-and-braces option. Pick at execution; either way the set only grows.
  ⚑ Only chunks changed since the last save need writing, but the save path is
  snapshot-based (`persist.CharacterState` + `Fingerprint()`); upserting every
  explored chunk is the simple start (24 rows for a fully explored `world.json`).
- `persist.CharacterState` gains `MapFog []FogChunk` **sorted by (x, y)** (the
  `SortCampfires` rule: `Fingerprint()` marshals the struct, so an unsorted
  slice makes every snapshot look dirty).

### 4.4 Wire (F2)

`server.fbs`, appended at the end of `GameState` (field ids stay stable):

```fbs
table FogChunk {
  x:short;              // world-space chunk index
  y:short;
  bits:[ubyte];         // chunk_cells² bits, row-major
}
table MapFog {
  cell_size:ubyte;      // units
  chunk_cells:ubyte;    // cells per chunk side
  chunks:[FogChunk];    // explored chunks only
}
// in GameState, own player only, one-shot (D7):
map_fog:MapFog;
```

⭐ **The grid parameters travel in the message**, so the server's constants are
the single source and the client has nothing to hand-sync.

⚑ Presence: an absent `map_fog` table reads differently from a present one
with an empty `chunks` vector, so "absent = no change" needs no extra bit (see
memory note *change-only wire fields*: every in-band inference hits a real
value; this one is out of band).

Payload: ≈ 512 bytes per explored chunk, once per entering-the-world event; a
fully explored 540 × 360 `world.json` ≈ 12 KB. 0 bytes every other tick.

### 4.5 Client (F2)

- `MiniMap` keeps the **received chunk set** (not per zone). Every zone fog it
  creates, now or later, takes the chunks overlapping that zone's rectangle,
  so the underworld's stored reveal waits naturally until the player first
  enters it this session (a zone's `MapFog` is created lazily in
  `setupTerrain`). Apply on creation; apply immediately to a fog that exists.
- `MapFog` gains `applyRevealed(...)`: build ONE alpha texture covering the
  zone's cell range, one texel per cell, opaque where a received bit is set,
  and draw it **once** into the fog `RenderTexture` with `clear: false`, so it
  unions with live stamps (D8). Nearest-neighbour sampling so a cell is a hard
  square like the live stamp. The world→zone conversion is the one
  `revealAt` already does: subtract the zone origin, add half the zone size,
  scale by `texelsPerPx`.
- ⚑ `MiniMap.setup()` (a new `Welcome`) still wipes everything, and that is
  now correct: the publication that follows the join restores it.
- The live reveal path (`revealAt` at the AOI) is unchanged.

---

## 5. Landmines

- **L1 — `harnessdb -cleanup` owns every character-scoped table.** The first
  cleanup after `000002` failed on `character_campfires_character_id_fkey`
  (`archive/plan-world-map.md` C2 finding 4). Add `game.character_map_fog` to
  `cmd/harnessdb/main.go:205`'s list **in F1**, and run a cleanup before
  calling F1 done. (Ascension does not delete characters, so it needs nothing;
  re-check that at execution.)
- **L2 — Cost scales with EXPLORED area, which is the point; know its
  ceiling.** Per chunk: 512 bytes in memory, one row, ~700 bytes of base64 in
  `Fingerprint()`. A character who has seen 5 % of a 5000 × 5000 world holds
  ~40 KB. The theoretical ceiling (everything within ±8192 explored) is 16 384
  chunks ≈ 8 MB, unreachable while content covers a fraction of that space.
- **L3 — Negative coordinates and non-zero origins.** Server: floor, not
  truncate (§4.1); the tests must cover cells on both sides of 0. Client: the
  fog texture is zone-local, so the zone origin is subtracted (the U4a bug,
  `MiniMap.ts:783-789`); its fixture must author a **non-zero** origin, or the
  test passes with the subtraction missing (`plan-underworld.md` U1 ledger).
- **L4 — Who does NOT reveal.** A spectator and the start-screen tour are not
  characters: no tracking. A **flying** character (`plan-flight-paths.md`)
  streams a scaled viewport (`player.FlightViewportScale`, 1.2) while the
  client still stamps the fixed `BasicConfig.VIEWPORT`. **D11: the server marks
  the fixed 20 × 12 AOI regardless.** ⚑ Do not read the AOI size off the
  player's live viewport body, or a flight silently widens the stored reveal.
- **L5 — A one-shot must reach the wire.** The campfire publication works
  because ecs priority orders StatusEffects (clears one-shots) → ConnectionState
  (join) → Net (encodes) in one tick (`archive/plan-world-map.md` C2 finding 2).
  Publish the fog at the same site as `publishCampfireState`
  (`sys/state.go:366`) so the ordering is inherited, not re-derived.
- **L6 — `Welcome` cannot carry per-character data** (it is pre-built and
  shared, `core/game.go:127`). The fog rides `GameState`, like the campfires.
- **L7 — A chunk can straddle two zones.** A 128-unit chunk can span the gap
  between two placed zones. No CELL can be inside both (`world.Place` refuses
  overlapping or too-close zones, `plan-underworld.md` L2), so each zone's fog
  must take only the cells inside its own rectangle, never a whole chunk.
  Test it with two zones whose rectangles fall into one chunk.
- **L8 — Moving ground orphans its reveal** (D10): changing a zone's `origin`,
  or EXTRACTING an area of `world.json` into its own file (which must move it,
  D9). The cells stay at the old world position and draw on whatever ground is
  there now, or on nothing. ⭐ **The recipe when it happens (not built now,
  YAGNI):** a one-off migration in the SAME commit as the content move shifts
  every stored cell inside the moved rectangle by the move's offset. Pick the
  offset as a **multiple of the cell size (2 u)** and the shift is lossless;
  as a **multiple of the chunk size (128 u)** and whole chunks move unchanged,
  provided the moved rectangle is chunk-aligned too. Worth one line in
  `docs/manual-tiled-editor.md` when F1 lands.

---

## 6. PO questions — all ruled 2026-09-27

1. **A zone resized in Tiled** → **drop** that zone's stored reveal. Then made
   moot by D9: a resize no longer invalidates anything (D10).
2. **Does flying reveal more?** → **same as walking** (D11).
3. **Does death or ascension change the reveal?** → **no** (D12).
4. **Per zone file or world coordinates?** → **world coordinates, chunked**
   (D2, D9).

None open. The design proposals D3-D8 are execution-time defaults, not PO calls.

---

## 7. Test strategy

**F1 (Go, TDD):**
- Cell/chunk math: coordinates on both sides of 0, on exact cell and chunk
  boundaries, and at ±`MaxWorldCoordinate` (L3).
- Marking an AOI rectangle sets exactly the overlapped cells, across a chunk
  boundary (touches 2 or 4 chunks); a repeat mark changes nothing; only
  touched chunks exist.
- Cell-change gating: N ticks standing still mark once (D5).
- The mark uses the constant AOI while flying (L4).
- `persist` round-trip: `Fingerprint()` equal for a saved and reloaded state
  (sorting); a row with a different grid skipped (D10).
- `store` against `aura_test` (`make -C backend db-test`): save, load, re-save
  grows, never shrinks; negative chunk indices survive the round trip.
- `saveWatch` is NOT forced by a new cell (D6).

**F2:**
- vitest: chunks → the opaque texels of ONE zone, with a non-zero origin (L3)
  and a chunk straddling two zones (L7).
- vitest: a chunk received before its zone's fog exists is applied on creation.
- Playwright leg (template: `.claude/skills/verify/campfire-bind-persistence.mjs`):
  join, walk away from spawn, force a save (logout), reload, rejoin, and sample
  the fog mask at the earlier position. ⚑ Also assert a **negative**: an area
  never walked is still fogged, or the leg passes with everything revealed.
- In-game PO check: explore, reload the page, open `M`; enter the underworld
  and back, reload, check both maps.

**Every chunk:** `go build ./...`, `go test ./...`, `npm test`, `npm run
typecheck`, and the schema line in the ledger.

---

## 8. Relations

- **`plan-minimap-local-viewport.md`**: independent; either order works. Its M3
  touches how the fog mask is parented under the moving docked layer; this plan
  touches only what the mask contains. Its look sitting is where D3's cell size
  gets judged at radar zoom.
- **`plan-world-scale.md` S2** (fog texel sizing): if S2 raises `fogWidth`, D3's
  cell size may want to shrink with it; the grid columns make that a data
  change, not a migration.
- **`plan-underworld.md` D3** (the map swaps with you): unchanged. Each zone
  keeps its own map; D9 only changes where the reveal is stored.
- **`archive/plan-world-map.md`** §4.2 / C1: the session-only ruling this plan
  reverses.

---

## 9. Chunk ledger

### F1 — server track + persist ✅ 2026-09-27 `[uncommitted]`

**Schema: DB +1 table (`000003_character_map_fog` pair) · wire NONE · conf
NONE · content NONE.**

What shipped:
- `pkg/aura/mapfog` (new): the cell/chunk math (`math.Floor` both levels),
  `MarkAt` (fixed 20 × 12 AOI from `constant.ViewPort*`, gated on a cell
  change), `Seed` (union; skips a foreign grid or a wrong-sized bitmap),
  `Chunks` (sorted COPY, safe to hand to the writer goroutine). A position
  whose chunk an `int16` cannot name (NaN, a runaway teleport) marks nothing.
- `persist.FogChunk` + `CharacterState.MapFog` + `SortFogChunks`.
- `store`: upsert per explored chunk (`ON CONFLICT … DO UPDATE`, overwrite,
  never delete); load returns every row whatever its grid, `ORDER BY chunk_x,
  chunk_y`.
- `sys`: `ConnectionStateSystem.fog`, with every seam `discovered` has: ticket
  seed at join (union), reconnect stash on BOTH the alive and dead paths,
  re-added after death's removal fan-out, dropped on disconnect;
  `trackMapFog()` runs each tick after the dwell tracker; `characterState`
  takes the chunks, so the interval, forced, disconnect, flush and
  session-expiry saves all carry them. `saveWatch` is untouched (D6).
- `cmd/harnessdb -cleanup` owns the table (L1); `manual-tiled-editor.md` §6
  carries L8's one line.

Findings:
- ⚑ **§4.2 said "a fog component on the player"; it is CONNECTION state**
  beside `s.discovered`, because the discovered set it was meant to sit next
  to lives there, and the stash/death seams already exist for it. A player
  field would have needed its own carry through `deadState` and the stash.
- ⚑ **Save = OR** (§4.3's open pick), after the review below reversed a first
  "overwrite": the rows are read `FOR UPDATE` in the save transaction and ORed
  in Go (Postgres has no `bytea` OR). The PK excludes the grid, so after a
  deliberate grid change a new chunk at the same `(x, y)` REPLACES the
  old-grid row: D10's reset, row by row.
- ⚑ **Bit order is LSB-first within a byte**, row-major within the chunk
  (`TestBitLayout_RowMajorLSBFirst`). F2's decoder must match it.
- ⚑ The game-side round-trip test (`TestCharacterStateRoundTripsThroughAPlayer`)
  can no longer assert equality for the fog: a restored player reveals its own
  jittered spawn view on its first tick, so it asserts COVERAGE for that field.
- ⚑ A mark is **11 × 7 cells, always**, derived from the CELL, not the exact
  position (review fix 2 below); §D5's "~66" becomes 77.

**Review fixes (same day, before F2):**
1. **A stale snapshot could shrink the stored reveal.** `/select` can read the
   row while the character's previous save is still queued (the writer in
   backoff after a database blip); the new session, seeded from that stale
   load, would then overwrite the newer bits. Fixed by ORing on save, pinned
   by `TestMapFogSaveGrowsAndNeverShrinks`'s stale-snapshot leg. Level/XP share
   the stale-read hazard (pre-existing, not this plan's); for a set that only
   grows it was avoidable.
2. **The per-cell gate under-revealed the far edge.** The rectangle came from
   the exact position but was only marked on entering a cell, so a cell
   entered exactly on its line (a warp to whole coordinates) and crossed
   without leaving it kept a sliver up to one cell wide fogged. Now the
   rectangle is `ceil(half-AOI / cell)` cells either side of the centre's
   cell, which also stays right if the [PLACEHOLDER] cell size stops dividing
   the half-AOI (`TestMarkAt_EnteringACellOnItsLineStillCoversTheWholeCell`).
3. Left as is (low): rows on an old grid stay in the table forever, loaded and
   skipped; each save upserts every explored chunk, one statement each.

Verified: `go build ./...` · `go test ./...` all green except the `world` +
3 `cmd/simharness` placement pins that CLAUDE.md Status records red at HEAD
(content roster, unrelated) · `mapfog` 15 cases · `sys` 9 new map-fog cases ·
`store` against `aura_test` (round trip with negative chunk indices;
grows-never-shrinks; foreign grid returned as stored) · aurad booted,
`🗄️ database schema ready version=3` · a 2-bot `loadbot -disperse` session
wrote one 512-byte row each at chunk (−2, 0) through the real disconnect save
(~200 cells set) · `harnessdb -cleanup` ran clean afterwards (aurad stopped
first, then restarted). No in-game look: F1 has no visible surface.

### F2 — wire + client restore ✅ 2026-09-27 `[uncommitted]`

**Schema: DB NONE · wire +2 tables (`FogChunk`, `MapFog`), +1 `GameState`
field (`map_fog`, appended) · conf NONE · content NONE.**

What shipped:
- `server.fbs` per §4.4; Go + TS bindings regenerated (flatc v24.3.25, the
  diff is additive only).
- `codec.MapFogMarshalFlatbuf`; the grid is read off the chunks, which all
  come from one live `mapfog.Fog`.
- `PlayerEntity.MapFog/NoteMapFog`, a one-shot reset with the campfire pair;
  `ConnectionStateSystem.publishMapFog` at the four ENTERING sites (join,
  reattach, respawn, revive), not at a dwell.
- Client: `map/logic/FogReveal.ts` (pure: `mergeMapFog` = D8's union,
  `zoneCellMask` = one zone's cells, origin included, clipped per cell for
  L7); `MapFog.applyRevealed` paints the mask in ONE draw (a canvas of one
  texel per cell, stretched with nearest sampling, `clear: false`);
  `MiniMap.setMapFog` merges, paints every existing zone fog, and a zone fog
  created later (the underworld, first entered this session) is painted on
  creation. `setup()` (a new Welcome) drops the held copy with the fogs.

Findings:
- ⚑ `MapFog` now knows its zone's ORIGIN (constructor arg): placing a world
  cell on a zone-local texture needs it, and a fog of a zone that is not the
  current one must be paintable when a publication lands.
- ⚑ `hasRevealedAnything` now also counts a restored reveal.
- ⚑ The bits are COPIED out of the message buffer at decode.

Verified: `go test ./...` (same 4 known reds only; new: codec round trip +
empty-is-absent, 3 sys publication cases) · `npm test` **1299/1299** (new:
`FogReveal.test.ts` 9, incl. the LSB-first layout, negative indices, a
non-zero origin, a chunk straddling two zones) · `npm run typecheck` · prod
build · **`.claude/skills/verify/f2-map-fog-persistence.mjs` 10/10**: warp
~140 u from the only starting fire, leave to character-select, play again;
the MapFog object is a NEW one (control), the publication arrived, the
visited spot is revealed, a never-visited spot is fogged, and edge probes put
the restored 11 × 7 cells exactly where they were seen · `harnessdb -cleanup`
clean. Regression runs: `c1-world-map` 10/12 (6 + 7, letterbox click
open/close; this diff touches no input or overlay code, and the 540 × 360
world changed the letterbox; not re-run at HEAD) · `c2-campfire-markers`
12/17 (its fire coordinates predate the 540 × 360 world: it hardcodes
spawnpoint-2 at (44, 10.5), now at (−154, 10.5); content drift).

⭐ **PO in-game pass 2026-09-27: "works fine"** (§7's check; which of its legs
the PO walked was not itemised). The plan is complete and archived the same
day. Carried forward, not owed here: D3's cell size is judged at
`plan-minimap-local-viewport.md`'s look sitting (§8), and L8's remap recipe is
built only when ground actually moves (`manual-tiled-editor.md` §6).
