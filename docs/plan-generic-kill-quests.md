# Plan: Generic kill quests — most NPCs offer one

> **Status: PLANNED 2026-08-07, not started.** 4 PO rulings D1–D4 (same
> session). Two chunks, C1 (zone-1 side, 4 quests) + C2 (zone-2 side, 5
> quests). **Content-only: no Go, no `.fbs`, no frontend, no conf** — the quest
> vocabulary shipped with plan-quests C1–C3 and nothing here needs a new verb.
> **Schema impact: NONE** (content JSON + the quests package's content-pin
> tests + docs). Every number below is [PLACEHOLDER] per the standing rule.

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
| `dark-between-the-lamps` | Lamplighter @ (−66.0, −27.6) | kill 4 DireWolf (L6) | ×3 @ 4–18u | 5–7 | ~370 |
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
| `fewer-wounded` | VillageHealer @ (45.4, 11.0) | kill 5 AlphaWolf (L15) | ×6 @ 7.9–14.5u | 14–16 | ~1900 |
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
