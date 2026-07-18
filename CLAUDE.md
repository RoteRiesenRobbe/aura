# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- Pointer only. REPLACE these two lines (don't append) when the last/next step changes.
     Full execution order + per-item status: docs/roadmap.md. Doc index: docs/README.md.
     Plans and records live in the plan docs. -->

- **Last completed:** **Step-6 C5 (the front + Front-Aura) DONE (2026-07-18), full chunk in one session — PO-VERIFIED IN-GAME 2026-07-18, committed `96cea32f`** — per `plan-content-zones12.md` §13 C5 (banner there records the full ledger). **PO rulings:** Front-Aura = **Vanguard** (Damage+Heal+Shield: full DamageAura ×2 targets + free HealAura + RallyDrum-class shield allies+self — the §A sanctioned power outlier, GDD §4/§5 amended); **anchor L20** ("journey's final step in v1" — re-banded the front: soldier cL18 / orc cL20, closes the §11 anchor item); sim presets = derived player damage-aura presets. **§9 lift 6 landed (TDD):** faction `friendlyToPlayers` → `model.PlayerFriendly` → `mayHarm` skips friendly targets for aligned casters (players + owned summons). Content: `human_army`+`orc` factions; mobs 32–34 (ArmySoldier XP 0 / Orc elite XP 15 / SpikeBarricade brazier, players-only by faction choice); skills 125–127 + Vanguard 50; pin 58→62; EntityTypes +4. Zone: checkpoint opened (middle C4 cap GateWall removed — the one non-append change), soldier line vs orc line (unattended war), 9 barricades + funnel, **west arena x 23–33 kept empty = C6 boss canvas**, S-exit teaser, FrontCaptain @20 real TooLowLine → 615 props / 185 spawns / 10 npcs (flood-fill verified). **Verified:** suite+race green; boot 62/12/34/615/185/10; browser smoke — gate holds at L1 / teaches at cap, Vanguard equips+activates (self-shield visible), war fights unattended, 0 client errors runs 2–3. **Watch item recurred:** the 1st-run triple `null.split` pageerror (C4 item) — once on first run after fresh build, unreproducible with stacks armed; still unlocated. PO in-game pass 2026-07-18: passed (front feel, checkpoint + S exit, soldier immunity, Vanguard).
- **Prior:** **Step-6 C4 (Z2 village + bandit gate — the group path) DONE (2026-07-18), full chunk in one session — PO-VERIFIED IN-GAME 2026-07-18 (full pass: village → gates → camp → horde), committed `4d5406a4`** — per `plan-content-zones12.md` §13 C4 (banner there records the full ledger). Zero code lifts — content + pins (+ the routine EntityType 5-file path). **PO rulings:** healer = heal_aura; bandit-ranged drop stays empty (§11); Damage-Burst = new skill 49 physical+bleed; Taunt carrier = drummer horde-only @1.0; village healer lore-only (purpose §11-OPEN); full Z2 density pass. **Content:** `bandit` faction; mobs 27–31 (EliteBandit = first authored crit pair; RallyDrummer = first authored shield_aura, allies-only); mob skills 120–124; GateWall square rect prop; NPCs CityGuard + VillageHealer; zone append-only via deterministic generator → 607 props / 161 spawns / 33 dark / 9 npcs / 2 campfires (village fire = 2nd respawn anchor); **seam ridge** makes tunnel + horde road the only Z1→Z2 crossings (flood-fill-verified both ways); NE dark forest lane maze + camp; south front strip left empty (C5 canvas). Registry pin 52→58; fixed pre-existing Skills.ts `SkillMaxLevels` gap (47/48). **Verified:** suite + race green; boot 58 skills/10 factions/31 mobs/607/161/9; browser smoke 0 client errors — gate holds at-level (healer out-heals L1) + trivializes at L30, Taunt drop landed in the spellbook. Watch item: one unreproduced 1st-run `null.split` pageerror (4 later runs clean; not seen in the PO pass either).
- **Prior:** **Map condense ×0.6 + post-C3 polish (2026-07-18) DONE + PO-VERIFIED (PO played all content in order — this also closed the C3 in-game pass)** — PO: map too big to hand-fill. All `world.json` coordinates + bounds (240×120 → 144×72) + darkness radii scaled ×0.6; prop/NPC/gameplay radii and walk speed unchanged (PO: no speed bump). Flood-fill connectivity verified all 121 spawns / 7 NPCs / POIs reachable; one sealed wolf-den pocket reopened (trees 33/35); 2 empty forest pockets left as impassable thicket. **Same-day PO feedback pass:** (1) road network per PO design — floating woods diagonal deleted; east road extended from the village past the kobold ring (south bow y≈27.5) to x≈+20 toward Z2/City Gates (C4 continues it); new camp→tunnel road from the ring mouth NW past KoboldSign + TunnelSign into the Miner road; village N-S road re-threaded between the two houses (was under the east house) + jointed to the cross (terrain 133→209, seeded scatter matching sand style, hard-prop avoidance); (2) turnip field shifted 2.6 south out of the road, shape intact; (3) kobold speed 0.65→0.6 / ranged 0.6→0.55 (PO: generally slower, not flee-only); (4) Antivenom spellbook category — frontend `SkillCategories` map was missing ids 47/48 (unknown→aura default); added 47 passive + 48 aura; server JSON was already correct. **PO fixes stuck spawns manually** — scan shortlist: Spider (−29.1,−27.9) + Wolf (−38.1,18) inside trees, Wolf (−37.2,16.8) touching, PoisonPool (10.5,−23.9) / Rockfall (6.96,−28.5) inside boulders (stationary, likely visual-only); camp→tunnel road still owes a PO eyeball. **Verified:** suite green at both commit states, boot 144×72 / 382 props / 121 spawns / 7 npcs, browser walk village→x+21 (road continuous, ring bypass walkable, cross + relocated turnips on-screen). **Known pre-existing client quirk (backlog candidate):** entity render-interpolation + camera follow crawl at ~walk speed after large position jumps — affects WARP and likely **Recall**; server position is instant (physics correct). Docs: content-zone1.md coords, plan §12 bounds note.
- **Prior:** **Step-6 C3 (Kobold hideout + Dark Tunnel — the solo path) DONE (2026-07-17), PO-verified in-game 2026-07-18 (full play-through), committed `afd57e68`** — per `plan-content-zones12.md` §13 C3 (banner there records the full ledger). Zero code lifts — content + pins only. **PO rulings this session:** rockfall gate = own `smash` tag on a **Miner NPC teaching** (new skill **Pickaxe** id 48, gated like Harvest; closes the §11 rockfall-gate item); side-passage secret = **venom-spider nest** (best Antivenom odds). **Content:** factions `kobold`+`spider`; mobs 21–26 (Kobold melee flees@0.25 + ranged with `selector:"all"` uncapped volley, both drop Light@0.08; Spider lifesteal bite / VenomSpider first `poison` dot_aura, Antivenom drops 0.1/0.25; PoisonPool brazier-pattern XP 0; Rockfall bramble-pattern `{"*":0,"smash":1}`); mob skills 115–119; **Antivenom** (47, first resist_passive drop pair) + Pickaxe; NPCs Miner + 2 signposts; EntityTypes Kobold…Miner appended + bindings regenerated; `Boulder` prop (r1.5); zone append-only → 382 props/121 spawns/18 darkAreas/7 npcs (hideout ring (-25,35); tunnel y≈-52 x-40→+32 with walls, lit staging area at the west mouth, 8+1 darkness circles, pools alternating, nest sealed by 2 Rockfalls). Skill-registry pin 45→52; sim presets auto-derive. **Verified:** suite + race green; boot 52 skills/9 factions/382/121/7; headless browser smoke 0 client errors (kobold swarm + volley rings, Miner teaches Pickaxe on approach, tunnel darkness, pool 100→0 HP with XP 0).
- **Prior:** **Step-6 C2 COMPLETE — PART 2 (forest interior) DONE + VERIFIED IN-GAME by PO (2026-07-17)** — per `plan-content-zones12.md` §13 C2 (banner there records the full ledger). **Lift 2 (passive light, TDD):** `skills.SkillComponent.LightRadius()` = max over active-aura light + every equipped passive's light (max not sum; player+mob delegate; wire/frontend untouched). **Content:** Torch (`api/skills/torch.json` id 46, passive light_aura 2.5+0.5/level ≈60% of Light — PO pick: Light keeps the group-support radius) + Skills.ts entries; Hermit NPC deep NW pocket (-110,-46) plain-teaches Torch (PO pick: NO level gate — the zone schema REQUIRES `tooLowLine` on every teaching NPC (`world/zone.go` validate), so Hermit/Dog carry flavor-only lines that never fire); Dog NPC (-80,-30) "Woof", teaches SummonCompanion; Bramble solid mob (`api/mobs/bramble.json` id 20: collisionLayer 99 = PlayerStatic+Action+Viewport+MobStatic / mask 16 = Border-only, opt-in gate resist, XP 0, speed 0; pattern documented manual §1) with 4 spawns sealing the shortcut-corridor mouth at y=-8, ~5 min respawn. Found+fixed: Part 1 never bumped the pinned skill-registry count (suite was red at HEAD; now 45). **Same-session PO directives (all verified in-game):** (1) `SPEED [factor|off]` dev cheat — input-path movement multiplier on top of config×passives (TDD `core/input_test.go`; model.PlayerEntity SetSpeedCheat/SpeedCheatFactor); (2) **TurnipPull → Harvest rename incl. the damage tag** `turnip`→`harvest` (file `api/skills/harvest.json`; turnip+bramble resistances follow; sim soloRegistry + all tests + Skills.ts; docs swept); (3) **fresh spawns no longer auto-activate the start aura** — `initializePlayerSkills` equips+discovers only; client already server-authoritative (-1 = Nothing); `sim/world.go` now calls `SetActiveAura(0)` explicitly → **pins stay byte-identical**; (4) **density pass ≥×2 between POIs** via deterministic seeded scratchpad generator, append-only over the PO-polished JSON: 196→299 props, 52→94 spawns (wildlife 32→74; middle band 27→65 props / 23→45 spawns; forest gap-filled until no >5u pocket outside the Hermit/Dog clearings; predators ≥10u from the farm box, prey-only near the farm; corridor/paths/farm/NPC exclusions held). Verified: full suite + race green, boot 45 skills / 299 props / 94 spawns / 4 npcs, browser smokes (0 client errors; spawn shows Harvest equipped-not-active; held hotkey 1 activates; SPEED ≈×2.5 measured; bramble blocks then Harvest clears + walk-through; Dog/Hermit teachings land in the spellbook), PO in-game pass.
- **Prior:** C2 Part 1 (wildlife + factions + forest block-out) and C1 (Z1 farm start beat, rect-prop lift, gated damage tags) — both DONE + PO-VERIFIED; ledgers live in the `plan-content-zones12.md` §13 C1/C2 banners (C1 committed `a494bc26`, C2 Part 1 `7eb2d266`). Step 5 (unlock sources) + Step 4 (skill vocab) complete + committed.
- **Next:** **Step-6 chunk C6 (Ork World Boss, §B ticket) — execution session (new chat)** per `plan-content-zones12.md` §13 C6: first designed Go encounter script on the spine (phases / adds via `SpawnMob` / invuln gates / reset; ~30 min [PLACEHOLDER] respawn via encounter timers; enrage = in-chunk decision, §9 lift 5 or design without); boss joins the `orc` faction in the reserved west arena (x 23–33 of the front); Boss-Aura kill-drop chance 1.0 (all participants + recent healers); on adoption remove roadmap 9f from v1 scope; session-local completion messaging only. Then C7–C8 in order, one chunk per session. **Every C1+ mob MUST be authored tier + baseline** (raw `maxHealth` hard-fails; manual §1); combat mobs need NO harvest entries (gated damage tags — manual §1), but **gate obstacles must opt in**. Standing locks: growth 1.12 × maxLevel 30 (≈27×, band ≈ +5, lower-first); regen slow ~1%/s, tier placeholders normal ≤ ~50% / elite ≤ ~25% / boss dies; downtime 15 s + chain 20; guardrail asserts land in C8 against real mobs. Dev cheats: GOD, WARP <x·120> <y·120>, SPEED [factor|off], XP, SKILL <name>. `make build` runs `cp-defs` which reverts embedded `backend/pkg/api/` from source `api/`; boot `-content ../api` for content iteration (schema/Go changes still need the rebuild).

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
