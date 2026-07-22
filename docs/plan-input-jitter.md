# Plan: Dropped Movement Inputs (live jitter tolerance)

**Status:** **PLANNED 2026-07-22 — not started.** Opened from a live PO report:
*"I wanted to walk but kept stopping. It wasn't delayed or sluggish, just that
sometimes my movement keys did not register somehow."*

**PO rulings (choice prompts, 2026-07-22):** instrument **first**, fix after
reading real numbers; the client/server input-rate mismatch is **in scope**,
but planned before it is touched.

## The report and what it is not

Session window 19:31–19:54 UTC on `aura-game.duckdns.org`. Over those 23
minutes the server logged **10 overloaded ticks** (103–133 %, single ticks
stretching to 34–44 ms). The 7 330 overloads visible in the 6-hour journal are
almost entirely the 17:11–17:20 `loadbot` ramps (peaks to 681 %).

⇒ **The simulation was healthy while the stopping happened.** This is not the
overload story from `plan-intermission-triage.md` §Idle-loop allocation fix.
The problem is in the **upstream input transport**.

Incidentally this is also the first live data point for that fix's open watch
item: ~10 overloads in the 87 minutes 18:16–19:43 **with a player online**,
against the pre-fix rate of ~10–30/h with the server **empty**. Encouraging,
still not the full day of logs that item asks for.

## Diagnosis

The input path tolerates **exactly 3 ticks (~100 ms)** of upstream gap, and
past that it does not delay movement — it **deletes** it.

| Site | Fact |
|---|---|
| `model/client/client.go:192` | the per-client input channel is **2 deep** |
| `core/input.go:60` | `Update` calls `NextInput()` **once per player per tick** — no drain, no catch-up |
| `core/input.go:90` | `pickInput` bridges a starved tick with the last movement **only once** (`delete(i.lastMove, id)` on use) |
| `model/client/client.go:113` | on overflow `pushInput` **evicts the oldest** to hold the queue at 2 |

From a saturated queue, when inputs stop arriving:

| tick | behaviour |
|---|---|
| T | consume queued input — moves |
| T+1 | consume queued input — moves |
| T+2 | starved → bridged — moves |
| T+3 | starved, bridge spent → `nil` → **stands still** |

Recovery is the damaging half. When the gap ends and (say) 9 backed-up inputs
arrive together, `pushInput` evicts down to 2 and **7 are discarded** — seven
ticks (~230 ms) of walking silently deleted, never replayed. The character does
not catch up. That is exactly "not sluggish, the keys just didn't register".

**Suspected trigger: TCP head-of-line blocking.** One lost upstream packet on
WSS stalls every input behind it for a retransmit timeout (~200–300 ms), well
past the 100 ms budget. At 30 inputs/s even 0.1 % loss yields one such stall
roughly every 30 s. Localhost has no loss, which is why this has never been
seen in dev.

**Competing hypothesis: client-side main-thread stalls.** `Controls.update`
runs on a Tock timer (`Controls.ts:72`, `INPUT_TICKRATE 33`). On a stall Tock
advances past the missed ticks and replays only **one** of them
(`tocktimer/tock.js:53`), so a render hitch also eats inputs. Chunk 1 is
designed to tell these two apart — see the discriminator below.

## Two incidental findings

1. **The client outruns the server by 1 %.** `INPUT_TICKRATE: 33`
   (`BasicConfig.ts:100`), drift-corrected by Tock, is 30.303 Hz. The server
   ticker is `time.Second / 30` = 33.333 ms = 30.0 Hz (`core/game.go:218`). The
   queue therefore sits permanently saturated, costing ~66 ms of standing input
   latency. **In scope, chunk 3.**
2. **The `pickInput` comment is wrong-signed.** `core/input.go:82` reasons
   about "~0.1 % clock drift starves the queue … once every 30 s". The real
   mismatch is 1 % in the opposite direction: a full queue that silently
   evicts. Rewrite it with chunk 1.

Also noted, **out of scope**: `stepMillis = 33.0` (`core/game.go:434`, and
`sim/world.go:30`) is what the simulation integrates and what the overload
threshold is measured against, while the ticker advances 33.333 ms of wall
time. The world therefore runs ~1 % slow in real time. Pre-existing, well
inside [PLACEHOLDER] noise, and every seconds→ticks conversion in the game
(`TotalDayCycleTicks`, respawn timers, the 1 %/s regen) assumes exactly 30 —
so this is deliberately **not** touched here. Flagged for the record.

---

## Chunk 1 — Instrumentation (measurement only, zero behaviour change)

Prove the diagnosis and **size the coast window** from real numbers before
changing any behaviour. Eviction is currently invisible: `log.Print("Input
dropped.")` (`client.go:134`) only fires on a rare double-race, so the 72
"dropped" lines in the live journal are all equip/skill-point spam from the
17:19 loadbot run. The live logs today cannot confirm or deny input loss.

### Counters

Per player, following the existing `TickStats` pattern (`core/game.go:453`,
`devops/loadtest.md`):

| counter | site | what it answers |
|---|---|---|
| `starved` | `pickInput`, `fresh == nil` | how often the queue runs dry |
| `bridged` | `pickInput`, bridge used | gaps currently covered |
| **`stalled`** | `pickInput`, starved with no bridge | **the symptom count** — ticks the character stood still |
| **`evicted`** | `pushInput` overflow | **the lost-movement count** |
| starve-run histogram | `pickInput` | **sizes `maxCoastTicks`** — buckets 1 / 2 / 3 / 4–6 / 7–9 / 10–15 / 16+ ticks |
| queue depth on arrival | `pushInput` | confirms or refutes the saturation prediction from finding 1 |

### Constraints

- **Zero allocation per tick.** The idle-alloc fix (`fe0044d0`) left
  `*_alloc_test.go` pins asserting `AllocsPerRun` is **zero**, not "cheap".
  Fixed-size arrays for the histogram, no maps, no `fmt` in the hot path. The
  new counters must keep those pins green — this is the main landmine in the
  chunk.
- `pushInput` runs on the client's read goroutine, `pickInput` on the tick
  goroutine ⇒ the eviction counters live on the `client` struct as
  `atomic.Uint64`. No locks.
- **Journal quiet when idle.** Summary line only while a player is connected
  and only when a counter is non-zero, plus a final line per player on
  disconnect. `plan-playtest-deploy.md` already warns about journal noise.
- No wire change, no content change, no schema regen.

### The discriminator

The same data separates the two hypotheses:

- **Network gap (TCP HoL):** a starve run is followed by a **burst arrival and
  a spike in `evicted`** — the inputs existed, they were stuck, then thrown away.
- **Client-side stall:** a starve run with **no backlog burst and no
  evictions** — the inputs were never produced.

### Test strategy (TDD)

1. Failing test first: drive `PlayerInputSystem.Update` through a synthetic
   starvation pattern (n fresh, m starved, burst of k) and assert
   `starved` / `bridged` / `stalled` / histogram bucket exactly.
2. Failing test first: `pushInput` eviction increments `evicted` and still
   carries one-shot commands forward (the C2 2026-07-17 property must not
   regress).
3. Alloc pin: `AllocsPerRun` stays zero across an `Update` with counters live.

### Measurement protocol

1. Deploy (`devops/deploy.sh`; `ANNOUNCE` first — restarts wipe characters).
2. PO plays ~10 minutes on live, deliberately including sustained walking of
   the kind that felt bad.
3. `ssh root@159.69.148.73 'journalctl -u aurad --since "-20m" --no-pager | grep -v "TLS handshake" | grep inputstats'`

### Decision gate

Read `stalled` (does the symptom count match the felt frequency?), the
starve-run p99 (sizes `maxCoastTicks`), `evicted` (how much movement is being
deleted), and mean queue depth (finding 1). **If `stalled` is near zero the
diagnosis is wrong** and chunk 2 does not happen as written — the investigation
moves to the client.

---

## Chunk 2 — The fix: coast + reconcile

Shape confirmed by chunk 1's numbers; `maxCoastTicks` [PLACEHOLDER] set from
the measured p99 starve run.

1. **Queue 2 → ~16** (`NewClient`) so a burst is buffered instead of evicted.
2. **`pickInput` coasts** up to `maxCoastTicks` consecutive starved ticks
   (instead of exactly 1), counting the coasted ticks per player.
3. **Reconcile on resume:** when fresh inputs return, discard `coasted` inputs
   from the front of the backlog before applying — those ticks were already
   simulated by the coast — then resume 1/tick.

Net: total distance travelled equals **exactly** what the client sent. No lost
movement (unlike today) and no ghost over-travel (unlike a naive longer bridge).

**Properties that must hold, each with a test:**

- The coast carries **movement only** — never replays one-shot commands (aura
  switch, cooldown activation). This already holds (`ActiveAuraSlotNoChange`,
  empty `CooldownActivations`) and matters *more* with a longer window.
- A genuinely disconnected client halts after `maxCoastTicks`, not forever —
  the existing "don't slide forever" guarantee, widened from 1 tick to N.
- **No cheat surface.** The server still applies at most one movement per tick;
  a deeper queue defers inputs, it cannot make a flooding client move faster,
  and the reconcile discard means coasting cannot be double-counted. Worth
  stating explicitly given the `loadbot`/cheat-token posture in
  `devops/loadtest.md`.
- Coasting stops on death (`updateInput` already gates on `Health != 0`).

**Fallback:** if chunk 1 points at client-side stalls instead, the coast is
still the right fix but the reconcile has no backlog to discard — ship
coast-only and skip steps 1 and 3.

---

## Chunk 3 — Rate alignment (PO: in scope, planned first)

Close the 30.303 Hz vs 30.0 Hz mismatch so the queue stops sitting saturated
and the ~66 ms of standing input latency goes away.

**Recommended: move the client.** `INPUT_TICKRATE: 33` → `1000 / 30`
(33.333 ms). Tock's interval is used in plain arithmetic against `Date.now()`
and drift-corrects, so a fractional interval is fine. Residual mismatch ≈ 0.
**No balance implications** — the server is untouched.

**Rejected: move the server** (`time.Second / 30` → `33 * time.Millisecond`).
It would make the ticker, `stepMillis`, the overload threshold and the client
all agree at 30.303 Hz — but every seconds→ticks conversion in the game
(day cycle, respawn timers, regen) assumes exactly 30 ticks/s, so it shifts
all of them 1 % without a design reason.

Also in this chunk: rewrite the wrong-signed drift comment at `core/input.go:82`.

**Sequencing note:** chunk 3 changes the steady-state queue depth, which is one
of the things chunk 1 measures. Land chunk 3 **after** the chunk 1 measurement
run, or the baseline moves under it.

---

## Open questions

1. **`maxCoastTicks`** — deliberately unset; comes from chunk 1's p99. Expect
   6–10 ticks (200–330 ms) if TCP retransmit is the trigger.
2. **Summary cadence** — per-disconnect only, or also a rolling line every
   60 s while players are online? Rolling is more useful for a PO session that
   never cleanly disconnects; the cost is journal noise. **Recommend both**
   (rolling 60 s, suppressed when every counter is zero, plus a final line on
   disconnect) so the chunk-1 measurement run cannot be lost to a session that
   ends by closing the tab. Not blocking — a new session can start on this
   default and the PO can veto it at the measurement run.
3. **Keep the instrumentation after the fix?** It doubles as the regression
   detector for exactly this class of bug, and `TickStats` set the precedent
   for permanent load instrumentation. Recommend keeping it, quiet by default.

## Verification (both chunks)

- `go build ./...` exit 0 from `backend/`
- `go test ./...` — full suite, plus the new pins and the untouched
  `*_alloc_test.go` allocation pins
- `tsc --noEmit` clean for chunk 3
- boot with `-content ../api`, 0 panics
- live deploy + a PO play session (chunk 1 *is* the play session)
