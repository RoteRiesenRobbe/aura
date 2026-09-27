# Plan: Quest-Giver Markers on the Map

> **Status: DESIGNED 2026-09-28, NOT RULED, nothing built.** Asked by the PO on
> 2026-09-28: "can we add NPCs to the UI maps? At least quest givers who have a new
> quest and ones where you can return a finished quest." Planned separately from the
> map-props bake that was built the same day. Every decision in §2 is open, and D1 is
> a GDD ruling that blocks everything else.
>
> ⛔ **THE BLOCKER: this reverses a standing PO ruling.** On 2026-07-29 (backlog §42)
> the PO allowed quests and the journal and in the same breath ruled **"no quest
> markers, ever"**. GDD §8 "Quests & the Journal" reads: *"Still no quest markers. No
> map arrows, no minimap pins, no in-world highlighting of goals."* A quest-giver pin
> marks WHO to talk to, not where the objective is (WoW Classic shows `!`/`?` over
> heads and still gives no map guidance), but a pin on the map is literally a
> "minimap pin". D1 must amend GDD §8 before C1 starts.

---

## 1. What exists (surveyed at `f91c059e`)

- **The judgement already lives on the server.** A conversation row with a quest grant
  is shown only when `QuestLedger().CanApply(grant)` says the ledger op would succeed
  (`backend/pkg/aura/sys/interaction.go`, `presentOptions`, the `IsQuestKind` branch).
  An Accept row vanishes once the quest runs, and a turn-in row appears exactly when it
  can be taken. Row visibility also depends on node conditions (`minLevel`,
  `quest_at_stage`, `kills_this_life`, `bloodline_ascensions`) via `conditionsPass`,
  and on `pruneEmptyDestinations`.
- **So a marker must reuse `present()`, not re-derive it.** "This NPC has a visible
  `offer_quest` row" = `!`. "This NPC has a visible `advance_quest` row" = `?`. Using
  the same function means a marker and the panel can never disagree (the N1 lesson,
  where `presentOptions` and `applyGrant` drifted).
- **The client cannot compute it.** Conditions and one quest having several finishers
  (`wolves-on-the-road`) are evaluated only on the server.
- **The owner-only block already has the right trigger.** `core/net.go`
  `ownerStateGate` resends the owner block when level, skill revision or quest
  `DisplayRevision` moves, plus a heartbeat. Markers change on exactly those events,
  so they can ride that block with no new gate.
- **Positions.** NPCs outside your view are not streamed, so the client does not know
  where they are. The server does (the zone's `spawns`), and so does the client's
  bundled zone file. Most conversants stand still; the Wanderer drifts about 4 units.
- **Content today.** 15 mob definitions carry quest grants. 6 of them are placed in
  `world.json` (Reinhard, Miller, Hermit, Shepherd, Eliza, TownCrier). TownCrier only
  offers, so its quest is turned in elsewhere: a `?` is not always on the giver.
- **The map side is ready.** `MapCampfires` is the model for a marker layer: its own
  container, drawn from a set plus zone data, zone-local coordinates, redrawn in
  `updateScaling`, above the terrain, and working in both map states.

## 2. Decisions (all OPEN)

- **D1. Amend GDD §8?** (blocker) Options: (a) allow quest-giver pins on both maps;
  (b) full-screen map only, keeping the docked radar marker-free; (c) no. The GDD line
  gets rewritten either way it goes.
- **D2. What `?` means.** (a) Only a final turn-in: an `advance_quest` row whose
  `ToStage` is terminal (`QuestDefinition.IsTerminal`). (b) Any quest step waiting at
  this NPC, including mid-quest dialogue ("report to X"). Recommendation: (b), since
  it is "something to do here" and is the row the panel shows anyway.
- **D3. Fog.** (a) Markers only in areas you have uncovered, like campfires only after
  discovery. (b) Everywhere. Recommendation: (a), since the map shows the world you
  know.
- **D4. Level-gated offers.** A node behind `minLevel` hides its offer row today, so
  there is no `!`. WoW shows a grey `!` for a quest a few levels up. (a) No marker
  (reuses present(), zero new rules). (b) A grey `!`, which needs a second
  "would pass except minLevel" evaluation. Recommendation: (a).
- **D5. In-world badges.** `!`/`?` over the NPC's head in the world uses the same
  data. (a) Same chunk. (b) Later. (c) Never.
- **D6. Marker look.** Glyph `!`/`?` versus a coloured dot, size per map state, colour
  (must separate from the campfire orange and the roster white). [PLACEHOLDER] until
  seen.
- **D7. Also mark NPCs without quests?** A plain "someone to talk to" dot for every
  conversant needs no server work at all (the zone file + the catalog's `conversant`
  flag). (a) No. (b) Yes, as C0.

## 3. Chunks (assuming D1 (a), D2 (b), D3 (a))

- **C0 (only if D7 (b)): all conversants, client only.** A `MapNpcs` layer drawn from
  the bundled zone's `spawns` whose mob is a conversant. Schema NONE.
- **C1: the server computes and publishes markers.**
  - `sys`: `QuestMarkers(p learner, conversants) []Marker` runs `present()` for each
    conversant placed in the player's zone and classifies its rows: offer → `!`,
    advance → `?` (`!` wins if both). It is pure over the ledger, so it gets a table
    test per condition kind.
  - Computed only when `ownerStateGate` says the owner block is due, never per tick.
  - Wire: `GameState` gains `quest_markers:[QuestMarker]` with
    `QuestMarker { x:float, y:float, kind:ubyte }` (zone-local placement position). It
    rides the owner block with an explicit presence bit. ⚑ An empty list is a real
    state (the last quest was accepted), so absent must never read as empty (the
    change-only lesson).
  - Schema: DB NONE (derived from the ledger), wire +1 table +1 field, content NONE.
  - Tests: Go unit tests (offer visible / accepted / turn-in ready / multi-finisher /
    minLevel-gated / another zone); codec round-trip.
- **C2: the client draws them.** `MapQuestMarkers.ts` modelled on `MapCampfires`:
  - its own layer above the roster and below the campfires (the draw order is a PO
    ruling; D6 may move it);
  - D3's fog gate through `isDiscoveredAt`;
  - both map states, sized per state;
  - D5 (a) would add the overhead badge here.
  - Harness `quest-markers.mjs`: `!` on the Farmer at start, gone after accepting,
    `?` once the report stage is reached, gone after turn-in, never in fog.

## 4. Landmines

1. **Never re-derive the visibility rule.** Anything other than `present()` will drift
   from the panel. N1 is the precedent.
2. **`present()` cost.** It builds rows for every visible node. Called per conversant
   (about 15) only on an owner-block change, that is negligible. Called per tick it
   would not be. Keep it behind the gate.
3. **Generated row sources** (`ascension_catalog`, `memorial_names`) are never quest
   rows. Skip nodes with `Rows != ""`, which also keeps `memorial_names` (whose rows are
   served from a DB snapshot) off this path.
4. **Zone crossing.** Markers are per zone. The client must drop the old zone's markers
   on `switchZone`, which is the leak the map-props bake just fixed for props.
5. **A wandering conversant** is marked at its spawn point, not its live position.
   Fine at map scale. Say so in the harness rather than asserting a live position.
6. **`Welcome` cannot carry per-character data** (`plan-world-map.md`), so the markers
   cannot ride the connect message.

## 5. Verification

Go: `go test ./pkg/aura/sys/... ./pkg/aura/codec/...`. Frontend: vitest for the marker
layout (a pure `questMarkerLayout` beside `campfireMarkers`) and typecheck. Browser:
`quest-markers.mjs` (C2), then re-run `c1-kill-quests` and `chunkC4-quests`, which own
the rows these markers mirror. In-game (PO): walk the Farmer's quest start to finish
and watch the marker follow the panel.
