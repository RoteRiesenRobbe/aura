# Skill Inventory — generated from data (2026-07-29, quest sources added 2026-07-30, Q4 source moves swept in 2026-07-30)

**Every value in this table is [PLACEHOLDER]** per the project rule. Generated
from the actual data files on the `main` tree at 2026-07-29 (post Swift-as-a-
cooldown) — **not** hand-maintained design intent. The three catalogs
(`content-auras.md` / `content-passives.md` / `content-cooldowns.md`) hold the
design intent — *what an ability means and why it exists*. **This file is the
source of truth for unlock sources and numbers**; the catalogs point here rather
than repeating them. Regenerate after any content chunk.

> ### ⛑ MEASURED STALE 2026-08-10: read this before trusting a row
>
> A regeneration is **owed and not done**. Adding the ascension catalog's six
> skills (plan-ascension.md C3 step 3) meant checking this file against `api/`,
> and the check found the table predates the numbers-rewrite **cap pass**
> (D2/D11, 2026-07-31): **37 of the ~52 existing rows carry a MaxLv that no
> longer matches the JSON** (Damage reads 5 and is 10; Recover reads 1 and is 5;
> every `3` in the passive and cooldown sections is a `5`). The per-level slopes
> in the Values column drifted with them: Damage's `+3.2/L` is `+0.2222/L` in
> the file. ⚑ Two skills were also missing outright (**Bloodthirst**,
> **Discipline**); that half is FIXED 2026-08-17, see the roster-repair note
> below. The MaxLv and slope drift is not.
>
> **What WAS updated on 2026-08-10:** the six new rows below are correct against
> `api/` (marked ⭐), as are the counts, the legend's new **Ascension** source
> kind and the reachability summary. **Nothing else was touched**, because fixing MaxLv
> without re-deriving Values would have traded one wrong table for an
> inconsistent one. Treat every unmarked row's MaxLv and slopes as pre-2026-07-31.
> A full regeneration is unowned work, and it is bigger than the script at the
> top implies because the Source column is hand-researched.

> **⚑ The previous generation (2026-07-22) had drifted badly** — it was three
> player skills short, still called `Lantern` by its old name `Light`, and
> roughly half its drop chances and teacher gates no longer matched `api/`. If
> this file looks even slightly stale, regenerate rather than trust it; the
> script below takes seconds.

**How to regenerate (cheap):** run a script over `api/skills/*.json`
(id/name/category/maxLevel/cooldownTicks + each effect's key params), then
cross-reference sources from `api/mobs/*.json` — **both** `unlocks[]`
(`skillName`, `chance`) **and** `interaction.nodes[].options[].grants[]`
(`skill`, `requiredLevel`; ⚑ since C4 a `teach_skill` grant may sit on a quest
turn-in row beside an `advance_quest`, where it is a **quest reward** rather than
a teaching — same key, different meaning, and the gate is the quest rather than
`requiredLevel`) — plus `api/recipes/*.json` (`result`,
`ingredients[].skill`/`.level`) and `api/milestones/milestone-unlocks.json`.

> **⚑ NPC teachings moved.** They used to live in `zones/*.json` under
> `npcs[].teachings[]`; entity-model chunk 3a deleted that section and folded
> every NPC into an ordinary mob definition, so teachings are now an
> `interaction` tree **on the mob**. A regeneration script that still reads the
> zone finds zero teachers and silently reports every taught skill as
> unreachable.

```bash
python3 - <<'EOF'
import json, glob
for f in sorted(glob.glob('api/skills/*.json')):
    d = json.load(open(f))
    print(d['id'], d['name'], d['category'], d['maxLevel'],
          d.get('cooldownTicks',''),
          [{k:v for k,v in e.items() if k!='_comment'} for e in d['effects']])
EOF
```

Scope: the 68 **player** skills (`api/skills/*.json`). The 32 mob-only skills
in `api/skills/mobs/` are not listed (they're authoring details of their mobs).
68 + 32 = the **100** registry count in the boot log (was 50 + 36 = 86 at the
2026-07-29 generation).

> ⭐ **ROSTER REPAIRED 2026-08-17 (PO ruling), by re-deriving every count from
> `api/` rather than incrementing the old ones, which is what let them drift
> in the first place.** Four rows were wrong: **Wild** (id 3) and **Recall**
> (id 28) were listed but no longer exist as skills (Recall became one of the
> three baseline UTILITIES, `skills/utility.go`, which live outside the catalog
> by ruling and so are outside this table too), while **Bloodthirst** (id 8)
> and **Discipline** (id 65) existed and were missing. The two errors had been
> cancelling in the totals, which is why the counts looked plausible. ⚑ The
> missing Bloodthirst row was also hiding an unreachable skill: the
> reachability summary read THREE cheat-only skills when the true answer was
> four even before this chunk added two. **Every row now corresponds 1:1 to a
> file in `api/skills/`, and the per-category counts are that correspondence.**
> Row VALUES are untouched, so the MaxLv/slope staleness above still stands.

Scaling notation: `12 +6/L` = base 12, +6 per skill level. Ticks: 30 ticks =
1 s. Source key: **MS Ln** = milestone · **Drop** = mob kill unlock (chance) ·
**NPC** = taught (`@Ln` = required character level) · **Recipe** = combination
result · **Ascension** = the bloodline catalog, `api/ascension/`
(plan-ascension.md C3) · **NONE** = unobtainable without the `SKILL` cheat.

> **Players spawn with exactly the level-1 milestone in the spellbook:
> Damage** (conversation-journal Q4, 2026-07-30 — seeded silently at character
> creation, so a peasant can always fight; GDD §3's free-baseline ruling made
> concrete). Everything else still arrives through the discovery paths; the
> first *taught* ability is the Farmer's Harvest @L1. The TownCrier no longer
> teaches Damage.

> The legacy proving-grounds roster (and its five mob skills) was deleted at
> zone-editor C3, 2026-08-16; the *(legacy)* source annotations are gone with it.

## Active auras (27)

| ID | Name | MaxLv | Values | Source |
|---|---|---|---|---|
| 1 | Damage | 5 | dmg 14 +3.2/L @40t, r1.0, 1 tgt nearest, var ±15% | **MS L1** — seeded at character creation (Q4) |
| 2 | Heal | 5 | heal 12 +6/L @80t, r1.5 +.1/L, lowest_health 1 tgt, **self-cost 10 −2/L** (FINAL) | NPC Hermit @L3 |
| 4 | Slow | 5 | slow 10% +10%/L, r1.5 | Drop: BanditRanged .2 · **Quest: `wolves-on-the-road`, shaman leg** |
| 5 | Immolate | 5 | fire dot 10.5 +2.1/L (3×60t) @20t, r1.0 | NPC Emberkeeper @L12 |
| 6 | Lantern | 3 | light r4 +1/L | **Quest: `the-lost-lamp` — the ONLY source** (Q4/R3 deleted the .05 kobold drops; pinned by `TestContent_LanternIsQuestOnlyAndHasASource`) |
| 7 | Reaper | 3 | dmg 12 +3/L @40t r2.0; execute <35% ×2; lifesteal 50%; berserker ×2 at low HP | Drop: AlphaWolf .35 |
| 29 | Rejuvenation | 3 | HoT 4 +2/L (6×60t) @60t, r2.5 +.2/L | Drop: OrcWarlord .25 (boss-rare) |
| 30 | Paladin | 5 | dmg 10 +2.2/L @40t + heal 8 +4/L @120t (no self-cost), r1.0 | Recipe: Damage 5 + Heal 5 |
| 40 | FireWard | 3 | fire resist ×0.6 −0.1/L, allies+self, r1.5 | Drop: FireElemental .35 |
| 66 | FireVulnerability | 5 | ⭐ fire resist **×1.2 +0.05/L** (a CURSE: enemies take more), enemies only, r1.5 @30t | **Cheat only (`SKILL FireVulnerability`)** — no unlock source yet (plan-effect-types.md C1) |
| 70 | Aegis | 3 | ⭐ resist **`*` ×0** = IMMUNITY to all damage, nearest 1 +1/L allies (not self), r1.5 @90t; cost 0.08 +0.01/L **charged every cycle** (`buffLifetimeMatchesInterval`) | **Cheat only (`SKILL Aegis`)**: no unlock source yet (plan-effect-types.md C3) |
| 71 | FlyYouFools | 5 | ⭐ "Fly, You Fools!" — ally move speed **×1.3 +0.05/L**, ALL allies in radius (uncapped, caster never buffed), r2.5 @30t; cost 0.03 +0.004/L charged when it reaches someone new | **Cheat only (`SKILL FlyYouFools`)** — no unlock source yet (plan-effect-types.md C4) |
| 141 | Frostbite | 10 | ⭐ dmg 14 +0.22/L **frost** @40t, r1.0, 1 tgt nearest, var ±15%; **FREE** | **Ascension** (D1 parity: Damage id 1, verbatim but frost) |
| 142 | Blight | 10 | ⭐ **nature** dot 10.5 +2.61/L (3×60t) @20t, r1.0 | **Ascension** (D1 parity: Immolate id 5, verbatim but nature) |
| 145 | Venomward | 5 | ⭐ **poison** resist ×0.6 −0.05/L, allies+self, r1.5 @30t | **Ascension** (D1 parity: FireWard id 40, verbatim but poison) |
| 146 | Hoarfrost | 5 | ⭐ dmg 6.5 +3.375/L **frost** @40t r1.0 + slow 10% +10%/L r1.0 | **Recipe: Frostbite 5 + FrostShield 5** (D1 parity: Suppression id 59, close-range trade) |
| 41 | Harvest | 5 | gated dmg 14 +3.2/L, tag `harvest`, var ±15% | NPC Farmer @L1 |
| 44 | Berserker | 5 | dmg 11 +2.6/L, var ±15%; up to +100% at low HP | Drop: DireBear .15 |
| 45 | LongRangeStrike | 5 | dmg 9 +2/L, r2.6 +.1/L, var ±15% | Drop: DireWolf .2 |
| 48 | Pickaxe | 5 | gated dmg 14 +3.2/L, tag `smash`, var ±15% | NPC Miner @L4 |
| 50 | Vanguard | 5 | dmg 14 +3.2/L ×2 tgt + free heal 12 +6/L + shield 4 +1/L @90t, r1.2 | NPC FrontCaptain @L15 |
| 52 | Spearhead | 5 | dmg 16 +3.6/L ×3 tgt, r1.3 | Recipe: Vanguard 5 + Damage 5 |
| 53 | Lifewarden | 5 | heal 14 +7/L ×2 tgt, no self-cost, r1.4 | Recipe: Vanguard 5 + Heal 5 |
| 55 | Warbanner | 5 | dmg 15 +3.4/L ×2 + heal 13 +6.5/L + shield 6 +2.5/L @30t + slow 10% +3%/L, r1.2 | Recipe: Vanguard 5 + Spearhead 5 + CallForAid 3 |
| 58 | Wildfire | 5 | fire dot 10.5 +2.1/L ×2 tgt (4×60t) @20t, r1.4 + self-only fire resist ×0.6 −0.05/L + light r4 +1/L | Recipe: Ignite 3 + Immolate 5 |
| 59 | Suppression | 5 | dmg 6.5 +1.4/L r2.6 +.1/L + slow 7% +7%/L | Recipe: Slow 5 + LongRangeStrike 5 |
| 73 | OmniAura | 5 | ⭐ **LIMIT-TEST RIG** (2026-08-18): every aura-path type at once, one beat @40t r2.5 - dmg 10 +1/L fire with ALL riders (crit/execute/berserker/lifesteal/structures/variance/hitStyle) ×3 +1/L tgt + poison dot 4 +.5/L + slow 30% +2%/L + heal 5 +.5/L + HoT 3 +.3/L + shield 10 +1/L + resist `*` ×0.5 allies+self + ally speed ×1.3 +.05/L + light r3 +.25/L | **Cheat only (`SKILL OmniAura`) - a test rig, NEVER to gain a source** |

## Passives (11)

| ID | Name | MaxLv | Values | Source |
|---|---|---|---|---|
| 11 | Tough | 3 | damage reduction +10% +10%/L | Drop: Troll .4 / Orc .2 |
| 42 | Hardy | 3 | max health +8% +8%/L | Drop: EliteWolf .2 |
| 43 | ThickHide | 3 | physical resist ×0.85 −.05/L | Drop: DireBear .2 |
| 46 | Torch | 3 | light r2.5 +.5/L | NPC Lamplighter (no gate) + Emberkeeper @L1 |
| 47 | Antivenom | 3 | poison resist ×0.7 −.1/L | Drop: VenomSpider .25 |
| 65 | Discipline | 5 | ⭐ resource-cost reduction +6% +3%/L (clamped to free, never a refund); the one stat that scales an INPUT | **MS L5** |
| 60 | KeenEye | 5 | crit chance +2% +2%/L | Drop: EliteWolf .2 / AlphaWolf .12 / DireWolf .1 |
| 136 | Strong | 5 | all outgoing damage +4% +2%/L (direct + dots) | NPC CityGuard @L3 |
| 139 | FrostShield | 5 | retaliate slow 10% +5%/L for 150t on anything that damages you | Drop: Troll .2 |
| 67 | FireShield | 5 | ⭐ retaliate **damage 3 +1/L fire** at anything that damages you (attributed: it credits XP and kill credit) | **Cheat only (`SKILL FireShield`)** — no unlock source yet (plan-effect-types.md C2) |
| 74 | OmniPassive | 5 | ⭐ **LIMIT-TEST RIG** (2026-08-18): the full passive fold at once - all six stats (move +15%, maxHP +20%, DR +15%, crit +10%, dmg +25%, cost −25%, each +2%/L) + fire/poison resist ×0.7 −.05/L + retaliate slow 30% +5%/L (150t) + retaliate dmg 5 +1/L frost + light r2 +.25/L | **Cheat only (`SKILL OmniPassive`) - a test rig, NEVER to gain a source** |

## Cooldowns (30)

| ID | Name | MaxLv | Values (CD in ticks) | Source |
|---|---|---|---|---|
| 10 | Swift | 3 | move speed ×1.5 +0.1/L for 150t +30/L; CD 600 −60/L | Drop: every wolf — Wolf .04 / DireWolf .12 / AlphaWolf .15 / EliteWolf .25 |
| 8 | Bloodthirst | 5 | ⭐ for 180t (6 s), a share of the damage your hits deal comes back as healing: 30% +5%/L; CD 900 −60/L, cost 0.02 +0.0025/L | **Cheat only (`SKILL Bloodthirst`)**: no unlock source yet (R3, plan-resource-costs-feedback §5.6) |
| 20 | NovaBurst | 3 | burst 18 +4/L **fire** r2.0 +.1/L **+ fire dot 5 +1.2/L** (3×30t); CD 300 −20/L | Drop: BanditPyromancer .3 |
| 21 | FirstAid | 3 | self-heal 20% +5%/L of max; CD 900 | NPC Hermit @L2 + VillageHealer @L2 |
| 22 | Ignite | 3 | fire dot 6.3 +1.6/L (3×30t), r1.5 +.1/L; CD 300 −20/L | NPC Emberkeeper @L7 |
| 23 | SummonTotem | 3 | spawn Totem, TTL 300 +60/L; CD 450 | NPC Shaman @L5 |
| 24 | SummonCompanion | 3 | spawn Companion, TTL 1800 +300/L; CD 2400 | NPC Dog (no gate) |
| 25 | Taunt | 3 | taunt r2.0, threat +50; CD 300 −20/L | Drop: RallyDrummer 1.0 · **Quest: `wolves-on-the-road`, militia leg** |
| 26 | Fade | 3 | detaunt r2.0; CD 300 −20/L | Drop: EliteBandit .35 |
| 27 | Barrier | 3 | shield 20 +5/L (300t) allies+self, r1.5 +.1/L; CD 300 −20/L | Recipe: Hardy 3 + Tough 3 |
| 31 | Recover | 1 | instant HoT 4 (9×60t) **self only**, r2; CD 1200 | Drop: DireBear .25 · NPC Shaman @L4 |
| 32 | Revive | 1 | revive @30% max, r3, cast 150t interruptible; CD 600 | NPC VillageHealer @L8 |
| 33 | Dash | 3 | dash 2.5 +0.5/L; CD 300 | Drop: EliteWolf .2 |
| 34 | Haste | 1 | aura tick rate ×0.5 for 90t (**not** movement); CD 300 | **MS L7** |
| 49 | DamageBurst | 3 | burst 22 +5/L phys+bleed, r1.5 +.1/L; CD 300 −20/L | Drop: EliteBandit .5 |
| 51 | CallForAid | 3 | spawn 3× SoldierCompanion, TTL 1800 +300/L; CD 2400 | Drop: OrcWarlord 1.0 |
| 54 | Shockwave | 3 | burst 44 +10/L phys+bleed, r2.0 +.1/L; CD 240 −20/L | Recipe: Vanguard 5 + DamageBurst 3 |
| 56 | HoldTheLine | 3 | detaunt r2.0 + 3× ShieldbearerCompanion, TTL 1800 +300/L; CD 2400 | Recipe: CallForAid 3 + Taunt 3 |
| 57 | FieldMedics | 3 | 2× SoldierCompanion + 1× MedicCompanion, TTL 1800 +300/L; CD 2400 | Recipe: CallForAid 3 + Heal 5 |
| 143 | RimeBurst | 5 | ⭐ burst 22 +2.5/L **frost** (single tag), r1.5 +.05/L; CD 300 −10/L; displayName `Rime-Burst` | **Ascension** (D1 parity: DamageBurst id 49, verbatim but frost) |
| 144 | Envenom | 5 | ⭐ **poison** dot 6.3 +0.8/L (3×30t), r1.5 +.05/L; CD 300 −10/L | **Ascension** (D1 parity: Ignite id 22, verbatim but poison) |
| 61 | FireTotem | 3 | spawn FireTotem, TTL 300 +60/L; its aura = fire dot 6 +2/L (3×60t) r2.5 on **all** enemies + glow (light r3); CD 450 | Drop: GreaterFireElemental .5 |
| 62 | Calm | 3 | calm 300t +60/L, r4.0, all targets; **scoped: prey + predators**; CD 600 | NPC Hermit @L10 |
| 140 | Paralyze | 5 | stun 90t +6/L, r2.5, nearest 1; CD 900 | Drop: GiantSpider .2 |
| 63 | CharmBeast | 3 | charm 1800t +300/L, r4.0, 1 tgt nearest; **scoped: prey + predators**; CD 3600 | NPC Hermit @L10 |
| 64 | BindElemental | 3 | charm 1200t +200/L, r3.5, 1 tgt nearest; **scoped: elemental**; CD 4200 | NPC Emberkeeper @L15 |
| 68 | Retribution | 5 | ⭐ for 300t (10 s), reflects **20% +5%/L of every hit taken** back as **fire** (attributed: it credits XP and kill credit); CD 900 −60/L, cost 0.02 +0.0025/L | **Cheat only (`SKILL Retribution`)** — no unlock source yet (plan-effect-types.md follow-up) |
| 69 | Sanctuary | 3 | ⭐ grants resist **`*` ×0** = IMMUNITY to all damage for 150t (5 s) to the nearest 1 +1/L allies (not self), r1.5; CD 900, cost 0.04 +0.005/L | **Cheat only (`SKILL Sanctuary`)**: no unlock source yet (plan-effect-types.md C3) |
| 72 | Onward | 5 | ⭐ ally move speed **×1.4 +0.05/L** for 150t +15/L, all allies in r3 (uncapped, `targetsSelf` absent — the caster stays behind); CD 900 −60/L, cost 0.03 +0.004/L | **Cheat only (`SKILL Onward`)** — no unlock source yet (plan-effect-types.md C4) |
| 75 | OmniStrike | 5 | ⭐ **LIMIT-TEST RIG** (2026-08-18): **16 cooldown types in ONE cast** (all but recall / revive / tick_rate - preconditions gate the whole cast, tick_rate is guardrail-frozen both ways; see the `_comment`); cast 30t not damage-interruptible, CD 300 −10/L, `targetFactions` = all ten factions + `aligned`; dash authored LAST so queries center on the cast position | **Cheat only (`SKILL OmniStrike`) - a test rig, NEVER to gain a source** |

## Reachability summary (live world zone)

Swept 2026-07-29 across mob `unlocks[]`, mob `interaction` grants, recipes and
the milestone table; the cheat-only list **re-derived 2026-08-17** from
`api/skills/` against all five source kinds (kill drops, `teach_skill` grants
anywhere in an NPC dialogue tree, recipe results, the milestone table and the
ascension catalog).

- ⭐ **A FIFTH SOURCE KIND EXISTS since 2026-08-10: the ascension catalog**
  (`api/ascension/`, plan-ascension.md C3). Five skills reach players ONLY
  through it (Frostbite, Blight, RimeBurst, Envenom, Venomward), and a sixth,
  Hoarfrost, through a recipe whose ingredients are a catalog entry and a Troll
  drop. ⚑ They are therefore **not** unreachable and **not** cheat-only, but a
  regeneration script that reads only `unlocks[]`, teachings, recipes and the
  milestone table will report all six as unreachable and be wrong, exactly as
  the quest-reward note below warns for its own three.
- **Unreachable without the cheat: ELEVEN, and all eleven are deliberate —
  in TWO distinct conventions.** Eight are worked examples awaiting the content
  pass; ⭐ the three **Omni** skills (ids 73–75, 2026-08-18) are the SECOND
  convention: kitchen-sink **limit-test rigs** that exercise every effect type
  their category dispatches, and unlike the eight they must **never** gain a
  source - they are test tooling, not unplaced content.
  ⭐ **Bloodthirst** (id 8) is the oldest of them and was never counted here:
  its ROW was missing from the table, so the sweep could not see it (R3,
  2026-08-01, "no unlock source yet ... the obvious home is the wolf line
  Reaper already drops from"). It is the reason this list said THREE while the
  data said four. ⭐
  **FireVulnerability** (id 66, plan-effect-types.md C1, 2026-08-16) is the
  vocabulary-hole closer for the curse half of the resist axis, authored as the
  worked example of `resistFactor > 1`. ⭐ **FireShield** (id 67, C2,
  2026-08-17) is the same shape one chunk later: the worked example of the new
  `retaliate_damage` type, FrostShield's twin. Both ship with no unlock source
  on purpose: placement is the content pass's call, not the effect-type
  chunks'. ⭐ **Retribution** (id 68, the percentage-reflect follow-up,
  2026-08-17) is the third and settles it as a convention: an effect-type chunk
  ships its worked example unplaced, and the content pass places it.
  ⭐ **Sanctuary** (id 69) and **Aegis** (id 70, both C3, 2026-08-17) are the
  newest pair, following that convention: the two halves of invulnerability,
  the cooldown grant on the new `instant_resist` type and the aura that holds
  it. ⭐ **FlyYouFools** (id 71) and **Onward** (id 72, both C4, 2026-08-17)
  close out the effect-types round the same way: the two shapes of ally speed,
  the new `speed_aura` and the ally-capable `speed_burst`.
  ⚑ Each new one costs the reachability sweep a line, and the sweep must not
  start reading eight cheat-only skills as drift. ⚑ And a skill missing from the
  TABLE is invisible to this list, which is how Bloodthirst went four chunks
  uncounted: re-derive from `api/skills/`, never from the rows below. Every OTHER player
  skill has a live-world source — the step-7 A.5 guarantee
  (`plan-rebrand-cleanup.md`) still holding, and since zone-editor C3 there is
  no legacy source left to discount (Wild, Slow and Tough lost only their
  redundant legacy drops).
- **All 11 recipe results are craftable in the world zone** — every ingredient
  has a world source. ⚑ Hoarfrost (the eleventh, 2026-08-10) qualifies on the
  same rule and it is worth spelling out why, because it is the first recipe
  with an ascension ingredient: FrostShield is a Troll drop at 0.2 and Frostbite
  comes from the stone, so the recipe is reachable by a player who never
  ascends twice, and D1 forbids the meta-progression being the sole road to a
  power level.
- **NPC-taught, 20 teachings across 12 NPCs:** Recall (TownCrier) ·
  Harvest (Farmer) · FirstAid, Heal, Calm, CharmBeast (Hermit) · Torch
  (Lamplighter) · SummonCompanion (Dog) · Pickaxe (Miner) · FirstAid, Revive
  (VillageHealer) · Vanguard (FrontCaptain) · Recover, SummonTotem (Shaman) ·
  Recall (Wanderer) · Torch, Ignite, Immolate, BindElemental (Emberkeeper) ·
  Strong (CityGuard). ⚑ Damage LEFT the TownCrier with Q4 (2026-07-30) — it is
  the level-1 milestone now. Only ONE of the 14 conversants teaches nothing
  (ForestSign, a sign-post): the LamplessTraveller hands over Lantern as a quest
  reward, which is a `teach_skill` grant on a turn-in row rather than a teaching
  in its own right.
- **Milestone unlocks, 2:** Damage @L1 (seeded at character creation — the
  creation-time call shipped with Q4; before it, a level-1 entry could never
  fire) · Haste @L7.
- **Quest rewards, 3 (`plan-quests.md` C4, sources final since Q4):** Taunt and
  Slow — the two legs of `wolves-on-the-road`, which is the whole point of D9's
  branch being a *choice* — and Lantern from `the-lost-lamp`. ⚑ All three were
  **drop-only** before C4. Since Q4 (R3) Lantern's kobold drops are DELETED, so
  the quest's turn-in row is the aura's **only source** — the guaranteed reward
  replaced the 5 % roll on the gate to the tunnel, and
  `TestContent_LanternIsQuestOnlyAndHasASource` enforces the reachability this
  section used to state in prose only. A quest source is not authored in
  `unlocks[]`: it is a `teach_skill` grant riding an `advance_quest` row in a
  conversant's `interaction` block, so a regeneration script that reads only
  `unlocks[]` and top-level teachings will report these three as drop-only and
  be wrong.

### What changed since the 2026-07-22 generation

Recorded because the drift was large enough to be worth naming, not because
any of it is new work:

- **+3 player skills:** Calm (62), CharmBeast (63), BindElemental (64) — the
  faction-flips plan. All three are **faction-scoped**, the only skills that
  are, and all three are NPC-taught as of `3b1b3ef6`.
- **Swift (10) moved from Passives to Cooldowns** (2026-07-29) — hence 7
  passives and 23 cooldowns.
- **`Light` is now `Lantern`** (id 6).
- **KeenEye is no longer line-wide across the wolves** — Wolf itself does not
  drop it any more (EliteWolf/DireWolf/AlphaWolf only), so the "every wolf"
  phrasing in the old table was wrong. Swift still is line-wide, at four
  different chances rather than a flat .1.
- **Teacher and gate changes:** Torch moved Hermit → Lamplighter; Immolate
  @L8 → @L12; Ignite @L3 → @L7; Vanguard @L20 → @L15; FirstAid and Recall and
  Recover each picked up a second teacher (VillageHealer, Wanderer, Shaman).
- **The proving-grounds Sages teach nothing any more** — every `NPC-PG` source
  in the old table is gone (and the map itself since zone-editor C3).
- **Many drop sources moved to a different mob or chance** — Berserker
  Bear → DireBear, ThickHide Bear → DireBear, Hardy Boar → EliteWolf, Dash
  Boar → EliteWolf, Fade Bandit → EliteBandit, Antivenom lost its Spider
  source, Tough gained Orc. Chances moved on ~10 skills.

### Quest XP (not a skill source, but the same authoring budget)

`grant_xp` rows pay 150 (`village-welcome`), 150 (`turnip-chore`), 400 (either
leg of `wolves-on-the-road`) and 700 (`the-lost-lamp`). PO-ruled 2026-07-30
("punchy — about half a level each"); **the Session-⑥ band lock has no runtime
existence** (L9), so these are an offline budget only, pinned by
`quests/content_test.go`.

> Both the drop table and the milestone table are **tuning-open**, not frozen
> (PO ruling 2026-07-21) — "FINAL" on them meant *first-pass settled*.
