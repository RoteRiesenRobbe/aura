# Plan: Dialogue quest icons: the map's `!` and `?` in front of every quest row

**Status: DESIGNED + APPROVED 2026-10-25 (planning session, PO in chat). R1-R4 RULED, D1-D7
APPROVED, nothing built.** Q1-Q3 (§7) go with their proposed answers unless the PO rules
otherwise at the look. One chunk (§5, QI1); it runs in `roadmap.md`'s near-term build order (PO 2026-10-30: after campfire traits CT3;
the gate behind appearance C0b is lifted, C0b jumps the queue when its art lands). L1 (the
shared tree's `server.fbs` merge) cleared 2026-10-25 with C6.

**Owns:** the per-row quest marker in the conversation panel.
**Builds on:** `archive/plan-quest-giver-markers.md` (the head/map marker: kinds, colours,
`present()` as the single source, cited as M-D#), `archive/plan-quest-dialogue.md` D11 (the
two-row quest shape).
**Amends:** M-D4 (an offer row's TEXT is tinted by its quest level): under R3 the glyph
carries the colour and the row text goes back to the panel's normal colour.
**Schema (as designed):** DB none · wire +1 field (`ConversationOption.quest_marker`) and a
widened meaning of `quest_level` · conf none · content none · zone none · lang none.

⚑ Line references pinned 2026-10-25 at `619ef33e` (main); re-verify before relying on them.

---

## 1. What this is

When the player talks to an NPC, the rows that are about a quest should wear the same icon
the NPC wears over its head and on the maps: a `!` (tinted by the quest's difficulty) on a
row that leads to a quest to take, a yellow `?` on a row that leads to a step to hand in
now, a grey `?` on a row about a quest still running. Today only the Accept row is marked,
and only by tinting its text.

The catch is the two-row shape (`plan-quest-dialogue.md` D11): the root rows ("Anything in
the barn?", "About the rats in the barn...") only navigate; the grant that offers or
advances the quest sits one node deeper. So a row's icon has to come from what the row
leads to, not only from its own grant.

### 1.1 What already exists and is reused

- **The marker kinds and their order of precedence**: `model.QuestMarkerKind`
  (`backend/pkg/aura/model/quest_marker.go`; 1 offer, 2 turn-in, 3 in-progress, the wire's
  numbering) and `sys.QuestMarkers` (`backend/pkg/aura/sys/questmarkers.go:25`): turn-in
  beats offer beats trivial offer beats in-progress.
- **`reachableQuestGrants`** (`questmarkers.go:~105`): walks the presented tree from the
  entry node along navigation rows and returns the lead grant of every quest row met,
  skipping locked rows and row-source nodes. **`awaitedQuestsFinishedBy`**
  (`questmarkers.go:~140`): the grey `?`'s static rule (an authored `advance_quest` leaving
  the stage the running quest awaits).
- **The quest row in `present()`** (`backend/pkg/aura/sys/interaction.go:1109-1127`): shown
  iff `CanApply`, and the offer row already carries `QuestLevel`.
- **The client's glyph and colour table**: `questMarkerGlyph`, `questMarkerColor`,
  `QUEST_TURN_IN_COLOR` (`frontend/src/client-data/QuestMarkers.ts`). The head glyph is a
  bold PIXI `Text` with a black stroke (`game-objects/logic/Mobs.ts:~384-410`); the map's is
  the same (`map/logic/MapQuestMarkers.ts:90`).
- **The panel's row render** (`frontend/src/features/conversation/logic/Conversation.ts:~260-300`),
  its re-render signature (`JSON.stringify(view)`, so a new row field re-renders for free),
  and the row CSS (`frontend/src/features/user-interface/HUD/assets/HUD.less:629`).

## 2. PO rulings (2026-10-25)

- **R1 - Both levels carry the icon.** The root row that leads to quest content AND the
  grant row itself (Accept, the hand-in row). The icon follows the quest down the tree.
- **R2 - The grey `?` shows too.** A row about a running quest that is not ready to hand in
  wears the grey `?`, exactly as the head marker does; it turns yellow once the hand-in is
  walkable.
- **R3 - The icon carries the colour.** The glyph is tinted like the map marker; the row
  text goes back to the panel's normal colour everywhere (amends M-D4 for the panel only).
- **R4 - The text column stays aligned; the icon sits to its left.** Only quest rows get a
  glyph, but every row's text starts at the same x: the glyph is added on the left, before
  the text start, not as an indent of quest rows (PO's own answer, paraphrased).

## 3. Design

The one rule: **a row wears the marker the NPC's head would wear if that row were the whole
conversation**: its own quest grant plus everything reachable beneath it, with the head
marker's precedence and tint. The server decides it inside `present()`; nothing is authored.

### D1 - Server-side, stamped per row

The server stamps each presented row with a `QuestMarkerKind`. Two reasons it cannot be the
client's job: the grey `?` has no visible row to read (the hand-in row is hidden by
`CanApply` while the quest runs), and M's landmine 1 says markers are read off `present()`
so the panel and the head can never disagree. A client re-derivation would be a second
classifier.

### D2 - What a row's marker is

For a presented, unlocked row:

1. **Its own grant**, if its lead grant is a quest kind: `advance_quest` → turn-in (2),
   `offer_quest` → offer (1). The lead grant decides, as in `reachableQuestGrants`: a
   trailing `offer_quest` in a turn-in bundle is a reward, not an offer.
2. **Its subtree**, if it has a `next`: run the same walk as `reachableQuestGrants`, rooted
   at `next` instead of the entry node, and the grey rule (`awaitedQuestsFinishedBy`)
   restricted to the authored options of the presented nodes that walk reaches.
3. **Combine** with the head's precedence: turn-in > offer > in-progress; none → 0.

Explicitly **no icon** on: a locked row (the walk already skips locked rows, and a locked
row is inert), rows on a row-source node (M's landmine 3), the synthetic Leave row and the
Back footer (client-made), and lore rows with no quest beneath ("Tell me more about rats":
nothing to find, so 0).

⚑ The walk's seen-set is seeded with the row's OWN node (and the entry node), so an authored
row pointing back up the tree never inherits the whole NPC's marker. No content does that
today (`grep '"next": *"root"' api/mobs` is empty), so this is a guard, not a fix.

### D3 - Wire: one appended field, plus `quest_level` widened

`ConversationOption.quest_marker:ubyte = 0`, appended at the table end (after `locks_any`),
values = `QuestMarkerKind`, 0 = none. Derived, never authored, the `travel` comment style.

`quest_level` stays and widens: it is the `!` tint's level on ANY row whose marker is an
offer, grant row or leading row (today only the grant row sets it, `interaction.go:1124`).
Its fbs comment changes to say so. A leading row covering several offers takes the level per
Q2.

### D4 - Client: a hanging glyph in a shared gutter

Every `.conversationRows > li` gets the same left gutter (`[PLACEHOLDER]` ~1.2rem added to
the row's 0.8rem left padding), so every row's text starts at one x (R4). A quest row adds a
`<span class="conversationQuestGlyph">` positioned inside that gutter, left of the text:
the DOM twin of the head's PIXI glyph (bold, the `!`/`?` from `questMarkerGlyph`, a dark
outline via `text-shadow` or `-webkit-text-stroke` `[PLACEHOLDER]`), coloured with
`cssHex(questMarkerColor(...))`.

`questMarkerColor` widens from `QuestMarkerData` to `{kind, level}` so the row calls the
SAME table as the head and the maps (one colour source; the map and head callers pass their
`QuestMarkerData` unchanged, since it has both fields).

The Leave row and Back footer keep the gutter too, so they line up with the rest.

### D5 - The text tint goes (R3)

`Conversation.ts:296` (`label.style.color = questTitleColor(row.questLevel)`) is deleted.
`questTitleColor` itself STAYS: the journal and the quest tracker still tint titles by it
(M-D4's other two doors, untouched by R3).

### D6 - The head marker is left alone

`sys.QuestMarkers` keeps its own code. Folding it over the root rows' stamps (one
derivation) is tempting but not identical: the head's grey `?` is static over ALL authored
nodes, the row's only over reachable ones, and the head prefers a non-trivial offer using
`killXP`, which `present()` does not have. The invariant pin in §6 holds the two together
instead (Q1).

### D7 - Accepted trade: no live recolour mid-conversation

The `!`'s tint is the player's CURRENT level against the quest's (M-D9), computed on the
client. The panel only re-renders when the streamed view changes, so a level-up while the
panel is open leaves the row's `!` in its old tint until the view next changes; the head and
the maps recolour at once. Accepted: a level-up during a conversation is rare and the next
row press repaints.

## 5. Chunks

### QI1 - Quest icons on conversation rows (size M, one session)

Needs first: its slot in `roadmap.md`'s near-term build order (PO 2026-10-30); L1 cleared 2026-10-25.

1. **Server** (`sys/questmarkers.go` + `sys/interaction.go`): scope the walk helpers to a
   subtree root (D2), stamp `QuestMarker` (and the widened `QuestLevel`) on every presented
   row in `present()`; `model.ConversationOption` +1 field.
2. **Wire**: `api/schema/server.fbs` +`quest_marker` appended, `quest_level` comment
   updated; regenerate Go + TS bindings; `codec/gamestate.go` encodes it;
   `GameStateMessage.ts` decodes it; `ConversationModel` carries it into the view row.
3. **Client**: `Conversation.ts` draws the hanging glyph (D4) and drops the text tint (D5);
   `QuestMarkers.ts` widens `questMarkerColor` (D4); `HUD.less` gutter + glyph style.

Schema: DB none · wire +1 field · conf none · content none · lang none.

**In-game (PO):**
- Hermit (`village-welcome`) before accepting: the "welcome" root row shows a `!` in the
  quest's tint; inside, the Accept row shows the same `!`. Text is the normal colour.
- After accepting, while still at stage `meet`: the progress row shows a grey `?`; inside,
  "I am on it" is plain.
- With the hand-in walkable: the progress row and the hand-in row show a yellow `?`.
- Teachings row, Leave row and lore rows: no glyph; every row's text starts at the same x.
- The head marker over the NPC matches the root row's glyph in all three states.
- Phone layout: the gutter does not crowd the row; the glyph is readable.

## 6. Test strategy

- **Go, red first** (`sys`): a hermit-shaped fixture through offer → running (awaiting) →
  walkable hand-in, asserting each presented row's `QuestMarker`: the root row, the grant
  row, the lore row (0), a locked row (0), a row-source node's rows (0), a back-pointing
  row (does not inherit, D2's guard). An offer-plus-hand-in NPC: the row leading to both
  shows turn-in (precedence). The trailing-offer bundle (Eliza's dinner) stays turn-in.
- **Go invariant pin**: for every conversant in the embedded content, on the fixture
  player's states, the head marker's kind equals the best stamp among the entry node's rows
  for the `!` and yellow `?` kinds; for grey, a grey row implies a grey (or better) head.
  Derived from content, never hardcoded. Run with `-count=1` (L3).
- **Codec**: `codec/gamestate_test.go` round-trips `quest_marker` and a leading row's
  `quest_level`.
- **Vitest**: every `QUEST_MARKER_*` kind has a glyph and a colour through the widened
  `questMarkerColor({kind, level})`; `ConversationModel` carries the field;
  `Conversation.test.ts`: a quest row renders the glyph span with the marker colour, the
  label has NO inline colour, a non-quest row has no glyph span.
- **Verify harness**: a dialogue leg (the debug world's quest venues, `verify` skill) that
  screenshots the hermit's panel in each of the three states, plus an `x`-offset check that
  a quest row's label and a plain row's label start at the same left.
- **PO look**: §5's checklist.

## 7. Open PO calls

- **Q1 - Fold the head marker over the row stamps?** Proposed: **no** (D6); keep two
  derivations held together by the invariant pin. Folding would change the head's grey rule
  and its trivial-offer preference.
- **Q2 - A leading row that covers several offers: which level tints its `!`?** Proposed:
  **the lowest offer level met** (the head's tie-break without the trivial split, since
  `present()` has no `killXP`). Rare under the two-row shape, where a leading row covers one
  quest.
- **Q3 - Gutter width and outline style.** Proposed: ~1.2rem extra left padding, a 1px dark
  outline; both `[PLACEHOLDER]`, settled at the PO look.

## 8. Landmines

- **L1 - `server.fbs` is shared with uncommitted work in the tree.** On 2026-10-25 `git status` shows
  `api/schema/server.fbs`, `api/schema/js/aura-api/resource.ts`,
  `backend/pkg/api/AuraApi/Resource.go` and `GameStateMessage.ts` as `UU` (unmerged), with
  another session's uncommitted schema work (appearance C6, corpse). Do not append to the
  schema until that is resolved and committed by its own session; never resolve another
  session's conflict for it. `plan-ascension-ceremony.md` AC1 also appends one field to
  `ConversationOption`: whichever lands second appends after the first, never reuses its
  slot.
- **L2 - The grey `?` cannot be read off visible rows.** The hand-in row is omitted while
  the quest runs, so D2.2's grey check reads the AUTHORED options of the reached presented
  nodes, not the presented rows. Reading only presented rows would silently never show grey.
- **L3 - The Go test cache does not see content edits**: run the invariant pin with
  `-count=1`; without `-content ../api` the embedded copy is read (rebuild / `cp-defs` after
  any `api/` edit).
- **L4 - The panel's signature is load-bearing** (`Conversation.ts`, `renderedSignature`):
  the new field rides in the view row so it re-renders on change; do not compute the glyph
  outside the view (e.g. from `questMarkerFor`) or the panel misses changes.
- **L5 - `present()` cost.** The per-row subtree walk runs inside `present()`, which runs
  every tick for an open panel; the walk is a few nodes, but it must reuse the presented
  conversation already built, never call `present()` again (M's landmine 2 is about
  `present()` per conversant being expensive).
- **L6 - `questTitleColor` has other callers** (journal, tracker): D5 deletes one call, not
  the function.

## 9. Schema impact

- **DB:** NONE (nothing persisted; the marker is derived per tick from the quest ledger).
- **Wire:** +1 field `ConversationOption.quest_marker:ubyte` (appended); `quest_level`
  widened in meaning (set on leading offer rows too), no layout change. Both bindings
  regenerated.
- **Conf:** NONE.
- **Content:** NONE (derived, never authored; no new keys).
- **Zone format / catalog:** NONE.
- **Lang:** NONE (the glyphs are the existing `!` / `?` symbols, no new strings).

## 11. Chunk ledgers

(none yet)
