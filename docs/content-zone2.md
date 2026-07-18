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
  → the front: Human Army vs Orcs, FrontCaptain teaches Vanguard @L20 (C5);
    Ork World Boss in the reserved west arena (C6)
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
  wolves/bears in and around the forest lanes.

## In-game since C5

- **The front** — the south strip (y > ~24.7 east of the seam): the C4
  south-road cap opened into a **checkpoint mouth** (middle GateWall
  removed, flanking pair stays); road south to the army staging area, then
  west toward the reserved boss arena and south-east to the S exit.
- **The unattended war** — soldier line (8 spawns, ~60 s respawn, XP 0)
  vs orc line (5 + 2 rear, ~2 min respawn, XP 15 — deliberately very low)
  with overlapping aggro across no-man's land; `human_army` is
  **friendly-to-players** (§9 lift 6: player damage skips soldiers
  entirely), orcs fight both sides.
- **Spike barricades** — 9 physical+bleed hazard fixtures (brazier
  pattern, XP 0, players-only by faction choice) in no-man's land + a
  funnel toward the **west arena (x 23–33) — reserved empty as the C6
  boss canvas**.
- **S exit** — road past the orc line's east flank to the south border,
  flanked by a GateWall teaser pair (the blocked Zone-3+ exit beat).
- **FrontCaptain NPC** — staging area, off-side of the road: teaches
  **Vanguard** (the Front-Aura, §A power outlier) level-gated **@L20**
  with a real TooLowLine (story-spine beat 6).

## In-game since C6

- **The Orc Warlord arena** — the reserved west arena (x 23–33) is live:
  boss home + two Warbanner totems + wave mouth placed via **zone
  anchors** (`anchors` in world.json, editor-movable — the encounter
  script hard-fails at boot if one is missing); light dressing = a
  5-boulder rim open to the east mouth and the south border (placement
  truth = world.json; PO polishes in the editor).
- **The encounter** (`encounter/warlord.go`, first designed script):
  invuln while a banner stands → grunt waves at 66/33% from the wave
  mouth → one-shot banner re-gate at 33% → burn. Wipe = plain leash +
  walk-home + full regen (script re-arms). Kill → server-wide broadcast
  with credit names + **Call for Aid** to all participants + recent
  healers (chance 1.0) → empty arena → ~5 min respawn + return
  broadcast.

## Deliberately open here

- Village purpose + village-healer purpose (§11 — Zone 2 session ruling
  still pending; the NPC is a spot reservation).
- Bandit-ranged replacement drop (§11, open since the Rally cut).
