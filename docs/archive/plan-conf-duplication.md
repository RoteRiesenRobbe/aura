# Plan: §35 — one value, many homes (the conf-duplication sweep)

**Status: COMPLETE — C1 + C2 ✅ 2026-07-29 `e7531444` · C3 + C4 ✅ 2026-07-30 `e7e14c71` (ledgers §7). Archived 2026-07-30.**
Origin: `docs/backlog.md` §35 (PO 2026-07-26: *"doesn't seem good that we need to
adjust it at 4 places"*). Tier 1 of that survey shipped with
`docs/archive/plan-pre-accounts-hygiene.md`; this plan is tiers 2–5. The §35
entry stays the findings record; this doc is the execution plan and will carry
the per-chunk ledgers in §7.

## 1. What this is, in one paragraph

Every tuning value should have exactly one authored home, and every remaining
mirror should be either mechanically generated, served over the wire, or pinned
by a test that goes red when the copies disagree. The survey found ~20 conf keys
restated across five files (exactly one of which carries a real per-environment
difference), a handful of Go constants restating conf values by discipline, and
five frontend tables hand-syncing Go enums — one of which (the activation
rejection map) can silently show wrong UI text on any renumber, with no test in
either language watching it.

## 2. The state at HEAD (re-verified 2026-07-29, post-hygiene)

- The two `conf.default.json` copies (repo + embedded) are **in sync** and
  pinned by `cmd/aurad/conf_default_test.go` (maps-not-structs; `server` block
  deliberately excluded — L6).
- The three environment files restate 12–17 identical keys each. Genuine deltas
  in the whole fleet: `server.port` (docker `80`), `server.path` vs
  `server.frontendDir`, `server.tlsHost` (devops), and `conf.local-windows.json`'s
  `_walkingSpeedPerTick` stash. `devops/conf.json` (the live server's; copied
  verbatim by `devops/deploy.sh:31`) still has **no `mob`/`combat` block**.
  ⚑ **C1 correction:** `server.path` was never a genuine delta — `cfg.Server`
  has no such field and `/game` is hardcoded in both boot paths; the key was
  dead in all four files that carried it (removed in C1, see §7).
- ⚑ **NEW FINDING — the defaulting layer is not total.**
  `player.healthGainTick` and `player.walkingSpeedPerTick` are copied raw
  (`core/gameconf.go:18-19`) with **no fallback anywhere**: a conf omitting the
  player block yields players with zero regen and zero movement. Every other
  key has a defined absent-behavior (`cfg.ReadConfig` defaults the day cycle,
  curve and crit; `gameconf.go` defaults baseHealth/XP/margin; the mob and
  combat blocks normalize in their accessors). `conf.docker.json` already
  *relies* on the absent-key path for mob/combat.
- Tier 3 all live: `sim.DefaultRegenTick = 0.00033` (`sim/scenario.go:214`),
  sim/world.go's hardcoded `300`/`1.2`/`0.2` (`world.go:74-91`), the **two
  independent `0.2` chase margins** (`gameconf.go:48` ↔
  `mob.go:92 defaultChaseIntoAuraMargin`), and the **two unexported
  `combatRegenGraceTicks = 100`** (`player.go:220` ↔ `mob.go:1187`, the
  deliberate §31 vocabulary mirror).
- Tier 5 all live, plus one the survey missed: `ActivationRejectionMessages`
  (`Skills.ts:281`, bare-number keys, no test), `EffectPips.ts` /
  `AuraRings.ts` bit tables, `spacedName()` (`SkillTooltip.ts:150`), and
  **`Mobs.ts:48`'s `TierRank` mirror** (new, same shape).

## 3. PO decisions (all ruled 2026-07-29, via choice prompts)

- **D1 — Tier 2: SHRINK TO DELTAS.** Make Go defaulting total, then shrink
  `conf.local-windows.json`, `conf.docker.json` and `devops/conf.json` to their
  genuine deltas; absent keys resolve to the Go defaults (the already-live
  pattern). No overlay loader. `backend/conf.default.json` **and** the embedded
  copy stay full — they are the documented reference / the fresh-boot file —
  pinned by the extended drift test (§C1.3). This retires the
  live-server-drifts-silently failure class instead of patching its instances.
- **D2 — Unknown keys: WARN AT BOOT.** `cfg.ReadConfig` logs each unknown key,
  exempting `_`-prefixed keys (the `_comment`/`_stash` convention — L2). Not
  `DisallowUnknownFields`: a hard fail on any deployed/local conf blocks the
  next boot, and the warning gives the same signal with zero deploy risk. This
  is what would have caught the embedded copy's 7 dead keys years earlier.
- **D3 — Tier 5: PER-ITEM SERVE/GENERATE.** `spacedName()` → use the
  already-served `/mobs` `displayName` (delete the rule copy — the
  level-curve precedent: the catalog is the source of truth where one exists).
  `ActivationRejection` → a real FlatBuffers enum, generated into both binding
  sets, client map keyed by the generated names. The genuinely-per-frame render
  tables (pip bits, ring category bits, tier ranks) + tier 4's
  viewport/tickrate → one shared JSON fixture asserted by **both** a Go test
  and a vitest test, so drift goes red on whichever side moved.

## 4. Landmines

- **L1 — the shrink is unsafe until defaulting is total.** Today, omitting the
  player block produces a 0-regen 0-speed player with no error. C1.1 closes
  this *before* any file shrinks; the ordering inside C1 is load-bearing.
- **L2 — `_`-prefixed keys are "unknown" to the struct.** Three conf files use
  `_comment`, one uses `_walkingSpeedPerTick`. The D2 warning (and any future
  hard-fail) must exempt the `_` prefix or it cries wolf on the house
  convention.
- **L3 — the embedded default must stay FULL.** `setupDefaultConfig` writes it
  out as the fresh machine's / fresh deploy's `conf.json`; it is documentation
  that boots. Only the three *environment* files shrink.
- **L4 — `devops/conf.json` is production's file.** `deploy.sh:31` copies it
  verbatim. The shrink is behavior-neutral only because absent = Go default =
  the currently-authored values — C1's acceptance must *prove* resolved
  equality (ReadConfig old vs new through the full normalization), not argue it.
- **L5 — `0` means default, not disabled** (PO ruling 2026-07-29, §25 B). The
  shrink leans on this: deleting a key and authoring `0`/absent are the same
  resolved config. Don't add a "real zero" mechanism here; if a knob ever needs
  switching off it gets an explicit flag.
- **L6 — the `server` block stays out of every drift comparison** (L-H4):
  `frontendDir` vs `path` is the one real per-environment difference, and
  pinning it invites "fixing" it.
- **L7 — do not touch the mob-speed pair.** `0.055` vs `0.05` is owned by
  `plan-entity-model.md` L1; both values are correct and deliberately unequal.
  This plan pins them where they are, it does not converge them.
- **L8 — the rejection enum's numeric values are wire-load-bearing.** Moving
  `model.ActivationRejection` to FlatBuffers must pin the existing ordinals
  explicitly (§28 discipline: pinned values, removals leave gaps). The whole
  point of C4b is that a renumber currently shows the *wrong message silently*.
- **L9 — sim byte-identity is blind to loader changes.** `sim/world.go` builds
  configs inline and never calls `ReadConfig`, so C1/C2 need boot-path
  verification (`-content ../api`, pinned counts, resolved-tuning log) *in
  addition to* the battery. Standing habit from the entity-model sessions.
- **L10 — the gitignored local `conf.json` will start warning.** Each dev's
  local file may carry stale keys; D2's warning flagging them is the desired
  behavior, but expect one round of "why is my boot log noisy" — the fix is
  deleting the stale keys, and the warning text should say so.
- **L11 — the two `combatRegenGraceTicks` are unexported in different
  packages.** They cannot assert against each other without exporting one or
  dragging config into model packages (the §35 warning). C3 pins each with an
  in-package test naming its twin — drift = one red test, no new coupling.

## 5. Chunks

### C1 — total defaulting + shrink-to-deltas (backend + devops; behavior-identical)

1. Default `player.healthGainTick` (0.00033) and `player.walkingSpeedPerTick`
   (0.05) in `core/gameconf.go` beside the existing `BaseHealth` normalization
   (same `<= 0` idiom). Test-first: a config with an empty player block
   currently produces 0/0 — pin the fix.
2. Audit every remaining `cfg.Config` field for defined absent-behavior; close
   any further gap found (expected: none, but the audit is the deliverable).
3. **Extend the drift test with resolved-equality:** run `{"game":{}}` and
   `conf.default.json` both through `ReadConfig` + `core.Config` and assert the
   resulting `GameConfig`s are equal. That makes "conf.default.json is a pure
   restatement of the Go defaults" a red-test invariant — mechanism 2 at the
   resolved layer, covering tier 2 and most of tier 3's drift risk at once.
4. Shrink `conf.local-windows.json`, `conf.docker.json`, `devops/conf.json` to
   genuine deltas (keep `_walkingSpeedPerTick`; keep a one-line `_comment`
   pointing at `conf.default.json` as the reference).
5. Acceptance: resolved-equality proof for each shrunk file (old vs new through
   full normalization); boot each variant → identical resolved-tuning log; sim
   battery byte-identical (expected trivially — L9 — but it stays the habit);
   `go build`/`vet`/`test ./...` clean.

### C2 — unknown-key boot warning (backend only, small)

Decode the raw JSON to a map beside the struct, walk it against `cfg.Config`'s
json tags recursively, log one line per unknown key (path-qualified,
`_`-exempt, message names the fix: "not a config key — delete it or prefix
with _"). Test-first: the embedded copy's historical 7 dead keys are the
regression fixture. Boot noise check against all five tracked files (expect 0
warnings after C1's shrink).

### C3 — tier-3 pins (tests only, no production code)

- `sim` package: pin `DefaultRegenTick`, `LevelUpXPBase: 300`,
  `LevelUpXPGrowthFactor: 1.2` and the sim's `0.2` margin against
  `conf.default.json` read from the repo-relative path (precedent:
  `conf_default_test.go` reads `../../conf.default.json`).
- `model/mob`: pin `defaultChaseIntoAuraMargin` similarly (its twin in
  `gameconf.go` is covered by C1.3's resolved-equality test).
- `model/player` + `model/mob`: pin each `combatRegenGraceTicks = 100` with a
  test naming its twin (L11). Not collapsed — the §31 vocabulary mirror is
  deliberate; the pin makes it drift-proof instead of discipline-proof.

### C4 — tier 5 + tier 4, per item (wire + frontend)

- **a. `spacedName()` → served `displayName`.** SkillTooltip resolves
  `spawn.mobName` through the `/mobs` catalog's `displayName`; delete the rule
  copy. Extend the existing SkillTooltip vitest (degrade path: catalog fetch
  rejected → fall back to the raw name, matching the stubbed-fetch design).
- **b. `ActivationRejection` → FlatBuffers enum** (values pinned at current
  ordinals — L8), regenerate both binding sets, key the client map by generated
  names. New vitest asserting every enum member has a message.
- **c. Shared fixture `api/shared-constants.json`** for `AppliedEffectBit`,
  aura category bits, `TierRank`, `VIEWPORT` 20/12 and tickrate 30. One Go test
  and one vitest both assert their side's table against it. Colors/styles stay
  client-only — the fixture pins the *contract* (names ↔ bit values), not
  presentation.
- Acceptance: `tsc --noEmit`, full vitest, prod build; regenerating bindings is
  a zero diff apart from the new enum; boot + one manual rejection-message
  check in-game (author a rejection via the dev console).

## 6. Non-goals / scope

- Content JSON ↔ Go (tier ranks in mob JSON, faction bits, skill enums) and the
  docs remain **unaudited** — §35's floor-not-ceiling note stands; a further
  sweep is its own backlog entry if wanted.
- No overlay loader, no `DisallowUnknownFields`, no collapsing of the
  deliberate mirrors (mob speed pair, graceTicks pair, the two 0.2s stay two —
  pinned, not unified).
- The five conf files stay five — this plan makes four of them small and all of
  them drift-proof, it does not consolidate them.

## 7. Chunk ledgers

### C1 — total defaulting + shrink-to-deltas ✅ DONE 2026-07-29, committed `e7531444`

Backend + devops + conf files; behavior-identical for production, see the ⚑
below for the one deliberate bit-level move. 2 production files touched
(`core/gameconf.go`, `cfg/conf.go`), 3 test files (2 new), 5 conf files.

**What shipped, in plan order:**

1. **C1.1 — the player pair is defaulted** (test-first;
   `core/gameconf_test.go` pinned the 0/0 failure before the fix).
   `healthGainTick` → `0.00033`, `walkingSpeedPerTick` → `0.05`, same `<= 0`
   idiom, beside the `BaseHealth` normalization. L1 ordering held: this landed
   before any file shrank.
2. **C1.2 — the audit found TWO more gaps, one closed, one dead key removed:**
   - ⚑ **`server.port` absent on a plain-HTTP boot bound `":0"` — a random
     ephemeral port**, silently. Now defaults to `2000` in `cfg.ReadConfig`,
     **only when `tlsHost` is empty** — a TLS boot serves 443 regardless and
     warns about any configured port, so inventing one there would make every
     production boot cry wolf (pinned by all three cases in the new
     `cfg/conf_test.go`).
   - ⚑ **`server.path` was DEAD config** — `cfg.Server` never had the field
     and `/game` is hardcoded in both `bootServer` and `bootTlsServer`. Four
     files carried it (§2's survey had listed it as a genuine delta); removed
     from repo default + docker + devops, and the drift test's L-H4 comment no
     longer cites it.
   - Full absent-behavior map after C1 (the audit deliverable): `zone` →
     sole-zone-or-loud-error (a *selector*, deliberately outside the resolved
     comparison) · day cycle 600/400, curve 1.12×30, critChance 0.05 →
     `ReadConfig` · margin 0.2, baseHealth 100, XP 300/1.2, skillPoints 1,
     **and now the player pair** → `core.Config` · mob pair → `mob.SetX`
     normalization · combat pair → accessor normalization · `port` → 2000 when
     plain-HTTP · `tlsHost` absent → plain HTTP · `frontendDir` → only read
     under `-dev`; absent serves the CWD — noted, left as-is (dev-only, loud).
3. **C1.3 — the resolved-equality test went WIDER than planned and found a
   live fleet split.** `conf_resolved_test.go` resolves `{"game":{}}` **and
   all five tracked confs** through the full chain (`ReadConfig` +
   `core.Config` + combat accessors + mob setters) and asserts identical
   tuning — so "every tracked conf runs the documented numbers" is the
   invariant, not just the default file. First run: **3 of 5 red** on
   `mob.healthGainTick` — the authored `0.0066667` was a *rounded* restatement
   of the Go default `1/150`, ≠ at float32. ⚑ **The fleet was split in
   production's favour:** files WITH a mob block resolved `0.0066666998…`,
   files WITHOUT (docker **and devops = the live server**) resolved the true
   `0.0066666668…`. Both default copies snapped to `0.006666667` (the exact
   shortest float32 decimal), comment updated to say the restatement is
   bit-exact and why.
4. **C1.4 — the shrink.** `conf.local-windows.json` → `frontendDir` + the
   `_walkingSpeedPerTick` stash (L2 kept) · `conf.docker.json` → `port: 80` ·
   `devops/conf.json` → `tlsHost` + `frontendDir` + `zone: "world"` (zone's Go
   default is empty, which aborts a multi-zone boot — a genuine delta). Each
   carries a one-line `_comment` pointing at `conf.default.json`. Both default
   copies stay FULL (L3).

**⚑ The one number that moved:** resolved `mob.healthGainTick` for any boot
off the default files or old local-windows shifts by **3.3e-8/tick** onto the
Go default — deliberate (the JSON comment always named model/mob the source of
truth, and production already ran the Go value). docker + devops resolve
**bit-identically** before vs after. Everything else: the fleet-wide
`PlayerConfig` dump and tuning-knob log line are identical old vs new, and now
identical *across all four variants* (previously split at the 8th decimal).

**Verified:** `go build`/`vet`/`test -timeout 120s ./...` all clean · sim
battery **byte-identical** on all four legs (default · `-chain` · `-levels` ·
`-content ../api`; TTK 6.67 s / TTD 8.70 s stand) — trivially expected per L9,
which is exactly why the boot check also ran · **all four conf variants
booted** (`AURAD_CONF=…`, `-zone world -content ../api`): 0 errors 0 warnings,
15 factions/86 skills/64 mobs/10 recipes/1 milestone/5 prop defs/777
props/485 spawns/5 campfires, docker on `:80`, local-windows on `:2000` via
the new port default, devops on TLS `aura-game.duckdns.org` · the
resolved-equality test was written BEFORE the shrink and stayed green across
it — that sequence **is** the L4 old-vs-new proof. No browser harness owns
conf resolution (coverage map checked; no game-surface behavior changed).

**Hand-forward:** C2's boot-noise expectation ("0 warnings after C1's shrink")
now holds — every key left in the five tracked files is either a live struct
field or `_`-prefixed. The embedded copy's `server` block still deliberately
differs (L6).

### C2 — unknown-key boot warning ✅ DONE 2026-07-29, committed `e7531444`

Backend only, as planned. 1 new production file (`cfg/unknownkeys.go`), the
`ReadConfig` wiring, tests on both sides.

- **`cfg.UnknownKeys(raw)`** decodes the raw JSON to a map beside the struct
  and walks it against `cfg.Config`'s json tags recursively, returning sorted
  path-qualified keys. Two exemptions: `_`-prefixed keys at any depth (L2),
  and **case-insensitive field matches** — a subtlety the plan didn't name:
  `encoding/json` accepts and *applies* them, so warning on `"Port"` would cry
  wolf on a key that actually works (pinned by its own subtest).
- **`ReadConfig` logs one WARN per key**, message naming the fix as D2/L10
  require: *"unknown config key — not a config key; delete it, or prefix it
  with _ to keep it as a comment"*, with `key` (path-qualified) and `file`.
  Warn-not-fail: the struct parse has already succeeded, nothing can abort.
- **Test-first, and the fixture corrected the record:** the regression fixture
  is the exact pre-hygiene embedded conf (`c183ce12^`, kept verbatim in the
  test) — it carried **8 dead keys, not the 7 the hygiene ledger counted**
  (7 in `game.player` + `game.heatFractionPerSecond`).
- **The boot-noise check is a permanent test, not a one-off:**
  `TestTrackedConfs_HaveNoUnknownKeys` (cmd/aurad) asserts all five tracked
  confs report zero unknown keys, sharing the hoisted `trackedConfs` table
  with the C1 resolved-equality test. A future retired field goes red here
  the moment the files aren't pruned.

**Verified:** `go build`/`vet` clean, full `go test ./...` green (27 pkgs) ·
booted all five tracked confs **plus the gitignored local `conf.json`** →
**0 warnings** (the local file predates the shrink but every key on it is a
live field, so L10's noisy-boot round didn't materialize on this machine) · a
deliberate stale-key conf (`heatFractionPerSecond` + `damageAuraRadius` +
a `_` stash) **booted to a running server and warned exactly twice**,
path-qualified — D2's warn-not-fail proven at the real boot surface, and the
`_` key stayed silent · sim battery default leg byte-identical vs the pre-C1
baseline (`ReadConfig` is not in the sim path — L9 — run anyway).

### C3 — tier-3 pins ✅ DONE 2026-07-30, committed `e7e14c71`

Tests only, exactly as planned — 3 new test files, zero production code.

- **`sim/conf_pin_test.go`** — `DefaultRegenTick` and the `world.go` literals
  (`LevelUpXPBase` 300 · growth 1.2 · chase margin 0.2 · the zero-RegenTick
  default) pinned against `conf.default.json` read repo-relative. The literals
  are asserted on **the config a built world actually runs**
  (`NewWorld(...).game.config`), not restated in the test — so the pin covers
  the wiring, not just the constant. A struct decode + nonzero guard keeps a
  renamed JSON key from silently comparing 0 == 0.
- **`model/mob/conf_pin_test.go`** — `defaultChaseIntoAuraMargin` pinned
  against `game.mobChaseIntoAuraMargin` (transitively pinning the H1a pair:
  the `gameconf.go` twin's own side is held by C1.3's resolved-equality test),
  and `combatRegenGraceTicks = 100` pinned with the test naming its
  `model/player` twin (L11 — in-package, no new coupling, mirror stays
  deliberate).
- **`model/player/conf_pin_test.go`** — the mirror-side grace-ticks pin.
- **Red direction proven, not assumed:** perturbing `mobChaseIntoAuraMargin`
  0.2 → 0.25 in `conf.default.json` turned both packages red; reverted,
  `git diff` empty.

**Verified:** `go build`/`vet` clean, full `go test ./...` green.

### C4 — tier 5 + tier 4, per item ✅ DONE 2026-07-30, committed `e7e14c71`

**a. `spacedName()` is GONE.** The tooltip's summon line resolves through a
new `mobDisplayName()` in `client-data/Mobs.ts` — the served `/mobs`
`displayName`, which the server derives once via `skills.DeriveDisplayName`,
i.e. exactly the rule the client had copied. Degrade path = the raw authored
name (the catalog design: the game never blocks on it). Test-first, and the
fallback case was **genuinely red against the old code** — the rule copy split
"SoldierCompanion" even with no catalog loaded, which is the drift class D3
retires. The vitest drives the real `loadMobCatalog()` path against a locally
resolving fetch — no test-only backdoor into the catalog map.

**b. `ActivationRejection` is a wire enum.** `server.fbs` now carries the
pinned values (None 0 · NoAnchor 1 · NoTarget 2 — L8, §28 discipline), the
GameState field is retyped (same ubyte on the wire; the enum only names the
values), and **regenerating both binding sets was a zero diff apart from the
new enum + the retyped accessors** — the C4 acceptance's proof the window was
free. The Go model constants now derive from the generated enum (the
`status_effects.go` pattern; the `iota` block is gone), the codec casts to the
enum type instead of `byte()`, and the client map keys by the generated names
— a renumber now goes red in tests instead of showing the wrong message. New
`Skills.test.ts` asserts every enum member has a message + the generic
fallback. ⚑ **One wrinkle worth keeping:** the client imports the enum *file*
(`api/schema/js/aura-api/activation-rejection`), NOT the `AuraApi` barrel —
the barrel drags the whole binding graph and its `flatbuffers` dependency into
the catalog module, and vitest cannot resolve `flatbuffers` from a file
outside `frontend/` (webpack can, via its `paths` alias), which reads as a
mysterious import error in an unrelated test.

**c. `api/shared-constants.json` — the cross-language contract fixture.**
`appliedEffectBits` (8) · `auraCategoryBits` (7) · `tierRanks` (3) ·
`viewportMeters` 20×12 · `ticksPerSecond` 30. Asserted by
`cmd/aurad/shared_constants_test.go` **and** `client-data/SharedConstants.test.ts`.
The TS side is **exhaustive in both directions** (a fixture entry with no enum
member fails, and vice versa); the Go side is spelled out (Go constants cannot
be enumerated) with the comment naming the consequence — a NEW bit must touch
the fixture and both tables together. Red proven: one perturbed bit value
failed **both languages**. Knock-ons: the client's positional tier-frame array
became a table keyed by a new `TierRank` enum in `client-data/Mobs.ts` (the
rank ↔ meaning contract now has a name on the client), and the three client
bit enums went `const enum` → `enum` — member enumeration is a **compile
error** on a const enum; a regular enum emits the object, behavior-identical.
The fixture is deliberately outside `cp-defs` and the loaders: tests read it
from the repo, the game never does.

**Verified:** `go build`/`vet`/full `go test ./...` clean · 66/66 vitest ·
`tsc --noEmit` clean · prod build clean (standing bundle-size warnings only) ·
boot `-content ../api`: 0 errors 0 warnings, 15 factions/86 skills/64 mobs/
10 recipes/1 milestone/5 prop defs/777 props/485 spawns/5 campfires · harness
gate per the coverage map: `round4-tooltip.mjs` **all checks passed** (first
run invalidated by a §29 context loss, re-run clean — the standing rule held)
and `hygiene-wire-prune.mjs` 647 sprites / 0 console errors / 0 ctx losses.
No sim battery: the rejection field's wire bytes are identical and nothing
behavior-bearing moved (and per L9 the codec is outside the sim path anyway).
The one open acceptance item — the manual in-game rejection-message check —
is handed to the PO as a checklist under the per-bug working model.
