# Content — World & Zone Progression

The zone map skeleton: progression order, scope tiers, connections, and
locations not yet owned by a zone doc. Conventions → `README.md` → Content.
Per-zone design intent lives in `content-zone<N>.md`; runtime placement truth
is the zone JSON authored via the editor (`manual-zone-editor.md`).

## Zone progression (from the 2026-07-09 capture, `zones.png`)

- **21+ zones.** A zone's **number = its position on the progression
  curve**, **not** an absolute character level (ties to the power curve,
  GDD §5: mobs are authored per zone tier).
- **Scope tiers:**
  - **Prototype** = Zone 1 + Zone 2
  - **Early build** = Zones 1–6 + the City
  - **Full release** = everything up to the volcano / dragons (20+)

## Known zones

| Zone | Sketch | Doc |
|---|---|---|
| Zone 1 | Village + forest (incl. a wolf pack). | `content-zone1.md` |
| Zone 2 | Further forest, directly before the City. | *(none yet)* |
| The City | Hub after zone 2. | *(none yet)* |
| … | … | |
| Volcano / dragons | Endgame tier (20+). | *(none yet)* |

**Connections:** the **tunnel Zone 1 ↔ Zone 2** is the first dark area — the
natural light-role tutorial (GDD §7; detail in `content-zone1.md`).

## Unplaced locations (no zone yet)

| Place | Note |
|---|---|
| Caves in general | Dark, Pokémon-cave style; open-world dungeons, no instances. |
| "Way of the Warrior" sign | Clue location → short dungeon with a DPS-aura reward. |
| Troll territory | A clue NPC leads there; reward = the Heal cooldown unlock. |
| A dark forest with the dog NPC *(2026-07-16)* | Self-contained teaching beat (→ `content-npcs.md`). Could be zone 1's forest or a later, darker one. |
| Prison camp / mining colony | Gothic 1 vibe (2026-07-09 seed); later zone. |
