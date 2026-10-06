# Plan - quest dialogue: an any/all toggle on conditions, and the two-row quest shape

**Status:** DESIGNED + PO-RULED 2026-10-06 (planning session, docs only,
nothing built). PO rulings D1-D4 and D13-D15 taken as choice prompts the same
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

- **C1 engine + editor:** not started.
- **C2 the rats example:** not started.
- **C3 every other quest (18, the Knot excepted):** not started.
