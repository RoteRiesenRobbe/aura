# Asset tracker — art, animation, audio

> ⛔ **GENERATED FILE — do not edit.** The source of truth is
> [`assets.csv`](assets.csv); this view is rebuilt by
> `node tools/asset-tracker.mjs`. Edit the CSV, or edit the Google Sheet and
> export it back over the CSV.

> ⚑ **`current_file` and `format` DRIFT, and nothing here catches it.**
> Both columns are hand-typed and are never checked against disk, so when art
> is repainted the tracker keeps naming the old file. Found 2026-09-24:
> **25 rows still said `.svg` / `SVG`** — Tree, Boulder, Rock, 13 mobs,
> Campfire + Camp and 7 NPCs — a month after the painted PNGs landed
> (`abe150ac`, 2026-08-21). Corrected the same day against the real load
> paths (`client-data/Graphics.ts` and `api/props/*.json` `sprite`), not
> against "a .png exists next to it".
>
> ⭐ **Next iteration: make this checkable.** The audit is mechanical — parse
> `Graphics.ts` + `api/props/*.json`, compare to `current_file`, fail
> `--check` on a mismatch. Until that exists, **re-audit these two columns by
> hand after any art commit**, and treat a `.svg` in a row whose art you know
> is painted as stale rather than as fact.

**To share with an artist or musician:** Google Sheets → File → Import →
Upload → `assets.csv` → *Replace current sheet*. Freeze the header row, filter
on `kind` / `priority` / `state`, and hand over the tab. The `owner` and
`status` columns are deliberately empty for them to fill.

The brief every row is judged against — the Portrait Rule, tone, scale, and the
rendering constraints new art must survive — lives in [`README.md`](README.md).
How a file becomes a sprite: [`pipeline.md`](pipeline.md).

Rendered 2026-09-24 from 221 rows.

---

## Where the work is

| Kind | Rows |
| --- | ---: |
| Art | 187 |
| Audio | 20 |
| Animation | 8 |
| Constraint | 6 |

| State | Rows | Means |
| --- | ---: | --- |
| ✅ drawn | 89 | has its own art today |
| ⚠️ shared | 9 | ⚠ renders using another entity's art — needs its own to exist as a distinct thing |
| 🟡 placeholder | 40 | a placeholder file ships; it is not the real thing |
| 🟡 stock | 10 | a stock/borrowed texture stands in (the pd* set) |
| ❌ missing | 44 | nothing exists |
| ⚙️ code | 14 | drawn procedurally in code, no art file |
| ⛔ blocked | 5 | cannot be delivered until engine work lands |
| — n/a | 10 | a constraint or a number to judge, not a file to draw |

| Priority | Rows | Rule |
| --- | ---: | --- |
| **P0** | 31 | do first — highest placement count, or flagged ⭐ as unusually high stakes |
| **P1** | 53 | high — shared art, or 20+ placements, or a named gameplay gap |
| **P2** | 70 | normal — placed but not everywhere |
| **P3** | 67 | low — unplaced, deferred, or already fine |

**108 rows need work** (missing, shared, placeholder, stock or blocked),
of which **11 are P0**:

| | Asset | Kind | State | Why it matters |
| --- | --- | --- | --- | --- |
| ⚠️ | **AscensionStone** | NPC | shared | ⭐ The meta-progression altar, where a max-level character is spent. The game's most significant object currently looks like a road sign. Owes a site, not just a prop. |
| ⚠️ | **Boulder** | Prop | shared | Large blocking rock. Shadow baked in, never rotated. |
| 🟡 | **sword (strike)** | VFX | placeholder | ⭐ The single most-drawn skill body: every melee thrust and swing in the game, players and humanoid mobs alike. Engineering ships a plain generated placeholder under this exact name in C3a; the artist overwrites it. Spec: skill-vfx-asset-spec.md §4 + §7. |
| 🟡 | **wolf-jaw (strike bite)** | VFX | placeholder | ⭐ One upper jaw, hinged at its bottom-left corner: the engine mirrors it, swings both halves about the hinge and closes them over the victim from the WOLF's side. Serves WolfBite (Wolf, DireWolf, AlphaWolf) and EliteWolfBite - 187 placements. Generated placeholder ships in C3a. Spec: §4 (the bite diagram). |
| 🟡 | **arrow (projectile)** | VFX | placeholder | ⭐ Every arrow and bolt in the game: LongRangeStrike, BanditVolley, KoboldVolley, Suppression. Generated placeholder ships in C3a. Spec: §4. |
| ❌ | **bow (cast-pose)** | VFX | missing | Worn on the caster as the arrow leaves, aimed at the victim. Pairs with fxbody-arrow on the same three skills; without it the bow stays a code-drawn rectangle. Spec: §4. |
| ❌ | **Ability icons** | UI | missing | ⭐ 59 authored abilities and not one icon. The ability bar, spellbook and every tooltip render text. Listed for sizing: after the mob roster this is the largest art job in the project, and the one players stare at constantly. |
| 🟡 | **Forest** | Terrain profile | placeholder | Zone 2 base ground. GENERATED placeholder (tools/make-cellular-tiles.mjs): moss duff |
| 🟡 | **Road** | Terrain profile | placeholder | Every road in the game. GENERATED placeholder (tools/make-cellular-tiles.mjs, the cellular family's third tile): packed brown earth with two warm grades of pebble pressed into it and hairline dried-mud cracks, all of it DELIBERATELY QUIET. ⛔ It USED TO BORROW pd106, the DESERT tile, so every lane was golden sandstone - that was the whole brief. ⛑ Three faults worth not repeating, all of them only visible once the tile REPEATS: too few slow bed waves paint a diagonal corduroy stripe; a neutral-grey pebble reads BLUE against warm brown; and mud cracks as a ridged field make closed loops that read as worm trails until they are thin and faint. ⛔ NO CART RUTS - a rut is directional and would need alignTexture, which wants one path per straight leg, and all three Road paths are multi-point meanders. Ruts are a second tile. ⭐ It ships at a SIXTH of its first pass' detail (PO: reads a little messy) - a ground tile is looked THROUGH, not at, and every mark repeats nine times across a screen, so one that looks slightly empty alone is the one that is right in the world. Real art wanted. |
| 🟡 | **Fog** | Atmosphere | placeholder | Haze 0.5 on a placeholder tile. Drifting suspended matter, nothing erases it but a clearing. |
| 🟡 | **Tree variant 2** | Prop | placeholder | ⭐ The second tree silhouette, and the rule it was drawn to: a variant must differ in SILHOUETTE, never just in colour - the eye counts outlines long before it compares hues. roundTree is a smooth circle, this is a SPIKED WHEEL (four concentric whorls of drooping branch tips, which is what a spruce is from straight above). Placeholder SVG, body r0.9 vs the round tree 1.0, collider half that (the trunk). ⛑ The tiers are concentric, NOT offset toward the light - nudging them up-left fakes height and draws a LEANING tree, so the depth is a radial gradient plus a shade crescent instead. Colder and darker than roundTree #21790f, but held light enough to survive the Canopy darkness 0.22. Generic prop, so no treeSpot decal (hidden under the crown anyway). |

---

## Full listing

# Art

## Mob — 32

| | Name | Current | Pri | # | Size | Where / notes |
| --- | --- | --- | --- | ---: | --- | --- |
| ✅ | **Wolf** | `wolf.png` | P0 | 109 | 76–92 | ⭐ Most-placed mob in the game. Lean forest wolf hunting prey and players. Sets the baseline read for "enemy". |
| ✅ | **DireWolf** | `direWolf.png` | P1 | 43 | 96–112 | Heavier dark-forest wolf. Same bite; the step-up is pure stats. |
| ✅ | **EliteWolf** | `eliteWolf.png` | P2 | 9 | 112–128 | The "something big" the forest sign warns about. Gets a silver ring. |
| ✅ | **AlphaWolf** | `alphaWolf.png` | P2 | 16 | 116–136 | Apex of the line. Fast chaser near the village. |
| ✅ | **Bear** | `bear.png` | P2 | 16 | 140–164 | Slow heavy tank that rages below half HP — no visual tell for that yet. |
| ✅ | **DireBear** | `direBear.png` | P2 | 8 | 156–180 | Largest non-boss wildlife in the game. |
| ✅ | **Boar** | `wildboar.png` | P1 | 58 | 92–112 | Passive until hit, then gores. Must not look hostile — that's the point. |
| ✅ | **Stag** | `stag.png` | P1 | 35 | 84–100 | Bolts on any damage, drops nothing. Carries the peaceful-world tone. |
| ✅ | **Spider** | `spider.svg` | P2 | 17 | 76–92 | Tunnel spider, lifesteal bite. Staged in daylight at the west mouth first. |
| ✅ | **VenomSpider** | `venomSpider.svg` | P2 | 6 | 84–100 | Deep-dark poison. Must differ from Spider in near-darkness, 8 px apart. |
| ✅ | **GiantSpider** | `giantSpider.svg` | P2 | 5 | 116–136 | Fastest normal mob in the game (0.95). Should look fast. |
| ✅ | **Kobold** | `kobold.png` | P1 | 20 | 60–72 | Weak swarm melee, flees at 25 %. Reads as a crowd — silhouette over detail. |
| ✅ | **KoboldRanged** | `koboldRanged.png` | P2 | 6 | 60–72 | Back-line volley. Same size as melee, so the drawing carries the difference. |
| ✅ | **Bandit** | `bandit.png` | P1 | 21 | 72–84 | The baseline human enemy. Blades + bleed. Never flees. |
| ✅ | **BanditRanged** | `banditRanged.svg` | P2 | 4 | 72–84 | Crossbow volley from behind the line. |
| ✅ | **BanditHealer** | `banditHealer.svg` | P0 | 3 | 72–84 | ⭐ Never attacks; out-heals a solo player. The encounter assumes you can spot it in a crowd instantly. Highest readability need on the list. |
| ✅ | **BanditPyromancer** | `banditPyromancer.svg` | P2 | 3 | 92–104 | Fire mage hanging back behind the melee. |
| ✅ | **RallyDrummer** | `rallyDrummer.svg` | P0 | 1 | 88–100 | ⭐ Shields allies, never itself. Second kill-priority — same crowd problem. |
| ✅ | **EliteBandit** | `eliteBandit.svg` | P2 | 1 | 100–116 | Camp leader, crits. Silver ring. |
| ✅ | **Marauder** | `marauder.png` | P2 | 10 | 88–104 | Veteran outlaw past the camp — with no elite frame to lean on. |
| ✅ | **OrcGrunt** | `orcGrunt.svg` | P2 | 3 | 84–96 | Reinforcement wave add at the boss. |
| ✅ | **Orc** | `orc.png` | P0 | 12 | 104–120 | ⭐ Must read hostile while standing next to friendly soldiers. Faction contrast is the design job. |
| ✅ | **OrcWarlord** | `orcWarlord.svg` | P0 |  | 156–168 | ⭐ The world boss and the v1 completion beat. Only boss in the game. Gold ring. |
| ✅ | **WarbannerTotem** | `warbannerTotem.svg` | P3 |  | 100–108 | Two banners make the boss invulnerable. Must read "break me" across an arena. |
| ✅ | **ArmySoldier** | `armySoldier.svg` | P0 | 18 | 72–84 | ⭐ The only friendly combatant in the world. Currently the same size as a Bandit — the friend/foe read is entirely on the art. |
| ✅ | **FireElemental** | `fireElemental.svg` | P2 | 4 | 104–124 | A living flame. Advances, doesn't chase. |
| ✅ | **GreaterFireElemental** | `greaterFireElemental.svg` | P2 | 1 | 144–168 | A walking furnace. The size gap is the tier signal — keep them obviously the same creature. |
| ✅ | **Troll** | `troll.svg` | P2 | 6 | 128–144 | Solitary bruiser at the map outskirts. Nothing else in the world looks like it should. |
| ✅ | **Turnip** | `turnip.svg` | P2 | 6 | 40–52 | Smallest sprite in the game. Immune to everything but Harvest. A plant you pull, not a creature you kill. |
| ❌ | **Goblin** | — | P1 |  | 60–76 | Z2 Woodland — Named in the world bible beside Kobold; no definition and no art exist. Must read as a DIFFERENT species from Kobold at the same size, not a recolour. |
| ✅ | **AlphaBoar** | `wildboar_alpha.png` | P2 |  | 104–124 | Z1 Farmland — Elite tusker leading the sounder, and the first elite a new player meets. It got its OWN silhouette rather than the entityType-variant shortcut this row used to allow — a mob whose only tell is the health bar is one the player cannot decide to avoid. Rendered at 52-62 (this column is DPR-2). Placement is the PO's: the mill POI takes exactly one. |
| ❌ | **BanditLeader** | — | P2 |  | 100–116 | Z2 bandit camp — Named elite leading the Woodland camp. Content on top of EliteBandit — art optional, but a named antagonist with the generic elite face is a missed beat. |

## Hazard — 4

| | Name | Current | Pri | # | Size | Where / notes |
| --- | --- | --- | --- | ---: | --- | --- |
| ✅ | **Bramble** | `bramble.svg` | P2 | 4 | 116–132 | Thornwall sealing a forest shortcut. Must read breakable, unlike a tree. |
| ✅ | **Rockfall** | `rockfall.svg` | P2 | 2 | 116–132 | Pickaxe-only wall sealing the venom-spider nest. Also needs to read in the dark. |
| ✅ | **PoisonPool** | `poisonPool.svg` | P2 | 15 | 120–140 | Unkillable floor hazard. Ground-plane read: "don't step here". |
| ✅ | **SpikeBarricade** | `spikeBarricade.svg` | P2 | 9 | 120–132 | Unkillable hazard shaping the approach to the boss. |

## Fixture — 8

| | Name | Current | Pri | # | Size | Where / notes |
| --- | --- | --- | --- | ---: | --- | --- |
| ✅ | **Campfire** | `campfire.png` | P0 | 5 | 120 | ⭐ The most important friendly object in the game — bind point, respawn point, heal, fast-travel node. Players navigate by these. |
| ⚠️ | **Camp** | `campfire.png` | P1 |  | 60 | Your own temporary fire. Size is currently the only cue it's temporary — own art is a gameplay fix, not polish. |
| ✅ | **Totem** | `totem.svg` | P3 |  | 100 | Stationary aura carrier. |
| ✅ | **FireTotem** | `fireTotem.svg` | P3 |  | 100 | Identical size to Totem — they're siblings, differ by drawing only. |
| ✅ | **Companion** | `companion.svg` | P3 |  | 80 | Design intent: reuses the Dog look. |
| ✅ | **SoldierCompanion** | `soldierCompanion.svg` | P3 |  | 68–76 | The Call for Aid squad. |
| ✅ | **ShieldbearerCompanion** | `shieldbearerCompanion.svg` | P3 |  | 76–84 | The Hold the Line tank. |
| ✅ | **MedicCompanion** | `medicCompanion.svg` | P3 |  | 64–72 | The Field Medics healer. |

## NPC — 18

| | Name | Current | Pri | # | Size | Where / notes |
| --- | --- | --- | --- | ---: | --- | --- |
| ✅ | **Farmer** | `farmer.png` | P0 |  |  | Z1 farm field — ⭐ The first NPC a player ever meets. Teaches Harvest; gives the first two quests. |
| ✅ | **Hermit** | `hermit.png` | P3 |  |  | Z1 village — The quest hub. Teaches First Aid, Heal, Calm, Charm Beast. |
| ✅ | **TownCrier** | `townCrier.png` | P3 |  |  | Z1 village centre — The village-arrival anchor. Teaches Recall. |
| ✅ | **Dog** | `dogNpc.svg` | P3 |  |  | Z1 forest clearing — Says "Woof." Teaches Summon Companion. Only non-human talker. |
| ✅ | **Miner** | `miner.svg` | P3 |  |  | Z1 tunnel west mouth — Teaches Pickaxe — the key handed out just before its lock. |
| ✅ | **Wanderer** | `wanderer.svg` | P0 |  |  | Z1–2 roads — ⭐ The only NPC in the game that walks. Worth a walking pose. |
| ✅ | **LamplessTraveller** | `traveller.svg` | P3 |  |  | Z1 tunnel road — Trades his lamp for kobold kills. The turn-in is the only source of the Lantern aura in the world. |
| ⚠️ | **Lamplighter** | `hermit.png` | P1 |  |  | Z1 deep NW forest — The forest hermit. Teaches Torch — carry your own light. |
| ⚠️ | **Shaman** | `hermit.png` | P1 |  |  | Z2 approach — Teaches Summon Totem, at his own fire. |
| ⚠️ | **Emberkeeper** | `hermit.png` | P1 |  |  | Z2 north — The fire ladder in one NPC: Torch → Ignite → Immolate. |
| ✅ | **VillageHealer** | `villageHealer.svg` | P3 |  |  | Z2 village campfire — Teaches Revive — the group-support capstone. |
| ✅ | **CityGuard** | `cityGuard.png` | P3 |  |  | Z2 City Gates — Teaches Strong. Gates shut while the front burns; Zone 3 teaser. |
| ✅ | **FrontCaptain** | `frontCaptain.svg` | P3 |  |  | Z2 front staging — Teaches Vanguard @L20. The last giver before the world boss — should look like the end of the road. |
| ✅ | **ForestSign** | `signpost.svg` | P3 |  |  | Z1 dark-forest edge — "DANGER! STAY AWAY!" Points at the Elite Wolf — deliberately the only warning. |
| ⚠️ | **AscensionStone** | `signpost.svg` | P0 |  |  | Z1 village — ⭐ The meta-progression altar, where a max-level character is spent. The game's most significant object currently looks like a road sign. Owes a site, not just a prop. |
| ⚠️ | **MemorialStone** | `signpost.svg` | P1 |  |  | Z1 village — Names of everyone ascended. Stands beside the stone — so the village has two identical signposts side by side. |
| ⚠️ | **FrontAscensionStone** | `signpost.svg` | P1 |  |  | Z2 front — The second site (level 25). Same kind of monument, war-front setting. |
| ❌ | **Shepherd** | — | P2 |  | 84 | Z1 north pasture — Herder NPC for the pasture. A Farmer reskin is acceptable; a distinct one is better, since Farmer is the first NPC in the game. |

## Prop — 35

| | Name | Current | Pri | # | Size | Where / notes |
| --- | --- | --- | --- | ---: | --- | --- |
| ✅ | **Tree** | `roundTree.png` | P0 | 573 | 492 | ⭐ Highest-value asset in the project. Every forest, farm edge, city street and tunnel approach. 2–4 variants would change the world's look more than anything else. Fixed rotation. |
| ✅ | **Tree ground spot** | `treeSpot.svg` | P0 | 573 | 344 | The dark decal under every tree — what makes it feel planted. Randomly rotated. Re-cut it if the tree silhouette changes. |
| ⚠️ | **Boulder** | `stone.png` | P0 | 116 | 456 | Large blocking rock. Shadow baked in, never rotated. |
| ⚠️ | **Rock** | `stone.png` | P1 | 52 | 192 | Same SVG as Boulder, just shrunk. Two real silhouettes = cheapest environment win after trees. |
| ✅ | **Mineral ground spot** | `stoneSpot.svg` | P0 | 168 | ~0.7× | The decal under every rock and boulder. |
| ✅ | **House** | `house.svg` | P0 | 12 | 480 × 360 | ⭐ The only building in the game — the whole village is 12 copies. Aspect is load-bearing: anything not 4:3 visibly squashes. |
| ✅ | **GateWall** | `gateWall.svg` | P1 | 24 | 288 × 288 | Rampart block for the city gate flanks and blocked roads. Must tile seamlessly — 24 sit shoulder to shoulder. |
| 🟡 | **Tree variant 2** | `pineTree.svg` | P0 |  | 216 | ⭐ The second tree silhouette, and the rule it was drawn to: a variant must differ in SILHOUETTE, never just in colour - the eye counts outlines long before it compares hues. roundTree is a smooth circle, this is a SPIKED WHEEL (four concentric whorls of drooping branch tips, which is what a spruce is from straight above). Placeholder SVG, body r0.9 vs the round tree 1.0, collider half that (the trunk). ⛑ The tiers are concentric, NOT offset toward the light - nudging them up-left fakes height and draws a LEANING tree, so the depth is a radial gradient plus a shade crescent instead. Colder and darker than roundTree #21790f, but held light enough to survive the Canopy darkness 0.22. Generic prop, so no treeSpot decal (hidden under the crown anyway). |
| ❌ | **Tree variant 3** | — | P1 |  |  | Third tree silhouette. |
| 🟡 | **Dead tree** | `deadTree.svg` | P1 |  | 228 | ⭐ The strongest silhouette in the forest set, and it is free: a LIVING tree from above is an opaque disc of leaves that hides its own structure, and a dead one IS the structure - the only forest prop that is neither round nor green. ⭐ The CAST SHADOW is the asset, not decoration: a flat branch diagram on flat ground reads as a crack in the earth, so the same limb geometry is drawn twice through <use> (never copied - a shadow out of step with its branches is worse than none), plus a third scaled-up pass for the dark outline, because a <use> cannot widen the strokes it references. ⛔ Collider 0.33 against a 0.95 visual - BRANCHES ARE AIR; blocking to the drip line would make it the most obstructive prop in the game while looking like the most passable. Grey-brown not black, to survive Canopy 0.22. ⛔ Plain href, never xlink:href - see pipeline.md 2. Placeholder SVG. |
| 🟡 | **Stump** | `stump.svg` | P2 |  | 132 | Z1 — Cut stump - reads as people work here at a farm edge and as decay in the forest. Placeholder SVG (body r0.55, collider 0.41: the root flare and the chips are art, not obstacle). ⭐ It has to say CUT, not BROKEN, and the rings do not do that - three things do: the FELLING NOTCH biting in from the rim (a snapped tree has a ragged spike, a felled one a clean V), the SAW KERF (straight parallel lines at one angle, indifferent to the centre, crossing the concentric rings), and the CHIPS thrown onto the grass. Rings are 2px off-centre or they read as a machined target. ⛔ The thick DARK BARK RING is load-bearing: haystack.svg was misread as a stump once, because a pale disc with radial lines IS a stump - the rim is what tells them apart. |
| 🟡 | **Fallen log** | `fallenLog.svg` | P2 |  | 288 x 84 |  |
| 🟡 | **BrokenFence** | `brokenFence.svg` | P1 |  | 240 x 192 | Z1 |
| 🟡 | **Bush** | `bush.svg` | P1 |  | 108 | The understorey - trees with nothing between them is an orchard. ⭐ NON-BLOCKING by definition, which IS the asset: the only forest filler that can be scattered by the hundred without adding a collider. A placement can still override it. ⛔ The hard part is that it must not read as a SMALL TREE, and size does not achieve that - three things do: no centre (the lobes are off-balance, the pale one up-left; centre the highlight and it is a sapling), a lumpy outline (five overlapping lobes with leaf marks straddling the rim), and a warmer yellower green than either tree. Placeholder SVG, body r0.45. |
| ❌ | **Fern** | — | P2 |  |  | Z2 — Forest-floor filler, Zone 2. |
| 🟡 | **Haystack** | `haystack.svg` | P1 |  | 204 | Z1 — Farmland vocabulary. Zone 1. Placeholder SVG (body r0.85): ragged straw mound, top-down. The first draft read as a TREE STUMP - a clean circle, concentric rings and even radial lines are growth rings; irregularity is what makes it straw. |
| 🟡 | **Cart** | `cart.svg` | P1 |  | 264x156 | Z1 — Farm cart. Doubles as the burnt-cart POI when wrecked. Placeholder SVG (body 2.2x1.3 rect; the viewBox carries the aspect, like house.svg). The shaft points WEST in the art; a rect prop turns with its collider (plan-prop-scale.md C2b), so rotate the placement to aim it. |
| 🟡 | **Burnt cart** | `burntCart.svg` | P1 |  | 264x156 | Z1 |
| ❌ | **Plough** | — | P2 |  |  | Z1 — Farmland dressing. |
| 🟡 | **Well** | `well.svg` | P1 |  | 168 | Z1 — Village centre landmark. Placeholder SVG (body r0.7): stone ring, open shaft, thin winding beam. No roof - it would hide the hole that identifies it. |
| ❌ | **Trough** | — | P3 |  |  | Z1 — Farmyard dressing. |
| 🟡 | **Barn** | `barn.svg` | P1 |  | 720x480 | Z1 |
| 🟡 | **Cottage variant** | `cottage.svg` | P1 |  | 360 x 312 | Z1 — ⭐ The village's third building, so it stops being 12 copies of House. It separates from house.svg on MATERIAL first and shape second: the house is a TILED GABLE (two red rectangles either side of one long ridge, straight courses ruled across), this is a THATCHED HIP (four soft straw faces to a short ridge, pale gold, no straight line anywhere). Two buildings can share a footprint and still not be confusable if they are made of different stuff. ⭐ The RAGGED EAVE is the tell a tiled roof can never have - thatch frays rather than ends, drawn as a heavy DASHED stroke round the eave line so each dash is a bundle of straw ends. ⛑ Four separate gradients, one per face, dark at the eave and pale at the ridge: a hipped roof painted flat reads as an OPEN CRATE looked into from above, which is exactly what mill.svg had to be re-cut for. ⛑ Smaller and squarer than the house (3.0x2.6 vs 4x3) - hip a long rectangle and the ridge grows until it is a gable again. Stone chimney oversized on purpose: a thatched cottage needs its fire to be visibly non-flammable. Placeholder SVG. |
| 🟡 | **Mill** | `mill.svg` | P2 |  | 600x480 | Z1 |
| ❌ | **Bridge deck** | — | P1 |  |  | Z1 — The river crossing. ⚑ Must author crossesPaths:true and blocksMovement:false — both, or it walls its own deck (plan-world-paths L9). |
| 🟡 | **Fence post** | `fencePost.svg` | P2 |  | 53 | Terminates hedgerow/fence paths, which have no end-cap art. Placeholder SVG (body r0.22): the post END GRAIN, seen top-down. No rail stubs - a path leaves in any direction and a prop rotation is never applied. |
| 🟡 | **Gate** | `gate.svg` | P2 |  | 240x192 | Z1 |
| 🟡 | **Palisade segment** | `palisade.svg` | P1 |  | 288 x 96 | Z2 |
| ❌ | **Tent** | — | P2 |  |  | Z2 — Bandit camp. |
| 🟡 | **Crate** | `crate.svg` | P3 |  | 108 | Z1 — Camp/village clutter. Placeholder SVG (body 0.9x0.9 rect): lid boards, iron banding, top-down. |
| 🟡 | **Torch** | `torch.svg` | P1 |  | 62 | Z1 — The only prop that EMITS LIGHT. Half a campfire radius (3.5 u), punched into the darkness overlay from zone.props at load - never streamed, or a dark pocket pops lit the moment the torch enters the viewport. Placeholder SVG (body r0.26, about a player wide): a tiny campfire from above, palette lifted from mobs/campfire.svg. Draws at 62 px: doubled from r0.13 on 2026-09-20 because a torch is the one small prop a player looks at. |
| ❌ | **Signpost art** | — | P1 |  |  | Z2 — ForestSign exists as an NPC but wears signpost.svg alongside three monuments — see the shared-art warning. |
| ❌ | **Mushroom cluster** | — | P3 |  |  | Z2 — Forest floor dressing, Zone 2. |
| ❌ | **Mossy rock** | — | P2 |  |  | Z2 — Rock variant for the forest. Rock and Boulder are the same SVG scaled. |
| 🟡 | **Cave mouth frame** | `caveMouth.svg` | P1 |  | 360 x 288 | Z2 |

## Ground decal — 16

| | Name | Current | Pri | # | Size | Where / notes |
| --- | --- | --- | --- | ---: | --- | --- |
| ✅ | **Sand** | `sand1.svg` | P0 | 372 | 150–300 | ⭐ Every road in the game is this one blob, scaled and flipped. Second-most-repeated image after the tree. |
| ✅ | **Land** | `land1.svg` | P1 | 74 | 150–300 | The same shape recoloured to the land colour, to paint land back over edges. Follows Sand. |
| ✅ | **Stone Patch** | `stonePatch.svg` | P2 | 17 | 130–300 | Grey ground patch. |
| ✅ | **Dark Stone Patch** | `darkStonePatch.svg` | P3 | 0 | 130–300 | Authored, never placed. |
| ✅ | **Dark Green Grass 1** | `darkGrass1.svg` | P2 | 7 | 180–300 | Dark grass tuft cluster. |
| ✅ | **Dark Green Grass 2** | `darkGrass2.svg` | P2 | 12 | 180–300 | Second dark tuft shape. |
| ✅ | **Green Grass 1** | `grass1.svg` | P2 | 6 | 180–300 | Light grass tuft cluster. |
| ✅ | **Green Grass 2** | `grass2.svg` | P2 | 4 | 180–300 | Second light tuft shape. |
| ✅ | **Pebble** | `pebble.svg` | P2 | 1 | 130–200 | Small stone scatter. |
| ✅ | **Dark Pebble** | `darkPebble.svg` | P2 | 9 | 130–200 | Darker scatter. |
| ✅ | **Rubble** | `rubble.svg` | P3 | 0 | 50–100 | Debris scatter. Never placed. |
| ✅ | **Dark Rubble** | `darkRubble.svg` | P2 | 15 | 50–100 | Darker debris. |
| ✅ | **Puddle** | `puddle.svg` | P3 | 0 | 60–140 | Never placed. |
| ✅ | **Dark Puddle** | `darkPuddle.svg` | P3 | 0 | 60–140 | Never placed. |
| ✅ | **Flowers** | `flowers.svg` | P2 | 15 | 70–100 | White-outlined cluster — currently the only colour accent in the terrain set. |
| ✅ | **Leaves** | `leaves.svg` | P2 | 5 | 50–100 | Fallen leaf scatter. |

## Player — 3

| | Name | Current | Pri | # | Size | Where / notes |
| --- | --- | --- | --- | ---: | --- | --- |
| ✅ | **Player character** | `characters/player.svg` | P0 |  | 60 | ⭐ One drawing is every player on the server — there's no avatar system yet. A portrait; never rotates. Smallest important sprite in the game. |
| ⚙️ | **Player hands** | — | P3 |  | tiny | Two circles drawn procedurally, skin #f2a586 + black outline. If the avatar's shape changes, these move or go. |
| ✅ | **Corpse / gravestone** | `corpse.svg` | P3 |  | 100 | The marker at a death spot. Placeholder — death is a real beat in a game with a sacrifice loop. |

## VFX — 29

| | Name | Current | Pri | # | Size | Where / notes |
| --- | --- | --- | --- | ---: | --- | --- |
| ⚙️ | **Aura rings** | — | P0 |  |  | ⭐ The single biggest VFX opportunity. Auras are the only way anything interacts, so this is the combat language. Currently plain circles. Colours (all placeholder): damage #e04a3c · dot #9a4ec9 · heal #4ec96a · shield #e0b83c · slow #4a9ae0 · light #f0dfa0 · resist #5fbfb0. |
| ⚙️ | **Aura tick indicator** | — | P3 |  |  | The pulse when an aura fires — the beat that says damage landed. |
| ⚙️ | **Effect pips** | — | P3 |  |  | 4 px dots over the head, one per applied effect. Shares the aura colour language on purpose. Known gap: a stun is indistinguishable from a slow on the wire. |
| ⚙️ | **Overhead health bar** | — | P3 |  |  | Health + shield under every mob. Health #aa3b3b, shield #7dc3ff. |
| ⚙️ | **Tier frame ring** | — | P3 |  |  | Silver #c8ccd4 elite / gold #e8c04a boss. Normal gets none — a frame always means "above baseline". ⚑ Do not draw: replaced by the medallion rim layer (medallion-asset-spec.md §4.3); the normal-stays-bare rule survives the replacement. |
| ⚙️ | **Nameplate & level** | — | P3 |  |  | Difficulty-coloured text. Sits on top of every mob and eats the space under it. |
| ⚙️ | **Interact badge** | — | P3 |  |  | The "you can talk to this" marker over an NPC in range. |
| ⚙️ | **Damage flash** | — | P3 |  |  | Colour flood #BF153A over the whole sprite on hit, plus a gold burst ring for cooldowns. Applies to everything. |
| ⚙️ | **Campfire dwell ring** | — | P3 |  |  | Fills while you rest at a fire — the recovery timer made visible. |
| ⚙️ | **Ascension channel** | — | P0 |  |  | ⭐ The 10 s channel that ends a character. The most important moment in the progression loop — and currently only the channelling player can see it. |
| ⚙️ | **Darkness overlay** | — | P3 |  |  | The mask itself. A constraint on art rather than an asset. |
| 🟡 | **sword (strike)** | `sword.png` | P0 | 15 | 128 x 32 | ⭐ The single most-drawn skill body: every melee thrust and swing in the game, players and humanoid mobs alike. Engineering ships a plain generated placeholder under this exact name in C3a; the artist overwrites it. Spec: skill-vfx-asset-spec.md §4 + §7. |
| 🟡 | **wolf-jaw (strike bite)** | `wolf-jaw.png` | P0 | 2 | 128 x 48 | ⭐ One upper jaw, hinged at its bottom-left corner: the engine mirrors it, swings both halves about the hinge and closes them over the victim from the WOLF's side. Serves WolfBite (Wolf, DireWolf, AlphaWolf) and EliteWolfBite - 187 placements. Generated placeholder ships in C3a. Spec: §4 (the bite diagram). |
| 🟡 | **arrow (projectile)** | `arrow.png` | P0 | 4 | 96 x 24 | ⭐ Every arrow and bolt in the game: LongRangeStrike, BanditVolley, KoboldVolley, Suppression. Generated placeholder ships in C3a. Spec: §4. |
| ❌ | **bow (cast-pose)** | — | P0 | 3 | 96 x 32 | Worn on the caster as the arrow leaves, aimed at the victim. Pairs with fxbody-arrow on the same three skills; without it the bow stays a code-drawn rectangle. Spec: §4. |
| ❌ | **maul (strike overhead)** | — | P1 | 2 | 128 x 32 | The heavy overhead weapon: TrollSmash, WarlordCleave. Must read as slow and heavy beside the sword. Spec: §4 + §7. |
| ❌ | **ward-shard (orbit, white for tinting)** | — | P1 | 6 | 128 x 32 | One near-white drawing circling the caster, recoloured per skill by the layer tint: Aegis, FireWard, FireVulnerability, Venomward, RallyDrum, WarbannerShield. ⚑ Draw it white or light grey - the tint is a multiply and can only darken. Spec: §3. |
| ❌ | **heal-cross (emitter particle, white for tinting)** | — | P1 | 5 | 16 x 16 | The rising heal mote, the PO example ("green crosses and mist"): Heal, Lifewarden, Rejuvenation, BanditHeal, HealerAura. Judge it at 8 px, not at 100 %. The wide mist half of each pair stays code-drawn. Spec: §3 + §7. |
| 🟡 | **spider-fang (strike bite)** | `spider-fang.png` | P1 | 1 | 96 x 40 | One upper fang on the wolf-jaw hinge contract, WHITE (the PO's "two big white fangs"): the engine mirrors it and clamps the pair on the victim's rim. Serves GiantVenomSpit (GiantSpider, 5 placements); SpiderBite (Spider, 17 placements) still draws the bodiless placeholder and could share it. Chelicerae rather than a canine jaw; it must differ from wolf-jaw in near-darkness. Generated placeholder ships in C3a-ii. Spec: §4. |
| ❌ | **venom-glob (projectile)** | — | P1 | 3 | 96 x 24 | The spider spit: VenomSpit, GiantVenomSpit, and since the 2026-09-21 amendment PoisonPoolAura, whose pool now spits a glob at each victim instead of marking it. 26 placements. Full colour (poison green), no tint. Spec: §4. |
| ❌ | **axe (orbit, fired)** | — | P1 | 1 | 128 x 32 | The spinning axes cooldown (WhirlingAxes), one of the PO nine. ⚑ No unlock source in content today, so it is reachable only by dev command. Spec: §7. |
| ❌ | **claw (strike swing)** | — | P1 | 1 | 128 x 32 | BearSwipe - Bear + DireBear, 24 placements. Renamed from bear-claw and raised a band by the 2026-09-21 amendment: a swipe is an ATTACK now, held and swung from the bear, so without this file the bear swings the placeholder BLADE. A raking paw, gripped at the left edge like a weapon. Spec: §4 + §7. |
| ❌ | **tusk (strike thrust)** | — | P1 | 1 | 128 x 32 | BoarGore - Boar, 58 placements, plus the two retired mammoth auras. Renamed from boar-tusk and raised a band by the 2026-09-21 amendment: without this file the boar gores with the placeholder SPEAR. Spec: §4 + §7. |
| ❌ | **ember (emitter particle)** | — | P2 | 3 | 16 x 16 | The warm rising mote at every campfire and camp, and the Lantern aura: CampfireAura, CampAura, Lantern. Campfires are how players navigate. Spec: §7. |
| ❌ | **sickle (strike overhead)** | — | P2 | 1 | 128 x 32 | The gathering aura Harvest, which only damages harvestable nodes. A tool, not a weapon. Spec: §7. |
| ❌ | **pickaxe (strike overhead)** | — | P2 | 1 | 128 x 32 | The Pickaxe aura, which only breaks rock nodes. A tool, not a weapon. Spec: §7. |
| ❌ | **firebolt (projectile)** | — | P3 | 1 | 96 x 24 | Firebolt. Full colour, no tint. ⚑ No unlock source in content today (dev command only), hence P3. Spec: §7. |
| ❌ | **flame-pillar (beam, extend)** | — | P2 | 4 | 64 x 16 | The extending flame pillar. Raised a band by the 2026-09-21 amendment, which gave the same tongue of flame to FireElementalAura, EmberAura and FireTotemAura (8 placements plus the summoned fire totem) beside the dev-only OmniAura. ⚑ A beam body is PULLED between caster and victim: nothing in it may read as squashed. ⛔ The other beam, the lightning flash, is procedural on purpose and must NOT be drawn. Spec: §4 + §5. |
| ❌ | **spear (strike thrust, optional split)** | — | P3 |  | 128 x 32 | An optional later split of fxbody-sword for the 8 stabbing skills, if one blade is not enough. Not owed; listed so the option is on the record. Spec: §7. |

## UI — 7

| | Name | Current | Pri | # | Size | Where / notes |
| --- | --- | --- | --- | ---: | --- | --- |
| ✅ | **Damage vignette** | `overlays/damage.svg` | P3 |  |  | Red screen edge on taking damage. The only full-screen art file in the project. |
| ⚙️ | **Map markers** | — | P3 |  |  | Minimap/world map dots. Own player #00008B, others white, tree green circle, stone grey hex, campfire orange ring #E37313. Known bug: your own 3.5 px dot vanishes under the 9 px campfire marker at your bound fire. |
| ✅ | **NpcPlaceholder** | `npcPlaceholder.svg` | P3 |  |  | The loud "unconfigured NPC" marker. Keep it ugly on purpose. Not used by any shipped mob. |
| ❌ | **Ability icons** | — | P0 |  |  | ⭐ 59 authored abilities and not one icon. The ability bar, spellbook and every tooltip render text. Listed for sizing: after the mob roster this is the largest art job in the project, and the one players stare at constantly. |
| ✅ | **Logo** | `logo.svg` | P3 |  |  | The Aura wordmark. Still carries the inherited branding lineage. |
| ✅ | **Settings icon** | `settings-icon.svg` | P3 |  |  | Gear. |
| ✅ | **Day cycle icon** | `cycle-icon.svg` | P3 |  |  | Day/night indicator — the cycle is switched off at config level, so this is dark code. |

## Terrain profile — 24

| | Name | Current | Pri | # | Size | Where / notes |
| --- | --- | --- | --- | ---: | --- | --- |
| ✅ | **Fields** | `Grass6.jpg` | P0 |  | seamless tile, 512² suggested | Zone 1 base ground. Shares Grass6 with Suburbs — the two must stop looking identical. |
| ✅ | **Suburbs** | `Grass6.jpg` | P1 |  | seamless tile, 512² suggested | Village/settled ground. Shares Grass6 with Fields. |
| 🟡 | **Ploughed** | `ploughed-placeholder.png` | P1 |  | seamless tile 750² | Z1 — Field plots, worn by POLYGONS on the Fields region (zone guide 2.2), not by regions. GENERATED placeholder (tools/make-field-tiles.mjs): furrow ridges with crevices between the clods. blend 0 - a field plot has straight man-made edges. Ships TWICE, as Ploughed and Ploughed Cross, because a profile has no rotation knob and one row direction everywhere reads as a printing error. scale 1 (NOT the usual 0.35): a tile covers 6.25 u and repeats ~1.7x on screen, where 0.35 repeated five times and read as corduroy. Furrows 0.57 u apart, soft rather than crisp, with sparse dark blotches breaking them - tuned against a reference image the PO supplied. Clods are a cellular lattice, now almost silent. |
| 🟡 | **Wheat** | `wheat-placeholder.png` | P1 |  | seamless tile 750² | Z1 — Standing crop, same posture as Ploughed: a polygon plot, blend 0, and a Wheat Cross twin for the other row direction. GENERATED placeholder (tools/make-field-tiles.mjs), tuned against a tabletop static-grass reference the PO supplied: a dense flock of ~0.05 u TUFTS (the cellular lattice, not waves - wave marks read as squiggles or as ribbed card), with the drills deciding how much crop stands so bare earth shows between them. scale 1, drills 0.5 u apart. Fallback colour moved to #b08f4c with the art. |
| 🟡 | **Forest** | `forest-placeholder.png` | P0 |  | seamless tile, 512² suggested | Zone 2 base ground. GENERATED placeholder (tools/make-cellular-tiles.mjs): moss duff |
| 🟡 | **Swamp** | `pd161.jpg` | P3 |  | seamless tile, 512² suggested | Terrain profile. Colour #585044. All numbers [PLACEHOLDER]. |
| ✅ | **Coastal Cliff** | `sand.jpg` | P3 |  | seamless tile, 512² suggested | Terrain profile. Colour #9c8f74. All numbers [PLACEHOLDER]. |
| ✅ | **Coast** | `sand.jpg` | P3 |  | seamless tile, 512² suggested | Terrain profile. Colour #dfc78d. All numbers [PLACEHOLDER]. |
| 🟡 | **Magic Forest** | `pd184.jpg` | P3 |  | seamless tile, 512² suggested | Terrain profile. Colour #6a52d4. All numbers [PLACEHOLDER]. |
| 🟡 | **Dead Magic Forest** | `pd153.jpg` | P3 |  | seamless tile, 512² suggested | Terrain profile. Colour #3b2d78. All numbers [PLACEHOLDER]. |
| 🟡 | **Ashen Fields** | `pd163.jpg` | P3 |  | seamless tile, 512² suggested | Terrain profile. Colour #8a2e1c. All numbers [PLACEHOLDER]. |
| 🟡 | **Volcano** | `pd163.jpg` | P3 |  | seamless tile, 512² suggested | Terrain profile. Colour #551a10. All numbers [PLACEHOLDER]. |
| 🟡 | **City** | `pd141.jpg` | P3 |  | seamless tile, 512² suggested | Terrain profile. Colour #7d7d80. All numbers [PLACEHOLDER]. |
| 🟡 | **Derelict Fortress** | `pd143.jpg` | P3 |  | seamless tile, 512² suggested | Terrain profile. Colour #4f4f53. All numbers [PLACEHOLDER]. |
| 🟡 | **Desert** | `pd106.jpg` | P3 |  | seamless tile, 512² suggested | Terrain profile. Colour #dd9a4e. All numbers [PLACEHOLDER]. |
| 🟡 | **Wasteland** | `pd119.jpg` | P3 |  | seamless tile, 512² suggested | Terrain profile. Colour #9a682f. All numbers [PLACEHOLDER]. |
| 🟡 | **Mountains** | `pd196.jpg` | P3 |  | seamless tile, 512² suggested | Terrain profile. Colour #736d66. All numbers [PLACEHOLDER]. |
| ❌ | **Ice** | — | P2 |  | seamless tile, 512² suggested | No texture — flat colour. |
| 🟡 | **Wall** | `wall-placeholder.png` | P2 |  | seamless tile, 512² suggested | Worn by polygon outlines and blocking masses. GENERATED placeholder (tools/make-cellular-tiles.mjs): fieldstone courses of varied height with mortar joints. At scale 1 a stone is ~0.69 u |
| 🟡 | **Fence** | `fence-placeholder.png` | P2 |  | RGBA tile 750x96 | Z1 — ⭐ The FIRST directional tile: WRONG unless its path authors alignTexture true, which turns the tile along the path AND registers it across the path. Generated by tools/make-fence-tile.mjs, the fifth technique family. ⛔ The first cut was OPAQUE and read as a boardwalk (PO: not like a fence at all) - because registration did not exist yet, so nothing could sit at a known height across the ribbon, and A FENCE IS MOSTLY GAPS. It is now RGBA, alone among the ground tiles: a thin rail with posts standing proud of it and grass showing through. ⚑ The tile PIXEL HEIGHT is load-bearing - fence in the middle 48 of 96 rows, so width 0.40 reveals exactly the fence; safe to 0.80. Posts every 2.08 u. No baked shadow (the tile turns with its path). Author one path per straight leg. |
| 🟡 | **Road** | `road-placeholder.png` | P0 |  | seamless tile 750² | Every road in the game. GENERATED placeholder (tools/make-cellular-tiles.mjs, the cellular family's third tile): packed brown earth with two warm grades of pebble pressed into it and hairline dried-mud cracks, all of it DELIBERATELY QUIET. ⛔ It USED TO BORROW pd106, the DESERT tile, so every lane was golden sandstone - that was the whole brief. ⛑ Three faults worth not repeating, all of them only visible once the tile REPEATS: too few slow bed waves paint a diagonal corduroy stripe; a neutral-grey pebble reads BLUE against warm brown; and mud cracks as a ridged field make closed loops that read as worm trails until they are thin and faint. ⛔ NO CART RUTS - a rut is directional and would need alignTexture, which wants one path per straight leg, and all three Road paths are multi-point meanders. Ruts are a second tile. ⭐ It ships at a SIXTH of its first pass' detail (PO: reads a little messy) - a ground tile is looked THROUGH, not at, and every mark repeats nine times across a screen, so one that looks slightly empty alone is the one that is right in the world. Real art wanted. |
| 🟡 | **Water** | `water-placeholder.png` | P1 |  | seamless tile, 512² suggested | Rivers and ponds. Placeholder PNG. Drift is authored; the tile is not. |
| 🟡 | **Bog** | `bog-placeholder.png` | P2 |  | seamless tile, 512² suggested | Swamp water. Placeholder PNG. First area-effect consumer when that ships. |
| 🟡 | **Lava** | `lava-placeholder.png` | P3 |  | seamless tile, 512² suggested | Placeholder PNG. No zone authors it yet. |

## Atmosphere — 11

| | Name | Current | Pri | # | Size | Where / notes |
| --- | --- | --- | --- | ---: | --- | --- |
| — | **Cave Air** | — | P0 |  | seamless tile, 512² suggested | Darkness 1.0 — full dark. The tunnel and underworld. |
| — | **Gloom** | — | P2 |  | seamless tile, 512² suggested | Darkness 0.55. The dark-forest banks. |
| — | **Canopy** | — | P0 |  | seamless tile, 512² suggested | Zone 2 forest gloom — darkness 0.22, colour only. The Woodland mood depends on this number being judged. |
| — | **Storm Sky** | — | P2 |  | seamless tile, 512² suggested | Darkness 0.28, colour only — no art file, only a number to judge. [PLACEHOLDER]. |
| 🟡 | **Fog** | `fog-placeholder.png` | P0 |  | seamless tile, 512² suggested | Haze 0.5 on a placeholder tile. Drifting suspended matter, nothing erases it but a clearing. |
| 🟡 | **Miasma** | `miasma-placeholder.png` | P2 |  | seamless tile, 512² suggested | Haze 0.45. Placeholder tile. [PLACEHOLDER] numbers. |
| 🟡 | **Rain** | `rain-placeholder.png` | P2 |  | seamless tile, 512² suggested | Haze 0.42. Placeholder tile. [PLACEHOLDER] numbers. |
| 🟡 | **Snow** | `snow-placeholder.png` | P2 |  | seamless tile, 512² suggested | Haze 0.38. Placeholder tile. [PLACEHOLDER] numbers. |
| 🟡 | **Ash Fall** | `ash-placeholder.png` | P2 |  | seamless tile, 512² suggested | Haze 0.4. Placeholder tile. [PLACEHOLDER] numbers. |
| 🟡 | **Sandstorm** | `sand-storm-placeholder.png` | P2 |  | seamless tile, 512² suggested | Haze 0.5. Placeholder tile. [PLACEHOLDER] numbers. |
| 🟡 | **Fairy Dust** | `fairy-placeholder.png` | P2 |  | seamless tile, 512² suggested | Haze 0.75. Placeholder tile. [PLACEHOLDER] numbers. |

# Constraint

## Constraint — 6

| | Name | Current | Pri | # | Size | Where / notes |
| --- | --- | --- | --- | ---: | --- | --- |
| — | **Land colour** | — | P3 |  |  | Flat #006030. The canvas every asset sits on — changing it re-judges everything. |
| — | **Deep water colour** | — | P3 |  |  | Flat #1C57B5, beyond the map edge. |
| — | **Shallow water colour** | — | P3 |  |  | Flat #287aff, the world-edge band. |
| — | **Dark areas** | — | P3 |  |  | 35 circles (tunnel + caves). Alpha mask with soft light holes. The hardest constraint on this page — test tunnel art against it. |
| — | **Campfire sites** | — | P3 |  |  | 5 bindable fires, one the starting spawn. The only fixed landmarks players navigate by. |
| — | **World bounds** | — | P3 |  |  | 144 × 72 m = 17280 × 8640 px. One screen is 20 m wide. |

# Animation

## Animation — 8

| | Name | Current | Pri | # | Size | Where / notes |
| --- | --- | --- | --- | ---: | --- | --- |
| ⛔ | **Campfire flicker** | — | P1 |  |  | The most important friendly object in the game and it is a still image. Players navigate by these. |
| ✅ | **Water surface drift** | — | P2 |  |  | SHIPPED as a texture scroll on the Water profile ([PLACEHOLDER] {0.4, 0.15} u/s) — not a sprite animation. Judge the numbers, do not draw frames. |
| ✅ | **Haze drift** | — | P2 |  |  | SHIPPED as atmosphere scroll. Same: a number to judge, not frames to draw. |
| ⛔ | **Wanderer walk cycle** | — | P2 |  |  | The only NPC in the game that walks. Worth a walking pose even if it cannot animate yet. |
| ⛔ | **Mob idle breathe** | — | P3 |  |  | Would make a static portrait feel alive. Lowest-risk first animation if the engine gains support. |
| ⛔ | **Bear rage tell** | — | P2 |  |  | Bear rages below half HP with NO visual tell — a gameplay gap, not polish. |
| ⛔ | **Death dissolve** | — | P3 |  |  | Death is a real beat in a game with a sacrifice loop; today a sprite just disappears. |
| ⚙️ | **Aura ring pulse** | — | P1 |  |  | Code-drawn in AuraTickIndicator.ts. Auras are the ONLY way anything interacts, so this is the combat language. |

# Audio

## Music — 7

| | Name | Current | Pri | # | Size | Where / notes |
| --- | --- | --- | --- | ---: | --- | --- |
| 🟡 | **Main theme** | `derpy-berryhunter.mp3` | P1 |  |  | The only music track in the game, autoplaying at boot, and it is INHERITED BERRYHUNTER BRANDING. Replacing it is identity work, not polish. |
| ❌ | **Zone 1 ambient bed** | — | P1 |  |  | Farmland day. Idyllic, unhurried — the tone the whole zone is built to sell. |
| ❌ | **Zone 2 ambient bed** | — | P1 |  |  | Deep forest. Close, damp, few people. Must work under the Canopy darkness. |
| ❌ | **Combat stinger** | — | P2 |  |  | Entering/leaving combat. No combat music exists. |
| ❌ | **Boss theme** | — | P2 |  |  | The Orc Warlord — the only boss and the v1 completion beat. |
| ❌ | **Ascension theme** | — | P1 |  |  | The 10 s channel that ends a character. The most important moment in the progression loop and it is silent. |
| ❌ | **Cave/underworld bed** | — | P2 |  |  | The tunnel and underworld. Pairs with Cave Air darkness 1.0. |

## SFX — 13

| | Name | Current | Pri | # | Size | Where / notes |
| --- | --- | --- | --- | ---: | --- | --- |
| ✅ | **Footsteps — road** | `750798__…road ×3` | P3 |  |  | Three variants exist and are wired. |
| ❌ | **Footsteps — grass** | — | P1 |  |  | Zone 1 is entirely grass and the player sounds like they are on a road. |
| ❌ | **Footsteps — forest floor** | — | P1 |  |  | Zone 2. Surface-aware footsteps need the region profile to be readable at the player position — Regions.resolve already answers that. |
| ❌ | **Footsteps — mud/water** | — | P2 |  |  | River shallows, bog, camp mud. |
| ❌ | **Campfire crackle loop** | — | P1 |  |  | Spatial loop at every campfire. The navigation landmark should be audible before it is visible. |
| ❌ | **River loop** | — | P2 |  |  | Spatial loop along Water paths. SpatialAudio.ts already exists. |
| ❌ | **Aura hum / tick** | — | P1 |  |  | The aura is the whole combat system and it is silent. Pairs with the tick indicator. |
| ❌ | **Level up** | — | P1 |  |  | No sound on the single most rewarding event in the loop. |
| ❌ | **Quest accept / complete** | — | P2 |  |  | Quest flow is entirely silent. |
| ✅ | **Player hurt** | `413175__… ×5` | P3 |  |  | Five inherited variants, wired. |
| ✅ | **Player swing** | `541994__… ×6` | P3 |  |  | Six inherited variants, wired. |
| ❌ | **Mob death — per family** | — | P2 |  |  | One generic death today. Wolf/bandit/kobold/spider families should differ. |
| ❌ | **UI click / panel** | — | P3 |  |  | The Inked Panel UI pass shipped C1–C8 with no audio at all. |

---

## Columns

| Column | What it is |
| --- | --- |
| `id` | Stable key. Never reuse or renumber — the Sheet is matched back on this. |
| `kind` | Art · Animation · Audio · Constraint. The top-level filter. |
| `category` | Mob, NPC, Prop, Terrain profile, Atmosphere, Music, SFX, … |
| `subcategory` | The grouping inside a category (e.g. *Animal — canine*). |
| `name` | What the thing is called in the game. |
| `zone` | Where it appears, when that is the point. |
| `current_file` | What renders it today, if anything. |
| `state` | See the state table above. |
| `priority` | See the priority table above. |
| `placements` | How many sit in the live world. The honest measure of how often a player looks at it. |
| `size_px` | On-screen pixels at zoom 1. ⚠️ `Graphics.ts` stores *half* these. |
| `format` | SVG · PNG · MP3. Painted work ships as PNG (see `pipeline.md` §3). |
| `target_path` | Where the delivered file lands in the repo. |
| `constraints` | What the art must survive — see `README.md` for each one in full. |
| `owner` | **For the artist to fill.** |
| `status` | **For the artist to fill** — todo / wip / review / done. |
| `notes` | Identity and intent: what it *is*, not what it looks like. |
