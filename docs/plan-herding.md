# Plan: Herding — Hans's sheep run from you, and you drive them into his pen

**Status: DESIGNED 2026-10-17 (planning session, PO in chat). R1-R16 RULED, D1-D11 ⭐ APPROVED
2026-10-17, D12-D13 PROPOSED (R15/R16). H1 BUILT (§10), H2 next.** Two chunks (§5).

**Owns:** the mob `herd` block (a sheep that runs from players and counts in its pen), the
herder list, the pen check, the `herd` objective kind, and Hans's new quest.
**Replaces in play:** `the-strays` ("A Herd Astray"): Hans stops offering it; the file stays (R7).
**Builds on:** the flee movement (`plan-mob-depth.md` chunk 2), regions with ids
(`plan-region-identity.md`, the reach objective R2), the shared kill/harvest counters
(`plan-quests.md` D2), the TTL-expiry removal path, spawn-point respawn.
**Schema (as designed):** DB none · **wire +1 EntityType (`Sheep`)** · conf none ·
**content format: mob +`herd` block, quest +`herd` objective kind** · zone: +1 region in the
existing format.

⚑ Line references pinned 2026-10-17 at `270355ef` (main); re-verify before relying on them.

---

## 1. What this is

A new quest for Shepherd Hans: bring six sheep back to the pen beside his house. Sheep run
away from any player who comes close. Walk at them from the right side and they go where you
want; drive one through the gate and keep it inside for two seconds, and it counts —
**"1/6 sheep brought back"** — then leaves the world and later grazes again on the pasture.

Nobody is fighting: a sheep stays unkillable and untargetable (townsfolk, collision layer 97
without Action). Herding is positioning, the game's one skill expression, without an aura.

### 1.1 What already exists and is reused

| Need | Existing piece |
|---|---|
| Running away | `Mob.moveAwayFrom` (`model/mob/mob.go:1414`), shared by stag flee, pacifist flee and fear; deflects off blockers through `steer` |
| Noticing a player without being hostile | The conversant widening of the sensor mask (`mob.go:922`): a mob that must see players gets `LayerPlayerCollision` whatever its faction |
| The pen | Already built at (-228.5…-224.1, -26.0…-21.7): four fence paths (`blocksMovement`) with a 1.56 u gap on the north side; the `Gate` prop there is decoration (`blocksMovement: false`) |
| "Inside the pen" | Profile-less regions (`homestead`, `farmreinhard`) and `world.InRegion`, already tested every tick for the reach objective (`sys/quest.go:96`) |
| Leaving the world without a death | The TTL-expiry shape (`mob.go:1144`): health zeroed, `Update` reports false, **no kill rewards** |
| Coming back | `MobSystem.onMobDeath` (`sys/mob.go:409`) schedules a respawn at the authored spawn after `respawnTicks` |
| "1/6" | `Ledger.NoteKill(species)`: lifetime counters per species, baselined at stage entry; `harvest` already shares them (D2), and `{n}/{m}` reads them |

---

## 2. PO rulings (2026-10-17)

- **R1 — sheep run from players who get close.** No hit needed (stags need one).
- **R2 — credit goes to every herder from the last few seconds**, not only the last player
  the sheep ran from. Two players herding one sheep both get it; the window keeps a player who
  scared it once and left from getting credit (§3 D3).
- **R3 — a sheep counts after 2 seconds inside the pen**, then despawns.
- **R4 — the gate stays as built** (1.56 u gap).
- **R5 — the count is 6.**
- **R6 — sheep are slower than stags.**
- **R7 — the new quest replaces "A Herd Astray" in play.** Hans no longer offers it; the quest
  file is NOT deleted yet.
- **R8 — the defaults proposed in chat stand** (PO "ok", 2026-10-17): the named strays and the
  Dog stay; mid-quest "A Herd Astray" players can abandon; reward 180 XP; text drafted by Claude
  in en + de for PO approval; the numbers in D8; the small calls in D4/D5. All numbers are
  [PLACEHOLDER].
- **R9 — companions do not herd** (was Q2). Only players make a sheep run and count as
  herders.
- **R10 — a penned sheep fades out** (was Q1). That is already what the client does with
  every mob that leaves the snapshot (`EntityManager.ts` `fadeOutAndHide`, 1.5 s, client-only,
  zero wire), so it costs nothing.
- **R11 — ten new sheep near the pen** (was Q3). The existing Sheep spawn at (-245.6, 15.2)
  stays where it is (D10).
- **R12 — a sheep runs from all nearby players at once** (was Q4): the sum of pushes, D2.
- **R13 — sheep get a placeholder sheep image** instead of the `NpcPlaceholder` marker (D11).
  This overrides the 2026-10-17 note in the sheep files that a bespoke sheep "waits for real
  art": you cannot herd what does not read as a sheep.
- **R14 — the pen is optional, and stays on the definition** (was Q5). `"herd": {}` is an
  animal that only runs from players and counts nowhere. The pen moves onto the spawn only
  when a second pen for one species is actually needed.
- **R15 — the quest has two stages, folded into H2** (PO 2026-10-17, after H1): first the
  flock (pen 6 Sheep), then the three named strays, each a herdable animal with its own
  personality, out somewhere dangerous (D7, D12). This replaces the D9 line "the named strays
  stay still".
- **R16 — talking to a stray is optional.** No objective asks for it; the strays keep their
  lines for whoever gets close enough (D13).

---

## 3. Design

### D1 — one `herd` block on the mob definition

```json
"herd": { "pen": "hans-pen" }
```

A mob with `herd` runs from players; with a `pen` it also counts in that pen. **`pen` is
optional** (R14): `"herd": {}` is an animal that only runs. The **run radius is the sensor
radius** (`body.aggroRadius`), so there is no second radius knob. Loading checks that a
present `pen` names a region in the place list (the `BindRegions` shape); an unknown pen fails
boot. The pen is per definition: one species, one pen (R14).

### D2 — running: away from every player in range

Each tick, a herd mob with at least one live, non-flying player in its sensor runs. The
direction is away from the **sum of the pushes**: each player contributes the unit vector from
them to the sheep, weighted by 1/distance. One player = straight away; two players flanking it
steer it between them, which is what makes herding together work. If the pushes cancel exactly,
it keeps its heading (the `moveAwayFrom` fallback).

- It runs at full speed (`stepLength`); `idleSpeedFactor` stays for grazing.
- **No aggro, no threat, no combat state, no `returnPos`.** Running is a movement branch in
  `Mob.Update`'s switch, ahead of idle. It never calls `noteCombatEntry`, so leash, regen,
  combat music and the M1-F5(B) walk-home freeze are untouched.
- Players only: companions on the player layer (R9), other mobs and flyers are ignored.

Sensor: a herd mob widens its mask to `LayerPlayerCollision`, the conversant precedent.

### D3 — the herder list

`map[playerID] → {player, lastTick}`. Every player in the sensor is noted each tick, not just
the nearest. An entry expires **300 ticks (10 s)** after its last tick. It lives only in memory
(a restart respawns every sheep anyway) and is cleared when the sheep despawns.

### D4 — the pen check

Only a herd mob with a `pen` runs this check (no pen: no timer, no herder credit, it only
runs). When its position is inside its pen region, `penTicks` counts up; outside, it resets
to 0. At **60 ticks (2 s)** the sheep is penned:

1. every herder still in the list (live, still in the world) gets `NoteKill(definition ID)`;
2. the sheep leaves the world through the TTL-expiry shape (no XP, no unlock rolls);
3. `onMobDeath` schedules its respawn at the authored spawn after `respawnTicks`.

**A sheep with no herders** (it wandered in) despawns the same way with no credit, so the pen
never fills. Containment is the sheep's centre in the polygon, the same test the reach objective
uses. Where the check runs: `MobSystem` gets the region map (as `NewQuestSystem` does) and asks
the mob after `Update`; the mob owns the timer and the credit. Final wiring is an H1 call.

### D5 — credit rides the shared species counter

`NoteKill` on the Sheep's definition id, the counter `kill` and `harvest` already share
(plan-quests D2). Every player's lifetime counter ticks; the ledger counts only for a player
whose current stage wants it, from stage entry. So "only quest holders get credit" needs no
code, and a sheep penned before accepting does not count.

### D6 — the `herd` objective kind (H2)

```json
{ "kind": "herd", "species": "Sheep", "count": 6 }
```

A third name over the same counters (like `harvest`). Validation: the species' definition must
carry `herd` with a `pen` (else the objective could never move); takes `count`; no `chance`. The derived
journal line gets its own lang key (en + de), and the quest authors a stage tracker
"{n}/{m} sheep brought back" anyway.

**Objective-level `tracker` widens from `talk_to` only to `talk_to` and `herd`** (R15): stage
2 names three individuals, and the derived line would read like a species ("Bring back the
Baabara"). Same rule as today otherwise: rejected beside a stage tracker. A named stray is
its own definition, so `herd` with count 1 per name counts each one separately; that is what
the per-definition counter already does, no engine change.

### D7 — the quest

- id `back-to-the-pen`, title "Back to the Pen" [PLACEHOLDER, text owed], level 2. A new id,
  not `the-strays` reused: that quest's `find` stage asked for talks, and a saved ledger
  sitting in it would silently change meaning (R7 keeps its file).
- Stages (R15):
  1. `flock`: `herd Sheep ×6`, stage tracker "{n}/{m} sheep brought back";
  2. `strays`: three objectives, `herd Baabara`, `herd Woolliam`, `herd Lambert` (count 1
     each), each with an objective tracker ("Bring Baabara home"), so the journal ticks them
     one by one, the way `the-strays` ticked its talks;
  3. `report` (dialogue, tracker) → `done`.
- Hans offers it and turns it in; turn-in pays **180 XP** [PLACEHOLDER] (L2 half-level rule).
  Two stages make it longer; whether it pays more is a PO call at the text approval.
- Dialogue drafted from his current strays lines, en + de, for PO approval; Hans gets one
  progress answer per non-terminal stage (the `he-who-cried-wolf` shape).

### D8 — content

- **`Sheep` (id 78) becomes the herd.** Gains `speed 0.6` (Stag 0.85), `body.aggroRadius 2.5`
  (the run radius), `herd.pen "hans-pen"`, and **`collisionMask 80`** (MobStatic + Border, the
  mob default): today it is `16` and would walk through fences. It stays townsfolk on layer 97,
  so it stays unhittable and players bump into it. Reusing id 78 means no new mob, no new
  EntityType, and the roster censuses stay green.
- **Ten new spawns** (R11) spread near the pen, 8-20 u out, `wanderRadius 2`,
  `idleSpeedFactor 0.3`, `respawnTicks 1800` (60 s), `respawnVariancePct 0.2`. Ten on the field
  for a count of six leaves slack for a second player and for sheep still respawning. The PO
  moves them in Tiled as wanted.
- **Region `hans-pen`**, no profile, on the regions layer, covering the pen's inside.

### D9 — Hans, and what stays

- Hans's `the-strays` rows go: root options `a-herd-astray` / `about-your-herd`, nodes
  `strays`, `strays_running`, `strays_on_it`. The new quest's rows take their place.
- `api/quests/the-strays.json` stays. Boot will warn "offered by no conversant" (a warning, not
  fatal). It goes into `docs/cleanup.md` with its trigger: **the PO deletes or restores it.**
- ~~Baabara, Woolliam, Lambert stay where they are, still~~ — superseded by R15/D12: they
  become herdable and move. The Dog stays where it is and still teaches SummonCompanion;
  nothing points players to it now.
- A player mid-`the-strays` cannot turn it in and can abandon it from the journal.

### D10 — the generic Sheep already placed

The one existing `Sheep` spawn at (-245.6, 15.2), 37 u from the pen, stays where it is (R11).
It is the same definition, so it runs from players and counts if someone drives it all the way
to the pen; nothing special-cases it.

### D12 — the three strays: herdable, far away, each with a personality (R15) [proposed]

Each named file gains `"herd": { "pen": "hans-pen" }`, a `speed > 0`, `collisionMask 80` and
its own run radius (`aggroRadius`). Personality is numbers only, no code [PLACEHOLDER]:

| Stray | Personality | speed | run radius | wander |
|---|---|---|---|---|
| Baabara | skittish: bolts early and fast | 0.75 | 3.5 | 3 |
| Woolliam | stubborn: lets you walk right up, then trudges | 0.4 | 1.5 | 1 |
| Lambert | in between | 0.6 | 2.5 | 2 |

They move out to three dangerous spots in Zone 1, one each (by the wolves, among the beach's
Sand Clampers, and one more), picked at H2 start from `world.json` and shown to the PO before
the spawns move. `respawnTicks 1800` on each, so a penned stray is back out at its far spot a
minute later ("they wander off again"), which keeps the stage open to the next player. A
stray penned before a player reaches stage 2 does not count for them (counts start at stage
entry).

⚑ They keep their `interaction` (R16), so their talk range (2.0) and run radius interact:
Woolliam (1.5) can be talked to by walking up, Baabara only when cornered or held (D13).

### D13 — a stray in conversation holds still (R16) [proposed]

The herd case in `Mob.Update` gets the conversation guard the idle branch already has (D22
of the entity-model plan: an actor in conversation holds position). Without it a talk with
Baabara ends the moment the panel opens, because she runs out of range. One line in H2, with
a test; the guard is per-actor, so while one player talks, the stray ignores every player's
push, the same as a talking NPC stops patrolling for everyone.

### D11 — a placeholder sheep image (R13)

- **Art:** `frontend/src/features/game-objects/assets/mobs/sheep.svg`, a simple top-down
  placeholder drawn by Claude (a cloud of wool, a dark head, read at a glance from above), the
  same size class as the Stag. Replaced at the Zone 1 art pass without touching anything else.
- **Wire:** a new `EntityType` **`Sheep`**, appended and permanent (`api/schema/server.fbs`;
  the next free value at build time, **121** today). Regenerate Go + TS bindings.
- **Client:** a `Sheep` class in `game-objects/logic/Mobs.ts`, its `GraphicsConfig.mobs`
  entry, and the exhaustive `GameStateMessage.ts` record entry. Drawn like the Stag (wildlife
  layer, no medallion frame) [proposed].
- **Who wears it:** all four sheep, the generic `Sheep` and Baabara, Woolliam and Lambert
  [proposed]; their `_comment`s drop the "waits for real art" note.
- Tiled palette regenerated (the sheep template now shows the image).

---

## 4. What changes for the author

- **Tiled:** one new region `hans-pen` on the regions layer; ten Sheep spawns. Restart after
  saving (a zone edit is half-live), and `cp-defs` by hand on the Windows box (no `make`).
- **Mob JSON:** an animal becomes herdable with `"herd": { "pen": "<region id>" }` (or
  `"herd": {}` to only run from players), a `speed > 0`, a `collisionMask` that includes
  MobStatic (64), and `aggroRadius` as its run radius. Recorded in `manual-content-authoring.md` and the `add-content` skill in H2.
- **Quest JSON:** `{ "kind": "herd", "species": "<herd mob>", "count": N }`.

---

## 5. Chunks

### H1 — sheep that run, and the pen (engine + world)

The `herd` block (load, validate the pen), sensor widening, the run branch (D2), the herder
list (D3), the pen check, despawn and respawn (D4), credit through `NoteKill` (D5). Content: the
Sheep values (D8), ten spawns, `hans-pen`, the placeholder sheep image (D11). Go tests
first (§6).
**In-game (PO):** walk at a sheep and it runs; it holds off fences; it fits through the gate;
it fades 2 s after going in and grazes again 60 s later. Feel: speed, radius, the gate.
No quest yet: the counter is checked by test.

### H2 — the quest

The `herd` objective kind (D6) and its validation, the objective tracker widened to `herd`,
the conversing guard on the herd case (D13), the three strays made herdable and moved
(D12, spots shown to the PO first), `back-to-the-pen.json` with both stages (D7), Hans's rows (D9),
the en + de text (`extract-english.mjs`, then `UPDATE_LANG=1 … TestLang`), the content tests
re-pointed (§8), the `cleanup.md` entry, the authoring docs.
**In-game (PO):** take the quest from Hans, pen six, see 1/6 … 6/6 in the tracker; the stage
turns to the three strays, find and drive each one home (three ticks), optionally talk to one;
turn in, 180 XP. Two players herding one sheep both get credit. Feel: the three personalities.

---

## 6. Test strategy

**`model/mob` (H1, failing first):**
- one player in range → the sheep moves straight away from them; none in range → it grazes;
- two players flanking → it moves between them (the sum, not the nearest);
- a flying player, a companion, a hostile mob in range → no run;
- running sets no aggro target, no threat, no `returnPos`, and `InCombat()` stays false;
- herder expiry: a player last seen 301 ticks ago is gone, 299 ticks ago is kept;
- pen: 59 ticks inside → nothing; leaving at tick 30 resets; 60 ticks → every live herder's
  `KillCount(Sheep)` +1, the mob reports dead, and no XP is granted;
- no herders → despawn, no credit;
- the despawned point respawns after `respawnTicks` (`sys`).

**Loader:** `herd.pen` naming an unknown region fails; a valid one binds; `"herd": {}` loads,
and that mob runs but never runs the pen check.
**Content (derive, never hardcode):** every mob with `herd` names a region in the place list
and has `speed > 0` and a mask including MobStatic. No coordinates pinned.
**`quests` (H2):** `herd` loads; it is rejected on a species without `herd` or without a pen;
it counts from stage entry; `{n}/{m}` substitutes it; an objective tracker on `herd` is
accepted and still rejected beside a stage tracker; three count-1 `herd` objectives on three
definitions tick separately.
**`model/mob` (H2):** a conversing herd animal does not run, and runs again when the talk ends.
**Harness (optional, H2):** WARP beside a sheep, assert it moves away; QUEST cheat to the
stage, pen one, read 1/6 in the journal. Pushing a sheep through the gate with a bot is likely
flaky; the PO pass covers it.

---

## 7. Open PO calls

- ~~**Q1 — what a penned sheep looks like as it leaves.**~~ RULED 2026-10-17: fade (R10).
- ~~**Q2 — should a player's companion herd?**~~ RULED 2026-10-17: no (R9).
- ~~**Q3 — the existing generic Sheep spawn.**~~ RULED 2026-10-17: stays; ten new (R11).
- ~~**Q4 — the push direction.**~~ RULED 2026-10-17: all nearby players (R12).
- ~~**Q5 — reuse beyond sheep.**~~ RULED 2026-10-17 (R14): the pen is optional and stays on
  the definition. Nothing is sheep-specific: any mob with `herd` gets it (a stag too; its
  combat flee still wins while it is in combat). Moving the pen onto the spawn later costs a
  zone-format key (three serializers).

No open PO calls.

---

## 8. Landmines

- **The Sheep's mask is `16` today: border only. It walks through fences** until it is 80.
- **Sheep block each other.** Layer 97 includes MobStatic and the new mask sees MobStatic, so
  several sheep pressed into the 1.56 u gap can jam, and ten near the pen make that likelier.
  Watch it in H1.
- **A sheep left alone walks back to its spawn** (`updateWander`, or `idleWalk(spawnPosition)`
  without a wander radius, `patrol.go:121`). A herd needs steady pressure, which is the
  point; a sheep inside the pen pushes at the fence toward home, so the 2 s finishes first.
- **Never set `returnPos` from the run branch:** M1-F5(B) freezes a mob walking home off its
  route.
- **Dormancy:** a sleeping mob runs no pen check. A herded sheep always has a player near
  (awake), so this only matters for a sheep left in the pen, and that one despawns in 2 s.
- **The counter is shared with kills.** A future `kill Sheep` objective would count pennings.
  Moot while sheep are unkillable; recorded.
- **Tests that pin `the-strays`:** `quests/content_test.go:88` (title) and `:376` (turn-in
  180 XP), `items/mobs/interaction_content_test.go:87` (Hans offers it), and
  `quests/ledger_test.go:700` (comment only). H2 re-points them to the new quest.
- **Lang:** Hans's removed strays keys leave `conversations.arb` (en + de) together; refresh the
  records with `UPDATE_LANG=1 go test -count=1 -run TestLang ./cmd/aurad/`.
- **The EntityType value:** `plan-passages.md` still reserves `Passage = 120`, but `BerryBush`
  took 120 (`5cf3b781`). Whichever plan builds first takes the next free value; the other
  re-reads `server.fbs` then.
- **After the `.fbs` regen**, webpack can keep compiling the old enum while `tsc` is clean:
  clear `frontend/node_modules/.cache/webpack` and restart.
- A content edit does not invalidate the Go test cache (`-count=1`); `-content ../api` or a
  rebuild after every `api/` edit.

---

## 9. Schema impact

- **DB:** none. The ledger already stores per-species lifetime counters and stage baselines; the
  herder list and the pen timer are in memory only.
- **Wire:** +1 `EntityType` (`Sheep`, appended, permanent; D11). Running itself is position.
- **Conf:** none.
- **Content format:** mob +`herd { pen }` · quest +`herd` objective kind.
- **Zone:** +1 region `hans-pen` (existing format) · +10 spawns.
- **Lang:** new quest and dialogue keys (en + de); Hans's strays keys removed.

---

## 10. Chunk ledgers

### H1 — BUILT 2026-10-17, uncommitted, PO look owed

- **Engine:** `mobs.Herd` + `BindHerdPens` (boot: unlisted pen fails, undrawn warns),
  `model/mob/herd.go` (`herdPush`, `tickHerd`, `UpdatePen`), the `herded` case in
  `Mob.Update` below every combat case, the sensor widening beside the conversant one,
  `ForgetEntity` and `SetDormant(true)` drop herders, `Pristine` refuses a running pen timer;
  `MobSystem.SetPens` + `penned()` sends a penned animal through the death sweep; wired in
  `core/game.go` and `cmd/aurad/content.go`.
- **Wire:** `EntityType.Sheep = 121` (Go + TS bindings regenerated, only that value moved).
- **Client:** `Sheep` class + `GraphicsConfig.mobs.sheep` + `sheep.svg`. ⚑ **Correction to
  D11:** the Stag DOES wear a medallion frame (`forestBorder.png`), so "drawn like the Stag"
  means WITH the frame, which is what shipped.
- **Content:** `sheep.json` (speed 0.6, aggroRadius 2.5, mask 80, wander 2 at 0.3,
  `herd.pen hans-pen`, entityType Sheep); the named three wear `Sheep` and stay still; ten
  spawns + region `hans-pen` in `world.json` (added on top of the PO's uncommitted map
  edits); `hans-pen` listed in `regions.json`, en + de banner text ("Sheep Pen" /
  "Schafpferch", subtitle Farmlands / Ackerland). ⚑ Being a listed place, **walking into the
  pen shows the region banner**; look at it in the PO pass.
- **Verified:** Go tests first (`items/mobs` 6, `model/mob` 13, `sys` 3), full suite green bar
  the two known reds (`world` C1b Tree/Boulder, `simharness` placements); `aurad -validate`
  0 findings; tsc clean; vitest 1772/0; palette regenerated; harness `herd-h1.mjs` 4/4 on a fresh
  server: sheep drawn near the pen, a sheep ran 1.57 u from a player warped 1.2 u beside it,
  a sheep driven through the gate left 2.5-3.8 s after the probe first saw it inside (the
  probe samples every ~1 s), 0 page errors. The named strays are excluded by their spawns.
- **Schema:** DB/conf NONE · wire +1 EntityType · content +`herd` block · zone +1 region +10
  spawns.
