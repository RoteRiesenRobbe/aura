# Plan: the play bot - a headless character that actually plays

> **Status: DESIGNED 2026-08-12 (design session) - no chunk built yet.** Four PO
> rulings taken as choice prompts (D1–D4); the rest of §2 is proposal, vetoable.
> Every number is [PLACEHOLDER] unless marked. Line references are pinned to
> `db95d0bf`.

## 1. What this is

A **headless character that plays the game for hours**: real kills, real XP, real
dialogue, a real quest ledger, real deaths and campfire respawns. Not a load
generator, not a Playwright leg, not a balance simulator. Its job is the two
things none of those three cover:

- **long-horizon soak** - nothing in the project plays for more than a couple of
  minutes, so the accumulation class of bug (ledger drift, persistence
  corruption, aggro re-latching, allocation growth, the `phy.Space` ghost class
  of `backlog.md` §54) is structurally invisible today;
- **an empirical read on the real loop** - measured kills/hour and XP/hour to
  cross-check `simharness`, which today validates the balance model only against
  itself.

Inputs read during the session:

- `backend/cmd/loadbot/main.go` (973 lines) - the existing headless client.
- `api/schema/client.fbs` + `api/schema/server.fbs` - what a bot can perceive
  and say.
- `backend/cmd/simharness/content.go` - the precedent for reading authored
  content outside `aurad`.
- `docs/archive/plan-quests.md` (the ledger and the conversation tree),
  `docs/archive/plan-mob-tether.md` D5 (the tick-accumulator thrash),
  CLAUDE.md's standing locks and gotchas.

### The find that shapes the plan

**The wire already carries everything a bot needs to perceive and to act**, and
`loadbot` already speaks most of it. This is not a client project.

| What a play bot needs | Where it already is |
| --- | --- |
| An identity the way a browser gets one | `mintPlayTicket` (`loadbot/main.go:476`): `POST /api/characters` → session cookie → `/select` → play ticket |
| Its own level, XP-in-level, XP-to-next, HP, position | `Character` (`server.fbs:265`), fields `level`, `xp_in_level`, `xp_for_next_level`, `health`, `max_health`, `pos` |
| Every visible mob's position, HP, species, aggro state | `Mob` (`server.fbs:155`); `loadbot/main.go:620-634` already walks the entity vector and reads `aura_radius > 0` as "this mob is fighting" |
| **The entire conversation tree** | `Conversation` (`server.fbs:476`): *every reachable node*, each option's authored `option_index` / `grant_index`, its label, its `next`, and whether it is `locked` |
| Taking a dialogue row | `Interact` (`client.fbs:131`), echoing the authored indices back |
| Its quest ledger, with **server-composed objective strings** | `QuestProgress` (`server.fbs:494`) - `objectives` is literally `"3/8 Wolf slain"`, composed server-side |
| Dying and coming back | `Respawn` (`client.fbs:117`) |
| Movement, aura switching, cooldown firing | `Input` (`client.fbs:5`) |

So questing needs **no cheat and no browser**: open the conversation, read the
tree, echo an option index back. What is actually missing is small: target
selection, an engagement loop, death handling, band seeding, and the oracle.

## 2. Decision ledger

Rulings **D1–D4** are PO-taken (2026-08-12). §9 holds the proposals adopted
without a prompt.

- **D1 - it gets its own binary: `backend/cmd/playbot`.** The transport layer
  (mint the ticket, dial, `Join`, build `Input`/`Cheat`/`Equip`/`SpendSkillPoint`/
  `Interact`/`Respawn`, decode `GameState`) is **extracted out of `loadbot` into a
  package both binaries import**. Rejected: a `-play` mode inside `loadbot`
  (its whole lifecycle is ramp → hold → measure → tear down, which a single
  long-lived character does not share, and it is already 973 lines), and a
  copy-paste binary (two decode paths to keep in sync at every wire change).
  The cost is one extraction refactor whose acceptance criterion is *`loadbot`
  behaves identically*.
- **D2 - cheats are for TRANSPORT and SEEDING only, and never inside the
  measured window.** `WARP` to a hunting ground or an NPC, and `XP` to seed a
  band (D4). Everything the run measures is real: real damage, real kills, real
  XP awards, real dialogue, real ledger, real death, real respawn. No `GOD`, no
  `SKILL` beyond what the character legitimately owns, no `QUEST ACCEPT`.
  Rejected: no-cheats-at-all (turns the project into a navigation project for a
  question nobody asked), and cheat-the-quest-accept (gives up the offer and
  turn-in path, which the §1 find says is nearly free to drive honestly).
  ⚑ **The window is a first-class concept**: seeding happens, is *verified* from
  the bot's own `GameState`, and only then does measurement start.
- **D3 - the first run must answer three things: soak stability, quest-ledger
  integrity, and the economy cross-check.** ⚑ **Progression reachability was
  deliberately NOT selected** - see §8, and note that D4 makes it structurally
  unanswerable, which is consistent rather than accidental.
- **D4 - sampling is per-band sprints, not one long climb.** Seed to the start
  of a band with `XP`, then measure **one real level** of honest play, per band,
  several bands in parallel in one process. Minutes per band instead of a
  multi-hour serial climb, and it produces the per-band kills/hour table
  directly. The full 1 → 20 climb is a later mode, not this plan (§8).

## 3. What this is not

Recorded because every one of these has a cheaper owner already:

- **Not a fun, feel or readability instrument.** Those are the PO walk's job, and
  the pending ascension-sites walk is not replaced by any of this.
- **Not a per-chunk gate.** It is an on-demand soak instrument. The project
  already carries four red-or-flaky harness legs at HEAD that nobody owns, and
  reading one of them as a regression has cost two chunks of false diagnosis
  before. A bot with fuzzy oracles would be the fifth.
- **Not a balance model.** `simharness` stays the distribution instrument; the
  bot produces *one* empirical sample to check it against.
- **Not a navigation project.** D2 buys that out on purpose.
- **Not a live-server tool.** §9 P2.

## 4. The design

### 4.1 The bot's lifecycle

One state machine per bot, one bot per band, N bots per process:

```
mint → join → VERIFY own state → seed (XP to band start · spend points · equip · activate)
     → VERIFY the build stuck → warp to the band's hunting ground
     → [ measurement window opens ]
     → engage loop  ⇄  recover loop  ⇄  death → Respawn
     → quest cycle (interact · accept · kill · return · turn in)
     → [ window closes ] → report → disconnect
```

### 4.2 Seeding a band, without a second copy of the curve

To land on **exactly** level N the bot never re-derives the XP curve. It reads
`xp_for_next_level - xp_in_level` out of its own snapshot, sends exactly that
much `XP`, and repeats until `level == N`. Self-correcting, and it keeps the
curve in one place - this project has already deleted one frozen client-side
copy of a curve rule (the C0 plate derivation) and should not grow another.

⚑ `loadbot`'s `XP 100000000` is the opposite pattern: it deliberately overshoots
to max because it only wants skill points. A band sprint that overshoots has
destroyed its own measurement.

### 4.3 Where the bands are

Hunting grounds come from the authored world, not from a hand-typed table:
`api/zones/world.json`'s combat spawns carry a position and a resolved level
(`spawnLevel ?? curveLevel`), which is exactly what `simharness`'s
`loadPlacements` (`content.go:163`) already computes. `playbot` reuses that
derivation to pick, per band, a cluster of spawns at that level and the `WARP`
target at its centre.

⚑ Inherited from C1.5 (`plan-xp-formula.md` §13.6): reading a zone needs the
**props** registry as well as `zones` - `world.Zone.resolve` binds every prop
against it - so the content filesystem is the same two sources `aurad` boots
with, plus a `-zone` flag.

### 4.4 Fighting

The aura system makes this the easy part: one active aura, it ticks on
everything in range, so combat is *positioning plus patience*.

- **Target:** nearest mob of the band's species within a radius, from the entity
  vector. Ignore mobs whose `max_health` puts them out of band (elites in a
  normal pull).
- **Engage:** walk to `aura_radius × [PLACEHOLDER 0.6]` of the target and hold.
- **Recover:** below `[PLACEHOLDER 35 %]` HP, walk away until out of combat and
  let regen work (regen is combat-gated since the atmosphere pass, so retreating
  is the only recovery a bot has without abilities).
- **Die:** dying is measured, not a failure. Send `Respawn`, walk back, continue.
  A death rate per band is one of the numbers the run reports.
- **Cooldowns:** fire every equipped cooldown whenever ready, the `castEvery`
  pattern `loadbot` already has. Not clever, and honest about it: the bot is a
  floor on player performance, never a model of a good player. §8.

### 4.5 Questing

A **generic tree walker**, not per-quest scripts (§9 P4): open the conversation,
then repeatedly take the first row that is not `locked`, is not the leave row,
and whose authored `grant_index`/`next` moves the tree forward, echoing the
authored indices back verbatim. Between rows the bot diffs its own
`quest_progress` - that delta *is* the assertion. Kill objectives are then
ordinary engagement against the species the objective names, with the
server-composed `objectives` string as the progress read.

⚑ Two things make this safe: options carry **authored** indices, never presented
ones (`server.fbs:417` L21), and the conversation closes because the field left
the snapshot, never because the client decided to.

### 4.6 The oracle - three assertions, all crisp

| D3 goal | The assertion | How it is read |
| --- | --- | --- |
| Soak stability | 0 ERROR and 0 WARN in the server log for the whole run; no crash; heap flat across the window; the character reloads clean afterwards | log scrape + `-profile :6060` + a post-run `/select` and state compare |
| Ledger integrity | Every accept, advance, turn-in and abandon lands in `quest_progress`; nothing regresses; the ledger survives death and a reconnect; a completed one-shot never returns to offerable | the bot's own snapshot diff, asserted continuously |
| Economy cross-check | kills/hour, XP/hour, deaths/hour, time-to-level per band | a JSON report beside `simharness-report.json`, compared against `simharness -placements` at the same player level |

Everything else the run notices is **logged, not asserted**. No screenshots, no
thresholds nobody has calibrated yet.

### 4.7 Hygiene

Names carry a reserved `hrnss_` prefix so `cmd/harnessdb -cleanup` finds every
row a run leaves. ⚑ **Stop `aurad` before cleaning up** - the server holds live
sessions the DELETE never reaches, and cleaning under a running server has
corrupted save games once already.

## 5. Schema impact

**DB NONE · FlatBuffers NONE · conf NONE · content NONE.** The bot is a new
consumer of interfaces that all exist: the HTTP account endpoints, the
WebSocket protocol, the cheat channel, `GET /skills`, `GET /quests`, and the
`-profile` endpoint. Nothing in `backend/pkg/` changes except the extraction of
D1, which moves code without changing behaviour.

## 6. Chunk breakdown

- **C0 - the extraction.** Transport out of `loadbot` into a shared package;
  no `playbot` yet. Acceptance: a `loadbot` ramp behaves identically before and
  after, and `devops/loadtest.md`'s numbers still reproduce.
- **C1 - the bot that fights.** Mint → seed → verify → warp → engage → recover →
  die → respawn, `-bands` spawning one bot per band, and the economy half of the
  report. Done when a 20-minute run produces a per-band kills/hour table and the
  server log is clean.
- **C2 - the bot that quests.** The conversation walker, the ledger diff, and the
  integrity assertions across death and reconnect.
- **C3 - the soak run and its write-up.** The long run, the report artifact, and
  the first comparison against `simharness`. This chunk's deliverable is a
  *finding*, not code.

Each chunk its own execution session, per working style.

## 7. Test strategy

- **Go tests for the pure parts:** band-table derivation from `world.json`,
  option selection over a fixture tree, report arithmetic. These are the parts
  that can be wrong silently.
- **The bot itself is proven by a run**, against a local dev server, not by a
  unit test of the loop.
- **C0 is proven by equivalence**, not by new tests.
- ⚑ `go test -count=1` after anything that reads `api/` - a content edit does not
  invalidate the Go test cache, and this bot reads content from three places.
- Boot stays 0 WARN / 0 ERROR; the sim batteries must stay byte-identical
  (nothing here touches combat).

## 8. Open questions and deferred

- **Reachability is deferred by D3 + D4.** Neither ruling forbids it; a later
  `-climb` mode (level 1, no XP seeding, walk the quest chain end to end) is the
  natural home, and it is the only version that would ever answer *"can a
  character actually get to 20 by playing?"* - the blind spot behind ascension
  sites C1's recorded *"a price no harness can pay"*.
- **The bot is a floor, not a player.** It kites nothing and switches auras
  never, so its kills/hour is a lower bound. Whether that bound is close enough
  to be worth comparing against `simharness` is itself a C3 finding.
- **Levels 21–30 are out of scope** - a standing gap by ruling (world-replacement
  D5). A bot hitting that wall is confirmation, not a finding.
- **Multi-bot play as a load signal** - N playing characters is a more honest
  load shape than N circling ones. Deliberately not claimed here; `loadbot`
  keeps owning capacity.
- **CI** - no. On demand only, until the report has been trusted at least once.
- **The death XP penalty eats a sprint.** `xp_in_level` resets to 0 on level-up
  *and on the death XP penalty* (`server.fbs:313`), so a death inside the window
  erases partial progress and a high-death band's "one real level" can run far
  past minutes, or in the limit never finish. The data stays honest (deaths are
  measured), but a run needs a **per-band timeout** whose expiry is logged as
  *band did not complete*, never asserted red - P3's rule applied to its own
  first casualty.
- **Do kill objectives read LIFETIME counters?** A C2 execution check, not a
  question to resolve here: the ledger carries lifetime kill counters, so kills
  the bot made during its economy window may already satisfy a quest it accepts
  afterwards - `boars-in-the-field` could complete on accept. Read how objectives
  diff against those counters *before* writing the accept → kill → turn-in
  assertion, or the assertion will encode the wrong expectation.
- **[PLACEHOLDER] numbers:** engagement distance fraction, recover threshold,
  band width, run length, per-band timeout, parallel bot count.

## 9. Proposals adopted without a choice prompt (PO may veto any)

- **P1 - first target band is 1 → 20, and the mechanical quest kinds only**
  (kill and talk). Anything else is logged and skipped.
- **P2 - local dev server only, never live.** Same posture as `authbench`: the
  live DB holds real accounts and nothing off-box holds a copy.
- **P3 - crisp oracles only** (§4.6). A run either has a green assertion or a
  logged observation; nothing in between.
- **P4 - a generic conversation walker, not per-quest scripts**, so content edits
  do not rot the bot.
- **P5 - the report is a JSON artifact**, sibling to `simharness-report.json`,
  so runs are diffable across sessions.

## 10. Landmines found while designing

- **L1 - re-sending the aura activation every tick deals literally zero damage.**
  `SkillComponent.SetActiveAura` zeroes `TickAccumulator`; a bot that re-asserts
  its slot every tick restarts the aura cadence forever. This is the same mechanism
  `plan-mob-tether.md` D5 measured on mobs. The wire already has the escape:
  `ActiveAuraSlotNoChange = -1` (`model/input.go:14`) - send the slot **once**,
  then -1 forever, which is exactly what `loadbot` does and comments obliquely.
- **L2 - the starting aura is pre-equipped but NOT active.** A bot that never
  sends an activation stands in a mob's face doing nothing, and every metric
  reads as "combat is very slow".
- **L3 - `Equip` is refused while in combat.** The whole seed sequence must
  complete before the warp puts the bot near a mob.
- **L4 - `WARP` integer-divides by 120** before the float cast
  (`sys/cmd/cmd.go:76`), so targets land on whole world units.
- **L5 - a rejected cheat is silent on the wire.** Every seeded fact must be read
  back out of the bot's own `GameState` before the window opens - `loadbot`'s
  `auraLive` gauge exists for exactly this reason and its comment says so.
- **L6 - the `hrnss_` prefix is `-dev`-only.** Irrelevant while P2 holds, and a
  trap the moment anyone tries a run elsewhere.
- **L7 - never run `harnessdb -cleanup` under a running `aurad`** (§4.7).
- **L8 - a zone does not load without the props registry** (§4.3).
- **L9 - the known-inconclusive list is not this bot's regressions.**
  `chunk3-charm.mjs`, `filler-batch.mjs` leg 1, `chunk3b-ii-conversation.mjs` and
  `sys.TestDwell` are red or flaky at HEAD. Measure a rate before diagnosing.

## 11. Chunk ledgers

*(appended per execution session - none yet)*
