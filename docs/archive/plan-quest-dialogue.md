# Plan - quest dialogue: an any/all toggle on conditions, and the two-row quest shape

**Status:** DESIGNED + PO-RULED 2026-10-06; **C1 + C2 + C3 BUILT
2026-10-06/07** (§10), C3's PO walk owed. PO rulings D1-D4 and D13-D15 taken as choice prompts the same
day; D5-D12 are mine, flag if wrong. Three chunks: C1 engine + editor, C2 the rats example, C3 every
other quest. **Schema: DB NONE · wire NONE · conf NONE · content +1 optional
key on dialogue nodes and ascension entries (`conditionsMode`), then a content
pass over 21 quests.** Ledger: §10.

**PO feedback 2026-10-04** (`docs/feedback.md`): *"something clunky about the
quest ... once that is accepted, the field 'anything in the barn' should be no
longer visible and instead it should say 'about the rats in the barn..'
clicking on that should show the option 'i am on it', if the quest is still in
progress or 'I killed the rats' or even other questions about the quest,
similar to the gothic dialogue system."* Then: *"We will introduce an optional
OR condition for this kind of dialogue option ... a toggle for AND or OR in the
editor and both should be valid."*

---

## 1. Where this starts

A dialogue node carries a `conditions` list, and every entry must pass. The
quest sentinels are `not_started`, `running` and `completed`. Nothing can say
"running or completed", so a question that should be readable during AND after
a quest has to be authored twice: two lines-only nodes with the same answer,
one gated `running`, one gated `completed`, and two rows with the same text on
the parent node. That worked when tried on a scratch copy of Reinhard
(2026-10-04), and it is exactly the duplication the PO does not want authors
to live with.

The second half is a content shape, not an engine gap. Today 20 of 21 quests
keep the accept row and the turn-in row on ONE node behind ONE root row
("Do you have a task for me?"), so the same root row reads the same before,
during and after the quest. The two-row shape (offer row before the accept, an
"About the ..." row while it runs) needs no engine change and was built on
Reinhard on 2026-10-04, then reverted on request; this plan brings it back as
the norm.

## 2. The rule

> **A condition list has a mode: `all` (every entry must pass, the default and
> today's behaviour) or `any` (one passing entry is enough). Both are valid
> everywhere a condition list is authored.**

Nothing else about conditions changes: no negation, no nesting, the same four
kinds, the same sentinels.

## 3. PO rulings (2026-10-06)

- **D1 - the toggle is any/all on the list, authored in the editor.** Both
  modes are legitimate content; neither is a workaround.
- **D2 - scope: dialogue nodes AND ascension entries.** The list, its parser
  and its evaluator are shared with `api/ascension/*.json` (the rewards a
  stone offers), so the mode lives on the one shared type.
- **D3 - the rats example ships in this plan** (C2): the two root rows on
  Reinhard plus a "Tell me more about rats." question shown while the quest is
  running OR completed. It is the worked example the manual points at.
- **D4 - the two-row shape becomes THE quest shape, converted here** (C3): the
  other quests move to it in one content pass, the PO rewords the drafted
  rows in the editor.
- **D13 - the Grandfather Knot stays as he is.** His two quests keep their
  PO-passed flow (2026-10-03); C3 converts the other 18 and the manual names
  him as the one deliberate exception until he is touched again.
- **D14 - the editor labels the modes "AND" / "OR".** The JSON values stay
  `all` / `any`.
- **D15 - a converted quest's progress row disappears at the turn-in** unless
  a question authored on its progress node is gated to outlive the quest. A
  question is content, written where there is something to say; only the rats
  get one in this plan, as the example.
- **D16 (PO 2026-10-07, at the C2 look) - the rats' question ends with the
  quest too.** "Tell me more about rats." is gated `running`, not `any` of
  running / completed, so after the turn-in Reinhard shows neither rats row.
  This amends D3's "running OR completed": the progress row leaving at the
  turn-in is the norm for the vast majority of quests, NOT an engine rule; a
  quest that wants a question afterwards still authors the `any` gate. No
  shipped content uses `any` after C2.
- **D17 (PO 2026-10-07, C3 planning) - `eliza-sends-me` stays as it is.** The
  R2 reach quest (the 22nd file, after the §6 survey) has no brief node: a bare
  offer row on Eliza, the turn-in "Eliza sends me." on Reinhard's root. Nothing
  to ask about it; the C3 walk test exempts it by name, beside the Knot.
- **D18 (PO 2026-10-07) - a foreign turn-in stays on root.** The City Guard's
  and the Shaman's `wolves-on-the-road` turn-ins (neither gave the quest) keep
  the manual's rule and sit directly on root, shown only at `carry_word`. Only
  the Town Crier, the giver, gets a progress row. This amends §6's "progress
  rows on the City Guard and the Shaman".
- **D19 (PO 2026-10-07) - "Farmer" becomes "Reinhard" in C3.** The Hermit's
  brief and turn-in row and the Crier's `news_who` still name the pre-2026-09-23
  actor; fixed in passing, the chunkC4 harness's "Farmer" leg with them.

## 4. Design decisions (mine)

- **D5 - the key is `conditionsMode`**, a sibling of `conditions` on the node
  (and on the ascension entry). Values exactly `all` or `any`; absent means
  `all`, so every shipped file keeps its meaning byte for byte and nothing
  migrates. An unknown value refuses the boot, like an unknown kind does.
- **D6 - one value, not two fields.** Node, ascension entry and the ceremony's
  stashed pick all hold a `Gate{Mode, Conditions}`, and `conditionsPass(gate,
  p)` is the only evaluator. The stash is why: `ascensionRows.stash` copies
  `node.Conditions` into `AscensionPick.Gate` and re-judges it ten seconds
  later when the channel completes; a mode held beside the slice would be
  dropped by that copy and an `any` gate re-judged as `all`.
- **D7 - an empty list is unconditional, and a mode on it is refused.** "No
  conditions" keeps meaning "always"; an authored `conditionsMode` beside an
  empty or absent list is an authored no-op and refuses the boot, the same
  habit as `ParseCondition`'s "a count of 0 passes for every character
  alive". The editor drops the key when the last condition is deleted.
- **D8 - a locked row joins its gate with "or" under `any`.** Today
  `describeConditions` renders `level 30 (25/30), complete "The Lost Lamp"`;
  under `any` the same gate reads `level 30 (25/30) or complete "The Lost
  Lamp"`. The player-facing dialect is the only place the mode is visible.
- **D9 - no negation.** `any` over the sentinels covers every case content
  has asked for ("running or completed" = not `not_started`); a `not` would be
  a second vocabulary for the same reach.
- **D10 - the editor shows the mode as a select in the Conditions header**
  ("AND" / "OR", D14), written only when `any` (so a file
  that never used it stays as it was). The ascension entries have no editor
  tab; they are hand-authored JSON today and stay so, with the same key.
- **D11 - the two-row shape, stated once.** A quest's root carries TWO rows:
  - the **offer row** ("Anything in the barn?") leads to the offer node: the
    brief as its lines, the Accept row, nothing else;
  - the **progress row** ("About the rats in the barn...") leads to the
    progress node: the turn-in row, the per-stage answers ("I am on it." while
    killing), and the questions.
  Neither node is gated. The show-rule hides the Accept row once the quest
  runs and the turn-in row until its edge is walkable, and the dead-end prune
  then hides whichever root row leads to an empty node. A question that should
  outlive the quest ("Tell me more about rats.") points at a lines-only node
  gated `any` of `running` / `completed`, which is what keeps the progress
  row on root after the turn-in; a quest with no such question loses its
  progress row at the turn-in. An abandon brings the offer row back.
  ⚑ A trade to know at the look: the brief lives on the offer node, so after
  the accept the task text is readable in the journal only (the one-node shape
  kept it on the node before and after). The progress node's lines are where
  a restated task would go if one is wanted.
- **D12 - the quest nodes themselves stay ungated.** Gating the offer node
  `not_started` and the progress node `running` reads the same on root, but
  the node the player stands on vanishes with the click and the panel drops
  back to the greeting instead of staying on the reply.

## 5. Not in scope

- Negation, nesting, or a condition on a row (rows stay condition-free; a row
  is hidden through its destination, as today).
- The quest file format, the ledger, the journal, the wire: untouched.
- `running` stays. Its one authored use (the traveller's "Where do they nest?")
  is still the right gate; only its comment loses "otherwise inexpressible".
- Rewording beyond the drafted rows: the plain-text rule (PO 2026-08-02)
  holds, and the PO rewords in the editor.

## 6. The change (line refs as of 2026-10-06, `4fe18b8f`)

**C1, engine + editor**

- `items/mobs/interaction.go`: `Gate{Mode ConditionMode; Conditions
  []InteractionCondition}` replaces the bare slice on `InteractionNode` (:47);
  `jsonInteractionNode` (:492) gains `ConditionsMode string
  \`json:"conditionsMode"\``; `ParseConditionMode` beside `ParseConditionKind`
  (:439); the loader (:677) fills the gate. L3's "conditional nodes above the
  root" rule (:795) and the locked-row destination check (:832) read
  `len(gate.Conditions)`, unchanged in meaning.
- `ascension/catalog.go`: `Entry.Conditions` (:47) becomes `Entry.Gate`, the
  JSON entry (:159) gains the same key, `Gated()` (:51) reads the list.
- `sys/interaction.go`: `conditionsPass(gate, p)` (:1419) switches on the
  mode: `all` is today's loop, `any` returns true on the first pass and false
  at the end (an empty list returns true in both, D7). Every caller passes the
  gate: `present` (:937), `applyGrant` (:1246), `destinationVisible` (:1402),
  `lockedGateRow` (:1214).
- `sys/ascension_rows.go`: the four `conditionsPass(entry.Conditions, p)`
  sites (:110, :219, :252, :313), `stash` (:274) stores the gate,
  `siteGateHolds` (:409) asserts `Gate`, `describeConditions` (:341) joins
  with `", "` or `" or "` by mode.
- `tools/content-editor/validate.mjs` (:246): accept the key, refuse any value
  but `all`/`any`, and refuse it on an empty list (D7). Nodes only: the port
  never reads `api/ascension`, so the ascension side is the Go loader alone.
- `tools/content-editor/public/app.js`: `conditionsSection` (:1116) gets the
  select in its header; `skill-inventory.mjs` `conditionText` (:235) joins
  ascension gates with `or` under `any`.
- Docs: `manual-content-authoring.md` (:1562, :1628 "AND-ed with no
  negation"), `api/ascension/README.md` (:28), the Go comment on
  `QuestStageRunning` (`interaction.go:424`), `backlog.md:97` (one line: the
  gap is closed).

**C2, the rats example** (content + docs, needs C1)

- `api/mobs/reinhard.json`: root rows "Anything in the barn?" → `rats`
  (brief + Accept only) and "About the rats in the barn..." → `rats_running`
  (the turn-in, "I am on it." → `rats_on_it` gated stage `clear`, "Tell me
  more about rats." → `rats_more` gated `any` of `running` / `completed`).
  Reinhard's `_comment` gets one authoring sentence.
- `manual-content-authoring.md` §6: the stale section "The two-row shape"
  (:1519-1552, swept into `116a9519`, names a test and a setup that do not
  exist) is rewritten as THE shape (D11, D12), with the `any` question as the
  worked example. `content-npcs.md` Quest roles row for the rats.
- A content pin in `sys/`: the real Reinhard through `present()` at every
  quest state (not started, killing, rats dead, completed, abandoned), the
  root row swapping and the question outliving the turn-in. The 2026-10-04
  draft (`TestContent_ReinhardsRatsQuestSwapsItsRootRow`) is the shape.

**C3, every other quest** (content, needs C2 as the pattern)

The quests and where their rows live today (survey 2026-10-06; the Knot's
two are listed and stay, D13):

| Giver | Quests | Today |
|---|---|---|
| Reinhard | turnip-chore, boars-in-the-field | one node each |
| Eliza | dinner-for-the-family | one node |
| Hermit | village-welcome | one node |
| Lampless Traveller | the-lost-lamp | one node + a `running` question |
| Lamplighter | dire-wolves-in-the-forest | one node |
| Miller | the-millers-ring, the-sounder-at-the-mill | one node each |
| Miner | spiders-in-the-diggings | one node |
| Shepherd | the-strays | one node |
| Village Healer | alpha-wolves-at-the-village | one node |
| Wanderer | kobolds-on-the-road, the-lost-friend | one node each |
| Emberkeeper | bandits-at-the-shrine | one node |
| Front Captain | thin-the-orc-line | one node |
| City Guard | bears-at-the-walls | one node |
| Shaman | dire-wolves-at-the-camp | one node |
| Town Crier → City Guard / Shaman | wolves-on-the-road | offer on the Crier, two turn-ins on root |
| Grandfather Knot | clear-the-grove, the-sleeping-roots | gated offer nodes, four turn-ins on root (PO-passed 2026-10-03) |

Per quest: the turn-in row and any running-only rows move to a new progress
node, a progress row joins root, the offer row keeps its text. Drafted texts
follow the rats pattern ("About the boars...", "About the turnips...") in
plain text; the PO rewords in the editor. The Crier's wolves quest gets its
progress rows on the City Guard and the Shaman (each already turns it in from
root). The Knot keeps his flow (D13). No converted quest gets a question
unless one is authored (D15).

Docs: the manual names the shape as the norm; the `add-content` skill's quest
checklist points at it; `content-npcs.md` Quest roles; the `verify` skill's
coverage-map rows for `chunkC4-quests`, `c1-kill-quests` and `c2-kill-quests`
(they describe the row texts the legs click).

**C3 detailed (planned 2026-10-07, D17-D19 ruled; supersedes the Crier line
above).** 18 quests on 15 files.

- **Per quest:** the existing quest node becomes the offer node (brief +
  Accept; its root row keeps its text). A new root row "About the ..." leads to
  a new `<q>_running` node holding the turn-in row, moved byte for byte (grants,
  XP, taught skill, Eliza's trailing `offer_quest` for `eliza-sends-me`), and
  "I am on it." → `<q>_on_it`, gated `quest_at_stage` on the quest's one
  working stage, lines restating the task with its count.
  ⭐ **The stage answer is load-bearing:** a progress node with only the
  turn-in presents nothing between the accept and the report stage, the prune
  then removes its root row, and the giver shows NO row for the quest while
  the player works. No questions are added (D15); the traveller's existing
  "Where do they nest?" (`running`) moves onto the lamp's progress node.
- **Drafted rows** (the PO rewords in the editor):

  | Giver | Quest | Progress row | Working stage |
  |---|---|---|---|
  | Reinhard | turnip-chore / boars-in-the-field | About the turnips... / About the boars... | `pull` / `cull` |
  | Eliza (on `root`, not `root_fed`) | dinner-for-the-family | About the dinner... | `gather` |
  | Hermit | village-welcome | About the village... | `meet` |
  | Lampless Traveller | the-lost-lamp | About your lamp... | `cull` |
  | Lamplighter | dire-wolves-in-the-forest | About the dire wolves... | `cull` |
  | Miller | the-millers-ring / the-sounder-at-the-mill | About your ring... / About the boars at the mill... | `search` / `cull` |
  | Miner | spiders-in-the-diggings | About the spiders... | `cull` |
  | Shepherd | the-strays | About your sheep... | `find` |
  | Village Healer | alpha-wolves-at-the-village | About the alpha wolves... | `cull` |
  | Wanderer | kobolds-on-the-road / the-lost-friend | About the kobolds... / About your friend... | `cull` / `search` |
  | Emberkeeper | bandits-at-the-shrine | About the bandits... | `cull` |
  | Front Captain | thin-the-orc-line | About the orcs... | `cull` |
  | City Guard | bears-at-the-walls | About the bears... | `cull` |
  | Shaman | dire-wolves-at-the-camp | About the dire wolves... | `cull` |
  | Town Crier | wolves-on-the-road | About the wolves... ("I am on it." only) | `thin` |

  The Guard's and the Shaman's wolves turn-ins stay on root (D18). "Farmer"
  → "Reinhard" on the Hermit and the Crier (D19).
- **The walk test (L5), red-first against today's content:** one Go content
  test over every quest. For every non-root node holding the quest's
  `advance_quest`, the root row pointing there is absent at not started,
  present at the working stage and at the report stage, gone after the
  turn-in; and no `advance_quest` row sits on root outside a named exempt
  list (the Knot's two quests, D13; `eliza-sends-me`, D17; the two foreign
  wolves turn-ins, D18). Stages are placed through `Ledger.Restore`, so
  harvest / talk_to / reach quests need no drivers. The C2 rats pin stays.
- **Order, one file at a time (L6, L7):** edit → `make -C backend cp-defs` →
  `go test ./pkg/aura/quests/ ./pkg/aura/sys/ -count=1` → `-validate` (main +
  debug) → `validate.mjs`.
- **Harnesses (L4, wider than listed):** `c1-kill-quests`, `c2-kill-quests`,
  `chunkC4-quests` and also `remains-lost-friend` (clicks the Wanderer's
  turn-in from the friend node) click the progress row before each turn-in.
  `r4-recall-utility` reads only "Do you have a task" and should survive;
  `gk-grandfather-knot` is untouched (D13). chunkC4's journal `undefined`
  reads predate C3 (red at C1 with no client change): fixed if one selector
  drifted, otherwise recorded. All on the DEBUG zones, each on a fresh server.
- **Docs:** manual §6 (drop "most shipped quests still use the older shape";
  the foreign turn-in rule stands, D18), the `add-content` quest checklist,
  `content-npcs.md` Quest roles, the verify coverage map for every touched
  harness, §10.

## 7. Landmines

- **L1 - the stash.** `AscensionPick.Gate` is an `any` carrying a bare
  `[]mobs.InteractionCondition` (`skills/component.go:325`,
  `ascension_rows.go:274`, `:409`). The mode must ride in that value (D6) or
  the ceremony re-judges an `any` gate as `all` and refuses a pick it offered.
- **L2 - three enforcement surfaces.** The Go loader, `validate.mjs` (its
  port; open PO call §B11 Q7 wants it retired) and the editor select must
  agree on the two values. Pin the loader; list the validator as a hand-sync
  point.
- **L3 - `len(node.Conditions)` is read in four places as "is this node
  gated"** (`interaction.go:795`, `:799`, `:832`; `sys/interaction.go:1214`).
  Keep that reading; the mode never makes an empty list a gate (D7).
- **L4 - the harnesses assert root row TEXTS.** `c1-kill-quests.mjs` (A1/A2
  click "Anything else that needs doing" and "I killed the 6 boars" from the
  same node), `c2-kill-quests.mjs` (the City Guard's and four givers' "Do you
  have a task for me" then the turn-in), `chunkC4-quests.mjs` (Hermit,
  Reinhard, the traveller). C3 moves every turn-in to a progress row, so each
  turn-in leg must click the progress row first. Rewrite them WITH C3, never
  leave them red (verify skill, rule 8).
- **L5 - a progress node with one ungated lore row never empties**, so its
  root row shows before the accept and forever after. Every row on it must
  hide itself outside the band it belongs to: a quest row, or a `next` into a
  gated node. The C2 pin covers Reinhard; C3 needs the same walk per giver
  (a Go content test over every quest: before accept the progress row is
  absent, during it is present, after the turn-in it is present iff the node
  authors an `any`/`completed` question). The Knot is exempted by name
  (D13), or the walk reddens on his shape.
- **L6 - `CrossValidate` derives the terminal stage from the rows.** Moving a
  turn-in row between nodes keeps the edge; deleting one by accident makes a
  stage terminal and completes the quest at the deed. `quests/content_test.go`
  reachability pins catch it; run them per file, not at the end.
- **L7 - `-content ../api` reads the server side only**, and the editor
  reads disk. A content pin reads the EMBEDDED copy: `make -C backend build`
  (cp-defs) before trusting a green Go run.
- **L8 - the stale manual section** (`manual-content-authoring.md:1519-1552`)
  is in history and names a test that does not exist. C2 rewrites it; until
  then it is wrong.
- **L9 - `describeCondition` renders `not_started` as the unusable `"Title"
  at "not_started"`** (manual :1632). An `any` gate on a locked row inherits
  that; nothing new, but an `any` of `not_started` / `completed` would read
  oddly. No shipped row needs it.

## 8. Open questions for the PO

None. Q1 (the Knot), Q2 (the labels) and Q3 (the progress row after the
turn-in) were ruled the same session as D13, D14 and D15.

## 9. Test strategy and verification

Red-first Go tests:

- `items/mobs/interaction_test.go`: `conditionsMode` absent → `all`; `any`
  parses; an unknown value refuses the file (nodes); the same three on
  `ascension/catalog_test.go` (entries).
- `sys/interaction_test.go`: `conditionsPass` under `any` with one passing
  entry passes, with none fails, over an empty list passes (D7); `present`
  and `applyGrant` agree on an `any`-gated destination (the N1 pair).
- `sys/ascension_rows_test.go`: `describeConditions` joins with " or " under
  `any`; a stashed `any` gate still holds at ceremony completion when one
  entry lapsed and another stands (L1).
- C2: the Reinhard content pin (§6). C3: the per-giver walk (L5).

Verification tail per chunk: `go build ./...`, the suites above,
`./aurad -validate -content ../api`, `node tools/content-editor/validate.mjs`
(the port), `npm run smoke` in `tools/content-editor/`, then in-game: talk to
Reinhard at every state (accept, kill stage, report stage, turn-in, the
question after the turn-in, abandon), and in C3 the rewritten harnesses
(`chunkC4-quests`, `c1-kill-quests`, `c2-kill-quests`, each alone on a fresh
server). Schema line for every chunk: DB NONE, wire NONE.

## 10. Chunk ledger

- **C1 engine + editor:** ✅ 2026-10-06 `ea04313d`. Built as §6 says:
  `mobs.Gate{Mode, Conditions}` replaces the bare slice on `InteractionNode`
  and `ascension.Entry`; `mobs.ParseConditionMode(name, n)` is the one parser
  both loaders call (absent = all, unknown refused, any mode on an empty list
  refused, D7); `conditionsPass(gate, p)` loops `conditionHolds` by mode;
  `describeConditions` joins with " or " under `any`; the stash stores the
  whole gate and `siteGateHolds` asserts `mobs.Gate` (L1). Editor: an AND/OR
  select in the Conditions header (labels D14), key written only for OR,
  dropped with the last condition; `validate.mjs` ports the parser (L2 hand-sync
  point: Go loader, `validate.mjs` `CONDITIONS_MODES`, the editor select);
  `skill-inventory.mjs` joins ascension gates with "or". Docs: manual §6 (the
  AND/OR section, example uses C2's `rats_more`, keep the id or update it),
  `api/ascension/README.md`, `backlog.md`.
  ⚑ The plan missed two `.Conditions` readers, `items/mobs/registry.go`
  (kill-species resolution) and `quests/interactions.go` (stage refs): renames.
  ⚑ The L1 trap was real: `TestAscensionRows_AnUngatedSiteStillPricesThePick`
  still asserted the old slice type and went red; the new L1 test
  (`TestAscension_AStashedAnyPriceStillHoldsWhenOneEntryLapses`) was
  mutation-checked (stash dropping the mode → red).
  ⚑ **Fixed on the way:** `tools/content-editor/aurad-validate.mjs`
  `CONTENT_SUBDIRS` listed 10 dirs, the server loads 13 (`areas`, `regions`,
  `atmospheres` missing), so with a fresh binary EVERY editor save was refused
  (`stat areas: no such file or directory`); the smoke only skipped it while
  `aurad` was stale.
  **Schema: DB NONE · wire NONE · conf NONE · content +1 optional key, no
  shipped file changed.** Verified: Go green bar the known
  `TestPropContent_C1bMigrationPreservesLookAndCollision` (36 ok; `store` /
  `accounts` skipped, untouched) · `-validate` 0 (main + debug) ·
  `validate.mjs` 0 · editor smoke 0 · the editor driven headless (OR writes
  `"any"`, AND drops it, `or` / a mode on an ungated node refused) · DEBUG
  zones, each on a fresh restart: `c2a-ascension-site` 31/31,
  `c1-front-stone` 13/16 + 3 INCONCLUSIVE (the orc hunt), `chunkC4-quests`
  19 PASS + 8 FAIL + 3 INCONCLUSIVE: every conversation leg green incl. the
  `running` gate (D2/D3) and the turn-in paying (A14); the 8 FAILs are stale
  harness reads, A8 expects the actor `Farmer` (renamed Reinhard 2026-09-23)
  and seven read the journal detail as undefined (C1 touched no client or
  ledger code). C3 rewrites those legs anyway (L4).
  ⚑ The three harnesses' venues exist only in the DEBUG world now (the Hermit
  stands at (-122, -30) on the main world, the harness warps to (-55, 26)).
  ⚑ Unwalked: an `any` gate in-game (first content is C2). `skill-inventory`
  is red at HEAD on `packIcon`, so its "or" join got a syntax check only.
- **C2 the rats example:** ✅ 2026-10-07 `36068d47`, PO-walked ("works").
  `api/mobs/reinhard.json`: root gains "About the rats in the barn..." →
  `rats_running` beside the offer row; `rats` keeps the brief + Accept only;
  `rats_running` ("The rats?") holds the turn-in (moved, unchanged), "I am on
  it." → `rats_on_it` (gated stage `clear`, restates the count) and "Tell me
  more about rats." → `rats_more` (drafted lore). ⭐ **D16 at the look:** the
  PO asked for the progress row to be GONE after the turn-in, so `rats_more`
  is gated `running`, not D3's `any` of running / completed; Reinhard shows no
  rats row after the turn-in. The norm for most quests, NOT an engine rule
  (§3 D16). So no shipped content uses `any` after C2; the manual's OR
  example is marked illustrative (`lamp_more`). Pins:
  `sys/quest_content_test.go` (`TestContent_ReinhardsRatsQuestSwapsItsRootRow`
  walks accept → kill stage → 8 GiantRat kills → turn-in through
  `present()`/`applyGrant`; `...AbandonBringsTheOfferBack`), red on the old
  content first; it adds `contentRegistries` to `sys` tests (the first real
  content there). Manual §6 rewritten as THE shape (D11, D12, D15/D16, the
  Knot exception D13); the old section's nonexistent test name is now real.
  `content-npcs.md` rats row. **Schema: DB NONE · wire NONE · conf NONE ·
  content: Reinhard +3 nodes +1 root row.** Verified: Go green bar the known
  C1b prop test · `-validate` 0 (main + debug) · `validate.mjs` 0 · editor
  smoke 0 · PO in-game walk on the main world 2026-10-07 (all states incl.
  abandon). No harness touches the rats rows.
- **C3 every other quest (18, the Knot excepted):** ✅ BUILT 2026-10-07
  `8a72d8bb`, PO walk owed. As §6 "C3 detailed" says: 18 quests on 15 files moved to the
  two-row shape by a text-surgery script (each turn-in moved byte for byte;
  every file's grant set checked identical before/after), a `<offer>_running`
  progress node + an `<offer>_on_it` stage answer per quest, the traveller's
  nest question moved onto `lamp_running`, the Crier's `wolves_running` holds
  only "I am on it." (D18). "Farmer" → "Reinhard" on the Hermit (brief +
  turn-in row) and the Crier (`news_who`), D19. Eliza's one-row inline root
  array was expanded by hand first (the script's only layout miss).
  Pins, red on the old content first (17 turn-in subtests + the lamp's offer):
  `TestContent_EveryQuestTurnsInBehindAProgressRow`,
  `TestContent_EveryQuestOfferRowLeavesWithTheAccept` and
  `TestContent_TheCriersWolvesRowLastsTheHunt` (mutation-checked: the Crier's
  gate on `carry_word` → red), stages placed through `Ledger.Restore`.
  Harnesses: `chunkC4-quests`, `c1-kill-quests`, `c2-kill-quests`,
  `remains-lost-friend` click the progress row before each turn-in and assert
  the root swap. ⚑ **Fixed on the way:** chunkC4's seven `undefined` journal
  reads were ONE missing helper: since the UI pass C2 exclusivity policy the
  journal and a conversation shut each other, and chunkC4 never re-opened its
  journal (c1/c2 do, `ensureJournalOpen`); ported, plus a fresh talk where a
  panel is read after a journal read. c1's A7 read a hand-renamed tracker
  ("Return to the Reinhard") that no content says; it now reads the authored
  tracker off `api/quests/` (the `/quests` catalog serves no trackers). c1's B3/C3 accept a nonzero count at the accept (a passing mob can
  die first; chunkC4 already did).
  ⚑ Left for the PO: `turnip-chore` and `boars-in-the-field` journals and
  trackers still say "the Farmer" (outside D19).
  **Schema: DB NONE · wire NONE · conf NONE · content 15 NPC files (+36 nodes,
  +18 root rows), no quest file.** Verified: Go green bar the known C1b prop
  test · `-validate` 0 (main + debug) · `validate.mjs` 0 · editor smoke 0 ·
  DEBUG zones, each on a fresh server: `chunkC4-quests` 43/43 (every hunt
  landed, the wolf branch and the lamp turn-in walked), `c2-kill-quests` 23/23,
  `c1-kill-quests` 20/20 · main world: `remains-lost-friend` 12/12.
