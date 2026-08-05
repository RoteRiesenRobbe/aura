# docs/ — index

Naming convention: core docs unprefixed; `plan-` = execution plan/record per work item;
`research-` = point-in-time investigation/assessment; `manual-` = how-to guide;
`content-` = game-content catalogs + per-zone design intent (see Content section for the
conventions).

**`docs/` holds live work; `docs/archive/` holds finished work.** A doc moves to
`archive/` when its work has shipped (or was abandoned/superseded) and won't be resumed —
it stays readable and is still the rationale record, it just stops competing for attention.
Anything in `docs/` proper has something open. The older `archive-` filename prefix predates
the folder and is kept as-is on the six files that carry it, so existing references stay
literally correct — don't add the prefix to newly archived docs, the folder says it.

**Where status lives** (four layers, each with a distinct job — don't duplicate between them):

- **CLAUDE.md `## Status`** — the authoritative *current* state: last completed chunk, what's
  next, open PO calls, standing locks and placeholders. This is what you read first in a session.
- **roadmap.md "Execution order"** — the authoritative *sequence* + per-step outcome. Steps get
  sealed here when they complete; it is not a per-session log.
- **plan-\*.md banners** — the per-chunk ledger for one work item: what was decided, what landed,
  which commit.
- **MEMORY.md** — the cross-session index, so a fresh session can find the above.

## Core

- **gdd.md** — game design truth: vision, mechanics intent, open design questions
- **tdd.md** — technical big picture: architecture, decided/open tech questions, risks, known bugs / standing gotchas
- **roadmap.md** — v1.0 scope + per-item status; **authoritative "Execution order"**
- **backlog.md** — unscoped feature ideas with open-question catalogs
- **architecture.md** — runtime cost model, scaling limits, zones-as-Spaces & fluid transitions, hazard/encounter runtime cost

## Plans — live (something is still open)

Everything else that ever had a plan doc lives in `archive/` (see the Archive section).

- **plan-numbers-rewrite.md** — **Pass 1, the skill-catalog numbers rewrite** (**BUILT 2026-07-31, committed 2026-08-01 `40d9b204`, C1 + C2; the PO feel pass has RUN — its findings are `plan-resource-costs-feedback.md`, and a retune sitting is unscheduled**): caps from `{1, 5, 10}`, an escalating cap-relative point curve, resource costs on every effect type, D4's damage-type/gate-key split, and the Damage/Wild/LRS/Reaper/Recover retune. 16 PO rulings + **16** landmines (L14–L16 found while building); two chunks (engine, then numbers). Implementation record for what `plan-playtest-feedback.md` §Pass 1 describes
- **plan-numbers-feel-pass.md** — **the PO feel pass on the rewrite above** (**✅ RUN 2026-08-01**): the seven areas to judge by hand (the premise, the free floor, the point economy, the retuned set, damage types, tooltips, Discipline). Stays the **checklist of record** — what was asked and why; the replies and their triage live in `plan-resource-costs-feedback.md`
- **plan-resource-costs-feedback.md** — **what came back from the numbers rewrite** (2026-08-01): the PO **feel pass** (the premise works — costs read as a decision; 11 items, headline ones being First Aid must be free, absolute HP instead of percentages, multi-effect auras must tick together, Reaper still far too strong) plus a **technical review** of the cost system (9 findings — 2 fixed in session, 7 open; the sharpest is that "landed" is three different rules, so a shield aura charges a *proximity tax* that at cap outruns tapered regen). §4 records where the two collide. **⭐ TRIAGED INTO A PLAN 2026-08-01** — every finding re-checked against HEAD (which **corrected §3.2**: three costed effects author `targetsSelf`, so they charge full price with *nobody nearby at all*, not merely an ally), **8 PO decisions taken in §5** (pay for work done · pay to ignite · keep the 1-HP floor and make it visible · unify at the damage beat · Reaper drops a rider · First Aid free · the resource is named **Focus**, with "aura" left to mean the field around you), and §6 is the schedule: **R1 what a cost says → R2 what "landed" means → R3 one beat one price**, plus R4 the downtime design session. ⚑ The order is load-bearing (§3.10 — throughput-neutral re-pricing is **3× at a level-1 pool**)
- **plan-downtime.md** — **R4, the downtime + Recall design — BOTH CHUNKS BUILT 2026-08-03 (C1 `ec389164` deployed + PO-verified · C2 `3910e536`)**: a new **baseline-utility** ability class — Recall and a placeable **mini-campfire**, both always-present HUD buttons outside the cooldown slots and the spellbook, both held from level 1. Recall free and cooldown-less (the 10 s interruptible cast is the only brake; `recall.json` retired). The camp: 5 s channel → a 15 s fire healing everyone standing in it + a dim light, one per player, replace-on-place; charge-fed, cap `1 + ⌊level/7⌋`, refill by dwelling at any real campfire, **purely per-session** (nothing persisted — this answers backlog §32: store nothing for now). 9 PO decisions, 10 landmines; ledgers in §9. Open: the [PLACEHOLDER] numbers (§8) and the PO in-game pass
- **plan-playtest-feedback.md** — **the standing collection of playtest-arising issues** (successor to `archive/plan-playtest1-feedback.md`). Round 2 (2026-07-24) triaged and sorted into Pass 1 (point curve + resource costs + retune) / Pass 2 (pulsing auras, directional ability, anti-AFK patrols) / Pass 3 (XP credit, minion combos) + rolling filler. New playtest rounds append to §Intake; we pick targets from here
- **plan-intermission-triage.md** — the PO's 22 post-C7 playtest items (bugs, config fixes, audits, design questions), each investigated against code with effort estimates + a locked execution sequence. Largely executed; still the home of the open combat-readability and sacrifice-loop items
- **plan-ui-polish.md** — UI-polish pass (step **8b**, item-8 slice): Chunk 1 done (`GET /skills` catalog + skill tooltips); the rest of the checklist is deferred (§Deferred)
- **plan-playtest-deploy.md** — the live server (2026-07-21, `a7a2267d`): Hetzner VPS, `devops/deploy.sh`, server-only cheat token. **Now persistent** (step 8a, live since chunk 4 — restarts no longer wipe characters) and ⚑ **deliberately NOT backed up** (PO 2026-08-04). Live-ops reference; its §Ops & security posture still owns the unticked *security* items (firewall, DB bound to localhost, credential handling), which that ruling did not cover
- **plan-onboarding-cleanup.md** — **not started** (2026-07-23): documentation & repo cleanup for human coworkers across code/art/audio/design. Its Workstream B is what created `archive/`; Workstreams A/C–G are still open
- **plan-avatar-system.md** — design sketch, unscheduled: join-screen portrait picker + icon-unlock track, for step **8b** (its chunks 1–3 need no accounts; only chunk 4, avatar persistence, waits on 8a)
- **plan-server-performance.md** — **2026-08-02, chunk 0 built (uncommitted), 1–5 not started**: the execution order for raising the concurrent-player ceiling, cheapest first, off the measured profile in `devops/loadtest.md`. Chunk 0 (the XP curve — evaluated twice per character *per viewer* per tick) already **halved the tick** at 50 clustered bots. Then: share entity encodings across viewers (the O(players × entities) one, the big win) → parallelise `NetSystem` → stop re-encoding static skill data → the broadphase → delta encoding. ⚑ Chunk 2's prerequisite was found while writing the plan and closed the same day — the XP table is built eagerly in `New`, because encoding reads it for every character in every viewport and a lazy build writes to one player's table during another player's snapshot
- **plan-mob-voicelines.md** — **planned 2026-08-02, not started**: a mob shouts an authored line when it latches onto an enemy (the WoW aggro yell). One backend-only chunk, **frontend zero-change** — every layer already exists and is proven by the Town Crier's ambient speech, so the work is an authored `aggroLines` field plus a drain on the aggro rising edge. 4 PO rulings (per-mob ~30 s cooldown · aggro only · sensor audience · elites/bosses + a few flavour). ⚑ Its L1 is the *third* appearance of the structural-assert silent-wiring class (R2/R3), and L2 is the per-mob RNG stream the drop roll shares

- **plan-flight-paths.md** — **designed 2026-08-04; C1 shipped inside world-map C2; C2 (the server flight state machine) built + headless-verified 2026-08-05** (fast travel part 2, closes backlog §41 with **option 2**, flight paths over campfire teleport): dwell at a fire → it becomes a flight node → fly fire-to-fire in a straight line at ~4× walk, zoomed out, aura off, abilities locked, **invisible to the ground but seeing everything below**. 8 PO rulings 2026-08-04 + 3 on 2026-08-05, of which ⭐ **D13 sets the mechanism: takeoff removes the flyer's shapes from the physics space** (viewport stays), so non-interaction and snapshot invisibility are structural via §54's two invariants rather than a suppression checklist — C4 shrank to the roster filter — **and then C4 deleted even that**. The migration it planned shipped early inside part 1 (`000002_character_campfires`); C2 itself added **no schema change**. **C2, C3 and C4 all shipped 2026-08-05**, C3 PO-verified in-game. ⭐ **D16 (C4): the world and the map are DIFFERENT facts** — a flyer is unreachable and unseeable on the ground *and* stays a dot crossing the map, because fires and the routes between them are what the map is for. The roster filter this plan specified from §2 onward was never built; C4 shipped the ruling, a pin test that fails if anyone adds the filter, and the correction of eleven sites that instructed them to. Remaining: **C5** (route overlay + the arm-vs-dialog question)
- **plan-camps.md** — **designed 2026-08-04, not started** (the design pass backlog **§15** has been parked for since 2026-07-09, and the session `mobs/interaction.go` names in the boot error it raises today): a character joins one of **two rival human camps** at the Z2 front — permanent, teaches what the rival never teaches, and **closes the rival's questlines**. Hostility is **social, never attack-on-sight** (§4.4 prices that out: players are a compile-time `FactionAligned`, and the aggro mask is baked into the *physics sensor shape*, so per-player aggro is collision-path work). 8 PO rulings (world-parity power, reusing ascension D1 · permanent · per-faction friendly/neutral/hostile enum · teaching + quests + ascension rituals · `human_army` + one new player-safe rival · neutrality legal forever · free composition with silent recipe dead ends, ⚑ taken against recommendation · primitive anytime, content after ascension C1). ⭐ Cheap because the previous pass reserved the slot: the consequence vocabulary, its JSON shape and its boot refusal already exist, and **factions load before mobs** so the faction name resolves inside the existing loader — no cross-validation pass. 3 chunks + C0, **no migration** (a new `character_flags` key)
- **plan-test-world.md** — **planned 2026-08-02, not started**: a second playable map, `api/zones/testworld.json`, built as large as the tick loop actually holds — five level-banded areas from the existing roster, 2–3 minimal-text quests each, and every feature we have placed once (darkness, campfires, gated harvest mobs, patrols, teachers, drops, the scripted Warlord). Opt-in via `-zone testworld`; `world.json` untouched. 8 PO rulings + 9 landmines. ⚑ Its shape comes from four code facts: there is **one zone and one `phy.Space`**, so "zones" are areas of one map · **mob level is per species** (§38), so the bands have a hole at 13–17 · **every mob ticks every tick regardless of players**, so size is capped by mob count and chunk 0 is a measurement · and mob definitions are **global**, so quest rows must go on new NPCs or they change the live world

- **plan-ascension.md** — **designed 2026-08-04 (`e80c8a93`), no chunk built**: the character-sacrifice loop, i.e. the execution-order item that follows step 8a and is persistence's first consumer. A max-level character ascends at a world site; its life converts to **points** that buy **bloodline-scoped** rewards (per *slot*, not per account — this is where backlog §36 is ratified) which every future character in that slot starts with. 12 PO rulings D1–D12; amends GDD §5 in three places. ⚑ **Has a migration** (`game.bloodlines` + seed provenance) and gives `bloodline_unlocks` / `sacrificed_at` / `previous_character_id` their first writers; it also owns the **sacrifice transaction 8a deliberately deferred**. Chunks C0 (docs) → C1 (scoring + the atomic transaction, server-only) → C2 (the stone + ceremony) → C3 (memorial + catalog seed). ⚑ Its catalog is a **new content directory** — add it to `contentSources` or edits silently no-op

**The `plan-accounts-*` set has split**: roadmap **step 8a shipped and CLOSED 2026-08-04**, so schema + implementation + frontend moved to `archive/` (see the Archive section); 8b is `plan-ui-polish.md` + `plan-avatar-system.md` and is still open. Only the password-reset doc below is live.

- **plan-accounts-password-reset.md** — **split out of the three archived docs (2026-07-29), runs after them and is still unscheduled**: optional recovery email, forgot/reset flow, session invalidation, real client-side routing, and the outbound-email infrastructure aura has none of. ⚑ Until it ships, a forgotten password is unrecoverable — an accepted interim state the register form states plainly

## Content (catalogs + zone design intent)

Structure (2026-07-16): **type catalogs** hold the *what* — one file per category, every
entry with a status (`idea` → `designed` → `in-game`); **zone docs** hold the *where* as
**design intent only** — exact runtime placement lives in the editor-authored zone JSON and
is never mirrored into docs. Catalogs and zone docs cross-reference by name (one source of
truth per thing). In-game entries point to their authoritative definition under `api/`.
All numbers are [PLACEHOLDER] until the balance pass. Ideas go **directly into the
matching catalog** with status `idea` — there is no separate inbox. Features/systems still
go to `backlog.md`; this section is content only.

- **content-auras.md** — active auras
- **content-passives.md** — passives
- **content-cooldowns.md** — cooldown abilities
- **content-recipes.md** — combination recipes (curated, secret, community-discovered)
- **content-npcs.md** — friendly/teaching NPC roster (identity, speech, teachings, placement intent)
- **content-mobs.md** — mob roster + category taxonomy (animals → dragons)
- **content-lore.md** — cross-zone worldbuilding: history, factions, tone
- **content-story.md** — cross-zone story arcs + breadcrumb chains
- **content-world.md** — zone progression map (21+ zones), scope tiers, connections, unplaced locations
- **content-skill-inventory.md** — **generated** from `api/` (not hand-maintained): every player skill with id, maxLevel, values and **unlock source**, plus the reachability sweep. The source of truth the three catalogs above point at; regenerate after any content chunk
- **content-zone1.md** — Zone 1 (village + forest) design intent
- **content-zone2.md** — Zone 2 (village + City Gates + the front) design intent

## Manuals (how-to)

- **manual-zone-editor.md** — step-by-step user manual for the in-game zone editor: setup, modes, placing/editing props+spawns, export→server round-trip
- **manual-content-authoring.md** — adding/replacing content by hand: new mobs (5-file EntityType path + `entityType` variant shortcut), new abilities, ability VFX, mob/player icons, scripted encounters/boss fights (§5); wire-touch table + hand-sync points
- **manual-db-migrations.md** — step-by-step user manual and runbook for database migrations: embedded `golang-migrate` architecture, up/down SQL authoring, testing, dirty-state recovery, and production operations

## Onboarding artifacts (human-facing, standalone HTML)

Point-in-time snapshots for humans, not maintained alongside the code — re-generate rather
than patch. PDF renders of the first two sit in the repo root.

- **developer-onboarding.html** — "Aura — Developer Onboarding" (2026-07-22)
- **feature-inventory.html** — "Aura — Feature Inventory" (2026-07-22)
- **accounts/chunk-1a-summary.html** — "Step 8a, Chunk 1a: the database foundation"
  (2026-07-31). Plain-language summary of what shipped, what it deliberately does not do,
  the three defects found, and where the code lives. ⚑ A *snapshot*, not a source of truth —
  the `plan-accounts-*.md` docs win on any disagreement. Written to be importable into
  Google Docs, hence HTML.

- **accounts/chunk-1b-summary.html** — "Step 8a, Chunk 1b: auth & sessions"
  (2026-08-01). Plain-language summary of the six auth primitives, the eight deliberate
  breakages that proved the tests can fail, the two architecture questions answered
  (login CPU vs the game loop; 100 concurrent players), the separate-accounts-database
  proposal and why it was rejected, and the three rules that keep a future machine split
  a deploy decision. ⚑ Same snapshot caveat as 1a's.

- **accounts/chunk-1c-summary.html** — "Step 8a, Chunk 1c: the eight endpoints"
  (2026-08-01). Plain-language summary of what a player can now do (create with no signup,
  come back, sign up without losing progress, log in, log out everywhere, delete), the
  character-name ruling and why `Barney Rubble` had to survive it, the two old permissive
  transport defaults that were closed, and the twelve deliberate breakages — eleven caught,
  the twelfth a wrong comment rather than a missing test. ⚑ Same snapshot caveat as 1a's.

- **accounts/chunk-2-summary.html** — "Step 8a, Chunk 2: the front door" (2026-08-01).
  What a player now clicks through, and the three decisions worth explaining: why Log in
  vanished from inside the game, why the delete countdown is not a security feature, and
  why the name suggester changed. ⚑ Same snapshot caveat as 1a's.

- **accounts/chunk-3-summary.html** — "Step 8a, Chunk 3: the authenticated door"
  (2026-08-02). How the play ticket works in plain terms, the three rules it makes true
  (one player one place, refresh proves identity, logout ends the game session), and what
  the PO hand-testing pass found — including the reconnect break that was hiding behind
  two unrelated-sounding reports. ⚑ Same snapshot caveat as 1a's.

- **accounts/chunk-4-summary.html** — "Step 8a, Chunk 4: your progress survives"
  (2026-08-02). Why saving and loading had to be one piece of work, how a snapshot reaches
  the database without the game loop ever waiting for it, when a save fires, and the three
  things that were nearly wrong — including the cleanup tool that broke while every test
  stayed green. ⚑ Same snapshot caveat as 1a's.

- **accounts/campfire-bind-fix.html** — "Bugfix: your campfire remembers you"
  (2026-08-02). The first reported bug against step 8a, and why it was a missing piece
  rather than a break: campfires had no name stable enough to write down. Covers why the
  bind is stored as an id and not a location, what happens to your bind when a campfire is
  deleted, and the second bug found while testing the first — a counter that kept counting
  the fire you had walked away from. ⚑ Same snapshot caveat as 1a's.

`docs/accounts/` also carries **session handovers** — working notes for picking a chunk up
cold, not snapshots. ⚑ **Disposable: delete one when its chunk lands**, so the folder never
accumulates stale instructions. Durable content belongs in the plan doc's chunk ledger.
There are none open: `chunk-4-handover.md` was deleted when chunk 4 landed on 2026-08-02,
per that rule.

## Research (investigations / assessments)

*Point-in-time when written; most are still forward-looking inputs to unbuilt work.*

- **research-code-quality.md** — code-quality items (level-scaling unification §3.2/§3.3 done); **§7 = 2026-07-22 re-assessment**: legacy layer + frontend/backend duplication closed, one new latent risk (`gameObjectClasses` positional array), and ⭐ three cheap recommended fixes (tests in CI · enum-keyed entity map · frontend typecheck)
- **research-content-pipeline.md** — designer-authoring pipeline gaps + preventive steps
- **research-v1-readiness.md** — prototype→live readiness assessment (ops/CI/observability gaps); feeds step 9
- **research-hosting.md** — hosting phases, load math, persistent-servers decision; Phase 0's runbook is `archive/plan-phase0-deploy.md` (superseded by the live `plan-playtest-deploy.md`), Phases 1+ still open

## Archive — `docs/archive/` (finished work, kept for rationale)

Not maintained, but **not dead**: several of these are still the only design record for a
system that is very much live, so read them for *why*, not for *current state*. Paths below
are relative to `docs/archive/`.

- **status-history.md** — verbatim `CLAUDE.md ## Status` entries that fell off the section's
  cap (last completed + 2 prior; see the `chunk-wrap` skill). Historical snapshots — their
  "open"/"next" claims may since be closed; the full ledgers are the plan-doc §-banners

### Execution-step records (the build order, oldest first)

- **archive-block2-survival-removal.md** — Block 2 (roadmap items 1+2): survival systems, crafting, inventory, item wire protocol removed; single resource established. Complete 2026-07-04
- **plan-skill-system.md** — the skill system: Phases 1–9 migration record **plus** the combination-system design and the skill wire protocol. Complete 2026-07-05 — still the reference for how skills work
- **plan-item11-hp-resist-variance.md** — absolute HP / resistances / damage tags / stat variance; decisions A1–A3, B1–B7. Complete 2026-07-06 — the damage-tag substrate is live
- **plan-effect-foundations.md** — effect-vocabulary scaling: decisions F1–F10 (stay in Go, no scripting for effects; primitive-first growth) + the candidate-effect cost map. Complete
- **plan-world-zones.md** — world & zones first slice: in-game editor, rectangular single-Space world, server-authoritative `zone.json`; decisions A–D. Complete 2026-07-08
- **plan-mob-depth.md** — mob depth & totems (step 2): 9 chunks (totem → flee → aggro/threat → steering → patrol → companion → taunt → support mobs → encounter-controller spine). Complete 2026-07-12 — the threat/encounter spine reference
- **plan-atmosphere-recovery.md** — atmosphere & recovery (step 3): regen combat gate → campfires → darkness & light → death state + campfire respawn. Complete 2026-07-13
- **plan-skill-vocab.md** — skill-vocabulary fill (step 4): shield/lifesteal/execute/crit/berserker/dash, cast-time + interrupt, tick-rate seam. Complete; §4.3 holds the crit v1→v2 rework
- **plan-npc-teaching.md** — unlock-source systems (step 5): teaching NPCs, one-way speech, zone-editor `npc` mode. Complete 2026-07-15
- **plan-sim-harness.md** — the balancing / what-if explorer (pre-step-6 gate): headless ECS runner, TTK/TTD/kills-per-hour batteries, guardrail asserts. Complete — *the tool itself is live; drive it via the `run-simharness` skill*
- **plan-content-zones12.md** — the content pass (step 6) for Zones 1+2: capability baseline, geography/story/mob/ability plan, systems-coverage table, chunks C0–C8. Complete 2026-07-21
- **plan-rebrand-cleanup.md** — rebrand to "Aura" + Berryhunter cleanup (step 7), `aa509d95`. Complete 2026-07-21 — records which Berryhunter references are *deliberately* kept
- **plan-accounts-schema.md · plan-accounts-implementation.md · plan-accounts-frontend.md** — **accounts & persistence (step 8a)**, the three-doc set: designed 2026-07-30, built across chunks 0 · 1a · 1b · 1c · 2 · 3 · 4, live on the playtest server, **CLOSED 2026-08-04**. Read schema (the DDL and why each shape) → implementation (§0 tech stack: pgx/v5, hand-written SQL, `golang-migrate` as a library; save triggers, snapshot mechanics, the sacrifice transaction, native Go auth) → frontend (anonymous-first join, register vs. login, 3 slots, soft-delete; **its §10a holds every chunk ledger**). ⚑ Read them for *why*, not current state — with one exception that IS current: **§8's ruling box in implementation.md — the step closed WITHOUT backups**, deliberately (PO 2026-08-04, the live server is a testing ground and infinite persistence is not the goal yet), and the durability items are the one part of this plan still owed. `plan-accounts-password-reset.md` stays live in `docs/`

### Fix / cleanup records

- **plan-reconnect-token.md** — reconnect-token persistence (`a8e82851`): reload restores the character via `sessionStorage` + append-only `Join`/`Accept` fields
- **plan-input-jitter.md** — dropped movement inputs → held-state model (`cb7f011f`): instrument-first, overturned the TCP-HoL hypothesis; server coasts, client re-sends "stopped" on release
- **plan-render-jitter.md** — walking micro-resets → buffered snapshot interpolation (`0e504c22`/`8a29a75c`/`c5064732`): tickrate align + `RENDER_DELAY_TICKS=2`, freeze-not-extrapolate
- **plan-entitytype-validation.md** — backlog §27.2.1 (`c3938be7`): the mob `EntityType` name-fallback validated at load, turning a live crash-at-first-spawn into a boot error
- **plan-resource-decay-prune.md** — backlog §26 (`ee9d42e9`+`a2ab90b5`): the dead resource/placeable/decay layer removed. Its §13 holds two process lessons (hidden webpack `require`s; rebuild **both** sides after content deletions)
- **plan-item-system-removal.md** — backlog §28 (`b9d01d33`+`2f933634`+Chunk 3): the dead Berryhunter item system removed in 3 chunks — backend registry, frontend scaffolding, then the wire-enum prune that **pinned explicit `EntityType`/`StatusEffect` values** so no future removal renumbers a survivor. Its §13 Chunk 3 records a plan audit that caught a broken repoint target before it shipped
- **plan-unlock-attribution.md** — unlock source attribution (`2bfee286`): `EntityMessage.kind=Unlock` labels every unlock from the 4 grant sites
- **plan-entity-model.md** — **the Actor model** (backlog §31; `cf9a10c7` 1a + `ee01ccdb` 1b + `0be771bd` 2 + `ba124ceb` 3a + `6368b2e5` 3b-i + `ef4355f1` 3b-ii + `759ddfb6` R1/R2/R5 + R4; **complete 2026-07-29**). Converged the player/mob/NPC stat model onto one Actor + optional capabilities, replaced the *inferred* roles with an authored `role` discriminator, and deleted `model/npc` — an NPC is now an ordinary actor carrying an `interaction` block. ⭐ Read it for the reframe: §31 read as *"three types should be one"*, but the code said the inverse — **`Mob` was ALREADY the universal entity doing five jobs, signalling which one by lying about its numbers** (`speed: 0` = structure, `velocity > 0` = follower), and that single defect was behind all five gaps. Measured outcome: `Mob` went 66 → 67 fields while absorbing a whole type, and **a talking follower needs zero new code**. 7 PO decisions; its §8b holds the latent traps that arm when quest-style content is authored, and it spawned `plan-faction-flips.md` (L2) and `backlog.md` §39
- **plan-faction-flips.md** — **runtime allegiance** (`ec73634e` the seam + `216f733b` calm + `153c0032` charm + `3b1b3ef6` the in-world teachers; **complete, every §8 question closed 2026-07-29**). Closed `plan-entity-model.md` L2 by replacing one undefined setter (`SetFaction`, whose `^f.Bit()` was an *undefined destination*, not a wrong value) with three defined verbs, then shipped **calm** and **charm** on top of it. Read it for **D2** — one accessor answering three questions (`owner` = *whose level* / *whose credit* / *whose signals*) is invisible until a caller needs them answered differently — and for **L-O**: skill-level JSON has no `DisallowUnknownFields`, so a faction allowlist must be *mandatory* per effect type or a typo reads as unrestricted. Hands one thing forward: `backlog.md` §39
- **plan-pre-accounts-hygiene.md** — **config truth + wire vestiges**, the last chunk before step 8 (`c183ce12` + `50a1e5c9`), run as **two sessions split at H1a** so that *"the other four changed nothing"* stayed a live check rather than a claim. Closed backlog §35 tier 1 and §30. ⚑ **The whole chunk came out byte-identical, H1a included** — the harness's 4× chase-margin drift turned out to be *latent*, because no battery scenario ever makes a mob approach, so TTK 6.67 s / TTD 8.70 s stand. Its §11 pins the four battery commands and the guardrail output's run-to-run map-ordering noise
- **plan-quests.md** — **the quest system** (backlog §42 + GDD §8 "Quests & the Journal"; designed 2026-07-29, built 2026-07-30 in six chunks: `d45ba07c` P + `d3b89328` C1 + `2a3b137d` C0 + `2dc6973a` C2 + `604f3f4d` C3 + `395177e4` C4; **complete 2026-07-30**). Journal-carried multi-stage quests with **no markers, ever**, riding the interaction container the Actor model already shipped. ⭐ Read it for the load-bearing shape: **branching is dialogue-shaped** — objective stages auto-advance off *lifetime* counters (so credit is retroactive and quests can never disagree with XP, D3/D4), while several rows on several NPCs can move the same stage to different next stages with different rewards, which is why "two NPCs finish the quest" is content and not a feature (D9, and `wolves-on-the-road` is the proof). Its traps are worth the read even outside quests: the ledger had to join the **death/reconnect stash** or every death wiped it (L11), the D17 banner notifier must be installed by the *owning* player because the ledger outlives the player struct, **terminality is derived rather than authored** (hence a two-phase cross-validation pass), and abandon + a mid-quest `grant_xp` is a loopable faucet (L10). §15 records what authoring the first four quests taught about the container itself
- **plan-conversation-journal.md** — **the conversation & journal pass** (planned 2026-07-30, built the same day in four chunks: `d23670d7` Q1 + `1dfb57d8` Q2 + `49b49857` Q3 + `3ccadb5e` Q4; **complete 2026-07-30**): the 13 items the PO's in-game walk of quest chunk C4 raised, every one verified against the running game before planning. What it left behind: `blockedLine` deleted (a greyed row is simply inert), **a quest row is shown iff its ledger op would succeed** (`Ledger.CanApply` — the show-rule that made Accept vanish while sibling questions stay, and then let Q4 author quest rows with zero `quest_at_stage` gates), talking in combat un-gated, server-composed objective lines with authored `tracker` overrides (`{n}/{m}` substitution), the two-pane journal with remembered selection, every conversant on R1's tree shape, the lamp quest simplified to the Lantern aura's only source (L5b), and Damage as a creation-seeded level-1 milestone. Its §2 is the measurement record: what looks like a content bug and is not, and what looks systemic and is not
- **plan-conf-duplication.md** — **backlog §35 tiers 2–5** (`e7531444` C1+C2 · C3+C4 2026-07-30; **complete 2026-07-30**). Every tuning value got one authored home: env confs shrunk to genuine deltas over a now-total Go defaulting layer, unknown conf keys warn at boot, the tier-3 Go literals are pinned by tests, `spacedName()` died in favour of the served `/mobs` `displayName`, `ActivationRejection` became a pinned wire enum, and `api/shared-constants.json` pins the pip/ring/tier bit tables + viewport/tickrate from both languages. Read it for the C1.3 finding — a *rounded* JSON restatement split the fleet at float32 in production's favour — and for the deliberate-mirror rule: pinned, not unified

- **plan-feel-pass-2.md** — **what came back from the R1–R3 checklist** (planned 2026-08-01, **built 2026-08-02, all five chunks N1–N5 in one session; complete**): the second PO feel pass on the priced catalog — the R-series landed, so what came back was presentation, one live bug and two design questions, ruled into 5 decisions and 5 chunks. What it left behind: the Focus bar's denominator is total effective HP (a shield larger than the pool no longer paints the whole bar — `ShieldBarMath`, shared by all three bars incl. the mob overhead the plan had missed) · tooltip cost lines grouped by charge trigger + one shared `Ticks every` line (sum-of-rounded, never rounded-sum) · **dots leech** (`tickBuffEvents` had no `Lifesteal` field — no dot had ever leeched; read live at each burn tick off the post-credit caster, D1) · **quest progress counts per stage entry** (`Progress.KillBase`/`TalkBase`, reversing `archive/plan-quests.md` D3 in place; the baselines are persisted state recorded in `plan-accounts-schema.md` ahead of 8a) · the ring pulse + HUD metronome with the `BeatDetector` switch-reset guard. Its §6 holds the deliberate parkings (Damage's dead levels + the guard test → backlog §37)

- **plan-world-map.md** — **the world map & minimap rework** (fast travel part 1, closes half of backlog §41; designed and built 2026-08-04 in three chunks: `f09d99d0` C1 + `6c0888ff` C2 + `106585c4` C3; **complete, live, mobile-verified 2026-08-04**). Today's minimap became the **docked state of one map module**, with a full-screen state on `M` / a HUD button / a minimap tap; then discovered campfires with per-character persistence; then a ~1 Hz `PlayerRoster` message putting every online player on both states. ⭐ Read it for the three surveys that were wrong and what each cost: **§4.2's "no fog of war"** and **§8's "no schema change"** were both reversed by PO rulings mid-plan (the second pulled `plan-flight-paths.md` C1 wholesale into C2, so part 2 now restarts at *its* C2), and **§2's "other characters already appear on the minimap"** was simply false — `visibleOnMinimap` is `false` in `Character`'s constructor and only the local `Player` flips it true, which is what made C3 *smaller* than billed and dissolved its own landmine 6. Its durable traps: **`Welcome` cannot carry per-character data** (sent on connect, before Join, from one shared message), a marker layer must be inserted **by index** and sits **between** the icon layers, and **the map and the world have deliberately OPPOSITE draw orders** — a map marker ranks by information value, a world sprite by physical sense. ⚑ Twice a bug shipped to the PO while **every harness leg passed**, which is why depth is now asserted as stage indices; and a harness that assumed it was alone on the dev server went red because the PO was playing on it. Hands forward: the marker sizes/colour [PLACEHOLDER], and your own dot being invisible while you stand at your bound fire

### Playtest / deploy records

- **plan-playtest1-feedback.md** — first external playtest (2026-07-22) triaged into Passes A/B/C; fully executed (its last open items 1c+1d landed in `2bfee286`). Superseded as the intake point by the live `plan-playtest-feedback.md`; the design themes it spun off (aura differentiation, tutorial/onboarding, quests) are still open and partly picked up there
- **plan-phase0-deploy.md** — Phase-0 deploy runbook, **never executed as written**; superseded by the live `plan-playtest-deploy.md`. Kept for the runbook detail

### Pre-decision research & captures

- **archive-session-log.md** — verbatim snapshot of CLAUDE.md's old migration-status changelog chain (pre-2026-07-12 history)
- **archive-content-zone1-capture.md** — the 2026-07-09 content capture (was `plan-content-zone1.md`), absorbed into the `content-*.md` set; keeps two resolved-conflict rationales (turnips=harvest-mobs, peasant onboarding)
- **archive-scripting-audit.md** + **archive-scripting-options.md** — data-vs-Go audit and scripting/expression-layer options (decided → `plan-effect-foundations.md`)
- **archive-combo-questions.md** — resolved Phase-9 combo question catalog (rationale record)
- **archive-combat-pacing-recovery.md** — combat pacing/recovery research + decision banner; every decision it carried was executed as step 3. *Was `research-combat-pacing-recovery.md` until 2026-07-21*
