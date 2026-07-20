# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- Pointer only. REPLACE these two lines (don't append) when the last/next step changes.
     Full execution order + per-item status: docs/roadmap.md. Doc index: docs/README.md.
     Plans and records live in the plan docs. -->

- **Last completed:** **Session ⑥ (C8 XP pass v1 + wanderer NPCs + playtest triage) DONE 2026-07-20, PO-driven in-session + PO-verified in-game ("feels much better") — committed `e72a15e0` (XP pass) + `86f4f5d2` (NPCs + wolf range); full ledger: `plan-content-zones12.md` §13 C8 Session-⑥ banner.** **(1) XP pass v1** (21 mob JSONs, conf curve untouched — base 300 × 1.2 stays, base is numerals-only): rule = band XP/h target `3600 × 1.15^(cL−1)` model-time ÷ measured kph (chain battery, best viable stance, 0.5× kite discount) → danger correlates with reward; pace gently rising (~5 min/level early anchor, ~3.3× at 30); elite = 3× band-normal median; **turnip 30 → L2 in ~10 turnips** (L1→2 turnip-only by design). Headline: Wolf 25→70, DireWolf 60→150, Spider 45→100, EliteBandit 170→330, Troll 220→435, Mammoth 90→**45** (kiteable elite — kph-derived, anti-superfarm); front anti-faucet 5/15 + prey + Warlord 600 + proving unchanged; future cL8-17 farm-band mobs inherit the rule. **Deferred (PO "leave the turnips for now"):** low-band cheese/AFK brake (field ~8.5k XP/h model-time, competitive to ~cL6; gray-band rule vs field-exhaust analyzed in banner) → farm-band plan. **(2) Wanderer + Traveller NPC types** (EntityType **63/64**, full 5-file wire path, reusable via zone `entityType`) + placed RoadWarner (kobold sign) / LamplessTraveller (dark-tunnel mouth) — PO adjusts placement/lore in editor; Pickaxe teacher already existed (Miner). NPCs 13→**15**. **(3) WolfBite radius 1.2→1.0** (symmetric with player base aura; shared Wolf+DireWolf — re-feel Session ⑦). **(4) Triage:** wolves-at-bramble = pinned chase-camping, NOT attacking (double faction gate: aggro mask + mayHarm) — PO re-ruled **keep camping as pinned**; spiders won't attack boulders (same gates); PO hand-authors campfires (kobold camp + top tunnel) + density (fewer field wolves, forest up, road thin); reload-loses-character → **reconnect-token plan chunk later** (localStorage token + ~10-15 min server parking [PLACEHOLDER], typed code declined). **Verified:** suite green ×2, boot `77 skills/13 factions/44 mobs/10 recipes/805 props/346 spawns/2 campfires/15 npcs, 0 panics`, webpack bundle serves new classes, PO in-game.
<!-- Prior chunks: one-line pointers only. FULL ledgers live in the plan-doc §13 banners
     (docs/plan-content-zones12.md) and the referenced commits — never re-expand these here.
     See the `chunk-wrap` skill for the collapse rule. -->
- **Prior (full ledgers → `plan-content-zones12.md` §13 / `plan-intermission-triage.md` + commits):**
  - **Session ⑤ C8** — DONE + PO-walkthrough 2026-07-20, `1ef67776`+`ac44bae5`+`d5263355` (**drop table FINAL + §11 no-pity FINAL**, boss-rare pattern Warlord Rejuvenation .10, WildAura→DireWolf .06; NPC body 0.35 / sensor 1.5 + Farmer EntityType 62; aura-swap-active-slot fix, Vanguard shield ~2.7 HP/s, regen taper 1.0→0.4; campfire 0.12 + heal cost 10−2/level FINAL). Parallel session `e2643cdb` (mob pathfinding detour + camp watchdog). §13 C8 Session-⑤ banner.
  - **Session ④ C8 part 1** — DONE + PO-approved 2026-07-20, `03a377b1` (**milestone table FINAL Heal L3/Haste L7**; HealAura→2nd Hermit @L2, Recover→DireBear drop + self-only; density pass 2 rounds → 805 props/346 spawns + Z1 road reroute, mob-on-screen standard; Lantern Post post-v1, Stag dropless, Lacerate not adopted; map editor idea → backlog §22). §13 C8 Session-④ banner.
  - **Session ③ C8 part 1 (sim-side)** — DONE + PO-read 2026-07-19, commits `4e412ebf`…`c55838e0` (dot-aura sim support, kills/hour roster battery, **regen 1%/s FINAL + downtime 10 s**, guardrail asserts `cmd/simharness/guardrail_test.go`, §A ceiling ACCEPTED + `TestGuardrails_CeilingOrdering`, Step-0 Warbanner = Vanguard 5 + Spearhead 5 + CallForAid 3). §13 C8 Session-③ banner.
  - **Intermission Session ②** pre-C8 lifts + content — DONE + PO-verified in-game 2026-07-19, `dad7c42d` (heal cost-curve, campfire %-heal, companion jitter; item-20 placements incl. new Troll + BanditPyromancer + Dire variants ⇒ Wildfire/Suppression/Barrier craftable; skills 132–133, pin 75→**77**). `plan-intermission-triage.md` §Session ②.
  - **Intermission Session ①** fixes mini-chunk — DONE + PO-verified 2026-07-19, `2c155a68` (items 19/1/14/16/5/11/21-partial/3-9 + code niceties; empty-spawn + Farmer-taught Harvest, startingSpawn flag, heal self-kill clamp, respawn full-HP, portrait rotation freeze, NPC entityType validator; GDD §11 sacrifice→v1). `plan-intermission-triage.md` §Session ①.
  - **C7** Recipe net — DONE + PO-verified 2026-07-18, `53868697` (zero-lift; 10 recipes ids 1–10, result skills 52–59, capstone Warbanner, registry pin **75**/recipe pin **10**; overshields cut ~⅓; Wildfire/Suppression/Barrier ingredients unplaced → C8). §13 C7.
  - **C6** Ork World Boss (§B) — DONE + PO-verified 2026-07-18, `5961b29a` (encounter `warlord.go`; lifts: ANNOUNCE alert/broadcast + AlertBanner, zone `anchors` schema+editor; Call for Aid id 51; mobs 35–38, pin **67**). §13 C6.
  - **C5** The front + Front-Aura — DONE + PO-verified 2026-07-18, `96cea32f` (lift 6 `friendlyToPlayers`; Vanguard 50 @L20 FrontCaptain = §A power outlier; human_army/orc factions, mobs 32–34, pin **62**; west arena = C6 canvas). §13 C5.
  - **C4** Z2 village + bandit gate — DONE + PO-verified 2026-07-18, `4d5406a4` (zero-lift; bandit faction, mobs 27–31 incl. first crit pair + first shield_aura, DamageBurst 49, GateWall, seam ridge, pin **58**). §13 C4.
  - **Map condense ×0.6 + post-C3 polish** — DONE + PO-verified 2026-07-18, `d945d948` (bounds 240×120→144×72, all coords/darkness ×0.6, roads to Z2, kobold speed, Antivenom category fix ids 47/48). Client render-interp crawl on large jumps → **backlog §20**.
  - **C3** Kobold hideout + Dark Tunnel — DONE + PO-verified 2026-07-18, `afd57e68` (zero-lift; kobold/spider factions, mobs 21–26, Antivenom 47 + Pickaxe 48, first `poison` dot, pin **52**). §13 C3.
  - **C2** wildlife + dark forest (Parts 1+2) — DONE + PO-verified 2026-07-17, `7eb2d266`+`2eb44528` (lift 2 passive light `LightRadius()`; Torch 46, Bramble solid mob, SPEED cheat, TurnipPull→Harvest rename, empty-spawn aura, ×2 density pass, pin **45**). §13 C2.
  - **C1** Z1 farm start beat — DONE + PO-verified 2026-07-17, `a494bc26` (rect-prop lift, gated damage tags). §13 C1. Step 5 (unlock sources) + Step 4 (skill vocab) complete + committed.
- **Next:** **Session ⑦ — C8 close-out + Z2/farm-band planning — new chat** per `plan-content-zones12.md` §13 C8 Session-⑥ banner: **(a) walkthrough remainder** — Step-0 Warbanner sequence (warlord journey pops trio NOT Warbanner; maxed Spearhead unlocks it), remaining teacher gates (Immolation 6 / Totem 5 / Revive 6; HealAura Hermit 2 + Farmer read OK Session ⑤), **Vanguard/regen re-feel post-nerf**, Troll cL11 / Pyromancer cL6 / Dire cL6-7 tier feel, **wolf/DireWolf re-feel post WolfBite 1.0 + XP-table re-feel + L1-2 misery re-judge after PO density edits**; **(b) Z2-hardening / cL8-17 farm-band PLAN chunk** (PO 2026-07-20: plan-first, own session — Z2 difficulty+density "up by a lot" + dedicated high-tier farm content; design target = the guardrail-flagged cL8-17 normals gap; execution in a later session; **owns the deferred low-band cheese/AFK-brake decision + new mobs inherit the Session-⑥ XP rule**). C8 walkthrough close-out is the last §13 item; the farm band becomes a new chunk. PO hand-authoring pending in editor: campfires (kobold camp + top tunnel), turnip-field wolf thinning, forest density, road corridor. **Reconnect-token persistence** (reload loses character) = new small plan-first chunk when PO calls it. **Every C1+ mob MUST be authored tier + baseline** (raw `maxHealth` hard-fails; manual §1); combat mobs need NO harvest entries (gated damage tags — manual §1), but **gate obstacles must opt in**.
- **Deferred (per triage §Execution sequence):** **Post-C8 "combat readability"** — items **7** (category ring colors) + **15** (tier frame ring), two append-only Mob-table wire bytes. **Post-C8 tooling:** standalone browser map editor (**backlog §22**, seeded from the Session-④ density-pass renderer/generator in that session's scratchpad). **Step-7 rebrand** — items **22** (bare-name renames) + **12** (`legacy:true` tags). **Persistence step** — item **10** sacrifice loop (first consumer; GDD §11 amendment landed Session ①). **Anytime/annoying:** item **21** full `null.split` repro session. Placeholder values still open: Troll cL11 / Pyromancer cL6 / Dire cL6-7 tiers, teacher gates Immolation 6 / Totem 5 / Revive 6 (walkthrough remainder), regen-taper floor 0.4, Vanguard shield 4+1/90t, WolfBite radius 1.0, **XP table v1** (rule `3600 × 1.15^(cL−1)` ÷ kph, Session ⑥ — PO likes the feel, not declared FINAL; all re-feel Session ⑦). Standing locks: growth 1.12 × maxLevel 30 (≈27×, band ≈ +5, lower-first); **regen 0.00033 ≈ 1%/s FINAL × level taper 1.0→0.4** (C8 settlements 2026-07-19 + 2026-07-20); **drop table FINAL + §11 no-pity FINAL + campfire `0.12` FINAL + heal cost `10 −2/level` FINAL** (C8 Session ⑤ 2026-07-20); **milestone table FINAL: Heal L3 / Haste L7** (C8 Session ④ 2026-07-20); **density standard: mob visible on every ⅔-screen (17×9.5 u) window** (C8 Session ④); tier frame: elite ≤ 25% facetank / boss kills the bot / normal = per-mob texture + Z1/Z2 band-check (front exempt); **downtime 10 s** + chain 20; guardrail asserts LANDED (`cmd/simharness/guardrail_test.go`, deterministic). Dev cheats: GOD, WARP <x·120> <y·120>, SPEED [factor|off], XP, SKILL <name>, ANNOUNCE <text>, THREAT [id]. `make build` runs `cp-defs` which reverts embedded `backend/pkg/api/` from source `api/`; boot `-content ../api` for content iteration (schema/Go changes still need the rebuild).

## Development Principles

These principles apply to all code written or modified in this project.

### KISS — Keep It Simple, Stupid

Prefer the simplest solution that works. Avoid clever abstractions, unnecessary
indirection, or premature generalization. If a function does one clear thing in
20 lines, that's better than a "flexible" version in 80. When proposing
architecture, start with the simplest design that satisfies the actual
requirements — not the imagined future ones.

### DRY — Don't Repeat Yourself

Knowledge should have a single source of truth. If the same logic, constant, or
configuration appears in multiple places, extract it. Watch for subtler
duplication: parallel switch statements, repeated validation patterns, copy-paste
between similar systems. But: don't deduplicate things that just *look* similar
— two pieces of code that happen to be identical today but represent different
concepts should stay separate.

### YAGNI — You Aren't Gonna Need It

Don't build for hypothetical future requirements. No "we might need this later"
parameters, configuration options, or abstraction layers. Add complexity only
when there is a concrete, present need. This applies especially to the aura
system: build what the current design requires, not what every possible future
combination might require.

### TDD — Test-Driven Development

For new features and bug fixes:

1. Write a failing test that captures the desired behavior
2. Write the minimum code to make it pass
3. Refactor if needed, keeping tests green

This applies to backend Go code (`go test ./...`) primarily. For exploratory
prototype work or UI tweaks, strict TDD may be relaxed — but any non-trivial
game logic (aura calculations, combination resolution, damage application)
should have tests before or alongside the implementation.

When fixing a bug: first write a test that reproduces it, then fix.

## Project Overview

**Berryhunter** (repo name: aurahunter) is a multiplayer browser survival game. Players gather resources, craft items, manage vitals (health, satiety, temperature), and fight mobs. The repo has three main parts:

- `backend/` — Go game server (`berryhunterd`)
- `frontend/` — TypeScript/webpack browser client using PixiJS
- `api/` — Shared FlatBuffers schemas and JSON item/mob definitions

## Build & Run

### Backend (Go ≥ 1.22)

```bash
# One-time: copy config
cp backend/conf.local-windows.json backend/conf.json   # Windows
# or use backend/conf.default.json as a template

# Build
make -C backend build          # produces backend/berryhunterd

# Run (dev mode serves static frontend too)
cd backend && ./berryhunterd -dev

# Run without build (go run)
make -C backend dev
```

> **Gotcha:** after backend logic changes, rebuild the binary with `make -C backend build`.
> `go build ./...` compiles/type-checks packages but does **not** refresh `./berryhunterd`,
> so a running `-dev` server keeps executing stale code.

> **Content iteration:** `./berryhunterd -dev -content ../api` loads items/mobs/skills/recipes
> from the repo `api/` directory directly instead of the embedded copies — JSON edits then skip
> both `cp-defs` and the rebuild (a server restart still applies them). The boot log prints the
> content source (`Loading content source=…`). Production/default stays embedded.

`backend/conf.json` controls server port (default `2000`), day/night cycle durations, and all game-balance tuning values. `backend/tokens.list` must exist with at least one token (e.g. `plz`) for in-game commands to work.

### Frontend (Node 20 / npm 10)

```bash
# Dev server (webpack HMR on port 2001) — no Docker
cd frontend && npm install && npm run start

# Production build
npm run build                  # output goes to frontend/dist/

# Docker-based alternatives (if local Node unavailable)
make -C frontend dev           # dev server via Docker
make -C frontend build         # prod build via Docker
```

### Opening the game

```
http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game
```

Optional dev query params:
- `&develop` — opens the draggable dev panel
- `&start-cmds=GOD,GIVE BronzeTool,...` — runs server commands on spawn

### Backend tests

```bash
cd backend && go test -timeout 60s ./...
```

The full suite runs and passes. (`backend/pkg/berryhunter/net/net_test.go` is a manual `ListenAndServe` smoke script that used to hang the suite; it is now skipped via `t.Skip` — remove the skip to run it explicitly.)

The test runner requires generated files (`go generate ./...`). The Makefile `gen` target runs this automatically before builds.

### Code generation

```bash
# Regenerate Go enumer files and FlatBuffers bindings
make -C backend gen            # runs go generate ./...

# Regenerate FlatBuffers bindings (if .fbs schemas change)
cd api/schema && ./make.sh     # or make.bat on Windows
```

## Architecture

### Backend (ECS-based game loop)

The game server uses an **Entity-Component-System** architecture via `github.com/EngoEngine/ecs`.

- `backend/cmd/berryhunterd/` — entrypoint; wires config, game, HTTP server
- `backend/pkg/berryhunter/core/` — `game.go` constructs the ECS world and registers all systems; `Loop()` ticks at ~30 FPS (33 ms/tick)
- `backend/pkg/berryhunter/sys/` — ECS systems: physics, mob AI, day/night cycle, decay, respawn, scoreboard, status effects, heater
- `backend/pkg/berryhunter/model/` — interfaces and concrete types for entities (player, mob, resource, placeable, spectator)
- `backend/pkg/berryhunter/items/` — item and mob definitions loaded from `api/items/` and `api/mobs/` JSON files at startup
- `backend/pkg/berryhunter/codec/` — FlatBuffers encode/decode for the WebSocket protocol
- `backend/pkg/berryhunter/phy/` — 2D physics (circle/AABB collision, spatial hashing)

**Adding a new system:** implement `ecs.System`, register it in `core/game.go:NewGameWith()`, and add entity registration cases in the relevant `addXxx()` methods.

**Adding a new entity type:** implement the appropriate `model.*Entity` interface, update `game.AddEntity()`, and register in all relevant systems.

### Communication Protocol (FlatBuffers over WebSocket)

Schemas live in `api/schema/`:
- `client.fbs` — client→server: `Input`, `Join`, `Cheat`, `ChatMessage`
- `server.fbs` — server→client: `GameState`, `Welcome`, `Scoreboard`, `Obituary`, etc.
- `common.fbs` — shared types (`Vec2f`, `ActionType`, `AuraType`)

After editing `.fbs` files, regenerate bindings for both backend and frontend.

### Game Configuration (conf.json)

All numerical tuning lives in `backend/conf.json` (or `conf.default.json` for reference). The `game.player` block controls movement speed, aura radii, vital-sign drain/gain rates, and level-up scaling. Changes take effect on restart.

### Item / Mob Data (JSON)

`api/items/` and `api/mobs/` contain JSON definitions. The `make -C backend cp-defs` target copies them into `backend/pkg/api/` so the Go build embeds them. Run this (or just `make -C backend build`) after editing any JSON definition.

### Frontend

The frontend is structured as feature modules under `frontend/src/features/`:
- `backend/` — WebSocket connection, FlatBuffers deserialization, entity snapshot management
- `core/` — game loop, entity manager
- `player/`, `vital-signs/` — local player state and HUD
- `game-objects/` — rendering entities (resources, mobs, placeables) via PixiJS
- `input-system/`, `controls/` — keyboard/mouse/touch input
- `internal-tools/` — dev panel, console, overlay tester (only active with `?develop`)

**HUD event handling:** Use `pointerdown` (not `click`) for all interactive HUD panels. `MouseManager` (`input-system/logic/mouse/MouseManager.ts`) registers a `mousedown` listener on `document.documentElement` with `event.preventDefault()`, which suppresses the synthetic `click` event. `pointerdown` fires before this and is unaffected. `click` listeners on HUD panels silently never fire — this is not obvious from the source.

Webpack configs: `webpack.common.js` (shared), `webpack.dev.js` (HMR, port 2001), `webpack.prod.js` (minified output).

## Aurahunter Project Context

This fork is being transformed into **"Aura"** — a top-down MMO. The Berryhunter
survival systems (vitals, crafting, temperature, hunger) will be removed or
heavily reduced. The core loop revolves around the aura system described below.

The codebase still says "Berryhunter" in many places. That is expected. Do not
rename or refactor naming proactively — focus on building new systems on top of
the existing foundation. The full rename + legacy cleanup is **scheduled, not
abandoned**: execution-order step 7 (after the content pass), per
`docs/plan-rebrand-cleanup.md` — until then this rule stays in force.

### Vision

**Tagline:** MMO lite — resource vs. resource, as simplified as possible.

**Core principle:** Players and NPCs interact exclusively through **auras** —
circular effect fields that automatically apply to anything in range. No
targeting, no direct attacks. Positioning and cooldown timing are the only
skill expressions.

**References:** WoW Classic (progression, environmental storytelling), Gothic
1+2 (organic worldbuilding), Hotline Miami / Monaco / Rimworld (top-down art
direction — not isometric, not pixel art).

**Platform:** Browser-based.

### Core Loop

1. Player moves through a persistent shared open world
2. Encounters mobs / other players — own aura ticks automatically on anything in range
3. Damage, healing, buffs emerge from aura overlap; cooldown abilities modify temporarily
4. Combat ends → XP for all participants → possibly aura unlock
5. Level up → skill points → strengthen existing auras or unlock combinations
6. Explore world → find hints → unlock new auras / passives / cooldowns
7. Rearrange slots, adjust build, tackle harder content

### The Three Skill Categories

Players collect, level, and combine three categories of skills:

- **Active auras** — toggleable, have visible ranges in-world. **Exactly one
  active aura is on at a time**; the aura slots are a loadout (several equipped,
  one active, switchable mid-fight), not multiple simultaneously-active auras.
  Build variety comes from slot loadout, combination unlocks, and switch timing.
- **Passives** — passive bonuses, always on (these DO run in parallel)
- **Cooldowns** — active abilities with cooldown timers (triggered individually)

Mobs use the same aura system as players.

### The Resource

Every player and every NPC has exactly **one resource**. It represents HP, mana,
and everything else at once. Drops to 0 → death.

### Aura Combinations

- Combination unlocks trigger when specific skills reach specific levels
- Recipes are **curated, not algorithmic** and **not documented anywhere in-game**
  — the community discovers and shares them
- Combinations can cross categories (aura + passive + cooldown is valid)
- The result of a combination can itself be an ingredient for higher combinations
- **Variant auras** exist as rare world drops and are also combinable
- **Damage types** exist for mob resistances and build identity (fire, ice, physical, etc. — specifics TBD)

The combination system must technically support arbitrary combinations from day
one. Content (specific recipes) is added manually over time.

### Spellbook & Unlocks

The **spellbook** is the collection of all auras, passives, and cooldowns a
player has discovered. Five ways to obtain new entries:

1. **Milestone unlocks** — guaranteed at certain levels
2. **Monster kill unlocks** — certain mobs drop auras/passives on death
3. **World exploration** — clue anchor points throughout zones
4. **NPC teaching** — peaceful NPCs teach a specific aura on approach, often
   tied to nearby harvest-mobs that only that aura can damage (soft "profession"
   identity without a class system)
5. **Meta-progression** — sacrificing a max-level character unlocks new base auras account-wide

### World Design

Persistent shared open world, multiple connected zones for different level
ranges. Designed and built by hand — no procedural generation. Environmental
storytelling is central.

**Open-world dungeons** — no instances. WoW-Classic-style caves in the open world.

**Darkness & light** — certain areas (caves, tunnels between zones) are dark.
The tunnel between zone 1 and zone 2 serves as a natural tutorial for the role
concept (light aura forces a trade-off between light and damage; players can
support each other).

### Multiplayer

- Persistent shared world — everything visible, everything shared
- No formal groups in v1 — all combat participants receive XP
- No PvP initially (earliest 5 years out)
- **Players filling roles for each other is essential, not optional**, for all
  larger challenges (light support in tunnels, heal support at bosses, etc.)
- No griefing possible by design

### Numbers Are ALWAYS Placeholders

Every concrete number — max level, skill points at max, slot count, aura max
level, respec cost, drop rates, combination requirements, damage values, aura
radii — is a **placeholder** until explicitly marked as final.

Treat such numbers as examples for thinking, never as decisions made. When
numbers are relevant for an answer, ask first or propose concrete values for
discussion — never silently adopt them as set.

### Scope v1.0 (Must Have)

Accounts, aura system (base auras, cooldowns, first combinations), spellbook
with milestone and monster unlocks, progression (level, skill system, slots),
persistent world, 2–3 zones, mob types (normal/elite/boss), UI (resource bar,
XP bar, ability bar, aura panel, minimap, zone chat), line-of-sight for auras,
campfire system.

### Not in v1.0

PvP, formal group system, economy, mobile, endgame raid events, character sacrifice.

---

## Working Style

Work happens in two kinds of sessions:

- **Planning sessions** — a work item (an execution-order step) is designed plan-first and
  written up as a `docs/plan-*.md` doc: what changes and why, chunk breakdown, decisions,
  open questions, test strategy. No production code is written in a planning session.
- **Execution sessions** — a single chunk from an approved plan doc is implemented in its
  own chat, following that plan. Reference the plan doc + the chunk being implemented in
  explanations and commit messages.

Across both:

- **Plan before code, and pause between steps.** State the plan in plain text first for any
  non-trivial change (new file, new system, refactor, multi-file edit); don't silently chain
  multiple chunks in one session.
- **Propose options for design decisions** — don't commit to a direction unilaterally.
- **Never commit (or branch/push) autonomously** — only when explicitly asked.
- Treat existing Berryhunter physics, collision, and the WebSocket/FlatBuffers protocol as
  stable foundations. Extend, don't rewrite. Don't rename Berryhunter→Aura proactively — that
  is scheduled (execution-order step 7).
- When in doubt about game design intent, ask — don't infer from the codebase.

## Sanity checks after every step

Before declaring a step done:
- Run `go build ./...` from `backend/`
- Run the relevant `go test` for affected packages
- For anything with a runtime surface, verify in-game (plan docs record per-chunk in-game checklists)
- Report the output — don't claim "done" without these checks.
