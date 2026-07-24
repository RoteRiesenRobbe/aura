# Plan: Dropped Movement Inputs → held-state input model

**Status:** **DONE 2026-07-24 (chunks 1 + A + B), [uncommitted], PO-VALIDATED
LIVE.** Chunk 1 instrumentation shipped and the ~14-min PO run (below) **overturned
the TCP-HoL hypothesis** — root cause is client-side Tock coalescing under render
jank, proven from the code. Chunks **A (server coast ≤`maxHoldTicks=15`)** + **B
(client explicit "stopped" on release, `STOP_TAIL_TICKS=5`)** shipped together.
**Live re-measure (20 control bots + PO): the browser input queue logged 0 starved
/ 0 coasted / 0 stalled across all 7 windows — the dropped-movement bug is GONE.**
Chunk C (non-coalescing input timer) was **not needed** — 0 starvation left nothing
to fix upstream. See §11 for the wrap.

**The re-measure surfaced a SEPARATE, downstream problem** (own plan
`docs/plan-render-jitter.md`): 10 % eviction / `q_mean` 1.09 (client-fast rate
mismatch) and a *slight* felt "micro-reset" while walking that **persists solo** —
that is client-side snapshot rendering, not this input path (0 starvation proves
it). Not addressed here.

Opened from a live PO report: *"I wanted to walk but kept stopping. It wasn't
delayed or sluggish, just that sometimes my movement keys did not register
somehow."*

---

## 1. What the measurement proved

Chunk 1 added per-player input-transport instrumentation (see §7 for the ledger).
A ~14-min live session (join 08:01:28Z, 14 rolling windows to 08:15:28Z, id 1343)
produced this — quiet-by-default, so every line below means real trouble:

| metric | total over ~25 200 ticks | rate | reading |
|---|---|---|---|
| **stalled** | 5 031 | **~20 % of all ticks** | 1 tick in 5 the character stood still while a key was held |
| **starve runs** (= bridged) | 296 | **one every ~2.8 s** | the queue ran fully dry 296 times |
| starved ticks | 5 327 | ~21 % | — |
| evicted | 283 | **1.1 %** | steady background, **uncorrelated** with the stalls |
| dropped | 0 | — | the rare double-race never fired |

**Cumulative starve-run histogram** (buckets `1 / 2 / 3 / 4-6 / 7-9 / 10-15 / 16+`):

```
[48, 26, 24, 45, 32, 36, 85]
```

- **52 %** of runs (153/296) lasted **≥7 ticks (≥233 ms)**.
- **29 %** (85/296) lasted **≥16 ticks (≥533 ms)** — the single largest bucket,
  and it is **unbounded**, so the true p99 is unknown from this data.
- The 3-tick bridge tolerance covers only the first ~98 runs.

**Two consistency checks that validate the instrumentation itself:**
- runs (296) == bridged (296) == histogram sum (48+26+24+45+32+36+85). Each run
  is bridged exactly once — the state machine is correct.
- The AFK tail window (08:16:28, after the PO stopped) read
  `starved:1800, stalled:1800, arrivals:0`, **no `q_mean`** (guarded on zero
  arrivals) and **`run_hist` unchanged** — the open run at disconnect was never
  bucketed, exactly as designed, so a dropped client cannot poison the histogram.

### The discriminator verdict — client-side, NOT the network

The chunk-1 design set up a test to separate two hypotheses. The data is
unambiguous:

- **No eviction burst follows a starve run.** The two *biggest* starve windows
  (688 and 671 stalled) had among the *lowest* evictions (17 and 7). A TCP
  head-of-line stall would dump a backlog → an eviction spike. It didn't.
- **`q_mean ≈ 0.6–0.9`, never near the cap of 2.** The queue runs *near-empty*.
  This **refutes finding 1's saturation prediction** — the client is net
  *under*-feeding the queue, not overfeeding it.
- The steady **1.1 % eviction** is exactly the ~1 % the client-fast timer
  (30.303 vs 30.0 Hz) predicts — present as flat background, drowned out by the
  starvation.

⇒ **The inputs were never produced.** The problem is client-side input
production, not transport.

---

## 2. Root cause (proven from the client code, not inferred)

Three code facts stack into the bug:

1. **`tock.js:50–59` — the input timer is `setTimeout`-based and *coalesces
   missed ticks*.** `_tick` calls the callback (`Controls.update`) **once**, then
   if it is ≥1 interval behind schedule it computes `missed_ticks`, **advances the
   clock past them without firing the callback for each**, and recurses exactly
   once. A main-thread block of N intervals therefore yields **2** `update()`
   calls, not N — the other N−2 input ticks are silently discarded. Being
   `setTimeout`, it shares the single main thread with the PixiJS render loop, so
   any long frame (aura `ColorMatrixFilter` passes, GC, many entities) delays the
   input tick and trips the coalescing.

2. **`Controls.ts:209–244` — the client sends a packet *only when there is
   movement*** (or rotation / pointer-moved). No packet on key release, no
   keepalive. So "walking packets/second the server sees" == "times Tock fired
   `update()` while a key was held" — which droops below 30 exactly when the
   client is busy.

3. **`InputMessage.ts:36` — there is no "I stopped" signal on the wire at all.**
   Zero movement is omitted; stopping is communicated by *silence*, which the
   server turns into bridge-then-delete (`core/input.go:pickInput`).

**The loop:** client busy → Tock drops input ticks → fewer walking packets →
server queue starves → server deletes movement after a 1-tick bridge → the
character stutter-stops while the key is held.

**Machine-specific or universal?** The *mechanism* is universal — provable from
the code, it fires on any client whenever a render frame runs long, which is
every client sometimes and weaker/hotter machines often. The PO's machine set the
*magnitude* (20 %). Confidence it affects every tester to some degree: high
(~90 %+). This is not a single-machine artifact.

### Why the core loop makes this a priority, not polish

The vision makes positioning *the* skill expression, and auras tick on anything
in range. A stutter-stop *inside* a damage aura is unintended damage; a naive long
coast would *ghost-walk the player into* an aura they were leaving. The bug hits
the primary mechanic directly.

---

## 3. The design: input as idempotent held state

Stop treating movement as a lossy stream of per-tick samples; treat it as **held
state that is re-asserted and held**. This is the Quake/Source-lineage model and
it dissolves the whole bug *class* rather than patching this instance.

Three composable properties, and the crucial one is that they make the
previously-unsizable coast window stop being a behavioural guess:

- **P1 — the server holds the last movement *direction* on a starved tick**
  (coast), bounded by a safety cap `maxHoldTicks`. Movement is integrated as
  `position += normalize(dir) × speed` per tick (`input.go:149–151`), so
  replaying a direction simply keeps integrating — **coasting "north" then
  receiving a fresh "north" is continuous, with no double-count and therefore no
  reconcile-discard step.** (This is why the old plan's "discard `coasted` inputs
  from the backlog" is unnecessary: the client sends a *current direction*, not a
  queue of position-steps.)
- **P2 — queue eviction becomes correct by construction.** A newer state
  supersedes an older queued one (last-writer-wins); evicting a superseded
  direction is *right*, not lossy. **So the queue is NOT deepened** (the old plan's
  2→16). Depth 2 with last-writer-wins is the whole reconcile.
- **P3 — the client sends an explicit "stopped" state on release**, re-asserted
  for a short tail (~5 ticks) so at least one lands, then goes quiet. This is the
  missing release signal. It is what makes P1 *safe*: without it, silence means
  "keep walking" and every release would ghost-walk. **P1 without P3 is the
  landmine; P1+P3 together are the fix** — hence they ship as one committed pair.

Under P1+P2+P3 every failure mode collapses to a no-op: a dropped input tick
(render jank) is covered by the hold and re-asserted by the next packet; a lost
"still walking" packet is a no-op because the state did not change; a release is
an explicit, re-sent, idempotent state so it cannot be lost into a ghost-walk. The
design is robust to causes we have **not** identified, which is the point.

### `maxHoldTicks` is now a bounded reliability parameter, not a p99 guess

With P3 in place, the cap's only job is to bound **worst-case drift on a genuine
total client freeze while a key is held** (the one case where no stop packet can
be sent). It is *not* trying to cover the unbounded 16+ histogram tail.

- Proposed starting value: **~15 ticks (~0.5 s)** [PLACEHOLDER]. Rationale: it
  fully covers the ≤15-tick buckets (71 % of observed jank runs), and 0.5 s is an
  acceptable, bounded drift ceiling for the rare true-freeze case. Tunable up for
  smoothness, down for tighter drift — the tradeoff is explicit and documented,
  not hidden.
- It is derived from an observable (the histogram) and a UX ceiling (drift on
  freeze), so it carries a comment explaining *why its value*, per the
  no-hardcoded-landmine rule.

---

## 4. Chunk A — server-side hold (coast)

Generalise the existing 1-tick bridge into a bounded hold, keyed on the same
`fresh == nil` starvation signal `pickInput` already computes.

- `pickInput`: when starved, replay the held movement (direction + rotation,
  one-shots stripped — already the bridge's behaviour) for up to `maxHoldTicks`
  consecutive starved ticks, counting the coasted ticks per player, then halt.
- The held entry is the movement-only copy already built in `pickInput`; widen
  its lifetime from "consumed on first use" to "reused up to `maxHoldTicks`".
- **Clear the held state on death and on authoritative reposition.** `updateInput`
  already gates movement on `Health != 0`, so a dead player does not move; but the
  held entry must be **deleted on the alive→dead transition** so a respawn
  (`state.go:285`) or Recall (`skills.go:1353`) does not coast the player back out
  of the new position. Property + test required.
- Coasting carries **movement only**, never one-shot commands (aura switch,
  cooldown) — already true of the bridge copy, and it matters *more* with a longer
  window.

**No queue change, no reconcile step** (see P2/P1). The chunk-1 instrumentation
stays as the permanent regression detector; add a `coasted` counter alongside
`stalled` so the fix's effect is visible in the same `inputstats` line (stalled
should collapse toward zero, coasted should absorb it).

**Tests (TDD):**
- A starve run of length k ≤ `maxHoldTicks` produces k coasted ticks of the held
  direction, zero stalls.
- A run longer than `maxHoldTicks` halts at the cap (the "don't slide forever"
  guarantee, widened from 1 to N).
- Held state cleared on death → no coast across respawn.
- Alloc pin: the coast path stays zero-alloc (reuses the held copy; keeps the
  `fe0044d0` posture green).

## 5. Chunk B — client-side release signal (ships WITH chunk A)

- `Controls.update`: when movement transitions non-zero → zero (key release),
  send an explicit zero-movement input, and keep sending it for a short tail
  (~5 ticks [PLACEHOLDER]) so at least one survives loss, then go quiet.
- **No new wire field.** A fresh `Input` with movement absent/zero already means
  "not walking" on the server (`input2vec` → zero vector → no step); the change is
  that the client actually *sends* it on release instead of falling silent. The
  server distinction is `fresh != nil && zero-movement` (stop, clear held) vs
  `fresh == nil` (starved, coast) — exactly the signal `pickInput` already keys
  on.
- **Idle bandwidth stays ~zero.** Held *walking* already sends per tick (when the
  timer fires); the only new upstream traffic is the ~5-packet release tail. Do
  **NOT** "simplify" this to send-every-tick-while-idle — that would put 30
  standing packets/s per idle player on the wire and regress the loadtest ceiling
  (~60–70 clustered, `devops/loadtest.md`). This constraint is a landmine; it is
  called out again in §6.

**Tests (TDD, Playwright at the game surface per the `verify` skill):**
- Releasing a held key emits a zero-movement input tail, then silence.
- Server receiving the stop halts immediately (no coast past a real release).

## 6. Chunk C — optional hardening (only if residual droop remains)

After A+B, a dropped input tick is a no-op, so fixing input *production* is
polish, not load-bearing. If the post-A+B `inputstats` still shows meaningful
starvation:

- Drive input sampling off a **non-coalescing** source — a `requestAnimationFrame`
  accumulator that emits the correct number of ticks, or a Web Worker heartbeat
  immune to main-thread jank — instead of the coalescing Tock `setTimeout`.
- Keep the drift comment fix (see §8, was chunk 3): the old `pickInput` comment
  was rewritten with chunk 1; the `BasicConfig` rate mismatch note stays for the
  record but is **moot for this bug** — `q_mean 0.7` proves the queue is not
  saturated, so aligning 30.303→30.0 Hz does not touch the stalls. Do not ship a
  server tick-rate change (it would shift every seconds→ticks conversion 1 %).

---

## 7. Longevity assessment & when this solution could itself become a problem

The user asked for an honest read on how durable this is and where it could turn
into its own problem. Both below.

### Why it is durable

- It is the **standard foundation** action-game netcode is built on; it is not a
  bespoke trick.
- It fixes the **class** (any single dropped tick — jank, packet loss, or an
  unknown future cause — is absorbed), not just the measured instance.
- It is **KISS/YAGNI-consistent for a PvE, no-PvP-for-5-years game**: server
  authority + interpolated rendering + bounded hold is exactly enough; it does
  **not** build client prediction / rollback / lag-comp, which the current design
  does not need.
- It is **forward-compatible**: held-state is the substrate PvP prediction would
  later build on, so it does not foreclose that future — it de-risks it.
- It removes, rather than adds, magic numbers: the queue-depth tuning and the
  p99-derived coast window both disappear; the one remaining constant
  (`maxHoldTicks`) is a bounded, documented drift ceiling.

### When it could become a problem in and of itself

1. **A genuine multi-second client freeze *while walking toward danger*.** During
   a true freeze no stop packet can be sent, so the server coasts up to
   `maxHoldTicks` and the player returns to find they drifted. This is *inherent*
   to any coast and is the reason the cap exists and is bounded (~0.5 s). It is a
   deliberate, bounded tradeoff — smoother common case for a small worst-case
   drift — not a bug. Setting `maxHoldTicks` too high is where it bites.

2. **Adding client-side prediction later without reconciling the coast.** If we
   ever predict movement on the client to hide RTT, the client's "I released"
   must reconcile with the server still coasting the held state for a few ticks
   until the stop lands — otherwise the player snaps/rubber-bands. Held-state is
   the *right* substrate for prediction, but the coast window and the prediction
   must be reconciled together. Flag for whoever builds prediction; do not add
   prediction piecemeal on top of the coast.

3. **A future "simplification" to send held-state every tick including idle.** It
   looks cleaner ("always send the current state") but it puts 30 standing
   packets/s per idle player on the wire and regresses the loadtest ceiling. The
   §5 release-tail approach is deliberate. This is the most likely way a later
   editor re-introduces a problem; it is commented at the call site.

4. **Forgetting to clear held state on death / reposition** (respawn, Recall,
   any future knockback/teleport) → the player coasts out of a safe respawn or
   away from a teleport target. Handled in chunk A as a required property with a
   test; any *new* authoritative reposition site must clear it too.

5. **`maxHoldTicks` drift as a silent tuning constant.** Less of a landmine than
   the old p99 guess (it is bounded by P3), but still a value that, set wrong,
   trades stutter for drift. It must keep its "why this value" comment and be
   re-checked if `WalkingSpeedPerTick` ever changes (drift distance = cap × speed).

None of these is unbounded or silent once documented, which is the bar for
"durable." The honest ceiling of this design is that it is *server-authoritative
without prediction* — correct and smooth for PvE co-op, and the correct base to
extend from if PvP ever makes prediction necessary.

---

## 8. What changed from the pre-measurement plan

- **Dropped:** queue-deepen 2→16 (P2 makes eviction correct at depth 2);
  reconcile-discard (P1 makes it unnecessary); chunk 3 server/client rate
  alignment *as a fix* (`q_mean 0.7` proves it is moot here).
- **Kept:** the wrong-signed `pickInput` drift comment was already rewritten with
  chunk 1. The `BasicConfig.INPUT_TICKRATE` 33→`1000/30` note survives only as
  record, not as this bug's fix.
- **New:** the held-state model (§3) and its client release signal (§5).

### Chunk 1 wrap (instrumentation — shipped, kept permanently)

Landed 2026-07-24: `model.InputTransportStats` value type (not on the `Client`
interface — read via a narrow type-assert so the sim `nopClient` and the six test
fakes are untouched); client-side `atomic.Uint64` counters (`evicted`, `dropped`,
`arrivals`, `qDepthSum`) bumped in `pushInput`; tick-side per-player
`playerInputStats` (`starved`, `bridged`, `stalled`, a compile-locked 7-bucket
starve-run histogram) with a `statFor` accessor; rolling `slog` `inputstats` line
every `summaryIntervalTicks = 60 × constant.TicksPerSecond`, suppressed on a
trouble-free window, honest `win_ticks`, `q_mean` guarded on zero arrivals; final
cumulative line on disconnect anchored to the join tick. Zero-alloc pin on the
starved path holds. Deployed live (pid 50325, clean boot, `GET /` + `/skills`
200). **Keep permanently** (PO ruling) — it is the regression detector for exactly
this bug class, and chunk A extends it with a `coasted` counter.

---

## 9. Verification (chunks A–C)

- `go build ./...` exit 0 from `backend/`; `go test ./...` full suite + the new
  pins + the untouched `*_alloc_test.go` pins.
- `tsc --noEmit` clean for chunk B/C.
- boot with `-content ../api`, 0 panics.
- **Live re-measure is the acceptance test:** redeploy (ANNOUNCE first — restarts
  wipe characters), PO plays ~10 min including the sustained walking that felt
  bad, then
  `ssh root@159.69.148.73 'journalctl -u aurad --since "-20m" --no-pager | grep inputstats'`.
  **Success = `stalled` collapses toward zero and `coasted` absorbs it, with no
  new ghost-walk feel on release.** If stalls persist, chunk C (input production)
  is warranted; if release feels like over-travel, `maxHoldTicks` is too high.

## 10. Open questions

1. **`maxHoldTicks`** — proposed ~15 ticks (~0.5 s), framed as the freeze-drift
   ceiling (§3). Confirm at a live re-measure.
2. **Release-tail length** — proposed ~5 ticks (§5). Enough for loss tolerance
   without idle spam.
3. **Chunk C needed at all?** — decided by the post-A+B `inputstats`, not upfront.
   **RESOLVED: no** — the re-measure showed 0 starvation on the browser, so there
   was nothing left upstream to fix. See §11.

---

## 11. Wrap — what shipped (2026-07-24, [uncommitted], PO-validated live)

**Chunk 1 — instrumentation (kept permanently).** `model.InputTransportStats`
value type read via a narrow `inputTransportReporter` type-assert (deliberately
NOT on `model.Client`, so the sim `nopClient` + 6 test fakes are untouched);
client-side `atomic.Uint64` counters (`evicted`/`dropped`/`arrivals`/`qDepthSum`)
in `pushInput`; tick-side per-player `playerInputStats` (`starved`/`coasted`/
`stalled` + compile-locked 7-bucket histogram) via a nil-tolerant `statFor`;
rolling quiet-by-default `slog` `inputstats` line every `summaryIntervalTicks =
60 × constant.TicksPerSecond`, honest `win_ticks`, `q_mean` guarded on zero
arrivals, final cumulative line on disconnect. Zero-alloc pin on the coast/stall
path holds.

**Chunk A — server coast.** `pickInput` replays the held movement **direction**
for up to `maxHoldTicks = 15` consecutive starved ticks (was a 1-tick bridge),
then halts; instrumentation renamed `bridged`→`coasted` so `starved = coasted +
stalled`. Held state cleared on the alive→dead transition in `updateInput` so a
coast can't cross a respawn/teleport (`TestUpdateInput_DeathClearsHeldMovement`).
No queue-deepen, no reconcile-discard (P1/P2).

**Chunk B — client release signal.** `Controls.update` sends an explicit
zero-movement input for `STOP_TAIL_TICKS = 5` ticks after key release, then goes
quiet — the missing "stopped" signal that makes the coast safe. **No wire field**
(reuses the existing zero-movement input); idle bandwidth stays ~zero.

**Chunk C — dropped.** 0 browser starvation ⇒ nothing to fix upstream.

**Verification.** `go build`+`go test ./...` exit 0; alloc pins (incl. new
coast/stall path + the `fe0044d0` pins) green; boot `-content ../api` 0 panics;
`tsc --noEmit` exit 0; webpack prod build clean; headless smoke moved 365 u then
**0.0000 residual drift** (no ghost-walk). **Live re-measure** (deployed pid
51474; 20 dispersing walking bots as a live control + PO solo): browser (id 1364)
**0 starved / 0 coasted / 0 stalled across all 7 windows**; bots confirmed the
coast covers short network gaps (bot 1706: coasted 113/188 starved) while the
worst-connected bots showed the cap biting on multi-second outages (expected).

**Live measurement data — the two runs.**

| run | starved | stalled | coasted | evicted | q_mean | verdict |
|---|---|---|---|---|---|---|
| pre-fix (jittery, solo) | ~21 % | ~20 % | n/a | 1.1 % | 0.7 | queue under-fed by client jank |
| post-fix (browser, 20 bots + solo) | **0** | **0** | **0** | ~10 % | 1.09 | input path clean; over-feeding = rate mismatch |

**Follow-up spun out:** the post-fix 10 % eviction / `q_mean` 1.09 and the felt
"micro-reset" (persists solo) → `docs/plan-render-jitter.md` (downstream snapshot
rendering, not this input path).

**New tests:** `TestPickInput_CoastsHeldMovement`, `TestPickInput_CoastCounterAndCap`,
`TestPickInput_ClosedRunBucketed`, `TestPickInput_OpenRunNotBucketed`, `TestBucket`,
`TestPickInput_StarvedPathZeroAlloc`, `TestUpdateInput_DeathClearsHeldMovement`,
`TestPushInputOverflowIncrementsEvicted`.
