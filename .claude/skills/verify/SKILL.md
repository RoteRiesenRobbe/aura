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

⚑ **Since step 8a chunk 1c, `aurad` REFUSES TO BOOT without `AURA_DB_URL` and
`AURA_JWT_KEY`.** An unset `AURA_DB_URL` exits 1 with an explicit message; an
unset `AURA_JWT_KEY` panics. Neither looks like a harness problem, so check the
log's first lines before chasing anything else. The canonical source for both is
the gitignored **`backend/.env.local`** (`cp backend/.env.local.example` to
create it) — source it before launching `aurad` by hand:

```bash
make -C backend db-up && set -a && . backend/.env.local && set +a
```

`scripts/dev-restart.sh` does this for you. On the Windows dev box they may also
be set at User scope, but a shell opened before that does not see them — read
them back with `[Environment]::GetEnvironmentVariable('NAME','User')`.

⚑ **Harness runs now leave residue in a DURABLE database.** Every script creates
`hrnss_*` characters, and since the dev DB moved to a named volume they no longer
vanish with the container. Clear them with `backend/cmd/harnessdb -cleanup`, and
**stop `aurad` first** — it holds live sessions the DELETE never reaches, and
running cleanup under a live server has corrupted save games once already.

⚑ **Point `AURA_TEST_DB_URL` at `aura_test`, NEVER `aura`.** The Go DB tests drop
the whole `game` schema; aimed at the dev database they silently delete the PO's
characters and still report green.

⚑ **Run the harness with `-dev`, which is what these commands already do.** A
non-`-dev` boot with no `tlsHost` allows no browser origin at all — correct, and
it would refuse the harness's own WebSocket handshake (`backlog.md` §43). Under
`-dev` any `localhost`/`127.0.0.1` port is allowed, so nothing changes for these
scripts. ⚑ **`-dev` also unlocks the reserved `hrnss_` name prefix**
(`AllowHarnessNames`), without which every script fails at character creation
with *"That character name is not available."*

⚑ **`taskkill //F //IM aurad.exe` MATCHES NOTHING.** The binary is built as
`aurad` with no extension, so the old process survives, keeps port 2000, and
serves **stale code** — which presents as "my change did nothing", not as a
stale server. It cost three debugging cycles in chunk 2. Use
`taskkill //F //IM aurad` and check for more than one:

```bash
# there should be exactly one, and it should be younger than your last build
powershell -NoProfile -Command "Get-Process aurad | Select-Object Id,StartTime"
```

### Getting into the world (since step 8a chunk 2)

The start-screen name form is **gone** — a character now comes from the account
screens. Every script joins through one helper:

```js
import { joinAsNewCharacter } from './lib/join.mjs';
await joinAsNewCharacter(page, 'tag');   // creation OR character-select, then world
```

It mints a **fresh anonymous account per run**, exactly like a new player, so
every run starts pristine — which is what assertions like *"the spellbook is
empty"* and *"XP goes 0 → 70"* depend on. Names are `hrnss_<tag>_<unique>`;
the prefix is what makes the residue removable.

⚑ **Clean the database afterwards**, or accounts accumulate one per client per
run: `cd backend && go run ./cmd/harnessdb -cleanup`. It refuses any
non-loopback database, and spares the two seeded accounts. The credentialed pair
(`hrnss_01`/`hrnss_02`, needed only by the login/register script) comes from
`AURA_HARNESS_PW go run ./cmd/harnessdb -seed`.

### ⚑ On the Windows dev box

The harness **does** run here — three chunks recorded "no browser harness ran"
before anyone checked, because `setup-browser.sh` reads as Linux-only. It is not:
its second half (extracting `libnspr4`/`libnss3`/`libasound2` from Ubuntu debs)
exists solely because the container it was written in lacks libs Windows already
ships. That half now skips itself when `dpkg-deb` is absent, so the script is the
one-liner setup everywhere:

```bash
bash .claude/skills/run-simharness/setup-browser.sh   # idempotent; ends by launching chromium to prove it
```

Two Windows-specific gotchas, both of which look like a broken harness:

- ⚑ **`./aurad` needs `-zone world` here** — the local `conf.json` names no zone,
  so the command above becomes
  `./aurad -dev -zone world -content ../api`. Without it the boot **panics in
  `loadZone`**, which reads as a content problem rather than a missing flag.
- ⚑ **Run the scripts from Git Bash, not PowerShell.** They resolve playwright
  through `join(process.env.HOME, '.cache/aurahunter-run')`, and `HOME` is set by
  Git Bash but usually *not* by PowerShell — where the join throws before
  anything else happens. Setting `AURA_RUN_DIR` explicitly also works.

## Boot-count sanity check

After a content add/edit, confirm the server actually loaded the new definitions
(a stale `aurad` process silently masks new content). The boot log is
structured slog JSON; each definition type logs its own `count`:

```bash
grep -E '"msg":"(Loaded (skill|faction|mob|item|recipe|prop|quest) definitions|Loaded milestone unlocks|Loaded zone|placed (campfires|npcs))"' /tmp/bh.log
```

Confirm each count went up by exactly what you added. The canonical good line to
compare against (as of conversation-journal Q4, 2026-07-30) is
`86 skills / 15 factions / 64 mobs / 10 recipes / 5 props / 2 milestone unlocks / 4 quests`,
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
- **Name the bot with `botname.mjs`**, never a hand-rolled `'Quest' + pid`:
  `import {botName} from './botname.mjs'` then
  `page.fill('#startForm .playerNameInput', botName('quest'))` →
  *QuestDoer the Quest*. The topic is whatever the run is testing; the name is
  built from it, so a screenshot's nameplate says what the screenshot is for.
  Seeded from the pid, so two concurrent runs get different bots — pass
  `{seed}` for a reproducible one. In a multi-bot harness, give each bot its
  role as the topic (`botName('healer')`, `botName('patient')`); distinct
  topics always yield distinct names. `node botname.mjs --all <topic>` shows
  every candidate. ⚑ The 20-char cap in `PlayerName.ts` (`MAX_LENGTH`, and
  `maxlength="20"` on the input) is why the generator drops over-budget
  candidates instead of truncating: a clipped name reads as a crash.
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

## Coverage map — which harness owns what

**Run the harnesses whose "re-run it when" column matches what you changed,
BEFORE writing a chunk's status banner** (the `chunk-wrap` skill requires it).
Rot in this suite has always come from a chunk changing behaviour a script
asserts and nobody re-running it: 3b-ii moved teaching behind a panel row click
and left `chunk3b-interact.mjs` red at 6/15 for two chunks, reading as a
regression to everyone who ran it afterwards.

| harness | owns | re-run it when you touch |
|---|---|---|
| `chunk3b-interact.mjs` | the interact **verb**: who is offered, badge lifecycle, `E` opens/closes, the `E`→`R` rebind | the offer (`sense`, `interactable_entity_id`), `Interact`, the badge, cooldown keybinds |
| `chunk3b-ii-conversation.mjs` | everything **inside** the panel: tree browsing, grants, level walls, refusals, Back/Leave, unlock banner, ambient lines, the Wanderer hold — ⚑ leg 7's long-flaky drift pin was **REPAIRED in quest C3 (2026-07-30)**: it pinned the actor *after* the panel opened, but the badge is suppressed for whoever the panel belongs to, so the pin silently fell back to "largest mover" (the camera, or a boar that left the viewport and froze at drift 0). It now pins while the badge is lit and reports INCONCLUSIVE rather than red if it cannot | conversation content or the panel UI |
| `chunkC3-journal.mjs` | the **journal**: the `/quests` minimal projection, the ledger on `GameState`, J + the HUD button, the empty-vs-unavailable degrade, the D17 banners, abandon-by-click. Half B needs the probe quest documented in its header (`cp .claude/skills/verify/chunkC3-probe-quest.json api/quests/`, restart, then delete it) and SKIPs without it | quest wire/ledger, the journal panel, the quest catalog, `AbandonQuest` |
| `chunkC4-quests.mjs` | the **authored quest content**: offer / advance / turn-in rows on the right conversants at the right ledger states, the R1 row lifecycle (Accept vanishes, turn-in appears), the authored Q2 trackers, what a turn-in pays, D9's two-NPC branch, and Damage-at-creation. Five legs; the wolf branch kills eight real wolves and goes INCONCLUSIVE rather than red if the hunt comes up short, and the lamp errand deliberately stops before the kobolds | `api/quests/*`, any conversant's `interaction` nodes, the quest grant kinds, the milestone table |
| `npc-portraits.mjs` | NPC **presentation**: sprite size off the wire, health bars, nameplates absent | mob wire fields, NPC art, nameplate/health-bar gating |
| `c2-mob-level.mjs` | the nameplate's **level and tint come from the WIRE, per instance** (plan-mob-levels.md C2): an overridden Stag plates "Stag 25" in red beside an untouched Stag at "Stag 1" in yellow. ⚑ Text and tint are asserted **separately** on purpose — the text is written once per species (`setMobId` early-returns) while the tint recomputes per frame, so a `setLevel` that only stores the number leaves the text catalog-fed forever *and the tint correct*. ⚑ **Needs a throwaway zone edit** (`--install`, restart, run, `git checkout api/zones/world.json`) and SKIPs without it; revert **before** any `make -C backend build`, or `cp-defs` bakes the probe into the binary. ⚑ Boundary with `npc-portraits`: that one owns whether a plate exists at all, this one owns what the plate SAYS | `Mob.level` on the wire, `codec/mob.go`'s encode, `Mob.Level()`'s precedence, `Mobs.ts` plate text/tint, `DIFFICULTY_BANDS`, `world.Spawn.Level` |
| `c3-zone-editor-level.mjs` | the **zone editor authoring a per-spawn level** (plan-mob-levels.md C3): the *Level* field, the value reaching the EXPORT, a blank field exporting no key, the field repopulating on re-select, a fraction refused, and the map marker suffixing only overridden spawns. ⚑ It owns **L7** — `ZoneModel.getZoneAsJSON` is a field WHITELIST, so a field it does not name survives a load and vanishes on the next save; the pure round-trip is pinned in `ZoneModel.test.ts`, this one owns the panel path. ⚑ **`&textures` mounts the editor, not `&develop`** — a `&develop`-only URL leaves every `#zoneEditor_*` id out of the DOM, which reads as "the field was never added". ⚑ Needs no content edit and writes nothing to `api/`: it authors its probe through the editor. ⚑ Boundary with `c2-mob-level`: that one owns what a placed override LOOKS like in the world, this one owns whether one can be authored and saved at all | `ZoneSpawn`, `getZoneAsJSON`/`fromJSON`, the spawn tool panel, `drawSpawnMarker`, `world.Spawn.Level`'s loader rules |
| `r4-badge.mjs` | the badge's **anchor** and its removal with the actor | any overlay hung on `Mob.shape`, or `EntityManager` removal |
| `chunk2-roles.mjs` | the authored `role` discriminator; a structure's always-on aura | `mobs.ParseRole`, `applyMode`, structure behaviour |
| `chunk2-follower.mjs` | the **summon path** end to end: spellbook → cooldown slot → spawn → follow → engage | summoning, follower steering, owner/level plumbing |
| `chunk2-calm.mjs` | calm: aggro drops, the mob holds, any damage ends it | the `calm` payload, the buff store, aggro release |
| `chunk3-charm.mjs` | charm: allegiance flip, pip, follows, fights for its charmer, reverts | `Align`/`RevertFaction`/`EnlistUnder`, `CreditTo`, charm content |
| `swift-cooldown.mjs` | `speed_burst` and the movement axis | `Buffs.MovementFactor()`, movement speed, slows |
| `chunkP-presence.mjs` | presence-counts XP attribution at the game surface: aura-on bystander earns, bare bystander doesn't | the presence scan (`sys/skills.go notePresence`), `NotePresence`/the participant map, `presenceRadius`, `rewardPlayer` |
| `round4-tooltip.mjs` | skill tooltips scaled to character level; the `/skills` payload shape | `SkillTooltip.ts`, the skills catalog endpoint |
| `r1-focus-cost.mjs` | the **cost** half of the tooltip (R1): absolute-Focus cost lines computed off the live pool, `cost_factor` reaching the client (equip Discipline, the price drops), the Focus bar text, the spellbook row clearing the scrollbar. ⚑ Boundary with `round4-tooltip`: that one owns the character-level SCALE of output lines, this one owns what a cost SAYS | `skill_cost.go`, `GameState.cost_factor`, the cost/Focus wording, `roundHP`, the spellbook row CSS |
| `r3-lifesteal-burst.mjs` | the `lifesteal_burst` effect type (Bloodthirst, R3 §5.6): the `/skills` catalog serving the new `lifesteal` payload, the tooltip line, and the buff reaching the DAMAGE path on a real player in a real fight. ⚑ Its leg 2 needs a fight, so it approaches the nearest mob and goes INCONCLUSIVE rather than red if it cannot reach one. ⚑ It equips **Long-Range Strike**, not Damage: the seeded aura's radius is 1.0 and mobs at the venue settle 2.5–3 units out, so a run with Damage measures a player reaching nothing — floating numbers everywhere (other mobs fighting), a flat health bar, and a leg that reads as a broken buff | `Buffs.LifestealFraction()`, `casterLifesteal`, the damage payload's Lifesteal term, `lifesteal_burst` content or its tooltip case |
| `filler-batch.mjs` | `DAMAGE <pct>`, damage numbers in darkness, minimap-on-death, Ctrl +/− | darkness suppression, minimap lifecycle, dev cheats |
| `c1-world-map.mjs` | the map's **two states**: the three entry points (`M`, `#mapButton`, tapping the minimap), Escape, click-away dismissal, the press-ON-the-map no-op reserved for flight, the ONE-canvas property (reparented, never cloned), and that the overlay covers every HUD panel. Terrain + fog are screenshots read by eye, not assertions | `MiniMap` state/toggle, `#worldMap` markup or z-index, `MapScale`, `MapTerrain`, `MapFog` |
| `c2-campfire-markers.mjs` | **campfire markers + discovery persistence**: discovery at the dwell trigger, one marker per discovered id, the bound fire's ring, marker position at both scales, and — the leg that can fail alone — a **cold login** showing them before anything is re-dwelled. Also carries backlog §53 (leg 7) and the **stage-depth** pin (leg 2d). ⚑ Leg 2d exists because markers under the prop layer are invisible while every other leg still passes. ⚑ It reads the pixi scene graph via `window.game.miniMap`; discriminate Graphics from Sprite by `.context`, **never** `.texture` (a Graphics has a truthy one). ⚑ Binds at the **eastern** fire on purpose, and its negative control is `spawnpoint-4` — a fresh character discovers `spawnpoint-1` by spawning in its bind radius | `MapCampfires`, `campfireMarkers()`, the marker layer's stage index, `trackCampfireDwell`'s discovery, `s.discovered`, `character_campfires`, `GameState.discovered_campfires`/`home_campfire`, `reseedMinimap` |
| `c3-flight-client.mjs` | **flight, client side** (plan-flight-paths.md C3), and the only place flight runs outside a Go test: the **`E`-at-the-fire entry** (badge → open → second `E` closes), that an **`M`-opened map arms nothing**, the arm→confirm press, the zoom-out coupled to the server AOI, the ability + input lock with its banner, the ETA indicator, that the flyer **draws above the props** — and that **landing restores every one of them** at the destination fire. Carries the **two-client snapshot-invisibility** leg C2 deferred (the observer's nameplate for the flyer vanishes at takeoff). ⚑ **Leg 0 is scored FIRST, at spawn, and its venue IS the assertion**: it checks the `E` prompt at spawnpoint-1, the only fire with no conversant within talk range. Every other fire in the world has one ~1.1–1.5 units away, and a badge bug that only appeared at *lonely* fires shipped green past this very script for exactly that reason — never move that leg to a convenient fire. ⚑ It reads the flyer's presence **by name** off the namePlates overlay, never by counting plates — mobs share that container and drift in and out constantly. ⚑ Everything it reads goes through `window.game.layers`/`.miniMap`/`.character`; `game.map` and `game.cameraGroup` are NOT on the console façade and read `undefined` in silence. ⚑ **Legs 5 and 5b are the pair, and they point OPPOSITE ways**: at the same instant the flyer must be GONE from the observer's snapshot (D13) and PRESENT on the observer's map (**D16** — the world and the map are different facts, PO 2026-08-05). Scored from one client so that a filter added to `codec.RosterFor` reddens 5b while leaving 5 green. This row used to say the opposite ("does NOT assert the flyer leaves the MAP — the roster filter is C4"); C4 ruled there is no filter. ⚑ Two GL-heavy clients: a lost WebGL context at join (§29) is an environment failure, not a product one — restart and re-run | `Flight.ts`, `FlightOrigin.ts`, `Zoom`'s flight override, the `flyers` render layer, `Camera`'s hard-follow, `HUD.updateFlight`/`rejectWhileFlying`, the Controls gate, `Interact.trigger`, the interact-badge suppression in `Backend`, `StartFlightMessage`, `pickCampfireMarker`, `MapCampfires.markerAt`/`setArmed`/`isDiscoveredAt`, `MiniMap.pressOnMap`/`openForFlight`, `codec.RosterFor`, or anything in C2's server state machine |
| `backlog33-prehot.mjs` | the §33 split: `hot_aura` applies to a FULL-health ally (pre-hotting, PO 2026-07-31) while `heal_aura` still refuses one. 3 clients — healer, unhurt ally, out-of-range control | `applyHotAura` / `applyHealAura` eligibility, `HotParams`, Rejuvenation or Heal content |
| `hygiene-wire-prune.mjs` | the join smoke for wire renumbering — garbage decode rather than a clean error | **any `.fbs` field add or remove** |
| `chunk4-persistence.mjs` | **save & load** end to end: a fresh character starts empty, earns level/XP/skills/loadout, leaves to character-select, and comes back with all of it. ⚑ It must stay a **cold** return — leaving to character-select drops the socket, and if the reconnect stash resumed the live character instead, every assertion would pass while proving nothing. ⚑ Its `active aura slot` leg needs the aura actually switched **on**: an equipped-but-inactive loadout leaves the column at −1, which round-trips trivially | the snapshot/restore mapping (`sys/persist.go`), `store.SaveCharacter`/`LoadCharacterState`, the save triggers, `auth.Ticket.State`, `/select`'s load, the quest-ledger flag encoding |
| `campfire-bind-persistence.mjs` | the **campfire bind surviving a login**: dwell binds, the bind persists, the cold login lands at the bound fire. ⚑ It binds at the **eastern** fire on purpose — binding at a `startingSpawn` fire would pass whether the feature works or not. ⚑ It deliberately does NOT check respawn placement: `window.game.character` is not re-pointed at a respawned entity, so post-respawn position reads return the pre-death position forever; that half is pinned by `sys.TestColdJoin_SpawnsAtThePersistedSpawnPoint`. ⚑ Takes `[label] [url]` | `world.Campfire.ID`, zone campfire content, `trackCampfireDwell`, `s.anchors`, `respawnPosition`/`AnchorOf`, `home_campfire_id` |
| `chunk2-accounts.mjs` | the **pre-game account screens**: cold load → creation → auto-select into the world, the anonymous secret, the nag, register-from-settings, character-select slot cards, Logout gating, logout→login, the delete dialog's countdown — plus the **second-tab** state (leg 4b): a SECOND PAGE IN THE SAME CONTEXT (a second *context* has its own cookie jar and would prove nothing) sees the played character as "In world" with no Play or Delete, is warned, and needs two presses to log out. ⚑ A **new category** — it asserts against the **DOM**, not the PixiJS scene graph, and it is the only script that needs a clean profile *as a rule* rather than by accident. ⚑ It carries **no 401 filter**: since `GET /api/session` a cold load is genuinely clean, so a 401 reaching its console listener is a real defect | the account screens, `AccountsApi`/`AccountFlow`, the nine endpoints, `playingCharacterId`, cookie/CORS behaviour, the `hrnss_` rules |

### ⚑ Run them ONE AT A TIME, alone, on a freshly restarted server

Not a style preference — it has faked a product failure three times (all
2026-07-30, quest C0/C2):

- **Two harnesses at once → 17 wholesale FAILs**, including "E opens the panel".
  They share one world: `chunk3b-interact` summons a companion and fires
  cooldowns beside the NPCs `chunk3b-ii-conversation` is talking to, and
  `sense()` withdraws the talk offer for **every player at once** when an actor
  is in combat (D21). Nothing was wrong with the panel.
- **Anything else touching the server mid-run kills the run.** Booting a second
  `aurad` to probe content competed for port 2000 and broke a harness loop after
  its first script.
- **A long-lived server degrades runs silently.** `chunkP-presence` reported
  3 PASS + a no-kill SKIP (vs its real 6/6) purely from server age; a restart
  fixed it with no code change. This is the same class as the wander-drift
  gotcha below.

### ⚑ Reading HUD slot text: match `.slotLabel`, never the `li`

An aura/cooldown slot's `li.textContent` **glues the hotkey onto the name** —
slot 1 holding Heal reads `"2Heal"`, not `"2 Heal"`. So a perfectly reasonable
`/\bHeal\b/` matches **nothing**: there is no word boundary between `2` and
`H`. The equip has landed, the HUD is correct, and the script reports "equip
did not land" — a pure false negative that survived three debugging rounds
in `backlog33-prehot` (2026-07-31), including two wrong theories (slot
occupancy, then rAF throttling on a backgrounded page). A single-client probe
running the identical clicks passed every time, because the probe dumped the
whole list and read `"1Rejuvenation 2Heal"` with human eyes.

**Match `li[data-slot="N"] .slotLabel`.** It holds the name alone. The same
trap applies to any regex with a leading `\b` against concatenated HUD text.

⚑ **And when a harness leg fails, make it dump the DOM it is asserting on
before theorising.** The dump solved this in one run after two rounds of
plausible, wrong hypotheses cost several server restarts each.

### ⚑ Residual buffs outlive the loadout switch

Swapping the active aura does **not** clear what the previous one applied.
Rejuvenation's HoT lives `hotTicks × hotTickInterval` = 12 s and is topped up
until the instant you switch, so a leg that switches auras and immediately
reads a pip is reading the OLD aura's buff and blaming the new one. Wait out
the buff lifetime plus margin (16 s here) before asserting absence.

So: restart `aurad`, run one script, read its result, then the next.
| `mob-separation.mjs` | soft separation, by screenshot | `steer`, `AppendCircleDynamics`, the separation weight |
| `ctxloss-warning.mjs` | the WebGL context-loss banner; `clean` must report **0** warnings | the client boot path |

**Report-style, not pass/fail** — they print counts and screenshots for a human
to read, and "passing" means 0 console errors and sane numbers:
`npc-portraits`, `mob-separation`, `hygiene-wire-prune`. **Diagnostic tools, not
regressions** (never expect them green): `ctxloss-repro`, `hunt-null-split`.

**Invocation is NOT uniform.** Most take `[label] [url]`, but `round4-tooltip`
and `filler-batch` take the **URL as the first argument** — passing a label makes
them die on `Cannot navigate to invalid URL`, which looks like a product failure
in a sweep. `ctxloss-warning` takes `clean|forced`. `r4-badge`'s `aura` leg needs
a throwaway content edit (documented in its header); its `vanilla` leg runs as-is.

## Writing or repairing a harness

Rules distilled from the 2026-07-29 full-suite sweep, where four scripts were red
for reasons unrelated to any recent change:

1. **Never assert a content COUNT.** `rows.length === 3` encoded how much content
   existed that week and went red the day a fourth teaching was authored. Assert
   the rows that matter **by name**.
2. **Don't let two harnesses assert the same content**, or one content edit
   breaks two. Give each a boundary and say so in its header.
3. **No knife-edge comparisons.** `last >= first` failed by 0.11 units on a
   settling mob and passed on the next run. Use a tolerance and state the
   invariant you actually mean.
4. **Never assert a condition the design forbids.** Two scripts required a pet
   alive and visible during a fight while D9 says it gets focused and killed in
   ~8 s. Assert the *evidence* (XP rose with every aura slot empty), not the
   tableau, and go **tri-state** — INCONCLUSIVE when the thing was unobservable.
   Check evidence BEFORE observability, or a genuine pass (XP 0 → 70) reports as
   inconclusive.
5. **Assert the precondition that makes the subject the subject.** See the
   conversant-cluster gotcha below: a run that measures the wrong actor goes
   green and proves nothing.
6. **Restart the server first.** Mobs wander far from their authored spawns on a
   long-lived one, so a venue picked by reading `world.json` stops describing the
   world. A restart alone fixed three checks with no code change.
7. **Prefer a Go test.** The browser's unique contribution is what only pixels
   and real input can show; most of this suite's flakiness came from browser
   scripts asserting *server* behaviour through a 10 FPS headless window.
8. **A harness whose premise a later chunk reverses is that chunk's problem** —
   rewrite or delete it *with* the change, never leave it red.

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
  run if a prior run's player just died. ⚑ Since chunk 2 they are also
  **globally unique and persistent**, so `tag + process.pid` is no longer safe:
  PIDs recycle, and a name that worked on Monday fails on Friday as a baffling
  "that name is taken" in a script that has nothing to do with names.
  `harnessCharacterName()` handles it.
- ⚑ **`waitForSelector` waits for VISIBLE by default, and `.hidden` is
  `display:none` in this codebase.** Waiting on a hidden element without
  `state: 'attached'` times out for the full timeout **while the product works
  perfectly** — a hang indistinguishable from a product bug. It cost a 60 s
  false failure on the "did the player reach the world" assertion.
- ⚑ **`isVisible('#gameUI')` is the wrong HUD probe** — it is a container of
  absolutely-positioned children with no box of its own, so it reads invisible
  while fully working. Assert the class `HUD.show()` removes instead.
- ⚑ **A page served by Playwright's `route.fulfill()` cannot reach loopback.**
  A fulfilled document has no network peer, so Chrome's Private Network Access
  check treats it as public and blocks every local request — surfacing as a bare
  `TypeError: Failed to fetch`, **indistinguishable from a CORS refusal**. Stand
  up a real `http.createServer` when a script needs a second origin.
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
- **⚑ Measuring a HEALTH delta? A level-up refills the pool.** Killing things is
  usually how a damage-side measurement gets its subject, kills grant XP, and a
  ding raises `maxHealth` and fills it — arriving in the delta as a large
  positive number that has nothing to do with the thing under test. It cost
  `r3-lifesteal-burst` two runs in three (a control window read 40/100 → 112/112
  and scored a +72 "heal"). ⚑ **Capping the level first removes the cause and
  replaces it with a worse one:** at CL30 with GOD the player one-shots
  everything, so nothing survives into the measurement window and every run goes
  inconclusive for lack of a fight. What works is to **guard on `maxHealth`
  holding across the window and re-measure when it moves** — a ding is a one-off
  transition, so the retry is a clean measurement rather than a re-roll of the
  same dice. Read `max` in the same `page.evaluate` as `cur`.
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
- **⚑ HUD loadout state is GameState-driven on the throttled rAF loop — WAIT
  for the UI to show the state, never sleep a fixed interval.** Two concrete
  instances from the chunk-P harness (2026-07-30), both of which read as the
  feature under test failing: `toggleAuraSlot` refuses an activation click
  until `currentAuraSlots` has synced from the server (so equip-click →
  700 ms → activate-click intermittently no-ops — `waitForFunction` on the
  slot's text, then retry the activation until `.auraSlot.activeSlot`
  appears), and the spellbook row for a just-cheated `SKILL <name>` renders
  seconds late (wait for the row, don't findIndex immediately).
  `chunkP-presence.mjs` is the worked example, including multi-client joins.
- **⚑ `Torch` is a PASSIVE; the active light aura is `Lantern`.** Equipping a
  passive into an aura slot silently no-ops (nothing errors, the slot just
  never fills), so a script that cheats `SKILL Torch` and clicks it into an
  aura slot reports "aura never activates" against a perfectly healthy game.
  Check `api/skills/<name>.json` `category` before scripting an equip.
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
  `git stash` + rebuild + re-run is the cheap settlement, and it is worth doing
  before diagnosing anything. The full-harness sweep of 2026-07-29 found three
  scripts red for reasons that had nothing to do with any recent change:
  `chunk3b-interact.mjs` (6/15) had been written for 3b-i where `E` taught
  directly, and 3b-ii moved teaching behind a panel row click without updating
  it; `chunk3b-ii-conversation.mjs` asserted an exact teaching-row COUNT that
  `3b1b3ef6` grew; and `chunk3a-npc-merge.mjs` (0/6) asserted that *approaching*
  an NPC teaches you, which 3b-i reversed (L18). All three are now resolved —
  the first two rewritten, the third **deleted**, because its premise *was* the
  behaviour. ⚑ **Two rules came out of it.** A harness whose premise a later
  chunk reverses should be deleted or rewritten *with* that chunk, not left to
  rot — these stayed red across two chunks and read as a regression to everyone
  who ran them. And **two harnesses should not assert the same content**: the
  verb script now owns who-is-offered and what-the-key-does, while everything
  *inside* the panel belongs to the conversation script, so a content edit
  breaks one file instead of two.
- **⚑ Conversants stand in CLUSTERS, and the server offers the nearest.** In
  town the Farmer (-57, 28.6), Hermit (-54.9, 25.6) and TownCrier (-55.7, 22.0)
  sit within ~3 units, so a script that warps "to the Farmer" gets the Hermit,
  and *walking away until the badge goes out* merely walks into the next one's
  range. Three separate checks failed that way in one run. For badge-lifecycle
  work use an **isolated** conversant — the Emberkeeper (34.5, -19.6) is 30.5
  units from any other, the Wanderer (-15.5, 30.7) is 39.7 but moves. Where a
  cluster is unavoidable, assert that *some* conversant answered rather than
  naming one, or you are pinning a positional accident.
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
