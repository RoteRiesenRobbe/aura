# Plan: Grandfather Knot, the wise old tree

> **Status: BUILT 2026-10-03, UNCOMMITTED (one PO session, D1-D11 ruled; the PO
> said "go ahead and implement him", so C1 and C2 landed together, ledger
> §11).** Harness `gk-grandfather-knot.mjs` 23/23. ⭐ **PO in-game pass
> 2026-10-03: "i did the checks, all works."** Then a story pass the same day
> (D12-D14): the knots became three sleeping ROOTS, he got a reason, and the
> errand split into two quests. Still
> open: the roots' landmarks
> (§8 Q8), the numbers (§8 Q3), chain-rooting (§8 Q4). Line refs from HEAD
> `dd3f3582`.

Origin: the PO's brief (2026-10-03, translated): *"Has you clean up the forest
and walk around a bit aimlessly. But you get something cool for it. Entangling
roots or so."* Inspiration image (not in the repo): a smug, kindly old tree face
with moss hanging from its crown, holding a spatula beside a stove under a
speech bubble that reads "ORDERS HERE!".

---

## 1. What this is

An ancient tree NPC in the Glimmerwood, **Grandfather Knot**, who gives two
quests in a row (D14):

1. **"Clear the Grove"** (`clear-the-grove`): clear the deadwood from his grove
   (a `harvest` objective). Kept simple, no story yet.
2. **"The Sleeping Roots"** (`the-sleeping-roots`), offered only once the grove
   is done, with the story as its intro: wake three of his sleeping roots spread across the Glimmerwood, **one at a
   time**, coming back to him between each. He sends you to the "wrong" one
   twice.
   At the turn-in he lets slip why: you have walked his roots end to end, and
   now they know your hand. He teaches **Entangling Roots**.

**The story (D12):** he is the oldest tree in the Glimmerwood and his roots run
under the whole wood; through them he hums it to rest. Deadwood has choked his
grove and three roots have fallen asleep, so the hum no longer reaches the young
treants, and they have turned angry (which is why the Treants there attack). He
cannot feel which root sleeps, which is the whole trouble, and the joke behind
the "wrong" root. The ending stays honest with the game: the treants stay
hostile, because "a tree's day is long".

The walking that seems pointless is the content. It's the `the-strays` idea
("the lesson is the walk, not the text"), here with a reveal at the end.

### What it is not

- No new engine vocabulary. Everything below was authorable already (§3).
- Not a long series: two quests, then he is done with you for a century.
- No quest markers (PO 2026-07-29, backlog §42 still stands).

---

## 2. Decision ledger (PO 2026-10-03)

| # | Decision | Ruling |
| --- | --- | --- |
| D1 | The NPC | A wise old tree that gives an errand quest and rewards a root skill (PO brief) |
| D2 | Name | **Grandfather Knot** (PO picked from three proposals) |
| D3 | Voice | **An exception to the plain-text rule** (PO 2026-08-02). His dialogue is written in a voice; the voice in §3.4 is approved ("the voice is good") |
| D4 | Back-and-forth legs | **3** roots, with a return to him between each |
| D5 | Area | **The Glimmerwood** (`glimmerwood`: Wisps L13-14 and Treants L14-15, so he stands among his own kind) |
| D6 | The reward | **A new skill, Entangling Roots.** No root skill existed, but the engine already supported one (§3.5) |
| D7 | Elites and bosses | **Immune, as they already are.** `ccImmune` refuses every slow (`model/mob/mob.go:1271`), so nothing needs authoring. Raised so the PO could ask for an exception; none asked |
| D8 | Does the deadwood need Harvest? | **Yes** (was Q1). `Deadwood` is a Harvest-gated species like the Turnip, and his brief names Harvest |
| D9 | Knot names vs placement | **The names come first**, and each root is placed where its name makes sense (was Q2): `StreamRoot` by water, `StoneRoot` by rocks, `GladeRoot` in a wisp glade |
| D10 | His size | **Twice a normal NPC** ("make him also twice as large as normal npcs"): body radius 0.7 against the standard 0.35; an NPC's drawn size follows its wire radius |
| D11 | His border | **`forestBorder.png`, the bark ring** (was Q7; PO: "forest border also makes sense, no?"), not the grey `npcBorder.png` the other talkers wear. A one-line swap in `Graphics.ts` if it reads as wildlife in play |
| D12 | The story, and knots → roots | **The sleeping-roots story (§1)** (PO 2026-10-03, after the in-game pass: "knot" was "too undescriptive and bland", with no reason for it to matter). The three talk_to targets became `StreamRoot` / `StoneRoot` / `GladeRoot` (ids 110-112 kept); "Knot" stays his own name, the bark knot on his temple |
| D14 | Two quests, not one | **Split** (PO 2026-10-03, asked whether a follow-up can unlock after the first): `clear-the-grove` simple, then `the-sleeping-roots` with the angry-trees story as its intro, offered only once the first is `completed`. XP **split, not doubled** (option a): 600 + 1000 = the single quest's 1600 |
| D13 | Each stage its own words | **He stops talking about the deadwood once it is done** (PO: "during the knot quests, he still talks about the deadwood"). The brief and the deadwood reminder are stage-gated nodes, every step's row sits on his greeting. PO line edits: "Have you met them?" (was "You have met them."), "Clear the deadwood." (no "with Harvest"), and the closing "Come back in about a century, little walker. Tell me how your journey went." |

---

## 3. The design

### 3.1 The cast (five new mob definitions)

| Definition | Role | Shape |
| --- | --- | --- |
| `GrandfatherKnot` (109) | Quest giver, teacher | Hermit pattern (`hermit.json`): faction `townsfolk`, `role creature`, `speed 0`, `xpFactor 0`, `collisionLayer 97` (solid, streamed, NOT on Action, so no aura on either side reaches him). Body radius **0.7** (D10), `interaction.range` 2.4 so the reach from his bark matches a normal NPC's [PLACEHOLDER] |
| `StreamRoot`, `StoneRoot`, `GladeRoot` (110-112) | `talk_to` targets: touching one (opening its panel) wakes it | Baabara pattern (`baabara.json`): unattackable, one lore node and no options. ⚑ **Three definitions, not one with count 3**: `talk_to` is keyed by the DEFINITION id, so three spawns of one definition would count as one |
| `Deadwood` (113) | Harvest species | BlueMushroom/Turnip pattern: `role structure`, `speed 0`, wildcard resistance with `harvest` let through, `gateKeys ["harvest"]`, `xpFactor 0.05` |

**Art.** His portrait is a first draft ("good for now", PO), drawn 2026-10-03
from the PO's reference image in the medallion style (256 px PNG, the disc and
gradient of `hermit.png`, the bark ring on top, D11):
`frontend/src/features/game-objects/assets/resources/grandfatherKnot.png`, its
source `grandfatherKnot.svg` beside it, EntityType `GrandfatherKnot = 114`.
`Deadwood` draws its own branch heap (`assets/mobs/deadwood.svg`, EntityType
`Deadwood = 115`, the mushrooms' scatter at 26-32 px): the first reuse tried,
`Bramble`, draws at a fixed 58-66 px in a bark ring and buried the tree in
medallions as big as he is (§9 P5). The roots reuse `Signpost`, the standing
art for a talkable object (§9 P6). All three are rows in `docs/art/assets.csv`.

### 3.2 The quests: `clear-the-grove`, then `the-sleeping-roots`

Every transition uses the shape that already ships: objective stages advance by
themselves, dialogue stages advance on one of Grandfather Knot's rows. The
second quest's offer sits on a node gated on `clear-the-grove` `completed` AND
`the-sleeping-roots` `not_started` (manual §6, gating one quest on another).

| Quest | Stage | Kind | Objective / tracker | Left by |
| --- | --- | --- | --- | --- |
| grove | `tidy` | objective | `harvest Deadwood ×6` [PLACEHOLDER], "{n}/{m} deadwood cleared" | itself |
| grove | `tidied` | dialogue | "Return to Grandfather Knot" | his row "The grove is clear." → `cleared` (+600 XP) |
| grove | `cleared` | terminal | | |
| roots | `root_one` | objective (entered on accept) | `talk_to StreamRoot`, "Wake the root by the stream" | itself |
| roots | `back_one` | dialogue | "Return to Grandfather Knot" | his row → `root_two` |
| roots | `root_two` | objective | `talk_to StoneRoot`, "Wake the root by the stones" | itself |
| roots | `back_two` | dialogue | "Return to Grandfather Knot" | his row → `root_three` |
| roots | `root_three` | objective | `talk_to GladeRoot`, "Wake the last root" | itself |
| roots | `back_three` | dialogue | "Return to Grandfather Knot" | the turn-in row → `rooted` |
| roots | `rooted` | terminal | | |

Its middle legs are dialogue rows leading back INTO objective stages; entering
one re-baselines its `talk_to`, so a root talked to before its leg needs a
fresh talk (pinned in `TestContent_GrandfatherKnotsQuestsWalkEndToEnd`).

The turn-in row is one atomic row: `advance_quest` (index 0), `teach_skill
EntanglingRoots`, `grant_xp`. Same shape as the Lantern on
`lampless-traveller.json`.

**XP: 1600 split 600 + 1000** [PLACEHOLDER] (D14), the L9 half-level rule (kept by
`plan-xp-progression.md` D2) at the zone's L14: ½ × 300 × 1.2^13 ≈ 1605,
rounded the way the other pins round. Like `the-strays`, the walking does not
raise the price: the rule prices the level, not the effort.

**The journal stays plain** (§9 P1): the stage `journal` and `tracker` strings
follow the plain-text rule. Only what he SAYS carries the voice.

### 3.3 His conversation (D13)

Each stage has its own words. His greeting (`root`) carries every step's row,
and the show-rule leaves exactly the walkable one; the brief and the deadwood
reminder are nodes gated on their stage, so neither can be read once it no
longer applies. When the node a player is reading stops applying (the brief,
the moment they accept), the panel falls back to the greeting and the reply
stays on screen. One conditional greeting sits above `root` once the quest is
`completed`.

| When | Row (the player says) | His line |
| --- | --- | --- |
| Greeting | — | "Ah. A little walker. You move so... quickly." |
| Grove brief (`grove_brief`, gated grove `not_started`) | "Do you have a task for me?" | "My grove is choked with deadwood, little walker. Clear it for an old tree?" |
| Accept | "I'll do it." | "Good. I will wait. I am good at waiting." |
| While clearing (`deadwood`, gated `tidy`) | "About the deadwood." | "Six heaps will do. The rest can wait a winter." |
| Grove turn-in | "The grove is clear." | "Ah. I can breathe again." / "Take this, little walker. Slowly. There is no hurry." (600 XP) |
| Roots brief (`roots_brief`, gated grove `completed` + roots `not_started`) | "Do you have another task?" | "The young trees of this wood have grown angry, little walker. Have you met them?" / "My roots run beneath all of it. Through them I hum the wood to rest. But three of my roots have fallen asleep." / "Wake them for me. One sleeps by the stream, to the west. Lay a hand on it." |
| Accept | "I'll do it." | "Good. West, to the stream. I will be here." |
| Root 1 | "The root by the stream is awake." | "Hm. That one was awake already. Or it is now. Try the one by the stones, to the south." |
| Root 2 | "The root by the stones is awake." | "Was it warm? No? Then it was asleep. Good. The last one lies east, where the wisps gather." |
| Turn-in | "The last root is awake." | "There. Do you feel it? You have walked my roots end to end." / "They know your hand now. Ask them to hold, and they will." / "The young ones will not calm in a day. A tree's day is long. Take this as well." |
| Each root leg (`where_*`, gated per stage) | "Which root was it again?" | "West, little walker. The root by the stream." · "South. The root by the stones. Take your time. I do." · "East, where the wisps gather. The last one. Probably." |
| After (`root_done`, gated roots `completed`) | — | "Come back in about a century, little walker. Tell me how your journey went." |

The roots, when touched (short and physical, not in his voice): "A cold root,
damp from the stream. It stirs under your hand." · "A root clenched around the
stones like a fist. It loosens under your hand." · "The wisps drift around a
root that hums. Somewhere, an old tree smiles."

The directions carry a compass word (west, south, east) as well as the
landmark, so they hold before the landmarks exist (§8 Q8).

⚑ At a 1280 × 800 window the three-line roots brief pushes the accept row below the
panel's fold (`#conversation` caps at 40vh and scrolls its body): the player
scrolls once. Fine for now; a shorter brief or a taller cap if it bites.

### 3.4 The voice (D3, approved)

**Slow, smug and kind.** Ancient, never in a hurry, mildly amused at how fast
you are. From the image: he takes "orders" like a man behind a counter, and he
is the one giving them.

- **Thinks in seasons**: "a moment" means a winter, "recently" a hundred years ago.
- **Calls you "little walker"**, sometimes "sapling".
- **Short lines with pauses.** He never rambles; he just takes his time.
- **His mistakes are on purpose.** He sends you to the "wrong" root because the
  walk is the lesson, and never admits it until the end.

Any later line for him (a hail, an idle bark) should be checked against these
four.

### 3.5 Entangling Roots

A **cooldown** built on `instant_slow` with `slowFraction` **1.0**. The loader
accepts the range (0, 1] (`skills/definition.go:2688`). A 100 % slow is a real
**root**: the target cannot move but keeps its aura and keeps hitting whatever
is in range. That is exactly the difference the `ApplyStun` comment draws
(`model/mob/mob.go:1278`). `instant_slow` is capped and selector-picked like
the stun (`definition.go:1509`), and cooldown-only (`:1575`). The stuck
watchdog already skips a mob with no expected movement (`model/mob/stuck.go`),
so a rooted chaser does not camp or force-leash.

As authored (`api/skills/entangling-roots.json`, id 157), every number
[PLACEHOLDER]: 3 nearest enemies within 2.5 u, rooted 90 ticks + 9 per level,
600-tick cooldown, cost 3 % of max (+0.4 %/level), maxLevel 5, a green `wave`
on `fired`, glyph `lorc/vine-leaf` (no `packIcon` yet: the seat holder picks
one).

`slowFraction` cannot grow past 1.0, so levels buy **duration** (pinned: 1.0 at
every level).

**Its identity is positioning:** pin a pack inside your aura, or a melee mob
outside its own reach. Melee mobs held at range are neutralised; ranged and aura
mobs are not. That fits the GDD's "positioning and cooldown timing are the only
skill expressions". Against Paralyze (single target, full stun, ~30 s): Roots
is wider and weaker.

**Sole source:** this quest's turn-in row, the way the Lantern's only source is
`the-lost-lamp`. Abandoning is safe (it re-offers).

---

## 4. Placement

Placed 2026-10-03 in the `glimmerwood` area of `world.json` so the quest can be
walked; the PO moves anything in Tiled (U5 is dropped, PO 2026-09-10).

- The tree at (40, −148).
- Eight Deadwood 3.6-5.4 u around him, respawn 600 ticks (the Turnip's), so six
  is a chore and not a wait.
- `StreamRoot` (22, −160) west, `StoneRoot` (30, −118) south, `GladeRoot`
  (76, −163) east by the wisps: legs of 21.6, 31.6 and 39 u, each longer than
  the last. **Keep them spread**: a tight cluster removes the walk (the
  `the-strays` lesson).
- ⚑ The Glimmerwood has no stream and no stones yet (§8 Q8).

---

## 5. Fun and fairness

- **Three legs and no more** (D4): funny once, a chore by the fourth.
- **Each leg is a little longer** than the one before, so the last walk feels
  like the "real" one.
- **The Harvest prerequisite** (D8) is the one place a player can get stuck.
  His brief names Harvest; the opening arc (Benjamin) and Reinhard teach it.
- **Chain-rooting:** slows do not run through the stun's diminishing-returns
  ladder, so several players taking turns could hold a normal mob rooted
  indefinitely. Harmless in PvE, and arguably "players filling roles". Flagged
  to the PO 2026-10-03; nothing asked (§8 Q4).

---

## 6. Schema and wire impact (stated per the standing rule)

- **DB: NONE.** A new quest id and skill id are data in existing columns.
- **Wire: +2 `EntityType` enum values**, `GrandfatherKnot = 114` and
  `Deadwood = 115` (bindings regenerated). The roots reuse `Signpost`.
- **conf: NONE.**
- **Content:** +1 skill, +5 mob definitions, +2 quests, 12 spawns in
  `world.json`'s `glimmerwood` area; the Tiled palette regenerated.

---

## 7. Chunk breakdown (both landed together, §11)

- **C1: Entangling Roots, the skill**, with the root pins.
- **C2: the quest and the cast**, the census pins, the placement and the
  harness.

### Test strategy (as run)

- Go: `model/mob/root_test.go`; `quests/content_test.go` (census, XP pin, the
  sole-source + 1.0-at-every-level pin, the quest walked end to end with the
  early-talk trap); the `items/mobs` censuses; the skills registry count;
  `-validate` on the main, debug and embedded sets.
- Harness: `.claude/skills/verify/gk-grandfather-knot.mjs` reads every position
  from `world.json`, so a Tiled move does not redden it.

---

## 8. Open questions

- ~~Q1: does the deadwood need Harvest?~~ Ruled D8: yes.
- ~~Q2: root names and directions.~~ Ruled D9: names first, placed to fit.
- **Q3: the numbers.** Deadwood count, XP, and every skill number are
  [PLACEHOLDER] and want a PO pass.
- **Q4: chain-rooting** (§5). Leave it, or give slows a ladder later?
- ~~Q5: wire the portrait?~~ Yes, by "go ahead and implement him" (§6).
- ~~Q6: is the portrait final?~~ PO 2026-10-03: "portrait is good for now".
- ~~Q7: which border?~~ Ruled D11: the bark ring.
- **Q8: the landmarks.** The Glimmerwood has no water and no rocks, so "by the
  stream" and "by the stones" point at nothing yet. Add a stream and a few
  stones by the roots in Tiled, or move the roots to where those exist.
- ~~Q9: the root in a fight.~~ Covered by the PO's in-game pass 2026-10-03
  ("all works"); the numbers stay placeholders under Q3.

---

## 9. Proposals adopted without a choice prompt (PO may veto any)

- **P1:** the voice exception covers his dialogue only; the journal and tracker
  stay plain.
- **P2:** the roots are three named definitions (forced by `talk_to` keying, §3.1).
- **P3:** Entangling Roots is a cooldown (not an aura or a passive), so it does
  not compete for the one active-aura slot.
- **P4:** the turn-in is the skill's only source.
- **P5:** `Deadwood` got its own small sprite and enum value rather than
  borrowing `Bramble` (too big, §3.1 Art).
- **P6:** the roots wear `Signpost`, the talkable-object reuse, until art exists.
- **P7:** a "Which root was it again?" row per leg, so a player who forgot the
  direction can ask without opening the journal.

---

## 10. Landmines

- ⚑ **Census pins**: any new mob/NPC reddens the `items/mobs` census tests.
  Update them; do not loosen them.
- ⚑ **`TestContent_QuestXPBudget`** (`quests/content_test.go`) carries the
  quest's 1600; a re-price changes it there too.
- ⚑ **`slowFraction` below 1.0 turns the reward into an ordinary slow**;
  `TestContent_EntanglingRootsIsQuestOnlyAndRootsAtEveryLevel` pins it.
- ⚑ **A conversation closes the journal** (one panel at a time); a harness that
  reads the journal right after a row click reads nothing.
- ⚑ **A zone edit is half-live**: restart after the Tiled save, and run
  `cp-defs` by hand on the Windows box (no `make`).
- ⚑ **Content edits do not bust the Go test cache**: `-count=1`, and rebuild
  after any `api/` edit.

---

## 11. Chunk ledgers

### Story pass + split (D12-D14) — 2026-10-03, UNCOMMITTED

The knots became `StreamRoot` / `StoneRoot` / `GladeRoot` (ids 110-112, files
renamed); `the-old-roots` became `clear-the-grove` + `the-sleeping-roots`
(stage ids `root_*`: nothing persisted them yet); his conversation was rebuilt
with stage-gated briefs. Tests moved with it (quest census, XP pin 600 + 1000,
the sole-source pin on `the-sleeping-roots`, the two quests walked end to end).
Go green on the touched packages, `-validate` 0 ×3, palette regenerated. The
harness was rewritten for the two quests; its last run went green through the
grove offer, accept and reminder (A1-A7), then stalled at 3/6 deadwood: the heaps
now carry spawn level 12 and the test character was level 1. It now plays at
`XP 20000`; not rerun before the commit.

### C1 + C2 — BUILT 2026-10-03, UNCOMMITTED

Built in one execution session at the PO's word ("you can go ahead and
implement him"), so the two chunks did not get their own sessions.

- **Skill:** `api/skills/entangling-roots.json` (§3.5).
- **Cast:** `grandfather-knot.json` (109), `stream-knot.json` (110),
  `stone-knot.json` (111), `glade-knot.json` (112), `deadwood.json` (113).
- **Quest:** `api/quests/the-old-roots.json`, nine stages as §3.2.
- **Client:** `Mobs.GrandfatherKnot` (medallion + bark ring) and
  `Mobs.Deadwood` (scatter), their `Graphics.ts` entries and
  `gameObjectClasses` slots; `deadwood.svg`.
- **Tests:** `model/mob/root_test.go` (a full slow holds the mob and is not a
  stun; an immune species walks on; expiry restores movement);
  `quests/content_test.go` (census, XP pin, sole source + 1.0 at every level,
  the quest walked end to end including the early-talk trap); the three
  `items/mobs` censuses (creatures 82 → 86, xpFactor-0 47 → 51, Deadwood among
  the structures and the paying structures); the skills registry 121 → 122.
- **Verified:** `go build ./...` · `go test -count=1 ./...` green bar the known
  `TestPropContent_C1bMigrationPreservesLookAndCollision` · `-validate` 0
  findings (main, debug, embedded) · vitest 1518/0 · typecheck · palette
  regenerated · harness `gk-grandfather-knot.mjs` **23/23** (offer, six
  deadwood with a real Harvest aura, the three legs each with exactly one
  "which knot" row, the turn-in teaching EntanglingRoots, the completed
  greeting); screenshot `.claude/skills/verify/gk-tree-run5.png`.
- **PO pass:** 2026-10-03, in game: "i did the checks, all works."
- **Schema:** DB NONE · wire +2 `EntityType` values · conf NONE.
- ⚑ **Parallel session:** a second session edited the coast props at the same
  time, in the same files (`server.fbs`, `Graphics.ts`, `GameStateMessage.ts`,
  `assets.csv`, the palette, `world.json`). The regenerated bindings carry both
  sessions' enum values; split the commits with care.
