# Plan: Flight paths — campfire-to-campfire fast travel (fast travel, part 2)

**Status:** DESIGNED 2026-08-04; C2's mechanism surveyed and decided 2026-08-05
(D13–D15). **C1 is DONE** — shipped inside `plan-world-map.md` C2 (2026-08-04),
because the PO ruled discovered fires must persist per character while that
chunk was being built and C1 *was* that work. **C2 is BUILT AND
HEADLESS-VERIFIED 2026-08-05** (§10 ledger) — the in-game pass waits for C3,
since no client can send `StartFlight` yet. **C3–C5 not started.**

**Depends on:** `plan-world-map.md` (part 1, **complete and archived 2026-08-04** —
`docs/archive/plan-world-map.md`) — destination selection happens on
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

## 2. Why this is cheaper than it looks (surveyed 2026-08-04, deepened 2026-08-05)

**Campfire ids were built for this.** `world.Campfire.ID` (`world/zone.go:114`)
is a stable, never-reused `spawnpoint-N` whose comment says outright: *"A
campfire is simply the only bindable object that exists today; a waystone or a
bound totem should be able to join this namespace by adding one field."* The
flight network is that namespace, unchanged.

**Discovery already ships.** `ConnectionStateSystem.trackCampfireDwell`
(`sys/state.go:1095`) resolves "this player is standing in fire X" every tick
and fires **exactly at threshold** to bind the respawn anchor, refill Camp
charges — and, since C1, discover the fire. One act, four consequences, on the
same firing.

**Ceasing to exist for the ground world is one operation the engine already
guarantees.** `phy.Space.RemoveShape` (`phy/space.go:326`) purges the removed
shape from every other shape's collision set **on the spot** — the invariant
backlog §54 installed and pinned. `Space.Update` rebuilds its grid from
`s.shapes`, the very map `RemoveShape` deletes from, so a removed shape stays
out across every rebuild until it is explicitly re-added. And
`MobSystem.forgetDeparted` (`sys/mob.go:217`) already sweeps every mob's target
latch, threat table and charm link for a departed entity id — the documented
second half of the same §54 guarantee ("either half alone leaves the mob
latched"). Flight's takeoff is exactly these two calls; landing is the re-add
that join and respawn already perform. This is D13, and it is why §4.2 is not
a long checklist.

**The snapshot carries self explicitly.** `playerSendState` (`core/net.go:117`)
assembles the entity list from the viewer's viewport collision set but sets
`gs.Player = p` separately — so a body absent from the space vanishes from
every *other* player's snapshot while its owner keeps receiving themself. The
roster (`codec.RosterFor`, annotated for this plan since part 1) is the one
player-visibility channel that does not read the space.

**Movement is a position write in the input system.**
`PlayerInputSystem.updateInput` computes `p.Position().Add(v)` and calls
`SetPosition` (`core/input.go:360`), which moves all four player shapes
together (`model/player/player.go:770`). The flight lerp is the same kind of
write at the same site — no new mover, no fight with physics (collision
resolution is irrelevant to a body that isn't in the space).

**Persistence has no live-position column.** `characterState`
(`sys/persist.go:205`) saves anchor + discovered set + progression; login
spawns at the bound anchor. Only the **reconnect stash** carries a position
(`sys/state.go:88`), and reconnect restores it — so D12 is one line at the
stash-build site (D14), not a persistence feature.

**Campfires are already hard safe zones.** `model/mob/safezone.go` — hostile mobs
never enter a fire's radius and chases break at its edge (playtest-1 Pass A,
decision 4). So "take off to escape a fight" is a non-problem: you can only take
off from a place where nothing can reach you anyway. **No takeoff cast is needed
as a brake** — that is a real finding, not an omission.

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

### Decisions (PO, 2026-08-05)

- **D13 — Flight removes the flyer from the physics space.** Takeoff removes
  the **body, hand and aura-sensor shapes** from `phy.Space` (the viewport
  shape stays in) and runs the `forgetDeparted` sweep; landing re-adds them at
  the destination. Non-interaction with the ground world is thereby
  **structural**: nothing that reaches entities through the space — damage,
  heals, debuff application, mob sensors, actor interaction sensors, prop and
  border collision, other players' viewport queries — can reach a shape that
  is not there, and the §54 invariants guarantee no stale reference survives
  the exit. *Why:* one operation with an already-pinned invariant beats a
  per-system suppression checklist whose completeness is unprovable. §4.2
  enumerates the short remainder of paths that do **not** go through the space.
- **D14 — Disconnect mid-flight stashes the destination.** The reconnect
  stash's `position` field records the destination fire, so reconnect and
  session-expiry both resolve to arrival (D12's mechanism, one line). A hard
  server crash mid-flight boots the character at their bound anchor — the
  pre-existing crash semantics for **every** character, since no live-position
  column exists (§2). Accepted.
- **D15 — Both wire directions ship with C2.** `StartFlight` and the
  `Character` flight fields land in one schema pass; C3 is purely client work
  against data already streaming.

## 4. The shape

### 4.1 Server state

A flight is per-player state on the player entity, not a new entity:

```
flight { active, fromID, toID, from, to, startTick, arrivalTick }
```

Position each tick is a lerp from `from` to `to`, written where movement is
always written (`PlayerInputSystem`, priority 100 — before physics rebuilds at
0 and net reads at −100, so the AOI follows within the same tick). The body is
**moved**, not teleported, because the viewport must follow it for the
fly-over view to exist at all. Arrival = `arrivalTick` reached → land: snap to
the destination fire (jittered like every other arrival — respawns, recalls),
re-add the shapes (D13), restore the viewport extent and control.

`arrivalTick = startTick + distance / flightSpeedPerTick`. With
`flightSpeed ≈ 4 × walk = 0.2/tick` (6 units/s): the full 144-unit world crossing
is **~24 s**, a typical hop 8–15 s. [PLACEHOLDER — the whole point of a
placeholder: this is the number to feel out in-game first.]

### 4.2 Non-interaction: structural, plus an enumerated remainder

Everything that can reach a player travels one of exactly **two channels**: the
**physics space** (sensor overlaps, collision sets, spatial queries) or **plain
iteration over the players list**.

**The space channel closes structurally at takeoff (D13).** With the body, hand
and aura sensor out of the space:

- **Incoming damage, debuff application and heals** cannot land — aura effects
  reach entities through sensor overlap, and no overlap records a shape that
  is not there.
- **Mob acquisition** records nothing (sensors), and every latch a mob
  *already* holds — target, threat-table entry, charm link — is severed by the
  `forgetDeparted` sweep. ⚑ Both §54 halves are required, exactly as
  `sys/mob.go` documents: the purge kills what holds the flyer, the sweep
  kills what the mobs hold. Either alone leaves a latch.
- **The flyer's own aura and hand touch nothing** — those shapes left too.
- **Prop and border collision** does not happen — flying over walls is the
  point. No layer/mask editing anywhere.
- **Other players' snapshots** lose the flyer — their viewport boxes query the
  space. The flyer keeps streaming to themself (`gs.Player` is explicit, §2).
- **Actor interaction prompts** die — `InteractionSystem.sense` reads actor
  sensors, so `interactable_entity_id` stays 0 and a stale `Interact` refuses
  against it.

⚑ **The flyer still sees everything**: the viewport shape stays in the space
and follows the lerp. Only the body is gone, so only the outbound direction is
cut — the two directions live in different shapes, which is what makes
conflating them impossible rather than merely warned-against.

**The players-list channel needs a flag check per site.** The complete list,
each with its restore at landing:

| Gate | Site & why |
|---|---|
| Movement input discarded | `core/input.go` — the lerp is the only mover. The **held coast input is cleared at takeoff** (`lastMove`), or a landing replays the pre-takeoff walk direction on the first starved tick. |
| Aura switches + cooldown activations | die with the input discard — they ride `Input`. |
| Active aura forced **off** | synchronously at takeoff (`CancelCast` + `SetActiveAura(-1)`) — an aura merely *skipped* would keep streaming `aura_radius` and sit visually on while doing nothing. Landing does **not** re-enable it; the player switches back on (§1 step 5). |
| `UseUtility` refused | `core/input.go`, beside the existing health gate — Recall mid-flight is a teleport out of a committed flight (D11), Camp would place a mini-camp in mid-air. |
| Campfire dwell tracker skips flyers | `trackCampfireDwell` is position-math over the players list. Without the skip, a slow fly-over **discovers and re-binds to** fires never landed at (breaking D4's premise), and a takeoff within 1.7 s of arrival completes the origin fire's dwell mid-air. |
| Roster | `codec.RosterFor` — C4, as annotated there since part 1. |
| Disconnect stash | position = destination (D14), at the stash-build site. |

⚑ **The audit rule that keeps this list complete:** it is exactly the set of
readers of the players list / per-player position that live outside the space.
That set is grep-able and finite — and any *future* system that iterates
players must ask the flying question at review time.

### 4.3 The viewport grows (D3)

`phy.Box.extent` is private with **no setter**, but `updateBB()` already exists —
so an additive `SetExtent` is a few lines. Takeoff enlarges the flyer's viewport
box to ~2.5×, landing restores it. `camera/logic/Zoom.ts: MAX_VISIBLE_WIDTH`
becomes flight-aware in C3: the cap exists precisely because entities pop in
beyond the streamed AOI, so client zoom and server AOI must move **together** or
the symptom the cap was written to prevent comes straight back. (C2 growing the
server AOI *before* the client zoom moves is the safe half-state: the server
streams more than the client shows — bandwidth, not pop-in.)

⚑ 2.5× linear is **6.25× streamed area**, and the client will render it. The
mobile perf ceiling is a standing open item, so the factor is a
feel-**and**-perf tunable, and C3 inherits the flag.

### 4.4 Wire

- **client→server:** `StartFlight { destination_campfire_id:string }` — a new
  `ClientMessageBody` member at the next free, permanently-pinned value
  (**12**, after `UseUtility = 11`). ⚑ **Not** a `UtilityKind`: utilities are
  argument-free presses, this one carries a destination.
- **server→client:** flight state on `Character`, appended at table end:
  `flying:bool`, `flight_dest:Vec2f`, `flight_arrival_tick:ulong` — enough for
  the client to run its camera, lock input and show ETA without guessing. The
  destination is a position, not an id string: `Character` streams at 30 Hz,
  and the map can resolve id→pos itself for C5's route overlay.
- Both directions ship in C2 (D15) — one `.fbs` edit, one regen, one
  wire-prune pass.
- Server validates: character is alive, no flight already active, standing
  within the bind radius of a **discovered** fire, destination is a
  **different discovered** fire that resolves in the boot-frozen authored set
  (`s.campfires` — which is what keeps a player-placed mini-camp out, and what
  silently skips a stale discovered id whose fire was deleted). Refusal is
  silent, the established pattern. All server-side — the client's map is a
  convenience, never the authority.

### 4.5 Client

Camera zoom-out to the flight level, input lock, ability bar disabled with a
visible reason, a "flying to X — Ns" indicator, landing restores. The flight
route may be drawn on the map (part 1's map, part 2's overlay).

## 5. Schema impact — the migration is SHIPPED; C2 adds NOTHING

Per `CLAUDE.md`'s persistence rule, stated explicitly:

- **New table** `game.character_campfires (character_id, campfire_id, discovered_at)`,
  PK `(character_id, campfire_id)`. Per-character (D10).
  - ✅ **SHIPPED 2026-08-04 as `000002_character_campfires`**, exactly as
    specified, inside `plan-world-map.md` C2. The real table was chosen over
    `character_flags` rows.
    ⚑ One thing this section did not anticipate: the save **inserts** with
    `ON CONFLICT DO NOTHING` rather than the delete-and-reinsert every other
    child table uses — discovery is monotonic, so there is no removal to
    represent, and `discovered_at` is only meaningful if a re-save preserves it.
- **C2 (this plan's next chunk): no migration, no new persisted state.** The
  flight itself is session state; its only persistence touch is the stash
  position under D14, an existing in-memory field. There is no live-position
  column at all (§2), so crash-recovery semantics are unchanged.
- **`characters.home_campfire_id` already has its writer** — the "later ADDITIVE
  chunk" its 8a-era documentation promised has since shipped. The bind is
  persisted end to end: `sys/persist.go` snapshots the connection anchor,
  `store/state.go` writes the column, and login restores the spawn position from
  it. Nothing here touches that path; discovery only **adds** the new table
  beside it. *(Corrected 2026-08-04 — the original survey copied the stale
  "nothing writes this column" comment from `plan-accounts-schema.md` without
  checking the code.)*
- ⚑ **An id that no longer resolves is UNBOUND, not an error** — the existing
  rule for `home_campfire_id` (deleting a fire in the editor must not lock its
  dwellers out). Discovered-set rows inherit it: a stale row is **skipped
  silently**, never a boot or load failure — and flight validation skips it the
  same way (§4.4).
- DB-touching tests need `AURA_TEST_DB_URL`; green without Postgres is not a pass.

## 6. Landmines

1. **The §4.2 flag-gate list is the completeness risk.** The space channel
   cannot be forgotten piecewise (D13 is one operation), but each players-list
   gate can. Pin every gate with a test **in both directions, plus its restore
   at landing** — a flight that never fully lands is the same bug class as one
   that never fully takes off.
2. **Player-visibility channels.** The snapshot leg is structural (D13); the
   roster is a *second* channel for the same fact and needs its own filter, in
   a different file (`codec.RosterFor`, C4). `GameState.discovered_campfires`
   is a third channel and **benign** — a flyer's set leaks no position (checked
   at C1, recorded so it is not re-derived).
3. **The zoom cap and the AOI must move together** (§4.3) or entities pop in at
   the edges — the exact symptom `MAX_VISIBLE_WIDTH`'s comment documents. C2's
   server-only half-state is safe; C3 must close it.
4. **A body out of the space can land inside geometry** if landing ever stops
   being "exactly at a fire". It is a fire today, and fires are placed in open
   ground — but any future "land anywhere" needs a placement check.
5. **The dwell trigger is exactly-at-threshold**, deliberately (`sys/state.go`).
   Discovery already rides that same firing (C1). The flyer skip (§4.2) must
   gate the **whole tracker**, not add a second threshold — a different
   condition for flyers is how the four consequences of one act drift apart.
6. **Safe zones are boot-frozen authored fires only.** A player-placed mini-camp
   (R4 C2) is a spawned mob that never enters `s.campfires`, so it can neither
   bind nor refill — and can never become a flight origin or destination
   either. The structure already guarantees it; a test pins it.
7. **§52 (leaving the world takes time)** and D12/D14 both decide what a dropped
   connection does. Whichever ships second states the composition.
8. **Death while flying is impossible by construction** (nothing reaches the
   body) — but the *server* can still kill a player in principle, e.g. a future
   admin cheat or world-effect. Decide the rule when such a path exists; today
   it does not.
9. **Nothing may assume a live player's body is in the space.** The
   remove→re-add cycle on a live entity is a new usage pattern for machinery
   built for permanent departure — pin the round-trip (shapes back, collisions
   recording, mobs able to re-acquire after landing). **`WARP` mid-flight
   cancels the flight** (shapes restored at the warp target), or the next
   tick's lerp silently snaps the warp back — the dev-cheat variant of this
   landmine.
10. **Flyers cannot see each other** — both bodies are out of the space, so
    neither appears in the other's viewport (nor, after C4, on the map). An
    emergent consequence of D13, accepted and recorded here so it reads as
    designed, not as a bug.

## 7. Chunks

- ~~**C1 — Discovery + persistence.**~~ ✅ **DONE 2026-08-04 — shipped inside
  `plan-world-map.md` C2**, not here. The PO ruled during that chunk that
  discovered fires must persist per character, which is this chunk's entire
  scope, so building it separately would have meant writing a session-only set
  and deleting it a week later. Everything below landed there: discovery in the
  dwell tracker (on the existing exactly-at-threshold firing, per landmine 5),
  the new table, and the set on the wire.
  - **§5's open storage decision is TAKEN: the real table**, not
    `character_flags` — the option this doc recommended.
  - ⚑ **Landmine 2 (player-visibility channels) gains a third channel, and
    it is benign.** `GameState.discovered_campfires` also carries campfire
    knowledge outward. A flyer's *set* leaks no position, so C4 needs no filter
    on it — but this doc told the next person to check every channel, so the
    check is recorded rather than left to be re-derived.
  - Full ledger: `plan-world-map.md` §10, C2.
- **C2 — The flight state machine, server-side.** `StartFlight` + validation,
  both wire directions (D15), the lerp, takeoff/landing as space
  exit/re-entry + the forget sweep (D13), every §4.2 flag gate with its
  restore, the stash rule (D14), viewport enlargement via `SetExtent`.
  Because snapshot invisibility arrives structurally here, the two-client
  "the ground player cannot see the flyer in the snapshot" check belongs to
  **this** chunk's verification, not C4's.
- **C3 — The client flight experience.** Camera zoom-out (moving with the AOI,
  landmine 3), input lock, ability-bar lockout, the in-flight indicator,
  landing. Also owns the **first in-game pass and the speed/zoom feel tuning**
  (C2 was headless-only — no client can send `StartFlight` yet), and the
  coupling of the client zoom cap to the server's 2.5× viewport scale, which
  until then is a `[PLACEHOLDER]` const in the player package
  (`flightViewportScale`).
  - ⚑ **C3 needs a flight trigger, and the real one belongs to C5** (the map
    click). First decision of the C3 session: either build C5's minimal click
    path early (map is already there, discovered fires are already markers —
    the confirm dialog and route overlay can stay C5), or start from a
    dev-console command. The generated TS binding
    (`api/schema/js/aura-api/start-flight.ts`) and the send path just need a
    marshal call beside the existing client messages.
- **C4 — Roster invisibility + map.** The `codec.RosterFor` filter — the one
  visibility channel D13 does not cover — verified on the map with a second
  client.
- **C5 — Map destination selection.** Click a discovered fire → confirm → fly.
  Route overlay on the map.

## 8. Test strategy

- **Go, C2:** validation rejections (dead · already flying · not at a fire ·
  undiscovered destination · same fire · destination id not in `s.campfires`);
  arrival timing + the lerp; the D13 round-trip (body/hand/aura out at
  takeoff, back at landing, collisions recording again, a mob can re-acquire
  a landed player); mob latched at takeoff → forgets (target AND threat
  table AND charm); no damage/debuff/heal lands mid-flight; own aura touches
  nothing; dwell tracker skips flyers (fly-over discovers nothing, takeoff
  within 1.7 s of arrival does not complete the origin dwell); utilities
  refused mid-flight; held-input cleared (no coast on landing); mini-camp is
  never a node (landmine 6); stash position = destination (D14); viewport
  extent round-trip; WARP cancels the flight; within-tick ordering (extent
  grown at input priority is visible to net the same tick).
- **Store/accounts tests with `AURA_TEST_DB_URL`** (nothing new persisted, but
  the suite guards the C1 table this chunk reads).
- **`verify` skill, C2:** two clients — one flies, the other must **not** see
  them in the snapshot. C4 re-runs it for the map/roster.
- **In-game PO pass:** the fly-over is a feel feature. The speed and the zoom
  level are placeholders precisely because they can only be judged in the air.

## 9. Open / [PLACEHOLDER]

- **Flight speed** (≈4× walk / 0.2 per tick) and **zoom level** — feel-tuned;
  the zoom factor doubles as a mobile-perf knob (§4.3).
- **Whether the world is big enough to need this yet.** It is ~96 s wide on foot.
  Stated plainly so the decision is made with the number in hand: this is
  infrastructure for the world's future size, and it is being built before that
  size exists.
- Do the map's route overlay and the in-flight indicator show ETA in seconds, or
  just progress? (Presentation, C3.)
- Flight and **§48/§52** (join/leave paths) — see D12/D14.

## 10. Chunk ledger

### C2 — the flight state machine, server-side

**C2 DONE (2026-08-05), the full server half of flight — awaiting the C3
in-game pass (no client can send `StartFlight` yet), committed `[uncommitted]`**

**Decisions this session (PO):** D13 (flight leaves the physics space — the
structural mechanism replaced a per-system suppression checklist during the
plan review, PO-directed), D14 (disconnect stashes the destination), D15 (both
wire directions in C2). Adopted without a choice prompt, PO may veto: WARP
cancels a flight (landmine 9) · landing jitter = the respawn/recall radius ·
origin fire must itself be discovered.

**What shipped, and where:**

- **Wire:** `StartFlight = 12` (union value pinned) + `Character.flying` /
  `flight_dest` / `flight_arrival_tick` appended at table end; bindings
  regenerated both sides; decode + queue in `codec/client_message.go` +
  `model/client` (`NextStartFlight`), marshal in `codec/gamestate.go`
  (dest/arrival only while airborne).
- **The state machine:** `model/player/flight.go` — `flightState` holds the
  space for exactly the flight's duration; `BeginFlight` = the one exit
  (body+hand+aura out via `RemoveShape`'s §54 purge, viewport stays, AOI
  ×2.5), `Ground()` = the ONE re-entry shared by landing and WARP, so a
  half-restored flyer is unrepresentable. Lerp exact at both endpoints.
- **The machine's driver:** `core/input.go` — `tryStartFlight` (all §4.4
  validation, silent refusal), the takeoff one-shots (cast canceled, aura off
  synchronously, **pending utility/cooldown queues cleared** — see finding 2,
  held coast input dropped), the per-tick lerp with input discarded whole,
  landing with `sys.JitterAround`. Seams wired in `game.go`
  (`SetFlightSeams(connState, space, mobSystem)`).
- **ConnState:** `CampfireAt` (shared with the dwell tracker — one geometry,
  two callers), `CampfireDiscovered`, `CampfirePosition` (stale id → false,
  the `home_campfire_id` rule); the dwell tracker skips flyers; the disconnect
  stash records the destination (D14).
- **Mob side:** `forgetDeparted` exported as `ForgetDeparted` — takeoff fires
  the same sweep disconnect does. `phy.Box` gained the additive
  `SetExtent`/`Extent`. Config: `flightSpeedFactor` 4 [PLACEHOLDER] in the
  player block (all four conf copies + the Go default); viewport scale 2.5
  [PLACEHOLDER] is a player-package const until C3 couples it to the client
  zoom cap.

**Findings that outlive the chunk:**

1. ⚑ **The takeoff purge is instantaneous, not next-rebuild** — pinned by
   test: `Space.RemoveShape` cleans every recorded set before any
   `Space.Update`, so there is no §54-style one-tick window at takeoff. The
   two §54 halves (purge + `ForgetDeparted`) are both required and both fire.
2. ⚑ **`CancelCast` does not clear the pending press queues.** A same-tick
   `UseUtility`+`StartFlight` would have started a Recall cast mid-air —
   Recall completing mid-flight is a teleport out of a committed flight (D11).
   Takeoff now clears `PendingUtilities`+`PendingCooldowns`; the gap class is
   "queued-but-not-yet-consumed state survives the cancel verb".
3. **Snapshot invisibility arrived here structurally** (C4 shrinks to the
   roster filter): a real second player's viewport stops recording the flyer
   at takeoff and records them again at landing — pinned in
   `player/flight_test.go` with real players, standing in for the two-client
   browser check until C3 gives a client a way to fly.
4. **Persistence has no live-position column** (survey correction to nothing —
   §2 records it): D14 is one line at the stash-build site, and crash
   semantics are unchanged. **Schema impact: NONE** — no migration, nothing
   new persisted.

**Verified:** `go build ./...` + full `go test` green · **~28 new Go tests**
(`player/flight_test.go` 10 · `sys/flight_conn_test.go` 7 ·
`core/flight_test.go` 11 incl. the 7-case §4.4 rejection table) ·
`db-test` vs real Postgres (store 13.6 s, accounts 30.6 s, green) · vitest
**207/207** + `tsc --noEmit` clean (regenerated TS bindings compile) ·
`hygiene-wire-prune` **clean** (631 sprites, 0 console errors, 0 ctx losses —
the union add + 3 appended fields renumbered nothing) · dwell-path harnesses
re-run per the coverage map after the `CampfireAt` refactor + flyer skip:
`c2-campfire-markers` **17/17** · `campfire-bind-persistence` **6/6** · boot
0 panics (87 skills/15 factions/65 mobs/10 recipes/5 props/3 milestone
unlocks/4 quests/777 props/485 spawns/5 campfires) · harness residue cleaned
(`harnessdb -cleanup`, 53 accounts, server stopped first).

**Deferred to C3/C4:** the two-client browser flight (needs the client UI) ·
the PO feel pass (speed + zoom are placeholders judged only in the air) ·
the client zoom cap moving with the AOI (landmine 3) · the roster filter
(`codec.RosterFor`, C4).
