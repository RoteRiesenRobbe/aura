---
name: retro
description: Retrospective over past sessions - mine the transcripts and git history since the last retro for things that went wrong (PO corrections, retracted claims, redone work, rules that did not hold, rejected tool calls), group them by root cause, propose ONE fix each (CLAUDE.md, a skill, a manual, a memory, or drop), apply only what the PO approves. Use for "/retro", "let's do a retro", "what went wrong lately", "what can we improve in how we work". Docs only, never commits.
---

Goal: the same mistake does not happen twice. A retro looks back across
sessions (chunk-wrap only records one chunk's own lessons), finds where work
went wrong, and moves each lesson to the place that is read at the moment the
mistake would happen again.

**Never commit, branch or push as part of this.** On a later commit request,
stage only the files this retro changed, by path.

## 0. The window

Read `log.md` (next to this file). The window starts at the **last entry's
`until` date** and ends now. No entry yet (the first run): ask the PO for the
start date with a choice prompt (last week · last 2 weeks · last month).

⚑ The transcripts are **local to this machine** (`~/.claude/projects/<cwd with / → ->/`).
Sessions run on the other dev box (Windows) are not in them; say so in the
report instead of implying full coverage. Git history covers both boxes.

## 1. Gather

```bash
node .claude/skills/retro/digest.mjs --since <start> --exclude <this session's id> --out <scratchpad>/retro-digest.md
git log --since=<start> --format='%h %ad %s' --date=short           # whole window
git log --since=<start> --format='%h %s' | grep -iE 'revert|fix|again|restore|undo'
git log --since=<start> --name-only --format= -- CLAUDE.md .claude/skills docs/manual-*.md | sort | uniq -c
```

The digest holds, per session, every message the PO typed, the tail of the
assistant text it answered, interrupts and rejected tool calls. Images are
noted, not included. This session's id is the last folder of the scratchpad
path. ⚑ **Transcript and digest times are UTC; git prints local time** (+0200
in summer): convert before comparing an incident with a commit. Size is ~2.5 KB per session (a busy week: 28 sessions,
71 KB; all history to 2026-10-22: 98 sessions, 220 KB). On the Windows box the
transcript directory is not derived correctly from the cwd: pass
`--dir ~/.claude/projects/<that project's folder>` explicitly.

Also read the current rule surfaces, so you know what already exists:
`CLAUDE.md`, the memory `feedback_*.md` files, each skill's `SKILL.md`
description. Open manuals only when a finding points at one.

## 2. Find the incidents

Read the digest yourself (two weeks was 114 KB and read fine; the checks in
step 2 need the main context anyway). Only above ~300 KB split it by session
into batches and hand each to a `sonnet` subagent with this section as its
brief; each returns incidents as `session id · time · quote · what went
wrong`. Look for:

- **PO corrections:** "no", "wrong", "that's not what I", "why did you",
  "I said", a reply that restates the request more slowly.
- **A rule restated:** the PO repeats something CLAUDE.md, a skill or a memory
  already says. The rule exists and did not hold; that is the most valuable
  kind of finding.
- **Retracted claims and false "done":** a confident answer walked back, a
  "verified" that the next session found broken, "cannot boot" style excuses.
- **Redone work:** the same file or feature touched again because the first
  pass missed something; fix-after-fix chains and reverts in git.
- **Friction:** interrupts, rejected tool calls (their reason text), too many
  questions, scope the PO did not ask for, a skill step that failed or was
  skipped.
- **Kept approaches:** the PO confirming an unusual way of working ("yes,
  exactly like that"). Worth recording too, so it survives.

⚑ **Check every incident against the real transcript before using it**: a
subagent's finding comes back as confident as a real one, and the digest's
500-character context can mislead. Use `window.mjs`, not grep (here grep is
ugrep, and long JSONL lines fail with "exceeds complexity limits"):

```bash
node .claude/skills/retro/window.mjs --session <id prefix> --from 18:12 --to 18:20 [--day <date>]
node .claude/skills/retro/window.mjs --grep 'git add' --since <ISO UTC>   # every matching tool call
```

The second form proves whether a rule held: list what sessions actually ran
after the rule landed.

## 3. Group and pick ONE fix per root cause

Group incidents that share a cause (three "you skipped the in-game check"
moments are one finding). For each group, grep the rule surfaces first, and
when a rule exists, **check whether it landed after the incident**
(`git log -S '<rule text>' --format='%h %ci' -- CLAUDE.md .claude/skills`)
and whether it held since (`window.mjs --grep`). A rule added after the
incident that has held since is not a finding; report it as held (the first
retro raised one such finding, and the PO caught it). Then:

| Situation | Fix |
| --- | --- |
| No rule exists | Add one, **where it is read at the moment of failure**: a skill step beats a manual, a manual beats CLAUDE.md. CLAUDE.md is kept small; add there only what every session needs. |
| A rule exists and broke | Do NOT add a second copy. Move it to where it is read in time, sharpen the wording, or turn it into a checklist step of the skill that was running. |
| A skill misled or failed | Fix that skill's step. |
| User preference, cross-project | A memory `feedback_*.md` (or `~/.claude/CLAUDE.md` when the PO asks). |
| One-off, unlikely to recur | Drop it, and say so. |

Follow the standing feedback: propose the one simplest rule first
(`feedback_one_rule_first`), and a written rule over enforcement machinery
unless the breakage history says the rule alone failed repeatedly
(`feedback_rule_over_machine`).

Also check the **previous retro's applied fixes** (`log.md`): did the same
failure recur in this window? Report each as held or recurred; a recurred fix
is itself a finding (the fix sat in the wrong place).

## 4. Present, then apply what is approved

Give a short overview first: window, sessions scanned (and which box), number
of incidents, number of findings. Then put the findings to the PO as choice
prompts, up to four per `AskUserQuestion` call, back to back, most costly
first. Each finding: one line on what happened (with the session date), the
proposed fix and its target file. **The first option is your recommendation,
labelled "(Recommended)", with the reason in its description**; the others
are an alternative target or wording, and drop. (The first retro offered bare
options, and the PO had to ask "what do you recommend?" twice.)

Apply the approved fixes. Docs only, English, no em dash in new text. Measure
CLAUDE.md before and after (`wc -c`). If it grew, **offer a trim of at least
the same size in this retro** (stale Status lines, rules that a skill already
holds, detail that belongs in a manual), shown to the PO before applying; a
retro must not leave CLAUDE.md bigger than it found it.

## 5. Log it

Append an entry to `log.md`:

```markdown
## <today>: <start> → <today>
Sessions: <n> (this box only) · incidents: <n> · findings: <n>
Previous fixes: <held / recurred, one line each>
- APPLIED <finding> → <file>
- DROPPED <finding> (<why>)
```

The `until` date of this entry is the next retro's start. Then report the
changed files and stop; commit only on request.
