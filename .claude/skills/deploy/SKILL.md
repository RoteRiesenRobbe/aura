---
name: deploy
description: Deploy the current committed version to the live playtest server (aura-game.duckdns.org) with devops/deploy.sh, full or --content-only. Use for "deploy this version to live", "push it live", usually right after "commit and push". Outward-facing: only when the PO asked for the deploy in this session.
---

Goal: the pushed version runs on the live F&F playtest server, announced
first, verified after. Sources: `devops/README.md`, `devops/deploy.sh`,
`docs/plan-playtest-deploy.md` (Ops quick-ref and Status).

All paths relative to the **repo root**.

## 0. Only on request

Deploying changes a server real testers can reach. Run it **only if the PO
asked for it in this session** ("deploy", "push it live"). A commit/push
request alone is not a deploy request, and an older session's yes does not
carry over. Never deploy on your own initiative.

## 1. Preconditions

- `git status` is clean and HEAD is committed **and pushed** (deploy.sh builds
  the working tree, not a commit, so a dirty tree ships uncommitted code).
  If not clean, stop and tell the PO.
- Say what was verified locally for this version (typecheck, tests, harness
  runs from the chunk ledger). deploy.sh itself runs no tests: it only runs
  `make -C backend build` and `npm run build`.
- State the **schema impact** (migrations auto-apply at boot via
  `store.Migrate`; shipped migrations are frozen). Name any wire change
  (FlatBuffers): clients then need a hard refresh.

## 2. Full or --content-only

- `--content-only`: only `api/` JSON changed (map, mobs, skills, quests,
  lang). It rsyncs `api/` (with `--delete`) and restarts; **no rebuild**, so
  no backend, frontend, `conf.json` or schema change goes with it.
- Full (default): anything under `backend/`, `frontend/`, `api/schema/` or
  `devops/conf.json`. It builds backend and frontend, assembles
  `devops/bundle/`, rsyncs it (excluding `tokens.list`) and restarts.
- Mixed or unsure: full. A full deploy also carries `api/`.

State the choice and why before running.

## 3. Announce, then let the shutdown flush

Both modes restart `aurad` (a few seconds of downtime). Restarts keep
characters (PostgreSQL), but the server flushes live characters on shutdown.

1. If anyone is connected, announce in game with the `ANNOUNCE <text>` cheat
   (needs the cheat token on the PO side; do not ask for or print it). If
   nobody is connected, say so and go ahead.
2. Wait for the PO's go, then run the script.
3. In the shutdown log expect `💾 flushed N live character(s) for shutdown`.

## 4. Run it (from the repo root)

```bash
devops/deploy.sh root@159.69.148.73                  # full
devops/deploy.sh root@159.69.148.73 --content-only   # api/ JSON only
```

The script ends by printing the last 25 `journalctl -u aurad` lines. Running
`devops/deploy.sh` with no host only builds the bundle and pushes nothing.
It warns if `devops/conf.json` still holds `CHANGE-ME`; that must not appear.

## 5. Post-deploy check

- Boot log: the content source is `./api`, zone `world`, token count 1,
  "Booting TLS game-server", census counts as expected (the last record:
  boot 0 WARN / 0 ERROR). Further lines on request:
  `ssh root@159.69.148.73 journalctl -u aurad -f`.
- `https://aura-game.duckdns.org/` serves the frontend; `/skills` is the
  cheap liveness probe. For a full deploy, check the new client bundle hash
  is served.
- Ask the PO for a smoke join on live (past deploys closed this way).
- A failed restart, a panic or an ERROR line: report it verbatim and stop.
  Do not improvise ad-hoc `ssh` commands (agent ssh rules are narrowed to the
  runbook shapes; the plan says ad-hoc remote commands prompt).

## 6. Standing facts

- The **live DB is deliberately NOT backed up** (PO ruling 2026-08-04) and
  holds real accounts and characters: treat it as losable. Nothing off-box
  holds a copy. The 2026-08-18 deploy took a one-off pre-deploy `pg_dump`
  with aurad stopped, and it was deleted afterwards (never commit a dump:
  it holds password hashes). Offer a dump only for a risky migration.
- Live is PostgreSQL **18.x**; the dev container is 16.x, so a live dump
  does not restore onto dev.
- Never delete or hand-edit rows under a running `aurad`.
- The **cheat token** lives only in `/opt/aurad/tokens.list` on the server.
  deploy.sh never overwrites it. Never write it into the repo, a commit, a
  doc or a reply.
- Do not delete the Let's Encrypt cert cache (rate limits).
- Still owed on security (not part of a deploy): cloud firewall, DB bound to
  localhost, credential handling, non-root deploy user.

## 7. Owed checks that ride the deploy

Read `CLAUDE.md` `## Status` and list every item marked as waiting for the
next deploy or for a real-phone check on live (for example "the real-phone
check waived to the next deploy"), plus `Next` items such as the buff tray or
skill VFX phone checks. Remind the PO of each once, after the deploy is
verified. Do not mark any of them done.

## 8. Record it

Past deploys were recorded in two places (see `2a776eed`):

- `docs/plan-playtest-deploy.md` Status: a **DEPLOYED <date>, `<hash>`
  (baseline was `<previous deployed hash>`)** entry: what shipped, wire
  change and hard refresh, migrations (or none), pre-deploy dump (or none),
  boot verification, PO smoke result.
- The `CLAUDE.md` Status entry of the chunk it carried gets
  "DEPLOYED LIVE <date> as `<hash>`".

Propose these edits; do not commit unless the PO asks. The baseline hash is
the last DEPLOYED entry in the plan doc.
