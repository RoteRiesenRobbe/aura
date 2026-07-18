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
| Wild boars | in-game *(C2)* | Animal / prey | `wildlife_prey`: passive until hit, then gores back (physical + **bleed**, first bleed tag). Drops Hardy @0.15 + Dash @0.1. `api/mobs/boar.json`. |
| Trolls | idea | Fantasy | "Well versed in heal magic" — enable the Heal cooldown unlock (troll territory). |
| Necromancer | idea | Evil / caster | Caster-mob archetype (2026-07-09 seed). |
| Guardian golem | idea | Fantasy / boss | Boss before the mountain range (2026-07-09 seed). |

## Current in-game mobs (pre-content-pass)

Legacy Berryhunter roster (dodo, rabbit, mammoth, saber-tooth cat,
angry mammoth) — placeholder combat content, replaced in step 6. System/
harness entities in `api/mobs/` (companion, totem, healer, brazier,
proving-* set) belong to their systems' plan docs, not this roster.
