# Plan: Passages — exits as their own primitive, with words, looks and touch areas

**Status: P1-P3 BUILT 2026-10-18 (branch `passages`; P1 `31b87226`, P2 `0bc12406`, P3 uncommitted;
PO look owed).** R1-R6 RULED, D1-D11 PROPOSED (built as written; Q5 + Q7 taken as proposed). Open PO
calls in §7; P4 next.

**Owns:** the `exits` Tiled layer, `zone.exits[]` (talk exits) and `zone.exitAreas[]` (touch
exits), the `Passage` entity, exit looks, the words a door shows, and the touch crossing.
**Builds on:** `plan-underworld.md` (the `anchor` travel mode, U3/U3b; the directional curtain,
D5/D7). **Amends** that plan's **D2** (§2, R2).
**Schema (as designed):** DB none · conf none · **wire +1 EntityType (`Passage`), +1
appended `Conversation` field, +1 appended own-player field** · **zone format +2 object arrays
(`exits`, `exitAreas`)** · lang: new key families in `api/lang/{en,de}/regions.arb`.

⚑ Line references pinned 2026-10-17 at `96597765` (main); re-verify before relying on them.

---

## 1. What this is

Today a way between zones is a **talking mob** placed as a spawn: `CaveMouth` (id 72) going
down, `CaveExit` (id 73) going up, both `entityType: Signpost`, authored in Tiled as an
`AuraSpawnTalker` on the `spawns` layer, with the destination per placement
(`spawns[].anchor`, `world/zone.go:268`). 12 placements (barn 1, koboldCave 1, tunnel 2,
underworld 2, world 6), plus 6 in `.debug/`.

The PO's problems with that (2026-10-17):

1. **It is authored as an NPC.** An exit is level geometry, but it sits in `spawns` as a
   `SpawnTalker`.
2. **Every door says the same thing.** The name and dialog belong to the *definition*, so the
   barn's door in `world.json` (anchor `barn-inside`) reads **"Cave Mouth — A dark opening in
   the rock."** The PO wants the destination's name and words by default ("Barn", and a line
   describing the barn entrance), and custom names and words where wanted.
3. **No walk-in exits.** The PO wants to try glowing areas that move you on touch, with no
   talking.
4. **Exits show a health bar.** Every client `Mob` builds an `OverheadHealthBar`
   (`Mobs.ts:609`), Signpost included. On a door that makes no sense.
5. **There is one look**, the placeholder signpost.

### 1.1 What already works and is reused

- **The move itself:** `portalTravel.Travel` (`sys/interaction.go:341`) does `Ground()` →
  `SetPosition(JitterAround(dest))` → `SetConversingWith(0)`, and anchor mode needs no owner
  (U3). A touch exit calls the same seam.
- **The direction:** `portalTravel.Direction` (`interaction.go:379`) derives descend / ascend /
  lateral from the zones the door and the anchor stand in. A touch exit reuses it as is.
- **The curtain:** `zones/logic/CurtainSequence.ts` + `ZoneCurtain.ts` (`beginCrossing`,
  `cancelCrossing`, `runWhenCovered`). It already handles an arrival that beats the cover.
- **The arrival card's place lookup:** `Game.arrivalPlace` (`core/logic/Game.ts:915`) names
  the place a position lands in: the region title, else `zone.<name>.name`. `zone.barn.name`
  is already **"Barn"** (`api/lang/en/regions.arb:229`). This is the default door name (D6).
- **Area containment on the server:** `QuestSystem.checkReach` (`sys/quest.go:96`) tests a
  player against region polygons every tick and skips flyers. That is the touch exit's
  precedent.
- **Static lights from zone data:** `DarknessOverlay.punchStaticLight`
  (`darkness/logic/DarknessOverlay.ts:389`) paints the glow and registers it for `isHidden`.
  A touch exit's glow uses it.
- **Anchor names are already unique across the placed zone set** (`checkSetWide`, L5b, cited
  in `world/travel_anchors.go:76`), so they can key lang strings.

---

## 2. PO rulings (2026-10-17)

- **R1 — exits get their own Tiled layer, `exits`.** Not `spawns`, not any other layer. Talk
  exits and touch areas share it, told apart by class (D2).
- **R2 — touch exits are added.** This **amends `plan-underworld.md` D2** ("an interact
  prompt, not a walk-in trigger volume"): talk exits stay, and touch exits sit beside them.
  The owed edit to that doc is a pointer to this ruling.
- **R3 — exits show no health bar.**
- **R4 — five selectable looks:** `hidden` (no art, no frame), `stairs-down`, `stairs-up`,
  `door`, `cave-mouth`. Placeholder art for now.
- **R5 — default words come from the destination; custom words are possible per exit.**
- **R6 — touch exits glow.** "Glowing areas you enter."

---

## 3. Design

### D1 — two zone arrays, `exits` and `exitAreas`

```jsonc
"exits": [{
  "id": "barn-door",        // optional slug, unique across the placed set (D7)
  "x": -197.51, "y": 14.59,
  "rotation": 0,            // radians, for directional art (stairs)
  "anchor": "barn-inside",  // required: where it leads
  "look": "door",           // R4; absent = "cave-mouth" [PLACEHOLDER default]
  "door": "CaveMouth"       // optional: the conversation definition (D5); absent = the generic one
}],
"exitAreas": [{
  "id": "glow-pit",         // optional, as above
  "points": [{"x": 0, "y": 0}, ...],   // a closed polygon
  "anchor": "under-west",
  "look": "hidden"          // the art drawn at the centroid; the glow is always drawn (R6, Q4)
}]
```

Both go on `world.Objects` (`zone.go:~723`), so every area group in Tiled gets an `exits`
layer automatically and `Zone.flatten` folds them like every other array.

⭐ **Two arrays, not one with an optional `points`.** A talk exit and a touch area share
`anchor` and `look` and nothing else: `door` means nothing on an area, and a conversation has
no polygon. Two arrays give two exact Go validators instead of one struct whose fields are
legal only in combination. This follows the paths/polygons split, which also shares one Tiled
layer (zone-polygons D5).

⚑ **`spawns[].anchor` stays.** A real NPC that also takes you somewhere (a ferryman with
a full conversation and a travel row) is still a spawn. Exits are for doors.

### D2 — Tiled: one `exits` layer, two classes

- **`AuraExit`** (a point, Insert Point): form fields `id`, `anchor`, `look` (enum), `door`
  (enum of conversation definitions with an anchor travel row), `rotation` is the object's own.
- **`AuraExitArea`** (a polygon or rectangle): `id`, `anchor`, `look`.

The converter tells them apart by class, refuses a point with `AuraExitArea` or a polygon with
`AuraExit`, and refuses any other class on the layer. That is the paths layer's L2b check, a
third time.

⚑ **The four-writer tax applies** ([[project-zone-format-whitelists]]): `zone.go` (authority)
· `aura-convert.js` `serializeZone` + reader · `ZoneModel.getZoneAsJSON()` (the in-game
editor must at least carry both arrays through untouched) · `aura-world-format.js` (shapes map
generically; the class read-back was fixed 2026-09-10, so check it, don't assume). The
completeness pin goes red first. That is correct; never silence it via `NOT_AUTHORED_IN_TILED`.
Fixtures must author `rotation`, `door`, `id` and `look` non-empty, or the pin passes while
both writers drop them.

### D3 — a talk exit is still a mob under the hood, synthesized at load

Interactables must be mobs (underworld L6: props are not interactable, and
`PhysicsSystem.Remove` panics on statics). So at load each `exits[]` entry becomes a
synthesized `world.Spawn{Mob: door, X, Y, Anchor}` handed to `NewMobSystem` (`sys/mob.go:155`),
carrying a pointer back to its exit for the words (D6). The author never sees a spawn, and
the JSON never contains one.

- **No new mob definitions.** The generic door is the existing `CaveMouth` (its id, name key
  and lines are unchanged; its lines become the last fallback, D6). `CaveExit` stays as a
  selectable `door` for upward exits whose row should say "Climb up." No file is deleted, so
  the roster census pins do not move.
- **Boot validation** (in `CrossValidateTravelAnchors`'s neighbourhood): `anchor` exists in
  the placed set; `door` names a definition with exactly one anchor-mode `travel_to` row and
  `entityType: Passage` (D4); a talk exit inside a campfire dwell circle **refuses the boot**.
  That last one upgrades underworld L8 (portal-spells D8) from a doc warning to a check,
  possible now that an exit is its own primitive.

### D4 — the `Passage` entity: draws nothing, no health bar, no frame

One new `EntityType`, `Passage = 120` (the next free value, `api/schema/server.fbs`). The
client class extends `Mob` but skips `initHealthBar` (R3), the medallion frame, the nameplate
and the art. **It is only the thing you talk to.** `CaveMouth`/`CaveExit` switch from
`Signpost` to `Passage`.

⛔ **Underworld L7 said don't mint an EntityType, and this is the considered exception.** One
value replaces a misused one (Signpost) and is the last one exits need: the five looks are
*not* EntityTypes (D5). The `…_EveryStreamedEntityTypeHasACase` pin will demand the client
`Record` entry, which is the point.

### D5 — looks are drawn by the client from the bundled zone, not streamed

The client already bundles every zone. It draws each exit's art from `exits[].look` /
`exitAreas[].look` at load, the way it draws decals and static lights, from a small client
table (`look → texture, size u, anchor`) [PLACEHOLDER sizes]. So:

- a new look is one SVG plus one table row: no wire, no server, no EntityType;
- `hidden` draws nothing: no art and no frame (R4). The `Passage` entity draws nothing either,
  so a hidden talk exit is found by its E prompt alone;
- `cave-mouth` reuses `resources/caveMouth.svg`, the existing CaveMouth **prop** art (prop 98).
  `stairs-down`, `stairs-up` and `door` are new placeholder SVGs;
- `rotation` turns the art (stairs point a way).

⚑ **Rejected: a `look` field streamed on the entity.** It works for talk exits but not touch
areas (which have no entity), so it would need the bundled path anyway, and then two paths.
⚑ **Rejected: one EntityType per look**: four permanent wire values for placeholder art.
⚑ The art inherits [[project-zone-edit-half-live]]: it draws from the bundle before the
server behaves. Same as every other zone geometry.

### D6 — the words a door shows: three tiers

| | Header (the panel's name) | Text (the node's line) | Row ("go") |
|---|---|---|---|
| **1. The exit's own** | `exit.<id>.title` | `exit.<id>.text` | `exit.<id>.go` |
| **2. The destination's** | the place at the anchor (`arrivalPlace`: region title, else `zone.<name>.name`) | `anchor.<name>.text` | — |
| **3. The definition's** | — | `conv.CaveMouth.*` (today's lines) | `conv.CaveMouth.climb-down` |

The first key that exists wins, per column. Keys live in **`regions.arb`** (the places file,
which already holds `zone.*.name`), English + German in the same change (D23).

So with zero authoring, the world's barn door reads **"Barn"** (tier 2, `zone.barn.name`), and
the barn's way up reads the name of the region its anchor `barn-surface` stands in. Authoring
`anchor.barn-inside.text` ("A low door into the barn's cellar.") gives every door leading
there that line. An exit with an `id` can override any column.

⚑ **Where each column is resolved, and why they differ:**

- **Text and row resolve on the server at boot.** They already travel as stable keys
  (`line_ids`, `GameStateMessage.ts:494`: "the id IS the line's full key"), so the server
  just picks which key to send, with its English as the fallback.
- **The header resolves on the client.** The tier-2 header is a *place lookup*, and that
  lookup already exists exactly once, in `arrivalPlace`. Porting it to Go would make two
  "last containing region with an id wins" rules that must agree forever. So the
  `Conversation` table gets one appended field, **`exit_id:string`** (the exit's id, or a
  synthesized `@<anchor>` for an id-less exit; ⚑ the encoding is the implementer's call).
  From it the client finds the exit in its bundle and resolves tier 1 → tier 2. Today the
  header comes from the mob catalog (`GameStateMessage.ts:528`). For a `Passage` conversant
  it comes from here instead.

⚑ **Gates and branches are tier 0: a custom `door`.** A door that needs a quest gate
(`quest_at_stage`), several nodes, or a refusal line is its own conversation definition with
`entityType: Passage`, selected by `door`. It gets the content editor and every conversation
feature for free. Its own lines win over tiers 2-3 (a definition authored for one door means
it); exit-level keys still win over it.

⚑ **Quests, confirmed for the PO 2026-10-17:** a custom door is a full conversation
definition, so it keeps everything a door has today: row `conditions` (`quest_at_stage`, ...),
lines that change by quest stage, giving or turning in a quest, and being a `talk_to`
objective. ⚑ `talk_to` names a definition (`"npc": "FallenTraveller"`), so a door that a
quest counts **must** have its own definition: a `talk_to` on the generic `CaveMouth` would
count every door in the world. A **touch** exit has no conversation and is ungated in v1
(D8, Q2). For a quest that sends you *through* one, use a `reach` objective on a region
drawn over the destination.

### D7 — exit ids

Optional slugs (`^[a-z0-9-]+$`), unique across the placed zone set (the anchor rule).
Authored, not generated: they appear in arb keys a person edits, so `exit.barn-door.title`
must be readable. **Required only when the exit has words:** the lang test refuses an
`exit.<id>.*` key whose id no placed exit has (an orphan) and a duplicate id. Never keyed by
position ([[feedback-never-position-keys]]).

### D8 — touch exits: a new small `PassageSystem`

Players only. Per tick, for each player not flying: an AABB precheck, then point-in-polygon
against `exitAreas` (≤ dozens per world, so a flat scan; no grid until measured). Per player
it keeps one tiny state: `armed`, `dwellingIn`, `dwellTicks`.

- **Fires on ENTERING, never on standing.** A player who *arrives* inside an exit area (a
  login, a respawn, a travel landing) is disarmed until they have been outside every exit area
  once. That is the ping-pong guard. Boot validation adds the cheap half: an anchor inside any
  exit area refuses the boot (so a paired pair of areas cannot be authored to bounce).
- **A short dwell, then the move.** [PLACEHOLDER 0.3 s ≈ 9 ticks; ≥ the curtain's
  `COVER_MS` 180 ms.] Leaving the area during the dwell cancels it. That also keeps an
  edge-brush from yanking you (Q1).
- **The move is `portalTravel.Travel` in anchor mode**, `from` = the area's centroid for
  `Direction`. Nothing new about the landing.
- **Not gated** in v1 (Q2): a glowing area that refuses you reads as broken. A gated passage
  is a talk exit with a custom `door`.

### D9 — the touch curtain: one own-player field

A talk exit starts the curtain on the *press*, because the row carries `travel` (D7 of the
underworld). A touch exit has no press. So the own-player block gets one appended
**`crossing:ubyte`**: the `TravelDirection` while a dwell runs, `0` otherwise. It is a plain
per-tick value, not change-only, so no presence bit ([[project-change-only-wire-fields]]):
one byte on one entity.

The client calls `beginCrossing(dir)` when it turns non-zero, and `cancelCrossing()` if it
returns to `0` with no zone change. The arrival is then the same case a fast server reply
already is.

### D10 — the glow

A touch area draws its polygon as a soft coloured ground fill plus one static light at its
centroid (`punchStaticLight`, coloured, flickerless) [PLACEHOLDER colour, radius]. Both come
from the bundle (D5's path). The light only shows where it is dark, and the ground fill is
what makes it glow in daylight.

⚑ **The map fog.** `plan-map-fog-darkness.md` lets static lights reveal dark map cells,
and the server decides. If exit glows should reveal (likely yes: a glowing exit is a
landmark), the server's static-light list gains them. That is a small addition to P5, not a
new design.

### D11 — migration: 18 door spawns move to `exits`

A one-shot script (`tools/…/migrate-exits.mjs`, scratch-run then deleted, the N2 precedent)
moves every `CaveMouth`/`CaveExit` spawn into `exits[]` of the same area. It keeps `x`, `y`,
`anchor`, puts `door: "CaveExit"` on the upward ones (to keep their words), and picks `look`
by D11a. `.debug/` zones included.

- **D11a, the looks:** where a `CaveMouth` **prop** already draws the hole at that spot
  (`world.json` has two, around lines 5651 and 9513), migrate to `hidden` (the prop is the
  picture). Elsewhere: `cave-mouth` going down, `stairs-up` going up (Q7).
- ⛔ **The converter must refuse to OPEN a zone that still has a door in `spawns`** after
  P1, pointing at the script ([[project-zone-format-whitelists]] §"renamed key"). Otherwise a
  stale `.tmx` opens fine and the next save keeps the old shape. Strictly, the old shape is
  still *valid*. The refusal is a content rule ("doors live in `exits`") the converter
  enforces, and it can be dropped once no zone has one.

---

## 4. What changes for the author (Tiled)

1. Select the area's **`exits`** layer.
2. **Talk exit:** Insert Point, Class `AuraExit`, pick `anchor`, `look`, optionally `door`
   and `id`.
3. **Touch exit:** draw a polygon/rectangle, Class `AuraExitArea`, pick `anchor` and `look`.
4. **Words:** nothing, and it reads the destination. For custom words, give it an `id` and add
   `exit.<id>.title/text/go` to `api/lang/en/regions.arb` + `de/` (Q5).

`manual-tiled-editor.md` gains a section; the `AuraSpawnTalker` door instructions go.

---

## 5. Chunks

| # | Chunk | Contents | Size |
|---|---|---|---|
| **P1** | The `exits` layer | `exits[]` in the zone format + the four writers + the pin; Tiled `exits` layer + `AuraExit`; server synthesizes the door mobs (D3) + validation incl. the campfire refusal; the migration script (D11) + the open-refusal; manual section. ⚑ Behaviour identical: still Signpost art, still the definition's words. | M |
| **P2** | `Passage` + looks | EntityType 120, client class with no bar, no frame, no art (R3); `look` + `rotation` and the client look table; 4 placeholder SVGs (cave-mouth reused); `CaveMouth`/`CaveExit` → `Passage`; migrated looks per D11a. Fix the stale `CaveMouth = 98` fbs comment (it claims walk-on travel exists). | M |
| **P3** | Words | Exit `id` (D7); the three tiers (D6); `Conversation.exit_id`; client header resolution via `arrivalPlace`; `anchor.barn-inside.text` + the barn door's words as the first content, en + de; lang orphan/dup checks; `extract-english`/`sheet.mjs` learn the `exit.`/`anchor.` keys if they need to. | M |
| **P4** | Touch exits, server | `exitAreas[]` + four writers + `AuraExitArea`; `PassageSystem` (D8: arming, dwell, cancel, flyers skipped); anchor-inside-area refusal; `crossing:ubyte` (D9). | M |
| **P5** | Touch exits, client | The glow (D10), the look at the centroid, `crossing` → curtain begin/cancel; map-fog static light if Q6 says yes; one example touch exit in the Fallow Reach test strip; PO look. | M |

Each is independently shippable. P1 → P2 → P3 fixes the PO's barn complaint fully. P4/P5 are
the experiment.

---

## 6. Test strategy

- **Go (TDD):** zone load accepts/refuses `exits` and `exitAreas` (missing anchor, bad door,
  the wrong `entityType`, duplicate id, a talk exit in a dwell circle, an anchor inside an
  area); a synthesized door travels exactly like today's spawned one (port
  `interaction_anchor_test` / `interaction_direction_test` to the exit path);
  `PassageSystem`: enter → dwell → travel; leave mid-dwell → no travel; arrive inside →
  disarmed until out; flyer skipped; `crossing` reads the direction during the dwell and `0`
  after.
- **Vitest:** the completeness pin (both writers, both arrays, fixtures authoring every
  tri-state non-empty); the converter's class/shape refusals and the open-refusal; the header
  resolution tiers (pure, over a fixture bundle); the look table covers every enum value.
- **`tools/tiled/verify.sh`:** a leg that saves an `exits` layer with both classes through real
  Tiled and reads both arrays back ([[project-tiled-roundtrip-blind-spot]]: names only, not
  the GUI).
- **Harness (`verify`):** talk to the barn door → header "Barn" → row → the curtain descends →
  arrive; walk into the example touch area → curtain → arrive; walk back out of the arrival
  area → no bounce.
- **PO in-game:** the five looks, the glow in daylight and in the dark, the dwell's feel,
  and no health bar anywhere on a door.

---

## 7. Open PO calls

- **Q1 — the dwell.** 0.3 s with walk-out-cancels (proposed), or instant on touch?
- **Q2 — touch exits in combat.** Allowed, same as talking to a door today (proposed), or
  refused while in combat? Either way mobs don't follow (they never have).
- **Q3 — a name in the world for touch areas?** Proposed: none; the arrival card names the
  place. Alternative: the destination's name floats over the glow when you come near.
- **Q4 — `hidden` on a touch area** hides the art but keeps the glow (proposed; the glow *is*
  the exit). Or should there be a separate glow switch?
- **Q5 — where custom English is typed.** Proposed: in `regions.arb` (the regions precedent:
  Tiled shows only the id). Alternative: `title`/`text` properties in Tiled, extracted on save,
  which is nicer for the level designer but makes the Tiled save write lang files.
- **Q6 — do exit glows reveal the map in darkness** (D10)? Proposed yes.
- **Q7 — migrated looks** (D11a): `cave-mouth` down, `stairs-up` up, `hidden` where a cave
  mouth prop already stands. OK?
- **Q8 — the `anchor` field in Tiled:** a free string (today's `spawns[].anchor`, typos
  refused at boot) or a dropdown of every placed anchor (needs a palette regen whenever an
  anchor is added)? Proposed: string in P1, dropdown later if typos bite.
- **Q9 — outside scope, flagged:** the memorial stone and the ascension stone are `Signpost`
  mobs too, so they also carry a health bar. Fix them the same way (a cheap follow-up), or
  leave them?

---

## 8. Landmines

- **L1 — the four writers** (D2). A field one writer drops survives a load and vanishes on the
  next save with every test green.
- **L2 — the old shape opens silently** (D11). Ship the open-refusal with the migration.
- **L3 — ping-pong.** Two touch areas whose anchors sit in each other bounce a player forever.
  Disarm-on-arrival is the fix; the boot refusal is the belt.
- **L4 — the campfire override** (portal-spells D8). Now a boot refusal for talk exits (D3);
  touch exits are immune (no E press).
- **L5 — `Passage` must stream like any mob.** The `…_EveryStreamedEntityTypeHasACase` pin and
  the client `Record` both need the entry, or the snapshot encoder panics (the corpse bug's
  shape, M1-F1).
- **L6 — `frontend/dist` bundles the zones**: rebuild it after P1/P2 or `:2000` draws the old
  doors.
- **L7 — a half-live zone edit**: a new exit draws (bundle) before it works (server's embedded
  copy); restart and cp-defs by hand on the Windows box ([[project-no-make-on-windows-box]]).
- **L8 — `arrivalPlace` reads the bundle, not loaded regions** (`Game.ts:911`), which is why
  the header can name a place in a zone that isn't loaded yet. Keep it that way.

---

## 9. Schema impact

- **DB:** none (a crossing is not persisted; a login inside an area is disarmed, not stored).
- **Wire:** +1 `EntityType` (`Passage = 120`, permanent) · +1 appended
  `Conversation.exit_id:string` · +1 appended own-player `crossing:ubyte`.
- **Zone format:** +2 object arrays (`exits`, `exitAreas`); the door spawns migrate out of
  `spawns`.
- **Conf:** none.
- **Content:** `CaveMouth`/`CaveExit` change `entityType`; new keys `exit.*` / `anchor.*` in
  `regions.arb` (en + de).

---

## 10. Chunk ledgers

### P1 — the `exits` layer ✅ BUILT 2026-10-17 (branch `passages`, worktree `aura-passages`)

**What landed.** `zone.exits[]` = `{x, y, anchor, door?}` (Go `world.Exit` in `zone.go`, loader halves
in `world/exits.go`), after `spawns` in `Objects` order. `door` absent = `world.GenericDoor`
(`CaveMouth`). Each exit resolves its door (exactly one anchor-mode `travel_to` row, else refused)
and `Zone.ExitSpawns()` synthesizes the spawn the MobSystem places (`allSpawns`), field for field the
old door spawn. `CrossValidateTravelAnchors` walks exits too. ⭐ **L8 is a boot refusal now:**
`world.CrossValidateExitClearance` in `loadZones` (dwell radius from the Campfire mob, the boot's
own derivation, + the door's `SenseRadius`). Four writers: `zone.go` · `aura-convert.js` (layer
`exits` after `spawns`, class `AuraExit`, `AuraExitDoor` enum, sentinel `(generic door)`) ·
`ZoneModel.getZoneAsJSON` (carried, never edited) · `aura-world-format.js` (generic, unchanged,
verified through real Tiled). Palette: `AuraExitDoor` + `AuraExit` appended LAST (no renumber),
`DOOR_NAMES` in content.json. Migration: `scripts/migrate-exits.mjs` (KEPT, the open-refusal points
at it; lossless-or-nothing) moved all 18 doors (12 + 6 in `.debug/`); the converter refuses to OPEN a
zone with a `CaveMouth`/`CaveExit` spawn and to SAVE one on the spawns layer. Also: `ZoneAreas` +
verify `lib/zone.mjs` kind lists, map quest markers read exits as their door, manual section
"Exits", underworld D2 pointer (R2).

**Decisions made in the chunk (flag for the PO):**
- **P1 carries only `x, y, anchor, door`.** `look`/`rotation` are P2, `id` is P3, per §5; each
  later chunk pays the four-writer tax for its own keys.
- **The open/save refusal is keyed on the two migrated definitions** (`MIGRATED_DOORS`), not on "every
  door": a ferryman with one anchor row must stay placeable as a spawn (D1). P2 can narrow it to
  `entityType: Passage`.
- **The Passage `entityType` check (D3) waits for P2**, the EntityType does not exist yet.
- ⚑ **`EntityType 120` is TAKEN** (`BerryBush`, `5cf3b781`), and herding claims one more (`Sheep`).
  P2 must pick the next free value at its own time; D4's "120" is stale.

**Checks.** Go: `world` exits tests (load, flatten, refusals, exactly-one row, synthesized spawn,
Place offset, travel pass, clearance) · `cmd/aurad` passages tests over the migrated content ·
`go test ./...` green except two **pre-existing at HEAD** reds, measured with this change stashed:
`TestPropContent_C1bMigrationPreservesLookAndCollision` (Tree/Boulder, already on the
known-inconclusive list) and `simharness TestRunPlacementsBattery_ReconcilesAgainstTheAuthoredWorld`.
`aurad -validate` 0 findings (disk, embedded, `-debug-zones`). Vitest 1784/1784 incl. the
completeness pin (`exits` + `door` authored), the stack order, and an exits block; `tsc` clean.
`tools/tiled/verify.sh` all green through real Tiled, incl. new leg 2e (every zone with exits
byte-identical, the door-in-spawns open refused). In game: `.claude/skills/verify/p1-exits.mjs` 3/3
(the generic barn door → barn, the barn's CaveExit → surface, the two talk as different definitions).

**Schema:** DB none · wire none · conf none · **zone format +1 array (`exits`)**, doors migrated out
of `spawns` · content: `cave-mouth.json` comment only.

### P2 — `Passage` + looks ✅ BUILT 2026-10-17 (`0bc12406` on `passages`)

**What landed.** ⭐ **`EntityType Passage = 122`**, not D4's 120 (BerryBush took 120, main's Sheep
took 121 after this branch forked; the merge brings 121 in). Client `Mobs.Passage`: an empty
texture at the wire size (so the E badge floats at the reach, not on the centre), and a new
`Mob.isBare()` hook skips the health bar and the plate text; the quest glyph and the badge stay.
`CaveMouth`/`CaveExit` → `entityType: Passage`, and the boot REFUSES an exit whose door is any other
entityType (D3, now possible). Zone format: `exits[].rotation` (radians, absent = 0) and
`exits[].look` (`world.ExitLooks`: `cave-mouth` default, `hidden`, `stairs-down`, `stairs-up`,
`door`; the server refuses any other), key order `x, y, rotation, anchor, look, door`. Both JS
writers drop the defaults. Tiled: `look` member on `AuraExit` (`AuraExitLook` enum, pushed
last), the turn is the point's own rotation. Client: `features/exits/` (`ExitLookTable.ts` pure:
names, [PLACEHOLDER] sizes, placements; `ExitLooks.ts` draws sprites into a new `terrain.exits`
layer above the decals, from the bundled zone, origin applied). Art: `stairs-down.svg`,
`stairs-up.svg`, `door.svg` placeholders; `cave-mouth` reuses the prop's `caveMouth.svg`. Looks
migrated by D11a (Q7 as proposed): `hidden` at the two doors a CaveMouth prop already draws
(`koboldcave-inside`, `tunnel-west`), `stairs-up` on the 10 CaveExits, the default elsewhere;
`migrate-exits.mjs` now applies the same rule. The stale `CaveMouth = 98` fbs comment is fixed.

**For the PO:** the barn door (`barn-inside`) draws a CAVE MOUTH beside the barn, per D11a. It
probably wants `look: door`; one property in Tiled.

**Checks.** Go: `world` look/rotation + Passage-refusal tests; `cmd/aurad`, `mobs`, `sys`,
`codec` green; `aurad -validate` 0 findings (disk, `-debug-zones`). Vitest: the look table vs
the palette enum, placements, the converter's look/rotation round trip and refusal, the look set
scraped from `exits.go`, the completeness pin (`rotation` + `look` authored). `verify.sh` all
green incl. a new turned-exit leg. In game: `passages.mjs` (renamed from `p1-exits.mjs`) 8/8:
both doors bare (no visible Graphics, no plate text, with a control mob that has some), the
cave-mouth and stairs-up looks drawn, a hidden exit drawing nothing, and the P1 legs.

**Schema:** DB none · conf none · **wire +1 EntityType (`Passage = 122`)** · zone format `exits[]`
+`rotation` +`look` · content: `CaveMouth`/`CaveExit` `entityType`.

### P3 — words ✅ BUILT 2026-10-18 (uncommitted on `passages`)

**What landed.** `exits[].id` (D7): optional slug, FIRST key, refused unless `^[a-z0-9-]+$`, unique
across the placed set (`checkSetWide`, beside the anchor rule); Tiled `id` member on `AuraExit`
(first, free text, '' = none), the converter refuses a non-slug and a repeat in one file. Keys in
`regions.arb` (Q5 as proposed): `exit.<id>.title/.text/.go`, `anchor.<name>.text`
(`lang.ExitTitle/ExitText/ExitGo/AnchorText`). **Text and row on the server** (D6):
`world.ApplyExitWords` runs in `loadContent` after the lang stage and gives EVERY exit its own
shallow copy of its door's definition (the registry's is never touched; same `ID`/`Name`) whose
travel node carries the chosen line key and whose travel row carries the chosen row key; the keys
travel as `line_ids` / `text_id`, so German comes from `/lang` as for any line. The copy also
carries `Interaction.ExitID` (the id, else `@<anchor>`), stamped onto the panel as **`Conversation.exit_id`**
(appended). **Header on the client:** `exits/logic/ExitHeader.ts` (pure): `exit.<id>.title`, else the
place at the anchor via `RegionNames.placeInZone`, which is `Game.arrivalPlace`'s lookup moved out so
both share it (L8: off the bundle), else the catalog name. `langEntries` emits an entry for every
authored key of a placed exit/anchor (so `/lang` serves them and `TestLangEnglishBelongsToContent…`
refuses an orphan). `tools/lang` `arbOf` learned `exit.`/`anchor.` (sheet.mjs is generic). First
content: `anchor.barn-inside.text` ("A low door into the barn's cellar.") and the barn's way up
`id: barn-cellar-stairs` with `.text` + `.go` ("Climb the stairs."), en + de.

**Decisions made in the chunk (flag for the PO):**
- ⭐ **Which doors take the destination's line (tier 2).** D6 says a custom door's lines win over
  tier 2, but `CaveExit` is a shipped generic door too. Built: `world.StockDoors` =
  `CaveMouth` + `CaveExit` take tier 2; any other door keeps its lines. A per-exit key (tier 1)
  beats every door.
- **The words replace the TRAVEL node's lines and row** (on a stock door that is its only node), so
  a custom door with gates keeps every other node as authored.
- **No reply column.** D6 has none, so the line spoken after the row stays the definition's: the
  barn door still answers "You climb down into the dark." Say if exits want `exit.<id>.reply`.
- **The header always comes from the exit**, even on a custom door (D6's header column has no
  definition tier); the catalog name is only the fallback for a door whose destination the bundle
  does not know.
- P1's harness leg "the two doors talk as different definitions" compared HEADERS, which are now
  the destination's; it is dropped (the Go door-resolution tests still cover `door`).

**Checks.** Go: `world` id slug / set-wide duplicate / tiers (each column, stock vs custom door,
per-column fallthrough) / the definition untouched / the key stamped; `sys` the panel carries
`ExitID`; `codec` `exit_id` round-trip; `cmd/aurad` over the real content: every door carries its
key and every authored `anchor.*.text` reaches a door; TestLang green after `UPDATE_LANG=1`. Full
`go test ./...` green bar the two known reds. `aurad -validate` 0 findings (disk, embedded,
`-debug-zones`). Vitest 1797/0 incl. `ExitHeader.test.ts` (each tier, origin applied, the zone-name
fallback, misses) and the converter's id round trip/refusals + palette member; `tsc` clean;
`tools/lang` tests 21/0 (the sheet-vs-`-lang-status` test needs a REBUILT `aurad.exe`). `verify.sh`
all green through real Tiled (the barn's id rides the exits round trip). In game `passages.mjs`
12/12: the world's barn door reads "Barn" + the anchor line, the barn's way up reads the place at
its anchor ("Reinhard's Farm") + its exit's own line and row, every expectation derived from the
zone files and `regions.arb`.

**Schema:** DB none · conf none · **wire +1 appended `Conversation.exit_id:string`** · zone format
`exits[]` +`id` · content: `barn.json` exit id; `regions.arb` +3 keys (en + de).
