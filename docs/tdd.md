# Aura — Technical Design Document

**Version:** 0.5
**Status:** Living document
**Last updated:** 2026-07-21 (docs cleanup pass: §1 missing-for-v1 and §6 roadmap brought up to date — execution-order steps 1–7 are complete, incl. the content pass and the Aura rebrand; §3 map-format decision closed; character sacrifice corrected to **in** v1 scope per the 2026-07-19 PO ruling)

> Companion document to the [Game Design Document](./gdd.md). This holds only technical decisions, architecture, and implementation topics. Game mechanics belong in the GDD.
>
> This TDD is the overarching technical big picture — **not a status tracker**. The current state lives in `CLAUDE.md` (migration status) and `docs/roadmap.md`; the skill-system migration plan in `docs/archive/plan-skill-system.md`; runtime cost & scaling in `docs/architecture.md`. On detail conflicts, those repo docs win.

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
- **Skill-system migration complete (Phases 1–9,** see `docs/archive/plan-skill-system.md`**):** data-driven skills (JSON + registry), `SkillComponent` on players *and* mobs, all three categories playable (auras / passives / cooldowns), skill leveling + free respec, milestone & kill unlocks, spellbook + equip UI, curated secret combination recipes (Paladin)
- **Aura targeting (roadmap item 11):** selector + target cap per effect, base auras single-target, floating numbers, per-tick hit VFX (slash/fire)
- **Single resource + survival removal (Block 2,** see `docs/archive/archive-block2-survival-removal.md`**):** `Health` is the one resource; crafting/items/vitals removed
- **Absolute HP system + resistances/damage tags (item 11 Phases 1+2,** see `docs/archive/plan-item11-hp-resist-variance.md`**):** integer HP per entity, string-tag-based resistances, `resist_aura`/`resist_passive`

### What's missing for v1.0
*(Authoritative: `docs/roadmap.md` — headlines only here.)*
- Accounts (register / login) and persistence (player data, world state) — item 3
- Zone chat (chat exists, zone scoping missing) — item 8
- **Character sacrifice / meta-progression** — moved **into** v1 scope
  2026-07-19 (PO ruling, `plan-intermission-triage.md` item 10; GDD §11
  amended). Lands right after accounts & persistence, as its first consumer.
- Combat-feel SFX — the open remnant of the content pass (roadmap step 6)

*Done since this list was first written:* ~~initial content pass~~ (item 12,
✅ 2026-07-21) · ~~handcrafted world & zones~~ (item 4, ✅ 2026-07-09) ·
~~darkness & light~~ (item 5, ✅ 2026-07-13) · ~~mob behavior/tiers/encounter
controller~~ (item 7, ✅ 2026-07-12) · ~~remaining unlock sources~~ (item 9,
✅ 2026-07-15) · ~~line-of-sight for auras~~ **cut 2026-07-10** (see §4.2).

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
- [ ] Client build pipeline (currently webpack, inherited)
- [x] ~~Map format / authoring tooling (Tiled vs. custom JSON)~~ — **decided
      and shipped** (roadmap item 4, 2026-07-09): custom server-authoritative
      `zone.json` + an in-game editor. Manual: `manual-zone-editor.md`. A
      standalone browser map editor is a possible successor (`backlog.md` §22).

---

## 4. Architecture — New Systems

Each system below gets its own spec discussion before it is implemented; sections already built are marked as such.

### 4.1 Skill/Aura System

**Status: built and live** — migration Phases 1–9 complete (`docs/archive/plan-skill-system.md`), targeting incl. hit VFX (roadmap item 11), absolute HP + resistances/tags (`docs/archive/plan-item11-hp-resist-variance.md`). The factual current state (which effect types exist, what is data vs. Go) is mapped in `docs/archive/archive-scripting-audit.md` §1; here only the architectural big picture:

- Skill definitions as JSON (`api/skills/`), registry analogous to items/mobs, hard-fail validation at load
- `SkillComponent` on players and mobs (same mechanics; per-mob aura skills, aura switching via `SetActiveAura` possible)
- Generic `SkillSystem` (ECS) processes the active aura per tick; **22 effect types in use** as of 2026-07-21 — grown from the original 8 by the effect-foundations plan and the skill-vocabulary fill: `damage_aura`, `heal_aura`, `hot_aura`, `dot_aura`, `shield_aura`, `resist_aura`, `slow_aura`, `light_aura`, `stat_multiplier`, `resist_passive`, `instant_damage`, `instant_dot`, `instant_hot`, `instant_shield`, `self_heal`, `spawn`, `taunt`, `detaunt`, `dash`, `recall`, `revive`, `tick_rate`
- **Targeting pipeline per effect:** range filter (aura sensor) → selector sort (`nearest` default, `lowest_health` percentage-based, `all`) → first `maxTargets`. There is deliberately **no LoS filter** (cut 2026-07-10, §4.2). Heal auras never heal the caster; self-healing is a cooldown (`self_heal`).
- Tick intervals per effect, monotonic accumulator per equipped skill (multi-effect skills run each effect on its own cadence); reset on aura switch prevents the rapid-switch DPS exploit
- Unlocks are data-driven (milestones, kill drops, recipe cascade); spellbook over the wire + UI (panel, equip, unlock glow)
- Faction logic: binary `model.Faction` on players (aligned) and mobs (hostile, runtime-flippable for future charm/summons) + faction-relative target flags per effect (`targetsEnemies` / `targetsAllies` / `targetsStructures` / `targetsSelf`, effect foundations Step 1) — no friendly fire = `targetsAllies: false`, mob-vs-mob excluded as same-faction, masks derived per caster faction
- Resource consumption as an effect parameter (`selfDamageHP` — no separate cost system); damage/healing in absolute integer HP with the min-1 rule; resistances as string-tag multipliers
- Per-tick **hit VFX on the struck target** (slash for slow ticks, fire for fast ones), so the aura circle reads as range rather than hit zone
- **Value scaling — two multiplicative axes (GDD §5, Power Source & Curve):** the per-skill level rule `base + (level−1)×perLevel` (`skills.Scaled`) is the *specialization* axis. The *inflation* axis `f(character level) = growth^(L−1)` is **LIVE (C0, 2026-07-16, `plan-content-zones12.md` §13)**: one shared formula in `pkg/aura/curve` (the sim harness aliases it — structurally drift-free), conf-driven via `game.player.levelGrowth` + `maxLevel` (**WORKING LOCK: 1.12 × 30 → ≈27× total inflation, band ≈ +5**; defaults live in `curve.Default()` / `cfg.ReadConfig`). Players: `MaxHealth = baseHealth × f(L) × (1 + passive bonus)` (multiplicative — a +20% HP passive is +20% at every level), level-ups clamp at `maxLevel`, and `PowerScale() = f(L)` multiplies **HP-side output only** through the single SkillSystem seam `casterPowerScale`: damage / heal / dot / hot / shield absorb / flat self-heal / `selfDamageHP` cost — **never** radius, tick rate, target count, or the relative vocabulary (crit/execute/berserker/variance/lifesteal/slow/resist); the fraction-of-max self-heal rides max HP, not f twice. Owned summons compose `SummonPower × f(owner level)` so summon builds stay same-tier-relevant. **Mobs carry no runtime level multiplier** — they are authored **tier + baseline** (C0): mob JSON = `tier` (normal/elite/boss, a pure label) + `curveLevel` (position on f; zone number = curve position) + `factors.baseMaxHealth`; the loader derives `maxHealth = base × f(curveLevel)` and a def `PowerScale = f(curveLevel)` applied to the mob's (baseline-authored) skill HP values at cast time — raw `factors.maxHealth` **hard-fails at load**, so a growth change is a one-knob re-derivation. Role + curve rationale: Philosophy A / same-tier scale-invariant (GDD §5 + `plan-sim-harness.md` §5), tuned by the shipped **simulation harness** (TTK/TTD, 1-vs-N matrix, kills/hour chain per level bracket)

**Deliberately open / deferred:**
- Mob heal / heal_aura target flags: **deliberately later**, with roadmap item 7 (mob support behaviors); the two known limitations are documented in `plan-skill-system.md` (Effect Types → heal_aura)
- Sticky targeting against target flicker with `nearest` — only when it actually bothers in practice
- ~~Whether effect behavior eventually becomes authorable as expressions/scripts instead of Go effect types~~ — **decided 2026-07-07: effect semantics stay Go effect types, no scripting engine for effects; a constrained expression layer stays parked behind an explicit trigger.** Rationale + the primitive-first growth plan: `docs/archive/plan-effect-foundations.md` (archived options record: `docs/archive/archive-scripting-options.md`)

### 4.2 Line-of-Sight — CUT (decision record)

**Decided 2026-07-10: aura line-of-sight is cut.** Auras pass through walls
and every environment object; walls and props remain **movement** blockers
(that mechanic stays fully intact — `blocksMovement`, the `InvAABB`
boundary). Full decision prep + rationale:
`archive-combat-pacing-recovery.md` §2.C. The load-bearing points:

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
- **Status: built (Phase 8.2)** — hotkeys + ability bar, `cooldown_activations` on `Input`, `CdTicks` bookkeeping in the SkillSystem, burst VFX through the status pipeline. Self-healing runs through a cooldown (not through heal auras). Details: `docs/archive/plan-skill-system.md` → Phase 8.2.

### 4.6 Zones & Zone Chat

- Players are in exactly one zone
- Auras / visibility only within the zone
- Zone chat: one channel per zone (broadcast filtered by sender zone — decided, roadmap item 8); global chat stays until zones exist
- Zone transitions (e.g. the tunnel between zone 1 and 2) — how?
- **Named sub-regions (known-future, build nothing now):** three later features — per-area music (forest vs. cave *within* one zone), darkness patches (caves, the zone-1→2 tunnel, see 4.2), and per-area terrain/biome — all reduce to the same primitive: *a named region inside a zone carrying its own properties*. Today `zone.json` is `bounds` / `props` / `spawns` only. **Decision (2026-07-09):** don't build regions yet, but don't design them out — world-foundation chunk 6 authors terrain as the zone's **default** floor (not "the zone has *exactly one* floor"), and the loader's `DisallowUnknownFields` makes a later `regions: [...]` a one-line additive change. One shared region primitive then underpins music + darkness + terrain.
  **2026-08-23:** this is now the recorded goal - `plan-release-map.md` D6 / §8
  (one contiguous map, zones as coordinate regions), including the surveyed
  touch points (Go zone struct + editor serializer whitelist) and the day-cycle
  filter landmine per-zone tint must avoid.

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

First sketch; the authoritative plans are `docs/archive/plan-skill-system.md` (skill system) and `docs/roadmap.md` (rest — current progress + the **decided execution order** live there, not duplicated here). **Build order decided 2026-07-08: systems-first, content-last** — see roadmap.md "Execution order". Re-sequenced to match (numbering below now reflects the build order, not the roadmap item numbers):

1. ✅ **Repo setup & onboarding** — Berryhunter running locally, Claude Code set up, build pipeline understood
2. ✅ **Skill-system migration** — Phases 1–9 complete (tick engine, all three categories, leveling, unlocks, combinations)
3. ✅ **Survival removal + resource unification** — roadmap items 1+2 (Block 2)
4. ✅ **Aura targeting: selector + target count** — roadmap item 11, incl. hit VFX; then absolute HP + resistances/tags/variance (item 11 Phases 1–3)
5. ✅ **World foundation** — roadmap item 4; in-game editor + `zone.json` loader + rectangular boundary + zone-owned free-form terrain + multi-zone save/select + scaffold zone (`plan-world-zones.md`, 6 chunks) — **COMPLETE + in-game-verified 2026-07-09**
6. ✅ **Mob depth + totems** — roadmap item 7 remainder (patrol archetypes, support mob-heal, **encounter-controller spine + threat table** built early) + effect-foundations Step 3 (spawned-entity/totem lifecycle) — **COMPLETE 2026-07-12** (`plan-mob-depth.md`, 9 chunks)
7. ✅ **Darkness/light + campfires + death & recovery** — roadmap item 5 (~~item 6 cut 2026-07-10~~, §4.2): darkness rendering + `light_aura` effect type + campfires (consumes item-4 map data), plus the 2026-07-10 recovery/death bundle — campfire death-respawn (world campfires only), the death state (corpses + respawn button), combat-gating player passive regen — **COMPLETE 2026-07-13** (`plan-atmosphere-recovery.md`, 4 chunks)
8. ✅ **Skill-vocabulary fill** — effect-foundations Step 4 (shield-as-buff-payload) + cheap effect types (life steal, execute, crit, berserker) — **COMPLETE** (`plan-skill-vocab.md`; crit reworked to a character-driven stat 2026-07-20, `backlog.md` §23)
9. ✅ **Unlock-source systems** — roadmap item 9; world clue-anchor entities + NPC-teaching behavior — **COMPLETE 2026-07-15** (`plan-npc-teaching.md`, 6 chunks; clue anchors deferred, the NPC entity doubles as a lore sign post). Followed by the pre-content **simulation harness** gate — **COMPLETE** (`plan-sim-harness.md`, 4 chunks)
10. ✅ **Initial content pass** — roadmap item 12; first real skill/mob/recipe/boss/zone content + legacy-mob replacement + balance (**the prove-it gate**) — **COMPLETE 2026-07-21** (`plan-content-zones12.md` §13, chunks C0–C8 + intermissions; combat-feel SFX is the one open remnant)
11. ✅ **Rebrand to Aura & Berryhunter cleanup** — module `github.com/RoteRiesenRobbe/aura`, `pkg/aura/`, `aurad` binary, `AuraApi` FlatBuffers namespace — **COMPLETE 2026-07-21** (`plan-rebrand-cleanup.md`, `aa509d95`)
12. ⬜ **Accounts & persistence** — roadmap item 3; anonymous-first (**after** content) + UI polish / avatar (item 8) ← **we are here**
13. ⬜ **Polish & closed alpha** — ops gaps (CI tests, crash isolation, observability): see `docs/research-v1-readiness.md`

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
`docs/archive/archive-session-log.md` + git; per-item debt also lives in the relevant `plan-*.md`.)

- **`-2` `active_aura_slot` deactivate sentinel** is a workaround for FlatBuffers omitting the `-1` default (an explicit `-1` is indistinguishable from an absent field). Decided in Phase 5: it stays. Paired constants: `model.ActiveAuraSlotDeactivate` (Go) / `DEACTIVATE_AURA_SLOT` (InputMessage.ts).
- ⚠️ **`go:embed` testing gotcha:** patterns don't include subdirectories (`*.json **/*.json`!), and disk-based registry tests can't catch embed gaps — pinned by `pkg/api/skills/skills_test.go`. Before manual tests: `pkill aurad`, rebuild, and check the boot log (`Loaded skill definitions count=…`) — a stale server process silently masks new behavior.
- **`backend/pkg/aura/net/net_test.go`** is a manual `ListenAndServe` WebSocket smoke script (not a real test); it starts with `t.Skip` so the full suite runs. Remove the skip to run it explicitly.
- Frontend FlatBuffers toolchain is on **flatc v24.3.25**.
- ⚠️ **The client mirrors several Go wire enums by hand, and nothing checks the
  mirror.** `Skills.ts`'s `ActivationRejectionMessages` is keyed by **bare
  numbers** against `model.ActivationRejection`'s `iota`; `EffectPips.ts`'s
  `AppliedEffectBit` and `AuraRings.ts`'s category bits mirror
  `skills/applied_effects.go` and `skills/aura_category.go`. The Go sides are
  compile- or test-enforced exhaustive; the mirrors are not, so **appending is
  safe and renumbering silently shows the wrong thing**. Before touching a wire
  enum, grep the client for its mirror. Inventory and the fix options:
  `backlog.md` §35 tier 5.

**Closed since (kept as pointers, don't re-open):** player passive regen *is* combat-gated
now (`model/player/update.go` → `if p.InCombat()`, step 3 / `plan-atmosphere-recovery.md`);
the frontend `Skills.ts` id→name/maxLevel/category hand-sync maps are **gone** — the client
fetches the server's parsed registry via `GET /skills` (`plan-ui-polish.md` Chunk 1), so skill
metadata no longer needs manual syncing. ⚑ **That last one is narrower than it reads:** the
catalog killed the id→metadata maps, but `ActivationRejectionMessages` in the *same file* is
still hand-synced (see the enum-mirror bullet above).

**Code-health debt** (dead-code prunes, registration matrix, per-file findings) is tracked in
`backlog.md` §24–§28 with the current state in CLAUDE.md's Status banner — not duplicated here.

For the live-operations perspective (CI, observability, crash story) see `docs/research-v1-readiness.md`; for the remaining content-pipeline debt (`go:embed` rebuild loop) `docs/research-content-pipeline.md`.
