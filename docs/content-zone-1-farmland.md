# Content — Zone 1: Farmland & Village

**Design intent for Zone 1.** What the starting zone is supposed to *be and
do*: flow, points of interest, cast, quests, and the XP it pays. Exact runtime
positions live in the zone JSON authored in Tiled and are never mirrored here.
Numbers are [PLACEHOLDER] unless marked FINAL.

⭐ **This doc is the source of truth for Zone 1 design intent** (PO
2026-10-02: Zones 1 and 2 are separate docs). It was §2 of
[`content-zone-design-guide.md`](content-zone-design-guide.md), which keeps the
material both zones share: the truth table, the primitives (§1), the
cross-zone rules (§4), assets (§5) and seamless adjacency (§7). ⚑ **Section
numbers are kept from the combined guide** (§2.0–§2.6), so the many code and
content comments citing `content-zone-design-guide.md §2.x` resolve here
unchanged. Zone 2 is [`content-zone-2-woodland.md`](content-zone-2-woodland.md).
How the XP numbers are derived, for every zone: [`plan-xp-progression.md`](plan-xp-progression.md).

## Where Zone 1 is

**Regions** (PO 2026-10-02): **Farmlands** ("Home and Hearth", `Fields`) and
**Saltgrass Strand** ("Sea and Salt", `Coast`, the thin beach on the north
edge). Plus two interiors entered through a `CaveMouth` in the Farmlands:
**Reinhard's barn** (`barn.json`, the Giant Rats) and **the tunnel**
(`tunnel.json`, Dire Wolves).

⛔ **Brackenfold Meadows is leaving Zone 1** (PO 2026-10-02: "zone 1 is
primarily farmland and the strand"). The map fix is owed and not done: the
region is still in `world.json` south of the Farmlands, and
[`content-world.md`](content-world.md) still lists it under Zone 1 until the
fix lands. Where it goes is a map call. It takes its level 3–5 predators
(Wolves, a Dire Wolf, a Bear) with it, but ⭐ **not the Alpha Boar: it stays in
Zone 1** (PO 2026-10-02), so the map fix re-places it in the Farmlands, and
`the-sounder-at-the-mill` stays a Zone 1 quest.

⚑ **The tunnel does not fit the band.** Its 10 Dire Wolves are level 14 in a
zone that ends at level 6. Either it is a deliberate "come back later" danger
or the tunnel belongs to a later band; open, and part of the spawn-level
discussion (`plan-xp-progression.md` §8).

### As built vs. this doc (census 2026-09-30, re-read 2026-10-02)

**Built:** the homestead with Eliza, Hendrik and Benjamin, the starting
campfire, level 1–2 stags and a beet patch (§2.0) · Reinhard, the `Barn` prop
and the barn interior · the mill with the Miller · Town Crier, Shepherd,
Farmhand, the three sheep and the Dog · fence paths, gates, wheat and
ploughed-field polygons · `BrokenFence`, `BurntCart`, `RuinedHouse` props ·
the Memorial Stone · 20 Seaweed heaps on the Strand.

| Topic | This doc says | The map has |
|---|---|---|
| River | Along the **south**, one bridge on the road (§2.2) | Runs **north–south along the Zone 1 / Zone 2 seam**, crossed by several bridges |
| Atmosphere | Essentially none (§2.3) | Farmlands carries `Fairy Dust` |
| Village square | 4–6 Houses around the hub (§2.4) | Two Houses and two Cottages, split between the homestead and the farm |
| Regions | Farmlands + Saltgrass Strand | Brackenfold Meadows still painted as Zone 1 (above) |

Re-run `node scripts/zone-census.mjs` instead of trusting this table.

---

## 2. Zone 1 — Farmland & Village

**Level range** 1–6 [PLACEHOLDER]. **Theme**: open, bright, legible. The zone
whose job is to teach, not to threaten.

### 2.0 The opening arc — home, before the village exists

⭐ **This is the first five minutes of the game, and it is a POI the player
starts *inside*, not one they walk to.** A homestead west of Reinhard's farm,
off the road's west end. Three relatives live here, and between them they hand
over the entire starting kit. The quest is `dinner-for-the-family`.

**The design problem it solves.** Before this existed a new character spawned in
the village square holding exactly one skill — the level-1 `Damage` milestone —
and every teacher was optional scenery. Nothing in the world *required* the
player to learn anything, so the first hour taught by accident or not at all.
The arc makes the three foundational verbs — **fight, gather, heal** — into
three errands for three people you are related to.

The quest has **one objective stage, and both errands run in parallel inside it**:

| Stage | Objective | Who | What it teaches | Why it cannot be skipped |
|---|---|---|---|---|
| `gather` | talk | **Hendrik**, your father, a hunter | **Wild** @L1 | Soft — a `talk_to` objective. You must open his panel; taking the skill is your choice |
| | kill 3× **Stag** | | that a fleeing target is a *positioning* problem | — |
| | talk | **Benjamin**, your uncle | **Harvest** @L1 | Soft — a `talk_to` objective |
| | harvest 6× **Beet** | | that not everything is killed | ⛔ **Hard.** A Beet carries the Turnip's `{"*": 0}` + `gateKeys: ["harvest"]` lock, so **no combat aura can touch one** until Harvest is learned |
| `home` | talk | **Eliza**, your mother | **FirstAid** + 150 XP on the turn-in | — |
| `done` | — | — | — | Her completed-greeting points east to Reinhard |

⭐ **The two lessons are deliberately asymmetric, and that asymmetry is the
teaching.** Hendrik's Wild is an *upgrade you may decline* — `Damage` alone
kills a stag, so the lesson is "there is a wider ring, and it costs resource."
Benjamin's Harvest is a *key*: swinging at a beet does literally nothing. The
player meets an optional trade and an absolute lock inside the same five
minutes, which is the whole shape of the game's skill economy in miniature.

⚑ **Parallel means unordered.** A stage's objectives are AND-ed with no order,
so the player can do either errand first — and can kill the stags *before*
visiting Hendrik (the talk still has to happen before the stage completes).
The beets need no ordering rule: the harvest lock orders them by itself.

⚑ **`gather` authors no `tracker`, and must not.** A stage tracker replaces
every derived line with ONE, and substitutes `{n}/{m}` from the **first
countable** objective only — it could show the stags or the beets, never both.
Left underived, the journal shows one line per objective, each with its own
live count and a ✓ on a finished talk. ⚑ The cost is the deriver's wording:
`Talk to the Hendrik`, `0/3 Stag slain`, `0/6 Beet harvested`. Fixing that
needs a per-objective tracker in the quest format, which does not exist yet.

**The stag is the right first target and the reason is mechanical.** It authors
`fleeBelowHealthRatio: 1`, so it bolts the instant it is hurt and **never
fights back** — there is no lethality at any level. It moves at
`0.055 × 0.85 = 0.04675`/tick against the player's `0.05`: a 7 % edge, so the
kill is a chase the player wins by *staying in the ring*, not by out-damaging
anything. That is the first lesson an aura game should teach.

✅ **PLACEMENT, done in the rebuilt world** (census 2026-09-30: level 1–2 stags
and a beet patch around the homestead, the start campfire beside it). The
reasoning stays because it is what the next re-placement must not undo. Author
the homestead stags at **level 1–2**. Spawn level is a per-spawn override, so this
is a placement decision and touches no definition:

| Stag spawn level | HP | L1 player's Damage aura |
|---|---|---|
| **1** | 35 | 3 ticks = **4.0 s of contact** |
| 14 *(the north-pasture herd)* | 153 | 11 ticks = **14.7 s of contact** |

A level-14 stag is killable at level 1 — it cannot hurt you — but it is
**eleven re-closes of a 1-unit ring** per animal, and that is not the game's
first fight. The pasture herd stays where it is; the homestead needs its own
low-level spawns (**3–4**, for a count of 3), plus a **Beet patch of 8–10** (for 6).

⚑ **Cast the homestead with three reskins, not three sprites.** Eliza reuses
`VillageHealer`, Hendrik reuses `Wanderer`, Benjamin reuses `Farmer`, and the
Beet reuses `Turnip` — the standing placeholder-art call (Shepherd / Miller /
Farmhand precedent). Four bespoke sprites for the tutorial would spend four
wire enum values that can never be reclaimed, before anyone has seen whether
the arc works.

⭐ **The handoff is content, not a corridor.** Eliza's greeting after dinner is
a `quest_at_stage … completed` node sitting **above** her unconditional root
(L3: a conditional node must outrank the greeting), and it says to follow the
road east to Reinhard. That is the seam between §2.0 and the rest of the zone:
the arc does not gate the road, it *aims* the player down it.

### 2.1 Story beat, restated as a *spatial* problem

The bible says: the villages are idyllic, but predators are being pushed out of
the forest by bandits hiding in it. **That is a geography statement, and the map
has to carry it without a word of text.** The design consequence:

- The zone reads **safe in the middle, worse toward the treeline.** Danger is a
  gradient pointing *at one edge*, and that edge is the door to Zone 2.
- Wildlife appears **where it does not belong** — a boar in the ploughed field,
  a wolf at the fence line — not deep in the woods where a player would expect
  it. The wrongness is the story.
- Bandits are **never seen in Zone 1**, only their traces: a burnt cart, a
  looted wagon, tracks leading into the trees. First contact is the woodland
  edge.

### 2.2 Layout skeleton

```
        N  <- open pasture, stags, nothing hostile (the "safe" lesson)
        |
   +====+================+
   |  HOMESTEAD (start) -> VILLAGE -- road --+-->  E: outer farms, then the TREELINE (-> Zone 2)
   |  (startingSpawn)      (campfire)        |
   |      |                                  |
   |   TURNIP FIELD                          |   S: river + mill, boars, soft dead end
   +=========================================+
```

⚑ The skeleton is intent. The built map runs the river north–south along the
Zone 1 / Zone 2 seam instead ("As built vs. this doc", above).

Authoring shape:

- One `region` of **Fields** over the whole zone. The rest is paint on top.
- A **Road** path (width ~2–2.5 u) running W→E through the village and out to
  the treeline. It is the zone's spine and the player's compass: *the road
  always leads to the next zone.* Keep it unbroken and unambiguous.
- A **Water** path for the river along the south, blocking, with one **bridge
  gap** on the road. The gap is the only crossing — that is what makes the south
  a pocket rather than an escape.
- **Hedgerow / fence** = `paths` wearing the **`Fence`** profile, **blocking**,
  ringing each field. They do the single most valuable job in a starter zone:
  **they make the space read as cultivated** and they gently rail the player
  along the road without a wall.
  - ⛔ **`alignTexture: true` is not optional on a `Fence` path.** It is the
    only directional profile in the table: without the flag the rails lie
    *across* the fence, and nothing warns you.
  - ⚑ **Width `0.40`, and one path PER STRAIGHT LEG** — not one closed ring
    per field. The angle is derived from a path's longest segment, so a bend
    gets its dominant leg and the short one is wrong. That is also how a fence
    is built: the corner is where the post goes.
  - ⚑ `blocksMovement` defaults to **false**, so an unset fence is decorative
    and the wolves walk straight through it.
- **A gate** is the `Gate` prop dropped in a GAP between two fence legs. It is
  the one prop here that does not block — the fence is the wall, the gate is
  the door — and it is drawn standing open to say so. Rotate it to match the
  fence's direction.
- **The broken fence POI** is two fence legs with a gap, the **`BrokenFence`**
  prop in the gap, and the wolves beyond it.
  - ⚑ **This bullet used to say "no damaged art needed, and it reads better
    than any would."** That was wrong, and the reason it was wrong is worth
    keeping: a bare gap is **indistinguishable from a gate gap or an
    unfinished run**. The break has to be *drawn* or the player reads a hole,
    not a story (PO 2026-09-21).
  - ⚑ It has the **same 2.0 × 1.6 body as `Gate`, on the same centreline**, and
    is non-blocking for the same reason — the wolves got in through it, so the
    player must be able to follow. Author the gap once and drop **either** prop
    in it: the gate is the way in you *built*, the break is the way in
    something *made*.
  - ⭐ **It has a direction.** Everything loose in the art is pushed to one
    side, so the prop's rotation says which way the thing came through. Point
    it *into* the field.
- **Field plots** = `structures` with the Fields/Suburbs profile at a different
  tint, non-blocking, rectangular-ish and *aligned to each other*. Straight
  parallel edges are the whole visual language of farmland; anywhere else in the
  game, straight is wrong.
- **The treeline** is a thick band of Tree props plus a blocking `polygon` mass
  behind them, pierced only at the designed crossing(s). **One is a defensible
  choice *here specifically*** — Zone 1 is the tutorial and a single unambiguous
  door is a feature — but it is a choice, not a rule; see the guide's §4 rule 2. (This is
  the shipped seam-ridge trick, verified by flood-fill.)

### 2.3 Atmosphere

Zone 1 should be **the only zone with essentially no atmosphere authoring** —
that is what makes Zone 2's canopy land. Two exceptions worth having:

- A thin `Fog` haze over the river at dawn, low opacity, drifting. Free
  atmosphere, sells "morning".
- A shallow `Canopy` band **just inside the treeline**, so walking to the Zone 2
  door visibly darkens before you arrive. It is a threshold, not a hazard.

### 2.4 Points of interest (5–7, no more)

| POI | Purpose | Contents |
|---|---|---|
| **The homestead** *(§2.0)* | ⭐ The opening arc — where the player starts, and the whole starting kit | Eliza, Hendrik, Benjamin; the `startingSpawn` campfire; 3–4 **L1–2** Stags; an 8–10 **Beet** patch. The road east leaves from here |
| **Village square** | Hub, respawn, quest wall | Campfire, 4–6 Houses, Reinhard, Town Crier, village healer. ⚑ This row used to put the `startingSpawn` fire here, contradicting §2.0; the homestead owns it, as the built map does |
| **Turnip field** | The first 90 seconds | Turnip harvest-mobs, Reinhard's chore quest |
| **Reinhard's barn** | ⭐ The zone's first *aggressive* fight | `Barn` prop + 10–12 **GiantRat**; `giant-rats-in-the-barn` on Reinhard. ⭐ Built as an **interior**: the rats live in `barn.json`, entered through a `CaveMouth` at the barn door (the underworld's door mechanism, `plan-underworld.md`). ⚑ His boars are prey faction and wait to be provoked — a rat comes at you |
| **North pasture** | Teaches *neutral* | Stags + boars, zero hostiles, a herder NPC |
| **The broken fence** | Teaches *hostile* | 2–3 Wolves that got in through a `BrokenFence`; visible from the road |
| **Burnt cart / looted wagon** | The bandit breadcrumb | Prop dressing + a corpse + a signpost. No mob. |
| **Mill on the river** | Soft dead end, side reward | Miller NPC, a boar sounder, a chest-equivalent |
| **Treeline gate** | The door | Signpost, a guard or wanderer who warns you, the Zone 2 quest giver |

### 2.5 Cast (zone 1)

Existing: `Turnip`, `Beet`, `Boar`, `Stag`, `Wolf`, `GiantRat`, `Bandit` (traces only),
`Reinhard` (the Farmer, **renamed 2026-09-23**), `Eliza`, `Hendrik`, `Benjamin`,
`TownCrier`, `VillageHealer`, `Wanderer`, `Dog`, `Campfire`.

⚑ **`Farmer` is now two different things and the distinction bites.** `Reinhard`
is the DEFINITION NAME — what zone spawns, quest `talk_to` targets and
`GetByName` resolve against. `Farmer` survives as the **wire EntityType**, worn
as an `entityType` override by Reinhard himself, Benjamin, the Miller, the
Shepherd and the Farmhand. Renaming the def silently broke his sprite, because
a def with no override resolves its art BY NAME; the override is the repair.

~~**Missing and needed**: an **Alpha Boar** … and a **Herder/Shepherd** NPC~~ —
**both now authored.** The `Shepherd` shipped with the north pasture as a Farmer
reskin, exactly as this line proposed. The **`AlphaBoar`** shipped as Zone 1's one
elite (curveLevel 6, `wildlife_prey` so the mill fight is *chosen*, paying for
4.55× the Wolf's HP with 0.71× its speed) — but ⭐ **with its OWN sprite, not the
`entityType`-variant shortcut this line proposed**: `wildboar_alpha.png` already
existed, and an elite whose only tell is the health bar is one the player cannot
decide to avoid from across the field. Its POI partner, the **`Miller`**, is a
Farmer reskin like the Shepherd and offers `the-sounder-at-the-mill`.
✅ **Both are placed** in the rebuilt world: the Miller at the mill in the
Farmlands, the Alpha Boar across the river in Brackenfold Meadows (census
2026-09-30).

### 2.6 Quests (from the bible, mapped to what exists)

0. ⭐ **The opening arc** — `dinner-for-the-family.json` ships (§2.0). It runs
   *before* everything below and is the only quest in the zone that exists to
   hand over skills rather than to reward a deed. It ends by pointing at (2).
1. **MAIN: Report to the City** — accepted in the village, completes three zones
   later. Its Zone 1 leg is simply "reach the treeline"; the map does the rest.
2. **Tend to the Farm** — `turnip-chore.json` ships; keep it.
3. **Kill the Wildlife** — `boars-in-the-field.json` + `wolves-on-the-road.json`
   ship; keep both, they are exactly the bible's beat.
3b. ⭐ **Giant rats in the barn** — `giant-rats-in-the-barn.json` ships, and it
   makes Reinhard the zone's first **three-offer giver**. Its job is the
   *escalation the other two do not teach*: the turnips do not fight, the
   boars fight back, and the rats come to you. ⚑ **'Between boar and wolf' is
   a threat profile, not a curve slot** — both of those author `curveLevel: 2`,
   so there is no level gap to sit in. The GiantRat is cL2 too, and what sits
   between them is speed (0.62 vs 0.55 / 0.7), sensor (2.2 vs 1.5 / 3) and
   body (0.25 vs 0.4 / 0.3), with 45 HP — below both, because a rat is a barn
   full of them rather than a duel.
   ⛑ **It has no art**: it draws `NpcPlaceholder` (red `?` on a purple disc)
   until an `EntityType` is appended and `api/schema/make.sh` is run — flatc
   is not installed on the dev box. Do not ship it to players as-is.
4. **Talk to People** — a 3-NPC "meet the village" chain. Cheap, and it is what
   makes a village feel inhabited. `village-welcome.json` is the seed.
5. **Bandit breadcrumb** — *new*: investigate the burnt cart, follow the tracks
   to the treeline. Zero combat. This is the quest that hands off to Zone 2.

⚑ The bible's "kill the bandits (and their leader?)" belongs in **Zone 2**, not
here — killing the antagonist in the tutorial zone spends him.


### 2.6a Quests that shipped after the list above

The list above is the bible's mapping. Three more Zone 1 quests ship:

- **`the-strays`** — the Shepherd: find the three sheep and the Dog (four
  talks, one ticked line each). 180 XP.
- **`the-sounder-at-the-mill`** — the Miller: kill the Alpha Boar, Zone 1's one
  elite. 370 XP. ⚑ Its target stands in Brackenfold Meadows today; it stays
  in Zone 1 and is re-placed in the Farmlands by the map fix (PO 2026-10-02).
- **`the-millers-ring`** — the Miller: search the Seaweed on Saltgrass Strand
  for his ring, the game's first chance objective (6 % a harvest, the 12th
  always finds). 216 XP.

⚑ **Two quests cross the zone line today.** `village-welcome` is offered by
the Hermit, who stands in the Deep Woods (Zone 2), and `wolves-on-the-road` is
offered by the Town Crier but turned in to the City Guard in Zone 2. ✅ Ruled
2026-10-02 (`plan-xp-progression.md` D5): a quest counts toward the zone
where it mainly takes place or is turned in, not where it starts. Both quests'
work is in the Farmlands, so **both count toward Zone 1** (a reading the PO may
correct); `village-welcome`'s giver then belongs in the village.

---

### 2.7 XP budget

How these numbers are derived is [`plan-xp-progression.md`](plan-xp-progression.md);
this section is its Zone 1 instance. All [PLACEHOLDER] until that plan's
decisions are ruled.

**Band 1 → 6**: a new character enters at level 1 and leaves Zone 1 as it
reaches level 6. **Budget 2232 XP** (300 + 360 + 432 + 518 + 622). **Target
split (PO 2026-10-02): about 80 % from quests, 20 % from kills** →
**quests ≈ 1786, kills ≈ 446**, measured on the critical path (every quest
once, no grinding; respawns are an overflow valve, not budget).

#### 2.7.1 What the map pays today (2026-10-02, Farmlands + Strand + barn)

Simulated at today's numbers (`killXP` base 20, the L9 half-level quest rule),
quests in story order, each kill paid at the player's level at that moment:

| Step | Quest XP | Kill / harvest XP | Running total | Level |
|---|---|---|---|---|
| `dinner-for-the-family` (3 Stag L1, 6 Beet) | 150 | 66 | 216 | 1 (72 %) |
| `turnip-chore` (5 Turnip) | 150 | 5 | 371 | 2 |
| `boars-in-the-field` (6 Boar L2) | 180 | 144 | 695 | 3 |
| `giant-rats-in-the-barn` (8 GiantRat L1) | 180 | 152 | 1027 | 3 (85 %) |
| `the-strays` (talks) | 180 | 0 | 1207 | 4 |
| `wolves-on-the-road` (8 Wolf L3; the 400 XP report is in Zone 2) | 0 | 232 | 1439 | 4 (67 %) |
| `the-millers-ring` (~9 Seaweed) | 216 | 9 | 1664 | 5 (9 %) |
| **Critical path** | **1056 (63 %)** | **608 (37 %)** | **1664** | **5, short of 6 by 568** |
| Everything else in the Farmlands, killed once | — | 461 | 2125 | 5 (83 %) |

Against the target:

- **The quests paid inside the Farmlands are 730 XP short** (1056 of 1786).
  ⭐ **Counted by the 2026-10-02 rulings, Zone 1 owns 1976**: the 1056, plus
  `wolves-on-the-road` (400) and `village-welcome` (150) under D5, plus
  `the-sounder-at-the-mill` (370) with the Alpha Boar staying. That is **190
  over** the 1786 target, and the problem becomes *where* it lands (§2.8), not
  how much.
- **Kills are 162 XP over** (608 of 446) on the critical path alone, and
  every kill beyond it overshoots further. The kill quests ask for 25 kills
  over 5 levels; at base 20 that is a third of the XP, not a fifth. The cure
  is global, not Zone 1's: `plan-xp-progression.md` D3.
- **Harvesting pays 20 XP in the whole zone** (Turnip, Beet and Seaweed carry
  `xpFactor 0.05`). ✅ Ruled to stay that way (`plan-xp-progression.md` D4):
  the quest pays for the harvesting.

### 2.8 Progression by quest area — DRAFT, for the PO to rule

A zone is split into **quest areas**: a hub (a campfire and its givers), the
quests it hands out, and the ground those quests send you to. Each area has
its own slice of the band, the areas chain, and **the area's band is what
decides the level of the mobs in it** (PO 2026-10-02; the spawn-level rule
itself is the next discussion, `plan-xp-progression.md` §8).

The draft follows the three campfires the Farmlands already has:

| Area | Hub | Band | Budget | Quests (80 %) | Kills (20 %) | Quests there today | Quest XP today | Gap |
|---|---|---|---|---|---|---|---|---|
| **A1 The homestead** | `spawnpoint-1`, Eliza | 1 → 2 | 300 | 240 | 60 | `dinner-for-the-family` | 150 | −90 |
| **A2 Reinhard's farm + the village** | `spawnpoint-3`, Reinhard, Town Crier, Miller | 2 → 4 | 792 | 634 | 158 | `turnip-chore`, `boars-in-the-field`, `giant-rats-in-the-barn`, `village-welcome` | 660 | +26 |
| **A3 The north fields + the Strand** | `spawnpoint-31`, by the beach | 4 → 6 | 1140 | 912 | 228 | `the-strays`, `the-millers-ring`, `wolves-on-the-road`, `the-sounder-at-the-mill` | 1166 | +254 |
| **Zone 1** | | **1 → 6** | **2232** | **1786** | **446** | | **1976** | **+190** |

⭐ **Revised 2026-10-02 after the D5 and Alpha Boar rulings.** Two placements
in it are proposals: `wolves-on-the-road` sits in A3 because its wolves
already stand in the north fields, around `spawnpoint-31`; the sounder sits
in A3 as the zone's capstone elite, wherever the map fix re-places the Alpha
Boar.

What the draft says, read off the gaps:

- **A1 is nearly right.** Its kill share is already exactly 20 % (3 stags =
  60 XP at base 20). It needs ~90 XP more on the turn-in, or a small second
  errand.
- **A2 is on target for quests** (660 of 634) and **kill-heavy**: its two
  kill quests ask 14 kills against a 158 kill share. Fixed by the global kill
  retune (D3, held), not by its quests.
- **A3 is over by 254, and the prices are the reason.** `wolves-on-the-road`
  (400) and the sounder (370) are priced for level 6+, `the-strays` (180) and
  `the-millers-ring` (216) for levels 2–3, all inside a 4 → 6 area. Priced
  by the L9 rule at A3's levels (259–311 each), the four come to
  ~1,040–1,240: still over, because four quests in two levels is more than
  the 1.6 per level D2 set. A3 holds about three at that price, so one of the
  four moves or shrinks. The re-price waits for the spawn-level pass, because
  the rule prices the target's level.
- **Givers vs. hubs.** The Shepherd stands at the homestead and the Miller in
  the village, but their quests send you north. A quest belongs to the area
  where its work happens; whether the givers move is a placement call.

Open for the PO: the area split itself (three areas, these boundaries), the
bands per area, and the two A3 placements above. ✅ Settled: the sounder stays
in Zone 1.
