# Content — Zone 7: the Swamp (Sorrowfen)

**Design intent for the swamp.** What it is supposed to *be and do*: frame,
vision, beats, cast, layout. Exact runtime positions live in the zone JSON
authored in Tiled and are never mirrored here. Numbers are [PLACEHOLDER]
unless marked FINAL.

⭐ **The first zone planned with the level-design process**
([`content-zone-design-guide.md`](content-zone-design-guide.md), "The
level-design process"): one section per step, filled in order with the PO.

🗺 **Paper map** (PO 2026-10-25): [`level-drafts/swamp-paper-map.jpg`](level-drafts/swamp-paper-map.jpg).
**Draft map:** <https://claude.ai/artifact/JJJUJo6vZkVP3SKhdpL9tj> (source
[`level-drafts/swamp.html`](level-drafts/swamp.html), built with
`tools/level-draft/` from the frame `-197,8,-76,118`). Change it together with
this doc.

| Step | State |
|---|---|
| 0. Frame | ✅ ruled 2026-10-25 (§0.4) |
| 1. Vision | ✅ ruled 2026-10-25 (§1.1); the sentence and "what it is not" are drafts |
| 2+3. Beats and cast | ✅ signed off 2026-10-25 (§2) |
| 4+5. Layout in the draft | ✅ draft v4 (paths through poison bog) approved 2026-10-25 |
| 6a. Map | ✅ rough layout laid 2026-10-25, uncommitted (§6a); in-game look passed (PO), PO's hand edits since |
| 6b. Content | ⏳ chunk 1 built 2026-10-25, uncommitted (§6b): NPCs, quests, mobs on placeholder art, the bog's damage, an empty den |
| 7 / 8 | not started |

### ⏳ Owed (PO 2026-10-25: the layout goes in first, all of this waits)

Nothing below blocks the 6a map. Each line is new work; the layout leaves a
place for it.

**Engine**

| # | What | Why | Where designed |
|---|---|---|---|
| E1 | **The bog slows**: an area effect that applies a slow. ~~Stacking up to 3 times~~ **cut 2026-10-25 (PO)**, parked in [`plan-stacking-effects.md`](plan-stacking-effects.md) | An area applies `dot_aura` and `hot_aura` only (`plan-area-effects.md` E2) | §4.1 item 2 |
| E2 | **Frog camouflage** ✅ BUILT 2026-10-25, uncommitted: `factors.camouflage` on a mob def; while it is within 0.75 u of its spawn point and out of combat (`Mob.InCombat`: a target, or damage taken lately) the server ORs `AppliedEffectCamouflage` (bit 13) into its `applied_effects`, and the client draws the whole entity, plate included, at alpha 0.2 (a treatment-only row in `TokenState.ts`, no indicator). No combat change. [PLACEHOLDER] radius and alpha | Stealth is a player tool with combat rules | §2.5 item 1 |

**Content: mobs and NPCs** (art for each is owed with it)

| # | What | Kind | Notes |
|---|---|---|---|
| C1 | **Bog skill** (the bog polygons' `effect`) | skill | ✅ `BogSickness` on every bog polygon (6b): miasma damage over time, refreshing. ⏳ The **slow** waits for E1 (an area applies `dot_aura`/`hot_aura` only); stacking is cut |
| C2 | **Swamp immunity** | resistances | ✅ (6b) a new damage type **`miasma`** (PO's idea), dealt only by the bog; spiders (shared defs), wisps, frogs, snakes and the queen resist it at 0 |
| C3 | **Mushroom picker** | NPC | ✅ Hedda (6b); art owed |
| C4 | **The gnome** (from the wasteland) | NPC | ✅ Fennick (6b); art owed |
| C5 | **Pirate captain + crew** | NPCs | ✅ Captain Brack + 2 Pirate Deckhands (6b); art owed |
| C6 | **Spider Queen** | boss mob | ✅ (6b) GiantSpider art; her own art owed |
| C7 | **Bog frog** | mob, new art | ✅ (6b) placeholder art, camouflaged (E2) |
| C8 | **Bog snake** | mob, new art | ✅ (6b) placeholder art, waypoint loops |
| C9 | **Lake crab** | mob | ✅ `LakeCrab` (6b): its own EntityType `LakeCrab` (160), the SandClamper SVG recoloured blue (PO 2026-10-25); real art owed |
| C10 | **Bog mushroom** | harvest structure | ✅ the existing `BlueMushroom` (PO 2026-10-25) |
| C11 | **Wisp light** | light passive | ✅ `WispGlow` (6b) |
| C12 | **Quests A, B, C** | quests + strings | ✅ (6b) English + German drafts, PO review owed |
| C13 | **The den** | interior zone file + `CaveMouth` | ⏳ an empty placeholder `spiderDen.json` with the queen in it (6b); the PO builds it out |

**Content: props and looks**

| # | What | Notes |
|---|---|---|
| P1 | **Boardwalk** path profile (plank tile) | The layout draws planks as narrow `Road` until it lands |
| P2 | **Broken-plank** look | Today a gap in the plank path |
| P3 | **Thicket** look | ⏳ placeholder landed 2026-10-25: a `Thicket` profile (generated tile, `make-cellular-tiles.mjs thicket`) on the blocking walls, with `DeadTree` props; `Forest` read as walkable floor (PO). Real art owed. If it still fails in game: every wall becomes bog-looking deep water (PO's fallback) |
| P4 | **The treasure** (sunk chest) | Quest C's pickup, past a wrong-way plank in the core |
| P5 | **Webbed staging area** at the den mouth | Webs, egg sacs |
| P6 | **Camp props**: the gnome's camp, the pirates' camp | Tent, crates, a boat |

---

## 0. Frame

### 0.1 Where it is (from `world.json`, 2026-10-25)

The area **`sorrowfen`** (`Swamp` ground), x −181 … −92, y 36 … 108:
**89 × 72 u**, about the Deep Woods' size (92 × 78).

| Side | Neighbour | Edge today |
|---|---|---|
| North | **Deep Woods** (Zone 2) | the woods' south cliffs (x −177 … −110); the woods' **dark forest** (`Gloom`, spiders 12–14, the Lamplighter) sits in their SE corner, just above the swamp's NE |
| East | **Southgate** (`Suburbs`, the city's south side) | open |
| West | **Brackenfold Meadows** (`FieldsForestBlend`; leaving Zone 1, its map call open) | a `Bridge` at (−178, 72) |
| South | **Fallow Reach** (`Wasteland`); **Sunscar** (`Desert`) to the SW | open |

`content-world.md`: zone 7 hangs off the Forest (zone 2) and leads on to the
wasteland/desert arm (8/9), a dead end that never reconnects. Inhabitants:
"fantasy creatures". `plan-xp-progression.md`: side content, off the critical
path.

**In it today:** 7 spawns (Spider 12 ×2, VenomSpider 13, GiantSpider 14 ×2,
Wisp 13 ×2), two campfires (`spawnpoint-27` at (−150, 72), `spawnpoint-28` at
(−120, 72)), one `Bog` structure, a burnt cart, stumps, two trees, no
atmosphere.

### 0.2 What we can build with (shipped)

| Need | What exists |
|---|---|
| Darkness that a light reveals | `atmospheres` (`darkness`); **Lamp** (passive, dim, the Lamplighter's reward in the woods, §3.8 there) and **Torch** (active aura, bright, takes the aura slot) erase it |
| Traps | ⭐ **Area effects ship** (`plan-area-effects.md` E1 + E2): an `effect` key on a polygon, path or atmosphere applies an authored effect to whatever stands in it (`Blight` is used once in the world). `Bog` ground (dark, scrolling). `PoisonPool` (a hazard structure, unkillable, XP 0). `SpiderWeb` (slows, made by `SpinWeb` today) |
| Spiders | `Spider`, `VenomSpider`, `GiantSpider`; `BroodMother` (debug example: screeches fear, splits into two Spiders on death), the obvious base for a queen |
| Crabs | `SandClamper` (Saltgrass Strand's beach crab, level 3, placeholder art): a re-levelled variant, or its own mob |
| Frogs | **nothing**: a new mob, new art |
| Interiors | a cave as its own zone file behind a `CaveMouth` (the kobold cave, the wolf den) |

### 0.3 The paper map, as read (correct me)

North is up. My reading, to be confirmed:

- **East edge:** a hatched band, **cliffs**, between the swamp and Southgate.
- **NE, die 1:** a **campfire (LF)** and a **villager**: the entry camp, where
  the way down from the woods arrives.
- **Centre:** the **labyrinth**, winding channels drawn as double lines.
- **Frog** token in a channel loop in the NW of the labyrinth.
- **West-centre, die 3:** the big spider and a cave sign (∩), the **spiders'
  den** and the queen; two small tokens beside it.
- **East:** a second spider with a cave sign by the cliffs: read as the den's
  second mouth, then removed (§4.1 item 3).
- **South, die 2:** at the labyrinth's end, the quest giver: **the gnome**
  from the wasteland (§2.2), not a villager.
- **West strip:** the **lake shore** with a **crab**; **"Piraten" LF**, a
  pirates' campfire in the NW.
- The dice read as the **beat order**: 1 arrive, 2 the quest, 3 the den.

### 0.4 Rulings (step 0, PO 2026-10-25)

1. **Footprint:** the paper map is `sorrowfen` as it stands (89 × 72 u); the
   lake shore is its own west strip.
2. **Entry:** from the north **through the woods' dark forest**. The woods'
   south cliffs open there, so the Lamplighter's **Lamp** (woods quest 9) is
   the light the player brings. The woods and the swamp share one light story.
3. **Levels: the swamp is 8–12, and the woods become 4–7** [PLACEHOLDER].
   ⚑ Knock-ons: the woods' dark forest spiders (12–14 today) drop into the
   woods' band; Zone 1's 1–6 now overlaps the woods' 4–7; the swamp moves from
   side content to the next band after the woods (`plan-xp-progression.md` §4
   called it an overlap). Recorded in both docs; the budgets are owed.
4. **Exits:** north (the woods, the way in), **south** to Fallow Reach and the
   wasteland/desert arm, **east** to Southgate. West stays closed (today's
   bridge to Brackenfold goes).

---

## 1. Vision

**The PO's brief (2026-10-25):** a **labyrinth bog with deadly traps**.
Players who cannot see in the dark die in the traps. The player first enters
from the woods in the north **through a dark area**: without a light they get
lost and die. The main enemies are **spiders and frogs**. Near the end of the
labyrinth an NPC sends the player into the **spiders' den to kill the spider
queen**. Through the labyrinth, to the west, a **beach on the large lake**,
where crabs live.

### 1.1 Rulings (step 1, PO 2026-10-25)

**Mood: rotting, sick, hostile.** A plague bog: poison, decay, webs. The
spiders own it, and everything else is sick from them. Not a fairytale marsh,
not folk horror. Colour, sound and NPC voice all follow from this.

**In one sentence** [draft]: a rotting labyrinth the spiders have taken, where
the planks are the only safe ground and the light is the only way to see them.

**The mechanic it teaches: light is how far you can see danger.**

- **Lamp sees near, Torch sees far.** Lamp (the passive from the woods,
  radius 2.5 u [PLACEHOLDER]) shows the ground at your feet: a solo player
  survives by walking slowly. Torch (the active aura, 4 u) shows the path
  ahead but costs the damage aura. In a group one player carries the torch:
  the light role, the woods tunnel's lesson grown up. `light_aura` is
  rendering only, so a trap hurts whether you see it or not.
- **Traps are deadly if you stay.** Sinking bog: it slows, and its damage
  rises the longer you stand in it. A lit player sees it and steps out; an
  unlit one stumbles deeper and dies. Never instant death. Built on area
  effects (`effect` on the bog polygons).
- **Wayfinding: boardwalks, and wisps.** Old plank walkways and marker posts
  thread the labyrinth: **wood is safe, open bog is not**. They are broken in
  places, so the light still matters. **Wisps** drift in the dark as the only
  other lights, and they lure: follow one off the planks and it leads into the
  bog. The swamp's version of "walk until you hit the road" is "get back on the
  planks".

**What it is not** [draft]: not a fight-everything zone (the danger is the
ground as much as the mobs); not a maze to memorise (the planks always lead
somewhere); not the woods again (no trees as walls: water and bog are the
walls).

---

## 2+3. Beats and cast

All levels [PLACEHOLDER] inside the 8–12 band; working ids are slugs until
named.

### 2.1 Beats

| # | Beat | Curve | Where (paper map) | Carried by |
|---|---|---|---|---|
| 1 | **Down through the dark forest.** The woods' dark forest is the brood's northern edge: the queen's spiders have spread that far | tension | the woods' SE | the woods' spiders, Lamp |
| 2 | **The entry fire.** Light, a campfire, the first person in the swamp. The planks are safe, the bog is not. Quest A starts | calm | NE, die 1 | the mushroom picker |
| 3 | **The labyrinth.** South on the boardwalks: mushrooms to pick off the planks, by your own light, beside the traps; frogs leap from the black water; snakes swim the bog towards you; wisps glow over it. Its **dark core** is fully dark and cannot be skipped (§2.4) | tension | centre | traps, frogs, snakes, wisps, quest A |
| 4 | **The gnome's camp.** The labyrinth's end, by the road south. Quest A ends, quest B starts. A campfire | calm | S, die 2 | the gnome |
| 5 | **The den.** Back north-west into the cave; webs, the brood, the queen | **peak** | W-centre, die 3 | spiders, the Spider Queen |
| 6 | **The way back.** Out through the den and the core to the gnome, the venom in hand (the second mouth was removed, §4.1) | release | W-centre → S | |
| 7 | **The lake** (side, any time after beat 3). Through the labyrinth's west arm to the beach: daylight, crabs, the pirates' fire, a treasure in the bog | calm, then tension | W strip, "Piraten LF" | the pirates, crabs, quest C |

### 2.2 Cast

| Who | Kind | Where | What they do |
|---|---|---|---|
| **The mushroom picker** (name owed) | villager NPC | the entry fire (NE) | Picks bog mushrooms for the gnome; gives quest A |
| **The gnome** (name owed) | NPC, from the wasteland | his camp at the labyrinth's south end | Buys the mushrooms; wants the queen's venom; gives quest B. The swamp's link to the wasteland arm |
| **The pirates** (a captain + crew, names owed) | NPCs | their fire on the lake shore (NW) | After a treasure sunk in the bog; give quest C |
| **Spider Queen** | boss or elite (§2.4 Q2), ~12, new mob | the end of the den | Base: `BroodMother` (fear screech, splits into spiders on death) |
| Spiders | `Spider` 8–10, `VenomSpider` 10–11, `GiantSpider` 11–12 | the labyrinth's edges, thickening towards the den; the den itself | |
| **Bog frogs** | new mob, new art, 8–10 | in the water beside the planks, NW loop thickest | **Camouflaged ambushers** (PO 2026-10-25): never fully hidden, but much harder to spot while they sit at their spawn point; revealed once they leave it or engage a player. A light shows them earlier. Engine work (§2.5) |
| **Bog snakes** | new mob, new art, 9–11 | patrol routes across the open bog | **Roamers that cross the bog** (PO 2026-10-25): the mob that comes to you. Frogs wait beside the planks; snakes swim the water on waypoint patrols (shipped, `patrol.go`) and strike at the planks. In the dark you see them late |
| **Wisps** | `Wisp` (exists, placeholder art), 9–11 | over the open bog | **The lure:** the only lights in the dark besides yours; follow one off the planks and you are in the bog |
| **Lake crabs** | variant of `SandClamper`, 9–11 | the beach | The shore's mobs |
| **Bog mushrooms** | harvest structure (new def or `BlueMushroom`) | off the planks, beside the traps | Quest A's harvest |

### 2.3 Quests

| Id (working) | Giver → turn-in | Stages | Role |
|---|---|---|---|
| A `mushrooms-for-the-gnome` | picker → gnome | `harvest` N bog mushrooms (off the planks, by your own light) → `bring` them to the gnome | **The critical path:** pulls the player through the labyrinth N → S and teaches the light on the way |
| B `the-spider-queen` | gnome → gnome | kill the Spider Queen in the den → bring her **venom** | The peak. The gnome wants the venom (with the mushrooms) as an ingredient |
| C `treasure-in-the-bog` | pirate captain → captain | find the sunk treasure in a trapped spot of the labyrinth → bring it back | Side. Puts a reward deep in the traps: worth carrying a torch for |

### 2.4 Rulings and open calls (step 2+3)

Ruled 2026-10-25 (PO): the north villager picks mushrooms for a gnome from the
wasteland, who waits in the south; the player **picks** the mushrooms, then
brings them; frogs are **hidden ambushers**; the den is a **cave interior**
(its own zone file) and the east nest is **its second mouth** (removed again
at step 4+5, §4.1); the gnome wants
the queen's **venom**; the pirates are after a **treasure in the bog**.

Ruled the same day (PO):

- **The Spider Queen is a group boss** (tier boss), built for 2–3 players:
  one carries the torch in the dark den, the others fight. The swamp's "roles
  for each other" moment.
- **The east exit to Southgate is open from the start**: a path up the east
  cliffs. A player can reach the swamp from the city without the woods' dark
  forest, so without Lamp. **That is fine** (PO 2026-10-25): the city sells
  light, and that exit is hard to reach. But it skips **only part of the
  labyrinth**: a **large dark core**, fully dark, is the light + labyrinth
  mechanic, and every way to the gnome, the den and the mushrooms runs through
  it, from either entrance. Layout rule for step 4+5.
- **The gnome brews a cure for the bog sickness** from the mushrooms and the
  venom: the rot makes people sick (the picker is coughing). Reward candidates:
  a poison-resistance passive, or the cure itself [open].

Open: names (picker, gnome, pirate captain, the queen's own name if she gets
one); quest rewards; how many mushrooms; what the treasure is.

### 2.5 Engine work this implies (PO 2026-10-25: some is fine)

1. **Camouflage for the frogs.** A mob state that draws it faint while it sits
   at its spawn point and clears when it leaves its home radius or takes a
   target. ⭐ The draw half exists: stealth already fades the whole entity on a
   Mob (`plan-entity-presentation.md` EP1). ⛔ But stealth itself is a player
   tool with combat rules (mobs cannot harm a stealthed target; a stealthed
   source writes no threat, `sys/skills.go` `applyStealth`), so the frog's
   state should be **visual only**: its own state bit, no combat change, no
   indicator on the ring. Wire: +1 state bit value [to confirm in the plan].
2. **Bog immunity is authoring, not engine:** area effects already hit mobs and
   a mob's resistances are its immunity (`plan-area-effects.md` D11). **Ruled
   (PO 2026-10-25): snakes, spiders and frogs take no damage from the bog or
   its traps.** ⚑ The spiders are shared with other zones (the woods' dark
   forest, the den), so the immunity is per-swamp variant or added to the
   shared defs; settle at 6b. **Wisps are immune too** (PO 2026-10-25).
3. **Wisps that lure: no engine work.** A mob already emits the light of its
   active aura and of any light passive in its loadout (`mob.LightRadius`, on
   the wire as `light_radius`; the campfire and fire elemental auras use it).
   The wisp gets a light passive, sickly green, flickering.

## 4+5. Layout in the draft

Draft v4 published 2026-10-25 (link at the top). History: v1 had bog in
patches (PO: "no real labyrinth"); v3 was a grid maze of walled corridors (PO:
"too artificial"). What v4 proposes, the PO's vision of 2026-10-25:

- ⭐ **The poison bog is the ground.** Most of the swamp is poison bog:
  walkable, it slows and poisons and stacks (§4.1). Through it wind the
  **safe ways**: firm ground and planks. Step off and you are in the bog;
  keep going and you hit **deep water or thicket**, which block. The maze is
  the ways plus where the bog ends.
- **Walls follow the ways.** The draft derives them: the bog is a band round
  every way, 2–8 u wide by noise, wider in the core, with bog lagoons that
  join neighbouring ways (a deadly shortcut, never a safe one). Deep water and
  thicket are mixed. The Tiled pass draws them by hand.
- **The true way** (entry → last fire → the core → the gnome, branches to the
  den, the beach and the east exit) is firm ground in the north and mostly
  **planks in the core and the snake water**, broken in places.
- **Ten wrong ways** leave it and peter out into the bog, each ending with a
  wisp hovering just beyond: the lure.
- **Light: darkness over the whole swamp, the north included** (PO
  2026-10-25), so without a light you step off the way by accident. The dark
  core is darker still, with a miasma haze, and holds the den, most mushrooms
  and the treasure. Clearings at the fires; the beach in daylight. Both
  entrances reach the gnome and the den only through the core.
- **Fires:** entry (NE), **the last fire** before the core, the gnome's (S),
  the pirates' (W). Today's two fires move out of the core.
- **The way in** is the gap between the woods' south cliff and the moat
  (x −110 … −92); the **east exit** a climb down new cliffs south of the moat's
  end (y 82); the **south exit** past the gnome.
- **The den** is one interior with **one mouth**: mouth → web halls → egg
  chamber → the queen at the far end; out the way you came.
- **The lake** (PO's map edit, 2026-10-25): the river no longer runs down the
  swamp's west edge, it ends in the lake at y ≈ 49, and the lake now borders
  the swamp from y 49 to 94. The beach runs down that shore; today's west
  bridge is gone with the river.

### 4.1 Open calls from the draft

1. ~~What blocks and what sinks~~ **Ruled 2026-10-25 (PO): a real maze**,
   walls everywhere, large sinking bogs at the walled dead ends (§4). ⚑ New
   risk: a maze is a lot of wall. Walls are blocking `paths` along the
   corridor edges and chunky blocks, never one jagged polygon (the collider
   budget, guide §1); measure the cost in the Tiled pass.
2. **The bog effect, ruled 2026-10-25 (PO): it slows and poisons, and stacks
   up to 3 times** (each stack more slow, more poison). ⚑ **Stacking cut
   the same day (PO)**, parked in `plan-stacking-effects.md`; the bog slows and
   poisons with one refreshing effect. ⚑ **Engine work:**
   area effects refresh their duration on re-entry (`plan-area-effects.md` D6)
   and nothing in the skill vocabulary stacks today, so a stack count with
   per-stack slow and poison is new. ⚑ The poison makes **poison** the type
   the swamp mobs resist (§2.5): check that no player build leans on poison
   against them. ⭐ **A bog trap already
   exists and is the pattern:** sorrowfen's one `Bog` polygon
   (−170 … −157, 48 … 58) carries `"effect": "Blight"`, the player's nature
   damage-over-time aura reused as the area's effect (an area effect names any
   authored skill, `plan-area-effects.md` E1). The swamp's traps are that
   polygon repeated, with a skill of their own for the sinking (a slow, e.g.
   `slow_aura`, plus the damage). ⚑ **Immunity by damage type has a catch:**
   if the trap deals `nature` damage, swamp mobs that resist it also shrug off
   the players' nature auras (Blight and kin). The trap's damage type must be
   one that no player build depends on against these mobs; settle at 6b.
3. ~~The east mouth is a back door~~ **Ruled 2026-10-25 (PO): removed.** The
   den has one mouth, in the core.
4. ~~The lake~~ **Ruled 2026-10-25 (PO), in the map:** the river parts down
   the swamp's edge are gone and the lake is larger; it borders the swamp
   from y 49 to 94 (§4).
5. ~~The last fire~~ **Ruled 2026-10-25 (PO): kept.**
6. ~~Today's air~~ **Ruled 2026-10-25 (PO): replaced** by the draft's light
   (darkness over the whole swamp, the core darker with miasma).

---

## 6a. Map: the rough layout (2026-10-25, uncommitted)

Laid into the `sorrowfen` area of `api/zones/world.json` from draft v4 by a
one-off generator (the draft's waypoints, a 0.5 u classification grid, outer
contours, smoothed and simplified). The PO polishes it by hand from here
(step 7); nothing re-runs the generator.

| Layer | What landed |
|---|---|
| `paths` | 30 `Road` pieces: firm ground width 2.4, planks width 1.6 (P1 owed), split at the six broken planks; two `Cliff` paths down the east edge south of the moat, the 3 u gap between them is the east exit |
| `structures` | 7 `Bog` polygons (the poison bog, **no `effect` yet**, C1 owed) + 6 small `Bog` patches at the broken planks; 13 blocking `Deep Bog` walls (first blue `Water`, which read as a clean lake; `Deep Bog` is the bog tile recoloured darker, PO 2026-10-25) + 10 blocking `Thicket` walls (first `Forest`, which read as floor; `Thicket` is the new placeholder profile, P3) where the bog ends, a wall rim round the swamp except at the four ways out |
| `atmospheres` | `Darkness` over the whole swamp but the beach (and the way down from the woods), `Miasma` over the core. The old top-level `Fog` and `Darkness` over the swamp are gone |
| `clearings` | Round the three fires in the dark (`clears: both`) |
| `bindPoints` | `spawnpoint-28` → the entry fire, `spawnpoint-27` → the gnome's camp (ids kept, so bound characters follow), new `spawnpoint-51` (the last fire) and `spawnpoint-52` (the pirates' fire) |
| `spawns` | Existing mobs only, re-levelled into 8–12: 6 Spider 8–10, 3 VenomSpider 10–11, 2 GiantSpider 11–12 at the den, 10 Wisps 9–10 at the wrong ways' ends, 6 SandClamper 9–10 on the beach (C9 stand-in). The old 7 spawns are gone |
| `props` | 21 `DeadTree` on the thicket walls |

Written through the converter's canonical `serializeZone` (byte-stability green). Checks: no way sample lies inside a bog or wall polygon (the generator's hole
check, 0); `aurad -validate` 0 findings; `go test ./pkg/aura/world/...
./cmd/aurad/...` red only on the two known tests (C1b Tree size, Passages
words); nothing outside the swamp and its old air changed. **Schema: DB /
conf / wire none; zone `sorrowfen` only.** ⚑ The PO's own lake edit is in the
same uncommitted file. In-game look passed (PO 2026-10-25).

## 6b. Content, chunk 1 (2026-10-25, uncommitted)

PO scope (2026-10-25): NPCs, quests and the mobs on placeholder art; reuse the
mushrooms we have; no den, only an empty placeholder to build in; the bog hurts
now without stacking; names and rewards drafted, the PO renames.

| Piece | What landed |
|---|---|
| Damage type | **`miasma`** (Go `DamageTypes`, the vocabulary, the hit-mark palette, the content editor, `damage-type.miasma` in English and German). Only the bog deals it, so immunity costs no player build anything (§4.1 item 2) |
| Skills | `BogSickness` (mob skill, the area effect: 24 HP over 3 ticks every 30, refreshed while you stand in it); `FenTonic` (player passive, resists miasma 0.6 → 0.2 over 5 levels: the gnome's cure); `WispGlow` (green flickering light on the Wisp) |
| NPCs | **Hedda** the picker (entry fire), **Fennick** the gnome (south camp), **Captain Brack** and two **Pirate Deckhands** (beach fire), **SunkChest** (quest C's talk_to object, past the wrong-way plank at the core's south end). Placeholder art: Farmer, Hermit, Wanderer, NpcPlaceholder |
| Mobs | **SpiderQueen** (boss, cL12, GiantSpider art at a bigger body, BroodMother's kit + SpinWeb, ccImmune); **BogFrog** (cL9, short aggro, no wander, 6 beside the planks, NW thickest); **BogSnake** (cL10, 3 on six-point waypoint loops in open bog); **LakeCrab** (cL9, replaces the 6 SandClamper stand-ins; recoloured blue on its own EntityType, PO 2026-10-25). Frog and snake portraits: the lizard bust, tinted |
| Quests | A `mushrooms-for-the-gnome` (L9, 6 BlueMushroom, 645 XP); B `the-spider-queen` (L12, offered after A, 1115 XP + FenTonic); C `treasure-in-the-bog` (L10, 774 XP). XP by the half-level rule. 8 BlueMushrooms beside the core's planks |
| Den | `api/zones/spiderDen.json`: 60 × 36, one `spider-den` region, Gloom, the queen at the far end, an exit back. In the swamp: a `CaveMouth` at the end of the firm way west of the core (≈ −158, 84), a hidden exit, the `spiderden-surface` anchor |

Placed by a one-off script into the PO's current map (it read the bog and wall
polygons and kept every pick in the bog and clear of walls; NPCs on firm
ground). **Draft names [PLACEHOLDER]:** Hedda, Fennick, Captain Brack, the
Spider Queen; FenTonic "Fen Tonic" / "Moortrank".

**Checks:** `aurad -validate` 0 findings; Go `skills`, `items/mobs`, `quests`,
`sys` green (censuses bumped), `cmd/aurad` and `world` red only on the known
Passages + C1b; `TestLang` green after `UPDATE_LANG`; vitest 1938/0;
typecheck; content-editor smoke 0. **Schema: DB / conf none; wire +1 EntityType (`LakeCrab` = 160)** (a damage
type is content vocabulary, not wire); content +9 mobs, +3 skills, +3 quests,
+1 zone file, +1 region.

**Owed after chunk 1:** the PO's look in game and in Tiled (den mouth facing,
frog and mushroom spots); the PO's den build-out; E1 (slow + stacks), E2 (frog
camouflage); art for every new NPC and mob; the PO's review of names, text and
German.
