# Content — Zone 2 (village + City Gates + the front)

**Design intent only.** This doc holds what Zone 2 is supposed to *be and
do*; exact runtime positions live in the zone JSON (`api/zones/world.json`)
authored/polished via the zone editor and are never mirrored here.
Conventions → `README.md` → Content. Everything is [PLACEHOLDER] until the
C8 balance pass. Zone 2 is the eastern half of the single `world` playfield
— a design label, not an engine object (plan-content-zones12.md §2).

## Intended flow

```
  Zone 1 → TWO crossings over the seam ridge:
    tunnel (north)      — SOLO path, dark, spiders (C3)
    middle road         — GROUP gate: the Bandit Horde (C4)
  → village (campfire = second respawn anchor; healer NPC, purpose open)
  → City Gates east: shut; guard passes word inside, points SOUTH
  → the front: Human Army vs Orcs, Front NPC, Ork World Boss (C5/C6)
```

## In-game since C4

- **Seam ridge** — a tree ridge along the Z1/Z2 seam funnels travel into
  exactly the two designed crossings (verified by flood-fill: plugging the
  road gap + tunnel mouth cuts Z2 off).
- **Bandit Horde (middle-road group gate)** — melee ×3 + ranged ×2 +
  **healer** (lowest_health heal_aura — out-heals a solo at-level player;
  kill-the-healer is the counterplay) + the **Rally-Drum drummer** (first
  authored shield_aura, allies-only; horde-only spawn; **Taunt kill-drop
  @1.0**). WoW-Classic resolution: no key-lock, stays open, trivializes
  over-levelled (~3 min shared respawn [PLACEHOLDER]).
- **Village** — 4 solid houses + the **Z2 campfire** (second fixed respawn
  point, GDD §3) on a small sand plaza; the village-healer NPC placed
  lore-only (purpose stays §11-OPEN); road runs through E-W.
- **City Gates** — GateWall rampart line east of the village; the road
  dead-ends into it. City guard NPC: lore-only quest completion + Zone 3
  teaser, points south. Blocked side roads N + S (GateWall clusters); the
  S stub is the C5 front approach.
- **NE dark forest + bandit camp** — thicket + darkness circles (the
  Light drop matters here — §12 single-source flag), navigable via carved
  lanes; the camp clearing holds melee ×4, ranged ×2, a healer and the
  **Elite Bandit** (first authored crit pair; drops **DamageBurst @0.5**).
  Approach breadcrumb: the blocked N road out of the village.
- **Wildlife density pass** — Z1-style scatter + prey near the village,
  wolves/bears in and around the forest lanes; the **south front strip
  (y > ~22 east of the seam) is deliberately empty — C5 canvas.**

## Deliberately open here

- Village purpose + village-healer purpose (§11 — Zone 2 session ruling
  still pending; the NPC is a spot reservation).
- Bandit-ranged replacement drop (§11, open since the Rally cut).
- The front, Front NPC, Front-Aura, spike barricades, S exit → **C5**;
  Ork World Boss → **C6**.
