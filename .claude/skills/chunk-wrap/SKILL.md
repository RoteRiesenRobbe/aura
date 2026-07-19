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

## Docs-hygiene guard (keeps context from overflowing)

CLAUDE.md and MEMORY.md load **every session**. The full prose history of past
chunks already lives in the plan-doc banners — so in CLAUDE.md, past chunks are
**one-line pointers** (`C6 ✅ \`5961b29a\` — Orc Warlord encounter; full ledger:
plan-content-zones12.md §13 C6`), only the *current* chunk gets a full banner.
When wrapping up, if you see stale full `Prior:` banners piled up, collapse them.

## Before declaring wrap-up done

- The three surfaces above agree on chunk name, date, commit state, and next.
- Sanity checks were actually run (`go build`, `go test`, in-game if it has a
  runtime surface) — record their real output, don't claim green unseen.
- You did **not** commit unless explicitly asked.
