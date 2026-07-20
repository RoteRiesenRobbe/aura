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

Game *content* ideas (specific auras, passives, cooldowns, recipes, NPCs,
mobs, lore, story, locations) belong in the `content-*.md` catalogs (see
`README.md` → Content), not here — this file is for features and systems.

Scoped, estimated work items from the 2026-07-18 pre-C8 intermission (bugs,
config fixes, audits, small lifts) live in `plan-intermission-triage.md` —
that doc absorbs item 6 below (heal self-cost floating number) for execution.

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

**Extension (captured 2026-07-09): conditional teaching — teach only after a
favor/deed (implicit questing).** Some teachers don't teach on approach but
only once the approaching player satisfies a condition — e.g. culled a nearby
harvest-mob/mob population, reached a level, or already knows a prerequisite
aura. The condition is **never displayed as a quest**; the NPC hints at it in
dialogue/barks and the world makes it legible (GDD §8 → "Quest-like Content
Through Existing Systems"). This extends the scoping fork above rather than
being a new backlog entry — a conditional teach is one more server-side `if`
in the same contextual-branching seam the context bullets describe.

Context from current state *(added during capture)*:

- **Progression conditions are free:** player level, spellbook contents, and
  prerequisite-aura levels are already server-side per-player state — the same
  substrate the "contextual branching" bullet above relies on.
- **"Population culled" splits into two very different conditions.**
  **(a) Area population state** ("the field is currently empty") *is*
  queryable today: `MobSystem` spawn points track `liveMobID`/`respawnAt`
  (world foundation chunk 4), so "all N spawns of X currently dead" is a read
  over existing state — but it is **shared**: anyone's culling satisfies it.
  **(b) Personal contribution** ("*this* player killed N of them") needs
  per-player cumulative kill counters, which don't exist — mobs track combat
  `participants` per fight for XP attribution and clear them on death/regen —
  and *persistent* counters additionally pull in accounts (item 3).
- **Hinting requires text:** a hinted condition needs at least the middle tier
  of the scoping fork (one-shot barks — a server→client text message, no
  choice channel). A conditional teacher is therefore an argument **against**
  settling on bare teach-on-approach-only for v1.

⚑ Open questions (conditional teaching):

- Does a hinted-but-hidden condition stay inside the **"no quest log, no
  markers"** pillar, or does it create frustration that pressures us toward
  quest UI later? The clue-anchor calibration rule ("not obvious, but
  comprehensible in hindsight", GDD §7) looks like the right bar — confirm it
  explicitly governs teach conditions too.
- Which condition types are sanctioned for v1? Level / prerequisite-aura
  (free), area-population state (reads existing spawn state, but shared), and
  per-player kill counts (new counters + the persistence question) have very
  different costs — see context above.
- For population conditions: is "someone culled the field" acceptable (shared
  world — you can arrive just after another player's culling and be taught
  for free), or must the deed be personal (→ per-player counters)?
- Do the NPC's barks progress with the condition (fresh hint → "almost there"
  → teach), or is it binary hint/teach? Progressing barks need the condition
  evaluated per approach with thresholds — more content than code, but decide.

⚑ To narrow the design & implementation down *(formulated 2026-07-09 — answer
these before scoping the feature)*:

- **Condition vocabulary:** which condition types exist at all? Candidate
  set so far: player level ≥ N, knows skill X (≥ level L), area population
  state, personal kill count. Is that the closed v1 set, and is each new type
  a hand-written Go predicate (mirroring the effect-type decision F1 — no
  scripting), dispatched from a JSON `condition` block on the NPC def?
- **Authoring home:** where does a conditional teacher live as content — an
  `api/npcs/*.json` registry (name → taught skill + condition + hint lines,
  mirroring `api/props/`) placed via an `npcs: [...]` array in `zone.json`
  (the roadmap-item-9 placement note)? Confirm that's the pipeline before
  building.
- **Evaluation timing:** condition checked once on entering the sensor circle,
  or continuously while the player stands in range (matters for "cull the
  field" — the player may complete the deed *while standing next to the NPC*;
  once-on-enter would force a leave-and-return)?
- **Latch semantics:** if the condition was satisfied once but no longer holds
  at approach time (the field respawned on the walk back), does the teach
  still fire? A "was ever satisfied" latch is per-player-per-NPC state — the
  same memory/persistence dividing line as the statefulness question above.
  A no-latch design ("must hold at the moment of approach") needs zero state
  but can feel unfair with slow walks vs. fast respawns.
- **"Already taught" needs no state** — verify and rely on it: teaching an
  already-known skill is a spellbook no-op, so re-approach is naturally
  idempotent. Only *progressing barks* (not the teach itself) require memory.
- **Deed feedback:** does completing the condition produce any cue (bark
  change on next approach only? nothing?), or is silence acceptable under
  the no-quest-UI stance? This is where frustration pressure would first
  materialize — decide the calibration explicitly.
- **Composition:** can one NPC require multiple conditions (level AND culled
  field)? And do camp-membership checks (item 15) ride the same condition
  seam (one more predicate) — keeping conditional teaching and camp
  exclusivity a single mechanism instead of two?
- **Wire footprint:** server-side gating needs zero wire; hint barks need the
  scoping fork's middle tier (one-shot server→client text). Confirm the
  feature is fully expressible without a choice channel — if yes, conditional
  teaching does *not* force the full-dialogue branch of the fork.

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

First concrete content instance of (A): the shipped **SummonCompanion**
cooldown, plus the dark-forest dog NPC teaching idea — see
`content-cooldowns.md` / `content-npcs.md` (2026-07-16).

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

World objects that block movement (~~and likely line-of-sight~~ — aura LoS
cut 2026-07-10) can be removed when hit by an aura. They can reappear either **(a)** once the aura is no
longer active/present, or **(b)** via a respawn timer independent of aura
state.

Answered by current state:

- *Should this be designed together with the LoS world representation?* —
  **Moot since 2026-07-10: aura LoS was cut** (roadmap item 6, TDD §4.2);
  only `blocks-movement` remains meaningful (`blocks-aura` is pending
  deletion). Destructible obstacles are objects that gain **runtime
  removal/restore** of movement blocking — this idea should extend the
  existing map format rather than invent a parallel object type.

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

**Extension (captured 2026-07-09): aura-gated doors/passages.** A variant of
this item, not a new one: a world object (door, barrier, magical seal) that
opens only when hit by **one specific aura** — the harvest-mob tag-resist
pattern (GDD §5 peasant start, §8 harvest mobs) applied to world geometry
instead of mobs. Serves as an attunement/progression gate built entirely from
existing systems. The generic "removable by aura hits" mechanics above stay
the substrate; the gate variant narrows *which* aura qualifies (via a tag)
and raises the world-state questions below.

Context from current state *(added during capture)*:

- **The selectivity is fully shipped** (item 11 Phase 2): a bespoke damage tag
  + "resists every tag except that one" is exactly the peasant chore-mob
  mechanism (GDD §5) — zero new code for "only aura X affects it".
- **Props are the wrong substrate today:** `model/prop.Prop` is deliberately
  lean — no health, no damage path (`PlayerTouches`), no per-entity runtime
  state — so an aura-hittable obstacle is *not* a prop without growing one.
- **The closest existing shape is a stationary mob.** Mob JSON can already
  override `collisionLayer` to include `LayerPlayerStaticCollision` so players
  physically collide with it (`api/mobs/angry-mammoth.json` does this today),
  and mobs carry `maxHealth`, full tag `resistances`, and the world-chunk-4
  spawn-point respawn timer. A "sealed door" ≈ a movement-blocking harvest-mob
  whose death removes the blocker and whose respawn timer is the reseal —
  variant **(b)** machinery exists end-to-end on the mob path. (Caveat: raw
  collision-layer ints in mob JSON are a standing hand-sync hazard whenever
  `model/layers.go` changes — CLAUDE.md, 2026-07-09 dead-code sweep.)
- ~~`blocksAura` on props is parsed but inert until item 6 (LoS)~~ —
  **superseded 2026-07-10: aura LoS was cut** (roadmap item 6, `tdd.md`
  §4.2). Gates can never block auras; only the movement-blocking +
  tag-resist halves of this idea survive. The inert `blocksAura` plumbing
  is decided for deletion (sweep pending).

⚑ Open questions (gate variant):

- **Open state: permanent, per-player, or timer?** Per-player is the loaded
  one: a door open for you but closed for me is the first per-viewer
  divergence of shared world state — in tension with the persistent-shared-
  world pillar ("everything visible, everything shared", GDD §9) and with the
  stealth decision that already rejected per-viewer info hiding (effect
  foundations F9). Permanent-open is persistent world state (TDD §4.3's open
  "how is world state persisted" question). Timer-reseal is the only variant
  that needs nothing new.
- Is "one specific aura" via a bespoke damage tag (chore-mob style) the
  intended mechanism, or should the gate check skill identity directly? The
  tag route is free but means the gating aura *is* a damage aura with a
  unique tag (like Harvest).
- Implementation fork: door-as-stationary-mob (all machinery exists, but it's
  semantically a mob on the wire/minimap and needs an `EntityType` for its
  look) vs. props gaining health/damageability (cleaner concept, new code).
  Decide when picked up — don't build both.
- A door opened by one player is open for everyone present — free passage for
  players who can't cast the gating aura. Intended (matches the role-design
  pillar — one attuned player escorts the group) or must passage be personal
  (→ the per-player problem above)?

**Scaling check (2026-07-09): ~20 individual key-aura ↔ door interactions.**
Refined shape: **key auras** dropped by mobs (the shipped kill-drop unlock
path — WildAura/SlowAura precedent) + **door mobs** resistant to all damage
except that one key aura's tag. Checked against the current resistance
implementation and decisions:

- **Runtime: trivial.** `skills.ResistMultiplier` is per-tag map lookups per
  hit; 20 (or 200) distinct tag↔door pairs cost nothing at runtime.
- **Authoring: does NOT scale as-is.** Tags absent from a resistance map are
  **unresisted** (×1, `skills/resist.go`) — there is no "resist by default".
  "Resists everything except `key_diamond`" must enumerate **every other tag
  in the game at 0** (including the default `physical`). At 20 doors that is a
  20 × (N−1) zero-entry matrix, and **adding tag #21 means editing all 20
  existing door defs** — the same hand-sync hazard class CLAUDE.md flags for
  raw collision ints. The escape hatch is already on record: the item-11
  Phase-2 decision (B4) deleted `Vulnerability` noting *"a `"*"` resist key
  can resurrect it if ever needed"* — a *wildcard default multiplier*
  (`resistances: {"*": 0, "key_diamond": 1}`) makes each door O(1) to author
  and new tags never touch existing doors. **The GDD §5 peasant chore-mobs
  already assume "resists every tag except one"** — they hit the same
  enumeration problem first; 20 key-doors turn the wildcard from nice-to-have
  into a requirement.
- **Feedback gap: an immune hit is a designed non-event** (item 11 Phase 2:
  no HP loss, no number, no VFX — nothing). So hitting a door with the wrong
  aura shows *nothing*, which for a puzzle-gate is illegible. The deferred
  "RESIST" hit styling (deferred "until content ships a real immunity") finds
  its trigger here — 20 key-doors *are* that content.
- **Spellbook/UI at 20 key auras:** ~20 single-purpose entries crowd the flat
  spellbook list and the equip flow. This lands on **item 7** (hover info +
  pagination — pagination is already on the roadmap-item-8 polish checklist,
  possibly pulled to the content pass) and sharpens it: keys likely want a
  visible grouping (a "key"/utility category or filter), and their tooltip
  must say *what they open* without violating the no-recipe-traces rule
  (that rule covers combos; keys are arguably meant to be legible — decide).
- **Slot friction:** a key aura is an active aura — opening a door means
  equipping + activating it, swapping out your combat aura, possibly mid-cave.
  Intended friction (the light-aura trade-off pattern, GDD §7) or annoyance
  at 20 keys? Note the loadout is only ~4 active slots.

**Collider-shape check (2026-07-09): square colliders for doors.** Wanted: a
door with rectangular collision instead of a circle. Finding — **movement-
blocking squares do not exist today**:

- `phy.Box` exists but is **sensor-quality only**: `intersectWithCircle`
  returns unconditional `true` (bounding-box overlap, no narrow-phase test)
  and **every collision-resolution method panics** (`box.go` —
  `panic("implement me")`). Its only live use is the player/spectator
  **viewport** AOI query box, which never resolves collisions.
- Making a solid square = implement Box↔Circle narrow-phase + push-out
  resolution. The **`InvAABB` work (world chunk 1) is the exact precedent**:
  implement only the pairs that occur (a static box only ever meets dynamic
  circles), leave the rest panicking, no dispatcher/interface changes;
  `aabb.go` even ships `MinkowskiDiff`/`ClosestPointOnBounds` helpers.
  Bounded, well-understood work — but new physics code, and **axis-aligned
  only** (the whole `phy` broadphase is AABB-based; rotated boxes are out of
  scope by design).
- Both content registries are **circle-only** (`api/props/*.json` and mob
  `body.radius`) — a square body needs a shape field in whichever registry
  carries the door, plus the frontend has no square-entity rendering path
  (entities are radius-scaled sprites on the wire).
- **The zero-physics alternative is already free:** a round-collider gate —
  the user's "diamond rock" only attackable by the "diamond drill aura" —
  works today with no `phy` changes (circle body, key-tag resistances,
  chunk-4 respawn as the reseal). Squares are purely a fidelity upgrade for
  door-shaped art.

**Decided (2026-07-09): the `"*"` wildcard resist key will be built.** It has
now come up twice independently — the GDD §5 peasant chore-mobs ("resists
every tag except that one") and the key-aura gates here — which meets the bar.
**Placement: execution-order step 4 (skill-vocabulary fill)**, the last
systems step that touches the damage pipeline before the content pass needs it
for chore-mobs (recorded in `roadmap.md`). One sub-decision is pinned for
implementation time: **multi-tag semantics** — with per-tag multiplication, a
hit tagged `[key_diamond, fire]` against `{"*": 0, "key_diamond": 1}`
multiplies to 0 (fire matches the wildcard). Proposed as correct ("only the
pure key works"); confirm when building.

⚑ Open questions (scaling + colliders):

- Are key auras exempt from the "unlocks leave no in-game traces" posture —
  i.e., may a key aura's tooltip/name say what it opens? (The decided
  no-traces rule covers *combo recipes*; keys as legible world-keys seem to
  want the opposite.)
- Square doors: is the Box↔Circle physics work (axis-aligned only) worth it,
  or do v1 gates ship as round "boulder/seal" objects (free today) with
  square doors deferred until door-shaped art demands them?
- Where does the "keys" UI grouping live — a new skill category (breaks the
  fixed three-category rule, GDD §4) or a display-only tag/filter inside the
  aura category (safer)?

**Alternative unblocking mechanisms — assessed 2026-07-09 (asked: is there a
better way with existing/small systems?).** Yes, plausibly. The key
observation: **an openable blocker is already a required primitive
regardless** — the lava-bridge reference encounter (roadmap item 7) specs
"boss death opens a 5th bridge for 20 min", i.e. a wire-visible
passable/blocked **toggle on world geometry**, owned by the step-2/3
encounter-controller work. Once that toggle exists, "what opens the gate" is
just a trigger wired to it, and three trigger styles compete:

- **(A) Damage-based key aura** (the idea as captured above): hit the door-mob
  with the one aura that damages it. Tactile, combat-native, rides the
  kill-drop → resist machinery end-to-end. Costs: the wildcard (now decided
  anyway), the immune-hit feedback gap, slot friction, and the door being
  semantically a mob.
- **(B) Possession/attunement proximity:** the gate opens for a player who
  *knows* the key aura (spellbook check, not equipped) entering its sensor —
  exactly the NPC teach-on-approach substrate (sensor circle + server-side
  `if` over the spellbook, roadmap item 9 reuse map), and the same predicate
  seam as item 2's conditional teaching. **No slot friction, no feedback gap
  (the gate visibly opens), no door-HP, no mob-shaped door.** Cost: loses the
  cast-at-the-door ritual; reading of the "interact exclusively through
  auras" pillar shifts from *using* an aura to *possessing* one.
- **(C) Dwell-with-aura-active:** stand at the gate N s with the key aura
  active — middle ground (keeps the equip ritual, drops the damage/HP
  machinery); uses the dwell-capture trigger the encounter controller needs
  anyway (also currently unbuilt).

Lean (not decided): build the **blocker toggle once** with the encounter
controller and treat A/B/C as interchangeable trigger types per gate — the
door content then chooses its flavor, and the boss-bridge, key-door, and
"diamond rock" are one mechanism with three triggers.

⚑ Which trigger style is the default for key-gates — A (tactile, friction),
B (frictionless, quest-like), C (middle) — or is per-gate freedom the point?

**Effort estimate — clean `phy.Box` rework (2026-07-09, asked):** squares +
circles as first-class colliders, no hacks/hardcoding, splits into a small and
a medium half:

- **`phy` core: small — the chunk-1 `InvAABB` work is the exact template**
  (same-day-sized: one shape file + one test file). Concretely: a real
  `intersectWithCircle` narrow-phase (closest-point-on-AABB vs. radius, ~10
  lines), `resolveCollisionWithCircle` push-out (per-axis minimal
  translation; `MinkowskiDiff`/`ClosestPointOnBounds` helpers already sit in
  `aabb.go`), `updateBB` exists, plus an end-to-end `Space.Update()`
  confinement test mirroring `inv_aabb_test.go`. Leaving Box↔Box and
  Box↔InvCircle unimplemented is the **established design pattern** (InvAABB
  did the same — static shapes never query each other), not a hack.
- **One behavioral caveat:** `Box.intersectWithCircle` currently returns
  unconditional `true` (BB-overlap = hit) and the **viewport AOI box is its
  only live consumer** — an exact narrow-phase makes AOI marginally tighter
  at box corners (entities whose bounding boxes overlap but whose circle
  doesn't touch the box). Almost certainly invisible in practice, but verify
  the viewport query path when building rather than assuming.
- **The medium half is outside `phy`:** both content registries are
  circle-only (`api/props/` `body.radius`, mob `body.radius`) → a shape
  field; the wire has no rectangular entity (entities are radius-scaled
  sprites) → a width/height or shape wire addition; a frontend rendering
  path for rectangular entities; zone-editor placement/markers for boxes.
  This half dwarfs the physics.
- **Rotation stays out** either way — the whole `phy` broadphase is
  AABB-based; "square" means axis-aligned.

## 9. Recall to last safe place

Teleport back to the last visited safe place (campfire, town, or other
designed safe point), with a 10-second cast time [PLACEHOLDER] during which
the player cannot take damage, or the cast is interrupted.

**Status (2026-07-09): placed.** The shared "last safe place" tracker +
death-respawn land at **execution step 3** (campfire death-respawn; the respawn
point is set by dwelling N s [PLACEHOLDER] in the fire aura, not an instant
walk-through). Recall itself lands at **step 4** — it is the first consumer of a
new **cast-time + interrupt** primitive and reuses that step-3 tracker; it is a
Cooldown-category spellbook entry. Recorded in roadmap. **⚠ See §20** — the
client render-interpolation crawl on large position jumps must be fixed with
Recall, or the teleport will visually creep instead of snapping.

**Update (2026-07-10):** the respawn-point set is decided — **fixed world
campfires only** (GDD §3); player-placed recovery points are never respawn
points. This partially answers the "safe place set" question below: for
*death-respawn* the set is world campfires; whether *Recall* targets the
same set or a broader one remains open.

**Update (2026-07-12):** the tracker + death-respawn are scoped —
`plan-atmosphere-recovery.md` chunk 4 (campfires themselves are its
chunk 2). Recall stays step 4, consuming that tracker.

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

## 15. Camp/faction membership with exclusive teaching (Gothic-style)

*(Captured 2026-07-09.)* A character joins one of several **camps**; joining
is **per-character and permanent**. Exclusivity lives at the **unlock level,
not the skill-point level**: camp A's teachers teach auras that camp B's
teachers never teach. This deliberately creates "choosing one path closes
others" — and it is meant to synergize with the character-sacrifice
meta-progression (GDD §5): sacrificing a max-level character and starting
over is the sanctioned way to experience the other camp.

A WoW-style **two-faction split was discussed and set aside**: without PvP
(none for ~5 years, GDD §9), opposing player factions reduce to exactly this
camp feature — the camp idea subsumes it, so no separate faction entry exists.

**Status (2026-07-09): parked — deliberately left as open questions.** Reviewed
in the capture session; the pillar conflicts below are acknowledged and **not
resolved** — we'll get to it later (earliest sensibly with accounts/persistence,
step 8, which it hard-depends on anyway).

Context from current state:

- `model.Faction` (effect foundations Step 1) is a **combat-targeting**
  primitive (Aligned/Hostile), not membership — camp identity would be a new,
  orthogonal per-character field. All camps' NPCs stay `FactionAligned`
  toward every player unless the territory question below decides otherwise.
- The teaching substrate is NPC teaching (unlock path #4; reuse map in
  roadmap item 9, interaction surface in item 2 above). "Teaches only camp-A
  members" is mechanically one more conditional teach — the same server-side
  `if` as item 2's conditional-teaching extension, over a camp field instead
  of a level.
- Camp membership is **permanent per-character state** → hard dependency on
  accounts/persistence (item 3, execution step 8). The game runs
  session-based until then; a permanent choice can't exist before persistence
  does.
- Character sacrifice is explicitly **post-v1** (GDD §11), repeatable, and its
  rewards are constrained to **"breadth, never power"** (GDD §5).
- Combination recipes resolve ingredients against the spellbook
  (`skills.ApplyRecipes`, monotonic cascade): a camp-A-only ingredient
  **transitively camp-gates every recipe downstream of it** — and recipes are
  secret, so that gate is invisible to the player.
- Adjacent idea: #12 (races — different starts) is also a per-character
  identity choice, but cosmetic/start-flavored and parked; camps would be the
  first identity choice with **mechanical exclusivity**.

⚑ Open questions:

- **Pillar conflict — "no fixed class path" (GDD §5) + free respec:** a camp
  is a permanent, irreversible per-character choice in a game whose
  progression is otherwise fully reversible (points refundable anywhere,
  death = free respec). The claimed distinction is that exclusivity sits at
  *unlock access*, not *point spending* — is that a difference in kind that
  keeps the pillar intact, or does the pillar need an explicit carve-out
  ("class-free *within* your camp")? Decide deliberately, not by drift.
- **Pillar tension — "everything findable":** camp-exclusive auras are the
  first spellbook content deliberately unreachable for a given character. The
  five unlock paths (GDD §6) so far implicitly assume any character can
  eventually find anything. Accept and document the exception, or reject it?
- **Sequencing hole with sacrifice:** the sanctioned way to see the other camp
  is sacrifice-and-restart, but sacrifice is post-v1 **and requires max
  level**. If camps ship before (or without) sacrifice, "experience the other
  camp" = reroll with zero reward — acceptable interim, or do camps wait for
  the sacrifice system?
- **Power calibration:** does the sacrifice rule get a camp analog — *"does a
  member of camp B feel weaker for their choice? If yes, the camp reward is
  miscalibrated"*? Side-grades only (Purple-Rain calibration, GDD §5) keep the
  choice flavor+identity; power-bearing camp exclusives make the choice a trap
  and alt-rerolling mandatory (the SWG-Hologrind lesson GDD §5 cites). Decide
  before authoring any camp-exclusive aura.
- **Recipe interaction — intended depth or trap?** A secret recipe with a
  camp-A-only ingredient is invisibly unreachable for camp B: a player can
  max every ingredient they *can* see and never learn why nothing happens;
  cross-camp recipes are structurally impossible per character. Options to
  decide between: recipes stay camp-agnostic (no camp-exclusive ingredients),
  recipes are deliberately camp-themed (each camp has its own discoverable
  recipe tree), or fully free composition including silent dead ends.
- **Scope of exclusivity:** teaching only, or does membership also affect
  world access / NPC hostility / territory (Gothic camps were territorial)?
  Hostile camp territory brushes both **no PvP** and **no griefing by
  design** — flag early if territory is intended.
- How many camps, at what point does a character join (level gate? a zone-2
  beat?), and can a character remain campless indefinitely (keeping access to
  the non-exclusive teaching pool)?

## 16. Single-charge respawn campfire

*(Captured 2026-07-10 — explicitly **not** a current decision; a potential
future content idea only.)* A player-placed campfire that allows **one**
respawn and then goes out; banned near boss/elite areas.

Context from current state:

- Deliberately in tension with the 2026-07-10 respawn decision (GDD §3:
  respawn only at fixed world campfires; player-placed recovery points are
  never respawn points — protects the walk-back penalty and prevents boss
  corpse-zerging). This idea is the sanctioned-exception shape: the single
  charge self-limits the corpse-zerg, and the boss/elite-area ban guards the
  encounter case explicitly.

⚑ Open questions (if ever picked up):

- Does even a single free respawn-in-place erode the walk-back penalty too
  much (one death per fire placement is still one free deep-world retry)?
- How is "near boss/elite areas" defined and enforced — placement rejection
  radius in map data, or authored no-place zones?
- Interaction with the Campfire-Build aura (GDD §4): same skill with a
  charge, or a separate rarer skill?

## 17. Editor-configurable encounters & per-mob scripted behavior

*(Captured 2026-07-12 at chunk-9 verification — user question: "how hard
would it be to allow configuring [scripted boss fights] like that, even for
mobs, in the editor tool?" Assessment recorded; NOT scheduled.)*

Today an encounter is a hand-written Go struct (`encounter/smoke.go`)
registered per zone in `berryhunterd.go`; the zone editor only authors
props/spawns/terrain (+ per-spawn wander/waypoints). Two distinct asks hide
in the question:

**A. Placing/configuring encounter INSTANCES in the editor — moderate,
the sanctioned path.** Keep behavior in Go, expose *parameters* as data:
encounter Go structs become named, parameterized **templates** (e.g.
`guarded-boss{boss, guards[], positions, respawnTicks, fleeRatio, adds}` —
the smoke encounter is already exactly this shape as constants). Cost chain:
a Go template registry (name → constructor taking a params struct) + a zone
schema field (`encounters: [{type, params…}]`, additive/omittable —
gotcha #8's four lockstep places: `world.Zone`, editor `ZoneModel` +
serializer, manual, shipped zone) + resolve/validation at load (template
name, mob names, positions) + an editor mode (place marker, params panel —
the chunk-5 waypoint editor is the UX precedent and cost yardstick). Rough
size: one mob-depth-style chunk. Prerequisite pull: nothing technical —
mostly worth doing when the content pass authors the 2nd/3rd real encounter,
NOT before there are ≥2 templates worth instancing.

**B. Authoring encounter/mob BEHAVIOR itself in the editor — large, and
decided against.** Free-form "when X do Y" configuration is a scripting
DSL wearing an editor UI: triggers, conditions, actions, state — exactly
the encounter-DSL question decided 2026-07-07 (plan-effect-foundations F3:
Go structs, no DSL; revisit only with many encounters AND a non-engineer
author). Everything F3 said about runtime-error domains and audited
composition applies unchanged; the editor UI *adds* cost on top (schema,
validation UX, versioning of behavior data in zone files).

Per-MOB knobs are the middle ground already half-built: def/spawn-level
data (`fleeBelowHealthRatio`, `entityType`, faction, wander/waypoints,
idle pacing) is editor- or JSON-configurable today; adding more *named
behaviors as flags/params* (e.g. a per-spawn "invulnerableWhile:
<groupTag>") is cheap case-by-case Go + schema work and should stay
flag-shaped, not script-shaped.

⚑ Open questions (if ever picked up):

- Template granularity: a few rich templates (guarded-boss, ambush,
  wave-defense) vs many tiny composable ones (the composability slope ends
  at the DSL — where's the line?)
- Where do encounter params live — zone JSON (per-instance, editor-owned)
  vs `api/encounters/*.json` (defs referenced by name from zones, mirrors
  mobs/props)?
- Editor verification loop: encounters are server-side state machines —
  does the editor need a "dry-run/preview" story, or is
  edit → download → restart (the existing loop) enough?
- Does spawn-group tagging (mobs referencing an encounter group) replace
  the encounter spawning its own mobs, or coexist?

## 18. Timed stat-buff effect (movement speed first)

Cut from the step-6 content pass (PO 2026-07-16, `plan-content-zones12.md`
§9 lift 1 + §13): a new effect type that applies a **timed stat buff** —
movement speed first — via the existing transient-buff plumbing (which today
carries resists and shields, not stat folds). Scope sketch from the content
plan: new effect type + buff fold into movement speed + expiry.

Consumers that were cut with it (revive as content when this lands):

- **Rally** (cooldown, was: Bandit-ranged drop) — timed ally move-speed buff.
- **Flee** (cooldown, was: Stag drop) — speed+ self buff; its radius− half
  additionally rode the aura-radius-modifier lift (§9 lift 4, also dropped).

Answered by current state:

- The Rally-Drum drummer does NOT wait on this — it was rescoped to
  `shield_aura` ("war drums embolden") and ships in the content pass.
- Speed/shield coverage has other homes (Swift `stat_multiplier`, drummer
  `shield_aura`), so nothing in the Zones-1+2 coverage table depends on this.

⚑ Open questions (if ever picked up):

- Buff stacking/refresh semantics (re-cast while active: extend, refresh,
  or reject?).
- Does the same effect type cover debuffs (slow-on-players is the known
  eligibility gap noted in `plan-content-zones12.md` §10), or stay
  buff-only?

## 19. Client memory: stop decode-everything-at-boot audio

Deferred 2026-07-16 (PO call after the C0-session benchmark; measurements +
scripts recorded in that session).

**Finding:** the game tab costs ~600 MB on top of Chromium's ~400 MB
multi-process baseline; there is **no leak** (JS heap flat 14–23 MB across
idle + active play, RSS flat after load). The biggest game-owned chunk is
**~160 MB of eagerly decoded audio**: all 29 mp3s (7.6 MB compressed) are
preloaded at boot (`registerPreload(PIXI.Assets.load(...))` in the Juice
files) and `@pixi/sound` decodes each to raw 32-bit PCM AudioBuffers held in
the renderer forever — confirmed by an mp3-blocked control run (renderer
384 → 225 MB). The GPU process' ~120–195 MB (rasterized SVG textures,
overlay layers, framebuffers) is normal PixiJS territory; the "Very high"
power rating is the 30 FPS render loop, not memory.

**The fix (cheap, ~25% of the game-tab footprint):** per-sound loading
strategy — keep only short combat SFX decoded, load the rest on demand
and/or switch long music/ambience tracks to `@pixi/sound`'s HTML5-streamed
mode (`preload: false` / `html5`). No gameplay effect. Natural home: the
ops/polish pass (step 9) or any frontend-touching session with slack.

## 20. Client render-interpolation crawl after large position jumps

Captured 2026-07-18 (during the map-condense pass; was a stray note in the
CLAUDE.md status banner — moved here as its proper home).

**Symptom:** after a large server-side position jump, the client's entity
render-interpolation + camera-follow *crawl* the avatar to the new spot at
roughly walk speed instead of snapping. The **server position is instant and
physically correct** — this is purely a client-side visual smoothing artifact.

**Reproduces on:** the `WARP` dev cheat today, and **almost certainly the
future `Recall` cooldown** (§9 — Recall is the first real-feature consumer of
a large jump, so fix this before/with Recall or its teleport will look broken).

**Likely area:** entity snapshot interpolation + camera lerp in the frontend
`core` / `game-objects` loop — a jump beyond some threshold should hard-snap
(both entity and camera) rather than interpolate. No design decision needed;
this is a bug/polish item.

**Status (2026-07-19): resolved.** Root cause split in two: the **entity** side
already hard-snapped — `_GameObject.setPosition` snaps for jumps beyond
`TELEPORT_SNAP_DISTANCE_PX` (180px), which any WARP/Recall exceeds. The
remaining crawl was purely the **camera**, which follows via a speed-capped
Nature-of-Code steering `Vehicle` (`Camera.ts`); after a large jump it dragged
across the whole gap at ~2× walk speed. Fixed in `Camera.update()` — when the
followed character sits more than a full viewport away, the Vehicle snaps
straight onto it (position set, velocity zeroed) instead of steering; normal
on-screen following and its easing are untouched. Committed `b085452d`. Verified
in-game: post-WARP frame-diff series shows one instantaneous view change then
flat (no pan tail), player centered on the first post-warp frame, 0 client
errors. Recall (§9) inherits the fix.

## 21. Two capstones unlock simultaneously off the shared Vanguard gate

Captured 2026-07-19 (PO play-noticed): leveling **Vanguard + CallForAid +
DamageAura** pops **Spearhead** and **Warbanner** in the *same instant* —
"doesn't feel good."

**Root cause — the Vanguard hub.** `Vanguard 5` is the gate for *four* recipes
at once, so maxing it while both partner ingredients are already met unlocks
multiple combos together:

| Recipe | Gate | Partner |
|---|---|---|
| Spearhead (§A "best damage aura", ceiling) | Vanguard 5 | DamageAura 5 |
| Warbanner (§A capstone, top of ceiling) | Vanguard 5 | CallForAid 3 |
| Lifewarden | Vanguard 5 | HealAura 5 |
| Shockwave | Vanguard 5 | DamageBurst 3 |

The specific bad pair is Spearhead + Warbanner because **both are ceiling/capstone
combos** — co-popping robs each of its moment and erases the build *choice*
between the two warlord fantasies (you just get both). Lifewarden/Shockwave can
co-pop the same way; the fix should treat the whole hub, not just this pair.

**Design principle to encode:** simultaneous multi-unlock is fine for *lateral
flavor combos* (small synergies, "three things clicked" delight); it's bad for
*two capstones*. Capstones must not share a gate that another capstone completes
for free.

**Fix options (open — PO call; likely settled in C8 recipe-net calibration,
`plan-content-zones12.md` §13/§A):**
- **A. Tier them (recommended).** Make the true capstone consume the other as an
  ingredient (Warbanner requires Spearhead). Result-as-ingredient is already
  supported and GDD-wanted; Spearhead unlocks first, Warbanner strictly later —
  earned, sequential.
- **B. Disjoint gates.** Re-gate one off a different maxed base so the two are
  distinct investments (e.g. Spearhead off DamageAura + DamageBurst; Warbanner
  keeps Vanguard + CallForAid). Getting both = deliberate double-investment.
- **C. Stagger levels only.** Bump gate levels so they don't coincide. Removes
  simultaneity but not the no-choice problem — weakest, not recommended.

Design/recipe-topology decision, not a bug — no code until the direction is
chosen.

**Status (2026-07-19): resolved — option A (tier), implemented in Session ③
Step 0.** PO decisions: Warbanner = `Vanguard 5 + Spearhead 5 + CallForAid 3`
— Spearhead at **max** (the recipe cascade discovers results at L1, so a
Spearhead-1 requirement would still co-pop; ≥2 is the mechanical floor, PO
picked 5 for the full earn); **Vanguard 5 stays explicit** so a free respec
out of Vanguard after the Spearhead unlock can't shortcut the capstone; the
**remaining trio hub (Spearhead/Lifewarden/Shockwave off Vanguard 5) is
accepted as-is** — best-in-category across three *different* categories is
complementary "three things clicked" delight, not capstone choice erasure.
Option C was ruled out as structurally broken (>= thresholds: whichever
ingredient completes last pops everything already met). Pinned by
`TestRecipes_C7Net` (warlord journey pops the trio, `NotContains` Warbanner;
maxing Spearhead then unlocks it).

## 22. Standalone browser map editor (bypass the in-game zone editor)

**Origin:** Session ④ density pass (2026-07-19). The pass rendered
`api/zones/world.json` as a top-down overview image (pure-stdlib Python
rasterizer + seeded placement generator, session scratchpad) and drove a
before/after approval loop over it. PO reaction: *"that would be such an
awesome tool to directly work in and place stuff and draw maps etc. —
basically circumventing the ingame editor."*

**Idea:** productize that renderer into an interactive browser tool for bulk
and overview work the in-game editor isn't built for:

- Canvas render of the full zone exactly like the density-pass map (terrain,
  props, spawns, dark areas, NPCs, campfires, anchors, 12-unit grid).
- Palette of existing prop/mob/terrain types; click-to-place, drag-to-move,
  delete; multi-select; semi-random scatter brush (the density-pass generator
  as a brush: copse/pack placement with spacing + no-go rules).
- No-go guides drawn in (NPC/campfire clearings, authored set-pieces).
- Save path back to `api/zones/world.json` — tiny dev-server endpoint or
  download-and-replace; round-trips the same JSON the engine loads.

**Scope guess:** ~one focused session for a first usable cut (render + place +
save). ⚑ Where it lives (`tools/`? behind `-dev`?) and whether it subsumes any
in-game-editor modes is the design pass's call. Not before C8 closes.

## 23. Crit chance as a stackable player stat (WoW-style)

**Origin:** PO decision 2026-07-20 (live-content review chat). Extends the
§4.3 crit doctrine (2026-07-13: crit = the ONE sanctioned, upside-only combat
RNG, authored per-skill) — crit stays the only combat RNG, but becomes
stackable build-wide via a passive stat. Recorded as a doctrine amendment.

**Settled spec (PO choice prompts, 2026-07-20):**

- **Scope: every direct hit can crit.** The stat gives all damage hits a crit
  chance; effects without an authored crit pair use a **global default
  critFactor** (⚑ value TBD, ×2 placeholder).
- **Stacking: additive** with authored crit (ReaperAura 25% + stat 10% = 35%).
- **DoTs never crit** (WoW-Classic rule; the dot-freeze path stays untouched).
- Summons: unresolved ⚑ — berserker precedent says the ACTING entity's own
  stats drive vocab, so summons would NOT inherit owner crit unless decided
  otherwise.

**Implementation sketch (paths verified 2026-07-20):**

- `skills/definition.go` — `StatCritChance` in `validStats` (+ constant).
- `skills/component.go` — `DerivedStats.CritChanceBonus` + case in
  `recomputeDerived()`.
- `sys/skills.go` — thread the acting entity's bonus into `rollHitDamage()`
  (both call sites have the caster in scope); additive with
  `DamageParams.CritChance`, default factor when the effect has none.
- Content: first crit passive JSON (registry pin bump + rebuild + placement/
  drop decision). Zero client work — crit already rides the `crit_taken`
  wire accumulator and the client renders crit hits.
- Test note: zero-chance effects consume no RNG draws today (seeded guardrail
  determinism); equipping the passive starts consuming draws per hit — keep
  guardrail scenarios crit-free or re-pin, and add a component + roll test.

**Scope guess:** one mini-chunk (lift ~20–30 lines + tests + one passive +
placement). **Scheduled: own mini-chunk after C8 closes** (PO 2026-07-20) —
slots naturally next to the post-C8 combat-readability items 7/15.
