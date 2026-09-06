# plan-server-performance.md — raising the concurrent-player ceiling

**Status: chunks 0 and 3 SHIPPED; chunks 1, 2, 4, 5 not started. 2026-09-06.**
⭐ **Chunk 3 SHIPPED 2026-09-06 `[uncommitted]`** — send-on-change for the
owner-only block and the conversation tree, measured at **39.3 % of
steady-state bytes** (and **59.1 %** with a dialogue open) on the real encoder.
Its ledger is on the chunk heading below, including the **four defects a code
review caught after the first green run** — three of which share one root worth
carrying forward: *a change-only field needs an explicit presence bit; every
in-band way to infer one collides with a legitimate value.*
⚑ **Before starting chunk 1, re-read §Why the order is what it is against
`plan-world-scale.md` §11 M1-F3**: at entity density 10× `PhysicsSystem` is
**74 %** of the tick, not the 24 % this plan sequences chunk 4 off.

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

⚑ **A fourth fact, added 2026-08-30:** those three are all about *tick time*, and
they all concern data shared between viewers. **Owner-only fields are a separate
axis** — chunk 1 cannot share what only one viewer receives — so chunk 3 is not
competing with chunk 1 for the same win and does not have to wait behind it.
Take chunk 1 for the tick, chunk 3 for the bytes and the per-player floor.

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

## Chunk 3 — stop re-encoding **and re-sending** owner-only state ✅ SHIPPED `[uncommitted]` 2026-09-06

**Bought, measured on the real encoder over a 150-tick steady-state run
(`core/net_ownerstate_bytes_test.go`, before-arm = the same binary with both
skip flags forced false, which is byte-for-byte the old always-send path):**

| scenario | before | after | saved |
| --- | --- | --- | --- |
| spellbook + one accepted quest, no mutation | 384 B/tick/player | 233 B/tick/player | **39.3 %** (151 B/tick) |
| conversation held open, never advanced | 672 B/tick/player | 275 B/tick/player | **59.1 %** |

A real mutation (equip, level-up, skill point, quest event) still lands on the
**same tick** — send-on-change per D1, never a slow cadence.

**How it was built, and the one thing that made it small:** no new dirty flags.
`SkillComponent.Revision()` and `quests.Ledger` already counted exactly the
persisted state this block encodes, and `sys/persist.go`'s `saveWatch` already
trusted them for forced saves — so the gate is that same three-integer
comparison, moved to the wire. `NetSystem.ownerStateGate` keys an
`ownerStateWatch{level, skillRev, questRev, conversingWith, nextForce}` by
client UUID and returns two bools; `codec.CharacterGameState` grew
`SkipOwnerState`/`SkipConversationTree`, both defaulting to **false = send
everything**, so any caller that does not know about the gate (sim, tests) keeps
the old bytes. ⭐ **L2 fell out for free**: a reconnect always mints a fresh
`Client` with a fresh UUID, so it lands in the unknown-key branch and gets a
full send with no bookkeeping at any join site.

⚑ **The heartbeat is the OWNER BLOCK's only.** A conversation opening on its own
refreshes `conversingWith` but must NOT push `nextForce` back, or a player who
keeps opening panels starves the D2 safety net indefinitely.

### ⭐ The four defects a code review found after the first green run

All four were real; the first two were introduced by this chunk. They are worth
reading as a set, because three of them share one root: **a change-only field
needs an EXPLICIT presence signal, and every "clever" way to infer one is wrong.**

- **F1 — the presence signal was inferred from emptiness, and that is unsound.**
  The client first read `spellbookLength() > 0` as "this tick carried the block".
  But `initializePlayerSkills` starts the spellbook **bare** (the level-1
  milestones fill it only once content is loaded), an empty quest journal is a
  real state, and so are `skill_points` 0 and `active_aura_slot` −1. So a genuine
  send was read as "not sent" and discarded whole. ⭐ **Fixed with a second
  appended wire field, `owner_state:bool`**, written true only on the ticks that
  carry the block. ⚑ **This is the chunk's transferable lesson**: for any
  change-only group, the "did I send it" bit must be its own field — every
  in-band signal collides with a legitimate value.
- **F2 — the cooldown sweep froze.** `cooldown_remaining_ticks` was correctly
  left out of the gate (L3), but its ONLY client consumer sat behind
  `if (isDefined(snapshot.cooldownSlots))` — now change-only — and firing a
  cooldown bumps no watched revision. The countdown and the conic wedge stopped
  between loadout changes. ⚑ `HUD.ts:1010`'s own comment ("this path already
  runs on every snapshot") was the invariant being broken. Fixed by making
  `updateCooldownLoadout(slots?, remaining)` fall back to its existing
  `currentCooldownSlots` cache, called unconditionally every tick.
- **F3 — objective counters lagged the heartbeat.** `recheck()`'s "the stage
  holds but a counter moved" branch updates `p.Objectives` and deliberately does
  **not** bump `revision` — because `revision` drives forced saves and bumping it
  per credited kill would write to the database on every mob killed. So "3/8
  slain" sat stale for up to ~5 s while the player watched their kill not count.
  ⭐ **Fixed with a SECOND counter, `Ledger.DisplayRevision()`**, bumped wherever
  `revision` is plus that branch: the wire watches presentation, the save path
  keeps watching durability. ⚑ Do not merge them — the field comments on both say
  why.
- **F4 — the journal stopped clearing on death.** `SpectatorGameState` carries no
  `quest_progress`, so under the change-only rule its absence reads as
  "unchanged" and a dead character's rows lingered over the death overlay. The
  old unconditional `?? []` had been clearing them as a side effect. Fixed with
  an explicit `snapshot.player?.isSpectator` branch.

### Test strategy — what was built

Twelve new Go legs across three files. The two written for F1/F3 are
**mutation-verified** (reverting either fix turns them red):
`TestNetSystem_OwnerState_FlagIsExplicitNotInferredFromEmptiness` deliberately
uses an empty-spellbook character carrying a real quest, and
`TestNetSystem_OwnerState_ObjectiveCounterProgressResendsTheJournal` asserts the
resend fires **and** that `Revision()` does not move. The L1 leg
(`TestNetSystem_Conversation_CloseSignalSurvivesTreeGating`) walks
open → unchanged → close and pins that the id carries the close while the tree
is omitted. The pure gate legs run against plain structs with no game at all;
the wire legs use a real `player.New` + real `SkillComponent` + real `Ledger`.

**Schema impact: WIRE YES — TWO appended fields** (`conversation_entity_id:ulong`
per D3, and `owner_state:bool` per F1), both binding sets regenerated together.
**DB NONE. Content NONE.**

⚑ **Two harness/tooling traps met on the way**, both already in the `verify`
skill but worth restating: `api/schema/make.bat` names a bare `flatc`, and the
checked-in `api/schema/flatc.exe` is **1.9.0 from 2018** — it emits the old
single-file `aura_generated.ts` layout and silently destroys the tracked
per-file bindings. Use `backend/pkg/api/flatc_Windows_v24_3_25.exe --ts
--gen-all -o js/ aura.fbs` (the two `--no-*` flags in make.bat are not valid on
v24). And a stale `backend/aurad.exe` was holding port 2000 and serving
pre-chunk code, which is the documented shadowing trap.

### Verified

`go build ./...` clean · `go vet ./...` clean · **`go test -count=1 ./...` all
packages green** · `tsc --noEmit` clean · **vitest 586/586** · `npm run build`
clean. In-game, on a rebuilt server against a live Postgres:
**`hygiene-wire-prune` 653 sprites / 0 console errors** (the mandatory gate for
an `.fbs` change, run for both appended fields) · **`c5-ability-bar` 30/30** —
its leg 5c (`sweep 315deg → 178.5deg`) is the direct proof of F2 ·
**`chunkC3-journal` 14/14 + 2 documented SKIPs** · **`r1-focus-cost` all checks
passed**, and its `21,26 → 20,25 Focus` is the strongest single confirmation of
the whole design: a non-neutral `cost_factor` both arrives on the mutation tick
and survives every steady-state tick after it · **`chunk3b-ii-conversation`
28/34, exactly the documented HEAD baseline** (all six failures map onto its
three known causes; the harness itself names the Leave-click race).

⚑ **OWED:** the journal's *"the objective counter moves on real kills"* leg
SKIPped twice (no wolf kill inside its 150 s window), so **F3 is proven by the
mutation-verified Go test rather than in a browser**. Re-run it alone on a fresh
server to close that.

### The original design follows (D1–D3, L1–L3), unchanged


> **Rewritten 2026-08-30 (PO-asked design session), and PROMOTED.** It used to
> read "cheap, low-risk, modest win, good filler chunk" and cover only the CPU
> half — cache the encoded form. Measuring it for the PO's question *"is there
> data in the per-tick message that doesn't need to be in every tick?"* turned
> up **784 bytes per player per tick of slow-changing state, and a 4 264-byte
> conversation tree re-sent 30×/s while a dialogue is open**. The bytes half is
> worth more than the CPU half, and both ride the same dirty flag, so they are
> ONE chunk — splitting them would duplicate the only risky part.

### What is actually on the wire

Measured by building the real `AuraApi` vectors and reading the finished buffer
(throwaway probes in `pkg/aura/codec`, 2026-08-30; reproduce by marshalling the
vectors alone and differencing against an empty `GameState` shell):

| field group | bytes/tick | changes on |
| --- | --- | --- |
| `spellbook`(40) + `spellbook_levels` + aura/passive/cooldown slots + `skill_points` + `cost_factor` + `damage_factor` | 256 | equip, unlock, level-up |
| `quest_progress` (3 quests, stages + objective strings) | 528 | quest events |
| **slow-changing total** | **784** | |
| `conversation` (6 nodes × 4 options) | **4 264** | opening/advancing a dialogue |
| *(context)* one `Mob` entity | 120 | every tick, legitimately |

- **784 B/tick/player = 23 KB/s/player, 1.1 MB/s at 50 players.** Against a
  quiet screen (12 entities in view) that block is **35 % of the whole frame**;
  in a busy fight (30 entities) it is still **18 %**.
- ⭐ **The conversation tree is the standout: 125 KB/s for ONE player standing
  still, talking to an NPC.** Nothing in it changes between ticks. The schema
  comment already concedes the point — *"Sent as STATE every tick, for
  consistency with interactable_entity_id above; a change-only send is a later
  optimisation, not a design requirement."*

⭐ **Why this cannot wait for chunk 1, and is not made redundant by it:** chunk 1
shares one encoding across viewers. Every field above is **owner-only** — there
is no second viewer to share it with, by construction. The dirty flag is the
*only* lever these fields have, which is what promotes this chunk above its
old "filler" billing.

### D1 — send-on-change, NOT a second slower message

The PO's framing was a frequent tick plus a less frequent one, on the
`sendRoster()` precedent (~1 Hz, `rosterIntervalTicks`). **Declined for this
data, deliberately**, and the reason is gameplay rather than engineering:
switching auras mid-fight is a stated GDD skill expression, and `active_aura_slot`,
the slot vectors and `cooldown_remaining_ticks` are exactly what a switch moves.
A fixed slow cadence would add **up to a second of latency to every equip,
unlock and aura switch** — paying UX for bytes when send-on-change gets both:
**zero bytes in the steady state AND instant response**.

A fixed slow message stays the right shape for genuinely ambient data — which is
why the roster already uses it, and that precedent is untouched.

### D2 — a heartbeat resend, because the dirty flag WILL be missed

The old text named the risk correctly (*a missed invalidation is a UI that
silently stops updating*) and then relied on discipline. Instead: resend the
full owner-only block every **N seconds regardless of the flag** [PLACEHOLDER
~5 s]. A forgotten invalidation then self-heals within seconds instead of
persisting for the whole session, and it still keeps ~97 % of the saving.
⚑ This is a mitigation, not a licence — every mutation site still sets the flag,
and §Test strategy still asserts each one does.

### ⚑ L1 — ABSENT ALREADY MEANS SOMETHING, and not the same thing twice

The blocking landmine, and the reason this is not a two-line change. Today:

| field | absent means |
| --- | --- |
| `conversation` | **close the panel** — "the client's only close signal" |
| `quest_progress` | an **empty** journal |
| `discovered_campfires` | **no change** |

So "stop sending it when it hasn't changed" is, for two of those three, already
a live command with a different meaning. Three of them, three conventions. Any
implementation must pick one per field and say so, or **closing a dialogue
silently stops working**.

### D3 — the conversation keeps an explicit open/closed scalar

Because `conversation`-absent cannot become "unchanged" (L1), split the two
questions the field answers today:

- a cheap always-sent scalar — **`conversation_entity_id:ulong`**, 0 = closed —
  carries open/closed at 8 bytes, and costs **nothing** when closed since 0 is
  the field default;
- the expensive tree rides change-only underneath it.

Absent tree + nonzero id = unchanged; id 0 = closed. This mirrors the
`interactable_entity_id` pattern already in the schema rather than inventing a
convention. ⚑ **This is the chunk's one wire-schema change** — one appended
field, both binding sets regenerate together (the immune-feedback landmine).

### ⚑ L2 — a new viewer must start dirty

`quest_progress` and the spellbook flipping to absent-means-unchanged is only
safe if every client is guaranteed a full send before it can miss one. Force the
flag dirty when the player entity is created — join, respawn AND reconnect —
or a reconnecting client renders an empty journal and an empty spellbook until
its next unlock. ⚑ The reconnect stash path is the one that will be forgotten:
it rebuilds a player without going through a fresh join.

### ⚑ L3 — `cooldown_remaining_ticks` is NOT slow-changing

It sits inside the 256-byte block but genuinely changes every tick while a
cooldown runs. It stays in the fast lane; only the *slot* vectors beside it are
cacheable. Gating it by the same flag would freeze every cooldown sweep on the
client at the value it had when the loadout last changed.

### Expected win, stated honestly

**Bandwidth: ~780 B/tick/player of steady-state traffic removed, plus the
conversation tree's 125 KB/s while talking.** CPU: the vector builds and their
allocations, per player per tick — real but second-order against chunk 1.

⚑ **The measured bottleneck is CPU in encoding, not bandwidth** (§Why the order
is what it is), so this is not the tick-time lever chunk 1 is. It is the right
chunk when the target is **bandwidth, mobile data, or the per-player floor that
chunk 1 structurally cannot touch** — and the conversation finding is a real
defect independent of any ceiling.

### Test strategy

- One leg **per mutation site** asserting the flag is set (the old text's ask,
  kept — it is what makes D2 a safety net rather than the mechanism).
- A leg asserting the heartbeat resends with **no** mutation at all.
- ⭐ The L1 leg, which is the one that would catch a shipped regression:
  **open a conversation, advance it, close it** — and assert the panel closes.
  The close path is the one that breaks silently.
- L2: a **reconnecting** client receives a full spellbook and journal on its
  first tick, not an empty one.
- Bytes before/after on a steady-state tick, which is the number this chunk is
  bought for.

**Schema impact: WIRE YES** (one appended `conversation_entity_id`, both
bindings regenerate), **DB NONE**.

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
