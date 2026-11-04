# Plan: Character entries: permanent marks in the spellbook, and Fly is the first

**Status: DESIGNED 2026-11-04 (planning session, PO in chat). R1-R8 RULED, Q1-Q4 RULED
2026-11-04 as R9-R12, D1-D11 PROPOSED, nothing built.** 3 chunks (§5); CE1 runs after CT2,
before quest icons QI1 (R11). CE3 waits for the PO's quest-chain draft.

**Owns:** the `character` skill category (permanent, slotless spellbook entries), the
capability key an entry can carry, and the lock on campfire Fly.
**Builds on:** `archive/plan-flight-paths.md` (the flight itself, unchanged) · the campfire menu
(2026-10-20, `api/mobs/campfire.json`) · `plan-campfire-traits.md` (the `camp` category is the
precedent for a non-slot category: R21 respec skip, R23 door rules) · `archive/plan-ascension.md`
+ `archive/plan-ascension-sites.md` (the catalog and the per-site reward lists) · the
conversation locked row (`locked` + `skill_id`, `server.fbs` ConversationOption).
**Amends:** campfire menu: the Fly row is locked for a character without the capability.
**Schema (as designed):** DB none · wire none · conf none · content +1 category +1 skill
+1 ascension entry +site reward lists, + the PO's quest chain (CE3) · lang +2 keys per entry
(name, description) +1 wall string, German in the same change.

⚑ Line references pinned 2026-11-04 at `db311e30` (main); re-verify before relying on them.

---

## 1. What this is

Today every character can fly between any two discovered campfires from the start. The PO
wants that ability earned: a new character sees Fly greyed out at every fire, unlocks it
through a quest chain from level 5, and the ability is branded as something magical the
character now carries. An ascension can hand it to an heir from creation.

While shaping this the PO asked for a home for that kind of thing in general: a new
spellbook category of **permanent entries the character has**, starting with Fly and later
holding other ascension or quest gifts, permanent effects and things like reputation
standings. This plan builds that category's first layer and designs the second.

### 1.1 What already exists and is reused

- **The spellbook persists discovered skills** (`SkillComponent.Discover`,
  `skills/component.go:834`): a quest-taught entry needs no new storage.
- **Quest rows can teach a skill** (`teach_skill` inside a quest turn-in, applied as one
  atomic row, `sys/interaction.go` applyQuestRow).
- **The ascension catalog grants skills by unlock key** (`ascension/catalog.go`), re-derived
  for the heir at every join from `game.bloodline_unlocks`; each site authors its own
  `rewards` list (`api/mobs/ascension-stone.json`, `front-ascension-stone.json`).
- **A locked conversation row** already streams greyed, inert, and hoverable through
  `skill_id` (`server.fbs` ConversationOption `locked`, `skill_id`).
- **The camp category** (CT1) proves a non-slot category: respec skips it, loaders refuse it
  at doors that make no sense.
- **Flight validation is server-side** (`core/input.go:370` `tryStartFlight`): discovery,
  origin, destination, stun. The Fly row only stamps `flight_offered`
  (`sys/state.go:1512`).

## 2. PO rulings (2026-11-04)

- **R1. Fly is locked until earned; every other flight rule stays.** New characters cannot
  fly; at a fire the Fly row is greyed out. Flying stays free, fire to fire, between
  discovered fires; discovery works as today.
- **R2. The ability is a spellbook entry in a new category of permanent character entries.**
  The PO's direction: one home for ascension gifts, quest gifts, permanent effects and later
  reputation standings ("Friendly with Faction X" as an entry).
- **R3. Scope: layer 1 built, layer 2 designed.** Layer 1 = slotless flag entries (Fly).
  Layer 2 = entries carrying always-on effects, designed in §3 and built when the first
  content wants one. Layer 3 (entries derived from a condition such as reputation) and
  layer 4 (a stats overview with tooltip totals, e.g. total crit chance) are their own
  plans.
- **R4. Only the game removes an entry.** Players never delete one. A granted entry is
  stored; a derived entry (layer 3) leaves when its condition stops holding.
- **R5. The entries live in a spellbook section**, beside auras, passives, cooldowns and
  CT2's campfire section. No separate window.
- **R6. Ascension grants it as a catalog pick.** Fly from creation is one reward among the
  others, so an heir starts with it only if the bloodline chose it.
- **R7. No grandfathering.** Live characters lose Fly at the deploy until they finish the
  chain (the live DB is treated as losable).
- **R8. The PO drafts the quest chain:** it starts in the city at level 5, leads to the swamp
  and back; its last turn-in teaches the entry.
- **R9-R12.** The §7 calls, ruled the same day: the entry is **Wisp Powder** /
  *Irrlichtpulver* (R9); both stones offer it (R10); CE1 after CT2, before QI1 (R11); the
  Character section is hidden until the first entry (R12).

## 3. Design

### D1 - The `character` category [proposed]

A new `SkillCategory` value `character` beside `camp` (`skills/definition.go:23-35`). An
entry has `maxLevel` 1 (the loader refuses anything else in layer 1), costs no skill point
(discovery IS level 1, which `Discover` already does), never enters a slot (server equip
refuses it, the client cannot drag it), and is skipped by every respec (the CT1 R21
pattern: `ResetSkillLevels` and `SpentPoints` ignore the category).

### D2 - An entry may carry one capability [proposed]

`"capability": "fly"` on a character entry, from a closed Go enum with one value today.
`player.HasCapability(fly)` is true when any discovered character entry carries it. ⭐ Both
gates ask this one question, so no Go code names a content skill and no content file names
a Go check. A second entry granting the same capability is legal and adds nothing.

### D3 - Two gates on Fly [proposed]

1. **The row.** `present()` renders the campfire's Fly row `locked` with `skill_id` set to
   the entry granting `fly` (the first by id if several), so the hover shows the entry's
   tooltip, and with one `ConversationLock{kind: SkillLevel, skill: <entry>, value: 1,
   have: 0}` in `locks`: the wall vocabulary the client already renders for skill gates
   (`server.fbs` ConversationLockKind `SkillLevel = 6`, appearance D15). Verified
   2026-11-04: no new wire field. `CampfireRow(GrantFly)` refuses it silently, the locked
   row's twin (`applyTeach` precedent).
2. **The flight.** `tryStartFlight` refuses a request from a character without the
   capability, before every other check, silently (its established pattern). The row alone
   is cosmetic: a crafted `StartFlight` must fail too (L1).

The read-only map (M) and the "Fly" stamp's client board are unchanged: without the row
nothing ever opens the board.

### D4 - Doors that may grant an entry [proposed]

Allowed: quest rows (`teach_skill` in a turn-in), NPC `teach_skill`, ascension catalog,
milestones. Refused by the loader (the R23 pattern): kill drops, recipe results AND recipe
ingredients (an entry is no combination material; YAGNI until content wants it).

### D5 - The first entry [proposed]

One skill file, id 185 (next free after the camp traits 179-184), `category: character`,
`capability: fly`, named **Wisp Powder** (`WispPowder`; German *Irrlichtpulver*, built on
the existing `mob.Wisp.name` = *Irrlicht*), R9. Its fiction comes from the PO's chain. Icon
from the PONETI pack (`packIcon`, memory: icon pack). English in
`api/lang/en/`, German in `api/lang/de/` in the same change.

### D6 - Ascension pick [proposed]

A catalog entry `api/ascension/<entry>.json`, ungated, added to the `rewards` list of each
site that should offer it (Q2). An heir of a bloodline that picked it starts with it from
creation, through the existing join derivation; no new storage.

### D7 - The spellbook section [proposed]

A "Character" section in the spellbook listing discovered character entries with the
standard tooltip (`SkillTooltip.showTooltip`, never a native `title`). Undiscovered entries
are not listed (recipes and gifts stay undocumented in-game, the vision rule). It follows
CT2's section shape if CT2 lands first (Q3).

### D8 - Cheats and harness acquisition [proposed]

`SKILL <entry>` grants it (unlike camp traits it has no point economy to protect);
`SKILL all` and WIZARD include it, so a cheat-driven harness flies as before. Scripts that
fly from a fresh character add `SKILL <entry>` to their start commands (L5).

### D9 - Layer 2: entries with effects (DESIGNED, NOT BUILT) [proposed]

When the first content wants a permanent effect ("+2% crit"), an entry may author the same
`effects` a passive authors, restricted to the passive effect categories. It applies as if
it sat in an extra, invisible passive slot that is always filled: it goes through
`EffectiveStats()` and stacks with slotted passives by the existing rules, so nothing new
computes a stat. A character entry with effects is still slotless, respec-proof and level 1.
⚑ Balance: simharness must model them before the first one ships, since they raise the
ceiling of every build (`cmd/simharness/guardrail_test.go`).

### D10 - Layer 3 sketch: derived entries (for its own plan) [proposed]

An entry may later author a `while` gate (the conversation `Gate` vocabulary); it is
present exactly while the gate passes, recomputed at join and when its inputs change, never
stored. That is how R4's removal happens. Reputation itself (standings, gain, loss) is a
new system and its own plan; this plan only leaves the door shape.

### D11 - Not in scope

Layer 3 and 4 (R3), a forget button (R4), more capabilities, a cost to fly, changes to
discovery, Recall, HOME or portals, grandfathering (R7).

## 4. What changes for the author

- A character entry is a skill file with `category: character`, optional `capability`, no
  slot-related keys; the add-content skill and `manual-content-authoring.md` gain a short
  section (CE1).
- The quest chain's final turn-in grants it with an ordinary `teach_skill` row (CE3).
- A site offers it by listing the unlock key in its `rewards`.

## 5. Chunks

| # | Chunk | Contents | Size |
|---|---|---|---|
| CE1 | Server foundation | D1-D4, D5 content file + lang, D6 catalog entry + site lists, D8 cheats, harness start commands, authoring docs | M |
| CE2 | Client | D7 spellbook section; the locked Fly row's hover and wall text; unlock banner check on learning | S-M |
| CE3 | The quest chain | The PO's city → swamp → city chain (R8), minLevel 5 on the first offer, last turn-in teaches the entry, en + de | M (content) |

### CE1 - Server foundation
Needs: approval of D1-D11, CT2 done (R11).
Deliverables: the category and its loader rules; the capability enum and `HasCapability`;
both Fly gates; the entry file; the catalog entry and site lists; cheats; updated verify
start commands for every flying script.
**Schema: DB none · wire none · conf none · content +1 category +1 skill +1 ascension entry.**
**In-game (PO):** a fresh character sees Fly greyed at a fire and cannot fly; after
`SKILL <entry>` the row is live and flight works as before; respec keeps the entry; an heir
who picked it at a stone can fly once a second fire is discovered.

### CE2 - Client
Needs: CE1. Ideally after CT2 (shared section shape, Q3).
**Schema: DB none · wire none · content none · lang +1-2 UI keys.**
**In-game (PO):** the Character section shows the entry with its tooltip; hovering the
greyed Fly row shows the same tooltip; the section is absent or empty-stated before the
first entry (Q4); phone layout holds.

### CE3 - The quest chain
Needs: CE1 and the PO's draft (quest sheet workflow, memory: reference quest sheet).
**Schema: DB none · wire none · content +N quests +NPC rows · lang en + de.**
**In-game (PO):** walk the chain from level 5 in the city to the swamp and back; the last
turn-in shows the unlock banner and the Fly row opens at the next fire.

## 6. Test strategy

- **Go, red first (CE1):** category parse (maxLevel ≠ 1 refused, capability on a
  non-character skill refused, unknown capability refused); door refusals (kill drop, recipe
  result, recipe ingredient); slot refusal; respec skip; `HasCapability` with zero, one, two
  entries; `CampfireRow(GrantFly)` refused without and accepted with; `tryStartFlight`
  refused without (a crafted request between two discovered fires) and flying with; the
  Fly row presented `locked` with `skill_id` = the entry; the heir derivation grants it at
  join, and the entry survives reconnect and respawn; a quest turn-in whose teach is
  already known still completes (L10).
- **Content tests derive, never hardcode:** exactly one entry carries `fly` today is NOT
  pinned (D2 allows several); instead "every capability in the enum is carried by at least
  one entry" so the lock can never become permanent.
- **Vitest (CE2):** the client's category table covers `character` (completeness pin beside
  the camp one).
- **Verify harness:** a new leg in `c3-flight-client` (or its successor): fresh character,
  row locked, request refused; with the cheat, flight lands. Re-run every script that flies
  (L5) and report counts.
- **`-validate`** with the embedded copy after `cp-defs` (L6).

## 7. Open PO calls

All four RULED 2026-11-04 by the PO.

- ~~**Q1. Names.**~~ **RULED: R9.** The entry is **Wisp Powder**, German the equivalent of
  the existing wisp translation (*Irrlicht* → *Irrlichtpulver*). The category stays
  *Character* / *Charakter*.
- ~~**Q2. Which stones offer it?**~~ **RULED: R10, as proposed.** Both sites' `rewards`
  lists, placed after the ungated combat rewards.
- ~~**Q3. Build-order slot.**~~ **RULED: R11, as proposed.** CE1 after CT2 (both touch
  spellbook sections), before quest icons QI1; CE3 when the draft lands.
- ~~**Q4. An empty Character section.**~~ **RULED: R12, as proposed.** Hidden until the
  first entry, so the section itself does not spoil the gift.

## 8. Landmines

- **L1. Two gates, one question.** The row is cosmetic; `tryStartFlight`
  (`core/input.go:370`) is the real lock. Both read `HasCapability`, never a skill name.
- **L2. Respec and points.** `ResetSkillLevels` and `SpentPoints` must skip the category,
  or a reset unlearns Fly or the entry eats a skill point (CT1 R21 precedent).
- **L3. Slots.** Server equip must refuse a character entry; the client drag guard alone is
  not enough.
- **L4. `Discover` runs the recipe cascade** (`ApplyRecipeCascade`): the ingredient refusal
  (D4) keeps an entry from completing a combination by accident.
- **L5. Harness rot.** Every script that flies from a fresh character breaks at CE1
  (`c3-flight-client`, the recall/home legs; feedback.md already lists stale venues). Sweep
  them in CE1, not later.
- **L6. Embedded content vs `-content ../api`**, and the Go test cache: run content tests
  with `-count=1` after `cp-defs`.
- **L7. The catalog index space.** `Catalog.All()` sorts by unlock key and a site's list
  owns its order; adding an entry shifts sorted positions. Re-run
  `TestAscensionSites_AtLeastOneOrdersItsRewardsItself` and `c2a-ascension-site`.
- **L8. Reconnect and respawn.** A quest-taught entry rides the persisted spellbook; an
  ascension one is re-derived at join. Check the reconnect stash restores it before any
  flight check reads it (CT1 memory: rebuild doors).
- **L10. An heir who already flies meets the chain.** Verified 2026-11-04: `applyQuestRow`
  skips a `teach_skill` the player already knows and still advances the quest
  (`sys/interaction.go:1484`), so the chain stays completable and its last turn-in teaches
  nothing new. No negated `skill_level` condition exists, so hiding the chain from such an
  heir would need new vocabulary; not planned. Pin the no-op turn-in in CE1's tests.
- **L9. Deploy notice.** R7 takes Fly from every live character: say so in the changelog
  on the deploy that ships CE1.

## 9. Schema impact

- **DB: NONE.** Quest-taught entries live in the persisted spellbook; ascension picks in the
  existing `game.bloodline_unlocks`.
- **Wire: NONE.** The locked row uses `locked` + `skill_id`; the category is client content.
- **Conf: NONE.**
- **Content:** +1 skill category, +1 skill file, +1 ascension entry, site reward lists;
  CE3 adds the chain.
- **Lang:** the entry's name and description, a wall string if the generic one does not
  read well, the section heading; German in the same change.

## 10. Cross-references

`plan-campfire-traits.md` (CT2's section shape, R21/R23) · `plan-ascension-ceremony.md`
(the gift step will list this entry like any reward) · `archive/plan-flight-paths.md`.

## 11. Chunk ledgers

(none yet)
