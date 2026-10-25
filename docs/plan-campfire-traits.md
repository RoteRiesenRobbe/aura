# Plan: Campfire traits: spend points earned at fires to grow your own camp

**Status: DESIGNED + APPROVED 2026-10-24 (one planning session, PO in chat). R1-R20
RULED (Q1-Q6 answered as proposed, R15-R20), D1-D11 approved, nothing built.** 3 chunks
(§5). ⏸ **Queued behind `plan-appearance.md` (PO 2026-10-24: open work is finished
first): CT1 starts once appearance is complete, C6 AND C0b (the artist's pilot art).**

**Owns:** campfire points, the six camp traits, the camp's rest buffs.
**Builds on:** `archive/plan-downtime.md` (the Camp utility, D1-D9: channel, charges,
`CampChargeCap`), `plan-campfire-menu` work (discovery, restock; memory
`project_campfire_menu.md`), `archive/plan-effect-types-round-2.md` (the stat buff store,
D11-D15), `plan-buff-tray.md` (where the buffs show), the spellbook and its free respec
(`archive/plan-numbers-rewrite.md` D10).
**Amends:** plan-downtime D9 (the charge cap gains a trait term, R6). **Respects:**
`archive/plan-playtest-feedback.md` decision 1 (2026-07-24, no skill tree for abilities):
this is a flat list on its own pool, not a tree (R2).
**Schema (as designed):** DB none (traits ride `character_spellbook` rows, D2, R15; buffs not
persisted, R12) · wire +1 field (`camp_points`, D4) · conf none · content +6 skill files,
+1 `SkillCategory` value, +1 `campTrait` block, `camp-aura.json` gains levels (D7) ·
shared-constants none (the client adds the trait level from its spellbook, D8) · lang +6 names/descriptions (en + de) + spellbook section UI keys.

⚑ Line references pinned 2026-10-24 at `63d7d53f` (main); re-verify before relying on them.

---

## 1. What this is

Today the temporary campfire (the **Camp** button) has no depth: it is a baseline utility
outside the spellbook, a 2.5 s channel that places a 15 s camp healing everyone in a small
ring, and the only thing that grows with the character is its charge cap
(`1 + level/7`). The PO wants the camp to be something a player builds up: points to spend
on making their camp last longer, heal more, hold more charges, and leave the people who
rest at it with small, long-lasting buffs.

The points come from **exploration**: one per permanent world fire discovered. The
traits are a **flat list**, levelled in the spellbook like skills, with free respec.

### 1.1 What already exists and is reused

| Piece | Where | Reused as |
|---|---|---|
| Camp utility, channel, placement | `skills/utility.go:56`, `sys/skills.go` `applyCamp` ~2042 | placement reads the owner's traits (D6) |
| Camp lifetime | `campTTLTicks = 450`, `sys/skills.go:2016` | base of the duration trait |
| Charge cap | `skills.CampChargeCap`, `utility.go:73`; `api/shared-constants.json:127`; client `client-data/Skills.ts` | gains the charges-trait term (R6, D8) |
| Camp mob + aura | `api/mobs/camp.json` (id 65), `api/skills/mobs/camp-aura.json` (id 138, maxLevel 1, heal 12 % max pool per 60 ticks, radius 0.75) | the heal trait sets the aura's level (D7) |
| Discovered fires | `ConnectionStateSystem.DiscoveredCampfires`, `sys/state.go:506`; table `character_campfires` | the point budget, counted (R3, D3) |
| Spellbook | `SkillComponent.Spellbook` (id → level), `character_spellbook` rows, `SpendSkillPoint` / `LowerSkillLevel` in `sys/equip/equip.go:171` | trait levels and spending (D2, D5) |
| Stat buff store | `skills/buffs.go` `ApplyStat` / `StatBonus` (per source: strongest stream counts, equal strength refreshes) | the rest buffs, keyed by the trait's skill id (D9) |
| Speed buff | `skills/buffs.go` `ApplySpeed` (`speedPayload`) | the speed buff (D9) |
| Buff tray | `plan-buff-tray.md` | shows the rest buffs, no new UI |
| World-fire dwell | `trackCampfireDwell` (`sys/state.go`) | the shape of the rest clock (D10) |

There are **46 permanent fires** today (45 bind points in `world.json`, 1 in `tunnel.json`),
so the full pool is 46 points.

## 2. PO rulings (2026-10-24)

- **R1. Points come from a separate pool, earned at fires.** Not the shared skill points,
  so the ability economy and its cost curve stay untouched.
- **R2. A flat list of traits with levels, not a tree.** No prerequisites, no exclusive
  picks; keeps the 2026-07-24 ruling against trees intact.
- **R3. One campfire point per discovered permanent fire.** Counted from the saved
  discovery list, never stored as a number.
- **R4. Spent in the spellbook,** beside the abilities (not at the fire's menu).
- **R5. 1 point per trait level, free respec.** Flat cost, unlike the spellbook's
  escalating curve.
- **R6. v1 traits: longer camp, stronger heal, extra charges, three rest buffs.** Extra
  charges count **only for the camp's owner**; nobody else can take charges from a camp.
- **R7. Plain, descriptive placeholder names, no fantasy names.**
- **R8. Support only.** No damage to mobs, no XP buff, no radius, light or group traits
  for now.
- **R9. Three separate buff traits: max Focus, damage dealt, movement speed.** Small
  percentages, comparatively long-lasting; all skilled buffs apply at once.
- **R10. Buffs come from resting N seconds in the camp's ring, and go to every player
  who rests there,** not just the owner.
- **R11. Strongest wins.** Per buff, a stronger application replaces a weaker one; an
  equal or stronger one refreshes the timer; a weaker one is ignored.
- **R12. Buffs last 5 minutes [PLACEHOLDER] and end on death and logout.** Not persisted.
- **R13. The full pool buys about half of all trait levels.** As fires are added the
  curve gets revisited; the system stays the same.
- **R14. The ability skill tree ruling stands.** This plan does not reopen it.

Second round, same day (§7 Q1-Q6, each taken as proposed; plan approved):

- **R15. Trait levels live in the spellbook as a `camp` category** (Q1): no migration.
- **R16. D1's starting numbers are accepted** (Q2), all still [PLACEHOLDER].
- **R17. The max-Focus buff raises the maximum only; expiry clamps current Focus to the
  new maximum, never below 1** (Q3).
- **R18. A weaker buff stream is kept** and takes over if a stronger one expires first (Q4).
- **R19. Taking damage does not reset the rest clock**; only leaving the ring does (Q5).
- **R20. Permanent world fires give no rest buffs** (Q6).

## 3. Design

### D1 - The six traits

All numbers [PLACEHOLDER]. Names follow R7.

| Trait (en) | Kind | Per level | Max level | At max |
|---|---|---|---|---|
| Camp duration | `duration` | +1 s camp lifetime | 15 | 15 s → 30 s |
| Camp heal | `heal` | +1 camp-aura level (≈ +5 % heal) | 15 | ≈ +75 % heal |
| Camp charges | `charges` | +1 charge on the owner's cap | 5 | cap + 5 |
| Max Focus buff | `buff` (`maxHealth`) | +0.33 % max Focus | 15 | +5 % |
| Damage buff | `buff` (`damageDealt`) | +0.33 % damage dealt | 15 | +5 % |
| Speed buff | `buff` (`movementSpeed`) | +0.33 % movement speed | 15 | +5 % |

80 trait levels in all; the 46-point pool covers ~57 %, the "about half" of R13.

### D2 - Traits are skills of a new category, `camp` (R15)

Each trait is a skill file (`api/skills/camp/*.json`) with `"category": "camp"` and a
`campTrait` block (`{ "kind": "duration" | "heal" | "charges" | "buff", "stat": ..., "perLevel": ... }`),
validated at load (unknown kind or a stat outside the three hard-fails). A trait's level is
its spellbook entry, so it **persists in `character_spellbook` with no migration**, and its
tooltip, icon and lang keys ride the existing skill machinery. The cost is a branch in
every spellbook reader that must ignore or price the new category (server: 5 files,
22 sites; L1).

The alternative (Q1 option 2) is a separate `CampTraits` map with its own table, wire
vectors and messages: cleaner separation, but a migration pair and a parallel copy of
spending, respec and persistence.

### D3 - The pool is counted, never stored

`campPointsTotal = len(DiscoveredCampfires)`; `campPointsSpent = Σ levels of camp-category
spellbook entries` (flat cost, R5). Both derived, so respec and newly placed fires cannot
drift (the `TotalSkillPoints` / `SpentPoints` precedent, `skills/component.go:972`).
Ability `SpentPoints` skips the camp category.

### D4 - Wire: one owner-only field

`camp_points:ushort` beside `skill_points` (`server.fbs:1172`): **available** camp points,
same convention as `skill_points`. Trait levels ride the existing `spellbook` /
`spellbook_levels` vectors.

### D5 - Spending and respec

`SpendSkillPoint` on a camp-category id draws from the camp pool and may buy **level 1**
(a trait starts at 0 = no spellbook entry; unlike abilities, L1 is not free). Lowering a
trait to 0 removes the entry. All six traits are always visible in the spellbook's
campfire section, at 0 when unbought; the client lists them from the catalog by category,
not from the spellbook. Camp entries are never equippable (the equip path refuses the
category).

### D6 - The camp snapshots its owner's traits at placement

`applyCamp` reads the owner's trait levels once and stores them on the camp: lifetime =
`campTTLTicks + duration × perLevel`, aura level from the heal trait, buff strengths from
the three buff traits. A respec while a camp burns changes the next camp, not this one.

### D7 - The heal trait raises the camp aura's level

`camp-aura.json` gains `maxLevel` 16 and level scaling on its heal; the camp spawns its
aura at `1 + heal trait level`. The aura already heals every player in range (L5 of
plan-downtime), so the stronger heal reaches everyone, as today's heal does. (Today's
comment in `applyCamp` "its aura is level 1" becomes untrue: update it.)

### D8 - The charges trait adds to the owner's cap only

`CampChargeCap(level) + chargesTraitLevel`. Server: `RefillCampCharges` (`player.go:639`)
passes the trait level. Client: the cap is derived client-side (no wire field), so the
client adds the trait level from its own spellbook copy (L4). R6's "only for the player"
is the default: no other player can draw charges from a camp, and that stays so.

### D9 - Rest buffs reuse the stat and speed buff stores

Each buff is applied with **the trait's own skill id as the source**, so the existing
store rules give R11 for free (verified 2026-10-24 for both queries: `StatBonus` `buffs.go` ~370 and `SpeedFactor` `buffs.go:945` each count only the strongest live stream per source): per source the strongest live stream counts, an equal one
refreshes, a weaker one cannot extend a stronger one. `damageDealt` via `ApplyStat`,
`movementSpeed` via `ApplySpeed`, `maxHealth` via `ApplyStat` once the pool reads it (Q3,
L3). Duration 5 min = 9000 ticks [PLACEHOLDER]. They show in the buff tray under the
trait's name and icon.

⚑ One nuance of the store, worth the PO's look (Q4): a weaker application is not thrown
away, it ages as its own stream. While the stronger one lives, only the stronger counts;
if the stronger expires first, the weaker takes over for whatever time it has left.

### D10 - The rest clock

Per camp, per player: ticks spent continuously inside the camp's heal ring. At
`restTicks` (5 s = 150 ticks [PLACEHOLDER]) the camp applies its buffs, and re-applies
each aura cycle while the player stays (each a refresh under D9, topping the timer up to
5 min). Leaving the ring resets that player's clock. Players only (no companions, no
mobs). A camp with no buff traits skips the clock entirely.

### D11 - Death and logout clear the buffs

Per R12, nothing is persisted (`CharacterState` already excludes buffs). Death must clear
them: verify whether respawn rebuilds the buff store or keeps it (L6).

## 4. What changes for the author

Six new skill files under `api/skills/camp/`, hand-authored JSON. The content editor does
not get a camp-trait builder in v1 (not in scope); its validator must accept the new
category so it does not flag the files (L7). English names and descriptions go through
`api/lang/` (draft inline, then `node tools/lang/extract-english.mjs`), German in the same
change.

## 5. Chunks

| # | Chunk | Contents | Size |
|---|---|---|---|
| CT1 | Server: pool, traits, core three | category + `campTrait` block + 6 files, pool (D3), spend/respec (D5), wire `camp_points` (D4), duration/heal/charges applied at placement (D6-D8) | M |
| CT2 | Client: the spellbook's campfire section | section with the six traits, +/- like skills, available points, tooltips, charge cap with the trait term | M |
| CT3 | Rest buffs | rest clock (D10), three buffs (D9), the max-Focus pool rule (Q3), death clearing (D11), tray look | M |

### CT1 - Server foundation and the core three
Needs: appearance complete, C6 and C0b (PO 2026-10-24, open work first). **Schema:** DB none (Q1 option 1) · wire +1 field · content +6
skill files, +1 category, `camp-aura` levels · shared-constants none · lang +6 entries.
- `SkillCategoryCamp`, the `campTrait` block, its validator; the six files with the
  buff traits authored but inert until CT3.
- Pool + spend + lower + persist round-trip; ability `SpentPoints` and equip ignore camps.
- `applyCamp` snapshot: lifetime, aura level; `RefillCampCharges` with the trait term.
- `camp_points` on the wire (client may ignore it until CT2).

**In-game (PO):** none yet (no spending UI, and the `SKILL` cheat takes no level); the
verify harness sends the spend messages, places a camp and reads TTL, heal and charges. The
PO's first look comes with CT2.

### CT2 - The spellbook's campfire section
Needs: CT1. **Schema:** none beyond CT1 · lang: section UI keys (en + de).
- A campfire section in the spellbook listing all six traits from the catalog, levels,
  +/- buttons (`pointerdown`), available campfire points; tooltips via `SkillTooltip`
  (never `title`); the Camp button's `x/y` charge readout includes the trait term.

**In-game (PO):** discover a fire, see a point arrive; spend it, respec it; the Camp
button's cap follows the charges trait; phone layout reads.

### CT3 - Rest buffs
Needs: CT1 (CT2 for a hand test without cheats). **Schema:** none beyond CT1.
- Rest clock, the three buffs, `poolFactor` reading the max-Focus buff with the Q3 rule,
  death clearing, the tray entries.

**In-game (PO):** rest 5 s at a camp with buff traits, walk away, watch three tray circles
run down from 5 min; a second player resting gets them too; rest at a weaker camp and keep
the stronger buff; die and lose them.

## 6. Test strategy

- **Go, red first (CT1):** pool = discovered count; spending a camp trait draws only the
  camp pool and never ability points (and the reverse); buy L1 at cost 1, lower to 0
  removes the entry; persist round-trip of a camp entry; equip refuses a camp skill;
  `applyCamp` TTL and aura level from traits, snapshot unaffected by a later respec;
  charge cap + trait, owner only. Loader refuses an unknown `campTrait.kind` and a buff
  stat outside the three.
- **Go (CT3):** rest clock boundary ticks (`restTicks - 1` no buff, `restTicks` buff);
  leaving resets; R11 with two camps of different strength (stronger stays, equal
  refreshes, weaker ignored while the stronger lives); max-Focus gain and expiry per Q3;
  death clears.
- **Content tests derive, never hardcode:** the pool-vs-levels ratio (R13) computed from
  the bind-point count and the trait files' max levels, asserting it stays near half
  (a warning band, not an exact number).
- **Vitest:** the client's charge-cap formula with the trait term matches the
  shared-constants fixture; the spellbook section lists exactly the camp-category skills.
- **Verify harness:** a camp-traits script: spend, place, read TTL and charges, rest,
  read the tray.
- Then the PO's in-game look per chunk (§5).

## 7. Open PO calls

- ~~**Q1. Where trait levels live.**~~ RULED 2026-10-24: R15. Proposed: **in the spellbook as a `camp` category**
  (D2): no migration, reuses spending, respec, tooltips and persistence, at the cost of
  teaching ~22 server sites and the client spellbook readers to tell the category apart.
  Alternative: own storage (+1 migration pair, parallel spend/respec/wire).
- ~~**Q2. Starting numbers**~~ RULED 2026-10-24: R16. (all of D1, `restTicks` 5 s, duration 5 min). Proposed as in
  D1/D10.
- ~~**Q3. The max-Focus buff and the current pool.**~~ RULED 2026-10-24: R17. Pool buffs on others are refused
  today because "pool needs a mid-fight clamp rule" (`skills/definition.go` `statsOnOthers`).
  Proposed: **gaining raises the maximum only** (current Focus stays and regenerates up,
  the level-up precedent in `player.go:357`); **expiry clamps** current Focus to the new
  maximum, never killing (a floor of 1).
- ~~**Q4. The weaker-stream nuance of D9.**~~ RULED 2026-10-24: R18. Proposed: **accept it** (a weaker buff takes
  over when a stronger expires first), since it never lowers what the player has.
  Alternative: drop a weaker application outright (a special case in the store).
- ~~**Q5. Does taking damage reset the rest clock?**~~ RULED 2026-10-24: R19. Proposed: **no** (presence only,
  KISS); the camp has no safe zone, so resting mid-fight is already costly.
- ~~**Q6. Do permanent world fires give rest buffs?**~~ RULED 2026-10-24: R20. Proposed: **no**; buffs come from
  player camps and their owners' traits only.

## 8. Landmines

- **L1. Every spellbook reader meets the new category.** `SpentPoints`
  (`skills/component.go` ~960) must skip it, the equip path must refuse it, recipes
  (`skills/recipe_apply.go`) must not treat a trait as an ingredient, the client spellbook
  must not list traits among abilities. Grep `.Spellbook` on both sides before CT1 ends.
- **L2. Level 1 is free for abilities, not for traits.** `PointCost` returns 0 for
  level 1 (`component.go` ~906); traits must not go through it.
- **L3. `poolFactor` reads `Derived` only** (`player.go:354-367`), not timed buffs: a
  `maxHealth` `ApplyStat` is a silent no-op until the pool reads `StatBonus`. Mobs have
  their own inline copy (`Mob.MaxHealth()`); the camp buff targets players only.
- **L4. The charge cap is computed on both sides, with no wire field**
  (shared-constants `campChargeCap`, `client-data/Skills.ts`). The trait term must land
  in both, or the button reads `2/3` while the server holds 4.
- **L5. Discovered fires live on `ConnectionStateSystem`, keyed by client**, not on the
  player; the equip system needs that count to price a purchase (a new seam).
- **L6. Buffs on death.** Verify whether a respawn rebuilds the buff store; if it keeps
  it, the rest buffs survive death against R12.
- **L7. The content editor's JS validator** (`validate.mjs`) is a stale-port class
  (feedback 2026-09-11): it must learn `category: "camp"` or every editor open shows six
  errors.
- **L8. Embedded content.** A content edit needs `-content ../api` or a rebuild, and the
  Go test cache does not see it (`-count=1`).
- **L9. A camp has no safe zone** (only world fires, `model/mob/safezone.go`): resting
  for buffs happens with mobs able to walk in. Intended, but say it in the PO look.

## 9. Schema impact

- **DB:** NONE with Q1 option 1 (trait levels are `character_spellbook` rows; buffs and
  rest clocks are not persisted). Option 2 = +1 migration pair.
- **Wire:** +1 owner-only field `camp_points:ushort` on the player state.
- **Conf:** NONE.
- **Content:** +6 skill files, +1 `SkillCategory` value (`camp`), +1 `campTrait` block,
  `camp-aura.json` maxLevel 1 → 16 with heal scaling.
- **Shared constants:** NONE (the formula stays; both sides add the trait level read from
  the spellbook, L4).
- **Lang:** +6 trait names and descriptions (en + de), spellbook section UI keys (CT2).
- **Zone format:** NONE.

## 10. Cross-references

`archive/plan-downtime.md` (Camp D1-D9) · `plan-buff-tray.md` · 
`archive/plan-effect-types-round-2.md` D11-D15 · `archive/plan-numbers-rewrite.md` D10 ·
`archive/plan-playtest-feedback.md` decision 1 · `backlog.md` ~1122 (the GDD's
"Campfire-Build" aura question, untouched here).

## 11. Chunk ledgers

(none yet)
