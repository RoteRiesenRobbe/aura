# Aura — Game Design Document

**Version:** 1.0
**Status:** Living document
**Last updated:** 2026-07-06 (doc consolidation; translated to English)

> This document is the **game-design truth** (vision, mechanic intent, open
> design questions). Technology belongs in the [Technical Design Document](./tdd.md),
> implementation scope and status in `roadmap.md`, unscoped feature ideas in
> `backlog.md`. All concrete numbers are [PLACEHOLDER] until explicitly final.

---

## 1. Vision & Pitch

**Tagline:** MMO lite — resource vs. resource, as simplified as possible.

**Core principle:** Players and NPCs interact exclusively through **auras** — circular effect fields. **No manual aiming:** every aura picks its own targets by a fixed, per-aura rule (default: the nearest valid target in range). Positioning and cooldown/switch timing are the only skill expressions — *who* gets hit is controlled through your own position.

**Inspiration:**
- WoW Classic — progression, worldbuilding, environmental storytelling, slow escalation in tone
- Gothic 1 & 2 — low-poly look, dense organic world
- Hotline Miami / Monaco / Rimworld — top-down art direction (not isometric, not pixel art)

**Platform:** Browser-based.

---

## 2. Core Loop

1. Player moves through a persistent shared open world
2. Encounters mobs / other players — their own aura automatically picks targets in range by its rule and ticks on them
3. Damage, healing, buffs emerge from aura overlap; cooldown abilities modify temporarily
4. Combat ends → XP for all participants → possibly an aura unlock
5. Level up → skill points → strengthen existing auras or unlock combinations
6. Explore the world → find clues → unlock new auras / passives / cooldowns
7. Rearrange slots, adjust the build, tackle harder content

Everything revolves around the Resource (section 3) and the auras (section 4).

---

## 3. The Resource

Every player and every NPC has exactly **one resource**. It represents HP, mana, and everything else at once. Drops to 0 → death.

### Consumption
- Damage from enemy auras reduces the resource
- Your own heal auras on other players cost resource continuously
- More powerful auras cost more resource per tick

### Regeneration
- Slow passive regeneration outside of combat
- Through your own cooldown abilities
- Through other players' heal auras
- Through campfires (environmental)

### Death
At resource = 0:
- **Respawn** at the last visited campfire
- **XP loss** within the current level (back to 0 XP inside the current level — no level-down)
- No hardcore death, no gear loss

Since death has the same effect on XP progress as a respec, you can respec for free right after dying (see section 5).

---

## 4. Auras

### Definition

An aura is a circular effect field around a player or NPC. The circle is the **range** from which the aura strikes its targets — not necessarily a hit zone for everything inside it. **Line-of-sight based** — auras don't pass through walls or large environment objects (occluders are curated, see the tech document).

```
       . . . . .
     .           .
    .   M         .          P  = player (caster)
    .       ###   .          M  = nearest valid target → gets hit
    .   P   ###   .          M2 = mob behind wall       → safe (LoS blocks)
    .       ###   .          M3 = mob out of range      → safe (too far)
    .         M2  .          ### = wall
     .           .
       . . . . .       M3
```

### Targeting

Every aura has a **selector** (the rule by which targets are picked) and a **target count** — both defined per aura, as data, not as code.

- **Default selector for everything (damage and heal): nearest** — the closest valid target. Positioning thereby directly controls who gets hit or healed: one step toward the boss = hit the boss.
- **lowest_health** (special auras): the proportionally most wounded target — lowest current resource *relative to max resource*, not absolute. It thus hits/heals whoever is relatively worst off, instead of always picking the small-max-resource add in mixed fights.
- **Target count:** base auras hit few targets (starting value 1 [PLACEHOLDER]). More targets come via level-ups (defined per aura) or as dedicated unlocks. Auras that hit *all* targets in range are late unlocks.
- **Selection pipeline:** filter by range → filter by line-of-sight → sort by selector → take the first N.

Heal auras heal other players, **never the caster**. Self-healing is conceptually a cooldown (see Appendix A, Heal Magic cooldown).

### Slot System

Players have three slot categories, all growing with level:

- **Active slots** — auras you can actively switch and use (~4 initially, keyboard 1–4)
- **Passive slots** — permanently active effects
- **Cooldown slots** — active abilities with cooldowns, separate buttons (Q, E, ...)

All slots together form the **build**. You can have more auras in the spellbook than slots — you actively choose.

```
  SPELLBOOK (everything found)           BUILD (actively selected)
  +-----------------------+              +-----------------------+
  | Damage Aura     Lv 4  |              | Active slots:         |
  | Heal Aura       Lv 2  |   ------>    |   [1] Damage Aura     |
  | Tank Aura       Lv 1  |              |   [2] Heal Aura       |
  | Speed Aura      Lv 3  |              |   [3] Light           |
  | Light           Lv 1  |              |   [4] —               |
  | Torch (pass.)   Lv 2  |              |                       |
  | Swift (pass.)   Lv 5  |              | Passive slots:        |
  | Attack (CD)     Lv 3  |              |   - Swift             |
  | Flee   (CD)     Lv 1  |              |                       |
  | ...                   |              | Cooldown slots:       |
  +-----------------------+              |   [Q] Attack          |
                                         |   [E] Flee            |
                                         +-----------------------+
```

### Aura Behavior

- Always exactly **one** active aura on at a time, switchable mid-fight
- **Damage and healing:** tick-based (interval varies per aura), target picking via selector + target count (see Targeting)
- **Buffs/debuffs** (Tank, Speed, ...): constant, not tick-based

### Base Auras

Simple single-effect auras. Examples: Damage, Heal, Tank (damage reduction), Speed, Cooldown Reduction, XP Boost, Revive, Campfire-Build, Light.

Each base aura is leveled separately with skill points. **What a level-up improves is defined individually per aura** — more damage/healing, larger range, more targets, faster tick rate; multiple axes at once are also possible. *Balance note for the content pass: "more targets × more damage per target" on the same aura is the most dangerous multiplier — use deliberately.*

> The complete list of base auras is still TBD. See Appendix A for collected spell ideas.

### Combinations

Specific combinations of unlocked auras, passives, and cooldowns — each at specific levels — unlock new auras, passives, or cooldowns.

Three important properties:

- **Cross-category:** a combination can mix auras, passives, and cooldowns arbitrarily.
- **Arbitrary levels:** components can be required at different levels — an aura at level 7 combined with a passive at level 3.
- **Arbitrary unlock type:** the result can be a new aura, a new passive, or a new cooldown — independent of the components.

**Examples:**

- Damage(5) + Heal(5) → "Damage+Heal" aura
- Swift passive(3) + Heal aura(7) → new aura
- Fire Strike aura(8) + Ice aura(2) → new cooldown
- Fire Strike aura(5) + Fire Shield cooldown(5) + Swift passive(5) → Pyromancer aura

Combinations can also have other combination unlocks as ingredients (few, manually designed).

Combination recipes are **fixed and curated** — not algorithmic. They are documented nowhere in-game; players experiment and share their findings online. All unlocks from combinations are leveled separately.

### Cooldown Abilities

Temporarily modify the next tick or the active aura. Examples:
- **Attack:** next tick deals 2× damage. CD 10 s
- **Flee:** radius −80%, speed +80%. CD 60 s
- **Ultimate:** massive single burst, heavily reduced radius. CD 60 min

### Damage Types

Damage types enable thematic combo auras and interesting mob resistances. Mobs have resistances against certain types and deal damage of a certain type themselves. Example: a Fire Strike aura deals fire damage, which fire-resistant mobs are less vulnerable to.

**Mechanic built** (item 11 Phase 2, see `plan-item11-hp-resist-variance.md`): types are **arbitrary string tags** (no fixed enum — bespoke tags like "this one specific lava" are possible too), default tag `physical`, resistances are multipliers (0 = immune, >1 = vulnerable). The concrete type list is content ([PLACEHOLDER]) — fire, ice, physical as the starting point; assignment happens in the content pass (roadmap item 12).

### Visual Representation

Circles that fill clockwise, tick when full. The circle reads as a **range indicator**, not as a hit zone: each tick, a **hit effect on the actually struck target** shows who the aura is hitting — for slow-ticking auras e.g. a sword slash over the target, for fast-ticking ones (fire) a constant effect on the target. This keeps single-/few-target inside the big circle intuitively readable.

*Deferred:* sticky targeting against target flicker with nearest (keep the target until it dies or leaves range) — build only when the flicker actually bothers. Visualizing overlaps of multiple player auras is also still unsolved.

---

## 5. Progression

### Level & XP

- Start at level 1 in the starting zone
- XP for everyone involved in a fight (damage, healing, buffing)
- Low-level mobs stop giving XP beyond a certain level gap
- Higher mob level → more XP
- Every level: more slots, more skill points

### Milestone Unlocks

Guaranteed unlocks at certain levels. Draft:

| Level | Unlock |
|---|---|
| 1 | Damage Aura |
| 2 | Heal Aura |
| 3 | Tank Aura |
| 4 | Cooldown ability (first) |
| 5 | First skill point |
| 5+ | Skill points on level-up |

*(The currently implemented [PLACEHOLDER] assignment differs and lives in the
`api/skills/` milestone data / CLAUDE.md → Current state; this draft remains
the design intent for the content pass.)*

### Skill System

- Skill points on every level-up (roughly 30 at max level — balancing TBD)
- Points can be invested in any unlocked aura, any passive, any cooldown
- Only what has already been found can be skilled — new unlocks start at level 1
- What a level-up concretely improves (damage/healing, range, target count, tick rate) is defined per aura (see section 4)
- Certain level combinations of unlocked auras/passives/cooldowns unlock new content (see section 4)
- No fixed class path

### Respec

Possible. **Cost:** the entire current level progress (XP within the current level back to 0).

Since death has the same effect, you can respec for free right after dying.

### Meta-Progression: Character Sacrifice

"Sacrificing" a max-level character (lore: sacrifice vs. sending them away à la Arc Raiders, still open) permanently unlocks **account-wide**:

- New base auras (e.g. Speed aura)
- Unique auras/effects not obtainable any other way
- Cosmetic unlocks (avatar portraits)

New characters benefit from all previous sacrifices.

---

## 6. Spellbook & Unlocks

The **spellbook** is the collection of all auras, passives, and cooldowns a player has found. The active build is chosen from it.

There are five ways to get new entries:

1. **Milestone unlocks** — guaranteed at certain levels (see section 5)
2. **Monster kill unlocks** — certain (not all) enemies drop auras or passives on death
3. **World exploration** — via clue anchor points in the world (see section 7)
4. **NPC teaching** — peaceful NPCs teach a specific aura on approach. Often thematically tied to nearby mobs that can only be damaged by exactly that aura (see section 8 → harvest mobs)
5. **Meta-progression** — character sacrifices unlock new base auras account-wide (see section 5)

---

## 7. Game World

### World Design

Persistent shared open world, multiple connected zones for different level ranges. Inspiration WoW Classic: slow escalation in tone, difficulty, and story weight — from a small nobody in the woods to dragons and undead only very late.

The world is sketched by the designer and built by hand — not algorithmically generated. Environmental storytelling is central.

### Zones

Each zone has:
- Its own area chat (only for players in this zone)
- Its own terrain: grass, desert, cobwebs, lava soil, etc.
- Its own decoration, mobs, geometry (caves, rivers, open spaces)
- Its own sounds / soundtrack (aspirational)

### Open-World Dungeons

No instances. WoW-Classic-style caves in the open world. Players know them and return together.

### Darkness & Light

Certain areas (caves, tunnels between zones) are dark — field of view heavily restricted, similar to caves in older top-down games. The tunnel between zone 1 and zone 2 is the first such area and serves as a natural tutorial for the role concept.

**Decided: darkness is purely visual.** It restricts vision but has no effect on damage, hit chance, or aura behavior — in the dark you *can* be hit, you just *see* poorly. The value of the light role is vision for the group (positioning, dodging, spotting targets).

Solutions for darkness:
- **Light aura** (active, obtainable early) — forces the trade-off: light or damage. Can be directed at others (support light).
- **Torch passive** (unlockable later) — permanent light without blocking an active slot.

See Appendix A.

### World-Exploration Clues

Every zone has 1–n **clue anchor points** pointing at hidden rewards — always obfuscated, no quest-marker feeling.

Clue types:
- Signs / inscriptions (*"Way of the Warrior"*)
- NPC dialogue (*"Back there are trolls who know a lot about heal magic"*)
- Environmental details (altar, symbol, sound)

**Rewards** are exclusively: actives, passives, cooldowns, XP. No loot, no items.

The clue's wording and the reward must fit together logically in hindsight — not obvious, but comprehensible. No quest log, no markers.

```
   Sign in the woods              NPC in the village
   +-----------+                 "Back there are trolls
   | Way of    |                  who know a lot about
   | the       |                  heal magic..."
   | Warrior   |                        |
   +-----+-----+                        |
         |                              |
         v                              v
   short dungeon                  troll territory
         |                              |
         v                              v
   DPS aura unlock              Heal Magic cooldown unlock
```

### Special Events

An endgame boss kill triggers a one-time world event. Example: a puddle spawns, standing in it for 10 seconds = rare aura unlock, gone afterwards. Can be "stolen".

---

## 8. NPCs & Mobs

- Fixed spawn points, designed world (no procedural generation)
- Patrolling mobs with a max chase distance
- Mobs have their own auras — line-of-sight and targeting rules apply to them too
- Mobs have resistances and their own damage type (see section 4)
- No item drops — only XP and occasionally aura unlocks

### Mob Types

| Type | Description |
|---|---|
| Normal | Solo-doable for a level-appropriate player |
| Elite | For groups, more XP |
| Boss | Strong elite in special places |
| Endgame boss | Raid-level, triggers a special event |
| Harvest mob | Stationary, peaceful or passive. Only damageable by one specific aura (often learned via NPC teaching, see section 6). Gives lots of XP, slow respawn. Example: turnips on a farm field that only the "Turnip-Pull" aura can damage. |

### Quest-like Content Through Existing Systems

Aura + mob resistance + NPC teaching together yield an implicit quest system without needing a dedicated one. Schema:

```
  Peaceful NPC  ───── teaches ─────►  Specific aura
        │                                     │
        │ thematically stands                 │ is the only source
        │ near                                │ of damage against
        ▼                                     ▼
   Harvest-mob population  ◄── only harvestable with it ──┘
   (gives lots of XP)
```

Examples of possible variants:
- Farmer + Turnip-Pull aura + turnip field
- Fisherman + Fishing aura + fish in the lake
- Lumberjack + Wood-Chop aura + trees
- Miner + Prospecting aura + ore veins

Effect: a soft "profession" identity without a class system, plus an incentive to explore the world to find special NPCs.

---

## 9. Multiplayer & Cooperation

- Persistent shared world — everything visible, everything shared
- No formal groups in v1 — everyone involved in a fight gets XP
- No PvP initially (5 years out at the earliest)
- No griefing possible by design

### Role Design

**Players cover each other's gaps and fill roles — for all larger challenges this is essential, not optional.** The slot system forces specialization; cooperation fills the gaps.

Examples:
- Light support in the tunnel — one player carries the Light aura, others damage
- Heal support at the boss — the classic tank/DPS/heal dance
- Speed buff while fleeing — see "Fly, You Fools!" in Appendix A

---

## 10. Art Direction & UI

### Art Direction
- **No pixel art**
- **Fully top-down** — exactly from above, not 2.5D, not isometric
- Low-poly with icons for abilities, portraits for players/NPCs
- References: Hotline Miami, Gods Trigger, Monaco, Rimworld, Gothic 1+2
- System first, not presentation first

### UI Elements (v1.0)
- Resource bar
- XP bar
- Ability bar (active slots 1–4, cooldowns Q/E/...)
- Aura panel (currently selected build from the spellbook)
- Minimap
- Zone chat

```
  +-------------------------------------------------------+
  | Zone: Whispering Wood                    +---------+  |
  |                                          | Minimap |  |
  |                                          |   . P   |  |
  |              .  M  o                     |    .    |  |
  |             [P]                          +---------+  |
  |              ~~                                       |
  |                                                       |
  |                                                       |
  |  Resource [============              ]                |
  |  XP       [===                       ]                |
  |                                          +----------+ |
  |  [1][2][3][4]    Q   E                   | Chat ... | |
  +-------------------------------------------------------+
       Active slots   Cooldowns
```

### Movement Controls
Mouse or WASD — still open.

---

## 11. Scope v1.0

**Must have:**
- [ ] Accounts (register/login)
- [ ] Aura system (base auras, cooldowns, first combos, targeting: selector + target count)
- [ ] Spellbook with milestone and monster unlocks
- [ ] Progression (level, skill system, slots)
- [ ] Persistent world
- [ ] 2–3 zones
- [ ] Mob types: normal, elite, boss
- [ ] UI: resource bar, XP bar, ability bar, aura panel, minimap, zone chat
- [ ] Line-of-sight for auras
- [ ] Campfire

**Not in v1.0:**
PvP, formal group system, economy, mobile, endgame raid events, character sacrifice (nice to have)

---

## 12. Open Design Questions

*(Technical questions: see the separate tech document.)*

### Mechanics
- [ ] Name of the resource (Essence / Focus / Power?)
- [ ] Exact slot count per category and growth per level
- [ ] Are passive and cooldown slots the same thing?
- [ ] Skill points per level final (currently ~30 at max level envisioned)
- [ ] Concrete max level
- [x] ~~Does every aura hit everything in range?~~ → **Decided:** selector + target count per aura; default nearest, base auras capped; AoE-all as a late unlock (see section 4, Targeting)
- [x] ~~lowest-HP absolute or percentage?~~ → **Decided:** percentage (relative to max resource)

### World & Content
- [ ] Which base auras exist concretely (complete list)
- [ ] Per aura: define selector, initial target count, and level-up axes (content pass)
- [ ] Work out the fixed combination recipes (mechanic built — Phase 9; first recipe: PaladinAura)
- [ ] Define the damage-type *list* (fire, ice, physical, ...) — the *mechanic* (string tags, resist multipliers) is decided + built (see section 4, Damage Types)

### Controls & UI
- [ ] Movement controls: mouse or WASD?
- [ ] Aura visualization on overlaps

### Meta
- [ ] Seasonal vs. permanent servers?
- [ ] Lore: sacrifice vs. sending away?

---

## Appendix A — Spell / Aura / Cooldown Ideas (Collection)

Unsorted idea list, grouped by category. Not final — for experimenting and iterating.

### A.1 Active Auras

| Name | Effect | Note |
|---|---|---|
| Fly, You Fools! | Increases move speed of all allies in radius. The caster is not buffed / stays behind. | LotR ref, risk/reward for support |
| Purple Rain | Colors everyone in range purple. No combat use. | Pure flavor/meme |
| Light | Creates light in dark areas. Can be directed at others (support light). | Early game, zone 1 → 2, no combat effect |
| Fire Strike | Fire damage to the lowest_health target (percentage) in range. | Pyromancer combo component, example of the lowest_health selector |
| Long Range Execute *(working title)* | Very large radius, very slow tick, high damage to the proportionally lowest target. **Hard single-target cap** — never hits multiple targets, regardless of level. | Example of a per-aura selector + fixed cap |
| Turnip-Pull | Damages exclusively turnip mobs on a field. No effect on other mobs. | NPC teaching (farmer), harvest-mob example |

### A.2 Passives

| Name | Effect | Note |
|---|---|---|
| Torch | Permanent light around the caster. | Resolves the light trade-off, zone 2+ |
| Swift | +5% move speed. | Pyromancer combo component |

### A.3 Cooldowns

| Name | Effect | Note |
|---|---|---|
| Fire Shield | For 30 s, reflects 20% of incoming damage. | Pyromancer combo component |
| Heal Magic cooldown *(working title)* | Restores the caster's own resource. | Reward from the troll territory (clue anchor point); **the only path to self-healing** — heal auras never heal the caster |

### A.4 Combination Recipes

| Result | Recipe | Note |
|---|---|---|
| Paladin aura | Damage(3) + Heal(3) | Does both, but weaker than each alone. **Shipped** (Phase 9) as Damage(5) + Heal(5) [PLACEHOLDER], values 70% of the base auras |
| Pyromancer aura | Fire Strike(5) + Fire Shield(5) + Swift(5) | Cross-category example |

### A.5 Mob Ideas

| Name | Note |
|---|---|
| Trolls | "Well versed in heal magic" — enable the Heal Magic cooldown unlock |
| Turnips | Stationary harvest mobs on farm fields. Only damageable by the Turnip-Pull aura. Lots of XP, slow respawn. |

### A.6 Zones / World Locations

| Place | Note |
|---|---|
| Tunnel zone 1 → zone 2 | First dark area, natural light tutorial |
| Caves in general | Dark, Pokémon-cave style |
| "Way of the Warrior" sign | Clue location, leads to a short dungeon with a DPS-aura reward |
| Troll territory | A clue NPC leads there, reward = Heal Magic cooldown |
| Farm with turnip field | Peaceful farmer NPC teaches the Turnip-Pull aura. The field next door = stationary turnip mobs. Harvest-mob example. |
