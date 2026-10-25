---
name: plan-doc
description: Planning session - design a work item with the PO through choice prompts and write it up as docs/plan-<name>.md (rulings, decisions, chunks, tests, landmines, schema impact), index it, and hand over a ready-to-paste execution prompt for the first chunk. Use for "make a small plan first", "nail down what we build", "write the plan doc", "give me the prompt for the C0a session". No production code.
---

A planning session produces ONE `docs/plan-<name>.md` and writes **no production code**
(CLAUDE.md Working Style). Never commit, branch or push unless asked. The recording of a
finished plan session is `chunk-wrap`'s DOCS-ONLY tier; this skill covers the design itself.

## Flow

1. **Survey before asking.** `ls docs/ docs/archive/ | grep plan-` and grep both for the
   topic: an existing plan may own it, be superseded by it, or have parked it (`⏸`). Read
   the matching `feedback.md` row and `backlog.md` § if any, CLAUDE.md Status, and the code
   seams you will build on. Note what already works and is reused. Pin line refs to a
   commit (`git rev-parse --short HEAD`).
2. **Lead with the one simplest rule.** Write the design as one sentence before asking
   anything. If it fits, present it with what it deliberately leaves alone and ask only for
   the go-ahead; edge cases it already answers are not questions, extras needing their own
   code path go under "not in scope". If the plan is a mechanism enforcing a rule (lock,
   validator, boot refusal), measure how often the rule was broken first and offer
   "rule only" as option one.
3. **Rough round, then detail.** `AskUserQuestion`, several back-to-back, concrete options,
   recommendation first. Round 1 = shape and scope; later rounds = details the PO actually
   wants. Do not manufacture a second round. Record each answer as `R#` with its date.
4. **Numbers are placeholders.** Every value gets `[PLACEHOLDER]`; propose concrete starting
   values, never adopt them silently.
5. **Write the doc**, then **index it**, then the **handoff prompt** (below). A plan that
   designs or changes a zone's layout also ships its **draft map** and links it at the top
   (`docs/content-zone-design-guide.md`, "Every zone plan has a draft map"; reference:
   `docs/level-drafts/deep-woods.html`).

## Skeleton (as plan-passages, plan-herding, plan-cliffs, plan-road-pace, plan-appearance use it)

```
# Plan: <Name>: <what the player/author gets, one line>

**Status: DESIGNED <date> (planning session, PO in chat). R1-Rn RULED, D1-Dn PROPOSED,
nothing built.** Open PO calls in §7. <n> chunks (§5); <first> can start once ... .

**Owns:** ... **Builds on:** <plan §/D#> ... **Amends / Supersedes / Replaces in play:** ...
**Schema (as designed):** DB none · wire ... · conf none · content/zone format ... · lang ...

⚑ Line references pinned <date> at `<hash>` (main); re-verify before relying on them.
---
## 1. What this is            (the problem in the PO's terms; ### 1.1 What already exists and is reused)
## 2. PO rulings (<date>)     (R1 ... : one bold line each, then why)
## 3. Design                  (### D1 - <title> ...; tag [proposed] until approved)
## 4. What changes for the author   (optional: Tiled / editor / content workflow)
## 5. Chunks                  (table: # | Chunk | Contents | Size, or ### per chunk)
## 6. Test strategy
## 7. Open PO calls           (Q1 ... with the proposed answer; ~~struck~~ + "RULED <date>: R#" once answered)
## 8. Landmines               (L1 ... : the silent-break traps, with file:line or memory link)
## 9. Schema impact           (DB / Wire / Conf / Content / Zone format, "NONE" stated explicitly)
## 10. Cross-references       (optional)
## 11. Chunk ledgers          ("(none yet)"; filled by chunk-wrap per chunk)
```

Rules the recent plans follow:

- **Numbering:** `R#` = PO rulings, `D#` = design decisions, `Q#` = open calls, `L#` =
  landmines. Chunk ids carry a plan letter (`C0a`, `H1`, `P1`, `R1`); a design-only or
  prerequisite chunk is `C0`/`C0a`. Another plan's items are cited, not restated
  (`M-D15`, `M-§5.2`).
- **Each chunk** names: contents, size (S/M/L), what it needs first, its own
  `Schema:` line, and an **In-game (PO)** checklist (what to walk and what to feel). Every
  chunk is independently shippable; "one session each".
- **Test strategy:** Go red first (TDD, named cases incl. the boundary ticks), vitest
  completeness pins for hand-kept client tables, content tests that derive and never
  hardcode, the `verify` harness legs, then the PO's in-game look. Name measurements to
  record in the ledger (perf, wire bytes) when the plan has a cost question.
- **Schema line** always covers DB, wire, conf and content (plus zone format / catalog /
  lang when touched). "none" is a finding. A DB change means a new migration pair
  (`docs/manual-db-migrations.md`), never an edited one.
- **Landmines** worth listing: multiple writers of one format, wire enums with a
  streamed-entity pin, embedded content vs `-content ../api`, half-live zone edits,
  `frontend/dist` bundling, the Go test cache (`-count=1`).
- Small plans shrink the skeleton (`plan-roof-props.md`: What this is, Rulings, Design with
  a Schema line, Known looks, ledger), never the Schema line.

## Index it (docs only)

- **`docs/README.md` "Plans - live"**: one bullet, `- **plan-<name>.md** - **DESIGNED
  <date> (R.. ruled, D.. proposed, Q.. open), nothing built, chunks X1-Xn**: <summary>`.
- **CLAUDE.md `## Status` "Next"**: one entry, ≤ ~600 chars, ending in the
  `**Schema: ...**` line (see the HERDING/PASSAGES entries). Respect chunk-wrap's cap.
- **`docs/roadmap.md` "Execution order"** only when the plan IS (or replaces) an execution
  step (as `plan-appearance.md` did for 8b's avatar). Otherwise leave it.
- If the work came from `docs/feedback.md`, set that row's door to → plan doc.
- On approval: Status line → `APPROVED <date>`, `[proposed]` tags drop, README/Status
  follow. Commit only when asked; message style `docs(<name>): plan <what>`.

## Handoff: the execution prompt

Close with a ready-to-paste prompt for the first chunk, in one code block, modelled on
the one the PO used for appearance C0a:

```
Execute docs/plan-<name>.md §<n> chunk <X1> (plan APPROVED <date>).
Read first: plan-<name>.md §<a> (D<i>-D<j>), §<chunks>, §<landmines>; <other doc> §<x>
(design reference, cited as M-§n).
<X1> has <k> deliverables:
1. <deliverable, with the file/system it lands in>
2. ...
Constraints: <rulings that bind it, what is NOT in scope, landmines L# to respect>.
Verification expected: <go build/test packages, vitest pins, harness scripts, the
In-game (PO) checklist from §5>.
Schema impact expected: DB <..> · wire <..> · conf <..> · content <..>.
Stop after <X1>: record it with chunk-wrap, do not start <X2>.
```

If the plan is not approved yet, say so and give the prompt anyway with "(once approved)".
