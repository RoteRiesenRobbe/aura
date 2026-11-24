# Plan: Vertical slice: a short, completable playtest build (Farmlands → Woods → City → Swamp → the stone at 16 → an heir)

**Status: DESIGNED 2026-11-22 (planning session, PO in chat). R1-R28 RULED (R27 supersedes half of R21) (R12 supersedes R1's cap, R20 supersedes R2's 12), D1-D9 PROPOSED, still open: §7. VS1 built and live 2026-11-22. VS-P played 2026-11-22 (no ascension yet).** **PF1 done 2026-11-22 `6ed28a92`, PF2 done 2026-11-24, both PO walks passed (§11). Next: PF3 (HUD), on the PO's go (§5.3, order ruled R19); the coworker's level pass (§5.5) after PF3 is pushed (R28).** Open PO calls in §7. The plan is deliberately AGILE (R4): VS0,
the feature audit, decides which fill chunks exist; §5 lists the fixed chunks and
the candidate fills. VS-P needs no approval; VS0 starts once the plan is approved.

**Owns:** the playtest slice's definition of done, its level cap, its borders, its pacing
and the order of everything that feeds it. **Builds on:** `plan-xp-progression.md` (bands,
budgets, the L9 quest price D2, D4, D5; its held D3 is settled here, R9),
`plan-character-entries.md` (CE1, Wisp Powder, the city → swamp → city chain),
`plan-audio.md` (C1+), `plan-ui-pass.md` (C9), `archive/plan-ascension-ceremony.md`
(the stone as built). **Amends:** the near-term build order (CLAUDE.md Status, `roadmap.md`
"The near-term build order"): the slice is next and the umbrella over audio C1+ (R6, R17);
UI C9 follows it (R15).
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
- **R2 - The slice ends at level 12** (⚑ superseded 2026-11-22 by R20: 16) [PLACEHOLDER]: the top of the swamp's band; today's
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
- **R14 (2026-11-22, Q3) - The city stone ends the slice.** The front stone stays as it
  is, behind the borders.
- **R15 (2026-11-22, Q5) - The playtest is desktop only.** Amends R6: UI C9 waits until
  after the slice, and the tester handout says desktop browser.
- **R16 (2026-11-22, Q7) - The audit decides the unreachable features** (the four
  debug-only givers, the Lantern quest): VS0 lists what the route misses, with VS-P's
  notes, and the POs pick by feature.
- **R17 (2026-11-22) - The slice is the next item of the build order** (`roadmap.md`),
  audio C1+ inside it.

- **R18 (2026-11-22, VS-P) - The playthrough's notes are the fix list** (§5.3), and
  **mob levels, density and placement are the coworker's**, done manually and in their own
  sessions: "no immediate content changes on that front" (PO). The notes that only asked
  (F37) or were marked as ideas (F53-F56) stay proposals.

- **R19 (2026-11-22, Q25; ⚑ amended by R28) - The fix order is §5.3's:** rules and bugs, quests and map batch
  (the coworker starts after it), words, HUD, looks, sound, XP tuning after the level pass.
- **R20 (2026-11-22, Q18) - "Stone 16, bluff open" (PO).** Supersedes R2's 12 and amends R8:
  Wreckers' Bluff is inside the slice. The gate moves in VS3, once the Bluff has its mobs;
  until then 12 stays so the ascension can be tested.
- **R21 (2026-11-22, Q19; ⚑ Hans's half superseded by R27) - Both wolf quests stay.** Hans counts Young Wolves, the Crier
  forest wolves. Withdraws `plan-dionsburg-quests.md` R8/D8.
- **R22 (2026-11-22, Q24) - XP is tuned after the level pass, and the kill share is fine:**
  "We tune after level pass but 60% does sound fine for now" (PO). So VS3 does not aim at
  cutting kill XP; kill base 20 is the starting point.
- **R23 (2026-11-22, Q20) - An effect never targets what it can never hurt.** Amends
  `archive/plan-immune-targets.md` D1/D4; D2 (temporary immunities stay targeted) holds.
- **R24 (2026-11-22, Q21) - Pickaxe comes from a new NPC, the "Miner Guild Associate", in
  the City's northern (dwarven) district** (PO).
- **R25 (2026-11-22, Q22) - Taunt and Strong leave the City Guard and are re-homed later**
  (VS0 proposes the sources); Taunt's drop stays.
- **R26 (2026-11-22, Q23) - The zoom row is only laid out horizontally:** the same
  elements as today (?, magnifier, +, level, −).

- **R27 (2026-11-22) - "The push stands":** `77028018` retired Hans's `he-who-cried-wolf`
  (the turn-in stays for characters on it). The Crier's Wolves on the Road is the one wolf
  quest, DQ R8/D8 stays withdrawn, and Young Wolves count for no quest.

- **R28 (2026-11-22) - HUD is pulled forward to third, before the coworker** (PO: "I want
  to pull hud forward to before the coworker. so it would be number 3"). HUD and Words swap
  numbers (HUD = PF3, Words = PF4) and the coworker's pass starts after PF3.

## 3. Design

### D1 - The slice's definition of done [proposed]

The slice is done when a fresh player can, on the live server, without cheats:

1. start at level 1 in the Farmlands and reach the city stone at 16 (R20) by questing and,
   where short, the Bluff, in about 2 hours (R7, see Q26), never stuck below a quest's level for want of content;
2. meet every feature on the VS0 checklist (D3) on the way, each at least once;
3. ascend at the stone (ceremony, gift, look, heir home) and start the heir at level 1
   with the picked skill;
4. never leave the slice by walking (R8);
5. play with sound (audio lanes chosen by Q4) and file a bug report from inside the game.

### D2 - The progression ledger is a tool, not a table [proposed]

The census in §1.1 was a one-off script. VS0 commits it as `tools/progression/` (or a
simharness battery, whichever is smaller): it reads quests, conversants, spawns and the
kill-XP conf, walks the critical path by region and prerequisite (then quest level) and prints the level at each
region's entry, the quest/kill split and the end level. Every fill and tuning chunk
reports its before/after from it. ⚑ It derives, never hardcodes, which quest belongs to
which region (D5's rule: where the work happens).

### D3 - The feature checklist comes from `docs/feature-inventory.html` [proposed]

VS0 walks the inventory's ~37 features plus everything shipped since (campfire traits,
character entries, ceremony, buff tray, bug report, passages, quest icons) and gives each a
row: **shown where on the route** / **missing (needs a fill)** / **out of the slice (by
design)**. Only "missing" rows become fill chunks (R4). Known candidates, to be confirmed:
more reachable combinations (2 of 11 today), a light-support moment in a dark venue (Lantern), the
heal/revive support role, more than one boss.

### D4 - Bands up to the stone's 12 [STALE since R20, re-proposed in VS3]

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

### D5 - The stone's gate, not a cap [RULED R12, built in VS1]

⚑ **Superseded by R12 (2026-11-22; L1, L4).** The design is content only: the city stone's
gate and its "You are max level" line change (English + German, lang record), `maxLevel`
stays 30; `c2a-ascension-site.mjs:394` expects "level 30" and moves with it. Trialled on a scratch copy at a gate of 12: the Go
suite is green (run without the DB) and `-validate` reports 0 findings; harnesses not run.
A stone can also require a finished quest, as the front stone does (Q13). Leaving the
slice later is a content change back.

### D6 - The borders are passages that say "not yet" [proposed]

Each walkable route out of the slice (Umberwood, Southgate, Northgate, Glimmerwood,
Greyspine and the coast, the list re-derived from the map by VS2) gets a blocking border
with a passage-style talk exit whose line says the way is closed for now. It reuses the
`Passage` entity (`plan-passages.md`) rather than a new mechanism. ⚑ As read 2026-11-22, a passage cannot refuse travel (`world.Exit.Anchor` is required),
so VS2 most likely uses a blocking border plus a sign NPC with the same line.
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

### D8 - The power check is one pass over the catalog and the gifts [proposed; read 16 for 12 since R20]

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
| **VS-P** | The PO playthrough | §5.2: two POs play live and report by prompts; the agent records. Findings rule or re-open §7. Small fixes and redeploys on their word. | S | nothing |
| **VS0** | Feature audit + progression tool | D2 tool committed; D3 checklist written into this doc (§5.1); proposed fill list for the PO. Docs + a tool, no game code. | M | approval |
| **VS1** | The ascension at 12 | R12: the city stone's four gates, its line (EN + DE + lang record), the `c2a` harness's expected level. Q13 may add a quest later. Can jump ahead of VS-P if Q11's go comes. | S | R12 |
| **VS2** | The borders | D6: list of exits out of the slice, a border + passage line each; `-validate` and a walk. | M | VS0 |
| **CE1** (+ chain) | Character entries | As `plan-character-entries.md` designs it (its D1–D11 approval is owed, Q6). | M–L | approval there |
| **VS-F1…n** | Fills | One per "missing" checklist row, as ruled at VS0 (candidates in D3 and §1.1). | S–M each | VS0 ruling |
| **A-C1+** | Audio | `plan-audio.md` C1 and the lanes Q4 picks for the slice. | per that plan | |
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

### 5.2 VS-P: the playthrough session protocol (2026-11-22)

Play the game as it is, on fresh characters, without cheats.
Ruled for today (2026-11-22): the bears quest (Q9) and the two tunnels (Q14) are judged by
playing; solo or together (Q15) is the players' call.
**The POs work only by prompts (PO 2026-11-22: "we will only work via prompts, not by
filling a sheet"): they paste, the agent keeps every record.**

**Input.** Suggested line: `<who> <level> <place>: <what happened>` (`M 7 woods: wolves
chain-pull on the road`). Several lines per message, German or English, a pasted bug
report, a screenshot or plain talk are all fine: never ask for the format.

| They write | The agent does |
|---|---|
| `start` + who is who | stamps the clock (`date`), answers Q15 from it |
| anything | logs each item in `docs/feedback.md` as `VS-P F<n>` with who, level, place, time and live build; fills the table below; replies short. A question gets an answer, not a change |
| `fix F3` / `fix: ...` | changes and verifies, never deploys; replies "ready" with the change, deploy type and what it does to the players |
| `ship` | the go for commit, push and deploy of what is "ready", and the statement that both players are safe. Then verifies and says "reload" |
| `break` / `back` | pauses / resumes the clock; at a break, asks the waiting questions as choice prompts |
| `end` | debrief by choice prompts (watch list, open §7 calls), each with "Decide later"; triage through the four doors; rulings into §2 |

While they play: no choice prompts unless a requested fix is blocked on one.

**A restart under a player (tested 2026-11-22, main world, local):** level, in-level XP and
quests are kept. The POSITION is not saved: after a reload the player stands at the bound
fire, or at the far western start if none was bound. The screen freezes with no banner
(F1), so always tell them to reload. Fights and a running ceremony are lost.

**Fix loop.** Content only (`--content-only`): quests, mobs, skills, recipes, ascension,
milestones, dialogue. Full deploy (~1 min): code, conf, and the content compiled into the
client (`zones`, `props`, `regions`, `atmospheres`, `lang/*/regions.arb`,
`skills/mobs/campfire-aura.json`). Before either: the Go suite (~20 s), `-validate`, and
for content only also `-validate` with a binary built at the live hash (L9). Not during
the session: renamed quest or stage ids, removed skills, `maxLevel`, migrations. After an
XP change, later levels no longer test §1.1: note the build beside them.

| Checkpoint (filled by the agent) | Predicted level | Actual level | Clock | Build | Notes |
|---|---|---|---|---|---|
| Leaving the Farmlands | 7 | 7 | 48 min | `e9c30279` | milestone + first Woods fire (§5.4) |
| Kobold Chief killed | 10 | not logged | | `e9c30279` | killed |
| Leaving the Deep Woods | 12 (11 without the bears quest) | not logged (replay: 12) | | `e9c30279` | bears quest left running |
| Entering Sorrowfen | 12 | not logged | ~87 min | `e9c30279` | |
| Spider Queen killed, quest handed in | 14 (15 killing everything) | **not reached**, ended at 13 | 121 min | `e9c30279` | quest never taken |
| Back at the city stone | 14, opens (needs 12 since VS1) | **not done** | | | VS1's look still owed |
| Ceremony + the heir's first minutes | heir at 1 | **not done** | | | |

**Watch for (the agent tracks these and asks at breaks about the unanswered ones):**

1. Is the Farmlands' hidden tunnel found by accident, and does it kill you?
2. Can you walk or tunnel out of the slice, and where?
3. Is the Dire Wolf quest doable with one wolf in the woods?
4. Does the bears quest feel like a level jump?
5. Does either combination appear (Paladin, Suppression)?
6. Do the caves need a light, and did you have one by then?
7. Does the City give you any reason to stay?
8. Is the Spider Queen a fitting last fight, solo and as two?
9. Which features did you never meet?

### 5.3 Feedback round 1 (VS-P, 2026-11-22): what is fixed when

55 notes, `feedback.md` VS-P F2-F56, plus F1. An imperative note is the POs' ruling (R18);
where one collides with an older ruling or leaves a gap it is a question (§7 Q18-Q25, all ruled the same day: R19-R26).
Evidence checked at `34da212b`, the pushes re-checked at `bc58a9cb`; the POs played
`e9c30279`. **Of the five commits pushed since, none closes a note:** `bc58a9cb` starts F48
in the Farmlands (+12 stags, +2 boars, two stags 1 → 2), and none makes a requested level
change. `77028018` retired Hans's wolf quest (R27).

**Order (R19, amended by R28).** PF1 → PF2 → PF3 (HUD) → then CW starts, beside
PF4 (Words) → PF5 → PF6 → VS3
(only after CW: levels and density both move XP) → VS4 → VS5. PF7 is optional. VS0's audit
and VS2's borders keep their place before VS3. One session per chunk.

⚑ **`api/zones/world.json` has one writer at a time.** PF2 makes all of this side's map
edits in one commit; the file goes to CW once PF3 is pushed (R28). Commit the generated copy
(`backend/pkg/api/zones/`) with every map edit; `23060f46` left it out (`bc58a9cb` caught it up).

| Chunk | Notes | Why together | Size | Deploy | Schema |
|---|---|---|---|---|---|
| **PF1 Rules and bugs** | F1, F40, F55 | Engine behaviour; F1 makes every later redeploy safer | S-M | full | DB none · wire none · conf none · content collision masks |
| **PF2 Quests, teachers, map batch** | F10, F22, F23 (species), F25, F26, F27, F29, F42, F43, F52 | Who gives what; every map edit this side owns | M | full | DB none · wire none (both new mobs reuse an entityType) · conf none · content +2 mobs +1 quest |
| **PF3 HUD** | F4, F9, F11, F12, F15 | Layout, one browser look | M | full | none |
| **PF4 Words** | F2, F13, F14, F17, F19, F20, F21, F28, F32, F33, F34, F38, F39, F41, F56 | All text, English + German in one pass | M | full (client strings) | DB none · wire none · conf none · lang |
| **PF5 Looks** | F5, F6, F7, F8, F16, F18, F30, F31 | One pick sheet for the POs, one atlas repack | M | full | DB none · wire none · conf none · icon keys |
| **PF6 Sound and level-up** | F3, F54 | The audio table | S-M | full | none, client data |
| **CW Coworker: levels, density, placement** | F23 (placement), F24, F35, F45, F46, F47, F48, F49, F50, F51 | §5.5; manual, in their own sessions | L | full (map) | content + zone |
| **VS3 Tuning** | F36, F37, F44, the stone to 16 (R20) | Needs CW's final levels | M | full (conf) | conf `killXP.base` · content quest levels |
| **PF7 Teachers on the map** | F53 | Optional; needs a small design first | M | full | DB none (`quests.talkedTo` exists) · wire + |

**PF1**
- **Step 0, main is red:** `TestContent_CrossValidatesWithNothingUnreachable` fails since
  `77028018`. Add `he-who-cried-wolf` to `parkedQuests` (R27).
- **F1:** the banner branch in `Backend.ts` `onclose` is never reached (likely cause, prove first).
- **F40 is not a regression.** `plan-immune-targets.md` C1 (`863f3884`) only puts immune
  targets last. Its D4, pinned by `TestDamageAura_AloneWithAnImmuneStructureStillStrikesIt`,
  keeps shooting one that is alone in range: zero damage, the cost and combat. **R23:** skip it. That pin and
  `immune-feedback.mjs` (venued on the Bramble wall) change with it; check the paths that
  select on their own (`chargeTarget`). ⚑ The skip belongs in eligibility: with one
  candidate `pickTargets` returns before `hurtableFirst` runs.
- **F55:** 48 mob files carry layer 97 (blocks players). Clear it on talking people and
  animals; stones, objects and bosses keep it. `layers.mobs.npcs` draws under
  `layers.characters` today and moves above. Check that E still offers.
  Herding steers by the sensor, not by bodies, but run one herd to the pen.

**PF2**
- **F22:** the Guard's grant and the journal's "Learned Taunt." go. The other source is the
  Rally Drummer's drop, outside the slice; Hold the Line needs Taunt. R25.
- **F27:** the Guard is Strong's only source, so it is unobtainable until re-homed (R25).
- **F23:** Young Wolves count for no quest (R27). A character still on the retired
  `he-who-cried-wolf` finishes it on forest wolves. The species lands here, CW swaps the
  spawns (Farmlands and Brackenfold).
- **F23/F25 against `plan-dionsburg-quests.md` R8/D8**, which retired this very quest: withdrawn (R21).
- **F25:** remove the Shaman's row and text; keep the stage id for saved characters.
- **F26 (park it in `parkedQuests` too):** remove the offer, keep the turn-in: Bob McMarble holds it running on live. Rules Q9.
- **F29 (R24):** a new species `MinerGuildAssociate` on the Miner's entityType, teaching
  Pickaxe only, styled on the Lumberjack Guild Associate. Spot: outside the Anvilguard
  Forge (about -43.5, -23.5) [PLACEHOLDER]. The debug Miner and his quest stay as they are.
  ⚑ The slice's three rockfalls are in the Farmlands, so they open on the way back.
- **F42:** cost 0.0116 + 0.001867 per level → 0.020 + 0.0032 [PLACEHOLDER], about 1.7×.
- **F43:** `respawnTicks` 9000 (5 min) per spawn in `world.json` → 3600 (2 min) [PLACEHOLDER].
- **F10:** beside the ascension stone in the nave, off the path to it [PLACEHOLDER];
  `c3-memorial` follows.
- **F52:** kill 8 Lake Crabs [PLACEHOLDER], priced at the crabs' placed level. Draft: row
  "Any other trouble in the camp?" · "These damn crabs keep crawling into our hammocks and
  pinching our toes. Get rid of them for me, would you, lad?" · accept "Good. Watch your
  toes out there." · running "Still hearing claws at night." · done "First good night's
  sleep in weeks. The crew owes you one." ("lad" is the POs' word, for every player.)

⚑ **PF2 reds to expect:** the roster pins in `items/mobs` and `cmd/simharness` (two new
mobs), `TestContent_QuestXPBudget` (the crab quest's entry), `c2-kill-quests` (runs the
bears quest end to end). Young Wolf needs its plural in both languages (D24).

**PF3** (desktop; the phone layout must not move)
- **F4:** one strip in the body for both: points + Reset (the Campfire tab already has it).
- **F9:** players draw at the 30 px default, NPC plates at 16: players → 16.
- **F11:** one row (?, magnifier, zoom in, level, zoom out) above the Focus bar, nothing removed (R26).
- **F12:** 2×2 under the minimap; badges move along; game tooltips, never `title`; the
  quest tracker takes the freed height.
- **F15:** a scrim on `#alertBanner`.
- **F12 needs four PONETI picks here,** ahead of PF5's sheet: show crops first, then
  a small atlas repack (PF5 repacks again).

**PF4** (display text only: ids and keys stay)
- **F2:** `NameGenerator.ts` is three arrays in code; the female list is never used. ⚑ Most
  names are The Flintstones' characters: replace before external testers. Move them to a
  data file, use both lists, stop `substr(0, 20)` cutting a name into an invalid one. A
  list needs about 40 first and 40 last names [PLACEHOLDER], letters or digits with single
  space ' - _ between them, first + space + last at most 20 characters.
- **F13:** the ambient bubble only; the greeting inside the dialogue stays. This also ends
  the Crier's case of the 2026-10-11 "hail overlaps !" row.
- **F14:** the second banner line (`Backend.ts`, key `unlock.appearance`).
- **F17:** a conditional line on `the-millers-ring` completed; "husband's" gets its apostrophe.
- **F19:** drop the root `ask-teach`; lost → herd → teachings already leads there.
- **F20:** tracker, journals and Reinhard's lines say Alpha Boar and lose the den; the
  title "The Beast of the Farmlands" stays (minimal change).
- **F21:** today's title is "The Pest in the Granary"; 3 quest lines + about 7 of Reinhard's.
- **F32:** content only: the five offer rows move inside the "What happened here?" node.
  Running and turn-in rows stay on the root.
- **F23's words:** the Crier's and the journal's "wolves on the west road" now mean the
  forest's wolves and say so.
- **F33:** also Fritz's two "near the road" lines.
- **F34:** nameplate + welcome. **F38:** the id `LongRangeStrike` stays.
- **F56:** three "nothing else" gate tooltips, 21 em dashes in the English UI file, the
  German equivalents, and up to 18 hardcoded candidates in TS/HTML to check.

**PF5**
- **F30: 18 placed NPCs share three faces.** Farmer (9): Reinhard, his wife, Benjamin,
  Farmhand, Hans, Hedda, Tobias, Zacharias, Woodcutter 3. Hooded woman (4): Henrik (F8),
  Fritz, Captain Brack, Deckhand. Prophet (5): Hermit, Fennick, Pim, the Governor, Wanderer.
- **F6: 16 skills have no `packIcon`:** the six camp traits, Hatchet (F31), Bulwark,
  Bursting Totem, Charge, Demoralize, Entangling Roots, Nature's Swiftness, Terrify,
  Thorns, Vanish. Check Recall and Camp too.
- **F38's icon:** Short Bow shares `spear-thrust` with both spear skills; pick a bow. Its
  projectile is already an arrow.
- **F5:** read as the `villager` appearance portrait (Human_01).
- **F7:** stop drawing the dwell circle; its range still drives discovery, E and flight.
- **F16:** player rings take the mob tier tint (dark grey) today, so each item needs its
  own tint. Avoid the elite silver and boss gold.

**PF6**
- **F3:** `music: forest` on Fields, FieldsForestBlend and Swamp. Part of both beaches and
  every sub-zone (barn, dens, caves) would fall back to the title; default: they play their
  region's forest track. A Farmlands track of its own waits for the composer.
- **F54:** today a banner + floating text. Add a rough burst on the token and one
  placeholder one-shot (audio C3 slice). Sound is muted by default (audio R1).

**VS3**
- **F37:** green is correct for the data: the quest is level 6 (green from 9, gray at 12),
  its wolves 8. A kill quest's level follows its targets' placed level after CW. Bob also
  confirmed watch item 3: 1 of 4 counted, one Dire Wolf in the woods.
- Kill base and quest levels: §5.4, under R22.
- **The stone (R20):** the four gates 12 → 16 after CW filled the Bluff, then `c2a` and
  `c1-front-stone` (which stone is cheaper) re-run. Until then an ascension is testable at 12.

**In-game (PO) per chunk:** PF1 redeploy under a player, a lone mushroom, walk through
Reinhard · PF2 both wolf quests, the Guard, Pickaxe, the crabs · PF3 1280×800 and 1920×1080
with six quests tracked · PF4 read each changed line in EN + DE · PF5 the pick sheet, then
a walk past every NPC · PF6 walk Farmlands → City → Swamp unmuted, one level-up · CW walk
each region at its level · VS3 a timed fresh run to the stone.

### 5.4 Example walkthrough: Bob McMarble (live, 2026-11-22; F36)

Read from the character's row (read-only) and the server journal. Times are minutes from
joining. Two players together (Q15). No cheat executed during the run.

| Minute | Recorded | What was happening |
|---|---|---|
| 0 | L1 | joins |
| 7 | | Harvest equipped |
| 22 | | Short Spear + Spear Throw from Henrik |
| 37 | L5 | Discipline milestone |
| 42 | | Summon Companion from the Dog |
| 48 | L7 | Haste milestone; a minute later the first Deep Woods fire |
| 70 | | Long-Range Strike (Dire Wolf drop), at 5 points by minute 75 |
| 87-90 | | swamp fires, Belt Lantern from Fennick |
| 91 | | both players die |
| 102 | | last skill change |
| 121 | **L13, 12,492 XP** | last save |

- **Quests:** 18 done (5,268 XP). Running: bears, Dire Wolves (1 of 4), mushrooms, Alpha
  Bear, the chest. Never taken: Spider Queen, He Who Cried Wolf (never spoke to Hans or
  the Governor), Back to the Pen.
- **Kills: 235, about 58 % of the XP** (7,224 after the death's loss). §1.1 predicted 23 %,
  because it counted only the kills quests ask for. **Kills, not quests, are the
  overleveling.** §1.1's end level was close for the wrong reason.
- **Not reached:** the Spider Queen and the ascension. VS1's PO look is still owed.

**Replay** of that ledger with the game's award formula. The save holds kills per species
only, so mob levels (from the spawns) and the order (by region) are assumed, and the death
is not modelled: it runs 11 % over the record. Compare rows, not absolutes. VS0's tool
(D2) takes over the replay and §5.5's density and road gauges, which were session scripts.

| Scenario | Out of Farmlands | Out of Woods | End | XP |
|---|---|---|---|---|
| As played | 7 | 12 | 13 | 13,832 |
| The requested levels (wolves 6, boars 4/6, swamp +3) | 7 | 13 | 14 | 17,169 |
| As played + open quests + bears | 7 | 12 | 15 | 19,488 |
| As played + open quests, no bears | 7 | 12 | 14 | 17,197 |
| Requested levels + open quests, no bears | 7 | 13 | 15 | 20,669 |
| The same, kill base 15 | 6 | 12 | 15 | 18,052 |
| The same, kill base 12 | 6 | 11 | 14 | 16,292 |
| Requested levels, as played, kill base 12 | 6 | 11 | 13 | 12,710 |

⚑ The level raises alone add about 3,300 XP, one level; more density adds more.
**Against the stone at 16 (21,611 XP), with the kill share accepted (R22):** at
base 20, the requested levels plus every open quest come within about 1,000 XP of 16 in
the replay (about 11 % optimistic), and a run like Bob's needs the Bluff for the last two
levels or so. Outlevelling a zone's mobs (F36) stays VS3's target. Re-replay after CW. The bluff
grind from 13 to 16 is 9,737 XP, about 46 at-level bandit kills.

### 5.5 CW: the coworker's list (nothing here is changed by the feedback sessions)

Baseline `bc58a9cb` (its moves kept the road counts as they were). `23060f46` moved six Deep Woods spawns at unchanged levels.

| Note | Asked | Today |
|---|---|---|
| F24 | Forest wolves ≥ 6 | 50 of 55 surface wolves are 3-5, the den's three are 5 |
| F23 | Farmlands wolves = Young Wolves | 6 in the Farmlands, 2 in Brackenfold (after PF2) |
| F35 | Boars 4 north, 6 south (north = smaller y, Reinhard at 8.6) | north 3-4, south and west 2-3; the Alpha Boar is 4 and would sit below its boars |
| F50 | Swamp 11-15 | 8-11, Giant Spiders 11-12, Spider Queen 12 (would sit below her swamp) |
| F45 | Bluff 13 south → 16 north, dense, all bandit types, elites in the north | 5 bandits of 5-7 + 1 bear. It borders level 6-7 woods: the entrance is a step of 6 levels |
| F46 | Bandits weaker for their level | against a wolf of the same level 1.96× HP and 1.8× damage, and the blade hits two targets; both scale from level 1, so the gap holds at every level. The harness's plain level-7 player beats the wolf and loses to the bandit in 200 of 200 |
| F48 | Always one on screen, usually 2-3 (screen 20×12) | empty screens: Farmlands 23 % (36 % before `bc58a9cb`), Brackenfold 86 %, Woods 14 %, Swamp 30 %, Bluff 86 %; medians 2, 0, 4, 1, 0 |
| F49 | Safe roads | spawns whose aggro circle touches a road: Woods 29 of 121 (28 before the map fix), Swamp 30 of 37 (unchanged), before wandering |
| F51 | More beach crabs | 6 (the quest asks for 8) |
| found | | the new bog patch at (-100.6, 101.7) lies on about 2 units of road; before the map fix no road centre was in a bog |
| found | | one Dire Wolf in the woods for a quest that asks for 4 |

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

- **Q1 - (⚑ stale since R20: re-propose up to 16 in VS3) The bands up to 12.** Proposed D4: Farmlands 1 → 5, Woods 5 → 9, City + Swamp
  9 → 12 [PLACEHOLDER], replacing the 2026-10-25 bands (Woods 4 → 7, Swamp 8 → 12).
- **Q2 - (deferred 2026-11-22 to VS5) Wipe the live DB before external testers?** It is
  losable (no backups, by ruling). With R12 nothing caps existing characters, but one at
  12+ can ascend at once.
- ~~**Q3 - Which stone ends the slice?**~~ RULED 2026-11-22: R14, the city stone.
- **Q4 - (deferred 2026-11-22 to after VS-P) Which audio lanes does the playtest need?** Proposed: C1 (foundation) + one-shots
  + region music; ascension music if it is cheap.
- ~~**Q5 - Are phones in the playtest?**~~ RULED 2026-11-22: R15, desktop only.
- **Q6 - (deferred 2026-11-22 to after VS-P) Character entries' D1–D11 approval**, owed
  before CE1 (`plan-character-entries.md`). It locks campfire Fly, which is free today.
- ~~**Q7 - Do the 4 debug-only givers and the Lantern quest come into the slice?**~~ RULED
  2026-11-22: R16, VS0's checklist decides.
- ~~**Q9 - `bears-at-the-walls`**~~ RULED 2026-11-22 by F26 (R18): the City Guard stops
  offering it; the turn-in stays for characters who hold it.
- **Q8 - (deferred 2026-11-22) German for new lines:** same change as always (D23), or a
  slice-wide pass at VS5? Proposed: same change. The standing rule (D23) applies meanwhile.
- ~~**Q10 - Where do the POs play today?**~~ RULED 2026-11-22: R13, live.
- ~~**Q11 - How is the ascension tested today?**~~ RULED 2026-11-22: by the fix, not the
  cheat: VS1 built, committed, pushed and fully deployed ahead of VS-P (L9).
- ~~**Q12 - R1 again: gate or cap?**~~ RULED 2026-11-22: R12, gate only.
- **Q13 - (deferred 2026-11-22; ⚑ the 12 below is 16 after R20) What opens the stone besides the level?** Level 12 alone opens it before the
  swamp. Proposed: level + `the-spider-queen` completed.
- **Q14 - The two level-14 tunnels:** keep, retune or close. Proposed: after VS-P.
- ~~**Q15 - How do the two POs play?**~~ ANSWERED by VS-P: together (the same level-5
  second, the same death).
- ~~**Q16 - When is the census script saved as a tool?**~~ RULED 2026-11-22: in VS0 (D2).
- **Q17 - (deferred 2026-11-22 to after VS-P) Approval of this plan:** both POs refine it
  with the playthrough's notes, then approve. Nothing further is built until then.
  ⚑ R19 ruled the fix order; PF1 got its own go 2026-11-22 (the PO's prompt); PF2 was built 2026-11-23. PF3 needs one.
- ~~**Q18 - End level and the Bluff**~~ RULED 2026-11-22: R20, stone 16, Bluff open.
- ~~**Q19 - Wolves on the Road against DQ R8/D8**~~ RULED 2026-11-22: R21, keep both.
- ~~**Q20 - Immune targets**~~ RULED 2026-11-22: R23, never targeted.
- ~~**Q21 - The Pickaxe's teacher**~~ RULED 2026-11-22: R24, a new guild associate.
- ~~**Q22 - Taunt and Strong**~~ RULED 2026-11-22: R25, re-home later.
- ~~**Q23 - The cut-off zoom note**~~ RULED 2026-11-22: R26, only horizontal.
- ~~**Q24 - XP**~~ RULED 2026-11-22: R22, after the level pass; 60 % from kills is fine.
- ~~**Q25 - The order**~~ RULED 2026-11-22: R19.
- **Q27 - What starts the Dionsburg news chain (DQ2) and leads to the Governor** now that
  Hans's quest is retired (R27)? Today nothing does. Proposed: decide with Annie before DQ2.
- **Q26 - Does R7's ~2 h still hold with the stone at 16?** Bob reached 13 in about 2 h.
  Proposed: keep 2 h to the Bluff and judge the last stretch at VS3's timed run.

## 8. Landmines

- **L1 - A conf cannot carry a slice-only cap.** `TestTrackedConfs_ResolveToIdenticalGameTuning`
  requires every tracked conf (the live one included) to resolve to the Go defaults. A cap
  of 12 means changing the Go default everywhere or exempting that pin. `backend/conf.json`
  is untracked, so no test may read it. (Trial 2026-11-22: 12 in `conf.default.json` alone
  turned that pin and the embedded-copy pin red.)
- **L2 - (only if a cap ever returns) The regen taper is relative to the cap.** `regenTaper`
  (`backend/pkg/aura/model/player/update.go:33`) reaches its floor (×0.4) at `maxLevel`:
  under a cap of 12, a level-12 player regenerates like a level-30 one did. Check with the
  guardrails; decide whether the taper should keep its 30-level span.
- **L3 - (only if a cap ever returns) Other `maxLevel` readers:** the XP table (`player.go:1564`, `:1601`),
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
- **L7 - Mob levels above 12** (⚑ above 16 since R20, and the Bluff is inside) stay in the sketch regions behind the borders; any that
  remain inside the slice (the Deep Woods spiders at 12–14, the City Guard at 30) must be
  re-levelled or deliberate.
- **L9 - Before `--content-only`, validate `api/` with a binary built at the LIVE hash.**
  On 2026-11-22 live `200a5046` would have refused HEAD's `heirHome` (reproduced: 7
  findings, the mobs do not load) and the deploy restarts into it. Live runs `e9c30279`
  since, so content only is open again until a content key needs newer code.
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

### VS1 - the ascension at 12 ✅ DONE 2026-11-22 `babc3674`, DEPLOYED LIVE 2026-11-22 as `e9c30279`, PO look = VS-P

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

### PF1 - rules and bugs ✅ DONE 2026-11-22 `6ed28a92`, PO walk passed, not deployed

- **Step 0:** `he-who-cried-wolf` is in `parkedQuests` (R27), `cleanup.md` #9.
- **F1, reproduced first:** the cause was as read. `isJoinInFlight()` was `playing !== null`,
  true for the whole session, so every close ran the refused-join retry. Two faces: a frozen
  world, or (server back at once) character select over a dead socket. An F5'd tab never had
  it (`reconnect()` does not set `playing`). It is now true only from a sent join to its
  Accept; `playing` stays for the retry. A logout in another tab now gets the banner too
  (by reading).
- **F40 / R23:** `selectDamageTargets` drops what the hit can never hurt in eligibility, so
  alone it is empty ground. `hurtableFirst` and `pickTargets` are gone. D2 holds.
  **`chargeTarget`** carries no tags, so it skips only what no ungated hit can hurt
  (`NeverHurtBy(["*"])`: the seven harvest species). This is the session's reading of R23,
  for the PO to confirm: Charge at a lone mushroom is now refused like empty ground.
- **F55:** 34 of the 48 layer-97 files → 96 (people, the dog, the four sheep). 14 keep 97:
  the two ascension stones, the memorial, the forest sign, the three roots, Grandfather
  Knot, the two remains, the sunk chest, the cave mouth, the two portals. No boss carried
  97, so "bosses keep it" needed no edit. `layers.mobs.npcs` moved above the characters
  (supersedes `plan-prop-draw-order.md` D9 for talkers; Sheep joined it); what blocks, and
  `NpcPlaceholder` (shared with hostile species), moved to a new `layers.mobs.fixtures`
  below. The content editor's new-NPC template is 96 too; on placeholder art it still
  draws under the player. Pins: `talker_collision_content_test.go`, `Mobs.layers.test.ts`,
  `TestNpcBody_PlayersPassThroughPeopleAndNotObjects`.
- **Schema:** DB none · wire none · conf none · content 34 collision layers (+ their
  comments) · zone none · lang none.

**Verified**
- Go build + full suite 0 FAIL (40 packages) · `store` + `accounts` on `aura_test`,
  uncached: ok · vitest 2017/0 · typecheck · `-validate` 0 in both zone sets.
- Server restart under a client: joined (SIGTERM, instant restart, SIGKILL), reloaded and
  respawned show the banner; a reload gets back in (checked on two of them). Dead: shown,
  but dimmed (below). At character select: invisible, the same at HEAD.
- `immune-feedback` rewritten, 4/4 (1 earlier run: 3 legs + the §29 context loss) ·
  `chunk3b-interact` 14/14 · `c3-charge` 6/6 (2 earlier runs inconclusive on the venue) ·
  `p1-prop-order` 10/10 · `herd-h1` 4/4 · `herd-h2` 3/4, six sheep penned. Both herd
  scripts were blind at HEAD (icon pack) and are repaired.
- Red at HEAD `39c3356e` too, run on an export: `herd-h2`'s Woolliam leg (its oracle),
  `r4-badge` 3/5, `passages` (venue drift before joining). The layer-name edits in the
  last two are therefore unexercised.
- **Not run:** `chunk2-accounts` (owns `AccountFlow`): its leg 8 writes the dev database
  `aura` by name (`psql -d aura`), whatever database the server uses. Not affected, not
  run: `c3-player-roster` (orders campfire and wildlife only), `bridge-underfoot` (prop
  containers untouched).
- **Not seen in game:** walking through a person (physics test only), a blue mushroom (the
  harness used a Bramble), herding on foot (the harness warps). All three were put in the walk (result below).

**Found, not built (each one proposed rule, for the PO)**
- The banner fades after 4.5 s: keep "Connection lost" up until the reload.
- It sits under "You Died" (whose Respawn is then dead), under the guest registration nag,
  and inside the hidden HUD at character select: draw it above all screens.
- `slow_aura`, stun, fear and the other non-damage effects still pick a mushroom (by
  reading): Slow pays there, and Hoarfrost, Suppression and Warbanner enter combat through
  their slow. Extend R23 to every enemy-targeted effect.
- A player's instant cooldown still pays on cast beside a mushroom, as into empty ground
  (D8): leave it.
- `chunk2-accounts` should take its database from the environment.

**In-game (PO)**
1. Join through Play, restart the server: "Connection lost"; reload gets you back in.
2. A lone blue mushroom with Damage on: no shot, no "Immune", no combat. With Harvest: it
   pops. Charge at it: "No valid target".
3. Walk through Reinhard: not blocked, he draws over you, E still offers. The city's
   ascension stone still blocks and draws under you (the forest sign is placed only in the
   debug world).
4. Herd one sheep into Hans's pen on foot.

**Walk result, 2026-11-22:** PO "all works" for steps 2-4. Step 1 was not walked and the
PO waived it: "I dont need to manually test the restart, rest is fine". F1 rests on the
restart probe (stop, instant restart and kill all show the banner).

### PF2 - quests, teachers, map batch ✅ DONE 2026-11-24 `4dc4de15`, PO walk passed, not deployed

Built 2026-11-23, wrapped 2026-11-24 after the PO's walk.

- **F22 + F27 (R25):** the City Guard teaches nothing. His Taunt grant on the wolf turn-in
  and his Strong row are gone, and the journal's "Learned Taunt." with them. ⚑ Strong has no
  source now until it is re-homed; Taunt's other source is the Rally Drummer's drop.
- **F25:** the Shaman's wolf turn-in row and its text are gone. `wolves-on-the-road` turns in
  at the Guard alone; the crier's brief and the journal name only him. `told-shaman` stays
  for saved characters: a new `retiredStages` map in `quests/content_test.go` exempts it from
  "every stage reachable" and goes red if anything enters it again. The D9 content pin
  became `TestContent_TheWolfQuestTurnsInAtTheCityGuardOnly`; `TestLedger_BranchEdgesExclusive`
  still covers the branch mechanism on fixtures.
- **F26:** the Guard's bears offer is gone, the turn-in stays; `bears-at-the-walls` is in
  `parkedQuests`.
- **F23:** new species `YoungWolf` (id 139, the Wolf's stats, bite and Swift drop on the
  Wolf's entityType), plural in EN + DE. No quest counts it. Not placed: CW swaps the
  Farmlands and Brackenfold spawns.
- **F29 (R24):** new `MinerGuildAssociate` (id 140, the Miner's entityType, standing
  talkable shape, layer 96) at (-44.6, -23.4) outside the Anvilguard Forge, teaching
  Pickaxe only.
- **F42:** Long Range Strike costs 0.020 + 0.0032 per level [PLACEHOLDER].
- **F43:** all six `respawnTicks` 9000 → 3600 [PLACEHOLDER].
- **F10:** the memorial moved from (-211.62, 5.72) into the nave at (-24.6, 2.6), 3.4 units
  from the stone. The debug world's pair is unchanged, so `c3-memorial-catalog` (a DEBUG-venue
  harness) needed no edit.
- **F52:** `crabs-in-the-hammocks` at Captain Brack: kill 8 Lake Crabs, 710 XP (the L9
  half-level rule, crabs placed at L9-L10), two-row shape, the POs' draft text, German
  beside it. `LakeCrab`'s name became a plural.
- **Tiled palette** carries both new mobs.
- **Schema:** DB none · wire none (both new mobs reuse an entityType) · conf none ·
  content +2 mobs +1 quest, 4 conversants, 1 skill cost, 2 quest comments · zone memorial +
  associate placed, 6 respawn values · lang EN + DE.

**Verified**
- Go build + full suite 0 FAIL (40 packages), `-count=1`, `store` + `accounts` on
  `aura_test` · `-validate` 0 findings. vitest and typecheck not run: no frontend change.
- `pf2-slice-world` (new, LIVE world) 13/13: the memorial and the stone each answer for
  themselves, the associate teaches Pickaxe, the crab quest runs offer → 8 real kills →
  turn-in paying exactly 710 XP. Its run logged the headless WebGL context loss (backlog
  §29) and a follow-on `terrain` pageerror.
- `c2-kill-quests` 23/23 ×3 (debug) · `c3-memorial-catalog` 14/14 (debug). `chunkC4-quests`
  not run (27/39 at HEAD before PF2).

**Walk result, 2026-11-24:** PO "all works as expected": crier, Guard, memorial and stone,
the associate, the crab quest, Long Range Strike's cost, the 2-minute respawn.
