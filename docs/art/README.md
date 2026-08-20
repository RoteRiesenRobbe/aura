# Art assets — inventory & worklist

Everything the game draws, as a tickable list. **Tick a row by changing `☐` to `☑`.**

Counts, sizes and wiring were generated 2026-08-15 from the shipped data and client
code: `api/mobs/`, `api/props/`, `api/zones/`, `client-data/Graphics.ts`,
`features/game-objects/`, `features/ground-textures/`. Identity, placement and tone
come from `gdd.md` §10, `content-mobs.md`, `content-npcs.md`, `content-lore.md`, the
two zone docs, and the portrait checklist in `manual-content-authoring.md` §4.

**Totals: 58 live mobs · 29 environment · 21 other = 108 tickable rows.** Legacy
Berryhunter content is excluded from the lists and parked in an appendix at the
bottom — don't draw it.

> ⭐ **New 2026-08-20: the medallion layer set has its own delivery contract,
> `medallion-asset-spec.md`** (512×512 shared canvas, per-family rings and rims,
> universal overlays, the greyscale disc, and the pilot that locks the ring
> fractions). It is designed to be drawable NOW, before any implementation;
> start there if you are working on medallions. Design rationale:
> `../plan-entity-medallions.md`.

---

## ⭐ The Portrait Rule — governs every creature

The project's binding art direction (GDD §10 + `manual-content-authoring.md` §4).
It's easy to get wrong because it contradicts what "top-down game" implies:

> **The *world* is top-down. The *entities* are not.**
> Players, NPCs and mobs render as **portrait icons** — a bust looking *at the
> viewer* — not as creatures seen from above.

Every creature/humanoid asset must tick all of these:

- **Circle silhouette** — reads as a round icon: face-in-circle, or a bust filling
  a circular footprint.
- **Front-facing** — looks *at* the viewer, never down from above.
- **No directionality** — no pointing pose, no top-down body axis.
- **Never rotated at runtime.** `Mob.setRotation` and `Character.setRotation` are
  deliberate no-ops that discard the wire heading and hold a fixed downward facing —
  the local player included. Don't design art that relies on rotation.

**Inanimate props and hazards are exempt** — pools, campfires, barricades, trees,
rocks, buildings.

Reference files: `wolf.svg`, `wildboar.svg`, `bear.svg` (the same three the
manual's §4 names).

## Art direction & tone (GDD §10)

- **No pixel art.** **Fully top-down world** — not 2.5D, not isometric.
- **Low-poly**, icons for abilities, portraits for players/NPCs.
- **References:** Hotline Miami, Gods Trigger, Monaco, Rimworld, Gothic 1+2.
- **Tone — the Gothic register:** gritty, grounded, unglamorous. Dirty and
  matter-of-fact, not high-fantasy pathos. NPCs are workers, guards and scoundrels;
  nobody proclaims destiny. Signs are practical or worn, never ornate. Environmental
  storytelling favours the shabby and specific — a collapsed fence, a poacher's camp,
  a fresh grave — over the mythic. Holds at every stage, including late content.
- **Why it matters more than usual:** there is **no quest log and no map markers**.
  The world communicates through NPC speech, clue anchors, and *what places look
  like*. Environmental readability is load-bearing here.

## Scale

The world is in **meters**; the client draws at **120 px per meter**.

- One screen = **20 × 12 m** = **2400 × 1440 px**. About five trees fit across it.
- The whole world is 144 × 72 m. Player = 60 px, Wolf 76–92 px, House 480 px,
  world boss 168 px.
- **All `px` figures in the tables below are real on-screen pixels at zoom 1.**
  ⚠️ The numbers in `Graphics.ts` are *half* these — the renderer doubles them.
- **Mostly SVG, and that is changing.** The medallion spike shipped the first
  raster art (`farmer.png`, `npcBorder.png`, both 256×256); painted work ships as
  PNG from here on, because an SVG export of a painting only ever wrapped an
  embedded raster anyway. See `pipeline.md` §3.
  Non-square drawings get squashed unless the code corrects for it (only `House` does).
- **Combat mobs roll a random size per instance** inside their range, so two wolves
  side by side are deliberately different sizes. Design for the range.
- **NPCs and props size from their body radius in the JSON**, not from a config
  number — which is why every talking NPC is exactly 84 px.

## Rendering constraints new art must survive

- **The darkness overlay** — 35 dark zones. Spiders, kobolds, the poison pool and
  the rockfall live under an alpha mask with soft light holes. Test against the
  overlay, not on white.
- **The damage flash** — every sprite gets flooded with `#BF153A` on hit. Art
  already sitting near that red loses its hit feedback.
- **Tier rings** — silver on elites, gold on the boss, drawn *over* the sprite.
  Don't build those colours into an outline. (⚑ Scheduled for replacement by the
  medallion rim layer, `medallion-asset-spec.md` §4.3; the constraint stands
  until that ships.)
- **Rotation — almost nothing rotates.** Creatures never do. Trees, rocks and
  buildings all sit at rotation 0, so each is only ever seen at one angle (a rock's
  shadow can safely be baked in). Only the **ground decals** (authored rotation +
  flip) and the **tree ground spot** (random) rotate.
- **The land colour is `#006030`**, a dark green. Everything sits on it.

## Where the value is concentrated

The world is not evenly populated. One tree, one rock and one wolf are most of what
a player ever looks at.

| Asset | Count | Share |
| --- | --- | --- |
| Tree | 573 | 74 % of all props |
| Sand ground decal | 372 | 69 % of all terrain |
| Boulder + Rock (one SVG) | 168 | 22 % of all props |
| Wolf | 109 | 22 % of all mob spawns |
| Boar | 58 | 12 % |
| DireWolf | 43 | 9 % |
| House | 12 | the entire village |

## Legend

`⚠ shared` = renders using another entity's art; needs its own to exist as a
distinct thing. `⭐` = unusually high stakes, see the note. **#** = placements in
the live world (`player` = summoned, `enc.` = encounter-spawned).

---

# 1 · Mobs, NPCs & creatures — 58

## Animal — canine

| ✓ | Name | Current art | px | Tier · cL | # | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | **Wolf** | `wolf.svg` | 76–92 | normal · 2 | 109 | ⭐ Most-placed mob in the game. Lean forest wolf hunting prey *and* players. Sets the baseline read for "enemy". |
| ☐ | **DireWolf** | `direWolf.svg` | 96–112 | normal · 6 | 43 | Heavier dark-forest wolf. Same bite; the step-up is pure stats. |
| ☐ | **EliteWolf** | `eliteWolf.svg` | 112–128 | elite · 5 | 9 | The "something big" the forest sign warns about. Gets a silver ring. |
| ☐ | **AlphaWolf** | `alphaWolf.svg` | 116–136 | normal · 10 | 16 | Apex of the line. Fast chaser near the village. |

*Four wolves at four sizes — they must read as one species stepping up, not four dogs.*

## Animal — ursine

| ✓ | Name | Current art | px | Tier · cL | # | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | **Bear** | `bear.svg` | 140–164 | normal · 4 | 16 | Slow heavy tank that rages below half HP — no visual tell for that yet. |
| ☐ | **DireBear** | `direBear.svg` | 156–180 | normal · 7 | 8 | Largest non-boss wildlife in the game. |

## Animal — prey

| ✓ | Name | Current art | px | Tier · cL | # | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | **Boar** | `wildboar.svg` | 92–112 | normal · 2 | 58 | Passive until hit, then gores. Must *not* look hostile — that's the point. |
| ☐ | **Stag** | `stag.svg` | 84–100 | normal · 1 | 35 | Bolts on any damage, drops nothing. Carries the peaceful-world tone. |

## Animal — spiders

| ✓ | Name | Current art | px | Tier · cL | # | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | **Spider** | `spider.svg` | 76–92 | normal · 4 | 17 | Tunnel spider, lifesteal bite. Staged in daylight at the west mouth first. |
| ☐ | **VenomSpider** | `venomSpider.svg` | 84–100 | normal · 4 | 6 | Deep-dark poison. Must differ from Spider *in near-darkness*, 8 px apart. |
| ☐ | **GiantSpider** | `giantSpider.svg` | 116–136 | normal · 9 | 5 | Fastest normal mob in the game (0.95). Should look fast. |

## Small Fantasy — kobolds

| ✓ | Name | Current art | px | Tier · cL | # | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | **Kobold** | `kobold.svg` | 60–72 | normal · 3 | 20 | Weak swarm melee, flees at 25 %. Reads as a crowd — silhouette over detail. |
| ☐ | **KoboldRanged** | `koboldRanged.svg` | 60–72 | normal · 3 | 6 | Back-line volley. Same size as melee, so the drawing carries the difference. |

## Humanoid — bandits

| ✓ | Name | Current art | px | Tier · cL | # | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | **Bandit** | `bandit.svg` | 72–84 | normal · 5 | 21 | The baseline human enemy. Blades + bleed. Never flees. |
| ☐ | **BanditRanged** | `banditRanged.svg` | 72–84 | normal · 5 | 4 | Crossbow volley from behind the line. |
| ☐ | **BanditHealer** | `banditHealer.svg` | 72–84 | normal · 5 | 3 | ⭐ Never attacks; out-heals a solo player. The encounter assumes you can spot it in a crowd instantly. Highest readability need on the list. |
| ☐ | **BanditPyromancer** | `banditPyromancer.svg` | 92–104 | normal · 6 | 3 | Fire mage hanging back behind the melee. |
| ☐ | **RallyDrummer** | `rallyDrummer.svg` | 88–100 | normal · 6 | 1 | ⭐ Shields allies, never itself. Second kill-priority — same crowd problem. |
| ☐ | **EliteBandit** | `eliteBandit.svg` | 100–116 | elite · 7 | 1 | Camp leader, crits. Silver ring. |
| ☐ | **Marauder** | `marauder.svg` | 88–104 | normal · 12 | 10 | Veteran outlaw past the camp — with no elite frame to lean on. |

## Humanoid — orcs

| ✓ | Name | Current art | px | Tier · cL | # | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | **OrcGrunt** | `orcGrunt.svg` | 84–96 | normal · 20 | 3 | Reinforcement wave add at the boss. |
| ☐ | **Orc** | `orc.svg` | 104–120 | elite · 20 | 12 | ⭐ Must read hostile *while standing next to friendly soldiers*. Faction contrast is the design job. |
| ☐ | **OrcWarlord** | `orcWarlord.svg` | 156–168 | **boss** · 23 | enc. | ⭐ The world boss and the v1 completion beat. Only boss in the game. Gold ring. |
| ☐ | **WarbannerTotem** | `warbannerTotem.svg` | 100–108 | normal · 20 | enc. | Two banners make the boss invulnerable. Must read "break me" across an arena. |

## Humanoid — human army

| ✓ | Name | Current art | px | Tier · cL | # | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | **ArmySoldier** | `armySoldier.svg` | 72–84 | normal · 18 | 18 | ⭐ The only friendly combatant in the world. Currently the same size as a Bandit — the friend/foe read is entirely on the art. |

## Elemental

| ✓ | Name | Current art | px | Tier · cL | # | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | **FireElemental** | `fireElemental.svg` | 104–124 | normal · 18 | 4 | A living flame. Advances, doesn't chase. |
| ☐ | **GreaterFireElemental** | `greaterFireElemental.svg` | 144–168 | elite · 20 | 1 | A walking furnace. The size gap *is* the tier signal — keep them obviously the same creature. |

## Fantasy

| ✓ | Name | Current art | px | Tier · cL | # | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | **Troll** | `troll.svg` | 128–144 | elite · 11 | 6 | Solitary bruiser at the map outskirts. Nothing else in the world looks like it should. |

## Harvest-mob

| ✓ | Name | Current art | px | Tier · cL | # | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | **Turnip** | `turnip.svg` | 40–52 | normal · 1 | 6 | Smallest sprite in the game. Immune to everything but Harvest. A plant you pull, not a creature you kill. |

## Obstacles & hazards *(exempt from the Portrait Rule)*

| ✓ | Name | Current art | px | Kind | # | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | **Bramble** | `bramble.svg` | 116–132 | destructible | 4 | Thornwall sealing a forest shortcut. Must read *breakable*, unlike a tree. |
| ☐ | **Rockfall** | `rockfall.svg` | 116–132 | destructible | 2 | Pickaxe-only wall sealing the venom-spider nest. Also needs to read in the dark. |
| ☐ | **PoisonPool** | `poisonPool.svg` | 120–140 | hazard | 15 | Unkillable floor hazard. Ground-plane read: "don't step here". |
| ☐ | **SpikeBarricade** | `spikeBarricade.svg` | 120–132 | hazard | 9 | Unkillable hazard shaping the approach to the boss. |

## Fixtures & player summons

| ✓ | Name | Current art | px | Kind | # | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | **Campfire** | `campfire.svg` | 120 | fixture | 5 | ⭐ The most important friendly object in the game — bind point, respawn point, heal, fast-travel node. Players navigate by these. |
| ☐ | **Camp** | ⚠ `campfire.svg` *shared* | 60 | summon | player | Your own temporary fire. **Size is currently the only cue it's temporary** — own art is a gameplay fix, not polish. |
| ☐ | **Totem** | `totem.svg` | 100 | summon | player | Stationary aura carrier. |
| ☐ | **FireTotem** | `fireTotem.svg` | 100 | summon | player | Identical size to Totem — they're siblings, differ by drawing only. |
| ☐ | **Companion** | `companion.svg` | 80 | summon | player | Design intent: reuses the **Dog** look. |
| ☐ | **SoldierCompanion** | `soldierCompanion.svg` | 68–76 | summon | player | The Call for Aid squad. |
| ☐ | **ShieldbearerCompanion** | `shieldbearerCompanion.svg` | 76–84 | summon | player | The Hold the Line tank. |
| ☐ | **MedicCompanion** | `medicCompanion.svg` | 64–72 | summon | player | The Field Medics healer. |

*All four companions must read as **yours** at a glance, in a fight full of enemies the same size.*

## NPCs — talkers *(all draw at exactly 84 px)*

| ✓ | Name | Current art | Where | Role |
| --- | --- | --- | --- | --- |
| ☐ | **Farmer** | `farmer.svg` | Z1 farm field | ⭐ The first NPC a player ever meets. Teaches Harvest; gives the first two quests. |
| ☐ | **Hermit** | `hermit.svg` | Z1 village | The quest hub. Teaches First Aid, Heal, Calm, Charm Beast. |
| ☐ | **TownCrier** | `townCrier.svg` | Z1 village centre | The village-arrival anchor. Teaches Recall. |
| ☐ | **Dog** | `dogNpc.svg` | Z1 forest clearing | Says "Woof." Teaches Summon Companion. Only non-human talker. |
| ☐ | **Miner** | `miner.svg` | Z1 tunnel west mouth | Teaches Pickaxe — the key handed out just before its lock. |
| ☐ | **Wanderer** | `wanderer.svg` | Z1–2 roads | ⭐ The only NPC in the game that **walks**. Worth a walking pose. |
| ☐ | **LamplessTraveller** | `traveller.svg` | Z1 tunnel road | Trades his lamp for kobold kills. The turn-in is the **only source of the Lantern aura in the world**. |
| ☐ | **Lamplighter** | ⚠ `hermit.svg` *shared* | Z1 deep NW forest | The forest hermit. Teaches Torch — carry your own light. |
| ☐ | **Shaman** | ⚠ `hermit.svg` *shared* | Z2 approach | Teaches Summon Totem, at his own fire. |
| ☐ | **Emberkeeper** | ⚠ `hermit.svg` *shared* | Z2 north | The fire ladder in one NPC: Torch → Ignite → Immolate. |
| ☐ | **VillageHealer** | `villageHealer.svg` | Z2 village campfire | Teaches Revive — the group-support capstone. |
| ☐ | **CityGuard** | `cityGuard.svg` | Z2 City Gates | Teaches Strong. Gates shut while the front burns; Zone 3 teaser. |
| ☐ | **FrontCaptain** | `frontCaptain.svg` | Z2 front staging | Teaches Vanguard @L20. The last giver before the world boss — should look like the end of the road. |

⚠️ **Three NPCs wear the Hermit's face.** A player meets the same man in four
different regions.

## NPCs — monuments & signs *(all 84 px)*

| ✓ | Name | Current art | Where | Role |
| --- | --- | --- | --- | --- |
| ☐ | **ForestSign** | `signpost.svg` | Z1 dark-forest edge | "DANGER! STAY AWAY!" Points at the Elite Wolf — deliberately the only warning. |
| ☐ | **AscensionStone** | ⚠ `signpost.svg` *shared* | Z1 village | ⭐ The meta-progression altar, where a max-level character is spent. **The game's most significant object currently looks like a road sign.** Owes a site, not just a prop. |
| ☐ | **MemorialStone** | ⚠ `signpost.svg` *shared* | Z1 village | Names of everyone ascended. Stands *beside* the stone — so the village has two identical signposts side by side. |
| ☐ | **FrontAscensionStone** | ⚠ `signpost.svg` *shared* | Z2 front | The second site (level 25). Same kind of monument, war-front setting. |

---

# 2 · Environment — 30

## Props

| ✓ | Name | Current art | Drawn px | Body | # | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | **Tree** | `roundTree.svg` | 492 | r 1.0 m | 573 | ⭐ **Highest-value asset in the project.** Every forest, farm edge, city street and tunnel approach. 2–4 variants would change the world's look more than anything else. Fixed rotation. |
| ☐ | **Tree ground spot** | `treeSpot.svg` | 344 | — | 573 | The dark decal under every tree — what makes it feel planted. Randomly rotated. Re-cut it if the tree silhouette changes. |
| ☐ | **Boulder** | ⚠ `stone.svg` *shared* | 456 | r 1.5 m | 116 | Large blocking rock. Shadow baked in, never rotated. |
| ☐ | **Rock** | ⚠ `stone.svg` *shared* | 192 | r 0.5 m | 52 | **Same SVG as Boulder, just shrunk.** Two real silhouettes = cheapest environment win after trees. |
| ☐ | **Mineral ground spot** | `stoneSpot.svg` | ~0.7× | — | 168 | The decal under every rock and boulder. |
| ☐ | **House** | `house.svg` | 480 × 360 | 4 × 3 m | 12 | ⭐ The only building in the game — the whole village is 12 copies. **Aspect is load-bearing:** anything not 4:3 visibly squashes. |
| ☐ | **GateWall** | `gateWall.svg` | 288 × 288 | 2.4 m sq | 24 | Rampart block for the city gate flanks and blocked roads. **Must tile seamlessly** — 24 sit shoulder to shoulder. |

## Ground decals

Authored per placement with size in meters, rotation and horizontal/vertical flip —
**these must work at every angle.** `px` is the placement size range.

| ✓ | Name | Current art | px | # | Notes |
| --- | --- | --- | --- | --- | --- |
| ☐ | **Sand** | `sand1.svg` | 150–300 | 372 | ⭐ Every road in the game is this one blob, scaled and flipped. Second-most-repeated image after the tree. |
| ☐ | **Land** | `land1.svg` | 150–300 | 74 | The same shape recoloured to the land colour, to paint land back over edges. Follows Sand. |
| ☐ | **Stone Patch** | `stonePatch.svg` | 130–300 | 17 | Grey ground patch. |
| ☐ | **Dark Stone Patch** | `darkStonePatch.svg` | 130–300 | 0 | Authored, never placed. |
| ☐ | **Dark Green Grass 1** | `darkGrass1.svg` | 180–300 | 7 | Dark grass tuft cluster. |
| ☐ | **Dark Green Grass 2** | `darkGrass2.svg` | 180–300 | 12 | Second dark tuft shape. |
| ☐ | **Green Grass 1** | `grass1.svg` | 180–300 | 6 | Light grass tuft cluster. |
| ☐ | **Green Grass 2** | `grass2.svg` | 180–300 | 4 | Second light tuft shape. |
| ☐ | **Pebble** | `pebble.svg` | 130–200 | 1 | Small stone scatter. |
| ☐ | **Dark Pebble** | `darkPebble.svg` | 130–200 | 9 | Darker scatter. |
| ☐ | **Rubble** | `rubble.svg` | 50–100 | 0 | Debris scatter. Never placed. |
| ☐ | **Dark Rubble** | `darkRubble.svg` | 50–100 | 15 | Darker debris. |
| ☐ | **Puddle** | `puddle.svg` | 60–140 | 0 | Never placed. |
| ☐ | **Dark Puddle** | `darkPuddle.svg` | 60–140 | 0 | Never placed. |
| ☐ | **Flowers** | `flowers.svg` | 70–100 | 15 | White-outlined cluster — currently the *only* colour accent in the terrain set. |
| ☐ | **Leaves** | `leaves.svg` | 50–100 | 5 | Fallen leaf scatter. |

*The four grass decals total 29 placements against 372 sand — the world is currently
far more road than meadow.*

## Terrain base, lighting & structure *(code, not files — listed as constraints)*

| ✓ | Name | Source | Notes |
| --- | --- | --- | --- |
| ☐ | **Land colour** | `Theme.ts` `LAND_COLOR` | Flat `#006030`. The canvas every asset sits on — changing it re-judges everything. |
| ☐ | **Deep water colour** | `Graphics.ts` | Flat `#1C57B5`, beyond the map edge. |
| ☐ | **Shallow water colour** | `Graphics.ts` | Flat `#287aff`, the world-edge band. |
| ☐ | **Dark areas** | `DarknessOverlay.ts` | 35 circles (tunnel + caves). Alpha mask with soft light holes. **The hardest constraint on this page** — test tunnel art against it. |
| ☐ | **Campfire sites** | `world.json` | 5 bindable fires, one the starting spawn. The only fixed landmarks players navigate by. |
| ☐ | **World bounds** | `world.json` | 144 × 72 m = 17280 × 8640 px. One screen is 20 m wide. |

---

# 3 · Player, VFX & everything else — 21

## Player

| ✓ | Name | Current art | px | Notes |
| --- | --- | --- | --- | --- |
| ☐ | **Player character** | `characters/player.svg` | 60 | ⭐ One drawing is **every player on the server** — there's no avatar system yet. A portrait; never rotates. Smallest important sprite in the game. |
| ☐ | **Player hands** | *code* | tiny | Two circles drawn procedurally, skin `#f2a586` + black outline. If the avatar's shape changes, these move or go. |
| ☐ | **Corpse / gravestone** | `corpse.svg` | 100 | The marker at a death spot. Placeholder — death is a real beat in a game with a sacrifice loop. |

## In-world VFX — all code-drawn today, **no art files exist**

| ✓ | Name | Source | Notes |
| --- | --- | --- | --- |
| ☐ | **Aura rings** | `AuraRings.ts` | ⭐ **The single biggest VFX opportunity.** Auras are the only way anything interacts, so this *is* the combat language. Currently plain circles. Colours (all placeholder): damage `#e04a3c` · dot `#9a4ec9` · heal `#4ec96a` · shield `#e0b83c` · slow `#4a9ae0` · light `#f0dfa0` · resist `#5fbfb0`. |
| ☐ | **Aura tick indicator** | `AuraTickIndicator.ts` | The pulse when an aura fires — the beat that says damage landed. |
| ☐ | **Effect pips** | `EffectPips.ts` | 4 px dots over the head, one per applied effect. Shares the aura colour language on purpose. Known gap: a stun is indistinguishable from a slow on the wire. |
| ☐ | **Overhead health bar** | `OverheadHealthBar.ts` | Health + shield under every mob. Health `#aa3b3b`, shield `#7dc3ff`. |
| ☐ | **Tier frame ring** | `Mobs.ts` | Silver `#c8ccd4` elite / gold `#e8c04a` boss. Normal gets none — a frame always means "above baseline". ⚑ Do not draw: replaced by the medallion rim layer (`medallion-asset-spec.md` §4.3); the normal-stays-bare rule survives the replacement. |
| ☐ | **Nameplate & level** | `Mobs.ts` | Difficulty-coloured text. Sits on top of every mob and eats the space under it. |
| ☐ | **Interact badge** | `InteractBadge.ts` | The "you can talk to this" marker over an NPC in range. |
| ☐ | **Damage flash** | `StatusEffect.ts` | Colour flood `#BF153A` over the whole sprite on hit, plus a gold burst ring for cooldowns. Applies to *everything*. |
| ☐ | **Campfire dwell ring** | `Mobs.ts` | Fills while you rest at a fire — the recovery timer made visible. |
| ☐ | **Ascension channel** | `AscensionChannelFx.ts` | ⭐ The 10 s channel that ends a character. The most important moment in the progression loop — and currently **only the channelling player can see it**. |
| ☐ | **Darkness overlay** | `DarknessOverlay.ts` | The mask itself. A constraint on art rather than an asset. |

## Screen & map

| ✓ | Name | Current art | Notes |
| --- | --- | --- | --- |
| ☐ | **Damage vignette** | `overlays/damage.svg` | Red screen edge on taking damage. The only full-screen art file in the project. |
| ☐ | **Map markers** | *code* | Minimap/world map dots. Own player `#00008B`, others white, tree green circle, stone grey hex, campfire orange ring `#E37313`. Known bug: your own 3.5 px dot vanishes under the 9 px campfire marker at your bound fire. |

## Missing-art marker

| ✓ | Name | Current art | Notes |
| --- | --- | --- | --- |
| ☐ | **NpcPlaceholder** | `npcPlaceholder.svg` | The loud "unconfigured NPC" marker. **Keep it ugly on purpose.** Not used by any shipped mob. |

## UI — deferred, out of scope for now

| ✓ | Name | Current art | Notes |
| --- | --- | --- | --- |
| ☐ | **Ability icons** | **none — 59 skills** | ⭐ 59 authored abilities and **not one icon**. The ability bar, spellbook and every tooltip render text. Listed for sizing: after the mob roster this is the largest art job in the project, and the one players stare at constantly. |
| ☐ | **Logo** | `logo.svg` | The Aura wordmark. Still carries the inherited branding lineage. |
| ☐ | **Settings icon** | `settings-icon.svg` | Gear. |
| ☐ | **Day cycle icon** | `cycle-icon.svg` | Day/night indicator — the cycle is switched off at config level, so this is dark code. |

---

# Appendix · Legacy — deleted, nothing to draw

The inherited Berryhunter roster is **gone as of zone-editor C3** (`e9a0894c`,
2026-08-16), which retired all 10 legacy mobs (Dodo · SaberToothCat · Mammoth ·
AngryMammoth · Rabbit · Healer · Brazier · ProvingBoss · ProvingGuard ·
ProvingAdd), the `proving-grounds` zone, and their 13 asset files.

This inventory was generated the day before, so read it with three corrections:

1. **The two mis-wired filenames no longer exist.** `boar.svg` (which drew the
   Dodo) and `skeleton.svg` (the Mammoth) were deleted with the roster. The
   cleanup this appendix asked for happened.
2. **`boar.svg` is a free name now.** The live Boar still draws `wildboar.svg`;
   reclaiming the good name is a one-line `Graphics.ts` change plus a file
   rename, and is worth doing whenever the Boar's art gets redrawn.
3. **The upper size reference moved.** `AngryMammoth` was the 440 px outlier;
   with it gone the live ceiling is what §Scale already states — world boss
   168 px, House 480 px, and no mob above 180 px.
