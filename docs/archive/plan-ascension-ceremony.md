# Plan: Ascension ceremony: one ascension, several picks in order, a summary at the end

**Status: COMPLETE, archived 2026-11-21. APPROVED 2026-11-17 (PO in chat: D1-D14 as
laid out; Q1, Q3, Q4, Q6 ruled as proposed). Designed 2026-10-22.** All three chunks built
and PO-passed (§11): AC1 2026-11-18 `a8a240a5`, AC2 2026-11-20 `d3b3ab94`, AC3 2026-11-21.
Q5 (the per-pick home form, D14) is deferred to the first faction stone's content and
parked in `roadmap.md` "Parked threads and watch items"; it is a design call, not unbuilt work.

**Owns:** the ascension stone as an ordered walk of steps, the draft of picks, the
summary and its single confirm, the step-kind seam that later kinds plug into, and
where the heir wakes (the heir home, D13-D14).
**Builds on:** `archive/plan-ascension.md` (the channel, D14 empty pick, D21 countdown),
`archive/plan-ascension-sites.md` (each stone owns its price and its rewards),
`plan-appearance.md` D7 (scopes), D16 (never revoke), D21a (count grants in
`AscendCharacter`, built at C5), C4 (`LookPicker`).
**Amends:** `plan-appearance.md` D21(b): an appearance pick is now IN ADDITION to the
skill gift, one slot per step, and nothing is preselected for the heir (R2, R6, R7).
**Replaces:** `plan-appearance.md` C5b's pick half (AC2 delivers it); D21(c), the stone
bonus, stays in `plan-appearance.md` and is not in scope here. **Takes over:**
`plan-world-effects.md` §3.4 (the D20 walk); its heir-buff and world-effect picks become
two more step kinds on this seam once that plan is approved.
**Schema (as designed):** DB **none** · wire `ConversationNode` +1, `ConversationOption`
+1 · conf none · content: stone interaction +1 key (`ceremony`), +1 row source
(`ascension_looks`) with +2 node keys, stone +1 optional key (`heirHome`, AC3) · lang +a
few stock lines en + de.

⚑ Line references pinned 2026-10-22 at `44a07d63` (main) plus the uncommitted appearance
C5; re-verify before relying on them.

---

## 1. What this is

The PO, 2026-10-22 (translated): an ascension should reward several things and
effects, each selected in the conversation tree or in a different menu. A choice that
needs a visual presentation can use another display, an avatar or ring picker, instead
of the conversation. The choices happen in order, and at the end all of them are listed.

Today a stone has ONE pick: the gift node's row (`rows: "ascension_catalog"`) stashes
`PendingAscension{Key, Gate}` and starts the 10 s channel in the same click
(`sys/ascension_rows.go` `stash`, ~line 270). There is nowhere to make a second choice.

### 1.1 What already exists and is reused

- **Row sources** (`items/mobs/interaction.go` `RowSourceKind`, ~line 100): a node
  declares a generated list; a provider presents it per player and applies a click by
  index. Each step is one such node; a new step kind is a new row source.
- **The gift list:** `ascensionRows` (present, apply, `ValidatePick`, spent, locks) is
  the gift step almost unchanged; only `stash` stops starting the channel.
- **The countdown modal:** `ConversationOption.confirm_seconds` (wire, general on
  purpose). It moves from the gift row to the summary's Confirm row.
- **The channel and its re-judge:** `UtilityAscend`, `applyAscension`, `siteGateHolds`.
- **The grant transaction:** `persist.AscensionRequest` already carries `UnlockKey` and
  `Appearance []AppearanceGrant` (C5, D21a), written in `AscendCharacter`'s one
  transaction. Look picks append to `Appearance`: **no new persistence path.**
- **The picker:** `LookPicker.ts` (C4) renders portraits and rings with a preview; the
  stone mounts it in a third mode.
- **Owned set:** `appearance_owned` on the player (C5) answers "already owned, not offered".

## 2. PO rulings (2026-10-22)

- **R1. Own plan doc, now** (before C5b), taking over world-effects §3.4.
- **R2. Appearance picks come IN ADDITION to the skill gift**, not instead of it.
- **R3. Each stone authors its steps and their order.** One stone can offer gift + look,
  another more; a step with nothing to offer is skipped.
- **R4. Back button per step only.** The summary has Confirm and Back; no "edit this
  line" jump, no start-over.
- **R5. A visual step opens the Appearance picker** in a stone mode, showing only that
  step's items; the conversation resumes with the next step.
- **R6. The look step is always skippable** ("No new look"). The gift step keeps
  today's rule (D14: the empty gift only while nothing is pickable).
- **R7. One slot per step; a stone may author several look steps** (two portraits, two
  rings, any mix). **The seam must stay open** for new step kinds later, the PO's
  example being a visual-effect change picked in a step.
- **R8. A look picked at the stone is only unlocked.** Nothing is preselected for the
  heir; creation keeps `plan-appearance.md` D12 (the predecessor's look).
- **R9. The stone decides where the heir wakes** (PO 2026-10-22): a stone
  can name a bind point, and the heir of a life ascended there spawns at it, the PO's
  example being a faction stone whose heirs wake in that faction's hub. The LAST
  ascension in the slot counts. **The design must also allow one stone to send heirs
  to different places depending on the pick** (option 1 → place A, option 2 → place B),
  even though that is not in v1 (D14).
- **Scope of the first build:** the walk, the gift step, the look step, the summary.
  Heir buffs and world effects arrive with their own plan; the stone bonus stays in
  `plan-appearance.md` D21(c).

## 3. Design

### D1 - The one rule [RULED 2026-11-17]

A stone authors an ordered list of steps. Each step offers one list and shows it in the
display that fits it. A pick is only remembered. The summary lists every pick, and its
one Confirm is the only thing that starts the channel. Leaving throws the draft away.

### D2 - The stone authors `ceremony`, an ordered list of node ids [RULED 2026-11-17]

```json
"interaction": {
  "ceremony": ["catalog", "portrait-a", "ring-a"],
  "nodes": [ ... "catalog" (rows: ascension_catalog), "portrait-a" (rows: ascension_looks) ... ]
}
```

- Each id names an ordinary node with a step row source (its lines and conditions
  stay authored there, as today). **The list is the single source of order**: Next and
  Back are derived from it, never authored on the nodes (a source node authors no
  options, the index-space rule at `interaction.go` ~line 72).
- The loader appends one generated **summary node** (`ceremony-summary`) after the
  last step. The entry option that today says `next: "catalog"` points at the first
  step.
- Loader refusals: an id that is not a node, a node twice, a node whose row source is
  not a step kind, a step node outside `ceremony`, `ceremony` on a non-stone.

### D3 - The step-kind seam (R7) [RULED 2026-11-17]

One Go interface; a kind is one implementation plus one row source entry:

```
type ceremonyStep interface {
    Present(node, p) []ConversationOption   // rows, per player, index = the node's list
    Apply(node, p, option) (StepPick, bool) // validate a click, return the pick as DATA
    Validate(pick, p) bool                  // re-judged when the channel completes
    Grant(pick, req *persist.AscensionRequest) // adds its writes to the one transaction
}
```

Two kinds ship: `ascension_catalog` (the gift, today's `ascensionRows`) and
`ascension_looks` (AC2). A later kind (heir buff, world effect, a visual effect) is one
more implementation, one more `RowSourceKind`, its own client display and its own grant
writer. Nothing here is generic beyond that: no plug-in registry, no authored kind list.

### D4 - The draft [RULED 2026-11-17]

`SkillComponent.PendingAscension` becomes the draft: `{Gate, Picks []StepPick}` where a
`StepPick` is `{Step: nodeID, Kind, Key}` (ids only, never a closure over the player:
the reattach landmine from world-effects §3.4). Applying a step replaces that step's
entry, so Back and re-pick simply overwrite. A skipped step is an entry with `Key: ""`.

- **Discarded** when the conversation ends (walk away, close, another conversant),
  on death, on disconnect, and by `CancelCast` once channelling. Never persisted.
- The channel starts only from the summary's Confirm (D6); the gift click no longer
  starts it.

### D5 - Navigation [RULED 2026-11-17]

- Every step node gets a generated **Back** row (navigates to the previous step;
  grants nothing) except the first, whose Back returns to the node that opened the
  ceremony. Next is the click itself: a pick or a skip moves to the following step
  (or the summary).
- Steps whose list offers nothing to this player (all owned, all spent, empty) are
  **skipped in both directions**, and leave no summary line. The gift step is never
  skipped while D14's empty-gift row applies: that row is its pick.
- A gated step node (`conditions` failing) counts as offering nothing.

### D6 - The summary [RULED 2026-11-17]

Generated rows, all inert except the last two: one line per step that was shown, in
order, naming the pick ("Gift: Frostbite", "Portrait: Villager", "Ring: none"), then
**Back** and **Confirm**. Confirm carries `confirm_seconds` (5 [PLACEHOLDER], today's
value) and the modal names everything about to happen, plus that this character ends.
Confirming re-validates the whole draft (every step's `Validate` plus the site price),
then stashes it and starts the channel. Lines carry ids (skill id, appearance flat
index), so the client words them in its own language.

### D7 - The look step: `ascension_looks` [RULED 2026-11-17]

```json
{ "id": "portrait-a", "rows": "ascension_looks", "slot": "portrait",
  "looks": ["villager-elder", "hunter"], "lines": [ ... ] }
```

- ⚑ **Built by appearance C5b (2026-10-23), reuse it:** the stone-gift marker
  `"grantedBy": "stone"` (bloodline/account scope, no conditions; the loader refuses the
  rest), `Item.StoneGift()` (the evaluator never grants one by itself), the locked
  reason `LockStoneGift` = 7 ("Locked: a gift of an ascension stone"), and
  `appearance.CrossValidateStones` (today it reads a catalog node's `bonusLooks`; a
  `looks` list should join it).
- `slot` is `portrait` or `ring`; every id in `looks` must be that slot (R7), exist in
  the appearance catalog, and be **`bloodline` or `account` scope** (a character item
  would land on the life that is ending, `plan-appearance.md` D21's proposed refusal,
  now built here). A starter is refused (everyone owns it).
- Present: the items this player does not yet own, in authored order; index = position
  in `looks` (never the filtered list, the gift step's rule). A gated item (its own
  `conditions`) renders locked with its reasons, like a gated gift. Plus the fixed
  **"No new look"** row (R6).
- Grant: appends `{id, scope}` to `AscensionRequest.Appearance`, beside the D21a count
  grants. `ON CONFLICT DO NOTHING` already makes a double grant harmless.
- **Owning an item a stone offers is the "spent" state**: owned items leave the list.
- Nothing is worn or preselected (R8).

### D8 - The stone mode of the picker [RULED 2026-11-17]

The wire tells the client which display a node wants: `ConversationNode` +1
`rows:string` (the row source name, empty for authored nodes) and
`ConversationOption` +1 `appearance:ushort` (the item's flat index + 1, 0 = none). On
an `ascension_looks` node the client opens `LookPicker` in stone mode instead of rows:
one slot's tab, the step's items (locked ones greyed with reasons), the preview, **Pick**,
**No new look**, **Back**. Pick sends the row's option index through the same select
message any row uses; the server's next step arrives as usual. The picker closes when
the conversation leaves the node, so the conversation panel stays the one owner.

### D9 - Grants and validation at completion [RULED 2026-11-17]

`applyAscension` re-runs `Validate` on every pick (an item became owned, a gift's gate
regressed), then builds one `AscensionRequest` (gift key + look grants + D21a count
grants). A pick that fails is a refusal of the whole ascension with the existing
"something changed" reply, never a partial grant. The transaction is unchanged.

### D10 - Words [RULED 2026-11-17]

Stock lines (en + de, `conversations.arb` `stock.*`): the summary header, "No new look",
Back, Confirm, the per-kind line labels ("Gift", "Portrait", "Ring"), the modal text.
Node lines stay authored per stone.

### D11 - Content [RULED 2026-11-17]

Both stones migrate to `ceremony`. AC2 adds two placeholder bloodline-scope look items
(one portrait from the spare PONETI busts, one ring family) and puts a portrait step
and a ring step on the main stone [PLACEHOLDER content, PO picks, Q2].

### D12 - The content editor [RULED 2026-11-17]

The editor's serializer is a whitelist (memory: mob levels / zone editor); `ceremony`,
`slot` and `looks` must be added in the same chunk that introduces them, or the next
editor save drops them silently (L1).

### D13 - The heir home: a stone authors `heirHome` [RULED 2026-11-17]

```json
"interaction": { "heirHome": "spawnpoint-12", "ceremony": [ ... ], "nodes": [ ... ] }
```

- **The rule:** the ascension writes the home into the ENDING life's
  `characters.home_campfire_id`, in `AscendCharacter`'s one transaction (the same
  `UPDATE` that sets `sacrificed_at`). Heir creation copies `home_campfire_id` from
  `previous_character_id`, which `CreateCharacter` already derives
  (`store/characters.go` `unclaimedPredecessor`, ~line 175). The heir is then an
  ordinary bound character: it arrives and respawns at that fire until it binds
  elsewhere.
- **"The last ascension counts" is free:** the predecessor IS the slot's latest
  sacrifice, so a bloodline that ascends at another stone moves to that stone's home.
- **A stone without `heirHome` writes NULL**, so the heir is unbound and lands on the
  `startingSpawn` default, which is today's behaviour. The ending life's own bind is
  never inherited (Q4).
- `persist.AscensionRequest` +1 `HeirHome string`, set from the stone when the channel
  completes (D9), so a draft never carries it and nothing new is persisted mid-walk.
- **Loader:** `heirHome` must name a bind point in the loaded zone set (a cross-check,
  like `rewards` against the catalog, P4); `heirHome` on a non-stone is refused. Any
  loaded zone may hold it: L4's primary-zone rule is about random first arrivals, and a
  bound home in a cave is legal today.
- **A home that later stops resolving** (the fire deleted in Tiled) is already treated
  as unbound (`world/zone.go` Campfire.ID note), so the heir falls back to the default.
- **Words:** the summary (D6) gains one inert line after the step lines, "Your heir
  wakes at: <place>", only when the ascension sets a home (Q4 for the wording and which
  name the place goes by).

### D14 - Per-pick homes: designed for, not built [RULED 2026-11-17]

The seam already carries it: D3's `Grant(pick, req)` writes into the same
`AscensionRequest`, so **any step kind may set `req.HeirHome`**. The precedence rule,
fixed now so a later kind does not invent its own:

> the LAST step in `ceremony` order whose pick names a home wins; else the stone's
> `heirHome`; else unbound.

Two authoring forms fit that rule; neither is chosen until content needs one (Q5):

- **(a) A home on a gift entry:** a `rewards` entry may become `{ "key": "...",
  "heirHome": "spawnpoint-N" }` beside today's bare string, so the reward itself decides
  (the faction gift sends you to the faction's hub).
- **(b) A home step:** a row source `ascension_homes` whose rows are bind points
  (`homes: ["spawnpoint-4", "spawnpoint-9"]`); the player picks where the heir wakes as
  its own step, shown in the summary like any other.

Either is one more `Grant` writer and no new persistence: D13's column and the heir copy
stay the only path. **Nothing of D14 ships in AC3** beyond `HeirHome` living on the
request (not on the stone lookup) so a step can set it.

## 4. What changes for the author

A stone file gains `ceremony: [...]` and one node per step. A look step is a node with
`rows: "ascension_looks"`, `slot`, `looks` and its lines. No Next or Back is authored.
A stone that sends heirs somewhere authors `heirHome` with a bind point's id (its Tiled
**Name**); the bind point itself is an ordinary one, placed in Tiled.

## 5. Chunks

Order: AC1 → AC2, and AC3 after AC1 (independent of AC2). Any of them can go before or
after appearance C5c.

### AC1 - The walk, the gift step, the summary (M-L)

Contents: `ceremony` loading + refusals (D2), the `ceremonyStep` seam with the gift as
its first kind (D3), the draft and its discard paths (D4), Back and skip (D5), the
generated summary with the moved countdown (D6), re-validation at completion (D9), the
stock words (D10), both stones migrated (D11), editor support for `ceremony` (D12).
With one step, the walk is gift → summary → Confirm.
Needs: nothing. **Schema:** DB none · wire none (`ConversationNode.rows` moved to AC2,
PO 2026-11-18) · content +1 stone key · lang + stock lines.
**In-game (PO):** at a stone pick a gift: no channel yet, the summary shows it; Back
returns to the gift list, re-pick changes the summary line; Confirm counts down then
channels; walk away during the walk and come back: the draft is gone; an exhausted
bloodline still sees "ascend with no gift" and the summary says so.

### AC2 - The look step and the stone picker (M)

Contents: `ascension_looks` (D7) with its refusals, the wire option field and the client
display hint (D8), `LookPicker` stone mode, grants into `AscensionRequest.Appearance`,
summary lines with the item's name, two placeholder items and two steps on the main
stone (D11), editor support for `slot` + `looks`, `plan-appearance.md` D21 + C5b
updated to point here.
Needs: AC1. **Schema:** DB none · wire `ConversationNode` +1 (`rows`, from AC1),
`ConversationOption` +1 · content +1 row source,
+2 node keys, +2 appearance items, +2 names en + de · lang + stock lines.
**In-game (PO):** gift, then the picker opens with only the stone's portraits; pick
one, the ring step opens; skip it; the summary lists gift + portrait + "Ring: none";
Back from the summary reopens the ring step; Confirm; the heir in that slot (and, for an
account item, any character) owns the portrait but is not wearing it; at the next
ascension the owned portrait is no longer offered, and a step with nothing left is
skipped.

### AC3 - The heir home (S)

Contents: `heirHome` on the stone with its loader cross-check (D13), `AscensionRequest`
+1 `HeirHome` set at completion, the `AscendCharacter` `UPDATE` writing it (NULL when
absent), `CreateCharacter` copying it from the predecessor, the summary line (D13
Words), editor support for `heirHome` (L1), and the per-pick precedence rule written
down in code where the request is built (D14), with no per-pick form yet.
Content: one stone gets a placeholder home [PLACEHOLDER, PO picks the fire, Q6].
Needs: AC1 (the summary and the request built in D9). **Schema:** DB none (the column
exists) · wire none · content +1 optional stone key · lang +1 stock line en + de.
**In-game (PO):** ascend at the stone with a home: the summary says where the heir
wakes; create the heir: it spawns at that fire, and dies back to it; bind elsewhere:
the new bind wins. Ascend that heir at a stone with no home: the next heir lands on
the default spawn. A fresh account still lands on the default.

## 6. Test strategy

- **Go red first:** the loader refusals (unknown id, duplicate, non-step node, stray
  step node, wrong-slot look, character-scope look, starter look); present/apply per
  kind with index stability after a spend; the draft (overwrite on re-pick, skip entry,
  discard on conversation end, death, disconnect, CancelCast); skip-in-both-directions;
  the summary rows' order and ids; Confirm with an invalid pick refuses the whole
  ascension and grants nothing; the request carries gift + looks + D21a grants; a look
  owned between pick and completion fails validation.
- **AC3 (Go, DB tests with `AURA_TEST_DB_URL`):** the ascension writes the stone's home
  onto the ending life and NULL for a stone without one; the heir inherits it at
  creation; a second ascension at another stone replaces it for the next heir; a
  first character in a fresh slot gets NULL; the save path cannot overwrite a
  sacrificed row's home (it filters `sacrificed_at IS NULL`, pin it); the loader
  refuses an unknown bind point and `heirHome` on a non-stone; the request's
  precedence (no step sets it today, so the stone's value wins) is pinned through the
  same function a later kind will feed.
- **The four doors** do not apply (the draft is never carried; pin that a reconnect
  arrives with no draft).
- **vitest:** the stone-mode picker lists exactly the step's rows, Pick sends the row's
  option index, locked items are inert; the client's row-source name mirror.
- **Codec:** the two new fields round-trip; old clients ignore them.
- **`verify` harness:** extend the ascension leg (gift → summary → confirm) in AC1, and
  `c1-medallions` with the stone picker leg in AC2 (built in `c2a-ascension-site`
  instead, which already walks the ceremony; §11 AC2).
- **PO in-game look** per chunk (§5).

## 7. Open PO calls

- **Q1. [RULED 2026-11-17 as proposed] Summary wording and the modal text.** Proposed: header "Your ascension", one
  line per step "<label>: <pick or none>", modal "These are granted and <name> ends.".
- **Q2. [RULED 2026-11-20: busts PONETI 28 + 37 and the forest ring, §11 AC2] AC2's placeholder content:** which bust and which ring family the main stone
  offers. Proposed: two spare PONETI busts and one existing ring family, all bloodline
  scope [PLACEHOLDER].
- **Q3. [RULED 2026-11-17 as proposed] Does the front stone (`front-ascension-stone`) get look steps too?** Proposed: no,
  gift only, until the PO authors more looks.
- **Q4. [RULED 2026-11-17 as proposed] The heir-home words, and the no-home case.** Proposed: the summary line "Your
  heir wakes at: <place>", the place named by its area (or a name authored on the bind
  point if areas do not fit); a stone without a home sets the heir unbound rather than
  passing on the ending life's own bind.
- **Q5. The per-pick form (D14), when content first needs it:** (a) a home on the gift
  entry, or (b) a home step. Proposed: decide with the first faction stone's content.
- **Q6. [RULED 2026-11-17 as proposed] AC3's placeholder:** which stone gets a home, and which fire. Proposed: the
  front stone sends its heirs to the fire nearest the front camp [PLACEHOLDER].

## 8. Landmines

- **L1. The editor serializer is a whitelist** (`tools/content-editor/`; it already
  reads `rewards`): new keys not added there are dropped on the next editor save.
- **L2. The index space.** A step's row index is its position in the AUTHORED list
  (`entriesFor`, `ascension_rows.go` ~line 44); present and apply must derive it from
  the same call, including the fixed skip/empty indices (254, `ascensionEmptyPickIndex`).
  Back must sit at its own fixed index too, never after the filtered list.
- **L3. The channel starts in `stash` today** (`ascension_rows.go` ~line 270). Moving it
  to the summary must not leave a second start path; a gift click that still channels
  would ascend with a half draft.
- **L4. A draft outliving its conversation** is the world-effects L6: walking away,
  dying, a closed panel, a reconnect and another conversant must all clear it.
- **L5. `ConversationNode` / `ConversationOption` are appended-only tables**; append the
  fields at the end, regenerate Go + TS bindings, restart the frontend (HMR does not
  watch `api/schema/js/`).
- **L6. Embedded content vs `-content ../api`**: rebuild after the stone edits; a
  content edit does not invalidate the Go test cache (`-count=1`).
- **L7. The look item's scope.** A character item granted in the sacrifice lands on the
  ending life; the loader refusal is the only guard.
- **L8. The home rides the ending life's row, after it ends.** The periodic save
  filters `sacrificed_at IS NULL` (`store/state.go` ~line 73), which is what stops a late
  flush from writing the old bind back over the heir home. If that filter ever moves,
  the heir silently wakes at the predecessor's own fire; AC3 pins it.
- **L9. Heir creation must copy in the INSERT itself** (`INSERT ... SELECT` from the
  predecessor, or the same transaction), never a second request: `previous_character_id`
  is derived inside `CreateCharacter`'s transaction, and a copy outside it can race the
  `constraintHeirTaken` check.

## 9. Schema impact

- **DB:** NONE. Gift writes `bloodline_unlocks` as today; looks write
  `appearance_unlocks` through the existing `AscensionRequest.Appearance`.
- **Wire:** `ConversationNode` +1 `rows:string`; `ConversationOption` +1
  `appearance:ushort`. No new message (picks use the existing row select).
- **Conf:** NONE.
- **DB (AC3):** still NONE. The heir home reuses `characters.home_campfire_id`; the
  ascension writes it on the ending row, creation copies it to the heir.
- **Content:** stone interaction +1 `ceremony`; +1 row source `ascension_looks` with
  `slot`, `looks`; +2 appearance items (AC2); stone +1 optional `heirHome` (AC3).
- **Lang:** stock lines en + de.

## 10. Cross-references

- `plan-appearance.md` D21 (amended by R2, R6-R8), C5b (its pick half moves to AC2;
  D21(c) bonus stays there).
- `plan-world-effects.md` §3.4 / D20: superseded by this walk; heir buff and world
  effect become step kinds when that plan is approved.
- `docs/manual-tiled-editor.md` "Bind points": a stone's `heirHome` names one; worth a
  line there when AC3 lands.

## 11. Chunk ledgers

### AC1 - the walk, the gift step, the summary: DONE 2026-11-18 `a8a240a5`, PO look deferred to after AC2

**Built:** `ceremony` loading with the D2 refusals plus two more (the summary's
id is reserved; its row source `ascension_summary` cannot be authored), the
generated `ceremony-summary` node right after the last step carrying the first
step's gate (`mobs.mapCeremony`); the step seam `ceremonyStep` with the gift as
its one kind (`sys/ascension_ceremony.go`, `ascension_rows.go`); Next stamped
per player on takeable step rows, skipping steps that offer nothing (pinned with
a fake second kind); the summary's inert "Gift: <name>" / "Gift: none" lines
and its Confirm (index 254, the 5 s countdown moved here); Confirm re-judges
every drafted pick against THIS stone's list and is the only start path (L3);
completion runs `CompleteAscension` (validate + grant per pick, one failure
refuses all, an empty stash fails closed). Both stones migrated (`"ceremony":
["catalog"]`). Editor: a Ceremony textarea on stones, `validate.mjs` mirrors the
refusals (`validate-ceremony.test.mjs`); a real editor save keeps `ceremony` and
every value (L1 checked by round trip; it only reflows whitespace). Words: the
summary header `stock.ascension-summary`, six UI keys, the gift replies no
longer promise a channel; en + de.

**Rulings (PO 2026-11-18, choice prompts):**
- **Back is the panel's own button, not D5's generated row** (PO, choice prompt).
  The panel already draws Back on every non-root node; a generated row would be
  a second Back and a forward step to the client. Edge: with only the no-gift
  row left, Back from the summary skips the one-row gift step to the greeting.
- **The draft lives on the player entity, not the SkillComponent** (D4's
  intent, a different home; PO accepted): `skills.CeremonyDraft`, cleared in
  `SetConversingWith` on any change of conversant; death and reconnect build a
  fresh entity, so they discard it by construction (the SkillComponent is
  re-installed on both, which would have carried it). The confirmed stash stays
  `PendingAscension{Picks, Gate, BonusLooks}`, written only by Confirm.
- **`ConversationNode.rows` (D8) moves to AC2** (PO): nothing reads it in AC1.
- **Words as built** (PO): the summary row reads "Ascend." (the modal button
  stays "Confirm"); generated-row words live in `frontend.arb`, only the header
  is a `stock.*` line.
- **The wire gate watches the draft** (`ownerStateWatch.draftRev`): a pick moved
  no other revision, so the summary showed the previous pick until the
  heartbeat. Found by the harness.
- `RequestAscension` keeps its signature; the grants come from the seam's
  request (`UnlockKey`). AC2 widens it for looks.

**Schema:** DB none · wire none (D8's field moved to AC2) · conf none · content
+1 stone key (`ceremony`) on both stones · lang +1 stock line, +6 UI keys, 2
replies reworded, en + de.

**Verified:** Go 0 FAIL (`./...`) · `db-test` ok · vitest 2007/0 · typecheck ·
editor `node --test` 14/0 · `c2a-ascension-site` 39/40 on the DEBUG world (new legs: no countdown on the
pick, the summary names it, Back, re-pick, Confirm's modal lists the pick) ·
`c2b-bloodline-select` 12/12 · `c3-memorial-catalog` 14/14 · `c1-front-stone`
13/16 with its 3 expected INCONCLUSIVE (the orc gate; its ceremony leg cannot be
reached). The three scripts that ascend gained the summary step ("Ascend.");
`c3-memorial-catalog` now polls for character select instead of a fixed 14 s
sleep (the server logged the ascension while the sleep still read the world).
⚑ The one red is SETTLED against HEAD `d6e6bbf9` (a worktree on port 2100,
HEAD's own script): the same C5b heir leg times out there too (32/34, the other
red a headless WebGL context loss), so it predates AC1. It reaches the creation
screen (a DOM dump on failure: visible, 12 look tiles, 2 selected) and then
times out waiting for a VISIBLE `.lookOption.selected`; owned by
`plan-appearance.md`.

**In-game (PO):** as §5 AC1, deferred by the PO 2026-11-18 to one look after AC2; passed with AC2 on 2026-11-20 (§11 AC2).

### AC2 - the look step and the stone picker: DONE 2026-11-20 `d3b3ab94`, PO look of AC1 + AC2 passed 2026-11-20 ("all works")

**Built:** the `ascension_looks` row source (D7): a step node authors `slot`
(portrait | ring) and `looks` (stone-gift ids); `mobs.mapLooks` refuses a bad or
missing slot, an empty list, duplicates, empty ids and either key on a non-look
node; `appearance.CrossValidateStones` refuses an id that is not a stone gift of
that slot. The kind (`sys/ascension_looks.go`) offers the step's unowned looks
at their stable list index, plus the skip row at 254 ("No new look."); a step
with nothing left presents no rows and the walk skips it. A pick only fills the
draft; the summary reads "Portrait: <name>" / "Ring: none"; completion re-judges
ownership and appends `AppearanceGrant{Item, Scope}` to the request. Wire (D8):
`ConversationNode.rows` names the row source, `ConversationOption.appearance`
carries the item's flat index + 1. Client: `LookStep.ts` draws the picker's
tiles in the panel for a look step (selection is local; a take row, locked until
a tile is selected, sends the pick); the tile CSS moved into a shared
`.look-picker-tiles()` mixin. `RequestAscension` takes the looks beside the gift.
Editor: the slot select and the looks textarea, `validate.mjs` mirrors the
refusals. Content: three bloodline-scope stone gifts (Crowned Heir = PONETI
Human_28, Elder Sage = Human_37, Heirloom Ring = the forest ring art) and the
`portrait` + `ring` steps on the main stone, gated `minLevel` 30 like the gift
(`"ceremony": ["catalog","portrait","ring"]`); `plan-appearance.md` D21(b) + C5b
point here.

**Rulings (PO 2026-11-20, choice prompts):**
- **Q2: two portraits and one ring**, busts PONETI 28 + 37, the forest ring
  family, all bloodline scope [PLACEHOLDER]. The PO: a new asset on this machine
  always comes from the PONETI pack (memory `feedback_always_use_icon_pack`).
- **The conversation panel grows to 60vh on desktop** (was 40vh; the phone's
  70vh unchanged) [PLACEHOLDER], so the look step and the summary fit without
  scrolling. It applies to every conversation (on the PO's look checklist; "all works").
- **The confirm modal lists one pick per line** (PO look): `confirmBody` always
  built the lines with `\n`, but `.confirmRowBody` collapsed them into one run-on
  sentence since AC1; `white-space: pre-line` fixes it.

**Departures:**
- **No locked look rows.** A stone gift never carries conditions, so a look row
  can never be locked; the branch is not built.
- **The picker leg lives in `c2a-ascension-site`**, not `c1-medallions` (§6): c2a
  already walks the ceremony.
- **AC1's flake fixed:** `TestAuthoredRowSources` failed ~1 run in 2 at HEAD
  (map order picked which stone defined a kind); defs are now sorted, first wins.
- **Two stale harness legs repaired:** `c1-medallions` had been broken at
  character creation since the one-screen creation (`31975ae4`, 2026-10-25: the
  tiles sit behind "Change look"); c2a's heir leg (AC1's settled red) waited for
  a VISIBLE selected tile for the same reason and now waits for it attached.

**Schema:** DB none · wire +2 (`ConversationNode.rows`, `ConversationOption.appearance`)
· conf none · content +1 row source (`ascension_looks`), +2 node keys (`slot`,
`looks`), +3 appearance items, +2 stone nodes · lang +3 item names, +2 stone
lines, +7 UI keys, en + de.

**Verified:** Go 0 FAIL (`./...`) · `db-test` ok · vitest 2013/0 · typecheck ·
editor `node --test` 16/0 + `smoke.mjs` 0 findings (a real save keeps `slot` and
`looks`) · `c2a-ascension-site` 48/48 on the DEBUG world (rerun after the 60vh
change 47/48, the red a headless WebGL context loss, backlog §29) ·
`c2b-bloodline-select` 12/12 · `c3-memorial-catalog` 14/14 · `c1-front-stone`
13/16 (3 expected) · `qi1-quest-icons` 13/13 · `hygiene-wire-prune` clean ·
`c1-medallions` 52/1/1 (the fail the known `live stance` venue flake, the
inconclusive the campfire out of view). The `pre-line` fix came after the
harness runs and the PO look; it is CSS only (webpack compiled), not re-looked.

**In-game (PO, 2026-11-20, AC1 + AC2 together):** "all works, as expected";
the one finding (the run-on confirm list) fixed in this chunk.

### AC3 - the heir home: DONE 2026-11-21 [uncommitted], PO look passed 2026-11-21 ("all works")

**Built:** a stone authors `heirHome` (a bind-point id) beside its `ceremony`; the
mob loader puts it on the summary node's `Ceremony` and refuses the key on an actor
without a ceremony. `world.ResolveHeirHomes` (boot, `cmd/aurad/loaders.go`) checks
it against every loaded zone's bind points and records the fire's area on the
ceremony. Confirm stashes the home on `skills.AscensionPick` with the price;
`CompleteAscension` applies D14 in code (a step's own home, the last in ceremony
order, else the stone's, else none) and `RequestAscension` carries it as
`AscensionRequest.HeirHome`. `AscendCharacter` takes `heirHome` and writes it in the
same `UPDATE` that sets `sacrificed_at` (NULL when absent, so a homeless stone
leaves the heir unbound, Q4); `CreateCharacter`'s `INSERT` copies
`home_campfire_id` from `previous_character_id` (L9). The summary gets a locked row
"Your heir wakes at: <place>" above Confirm (index 253); the client names the place
from the region title in the player's language. Editor: a "Heir home" field on the
ceremony subsection, `validate.mjs` mirrors the refusal. Content: the front stone
sends its heirs to `spawnpoint-11`, the east fire of the front camp [PLACEHOLDER];
the debug world gains a `spawnpoint-11` beside its front stone.

**Rulings (PO 2026-11-21, choice prompts):**
- **The place rides the wire**: +1 `ConversationOption.place` (the area id) rather
  than baking the name into the row text, so the client localizes it.
- **The heir fire is `spawnpoint-11`** (Q6's placeholder).
- **The debug world gets the fire too**, so the debug-world harnesses boot against
  the same content.

**Departures:**
- **Wire +1, not "wire none"** as §5 designed, per the first ruling.
- **An unplaced stone only warns.** D13 refuses an unknown id; built as the
  `CrossValidateTravelAnchors` split instead: a stone some zone places fails the
  boot, one nobody places logs `unreachable heir home`. A blanket refusal broke three
  `cmd/aurad` tests that boot the real mobs against a one-zone fixture, and the split
  lets a stone and its fire land in either order.
- **The debug world shows no place name**: it has no areas, so the line reads
  "Your heir wakes at: " there. Accepted for the debug world.
- **L8 pinned**: a periodic save after the sacrifice returns `store.ErrNoCharacter`
  and cannot overwrite the written home (now a test).

**Schema:** DB none (reuses `characters.home_campfire_id`) · wire +1
(`ConversationOption.place`, a hard refresh at the next deploy) · conf none ·
content +1 stone key (`heirHome`), +1 debug-world bind point · lang +1 UI key, en + de.

**Verified:** Go 0 FAIL (`./...`; `accounts.TestRepeatedFailuresAreThrottled` the
known load flake, green alone with the DB) · `db-test` ok (the home written or
cleared, inherited, the last ascension's wins, a fresh slot unbound; replacing the
copy subselect with NULL turns both red) · vitest 2013/0 · typecheck · editor 17/0 ·
`aurad -validate` 0 findings on both worlds, embedded and on-disk (a bogus id is
refused) · `hygiene-wire-prune` 0 errors (first run a WebGL context loss, backlog §29;
rerun clean) · `c2a-ascension-site` 48/48 · `c1-front-stone` 13/16 (3 expected).
Headless cannot reach the line: the front stone's catalog sits behind the elite-orc
price.

**In-game (PO, 2026-11-21):** the summary line at the front stone, the heir waking
and respawning at `spawnpoint-11`, a new bind winning, a homeless stone's heir and a
fresh account on the default spawn: "all works". The German line "Dein Erbe erwacht
in: {place}" was on the checklist.
