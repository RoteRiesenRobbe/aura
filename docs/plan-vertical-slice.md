# Plan: Vertical slice: a short, completable playtest build (Farmlands → Woods → City → Swamp → the stone at 12 → an heir)

**Status: DESIGNED 2026-11-22 (planning session, PO in chat). R1-R13 RULED (R12 supersedes R1's cap), D1-D9 PROPOSED, Q1-Q16 open except Q10-Q12, VS1 built 2026-11-22.** **Next: VS-P, the two POs' playthrough (§5.2).** Open PO calls in §7. The plan is deliberately AGILE (R4): VS0,
the feature audit, decides which fill chunks exist; §5 lists the fixed chunks and
the candidate fills. VS-P needs no approval; VS0 starts once the plan is approved.

**Owns:** the playtest slice's definition of done, its level cap, its borders, its pacing
and the order of everything that feeds it. **Builds on:** `plan-xp-progression.md` (bands,
budgets, the L9 quest price D2, D4, D5; its held D3 is settled here, R9),
`plan-character-entries.md` (CE1, Wisp Powder, the city → swamp → city chain),
`plan-audio.md` (C1+), `plan-ui-pass.md` (C9), `archive/plan-ascension-ceremony.md`
(the stone as built). **Amends:** the near-term build order (CLAUDE.md Status, `roadmap.md`
"The near-term build order"): the slice becomes the umbrella over audio C1+ and UI C9 (R6).
**Schema (as designed):** DB none expected (Q2 may add a one-off live cleanup, not a
migration) · wire none expected · conf: none for the ascension (R12), only the
tuned `killXP.base` · content: the city stone's four `minLevel` gates 30 → 12, then per fill chunk · zone: the borders (VS2) · lang: per fill chunk.

⚑ Line references pinned 2026-11-22 at `d31464c9` (main); re-verify before relying on them.

---

## 1. What this is

The PO, 2026-11-21: polish the current version and its content into a **playable and
completable, quite short, vertical slice for playtests**. Start in the Farmlands, quest
through the Deep Woods, the City and the Swamp and back; at that point an ascension is
available; then play through again with more power. The slice should **show every
feature the game has**, using the regions that have content and adjusted values.

### 1.1 What the content supports today (census redone 2026-11-22, `d31464c9`)

Derived from `api/` and `conf.default.json` by a script (session scratchpad; D2 makes it a
tool): quests, gates, turn-ins, spawns with levels, drops and teachers, priced with the
game's own kill-XP and level formulas. It replaces the 2026-11-21 census. It is a
prediction: walking, deaths (which drop the progress inside the current level) and combat
difficulty are not modelled. The playthrough (§5.2) tests it.

*(Census taken before VS1, which set the stone's price to 12 the same day, §11.)*

**Headline: level 30, the city stone's price, cannot be reached in the slice.** One pass
ends at 14. Every kill is gray at 21; with every quest saved for last the ceiling is 22,
227,701 XP short of 30. Nobody can ascend today without the XP cheat.

**Levels:** 5 = 1,610 XP · 7 = 2,978 · 9 = 4,949 · 12 = 9,645 · 14 = 14,549 · 16 = 21,611 ·
21 = 56,007 · 30 = 295,221.

**One pass, each quest once plus the kills it asks for (kill base 20):**

| Region (with sub-zones) | Quests | Quest XP | Their kills' XP | Total | Level in → out | Mob levels |
|---|---|---|---|---|---|---|
| Farmlands (Brackenfold, barn) | 13 | 2,522 | 981 | 3,503 | 1 → 7 | 1–5 |
| Deep Woods (wolf den, kobold cave) | 10 | 6,457 | 1,623 | 8,080 | 7 → 12 | 3–9, spiders 12–14 |
| City | 0 of its own (two turn-ins, counted where the work is) | 0 | 0 | 0 | 12 → 12 | none |
| Sorrowfen (spider den) | 3 | 2,534 | 762 | 3,296 | 12 → 14 | 8–12, boss 12 |
| **Total** | **26 (25 pay XP)** | **11,513** | **3,366 (23 %)** | **14,879** | **1 → 14** | |

The two wolf quests can share kills; if they do, the total is 14,699 (still 14).

**Scenarios, end level by kill base** (the two level-14 tunnels are excluded):

| Scenario | Base 20 (today) | Base 15 | Base 12 |
|---|---|---|---|
| Quests only | 11,513 XP, **12** | 12 | 12 |
| Quests + their kills | 14,879 XP, **14** | 13 | 13 |
| The same without `bears-at-the-walls` | 12,300 XP, **13** | 12 | 12 |
| Quests + every placed mob once | 19,768 XP, **15** | 15 | 15 |
| Every placed mob once, no quests | 16,176 XP, **14** | 13 | 12 |

**Mob XP by region, every placed mob killed once in route order, no quests:** Farmlands
2,221 (to 5) · Deep Woods 9,978 (to 13) · City 0 · Sorrowfen 3,977 (to 14).

**What it shows:**

- **Level 12 arrives in the Deep Woods, before the swamp.** `bears-at-the-walls` (level 16,
  2,300 XP, no gate, five bears of 6–7) is the jump. Without it the swamp is entered at 11.
- **The Farmlands overshoot:** left at 7, against a band of 1 → 6.
- **The City has no combat and no quest of its own.** DQ1–DQ3 are designed, not built.
- **Two hidden exits lead out of the pacing, both to be confirmed on foot:** one in the
  Farmlands (~40 units from the starting fire, under 30 s on foot) enters `tunnel`, ten
  level-14 Dire Wolves; one in the City enters `underworld`, eight more, and comes out in
  Grimwatch (18–19).
- **The Dire Wolf quest (4 kills) has one Dire Wolf in the Deep Woods** and one in
  Brackenfold; the other 18 are the level-14 ones in those tunnels.
- **Combinations: 2 of 11 reachable.** Paladin (8 points). Suppression (11 points, every
  point a level-12 character has, and both ingredients are 20 % drops).
- **Unplaced givers:** Shaman, Miner, Emberkeeper, Village Healer (4 quests, 5,010 XP; the
  Healer's Alpha Wolves are outside the slice too). With them are missing Revive, Recover,
  the totem, Pickaxe and the fire line. Slow is still reachable as a drop.
- **`the-lost-lamp` is offered by nobody**, so the active Lantern and its ascension entry
  are unreachable (`api/quests/README.md` is stale on this). Two passive lights are
  reachable: Torch (shown as Lamp) and Belt Lantern.
- **Ascension gifts:** five are open, three are gated (Lantern: unreachable; Frost Shield:
  3 ascensions; Blight: 20 Dire Wolves in one life, possible in the tunnels). Keen Eye, one
  of the open five, already drops inside the slice, so it is little reward for a life.
- **On the route:** quests, teachers, drops, milestones (1, 5, 7), elites, one boss, dark
  caves (`Gloom`), 13 bind points. Exploration clues and the other features: VS0.
- **Two players:** every participant gets full kill XP at their own level and quest
  credit, so a duo levels as predicted but finishes faster than a solo player.

## 2. PO rulings (2026-11-21)

- **R1 - Ascension becomes reachable by lowering `maxLevel`.** The cap is the slice's end
  level, so the XP bar fills when the content runs out, which says "done" honestly.
  ⚑ Correction 2026-11-22: the stone's gate does NOT follow the cap by itself. The pin the
  session first cited was retired with `archive/plan-ascension-sites.md` D1 (a stone names
  its own price), so the city stone's gate is set to 12 in the same chunk (D5).
- **R2 - The slice ends at level 12** [PLACEHOLDER]: the top of the swamp's band; today's
  content reaches it with slack, and the Spider Queen (12) is the final boss.
- **R3 - Character entries are in:** Wisp Powder and its city → swamp → city chain
  (`plan-character-entries.md`), which is the "swamp and back" leg.
- **R4 - The rest of the content list is not fixed.** An agile plan: go through what is
  there, check the progression, and fill holes by **missing features, not missing
  content**.
- **R5 - The second run is the ascension as built** (one catalog skill, the gift, the
  look), after one check that nothing is wildly too powerful.
- **R6 - The slice is the umbrella.** Audio C1+ and UI C9 become chunks inside it,
  scheduled where the playtest needs them.
- **R7 - One pass takes about 2 hours** [PLACEHOLDER] for a first-time player, ~10–11
  minutes per level.
- **R8 - Regions outside the slice are closed off.**
- **R9 - The kill base (`plan-xp-progression.md` D3) is settled in tuning**, by measuring
  the critical path against R7, not ruled up front.
- **R10 (2026-11-22) - The playtest state presents content and breaks nothing:** "without
  breaking anything, so presenting content, not hard coding for the playtest" (PO). It is
  the next big step.
- **R11 (2026-11-22) - Two POs play through the current game first (2026-11-22)** and
  refine the plan and its open points from that (VS-P, §5.2).

- **R12 (2026-11-22, Q12) - Only the stone changes; `maxLevel` stays 30.** Supersedes
  R1's mechanism after L1 and L4 were measured: the city stone asks for the slice's level
  (12, R2) and its "You are max level" line is reworded.
- **R13 (2026-11-22, Q10) - The POs play on the live server.**

## 3. Design

### D1 - The slice's definition of done [proposed]

The slice is done when a fresh player can, on the live server, without cheats:

1. start at level 1 in the Farmlands and reach the city stone at 12 by questing, in about
   2 hours, never stuck below a quest's level for want of content;
2. meet every feature on the VS0 checklist (D3) on the way, each at least once;
3. ascend at the stone (ceremony, gift, look, heir home) and start the heir at level 1
   with the picked skill;
4. never leave the slice by walking (R8);
5. play with sound (audio lanes chosen by Q4) and file a bug report from inside the game.

### D2 - The progression ledger is a tool, not a table [proposed]

The census in §1.1 was a one-off script. VS0 commits it as `tools/progression/` (or a
simharness battery, whichever is smaller): it reads quests, conversants, spawns and the
kill-XP conf, walks the critical path in quest-level order and prints the level at each
region's entry, the quest/kill split and the end level. Every fill and tuning chunk
reports its before/after from it. ⚑ It derives, never hardcodes, which quest belongs to
which region (D5's rule: where the work happens).

### D3 - The feature checklist comes from `docs/feature-inventory.html` [proposed]

VS0 walks the inventory's ~37 features plus everything shipped since (campfire traits,
character entries, ceremony, buff tray, bug report, passages, quest icons) and gives each a
row: **shown where on the route** / **missing (needs a fill)** / **out of the slice (by
design)**. Only "missing" rows become fill chunks (R4). Known candidates, to be confirmed:
a second reachable combination, a light-support moment in a dark venue (Lantern), the
heal/revive support role, more than one boss.

### D4 - Bands inside the cap [proposed, numbers PLACEHOLDER]

| Region | Band | Budget (XP) |
|---|---|---|
| Farmlands | 1 → 5 | 1,610 |
| Deep Woods | 5 → 9 | 3,340 |
| City (hub) + Sorrowfen | 9 → 12 | 4,695 |
| **Slice** | **1 → 12** | **9,645** |

⚑ **This replaces the PO's bands of 2026-10-25** (Woods 4 → 7, Swamp 8 → 12,
`content-zone-7-swamp.md` §0.4) and the Farmlands' 1 → 6: the Farmlands shrink to 1 → 5,
and the Woods widen to 5 → 9 so their mobs (3–9) sit inside it. Today's pass pays ~14,800
against 9,645: the slice is **over budget before any fill**, and every feature fill adds
XP, so tuning must take XP out (D7).

### D5 - The cap is set in every conf the server can read [proposed]

⚑ **Superseded by R12 (2026-11-22; L1, L4).** The design is content only: the city stone's
gate and its "You are max level" line change (English + German, lang record), `maxLevel`
stays 30; `c2a-ascension-site.mjs:394` expects "level 30" and moves with it. Trialled on a scratch copy at a gate of 12: the Go
suite is green (run without the DB) and `-validate` reports 0 findings; harnesses not run.
A stone can also require a finished quest, as the front stone does (Q13). The original
proposal follows.

`maxLevel: 12` lands in `backend/conf.default.json`, `backend/conf.json` and the live
server's `devops/conf.json` (which today has no `player` block at all and so runs on
`curve.DefaultCurve()`'s 30, L1). The city stone's four `minLevel` conditions
(`api/mobs/ascension-stone.json`) go from 30 to 12 in the same change, and VS1 adds a
content test that the slice's stone is priced at the configured cap (the rule "the slice's
stone opens exactly at the cap" belongs to the slice, not the engine). The front stone (25)
stays above the cap, behind a border (Q3). The Go default stays 30: the slice is a content state,
not a new engine default. Leaving the slice later is a conf change back.

### D6 - The borders are passages that say "not yet" [proposed]

Each walkable route out of the slice (Umberwood, Southgate, Northgate, Glimmerwood,
Greyspine and the coast, the list re-derived from the map by VS2) gets a blocking border
with a passage-style talk exit whose line says the way is closed for now. It reuses the
`Passage` entity (`plan-passages.md`) rather than a new mechanism. ⚑ Unverified: whether a passage can refuse travel today; if
it cannot, VS2 uses a blocking border plus a sign NPC with the same line, and says so.
The list also covers the City's hidden exit through `underworld` to Grimwatch, and decides
on the Farmlands' level-14 tunnel (Q14). The sketch regions keep
their content untouched, so reopening one is a map edit.

### D7 - Tuning is measured, then walked [proposed]

The tuning chunk fits the slice to the D4 bands with D2's tool. ⚑ **The quest price is not
a lever:** the half-level price is ruled (`plan-xp-progression.md` D2) and pinned by
`TestContent_QuestXPBudget`. The levers are each quest's `level` (which sets its price),
which quests the slice keeps (e.g. `bears-at-the-walls`, Q9), spawn levels, and
`killXP.base` (R9). The 2-hour target (R7) is checked by a timed PO run on a fresh
character, not by the tool. Balance guardrails (`cmd/simharness/guardrail_test.go`) that
assume level 30 are re-run and re-pinned with a note (`feedback_final_means_first_pass`).

### D8 - The power check is one pass over the catalog and the gifts [proposed]

Before the first external test: each city-stone catalog entry and each gift is held
against D1 of `archive/plan-ascension.md` (world parity: nothing the world at level ≤ 12
cannot also hand out) and against the heir's first 30 minutes. Out: a ruling per entry
(keep, re-gate, remove from this stone). Entries locked inside the slice (Lantern, Frost
Shield, Blight) are either made reachable by a fill or stay visibly locked.

### D9 - A playtest release checklist [proposed]

The last chunk is a written runbook: fresh live DB or cleanup (Q2), deploy, the cheat
token kept server-only, a tester handout (controls, the goal, how to report a bug),
what to watch, and where feedback lands (`docs/feedback.md`).

## 4. What changes for the author

Spawn levels and quest XP change through the content editor or the JSON (the editor's
changes are rulings, `feedback_editor_changes_are_intentional`). Borders are a Tiled edit
on the passages layer (half-live, restart after saving). New quests or NPCs follow the
`add-content` skill and the localization rule (English in `api/lang/en`, German in the same
change).

## 5. Chunks

Fixed chunks, in order. Fill chunks (VS-F#) are added by VS0's ruled checklist.

| # | Chunk | Contents | Size | Needs |
|---|---|---|---|---|
| **VS-P** | The PO playthrough | §5.2: two POs play today's game as it is and fill in the sheet; its findings rule or re-open §7. No changes to the game. | S | nothing |
| **VS0** | Feature audit + progression tool | D2 tool committed; D3 checklist written into this doc (§5.1); proposed fill list for the PO. Docs + a tool, no game code. | M | approval |
| **VS1** | The ascension at 12 | R12: the city stone's four gates, its line (EN + DE + lang record), the `c2a` harness's expected level. Q13 may add a quest later. Can jump ahead of VS-P if Q11's go comes. | S | R12 |
| **VS2** | The borders | D6: list of exits out of the slice, a border + passage line each; `-validate` and a walk. | M | VS0 |
| **CE1** (+ chain) | Character entries | As `plan-character-entries.md` designs it (its D1–D11 approval is owed, Q6). | M–L | approval there |
| **VS-F1…n** | Fills | One per "missing" checklist row, as ruled at VS0 (candidates in D3 and §1.1). | S–M each | VS0 ruling |
| **A-C1+** | Audio | `plan-audio.md` C1 and the lanes Q4 picks for the slice. | per that plan | |
| **UI-C9** | Mobile UI pass | Only if Q5 says phones are in the playtest. | per that plan | |
| **VS3** | Tuning | D7: bands, kill base, quest prices, spawn levels; the D2 tool's before/after; a timed PO run. | M | fills done |
| **VS4** | Power check | D8: a ruling per catalog entry and gift; the heir's first 30 minutes walked. | S | VS3 |
| **VS5** | Release | D9: runbook, fresh DB or cleanup, deploy, tester handout. | S | everything |

**Per-chunk In-game (PO)** checklists are written when each chunk is planned in detail
(VS0 for VS1/VS2). For VS0 itself: none; the PO reads the checklist and rules the fills.

**Schema per fixed chunk:** VS0 none · VS-P none · VS1 content (stone gate + line), conf none · VS2 zone (passages layer) + lang
(border lines) · VS3 conf + content · VS4 content (catalog) · VS5 none (ops).

**In-game (PO) checklists** for VS1-VS5 are written once VS0 rules the fills: deferred on
purpose, not forgotten.

### 5.1 Feature checklist (filled by VS0)

(none yet)

### 5.2 VS-P: the playthrough sheet (2026-11-22)

Play the game as it is, on fresh characters, without cheats.
Ruled for today (2026-11-22): the bears quest (Q9) and the two tunnels (Q14) are judged by
playing; solo or together (Q15) is the players' call.
Findings land in `docs/feedback.md`; rulings from them land in §2.

| Checkpoint | Predicted level | Actual level | Clock | Stuck, bored or lost at |
|---|---|---|---|---|
| Leaving the Farmlands | 7 | | | |
| Kobold Chief killed | 10 | | | |
| Leaving the Deep Woods | 12 (11 without the bears quest) | | | |
| Entering Sorrowfen | 12 | | | |
| Spider Queen killed, quest handed in | 14 (15 killing everything) | | | |
| Back at the city stone | 14, opens (needs 12 since VS1) | | | |
| Ceremony + the heir's first minutes | heir at 1 | | | |

**Watch for:**

1. Is the Farmlands' hidden tunnel found by accident, and does it kill you?
2. Can you walk or tunnel out of the slice, and where?
3. Is the Dire Wolf quest doable with one wolf in the woods?
4. Does the bears quest feel like a level jump?
5. Does either combination appear (Paladin, Suppression)?
6. Do the caves need a light, and did you have one by then?
7. Does the City give you any reason to stay?
8. Is the Spider Queen a fitting last fight, solo and as two?
9. Which features did you never meet?

## 6. Test strategy

- **The D2 tool is the slice's main gauge:** each chunk records the end level, the entry
  level per region and the quest/kill split in its ledger.
- **Go:** VS1 adds no pin of the number 12 (R10: nothing hardcoded for the playtest); the
  suite, `TestLang` and `-validate` are its gate. Content tests
  derive (`TestContent_QuestXPBudget` stays the quest-price pin).
- **Boot:** `aurad -validate` (and `-validate -debug-zones`) after every content or zone
  chunk.
- **Harness:** the `verify` skill's legs for whatever a chunk touches; VS2 adds a walk
  check that each border refuses passage.
- **PO:** a timed fresh-character run at VS3 and VS5 (target ~2 h, R7); one ascension and
  the heir's first stretch at VS4.

## 7. Open PO calls

- **Q1 - The bands inside the cap.** Proposed D4: Farmlands 1 → 5, Woods 5 → 9, City + Swamp
  9 → 12 [PLACEHOLDER], replacing the 2026-10-25 bands (Woods 4 → 7, Swamp 8 → 12).
- **Q2 - Live characters above 12.** The live DB is losable (no backups, by ruling).
  Proposed: wipe or clean it at VS5 so every tester starts fresh; otherwise a level-20
  character meets a cap of 12 (L4).
- **Q3 - Which stone ends the slice?** Proposed: the city stone, read from the route ("and
  back"). The front stone (25,
  Umberwood) stays outside, behind a border.
- **Q4 - Which audio lanes does the playtest need?** Proposed: C1 (foundation) + one-shots
  + region music; ascension music if it is cheap.
- **Q5 - Are phones in the playtest?** Mobile is not v1 scope. Proposed: desktop only, C9
  stays after the slice unless testers are expected on phones.
- **Q6 - Character entries' D1–D11 approval**, owed before CE1 (`plan-character-entries.md`).
- **Q7 - Do the 4 debug-only givers and the Lantern quest come into the slice?** Decided by
  VS0's checklist (they carry features: Slow, Totem, Revive, the fire line and Wildfire,
  light support), not by their XP.
- **Q9 - `bears-at-the-walls`** (level 16, 2,300 XP, ungated in the Deep Woods): proposed
  re-level it into the Woods' band or move it out of the slice at VS3.
- **Q8 - German for new lines:** same change as always (D23), or a slice-wide pass at VS5?
  Proposed: same change.
- ~~**Q10 - Where do the POs play today?**~~ RULED 2026-11-22: R13, live.
- ~~**Q11 - How is the ascension tested today?**~~ RULED 2026-11-22: by the fix, not the
  cheat: VS1 built, committed, pushed and fully deployed ahead of VS-P (L9).
- ~~**Q12 - R1 again: gate or cap?**~~ RULED 2026-11-22: R12, gate only.
- **Q13 - (deferred 2026-11-22) What opens the stone besides the level?** Level 12 alone opens it before the
  swamp. Proposed: level + `the-spider-queen` completed.
- **Q14 - The two level-14 tunnels:** keep, retune or close. Proposed: after VS-P.
- **Q15 - How do the two POs play:** together, apart, or both. Predictions are per player.
- **Q16 - When is the census script saved as a tool?** Proposed: VS0, as D2 says.

## 8. Landmines

- **L1 - A conf cannot carry a slice-only cap.** `TestTrackedConfs_ResolveToIdenticalGameTuning`
  requires every tracked conf (the live one included) to resolve to the Go defaults. A cap
  of 12 means changing the Go default everywhere or exempting that pin. `backend/conf.json`
  is untracked, so no test may read it. (Trial 2026-11-22: 12 in `conf.default.json` alone
  turned that pin and the embedded-copy pin red.)
- **L2 - The regen taper is relative to the cap.** `regenTaper`
  (`backend/pkg/aura/model/player/update.go:33`) reaches its floor (×0.4) at `maxLevel`:
  under a cap of 12, a level-12 player regenerates like a level-30 one did. Check with the
  guardrails; decide whether the taper should keep its 30-level span.
- **L3 - Other `maxLevel` readers:** the XP table (`player.go:1564`, `:1601`),
  `Curve.TotalInflation` (`curve.go:40`, the sim harness's linked triple) and simharness
  `serve.go`/`main.go`/`content.go`. Grep every reader before VS1 lands.
- **L4 - A lowered cap destroys saved progress** (probed 2026-11-22 in a scratch copy, on
  the player model): a level-30 character with 295,221 XP loads at 30, drops to 12 on its
  next XP gain, and its next death (`LoseCurrentLevelExperience`) sets its XP to 9,645.
  Restoring the cap to 30 does not bring it back. Its spent skill points also exceed the
  new budget.
- **L5 - A content edit does not invalidate the Go test cache** (`-count=1`), and without
  `-content ../api` the embedded copy is read (rebuild after any `api/` edit).
- **L6 - Zone edits are half-live:** restart after a Tiled save; the passages layer has a
  second writer (the coworker who owns `plan-passages.md`).
- **L7 - Mob levels above the cap** stay in the sketch regions behind the borders; any that
  remain inside the slice (the Deep Woods spiders at 12–14, the City Guard at 30) must be
  re-levelled or deliberate.
- **L9 - Never `--content-only` from HEAD onto live `200a5046`.** That binary predates
  AC3 and refuses `heirHome` in `front-ascension-stone.json` (reproduced 2026-11-22 with
  `-validate`: 7 findings, the mobs do not load), and the deploy restarts into it. Use a
  full deploy until live carries `e8086abe` (no migration; a wire field, so hard refresh).
- **L8 - Unrun harnesses rot:** the quest harness venues are debug-world only
  (`project_quests`); slice checks need live-world venues.

## 9. Schema impact

- **DB:** none expected. A live data cleanup (Q2) is an ops step, not a migration.
- **Wire:** none expected; a fill chunk that adds a mob or entity type states its own.
- **Conf:** none for the ascension (R12). `killXP.base`
  per VS3 moves the Go default and its restatements together (same parity pin).
- **Content:** per fill chunk; VS3 re-prices quests and spawn levels; VS4 may re-gate
  catalog entries.
- **Zone format:** none (borders reuse the passages layer).
- **Lang:** border lines (VS2) and every fill's lines, English + German.

## 10. Cross-references

`plan-xp-progression.md` (bands, D2–D5), `content-zone-1-farmland.md` §2.7–§2.8,
`content-zone-2-woodland.md`, `content-zone-7-swamp.md` §0.4, `content-city-dionsburg.md`,
`plan-dionsburg-quests.md`, `plan-character-entries.md`, `plan-passages.md`,
`plan-audio.md`, `plan-ui-pass.md`, `archive/plan-ascension-ceremony.md`,
`archive/plan-ascension-sites.md`, `docs/feature-inventory.html`.

## 11. Chunk ledgers

### VS1 - the ascension at 12 ✅ DONE 2026-11-22 `[uncommitted]`, PO look = VS-P

Pulled ahead of VS-P and VS0 on the PO's go (Q11): "Fix, commit, push, deploy", so that
the playthrough can end in a real ascension on live.

- **Content:** `api/mobs/ascension-stone.json`: the four `minLevel` gates 30 → 12
  [PLACEHOLDER]; the stale comment claiming a pin to `maxLevel` corrected.
- **Lang:** `you-are-max-level-so` now reads "You have come far enough, so you can spend
  this character here." / „Du bist weit genug gekommen, also kannst du diese Figur hier
  geben." (the key stays).
- **Harnesses:** `c2a-ascension-site` reads the price from content and tests both sides
  (11 refused, exactly 12 opens). `c1-front-stone` leg 2b reversed (the city stone is now
  the cheaper one), leg 4 deleted.
- **Effects:** a live character already at 12+ can ascend at once. Until Q13 is ruled the
  stone opens before the swamp.
- **Schema:** DB none · wire none · conf none · content 4 values · lang 1 line EN + DE.
- **Verified:** Go 0 FAIL (40 packages) · db-test ok · vitest 2013/0 · typecheck ·
  `-validate` 0 (both zone sets) · `c2a` 49/49 (one earlier run 48/49 on the headless WebGL
  context loss, backlog §29) · `c2b` 12/12 · `c3-memorial` 14/14 · `c1-front-stone` 13/15
  (2 expected). Harnesses ran on the debug venue against `aura_test`.
