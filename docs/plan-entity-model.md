# Plan: One entity, many roles — the Actor model

**Status:** designed, not started. Design session 2026-07-26 (PO, via choice
prompts). Supersedes the "not scheduled" note on `backlog.md` §31 — that entry
stays as the *findings* record; this doc is the *plan*. Everything here is
plan-first: no production code was written in the session that produced it.
Audited line-by-line against the code 2026-07-26 (same day, four parallel
verification sweeps); the corrections are folded in below and marked
"code audit" where they overturned a claim.

**Scheduled:** all three chunks run **before** roadmap step 8 (accounts &
persistence). PO ruling, see §2 decision 7.

---

## 1. What this is actually about

§31 is written as *"three types should be one type"*. Traced against the code,
the real problem is the inverse:

> **`Mob` is already the universal entity — it is doing five different jobs, and
> it expresses which job by lying about its numbers. `Npc` exists only because
> `Mob` could not carry dialogue.**

Measured across the 50 authored mob defs and the 16 authored zone-NPC entries
(2026-07-26 — 14 in `world.json`, which is the boot count, plus 2 legacy `Sage`
entries in `proving-grounds.json`):

| what content authored | count | how the role is encoded today |
|---|---|---|
| creature (wolf / bandit / orc) | 40 mobile defs | the honest case |
| inert structure (campfire, totem, poison pool, spike barricade, turnip, bramble, rockfall) | **10** | `speed: 0` → `auraAlwaysOn` **inferred** at `model/mob/mob.go:148`; `aggroRadius: 0.1` is a pure **dummy** on all 10; `Campfire` adds `collisionLayer: 32` to be structurally unkillable; `Turnip` adds `resistances: {"*": 0, "harvest": 1}` to gate what may hit it |
| companion / summon | 4 | `isFollower()` = `owner != nil && velocity > 0` (`model/mob/companion.go:61`) |
| teacher / lore NPC | 14 (+2 legacy Sages) | a **separate statless Go type** — no HP, no level, no faction, no `SkillComponent` |

The through-line of all five §31 gaps is one sentence: **role is inferred from
incidental values instead of authored.** Speed 0 means "structure". Velocity > 0
means "follower". Slot 0 carrying a heal used to mean "healer" (round 3 killed
that one, `03b152f4`). And the one role with no number to hide behind —
"teacher" — had to become a whole new type that can do nothing else.

### What is already closer than §31 claims

Two findings from the session that materially shrink the work:

- **Gap 3 ("two level curves") is already one curve.** `items/mobs/definitions.go:294`
  does `powerScale := c.F(curveLevel)` and `model/player/player.go:253` does
  `curve.F(progression.Level)` — the *same* `curve.Curve` value, injected into
  both at boot. The difference is not two curves; it is that a mob's is frozen
  at registry load and a player's is read live, and that **`Mob` has no
  `Level()` accessor at all**.
- **The entity-agnostic pattern is already in the codebase and proven.**
  `casterCritChance` / `casterDamageFactor` (`sys/skills.go:619,637`) take
  `acting any` and structurally assert `SkillComponent()`; player, mob and
  summon flow through one path today. Three older stats simply never got moved
  onto it.

### What the WoW-Classic NPC target actually needs (PO brief, 2026-07-26)

PO framing: *"I want NPCs to be ABLE to feel like WoW NPCs, where they can act
and attack and can look similar to hostile mobs and friendly-non-talking NPCs,
but you can interact with them, they might attack certain factions on sight or
might just not interact with anyone, not being attacked and not attacking …
might also reveal hints through dialogues or even trigger things like a journey
quest-book type fill … Even if we don't have these features now, I want to make
sure we don't block them or need them to do anything hacky down the line."*

Mapped onto WoW Classic's four NPC pillars:

| pillar | status here | evidence |
|---|---|---|
| **faction reaction drives everything** (attacks X on sight, ignores Y) | ✅ **exists** | `api/factions/*.json` `hostileTo: [...]`, resolved to an aggro mask at load (`factions/factions.go:164`) |
| **unattackable-but-present** | ✅ **exists** | `friendlyToPlayers: true` — player damage skips them entirely, no threat link ever forms (`model/faction.go`, §9 lift 6) |
| **NPC and mob are the same creature** | ⚠️ **half** — content does it, the code does not | 10 structures + 4 companions + the village guards are all `Mob`; the 14 teachers are not |
| **interaction as a capability** (gossip / quest / vendor / trainer) | ❌ **missing** | exactly one hardcoded verb, on a type that can do nothing else |

**The proof for the first two is already shipped and running:**
`api/factions/human_army.json` is `hostileTo: ["orc"] + friendlyToPlayers: true`.
**`ArmySoldier` is already the WoW NPC the brief describes** — fights orcs on
sight, ignores players, cannot be attacked by players. It just cannot talk,
because the thing that can talk is a different Go type with no HP.

So the remaining work is narrower than it looked: **the reaction machinery is
done. What is missing is the interaction layer, and the fact that stats and
dialogue live in two different types.**

---

## 2. Decisions (PO, 2026-07-26, via choice prompts)

**1. Mob passives scale identically to player ones.** One formula for every
actor: `effective = base × (1 + derived)`. `factors.*` **is** the base and
passives **are** the multiplier — they stop being rival vocabularies, which
dissolves gap 2 as well as gap 1. Must be re-verified in the **sim harness**,
not only in-game (§31 ⭐ — a wrong harness number gets baked into authored
content and stays there).

**2. Levels are dynamic for every actor.** One `Level` field; `PowerScale() =
curve.F(Level)` read live. A companion can then take `Level = owner.Level`,
which collapses today's `SummonPower × owner.PowerScale()` composition and the
`RaiseMaxHealth` workaround into one assignment. Also unlocks a scaling boss
and the `curveLevel`-derived **`Autoattack`** skill parked in §31.

**3. NPCs merge into the Actor model, in this pass.** Dialogue moves onto the
actor; `model/npc` is deleted. Recommendation moved to "now" during the session
because (a) the merge is the *enabler* for every feature in the PO brief, and
(b) the content is at the smallest it will ever be — 14 NPCs, each one line
with one teaching. Migrating them later, after a gossip tree and a quest journal
exist, is the expensive version.

**4. Only live players persist.** Mobs and NPCs always respawn from definitions;
no sacrificed-character world presence, no persistent companions. Consequence:
step 8's schema is barely constrained by this work — it only needs the character
record written in **Actor vocabulary** (`level` / `faction` / `loadout` /
`spellbook` / `xp`) rather than as a dump of the player struct.

**5. Conversations start with an interact key in range.** Walk near, press a key,
a dialogue panel opens. No world targeting, so the GDD's *"no targeting, no
direct attacks"* pillar stands — it is a non-combat verb, like opening the
spellbook. Rejected: proximity-opens-the-panel (once NPCs stand among mobs,
walking past pops panels mid-combat, and the suppression rule for that is
exactly the hacky patch the brief wants avoided) and keep-one-shot-lines (hard-
blocks gossip trees, quest offer/accept and vendors).

**6. Define the full interaction container, author only the degenerate case.**
The schema gets nodes / conditions / options / a **typed grant list**; every
current NPC is authored as a single node with one `teach_skill` grant. Nothing
new is built. New grant kinds (`quest_offer`, `quest_advance`, `vendor`,
`flag_set`) and multi-node trees are then later *additive content*, not a schema
migration.

**7. All three chunks, then step 8.** One committed block before persistence work
starts.

### What these decisions unblock elsewhere

**Pass 1a.2 (resource costs)** was deliberately sequenced *after* this session
(`plan-playtest-feedback.md` §Intake round 6) because its cost-reduction passive
would be the **sixth `validStat`** while three of the current five were
player-only. **Decision 1 is the input it was waiting for** — after Chunk 1a
the three numeric player-only stats are gone, so a sixth is an ordinary
addition. (Code audit: `Derived.Resistances` stays player-only past 1a, by
deliberate deferral — see Chunk 1a. It is not a `validStat` and does not block
1a.2.) Re-schedule 1a.2 once Chunk 1 lands.

---

## 3. Target architecture

The naive read of "one entity, many roles" is a single `Entity` struct carrying
every field. **That is the thing to avoid** — it is the clever abstraction
CLAUDE.md forbids, and it grows `if isNpc` branches within a year.

### Core — `Actor`

Level · faction · health pool · `SkillComponent` · status effects · body. One
rule, `effective = base × (1 + derived)`, and one `PowerScale() = curve.F(Level)`.
Player, mob, companion, structure and teacher all **are** Actors.

### Capabilities — optional, asserted by systems

The `acting any` structural-assert pattern already proven in `sys/skills.go`.
Each is something an actor *has*, never something it *is*:

| capability | who has it | replaces |
|---|---|---|
| `Controlled` (input-driven) | player | `model.PlayerEntity` special-cases |
| `Brained` (AI) | creatures, companions | the `speed > 0` inference |
| `Conversant` (interaction block) | teachers, guards, later vendors | the whole `model/npc` package |
| `Owned` | summons | ✅ already exists |
| `Rewarding` (XP + drops) | creatures | `factors.experience` |
| `Perishable` (killable at all) | most | the `collisionLayer: 32` hack |

### Authoring — one `role` discriminator

`creature` · `structure` · `follower`, **authored, never inferred**. That single
field is what closes gaps 1, 2 and 5, because it stops `speed`, `velocity` and
`slot 0` from carrying meaning they were never meant to carry.

**`role` and capabilities are orthogonal.** An NPC is *not* a role — it is a
`creature` or `structure` that happens to carry an `interaction` block and a
friendly faction. That orthogonality is the whole point: a teaching guard that
fights bandits is `role: creature` + `interaction: {...}` + `faction: human_army`,
with no new type and no new branch.

### The elegant bit

**An NPC's proximity sensor and a mob's aggro sensor are the same mechanism.**
"Approach" *is* aggro, for something friendly. So merging is not "give NPCs
stats" (expensive) — it is "give Actors dialogue" (a handful of fields), because
`Mob` already has everything else. That direction also **removes** an `addXxx`
helper from the §24 registration matrix instead of adding one.

### The sequencing principle

> **Go types are free to change. Content JSON and the persisted schema are not.**

Every Go refactor below is a day's work at any point in the project's life.
Getting `role` and `interaction` into the authored JSON, and the character record
into Actor vocabulary, are the two things that get expensive once there is
player data behind them. Priority order is therefore **authoring vocabulary →
persistence vocabulary → Go structure**, and the chunks are ordered accordingly.

---

## 4. Chunk 1 — the stat spine

Two steps, deliberately split: **1a changes no numbers, 1b changes numbers.**
Do not merge them — 1b needs harness before/after evidence that 1a would
otherwise contaminate.

### Chunk 1a — one derived-stat formula (pure latent-bug removal)

**The fix is smaller than §31 implies.** `acting any` helpers in `sys` are the
wrong tool here: `MaxHealth()` and `takeDamage` live in the *model* layer, and
both `*player` and `*Mob` already hold a `*skills.SkillComponent` — they know
their own type. So the DRY fix is three factor methods on `DerivedStats`
(`skills/component.go`), called from both sides:

```go
func (d DerivedStats) MaxHealthFactor() float32       // 1 + MaxHealthBonus
func (d DerivedStats) DamageReductionFactor() float32 // 1 − clamp(DamageReductionBonus, 0, 1)
func (d DerivedStats) MovementSpeedFactor() float32   // 1 + MovementSpeedBonus
```

**Sites to migrate (the three that are player-only today):**

| stat | current site | after |
|---|---|---|
| `MaxHealthBonus` | `model/player/player.go:246` `maxHealthFactor()` | both `player.maxHealthFactor` and `Mob.MaxHealth` |
| `DamageReductionBonus` | `model/player/player.go:292` `takeDamage` | both `player.takeDamage` and the mob damage site |
| `MovementSpeedBonus` | `core/input.go:343` | both, and mob-side at the *consumption* site (`moveTowardsScaled`), not the stored `velocity` field — the bonus must stay dynamic |

**⚑ Code audit: there is a FOURTH player-only derived stat, deliberately
deferred.** `DerivedStats` has **six** fields, not five — this plan originally
missed `Derived.Resistances` (a map, `skills/component.go:142`), read only at
`player.go:289`; a mob mitigates via `definition.Factors.Resistances`
(`mob.go:1315`) and never reads its own `Derived.Resistances`. It is equally
latent (no content authors a resist passive), but converging it is not
mechanical: a mob already *has* authored resistances, so derived-vs-authored
composition (a third multiplier in the existing `ResistMultiplier` chain,
presumably) is a small design call. **Defer it out of 1a; decide it when the
first resist passive is authored.** Until then decision 1's "no player-only
stats" is one map short — noted where it matters (Pass 1a.2 above).

**Also in 1a — movement-speed vocabulary (gap 2 remainder).** `mob.go:222` is
`velocity: 0.055 * d.Factors.Speed` under a standing
`TODO use walkingSpeedPerTick from global config`. **⚑ Do not "just use" the
player's value** — see landmine L1. Add `game.mob.walkingSpeedPerTick: 0.055`,
mirroring the `game.mob.healthGainTick` precedent from §27.2.3 exactly (same
name, same unit, value preserved). Convergence is a rename, never a silent
balance change.

**Also in 1a — `Level()` on the Actor core (gap 3).** Add `Level() int` to
`*Mob` returning `definition.CurveLevel`, and derive `PowerScale()` from it
instead of reading the stored `definition.PowerScale`. Player already has it via
`progression.Level`. No behaviour change: `curve.F(CurveLevel)` is what the
registry precomputed anyway. ⚑ Code audit — one plumbing step the plan missed:
**no curve reference is retained anywhere in the mob layer** (`definitions.go`
stores only the resulting `float32`), so deriving `PowerScale()` live means
threading the `curve.Curve` value into `MobDefinition` or the constructor.
Trivial, but it is a new dependency, and mind the existing `PowerScale() <= 0 → 1`
guard when replacing the stored read.

**Expected behaviour delta: none.** Zero mob defs equip a `stat_multiplier`
passive today (re-verified by effect *type*, not name — `grep "stat_multiplier"`
over all 83 skills yields exactly 5, all player passives, none authored on any
mob). So the sim battery, level curve and pack matrix must come out
**byte-identical**. That identity *is* the acceptance criterion.

**TDD, red first:** a mob equipping Hardy has more max HP; a mob equipping Tough
takes less damage; a mob equipping Swift moves faster. ⚑ These must assert on
**behaviour**, never on `Derived` — see landmine L6.

### Chunk 1b — dynamic levels + collapse the summon scaling (numbers move)

**The model.** `Level` becomes a live field on `*Mob`, defaulting to the
authored `curveLevel`. `MaxHealth()` becomes derived rather than stored:

```
MaxHealth() = round(baseMaxHealth × varianceRoll × curve.F(Level) × Derived.MaxHealthFactor()) + flatBonus
```

with `baseMaxHealth`, the per-mob lifetime `varianceRoll` and `flatBonus` stored,
and `Level` mutable. Current health stays absolute and clamps to the new max.

**What this collapses.** Two bespoke mechanisms for "a summon rides its owner's
curve" — but (code audit) they live in different places and at different times
than this plan first said. `spawnSummon` (`sys/skills.go:1507`) only *stores*
the factor (`SetSummonPower(PowerAt(ownerLevel))`, a linear per-skill knob baked
at spawn) and applies the HP half as a **one-shot flat bonus frozen at spawn**
(`MaxHealthBonusAt(ownerLevel)` → `RaiseMaxHealth`). The multiply happens
**live at cast time** in `casterPowerScale` (`skills.go:382-392`), a
three-factor product: summon's own `PowerScale` × `SummonPower` ×
`owner.PowerScale()`. So today an existing summon's *output* already tracks the
owner's level-ups live, while its *HP* does not. Under dynamic levels a summon
sets `Level = owner.Level` and gets both for free. `SummonPower` survives as
what it was always meant to be: the linear specialization knob, not a curve.

**⚑ New decision this chunk must record: is `Level = owner.Level` assigned once
at spawn or tracked live?** The two reproduce *different halves* of today's
behaviour — assign-once matches today's HP and breaks output tracking; live
tracking matches output and changes HP (an existing summon's pool would grow on
owner level-up). Recommendation: **track live** — it is the simpler rule, the
direction decision 2 points, and the sim deltas will price it. Either way it is
a semantics choice, not just retuning; write it into the ledger.

**⚠ This is a real balance change.** Summon HP and output numbers *will* move.
Chunk 1b is not done until the sim battery, level curve and pack matrix are
re-run and the deltas are recorded and PO-signed. See landmine L3.

**Open inside this chunk:** does a `structure` ever change level? A campfire is
`curveLevel: 1` forever. Recommendation: yes, mechanically — it just never
happens to be raised. Do not special-case it.

---

## 5. Chunk 2 — the role discriminator

**Authoring.** New required-ish `role` key on the mob definition:
`creature` (default when absent) · `structure` · `follower`. Validated at load
against a single source table, the `tierRanks` precedent — a role is authorable
exactly when the loader knows it.

**Content migration:** `role: structure` onto the 10 speed-0 defs (Bramble,
Brazier, Campfire, FireTotem, PoisonPool, Rockfall, SpikeBarricade, Totem,
Turnip, WarbannerTotem); `role: follower` onto the 4 companions (Companion,
MedicCompanion, ShieldbearerCompanion, SoldierCompanion). Everything else
defaults to `creature`. (Code audit: `FireTotem` and `Totem` are summon-spawned
*and* speed-0 — they become `role: structure` **with** an owner, the first live
proof that `role` and the `Owned` capability are orthogonal, exactly as §3
requires.)

**What the discriminator replaces:**

- `auraAlwaysOn := d.Factors.Speed <= 0` (`mob.go:148`) → `role == structure`
- `isFollower()` = `owner != nil && velocity > 0` (`companion.go:61`) →
  `role == follower`. §31 calls this *"the last mob role inferred rather than
  read"*, and notes its branch order is load-bearing (a medic is both a follower
  and a pacifist — pacifist must win). Keep the order; just stop inferring the
  input.
- `body.aggroRadius` becomes **optional for `role: structure`**, which retires
  the `0.1` dummy on all 10 defs. It stays required (`> 0`) for `creature`.
  ⚑ Code audit: two **followers** also carry the `0.1` dummy today (`Companion`,
  `SoldierCompanion` — they bypass the sensor via owner combat signals;
  `MedicCompanion` was deliberately moved to a real `3.5` in round 3). Requiring
  `> 0` for `follower` would preserve the dummy on exactly the defs this chunk
  exists to clean — make it **optional for `follower` too**, or author real
  values while migrating.

**Expected behaviour delta: none.** Every mapping above reproduces today's
inference exactly. Sim outputs byte-identical again.

**Not closed by this chunk:** the slot-0 assumptions at `companion.go:148`
(`auraCanReach`) and `mob.go:164` (aura collider pre-size). §31 records a
deliberate PO decision (2026-07-25) to leave them and install
`TestContent_NoAuthoredMobIsAHybridYet` as a loud tripwire instead, because
"which slot decides reachability during acquisition?" is a genuine design
question no content has yet posed. **That decision stands** — the tripwire is
not a prohibition, and it fires the day a hybrid is authored.

---

## 6. Chunk 3 — NPC merge + the interaction schema

Split into 3a (backend + content, keeps today's trigger) and 3b (interact key +
dialogue panel). 3a is shippable and verifiable on its own.

### The interaction schema (decision 6 — full container, degenerate authoring)

```jsonc
"interaction": {
  "trigger": "interact",        // 3b; 3a authors "approach" to preserve behaviour
  "range": 1.0,
  "nodes": [
    {
      "conditions": [ … ],       // level >= N, knows/doesn't know skill X, later quest state
      "text": "…",
      "options": [
        { "text": "…", "grants": [ { "kind": "teach_skill", "skill": "FirstAid" } ], "next": null }
      ]
    }
  ]
}
```

Each of today's NPCs becomes **one node whose single option carries its full
grant list** — code audit: they are *not* uniformly one-teaching (Emberkeeper
teaches 3 skills, five NPCs teach 2, and `LamplessTraveller`/`ForestSign` teach
**0** — pure flavour, no `tooLowLine`). The typed grant list already allows
several `teach_skill` grants per option, and a flavour NPC is a grant-less node;
the existing `tooLowLine` becomes a second node gated on a level condition.
Nothing branches. The container is what buys the future:

- **gossip trees** → more nodes, `next` links. No schema change.
- **quest offer / accept / turn-in** → new grant kinds. No schema change.
- **vendor / trainer** → new grant kinds. No schema change.
- **the journal** → ⚑ **quest state lives on the PLAYER and is advanced by
  EVENTS, never stored on the NPC.** The codebase already has the right
  precedent: the spellbook is player-side and `EntityMessage.kind=Unlock`
  (`2bfee286`) is an event-attribution channel that names *what granted what*.
  A journal is the same ledger fed by the same event. The only thing that would
  block it is grants staying hardcoded as "teach a skill" — which the typed
  grant list fixes. **One fix, two features.**

### Chunk 3a — backend + content merge

- `interaction` (+ the authored display `name`) move onto the actor definition.
- `model/npc` is **deleted**. `sys/npc.go` (168 lines) becomes an interaction
  system operating on Actors; `onApproach`'s teaching-order logic survives
  nearly intact as the degenerate node evaluator.
- `addNpcEntity` leaves `core/game.go` (§24's matrix shrinks by one helper). The
  NPC's separate dynamic sensor disappears — the mob's `aggroAura` is that
  sensor. ⚑ Re-read the comment at `game.go:319` (above `addNpcEntity`; the
  blunt phrasing "a static shape's `Collisions()` is always empty" lives in
  `model/npc/npc.go:10`) before deleting: the *reason* the NPC sensor is
  registered dynamically applies to the aggro aura too, and it is already
  satisfied there.
- The zone NPC entries migrate from `zone.npcs` to actor definitions + spawns —
  **16 authored entries, not 14** (code audit): 14 in `world.json` (the boot
  count) plus 2 legacy `Sage` entries in `proving-grounds.json` that lack
  `entityType`/`name` and need an explicit keep-or-drop call (open question 6).
  **Decide during the chunk** whether they stay a distinct zone-JSON
  section (placement ergonomics for the editor) or fold into `spawns`; the
  editor is PO-operated, so the ergonomics call is the PO's.
- ⚠ **Wire path change** — see landmine L5.

### Chunk 3b — the interact verb

- New client keybind (recommend `E`), in-range prompt, dialogue panel.
- New client→server message. ⚑ `client.fbs`'s message union is **append-only**
  — add, never reorder. Code audit correction: unlike `server.fbs`'s
  `EntityType`/`StatusEffect` (which §28 Chunk 3 pinned explicitly), the union's
  values are **positional and unpinned** (generated `ClientMessageBody` numbers
  them 1–7 by order), so nothing but discipline enforces the rule — a reorder
  would silently remap every client message type.
- The panel is where option selection happens, which is what keeps the "no
  targeting" pillar intact: nothing is ever clicked in the world.

---

## 7. Deliberately NOT built

- **A second component system.** The repo already has ECS; a parallel one is the
  failure mode this whole plan exists to avoid.
- **Unifying `*player` into `*Mob`.** Players keep their own type. They satisfy
  the same interfaces; that is the entire requirement.
- **Making everything killable or levelled "for symmetry".** A campfire that does
  not implement `Perishable` is *better* than a campfire with a level it never
  uses. Capabilities are opt-in by implementation.
- **The gossip tree, quest state, the journal, vendors.** Decision 6: shape only.
- **Per-slot authored behaviour conditions.** Already ruled out 2026-07-25
  (§31), still right. The fixed support rule remains the default row.
- **A per-pair faction *reaction scale*** (WoW's hostile/unfriendly/neutral/
  friendly). Today's binary `hostileTo` set plus the dynamic threat table already
  yields hostile / neutral-but-retaliates / friendly, which covers every case in
  the PO brief. Revisit only if content asks for a rung that is genuinely missing.

---

## 8. Landmines

**L1 — mob speed is 0.055, player speed is 0.05.** Naively "converging" these
makes **every mob in the game 9 % slower**. Mirror the name and unit
(`game.mob.walkingSpeedPerTick`), preserve the value. (`mob.go:222`, `conf.json:13`)

**L2 — `SetFaction` nukes the authored aggro mask.** `mob.go:559` overwrites it
with `^f.Bit()` — *"aggro everything that is not me"*, discarding the faction's
curated reaction set. §31 recorded it as inert with `spawnSummon` the only
caller — code audit: **wrong, there are two call sites.** Campfire placement
also calls it at zone boot (`cmd/aurad/aurad.go:157`, `SetFaction(FactionAligned)`;
the "first caller" comment at `mob.go:554` is stale). Still inert in *effect*,
but any fix must cover both, and Chunk 2's sensor work touches
`refreshSensorMask` right next door. **Under the PO brief it is directly blocking:** a charmed NPC, a guard that
switches sides, or a quest that turns a friendly hostile would each silently
destroy the reaction table. Fix it *when* runtime faction changes are wanted —
not speculatively, but do not forget it exists.

**L3 — summon scaling double-counts under dynamic levels.** Chunk 1b's
`Level = owner.Level` gives a summon `f(ownerLevel)` for free; if
`SummonPower × owner.PowerScale()` and `MaxHealthBonusAt(ownerLevel)` are left in
place, it is applied twice. Both must come out in the same change, and the sim
battery must be re-run.

**L4 — the sim harness is exposed, and that is worse than the live bug.**
`sim/world.go:162` builds mobs with the real `mob.NewMob`, so any
stat-application change in the model layer is modelled by the balancing harness
too — and the harness is where TTK, kills/hour and the XP bands come from.
**Verify every chunk in the harness, not only in-game.** (§31 ⭐) ⚑ Code-audit
precision: the harness feeds `NewMob` **synthetic inline definitions**
(`world.go:149-162`, its own comment: "real mobs, from synthetic definitions") —
it never loads authored `api/` content. So sim byte-identity covers the model
layer but proves nothing about loader-side work (Chunk 2's `role` validation
lives in the registry path the sim bypasses); there, `boot -content ../api` with
the pinned counts is the actual gate.

**L5 — NPCs change wire path in Chunk 3a.** They ride the **Resource** path
today (`PropEntityFlatbufMarshal`, rendered by
`frontend/src/features/game-objects/logic/Resources.ts`); as Actors they ride
the **Mob** path, which carries `health` / `max_health` / `aura_*` / `tier`.
**Resolved by code audit 2026-07-26:** the nameplate IS gated for free
(`combatTarget = Experience > 0 && !FriendlyToPlayers`, `catalog.go:63`, sole
frontend consumer `Mobs.ts:142`) and so is the tier frame (rank 0 is
deliberately invisible, `TIER_FRAME_STYLES[0] = undefined`). But the **health
bar is not gated at all** — `initHealthBar()` runs unconditionally in the Mob
constructor (`Mobs.ts:113`) and pre-renders a full bar (buff-pip strip attached)
before the first snapshot. **Chunk 3a must add that gate**, or the PO accepts
bars on NPCs — campfires, totems and companions already show them today, so
there is precedent either way; it is a PO-visible design choice. Verify with a
screenshot regardless.

**L6 — `Derived` is populated on mobs already, so the obvious test passes.**
`recomputeDerived()` (`skills/component.go:313`) is a `SkillComponent` method and
runs regardless of owner type. A mob equipping Hardy therefore has
`Derived.MaxHealthBonus` **correctly set today** — a debugger, a log line or a
test asserting on `Derived` all show the right number while the behaviour is
absent. **Every Chunk 1a test must assert on behaviour** (HP pool, damage taken,
distance moved), never on `Derived`.

**L7 — `sys/skills.go:1523` is a near-miss, not a mob-side reader.** It calls
`p.MaxHealthBonusAt(ownerLevel)` on a mob and scans like gap 1's missing reader.
It is not — it is `SpawnParams`' summon-HP-from-owner-level, an unrelated
quantity that happens to share the name. Do not "fix" it in Chunk 1a; it is
Chunk 1b's business.

**L8 — the §24 registration matrix is "which systems, *and how*".**
`PhysicsSystem` alone is reached through 3 distinct mechanisms across the 6
helpers (dynamic `AddEntity` · static body · static body + dynamic sensor shape
— the NPC being the only two-call case).
Chunk 3a removes one helper, which is safe, but do not take it as licence to
invert the matrix — that is §24 option A and an explicit half-day-plus design
decision of its own.

---

## 9. Test strategy

| chunk | pins | acceptance |
|---|---|---|
| **1a** | TDD red-first: mob + Hardy has more HP · mob + Tough takes less damage · mob + Swift moves faster. All **behavioural** (L6). Existing guardrails `-count=2`. | `go test ./...` green; **sim battery + level curve + pack matrix byte-identical** to a stashed baseline (no mob authors a passive, so identity is provable) |
| **1b** | summon HP/output pins at 2–3 owner levels; max-HP recompute clamps current health | sim battery **re-run and deltas recorded**; PO signs the summon numbers |
| **2** | loader rejects an unknown `role`; the 3 mappings reproduce today's inference exactly; `aggroRadius` optional only for `structure` | boot `-content ../api` clean with the pinned counts; sim byte-identical again |
| **3a** | interaction-node evaluator reproduces `onApproach`'s teaching order + `tooLowLine` gate; content pin on all 16 migrated NPC entries (14 `world.json` + 2 legacy Sages, per the open-question-6 call) | boot counts (npcs → 0, mobs/spawns +14 world-side); headless smoke; **screenshot** for the L5 health-bar gate |
| **3b** | keybind + panel unit tests via the existing vitest infra (`jsdom` + the `fetch` stub) | in-game: approach a teacher, press the key, learn the skill, panel closes |

Backend gate every chunk: `go build ./...`, `go vet`, `go test -timeout 60s ./...`,
guardrails `-count=2`, boot `-content ../api` with 0 errors / 0 panics and the
content counts recorded.

---

## 10. Open questions (not blocking; resolve in the owning chunk)

1. **Does a `structure` ever change level?** (Chunk 1b) Recommendation: yes
   mechanically, never in practice. Do not special-case.
2. **Should non-players get a base crit chance?** (gap 2 remnant) `casterCritChance`
   explicitly special-cases `model.PlayerEntity` for the flat base. Under decision 1
   the *passive* half already converges; the flat base is a separate design call.
   Not needed for any chunk here.
3. **Do the 14 NPCs stay a distinct `zone.npcs` section or fold into `spawns`?**
   (Chunk 3a) Editor ergonomics — the PO's call, since the PO operates the editor.
4. **`Autoattack`** (parked in §31 as blocked on gap 3): decision 2 unblocks it.
   Re-raise as content after Chunk 1. Note the standing design rejection of a
   universal auto-attack for **players** — it would defuse the "choosing the
   Lantern costs you all your damage" trade-off the zone-1→2 tunnel is built on.
5. **The journal / quest ledger itself.** Deliberately out of scope; the typed
   grant list is the only thing this plan owes it.
6. **Do the 2 legacy proving-grounds Sages migrate or drop?** (Chunk 3a, code
   audit) They lack `entityType`/`name`, are dev/test content ("Too low",
   "Big Boy"), and sit outside the boot count of 14.
7. **Summon level: assigned at spawn or tracked live?** (Chunk 1b, code audit —
   see "New decision" there.) Recommendation on record: track live.

---

## 11. Chunk ledger

*(filled in as chunks land — one entry per chunk: what was decided inside it,
what shipped, which commit, what was verified.)*

- **Chunk 1a — one derived-stat formula:** not started
- **Chunk 1b — dynamic levels + summon collapse:** not started
- **Chunk 2 — role discriminator:** not started
- **Chunk 3a — NPC merge + interaction schema:** not started
- **Chunk 3b — interact verb + dialogue panel:** not started
