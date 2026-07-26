---
name: verify
description: Headless in-game smoke for aurad + the browser client — build, serve, join, drive the HUD with Playwright. Use to verify frontend/backend changes at the real game surface (not simharness; that has its own skill).
---

Recipe for driving the actual game headlessly, distilled 2026-07-18. All paths
relative to the **repo root**.

## Build & serve

```bash
cd frontend && npm run build            # backend -dev serves frontend/dist
make -C backend build                   # only needed for backend changes
bash .claude/skills/run-simharness/setup-browser.sh   # one-time; shared browser harness
cd backend && setsid nohup ./aurad -dev -content ../api > /tmp/bh.log 2>&1 < /dev/null &
```

`conf.json` `frontendDir` points at `../frontend/dist` — frontend changes need
the webpack **prod build**, not just a dev server. Game URL:
`http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop`.

## Boot-count sanity check

After a content add/edit, confirm the server actually loaded the new definitions
(a stale `aurad` process silently masks new content). The boot log is
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
- **Slot hotkeys (1–3, Q/E/F) need a LONG hold — ~1.3 s, not 200 ms.** They are
  edge-triggered from `Controls.update`, whose Tock clock is rAF-driven, and a
  headless/backgrounded page has its rAF heavily throttled (far slower than the
  nominal 33 ms `INPUT_TICKRATE`). A short `keyboard.down`/`up` pair can fall
  entirely between two samples, so the key registers in the KeyboardManager
  (`key.isDown` really does flip) but no action ever fires — it reads exactly
  like a broken feature. Raw `window` keydown listeners (Escape, chat, console)
  are unaffected, which makes the failure look even more selective.

## Gotchas

- The `-dev` server can die mid-session with `Overload! Systems at: 103%`
  under headless load — if `ERR_CONNECTION_REFUSED` appears, check the log
  tail and just restart; it is not caused by your change.
- **Never `pkill -f <anything>`** — the pattern matches the full command line
  of your own shell and kills it before the restart runs (observed as exit
  code 144), leaving the stale process alive. Use `pkill -x <name>`
  (name-exact; a shell is named `bash`, so it can never match) or a pid file.
  For a plain dev restart prefer `./scripts/dev-restart.sh`, which encapsulates
  this.
- Player names are reserved while the corpse persists — use a fresh name per
  run if a prior run's player just died.
- **After `WARP`, wait ~20 s before screenshotting.** The client interpolates
  the camera very slowly across a large jump (backlog §20), so a shot taken
  ~1.5 s after the command renders the *previous* position — silently, with no
  error and a perfectly plausible-looking frame. A darkness measurement run
  (2026-07-22) was contaminated end-to-end by this and produced exactly
  inverted results. If the frame must be trustworthy, allow the settle or
  confirm the position first.
- **Reaching the live PixiJS scene graph:** `window.game` exists with a valid
  `&token=` (`BrowserConsole.ts`), and `window.game.character.plate.parent` IS
  the `namePlates` overlay container — from there `page.evaluate` can walk
  children and read `visible` / `position` / text. Asserting on scene-graph
  state beats eyeballing screenshots for anything conditional (e.g. "is this
  plate hidden?"), and TS `private` is compile-time only, so private fields
  are readable at runtime.
- **`Cannot read properties of null (reading 'split')` = a lost WebGL context**,
  not a bug in your change (diagnosed 2026-07-26, `docs/backlog.md` §29.1).
  **Since §29 option A the client says so itself** — look for the console error
  `[webgl] world context lost` and a red banner; its *absence* on a blank world
  means the cause is something else. On a
  lost context every WebGL getter returns null, so PixiJS misreads it as a
  shader link failure and its error reporter dies on
  `gl.getShaderSource(shader).split('\n')` — destroying the real diagnostic. The
  throw escapes the rAF callback, so **the render loop stops**: the world is
  blank while the HUD, websocket and server ticks all look perfectly healthy.
  Count is the number of shader programs the dying frame still had to build
  (3 mid-boot, 1 in steady state). Two traps: a **scene-graph walk cannot detect
  it** (children unchanged — screenshot instead), and a `webglcontextlost` event
  at boot is *normal* (pixi makes 5 contexts and deliberately loses 2 capability
  probes) — which is why the warning listens on the world canvas only.
  Reproduce on demand with `ctxloss-repro.mjs`; hunt organically with
  `hunt-null-split.mjs`; re-check the warning itself with
  `ctxloss-warning.mjs clean|forced` after any boot-path change (`clean` must
  report **0** warnings, or the banner is crying wolf on every boot).
