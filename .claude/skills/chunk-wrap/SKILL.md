---
name: chunk-wrap
description: Session-end bookkeeping when a plan chunk / session is finished — TIERED by session size (full plan-chunk ritual · light bugfix wrap · docs-only). Use when the user says a chunk/session is done, verified, or ready to record. Encodes the tier rule, the CLAUDE.md Status cap, the banner format + the no-autonomous-commit guardrail.
---

Ritual for recording a finished chunk/session so the status surfaces stay
consistent. **Never commit, branch, or push as part of this** — that is a
separate, explicitly-requested step (project rule). Wrap-up = docs only.

## Pick the tier FIRST — most sessions are not FULL

The uniform ritual is what bloated CLAUDE.md to 157 KB by 2026-08-03: every
bugfix got a plan-chunk-sized banner on every surface. Match the ceremony to
the session:

- **FULL** — a chunk of a `plan-*.md`, or any session with PO rulings and a
  verification tail. Everything below applies: all three surfaces, the harness
  gate, the archive check.
- **LIGHT** — a bugfix or small standalone item. The full ledger goes in the
  owning plan doc's ledger section (or the backlog §) — that is the ONE
  authoritative record. CLAUDE.md Status changes **only if the item changes
  Recent/Next/Open items** (an item that closes an Open line: delete the line,
  don't add a new entry; a notable fix may take a `Prior` slot under the cap).
  MEMORY.md gets a line **only for a durable cross-session lesson** — a routine
  fix earns no memory. Run only the harnesses the change actually owns.
- **DOCS-ONLY** — a design/planning session. The plan doc IS the record; give
  it one Status `Recent` entry pointing there. No harness gate, memory only
  for a durable reframe.

When unsure between FULL and LIGHT, ask: did this session produce rulings or
findings that a *different* future session must know? If only the diff matters,
it's LIGHT.

## Where status lives (single sources, keep in sync)

1. **`CLAUDE.md` `## Status`** — the *current* state, under a **hard cap**:
   `Last completed` + at most **two** `Prior` entries, each ≤10 lines ending in a
   ledger pointer. Write the new `Last completed` entry *compressed* (what shipped,
   the 1–2 findings that outlive the chunk, a one-line Verified tally, the
   pointer) — the full banner goes in the plan doc, never here. Demote the
   previous `Last completed` to a `Prior`, and **move the entry that falls off
   the cap verbatim to the top of `docs/archive/status-history.md`'s entry list**.
   Update `Next` / `Open items` / `Standing locks` if they changed — and prune
   any Open-items line the finished chunk just closed.
2. **The plan doc's chunk banner** — the authoritative full ledger
   (`plan-content-zones12.md §13 C#`, `plan-intermission-triage.md §…`, etc.).
   The complete retrospective prose belongs **here**, not in CLAUDE.md.
3. **`MEMORY.md` index line** — a **one-line hook** for the relevant project
   memory, **hard-capped at ~250 chars**. Update the hook's status words if they
   changed; per-chunk detail goes in the memory file **body**, never the index.
   ⚑ By 2026-08-03 one index line had grown to 5.5 KB — nearly the size of the
   file it pointed at — which is why this is a cap, not a style note. And only
   write to memory at all when there is a durable cross-session lesson (see the
   tier rule above).

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

CLAUDE.md and MEMORY.md load **every session**. By 2026-08-03 the Status section
had accreted to **136 KB / 87 % of the file** because every session prepended a
full banner and nothing ever pruned — that is why the cap in point 1 above is a
hard rule, not a style note. The full prose history lives in the plan-doc
banners; overflow entries live verbatim in `docs/archive/status-history.md`.
When wrapping up, if Status holds more than 3 completed-work entries or any
entry longer than ~10 lines, collapse/move them **as part of the wrap**.

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
