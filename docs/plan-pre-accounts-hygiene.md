# plan-pre-accounts-hygiene.md — config truth + wire vestiges, before step 8

**Planned 2026-07-28 (docs only, no code).** One chunk, four parts, taken as the
last thing before the accounts & persistence design session. Everything in it is
already recorded as a finding somewhere else; this doc is where those findings
get a shape, an order and an acceptance test.

Sources: `backlog.md` §35 (tier 1), §30 item 1, `plan-entity-model.md` §8b
(L12 + the wire orphans), §35 tier 4.

---

## 1. Why these four, and why now

They share one property that the rest of the open backlog does not: **step 8
makes them more expensive, not less.**

- A **fresh server writes `cmd/aurad/conf.default.json` as its `conf.json`**
  (`loaders.go:239`). Step 8 is when a server gets stood up next to a database.
  That file is the most out-of-date of the five configs today.
- The **balancing harness is the instrument every content number comes out of.**
  It currently disagrees with the live game about mob stop distance by 4×, under
  a comment asserting it mirrors the config.
- **Wire fields are positional.** Deleting dead ones renumbers the fields after
  them, which is free while client and server ship together and stops being free
  the moment anything durable is written in wire vocabulary.
- The **L12 pin is a tautology**, so today the 15th NPC whose author forgets one
  field is silently killable — and step 8's first consumer (the sacrifice loop)
  is the point where more content gets authored, not less.

None of it changes how the game plays, with exactly one deliberate exception
(H1a, decided below).

---

## 2. Decisions (PO, 2026-07-28, via choice prompts)

**D1 — the harness follows the live game.** `sim/world.go`'s
`MobChaseIntoAuraMargin` goes `0.05 → 0.2`, and `model/mob/mob.go`'s disagreeing
fallback follows. The harness exists to predict the game it tunes; a 4× drift in
either direction defeats that. **Accepted cost: a one-time battery re-baseline**
— TTK/TTD move, byte-identity breaks once, the delta is recorded and signed off
rather than hidden.

**D2 — hand-sync the embedded config now, and pin it with a drift test.**
`cmd/aurad/conf.default.json`'s `game` block is brought up to date and a Go test
asserts it equals `backend/conf.default.json`'s. The `server` block is
deliberately **excluded** — that is the one real per-environment delta
(`frontendDir` vs `path`). Rejected: a Makefile copy step (more machinery than
the test buys; `go:embed` cannot reach outside its package dir either way), and
sync-without-a-test (which is exactly how the file acquired 7 dead keys).

**D3 — accept the renumbering, keep it to two.** `Vec3f` and
`Resource.capacity`/`stock` are deleted outright; `aabb` renumbers. Safe because
both binding sets regenerate together and R1 has just proven that regen is a
zero-diff operation. `Character.is_hit` and `active_skill_id` stay for now —
same argument would apply, but they renumber 20+ fields and this chunk does not
need to carry them.

**D4 — delete `ResourceJuice.ts` and both of its mp3s.** `tree-chop` and
`mineral-hit-dull` are harvest-era impact sounds with no surviving trigger and
no place in the aura loop. Recoverable from git if step 8's deferred audio half
ever wants raw material.

---

## 3. H1 — one truth per tuning value

### H1a — the chase margin (⚑ the only part that moves a number)

**The finding is not "a stale comment".** There are two Go defaults for one
value and they disagree:

| site | value | when it applies |
|---|---|---|
| `core/gameconf.go:47-48` | **0.2** | normalizes a non-positive conf value — the live path |
| `model/mob/mob.go:304-305` | **0.05** | `NewMob`'s own "0 means unset" fallback |
| `conf.default.json:11` | 0.2 | authored |
| `sim/world.go:75` | **0.05** | passed explicitly, under `// conf.default.json value` |

Live is **always 0.2**: all five non-test `NewMob` callers pass
`g.Config().MobChaseIntoAuraMargin`, which `gameconf` has already normalized. So
`mob.go`'s 0.05 never fires in the running game — it is a test-only default that
the harness then copied.

`stopDistance = m.aura.Radius + t.Radius() − chaseIntoAuraMargin`
(`mob.go:954`), so a larger margin makes a mob close **further in** before it
stops. The harness has therefore been modelling mobs that stop 0.15 units
short of where they really stop.

**The work:** `sim/world.go:75` → `0.2`, with a comment that names *why* it
mirrors conf; `mob.go:305` → `0.2`, so one number exists.

⚑ **Do these as two separately-verified steps.** `mob.go`'s fallback is reached
by **134 of the 161 `NewMob` call sites** — every one of them a test passing
`0`. Step 1 (sim only) moves the battery; step 2 (the fallback) may move
in-package behavioural tests. Keeping them apart is what makes each diff
attributable. If step 2 turns tests red, that is itself the measurement — report
which tests were leaning on a value the game never uses, and split it out rather
than adjusting assertions to fit.

### H1b — the embedded default config

`cmd/aurad/conf.default.json` (25 lines) vs `backend/conf.default.json`:

- **7 dead keys**: `damageAuraRadius`, `damageAuraDamageFraction`,
  `damageAuraLevelGainFraction`, `healAuraRadius`, `healAuraHealTickFraction`,
  `healAuraLevelGainFraction`, `healAuraSelfDamageTickFraction`. None exists on
  `cfg.Config` any more.
- **missing**: `zone`, `totalDayCycleSeconds`, `dayTimeSeconds`, `baseHealth`,
  `skillPointsPerLevel`, `critChance`, and the whole `mob` and `combat` blocks.

⚑ **Why it survived: `cfg.ReadConfig` has no `DisallowUnknownFields`**
(`cfg/conf.go:85-97`) — verified. Adding it is the tempting fix and the wrong
one here: it would hard-fail every existing local `conf.json` and the live
server's on the next deploy. The drift test is the cheap guard; the strictness
question stays open (see §7).

**The test:** unmarshal both files into `map[string]any` and compare the
`"game"` sub-map. Map comparison, not `cfg.Config` comparison — a struct
round-trip would silently drop exactly the dead keys this test exists to catch.
The embedded bytes are already in scope as `defaultConfig`; the repo file is
`../../conf.default.json` relative to the `cmd/aurad` package dir.

### H1c — `heatFractionPerSecond`

Authored in all five conf files, **read by nothing** — verified: no field on
`cfg.Config`, no mention anywhere in `cfg/` or `core/`. The heater system went
with step 7. Delete from the four tracked files (`backend/conf.default.json`,
`conf.default.json` under `cmd/aurad`, `conf.docker.json`,
`conf.local-windows.json`). `backend/conf.json` is gitignored and local — it can
be cleaned by hand, it is not part of the diff.

---

## 4. H2 — the L12 collision guard

**The finding.** `interaction_content_test.go:198` asserts
`def.Body.CollisionLayer & 2 == 0` on the **raw authored int**. An omitted field
is `0`, which passes trivially — and `mob.go:150` then substitutes
`LayerViewportCollision|LayerActionCollision`. So a conversant whose author
forgets `collisionLayer` is walk-through **and aura-targetable**: players can
damage it, it can die, boot is green and the suite is green.

⚑ **The obvious guard is wrong.** "A mob with an `interaction` block must be
unattackable" would hard-block the *teaching guard that fights bandits* — the
case `plan-entity-model.md` names as its proof that role and capabilities are
orthogonal. The rule must constrain **authoring**, not policy.

**The guard:** in `definitions.go`, where `mapToInteraction` returns a non-nil
`Interaction` (`:502`), require `m.Body.CollisionLayer > 0`. That removes the
"0 means unset" path for exactly the defs where the substituted default is
dangerous, and leaves the *value* entirely to the author. The existing content
test then stops being a tautology without changing what it asserts.

**Content impact: none.** All 14 conversants already author `97`
(verified file-by-file), so boot stays green and the counts do not move.

**Pin:** a loader test that a def carrying an `interaction` block with no
`collisionLayer` is rejected with a message naming the field. Red on today's
loader.

---

## 5. H3 — frontend constants

- `HUD.ts:140` and `HUD.ts:640` compute seconds with a bare `33`. ⚑
  `BasicConfig.ts:128` **documents that rounded 33 as a past bug** ("made the
  reactive lerp finish ~0.333 ms early every tick") while `SERVER_TICKRATE`
  (`1000/30`) sits right there. Both sites → `Constants.SERVER_TICKRATE`. The
  visible effect is a cooldown label, i.e. cosmetic — the point is that the
  codebase stops using a value it has already recorded as wrong.
- `Graphics.ts:26 damageAuraRadiusMeters: 1` — dead. `Mobs.ts:256` states in
  prose that the served `aura_radius` replaced it. Delete.

---

## 6. H4 — the wire prune

### `Vec3f`

`common.fbs:3`, referenced by nothing but its own generated bindings. Clean
delete — it is a struct, so nothing renumbers.

### `Resource.capacity` / `Resource.stock`

`codec/gamestate.go:373-374` hardcodes `1`/`1` for every prop. Since chunk 3a
moved NPCs onto the Mob path, **props are the only thing left on this wire
path**, and a prop's stock has been a constant since the §26 prune. The whole
harvest-era consumer chain hangs off a ratio that can only ever be 1:

| site | what goes |
|---|---|
| `api/schema/server.fbs:119-120` | the two fields (⚑ `aabb` renumbers — D3) |
| `codec/gamestate.go:373-374` | the two hardcoded writes |
| `GameStateMessage.ts:265-266` | the two decodes |
| `EntityManager.ts:52, 69-70` | the three assignments |
| `Resources.ts` | `capacity`, `_stock` + getter/setter, `onStockChange`, and `baseScale` — which has **no other reader** (`:21, 35, 62`) |
| `Resources.ts:195, 223` | the two empty `onStockChange` overrides (`House`, `GateWall`) that exist only to dodge the rescale |
| `Events.ts:255` | `ResourceStockChangedEvent` |
| `ResourceJuice.ts` | the whole file + `tree-chop` and `mineral-hit-dull` (D4) |

**Order:** schema → regenerate both binding sets (`api/schema/make.sh`) → Go
codec → frontend consumers → asset deletes. Regenerating first means the
compiler and `tsc` enumerate the remaining call sites for you.

---

## 7. Deliberately NOT in this chunk

- **`Character.is_hit` / `active_skill_id`** (D3) — dead at both ends, but they
  renumber 20+ `Character` fields. Recorded in `plan-entity-model.md` §8b; the
  in-repo precedent is replace-in-place, not delete.
- **`DisallowUnknownFields` on `cfg.ReadConfig`.** It would have caught H1b's 7
  dead keys at boot. It would also hard-fail every existing local and deployed
  `conf.json` on the next start. Worth doing *with* a deploy plan, not inside a
  hygiene chunk. (Contrast: R1's `DisallowUnknownFields` on the mob loader was
  safe because content ships in the repo.)
- **§35 tier 2 and tier 3** (the 17 identical conf restatements, the Go
  constants restating conf values). H1b's drift test is the pattern that would
  close them; scaling it up is its own chunk.
- **The R4 badge items and target stickiness** — both real, both wanted, neither
  hygiene. R4 needs the PO's list; stickiness changes how every damage aura
  feels and deserves its own verification pass.

---

## 8. Landmines

- **L-H1 — H1a is the only thing in the chunk that may move a number, so it must
  not share a diff with anything else.** Run the battery three times: baseline,
  after H1a step 1, after H1a step 2. Everything else in the chunk must come out
  byte-identical.
- **L-H2 — 134 of 161 `NewMob` call sites pass `0`** and therefore take
  `mob.go`'s fallback. Changing it is a one-line edit with a 134-site blast
  radius, all in tests.
- **L-H3 — the sim never loads authored content.** `sim/world.go` feeds `NewMob`
  synthetic inline definitions, so **H2 is completely invisible to sim
  byte-identity**. Its only gate is `go test` plus boot `-content ../api`.
- **L-H4 — the two default configs legitimately differ in `server`.** A
  byte-identity pin across the whole file would be wrong and would be "fixed" by
  someone deleting the difference. Pin `game` only, and say why in the test's
  own comment.
- **L-H5 — removing mid-table wire fields renumbers everything after them.**
  Safe only because both ends regenerate and deploy together. A client built
  before the regen and served after it decodes `aabb` as garbage, silently.
  Rebuild the frontend, not just the backend (the §26 chunk-2 lesson).
- **L-H6 — deleting `ResourceJuice.ts` removes two `registerPreload` calls.**
  The boot-time asset count changes; a smoke run that pins it needs updating,
  and the WebGL-context check (`ctxloss-warning.mjs clean`) should be re-run
  since the boot path moved (backlog §29).

---

## 9. Test plan & acceptance

| part | pins | acceptance |
|---|---|---|
| **H1a** | none new — the battery *is* the test | sim battery re-run at each of the two steps, **deltas recorded and PO-signed** (TTK 6.67 s / TTD 8.70 s are the current baselines); `go test ./...` green after step 2 or the fallback change is split out |
| **H1b** | new drift test: the two default configs' `game` blocks are equal (map comparison); red on today's files | fresh-directory boot with **no `conf.json`** writes one and reports the same `🎚️ tuning knobs` line as a repo-default boot |
| **H1c** | — | boot clean; `heatFractionPerSecond` returns 0 hits in tracked files |
| **H2** | loader rejects an `interaction` def with no `collisionLayer`, message names the field; existing content test unchanged and still green | boot `-content ../api` clean with the pinned counts |
| **H3** | existing 44 vitest green | `npm run typecheck` + prod build; cooldown label still renders in the join smoke |
| **H4** | `GameState` codec round-trip over a prop (no capacity/stock) | frontend prod build green; join smoke: props render, **0 console errors, 0 WebGL context losses** |

**Backend gate, every part:** `go build ./...`, `go vet`, `go test -timeout 60s
./...`, guardrails `-count=2`, boot `-content ../api` with 0 errors / 0 panics
and the counts recorded — **83 skills / 15 factions / 64 mobs / 777 props /
485 spawns / 5 campfires**.

**⚑ The chunk's headline acceptance:** *everything is byte-identical except
H1a's two recorded steps.* If any other part moves the battery, that part is
wrong.

**Suggested order:** H2 → H1b/H1c → H3 → H4 → **H1a last**. H1a is the only
irreversible-ish one (it re-baselines the battery), so it goes after everything
that must prove byte-identity against the old baseline.

---

## 10. Wrap-up bookkeeping

When it lands, these get updated rather than duplicated: `backlog.md` §35
(tier-1 rows 1, 2, 3, 4 closed; tiers 2–4 stay open), §30 (item 1 closed ⇒ §30
fully done), `plan-entity-model.md` §8b (L12 closed, the `Vec3f` orphan closed,
the two `Character` orphans left), CLAUDE.md `## Status`, and the MEMORY.md
index line.

---

## 11. Chunk ledger

*(filled in when the chunk lands — what was decided inside it, what shipped,
which commit, what was verified, and the H1a battery delta.)*
