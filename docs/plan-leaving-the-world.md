# Plan: Leaving the world (§52, absorbing and superseding §48)

> **Designed 2026-08-04. Nothing built.** PO rulings, in the order they were
> taken: D2 (safe = ring AND not in combat) · D5 (re-adopt in place) · D8 (one
> chunk) · **D10** (a deliberate leave is refused in combat, and costs a 5 s
> countdown when unsafe) · **⭐ D11 — the reconnect park is DELETED, not
> reduced.** D11 was taken last and rewrote the plan: it dissolves an earlier
> ruling (D3, a deliberate leave ends the park) along with the two holes that
> ruling had opened. Every number is **[PLACEHOLDER]**.
>
> ⚑ Supersedes `backlog.md` §52's open questions 2–4 and lifts §48's ⛔ block —
> §48 is now a *consequence*, not a companion.
>
> ⚑ **All line references refreshed against `1ac8078e` (2026-08-04).** The
> world-map and §54 work moved `sys/state.go` by ~125 lines after this plan was
> first drafted; re-verify before trusting any number here if more has landed.

## 1. What this is, and its inputs

Leaving the world is instant today. Closing the tab removes your character on the
next tick; it is parked in memory ~10 min so you can come back, but as far as the
world is concerned you vanished. That is the **disconnect-to-escape exploit**, and
step 8a shipped the progress that makes it worth fixing.

Inputs, all read during the session:

- `backlog.md` **§52** (the proposal) and **§48** (the reconnect token is
  deletable — traced, then ⛔ blocked on §52).
- `plan-accounts-frontend.md` **§12** — the exploit's canonical trace, including
  the prescription this plan follows: *"leave a vulnerable, unresponsive body in
  the world for a short grace window"*, WoW's ~20 s ghost as the reference.
- `plan-accounts-implementation.md` §5 — eviction was **rejected** for being a
  one-click combat escape. The same reasoning governs here.
- ⭐ **`backlog.md` §54, fixed `71735371` the same day this was designed** — mobs
  no longer chase players who have left the world. It composes with this plan
  rather than competing with it; see D12.
- **Today's machinery** (the design rides all of it, and adds very little):
  `player.InCombat()` (`model/player/player.go:314`, already on the wire at
  `codec/gamestate.go:67`) · `mob.CampfireSafeRadiusFactor = 1.0`
  (`model/mob/safezone.go:20`) · `s.campfires` and its per-tick point-in-circle in
  `trackCampfireDwell` (`sys/state.go:1095-1133`) · the input coast-then-halt in
  `core/input.go:214-242` · the `logoutRequests sync.Map` cross-goroutine inbox
  (`sys/state.go:253-268`) · the single removal path `Remove` →
  `removeFromPlayers` (`sys/state.go:1167`, `:1224`) · `Mob.ForgetEntity`
  (`model/mob/mob.go:1520`, driven from the removal fan-out at `sys/mob.go:223`).

## 2. The loop, end to end

Your client goes away — you closed the tab, your wifi died, or you pressed Leave.

- **Standing at a campfire, out of combat** → removed on the next tick, as today.
- **Anywhere else** → your character **stays in the world ~30 s, fully
  simulated**. Your aura keeps ticking, mobs keep hitting you, you stand still,
  and you can die. Come back inside the window and you take control back in place
  — same position, same HP, and **the mob that was chasing you is still chasing
  you**. After the window, you are saved and removed, and you are *gone*: the next
  login is a cold load from Postgres.

Pressing **Leave** deliberately is held to a stricter standard than dropping:
refused outright while in combat, and out of combat in the wilderness it costs a
**5 s countdown** that any damage cancels.

⭐ **Two reframes carry this plan.**

1. **Safety is a place, not an intent** (for the drop path). Tab close, crash and
   network partition are one event; position and combat decide. Nobody escapes by
   yanking a cable.
2. **There is no "removed and remembered" state at all.** The linger *is* the
   grace window. Either you are in the world, or you are in the database.

## 3. Decisions

**D1 — Safety is a place, not an intent — for the DROP path.** Tab close, crash
and network partition are one event: D2 decides. §52's question 4 needs no answer
at this layer. D10 then gives the deliberate path its own, *stricter* rules — the
reframe survives where it does the work, while pressing the button is held to a
higher standard, never a lower one.

**D2 — Safe = inside any campfire's safe radius AND `!InCombat()`.** Position is
primary; combat is a veto. `CampfireSafeRadiusFactor = 1.0` is deliberately
*"exactly the ring the client already draws"*, so the rule is one the player can
see; the veto closes `safezone.go`'s own recorded limitation (splash from just
outside still reaches the centre). `InCombat()` is already on the wire, so the
client can show which outcome you will get before pressing anything. **Any** fire
counts, not only your bound one — tying it to the bind would punish exploring past
other people's fires for no design reason. ⚑ Campfire *discovery*
(`plan-world-map.md` C2) is a map-marker concept and does **not** gate this: a fire
you are standing next to is safe whether or not its icon is on your map.

**D3 — *(retired by D11)*** — *a deliberate leave ends the park*. There is no park.
Kept as a numbered stub so D-numbers stay stable across the doc's history.

**D4 — The leave signal is HTTP, not a wire message.** `POST /api/session/leave`,
on the proven `logoutRequests` pattern. A `Leave` client message would race the
teardown: `ClientMessage.send()` silently drops frames when the socket is not OPEN
and nothing in the client has ever called `webSocket.close()`. An HTTP call is
awaitable. ⚑ Under D10 its job changed: it no longer *performs* the leave, it
**starts a server-authoritative countdown**.

**D5 — Returning mid-linger re-adopts the body in place.** Point the existing
entity at the new client (`player.client` is an unexported field with only a
getter, `player.go:115`/`:762`; this adds a setter). ⭐ **It must be in-place
rather than rebuild-from-state because mobs hold aggro on the ENTITY** —
rebuilding wipes every threat table (now *explicitly*, via D12), which is the
exploit again in miniature. Under D11 this is also the only warm path that exists,
so it carries more weight than it did: it is what makes a page reload invisible.

⭐ **Stated as an invariant, because it is safety-critical: a join MUST always
return to an active linger.** If a lingering body exists for the character being
joined, the join re-adopts it — it may never fall through to the cold-load path
while that body is standing in the world, or the account is in the world twice
with two entities, two threat identities and two save writers. The linger check
therefore comes **before** the ticket's character state is touched. See L13.

**D6 — One timer.** Was "two, sequential". D11 deletes the ~10 min park, so the
linger is the only clock: ~30 s, then save-and-gone.

**D7 — Dying while away costs exactly what dying costs, and nothing more.**
`LoseCurrentLevelExperience` (`state.go:930`) runs before the removal fan-out's
save in every path, so the XP penalty always lands. Under D11 there is no dead
stash to return to: you die during the linger, you are saved dead-penalised and
removed, and your next login is a cold load — alive, full HP, at your bound
campfire. ⚑ **The death overlay and the `ReviveAtCorpse` choice are therefore
unreachable for anyone who dies while disconnected.** A deliberate simplification,
not an oversight: it is the same outcome for every cause of disconnection, which
is what makes it defensible. §52's question 2, answered.

**D8 — §52 and §48 ship as ONE chunk** *(PO, against the recommendation to
split)*. §6 sequences it internally so each step is independently testable.

**D9 — The linger is "the removal has not happened yet."** The framing that keeps
this small. Everything §52 asks for falls out of *not removing the entity*:
`player.Update` is unconditional and damage has no is-a-client-attached check, so
"fully simulated" is free; `core/input.go`'s `maxHoldTicks = 15` coast-then-halt
already zeroes movement for a starved client, so "movement input is reset" is
free; and a lingering character still holds its claimed session, so **you cannot
escape by switching characters either** — free.

**D10 — A deliberate leave is refused in combat, and costs 5 s when unsafe.**
Three cases for the button:

| where | what happens |
|---|---|
| safe (D2) | leaves instantly, as today |
| unsafe, out of combat | **5 s server-authoritative countdown**, then leaves |
| in combat | **refused** |

Damage during the countdown cancels it (you are now in combat). ⭐ **The combat
block is soft, and that is what makes it fair:** a player who genuinely must go
can always close the tab — it just costs the full 30 s linger instead of 5 s. So
it is a priced choice, not a lockout, and the pricing runs the right way. ⚑ The
countdown must be server-side: a client that could assert "countdown finished"
would be asserting itself out of a hostile world.

**⭐ D11 — the reconnect park is DELETED, not reduced.** No `stashByToken`, no
TTL, no "removed and remembered" state. Either you are in the world (live, or
lingering) or you are in the database. Consequences, all of them wanted:

- **§48 becomes literal.** "One join path" stops being a refactor and becomes a
  fact: every join is a cold load keyed by the play ticket. The token goes because
  *the thing it keys* goes.
- **D3 and both of its holes evaporate.** With no park to keep or drop, a
  deliberate leave and a drop no longer differ in outcome, so neither the free heal
  nor the skipped death screen has anywhere to live.
- **A whole class of bug goes with it** — §10a's *"save that can never succeed"*
  was stash TTLs firing against deleted rows, and the *"HEer the ugly"* rename was
  a stash reserving its own name. Both are deleted rather than fixed.
- ⚑ **The cost, stated precisely: the grace window shrinks from ~10 min to the
  linger.** It does not disappear — inside an active linger, position, HP and
  threat are all preserved exactly, because D5 re-adopts the body rather than
  rebuilding it. The regression is only at the boundary: a reconnect arriving
  *after* the linger has expired cold-loads to the bound campfire at full HP,
  where today it would have resumed for up to ten minutes. See L12.

**⭐ D12 — §54's threat-severing is the linger's other half, and they compose.**
`71735371` gave the removal fan-out an explicit sever: `Mob.ForgetEntity`
(`mob/mob.go:1520`) drops the departed entity's threat row, and
`Space.RemoveShape` now purges dangling collision references so a sensor cannot
re-acquire a ghost one tick later. Under this plan that hook fires **at the end of
the linger instead of at disconnect**, which is exactly right in both directions:

- during the linger nothing severs, because nothing is removed — so the pack
  keeps chasing a body that is genuinely *there*, which is the point of §52;
- after the linger the sever runs unchanged, so §54's fix still covers the ghost
  case it was written for.

⚑ **§52 makes §54's reported symptom rare; it does not replace the fix.** The
report was *"disconnect and the pack parks on the spot you vanished from."* With a
linger the pack chases a real target for 30 s and then leases off cleanly — but
the safe-area path still removes instantly, and every non-linger removal (death,
logout completion, shutdown) still needs the sever. Do not read this plan as
licence to simplify §54's work away. It also hardens D5/L2: a rebuild-on-rejoin
would now wipe threat *explicitly and reliably*, not just incidentally.

## 4. What gets retired

The park and everything that served it — `stashByToken`, `reconnectStash`,
`reconnectStashTTLTicks`, `sweepExpiredStashes` (`state.go:500`), `saveStash`,
`discardStashFor` (`:524`), `releaseExpiredSession`, and the whole `reattach`
warm-resume path (`:851`). `tryJoin` (`:688`) loses its reconnect branch and keeps
one.

**`reconnectToken`, entirely** (§48): from `client.fbs`'s `Join`, from `Accept`,
from `tokenByClient`, from `Session.ts`. Its client-side second job —
`willAutoRejoin()` (`PlayerName.ts:18`) — moves to `Session.playingCharacterId`,
which already exists and which `AccountFlow.reconnect()` already requires.

**Investigate, do not assume: `auth.Session.Stashed`** (`sessions.go:25`) exists
only to describe a parked session, and is the sole reason `Connected()` differs
from `Live()`. With the park gone it looks deletable — but a lingering player is
in the world while disconnected, and `Connected()` is what HTTP asks to decide
*"is this account in the world in another window"*, which must answer **yes**
during a linger. Confirm before deleting.

## 5. Landmines

- **L1 — the disconnect seam fires every tick, not once.** Disconnects are
  discovered lazily by an outbound send FAILING (`core/net.go:86-94`), so
  `playerSendState` keeps failing every tick for a lingering player. The seam must
  return early when already lingering, or the removal runs ~30 times. The single
  most likely way to ship a broken linger that looks like it works.
- **L2 — rebuild-from-state wipes aggro, now explicitly.** The justification for
  D5, hardened by D12: `Mob.ForgetEntity` fires from the removal fan-out, so a
  "simplified" rebuild-on-rejoin severs threat reliably rather than by accident.
  The exploit would return with nothing failing.
- **L3 — `mob.safeZones` is a package-level slice that is `nil` in tests and in
  the sim harness** (`safezone.go:14-18`), where `blockedBySafeZone` returns false.
  Reading it for D2 would make **nothing safe in any test**, so every test
  disconnect would linger. **Answer: add `SafeRadius` to `sys.CampfireAnchor`**,
  populated in `cmd/aurad/aurad.go` from the same `CampfireSafeRadiusFactor` that
  already builds the `SafeZone` slice. `ConnectionStateSystem` then answers from
  its own `s.campfires`, which it already point-in-circle-tests at `state.go:1104`.
  One factor, no nil global. Pin the two derivations against each other — they live
  in different packages and are **not** pinned today.
- **L4 — `respawnJitterRadius = 1.0` (`state.go:999`) must stay inside the safe
  radius (1.5).** A fresh character spawns at a starting campfire jittered by 1.0,
  which is why a new player's first leave is instant. Raise the jitter past the
  safe radius and every new player silently starts lingering. Assert the relation.
- **L5 — ⚑ `drainLogoutRequests` releases the account slot IMMEDIATELY**
  (`state.go:577`) while `closeClient` (`:584-592`) only closes the socket. Under
  the linger, a logout in the wilderness leaves a body in the world with the slot
  already free ⇒ **log in again and be in the world twice.** The `Release` must
  move to the end of the linger.
- **L6 — `handleDeath` (`state.go:925`) performs five compensations for one
  removal call** (re-add name, anchor, token, account + `Claim`, delete the
  spurious stash — `:942-961`). D11 deletes the stash compensation and §48 the
  token one; keep the linger decision at the *entry* to removal, never inside
  `removeFromPlayers`, or it grows a new one.
- **L7 — `closeClient` scans only `s.players`**, so logout never closes a client
  sitting on the death overlay. Pre-existing; visible here because logout now has
  to reason about world presence.
- **L8 — a lingering player still earns XP and can kill things.** They stay in
  `s.players`, so aura ticks, `trackCampfireDwell` and `trackCharacterSaves` keep
  running. Accepted at 30 s — but state it, because it will be noticed.
- **L9 — `chunk4-persistence` must gain an instant-leave leg.** Its cold-load
  proof is now trivially true under D11, which makes it *weaker* as a test, not
  stronger: it can no longer fail the way it was written to fail. Give it
  something real to assert — that the leave was instant, and that the linger did
  not silently swallow its 2 s wait.
- **L10 — union values in `client.fbs` are permanently pinned** (`:144-149`).
  This removes a *field* from `Join`, not a union member, so nothing renumbers —
  verify with a regenerate-and-diff rather than by reading.
- **L11 — progress made DURING a linger is saved.** The disconnect save
  (`removeFromPlayers`, `state.go:~1240`) runs at the *end* of the linger, so XP,
  levels, skills and quests earned in those 30 s persist, and a death during it
  persists its penalty. ⚑ Anyone tempted to "just save at disconnect time instead"
  would silently discard the linger's outcome, which is the whole feature.
- **L12 — ⚑ the linger duration now serves two jobs that pull opposite ways.** As
  an exploit brake it wants to be short; as the *only* reconnect grace window (D11)
  it wants to comfortably exceed a page reload on a bad mobile connection —
  catalogs, socket, `/select` for a fresh ticket. Inside the window nothing is
  lost (D5 re-adopts in place); a player whose reload *overruns* it is teleported
  to their campfire with no explanation. **Measure a real reload before pinning the
  number**, and size the linger off the slower of the two jobs.
- **L13 — a join must never cold-load past an active linger** (D5's invariant).
  The failure is silent and severe: two entities for one character, two threat
  identities, two save writers racing the same row. Order the join path so the
  linger lookup precedes anything that builds a player from ticket state, and test
  it directly.
- **L14 — ⚑ `doFuneral` now runs at the END of the linger, so a placed Camp
  outlives its owner's disconnect.** §54's defect 2 turned on exactly this:
  *"a player's placed camp IS a mob, and `doFuneral` removes it alive on
  disconnect."* Under the linger that removal is deferred ~30 s, so the camp keeps
  healing — including healing the lingering body. Probably desirable (the camp is
  the owner's, and the owner is still there), but it is a behaviour change nobody
  asked for. Decide it deliberately rather than discovering it.

## 6. Chunks

**C1 — leaving the world (the whole thing).** One chunk by D8, built in this
order so each step is independently testable:

1. `SafeRadius` on `CampfireAnchor` + the safe predicate. Pure addition, Go tests
   only; pins L3/L4.
2. The disconnect seam + the linger. `NetSystem` stops calling `RemoveEntity` for
   players and calls a seam on `ConnectionStateSystem`, which either removes now
   (safe) or records `s.lingering[uuid] = tick`; `Update` ends lingers past
   `lingerTicks` via today's unchanged removal path. Closes L1; check L14.
3. `player.SetClient` + re-adopt on join (D5/L13). Test: the threat table survives
   — and, per D12, that `ForgetEntity` did *not* fire.
4. **Delete the park (D11)** — everything in §4's first paragraph plus `reattach`.
   `tryJoin` drops to one branch. Expect this step to *remove* substantially more
   than the rest of the chunk adds.
5. `POST /api/session/leave` + the countdown state machine (D10: refuse in combat,
   5 s when unsafe, cancel on damage); move the logout `Release` to the end of the
   linger (L5).
6. §48's remainder — delete `reconnectToken` from wire, server and
   `sessionStorage`; investigate `Session.Stashed` (§4).
7. Client: `willAutoRejoin()` reads `playingCharacterId`; `leave()` posts, then
   **shows the countdown with a Cancel and reloads only on the server's
   confirmation** — no longer fire-and-reload; the Leave button is disabled with a
   reason while `InCombat()`, which is already on the wire.

Files: `sys/state.go` (the bulk, mostly deletions) · `core/net.go:86-94` ·
`model/player/player.go` · `model/mob/safezone.go` + `cmd/aurad/aurad.go` ·
`accounts/session.go`, `auth/sessions.go` · `api/schema/client.fbs` + both binding
sets · `Session.ts`, `AccountFlow.ts`, `PlayerName.ts`, `AccountSettings.ts`,
`Backend.ts`, `GameSettingsUI.ts`.

**Harness:** a new `leaving-the-world.mjs` (§7) plus `chunk4-persistence` with its
new leg.

## 7. Test strategy

- **Go, test-first:** the safe predicate (in-ring · out-of-ring · in-ring but
  `InCombat`) · the seam is idempotent under repeated send failure (L1) · a linger
  ends at `lingerTicks` and takes the ordinary removal path · a re-adopt preserves
  the mob's threat entry (L2 — mutation-check by swapping in a rebuild and watching
  it go red) · a join never cold-loads past a live linger (L13) · the countdown is
  refused in combat and cancelled by damage (D10) · the logout `Release` never
  precedes the linger's end (L5) · `SafeRadius` agrees with `mob.SafeZone` (L3) ·
  `respawnJitterRadius < SafeRadius` (L4) · progress earned during a linger is in
  the save (L11). ⚑ `model/mob/departure_test.go` and `sys/mob_test.go` are §54's
  pins — extend rather than duplicate them for the D12 assertions.
- **New browser harness `leaving-the-world.mjs`** — the rule is positional, so it
  must be driven in the world: walk away from the starting fire, kill the socket,
  prove the body is still there and still taking damage, reconnect inside the
  window and prove the mob is **still** on you; then repeat standing at the fire
  and prove the body is gone on the next tick; then press Leave in combat and prove
  it is refused.
- **`chunk4-persistence` gains the L9 leg** and is re-run.
- **Standing tail:** full Go suite `-count=1` vs real Postgres · mutation runs ·
  vitest · `npm run typecheck` · prod build · `-dev` boot 0 errors 0 warnings at
  the pinned counts · `chunk2-accounts` · `c1-world-map` / `c2-campfire-markers`
  (they touch the campfire surface this plan reads) · sim battery byte-identical
  (nothing here touches combat maths).

## 8. Open / deferred

- **⚑ Should HP and position be persisted?** Inside the linger they are preserved
  by D5, so this only governs what happens *past* the window: every cold return is
  full-HP at your bound campfire. That is self-consistent and it neutralises the
  free-heal exploit — you must survive the linger to collect — so the case for
  persisting is comfort at the boundary rather than correctness. Persisting both
  would close a standing survey gap and make an overrun reload harmless, at the
  cost of making "log out in a dungeon, log in in a dungeon" a design commitment
  (WoW's answer, but a commitment nonetheless). **Not ruled.** Same question as
  L12 wearing a different hat: either lengthen the window or make its far side soft.
- **⚑ Re-read `plan-ascension.md` and `plan-flight-paths.md` before building.**
  Both landed 2026-08-04, after this design. Ascension is the sacrifice loop —
  character destruction, which is a second way to leave the world permanently and
  may want to reuse the countdown. Flight paths move players between campfires,
  which is the geometry D2 reads. Neither was available when these rulings were
  taken; a 20-minute reconciliation pass is cheaper than discovering the overlap
  mid-build.
- **What do OTHER players see during a linger?** A standing, unresponsive
  character with no marking is indistinguishable from someone typing in chat;
  marking it invites a "free to kill" read that does not apply (no PvP). Recommend
  shipping unmarked and recording it — backlog §39 (entity-presentation rework) is
  the standing reason not to invest in per-state overlay art first.
- **What the LEAVER sees when their own linger blocks them.** The session slot
  stays claimed for the ~30 s, so pressing Play on *another* character inside the
  window is refused by `claimSession` (`state.go:656`) — which logs
  `🚫 join refused: account %d is already playing` and closes the socket **with no
  wire message** (`refuseJoin`, `:678-680`). The correct rule presented as a bug.
  Character select already has the vocabulary ("This account is in the world in
  another window").
- **Does D10 apply to LOGOUT?** Logout is an identity action and arrives over
  HTTP, possibly from a different tab or device with no countdown UI. Recommend:
  **logout always succeeds** — refusing it is a security-adjacent smell — and its
  world-side effect follows the *drop* rules (D1/D2), i.e. a wilderness logout
  lingers 30 s. Not ruled.
- **§47** ("Connection lost" after a logout elsewhere) still wants a close code and
  is untouched by this.
- **Pre-existing gaps found by the survey, to file rather than fix here:**
  `ReviveAtCorpse` (`state.go:1038`) restores progression and skills but omits
  `SetQuestLedger`, unlike `tryRespawn` (`:599`) — looks like a gap, not a
  decision · cooldown timers do not tick while a character is away ·
  `removeFromSpectators` (`:1172`) does nothing for a live (non-dead) spectator ·
  L7 above.
- **All numbers [PLACEHOLDER]:** `lingerTicks` ≈ 30 s · the D10 countdown ≈ 5 s ·
  `CampfireSafeRadiusFactor = 1.0` · the ~3.3 s `combatRegenGraceTicks` window that
  D2 and D10 both inherit. WoW's ~20 s logged-out ghost is the reference the
  exploit note already cites.

## 9. Chunk ledgers

*(empty — nothing built)*
