# Plan: one copy of the content JSON — killing the `api/` ↔ `backend/pkg/api/` duplicate

> **Status: DESIGNED 2026-08-25. Nothing built.** Opened by the PO question
> *"why do we have duplicate jsons for everything? … is there a plan to get rid
> of json duplicates in the project?"* — the answer was **no**, and the survey
> that followed found more than a tidiness problem: **a fresh clone of this
> repo does not compile** (§3.3), and the repo already runs **two different
> conventions** for the same copy without anyone having decided between them.
>
> **PO bias, stated when the plan was commissioned: option A** — one source of
> truth, content moved under the Go package tree (§5). D1 records it.
>
> ⚑ **Schema impact: NONE at every layer.** No migration, no wire field, no
> content change — the *bytes* stay identical, only their path moves. That is
> also what makes this dangerous: nothing here is visible in-game, so nothing
> here fails loudly if it goes wrong.

## 1. What this is

`api/` holds the authored content the game loads. `backend/pkg/api/` holds a
**byte-for-byte copy** of the same files, refreshed by `make -C backend
cp-defs`. Both are in git (mostly — §3.2). The copy is not laziness; §2 is the
constraint that forces it. But nobody has ever decided *how* the duplicate
should be managed, and the repo now does it two ways at once.

Scope: the nine content directories only — `mobs skills recipes zones props
factions milestones quests ascension`. **`api/schema/` and
`api/shared-constants.json` are NOT duplicated** and are out of scope; they
stay exactly where they are (§6.3).

## 2. The constraint that creates the copy

`//go:embed` cannot reach outside its own package directory. Proved, not
recalled — a probe package at `backend/pkg/api/zz_embedprobe`:

```go
//go:embed ../../../../api/mobs/*.json
var Probe embed.FS
```

```
pkg\api\zz_embedprobe\probe.go:5:12: pattern ../../../../api/mobs/*.json:
    invalid pattern syntax
```

Go rejects `..` in an embed pattern outright. So **if the binary is to embed
the content, the content must physically live inside the Go package tree.**
Every option in §5 is a different answer to that one sentence.

Why embed at all: `aurad` ships as a single self-contained binary, which is
what `plan-playtest-deploy.md` assumes. `-content ../api` exists to *bypass*
the embed during content iteration (the boot log prints the source), which is
why the duplication is invisible day to day.

## 3. What is actually true today

### 3.1 The census (measured 2026-08-25)

| | count |
|---|---|
| JSON files existing twice on disk | **215** |
| …of those, tracked in git in both places | **154** |
| …of those, untracked in `backend/` (the `mobs` exception) | **61** |
| drifted between the two copies right now | **0** |
| files in `api/` NOT copied | 1 (`shared-constants.json`) |

Zero drift **only because `cp-defs` last ran**. Nothing verifies it: there is
no test comparing the embedded FS against `api/`. Drift is silent, and the
failure mode is the server embedding stale content while the repo shows the
new file. ⚑ Not hypothetical — CLAUDE.md carries *"the stale
`backend/pkg/api/mobs/` report (re-verify on the finder's checkout)"* as an
unowned leftover, and `mobs` is precisely the directory git cannot show you.

### 3.2 Two conventions, never decided between

`backend/pkg/api/mobs/.gitignore` contains `*.json`. The other eight
directories have no `.gitignore` and are fully tracked.

That file arrived in `6317cce2` *"bundling item and mob definitions"* — an
**inherited Berryhunter-era commit**, predating Aura. Every content directory
added since (quests `f414b473`, the skills the projectile work touched
`cced090a`, ascension, …) was tracked, because that is what the surrounding
directories looked like. Nobody chose; the repo drifted.

### 3.3 ⛔ A fresh clone does not compile

The direct consequence of §3.2, verified by cloning this repo to a temp
directory and building it:

```
$ git clone . <tmp> && cd <tmp>/backend
$ go build ./pkg/api/...
pkg\api\mobs\mobs.go:5:12: pattern *.json: no matching files found
```

`mobs.go` embeds `*.json`; the `.gitignore` guarantees a clone has none; an
embed pattern matching nothing is a **compile error**, not a warning. So
`go build ./...` and `go test ./...` — the two commands CLAUDE.md's verify tail
is built on — fail on a new checkout until `make -C backend cp-defs` has run.

⚑ **This is not documented anywhere.** CLAUDE.md says to run `cp-defs` after
*editing* content; nothing says the repo does not build without it. A new
contributor (or a CI runner, if `NO CI BY CHOICE` is ever revisited) meets a
compile error naming a file they never touched.

This is also the honest evidence about option B (§5): the repo has been running
B in one directory for years, and both of B's predicted failures — invisible
staleness and a broken fresh build — have actually happened here.

## 4. Decision ledger

- **D1 (2026-08-25, PO) — bias to option A: ONE copy, under the Go package
  tree.** Commissioned with this bias explicitly. The duplication is removed
  rather than managed, the single-binary deploy is preserved, and the fresh
  clone builds. Recorded as a bias, not yet a ruling on §10's open questions —
  those need answering before C1 starts.
- **D2 — the nine content directories only.** `api/schema/` (FlatBuffers
  `.fbs` + generated JS) and `api/shared-constants.json` are not duplicated and
  do not move (§6.3). Widening this to "move all of `api/`" would drag the
  codegen pipeline into a filesystem change for no benefit.
- **D3 — the bytes do not change.** This is a path refactor. Any commit in
  this plan that alters a content *file* is doing something wrong; the
  byte-stability gates (`tools/tiled/verify.sh`, the two `AuraTiledConvert`
  legs) are what prove it.
- **D4 — §3.3 is fixed FIRST and separately** (C0), whatever else happens. It
  is a live bug, it is one line, and it should not wait for a refactor.

## 5. The options, with what each really costs

| | shape | verdict |
|---|---|---|
| **A** | one copy, under `backend/pkg/api/`; the `api/` content dirs are deleted and consumers repointed | ⭐ **PO bias (D1)** — removes the duplication outright, keeps the single binary |
| **B** | one copy in git; the other gitignored and generated by `cp-defs` | ⛔ **the evidence against it is in this repo** — §3.3 *is* this option, and §3.1's stale-`mobs` report is its other failure mode |
| **C** | keep both, add a drift-guard test | a good *safety net*, compatible with doing nothing else; removes no files |
| **D** | stop embedding; ship content beside the binary | genuinely simple, but changes deployment and drops the single-binary property `plan-playtest-deploy.md` assumes |

⚑ **B is the intuitive answer and the survey disproved it.** Softening it by
embedding a committed-but-empty directory only converts §3.3's loud compile
error into a quiet boot failure — strictly worse.

⚑ **C is not exclusive with A.** If A slips or is abandoned, C is the residue
worth keeping: ~30 lines that make the current duplication safe. Recorded in §7
as C4 so it does not get lost.

## 6. Design (option A)

### 6.1 What moves

The nine directories move from `api/<dir>/` to **`backend/pkg/api/<dir>/`** —
where their copies already sit. The move is therefore: delete the `api/`
originals, repoint every consumer, and delete `mobs/.gitignore` so its 61 files
enter git for the first time (§3.2).

`cp-defs` disappears entirely. So does the `gen`→`cp-defs` dependency in the
Makefile, and the "run cp-defs after editing content" line in CLAUDE.md,
`developer-onboarding.html`, and the plan docs that repeat it.

### 6.2 What `-content` means afterwards

`-content ../api` exists so a content edit needs no rebuild. Under A the live
directory becomes `backend/pkg/api` — i.e. `-content ./pkg/api` from
`backend/`, or simply the default. ⚑ **The flag must keep working**: it is the
only reason content iteration is fast, and `loaders.go`'s `contentSources`
comment already states the rule *"every tunable definition file lives under
api/ and is covered here"*. That sentence needs rewriting, not deleting.

⭐ A pleasant side effect: with one copy, `-content` and the embedded default
point at *the same bytes*, so the "did I forget cp-defs?" class of confusion
disappears rather than moving.

### 6.3 What does NOT move

- `api/schema/` — `.fbs` sources plus the generated JS the frontend imports.
  The Go bindings are generated separately into `backend/pkg/api/AuraApi/`. Not
  duplicated, not in scope (D2).
- `api/shared-constants.json` — read by the frontend and pinned by
  `SharedConstants.test.ts`; `cp-defs` never copied it.

So `api/` survives, holding schema + shared constants. ⚑ That is a slightly odd
end state, and §10 asks whether the directory should then be renamed to say
what it has become.

### 6.4 Consumer inventory (measured, not estimated)

**124 references** in code/config, **73 files** under `docs/`. The dense ones:

| file | refs |
|---|---|
| `tools/tiled/verify.sh` | 13 |
| `backend/cmd/aurad/loaders.go` | 9 |
| `frontend/.../SkillTooltip.test.ts` | 6 |
| `backend/cmd/simharness/content.go` | 6 |
| `scripts/world-place.py` | 5 |
| `frontend/.../ZoneEditor.ts` | 5 |
| `frontend/.../Resources.ts` | 4 |
| `tools/tiled/aura-world-format.js` | 3 |

Plus the frontend's four `require.context` roots (`GroundTextureManager`,
`ZoneEditor` ×3) and the two test files that read `../api/zones/world.json`
directly (`AuraTiledConvert.test.ts`, `ZoneModel.test.ts`).

⭐ **One consumer needs no change at all**: `aura-world-format.js`'s
`findPaletteDir` *walks up* from the zone file looking for the palette instead
of assuming a fixed depth — written that way deliberately in the Tiled work,
and it pays off here.

⚑ **`.gitattributes:19` pins `api/zones/*.json text eol=lf`** and must move
with the file. Miss it and a CRLF checkout reports ~14,600 phantom differences
against a file nobody edited — the pin's own comment says so. Related: the pin
does not currently cover `backend/pkg/api/zones/*.json` at all, which under A
becomes the only copy.

## 7. Chunk breakdown

- **C0 — fix the fresh clone** (D4; first, and independent of A/B/C). Either
  track `backend/pkg/api/mobs/*.json` like the other eight, or make the build
  not require them. One line either way, plus a line in CLAUDE.md and
  `developer-onboarding.html` saying what a new checkout needs. ⚑ Verify by
  cloning to a temp dir and running `go build ./...` — the only test that
  actually proves it.
- **C1 — the move.** `git mv` the nine directories, delete `mobs/.gitignore`,
  move the `.gitattributes` pin, repoint the 124 code references. One commit,
  because a half-moved tree is a broken tree.
- **C2 — retire `cp-defs`.** The Makefile target, its `gen`/`build`
  dependencies, and `-content`'s default (§6.2). Boot must still print the
  content source.
- **C3 — the docs sweep.** 73 files, CLAUDE.md first. ⚑ CLAUDE.md's Content
  Data section says *"eight directories"* and there are **nine** (`ascension`
  was added and the sentence never updated) — fix that in passing.
- **C4 — the drift guard** (option C's residue; only meaningful if A is
  abandoned). A Go test comparing the embedded FS against the repo tree,
  failing on any difference.

## 8. Test strategy

1. ⭐ **The fresh-clone build is the acceptance test for C0**, and nothing else
   substitutes: `git clone . <tmp> && cd <tmp>/backend && go build ./...`.
2. **Byte-identity across the move (D3)**: `git mv` preserves content, so spot
   `git show HEAD:api/mobs/<f>.json | cmp - backend/pkg/api/mobs/<f>.json` per
   directory, plus `tools/tiled/verify.sh` 7/7 and the two `AuraTiledConvert`
   byte-stability legs for the zone file specifically.
3. **Boot**: `aurad` starts, logs its content source, loads all nine
   directories. A missing directory hard-fails at boot by design — so the boot
   log IS the coverage check.
4. **Frontend**: `npm run build` (the four `require.context` roots resolve at
   *build* time, so a wrong path is a webpack error, not a runtime one) and the
   full vitest run.
5. `go build ./...`, `go test -count=1 ./...`, `npm run typecheck`.

## 9. Landmines

- **L1 — ⛔ nothing here is visible in-game.** A path refactor that half-works
  produces a server loading *stale but valid* content, which looks completely
  normal. The boot log's content-source line is the only routine signal; read
  it.
- **L2 — the `.gitattributes` LF pin must travel** (§6.4). Its own comment
  documents the ~14,600-line phantom diff it exists to prevent.
- **L3 — `git mv` in one commit, not two.** A tree with the content in neither
  place (or in both) breaks every consumer at once, and `cp-defs` is exactly
  the kind of thing someone re-runs by reflex, silently re-creating what C1
  just deleted.
- **L4 — the frontend reaches ACROSS the project boundary.** `frontend/src`
  would import from `backend/pkg/api/…`. That already happens today
  (`require.context('../../../../../api/zones')` leaves `frontend/`), so it is
  not new — but it does make the client build depend on a path inside the
  server package tree, which a future "split the repo" would have to unpick.
  Worth saying out loud rather than discovering later.
- **L5 — `-content` must not silently become a no-op.** If the flag's default
  and the embedded copy become the same path, a stale-flag invocation still
  "works" and proves nothing. Keep the boot log honest.

## 10. Open questions

- ⭐ **Does the content belong under `backend/` at all?** This is the real
  question A asks. The content is authored by design work and read by *both*
  binaries; `backend/pkg/api/mobs/` says it belongs to the server. The
  alternative is to keep it top-level and take option D (no embed) instead — a
  different trade, not obviously a worse one. **A PO call, and C1 should not
  start before it is answered.**
- **If it moves, is `backend/pkg/api/` the right name?** It currently mixes
  generated FlatBuffers Go (`AuraApi/`) with authored JSON. `backend/content/`
  would say what it is.
- **What happens to the surviving `api/`** holding only `schema/` +
  `shared-constants.json` (§6.3)? Rename to `shared/`, leave it, or fold the
  schema elsewhere.
- **Is C4's drift guard worth building even if A lands?** After A there is
  nothing to drift — so no. It exists only as insurance if A is dropped.

## 11. Chunk ledgers

*(appended per execution session — none yet)*
