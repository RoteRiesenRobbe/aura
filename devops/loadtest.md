# Capacity / load testing

A headless bot swarm that joins over the real WebSocket + FlatBuffers protocol
and sends `Input` at the true 30 Hz, plus a server-side tick profiler. Use it to
answer "how many concurrent players can this box hold before the game loop can't
keep 30 Hz".

## Pieces

- `backend/cmd/loadbot/` — the bot swarm. Ramps population through steps and
  prints, per step, the server tick percentiles (if `-stats` is reachable) and
  client-side `snapshots/sec/bot` + `kB/s/bot`.
- **Skill mode** (`-token` + `-skills` / `-warp` / `-god`) — brings each bot up
  with a real loadout and drops it into a mob field, so the aura sensor, the
  broadphase cost that sensor drags in, and the SkillSystem are all in the
  measurement. Without it a bot's aura sensor stays at **radius 0** and none of
  that is paid — see "What the walking-bot numbers miss" below.
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
| `-token` | — | cheat token; the `?token=` value from the game URL, i.e. a line of the server's `tokens.list`. Required by the four flags below |
| `-skills` | — | comma-separated registry names to grant + equip, e.g. `Damage`. IDs resolve at runtime from `GET /skills` |
| `-warp` | — | `x,y` world coords to drop bots at. **1-unit granularity** — `WARP` integer-divides by 120 (`sys/cmd/cmd.go:76`) |
| `-warpjitter` | `3` | spread bots ±N units around `-warp` so they don't stack on one point |
| `-god` | off | godmode the bots. **Use whenever `-warp`ing onto mobs** — otherwise bots die, never send `Respawn`, and rot as spectators while `connected` still counts them |
| `-skilllevel` | `0` (= level 1) | drive every granted skill to this level, clamped per skill `maxLevel`. Pass `99` to max everything. Cheats `XP 100000000` first, since points are derived from player level (level−1, one per level, capped at 30 ⇒ **29 points**) |
| `-cast` | off | how often each bot requests activation of **every** equipped cooldown slot. The server drops slots that are empty or still counting down, so this is a fair stand-in for a player mashing the keys. Nothing else ever fires a player cooldown |

### Reading skill-mode output

Each step adds a line like:

```
(setup sent 100/100, activations 100, auras CONFIRMED LIVE 100/100 | mobs/viewport 13.5, aggroed 12.9)
```

- **`auras CONFIRMED LIVE`** is the one that matters. A rejected cheat token is
  *silent on the wire* — the server logs and drops it (`sys/cmd/cmd.go:296`),
  the client is never told. This counter is read back from each bot's own
  `GameState.ActiveAuraSlot`/`AuraSlots`, so it is the only proof the loadout
  stuck. `setup sent` only proves the bytes left the client. **If this reads
  0/N, the run measured nothing and the numbers are a walking-bot run.**
- **`aggroed`** — a mob reports non-zero `aura_radius` only once it has aggroed
  (`server.fbs:161`), so this is the proof combat is actually running.
- With `-skilllevel` / `-cast` a second line appears, read back the same way out
  of each bot's own `GameState`:

  ```
  (per bot: passives 3.00, cooldowns equipped 3.00, on-cooldown 2.60, points spent 28.0 | casts requested 300)
  ```

  **`points spent`** is the honest check that the spends landed — it is the
  server's own `sum(level−1)` over the spellbook. **`on-cooldown`** counts slots
  with a non-zero remaining timer, i.e. the proof the cooldowns actually *fired*
  rather than just sitting equipped. Equip and spend are as silent on rejection
  as the cheat token is.
- Compare mob census between an aura run and its control. They will **not**
  match: auras kill mobs (census falls), a control doesn't (census climbs).

## Live run with combat

```shell
cd backend
# aura run
go run ./cmd/loadbot -scheme wss -addr aura-game.duckdns.org:443 -stats "" \
  -steps 20,40,60,80,100,140 -hold 30s \
  -token "$TOKEN" -skills Damage -god -warp "38,31"
# control: same spot, same mob contact, no aura
go run ./cmd/loadbot -scheme wss -addr aura-game.duckdns.org:443 -stats "" \
  -steps 20,40,60,80,100,140 -hold 30s -token "$TOKEN" -god -warp "38,31"
```

`(38,31)` is the densest spawn cluster in `world.json` (16 spawns in a 10×10
box). Bots do not need to be placed *on* a spawn — mobs aggro and close the
distance themselves.

### Max build

Everything a level-30 character can carry at once — 3 auras, 3 passives,
3 cooldowns, all maxed, cooldowns mashed. `-settle 15s` because bring-up is
~50 spaced messages per bot (grant ×9, XP, spend ×28, equip ×9, warp):

```shell
go run ./cmd/loadbot -scheme wss -addr aura-game.duckdns.org:443 -stats "" \
  -steps 20,40,60,80,100,140 -hold 30s -settle 15s \
  -token "$TOKEN" -god -warp "38,31" \
  -skills "Suppression,Damage,Wildfire,Swift,Strong,KeenEye,NovaBurst,DamageBurst,Barrier" \
  -skilllevel 99 -cast 2s
```

Two things bound how much build is reachable, and neither is the harness:
**3 slots per category** and **29 skill points** at the level cap (this loadout
spends 28). Back-to-back runs are safe — a still-stashed bot name gets mangled
rather than rejected — but leave a gap for mobs to respawn, or the second run
fights a thinner field (see the 2026-07-22 evening results).

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

## Results — 2026-07-22, with combat (supersedes the clustered row above)

Same live box, empty server. `snap/s/bot`, clustered in all three columns:

| bots | walking bots, empty spawn | +mob field, no aura | +mob field +Damage aura |
|---|---|---|---|
| 20 | 29.8 | 30.0 | 30.0 |
| 40 | 30.0 | 30.0 | 30.0 |
| 60 | 30.0 | 30.0 | 30.0 |
| 80 | 30.0 | 27.6 | 26.8 |
| 100 | 28.7 | 19.7 | **17.1** |
| 140 | 14.8 | 9.9 | **8.9** |

**The clustered ceiling is ~60–70, not ~80.** 60 holds a full 30 Hz in every
configuration; 80 is already off it once mobs are involved; 100 is badly
degraded. The old "shave to ~50–70 real players" caveat was a guess — it is now
measured, and it was about right.

### What the walking-bot numbers miss

Two structural gaps, in order of size:

1. **No mobs.** The old clustered run parked bots on the spawn campfire, an
   empty village. Putting them in a mob field costs more than the auras do:
   28.7 → 19.7 at 100 bots. MobSystem AI, aggro, and pathing for ~25–35 aggroed
   mobs per viewport is the larger share.
2. **Aura sensor radius 0.** A fresh bot owns nothing (`player.go:742-751`) and
   its aura sensor is built at radius 0 (`player.go:77-82`); `SetRadius` is only
   ever reached while an aura is active (`skills.go:150-153`). So a walking bot
   contributes a zero-size AABB to the broadphase. A real player's sensor fans
   across grid cells and `bruteIntersectShapes` is O(n²) per cell
   (`phy/space.go:80-133`) — paid every tick by PhysicsSystem, not by the
   SkillSystem, and paid regardless of `tickInterval`.

The aura column is an **understatement**: the aura run's mob census *fell*
(20.7 → 11.1 per viewport, the auras were killing them) while the control's
*climbed* (21.9 → 35.2, nothing killed anything). The aura run was slower while
fighting fewer mobs.

Caveat on precision: two control runs at 100 bots gave 21.5 and 19.7, so
run-to-run noise is ~1.8 snap/s. The aura delta at 100 (17.1 vs 19.7–21.5) is
above that but not hugely — treat "auras cost something" as solid and the exact
size as approximate.

### Not yet measured

Damage L1 only, one aura slot, no passives, no cooldowns, no skill levels. Aura
radius scales with skill level and a bigger radius means more broadphase cells,
so a maxed-out build should cost more than this. Player-vs-player auras never
apply (PvP-off rests entirely on `targetsAllies: false`, `skills.go:444-450`),
so clustered bots never damage each other — only mobs.

## Results — 2026-07-22 evening, after the idle-alloc fix `fe0044d0`

Same live box, empty server, same spot `(38,31)`, clustered. Two ramps
back to back, 30 s hold. Run A repeats the morning's aura column verbatim so
the fix can be read off directly; run B is the heaviest build a level-30
character can legally carry.

| bots | A: Damage L1 (pre-fix, morning) | A: Damage L1 (post-fix) | B: max build |
|---|---|---|---|
| 20 | 30.0 | 30.0 | 30.0 |
| 40 | 30.0 | 30.0 | 30.0 |
| 60 | 30.0 | 30.0 | 29.8 |
| 80 | 26.8 | **28.7** | **18.8** |
| 100 | 17.1 | **20.7** | **11.1** |
| 140 | 8.9 | **10.1** | 5.2 |

**The fix bought headroom past the knee, not a higher ceiling.** +7 % at 80,
+21 % at 100, +13 % at 140 — real, but at 100 bots it is only about 2× the
~1.8 snap/s run-to-run noise measured in the morning, so treat the size as
approximate. Everything at or below 60 was already a full 30 Hz before and
still is. **The clustered ceiling stays ~60–70.** That is the expected shape:
the fix removed *allocation*, and past the knee the loop is bound by
single-threaded snapshot encoding, which it did not touch.

### Run B — the max build

```
Suppression L5 (active) + Damage L5 + Wildfire L5     3 aura slots
Swift L3 + Strong L5 + KeenEye L5                     3 passive slots
NovaBurst L3 + DamageBurst L3 + Barrier L3            3 cooldown slots, mashed every 2 s
```

28 of the 29 available skill points, confirmed live on every bot
(`points spent 28.0`, `passives 3.00`, `cooldowns equipped 3.00`,
`on-cooldown ~2.6–2.9`). Suppression is the active aura on purpose: at L5 its
radius is **3.0**, the largest any player aura reaches, and radius is what
drags the broadphase. Only one aura is ever active — that is the design, not a
harness limit — so three equipped auras cost little beyond the one that is on.

**A fully built raid is roughly one step worse than the L1 baseline**: 80 bots
drops from 28.7 to 18.8, 100 from 20.7 to 11.1. **Ceiling for maxed players:
~60.**

That comparison is *conservative*. Run B fought a **thinner** mob field than run
A (9–12 mobs/viewport vs 16–21) because run A had just killed them and 60 s of
cooldown was not enough for the ×2 respawn timers. Less work, and still slower.

### Server-side during the ramps

`/proc` on the live box, sampled every 20 s:

- CPU peaked at **147 % of one core** (run A) and **136 %** (run B) — i.e. ~70 %
  of the 2-vCPU box. **It never saturated.** The loop cannot spend the second
  vCPU; the surplus is websocket write goroutines. This is the wall below,
  visible from the outside.
- RSS 29 → 51 MB across both ramps; back to 45 MB idle afterwards.
- Worst tick observed: `Overload! Systems at: 772%` ≈ 255 ms for a 33 ms budget.
- No panics, no OOM, no dropped connections. Back to ~21 % of a core idle with
  0 overloads once the bots left.

## Results — 2026-07-26, after the encoding + grid fixes and mob separation

Same live box, same spot `(38,31)`, clustered, same two ramps. Deployed build:
everything through `8b045395` (mob soft separation) plus the then-uncommitted
mob-regen retune; measures the net of `6f1fc64c` (snapshot-vector fix on the
encoding bottleneck + grid-floor fix in the broadphase) against the added
per-mob separation work.

**⚑ Measurement caveat that owns this table:** the network path to the box was
degraded this evening — a *flat* 27.3 snap/s floor at 20–60 bots where the
server logged **zero** over-budget ticks, while the identical harness against a
local server read a clean 30.0. The deficit is constant across populations
(binds even at 2.5 MB/s total), i.e. multiplicative, so the corrected column
divides by 0.91. Check the floor against a local control before trusting any
future live run's absolute numbers.

| bots | A: Damage L1 (07-22 post-fix) | A: today (corrected) | B: max build (07-22) | B: today (corrected) |
|---|---|---|---|---|
| 20 | 30.0 | 27.3 (30.0) | 30.0 | 27.3 (30.0) |
| 40 | 30.0 | 27.3 (30.0) | 30.0 | 27.3 (30.0) |
| 60 | 30.0 | 27.3 (30.0) | 29.8 | 26.7 (29.3) |
| 80 | 28.7 | 26.4 (29.0) | 18.8 | 15.2 (16.7) |
| 100 | 20.7 | 18.8 (20.7) | 11.1 | 9.6 (10.5) |
| 140 | 10.1 | 9.6 (10.5) | 5.2 | 4.5 (4.9) |

**No measurable change — the clustered ceiling stays ~60–70 (L1) / ~60
(maxed).** Run A corrected is baseline to the decimal at 100 bots. Run B is
5–11 % below baseline past the knee — inside the confounds (its mob field was
thin and refilling, census 7.1→14.1 with only 5–6.5 aggroed, and the network
correction is approximate), but if any of it is real, mob soft separation is
the likely payer: ~15 aggroed mobs per viewport now run a dynamics query per
tick while chasing. Worst tick 809 % (~267 ms) vs 772 % on 07-22 — same
magnitude. Idle after the ramps: ~18 % of a core, RSS 51 MB, no panics.

This is the expected shape, same as the alloc fix: the encoding fix removed
*waste* (4n bytes + an alloc per player-tick) but not the *structure* — the
loop still fully re-encodes per player per tick, single-threaded — and the
grid-floor fix mainly de-fattened the origin cell, which the `(38,31)` test
cluster never touches. Moving the wall still means the structural list below.

Harness note: `GET /skills` now wraps the catalog (`{"curve":…,"skills":[…]}`,
round-4 tooltip work); loadbot's `resolveLoadout` was updated to match in this
session — an old loadbot binary dies at startup with a JSON unmarshal error.

## The wall (and how to move it)

The bottleneck is **single-threaded per-player GameState encoding on the game
loop** — a fresh FlatBuffers builder per player, full skill component re-encoded
every tick, no delta. So one core is the ceiling and a second vCPU barely helps.
To raise it (cheap → structural): faster single-core VPS → pool/reuse builders +
stop re-encoding static skill data → delta/shared snapshot encoding (encode each
visible entity once/tick, reuse across viewers).
