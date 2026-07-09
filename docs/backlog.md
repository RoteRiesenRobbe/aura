# Feature Ideas / Backlog

Captured from the 2026-07-06 planning session. **Nothing here is scoped or
decided** — these are ideas awaiting a design pass. An idea graduates into
`roadmap.md`, the GDD, or its own design doc when it's picked up; until
then this file is the single place to collect and refine them.

Conventions:

- **⚑** marks an open question (same marker as the roadmap).
- Plain bullets under *"Answered by current state"* are questions that the
  existing code or docs already settle — with a reference instead of a
  re-decision.
- Questions marked *(added during capture)* were not part of the planning
  session; they surfaced from checking the ideas against the codebase.
- All numbers are [PLACEHOLDER], per the project-wide rule.

Skill *content* ideas (specific auras, passives, cooldowns, recipes) belong
in GDD Appendix A, not here — this file is for features and systems.

---

## 1. Gold as a second resource

A per-character currency, separate from the existing combat Resource. Mobs
drop both XP and Gold on death. Gold can be spent to buy unique auras /
passives / cooldowns.

**Status (2026-07-09): parked — reviewed and kept parked.** Confirmed it stays a
backlog idea; the **one-resource / no-economy / no-item-drops** pillars are
**not** reopened for it. Revisit post-v1 if ever. The tensions below stand
(buying is a would-be 6th unlock path against the play-the-world five).

Context from current state:

- The five spellbook unlock paths (Milestone / Monster-Kill /
  World-Discovery / NPC-Teaching / Meta-Progression) are documented in GDD
  §6 and CLAUDE.md → "Spellbook & Unlocks".

⚑ Open questions:

- Per-character or account-wide?
- Is buying with Gold a new (6th) unlock path alongside the existing five,
  or does it merge into one of those?
- Gold only from mobs, or other sources too (quests, discovery rewards)?
- Shop UI: dedicated menu or via an NPC?
- *(added during capture)* "Economy" is explicitly **not** v1.0 (GDD §11 /
  CLAUDE.md → "Not in v1.0"). Is a Gold currency + shop considered economy
  (→ post-v1), or is a per-character-only currency with no player-to-player
  exchange exempt from that exclusion?
- *(added during capture)* Who receives dropped Gold? XP goes in full to
  **all** combat participants incl. recent healers (roadmap item 10 ✓),
  while the old item-drop rule was "drops stay with the last toucher"
  (decided in the same item). Which of the two rules does Gold follow —
  or a third (split)?

## 2. Friendly NPCs & the dialogue system

Peaceful, hand-placed NPCs — the entity behavior behind unlock path #4 (NPC
teaching) — and the open question of whether their interaction is bare
teach-on-approach or player-selectable **branching dialogue** (contextual to
the approaching player), distinct from the existing Zone-Chat concept.

Context from current state:

- The GDD's principle is explicit: "no quest log, no markers" (GDD §7 →
  World-Exploration Clues) and quest-like content is built implicitly from
  existing systems, no dedicated quest system (GDD §8 → "Quest-like Content
  Through Existing Systems"). Whether a dialogue system fits inside
  that principle is the open design question below — the principle itself is
  decided.
- NPC teaching (unlock path #4) is currently designed as teach **on
  approach** (GDD §6); a dialogue system would change or extend that
  interaction model.
- Dependency: peaceful NPCs don't exist yet as an entity behavior (roadmap
  item 9), and there is no dialogue UI.
- **Most of the substrate already exists** (roadmap item 9 → "Friendly NPCs —
  reuse map"): "peaceful" is `model.Faction` (`FactionAligned`), "on approach"
  is the mob aggro sensor circle (`Collisions()` yields the exact approaching
  `PlayerEntity`, so contextual branching is a server-side `if` over state we
  already hold), "static hand-placed streaming entity" is `model/prop.Prop`,
  and the teaching payoff rides the existing 3.7 unlock event. **The only
  genuinely new part is the interaction surface** — a server→client dialogue
  message, a client→server choice message (shaped like `Cheat`/`ChatMessage`
  in `client.fbs`), a client dialogue panel, and a dialogue-tree content
  format (JSON, like `api/skills`/`api/zones`). None of those exist.

⚑ The scoping fork (decide first — it sets everything below):

- Are v1 NPCs **teach-on-approach only** (proximity → unlock, no wire/UI/content
  subsystem, rides existing seams almost for free) **or full branching
  dialogue** (a real new subsystem)? A middle tier also exists: **one-shot
  non-branching lines** (barks/flavor on approach) — text but no choices, so a
  server→client message but no choice channel.

⚑ Open design questions — these dictate what the NPC entity must be able to do:

- **Interaction trigger:** auto-fire on entering the proximity circle (matches
  GDD "on approach"), or an explicit interact key while in range? Auto-fire
  needs a per-player "already greeted" latch so it doesn't re-trigger every
  tick; an interact key needs a new client→server input.
- **Contextuality — what may an NPC branch on?** Just the approaching player's
  progression/spellbook (already server-side), or also world/quest state,
  faction, time-of-day, prior choices with *this* NPC (→ needs per-player
  per-NPC persistent memory → depends on accounts, item 3)?
- **Statefulness / memory:** are NPCs stateless (same reaction every time) or do
  they remember a given player across visits/sessions? Memory is the dividing
  line between "flavor entity" and "persistent quest-giver" and pulls in the
  accounts/persistence dependency.
- **Do dialogue choices affect gameplay outcomes** (e.g. *which* aura is taught,
  or gating an unlock behind a choice), or is it flavor/lore only? If outcomes
  branch, the choice channel must be authoritative and validated server-side.
- **Concurrency / multiplayer:** is a dialogue a private per-player interaction
  (the shared-world default) or can several players converse with one NPC at
  once? Private is simpler and matches "no formal groups in v1".
- **Movement:** are peaceful NPCs strictly stationary (prop-like, simplest) or
  can they wander/patrol (→ needs the mob movement path, not the prop path)?
- **Combat interaction:** can a "peaceful" NPC ever be attacked or become
  hostile (turn-on-attack, faction flip), or is it permanently untargetable?
  The faction primitive supports a live flip; deciding no-flip keeps it simple.
- **Reuse vs. bespoke entity:** build NPCs as a velocity-0 mob variant (shares
  the aggro-sensor + tick + the effect-foundations §8 totem "static active
  entity" seam) or as an extended `Prop` with an attached sensor+behavior?
- **Does branching dialogue conflict with the "no quest log, no markers"
  principle** (see context above), or is it meant to stay within that
  constraint?
- **Authoring & placement:** NPCs placed via an `npcs: [...]` array in
  `zone.json` + a zone-editor mode (consistent with props/spawns), and dialogue
  trees authored as JSON content — confirm this is the pipeline, or is dialogue
  content owned elsewhere?

## 3. Skill tiers

Skills (e.g. passive "Swift") could exist as tiered variants: `swift_1`,
`swift_2`, `swift_3`. Obtaining a higher tier replaces the lower one in the
player's spellbook. Two possible acquisition models: **(A)**
re-rolling/finding the same skill again upgrades it automatically to the
next tier, or **(B)** higher tiers are obtained independently via their own
separate unlock, not contingent on owning the lower tier.

**Status (2026-07-09): resolved → superseded by unlock-gated cap-raises.** The
replacing-tier model was set aside as overlapping the existing per-skill level
system (a "tier" added nothing a level didn't). Instead, an unlock can **raise a
skill's `maxLevel`** (e.g. Swift 3 → 6) — **world/kill/NPC-gated,
skill-point-costed, never an automatic milestone**, extending the specialization
axis, not the `f(character level)` keep-pace axis. Moved to **roadmap item 9 /
execution step 5** + `gdd.md §5`. The open questions below are retained only as
rationale.

Context from current state:

- Baseline the "tier" question is asked against: the spellbook stores
  per-skill levels (`map[SkillID]int`, skill-system Phase 7), points are
  earned per player level and spent/refunded freely, and equipped skills
  scale live. A "tier" as described would be a separate spellbook entry
  (own skill ID), which is a different axis than invested levels.

⚑ Open questions:

- Is "tier" meant as something distinct from the existing per-skill level
  (see baseline above), i.e. tier = new spellbook entry that itself levels
  1..max independently?
- Do tiers differ only in stronger numeric values, or can a higher tier
  introduce a new effect type / different tick interval / different visuals?
- Preference between acquisition model A vs B, or keep both open for now?
- Does this apply to all three skill categories (auras, passives,
  cooldowns), or only passives as in the example?
- What happens to skill points already invested in the lower tier when it's
  replaced — lost, transferred, or irrelevant?
- *(added during capture)* Combination recipes reference ingredient skills
  by name at level thresholds (`skills.ApplyRecipes`, monotonic cascade
  over spellbook levels). If `swift_1` is a recipe ingredient and gets
  **replaced** by `swift_2`, does the recipe still count as satisfied, does
  `swift_2` substitute for it, or can replacement retroactively break a
  recipe path? (Replacement would be the first *non-monotonic* spellbook
  operation — the cascade evaluator currently assumes levels only grow.)

## 4. Location-bound leveling conditions

Certain skills can only be leveled up (spending skill points) at a specific
location — example given: passives can only be upgraded near a forge.

Context from current state:

- Today skill points are spent/refunded freely anywhere via the spellbook
  panel (skill-system Phase 7); this idea adds the first spatial constraint
  on that economy.
- Dependency: handcrafted zones/locations don't exist yet (roadmap item 4);
  a "forge" would be a new world-object type.

⚑ Open questions:

- Does this apply to all three skill categories or only passives as in the
  example?
- Is the condition uniform per category (all passives → forge) or
  per-individual-skill (different skills need different locations)?
- Does the location requirement apply only to leveling up, or also to the
  initial unlock?
- Is this a side-constraint on top of the existing free skill-point system
  (points earned anywhere, spent only at the location), or does it replace
  free spending entirely for the affected category?
- *(added during capture)* How does this interact with free respec after
  death (GDD §5 → Respec)? If points can be refunded anywhere but spent
  only at the location, a death far from the forge strands the refunded
  points — intended friction, or does respec bypass the location rule?

## 5. Temporary companion mobs

Two variants:

- **(A)** A cooldown ability spawns a wolf next to the player. It follows
  the player and attacks the first mob the player attacks, fights until
  death or a timeout (~60 s [PLACEHOLDER]), then despawns. Same concept
  exists for a spawned "heal mob" companion.
- **(B)** A damage aura where, each time a mob dies inside the aura's
  radius, the player spawns a friendly temporary copy of that dead mob,
  which fights alongside the player for a limited duration.

**Status (2026-07-09): placed → execution step 2 (mob depth + totems).** Both
variants are **consumers of the effect-foundations Step-3 spawned-entity/totem
machinery**: (A) a companion = a totem with velocity + owner attribution; (B) the
friendly-copy is charm, needing the parked faction setter. The faction concept
the open questions below ask about **now exists** (effect-foundations Step 1).
Recorded in roadmap item 7; no new spine — extends the totem build
(`plan-effect-foundations.md §8`).

Context from current state:

- Mobs already run the full skill system (`SkillComponent` parity, Phase 6),
  so a companion reusing mob AI/skills/stats is technically plausible as a
  starting point for (B).
- XP participation rule (roadmap item 10 ✓): mobs track damage participants
  keyed by **entity ID**; all participants + their recent healers get full
  XP. A companion is its own entity, so under current code its damage would
  credit the companion, not the owner — see question below.

⚑ Open questions:

- Should "companion" be treated as a new distinct skill category, or as a
  special effect type within the existing Cooldown/Aura categories?
- Are the wolf and heal companions two separate hardcoded cooldowns, or one
  generic "spawn companion" cooldown framework with a swappable companion
  type?
- For (B): does the spawned friendly copy reuse the original mob's AI/stats
  (just re-flagged as friendly), or does it get separate reduced stats?
- Can multiple companions exist at once (especially relevant for B with
  multiple kills in radius), or is this capped?
- Do companion kills/heals count toward the player's XP per the existing
  "XP for all involved" rule — i.e. does companion damage/healing credit
  the **owner** as participant/healer — or is there a separate rule?
- *(added during capture)* There is no faction concept today: aura target
  eligibility is hardcoded by entity type (player damage auras skip
  `PlayerEntity` targets, heal auras target only `PlayerEntity` —
  `sys/skills.go` eligibility predicates). A friendly mob needs an
  owner/faction flag, and every eligibility predicate (player + mob damage,
  heal, resist auras, mob AI aggro) must learn it. Is that faction concept
  in scope for this idea, or a prerequisite designed separately?

## 6. Floating damage number on self-heal

When a player uses a heal aura (which costs Resource per tick as
self-damage, per the existing skill system), show a floating number above
the player to make that Resource cost visible.

Answered by current state:

- *Does a floating-number system already exist?* — **Yes.** Floating
  damage/heal/XP numbers over mobs and players are live (roadmap item 11
  step 3): per-tick `DamageTaken` / `HealReceived` / `XpGained` fields on
  entities, serialized on the wire, rendered by the frontend as literal HP
  since item 11 Phase 1. This idea is an extension, not net new.
- The concrete gap: the heal-aura self-cost path (`sys/skills.go`,
  `applyHealAura` tail) subtracts `Health` directly and only adds the
  `DamagedAmbient` status effect — it never records the amount into the
  floating-number channel, which is exactly why the cost is invisible.
  Direct precedent for the fix shape: the `self_heal` cooldown was recently
  given its floating heal number via `NoteHealReceived` (item 11 review
  follow-up, pinned by `TestCooldown_SelfHealFractionOfMaxAndNumber`).

⚑ Open questions:

- Should the visual differ from normal incoming damage numbers (color/icon)
  to distinguish "self-cost from healing" from "being attacked"? (Today a
  tick's damage is a single aggregated wire number with no cause/style
  channel — distinguishing self-cost would need either a separate wire
  field or a style flag.)
- Visible only to the caster, or to nearby players too? Note: the existing
  numbers are broadcast wire fields — everyone nearby sees them; a
  caster-only number would need per-recipient filtering, which the current
  snapshot pipeline doesn't do.

## 7. Skill hover info + spellbook UI pagination

Add hover tooltips for skills, and a spellbook UI with pagination.

Answered by current state:

- *Should tooltips hide "how to obtain" for combo skills?* — **Decided:**
  combo recipes leave **zero in-game traces** (combo Q10,
  `archive-combo-questions.md`). A tooltip may show a combo-unlocked skill's
  own values like any other skill, but must never show acquisition/recipe
  info.

Context from current state:

- Roadmap item 8 (UI chrome) currently states "no net-new UI elements
  remain; what's left is a styling/UX pass" — this idea amends that.
- Known tech debt: frontend `Skills.ts` hardcodes skill ID → name, maxLevel
  and category, duplicating the backend registry (CLAUDE.md), with "revisit
  (wire or generated file) when the skill list grows" already on record.

⚑ Open questions:

- Hover info needed only in the spellbook, or also on equipped slots
  (active 1–4, passive slots, cooldown Q/E)?
- What should hover info display — name, description, current level/effect
  value, next level preview? (Acquisition info for combos is settled — see
  above.)
- Pagination + categorization: tabs per category (aura/passive/cooldown)
  with pagination inside each, or one paginated list across everything?
  Note: the spellbook-as-inventory decision (roadmap item 2) already splits
  it into the three category sections conceptually.
- *(added during capture)* Tooltip content (descriptions, per-level effect
  values) would deepen the `Skills.ts` registry duplication well past
  name/category. Does this feature force resolving that tech debt first
  (wire-driven or generated skill metadata), or do we accept hand-synced
  tooltip text for now?

## 8. Destructible/respawning movement obstacles via aura hits

World objects that block movement (and likely line-of-sight) can be removed
when hit by an aura. They can reappear either **(a)** once the aura is no
longer active/present, or **(b)** via a respawn timer independent of aura
state.

Answered by current state:

- *Should this be designed together with the LoS world representation?* —
  Largely settled by existing decisions: the map format already carries the
  occluder layer as **two independent per-object flags**,
  `blocks-movement` and `blocks-aura` (roadmap item 4; LoS mechanics owned
  by item 6, TDD §4.2). Destructible obstacles are occluder-layer objects
  that gain **runtime removal/restore** of those flags — this idea should
  extend that map format rather than invent a parallel object type.

⚑ Open questions:

- Does "removable by an aura hit" mean any damage-dealing aura, or only
  auras explicitly flagged as able to destroy obstacles?
- Are (a) and (b) two different obstacle types, or a per-instance choice?
- For (a): does "aura goes away" mean the aura is deactivated/switched, or
  that the caster physically moves out of range?
- Are these meant as decorative obstacles (trees/rocks, per the existing
  GDD aura diagram) or also gameplay-gating ones (blocking access to an
  area)?
- *(added during capture)* For variant (b): the planned map format already
  carries per-instance respawn timers + variance for mob spawn points
  (roadmap items 4/7). Should obstacle respawn reuse that machinery, or is
  it separate?

## 9. Recall to last safe place

Teleport back to the last visited safe place (campfire, town, or other
designed safe point), with a 10-second cast time [PLACEHOLDER] during which
the player cannot take damage, or the cast is interrupted.

**Status (2026-07-09): placed.** The shared "last safe place" tracker +
death-respawn land at **execution step 3** (campfire death-respawn; the respawn
point is set by dwelling N s [PLACEHOLDER] in the fire aura, not an instant
walk-through). Recall itself lands at **step 4** — it is the first consumer of a
new **cast-time + interrupt** primitive and reuses that step-3 tracker; it is a
Cooldown-category spellbook entry. Recorded in roadmap.

Context from current state:

- GDD §3 defines death-respawn at the **last visited campfire** — but that
  is design, not code: the server currently respawns players at a **random
  location** (`sys/state.go`), and campfires are inert stubs since Block 2.
  "Last visited safe place" tracking exists in neither feature yet; both
  recall and death-respawn will need it, which sharpens the shared-state
  question below.

⚑ Open questions:

- Is "safe place" the same set of locations as the death-respawn points
  (campfires, per GDD §3), or a broader/separate category (including towns
  etc.)?
- Clarify the mechanic: is the player invulnerable during the cast, or does
  taking damage interrupt the cast (these are very different)? The wording
  suggests the latter.
- Does anything besides taking damage interrupt the cast (movement, using
  an aura/cooldown)?
- Is there a cooldown on this ability itself, or is it limited only by the
  risk of being hit during the cast?
- Is "last safe point" the same tracked state used for death-respawn, or a
  separate value? (Neither exists yet — see context above.)
- *(added during capture)* Is Recall a skill in the existing Cooldown
  category (a spellbook entry occupying a Q/E slot) or an innate ability
  every character always has? Cast time + interruption would be new
  mechanics either way (current cooldowns fire instantly).

## 10. Social minigames (campfire-anchored)

Purely social/flavor minigames with **no XP and no progression hooks**, isolated
from the core aura loop. Two kinds: **solo highscore games** (darts, spinning
wheel) and **PvP-style duels** (a coin-flip wager vs. another player). Tied to
**campfires** as the existing social/gathering anchor rather than inventing a
new world mechanic.

**Status (2026-07-09): parked, split into two — solo vs. duels** (they share no
technical substrate, so they are tracked separately):

- **Solo highscore games** — zero netcode, trivial content, far-future; a pure
  client feature hung off the campfire.
- **PvP duels** — even a non-combat wager is the **first player-vs-player
  surface**: needs client sync + a consent/anti-grief model, and brushes the
  *no PvP until ~5 years out* line (GDD §9) and *no griefing by design*.
  **Revisit with the PvP decision, not before.**

⚑ Open questions:

- Does a non-combat wagered duel count as "PvP" for the 5-year rule, or is it
  exempt (no resource/combat interaction)?
- Solo games shippable independently, duels deferred to the PvP era?
- What exactly is the campfire hook — an interact prompt, a placed minigame
  object, a dedicated UI?

## 11. Personal zone (housing / hideout / island)

A per-player instanced space (house, island, hideout) with limitable access for
other players.

**Status (2026-07-09): parked — flagged as conflicting with a core pillar.**
"Instanced per player" contradicts the **persistent shared world, no instances**
pillar (GDD §7 — even dungeons are open-world). It also needs
accounts/persistence (item 3) as a hard prerequisite (per-player world state).
Far-future; do not build until the no-instances stance is explicitly revisited.

⚑ Open questions:

- Is a personal instance an accepted **exception** to the no-instances pillar,
  or does the pillar hold (→ this idea dies)?
- If accepted: what persists (layout, placed objects), and how is per-player
  world state stored without writing every frame (TDD §4.3 open question)?
- Access-control model (open / friends / private)?

## 12. Völker / races — different starts

Selectable races with different **start locations / spawn points**, a lore hook,
and different **starting skill selections**.

**Status (2026-07-09): parked, but mechanically seeded.** The **peasant
onboarding** (GDD §5) is the seed: a race = a different starting utility aura +
chore-mob + start location. Multi-spawn is already supported (world foundation)
and a per-race starting loadout is cheap; the weight is **content + lore**. Not
in v1 scope (a large identity feature). Don't-block: nothing should foreclose
per-race starts.

⚑ Open questions:

- How many races, and do they differ only in cosmetics/lore + start, or in
  ongoing mechanics (racial passives)?
- Interaction with meta-progression (races are themselves a sanctioned
  sacrifice-reward category — "new start options", GDD §5; which races are
  available without sacrificing, and do races gate/modify other rewards)?
- Does race choice ever change the mid/late game, or only the first ~level?

## 13. Mounts

Rideable mounts granting a **speed buff**, possibly with their own
abilities/auras.

**Status (2026-07-09): parked — backlog, not v1.** A speed-buff-only mount is
trivial (a buff/passive); a mount with its own kit is a **loadout swap**
(mechanically the cousin of the transformation cooldown, #14). Not in v1 scope.

⚑ Open questions:

- Speed-buff only, or mounts with their own abilities/auras (→ loadout-swap
  machinery)?
- How obtained (unlock / meta-progression / world)?
- Combat while mounted, or dismount-on-combat?

## 14. Transformation cooldown (e.g. bear form)

A cooldown ability that temporarily transforms the player (e.g. into a bear),
**swapping the active auras/passives** for a preset loadout for the duration.

**Status (2026-07-09): parked — a step-4-or-later flourish.** Mechanically a
**temporary loadout override + timer + revert**; interacts with the
exactly-one-active-aura loadout, the token/avatar-state art (roadmap item 8), and
is a cousin of Mounts (#13) and the Ultimate cooldown (GDD §4 — itself a tagged
cooldown, not a new category). Doesn't block anything.

⚑ Open questions:

- Does the transform preset come from the player's own equipped skills, or is it
  a fixed themed kit?
- Can the player act normally (move/switch) while transformed, or is it a
  constrained state?
- Cooldown-vs-duration relationship (and does it share the ultimate's
  reserved-slot idea)?
