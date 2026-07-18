# Content — Zone 1 (village + forest)

**Design intent only.** This doc holds what Zone 1 is supposed to *be and
do*; exact runtime positions live in the zone JSON authored via the editor
(`manual-zone-editor.md`) and are never mirrored here. Conventions →
`README.md` → Content. Everything below is [PLACEHOLDER] until the content
pass (step 6) scopes it; rationale for the two resolved design conflicts is
kept in `archive-content-zone1-capture.md`.

## Intended flow

```
  spawn (peasant) → farmer: turnip-field task → farmer: wolf-pack task
       → farmer sends the player toward the City
       → tunnel guard: warns of the darkness, points to a light-aura clue
       → tunnel (Zone 1 ↔ Zone 2): visibility radius extremely low —
         practically a hard gate, but mechanically PURELY VISUAL (TDD §4.2:
         you can be hit in the dark, you just see poorly)
       → Zone 2 (further forest) → City
```

The tunnel is a **soft gate**: a player *can* walk through blind (darkness
has no mechanical effect), but the low visibility strongly pushes them to
find the Light aura first — the point of the light-role tutorial.

The onboarding beat (spawn with Harvest — equipped, not yet active → chore-mobs to L2 →
**Farmer teaches Damage + Recall** → wolves as first real combat) is the
**peasant onboarding**, decided in GDD §5 and amended in step 6 C1 (Damage
moved from the L1 milestone to the Farmer's ordered teachings @L2).

**In-game since C1:** the Rübenfeld farm start beat — the playfield zone
(`api/zones/world.json`, full Z1+Z2 bounds), 2 solid houses (first rect
props), the turnip field, the Rübenfeld campfire (spawn anchor), path stubs
N + E, and the Farmer.

**In-game since C2 Part 1:** the wildlife ecology (wolf packs hunt boars/
stags and players; bears; the elite wolf deep in the forest) and the NW
dark-forest block-out — solid thicket walls with three entrances, carved
corridors and clearings, darkness circles inside the treeline, the
"something big prowls" signpost at the south entrance, the path extended to
it, plus open-country tree/rock scatter.

**In-game since C2 Part 2:** the forest interior — the Hermit deep in the
NW pocket teaches **Torch** (first light passive; C2 lift 2 folds passive
light into the entity light radius, max over sources), the Dog in the
mid-forest clearing teaches SummonCompanion ("Woof"), and 4 **Bramble**
solid mobs seal the shortcut-corridor mouth (Harvest-gated, XP 0,
~5 min respawn). Same session: the **density pass** (PO directive — more
action between points of interest) roughly doubled props and wildlife
outside the POIs via a deterministic scatter (196→299 props, 52→94 spawns;
wolf packs keep ≥10u from the farm box, prey-only near the farm), and the
start aura was renamed **Harvest** and now spawns equipped but not active.
**In-game since C3:** the solo path east — the **Kobold Hideout**
(boulder ring SE-center at ~(-25,35); melee swarm up front, ranged
volley-kobolds behind; both flee low HP; Light kill-drop @low %), the
**Dark Tunnel** along the north edge (~y-52, x-40→+32; boulder-walled
corridor, chained darkness, lit **spider staging area** at the west mouth
so spiders are met in daylight first), venom spiders + poison pools in the
dark interior, and the **rockfall side passage** (Pickaxe-gated via the
new `smash` tag) hiding the venom-spider nest — densest Antivenom odds.
The **Miner** at the staging area teaches Pickaxe; a road-fork signpost
warns "the middle road is suicide", a second points at the kobold hoard.
Placement truth: `api/zones/world.json`.

## Areas (intent)

Village · farm + turnip field · forest · wolf-pack territory · tunnel mouth.
Rough geography is an open content-pass question (below). A cave/forest
split within the zone would use named sub-regions
(`plan-world-zones.md` §7.6).

## Cast

- NPCs: **Farmer**, **Hermit**, **Dog**, **Miner**, 3 signposts →
  `content-npcs.md`
- Mobs: **Turnips**, **Wolves**, **Elite wolf**, **Bear**, **Boar**,
  **Stag**, **Kobolds** (melee + ranged), **Spiders** (normal + venom),
  poison pools, brambles, rockfalls → `content-mobs.md`

## Open questions (content-pass)

- **Campfire location(s)** — death-respawn anchor + social hub (respawn
  point set by dwelling in the fire aura, step 3).
- **Light-aura clue** — exact wording + world location (no quest log, no
  markers; the tunnel guard points at it).
- **Rough zone geography** — village / farm / forest / wolf territory /
  tunnel-mouth layout.
- **Resistances & damage types** for the Zone 1 mobs — the tag-resist
  mechanic is built (item 11 Phase 2) but every mob defaults to `physical`;
  assign real tags here.
- **Wild boars' role** in the flow.
- **Turnip / chore fantasy per start** — destructive "pull" vs. constructive
  "close a molehill" (mechanically identical, GDD §5).
