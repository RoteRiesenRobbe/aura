# plan-server-performance.md — raising the concurrent-player ceiling

**Status: chunk 0 built (uncommitted), chunks 1–5 not started. 2026-08-02.**

The measurements this plan is built on live in `devops/loadtest.md`
(§Diagnosis — 2026-08-02 and §The wall). This doc is only the **execution
order**: what to do, in what order, what each is expected to buy, and how to
know it worked. Nothing here needs a design session — every chunk is a
mechanical change to a measured hotspot.

## Why the order is what it is

Three facts set it:

1. **Encoding is 57 % of the tick, physics 24 %** (post-chunk-0 profile, 50
   clustered bots). Everything else is noise by comparison.
2. **The clustered case is O(players × entities)** — each player's snapshot
   re-encodes every entity in their viewport, and in a raid every viewport
   holds every other player. Dispersed play has never been the problem
   (120+ bots held 30 Hz spread out, back on 07-22).
3. **The loop cannot use the second vCPU**, but the socket writes already do.
   So the ceiling is one core's worth of *encoding*, and every prior fix that
   removed waste rather than structure failed to move it.

Cheapest first, but note that **chunk 1 is both the cheapest big win and the
one that changes the most about how snapshots are built** — it is first because
its payoff dominates, not because it is trivial.

## Measuring any of this

Always the same way, or the numbers are not comparable:

- **Local, sequential, `-profile`.** `scratchpad/measure1.sh` in the 2026-08-02
  session is the shape: one server, 50 bots clustered at `(38,31)`, maxed
  loadout, `-cast 2s`, a throwaway pprof capture to burn the settle, then a
  real one. Two builds never run concurrently.
- **Report tick p50/p95 from `/tickstats`**, not `snap/s`. Below the knee
  `snap/s` reads a flat 30.0 and hides everything; that is exactly why the
  local A/B looked like a null result until the profile was read.
- **`go tool pprof -diff_base`** between before and after, not just top-N.
- **Sim battery byte-identical** (`default`, `-chain`, `-levels`) for anything
  that must not move game numbers, plus the alloc pins.
- ⚑ **A live ramp cannot answer "did this help"** — see the runbook's
  measurement caveats. Live is for the ceiling number, local is for the delta.

---

## Chunk 0 — the XP curve ✅ SHIPPED `00bd0549`, DEPLOYED 2026-08-02

**Bought: tick p50 13.9 → 7.0 ms at 50 clustered bots locally, and on the live
box both ceilings roughly doubled — the maxed build went 11.5 → 28.1 snap/s at
80 bots and now holds a full 30 Hz to 60, where before the fix it never reached
30 Hz at any population. Worst tick 326 → 171 ms.** Full table in
`devops/loadtest.md` §Results — 2026-08-02 evening.

The level curve was evaluated twice per character *per viewer* per tick, each
a summation of `math.Pow` calls, plus O(level²) to resolve a level from XP on
every award. Now a cumulative table per player (`player.xpCumulative`) with a
binary search. Pinned by `player_xp_curve_test.go` against the original formula
as an oracle; sim battery byte-identical.

Left undone deliberately: `pkg/aura/sim/curve.go` still carries its own mirror
of the formula (it has a comment saying so). It is not on the hot path.

## Chunk 1 — encode each entity once per tick, reuse across viewers

**Expect the largest single win of anything here: it attacks the 45 % of the
tick spent in `EntitiesMarshalFlatbuf`, and it is the only chunk that changes
the clustered case from O(players × entities) to O(entities).**

Today `playerSendState` builds a fresh FlatBuffers builder per player and
re-encodes every visible entity into it. At 50 clustered bots that is ~2 500
character encodings per tick for 50 distinct characters.

The obstacle is that FlatBuffers offsets are builder-relative, so an entity
encoded into one builder cannot be referenced from another — this is a real
redesign of the snapshot assembly, not a memoization. Options, in increasing
order of disruption:

- encode each entity **once into a scratch buffer** and memcpy the bytes into
  each viewer's builder, fixing up offsets;
- build **one shared snapshot per tick** containing every entity, and give each
  player an index vector into it (changes the wire schema and the client);
- keep per-viewer messages but cache **per-entity encoded blobs** keyed by
  entity+tick.

⚑ Decide this one with a spike, not on paper. It is the only chunk here that
could reasonably need a design session.

## Chunk 2 — parallelise `NetSystem.Update`

**Expect up to ~2× on 57 % of the tick on the 2-vCPU box; more on a bigger
box. Much smaller change than chunk 1, and independent of it — either order
works, and they compose.**

Each player's snapshot is an independent read-only pass over world state that
has already settled for the tick (NetSystem has Priority −100, so it runs
last). Fan the player loop out over a worker pool sized to `GOMAXPROCS`.

⚑ The audit that makes this safe: nothing may **mutate** during encode. The
one-shot fields cleared in `ResetTickNumbers` are the first thing to check,
along with `QuestLedger().Snapshot()` (allocates and sorts) and anything
lazily-initialised on first read. ⚑ Chunk 0's `xpCumulative` was exactly such a
lazy init — encoding reads it for every character in every viewport, so it
would write to one player's table during another player's snapshot; it is now
built eagerly in `New`, with the lazy path kept only for struct-literal players
(sim, tests). Look for the same shape elsewhere, and run the race detector
under load, not just the unit suite.

## Chunk 3 — stop re-encoding static data

**Cheap, low-risk, modest win. Good filler chunk.**

Spellbook, spellbook levels, and all three slot vectors are rebuilt into the
message every tick and change only on equip/unlock/level-up. Cache the encoded
form per player and rebuild on a dirty flag.

⚑ The dirty flag is the whole risk: a missed invalidation is a UI that silently
stops updating. Every mutation site must set it, and a test should assert that
each mutating path does.

## Chunk 4 — the broadphase

**~20 % of the tick sits in `bruteIntersectShapes`, which is O(n²) per grid
cell — and a clustered raid puts every player in the same cells.**

Grid sizing / cell subdivision, or a better pair-pruning structure. Note this
is the same code the aura sensors run through, so a maxed build with a wide
radius pays it hardest.

## Chunk 5 — delta encoding

**The structural endpoint, and the biggest change of the five.** Send only what
changed since the client's last acknowledged snapshot. Only worth opening after
1–4, because each of those reduces the work delta encoding would be avoiding,
and this one costs a client rewrite plus per-client server state.

---

## Not in this plan

- **Per-caster dot streams are O(k²)** (`buffs.go:755`, `dotSuppressed` rescans
  the slice per dot). Real and quadratic in players-attacking-one-target —
  benchmarked at ~98 µs per entity per tick at 140 casters — but ~6 % of budget,
  so it is a correctness-of-scaling fix rather than a ceiling fix. Bench exists
  (`buffs_bench_test.go`); fix is to key by `(SkillID, caster)` or hold a
  per-caster strongest-stream pointer, keeping the allocation-free property.
- **Explaining the live table.** The local A/B acquitted the code, so the live
  decline reads as a venue effect (past the knee on 2 vCPUs, zero CPU steal).
  Reproducing the knee locally with `taskset -c 0,1` would settle it. Costs an
  hour, buys understanding rather than throughput.
- **A faster single-core VPS.** Still the cheapest ceiling increase available
  that requires no code at all, and it composes with everything above.
- **Client render cost.** A different problem with no shared mechanism: the
  phone client was asking for 2.97 Mpx a frame and starving its own input clock
  (fixed 2026-08-02 `59dfe266`, ledger in `plan-playtest-feedback.md` §Ledgers,
  and still open as *"needs some love"*). A laggy phone is not evidence about
  this plan's ceiling, and vice versa — measure them separately.
