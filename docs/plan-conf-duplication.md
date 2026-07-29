# Plan: §35 — one value, many homes (the conf-duplication sweep)

**Status: PLANNED 2026-07-29 — no code yet. Chunks C1–C4 below, none started.**
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

*(filled per chunk as they ship)*
