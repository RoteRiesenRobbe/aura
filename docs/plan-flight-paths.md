# Plan: Flight paths — campfire-to-campfire fast travel (fast travel, part 2)

**Status:** DESIGNED 2026-08-04, not started. Planning session only — no code written.

**Depends on:** `plan-world-map.md` (part 1) — destination selection happens on
that map. PO ruling **D1**: map first, flight second.

**Closes:** backlog **§41** (fast travel), option 2 (flight paths) — chosen over
option 1 (campfire teleport network).

---

## 1. The loop, end to end

1. A character walks into a campfire's bind radius and dwells 1.7 s. That
   already binds their respawn point and refills Camp charges; it now also
   **discovers** the fire as a flight node.
2. Standing at any discovered fire, they open the map (part 1) and click another
   **discovered** fire. Undiscovered fires are not on the map at all (D6).
3. **Takeoff.** The character lifts off, the camera zooms out, movement input is
   ignored, the active aura goes off and no ability can be used.
4. **In flight.** They travel in a straight line at ~4× walk speed, seeing mobs
   and players below them. Ground players **cannot see them**. Mobs cannot
   aggro, target, or damage them; they cannot damage anything.
5. **Landing** at the destination fire. Camera returns, control returns, the aura
   may be switched back on. They are at a fire, which means safe, bound, and
   able to fly onward.

## 2. Why this is cheaper than it looks (surveyed 2026-08-04)

**Campfire ids were built for this.** `world.Campfire.ID` (`world/zone.go:114`)
is a stable, never-reused `spawnpoint-N` whose comment says outright: *"A
campfire is simply the only bindable object that exists today; a waystone or a
bound totem should be able to join this namespace by adding one field."* The
flight network is that namespace, unchanged.

**Discovery is ~2 lines in a loop that already runs.**
`ConnectionStateSystem.trackCampfireDwell` (`sys/state.go:983`) already resolves
"this player is standing in fire X" every tick, already handles the
moved-between-two-fires edge case, and already fires **exactly at threshold** to
bind the respawn anchor and refill Camp charges. Discovery joins that same
trigger — one act, three consequences, which is what made the downtime loop a
single errand and keeps this one from becoming a fourth thing to learn.

**Per-viewer invisibility is one filter.** `core/net.go:66 playerSendState`
already builds each snapshot from that player's own viewport, in a per-player
loop. Omitting flyers is a filter there. This is the cheapest possible slice of
backlog §40's widest-blast-radius archetype (invisibility) — and it stays a
slice **only** if it is scoped to flight and never generalized in this plan.

**Campfires are already hard safe zones.** `model/mob/safezone.go` — hostile mobs
never enter a fire's radius and chases break at its edge (playtest-1 Pass A,
decision 4). So "take off to escape a fight" is a non-problem: you can only take
off from a place where nothing can reach you anyway. **No takeoff cast is needed
as a brake** — that is a real finding, not an omission.

**The `IsGod()` short-circuit in `takeDamage` is the template** for the
in-flight damage gate; `SetInvulnerable` (encounter chunk 9b) is the mob-side
precedent with defined semantics.

## 3. Decisions (PO, 2026-08-04)

- **D2 — Complete graph.** Any discovered fire → any other discovered fire, in a
  straight line. No authored edges, no multi-hop, no polyline routes. *Why:* zero
  content authoring, no editor work, and every campfire ever placed joins the
  network for free. Auras and LoS don't exist, so flying over unseen terrain
  breaks nothing.
- **D3 — The flyer's server viewport grows to ~2.5×** (≈50 × 30 m) for the
  duration. *Why:* the zoom-out is the point, and client zoom is capped by the
  server AOI (§4.3). Bounded, temporary, one player at a time.
- **D4 — Only fires the character has dwelled at.** Discovery = the existing
  bind. *Why:* no new interaction, and the map turns exploration into a visible
  reward.
- **D8 — Time is the only cost; flight speed ≈ 4× walk.** Free, no cooldown, no
  resource. *Why:* it matches the baseline-utility philosophy already ruled for
  Recall and Camp (D7 of `plan-downtime.md`: the cast window is the entire
  brake). Here the flight itself is the brake.
- **D9 — No extra death brake.** Flight does not interact with the GDD §152
  walk-back penalty by any special rule. *Why:* you still only fly fire-to-fire,
  and fights are almost never at a fire — so you fly to the nearest fire and walk
  the last stretch, which is exactly WoW's corpse-run economics. One rule, not
  two.
- **D10 — Discovery is per character.** Scoped like the spellbook, level and
  quest ledger. Not per bloodline slot, not per account. *Why:* the exploration
  beat belongs to the life being played; backlog §36's per-slot scoping stays
  reserved for sacrifice rewards, and GDD §5 constrains those to "breadth, never
  power".
- **D11 — Committed flight, no bail-out.** Once airborne you arrive. *Why:*
  simplest state machine (one timer, two endpoints), matches the reference, and
  there is no "where do I land?" second rule. Cancel-and-drop would have made
  flight a teleport-to-anywhere, which no other movement in the game allows.
- **D12 — Disconnect resolves the flight immediately.** The character is placed
  at the destination the moment the connection drops; reconnect lands them there.
  *Why:* simplest cleanup, no in-air stuck state, nothing to gain by exploiting
  it. ⚑ Interacts with backlog **§52** (leaving the world takes time) — whichever
  lands second must state how the two compose.

## 4. The shape

### 4.1 Server state

A flight is per-player state on the player entity, not a new entity:

```
flight { active, fromID, toID, from, to, startTick, arrivalTick }
```

Position each tick is a lerp from `from` to `to` — the body is **moved**, not
teleported, because the viewport must follow it for the fly-over view to exist
at all. Arrival = `arrivalTick` reached → clear the state, snap to the
destination fire, restore everything §4.2 suppressed.

`arrivalTick = startTick + distance / flightSpeedPerTick`. With
`flightSpeed ≈ 4 × walk = 0.2/tick` (6 units/s): the full 144-unit world crossing
is **~24 s**, a typical hop 8–15 s. [PLACEHOLDER — the whole point of a
placeholder: this is the number to feel out in-game first.]

### 4.2 What flight suppresses, and where

Each of these is an existing gate; none is new machinery. The plan's real work is
that the list is **complete** — a missed one is a flying player who can still be
killed, or who still ticks damage into the world from 40 m up.

| Suppressed | Where it lives |
|---|---|
| Own aura ticks + ability use | `SkillSystem` — skip flying entities |
| Incoming damage | `takeDamage`, at the `IsGod()` short-circuit position |
| Mob aggro/target acquisition | mob acquisition, beside the faction gate |
| Movement input | `core/input.go` (already cancels casts on movement) |
| Collision with props/world | body layer/mask cleared for the duration — flying **over** walls is the point; ⚑ this is deliberately the opposite of `dash`, which respects `blocksMovement` |
| Visibility to others | `playerSendState` filter **+ the part-1 roster filter** |

⚑ **The flyer still sees everything.** Only the outbound direction is filtered.
Two independent directions, and conflating them is the classic invisibility bug.

### 4.3 The viewport grows (D3)

`phy.Box.extent` is private with **no setter**, but `updateBB()` already exists —
so an additive `SetExtent` is a few lines. Takeoff enlarges the flyer's viewport
box to ~2.5×, landing restores it. `camera/logic/Zoom.ts: MAX_VISIBLE_WIDTH`
becomes flight-aware: the cap exists precisely because entities pop in beyond the
streamed AOI, so client zoom and server AOI must move **together** or the
symptom the cap was written to prevent comes straight back.

### 4.4 Wire

- **client→server:** `StartFlight { destinationCampfireID }` — a new
  `ClientMessage` case beside `UseUtility = 11`. ⚑ **Not** a `UtilityKind`:
  utilities are argument-free presses, this one carries a destination.
- **server→client:** flight state on the character (flying flag + destination +
  arrival tick, enough for the client to run its camera and lock input without
  guessing), plus the discovered-fire set (part 1 C2 already wants it).
- Server validates: character is alive, is standing within the bind radius of a
  **discovered** fire, destination is a **different discovered** fire, and no
  flight is already active. All server-side — the client's map is a convenience,
  never the authority.

### 4.5 Client

Camera zoom-out to the flight level, input lock, ability bar disabled with a
visible reason, a "flying to X — Ns" indicator, landing restores. The flight
route may be drawn on the map (part 1's map, part 2's overlay).

## 5. Schema impact — **YES, a new migration**

Per `CLAUDE.md`'s persistence rule, stated explicitly:

- **New table** `game.character_campfires (character_id, campfire_id, discovered_at)`,
  PK `(character_id, campfire_id)`. Per-character (D10). A **new** migration pair
  — shipped SQL is frozen, never edited.
  - ⚑ Alternative considered: rows in the existing generic `game.character_flags`
    (JSONB kv). Cheaper (no migration) but it makes a *set* into stringly-typed
    flags and gives up the FK. Recommendation: the real table. Decide at C1.
- **`characters.home_campfire_id` gets its first writer.** The column exists and
  is documented as *"⚑ Nothing writes this column in 8a … a later ADDITIVE chunk
  with no migration"*. This is that chunk: the bind and the discovery are the
  same event, so persisting one without the other would be strange.
- ⚑ **An id that no longer resolves is UNBOUND, not an error** — the existing
  rule for `home_campfire_id` (deleting a fire in the editor must not lock its
  dwellers out). Discovered-set rows inherit it: a stale row is **skipped
  silently**, never a boot or load failure.
- DB-touching tests need `AURA_TEST_DB_URL`; green without Postgres is not a pass.

## 6. Landmines

1. **Suppression completeness (§4.2) is the whole risk.** Every miss is a
   correctness bug with a gameplay face. Pin each one with a test, in both
   directions.
2. **Two directions of visibility.** Flyer→world must keep working while
   world→flyer is cut. The roster (part 1) is a *second* leak path for the same
   fact — one filter is not enough, and they are in different files.
3. **The zoom cap and the AOI must move together** (§4.3) or entities pop in at
   the edges — the exact symptom `MAX_VISIBLE_WIDTH`'s comment documents.
4. **Collision off means the flyer can land inside geometry** if landing ever
   stops being "exactly at a fire". It is a fire today, and fires are placed in
   open ground — but any future "land anywhere" needs a placement check.
5. **The dwell trigger is exactly-at-threshold**, deliberately (`sys/state.go`).
   Discovery must join that same firing, not add a second condition — a
   *different* threshold for discovery is how the three consequences of one act
   drift apart.
6. **Safe zones are boot-frozen authored fires only.** A player-placed mini-camp
   (R4 C2) is a spawned mob that never enters `s.campfires`, so it can neither
   bind nor refill — and must never become a flight node either. The structure
   already guarantees it; a test pins it.
7. **§52 (leaving the world takes time)** and D12 both decide what a dropped
   connection does. Whichever ships second states the composition.
8. **Death while flying is impossible by construction** (damage is gated) — but
   the *server* can still kill a player, e.g. an admin cheat or a future
   world-effect. Decide the rule when it can happen; today it cannot.

## 7. Chunks

- **C1 — Discovery + persistence.** Discovery in the dwell tracker, the new
  table, the `home_campfire_id` writer, the set on the wire. No flying yet; the
  map (part 1 C2) starts showing a *persisted* set instead of a session one.
- **C2 — The flight state machine, server-side.** `StartFlight`, validation, the
  lerp, arrival, the full suppression list, viewport enlargement. Testable
  headlessly before any client work.
- **C3 — The client flight experience.** Camera zoom-out, input lock, ability-bar
  lockout, the in-flight indicator, landing.
- **C4 — Invisibility.** The `playerSendState` filter + the roster filter. Last on
  purpose: it is the one that is hardest to *see* working, and by then there is a
  flight to fly while watching a second client.
- **C5 — Map destination selection.** Click a discovered fire → confirm → fly.
  Route overlay on the map.

## 8. Test strategy

- **Go:** discovery on dwell (and *not* on a mini-camp); persistence round-trip
  incl. a stale campfire id; flight arrival timing; every §4.2 suppression, each
  pinned in both directions; validation rejections (undiscovered destination, not
  at a fire, already flying, same fire).
- **Store/accounts tests with `AURA_TEST_DB_URL`.**
- **`verify` skill:** two clients — one flies, the other must **not** see them,
  in the snapshot *and* on the map.
- **In-game PO pass:** the fly-over is a feel feature. The speed and the zoom
  level are placeholders precisely because they can only be judged in the air.

## 9. Open / [PLACEHOLDER]

- **Flight speed** (≈4× walk / 0.2 per tick) and **zoom level** — feel-tuned.
- **Whether the world is big enough to need this yet.** It is ~96 s wide on foot.
  Stated plainly so the decision is made with the number in hand: this is
  infrastructure for the world's future size, and it is being built before that
  size exists.
- Do the map's route overlay and the in-flight indicator show ETA in seconds, or
  just progress? (Presentation, C3.)
- Flight and **§48/§52** (join/leave paths) — see D12.

## 10. Chunk ledger

*(empty — nothing built yet)*
