# docs/ — index

Naming convention: core docs unprefixed; `plan-` = execution plan/record per work item;
`research-` = point-in-time investigation/assessment; `archive-` = resolved/historical, kept
for rationale; `manual-` = how-to guide; `content-` = game-content catalogs + per-zone
design intent (see Content section for the conventions).

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

## Plans / execution records

- **plan-skill-system.md** — skill system design + migration record (Phases 1–9, complete); combination system; wire protocol
- **plan-item11-hp-resist-variance.md** — absolute HP / resistances/damage tags / stat variance; decisions A1–A3, B1–B7 (all done)
- **plan-effect-foundations.md** — effect-vocabulary scaling: decisions F1–F10 (stay Go, no scripting for effects; primitive-first growth) + tackle-now sequence and candidate-effect cost map
- **plan-world-zones.md** — world & zones first slice (roadmap item 4 + placement/respawn half of item 7): in-game editor, rectangular single-Space world, server-authoritative zone.json; decisions A–D + six-chunk plan + pitfalls
- **plan-mob-depth.md** — mob depth & totems (execution step 2): 9-chunk plan + records (totem → flee → aggro/threat → steering → patrol → companion → taunt → support mobs → encounter-controller spine); decisions in §1.3/§3.1; open ⚑ in §6
- **plan-atmosphere-recovery.md** — atmosphere & recovery (execution step 3): 4-chunk plan (regen combat gate → campfires → darkness & light → death state + campfire respawn); decisions, recon anchors in §2, gotchas in §4, open ⚑ in §6
- **plan-rebrand-cleanup.md** — rebrand to "Aura" + Berryhunter cleanup: phased plan, executed as step 7 (complete 2026-07-21, `aa509d95`); chieftain-deletion decision
- **plan-content-zones12.md** — content pass (step 6) plan + record for Zones 1+2: code-verified capability baseline, geography/story/mob/ability plan, required code lifts, systems-coverage table, Front-Aura + Ork-boss tickets (§A/§B), execution chunks C0–C8 (§13). **Complete 2026-07-21**
- **plan-skill-vocab.md** — skill-vocabulary fill (step 4) plan + record: shield/lifesteal/execute/crit/berserker/dash, cast-time + interrupt, tick-rate seam; 6 chunks, complete. §4.3 holds the crit v1→v2 rework
- **plan-npc-teaching.md** — unlock-source systems (step 5): teaching NPCs, one-way speech, zone-editor `npc` mode; 6 chunks, complete
- **plan-sim-harness.md** — the balancing / what-if explorer (pre-step-6 gate): headless ECS runner, TTK/TTD/kills-per-hour batteries, guardrail asserts; 4 chunks, complete. Live tooling — drive it via the `run-simharness` skill
- **plan-intermission-triage.md** — the PO's 22 post-C7 playtest items (bugs, config fixes, audits, design questions), each investigated against code with effort estimates + a locked execution sequence. Largely executed; still the home of the open combat-readability and sacrifice-loop items
- **plan-phase0-deploy.md** — Phase-0 "friends playtest" deploy runbook (~20 players, single VPS + systemd + autocert). **Not yet executed**
- **plan-avatar-system.md** — design sketch (not scheduled): join-screen portrait picker + icon-unlock track, for step 8

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

## Research (investigations / assessments)

*Point-in-time when written; most are still forward-looking inputs to unbuilt work.*

- **research-code-quality.md** — code-quality items (level-scaling unification §3.2/§3.3 done)
- **research-content-pipeline.md** — designer-authoring pipeline gaps + preventive steps
- **research-v1-readiness.md** — prototype→live readiness assessment (ops/CI/observability gaps); feeds step 9
- **research-hosting.md** — hosting phases, load math, persistent-servers decision; Phase 0 is planned in `plan-phase0-deploy.md`, Phases 1+ still open

## Archive (resolved / historical)

- **archive-session-log.md** — verbatim snapshot of CLAUDE.md's old migration-status changelog chain (pre-2026-07-12 history)
- **archive-content-zone1-capture.md** — the 2026-07-09 content capture (was plan-content-zone1.md), absorbed into the content-*.md set; keeps the two resolved-conflict rationales (turnips=harvest-mobs, peasant onboarding)
- **archive-scripting-audit.md** + **archive-scripting-options.md** — data-vs-Go audit and scripting/expression-layer options (decided → plan-effect-foundations.md)
- **archive-combo-questions.md** — resolved Phase-9 combo question catalog (rationale record)
- **archive-combat-pacing-recovery.md** — combat pacing/recovery research + decision banner; every decision it carried was executed as step 3 (`plan-atmosphere-recovery.md`). *Was `research-combat-pacing-recovery.md` until 2026-07-21*
- **archive-block2-survival-removal.md** — Block 2 (roadmap items 1+2) execution record, complete 2026-07-04. *Was `plan-block2-survival-removal.md` until 2026-07-21*
