# Plan: Walking micro-resets → buffered snapshot interpolation

**Status:** **DONE 2026-07-24 — chunks 1 + Lever A + Lever B all committed and
DEPLOYED LIVE; PO-validated LOCALLY ("feels good"). Live re-feel + a fresh
`[snapshot-arrival]`/eviction re-measure is the outstanding acceptance test.**
See the §Ledger at the bottom. Spun out of the input-jitter fix
(`docs/plan-input-jitter.md`): once the input path was made clean (0 browser
starvation), a *different*, smaller artifact remained. PO report from the live
re-measure:

> *"While walking my character is jittering ever so slightly — it looks like it
> stands still for milliseconds then resets. Very slight, not game-breaking, but
> I can see it. Mobs don't jitter."*

**Confirmed by the PO to persist SOLO** (no bots). So it is not the input path
(that logged 0 starved / 0 coasted / 0 stalled) and not merely bot-amplified
snapshot load — it is intrinsic to how the client renders server positions.

## Diagnosis (proven from the client code)

Two facts about the client's movement rendering, both read from source:

1. **There is NO local movement prediction.** `ControlsMovementEvent`
   (`Controls.ts:216`) has **zero subscribers** — the on-screen character position
   is driven *entirely* by server snapshots via `setPosition`. Nothing is drawn
   ahead of the server.

2. **The interpolation is reactive and un-buffered** (`_GameObject.ts:
   moveInterpolatedObjects`). When a snapshot arrives, `setPosition` records
   `desiredPosition` + `desireTimestamp = performance.now()` and, each frame, lerps
   `shape.position` toward `desiredPosition` over `SERVER_TICKRATE` (33 ms) **from
   the arrival moment**:

   ```
   elapsedTimePortion = (now - desireTimestamp) / SERVER_TICKRATE
   if elapsedTimePortion >= 1: snap to desiredPosition, stop
   else: position = position.lerp(desiredPosition, elapsedTimePortion)
   ```

   There is **no delay buffer** and **no interpolation between two known
   snapshots** — it always chases the single latest position, expecting the next
   one in exactly 33 ms.

**Why that produces "stand still then reset":** the scheme assumes snapshots
arrive every 33 ms on the dot. When one arrives **late**, `elapsedTimePortion`
reaches 1, the character **sits at the last position** (frozen) until the next
snapshot arrives, then chases again. Any arrival gap > the lerp window becomes a
visible micro-freeze followed by a catch-up. Three sources feed the late arrivals:

- **Real network arrival jitter.** Even a good home→Hetzner link delivers 30 Hz
  snapshots with ±several ms of jitter (more on Wi-Fi); through a zero-buffer
  reactive scheme, any >33 ms gap shows. This is the **solo** cause.
- **The 30.303 vs 30.0 Hz rate mismatch.** The client interpolates over 33 ms but
  the server ticks every **33.333 ms** (`time.Second / 30`), so the lerp finishes
  ~0.333 ms early **every tick** — a tiny persistent per-tick freeze. Same
  mismatch surfaced upstream as the **10 % eviction / `q_mean` 1.09** measured live
  after the input fix.
- **Server-side snapshot cadence under load.** 20 bots inflated every per-player
  snapshot (single-threaded encoding — the load wall), making delivery less
  regular. This is why the bots *amplified* it; it is not the solo cause.

Mobs "don't jitter" to the eye because they move slowly/intermittently, so a
frozen-then-caught-up step is far less noticeable than on the constantly-moving
player character the eye is tracking.

## Why now

The input-jitter fix removed the large, upstream "deleted movement" bug. This
downstream artifact is now the dominant remaining "not smooth" feel, and it hits
the same core-loop nerve (positioning is the whole skill expression).

## Design — two levers

### Lever A (cheap, independent): rate alignment

Both are one-constant client changes; **move the client, never the server** (a
server tick-rate change would shift every seconds→ticks conversion — day cycle,
respawn, regen — by 1 % for no design reason).

- `INPUT_TICKRATE: 33` → `1000/30` (33.333). Stops the client over-feeding the
  input queue → the 10 % eviction and ~66 ms of standing-input latency go away.
- The interpolation duration `SERVER_TICKRATE: 33` → `1000/30`. Now the lerp
  window matches the true 33.333 ms inter-snapshot interval → the per-tick
  micro-freeze disappears. (Both are labelled "SYNCED WITH BACKEND" in
  `BasicConfig.ts`; 33 was simply the rounded value — this corrects the rounding.)

Small, no balance impact, independently justified by the measured eviction. It
removes the *per-tick* micro-freeze but **not** network arrival jitter — that
needs Lever B.

### Lever B (durable): buffered render-delay interpolation

Replace the reactive chase with the standard action-game scheme:

- Keep a short **buffer** of the last few snapshots (position + server time).
- Render the world a fixed **render delay** in the past (≈ 1–2 snapshot intervals,
  sized from measurement — see chunk 1).
- Each frame, interpolate at **constant velocity between the two known snapshots
  that bracket `now − renderDelay`.**

Arrival jitter *within* the buffer window becomes invisible, because the next
snapshot needed for the lerp is already in hand — the character moves at steady
velocity regardless of when packets actually landed. This is the downstream
analog of the held-state input fix: absorb the jitter instead of reacting to it.

**Tradeoff:** a fixed render delay adds visual latency (you see the world ~N ms in
the past). For a **PvE, no-prediction, no-PvP-for-5-years** game this is the
correct, standard choice (WoW-lineage): everything — your character, mobs, aura
rings — is delayed by the *same* amount, so the relative geometry you position
against stays consistent, and aura application is continuous server-side. The
current scheme already carries ~33 ms + queue latency; a bounded, *consistent*
delay reads smoother than the current inconsistent freezes.

## Chunking

**Chunk 1 — instrument snapshot arrival (measure first, PO precedent).** Add
client-side logging of inter-snapshot **arrival intervals** (p50/p95/p99/max),
alongside the existing `Develop.logClientTickRate`. Play ~10 min live (solo and
loaded). The **p99 arrival gap sizes the render delay / buffer depth** — same
discipline as the input-jitter histogram. Cheap, no behaviour change.

**Chunk 2 — rate alignment (Lever A).** Land after the chunk-1 baseline is
captured (changing `INPUT_TICKRATE` shifts the arrival pattern, so measure first).
Independently ships the eviction fix + per-tick-freeze fix.

**Chunk 3 — buffered interpolation (Lever B).** Render delay = measured p99 (expect
~2 snapshots ≈ 66 ms). Preserve the existing **teleport snap**
(`TELEPORT_SNAP_DISTANCE_PX_SQUARED`) — Recall/dash must still jump, not glide
through the buffer. Applies uniformly to all interpolated entities (players, mobs).

## When this solution could itself become a problem

Carrying forward the honesty pass the PO asked for on the input-jitter plan:

1. **Added visual latency.** Rendering ~66 ms in the past is invisible in PvE but
   would need *local-player client prediction* to hide if PvP/twitch aiming is
   ever added. Buffered interpolation is the correct substrate for that (predict
   self, interpolate others), so it doesn't foreclose it — flag for whoever builds
   prediction.
2. **Buffer underrun on sustained packet loss.** If snapshots stop for longer than
   the buffer, the character freezes (bounded, rarer than today). Policy: **freeze,
   do not extrapolate** — extrapolating a walking character guesses it into walls/
   auras. Same "bounded stop, never wrong-guess" stance as the input coast.
3. **Render-delay depth is a latency↔smoothness knob.** Too deep = laggy, too
   shallow = jitter leaks through. Sized from the chunk-1 p99 and documented with
   its "why", not a bare constant — same rule as `maxHoldTicks`.
4. **Teleport/snap interplay.** The buffer must be bypassed for authoritative jumps
   (Recall, dash, respawn) or they'd smear. The existing teleport-snap guard covers
   this; any new jump source must opt out too.
5. **Uniform delay on everything.** Aura ring positions, nameplates, damage numbers
   all render at the delayed position — consistent (good), but means a future
   "instant" VFX must anchor to the *rendered* (delayed) position, not the raw
   snapshot, or it will lead the entity.

None is unbounded or silent once documented — the same bar as the input-jitter
plan. Honest ceiling: still **server-authoritative without prediction** — correct
for PvE, and the right base to extend from if prediction is ever needed.

## Verification

- `tsc --noEmit` clean; webpack prod build clean.
- Headless smoke (`verify` skill): movement still tracks, teleport/Recall still
  snaps, no console errors.
- **Live re-measure is the acceptance test:** chunk-1 arrival-jitter numbers before
  and after; PO confirms the walking micro-resets are gone; eviction / `q_mean`
  back to ~1.0 after Lever A.

## Open questions

1. **Render delay** — deliberately unset; from chunk-1 p99. Expect ~1–2 snapshots.
2. **Buffer depth vs. delay** — a 2-snapshot buffer with a 1-snapshot render delay
   is the usual minimum; confirm against the measured jitter.
3. **Does Lever A alone suffice for the felt jitter?** — possible if the PO's link
   is low-jitter and the per-tick 33/33.333 mismatch was the dominant cause. The
   chunk-1 measurement answers it: if arrival jitter is small, ship Lever A and
   defer Lever B; if arrival jitter is the driver, Lever B is required.
   **Answered: no** — the PO reported still-visible jitter with only the per-tick
   component addressed, so both levers shipped together.

## Ledger — DONE 2026-07-24

**Chunk 1 — instrumentation (`0e504c22`).** Dev-gated `[snapshot-arrival]`
console line: GameState→GameState arrival intervals, p50/p95/p99/max, one summary
per 300 snapshots (~10 s at 30 Hz). Deliberately **snapshot-only** — the existing
`serverTickRate` dev line measures time-since-ANY-message and is corrupted by
interleaved EntityMessage/Pong traffic. New `IDevelop.logSnapshotArrival`, a
per-object arrival tracker in `_Develop.ts`, and one call in the `GameState` case
of `Backend.receive` under the existing `Develop.isActive()` gate.

**Measurement (the whole point).** localhost read mean **30.3 ms** — which looked
like an anomaly (server is coded 30 Hz = 33.3 ms; the send path in `core/net.go`
is provably one GameState per tick). Live (`&develop`, ~10 min) read mean **33.3
ms**, exactly the true rate ⇒ **the 30.3 was a loopback artifact**, and the live
number *confirmed* Lever A's constant rather than overturning it (the opposite of
how the input-jitter measurement overturned TCP-HoL). Live distribution: p50 ~33.3,
p95 ~39–40, **p99 ~40–43**, max mostly 41–52 with a lone 72.7 ms outlier. That p99
sized the render delay.

**Lever A — rate alignment (`8a29a75c`).** `INPUT_TICKRATE` + `SERVER_TICKRATE`
`33 → 1000/30` (33.333) in `BasicConfig.ts`. Kills the per-tick 33-vs-33.3
micro-freeze and the 10 % input-queue eviction (client was running 30.303 vs 30.0
Hz). Client-only — never move the server tick rate. Contained surface confirmed:
the two constants feed only a `Tock` interval, one `Math.round` count in
`VitalSigns`, and the lerp.

**Lever B — buffered render-delay interpolation (`c5064732`), all in
`_GameObject.ts`.** Replaced the reactive un-buffered chase in
`moveInterpolatedObjects` with the standard scheme: each snapshot stored as
`{x, y, t: receiveTime}` in a per-object `positionBuffer`; every frame render at
`now − RENDER_DELAY_MS` (`RENDER_DELAY_TICKS = 2` × `SERVER_TICKRATE` ≈ 66.7 ms),
lerping between the two bracketing samples. Design points settled while writing:
- **Render delay must be ≥ the late-arrival gaps.** 1 tick (33 ms) would underrun
  on any gap >33 ms — ~half of them (p50 is 33.3) — so 2 ticks is the measured
  minimum that covers the p99 (42) with margin (only the rare >66 ms max, e.g.
  72.7, underruns by a bounded ~6 ms). `RENDER_DELAY_TICKS` is the documented
  smoothness↔latency knob.
- **Restart-from-idle seed.** The dedupe (skip identical server positions) makes a
  stationary entity stop producing samples and settle (buffer cleared, removed
  from the interpolation set). Without care the next move would *jump* to the new
  sample. Fix: when `setPosition` runs with an empty buffer, push a synthetic left
  anchor at the current rendered position timestamped `now − RENDER_DELAY_MS`, so
  the very next frame renders exactly where the object already is and ramps up
  smoothly. Verified in the smoke (smooth position continuity across `buf: 0`
  transitions).
- **Underrun policy: freeze at newest, never extrapolate** (a walker would be
  guessed into walls/auras) — the downstream analog of the input coast's bounded
  stop.
- **Teleport bypass preserved.** A delta beyond `TELEPORT_SNAP_DISTANCE_PX` clears
  the buffer and sets `shape.position` directly; the next ordinary sample
  re-seeds from the destination. Compared against the last known *server* position
  (newest sample), not the render-lagged `shape.position`.
- Uniform on players and mobs; the local player too (no prediction — the +~66 ms
  render latency is the documented PvE tradeoff, and the correct substrate for
  future self-prediction).

**Verification.** `tsc --noEmit` + webpack prod exit 0. Headless smokes had to
**shim `requestAnimationFrame` onto `setTimeout`** — a hidden Playwright page
throttles rAF to ~6 fps, which starves the `PrerenderEvent` render loop and makes
*any* interpolation look frozen (this initially read as a bug; the rAF probe
showed 6 fps and the shim fixed it). With the shim: movement tracks **414 px**
smoothly with the buffer trimming/settling to 0 (not pegged), teleport (`WARP`)
snaps **7460 px** and settles, 0 new console errors (pre-existing `null.split`
filtered). Deployed to `aura-game.duckdns.org` on an empty server (pid 54025,
bundle `main.ec3610404a…`, boot 5 campfires / 14 npcs, 0 panics).

**Outstanding (acceptance).** PO live re-feel of the walking smoothness AND the
+66 ms latency judgement; a fresh `[snapshot-arrival]` p99 + eviction/`q_mean`
re-measure (expect eviction back to ~0 / `q_mean` ~1.0 after Lever A). If the
latency reads laggy, drop `RENDER_DELAY_TICKS` to 1. All numeric values here are
[PLACEHOLDER] pending that pass.
