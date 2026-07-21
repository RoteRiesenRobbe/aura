# Plan: Rebrand to "Aura" & Berryhunter cleanup

**Status:** decided 2026-07-08. Scoreboard removal (Phase A.1) pulled forward
and executed immediately; everything else scheduled as **execution-order step 7**
(after the content pass, before accounts & persistence) — see `roadmap.md`
"Execution order".

> **REFRESHED 2026-07-21 (post-content-pass review, pre-execution).** Step 7 is
> now ① in the PO priority queue (CLAUDE.md `## Status`). Audit findings folded
> in throughout (dated notes); triage items **12** (legacy separation) and
> **22** (skill naming) join Phase A as **A.5/A.6**. PO decisions made
> 2026-07-21: legacy separation = **`"legacy": true` tag** (A.5), skill naming
> = **bare thematic names** (A.6); the Phase-B naming set (module path /
> binary / FB namespace) stays **decide-at-execution**. Key audit outcomes:
> A.4's survival remnants are already gone; the items render path is
> load-bearing (props + campfires) — prune, don't delete; `features/audio/`
> is live infrastructure (music + the combat-SFX scaffold), not orphan-scan
> material; legacy mobs live only in proving-grounds and are test/sim-pinned.

## 1. Goal

Full replacement of all Berryhunter naming and assets with "Aura", plus removal
of every Berryhunter remnant we will never need (dead features, dead assets,
dead code). This revises the long-standing CLAUDE.md rule "do not rename or
refactor naming proactively": the rule stays in force for day-to-day work, but
the rename now has a scheduled home instead of being indefinitely deferred.

## 2. What the docs already said (research 2026-07-08)

- `roadmap.md` item 12 (content pass) already schedules the *gameplay-facing*
  rename: legacy mobs (`Dodo`/`SaberToothCat`/`Mammoth`/`AngryMammoth`), their
  sprites, and the `MobType`/`EntityType` enums are replaced there ("rename
  once, here"). **That stays where it is** — this plan does not move it.
- `research-code-quality.md` §4 already flags the dead-code half (satiety /
  temperature fields, `VitalSigns.ts` satiety, `Character.ts` item/crafting
  scaffolding) for removal "in the same sweep" as the item-system removal.
- `roadmap.md` item 3 / `tdd.md` §4.3 carried the open flag "does chieftain
  grow into the account service?" — **decided here: no** (see §4, Phase A.3).

## 3. Footprint (measured 2026-07-08)

226 files reference "berryhunter" (excl. node_modules/dist). Four tiers:

> **Re-measured 2026-07-21:** 246 files excl. docs (273 incl. docs). FB Go
> bindings are down to **30** files (chieftain deletion removed 28); **119**
> Go files carry the `trichner/berryhunter` import path; **16** TS files
> import `BerryhunterApi`; only **8** TS files mention "berryhunter" at all
> (berryhunter.io URLs live in exactly `Urls.ts` + `BasicConfig.ts`).

| Tier | What | Risk |
|---|---|---|
| Branding | webpack title/appName/favicon, berryhunter.io URLs, package.json, README | trivial |
| Dead features & assets | scoreboard + chieftain, rating popup, items feature remnants, satiety/crafting scaffolding, orphaned assets | per-item verification needed |
| Structural rename | Go module `github.com/trichner/berryhunter`, dir `pkg/berryhunter/`, binary `berryhunterd`, FlatBuffers namespace `BerryhunterApi` (3 schemas, 51 generated Go files + `BerryhunterApi.ts`) | mechanical but touches ~every file; one atomic commit |
| Content rename | mob names/enums/sprites | **already scheduled at the content pass — not part of this plan** |

## 4. Phase A — dead-feature removal

One feature per commit, suite green + in-game check after each.

### A.1 Scoreboard — DONE 2026-07-08 (pulled forward)

The periodic in-game scoreboard (top-right player list, sent every 300 ticks)
and the persistent high-scores (chieftain-backed "Top 10" on the start/end
screens). `Obituary` (death flow) is untouched.

Backend:
- Deleted `sys/scoreboard.go` (`ScoreboardSystem` — the only consumer of
  `pkg/chieftain/client` inside the game), `codec/scoreboard.go`,
  `model/scoreboard.go`; deregistered in `core/game.go` (construction +
  `addSpectator` + `addPlayer` type-switch cases).
- Deleted the game-side chieftain wiring: `cmd/berryhunterd/chieftain.go`
  (embedded chieftain boot), the `-chieftain` flag + `chieftainHandler`
  plumbing + `dbUrl` print in `berryhunterd.go`, `cfg.Config.Chieftain`
  (conf.go), `cfg.ChieftainConfig` + mapping (gamecfg.go, gameconf.go),
  `chieftain` blocks in all `conf*.json`.
- `pkg/chieftain/` + `cmd/chieftaind/` + `chieftain.fbs` were left **fully
  orphaned** (nothing in the game imports them) to keep this commit focused
  on the game. Since deleted — A.3 was pulled forward too (2026-07-09).

Wire (`server.fbs`): removed tables `ScoreboardPlayer` + `Scoreboard` and the
`Scoreboard` member of `ServerMessageBody` (shifts `Pong`'s union ordinal —
fine, client + server bindings regenerate together and always ship together).
Regenerated Go + TS FlatBuffers.

Frontend:
- Deleted `features/scoreboard/` (in-game `Scoreboard.ts` + `HighScores.ts` +
  assets) and `messages/incoming/ScoreboardMessage.ts`.
- Unwired: `index.ts` (HighScores import), `Backend.ts` (Scoreboard case),
  `Game.ts` (`Scoreboard.setup()`), `HUD.ts` (`getScoreboard()`), `HUD.html`
  `#scoreboard` div + `HUD.less` block, start-screen "Top 10" link, the
  `dbUrl` query param (`Urls.ts` `database` + `BasicConfig.DATABASE_URL`) —
  high-scores was its only consumer.

### A.2 Rating popup

`features/rating/` (berryhunter.io star-rating + feedback POST + social-media
end-screen popup). Pure frontend delete; check `SocialMedia` module for other
consumers before removing it too (it currently has at least the rating popup
and possibly start-screen usages).

**Update 2026-07-13 (atmosphere & recovery chunk 4):** the end-screen rework
(death overlay) removed the module's last consumer (`new Rating(...)` in
`EndScreen.ts`), so `features/rating/` is now fully ORPHANED but still
webpack-bundled — dead code shipping to every client until this phase deletes
it. Grep hits on `Rating` no longer indicate a live widget.

**Update 2026-07-21 (refresh audit):** zero imports of `features/rating/`
remain anywhere in `src/` — pure directory delete (40K). `SocialMedia`
**stays**: `StartScreen.ts` is a live consumer.

**PO ruling 2026-07-21 — A.2 CANCELLED, rating KEPT.** This is still a
Kringel Games project: the rating/feedback widget and the start-screen
social links remain accurate and stay. The feature is currently orphaned
(no consumer since the 2026-07-13 end-screen rework) — **re-wiring it into
a surface is a separate PO call**, not part of this plan. Do not delete;
the rename sweep (Phase B/C) treats its berryhunter.io POST endpoint like
every other URL.

### A.3 Chieftain service — DONE (2026-07-09, pulled forward)

**Decision (2026-07-08): chieftain does NOT grow into the account service.**
Its SQLite/DAO/TLS-socket code is scoreboard-shaped, not account-shaped;
keeping it as a "skeleton" is YAGNI. The account service (execution-order
step 8) starts fresh. Resolves the ⚑ in `roadmap.md` item 3 / `tdd.md` §4.3.

**Executed 2026-07-09** (pulled forward from the step-7 sweep like A.1;
safe because the code was already fully orphaned). Deleted `pkg/chieftain/`,
`cmd/chieftaind/`, `api/schema/chieftain.fbs` + `pkg/api/ChieftainApi/`
generated bindings (28 files); un-wired the `ChieftainApi` glob in
`flatcgen.go`, `chieftaind` in the root Makefile `TARGET`/`.PHONY`, the dead
commented chieftain block in `update.sh`, and the vestigial `"chieftain": {}`
stubs in `conf.default.json`/`devops/conf.json`. `go mod tidy` dropped
`go-sqlite3`/`sqlx`/`x/sync`/`alecthomas/assert` + the ChieftainApi module dep.
**Gotcha caught in verification:** tidy also evicted `dmarkham/enumer` (it was
only anchored via the chieftain dep chain), breaking
`go:generate go run github.com/dmarkham/enumer` in `model/layers.go` — fixed
with a canonical build-tagged `backend/tools.go` anchor (pinned v1.5.10).
Verified: `go build ./...`, `go generate ./...`, full `go test ./...` green;
`server.fbs` untouched, zero wire/frontend impact.

### A.4 Survival/item scaffolding sweep (research-code-quality.md §4)

> **✅ EXECUTED 2026-07-21, committed `93fba97e`.** **Backend:** the dead `drops[]`
> chain removed end-to-end (`items/mobs/definitions.go` JSON field + `Drops`
> type + resolve loop; `RegistryFromFS`/`mapToMobDefinition`/`loadMobs` lose
> the now-unused `items.Registry` param — **the mobs package no longer
> depends on the items package at all**; simharness stops loading the item
> registry). **Frontend:** the equip/craft machinery was provably fed
> nothing (`GameStateMessage` stamps `equipment: undefined`; `actionKeys`
> bound to zero keys; no wire driver for `action()`), so the whole
> reachability island went: `Character.ts` equip slots/hands/swing-anim
> (~200 lines), `EntityManager` equipment sync, `Controls` action/
> inventoryAction/isCraftInProgress machinery, `Player.isCraftInProgress`,
> `ControlsActionEvent` + `CharacterEquippedItemEvent` + `InputAction`,
> `_Develop` equipment replacer + dead subscription; orphaned modules
> `AnimateAction.ts` + `animations/logic/Animation.ts` deleted; config
> crumbs pruned (`actionAnimation`, `equippedPlaceableOpacity`,
> `CRAFTING_RANGE`, `PLACEMENT_RANGE`, `INVENTORY_SLOTS`). **Asset
> orphan-scan:** deleted `dummy.svg`, `mobs/circle.svg`, `mobs/demon.svg`
> (angryMammoth got real art in the unique-art pass), `mobs/saberToothCat.svg`
> (renders `lion.svg`), `social-media icons/twitter.png` (html uses the svg).
> `logo.svg` initially flagged orphan but is the **favicon source in
> webpack.common.js** (config files sit outside src — scan caveat); kept,
> replaced at Phase C. Items render path + `features/audio/` untouched per
> plan. **Verified:** full backend suite + `-race` on touched packages
> green, `tsc` clean, webpack prod build compiles, boot counts unchanged
> (`78 skills/13 factions/47 mobs/10 recipes/856 props/349 spawns/5
> campfires/14 npcs, 0 panics`), headless in-game smoke ×4: join, character
> renders, movement, HUD alive. One flaky `null.split` pageerror in run 1 =
> the documented pre-existing item-21 intermittent (same signature, 0/4
> later runs), not a regression.

**Rescoped 2026-07-21 (refresh audit)** — original list, with findings:

- ~~`model.PlayerVitalSigns.Satiety`/`.BodyTemperature`~~ — **already gone**
  (zero backend grep hits); swept during later work.
- ~~Frontend `VitalSigns.ts` satiety vital, `Freezing` effect~~ — **already
  gone**; `features/vital-signs/` survives as the resource bar (**keep**).
- `Character.ts` item/equipment/crafting scaffolding — **still present**
  (`equipItem`/`unequipItem`/`craftingIndicator` in `Character.ts` +
  `EntityManager.ts`). Content pass is done, so the caveat is answerable now:
  gear-as-passives took no dependency on it — **deletable**.
- `features/items/` (332K) + `client-data/Items.ts` — **NOT wholesale
  deletable**: the prop/placeable render path still rides the items pipeline
  (props on the `Resource` wire table, **campfires are live placeables**).
  Backend `api/items/` is already down to 10 files (none + 2 campfires +
  7 resources), most live as decorative props. Scope = prune unreferenced
  item defs/assets + the dead `drops[].item` code path (zero users, triage
  item 12 audit); keep the render path.
- Asset orphan-scan afterwards: UI SVGs, ground textures — delete what
  nothing references. ~~audio (3.0M)~~ — **`features/audio/` (now 7.2M) is
  LIVE**: music plays today and its `SpatialAudio`/trigger-throttle scaffold
  is the base for the queued combat-SFX chunk. Do not touch here (its
  decode-at-boot memory debt is backlog §19, separate).

### A.5 Legacy-content separation (triage item 12 — DECIDED 2026-07-21)

> **✅ EXECUTED 2026-07-21, committed `d1acf28d`.** **Set correction —
> the item-12 audit list was stale** (re-traced at execution): Sessions ⑤–⑦
> made **all 5 audit-listed player skills world-reachable** (SlowAura →
> BanditRanged drop, ToughPassive → Troll drop, WildAura → DireWolf drop,
> ReaperAura → EliteWolf drop, Revive → world-NPC teaching), and HealerAura
> is live via MedicCompanion (FieldMedics = CallForAid + HealAura). Actually
> tagged: **10 mobs** (unchanged list), **0 player skills**, **5 mob skills**
> (MammothAura/AngryMammothAura/AngryMammothStomp/SaberToothCatAura/
> DodoAura), **3 factions** (predator/prey/tusker), plus
> **`proving-grounds.json` itself tagged `legacy: true`** as the legacy zone
> (suppresses its expected-shape warnings) — 19 JSON files. **Code (TDD per
> registry):** `legacy` field on skills (tolerant), mobs (tolerant), factions
> (strict decoder — field declared in `factionDoc`); `Zone.Legacy` +
> `resolve()` aggregates distinct legacy references (spawn mobs, NPC teaching
> skills) into `Zone.LegacyRefs`; **beyond the plan's letter:** the mob
> mapper collects the same leak on live mobs (`MobDefinition.LegacyRefs` —
> legacy skill/unlock/faction refs), since zones never reference factions or
> mob skills directly and those tags would otherwise have zero enforcement
> (this exact check is what would have caught a mis-tagged HealerAura). Both
> warn once, aggregated, via `slog.Warn` in `loaders.go`. **Real-content pin**
> `TestDiskContent_LegacyTagging` (loaders_test.go): exact tagged sets, zero
> leaks on every live mob, world zone legacy-free, proving-grounds tagged —
> guards against the zone editor's known field-dropping habit. Registry pins
> unchanged (78 skills / 47 mobs / 13 factions). **Verified:** full suite
> `-count=1` green (29 pkgs) + `-race` on the 5 touched packages;
> `make -C backend build` (cp-defs); boot world zone **0 warnings**, counts
> unchanged (`78 skills/13 factions/47 mobs/10 recipes/856 props/349
> spawns/5 campfires/14 npcs, 0 panics`); boot proving-grounds 0 warnings;
> negative test (zone tag temporarily removed) fired the aggregated WARN
> listing all 7 legacy spawn mobs, then restored. No client surface (no TS,
> no wire) — no browser smoke needed.

Proving-grounds-only content — 10 mobs (Mammoth/AngryMammoth/SaberToothCat/
Dodo/Rabbit/Healer/Brazier/Proving*), 5 player skills, 6 mob skills,
3 factions (predator/prey/tusker) — is **not deletable**: `sim/world.go`,
`cmd/simharness` (incl. `guardrail_test.go`), encounter/codec/faction tests
pin it by name, and Mammoth is the XP-derivation precedent mob. Berryhunter
`api/items/` stays per A.4 (render-path dependency).

**PO decision: option (b) — `"legacy": true` tag on defs.** Add the field to
each registry schema (loaders vary in strictness — TDD per registry), tag the
proving-grounds-only defs, and add a loader warning if the world zone
references legacy-tagged content. Registry pins moved since the item-12 audit:
**skills 78 / mobs 47** (`skills/registry_test.go` etc.) — tags themselves
change no counts. **⚠️ orphan skills (Fade/FireWard/NovaBurst/…) are NOT
legacy** — they're unplaced placement candidates; don't tag them.

### A.6 Skill-name consistency (triage item 22 — DECIDED 2026-07-21)

> **✅ EXECUTED 2026-07-21 — PO-VERIFIED IN-GAME, committed `24806352`.**
> **11 renames** (one more than the ~6–8 estimate — the full suffix set):
> `Aura` dropped from DamageAura→**Damage**, HealAura→**Heal**,
> WildAura→Wild, SlowAura→Slow, ImmolationAura→Immolation,
> ReaperAura→Reaper, PaladinAura→Paladin, BerserkerAura→Berserker;
> `Passive` dropped from SwiftPassive→Swift, ToughPassive→Tough; collision
> resolved cooldown-side per the decision: id 21 Heal→**FirstAid**
> (milestone L3 follows in `milestone-unlocks.json`). **PO naming picks at
> execution (choice prompt):** Damage (strict bare, over Smite/Wrath) +
> FirstAid (over Mend/Cure/Bandage). **Mechanics:** ordered replace
> (`"Heal"`→`"FirstAid"` first, then `\bHealAura\b`→`Heal` etc.) —
> word-boundary sed leaves `EffectType*`/`apply*` Go identifiers and the
> lowercase `*_aura` effect-type strings untouched while catching quoted
> literals, composite roster keys (`"DamageAura L1"`), and comments. 12 JSON
> files git-mv'd to bare kebab names (`damage.json`, `first-aid.json`,
> `paladin.json` recipe, …) — safe because the zone editor and loaders glob
> directories (`require.context`), nothing imports by filename. `Skills.ts`
> display names synced (incl. `Light Aura`→`Light` for id 6, 21→`First
> Aid`); stale filename comments (`heal-cooldown.json` etc.) and
> `registry_test.go`/`recipe_test.go` fixture keys updated. As predicted:
> **no wire, no frontend id maps, no sim presets** (roster names derive from
> the registry); mob-skill namespace pre-checked collision-free. **Verified:**
> full suite `-count=1` green + `-race` on the 6 touched package trees
> (skills/world/sys/model-player/codec/simharness); `make -C backend build`
> (cp-defs); `tsc --noEmit` + webpack prod build clean; boot world **0
> warnings**, counts unchanged (`78 skills/13 factions/47 mobs/10
> recipes/856 props/349 spawns/5 campfires/14 npcs, 0 panics`); boot
> `-zone proving-grounds` 0 warnings (its renamed Heal/Reaper teachings
> resolve); milestone boot log shows FirstAid@L3/Haste@L7; PO checked the
> spellbook names in-game.

**PO decision: option (a) — bare thematic names**, category lives in the
`category` field: ~6–8 renames (SwiftPassive→Swift, ToughPassive→Tough, drop
arbitrary `Aura` suffixes, …) + resolve the **Heal vs HealAura collision by
renaming the cooldown**. Blast radius (verified in the item-22 audit): JSON
`name` is the registry key → touches skill files, mob `unlocks[]`/`skills[]`,
zone `teachings[]`, recipes, `milestone-unlocks.json`, the hardcoded
`"Harvest"` literal (`player.go:734`), and name-pinned Go tests — but **not**
the wire (numeric ids), frontend maps (numeric ids), sim presets, or save
data (none exists — doing this before persistence (queue item ③) is the
cheapest it will ever be). Sync `Skills.ts` display names in the same pass.

## 5. Phase B — structural rename (one atomic commit)

- Go module `github.com/trichner/berryhunter` → new module path (119 files
  carry the import path, count 2026-07-21).
- `backend/pkg/berryhunter/` → new package dir; `cmd/berryhunterd` → new
  binary name; `tokens.list`/conf naming stays functional.
- FlatBuffers namespace `BerryhunterApi` → `AuraApi` (or similar) in
  `common.fbs`/`server.fbs`/`client.fbs`; regenerate Go + TS; fix all imports
  (30 generated Go files + 16 importing TS files, counts 2026-07-21).
- Makefiles, Docker files, docs (CLAUDE.md, current plan docs) updated in the
  same commit. Historical plan/archive docs keep their old paths (they are
  records).
- **Additional touchpoints (audit 2026-07-21):** the `cp-defs` embedded copy
  under `backend/pkg/api/` (path baked into the Makefile + CLAUDE.md
  gotchas), `devops/` (`berryhunterd.service`, `conf.json`, README), stale
  root-Makefile targets `berryhunter-web`/`berryhunter-edge` (verify dead →
  delete), and the memory files under `.claude/`/user memory that name
  `pkg/berryhunter` paths (update the live ones).
- **Open naming decisions — CONFIRMED 2026-07-21: decide at execution, not
  before:** module path (`aurahunter` vs `aura`), binary name (`aurad`?), FB
  namespace (`AuraApi`).
- Gate: full backend suite + tsc + boot + in-game smoke.

## 6. Phase C — branding

Webpack `title`/`appName`/favicon config, `package.json` name/description/
repository, `index.html`, README. Trivial; rides along with Phase B.

**Added 2026-07-21 (PO check: "is the title screen part of the rebrand?" —
it wasn't; now it is):**
- **Title screen:** the hard-coded `<h1>BerryHunter.io</h1>` in
  `startScreen.html` (the actual in-game title, independent of the webpack
  tab title) + the commented-out wiki link below it.
- **Mascot/splash art:** `hunter.png` (header mascot) + `loadingScreen.jpg`
  — whether these get new art is a **PO art call**, not blocking; the
  rename only retitles text.
- **Stays as-is:** Kringel Games identity — the social links and the rating
  widget's branding are still accurate (PO ruling above).

## 6.5 Execution sequencing (added at the 2026-07-21 refresh)

One commit per phase item, suite green + in-game check after each (house
rule); estimated 1–2 execution sessions:

1. ~~**A.2** rating delete~~ — **CANCELLED 2026-07-21** (PO: rating + social
   links stay, Kringel Games project — see §4 A.2).
2. **A.4** scaffolding prune (Character/EntityManager equip-crafting code,
   dead `drops[].item` path, asset orphan-scan — items render path stays).
3. **A.5** `"legacy": true` tag — **✅ 2026-07-21** (schema field per
   registry + zone/mob leak warnings + 19 files tagged; corrected set — see
   the §4 A.5 banner: 0 player skills / 5 mob skills, audit list was stale).
4. **A.6** bare-name skill renames — **✅ 2026-07-21 `24806352`** (11
   renames incl. Heal→FirstAid collision fix + `Skills.ts` sync; PO picks
   Damage + FirstAid — see the §4 A.6 banner).
5. **B + C** structural rename + branding (incl. the title-screen `<h1>` —
   §6), one atomic commit, naming set decided at its start (choice prompt:
   module path / binary / namespace). **← NEXT (Phase A complete).**

## 7. Timing rationale (why step 7)

- The content pass (step 6) already replaces every legacy mob/sprite/enum —
  running the sweep right after means content rename and structural rename
  each happen exactly once.
- Accounts (step 8) needed the chieftain decision — made here (A.3), account
  service starts fresh.
- Ops/go-live prep (step 9) builds deploy tooling around binary and service
  names — **hard deadline: everything renamed before step 9 begins.**
- Doing the structural rename earlier buys nothing (it is mechanical, so
  accumulating more berryhunter-named code doesn't raise its cost) but would
  invalidate every file path in the active plan docs while they're worked
  from.
- Exception already exercised: the scoreboard removal (A.1) was independent
  of everything upcoming and was pulled forward to 2026-07-08.
