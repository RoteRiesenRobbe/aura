# Plan: the quest system — journal-carried quests on the interaction container

**Status: DESIGNED 2026-07-29 (docs only, no code). No chunk started.**
**Origin:** backlog §42 ruled the pillar (2026-07-29): quests exist, carried by
Gothic-diary journal entries, **no markers ever**, sidebar tracker a maybe — the
ruling lives in `gdd.md` §8 → "Quests & the Journal". This doc is the design
session that followed (same day): what a quest *is* mechanically, how it
progresses, and what has to be built. The PO's framing: the vision sits between
Gothic and WoW — written directions and resources, never markers; diverse quest
natures (kill-N, talk-to, find, and a skills-as-trade-goods idea in place of
item fetch).

Read together with: `backlog.md` §42 (the tension record + pillar ruling),
`gdd.md` §8 (Quest-like Content Through Existing Systems · Quests & the
Journal), `archive/plan-entity-model.md` §8b (the latent-trap set that
explicitly arms "the day quest-style content is authored" — L1/L2/L3/L4 below
are from it).

---

## 1. The design in one paragraph

A quest is an authored content object (`api/quests/*.json`) made of **stages**;
quest state lives **on the player**, advanced **by events**, never on the NPC
(ruled in §42 before this session). A stage is either an **objective stage**
(kill-N / harvest-N / talk-to — auto-advances when the player's lifetime
counters satisfy it) or a **dialogue stage** (waits for the player to click an
authored row somewhere in the world). Offer, advance and turn-in are ordinary
conversation rows — new `GrantKind`s on the interaction container, exactly the
extension it was designed for. **Branching is dialogue-shaped:** several rows on
several NPCs can advance the same stage to *different* next stages with
*different* rewards — which is how "two NPCs can complete the quest" and,
later, camps fall out of the schema instead of being features. The journal is
the read model: each stage carries authored diary text, appended when the stage
is entered, grouped per quest under running/completed.

## 2. Decisions (all PO-ruled 2026-07-29, this session)

| # | Ruling |
|---|---|
| **D1** | **Multi-stage with branching, from the start.** The stage graph is first-class; branch points are dialogue rows (the player's click chooses the edge). Objective stages have one outgoing edge; divergence happens at dialogue. |
| **D2** | **First-pass verbs: kill-N, talk-to-X, harvest-N.** Discover-location is deferred — it is the one verb needing genuinely new machinery (named-area triggers), and it couples to §41's clue-anchor scoping. Harvest-N is kill-N of a harvest species: **same counters, no separate machinery.** |
| **D3** | **Retroactive credit, via lifetime counters.** The ledger keeps per-species kill/harvest counters and a talked-to set for the character's whole life; an objective is satisfied when the counter meets the authored threshold. PO leaned retroactive pending cost; the cost analysis (§3) put the mechanical delta at ~zero, so it is locked. Known design consequence, accepted: a veteran auto-completes on accept ("you've already slain them? Take this." — the Gothic feel); *"kill 8 MORE"* is inexpressible until a per-quest opt-out flag, deliberately deferred. |
| **D4** | **Presence counts.** The lifetime counter increments on the same event that grants the player XP for a kill — quests and XP agree on what "you did" means, and a support player can quest by supporting. One rule, one hook point. |
| **D5** | **Quest state is per-character.** The journal is this character's diary; a fresh character replays the world. Account-wide reward stays the sacrifice loop's job. (Couples loosely to §36/§41 scoping — step 8 confirms, see §8.) |
| **D6** | **One-shot, with schema room for repeatables.** A `repeatable` flag exists from day one; nothing authors it. The completed-set semantics are defined now so the flag is additive later. |
| **D7** | **Journal UI = Gothic 1's actual shape:** entries grouped under their quest, sections for running and completed. Not the flat chronological diary; not a checklist — entries are still only prose the player has already seen. |
| **D8** | **Skill turn-in ("bring me X" via trading a skill): SCHEMA ROOM ONLY.** Advance rows carry a typed `costs` list with an `unlearn_skill` kind defined in the vocabulary; **nothing authors it** until un-learning is ruled (slot eviction, combination ingredients, invested skill levels — open question, §9). |
| **D9** | **Plan for choices.** Two (or more) NPCs can be eligible to complete the same quest with different rewards — D1's branch edges make this pure content. Explicitly named as the seam the later **camps** concept plugs into. |
| **D10** | **Consequences: schema room, author none.** Advance rows also carry a typed `consequences` list (faction standing, hostility flips — the allegiance verbs from `archive/plan-faction-flips.md` were built with quest-turns-hostile as a named consumer). First pass authors only reward divergence; camps get their own design session. |
| **D11** | **Quests start at conversants only.** Every quest begins at a dialogue row — NPCs, signs, anything with an `interaction` block (the ForestSign counts for free). Kill-started / discovery-started would be a later additive trigger kind. |
| **D12** | **Build the first pass BEFORE step 8**, session-scoped exactly like the spellbook and level are today (everything wipes on restart anyway). Step 8 then persists a **live** ledger instead of a paper shape — and gets the shape as a known input either way. |
| **D13** | **Abandon yes, failure no** *(ruled 2026-07-29, follow-up prompt)*. A running quest can be abandoned from the journal: it returns to not-started (its stage path cleared, its diary entries gone) and is offerable again. The completed set is untouchable — a finished one-shot stays finished. No failable quests, no third journal section; a branch taken within a *running* quest is undone by abandoning, a branch sealed by *completion* is forever. See L10 for the XP-loop guard this makes necessary. |

Standing constraints inherited, not re-decided: **no markers, ever** (GDD §8);
rewards are **actives / passives / cooldowns / XP only, no items** (GDD §7) —
which is precisely why D8's skill-trade is the only "fetch" shape possible;
sidebar tracker stays a *maybe* and is **not** in the first pass.

## 3. The retroactive-vs-after-accept cost analysis (what D3 rested on)

After-accept needs a per-quest counter map created at accept; retroactive needs
a lifetime per-species counter map (~64 species × one integer) plus a set of
talked-to conversant ids. Both are trivial in memory, both hook the same
existing kill/XP-attribution event, both add a small blob to step 8's character
record. The difference is not technical but authorial: retroactive trades away
"do it again" pacing for the diary-native "the deed already stands". D3 takes
that trade knowingly.

## 4. The quest object, the ledger, the events

**Content** (`api/quests/*.json`, one file per quest — loaded via a new
`contentSources` entry, see L5):

- `id`, `title`, `repeatable` (D6, unauthored)
- `stages[]` — each: `id`, `journal` (the diary prose appended on entry),
  and *either* `objectives[]` (kind `kill`/`harvest`/`talk_to`, species/npc,
  count; satisfied against lifetime counters per D3) with a single `next`,
  *or* nothing — a dialogue stage, advanced only by authored rows (D1).
  A stage with no outgoing edge is terminal; entering it completes the quest.

A quest file deliberately does **not** know who offers or advances it — those
rows live in the NPCs' interaction JSON and *reference* the quest (D9/D11: any
number of conversants can carry rows for the same quest; the file stays the
single source of truth for stages and prose, the world decides who talks about
it).

**Ledger** (per character, on the player, session-scoped until step 8):

- `quests`: quest id → ordered list of stage ids entered (+ completed flag).
  The *order* is stored, not just the current stage — branch paths differ, and
  the journal renders the entries for the stages this character actually walked
  (L6).
- `killCounts` / same-map harvest counts: species → lifetime count (D3, D4).
- `talkedTo`: set of conversant ids (stamped whenever a conversation session
  opens — retroactive talk-to needs it).

**Events:** the counter increments ride the existing XP-attribution point
(presence counts, D4 — one hook, no second crediting rule). After any counter
change or dialogue advance, the player's *running objective stages* are
re-checked; a satisfied objective stage advances, appends its successor's
journal text, and emits the journal event (the `EntityMessage.kind=Unlock`
channel is the named precedent — "a journal is the same ledger fed by the same
event", §42).

## 5. Dialogue integration (the container extension)

New vocabulary on the shipped interaction container — every piece an additive
case behind the existing hard-fail loaders:

- **Grant kinds** (beside `teach_skill`): `offer_quest` (quest id — moves
  not-started → first stage), `advance_quest` (quest id, from-stage, to-stage —
  the branch edge; carries the row's other grants as the reward), `grant_xp`
  (amount, the second GDD-legal reward — must ride the normal level-up path,
  L9).
- **Condition kind** (beside `min_level`): `quest_at_stage` (quest id +
  stage id | `not_started` | `completed`) — node-level, like all conditions
  today (L2). This is what makes an NPC's dialogue change as the quest
  progresses, hides the offer once running, and shows the turn-in only when
  earned. `present()`'s existing rule — an option whose `next` targets a
  condition-failed node is hidden — already propagates node gating onto rows.
- **Schema room lists on advance rows** (defined, validated, unauthored):
  `costs[]` with kind `unlearn_skill` (D8) and `consequences[]` (D10, kinds
  reserved for faction standing / hostility).

## 6. Journal UI + wire

- Quest definitions (titles + per-stage journal prose) are static content →
  served like the existing `/skills` & `/mobs` catalogs; the wire carries only
  ledger state (quest id + ordered stage ids + completed), full state at join +
  event-driven updates after. New enums/fields follow the §28 pin discipline;
  all four unions are pinned since R1.
- The journal panel: grouped by quest, running/completed sections (D7), prose
  only, `pointerdown` not `click` (the standing HUD gotcha). Expect §39's
  presentation rework to restyle it later — keep the first pass plain.
- No markers of any kind; no tracker in the first pass.

## 7. Landmines

- **L1 — the N1 trap is a prerequisite, not a nice-to-have.** A row that both
  *grants* and *navigates* is broken independently at both ends today
  (`archive/plan-entity-model.md` §8b: server grants rows `present()` hid;
  client swallows the grant's line when following `next`). Quest turn-in rows
  are exactly that shape — reward plus follow-up node. Fix both ends first
  (C0), red tests in the direction L24 originally asked for.
- **L2 — option-level conditions do not exist.** `jsonInteractionOption` has no
  `conditions` field (it hard-fails at boot since R1's `DisallowUnknownFields`
  — re-verify it does). Quest gating therefore works node-level + the
  hidden-inbound-option rule; if authoring pain demands option-level
  conditions, that is a C2 decision, not an accident.
- **L3 — node array order silently selects the greeting.** Quest-conditional
  greeting nodes must sit *above* the unconditional root or they can never be
  selected. Authoring discipline today; consider a loader lint in C2 (an
  unconditional node above a conditional one = the latter is dead).
- **L4 — the 255 index sentinel.** `option_index`/`grant_index` are `ubyte`
  with 255 = none and no loader count limit. Quest content is what grows option
  lists. Add the two-line guard (C0) before any content pass.
- **L5 — `contentSources` must gain `quests/`** or every quest edit silently
  no-ops (the standing rule: a missing directory hard-fails, an unregistered
  one is invisible). `cp-defs` embeds it; the boot-log content counts grow a
  `quests` figure and every harness pin updates.
- **L6 — store the path, not the position.** Grouped journal rendering needs
  the *ordered list of stages entered* per quest; branch paths differ per
  character, and "current stage" alone cannot reproduce the diary.
- **L7 — retroactive thresholds are lifetime totals.** An author writing
  `count: 8` must mean "has ever killed 8", not "kills 8 now". Manual-content
  note + review point until the opt-out flag exists.
- **L8 — wire discipline.** Pin every new enum value at birth (§28); journal
  updates ride the `EntityMessage` precedent rather than a new message family.
- **L9 — `grant_xp` goes through the front door.** XP from a row must use the
  same award path as kill XP (level-ups, band lock, announcements) — the XP
  cheat is the precedent that path can be driven externally.
- **L10 — abandon + mid-quest XP is a faucet (D13).** Abandoning resets to
  not-started while lifetime counters stand, so objective stages re-complete
  instantly on re-accept — any `grant_xp` on a *non-terminal* edge becomes
  loopable XP. Loader lint in C2: `grant_xp` is legal only on edges into a
  terminal stage (completion is protected by the completed set, which abandon
  never touches). `teach_skill` is idempotent and may sit anywhere.

## 8. Chunks

| chunk | scope | gate |
|---|---|---|
| **C0** | Interaction hardening: fix N1 at both ends (server: `applyGrant` refuses what `present()` hides, converse-direction test; client: a grant+navigate row keeps its authored line), add the L4 count guard. Zero behaviour change on shipped content. | `go test ./...` + vitest green; boot counts unchanged; existing conversation harnesses (`chunk3b-interact`, `chunk3b-ii-conversation`) green untouched |
| **C1** | The ledger + events, backend only: lifetime counters at the XP-attribution hook (D4), talked-to stamping, the `api/quests/` loader + `contentSources` entry (L5), stage engine (objective satisfaction against counters, advance, journal append, completion, abandon per D13), a `QUEST` debug cheat to inspect/drive it. | TDD on the engine (retroactive satisfaction at accept · presence-credited kill advances · branch edges exclusive · one-shot refuses re-offer · repeatable flag round-trips unauthored · abandon clears the path, leaves counters + completed set, re-offer works); sim battery byte-identical (nothing existing moves); boot `-content ../api` with the new count pinned |
| **C2** | Dialogue vocabulary: `offer_quest` / `advance_quest` / `grant_xp` grant kinds, `quest_at_stage` condition, `costs`/`consequences` schema room (D8/D10 — validated, unauthorable beyond parse), loader cross-validation (a row referencing an unknown quest/stage hard-fails), the L3 dead-node lint decision, the L10 `grant_xp`-terminal-only lint. | Evaluator tests per kind; L2 re-verification; a fixture quest walkable end-to-end through `present()`/`applyGrant()` in Go tests alone |
| **C3** | Wire + journal: catalog endpoint, ledger on the wire (join + event updates, L8), the journal panel (D7) incl. the abandon action (D13). | Codec round-trips; vitest on the journal view model; headless harness: offer → kill → auto-advance journal entry → turn-in → completed section; abandon → quest gone from running, re-offerable |
| **C4** | First authored content: 3–4 quests exercising every first-pass verb + **one branch with two turn-in NPCs and different rewards** (D9's proof), placed on existing conversants. | The content itself is the test: full harness pass per quest path, both branch legs; boot counts pinned; manual PO walk |

Sequencing per D12: C0–C4 run **before step 8**. C0 is independent and could
ship as a filler chunk any time; C1→C2→C3→C4 are ordered.

## 9. Open questions (deliberately not ruled this session)

1. **Un-learning** — what happens to an evicted skill's slot assignment,
   combinations that used it as an ingredient, and invested skill levels
   (evaporate = the tradeoff's teeth; refund = defanged)? Blocks authoring D8's
   skill-trade quests; nothing else waits on it.
2. **XP amounts** vs the Session-⑥ band lock — §42's "is XP alone motivating?"
   is partially answered by skill rewards + branch choice; the numbers are
   [PLACEHOLDER] like all numbers, sized in C4.
3. **Sidebar tracker** — GDD says *maybe*; not in the first pass, re-raise on
   playtest feedback.
4. **Discover-location** — needs named-area triggers; design it together with
   §41's clue-anchor scoping (and the GDD's open note on whether found clues
   write journal entries).
5. **Per-quest retroactivity opt-out** ("kill 8 *more*") — deferred until an
   author actually wants it.
6. ~~**Abandon / failure states**~~ — **RULED (PO 2026-07-29, D13): abandon
   yes, failure no.** Ledger removal op in C1, journal abandon action in C3,
   the L10 loader lint in C2.
7. **Multiple running quests** — assumed unlimited; revisit only if the journal
   UI drowns.

## 10. Step-8 handoff (what persistence must know)

The per-character record gains, in Actor vocabulary: `quests` (id → ordered
stage-path + completed), `killCounts` (species → lifetime count), `talkedTo`
(conversant ids). All per-character (D5); §36's bloodline / account scoping
question does not move quest state per this session's ruling, but step 8 should
confirm that alongside §41. Everything is small, append-mostly, and — per D12 —
already live by the time step 8 designs the schema.
