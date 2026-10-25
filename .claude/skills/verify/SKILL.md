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
log's first lines before chasing anything else.

⭐ **DOCKER IS OPTIONAL — the requirement is a reachable PostgreSQL, not a
container** (PO correction 2026-09-12). Two equivalent setups:

```bash
# (a) Docker
make -C backend db-up && set -a && . backend/.env.local && set +a
# (b) Windows / native Postgres — no container, no .env.local needed
./scripts/dev-restart-windows.sh server
```

⛔ **On the Windows dev box `docker` is not on PATH at all, and the game boots
fine.** Never record "could not verify in-game: no Docker on this host" — it has
been written into the status history more than once and it was wrong every time.
Run (b) instead, or say plainly that you chose not to.

⚑ **`backend/.env.local` is ONE source, not the canonical one.** The three
variables may be exported at machine scope instead — which is how the Windows
box is configured, so the file is legitimately ABSENT there while every boot
works. `dev-restart*.sh` source the file when present and let an exported value
win. **Run `env | grep AURA_` before concluding anything is unset**; a shell
opened before the variables were set at User scope will not see them, and
`[Environment]::GetEnvironmentVariable('NAME','User')` reads them back.

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

⚑ **There are TWO binary names on this box, and each has its own trap.**

⚑ **Launching `.\aurad` can run a STALE `aurad.exe`.** Windows applies PATHEXT
to an extensionless target, so `Start-Process .\aurad` (and a bare `aurad` in
PowerShell) resolves to `backend/aurad.exe` when one exists — and one does here,
left from an older build. `make -C backend build` writes the EXTENSIONLESS
`aurad`, so a fresh build and a launch can disagree by weeks while the server
runs code you did not build. Observed 2026-09-05: a boot panicked on `unknown
field "id"` for a field that had been in the source for an hour, which reads as
a broken parser rather than a stale binary. Build to the name you will launch
(`go build -o aurad.exe ./cmd/aurad`), or launch the full path and check the
log's timestamps against your build.

⚑ **`taskkill //F //IM aurad.exe` MATCHES NOTHING** when the built binary is
the extensionless `aurad`, so the old process survives, keeps port 2000, and
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

⚑ **It handles THREE entry states since C3 step 7**, not two: character
creation, a select screen with a character to play, and (new) a select screen
with **no characters at all**. That last one is not exotic: an ASCENSION spends
the last character and lands the client exactly there, so a run that ascends and
then wants an heir used to hit a 30 s timeout waiting for a name that cannot
exist, which reads as a broken character-select rather than a missing branch.

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

- ⚑ **No zone flag is needed any more.** Every `.json` in `api/zones/` loads on
  every boot — the directory IS the zone list — and `game.startZone` (Go default
  `"world"`) only names which one a fresh character spawns in. The old
  `-zone world` workaround is gone with the flag; `-start-zone` overrides the
  conf if you ever need a different primary.
- ⚑ **Run the scripts from Git Bash, not PowerShell.** They resolve playwright
  through `join(process.env.HOME, '.cache/aurahunter-run')`, and `HOME` is set by
  Git Bash but usually *not* by PowerShell — where the join throws before
  anything else happens. Setting `AURA_RUN_DIR` explicitly also works.

### ⚑ New CONTENT under `-content ../api` does not reach the CLIENT

`-content ../api` is a **server-side** shortcut. Several client-side catalogs
are compiled in at webpack BUILD time via `require.context` — `api/props`
(`Props.ts`) and the zone editor's bundle among them — so a prop added after the
last `npm run build` exists for the server and not for the browser. It fails
SILENTLY and plausibly: with plan-prop-placeholders.md's placeholder props
(2026-09-05) every one rendered as a shapeless square, because
`propDefsByName.get(name)` missed and the class took its own "this build has
never seen that definition" fallback — which looks exactly like a broken wire
field, and sent the first debugging pass at the codec. **After adding or renaming anything under
`api/props/`, rebuild the FRONTEND**, not just the server.

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

Harness state at HEAD (moved from CLAUDE.md Status 2026-10-18):

- **Known-inconclusive at HEAD**, unowned: `chunk3-charm` 6-8/9 · `c1-world-map` legs 6-7 · `c2-campfire-markers` · `filler-batch` leg 1 · `chunk3b-ii-conversation` 28/34 · `accounts.TestRepeatedFailuresAreThrottled` under load · `AuraTiledConvert.test.ts` byte-stability ×2 · `world.TestPropContent_C1bMigrationPreservesLookAndCollision` (Tree/Boulder, the PO's prop edits) · `content-editor-skills-tab.mjs` stale since natural-weapons C1, unrun · `content-editor-lang.mjs` stale (looks for the quest "Boars in the Field", gone from `api/`; seen 2026-10-20, use `node tools/content-editor/smoke.mjs`) · `mobile-layout.mjs` leg 7 · `c2-player-cc` stun-end leg 1 in 2 · `npc-portraits.mjs` (venues predate the world rebuild, every plate ABSENT) · `skill-fx-preview.mjs` 2 legs (its `KINDS` list lacks `rush`, `d9a0b2ac`) · `c3-zone-editor-level` leg 3 INCONCLUSIVE (the click selects spawn #479, not #0; seen 2026-10-19). ⚑ The `items/mobs` census tests + `cmd/simharness` placement pins hardcode the roster: ANY new mob/NPC reddens them.
- **Harness venues:** DEBUG-zones only (starved or obstructed venues on the rebuilt main world, never a failed assertion): `skill-fx`, `chunk2-calm`, `chunk3-charm`, `swift-cooldown`'s pace legs, `chunkC4-quests`, `c1-kill-quests`, `c2-kill-quests`, `c1-front-stone`, `c2a-ascension-site`, `buff-tray`, `c2-player-cc`, `c1-stat-buffs`, `c2-thorns`, `c3-charge`, `c4-c7-effects` (two clients; `GOD off`; a bare `GOD` toggles, so scripts send `GOD on`). Other venues UNCHECKED. ⚑ Measure a flake's rate first.

The full row per harness (legs, gotchas, history) lives in `.claude/skills/verify/coverage.md`.
Grep it for the harness name (`grep -n 'skill-fx.mjs' .claude/skills/verify/coverage.md`) before running, repairing, or adding legs to a harness, and record new legs and rows in coverage.md, not here.
Run the harnesses whose "Re-run when" column matches what you changed BEFORE writing a chunk's status banner (the `chunk-wrap` skill requires it).

| harness | owns | venue | re-run when you touch |
|---|---|---|---|
| `chunk3b-interact.mjs` | interact verb: offer, badge lifecycle, E open/close, E to R rebind |  | the offer (`sense`, `interactable_entity_id`), `Interact`, the badge, ... |
| `chunk3b-ii-conversation.mjs` | conversation panel: tree, grants, level walls, teaching tooltip, Back/Leave |  | conversation content or the panel UI |
| `chunkC3-journal.mjs` | quest journal: /quests projection, ledger, J button, abandon |  | quest wire/ledger, the journal panel, the quest catalog, `AbandonQuest` |
| `chunkC4-quests.mjs` | authored quest content: offer/advance/turn-in rows per ledger stage |  | `api/quests/*`, any conversant's `interaction` nodes, the quest grant kinds, ... |
| `c1-kill-quests.mjs` | four zone-1 kill quests, givers, tracker, kill counts |  | `api/quests/*` for the C1 four, ... |
| `c2-kill-quests.mjs` | five zone-2 kill quests, bears-at-the-walls end to end |  | `api/quests/*` for the C2 five, ... |
| `npc-portraits.mjs` | NPC presentation: sprite size, health bars, name-only plate |  | mob wire fields, NPC art, nameplate/health-bar gating, the `conversant` catalog field |
| `c2-mob-level.mjs` | nameplate level and tint from the wire, per instance |  | `Mob.level` on the wire, `codec/mob.go`'s encode, `Mob.Level()`'s precedence, ... |
| `c0-honest-plate.mjs` | nameplate gray boundary equals the server pay boundary |  | `Welcome`'s gray fields, `codec.Welcome`, ... |
| `c2-world-walk.mjs` | placed world matches the placement table across ten rating bands |  | `api/zones/world.json` spawn levels, `scripts/world-place.py`'s table, ... |
| `c3-zone-editor-level.mjs` | zone editor authoring a per-spawn level |  | `ZoneSpawn`, `getZoneAsJSON`/`fromJSON`, the spawn tool panel, `drawSpawnMarker`, ... |
| `c2a-ascension-site.mjs` | ascension site end to end up to the pick |  | `api/mobs/ascension-stone.json`, its `world.json` spawn, ... |
| `c3-memorial-catalog.mjs` | memorial and its two live-world gates |  | `api/mobs/memorial-stone.json` + its `world.json` spawn, `sys/memorial_rows.go`, ... |
| `c1-front-stone.mjs` | second ascension site and its own price |  | `api/mobs/front-ascension-stone.json` + its `world.json` spawn, ... |
| `c1-medallions.mjs` | medallion frame stack on mobs and NPCs |  | `client-data/Medallions.ts` (families, faction map), `Graphics.ts` `medallion` specs, ... |
| `ep1-state-ring.mjs` | the medallion state ring: indicator angles, no pip strip, stealth fade |  | `TokenState.ts`, `StateIndicators.ts`, `PlateAnchors.ts`, `Medallion.setState`, ... |
| `r4-badge.mjs` | badge anchor and its removal with the actor |  | any overlay hung on `Mob.shape`, or `EntityManager` removal |
| `chunk2-roles.mjs` | authored role discriminator; structure always-on aura |  | `mobs.ParseRole`, `applyMode`, structure behaviour |
| `chunk2-follower.mjs` | summon path: spellbook, slot, spawn, follow, engage |  | summoning, follower steering, owner/level plumbing |
| `chunk2-calm.mjs` | calm: aggro drops, mob holds, damage ends it |  | the `calm` payload, the buff store, aggro release |
| `chunk3-charm.mjs` | charm: allegiance flip, charm indicator, follows, reverts |  | `Align`/`RevertFaction`/`EnlistUnder`, `CreditTo`, charm content |
| `c1-aura-drawback.mjs` | while-active self modifier (aura drawback) at the game surface |  | `recomputeDerived`, `SetActiveAura`, `DerivedStats`' factor methods, ... |
| `c2-player-cc.mjs` | crowd control landing on the player (spider) | DEBUG zones | `player.ApplySlow` / `ApplyStun`, `Buffs.ApplyStun` (the DR ladder), ... |
| `swift-cooldown.mjs` | speed_burst and the movement axis (Swift) |  | `Buffs.MovementFactor()`, movement speed, slows, the tray's beneficial box |
| `buff-tray.mjs` | own player's buff tray (desktop half) | DEBUG zones | `BuffTray.ts`, `HUD.updateBuffTray`, `#buffTray` markup + styles, `showEffectTooltip`, ... |
| `c1-stat-buffs.mjs` | stat buffs and debuffs on others (Bulwark and a debuff) | DEBUG zones | `stat_aura` / `instant_stat`, `statPayload`, `Buffs.StatBonus`, ... |
| `c2-thorns.mjs` | thorns on others (retaliate_burst) | DEBUG zones | `retaliate_burst` (`applyRetaliateBurst`, `RetaliateBurstParams.TargetsSelf`), ... |
| `c3-charge.mjs` | charge: dash, stun, rush kind | DEBUG zones | `charge` (`applyCharge`, `chargeTarget`, `probeLanding`, its precondition arm), ... |
| `c4-c7-effects.mjs` | empower, fear, stealth, death triggers | DEBUG zones | `empower` (`applyEmpower`, `spendableEmpower`, `model.Empowerable`), ... |
| `content-editor-skills-tab.mjs` | content editor Skills tab (builder, writers, references) |  | `tools/content-editor/public/app.js`'s skill editor + the Mobs tab's look block, ... |
| `content-editor-lang.mjs` | content editor reads its text from the ARB (read-only) |  | `tools/content-editor/content-lang.mjs`, `public/app.js`'s dialogue rows, ... |
| `chunkP-presence.mjs` | presence-counts XP attribution at the game surface |  | the presence scan (`sys/skills.go notePresence`), `NotePresence`/the participant map, ... |
| `round4-tooltip.mjs` | skill tooltips scaled to level; /skills payload; description block |  | `SkillTooltip.ts`, the skills catalog endpoint, a skill JSON `description`, ... |
| `c2-frost-shield.mjs` | retaliate_slow passive (FrostShield) end to end |  | `RetaliateParams` / `retaliate_slow` in `Skills.ts` + `SkillTooltip.ts`, ... |
| `c3-paralyze.mjs` | stun integration surface (Paralyze) |  | `stunPayload`/`ApplyStun`/`Stunned` in `buffs.go`, the `MovementFactor` guard, ... |
| `r1-focus-cost.mjs` | tooltip cost half: Focus cost lines, cost_factor |  | `skill_cost.go`, `GameState.cost_factor`, the cost/Focus wording, `roundHP`, ... |
| `r3-lifesteal-burst.mjs` | lifesteal_burst effect (Bloodthirst), tooltip and catalog |  | `Buffs.LifestealFraction()`, `casterLifesteal`, the damage payload's Lifesteal term, ... |
| `n1-shield-bar.mjs` | Focus bar telling the truth about shields |  | `shieldBarSegments`, either bar's fills, shield application, `Warbanner` |
| `r7-strong.mjs` | Strong passive made visible (damage_factor) |  | `damage_factor` on `GameState`, `casterDamageFactor`, ... |
| `skill-fx.mjs` | SkillFx engine drawing authored visual layers | DEBUG zones | `frontend/src/features/skill-fx/**`, the `SkillEvent` decode, ... |
| `skill-fx-scale.mjs` | SkillFx cost at world scale (measurement script) |  | the `SkillFx` budget, pools, ambient reconciler or per-frame update, ... |
| `skill-fx-wave-probe.mjs` | wave kind executes (mammoth stomp probe) |  | `WaveFx`, `waveRing`/`waveCountOf`, `drawWaveRing`, ... |
| `skill-fx-preview.mjs` | dev-only live VFX preview page |  | `frontend/src/fx-preview.ts` / `.html`, `SkillFxPreview.ts`, ... |
| `immune-feedback.mjs` | grey "Immune" label over a fully mitigated hit |  | `takeDamage`'s mitigation branches, `SkillEvent` / `HitKind.Immune` on the wire, ... |
| `r7-respec-cost.mjs` | blue floating cost number; respec cost |  | floating combat text, cost pricing, the respec path, the points badge |
| `r4-recall-utility.mjs` | Recall as a baseline utility |  | the utility bar, cast interrupts, the fire's Bind & Restock row, `startingSpawn`, ... |
| `c1-open-portal.mjs` | travel_to grant (open portal) at the game surface |  | `travel_to` parse or apply, the `AnchorSource` seam / `AnchorOf`, ... |
| `c2-pull-through.mjs` | spawn_at_anchor and caster destination mode (pull-through) |  | `spawn_at_anchor` parse/validation or its placement probe, `anchorSpawnOffset`, ... |
| `r4-camp.mjs` | mini-campfire: Camp button, charge store, placed fire |  | the camp charge store, cast completion, camp TTL or replacement, the fire's Restock row, ... |
| `filler-batch.mjs` | DAMAGE cheat, darkness damage numbers, minimap-on-death, Ctrl zoom |  | darkness suppression, minimap lifecycle, dev cheats |
| `c1-world-map.mjs` | world map's two states and entry points |  | `MiniMap` state/toggle, `#worldMap` markup or z-index, `MapScale`, `MapTerrain`, ... |
| `m1-minimap-radar.mjs` | docked radar scale and dot placement |  | `MapScale.mapScale`/`layerOffset`/`groundRing`/`fixedIconScale`, ... |
| `m2-radar-zoom.mjs` | radar zoom steps |  | `RadarZoom.ts`, `MiniMap.wireRadarZoom`/`zoomRadar`, `DevicePrefs.radarDiameterM`, ... |
| `m3-home-pointer.mjs` | radar home-campfire rim pointer |  | `MapScale.rimPoint`, `MiniMap.setupHomePointer`/`updateHomePointer`, ... |
| `jumper.mjs` | JUMPER cheat, WARP spawnpoint-id, HOME |  | `internal-tools/jumper/`, `MiniMap.jumpToPress`, `MapScale.mapToWorld`, ... |
| `wizard.mjs` | SKILL all and the WIZARD cheat |  | `sys/cmd` SKILL/WIZARD, `fireAndCharge`, `SkillComponent.ResetCooldowns` |
| `herd-h1.mjs` | herding at the game surface (sheep, pen) |  | `model/mob/herd.go`, the herd case in `Mob.Update`, `MobSystem.penned`, ... |
| `herd-h2.mjs` | herding quest back-to-the-pen |  | `ObjectiveHerd`, `journal.objective.herd`, `objectiveLine`'s tick rule, ... |
| `passages.mjs` | exits: talk exits (words, looks, bare door), touch exits (glow, name, dwell, curtain), the stones lose their bar |  | `world.Exit`/`ExitArea`, `sys.PassageSystem`, `ExitAreas.ts`, `ExitLooks.ts`, `regions.arb` `exit.*`, `api/zones/*.json` exits |
| `woods-w123.mjs` | Deep Woods W1-W3: layout shots, the new NPCs answer E, all seven new cave-door legs |  | the Deep Woods' `world.json` area, `koboldCave.json`, `wolfDen.json`, Fritz / Gnome 1 / the woodcutters / the Lamplighter |
| `map-props-bake.mjs` | map props baked from bundled zone data |  | `MapProps`, `MapTerrain`'s bake, `GraphicsConfig.miniMap.icons`, ... |
| `region-banner.mjs` | region title banner | DEBUG zones | `RegionNames`, `RegionBanner`, `#regionBanner` styles, `Regions.toRegions`, ... |
| `c4-region-texture.mjs` | region ground textures |  | `profiles.json` `texture`/`scale`, `RegionPaint.ts`, `Regions.regionPaintSpec`, ... |
| `c2-campfire-markers.mjs` | campfire markers and discovery persistence |  | `MapCampfires`, `campfireMarkers()`, the marker layer's stage index, ... |
| `f2-map-fog-persistence.mjs` | map fog reveal survives a session end |  | `pkg/aura/mapfog`, `trackMapFog`/`publishMapFog`, `character_map_fog`, ... |
| `d-map-fog-darkness.mjs` | map reveal respects darkness | DEBUG zones | `mapfog` `dark.go`/`MarkAt`/`TakeDirty`, `trackMapFog`, `world.Place` dark offsets, ... |
| `l1-lightmap.mjs` | darkness layer as a lightmap |  | `DarknessOverlay`'s lightmap (base quad, screen lights, multiply filter), ... |
| `l6-light-ease.mjs` | wire lights ease, never snap |  | `DarknessOverlay`'s easing (`LightEase.ts`), `isHidden`'s radius, `LIGHT_RAMP_MS` |
| `darkness-frametime.mjs` | darkness layer per-frame cost (measurement) |  | `DarknessOverlay`'s filters, base quad, ... |
| `start-screen-tour.mjs` | start screen's live spectator tour backdrop |  | `model/spectator/tour.go`, `NewTouringSpectator`, ... |
| `c3-player-roster.mjs` | other players on your map (two clients) |  | `codec.RosterFor`, the roster publication interval, the map's player layer, ... |
| `c3-flight-client.mjs` | flight, client side (E at the fire, Fly row) |  | `Flight.ts`, the campfire's Fly row / `Interact.ts`, `Zoom`'s flight override, the `flyers` render layer, ... |
| `mobile-layout.mjs` | phone HUD layout and tap playability |  | the mobile HUD CSS, the ☰ sheet, the action-tile row, `MOBILE_MAX_RESOLUTION`, ... |
| `mobile-interact.mjs` | mobile interact button |  | the interact offer on touch, the mobile button, `Interact.trigger`, ... |
| `focus-loss-sweep.mjs` | held keys survive focus loss |  | `KeyboardManager`'s blur sweep, the movement vector, the stop tail, ... |
| `backlog33-prehot.mjs` | hot_aura on full-health allies vs heal_aura |  | `applyHotAura` / `applyHealAura` eligibility, `HotParams`, ... |
| `hygiene-wire-prune.mjs` | join smoke for wire renumbering |  | **any `.fbs` field add or remove** |
| `chunk4-persistence.mjs` | save and load end to end |  | the snapshot/restore mapping (`sys/persist.go`), ... |
| `campfire-bind-persistence.mjs` | campfire bind surviving a login |  | `world.Campfire.ID`, zone campfire content, the fire's Bind & Restock row (`CampfireRow`), `s.anchors`, ... |
| `chunk2-accounts.mjs` | pre-game account screens and endpoints |  | the account screens, `AccountsApi`/`AccountFlow`, the nine endpoints, ... |
| `p3-filled-polygon.mjs` | filled polygon blocks and lets go |  | `PolygonColliders`, `fillAt`'s merge (⛔ especially any cap put back on it), ... |
| `p3-diagonal-slide.mjs` | diagonal wall slide without reversals |  | `appendPolygonBoundary`, `strokeThickness`, `fillAt`'s wholly-inside test, ... |
| `a5-darkness-blend.mjs` | soft border on atmosphere darkness and clearing rim |  | `paintAir`'s `flat` branch, `buildBlendMask`/`addFeathered`, `cutHole`, ... |
| `p1-closed-path.mjs` | closed path is a ring (wraparound segment) |  | `Path.Closed`, `appendPathCorridors`'s segment count / seam joint, `toPaths`, ... |
| `p1-prop-order.mjs` | props stack in spawn order |  | `OrderedLayer`, `Resource.show`, the prop/NPC containers in `Game.ts`, ... |
| `bridge-underfoot.mjs` | props.underfoot container (bridges) |  | `Resource.underfoot` (schema, codec, `prop.FromZone`), `Props.ts`'s `propLayer`, ... |
| `mob-separation.mjs` | soft mob separation by screenshot |  | `steer`, `AppendCircleDynamics`, the separation weight |
| `ctxloss-warning.mjs` | WebGL context-loss banner, clean reports 0 |  | the client boot path |


### ⚑ The FIRST browser run after a server restart usually dies at join

Observed three times on 2026-08-07/08: the very first script run against a
freshly started `aurad` times out in `joinAsNewCharacter` waiting for
`#characterCreation`, and an identical re-run passes clean. A probe confirmed
the panel IS visible and the client IS healthy — so it is a race in the
harness environment, not a product failure. **Re-run once before diagnosing
anything.** Do not lengthen the join timeout to "fix" it; `chunk2-calm` waits
120 s and still lost the first run.

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

### ⚑ Reading the buff tray: `data-skill-name` is the DISPLAY name

A tray circle (`#buffTray .buffCircle`, plan-buff-tray.md C2) stamps
`data-skill-name` with `skillDisplayName()`, which spaces the catalog's camel
case: GiantVenomSpit reads `"Giant Venom Spit"`, SpiderWebAura `"Spider Web
Aura"`. A regex on the file name matches nothing. Match the spaced name, or
`data-skill-id`. The other stamps: `data-caster` (0 = the skill's shared
circle, an entity id, or an area id above 2^32), `data-kinds` (the
`effectKindBits` mask: Slow 2, Dot 64, Hot 128, ...), the `harmful` class, and
the `--gone` custom property (elapsed share in degrees, 0 = just applied).
⚑ Sample `--gone` FASTER than the effect's refresh: a 1 s probe against the
giant spider's 1.33 s bite cycle aliased into a wedge that seemed to run
backwards.

### ⚑ Residual buffs outlive the loadout switch

Swapping the active aura does **not** clear what the previous one applied.
Rejuvenation's HoT lives `hotTicks × hotTickInterval` = 12 s and is topped up
until the instant you switch, so a leg that switches auras and immediately
reads a pip is reading the OLD aura's buff and blaming the new one. Wait out
the buff lifetime plus margin (16 s here) before asserting absence.

So: restart `aurad`, run one script, read its result, then the next.


**Report-style, not pass/fail** — they print counts and screenshots for a human
to read, and "passing" means 0 console errors and sane numbers:
`npc-portraits`, `mob-separation`, `hygiene-wire-prune`, `c5-bars` (a
before/after geometry capture of the overhead/cast bars for behaviour-neutral
bar refactors — run it at both trees and diff the JSON; built for code-health
C5, reused by C6's theme pass), and `c6-theme` (the DOM-side twin: computed
styles of every themed selector (account screens, HUD chrome, panel headers,
buttons, the mobile nag stacking observation) as one JSON block plus eyeball
screenshots; run at both trees, the JSON must byte-match modulo the label.
Takes `[label] [url]`; built for code-health C6, reusable for any restyle
that claims to be behaviour-neutral). **Diagnostic tools, not
regressions** (never expect them green): `ctxloss-repro`, `hunt-null-split`.

**Invocation is NOT uniform, and the split is bigger than it looks.** Most take
`[label] [url]`, but **eleven scripts take the URL as the first argument** and die
on `Cannot navigate to invalid URL` when handed a label — which looks like a
product failure in a sweep, and cost three wasted runs in the C3 sweep
(2026-08-27) before anyone counted: `c1-open-portal`, `c2-pull-through`,
`c3-invulnerability`, `c4-ally-speed`, `mobile-layout`, `r1-focus-cost`,
`r3-lifesteal-burst`, `r7-respec-cost`, `r7-strong`, `round4-tooltip`,
`skill-fx` (plus `filler-batch`). Don't trust this list against a growing suite — a sweep runner
should DERIVE it:

```bash
grep -qE "^const (url|base) = process\.argv\[2\]" "$script" && first="$URL" || first="label"
```

`ctxloss-warning` takes `clean|forced`. `r4-badge`'s `aura` leg needs
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
9. **Measure a walking pace per SNAPSHOT, never per wall-clock sample**
   (aura-drawbacks C2, `c2-player-cc.mjs`). Two ways to read it wrong: speeds
   from 100 ms position samples alias to 0 and 2x, and a start-to-stop pace
   reads 10 to 15 % low, because a headless frame longer than about 500 ms
   outlasts the server's hold on a movement key and the walk stalls server
   side. The fix: record the server position of each snapshot from the head of
   the interpolation buffer and take the MEDIAN non-zero step times 30. That
   read the nominal 1.50 u/s exactly. It is also why C1's "keep the 1280x800
   viewport" worked: a smaller viewport only shortened the frame.
10. **Pin the locale: `browser.newContext({ locale: 'en-US', … })`**
   (plan-localization.md D12). This machine's browser is German and detection
   is on, so an unpinned script runs the game in German and every English
   assertion fails. A leg that tests German pins `de-DE` and stores
   `aura.locale` (`i18n-de.mjs`). Text the script asserts comes from the
   catalogs (`docs/manual-localization.md`).

## Gotchas

- **No Pillow (`PIL`) on this box, and no `pip` to install it** (it broke image checks in three
  sessions, 2026-10-13 to 10-18). Inspect or crop PNGs with `sharp`, a declared frontend dependency:
  `node -e "require('sharp')(f).metadata().then(console.log)"` run from `frontend/`; `.extract()`,
  `.resize()` and `.raw()` cover crops, downscaling and pixel reads.

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
- **⚑ Screenshotting a 900 ms floating text needs a slowed page clock.** A
  headless frame takes ~300 ms to render here (two `requestAnimationFrame`s
  measured 627-675 ms, and a rAF-to-setTimeout shim does NOT help: the cost is
  the render, not the throttle), so by the time `page.screenshot` captures, a
  rise driven by `performance.now()` has ended and the text is destroyed. Four
  empty frames on 2026-09-13 before the fix: inside the same `page.evaluate`
  that spawns the text, replace `performance.now` with a clock running 6×
  slower from that instant (`base + (real() - base) / 6`). Scene-graph reads
  do not need it, only pixels.
- **After `WARP`, wait ~20 s before screenshotting.** The client interpolates
  the camera very slowly across a large jump (backlog §20), so a shot taken
  ~1.5 s after the command renders the *previous* position — silently, with no
  error and a perfectly plausible-looking frame. A darkness measurement run
  (2026-07-22) was contaminated end-to-end by this and produced exactly
  inverted results. If the frame must be trustworthy, allow the settle or
  confirm the position first. ⚑ A cross-map jump measured **~40 s** to settle
  at 1280×900 (zone-editor C2, 2026-08-16): don't sleep a fixed 20 s, poll
  until the character's `shape.getGlobalPosition()` is in-viewport AND stable
  across two samples. To click an arbitrary WORLD point, map it with
  `character.shape.parent.toGlobal({x: u*120, y: u*120})` rather than clicking
  the character's own position.
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
- **⚑ The spellbook is a CLOSABLE, TABBED, PAGED panel since UI pass C3
  (2026-08-27), and it is CLOSED on join.** The rows stay in the DOM at all
  times, so every `page.evaluate` query still works untouched — but a row that
  is shut away, on another tab, or on another page is `display: none` and has
  **no box**, so `boundingBox()` returns null and the next line throws. Anything
  that touches a row for real (`mouse.click`, `hover`, `scrollIntoViewIfNeeded`,
  a geometry read) goes through the shared helper first:

  ```js
  import { showSkillRow, showSkillRowAt } from './lib/spellbook.mjs';
  await showSkillRow(page, skillId);        // or a /RegExp/ against the row text
  await showSkillRowAt(page, rowIndex);     // when you already have the index
  ```

  It presses `B` (a raw window keydown — no long hold), switches to the row's
  own category tab and pages to it. `openSpellbook(page)` alone is enough for
  `#respecButton` and other panel chrome. Twenty-five scripts carry these calls;
  `c3-spellbook.mjs` owns the panel's own behaviour.
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
