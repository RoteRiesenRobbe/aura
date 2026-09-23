# Content — Level design guide, Zone 1 (Farmland & Village) + Zone 2 (Woodland)

**Design intent + authoring guide.** What the first two zones are supposed to
*be and do*, and how to build them with the primitives the engine actually
ships today. Exact runtime positions live in the zone JSON authored in Tiled
(`manual-tiled-editor.md`) and are never mirrored here. Numbers are
[PLACEHOLDER] unless marked FINAL.

---

## 0. The conflict this doc creates, stated up front

The world bible this guide is written from re-labels the zones:

| | this guide | shipped today |
|---|---|---|
| Zone 1 | Farmland & Village | village + farm + forest + tunnel (`content-zone1.md`) |
| Zone 2 | **Woodland** — deep forest, kingsroad, sealed city gate | **village + City Gates + the front** (`content-zone2.md`) |

The *content* of today's Zone 2 (village, gate line, the war front, the Orc
Warlord) is the bible's **City / Suburbs** material, not Woodland. So this is
not a rename — it is an **insertion**: Woodland becomes a new zone between the
farmland and the city, and today's eastern half of `world.json` slides one slot
right.

Three ways to land it, cheapest first:

1. **Split `world.json` in two, keep the east half as-is** and re-label it
   Zone 3 (City approach). Woodland is then a *new* zone file between them.
   ⚑ This is the only option that costs no re-authoring of shipped content.
2. **Re-theme the east half into Woodland** — cheapest in files, most expensive
   in work: the gate line, the front and the Warlord arena all have to go
   somewhere, and they are the most finished content in the game.
3. Leave `world.json` alone, build Woodland as a third file, and accept that
   the label "Zone 2" means two different things in two docs.

**This is a PO call, and everything below assumes (1).** It is also already
technically free: the underworld shipped multi-zone loading, `api/zones/` is the
zone list since 2026-09-10, and a new `.json` there loads on the next boot with
no conf edit.

---

## 1. The primitives you are designing with

Everything below is authored in Tiled and lands in one zone `.json`. Nothing
here needs Go.

| Layer / array | What it is | Use it for |
|---|---|---|
| `regions` | Filled area naming a **terrain profile** — the ground | The zone's base ground (Fields, Forest, Suburbs) |
| `paths` | Stroked line or **closed ring**, a profile + width, optionally blocking, optionally **`alignTexture`** (runs the tile *along* the path — required by `Fence`, wrong for everything else) | Roads, rivers, hedgerows, fences, cliff edges, cave walls |
| `polygons` | Filled closed area, optionally **blocking**, with an outline | Ponds, rock masses, building footprints, walls of a hideout |
| `atmospheres` | The **air** over an area — `darkness` and/or `haze`, plus `sight` | Canopy gloom, forest fog, a dark tunnel, weather |
| `clearings` | A closed area that **erases** atmosphere (`darkness`/`haze`/`both`) | A sunlit glade in the canopy, a lit camp inside the gloom |
| `darkAreas` | Legacy circles of darkness | Existing content only — prefer `atmospheres` for new work |
| `props` | Placed art with a collider (Tree, Rock, Boulder, House, GateWall, Tombstone) | Scatter, buildings, walls |
| `spawns` | A mob or NPC placement, with level / respawn / wander overrides | All life |
| `campfires` | Respawn anchor + rest point; one per zone is `startingSpawn` | Village, camp, waypoints |
| `anchors` | Named points a script or a door reads | Encounter geometry, tunnel destinations |
| `effect` *(designed, unbuilt)* | One optional key on a polygon/path/atmosphere naming an authored effect | Bog rot, lava, healing spring |

**Rules that bite during authoring** (all learned the hard way):

- ⛔ **A zone edit is half-live.** Tiled saves render instantly via HMR; the
  server reads the zone **once, at boot**. So geometry can look right and behave
  wrong. Restart after every save: `./scripts/dev-restart-windows.sh server`.
- ⛔ **A half-authored `.json` in `api/zones/` refuses the boot.** Park WIP
  outside the directory.
- **Blocking polygons**: interior cell 0.5 u, boundary stroke 1 u, body cap 256.
  A *jagged* outline blows the budget, not a big one — a big square merges to one
  box. Keep blocking masses **chunky**; use paths for long thin walls.
- **Walls as blocking `paths`, not props.** Path corridors are off the prop
  streaming layer and cost the wire zero; 777 props already cost something.
- **Density target (standing lock)**: one mob visible per ⅔-screen window.
- **Closure is not fill.** A closed path strokes a ring; a lake is a `polygon`.
- **Atmosphere vs region**: two separate profile tables. `Fog` is an atmosphere,
  `Forest` is terrain, and neither is offerable on the other's shape.
- **`darkness` is colour only** — a lantern erases it, nothing else does.
  `haze` is suspended matter — texture and drift, and nothing erases it except a
  clearing. Author both for a smoky cave; their opacities compound.

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

⛔ **PLACEMENT — the one thing this arc needs and does not have.** Author the
homestead stags at **level 1–2**. Spawn level is a per-spawn override, so this
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
   |  VILLAGE  -- road ---+---->  E: outer farms, then the TREELINE (-> Zone 2)
   |  (campfire,          |
   |   startingSpawn)     |
   |      |               |
   |   TURNIP FIELD       |   S: river + mill, boars, soft dead end
   +======================+
```

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
- **Field plots** = `polygons` with the Fields/Suburbs profile at a different
  tint, non-blocking, rectangular-ish and *aligned to each other*. Straight
  parallel edges are the whole visual language of farmland; anywhere else in the
  game, straight is wrong.
- **The treeline** is a thick band of Tree props plus a blocking `polygon` mass
  behind them, pierced only at the designed crossing(s). **One is a defensible
  choice *here specifically*** — Zone 1 is the tutorial and a single unambiguous
  door is a feature — but it is a choice, not a rule; see §4 rule 2. (This is
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
| **The homestead** *(§2.0)* | ⭐ The opening arc — where the player starts, and the whole starting kit | Eliza, Hendrik, Benjamin; 3–4 **L1–2** Stags; an 8–10 **Beet** patch. The road east leaves from here |
| **Village square** | Hub, respawn, quest wall | Campfire (`startingSpawn`), 4–6 Houses, Reinhard, Town Crier, village healer |
| **Turnip field** | The first 90 seconds | Turnip harvest-mobs, Reinhard's chore quest |
| **Reinhard's barn** | ⭐ The zone's first *aggressive* fight | `Barn` prop + 10–12 **GiantRat**; `giant-rats-in-the-barn` on Reinhard. ⚑ His boars are prey faction and wait to be provoked — a rat comes at you |
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
⚑ **Neither the Miller nor the Alpha Boar is PLACED yet** — spawn placement is
the PO's editor work; the mill POI takes exactly one of each.

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
- **The forest mass**: blocking `polygons` — big, chunky, *not* jagged (collider
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

---

## 4. Cross-zone level-design rules for the first two zones

These are the ones worth writing down because they are easy to break:

1. **The road is the tutorial for the whole game.** In both zones, the critical
   path is a road, and the road always points at the next zone. Everything
   optional hangs off it laterally.
2. **A seam is sealed except at its designed crossings — and there is usually
   more than one.** What makes a level range enforceable is that the crossings
   are *counted and deliberate*, not that there is only one. ⭐ The shipped Z1→Z2
   seam ridge has **two on purpose** — a solo tunnel and a group-gated road —
   which is a better pattern than one, because it lets the same seam serve a
   lone player and a group differently. The world bible asks for exactly this
   shape at the city: approach from the north **or** find the dark tunnel.
   Verify by flood-fill: plugging the designed crossings must cut the far side
   off. (⚑ `plan-world-paths.md` L3 names a boot-time reachability flood-fill as
   the remedy if authoring proves error-prone; it is not built.)
3. **Brightness is progression.** Zone 1 has no atmosphere; Zone 2 has canopy
   everywhere but the road. The player *feels* the level range change.
4. **Every dark space ends in a lit one.** A `clearing` is a landmark; darkness
   without a destination is just frustration.
5. **Landmarks over minimaps.** Every 15–20 u of travel should put something
   unmistakable in view — a mill, a boulder ring, a burnt cart, a palisade.
6. **Never seal with props.** Props stream and collide individually; walls are
   blocking paths and chunky polygons, with props on top for the look.
7. **Campfire spacing**: one per major POI cluster, ~25–35 u apart
   [PLACEHOLDER]. ⛔ Never put one on top of a cave mouth or a door — the
   campfire dwell circle eats every `E` press.
8. **Author the dangerous thing where the player can see it before entering it.**
   The lit spider staging area at the tunnel mouth is the model.

---

## 5. New assets these two zones need

⭐ **The list itself lives in [`art/assets.csv`](art/assets.csv)** — the asset
tracker, which covers art, animation and audio for the whole game and is the
thing you hand to an artist. Filter it on `zone` = Z1 / Z2, or on
`state` = missing. Read it as [`art/assets.md`](art/assets.md); the standing
brief every row is judged against is [`art/README.md`](art/README.md).

What that list says about these two zones, in one paragraph each:

- **Ground textures are the biggest gap, and `Forest` is the worst of it** —
  it has *no texture at all*, only a flat colour, and it is Zone 2's entire
  floor. `Road` borrows the desert tile. `Fields` and `Suburbs` share one grass
  texture, so farmland and village ground are literally the same image. The
  single highest-value new asset is a **ploughed-field / furrow** texture: it is
  what makes farmland read as farmland, and nothing else in the set can fake it.
- **Props are the second gap and the most visible one.** Six props exist in the
  whole game. **Tree is 74 % of all props and there is exactly one drawing** —
  2–4 variants would change the world's look more than any other single asset.
  Beyond that: the farmland vocabulary (haystack, cart, plough, well, barn,
  cottage variant, bridge deck), the Woodland set (palisade, tent, dead tree,
  stump, fallen log, bush, fern, cave-mouth frame), and a burnt cart for the
  bandit breadcrumb POI.
- **Mobs are nearly free.** Everything the world bible names for Zones 1–2
  already exists except **Goblin**. Alpha Boar, the Shepherd NPC and the named
  bandit leader are content on existing sprites. ⛔ Do not build the rest of the
  bible's roster (Fae, wisps, griffins, dragons, corrupted, elementals beyond
  fire) — they belong to later zones.
- **Atmosphere is numbers, not art, for the ones that matter.** `Canopy`,
  `Gloom` and `Cave Air` are **colour only** — a lantern erases them — so there
  is no file to draw, only a [PLACEHOLDER] opacity to judge in front of the
  game. `Fog` is the one that wants a real tile. Zone 2 will not read correctly
  until that look sitting happens.
- **Audio exists as a system and is empty as content.** `@pixi/sound`,
  `SpatialAudio.ts` and 21 inherited MP3s are wired — including the main theme,
  which is still **`derpy-berryhunter.mp3`**. Footsteps exist for *road* only,
  so a player crossing a grass field sounds like they are on a road. No campfire
  crackle, no aura sound, no level-up. ⛔ **Animation is different: the client has
  no sprite-animation support at all** (no `AnimatedSprite` anywhere), so every
  animation row is blocked on engine work — except water and haze drift, which
  already ship as texture scrolls and are numbers to judge, not frames to draw.

## 6. What this guide does *not* decide

- **The zone-split question in §0** — PO call, blocks everything else.
- Level ranges, mob counts, respawn timers, campfire spacing — all
  [PLACEHOLDER], tuned in front of the game.
- Whether `darkAreas` is retired in favour of `atmospheres`
  (`docs/cleanup.md` entry 1 argues it both ways, plus a third option: teach the
  atmospheres layer the ellipse tool).
- The **area-effects** feature (`plan-area-effects.md`, designed not built) —
  a bog that rots you would be Woodland's first consumer, but it is unbuilt.

---

## 7. Seamless adjacency — what one-file-per-zone would actually cost

§0 asks whether to split the world into per-zone files. The blocking question is
**how adjacent zone files form one contiguous walkable surface with no
teleport**, because that is precisely what the shipped multi-zone mechanism does
*not* do: the underworld is isolated by distance and entered through a door.

### 7.1 Good news first — most of the engine is already seamless

Zones are separated by **distance in one shared coordinate space**, and nothing
downstream knows zones exist. The broadphase, the AOI viewport query, every aura
overlap, entity streaming and the snapshot all work on positions alone. Put two
zone rectangles next to each other and **mobs, players, auras, aggro and
streaming already cross the seam correctly with zero changes.**

`MaxWorldCoordinate` (8192) is also a non-issue for adjacency: neighbouring
origins are ~150 units apart, nowhere near the float32 precision cliff that
forced that ceiling.

### 7.2 The one real blocker: the border wall

`core/game.go` builds **one `phy.InvAABB` per loaded zone**. Walk to the seam
and you stop dead against a wall you cannot see. That is the whole problem, and
everything else on this list is bookkeeping downstream of it.

The fix in principle: **a wall per contiguous GROUP of zones, not per zone.**
Zones that abut share one wall around their union; zones separated by distance
(the underworld, a tunnel) keep their own, exactly as today.

⭐ And the grouping should be **derived from the geometry, not authored** — the
repo's own "the SHAPE is the flag" rule, applied three times already (closed
paths, clearings, area effects). Two zones either abut exactly or clear the
separation distance; a flag saying which could contradict the rectangles.

### 7.3 The full change list

| # | What | Where | Note |
|---|---|---|---|
| 1 | Wall per group, not per zone | `core/game.go` (the `for _, w := range walls` loop) | The load-bearing change |
| 2 | `checkSeparation` currently **refuses** abutment | `world/place.go` | Becomes a three-way rule: exactly abutting, or cleanly separated, or refused |
| 3 | A group's union must be a **rectangle** | `world/place.go` | `InvAABB` is a rect. Ragged edges = refuse at boot, or wall the bounding box and make the author seal the hole with blocking geometry |
| 4 | Client tears down and rebuilds the whole visual world on a zone change | `Game.renderZone`, driven by `ActiveZoneTracker` | Must become **additive at boot** for a group. The client already bundles every zone file, so this is "concatenate with each origin applied" rather than "swap" |
| 5 | Camera clamp, minimap bake, `map.setBounds` are sized to **one zone's rectangle, never a union** (the code says so, L13) | `Game.updateActiveZone` | Group rectangle |
| 6 | `Welcome.map_width/height` ships the primary zone's bounds; `randomSpawnPosition` falls back to them | wire + spawn | Group rectangle |
| 7 | Only the **primary zone** may flag `startingSpawn` | `world/place.go` `checkSetWide` L4 | Becomes primary *group* |
| 8 | The curtain must not fire on a lateral crossing | `noteZoneChange` | Free: a contiguous walk is not a `travel` row at all, so nothing triggers it. The zone change becomes a **name banner only** |
| 9 | `PlayerRoster` ships every live player unfiltered | roster | Already a known bug; contiguity makes it *correct within a group* and still wrong across groups |

⛔ **Item 4 is the sleeper.** Even with one wall, a client that renders only the
active zone shows the neighbour's ground popping in at the seam. Seamless is a
*rendering* requirement as much as a physics one.

### 7.4 Three ways to get there, ranked

**(A) Build-time stitch — author N files, boot 1. ⭐ Recommended.**
A build step merges the authored per-zone files into one generated `world.json`
(applying each origin, concatenating every array). The engine sees exactly one
zone, so **every row of the table above stays untouched** — zero engine work,
zero new failure modes, and the seamlessness is total because there is no seam
at runtime.

- ⭐ It is already half-designed: `plan-underworld.md` §7.2 (**U6**,
  build-time zone placement with a generated placement file) is the same
  machinery, asked for by the PO on 2026-09-08 for the same reason.
- Seam validation lands in the stitcher, which is **the only place that sees
  both sides of a seam** — the right home for it, and impossible in Tiled.
- Costs, honestly: the booted artifact is generated, so debugging reads a
  generated file (mitigate by checking it in and diffing it); per-zone identity
  disappears at runtime unless you add §7.5; and the Tiled round-trip has to
  learn that the generated file is not the one you edit.

**(B) Runtime contiguous groups.** Build the table above. The right long-term
shape — zone files stay real runtime objects, per-zone lazy loading (S1) stays
possible, and a zone can be added without a rebuild. But it is genuinely several
chunks, and items 3 and 4 each carry a silent-failure class.

**(C) Don't split. One `world.json`, named areas inside it.**
What ships today. Zero seam problems, zero engine work. The cost is editing
ergonomics: one file, one editing lock, and you scroll past the farmland to
reach the woodland. Worth saying plainly — **the motivation for splitting is
authoring comfort and per-zone ownership, not engine need.** Today's file is
263 KB and Tiled handles it fine.

⚑ **(A) and (C) converge**, which is the useful observation: both end with one
runtime zone, and both need §7.5. (A) is (C) plus separate source files. So
**§7.5 is worth building first regardless of which option wins** — it is the
part that is useful in all three.

### 7.5 The primitive all three need: named areas

Zone identity should stop being file identity. A `zone.areas` array — a named
rectangle or polygon, client-side only, exactly like `regions` — buys:

- the **"Woodland"** banner when you cross, with no file boundary involved;
- per-area music (the audio pass);
- map labels;
- a level-range hint for the UI.

⭐ This was already anticipated and deliberately deferred: `plan-world-zones.md`
§7.6 ("named sub-regions within a zone", 2026-07-09) predicts exactly this
primitive and says to build nothing until a concrete consumer appears. **This is
that consumer.**

### 7.6 Seam authoring conventions (needed under (A) and (B) alike)

Tiled has no cross-file view, so a mismatched seam is **invisible in the editor**
and only appears in-game. Conventions that make it hard to get wrong:

1. **Fix a tile grid.** Every surface zone the same size (e.g. 144×72) with
   origins on exact multiples. An arbitrary-rectangle packing is a bug farm.
2. **A dead band each side of a shared edge** — ~4–8 u where nothing is placed
   except the crossing itself. No prop ever straddles the edge; a prop belongs to
   exactly one file.
3. **Same terrain profile at the crossing**, on both sides, so the ground does
   not change mid-step. Profile *blends* need the dead band to hide in.
4. **The road crosses at a round coordinate**, agreed between the two files. One
   number in both, written down.
5. **Put a natural funnel on the seam anyway** — the shipped seam-ridge trick.
   A treeline or ridge that leaves only the designed crossings makes the seam a
   threshold instead of an arbitrary line, and it is the same geometry that
   enforces the level range.

### 7.7 If you keep one giant `world.json` — the honest downsides

**First, what is NOT a downside: runtime cost.** Every loaded zone already
shares one `phy.Space`, one entity list and one broadphase, and the client
bundles *every* zone file regardless (`require.context` over `api/zones`). So
"one file" vs "several files, all loaded" is **identical at runtime** — same
physics, same streaming, same download. Splitting buys nothing there until
someone builds lazy loading, and nothing does today. The known entity-count
costs (`SkillSystem` 6.6×, `StatusEffectsSystem` 11.7× walking dormant mobs,
`removeEntityUs` O(total)) are driven by total entities and are the same either
way.

The real costs, ranked:

1. ⛔ **Boot blast radius.** `zoneStems` enumerates zone files *without parsing*
   and only parses the named stems, so a half-authored zone cannot break a boot
   it was never selected for — which is why "park WIP outside the directory"
   works. With one file, a single typo, an unknown prop type, a vertex-less
   shape or an out-of-bounds anchor **refuses the whole world's boot**. There is
   nowhere to park anything.

2. ⛔ **You cannot boot a slice.** `game.zones` lets you load just the tunnel
   (7 KB, 12 spawns) to iterate on it. One file means every restart pays the
   full load — today 494 terrain pieces, 772 props, 492 spawns. And since a
   Tiled save requires a server restart anyway (the half-live seam), **this is
   the cost you pay most often, every single edit.**

3. ⛔ **Point-in-polygon queries scale with the WHOLE world.**
   `Regions.resolveIn` is a reverse linear scan running `pointInPolygon` per
   shape with **no spatial index**, and `DarknessOverlay.inDarkness` +
   `Clearings.clearsAt` sit on top of it per query. Today those arrays are
   replaced per active zone, so a scan is bounded by *one* zone's shapes. One
   giant file makes every such query walk every region, path, polygon,
   atmosphere and clearing in the world — on the client's hot path (nameplate
   visibility). ⭐ **This is the one place where a single file is mechanically,
   not merely ergonomically, worse**, and it gets worse linearly with authoring.

4. **The map loses resolution as the world grows.** `MapTerrain.bakeTerrain`
   rasterises terrain into a single RenderTexture at a fixed `bakeWidth()` in
   texels, and deliberately never re-bakes. Double the world's linear size and
   the map halves in detail per unit. Per-zone bakes stay sharp; one
   whole-world bake cannot.

5. **Git and Tiled ergonomics.** 261 KB today; four to six zones is ~1–1.5 MB of
   one JSON. Every edit touches the same file — genuine merge conflicts if two
   people ever author at once, noisy diffs, and the byte-stability round-trip
   tests (already listed as known-inconclusive on a fresh checkout) get slower
   and more brittle. Tiled gives you layer visibility as the only organiser.

6. **No zone identity at runtime** — no area banner, no per-area music, no map
   labels, no level-range hint. ⚑ But this is solved by `zone.areas` (§7.5),
   which **every option needs anyway**, so it is one small build rather than a
   blocker.

7. ⚑ **You foreclose lazy loading, and this one gets more expensive with time.**
   S1 (webpack `'lazy'` + one await seam) is the designed answer to the client
   downloading the whole world, and it is per-*file*. With one giant file the
   only way to get it back later is to split — the work you were avoiding, done
   on a much bigger file.

8. **No repositioning.** `origin` is per-file, so a single file has exactly one.
   Moving a region of the world means rewriting every coordinate in it.

⭐ **Bottom line:** a single file costs iteration speed and boot blast radius
*now*, query cost and map resolution *as it grows*, and lazy loading *later*. It
costs nothing in physics or networking. If you take it, do two things anyway:
build `zone.areas` (§7.5), and keep the build-time stitch (§7.4 A) open — that
path converts a giant file back into N authored files without touching the
engine, which is the escape hatch that makes this choice reversible.

### 7.8 What does NOT change

Tunnels and the underworld keep today's mechanism **exactly as it is**: a
separate group, separated by distance, entered through an interact with a
curtain. That distinction — contiguous surface vs. doored interior — is the one
this section exists to preserve, and nothing above weakens it.
