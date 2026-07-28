# Plan: Runtime allegiance — fix L2 and ship charm as its first consumer

**Status:** planned 2026-07-28 (PO design session, via choice prompts). **DOCS
ONLY — no code written.** Two chunks, neither started.

Successor to **`plan-entity-model.md` §8 L2** (*"`SetFaction` nukes the authored
aggro mask"*), which that plan deliberately left open: *"fix it when runtime
faction changes are wanted — not speculatively, but do not forget it exists."*
Runtime faction changes are now wanted, so this is that moment. L2 stays in the
entity-model doc as the *finding*; this doc is the *plan*.

Every claim below was traced against HEAD (`ef4355f1`) during the session; file
and line references are from that commit.

---

## 1. What this is actually about

`Mob.SetFaction` (`model/mob/mob.go:658`) replaces the mob's authored aggro set
with `^f.Bit()` — *"aggro everything that is not me"*:

```go
func (m *Mob) SetFaction(f model.Faction) {
	m.faction = f
	m.aggroMask = ^f.Bit()   // ← the curated reaction table, gone
	m.refreshSensorMask()
}
```

The mask it discards is authored content: `api/factions/*.json` `hostileTo`,
resolved once at load (`factions/factions.go:172`) and handed to `NewMob`
(`mob.go:241`). There is no path back — the mob keeps no reference to the
faction registry.

### It has three readers, not one

`plan-entity-model.md` L2 frames this as an acquisition bug. It is wider:

| reader | site | what the overwrite does |
|---|---|---|
| `findAggroTarget` | `mob.go:1228` | proactive acquisition — now acquires *any* faction |
| `MayHarm` | `mob.go:1396` | **damage eligibility** — now may harm *any* faction |
| `aggroSensorMask` | `mob.go:681`, `710` | broadphase mask — widens to both combatant layers |

### And two callers, not one

The `mob.go:654` comment (*"first caller"*) is stale — the code audit for
`plan-entity-model.md` already caught this, and it still reads wrong:

- `sys/skills.go:1519` — `spawnSummon`, aligning a summon with its caster
- `cmd/aurad/aurad.go:157` — campfire placement at zone boot

---

## 2. The reframe — the value is not the bug, the API is

**`^f.Bit()` is *correct* for `aligned` and *undefined* for every other
destination.** `SetFaction` is a general-looking setter for which exactly one
destination was ever given semantics, and it silently destroys content when
pointed anywhere else.

Two facts found this session make the fix far smaller than L2 implies.

### ⭐ Finding 1 — the "restore" direction needs no registry

`MobDefinition.AggroMask` **is** the faction's authored mask
(`items/mobs/definitions.go:409`, `aggroMask = f.AggroMask`). A species never
carries a mask that differs from its faction's. So reverting a flipped mob is
`m.definition.Faction` + `m.definition.AggroMask` — both already on the
definition, no lookup, no new plumbing.

### ⭐ Finding 2 — there is no runtime faction registry to look up anyway

`factions.Registry` is **boot-only**: `loadFactions` (`cmd/aurad/loaders.go:105`)
builds it, `loadMobs` consumes it, and it is then discarded. Nothing in the
running game can resolve `Faction → AggroMask`. Building that plumbing is only
required for flips to a *third* faction, which no content wants — YAGNI.

### ⚑ Finding 3 — the overwrite is currently load-bearing

`sys/skills.go:403` `mayHarm` routes **every** harmful effect through
`MayHarm`, and its own comment says the permissive mask is what makes summons
work: *"every mob, incl. owned summons — whose SetFaction sets an all-others
aggro set, so their behavior is unchanged"*.

So the naive fix — *"look up the target faction's authored mask"* — **breaks the
game**. The built-in `aligned` faction is declared with `AggroMask: 0`
(`factions.go:109`), i.e. passive/retaliation-only. Derive from it and every
companion, totem and campfire silently loses its harm rights. This is why L2 has
stayed latent: both callers flip *to* `aligned`, the acquisition reader is
bypassed (summons are `follower` → `updateCompanionTargeting`; campfires are
`structure` + `auraAlwaysOn`), and the one live reader is live *because of* the
bug.

### The shape of the fix

Replace one undefined setter with two **defined verbs**:

- **`Align()`** — join the player side. Mask = all-but-aligned, which is
  bit-for-bit what happens today, so **both existing callers are unchanged**.
- **`RevertFaction()`** — return to the species' authored faction and mask, both
  read off `m.definition`.

Any third destination becomes a loud failure rather than silent data loss. ~20
lines, zero behaviour change, and it unblocks charm, side-switching guards and
quest-turns-hostile without any of them needing new engine work.

---

## 3. Decisions (PO, 2026-07-28, via choice prompts)

**D1 — scope: correctness *plus* charm as the first consumer.** The seam ships
with a content feature that exercises it, rather than being proven by test only.
(Rejected: correctness-only; a full generic allegiance-flip API; diagnose-only.)

**D2 — a charmed mob is credited to its charmer but keeps its own level.**
See §5.1 for why this does **not** re-open the chunk-1b ruling. (Rejected: no
owner / no XP credit; full owner binding with live re-levelling.)

**D3 — charm is a cooldown that hits the nearest enemy in radius.** GDD §9
forbids target-clicking, so delivery is radius-based: an instant effect with
`maxTargets: 1` and the `nearest` selector, mirroring `EffectTypeInstantDamage`.
Positioning is the skill expression — you walk to the mob you want. (Rejected:
charm every enemy in radius; a continuous charm aura.)

**D4 — charmability is an authored per-mob flag.** A `charmable` key on the mob
definition; content opts a boss or a scripted encounter out explicitly.
Consistent with chunk 2's ruling that role is authored, not inferred from an
incidental number. (Rejected: gating by tier rank — that is exactly the
inferred-from-a-number pattern chunk 2 spent a session retiring; and no gate at
all.)

**D5 — plan now, execute next session.** Two chunks, each in its own session,
per the house planning/execution split.

---

## 4. Chunk 1 — the allegiance seam

**Behaviour change: none.** This is pure correctness. Sim byte-identity is the
acceptance test.

### 4.1 What changes

1. **`model/mob/mob.go`** — `SetFaction` is replaced by:
   - `Align()` — `faction = FactionAligned`, `aggroMask = ^FactionAligned.Bit()`,
     `refreshSensorMask()`, `resetAggro()`.
   - `RevertFaction()` — `faction`/`aggroMask` from `m.definition`,
     `refreshSensorMask()`, `resetAggro()`.
   - The comment carries the *reason* the aligned mask is all-but-aligned: it
     mirrors the player's ungated harm rights (`sys/skills.go:414` — a caster
     without a `HostilityGate` may harm any different-faction target). It is a
     derivation, not a shortcut.
2. **`sys/skills.go:1519`** — `m.SetFaction(e.Faction())` → `m.Align()`. Note the
   call is already effectively `Align` today: `e` is the casting player, whose
   faction is always `FactionAligned`.
3. **`cmd/aurad/aurad.go:157`** — `m.SetFaction(model.FactionAligned)` →
   `m.Align()`.
4. **`factions/factions.go:109`** — make the built-in `aligned` entry honest:
   `AggroMask: ^Bit(Aligned)` instead of the current implicit `0`. **No
   behaviour change** — nothing reads it, because `faction: "aligned"` is
   rejected on mob definitions (`definitions.go:398`). It removes the
   contradiction that made `SetFaction` look wrong in the first place. See
   L-J for the one thing to check.

### 4.2 Why aggro must reset on **both** edges

Not cosmetic — required, and the reason is subtle:

- **On flip.** `updateEnemyTargeting:1133` reads `highestThreatTarget()` *first*.
  The player is still on the charmed mob's threat table, so it re-latches as the
  aggro target. `MayHarm` will not grant the harm (same faction now, and
  `eligibleByTargetFlags:447` short-circuits on faction equality before
  `mayHarm` is ever consulted) — so the visible result is a charmed wolf that
  chases the player menacingly and deals nothing. Clearing the table on flip
  removes it.
- **On revert.** An empty table means the mob re-acquires through its *restored*
  authored mask. "Charm wears off and it turns on you" then falls out of the
  existing acquisition path with no re-engage code — the same property
  `SetFleeOverride` relies on (`mob.go:1048`).

### 4.3 Test plan

- **Unit** — `Align()` preserves harm rights against every authored faction;
  `RevertFaction()` restores the *exact* definition mask (assert equality
  against `m.definition.AggroMask`, not a hand-written constant); both clear
  target + threat + leash counter; a round-trip `Align` → `RevertFaction` is
  identity on faction, mask and sensor mask.
- **Tombstone** — a test asserting no `SetFaction` remains, in the same spirit
  as chunk 3b-ii's `jsonInteraction.Trigger` boot-time tombstone: the trap here
  is someone re-adding a general setter years later.
- **Sim battery byte-identical** — TTK 6.67s / TTD 8.70s, the standing pins.
  Summons are the only sim-visible consumer.
- **Boot `-content ../api`** with the pinned counts (83 skills / 15 factions /
  64 mobs / 777 props / 485 spawns / 5 campfires, 0 errors 0 warnings) — L4: the
  sim feeds `NewMob` synthetic inline definitions and never loads authored
  content, so the `factions.go` change is invisible to sim byte-identity.

---

## 5. Chunk 2 — charm

### 5.1 ⭐ D2, and why it does not re-open chunk 1b

Today `owner` answers **two different questions at once**:

| question | site |
|---|---|
| *"whose level do I stand at?"* | `Level():765` — one site, and it drives `MaxHealth()` and `PowerScale()` |
| *"who gets credit for my kills?"* | `sys/skills.go:292`, `:474` (and `:389`, which reads `SummonPower`) |

A summon answers *the same player* to both — which is why one field has held. A
charmed mob answers **nobody** to the first and **the charmer** to the second.

**So split the question, not the field.** Keep `owner` meaning exactly what
chunk 1b made it mean, and add a separate `charmer` link:

- `Level()` / `MaxHealth()` / `PowerScale()` keep reading `owner` → **1b's
  ruling is untouched and no number moves.** A charmed elite stays elite.
- Attribution reads a new narrow capability — `model.Credited { CreditTo()
  PlayerEntity }`, implemented as *charmer if set, else owner*.

**The charmer is not an owner in the 1b sense, and `Owner()` stays nil for a
charmed mob.** That is the whole trick: the conflation that made "credit without
re-levelling" look expensive was one accessor doing two jobs.

**Already correct, verified this session:** `applyPlayerDamageAura:503` splits
`caster` (attribution) from `acting` (stats). `casterCritChance(acting)`,
`casterDamageFactor(acting)` and `berserkerMultiplier(…, acting)` all read the
**acting** entity, so the player's crit chance and damage factor correctly do
**not** leak into a charmed mob's hits. Nothing to change there.

### 5.2 The pieces

1. **`charmTicks` on `Mob`** — a countdown decremented in `Mob.Update`, reverting
   at zero. Direct mirror of `ttlTicks` (`mob.go:512`, `:813`), which is the only
   existing timed-state seam on a mob; the difference is that TTL kills and charm
   reverts.
2. **`charmer` field + `CreditTo()`**, per §5.1.
3. **`EffectTypeCharm` + `CharmParams{DurationTicks, DurationTicksPerLevel}`** —
   a new effect type in `skills/definition.go`, with the `default:` guard in
   `mapToEffectDef` covering it (§27.3.1: a new EffectType must not be able to
   ship a nil-payload no-op).
4. **`charmable` on `MobDefinition`** (D4) — validated at load, checked at cast.
5. **Content** — one cooldown skill in `api/skills/`, plus the `charmable` key
   on any mob that opts out.

### 5.3 Implementation order

1. `charmable` on the definition + loader validation, no consumer yet (boot
   stays green with the pinned counts).
2. `charmer` + `CreditTo()` + the three attribution sites, no consumer yet — and
   a test proving `Level()` is unaffected by a charmer.
3. `charmTicks` + `Charm(by, ticks)` / revert on expiry, driven directly in a
   unit test.
4. `EffectTypeCharm` + params + the cast-site wiring.
5. Content authoring + the in-game harness run.

### 5.4 Test plan

- **Unit** — `Level()` and `MaxHealth()` are byte-identical before and after a
  charm (the L-B pin); credit routes to the charmer while the mob's own stats
  drive the damage; the timer reverts exactly at zero; `charmable: false` is
  refused at cast; expiry restores the exact authored faction *and* mask.
- **Sim** — unaffected; no sim mob authors charm. Re-run the battery anyway to
  prove the new fields cost nothing (L4 / the alloc pins).
- **In-game harness** (`.claude/skills/verify`) — the acceptance surface. Charm
  a wolf; assert it stops damaging the player, that a *second* wolf now attacks
  it (its former faction reads it as aligned — free, via the other mob's own
  authored mask), that the player's aura no longer damages it, that XP credits
  on a charmed-mob kill, and that on expiry it turns on the player again.

---

## 6. Landmines

**L-A — the flip must reset aggro on both edges.** §4.2. Skipping the flip side
gives a charmed mob that chases the player and deals nothing; skipping the
revert side loses the free re-engage.

**L-B — `SetOwner` is no longer bookkeeping.** Since chunk 1b, `Level():765`
reads the owner's level **live**, so binding a charmed mob via `SetOwner` would
re-level it — a charmed elite would shrink to the charmer's level. §5.1 defuses
this by not using `owner` at all, but the trap survives for anyone who later
reaches for the obvious field. Pin it with a test, not a comment.

**L-C — the client has no charm tell.** `combatTarget` is derived from the
*definition* at catalog load (`catalog.go:63`, `Experience > 0 &&
!FriendlyToPlayers`) — static per species — so a charmed wolf keeps its
nameplate and health bar, and faction is not on the wire at all. Charm is
therefore **invisible to the player** unless something is added. Open question 5.

**L-D — a charmed mob cannot attack player-friendly factions.** `mayHarm:409`
short-circuits: an `aligned` caster can never harm a `FriendlyToPlayers` target.
So a charmed mob is inert against townsfolk and the Human Army for the charm's
duration. Almost certainly desirable, but it is a behaviour nobody authored — it
falls out of the flip.

**L-E — ⚑ charm makes a mob untargetable by *every* player, not just the
charmer.** Faction is a global property of the entity. In a shared open world,
charming a mob mid-fight makes it immune to everyone else's auras too, and it
stops attacking them. GDD §9 says *"no griefing possible by design"*. D4's
authored `charmable` flag contains the worst case (a boss opts out), but the
general shape is a real design question — open question 4, and the one most
worth settling before chunk 2 starts.

**L-F — double-charm.** Re-casting on an already-charmed mob must be defined:
refresh the timer, or no-op. Open question 2.

**L-G — the charmer can leave.** Death, disconnect or zone change while a charm
is live leaves a dangling `charmer` pointer. The `Owned` path has the same shape
and handles it by reading dead (`highestThreatTarget` prunes as it reads,
`mob.go:1407`), but charm must decide explicitly. Open question 3.

**L-H — a charmed mob does not follow you.** `isFollower()` reads the *authored*
role since chunk 2, and a charmed creature stays `creature`. It runs
`updateEnemyTargeting` and fights whatever is near it, standing where it stood.
That is a coherent design (charm is a control tool, not a pet), but it is a
consequence, not a decision. Open question 1.

**L-I — safe zones.** A charmed mob inside a campfire safe zone becomes a target
that hostile mobs are blocked from chasing (`blockedBySafeZone:1129`). Untested
interaction; harmless as far as traced, but worth one harness assertion.

**L-J — the `factions.go:109` tidy-up has one thing to check.** Making the
built-in `aligned` entry carry `^Bit(Aligned)` is inert *provided* nothing walks
`registry.All()` and acts on masks. `loadFactions` only counts it for the boot
log, and the `FriendlyToPlayers && AggroMask&Bit(Aligned) != 0` contradiction
check (`factions.go:174`) runs over content docs only — but re-grep before
editing, and keep the boot count pinned at 15.

---

## 7. Open questions (resolve before or inside chunk 2)

1. **Does a charmed mob follow the charmer?** (L-H) *Proposal: no.* It fights
   what is near it. Following means giving it the `follower` role at runtime,
   which re-introduces exactly the owner-centric coupling §5.1 avoids.
2. **Re-charming an already-charmed mob** — refresh the timer, or no-op?
   *Proposal: refresh.*
3. **Does charm survive the charmer's death or disconnect?** *Proposal: revert
   immediately* — it keeps the dangling-pointer window at zero.
4. **⚑ L-E: shared-world untargetability.** Accept it (charm is short and
   cooperative, and the mob stops attacking everyone too), or constrain charm to
   mobs where it cannot matter? D4's flag is the containment mechanism either
   way. **The one to settle first.**
5. **Visual tell** (L-C) — does the client need to show a charmed mob as
   friendly? Cheapest is an existing status-effect pip; a faction-on-the-wire
   change is a schema edit and should not be taken casually.
6. **`charmable` default** — true (opt out) or false (opt in)? *Proposal: true*,
   matching D4's framing, with bosses opting out.
7. **Numbers** — duration, cooldown, radius, and whether duration scales with
   skill level. All **[PLACEHOLDER]** until the PO sets them.

---

## 8. Chunk ledger

*(filled in as chunks land — one entry per chunk: what was decided inside it,
what shipped, which commit, what was verified.)*
