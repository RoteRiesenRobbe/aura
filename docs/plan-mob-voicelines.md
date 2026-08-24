# Plan — Mob aggro voicelines ("You should not have come here")

**Status:** ⏸ DEFERRED 2026-08-24 (PO choice, together with
`plan-npc-hails.md`): tackle only if play-feel makes it necessary again.
Previously: 📋 PLANNED 2026-08-02, not started. One chunk, backend-only,
frontend zero-change. PO idea, WoW-Classic reference (only *some* mobs shout,
and the shout is the pull's punctuation).

**Scope:** a mob speaks an authored line the moment it latches onto an enemy.
Nothing else — no death lines, no low-HP lines, no player-facing setting.

---

## 1. Why this is small

Every layer this needs already exists and is proven in-game by the Town Crier's
walk-by ambient speech (`plan-entity-model.md` D18):

| Layer | What already exists | Where |
| --- | --- | --- |
| The trigger edge | `setAggroTarget` calls `noteCombatEntry()` exactly on the nil → non-nil transition | `model/mob/mob.go:1310` |
| The audience | `Mob.Sensor()` — the aggro sensor, already collision-tracking players | `model/mob/mob.go:796` |
| The fan-out | `speakToSensor` marshals one `EntityMessage` anchored on the actor and sends it to every player in that sensor | `sys/interaction.go:339` |
| The wire | `EntityMessageKindChat`, unchanged | `codec.EntityMessageFlatbufMarshal` |
| The rendering | `say()` was hoisted from Character onto `_GameObject`, so **any** game object can already show a floating bubble; non-Character speakers are single-slot latest-wins | `frontend/.../logic/_GameObject.ts:288` |

So the work is: author lines → stash a pending shout on the existing edge →
drain it in `MobSystem.Update` → reuse the existing fan-out. **No new message
kind, no schema change, no FlatBuffers regeneration, no client change.**

---

## 2. PO decisions (2026-08-02)

- **D1 — throttle: a per-mob cooldown, ~30 s [PLACEHOLDER].** Fires on every
  aggro rising edge but at most once per cooldown. Rejected: once-per-life (too
  quiet — a mob re-pulled after a wipe should shout again) and no-throttle (the
  leash countdown is 90 ticks ≈ 3 s, `mob.go:1182`, so a kiting player would
  farm the bubble).
- **D2 — aggro only.** The authored field is `aggroLines`, not a lines
  container. Death and low-HP lines are a later additive field + a second edge;
  YAGNI until asked for.
- **D3 — audience is the sensor, unchanged.** Exactly the Town Crier's rule,
  so `speakToSensor` is reused verbatim. ⚑ **Accepted gap:** threat acquired
  from *outside* the sensor (a ranged pull — `updateEnemyTargeting` reads the
  threat table before the sensor, `mob.go:1277`) means the puller may not be in
  the collision set and hears nothing. Accepted as the price of not writing a
  second audience rule.
- **D4 — content: a handful.** Elites and bosses plus a few flavour mobs, not
  the whole catalog. Most mobs stay silent so a shout means something.

**D5 (my call, flag if wrong): a follower never shouts.** `updateCompanionTargeting`
reaches the same `setAggroTarget`, so a charmed wolf or a summoned Companion
would shout at its own owner's target every pull. Gated on `isFollower()`.

---

## 3. The change, file by file

### 3.1 Content vocabulary — `items/mobs/definitions.go`

Add to **both** structs (they are deliberately separate — the runtime
definition and the authored JSON shape):

- `MobDefinition.AggroLines []string` (~line 161 block)
- `mobDefinition.AggroLines []string \`json:"aggroLines"\`` (~line 239 block)

and one line in the mapper. Absent → nil → the mob is silent.

⚑ **Do NOT author these inside `interaction.ambient`.** Carrying an
`interaction` block is what makes an actor *conversant*: it lights the `E`
badge, opens a dialogue tree and joins `InteractionSystem.actors`
(`sys/interaction.go:122`). A shouting wolf must not become a talkable NPC.
Separate top-level field, no `interaction` block.

⚑ The mob loader has `DisallowUnknownFields` (`parseMobDefinition`), so a typo
in an authored file hard-fails at boot by name. Good — but it also means the
field **must** be declared before any content is written, or every authored
file fails to load.

### 3.2 The edge — `model/mob/mob.go`

Two fields on `Mob` and ~12 lines:

- `shoutCooldown int` — ticks remaining, decremented in `Update` alongside the
  existing counters.
- In `setAggroTarget`, inside the existing `if m.aggroTarget == nil` branch
  (next to `noteCombatEntry()`): if not a follower, has lines, and cooldown is
  0 → pick a line, stash it as `pendingShout string`, set
  `shoutCooldown = shoutCooldownTicks`.
- `TakeAggroShout() string` — returns and clears `pendingShout` (the drain).

Lines are read straight off `m.definition.AggroLines` — the Conversant
precedent (`mob.go:802`): **zero per-mob bytes**, so 121 authored Wolf spawns
carry nothing.

`const shoutCooldownTicks = 30 * constant.TicksPerSecond // 30 s [PLACEHOLDER]`
— the `leashCountdownTicks` precedent (`mob.go:1182`), a named constant with
the seconds in the comment.

### 3.3 The drain — `sys/mob.go`

In `MobSystem.Update`, in the existing `for _, mob := range n.mobs` loop
(`sys/mob.go:102`), after `mob.Update(dt)`: structurally assert the shouter
capability, take the pending line, and if non-empty call `speakToSensor`.

`speakToSensor` currently takes `Conversant` (which requires `Interaction()`,
which a wolf does not have). Narrow its parameter to a new two-method
interface — `Basic()` + `Sensor()` — which `Conversant` satisfies for free, so
the ambient caller is untouched. Both are in package `sys`, so nothing needs
exporting.

Site choice: `MobSystem.Update` and not `InteractionSystem`, because
`InteractionSystem.actors` is by construction only the conversants.

---

## 4. Landmines

- ⚑ **L1 — the structural-assert silent-wiring class, for the third time.**
  `MobSystem` holds `[]model.MobEntity`, and `model.MobEntity` does **not**
  declare `Sensor()` (that is why `Conversant` names it separately,
  `sys/interaction.go:26`). So the drain is an `acting any`-style runtime
  assert, and **a `*Mob` missing a method fails silently and completely** —
  every unit test green over a feature that never fires. This is exactly R2's
  eight-broken-test-doubles bug and R3's *"built, dispatched and tested GREEN
  while the real types lacked the methods"*. **Mitigation is mandatory and
  named in the test plan: a capability test asserting the REAL `*mob.Mob`
  satisfies the shouter interface**, on the `sys/self_buff_capabilities_test.go`
  precedent.
- ⚑ **L2 — do not draw from `m.rand` unconditionally.** The per-mob RNG
  (`mob.go:262`, seeded `mobRNGSeed(processSalt, id)`) is shared with the drop
  roll (`mob.go:1986`). A draw on aggro **shifts the drop-roll stream**, which
  is the determinism property backlog §27.2.2 deliberately established. Guard
  the draw behind `len(lines) > 0` (natural anyway): no sim-battery or
  guardrail mob authors lines — `sim/world.go` feeds `NewMob` synthetic inline
  definitions — so **the sim battery stays byte-identical by construction**,
  and that is the acceptance test. With a single authored line, prefer
  `lines[0]` and skip the RNG entirely.
- ⚑ **L3 — allocation.** The idle-loop alloc pins run with zero players, so
  they cannot see this. Still: the drain must allocate nothing when nobody
  shouts (no per-tick slice), and the flatbuffers marshal happens only on the
  edge. Re-run the alloc pins with `-count=2` regardless.
- ⚑ **L4 — the bubble needs the speaker in the player's viewport.**
  `Chat.showMessage` returns silently for an untracked entity
  (`Chat.ts:58`). Aggro radii (~5.4) are far inside the viewport, so this is
  fine today — but it is why the line renders for a melee pull and would not
  for a hypothetical 60-unit sensor.
- ⚑ **L5 — a pack shouts as a pack.** Bubbles are per-entity and latest-wins,
  so six wolves pulling together put six bubbles on screen. D4 (elites/bosses
  only) is the mitigation; if flavour lines later go onto pack mobs, expect to
  need a per-*species*-per-area throttle, which this chunk does not build.

---

## 5. Content (D4)

Live elite/boss defs, all currently silent:

`orc-warlord.json` (boss, spawned by the encounter controller) ·
`orc.json` (elite, 12 zone spawns) · `elite-wolf.json` (7) · `troll.json` (6) ·
`elite-bandit.json` (1) · `greater-fire-elemental.json` (1). (⚑ The legacy
angry-mammoth / mammoth / proving-boss candidates were deleted at zone-editor
C3, 2026-08-16 — the six live ones are the whole list now.)

Proposal: **the six live ones**, one or two lines each, plus **`bandit.json`**
as the one flavour normal-tier mob (21 spawns, humanoid, a shout reads
naturally). Wolves and wildlife stay silent — an animal shouting a sentence is
the wrong register, and Wolf's 121 spawns are exactly L5.

Text is the PO's to write. Everything is [PLACEHOLDER] until then.

---

## 6. Test strategy

**Go, model/mob:**
1. Aggro edge with lines → a shout is pending; taking it clears it.
2. Second aggro edge inside the cooldown → nothing pending.
3. Cooldown elapsed → shouts again.
4. No authored lines → nothing pending, **and the RNG stream is untouched**
   (L2 — assert the next drop roll matches a mob that never aggroed).
5. A follower latching a target → nothing pending (D5).

**Go, sys:**
6. **Capability test: the real `*mob.Mob` satisfies the shouter interface** (L1).
   This is the one test whose absence makes everything else meaningless.
7. Drain → every player in the sensor receives one message; a player outside
   receives none.

**Content:** boot `-content ../api` clean, pinned counts unchanged.

**Sim:** the full battery **byte-identical** (L2) — default, `-chain`,
`-levels`, `-content ../api` roster; TTK 6.67 s / TTD 8.70 s stand.

**Harness (`.claude/skills/verify`):** a new `mob-voiceline.mjs` — walk into an
authored elite, assert the bubble text appears over that entity, walk out and
back in inside the cooldown and assert **no** second bubble. ⚑ Assert on the
bubble's presence over the *mob's* entity, not on a screen-space position (the
`Cam Boundaries: On` trap) and remember a killed player nulls `Character.plate`.

---

## 7. Effort

One chunk, ~half a session:

| Part | Size |
| --- | --- |
| Definition field + mapper | ~10 lines |
| Mob edge + cooldown + drain accessor | ~15 lines |
| `speakToSensor` param narrowing + `MobSystem` drain | ~20 lines |
| Go tests (7 above) | ~120 lines |
| Harness leg | ~80 lines |
| Content | 7 files, PO text |
| Frontend | **0** |

## 8. Open

- The 30 s cooldown value [PLACEHOLDER] — first number to check in the PO pass.
- D5 (followers silent) is my call, not a ruling.
- D3's ranged-pull gap is accepted, not fixed. If it grates in play, the fix is
  `sensor ∪ aggroTarget`, ~4 lines.
