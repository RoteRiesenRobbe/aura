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
registered per zone in `aurad.go`; the zone editor only authors
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

### Re-assessment 2026-07-22 — DECIDED: spec + generic runner (path A, sharpened)

*(PO question: "if the two boss fights use 80% the same seams, can't we make
this smarter?" — re-read of `warlord.go` + `smoke.go` now that C6 shipped the
2nd real encounter, i.e. the trigger condition the 2026-07-12 assessment set.)*

**Finding: both shipped encounters are 100% declarative — zero bespoke logic
between them.** Every line of both files is one of five repeated mechanics:

| Mechanic | Uses across the two files |
|---|---|
| spawn-and-track (`SpawnMob` → log on error → store handle) | 5 near-identical 8-line funcs |
| "is any member of group X alive" scan | 2 |
| death → clear the matching handle (`OnMobDeath` id cascade) | 2 |
| tick timer (`xAt = Ticks() + delay`, fire when due) | 3 (guard respawn, arena reset, boss respawn) |
| once-per-cycle latch at an HP threshold | 5 (waveHigh, waveLow, regate, fled, engaged) |

Warlord ("invuln while banners stand → waves at 66%/33% → re-gate once →
announce → empty arena → return in 5 min") and smoke ("invuln while guards
stand → flee at 50% with adds → re-engage when adds die → reset") are the
**same program with different arguments**.

**Decision (PO 2026-07-22): ONE generic runner + a declarative `Spec`, as a Go
data literal** — not JSON (yet), not several rich templates. This resolves the
"template granularity" open question above: neither a handful of fat templates
nor many tiny composable ones, but a single runner over a small vocabulary.
**5 condition kinds + 5 action kinds cover both existing fights exactly**
(`HPBelow`, `SquadEmpty`, `SquadAlive`, boot, boss-death × `Spawn`, `Replant`,
`SetFlee`, `AnnounceWithCredit`, `EmptyArena`). Sketch:

```go
Spec{
  Boss:  Squad{Mob: "OrcWarlord", At: Anchor("warlord-home")},
  Gate:  "banners",                      // boss invuln while any member alive
  Squads: []Squad{
    {Name: "banners", Mob: "WarbannerTotem",
     At: Anchors("warbanner-1", "warbanner-2"), SpawnAtStart: true},
    {Name: "wave", Mob: "OrcGrunt", Count: 3, At: LineAt("wave-mouth")},
  },
  Triggers: []Trigger{
    {When: HPBelow(0.66), Once: true, Do: Spawn("wave")},
    {When: HPBelow(0.33), Once: true, Do: Spawn("wave"), Replant("banners")},
  },
  OnKill:       []Action{AnnounceWithCredit("The Orc Warlord has fallen to %s!"), EmptyArena()},
  RespawnAfter: 9000,
}
```

Smoke additionally needs `RespawnAfter` **on `Squad`** (the 60 s per-guard
timers) and the `SetFlee` action + `SquadEmpty` condition; nothing else.

Why this beats "shorter code":

- **The subtle correctness rules become structural, not comments a new author
  must honor.** Re-derive the gate *after* replants or you leave a one-tick
  vulnerability window (`warlord.go:190-193`); key the wipe re-arm on
  `engaged` or pre-pull banner kills hand out free replants
  (`warlord.go:165-174`); clear the handle *before* `Despawn` or the death
  dispatch double-fires (`system.go:132-137`). The runner encodes each once.
- **The existing tests are the proof of coverage.** Rewriting both fights as
  specs and keeping all 8 Warlord tests + the smoke tests green demonstrates
  the vocabulary covers shipped, PO-verified content — not a guess at what
  encounter #3 needs. Unusually safe for a framework extracted at n=2.
- **Encounter #3 stops needing a Go author** (~40-line named-field literal),
  and the later move to `api/encounters/*.json` becomes a decoder, not a
  redesign — which also defers the second open question above.

**Keep `Encounter` as the interface; the runner is just one implementation**,
so a genuinely weird fight can still be hand-written Go alongside. This is the
escape hatch that makes extracting at two instances safe despite the project's
own "extract at the third" rule (`manual-content-authoring.md:355`).

⚑ **Scheduling (PO 2026-07-22): NOT now — this runs as the opening move of the
next encounter-authoring pass**, so the third fight pays for the extraction
immediately. Nothing is blocked meanwhile; the current queue (Pass-B 1c+1d →
step 8 accounts & persistence) is unaffected. Rough size: one chunk, ~1–1.5
sessions including the rewrite of both existing encounters.

⚑ Caveat worth restating at pickup: the ~20% that *isn't* shared skeleton is
where the design lives. A spec makes the plumbing free; it does not make a
fight good.

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

## 23. Crit chance as a stackable player stat (WoW-style) — ✅ DONE 2026-07-20, committed `635a44e3`

**DONE 2026-07-20 (same-day mini-chunk, PO-driven in-session via choice
prompts; in-game re-feel pending Session ⑦), committed `635a44e3`.** Shipped
BEYOND the spec below by same-day PO rulings (v2): **flat character base 5%**
(conf `game.player.critChance`, all conf JSONs + ReadConfig default) additive
with the stat and skill-authored chance; **KeenEye passive id 60** (2%/level,
maxLevel 5, DireWolf rare drop 0.06 — post-FINAL drop-table amendment, PO
choice); **chance-only authoring valid** (+ new `critChancePerLevel` key,
default factor ×2 [PLACEHOLDER]; factor-only invalid); **ReaperAura authored
pair REMOVED** (~−12% sustained EV, PO accepted); DamageAura's briefly-added
1%/level authored crit removed same day; **dot compensation +~5% damageHP**
(Immolation/Wildfire/Ignite — dots never crit). Registry pin 77→**78**; sim
wired (`PlayerSpec.critChance`, level-scaled preset derivation); guardrails
green; in-game smoke confirmed the stat-driven crit renders the standard
big-orange pop. Full doctrine ledger: `plan-skill-vocab.md` §4.3 v2 amendment.
Original spec kept below for the record.

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

---

## 24. Tech debt: the entity→system registration matrix in `core/game.go`

**Origin:** code-health question 2026-07-24 ("is game.go growing and growing?").
Answer to the literal question was **no** — see *Non-finding* below — but the
review surfaced one genuine smell worth recording before it's forgotten.
Nothing here is scheduled; it is **not** blocking any roadmap step.

### Non-finding: the file is not growing

Line count of `core/game.go` (and its pre-rename ancestors) over its life:

| date | lines |
|---|---|
| 2024-04-12 `81f97a42` | 429 |
| 2024-12-12 `54d83240` | 457 |
| 2026-07-03 `b8993221` | 479 |
| 2026-07-08 `7979a93a` | 457 ← dead-feature prune (scoreboard) |
| 2026-07-12 `239cb229` | 427 ← heater removal |
| 2026-07-24 | 494 |

**+65 lines in 27 months, with two net shrinks.** What reads as growth is
*edit frequency* — game.go is touched by every new system and every new entity
type — not size. For scale, `sys/skills.go` is 1594 lines, `model/mob/mob.go`
1418, `skills/definition.go` 1334; game.go is a third of those. If a file-size
pass is ever wanted, those are the targets, not this one. (`sys/skills.go` was
reviewed on the same day — **§25**: size warranted, four mechanical cleanups
recorded, likewise not scheduled.)

### Provenance: inherited, not introduced here

`git log -S` per helper:

| helper | added | by |
|---|---|---|
| `addSpectator`, `addMobEntity`, `addPlaceableEntity`, `addEntity`, `addResourceEntity`, `addPlayer` | **2017-08-20** `82569117` "Moar packages :)" | Thomas Richner (original Berryhunter) |
| `addPlaceableResourceEntity` | 2024-12-08 `39c432a2` | R. Zander |
| `addCorpse` | 2026-07-13 `2ec15c6d` | RoteRiesenRobbe (atmosphere & recovery chunk 4) |
| `addNpcEntity` | 2026-07-14 `9d71f9ad` | RoteRiesenRobbe (plan-npc-teaching chunk 2) |

**Six of eight are original Berryhunter, structurally unchanged for nine
years** (the 2018-09 and 2024-04 snapshots carry the identical function list).
This project added two, while adding two entity types — i.e. growth is exactly
one helper per new entity kind, the pattern behaving as designed. Extending it
rather than rewriting was also the correct call under the CLAUDE.md rule
*"treat the inherited physics, collision, and the WebSocket/FlatBuffers
protocol as stable foundations. Extend, don't rewrite."* This item sits on that
boundary and should not be actioned casually.

### The actual smell

`game.go:252–439` — `AddEntity` plus 8 `addXxx` helpers, each looping over all
16 registered systems and type-switching to pick out the 2–10 it cares about.
A hand-maintained 8×13 sparse matrix expressed as nested control flow.

Cost is **not** performance (registration is rare and off the hot path). It is
the **silent failure mode**: a forgotten `case` drops the entity from a system
with no compile error and no runtime error. Already bitten once — the comment
at `game.go:353` exists because routing NPCs through the generic path
*"would register only `Bodies()[0]` and silently drop the sensor."*

**⚑ The trap for anyone attacking this:** the matrix is not "which systems does
entity X join" but **"which systems, _and how_"**. `PhysicsSystem` alone is
registered four different ways across the eight helpers:

- `addPlayer` / `addMobEntity` / `addPlaceable*` → `s.AddEntity(e)` (dynamic)
- `addEntity` → `s.AddStaticBody(e.Basic(), e.Bodies()[0])`
- `addNpcEntity` → `AddStaticBody(...)` **plus** `s.Space().AddShape(e.Sensor())`
  (a static sensor is never reported by the broadphase — see `game.go:353`)
- `addCorpse` → `s.AddEntity(e)` *specifically* because corpses must be
  removable and `PhysicsSystem.Remove` panics on static bodies (`game.go:338`)

Any naive "just invert it" refactor hits this wall. Record it before proposing
one.

### Free cleanup — ✅ DONE 2026-07-24 (uncommitted at time of writing)

**`addPlaceableResourceEntity` was dead weight.** It was effect-identical to
`addPlaceableEntity` — same five systems, same calls, same order — and its own
comment admitted it (*"Currently matches 100% the addPlaceableEntity
registration"*). Since `PlaceableResourceEntity` embeds `PlaceableEntity`
(`model/entity.go:76–79`), the function **and** its case in `AddEntity` were
deleted; resources now fall through to the placeable branch.

**Shipped:** `game.go` **494 → 471 lines**, no behavior change. A 3-line
comment now sits at the fall-through point explaining *why* there is no
dedicated case — the old comment recorded the duplication but not that the
fall-through was safe, which is what would have invited someone to re-add it.
Safe because the earlier `PlayerEntity` / `MobEntity` cases precede where the
resource case sat, so removing it cannot change which earlier branch wins;
only the ordering against `PlaceableEntity` mattered, and both bodies were
identical.

**Verified:** `go build ./...` exit 0, `go vet ./pkg/aura/core/` exit 0,
`go test ./...` **29 packages with tests pass / 0 failures**, boot
`83 skills/14 factions/50 mobs/10 recipes/777 props/471 spawns/5 campfires
(safeRadius 1.5)/14 npcs, 0 panics` — the boot count is the real proof, since
resources are registered during zone placement.

### Options (none chosen)

- **A — Invert the registration.** Add `interface{ Register(model.BasicEntity) }`;
  each system type-asserts for what it wants (`DecaySystem` decides what is
  decayable, not `game.go`). Collapses ~190 lines to ~10 and is a genuine
  dependency inversion, not mere indirection. **Costs:** the four how-variants
  above migrate into per-system type switches (complexity relocates rather than
  vanishes — though arguably *to its owner*, since static-vs-dynamic bodies are
  physics' business), and "which systems does a mob join?" stops being
  answerable by reading one screen. A real refactor with a real tradeoff —
  deliberate decision, not drive-by.
- **B — Pin it, keep it.** Table-driven test asserting, per entity type, the
  exact set of systems it lands in. Removes the only *dangerous* property (the
  silent drop) and leaves the 8 clones merely verbose, which is harmless.
  **~1 hour, near-zero risk.** Also the prerequisite that makes A safe later,
  by proving a refactor dropped nothing.
- **C — Do nothing.** Defensible: stable for nine years, explicit, greppable,
  and it has cost one authoring-time bug total.

**Cosmetic, and explicitly *not* a fix for the above:** moving `AddEntity` +
the 8 helpers verbatim into a new `core/entities.go` (same package). game.go
drops to ~300 lines and becomes one thing — *wiring + loop* — while
entities.go becomes one thing — *the entity→system matrix*. Worth doing on its
own readability merits, but it relocates the smell, it does not address it.
File it as a separate, smaller item so the two don't get conflated.

**Recommendation on record (2026-07-24):** **B now if/when it's picked up, A
only if a future entity type makes the matrix actually hurt.** The free
cleanup is done (above); everything else is **not scheduled**.

**⚠ Sequencing:** **§26 (prune the dead resource/decay layer) should land
first.** It deletes `addPlaceableEntity` (1 of the **7** helpers remaining after
the free cleanup above) and `DecaySystem` (1 of the 16 systems every helper
iterates) — so the original 8×13 matrix ends up **6 helpers**. Any work here
done *before* §26 would be partly redone, and B's table-driven pin would have to
be written twice.

**Scope guess:** ~~free cleanup ~10 min~~ ✅ done; B ~1 hour; the entities.go
split ~15 min (mechanical, `go build` + `go test ./...`); A is a half-day-plus
with a real design decision in front of it.

## 25. Tech debt: `sys/skills.go` — size is warranted, the cleanup layer on top is not

> **PARTIALLY DONE — options A#4 and B landed 2026-07-24 (`2ec03ee7`),
> option C landed 2026-07-25** (A#1–3, D, E still open).
> - **C (`applySlowAura` eligibility): FIXED, not pinned — and it was a LIVE
>   bug, not the latent one recorded below.** The assessment under
>   "⚑ Latent correctness gap" was wrong on its central fact: it assumed
>   nothing could reach the gap, but the aura sensor mask is `LayerCombatants`,
>   which does **not** discriminate by faction, and `*Mob` implements
>   `ApplySlow`. All three live slow skills (`Slow`, `Suppression`,
>   `Warbanner`) author `targetsAllies: false` — **and that authoring was
>   silently ignored**, so a player's slow also hit friendly-faction NPCs and
>   their own summons/companions. That also dissolves the "pin, don't fix"
>   recommendation: fixing needed no new faction semantics, because all three
>   JSONs already author them. `applySlowAura` now filters through
>   `eligibleByTargetFlags[slowable]` exactly like every other harmful effect
>   (caster not skipped, matching `applyDamageAura`). Four new pins in
>   `skills_behavior_test.go`: same-faction excluded, player-friendly faction
>   excluded, unfactioned targets excluded, mob caster cannot slow its own
>   faction. **Lesson for the next latent-gap triage:** "no content reaches
>   this" was checked against mob content only; the player skills that reach it
>   were never looked at.
> - **B (balance constants → conf.json):** `defaultCritFactor` and
>   `healerThreatFactor` are gone from Go. They live in a **new `game.combat`
>   block**, not `game.player` as proposed below — unlike the
>   player-character-only `critChance`, both apply to *every* acting entity
>   (player, mob, summon), and filing them under a player-scoped name would
>   have been misleading. Implementation deviation: the finding assumed
>   `SkillSystem` methods, but both crit-factor readers sit in **free**
>   functions (`applyDamageAura`/`applyMobDamageAura`) with **58 in-package test
>   call sites**, so threading a parameter meant 58 test edits for a value
>   identical everywhere. Both knobs therefore use one mechanism — a
>   package-level setter called once at boot (`sys.SetCombatFactors`,
>   `mob.SetHealthGainTick`), mirroring the existing `mob.SeedProcess`.
>   Normalization lives in exactly one place, `cfg.CombatConfig`'s accessors, so
>   a nil game, a zero-value `GameConfig` and an absent conf block all resolve
>   identically. **Deliberate consequence: authoring 0 restores the default
>   rather than disabling the factor** — healer threat cannot be switched off by
>   authoring 0 (open question flagged to the PO 2026-07-24).
> - **A#4 (doc comment):** `casterCritChance`'s paragraph moved back onto
>   `casterCritChance`. Rode along because the deleted `defaultCritFactor` const
>   sat in the *same hunk* as the orphaned comment — inseparable.
> - **Blast radius traced 2026-07-24:** **no player skill authors crit at all**,
>   so every player crit resolves through the global default — the dial is
>   precisely "how spiky does player damage feel". Exactly one mob ability
>   (`EliteBanditSlash`) authors both `critChance` **and** `critFactor: 2.0`, so
>   it is immune to the dial. Keep that pattern deliberate: a mob ability that
>   authors chance but *not* factor starts riding player crit tuning.
> - **Verified:** `go build`/`vet` clean, `go test ./...` green (**27 pkgs** —
>   the "29" in older banners is stale), guardrails replay identically under
>   `-count=2`, boot with the block reports `defaultCritFactor=2
>   healerThreatFactor=0.5` and boot with it **stripped** (the live server's
>   upgrade path) resolves to the same numbers, 0 errors. **Not PO-verified
>   in-game.**

**Origin:** code-health question 2026-07-24 ("skills.go is very large — is it in
bad shape? hardcoded stuff? or is the size warranted?"), the companion to §24 and
the follow-up §7.5 of `research-code-quality.md` predicted ("`sys/skills.go` is
the complexity sink … it is where the next structural pressure will show up").
Answer to the literal question: **the size is warranted, and there is no
architectural problem** — but four mechanical cleanups and four hardcoded
balance constants are worth recording. Nothing here is scheduled; it is **not**
blocking any roadmap step, and per §7.5's standing advice the file should **not**
be refactored pre-emptively.

### Finding: the size is warranted (unlike §24, it IS growing — for a reason)

| measure | 2026-07-24 |
|---|---|
| total lines | 1594 |
| **code lines** | **1009** |
| comment lines | 460 (**~46% of code**) |
| blank | 125 |
| functions | 47 |
| functions > 100 lines | **1** (`applyHealAura`, 130 incl. comments) |

It is the **single execution point for 19 of the 22 `EffectType`s** — the other
three (`StatMultiplier`, `ResistPassive`, `LightAura`) are passives resolved
elsewhere. ~30 code lines per effect applier is proportionate, and there is no
god-function. **A 1k-line file is the honest size of "the whole effect
vocabulary executes here."**

Growth, unlike game.go's +65 lines in 27 months:

| date | commit | lines |
|---|---|---|
| 2026-06-29 | `801c3d2b` | 57 ← born |
| 2026-07-06 | `c0426e35` | 475 |
| 2026-07-12 | `d58cd413` | 866 |
| 2026-07-14 | `3e9ab8e4` | 1457 ← `tick_rate`, the last effect type added |
| 2026-07-16 | `63ed12be` | 1492 |
| 2026-07-20 | `635a44e3` | 1578 |
| 2026-07-24 | `37878018` | 1594 |

**+1400 lines in 16 days, then +137 in the 10 days since.** The steep phase was
the effect-vocabulary build-out (plan-skill-vocab, plan-mob-depth); it is
**plateauing as the vocabulary completes**, not compounding. The growth curve is
the feature curve, which is exactly what §7.5 said to watch for — so watch it,
but the reading today is benign.

### Cleanup layer (mechanical, no behavior change, ~70 lines / ~7%)

1. **`fireCooldown` is a `switch` written as an if-chain** (`skills.go:1233–1337`).
   Eight sequential `if effect.Type == X { …; continue }` blocks, then a negated
   two-type guard, then an actual `switch` for the last two. Every new cooldown
   effect appends another if-block. One `switch` collapses ~25 lines and makes
   the exhaustiveness visible. **Highest value of the four** — this is the
   extension point that grows.
2. **Copy-pasted "wounded ally" predicate** — `applyHealAura:716–728` and
   `applyHotAura:815–827` are logically identical (`Healable` + same faction +
   not self + `HealthRatio() < 1`). This is the **residual of §3.4 in
   `research-code-quality.md`**: the flag-gated predicates were unified into
   `eligibleByTargetFlags`, but heal and hot carry a bespoke implicit-ally rule
   that was deliberately left out of that seam — and then duplicated. Extract it
   as a named `woundedAllyPredicate(e)`; both call sites already comment that
   they share the rule.
3. **Four copies of the instant-query preamble** — `applyInstantShield:977–990`,
   `applyInstantHot:1023–1036`, `applyThreatEffect:1453–1455`, and the
   instant-damage path in `fireCooldown:1308–1321` all do: `skills.Scaled`
   radius → `NewCircle` at aura pos → `InstantDamageMask` → `QueryCircle` →
   convert the `[]Collider` into a `ColliderSet`. Three of those slice→set loops
   are byte-identical. One `queryCircleTargets(e, effect, level)` helper removes
   ~30 lines and four divergence risks. (Related but **not** recommended:
   `applyInstantShield` and `applyInstantHot` are the same function with a
   different buff payload — merging them needs generics over two unrelated apply
   signatures, which costs more clarity than the ~40 lines buy. KISS says leave
   the pair.)
4. **A doc comment got merged into its neighbour** (`skills.go:594–616`).
   `casterCritChance`'s doc paragraph runs straight into `casterDamageFactor`'s
   with no break, and the function that actually follows the block is
   `casterDamageFactor`. Net effect: **`casterCritChance` (line 617) has no doc
   comment at all** and `casterDamageFactor` carries two. Almost certainly a bad
   merge during the Strong-passive triage pass (`37878018`, the commit that
   introduced `casterDamageFactor`). Pure documentation defect, ~2 minutes.

### Hardcoded balance constants — four, all in Go, none in `conf.json`

| constant | line | value | marked |
|---|---|---|---|
| `defaultCritFactor` | 592 | `2.0` | `[PLACEHOLDER ×2]` |
| `healerThreatFactor` | 838 | `0.5` | `[PLACEHOLDER]` |
| `summonPlacementGap` | 1483 | `0.3` | `[PLACEHOLDER]` |
| `summonPlacementTries` | 1484 | `8` | `[PLACEHOLDER]` |

They are all correctly *labelled*, so nothing is masquerading as decided. The
smell is **inconsistent homes for one knob**: base `critChance` lives in
`conf.json` (tunable, restart only) while the crit *factor* it multiplies is a
Go const (**rebuild required**). Same mechanic, two workflows — and the whole
point of `-content ../api` + `conf.json` is that tuning skips the rebuild.

`defaultCritFactor` is the one that actually matters (it applies to every crit
on every effect without an authored `critFactor`, i.e. most of them);
`healerThreatFactor` is a real balance lever too. The two summon-placement
numbers are geometry, not balance, and are fine where they are.

**Cheapest fix:** move `defaultCritFactor` and `healerThreatFactor` into the
`game.player` block of `conf.json` next to `critChance`, leave the placement
constants alone. ~30 min including the conf plumbing and a test.

### ~~⚑ Latent correctness gap — `applySlowAura` has no faction eligibility~~ ✅ FIXED 2026-07-25

> **Superseded — see the banner at the top of §25.** It was not latent: the
> section below reasoned only about mob content, and the three *player* skills
> that author `slow_aura` were reaching the gap the whole time. Kept verbatim
> for the record.

`skills.go:1544–1573` iterates the raw collision set and slows anything
implementing `slowable`, with **no faction check and no `mayHarm` gate** — the
only aura path that skips both. Its own comment admits it (*"pre-6.6 gap,
harmless while no mob carries a slow aura and players cannot be slowed"*), and
the assessment is correct **today**: no mob authors a slow aura, and players
implement no `ApplySlow`, so nothing can currently reach the gap.

It is recorded here because it is **documented in prose only — no test pins
it**. The day a mob slow aura is authored, it silently bypasses the hostility
gate and can slow its own faction. Fix when it ships: route it through
`eligibleByTargetFlags[slowable]` like every other harmful effect. Noted in
`manual-content-authoring.md` §Factions so the authoring side sees it first.

### The comment ratio (judgement call, not a defect)

**460 comment lines to 1009 code lines.** Much of it is decision archaeology
referencing plan docs and chunk numbers ("chunk 6.6", "§3.1", "gotcha #12",
"the mayHarm lesson"). Two kinds are mixed together:

- **Load-bearing, keep:** the seam warnings on `casterPowerScale` and `mayHarm`
  (*"route every new HP-valued effect through this — a per-site copy is how the
  curve gets forgotten"*), the `initShape`-style ordering traps, and the
  rationale for every deliberate asymmetry (why damage doesn't skip the caster,
  why a summon's hits don't put its owner in combat). These are the reason the
  file is safely extensible by someone who wasn't there.
- **History, arguably belongs in `docs/plan-*.md`:** the narrative of which
  chunk decided what, in past tense.

No action proposed — it is a PO call, and erring toward over-documentation in
the single most consequence-dense file in the backend is a defensible bias.
Flagged only so the ratio is a **choice on record** rather than drift.

### Options (none chosen)

- **A — Do the four mechanical cleanups.** ~70 lines removed, no behavior
  change, `skills_behavior_test.go` (3839 lines) is the regression net. **~1–2
  hours, low risk.** #4 alone is 2 minutes and should ride along with any
  future touch of that file.
- **B — Move the two balance constants into `conf.json`.** ~30 min, independent
  of A.
- ~~**C — Pin `applySlowAura`'s gap with a test**~~ ✅ **FIXED 2026-07-25** (see
  the §25 banner). The reasoning recorded here was wrong: the effect *is* used
  by content (`Slow`, `Suppression`, `Warbanner`), those three already author
  the faction semantics this option worried about picking, and the gap was live
  rather than latent. Fixed + 4 pins.
- **D — Split the file** into `skills.go` (system + dispatch) / `skills_auras.go`
  / `skills_cooldowns.go`. Mechanical, same package, ~15 min. **Not
  recommended yet** — the file is cohesive (everything is "apply a skill effect
  this tick") and §7.5's advice against pre-emptive refactoring stands. Revisit
  if the vocabulary resumes growing.
- **E — Do nothing.** Fully defensible. Nothing here is a live bug; the file
  is readable, tested, and its size is earned.

**Recommendation on record (2026-07-24, amended 2026-07-25):** **A + B if the
file is being opened anyway** (they are the kind of thing that is cheap on a
visit and never worth a dedicated session); ~~C whenever a mob slow aura is
first considered~~ — **C is done, and it should not have waited on mob content
at all**; D and E otherwise. **A#1–3 not scheduled.**

**Scope guess:** A ~1–2 h; D ~15 min. (B took ~30 min; C took ~40 min including
the four pins.) None of them interact, so they can be taken individually.

---

## 26. Prune the dead resource + decay layer (Berryhunter remnant)

> **✅ FULLY DONE 2026-07-24 (Chunks 1+2).** Planned in
> `docs/archive/plan-resource-decay-prune.md`; full ledger there (§13). **Chunk 1
> `ee9d42e9`** — removed the resource/placeable/decay Go cluster + 3 codec cases +
> game.go wiring + 3 dead interfaces + the 9 resource/placeable item JSONs
> (helpers 7→6, systems 16→15); the JSONs were 100% of nested item content so
> `items.go`'s embed narrowed to `*.json`, leaving the registry at `None` alone
> ⇒ **§28 now trivial** (note there). **Chunk 2 `a2ab90b5`** — swept the frontend
> `Placeable` decode path + fixed a Chunk-1 regression (the deleted JSONs broke
> `npm run build` via a static `require` in `client-data/Items.ts`, unseen by the
> backend-only rebuild). Verified: backend `go build`/`vet`/`test` (29 pkgs),
> frontend `tsc`/webpack, boot 0 panics / props:777 spawns:471 / 5 campfires /
> 1 item, 12/12 clean joins, PO hand-tested. **Tier 3 (FlatBuffers `Placeable`
> schema prune) deferred into §28.** Original finding below.

**Origin:** PO observation 2026-07-24, during the §24 review — *"'resources' in
their former Berryhunter sense no longer exist in the game and are not intended
to come back. The same goes for decaying."* Verified by static trace the same
day. **Both are confirmed fully dead.** This is the concrete, scoped instance
of the sweep §4 and §6 of `research-code-quality.md` have been describing
generically since 2026-07-06; evidence lives there as §9.

### The evidence (verified 2026-07-24)

**Resources are not merely unused, they are unusable.** The constructor cluster
is a closed loop with **zero entry points** — `NewPlaceableResource` has no
callers anywhere (including tests), and it is the only caller of `NewPlaceable`
and `NewStaticEntityWithBody`, which is the only caller of `NewResource`. Every
live `AddEntity` passes a prop, mob, NPC, player, spectator, corpse or minion.
**Campfires are mobs** (`mob.NewMob(campfireDef, …)`, `aurad.go:129`), not
placeables — the one plausible live consumer, checked and cleared.

The clincher: `determineResourceEntityType` (`placeableResource.go:120`)
**panics for every stock item except `"Berry"`**, and there is no `berry.json`
on disk. Even if something called it, it would panic on 100% of current
content.

**Decay ticks 30×/s over a permanently empty slice.** `AddDecayable` has
exactly one call site — `game.go:334`, inside `addPlaceableEntity`, which is
unreachable because nothing constructs a `PlaceableEntity`. `model.Decayer` has
zero references outside the cluster. Note `prop/prop.go:6` already states props
have *"no harvest, decay, respawn or update systems involved"* — the
replacement design walked away from this deliberately.

### ⚑ Do NOT cut: props ride the resource *wire* path

`case model.PropEntity` marshals via `PropEntityFlatbufMarshal` but sends
`eType = AnyEntityResource` (deliberate — `plan-world-zones.md` §3.2 decision
B). So the `AnyEntityResource` wire enum and the frontend's `Resources.ts`
(624 lines) are **load-bearing** and stay. Only the *server-side*
`model.ResourceEntity` implementation is dead. Anyone pattern-matching on the
word "resource" will get this wrong.

**Switch-ordering checked and safe:** `case model.ResourceEntity` sits *before*
`case model.PropEntity` in `codec/gamestate.go`, but `PropEntity` is just
`Entity` while `ResourceEntity` additionally demands `Interacter`,
`StatusEntity`, `Update()`, `Stock()` and `Resource()` — props cannot match it.
Removing the earlier cases changes no behavior.

### Removal inventory

| What | Size |
|---|---|
| `model/resource/resource.go`, `model/placeable/{placeable,placeableResource}.go`, `gen/resource_entity.go` (the whole `gen` package), `sys/decay.go`, `model/decay.go` | **544 lines** |
| `codec/gamestate.go` — 3 switch cases + `ResourceEntityFlatbufMarshal` (21) + `PlaceableEntityFlatbufMarshal` (20) | ~45 |
| `core/game.go` — `addPlaceableEntity`, its `AddEntity` case, DecaySystem construction + registration | ~30 |
| `model/entity.go` — `ResourceEntity`, `PlaceableEntity`, `PlaceableResourceEntity` interfaces + `Decayed()` | ~25 |
| Frontend `Placeable.ts` (51) + `ResourceJuice.ts` (68, verify first) | ~119 |
| `api/items/resources/*.json` ×7, `api/items/placeables/*.json` ×2 | 9 files |

**~760 lines + 9 JSON files. No dedicated tests exist for any of it**, so
nothing has to be rewritten.

**Bonus:** this deletes `addPlaceableEntity` and `DecaySystem` — **1 of the 7
`addXxx` helpers left after §24's free cleanup, and 1 of the 16 registered
systems**. Together with that cleanup, §24's original 8 helpers end up at 6,
shrinking the matrix without touching its design question. **Land this before
any §24 work** (see the sequencing note there).

### Adjacent, deliberately NOT folded in

**The item registry is also unread.** Boot loads 10 item definitions (Wood,
Stone, Bronze, Iron, Titanium, TitaniumShard, Feather, Campfire, BigCampfire,
None) and **`game.Items()` has zero callers** in live code; Wood / Bronze /
Iron / Feather appear zero times in backend Go outside comments. Same
Berryhunter cluster, but removing it touches `items.Registry`, the loaders,
`model.Game` and the frontend item scaffolding (§4's *"full item/equipment/
crafting scaffolding"*), so it is a **separate question** — and one CLAUDE.md
already anticipates as "the planned item-system removal". Flagged here so the
next person does not rediscover it.

**Scope guess:** one chunk, ~1–2 h, mechanical. Same shape as the 2026-07-08
scoreboard prune and the step-7 heater removal. Verification tail is the
standard one — `go build ./...`, `go test ./...`, `tsc --noEmit`, and a boot
count check (`777 props/471 spawns` is the real proof, since props stream over
the very path this touches). **Not scheduled**; PO signalled intent to do it.

---

## 27. Tech debt: `model/mob/mob.go`, `sys/mob.go`, `skills/definition.go` — one live bug + uneven guard coverage

**Written 2026-07-24**, same code-health prompt that produced §25 (`sys/skills.go`)
— "the other two big files, are they also carrying smells?". Reviewed:
`sys/mob.go` (187 l), `model/mob/mob.go` (1418 l), `skills/definition.go`
(1334 l). Verdict up front: **`definition.go` is the strongest code in the
backend and `model/mob/mob.go` has no bugs at all** — but `sys/mob.go`, the
smallest of the three, carries a confirmed live defect. Nothing here is
scheduled; recorded so it is not rediscovered.

Everything below was verified against the code (and, for §27.1, reproduced),
not inferred from reading.

### 27.1 ✅ FIXED 2026-07-24 — mutation-during-iteration in `MobSystem.Update`

> **FIXED, test-first.** `MobSystem.Update` now collects dead mobs during the
> range loop and removes them in a second loop afterward, so the synchronous
> `Remove` array-shift can no longer skip/double-update a survivor. Pinned by
> `TestMobSystem_RemovingDeadMobDoesNotSkipOrDoubleUpdateSurvivors`
> (`sys/mob_test.go`), which fails on the old inline-removal code (survivor `C`
> gets 0 updates, `D` gets 2). `go test ./...` green across 29 packages; the fix
> is isolated to `mob.go` and preserves the prior ordering (`onMobDeath`
> per-dead-mob before the respawn loop). Blast-radius confirmed: `state.go`
> already snapshots before removing; `decay.go:27` shares the shape but is dead
> code (§9/§26); no other live system removes during its own iteration. Original
> finding below.

`sys/mob.go:99-105` iterates `for _, mob := range n.mobs`, and a mob that
reports dead is removed **inside that loop**:

```go
for _, mob := range n.mobs {
    alive := mob.Update(dt)
    if !alive {
        n.onMobDeath(mob)
        n.game.RemoveEntity(mob.Basic())   // <- synchronous
    }
}
```

`game.RemoveEntity` (`core/game.go:247`) calls `ecs.World.RemoveEntity`, which
(`ecs@v1.0.5/world.go:112`) calls **every system's `Remove` synchronously** —
including `MobSystem.Remove` (`sys/mob.go:176`), which does
`append(n.mobs[:d], n.mobs[d+1:]...)`. That shifts the survivors left **in the
same backing array** while the `range` loop is still walking it with the
pre-removal length.

**Reproduced** (standalone, mirroring the exact pattern) on `[A, B(dead), C, D]`:

```
Update() called on: A  B  D  D
survivors:          A  C  D
```

⇒ **`C` is skipped for the whole tick** (no aggro update, no movement, no
regen, no TTL decrement) **and `D` is updated twice** (two movement steps, two
regen ticks, two TTL decrements, two aggro passes). One skip + one
double-update per *dead mob per tick*, and it fires on every tick in which
anything dies — i.e. most ticks during play, with 471 spawn points.

**Why it has never been noticed:** both symptoms are single-tick (33 ms)
position/state anomalies on a mob that is not the one the player just killed.
It presents as an occasional mob micro-stutter or a half-step lunge, which is
indistinguishable from ordinary netcode jitter. It does **not** corrupt state
permanently — a double `Update` on an already-dead mob hits the `m.health == 0`
early return, and the second `onMobDeath` finds no matching spawn point and
returns silently.

**Fix (~30 min, no design decisions):** iterate by index in reverse, or collect
dead entities in the loop and remove them after it. Test-first: a fake
`model.Game` whose `RemoveEntity` calls `sys.Remove` synchronously, three mobs,
assert `Update` is called exactly once per survivor.

**Blast radius to check with the fix:** nine other systems use the same
`for _, x := range s.entities` shape — `sys/skills.go:121` + `:865`,
`sys/state.go:543`, `sys/npc.go:51`, `sys/statuseffects/system.go:31`,
`sys/chat/system.go:33` + `:55`, `sys/equip/equip.go:59`, `sys/cmd/cmd.go:294`.
Only `sys/mob.go` is *confirmed* to remove during its own iteration; the others
need one grep each, not a rewrite.

### 27.2 `model/mob/mob.go` — no bugs, structural debt

Ranked by consequence, not by size.

1. **`log.Fatalf` inside a per-spawn constructor** (`mob.go:42`) — an unresolvable
   EntityType takes the **whole server process** down, and the validation is
   asymmetric: the optional `entityType` *override* hard-fails at content load
   (`items/mobs/definitions.go:328`, pinned by
   `TestMapMobDefinition_UnknownEntityTypeFails`), but the **name-fallback path
   is validated nowhere** — a mob whose `name` is not a FlatBuffers EntityType
   passes the loader and dies at first spawn.

   > **✅ FIXED 2026-07-24, test-first (`c3938be7`).** The name-fallback is now
   > validated at content load, matching the override's existing fail-fast — an
   > unresolvable name fails at **boot** (a deploy error) instead of at first
   > spawn (a live crash-at-first-encounter). Three coupled edits (plan
   > `docs/archive/plan-entitytype-validation.md`): ① a new shared resolver
   > `mobs.ResolveEntityType(override, name)` — the single source of truth for
   > the name/override → wire-type mapping, collapsing the DRY smell (`NewMob`'s
   > `types` map and the loader's `EnumValuesEntityType` check were the same
   > mapping expressed twice); ② the loader validates the **effective** lookup
   > (override else name) with distinct per-knob messages; ③ `NewMob` uses the
   > resolver and **panics** instead of `log.Fatalf` (the last `log.Fatalf` in
   > `model/` — closes `research-code-quality.md` §5's finding). **The guard
   > stays, not deleted** — unreachable for loaded content but still live for
   > direct construction (sim/tests), where it catches the
   > `EntityType(0)=DebugCircle` zero-value trap; `panic` fails just that unit
   > with a stack trace rather than `os.Exit`-ing the whole test binary.
   > **Pins:** `TestMapMobDefinition_UnknownNameFallbackFails` (the regression —
   > fails on the pre-fix loader), `TestResolveEntityType`,
   > `TestNewMob_PanicsOnUnresolvedEntityType`. `go build`/`vet` clean, `go test
   > ./...` green (29 pkgs); boot over real content loads 50 mobs 0 panics;
   > negative boot check (a mob `name` pointed at a non-EntityType) fails at load
   > with the new message, not a first-spawn crash. No wire/schema/JSON change.
   > Original finding below. Fix: resolve the lookup once at registry load and
   > hard-fail there, like the override already does. (Also the last `log.Fatalf`
   > in `model/` — see `research-code-quality.md` §5's three-logging-styles
   > finding.)
2. **Drop luck is deterministic across restarts.**

   > **✅ FIXED 2026-07-24, test-first (`b4b0e66d`).** `NewMob` now seeds its RNG
   > from `mobRNGSeed(processSalt, entityID)` — a package-level `processSalt` set
   > once at boot by `mob.SeedProcess(time.Now().UnixNano())` (`cmd/aurad`, logged
   > `🎲 mob RNG salt` for reproducibility), mixed with the entity ID through a
   > splitmix64 finalizer. The salt randomizes HP-variance + drop rolls per server
   > run; the ID keeps per-mob streams independent even for same-instant spawns.
   > The finding's `MobSystem`-owned-seed suggestion was reworked to a package
   > salt because `NewMob` has six call sites — a package var reaches them all with
   > no signature churn, mirroring `sys.SkillSystem`'s boot-vs-`SeedRNG` split.
   > **Determinism preserved with zero plumbing:** the sim/guardrails leave the
   > salt 0 *and* never consume a mob's internal RNG (`sim/world.go` pre-rolls HP
   > externally with variance 0, declares no unlocks), so replays stay identical.
   > Pinned by `TestMobRNGSeed_SaltRandomizesButKeepsPerIDIndependence` (pure
   > seed: same ID + different salt → different stream; same salt + different ID →
   > different stream) and `TestNewMob_VarianceRollUsesSaltedSeedNotEntityIDAlone`
   > (behavioral: a salted roll ≠ the old id-only roll) — both fail on the pre-fix
   > seed. `go test ./...` green (29 pkgs), `go vet` clean, guardrails replay
   > identically under `-count=2`, boot verified (salt differs across two runs,
   > 0 panics). The world seed (`0xDEADBEEF+4`) stays fixed, so spawn *positions*
   > remain reproducible — only variance/drops randomize. Original finding below.

   `NewMob` seeds the mob's own
   RNG with its entity ID (`rand.NewSource(int64(base.Basic().ID()))`, line 150),
   and `ecs.NewBasic()` hands out IDs from a **global counter starting at 1 each
   process**. World mobs are spawned in a fixed order on the first tick
   (`MobSystem.Update`'s `!initialized` branch), so on every fresh server the Nth
   spawn point gets the same seed ⇒ the **same HP variance roll and the same
   first drop roll, every restart**. Respawns get fresh IDs so this decays during
   a session, but the live F&F server wipes on every restart, which makes the
   fixed opening state potentially observable ("that wolf never drops").
   **✅ PO RULING 2026-07-24: this is a BUG, not intended reproducibility.**
   Rolls must be **random per run** — the same mob must not drop the same skill
   after every restart. Fix: seed each mob's RNG from a per-process random
   source mixed with the entity ID (e.g. a `MobSystem`-owned seed drawn once at
   boot, combined with the ID so per-mob streams stay independent), *not* from
   the entity ID alone. **Not scheduled — documented only.** Two things to keep
   when it lands: the per-mob stream must stay independent (drop rolls must not
   consume each other's RNG across mobs), and the sim harness / guardrail
   batteries rely on determinism, so they need their own explicit seed rather
   than inheriting the world's.
3. **Mob out-of-combat regen is hardcoded and untunable** (`mob.go:598`):

   > **✅ FIXED 2026-07-24, test-first (`2ec03ee7`).** Now
   > **`game.mob.healthGainTick`** — deliberately the **same name and same unit**
   > as `game.player.healthGainTick` (a fraction of the max pool per tick) in a
   > parallel block, so unifying the two later is a rename rather than a redesign
   > (**§31**). Threaded via a package-level `mob.SetHealthGainTick` at boot,
   > mirroring `mob.SeedProcess` — chosen over a 4th `NewMob` parameter because
   > `NewMob` has ~100 call sites, ~95 of them tests passing `0` (PO call
   > 2026-07-24). A non-positive value restores the built-in default, normalized
   > at the single write point so no read site re-checks it. Authored
   > **0.0166667** = exactly the old hardcoded `maxHealth/(2*TicksPerSecond)`;
   > `vitals.HP`'s round-with-min-1 absorbs the float difference either way.
   > **Pins:** `TestMob_RegenRateFollowsConfiguredHealthGainTick`,
   > `TestSetHealthGainTick_NonPositiveKeepsBuiltInDefault`, plus the
   > pre-existing `TestMob_RegeneratesOutOfCombat` unchanged as the
   > no-behaviour-change net. New `🎚️ tuning knobs` boot line reports the
   > effective values (setter-held values never appear in the `GameConfig` dump).
   > Boot with the block **stripped** resolves to 0.01666667 — the live server's
   > upgrade path is safe. **Not PO-verified in-game.** The leashing observation
   > below still stands as a *balance* question, now with a findable dial.
   > Original finding:

   `maxHealth / (2 * TicksPerSecond)` = full pool in ~2 s, living in the model
   layer with no `conf.json` entry — while the *player* regen rate is a declared
   **FINAL** tunable (`0.00033 ≈ 1 %/s × level taper`). Anyone tuning "how
   punishing is disengaging?" will not find it. It is also what makes leashing
   free: a mob that breaks off is at full HP 60 ticks later.
4. **God struct.** `Mob` is ~45 fields over 155 lines spanning eight concerns
   (steering scratch, stuck watchdog, idle archetypes, threat table, aggro/leash,
   buff store, per-tick wire accumulators, encounter seams, reward bookkeeping).
   The package already splits *behavior* across seven files
   (`steering/patrol/stuck/companion/healer/safezone`), so today **no file owns
   the state it operates on**. Not urgent and not the cause of any defect — but
   it is the seam where the next structural pressure shows up, the mob-side twin
   of §25's `sys/skills.go` watch item.
5. **`NewMob` is ~170 lines doing eight unrelated jobs**, including a three-branch
   equip loop (lines 62-89) whose arms differ only in counter, slot limit, equip
   function and log wording.
6. **Six "zero means unset" fallbacks, two enforcement styles.** Four are
   normalized in the constructor (`chaseIntoAuraMargin`, `idleSpeedFactor`,
   `dwellMaxTicks`, `maxHealth`); two are re-applied on **every read**
   (`SummonPower()`, `PowerScale()`), which silently makes direct field access a
   bug. One convention would be better than one convention enforced two ways.
7. **`Update(dt float32)` ignores `dt` entirely** — everything is in ticks. The
   parameter is inherited from the ECS interface and reads as frame-rate
   independence the code does not have. Related: velocity is
   `0.055 * d.Factors.Speed` (line 178) under a long-standing
   `TODO use walkingSpeedPerTick from global config`. That hardcoded
   tick-coupled constant is exactly what makes **`plan-input-jitter.md` chunk 3
   (client/server rate alignment) non-trivial** — worth reading together.
8. Smaller, all one-sitting fixes: `highestThreatTarget()` (line 1074) **prunes
   dead entries while reading** — a getter that mutates, as does
   `ForceThreatToTop`; the threat-entry gate (nil / same-faction / dead + lazy
   map init + get-or-create) is **copy-pasted** between `noteThreat` (923) and
   `ForceThreatToTop` (962); `tryGrantKillRewards` (1372) and `KillCreditNames`
   (1340) walk the **same** participants × `RecentHealers()` dedupe twice, one to
   grant and one to name, so a change to the credit rule must land in both;
   `NoteThreat` is an exported one-line wrapper around `noteThreat`.
9. **Layering note, knowingly taken:** `rewardPlayer` (1406) composes the
   user-facing English string — `p.Client().SendUnlock(id, "Dropped by: "+…)` —
   so a domain entity reaches through to the network client *and* authors UI
   copy. That is the design shipped in `2bfee286` across all four grant sites
   (`plan-unlock-attribution.md`), so it is deliberate, not an oversight. The
   cost to remember: rewording or localising unlock banners means grepping string
   literals across `sys/` and `model/`.

### 27.3 `skills/definition.go` — excellent, with uneven coverage

This file's hard-fail-at-load philosophy is the reason the JSON content pipeline
can be trusted without a schema (`research-code-quality.md` §1 and §7.1 both say
so, and the per-payload builder refactor closed §3.1). **The findings below are
gaps in coverage, not problems with the design** — and each one is a silent
no-op of exactly the kind the rest of the file exists to prevent.

> **✅ FIXED 2026-07-24, findings 1 + 2, test-first** (`eee10331`). The
> §27.4 order pairs these two, so they landed together.
> - **Finding 1 (§27.3.1 `default:`):** the switch now ends with an explicit
>   `case EffectTypeLightAura, EffectTypeRecall:` (payload-less by design) then a
>   `default: return EffectDef{}, fmt.Errorf("effect type %v has no payload
>   mapping", …)`. The naive one-line `default:error` the finding proposed would
>   have wrongly rejected the two intentionally payload-less types — the real fix
>   whitelists them, and the `default:` now hard-fails only a type added to
>   `effectTypeMap` but forgotten in the switch.
> - **Finding 2 (§27.3.2 zero-value guards):** three inert-config guards added,
>   mirroring the dot/shield/stat convention — `damageParams` fails when
>   `damageHP` + `damageHPPerLevel` + `structureDamageFraction` are all 0 (a
>   siege aura with only `structureDamageFraction` stays valid — verified against
>   `placeable.go:107`, structure damage is independent of `damageHP`);
>   `healParams` **and** `selfHealParams` fail when all four heal knobs are 0
>   (evened out beyond the finding's `heal_aura`-only wording); and
>   `mapToEffectDef` fails when a geometry-using type has base `radius ≤ 0`. The
>   radius guard is **data-driven** — `slices.Contains(effectKeys[type],
>   "radius")` — so any future geometry type is covered with no new list. Placed
>   after the payload switch so a specific payload error wins.
> - **Verified:** 6 new tests (rejections + a payload-less-still-parses
>   regression + a siege-aura-stays-valid regression); 8 incidental fixtures in
>   `definition_test.go` + 1 in `sys/state_test.go` completed to valid defs (they
>   had authored inert/radiusless skills). `go test ./...` green (29 pkgs), `go
>   vet` clean, `go build` clean. Real content boot-safe: `aurad -content ../api`
>   loaded 10 items/83 skills/14 factions/50 mobs/1 milestone/10 recipes/5 props,
>   zone 777 props/471 spawns, **0 panics, 0 load errors** (pre-scanned all
>   `api/skills/` first — nothing trips the new guards). Findings 3–5 below stay
>   open.

1. **✅ FIXED (see banner above). ⭐ `mapToEffectDef`'s 15-case switch has no `default:`** (line 975). Adding an
   `EffectType` means hand-editing four tables in this file (`effectTypeMap`,
   `effectKeys`, this switch, a payload struct + builder) plus the apply switch
   in `sys/skills.go` and `HasVisibleTickCadence`. Three of those fail loudly
   when missed — a type absent from `effectTypeMap` fails parsing, one absent
   from `effectKeys` rejects every key. But a type missing from **this** switch
   parses *successfully* into an `EffectDef` with **every payload pointer nil**,
   which is precisely the invariant the struct's own doc comment says parsing
   enforces ("the pointer matching Type is non-nil, every other one nil").
   Downstream that is a nil deref or a silent no-op depending on the apply site.
   **One-line fix:** `default: return EffectDef{}, fmt.Errorf("effect type %v has
   no payload mapping", effectType)`. Same class as §7.3's positional
   `gameObjectClasses` array — latent, silent, and cheap to close permanently.
2. **✅ FIXED (see banner above). The no-silent-no-op rule is applied unevenly across payloads.** Hard-fails
   today: `dot` with no damage, `hot` with no heal, `shield` with no pool,
   `stat_multiplier` with no scaling, `dash` with zero distance, `taunt` with
   zero margin, `tick_rate` at factor 1. Loads fine today: **`damage_aura` with
   `damageHP` and `damageHPPerLevel` both 0** (an aura that deals nothing),
   **`heal_aura` with no heal authored**, and **`radius: 0` on any aura**
   (an aura that reaches nothing — never validated for any type). The guards were
   added chunk-by-chunk as each payload landed; the two oldest payloads
   (damage, heal) predate the convention and never got theirs. ~15 lines to even
   out, and it closes the most plausible authoring mistake left in the pipeline.
3. **✅ FIXED 2026-07-24, test-first (`f095514a`). `tickInterval` silently coerces bad input** (line 955).
   An authored 0 or negative now hard-fails at load with
   `tickInterval: must be > 0 when authored`; absent still normalizes to 1.
   Pinned by `TestMap_NonPositiveTickIntervalFails` (fails on the pre-fix
   mapper). All of `api/skills/` prescanned first — authored values are 1..120,
   so nothing existing trips the guard, confirmed by a clean 83-skill boot.
   Original finding: The field is a
   `*int` *precisely* to distinguish absent from 0 — and then
   `if e.TickInterval != nil && *e.TickInterval > 0` throws that distinction
   away: an authored `"tickInterval": 0` or `-5` is rewritten to 1 instead of
   hard-failing, in the one file whose entire thesis is that a value the engine
   ignores must not load. 3-line fix.
4. **Authors and the catalog speak different vocabularies for the same data.**
   Content JSON is flat and prefixed (`damageHP`, `healHP`, `resistTags` — the
   private `effectDef` shape); `GET /skills` serves nested payloads
   (`damage.hp`, `heal.hp`, `resist.tags` — the public `EffectDef` shape). Both
   halves are deliberate and well-documented, but the consequence is that a
   designer reading the catalog in devtools cannot grep a key back to the file
   they author, and `SkillTooltip.ts` speaks a different language than
   `manual-content-authoring.md`. **Probably a doc fix, not a code change:** one
   `authored key → catalog path` table in the manual.
5. Noted and explicitly *not* worth acting on: `mergeKeys` (830) can emit
   duplicate entries when key groups overlap (`variance` sits in both
   `keysDamagePayload` and `keysDotPayload`) — harmless against a linear
   `slices.Contains`, and a *dropped* entry fails loudly rather than silently.

### 27.4 Suggested order, if any of this is ever scheduled

| # | Item | Effort | Why this order |
|---|---|---|---|
| 1 | ~~§27.1 removal-during-iteration~~ **✅ DONE 2026-07-24** | ~30 min, test-first | the only live defect here |
| 2 | ~~§27.3.1 `default:` on the payload switch~~ **✅ DONE 2026-07-24** (`eee10331`) | one line | permanently closes a silent class |
| 3 | ~~§27.2.1 validate the EntityType name-fallback at load~~ **✅ DONE 2026-07-24** (`c3938be7`) | ~1 h, test-first | turned a live-server crash-at-first-spawn into a boot error |
| 4 | ~~§27.3.2 even out the zero-value payload guards~~ **✅ DONE 2026-07-24** (`eee10331`, same session as #2) | ~15 lines | authoring-safety, same session as #2 |
| 5 | ~~§27.2.2 drop-RNG determinism~~ **✅ DONE 2026-07-24** (`b4b0e66d`) | ~1 h, test-first | **PO-ruled a bug** — now random per run via a per-process salt |
| 6 | ~~§27.2.3 mob regen → `conf.json`~~ **✅ DONE 2026-07-24** (`2ec03ee7`) | ~30 min, test-first | now `game.mob.healthGainTick`, mirroring the player block's vocabulary |
| 7 | ~~§27.3.3~~ **✅ DONE 2026-07-24** (`f095514a`) · §27.2.8 still open | opportunistic | pure hygiene |
| — | §27.2.4 `Mob` god struct | do **not** act pre-emptively | watch item, like §25's |

---

## 28. Item-system removal — ✅ DONE 2026-07-24 (3 chunks, `b9d01d33` + `2f933634` + Chunk 3)

> **✅ CLOSED 2026-07-24.** All three chunks landed and were PO-verified in-game;
> the plan doc is archived at `docs/archive/plan-item-system-removal.md` (its §13
> is the full ledger). Chunk 1 removed the backend registry, Chunk 2 the frontend
> scaffolding + `api/items/none.json`, Chunk 3 the wire tail — and went further
> than part 2 below: rather than accepting the mid-enum renumber, it **pinned
> explicit values on both `EntityType` and `StatusEffect` at their existing
> ordinals**, so every survivor's wire value is unchanged and *every future
> removal is a one-line delete that leaves a gap*. `StatusEffect.Yielded` (dead
> too, missed by the plan) went with `Freezing`/`Starving`. Two follow-ups were
> spun off: **§29** (an unexplained develop-mux page error) and **§30**
> (pre-existing render/asset vestiges the audit surfaced).

**Tracked 2026-07-24** (PO ask, during the §26 resource/decay-prune planning) so
it is not lost. This is CLAUDE.md's long-referenced "planned item-system removal",
plus the schema tail (Tier 3) the §26 prune deliberately left behind. Do **after**
the §26 prune (`docs/archive/plan-resource-decay-prune.md`), which first strips the
resource/placeable JSONs and the entity/system layer.

> **⚑ Update 2026-07-24 — the §26 prune (`ee9d42e9`) already did half of this.**
> Deleting the 9 resource/placeable JSONs left `api/items/` with a **single
> `none.json`**, so the boot log now reads `Loaded item definitions count:1`.
> Whatever it once was, the item registry is now the `None` item alone — part 1
> below is no longer a ~10-definition unwind, just: delete `none.json`, the
> `items` package + embed, `items.Registry`, the loaders, `game.Items()`, and the
> frontend item/equipment/crafting scaffolding. Confirm `None` has no live
> consumer first (it is the `ItemTypeNone` zero-value sentinel in
> `items/itemtype.go` — likely referenced by item-typed fields that also go with
> this cut). Part 2 (schema) is unchanged.

Two coupled parts, one chunk:

1. **The item registry itself.** `game.Items()` has **zero live callers**. Was
   ~10 item definitions (Wood, Stone, Bronze, Iron, Titanium, TitaniumShard,
   Feather, Campfire, BigCampfire, None); after `ee9d42e9` only **`None`** remains
   (see the update banner above). None are read by game logic (the only
   `GetByName("Campfire")` hits the *mobs* registry, not this one). Removing it
   touches `items.Registry`, the loaders, `model.Game`, and the frontend
   item/equipment/crafting scaffolding (§4 of `research-code-quality.md`).
2. **FlatBuffers `Placeable` schema prune (§26 Tier 3).** Remove `Placeable` from
   `union AnyEntity` (renumber-safe — it is the *last* union member) + the
   `Placeable` table, and — carefully — `EntityType.Placeable` (mid-enum, so it
   **renumbers** subsequent members); regenerate bindings both sides. Only worth
   the wire regen bundled with part 1. (§26 Chunk 2 removes the frontend
   `Placeable.ts` decode path; this removes the schema underneath it.)

**Not scheduled.** Same mechanical shape as the §26 prune; verification tail is the
same (`go build`/`go test`/`tsc --noEmit` + boot count + join smoke).

---

## 29. Investigate: intermittent `null.split` page error + black world on the develop mux

**Tracked 2026-07-24** during the §28 Chunk 3 wire-enum prune (`plan-item-system-removal.md`).

**What was seen (once).** On the *first* cold headless load of
`?token=plz&wsUrl=…&develop` after a server restart, the client threw
`Cannot read properties of null (reading 'split')` **three times** as page
errors and rendered a **completely black world** — no terrain, no character
sprite — while the HUD, the dev panel and the websocket were all healthy
(`Websocket PLAYING`, server tick advancing, HP/XP bars populated).

**Why it was not attributed to the enum prune.** The failure did not reproduce
in **five** subsequent cold runs, nor on the plain mux at all. A wrong wire enum
value is deterministic per entity stream — it would break *every* join, not one
in six. The failing run's dev panel also showed client frame times up to
**40 000 ms** (vs. ~10 ms on healthy runs), i.e. severe rAF starvation while the
cold 2.8 MiB bundle + 7 MiB audio decoded. Prime suspect: a load-order race that
only opens when the first frame is starved that badly.

**Leads / dead ends already checked.**
- `Utils.ts logCallers()` is the only `.split` on a `new Error().stack` (which
  can legitimately be null) — but it has **zero callers**, so it is not it.
- `QueryParameters.ts` `getStringArray`/`tryGetStringArray` both null-guard
  before `.split(',')`.
- `_ZoneEditorPanel.ts:723` splits `npcLinesInput.value` — develop-only, but
  needs interaction, and none happened.
- The build is minified, so the observed stack was useless. **Reproduce against
  a dev build (port 2001) to get a real stack**, or wire a
  `window.onerror` capture that logs `e.error.stack` before minification.

**Why it matters.** A black world with a healthy HUD and websocket is
indistinguishable, to a player, from "the game is broken" — and it is
develop-mux-only so far, which is where all hand-testing happens. Cheap to
reproduce hunting: throttle the CPU hard in Playwright
(`CDPSession.send('Emulation.setCPUThrottlingRate', {rate: 20})`) on a cold
load and see whether the rate goes up.

**Not scheduled.** Low frequency, no known player-facing occurrence on the live
server yet.

### Second sighting 2026-07-24 — two findings that narrow it

Reproduced during the §27.2.3/§25 B verification smoke (a backend-only change;
the frontend bundle was byte-identical to two earlier clean smokes, so it is not
attributable to either chunk). It then did **not** recur in the next **three**
double-mux runs — same ~1-in-6 rate as the first sighting.

**① It is NOT develop-mux-only.** This time the triple `null.split` fired on the
**plain** mux, while the `&develop` context in the same run — same browser
process, seconds later — was completely clean. That **kills the
`_ZoneEditorPanel.ts:723` lead** (develop-only) and removes the dev panel from
suspicion entirely.

**② The black world and the errors are separable.** The failing run still
rendered: the scene-graph probe walked a healthy tree (terrain, mobs,
characters, nameplates) and only the error assertion failed. So the three
`null.split` page errors can occur **without** the black world — which argues
they are two symptoms of one underlying condition (a starved/racing cold boot)
rather than the errors *causing* the black world. A fix hunt should target the
race, not the render path.

Both sightings share: **first cold load after a fresh `aurad` restart**.

**Next step unchanged:** reproduce against the **dev** build (port 2001) for an
unminified stack — the prod bundle's stack is useless. The smoke harness used
here lives in this session's scratchpad; it walks the scene graph from
`window.game.character.plate` to the stage root, because `window.game` is a
narrow console facade (`{run, character, pause, play}`) with no `.layers` or
`.state` despite what the `verify` skill doc implies.

---

## 30. Berryhunter render/asset vestiges surfaced by the §28 Chunk 3 audit

> **✅ ITEMS 2, 3, 4 DONE 2026-07-24, committed `f095514a`** (item 1 stays open —
> it is the only one that touches the wire and should still ride along with
> another schema regen). Headless-verified, **not PO-verified in-game**.
> - **Item 3 (the big one):** the whole `layers.placeables` group deleted — 7
>   containers, both stage-assembly blocks, the no-op `nightExempt` entry and the
>   `IGame` field. `cameraGroup` children **30 → 23**. Behaviour-neutral as
>   predicted; the join smoke confirms all six named containers absent with the
>   world still rendering.
> - **Item 2:** `item: undefined` gone.
> - **Item 4:** `mineral-hit-sharp` alias + preload + its 3.4 KB mp3 deleted.
>   **Deviation — widened:** a full trace showed only `character`/`tree`/`stone`
>   have readers, so **all 8** unread minimap icons went, not the 2 named below
>   (`BerrySeed`, `Workbench`, `WorkbenchConstruction`, `Furnace`, `WoodWall`,
>   `StoneWall`, `BronzeWall`, `IronWall`).
> - **Left deliberately:** `ResourceJuice.ts` is *wholly* unreachable at runtime
>   (its `ResourceStockChangedEvent` can only fire on a stock *change*, and stock
>   is a constant 1) — but retiring that event is item 1's wire work.
> - **Verified:** `tsc --noEmit` clean, webpack prod green, boot 0 panics, join
>   smoke both muxes 752/703 display objects, 0 console/page errors.

**Tracked 2026-07-24** while pruning the dead wire enums
(`plan-item-system-removal.md` Chunk 3). All of these are **pre-existing** dead
weight — none was created by that chunk, which is why they were left alone
rather than folded in. Each is independently removable; none is urgent.

**1. `Resource.capacity` / `Resource.stock` are a constant `1`/`1`.**
`codec/gamestate.go:373-374` hardcodes `ResourceAddCapacity(builder, 1)` +
`ResourceAddStock(builder, 1)` for every prop and NPC, and the client still
carries the whole harvest-era consumer path off them: `Resource.stock`'s setter
in `Resources.ts` calls `onStockChange`, which fires `ResourceStockChangedEvent`
and rescales the sprite by `newStock / capacity` — a ratio that can now only
ever be 1. `House` and `GateWall` already override `onStockChange` to an empty
body precisely to dodge that rescale. **Caveat before cutting:** these are
*mid-table* FlatBuffers fields, so removing them shifts the vtable slots of
`aabb` after them — either accept that (safe pre-persistence, same argument as
§28 Chunk 3) or mark them `(deprecated)` and leave the slots. Removing them also
retires `ResourceStockChangedEvent` and the two override stubs.

**2. `GameStateMessage.ts:166` `item: undefined`.** A snapshot field that is
declared and never assigned — the last trace of the `Placeable.item` wire field
removed in §28 Chunk 3. One line.

**3. Every `layers.placeables.*` container is permanently empty.** All seven
(`campfire`, `chest`, `workbench`, `furnace`, `doors`, `walls`, `spikyWalls`)
are created in `Game.ts` and added to the stage, but **nothing renders into any
of them** — the only references anywhere are the stage assembly itself plus
`placeables.campfire` in the night-exempt set. Real campfires are mobs and go to
`layers.mobs.campfire`, which is separately night-exempt already, so dropping the
whole `placeables` group is behaviour-neutral. (`IGame.ts:20` types it as a loose
`Record<string, Container>`, so no interface change is needed.) Note the §26
naming trap: this is the *display-layer* `placeables`, unrelated to the physics
`model.LayerPlaceableCollision`, which **is** live in `auramask.go`.

**4. Two orphaned client assets.** `mineral-hit-sharp` in `ResourceJuice.ts` is
`Assets.add`-ed and preloaded but never played by any surviving switch case;
`GraphicsConfig.miniMap.icons.BerrySeed` and `.Workbench` have zero readers.

**Not scheduled.** Item 3 is the biggest single win and the lowest risk; item 1
is the only one that touches the wire and should ride along with another schema
regen rather than earning one on its own.

---

## 31. One entity, many roles — converge the player/mob/NPC stat model

**Origin:** PO design question 2026-07-24, raised while deciding where the two
combat constants of §25 B should live: *"what brings us closer to a general
entity system where players and mobs and companions can all kind of function
the same because they are the same — entities that can exist on multiple levels
and have abilities and stats that are similar whether they are an NPC or a
mob?"* Everything below was traced against the code that day.

**The target shape, in the PO's terms:** one entity with a **level**, a **stat
block** and an **ability loadout**, where *player*, *mob*, *companion*, *NPC*
and *boss* are **configurations** of that one thing rather than different kinds.
A friendly NPC is then a levelled entity with abilities that happens to be
non-hostile and carry dialogue; a mob is the same entity with a hostile faction
and AI; a player is the same entity driven by input instead of AI.

### The good news: the shared layer already exists and is proven

Both `*Mob` (`model/mob/mob.go:484`) and `*player` (`model/player/player.go:822`)
already carry a `*skills.SkillComponent` with the same `DerivedStats`
(`skills/component.go:121`). And the two **newest** stats already read it
**entity-agnostically**: `casterCritChance` and `casterDamageFactor`
(`sys/skills.go`) take `acting any` and structurally assert
`SkillComponent() *skills.SkillComponent`, so a player, a mob and a summon all
flow through one code path. **The pattern to copy is already in the file** — it
simply was never applied backwards to the older stats.

### The four gaps

**1. Three of five derived stats are applied only in player code paths.**

| stat | applied at | reaches mobs? |
|---|---|---|
| `CritChanceBonus` | `sys/skills.go` `casterCritChance` (`acting any`) | ✅ |
| `DamageDealtBonus` | `sys/skills.go` `casterDamageFactor` (`acting any`) | ✅ |
| `MaxHealthBonus` | `model/player/player.go:246` | ❌ |
| `DamageReductionBonus` | `model/player/player.go:292` | ❌ |
| `MovementSpeedBonus` | `core/input.go:343` (player input path) | ❌ |

A mob equipping Hardy, Tough or Swift silently gets nothing. **Latent, not a
live bug** — verified 2026-07-24 that **zero mob definitions equip any of the
five `stat_multiplier` passives** (`tough`/`swift`/`keen-eye`/`hardy`/`strong`
→ 0 mob defs each). It becomes live the day a mob authors one, and it will fail
silently, which is the dangerous part. Fix = hoist to `sys`-level helpers over
`acting any`, exactly like the two that work.

> **Re-verified 2026-07-25 against the §25 C lesson** (that gap was recorded as
> latent on a check that only considered mob content, and was live all along —
> see the §25 banner). **The "latent" label survives the same scrutiny, and is
> correct.** What was redone:
>
> - **Checked by effect TYPE, not by skill name** — the exact §25 C failure
>   mode. Grepping all 83 skills for `"type": "stat_multiplier"` yields
>   **exactly 5**, all player passives (Hardy/`maxHealth`, Tough/
>   `damageReduction`, Swift/`movementSpeed`, KeenEye/`critChance`,
>   Strong/`damageDealt`). **No `api/skills/mobs/` skill authors the effect type
>   at all**, so the name-based and type-based checks agree.
> - **All 50 mob defs re-read**: each equips 1–2 combat skills, three equip
>   none, none equips a passive.
> - **Every runtime acquisition route is closed.** Summons: `spawnSummon`
>   (`sys/skills.go:1507`) builds from the *mob def*, not the owner — no passive
>   inheritance, and `RaiseLoadoutLevels` only raises what the def equipped.
>   Cheats: `sys/cmd/cmd.go:142` grants to a player only. Encounter scripts:
>   no skill grants at all. NPCs: `model/npc.Npc` has no `SkillComponent`
>   (which is gap 4).
> - ⚠ **Near-miss for the next reader:** `sys/skills.go:1523` calls
>   `p.MaxHealthBonusAt(ownerLevel)` **on a mob** and scans like a mob-side
>   reader of `MaxHealthBonus`. It is not — it is `SpawnParams`' summon-HP-from-
>   owner-level, an unrelated quantity that happens to share the name.
>
> **Three things the original entry missed, all of which make the trap worse:**
>
> **① It defeats the obvious verification.** `recomputeDerived()`
> (`skills/component.go:313`) is a `SkillComponent` method and runs from
> `EquipPassive`/`RaiseLoadoutLevels` **regardless of whether the component
> belongs to a player or a mob**. A mob equipping Hardy therefore has
> `Derived.MaxHealthBonus` **correctly populated** — a debugger, a log line, or
> a test asserting on `Derived` all show the right number. The failure is not
> "the stat does not compute", it is "the stat computes and nobody reads it".
> Whoever authors the first mob passive will check their work the natural way
> and conclude it works.
>
> **② Nothing warns.** `model/mob/mob.go:123` shows the mob side already has
> the full passive-equip path, including a "declares more passives than slots"
> log. Authoring a passive on a mob is an accepted, ordinary-looking action the
> loader takes **silently** — no hard-fail, no warning, unlike the tier/baseline
> authoring guards.
>
> **③ ⭐ The sim harness is exposed too, and that is arguably worse than the
> live bug.** `sim/world.go:160` builds mobs with `mob.NewMob(def, …)` from the
> real definitions, so the day a mob def carries a passive the **balancing
> harness models it wrong as well** — and the harness is where TTK, kills/hour
> and the XP bands come from (`plan-sim-harness.md`). A live bug surfaces in
> play; a wrong harness number gets baked into authored content and stays there.
> **Any fix for gap 1 must be verified in the harness, not only in-game.**
>
> **Why it stayed latent (and why that is a design signal, not luck):** mobs
> have parallel mechanisms for all three broken stats — `factors.baseMaxHealth`
> + `Mob.RaiseMaxHealth` for HP, resist tags for damage reduction,
> `factors.speed` for movement. An author reaching for mob durability naturally
> reaches for `factors`, never for Tough. That is gap 2 (two vocabularies)
> wearing a different hat, and it is the concrete reason the "do NOT action
> gap 1 in isolation" note below stands: the question is not "wire three more
> readers", it is "should mobs express durability as passives at all".

**2. Base stats speak two vocabularies.** Players read `cfg.PlayerConfig`
(`BaseHealth`, `HealthGainTick`, `WalkingSpeedPerTick`, `CritChance`,
`LevelCurve`); mobs read `mobs.MobDefinition` plus hardcoded Go — velocity
`0.055 * d.Factors.Speed` (`mob.go:232`, under a standing
`TODO use walkingSpeedPerTick from global config`) — and had **no crit base at
all** (`casterCritChance` explicitly special-cases `model.PlayerEntity`).
**Partially addressed 2026-07-24 (§27.2.3 + §25 B):** mob regen became
`game.mob.healthGainTick` deliberately mirroring the player block's *name and
unit* (a fraction of max pool per tick), and the two universal combat factors
moved to a `game.combat` block precisely because they are **not** player-only.
That is the first instalment of this item, not a substitute for it. The
remaining divergence to fold in: movement speed, and a base crit for non-players
if that is ever wanted.

**3. Two level curves.** Player: `PlayerConfig.LevelCurve` (`curve.Curve`,
growth 1.12 × maxLevel 30). Mob: tier + baseline derivation at registry load.
Both compute f(level); neither can read the other's.

**4. `model/npc` is not on the axis at all.** `Npc` (`model/npc/npc.go:58`) is a
body + a proximity sensor + `teachings`/`lines` — **no health, no level, no
faction, no `SkillComponent`**. It cannot act and cannot be hit. **The codebase
has already been routing around this:** every "NPC" that needed stats was
implemented as a **mob** — the village healer, the campfires, the turnip fields,
the guards — while all 14 teaching/lore NPCs in `world.json` are the statless
kind. That is the clearest evidence the abstraction is missing: the content
keeps asking for it and the answer keeps being "make it a mob".

### Convergence target

`effective = base(per-entity source) × derived(shared)`, read through **one**
interface — already true for `critChance` and `damageDealt`, and the model the
other three should be moved onto.

### Sequencing note

Gap 1 is the cheap, mechanical one and is pure latent-bug removal — but it is
**not** free of design: it needs a ruling on whether mob passives scale
identically to player ones. Gap 4 is the deep one and is really a **content**
question (should NPCs be killable? levelled? teachable-by-combat?) before it is
a code question — so it wants a PO design pass, not a refactor session. Gaps 2
and 3 are mostly plumbing once 1 and 4 are decided.

**Not scheduled.** No live defect; recorded so the direction survives the
session it was discussed in. **Do not action gap 1 in isolation** without the
scaling ruling — a silent behaviour change to every mob is the failure mode.

**First instalment landed 2026-07-24 (`2ec03ee7`), part of gap 2:** mob regen
became `game.mob.healthGainTick` using the player block's exact name and unit,
and the two universal combat factors moved to `game.combat` rather than
`game.player`. Both were chosen *for* this convergence — the point was to make
the eventual unification a rename, not a redesign. Movement speed
(`0.055 * Factors.Speed`, still under its TODO) is the obvious next one.

**⚠ Sequencing vs roadmap step 8 (accounts & persistence):** persistence has to
serialize *something*, and "what is a character, versus a mob, versus an NPC" is
exactly the question this item asks. Deciding the entity model **before** a
schema is written is materially cheaper than migrating one after. Worth at least
a deliberate "we are not unifying yet, and here is what that costs the schema"
call during step-8 planning.

### Gap 5 — the same divergence exists in AI, and it is the cheap half

**Added 2026-07-25**, from the healer-regen bug (`plan-playtest-feedback.md`
§Intake round 3). Gaps 1–4 are all about the **stat** model. The identical
"role baked as a type" pattern runs through the **behaviour** model, and it is
both cheaper to fix and already causing trouble.

`updateAggro` has two special-case early-returns — `isFollower`
(`model/mob/mob.go:826`) and `seekHealer` (`mob.go:834`). `seekHealer` is a
**flag decided once at construction** (`mob.go:157`, inferred from "does slot 0
carry a heal effect") that then routes the mob into an entirely separate
targeting function. That is precisely this item's counter-example, in AI instead
of stats: a role expressed as a *type* rather than read from the loadout.

**They already collide.** `MedicCompanion` carries `HealerAura` but is a
follower, so `isFollower` wins and the healer path never runs for it — its heal
aura ends up gating on acquiring a *hostile* within heal-aura reach, and its
`aggroRadius` is a `0.1` dummy so it cannot sense a wounded ally at all. Same
shape as gap 4's *"the content keeps asking for the abstraction and the answer
keeps being 'make it a mob'"*, one level up.

**Decided 2026-07-25 (PO, via choice prompts) — scheduled as this item's
behaviour-side instalment, its own chunk, before step-8 planning.** Replace both
early-returns with one loadout-driven mode selector keyed on **aura category**
(`skills/aura_category.go`, already exhaustive and build-test-enforced):

> If an ally is below `supportThreshold` and I carry a support-category aura →
> activate that slot and move to the ally. Otherwise → activate my primary slot
> and behave as a normal combat mob.

Support set = **Heal + Shield** [PLACEHOLDER]; Resist/Light are one constant
away. Healer, hybrid healer, damage+shield guardian and plain fighter all become
**loadout configurations of one behaviour**, with no branching — which is this
item's thesis, demonstrated on the cheap half. Full decision list, chunk shape
and the mode-thrash landmine: `plan-playtest-feedback.md` §Intake round 3.

**Deliberately NOT built (YAGNI, PO 2026-07-25):** per-slot authored conditions
— own-health triggers (*"below 30 % I pop a defensive aura"*), enemy-count
triggers, a 3-slot priority table with three different triggers. The migration
is **additive**: the fixed rule above becomes the default row. Build it when a
second condition *kind* actually shows up, not before.

**✅ SHIPPED 2026-07-25** (`[uncommitted]`, ⏳ PO test pending) — full ledger in
`plan-playtest-feedback.md` §Round-3 chunk ledger. `seekHealer` is gone,
`healer.go` → `support.go`, both early-returns replaced by the selector.
Confirmed in the build: `MedicCompanion` was broken, **and so was
`ShieldbearerCompanion`**, and there was a *third* reason neither could work —
`SetFaction` re-derives the sensor mask and `spawnSummon` calls it after
`NewMob`, so the ally-sensing widening was narrowed straight back.

**Residue this left behind — the slot-0 assumption (small, do it opportunistically).**
The rework killed "role as a type", but two spots still assume **slot 0 is the
combat aura**, which was true only while one latched flag decided everything:

- `model/mob/companion.go:148` `auraCanReach` tests the **slot-0** aura's mask
  against a candidate target. For a hybrid follower whose slot 0 is the support
  aura, that asks "can my *heal* reach this enemy?" — the wrong question. Should
  read `combatSlot`. **Latent**: no companion is a hybrid today.
- `model/mob/mob.go:164` pre-sizes the aura collider from slot 0. Much milder —
  the SkillSystem re-derives radius/mask every tick once a slot is active, so
  this only affects the stop distance on the first tick before acquisition.

Both are the exact §31 failure shape (*correct until content asks for the
combination, then silently wrong*), so they are worth closing **with** the first
hybrid mob rather than being left to be discovered by it.

**Still an implicit type: `isFollower()`** = `owner != nil && velocity > 0`
(`companion.go:61`), documented as deliberate YAGNI at chunk-6 plan-first. It is
now the *last* mob role inferred rather than read, and its branch order turned
out to be load-bearing (a medic is both a follower and a pacifist — pacifist has
to win, or it chases the owner's attacker with nothing to hurt it with). Fold
into the entity-model decision rather than fixing standalone.

**Checked and NOT a problem** (verified 2026-07-25, recorded so it is not
re-investigated): `SetFaction` overwrites the authored `aggroMask` with
`^f.Bit()` ("aggro everything that is not me"), discarding the faction's curated
aggro set. Inert in practice — followers acquire from owner signals and never
consult the mask, and stationary summons are `auraAlwaysOn` and acquire nothing.

**Also parked here (PO 2026-07-25):** a shared **`Autoattack`** skill — *"a
default damage aura for everything, akin to WoW auto attack"*. The mode selector
delivers "retaliate if it has the means" without it. The version worth having is
`curveLevel`-derived, which **is gap 3** (two level curves, neither can read the
other's); a flat-authored version would need per-tier variants and become
migration debt the day gap 3 lands. Note that a universal auto-attack for
**players** was rejected outright on design grounds: it would defuse the
"choosing the Lantern costs you all your damage" trade-off the zone-1→2 tunnel
tutorial is built on.

---

## 32. Consumable cooldowns — charges in the spellbook

**Origin:** PO idea 2026-07-25, recorded alongside the healer-regen bug
(`plan-playtest-feedback.md` §Intake round 3). *"Cooldowns that are very
powerful, that can be farmed and used up, because the spellbook carries them
similar to an inventory — something like a 'disposable bomb' that does huge
damage once but consumes a charge in the spellbook."*

**The shape:** a cooldown skill that additionally carries a **charge count**.
Casting consumes a charge; at zero it is unusable but still known. Charges are
farmed from the world (mob kill drops already grant skills via the `unlocks`
table with a chance, so the *source* mechanism exists).

**Why it is interesting beyond "an item system by another name":**

- It is the first thing in the game with a **quantity**, and the first thing a
  player can **lose** — which is exactly the pressure round 2's headline theme 4
  (*"nothing costs anything"*) is asking for, at a different scale than
  per-tick resource costs.
- Powerful-but-finite is a different design axis from powerful-but-long-cooldown:
  it makes *when to spend* a decision rather than *when it comes back up*.
- It gives kill-drops a second job. Today a drop is a one-time unlock and the
  mob becomes pointless to re-farm; a charge source stays relevant.

**⚑ Open — the decision that determines everything else: does a charge survive
death?** This is a **step-8 (accounts & persistence) consumer**, not an
independent feature. Persisted charges = a durable stockpile and a real farming
loop; wiped-on-death charges = a per-life consumable closer to a pickup.

**⚑ Watch — economy creep.** This is an economy seed, and the GDD puts economy
outside v1.0 scope. Charges that can be *stockpiled* invite trading pressure the
moment more than one player wants one. Worth deciding deliberately whether
charges are ever transferable (recommendation: no, ever — untradeable sidesteps
the entire question).

**Not a re-introduction of the item system.** §28 removed items; this is a
counter on a **skill**, not an inventory of objects — a charge count on the
spellbook entry, a wire field, UI, and consumption at cast. Materially smaller,
and it rides machinery that already exists (`CooldownSlots`, `PendingCooldowns`,
the cast path in `sys/skills.go`).

**Not scheduled.** Revisit during step-8 planning, where the persistence
question is on the table anyway.
