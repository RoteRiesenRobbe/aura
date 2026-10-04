# Content — Zone 2: Woodland

**Design intent for Zone 2.** What the Woodland is supposed to *be and do*:
flow, points of interest, cast and quests. Exact runtime positions live in the
zone JSON authored in Tiled and are never mirrored here. Numbers are
[PLACEHOLDER] unless marked FINAL.

⭐ **This doc is the source of truth for Zone 2 design intent** (PO
2026-10-02: Zones 1 and 2 are separate docs). It was §3 of
[`content-zone-design-guide.md`](content-zone-design-guide.md), which keeps the
material both zones share (truth table, primitives §1, cross-zone rules §4,
assets §5, seamless adjacency §7). ⚑ **Section numbers are kept from the
combined guide** (§3.1–§3.5) so existing citations resolve here unchanged.
Zone 1 is [`content-zone-1-farmland.md`](content-zone-1-farmland.md).

⚑ **Owed: an XP budget and a progression by quest area**, the shape Zone 1's
§2.7–§2.8 set, per [`plan-xp-progression.md`](plan-xp-progression.md). Not
drafted until the PO rules on Zone 1's.

## Where Zone 2 is

**Region:** **Deep Woods** ("City Outskirts", `Forest`), east of the river.
The underworld's two surface exits come up here. ⚑ Brackenfold Meadows is
leaving Zone 1 (PO 2026-10-02); whether it joins Zone 2 is a map call, not
yet made.

### As built vs. this doc (census 2026-09-30)

| Topic | This doc says | The map has |
|---|---|---|
| Content | Kingsroad, wanderer's camp, bandit camp, kobold warren, bear hollow, sealed gate, dark tunnel mouth (§3.2, §3.3) | ~75 Wolves at level 4–5, one Dire Wolf (14), one Kobold (7), the Hermit, the Ascension Stone, two underworld exits. **None of the §3.3 POIs yet** |
| Levels | 6–12 [PLACEHOLDER] | Almost entirely 4–5 |
| Dark tunnel | Woodland's alternate route into the City, with the light tutorial (§3.2) | A Dire Wolf cave whose both mouths are in the Farmlands |
| Campfires | Never beside danger (guide §4 rule 7) | `spawnpoint-4` has about 20 hostile Wolves within 12 u (census warning) |

Re-run `node scripts/zone-census.mjs` instead of trusting this table.

---

## 3. Zone 2 — Woodland

**Level range** 6–12 [PLACEHOLDER]. **Theme**: dark, dense, disorienting, few
people. The zone whose job is to make the player *want* the city.

### 3.1 The design problem Woodland actually poses

A forest is the hardest zone type in a top-down game, because **trees are both
the art and the walls**, and a player who cannot see cannot navigate. Three
rules make it work:

1. **The kingsroad is always findable.** It is wide, it is a distinct profile,
   and it runs unbroken from the west entrance to the sealed gate in the east.
   Every time the player is lost, the recovery is "walk until you hit the road".
2. **Darkness is authored in bands, not blobs.** A corridor of `Canopy`
   atmosphere along a lane reads as *deep woods*; a circle of darkness in the
   middle of nowhere reads as a bug.
3. **Every dark area has a lit destination.** A `clearing` at the end of a dark
   lane is the reward and the landmark. This is exactly what `zone.clearings`
   was built for, and Woodland is its first real consumer.

### 3.2 Layout skeleton

```
   W entrance (from Zone 1)
        |
   =====+======= KINGSROAD ==================+
        |                                    |
   +----+-----+      +----------+       +====+====+
   | WANDERER |      | BANDIT   |       | SEALED  |  <- the gate. Shut.
   |  camp    |      |  CAMP    |       |  GATE   |
   +----------+      +----------+       +====+====+
        .  deep wood  .  kobold warren  .    |
                                        N detour --> (Zone 3)
                                        + DARK TUNNEL (alt. route)
```

- **Region**: `Forest` over the whole zone.
- **Kingsroad**: one `Road` path, width 3 u, W→E, **non-blocking**, dead-ending
  into the gate. Wide enough to be unmistakable.
- **The forest mass**: blocking `structures` — big, chunky, *not* jagged (collider
  budget) — with Tree props scattered densely on top of and around them. The
  polygons are the navigation; the props are the look. Never rely on prop
  colliders to wall a forest.
- **Lanes**: the negative space between polygons. Author them as deliberate
  corridors 4–8 u wide, branching off the road, each leading somewhere.
- **Canopy atmosphere** over everything *except* a band along the road and the
  clearings. `darkness` moderate + `haze` low; the haze is what makes it feel
  humid rather than merely dim.
- **Clearings** at every POI, `clears: both`.
- **The sealed gate**: GateWall prop line + a blocking polygon behind it, the
  road dead-ending into it, a guard NPC on the walkable side who explains the
  seal and points north. This is the bible's beat verbatim.
- **The dark tunnel** (alternate route into the city): reuse the shipped pattern
  — boulder-walled corridor, chained darkness, a *lit staging area* at its mouth
  so the player meets the tunnel's inhabitants in daylight first. It is also the
  natural home for the light-aura tutorial.

### 3.3 Points of interest

| POI | Purpose | Contents |
|---|---|---|
| **West entrance** | Threshold | Signpost, last campfire before the dark, the Zone 1 handoff |
| **Wanderer's camp** | The bible's "lost friend" quest | Wanderer NPC, campfire, clearing |
| **The lost friend** | Payoff, deep in the wood | A corpse + a survivor, off-road, dark lane |
| **Bandit camp** | The zone's group content | Melee/ranged/healer/leader (the shipped horde pattern), palisade = blocking closed path, clearing + firelight |
| **Kobold warren** | Solo dungeon-lite | Boulder ring, melee front / ranged back, hoard |
| **Bear hollow** | Environmental danger | A single high-level Bear in a lane you *can* avoid |
| **Dark tunnel mouth** | Alt route + light tutorial | Staging area, lamplighter/miner NPC, spiders |
| **The sealed gate** | The wall the zone is about | GateWall line, guard, north detour signpost |

### 3.4 Cast (zone 2)

Existing and reusable: `Wolf`, `DireWolf`, `EliteWolf`, `AlphaWolf`, `Bear`,
`DireBear`, `Boar`, `Stag`, `Bandit`, `BanditRanged`, `BanditHealer`,
`EliteBandit`, `Kobold`, `KoboldRanged`, `Spider`, `VenomSpider`, `GiantSpider`,
`Bramble`, `Wanderer`, `Hermit`, `Miner`, `Lamplighter`, `ForestSign`.

**Missing and needed**: **Goblin** (the bible names it beside Kobold; a distinct
sprite + definition), and a **bandit leader** as a named elite — `EliteBandit`
exists and can carry it with a name and a script, so this is content, not art.

### 3.5 Quests

1. **The lost friend** — the wanderer's quest, straight from the bible. Its real
   job is teaching the player to leave the road.
2. **Kill the bandits / kill their leader** — the group beat; the shipped horde
   is the template.
3. **Clear the warren** — `kobolds-on-the-road.json` ships.
4. **MAIN leg: find another way in** — the gate guard sends you to the tunnel or
   north. This is the zone's exit condition.

