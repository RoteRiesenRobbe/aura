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
- **A dead player nulls the way into the scene graph.** `Character.destroy()`
  sets `plate = null`, and `character.plate.parent` is the documented entry
  point — so the moment the player dies, every scene-graph read throws
  `Cannot read properties of null (reading 'parent')` and the run dies
  mid-assertion, looking exactly like a crash in the feature under test. A
  level-1 player parked next to an NPC for 20 s is inside plenty of aggro radii
  (observed 2026-07-27 at the ForestSign, after the earlier steps had passed).
  **Cache the root once while the character is alive** (`window.__auraRoot`) and
  run `GOD` in any script that stands still.
- **⚑ Never measure distance in SCREEN space.** The obvious metric — an entity's
  screen bounds vs the viewport centre, "where the player is" — is wrong,
  because `Cam Boundaries: On` clamps the camera at the map edges, so near a
  boundary the player is **not** drawn at the centre. This reported a correctly
  following companion as fleeing (84px → 638px) and was one edit away from a
  false regression report (2026-07-27). Measure in world units instead: a
  sprite's `.position` and `window.game.character.getX()/getY()` are in the
  **same** space (`character.shape.position` equals `getX/getY`), so the
  difference is a true distance in wire units — divide by 120 for world units.
- **⚑ Measuring a PACE? Check the ground first.** The world has 777 blocking
  props, so an arbitrary `WARP` target can sit in a pocket only a couple of units
  wide — and then every walk measures the pocket, not the speed. That cost four
  runs on the Swift chunk (2026-07-29): identical `2.04u` walks whether sprinting
  or not (a flat "the buff does nothing"), plus `0.00u` legs whenever two
  consecutive walks pushed the same way, which read convincingly as an
  input-handling bug and sent the script chasing key-repeat theories. On open
  ground the player walks a clean **1.5 u/s** (`WalkingSpeedPerTick` 0.05 × 30
  ticks), time-proportional over 2/4/6 s — the throttled rAF does *not* slow it,
  because the server coasts on held movement for up to `maxHoldTicks` (15).
  Pick the target by scanning `api/zones/world.json` for the whole-unit tile
  furthest from any `blocksMovement` prop and the border (currently **-23, 14**
  at 7.23 units), keep legs short enough not to reach that edge, and **assert the
  unbuffed baseline is near 1.5 u/s** — a slow baseline means obstruction, and
  the run should say INCONCLUSIVE rather than print a ratio. Worked example:
  `swift-cooldown.mjs`.
- **Equipping from the spellbook: click the skill NAME, not the row centre.**
  Each row is `<name> [−] <lvl>/<max> [+]`, and the spend/unspend buttons sit
  mid-row with explicit precedence in the `pointerdown` handler — a centre click
  spends a skill point and the equip then silently never happens. Click
  `box.x + 25`, then assert `#spellbookList li.selected` before clicking the
  slot. `chunk2-follower.mjs` is the worked example (spellbook → cooldown slot →
  long-hold `Q`, including waiting out a running cooldown).
- **⚑ Warping "to" an NPC does not mean the server picks THAT NPC.** The
  interact offer goes to the nearest eligible conversant, and zone 1 stands them
  close together — a warp aimed at the Farmer (−57, 28.6) is answered by the
  **Hermit** (−54.9, 25.6), the only one inside the 2.0 talk range from
  (−57, 26). The badge lights, every assertion goes green, and the run measures
  the wrong actor: R4's first 7/7 was scored against an NPC that did not carry
  the aura the whole test was about (2026-07-29). **Assert the precondition that
  makes the subject the subject** — not just that *something* was reached.
  Conversants near the zone-1 start: Farmer (−57, 28.6), Hermit (−54.9, 25.6),
  TownCrier (−55.7, 22.0).
- **⚑ One sample = one `page.evaluate`.** Reading two or three facts about the
  same moment as separate round trips lets the world move between them: an
  R4 probe read the badge from the old frame and the position from the new one
  after a `WARP` landed mid-sample, and scored a legitimately-lit badge as the
  defect. Same class of error as latching on the wrong event — *"some corpse is
  fading somewhere"* is not *"my actor was removed"*, since mobs leave the
  viewport constantly and sample 0 already showed two. Latch on the thing you
  actually caused (the player's own position), and read the whole sample atomically.
- **⚑ A red harness is not automatically a regression — check it against HEAD.**
  `chunk3b-interact.mjs` has been **permanently red at 6/15 since chunk 3b-ii**:
  it was written for 3b-i, where `E` taught directly, and 3b-ii moved teaching
  behind a conversation-panel row click without updating it.
  `chunk3b-ii-conversation.mjs` is at 25/28 + 1 skip: one content
  drift (the teaching list gained `"A servant of the flame. level 15"` in
  `3b1b3ef6`) and two Wanderer checks that never resolve the actor.
  **`chunk3a-npc-merge.mjs` was DELETED 2026-07-29** — it had gone
  0/6 because every check asserted that *approaching* an NPC teaches you, which
  is precisely what 3b-i reversed (L18). Not repairable: its premise was the
  behaviour, and the behaviour it covered now belongs to the two scripts above.
  ⚑ **A harness whose premise a later chunk reverses should be deleted with that
  chunk, not left to rot** — this one stayed red for two chunks and read as a
  regression to everyone who ran it. Both read exactly like a break in
  whatever you just changed. `git stash` + rebuild + re-run is the cheap
  settlement, and it is worth doing before diagnosing anything.
- **`WARP` moves only the PLAYER.** Summons, followers and anything else owned
  stay where they were and drop out of the client's view — so a check that warps
  and then scores "did my companion do that" is scoring damage it could not have
  caused. Warp first, summon after.
- **⚑ `window.game` is a FOUR-METHOD FAÇADE, not the `Game` instance.** It
  exposes exactly `{run, character, pause, play}` — verified live 2026-07-27.
  So `window.game.getInteractableEntityId()`, `window.game.map`,
  `window.game.backend` and friends are all `undefined`, and reading them
  yields `undefined`/`0` **silently**: no throw, no console error. That cost two
  full harness runs on chunk 3b-ii, where it presented as "the Wanderer never
  moves" and "the TownCrier is never reached" — both actually "the stop
  condition never fired, so the player walked straight past". If you need
  server-driven state, read it off the **rendered scene graph** (via
  `window.game.character.plate.parent`, below) or off the **DOM**, never off a
  Game API you have not first probed with
  `Object.keys(window.game)`.
- **⚑ `#developPanel` covers the right-hand side of the screen in `&develop`.**
  It is a large draggable `<table>` layered above the HUD, so a
  `page.mouse.click` at coordinates under it hits the table instead of your
  element — with no error, and `elementFromPoint` is the only thing that says
  so. This made a HUD close-button unclickable for three runs. `&develop` is
  still required for the console, so hide the panel right after joining:
  `document.getElementById('developPanel').style.display = 'none'` (the console
  is a separate element and is unaffected).
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
