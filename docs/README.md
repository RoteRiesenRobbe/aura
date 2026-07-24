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

- **plan-item-system-removal.md** — backlog §28, **in progress**: 3 chunks removing the dead item system. Chunks 1+2 done (`b9d01d33`, `2f933634`); **Chunk 3** (FlatBuffers dead-wire-enum prune) is the last one, to be done before step-8 persistence
- **plan-intermission-triage.md** — the PO's 22 post-C7 playtest items (bugs, config fixes, audits, design questions), each investigated against code with effort estimates + a locked execution sequence. Largely executed; still the home of the open combat-readability and sacrifice-loop items
- **plan-ui-polish.md** — UI-polish pass (step 8, item-8 slice): Chunk 1 done (`GET /skills` catalog + skill tooltips); the rest of the checklist is deferred (§Deferred)
- **plan-playtest-deploy.md** — the live server (2026-07-21, `a7a2267d`): Hetzner VPS, `devops/deploy.sh`, server-only cheat token, **no persistence** (restarts wipe characters). Live-ops reference; its §Ops & security posture is a required input to step-8 persistence
- **plan-onboarding-cleanup.md** — **not started** (2026-07-23): documentation & repo cleanup for human coworkers across code/art/audio/design. Its Workstream B is what created `archive/`; Workstreams A/C–G are still open
- **plan-avatar-system.md** — design sketch, unscheduled: join-screen portrait picker + icon-unlock track, for step 8

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

## Onboarding artifacts (human-facing, standalone HTML)

Point-in-time snapshots for humans, not maintained alongside the code — re-generate rather
than patch. PDF renders of both sit in the repo root.

- **developer-onboarding.html** — "Aura — Developer Onboarding" (2026-07-22)
- **feature-inventory.html** — "Aura — Feature Inventory" (2026-07-22)

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

### Fix / cleanup records

- **plan-reconnect-token.md** — reconnect-token persistence (`a8e82851`): reload restores the character via `sessionStorage` + append-only `Join`/`Accept` fields
- **plan-input-jitter.md** — dropped movement inputs → held-state model (`cb7f011f`): instrument-first, overturned the TCP-HoL hypothesis; server coasts, client re-sends "stopped" on release
- **plan-render-jitter.md** — walking micro-resets → buffered snapshot interpolation (`0e504c22`/`8a29a75c`/`c5064732`): tickrate align + `RENDER_DELAY_TICKS=2`, freeze-not-extrapolate
- **plan-entitytype-validation.md** — backlog §27.2.1 (`c3938be7`): the mob `EntityType` name-fallback validated at load, turning a live crash-at-first-spawn into a boot error
- **plan-resource-decay-prune.md** — backlog §26 (`ee9d42e9`+`a2ab90b5`): the dead resource/placeable/decay layer removed. Its §13 holds two process lessons (hidden webpack `require`s; rebuild **both** sides after content deletions)
- **plan-unlock-attribution.md** — unlock source attribution (`2bfee286`): `EntityMessage.kind=Unlock` labels every unlock from the 4 grant sites

### Playtest / deploy records

- **plan-playtest1-feedback.md** — first external playtest (2026-07-22) triaged into Passes A/B/C; fully executed. The design themes it spun off are still open
- **plan-phase0-deploy.md** — Phase-0 deploy runbook, **never executed as written**; superseded by the live `plan-playtest-deploy.md`. Kept for the runbook detail

### Pre-decision research & captures

- **archive-session-log.md** — verbatim snapshot of CLAUDE.md's old migration-status changelog chain (pre-2026-07-12 history)
- **archive-content-zone1-capture.md** — the 2026-07-09 content capture (was `plan-content-zone1.md`), absorbed into the `content-*.md` set; keeps two resolved-conflict rationales (turnips=harvest-mobs, peasant onboarding)
- **archive-scripting-audit.md** + **archive-scripting-options.md** — data-vs-Go audit and scripting/expression-layer options (decided → `plan-effect-foundations.md`)
- **archive-combo-questions.md** — resolved Phase-9 combo question catalog (rationale record)
- **archive-combat-pacing-recovery.md** — combat pacing/recovery research + decision banner; every decision it carried was executed as step 3. *Was `research-combat-pacing-recovery.md` until 2026-07-21*
