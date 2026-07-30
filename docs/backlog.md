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

**WoW/Gothic fit: medium** *(ranked 2026-07-29, PO-confirmed)*
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

**WoW/Gothic fit: high** *(ranked 2026-07-29, PO-confirmed)*
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

**WoW/Gothic fit: none (theme-neutral)** *(ranked 2026-07-29, PO-confirmed)*
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

**WoW/Gothic fit: none (theme-neutral)** *(ranked 2026-07-29, PO-confirmed)*
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

**WoW/Gothic fit: low** *(ranked 2026-07-29, PO-confirmed)*
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

## 9. Recall — ✅ DONE 2026-07-14, shipped `4287977e`

> **✅ BUILT AND LIVE.** Shipped as skill-vocabulary chunk 4 (*"cast-time +
> interrupt + Recall"*, execution step 4) — exactly where the 2026-07-09 status
> below placed it; this banner was simply never written. **`api/skills/recall.json`:**
> id 28, `category: cooldown`, `maxLevel: 1`, `cooldownTicks: 9000` (5 min),
> `castTicks: 300` (**10 s, matching the placeholder below**),
> `castInterruptedByDamage: true`, one `{"type": "recall"}` effect. Engine:
> `skills.EffectTypeRecall` (`skills/definition.go:53`), teleport at
> `sys/skills.go:1377`, and an **activation precondition** at
> `sys/skills.go:1253` that rejects with `ActivationRejectedNoAnchor` when the
> player has no campfire anchor bound — so the mechanic below resolved as
> *interrupted by damage*, not invulnerable-while-casting, and the target set
> resolved as the **campfire anchor** (`connState.AnchorOf`), i.e. the same
> tracker as death-respawn, not a broader "safe place" set. §20's teleport-snap
> was fixed in the same commit, as the ⚠ note below required. The ⚑ open
> questions further down are all answered by the shipped skill; they are kept
> as the design record only.

**WoW/Gothic fit: high** *(ranked 2026-07-29, PO-confirmed)*
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

**WoW/Gothic fit: low** *(ranked 2026-07-29, PO-confirmed)*
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

**WoW/Gothic fit: none (theme-neutral)** *(ranked 2026-07-29, PO-confirmed)*
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

**WoW/Gothic fit: low** *(ranked 2026-07-29, PO-confirmed)*
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

**WoW/Gothic fit: medium** *(ranked 2026-07-29, PO-confirmed)*
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

**WoW/Gothic fit: medium** *(ranked 2026-07-29, PO-confirmed)*
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

**WoW/Gothic fit: high** *(ranked 2026-07-29, PO-confirmed)*
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

**WoW/Gothic fit: low** *(ranked 2026-07-29, PO-confirmed)*
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

**WoW/Gothic fit: none (theme-neutral)** *(ranked 2026-07-29, PO-confirmed)*
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

**WoW/Gothic fit: none (theme-neutral)** *(ranked 2026-07-29, PO-confirmed)*
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

**WoW/Gothic fit: none (theme-neutral)** *(ranked 2026-07-29, PO-confirmed)*
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
>   authoring 0 (open question flagged to the PO 2026-07-24). **✅ RULED
>   2026-07-29: ACCEPTED — `0` means *default*, not *disabled*.** The one
>   normalization path is worth more than the ability to zero a factor from
>   conf; if a knob ever genuinely needs switching off, it gets its own explicit
>   flag rather than overloading the value. Document it, do not change it.
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

**WoW/Gothic fit: none (theme-neutral)** *(ranked 2026-07-29, PO-confirmed)*
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
6. **`TargetFactionMask` is now dead payload on the wire (found 2026-07-29).**
   `/skills` marshals `SkillDefinition` verbatim, so the resolved mask ships to
   the client on the **skill and on every effect** — and since `2fffe9ee` the
   client reads the display **names** instead, leaving **0 client readers** of
   either mask. It cannot be decoded there anyway (the faction registry is
   boot-only and the bits depend on registry load order). Both fields are still
   load-bearing *server-side* — the effect-level one is the runtime gate in
   `eligibleByTargetFlags` — so this is a `json:"-"` on the serialization, not a
   deletion. Cosmetic; the kind of vestige the R1 prune existed to catch.

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

## 29. ~~Investigate:~~ intermittent `null.split` page error + black world — **lost WebGL context**

**WoW/Gothic fit: none (theme-neutral)** *(ranked 2026-07-29, PO-confirmed)*
> **✅ DIAGNOSED 2026-07-26 — root cause found and reproduced deterministically.**
> It is **a lost WebGL context**, and the `null.split` is PixiJS's *error
> reporter* crashing on the way to reporting it. Full write-up in
> §29.1 below; the sections under it are the original (partly wrong) trail, kept
> because two of its leads have to be actively un-believed.
>
> **✅ OPTION A SHIPPED 2026-07-26 (chunk A), committed `6c8bde2e`** — the
> client now labels the failure instead of leaving three lying TypeErrors behind.
> Ledger: §29.2.2. **The trigger is still unknown and rendering is still not
> recovered** — this is detection only, so §29 stays open: option C (reduce the
> trigger) remains the only lever at the cause, and any *player*-facing sighting
> promotes it.

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

### 29.1 Root cause (2026-07-26) — a lost WebGL context, misreported

**The error is not in our code.** It is thrown inside PixiJS's shader-error
*reporter*, and its first statement is the throw site:

```js
// pixi.js/src/rendering/renderers/gl/shader/program/logProgramError.ts
function logPrettyShaderError(gl, shader) {
  const shaderSrc = gl.getShaderSource(shader).split("\n")…   // ← null.split
```

The captured stack (unminified prod build, this session):

```
logPrettyShaderError            → gl.getShaderSource(shader).split("\n")
Object.logProgramError
Object.generateProgram
GlShaderSystem._createProgramData
GlShaderSystem._getProgramData
GlShaderSystem._setProgram
GlShaderSystem.bind
```

**The chain, all of it verified:**

1. The WebGL context is lost (driver/browser decision — GPU reset, memory
   pressure, headless SwiftShader hiccup). **On a lost context every WebGL
   getter returns `null`** — that is where a genuine `null`, rather than an
   `undefined`, comes from.
2. `generateProgram()` links its program and checks
   `gl.getProgramParameter(p, LINK_STATUS)`. That is now `null`, so `!null` is
   true and it concludes the program failed to link.
3. `logProgramError()` then checks `getShaderParameter(…, COMPILE_STATUS)` for
   the vertex and fragment shaders — also `null`, so both look failed, and it
   calls `logPrettyShaderError()` to pretty-print the source.
4. `gl.getShaderSource(shader)` is `null` too ⇒ **`TypeError: Cannot read
   properties of null (reading 'split')`**, thrown *out of the renderer*. The
   real diagnostic ("context lost") is destroyed by the reporter meant to print
   it, which is exactly why four sightings produced no usable lead.
5. The throw escapes the rAF callback, so **the render loop stops**. Scene
   graph, DOM HUD, websocket and server ticks are all untouched ⇒ a blank world
   with a perfectly healthy HUD.

**Reproduced deterministically** with `.claude/skills/verify/ctxloss-repro.mjs`
(kills the renderer's GL context via `WEBGL_lose_context` after boot):

- Loss **mid-boot** (`HUNT_PERCTX=1`, 400 ms after context creation) → **exactly
  three** `null.split` page errors, world gone, `Websocket PLAYING`, server tick
  advancing, tick rate 32/33/35 ms, dev-panel FPS blank. **That is the sighting,
  symptom for symptom, including the count of three.** Two errors come through
  `GlShaderSystem.bind`, the third through `generateShaderSyncCode` — i.e. the
  count is "how many distinct shader programs the dying frame still had to
  build", which is why it is 3 during boot and 1 in steady state.
- Loss **after boot** (steady state) → **one** error, because every program is
  already cached and only the next new one hits the broken path.

**Two earlier leads are now actively wrong — do not re-use them:**

- ⚑ **The 40 000 ms frame time was a consequence, not the cause.** The original
  note read it as rAF starvation and made "a load-order race that only opens
  when the first frame is starved that badly" the prime suspect. A dead render
  loop is what a frozen frame timer *looks* like. Accordingly, CPU throttling is
  the wrong lever: 4 cold loads at 20× throttle on the dev build and a further
  prod batch (fresh `aurad` restart + cold cache per run) were all clean, and
  the worst *real* frame gap ever measured was 902 ms.
- ⚑ **The scene-graph probe cannot see this failure**, so sighting 2's
  conclusion that "the black world and the errors are separable" is unsafe. The
  graph stays intact — 3 root children / 24 grandchildren both before and after
  the world visibly disappears. Only **pixels** can detect it. (The minimap is
  also its own PixiJS `Application` with its own context, so it can survive
  while the main world does not — visible in the restore experiment below.)

**Also learned, so it stops looking suspicious:** the client creates **five**
WebGL contexts at boot and **PixiJS deliberately loses two of them** — they are
throwaway capability probes (`isWebGLSupported()`), which call `loseContext()`
on purpose. A `webglcontextlost` event at boot is therefore *normal*; only a
loss on one of the two connected `webgl2` contexts (main renderer + minimap)
matters.

**Why PixiJS never recovers:** `GlContextSystem.handleContextLost` does call
`event.preventDefault()` (so restoration is *permitted*), but it only calls
`restoreContext()` when `_contextLossForced` is set — i.e. only when pixi itself
forced the loss. **A real driver-initiated loss is never restored**, so the
renderer stays dead until the page is reloaded.

**Measured (`HUNT_RESTORE=1`): restoring the context by hand is not sufficient.**
`restoreContext()` fires `webglcontextrestored` and the **minimap** Application
came back visibly, but the main world stayed blank — by then its render loop is
already dead and its GPU resources are gone. So auto-recovery is not a
20-line change.

**5th sighting, organic, same session — and it confirms the diagnosis on the
real artifact.** The final check of this session (one unthrottled run against the
restored **minified** prod bundle) reproduced it by itself:

- **3** page errors, the *identical* stack — `logPrettyShaderError` ←
  `logProgramError` ← `generateProgram` ← `GlShaderSystem.bind` ←
  `GlBatchAdaptor.start` ← `_BatcherPipe.execute`, two via `_setProgram` and one
  via `generateShaderSyncCode`, exactly as in the forced mid-boot reproduction.
- All three at **t ≈ 896 / 941 / 962 ms** — during boot, ~40 ms apart.
- **No throttling of any kind**, and the worst rAF gap in the whole run was
  **420 ms** ⇒ final nail in the starvation theory.
- Scene graph healthy (3 root children / 24 grandchildren) while the world was
  visibly gone, and **pixi's own `console.error(shaderLog)` never ran** — the
  throw precedes it, so there is no console breadcrumb either.
- ⚑ **The minimap rendered normally in the same screenshot.** It is its own
  PixiJS `Application` with its own GL context, so *"minimap fine, world blank"*
  is the fastest visual tell that the main renderer's context is what died.

**Trigger still unidentified**: whatever makes the browser drop the context. All
five sightings are **headless harness runs**, with no known player-facing
occurrence — which fits a software-GL/WSL2 headless environment rather than a
real GPU. Note this makes the bug a **harness-reliability problem first**: any
smoke run can lose ~1 in 6 attempts to it and the failure looks like the change
under test.

### 29.2 Fix options — ✅ **A CHOSEN** (PO 2026-07-26)

> **PO decision 2026-07-26: take option A (detect + warn), scheduled as a chunk
> ahead of the step-8 entity design session.** Rationale on record: the entity /
> persistence stretch is verification-heavy and long-running, and a blank world
> in ~1 in 6 headless runs currently reads as a regression in the change under
> test — §29.1's two dead leads were both chased for that reason. A converts it
> into a self-labelling failure for ~20 lines. **B, C and E not taken; D (the
> upstream null-check courtesy) stays optional and unscheduled.** Any *player*
> report still promotes C, per the recommendation below.

- **A — Detect and say so** (~20 lines, recommended). Add our own
  `webglcontextlost` / `webglcontextrestored` listeners on the renderer canvas:
  log loudly and raise the existing red `warning` alert banner ("graphics
  context lost — reload"). Does not fix rendering, but converts a silent blank
  world with three lying TypeErrors into a message a player and a harness can
  both act on. Cheap, no risk, and it makes any future sighting self-labelling.
- **B — A, plus attempt recovery.** Call `restoreContext()` ourselves, then
  restart the ticker and rebuild GPU state. Measured today: the restore half
  works, the rebuild half does not come for free (see above). Real work,
  uncertain payoff, and it would be verified by a reproducer we now have.
- **C — Reduce the trigger.** Cold-boot memory/GPU pressure is the plausible
  cause: §19 (decode-every-mp3-at-boot, ~7 MiB), ~90 SVG textures, 400 KiB jpgs.
  Speculative, but it is the only lever that addresses the *cause* rather than
  the symptom, and it happens to be work already on this list.
- **D — Report upstream.** `logPrettyShaderError` should null-check
  `getShaderSource`; on a lost context PixiJS destroys its own diagnostic. Not
  our code, affects only the message — but it is the reason this took four
  sightings, and a two-line upstream patch.
- **E — Nothing.** Defensible while it stays headless-only: with §29.1 on record
  plus `ctxloss-repro.mjs`, the next sighting is identified in seconds instead of
  investigated from scratch.

**Recommendation:** **A now** (it is the honest minimum and pays for itself the
next time a smoke run goes weird), **D as a courtesy**, and treat any *player*
report as promoting **C**. B only if a player-facing occurrence appears.

### 29.2.1 Chunk plan for option A (traced against the code 2026-07-26)

Frontend only, no backend, no wire. Scheduled ahead of the step-8 entity design
session so a blank world stops reading as a regression in whatever is under test.

**Where it goes.** `frontend/src/features/core/logic/Game.ts`. The world
`Application` is constructed at `:95` and `application.init()` resolves at `:98`
(already chained into `setupResizeHandling`); the canvas is already exposed as
`this.application.canvas` (`domElement` getter, `:86`). Attach a
`webglcontextlost` listener to that canvas on the same `.then()`.

**What it does.** An unconditional labelled `console.error`, plus
`AlertBanner.show('…', 'warning')` — the `warning` kind already exists
(`features/user-interface/alert-banner/logic/AlertBanner.ts:16`) and already
renders red from feedback pass B. Nothing else: no recovery, no ticker restart.

**Three decisions taken at plan time, each with a reason that is not obvious
from the source:**

1. **World canvas only — deliberately NOT the minimap's.** `MiniMap.ts:44` owns
   a second `Application` with its own context, and §29.1's 5th sighting had the
   minimap rendering while the world did not. Warning on the minimap's context
   would be a different (and much less serious) failure. ⚑ **Verify against the
   boot probes:** §29.1 records that the client makes 5 GL contexts at boot and
   **pixi deliberately loses 2 of them** as capability probes. Those are on
   throwaway canvases, so scoping the listener to `application.canvas` *should*
   see zero false positives — but that is the assumption most likely to be
   wrong, and it is the first thing `ctxloss-repro.mjs` must confirm. A warning
   banner on every clean boot is worse than no banner.
2. **`console.error` is the load-bearing half; the banner is best-effort.**
   `AlertBanner.show()` silently no-ops while `bannerElement === null`
   (`AlertBanner.ts:33`, "not set up (tests, early messages)") — and the
   deterministically reproduced case is a **mid-boot** loss, i.e. precisely when
   the banner may not exist yet. The log line is what the harness reads, so it
   must not depend on HUD setup order. **Recorded as a known limitation rather
   than fixed** — queueing pre-setup alerts is machinery this does not justify
   (YAGNI); revisit only if a *player*-facing sighting appears, which per §29.2
   would promote option C anyway.
3. **Do not call `preventDefault()` on the event.** Suppressing the default is
   what makes a later `webglcontextrestored` possible; option B (attempt
   recovery) was explicitly not taken, and §29.1 measured that the restore half
   works while the GPU-state rebuild does not come for free. Leaving the default
   alone keeps A honest instead of half-implementing B. For the same reason
   **no `webglcontextrestored` listener** is added — there is nothing to do in it.

**Test strategy.** Extract the installer as its own module
(`installContextLossWarning(canvas)`) so the vitest/jsdom infra added by the
round-4 chunk can drive it with a stub canvas that dispatches the event, and
assert both the log and the `AlertBanner.show` call. See CLAUDE.md §Frontend
tests for the three landmines (jsdom not node, the `fetch` stub, explicit
`{describe, it, expect}` imports). Real verification is
`.claude/skills/verify/ctxloss-repro.mjs` with `HUNT_PERCTX=1` — it already
forces the loss and screenshots — plus a clean-boot run to prove decision 1.
⚑ **The scene-graph probe cannot see this bug** (§29.3): screenshot, don't walk
the tree.

### 29.2.2 Chunk ledger — option A ✅ DONE 2026-07-26, committed `6c8bde2e`

**Frontend only, no backend, no wire.** 1 file modified, 2 new + 1 new harness.
Executed exactly to the §29.2.1 plan — all three plan-time decisions held, no
deviations, nothing added.

**Content**

- **`features/core/logic/ContextLossWarning.ts` (new)** —
  `installContextLossWarning(canvas)`: one `webglcontextlost` listener →
  a labelled `console.error('[webgl] world context lost — rendering has
  stopped. Reload the page. (backlog §29)')` plus
  `AlertBanner.show('Graphics context lost — please reload the page.',
  'warning')`. Extracted as its own module purely so vitest can drive it.
- **`features/core/logic/Game.ts`** — installed inside the existing
  `application.init().then(…)` alongside `setupResizeHandling()`.
- **`features/core/logic/ContextLossWarning.test.ts` (new)** — 6 tests. Three of
  them are *negative* pins that make the plan's decisions falsifiable: the
  default is **not** prevented (decision 3), `webglcontextrestored` is ignored,
  and another canvas firing the event warns about nothing. The decision-2
  limitation is pinned as behaviour rather than described: **it still logs when
  `#alertBanner` does not exist yet**, which is precisely the reproduced case.
- **`.claude/skills/verify/ctxloss-warning.mjs` (new)** — acceptance harness,
  `clean` / `forced` modes, non-zero exit on mismatch.

**⚑ The plan's riskiest assumption held.** Clean boot measures **5 GL contexts
created, 2 lost** (pixi's capability probes, §29.1) and **0 warnings** — three
consecutive runs. Scoping the listener to `application.canvas` really does see
zero false positives, so the banner does not cry wolf on every boot.

**Verified 2026-07-26** — TDD red first (2 behavioural failures against a stub:
`expected "error" to be called 1 times, but got 0 times`; the 4 negative pins
pass against the stub by construction, as intended). `npm test` **21/21** across
3 files, `npm run typecheck` clean, `npm run build` clean, `go build ./...`
clean (untouched, checked anyway). Forced mid-boot loss: **exactly 1** warning,
banner up with `className="warning"` and the right text, 0 other console errors,
and the screenshot is the whole point — blank world, spellbook/slots/HP/XP
intact, dev panel reporting **FPS 60/60/60**, `Websocket PLAYING`, server tick
advancing, red banner across the top. `ctxloss-repro.mjs HUNT_PERCTX=1` still
produces the three `null.split` TypeErrors unchanged: **this labels them, it
does not suppress them.**

**Two known limitations, both by plan, neither fixed:**

1. **A loss during `init()` itself stays unlabelled** — `application.canvas`
   does not exist until init resolves, so there is no canvas to listen on
   before that. Recorded in a comment at the call site.
2. **The banner is best-effort; the log is load-bearing** — `AlertBanner.show()`
   no-ops while the HUD is not set up (decision 2). Queueing pre-setup alerts is
   machinery this does not justify.

### 29.3 Harnesses (kept)

- `.claude/skills/verify/ctxloss-warning.mjs` — acceptance for the shipped
  warning. `clean` = no forced loss, expect **0** warnings (this is the
  cry-wolf check, and the reason to re-run it after any boot-path change);
  `forced` = mid-boot loss, expect **1** + the banner. Exits non-zero on
  mismatch; screenshots to `/tmp/ctxwarn-*.png`.
- `.claude/skills/verify/ctxloss-repro.mjs` — forces the loss and captures the
  error, stack, GL events and a screenshot. `HUNT_PERCTX=1` = mid-boot loss
  (3 errors), `HUNT_RESTORE=1` = also attempt `restoreContext()`.
- `.claude/skills/verify/hunt-null-split.mjs` — the organic hunt: N cold runs,
  CPU throttling (`Emulation.setCPUThrottlingRate`), optional network throttling
  (`HUNT_NET=1`), optional `aurad` restart per run (`HUNT_RESTART=1`), captures
  `pageerror` stacks *and* an in-page `window.onerror` record (filename/line/col),
  plus a max-rAF-gap starvation metric so a clean batch still reports something.
  ⚠ Its black-world probe walks the scene graph and therefore **cannot** detect
  this bug — screenshot instead.

**To get a readable stack from a prod bundle** (there are no source maps in
`webpack.prod.js`): `npx webpack --config webpack.prod.js
--no-optimization-minimize --devtool source-map`, which keeps prod's three-chunk
`runtime`/`vendors`/`main` split — the **dev** server is a single bundle, so it is
not a faithful stand-in. Restore afterwards with `npm run build` (verified:
identical content hashes). A source map's `sourcesContent` is also enough to map
a bundled line back to its npm source file by substring search, without decoding
any VLQ mappings.

---

## 30. Berryhunter render/asset vestiges surfaced by the §28 Chunk 3 audit

**WoW/Gothic fit: none (theme-neutral)** *(ranked 2026-07-29, PO-confirmed)*
> **✅ §30 IS NOW FULLY DONE.** Item 1 landed 2026-07-28, committed `c183ce12`,
> as H4 of `docs/archive/plan-pre-accounts-hygiene.md` (ledger there, §11): `capacity`/`stock`
> deleted at both ends and the **`aabb` renumber accepted** (D3), taking
> `ResourceStockChangedEvent`, `baseScale`, both empty override stubs and
> `ResourceJuice.ts` + its two mp3s with it. ⚑ The caveat below was the whole
> risk, and it is pinned rather than argued: a new codec test reads every field
> a prop writes back off the wire, **including the moved `aabb`**, because a
> mid-table renumber decodes as garbage rather than as an error.
>
> **✅ ITEMS 2, 3, 4 DONE 2026-07-24, committed `f095514a`.**
> Headless-verified, **not PO-verified in-game**.
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

**Status 2026-07-26: PLANNED AND IN PROGRESS — `docs/archive/plan-entity-model.md`.**
This section stays the *findings* record (the five gaps and why they matter);
the plan doc is where the chunks, the 7 PO rulings and the landmines live.
**Chunks 1a + 1b are done** (2026-07-26): **gap 1 is closed** — the three
numeric player-only derived stats now apply to any actor via three shared
factor methods on `DerivedStats` — **gap 2's movement-speed half** is closed
with it (`game.mob.walkingSpeedPerTick`, value preserved at 0.055), and
**gap 3 is fully closed**: `*Mob.Level()` is evaluated live (an owned summon
reads its owner's current level), `MaxHealth()` and `PowerScale()` are both
derived from it, and the registry no longer pre-derives either — one curve,
one level, read at the point of use.
**Chunk 2 is done** (2026-07-27, `0be771bd`): **the central defect named at the
top of this section — "role is inferred from incidental values instead of
authored" — is fixed for the two inferences that existed.** `role`
(`creature`/`structure`/`follower`) is authored on the mob definition and
validated against one `mobs.ParseRole` table; `auraAlwaysOn := Factors.Speed
<= 0` and `isFollower() = owner != nil && velocity > 0` both read it now, and
the 10 dummy `aggroRadius: 0.1` values are deleted. ⚑ **A third inference was
found during the chunk and is also gone: the SIM harness used `speed: 0` to
mean "turret"** in four places, including the kite-stance pin that half the
chain battery — and therefore the level curve — depends on.
Gap 4 (NPC merge) and gap 5's remainder are chunks 3a/3b. `Derived.Resistances`
— the 4th player-only stat the code audit found — is deliberately still
player-only, pending the first authored resist passive.

**⚑ Two API names in the findings prose below are GONE since chunk 1b**, and
this section is a historical record, not a maintained map: `Mob.RaiseMaxHealth`
(the flat summon HP bonus — a summon's pool is now its own
`baseMaxHealth × f(ownerLevel)`) and `SpawnParams.MaxHealthBonusAt` with the
`maxHealthPerOwnerLevel` key it read (retired from the schema; the loader
rejects it with a migration hint). The "near-miss for the next reader" note
about `sys/skills.go:1523` is therefore moot — that call site no longer exists.

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

**✅ SHIPPED 2026-07-25** (`03b152f4`, PO-verified in-game 2026-07-26) — full ledger in
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

**Deliberately NOT fixed now (PO 2026-07-25), tripwire installed instead.** The
one-line "read `combatSlot`" fix *looks* obviously right, but `auraCanReach` runs
during **acquisition, before a mode is chosen** — so for a hybrid, "which slot
decides reachability?" is genuinely undetermined. A hybrid arguably *should*
acquire a target its damage aura can reach even when its heal cannot, which makes
this a design question for this gap's successor rather than a typo. Fixing it now
would bake in semantics the first real hybrid would immediately dispute, against
a configuration no content has (YAGNI).

So the trap was made **loud** instead:
`TestContent_NoAuthoredMobIsAHybridYet` (`model/mob/hybrid_tripwire_test.go`)
loads the real embedded content, derives the slots through the real `NewMob` (so
it cannot drift from `roleSlots`), and fails the moment any authored mob carries
both a support and a combat aura — naming the mob and both sites to resolve.
Verified to actually fire by temporarily giving `Healer` a `WolfBite`. Same trick
as `TestAuraCategory_ClassifiesEveryAuthorableEffectType`: an assertion that goes
off when new content appears, rather than a behaviour guessed ahead of it. **It
is a tripwire, not a prohibition** — when the first hybrid is wanted, fix the two
sites and replace it with real hybrid behaviour pins.

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

**WoW/Gothic fit: medium** *(ranked 2026-07-29, PO-confirmed)*
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

---

## 33. `hot_aura` cannot pre-hot — the wounded-only gate is inherited, not designed

**WoW/Gothic fit: low** *(ranked 2026-07-29, PO-confirmed)*
**Origin:** PO question 2026-07-26: *"is it intended that Rejuvenation, the
heal-over-time aura, only applies a HoT if the target has taken damage? So
pre-hotting is not possible?"* Answer: **yes, intended — and recorded as
"accepted v1 behavior" at the time.** Everything below was traced against the
code that day.

### The mechanism

`applyHotAura` (`sys/skills.go:822`) filters candidates through an eligibility
predicate whose last line is:

```go
return other.HealthRatio() < 1 // wounded only    // sys/skills.go:846
```

`applyHealAura:747` is the byte-identical line. The hot applier's doc-comment
says so outright — it *"reuses the heal aura's implicit same-faction,
wounded-only, never-self predicate"*. This is **not authorable**: `HotParams`
carries no knob for it, `rejuvenation.json` says nothing about it, and unlike
damage/resist/dot the predicate is deliberately **not** routed through the
shared `eligibleByTargetFlags` seam. Heal and hot are the two bespoke cases.

Pinned by `TestApplyHotAura_SkipsFullHealthAlly`
(`sys/skills_behavior_test.go:1927`) — a behavioural lock, not an accident.

The design note that shipped it (`archive/plan-skill-vocab.md:613–619`) names
the consequence exactly:

> NOTE: while a target sits at full HP in range the wounded-only gate skips
> re-application, so its buff can begin counting down before it leaves —
> **accepted v1 behavior** (mirrors heal_aura's wounded-only cadence).

**⚑ Note the second-order effect that sentence is pointing at, which is easy to
miss and probably the worse half:** the gate blocks *re-application*, not just
first application. `ApplyHot` refreshes a stream's remaining duration on
re-apply (`skills/buffs.go:217–234`), so the aura tops its HoT up every tick
while the ally is wounded — but the moment the HoT heals them back to full,
topping up stops and the buff runs down **while they are still standing in the
aura**. It only resumes once they take a hit. So the aura is weakest at exactly
the point it succeeded.

### Why the inherited justification does not transfer

On `heal_aura` the gate earns its keep, twice over:

- **It would bill the caster for nothing.** Heal authors `selfDamageHP` 10−2/level
  (FINAL cost curve), paid per tick that heals someone. A tick spent on a
  full-HP target would cost the caster real HP for zero effect.
- **It would burn the only slot.** Heal authors `maxTargets: 1` +
  `selector: lowest_health` — one target per tick, so a wasted slot is a real
  loss.

**Rejuvenation authors neither.** No `selfDamageHP` (`applyHotAura` pays no
self-cost at all — "a build lever, authored in step 6", and step 6 never
authored one), no `maxTargets` (0 = uncapped, `sys/targeting.go:18`), no
`selector`. Every reason the predicate exists on the heal side is absent on the
hot side. It came along as a copy-paste.

### ⚑ The inconsistency that makes this hard to defend

The **sibling HoT applier has no such gate.** `applyInstantHot`
(`sys/skills.go:1019`, the `instant_hot` path used by **Recover**) selects via
`eligibleByTargetFlags` (`:1044`) — full-HP targets included. Same buff type,
same `ApplyHot` call, two different rules:

| | applier | wounded gate? | can pre-hot? |
|---|---|---|---|
| **Rejuvenation** (`hot_aura`) | `applyHotAura:822` | yes (`:846`) | **no** |
| **Recover** (`instant_hot`) | `applyInstantHot:1019` | no | **yes** |

A player who owns both sees the cooldown HoT land on a healthy ally and the
aura HoT refuse to — with nothing in either tooltip explaining the difference.

Adjacent, same function, worth stating alongside it: `hot_aura` **never targets
the caster** (`sys/skills.go:843`; parsing forces `TargetsSelf` false for the
type). Self-HoT is `instant_hot`'s job by design — that half is coherent and is
*not* what this item proposes changing.

### Blast radius: one skill, zero mobs

`grep '"type": "hot_aura"'` over `api/` returns **exactly one hit** —
`rejuvenation.json`. It is the only HoT aura in the game; no mob equips one
(`bandit-heal.json` is a `heal_aura`, its `_comment` merely records the
PO's 2026-07-18 "heal_aura over hot_aura" pick). Sole player source: OrcWarlord
kill-drop @ 0.25. So a behaviour change here touches **one player-facing skill
and no mob behaviour** — unusually cheap to try and to revert.

**No threat/XP exploit is created by lifting the gate.** `tickHotEvents`
(`sys/skills.go:332`) already guards `healed <= 0 → continue` *before* healer
threat, participation-XP crediting and combat entry. A HoT ticking on a
full-HP target is fully inert: it heals 0, credits nothing, and pulls nothing.
The safety property lives at the tick, not at the application — which is
precisely why the application gate is redundant rather than protective.

### ⚑ The call for the PO

Pre-hotting a tank before a pull is real, legible support gameplay, and the
"weakest at the moment it succeeded" refresh behaviour above reads as a bug in
play even though it is spec. Against that: the gate is *some* friction on a
support aura that currently costs nothing to run.

1. **Lift it for `hot_aura` only** — drop `HealthRatio() < 1` from
   `applyHotAura`, keep it on `applyHealAura`. Pre-hotting works, refresh keeps
   topping up in range, `instant_hot`/`hot_aura` stop disagreeing.
   ~1 line + flip `TestApplyHotAura_SkipsFullHealthAlly` into its inverse.
   **Recommended** — it is the option the evidence points at.
2. **Keep the gate, fix only the refresh half** — apply to wounded targets, but
   let an already-running stream keep refreshing while the target is in range.
   Preserves "must be hurt once to start", removes the perverse decay. Slightly
   more code (the predicate needs to know about existing streams).
3. **Make it authorable** — a `TargetsHealthy` (or `woundedOnly`) flag on
   `HotParams`, defaulting to today's behaviour. YAGNI says no with one
   `hot_aura` in the game, but it is the honest answer if the PO wants both
   shapes as a *build* distinction later.
4. **Keep as-is** — then the rule deserves to be visible in `SkillTooltip`,
   because nothing currently tells the player.

### ⚑ Ordering constraint against §25

`§25` *Cleanup layer* item 2 proposes extracting the duplicated predicate as a
shared `woundedAllyPredicate(e)` — a mechanical dedupe with no behaviour change.
**Decide this item first.** If the answer is option 1 or 2, heal and hot stop
sharing a rule and want *separate* predicates; doing the dedupe first would
cement the very coupling this item questions, and make the behavioural change a
re-split instead of a one-line delete. If the answer is option 4, the dedupe is
straightforwardly correct and should proceed.

**Effort:** option 1 is ~1 line + 1 test flip + a tooltip sanity-check, well
under an hour including in-game verification (stand next to a full-HP ally with
Rejuvenation on; the HoT should land, then keep refreshing). Options 2 and 3 are
larger but still small. **Not scheduled** — it is a design call first.

---

## 34. Entity-vs-entity collision — considered, **not** taken; soft separation chosen instead

**Origin:** PO question 2026-07-26 (`plan-playtest-feedback.md` §Intake round 6
item 3) — *"should players and mobs block movement, against players and against
each other? It would avoid mobs all piling into one place, making a giant death
circle."*

**✅ DECIDED the same session: implement mob-vs-mob *soft separation* — extend
`blockerRepulsion` to include nearby mobs at a low weight — and take neither
hard collision nor player↔player collision.** This item exists so the rejected
half is not re-litigated, and so the two engine landmines below are on record if
it ever is.

> **✅ The soft half SHIPPED 2026-07-26 as chunk B** (`8b045395`, ledger
> `plan-playtest-feedback.md` §Round-6 chunk B ledger, **PO-verified in-game
> 2026-07-26 — "feels much better"**, so the hard half stays closed). Two notes that bear on any re-opening of the hard half: ① the
> **welding landmine below has a steering-side twin that is far more common** —
> not co-located mobs but a mob directly *behind* another, whose push is
> collinear with travel and therefore erased by direction-only steering
> (fixed with a perpendicular fade); ② **a stopped mob does not steer at all**,
> so soft separation cannot thin a pack that has already settled on the aura
> ring. If the clump complaint survives the in-game check, that is the specific
> gap — and a tangential settle nudge is the cheaper answer than hard collision.

### What the code actually says (measured, don't re-derive)

- **Nothing dynamic collides with anything dynamic today.** Player body
  `Layer = Viewport|PlayerCollision`, `Mask = PlayerStatic|Border`
  (`model/player/player.go:44`); mob body `Layer = Viewport|ActionCollision`,
  `Mask = MobStatic|Border` (`model/mob/mob.go:101`). Bodies block only against
  **statics** — props, NPCs, the border wall.
- **The broadphase already pairs dynamic-vs-dynamic every tick**
  (`phy/space.go:100`, the inner `j := i+1` loop) — that is how auras, aggro
  sensors and viewports work — and circle-vs-circle push-out already exists and
  is exercised (`resolveCircleThomas`). So hard collision is a **mask edit**, not
  new machinery. The masks are not the hard part; the consequences are.
- ⭐ **There is no client-side collision and no client-side prediction.** The
  frontend has zero collision code and the local player renders from server
  snapshots (which is why `WARP` visibly crawls). A server-side movement change
  therefore has **no reconciliation or rubber-banding problem** — the single
  reason this is cheap here and expensive in most games.

### The decomposition — three independent toggles, three different answers

- **A. mob ↔ mob** — the one that targets the complaint. No griefing concern.
  ⚑ But `blockerRepulsion` queries `space.AppendCircleStatics`
  (`model/mob/steering.go:87`) — **statics only** — so mobs have no avoidance of
  each other and hard collision would turn a chasing pack into a shoving scrum at
  the stop-distance ring, possibly reading *worse* than the pile.
- **B. player ↔ mob** — makes body-blocking a real tank tool, and is the biggest
  rebalance: positioning *is* the only skill expression, so every authored radius
  shifts, and a wall of bodies makes LongRangeStrike **more** dominant (round-2
  already measured its 2.6–3.0 reach as *"effective immunity to every melee
  mob"*).
- **C. player ↔ player** — ⚑ **fights a stated pillar.** GDD §9: *"No griefing
  possible by design."* Player bodies that block create body-blocking exactly
  where the world design leans on chokepoints: the zone-1→2 tunnel (the tutorial
  beat), cave mouths, campfires, boss arenas. Rejected for v1 on that basis
  alone.

*(For reference, WoW is close to this same split — mobs block players, players do
not block each other: B yes, C no.)*

### ⚑ Two engine landmines, if hard collision is ever revisited

1. **Co-located equal-radius circles never separate.** `resolveCircleThomas`
   tie-breaks on `Signum32f(c.Radius - other.Radius)` and returns a **zero
   vector** when radii are equal and centers coincide. Two same-species mobs
   spawned on one point — summons, encounter waves — would weld together
   permanently. Needs a real tie-break *before* any hard collision ships.
2. **Push-out is instantaneous position correction — no mass, no damping.** Full
   overlap is resolved each tick, both sides, resolution running once per tick
   with no re-resolution. Chains of overlapping bodies can shove a player into a
   prop, corrected only next tick. Expect jitter at pile-ups; the render-delay
   interpolation (`RENDER_DELAY_TICKS=2`) smooths it visually but also makes the
   shove read mushy.

Performance is a **non-issue** — the pairs are already tested; only resolution
would be added.

### What would re-open this

**The PO's argument for the hard version is the strongest one on record and is
not refuted, only outweighed:** soft separation is a *direction blend, not a
constraint*, so it can be overwhelmed when many mobs converge on one point,
whereas hard collision guarantees a minimum spacing at any mob count. **If the
clump proves worst exactly when the pack is biggest, re-open A** (never C).

### What this does NOT fix — read before re-opening

Hard collision would **not** have solved the focus-fire half of the complaint.
Wolf body radius 0.3, Damage aura radius 1.0 ⇒ hit when center is within 1.3;
collision only guarantees centers ≥ 0.6 apart, and points at 0.6 minimum spacing
pack into a 1.3 disk as 1 + 6 + 12 ≈ **19**. Nineteen wolves still fit inside a
level-1 Damage aura with collision fully enforced. The focus-fire problem is a
**targeting** defect — `selectTargets` has no target persistence
(`sys/targeting.go:108`) — tracked separately at `plan-playtest-feedback.md`
§Intake round 6 item 4.

---

## 35. One value, many homes — the tuning-value duplication sweep

**WoW/Gothic fit: none (theme-neutral)** *(ranked 2026-07-29, PO-confirmed)*
> **⭐ TIERS 2–5 PLANNED IN FULL 2026-07-29 → `docs/archive/plan-conf-duplication.md`**
> (D1 shrink-to-deltas · D2 warn-at-boot on unknown keys, `_`-prefix exempt ·
> D3 per-item serve/generate for the frontend mirrors; chunks C1–C4). The
> planning survey found one **new landmine** — the Go defaulting layer is NOT
> total: `player.healthGainTick` and `player.walkingSpeedPerTick` have no
> fallback anywhere, so the shrink is unsafe until C1 closes that — and a
> **fifth tier-5 mirror** this entry missed: `Mobs.ts:48`'s `TierRank` table.
> This entry stays the findings record; the plan doc carries the ledgers.
>
> **✅ C1 SHIPPED 2026-07-29 `e7531444`** (plan §7): defaulting made
> total, env confs shrunk to deltas, all five tracked confs pinned to
> identical resolved tuning. Three findings beyond this entry's survey:
> absent `server.port` bound a random port (now defaults 2000, plain-HTTP
> only) · `server.path` was dead config everywhere it appeared · the default
> files' `mob.healthGainTick: 0.0066667` was a rounded restatement that split
> the fleet at float32 (production ran the true Go default; snapped to the
> exact decimal `0.006666667`). C2–C4 open.
>
> **✅ C2 SHIPPED 2026-07-29 `e7531444`** (plan §7): unknown conf keys now
> WARN at boot, path-qualified, `_`-exempt, warn-not-fail (D2) — plus a
> permanent test pinning all five tracked confs at zero unknown keys. The
> historical fixture (`c183ce12^`) carried **8** dead keys, not the 7 the
> hygiene ledger counted; and case-insensitive matches are accepted because
> `encoding/json` applies them.
>
> **✅ C3 + C4 SHIPPED 2026-07-30 (plan §7) — §35 IS COMPLETE, plan archived.**
> C3: the tier-3 Go literals (sim XP base/growth/margin/regen, the chase-margin
> pair, both `combatRegenGraceTicks`) pinned by tests against
> `conf.default.json` — mirrors stay deliberate, drift now goes red. C4:
> `spacedName()` deleted for the served `/mobs` `displayName`,
> `ActivationRejection` moved into `server.fbs` with pinned values (both
> binding sets regenerated as a zero diff; the Go model derives its constants
> from the generated enum, the client keys its messages by the generated
> names), and the new **`api/shared-constants.json`** pins the pip/ring/tier
> bit tables + viewport 20×12 + tickrate 30 via one Go test AND one vitest,
> exhaustive on the TS side. The client tier-frame table is now keyed by a
> named `TierRank` enum instead of position.
>
> **✅ TIER 1 FULLY DONE 2026-07-28** — `docs/archive/plan-pre-accounts-hygiene.md`
> (ledgers there, §11). **Row 1** closed by session 2 (`50a1e5c9`): both Go
> defaults now hold 0.2, and the sim's copy with them. ⚑ **The drift turned out
> to be latent, not active** — *no* battery scenario makes a mob approach
> (facetank spawns at `distance = 0`, kite pins the mob at `Speed = 0`, the 1v1
> and level sweeps start at `-distance 0.5`, inside `stopDistance` under either
> margin), so the whole battery came out byte-identical and TTK 6.67 s /
> TTD 8.70 s **stand**. It was one `-distance 3` away from being a real defect.
> ⚑ **Not unified across packages:** `gameconf.go:48` and `mob.go`'s new
> `defaultChaseIntoAuraMargin` are still two independent 0.2s naming each other
> in comments — collapsing them is **tier 3**, still open, and the obvious fix
> would drag config normalization into a model package.
>
> **Rows 2, 3, 4 done by session 1, committed `c183ce12`.** Row 2: the embedded
> default's `game` block hand-synced and pinned by a map-comparison **drift test**
> (mechanism 2 below, in its cheapest form — the `server` block is deliberately
> excluded, since `frontendDir` vs `path` is the one real per-environment delta).
> Row 3: both bare `33`s → `Constants.SERVER_TICKRATE`. Row 4: `heatFractionPerSecond`
> and `damageAuraRadiusMeters` deleted.
> - **⚑ Deviation, widened:** the sweep above says four `backend/` conf files;
>   there are **five tracked**, because `devops/conf.json` is the live server's
>   and carried the dead key too. It is **also drifted** — no `mob` or `combat`
>   block, so the live server runs on Go fallbacks for both. Not closed here.
> - **⚑ `cfg.ReadConfig` has no `DisallowUnknownFields`** — that is *why* row 2's
>   7 dead keys survived. Adding it would hard-fail every existing local **and
>   deployed** `conf.json` on the next start, so it needs a deploy plan, not a
>   hygiene chunk. Recorded in the plan doc §7.
> - **Tiers 2, 3 and 4 stay open.** The drift test is the pattern that would
>   close tier 2/3; scaling it up is its own chunk.

**Origin:** PO 2026-07-26, while retuning mob out-of-combat regen from ~2 s to
5 s. That one-number change touched **three conf files plus a Go constant**, and
the PO's response was the right one: *"doesn't seem good that we need to adjust
it at 4 places — make a list of all values that need to be changed in multiple
fields and tackle it as a code cleanup topic."*

**Status: ✅ COMPLETE 2026-07-30** (was: surveyed → planned) — the plan doc the
paragraph below anticipated is `docs/archive/plan-conf-duplication.md`, see the
banner above. Nothing here blocks anything else.
The regen retune itself is **not** part of this item — it shipped separately
(rate `1/(5·TicksPerSecond)` + a fractional carry mirroring the player's).

⚑ **Read the tier-1 rows first: four of them are already-drifted values, i.e.
live defects rather than tidiness.** Duplication that has not yet drifted is a
risk; duplication that has is a bug, and this sweep found both.

### The finding that reframes it: there are FIVE config files, not four

`backend/conf.default.json`, `conf.json` (gitignored), `conf.local-windows.json`,
`conf.docker.json` — **and `backend/cmd/aurad/conf.default.json`**, which is
`go:embed`ed (`cmd/aurad/loaders.go:99`) and **written out as `./conf.json` on
first boot when no config exists** (`setupDefaultConfig`, `loaders.go:239`). It
is the file a fresh machine or a fresh deploy actually runs on, and it is the
most out-of-date of the five (tier 1 row 2).

Nothing merges, overlays or cross-checks any of them: each is a full standalone
snapshot, and `cfg.ReadConfig` + per-field Go defaults quietly fill whatever a
given file omits. **That per-field defaulting is also the way out** — an absent
key already resolves to a single Go source of truth, which `conf.docker.json`
demonstrates by omitting the whole `mob` block and inheriting the new 5 s regen
for free.

### Tier 1 — already drifted (defects)

| # | Where | Finding |
|---|---|---|
| 1 ✅ | `pkg/aura/sim/world.go:75` | `MobChaseIntoAuraMargin: 0.05, // conf.default.json value` — `conf.default.json` says **0.2**. The comment asserts a mirror that is **4× off**, inside the balancing harness that authored content numbers are derived from. A wrong harness number gets baked into content and stays there. **Sharpened in planning:** not a stale comment but *two Go defaults for one value that disagree* — the live path always normalizes to 0.2 (`gameconf.go:48`), so `mob.go:305`'s 0.05 was a **test-only** default the harness copied. **Closed 2026-07-28; it never reached content** — see the banner above. |
| 2 | `cmd/aurad/conf.default.json` | Stale vs `backend/conf.default.json`: **7 dead keys** (`damageAuraRadius`, `damageAuraDamageFraction`, `damageAuraLevelGainFraction`, `healAuraRadius`, `healAuraHealTickFraction`, `healAuraLevelGainFraction`, `healAuraSelfDamageTickFraction` — none exist in `cfg.Config` any more, so they are silently ignored), and **missing** `zone`, `totalDayCycleSeconds`, `dayTimeSeconds`, `baseHealth`, `skillPointsPerLevel`, `critChance`, plus the entire `mob` and `combat` blocks. |
| 3 | `HUD.ts:138`, `HUD.ts:638` | Ticks→seconds via a bare `33`, twice, while `BasicConfig.SERVER_TICKRATE` exists as `1000/30`. ⚑ `BasicConfig.ts:128` **documents the rounded 33 as a past bug** ("made the reactive lerp finish ~0.333 ms early every tick"), so two live call sites use the value the codebase already recorded as wrong. Effect is cosmetic (a cooldown label). |
| 4 | vestiges | `heatFractionPerSecond` is authored in **all four** `backend/` conf files and read by **nothing** (the heater system went with step 7). `Graphics.ts:26` `damageAuraRadiusMeters: 1` likewise — both `mob.go:475` and `Mobs.ts:230` state it was retired by the served `aura_radius`. (Possible overlap with §30's vestige list.) |

### Tier 2 — 17 of 20 conf keys are identical restatements

Across the four `backend/` files (the embedded fifth adds its own copies on top):

- **11 keys in all four**, byte-identical: `totalDayCycleSeconds`,
  `dayTimeSeconds`, `heatFractionPerSecond` (dead), `player.healthGainTick`,
  `player.walkingSpeedPerTick`, `player.levelGrowth`, `player.maxLevel`,
  `player.levelUpXPBase`, `player.levelUpXPGrowthFactor`,
  `player.skillPointsPerLevel`, `player.critChance`
- **3 keys in three**: `mob.healthGainTick`, `combat.defaultCritFactor`,
  `combat.healerThreatFactor`
- **3 keys in two**: `zone`, `server.frontendDir`, `server.path`
- **Only `server.port` genuinely deviates** anywhere (docker `80`).
- The inverse inconsistency also exists: `player.baseHealth` and
  `mobChaseIntoAuraMargin` are authored in **one** file and rely on Go defaults
  in the other four.

So of ~20 knobs, exactly one carries a real per-environment difference. The rest
is restatement — and restatement of values that already have a Go home.

### Tier 3 — Go constants restating conf values, kept in sync by discipline

- `sim.DefaultRegenTick = 0.00033` (`sim/scenario.go:205`) — its own comment says
  it "mirrors conf.default.json's healthGainTick"
- `sim/world.go` hardcodes `LevelUpXPBase: 300` and
  `LevelUpXPGrowthFactor: 1.2`, plus `Bounds{60, 40}` [PLACEHOLDER arena]
- `core/gameconf.go:38` `BaseHealth = 100` ↔ `conf.default.json`'s `baseHealth: 100`
- `cfg.ReadConfig` defaults `600`/`400`, `critChance 0.05` and the level curve —
  all also restated in the conf files
- `player.combatRegenGraceTicks = 100` **and** `mob.combatRegenGraceTicks = 100`
  — two separate consts holding one number, a deliberate §31 vocabulary mirror
  maintained by hand
- `mob.defaultMobHealthGainTick` ↔ `game.mob.healthGainTick` — the row that
  started this. Now explicitly documented as the source of truth (the conf blocks
  restate it, and deleting the key resolves back to it), which is the cheapest
  version of the fix and a candidate pattern for the rest.

### Tier 4 — cross-language (backend ↔ frontend), hand-synced

- `BasicConfig.VIEWPORT` `20`/`12` ↔ `constant.ViewPortWidth/Height` — at least
  honestly labelled *"SYNCED WITH BACKEND (backend/pkg/aura/model/constant/const.go:5)"*
- `INPUT_TICKRATE` / `SERVER_TICKRATE` `1000/30` ↔ `constant.TicksPerSecond = 30`
- ⭐ **The counter-example to copy:** the level curve is **served**, not
  duplicated — `Skills.ts:195` reads `payload.curve` off the catalog, so
  growth × maxLevel exists once. Anything the client needs *can* ride the wire.

### Tier 5 — wire enums + client label tables (added 2026-07-29)

**This tier is the gap this entry's own Scope notes declared** (*"it did not
audit … the wire enums"*). Surfaced while shipping the faction-scope tooltip
line (`2fffe9ee`), which is itself **mechanism 3 applied**: the skill catalog now
serves resolved faction display NAMES because the bitmask it already served is
undecodable client-side. Same shape as tier 4, different subject — these
duplicate an **enum or a rule**, not a tuning value.

Ordered by how quietly they fail:

1. **⚑ `ActivationRejectionMessages` (`Skills.ts:265`)** — a map keyed by **bare
   numbers** (`1: 'No campfire bound'`, `2: 'No valid target'`) hand-synced with
   Go's `model.ActivationRejection` `iota`. **No generated binding, no test**
   (the vitest suite is 5 files and `Skills.ts` is not one). Renumber the Go enum
   and the client shows the wrong message with nothing failing. ⭐ **The irony
   worth recording:** `tdd.md` §8 already celebrates that *"the frontend
   `Skills.ts` id→name/maxLevel/category hand-sync maps are gone"* — killed by the
   `/skills` catalog. This map lives in **that same file** and survived.
   ⚑ Arms immediately if backlog §38's level-gated charm is built: it needs two
   new reasons.
2. **`AppliedEffectBit` + `PIP_STYLES` (`EffectPips.ts`)** ↔
   `skills/applied_effects.go`. Honestly labelled *SYNCED WITH BACKEND*. Go's
   side is compile-enforced exhaustive (`buffPayload.appliedBit`); the client's
   is not — `AppliedEffectCharm = 1 << 6` was hand-added in chunk 3.
3. **`AURA_CATEGORY_COLORS` / the category bits (`AuraRings.ts`)** ↔
   `skills/aura_category.go`. Same shape; Go's table is guarded by an
   exhaustiveness test, the mirror is not.
4. **`spacedName()` (`SkillTooltip.ts:150`)** — a client-side reimplementation of
   the server's CamelCase `DeriveDisplayName`, applied to summoned mob names —
   while `/mobs` **already serves `displayName`** for every species. A duplicated
   *rule* rather than a value, and exactly the drift `DeriveDisplayName`'s own
   comment warns about (*"two copies of a naming convention are exactly the kind
   of knowledge that drifts apart"*). The cheapest of these to close.

**Mechanism 3 kills 1 and 4 outright** (serve the string, drop the mirror). 2 and
3 are genuinely per-frame render data where a lookup table is the right shape —
for those the fix is a **drift test** (mechanism 2) or generated bindings, not
serving.

### Three mechanisms a plan would choose between

1. **Overlay loading** kills tier 2: read `conf.default.json` first, then
   unmarshal the environment file over the same struct — `json.Unmarshal` leaves
   absent fields untouched, so it merges for free (~5 lines). The environment
   files shrink to their real deltas. Cost: `conf.default.json` becomes a
   required runtime file, and it interacts with the existing "non-positive
   restores the default" normalization.
2. **One source per value, plus a drift test** kills tier 3: pick Go-const or
   conf as authoritative per value, and add a test asserting `conf.default.json`
   equals the Go defaults. Divergence becomes a red test instead of a stale
   comment (which is exactly how tier-1 rows 1 and 2 survived).
3. **Serve it, like the curve** kills tier 4: send the value in the
   catalog/`Welcome` payload instead of hand-syncing a TS constant.

None of the three requires the others; they address disjoint tiers.

### Scope notes

- ⚑ **Do not double-book the mob-speed row.** `plan-entity-model.md` Chunk 1a
  already owns `game.mob.walkingSpeedPerTick` and the `0.055` (`mob.go:232`) vs
  player `0.05` pair, including the landmine that a naive convergence makes every
  mob 9 % slower.
- **This sweep was targeted, so the list is a floor, not a ceiling.** It covered
  the conf files, Go tuning constants/defaults, the sim harness and frontend
  constants. It did **not** audit content JSON ↔ Go (tier ranks, faction bits,
  skill enums), the wire enums, or the docs.
  - ⚑ **Partly closed 2026-07-29: the wire enums are now tier 5 above.** Content
    JSON ↔ Go and the docs remain unaudited.

---

## 36. Three character slots, three bloodlines — sacrifice unlocks scoped per slot

**WoW/Gothic fit: medium** *(ranked 2026-07-29, PO-confirmed)*
**Origin:** PO idea 2026-07-29. *"For accounts: 3 character slots. Each slot has
its own 'bloodline', and sacrifice as a feature unlocks abilities only for this
bloodline. So 3 character slots, 3 bloodlines."*

**The shape:** an account holds **3 character slots**. Each slot carries a
persistent **bloodline** that outlives the characters played in it. Sacrificing
a max-level character grants its reward to **that slot's bloodline only** — not
to the account. Over time each slot accumulates a different catalog of unlocked
base auras / start options, so the three slots become three distinct lineages
rather than three interchangeable saves.

**What it changes in the GDD:** §5 (Meta-Progression: Character Sacrifice)
currently says the reward is **account-wide** — *"New characters benefit from
all previous sacrifices."* This idea replaces one word (`account-wide` →
`bloodline-wide`) and that word is load-bearing for the rest of the section.
**Not edited in the GDD** — the section is written as decided design, and this
is an amendment awaiting a design pass.

**Why it is interesting:**

- It gives an alt a **reason to exist beyond a different race**. Today the
  restart-loop variety comes from per-race starts (§12) and secret recipes; a
  bloodline makes the *slot itself* an identity that accrues history.
- It makes the memorial (§5) personal per lineage — a slot's monument entries
  are its own ancestors, not the account's undifferentiated pile.
- It multiplies the reward catalog's reach without adding rewards: the same
  curated catalog read three times over produces three different characters.

**⚑ The main risk — it is a per-slot grind multiplier, and §5's Hologrind rule
is the thing to test it against.** The verbatim design rule is *"Does a player
who never sacrifices feel weaker in the endgame? If yes, the reward is
miscalibrated."* Bloodline-scoping does not break that rule directly (rewards
are still breadth, never power), but it does mean a player who wants reward X
available on slot 2 must level **and sacrifice on slot 2**. Account-wide made
one sacrifice pay off everywhere; bloodline-wide makes it pay off in one third
of the account. Whether that reads as *depth* or as *chores* is the design call.

**⚑ Open questions:**

- Is a bloodline **chosen** (pick a lineage when you first use the slot) or is
  it simply *"whatever slot 2 has accumulated"* — an emergent identity with no
  authored content behind it? These are very different features: the first is
  content (named houses, flavor, maybe starting bonuses), the second is
  bookkeeping.
- Can a bloodline be **reset / re-rolled**? A slot whose accumulated unlocks the
  player regrets is a dead slot out of three.
- Does the bloodline survive an empty slot (character deleted, not sacrificed)?
- Why **3**? [PLACEHOLDER] — the number is the least interesting part, but it
  interacts with the "living starting zone" goal: more slots = more restarts.
- Does it interact with §12 (races)? Races are already a sanctioned sacrifice
  reward ("new start options"). If a bloodline *is* effectively a race lineage,
  these two ideas want merging before either is scoped.

**⚑ Persistence finding — this adds a THIRD persistence scope, and step 8 is
where that gets cheap or expensive.** `plan-entity-model.md` ruling 4 fixed the
schema's scope as *only live players persist* — mobs and NPCs always respawn
from definitions. Slots + bloodlines add state that is neither a live player nor
a definition: **account-scoped state that outlives every character written into
it**. That is not hard, but it is a shape step 8 should know about before the
character record is designed, because it means the top-level record is an
**account**, not a character, from the first migration. Recording it here rather
than pretending it is free later.

**Not scheduled — but it is a step-8 input, not an independent feature.** Raise
it in the accounts & persistence design session alongside §32 (does a charge
survive death?). Both are "what is the persistence scope of X" questions and
they want answering together.

---

## 37. Aura augmentation — auras gain effects instead of combining into new ones

**WoW/Gothic fit: medium** *(ranked 2026-07-29, PO-confirmed)*
> **⚑ 2026-07-29 — this is now coupled to the skill-level-cap ruling.** Asked in
> the open-questions sweep what the raised caps should be (the blocker on
> `plan-playtest-feedback.md` Pass 1a), the PO answered that the **skill level
> system itself needs reworking to a degree**, that caps will be **uneven,
> per-skill**, and that the rework *"might also get the augmentation concept —
> i.e. a damage aura gains either the slow or the heal effect at level 10, per
> player choice."* So this entry is no longer a free-standing alternative to
> recipes: it is a candidate half of the skill-progression rework, and the
> per-skill cap is the thing that would author *where* the augment choice sits.
> Still unscheduled and still needing the design pass below.

**Origin:** PO idea 2026-07-29. *"Alternative to the current aura recipe
unlocks. Players can augment an aura and add certain effects to it through some
mechanism, i.e. leveling. For example, after X levels, make the decision to add
either a slow or a heal to your damage aura — it is now augmented with that
effect. Other auras follow the same mechanism to an extent: they can, through a
process, gain additional effect types."*

**The shape:** instead of *skill A at level x + skill B at level y → discover
skill C*, a skill you already own **grows a new effect**. At an authored
threshold the player picks one augment from a small offered set (slow ⊕ heal),
and their damage aura now carries that effect too. Repeatable across auras, and
in principle across categories.

**⭐ The structural finding — this is the first thing in the game that makes a
skill's EFFECT LIST per-character.** Today the split is absolute:

- `SkillDefinition.Effects []EffectDef` (`skills/definition.go:672`) is the
  **shared, global** effect list, held by pointer — the same `*SkillDefinition`
  is used by every player who owns the skill **and by every mob that equips it**.
- Per-character skill state is exactly **one integer**: `Spellbook map[SkillID]int`
  (`skills/component.go:96`) and `EquippedSkill.Level`. Everything else — radius,
  damage, tick interval, target selector — is `Scaled(base, perLevel, level)` off
  the shared definition.
- A recipe's `Result` is a whole **separate authored `SkillDefinition`**
  (`skills/recipe.go`), which is why combinations cost the engine nothing: they
  swap which global definition you point at.

So the two implementation shapes are genuinely different features, and picking
between them is the whole design decision:

**(a) Augmentation as a recipe result — zero engine change.** `DamageAura_Slowing`
is just another authored def; "choosing an augment" swaps the spellbook entry.
Free today. Cost is **combinatorial content**: n auras × m augments authored by
hand, and it multiplies again the moment augments stack (two augments on one
aura = n × m² defs). Practical only if augments never stack and the offered sets
stay tiny.

**(b) Augmentation as per-character state — linear content, engine-new.** The
spellbook value becomes `{level, augments []AugmentID}`, and the effect list is
**composed at equip time** rather than read from the definition. Content stays
linear (one augment authored once, applies to any aura), but it touches the
equip path, the derived-stat recompute, the wire and the client.

**⚑ Under shape (b), the client would not know.** `frontend/src/client-data/Skills.ts`
fetches the skill catalog **by definition**, so tooltips, aura-ring radius and
effect pips all render from the global def. A player's augmented aura would look,
read and tooltip **exactly like an unaugmented one**. This is the same class of
gap as `plan-faction-flips.md` L-C (charm is invisible to the client) and the
`Mob.radius`-in-the-schema-but-never-written gap that 3a's NPC pilot found — a
feature that works server-side and is undetectable in the picture. Shape (a) has
this for free, which is a real point in its favour.

**⚑ Under shape (b), mobs share the definitions too.** `SkillComponent` is the
same type for both (`Spellbook` is nil for mobs, which is how `Discover` no-ops).
Augments would need to be explicitly player-only, or mobs need an augment source
— and "an augmented elite" is a tempting content lever, so decide it rather than
inherit it.

**⚑ It trades DISCOVERY for BUILD EXPRESSION — that is the actual design
question, not the mechanism.** The GDD is explicit that combination recipes are
**curated, secret, and never documented in-game**; the community discovers and
shares them. Augmentation-by-leveling is the opposite by construction: an
explicit, presented, in-UI choice at a known level. That is not worse — a
visible fork ("slow or heal?") is a real build decision the current system does
not offer, and it is legible to a new player in a way secret recipes are not —
but it is a **different pillar**. ⚑ Is augmentation a **replacement** for
recipes (the PO's word was "alternative") or a **second track** alongside them?
Recipes are shipped and live (`api/recipes/`, 10 loaded); replacing them is a
content deletion, not just a new system.

**⚑ It would be the first PERMANENT character decision — and that collides with
free respec.** Skill points are fully refundable today: `LowerSkillLevel`
(`skills/component.go:478`) is a free respec down to discovery level. If augment
choices are reversible, the fork is a menu, not a decision, and most of the
appeal evaporates. If they are permanent, augmentation becomes the first thing a
player can get *wrong* — which is exactly what §5's restart loop wants (*"each
run can be built differently"*), and it is the strongest link between this idea
and **§36**: permanent augment choices are what would make a second character in
a second bloodline feel like a different character rather than the same one
again.

**Not scheduled.** Needs a design pass, and the (a)-vs-(b) call should be made
before anything is authored — they diverge immediately and shape (a) is not a
stepping stone to shape (b).

---

## 38. One species, many levels — a per-SPAWN level override

**WoW/Gothic fit: low** *(ranked 2026-07-29, PO-confirmed)* — demoted from the
top tier in the ranking session: per-species leveling already covers the WoW
pattern (a named mob type owns a narrow band; different levels get different
names), so what remains here is authoring convenience, not a genre gap.
**Origin:** PO ask 2026-07-29, immediately after the charm level-gate question
(§ the `plan-faction-flips.md` chunk-3 session). *"I want to be able to author a
single mob in all levels — so be able to spawn the same wolf on level 1 and
level 30, for example."*

### Is it possible today? **No.**

A mob's level is authored **per species**, once, as
`MobDefinition.CurveLevel` (`items/mobs/definitions.go:176` — *"the mob's
hand-picked position on the f(L) curve; zone number = curve position, GDD §5"*).
`world.Spawn` (`world/zone.go:65`) carries position, angle, respawn timing,
wander radius, waypoints, patrol mode and idle speed — **no level** — and
`MobSystem.spawnAt` never sets one. `Mob.Level()` is therefore
`owner ?? definition.CurveLevel`, and every Wolf in the world stands at the same
level no matter where it is placed.

The only way to get a level-30 wolf today is to author a **second definition**
that happens to be called something else — which is what the wolf family already
is (`Wolf` cL2 → `AlphaWolf` → `EliteWolf` → `DireWolf`), except those also differ
in tier, stats and loadout. There is no way to reuse one definition at two
levels.

### ⭐ The good news: entity-model chunk 1b already did the hard half

This idea would have been expensive before 2026-07-26 and is now mostly free,
because **the pool and the output are already derived live from `Level()`**:

- `factors.baseMaxHealth` is authored **at the baseline** (f = 1), NOT at the
  species' curve level — the doc comment on `Factors` says so explicitly — and
  `Mob.MaxHealth()` is `baseMaxHealth × PowerScale() × MaxHealthFactor()`.
- `PowerScale()` is `definition.Curve.F(Level())`, evaluated **at the mob's
  current level**, and `casterPowerScale` routes every HP-valued skill output
  through it.

So a per-instance level would scale **HP and damage automatically, with no
re-authoring and no number moving for existing content** (an absent override
inherits `CurveLevel`, exactly as today). That is the whole reason this is worth
writing down as a small change rather than a system.

### What it needs

1. **`world.Spawn.level`** (`level` in the zone JSON) + loader validation
   (1 … `maxLevel` 30). Absent → inherit `def.CurveLevel`. The tri-state
   `wanderRadius` / `idleSpeedFactor` already establish the "absent = inherit the
   species default" pattern, including its `*float32`-style encoding.
2. **`spawnPoint.level`** in `MobSystem` — a respawn must reproduce the same
   level, not fall back to the species value.
3. **A per-instance level on `Mob`**, with the precedence
   **`owner ?? spawn override ?? definition.CurveLevel`**. ⚑ The override must sit
   **after** `owner`: entity-model chunk 1b makes a summon stand at its owner's
   level *live*, and `plan-faction-flips.md` L-B/L-M pin that a charmed mob keeps
   its own — putting the override first would quietly re-open both.
4. **⚑ A wire field and a client change — the biggest single cost, and easy to
   miss.** The nameplate renders `"<displayName> <curveLevel>"` from the
   **catalog** (`Mobs.ts:167`), i.e. per species and static, and the
   nameplate **tint** (how far the mob's level sits from the player's) reads the
   same number. With per-spawn levels **every nameplate and every tint would be
   wrong**. So `Mob.level` has to go on the wire (`server.fbs`, appended at the
   table end like `max_health`), both binding sets regenerated, and `Mobs.ts`
   switched to the wire value.
5. **Zone editor** — a level field on the spawn tool (`ZoneModel.ts` spawn record
   + the panel), or the PO authors `level` by hand in the zone JSON.

### ⚑ What does NOT scale with level — where the real questions are

Everything above is mechanical. These are not:

- **XP reward.** `factors.experience` is a flat per-species number, so a
  level-30 Wolf would grant a level-1 Wolf's XP. That directly breaks the
  standing **Session-⑥ XP band rule** (facetank kills-per-hour, else kite ×0.5),
  which is a CLAUDE.md standing lock. Either XP is derived from level (a formula
  nobody has designed) or it is authored per spawn alongside the level.
- **Drops and unlock tables.** Authored per species. Is a level-30 Wolf still
  dropping the level-1 aura correct (the aura is the species' identity) or wrong
  (rewards should track difficulty)?
- **Skill loadout levels are a SEPARATE axis.** A mob's skills carry their own
  authored `MobSkill.Level`. HP-valued output rides `PowerScale`, so it scales —
  but **CC parameters do not**: slow fraction and duration, radii, tick rates and
  target counts ride the *skill* level only. A level-30 Wolf would therefore hit
  ~an order of magnitude harder while slowing you for exactly as long as a
  level-1 one. Probably wrong, and not obviously the same fix.
- **Tier** (`normal`/`elite`/`boss`) stays per species — it is a classification,
  not a stat, and the client's tier frame reads it. A level-30 *normal* Wolf is
  coherent; whether it should look different from a level-1 one is a visual call.
- **Flat per-species and presumably intended to stay:** resistances, speed, aggro
  radius, body radius.

### Open questions

1. **Absolute level or offset?** `level: 30` is explicit and readable in the JSON;
   `levelOffset: +5` (relative to the species' `curveLevel`) survives a rebalance
   of the species without touching every spawn. A per-**zone** band (*"every mob
   in this zone stands at the zone's level"*) is a third shape and would match
   GDD §5's *"zone number = curve position"* more literally than either.
2. **Does XP have to move with it?** See above — this is the one that decides
   whether the idea is a small change or a balance project.
3. **What happens to the CC axis?** Leave skill levels flat (a strong-but-slow
   scaler), scale them with the mob level, or author them per spawn too.
4. **Should the sim harness see it?** `sim/world.go` builds inline definitions and
   the explorer's roster is species-keyed, so per-spawn levels are **invisible to
   the balancing harness** — a level-30 Wolf could not be balanced there without
   new plumbing. That may be acceptable (the harness balances *species*, and this
   feature is about placement) or may be the thing that makes the feature safe.
5. **Is this a replacement for the wolf family or an addition?** If a Wolf can be
   authored at any level, `AlphaWolf`/`EliteWolf`/`DireWolf` become a question:
   are they levels of one species, or genuinely different creatures with their own
   art, tier and loadout? Answering "levels" would shrink the mob roster
   noticeably; answering "creatures" keeps it and this feature is purely additive.

### Why it is worth doing

It is the lever that makes several existing things work properly:

- **Level-gated charm** (the question that produced this entry) is currently
  meaningless as a *placement* tool: a mob's level is constant world-wide, so
  *"this species is out of your band"* is a fact about the species, not about
  where you met it.
- **Zone difficulty becomes authorable without new content.** A second zone can
  reuse the whole zone-1 bestiary at a higher level instead of needing new
  definitions, which is exactly the v1 scope pressure (2–3 zones).
- **It fits the direction the entity model already took:** levels became dynamic
  per actor in chunk 1b, and this is the same idea applied to placement rather
  than ownership.

**Not scheduled.** Requirements 1–3 are perhaps half a session; requirement 4
(the wire + nameplate) is the real cost and should be bundled with any other
schema regen; the open questions — especially XP — need a PO design pass first.

---

## 39. Entity presentation rework — one frame that says what is happening to an actor

**WoW/Gothic fit: low** *(ranked 2026-07-29, PO-confirmed)*
**Origin:** PO ruling 2026-07-29, in the open-questions sweep. Raised by
`plan-faction-flips.md` §8 question 3 (*does the charm pip show duration?*) and
deliberately answered **wider than the question asked**: *"we will need a full
design of mob and player frontend presentation that includes information like
currently active buffs, debuffs, durations, allegiance, faction, cast bars etc.
So for now, the pip can stay, but this will need a full and comprehensive
rework."*

**What the pip question exposed.** A calmed or charmed wolf currently shows **a
dot, and nothing else**. `AppliedEffect*` bits ride the wire and `EffectPips`
draws one coloured mark per bit — which is enough to answer *"something is on
this mob"* and nothing else. With a 59.4 s charm, *time remaining* is the single
most useful fact about the mob and there is nowhere to put it. Bolting a
countdown onto the pip would be the third overlay invented per-feature, after
the nameplate/tier frame and the health bar.

**Scope named by the PO** — one design pass covering, for both mobs and the
player:

- active **buffs and debuffs**, with **durations** (the charm/calm case)
- **allegiance** — is this thing on my side right now? (charm made this a
  runtime property, not a species fact)
- **faction** — the skill tooltip already names factions since `2fffe9ee`; the
  entity itself does not
- **cast bars** — nothing in the engine has one today
- and by implication the existing overlays it would absorb: nameplate, tier
  frame, health bar, aura rings, the interact badge, the effect pips

**⚑ Why it is a design pass and not a UI ticket:**

1. **Most of this is not on the wire.** Effect *bits* are; remaining ticks,
   stack counts, the source of an effect and cast progress are not. The
   schema cost is the real cost, and it wants doing **once**, bundled — the same
   argument §38 makes for the per-spawn level field.
2. **The overlays grew one per feature.** `AuraRings`, `EffectPips`,
   `AuraTickIndicator`, `InteractBadge`, the nameplate and the health bar are
   six independently-anchored things over one sprite; R4 already found that the
   interact badge's anchor breaks the moment a conversant carries an aura
   (`plan-entity-model.md` §10b). A frame is the thing that makes anchoring one
   decision instead of six.
3. **It is the natural consumer of the Actor model.** Role and capabilities are
   authored now; the presentation layer still infers what to draw from whichever
   fields happen to be non-zero — the same defect the entity model fixed on the
   server side.

**Not scheduled**, and deliberately not sized here. Sequencing note: it wants to
come **after** the persistence/step-8 stretch (it touches the wire, and step 8's
schema work is the other thing that does), and it **supersedes** rather than
extends D13's pip — do not invest further in per-effect overlay art before it.

## 40. Wanted effect-type archetypes — the WoW-Classic gap review, PO-ruled

**WoW/Gothic fit: high** *(ranked 2026-07-29, PO-confirmed)*
**Origin:** PO session 2026-07-29. The 25 shipped effect types were compared
against WoW Classic's archetype vocabulary; the PO ruled on every gap in one
pass. Six archetypes are **wanted** (rulings below), one is **rejected**, and
one supposed gap turned out not to exist. Everything here is validated against
HEAD (`a29fe986`); nothing is scheduled or sized as a chunk yet.

**The non-gap, for the record: lifesteal already exists.** `lifestealFraction`
rides the shared damage payload (`damage_aura` + `instant_damage` both build
`DamageParams`), applied post-mitigation with overkill excluded via
`model.ApplyLifesteal` (`model/healable.go:26`), and an owned summon leeches for
itself. Live content: `reaper.json` (player), `spider-bite.json`,
`elite-wolf-bite.json`. A drain-life build is authorable **today** with zero
engine work.

### The two cross-cutting facts, before the per-item list

1. **⚑ The pip budget is spent.** Four of the six wanted items (stun, immunity,
   thorns-granting aura, ally-buff aura) put a **new kind into the closed
   `buffPayload` union** (`skills/buffs.go:44`), and the union compile-forces a
   pip decision (`appliedBit()`) — but **bit 7 of the `applied_effects` ubyte
   was the LAST bit** (taken by `speed_burst`, `applied_effects.go`). Every new
   buff kind must either take `AppliedEffectNone` as a deliberate stopgap (the
   shield precedent — legitimate where another wire signal already shows the
   state) or wait for the **§39 wire widening**, which replaces presence-bits
   with durations anyway. §39 is therefore the natural gate in front of this
   whole section's presentation half; the *server mechanics* of each item are
   not blocked.
2. **Three items want the same new lever: "this actor cannot act."** Stun
   (suppress everything), immunity variant (a) (suppress own attacks), and
   invisibility-on-mobs (a hidden mob does not attack) all need the aura tick
   loop (`sys/skills.go:192`) and/or the cooldown path (`processCooldowns`) to
   check a suppression predicate on the actor. Today **nothing suppresses a
   live actor's own effects** — calm is the nearest neighbour and it only
   drops *incoming* aggro. Build the predicate once (a `Buffs`-derived check,
   the calm/charm pattern) and all three items consume it.

### The rulings, validated

1. **Hard CC — stun, wanted.** A cooldown that stuns all enemies in range, with
   an optional per-mob **stun resistance** authorable on bosses/elites/anything.
   *Validation:* the movement half is nearly free — `Buffs.MovementFactor()`
   is the single composition point both movement sites read (Swift session), so
   a stun payload flooring it to 0 stops movement without touching either
   reader. The action half is the shared suppression lever above. New buff
   kind ⇒ pip fact applies. **Stun resistance needs a new authoring knob**:
   `factors.resistances` is keyed by *damage tags* and a stun carries none —
   either a dedicated `stunResistance` factor on `MobDefinition` or a reserved
   non-damage tag in the existing map (decide at design time; the latter risks
   colliding with the gated-damage machinery reading the same map). ⚑ L-O
   applies in full: an enemy-targeted control effect **must** join
   `factionScopedEffects` (`definition.go:952`, today calm + charm only) so the
   allowlist is mandatory. Under no-PvP, "all enemies" is mobs-only for free
   (players share `FactionAligned`), so GDD §9 holds without extra code.
2. **Dispel/purge — wanted, and priced per removal.** Works with auras,
   cooldowns or passives; first build: an **aura that removes one debuff on an
   ally in range per tick and costs resources per removed debuff**.
   *Validation:* `Buffs.Cleanse()` exists but is all-or-nothing (F10,
   `plan-effect-foundations`: "everything cleansable, no dispel classes in
   v1" — this item is the planned successor F10 anticipated). Needed: a
   harmful/helpful classification (derivable per payload type — dot/slow
   harmful; resist/speed/tickRate/shield/hot helpful; calm/charm decide at
   design time), a selective-removal API beside `Cleanse()`, and a new ally-
   targeted aura effect type (`applyResistAura` is the per-tick ally-buff
   template). ⚑ **Cost-per-removed-debuff is a new cost shape**: today's only
   cost is `selfDamageHP`, fixed per fire; this one is priced by *outcome*.
   Sequence it behind **Pass 1a.2** (the cost generalization) or it will
   invent a second cost seam — and it inherits 1a.2's four heal-cost rules
   (never-kill clamp · powerScale ride · mobs pay nothing · GOD skips).
3. **Immunity — wanted, as two cooldowns.** (a) immunity that stops all your
   own attacks (Divine Shield-shaped… inverted: protection at the price of
   output), (b) immunity that stops all your movement (Ice Block-shaped).
   *Validation:* **cheapest item in the list — both gates already exist.**
   Mob-side, `SetInvulnerable` (encounter chunk 9b) has fully defined
   non-event semantics including the accepted v1 leaks
   (`manual-content-authoring.md` §Immunity); player-side, `takeDamage`'s
   `IsGod()` short-circuit sits at exactly the right pipeline position to
   template a buff-driven gate. Variant (a) consumes the shared suppression
   lever; variant (b) reuses the MovementFactor floor. New buff kind ⇒ pip
   fact — though immunity may legitimately take `AppliedEffectNone` short-term
   since the caster's own HUD shows the cooldown active.
4. **Ally offensive buffs — wanted in all three categories, one proof-of-concept
   each.** *Validation:* the receiving side is one new buff payload (e.g. a
   damage-dealt factor) plus **one new composition point**:
   `casterDamageFactor` (`sys/skills.go:641`) today reads `Derived` (passives)
   only and must additionally read the caster's buff store — mirror the
   `MovementFactor()` lesson, ONE accessor, both-multiply semantics decided
   there. Aura leg: `applyResistAura` is the exact template. Cooldown leg:
   ally-targeted instants exist (`instant_shield`/`instant_hot`) — a sibling,
   not new machinery. ⚑ **The passive leg is the odd one out**: passives have
   no radius and no tick (the only ally-reaching passive today is `light_aura`,
   which is snapshot-read geometry, not an applied effect). Either passives
   enter a tick path (new machinery, weigh against KISS) or the PoC passive is
   defined radius-free (e.g. buffs the owner's summons via ownership) — open
   design question for the session that picks this up. Note a *self* damage
   passive already exists (`stat_multiplier` + `damageDealt`), so the passive
   leg is only novel in its ally reach.
5. **Invisibility — wanted against mobs AND on mobs; never against players.**
   WoW semantics: an invisible mob is unseen until it attacks or you get close
   enough; symmetric for players vs mob senses. *Validation:* the send path is
   already per-viewer (`core/net.go:playerSendState` filters by
   `p.Viewport().Collisions()` per player), so per-viewer omission has a clean
   seam and the client already handles entities entering/leaving its set.
   The player-invisible-to-mobs half is a gate at mob target acquisition plus
   break-on-harm (the `noteHarmDealt` seam exists) and a detect radius. ⚑ Most
   *new-concept* item of the six: per-viewer visibility state, two independent
   directions, reveal rules, and interplay with mob aura targeting, the
   minimap, spectators, and the headless harness (an invisible mob is
   indistinguishable from a missing one — the harness needs a cheat to see it).
   The hidden-mob-does-not-attack rule consumes the shared suppression lever.
6. **Thorns — wanted as a passive AND as an ally-granting aura.** Returns some
   damage per hit taken to the attacker. *Validation:* the victim side already
   knows its attacker — `model.Damage.Source` (else the toucher) arrives at
   both `takeDamage` sites, and lifesteal proves the "derived from damage
   actually dealt" plumbing pattern. Passive leg: a new passive effect type
   beside `resist_passive` (NOT a `validStat` — it modifies the *incoming* hit
   path, not a stat), read at both `takeDamage` sites. Aura leg: buff payload
   (pip fact applies) + the same read. ⚑ Two semantics to decide before
   building: a **recursion guard** (reflected damage must not re-reflect —
   a `Reflected` flag on `Damage`, the `Gated`/`Crit` pattern) and **credit**
   (does reflected damage feed threat/XP/lifesteal? Recommendation: threat
   yes, XP no, lifesteal no — but that is a design call, not a default).

**Rejected: displacement of others** (knockback, forced movement). PO 2026-07-29:
not intended — `dash` stays the only positional effect and moves the caster
only. On record so it is not re-proposed as a "missing archetype".

### Complexity ranking (least → most), for whenever these get scheduled

1. **Immunity** — both damage gates exist with defined semantics; the two
   restriction halves reuse existing levers.
2. **Thorns** — plumbing exists end to end; the cost is the recursion guard
   and the credit semantics.
3. **Ally offensive buffs** — aura and cooldown legs are siblings of shipped
   machinery; the passive leg carries the one open design question.
4. **Stun** — the suppression lever (first consumer builds it), a new
   authoring knob for resistance, input/AI touchpoints on both entity kinds.
5. **Dispel** — selective removal + classification are easy; the
   outcome-priced cost is a new shape and sequences behind Pass 1a.2.
6. **Invisibility** — per-viewer visibility is a genuinely new concept with
   the widest blast radius (wire, targeting, minimap, spectators, harness).

Presentation for all six rides §39; none of them justifies a seventh
independently-anchored overlay before it.

---

## 41. Fast travel — campfire network vs. flight paths

**WoW/Gothic fit: high** *(ranked 2026-07-29, PO-confirmed)*
**Origin:** PO idea 2026-07-29. Two options are under discussion; neither is
chosen, neither is scoped.

**Option 1 — campfire network.** Travel between **all discovered campfires**
through a simple UI. Quick loading, instantly at the destination.

**Option 2 — WoW-Classic-style griffons.** Discover **flight paths** and travel
between them **over the open world**: camera zooms out, movement is locked, the
player sees everything under them — and **players on the ground cannot see the
flyer passing over**.

**What each option leans on:**

- Option 1's anchor already exists twice over: campfires are authored world
  content (5 placed today) *and* the respawn anchor — the GDD's death rule is
  respawn at the **last visited fixed world campfire** (gdd.md §146), so
  "campfire the player has touched" is already a concept the server tracks in
  one-slot form. "All discovered" widens that slot into a **set**, which is new
  per-character persistent state (a step-8 input, same shape as §32/§36).
  Mechanically, instant relocation is trivial — the WARP cheat is exactly this.
- Option 2 is almost entirely new machinery: a flight-path graph as authored
  content, a locked-movement travel state on the player, a client camera mode
  (zoom-out is presentation), and — the expensive part — *"players can't see
  you flying over"* is **per-viewer visibility**, the same concept §40 ranks as
  the widest-blast-radius archetype of all (wire, targeting, minimap,
  spectators, harness). A cheaper reading that sidesteps it: the flyer is
  simply **not in the world** during transit (despawned, position interpolated
  server-side, respawned at the destination) — then nobody can see them because
  there is nothing to see, and only the flyer's own client renders the journey.

**⚑ The design tension between them is the death penalty.** Dying deep in the
world costing a walk back from the last campfire is an explicit GDD rule
(§152). Option 1 makes the respawn anchors *also* the teleport network, which
risks deleting that cost entirely (die → respawn at campfire A → teleport to
the campfire nearest the fight). Option 2's separate flight-path nodes keep
travel and respawn as distinct networks. If option 1 is taken, the interaction
needs an explicit ruling (cooldown on travel, cost, or campfires-near-content
placement discipline).

**⚑ Open questions:**

- Does fast travel exist **inside** a zone, or only between zones? The GDD's
  environmental-storytelling pillar and the dark-tunnel-as-tutorial design
  (zone 1 → zone 2) assume the world is *walked*; a teleport that skips the
  tunnel skips the role-concept tutorial with it.
- Is discovery **per character** or per account? (Couples to §36's bloodline
  scoping — same question, same session.)
- Does travel cost anything? The one-resource pillar means any cost is paid in
  the combat resource; free is also defensible for a convenience feature.
- Option 2 only: can a flight be interrupted / can the flyer bail out mid-way,
  or is it a committed channel? Committed is simpler and matches the reference.
- What does the *discovery* moment look like — walking into range (like the
  interact badge), or an explicit interaction with a campfire / flight master
  NPC? The interaction container from the entity model (`teach_skill`'s
  siblings) is the natural home for a flight-master conversation row.

**Not scheduled.** Both options carry per-character persistent state
(discovered set), so whichever is chosen, **step 8 should know the shape** —
raise it in the accounts & persistence design session alongside §32 and §36
rather than designing it independently.

---

## 42. Quests — a dedicated quest layer vs. the GDD's implicit-quest stance

**WoW/Gothic fit: high** *(ranked 2026-07-29, PO-confirmed)*
**Origin:** PO request 2026-07-29 (the WoW/Gothic backlog-fit ranking session).
Quests came up as the single biggest missing WoW-Classic loop driver — and had
no backlog entry. **The reason there was none is a design decision, not an
oversight:** the GDD explicitly rules a dedicated quest system out. §7
(World-Exploration Clues) says *"no quest log, no markers"*; §8 has a whole
section titled *"Quest-like Content Through Existing Systems"* — NPC teaching +
aura-gated harvest mobs yield an implicit quest schema *"without needing a
dedicated one."* This entry therefore records a **standing design tension to be
ruled on**, not a plan; a ruling *for* dedicated quests amends GDD §7/§8.

> **✅ BUILT 2026-07-30 — `plan-quests.md` is complete and archived** (C4 `395177e4`). All six
> chunks (P, C1, C0, C2, C3, C4) shipped the same day: lifetime counters and a
> per-character ledger that survives death, the dialogue vocabulary, the wire and
> the `J` journal, and four authored quests — including `wolves-on-the-road`,
> where two different NPCs finish the same quest for different rewards, which is
> content rather than a feature. This section stays the tension record and the
> place to read *why*; the plan doc is the record of *what*.
>
> **✅ RULED 2026-07-29 (same day):** the PO amended the GDD — quests exist as a
> concept, **carried by journal entries** (Gothic-diary style: what NPCs said,
> what the player undertook); **no quest markers, ever**; a **sidebar tracker
> is a maybe**. GDD §7's rule now reads "no markers" alone, and §8 gained
> **"Quests & the Journal"** with the ruling. The implicit-quest schema stays
> underneath. The remaining open questions below (verbs, rewards, crediting,
> scoping, quest-turns-hostile) are all still open — this ruling settled only
> the pillar.

**⚑ The reference reading cuts the pillar in half.** Both reference games have
quests *without markers*. Gothic 1+2 have a full quest system with a
diary/journal — no map markers, no tracking arrows; legibility comes from what
NPCs said and the player's world knowledge. WoW Classic has a quest log and
`!`/`?` NPC badges, but no map guidance either. So "quests" and "no markers"
are compatible — the half of the pillar a ruling would actually need to touch
is **"no quest log"**, and Gothic's diary (a journal that records what NPCs
*told you*, nothing more) is the natural middle path.

**What already exists — the machinery is mostly paid for** (the entity model
was designed with this day in mind):

- **The interaction container was shaped for it.** Entity-model ruling ⑥
  defined the full container (nodes / conditions / options / typed grant list)
  precisely so quest offer / accept / turn-in become **new `GrantKind`s on the
  identical row — no schema migration**
  (`archive/plan-entity-model.md`, "the container is what buys the future").
- **The quest-state shape is already ruled:** state lives **on the PLAYER and
  is advanced by EVENTS, never stored on the NPC**. The named precedent is the
  spellbook + `EntityMessage.kind=Unlock` (`2bfee286`) as the event-attribution
  channel — *"a journal is the same ledger fed by the same event."*
- **The conversation tree panel is shipped** (chunk 3b-ii) — offer/accept
  dialogue is pure content once the grant kinds exist.
- **The reward constraint stands and helps:** GDD §7 — rewards are exclusively
  actives / passives / cooldowns / XP, **no items**. Item-fetch quests are
  impossible by construction; the native verbs are kill-N, go-talk-to,
  discover-location, harvest-N.
- ⚑ **Read `archive/plan-entity-model.md` §8b first** — its R3 latent-trap set
  explicitly arms "the day quest-style content is authored."
- **What does NOT exist:** the quest ledger itself (deliberately out of scope
  in the entity-model plan, §10 item 5 — the typed grant list is all that plan
  owed it), kill/discovery event hooks feeding such a ledger, any journal UI,
  and per-character persistence for quest state (step 8).

**⚑ Open questions:**

- ~~**The pillar question, first:** amend "no quest log" (GDD §7/§8), or keep
  it and scope this to *strengthening the implicit schema* (more legible NPC
  hints, no ledger)?~~ **RESOLVED (PO 2026-07-29): amended — the Gothic-diary
  middle path taken.** Journal entries yes, markers never, sidebar tracker
  maybe. See the ruling banner above and GDD §8 → Quests & the Journal.
- Minimal verb set for a first pass — kill-N / talk-to / discover-location /
  harvest-N? (All four have existing server-side events or near-events.)
- Turn-in rewards under the GDD constraint are XP + skill unlocks only — is XP
  alone motivating enough, given the Session-⑥ XP band lock?
- Repeatability; and crediting — no formal groups exist, so does a kill credit
  every participant's quest (consistent with the "presence counts" XP ruling)?
- Per-character or per-account quest state? (Couples to §36's bloodline
  scoping — same question as §41's discovery scoping, same session.)
- Does **quest-turns-hostile** enter here? The allegiance verbs
  (`archive/plan-faction-flips.md` chunk 1) were built with it as a named
  future consumer.

> **✅ DESIGNED 2026-07-29 (second same-day session) → `docs/archive/plan-quests.md`.**
> Every open question below is ruled there (D1–D13): verbs = kill-N / talk-to /
> harvest-N (discover-location deferred), retroactive lifetime-counter credit
> with presence-counts, per-character state, one-shot + repeatable schema room,
> branching stages with multi-NPC turn-in choice (the camps seam), skill-trade
> and consequences as schema room only, conversant-only starts — and, ruling
> D12, the first pass **builds before step 8**, session-scoped, so persistence
> receives a live ledger. Quest-turns-hostile enters as an unauthored
> `consequences` kind. This entry stays the tension/pillar record.

**Not scheduled** ~~(superseded — see the DESIGNED banner above; chunks C0–C4
are scoped in the plan doc and run before step 8)~~. Quest state is
per-character persistence, so **step 8 should know the shape** — raise it in
the accounts & persistence design session alongside §32, §36 and §41. The
pillar ruling is done (banner above); what remains for a design session are the
open questions below it, and authoring actual quest content is a separate,
later concern.
