# Plan: the first release map

> **Status: DIRECTION SET 2026-08-22 (PO session). Nothing built. The map itself
> is NOT yet designed - this doc records the two decisions taken today and the
> mechanism they rest on; the map owes its own planning session (§7).**
> **2026-08-23 addition: D6 / §8** - one contiguous map, zones as coordinate
> regions with their own look, music and atmosphere; no multi-world, no server
> hop.
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

PO rulings, 2026-08-22 (D1-D5) and 2026-08-23 (D6).

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
- **D6 - one map, zones as coordinate regions (2026-08-23).** The game stays
  ONE contiguous map on ONE server; "zones" are coordinate rectangles inside it
  carrying their own look, music and atmosphere. No multi-world files, no
  server hop, no physics-Space split. §8 records the direction and the
  surveyed mechanism.

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

§8's region primitive keeps this: no DB, no `.fbs`, no wire field. Its two Go /
TS touch points (the zone struct field and the editor serializer) are code, not
schema - see §8.2.

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
- **The region primitive's v1 shape (D6, §8).** Which properties a region
  carries first (base color? music track? atmosphere overlay?), rectangles only
  or polygons, and how edges read (hard line vs fade). All PO calls for the
  design session; the mechanism survey in §8.2 is their input.

## 8. One map, zones as coordinate regions (direction, D6)

> **Status: direction set 2026-08-23 (PO session). Nothing built. ⭐ The
> MECHANISM is now owned by `docs/plan-region-primitive.md`** (designed later
> the same day, out of a ground-color question, before either session knew of
> the other) — read that for the field, the resolution rule, the chunks and the
> landmines; D6 below stays the ruling and the direction. Reconciliation table:
> that plan's §2. Nothing in D6 was overturned: it asked for coordinate
> squares, the mechanism plan authors polygons, and **a square is a 4-point
> polygon**.** The ask:
> instead of multiple `world.json`s with a server change between them, ONE
> giant map where zones are coordinate squares - different background look,
> the player's position resolvable to a zone for per-zone music, and per-zone
> atmosphere (lighting / light fog). Ruled feasible after a code survey the
> same day, and recorded here as the desired goal for the release map and
> beyond.

### 8.1 Why this is the recorded direction, not a new idea

- The multi-world model was never built: the server loads exactly one zone
  file per process (`world/zone.go:207` `LoadZoneFS`, `-zone` flag), one
  `phy.Space`, and no transition machinery exists anywhere. "Zone 1 / Zone 2"
  are design labels for areas of the single playfield (`content-zone2.md`).
- `tdd.md` §4.6 already records the primitive as known-future (decision
  2026-07-09): *a named region inside a zone carrying its own properties*,
  underpinning per-area music, darkness and per-area terrain. Darkness shipped
  (as circles, `zone.darkAreas`); music and terrain did not. D6 turns that
  known-future into the stated goal.
- `architecture.md` §6 option A (one Space per contiguous landmass, zones as
  cosmetic labels + audio/quest triggers) is the standing recommendation, with
  Space splits (§6 B/C) explicitly the later escape hatch. D6 changes nothing
  there.

### 8.2 Mechanism survey (code facts, 2026-08-23)

⚑ Line refs pinned 2026-08-23; re-verify before relying on them.

- **The JSON field.** `regions: [...]` is additive in `api/zones/<id>.json`,
  but ⚑ **THREE touch points are mandatory, not two** (this line said two when
  written on 2026-08-23; the Tiled extension shipped the same day and added the
  third): the Go zone struct (`world/zone.go` parses with
  `DisallowUnknownFields`, so an unknown key hard-fails boot even if the server
  never consumes it) · the zone editor's serializer
  (`ZoneModel.ts:getZoneAsJSON`, a strict field whitelist - an unlisted field
  survives a load and silently vanishes on the next editor save) · and
  `tools/tiled/extensions/aura-zone/aura-convert.js`'s `serializeZone`, which
  drops unknown keys the same way. ⭐ Only the Tiled one is guarded: the
  **completeness pin** (tiled C5) scrapes `zone.go`'s json tags and goes red
  the moment the format grows a field the converter would drop. `ZoneModel` has
  no such pin - see `plan-region-primitive.md` §5 and its L1.
- **Per-zone background.** Placing different ground-texture types per area is
  authorable TODAY with zero code (terrain entries are individually placed
  sprites). A true per-region base color means drawing one land rect per
  region instead of the single `LAND_COLOR` rect (`Game.ts:505-512`).
- **Position → zone on the client.** Point-in-rect per frame against the
  interpolated player position; two shipped patterns already have this exact
  shape (`DarknessOverlay.inAnyCircle` per frame, `MapFog.revealAt`'s
  entered-a-new-cell tracking). Purely client-side suffices for music and
  visuals; the server never needs to know.
- **Music.** `@pixi/sound` is wired (master/music volume, spatial SFX), but
  `Music.ts` is 32 lines: ONE hardcoded looping mp3 started at boot. The
  extension is a track table + region-entered crossfade. ⚑ The real cost is
  content: the repo owns exactly one music track. **Owned by
  `docs/plan-region-audio.md`** (C3), together with per-region footsteps;
  ⚑ that doc carries the blocker this line does not mention - backlog §19's
  ~160 MB of eagerly decoded audio, for which long music tracks are the named
  HTML5-streaming candidate.
- **Atmosphere / lighting.** ⛔ Do NOT build per-zone tint on the day/night
  machinery: it was disabled precisely because its ~25 per-layer filter
  passes, reassigned at 30 Hz, made avatars invisible at the transition
  (standing lock in CLAUDE.md). The shipped, working pattern is the
  `DarknessOverlay` style: gradient sprites on their own dedicated layer,
  erase-blend holes for lights, zone-data-driven. Per-zone fog/gloom should be
  rectangles with soft edges in that same overlay approach (world-space fog
  does not exist yet; `MapFog` is map-UI only).
- **"Giant" is capped by mob count, not bounds** (§5.1 F3: every spawned mob
  ticks every tick; the broadphase grid is a sparse hash, so area itself is
  structurally free). The 2026-08-05 scaling measurement bounds the envelope:
  density ceiling ≈5.8×, area ≈18× at proportionally lower density, broadphase
  dominating at the top. The release map still owes its own sizing measurement
  before dimensions are chosen.

### 8.3 Explicitly out of scope under D6

Separate physics Spaces, zone handoffs, sharding, instancing. They remain the
`architecture.md` §6 escape hatch for when a landmass outgrows one core, and
nothing in D6's goal requires them.

## 9. Chunk ledgers

*(appended per execution session - none yet)*
