# Plan: Reconnect-Token Persistence

**Status:** **DONE 2026-07-21 — PO-VERIFIED IN-GAME 2026-07-21 ("tested and works"), committed `[uncommitted]`.**

**Ledger:** single execution chunk, PO queue item ②. **PO rulings (choice
prompts):** stash-immediately (no grace period / lingering body), client
storage `sessionStorage` (tab-scoped), stash TTL ~10 min [PLACEHOLDER],
auto-rejoin skipping the start screen with seamless fresh-join fallback.
**Wire:** append-only — `Join.reconnect_token` + `Accept.reconnect_token`
(Accept was empty; chosen over the static prebuilt Welcome), Go+TS bindings
regenerated. **Backend:** `ConnectionStateSystem` gains `tokenByClient` +
`stashByToken` (deadState generalized, token-keyed, survives the socket);
disconnect stashes instead of freeing (name stays reserved); death cleans the
spurious fan-out stash + re-registers the token; dead-disconnect stashes the
death scene (corpse removed, recreated on reattach); `tryJoin` reattach branch
consumes the stash before removing the spectator, restores exact position/HP
(clamped after skills, triage-14 ordering), name verbatim — token wins over the
Join name; TTL sweep tops `Update`. **Frontend:** `Session.ts` (first
sessionStorage use), token stored on every Accept, `PlayerName` auto-rejoin on
`FirstGameStateHandledEvent` (deliberately no `GameJoinEvent` — fullscreen
needs a user gesture), `StartScreen` keeps the loading look, `onclose`
"Connection lost" banner. **Drive-by fix:** `Game.removePlayer()` dereferenced
`this.player` unguarded — threw on dead-reconnect Obituary before
`EndScreen.show()`; early-return guard. **Test deviation:** two state tests
pinned the old free-on-disconnect behavior and were updated to stash semantics
(`TestDisconnectWhileDead_StashesDeathSceneAndRemovesCorpse`,
`TestDisconnectAliveAfterRespawn_StashesInsteadOfDeadCleanup`). **Verified:**
`go build` clean, full suite green incl. 10 new tests (8 state + 2 Join codec
round-trips), `tsc` clean, prod build clean, boot `-content ../api`
`81 skills/14 factions/50 mobs/10 recipes/848 props/383 spawns/5 campfires/14 npcs, 0 panics`,
headless Playwright smoke 9/9 PASS (alive reload restores character+token, no
start-screen flash; dead reload rebuilds overlay + Respawn; cleared storage →
normal start screen), PO in-game pass 2026-07-21.
**PO queue item ②** — reload currently loses the character; session-scoped fix, explicitly NOT step-8 accounts.

## What changes and why

A browser reload destroys the character: client identity is a per-connection
`uuid.New()` (`backend/pkg/aura/model/client/client.go`) that dies with the
socket. On disconnect the player entity is removed within one tick (lazy
send-error detection in `NetSystem`, `core/net.go`) and
`ConnectionStateSystem.removeFromPlayers` frees the name, anchor, and all
progression.

This chunk adds a **session-scoped reconnect token**: the server mints it on
join and returns it on `Accept`; the client keeps it in `sessionStorage`; on
reload the client auto-rejoins with the token and the server rebuilds the
character — position, HP, level/XP, spellbook, loadout, active slot, campfire
anchor, and the dead/corpse state if the character was dead. In-memory only,
no disk.

**Key reuse:** the `deadState` machinery (`sys/state.go`) already stashes
name + progression + full `*skills.SkillComponent` across death and rebuilds
via `player.New` + `SetProgression` + `SetSkillComponent` + `SetPosition` +
health stamp. Reconnect generalizes that stash, keyed by a durable token,
and stops freeing it on disconnect.

## Decisions (PO, 2026-07-21, via choice prompts)

1. **Stash-immediately** — entity removed on disconnect as today; full state
   stashed server-side by token. No in-world lingering body, no grace period.
   (F5 blink-out/in accepted — no-PvP game.)
2. **Client storage: `sessionStorage`** — survives reload, dies with the tab.
3. **Stash TTL ~10 min [PLACEHOLDER]** — expiry frees stash + name reservation.
4. **Auto-rejoin UX** — stored token skips the start screen; unknown token
   (server restart / expiry) degrades seamlessly to a fresh join under the
   same name, and the new Accept token self-heals the stored one.

## Design summary

- **Wire (append-only):** `Join` + `reconnect_token:string` (client.fbs);
  `Accept` + `reconnect_token:string` (server.fbs — Accept was empty; it is
  sent at exactly the character-binds-to-connection moments: join, respawn,
  revive, all in state.go). Token = `uuid.NewString()`, minted on fresh join,
  reused across reconnects.
- **Backend:** all in `ConnectionStateSystem` — `tokenByClient
  map[uuid.UUID]string` + `stashByToken map[string]reconnectStash` (name,
  progression, skills, health, position, anchor, dead flag, disconnectTick).
  `removeFromPlayers` stashes instead of freeing the name; `handleDeath`
  deletes the spurious stash the removal fan-out created and re-registers the
  token (keeps the fan-out a single unconditional path);
  `removeFromSpectators`' disconnect-while-dead branch stashes `dead:true`
  (corpse removed, recreated on reconnect). `tryJoin` gains a token branch:
  consume stash BEFORE removing the spectator (house invariant), name reused
  verbatim (still reserved — token wins over the Join's name), HP clamped to
  MaxHealth AFTER skills restore (triage-14 ordering); dead-stash reconnect
  sends Accept+Obituary and rebuilds corpse + `deadByClient` + spectator.
  TTL sweep at top of `Update`. Buffs / casting state NOT restored (matches
  the death precedent by design).
- **Frontend:** new `features/accounts/logic/Session.ts` (sessionStorage
  wrapper); store token on every Accept (`Backend.ts`); `JoinMessage` gains
  optional token; `PlayerName` auto-rejoins on `FirstGameStateHandledEvent`
  when a token is stored (no `GameJoinEvent` — fullscreen needs a user
  gesture); `StartScreen` keeps the loading look instead of revealing Play
  when auto-rejoining; `Backend.setup()` gains an `onclose` handler
  ("Connection lost — reload to reconnect").

### Edge cases

| Case | Behavior |
|---|---|
| Server restarted / token expired | Fresh join under sent name; new token |
| Duplicated tab, original still connected | No stash while connected → fresh mangled join |
| Two tabs race after disconnect | First Join consumes stash; second → fresh mangled join |
| Reconnect name ≠ stash name | Token wins; stashed name verbatim |
| New player wants a stash-reserved name | Mangled until TTL (same trade as the death reservation) |
| Death while connected | Unchanged; handleDeath cleans spurious stash, re-registers token |
| Dead-stash reconnect → Respawn/revive | deadByClient + corpse rebuilt under new uuid |

## Task list

- [x] 0. This plan doc
- [x] 1. Schema + codegen (`client.fbs`, `server.fbs`, `./make.sh`, `make -C backend build`)
- [x] 2. Codec/model plumbing (`model/client_message.go`, `codec/client_message.go`, `codec/server.go`) + Join round-trip codec tests
- [x] 3. Backend TDD in `sys/state_test.go` (8 new tests, all listed scenarios) → `state.go` implemented, full suite green. **Deviation:** two existing tests pinned the OLD disconnect behavior (name freed) and were updated to the new stash semantics: `TestDisconnectWhileDead_CleansUpEverything` → `…StashesDeathSceneAndRemovesCorpse`, `TestDisconnectAliveAfterRespawn_FreesName` → `…StashesInsteadOfDeadCleanup`.
- [x] 4. Frontend (`Session.ts` new, `JoinMessage.ts`, `PlayerName.ts`, `Backend.ts`, `StartScreen.ts`). **Found in smoke:** `Game.removePlayer()` dereferenced `this.player.character` unguarded — on a dead-reconnect page load no Player exists yet and the Obituary handler threw before `EndScreen.show()`; guarded with an early return (`Game.ts`).
- [x] 5. Verification 2026-07-21: `go build ./...` clean, full suite green (incl. 10 new tests), `tsc` clean, prod build clean, boot `-content ../api` 81 skills 0 panics; headless Playwright smoke **9/9 PASS** (alive reload restores character + same token + no start-screen flash; dead reload rebuilds death overlay + Respawn works; cleared sessionStorage → normal start screen). **PO hand-test outstanding.** Watch: webpack dev-server needs a RESTART for the regenerated `api/schema/js/` bindings.

## Open items (non-blocking)

- TTL 10 min stays [PLACEHOLDER]; tune in play.
- Stash-reserved names block new joiners for the TTL window — accepted;
  revisit only if it bites in play.
