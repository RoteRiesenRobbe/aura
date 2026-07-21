# Skill Inventory — generated from data (2026-07-21)

**Every value in this table is [PLACEHOLDER]** per the project rule. Generated
from the actual data files on the `main` tree at 2026-07-21 (post triage pass:
Strong passive + Wildfire light + spider-range match) — **not** hand-maintained
design intent. The three
catalogs (`content-auras.md` / `content-passives.md` / `content-cooldowns.md`)
hold the design intent — *what an ability means and why it exists*. **This file
is the source of truth for unlock sources and numbers**; the catalogs point
here rather than repeating them. Regenerate after any content chunk.

**How to regenerate (cheap):** run a small script over `api/skills/*.json`
(id/name/category/maxLevel/cooldownTicks + each effect's key params), then
cross-reference sources from: `api/mobs/*.json` `unlocks[]` (`skillName`,
`chance`), `api/zones/world.json` + `proving-grounds.json` `npcs[].teachings[]`
(`skill`, `requiredLevel`), `api/recipes/*.json` (`result`, `ingredients[].skill`
/`.level`), and `api/milestones/milestone-unlocks.json`. E.g.:

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

Scope: the 47 **player** skills (`api/skills/*.json`). The 35 mob-only skills
in `api/skills/mobs/` are not listed (they're authoring details of their mobs).
47 + 35 = the **82** registry pin in the boot log.

Scaling notation: `12 +6/L` = base 12, +6 per skill level. Ticks: 30 ticks =
1 s. Source key: **MS Ln** = milestone · **Drop** = mob kill unlock (chance) ·
**NPC** = taught (W = world zone, PG = proving grounds, `@Ln` = required
character level) · **Recipe** = combination result · **NONE** = unobtainable
without the `SKILL` cheat.

> **Players spawn with an empty spellbook** (`NewSkillComponent`) — there is no
> "starting skill" any more. The first ability comes from the village
> TownCrier (Damage @L1) or the Farmer (Harvest @L1).

> Sources on **legacy** (`legacy: true`) proving-grounds mobs and NPCs do not
> count as world-reachable; they are listed in parentheses where they exist.

## Active auras (20)

| ID | Name | MaxLv | Values | Source |
|---|---|---|---|---|
| 1 | Damage | 5 | dmg 14 +3.2/L @40t, r1.0, 1 tgt nearest, var ±15% | NPC-W TownCrier @L1 |
| 2 | Heal | 5 | heal 12 +6/L @120t, r1.0, lowest_health 1 tgt, **self-cost 10 −2/L** (FINAL) | NPC-W Hermit @L3 (+ NPC-PG Sage @L1) |
| 3 | Wild | 5 | dmg 10 +2.4/L @40t, r1.4 +.05/L | Drop: EliteWolf .5 (2026-07-21) |
| 4 | Slow | 5 | slow 10% +10%/L, r1.5 | Drop: BanditRanged .03 (+ PG Mammoth .2) |
| 5 | Immolate | 5 | fire dot 10.5 +2.1/L (3×60t) @20t, r1.0 | NPC-W Emberkeeper @L8 |
| 6 | Light | 3 | light r4 +1/L | Drop: Kobold / KoboldRanged .05 |
| 7 | Reaper | 3 | dmg 12 +3/L @40t r2.0; execute <35% ×2; lifesteal 50%; berserker ×2 at low HP | Drop: AlphaWolf .2 (2026-07-21) |
| 29 | Rejuvenation | 3 | HoT 4 +2/L (6×60t) @60t, r2.5 +.2/L | Drop: OrcWarlord .1 (boss-rare) |
| 30 | Paladin | 5 | dmg 10 +2.2/L + heal 8 +4/L (no self-cost) | Recipe: Damage 5 + Heal 5 |
| 40 | FireWard | 3 | fire resist ×0.6 −0.1/L, allies+self, r1.5 | Drop: FireElemental .2 (2026-07-21 — closed the last reachability gap) |
| 41 | Harvest | 5 | gated dmg 14 +3.2/L, tag `harvest`, var ±15% | NPC-W Farmer @L1 |
| 44 | Berserker | 5 | dmg 11 +2.6/L, var ±15%; up to +100% at low HP | Drop: Bear .03 |
| 45 | LongRangeStrike | 5 | dmg 9 +2/L, r2.6 +.1/L, var ±15% | Drop: DireWolf .2 (2026-07-21) |
| 48 | Pickaxe | 5 | gated dmg 14 +3.2/L, tag `smash`, var ±15% | NPC-W Miner @L4 |
| 50 | Vanguard | 5 | dmg 14 +3.2/L ×2 tgt + free heal 12 +6/L + shield 4 +1/L @90t, r1.2 | NPC-W FrontCaptain @L20 |
| 52 | Spearhead | 5 | dmg 16 +3.6/L ×3 tgt, r1.3 | Recipe: Vanguard 5 + Damage 5 |
| 53 | Lifewarden | 5 | heal 14 +7/L ×2 tgt, no self-cost, r1.4 | Recipe: Vanguard 5 + Heal 5 |
| 55 | Warbanner | 5 | dmg 15 +3.4/L ×2 + heal 13 +6.5/L + shield 6 +2.5/L @30t + slow 10% +3%/L, r1.2 | Recipe: Vanguard 5 + Spearhead 5 + CallForAid 3 |
| 58 | Wildfire | 5 | fire dot 10.5 +2.1/L ×2 tgt (4×60t) @20t, r1.4 + self-only fire resist ×0.6 −0.05/L + light r4 +1/L (2026-07-21) | Recipe: Ignite 3 + Immolate 5 |
| 59 | Suppression | 5 | dmg 6.5 +1.4/L r2.6 +.1/L + slow 7% +7%/L | Recipe: Slow 5 + LongRangeStrike 5 |

## Passives (8)

| ID | Name | MaxLv | Values | Source |
|---|---|---|---|---|
| 10 | Swift | 3 | move speed +5% +5%/L | Drop: every wolf .1 (line-wide 2026-07-21) |
| 11 | Tough | 3 | damage reduction +10% +10%/L | Drop: Troll .25 (+ PG Dodo .05) |
| 42 | Hardy | 3 | max health +8% +8%/L | Drop: Boar .03 |
| 43 | ThickHide | 3 | physical resist ×0.85 −.05/L | Drop: Bear .04 |
| 46 | Torch | 3 | light r2.5 +.5/L | NPC-W Hermit (no level gate) + Emberkeeper @L1 |
| 47 | Antivenom | 3 | poison resist ×0.7 −.1/L | Drop: Spider .1 / VenomSpider .25 |
| 60 | KeenEye | 5 | crit chance +2% +2%/L | Drop: every wolf .06 (line-wide 2026-07-21) |
| 136 | Strong | 5 | all outgoing damage +4% +2%/L (direct + dots) | NPC-W CityGuard @L3 (the "inform the city" reward, 2026-07-21) |

## Cooldowns (19)

| ID | Name | MaxLv | Values (CD in ticks) | Source |
|---|---|---|---|---|
| 20 | NovaBurst | 3 | burst 18 +4/L **fire** r2.0 +.1/L **+ fire dot 5 +1.2/L** (3×30t); CD 300 | Drop: BanditPyromancer .05 |
| 21 | FirstAid | 3 | self-heal 20% +5%/L of max; CD 900 | NPC-W Hermit @L2 (left the milestone table 2026-07-21) |
| 22 | Ignite | 3 | fire dot 6.3 +1.6/L (3×30t), r1.5 +.1/L; CD 300 | NPC-W Emberkeeper @L3 |
| 23 | SummonTotem | 3 | spawn Totem, TTL 300 +60/L; CD 450 | NPC-W Shaman @L5 |
| 24 | SummonCompanion | 3 | spawn Companion, TTL 1800 +300/L; CD 2400 | NPC-W Dog (no level gate) |
| 25 | Taunt | 3 | taunt r2.0, threat +50; CD 300 | Drop: RallyDrummer 1.0 |
| 26 | Fade | 3 | detaunt r2.0; CD 300 | Drop: Bandit .015 |
| 27 | Barrier | 3 | shield 20 +5/L (300t) allies+self, r1.5 +.1/L; CD 300 | Recipe: Hardy 3 + Tough 3 |
| 28 | Recall | 1 | teleport, cast 300t interruptible; CD 9000 | NPC-W TownCrier @L3 |
| 31 | Recover | 1 | instant HoT 4 (9×60t) **self only**, r2; CD 1200 | Drop: DireBear .02 |
| 32 | Revive | 1 | revive @30% max, r3, cast 150t interruptible; CD 600 | NPC-W VillageHealer @L8 (+ NPC-PG Sage @L5) |
| 33 | Dash | 3 | dash 2.5 +0.5/L; CD 300 | Drop: Boar .025 (+ NPC-PG Sage @L5) |
| 34 | Haste | 1 | tick rate ×0.5 for 90t; CD 300 | **MS L7 — the only milestone unlock left** |
| 49 | DamageBurst | 3 | burst 22 +5/L phys+bleed, r1.5 +.1/L; CD 300 | Drop: EliteBandit .5 |
| 51 | CallForAid | 3 | spawn 3× SoldierCompanion, TTL 1800 +300/L; CD 2400 | Drop: OrcWarlord 1.0 |
| 54 | Shockwave | 3 | burst 44 +10/L phys+bleed, r2.0 +.1/L; CD 240 | Recipe: Vanguard 5 + DamageBurst 3 |
| 56 | HoldTheLine | 3 | detaunt r2.0 + 3× ShieldbearerCompanion, TTL 1800 +300/L; CD 2400 | Recipe: CallForAid 3 + Taunt 3 |
| 57 | FieldMedics | 3 | 2× SoldierCompanion + 1× MedicCompanion, TTL 1800 +300/L; CD 2400 | Recipe: CallForAid 3 + Heal 5 |
| 61 | FireTotem | 3 | spawn FireTotem, TTL 300 +60/L; its aura = fire dot 6 +2/L (3×60t) r2.5 on **all** enemies + glow (light r3); CD 450 | Drop: GreaterFireElemental .2 (2026-07-21) |

## Reachability summary (live world zone)

Swept 2026-07-21 across mob `unlocks[]`, NPC `teachings[]`, recipes and the
milestone table:

- **Unreachable without the cheat: NONE.** All **47** player skills have a
  non-legacy world source — a first. `FireWard` was the last gap (a
  pre-existing one, inherited from roadmap item 12) and the fire-elemental
  pair closed it on 2026-07-21: the mob that burns you drops the fire resist
  (the Spider/Antivenom "drop pair authored against its own source" pattern).
- This is the step-7 A.5 guarantee (`plan-rebrand-cleanup.md`) now fully
  satisfied; the wolf-line reshuffle had to go line-wide on Swift
  specifically to preserve it.
- **All 10 recipe results are craftable in the world zone** — every
  ingredient now has a world source. (Wildfire, Suppression and Barrier were
  un-craftable before the C8 §11 placements; that is resolved.)
- **NPC-taught in the world zone, 14 teachings across 10 NPCs:** Damage,
  Recall (TownCrier) · Harvest (Farmer) · FirstAid, Heal, Torch (Hermit) ·
  SummonCompanion (Dog) · Pickaxe (Miner) · Revive (VillageHealer) ·
  Vanguard (FrontCaptain) · SummonTotem (Shaman) · Torch, Ignite, Immolate
  (Emberkeeper) · Strong (CityGuard, 2026-07-21).
- **Milestone unlocks, 1:** Haste @L7.
- **Note on the XP values above the cL18–20 band** (FireElemental 190,
  GreaterFireElemental 260): these are **first-pass anchors set against the
  Orc (cL20, 200)**, *not* kills-per-hour-derived per the Session-⑥ rule.
  They want a simharness kph measurement before they are trusted.

> Both the drop table and the milestone table are **tuning-open**, not frozen
> (PO ruling 2026-07-21) — "FINAL" on them meant *first-pass settled*.
