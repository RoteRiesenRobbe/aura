# Plan: Bug report: a player writes what went wrong, the game adds what we need to know

**Status: DESIGNED + APPROVED 2026-11-03 (planning session, PO in chat). R1-R7 RULED, D1-D12
APPROVED, Q1-Q3 taken as proposed with the approval, nothing built.** 2 chunks (§5); BR1 can start once approved, BR2 after BR1.

**Owns:** the "Report bug" entry in the settings panel, the report text and its diagnostics,
the server's bug-report file. **Builds on:** the settings panel (`game-settings/`), the
accounts HTTP API and its JWT (`accounts/server.go`), the dev `Fps.ts` frame delta
(`PrerenderEvent`), Ping/Pong (`Backend.ts`). **Amends / Supersedes:** nothing.
**Schema (as designed):** DB none · wire none (HTTP JSON, not FlatBuffers) · conf +1 key
(BR2, the report file path) · content none · lang +~12 frontend keys (en + de).

⚑ Line references pinned 2026-11-03 at `f6e7d6a0` (main); re-verify before relying on them.

---

## 1. What this is

The PO played the live game on a Mac (Firefox and Safari) on 2026-11-02 and hit three
problems that nobody could have diagnosed without sitting at that machine: single-digit fps
with the camera trailing the player, a solid blue minimap and M map in Firefox, and the
spellbook covering the passive bar on a short viewport. The investigation (this session)
found likely causes for all three, but every one of them hinged on facts only the player's
machine knows: device pixel ratio, window size, GPU, browser, console errors.

So players get a way to hand us those facts. In the settings panel, **Report bug** opens a
free-text box. **Generate bug report** runs a short fps check, then shows one plain-text
report: the player's words, then an automatically generated diagnostics section. The report
fills about two thirds of the screen under the banner **"PLEASE SEND THIS REPORT TO US VIA
DISCORD:"**, with Copy and DONE at the bottom; X and Esc also close it. From BR2 on the
client also sends the report to the server, which appends it to a file.

### 1.1 What already exists and is reused

- **Settings panel** (`frontend/src/features/game-settings/assets/settings.partial.html`,
  `logic/GameSettingsUI.ts`): the gear is reachable in game and on the start screen; its
  `hide()` is already in the panel exclusivity family that Esc closes (`GameSettingsUI.ts:203`).
- **Frame delta:** `PrerenderEvent` passes `timeDelta` per frame (`internal-tools/develop/logic/Fps.ts`).
- **Ping:** the Ping/Pong pair (`Backend.ts:406`, `PongReceivedEvent`) and the dev console's `ping`.
- **Accounts HTTP API:** `POST /api/...` routes with JWT auth and a `MaxBytesReader` body cap
  (`backend/pkg/aura/accounts/server.go:154-159`, `:218`).
- **Renderer facts:** `Game.renderResolution()` (`core/logic/Game.ts:176`), the two
  Applications (`Game.ts:184`, `map/logic/MiniMap.ts:228`).
- **Discord link** already in the client (`social-media-links/assets/socialMedia.html:13`).
- **Missing:** the client has **no build version** today (no `DefinePlugin`, no git hash).

## 2. PO rulings (2026-11-03)

- **R1 - "Report bug" lives in the settings panel.** Free-text field, a button labelled
  **"Generate bug report"** (not "write"). Why: the settings gear is reachable everywhere,
  including the start screen.
- **R2 - The report has two sections:** 1. the player's free text, 2. auto-generated
  diagnostics (browser, device, time of day, game version, an fps check run at the press).
- **R3 - The result panel:** about two thirds of the screen, a banner on top "PLEASE SEND
  THIS REPORT TO US VIA DISCORD:", a DONE button at the bottom; X top right and Esc also close it.
- **R4 - Also saved on the server, as a file** (BR2), **and nothing malicious may get in.**
  Why: the PO wants our own copy without depending on the player posting it.
- **R5 - A Copy button next to DONE.**
- **R6 - Extra diagnostics:** recent console errors, GPU + renderer facts, character +
  zone + position, network latency.
- **R7 - Scope is the bug report only.** The three issues found today (Mac perf, Firefox
  blue map, spellbook vs passives) are handled separately; see §10.

## 3. Design

### D1 - The flow
Settings panel → a **Report bug** button (bottom of the panel) → the panel shows a
`<textarea>` (placeholder "What happened? What did you expect?") and **Generate bug
report**. Pressing it disables the button, shows "Measuring…" for the fps window (D5), then
closes settings and opens the **report panel** (D2). An empty text box is allowed: the
diagnostics alone are worth having.

### D2 - The report panel
A new HUD overlay, ~66vw × 66vh [PLACEHOLDER], centred, ink-panel chrome. Top: the banner
(R3) in the gold title style, a Discord link beside it (reusing the existing invite URL),
the X. Middle: the report in a **read-only `<textarea>`** (monospace, scrolls, select-all on
focus). Bottom: **Copy** and **DONE**. Closes on X, DONE, Esc. Joins the exclusivity family
(opening it closes the others, Esc's blanket close reaches it). `pointerdown`, never `click`
(the MouseManager gotcha, CLAUDE.md HUD event handling).

### D3 - The report text: one pure builder
`buildBugReport(message, diagnostics): string` in a pixi-free module, so vitest pins it.
Plain text, stable order, `key: value` lines, a missing fact prints `n/a`:

```
== Bug report ==
<player's text, verbatim>

== Diagnostics ==
report id:      <BR2: from the server; BR1: n/a>
game version:   <git short hash> (<build date>)
local time:     2026-11-03 21:14 (Europe/Berlin, UTC+1) · UTC 20:14
browser:        <userAgent> · language de-DE · game language de
device:         desktop|mobile (isMobile) · touch yes/no · platform <navigator.platform>
screen:         1512×982 css px · DPR 2 · window 1512×860 · fullscreen no
renderer:       webgl · resolution 2 · canvas 3024×1720 (5.2 Mpx) · MSAA on
gpu:            <unmasked renderer, or masked string> · max texture 16384
minimap:        webgl · canvas 240×240
fps check:      2.0 s · avg 8.3 fps · median 118 ms · p95 160 ms · worst 210 ms · tab visible
ping:           42 ms
settings:       skill effects full · muted yes
character:      <name> · level 12 · zone world · at 41.20, -7.85 (WARP 4944 -942)
server:         wss://aura-game.duckdns.org/game
console (last 20):
  [error 21:12:03] <message, single line, truncated to 300 chars>
  ...
```

The diagnostics labels stay **English** (Q2): the section is for us, read like a log.

### D4 - Diagnostics collection
One `collectDiagnostics()` reads, at the press: `navigator.userAgent`, languages, platform,
`maxTouchPoints`; `screen` and `window.inner*`, `devicePixelRatio`; for **both**
Applications: `renderer.type`, `renderer.resolution`, canvas width × height,
`gl.getContextAttributes().antialias`, `MAX_TEXTURE_SIZE`, and the GPU string via
`WEBGL_debug_renderer_info` when the browser grants it (Firefox and Safari return a masked
string; record whatever comes back); the game language and the skill-effects / mute
settings; the local character's name, level, zone and position (world units, plus the
×120 WARP form); the server URL. Off the game (start screen) the in-game lines print `n/a`.

### D5 - The fps check
On the press, collect `timeDelta` from `PrerenderEvent` for **2 s [PLACEHOLDER]** (min 30
frames [PLACEHOLDER], whichever is longer, capped at 5 s [PLACEHOLDER]). Report avg fps,
median, p95 and worst frame time, plus `document.visibilityState`. A pure
`frameStats(deltas)` does the arithmetic (vitest). ⚑ It is measured with the settings panel
open over the world; that is a known, constant overlay, stated in the report line rather
than worked around.

### D6 - Ping at the press
Send one Ping and time the next `PongReceivedEvent`; give up after 2 s [PLACEHOLDER] and
print `n/a (no pong)`. Runs in parallel with the fps window, so it adds no wait. Not
connected (start screen): `n/a`.

### D7 - Console ring buffer
Installed **first thing in the entry point**, before Pixi and the game boot: wraps
`console.error` and `console.warn` (still calling the originals) and listens to
`window` `error` and `unhandledrejection`. Keeps the last **20 [PLACEHOLDER]** entries,
each flattened to one line (`String()` of each argument, errors as `name: message`),
truncated to **300 chars [PLACEHOLDER]**. Pure ring logic in its own module (vitest).

### D8 - The game version stamp
Webpack `DefinePlugin` injects `__GAME_VERSION__` (git short hash, `-dirty` when the tree
has changes) and `__BUILD_DATE__` at build time, falling back to `unknown` when git is not
available (Docker build). Read in one place (`buildInfo.ts`). Useful beyond this plan.

### D9 - Copy
`navigator.clipboard.writeText(text)`; where it is missing or refused (insecure origin,
Safari permission), fall back to selecting the textarea and `document.execCommand('copy')`.
The button confirms with "Copied!" for 2 s [PLACEHOLDER]; on total failure it says "Select
the text and copy it by hand".

### D10 - The server copy (BR2)
The client POSTs `{message, diagnostics}` (both strings) to **`POST /api/bug-reports`**
right after building the report, before the panel opens; the server answers `{id}` and the
client writes `report id: <id>` into the text, so a Discord post and the server line can be
matched. If the POST fails (offline, not logged in, rate limited), the panel still opens and
the id line says why (`n/a (not saved: rate limited)`). The panel never waits more than
2 s [PLACEHOLDER] on it.

### D11 - Nothing malicious gets in (R4)
The report is untrusted input end to end. The rules, all in the handler:
1. **Logged-in only.** The route requires the account JWT; the account id and character
   come from the token and the server's own session, **never from the body**.
2. **Size caps:** body ≤ 32 KB [PLACEHOLDER] (`MaxBytesReader`, as the other routes),
   `message` ≤ 4 000 chars [PLACEHOLDER], `diagnostics` ≤ 16 000 chars [PLACEHOLDER];
   over → 413, nothing written.
3. **Only text survives:** invalid UTF-8 is rejected; every control character except `\n`
   and `\t` is stripped (that removes ESC, so no terminal escape sequences reach whoever
   `cat`s the file, and no `\r` line tricks). Unknown JSON fields are refused.
4. **One record per line, by construction:** each report is written as one
   `json.Marshal`ed object (`{id, received_utc, account_id, character, message,
   diagnostics}`) plus `\n`. JSON escaping means a newline or quote in the text can never
   start or forge another record. JSONL; read it with `jq`.
5. **Rate limit per account:** 3 per 10 min and 20 per day [PLACEHOLDER], in memory
   (a restart resets it; acceptable). Over → 429.
6. **The file is bounded and private:** a fixed path from conf (no client-supplied name or
   path), opened `O_APPEND|O_CREATE`, mode `0600`, writes behind a mutex; past
   50 MB [PLACEHOLDER] the server refuses new reports with 507 and logs a warning once.
7. **Write-only:** no route ever serves the file back; nothing on the server parses or
   executes its content.

And on the client: the report is shown via `textarea.value`, never `innerHTML`, because the
console buffer can carry arbitrary text.

### D12 - Where the file lives
Conf key `bugReports.path` [PLACEHOLDER name]. Dev default: `bug-reports.jsonl` next to
`conf.json`, gitignored. Live: **`/var/lib/aurad/bug-reports.jsonl`**, outside `/opt/aurad/`
because `deploy.sh` rsyncs that directory with `--delete` (L5). Same not-backed-up posture as
the live DB (project_playtest_deploy).

## 5. Chunks

| # | Chunk | Contents | Size |
| --- | --- | --- | --- |
| **BR1** | The report, client only | D1-D9: settings entry, form, fps check, ping, console buffer, diagnostics, version stamp, report panel, Copy/DONE/X/Esc, en + de strings | M |
| **BR2** | The server copy | D10-D12: `POST /api/bug-reports`, the D11 rules, the conf key (all conf files + `devops/conf.json`), the id line, the live directory | M |

### BR1 - The report, client only
- **Needs first:** approval.
- **Schema:** DB none · wire none · conf none · content none · lang +~12 frontend keys (en + de).
- **In-game (PO):** open settings in game and on the start screen; write a line, Generate;
  the panel shows your text, then diagnostics with a plausible fps and ping; Copy, paste into
  a text editor; DONE, X, Esc each close it; typing WASD in the box does not move the
  character. On the Mac: the screen/renderer lines show DPR 2 and the canvas pixel count.

### BR2 - The server copy
- **Needs first:** BR1.
- **Schema:** DB none · wire none · conf +1 key `bugReports.path` · content none · lang +2-3
  keys (the "not saved" reasons).
- **In-game (PO):** Generate a report; the panel shows a report id; the same id is the last
  line of the file (`jq` it); a fourth report inside 10 min says "not saved: rate limited"
  and still shows the panel. After a deploy the file is still there.

## 6. Test strategy

- **vitest (BR1, red first):** `buildBugReport` (section order, verbatim message, `n/a`
  for missing facts, the console block); `frameStats` (avg, median, p95, worst; one frame;
  a stall); the console ring (cap 20, truncation, one-line flattening, Error objects,
  originals still called); the WARP coordinate form.
- **Go (BR2, red first, `accounts` package):** 401 without a JWT; 413 over each cap and
  nothing written; control characters stripped but `\n`/`\t` kept; a message containing
  `\n{"id":"forged"}` stays inside ONE line that `json.Unmarshal`s back to the original;
  unknown field → 400; 4th report in the window → 429; the file-size ceiling → 507; two
  concurrent posts → two whole lines; the id is returned and is the written record's id.
- **verify harness:** a new `bug-report.mjs`: join, open settings, Report bug, type, Generate,
  assert the panel's banner and that the text holds the message, `fps check:` and
  `renderer:`; Copy; Esc closes. BR2 adds: the id line is not `n/a` and the file's last line
  carries it. Add a leg at a short viewport (1440×780) so the panel's own fit is checked.
- **PO look** per §5.

## 7. Open PO calls

- **Q1 - Is the server copy sent automatically on Generate, or behind a checkbox?**
  RULED 2026-11-03 with the approval, as proposed: automatic, with one line under the banner "A copy was saved on our server
  (id …)". The player already chose to report; a checkbox is one more thing to miss.
- **Q2 - Diagnostics labels in English only?** RULED 2026-11-03 with the approval, as proposed: yes. The player-facing parts
  (button, banner, placeholder, Copy/DONE, status messages) are localized as usual; the
  diagnostics block is developer data, like a log, and an English block is what we read.
- **Q3 - A dev way to read reports?** RULED 2026-11-03 with the approval, as proposed: none (YAGNI); `ssh` + `jq` on the file.
  Revisit if reports arrive in volume.

## 8. Landmines

- **L1 - Typing in the box must not drive the game.** The textarea receives WASD and the
  hotkeys (B, M, J, Esc…). Find how chat input suppresses game keys and reuse that guard;
  a box that walks the character while typing is the obvious first bug.
- **L2 - `pointerdown`, never `click`,** on every new button (CLAUDE.md, MouseManager).
- **L3 - Esc while typing:** Esc should close the form/panel, not first trigger something
  else in the Esc family. Pin it in the harness.
- **L4 - The console buffer must install before anything can fail.** Installed late, it
  misses exactly the boot and bake errors it exists for (the Firefox blue map would be one).
- **L5 - `deploy.sh` rsyncs `/opt/aurad/` with `--delete`** (`devops/deploy.sh:36`): a
  report file inside it is wiped on every full deploy. Keep it in `/var/lib/aurad/` and make
  sure the service user can write there (`devops/aurad.service`).
- **L6 - Conf has several copies** (conf.default.json, the local ones, `devops/conf.json`,
  the fifth on the live server, memory project_pre_accounts_hygiene): the new key goes in
  every one, or the live server writes to its default.
- **L7 - Clipboard needs a secure context and a user gesture;** the fallback (D9) is not
  optional.
- **L8 - The fps window measures a backgrounded tab at ~1 fps** (rAF throttling). Record
  `visibilityState` so such a report is readable, and do not "fix" low numbers from it.
- **L9 - `innerHTML` anywhere in the report path is an XSS door** (console text is arbitrary).

## 9. Schema impact

- **DB:** NONE (the file is not the database; no migration).
- **Wire:** NONE (FlatBuffers untouched; the POST is plain HTTP JSON on the accounts mux).
- **Conf:** BR1 none; BR2 +1 key `bugReports.path` in every conf copy (L6).
- **Content:** NONE.
- **Lang:** +~12 frontend keys (BR1), +2-3 (BR2), en and de in the same change.

## 10. Cross-references

The three issues that motivated this plan, from the 2026-11-03 investigation, handled
outside it (R7):
- **Mac perf:** desktop renders at the raw `devicePixelRatio` with MSAA
  (`Game.ts:176`, `:193`), ~5-8 Mpx per frame on a Retina laptop against the 2.97 Mpx that
  made phones unplayable before their cap; no culling; a second per-frame WebGL context for
  the minimap. The camera's `Vehicle` steps per frame, not per elapsed time
  (`camera/logic/Camera.ts`, `natureOfCode/arrive/vehicle.ts`): below ~15 fps it is slower
  than walking. A mitigation waits for real reports (this plan's `screen`/`renderer`/`fps`
  lines).
- **Firefox blue map:** the blue is the Water ground rect at the bottom of the map bake
  (`map/logic/MapTerrain.ts`); everything baked after it is missing. Reproducible headless
  with Playwright Firefox and `m1-minimap-radar.mjs` / `c1-world-map.mjs`.
- **Spellbook vs passives:** `#spellbookScroll` is a fixed 32rem (`HUD.less:921`); the left
  column needs ~800 px. PO chose 2026-11-03: keep 8 rows per page, shrink and scroll only
  when the viewport is too short.

## 11. Chunk ledgers

(none yet)
