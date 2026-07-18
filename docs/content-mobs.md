# Content — Mobs

Mob roster + the category taxonomy. Conventions (status column, placement
split) → `README.md` → Content. In-game entries: authoritative definition is
`api/mobs/*.json`. The full roster is content-pass work (step 6, roadmap
item 12) — the current legacy Berryhunter mobs get replaced there.

## Category taxonomy

Loose grouping for the eventual full roster (from the 2026-07-09 capture,
`mobs.jpg`; all undecided):

- **Tiere (animals)** — wolves, boars, … (zone 1 tier)
- **Small Fantasy** — kobolds, … (zone 1–2 tier)
- **Humanoid** — bandits, guards, mercenaries, … (faction logic → `content-lore.md`)
- **Fantasy**
- **Evil**
- **Corrupted Fantasy**
- **Elementals**
- **Dragons** (endgame tier)

## Roster

| Mob | Status | Category / role | Notes |
|---|---|---|---|
| Turnips | in-game *(C1)* | Harvest-mob (chore) | Stationary (speed 0), passive, no skills; first authored `resistances` — the `{"*": 0, "harvest": 1}` wildcard means only Harvest damages them. XP only, **no drops** (resolved conflict — `archive-content-zone1-capture.md`). Zone 1 onboarding chore-mob; field spawns in `api/zones/world.json`, def `api/mobs/turnip.json`. |
| Wolves | in-game *(C2)* | Animal / normal | Zone 1's first real combat mob; "pack" = clustered spawns (no pack mechanic). `wildlife_predator` — hunts boar/stag AND players (ambient predation). Speed 0.7 (PO rule: normal mobs clearly slower than the player). Drops Swift @0.15. `api/mobs/wolf.json`. |
| Elite wolf | in-game *(C2)* | Animal / elite | Dark-forest pack leader ("something big"); EliteWolfBite carries **execute + lifesteal** (feeds on wounded prey). Guards the Hermit approach. Drops LongRangeStrike @0.5. `api/mobs/elite-wolf.json`. |
| Bear | in-game *(C2)* | Animal / normal | Forest tank; BearSwipe carries **berserker** (wounded animal rages). Drops ThickHide @0.15 + BerserkerAura @0.1. `api/mobs/bear.json`. |
| Stag | in-game *(C2)* | Animal / prey | Flee-always (`fleeBelowHealthRatio: 1`); XP only, no drop (§11 TBD open). `api/mobs/stag.json`. |
| Bramble | in-game *(C2)* | Obstacle / solid mob | Destructible aura-gated wall (plan-content-zones12 §10): stationary, XP 0, `{"*": 0, "harvest": 1}` opt-in — only Harvest clears it. Solid-mob pattern `collisionLayer 99` (PlayerStatic+Action+Viewport+MobStatic) / `collisionMask 16` — blocks players and mobs, nothing pushes it. 4 spawns seal the forest shortcut-corridor mouth, ~5 min respawn. `api/mobs/bramble.json`. |
| Kobold (melee) | in-game *(C3)* | Small Fantasy / normal | Hideout swarm fighter: KoboldStab small/fast (tick-contrast partner to the volley). First **flee-at-low-HP** combat mob (`fleeBelowHealthRatio 0.25`). `kobold` faction (hostile to players only). Drops **Light @0.08** — the zone's only Light source (§12 flag). `api/mobs/kobold.json`. |
| Kobold (ranged) | in-game *(C3)* | Small Fantasy / normal | The **uncapped-volley showcase**: KoboldVolley large radius, slow tick, `selector: "all"` — hits every valid target in range per volley. Stands behind the melee line. Also flees low HP; drops Light @0.08. `api/mobs/kobold-ranged.json`. |
| Elite kobold | idea | Small Fantasy / elite | — |
| Spider | in-game *(C3)* | Animal / normal | Dark Tunnel + lit staging area at the west mouth (players meet spiders in daylight first). SpiderBite carries **lifesteal** (drains prey — feeding). Drops Antivenom @0.1. `api/mobs/spider.json`. |
| Venom spider | in-game *(C3)* | Animal / normal | Tunnel interior + rockfall nest. VenomSpit = first **`poison`** tag: dot_aura whose DoT keeps ticking after escaping the radius. Drops Antivenom @0.25 (the drop pair's better source). `api/mobs/venom-spider.json`. |
| Poison pool | in-game *(C3)* | Hazard fixture | Brazier pattern (`collisionLayer 32`/`mask 16`): unkillable, non-blocking, always-on poison damage aura. Hurts while stood in, **grants nothing** (XP 0). Tunnel corridor + nest. `api/mobs/poison-pool.json`. |
| Rockfall | in-game *(C3)* | Obstacle / solid mob | Second aura-gated obstacle (bramble pattern, layer 99/mask 16): resists `{"*": 0, "smash": 1}` — **only the Miner-taught Pickaxe clears it** (PO 2026-07-17); Harvest and combat auras do 0. Seals the tunnel side passage hiding the venom-spider nest. `api/mobs/rockfall.json`. |
| Bandit (melee) | in-game *(C4)* | Humanoid / normal | Z2 camp + horde blade fighter: BanditBlades carries **physical + bleed** (boar-gore multi-tag precedent). No flee — bandits stand and fight (contrast to the kobold swarm). `bandit` faction (hostile to players only, ignores wildlife). No drop (§11 open since the Rally cut). `api/mobs/bandit.json`. |
| Bandit (ranged) | in-game *(C4)* | Humanoid / normal | Crossbow volley: large radius, slow tick, `selector: "all"` uncapped (kobold-volley precedent), harder per hit for the higher band. Drop deliberately empty — §11 stays open (PO 2026-07-18). `api/mobs/bandit-ranged.json`. |
| Bandit (healer) | in-game *(C4)* | Humanoid / normal / support | **The group-gate maker**: same-faction heal_aura, `lowest_health` selector (shipped Healer precedent; heal_aura over hot_aura, PO 2026-07-18). Never attacks — kill it to stop the healing (the kill-priority teach). `api/mobs/bandit-healer.json`. |
| Elite bandit | in-game *(C4)* | Humanoid / elite | Camp leader; EliteBanditSlash = **first authored crit pair** (0.25 @ ×2 — the one sanctioned upside-only combat RNG). Drops **DamageBurst @0.5** (elite-wolf precedent). `api/mobs/elite-bandit.json`. |
| Rally-Drum drummer | in-game *(C4)* | Humanoid / normal / support | The horde's signature mob: RallyDrum = **first authored shield_aura** ("war drums embolden") — re-applies an absorb shield to every bandit in a wide ring, allies only, never itself (the drummer stays soft; focusing it is the counterplay). **Horde-only spawn**, carries the **Taunt kill-drop @1.0** (PO 2026-07-18: drummer = carrier so camp kills can't leak the gate reward). `api/mobs/rally-drummer.json`. |
| Wild boars | in-game *(C2)* | Animal / prey | `wildlife_prey`: passive until hit, then gores back (physical + **bleed**, first bleed tag). Drops Hardy @0.15 + Dash @0.1. `api/mobs/boar.json`. |
| Army soldier | in-game *(C5)* | Humanoid / normal / allied | The Human Army's rank and file: `human_army` faction — never aggros players, **harm-proof to the aligned side** (§9 lift 6 `friendlyToPlayers`, first user), wars with the orcs for the unattended front ambience. **XP 0** (locked: no XP-via-army). Fast respawn — the line refills. curveLevel 18 (front band, re-anchored to the L20 Vanguard ruling). `api/mobs/army-soldier.json`. |
| Orc | in-game *(C5)* | Humanoid / elite | The front's wall: `orc` faction, hostile to players AND the army. Very strong and tanky (elite baseline 280), OrcCleave hits up to 3 targets — but **XP 15, deliberately very low** (the front is a spectacle, not a grind spot). curveLevel 20 = the Vanguard anchor. The C6 Ork World Boss joins this faction. `api/mobs/orc.json`. |
| Spike barricade | in-game *(C5)* | Hazard fixture | Brazier pattern (32/16): unkillable, non-blocking, always-on **physical+bleed** scraping, XP 0. Default-hostile faction on purpose — hurts only players, so it can't bleed the army and tilt the war. No-man's land + the funnel toward the C6 boss arena (west end of the front). `api/mobs/spike-barricade.json`. |
| Orc Warlord | in-game *(C6)* | Humanoid / boss | **The Ork World Boss (§B) — the v1 completion beat.** `orc` faction, boss baseline 900 @ cL23, XP 600 (the "large XP" beat vs the starved Orc 15). Kit: WarlordCleave (multi-effect: 3-target cleave + physical+bleed dot — one active aura, Vanguard precedent) + WarlordFrenzy (tick_rate cooldown the mob AI fires on rotation → recurring frenzy windows). Encounter-spawned ONLY (OrcWarlordEncounter, zone anchors); drops **Call for Aid @1.0** to all participants + recent healers. `api/mobs/orc-warlord.json`. |
| Warbanner totem | in-game *(C6)* | Encounter object | The Warlord's invuln gate: killable stationary (bramble body 99/16, NO gate resist — anything fells it), XP 0, `orc` faction. WarbannerShield = RallyDrum-class shield on nearby orcs, allies-only (the banner stays soft). Replanted once per cycle at 33% (the re-gate) and on wipe/respawn. `api/mobs/warbanner-totem.json`. |
| Orc grunt | in-game *(C6)* | Humanoid | Wave add: normal tier @ cL20, XP 5 trickle, GruntSlash single-target melee, big aggro sensor (spawned waves find the fight while charging from the wave-mouth anchor). Encounter-spawned only. `api/mobs/orc-grunt.json`. |
| Soldier companion | in-game *(C6)* | Summon | The Call for Aid squad member: Companion body/behavior pattern (owned, caster-aligned follower), SoldierBlades kit reused — a soldier of the front, marked yours. Skill-spawned only. `api/mobs/soldier-companion.json`. |
| Shieldbearer companion | in-game *(C7)* | Summon | The HoldTheLine squad member: Companion pattern, tanky (baseline 90), **reuses the RallyDrum mob skill** — drums shields onto squad and owner. Skill-spawned only. `api/mobs/shieldbearer-companion.json`. |
| Medic companion | in-game *(C7)* | Summon | The FieldMedics squad healer: Companion pattern, soft (baseline 45), **reuses the HealerAura mob skill** (lowest-health ally). Skill-spawned only. `api/mobs/medic-companion.json`. |
| Trolls | idea | Fantasy | "Well versed in heal magic" — enable the Heal cooldown unlock (troll territory). |
| Necromancer | idea | Evil / caster | Caster-mob archetype (2026-07-09 seed). |
| Guardian golem | idea | Fantasy / boss | Boss before the mountain range (2026-07-09 seed). |

## Current in-game mobs (pre-content-pass)

Legacy Berryhunter roster (dodo, rabbit, mammoth, saber-tooth cat,
angry mammoth) — placeholder combat content, replaced in step 6. System/
harness entities in `api/mobs/` (companion, totem, healer, brazier,
proving-* set) belong to their systems' plan docs, not this roster.
