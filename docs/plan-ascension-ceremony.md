# Plan: Ascension ceremony: one ascension, several picks in order, a summary at the end

**Status: DESIGNED 2026-10-22 (planning session, PO in chat). R1-R9 RULED, D1-D14
PROPOSED, nothing built.** Open PO calls in §7. Three chunks (§5); AC1 can start once
the plan is approved. It needs nothing from appearance C5c, and C5c needs nothing from it.

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

### D1 - The one rule [proposed]

A stone authors an ordered list of steps. Each step offers one list and shows it in the
display that fits it. A pick is only remembered. The summary lists every pick, and its
one Confirm is the only thing that starts the channel. Leaving throws the draft away.

### D2 - The stone authors `ceremony`, an ordered list of node ids [proposed]

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

### D3 - The step-kind seam (R7) [proposed]

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

### D4 - The draft [proposed]

`SkillComponent.PendingAscension` becomes the draft: `{Gate, Picks []StepPick}` where a
`StepPick` is `{Step: nodeID, Kind, Key}` (ids only, never a closure over the player:
the reattach landmine from world-effects §3.4). Applying a step replaces that step's
entry, so Back and re-pick simply overwrite. A skipped step is an entry with `Key: ""`.

- **Discarded** when the conversation ends (walk away, close, another conversant),
  on death, on disconnect, and by `CancelCast` once channelling. Never persisted.
- The channel starts only from the summary's Confirm (D6); the gift click no longer
  starts it.

### D5 - Navigation [proposed]

- Every step node gets a generated **Back** row (navigates to the previous step;
  grants nothing) except the first, whose Back returns to the node that opened the
  ceremony. Next is the click itself: a pick or a skip moves to the following step
  (or the summary).
- Steps whose list offers nothing to this player (all owned, all spent, empty) are
  **skipped in both directions**, and leave no summary line. The gift step is never
  skipped while D14's empty-gift row applies: that row is its pick.
- A gated step node (`conditions` failing) counts as offering nothing.

### D6 - The summary [proposed]

Generated rows, all inert except the last two: one line per step that was shown, in
order, naming the pick ("Gift: Frostbite", "Portrait: Villager", "Ring: none"), then
**Back** and **Confirm**. Confirm carries `confirm_seconds` (5 [PLACEHOLDER], today's
value) and the modal names everything about to happen, plus that this character ends.
Confirming re-validates the whole draft (every step's `Validate` plus the site price),
then stashes it and starts the channel. Lines carry ids (skill id, appearance flat
index), so the client words them in its own language.

### D7 - The look step: `ascension_looks` [proposed]

```json
{ "id": "portrait-a", "rows": "ascension_looks", "slot": "portrait",
  "looks": ["villager-elder", "hunter"], "lines": [ ... ] }
```

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

### D8 - The stone mode of the picker [proposed]

The wire tells the client which display a node wants: `ConversationNode` +1
`rows:string` (the row source name, empty for authored nodes) and
`ConversationOption` +1 `appearance:ushort` (the item's flat index + 1, 0 = none). On
an `ascension_looks` node the client opens `LookPicker` in stone mode instead of rows:
one slot's tab, the step's items (locked ones greyed with reasons), the preview, **Pick**,
**No new look**, **Back**. Pick sends the row's option index through the same select
message any row uses; the server's next step arrives as usual. The picker closes when
the conversation leaves the node, so the conversation panel stays the one owner.

### D9 - Grants and validation at completion [proposed]

`applyAscension` re-runs `Validate` on every pick (an item became owned, a gift's gate
regressed), then builds one `AscensionRequest` (gift key + look grants + D21a count
grants). A pick that fails is a refusal of the whole ascension with the existing
"something changed" reply, never a partial grant. The transaction is unchanged.

### D10 - Words [proposed]

Stock lines (en + de, `conversations.arb` `stock.*`): the summary header, "No new look",
Back, Confirm, the per-kind line labels ("Gift", "Portrait", "Ring"), the modal text.
Node lines stay authored per stone.

### D11 - Content [proposed]

Both stones migrate to `ceremony`. AC2 adds two placeholder bloodline-scope look items
(one portrait from the spare PONETI busts, one ring family) and puts a portrait step
and a ring step on the main stone [PLACEHOLDER content, PO picks, Q2].

### D12 - The content editor [proposed]

The editor's serializer is a whitelist (memory: mob levels / zone editor); `ceremony`,
`slot` and `looks` must be added in the same chunk that introduces them, or the next
editor save drops them silently (L1).

### D13 - The heir home: a stone authors `heirHome` [proposed]

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

### D14 - Per-pick homes: designed for, not built [proposed]

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
Needs: nothing. **Schema:** DB none · wire `ConversationNode` +1 (`rows`; AC1 already
sends it, the client keys nothing on it yet) · content +1 stone key · lang + stock lines.
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
Needs: AC1. **Schema:** DB none · wire `ConversationOption` +1 · content +1 row source,
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
  `c1-medallions` with the stone picker leg in AC2.
- **PO in-game look** per chunk (§5).

## 7. Open PO calls

- **Q1. Summary wording and the modal text.** Proposed: header "Your ascension", one
  line per step "<label>: <pick or none>", modal "These are granted and <name> ends.".
- **Q2. AC2's placeholder content:** which bust and which ring family the main stone
  offers. Proposed: two spare PONETI busts and one existing ring family, all bloodline
  scope [PLACEHOLDER].
- **Q3. Does the front stone (`front-ascension-stone`) get look steps too?** Proposed: no,
  gift only, until the PO authors more looks.
- **Q4. The heir-home words, and the no-home case.** Proposed: the summary line "Your
  heir wakes at: <place>", the place named by its area (or a name authored on the bind
  point if areas do not fit); a stone without a home sets the heir unbound rather than
  passing on the ending life's own bind.
- **Q5. The per-pick form (D14), when content first needs it:** (a) a home on the gift
  entry, or (b) a home step. Proposed: decide with the first faction stone's content.
- **Q6. AC3's placeholder:** which stone gets a home, and which fire. Proposed: the
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

(none yet)
