# Plan: Runtime allegiance — fix L2 and ship charm as its first consumer

**Status:** planned 2026-07-28 (PO design session, via choice prompts), **extended
2026-07-28 in a second design session** (D6–D13, the WoW framing, calm added as
its own chunk). **Chunk 1 ✅ SHIPPED 2026-07-28 · chunk 2 ✅ SHIPPED 2026-07-29**
(§9) — **chunk 3 (charm) is the only one left**. ⚑ **Two plan claims were WRONG
and are corrected in place:** §4.1 item 2 (the summon path has a mob-caster leg,
which shipped as a third verb — L-N) and §5.3 item 1 (calm's countdown belongs in
the buff store, not a `Mob` field — L-O).

⭐ **The second session's reframe: charm is a temporary PET, not a debuff.** The
PO named the reference — WoW's *Subjugate Demon*: specific mobs only, fights for
you for a limited time, reverts when the link breaks. That framing made the work
**smaller, not bigger**, because "acts like a companion" is already shipped
behaviour gated behind exactly **four `isFollower()` call sites**, and it closed
the one blocking open question (see D9). It also added a second, cheaper verb —
**calm** — which needs none of the faction machinery.

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

The `mob.go:654` comment (*"first caller"*) **was** stale — the code audit for
`plan-entity-model.md` caught it twice. ✅ **Fixed in chunk R1 (2026-07-28):** the
comment now names both callers and carries the L2 warning inline, so the trap is
visible at the function rather than only in this plan. The two callers:

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
See §6.1 for why this does **not** re-open the chunk-1b ruling. (Rejected: no
owner / no XP credit; full owner binding with live re-levelling.)

**D3 — charm is a cooldown that hits the nearest enemy in radius.** GDD §9
forbids target-clicking, so delivery is radius-based: an instant effect with
`maxTargets: 1` and the `nearest` selector, mirroring `EffectTypeInstantDamage`.
Positioning is the skill expression — you walk to the mob you want. (Rejected:
charm every enemy in radius; a continuous charm aura.)

**D4 — charmability is an authored per-mob flag.** ⚠ **SUPERSEDED BY D8** in the
second session: the gate moved from the *mob* to the *skill*. The reasoning that
produced D4 survives intact — charmability is **authored, never inferred from a
number** — only its location changed. (Rejected then and still rejected: gating
by tier rank, and no gate at all.)

**D5 — plan now, execute next session.** ~~Two~~ **three** chunks, each in its
own session, per the house planning/execution split.

---

## 3b. Decisions — second session (PO, 2026-07-28, via choice prompts)

**D6 — ⭐ a charmed mob is a full COMPANION, not a pacified one.** It fights for
the charmer, attacks what the charmer attacks, and follows them, for a limited
time; when the link breaks it reverts to an ordinary world mob. This is the WoW
*Subjugate Demon* model, named by the PO as the reference. It **supersedes open
question 1's proposal** (*"no, it fights what is near it"*), and it is cheaper
than that proposal implied — see §6.1b. (Rejected: charm as pure crowd control.)

**D7 — ⭐ calm is a separate spell and its own chunk.** "Put the mob out of
combat until it is attacked." It **does not flip faction**, so it needs none of
chunk 1's seam, carries none of charm's open questions, and is the cheapest of
the three pieces of work. Scoped to wildlife for now. See §5.

**D8 — ⭐ targeting scope is authored on the SKILL as a faction allowlist, not on
the mob.** The PO is authoring **two** charm spells — *charm wildlife* and *charm
elementals* — explicitly *"so we ensure we can do it smartly twice and don't
hardcode anything"*. That requirement kills the per-mob boolean of D4: a flag
answers *"can anything charm me?"* when the real question is *"which spell reaches
which factions?"*. So the skill authors faction **names**, resolved to a bitmask
at content load (the faction registry is boot-only — finding 2 — so names are not
available at runtime, bits are), and the cast tests one mask.

**One mechanism, three consumers on day one:** charm-wildlife, charm-elementals,
calm-wildlife. That is the "smartly twice" proof the PO asked for, and it makes a
later *charm bandits* a content edit rather than a code change.

**D9 — ⭐ allied players CANNOT harm a charmed mob, and this CLOSES open question
4.** The PO's ruling: *"no allied player should be able to harm the charmed mob,
similar to WoW. The mob is now also friendly to the player anyway."* This is
**exactly what the global faction flip already produces** — L-E was written up as
a hazard and is hereby **adopted as the intended behaviour**. The charmed mob
also stops harming players, in both directions, via auras and cooldowns alike, by
the same faction equality. ⚑ **The griefing question is not answered, it is
DEFERRED by explicit PO decision** — *"making sure this does not result in
griefing is a topic for later, when authoring who can charm what with what
spell"*. D8's per-skill scope is the lever that will answer it. (Rejected:
another player's damage breaking the charm — that would be a griefing lever in
itself; and a distance leash.)

**D10 — charm breaks on expiry, or when the charmer dies or disconnects.**
Revert immediately in both cases, which keeps the dangling-charmer window at zero
and matches WoW (your pet turns on you when you die). Closes open question 3.
(Rejected: surviving the charmer's death; breaking on distance.)

**D11 — an already-charmed mob is NOT a valid charm target.** Delivery is
radius-based with the `nearest` selector (D3), so the cast simply passes over it
and takes the next-nearest eligible mob. No timer refresh, no pet stealing, no
new failure case for the client to explain. ⚑ **Consequence the PO accepted:
you cannot extend a charm** — when it runs out you re-charm from scratch, and
during the gap the mob is hostile again. Closes open question 2. (Rejected:
refresh-on-recast; refresh-yours-refuse-theirs.)

**D12 — elites are charmable; faction scope alone decides.** Both scoped factions
contain exactly one elite (`elite-wolf`, `greater-fire-elemental`) and **no
boss**. A charmed elite keeps its own level (D2), so it is a genuinely strong pet
— which is the enslave fantasy. No second gate is built. (Rejected: normal-tier
only — tier-gating is the infer-from-a-number pattern entity-model chunk 2
retired, already rejected once as D4; and a per-mob opt-out built speculatively.)

**D13 — the client tell is a status-effect pip, for now.** PO: *"reuse the status
effect pip for now — we'll have to redo the entire frontend display later on
anyway to show more information."* No schema change, no wire field, no touching
the pinned unions. Closes open question 5 **as an interim measure**, and records
that a proper pet frame (name / health / time remaining) is expected to arrive
with that frontend rework, not before.

**D14 — numbers: long and committal [PLACEHOLDER].** Charm ~60 s duration /
~120 s cooldown — the pet is a real part of the kit for a whole encounter rather
than a tactical blip. Calm and the radii still need values; see open question 3.
⚑ A long duration makes **L-G** (charmer leaves) and **L-F** (the no-op gap)
more likely to be hit in play, not less.

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
2. **`sys/skills.go:1519`** — `m.SetFaction(e.Faction())` → `m.Align()`. ~~Note the
   call is already effectively `Align` today: `e` is the casting player, whose
   faction is always `FactionAligned`.~~ ⚑ **WRONG — corrected during execution,
   see L-N.** Mobs fire their own cooldowns (`processCooldowns`), the mob-caster
   spawn path is pinned by a shipped test, and a plain `Align()` turns it red.
   Shipped as a **third verb**, `EnlistUnder(model.Allegiance)`.
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

## 5. Chunk 2 — calm (D7)

**"Out of combat until it is attacked."** Scoped to wildlife. This chunk exists
because the PO asked for a second, gentler verb — and it turns out to need
**none** of the faction machinery, which makes it the cheapest real feature in
the plan and the natural place to build D8's authoring seam.

### 5.1 Why it is cheap — no faction flip

Calm never leaves its own faction. Everything that makes charm expensive is
therefore absent: no `Align()`/`RevertFaction()`, no credit question, no level
question, no L-E untargetability, no client tell beyond D13's pip, no schema
pressure. A calmed wolf is still a wolf that anyone can damage — it has simply
stopped swinging.

⚑ **The corollary matters for scheduling: calm does NOT exercise chunk 1's
seam.** D1 requires the seam ship with a consumer that proves it *by use*. Calm
cannot be that consumer — only charm can. Calm can run before or after chunk 1;
it does not substitute for chunk 3.

### 5.2 What exists already

| calm needs | what is there |
|---|---|
| drop the current target | `resetAggro()` |
| acquire nothing while calmed | the **pacifist** branch in `updateAggro` (`support.go:98`) is already *"acquires no enemy at all"* |
| a runtime boolean override on the AI | `fleeOverride` (`mob.go:1097`) is the precedent, comment and all |
| a break signal | `tookDamage`, already set by damage and read at the top of `updateEnemyTargeting` |
| a countdown | `ttlTicks` (`mob.go:854`) is the shape to mirror |

### 5.3 What is new

1. ~~**`calmTicks` on `Mob`** — countdown in `Update`, mirroring `ttlTicks`.~~
   ⚠ **WRONG, corrected in execution (L-O):** the countdown belongs in the
   existing **`skills.Buffs`** store as an empty `calmPayload`. The pip is
   *derived* from that store (`AppliedEffects()` ORs `appliedBit()` over live
   entries), and `buffPayload` is a closed interface whose stated purpose is
   that a new kind cannot compile without deciding its pip — so a `Mob` field
   would have had to bypass the one mechanism that guarantees the client tell.
   The store also already owns aging and per-skill refresh. See §9.
2. **A branch in `updateAggro`**, ahead of the pacifist case: while calmed,
   `resetAggro()` and acquire nothing.
3. **Break on damage** — any `tookDamage` clears `calmTicks` immediately (D-calm
   below).
4. **`EffectTypeCalm` + `CalmParams{DurationTicks, DurationTicksPerLevel}`**, with
   the `mapToEffectDef` `default:` guard covering it (§27.3.1 — a new EffectType
   must not be able to ship a nil-payload no-op).
5. **The faction-allowlist seam (D8)** — authored names on the skill, resolved to
   a mask at content load, one mask test at cast. **Built here, reused by chunk 3
   twice.** ⚑ Two things the plan did not know: **skills loaded BEFORE factions**
   at boot, so the resolution had nowhere to happen (order swapped); and the
   resolved mask is **stamped onto the skill's effects**, because the runtime
   gate lives in `eligibleByTargetFlags` — the one predicate every targeted
   effect already passes through. See §9.
6. **Content** — one cooldown skill scoped to `wildlife_prey` +
   `wildlife_predator`.

### 5.4 ⚑ The design snag, ruled

**Your aura ticks automatically on everything in range**, so standing next to a
calmed mob with a damage aura active breaks your own calm instantly. In WoW you
can choose not to attack; here you cannot, short of switching to a non-damaging
aura (the loadout allows exactly one active aura, so this is a real option).

**PO ruling: that is the intent — calm is a DISENGAGE tool.** Any damage breaks
it, the calmer's own aura included. No per-caster exemption, no exceptions in
code. Calm means *"stop this fight so I can leave"*, not *"hold this one while I
kill that one"*. (Rejected: exempting the calmer's own damage — that is a
per-caster relation, exactly what the global faction model avoids; and breaking
only on player damage.)

⚑ **Consequence to watch in playtest:** calm is useless as crowd control, and a
player who expects sheep-and-kill will read it as broken. The pip (D13) is the
only feedback that it was ever applied.

### 5.5 Test plan

- **Unit** — a calmed mob drops its target and acquires nothing; damage from any
  source breaks it the same tick; expiry restores normal acquisition; a
  non-wildlife mob is refused at cast; the faction mask resolves from authored
  names at load and hard-fails an unknown name.
- **Sim** — unaffected (no sim mob authors calm), but re-run the battery to prove
  the new field costs nothing (L4 / the alloc pins).
- **In-game harness** — calm a wolf mid-chase, assert it stops chasing and stops
  damaging; walk away and confirm it does not re-acquire; hit it and confirm it
  immediately does.

---

## 6. Chunk 3 — charm

### 6.1 ⭐ D2, and why it does not re-open chunk 1b

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

### 6.1b ⭐ D6 — the pet behaviour is four call sites away

The second session's key finding. "Acts like a companion" is **already shipped,
in-game-verified behaviour** (`chunk2-follower.mjs`, 6/6), and every part of the
WoW pet fantasy already exists somewhere:

| Subjugate Demon does | this engine already has |
|---|---|
| fights for you, attacks what you attack | `updateCompanionTargeting` (`companion.go:122`) — `RecentAttacker()` then `RecentAttackTarget()`, defend-before-assist |
| follows you around | `updateFollow` — follow ring, per-pet angle offset, teleport catch-up |
| stays near you | the owner tether bounds acquisition *and* stickiness |
| limited duration | `ttlTicks` (`mob.go:854`), the only timed-state seam on a mob |
| reverts, turns on you | `RevertFaction()` + an empty threat table ⇒ re-acquisition through the **restored** authored mask, free (§4.2) |
| only specific mobs | D8's per-skill faction allowlist |
| keeps its own level | D2 |

**And the whole package is gated behind one predicate with four call sites:**

| site | what it gates |
|---|---|
| `companion.go:68` | the predicate itself — `role == RoleFollower && m.owner != nil` |
| `mob.go:1143` | targeting → `updateCompanionTargeting` |
| `patrol.go:89` | movement → `updateFollow` |
| `patrol.go:116` | `noteCombatEntry` skips the evade point |

#### The third question

Making that predicate true for a charmed mob must **not** go through `owner` —
that is **L-B**: `Level():765` reads the owner's level live, so binding a charmed
elite would shrink it to the charmer's level and re-open chunk 1b.

So apply §6.1's move a second time. `owner` was answering two questions; a pet
needs a third:

| question | answered by |
|---|---|
| *whose level do I stand at?* | `owner` — **unchanged**, 1b untouched |
| *who gets credit for my kills?* | `CreditTo()` = charmer ?? owner (D2) |
| *whose combat signals do I follow, and whom do I trail?* | **`leader()` = charmer ?? owner** — new |

Then:

- `isFollower()` becomes *"has a leader, and is either an authored follower or
  currently charmed"*.
- The `owner` reads **inside `companion.go`** (`ownerCombatant`,
  `withinOwnerTether`, `updateFollow`, `updateCompanionTargeting`) become
  `leader()` reads — a mechanical substitution in one file.
- `Level()`, `MaxHealth()` and `PowerScale()` never see it. `Owner()` stays nil
  for a charmed mob.

**No runtime role mutation.** `m.role` has only two non-test readers
(`companion.go:68`, `support.go:198`), and neither is written after construction
— keeping it that way preserves entity-model chunk 2's authored-role property.

⚑ **Check during implementation, not assumed:** `updateCompanionTargeting`
type-asserts the leader to `model.CombatSignals`. Players satisfy it; confirm the
assertion is on `leader()` and not re-derived from `owner`, or a charmed mob will
silently acquire nothing and just stand there looking obedient.

### 6.2 The pieces

1. **`charmTicks` on `Mob`** — a countdown decremented in `Mob.Update`, reverting
   at zero. Direct mirror of `ttlTicks` (`mob.go:512`, `:813`), which is the only
   existing timed-state seam on a mob; the difference is that TTL kills and charm
   reverts.
2. **`charmer` field + `CreditTo()`**, per §6.1.
3. **`leader()` + the `isFollower()` widening + the `companion.go` substitution**,
   per §6.1b (D6). The pet behaviour itself is not written — it is re-pointed.
4. **`EffectTypeCharm` + `CharmParams{DurationTicks, DurationTicksPerLevel}`** —
   a new effect type in `skills/definition.go`, with the `default:` guard in
   `mapToEffectDef` covering it (§27.3.1: a new EffectType must not be able to
   ship a nil-payload no-op).
5. **The already-charmed check (D11)** — a charmed mob is not an eligible target,
   so the `nearest` selector passes over it.
6. **Break on charmer death/disconnect (D10)** — revert immediately.
7. **The status-effect pip (D13)** — the interim client tell, no wire change.
8. **Content — TWO skills (D8):** *charm wildlife* (`wildlife_prey` +
   `wildlife_predator`) and *charm elementals* (`elemental`), both riding the same
   faction-allowlist seam built in chunk 2. **Authoring both is the acceptance
   test for D8** — if the second one needs a code change, the mechanism was
   hardcoded and the chunk is not done.

**Not built:** `charmable` on `MobDefinition` (D4, superseded by D8) and any
tier gate (D12).

### 6.3 Implementation order

1. `charmer` + `CreditTo()` + the three attribution sites, no consumer yet — and
   a test proving `Level()` is unaffected by a charmer.
2. `leader()` + `isFollower()` + the `companion.go` substitution, with the
   existing follower tests still green — **this step must move no summon
   behaviour at all**, which the shipped companion tests already pin.
3. `charmTicks` + `Charm(by, ticks)` / revert on expiry / revert on charmer loss,
   driven directly in a unit test.
4. `EffectTypeCharm` + params + the cast-site wiring + the D11 eligibility check.
5. The D13 pip.
6. Content authoring — **wildlife first, then elementals as a pure content
   edit** — and the in-game harness run.

### 6.4 Test plan

- **Unit** — `Level()` and `MaxHealth()` are byte-identical before and after a
  charm (the L-B pin); `Owner()` stays nil; credit routes to the charmer while
  the mob's own stats drive the damage; the timer reverts exactly at zero; a
  faction outside the skill's allowlist is refused at cast; an already-charmed
  mob is not eligible (D11); charmer death reverts on the same tick (D10);
  expiry restores the exact authored faction *and* mask.
- **Regression** — the shipped summon/companion suite must stay green through
  the `leader()` substitution, unmodified. If a companion test needs editing,
  the substitution changed behaviour it should not have.
- **Sim** — unaffected; no sim mob authors charm. Re-run the battery anyway to
  prove the new fields cost nothing (L4 / the alloc pins).
- **In-game harness** (`.claude/skills/verify`) — the acceptance surface. Charm
  a wolf; assert it stops damaging the player, that a *second* wolf now attacks
  it (its former faction reads it as aligned — free, via the other mob's own
  authored mask), that the player's aura no longer damages it, that XP credits
  on a charmed-mob kill, and that on expiry it turns on the player again.
  **Plus, for D6:** that it **follows** the player across a walk, and that it
  **attacks what the player attacks** — the `chunk2-follower.mjs` run is the
  template, and its two hard-won harness lessons apply directly (a killed player
  nulls `Character.plate`, and `Cam Boundaries: On` means the player is **not**
  at screen centre, so never measure follow distance in screen space).

---

## 7. Landmines

**L-A — the flip must reset aggro on both edges.** §4.2. Skipping the flip side
gives a charmed mob that chases the player and deals nothing; skipping the
revert side loses the free re-engage.

**L-B — `SetOwner` is no longer bookkeeping.** Since chunk 1b, `Level():765`
reads the owner's level **live**, so binding a charmed mob via `SetOwner` would
re-level it — a charmed elite would shrink to the charmer's level. §6.1 defuses
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

**L-E — ✅ RESOLVED BY D9 — charm makes a mob untargetable by *every* player, not
just the charmer.** Faction is a global property of the entity, so charming a mob
makes it immune to everyone else's auras too, and it stops attacking them. This
was written up as the plan's most serious hazard against GDD §9 (*"no griefing
possible by design"*). **The PO has adopted it as the intended behaviour** — it
is what WoW does, and the mob stops harming everyone in both directions. ⚑ **The
griefing question itself is deferred, not answered** (D9): the lever that will
answer it is D8's per-skill faction scope — *who can charm what with what spell*.
Keep the landmine on file; it is now a design constraint rather than a defect.

**L-F — ⚑ the charm gap (D11).** An already-charmed mob is not a valid target, so
a charm **cannot be extended** — when the timer runs out the mob is hostile again
until a fresh cast lands. With D14's long duration (~60 s) and longer cooldown
(~120 s), that gap can be **a full minute of an elite pet turning on you** with
no way to pre-empt it. The `nearest` selector also means the re-cast may well
grab a *different* mob than the one that just reverted. Both are consequences the
PO accepted; neither is visible in code review.

**L-G — the charmer can leave.** Death, disconnect or zone change while a charm
is live leaves a dangling `charmer` pointer. ✅ **D10 rules: revert immediately**,
which keeps the window at zero. The `Owned` path has the same shape and handles it
by reading dead (`highestThreatTarget` prunes as it reads, `mob.go:1407`) — but
charm must do it *explicitly*, because `leader()` is read by the movement path
too, and a follower whose leader is nil stands still rather than reverting.

**L-H — ✅ SUPERSEDED BY D6 — a charmed mob does not follow you.** Originally:
`isFollower()` reads the *authored* role, a charmed creature stays `creature`, so
it would fight whatever is near it and stand where it stood. **D6 rules the
opposite** — it is a full companion — and §6.1b is how, without mutating role and
without touching `owner`. The landmine survives inverted: **if the `leader()`
substitution misses a site, the mob silently falls back to exactly this
behaviour** — standing still, fighting whatever wanders past — which looks like a
tuning problem rather than a missed call site. The four sites are listed in
§6.1b; a companion-behaviour regression test is the guard.

**L-K — ⚑ calm's break condition is the player's own aura (§5.4).** A calmed mob
standing in the calmer's damage aura breaks the calm on the next tick. Ruled as
intended, but it means **calm is untestable in the harness without either walking
away or switching to a non-damaging aura** — a naive harness run that casts calm
and then stands there will report calm as broken. Write the test to move.
✅ **Handled in chunk 2's harness, which walks away — but it did NOT bite**, for
a reason worth knowing: a fresh player's aura slots are all **Empty**, so there
was no self-damage to break anything. ⚑ **The first playtester with Damage
equipped will hit it immediately**, and it will read as "calm is broken".

**L-O — ⚑ NEW, found in execution: skill-level JSON is parsed WITHOUT
`DisallowUnknownFields`.** Only *effects* get the strict key check (`effectKeys`);
a mistyped skill-level key is silently dropped by `json.Unmarshal`. For an
allowlist that is the widest possible failure and an invisible one — a typo'd
`targetFaction` would leave the mask 0, which reads as *unrestricted*, and calm
would reach every faction in the game. ✅ **Resolved by making the allowlist
mandatory** for faction-scoped effect types (`factionScopedEffects`), which turns
the typo into a boot error. ⚑ **Chunk 3 must add charm to that table** — the
guard is per-effect-type, not automatic. The same gap is still open for every
*other* skill-level key; closing it generally is a separate hygiene item.

**L-L — ⚑ NEW: two spells is the acceptance test for D8, not a content detail.**
*Charm wildlife* and *charm elementals* exist specifically to prove the faction
scope is data, not code. If the second skill requires any Go change, the
mechanism was hardcoded — that is the failure the PO named in advance.

**L-M — ⚑ NEW: `leader()` must not leak into the stat path.** The whole point of
§6.1b is that three questions stay separate. A future reader who sees
`leader()` returning a player and reaches for it in `Level()`, `MaxHealth()` or
`PowerScale()` re-opens chunk 1b and shrinks charmed elites. Pin it with a test
(`Level()` unchanged across a charm), not a comment — the same instruction L-B
already carries, now with a second field to guard.

**L-N — ⚑ NEW, found in execution: `spawnSummon` has a MOB caster path, and it
is pinned by a shipped test.** §4.1's *"`e` is the casting player, whose faction
is always `FactionAligned`"* is false. `processCooldowns` (`sys/skills.go`) fires
**mob** cooldowns as soon as they are ready, and
`TestCooldown_MobCastSpawnHasNoOwner` asserts *"summon adopts the casting mob's
faction"* — so `m.Align()` on that path turns an orc's summons into the player's
squad, and the test catches it. **Unreachable in content today** (no mob among
the 64 defs equips any of the 6 spawn skills — checked, not assumed), which is
why the plan could get it wrong and still trace clean. ✅ **Resolved by a third
verb**, `EnlistUnder(model.Allegiance)`: the summon adopts its summoner's faction
**and** its aggro mask, handed over as one. ⚑ **That is a behaviour change on
that path** — the old code adopted the faction and *invented* `^casterBit`, i.e.
L2 in miniature: an orc squad would have hunted every neutral it walked past.
The durable lesson is the plan's own thesis applied one level down: a faction and
its reaction table are **a pair**, and every place that takes one without the
other is a defect.

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

## 8. Open questions

### ✅ Closed in the second session (2026-07-28)

| # | question | closed by |
|---|---|---|
| 1 | does a charmed mob follow the charmer? | **D6** — yes, full companion (§6.1b) |
| 2 | re-charming an already-charmed mob | **D11** — not a valid target, no refresh |
| 3 | does charm survive the charmer's death? | **D10** — no, revert immediately |
| 4 | ⚑ shared-world untargetability (L-E) | **D9** — adopted as intended; griefing deferred to per-skill authoring |
| 5 | visual tell (L-C) | **D13** — status-effect pip, interim until the frontend rework |
| 6 | `charmable` default, opt-in or opt-out | **D8** — the flag does not exist; scope is per-skill |

### ✅ Closed in chunk 2's execution session (2026-07-29)

| # | question | closed by |
|---|---|---|
| 1 | calm's numbers | **PO** — 300 ticks (9.9 s) / 600 cooldown / radius 4.0, **+60 ticks per skill level**, all [PLACEHOLDER] |
| 2 | does calm apply to a mob already attacking you? | **PO — yes**, it drops the live aggro link (`ApplyCalm` calls `resetAggro`) |
| — | calm's delivery (never asked in the design session) | **PO — everything in radius**, uncapped, no selector: a pack aggros as a pack |
| — | does chunk 2 ship a client tell? | **PO — yes**, the D13 pip, `AppliedEffectCalm` |

### ✅ Closed in chunk 3's execution session (2026-07-29)

| # | question | closed by |
|---|---|---|
| 2 | the charmed mob's XP credit vs the shared-XP rule | **traced** — `CreditTo()` routes the hit through `PlayerTouches(charmer)`, the identical path an owned summon uses, so participation and kill credit need no special handling (`TestCharmedMobAuraDamage_CreditsTheCharmerNotItself`) |
| — | charm's numbers (never asked in the design session) | **PO** — D14 as written: 1800 ticks (59.4 s) **+300/level**, cooldown 3600 (118.8 s), radius 4.0, maxLevel 3; the elemental variant tuned **differently** on purpose (1200 +200, cooldown 4200, radius 3.5), which widens L-L's proof from "a faction list is data" to "the numbers are too" |

### Still open

1. **Neither calm nor charm is reachable in normal play.** No milestone, drop or
   teaching authors any of the three skills, so only the `SKILL` cheat grants
   them. Deliberate — every chunk was scoped to the mechanism — but it means
   nothing this plan shipped can be playtested without console access until an
   unlock is authored. **This is now the plan's largest open item.**
2. **⚑ How long should a charmed mob actually survive?** Chunk 3 measured it: a
   pet charmed inside a wolf pack is focused by its three former packmates and
   dies in **~8 s**, against a 59.4 s duration. That is D9/L-E behaving exactly
   as ruled, so it is a tuning/design question rather than a defect — but the
   spell as authored promises a minute and delivers eight seconds in the one
   place a player is most likely to cast it. Levers, none taken: the duration and
   cooldown numbers, a charm-time heal or damage reduction, or scoping charm to
   solitary mobs by design.
3. **Does the pip (D13) show duration?** A plain pip does not. With a 60 s charm,
   *time remaining* is the single most useful thing to display, and its absence is
   the strongest argument for pulling the pet frame forward. ⚑ Chunk 2 shipped
   the pip and confirmed it renders, so the question is now concrete rather than
   hypothetical: a calmed wolf shows **a dot, and nothing else**.

---

## 9. Chunk ledger

*(one entry per chunk: what was decided inside it, what shipped, which commit,
what was verified.)*

### Chunk 1 — the allegiance seam ✅ DONE 2026-07-28, backend-only, committed `ec73634e`

**`SetFaction` is gone.** One general-looking setter with exactly one defined
destination became **three named verbs**, and the tombstone test guards the
*shape* returning under any name, not just the name.

| verb | destination | callers |
|---|---|---|
| `Align()` | the player side — mask `^Bit(Aligned)` | `spawnSummon` (player caster), campfire placement |
| `RevertFaction()` | the species' authored faction + mask, off `m.definition` | none yet — chunk 3 is its first consumer |
| `EnlistUnder(model.Allegiance)` | the summoner's side, faction **and** mask | `spawnSummon` (mob caster) |

⭐ **The third verb is the finding, and it is a correction to this plan.** §4.1
claimed the summon path's caster is always a player. It is not: `processCooldowns`
fires mob cooldowns, and `TestCooldown_MobCastSpawnHasNoOwner` is a **shipped
test** asserting *"summon adopts the casting mob's faction"* — a plain `Align()`
turns it red, and would have raised an orc warlord's squad **fighting for the
player**. Full write-up as **L-N**. It is unreachable in content (no mob among
the 64 defs equips any of the 6 spawn skills — checked), which is exactly why the
design session traced clean and missed it. ⚑ **`EnlistUnder` is therefore the one
behaviour change in an otherwise behaviour-neutral chunk**: the old code adopted
the caster's faction and *invented* `^casterBit`, so an orc squad would have
hunted every neutral faction it walked past. The new `model.Allegiance` capability
(`Faction()` + `AggroMask()`) exists to make the pair inseparable — splitting it
**is** L2.

**Also shipped, none of it behaviour-visible:**

- **`definitionAllegiance(d)`** — extracted from `NewMob` and shared with
  `RevertFaction`. ⚑ Not cosmetic: `NewMob` **rewrites** a zero-value (=aligned)
  definition faction to hostile, so a `RevertFaction` reading `d.Faction`/
  `d.AggroMask` raw would land a reverted test mob permanently player-aligned.
  Reverting must restore what the mob was *born with*, not what the definition
  *says*. Pinned by its own test.
- **`resetAggro()` on every edge (L-A)** — inert for both existing callers (both
  flip immediately after `NewMob`), load-bearing for chunk 3 on both directions.
- **`factions.go`'s built-in `aligned` entry** now carries `AggroMask:
  ^Bit(Aligned)` instead of an implicit `0`. Inert (L-J re-checked: nothing walks
  `registry.All()` acting on masks; `faction: "aligned"` is rejected on mob
  definitions), but the implicit `0` read as *retaliation-only* and was half of
  why `Align`'s mask looked wrong in the first place.
- **A reflection tombstone** — `TestMob_NoGeneralFactionSetterExists` fails on
  `SetFaction` **or** `SetAggroMask` reappearing on `*Mob`.
- 8 stale comments across `sys/skills.go`, `items/mobs/definitions.go`,
  `cmd/aurad/aurad.go` and `mob.go`; the `SetFaction`-named tests renamed.

**Considered and NOT taken:** a content pin forbidding mobs from equipping spawn
skills. Written, then deleted — once the behaviour is *defined*, constraining
authoring is the wrong tool (it would have blocked a legitimate content addition
to protect an engine gap that no longer exists).

**Verified:** `go build` / `go vet` / `go test -timeout 180s ./...` green;
guardrails + alloc pins `-count=2` green. **Sim battery BYTE-IDENTICAL** against a
pre-change worktree across all four legs (default · `-chain` · `-levels` ·
`-content ../api`) — **TTK 6.67 s / TTD 8.70 s stand**. Boot `-content ../api`:
**0 errors 0 warnings 0 panics — 83 skills / 15 factions / 64 mobs / 10 recipes /
1 milestone / 777 props / 485 spawns / 5 campfires placed.** No frontend surface,
no wire change, no content change.

⚑ **Byte-identical on every *reachable* path, not literally every path** — the
mob-caster summon leg changed, and it is invisible to every instrument the project
has, because no content reaches it. Say so rather than claiming a clean sweep.

**Next:** chunk 2 (calm) or chunk 3 (charm), each its own session (D5). Chunk 1
is D1's seam; only **chunk 3** proves it by use (§5.1 — calm never flips faction).

---

### Chunk 2 — calm ✅ DONE 2026-07-29, backend + frontend + content, committed `216f733b`

**A wolf can now be told to stop.** Calm ships as ruled: it never touches
faction, it drops the live aggro link, it takes **everything** in the radius, and
**any** damage ends it — the calmer's own aura included.

**Two plan corrections, both found by auditing §5 against HEAD before the first
edit** (the same habit that caught 3b's missing step and chunk 1's L-N):

⭐ **① Calm is a `Buffs` payload, not a `Mob` field (§5.3 item 1 was wrong).**
`AppliedEffects()` is *derived* from the buff store, and `buffPayload` is a
closed interface whose whole purpose is that a new kind cannot compile without
deciding its pip. A bare `calmTicks` would have had to bypass the one mechanism
that guarantees the client tell — and would have re-implemented aging and
per-skill refresh, which the store already owns. The payload is **empty**: calm
has no strength axis, so remaining ticks are the entire state. It cost exactly
one new thing, **`DropCalm()`** — the store's only *targeted* removal, where
expiry and Cleanse-everything were the two shapes that existed before.

⚑ **② Skills loaded BEFORE factions at boot** (`aurad.go:62-63`), so D8's
"resolved at content load" had nowhere to happen. Factions now load first; they
depend on nothing, so the swap is free. Three call sites (`aurad.go`,
`simharness/content.go` ×2) plus a test-helper pass — real-content tests need a
**real** faction registry, `nil` is only safe for fixtures authoring no
allowlist.

**⭐ The D8 seam, and the one place the PO's ruling met the code.** The PO chose
*authored on the skill* over *authored on the effect*. Shipped as: authored on
the skill, resolved to a mask at load, and **stamped onto that skill's effects**
— because the runtime gate belongs in `eligibleByTargetFlags`, the one predicate
every targeted effect already passes through, whose own comment warns that a
per-site copy *is* how the gate gets forgotten. Authoring vocabulary is what the
ruling fixes; where the resolved bits are carried is implementation.
`TestCooldown_CalmScopeIsDataNotCode` is **L-L's acceptance test**: a second
skill scoped to a different faction needs no Go change.

**⚑ L-O, the new landmine:** skill-level JSON has **no `DisallowUnknownFields`**
— only effects get the strict key check. A typo'd `targetFaction` would leave the
mask 0, which reads as *unrestricted*. Resolved by making the allowlist
**mandatory** for faction-scoped effect types, so the typo is a boot error.
**Chunk 3 must add charm to `factionScopedEffects`** — the guard is per-type.

**Also shipped:**

- **The break is checked AHEAD of the calm branch** in `updateAggro`, not inside
  it: the hit that breaks a calm has already written its threat row, so
  retaliation lands on the **same tick**. Pinned by a test.
- **Calm gates `updateSupportTarget` too.** "Out of combat" has to mean it stops
  healing its pack. No authored calm reaches a support mob today (the wildlife
  allowlist has none) — leaving it ungated would have made that a latent bug
  rather than a decision.
- **The aura gates off for free**: no target → `selectMode` falls to `modeIdle`.
- **The pip** — `AppliedEffectCalm` (bit 5) + one `PIP_STYLES` entry, pale blue
  and listed first. No schema change: `applied_effects` is already a wire ubyte.
- **Tooltip case + `CalmParams` on the catalog type.** The tooltip has a
  `default:` warn for unknown effect types, so a missing case is a console
  warning and a literal `(calm)` in the panel — not a build error.
- **Content:** `api/skills/calm.json`, id **62**, cooldown, maxLevel 3, cooldown
  600 ticks, radius 4.0, `calmTicks` 300 `+60`/level, `targetFactions:
  [wildlife_prey, wildlife_predator]`. All [PLACEHOLDER].

**Verified:** `go build` / `go vet` / `go test -count=1 -timeout 300s ./...`
green (**14 new Go tests** across the load layer, the buff store, the mob AI and
the apply site); frontend typecheck + **47 vitest** (3 new) + prod build.
**Sim battery BYTE-IDENTICAL** against a pre-change worktree across all four legs
(default · `-chain` · `-levels` · `-content ../api`) — **TTK 6.67 s / TTD 8.70 s
stand**. Boot `-content ../api`: **0 errors 0 warnings 0 panics — 15 factions /
84 skills (83 + Calm) / 64 mobs / 10 recipes / 1 milestone / 777 props / 485
spawns / 5 campfires.**

**In-game harness 7/7** — new `.claude/skills/verify/chunk2-calm.mjs`, clean run,
0 console errors, 0 WebGL losses. An engaged wolf at 0.59 units goes **0.59 →
2.88 and holds** while still inside its 5.4 aggro radius; after expiry the player
walks back in and it **closes again, 1.35 → 1.03**. The pip is confirmed by an
**in-picture control** — present under the mobs during the calm, absent on the
same species after expiry.

⚑ **Three harness iterations were needed and all three failures were the
HARNESS, not the product** — pinned in the script, because each one produced a
plausible "calm is broken" report: ① after the 20 s camera settle the wolf has
usually **already arrived**, so demanding a shrinking distance fails while calm
works perfectly; ② the observation window must fit inside calm's **9.9 s**, or it
is measuring expiry; ③ a calmed mob **walks home past its own 5.4 sensor**, so
"it never came back" was really "it could not see me". There is also no single
`mob` layer in the scene graph — there is one **per species** (`wildlife`,
`bossMobs`, `dodo`, …), and the script tags its target by **object identity** so
a second wolf wandering in cannot fake either result.

**Considered and NOT taken:** a per-caster exemption so your own aura spares your
own calm. Already rejected in the design session (§5.4) and re-confirmed here —
it is a per-caster *relation*, exactly what the global faction model avoids.

**Two things the PO should know:**

1. **Calm is unreachable in normal play** — no milestone, drop or teaching
   authors it, so only the `SKILL` cheat grants it (open question 1).
2. **L-K did not bite in the harness** because a fresh player's aura slots are
   all **Empty** — there was no self-damage to break the calm. The first
   playtester with Damage equipped will hit it immediately, and it will read as
   a bug rather than as the ruling.

**Next:** **chunk 3 (charm)** is the only chunk left, and its own session (D5).
It is the first consumer of chunk 1's seam (§5.1 — calm never flips faction, so
chunk 2 did **not** prove it). Read **L-B / L-M** before touching `Level()`, and
**L-O** before authoring the charm skills.

### Chunk 3 — charm ✅ DONE 2026-07-29, backend + frontend + content, committed `153c0032`

**A wolf can now be told whose side it is on.** Charm ships as ruled: the
nearest eligible mob in radius joins the player side as a full companion (D6) —
it follows, it defends, it assists — **keeps its own level** (D2), credits its
kills to its charmer, and reverts to the exact allegiance its species authors
when the timer runs out or the charmer leaves the world (D10). It is the seam's
first real consumer: `RevertFaction()` finally has a caller and `Align()`'s
charm direction is exercised for the first time.

**⭐ The shape that carried the chunk:** `owner` used to answer three questions
at once, and charm needed each of them answered differently. They are now three
separate reads — `owner` (*whose level do I stand at*), `CreditTo()` (*who gets
my credit*), `leader()` (*whose signals do I follow*) — and the stat path never
sees the last two. `Level()`, `MaxHealth()` and `PowerScale()` are byte-identical
across a charm, pinned by test rather than by comment (L-B/L-M).

**Four plan corrections, all found by auditing §6 against HEAD before the first
edit** — the same habit that caught chunk 2's two and 3b's missing step:

⭐ **① D11 needs NO code (§6.2 item 5 was a phantom piece).** A charmed mob is
player-**aligned**, so a second cast rejects it twice through gates that already
exist: same-faction + `targetsAllies:false`, and its faction is no longer in any
charm allowlist. Shipped as a pin (`TestCooldown_CharmPassesOverAnAlreadyCharmedMob`),
not a branch. The in-game run strengthened it by accident: with **two** prey
inside the 4.0 radius exactly one was charmed, which is also D3's
maxTargets-1-nearest proof.

⭐ **② `charmTicks` on `Mob` is wrong the same way `calmTicks` was (§6.2 item 1)**
— the pip is *derived* from the buff store, and `buffPayload` is closed so a new
kind cannot compile without deciding its pip. But charm differs from calm in the
one way that matters: **its expiry has to ACT** (revert the faction), and the
store has no expiry hook. So the split is `charmer` on the Mob (the link, typed,
read several times a tick) + `charmPayload` in the store (the timer and the
pip), with `Update` polling `charmer != nil && !Charmed()` — the shape
`ttlTicks` already had.

⚑ **③ D10's disconnect half has no per-tick signal.** A disconnected player's
entity is gone from the world but the mob's pointer stays valid and its
`HealthRatio()` stays above 0, so polling would leave a pet following a ghost for
the rest of a 60-second charm. Death **and** disconnect both end in
`game.RemoveEntity(player)`, whose fan-out reaches every system's `Remove` — so
the break rides **`MobSystem.Remove`**, one hook for both, on the branch that
already exists for "not one of my mobs".

⚑ **④ "Three attribution sites" is two.** `sys/skills.go:394` (`casterPowerScale`)
is the **stat** path — it reads `SummonPower`, not credit — and must keep reading
`Owner()`. That is L-M with a third field to guard. Only the dot replay and
`applyDamageAura` moved to `model.Credited`.

**Also shipped:**

- **`model.Credited { CreditTo() PlayerEntity }`** — the attribution seam, named
  as a capability so the two dispatch sites stop asking an ownership question
  they never meant.
- **`leader()` + the `isFollower()` widening** — the whole pet fantasy is
  re-pointed, not written: four call sites, one file. `m.role` is still never
  written after construction, so entity-model chunk 2's authored-role property
  survives a charmed creature being a follower.
- **`EffectTypeCharm` + `CharmParams`**, with charm added to
  **`factionScopedEffects`** (L-O — the guard is per-type, so a typo'd
  `targetFactions` is a boot error rather than a silently universal charm).
- **The pip** — `AppliedEffectCharm` (bit 6) + one `PIP_STYLES` entry, warm
  violet, listed first beside calm. No schema change.
- **Tooltip case + `CharmParams` on the catalog type**, because the tooltip's
  `default:` warn makes a missing case a console warning and a literal
  `(charm)`, not a build error.
- **A DRY pass on the buff store**: `Calmed`/`DropCalm` and `Charmed`/`DropCharm`
  now share one generic `hasPayload`/`dropPayload` pair instead of a copied loop.
- **Content: TWO skills (D8/L-L).** `api/skills/charm-beast.json` id **63**
  (`wildlife_prey` + `wildlife_predator`, radius 4.0, 1800 ticks +300/level,
  cooldown 3600) and `api/skills/charm-elemental.json` id **64** (`elemental`,
  radius 3.5, 1200 ticks +200/level, cooldown 4200). **The PO chose to tune the
  second differently** — elementals hold the other charmable elite (D12) — so it
  proves the seam carries authored numbers as well as an authored faction list.
  It needed **zero** Go changes, which is L-L's acceptance test. All values
  [PLACEHOLDER].

**Verified:** `go build` / `go vet` / `go test -count=1 -timeout 300s ./...`
green (**24 new Go tests** across the buff store, the mob, the removal fan-out
and the apply site); frontend typecheck + **50 vitest** (3 new) + prod build.
**Sim battery BYTE-IDENTICAL** against a pre-change worktree across all four legs
(default · `-chain` · `-levels` · `-content ../api`) — **TTK 6.67 s / TTD 8.70 s
stand**. Boot `-content ../api`: **0 errors 0 warnings 0 panics — 15 factions /
86 skills (84 + 2 charms) / 64 mobs / 10 recipes / 1 milestone / 777 props /
485 spawns / 5 campfires.**

**In-game harness 9/9** — new `.claude/skills/verify/chunk3-charm.mjs`, clean
run, 0 console errors, 0 WebGL losses. The pip lands on the charmed mob while a
same-species control 2.86 units away stays bare; the pet **follows** (player
moved 11.4 units, pet gap **1.98** against a 1.5 follow ring) while the control
drops out of view entirely; the charm **expires on its own** (pip true at
t+15.8 s, false at t+67.2 s — the first end-to-end proof of the poll); and in the
wolf pack the pet **lights its aura on a target that cannot be the player**,
since they now share a faction.

**⚑ THE FINDING — a charmed mob is focused by its former packmates, and can die
in about eight seconds.** A `THREAT` dump caught it exactly: the charmed Wolf
carried three ex-packmates as threat rows and all three carried it as their
target. This is D9/L-E working precisely as ruled — the mob left their side, so
they treat it as an enemy — but it means a **59.4 s duration / 118.8 s cooldown**
spell can deliver an **eight-second pet** when cast into a pack. Whether that is
the intended price of the enslave fantasy or a tuning problem is a PO call; the
numbers are all [PLACEHOLDER] and open question 4 records it. ⚑ **GOD mode makes
it worse and is why the harness met it head-on**: a god player takes no damage,
so `noteThreat` credits zero and the pack's threat tables stay empty — with
nobody holding threat, every wolf re-acquires the nearest enemy, and that is the
pet.

⚑ **Three harness lessons, each of which faked a product failure**, pinned in
the script:

1. **A dead or out-of-view mob's sprite is UNPARENTED, not `destroyed`** — and it
   keeps its last drawn frame forever. Reading only `destroyed` made a pet that
   had been killed five seconds in look like a live pet whose pip never went
   out, and cost a full investigation into a charm timer that was working
   correctly the whole time (confirmed by rebuilding with `charmTicks: 90`: the
   pip cleared in under two seconds).
2. **`visible` is stale-true on a Graphics whose mask has never changed.**
   `EffectPips.setMask` early-returns when the mask matches what it drew, so on a
   mob that never carried an effect the redraw never runs and the Graphics keeps
   its constructed `visible = true` with nothing in it. **Drawn instructions are
   the honest signal** — and the pip's own colour (`0xc98ae0`) is in them, so the
   metric can say *charm* rather than *some pip*.
3. **Where you cast decides what you can measure.** The wolf-dense spot the other
   scripts use kills the pet before any longer-horizon check can run. The script
   now uses the most isolated prey spawn in the zone — **computed from the zone
   JSON** (nearest hostile-to-`aligned` spawn 14 units away, nearest other prey
   5.5) rather than guessed — and only visits the pack for the fight leg.

**Follow-up shipped the same day — the tooltip now names the factions a skill
reaches.** PO feedback from hand-testing: *"the tooltip does not specify the
faction the spell targets — with Charm Beast and Bind Elemental that is implied,
but Calm does not specify it."* Two findings:

- **The mask was already on the wire and always had been** — `/skills` marshals
  the parsed `SkillDefinition` verbatim, so the client had `targetFactionMask:
  24576` since chunk 2. It is **undecodable there**: the faction registry is
  boot-only server state and the bits depend on registry load order, so a cached
  catalog could decode stale bits. **Resolved names travel; bits do not.**
  `SkillDefinition.TargetFactions []string` now carries the display names.
- **Faction identifiers are not player-facing.** `wildlife_prey` needed a
  `displayName`, authored on the faction JSON (PO pick over deriving it
  client-side — a snake_case rule would be a *second* naming convention beside
  `DeriveDisplayName`'s CamelCase one, exactly the drift that function's comment
  warns against). Absent → falls back to the identifier, which is also what the
  code-declared built-ins get. All 13 content factions authored.

⭐ **The line renders in the SKILL-level section beside Cooldown and Cast time —
never as a case in the per-effect switch**, which is where it would have become
per-spell hardcoding. The scope is a property of the skill (D8); the mask is
stamped onto effects only because the runtime gate reads it there. So **a new
faction-scoped skill needs no frontend change** — L-L's property one layer up,
pinned by a vitest case using an invented skill scoped to an invented faction.
PO pick on wording: **list every faction** (`Affects: Prey, Predators`) rather
than collapsing to a category. In-game: Calm and Charm Beast read *"Affects:
Prey, Predators"*, Bind Elemental *"Affects: Elementals"*.

**Two things the PO should know:**

1. **Charm is unreachable in normal play**, exactly like calm — no milestone,
   drop or teaching authors either skill, so only the `SKILL` cheat grants them.
   Every skill this plan shipped is now cheat-only (open question 1).
2. **The pet's short life in a pack** (the finding above) is the first thing a
   playtester will hit, and it will read as a bug rather than as D9.
