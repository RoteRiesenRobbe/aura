# Plan: Dionsburg quests: the forest's news reaches the city, and the city answers

**Status: DESIGNED 2026-11-12 (planning session, PO in chat), from Annie's 2026-11-08 feedback
(`docs/feedback.md`). R1-R10 RULED, D1-D12 PROPOSED, nothing built.** Open calls in §7 (two are
Annie's). 3 chunks (§5); DQ1 can start once the PO approves and the build order has room (Q1).

**Owns:** five new Dionsburg NPCs' conversations (Yolanda Nalweri, Lynora, General Geoffrey
Mulbrey, Gwendolyn, the city guards later), three new quests (`a-cure-for-the-wounded`,
`a-nasty-poisoning`, `unsustainable-working-conditions`), the reshaped `the-stolen-shipment`,
`he-who-cried-wolf` and `oil-for-the-lamps`, and the Town Crier's `wolves-on-the-road` leaving play.
**Builds on:** the quest engine as it stands (`kill`, `harvest`, `talk_to`, `reach` objectives;
`offer_quest` with `toStage`; `advance_quest`; line and row `conditions` with `any`/`all`), the
two-row quest shape (`archive/plan-quest-dialogue.md`), greeting lines with conditions (dialogue
pass 2026-10-25), the city layout (`content-city-dionsburg.md` §2-§3).
**Amends:** `content-zone-2-woodland.md` §3.8 (the oil gate: shipment-or-level-7 becomes a
mushroom barter, R3; the shipment's recipient becomes Yolanda, R4).
**Replaces in play:** `wolves-on-the-road` (the Crier stops offering it; the file stays, R8).
**Schema (as designed):** DB none · wire none (every new NPC reuses art through `entityType`) ·
conf none · content +4 mobs +3 quests, 3 quests gain stages · zone +4 NPC spawns in `world.json`
(`city-hub`) · lang +~120 keys en + de.

⚑ Line references pinned 2026-11-12 at `caf8add7` (main) plus the uncommitted text pass of the
same session; re-verify before relying on them.

---

## 1. What this is

Annie, the quest writer, reworked the Farmlands and Deep Woods dialogue (applied the same session,
§11 "Text pass") and sent a brief for Dionsburg: the forest's troubles (kobolds, spiders, a
stolen shipment of medicinal herbs, wolves pushed into the farmlands) should lead the player into
the city, where four new people answer them and open the war at the gate. Her brief, condensed:

- **The shipment** goes to **Yolanda Nalweri**, a gnome in the Gilded Tankard. The herbs in it
  are for medicine; she asks the player to take it to the **Military Hospital** by the south gate
  ("A Cure for the Wounded"). A lore row "Tell me more about the war" explains the orc front
  outside the gate, the siege that the paladins pushed back.
- **Gwendolyn** at the hospital takes the medicine, then offers "A Nasty Poisoning": the soldiers
  suffer a poison the herbs only slow; forest spiders carry something like it; kill 6 for their
  poison glands and take them to Yolanda.
- **The wolf news**: "He Who Cried Wolf" ends at the Governor (renamed **Leonard Caskroe**), who is
  too busy and sends the player to **Lynora**, the elf librarian at the Silverleaf Library.
- **Fritz's news**: after "The Captive", Fritz asks the player to carry word of the kobolds and
  spiders to Dionsburg ("Unsustainable Working Conditions"): the Governor, then Lynora (the kobolds
  came down from the mountains and drove the weaker wolves into the farmlands), then **General
  Mulbrey** in the military district, who sends the player back to kill 8 spiders.
- **Pim's oil** costs 3 red-cap mushrooms from the forest before he hands it over.
- **The bandits**: Tobias says bandits attacked him, yet kobolds have the shipment; a bandit step
  comes first, and only part of the cargo is found there.
- **One wolf quest, not two**: the Town Crier's goes; Hans's stays.

### 1.1 What already exists and is reused

| Need | Existing piece |
|---|---|
| Every quest shape here | `kill`, `harvest`, `talk_to` objectives; stage chains; `offer_quest` / `advance_quest` grants (`api/quests/*.json`, `api/mobs/*.json`) |
| "Search the bandit camp" | `talk_to` on a talk-only corpse, as `the-lost-friend` does with `FallenTraveller`: opening the panel is the talk. The **Dead Carter** already lies by his burnt cart (-131.7, -15.6), north of Tobias, beside the bandit group (5 Bandit L7 + 1 BanditRanged L5 around -130, -30) |
| Red-cap mushrooms | `RedMushroom`, a Harvest-gated structure, 5 spawns in `deep-woods` |
| Spiders | `Spider`, 20 spawns in `deep-woods` (and the existing `spiders-in-the-diggings`) |
| Places in the city | regions `city-tavern` (The Gilded Tankard), `city-library` (Silverleaf Library), `city-barracks` (Anvilguard Barracks), `city-town-hall`; the lazaret by the south gate has tents but no region |
| Lines that change with quest state | line `conditions` (Hans's greeting since 2026-10-25) |
| Talk-only NPC shape | `miller.json` / `gnome-1.json`: townsfolk, collision layer 97, speed 0, xpFactor 0, art through `entityType` |

## 2. PO rulings (2026-11-11/12)

- **R1 - Annie's text pass goes in now**, as a fix-now content change like the 2026-10-25 dialogue
  pass; done this session (§11).
- **R2 - The Lamplighter is shown as "Wanderer"** (en + de); the id stays `Lamplighter`. The
  debug-world `Wanderer` (`wanderer.json`) keeps its name.
- **R3 - Pim's barter replaces the oil gate.** Anyone who brings 3 red caps [PLACEHOLDER] gets the
  oil; the shipment-or-level-7 condition (PO 2026-10-25) goes.
- **R4 - Yolanda stands in the Gilded Tankard; no apothecary.** Tobias, the journal and the
  tracker name Yolanda and the Tankard. Until DQ1 lands they say "the gnomes in Dionsburg", which
  is true today (Pim takes it) and stays true (Yolanda is a gnome).
- **R5 - Taunt and Slow are re-homed later**, not in this plan.
- **R6 - The bandit step uses what is there**: kill bandits at the existing group, then "search
  the burnt cart" (talk to the Dead Carter). A real camp with chests replaces it later (backlog).
- **R7 - Three spider-kill quests are kept** (Mulbrey 8, Gwendolyn 6, `spiders-in-the-diggings`
  6); the overlap is flagged to Annie.
- **R8 - The Town Crier's wolf quest leaves play** (Annie: a duplicate of Hans's). The file stays.
- **R9 - Varied guard greetings are deferred.**
- **R10 - German is drafted with the content; Annie reviews it** in the next sheet round.

## 3. Design [proposed]

### D1 - The Stolen Shipment, bandit step first

`the-stolen-shipment` gains three stages at its front, ids of the old ones unchanged:

`bandits` (kill 4 [PLACEHOLDER] `Bandit`) → `search` (talk_to `DeadCarter`) → `tobias` (back to
Tobias) → `follow` → `recover` → `deliver` → `done`.

At `search` the Dead Carter shows one extra line, gated on the stage: part of Tobias's crates lie
among the wreck, the rest is gone, small clawed tracks lead north-east. Tobias at `tobias`: "Only
part of it? ... The kobolds must have helped themselves." (Annie writes the final wording.) His
existing `shipment` lines about the kobolds then follow. A character saved at `follow` or later
carries on unchanged; nobody is sent back to the bandits.

### D2 - Yolanda takes the shipment

New NPC `Yolanda` (display "Yolanda Nalweri", female gnome, `city-tavern`). The `deliver → done`
turn-in moves from Pim (`gnome-1.json`) to her, its reply offers `a-cure-for-the-wounded` on the
same row (the `eliza-sends-me` handoff precedent). Pim's shipment rows go. Her root carries
"Tell me more about the war" (lore, always open): the orc front through the gate, the siege the
paladins broke. ⚑ Annie wrote "east gate"; the front is through the **south** gate
(`content-city-dionsburg.md` §2), so the text says south (L4).

### D3 - Pim's barter

`oil-for-the-lamps`: `fetch` (talk to Pim) → `pick` (harvest 3 `RedMushroom`) → `trade` (back to
Pim) → `bring` → `done`. Pim offers the quest himself at `fetch` to anyone (his existing
"Anything I can do for you?" row, `toStage` dropped), and the Wanderer's offer still lands on
`fetch`. The shipment gate and the `toStage: bring` shortcut go (R3). A character saved at `fetch`
today lands on `pick` at Pim's next row; one at `bring` is untouched.

### D4 - He Who Cried Wolf ends at Lynora

The Crier stage stays. The Governor's reply now advances `governor → lynora` with Annie's line
("Unsettling news you bring from the west, stranger ..."), and a new stage `lynora` (talk to
Lynora) → `done`. Lynora: she asks the player to keep her informed of anything unsettling.

### D5 - Unsustainable Working Conditions

New quest, offered by Fritz behind a root row shown once `the-captive` is completed: carry word of
the kobolds on the plateau and the spiders in the south. Stages:

`governor` (talk to Caskroe, who redirects as in D4) → `lynora` (she explains the kobolds came from
the mountains and pushed the weaker wolves out of the forest into the farmlands; she will look
into it; sends the player to Mulbrey) → `mulbrey` (talk to Mulbrey) → `cull` (kill 8
[PLACEHOLDER] `Spider`) → `report` (Mulbrey) → `done`. The ending is Q2.

If the player has not finished "He Who Cried Wolf", Lynora's line works both ways: she connects the
kobolds to the wolves in either order (one line, no condition).

### D6 - A Cure for the Wounded, A Nasty Poisoning

`a-cure-for-the-wounded`: `deliver` (talk to Gwendolyn) → `done`. Gwendolyn's turn-in offers
`a-nasty-poisoning`: `glands` (kill 6 [PLACEHOLDER] `Spider`, "poison glands" is the journal's
word, nothing is carried) → `yolanda` (talk to Yolanda, who brews from the glands) → `done`. Whether
the medicine then goes back to Gwendolyn is Q3.

### D7 - The new NPCs

| id | Shown as | Where | Art (`entityType`, placeholder) |
|---|---|---|---|
| `Yolanda` | Yolanda Nalweri | `city-tavern` | the gnome art Pim uses |
| `Lynora` | Lynora | `city-library` | an existing robed humanoid |
| `Mulbrey` | General Geoffrey Mulbrey | `city-barracks` | the City Guard's |
| `Gwendolyn` | Gwendolyn | the lazaret by the south gate (Annie: "Military Hospital") | an existing townsfolk art |

Each reuses art, so no enum value and no wire change (the add-content rule). Portraits through
`speciesPortraits` (client table, `Graphics.ts`) if one fits. Placement in `world.json` is a zone
edit (half-live: restart after the save). Every one gets a two-row quest shape and a greeting that
changes once their quest is done, as the 2026-10-25 pass made the norm.

### D8 - The Town Crier stops offering Wolves on the Road

The offer row goes; the City Guard's and the Shaman's turn-in rows stay, so a character who has it
running can still finish it (and still learns Taunt at the guard). The Crier's root keeps his lore
and "Who here has work for me?". ⚑ Taunt then only drops from the Rally Drummer for new
characters until R5's re-homing.

### D9 - Text points Annie's brief leaves to us

- The mage quarter is **south-east** (her guard says "east", her Governor "south").
- "Lorekeepers in the mage district" means the Silverleaf Library; the line names it.
- Tobias and the `deliver` journal/tracker name Yolanda at the Gilded Tankard (R4).
- Every number in the text matches the quest file (8 spiders, 6 glands, 3 red caps).

### D10 - Levels and XP

Proposed quest levels [PLACEHOLDER]: `unsustainable-working-conditions` 8, `a-cure-for-the-wounded`
8, `a-nasty-poisoning` 9; XP by the existing L9 rule. ⚑ Deep Woods' spiders sit at 12-14 (out of
band, `content-zone-2-woodland.md` §3) and both new spider quests send a level-8 player at them;
that meets Annie's "Dionsburg at level 12" finding (feedback row 2026-11-08), so the spider levels
are settled before DQ2 or the quests are pointed at the band the level-pace review picks.

### D11 - German

Drafted with each chunk in the style manual (`manual-localization-de.md`); Annie reviews it in the
next sheet round (R10). Names stay: Yolanda Nalweri, Lynora, Mulbrey, Gwendolyn, Leonard Caskroe.

### D12 - Not in scope

A real bandit camp with chests (backlog, R6), the guards (R9), Taunt and Slow homes (R5), a
hospital building, the sheep, roads, cave, houses and level-pace notes (feedback rows), Annie's
empty "Add an NPC" bullet (Q4).

## 4. What changes for the author

Annie's next sheet export (`python3 tools/lang/dialogue-sheet.py`) will list the new NPCs and
quests in play order. Remind her: **the `key` column must not change** (her 2026-11-08 sheet
renamed 18 keys with a search-and-replace, which the import refuses); a rename is a name change on
the NPC row (`mob.<id>.name`), not in keys.

## 5. Chunks

| # | Chunk | Contents | Size |
|---|---|---|---|
| DQ1 | The shipment and the oil | D1 bandit step + Dead Carter line, D2 Yolanda (NPC, placement, shipment turn-in, war lore; the Cure offer is stubbed until DQ3 or lands with it, see below), D3 Pim's barter, D8 the Crier's offer removed, R4 text switch to Yolanda | M |
| DQ2 | The news reaches the city | D4 Governor → Lynora, D5 Unsustainable Working Conditions with Lynora and Mulbrey (NPCs + placement), D10 settled for the spiders | M |
| DQ3 | The medicine | D6 both quests, Gwendolyn (NPC + placement), Yolanda's offer and `yolanda` stage | S-M |

DQ1 needs nothing first; DQ3 needs DQ1 (Yolanda). Yolanda's turn-in in DQ1 ends the shipment
quest without an offer; DQ3 adds the offer on the same row. DQ2 is independent of both.

Each chunk: **Schema:** DB none · wire none · conf none · content as listed · zone NPC spawns ·
lang en + de.

**In-game (PO), per chunk:**
- DQ1: fresh character from Reinhard: Tobias → bandits → burnt cart → Tobias → plateau → Yolanda in
  the Tankard; the war row; the Wanderer → Pim → 3 red caps → Pim → Wanderer. Crier offers no
  wolf quest.
- DQ2: Hans's wolves → Crier → Caskroe → Lynora. After The Captive, Fritz's new row → Caskroe →
  Lynora → Mulbrey → 8 spiders → Mulbrey.
- DQ3: Yolanda → Gwendolyn by the south gate → 6 spiders → Yolanda.

## 6. Test strategy

- **Content tests (Go, derive, never hardcode):** every new conversant resolves its grants; every
  quest stage is reachable from its giver's rows; each new NPC is placed in a main zone. Reuse
  the existing interaction and quest content tests; red first where one does not yet cover a
  shape (a stage inserted before an existing one; a row moved between NPCs).
- **Save compatibility pins:** a quest saved at `follow` (shipment) or `bring` (oil) loads and
  finishes; a character with `wolves-on-the-road` running can still turn it in at the guard.
- **Lang:** `UPDATE_LANG=1 go test -count=1 -run TestLang ./cmd/aurad/`, `aurad -lang-status` 0/0.
- **Harness:** extend `woods-w123.mjs`'s talk table with the new NPCs (venues re-derived from
  `world.json`, never hardcoded, L5).
- **PO look** per §5.

## 7. Open calls

- **Q1 - Build order.** The finish-open-work rule queues this behind BR2 and CT2 (build order
  2026-10-30). Proposed: after CT2, before CT3. PO's call.
- **Q2 (Annie) - Where does Unsustainable Working Conditions end?** Her brief stops at Mulbrey's 8
  spiders. Proposed: report back to Mulbrey, done.
- **Q3 (Annie) - Does the brewed medicine go back to Gwendolyn?** Proposed: no, `a-nasty-poisoning`
  ends at Yolanda, a follow-up can carry it.
- **Q4 (Annie) - The empty "Add an NPC" bullet.** Ask what it was meant to be.
- **Q5 - The bandit kill count**: 4 [PLACEHOLDER] of the 5 melee bandits, so a fresh spawn cycle
  is not needed.

## 8. Landmines

- **L1 - The import refuses renamed keys.** Annie's 2026-11-08 sheet rewrote 18 keys; they were
  mapped back by row this session. Say it to her before the next round (§4).
- **L2 - A stage inserted before existing ones** must keep the old ids and their order, or saved
  characters land on a stage their NPC has no row for (`village-welcome` lost its `back` stage on
  2026-10-25 and a character saved there cannot turn in).
- **L3 - Moving a turn-in between NPCs** (Pim → Yolanda) leaves Pim's oil gate reading
  "shipment completed"; D3 removes that gate in the same chunk. Do not split them.
- **L4 - City directions.** Front = south gate, mage quarter = SE, military = NE, gnome craft = NW,
  tavern NW of the fountain (`content-city-dionsburg.md` §2-§3). Annie's brief says "east gate".
- **L5 - Harness venues rot when spawns move** (feedback row 2026-10-20). Read venues from
  `world.json`.
- **L6 - A zone edit is half-live, a content edit does not invalidate the Go test cache**: restart
  after a Tiled save, `-count=1`, `cp-defs` before embedded-content tests.
- **L7 - Census tests**: a new NPC can trip the conversant census in `pkg/aura/items/mobs`
  (feedback row 2026-09-05). Update them in the same change.
- **L8 - D24**: a mob a kill or harvest quest counts carries its plural in its name; `Spider`,
  `Bandit`, `RedMushroom` already do. Check before authoring.

## 9. Schema impact

- **DB:** NONE (quest progress is the existing ledger; new quests are new ids).
- **Wire:** NONE (art reused through `entityType`).
- **Conf:** NONE.
- **Content:** +4 mobs, +3 quests; `the-stolen-shipment`, `oil-for-the-lamps`, `he-who-cried-wolf`
  gain stages; rows move in `gnome-1.json`, `town-crier.json`, `governor.json`, `tobias.json`,
  `dead-carter.json`, `fritz.json`, `lamplighter.json`.
- **Zone format:** NONE; +4 NPC spawns in `world.json`.
- **Lang:** new keys en + de in `conversations`, `quests`, `mobs`.

## 10. Cross-references

`content-zone-2-woodland.md` §3.8 (amended by R3/R4), `content-city-dionsburg.md` §2-§3,
`plan-character-entries.md` (its level-5 Fly chain city → swamp → city is also a quest Annie may
write), `plan-dialogue-quest-icons.md` (QI1 stamps these quests' rows too).

## 11. Chunk ledgers

### Text pass (R1), 2026-11-12, uncommitted

Annie's 56 EN / 54 DE rows applied after proofreading and logic checks; her 18 renamed keys mapped
back by row. Names: Lamplighter → Wanderer, Woodcutter 2 → Zacharias (was "she"), Woodcutter 1
(`FallenTraveller`) → Illias, Governor → Leonard Caskroe. Fixed beside her rows: the letter in Pim's
thanks and `a-lost-shipment`; `the-captive` journals and title (de "Die Gefangene" → "Der
Gefangene"); `the-lost-friend` journals (Illias went for help, not timber); Fritz's "About your
scout" row → "About Illias". Held for DQ1: her "apothecary" destination (R4; the rows say "the
gnomes in Dionsburg"). `woods-w123.mjs` expects the new names. Four mob `_comment`s renamed.
**Schema: DB none · wire none · conf none · lang 162 values changed.** Verified: Go 40 ok / 0 FAIL
· `TestLang` ok after `UPDATE_LANG=1` · vitest 1977/0. `woods-w123.mjs` 14/15, 0 console errors: the one red was its stale "Gnome 1" label (Pim's nameplate since before this pass), fixed, not rerun. PO look owed. ⚑ That harness launches chromium without the extracted libs: run it with `LD_LIBRARY_PATH=~/.cache/aurahunter-run/libs/usr/lib/x86_64-linux-gnu{,/nss}`. Annie's review file: every row I applied against hers, with the reason (28 as written, 37 proofread or logic, 12 new follow-ups, 4 names, 5 held for DQ1), handed to the PO as `annie-text-pass-review-2026-11-12.csv`; `UPDATE_LANG=1` marks the German current, so this file is the only record of where her wording was changed. `dialogue-sheet.py` now labels Sorrowfen.
