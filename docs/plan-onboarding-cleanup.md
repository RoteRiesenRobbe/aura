# Plan: Documentation & repo cleanup for human onboarding

> **Status:** LIVE plan — not started (created 2026-07-23). Planning session; no code written.

## Context

The project has been built solo (PO + AI agent) and is about to gain human coworkers
working in four disciplines: **code, art, audio, and game design**. The current
documentation is optimized for a single agent-driven workflow, not a team:

- **CLAUDE.md** carries a ~50 KB machine-oriented `## Status` wall that is the *de facto*
  source of truth for project state — unreadable as a human onboarding surface.
- **docs/** holds 54 markdown files (~20 k lines). Plan docs double as historical records,
  so a newcomer cannot tell a *live* doc from a settled *archive* without reading it.
- There is a good **developer-onboarding.html** (code-focused, 12 sections) but **no
  art, audio, or design onboarding path**, and no single "start here by role" entry.
- Code has **no package doc comments** on most Go packages, 29 scattered TODO/FIXME
  markers, and legacy `berryhunter` naming leftovers (e.g. `derpy-berryhunter.mp3`,
  a `bhclient` command) that will confuse someone new.

**Decided constraints (from the PO):**
1. **Mixed AI usage** — some coworkers will use Claude Code, some won't. Human-facing
   docs must be *self-sufficient prose*; the agent scaffolding (CLAUDE.md, `.claude/skills/`,
   the plan-doc workflow) becomes an **opt-in appendix**, not a prerequisite.
2. **Docs depth = entry layer + archive sweep** — keep filenames/structure, add role-based
   entry docs, move completed plan *records* to `docs/archive/`, put a status banner on
   every doc that stays. No full folder reorg (would break every cross-reference).
3. **Work tracking is undecided** — this plan is written to *not depend* on the answer;
   the choice (GitHub issues vs. keep plan-docs) is flagged as an explicit open item.
4. **Art/audio reference = existing assets are canon + PO will supply extra references** —
   document conventions by reading the shipped assets, then a capture session with the PO
   fills the gaps.

**Intended outcome:** a newcomer in any of the four roles can clone the repo, find a single
"start here" page, follow a path tailored to their discipline, get the game running, and
know where the live truth lives — without reading agent status walls or 20 k lines of history.

---

## Workstream A — Entry layer (the biggest win)

Create a small set of role-based entry docs. These are the front door; everything else is
reference they link into.

- **`docs/onboarding.md` (new)** — one page, ~1 screen. "Welcome, here's the project in 5
  sentences, here's your path by role." Four links: Code / Art / Audio / Design. Points at
  `README.md` for setup. This is the single URL a new hire receives.
- **`docs/onboarding-code.md`** — thin wrapper that points at the existing
  `developer-onboarding.html` (already strong) + the "run it" steps + testing conventions
  (`go test ./...`, TDD rule from CLAUDE.md), + the KISS/DRY/YAGNI principles. Mostly links.
- **`docs/onboarding-art.md` (new)** — see Workstream D.
- **`docs/onboarding-audio.md` (new)** — see Workstream E.
- **`docs/onboarding-design.md` (new)** — thin wrapper: read `gdd.md` (esp. §1 Vision, §4
  Auras, §12 Open Design Questions), then `content-*.md` catalogs and how they map to `api/`
  JSON, then `manual-content-authoring.md` + `manual-zone-editor.md` as the hands-on path.

**Decision to confirm during execution:** whether `developer-onboarding.html` /
`feature-inventory.html` (and their root-level `.pdf` twins) stay HTML/PDF or get folded into
markdown. Recommendation: keep the HTML as the rich read, delete the redundant root `.pdf`s
(they duplicate the HTML and go stale silently), and have `onboarding-code.md` link the HTML.

## Workstream B — docs/ status clarity + archive sweep

Make "live vs. history" obvious without moving files around wholesale.

- **Status banner on every surviving doc** — a one-line header block at the top:
  `> **Status:** LIVE reference · last reviewed 2026-07-23` or
  `> **Status:** HISTORICAL RECORD — complete, kept for rationale. Not maintained.`
  Applied to all `plan-*`, `research-*`, `content-*`, core docs.
- **`docs/archive/` folder** — move completed plan *records* whose work is fully shipped and
  won't be resumed. Candidates from the survey (confirm each against roadmap before moving):
  `plan-rebrand-cleanup.md`, `plan-skill-system.md`, `plan-skill-vocab.md`, `plan-npc-teaching.md`,
  `plan-sim-harness.md`, `plan-content-zones12.md`, `plan-mob-depth.md`, `plan-atmosphere-recovery.md`,
  `plan-world-zones.md`, `plan-item11-hp-resist-variance.md`, `plan-effect-foundations.md`,
  `plan-phase0-deploy.md`, `plan-reconnect-token.md`. The already-named `archive-*.md` files
  move into `docs/archive/` too and drop the prefix.
  **Keep in place (still live/open):** `plan-input-jitter.md` (planned, not started),
  `plan-playtest1-feedback.md` (Pass-B 1c+1d open), `plan-intermission-triage.md` (open items),
  `plan-ui-polish.md`, `plan-playtest-deploy.md` (live-ops ref), `plan-avatar-system.md` (step 8).
- **Rewrite `docs/README.md`** — it's already a good index; update it for the new entry docs,
  the `archive/` move, and a clear "if you want *current* status, it lives in X" pointer
  (see Workstream C). Add a legend for the status banners.
- **Cross-reference fix pass** — moving files into `archive/` breaks links. Grep for each moved
  filename across `docs/`, `CLAUDE.md`, `README.md`, `.claude/skills/`, and the onboarding
  HTML; update paths. This is the one mechanical cost of the archive move and must be complete
  or newcomers hit dead links.

## Workstream C — Decouple human status from the agent file

Today CLAUDE.md `## Status` is both the agent's briefing *and* the only current-state record.
Humans shouldn't have to read it.

- **`docs/status.md` (new)** — a short, human-written "where the project is right now": what's
  live, what's in flight, known live bugs (input jitter, day/night off), the open PO calls.
  A paragraph per topic, not a changelog. This becomes the human answer to "what's going on?"
- **CLAUDE.md stays the agent file** but its `## Status` block gets a one-line pointer at the
  top: "Human-readable status: `docs/status.md`." No need to slim the wall itself — just stop
  making humans depend on it.
- **`docs/README.md` "Where status lives"** section updated to name `docs/status.md` as the
  human layer alongside the existing four (CLAUDE.md / roadmap / plan banners / MEMORY.md).

## Workstream D — Art onboarding & style reference

The only written art convention today is the portrait checklist in
`manual-content-authoring.md §4`. 163 SVGs + a few PNG/JPG are the *de facto* canon.

- **`docs/onboarding-art.md` (new)** — where art lives (`frontend/src/features/*/assets/`,
  the `game-objects/assets/{characters,mobs,resources,icons,effects}` tree), the file formats
  in use (SVG for entities/icons, PNG/JPG for a few), how an asset gets referenced in code
  (`require('../assets/x.svg')`), and the add-a-mob-sprite / add-an-icon path (link into
  manual §1 Frontend/art and §4).
- **`docs/style-art.md` (new)** — the style guide. Seed it from: (a) the existing portrait
  checklist (move/expand from manual §4), (b) a read-through of the shipped SVGs to document
  size/viewBox/stroke/palette conventions, (c) **a capture session with the PO** for the
  references they hold (top-down direction à la Hotline Miami / Monaco / Rimworld per GDD §10 —
  *not* isometric, *not* pixel art). Mark anything ambiguous as an open PO call rather than
  inventing a rule.
- **Legacy asset flag:** `derpy-berryhunter.mp3` and any `berryhunter`-named art are noted as
  rename candidates (see Workstream F) so they don't read as "the brand" to a newcomer.

## Workstream E — Audio onboarding & guide

Audio is currently **music-only**: a single looping track (`derpy-berryhunter.mp3`) wired via
`features/audio/logic/Music.ts`. SFX scaffolding exists (`SoundData.ts`, `Audio.ts`,
`TriggerIntervalMap.ts`, `SpatialAudio.ts`) but **no SFX are wired** — it's the deferred
step-8 audio work.

- **`docs/onboarding-audio.md` (new)** — honest state of the system: what plays today, the
  `features/audio/` module map, how a sound would be registered and triggered (the `SoundData`
  registry + trigger-hook pattern), and the **planned** SFX scope from CLAUDE.md (hit / ability
  / mob-death / level-up). Explicitly: "SFX are not built yet — this is greenfield for you."
- **`docs/style-audio.md` (new)** — audio direction/format conventions. Mostly a **capture
  session with the PO** (there's little to read from one music track): target loudness, file
  format (mp3 today), looping vs. one-shot, the mood set by the existing track. Small doc,
  honestly labeled as a starting point.

## Workstream F — Code-comment & naming cleanup

Lower-priority than docs but real onboarding friction.

- **Go package doc comments** — most `pkg/aura/*` packages have none (survey: `core`, `sys`,
  `model`, `codec`, `phy`, `items`, `skills`, `net`, `gen` all missing). Add a one-paragraph
  `// Package x ...` to each package's primary file. Highest-leverage: `core` (the loop),
  `sys` (the ECS systems), `model`, `phy`, `codec`. This is what an IDE shows a code newcomer
  first.
- **TODO/FIXME triage** — 29 markers across Go + TS. Pass through them: convert the ones that
  are real future work into either an issue or a backlog line, delete stale ones, leave genuine
  inline caveats. Don't mass-delete — some are load-bearing warnings.
- **Legacy-naming pass (low risk, high clarity):** rename `derpy-berryhunter.mp3` →
  neutral name (update the `require` in `Music.ts`); decide the fate of `cmd/bhclient` (dead?
  rename or delete). **Leave intentionally-kept refs** per CLAUDE.md: berryhunter.io URLs
  (no domain yet), Kringel Games social/rating links, `legacy:true` content. Document *which*
  berryhunter refs are deliberate in `onboarding-code.md` so a newcomer doesn't "fix" them.
- **Root housekeeping:** `CLAUDE.md:Zone.Identifier` stray file in repo root; the two root
  `.pdf`s vs. `docs/*.html` duplication (decide in Workstream A).

## Workstream G — Contribution conventions (tracker-independent)

Written so it holds whether or not a tracker is adopted.

- **`CONTRIBUTING.md` (new, repo root)** — branch/PR conventions, the sanity-check gate before
  "done" (`go build ./...`, `go test ./...`, in-game verify — lifted from CLAUDE.md), the
  "numbers are placeholders" rule, the KISS/DRY/YAGNI/TDD principles, and how content changes
  flow through `api/` JSON. Points at the role onboarding docs.
- **Explicit open item — work tracking (PO decision):** GitHub issues+PRs vs. keep the
  plan-doc workflow. This plan doesn't block on it, but `CONTRIBUTING.md` gets a short section
  once decided. Recommendation surfaced at review, not baked in.
- **PR template / issue templates** — only if the tracker decision lands on GitHub issues;
  otherwise skipped.

---

## Suggested sequence

1. **A + C** first (entry docs + `status.md`) — the front door and the "what's going on"
   answer. Immediately useful even before anything else lands.
2. **B** (status banners + archive sweep + cross-ref fix) — makes docs/ navigable.
3. **D + E** (art/audio onboarding + the two capture sessions with the PO) — unblocks the
   art/audio hires; the capture sessions are the only PO-time-dependent items, schedule early.
4. **F** (package docs, TODO triage, legacy renames) — parallelizable, no PO dependency.
5. **G** (CONTRIBUTING.md) last, or once the tracker decision is made.

Each of D, E, F, and the archive move (B) is independently shippable — no big-bang.

## Open items for the PO

- **Work-tracking model** (Workstream G) — the one decision this plan is deliberately built
  around; needed before `CONTRIBUTING.md` is final.
- **Two capture sessions** — art references (Workstream D) and audio direction (Workstream E).
- **HTML/PDF fate** — keep `developer-onboarding.html`, delete redundant root `.pdf`s? (Workstream A)
- **`cmd/bhclient` + `wiki-generator/`** — dead code to delete, or kept? (both are pre-existing
  open "keep or delete" calls; deciding them removes newcomer confusion.)
- **Archive-move list** — confirm the ~13 plan docs proposed for `docs/archive/` before moving.

## Verification

Docs cleanup has no test suite, so verify by simulating a newcomer:
- **Link integrity:** after the archive move, grep every moved filename across `docs/`,
  `CLAUDE.md`, `README.md`, `.claude/skills/`, and the onboarding HTML — zero dangling refs.
- **Cold-start walkthrough:** from `docs/onboarding.md` alone, follow each of the four role
  paths and confirm every link resolves and the "get it running" steps in `README.md` still
  match reality (`make -C backend build`, the localhost URL).
- **Code changes (Workstream F only) keep the build green:** `cd backend && go build ./...`
  and `go test ./...` after the package-doc + rename pass (the `Music.ts` `require` rename is
  the only functional edit — verify the track still loads in-game via the `playtest` skill).
- **No status regressions:** `docs/status.md` reconciles with CLAUDE.md `## Status` at the
  moment it's written (it's a snapshot; note that in the doc).
