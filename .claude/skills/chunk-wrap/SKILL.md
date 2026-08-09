---
name: chunk-wrap
description: Session-end bookkeeping when a plan chunk / session is finished — TIERED by session size (full plan-chunk ritual · light bugfix wrap · docs-only). Use when the user says a chunk/session is done, verified, or ready to record. Encodes the tier rule, the CLAUDE.md Status cap, the archive checklist + the no-autonomous-commit guardrail.
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

## The three surfaces (single sources, keep in sync)

1. **The plan doc's chunk banner** — the **authoritative** full ledger
   (`plan-<name>.md §13 C#`). The complete retrospective prose belongs here and
   nowhere else. Match the house style of the banners already in that doc; the
   two non-obvious bits are that the hash stays `[uncommitted]` until the user
   actually commits, and that dates are absolute, never relative.
2. **`CLAUDE.md` `## Status`** — a *compressed* pointer to that banner: what
   shipped, the 1–2 findings that outlive the chunk, a one-line Verified tally,
   the ledger pointer. Under the cap below.
3. **`MEMORY.md` index line** — a one-line hook for the relevant project memory,
   hard-capped at **~250 chars**; per-chunk detail goes in the memory file
   **body**, never the index. Only write to memory at all when there is a
   durable cross-session lesson (see the tier rule).

Before calling the wrap done: the three agree on chunk name, date and commit
state, and Status's `Next` points at whatever actually comes next.

## The cap — count BYTES, and Status is not just `Recent`

CLAUDE.md loads every session. Budget for the whole `## Status` section:
**~12 KB**.

- **Recent** — `Last completed` + at most **two** `Prior`, each **≤ ~1.5 KB**.
  Demote the previous `Last completed`, and move the entry that falls off the
  cap **verbatim** to the top of `docs/archive/status-history.md`'s entry list.
- **Next / Open items** — no entry limit, but each bullet **≤ ~600 chars** and
  the two sections together **≤ ~8 KB**. Prune every line the finished chunk
  closed; a closed item is **deleted**, not annotated with "CLOSED".

⚑ **Why bytes, and why the two halves.** The cap exists because by 2026-08-03
Status had reached 136 KB / 87 % of the file — every session prepended a banner
and nothing ever pruned. The line-based rule that replaced it ("≤10 lines") was
then satisfied on a technicality: every entry complied by being one unwrapped
4.7 KB bullet. As of 2026-08-09 Status is **27 KB** — Recent 9.7 KB, Next+Open
**17 KB**, the half no rule governed. If the section is over when you arrive,
collapsing it is part of *your* wrap, not a future someone's.

## The harness gate — run it BEFORE writing the banner

A chunk that changes behaviour a browser harness asserts **owns that harness**.
Run every script whose row in the `verify` skill's **Coverage map** matches this
chunk — that skill owns the operational detail (restart the server first, one
script at a time, the `git stash` + rebuild settlement for a red run). Act on
the result *in this chunk*:

- **green** → record the tally in the banner (`14/14`, `29/29 + 1 SKIP`).
- **red because the behaviour deliberately changed** → rewrite or delete the
  script **now**. Never leave it red.
- **red for an unrelated reason** → prove it against HEAD and say so in the
  banner rather than silently ignoring it.

⚑ The cheapest moment to fix a harness is the chunk that invalidates it; every
later moment costs someone a false diagnosis (`chunk3b-interact.mjs` sat red at
6/15 across two chunks and misled every session that ran it).

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
