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
| Farmer | in-game *(C1)* | Zone 1, farm field south of the village | Teaches **Harvest**; offers and turns in `turnip-chore`. | The peasant onboarding anchor (GDD §5 as amended in C1) + first harvest-mob loop (GDD §8). Harvest is *taught*, not granted — a fresh spellbook holds exactly the level-1 milestone (Damage, Q4). |
| Village hermit | in-game *(C8 Session ⑦)* | Zone 1, inside the village | Teaches **FirstAid** then the **Heal** aura. | The healer hermit moved into the village in Session ⑦. Teaching FirstAid here is why it left the milestone table (2026-07-21) — the milestone granted it *later* than this NPC does, making the milestone dead weight. |
| Forest hermit | in-game *(C2)* | Zone 1, dark forest, deep NW pocket | Teaches **Torch** (plain-text row); idle lore line about carrying your own light. | No level gate (PO 2026-07-17) — surviving the walk-in is the gate; the mandatory `tooLowLine` field is flavor-only. Sprite `entityType: "Hermit"`. |
| Dog | in-game *(C2)* | Zone 1, mid-forest clearing | Says **"Woof."**; teaches **SummonCompanion**. | The player-companion showcase; sprite `entityType: "DogNpc"`, the summoned companion reuses the dog look. ⚑ The old "Woof?" teach-row joke went with the 2026-08-02 plain-text unification (the row now names the skill); the dog still answers in dog. |
| Miner | in-game *(C3)* | Zone 1, lit staging area at the tunnel's west mouth | Teaches **Pickaxe** (plain-text row); idle lore about the overrun tunnel. | The rockfall-gate key handed out a few steps before its lock (PO 2026-07-17: `smash` gate tag via a Miner). Sprite `entityType: "Miner"`. |
| Shaman | in-game | Zone 2 approach | Teaches **SummonTotem**. | The totem line's world source. |
| Emberkeeper | in-game | Zone 2, north | Teaches the whole fire line in order: **Torch**, then **Ignite**, then **Immolate**. | The fire-identity ladder in one NPC — and the reason Ignite/Immolate are no longer cheat-only (both are Wildfire ingredients). |
| Village healer | in-game *(C4; purpose settled since)* | Zone 2 village, by the campfire | Teaches **Revive** — the group-support capstone. | Was placed lore-only in C4 as a spot reservation with its purpose left open (§11); that question is now closed — it is the world source for Revive, which was previously proving-grounds-only. Sprite `entityType: "VillageHealer"`. |
| Front captain ("FrontCaptain") | in-game *(C5)* | Zone 2, front staging area east of the checkpoint | **Level-gated teaching Vanguard** (the Front-Aura, §A); war-banner briefing behind a lore row. Idle lore: the orcs hold the south passage. | The story-spine beat 6 NPC — historically the first real refusal-line gate in content (that mechanism died in Q1; the row greys inert now). The anchor level = the journey's final step in v1 (PO 2026-07-18; closes the §11 level-anchor item). Sprite `entityType: "FrontCaptain"`. |
| City guard | in-game *(C4)* | Zone 2, before the City Gates wall | Teaches **Strong**; gates shut while the front burns; `wolves-on-the-road` militia turn-in; points the player south to the army. | The story-spine beat 5 NPC (plan-content-zones12 §3) + Zone 3 teaser. Sprite `entityType: "CityGuard"`. (The old "lore-only" note here was drift — he has taught Strong since C4-era content.) |
| Forest signpost ("ForestSign") | in-game *(C2)* | Zone 1, dark-forest south entrance | Lore-only clue: "Something big prowls the dark forest." (→ Elite Wolf, plan-content-zones12.md §8). | First NPC with an authored sprite — zone-JSON `entityType: "Signpost"` (C2 NPC-sprite lift). |
| Wanderer / Traveller | in-game *(C8 Session ⑥)* | Zone 1–2 roads, ambient | Lore-only flavor; the "LamplessTraveller" variant seeds the light beat. | Ambient world-population pass (EntityType 63/64). PO places them in the editor. |
| Tunnel signpost ("TunnelSign") | ~~in-game *(C3)*~~ **removed** | Zone 1, road fork | Was: "The middle road is suicide. Take the north tunnel." | No longer present in `api/zones/world.json` — dropped during a PO editor pass. Re-add if the group-gate warning (§8) is still wanted. |
| Kobold signpost ("KoboldSign") | ~~in-game *(C3)*~~ **removed** | Zone 1, SE path | Was: "Kobolds burrow south-east of here. They hoard shiny stuff, the vermin." | No longer present in `api/zones/world.json` — dropped during a PO editor pass. |
| Tunnel guard | superseded *(C3)* | Zone 1, tunnel mouth | ~~Warns about the tunnel darkness~~ | Superseded by the signpost-only clue ruling (plan-content-zones12 §8). |
| Troll-territory guide *(working title)* | idea | TBD (leads to troll territory) | Clue NPC — leads the player toward troll territory. | Clue anchor chain (→ `content-world.md`). |
| Sage | in-game, **legacy** | Proving grounds | Teaches Heal @L1, Dash @L5, Revive @L5, Reaper @L10; has lore lines. | First shipped teaching NPC (step 5). Lives in the `legacy: true` proving-grounds zone — **not world-reachable**, so it does not count as an unlock source. |

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
