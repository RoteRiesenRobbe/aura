# Skill Inventory — generated from data (2026-07-18)

**Every value in this table is [PLACEHOLDER]** per the project rule. Generated
from the actual data files at commit `7271e7dc` — **not** hand-maintained
design intent (that lives in `content-auras.md` / `content-passives.md` /
`content-cooldowns.md`). Regenerate after any content chunk.

**How to regenerate (cheap):** run a small script over `api/skills/*.json`
(id/name/category/maxLevel/cooldownTicks + each effect's key params), then
cross-reference sources from: `api/mobs/*.json` `unlocks[]`,
`api/zones/world.json` + `proving-grounds.json` `npcs[].teachings[]`,
`api/recipes/*.json`, `backend/pkg/aura/skills/milestone-unlocks.json`,
and `initializePlayerSkills` (`model/player/player.go`). E.g.:

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

Scope: the 44 **player** skills (`api/skills/*.json`). The 31 mob-only skills
in `api/skills/mobs/` are not listed (they're authoring details of their
mobs). Scaling notation: `12 +6/L` = base 12, +6 per skill level. Ticks: 30
ticks = 1 s. Source key: **Start** = fresh spawn · **MS Ln** = milestone ·
**Drop** = mob kill unlock (chance) · **NPC** = taught (W = world zone, PG =
proving grounds) · **Recipe** = combination result · **NONE** = unobtainable
without the SKILL cheat.

## Active auras (20)

| ID | Name | MaxLv | Values | Source |
|---|---|---|---|---|
| 1 | DamageAura | 5 | dmg 14 +3.2/L @40t, r1.0, 1 tgt nearest, var ±15% | NPC-W Farmer @L2 |
| 2 | HealAura | 5 | heal 12 +6/L @120t, r1.0, lowest_health 1 tgt, **self-cost 18 flat** | MS L2 (+ NPC-PG Sage) |
| 3 | WildAura | 5 | dmg 10 +2.4/L @40t, r1.4 +.05/L | Drop: EliteWolf .5 (2026-07-21; PG SaberToothCat/AngryMammoth are legacy) |
| 4 | SlowAura | 5 | slow 10% +10%/L, r1.5 | Drop PG: Mammoth .2 — **world-unreachable** |
| 5 | ImmolationAura | 5 | fire dot 10 +2/L (3×60t) @40t, r1.0 | **NONE** (Wildfire ingredient) |
| 6 | Light | 3 | light r4 +1/L | Drop: Kobold / KoboldRanged .08 |
| 7 | ReaperAura | 3 | dmg 12 +3/L @40t r2.0; execute <35% ×2; lifesteal 50%; berserker (authored crit pair removed, crit rework v2) | Drop: AlphaWolf .2 (2026-07-21) |
| 29 | Rejuvenation | 3 | HoT 4 +2/L (6×60t) @60t, r2.5 +.2/L | **NONE** |
| 30 | PaladinAura | 5 | dmg 10 +2.2/L + heal 8 +4/L (no self-cost) | Recipe: DamageAura 5 + HealAura 5 |
| 40 | FireWard | 3 | fire resist ×0.6 −0.1/L, allies+self, r1.5 | **NONE** |
| 41 | Harvest | 5 | gated dmg 14 +3.2/L, tag `harvest` | **Start** |
| 44 | BerserkerAura | 5 | dmg 11 +2.6/L; up to +100% at low HP | Drop: Bear .1 |
| 45 | LongRangeStrike | 5 | dmg 9 +2/L, r2.6 +.1/L | Drop: DireWolf .2 (2026-07-21; was EliteWolf .5) |
| 48 | Pickaxe | 5 | gated dmg 14 +3.2/L, tag `smash` | NPC-W Miner |
| 50 | Vanguard | 5 | dmg 14 +3.2/L ×2 tgt + free heal 12 +6/L + shield 5 +2/L, r1.2 | NPC-W FrontCaptain @L20 |
| 52 | Spearhead | 5 | dmg 16 +3.6/L ×3 tgt, r1.3 | Recipe: Vanguard 5 + DamageAura 5 |
| 53 | Lifewarden | 5 | heal 14 +7/L ×2 tgt, no self-cost, r1.4 | Recipe: Vanguard 5 + HealAura 5 |
| 55 | Warbanner | 5 | dmg 15 +3.4/L ×2 + heal 13 +6.5/L + shield 6 +2.5/L + slow 10% +3%/L, r1.2 | Recipe: Vanguard 5 + Spearhead 5 + CallForAid 3 |
| 58 | Wildfire | 5 | fire dot 7 +1.4/L ×2 tgt @40t, r1.2 | Recipe: Ignite 3 + ImmolationAura 5 — **un-craftable: both ingredients NONE** |
| 59 | Suppression | 5 | dmg 6.5 +1.4/L r2.6 + slow 7% +7%/L | Recipe: SlowAura 5 + LongRangeStrike 5 — **un-craftable in world: SlowAura is PG-only** |

## Passives (6)

| ID | Name | MaxLv | Values | Source |
|---|---|---|---|---|
| 10 | SwiftPassive | 3 | move speed +5% +5%/L | Drop: every wolf .1 (line-wide 2026-07-21) |
| 11 | ToughPassive | 3 | damage reduction +10% +10%/L | Drop PG: Dodo .05 — **world-unreachable** |
| 42 | Hardy | 3 | max health +8% +8%/L | Drop: Boar .15 |
| 43 | ThickHide | 3 | physical resist ×0.85 −.05/L | Drop: Bear .15 |
| 46 | Torch | 3 | light r2.5 +.5/L | NPC-W Hermit |
| 47 | Antivenom | 3 | poison resist ×0.7 −.1/L | Drop: Spider .1 / VenomSpider .25 |
| 60 | KeenEye | 5 | crit chance +2% +2%/L | Drop: every wolf .06 (line-wide 2026-07-21) |

## Cooldowns (18)

| ID | Name | MaxLv | Values (CD in ticks) | Source |
|---|---|---|---|---|
| 20 | NovaBurst | 3 | burst 25 +6/L, r1.5 +.1/L; CD 300 −20/L | **NONE** |
| 21 | FirstAid | 3 | self-heal 20% +5%/L of max; CD 900 | NPC-W Hermit @L2 (left the milestone table 2026-07-21) |
| 22 | Ignite | 3 | fire dot 6 +1.5/L (3×30t), r1.5; CD 300 −20/L | **NONE** (Wildfire ingredient) |
| 23 | SummonTotem | 3 | spawn Totem, TTL 300 +60/L; CD 450 | **NONE** (Totem mob never spawns otherwise) |
| 24 | SummonCompanion | 3 | spawn Companion, TTL 1800 +300/L; CD 2400 | NPC-W Dog |
| 25 | Taunt | 3 | taunt r2.0, threat +50; CD 300 −20/L | Drop: RallyDrummer 1.0 |
| 26 | Fade | 3 | detaunt r2.0; CD 300 −20/L | **NONE** |
| 27 | Barrier | 3 | shield 20 +5/L (300t) allies+self, r1.5; CD 300 −20/L | Recipe: Hardy 3 + ToughPassive 3 — **un-craftable in world: ToughPassive is PG-only** |
| 28 | Recall | 1 | teleport, cast 300t interruptible; CD 9000 | NPC-W Farmer @L2 |
| 31 | Recover | 1 | instant HoT 4 (9×60t) self+allies, r2; CD 1200 | Drop: DireBear |
| 32 | Revive | 1 | revive @30% max, r3, cast 150t interruptible; CD 600 | NPC-PG Sage @L5 — **world-unreachable** |
| 33 | Dash | 3 | dash 2.5 +0.5/L; CD 300 | Drop: Boar .1 (+ NPC-PG Sage) |
| 34 | Haste | 1 | tick rate ×0.5 for 90t; CD 300 | **MS L7 — the only milestone unlock left** |
| 49 | DamageBurst | 3 | burst 22 +5/L phys+bleed, r1.5; CD 300 −20/L | Drop: EliteBandit .5 |
| 51 | CallForAid | 3 | spawn 3× SoldierCompanion, TTL 1800 +300/L; CD 2400 | Drop: OrcWarlord 1.0 |
| 54 | Shockwave | 3 | burst 44 +10/L phys+bleed, r2.0; CD 240 −20/L | Recipe: Vanguard 5 + DamageBurst 3 |
| 56 | HoldTheLine | 3 | detaunt + 3× ShieldbearerCompanion; CD 2400 | Recipe: CallForAid 3 + Taunt 3 |
| 57 | FieldMedics | 3 | 2× SoldierCompanion + 1× MedicCompanion; CD 2400 | Recipe: CallForAid 3 + HealAura 5 |

## Reachability summary (live world zone)

- **No source at all (cheat-only), 7:** ImmolationAura, Ignite, NovaBurst,
  SummonTotem, Fade, Rejuvenation, FireWard.
- **Source exists only in proving-grounds, 3:** SlowAura, ToughPassive
  (drops), Revive (Sage teachings). WildAura + ReaperAura left this list
  2026-07-21 — both now have live wolf-line sources.
- **Recipe results not craftable in the world zone, 3:** Wildfire (both
  ingredients cheat-only), Suppression (SlowAura PG-only), Barrier
  (ToughPassive PG-only).
- **NPC-taught in the world zone, 6 of 44:** DamageAura, Recall,
  SummonCompanion, Torch, Pickaxe, Vanguard.

These gaps are tracked as `plan-intermission-triage.md` items 4 / 20 and the
C8 §11 placements.
