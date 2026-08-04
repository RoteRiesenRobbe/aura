# Plan: Camps — allegiance, exclusive teaching, and the doors it closes

> **Status: DESIGNED 2026-08-04 (design session) — no chunk built yet.** This is
> the design pass `backlog.md` §15 has been parked for since 2026-07-09, and the
> session `mobs/interaction.go` names in the boot error it raises today
> (*"camps get their own design session, so nothing may author one yet"*). It
> also answers backlog §2's composition question (*"do camp-membership checks
> ride the same condition seam?"* — yes, §4.2). Eight PO rulings taken as choice
> prompts. Every number and name is [PLACEHOLDER] unless marked.

## 1. What this is

A character may **join one of two rival camps**. Joining is permanent, teaches
abilities the rival's teachers never teach, and **closes the rival's questlines**
— Gothic's camps, minus the territory. Hostility is **social, never
attack-on-sight**: the doors that shut are dialogue doors.

Inputs, all read during the session:

- **`backlog.md` §15** (Camp/faction membership, Gothic-style) — captured
  2026-07-09 with nine deliberately unresolved questions. This plan resolves
  all nine; §3 records the ratification.
- **`backlog.md` §2** — its "composition" question asked whether camp checks
  could share the conditional-teaching seam instead of being a second
  mechanism. They can, and do.
- **`docs/plan-ascension.md`** — D1 (the world-parity power rule, reused
  verbatim here), D8 (per-faction ascension explicitly sanctioned as a later
  layer, *"the data model must not block it"* — this plan is what unblocks it),
  D9 (achievement-gated catalog entries), §5 (the catalog lives in content JSON).
- **`docs/archive/plan-quests.md` D8/D10** — the reserved cost/consequence
  vocabulary, named against exactly this session.
- **`docs/archive/plan-faction-flips.md`** — the runtime allegiance verbs, whose
  named future consumer (D10) is this feature.

### The find that shapes the whole plan

The previous design pass already chose the shape and left the slot open.
`backend/pkg/aura/items/mobs/interaction.go:228-233`:

```go
// ConsequenceFactionHostile flips a faction against the player — the named
// consumer the allegiance verbs of archive/plan-faction-flips.md were built
// for (D10). BLOCKED on the camps design session.
ConsequenceFactionHostile  ConsequenceKind = "faction_hostile"
ConsequenceFactionStanding ConsequenceKind = "faction_standing"
```

The authored JSON shape exists too (`jsonInteractionConsequence{Kind, Faction}`,
`:312`), riding an option beside its grants (`:284`), and is refused at boot by
`checkSchemaRoom` (`:597`) with a message naming this session. **C1 is largely
deleting that refusal and implementing what it was holding a place for.**

## 2. Decision ledger (all PO-ruled)

Rulings D1–D4 taken 2026-08-04 round 1, D5–D8 round 2.

- **D1 — power rule: WORLD-PARITY, the ascension D1 rule verbatim.** A camp's
  ability may be *genuinely powerful*, but must sit at a power level also
  obtainable elsewhere in the world; the rival camp's reward is a different
  ability of comparable weight. Never a strict upgrade over what the other camp
  or the open world offers. This resolves §15's "power calibration" question and
  keeps **one** power rule in the game rather than two — the ascension catalog
  and the camp teachers are calibrated by the same sentence.
- **D2 — joining is PERMANENT per character.** §15's original capture, ratified.
  The sanctioned way to see the other camp is **ascension and restart**, which
  makes camps a *feeder* for the ascension loop rather than a competitor to it.
  No atonement path, no re-flip.
- **D3 — state shape: a per-faction enum, friendly / neutral / hostile.** A
  sparse per-character map from faction name to one of three values; **absent =
  neutral**. Matches the reserved `faction_standing` name, expresses "friendly
  with one, hostile with the other" directly, and lets a quest anger a faction
  without joining anyone. A one-camp character holds two entries. Numeric
  reputation rejected — the game has no appetite for a rep grind.
- **D4 — exclusivity reaches teaching + quests + ascension rituals.** Camp
  teachers teach what rivals never teach; the rival's questlines close;
  camps unblock different ascension rituals (`plan-ascension.md` D8). **No
  territory and no attack-on-sight** — territory brushes the no-griefing pillar
  and needs machinery §4.4 prices out.
- **D5 — two rival human camps at the Z2 war front.** The shipped `human_army`
  garrison is one camp; **one new player-safe faction** (mercenaries / free
  companies [PLACEHOLDER name]) is the other. They disagree about how to fight
  the orcs. The orc war stays the backdrop and keeps running unattended on the
  existing mutual faction hostility.
- **D6 — neutrality is legal forever.** A character may decline both camps
  indefinitely and keeps the full non-exclusive teaching pool. Costs nothing:
  absent-from-map already *is* neutral (D3).
- **D7 — recipes: free composition, silent dead ends accepted.** ⚑ **Taken
  against the session recommendation, and the risk is recorded here rather than
  argued again:** recipes are secret and resolve against the spellbook
  (`skills.ApplyRecipes`, monotonic cascade), so a camp-exclusive ingredient
  **transitively gates every recipe downstream of it** with no in-game signal. A
  camp-B character can max every ingredient they can see and never learn why
  nothing combines. Accepted; revisit if playtest reports confusion. This
  resolves §15's "recipe interaction" question as *intended depth*.
- **D8 — sequencing: the primitive anytime, the camp content after ascension
  C1.** C1 below is independent and may land whenever. The *content* that closes
  a camp off waits until ascension exists, or "see the other camp" means
  rerolling for nothing — the sequencing hole §15 flagged.

## 3. Backlog & GDD amendments this plan carries

Applied as chunk C0 (docs-only):

1. **`backlog.md` §15** — mark **ratified → this plan**; its nine open questions
   answered here (power D1 · permanence D2 · pillar carve-out §3.2 below ·
   everything-findable §3.2 · sequencing D8 · recipes D7 · scope D4 · campless
   D6 · how many/where D5).
2. **`backlog.md` §2** — record that the composition question is answered: camp
   checks are one more `ConditionKind` on the same seam as `minLevel` and
   `quest_at_stage`, not a second mechanism.
3. **GDD §6** (the five unlock paths) — document the **exception**: camp-exclusive
   abilities are the first spellbook content deliberately unreachable for a given
   character. §15 asked "accept and document, or reject" — **accept**, and the
   documentation is the ascension escape hatch (D2/D8).
4. **GDD §5** — note that the world-parity rule (ascension D1) also governs camp
   rewards, so the two systems share one calibration sentence.
5. **`plan-ascension.md` §5** — one sentence so the catalog entry's gate field is
   general enough to name a faction condition; the faction gate is the **same
   gate slot as D9's achievements, not a parallel system**.
6. **`plan-ascension.md` §4 + its C1 bullet** — add **standing** to the
   "everything character-bound dies with the row" enumeration and name it in the
   C1 chunk description. ⚑ Not optional bookkeeping: see L0 in §4.1. The wipe is
   implemented by a chunk in *that* plan, so if it is not written down there it
   will not be written at all.
7. **`docs/README.md`** index line for this plan. ⚑ While there: `plan-ascension.md`
   is itself unindexed — its own C0 item 5, still pending.

### 3.2 The pillar carve-out, stated deliberately

§15 asked whether camp exclusivity breaks "no fixed class path" + free respec.
**Ruling: it does not, and the reason is that exclusivity sits at *unlock
access*, never at *point spending*.** Inside a camp the game stays fully
class-free and fully respeccable — every point a camp member has is still
refundable, every ability they own is still re-levelable. What a camp closes is
which teachers will talk to you. The pillar is "no fixed *path*", and a camp
member's path inside their camp is as free as it ever was.

## 4. The design

### 4.1 The state

A per-character map, faction name → `friendly | neutral | hostile`; entries only
for non-neutral factions. Its three consumers are all reads:

| consumer | mechanism |
| --- | --- |
| teaching | node condition hides the teacher's grant nodes |
| quests | node condition hides the offer / turn-in rows |
| ascension | catalog entry gate (`plan-ascension.md` D9's gate slot) |

It rides the quest ledger's **carry** legs and only those: the death-respawn
hand-back and the reconnect stash (`sys/state.go:544,708,803` — `SetQuestLedger`
after each), plus the persisted character record. ⚑ **Standing must never take a
wipe leg.** Death is a free respec in this game; it is not an escape from a
permanent choice, and "same as the ledger" is exactly the instruction that could
inherit the wrong leg.

It **wipes on ascension** with everything else character-bound
(`plan-ascension.md` §4 loss scope, and D12's precedent for discovered
locations) — otherwise a successor inherits a camp and D2's escape hatch is a
no-op.

⚑ **L0 — that wipe has no owner today, and this is the plan's one cross-doc
hazard.** Camps C1 cannot implement it: the ascension transaction is
`plan-ascension.md` C1, which is unbuilt and is the first writer of
`sacrificed_at`. If camps ship and ascension is later written from its own plan,
standing survives ascension silently and D2's escape hatch is dead. **C0 must
therefore amend `plan-ascension.md` itself** (§3 items 5–6), not merely note the
dependency here. This is the structural-assert silent-wiring class the repo has
already been bitten by three times (R2/R3 and `plan-mob-voicelines.md` L1) —
authored intent that loads green and does nothing.

### 4.2 Reading it — one new condition kind

`sys/interaction.go:729` `conditionsPass` gets **one case**:

```go
case mobs.ConditionFactionStanding:
    if !p.Standing().Is(c.Faction, c.Standing) { return false }
```

`learner` (`:358`) gets one accessor beside `QuestLedger()`. ⚑ **L1 — it must be
an O(1) map read.** `present()` runs *per tick per conversing player* and
evaluates node conditions on the way; `ledger.go:162` states this as a
requirement rather than a nicety, and the same rule binds here.

Everything else is free. Node conditions are node-level and reach rows through
present()'s existing rule that *an option pointing at a hidden node is itself
hidden* — so "this teacher will not teach you" and "this quest is no longer
offered" are the same authored mechanism, which is what backlog §2 asked for.

### 4.3 Writing it — the reserved consequence

The refusal in `checkSchemaRoom` (`interaction.go:597`) is lifted **for
consequences only**; costs stay refused (un-learning is still unruled).

⚑ **L2 — the consequence must be atomic with the quest grant it rides.**
`GrantKind.IsQuestKind()` (`:164`) already makes a quest op *lead* its option so
that a refused turn-in hands over nothing else. A standing flip must join that
same atomicity, or a re-clicked row can flip allegiance without advancing the
quest that was supposed to justify it.

⚑ **L2b — the flip is a FORCED-SAVE event, and it saves with the grant beside
it.** `ledger.go`'s `revision` comment draws this line already: accepting or
finishing a quest forces a save (`plan-accounts-implementation.md` §2 — visible,
memorable progress), while kill counters ride the 5-minute interval. A standing
flip is the most irreversible thing a character can do and it rides the *same
option* as a `teach_skill`. Left on the interval, a crash inside that window
leaves a character holding the camp ability at neutral standing, or standing
flipped with no ability — the two halves of one authored row, torn apart. They
persist in one unit or the row is a lie.

⚑ **L3 — the faction name resolves at LOAD, not at runtime**, the `teach_skill`
discipline. This is cheap here and the reason is worth recording: **factions load
before mobs and the mob loader already receives the faction registry**
(`cmd/aurad/loaders.go:114,129` — `mobs.RegistryFromFS(sr, fr, c, fsys)`), so
resolution happens inside the existing loader. This is the *opposite* of the
quest case, which needed `quests.CrossValidate` precisely because the registries
could not both stand at load time. No new boot pass.

⚑ **L4 — permanence is enforced by the server, not by authoring discipline.**
A consequence that would move an already non-neutral standing is refused at
runtime (and the option with it, per L2). D2 is a rule about characters, and a
rule only content can break is a rule that will eventually be broken.

### 4.4 What is deliberately NOT built: attack-on-sight

Priced during the session and ruled out of scope. Two facts make it a different
kind of work from everything above:

- Players are a **compile-time constant** `model.FactionAligned`
  (`model/player/player.go:706`). There is no per-player axis for a mob to read.
- Aggro acquisition is **not a runtime check you can add a condition to**. The
  aggro mask is baked into the mob's *physics sensor shape mask* at spawn
  (`model/mob/mob.go:258`, `aggroSensorMask`), so the broadphase filters it.
  Per-player hostility means per-(mob, player) resolution in the collision path.

That work lives in `model/mob/mob.go` + `sys/mob.go` — the same files backlog
§54's ghost-reference fix has just rewritten. If it is ever wanted, it is its own
plan, and it must not be scheduled next to that area's other work.

**What "hostile" means here, then:** the rival's teachers refuse you, their quest
rows vanish, their ascension ritual is closed. Their guards still ignore you —
which reads, correctly, as contempt rather than war.

### 4.5 The content (C2)

```
  Z2 FRONT
  ┌─────────────┐        ┌────────────┐
  │ human_army  │  ~~~   │   orc      │
  │ (shipped)   │  war   │ (shipped)  │
  └─────────────┘        └────────────┘
        ║ rivalry (NEW, social)
  ┌─────────────┐
  │ mercenaries │  ← one new player-safe faction
  │   (NEW)     │
  └─────────────┘
  player joins ONE → the other's quests close
```

`human_army` is already player-safe and needs no change: `friendlyToPlayers:
true`, and its `hostileTo` deliberately excludes `aligned`, so its soldiers never
proactively acquire a player and player damage skips them entirely. The new camp
is authored to the same profile.

⚑ **L5 — `hostileTo` is the mob-vs-mob axis and stays that way.** The camps'
rivalry is *social* and lives entirely on the new per-character axis; putting the
two camps in each other's `hostileTo` would start a second unattended war at the
front, which is not the design. The two axes never meet.

The chain itself needs no new quest machinery: two `advance_quest` rows out of
one dialogue stage into different `toStage`s is the shipped branching design
(*"several rows on several NPCs may move the same stage to DIFFERENT next stages
with different rewards, which is how 'two NPCs complete the quest' is content
rather than a feature"* — `interaction.go:141`). The camp ability rides
`teach_skill` on the same option as the branch; the standing flip rides the same
option as a consequence.

## 5. Schema impact

**No new migration pair.** Standing is a new `flag_key` in the existing generic
`game.character_flags` (migration `000001`, lines 174-188), whose comment states
the intent outright: *"Generic key/value so a new flag or quest structure is an
insert, not a migration."* The quest ledger already occupies three rows per
character there; standing is a fourth, its JSONB value carrying the sparse map.

Consequences for the standing rule:

- `store/state.go:111,221` are the existing writer and reader — a new key, not a
  new code path.
- The key must be namespaced so it cannot collide with a quest id.
- The standing row and the spellbook row it was granted with must be written in
  **one unit, on a forced save** (L2b) — the row is atomic in memory or it is
  atomic nowhere.
- Store tests need `AURA_TEST_DB_URL` (real Postgres). A permanence rule that is
  only tested in memory is a rule that has not been tested.
- Faction names, camp abilities, and the questlines are **content JSON** —
  `api/factions/`, `api/mobs/`, `api/quests/`, all already in `contentSources`.
  No new content directory, so the "silently no-ops" landmine does not apply.

## 6. Chunk breakdown

- **C0 — docs sync** (§3). Docs-only, small. Anytime.
- **C1 — the standing primitive. No content.** The per-character state + its
  stash and persistence path; `ConditionFactionStanding` in the parse table and
  in `conditionsPass`; the consequence refusal lifted and implemented (costs stay
  refused); load-time faction resolution (L3); the permanence refusal (L4); the
  forced save (L2b). Done
  when a Go test can flip a fixture character's standing through an authored
  conversation row, watch a node disappear, and see the state survive a reload.
  **Independent of ascension — may land whenever** (D8).
- **C2 — the camps.** The new faction JSON, the camp NPCs and teachers, the
  branching chain, the two camp abilities (D1-calibrated), the rival's rows
  gated. **After ascension C1** (D8). Verified with the `verify` skill.
- **C3 — legibility + the ascension handoff.** Where a player *sees* their
  allegiance (§8 open question), and the faction gate on the ascension catalog —
  which is a one-field addition in `plan-ascension.md`'s C3, not work here.

Each chunk its own execution session, per working style.

## 7. Test strategy

- **C1:** loader tests both ways — an authored consequence now loads, an unknown
  kind still fails at boot, an unknown *faction name* fails at boot (L3), a cost
  still fails. Condition unit tests including the fail-closed nil path.
  Permanence: a second contradicting consequence is refused and takes its whole
  option with it (L2/L4). Round-trip vs **real Postgres**, including that a flip
  is durable *immediately* rather than at the next interval, and that it lands in
  the same unit as the ability granted beside it (L2b). Death and reconnect carry
  standing, and neither wipes it (§4.1). An allocation check on
  the `present()` path, since the standing read joins a per-tick evaluator (L1).
- **C2:** content tests that the rival's rows are unreachable to a member and
  reachable to a neutral; a Playwright leg that walks the branch, takes the
  ability, and confirms the rival teacher's node is gone.
- **Both:** sim batteries must stay **byte-identical** — nothing here touches
  combat — and boot must stay 0 errors 0 warnings.

## 8. Open questions & deferred

- **Where does a player see their allegiance?** Nothing in the HUD carries it
  today, and a permanent choice the player cannot re-read is a bad permanent
  choice. Candidates: the journal, the character panel, an NPC bark. **PO call at
  C3** — and note this is the only part of the feature that might need a wire
  addition; C1 and C2 need none.
- **The camps' names, lore, and their two abilities** — content pass, with D1 as
  the calibration rule. How many camp-exclusive abilities each: [PLACEHOLDER].
- **Does neutrality get its own teachers**, or only the shared pool? D6 makes
  neutrality legal; whether it is *interesting* is a content question.
- **A third camp later** — the state shape (D3) already permits any number; only
  content limits it.
- **Deferred by ruling:** attack-on-sight hostility (§4.4) · territory and world
  access (D4) · atonement / re-flip (D2) · numeric reputation (D3) · a
  quest-path condition kind — with first-class standing chosen, reading
  `Progress.Path` is no longer needed for camps, so it is **not** built (YAGNI;
  intake round 8 item 2 still wants its own `running` sentinel, unrelated).

## 9. Proposals adopted without a choice prompt (PO may veto any)

- **P1 — `faction_standing` is the one verb; `faction_hostile` becomes a
  tombstone.** Two ways to say one thing is the DRY violation this codebase
  already refuses elsewhere. The retired kind is kept solely to reject it with a
  message naming its replacement — the `trigger` / `blockedLine` precedent
  (`interaction.go:244,267`), which exists because "unknown field" reads as a
  typo rather than as a retirement.
- **P2 — the consequence gains a `standing` key** (`friendly` / `neutral` /
  `hostile`), so one verb can express all three moves.
- **P3 — the condition is symmetric with the consequence**: same `faction` +
  `standing` payload, so an author writes the same two keys to test a state and
  to set it.
- **P4 — standing wipes on ascension** (§4.1), with everything else
  character-bound.
- **P5 — no new grant kind.** A camp ability is a normal `teach_skill` on a node
  the condition gates. Camps add exactly one condition kind and one consequence
  kind, and nothing else to the vocabulary.
- **P6 — C1 ships with no content authored against it.** The primitive lands
  proven and unused; C2 is the first author. This is what makes D8's "primitive
  anytime" safe.

## 10. Chunk ledgers

*(appended per execution session — none yet)*
