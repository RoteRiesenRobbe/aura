# Plan: the conversation & journal pass — what the quest pass surfaced

**Status: PLANNED 2026-07-30 (docs only, no code). Four chunks Q1–Q4, none
started.** Origin: the PO's in-game walk of quest chunk C4 the same day — *"this
works very well and can be read as quests and understood. No major bugs, but
some issues and change requests."* Thirteen items, every one verified against
the running game before this doc was written (measurements below are real, not
estimates).

Read together with: `archive/plan-quests.md` (the system these items sit on —
D7 the journal shape, D14 the minimal catalog, D17 the banner, and §15's
authoring findings), `archive/plan-entity-model.md` §6b/§11 (the conversation
panel, D15–D23, and R2 which Q1 partly reverses), and
`plan-playtest-feedback.md` §Intake round 7 (the intake record).

---

## 1. The three PO rulings that shaped this plan (2026-07-30)

| # | Ruling |
|---|---|
| **R1** | *(amended by the PO after the first ruling — the amendment is the one that stands)* **A refused row says nothing, and the panel's top text is whatever node the player is standing on.** `blockedLine` is deleted outright and **nothing replaces it**: a locked row stays greyed with its level wall, and clicking it simply does nothing — the greying already says it. The idea of a per-NPC fallback line is withdrawn; what carries the meaning instead is **structure**. Every node speaks the text belonging to where the player is: the greeting at root, a generic *"What do you want to learn?"* over the teaching list, **the quest's own brief over a quest node** — and Back restores the previous node's line. Follow-up questions are answer-nodes reached by a row and left by Back. Quest offers live *behind* rows on the root (*"Any issues around here?"*), several per NPC if wanted. ⚑ **And an Accept row must disappear once the quest is accepted while its sibling questions stay askable** — the one thing today's model cannot express, and the reason Q1 has real system work in it. NPCs may still greet differently by state (e.g. after a quest completes); that is node conditions, which already exist. |
| **R2** | **The server sends the finished objective line.** `"3/8 Wolves slain"` / `"Talk to the Hermit"` rides `GameState` beside the stage path; the client renders it verbatim. Keeps D14's minimal catalog intact — no thresholds leak for stages the player has not reached — and keeps display names on the one server-side source. |
| **R3** | *(amended by the PO — the amendment stands)* **The Lost Lamp becomes the simple version, and the Lantern becomes quest-only.** The `Lantern` unlock is **removed from Kobold and KoboldRanged** (0.05 each); the aura is now obtained one way — from the Lampless Traveller, for killing 6 kobolds. The lore is straightforward: *"The kobolds are unbearable. Kill them and the lamp is yours."* He has a lamp and hands it over, which is what makes the fiction work at all now that no kobold carries one. Rejected earlier: skill-as-payment (needs `unlearn_skill`, blocked on the un-learning question) and replacing the quest outright. |

## 2. What was measured, not assumed

Every claim below was verified in the running game on 2026-07-30 (probe scripts
+ screenshots). Recorded because several of these items look like content
problems and are not, and one looks systemic and is not.

- **The "too low" line.** Clicking a locked row *replaces* the greeting with
  that option's `blockedLine`. Two defects underneath: it is **one line per
  OPTION**, so the Village Healer answers *"Come back later"* identically for
  FirstAid @2 and Revive @8 (they share one multi-grant option); and there is
  **no "nothing available" concept at all** — an NPC's greeting is its only line.
  *(R1 as amended deletes the mechanism rather than repairing it: the greying is
  the message, and the panel's text belongs to the node.)*
- **Option-level conditions do not exist** (`jsonInteractionOption` has no
  `conditions` field — `archive/plan-entity-model.md` L2, which said the day
  authoring pain demanded them would be a decision rather than an accident).
  That day is here: R1's *"Accept vanishes, its sibling questions stay"* is
  exactly a per-ROW condition on a shared node. §4.1 takes it without adding the
  field.
- **Combat blocks talking at three gates** (`sys/interaction.go:161`, `:188`,
  `:311`), and the window is `combatRegenGraceTicks` = **100 ticks = 3.33 s**,
  re-stamped by *any* combat action **including the player's own aura ticking on
  anything**. So a player with a damage aura on is un-talkable for the whole
  fight plus 3.3 s afterwards. That is why it reads as a bug rather than as a
  rule.
- **Objective tracking is absent on both sides.** The catalog omits objectives
  and thresholds by design (D14 — "the answer key"), and the wire carries stage
  ids only. Neither end can render `3/8` today.
- **Scrollbar bleed is measured:** `bodyRightGap = 0px` on both
  `.conversationBody` and `.journalBody` — text runs flush under the scrollbar
  the moment one appears.
- **Journal overlap is measured:** at a 1280×800 viewport the journal spans
  y=120..**680** while the aura/cooldown strip starts at y=**630** — a 50 px
  overlap, plus it covers the spellbook column on the left.
- **⚑ The Shaman is CONTENT, not systemic.** His definition has one node with
  one multi-grant option, and D17 auto-expands that into a row per skill — the
  deliberate path for NPCs never re-authored into trees. **Six NPCs are still in
  that shape:** Shaman, VillageHealer, CityGuard, Miner, Lamplighter, Dog.
- **⚑ There is no item system.** §28 deleted it; "the lamp" is the **Lantern
  skill unlock**, still a 5 % Kobold drop. The quest's lore break is therefore
  real and cannot be fixed by making it an item fetch.
- **⚑ Damage-at-start needs no new concept.** The milestone table already means
  "guaranteed unlock at level N"; it simply never fires at creation
  (`applyMilestoneUnlocks` has one call site, on level-up, `player.go:692`).

## 3. Chunks

| chunk | scope | gate |
|---|---|---|
| **Q1** | **The dialogue system.** R1: delete `blockedLine` and make a locked row **inert** · **a quest row is shown iff its ledger op would succeed** (what makes Accept vanish while its siblings stay, §4.1) · talking in combat (all three gates, §4.2) · the synthetic **"Leave."** row at root · scrollbar padding on both panels. | Go tests per rule, incl. the **inverted** entity-model R2 combat tests and a both-ends test that the show-rule and the apply-rule cannot disagree; vitest on the Leave row and the inert locked row; `chunk3b-ii-conversation` + `chunk3b-interact` updated *with* the change and green; boot counts unchanged |
| **Q2** | **Objective tracking (R2).** `QuestProgress.objectives` on the wire (appended, pinned), server-side composition from the current stage, the authored `tracker` override, client render. | Codec round-trip; Go tests on composition incl. the override and dialogue stages; **no new per-tick allocation** (§4.4); harness leg asserting `0/8 → 3/8` moves on real kills |
| **Q3** | **The journal panel.** Two-pane list/detail (D7 restated), sizing that never overlaps the HUD, abandon relocated to the detail pane. | vitest on the selection model (incl. selection surviving the per-tick re-send and the selected quest being abandoned); `chunkC3-journal` rewritten to the new DOM; screenshot proving no overlap at 800 px and 1440 px |
| **Q4** | **The content pass — a RESTRUCTURE, not a trim.** Every conversant re-authored to R1's shape (greeting at root · teachings behind one row under their own line · each quest behind its own row, its brief as that node's text, Accept + follow-up answer-nodes) · all quest prose ≥50 % shorter · R3's lamp rewrite **plus removing the Lantern drop from both kobolds** · Damage at level 1 (milestone entry + the creation-time call) and the crier's Damage row removed. | `chunkC4-quests` green on the rewritten content; boot counts; the skill-inventory regeneration showing Lantern quest-only and Damage as a milestone; PO read-through |

**Sequencing: Q1 → Q2 → Q3 → Q4.** Q1 first because R1 changes what every
conversant must author, and Q4 is the pass that writes it properly. Q2 before Q4
because a stage's authored `tracker` override is content Q4 writes. Q3 is
independent and can move.

## 4. Design notes per chunk

### 4.1 Q1 — refusals, and the row that has to vanish

**Two rules, and between them they deliver everything R1 describes without a
single new authored field.**

**① A locked row is inert.** `blockedLine` is deleted from the schema and the
loader rejects it as a **tombstone** (the retired-`trigger` precedent, L22) —
a stale key must say what replaced it rather than fail as an unknown field. The
loader rule *"blockedLine is required when a grant has a requiredLevel"*
(`interaction.go:416`) goes with it. `present()` stops putting a reply on a
locked row, and the client stops sending one; `applyTeach`'s
`return opt.BlockedLine, nil, true` becomes an ordinary silent refusal, which is
the path a stale click already takes. **No wire change** — the reply field simply
stays empty on those rows.

**② A quest row is shown iff its ledger op would succeed.** This is what makes
*"Accept disappears once accepted, its sibling questions stay"* work, and it
needs no option-level conditions.

⚑ **It is not a new idea — it is D17's existing rule, applied to a second grant
kind.** `presentOptions` already hides a teaching the player has learned
(`if sc.HasDiscovered(...) { continue }`); an `offer_quest` row for a quest that
is already running is *exactly* the same statement, and an `advance_quest` row
whose edge the ledger cannot walk is the turn-in version of it. So the schema
gains nothing, the authoring gains nothing to remember, and the panel gets the
behaviour for free — including the turn-in row that should only appear when it
can actually be taken.

⚑ **The show-rule and the apply-rule must be ONE function.** `applyQuestRow`
already decides whether the ledger accepts an op; if `present()` grows a second,
parallel copy of that judgement, the two will drift — and that is N1 verbatim,
the defect C0 shipped to fix at both ends. Extract one predicate
(`ledger.CanApply(grant)`), call it from both, and pin it with the converse test
C0 already established (*everything applyGrant accepts was on screen*).

**What this leaves node conditions for:** genuinely state-dependent *greetings*
("different fallback lines based on whether a condition is met" — e.g. an NPC who
greets you differently once a quest is done). `quest_at_stage` stays, used for
what it is good at, and C4's habit of gating an entire offer node on
`not_started` becomes unnecessary — which incidentally retires the greeting
hijack `archive/plan-quests.md` §15 recorded, and with it the TownCrier's buried
first ability.

**Option-level conditions stay unbuilt** (L2). If authoring later needs a row
gated on something that is *not* a quest op — a level wall on a navigation row,
say — that is the moment to add the field, deliberately, with this note as the
reason it was not added now.

### 4.2 Q1 — talking in combat

Delete all three gates. What still closes a conversation: range, death,
disconnect, and the actor despawning.

- ⚑ **R2 of `plan-entity-model.md` exists only to make the badge agree with
  these gates.** Removing them removes its reason to exist — but its Go tests
  are the only eyes on the offer path, so they must be **inverted, not deleted**
  (assert the offer *survives* combat).
- ⚑ `chunk3b-ii-conversation`'s deliberate SKIP (*"being hit closes the panel"*)
  becomes obsolete and must be **deleted with this chunk**, not left to rot.
- D21's original safety rationale ("a player cannot be left reading dialogue
  while something eats them") is explicitly overruled: nothing is blocked while
  the panel is open — movement, auras and cooldowns all keep working — so the
  PO's read is that the gate causes the bug it was meant to prevent.

### 4.3 Q1 — the "Leave." row

Client-only, ~10 lines. Rendered last, **only at root** (`!canGoBack`, where
Back is absent), doing exactly what ✕ does; ✕ stays. It is synthetic, so it
carries no `optionIndex` and must short-circuit before `take()` sends anything.
⚑ It changes the row list every harness asserts at a root node — update those
assertions in the same chunk (by name, never by count).

### 4.4 Q2 — composing the objective line

- Shape: `objectives: [string]` on `QuestProgress`, appended at the table end,
  values pinned (§28).
- Derived for the **current stage only**, from its objectives:
  `kill`/`harvest` → `"3/8 Wolves slain"`, `talk_to` → `"Talk to the Hermit"`.
  Display names come from `skills.DeriveDisplayName(def.Name)` — the same source
  `/mobs` serves, per §35 C3's ruling that there is one display-name path.
- **Authored override:** an optional `tracker` string on a stage wins over the
  derived line. It is what dialogue stages use (`"Return to the crier"`, which
  has no machine-readable target) and what rescues wording the deriver gets
  wrong. ⚑ The obvious ugly case is plural: `"3/8 Wolf slain"`. The override is
  the answer; do not build a pluralisation engine.
- ⚑ **The per-tick allocation trap.** `Ledger.Snapshot()` was written to
  allocate nothing for a quest-less player, and the whole ledger is
  event-driven by design (the idle-alloc discipline, `fe0044d0`). Composing
  strings every tick would undo that. **Cache the composed line on the progress
  entry and recompute only when a counter or the stage changes** — the same
  event-driven shape as the rest of the ledger.

### 4.5 Q3 — the two-pane journal

- Left: the quest list, running and completed sections (D7's grouping survives —
  it moves from stacked sections to a list). Right: the selected quest's diary,
  its objective line (Q2), and Abandon.
- ⚑ **Selection is client state over a per-tick re-send**, exactly the hazard
  `ConversationModel.update()` already solves: the ledger arrives ~30×/s, so
  selection must not reset on an unchanged snapshot, and the view signature must
  include it or the detail pane rebuilds under the player's cursor.
- ⚑ Selection needs a defined fallback when the selected quest leaves the list
  (abandoned, or completed and thus moved sections).
- Sizing invariant, stated rather than a magic number: **the panel may never
  overlap the bottom HUD strip or the spellbook column.** Measured today at
  680 px vs a strip starting at 630 px.

### 4.6 Q4 — content

**Q4 is a restructure.** R1 describes a shape every conversant should have, and
only the Emberkeeper is close to it today:

```
root                     "You there! Good. Somebody who still walks toward trouble."
├─ "Teach me something." → teachings   "What do you want to learn?"
│                            Damage                     (available)
│                            Recall            level 3  (greyed, inert)
├─ "Any issues around here?" → wolves   <the quest brief, in the NPC's voice>
│                            "I'll do it."              (Accept — vanishes once taken)
│                            "How many?"      → answer node → Back
│                            "Why so bold?"   → answer node → Back
└─ "Leave."
```

- Quest prose ≥50 % shorter across all 16 stages, and **geographic claims
  removed** unless the PO supplies real ones — §15's prose invented directions
  against a world layout the author could not see.
- The six flat NPCs get real trees; that is also what stops a first window that
  is nothing but a wall of greyed skill rows (the Village Healer, the Shaman and
  the Miner all open that way today).
- Dead-end navigation rows removed (the traveller's post-completion *"Something
  else."* leading to a node with nothing on it).
- **R3's lamp rewrite**, and it is two edits, not one: the quest text, **and
  deleting the `Lantern` unlock from `kobold.json` and `kobold-ranged.json`**
  (0.05 each). ⚑ Lantern then has exactly **one** source in the world. That is
  the point — a guaranteed reward instead of a 5 % roll on the gate to the
  tunnel — but it means `content-skill-inventory.md`'s reachability sweep must be
  re-run, and the quest becomes load-bearing for an aura rather than a bonus.
- ⚑ **One authoring question the shape raises:** should a quest node's brief
  *change* once the quest is running (*"Eight wolves. Get to it."* instead of the
  pitch)? Node conditions can do it, but only by splitting the node in two — and
  the follow-up question rows would then have to be duplicated or hung off a
  shared child. Cheapest honest answer for the first pass: **one brief per
  quest node**, written so it reads correctly before and after acceptance. Revisit
  if it grates.
- ⚑ **A name tension to resolve in the writing, not the code:** the NPC is
  *Lampless* Traveller and now hands over a lamp. Lore it away (he is done
  travelling at night / the kobolds are why he stopped) rather than renaming him —
  the definition's `name` also resolves his `EntityType`, so a rename is a wire
  enum change for a cosmetic gain.
- **Damage at level 1:** author `{"level": 1, "skillName": "Damage"}` and call
  `applyMilestoneUnlocks(1, level)` at character creation. ⚑ Two details: the
  call must tolerate a client that is not wired yet (the unlock banner fires
  from there), and it is idempotent by `HasDiscovered`, so the death/reconnect
  stash path is safe. Also fixes the stale comment at `player.go:65` claiming a
  fresh spawn has Harvest. The crier's Damage row goes; `content-skill-inventory.md`
  gains a *milestone* source for Damage and loses an NPC one.

## 5. Landmines

- **L1 — the R2 inversion.** See §4.2: the combat tests are the only eyes on the
  offer path. Invert them; deleting them silently removes the coverage.
- **L2 — harness assertions move with Q1 and Q3.** The Leave row changes every
  root row list; the two-pane journal changes the journal's whole DOM. Both
  scripts are owned by these chunks (`chunk3b-ii-conversation`, `chunkC3-journal`)
  and must be updated *in* them — the standing rule, and the one this project has
  paid for twice.
- **L3 — the show-rule and the apply-rule for quest rows must be one function.**
  §4.1 ②. Two copies of "can the ledger take this?" is N1 in a new costume, and
  N1 is the defect C0 was written to close at both ends.
- **L3b — deleting `blockedLine` deletes content, silently, unless the loader
  speaks.** Nine NPCs author eleven of them. A tombstone that names the
  replacement is the difference between "the panel got quieter" and "somebody
  understands why".
- **L4 — Q2 must not allocate per tick.** §4.4.
- **L5 — the objective line is per-player state and must stay off the catalog.**
  R2 chose the wire precisely so thresholds for unreached stages stay unserved;
  an "optimisation" that moves them into `/quests` reverses D14 by accident.
- **L5b — R3 makes a quest load-bearing for an aura.** With the kobold drop gone,
  `the-lost-lamp` is the *only* source of Lantern, and Lantern is the light the
  tunnel is designed around. Anything that makes the quest unfinishable —
  abandoning it is fine (it re-offers), but a content edit that breaks the chain
  is not — takes the tunnel with it. Worth a content test asserting Lantern has a
  source at all, which is the reachability guarantee `content-skill-inventory.md`
  states in prose and nothing enforces.
- **L6 — Damage-at-start changes the onboarding claim in three docs**
  (`content-skill-inventory.md`'s "the first ability comes from the TownCrier",
  `content-npcs.md`, the GDD §5 peasant-onboarding note). Update them with Q4 or
  they document a world that no longer exists.

## 6. Open questions

1. **Does the objective line show for completed stages too**, or only the
   current one? (Recommendation: current only — a completed stage's diary entry
   is already the record of it.)
2. **Should the two-pane journal remember its selection across open/close**, or
   always land on the first running quest?
3. **Does the simplified lamp quest keep the Miner in the middle?** R3's lore
   (*"kill them and the lamp is yours"*) needs no directions leg, so the natural
   reading is a three-stage quest with no Miner. ⚑ But his row is the game's
   **only non-terminal `advance_quest` edge**, and dropping it leaves that
   mechanism with no content exercising it (and
   `TestContent_TheLampChainHasANonTerminalDialogueEdge` with nothing to pin).
   Recommendation: drop it here — the lore is better without it — and give the
   edge to a quest that actually wants a middle step, rather than keeping a leg
   alive to satisfy a test.
4. **Extending `kill` objectives to a species family** (`Wolf` +
   `DireWolf`/`EliteWolf`/`AlphaWolf`) — the PO asked, and answered: not now.
   Recorded because the cheap version is a species *list* per objective, while
   the tempting shortcut is wrong: the `wildlife_predator` faction also contains
   Bear and DireBear, so "every wolf" needs an authored family tag rather than a
   faction.
