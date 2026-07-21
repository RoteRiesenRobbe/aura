---
name: run-simharness
description: Build, run, and drive the simharness balancing explorer (backend/cmd/simharness) — the CLI TTK/TTD/level-curve batteries and the -serve web explorer. Use when asked to run simharness, start the explorer, screenshot its UI, verify the sim harness end-to-end, or run its tests.
---

simharness is the headless balancing / what-if explorer (`docs/plan-sim-harness.md`):
a Go CLI that runs seeded combat batteries against the real ECS, plus a `-serve`
mode hosting a single-file web explorer. Drive the web UI headlessly with
`.claude/skills/run-simharness/driver.mjs` (Playwright, no root needed) after a
one-time `setup-browser.sh`. This skill covers **simharness only**, not the
aurad game server.

All paths are relative to the **repo root**.

## Prerequisites

Go ≥ 1.22 and Node 20 (Node only for the browser harness). No sudo required —
the container lacks `libnspr4`/`libnss3`/`libasound2` that headless Chromium
needs, so the setup script extracts them from Ubuntu debs into
`~/.cache/aurahunter-run/libs` instead of installing system-wide:

```bash
bash .claude/skills/run-simharness/setup-browser.sh
```

Idempotent; re-running is cheap (npm + playwright browser + debs are cached).

## Build

```bash
make -C backend simharness.build   # runs cp-defs + gen, produces backend/simharness
```

(`go run ./cmd/simharness` from `backend/` works too and skips cp-defs.)

## Run (agent path)

**One-shot CLI batteries** (table to stdout + JSON artifact via `-out`, `''` skips):

```bash
./backend/simharness -levels -runs 50 -max-level 8 -out ''   # f(level) curve battery
./backend/simharness -runs 200 -out ''                       # 1v1 TTK/TTD battery
```

`-h` lists all knobs (player/mob baselines, curve growth/span, XP model,
triple-table candidates).

**Web explorer + browser drive** (the real UI check):

```bash
./backend/simharness -serve localhost:8099 & echo $! > /tmp/simharness.pid
timeout 30 bash -c 'until curl -sf http://localhost:8099 >/dev/null; do sleep 0.5; done'
node .claude/skills/run-simharness/driver.mjs http://localhost:8099 /tmp/simharness-shots
kill "$(cat /tmp/simharness.pid)"
```

The driver waits for the auto-run 1v1 results, fires the level-curve battery
(span shrunk to 12 for speed), screenshots both states to
`/tmp/simharness-shots/{1v1,level-curve}.png`, and **exits non-zero on any
browser console error** — check its exit code, then look at the screenshots.

Quick endpoint smoke without a browser:

```bash
curl -s http://localhost:8099/mobs | head -c 120     # authored-mob presets
curl -s -X POST http://localhost:8099/curve -d '{"runs": 0}'   # -> 400 validation
```

## Run (human path)

`./backend/simharness -serve localhost:8099`, open the URL in a browser,
Ctrl-C to stop. Add `-content ../api` (run from `backend/`) to load live repo
content for the mob-preset dropdown instead of the embedded copies.

## Test

```bash
cd backend && go test -timeout 120s ./pkg/aura/sim/ ./cmd/simharness/
```

Both packages pass (sim sanity pins + HTTP handler tests). The sim package is
also race-clean: `go test -race ./pkg/aura/sim/`.

## Gotchas

- **`go run ./cmd/simharness` from repo root fails** with `go: cannot find
  main module` — the Go module lives in `backend/`. Either `cd backend` first
  or use the built `./backend/simharness`.
- **Never `pkill -f <anything>`** (here: `pkill -f simharness`) — the pattern
  matches your own shell's command line and kills it (observed as exit code
  144), leaving the stale server alive. Use the pid file as shown above, or
  `pkill -x simharness` (name-exact). The rule is not process-specific; it has
  bitten `aurad` and `npm run start` too.
- **Chromium needs `LD_LIBRARY_PATH`** pointing at the extracted debs; the
  driver injects it into the browser subprocess itself, so nothing to export —
  but bypassing the driver with raw Playwright will hit
  `error while loading shared libraries: libnspr4.so` unless you set it.
- **The deb URLs in `setup-browser.sh` are version-pinned** (Ubuntu noble). If
  the archive bumps a version the download 404s — look up the current filename
  at packages.ubuntu.com and update the pin.

## Troubleshooting

- **`libnspr4.so: cannot open shared object file`** (then `libasound.so.2`):
  the browser harness isn't set up — run `setup-browser.sh`; if it persists,
  the extracted `libs/` dir is missing from `AURA_RUN_DIR` (default
  `~/.cache/aurahunter-run`).
- **Driver exits 1 with `console errors: […]`**: the page threw — that's the
  driver doing its job; read the listed errors, they name the failing JS.
- **`bind: address already in use` on `-serve`**: a previous server is still
  up — `kill "$(cat /tmp/simharness.pid)"` (or find it with `ss -ltnp`).
