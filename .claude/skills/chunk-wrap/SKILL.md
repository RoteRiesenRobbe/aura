---
name: chunk-wrap
description: Session-end bookkeeping when a plan chunk / session is finished — update the CLAUDE.md status banner, the plan-doc §13 (or equivalent) chunk banner, and the MEMORY.md index line in the house format. Use when the user says a chunk/session is done, verified, or ready to record. Encodes the format + the no-autonomous-commit guardrail.
---

Ritual for recording a finished chunk/session so the three status surfaces stay
consistent. **Never commit, branch, or push as part of this** — that is a
separate, explicitly-requested step (project rule). Wrap-up = docs only.

## Where status lives (single sources, keep in sync)

1. **`CLAUDE.md` `## Status`** — the *current* state. Update the top
   `- **Last completed:**` bullet to the just-finished chunk; demote the previous
   `Last completed` to a one-line `Prior:` pointer (see the docs-hygiene note
   below — do **not** paste a fresh full banner into every `Prior`). Update
   `Next` / `Deferred` / `Standing locks` if they changed.
2. **The plan doc's chunk banner** — the authoritative full ledger
   (`plan-content-zones12.md §13 C#`, `plan-intermission-triage.md §…`, etc.).
   The complete retrospective prose belongs **here**, not in CLAUDE.md.
3. **`MEMORY.md` index line** — a **one-line hook** for the relevant project
   memory (e.g. `project_skill_system.md`). Append `C# ✅ + commit hash` to the
   existing line; do **not** grow it into a paragraph. If detail is needed,
   it goes in the memory file body, not the index.

## Banner house style (match the existing entries)

- Lead with **what + when + verification state**:
  `**<Chunk name> DONE (YYYY-MM-DD), <scope note> — PO-VERIFIED IN-GAME YYYY-MM-DD, committed \`<hash>\`**`.
  Leave the hash as `[uncommitted]` until the user actually commits.
- Then the ledger: **PO rulings**, **Content** (files/ids/pins), **Verified**
  (suite + race + the boot-count line + browser smoke), and any **Watch item**
  that recurred.
- The boot-count line is the canonical shape, e.g.
  `75 skills/12 factions/40 mobs/10 recipes/620 props/185 spawns/2 campfires/10 npcs, 0 panics`.
  Pull the real numbers from the boot log (see the `verify` skill's Boot-count
  section) — never guess them.
- Convert relative dates to absolute (project rule).

## Archive the plan doc when its LAST chunk lands

`docs/` = live work · `docs/archive/` = finished work (rule + rationale in
`docs/README.md`). When the chunk you are wrapping is the plan's **final** one —
nothing left open, no deferred half anyone will resume:

1. `git mv docs/plan-<name>.md docs/archive/` (keeps history; do **not** add an
   `archive-` prefix — the folder says it).
2. Move its bullet in `docs/README.md` from "Plans — live" to the matching
   Archive subsection, and make the description past-tense with the commit hash.
3. Rewrite any **path-style** refs (`docs/plan-x.md` → `docs/archive/plan-x.md`)
   across `CLAUDE.md`, `README.md`, `docs/*.md`, `.claude/skills/`, and **Go/TS
   source comments** — that last one is easy to miss:
   `grep -rn "docs/plan-<name>.md" . --exclude-dir=.git --exclude-dir=node_modules`.
   Bare code-span mentions (`` `plan-x.md` ``) need no change. Leave docs already
   inside `archive/` untouched — they are historical records, not maintained.
4. If the doc's top status line is stale ("PLANNING", `[uncommitted]`), fix it —
   an archived doc's header is the first thing the next reader trusts.

A doc with *any* open item (deferred checklist, unstarted workstream, live-ops
reference) **stays in `docs/`**.

## Docs-hygiene guard (keeps context from overflowing)

CLAUDE.md and MEMORY.md load **every session**. The full prose history of past
chunks already lives in the plan-doc banners — so in CLAUDE.md, past chunks are
**one-line pointers** (`C6 ✅ \`5961b29a\` — Orc Warlord encounter; full ledger:
plan-content-zones12.md §13 C6`), only the *current* chunk gets a full banner.
When wrapping up, if you see stale full `Prior:` banners piled up, collapse them.

## The harness gate — run it BEFORE writing the banner

A chunk that changes behaviour a browser harness asserts **owns that harness**.
Consult the `verify` skill's **Coverage map** (harness → what it owns → re-run it
when you touch X), run every script whose row matches this chunk, and act on the
result *in this chunk*:

- **green** → record the tally in the banner (`14/14`, `29/29 + 1 SKIP`).
- **red because the behaviour deliberately changed** → rewrite or delete the
  script **now**, as part of this chunk. Never leave it red.
- **red for an unrelated reason** → prove it: `git stash` + rebuild + re-run
  against HEAD. If it fails identically, it predates you — say so in the banner
  rather than silently ignoring it.

⚑ **Why this step exists.** 3b-ii moved teaching behind a conversation-panel row
click and did not touch `chunk3b-interact.mjs`, which had been written for the
world where `E` taught directly. It sat red at 6/15 across two chunks, and every
later session that ran it read the failure as a regression in whatever *they* had
just changed — it cost two runs to settle on 2026-07-29. `chunk3a-npc-merge.mjs`
died the same way and had to be deleted outright, because 3b-i had reversed its
entire premise. **The cheapest moment to fix a harness is the chunk that
invalidates it; every later moment costs someone a false diagnosis.**

⚑ **Restart the server before the run.** Mobs wander far from their authored
spawns on a long-lived one, so a venue a script picked by reading `world.json`
stops describing the world — three checks in one script were "failing" for this
alone, and a restart fixed them with no code change.

## Before declaring wrap-up done

- The three surfaces above agree on chunk name, date, commit state, and next.
- Sanity checks were actually run (`go build`, `go test`, `npm test`, in-game if
  it has a runtime surface) — record their real output, don't claim green unseen.
- The harness gate above was applied: every harness this chunk owns was run, and
  any that went red was fixed, deleted, or proven pre-existing.
- You did **not** commit unless explicitly asked.
