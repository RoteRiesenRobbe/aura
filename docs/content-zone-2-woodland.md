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

🗺 **Draft map:** <https://claude.ai/artifact/He29j6zUaCwhqfqgqhY222> (source
[`level-drafts/deep-woods.html`](level-drafts/deep-woods.html); how to rebuild
it: `content-zone-design-guide.md`, "Every zone plan has a draft map"). Change
it together with this doc.

⚑ **Owed: an XP budget and a progression by quest area**, the shape Zone 1's
§2.7–§2.8 set, per [`plan-xp-progression.md`](plan-xp-progression.md). Not
drafted until the PO rules on Zone 1's.

⭐ **2026-10-25 (PO): the woods get a story.** The Wanderer becomes **Fritz**,
foreman of the **woodcutters**, whose camp in the NE was wrecked by bears and
then raided by kobolds. A big kobold cave behind the camp runs two ways: west
up to the **kobold plateau** (the leader, the stolen shipment, a captive
woodcutter) and east towards the city. The road to Dionsburg is longer. A dark
forest in the south needs a light: the Lamplighter teaches **Lamp** once the
player brings him lamp oil from the gnomes in the city. Design:
§3.5–§3.8; open calls: §3.9.

## Where Zone 2 is

**Region:** **Deep Woods** ("City Outskirts", `Forest`), between the Farmlands
river (west) and Dionsburg's moat (east), with cliffs along its north and south
edges. ⚑ The underworld's two surface exits are no longer here: they come up
in Wreckers Bluff (north) and inside Dionsburg. Brackenfold Meadows is leaving
Zone 1 (PO 2026-10-02); whether it joins Zone 2 is a map call, not yet made.

### As built vs. this doc (census 2026-10-25, the `deep-woods` area)

| Topic | This doc says | The map has |
|---|---|---|
| Content | §3.3's places | 51 Wolves (3–6), 7 Bears (6–7, the NE quarter), 19 Kobolds (7, a surface camp at the NW farmland edge beside the cave mouth), a bandit group of 6 (5–7, north of the fire), 18 Spiders (12–14, SE), 11 Stags, 1 Dire Wolf (8). NPCs: Wanderer, Tobias, City Guard, Dead Carter. ⚑ One Wolf is level **45**, almost certainly a typo |
| Kobold cave | Big, mouth in the NE, two branches (§3.7) | Mouth in the **NW**, beside the north river bridge. Interior `koboldCave.json` (48×28): 13 Kobolds, 5 KoboldRanged, the Fallen Traveller, one exit |
| Kobold plateau | One bramble choke (§3.7) | ✅ Exists: the raised NW section above the upper river bridge (the bridge runs below it and does not connect the plateau to the Farmlands). The bandit group stands on the path beside it, not on it |
| Road to the city | Winding, over the moat bridge to the open west gate (§3.6) | One straight road: river bridge → the fire → moat bridge → the west gate, which is **shut** (JailBars) |
| Dark forest | The SE, light needed (§3.8) | `Gloom` over the spider corner |
| Campfires | Never beside danger (guide §4 rule 7) | `spawnpoint-2` (the Wanderer's fire) and `spawnpoint-4` (beside the City Guard) |
| Levels | 6–12 [PLACEHOLDER] | 3–8 on the road side, 12–14 in the spider corner |

⚑ `node scripts/zone-census.mjs` reads **0 spawns and 0 regions** from today's
`world.json`: it reads top-level arrays only, and the map has been nested
under `areas` since prop-draw-order P4. The census above was read straight
from `areas[deep-woods]`. The script needs fixing before it is trusted again.

---

## 3. Zone 2 — Woodland

**Level range** 6–12 [PLACEHOLDER]. **Theme**: dark, dense, disorienting, few
people. The zone whose job is to make the player *want* the city.

### 3.1 The design problem Woodland actually poses

A forest is the hardest zone type in a top-down game, because **trees are both
the art and the walls**, and a player who cannot see cannot navigate. Three
rules make it work:

1. **The kingsroad is always findable.** It is wide, it is a distinct profile,
   and it runs unbroken from the west entrance to the moat bridge and the
   west gate in the east (§3.6). It may bend; it never breaks. Every time the player is lost,
   the recovery is "walk until you hit the road".
2. **Darkness is authored in bands, not blobs.** A corridor of `Canopy`
   atmosphere along a lane reads as *deep woods*; a circle of darkness in the
   middle of nowhere reads as a bug.
3. **Every dark area has a lit destination.** A `clearing` at the end of a dark
   lane is the reward and the landmark. This is exactly what `zone.clearings`
   was built for, and Woodland is its first real consumer.

### 3.2 Layout skeleton

```text
                               north cliffs (Wreckers Bluff)
          (north edge: cliffs)         ^
         +=====================[BRAMBLES]======================+
  upper  | KOBOLD PLATEAU        BANDIT CAMP        WOODCUTTERS' |
  river  | (NW, raised;          (on the path,      CAMP (NE,    |
  bridge |  leader+shipment,      guarding it)      wrecked),    |
  runs   |  captive)                    bears ..    CAVE mouth   |  m
  below  |  [BRAMBLES] (the one choke)  . crate trail .          |  o
  W -----+==\               FRITZ'S FIRE                       |  a
 entrance    \               (Fritz, Tobias)                    |  t    DIONSBURG
              \===+=============\                              |       west gate
   WOLF CAVE        \              \=========> MOAT BRIDGE ====|=====> (OPEN)
   mouth (SW)        \                                          |
                      '== dark lane ==> DARK FOREST (SE)        |
                                       spiders, corpse,         |
                                       lamplighter              |
          (south edge: cliffs)
  underground: the kobold cave runs from the NE mouth WEST up to the
  plateau and EAST to the city side of the moat; the bear cave (own mouth, further
  east) joins it inside (§3.7)
```

A sketch, not a layout: the positions are the PO's brief, the exact shapes are
Tiled work.

- **Region**: `Forest` over the whole zone.
- **Kingsroad**: one `Road` path, width 3 u, W→E, **non-blocking**, winding
  between forest masses past Fritz's fire, over the moat bridge to the open
  west gate (§3.6). Wide enough to be unmistakable.
- **The forest mass**: blocking `structures` — big, chunky, *not* jagged (collider
  budget) — with Tree props scattered densely on top of and around them. The
  polygons are the navigation; the props are the look. Never rely on prop
  colliders to wall a forest. ⭐ The masses are also what kills the straight
  line: they sit on it.
- **Lanes**: the negative space between polygons. Author them as deliberate
  corridors 4–8 u wide, branching off the road, each leading somewhere.
- **Canopy atmosphere** over everything *except* a band along the road and the
  clearings. `darkness` moderate + `haze` low; the haze is what makes it feel
  humid rather than merely dim. The **dark forest** (SE) is much darker
  (§3.8).
- **Clearings** at every POI, `clears: both`.

### 3.3 Points of interest

| POI | Purpose | Contents |
|---|---|---|
| **West entrance** | Threshold | The river bridge, signpost, the Zone 1 handoff |
| **Fritz's fire** | The survivors' camp, hub of the zone's quests | Fritz + Tobias, campfire, clearing |
| **Tobias's burnt cart** | Start of the crate trail (§3.5) | BurntCart by the road; spilled cargo leads NE |
| **The woodcutters' camp** (NE) | The wreck the story starts from | Smashed tents, felled logs, lumber stacks, bears still about; the kobold cave mouth just west of it, the bear cave mouth to the east |
| **Kobold cave** | Shipment chain, the way up to the plateau, a shortcut to the city | Mouth a little west of the camp, with a lit staging area; inside: a west branch, an east branch, and a passage into the bear cave (§3.7) |
| **Bear cave** (NE, east of the camp) | Deep bear territory, the alpha bear's den | Its own mouth among the bears; inside, the alpha bear; joins the kobold cave (§3.7) |
| **Kobold plateau** (NW) | The kobold leader's seat | Raised, cliff-bounded; the leader with the shipment, the captive woodcutter, kobold camp; one bramble choke down to the lower woods |
| **The dark forest** (SE) | Light gate (§3.8) | Spiders 12–14, the Lamplighter (the light quest, §3.8); the dead woodcutter and small spiders just outside its northern edge |
| **Wolf cave** (SW) | A named fight | Cave mouth on the surface, an interior with the alpha wolf (§3.5 quest 5) |
| **Bandit camp** | The zone's group content | Melee/ranged/healer/leader (the shipped horde pattern), palisade = blocking closed path. Stays where it is, on the path beside the plateau, and **guards the way north to the north cliffs (Wreckers Bluff), which is also blocked by brambles** (PO 2026-10-25) |
| **The moat bridge** | The direct way in | The bridge over the moat, the City Guard, the open west gate beyond |

### 3.4 Cast (zone 2)

Existing and reusable: `Wolf`, `DireWolf`, `EliteWolf`, `AlphaWolf`, `Bear`,
`DireBear`, `Boar`, `Stag`, `Bandit`, `BanditRanged`, `BanditHealer`,
`EliteBandit`, `Kobold`, `KoboldRanged`, `Spider`, `VenomSpider`, `GiantSpider`,
`Bramble`, `Tobias`, `FallenTraveller`, `LamplessTraveller`, `DeadCarter`,
`CityGuard`, `Hermit`, `Miner`, `Lamplighter`, `ForestSign`.

**Changed:**

- **Fritz** replaces the **Wanderer** (§3.5). The Wanderer is placed only here
  (and in the debug world), so the spawn becomes Fritz; the quest ids he carries
  stay (quest ids are persisted in the quest ledger).
- **FallenTraveller** becomes the **dead woodcutter** (**Woodcutter 1**) and moves out of the
  kobold cave to the dark forest's northern edge, just outside the dark
  (PO 2026-10-25).
- **Small spiders** around the body: `Spider` placed at a low level (5–6
  [PLACEHOLDER]), so the lost-friend quest does not need the dark forest's
  12–14 spiders. ⚑ If they should also look small, that is a `scale` or a
  spiderling definition, not just a level.
- **Lamplighter** moves to the edge of the dark forest, by the spiders: he
  sends the player to the gnomes for lamp oil and teaches **Lamp**
  (§3.8). **LamplessTraveller** is not used in the woods (debug world only).
- **Bramble** switches its gate key from `harvest` to the new `chop` (§3.7),
  so Harvest no longer clears it. The debug world's bramble shortcut follows.

**New:**

- **Kobold leader** (working name `KoboldChief`): elite, holds the shipment on
  the plateau. Content rules: tier + baseline, `factors.ccImmune`,
  `factors.xpFactor`. **Placeholder art now, its own sprite later** (PO
  2026-10-25).
- **Alpha bear** (§3.5 quest 6, §3.7): a named elite in the bear cave, the head of the bears that wrecked the camp. A separate creature from
  the alpha wolf (PO 2026-10-25).
- **Alpha wolf**, the mean one (§3.5 quest 5): a named elite on the wolf line.
  `AlphaWolf` exists as a normal mob; this is a named elite above it.
- **The captive woodcutter** (**Woodcutter 2**) on the plateau: alive, teaches the cutting aura.
- **The gnome tinker** (**Gnome 1**) in Dionsburg's gnome craft district: receives the
  shipment, hands out lamp oil as a quest step (§3.8). Teaches nothing.
- **The woodcutters' associate** (**Woodcutter 3**) in Dionsburg's market district: also teaches
  the cutting aura.
- ~~Goblin~~: **not needed** (PO 2026-10-25: kobolds only).
- A **bandit leader** as a named elite — `EliteBandit` exists and can carry it
  with a name and a script, so this is content, not art.

### 3.5 Quests

**Fritz and the woodcutters.** The word is **woodcutters** (German:
Holzfäller) [PO may rename]. **Fritz**, the woodcutters' foreman, sits at the fire on the road with the
survivors. His camp in the NE was hit by bears, and while his people were
fighting the bears the kobolds fell on them. He mourns his camp, and he is
bitter that the city does not send more guards to deal with "these damn
kobolds". Two of his people are missing (quests 3 and 4 below).

| # | Quest | Giver → turn-in | What | Status |
|---|---|---|---|---|
| 1 | `a-lost-shipment` | Reinhard (Farmlands) → Tobias at Fritz's fire | Find Tobias | BUILT |
| 2 | The shipment (new, working id `the-stolen-shipment`) | Tobias → **the gnome tinker** in Dionsburg | Crate trail NE to the cave, take the shipment from the kobold leader on the plateau, deliver it | NEW |
| 3 | `the-lost-friend`, reworked | Fritz → Fritz | Woodcutter 1, his scout, went south into the dark forest looking for new timber and never came back: find the body at the dark forest's edge, among small spiders | text + placement change |
| 4 | The captive (new) | Fritz → Fritz | Woodcutter 2, his second missing man: found alive, a prisoner on the plateau. Freed, he teaches the cutting aura as thanks | NEW |
| 5 | The alpha wolf (new) | Fritz → Fritz | A mean alpha wolf in a cave to the SW: one named fight | NEW |
| 6 | The alpha bear (new) | Fritz → Fritz | The bear that wrecked his camp, in the bear cave east of the camp: one named fight | NEW |
| 7 | `kobolds-on-the-road` | Fritz → Fritz | Kill 8 kobolds | BUILT, giver changes |
| 8 | Kill the bandits / their leader | — | The group beat; the shipped horde is the template | idea |
| 9 | The lamp oil (new, §3.8) | Lamplighter → Gnome 1 (oil) → Lamplighter | Fetch lamp oil from the gnomes, bring it to the Lamplighter; he teaches Lamp. ⭐ Gnome 1 also offers it after the shipment, already at the bring-the-oil stage | NEW |

**1, `a-lost-shipment` (built).** Reinhard offers it once
`the-sounder-at-the-mill` is complete. Tobias, at the fire: *"Bandits. They took
the cart and burned it up the road. I barely got away, but I still have the
letter."*

**2, the shipment.** Tobias offers it once quest 1 is done.

- **Story, no rewrite of quest 1:** the bandits burned the cart and took the
  purse; the kobolds came afterwards and dragged the crates off. Tobias saw them
  hauling crates into the trees to the north-east.
- **Stage `follow`:** a `reach` objective at the kobold cave mouth. The way
  there is a **trail of lost cargo** from the burnt cart, off the road to the
  NE, past the wrecked woodcutters' camp: `Crate`, `BrokenCrate`, `SackPile`
  (existing props, no new art). Spaced so the next piece is visible from the
  last, but not a second road.
- **Stage `recover`:** `kill` ×1 of the **kobold leader** on the plateau, who
  holds the shipment. A named fight with a count of 1, like
  `the-sounder-at-the-mill`.
- **Stage `deliver`:** bring it to the **gnome tinker** in the gnome craft
  district (PO 2026-10-25). The shipment and Reinhard's letter are for the
  gnome. The turn-in pulls the player into the city, and the gnome then offers
  the lamp-oil quest with the oil already in hand (§3.8).

**3, `the-lost-friend` (reworked).** Same quest id, new story and place: the
friend becomes Fritz's scout, Woodcutter 1, who went south to look over the darker part of
the forest for new timber. His body lies at the dark forest's northern edge,
outside the dark, among small low-level spiders (PO 2026-10-25).
New lines for the giver, the journal and the body (the old ones say "deep in
the kobold den").

**4, the captive.** Fritz's second missing woodcutter, Woodcutter 2, is alive, a prisoner of
the kobolds on the plateau. Objective: `talk_to` the captive. As thanks he
teaches the cutting aura (on his row), which opens the bramble choke: the way
back down from the plateau. Then report to Fritz.

**5, the alpha wolf.** Fritz offers it: a mean alpha wolf has made a cave to
the SW its den and hunts his people. `kill` ×1. The lane to it leaves the road
from the centre of the woods, east of Fritz's fire, and runs south-west to
the mouth (PO 2026-10-25), not from the west entrance. The cave is a **new small
interior zone file** behind a surface cave mouth, like the kobold cave (PO
2026-10-25). ⚑ `tunnel.json` is already a Dire Wolf cave, with both mouths in
the Farmlands; this is a separate one.

**6, the alpha bear.** Fritz offers it: the bear that led the attack on his
camp. It lives in the **bear cave**, whose mouth lies east of the camp in deep
bear territory (§3.7). `kill`
×1, a named elite (on `DireBear`?). Its own quest, separate from the alpha
wolf's (PO 2026-10-25).

### 3.6 The road to Dionsburg

**Before W1-W3** the road ran straight from the river bridge past the fire to the
moat bridge and the west gate (shut, JailBars; the City Guard: *"The gate is
closed. The orcs are too close."*).

**New (PO 2026-10-25):**

1. **The road winds.** Forest masses sit on the straight line; the road bends
   between them. It stays unbroken (§3.1 rule 1).
2. **The bridge stays** (PO 2026-10-25, reversing the earlier "the bridge is
   broken" call): the road crosses the moat on the `Bridge` prop. The City
   Guard stands on the woods side and greets: *"The gate is open. Stay sharp,
   the orcs are not far."*
3. **The west gate is open**, straight ahead over the bridge. The JailBars go.
4. **A second way in, underground:** the kobold cave's east branch (§3.7) comes
   up on the city side of the moat, near the gate.

### 3.7 The kobold cave and the plateau

**The cave grows.** `koboldCave.json` (48×28 today) becomes a big cave whose
mouth sits just west of the wrecked woodcutters' camp in the NE (PO
2026-10-25: a little more west; the east is deep bear territory). Inside, three
parts:

- **The west branch** climbs to the **kobold plateau** and comes out on it
  (a cave exit up on the plateau).
- **The east branch** comes out on the city side of the moat, near the open
  west gate: a second way to the city (§3.6).
- **A passage into the bear cave.** The **bear cave** is its own cave with its
  own mouth east of the camp, in deep bear territory, and the alpha bear's den
  at the back; it joins the kobold cave inside (PO 2026-10-25). The bears that
  wrecked the camp came from there. ⚑ Recommended: one interior file
  (`koboldCave.json` with one more exit + anchor) rather than a second file,
  since the two caves connect; the player sees two caves either way.

Both branches are new exits + anchors on the cave's `exits`/`anchors` lists, so
nothing new in the zone format. The cave is `Gloom`.

**The kobold plateau** is the NW section of the woods: raised, cliff-bounded,
the kobold leader's seat. ✅ It already exists, above the upper river bridge
(the bridge runs below it; the plateau does not connect to the Farmlands). It
holds the kobold leader with the shipment, the captive woodcutter and the
kobold camp.

- **One connection to the lower woods**, choked by **thick brambles**. Only the
  new cutting aura clears them. Two ways to get it:
  1. **The captive** on the plateau teaches it as thanks. The player who came
     up through the cave cuts the brambles to get back down: a shortcut
     opened from the far side.
  2. **The woodcutters' associate** in the city's market district teaches it.
     A player who has it walks straight up through the brambles and skips the
     cave.
- **A second bramble gate, not on the plateau:** the **cliff path**, guarded by
  the bandit camp, leads north to the north cliffs (Wreckers Bluff) and is
  blocked by brambles at the top. Getting north means the bandits *and* the
  cutting aura (PO 2026-10-25). It runs roughly along today's road north from
  the fire, but winding through the woods like the main road (PO 2026-10-25).
  ⚑ Today's north cliff line is unbroken where that road ends, so the
  brambles fill a gap cut into it.
- **The cutting aura** (working name `Hatchet`, gate key `chop`): the Pickaxe
  pattern (`smash`, the rockfall) applied to brambles. A gated utility aura:
  damage only to things that list `chop` in their `gateKeys`, nothing to
  combat mobs. `Bramble` moves from `harvest` to `chop`; Harvest's description
  stops naming bramble walls.

### 3.8 The dark forest and the light

The SE of the woods is the **dark forest**: far darker than the canopy, the
spider nest (12–14). The dead woodcutter (quest 3) lies just outside it, to the
north, among small spiders. At its edge, by the spiders, stands
the **Lamplighter** (PO 2026-10-25): nobody gets through the dark forest
without a light, and his lamps are dry. He needs lamp oil from the gnomes in
the city. His lines change.

**Torch and Lantern swap names** (PO 2026-10-25):

| Skill def (internal name, id) | Kind | Was called | Now called |
|---|---|---|---|
| `Torch` (46) | passive, dim light, runs beside an active aura | Torch / Fackel | **Lamp** / Lampe |
| `Lantern` (6) | active aura, bright light, takes the aura slot | Lantern / Laterne | **Torch** / Fackel |

⚑ Recommended: swap the **display names only** (`api/lang/en` + `de`
`skill.*.name`, and the two `packIcon`s), and keep the internal names and ids:
skill files and ids never change (CLAUDE.md content rules), and every teach
row, the ascension catalog (`api/ascension/lantern.json`) and the lang keys
reference the internal names. ⚑ Knock-on: the **Emberkeeper** teaches the fire
line Torch → Ignite → Immolate, starting with the passive (`Torch` 46). After
the swap that line would start with "Lamp". §3.9 Q8.

**Quest 9, the lamp oil** (new, working id `oil-for-the-lamps`). The
Lamplighter teaches **Lamp** (the passive) on the turn-in (PO 2026-10-25).
Two stages, two ways in, **one quest**:

1. `fetch`: get the oil from **Gnome 1** in the gnome craft district
   (`talk_to`; the gnome only hands it over, he teaches nothing).
2. `bring`: bring the lamp oil to the Lamplighter. Turn-in: Lamp.

- **From the Lamplighter:** he offers it at stage 1.
- **From Gnome 1:** after the shipment is delivered (quest 2), the gnome
  offers the same quest with stage 1 already done: the player starts at
  `bring`, even without having met the Lamplighter (PO 2026-10-25). Its tracker
  then reads "bring the lamp oil to the Lamplighter".
- ⚑ **Engine check:** `offer_quest` always lands on the quest's first stage
  and refuses `fromStage`/`toStage` (`interaction.go`). Two ways to get the
  gnome's entry: an `offer_quest` + `advance_quest fetch → bring` on the same
  row (if one row may start and advance a quest in order), or a small engine
  change letting `offer_quest` name the stage it lands on. Check before
  authoring.

**The gate** (PO 2026-10-25): **the gnome hands over the oil only to a player
who has delivered the shipment (quest 2) or is level 7** [PLACEHOLDER level].
The gate sits on the oil itself, so it holds on both ways in: the Lamplighter
offers the quest to anyone, but the `fetch` step only completes at the gnome
under either condition. ⚑ An "either/or" gate is likely two gnome rows (one
behind the shipment, one behind the level, the Front Captain's level gate as
the precedent); check what the conversation gates support before authoring.

**`the-lost-lamp` is retired** (PO 2026-10-25): remove its rows, keep the
quest file and its id (the `the-strays` precedent, `cleanup.md` #7).

### 3.9 Open PO calls

1. ~~Where does the bandit camp go?~~ **Ruled 2026-10-25:** it stays on the
   path beside the plateau and guards the bramble-blocked way north. The
   bears stay in the NE as the ones that wrecked the camp.
2. ~~The long way to the west gate~~ **Moot (PO 2026-10-25):** the bridge is
   back, so the road reaches the open gate directly. Was: the gate is open but "a longer way to
   reach" (PO). With the bridge broken, the moat cuts the woods off from the
   city along their whole east side, and its only other crossing today is the
   bridge at its far north end. So which overland way does a player who skips
   the cave walk? Options: north
   through Wreckers Bluff to the moat's north bridge (which now runs past the
   bandits and through the north brambles), or a ford/crossing
   further south. ⚑ PO 2026-10-25: not sure yet.
3. ~~The alpha bear~~ **Ruled 2026-10-25:** a separate creature from the alpha
   wolf, each with its own quest (§3.5 quests 5 and 6).
4. ~~`the-lost-lamp`~~ **Ruled 2026-10-25:** retired. The Lamplighter teaches
   Lamp after the lamp-oil quest (§3.8).
5. ~~The light gate~~ **Ruled 2026-10-25:** the gnome gives the oil to a
   player who delivered the shipment or is level 7, either one (§3.8).
6. ~~Names~~ **Placeholders until named (PO 2026-10-25):** Woodcutter 1 (the
   dead scout), Woodcutter 2 (the captive), Woodcutter 3 (the market
   associate), Gnome 1 (the tinker). "Woodcutters" stands as the word for now.
7. ~~What does the Lamplighter teach?~~ **Ruled 2026-10-25:** Lamp (the
   passive, today's Torch) after the oil; the Torch/Lantern names swap (§3.8).
8. ~~The new Torch's role~~ **Moved out (PO 2026-10-25): a global question,
   not this plan's.** Parked in `roadmap.md` "Parked threads and watch items"
   with the Emberkeeper knock-on.

### 3.10 Work this implies (built as W1-W3, §3.11)

- **`world.json` (Tiled):** forest masses, the winding road, the moat bridge
  kept, the west gate opened, the woodcutters' camp wreck (NE),
  the kobold cave mouth moved NE (west of the camp), the bear cave mouth (east
  of the camp, the Bears moved east into it), the crate trail, the plateau's bramble choke, the
  bramble-blocked path north past the bandit camp, the dark
  forest's darkness, the wolf cave mouth (SW), the dead woodcutter and the
  Lamplighter placed, the L45 Wolf fixed.
- **`koboldCave.json`:** grown; west branch exit onto the plateau, east branch
  exit by the city gate, the bear cave + its surface exit + the alpha bear, the
  Fallen Traveller moved out.
- **A new interior zone file:** the wolf cave.
- **Dionsburg:** the gnome tinker (gnome craft district), the woodcutters'
  associate (market district).
- **Content:** +5 quests (the shipment, the captive, the alpha wolf, the alpha bear, the lamp oil); the Torch/Lantern display names swapped (en + de), 1 quest
  re-told (`the-lost-friend`), 1 retired (`the-lost-lamp`, rows only); +1 skill (`Hatchet`, key `chop`); +3 combat mobs
  (kobold leader, alpha wolf, alpha bear); +4 NPCs (Fritz, the captive,
  the gnome, the associate); Bramble re-keyed; lines for Fritz, Tobias, the
  City Guard, the Lamplighter, the dead woodcutter. English in
  `api/lang/en/`, German in `api/lang/de/` in the same change.
- **Also stale:** `bears-at-the-walls` asks for 5 Bears at **L16**, but the
  Bears near the City Guard are L6–7; re-level it or move it.
- **Schema:** DB/conf none · wire none now (new NPCs and the kobold leader
  wear existing or placeholder art), **+1 EntityType later** for the leader's
  own sprite, +1 per other new drawn sprite or prop · content as above · zone:
  +1 zone file (the wolf cave), edits otherwise (no new fields: `exits` and
  `anchors` exist).

### 3.11 Build ledger: W1-W3 (2026-10-25)

PO 2026-10-25: all three chunks in one session; Claude drafts the geometry,
the PO polishes it in Tiled; the draft's numbers stand as placeholders.

- **W1 content.** Fritz (`fritz.json`) took the Wanderer's spawn and
  `kobolds-on-the-road` + `the-lost-friend`, and gives `the-captive`,
  `the-alpha-bear`, `the-wolf-den`; the Wanderer keeps only road advice (debug
  world). Tobias offers `the-stolen-shipment` once `a-lost-shipment` is done;
  Gnome 1 turns it in and offers `oil-for-the-lamps` at `bring`; the
  Lamplighter offers it at `fetch` and teaches Lamp on the turn-in; the gnome's
  `fetch → bring` row is gated `any` of the shipment completed / level 7.
  `the-lost-lamp` is parked (rows removed, `cleanup.md` #8), so no row teaches
  the active light any more. New: `KoboldChief`, `AlphaBear` (elites,
  placeholder art), `Woodcutter2`, `Woodcutter3`, `Gnome1`, `Hatchet` (key
  `chop`; Bramble re-keyed). The wolf den's alpha is the existing `EliteWolf`.
  Display names: Torch → Lamp, Lantern → Torch (en + de); FallenTraveller shows
  as Woodcutter 1.
- **Engine (TDD):** `offer_quest` may carry `toStage`, the stage the accept
  lands on (`Ledger.AcceptAt`); CrossValidate refuses an unknown or terminal
  landing stage; the content editor's validator follows.
- **W2 `world.json`.** The winding road (forest masses as blocking `Forest`
  structures under trees), the bridge and the JailBars gone (the PO put the
  bridge back after, 2026-10-25), the cliff path
  north (the old north road, winding) with brambles in a gap cut into the north
  cliff, the plateau's bramble choke cut into its cliff, the plateau's north
  gap to Wreckers Bluff CLOSED (one way down, as ruled), the camp wreck + crate
  trail + the `woodcutters-camp` region (the shipment's `reach`), the bears
  moved east, three new cave mouths (kobold NE, bear, wolf), the Lamplighter +
  the body + four L5-6 spiders at the dark forest's north edge, the chief + the
  captive + crates on the plateau, Gnome 1 in the workshop, Woodcutter 3 at the
  market, the cave's city stairs in the NW corner tower, the L45 Wolf at L4,
  props, trees and decals.
- **W3 caves.** `koboldCave.json` 48×28 → 120×64: the hub keeps its rock, a
  west branch ends at the plateau exit, a south tunnel runs east to the city
  stairs, a neck opens the bear cave (own mouth, the alpha bear, region
  `bear-cave`); kobolds L7. New `wolfDen.json` (origin 6000, 5000, 40×24,
  region `wolf-den`).
- **Choices made while building, for the PO's look:** the captive is a woman
  (Holzfällerin); the Kobold Chief sits at curveLevel 7 (at the Kobold's 3 the
  simharness elite ceiling refuses it); the city stairs moved off the tower's
  brazier; placeholder props (SackPile, LumberStack, ToolRack) swapped for
  drawn ones; the Lamplighter keeps `dire-wolves-in-the-forest` (one Dire Wolf
  nearby).
- **Not done:** Q2 is moot (the bridge is back); `bears-at-the-walls` still asks
  for L16 Bears; the new Torch's role (parked globally).
- **Schema:** DB/conf none · wire none (placeholder art) · content +5 quests,
  +5 mobs, +1 skill, +3 regions, +1 gate key (`chop`, `shared-constants.json`)
  · zone +1 file (`wolfDen`), no new fields · engine: `offer_quest` gains an
  optional `toStage`.
- **Verified:** Go suite red only on the two known (Passages barn words, C1b);
  vitest 1938/0; typecheck; `aurad -validate` 0 findings (main + debug zones);
  `tools/tiled/verify.sh` exit 0; content-editor smoke (only the stale-binary
  note); harness `woods-w123.mjs` 14/14, 0 console errors (seven talks, seven
  door legs).
