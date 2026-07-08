# Plan: Rebrand to "Aura" & Berryhunter cleanup

**Status:** decided 2026-07-08. Scoreboard removal (Phase A.1) pulled forward
and executed immediately; everything else scheduled as **execution-order step 7**
(after the content pass, before accounts & persistence) — see `roadmap.md`
"Execution order".

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
- `pkg/chieftain/` + `cmd/chieftaind/` + `chieftain.fbs` are now **fully
  orphaned** (nothing in the game imports them); they still compile and keep
  their own test suite. Deleted in Phase A.3, not here — keeps this commit
  focused on the game.

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

### A.3 Chieftain service — decision: DELETE

**Decision (2026-07-08): chieftain does NOT grow into the account service.**
Its SQLite/DAO/TLS-socket code is scoreboard-shaped, not account-shaped;
keeping it as a "skeleton" is YAGNI. The account service (execution-order
step 8) starts fresh. Resolves the ⚑ in `roadmap.md` item 3 / `tdd.md` §4.3.

Delete `pkg/chieftain/`, `cmd/chieftaind/`, `api/schema/chieftain.fbs`
(+ `ChieftainApi` generated bindings), chieftain targets in Makefiles /
Docker files. Can happen any time after A.1 (already orphaned); scheduled
with the step-7 sweep.

### A.4 Survival/item scaffolding sweep (research-code-quality.md §4)

- `model.PlayerVitalSigns.Satiety`/`.BodyTemperature` (set once, never read).
- Frontend `VitalSigns.ts` satiety vital, `Character.createStatusEffects`
  `Freezing` effect.
- `Character.ts` item/equipment/crafting scaffolding (`equipItem`/
  `unequipItem`, `PLACEABLE` slots, `craftingIndicator`, hand-swing
  animations keyed to equipped items) — **verify against what the content
  pass still needs for gear-as-passives flavor before deleting.**
- `features/items/` frontend remnants (~308K assets) — same caveat: the
  resource/placeable rendering path still runs through item types today
  (props ride the `Resource` wire table). Only delete what the prop/content
  work has replaced by then.
- Asset orphan-scan afterwards: audio (3.0M), UI SVGs, ground textures —
  delete what nothing references.

## 5. Phase B — structural rename (one atomic commit)

- Go module `github.com/trichner/berryhunter` → new module path.
- `backend/pkg/berryhunter/` → new package dir; `cmd/berryhunterd` → new
  binary name; `tokens.list`/conf naming stays functional.
- FlatBuffers namespace `BerryhunterApi` → `AuraApi` (or similar) in
  `common.fbs`/`server.fbs`/`client.fbs`; regenerate Go + TS; fix all imports
  (51 Go files, `BerryhunterApi.ts` + every frontend importer).
- Makefiles, Docker files, docs (CLAUDE.md, current plan docs) updated in the
  same commit. Historical plan/archive docs keep their old paths (they are
  records).
- **Open naming decisions (decide at execution, not before):** module path
  (`aurahunter` vs `aura`), binary name (`aurad`?), FB namespace.
- Gate: full backend suite + tsc + boot + in-game smoke.

## 6. Phase C — branding

Webpack `title`/`appName`/favicon config, `package.json` name/description/
repository, `index.html`, README. Trivial; rides along with Phase B.

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
