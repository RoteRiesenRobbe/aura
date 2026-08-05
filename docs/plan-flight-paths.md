# Plan: Flight paths — campfire-to-campfire fast travel (fast travel, part 2)

**Status:** DESIGNED 2026-08-04; C2's mechanism surveyed and decided 2026-08-05
(D13–D15). **C1 is DONE** — shipped inside `plan-world-map.md` C2 (2026-08-04),
because the PO ruled discovered fires must persist per character while that
chunk was being built and C1 *was* that work. **C2 (`bc01a45c`) and C3
(`bcfb4faf`) are both DONE 2026-08-05, C3 PO-VERIFIED IN-GAME the same day**
(§10 ledgers) — flight is playable end to end. **C4 is DONE 2026-08-05,
PO-verified in-game the same day, and it INVERTED**: the PO ruled a flyer stays
visible on the map (**D16**), so the roster filter this plan specified from §2
onward was never built. **C5 — the route overlay — is the last chunk, and the
only one left.**

⚑ **The C3 feel pass reshaped the design, so read §10 C3 "The PO feel pass"
before §1 or §3.** It moved the trigger to **`E` at the campfire** (an
`M`-opened map is read-only), retuned **D8's speed to 2.8×** and **D3's
viewport to 1.2×**, and — by removing the not-at-a-fire case rather than
reporting it — **shrank C5** to the route overlay plus one open question.

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
2. Standing at any discovered fire, **`E`** (the interact verb, prompted by a
   badge over the fire) opens the map, and they press another **discovered**
   fire twice — once to arm, once to confirm. Undiscovered fires are not on the
   map at all (D6). ⚑ **As built (C3 feel pass), not as designed:** the map
   opened with `M` is read-only, so this is the *only* route into flight and the
   "press while not at a fire" case cannot occur.
3. **Takeoff.** The character lifts off, the camera zooms out, movement input is
   ignored, the active aura goes off and no ability can be used.
4. **In flight.** They travel in a straight line at ~2.8× walk speed (4× as
   designed; retuned in the C3 feel pass), seeing mobs
   and players below them. Ground players **cannot see them in the world** —
   but **can** see them crossing the **map** (D16; the two are different facts).
   Mobs cannot aggro, target, or damage them; they cannot damage anything.
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
player-visibility channel that does not read the space — which is exactly why
it can, and by **D16 does**, keep showing a flyer the world cannot see.

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
- **D3 — The flyer's server viewport grows** for the duration. ⚑ **Shipped at
  2.5×, retuned to 1.2× in the C3 feel pass** (twice, both "still too far
  out") — which spends this decision's perf rationale: streamed area is now
  ~1.4× the ground viewport, not ~6.25×. *Why:* the zoom-out is the point, and client zoom is capped by the
  server AOI (§4.3). Bounded, temporary, one player at a time.
- **D4 — Only fires the character has dwelled at.** Discovery = the existing
  bind. *Why:* no new interaction, and the map turns exploration into a visible
  reward.
- **D8 — Time is the only cost; flight speed ≈ 4× walk** (⚑ **retuned to 2.8×**
  in the C3 feel pass — the first in-air judgement; 4× read as too fast). Free, no cooldown, no
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
- ⭐ **D16 — A FLYER IS INVISIBLE IN THE WORLD AND VISIBLE ON THE MAP.** The
  roster is **not** filtered; a flyer stays a dot, and the dot tracks the
  crossing. *Why:* this plan had assumed the two were one fact and told C4 to
  close "the second leak path". The PO ruled they are **two facts**. Fires and
  the routes between them are what the map is *for*, so a dot crossing toward a
  fire is the map doing its job — and it becomes the only way to know someone
  is inbound: a dot approaches a fire, then a player materialises. Nothing
  argued for the filter except consistency with the world channel (there is no
  PvP and no griefing vector, §5 of the GDD), and consistency between two
  channels that answer **different questions** is not a property worth having.
  ⚑ **This decision INVERTS C4**, which becomes the ruling, a pin test that
  fails if anyone adds the filter, and the correction of every site that used
  to instruct them to. ⚑ It also costs nothing at runtime and, unlike the
  filter, has **no restore at landing to forget** (landmine 1's rule met by
  construction rather than by a mechanism).

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
| ~~Roster~~ — **NOT a gate** | `codec.RosterFor` deliberately does **not** check `Flying()` (**D16**): the map keeps the flyer. This row survives struck through because five source comments and this table all used to specify the opposite. |
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
2. **Player-visibility channels.** ⚑ **RESOLVED AT C4, AND NOT THE WAY THIS
   LANDMINE ASSUMED.** It read: *"the roster is a second channel for the same
   fact and needs its own filter"*. It is a channel for a **different** fact,
   and it is deliberately left open (**D16**) — the world hides the flyer, the
   map shows them. The snapshot leg stays structural (D13);
   `GameState.discovered_campfires` is a third channel and **benign** — a
   flyer's set leaks no position (checked at C1, recorded so it is not
   re-derived). ⚑ The durable lesson is the one that outlives the ruling:
   **"two channels carry the same fact" is a claim to verify, not to assume**.
   Enumerating the channels was right; concluding they must agree was not.
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
- **C4 — ~~Roster invisibility~~ → the map keeps the flyer (D16).** ✅ **DONE
  2026-08-05.** The chunk inverted on a PO ruling before a line was written:
  there is **no** `codec.RosterFor` filter. What shipped is the ruling, the pin
  test that fails if anyone adds one, and the correction of every site that
  instructed them to. Verified on the map with a second client.
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
in-game pass (no client can send `StartFlight` yet), committed `bc01a45c`**

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
   roster filter — *and C4 then deleted even that, D16*): a real second
   player's viewport stops recording the flyer
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
(`codec.RosterFor`, C4) — *which C4 then ruled out of existence (D16)*.

### C3 — the client flight experience

**C3 DONE (2026-08-05), the client flight experience — PO-VERIFIED IN-GAME
2026-08-05, committed `bcfb4faf`.** Built and headless-verified first (the
first time flight ran outside a Go test), then reshaped by the PO feel pass the
same day — see **"The PO feel pass"** at the end of this ledger, which is where
the trigger, both tuning knobs and the render order actually landed.

**Decisions this session (PO, all four via choice prompt):** the trigger is
**C5's map click built early and minimally** (the map's own C1 comment had
already reserved the gesture: *"Part 2 turns it into destination selection"*) ·
a **two-press arm** stands in for C5's confirm dialog · the camera
**hard-follows** while airborne · the indicator shows **progress AND an ETA in
seconds**, closing §9's open question.

**What shipped, and where:**

- **Wire read:** `GameStateMessage.ts` — `flying` / `flightDest` /
  `flightArrivalTick` on the Character branch, fed from `Backend.receiveSnapshot`
  together with the tick from the same message.
- **The state:** `features/flight/logic/Flight.ts` — a dependency **leaf** four
  surfaces read (camera, Controls, HUD, the utility bar). Owns the Zoom
  override; enforces nothing.
- **Zoom:** `FLIGHT_VIEWPORT_SCALE` named after the Go const, with both flight
  bounds **derived** from the ground ones by that one factor — landmine 3
  closed, and `Zoom.test.ts` fails if either side is retuned alone. (Shipped at
  2.5; the PO pass took it to **1.2** — see below, including the cross-language
  pin that makes a half-applied retune impossible.)
- **Camera:** hard-follow in `Camera.update`, ahead of the existing
  teleport-snap branch.
- **HUD:** `rejectWhileFlying()` beside `rejectEquipInCombat()`, on all four
  ability entry points; `#flightBar` (the cast bar's shape and second
  convention); `#actionBars.flightLocked`; the zoom buttons grey out with it.
- **Controls:** one gate covering movement, rotation, the slot hotkeys and
  interact — they all ride the same Input message or the same HUD handlers.
- **The trigger:** `StartFlightMessage`, `pickCampfireMarker` (pure, in
  `MapScale`), `MapCampfires.markerAt`/`setArmed` + the armed ring, and the
  arm/confirm in `MiniMap.pressOnMap`.

**Findings that outlive the chunk:**

1. ⚑ **The camera could not have kept up, and it would have been misdiagnosed
   as flight speed.** `Camera` fixes the steering Vehicle's max speed at
   `movementSpeed × 2` in its constructor, and flight is 4× walk — the flyer
   would have drifted to the screen edge for the whole crossing. Found by
   reading the constructor, not by flying. The general shape: **a constant set
   once from a rate that later gains a second, faster mode.**
2. ⚑ **The ability lock has four entry points, not one.** Gating `Controls`
   covers only the keyboard; slot *clicks* reach `toggleAuraSlot` /
   `activateCooldownSlot` directly and the utilities go through
   `Utilities.trigger`. The guard belongs at the shared handlers, which is
   where both keyboard and mouse already meet.
3. ⚑ **`flight_arrival_tick` is `ulong` → `bigint` in the generated binding,**
   and `bigint − number` throws. Narrowed at unmarshal, like `tick` and the
   entity ids.
4. ⚑ **§4.5's "flying to X" cannot be built as written** — `flight_dest` is a
   position by deliberate choice (§4.4) and campfire ids are bare
   `spawnpoint-N` with no display name. The ETA is the half that exists.
5. **Flight is a zoom OVERRIDE, not a fourth level.** `currentIndex` is never
   touched, so landing restores the player's own zoom by construction — the
   client's equivalent of C2's single `Ground()` re-entry.
6. **Equipping mid-flight is blocked client-side only** — `Equip` is its own
   `ClientMessageBody`, so the takeoff input discard never sees it and the
   server would accept it. A greyed bar that still re-slots is the
   inconsistency; recorded because it is a UI ruling, not a server rule.

**Verified:** `go build ./...` green (no Go changes) · `tsc --noEmit` clean ·
vitest **218/218** (+11: `Zoom.test.ts` 5, `pickCampfireMarker` 6) · webpack
prod build clean · **`c3-flight-client` 24/24, 0 console errors** — a new
harness covering arm → confirm → airborne → landing end to end, **including
the two-client snapshot-invisibility leg C2 deferred** (the observer's
nameplate for the flyer disappears at takeoff and the flyer lands 0.18 units
from the destination fire) · map-surface harnesses re-run per the coverage map:
`c1-world-map` **12/12** (leg 7 — "the press is reserved for flight" — still
passes: a press on no marker is a no-op) · `c2-campfire-markers` **17/17** ·
`c3-player-roster` **15/15** · boot 0 panics · **the airborne and landed frames
read by eye**, not only asserted: `display: block` is the same shape of
assertion that passed all through world-map C2 while the campfire markers sat
invisible under the prop layer. The bar renders legibly and centred, the action
bars are visibly dimmed, the flyer is dead-centre (hard-follow), and landing
restores the zoom. ⚑ Reading them is what turned up the **phone stylesheet**:
`HUD.mobile.less` overrides `#castBar` geometry specifically (`width: 100%` over
the desktop `18vw`) and takes it out of the touch layer, so `#flightBar` needed
both rules or it would have been an 18vw sliver in a full-width column, eating
joystick touches. **Schema impact: NONE** — both
wire directions shipped with C2 (D15); nothing new is persisted.

**Deferred to C4:** ⚑ **a flyer is still a dot on other players' maps** — the
roster filter is C4, so that is expected, not a defect. *(Superseded the next
day: C4 ruled the dot **stays**, D16. The sentence is left standing because the
belief it records is what C4 had to go around and correct in eleven places.)*

---

#### The PO feel pass (2026-08-05, same day)

The half only a human could score. It changed the trigger, both tuning knobs
and the render order, and turned up one bug the headless run structurally could
not see.

**PO rulings (4):**

1. **Flight starts by interacting with the campfire.** Approach a discovered
   fire → `E` lights over it → `E` opens the map → two presses fly.
2. **A map opened with `M` is READ-ONLY** (choice prompt). Flight is reachable
   only from a fire. ⚑ This **removes** the silent-refusal case rather than
   reporting it: you cannot reach the flight map unless the precondition
   already holds, so **C5's confirm dialog loses its main job** and C5 shrinks
   to the route overlay plus the arm-vs-dialog question.
3. **A second `E` closes the map** — once it is up, every remaining choice is
   made with the mouse. The conversation panel's rule, applied to the map.
4. **Tuning, twice each:** speed `4 → 2.8` (measured 4.26 u/s against the
   1.5 u/s walk) · viewport `2.5 → 1.75 → 1.2`, each time *"still too far
   out"*. The two zoom cuts take the streamed area from ~6.25× the ground
   viewport to ~1.4×, so **flight is no longer the mobile-perf cost it was
   designed as** (§4.3's premise is spent).

**Findings that outlive the pass:**

7. ⚑ **The flyer rendered UNDER props, and the layer comment said the opposite
   was already fixed.** Mobs are below characters deliberately (`6afbee84` —
   a player standing in a campfire must not be hidden by it), but `resources`
   and `bossMobs` are added to the cameraGroup *after* `characters`. Altitude
   has no other representation — no shadow, no scale change — so passing behind
   a tree stops reading as flight at all. Fixed with a `flyers` layer above the
   props and below darkness (a flyer crossing a dark region is still in it),
   which can only ever hold the local player because D13 removes flyers from
   everyone else's snapshot.
8. ⚑ **A conversant stands within ~1.5 units of FOUR of the world's five
   fires** (VillageHealer 1.49 from spawnpoint-2, Wanderer 1.27 from -3,
   LamplessTraveller 1.07 from -4, Emberkeeper 1.13 from -5; only spawnpoint-1
   is clear at 3.2). The first cut had a conversant win the `E` offer, which
   made spawnpoint-2 **unflyable** — one of five fires, silently. **The fire now
   wins inside its bind radius** (0.75 units, against the 2.0 talk range): the
   tighter condition is the unambiguous statement of intent, and the NPC is one
   step away. ⚑ This is a **content** pattern, not a one-off — anything needing
   both at one spot wants a row in the fire's own panel, not a re-ordering.
9. ⚑ **THE BADGE SHIPPED SUPPRESSED AT EVERY LONELY FIRE, AND THE HARNESS WENT
   GREEN ON IT.** The "hide the badge while its own conversation is open" guard
   read `offered === Conversation.partnerId()`, and `partnerId()` is `0` when
   nothing is open — so it matched whenever no conversant was in range. Free
   while the badge could only wear `offered` (both were 0 together); the
   campfire offer made the two diverge, and `E` kept working because the key
   reads the tracked id while the badge reads the suppressed one. **The harness
   could not catch it: both flight endpoints have an NPC ~1.1–1.5 units away**
   (finding 8), so every badge reading was taken where a conversant was also in
   range. Pinned by a new leg scored **first, at spawn, at spawnpoint-1** — the
   one fire with nobody next to it. *General shape: a sentinel compared against
   a value that is also the sentinel, harmless only while the two operands move
   together.*
10. ⚑ **The cross-language constant pin found a flaw in itself.** Comparing the
    Go const to the parsed TS literal at float32 went red the first time the
    value was retuned to something not exactly representable in binary — 2.5 and
    1.75 are, **1.2 is not** — reporting `1.2 ≠ 1.2000000476837` for two files
    that both said `1.2`. It compares the written literals at float64 within
    1e-9 now, re-verified to still go red on a real 1.2-vs-1.3 drift.
11. **The interact badge is no longer purely server-driven.** Campfires carry no
    authored `interaction`, so `sense()` never names one; the offer is added
    client-side from `Mob.dwell_radius`, which the server already streams. Still
    one range check with the server's own number — just not the same publisher.
    `Mobs.setInteractable`'s doc comment was corrected to stop claiming otherwise.

**Also cleaned up in the same pass** (found by a pre-commit review, both
verified at the game surface): the arm state was **mirrored** in `MiniMap` and
`MapCampfires` — collapsed to the object that draws the ring — and the
cross-language `2.5` had nothing that could fail when the two sides drifted,
which is what finding 10's pin now covers.

**Verified (post-pass):** full Go suite + `go build` clean · `tsc --noEmit`
clean · vitest **225/225** (+7 for `FlightOrigin`) · **`c3-flight-client`
32/32, 0 console errors** (+3 legs: the lonely-fire prompt, `E` closes, `E`
re-opens) · `chunk3b-interact` **14/14** — re-run because the badge suppression
this pass changed is what NPC conversations depend on · `c2-campfire-markers`
**17/17** · `c1-world-map` **12/12** · boot `15 factions/87 skills/65 mobs/3
milestone unlocks/10 recipes/4 quests/5 props/777 props/485 spawns/5 campfires,
0 panics` · harness DB residue cleaned. **Schema impact: NONE.**

### C4 — the map keeps the flyer (D16)

**C4 DONE (2026-08-05), PO-VERIFIED IN-GAME the same day (two clients, two
browser profiles — *"everything works and looks good, no changes needed"*), and
it is the chunk that INVERTED before a line of it was written.** Its scope was one line of code — `if p.Flying() { continue }` in
`codec.RosterFor` — and the PO's answer to "here is what we're building" was
that it should not exist. What shipped is a **ruling, a guard, and a paper
trail**: no product behaviour changed, and that is the finding, not a caveat.

**Decisions this session (PO, both via choice prompt):**

- ⭐ **D16 — the world and the map are DIFFERENT facts.** A flyer is
  unreachable and unseeable on the ground (D13, structural) **and** a dot
  crossing the map. See §3.
- **A flying dot is drawn like any other dot** — no `flying` flag on
  `RosterEntry`, no distinct style. The wire is untouched. Revisitable after
  watching one cross; deliberately not pre-built (YAGNI).
- **The 1 Hz step is accepted as-is.** A flying dot jumps ~4 world units per
  publication against a walker's ~1.5. `MapPlayers`' header already records
  stepping as the written cost of a 1 Hz roster; flight only makes it more
  visible. Raising the rate would cost every player at all times to smooth one
  case, and C5's route overlay may answer it for free.

**What shipped, and where:**

- **`codec/roster.go`** — the D16 rationale on the type, and a comment **inside
  the loop**, which is where the person adding the filter puts their cursor.
  The header's old justification ("so the flyer filter has exactly one place to
  live") is retired; the single-assembly design still stands on the other one.
- **`core/net.go`** — `sendRoster`'s comment likewise, plus what the single
  assembly now *implies*: one marshal for everyone means the roster **cannot**
  vary per viewer, so a flyer is on everyone's map or nobody's. That is what
  makes landmine 10 (flyers cannot see each other in the world) coexist with
  flyers seeing each other on the map without inventing a third rule.
- **`core/roster_flight_test.go`** — three pins: the flyer is on the roster,
  the dot **tracks the lerp** (not a frozen takeoff snapshot), and landing
  changes nothing. `rosterPlayer` gained a real `Flying()` so the pin asserts a
  fact rather than catching a nil-panic from the embedded interface.
- **`c3-flight-client.mjs`** — legs **5b/5c/6g** beside the existing leg 5, so
  the two opposite facts are scored **from one client at one instant**.
- **Eleven correction sites** across all four status layers (§below).

**Findings that outlive the chunk:**

1. ⚑ **"Two channels carry the same fact" is a claim to VERIFY, not to
   assume.** Landmine 2 enumerated the visibility channels correctly and then
   concluded they must agree. They answer different questions: the world asks
   *can this reach me*, the map asks *where is everyone*. The enumeration was
   the valuable half; the agreement was an assumption wearing its clothes.
2. ⚑ **A negative pin needs a double that ANSWERS the question, not one that
   panics on it.** `rosterPlayer` embeds `model.PlayerEntity`, so a filter
   added to `RosterFor` would have nil-panicked — technically red, but reported
   as a decoder crash rather than as "you broke D16". Implementing `Flying()`
   to return the flag turns the failure into its own explanation. **Verified by
   temporarily adding the filter**: all three pins go red naming D16, where the
   first attempt panicked inside flatbuffers instead.
3. ⚑ **Flatbuffers' generated `Entries(obj, i)` does not bounds-check** — it
   returns `true` and yields garbage offsets past the end, so reading index 1
   of a filtered 1-entry roster panics deep in the decoder. Any leg reading an
   entry by index must assert `EntriesLength()` first, or the failure it
   reports is never the failure that happened.
4. ⚑ **Leaving the physics space freezes NOTHING about a position.**
   `core/input.go` writes `SetPosition` on every tick of the lerp and
   `RosterFor` reads `Position()`, so the map dot glides for free — no plumbing
   at all. Worth stating because the natural worry ("their shapes are out of
   the space, is their position still live?") has a clean answer, and the
   feature D16 rules for depends on it entirely.
5. ⚑ **The landing dot is OCCLUDED, measured: `dot r=3.5 px` under a
   `9.0 px` fire marker.** The ruled draw order puts campfires above other
   players, so **every arrival, for every observer**, ends with the dot hidden
   under the destination fire — the second surface of CLAUDE.md's standing open
   item (*"your own dot is invisible under that fire's marker"*), which until
   now was only about your own respawn. D16 gives that tuning question a real
   consequence: the payoff is watching someone cross the map, and it ends the
   instant they land. **Recorded as a diagnostic print, deliberately not a
   leg** — asserting the dot's presence in the scene graph would be the same
   false comfort as C2's `display: block` on a marker sitting under the props.
   The fix is marker sizing, which is a PO call and not this chunk's.

**The eleven correction sites** — the actual deliverable, because the stale
instruction lived in all four layers of `docs/README.md`'s status model:
`codec/roster.go` (header + loop) · `core/net.go` · this plan's §2, §4.2 table,
landmine 2, §7 C4 bullet, the C2 ledger's deferral and the C3 ledger's ·
`docs/README.md` · `CLAUDE.md` **Next** · the `verify` skill's coverage map ·
`MEMORY.md`'s world-map project file. ⚑ Two of those (`CLAUDE.md`, the skill
map) are loaded into **every** session, which is why a "docs-only" tail was the
part of this chunk most able to go wrong.

**Verified:** `go build ./...` + the **full Go suite** green · the three D16
pins **verified red** with the filter temporarily restored, then green without
it · **`c3-flight-client` 35/35, 0 console errors** (+3 legs, and leg 5 —
snapshot invisibility — still green beside them, which is the pair that matters)
· boot `15 factions/87 skills/65 mobs/3 milestone unlocks/10 recipes/4 quests/5
props/777 props/485 spawns/5 campfires, 0 panics` · harness DB residue cleaned.
⚑ **No other harness was re-run, and that is a reasoned call, not an omission:**
this chunk changed **zero lines of product code** — comments, tests and one
harness only — so there is no behaviour any other script could observe
differently. The Go suite plus the flight harness is the complete surface.
**Schema impact: NONE.**

**Nothing deferred to C5** by this chunk. C5 is unchanged: the route overlay,
plus the open arm-vs-dialog question. ⚑ D16 gives the overlay a second reason
to exist — a route line drawn under a moving dot is what makes a 1 Hz step read
as flight rather than as a stuttering walker.
