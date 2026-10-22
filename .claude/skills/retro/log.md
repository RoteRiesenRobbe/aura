# Retro log

One entry per retro, newest last. The last entry's end date is where the next
retro's window starts (see `SKILL.md` §0 and §5).

## 2026-10-22: 2026-10-08 → 2026-10-22
Sessions: 51 (the WSL box only) · incidents checked: 8 · findings: 7 (4 applied, 3 dropped)
Previous fixes (the manual retro of 2026-10-18, `8cba2f6d`): stage-by-path HELD (every
commit since names files); the Pillow → `sharp` note RECURRED once (2026-10-21, C5).
- APPLIED a cut `tail` hid a FAIL, reported green (10-20) → CLAUDE.md "Backend tests"
- APPLIED playtest compared against a boot pin that no longer exists (5 handovers), and
  missed a stale webpack after a merge (10-14) → playtest skill §1 + §3
- APPLIED existing path not found first (totem tooltip 10-11, companion medallions 10-19)
  → CLAUDE.md DRY
- APPLIED `cd` chains prompt in auto mode; the fix was promised per session only and
  recurred (10-21) → CLAUDE.md Working Style
- APPLIED chunk-wrap review (PO): a wrap now ends with a commit (push on ask), with
  file-path staging and the `--cached --stat` check; the ledger pointer and the stale
  size paragraph fixed → chunk-wrap skill, CLAUDE.md Working Style, memory
  `feedback_commit_to_main`
- DROPPED `git add -A <dir>` swept another session's edits (10-18): the rule landed in
  `8cba2f6d` 40 min later and held
- DROPPED a question left unanswered under a follow-up message (10-11): the PO's quest
  colours were fine (grey by level), one-off
- DROPPED the Pillow recurrence: one case, the error names the problem
- Not raised (my call): harness rot after the world rebuild (already in
  docs/feedback.md); visuals handed over unseen (said so honestly, the PO tests by hand)
- APPLIED the retro skill's own lessons (PO asked): recommendation-first prompts, the
  "landed after the incident and held?" check, the UTC note, `window.mjs`, a 300 KB
  subagent threshold, `--exclude` for the running session, the same-run size offset
- APPLIED a CLAUDE.md trim to offset the growth: the Docker block, the vitest notes
  (stale and with `cd`), the line-of-sight paragraph
CLAUDE.md 35,627 → 34,828 bytes (−799 net after +879 of new rules).
