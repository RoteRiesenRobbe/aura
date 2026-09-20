# Skill inventory

Every skill the game loads, one row each: the fields it authors and how a
player gets hold of it. The rows cover both content folders, `api/skills/`
(the player spellbook) and `api/skills/mobs/` (the abilities mobs carry), and
everything on this page is derived from the content tree, never typed by hand.

**Regenerate it with `npm run inventory` in `tools/content-editor/`.** It
rewrites this whole file from `api/` in a second or so.

**It is fine for this file to lag behind `api/`.** It is a snapshot for
reading, not a pin: nothing breaks when a skill changes and the doc does not,
and nobody owes a regeneration as part of a content edit. Run the command
whenever you want a current picture. The content tree, the loader and its tests
are the truth about what the game does; this page never is.

Generated 2026-09-19 from api/ at 6dbd3b92.

Every number here is **[PLACEHOLDER]** by project rule. Per-ability design
intent lives in `content-auras.md` / `content-passives.md` /
`content-cooldowns.md`; this page owns the values and the sources.

**Notation.** `14 +0.2222/L` = base 14, plus 0.2222 per skill level (a slope of
0 is not shown). Ticks carry their seconds at 30 ticks/s.
Fractions of a pool read as percentages. Flags are named when set
(`enemies`, `allies`, `follows`). Effect keys appear in the order the
authoring vocabulary defines them, so re-saving a skill never reshuffles a row.

**Source kinds.** `MS L<n>` = milestone unlock · `Drop` = kill unlock with
its chance · `NPC` = taught on approach (`@L<n>` = the character level it
gates on) · `Quest` = a guaranteed reward on a quest turn-in row · `Recipe` =
combination result · `Ascension` = the bloodline catalog (`api/ascension/`),
with its gate conditions where it has any. **Cheat only** = no source in the
world; the `SKILL` cheat is the only way to hold it. Two cheat-only kinds are
marked because the code already knows them: **test rig** (`TEST_RIG_SKILLS`,
kitchen-sink rigs that must never gain a source) and **prototype** (a skill
using an effect type in `HIDDEN_EFFECT_TYPES`, parked pending a verdict).

**114 skills = 76 player (29 auras, 11 passives, 36 cooldowns) + 38 mob-only.**

## Auras (29)

| ID | Name | MaxLv | Icon | Cost | Timing | Effects | Faction scope | Sources | Description |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Damage | 10 | lorc/broadsword |  |  | damage_aura: radius 1 u, tick interval 40t (1.33 s), selector nearest, max targets 1, enemies, damage HP 14 +0.2222/L, damage tags physical, variance 15% |  | MS L1 |  |
| 2 | Heal | 10 | delapouite/healing | 10% -0.8889%/L of max |  | heal_aura: radius 1.5 u +0.0444/L, tick interval 80t (2.67 s), selector lowest_health, max targets 1, heal HP 12 +2.6667/L |  | NPC: Hermit @L3 |  |
| 3 | Wild | 5 | lorc/broadsword | 0.82% +0.195%/L of max |  | damage_aura: radius 1.4 u +0.05/L, tick interval 40t (1.33 s), selector nearest, max targets 1, enemies, damage HP 10 +2.4/L, damage tags physical |  | **Cheat only** (`SKILL Wild`) |  |
| 4 | Slow | 5 | lorc/snail | 1.8% +0.225%/L of max |  | slow_aura: radius 1.5 u, tick interval 30t (1 s), enemies, slow fraction 10% +10%/L |  | Drop: BanditRanged 0.2 · Quest: wolves-on-the-road via Shaman |  |
| 5 | Immolate | 10 | carl-olsen/flame | 0.78% +0.195%/L of max |  | dot_aura: radius 1 u, tick interval 20t (0.67 s), selector nearest, max targets 1, enemies, damage HP 10.5 +2.6111/L, damage tags fire, dot ticks 3, dot tick interval 60t (2 s) |  | NPC: Emberkeeper @L12 |  |
| 6 | Lantern | 5 | lorc/lantern-flame |  |  | light_aura: radius 4 u +0.5/L |  | Quest: the-lost-lamp via LamplessTraveller · Ascension via AscensionStone (quest_at_stage the-lost-lamp completed) |  |
| 7 | Reaper | 10 | lorc/bleeding-wound | 1.26% +0.1633%/L of max |  | damage_aura: radius 1.5 u, tick interval 40t (1.33 s), selector nearest, max targets 1, enemies, damage HP 12 +1.5556/L, damage tags bleed, execute below fraction 35%, execute bonus factor ×2, berserker max bonus factor ×1 |  | Drop: AlphaWolf 0.35 |  |
| 29 | Rejuvenation | 5 | delapouite/healing | 3.06% +0.765%/L of max |  | hot_aura: radius 2.5 u +0.1/L, tick interval 60t (2 s), heal HP 4 +1/L, hot ticks 6, hot tick interval 60t (2 s) |  | Drop: OrcWarlord 0.25 |  |
| 30 | Paladin | 5 | delapouite/knight-banner | 0.75% +0.1625%/L of max · 0.2% +0.0992%/L of max |  | damage_aura: radius 1 u, tick interval 40t (1.33 s), selector nearest, max targets 1, enemies, damage HP 10 +2.5/L, damage tags physical · heal_aura: radius 1 u, tick interval 40t (1.33 s), selector lowest_health, max targets 1, heal HP 2.6667 +1.3333/L |  | Recipe: Damage 5 + Heal 5 |  |
| 40 | FireWard | 5 | lorc/bordered-shield | 1.8% +0.225%/L of max |  | resist_aura: radius 1.5 u, tick interval 30t (1 s), allies, resist tags fire, resist factor ×0.6 -0.05/L, self |  | Drop: FireElemental 0.35 |  |
| 41 | Harvest | 5 | lorc/scythe |  |  | damage_aura: radius 1 u, tick interval 40t (1.33 s), selector nearest, max targets 1, enemies, damage HP 14 +3.2/L, gate key harvest, variance 15% |  | NPC: Farmer @L1 |  |
| 44 | Berserker | 5 | lorc/broadsword | 0.82% +0.195%/L of max |  | damage_aura: radius 1 u, tick interval 40t (1.33 s), selector nearest, max targets 1, enemies, damage HP 11 +2.6/L, damage tags physical, variance 15%, berserker max bonus factor ×1 |  | Drop: DireBear 0.15 |  |
| 45 | LongRangeStrike "Long-Range Strike" | 10 | lorc/broadsword | 1.16% +0.1867%/L of max |  | damage_aura: radius 2.6 u +0.0444/L, tick interval 40t (1.33 s), selector nearest, max targets 1, enemies, damage HP 9 +1.4444/L, damage tags physical, variance 15% |  | Drop: DireWolf 0.2 |  |
| 48 | Pickaxe | 5 | lorc/mining |  |  | damage_aura: radius 1 u, tick interval 40t (1.33 s), selector nearest, max targets 1, enemies, damage HP 14 +3.2/L, gate key smash, variance 15% |  | NPC: Miner @L4 |  |
| 50 | Vanguard | 10 | delapouite/knight-banner | 1.72% +0.1744%/L of max · 0.3267% +0.0726%/L of max · 0.1467% +0.0158%/L of max |  | damage_aura: radius 1.2 u, tick interval 40t (1.33 s), selector nearest, max targets 2, enemies, damage HP 14 +1.4222/L, damage tags physical, variance 15% · heal_aura: radius 1.2 u, tick interval 40t (1.33 s), selector lowest_health, max targets 1, heal HP 4 +0.8889/L · shield_aura: radius 1.2 u, tick interval 40t (1.33 s), allies, shield HP 1.7778 +0.1975/L, self |  | NPC: FrontCaptain @L15 |  |
| 52 | Spearhead | 10 | lorc/broadsword | 2.72% +0.2722%/L of max |  | damage_aura: radius 1.3 u, tick interval 40t (1.33 s), selector nearest, max targets 3, enemies, damage HP 16 +1.6/L, damage tags physical, variance 15% |  | Recipe: Vanguard 5 + Damage 5 |  |
| 53 | Lifewarden | 10 | delapouite/healing | 1.85% +0.4122%/L of max |  | heal_aura: radius 1.4 u, tick interval 120t (4 s), selector lowest_health, max targets 2, heal HP 14 +3.1111/L |  | Recipe: Vanguard 5 + Heal 5 |  |
| 55 | Warbanner | 10 | delapouite/knight-banner | 1.84% +0.1856%/L of max · 0.3533% +0.0789%/L of max · 0.6533% +0.1215%/L of max |  | damage_aura: radius 1.2 u, tick interval 40t (1.33 s), selector nearest, max targets 2, enemies, damage HP 15 +1.5111/L, damage tags physical, variance 15% · heal_aura: radius 1.2 u, tick interval 40t (1.33 s), selector lowest_health, max targets 1, heal HP 4.3333 +0.963/L · shield_aura: radius 1.2 u, tick interval 40t (1.33 s), allies, shield HP 8 +1.4815/L, self · slow_aura: radius 1.2 u, tick interval 40t (1.33 s), enemies, slow fraction 10% +1.33%/L |  | Recipe: Vanguard 5 + Spearhead 5 + CallForAid 3 |  |
| 58 | Wildfire | 5 | carl-olsen/flame | 1.38% +0.645%/L of max |  | dot_aura: radius 1.4 u, tick interval 20t (0.67 s), selector nearest, max targets 2, enemies, damage HP 10.5 +6.875/L, damage tags fire, dot ticks 4, dot tick interval 60t (2 s) · resist_aura: radius 1.4 u, tick interval 20t (0.67 s), resist tags fire, resist factor ×0.6 -0.05/L, self · light_aura: radius 4 u +1/L |  | Recipe: Ignite 3 + Immolate 5 |  |
| 59 | Suppression | 5 | lorc/snowflake-1 | 0.84% +0.18%/L of max |  | damage_aura: radius 2.6 u +0.1/L, tick interval 40t (1.33 s), selector nearest, max targets 1, enemies, damage HP 6.5 +3.375/L, damage tags frost, variance 15% · slow_aura: radius 2.6 u +0.1/L, tick interval 40t (1.33 s), enemies, slow fraction 7% +7%/L |  | Recipe: Slow 5 + LongRangeStrike 5 |  |
| 66 | FireVulnerability | 5 | carl-olsen/flame | 1.8% +0.225%/L of max |  | resist_aura: radius 1.5 u, tick interval 30t (1 s), enemies, resist tags fire, resist factor ×1.2 +0.05/L |  | **Cheat only** (`SKILL FireVulnerability`) |  |
| 70 | Aegis | 3 | lorc/bordered-shield | 8% +1%/L of max |  | resist_aura: radius 1.5 u, tick interval 90t (3 s), selector nearest, max targets 1 +1/L, allies, resist tags *, resist factor ×0, buffLifetimeMatchesInterval |  | **Cheat only** (`SKILL Aegis`) |  |
| 71 | FlyYouFools "Fly, You Fools!" | 5 | lorc/wingfoot | 3% +0.4%/L of max |  | speed_aura: radius 2.5 u, tick interval 30t (1 s), allies, speed factor ×1.3 +0.05/L |  | **Cheat only** (`SKILL FlyYouFools`) |  |
| 73 | OmniAura | 5 | lorc/star-swirl | 0.2% +0.05%/L of max · 0.2% of max |  | damage_aura: radius 2.5 u, tick interval 40t (1.33 s), selector nearest, max targets 3 +1/L, enemies, damage HP 3 +0.25/L, damage tags fire, variance 15%, structures, structure damage fraction 50%, execute below fraction 20%, execute bonus factor ×1.5, berserker max bonus factor ×0.5, crit chance 10% +2%/L, crit factor ×2, lifesteal fraction 10% · dot_aura: radius 2.5 u, tick interval 40t (1.33 s), selector nearest, max targets 2, enemies, damage HP 1 +0.25/L, damage tags poison, variance 10%, dot ticks 3, dot tick interval 30t (1 s) · slow_aura: radius 2.5 u, tick interval 40t (1.33 s), enemies, slow fraction 30% +2%/L · heal_aura: radius 2.5 u, tick interval 40t (1.33 s), selector lowest_health, max targets 1, heal HP 5 +0.5/L, variance 10% · hot_aura: radius 2.5 u, tick interval 40t (1.33 s), selector nearest, max targets 2, heal HP 3 +0.3/L, hot ticks 3, hot tick interval 30t (1 s) · shield_aura: radius 2.5 u, tick interval 40t (1.33 s), allies, shield HP 10 +1/L, self · resist_aura: radius 2.5 u, tick interval 40t (1.33 s), allies, resist tags *, resist factor ×0.5, self · speed_aura: radius 2.5 u, tick interval 40t (1.33 s), allies, speed factor ×1.3 +0.05/L · light_aura: radius 3 u +0.25/L |  | **Cheat only** (`SKILL OmniAura`) · **test rig** |  |
| 76 | LightningStrike "Lightning Strike" | 10 | lorc/star-swirl | 1.16% +0.1867%/L of max |  | damage_aura: radius 2.6 u +0.0444/L, tick interval 40t (1.33 s), selector nearest, max targets 3, enemies, damage HP 4 +0.65/L, damage tags nature, variance 15% |  | **Cheat only** (`SKILL LightningStrike`) |  |
| 141 | Frostbite | 10 | lorc/snowflake-1 |  |  | damage_aura: radius 1 u, tick interval 40t (1.33 s), selector nearest, max targets 1, enemies, damage HP 14 +0.2222/L, damage tags frost, variance 15% |  | Ascension via AscensionStone |  |
| 142 | Blight | 10 | lorc/vine-leaf | 0.78% +0.195%/L of max |  | dot_aura: radius 1 u, tick interval 20t (0.67 s), selector nearest, max targets 1, enemies, damage HP 10.5 +2.6111/L, damage tags nature, dot ticks 3, dot tick interval 60t (2 s) |  | Ascension via AscensionStone (kills_this_life DireWolf 20) |  |
| 145 | Venomward | 5 | lorc/bordered-shield | 1.8% +0.225%/L of max |  | resist_aura: radius 1.5 u, tick interval 30t (1 s), allies, resist tags poison, resist factor ×0.6 -0.05/L, self |  | Ascension via AscensionStone |  |
| 146 | Hoarfrost | 5 | lorc/snowflake-1 | 0.84% +0.18%/L of max |  | damage_aura: radius 1 u, tick interval 40t (1.33 s), selector nearest, max targets 1, enemies, damage HP 6.5 +3.375/L, damage tags frost, variance 15% · slow_aura: radius 1 u, tick interval 40t (1.33 s), enemies, slow fraction 10% +10%/L |  | Recipe: Frostbite 5 + FrostShield 5 |  |

## Passives (11)

| ID | Name | MaxLv | Icon | Cost | Timing | Effects | Faction scope | Sources | Description |
|---|---|---|---|---|---|---|---|---|---|
| 11 | Tough | 5 | lorc/bordered-shield |  |  | stat_multiplier: stat damageReduction, stat bonus 10% +5%/L |  | Drop: Orc 0.2 · Drop: Troll 0.4 |  |
| 42 | Hardy | 5 | sbed/health-increase |  |  | stat_multiplier: stat maxHealth, stat bonus 8% +4%/L |  | Drop: EliteWolf 0.2 |  |
| 43 | ThickHide | 5 | lorc/bordered-shield |  |  | resist_passive: resist tags physical, resist factor ×0.85 -0.025/L |  | Drop: DireBear 0.2 |  |
| 46 | Torch | 5 | lorc/lantern-flame |  |  | light_aura: radius 2.5 u +0.25/L |  | NPC: Emberkeeper @L1 · NPC: Lamplighter |  |
| 47 | Antivenom | 5 | lorc/bordered-shield |  |  | resist_passive: resist tags poison, resist factor ×0.7 -0.05/L |  | Drop: VenomSpider 0.25 |  |
| 60 | KeenEye | 5 | lorc/muscle-up |  |  | stat_multiplier: stat critChance, stat bonus 2% +2%/L |  | Drop: AlphaWolf 0.12 · Drop: DireWolf 0.1 · Drop: EliteWolf 0.2 · Ascension via AscensionStone · Ascension via FrontAscensionStone |  |
| 65 | Discipline | 5 | lorc/meditation |  |  | stat_multiplier: stat costReduction, stat bonus 6% +3%/L |  | MS L5 |  |
| 67 | FireShield | 5 | lorc/shield-reflect |  |  | retaliate_damage: damage HP 3 +1/L, damage tags fire |  | **Cheat only** (`SKILL FireShield`) | Being hit is enough - it fires even when the hit is fully absorbed. |
| 74 | OmniPassive | 5 | lorc/star-swirl |  |  | stat_multiplier: stat movementSpeed, stat bonus 15% +2%/L · stat_multiplier: stat maxHealth, stat bonus 20% +2%/L · stat_multiplier: stat damageReduction, stat bonus 15% +2%/L · stat_multiplier: stat critChance, stat bonus 10% +2%/L · stat_multiplier: stat damageDealt, stat bonus 25% +2%/L · stat_multiplier: stat costReduction, stat bonus 25% +2%/L · resist_passive: resist tags fire/poison, resist factor ×0.7 -0.05/L · retaliate_slow: slow fraction 30% +5%/L, slow duration ticks 150t (5 s) · retaliate_damage: damage HP 5 +1/L, damage tags frost · light_aura: radius 2 u +0.25/L |  | **Cheat only** (`SKILL OmniPassive`) · **test rig** | Cheat-only test rig. Its retaliates fire on any hit, even one that is fully absorbed. |
| 136 | Strong | 5 | lorc/muscle-up |  |  | stat_multiplier: stat damageDealt, stat bonus 4% +2%/L |  | NPC: CityGuard @L3 |  |
| 139 | FrostShield | 5 | lorc/shield-reflect |  |  | retaliate_slow: slow fraction 10% +5%/L, slow duration ticks 150t (5 s) |  | Drop: Troll 0.2 · Ascension via AscensionStone (bloodline_ascensions 3) · Ascension via FrontAscensionStone (bloodline_ascensions 3) | Being hit is enough - it fires even when the hit is fully absorbed. |

## Cooldowns (36)

| ID | Name | MaxLv | Icon | Cost | Timing | Effects | Faction scope | Sources | Description |
|---|---|---|---|---|---|---|---|---|---|
| 8 | Bloodthirst | 5 | lorc/life-tap | 2% +0.25%/L of max | CD 900t (30 s) -60/L | lifesteal_burst: lifesteal fraction 30% +5%/L, lifesteal duration ticks 180t (6 s) |  | **Cheat only** (`SKILL Bloodthirst`) | Works with whichever aura you have on. |
| 10 | Swift | 5 | lorc/wingfoot | 1.5% +0.375%/L of max | CD 600t (20 s) -30/L | speed_burst: speed factor ×1.5 +0.05/L, speed duration ticks 150t (5 s) +15/L, self |  | Drop: AlphaWolf 0.15 · Drop: DireWolf 0.12 · Drop: EliteWolf 0.25 · Drop: Wolf 0.04 |  |
| 20 | NovaBurst | 5 | carl-olsen/flame | 1.99% +0.2225%/L of max · 1.66% +0.2%/L of max | CD 300t (10 s) -10/L | instant_damage: radius 2 u +0.05/L, enemies, damage HP 18 +2/L, damage tags fire · instant_dot: radius 2 u +0.05/L, enemies, damage HP 5 +0.6/L, damage tags fire, dot ticks 3, dot tick interval 30t (1 s) |  | Drop: BanditPyromancer 0.3 |  |
| 21 | FirstAid | 5 | delapouite/healing | 0% of max | CD 900t (30 s) | self_heal: heal fraction of max 20% +2.5%/L |  | NPC: Hermit @L2 · NPC: VillageHealer @L2 |  |
| 22 | Ignite | 5 | carl-olsen/flame | 1.84% +0.2325%/L of max | CD 300t (10 s) -10/L | instant_dot: radius 1.5 u +0.05/L, enemies, damage HP 6.3 +0.8/L, damage tags fire, dot ticks 3, dot tick interval 30t (1 s) |  | NPC: Emberkeeper @L7 |  |
| 23 | SummonTotem | 5 | lorc/totem-head | 2% +0.375%/L of max | CD 450t (15 s) | spawn: spawn mob Totem, TTL ticks 300t (10 s) +30/L, power per owner level 5% |  | NPC: Shaman @L5 |  |
| 24 | SummonCompanion | 5 | lorc/totem-head | 5% +0.75%/L of max | CD 2400t (80 s) | spawn: spawn mob Companion, TTL ticks 1800t (60 s) +150/L, power per owner level 5%, follows |  | NPC: Dog |  |
| 25 | Taunt | 5 | lorc/shouting | 1% +0.25%/L of max | CD 300t (10 s) -10/L | taunt: radius 2 u, enemies, threat margin 50 |  | Drop: RallyDrummer 1 · Quest: wolves-on-the-road via CityGuard |  |
| 26 | Fade | 5 | delapouite/invisible | 1% +0.25%/L of max | CD 300t (10 s) -10/L | detaunt: radius 2 u, enemies |  | Drop: EliteBandit 0.35 |  |
| 27 | Barrier | 5 | lorc/energy-shield | 1.95% +0.2425%/L of max | CD 300t (10 s) -10/L | instant_shield: radius 1.5 u +0.05/L, allies, shield HP 20 +2.5/L, shield duration ticks 300t (10 s), self |  | Recipe: Hardy 3 + Tough 3 |  |
| 28 | Recall | 1 | lorc/return-arrow | 5% of max | CD 9000t (300 s) · cast 300t (10 s) · interruptible | recall |  | **Cheat only** (`SKILL Recall`) |  |
| 31 | Recover | 5 | delapouite/healing | 2% +0.25%/L of max | CD 1200t (40 s) -50/L | instant_hot: radius 2 u, heal fraction of max 3% +0.5%/L, hot ticks 9, hot tick interval 60t (2 s), self |  | Drop: DireBear 0.25 · NPC: Shaman @L4 |  |
| 32 | Revive | 1 | lorc/ankh | 10% of max | CD 600t (20 s) · cast 150t (5 s) · interruptible | revive: radius 3 u, revive health fraction 30% |  | NPC: VillageHealer @L8 |  |
| 33 | Dash | 5 | lorc/wingfoot | 1% +0.25%/L of max | CD 300t (10 s) | dash: dash distance 2.5 u +0.25/L |  | Drop: EliteWolf 0.2 |  |
| 34 | Haste | 1 | lorc/stopwatch | 3% of max | CD 300t (10 s) | tick_rate: tick rate factor ×0.5, tick rate duration ticks 90t (3 s) |  | MS L7 |  |
| 49 | DamageBurst "Damage-Burst" | 5 | lorc/broadsword | 2.14% +0.2425%/L of max | CD 300t (10 s) -10/L | instant_damage: radius 1.5 u +0.05/L, enemies, damage HP 22 +2.5/L, damage tags physical/bleed |  | Drop: EliteBandit 0.5 |  |
| 51 | CallForAid "Call for Aid" | 5 | lorc/totem-head | 2% +0.3%/L of max | CD 2400t (80 s) | spawn: spawn mob SoldierCompanion, TTL ticks 1800t (60 s) +150/L, power per owner level 5%, follows · spawn: spawn mob SoldierCompanion, TTL ticks 1800t (60 s) +150/L, power per owner level 5%, follows · spawn: spawn mob SoldierCompanion, TTL ticks 1800t (60 s) +150/L, power per owner level 5%, follows |  | Drop: OrcWarlord 1 |  |
| 54 | Shockwave | 5 | lorc/broadsword | 4.87% +0.5525%/L of max | CD 240t (8 s) -10/L | instant_damage: radius 2 u +0.05/L, enemies, damage HP 44 +5/L, damage tags physical/bleed |  | Recipe: Vanguard 5 + DamageBurst 3 |  |
| 56 | HoldTheLine "Hold the Line" | 5 | lorc/totem-head | 2% +0.3%/L of max | CD 2400t (80 s) | detaunt: radius 2 u, enemies · spawn: spawn mob ShieldbearerCompanion, TTL ticks 1800t (60 s) +150/L, power per owner level 5%, follows · spawn: spawn mob ShieldbearerCompanion, TTL ticks 1800t (60 s) +150/L, power per owner level 5%, follows · spawn: spawn mob ShieldbearerCompanion, TTL ticks 1800t (60 s) +150/L, power per owner level 5%, follows |  | Recipe: CallForAid 3 + Taunt 3 |  |
| 57 | FieldMedics | 5 | lorc/totem-head | 2% +0.3%/L of max | CD 2400t (80 s) | spawn: spawn mob SoldierCompanion, TTL ticks 1800t (60 s) +150/L, power per owner level 5%, follows · spawn: spawn mob SoldierCompanion, TTL ticks 1800t (60 s) +150/L, power per owner level 5%, follows · spawn: spawn mob MedicCompanion, TTL ticks 1800t (60 s) +150/L, power per owner level 5%, follows |  | Recipe: CallForAid 3 + Heal 5 |  |
| 61 | FireTotem | 5 | lorc/totem-head | 2% +0.375%/L of max | CD 450t (15 s) | spawn: spawn mob FireTotem, TTL ticks 300t (10 s) +30/L, power per owner level 5% |  | Drop: GreaterFireElemental 0.5 |  |
| 62 | Calm | 5 | delapouite/peace-dove | 1.5% +0.375%/L of max | CD 600t (20 s) | calm: radius 4 u, enemies, calm ticks 300t (10 s) +30/L | wildlife_prey/wildlife_predator | NPC: Hermit @L10 | Any damage breaks it, including your own aura. |
| 63 | CharmBeast | 5 | lorc/charm | 5% +0.75%/L of max | CD 3600t (120 s) | charm: radius 4 u, selector nearest, max targets 1, enemies, charm ticks 1800t (60 s) +150/L | wildlife_prey/wildlife_predator | NPC: Hermit @L10 | It keeps its own level, and turns on you when the charm ends. |
| 64 | BindElemental | 5 | lorc/charm | 5% +0.75%/L of max | CD 4200t (140 s) | charm: radius 3.5 u, selector nearest, max targets 1, enemies, charm ticks 1200t (40 s) +100/L | elemental | NPC: Emberkeeper @L15 | It keeps its own level, and turns on you when the charm ends. |
| 68 | Retribution "Retribution" | 5 | lorc/shield-reflect | 2% +0.25%/L of max | CD 900t (30 s) -60/L | retaliate_burst: reflect fraction 20% +5%/L, reflect duration ticks 300t (10 s), damage tags fire |  | **Cheat only** (`SKILL Retribution`) | The share is of the hit as thrown, before your own mitigation. |
| 69 | Sanctuary | 3 | lorc/bordered-shield | 4% +0.5%/L of max | CD 900t (30 s) | instant_resist: radius 1.5 u, selector nearest, max targets 1 +1/L, allies, resist tags *, resist factor ×0, resist duration ticks 150t (5 s) |  | **Cheat only** (`SKILL Sanctuary`) |  |
| 72 | Onward | 5 | lorc/wingfoot | 3% +0.4%/L of max | CD 900t (30 s) -60/L | speed_burst: radius 3 u, speed factor ×1.4 +0.05/L, speed duration ticks 150t (5 s) +15/L, allies |  | **Cheat only** (`SKILL Onward`) |  |
| 75 | OmniStrike | 5 | lorc/star-swirl | 1% +0.1%/L of max · 0.5% of max · 1% of max | CD 300t (10 s) -10/L · cast 30t (1 s) | instant_damage: radius 2.5 u +0.1/L, selector nearest, max targets 3 +1/L, enemies, damage HP 15 +2/L, damage tags fire, variance 15%, structures, structure damage fraction 50%, execute below fraction 25%, execute bonus factor ×1.5, berserker max bonus factor ×0.5, crit chance 15%, crit factor ×2, lifesteal fraction 20% · instant_dot: radius 2.5 u, enemies, damage HP 4 +0.5/L, damage tags poison, dot ticks 4, dot tick interval 30t (1 s) · stun: radius 2.5 u, selector nearest, max targets 1 +1/L, enemies, stun ticks 60t (2 s) +6/L · calm: radius 4 u, enemies, calm ticks 300t (10 s) +30/L · charm: radius 4 u, selector nearest, max targets 1, enemies, charm ticks 600t (20 s) +60/L · detaunt: radius 3 u, enemies · taunt: radius 3 u, enemies, threat margin 50 · self_heal: heal fraction of max 8% +1%/L, variance 10% · instant_hot: radius 2.5 u, allies, heal HP 3 +0.3/L, hot ticks 4, hot tick interval 30t (1 s), self · instant_shield: radius 2.5 u, allies, shield HP 15 +2/L, shield duration ticks 300t (10 s), self · instant_resist: radius 2.5 u, allies, resist tags *, resist factor ×0, resist duration ticks 90t (3 s), self · speed_burst: radius 2.5 u, speed factor ×1.5 +0.05/L, speed duration ticks 150t (5 s) +15/L, allies, self · lifesteal_burst: lifesteal fraction 30% +5%/L, lifesteal duration ticks 150t (5 s) · retaliate_burst: reflect fraction 25% +5%/L, reflect duration ticks 300t (10 s), damage tags fire · spawn: spawn mob Totem, TTL ticks 300t (10 s) +30/L, power per owner level 5% · dash: dash distance 2 u +0.25/L | aligned/bandit/elemental/human_army/kobold/orc/spider/townsfolk/troll/wildlife_predator/wildlife_prey | **Cheat only** (`SKILL OmniStrike`) · **test rig** | Cheat-only test rig. Its calm breaks on any damage, its stun does not, a charm keeps the mob's own level and ends by turning on you, its leech follows whatever aura is on, and its reflect shares the hit as thrown. |
| 140 | Paralyze | 5 | delapouite/knocked-out-stars | 3% +0.5%/L of max | CD 900t (30 s) | stun: radius 2.5 u, selector nearest, max targets 1, enemies, stun ticks 90t (3 s) +6/L |  | Drop: GiantSpider 0.2 | Damage does not break it, your own aura included. |
| 143 | RimeBurst "Rime-Burst" | 5 | lorc/snowflake-1 | 2.14% +0.2425%/L of max | CD 300t (10 s) -10/L | instant_damage: radius 1.5 u +0.05/L, enemies, damage HP 22 +2.5/L, damage tags frost |  | Ascension via AscensionStone · Ascension via FrontAscensionStone |  |
| 144 | Envenom | 5 | lorc/poison-bottle | 1.84% +0.2325%/L of max | CD 300t (10 s) -10/L | instant_dot: radius 1.5 u +0.05/L, enemies, damage HP 6.3 +0.8/L, damage tags poison, dot ticks 3, dot tick interval 30t (1 s) |  | Ascension via AscensionStone |  |
| 147 | OpenPortal | 1 | lorc/magic-portal | 10% of max | CD 1200t (40 s) · cast 75t (2.5 s) · interruptible | spawn: spawn mob PortalHome, TTL ticks 900t (30 s), requiresAnchor |  | **Cheat only** (`SKILL OpenPortal`) |  |
| 148 | PullThrough | 1 | lorc/magic-portal | 10% of max | CD 1200t (40 s) · cast 75t (2.5 s) · interruptible | spawn_at_anchor: spawn mob PortalSummon, TTL ticks 900t (30 s) |  | **Cheat only** (`SKILL PullThrough`) |  |
| 150 | ThrowMine | 1 | lorc/land-mine | 3.65% of max | CD 300t (10 s) | projectile: spawn mob ProjectileBomb, forward units 1 u, TTL ticks 900t (30 s), arm ticks 45t (1.5 s) |  | **Cheat only** (`SKILL ThrowMine`) · **prototype** |  |
| 151 | ThrowBomb | 1 | lorc/land-mine | 3.65% of max | CD 300t (10 s) | projectile: spawn mob ProjectileBomb, forward units 3 u, TTL ticks 46t (1.53 s), arm ticks 45t (1.5 s) |  | **Cheat only** (`SKILL ThrowBomb`) · **prototype** |  |
| 152 | SummonSpider | 5 | delapouite/knocked-out-stars | 5% +0.75%/L of max |  | spawn: spawn mob Spider, TTL ticks 1800t (60 s) +150/L, power per owner level 5%, follows |  | **Cheat only** (`SKILL SummonSpider`) |  |

## Mob-only skills (38)

Loaded from `api/skills/mobs/`. They share the id and name space with the
player skills but never reach a spellbook: a mob carries one through its
`skills[]` list. A row carried by **none** is either a summon's kit whose mob
is not placed yet, or dead content.

| ID | Name | MaxLv | Timing | Effects | Carried by |
|---|---|---|---|---|---|
| 101 | DodoAura | 5 |  | damage_aura: radius 0.6 u, tick interval 48t (1.6 s), selector nearest, max targets 1, enemies, damage HP 4 | none |
| 102 | SaberToothCatAura | 5 |  | damage_aura: radius 1 u, tick interval 20t (0.67 s), selector nearest, max targets 1, enemies, damage HP 8 | none |
| 103 | MammothAura | 5 |  | damage_aura: radius 1 u, tick interval 40t (1.33 s), selector nearest, max targets 1, enemies, damage HP 12 | none |
| 104 | AngryMammothAura | 5 |  | damage_aura: radius 3 u +0.25/L, tick interval 20t (0.67 s), selector nearest, max targets 1, enemies, damage HP 8 +2/L, damage tags fire, structures, structure damage fraction 67% | none |
| 105 | AngryMammothStomp | 1 | CD 450t (15 s) | instant_damage: radius 2.5 u, selector all, enemies, damage HP 20 | none |
| 106 | TotemAura | 3 |  | dot_aura: radius 1.5 u, tick interval 60t (2 s), selector nearest, max targets 1, enemies, damage HP 8 +2/L, damage tags fire, dot ticks 3, dot tick interval 60t (2 s) | Totem L1 |
| 107 | CompanionAura | 3 |  | damage_aura: radius 0.8 u, tick interval 40t (1.33 s), selector nearest, max targets 1, enemies, damage HP 10 +2/L | Companion L1 |
| 108 | HealerAura | 3 |  | heal_aura: radius 2 u, tick interval 60t (2 s), selector lowest_health, max targets 1, heal HP 12 +4/L | MedicCompanion L1 |
| 109 | CampfireAura | 1 |  | heal_aura: radius 1.5 u, tick interval 60t (2 s), max targets 0, heal fraction of max 12% · light_aura: radius 7 u | Campfire L1 |
| 110 | WolfBite | 5 |  | damage_aura: radius 1 u, tick interval 24t (0.8 s), selector nearest, max targets 1, enemies, damage HP 6 +1/L, variance 15% | AlphaWolf L1 · DireWolf L1 · Wolf L1 |
| 111 | BearSwipe | 5 |  | damage_aura: radius 1.1 u, tick interval 60t (2 s), selector nearest, max targets 1, enemies, damage HP 16 +2.5/L, variance 10%, berserker max bonus factor ×1 | Bear L1 · DireBear L1 |
| 112 | BoarGore | 5 |  | damage_aura: radius 0.9 u, tick interval 30t (1 s), selector nearest, max targets 1, enemies, damage HP 6 +1.5/L, damage tags physical/bleed, variance 15% | Boar L1 |
| 113 | StagKick | 5 |  | damage_aura: radius 0.8 u, tick interval 40t (1.33 s), selector nearest, max targets 1, enemies, damage HP 3 +0.5/L | Stag L1 |
| 114 | EliteWolfBite | 5 |  | damage_aura: radius 1.2 u, tick interval 50t (1.67 s), selector nearest, max targets 1, enemies, damage HP 14 +2/L, variance 15%, execute below fraction 35%, execute bonus factor ×1.5, lifesteal fraction 50% | EliteWolf L1 |
| 115 | KoboldStab | 5 |  | damage_aura: radius 0.8 u, tick interval 15t (0.5 s), selector nearest, max targets 1, enemies, damage HP 4 +0.8/L, variance 15% | Kobold L1 |
| 116 | KoboldVolley | 5 |  | damage_aura: radius 2.2 u, tick interval 60t (2 s), selector nearest, max targets 1, enemies, damage HP 7 +1.2/L, variance 15% | KoboldRanged L1 |
| 117 | SpiderBite | 5 |  | damage_aura: radius 1 u, tick interval 30t (1 s), selector nearest, max targets 1, enemies, damage HP 7 +1.2/L, variance 15%, lifesteal fraction 40% | Spider L1 |
| 118 | VenomSpit | 5 |  | dot_aura: radius 1 u, tick interval 50t (1.67 s), selector nearest, max targets 1, enemies, damage HP 5 +1/L, damage tags poison, variance 15%, dot ticks 4, dot tick interval 45t (1.5 s) | VenomSpider L1 |
| 119 | PoisonPoolAura | 5 |  | damage_aura: radius 1.1 u, tick interval 20t (0.67 s), selector all, enemies, damage HP 5 +1/L, damage tags poison, variance 15% | PoisonPool L1 |
| 120 | BanditBlades | 5 |  | damage_aura: radius 1 u, tick interval 25t (0.83 s), selector nearest, max targets 2, enemies, damage HP 11.25 +1.88/L, damage tags physical/bleed, variance 15% | Bandit L1 · Marauder L3 |
| 121 | BanditVolley | 5 |  | damage_aura: radius 2.5 u, tick interval 60t (2 s), selector nearest, max targets 1, enemies, damage HP 10 +1.62/L, variance 15% | BanditRanged L1 |
| 122 | BanditHeal | 5 |  | heal_aura: radius 1 u, tick interval 60t (2 s), selector lowest_health, max targets 1, heal HP 14 +4/L | BanditHealer L1 |
| 123 | EliteBanditSlash | 5 |  | damage_aura: radius 1.2 u, tick interval 40t (1.33 s), selector nearest, max targets 1, enemies, damage HP 17.5 +2.5/L, variance 15%, crit chance 25%, crit factor ×2 | EliteBandit L1 |
| 124 | RallyDrum | 5 |  | shield_aura: radius 4 u, tick interval 30t (1 s), allies, shield HP 15 +4/L | RallyDrummer L1 · ShieldbearerCompanion L1 |
| 125 | SoldierBlades | 5 |  | damage_aura: radius 1 u, tick interval 25t (0.83 s), selector nearest, max targets 2, enemies, damage HP 9 +1.5/L, variance 15% | ArmySoldier L1 · SoldierCompanion L1 |
| 126 | OrcCleave | 5 |  | damage_aura: radius 1.3 u, tick interval 35t (1.17 s), selector nearest, max targets 3, enemies, damage HP 16 +2.5/L, variance 15% | Orc L1 |
| 127 | SpikeBarricadeAura | 5 |  | damage_aura: radius 1 u, tick interval 20t (0.67 s), selector all, enemies, damage HP 6 +1/L, damage tags physical/bleed, variance 15% | SpikeBarricade L1 |
| 128 | WarlordCleave | 5 |  | damage_aura: radius 1.6 u, tick interval 90t (3 s), selector nearest, max targets 3, enemies, damage HP 50 +7.5/L, variance 15% · dot_aura: radius 1.6 u, tick interval 90t (3 s), selector nearest, max targets 1, enemies, damage HP 11 +2/L, damage tags physical/bleed, variance 15%, dot ticks 4, dot tick interval 45t (1.5 s) | OrcWarlord L1 |
| 129 | WarlordFrenzy | 1 | CD 900t (30 s) | tick_rate: tick rate factor ×0.5, tick rate duration ticks 300t (10 s) | OrcWarlord L1 |
| 130 | WarbannerShield | 5 |  | shield_aura: radius 4 u, tick interval 30t (1 s), allies, shield HP 20 +5/L | WarbannerTotem L1 |
| 131 | GruntSlash | 5 |  | damage_aura: radius 1 u, tick interval 30t (1 s), selector nearest, max targets 1, enemies, damage HP 10 +1.5/L, variance 15% | OrcGrunt L1 |
| 132 | TrollSmash | 5 |  | damage_aura: radius 1.3 u, tick interval 50t (1.67 s), selector nearest, max targets 1, enemies, damage HP 22 +3/L, variance 15% | Troll L1 |
| 133 | EmberAura | 5 |  | dot_aura: radius 3 u, tick interval 50t (1.67 s), selector nearest, max targets 1, enemies, damage HP 7.5 +1.88/L, damage tags fire, variance 15%, dot ticks 3, dot tick interval 40t (1.33 s) | BanditPyromancer L1 |
| 134 | FireElementalAura | 5 |  | dot_aura: radius 2 u, tick interval 60t (2 s), selector all, enemies, damage HP 7 +1.8/L, damage tags fire, variance 15%, dot ticks 3, dot tick interval 60t (2 s) · light_aura: radius 2.5 u | FireElemental L1 · GreaterFireElemental L1 |
| 135 | FireTotemAura | 3 |  | dot_aura: radius 2.5 u, tick interval 60t (2 s), selector all, enemies, damage HP 6 +2/L, damage tags fire, dot ticks 3, dot tick interval 60t (2 s) · light_aura: radius 3 u | FireTotem L1 |
| 137 | GiantVenomSpit | 5 |  | damage_aura: radius 1.6 u, tick interval 40t (1.33 s), selector nearest, max targets 1, enemies, damage HP 3.5 +0.7/L, damage tags poison, variance 15% · dot_aura: radius 1.6 u, tick interval 40t (1.33 s), selector nearest, max targets 1, enemies, damage HP 6 +1.2/L, damage tags poison, variance 15%, dot ticks 5, dot tick interval 45t (1.5 s) | GiantSpider L1 |
| 138 | CampAura | 1 |  | heal_aura: radius 0.75 u, tick interval 60t (2 s), max targets 0, heal fraction of max 12% · light_aura: radius 2 u | Camp L1 |
| 149 | BombBurst | 5 | CD 300t (10 s) -10/L | instant_damage: radius 2 u +0.05/L, selector all, enemies, damage HP 18 +2/L, damage tags fire · instant_dot: radius 2 u +0.05/L, selector all, enemies, damage HP 5 +0.6/L, damage tags fire, dot ticks 3, dot tick interval 30t (1 s) | ProjectileBomb L1 |

## Reachability

Counts are source ROWS across the 76 player skills, so a skill with two
teachers counts twice.

- **Milestone:** 3
- **Kill drop:** 28
- **NPC teaching:** 18
- **Quest reward:** 3
- **Recipe:** 11
- **Ascension:** 11

### Cheat only (19)

- **Unplaced (14)**, finished abilities with no source yet: Aegis, Bloodthirst, FireShield, FireVulnerability, FlyYouFools, LightningStrike, Onward, OpenPortal, PullThrough, Recall, Retribution, Sanctuary, SummonSpider, Wild
- **Test rigs (3)**, tooling that must never gain a source: OmniAura, OmniPassive, OmniStrike
- **Prototypes (2)**, parked with delete among the verdicts on offer: ThrowBomb, ThrowMine

### Recipes (11)

- **Paladin** = Damage 5 + Heal 5 (every ingredient has a source: yes)
- **Spearhead** = Vanguard 5 + Damage 5 (every ingredient has a source: yes)
- **Lifewarden** = Vanguard 5 + Heal 5 (every ingredient has a source: yes)
- **Shockwave** = Vanguard 5 + DamageBurst 3 (every ingredient has a source: yes)
- **Warbanner** = Vanguard 5 + Spearhead 5 + CallForAid 3 (every ingredient has a source: yes)
- **HoldTheLine** = CallForAid 3 + Taunt 3 (every ingredient has a source: yes)
- **FieldMedics** = CallForAid 3 + Heal 5 (every ingredient has a source: yes)
- **Wildfire** = Ignite 3 + Immolate 5 (every ingredient has a source: yes)
- **Suppression** = Slow 5 + LongRangeStrike 5 (every ingredient has a source: yes)
- **Barrier** = Hardy 3 + Tough 3 (every ingredient has a source: yes)
- **Hoarfrost** = Frostbite 5 + FrostShield 5 (every ingredient has a source: yes)

### NPC teachings (18 across 10 teachers)

- **CityGuard**: Strong @L3
- **Dog**: SummonCompanion
- **Emberkeeper**: BindElemental @L15 · Ignite @L7 · Immolate @L12 · Torch @L1
- **Farmer**: Harvest @L1
- **FrontCaptain**: Vanguard @L15
- **Hermit**: Calm @L10 · CharmBeast @L10 · FirstAid @L2 · Heal @L3
- **Lamplighter**: Torch
- **Miner**: Pickaxe @L4
- **Shaman**: Recover @L4 · SummonTotem @L5
- **VillageHealer**: FirstAid @L2 · Revive @L8

### Milestone unlocks (3)

| Level | Skill |
|---|---|
| L1 | Damage |
| L5 | Discipline |
| L7 | Haste |

### Quest rewards (3)

- **Lantern**: `the-lost-lamp`, on the turn-in row at LamplessTraveller
- **Slow**: `wolves-on-the-road`, on the turn-in row at Shaman
- **Taunt**: `wolves-on-the-road`, on the turn-in row at CityGuard

### Ascension catalogs (2)

- **AscensionStone**: Blight (kills_this_life DireWolf 20) · Envenom · FrostShield (bloodline_ascensions 3) · Frostbite · KeenEye · Lantern (quest_at_stage the-lost-lamp completed) · RimeBurst · Venomward
- **FrontAscensionStone**: FrostShield (bloodline_ascensions 3) · KeenEye · RimeBurst

### Quest XP (14 rows)

Not a skill source, but it falls out of the same interaction walk and it is the
other half of a turn-in row's payout.

- `alpha-wolves-at-the-village`: 1900 XP at VillageHealer
- `bandits-at-the-shrine`: 1250 XP at Emberkeeper
- `bears-at-the-walls`: 2300 XP at CityGuard
- `boars-in-the-field`: 180 XP at Farmer
- `dire-wolves-at-the-camp`: 930 XP at Shaman
- `dire-wolves-in-the-forest`: 370 XP at Lamplighter
- `kobolds-on-the-road`: 450 XP at Wanderer
- `spiders-in-the-diggings`: 930 XP at Miner
- `the-lost-lamp`: 700 XP at LamplessTraveller
- `thin-the-orc-line`: 4800 XP at FrontCaptain
- `turnip-chore`: 150 XP at Farmer
- `village-welcome`: 150 XP at Hermit
- `wolves-on-the-road`: 400 XP at CityGuard
- `wolves-on-the-road`: 400 XP at Shaman
