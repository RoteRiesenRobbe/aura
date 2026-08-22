# Plan: the first release map

> **Status: DIRECTION SET 2026-08-22 (PO session). Nothing built. The map itself
> is NOT yet designed - this doc records the two decisions taken today and the
> mechanism they rest on; the map owes its own planning session (§7).**
>
> Supersedes `docs/archive/plan-test-world.md`, dropped the same day. It also
> carries the ruling that deferred `docs/plan-camps.md`, so read this before
> either of those.

## 1. What this is

The next map we build is **not** another prototype map. It is the first pass at
a **release-style map**: release-ready content, quested throughout, and built
around a commitment structure that gives the game its first real reason to be
played twice.

Two things were decided on 2026-08-22, and this doc is their home:

1. **Camps are content, not a system.** Everything the camp design actually
   needs is already expressible in the shipped quest and conversation
   vocabulary. `plan-camps.md` and its standing primitive are **deferred**.
2. **The prototype map is dropped.** `plan-test-world.md` was a throwaway
   opt-in test map whose job was to show every feature at once. The next map
   is the release iteration instead, so that plan will never run.

The camp structure is *why* these two land together. A map whose content is
organised around "prove yourself to three camps, then commit to one" is not a
feature showcase; it is a first release map, and it wants release-grade
content rather than a density experiment.

## 2. Decision ledger

PO rulings, 2026-08-22.

- **D1 - camps ship as quest content, in the shipped vocabulary.** Camp
  membership is a completed quest; exclusivity is a `quest_at_stage` gate on
  the nodes that offer, teach and turn in. No new condition kind, no new
  consequence kind, no new state, no Go, no schema. §3 is the full mechanism.
- **D2 - `plan-camps.md` is DEFERRED, not cancelled.** What its C1 primitive
  buys over D1 is a genuinely *hostile* standing, the ability to lose standing
  without joining anyone, and permanence enforced by the server rather than by
  authoring discipline. The design does not need any of the three today. The
  plan stays in `docs/` with a banner naming those three as its revival
  triggers.
- **D3 - the standing primitive's leftovers defer with it.** No standing state
  exists, so there is nothing for a wipe assert to guard; `plan-camps.md` L0
  and CLAUDE.md's "camps owns the standing wipe" bullet are moot while D2
  holds. ⭐ **The structural wipe becomes load-bearing in the other
  direction**: the quest ledger lives in `game.character_flags` keyed
  `character_id`, so a successor character starts with every quest
  `not_started` - which is exactly what reopens all three camps after
  ascension, with nothing authored to make it happen. **The change to guard is
  therefore the opposite one**: moving the quest ledger per-account or
  per-slot (the way `bloodline_unlocks` is keyed) would silently kill the
  reroll.
- **D4 - the prototype map plan is dropped**, archived rather than deleted:
  its four code facts and its density measurements are the only survey work
  anyone has done on map size and they transfer (§5).
- **D5 - the next map is the release iteration.** Release-style, release-ready
  content. Its slot in the execution order is an open call (§7).

## 3. The mechanism

### 3.1 Two ledger rules that shape every camp file

Both are properties of the shipped engine, both were confirmed by reading it,
and neither is obvious from the authoring surface. They are written up for
authors in `manual-content-authoring.md` §6 ("Recording a choice, and gating
one quest on another"); the design consequences are here.

**Rule 1 - a durable choice must be its own quest id.** `Ledger.MatchesStage`
(`quests/ledger.go:205`) answers a bare stage id through `ok && p.Running &&
lastPath == want`. Entering a terminal stage sets `Completed` and clears
`Running`, so **a terminal stage id never matches again**. One quest
`the-pledge` with three terminal endings is therefore unreadable the instant
it completes. **One quest per pledge, one quest per ending.** Branch stages
inside a quest stay useful for live branching (the `wolves-on-the-road`
two-NPC shape) but stop being readable at completion.

**Rule 2 - the lock seals on completion, not on acceptance.** `not_started` is
`!Running && !Completed`, and abandoning clears `Running` without setting
`Completed`, so a rival gated on `{pledge-iron, not_started}` reopens if the
player abandons the Ironline pledge. Design around it rather than fight it:
the pledge quest carries **no objective stage** and is accepted and turned in
inside one conversation (the panel re-presents every tick, so the turn-in row
appears immediately after the accept row is taken). The reversible window is
one conversation, and it reads as intent: you can walk away right up until you
have sworn.

### 3.2 The arc

**Phase 1 - discovery.** Ordinary ungated quests at every camp, exactly what
ships today. `minLevel` and `kills_this_life` are available where a camp wants
"prove you have bled the enemy" without spending a quest on it.

**Phase 2 - proving quests, per camp, open to everyone forever.** Two or three
each, no gates. This is the phase where a player works for all camps at once,
and it needs nothing new.

**Phase 3 - the pledge.** The offer node AND-s its own proof gate with the
rivals' exclusion:

```json
{ "id": "pledge_iron",
  "conditions": [
    { "kind": "quest_at_stage", "quest": "iron-hold-the-line",   "stage": "completed" },
    { "kind": "quest_at_stage", "quest": "iron-scout-the-barrow","stage": "completed" },
    { "kind": "quest_at_stage", "quest": "pledge-ashfolk",       "stage": "not_started" },
    { "kind": "quest_at_stage", "quest": "pledge-covenant",      "stage": "not_started" }
  ],
  "options": [ { "text": "I pledge myself to the Ironline.",
                 "grants": [ { "kind": "offer_quest", "quest": "pledge-ironline", "line": "..." } ] } ] }
```

Complete `pledge-ironline` and the other two pledge nodes fail `not_started`
forever. `applyGrant` re-checks the node's conditions on every click
(`sys/interaction.go:1093`), so the exclusivity is enforced per action rather
than trusted to the client.

**Phase 4 - the camp finale, and a door the player can read.** Each camp's
endgame chain sits behind a node gated `{pledge-X, completed}`, reached by a
root row carrying `lockedWhenGated: true`. That is the shipped
FrontAscensionStone shape (root row to a gated `catalog` node), and
`describeConditions` renders the wall in words. An Ironline player at the
Ashfolk fire reads:

> *The Ashfolk's way - locked: complete "Pledge to the Ashfolk"*

⚑ **Gate the finales on `completed`, never on `not_started`.** The renderer
phrases `completed` as `complete "Title"` and `not_started` as the unusable
`"Title" at "not_started"`. So the pattern is: **rival pledge offers hide
silently, rival finales lock and name themselves.** A neutral player reads the
same locked row as a signpost of what pledging would buy.

Three finale quest ids means three completions, so any NPC anywhere can react
to which ending a character took.

**Phase 5 - the second run.** Free, structurally (D3). Ascension makes a new
character row, the ledger resets, all three pledges reopen. On top of it
`bloodline_ascensions` is readable, so a second life can be acknowledged
without being repeated: a returning-walker greeting, a row that lets a veteran
line skip the proving quests, or an ending only a second life reaches.

### 3.3 What else falls out at no cost

- **Camp-exclusive teaching.** Teach rows sit on nodes; gate the teacher's
  node `{pledge-X, completed}` and the rival's teachers stop teaching. That is
  `plan-camps.md` D4's teaching leg with no code.
- **Camp-gated ascension rewards.** `api/ascension/lantern.json` proves the
  catalog's gate slot accepts `quest_at_stage`, so "each camp unblocks a
  different ascension reward" is authorable now. D4's third exclusivity leg,
  also free.
- **Crash durability.** `plan-camps.md` L2b worried about a standing flip torn
  from the ability granted beside it. Quest accept and quest finish are
  already forced-save events, so quest-as-membership inherits that atomicity
  rather than needing it built.
- **Legibility.** A completed *Pledge to the Ironline* in the journal is a
  serviceable answer to `plan-camps.md` §8's open question, which the real
  feature still owed.
- **Recipes.** A camp-exclusive ability transitively gates every recipe
  downstream of it with no in-game signal, exactly as `plan-camps.md` D7
  intends. Nothing changes.

### 3.4 The one thing that gets weaker, and its mitigation

`plan-camps.md` L4 says permanence must be a server rule because "a rule only
content can break is a rule that will eventually be broken". Under D1 the
per-click check is server-side, but the **invariant** is a content pattern:
every pledge offer node must carry every rival's `not_started`. One missing
condition silently reopens a camp.

**Mitigation, and it belongs in the map's first chunk:** a pin in
`backend/pkg/aura/quests/content_test.go` (the file that already holds the
content censuses) asserting that each pledge offer node carries the full rival
set. That converts a silent content break into a red test, which is the honest
downgrade from a server rule.

## 4. What deferring `plan-camps.md` actually costs

Three things, none of them needed by §3:

- **No hostile state.** Quests only accumulate, so nothing can *anger* a camp.
  A camp can refuse you for having joined a rival and for nothing else.
  ⚑ Note §4.4 of that plan already ruled out attack-on-sight, so "hostile"
  there meant refusal too; the practical loss is small.
- **No losing standing without joining.** D3's friendly/neutral/hostile map
  expresses "you insulted the Ashfolk" directly; quest state cannot.
- **Permanence is a content invariant** rather than a server refusal (§3.4).

If any of the three is ever wanted, `plan-camps.md` is intact and its C1 is
unchanged: the primitive was always designed to land unused (its P6), so it can
still land later underneath content authored against D1.

## 5. What transfers from the dropped test-world plan

### 5.1 The code facts, which are still true

`docs/archive/plan-test-world.md` §1 is the only survey anyone has done of what
bounds a map, and it transfers whole. ⚑ **Its line references were pinned
2026-08-02 and must be re-verified before they are relied on.**

- **F1 - one zone, one `phy.Space`, no transitions.** "Different zones" means
  areas of one contiguous map. Unchanged.
- **F2 - mob level is per species** as a default, with a per-spawn `level`
  override shipped since `plan-mob-levels.md` C1/C2. ⚑ **This fact has moved
  since it was written**: the 13-17 rung hole is no longer a hard cliff,
  because a spawn point may author its own level. Re-read F2 against the
  shipped override before treating the hole as a constraint.
- **F3 - size is capped by mob count, not by bounds.** Every spawned mob ticks
  every tick regardless of player proximity. The measured density of
  `world.json` is **46.8 spawns, 74.9 props, 51.8 terrain textures per 1000 sq
  units** over 144x72. The ceiling itself was never measured; that measurement
  is still owed by whoever sizes the release map.
- **F4 - two things are hardcoded to `zone.ID == "world"`**: the Orc Warlord
  encounter registration and its four named anchors.

Its §3.2 feature checklist and §3.1 area/band table are useful **inputs** to
the map's design session. They are not decisions.

### 5.2 Its rulings do NOT transfer

D1-D8 there were ruled for a throwaway opt-in test map. At least two die with
it and none should be carried silently:

- **D5 (opt-in `testworld.json`, live world untouched)** is dead by
  definition. Whether the release map replaces `world.json`, sits beside it, or
  becomes the new `world.json` is an open question (§7).
- **D3 (existing roster only, accept the 13-17 cliff)** conflicts directly with
  "release-ready content", and F2 has moved underneath it anyway.
- The remaining six (hybrid authoring, measure-then-size, quests per area,
  hand-authored landmarks, the Warlord zone-id hardcode, best-effort skill
  reachability) are all **plausible and all need re-ruling** against a release
  map rather than inheriting.

## 6. Schema impact

**NONE, at every layer.** No migration, no `.fbs` change, no wire field, no new
Go type. §3 is authored JSON under `api/quests/` and `api/mobs/` plus a content
test; §5's map work is `api/zones/`. The only Go touched by this plan as it
stands is a test pin (§3.4).

## 7. Open questions - the map's own planning session

This doc deliberately stops short of a chunk breakdown. The mechanism is
settled; the map is not. What a design session owes:

- **Where it sits in the execution order.** The user's formulation is *the next
  map we build*, after the current prototype work concludes. Whether that is
  before, beside or after step 8b, and how it relates to step 9, is a PO call.
- **Does it replace `world.json`?** New file, new live world, or a rebuild in
  place. This decides the deploy story and whether existing characters keep
  meaningful positions.
- **How many camps, and who they are.** The §3 mechanism is camp-count
  agnostic. `plan-camps.md` D5's shipped `human_army` plus one new player-safe
  faction was a two-camp design; the three-camp shape discussed on 2026-08-22
  is a superset and costs nothing extra.
- **What the shared enemy is**, and whether the three finales converge on one
  encounter or three.
- **Size, and the F3 measurement** that has to precede it.
- **Roster additions**: which levels and species release-ready content needs
  that the current roster does not cover (⚑ re-derive the census from the boot
  log rather than quoting a number from a doc).
- **Quest volume**, and how much of the existing world's quest content is kept,
  moved or rewritten.
- **The world-parity rule.** `plan-camps.md` D1 (a camp's ability may be
  powerful but must sit at a power level obtainable elsewhere) survives D2 and
  governs the camp abilities whether or not the standing primitive is ever
  built.

## 8. Chunk ledgers

*(appended per execution session - none yet)*
