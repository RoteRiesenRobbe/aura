# Plan - "Immune" over the head of a fully mitigated target

**Status:** 📋 PLANNED 2026-08-18, not started. One chunk, backend + wire +
frontend, **DB schema NONE, wire schema YES** (one appended bool on two
tables, both regenerations required).

**PO ask 2026-08-18:** when something immune gets hit, the word "Immune" should
rise over its head where a damage number would have been. The trigger is
"zero damage dealt".

**Scope:** damage immunity only, both directions (mobs and players), for the
two causes that mean "this hit could never land": scripted invulnerability and
full mitigation. Explicitly not in scope: CC immunity (still silent in-game,
a standing watch item from `docs/archive/plan-cc-and-retaliation.md`; this
feature is its natural future hook), any per-attacker targeting of the label,
and any change to what the resistance numbers actually are.

---

## 1. Why this is small

Every layer already exists.

| Layer | What already exists | Where |
| --- | --- | --- |
| The choke point | one `takeDamage` per entity kind, every mitigation branch already returns 0 from a single place | `model/mob/mob.go:1798`, `model/player/player.go:366` |
| The per-tick one-shot pattern | `damage_taken` / `crit_taken` / `campfire_bound`: set during the tick, marshalled, cleared in `ResetTickNumbers` | `mob.go:2019`, `player.go:719` |
| The wire habit | append a field at the end of `Mob` / `Character`, existing field ids stay stable, old clients unaffected | `api/schema/server.fbs:170/295` |
| The rendering | `showFloatingText(label, color)` is the floating-number animation with a free label, first used by "Bound and restocked" | `_GameObject.ts:450` |
| Darkness suppression | inherited for free from `showFloatingText`: an unlit fight leaks no readable label | `_GameObject.ts:469` |
| The client dispatch | the damage/heal/cost/xp block already reads per-tick one-shots off the snapshot in exactly two places | `EntityManager.ts:183`, `Player.ts:151` |

So the work is: one bool on the entity, set it in the branches that already
return 0, clear it with the other accumulators, marshal it, decode it, print a
word. No new message kind, no migration, no new system.

**One landmine class checked and clear:** the frontend imports the generated
bindings directly (`AuraApi.ts` re-exports `api/schema/js/aura-api`), so
`api/schema/make.sh` is the whole client-side regeneration. There is no
hand-copied mirror to forget.

---

## 2. Which zero counts as "Immune"

`takeDamage` returns 0 from four branches. They do not all mean the same thing.

| Branch | Meaning | Emits? |
| --- | --- | --- |
| `m.invulnerable` (mob) | scripted immunity, e.g. the Warlord while a banner lives | **yes** |
| `vitals.HP(hp32) <= 0` (mob and player) | resistances plus reduction multiplied out to nothing | **yes** |
| gate key mismatch (mob) | the mob was never a valid target for a harvest-gated skill | no (D1) |
| `p.IsGod()` (player) | cheat | no, and no code needed (D3) |

⭐ **The floor check is exact, not approximate.** `vitals.HP` floors any
positive amount to at least 1 (`vitals.go:96`), so `vitals.HP(hp32) <= 0` is
true only when `hp32` is genuinely zero. A 0.1 HP chip hit becomes 1 HP and
takes the normal path. There is no "rounded down to zero" case that could
mislabel weak damage as immunity.

## 3. PO decisions (2026-08-18)

- **D1 - a gate miss stays silent.** A gate-keyed hit that finds a mob without
  the key prints nothing. Gates were deliberately moved off the resistance map
  (`mob.go:1814`, D4 of the content pass): "not a valid target" and "immune"
  are different ideas, and a gated damage aura ticking in a crowd would stamp
  the word over every bear in range on every tick.
- **D2 - audience: everyone, like damage numbers.** One bool per entity, read
  by every observer. A group beating on an invulnerable boss all learn at once.
  Offered and not taken: attacker-only, which has no channel today (floating
  numbers are entity state, not per-observer events) and would have cost more
  than the rest of the feature combined.
- **D3 - grey "Immune", normal size.** It reads as a non-event, where a red
  number would have been. Offered and not taken: crit-sized white, and the word
  "Resisted" (accurate for resistances, wrong for the Warlord's script).

## 4. Design decisions (mine, flag if wrong)

- **D4 - a bool, not a counter.** Several immune hits inside one tick collapse
  into one label. A count would only ever produce stacked identical words.
- **D5 - set inside `takeDamage`, before each `return 0`.** The same choke
  point discipline as every other accumulator. No caller learns a new duty.
- **D6 - god mode writes no flag.** `IsGod()` returns before the mitigation
  check (`player.go:383`), so a god player simply never sets it. Verify the
  branch order still holds when implementing; if the PO later wants god to
  announce itself, that is one line at that site.
- **D7 - the aura-hit VFX stays as it is.** The hit ring already fires on
  immune targets and the mob code calls that "immune feedback"
  (`mob.go:1803`). The word completes that read rather than replacing it.
- **D9 - the label yields to a real damage number in the same tick.** The two
  flags are NOT mutually exclusive: both are per-tick aggregates over every hit
  the entity took, and one tick can hold a fully resisted hit and a landing one.
  This is reachable in shipped content: a player harvesting a Rockfall lands the
  gated smash while their ordinary damage aura ticks on the same target and is
  fully resisted. The word exists to explain why nothing is happening, so when
  something is happening the question does not arise: the client prints the
  label only when `damageTaken` is 0 for that entity this tick. The server
  stays honest and sets the flag either way, so the rule is one client-side
  guard, revisitable without a wire change.
- **D8 - name it `immune_hit`, not `immune`.** It is a per-tick event, not a
  state. A future "is currently immune" state field would be a different thing
  and should be able to coexist.

## 5. The change, file by file

### 5.1 Wire - `api/schema/server.fbs`

Append to **both** `Mob` and `Character`, at the table end, with the
per-tick-one-shot comment the neighbours carry:

```
  // A hit landed this tick and was fully mitigated: scripted invulnerability
  // or resistances multiplied out to zero. Drives the floating "Immune"
  // label. Per-tick one-shot like campfire_bound; a gate-key miss does NOT
  // set it (a gated skill's non-target was never immune). Appended at the
  // table end so existing field IDs stay stable.
  immune_hit:bool = false;
```

Then `make -C backend gen` (Go bindings) and `api/schema/make.sh` (TS
bindings). Both outputs are tracked, so both land in the commit.

### 5.2 Backend

- `model/mob/mob.go`: `immuneHit bool` field, set before the `invulnerable`
  return and before the `vitals.HP(hp32) <= 0` return, **not** in the gate
  branch. Accessor `ImmuneHit() bool`. Clear it in `ResetTickNumbers`.
- `model/player/player.go`: the same, for the mitigation return only.
- `model/*.go` interfaces: add `ImmuneHit() bool` wherever `DamageTaken()` is
  declared, so the codec can read it off the interface.
- `codec/mob.go` (after `MobAddCritTaken`) and `codec/gamestate.go` (after
  `CharacterAddCritTaken`): one `Add` call each.

### 5.3 Frontend

- `messages/incoming/GameStateMessage.ts`: three touch points, matching
  `critTaken` exactly - the `undefined` defaults block near :328, and both
  decode paths near :368 and :425.
- `_GameObject.ts`: an `IMMUNE_COLOR` next to `FLOATING_NUMBER_COLORS`
  (grey, around `0xB0B0B0`). No new `FloatingNumberKind`: the label is not a
  number and must not go through `showFloatingNumber`, whose `value <= 0`
  guard would swallow it.
- `EntityManager.ts` and `Player.ts`: one branch each, alongside the existing
  damage branch, guarded per D9.

## 6. Landmines

1. **The interface surface, not just the struct.** The codec reads
   `model.MobEntity` / `model.PlayerEntity`. Adding the method to the concrete
   type without the interface fails the build loudly, which is the good case.
   The bad case is adding it to only one of the two entity kinds and shipping a
   feature that silently works on mobs only. The test list below pins both.
2. **Regenerate both binding sets.** A Go-only regeneration compiles and boots
   fine and the client reads `undefined` forever. Nothing warns.
3. **Two immune hits, two ticks, one label each.** Correct and intended, but it
   means the word repeats at the aura's tick cadence, once per beat. Watch this
   in the in-game check on Rockfall before deciding it is fine.
4. **`showFloatingNumber` is the wrong door.** Its `value <= 0` guard exists
   for exactly the opposite reason and would eat the label.
5. **Mob pseudo-corpses.** A mob removed on the same tick still renders briefly
   (`EntityManager.newSnapshot`). Not expected to matter, since an immune hit
   deals no damage and so kills nothing, but it is the one place a per-tick
   one-shot on a departing entity could surprise.

## 7. Test strategy

Red first, in this order:

- **Go, `model/mob`**: an invulnerable mob takes a hit, `ImmuneHit()` is true,
  `DamageTaken()` is 0, health unchanged.
- **Go, `model/mob`**: a `resistances {"*": 0}` mob takes a normal tagged hit,
  `ImmuneHit()` is true. (Rockfall is a real, shipped instance of this.)
- **Go, `model/mob`**: a gate-keyed hit at a mob without the key leaves
  `ImmuneHit()` false. This pin is D1, and it is the one a later refactor is
  most likely to break.
- **Go, `model/mob`**: a normal damaging hit leaves it false; a hit of 0.1 HP
  damages 1 and leaves it false (the floor pin, §2).
- **Go, `model/mob`**: one tick, two hits, one fully resisted and one landing:
  `ImmuneHit()` is true AND `DamageTaken() > 0`. This pins D9's premise, that
  the flags coexist, and it is the shipped Rockfall-under-harvest case.
- **Go, both**: `ResetTickNumbers` clears it.
- **Go, `model/player`**: full resist sets it; a god player does not.
- **Playwright (`verify` skill), new leg or an existing combat harness**: warp
  next to a Rockfall, run a normal damage aura, assert the "Immune" text
  appears over it and no damage number does.
- **In-game, PO**: the Warlord encounter with a banner alive. That is the case
  the feature exists for, and it is the one no harness covers.

Plus the standing tail: `go test -count=1`, `-race` on touched packages,
vitest, typecheck, both prod builds, a clean boot, `harnessdb -cleanup`.

## 8. Effort

**Small: about half a day**, one chunk, no reason to split it.

- wire plus regeneration: 20 minutes, mechanical
- backend flag, accessors, interfaces, codec: about 1 hour
- Go tests, written first: about 1 hour
- frontend decode plus two emit sites plus the colour: 30 minutes
- verify leg, in-game check, wrap: 1 to 2 hours

The cost is spread thin across roughly ten files rather than concentrated
anywhere, which is why the review risk is "forgot a file", not "got the logic
wrong". Every one of those files already has the identical `crit_taken`
edit in it to copy from.

## 9. Open

- **Cadence, after the first look.** If the repeat at aura tick rate reads as
  spam on Rockfall, the cheap fix is a client-side per-entity cooldown on the
  label (roughly 1 s), not a server change. Not built up front: YAGNI, and the
  PO's own eyes on Rockfall settle it in one minute.
- **CC immunity.** Once this exists, "Immune" over a ccImmune mob refusing a
  stun is a small follow-up on the same rails, and it closes a standing watch
  item. It needs its own signal, since no damage path runs there.
