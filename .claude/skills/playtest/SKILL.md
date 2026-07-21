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

## 2. Restart

**Use the script — do not hand-roll the kill/start commands.**

```bash
./scripts/dev-restart.sh server     # aurad only (the common case)
./scripts/dev-restart.sh frontend   # webpack only
./scripts/dev-restart.sh all        # both
```

It kills stale processes, starts fresh ones detached, waits for both ports,
prints the boot counts, and fails loudly on a panic. Logs land in
`/tmp/aura-dev/` (override with `AURA_LOG_DIR`).

Restart the **frontend** too whenever generated files outside `frontend/src`
change — regenerated `api/schema/js/` bindings especially. HMR does not watch
them, so the client keeps running against stale FlatBuffers definitions. Tell
the PO to hard-reload (Ctrl+Shift+R) after any wire change.

> **Why a script:** the kill must be `pkill -x <name>` (name-exact). `pkill -f
> <pattern>` matches the full command line — including the shell running the
> restart — so it kills itself before starting anything and the old process
> survives, silently serving stale code. This has burned several sessions, for
> `aurad`, `npm run start`, and `simharness` alike. The rule is not
> process-specific: **never `pkill -f`, for anything.**

## 3. Verify the boot before handing over

The script already greps the log and returns non-zero on a panic, so a clean
exit plus the printed counts is the check. Content loading is validated at
boot and **panics** on violation — never assume a restart succeeded without
seeing those counts.

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
