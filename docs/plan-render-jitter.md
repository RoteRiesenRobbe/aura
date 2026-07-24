# Plan: Walking micro-resets → buffered snapshot interpolation

**Status:** **PLANNED 2026-07-24 — not started.** Spun out of the input-jitter
fix (`docs/plan-input-jitter.md`): once the input path was made clean (0 browser
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
