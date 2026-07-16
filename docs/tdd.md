# Aura — Technical Design Document

**Version:** 0.5
**Status:** Living document
**Last updated:** 2026-07-10 (aura line-of-sight **CUT** — §4.2 rewritten as decision record; harness metrics extended §4.1; step 7 reshaped §6; state: skill system Phases 1–9 ✓, Block 2 ✓, item 11 all phases ✓, effect foundations Steps 0+1+2 ✓, mob depth chunks 1–3 implemented)

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
- ~~Line-of-sight for auras~~ — **cut 2026-07-10** (see §4.2)
- Mob behavior, tiers, boss scripting/encounter controller — item 7
- Zone chat (Berryhunter chat exists, zone scoping missing) — item 8
- Remaining unlock sources (world exploration, NPC teaching) — item 9

*(Meta-progression / character sacrifice is explicitly **not** v1.0 — see GDD §11 and the roadmap.)*

---

## 2. Tech Decision: Continue vs. Clean Start

**Decision (made):** continue (build out the Berryhunter fork).

**Rationale:** the hardest parts (multiplayer netcode, movement, top-down rendering, server-client architecture) are already there. Everything Aura needs (aura system, accounts, persistence) goes on top — not in place of something existing. The code has since been analyzed together; the structure carries the Aura features (the data-driven skill system incl. mob parity was layered cleanly onto the existing ECS architecture).

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
- [ ] Hosting strategy for production (phased outline + load math recorded: `research-hosting.md`; provider/DB still open)
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
- **Targeting pipeline per effect:** range filter (aura sensor) → selector sort (`nearest` default, `lowest_health` percentage-based, `all`) → first `maxTargets`. There is deliberately **no LoS filter** (cut 2026-07-10, §4.2). Heal auras never heal the caster; self-healing is a cooldown (`self_heal`).
- Tick intervals per effect, monotonic accumulator per equipped skill (multi-effect skills run each effect on its own cadence); reset on aura switch prevents the rapid-switch DPS exploit
- Unlocks are data-driven (milestones, kill drops, recipe cascade); spellbook over the wire + UI (panel, equip, unlock glow)
- Faction logic: binary `model.Faction` on players (aligned) and mobs (hostile, runtime-flippable for future charm/summons) + faction-relative target flags per effect (`targetsEnemies` / `targetsAllies` / `targetsStructures` / `targetsSelf`, effect foundations Step 1) — no friendly fire = `targetsAllies: false`, mob-vs-mob excluded as same-faction, masks derived per caster faction
- Resource consumption as an effect parameter (`selfDamageHP` — no separate cost system); damage/healing in absolute integer HP with the min-1 rule; resistances as string-tag multipliers
- Per-tick **hit VFX on the struck target** (slash for slow ticks, fire for fast ones), so the aura circle reads as range rather than hit zone
- **Value scaling — two multiplicative axes (GDD §5, Power Source & Curve):** the per-skill level rule `base + (level−1)×perLevel` (`skills.Scaled`) is the *specialization* axis. The *inflation* axis `f(character level) = growth^(L−1)` is **LIVE (C0, 2026-07-16, `plan-content-zones12.md` §13)**: one shared formula in `pkg/berryhunter/curve` (the sim harness aliases it — structurally drift-free), conf-driven via `game.player.levelGrowth` + `maxLevel` (**WORKING LOCK: 1.12 × 30 → ≈27× total inflation, band ≈ +5**; defaults live in `curve.Default()` / `cfg.ReadConfig`). Players: `MaxHealth = baseHealth × f(L) × (1 + passive bonus)` (multiplicative — a +20% HP passive is +20% at every level), level-ups clamp at `maxLevel`, and `PowerScale() = f(L)` multiplies **HP-side output only** through the single SkillSystem seam `casterPowerScale`: damage / heal / dot / hot / shield absorb / flat self-heal / `selfDamageHP` cost — **never** radius, tick rate, target count, or the relative vocabulary (crit/execute/berserker/variance/lifesteal/slow/resist); the fraction-of-max self-heal rides max HP, not f twice. Owned summons compose `SummonPower × f(owner level)` so summon builds stay same-tier-relevant. **Mobs carry no runtime level multiplier** — they are authored **tier + baseline** (C0): mob JSON = `tier` (normal/elite/boss, a pure label) + `curveLevel` (position on f; zone number = curve position) + `factors.baseMaxHealth`; the loader derives `maxHealth = base × f(curveLevel)` and a def `PowerScale = f(curveLevel)` applied to the mob's (baseline-authored) skill HP values at cast time — raw `factors.maxHealth` **hard-fails at load**, so a growth change is a one-knob re-derivation. Role + curve rationale: Philosophy A / same-tier scale-invariant (GDD §5 + `plan-sim-harness.md` §5), tuned by the shipped **simulation harness** (TTK/TTD, 1-vs-N matrix, kills/hour chain per level bracket)

**Deliberately open / deferred:**
- Mob heal / heal_aura target flags: **deliberately later**, with roadmap item 7 (mob support behaviors); the two known limitations are documented in `plan-skill-system.md` (Effect Types → heal_aura)
- Sticky targeting against target flicker with `nearest` — only when it actually bothers in practice
- ~~Whether effect behavior eventually becomes authorable as expressions/scripts instead of Go effect types~~ — **decided 2026-07-07: effect semantics stay Go effect types, no scripting engine for effects; a constrained expression layer stays parked behind an explicit trigger.** Rationale + the primitive-first growth plan: `docs/plan-effect-foundations.md` (archived options record: `docs/archive-scripting-options.md`)

### 4.2 Line-of-Sight — CUT (decision record)

**Decided 2026-07-10: aura line-of-sight is cut.** Auras pass through walls
and every environment object; walls and props remain **movement** blockers
(that mechanic stays fully intact — `blocksMovement`, the `InvAABB`
boundary). Full decision prep + rationale:
`research-combat-pacing-recovery.md` §2.C. The load-bearing points:

- **Solo, LoS is symmetric** — an obstacle between two centers blocks *both*
  auras, so it grants no positional advantage in 1v1, only a disengage tool.
  Its real value (pack-fight occlusion, group heal positioning) was judged
  not worth the cost.
- **The cost was larger than documented:** a medium system (occluder bake +
  DDA raycast + cache + pipeline filter) + the blob perf spike (the former
  §5 high-risk item) + an *undocumented* mob-AI extension — chase/hold and
  combat-state checks are distance-based, so mobs would have needed
  reposition-until-LoS behavior or they'd get cheesed worse.
- **The earlier "carries two pillars" justification had already aged:** the
  light-support role was decoupled when darkness was decided as purely
  visual — only cover tactics still rode on occlusion.
- **Wall-cheese is handled on the mob-AI side instead:** obstacle steering
  (mob-depth chunk 4) + leash mechanics (a no-progress leash rule is parked
  in `plan-mob-depth.md` §6 as the designated mechanism — a stuck mob
  disengages and fully regens, so shooting through walls yields nothing).
  Navmesh/A* remains the recorded escalation if steering demonstrably fails;
  wall-cheese appearing in playtests is now its explicit trigger.
- **Stationary mobs** (can't path, can't leash) are protected by an
  authoring rule instead (GDD §8: no wall pockets covering their aura
  radius).
- **`blocksAura` plumbing deleted (sweep done 2026-07-11):** schema field in
  `world/zone.go`, `model/prop.Prop` field + `PropEntity` method, editor
  checkbox + inner-ring marker, authored values in the zone JSONs. Re-adding
  later is a one-line additive schema change (`DisallowUnknownFields`).

**Unaffected:** **vision/darkness** (what the player *sees* — dark caves,
the zone-1→2 tunnel, light auras/campfires) was always a separate,
area-based, purely client-visual feature and **stays in scope** (roadmap
item 5). No wall-based sight occlusion was ever planned there, and none is
now.

### 4.3 Persistence

**What must be stored persistently:**
- Account (anonymous-first: server-issued secret in localStorage, optional email/OAuth linking later — direction decided, roadmap item 3)
- Characters per account (name, level, position, resource)
- Spellbook per character (which auras unlocked, at which levels)
- Skill-point distribution per character
- Active build per character (which auras in which slots)
- Meta-progression per account (post-v1; cosmetic avatar rewards are rendering-only — sprite scale, never the physics body — GDD §5)
- World state? (campfires, special-event triggers, ...)

**Open questions:**
- Database choice (SQL vs. document vs. KV)
- Snapshot strategy on server crash
- How is world state persisted without writing every frame?
- ~~Does the `chieftain` service (scoreboard, SQLite) grow into the account service, or does a new service get added?~~ **Decided 2026-07-08 (`plan-rebrand-cleanup.md` §4 A.3): no — the scoreboard was removed, the account service starts fresh. Chieftain was deleted 2026-07-09 (pulled forward from the step-7 sweep).**

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
- **Named sub-regions (known-future, build nothing now):** three later features — per-area music (forest vs. cave *within* one zone), darkness patches (caves, the zone-1→2 tunnel, see 4.2), and per-area terrain/biome — all reduce to the same primitive: *a named region inside a zone carrying its own properties*. Today `zone.json` is `bounds` / `props` / `spawns` only. **Decision (2026-07-09):** don't build regions yet, but don't design them out — world-foundation chunk 6 authors terrain as the zone's **default** floor (not "the zone has *exactly one* floor"), and the loader's `DisallowUnknownFields` makes a later `regions: [...]` a one-line additive change. One shared region primitive then underpins music + darkness + terrain.

### 4.7 Client Rendering: Fixed Field of View & Zoom Levels (decided 2026-07-11)

**Decision: the visible world area is a game constant (fixed FOV), never a
browser artifact.** Browser zoom and window size only change render sharpness
and aspect ratio — how much world a player sees is defined by the game
(krunker.io model). This closes the fairness hole where zooming the browser
out granted extra sight range, and it is what killed the "blue border" bug
class for good (see below).

- **Mechanics:** `frontend/.../camera/logic/Zoom.ts` defines zoom levels as
  **visible world heights** ([PLACEHOLDER] 6 / 7.6 / 9.5 m; level 1 = nearest,
  3 = furthest, default middle). The camera scales `cameraGroup` by
  `s = max(screenH / visibleHeight, screenW / maxVisibleWidth)` every frame —
  "cover" semantics. All screen↔world conversions (`Camera.getScreenX/getMapX`
  etc.) and the rectangular camera clamp carry the scale, so the zone editor
  and dev tools stay click-accurate at every level.
- **Streaming cap:** the server streams entities in a fixed **20×12 m**
  viewport (`model/constant/const.go` / `BasicConfig.VIEWPORT`). The visible
  width is hard-capped at [PLACEHOLDER] **18 m** so ultrawide windows at max
  zoom-out never outrun the stream (entity pop-in). If a further-out level is
  ever wanted, the backend viewport must grow with it (wire-neutral, but
  bandwidth/interest-management cost).
- **Zoom control:** two buttons + level number on the right edge above the
  vital bars (`#zoomControl` in HUD.html); no wheel/key binding for now.
  Ctrl+wheel browser zoom is `preventDefault`ed in-game.
- **Known caveat:** the DOM HUD still scales with browser zoom (only the
  canvas world view is immune). Acceptable until the UI-polish pass; a
  canvas-rendered or rem-recalibrated HUD would close it.
- **Blue-border bug (root cause fixed 2026-07-11):** `Game.ts` snapshotted
  `devicePixelRatio` once and Pixi's `resizeTo` never re-applied resolution —
  a hard reload at ≠100% browser zoom left canvas buffer and early draw
  batches (terrain) on different metrics. Now the game owns resizing:
  `renderer.resize(innerWidth, innerHeight, devicePixelRatio)` on every
  window resize AND DPR change (re-chained `matchMedia('(resolution: …dppx)')`
  listener), plus one post-init rAF reconciliation; `Game.width/height` read
  `renderer.screen` live; the screen-sized water backdrop redraws on the
  renderer resize event; the camera's corner cache is gone.

---

## 5. Known Technical Risks

| Risk | Severity | Mitigation |
|---|---|---|
| ~~Line-of-sight performance (blob case)~~ | ~~High~~ | **Resolved by cut (2026-07-10, §4.2)** — no raycasting exists to be slow |
| Combat degenerates into standing still ("Tempo/Fun") | High (design) | GDD §4 Combat Pacing: tick readability + two-zone auras + mob movement vocabulary; measured by the harness stand-still bot tiers (GDD §5) |
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
5. ✅ **World foundation** — roadmap item 4; in-game editor + `zone.json` loader + rectangular boundary + zone-owned free-form terrain + multi-zone save/select + scaffold zone (`plan-world-zones.md`, 6 chunks) — **COMPLETE + in-game-verified 2026-07-09**
6. ⬜ **Mob depth + totems** — roadmap item 7 remainder (patrol archetypes, support mob-heal, **encounter-controller spine + threat table** built early) + effect-foundations Step 3 (spawned-entity/totem lifecycle) ← **we are here**
7. ⬜ **Darkness/light + campfires + death & recovery** — roadmap item 5 (~~item 6 cut 2026-07-10~~, §4.2): darkness rendering + `light_aura` effect type + campfires (consumes item-4 map data), plus the 2026-07-10 recovery/death bundle — campfire death-respawn (world campfires only), the death state (corpses + respawn button), combat-gating player passive regen
8. ⬜ **Skill-vocabulary fill** — effect-foundations Step 4 (shield-as-buff-payload) + cheap effect types (life steal, execute, crit, berserker)
9. ⬜ **Unlock-source systems** — roadmap item 9; world clue-anchor entities + NPC-teaching behavior
10. ⬜ **Initial content pass** — roadmap item 12; first real skill/mob/recipe/boss/zone content + legacy-mob replacement + balance (**the prove-it gate**)
11. ⬜ **Accounts & persistence** — roadmap item 3; anonymous-first (**after** content) + UI polish / avatar (item 8)
12. ⬜ **Polish & closed alpha** — ops gaps (CI tests, crash isolation, observability): see `docs/research-v1-readiness.md`

---

## 7. Open Tech Decisions (collection point)

- [ ] Database choice
- [ ] Hosting strategy (production) — phased outline + load math: `research-hosting.md`
- [ ] Auth implementation (direction: anonymous-first, decided)
- [ ] Map format / authoring tooling (Tiled vs. custom JSON) — biggest unknown in item 4, also determines the occluder representation
- [ ] Client build pipeline
- [ ] Logging / monitoring from the start?
- [ ] Migrations framework for the DB
- [x] Seasonal vs. permanent servers — **decided 2026-07-13: persistent servers** (no seasonal wipes; consequences recorded in `research-hosting.md` §1)

---

## 8. Deferred Technical Debt / known bugs

This is the authoritative list of open, cross-cutting debt. (Fixed items are recorded in
`docs/archive-session-log.md` + git; per-item debt also lives in the relevant `plan-*.md`.)

- **Player passive regen is not combat-gated** (`model/player/update.go` regenerates whenever `0 < Health < max`, in combat too — GDD §3 says out-of-combat only). Gate scheduled as execution step 3 chunk 1 (needs a player in-combat flag / recent-damage window); prerequisite for the harness stand-still thresholds. See `plan-atmosphere-recovery.md`.
- **Frontend `Skills.ts` hardcodes skill ID → name, maxLevel *and* category**, duplicating the backend registry — sync manually when skills change; revisit (wire or generated file) when the skill list grows.
- **`-2` `active_aura_slot` deactivate sentinel** is a workaround for FlatBuffers omitting the `-1` default (an explicit `-1` is indistinguishable from an absent field). Decided in Phase 5: it stays. Paired constants: `model.ActiveAuraSlotDeactivate` (Go) / `DEACTIVATE_AURA_SLOT` (InputMessage.ts).
- ⚠️ **`go:embed` testing gotcha:** patterns don't include subdirectories (`*.json **/*.json`!), and disk-based registry tests can't catch embed gaps — pinned by `pkg/api/skills/skills_test.go`. Before manual tests: `pkill berryhunterd`, rebuild, and check the boot log (`Loaded skill definitions count=…`) — a stale server process silently masks new behavior.
- **`backend/pkg/berryhunter/net/net_test.go`** is a manual `ListenAndServe` WebSocket smoke script (not a real test); it starts with `t.Skip` so the full suite runs. Remove the skip to run it explicitly.
- Frontend FlatBuffers toolchain is on **flatc v24.3.25**.

For the live-operations perspective (CI, observability, crash story) see `docs/research-v1-readiness.md`; for the content-pipeline debt (Skills.ts duplication, `go:embed` rebuild loop) `docs/research-content-pipeline.md`.
