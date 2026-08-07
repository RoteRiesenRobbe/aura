# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- HARD CAP: "Last completed" + at most TWO "Prior" entries, each ≤10 lines with a
     ledger pointer. When adding a new entry, move the oldest verbatim to
     docs/archive/status-history.md. FULL per-chunk ledgers live in the plan-*.md
     banners; the sequence lives in roadmap.md "Execution order". Never paste a full
     session banner here — see the `chunk-wrap` skill for the collapse rule. -->

### Recent (cap 3 — older entries: `docs/archive/status-history.md`)

- **⭐ Last completed: GENERIC KILL QUESTS C2 — zone-2 side; THE PLAN IS COMPLETE AND ARCHIVED, planned + built + verified in ONE DAY** ✅ 2026-08-07, headless-verified, `f414b473` — all **nine** quests live, **10 of 14 placed conversants offer a quest**. C2's five: `dire-wolves-at-the-camp` (Shaman, 930 XP) · `bandits-at-the-shrine` (Emberkeeper, 1250 — the first human-target kill quest, ✅ **PO-seen 2026-08-07 and passed**; the GiantSpider fallback stays unused) · `alpha-wolves-at-the-village` (VillageHealer, 1900) · `bears-at-the-walls` (CityGuard, 2300) · `thin-the-orc-line` (FrontCaptain, 5× elite Orc, 4800). The Shaman and CityGuard now hold **giver + wolves-branch foreign turn-in on one root**, proven at the surface. ⛑ **The chunk's headline lesson SUPERSEDES C1's remedy: `Escape` closes the JOURNAL, not just the flight map** — an unconditional Escape-before-`E` (exactly what C1's ledger recommended) nulled every journal read in a full harness run while every panel assert stayed green; quick `KeyJ` toggles reliably (the rAF theory was wrong for J), and a closed journal's hidden DOM retains content, which is what kept the trap invisible. Harnesses now close the map conditionally + self-heal the journal. Verified: pins red→green · full Go suite **0 FAIL** · boot `-content ../api` **13 quests**, 0 WARN/ERROR · **new `c2-kill-quests.mjs` all PASS** (bears walked end to end, pays **exactly 2300, once**) · **`chunkC4-quests.mjs` all PASS** (wolves branch intact on the modified roots) · **`c1-kill-quests.mjs` 20/20** after hardening · residue cleaned. **Schema impact: DB NONE · FlatBuffers NONE · conf NONE · Go production code NONE.** **`plan-generic-kill-quests.md` → `docs/archive/`** — ⭐ **next up remains Ascension C1** (`docs/plan-ascension.md`). A same-day PO wording pass stripped all nine briefs to bare task statements and renamed the two stylized quests id+title (→ `dire-wolves-in-the-forest`, `alpha-wolves-at-the-village`; safe pre-commit, re-verified `c1` 20/20 · `c2` 23/23). ⭐ **The PO walked all nine the same day — "overall everything works and it feels good" (intake round 9)** — and its item 1 shipped immediately (`6de08b74`, with the "Bound and restocked" + flight-map-title texts): **conversant NPCs now plate their name in-world** (name-only, white, no level — catalog `conversant` derived from the authored `interaction` block; DB/wire/conf NONE; `npc-portraits.mjs` rewritten with the change, 4/4 name-only + `c2-mob-level` 7/7). Rounds 9 items 2+3 (font/UI/dialogue polish, journal-over-dialogue overlap) parked for the UI pass. Ledger: `docs/archive/plan-generic-kill-quests.md` §10 · round 9: `docs/plan-playtest-feedback.md` §Intake round 9.
- **Prior: GENERIC KILL QUESTS C1 — zone-1 side; four new kill quests live on four givers** ✅ 2026-08-07, headless-verified, `f414b473` (plan committed `a5a3318c`) — plan + C1 in one day; planning rulings **D1–D4** (all ten proposed givers **minus the Dog** · one-shot, `repeatable` stays unauthored · XP-only at the **L9 half-level rule**, ½ × 300 × 1.2^(L−1)). Shipped: `boars-in-the-field` (Farmer, 6× Boar L2, 180 XP — **the first two-offer giver**) · `dire-wolves-in-the-forest` (Lamplighter, 4× DireWolf L6, 370) · `kobolds-on-the-road` (Wanderer, 8× Kobold L7, 450 — the giver actually *beside* the nest; the species overlap with the-lost-lamp double-credits deliberately) · `spiders-in-the-diggings` (Miner, 6× Spider L11, 930). Every target measured within ~22 u of its giver against the re-placed world, so proximity bought level-appropriateness for free. ⛑ **Flight C3 had silently rotted `chunkC4-quests.mjs`'s traveller leg**: campfire `spawnpoint-4` sits **0.55 u** from the leg's warp point vs the traveller's **0.57**, and since 2026-08-05 `E` at the nearest-fire opens the **flight map** — three of the five world fires stand within ~1 u of a conversant, so conversant harnesses must pick warp points that break the fire tie decisively (venue moved; its `catalog.length === 4` count assert also went red on the fifth quest — by-name now, its own rule 1). Verified: pins extended **red first** then green · full Go suite **0 FAIL** · boot `-content ../api` **8 quests**, 0 WARN/ERROR · **new `c1-kill-quests.mjs` 20/20 PASS** (boars walked end to end — tracker, six real kills, turn-in pays **exactly 180, once**, row seals shut) · **`chunkC4-quests.mjs` all PASS** post-repair · `hrnss_*` residue cleaned. **Schema impact: DB NONE · FlatBuffers NONE · conf NONE · Go production code NONE.** Docs ride-alongs: `manual-content-authoring.md` §6's stale lifetime-thresholds paragraph → N4/D4; `content-npcs.md` roster + quest-roles. ⭐ **Next in this plan: C2, the zone-2 side** (Shaman · Emberkeeper · VillageHealer · CityGuard · FrontCaptain). Ledger: `docs/archive/plan-generic-kill-quests.md` §9.
- **Prior: XP FORMULA C2 — THE FINAL CALIBRATION PASS; THE PLAN AND THE WHOLE MOB/XP CHAIN ARE CLOSED AND ARCHIVED** ✅ 2026-08-06 — one session, seven PO rulings (**D13–D19**), finished with the PO's in-game verdict **"feels much better."** ⭐ The headline: **D8 existed because the shipped formula had collapsed WoW Classic's TWO distances into one** — vanilla's gray boundary truncates its linear taper while it still pays 20–45 % of an at-level kill; restoring that shape (**D13**, `taperStretch 1.15`) cost Go + conf only — no wire, no client, because the client derives only the gray boundary, whose meaning never moved. ⭐ **D14's wide band — tuned to the *recorded* "Δ=−10 must progress" requirement, with the deep-farm inversion measured and avoided — was falsified by twenty minutes of real play the same day (D18)**: the PO's in-game boundary ("at 12, not even a level-6 mob") is WoW's gray level to the digit, so the band is now WoW's own **`5 + ⌊P/10⌋`**. Final constants (all still tuning-open): base **20** × 1.2 → ~**15 kills/level** (D19) · tiers 1 / **2.5** / 5 (D17) · growth flat (D15) · **the kite list is EMPTY** (**D16** retires the Session-⑥ rule as applied content — OrcGrunt's 258k XP/h front and the fleeing Stag stand as *accepted* outliers; `factors.xpFactor` remains the per-species knob). ⚑ Watch: inside green the *absolute* award now rises as you outlevel a rung until the cliff (kills-per-level still fades monotonically, §12.2) · per-species feel tuning still expected (the archived world-replacement cost table). Verified: full Go suite uncached 0 FAIL (pre-existing `sys.TestDwell` flake passed 2/2 isolated) · `db-test` green vs real Postgres · `-placements` **diagonal byte-identical across all three value changes** (at-level pay is the anchor and never moved) · boot `-content ../api` 15 factions/87 skills/65 mobs/3 milestones/10 recipes/4 quests/5 props/777 props/485 spawns/5 campfires, 0 panics, tuning line `base=20 grayBase=5 grayStep=10 taperStretch=1.15 tierElite=2.5` · **`c0-honest-plate` 7/8, 0 FAIL — the pay leg measured Δ234, the formula's exact number** (the one en-route FAIL was its documented patroller-sampling weakness: walked-off-screen reads as died; proven unrelated by Go probe + re-run) · **`chunkP-presence` all PASS**, 0 console errors on both. **Schema impact: DB NONE · FlatBuffers NONE · content JSON NONE · conf YES** (the three repo copies; the live server carries no killXP block and picks up the new defaults with the next binary deploy). **`plan-xp-formula.md` → `docs/archive/`**, the work-through list is EMPTY — ⭐ **next up: Ascension C1** (`docs/plan-ascension.md`, designed, scope-cut, ready). Ledger: `docs/archive/plan-xp-formula.md` §10 C2 + §12.2–12.4.


### Next

- **✅ GENERIC KILL QUESTS ARE DONE, ARCHIVED AND PO-PLAYED** (`docs/archive/plan-generic-kill-quests.md`, C1+C2 both 2026-08-07 `f414b473`; PO walk same day, "works and feels good" — intake round 9) — nine quests, 10 of 14 placed conversants offer one. ✅ The bandits-at-the-shrine watch item is CLEARED (human-target quest PO-seen, read fine; GiantSpider fallback unused). Reward numbers follow the L9 half-level rule and are [PLACEHOLDER] like everything else. **Ascension C1 remains the visibly-next roadmap item.**
- **World map part 1 is DONE, live, mobile-verified and ARCHIVED** (`docs/archive/plan-world-map.md`) — C1+C2+C3 all shipped 2026-08-04, the phone pass closed on a real device against the live build, and the deferred `features/map/` rename taken the same day (directory only: `MiniMap`, `IMiniMapRendered` and the `game.miniMap` harness handle keep their names). ⚑ Two tuning questions ride forward, owned by nobody yet: the marker sizes + dot colour are [PLACEHOLDER], and **your own dot is invisible while you stand at your bound fire** — which is exactly where you respawn. ⚑ **Flight C4 gave the second one a bigger blast radius and a measurement**: `dot r=3.5 px` under a `9.0 px` marker, and D16 means **every flight arrival ends with the flyer's dot occluded on every observer's map** — so the payoff of watching someone cross the map stops the instant they land. It is a marker-sizing call, still owned by nobody.
- **FAST TRAVEL IS DONE, LIVE, PO-VERIFIED AND ARCHIVED** (`docs/archive/plan-flight-paths.md`) — part 1 (the map) 2026-08-04, part 2 (flight) 2026-08-05: C1 inside world-map C2 · C2 `bc01a45c` · C3 `bcfb4faf` · C4 `fc000765`, and ⛔ **C5 was CUT** (**D17**). It had shrunk twice before it was ever started — each time because a **precondition disappeared rather than scope being deferred** — and C4's in-game pass came back *"everything works and looks good, no changes needed"* without the route overlay that was all it had left. **YAGNI, applied to a plan document.** ⚑ The overlay stays a legitimate idea for the day the world is big enough to want a drawn line; it is ~96 s wide on foot today, and §9 always said this was infrastructure built ahead of the size that justifies it. **Backlog §41 is closed by this.** ⚑ **C5 SHRANK during C3's feel pass**: its confirm dialog existed mainly to give the silent refusal a voice, and the PO's `E`-at-the-fire ruling **removes that case** (an `M`-opened map is read-only, so the flight map is unreachable unless you are already standing at a discovered fire). What is left is the **route overlay**, plus one open question — whether a real dialog replaces the two-press arm or the arm simply stays. ⚑ Speed **2.8×** and viewport **1.2×** are PO-tuned but still [PLACEHOLDER]; the viewport cut also spent §4.3's mobile-perf premise (streamed area ~1.4×, down from ~6.25×).
- **✅ THE WORLD RE-PLACEMENT PASS IS DONE, PO-PLAYED AND ARCHIVED** (`docs/archive/plan-world-replacement.md`; `docs/archive/plan-mob-levels.md` likewise). C0 `7055aad4` + C1 `3df461a8` + C2 + **the PO kite walk, all 2026-08-06** — verdict *"feels very good, I like it"*, the seven reshaped speeds (DireWolf 0.88 → 0.55 × 42 spawns) **accepted provisionally**; backlog **§38 closed**, **roadmap step 2 closed**. All **423 combat spawns** carry a decided `level`, **27 under a different species**; `scripts/world-place.py --check` holds the authored table. ⚑ **Deeper testing is expected to re-tune individual species on feel** (damage, HP, xpFactor, speed): speed/xpFactor are cheap JSON; **HP or damage re-price every placement (L6)** and can trip the archetype guardrail — the cost table is in the archived plan's status banner. ⚑ **Two threads hand to `xp C2`, and neither is a defect**: **(a)** the high regions sit at **1.8–2.1 × a standard at-level fight** (low half 0.7–1.0 ×) — partly **D12**'s HP-heavy `wildlife_predator` pick, and no complaint on the PO's first impressions; **(b)** **no battery measures mob speed** — structural in the chain's two stances (facetank spawns at distance 0, kite pins speed 0), so `-placements` inherits the blindness; §13.4 deliberately left the approach-distance leg unbuilt. ⚑ **Levels 21–30 remain a recorded standing gap** (D5). Sim-harness placement support shipped the same day as `plan-xp-formula.md` C1.5. ✅ *(`xp C2` then ran and CLOSED 2026-08-06 — both hand-forward threads were read and consumed; see Recent.)*
- **⭐ THE WORK-THROUGH LIST IS DONE — all three items shipped 2026-08-06, the mob/XP chain is CLOSED.** ✅ (1) C1.5 sim-harness placement support (`§13.6`) · ✅ (2) the kite walk ("feels very good") · ✅ (3) `xp C2` (D13–D19, "feels much better", `docs/archive/plan-xp-formula.md`). The roadmap's post-8a insert is fully discharged; **the visibly-next item is Ascension C1** (designed + scope-cut, `docs/plan-ascension.md`).
- **XP FORMULA: ✅ COMPLETE AND ARCHIVED** (`docs/archive/plan-xp-formula.md`) — C1 (the mechanism, `a03b95ff`) · C1.5 (the harness) · C2 (the calibration, **D13–D19**) shipped 2026-08-05/06, closed by the PO in-game ("feels much better"). The economy: level-relative per-participant award · WoW's two-distance gray shape (gray `5 + ⌊P/10⌋` pays exactly 0, deepest green ~25 %) · ~15 kills/level flat · tiers 1/2.5/5 · kite list empty by D16. ⚑ Still open, but NOT this plan's: per-species feel tuning (speed/xpFactor cheap; HP/damage re-price placements — archived world-replacement cost table) · levels 21–30 empty by D5 · the §12.2 rising-absolute-award note.
- **backlog §48 — "there is one join path"** (the reconnect token is deletable) — traced `cd8fd4ba`, but **BLOCKED on §52** (leaving-the-world-takes-time, filed `94fec351`).
- ⭐ **STEP 8a IS DONE AND CLOSED** (PO 2026-08-04). ⚑ **It closes WITHOUT backups, deliberately**: the live server is still a testing ground even though it is externally reachable, and *infinite persistence is not the ultimate goal yet* — so losing the live database costs a playtest, not a player's history. Treat it as **losable**; nothing off-box holds a copy. **We will come back to it** — the natural trigger is the sacrifice loop, where a bloodline is by definition supposed to outlive the character. The rest of §8's ops work shipped by being used (provisioning + migrations, exercised live by `000002`). ⚑ The ruling covers **durability only** — the *security* items (cloud firewall, DB bound to localhost, credential handling, non-root deploy user) are untouched and still owed: `plan-playtest-deploy.md` §Ops & security posture. Ruling box: `docs/archive/plan-accounts-implementation.md` §8. ⚑ **Step 8b is NOT closed** by this (UI polish rest-of-checklist, avatar system, location music) — the 8a/8b split exists precisely so they close independently.
- **Next up: ASCENSION, the character-sacrifice loop** (persistence's first consumer, and the visibly-next item) — ✅ **DESIGNED 2026-08-04 (`e80c8a93`), SCOPE CUT 2026-08-05 (`73120512` + `90d0ceb4`)**, `docs/plan-ascension.md` (14 PO rulings D1–D14; ratifies backlog §36). The next session is **C1, not a design pass**. ⭐ **D13 cut the point economy**: v1 ascension is **picking one skill from a curated list, and nothing else** — no random roll, no points/prices/banked balance, no feat gates. All deferred-not-blocked behind one nullable gate field on the catalog entry (which is also where `plan-camps.md`'s faction condition lands). ⚑ **Schema impact is NONE — the migration disappeared with the economy**, verified against the shipped `000001` DDL: `bloodline_unlocks` takes a bare `unlock_key` insert, **and its PK enforces the no-duplicate-picks rule for free**; `game.bloodlines` and the spellbook seed-provenance column existed only to serve scoring. So **C1 halved** to catalog loader + the two-write transaction + successor seeding — but it still owns the sacrifice transaction 8a deliberately deferred, and it is where the backup question comes back: a bloodline is supposed to outlive the character. ⚑ Two things C1 must not get wrong: the successor **cannot** share the transaction (creation is interactive — "a sacrificed character with no heir" is reachable and benign), and `plan-camps.md` L0 puts the **camp-standing wipe** in this plan's C1 — whichever of the two ships second owns that assert. Superseded rulings live in the plan's §10, never in its body. ⚑ **D12 came true without us**: it pre-ruled discovery-wipe for a fast travel that then shipped 2026-08-05 already per-character, so the wipe is structural and **backlog §41 needs nothing**.

### Open items

- **Needs a PO call:** `#registrationNag` covers the open mobile ☰ sheet (journal unreachable on phones; `mobile-layout.mjs` leg 7 legitimately red).
- **Intake round 8** (`plan-playtest-feedback.md` §Intake round 8): item 2 — stale quest info after turn-in (recommended: a third condition sentinel `running`); item 3's **feature** half — auto-walk (bug half shipped `c8163ad1`). Round 7: only **totem tooltips** (item 3, third raise) remains — needs catalog/data design. **Round 9** (2026-08-07, §Intake round 9): items 2+3 parked for the UI pass — font/cleaner UI/dialogue UI, and journal-over-dialogue overlap (cheapest fix recorded: one exclusivity rule); item 1 (NPC nameplates) shipped same day.
- **Fast-travel tuning, orphaned by the archive** (both PO-seen, neither owned): **marker sizing** — your own dot is invisible at your bound fire, *and* since D16 **every flight arrival ends with the flyer's dot occluded on every observer's map** (measured `r=3.5 px` under a `9.0 px` marker), which is the same call with a much bigger blast radius · **flight speed 2.8× and viewport 1.2×** are PO-tuned but still [PLACEHOLDER].
- **Smaller open threads:** §47 the stale "Connection lost" banner in a second window · §51 transient second queue entry (readability) · a character-name **content** filter (spam registrations pass the charset guard) · mobile perf ceiling — PO: "works for now, needs some love" (cheapest next: `MOBILE_MAX_RESOLUTION` 1.5; the minimap is a second per-frame GL context).
- **Outside 8a, deliberately:** sacrifice transaction · `bloodline_unlocks` writes · avatar/faction defaults (blocked on `plan-avatar-system.md`) · the password-reset plan's own five questions.
- **Backlog watch items** (`docs/backlog.md`): §25 D+E · §27.2.4–7 (⚑ §27.2.6 needs re-surveying first — 1b/R5 moved its sites) · §29 lost-WebGL-context trigger unknown (detection shipped `6c8bde2e`; a blank world without the `[webgl]` log line is something else) · §37 skill-level/augment rework (coupled to the caps ruling) · ~~§38 per-spawn level override~~ **CLOSED** — the tool by `plan-mob-levels.md` C1–C3 (2026-08-05: server, wire+plate, editor), the **content** by `plan-world-replacement.md` C2 (2026-08-06: all 423 spawns placed); both archived · §39 entity-presentation rework (don't invest in per-effect overlay art before it) · §34 hard collision (not taken) · round-6 item 4 target stickiness (ruled unfixed; re-opens on measured cost, and its damage-smear half is what a playtester would report).
- **Known-inconclusive:** `chunk3-charm.mjs` red 6–8/9 across four runs (the accepted D9 fragility), HEAD baseline hung — not cleared.
- **Open PO calls: none outstanding** (2026-07-29 sweep). Replacement art + domain parked until v1; wiki generator kept.

- **Standing locks & gotchas:** growth **1.12 × maxLevel 30**; regen **0.00033 ≈1%/s × taper 1.0→0.4** FINAL; §11 no-pity + campfire **0.12** + heal cost **10 % → 2 % of max HP across its 10 levels** FINAL (the numbers rewrite converted the old absolute 10−2/level to a fraction; it was already exactly 10 % of the pool); **the base damage aura stays FREE at every resource level** (round-6 ruling — no cost curve may ever leave a player with no action; GDD §3); drop + milestone tables are **TUNING-OPEN** (milestones: Damage@L1 seeded at creation · **Discipline@L5** · Haste@L7); density = mob visible per ⅔-screen window; downtime 10 s + chain 20; guardrail asserts in `cmd/simharness/guardrail_test.go`. New mobs: **must** author tier + baseline (raw `maxHealth` hard-fails) and price XP with **`factors.xpFactor`** — absent → 1 (a full at-level kill), `0` = pays nothing *and* no nameplate, fractions only for harvest-style outliers — Turnip 0.05; **the Session-⑥ kite rule is RETIRED as applied content (xp D16, 2026-08-06): no species authors 0.5**, the knob stays (raw `factors.experience` still hard-fails, since kill XP is computed from the *killer's* level). Day/night cycle is **OFF** (`DAY_CYCLE_PRESENTATION_ENABLED=false`, bug unfixed — don't re-enable without collapsing the ~25 per-layer filter passes). Per-chunk placeholder values live in their plan docs. **A shape removed from `phy.Space` is purged from every other shape's collision set on the spot** (backlog §54) — do not "optimize" that sweep away: systems read those sets in priority order (`MobSystem` 20 → `PhysicsSystem` 0 → `NetSystem` −100), so an entity removed at the bottom of a tick is otherwise still visible to sensors at the top of the next one, and one stale read is enough to re-latch it forever. **Dev cheats:** GOD, WARP `<x·120> <y·120>` (1-unit granularity — land on a whole unit), SPEED, XP, SKILL, ANNOUNCE, THREAT, QUEST (dump / `ACCEPT <id>` / `ABANDON <id>` / `ADVANCE <id> <from> <to>`). `make -C backend build` runs `cp-defs` (reverts embedded `backend/pkg/api/` from `api/`); boot `-content ../api` for content iteration (schema/Go changes still need the rebuild).

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

This applies to backend Go code (`go test ./...`) primarily, and to the
frontend's pure logic modules where a runner now exists (`npm test`, see
Frontend tests). For exploratory prototype work or UI tweaks, strict TDD may be
relaxed — but any non-trivial game logic (aura calculations, combination
resolution, damage application) should have tests before or alongside the
implementation.

When fixing a bug: first write a test that reproduces it, then fix.

## Project Overview

**Aura** (formerly Berryhunter; module path `github.com/RoteRiesenRobbe/aura`, local workspace dir `aurahunter`) is a multiplayer top-down browser MMO built on the Berryhunter survival-game foundation. The repo has three main parts:

- `backend/` — Go game server (`aurad`)
- `frontend/` — TypeScript/webpack browser client using PixiJS
- `api/` — Shared FlatBuffers schemas and the authored content JSON (mobs, skills, recipes, zones, props, factions, milestones)

`docs/README.md` is the docs index — it holds the naming convention and the four-layer status model (this file = current state · `roadmap.md` "Execution order" = sequence · `plan-*.md` §13 banners = per-chunk ledgers · `MEMORY.md` = cross-session index).

**`docs/` = live work, `docs/archive/` = finished work.** Plan docs referenced by bare name below (e.g. `plan-mob-depth.md`) are in `docs/archive/` once their work has shipped; anything still in `docs/` proper has something open. When a plan's last chunk lands, `git mv` it into `archive/` and move its index line to the README's Archive section.

## Build & Run

### Backend (Go ≥ 1.22)

```bash
# One-time: copy config
cp backend/conf.local-windows.json backend/conf.json   # Windows
# or use backend/conf.default.json as a template

# Build
make -C backend build          # produces backend/aurad

# Run (dev mode serves static frontend too)
cd backend && ./aurad -dev

# Run without build (go run)
make -C backend dev
```

> **Gotcha:** after backend logic changes, rebuild the binary with `make -C backend build`.
> `go build ./...` compiles/type-checks packages but does **not** refresh `./aurad`,
> so a running `-dev` server keeps executing stale code.

> **Content iteration:** `./aurad -dev -content ../api` loads items/mobs/skills/recipes
> from the repo `api/` directory directly instead of the embedded copies — JSON edits then skip
> both `cp-defs` and the rebuild (a server restart still applies them). The boot log prints the
> content source (`Loading content source=…`). Production/default stays embedded.

`backend/conf.json` controls server port (default `2000`), day/night cycle durations, and all game-balance tuning values. `backend/tokens.list` must exist with at least one token (e.g. `plz`) for in-game commands to work.

### Local database — required for EVERY boot

`aurad` **refuses to boot** without `AURA_DB_URL`, and panics without `AURA_JWT_KEY` (step 8a
chunk 1c). That includes headless harness runs. One-time setup:

```bash
make -C backend db-up                                   # Docker Postgres, named volume, both DBs
cp backend/.env.local.example backend/.env.local        # then put a real random key in it
```

`scripts/dev-restart.sh` sources `backend/.env.local` automatically (an already-exported value
still wins), so a plain restart works in any shell. `backend/.env.local` is **gitignored** —
credentials never live in the repo.

**Two databases on one server, and the split is load-bearing:**

| Database | Role |
| --- | --- |
| `aura` | durable dev data — characters survive restarts and container removal |
| `aura_test` | **disposable** — `AURA_TEST_DB_URL` points here |

> ⛔ **Never point `AURA_TEST_DB_URL` at `aura`.** Every DB-touching test calls `store.Rollback`,
> which drops the whole `game` schema, before *and* after itself. Aimed at the dev database it
> deletes every account and character silently — the run still goes green. Use
> `make -C backend db-test`, which aims correctly.

Targets: `db-up` · `db-down` · `db-shell` · `db-test` (store + accounts vs `aura_test`) ·
`db-reset` (recreates `aura_test` empty; never touches `aura`).

⚑ **The dev database now accumulates residue.** Playwright verify runs leave `hrnss_*` characters
behind, which used to die with the throwaway container. `backend/cmd/harnessdb -cleanup` clears
them — but **stop `aurad` first**: it holds live sessions the DELETE never reaches, and cleaning up
under a running server has already corrupted save games once.

⚑ **Dump before any migration test against real data**, and stop `aurad` first so it flushes
(`💾 flushed N live character(s) for shutdown`):
`docker exec aura-dev-db pg_dump -U aura -d aura --clean --if-exists > /tmp/aura-dev-backup.sql`.
Full runbook: `docs/manual-db-migrations.md` §4.

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

The full suite runs and passes. (`backend/pkg/aura/net/net_test.go` is a manual `ListenAndServe` smoke script that used to hang the suite; it is now skipped via `t.Skip` — remove the skip to run it explicitly.)

The test runner requires generated files (`go generate ./...`). The Makefile `gen` target runs this automatically before builds.

### Frontend tests

```bash
cd frontend && npm test          # vitest run
npm run typecheck                # tsc --noEmit
```

Vitest (added with the round-4 tooltip fix) covers the pure, DOM-free logic
modules — currently `SkillTooltip.ts`. Three things to know before adding a test:

- **The environment is `jsdom`, not `node`** (`vitest.config.ts`). The client's
  module graph reaches `window` at *import* time — `Urls.ts` derives the catalog
  host from `window.location`, PixiJS wants a document — so even a pure
  formatting unit needs a browser-shaped global.
- **`vitest.setup.ts` stubs `fetch`.** `Skills.ts` and `Mobs.ts` fetch their
  catalogs on import; without the stub a unit test does real DNS. The stub
  rejects, which is the degrade path those modules are designed to survive.
- **Import `{describe, it, expect}` explicitly** — globals are deliberately off
  so `tsconfig.json`'s `types` array stays untouched. (`skipLibCheck: true` is
  on there because vitest's own `.d.ts` files use private identifiers that tsc
  otherwise reports against the app's `es5` target.)

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

- `backend/cmd/aurad/` — entrypoint; wires config, game, HTTP server
- `backend/pkg/aura/core/` — `game.go` constructs the ECS world and registers all systems; `Loop()` ticks at ~30 FPS (33 ms/tick)
- `backend/pkg/aura/sys/` — ECS systems: physics, mob AI, NPCs, skills, targeting, state (death/respawn), pre/post-update, plus `chat/`, `cmd/`, `equip/`, `statuseffects/` (deleted systems: scoreboard in the 2026-07-08 dead-feature prune, heater with step 7, decay with the §26 resource prune)
- `backend/pkg/aura/model/` — interfaces and concrete types for entities (`player/`, `mob/`, `npc/`, `prop/`, `corpse/`, `spectator/`, plus `vitals/` and `client/`)
- `backend/pkg/aura/items/mobs/` — the mob registry: definitions, catalog, `EntityType` resolution (the enclosing `items` package was deleted with the §28 item-system removal; only `mobs/` remains)
- `backend/pkg/aura/codec/` — FlatBuffers encode/decode for the WebSocket protocol
- `backend/pkg/aura/phy/` — 2D physics (circle/AABB collision, spatial hashing)

**Adding a new system:** implement `ecs.System`, register it in `core/game.go:NewGameWith()`, and add entity registration cases in the relevant `addXxx()` methods.

**Adding a new entity type:** implement the appropriate `model.*Entity` interface, update `game.AddEntity()`, and register in all relevant systems.

### Communication Protocol (FlatBuffers over WebSocket)

Schemas live in `api/schema/`:
- `client.fbs` — client→server: `Input`, `Join`, `Cheat`, `ChatMessage`
- `server.fbs` — server→client: `GameState`, `Welcome`, `Accept`, `Obituary`, `EntityMessage`, `Pong`
- `common.fbs` — shared types (`Vec2f`, `ActionType`, `AuraType`)

After editing `.fbs` files, regenerate bindings for both backend and frontend.

### Game Configuration (conf.json)

All numerical tuning lives in `backend/conf.json` (or `conf.default.json` for reference). The `game.player` block controls movement speed, aura radii, vital-sign drain/gain rates, and level-up scaling. Changes take effect on restart.

### Content Data (JSON)

All authored content lives under `api/` in eight directories — `mobs/`, `skills/`, `recipes/`, `zones/`, `props/`, `factions/`, `milestones/`, `quests/`. Each is loaded by `cmd/aurad/loaders.go` (`contentSources`); a missing directory hard-fails at boot. The `make -C backend cp-defs` target copies all eight into `backend/pkg/api/` so the Go build embeds them, so run it (or just `make -C backend build`) after editing any JSON definition — or boot with `-content ../api` to skip both (see Content iteration above). Keep `contentSources` covering every `api/` subdirectory, or a content edit silently no-ops.

### Persistence (PostgreSQL)

Since step 8a, `aurad` persists accounts and characters (with their game state) to PostgreSQL. **Every change must state its schema impact** — does it touch persisted state (accounts, characters, session/reconnect data, quest ledger, loadouts)? Even "no DB change" is a finding worth recording in the chunk ledger.

- Schema lives in `backend/pkg/aura/store/migrations/` as sequential `.up.sql`/`.down.sql` pairs, embedded via `go:embed` and auto-applied at boot (`store.Migrate`). **Shipped migration files are frozen** — schema changes are always a *new* pair, never an edit.
- Standing schema rules (`game.` namespace, no `ON DELETE CASCADE`, hash discipline, JSONB canonicalization) and the dirty-state recovery runbook: `docs/manual-db-migrations.md`. Table/column rationale: `docs/archive/plan-accounts-schema.md`.
- DB-touching tests (`store`, `accounts`) need `AURA_TEST_DB_URL` set and skip cleanly without it — "green without Postgres" is not a full pass.

### Frontend

The frontend is structured as feature modules under `frontend/src/features/`:
- `backend/` — WebSocket connection, FlatBuffers deserialization, entity snapshot management
- `core/` — game loop, entity manager
- `player/`, `vital-signs/` — local player state and HUD
- `game-objects/` — rendering entities (props/resources, mobs, characters, corpses) via PixiJS; `AuraRings`/`EffectPips`/`AuraTickIndicator` are the shared combat-readability overlays
- `input-system/`, `controls/` — keyboard/mouse/touch input
- `internal-tools/` — dev panel, console, overlay tester (only active with `?develop`)

**HUD event handling:** Use `pointerdown` (not `click`) for all interactive HUD panels. `MouseManager` (`input-system/logic/mouse/MouseManager.ts`) registers a `mousedown` listener on `document.documentElement` with `event.preventDefault()`, which suppresses the synthetic `click` event. `pointerdown` fires before this and is unaffected. `click` listeners on HUD panels silently never fire — this is not obvious from the source.

Webpack configs: `webpack.common.js` (shared), `webpack.dev.js` (HMR, port 2001), `webpack.prod.js` (minified output).

## Aurahunter Project Context

This fork of Berryhunter has been transformed into **"Aura"** — a top-down MMO.
The Berryhunter survival systems (vitals, crafting, temperature, hunger) have
been removed. The core loop revolves around the aura system described below.

The structural rename (execution-order step 7, `docs/archive/plan-rebrand-cleanup.md`)
is **done**: module path `github.com/RoteRiesenRobbe/aura`, package dir
`pkg/aura/`, binary `aurad`, FlatBuffers namespace `AuraApi`, title "Aura".
Remaining "Berryhunter" references are intentional: historical plan/archive
docs, `legacy: true`-tagged proving-grounds content, Kringel Games social/
rating links, and berryhunter.io domain URLs (no replacement domain yet).

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
XP bar, ability bar, aura panel, minimap, zone chat), campfire system, and
the **character-sacrifice loop** (moved *into* v1 by PO ruling 2026-07-19,
`plan-intermission-triage.md` item 10 / GDD §11 — it lands right after step 8
as persistence's first consumer).

~~Line-of-sight for auras~~ — **CUT 2026-07-10.** Auras pass through walls and
every environment object; props block movement, never effects. The `blocksAura`
flag was deleted 2026-07-11. See `gdd.md` §142/§163 and `roadmap.md` item 6.

### Not in v1.0

PvP, formal group system, economy, mobile, endgame raid events.

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
- Treat the inherited physics, collision, and the WebSocket/FlatBuffers protocol as
  stable foundations. Extend, don't rewrite.
- When in doubt about game design intent, ask — don't infer from the codebase.

## Sanity checks after every step

Before declaring a step done:
- Run `go build ./...` from `backend/`
- Run the relevant `go test` for affected packages
- State the change's **database-schema impact** (even if "none"). If it touches persisted state: follow `docs/manual-db-migrations.md` (new migration pair, never edit shipped SQL) and run the `store`/`accounts` tests with `AURA_TEST_DB_URL` set
- For anything with a runtime surface, verify in-game (plan docs record per-chunk in-game checklists)
- Report the output — don't claim "done" without these checks.
