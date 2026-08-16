# Content — NPCs

Roster of friendly/teaching NPCs: identity, speech, what they teach or point
to. Conventions (status column, placement split) → `README.md` → Content.
Placement here is **design intent only** — runtime positions live in the
zone JSON authored via the zone editor. **NPC substrate (current):** an NPC is
an ordinary actor carrying an `interaction` block on its mob definition —
`model/npc` was deleted by entity-model chunk 3a, and teach-on-approach was
reversed by 3b-i (talking is a verb the player performs, on `E`). Branching
dialogue shipped with 3b-ii; quest rows on top of it with `plan-quests.md` C2/C4.
**Since conversation-journal Q4 (2026-07-30) every conversant is authored to
R1's tree shape:** the greeting at root, teachings behind named rows, each quest
behind its own row with its brief as that node's text. Quest rows carry no
`quest_at_stage` gate — a row is shown iff its ledger op would succeed (the Q1
show-rule) — and the `tooLowLine`/`blockedLine` mechanism is GONE (Q1): a
locked row greys inert with its level wall named, and says nothing.
**Its partner rule, added by intake round 8 item 2 (2026-08-11):** an INFO row
beside those quest rows has no show-rule of its own, so one that answers a
question only a running quest asks is gated by putting
`quest_at_stage / <quest> / running` on **the node behind it** (options carry no
conditions). ⚑ **Only one row in the cast qualifies** — the traveller's *"Where
do they nest?"*, the single info node hanging off a quest node. Every other one
(`news_who`, `front`, `commander`, `dir_*`, `roads`, `tunnel`) hangs off `root`
and is durable world knowledge — geography, the Warlord's banner mechanic, where
campfires are — which a player may want to re-read forever. **Do not gate those.**
**Since the plain-text pass (PO 2026-08-02) quest and teach text is deliberately
plain — no lore or stylized wording yet:** teaching always sits behind a root
`Teach me something.` row leading to a teachings node whose rows NAME the skill
directly (grant line `I'll teach you X.`); quest briefs state the task
("Kill 8 wolves…"), entry rows are `Do you have a task for me?`, accepts are
`I'll do it.`, turn-ins state the completed fact. Greetings and non-quest lore
nodes (news, directions) kept their flavor.

> Teaching lists here are design intent. The **generated** truth for who
> teaches what at which level is `content-skill-inventory.md`; runtime
> placement truth is `api/zones/world.json`.

| NPC | Status | Place (intent) | Teaches / role | Notes |
|---|---|---|---|---|
| Town crier | in-game *(C8 Session ⑦)* | Zone 1, village centre | Teaches **Recall**; ambient call-outs; offers `wolves-on-the-road`. | The village-arrival intro anchor. ⚑ Taught **Damage** until conversation-journal Q4 (2026-07-30): Damage is now a **level-1 milestone seeded at character creation**, so a peasant can always fight before meeting anyone. Sprite `entityType: "TownCrier"`. |
| Farmer | in-game *(C1)* | Zone 1, farm field south of the village | Teaches **Harvest**; offers and turns in `turnip-chore` and `boars-in-the-field` (the first two-offer giver). | The peasant onboarding anchor (GDD §5 as amended in C1) + first harvest-mob loop (GDD §8). Harvest is *taught*, not granted — a fresh spellbook holds exactly the level-1 milestone (Damage, Q4). |
| Village hermit | in-game *(C8 Session ⑦)* | Zone 1, inside the village | Teaches **FirstAid** then the **Heal** aura. | The healer hermit moved into the village in Session ⑦. Teaching FirstAid here is why it left the milestone table (2026-07-21) — the milestone granted it *later* than this NPC does, making the milestone dead weight. |
| Forest hermit (mob name `Lamplighter`) | in-game *(C2)* | Zone 1, dark forest, deep NW pocket | Teaches **Torch** (plain-text row); idle lore line about carrying your own light; offers and turns in `dire-wolves-in-the-forest`. | No level gate (PO 2026-07-17) — surviving the walk-in is the gate; the mandatory `tooLowLine` field is flavor-only. Sprite `entityType: "Hermit"`. |
| Dog | in-game *(C2)* | Zone 1, mid-forest clearing | Says **"Woof."**; teaches **SummonCompanion**. | The player-companion showcase; sprite `entityType: "DogNpc"`, the summoned companion reuses the dog look. ⚑ The old "Woof?" teach-row joke went with the 2026-08-02 plain-text unification (the row now names the skill); the dog still answers in dog. |
| Miner | in-game *(C3)* | Zone 1, lit staging area at the tunnel's west mouth | Teaches **Pickaxe** (plain-text row); idle lore about the overrun tunnel; offers and turns in `spiders-in-the-diggings`. | The rockfall-gate key handed out a few steps before its lock (PO 2026-07-17: `smash` gate tag via a Miner). Sprite `entityType: "Miner"`. |
| Shaman | in-game | Zone 2 approach | Teaches **SummonTotem**; offers and turns in `dire-wolves-at-the-camp`. | The totem line's world source. |
| Emberkeeper | in-game | Zone 2, north | Teaches the whole fire line in order: **Torch**, then **Ignite**, then **Immolate**; offers and turns in `bandits-at-the-shrine` (the first human-target kill quest). | The fire-identity ladder in one NPC — and the reason Ignite/Immolate are no longer cheat-only (both are Wildfire ingredients). |
| Village healer | in-game *(C4; purpose settled since)* | Zone 2 village, by the campfire | Teaches **Revive** — the group-support capstone; offers and turns in `alpha-wolves-at-the-village`. | Was placed lore-only in C4 as a spot reservation with its purpose left open (§11); that question is now closed — it is the world source for Revive, which previously had no world-reachable teacher. Sprite `entityType: "VillageHealer"`. |
| Front captain ("FrontCaptain") | in-game *(C5)* | Zone 2, front staging area east of the checkpoint | **Level-gated teaching Vanguard** (the Front-Aura, §A); war-banner briefing behind a lore row; offers and turns in `thin-the-orc-line`. Idle lore: the orcs hold the south passage. | The story-spine beat 6 NPC — historically the first real refusal-line gate in content (that mechanism died in Q1; the row greys inert now). The anchor level = the journey's final step in v1 (PO 2026-07-18; closes the §11 level-anchor item). Sprite `entityType: "FrontCaptain"`. |
| City guard | in-game *(C4)* | Zone 2, before the City Gates wall | Teaches **Strong**; gates shut while the front burns; `wolves-on-the-road` militia turn-in; offers and turns in `bears-at-the-walls`; points the player south to the army. | The story-spine beat 5 NPC (plan-content-zones12 §3) + Zone 3 teaser. Sprite `entityType: "CityGuard"`. (The old "lore-only" note here was drift — he has taught Strong since C4-era content.) |
| Forest signpost ("ForestSign") | in-game *(C2)* | Zone 1, dark-forest south entrance | Lore-only clue: "Something big prowls the dark forest." (→ Elite Wolf, plan-content-zones12.md §8). | First NPC with an authored sprite — zone-JSON `entityType: "Signpost"` (C2 NPC-sprite lift). |
| Wanderer / Traveller | in-game *(C8 Session ⑥)* | Zone 1–2 roads, ambient | Road-directions lore; offers and turns in `kobolds-on-the-road`; the "LamplessTraveller" variant seeds the light beat. | Ambient world-population pass (EntityType 63/64). PO places them in the editor. |
| Tunnel signpost ("TunnelSign") | ~~in-game *(C3)*~~ **removed** | Zone 1, road fork | Was: "The middle road is suicide. Take the north tunnel." | No longer present in `api/zones/world.json` — dropped during a PO editor pass. Re-add if the group-gate warning (§8) is still wanted. |
| Kobold signpost ("KoboldSign") | ~~in-game *(C3)*~~ **removed** | Zone 1, SE path | Was: "Kobolds burrow south-east of here. They hoard shiny stuff, the vermin." | No longer present in `api/zones/world.json` — dropped during a PO editor pass. |
| Tunnel guard | superseded *(C3)* | Zone 1, tunnel mouth | ~~Warns about the tunnel darkness~~ | Superseded by the signpost-only clue ruling (plan-content-zones12 §8). |
| Troll-territory guide *(working title)* | idea | TBD (leads to troll territory) | Clue NPC — leads the player toward troll territory. | Clue anchor chain (→ `content-world.md`). |

## Quest roles (plan-quests.md C4, 2026-07-30)

A quest file never names who talks about it — the rows live on the conversants
and reference the quest (D11), so this table is the only place the world's quest
wiring reads as one picture. Diary prose lives in `api/quests/*.json`; rewards
live in the NPCs' `interaction` blocks and are served by nothing.

| NPC | quest | role |
|---|---|---|
| Hermit | `village-welcome` | offers **and** turns in — the talk_to tutorial, and the quest that meets D3's retroactive credit head-on (most players have already met both targets, so it cascades on accept) |
| Farmer | `village-welcome` | a talk_to target |
| Farmer | `turnip-chore` | offers and turns in; the **Harvest** teaching the objective needs sits behind his root `Teach me something.` row, and the quest brief points at it |
| Town crier | `village-welcome` | a talk_to target |
| Town crier | `wolves-on-the-road` | offers it, and turns in **nothing** — his quest node's brief is where the player learns there is a choice at all |
| City guard | `wolves-on-the-road` | **branch leg A** → `told_militia`, rewards **Taunt** + 400 XP |
| Shaman | `wolves-on-the-road` | **branch leg B** → `told_shaman`, rewards **Slow** + 400 XP |
| Lampless traveller | `the-lost-lamp` ("The Lost Lamp") | offers and turns in the simple three-stage version (Q4/R3); rewards **Lantern** + 700 XP — ⚑ the turn-in row is the aura's **only source in the world** (L5b; the kobold drops died with Q4) |
| Farmer | `boars-in-the-field` | offers and turns in (his **second** quest — the first two-offer giver); 6× Boar L2, 180 XP. Generic kill quest (plan-generic-kill-quests.md C1, 2026-08-07); rewards follow the L9 half-level rule |
| Lamplighter | `dire-wolves-in-the-forest` | offers and turns in; 4× DireWolf L6, 370 XP (C1). The closer EliteWolf was deliberately left a discovery (the ForestSign clue's mob) |
| Wanderer | `kobolds-on-the-road` | offers and turns in; 8× Kobold L7, 450 XP (C1). The giver actually beside the nest; the species overlap with `the-lost-lamp` double-credits when both run — deliberate (N4/D4 baselines make it clean) |
| Miner | `spiders-in-the-diggings` | offers and turns in; 6× Spider L11, 930 XP (C1) — the quest his tunnel idle-lore was already pointing at |
| Shaman | `dire-wolves-at-the-camp` | offers and turns in (C2, 2026-08-07); 6× DireWolf L11, 930 XP — giver and the wolves-branch foreign turn-in coexist on his root |
| Emberkeeper | `bandits-at-the-shrine` | offers and turns in; 6× Bandit L12–13, 1250 XP (C2) — ⚑ **the first human-target kill quest**; only the plain Bandit species counts, and it is the applied half of his `news` node's bandit-camp line |
| Village healer | `alpha-wolves-at-the-village` | offers and turns in; 5× AlphaWolf L15, 1900 XP (C2) — "fewer wolves, fewer wounded" |
| City guard | `bears-at-the-walls` | offers and turns in (C2); 5× Bear L16, 2300 XP — giver and the wolves militia turn-in coexist on his root |
| Front captain | `thin-the-orc-line` | offers and turns in; 5× Orc L20 **elite**, 4800 XP (C2) — the punchy endgame cull; five elite kills pay ~12.5 at-level kills before the reward |
