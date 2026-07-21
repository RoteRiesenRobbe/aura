# Capacity / load testing

A headless bot swarm that joins over the real WebSocket + FlatBuffers protocol
and sends `Input` at the true 30 Hz, plus a server-side tick profiler. Use it to
answer "how many concurrent players can this box hold before the game loop can't
keep 30 Hz".

## Pieces

- `backend/cmd/loadbot/` — the bot swarm. Ramps population through steps and
  prints, per step, the server tick percentiles (if `-stats` is reachable) and
  client-side `snapshots/sec/bot` + `kB/s/bot`.
- `backend/cmd/aurad/profile.go` + `-profile :6060` — serves `net/http/pprof`
  and `/tickstats` (p50/p95/p99/max of per-tick wall-clock vs the 33 ms budget).
  **Off unless `-profile` is passed** — production never binds it.
- `backend/pkg/aura/core/tickstats.go` — the 8192-sample ring behind `/tickstats`.

## The break signal

- **Local** (you control the server): watch `p95` in `/tickstats`. Past ~33000 µs
  the loop is over budget.
- **Live / remote** (no profiler on the deployed binary): watch `snap/s/bot`.
  A healthy loop delivers a full **30.0**. Below that = the loop is falling
  behind (25 ≈ −17 %, 14 ≈ half speed). `dropped` connections = clients evicted
  under send-buffer backpressure.

## Security — do NOT automate `-profile`

`-profile` serves pprof **with no authentication**. Reaching it lets anyone read
internal state (heap dumps can contain in-memory secrets like the cheat token)
and `/debug/pprof/profile` is a cheap DoS. Rules:

- **Never add `-profile` to `devops/aurad.service` or any always-on startup.** It
  is a hand-typed flag for a one-off capacity run, gone on the next restart.
- On the live box the firewall only opens 22/80/443, so :6060 is already
  unreachable externally — but if you ever run a test *on* the box, bind
  localhost as belt-and-suspenders: `-profile localhost:6060`.
- Production/default never binds it; leaving it off is the safe state.

## Local run (with profiler)

```shell
cd backend
make build
./aurad -content ../api -profile :6060 &        # profiler on :6060

# ramp clustered (worst case — everyone on the spawn campfires):
go run ./cmd/loadbot -steps 25,50,100,200,400 -hold 40s

# ramp dispersed (players spread across the world — cheapest case):
go run ./cmd/loadbot -disperse -steps 50,100,200,400 -hold 40s
```

## Live run (client-side signal only)

No profiler on the deployed binary, so pass `-stats ""` and read `snap/s/bot`.
**Only when the server is empty** — a ramp-to-break makes the loop stutter for
any real players, and a crash wipes characters (no persistence).

```shell
cd backend
go run ./cmd/loadbot -scheme wss -addr aura-game.duckdns.org:443 -stats "" \
  -disperse -steps 20,40,60,80,100,120 -hold 30s   # spread out
go run ./cmd/loadbot -scheme wss -addr aura-game.duckdns.org:443 -stats "" \
  -steps 20,40,60,80,100,140 -hold 30s             # clustered (default)
```

## Key flags

| flag | default | meaning |
|---|---|---|
| `-addr` | `localhost:2000` | server host:port |
| `-scheme` | `ws` | `ws` local, `wss` live |
| `-steps` | `25,50,100,200,400` | bot counts to ramp through |
| `-hold` | `40s` | measurement window per step |
| `-settle` | `8s` | wait after ramping before measuring |
| `-dialrate` | `8` | dials/sec — keep well under 30 (server accepts 1 join/tick) |
| `-disperse` | off | walk a fixed heading (spread out) vs circle in place (cluster) |
| `-stats` | `http://localhost:6060/tickstats` | set `""` for remote/live |

## Results — 2026-07-22

Live box `aura-game.duckdns.org` (Hetzner, empty server), walking bots (no combat):

- **Spread across the world: 120+ held a full 30 Hz** — ceiling not reached. The
  open world is cheap; each viewport is nearly empty.
- **All clustered on one spot: edge at ~80, breaks 80→100** (30.0 → 25.9 snap/s),
  half-speed by 140. This is the O(players²) case — overlapping viewports blow up
  both per-player snapshot encoding *and* bandwidth (~180 Mbit/s out at 100).
- Real players also *fight* (bots don't), which drives the SkillSystem, so shave
  the clustered ceiling to **~50–70 real players mobbing one boss**.

Local Ryzen 5 3600 for reference: clustered comfortable to ~100, broken by 200;
dispersed holds to ~450.

## The wall (and how to move it)

The bottleneck is **single-threaded per-player GameState encoding on the game
loop** — a fresh FlatBuffers builder per player, full skill component re-encoded
every tick, no delta. So one core is the ceiling and a second vCPU barely helps.
To raise it (cheap → structural): faster single-core VPS → pool/reuse builders +
stop re-encoding static skill data → delta/shared snapshot encoding (encode each
visible entity once/tick, reuse across viewers).
