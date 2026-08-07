# Plan: Generic kill quests — most NPCs offer one

> **Status: COMPLETE — C1 AND C2 BOTH BUILT AND VERIFIED 2026-08-07, the same
> day the plan was written (`f414b473`).** All nine quests live;
> 10 of 14 placed conversants offer a quest, 12 of 13 human-ish conversants
> carry a quest role. 4 PO rulings D1–D4 (planning session). **Content-only:
> no Go production code, no `.fbs`, no frontend, no conf.** **Schema impact:
> NONE** (content JSON + the quests package's content-pin tests + three verify
> harnesses + docs). Every number below is [PLACEHOLDER] per the standing
> rule. Ledgers: §9 (C1) · §10 (C2). ⚑ Still open, but NOT this plan's: the
> PO has not yet seen the Emberkeeper's human-target quest in play (flagged in
> §10), and per-quest text/reward feel tuning is ordinary later content.

## 1. What this is

Nine new single-species kill quests, one per currently quest-poor NPC, each
targeting a mob population **measured to stand within ~22 units of its giver**
(the whole world is 144×72). Today 4 of 14 placed conversants offer a quest;
after this, **10 offer and 12 of 13 human-ish conversants carry a quest role**
— the "most NPCs offer a quest" ask. All nine reuse the shipped pattern
verbatim: `kill objective → dialogue stage with tracker → terminal stage
entered by the rewarding turn-in row`, offer and turn-in on the same NPC,
plain-text briefs.

The proximity table in §4 is not design intent — it was computed from
`api/zones/world.json` (the post-re-placement world, all 423 combat spawns)
against every placed NPC, so "the mobs are near the giver" is measured, not
hoped. Because the world re-placement gave the map a coherent level geography
and the NPCs sit along the progression path, **proximity buys level-
appropriateness for free**: every proposed target is at or near the level a
player standing at that NPC will be.

## 2. Standing rulings this plan runs under (none re-opened)

- **L9 XP budget** (plan-quests, PO 2026-07-30): "punchy — about half the
  level it is aimed at." Enforced only by `TestContent_QuestXPBudget`'s pinned
  map — extend it per quest.
- **Plain-text pass** (PO 2026-08-02): briefs state the task, entry rows are
  "Do you have a task for me?", accepts are "I'll do it.", turn-ins state the
  completed fact. No lore-styled quest text yet.
- **Q1 show-rule**: quest rows carry no gates; a row is shown iff its ledger op
  would succeed. Offer + turn-in + follow-up all live on one quest node behind
  its own root row.
- **N4/D4 baselines**: counts are since stage entry (lifetime counters
  snapshotted at entry); abandon/re-accept restarts the count.
- **D11**: the quest file never names its conversants — rows on the NPCs
  reference the quest; `content-npcs.md` §Quest roles is the one-picture
  wiring table and must be extended.
- **grant_xp only on an edge that ENDS the quest** (L10), grant at index 0,
  authored `text` required.
- **xp C2 economy**: at-level kill base 20 × 1.2/level, ~15 kills/level flat,
  elite tier ×2.5 — quest kill counts pay their own way on top of the reward.

## 3. PO rulings (2026-08-07)

- **D1 — scope: all ten proposed givers** … minus the Dog (D2), so nine
  quests, split zone-1 side / zone-2 side into two chunks.
- **D2 — the Dog is skipped.** The companion showcase stays quest-free; a
  dog-speak brief would be an exception to the plain-text ruling and "plain
  text from the dog" breaks the character. Recorded as declined, not deferred.
- **D3 — one-shot, like every shipped quest.** The dormant `repeatable` flag
  (plan-quests D6) stays unauthored; making generic kill quests a grind faucet
  would be its own decision with its own verification of the flag's semantics.
- **D4 — rewards are XP-only at the L9 half-level budget.** No new skill
  sources (every existing skill reward was a deliberate curated-source
  decision), no full-level sizing (that would be an economy change against the
  week-old C2 calibration).

## 4. The nine quests

Positions/distances measured from `api/zones/world.json` 2026-08-07. Nearby =
spawns of the target species within ~22 units of the giver. Reward =
½ × R(level aimed at), with R(L) = 300 × 1.2^(L−1) (the requirement curve the
budget pin's own comment documents: L1 300, L5 622) — **recompute from the
real `curve` package at execution and round to taste; all [PLACEHOLDER]**. The
shipped quests already run a little hot against strict half (wolves 400,
lamp 700), so treat the column as a floor-ish anchor, not an exact law.

### C1 — zone-1 side

| Quest id (working) | Giver @ pos | Objective | Nearby | Player level there | Reward XP |
|---|---|---|---|---|---|
| `boars-in-the-field` | Farmer @ (−57.0, 28.6) | kill 6 Boar (L2) | ×10 @ 6–14u | 1–3 | ~180 |
| `dire-wolves-in-the-forest` | Lamplighter @ (−66.0, −27.6) | kill 4 DireWolf (L6) | ×3 @ 4–18u | 5–7 | ~370 |
| `kobolds-on-the-road` | Wanderer @ (−15.5, 30.7) | kill 8 Kobold (L7) | ×13 (+4 KoboldRanged L6) @ 7–21u | 6–8 | ~450 |
| `spiders-in-the-diggings` | Miner @ (−27.0, −26.4) | kill 6 Spider (L11) | ×7 @ 3.6–17u | 9–11 | ~930 |

Notes:
- **Farmer** becomes a two-quest NPC (turnip-chore + this). The L2 boar cull
  fills the gap between the harvest chore and the L3 wolf cull — the village
  ramp becomes talk → harvest → first kill quest → the 8-wolf cull.
- **Lamplighter**: DireWolf over the closer EliteWolf L8 ×3 (@5.7–6.8u) — an
  elite cull off only three spawns is spiky for the level band; the EliteWolf
  option is recorded in §8, and it is the ForestSign clue's mob, which argues
  for leaving it a discovery rather than a chore.
- **Wanderer**: the kobold nest (26 spawns, x∈[−24,−9] y∈[−5,25]) actually sits
  by the *Wanderer*; the-lost-lamp's giver is 30u+ from it. The species overlap
  with the-lost-lamp is deliberate and mechanically clean — both objectives
  baseline independently, so running both at once double-credits, which reads
  as generosity. The brief should not point at the tunnel (that's the lamp
  quest's framing); "the road" is the Wanderer's.
- **Miner**: his idle lore is already the overrun tunnel; the spiders are it.

### C2 — zone-2 side

| Quest id (working) | Giver @ pos | Objective | Nearby | Player level there | Reward XP |
|---|---|---|---|---|---|
| `dire-wolves-at-the-camp` | Shaman @ (18.0, 6.0) | kill 6 DireWolf (L11) | ×10 @ 6.8–18u | 10–12 | ~930 |
| `bandits-at-the-shrine` | Emberkeeper @ (34.5, −19.6) | kill 6 Bandit (L12–13) | ×11 @ 9.8–21u | 12–14 | ~1250 |
| `alpha-wolves-at-the-village` | VillageHealer @ (45.4, 11.0) | kill 5 AlphaWolf (L15) | ×6 @ 7.9–14.5u | 14–16 | ~1900 |
| `bears-at-the-walls` | CityGuard @ (62.4, 9.6) | kill 5 Bear (L16) | ×5 @ 3.9–17u | 16–18 | ~2300 |
| `thin-the-orc-line` | FrontCaptain @ (58.9, 26.9) | kill 5 Orc (L20, **elite**) | ×8 @ 6.3–18.6u | 18–20 | ~4800 |

Notes:
- **Shaman** and **CityGuard** are today turn-in-only (the wolves branch legs);
  each gains an own quest node behind its own root row — purely additive next
  to the existing turn-in row on root.
- **Emberkeeper**: the first human-target kill quest. Bandits are a hostile
  faction; no design issue found, but it is a first and the PO should see it.
  GiantSpider L14 ×5 @ 12.6–15.4u is the recorded alternative (§8). The bandit
  camp is claimed by the Emberkeeper so the Shaman doesn't double-claim it.
- **VillageHealer**: "fewer wolves, fewer wounded" is how a healer hands out a
  kill quest without breaking role.
- **FrontCaptain**: five elite kills pay 12.5 at-level kills' worth of kill XP
  before the reward — deliberately the punchy endgame quest, and the war-front
  beat his idle lore already points at. Watch it against tuning.

## 5. The authored shape (identical for all nine)

Quest file (`api/quests/<id>.json`):

```json
{
  "id": "boars-in-the-field",
  "title": "Boars in the Field",
  "stages": [
    { "id": "cull",
      "journal": "Kill 6 boars rooting through the fields around the farm.",
      "tracker": "{n}/{m} boars killed",
      "objectives": [{ "kind": "kill", "species": "Boar", "count": 6 }],
      "next": "report" },
    { "id": "report",
      "journal": "The boars are dealt with; the Farmer waits by his field.",
      "tracker": "Return to the Farmer" },
    { "id": "done",
      "journal": "Done. Reported back to the Farmer." }
  ]
}
```

Giver rows (on the NPC's `interaction` block, Q4 shape): one root row →
quest node whose text is the brief; on that node the Accept row
(`offer_quest`, "I'll do it.") and the turn-in row (`advance_quest`
report→done at grants[0] + `grant_xp`, text states the completed fact,
no `next`). The show-rule sorts visibility; no conditions anywhere.

Known traps to respect (all documented, restated so the executor trips on
none): the quests directory loads every `.json` and the mobs directory loads
every file **regardless of extension** — no scratch files; `tracker` is
mandatory on the non-terminal dialogue stage or the journal goes silent;
`{n}/{m}` is rejected on uncountable stages; species/NPC names resolve at boot
(typo fails loudly); the pins read the **embedded** copy, so `make -C backend
cp-defs` before `go test ./pkg/aura/quests/`.

## 6. Chunks

**C1 — zone-1 side (4 quests + the docs ride-alongs).**
4 quest files, rows on Farmer / Lamplighter / Wanderer / Miner, extend
`TestContent_QuestXPBudget`'s map (+4 entries) and whatever census/count pins
assert totals, update `content-npcs.md` §Quest roles, fix the stale
`manual-content-authoring.md` §6 lifetime-thresholds paragraph (§7 below).
Verify: `cp-defs` + `go test ./pkg/aura/quests/` · boot `-content ../api`
logs **8 quests**, 0 errors · in-game spot-walk of one quest end-to-end
(accept → kill → tracker counts → turn-in pays once, re-click pays nothing)
· PO checklist: the four briefs read right, the Farmer's two quests coexist.

**C2 — zone-2 side (5 quests).**
Same shape: 5 quest files, rows on Shaman / Emberkeeper / VillageHealer /
CityGuard / FrontCaptain, pins to **13 quests**, `content-npcs.md` again.
Extra care: the Shaman/CityGuard quest nodes must not disturb the existing
wolves turn-in rows on their roots (the C4 harness or a manual walk of the
wolves branch is the check). PO checklist: the bandit (human-target) quest
reads acceptably; the orc quest's payout feel.

Each chunk is a session; no silent chaining.

## 7. Ride-alongs (found during planning, cheap, C1)

- **`manual-content-authoring.md` §6 still teaches D3's lifetime thresholds**
  ("`count: 8` means *has ever killed eight*… a veteran completes the stage on
  the spot") — reversed by N4/D4 (since-stage-entry with baselines; the
  quests/README documents it correctly). The `e94c7841` comment sweep fixed
  four code comments; this doc paragraph is the same class of leftover.
- **`content-npcs.md` §Quest roles** grows nine rows (both chunks).

## 8. Recorded alternatives / not taken

- **The Dog** (D2 — declined): Bear L7 ×5 @ 3–19u was the natural target;
  dog-speak brief vs plain-text ruling was the conflict.
- **ForestSign**: mechanically able to carry rows, deliberately left a
  lore-only clue — a signpost handing out contracts breaks the role.
- **Lamplighter alt**: EliteWolf L8 ×3 @ 5.7–6.8u (the ForestSign clue mob) —
  spikier, and better left a discovery.
- **Emberkeeper alt**: GiantSpider L14 ×5 @ 12.6–15.4u, if the human-target
  quest reads badly in the PO pass.
- **Repeatable** (D3 — deferred, not blocked): if kill quests should ever be a
  grind faucet, the flag exists and this plan's quests are the natural first
  authors — but the flag's end-to-end semantics (re-offer, re-baseline, the
  L10 no-faucet rule) have never been exercised and must be verified first.
- **Hermit / TownCrier second quests**: not proposed; the village already
  holds three offers with the Farmer addition.

## 9. C1 ledger — zone-1 side, BUILT AND VERIFIED 2026-08-07 `f414b473`

**Shipped exactly as planned, TDD order** (pins extended first and seen red,
then the content): `api/quests/` +4 (`boars-in-the-field` 6×Boar/180 XP ·
`dire-wolves-in-the-forest` 4×DireWolf/370 · `kobolds-on-the-road` 8×Kobold/450 ·
`spiders-in-the-diggings` 6×Spider/930 — the L9 half-level rule applied
literally, ½ × 300 × 1.2^(L−1)); offer + turn-in rows behind an own root row on
Farmer / Lamplighter / Wanderer / Miner (the Farmer's is
`Anything else that needs doing?` — his second quest, the first two-offer
giver); `content_test.go` census + XP-budget maps +4; `content-npcs.md` roster
+ quest-roles rows; the §7 `manual-content-authoring.md` §6 stale
lifetime-thresholds paragraph rewritten to N4/D4.

**Verified:** `cp-defs` + `go test ./pkg/aura/quests/` green (after red) · full
suite `go build` + `go test ./...` **0 FAIL** · boot `-content ../api`
15 factions/87 skills/65 mobs/3 milestones/10 recipes/**8 quests**/5 props/777
props/485 spawns/5 campfires, **0 WARN/ERROR** (CrossValidate's
nothing-unofferable warning silent) · **new harness `c1-kill-quests.mjs`
20/20 PASS, 0 console errors** — boars-in-the-field walked END TO END (accept →
`0/6 boars killed` tracker → six real kills → `Return to the Farmer` → turn-in
pays **exactly 180, once** — `XP 2241 → 2421` — and the row seals shut) plus
offer+accept on the other three givers · **`chunkC4-quests.mjs` all PASS
(38 PASS + its 1 deliberate SKIP), 0 console errors** after the two repairs
below · `hrnss_*` residue cleaned (39 accounts, server stopped first).

**Findings / landmines:**

- ⛑ **L1 — three of the five world campfires stand within ~1 unit of a
  conversant, and `E` resolves to the NEAREST interactable — which flight C3
  turned into a trap for every conversant harness.** `chunkC4-quests.mjs` leg D
  warped to (−21,−24): campfire `spawnpoint-4` (−21.26,−23.51) is **0.55 u**
  away, the traveller **0.57 u** — a coin-flip the fire wins, and since flight
  C3 (2026-08-05) `E` at the nearest-fire opens the **flight map**, so the leg
  read "the traveller never answers" (`actor=undefined`). Pre-existing rot, not
  this chunk's content — C4's leg last ran before flight shipped. Venue moved
  to (−20,−25) (traveller 0.85 u, fire 1.95 u); the same hazard at
  `spawnpoint-3` (0.7 u from the Wanderer's authored point) is answered in
  `c1-kill-quests.mjs` with an `Escape` before each `E`. **Pick conversant
  warp points that break the fire tie decisively.**
- ⚑ **The C4 harness's `catalog.length === 4` went red on the fifth quest** —
  its own rule 1 (never assert a content count), enforced by reality. Replaced
  with a by-name assert on the four C4 ids; the C1 ids are the new harness's.
- ⚑ **The Wanderer's row-click races its resume-stroll**: the quest row click
  landed and the panel re-read at ROOT (seen once live). The harness retries
  the navigation; the row's *existence* is a separate, stable assert.
- ⚑ Harness pattern worth keeping: **`XP 20000` (→L15) before the boar hunt
  makes every mob near the farm gray**, so the only XP the bar can move by in
  the whole leg is the turn-in's authored 180 — the payment assert cannot be
  contaminated by hunt kills or a mid-window ding.
- The hunt warps spawn-point-to-spawn-point (boars are retaliation-only prey
  and never approach); a wander circuit is the wrong tool for prey culls —
  relevant again for C2's bears.

**Schema impact: DB NONE · FlatBuffers NONE · conf NONE · Go production code
NONE** (tests + content + harnesses + docs only).

## 10. C2 ledger — zone-2 side, BUILT AND VERIFIED 2026-08-07 `f414b473`

**Shipped exactly as planned, same TDD order** (pins +5 seen red first):
`api/quests/` +5 (`dire-wolves-at-the-camp` 6×DireWolf/930 ·
`bandits-at-the-shrine` 6×Bandit/1250 — **the first human-target kill quest**,
plain-Bandit species only · `alpha-wolves-at-the-village` 5×AlphaWolf/1900 ·
`bears-at-the-walls` 5×Bear/2300 · `thin-the-orc-line` 5×elite Orc/4800);
offer + turn-in rows behind own root rows on Shaman / Emberkeeper /
VillageHealer / CityGuard / FrontCaptain — on the Shaman and the CityGuard the
new giver role **coexists with their wolves-branch foreign turn-in on one
root**, proven at the surface (chunkC4 C5/C6/C9 all green after). Direction
facts checked against the world before shipping: the bandit camp is EAST of
the keeper (the draft said south), the orc line is genuinely south of the
captain. `content-npcs.md` roster + wiring +5 each.

**Verified:** pins red→green · full suite `go build` + `go test ./...`
**0 FAIL** · boot `-content ../api` **13 quests**, 0 WARN/ERROR · **new
harness `c2-kill-quests.mjs` all PASS, 0 console errors** — bears-at-the-walls
walked END TO END (accept → `0/5 bears killed` → five real kills → turn-in
pays **exactly 2300, once** — `XP 2254 → 4554` — row seals) plus offer+accept
on the other four givers · **`chunkC4-quests.mjs` all PASS** (the wolves
branch intact on the modified roots) · **`c1-kill-quests.mjs` 20/20** after
the helper hardening below · `hrnss_*` residue cleaned (7 accounts).

**Findings / landmines:**

- ⛑ **L2 — `Escape` closes the JOURNAL, not just the map — which makes C1's
  L1 remedy ("press Escape before `E`") a TRAP, hereby superseded.** C2's
  first harness run put an unconditional Escape in `talkTo`, and every journal
  read in the whole run returned null while every panel assert stayed green —
  20 minutes of green-looking FAILs from one keypress. Probed live: quick
  `KeyJ` toggles the journal reliably (raw keydown listener — the rAF-throttle
  theory was WRONG for J); a closed journal's hidden DOM **retains its
  content**, which is why C1's leg D survived its own Escapes and the trap
  stayed invisible for a day. Both harnesses now close the flight map
  **conditionally** (`#worldMap` visibility check) and their journal readers
  self-heal (`ensureJournalOpen`).
- ⚑ **The accept row-click can miss once against a re-rendering panel**
  (seen once at the Lamplighter, 1-in-2 runs): the harnesses retry the accept
  only while the row is still offered — a landed accept removes it, so the
  retry cannot double-fire.
- ⚑ **The first browser join after a fresh `aurad` boot timed out twice in
  two sessions** (creation screen never read as visible inside 120 s); the
  identical retry passed immediately both times. Environment quirk, recorded —
  not product, not content.
- ⛔ **The PO has not seen the human-target quest in play.** The plan flagged
  it as a first; the fallback (GiantSpider L14 ×5 @ 12.6–15.4 u) stays
  recorded in §8 should it read badly.

**Schema impact: DB NONE · FlatBuffers NONE · conf NONE · Go production code
NONE** (tests + content + harnesses + docs only). This was the plan's last
chunk — the doc is archived.

**Same-day wording pass (PO 2026-08-07, "minimal and matter-of-fact"):** all
nine briefs lost their flavor preamble and now state the bare task
("Kill 6 boars in the fields around the farm, then come back to me." — the
turnip-chore register), journal lines were trimmed to match, and the two
stylized quests were renamed id+title: `dark-between-the-lamps` →
**`dire-wolves-in-the-forest`**, `fewer-wounded` →
**`alpha-wolves-at-the-village`** (safe pre-commit — no player ledger ever
held the old ids). Pins, both harnesses and chunkC4 needles updated where
they named ids (titles/prose are catalog-derived in the harnesses, so those
adjusted themselves); re-verified: quests pins green · full suite 0 FAIL ·
boot 13 quests 0 WARN · `c1-kill-quests.mjs` **20/20** · `c2-kill-quests.mjs`
**23/23**, both fresh-server, 0 console errors.
