# Plan: Quest Levels + Quest-Giver Markers (`!` / `?`)

> **Status: SHIPPED 2026-10-11 on `main`, C1 `d872e58a` · C2 `2b7b8803` · C3 `8e974200` · row fix `611b6b62`; PO look passed (§6). ARCHIVED.** One open item left the plan: the hail line overlapping the `!` (`docs/feedback.md` 2026-10-11). First asked by the PO on
> 2026-09-28 (map pins for quest givers, coworker draft); widened on 2026-10-10: "We want
> quests to have a target player level and quest giver npcs to show exclamation marks
> above their head and on the map when they have a quest to give and question marks when
> you can finish a quest with them. We want this to work similar to World of Warcraft.
> The quest level affects the color of the quest text in some places and the color of
> the exclamation mark."
>
> ⭐ **That request rules the old D1: quest-giver markers are allowed**, reversing the
> 2026-07-29 "no quest markers, ever" (backlog §42) for GIVERS ONLY. Objectives stay
> unmarked: no arrows or pins to where the boars are, as in WoW Classic. ⛔ `gdd.md:639`
> ("Still no quest markers ... no minimap pins, no in-world highlighting") and the
> backlog §42 banner (`backlog.md:4586`) still read the old way and must be amended
> before C1 starts.
>
> Chunks: C1 → C2 → C3, **committed straight on `main`** (PO 2026-10-11), NOT on
> `localization`. ⚑ The survey's line refs were taken on `localization` at
> `300e4c5e` and drift on `main`: re-verify each before editing. ⚑ When `localization` merges into `main`, it resolves the overlap: `ConversationOption` in `server.fbs`
> (localization appends six fields, C2 appends `quest_level`; put one after the other
> and regenerate), the catalog entry (`quests/catalog.go` + its whitelist test), the
> `presentOptions` quest branch, and the client's decode/title paths. This feature adds
> no player-facing text, so the localization D23 rule has nothing to translate.

---

## 1. What exists

- **The visibility judgement already lives on the server.** A conversation row with a
  quest grant shows only when `QuestLedger().CanApply(grant)` passes
  (`backend/pkg/aura/sys/interaction.go`, `presentOptions` :1022-1155, the
  `IsQuestKind` branch :1074-1087). `CanApply` (`quests/ledger.go:521-535`):
  `offer_quest` → `canAccept` (:430, not running, not completed unless repeatable);
  `advance_quest` → `canAdvanceDialogue` (:483, running, current stage = `FromStage`,
  a dialogue stage).
- **`present()` (`interaction.go:932-981`) is pure** and cheap to run for an NPC the
  player is not talking to: it takes the definition's `*mobs.Interaction`
  (`items/mobs/definitions.go:288`), a learner, a row source and a travel seam; `nil`
  for both is safe (row-source nodes never carry quest rows, travel rows render
  locked). ⚑ It serialises every visible node, but the panel only reaches nodes via
  `Next` from `EntryNode`, so a marker must walk reachability, not scan all rows.
- **`model.ConversationOption` carries no grant kind.** Classify a row by
  `node.Options[row.OptionIndex].Grants[0].Kind`. A trailing `offer_quest` (Eliza's
  dinner turn-in hands over eliza-sends-me) is a reward, not the lead grant.
- **The owner block has the right trigger.** `ownerStateGate` (`core/net.go:60-110`)
  resends on level, skill revision, quest `DisplayRevision`, buff revision, first sight,
  and a 5 s heartbeat. It does not watch zone changes. `InteractionSystem` is only a
  local in `core/game.go:205-219`.
- **No quest has a level.** The implied target level sits in the L9 half-level XP pins
  (`quests/content_test.go:347-398`) and the quest `_comment`s. `jsonQuest`
  (`quests/quests.go:353-362`) decodes with `DisallowUnknownFields`;
  `TestCatalog_ProjectionLeaksNothing` (`quests/catalog_test.go:40-58`) pins the
  `/quests` payload to `{id,title,stages}`.
- **A level colour already exists.** `difficultyColor` (`frontend/src/client-data/Mobs.ts:173-187`):
  grey first when `Δ ≤ −GrayDistance(player)` (mirrors `curve.KillXP.GrayDistance`,
  `curve/killxp.go:171-180`, knobs via `Welcome.gray_base/gray_step`), then
  red ≥ +5 `0xff5555`, orange ≥ +3 `0xff9a3c`, yellow ≥ −2 `0xf5d442`, else green
  `0x5fd35f`. Bands [PLACEHOLDER].
- **Content.** 22 quests. 16 mob definitions carry quest grants; 10 are placed in
  `world.json` (Reinhard, Miller, Shepherd, Eliza, TownCrier, CityGuard, Wanderer,
  Hermit, FrontCaptain, GrandfatherKnot). Emberkeeper, LamplessTraveller, Lamplighter,
  Miner, Shaman, VillageHealer are unplaced. No quest node uses `minLevel`.
- **Client.** Quest titles come only from the `/quests` catalog
  (`client-data/Quests.ts:67`). Mob catalog entries carry `id` (= the wire `mob_id`) and
  `name`. Nameplates live on `layers.namePlates` (above trees and darkness,
  night-exempt; `game-objects/logic/Mobs.ts:140-173`, per-frame `updatePlate`
  :291-323). The map has no per-point fog query (`MapFog` is a mask; the merged reveal
  is `MiniMap.storedFog`, helpers in `FogReveal.ts`). `MapCampfires.isDiscoveredAt` is
  a campfire test, not a fog test.

## 2. Decisions

### Ruled by the PO, 2026-10-10

- **D1. Givers are marked**, over the head and on both maps. Objectives are not.
- **D2. `!` = a takeable offer, yellow `?` = a takeable turn-in, grey `?` = the
  finisher of a quest that is running but not ready** (WoW). **No grey "available soon"
  `!`** for level-gated offers.
- **D3. Map fog:** markers only on fog-revealed ground, docked radar and full-screen
  map alike. Over-head marks always show when the NPC is on screen.
- **D4. Level colour applies to:** the `!`, journal titles (list + detail), tracker
  titles, dialogue offer rows. **No level number shown** anywhere.
- **D5. Trivial quests keep a `!`, in grey.**
- **D6. Every quest authors a target `level`.**

### Taken in planning, PO may overturn

- **D7. Yellow `?` = any visible `advance_quest` row**, including mid-quest "report to
  X" steps (GrandfatherKnot), since it is exactly the row the panel offers.
- **D8. Priority on one NPC:** yellow `?` > `!` > grey `?`. With several offers the `!`
  takes the lowest-level non-trivial offer's level; all trivial → grey.
- **D9. One colour rule:** quests reuse `difficultyColor`, passed the quest level. The
  grey cut-off is therefore the kill-XP `GrayDistance`, like WoW's trivial cut-off.
- **D10. Markers keyed by mob definition, not by placement.** The server sends one
  marker per conversant definition with something to show; the client attaches it to
  every entity with that `mob_id` and every bundled-zone spawn of that mob. No positions
  on the wire and nothing per zone, so a zone crossing needs no new gate. A wanderer is
  drawn at its spawn on the map.
- **D11. Grey `?` rule:** quest Q is running, its current stage's `Next` is the
  `FromStage` of an `advance_quest` grant this NPC authors. Static over the definition
  plus the ledger; never shown alongside the same quest's yellow `?`.
- **D12. Look** (glyph, size, stroke, stacking with the E badge, map draw order):
  [PLACEHOLDER] until the PO sees it.

## 3. Chunks

### C1: quests author a level (backend + content)

- `quests/quests.go`: `Level int` on `QuestDefinition` (:105) and `jsonQuest` (:353);
  `validateQuest` (:194) hard-fails `level < 1`.
- `/quests` catalog gains `level` (`quests/catalog.go` `CatalogEntry` + its D14
  comment); update `TestCatalog_ProjectionLeaksNothing`; client type
  `client-data/Quests.ts:21`.
- Seed all 22 `api/quests/*.json` from the XP pins, all [PLACEHOLDER]:

  | Level | Quests |
  | --- | --- |
  | 1 | village-welcome, turnip-chore, dinner-for-the-family, eliza-sends-me |
  | 2 | boars-in-the-field, giant-rats-in-the-barn, the-strays |
  | 3 | wolves-on-the-road, the-millers-ring |
  | 5 | the-lost-friend |
  | 6 | dire-wolves-in-the-forest, the-sounder-at-the-mill |
  | 7 | kobolds-on-the-road |
  | 9 | the-lost-lamp (700 XP ≈ L9) |
  | 11 | spiders-in-the-diggings, dire-wolves-at-the-camp |
  | 12 | bandits-at-the-shrine |
  | 14 | clear-the-grove, the-sleeping-roots |
  | 15 | alpha-wolves-at-the-village |
  | 16 | bears-at-the-walls |
  | 20 | thin-the-orc-line |

- A content test checks each `level` against the level its turn-in XP implies,
  computed from the rule, never a hardcoded table.
- Content editor: a Level input beside Title (`tools/content-editor/public/app.js:1218`),
  the check in the `validate.mjs` port (:124-207). The `add-content` skill and
  `manual-content-authoring.md` gain "every quest authors `level`".
- Lang: none (numeric). Rerun `TestLang` to confirm `api/lang/en/` is unchanged.
- cp-defs by hand (no make on the Windows box).
- **Schema: DB NONE · wire NONE · HTTP catalog +`level` · content +`level`.**

### C2: the server computes markers (backend + wire)

- New `sys/questmarkers.go`: `QuestMarkers(p learner, defs) []Marker`. For each
  conversant definition, run `present()`, walk rows reachable from `EntryNode`, skip
  row-source nodes (`node.Rows != ""`), classify by the lead grant: `advance_quest` →
  yellow `?`; `offer_quest` → `!` with that quest's level. Add D11's grey `?`, then
  apply D8 (the server knows `GrayDistance`).
- Computed only when `ownerStateGate` says the owner block is due, never per tick.
  Keep a reference to the `InteractionSystem` on `game`, or make the function free of it.
- Wire (`api/schema/server.fbs`, appended only):
  - `table QuestMarker { mob_id:ushort; kind:ubyte; level:ubyte; }`, kind 1 `!`,
    2 `?`, 3 grey `?`.
  - `GameState.quest_markers:[QuestMarker]` after `own_effects`, on the owner block.
    On an `owner_state` tick absent means empty: an empty list is a real state (the
    last offer was just accepted).
  - `ConversationOption.quest_level:ubyte` (0 = not an offer row), set in the
    `presentOptions` quest branch via `model.ConversationOption.QuestLevel`.
- Codec `codec/gamestate.go:545-703`; regen bindings; clear the webpack cache after.
- Tests first: offer visible → `!` · accepted → grey `?` · report stage → yellow `?` ·
  turned in → none · two offers → lowest non-trivial level · all trivial → grey ·
  wolves-on-the-road's branch finishers · a GrandfatherKnot mid-quest advance · `?`
  beats `!` · Eliza's reward `offer_quest` is not a `!` · codec round-trip incl. empty.
- **Schema: DB NONE · wire +1 table, +1 GameState field, +1 ConversationOption field ·
  content NONE.**

### C3: the client draws them

- Snapshot path: decode inside the owner gate (`GameStateMessage.ts:169-215`) →
  `SnapshotFactory.ts` (keep `undefined` = unchanged) → `Backend.receiveSnapshot`;
  a spectator clears them. `client-data/QuestMarkers.ts` holds the `mob_id → marker`
  map and a pure `questMarkerColor(marker)` (kind 2 yellow, kind 3 `DIFFICULTY_GRAY`,
  kind 1 `difficultyColor(level)`).
- **Over-head:** a `!`/`?` glyph on the mob's `plate` container (`namePlates` layer, so
  trees and darkness never cover it), positioned at the sprite top like `InteractBadge`
  (`InteractBadge.ts:122-125`), stacked above the E badge when that shows. Visibility
  and alpha through `updatePlate`; re-tint only on change.
- **Maps:** `MapQuestMarkers.ts` modelled on `MapCampfires.ts`; positions from the
  bundled zone `spawns` (declare `spawns` on `ZoneJSON`, `GroundTextureManager.ts:225`);
  pure `questMarkers(...)` beside `campfireMarkers` in `MapScale.ts:345` (zone-local);
  a new pure `isRevealedAt(storedFog, x, y)` over `FogReveal.ts` `zoneCellMask`;
  inserted by index just under the campfire layer (`MiniMap.ts:259-296`), drawn in
  `updateScaling`, moved in `positionLayers`.
- **Text colour:** journal list + detail title (`JournalModel.ts:154-185`) and tracker
  title (`QuestTracker.ts:69-72`, today fixed `@gold-levelup`, `HUD.less:2469`) take
  `cssHex(difficultyColor(level))` from the catalog; offer rows
  (`Conversation.ts:279-319`) tint by `quest_level` when non-zero. All recolour on
  level-up.
- No new ARB strings.
- Harness `quest-markers.mjs`: a coloured `!` over Reinhard at start, on the map once
  revealed and never in fog; grey `?` after accepting; yellow `?` at the report stage;
  nothing after turn-in; coloured journal and tracker titles; a level-up recolours.
- **Schema: DB NONE · wire NONE (consumes C2).**

## 4. Landmines

1. **Never re-derive the visibility rule.** `!` and yellow `?` come only from
   `present()`; anything else drifts from the panel (the N1 precedent).
2. **`present()` per conversant only behind the owner gate** (~16 definitions), never
   per tick.
3. **Row-source nodes** (`ascension_catalog`, `memorial_names`) are skipped; they never
   carry quest rows and `memorial_names` reads a DB snapshot.
4. **`Welcome` cannot carry per-character data**; markers ride the owner block.
5. **Unplaced quest NPCs** produce markers with no spawn: harmless, nothing drawn.
6. **A new quest field** reddens `DisallowUnknownFields` and the catalog whitelist
   test first; both are the intended gates.
7. **A content edit does not invalidate the Go test cache**: `-count=1`, and rebuild
   after any `api/` edit.

## 5. Verification

- Go: `go build ./...`; `go test -count=1 ./pkg/aura/quests/... ./pkg/aura/sys/...
  ./pkg/aura/codec/... ./cmd/aurad/` (incl. `TestLang`); `aurad -validate`.
- Frontend: `npm test` (marker colour, map layout, fog query, journal/tracker rows),
  `npm run typecheck`.
- Browser: `quest-markers.mjs` (C3), then re-run `c1-kill-quests`, `chunkC4-quests`,
  `i18n-de.mjs`.
- In-game (PO): walk Reinhard's quests start to finish; judge the glyph, its size, the
  stacking with the E badge, and the map draw order.

## 6. Ledger

> **C1-C3 COMMITTED 2026-10-11 on `main`: C1 `d872e58a` · C2 `2b7b8803` · C3 `8e974200` · row fix `611b6b62`. PO look passed 2026-10-11.**
>
> - **C1** quests author `level` (loader hard-fails without it; `/quests` serves it; the
>   catalog whitelist test widened; editor field + `validate.mjs` port; all 22 quests
>   seeded per §3's table). GDD §8 and the backlog §42 banner amended. The planned
>   "derive the level from the XP pin" content test was DROPPED: the split and
>   pre-rule quests (wolves-on-the-road 400/leg, the grove pair, the lost lamp) do not
>   follow one formula, so it could only hardcode. **Schema: DB NONE · wire NONE · HTTP
>   +level · content +level.**
> - **C2** `sys.QuestMarkers` (+ `Ledger.Level`, `Ledger.AwaitedStage`), computed in
>   `NetSystem.playerSendState` only when the owner block is due; wire `QuestMarker`
>   table, `GameState.quest_markers` (owner block), `ConversationOption.quest_level`.
>   The trivial test mirrors the client's `Δ < 0 &&` guard. **Schema: DB NONE · wire +1
>   table, +2 fields (appended).**
> - **C3** `client-data/QuestMarkers.ts` (store, glyph, colour, `questTitleColor`);
>   the glyph on the mob plate (stacked above the E badge, until the row fix below); `MapQuestMarkers.ts` just
>   under the campfires, gated by the new `FogReveal.isRevealedAt`; journal, tracker
>   and offer-row tint. ⚑ Found by the harness: the tracker's render signature did not
>   include the tint, so a level-up left it stale; fixed. **Schema: NONE.**
>
> Verified: Go suite green bar the known `TestPropContent_C1bMigrationPreservesLookAndCollision`
> · vitest 1602/0 · typecheck clean · `aurad -validate` (main + debug) 0 findings ·
> `quest-markers.mjs` 14/14 (new) · `hygiene-wire-prune` 0 errors.
> NOT re-run: `chunkC4-quests`, `c1-kill-quests` (DEBUG-zone venues, not touched by
> this).
>
> - **PO look 2026-10-11** (D12): "nice"; glyph size, colours and map order stand.
>   Two findings above the head: (1) the E badge appearing pushed the `!` up by its
>   height. PO picked "E and ! share the same row centered", E to the right of the
>   mark: built `611b6b62` (the `!` alone is centred; with the E the pair is centred,
>   so the `!` shifts half a pair sideways, never up). `quest-markers.mjs` 14/14 after
>   it. (2) The NPC's hail line overlaps the `!`: the bubble sits at
>   `-1.2 × (size + 24)` off the WIRE radius (`_GameObject.ts` `ensureMessagesGroup`),
>   not the art, and knows nothing of the overhead row. Options offered (bubble above
>   the overhead row, measured from the art · hide the `!` while speaking · bubble to
>   the side), NOT ruled: moved to `docs/feedback.md` 2026-10-11.
