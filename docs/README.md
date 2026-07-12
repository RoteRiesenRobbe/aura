# docs/ — index

Naming convention: core docs unprefixed; `plan-` = execution plan/record per work item;
`research-` = point-in-time investigation/assessment; `archive-` = resolved/historical, kept
for rationale; `manual-` = how-to guide.

**Where status lives:** `roadmap.md` holds the authoritative "Execution order" + per-item
status. CLAUDE.md carries only a two-line pointer to the last-completed and next plan docs.

## Core

- **gdd.md** — game design truth: vision, mechanics intent, open design questions
- **tdd.md** — technical big picture: architecture, decided/open tech questions, risks, known bugs / standing gotchas
- **roadmap.md** — v1.0 scope + per-item status; **authoritative "Execution order"**
- **backlog.md** — unscoped feature ideas with open-question catalogs
- **architecture.md** — runtime cost model, scaling limits, zones-as-Spaces & fluid transitions, hazard/encounter runtime cost

## Plans / execution records

- **plan-skill-system.md** — skill system design + migration record (Phases 1–9, complete); combination system; wire protocol
- **plan-block2-survival-removal.md** — Block 2 (items 1+2) execution record, complete
- **plan-item11-hp-resist-variance.md** — absolute HP / resistances/damage tags / stat variance; decisions A1–A3, B1–B7 (all done)
- **plan-effect-foundations.md** — effect-vocabulary scaling: decisions F1–F10 (stay Go, no scripting for effects; primitive-first growth) + tackle-now sequence and candidate-effect cost map
- **plan-world-zones.md** — world & zones first slice (roadmap item 4 + placement/respawn half of item 7): in-game editor, rectangular single-Space world, server-authoritative zone.json; decisions A–D + six-chunk plan + pitfalls
- **plan-mob-depth.md** — mob depth & totems (execution step 2): 9-chunk plan + records (totem → flee → aggro/threat → steering → patrol → companion → taunt → support mobs → encounter-controller spine); decisions in §1.3/§3.1; open ⚑ in §6
- **plan-atmosphere-recovery.md** — atmosphere & recovery (execution step 3): 4-chunk plan (regen combat gate → campfires → darkness & light → death state + campfire respawn); decisions, recon anchors in §2, gotchas in §4, open ⚑ in §6
- **plan-rebrand-cleanup.md** — rebrand to "Aura" + Berryhunter cleanup: phased plan, scheduled as execution-order step 7; chieftain-deletion decision
- **plan-content-zone1.md** — CAPTURED (not scoped) content for Zone 1 + the 21-zone progression + mob-category taxonomy (content-pass / step 6 material)

## Manuals (how-to)

- **manual-zone-editor.md** — step-by-step user manual for the in-game zone editor: setup, modes, placing/editing props+spawns, export→server round-trip
- **manual-content-authoring.md** — adding/replacing content by hand: new mobs (5-file EntityType path + `entityType` variant shortcut), new abilities, ability VFX, mob/player icons, scripted encounters/boss fights (§5); wire-touch table + hand-sync points

## Research (point-in-time)

- **research-code-quality.md** — code-quality items (level-scaling unification §3.2/§3.3 done)
- **research-combat-pacing-recovery.md** — combat pacing/recovery research + decision banner (feeds plan-atmosphere-recovery.md)
- **research-content-pipeline.md** — designer-authoring pipeline gaps + preventive steps
- **research-v1-readiness.md** — prototype→live readiness assessment (ops/CI/observability gaps)

## Archive (resolved / historical)

- **archive-session-log.md** — verbatim snapshot of CLAUDE.md's old migration-status changelog chain (pre-2026-07-12 history)
- **archive-scripting-audit.md** + **archive-scripting-options.md** — data-vs-Go audit and scripting/expression-layer options (decided → plan-effect-foundations.md)
- **archive-combo-questions.md** — resolved Phase-9 combo question catalog (rationale record)
