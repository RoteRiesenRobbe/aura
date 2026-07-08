# Aura — Technical Design Document

**Version:** 0.5
**Status:** Living document
**Last updated:** 2026-07-08 (§6 re-sequenced to the decided systems-first execution order; state: skill system Phases 1–9 ✓, Block 2 ✓, item 11 all phases ✓, effect foundations Steps 0+1+2 ✓)

> Companion document to the [Game Design Document](./gdd.md). This holds only technical decisions, architecture, and implementation topics. Game mechanics belong in the GDD.
>
> This TDD is the overarching technical big picture — **not a status tracker**. The current state lives in `CLAUDE.md` (migration status) and `docs/roadmap.md`; the skill-system migration plan in `docs/plan-skill-system.md`; runtime cost & scaling in `docs/architecture.md`. On detail conflicts, those repo docs win.

---

## 1. Existing Prototype

- **Our fork (active):** https://github.com/RoteRiesenRobbe/aura
- **Original prototype (`upstream`):** https://github.com/Nullformed/aurahunter
- **Forked from:** https://github.com/trichner/berryhunter
- **Stack (inherited):** Go server, WebSockets, browser client (TypeScript/PixiJS)
- **Local:** WSL at `/root/workspaces/aurahunter`
- **Server tick rate:** 30 ticks/s (33 ms/tick)

### What already works
- Multiplayer sync via WebSockets, top-down rendering, player movement, server-client architecture (ECS-based, `github.com/EngoEngine/ecs`)
- **Skill-system migration complete (Phases 1–9,** see `docs/plan-skill-system.md`**):** data-driven skills (JSON + registry), `SkillComponent` on players *and* mobs, all three categories playable (auras / passives / cooldowns), skill leveling + free respec, milestone & kill unlocks, spellbook + equip UI, curated secret combination recipes (PaladinAura)
- **Aura targeting (roadmap item 11):** selector + target cap per effect, base auras single-target, floating numbers, per-tick hit VFX (slash/fire)
- **Single resource + survival removal (Block 2,** see `docs/plan-block2-survival-removal.md`**):** `Health` is the one resource; crafting/items/vitals removed
- **Absolute HP system + resistances/damage tags (item 11 Phases 1+2,** see `docs/plan-item11-hp-resist-variance.md`**):** integer HP per entity, string-tag-based resistances, `resist_aura`/`resist_passive`

### What's missing for v1.0
*(Authoritative: `docs/roadmap.md` — headlines only here.)*
- **Initial content pass** (roadmap item 12 — prototype gate)
- Accounts (register / login) and persistence (player data, world state) — item 3
- Handcrafted world & zones (currently procedurally assembled) — item 4
- Darkness & light (`light_aura`) — item 5
- Line-of-sight for auras (2D raycast; deliberately deferred until zones/walls exist) — item 6
- Mob behavior, tiers, boss scripting/encounter controller — item 7
- Zone chat (Berryhunter chat exists, zone scoping missing) — item 8
- Remaining unlock sources (world exploration, NPC teaching) — item 9

*(Meta-progression / character sacrifice is explicitly **not** v1.0 — see GDD §11 and the roadmap.)*

---

## 2. Tech Decision: Continue vs. Clean Start

**Decision (made):** continue (build out the Berryhunter fork).

**Rationale:** the hardest parts (multiplayer netcode, movement, top-down rendering, server-client architecture) are already there. Everything Aura needs (aura system, accounts, persistence, line-of-sight) goes on top — not in place of something existing. The code has since been analyzed together; the structure carries the Aura features (the data-driven skill system incl. mob parity was layered cleanly onto the existing ECS architecture).

A clean start remains only a theoretical fallback in case the code structure ever turns out to actively block a feature. No sign of that so far.

---

## 3. Stack

### Current
- **Server:** Go (≥ 1.22)
- **Transport:** WebSockets
- **Protocol:** FlatBuffers (flatc v24.3.25, toolchain modernized)
- **Client:** browser, TypeScript + webpack + PixiJS (from Berryhunter)

### Open decisions
- [ ] Database (accounts, level, skills, spellbook, meta-progression)
- [ ] Hosting strategy for production
- [ ] Auth system (direction decided: anonymous-first with upgrade path, see roadmap item 3; concrete implementation open)
- [ ] Client build pipeline (currently webpack from Berryhunter)
- [ ] Map format / authoring tooling (Tiled vs. custom JSON — roadmap item 4)

---

## 4. Architecture — New Systems

Each system below gets its own spec discussion before it is implemented; sections already built are marked as such.

### 4.1 Skill/Aura System

**Status: built and live** — migration Phases 1–9 complete (`docs/plan-skill-system.md`), targeting incl. hit VFX (roadmap item 11), absolute HP + resistances/tags (`docs/plan-item11-hp-resist-variance.md`). The factual current state (which effect types exist, what is data vs. Go) is mapped in `docs/archive-scripting-audit.md` §1; here only the architectural big picture:

- Skill definitions as JSON (`api/skills/`), registry analogous to items/mobs, hard-fail validation at load
- `SkillComponent` on players and mobs (same mechanics; per-mob aura skills, aura switching via `SetActiveAura` possible)
- Generic `SkillSystem` (ECS) processes the active aura per tick; 8 effect types (`damage_aura`, `heal_aura`, `stat_multiplier`, `instant_damage`, `slow_aura`, `self_heal`, `resist_aura`, `resist_passive`)
- **Targeting pipeline per effect:** range filter (aura sensor) → *(later, item 6)* LoS filter → selector sort (`nearest` default, `lowest_health` percentage-based, `all`) → first `maxTargets`. Heal auras never heal the caster; self-healing is a cooldown (`self_heal`).
- Tick intervals per effect, monotonic accumulator per equipped skill (multi-effect skills run each effect on its own cadence); reset on aura switch prevents the rapid-switch DPS exploit
- Unlocks are data-driven (milestones, kill drops, recipe cascade); spellbook over the wire + UI (panel, equip, unlock glow)
- Faction logic: binary `model.Faction` on players (aligned) and mobs (hostile, runtime-flippable for future charm/summons) + faction-relative target flags per effect (`targetsEnemies` / `targetsAllies` / `targetsStructures` / `targetsSelf`, effect foundations Step 1) — no friendly fire = `targetsAllies: false`, mob-vs-mob excluded as same-faction, masks derived per caster faction
- Resource consumption as an effect parameter (`selfDamageHP` — no separate cost system); damage/healing in absolute integer HP with the min-1 rule; resistances as string-tag multipliers
- Per-tick **hit VFX on the struck target** (slash for slow ticks, fire for fast ones), so the aura circle reads as range rather than hit zone

**Deliberately open / deferred:**
- Auras only affect targets with line-of-sight — LoS not built yet (see 4.2, roadmap item 6)
- Mob heal / heal_aura target flags: **deliberately later**, with roadmap item 7 (mob support behaviors); the two known limitations are documented in `plan-skill-system.md` (Effect Types → heal_aura)
- Sticky targeting against target flicker with `nearest` — only when it actually bothers in practice
- ~~Whether effect behavior eventually becomes authorable as expressions/scripts instead of Go effect types~~ — **decided 2026-07-07: effect semantics stay Go effect types, no scripting engine for effects; a constrained expression layer stays parked behind an explicit trigger.** Rationale + the primitive-first growth plan: `docs/plan-effect-foundations.md` (archived options record: `docs/archive-scripting-options.md`)

### 4.2 Line-of-Sight (2D Raycast)

**Decided: LoS stays in scope** — it carries two pillars (cover/positional tactics, the light-support role). But it splits into **two separate problems** with completely different costs:

1. **Aura occlusion** — does a wall block the effect? Combat-relevant, must be server-authoritative. This is the actual high-risk item.
2. **Vision/darkness** — what the player *sees* (light cones in caves). **Decided: purely client rendering, no mechanical effects** (no damage/hit-chance penalty in the dark). This makes the cave atmosphere and the zone-1→2 tutorial cheap and decoupled from the risky part (roadmap item 5; the `light_aura` effect type is designed there too).

**Decided design points for the occlusion:**
- **Occluders are curated:** a blocks-LoS flag on large objects (walls, rocks, cliffs) — decorative trees do *not* block, otherwise forest combat gets chopped up and feels random.
- **Approach:** occluder layer as a grid/tilemap + integer raycast (DDA) — fast, cost ≈ radius/tile size. Polygons only if the map format forces them.
- **LoS cache:** don't recompute every tick — recompute every K ticks or on movement [PLACEHOLDER]; many auras tick less often anyway (`tickInterval`).
- **Synergy with targeting:** thanks to the target cap, raycasting happens in selector-sorted order with early-out — once N targets have passed, stop. Normally N raycasts instead of "all candidates".

**Performance model:** the load doesn't scale with total entities but with **co-located aura casters** (the blob: boss event, special-event puddle). The broadphase ("who is in range") is the expensive part, not the raycast — and Berryhunter already ships spatial hashing in `phy`. Rough expectation: low hundreds of simultaneously overlapping casters per core sustainable; that is a curve-shape estimate, not a number — **the spike measures it** (blob benchmark: X synthetic casters, tick time must stay under 33 ms).

**Timing (decided):** LoS is **not part of the prototype path** — it depends on zones/walls worth blocking (roadmap item 6, dependent on item 4 map format). The spike happens when the map format comes up.

**Open questions:**
- World representation of the occluders (depends on the map-format decision, roadmap item 4)
- Occluders static (pre-bakeable) vs. entities (Berryhunter resources are harvestable → potentially dynamic)
- Recompute cadence of the cache (tuning)
- LoS sampling: center-to-center first; corner artifacts later

### 4.3 Persistence

**What must be stored persistently:**
- Account (anonymous-first: server-issued secret in localStorage, optional email/OAuth linking later — direction decided, roadmap item 3)
- Characters per account (name, level, position, resource)
- Spellbook per character (which auras unlocked, at which levels)
- Skill-point distribution per character
- Active build per character (which auras in which slots)
- Meta-progression per account (post-v1)
- World state? (campfires, special-event triggers, ...)

**Open questions:**
- Database choice (SQL vs. document vs. KV)
- Snapshot strategy on server crash
- How is world state persisted without writing every frame?
- ~~Does the `chieftain` service (scoreboard, SQLite) grow into the account service, or does a new service get added?~~ **Decided 2026-07-08 (`plan-rebrand-cleanup.md` §4 A.3): no — the scoreboard was removed, chieftain gets deleted in the rebrand sweep, the account service starts fresh.**

### 4.4 Accounts & Auth

**Requirements:**
- Anonymous-first (play without registration), upgrade path for cross-device safety
- Multiple characters per account
- Session management across WebSocket reconnects

**Open questions:**
- Email/OAuth linking concretely?
- Anti-bot / anti-abuse?

### 4.5 Cooldown System

- Per-player cooldowns for Q/E abilities, server-authoritative
- **Status: built (Phase 8.2)** — hotkeys + ability bar, `cooldown_activations` on `Input`, `CdTicks` bookkeeping in the SkillSystem, burst VFX through the status pipeline. Self-healing runs through a cooldown (not through heal auras). Details: `docs/plan-skill-system.md` → Phase 8.2.

### 4.6 Zones & Zone Chat

- Players are in exactly one zone
- Auras / visibility only within the zone
- Zone chat: one channel per zone (broadcast filtered by sender zone — decided, roadmap item 8); global chat stays until zones exist
- Zone transitions (e.g. the tunnel between zone 1 and 2) — how?

---

## 5. Known Technical Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Line-of-sight performance (blob case) | High | Deliberately deferred until the map format stands; then a spike with the blob benchmark; grid DDA + cache + target-cap early-out; not on the prototype path |
| Aura tick sync between clients | Medium | Server-authoritative, delta updates |
| DB schema migration during live operation | Medium | Migrations framework from day one |
| Cheat resistance | Low (v1.0) | Server-authoritative for everything combat-relevant; anti-cheat only matters later |

> The earlier risk "Berryhunter code blocks Aura features" did not
> materialize — the skill system incl. mob parity layered cleanly onto the
> existing ECS architecture.

---

## 6. Roadmap (technical, rough)

First sketch; the authoritative plans are `docs/plan-skill-system.md` (skill system) and `docs/roadmap.md` (rest — current progress + the **decided execution order** live there, not duplicated here). **Build order decided 2026-07-08: systems-first, content-last** — see roadmap.md "Execution order". Re-sequenced to match (numbering below now reflects the build order, not the roadmap item numbers):

1. ✅ **Repo setup & onboarding** — Berryhunter running locally, Claude Code set up, build pipeline understood
2. ✅ **Skill-system migration** — Phases 1–9 complete (tick engine, all three categories, leveling, unlocks, combinations)
3. ✅ **Survival removal + resource unification** — roadmap items 1+2 (Block 2)
4. ✅ **Aura targeting: selector + target count** — roadmap item 11, incl. hit VFX; then absolute HP + resistances/tags/variance (item 11 Phases 1–3)
5. ⬜ **World foundation** — roadmap item 4; in-game editor + `zone.json` loader + rectangular boundary + scaffold zone (`plan-world-zones.md`, 6 chunks) ← **we are here**
6. ⬜ **Mob depth + totems** — roadmap item 7 remainder (patrol archetypes, support mob-heal, **encounter-controller spine + threat table** built early) + effect-foundations Step 3 (spawned-entity/totem lifecycle)
7. ⬜ **Line-of-sight + darkness/light** — roadmap items 6 + 5; LoS spike (blob benchmark) → occlusion into the aura pipeline; darkness rendering + `light_aura` effect type + campfires (both consume item-4 map data)
8. ⬜ **Skill-vocabulary fill** — effect-foundations Step 4 (shield-as-buff-payload) + cheap effect types (life steal, execute, crit, berserker)
9. ⬜ **Unlock-source systems** — roadmap item 9; world clue-anchor entities + NPC-teaching behavior
10. ⬜ **Initial content pass** — roadmap item 12; first real skill/mob/recipe/boss/zone content + legacy-mob replacement + balance (**the prove-it gate**)
11. ⬜ **Accounts & persistence** — roadmap item 3; anonymous-first (**after** content) + UI polish / avatar (item 8)
12. ⬜ **Polish & closed alpha** — ops gaps (CI tests, crash isolation, observability): see `docs/research-v1-readiness.md`

---

## 7. Open Tech Decisions (collection point)

- [ ] Database choice
- [ ] Hosting strategy (production)
- [ ] Auth implementation (direction: anonymous-first, decided)
- [ ] Map format / authoring tooling (Tiled vs. custom JSON) — biggest unknown in item 4, also determines the occluder representation
- [ ] Client build pipeline
- [ ] Logging / monitoring from the start?
- [ ] Migrations framework for the DB
- [ ] Seasonal vs. permanent servers (infrastructure question on top of the design question)

---

## 8. Deferred Technical Debt

The authoritative, current list lives in `CLAUDE.md` (migration status → "Deferred tech debt / known bugs") and `docs/plan-skill-system.md` (Deferred Tech Debt) — this TDD does not repeat it. For the live-operations perspective (CI, observability, crash story) see `docs/research-v1-readiness.md`; for the content-pipeline debt (Skills.ts duplication, `go:embed` rebuild loop) `docs/research-content-pipeline.md`.
