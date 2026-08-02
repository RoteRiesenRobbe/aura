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
- `backend/cmd/authbench/` — the **credentialed** account path (register/login)
  under concurrency. A different question from the ramp, deliberately kept in a
  different binary: `loadbot` creates an account per bot but only on the
  ANONYMOUS path, which is bcrypt-free by design so that a capacity ramp
  measures the game loop instead of a password hash. See "Auth: the credentialed
  path" below.

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
any real players. ⚑ Check `/players` rather than the log: `curl -s
https://aura-game.duckdns.org/players` answers `{"players":N}` directly, and
grepping journalctl for join lines reports 0 whether the server is empty or your
pattern is simply wrong.

⚑ **A crash no longer wipes characters** — that warning predates step 8a. They
live in Postgres now, so the worst a crash costs is the unsaved autosave window
(~5 min) and systemd restarts `aurad` on its own. The reason to wait for an
empty server is the stutter, not data loss.

### ⚑ Since step 8a: names, and cleaning up after a live run

Two things bite a live run, both new:

- **`-name-prefix` is REQUIRED on live.** Bots default to the reserved `hrnss_`
  prefix, which is grantable only under `-dev`, and the live server does not run
  `-dev`. Without the flag every bot's `POST /api/characters` is refused **400
  "That character name is not available."** and the ramp never gets one socket
  up — which reads as a server refusing connections, not as a naming rule. Pass
  something distinctive and non-reserved: `-name-prefix loadbot_`.
- **Character names are globally unique and PERSISTENT.** Bot names are derived
  from the bot index, so a second run collides with the first run's rows on
  every id. **Clean up between runs**, not just at the end.

Cleanup is `devops/cleanup-loadbots.sql`, run **on the box** (its loopback
connection is what satisfies ruling 10; `harnessdb -cleanup` matches `hrnss_%`
only and will not see these rows):

```shell
scp devops/cleanup-loadbots.sql root@<host>:/tmp/     # ⚑ NOT /root — `postgres`
                                                      # cannot read it there, and
                                                      # psql fails with a lowercase
                                                      # "psql: error: … Permission
                                                      # denied" that an uppercase
                                                      # ERROR grep hides entirely
ssh root@<host> "sudo -u postgres psql -d aura -v ON_ERROR_STOP=1 \
    -v prefix=loadbot_ -f /tmp/cleanup-loadbots.sql"
```

It refuses to delete anything if a matching name belongs to a registered or
multi-character account — the collision risk a non-reserved prefix buys.

```shell
cd backend
go run ./cmd/loadbot -scheme wss -addr aura-game.duckdns.org:443 -stats "" \
  -name-prefix loadbot_ \
  -disperse -steps 20,40,60,80,100,120 -hold 30s   # spread out
# clean up between runs — the names collide otherwise
go run ./cmd/loadbot -scheme wss -addr aura-game.duckdns.org:443 -stats "" \
  -name-prefix loadbot_ \
  -steps 20,40,60,80,100,140 -hold 30s             # clustered (default)
```

### Measured 2026-08-02, 19:03–19:14 UTC — WALKING BOTS, not part of the A/B series

⚑ **Do not compare this table to the numbered runs below.** These are walking
bots with **no `-skills`**, so the aura sensor sits at radius 0 and none of the
sensor / broadphase / SkillSystem cost is paid. It measures the join + movement +
snapshot path only. The skill-mode A/B series (runs 1–3) is further down and is
the thing the ceiling figures come from; this ran ~20 minutes before run 3.

Hetzner CX-class box, client on a WAN link:

| bots | dispersed snap/s | clustered snap/s |
|---|---|---|
| 20–100 | 27.3 flat | 27.1–27.8 flat |
| 120 | 27.3 | — |
| 140 | — | **20.9** |

⚑ **The 27.x plateau is a floor, not degradation.** It is flat from 20 to 120 and
matches nothing about load; a local control on the same build reads **30.0**. It
is client/WAN overhead, and it is exactly why the note above says to take a local
control before trusting a live absolute.

⚑ **`snap/s` is a LAGGING signal, and the server log disagrees with it.** Client
throughput held ~27 all the way to 100 bots while `aurad` was already logging
`Overload! Systems at:` up to **260 %** — the loop goes over budget well before
the clients can tell. If the server is reachable, count overload lines per minute
(`journalctl -u aurad | grep -c Overload`) alongside the ramp; do not read a flat
`snap/s` as headroom. Overload stopped the second the bots left and the service
never restarted.

⚑ **Not comparable to the ~60–70 ceiling on record**, which was a **skill-mode**
run (`-token` + `-skills`). Without them a bot's aura sensor stays at radius 0
and the whole sensor + broadphase + SkillSystem cost is unpaid — see "What the
walking-bot numbers miss". A like-for-like re-measure needs the cheat token.

## Auth: the credentialed path (`cmd/authbench`)

`loadbot` mints a real account per bot, but only the **anonymous** one — a
SHA-256 lookup key, no bcrypt, deliberately, so a ramp measures the game loop.
Register and login, the two calls that actually hash, were therefore unmeasured
on the live box. `cmd/authbench` measures them, and answers the question
`pkg/aura/auth/password.go` leaves open in as many words: *"Revisit against a
measurement on the VPS."*

⚑⚑ **NOT CLEARED FOR LIVE — the 2026-08-02 run broke save games.** Not through
the measurement, through the CLEANUP. Every successful register ends in
`startSession`, so each bot leaves a live server-side session; `authbench` drives
an `http.Client` with no cookie jar, so it discards the session cookie and cannot
log any of them out. Deleting those 251 accounts with `cleanup-loadbots.sql`
while `aurad` kept running left sessions held for accounts that no longer
existed. ⚑ **Every row count reconciled exactly on both sides, which is exactly
why it looked clean** — the damage was in the running process, not the rows.
Another session owns the fix. Until it lands: run `authbench` against a LOCAL
server, and never delete rows underneath a running `aurad`.

```shell
cd backend
go run ./cmd/authbench -addr localhost:2000 -scheme http -name-prefix loadbot_ -n 8  -c 2   # baseline
go run ./cmd/authbench -addr localhost:2000 -scheme http -name-prefix loadbot_ -n 40 -c 20  # gate pressure
```

Each virtual player makes three calls: `POST /api/characters` (no bcrypt — the
**control**, and unavoidable anyway since registration upgrades an existing
anonymous account), then `/api/auth/register`, then optionally `/api/auth/login`.
Having the control in the same run on the same connection is what separates "the
box is slow" from "the gate is queueing".

⚑ **Usernames take `-name-prefix` too**, because `cleanup-loadbots.sql` claims a
bot as *anonymous OR registered under the prefix*. That is a contract between the
two files: a registered bot outside the prefix does not merely survive cleanup,
it lands outside the doomed set, its characters then match the pattern from an
unclaimed account, the guard fires, and **the whole transaction aborts** — one
stray bot strands the entire run's rows.

### Results — 2026-08-02, ~19:53–20:11 UTC, live (2 vCPU Hetzner, 1–2 real players on)

⚑ The numbers below stand — they were measured before the cleanup. What did not
stand is the cleanup that followed them; see the warning above before treating
this run as a template.

| calls | concurrency | control (create) p50 | register p50 | register p95 | max | wall |
|---|---|---|---|---|---|---|
| 5   | 1   | 32 ms  | 229 ms   | 235 ms   | 235 ms   | — |
| 16  | 8   | 93 ms  | 645 ms   | 758 ms   | 758 ms   | 1.4 s |
| 40  | 20  | 111 ms | 1.885 s  | 2.047 s  | 2.05 s   | 4.3 s |
| 150 | 150 | 389 ms | 7.286 s  | 13.709 s | 14.244 s | **14.79 s** |

⭐ **Throughput is flat at ~10.1 registrations/second — 2 slots ÷ 197 ms — and
concurrency does not change it.** The 150-at-once run was predicted at
`150 × 197 ms ÷ 2 = 14.8 s` and measured **14.791 s**, inside 0.1 %. So the wall
for a burst of N is simply `N ÷ 10.1` seconds however they arrive; what
concurrency changes is only *who waits how long*. At 150 the median caller sat
behind ~75 hashes (7.3 s) and the last behind 149 (14.2 s).

⚑ **Under a burst the system does not refuse anyone — it makes them wait,
silently.** All 150 succeeded: 0 refused, 0 busy, 0 timeouts. Combined with the
unreachable 503 below, that means a 150-deep burst gives a real browser **14
seconds of spinner and no feedback**, and nothing sheds load. Degradation is
pure latency, with no back-pressure signal at any layer.

⚑ **The ANONYMOUS path degrades too, and it is not bcrypt.** The control call
went 32 → 111 → 389 ms as concurrency rose; that is the 10-connection pgx pool
(`store.go:50`, `[PLACEHOLDER]`) plus 150 TLS handshakes. Far milder than the
hash queue, but it means an auth burst slows down character creation for players
who are not registering at all.

⭐ **`bcryptCost = 11` costs ~197 ms on the live box, not the ~0.9 s on record.**
229 ms register minus a 32 ms same-connection control. The comment's estimate was
extrapolated from *game-loop work per second* (~3.4× slower than the dev box) and
applied to bcrypt, which is a different workload — the dev box measured 263 ms for
cost 11, so **the VPS is in fact slightly FASTER at hashing than the dev machine**,
not 3.4× slower. The comment flagged itself as "an estimate, not a reading"; the
direction of caution was right and the magnitude was wrong by ~4.5×.

⭐ **Consequence for `DefaultGateSlots = 2`:** the worked example in `password.go`
says *"20 simultaneous fresh logins serialise into ~18 s at one slot against ~9 s
at two"*. Measured, 20 concurrent register calls tail out at **2.0 s**, and 40 at
concurrency 20 drain in **4.3 s wall**. The 2-vs-1-slot trade is real but costs
about a fifth of what it was priced at, which makes **1 slot** (the principled
`GOMAXPROCS-1` bound the comment weighed and declined) considerably cheaper than
it looked — a 20-deep burst would tail at ~4 s rather than ~18 s.

⚑ **The 503 never fires, and the tail does NOT get one.** `Gate.do` returns
`ErrBusy` only when the **caller's** request context is done, and
`cmd/aurad/aurad.go` builds its `http.Server` with no `ReadTimeout`, no
`WriteTimeout` and no `TimeoutHandler` — so `r.Context()` ends only on client
disconnect. A queued caller waits as long as the queue takes; one that hangs up
first has its 503 written into a closed connection. Across 97 live registers:
**0 busy, 0 timeouts, 0 failures.** The overflow path described in the comment is
unreachable in production as deployed. That is not automatically wrong — waiting
2 s beats being refused — but it means the gate's back-pressure is *latency*, not
rejection, and nothing sheds load if a burst ever does get big.

**No measurable game-loop impact, at either size.** Two witness bots held through
two identical windows with the burst fired into the second only:

| burst | control window | during burst |
|---|---|---|
| 40 at c=20 (4.3 s) | 27.2 snap/s/bot | 27.3 |
| 150 at c=150 (14.8 s) | 27.3 snap/s/bot | 27.3 |

⭐ **~15 s of a saturated core did not disturb the 30 Hz loop measurably.** This
is the strongest operational result here: the gate does what it was built for.
A full stall would have pulled the 30-bot average down hard even diluted across
a 30 s window, and nothing moved.

⚑ Both windows sit at ~27.3, not the healthy 30.0 — equal across every A/B so it
does not affect these results, but unexplained, and worth a look before anyone
reads 27 as normal.

⚑ **Name stamps are per-SECOND for a reason.** An earlier minute-resolution stamp
put two runs in the same minute and 5 of 16 bots took `409 name_taken` on
`/api/characters`. That costs no throttle step (only `username_taken` does, in
`handleRegister`) so nothing looks wrong — the run just silently measures a
smaller sample at a lower real concurrency than the flag says.

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

## Results — 2026-07-27, on the 3b-ii build

Same live box, same spot `(38,31)`, clustered, same two ramps, 30 s hold
(run B `-settle 15s`). Deployed binary built 22:40 that evening — the first live
build carrying chunk 3b-ii (the conversation panel), i.e. everything through
`9231c96d`.

**⚑ The 27.3 floor is back, and this time it is proven not to be the server.**
Same flat 27.3 at 20–60 bots as on 07-26, so the corrected column again divides
by 0.91. Two independent checks pin it to the path, not the loop: a local
control run minutes earlier read a clean **30.0** (p95 2.1 ms) on the same
harness binary, and during run A's 20-bot measurement window the box logged
**zero** `Overload!` lines — the first one lands at 22:53:00, after the window
closed. Two evenings apart with the identical figure means this is not weather;
keep dividing it out, and keep checking it against a local control first.

**⚑ Second caveat: the server was NOT empty.** Two real players were on the box
(PO ruling: run anyway). Their load is negligible, but it breaks the
"only when empty" rule the live-run section states — recorded so the table is
not read as a clean-room measurement.

| bots | A: Damage L1 (07-22) | A: 07-27 (corrected) | B: max build (07-22) | B: 07-27 (corrected) |
|---|---|---|---|---|
| 20 | 30.0 | 27.3 (30.0) | 30.0 | 27.3 (30.0) |
| 40 | 30.0 | 27.3 (30.0) | 30.0 | 27.3 (30.0) |
| 60 | 30.0 | 27.1 (29.8) | 29.8 | **22.0 (24.2)** |
| 80 | 28.7 | 25.4 (27.9) | 18.8 | **12.4 (13.6)** |
| 100 | 20.7 | 16.6 (18.2) | 11.1 | 8.4 (9.2) |
| 140 | 10.1 | 8.9 (9.8) | 5.2 | 4.0 (4.4) |

`auras CONFIRMED LIVE` was N/N at every step of both runs, and run B read back
`points spent 28.0`, `passives 3.00`, `cooldowns equipped 3.00`,
`on-cooldown 2.70–2.94` — so both tables are real combat measurements with the
build actually live.

**The L1 ceiling is unchanged at ~60–70. The maxed ceiling moved: 60 no longer
holds 30 Hz.** Run B corrected at 60 is 24.2 against 29.8 (07-22) and 29.3
(07-26) — roughly 3× the ~1.8 snap/s run-to-run noise, and 80 is a further
3 below. Run A is within noise everywhere except 100 (18.2 vs 20.7).

**Two confounds both make run B's deficit an understatement, not an artefact:**
its mob field was thinner throughout (11–13 per viewport, **5.7–6.8 aggroed**,
vs run A's 12–16 and 10–15 — a 90 s inter-run gap is not enough against the ×2
respawn timers, same trap as 07-22), and at 140 the bring-up itself degraded
(`passives 2.76`, `cooldowns equipped 2.61`, `points spent 24.6`), so part of
that row carried a *lighter* loadout than intended.

⚑ **Treat the max-build drop as a regression candidate, not a finding.** It is
the first live run on the 3b-ii build, but run A sitting near baseline argues
against a flat per-player cost, so nothing is pinned on the conversation panel.
Confirming it is cheap and should come first: re-run B alone on an empty server
with a longer respawn gap, before anyone bisects.

Server-side during the ramps: peak **134 % of one core** — never saturated, the
same "the loop cannot spend the second vCPU" signature as every prior run. RSS
37 → 55 MB, back to 22 % of a core and 48 MB idle afterwards. **0 panics, 0 OOM,
0 dropped connections**, and no restart, so no characters were wiped. Worst tick
`Systems at: 957%` (~316 ms) vs 809 % on 07-26 and 772 % on 07-22 — the tail got
worse too.

---

# 2026-08-02 — three runs in one day, in order

⚑ **Read this before the three sections below.** They were originally labelled
"morning / evening / night" and those labels were wrong *and* self-contradictory
— run 1 described itself as happening "this evening" while run 2 called that
same run "the morning run". Everything is now keyed to the clock instead.

**All times are UTC — the live box's clock.** Local (CEST) is +02:00, which is
what git commit timestamps show, so a run recorded at `15:32 UTC` appears as
`17:32 +0200` in `git log`.

| | when | build under test | one-line result |
|---|---|---|---|
| **run 1** | ~14:00 UTC (recorded 15:32) | round-7 stack, binary built 11:47 UTC | the six-week regression: max build never hit 30 Hz at any population |
| **run 2** | 15:38–15:52 UTC | + chunk 0, the XP-curve fix `00bd0549` | both ceilings roughly doubled |
| **run 3** | 19:23–19:33 UTC ⭐ **most recent** | + step 8a, accounts & persistence | ceiling held; memory 3–5× |

⚑ Run 1's exact measurement window is the one soft timestamp here: it is
inferred from run 2's "~100 minutes after" plus its own commit at 15:32 UTC.
Runs 2 and 3 are measured windows.

---

## Results — 2026-08-02 run 1 of 3, on the round-7 build (~14:00 UTC, recorded 15:32 UTC)

Same live box, same spot `(38,31)`, clustered, same two ramps, 30 s hold (run B
`-settle 15s`). Deployed binary built 11:47 UTC (13:47 local) — everything through
`0e161de8`, i.e. the first live perf run carrying the **numbers rewrite, R1–R3,
feel pass N1–N5, the quest system, and all of intake round 7**. Six weeks of
game systems since the last measurement.

**⚑ The path was clean on this run — no 0.91 correction.** A local control
minutes before read a full **30.0** (p95 4.3 ms), and live run A read a full
**30.0 at 20 bots**. Both columns below are raw. This matters for reading run B,
which reads 27.3 at 20 bots: that is the same figure as the old network-floor
artefact, but here it is **not the path** — run A hit 30.0 on the same path,
minutes apart.

**⚑ The server was NOT empty** — two real players on the box (PO ruling: run
anyway), same exception as 07-27. Their load is negligible; recorded so the
table is not read as a clean-room measurement.

`auras CONFIRMED LIVE` was N/N at every step of both runs.

| bots | A: Damage L1 (07-22) | A: 07-27 (corr) | **A: 08-02** | B: max build (07-22) | B: 07-27 (corr) | **B: 08-02** |
|---|---|---|---|---|---|---|
| 20 | 30.0 | 30.0 | **30.0** | 30.0 | 30.0 | **27.3** |
| 40 | 30.0 | 30.0 | **28.8** | 30.0 | 30.0 | **27.3** |
| 60 | 30.0 | 29.8 | **27.6** | 29.8 | 24.2 | **20.9** |
| 80 | 28.7 | 27.9 | **25.4** | 18.8 | 13.6 | **11.5** |
| 100 | 20.7 | 18.2 | **16.5** | 11.1 | 9.2 | **7.5** |
| 140 | 10.1 | 9.8 | **8.2** | 5.2 | 4.4 | **3.8** |

**Both ceilings have fallen, and the max-build regression flagged on 07-27 is
confirmed and larger.**

- **L1 ceiling: ~60–70 → ~20–40.** 60 held a full 30 Hz on every prior run and
  is now 27.6; 40 is already 4 % off with over-budget ticks logged in its
  window. Only 20 still holds 30 Hz.
- **Maxed ceiling: ~60 → below 20.** No step in run B reached 30 Hz, including
  20 bots. A maxed build now costs measurably at *twenty* players.
- The 07-27 note said "treat the max-build drop as a regression candidate, not a
  finding, and re-run B before anyone bisects." This is that re-run: 60 went
  29.8 → 24.2 → 20.9 across the three builds, monotonically. It is a finding.

**Both confounds again make run B's deficit an understatement:** its mob field
was thinner and far less aggroed throughout (10–14 per viewport, **7.3–7.8
aggroed**, vs run A's 12–19 and **8.7–17.6**) despite a 4-minute inter-run gap,
and at 140 the bring-up itself degraded (`passives 2.69`, `cooldowns equipped
2.61`). Run B did less work than run A and was slower at every step.

⚑ **Leading suspect, not yet pinned: per-player `GameState` grew.** The
bottleneck has always been single-threaded per-player snapshot encoding on the
loop, and since 07-27 that message gained the quest ledger projection (composed
and sorted per player per tick), the personalised conversation tree, and the
R1/R7 wire fields (`cost_factor`, `damage_factor`, `cost_paid`). That is new
work in exactly the place the wall is. **Cheapest confirmation before anyone
bisects:** a local `-profile` ramp with pprof on the encode path, not a bisect.

### Harness notes from this run

- **The max-build loadout changed** — `Swift` is a **cooldown** now (the
  `speed_burst` rework), so it can no longer fill a passive slot. Current
  9-slot max build: `Suppression,Damage,Wildfire` (auras) ·
  `Strong,KeenEye,Tough` (passives) · `NovaBurst,DamageBurst,Barrier`
  (cooldowns).
- **`points spent` is now 18, not 28, with every skill still at its cap.** The
  numbers rewrite's cap-relative point curve made maxing all nine slots cost 18
  of the 29 available points. The build is now **slot-bound, not point-bound** —
  11 points are spare and there is nothing left to spend them on. The "spends 28
  of 29" note in the max-build section above is stale.

### Server-side during the ramps

`/proc` deltas on the live box (`ps %cpu` is an average-since-start and reads
far too low — sample `utime+stime` instead):

- Peak **135 % of one core**, i.e. ~68 % of the 2-vCPU box. **Never saturated** —
  the same "the loop cannot spend the second vCPU" signature as every prior run.
  Idle baseline 23 %, back to 21 % after.
- RSS 40 → 55 MB, back to 48 MB idle.
- Worst tick `Systems at: 987%` ≈ 326 ms, vs 957 % (07-27), 809 % (07-26),
  772 % (07-22). The tail keeps getting worse.
- **0 panics, 0 OOM, 0 dropped connections**, `connected` == requested at every
  step of both runs, and no restart — so no characters were wiped.

## Results — 2026-08-02 run 2 of 3, chunk 0 deployed (measured 15:38–15:52 UTC)

Same box, same spot `(38,31)`, same two ramps, ~100 minutes after run 1.
Deployed binary 15:38 UTC carrying `00bd0549` (the XP-curve table) on top
of the same round-7 stack. Boot clean: 0 errors, 0 warnings, 87 skills.
`auras CONFIRMED LIVE` N/N at every step of both runs; server empty.

**⚑ The 27.3 floor is back and this time it is proven to be the path.** Both
runs read a flat 27.3 at 20 / 40 / 60 bots, so the corrected column divides by
0.91 as on 07-26 and 07-27. The proof is server-side: during run A's 20-bot
window the box sat at **32–56 % of one core with ONE over-budget tick in 30 s**,
and 40 and 60 bots read *exactly* the same 27.3 while CPU climbed to 91 %. A
server limit cannot be flat across three populations.

| bots | A: run 1 (pre-fix) | A: run 2 (corrected) | B: run 1 (pre-fix) | B: run 2 (corrected) |
|---|---|---|---|---|
| 20 | 30.0 | 27.3 (30.0) | 27.3 | 27.3 (30.0) |
| 40 | 28.8 | 27.3 (30.0) | 27.3 | 27.3 (30.0) |
| 60 | 27.6 | 27.3 (**30.0**) | 20.9 | 27.3 (**30.0**) |
| 80 | 25.4 | 26.1 (28.7) | 11.5 | 25.6 (**28.1**) |
| 100 | 16.5 | 18.4 (20.2) | 7.5 | 17.2 (**18.9**) |
| 140 | 8.2 | 9.0 (9.9) | 3.8 | 7.9 (**8.7**) |

**Both ceilings roughly doubled, and the max build is the big winner.** L1 holds
a full 30 Hz to 60 and is only 4 % off at 80 (run 1: off 30 Hz already at 40).
The maxed build — which in run 1 never reached 30 Hz at *any* population,
including 20 — now holds 30 Hz to 60 and 28.1 at 80. At 80 bots it went
11.5 → 28.1, at 100 7.5 → 18.9.

⚑ **One honest caveat on the comparison.** Run 1's run B also read 27.3 at
20/40, and it was argued NOT to be the path because run 1's run A read a
clean 30.0 ten minutes earlier. That inference stands, but if the path had in
fact degraded between run 1's two ramps, run 1's B column should also be
divided by 0.91 — which would make it 30.0 / 30.0 / 23.0 / 12.6 / 8.2 / 4.2.
The improvement at 60–140 survives either reading, so the conclusion does not
depend on which is right.

Run B's mob field was again thinner and less aggroed than run A's (10–13.8 per
viewport, **5.7–6.4 aggroed**, vs run A's 12.4–18.8 and 10.6–16.5), so its
column is once more an understatement.

Server-side: peak **146 % of one core** (up from 135 % — it is delivering more
snapshots per second, which is the point), RSS 26 → 44 MB, idle 25 % / 49 MB
afterwards. **Worst tick `Systems at: 518%` ≈ 171 ms, against 987 % ≈ 326 ms in
run 1** — the tail nearly halved too. 0 panics, 0 OOM, 0 dropped
connections, no restart.

## Results — 2026-08-02 run 3 of 3 ⭐ MOST RECENT, step 8a accounts & persistence (measured 19:23–19:33 UTC)

Same box, same spot `(38,31)`, same two ramps, ~3.5 hours after run 2
(run A 19:23–19:28 UTC, run B 19:28–19:33 UTC). **The question this run answers: did accounts + persistence cost
throughput?** The deployed binary now mints a play ticket per join, holds a
`pgxpool`, and saves character snapshots — all new work since run 2.

⚑ **NOT AN EMPTY SERVER — 2 to 4 real players were in the world throughout**
(`/players` read 3 at run A's start, 2 at run B's). Every previous row in this
file was taken empty. Their per-player snapshot encoding lands on exactly the
bottleneck being measured, so treat the low-population rows as the soft ones.
Recorded rather than hidden, because the alternative was not running at all.
`auras CONFIRMED LIVE` N/N at every step of both runs, `points spent 18.0`,
`passives 3.00`, `cooldowns equipped 3.00` — the builds did land.

| bots | A: run 2 (corrected) | **A: run 3 (corrected)** | B: run 2 (corrected) | **B: run 3 (corrected)** |
|---|---|---|---|---|
| 20 | 30.0 | 27.3 (30.0) | 30.0 | 27.3 (30.0) |
| 40 | 30.0 | 27.3 (30.0) | 30.0 | 26.4 (29.0) |
| 60 | 30.0 | 27.2 (29.9) | 30.0 | 24.3 (26.7) |
| 80 | 28.7 | 26.1 (28.7) | 28.1 | 21.7 (23.8) |
| 100 | 20.2 | 21.2 (**23.3**) | 18.9 | 20.8 (**22.9**) |
| 140 | 9.9 | 10.1 (**11.1**) | 8.7 | 9.1 (**10.0**) |

**Accounts did not cost the ceiling.** Run A is identical to run 2 through
80 bots and *better* at 100 (20.2 → 23.3) and 140 (9.9 → 11.1). Peak CPU 148 %
of one core vs 146 %, and the tail improved again: **worst tick `Systems at:
424%` ≈ 140 ms, against 518 % ≈ 171 ms in run 2 and 987 % ≈ 326 ms in
run 1.** 0 panics, 0 OOM, **0 dropped connections**, 0 restarts.

⚑ **Run B's mid-range is the one soft spot, and its own floor says so.** Run A
read a flat 27.3 / 27.3 / 27.2 at 20/40/60 — the path floor, exactly as on 07-26,
07-27 and run 2 — so its corrected column is on the usual footing. **Run B
did not**: 27.3 / 26.4 / 24.3 is already sloping at 40. So either the path
degraded during run B (in which case the 0.91 divisor understates it) or the
loop genuinely starts losing ground at 40 with the max build. The mob field does
not explain it — B's `aggroed` was 5.7–7.0 against run 2's B at 5.7–6.4, i.e.
the same thin field. **Worth one clean empty-server re-run of B before anyone
treats the 40–80 dip as real.**

⚑ **MEMORY IS THE REAL CHANGE, and it is large.** RSS ran **129 MB idle → 281 MB
peak**, against run 2's **44 MB peak / 49 MB idle** — roughly 3× idle and
5× under load. On a 4 GB box that is comfortable, and it is the expected shape
(connection pool + per-character persistence state + the accounts layer), but it
is the first time this file has had to state a memory figure in hundreds of MB.
Track it: the ceiling here has always been CPU, and nothing says it stays that
way.

## Diagnosis — 2026-08-02, where the time actually goes

The live table above is a single number per population with nothing inside it
(the `Overload!` log is whole-tick; there is no per-system timing). So the
decline was chased locally instead, with `-profile` and an A/B against the
07-27 build (`9231c96d`) in a worktree — **no live server involved, and both
builds measured sequentially on the same machine so neither competes for CPU.**

### The A/B: the six-week decline is NOT in the server code

50 bots, clustered at `(38,31)`, maxed loadout, `-cast 2s`:

| | p50 tick | p95 tick |
|---|---|---|
| 07-27 build, each at its own cap | 20.0 ms | 39.4 ms |
| today's build, each at its own cap | 13.9 ms | 18.3 ms |
| 07-27 build, both at `-skilllevel 3` | 11.4 ms | 16.9 ms |
| today's build, both at `-skilllevel 3` | 13.1 ms | 17.2 ms |

At an identical loadout today's build is ~15 % slower at p50, and the `pprof`
diff accounts for only **3.5 % of samples** — no six-week regression of the
size the live table shows. At each build's own ceiling today's build is
**substantially faster**, and the reason is content, not code: **R3's "one beat,
one price" is a large performance win nobody costed.** Old Suppression's
`slow_aura` and old Wildfire's `resist_aura` had `tickInterval` 1 — they ran
*every tick*; they are now 40 and 20.

⚑ So the live decline is a **measurement/venue** effect, not a code regression:
the live comparisons sit past the knee on a 2-vCPU box where the curve is
near-vertical, while 50 local bots sit at ~55 % util where a 15 % per-tick
difference is invisible. `vmstat` on the live box shows **zero steal**, so it is
not a noisy neighbour either. To explain the live table rather than acquit the
code, reproduce the knee (`taskset -c 0,1`) — not done yet.

### What the profile did find: the XP curve, ~50 % of the tick ✅ FIXED

`characterCommonMarshalFlatbuf` evaluated the level curve **twice per character
per viewer per tick** (`gamestate.go:46` via `LevelProgressFraction`, and `:69`
via `LevelProgressXP`) — and each evaluation was a summation loop of
`base × growth^(L-1)` calls, i.e. O(level) `math.Pow` per lookup and O(level²)
to resolve a level from an XP total. At 50 clustered bots that is ~5 000
evaluations per tick; at level 30 each cost ~2.9 µs.

It is a pure function of `(level, config)`, both static after boot, so it is now
a cumulative table built once per player (`player.xpCumulative`), with a binary
search replacing the resolution loop and the original loop kept verbatim for
lookups past the table's end.

| | before | after |
|---|---|---|
| `LevelProgressXP` @ L30 (per character per viewer per tick) | 2 920 ns | 14.2 ns |
| `levelForExperience` @ L28 (every XP award) | 16 700 ns | 32.3 ns |
| **tick p50, 50 bots maxed** | **13.9 ms** | **7.0 ms** |
| **tick p95, 50 bots maxed** | **18.3 ms** | **9.6 ms** |

⚑ The XP-award path mattered more than the XP bar: `levelForExperience` runs on
**every** award, and presence-counts attribution means one mob death awards XP
to every nearby participant — 50 players × 16.7 µs for a single kill.

Pinned by `player_xp_curve_test.go`, which checks the table against the original
formula as an oracle (values, level boundaries, the maxLevel clamp, and the
uncapped-conf fallback) plus benchmarks. Sim battery **byte-identical** on all
three legs, TTK 6.67 s / TTD 8.70 s unchanged.

### Second finding, real but small: per-caster dot streams are O(k²)

Round-7 item 6 re-keyed dots by `(caster, HP)` while `Buffs.entries` stays keyed
by `SkillID` alone (`buffs.go:32`), so k casters of one skill on one target hold
k entries in one slice — and `DueBuffEvents` calls `dotSuppressed` per dot,
which rescans the whole slice (`buffs.go:755`) ⇒ **O(k²) per entity per tick**.
Measured (`buffs_bench_test.go`): 102 ns at k=1, 1 097 at k=10, 12 983 at k=50,
~98 000 at k=140 — 50→140 rises 7.5× for a 2.8× rise in k, i.e. quadratic.

Scaled to ~20 mobs in the cluster that is ~2 ms/tick, **~6 % of budget** — worth
fixing (it is quadratic in players-attacking-one-target, the raid case), but it
is not what moved the live numbers. Fix: key by `(SkillID, caster)` or hold a
per-caster strongest-stream pointer; both keep the allocation-free property the
nested scan was chosen for.

## The wall (and how to move it)

Still **single-threaded per-player GameState encoding on the game loop**, and
now measured rather than asserted. Post-XP-fix profile, 50 clustered bots
(`% of the tick`, i.e. of `runTick`, which is itself 52 % of all samples — the
rest is GC and the per-client `writePump` goroutines):

| | % of tick |
|---|---|
| `NetSystem.Update` (snapshot encoding) | **57 %** |
| ├ `EntitiesMarshalFlatbuf` | 45 % |
| └ `characterCommonMarshalFlatbuf` (other players) | 27 % |
| `PhysicsSystem.Update` | 24 % |
| └ `bruteIntersectShapes` (O(n²) per cell) | 20 % |

**Message COUNT is not the problem and has not grown** — it is still exactly one
`GameState` per player per tick (`core/net.go:86`), the only per-tick send site,
plus a spectator twin. Payload is ~5.8 kB/snapshot at 50 clustered bots and grew
~2 % between the two builds. The cost is not sending, it is **re-encoding the
same entities once per viewer**: 50 players each encoding ~50 characters is
2 500 character encodings per tick for 50 distinct characters.

**Writes are already parallel** — `SendMessage` is a non-blocking enqueue onto a
per-client buffered channel drained by that client's own `writePump` goroutine
(`net/client.go:124`), which is why CPU exceeds one core while the loop cannot.
A full channel returns an error, and NetSystem treats that as a disconnect —
**that is exactly the "dropped connections" signal**.

To raise the ceiling, cheapest first:

1. **Encode each entity once per tick, reuse across viewers.** Attacks the 45 %
   directly and turns the clustered O(players × entities) into O(entities).
2. **Parallelise `NetSystem.Update` across cores.** Each player's snapshot is an
   independent read-only pass over settled world state, so this is a fan-out
   over the player list — up to ~2× of 57 % on the 2-vCPU box. Needs an audit
   that nothing mutates during encode (the one-shot fields cleared in
   `ResetTickNumbers` are the thing to check).
3. **Stop re-encoding static data.** Spellbook, spellbook levels and all three
   slot vectors are rebuilt every tick and change rarely.
4. **Delta encoding** — the structural endpoint, and the biggest change.
5. **Broadphase**: `bruteIntersectShapes` is O(n²) per cell and a clustered
   raid puts everyone in the same cells.

Also noted, not measured as hot here: `QuestLedger().Snapshot()` allocates and
sorts per player per tick, but early-returns for a questless player — so the
bots never paid it and a real player with quests does.
