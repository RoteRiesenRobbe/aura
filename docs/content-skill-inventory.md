# Skill Inventory — generated from data (2026-07-29, quest sources added 2026-07-30, Q4 source moves swept in 2026-07-30)

**Every value in this table is [PLACEHOLDER]** per the project rule. Generated
from the actual data files on the `main` tree at 2026-07-29 (post Swift-as-a-
cooldown) — **not** hand-maintained design intent. The three catalogs
(`content-auras.md` / `content-passives.md` / `content-cooldowns.md`) hold the
design intent — *what an ability means and why it exists*. **This file is the
source of truth for unlock sources and numbers**; the catalogs point here rather
than repeating them. Regenerate after any content chunk.

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

Scope: the 50 **player** skills (`api/skills/*.json`). The 36 mob-only skills
in `api/skills/mobs/` are not listed (they're authoring details of their mobs).
50 + 36 = the **86** registry count in the boot log.

Scaling notation: `12 +6/L` = base 12, +6 per skill level. Ticks: 30 ticks =
1 s. Source key: **MS Ln** = milestone · **Drop** = mob kill unlock (chance) ·
**NPC** = taught (`@Ln` = required character level) · **Recipe** = combination
result · **NONE** = unobtainable without the `SKILL` cheat.

> **Players spawn with exactly the level-1 milestone in the spellbook:
> Damage** (conversation-journal Q4, 2026-07-30 — seeded silently at character
> creation, so a peasant can always fight; GDD §3's free-baseline ruling made
> concrete). Everything else still arrives through the discovery paths; the
> first *taught* ability is the Farmer's Harvest @L1. The TownCrier no longer
> teaches Damage.

> Sources on **legacy** (`legacy: true`) proving-grounds mobs do not count as
> world-reachable; they are marked *(legacy)* where they exist.

## Active auras (20)

| ID | Name | MaxLv | Values | Source |
|---|---|---|---|---|
| 1 | Damage | 5 | dmg 14 +3.2/L @40t, r1.0, 1 tgt nearest, var ±15% | **MS L1** — seeded at character creation (Q4) |
| 2 | Heal | 5 | heal 12 +6/L @80t, r1.5 +.1/L, lowest_health 1 tgt, **self-cost 10 −2/L** (FINAL) | NPC Hermit @L3 |
| 3 | Wild | 5 | dmg 10 +2.4/L @40t, r1.4 +.05/L | Drop: EliteWolf .5 (+ AngryMammoth 1.0 / SaberToothCat .2, legacy) |
| 4 | Slow | 5 | slow 10% +10%/L, r1.5 | Drop: BanditRanged .2 (+ Mammoth .2, legacy) · **Quest: `wolves-on-the-road`, shaman leg** |
| 5 | Immolate | 5 | fire dot 10.5 +2.1/L (3×60t) @20t, r1.0 | NPC Emberkeeper @L12 |
| 6 | Lantern | 3 | light r4 +1/L | **Quest: `the-lost-lamp` — the ONLY source** (Q4/R3 deleted the .05 kobold drops; pinned by `TestContent_LanternIsQuestOnlyAndHasASource`) |
| 7 | Reaper | 3 | dmg 12 +3/L @40t r2.0; execute <35% ×2; lifesteal 50%; berserker ×2 at low HP | Drop: AlphaWolf .35 |
| 29 | Rejuvenation | 3 | HoT 4 +2/L (6×60t) @60t, r2.5 +.2/L | Drop: OrcWarlord .25 (boss-rare) |
| 30 | Paladin | 5 | dmg 10 +2.2/L @40t + heal 8 +4/L @120t (no self-cost), r1.0 | Recipe: Damage 5 + Heal 5 |
| 40 | FireWard | 3 | fire resist ×0.6 −0.1/L, allies+self, r1.5 | Drop: FireElemental .35 |
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

## Passives (7)

| ID | Name | MaxLv | Values | Source |
|---|---|---|---|---|
| 11 | Tough | 3 | damage reduction +10% +10%/L | Drop: Troll .4 / Orc .2 (+ Dodo .05, legacy) |
| 42 | Hardy | 3 | max health +8% +8%/L | Drop: EliteWolf .2 |
| 43 | ThickHide | 3 | physical resist ×0.85 −.05/L | Drop: DireBear .2 |
| 46 | Torch | 3 | light r2.5 +.5/L | NPC Lamplighter (no gate) + Emberkeeper @L1 |
| 47 | Antivenom | 3 | poison resist ×0.7 −.1/L | Drop: VenomSpider .25 |
| 60 | KeenEye | 5 | crit chance +2% +2%/L | Drop: EliteWolf .2 / AlphaWolf .12 / DireWolf .1 |
| 136 | Strong | 5 | all outgoing damage +4% +2%/L (direct + dots) | NPC CityGuard @L3 |

## Cooldowns (23)

| ID | Name | MaxLv | Values (CD in ticks) | Source |
|---|---|---|---|---|
| 10 | Swift | 3 | move speed ×1.5 +0.1/L for 150t +30/L; CD 600 −60/L | Drop: every wolf — Wolf .04 / DireWolf .12 / AlphaWolf .15 / EliteWolf .25 |
| 20 | NovaBurst | 3 | burst 18 +4/L **fire** r2.0 +.1/L **+ fire dot 5 +1.2/L** (3×30t); CD 300 −20/L | Drop: BanditPyromancer .3 |
| 21 | FirstAid | 3 | self-heal 20% +5%/L of max; CD 900 | NPC Hermit @L2 + VillageHealer @L2 |
| 22 | Ignite | 3 | fire dot 6.3 +1.6/L (3×30t), r1.5 +.1/L; CD 300 −20/L | NPC Emberkeeper @L7 |
| 23 | SummonTotem | 3 | spawn Totem, TTL 300 +60/L; CD 450 | NPC Shaman @L5 |
| 24 | SummonCompanion | 3 | spawn Companion, TTL 1800 +300/L; CD 2400 | NPC Dog (no gate) |
| 25 | Taunt | 3 | taunt r2.0, threat +50; CD 300 −20/L | Drop: RallyDrummer 1.0 · **Quest: `wolves-on-the-road`, militia leg** |
| 26 | Fade | 3 | detaunt r2.0; CD 300 −20/L | Drop: EliteBandit .35 |
| 27 | Barrier | 3 | shield 20 +5/L (300t) allies+self, r1.5 +.1/L; CD 300 −20/L | Recipe: Hardy 3 + Tough 3 |
| 28 | Recall | 1 | teleport, cast 300t interruptible; CD 9000 | NPC TownCrier @L3 + Wanderer @L3 |
| 31 | Recover | 1 | instant HoT 4 (9×60t) **self only**, r2; CD 1200 | Drop: DireBear .25 · NPC Shaman @L4 |
| 32 | Revive | 1 | revive @30% max, r3, cast 150t interruptible; CD 600 | NPC VillageHealer @L8 |
| 33 | Dash | 3 | dash 2.5 +0.5/L; CD 300 | Drop: EliteWolf .2 |
| 34 | Haste | 1 | aura tick rate ×0.5 for 90t (**not** movement); CD 300 | **MS L7** |
| 49 | DamageBurst | 3 | burst 22 +5/L phys+bleed, r1.5 +.1/L; CD 300 −20/L | Drop: EliteBandit .5 |
| 51 | CallForAid | 3 | spawn 3× SoldierCompanion, TTL 1800 +300/L; CD 2400 | Drop: OrcWarlord 1.0 |
| 54 | Shockwave | 3 | burst 44 +10/L phys+bleed, r2.0 +.1/L; CD 240 −20/L | Recipe: Vanguard 5 + DamageBurst 3 |
| 56 | HoldTheLine | 3 | detaunt r2.0 + 3× ShieldbearerCompanion, TTL 1800 +300/L; CD 2400 | Recipe: CallForAid 3 + Taunt 3 |
| 57 | FieldMedics | 3 | 2× SoldierCompanion + 1× MedicCompanion, TTL 1800 +300/L; CD 2400 | Recipe: CallForAid 3 + Heal 5 |
| 61 | FireTotem | 3 | spawn FireTotem, TTL 300 +60/L; its aura = fire dot 6 +2/L (3×60t) r2.5 on **all** enemies + glow (light r3); CD 450 | Drop: GreaterFireElemental .5 |
| 62 | Calm | 3 | calm 300t +60/L, r4.0, all targets; **scoped: prey + predators**; CD 600 | NPC Hermit @L10 |
| 63 | CharmBeast | 3 | charm 1800t +300/L, r4.0, 1 tgt nearest; **scoped: prey + predators**; CD 3600 | NPC Hermit @L10 |
| 64 | BindElemental | 3 | charm 1200t +200/L, r3.5, 1 tgt nearest; **scoped: elemental**; CD 4200 | NPC Emberkeeper @L15 |

## Reachability summary (live world zone)

Swept 2026-07-29 across mob `unlocks[]`, mob `interaction` grants, recipes and
the milestone table:

- **Unreachable without the cheat: NONE.** All **50** player skills have a
  source, and **none is legacy-only** — every skill with a proving-grounds
  source (Wild, Slow, Tough) also has a live-world one. This is the step-7 A.5
  guarantee (`plan-rebrand-cleanup.md`) still holding.
- **All 10 recipe results are craftable in the world zone** — every ingredient
  has a world source.
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
  in the old table is gone.
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
