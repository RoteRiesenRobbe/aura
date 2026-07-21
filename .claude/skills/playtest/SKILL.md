---
name: playtest
description: Get the game running and ready for the PO to click into and test by hand — decide what actually needs rebuilding, restart the server cleanly, verify the boot log, hand over a URL. Use for "restart everything so I can test", "make it ready", "I changed X, get it running". Not for headless automated smoke (that is the `verify` skill).
---

Goal: the PO alt-tabs to a browser and plays. Nothing else. Do the minimum
work that makes the change live, then verify it actually booted before saying
it is ready.

All paths relative to the **repo root**.

## 1. Decide what needs rebuilding

Check what changed (`git status`, `git diff --stat`) and pick the cheapest path:

| Changed | Action |
|---|---|
| `api/**/*.json` only (items, mobs, skills, recipes, zones, props, factions) | **No rebuild.** Restart with `-content ../api` |
| Backend `.go` | `make -C backend build` (plain `go build ./...` does **not** refresh `./aurad`) |
| `api/schema/*.fbs` | `cd api/schema && ./make.sh`, then backend build **and** frontend build |
| `frontend/**` | Nothing if the webpack dev server (port 2001) is up — HMR picks it up |

`-content ../api` covers **all** of the api/ subdirs, zones included, so JSON
edits skip both `cp-defs` and the rebuild. Never `make build` just for a JSON
edit — `cp-defs` reverts `backend/pkg/api/` from source and wastes a minute.

## 2. Restart the server

Kill the stale process first — a running `aurad` silently serves old
content and that has burned sessions before.

```bash
pkill -x aurad; sleep 1
cd backend && setsid nohup ./aurad -dev -content ../api \
  > "$SCRATCH/server.log" 2>&1 < /dev/null &
sleep 4
```

Use `pkill -x` (name-exact), **never** `pkill -f aurad`. `-f` matches the full
command line, and the shell running this snippet has `aurad` in its own command
line — so it kills itself before starting anything, and the old server survives.
`'[a]urad'` does not save you either: the `./aurad -dev` later in the same
compound command still matches. `-x` matches only the process name, so a shell
(named `bash`) can never match.

Check the frontend dev server is alive too (`ps aux | grep webpack`); if not,
`cd frontend && npm run start` in the background.

## 3. Verify the boot before handing over

Content loading is validated at boot and **panics** on violation. Always read
the log — do not assume a restart succeeded.

```bash
grep -iE '"msg":"Loaded|placed |panic|ERROR' "$SCRATCH/server.log" | tail -20
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:2000/
```

Counts must match the current pin in the CLAUDE.md status banner (the
`boot …` figures — read them from there, they move every content session).
A count that is off by one is a definition that failed to register, not a
rounding detail.

Hard-fail validators that show up as boot panics after a content edit:

- zone has campfires but none flagged `startingSpawn: true`
- a C1+ mob with raw `maxHealth` instead of authored tier + baseline
- an NPC with an unknown `entityType`
- a gate obstacle that did not opt into harvest tags

When a hand edit to `api/` breaks one of these, it is usually collateral from
an editor round-trip rather than intent — diff the parsed JSON semantically
against `HEAD` (float noise like `1.0 → 1` hides the real change), tell the PO
what was dropped, restore it, and boot.

## 4. Hand over

Report the boot counts and give the URL:

```
http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game
```

Port **2001** is the webpack dev server (HMR — use this by default). Port 2000
serves `frontend/dist`, so it only reflects frontend changes after a prod
build.

Useful additions: `&develop` (dev panel), `&start-cmds=GOD,XP,...`.
Dev cheats in-game: `GOD`, `WARP <x·120> <y·120>`, `SPEED [factor|off]`, `XP`,
`SKILL <name>`, `ANNOUNCE <text>`, `THREAT [id]`.

## Scope

Stop at "it is running and the counts are right". Do not drive the client, run
the suite, or start a review unless asked — the PO is testing by hand, and the
handover is the deliverable.
