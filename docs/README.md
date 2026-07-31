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

- **plan-playtest-feedback.md** — **the standing collection of playtest-arising issues** (successor to `archive/plan-playtest1-feedback.md`). Round 2 (2026-07-24) triaged and sorted into Pass 1 (point curve + resource costs + retune) / Pass 2 (pulsing auras, directional ability, anti-AFK patrols) / Pass 3 (XP credit, minion combos) + rolling filler. New playtest rounds append to §Intake; we pick targets from here
- **plan-intermission-triage.md** — the PO's 22 post-C7 playtest items (bugs, config fixes, audits, design questions), each investigated against code with effort estimates + a locked execution sequence. Largely executed; still the home of the open combat-readability and sacrifice-loop items
- **plan-ui-polish.md** — UI-polish pass (step **8b**, item-8 slice): Chunk 1 done (`GET /skills` catalog + skill tooltips); the rest of the checklist is deferred (§Deferred)
- **plan-playtest-deploy.md** — the live server (2026-07-21, `a7a2267d`): Hetzner VPS, `devops/deploy.sh`, server-only cheat token, **no persistence** (restarts wipe characters). Live-ops reference; its §Ops & security posture is a required input to step-8 persistence
- **plan-onboarding-cleanup.md** — **not started** (2026-07-23): documentation & repo cleanup for human coworkers across code/art/audio/design. Its Workstream B is what created `archive/`; Workstreams A/C–G are still open
- **plan-conversation-journal.md** — **the conversation & journal pass** (planned 2026-07-30, not started): the 13 items the PO's in-game walk of quest chunk C4 raised, verified against the running game and sorted into 4 chunks — the dialogue system (`blockedLine` deleted so a greyed row is simply inert, **a quest row shown iff its ledger op would succeed** — which is what makes an Accept row vanish while its sibling questions stay — talking in combat, a "Leave." row), server-composed objective tracking (`3/8 Wolves slain`), a two-pane journal, and the content/writing pass. Its §2 is the measurement record: what looks like a content bug and is not, and what looks systemic and is not
- **plan-avatar-system.md** — design sketch, unscheduled: join-screen portrait picker + icon-unlock track, for step **8b** (its chunks 1–3 need no accounts; only chunk 4, avatar persistence, waits on 8a)

**The four `plan-accounts-*` docs are one set** — roadmap **step 8a** (item 3); 8b is `plan-ui-polish.md` + `plan-avatar-system.md`. Read schema → implementation → frontend; password-reset runs after all three. ⚑ The quest first pass that D12 put in front of 8a **has shipped** (chunks P + C0–C4, `archive/plan-quests.md`), so 8a's remaining prerequisite is the manual Postgres step in `plan-accounts-implementation.md` §0.

- **plan-accounts-schema.md** — the DDL: `accounts` + `account_credentials` (credentials split out so game queries never read password material), `characters` with per-slot bloodlines, spellbook/loadout/flags child tables, succession chain, erasure. Its §"Hashing: lookup keys vs. verifiers" is the one section to read before touching any secret column
- **plan-accounts-implementation.md** — step 8 companion: **§0 the tech stack** (pgx/v5 + pgxpool, hand-written SQL, `golang-migrate` as a library, Postgres as an OS package on the same VPS, throttle mechanism, audit table — read this first when executing 1a), save triggers, the sacrifice transaction, snapshot mechanics + field-by-field Go↔column mapping, failure modes, player-facing errors, **native Go auth** (bcrypt + JWT; §7 records why the third-party Java fork was reviewed and rejected)
- **plan-accounts-frontend.md** — step 8 companion: login/character-select flow (anonymous-first, register vs. login, 3 character slots, soft-delete) — amended the two docs above to drop the one-active-character assumption; its §12 records a pre-existing disconnect-to-escape exploit
- **plan-accounts-password-reset.md** — **split out of the three above (2026-07-29), runs after them**: optional recovery email, forgot/reset flow, session invalidation, real client-side routing, and the outbound-email infrastructure aura has none of. ⚑ Until it ships, a forgotten password is unrecoverable — an accepted interim state the register form states plainly

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
- **plan-item-system-removal.md** — backlog §28 (`b9d01d33`+`2f933634`+Chunk 3): the dead Berryhunter item system removed in 3 chunks — backend registry, frontend scaffolding, then the wire-enum prune that **pinned explicit `EntityType`/`StatusEffect` values** so no future removal renumbers a survivor. Its §13 Chunk 3 records a plan audit that caught a broken repoint target before it shipped
- **plan-unlock-attribution.md** — unlock source attribution (`2bfee286`): `EntityMessage.kind=Unlock` labels every unlock from the 4 grant sites
- **plan-entity-model.md** — **the Actor model** (backlog §31; `cf9a10c7` 1a + `ee01ccdb` 1b + `0be771bd` 2 + `ba124ceb` 3a + `6368b2e5` 3b-i + `ef4355f1` 3b-ii + `759ddfb6` R1/R2/R5 + R4; **complete 2026-07-29**). Converged the player/mob/NPC stat model onto one Actor + optional capabilities, replaced the *inferred* roles with an authored `role` discriminator, and deleted `model/npc` — an NPC is now an ordinary actor carrying an `interaction` block. ⭐ Read it for the reframe: §31 read as *"three types should be one"*, but the code said the inverse — **`Mob` was ALREADY the universal entity doing five jobs, signalling which one by lying about its numbers** (`speed: 0` = structure, `velocity > 0` = follower), and that single defect was behind all five gaps. Measured outcome: `Mob` went 66 → 67 fields while absorbing a whole type, and **a talking follower needs zero new code**. 7 PO decisions; its §8b holds the latent traps that arm when quest-style content is authored, and it spawned `plan-faction-flips.md` (L2) and `backlog.md` §39
- **plan-faction-flips.md** — **runtime allegiance** (`ec73634e` the seam + `216f733b` calm + `153c0032` charm + `3b1b3ef6` the in-world teachers; **complete, every §8 question closed 2026-07-29**). Closed `plan-entity-model.md` L2 by replacing one undefined setter (`SetFaction`, whose `^f.Bit()` was an *undefined destination*, not a wrong value) with three defined verbs, then shipped **calm** and **charm** on top of it. Read it for **D2** — one accessor answering three questions (`owner` = *whose level* / *whose credit* / *whose signals*) is invisible until a caller needs them answered differently — and for **L-O**: skill-level JSON has no `DisallowUnknownFields`, so a faction allowlist must be *mandatory* per effect type or a typo reads as unrestricted. Hands one thing forward: `backlog.md` §39
- **plan-pre-accounts-hygiene.md** — **config truth + wire vestiges**, the last chunk before step 8 (`c183ce12` + `50a1e5c9`), run as **two sessions split at H1a** so that *"the other four changed nothing"* stayed a live check rather than a claim. Closed backlog §35 tier 1 and §30. ⚑ **The whole chunk came out byte-identical, H1a included** — the harness's 4× chase-margin drift turned out to be *latent*, because no battery scenario ever makes a mob approach, so TTK 6.67 s / TTD 8.70 s stand. Its §11 pins the four battery commands and the guardrail output's run-to-run map-ordering noise
- **plan-quests.md** — **the quest system** (backlog §42 + GDD §8 "Quests & the Journal"; designed 2026-07-29, built 2026-07-30 in six chunks: `d45ba07c` P + `d3b89328` C1 + `2a3b137d` C0 + `2dc6973a` C2 + `604f3f4d` C3 + `395177e4` C4; **complete 2026-07-30**). Journal-carried multi-stage quests with **no markers, ever**, riding the interaction container the Actor model already shipped. ⭐ Read it for the load-bearing shape: **branching is dialogue-shaped** — objective stages auto-advance off *lifetime* counters (so credit is retroactive and quests can never disagree with XP, D3/D4), while several rows on several NPCs can move the same stage to different next stages with different rewards, which is why "two NPCs finish the quest" is content and not a feature (D9, and `wolves-on-the-road` is the proof). Its traps are worth the read even outside quests: the ledger had to join the **death/reconnect stash** or every death wiped it (L11), the D17 banner notifier must be installed by the *owning* player because the ledger outlives the player struct, **terminality is derived rather than authored** (hence a two-phase cross-validation pass), and abandon + a mid-quest `grant_xp` is a loopable faucet (L10). §15 records what authoring the first four quests taught about the container itself
- **plan-conf-duplication.md** — **backlog §35 tiers 2–5** (`e7531444` C1+C2 · C3+C4 2026-07-30; **complete 2026-07-30**). Every tuning value got one authored home: env confs shrunk to genuine deltas over a now-total Go defaulting layer, unknown conf keys warn at boot, the tier-3 Go literals are pinned by tests, `spacedName()` died in favour of the served `/mobs` `displayName`, `ActivationRejection` became a pinned wire enum, and `api/shared-constants.json` pins the pip/ring/tier bit tables + viewport/tickrate from both languages. Read it for the C1.3 finding — a *rounded* JSON restatement split the fleet at float32 in production's favour — and for the deliberate-mirror rule: pinned, not unified

### Playtest / deploy records

- **plan-playtest1-feedback.md** — first external playtest (2026-07-22) triaged into Passes A/B/C; fully executed (its last open items 1c+1d landed in `2bfee286`). Superseded as the intake point by the live `plan-playtest-feedback.md`; the design themes it spun off (aura differentiation, tutorial/onboarding, quests) are still open and partly picked up there
- **plan-phase0-deploy.md** — Phase-0 deploy runbook, **never executed as written**; superseded by the live `plan-playtest-deploy.md`. Kept for the runbook detail

### Pre-decision research & captures

- **archive-session-log.md** — verbatim snapshot of CLAUDE.md's old migration-status changelog chain (pre-2026-07-12 history)
- **archive-content-zone1-capture.md** — the 2026-07-09 content capture (was `plan-content-zone1.md`), absorbed into the `content-*.md` set; keeps two resolved-conflict rationales (turnips=harvest-mobs, peasant onboarding)
- **archive-scripting-audit.md** + **archive-scripting-options.md** — data-vs-Go audit and scripting/expression-layer options (decided → `plan-effect-foundations.md`)
- **archive-combo-questions.md** — resolved Phase-9 combo question catalog (rationale record)
- **archive-combat-pacing-recovery.md** — combat pacing/recovery research + decision banner; every decision it carried was executed as step 3. *Was `research-combat-pacing-recovery.md` until 2026-07-21*
