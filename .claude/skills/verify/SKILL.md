---
name: verify
description: Headless in-game smoke for berryhunterd + the browser client — build, serve, join, drive the HUD with Playwright. Use to verify frontend/backend changes at the real game surface (not simharness; that has its own skill).
---

Recipe for driving the actual game headlessly, distilled 2026-07-18. All paths
relative to the **repo root**.

## Build & serve

```bash
cd frontend && npm run build            # backend -dev serves frontend/dist
make -C backend build                   # only needed for backend changes
bash .claude/skills/run-simharness/setup-browser.sh   # one-time; shared browser harness
cd backend && setsid nohup ./berryhunterd -dev -content ../api > /tmp/bh.log 2>&1 < /dev/null &
```

`conf.json` `frontendDir` points at `../frontend/dist` — frontend changes need
the webpack **prod build**, not just a dev server. Game URL:
`http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop`.

## Boot-count sanity check

After a content add/edit, confirm the server actually loaded the new definitions
(a stale `berryhunterd` process silently masks new content). The boot log is
structured slog JSON; each definition type logs its own `count`:

```bash
grep -E '"msg":"(Loaded (skill|faction|mob|item|recipe|prop) definitions|Loaded milestone unlocks|Loaded zone|placed (campfires|npcs))"' /tmp/bh.log
```

Confirm each count went up by exactly what you added. The canonical good line to
compare against (as of the current content pass) is
`75 skills / 12 factions / 40 mobs / 10 recipes / 5 props / 4 milestone unlocks`,
plus the `Loaded zone` line's `props`/`spawns` (e.g. 620 / 185) and the
`placed campfires` / `placed npcs` counts. Cross-check that the skill/recipe
counts match the pins in `skills/registry_test.go` and `skills/recipe_test.go`
(see the `add-content` skill) — a mismatch there is why `go test` goes red at
HEAD. Boot also **hard-fails loudly** on bad content (unknown faction/enum name,
raw `maxHealth`, missing anchor, campfires-but-none-`startingSpawn`-flagged).

## Drive with Playwright

Copy the browser-launch pattern from
`.claude/skills/run-simharness/driver.mjs` (createRequire from
`~/.cache/aurahunter-run`, `LD_LIBRARY_PATH` env for the chromium subprocess,
`--no-sandbox`). Then:

- **Join:** wait for `#startForm .playerNameSubmit:not([disabled])`, fill
  `#startForm .playerNameInput`, click submit. **Scope to `#startForm`** — a
  second hidden `.playerNameSubmit` ("Respawn") exists on the end screen and
  breaks unscoped selectors.
- **Server commands (GOD, SKILL <name>, WARP …):** the `&start-cmds=` query
  param is DEAD (defined in `BasicConfig.ts`, no consumer). Use the dev
  console instead (`&develop` + valid `&token=`): wait for `#console_command`
  (state attached), then per command set its value and dispatch
  `new Event('submit', {cancelable: true})` on `#console`.
- **HUD interaction:** use REAL input — `page.mouse.click/wheel` at element
  coordinates. Synthetic `element.dispatchEvent(new PointerEvent(...))` is
  unreliable inside SimpleBar-wrapped panels (its capture-phase pointerdown
  handler eats untrusted/zero-coordinate events) and will produce false FAILs.
- HUD panels listen on `pointerdown`, never `click` (see CLAUDE.md).

## Gotchas

- The `-dev` server can die mid-session with `Overload! Systems at: 103%`
  under headless load — if `ERR_CONNECTION_REFUSED` appears, check the log
  tail and just restart; it is not caused by your change.
- Don't `pkill -f berryhunterd` (matches your own shell); use
  `pkill -x berryhunterd` or a pid file.
- Player names are reserved while the corpse persists — use a fresh name per
  run if a prior run's player just died.
