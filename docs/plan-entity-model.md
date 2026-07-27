# Plan: One entity, many roles — the Actor model

**Status:** in progress — **Chunks 1a + 1b done 2026-07-26, Chunk 2 done
2026-07-27** (see §11), **3a next**.
Design session 2026-07-26 (PO, via choice prompts). Supersedes the "not scheduled" note on `backlog.md` §31 — that entry
stays as the *findings* record; this doc is the *plan*. §5 (Chunk 2) was planned
and executed in one session 2026-07-27, plan-first within it; everything else
here predates any of its code.
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
happens to be raised. Do not special-case it. *(Resolved as recommended — §11.)*

---

## 5. Chunk 2 — the role discriminator

*Planned in full 2026-07-27 (design session, no code). Line numbers below are
post-1b HEAD `fe3b7f45`.*

**The one-sentence chunk:** a mob stops signalling what it *is* by lying about
what it *does* — `role` is authored, and the two places that read a number to
guess a kind read the key instead.

### 5.1 The authored vocabulary

New optional `role` key on the mob definition, three values:

| role | means | authored on |
|---|---|---|
| `creature` | the default actor: chases, gates its aura on aggro | 36 defs (absent → this) |
| `structure` | does not chase; its aura **is** its behaviour, always on | 10 defs |
| `follower` | owner-centric: acquires from the owner's combat signals, tethered, no leash | 4 defs |

Shape follows the `tierRanks` precedent exactly — **one source table is the
whole rule**: a `Role` string type in `items/mobs`, three constants, a
`roles map[string]Role`, and an exported `ParseRole(s) (Role, bool)`. A role is
authorable exactly when the table knows it. `ParseRole` is the *single* entry
point: the JSON loader, the sim's `MobSpec` and the simharness CLI flag all go
through it, so there is no second list to drift.

Absent → `creature`, and that default must exist **twice**: in the loader (for
authored content) and in `NewMob` (for the directly-constructed definitions in
tests and the sim). The faction zero-value guard at `mob.go:227` is the shape to
copy — a zero-value `MobDefinition` must keep meaning what it means today.

`body.aggroRadius` becomes **optional for `role: structure`**; it stays required
(`> 0`) for `creature` **and `follower`** — PO 2026-07-27, see decision D1.

### 5.2 What the discriminator replaces — exactly three reads

1. `auraAlwaysOn := d.Factors.Speed <= 0` (`mob.go:198`) → `role == structure`.
   The stored `auraAlwaysOn bool` field disappears; `support.go:191` compares
   the role directly.
2. `isFollower() = m.owner != nil && m.velocity > 0` (`companion.go:61`) →
   `role == follower && m.owner != nil`. ⚑ **The owner half stays** — see D4.
   Three call sites (`mob.go:1044` targeting dispatch, `patrol.go:72` idle
   movement, `patrol.go:99` evade-point suppression); §31 notes the branch order
   at `mob.go:1044` is load-bearing (pacifist is checked *before* follower so a
   medic companion does not chase its owner's attacker). **Keep the order** —
   this chunk changes the input to the predicate, never the ordering.
3. The 10 dummy `body.aggroRadius: 0.1` values, which exist only to pass the
   loader's `> 0` check, are deleted with the defs' migration to `structure`.

### 5.3 What it deliberately does NOT replace

Four other `speed <= 0` / `velocity <= 0` reads survive **untouched**, because
they are statements about *movement*, not about *kind* — a creature authored at
speed 0 genuinely cannot walk either:

- `mob.go:913` / `mob.go:939` — `moveTowardsScaled` / `moveAwayFrom` early-return.
- `definitions.go:325` — a speed-0 def cannot carry a type-level `wanderRadius`.
- `zone.go:444` — a speed-0 def cannot be given waypoints or a spawn wander.

Recording this line is half the value of the chunk: *"speed 0 means it cannot
move"* is correct and stays; *"speed 0 means it is a turret"* is the inference
being retired.

### 5.4 Content migration — 14 files

**`role: structure` + delete `aggroRadius: 0.1`** (10): `bramble`, `brazier`,
`campfire`, `fire-totem`, `poison-pool`, `rockfall`, `spike-barricade`, `totem`,
`turnip`, `warbanner-totem`.

**`role: follower`** (4): `companion`, `soldier-companion`, `medic-companion`,
`shieldbearer-companion`. `MedicCompanion` (3.5) and `ShieldbearerCompanion`
(5.5) already carry real aggro radii and keep them; `Companion` and
`SoldierCompanion` carry the `0.1` dummy and must now author a real value —
**[PLACEHOLDER] 3.5 for both**, mirroring `MedicCompanion`. ⚑ The value is
**inert today** (a non-support follower's sensor is read by nothing: the follower
branch skips `updateEnemyTargeting`, and `updateSupportTarget` returns early
without a support slot), so it is a forward-looking number, not a balance change
— but it does add real broadphase pairs where a 0.1 point-sensor added none.
Note it in the ledger; the PO may set a different number at execution time.

**Everything else (36 defs) is untouched** and defaults to `creature`.

`FireTotem` and `Totem` are summon-spawned *and* speed-0 → `role: structure`
**with** an owner: the first live proof that role and the `Owned` capability are
orthogonal, exactly as §3 requires.

### 5.5 The sim harness carries the role too (⚑ the finding that resizes this chunk)

**`speed: 0` is not merely a value in the sim — it is a mechanism.**
`sim/chain.go:154` pins the mob at speed 0 for the kite stance with the comment
*"speed 0 keeps its aura always on, so it still fights back"*;
`sim/scenario.go:169` documents the field as *"0 = stationary, aura always on"*;
`main.go:127`'s flag says *"0 = stationary"*; the explorer's knob is literally
labelled **`speed (0=turret)`** (`index.html:164`). The moment `auraAlwaysOn`
reads `role`, every one of those mobs stops fighting back — and the kite stance
is half of the **chain battery, which is where the level curve comes from**.

**PO ruling 2026-07-27: the sim gets an explicit role, no shorthand** — *"aren't
we moving away from speed defining what something is? that was the whole point"*.
Correct, and load-bearingly so: L4 already says the harness is where TTK,
kills/hour and the XP bands come from, so an inference *there* is worse than one
in the model layer, not better. The work:

- `sim.MobSpec` gains `Role string \`json:"role"\`` (JSON-facing, so the
  explorer request and `/mobs` presets carry it with no decoder change).
- `sim/world.go:149-162` passes it into the synthetic `mobs.MobDefinition`.
- `sim/chain.go:154` sets `Role: structure` alongside its `Speed = 0` — the pin
  becomes an authored statement of intent instead of a side effect. (The speed
  pin **stays**: "does not move" is still true and still the point.)
- `simharness/content.go:313` (`mobSpecOf`) copies `def.Role`. ⚑ **Required, not
  optional:** `FireTotem` is an armed structure that is *not* in
  `guardrailExempt` (unlike Brazier/PoisonPool/SpikeBarricade/Totem), so it runs
  `facetankSurvival` in the guardrail battery every time. Without the role its
  aura gates on aggro and its survival number moves.
- `simharness/main.go` gains `-mob-role` (default `creature`), and the
  `-mob-speed` help text drops "0 = stationary" as a *behaviour* claim.
- `simharness/index.html` gains a `role` select (creature / structure — the sim
  has no owner, so `follower` is meaningless there) and the speed knob is
  relabelled plain `speed`. ⚑ **~15–20 lines of real plumbing, not a one-liner:**
  the `KNOBS` table is uniformly `type="number"`, `buildRequest()` runs every
  value through `parseFloat` (a string yields `NaN` → `return null` → the run is
  silently skipped), and the preset-apply loop does `Math.round(v*1000)/1000`.
  Both paths need a string-knob branch.
- Validation: `ParseRole` at the two entry points that can report an error (the
  CLI flag, the decoded HTTP request). `world.go` **panics** on an unparseable
  role rather than falling back to `creature` — a silent fallback in the
  balancing harness is precisely the failure class this chunk exists to remove,
  and the harness is a dev tool where loud is correct.

### 5.6 Decisions

- **D1 — `aggroRadius` optional for `structure` only** (PO 2026-07-27). The 10
  structure dummies go; the two follower dummies become real authored values
  (§5.4). Rejected: making it optional for followers too (would have left the
  schema unable to say a moving actor has a sensor).
- **D2 — the sim authors its role explicitly** (PO 2026-07-27), §5.5. Rejected:
  a one-line `speed == 0 → structure` fallback in `sim/world.go`.
- **D3 — no loader guard on `speed: 0` without `role: structure`** (PO
  2026-07-27): *"a turret is something I would want to build, so no error
  necessary — wrong configurations should show up in the game only, if they are
  still legal."* A speed-0 `creature` is a **legal, wanted** config: a stationary
  hazard that gates its aura on aggro. No hard-fail, and no boot warning either.
  The content pin (§5.8) is a regression pin on the 50 authored defs, not a rule.
- **D4 — `isFollower` keeps its owner check**: `role == follower && owner != nil`.
  Role is the authored *intent*; ownership is the runtime *precondition* the
  follower code paths actually require (`updateFollow` needs an owner to follow,
  `updateCompanionTargeting` needs owner combat signals). Today's four follower
  defs are only ever summon-spawned, but nothing stops the PO placing one from
  the zone editor, and an ownerless "follower" must degrade to ordinary creature
  behaviour rather than to a no-op mob. This also preserves today's semantics
  exactly, which is what makes the chunk's identity claim provable.
- **D5 — rename the *other* `role`.** `support.go:65`'s `roleSlots()` and the
  "role-as-loadout" vocabulary from round 3 mean the **combat** role
  (support vs. fighter) — a different axis that happens to share the word, and
  after this chunk the collision is live in one file. Rename `roleSlots` →
  `loadoutSlots` (internal, no content or wire surface) so `role` means the
  authored discriminator and nothing else. Pure rename, own step, zero behaviour.
- **D6 — no exported `Role()` accessor on `*Mob` yet.** Store the field, read it
  internally. Chunk 3a is the first plausible consumer; adding the accessor
  before there is a caller is the YAGNI this plan keeps flagging.

### 5.7 Implementation order

Six steps, each compiling and green on its own:

1. **Registry vocabulary** — `Role` type + table + `ParseRole` +
   `MobDefinition.Role` + the JSON field + the conditional `aggroRadius` rule
   (`items/mobs/definitions.go`). Nothing reads it yet.
2. **Model consumption** — `m.role`, `auraAlwaysOn` deleted, `isFollower`
   rewritten, the `NewMob` zero-value default (`model/mob/{mob,companion,support}.go`).
3. **D5 rename** — `roleSlots` → `loadoutSlots`.
4. **Sim plumbing** — §5.5, all six sites. Run the batteries here, before any
   content moves, so an identity break is unambiguously the code's fault.
5. **Content migration** — the 14 JSONs + `docs/manual-content-authoring.md`
   (the mob section at line ~55 lists the authored keys; `role` goes next to
   `tier`/`curveLevel`, and the "Solid-obstacle mobs" paragraph currently says
   *"pair with `speed: 0`"* — it must now say `role: structure`).
6. **Verification tail** — §5.8.

Rough size: ~10 Go files + 8 test files + 14 JSONs + 1 HTML + 1 doc.

### 5.8 Test plan & acceptance

**Red-first pins (all behavioural — L6):**

- Loader: an unknown `role` is rejected; absent `role` yields `creature`; a
  `structure` may omit `aggroRadius`; a `creature` and a `follower` may not.
- Model: a def with **speed > 0 and `role: structure`** has an always-on aura
  (proves the read is the role, not the speed); a def with **speed 0 and
  `role: creature`** gates its aura on aggro (the same, inverted); an owned
  speed-0 `structure` is **not** a follower; an owned `role: follower` follows
  and keeps the pacifist-before-follower branch order.
- Content pin: every one of the 50 authored defs asserts its expected role
  (10/4/36), so a future def cannot silently drift.
- The existing 13 test sites that construct `Speed: 0` defs (`model/mob`,
  `sys/skills_behavior_test.go:2323,2747`, the `sim` package tests) are the
  chunk's own migration surface — each one must be read and either given a role
  or confirmed as a movement-only fact.

**Acceptance:**

- `go build ./...`, `go vet`, `go test -timeout 60s ./...`, guardrails `-count=2`.
- **Sim battery, level curve and pack matrix byte-identical** to a HEAD build
  (`git worktree`, as in 1b — not a remembered number). This covers the §5.5
  plumbing; the kite rows are the specific thing being proved.
- ⚑ **The 50-mob preset roster is NOT byte-identical, by design:** **12 rows**
  change in the `aggroRadius` column and nothing else — the 10 structures to 0,
  plus `Companion` and `SoldierCompanion` from the `0.1` dummy to their new
  authored 3.5 (D1 kept the key required for followers). Any other moved column
  is a bug. *(Verified: exactly those 12 cells moved.)*
- Boot `-content ../api`: 0 errors / 0 panics / 0 warnings with the pinned counts
  (83 skills / 14 factions / 50 mobs / 10 recipes / 5 prop defs / 1 milestone /
  777 props / 471 spawns / 5 campfires / 14 npcs). ⚑ **This is the real gate for
  this chunk** — L4: the sim never loads authored content, so `role` validation
  lives in a path sim identity cannot see.
- In-game smoke: a campfire still burns and heals unprovoked; a brazier/poison
  pool still damages on contact; a summoned companion still follows and fights;
  a bramble still blocks and takes only its gated damage.

**⚑ The one non-identity to state out loud.** Deleting `aggroRadius: 0.1` gives
the 10 structures a **radius-0 (point) sensor**. Traced consequence: `Campfire`
and `WarbannerTotem` carry support auras, so `refreshSensorMask` widens their
sensor to `LayerCombatants` and `updateSupportTarget`/`withinSensor`
(`support.go:109`) currently reach `0.1 + targetRadius`; after the chunk they
reach `targetRadius`. **Inert** — both are velocity-0 (`moveTowards` refuses to
move them) and `auraAlwaysOn` (so `applyMode` early-returns before any aura
gating), which is the same pair of reasons round 5 pinned campfires/totems as
inert pacifists. It is still a state difference a debugger can see, so **pin it
rather than assume it**: a campfire with a wounded player standing on it heals
identically before and after.

### 5.9 Not closed by this chunk

The slot-0 assumptions at `companion.go:148` (`auraCanReach`) and `mob.go:214`
(aura collider pre-size). §31 records a deliberate PO decision (2026-07-25) to
leave them and install `TestContent_NoAuthoredMobIsAHybridYet` as a loud tripwire
instead, because "which slot decides reachability during acquisition?" is a
genuine design question no content has yet posed. **That decision stands** — the
tripwire is not a prohibition, and it fires the day a hybrid is authored.

Also still open next door: **L2** (`SetFaction` overwrites the authored aggro
mask, two callers). This chunk's step 2 touches `refreshSensorMask`'s
neighbourhood but does **not** fix it — it stays inert-in-effect and blocked-in-
principle until runtime faction changes are actually wanted.

---

## 6. Chunk 3 — NPC merge + the interaction schema

Split into 3a (backend + content, keeps today's trigger) and 3b (interact key +
dialogue panel). 3a is shippable and verifiable on its own.

### The interaction schema (decision 6 — full container, degenerate authoring)

*Finalized 2026-07-27 against the code. The shape below is what the loader
parses; §6.2 lists the validation rules.*

```jsonc
"interaction": {
  "trigger": "approach",         // 3a; "interact" hard-fails until 3b implements it
  "range": 1.0,                  // OPTIONAL — absent = body.aggroRadius (see D7)
  "nodes": [
    {
      "id": "root",
      "conditions": [],          // [{ "kind": "minLevel", "value": 5 }] — later: quest state
      "lines": ["…"],            // today's `lines`: spoken when nothing was granted
      "options": [
        {
          "text": "",            // 3b button label; 3a auto-selects the sole option
          "blockedLine": "…",    // today's `tooLowLine`
          "grants": [
            { "kind": "teach_skill", "skill": "FirstAid", "requiredLevel": 2, "line": "…" },
            { "kind": "teach_skill", "skill": "Heal",     "requiredLevel": 3, "line": "…" }
          ],
          "next": null
        }
      ]
    }
  ]
}
```

⚑ **The grant keeps `requiredLevel` rather than growing a `conditions` list.**
That is deliberate and not a shortcut: it is today's `world.Teaching` field
verbatim, and the ordered-stop walk is a property of the grant *list*, not of a
condition engine. Adding an optional `conditions` key to a grant later is
**additive JSON** — what decision 6 is actually buying is the *nesting*
(nodes → options → grants), which is the part that cannot be added later without
rewriting every authored file.

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

---

## 6a. Chunk 3a — the NPC merge

*Planned in full 2026-07-27 (design session, no code). Line numbers are
post-chunk-2 HEAD `052244d5`.*

**The one-sentence chunk:** the teaching NPC stops being a second entity type
and becomes an ordinary actor carrying an authored `interaction` block —
and "approach" turns out to be the thing the mob layer already had, an aggro
sensor with the friendly end of the faction table.

### 6a.1 What the chunk actually costs

The merge itself is small. What makes 3a the biggest chunk in the plan is that
**the NPC's wire path, its placement path and its authoring UI all move at
once**, and none of the three can move separately: the moment the server stops
marshalling an NPC through the Resource table, a client that still expects one
mis-renders it. The ordered sequence in §6a.7 is therefore not a preference —
it is the only order in which the tree stays green.

Deleted outright: `model/npc` (122 lines + 101 test), `model.NpcEntity`,
`model.Teaching`, `npc.SpriteFor`, `game.addNpcEntity` + its `AddEntity` case,
`world.Npc` + `world.Teaching` + the whole `npcs` zone section and its five
validations, `aurad.go`'s NPC boot loop and its `placed npcs` log line, and the
zone editor's entire NPC mode. `sys/npc.go` is not deleted but rewritten as
`sys/interaction.go`.

### 6a.2 Loader validation — what a bad `interaction` block must not survive

Every rule hard-fails at boot, the house standard for curated content. The
single-source-table shape (`tierRanks` → `ParseRole` → here) repeats twice:

- **`trigger`** resolves through a `ParseTrigger` table. 3a knows `approach`
  only; authoring `interact` **hard-fails until 3b implements it** — the engine
  never silently accepts a key it cannot honour (D6).
- **`grants[].kind`** resolves through a `grantKinds` table. 3a knows
  `teach_skill` only.
- **`conditions[].kind`** likewise; 3a knows `minLevel` only.
- `nodes` non-empty; `id` non-empty and unique within the block; `next` either
  absent/null or naming a node in the same block (dangling link = boot failure).
- `grants[].skill` resolves against the skill registry **at load** — today's
  `zone.go:479` behaviour moves here verbatim, `noteLegacy` and all.
- A node must carry `lines` **or** at least one option with at least one grant
  (today's *"must have teachings or lore lines"*, `zone.go:376`).
- An option carrying a grant with `requiredLevel > 0` needs a `blockedLine`
  (today's *"teaching NPC must have a tooLowLine"*, `zone.go:379`).
- `range >= 0`, and an actor with an `interaction` block must end up with a
  **positive effective sense radius** — `max(body.aggroRadius, interaction.range)`
  (D7). A conversant with a 0 sensor is an NPC nobody can ever talk to, and it
  would look exactly like a content typo.

### 6a.3 The system — `InteractionSystem` over a `Conversant` capability

`sys/npc.go` → `sys/interaction.go`. The 373-line `npc_test.go` is the spec:
`onApproach`'s semantics are preserved exactly, only its inputs change shape.

| today | after |
|---|---|
| `NpcSystem.npcs []model.NpcEntity` | `InteractionSystem.actors []Conversant` |
| `n.Teachings()/TooLowLine()/Lines()` | one node → one option → its grant list |
| `n.Sensor()` (the NPC's own dynamic circle) | `m.Sensor()` → the mob's `aggroAura` |
| `npcName()` — authored name, else the spaced sprite enum | the definition's display name (`DeriveDisplayName(def.Name)`) |
| `Remove` is a no-op ("NPCs are placed once and never removed") | **implemented** — see below |

`Conversant` is the capability from §3, asserted structurally:

```go
type Conversant interface {
    model.MobEntity
    Interaction() *mobs.Interaction
    Sensor() phy.DynamicCollider
}
```

`addMobEntity` offers every mob to the system; the system stores only those
that assert. Priority stays 20 (same-tick sensor read, alongside `MobSystem` —
the existing comment's reasoning is unchanged).

⚑ **`Remove` must actually be implemented.** Today's no-op encodes *"an NPC
never dies"*, which stops being true the moment interaction rides the mob path:
a conversant companion or a killable quest-giver would leak its `seen` entry
and, worse, keep a dead actor in the slice. It is four lines; write them now.

⚑ **The rising-edge `seen` map is the reason 3a is behaviour-preserving.** Keep
it as-is, including *"a player who leaves and returns re-triggers"*.

**⚑ The sensor widening is the one line that makes the whole chunk work —
see landmine L11.** `refreshSensorMask` (`mob.go:651`) derives the sensor mask
from the *aggro* mask, and a friendly NPC's faction aggros nothing, so
`aggroSensorMask(0)` returns `LayerNoneCollision` — **a blind sensor**. A
conversant must widen to include `LayerPlayerCollision`, mirroring the
support-carrier widening two lines above it in the same function.

**The registration deletion is safe and already reasoned.** `game.go:319`'s
comment (*"a static shape's `Collisions()` is always empty, so a static sensor
would sense nothing"*) is exactly why `addNpcEntity` exists — and
`PhysicsSystem.AddEntity` (`physics.go:58`) registers **every** shape from
`Bodies()` as dynamic, and `mob.go:530` returns `[body, aura, aggroAura]`. The
requirement the comment states is already satisfied on the mob path; that is
the "elegant bit" of §3, verified.

### 6a.4 Content — 14 definitions, one faction, zero behaviour change

**The 14** (ids 51–64; `_comment` block on each, house convention):

| def name | entityType | teaches | note |
|---|---|---|---|
| `Farmer` | Farmer | Harvest@1 | |
| `Hermit` | Hermit | FirstAid@2, Heal@3 | |
| `Lamplighter` | Hermit | Torch@0 | today an anonymous second `Hermit`; **named by the PO 2026-07-27** |
| `Dog` | DogNpc | SummonCompanion@0 | authored `name: "Dog"` today |
| `Miner` | Miner | Pickaxe@4 | |
| `CityGuard` | CityGuard | Strong@3 | 2 lore lines |
| `VillageHealer` | VillageHealer | FirstAid@2, Revive@8 | |
| `FrontCaptain` | FrontCaptain | Vanguard@15 | 2 lore lines |
| `Shaman` | Hermit | Recover@4, SummonTotem@5 | |
| `Wanderer` | Wanderer | Recall@3 | zone `type` is `Wanderer_1`; drop the suffix |
| `LamplessTraveller` | Traveller | — | pure flavour, no `blockedLine` |
| `TownCrier` | TownCrier | Damage@1, Recall@3 | |
| `ForestSign` | Signpost | — | pure flavour, no `blockedLine` |
| `Emberkeeper` | Hermit | Torch@1, Ignite@7, Immolate@12 | the 3-grant case |

Four defs share the `Hermit` sprite via the `entityType` override — the
`proving-*` precedent, and nothing in the loader requires entityType uniqueness.

**The def name is now player-visible.** `DeriveDisplayName(def.Name)` feeds the
`"Taught by: X"` unlock attribution, which deletes the authored-name-vs-sprite-
name fallback (`npc.go:157`) — a real simplification, but it means
`LamplessTraveller` renders "Lampless Traveller" and the second Hermit needs a
name of its own instead of inheriting the sprite's.

**Body — reproduce today's NPC exactly, in authored numbers:**

```jsonc
"body": { "radius": 0.35, "collisionLayer": 97, "collisionMask": 16, "aggroRadius": 1.0 }
```

`0.35` is `npc.placeholderVisualRadius` verbatim. `97` = PlayerStatic(1) +
Viewport(32) + MobStatic(64) — **precisely today's NPC body bits**, and
pointedly *not* Action(2), so no aura on either side can target it (see L12).
`aggroRadius: 1.0` is today's authored zone `radius`, so `interaction.range` is
omitted on all 14 (D7).

**Factors:** `speed: 0`, `experience: 0`, `skills: []` (the Turnip/Rockfall
precedent — skill-less mobs already ship), `baseMaxHealth: 200 [PLACEHOLDER]`.
The pool is authored rather than left to the 100 default because the PO's
ruling makes it visible: NPCs keep their health bar (D3).

**Role: `creature`** (D4). Not `structure`, even though these 14 neither move
nor fight: the PO's ruling is that an NPC must be able to act like any mob if
content later wants it to, and `creature` is the role that chases and gates its
aura on aggro. An NPC is then an ordinary actor that happens to author
`speed: 0` — the exact inverse of the inference chunk 2 retired.

**New faction `api/factions/townsfolk.json`:** `hostileTo: []` (explicitly
passive — the loader *requires* the key), `friendlyToPlayers: true`. Note the
existing guard: `friendlyToPlayers` plus `hostileTo: ["aligned"]` is rejected,
which `[]` satisfies.

**Unattackability is now two authored knobs, not a type property** (D5):
the body off the Action layer means nothing can target it *at all* (players and
hostile mobs alike — today's guarantee), and `friendlyToPlayers` makes player
damage skip it regardless (`skills.go:410`). Belt and braces, both authored ⇒
making one specific NPC killable later is a JSON edit, not a code change. That
is the property the PO's D4 ruling asks for.

**The 2 legacy proving-grounds Sages are DROPPED** (D2). `proving-grounds.json`
loses its `npcs` section entirely. Consequence: `NpcPlaceholder` has no authored
user left. Keep the enum value (pinned, §28 Chunk 3), keep the sprite class and
asset — as a mob `entityType` it stays a legitimate authoring choice for an NPC
whose art is not drawn yet, which is what it was built to be.

### 6a.5 Placement — fold into `spawns` (D1)

`zone.npcs` is deleted; each NPC becomes an ordinary spawn row:

```jsonc
{ "mob": "Farmer", "x": -57, "y": 28.6, "angle": 0 }
```

Respawn fields are omitted — inert on something that cannot die. The gain
beyond DRY is that `angle` (facing) and the waypoint/wander machinery come free,
so a patrolling merchant is later a content edit rather than a schema change.

**The zone editor loses its NPC mode outright** (~127 `npc` references across
`_ZoneEditorPanel.ts`, `ZoneEditor.ts`, `ZoneModel.ts`, plus the
`zoneEditor_npcControls` block in `groundTexturePanel.html`). This is a real
workflow change and the reason D1 was the PO's call: **teachings stop being
editable in the editor** and become JSON content, exactly like every mob's skill
loadout, drops and resistances already are. NPCs are then placed with the
existing spawn tool and its mob dropdown, which needs no new code — see L13.

### 6a.6 The wire path (L5) — 11 sprite classes change base class

NPCs ride the **Resource** table today and the **Mob** table after. Server-side
this is automatic (the `model.MobEntity` case in `EntitiesMarshalFlatbuf`
precedes `model.PropEntity`); client-side, `gameObjectClasses` maps
`EntityType → class` and 11 entries must point at `Mobs.*` instead of
`Resources.*`: **Signpost, Hermit, Farmer, Wanderer, Traveller, TownCrier,
DogNpc, Miner, CityGuard, VillageHealer, FrontCaptain**. `GateWall` stays a
Resource — it is a prop wall, not an NPC. `NpcPlaceholder` moves too, so it
stays authorable (§6a.4).

Four details that keep this from being a visual regression:

1. **Constructor signature is already uniform.** `EntityManager` always calls
   `new entity.type(id, x, y, radius)`; Mob subclasses simply ignore the 4th
   argument today. The NPC classes should *keep reading it* and pass it as
   `size`, exactly as the Resource versions do — that preserves on-screen size,
   whereas the `randomInt(minSize, maxSize)` idiom the mob classes use has no
   `minSize` to read (the `GraphicsConfig.npcs` entries carry only `file` +
   `maxSize`).
2. **Render layer: keep `Game.layers.resources.trees`.** The `Mob` constructor
   takes any container, and the layer stack adds `mobs` **before** `resources`
   — a new `mobs.npc` layer would silently move every NPC *underneath* the
   trees. Changing z-order is not this chunk's business.
3. **`GraphicsConfig.npcs` stays where it is**; add npc-scoped `file()/maxSize()`
   helpers in `Mobs.ts` rather than merging the block into `GraphicsConfig.mobs`
   (whose helpers are typed against that object and expect `minSize`/`anchor`).
4. **Health bars: accepted, no gate** (D3). L5's open half is closed by PO
   ruling — *"we accept bars on NPCs since they can now also act in the world;
   most will not act but they can"*. So `initHealthBar` is untouched. The
   nameplate stays off for free (`combatTarget = Experience > 0 && …`, and
   experience is 0) and so does the tier frame (rank 0 is invisible). ⚠ A
   **screenshot is still required** — the ruling accepts a bar, it does not
   accept a mis-scaled sprite, a wrong layer or a stray aura ring.

### 6a.7 Implementation order

The only order that keeps the tree green at every step:

1. **Schema + loader** — `Interaction` types in `items/mobs`, the three parse
   tables, validation, tests. Nothing consumes it yet.
2. **`townsfolk` faction + the 14 defs.** Boot still ignores them; `go test`
   green, boot counts move (mobs 50 → 64).
3. **Sensor widening** (L11) + `Sensor()`/`Interaction()` on `*Mob`, with the
   passive-faction pin. Still no behaviour change — nothing is conversant yet.
4. **`sys/interaction.go`** — port `onApproach` and the whole of `npc_test.go`
   onto the new types, with the old `NpcSystem` still registered and running.
   Both systems compile; only one has content.
5. **Pilot one NPC.** Move `Farmer` alone: its spawn row, its client class, its
   table entry. Both paths live simultaneously (the split is per-`EntityType`,
   so this genuinely works). **Verify in-game here** — this is the cheapest
   place to discover a wire/sprite surprise, with 13 NPCs still on the old path
   as a live A/B control.
6. **Bulk-migrate the remaining 13** + the other 10 sprite classes.
7. **Delete**: `model/npc`, `NpcEntity`, `Teaching`, `addNpcEntity`, the zone
   `npcs` section + validations + tests, the `aurad.go` loop, `sys/npc.go`, and
   the editor's NPC mode.
8. Boot, smoke, screenshot, sim battery.

Steps 1–4 are pure addition; step 7 is pure deletion. If the session runs long,
**5 is the natural stopping point** — and worth its own commit either way.

### 6a.8 Decisions

**D1 — placement folds into `spawns`** (PO 2026-07-27). `zone.npcs` is deleted
along with the editor's NPC mode; teachings become JSON content.

**D2 — the 2 legacy proving-grounds Sages are dropped** (PO 2026-07-27), not
migrated. 14 definitions, not 16. Open question 6 closed.

**D3 — health bars on NPCs are accepted** (PO 2026-07-27): *"they can now also
act in the world … most will not act but they can"*. No gate on
`initHealthBar`; L5's open half closes without frontend work.

**D4 — role is `creature`, not `structure`** (PO 2026-07-27): *"whatever change
allows them to act like mobs, if we want — I want NPCs and mobs to be
theoretically able to act the same way"*. The 14 author `speed: 0` and are
otherwise ordinary actors. Downstream consequence, accepted: `creature` keeps
`body.aggroRadius` required, which is fine because that radius **is** the
interaction sensor (D7).

**D5 — unattackability becomes two authored knobs**, replacing today's
structural guarantee: the body off the Action layer (nothing can target it) plus
`friendlyToPlayers` (player damage skips it). Both are content, so a killable
NPC is a JSON edit. Follows from D4.

**D6 — `trigger: "interact"` hard-fails at load until 3b implements it.** The
schema names the future value; the loader refuses to accept content the engine
cannot honour, matching how `tier` and `role` are gated by their tables.

**D7 — `interaction.range` is optional; absent means `body.aggroRadius`.** The
effective sensor is `max(aggroRadius, range)`. The 14 omit it (one authored
radius, no duplicate sense number); the fighting teaching-guard of §3 authors
both, because talk range and aggro range are genuinely different quantities.

### 6a.9 Test plan & acceptance

**TDD, red-first.** `sys/npc_test.go` (373 lines) is the specification — port
it, do not rewrite it. Every `onApproach` case must be reproduced by the node
evaluator: ordered grants, stop-at-first-too-low + `blockedLine`, all-known →
`lines` fallback, grant-less flavour node, the 3-grant Emberkeeper walk, and the
level-skipper who collects several unlocks in one approach.

| pin | why it is the one that matters |
|---|---|
| a conversant with a **passive faction** senses a player | L11 — without the widening the NPC is silently mute, and every unit test of the evaluator still passes |
| a player aura tick on an NPC deals **0 damage**, and a hostile mob does not acquire it | D5 — assert behaviour, not layer equality |
| loader rejects: unknown `trigger`/`kind`/condition kind, `trigger: "interact"`, empty `nodes`, duplicate node id, dangling `next`, unknown skill, gated grant without `blockedLine`, zero effective sense radius | the whole of §6a.2 |
| content pin over all 14 defs: role, faction, interaction non-nil, and the **teaching order + required levels match the pre-migration zone JSON exactly** | table-driven, migrated from `world.json` — this is what proves "zero behaviour change" |
| `InteractionSystem.Remove` drops the actor and its `seen` entry | the no-op assumption that stops being true |

**Acceptance gates:**

- `go build ./...`, `go vet`, `go test -timeout 60s ./...` green; guardrails
  `-count=2`.
- **boot `-content ../api`, 0 errors / 0 panics / 0 warnings** — the real gate
  (L4), since the sim never loads authored content. Counts move exactly:
  **mobs 50 → 64**, **spawns 471 → 485**, **factions 14 → 15**, **npcs 14 → the
  log line is gone**, everything else unchanged (83 skills / 10 recipes / 5 prop
  defs / 1 milestone / 777 props / 5 campfires).
- **Sim battery + level curve + pack matrix byte-identical** to a `git worktree`
  HEAD build. The **preset roster gains exactly 14 rows and moves no existing
  cell** (L14); the guardrail battery is unaffected because unarmed defs are
  skipped at `guardrail_test.go:214`.
- Frontend `npm test` + `npm run typecheck` + `npm run build`.
- **Headless smoke** (`.claude/skills/verify`, the chunk-2 script as the
  template): walk into the Farmer's radius → Harvest learned, bubble shown,
  `"Taught by: Farmer"` attribution; approach the Emberkeeper under-level →
  blocked line and **nothing** granted; approach the ForestSign → its lore line.
  ⚑ Chunk 2's two harness traps still apply: the dev console `stopPropagation()`s
  keydown so **WASD is swallowed while it holds focus**, and **screen-up is
  decreasing world y**.
- **Screenshot** of an NPC — sprite, size, layer, health bar, no nameplate, no
  aura ring (§6a.6 detail 4).

### 6a.10 Not closed by this chunk

3b's interact verb and dialogue panel; **L2** (`SetFaction` nuking the authored
aggro mask — still two callers, still inert, and an interaction layer is exactly
where charm / side-switching / quest-turns-hostile gets wanted); quest state and
the journal (decision 6: shape only); NPC nameplates (gated off by
`experience: 0` — 3b's in-range prompt is the natural place for a name).

---

## 6b. Chunk 3b — the interact verb

*Planned in full 2026-07-27 (design session, no code). Line numbers are
post-chunk-3a HEAD `62a320fe`.*

**The one-sentence chunk:** talking stops being something that happens *to* a
player who walked too close and becomes something a player *does* — and the
sensor that 3a built for "approach" turns out to be the thing that drives the
prompt, so the verb costs a call-site move, not a new mechanism.

**Split into 3b-i (the verb) and 3b-ii (the panel)** — D8. 3b-i is shippable,
playable and verifiable on its own; 3b-ii is frontend-led and needs content that
does not exist yet.

**3b-i is ✅ DONE (`6368b2e5`); 3b-ii was re-planned in full on 2026-07-27 after
it shipped** — §6b.9 onward, decisions **D15–D23**. ⚑ **That session overturned
three of the decisions below** (D11 and D14 via D18, D13 via D19), so read §6b.9
before implementing anything from §6b.0.

### 6b.0 Decisions (PO, 2026-07-27, via choice prompts)

**D8 — 3b splits into 3b-i (interact verb) and 3b-ii (dialogue panel).** The
fork is §6b.1's finding: presenting a node and applying it are one pass today
(`evaluate()` walks grants, mutates the spellbook and returns the lines to speak,
all before anything is displayed). A panel that shows options *before* they are
taken needs that split; a plain interact verb does not. Splitting keeps all the
wire risk in 3b-i and all the UI in 3b-ii, the 3a/3b precedent.

**D9 — the interact key is `E`; the cooldown hotkeys become `Q`/`R`/`F`.**
⚑ **The plan's own earlier recommendation was unsafe:** `E` is already bound —
`Controls.ts:57` `cooldownHotkeys = [Q, E, F]`, and `Q` and `F` are taken too.
Those bindings carry an explicit *"[PLACEHOLDER bindings until a keybinding UI
exists]"* comment, which is what makes moving one sanctioned. Cooldown slot 2
moves `E` → `R`; the aura hotkeys `1`/`2`/`3` are untouched. See **L15**.

**D10 — the in-range signal is server-pushed, not client-computed.** The
alternative was extending `GET /mobs` with `interactable` + `interactRange` and
letting the client measure. Rejected: it duplicates the server's sense-radius
geometry client-side, so any mismatch shows a prompt the server then refuses.
The codebase already has the opposite rule on record — `aura_radius` and
`dwell_radius` were moved onto the wire *specifically* to retire hand-synced
client constants. ⚑ **Refinement taken during planning:** "server-pushed" does
**not** mean a new `ServerMessageBody` member. It is one field on `GameState`,
which is already the own-player-only channel (`in_combat`, `cast_*`,
`activation_rejected_*`, `spellbook`). That makes it *state* rather than
*events* — no enter/leave bookkeeping, no desync possible, and **the
`ServerMessageBody` positional-union landmine (L16) is never exercised.**

**D11 — all 14 flip to `trigger: "interact"`.** ⚑ **SUPERSEDED by D18 (3b-ii):
the key is deleted from all 14 again** — with no enum left, "nothing speaks
unprompted" stops being an authored value and becomes the only behaviour there
is. The rule below survives; only its expression goes. One uniform rule: nothing ever
speaks unprompted. Costs `ForestSign` and `LamplessTraveller` their walk-by lore
(they are the only two with zero grants and zero options), and buys no ambient
chatter firing while a player runs past mid-fight.

**D12 — the `E` badge appears only while in range**, and is anchored **in the
world over the entity**, not in the HUD. Purely server-driven from D10's field,
so the badge can never promise something the server refuses. Accepted downside:
no hint that a figure is talkable until you are already next to it. (The
dim-when-visible / lit-when-in-range variant was the discoverability option; it
would have needed the one catalog boolean D10 otherwise avoids. Revisit if
playtest says NPCs go unnoticed.)

**D13 — the reply is private to the interactor.** ⚑ **SUPERSEDED by D19
(3b-ii): the reply moves into the panel and the private `speak()` is retired
altogether** — the reply text rides the streamed tree, so nothing is sent. The
fan-out survives, now serving `ambient`. Today `speak()` fans the lines
to every player inside the sensor. Once a conversation is deliberately initiated
by one player, that is the wrong audience: a crowded town square would fill with
other people's teaching lines. One-line change. (The unlock banner was already
private.)

**D14 — `approach` stays in the trigger table with zero content users.**
⚑ **SUPERSEDED by D18 (3b-ii): the trigger enum is deleted outright.** The want
D14 was protecting — ambient walk-by lore — became its own `interaction.ambient`
field, which is what a content author actually reached for; the *trigger* had no
behaviour left once D17 retired the walk. The original reasoning: It
remains the parse default for an absent `trigger`, it is ~5 lines, and its
evaluator path is the same `evaluate()` call from a different call site — fully
covered by the 373 ported tests. Ambient walk-by lore is an obvious future want
(a whispering ruin, a warning as you cross a threshold). ⚑ This is a deliberate
exception to the house anti-dead-code rule, taken because the *code* is not dead
— only the authored value is unused, and the machinery behind it is what drives
the prompt (§6b.3 step 2).

### 6b.1 Why the split, precisely

`evaluate()` (`sys/interaction.go:150`) does presentation and mutation in one
pass. For 3b-i that is exactly right — the verb only moves *when* it is called:

| | today (3a) | 3b-i |
|---|---|---|
| what fires `evaluate()` | the rising edge of the sensor | an `Interact` message naming the actor |
| what the sensor edge does | fires `evaluate()` | drives the prompt field |
| what the player sees | a bubble that ambushed them | a badge, then a bubble they asked for |

3b-ii is where the pass has to break in two — *present this node* (lines +
option labels, nothing mutated) then *apply this option* (grants land). That
restructure has no reason to ride along with a keybind.

---

### Chunk 3b-i — the interact verb

#### 6b.2 The wire — one append in each direction, one union touched

**`client.fbs`** gets a new message appended to the union:

```fbs
// Open a conversation with an actor the server has told this client is in
// range (GameState.interactable_entity_id). The id is echoed back rather than
// implied so a stale keypress names what the player actually saw.
table Interact {
    entity_id:ulong;
}

union ClientMessageBody { Input, Join, Cheat, ChatMessage, Equip, SpendSkillPoint, Respawn, Interact }
```

⚑ **Append at the end, value 8. Never reorder** — L16.

**`server.fbs`** gets one field at the end of `GameState`, **no new union
member**:

```fbs
  // Entity id of the conversant the owning player can talk to right now; 0 =
  // none. Own player only, live state (not a per-tick one-shot): the client
  // draws the interact badge over exactly this entity. Server-authoritative by
  // construction — the same value gates the Interact message, so the badge can
  // never promise a conversation the server refuses. Appended at the table end
  // so existing field IDs stay stable.
  interactable_entity_id:ulong = 0;
```

**Why a `GameState` field and not a message** (D10): `GameState` is already the
own-player-only channel, the field is state rather than an event so there is no
enter/leave bookkeeping to get wrong, 8 bytes/tick/player is noise against a
~30-field table, and it leaves `ServerMessageBody` untouched.

Both `.fbs` edits need `cd api/schema && ./make.sh` and regenerated bindings on
**both** sides.

#### 6b.3 Server changes — six small ones

*Code-audited against HEAD `688a0d41` on 2026-07-27, before the first edit. The
shape held; one step was missing outright (step 3) and three details were wrong.
Corrections are tagged **[audit]**.*

1. **`mobs.triggers` gains one entry** (`items/mobs/interaction.go:105`):
   `string(TriggerInteract): TriggerInteract`. This is 3b's first edit and it is
   what unblocks D6. `TestParseTrigger_InteractIsNotAuthorableYet` inverts — it
   is the red test that opens the chunk.

2. **`InteractionSystem.Update` splits its two jobs.** The sensor loop keeps
   running exactly as it does today, because it is now what drives the prompt.
   What changes is the body:

   - stamp `p.NoteInteractable(actorID, distSq)` for every player in the sensor
     (nearest wins when several overlap — see L17);
   - call `evaluate()` on the rising edge **only when the actor's trigger is
     `approach`** (**L18**: without this guard, an `interact` NPC would grant on
     approach *and* on keypress).

   ⚑ **[audit] The two jobs are order-dependent inside one `Update`, and it is
   the same class of trap as L18 — see L20.** The sensor stamp must run **before**
   the step-4 drain, because `ResetTickNumbers` has already zeroed the field this
   tick.

3. **⚑ [audit] `InteractionSystem` must learn about players — it has none
   today.** This step was missing from the plan. The system is registered
   **only** in the mob branch of the add-entity matrix (`core/game.go:298`); it
   holds `actors []Conversant` and nothing else, so there is no queue to drain
   from and nothing to stamp onto. 3b-i adds, on the `EquipSystem` precedent
   (`sys/equip/equip.go:30-56`): a `players []interactor` slice behind a minimal
   local interface (`Basic`/`Client`/`Position`, the `equipEntity` pattern), an
   `AddPlayer`, and a `case *sys.InteractionSystem: s.AddPlayer(p)` in the
   **player** branch (`game.go:~360`, beside `equip.EquipSystem`). ⚑ **`Remove`
   must sweep the players slice too** — today it walks `actors` and deletes from
   `seen` only, so every disconnect would leak a player and keep draining a dead
   client's queue.

4. **A new drain of the `Interact` queue**, mirroring `NextEquip`/`NextRespawn`:
   `model.Client.NextInteract() *model.Interact`, a `c.interacts` channel of 2,
   a `routeMessage` case, and `codec.InteractMessageFlatbufferUnmarshal`. The
   handler lives in `InteractionSystem` (it owns the actor list and the
   evaluator) and validates the named id against the player's own stamped
   `interactableEntityID` — **the same value the client was told**, so range
   enforcement is one comparison, not a second geometry implementation.
   ⚑ **[audit] This is the 7th method on `model.Client`, an interface two test
   files implement by hand** — `sys/state_test.go`'s `fakeClient` and
   `sys/equip/equip_test.go`'s `stubClient`. Both break, and `go build ./...`
   stays green while they do: only `go test` catches it. Add the two one-line
   stubs in the same step.

5. **`speak()` takes the interactor instead of fanning** (D13): the
   `for c := range a.Sensor().Collisions()` loop is replaced by one
   `p.Client().SendMessage(bytes)`. The `approach` path keeps the fan-out — that
   *is* ambient speech and it should stay public. So `speak()` grows a
   recipients argument rather than losing its loop.

6. **`player` grows the per-tick field** — `interactableEntityID uint64`, an
   `Interactable()` getter, `NoteInteractable()`, and a clear in
   `ResetTickNumbers()` (`player.go:459`) alongside `campfireBound` and
   `rejectedSkill`. ⚑ **[audit] carry the tie-break on the player, not in a
   per-tick map:** `NoteInteractable(id, distSq)` keeps the nearer of what it is
   handed and `ResetTickNumbers` clears both fields, which satisfies L17's
   nearest-by-centre rule in two comparisons and with **zero new per-tick
   allocation** — the alternative (a `map[playerID]best` rebuilt each tick) adds
   garbage to the idle loop that `fe0044d0` exists to keep out. (`sys/` has no
   alloc pin today — `phy`, `model` and `model/mob` do — so this is house rule,
   not a failing test.) ⚑ **Ordering is already correct and worth stating:**
   `StatusEffectsSystem` (priority **101**) clears → `InteractionSystem`
   (priority **20**) stamps → `PostUpdateSystem` (priority **−80**) serializes.
   The exact `campfire_bound` pattern; no new sequencing risk.

#### 6b.4 Content — 14 files, one key each

`"trigger": "approach"` → `"trigger": "interact"` in all 14 (D11). Nothing else
in the interaction blocks moves; `option.text` and `next` stay unauthored until
3b-ii. `interaction_content_test.go` gains an assertion that every conversant
authors `interact`, which is what keeps a 15th NPC from silently defaulting to
ambient speech.

#### 6b.5 Frontend — the rebind, the key, the badge

**The keybind rides the existing edge-triggered hotkey path**, not
`handleFunctionKeys`. That is deliberate: `Controls.update()` already early-
returns on `Game.state !== GameState.PLAYING` (so a dead spectator cannot talk)
and the aura/cooldown hotkeys already implement press-edge detection via the
`…WereDown` arrays. Adding `interactKey = new Keys(KeyCodes.E)` plus one
`interactKeyWasDown` inherits every guard for free. ⚑ Chat/console-open
suppression comes from `KeyboardManager`, not from `Controls` — verify with the
chat box open, it is the one guard not inherited by construction, and L15 records why.

**The rebind** (D9): `cooldownHotkeys = [Q, E, F]` → `[Q, R, F]`, and the
comment above it updated to name `E` as interact. ⚑ **[audit] the file is
`src/features/controls/logic/Controls.ts`** (the array is at :56, the
`[PLACEHOLDER bindings…]` comment at :54) — L15 and D9 both write `Controls.ts:57`
without the `logic/` segment.

**The badge** is a world-anchored child container on the entity's sprite, and 3a
moved all 14 NPC sprite classes onto that `Mobs` path. ⚑ **[audit] only one of
the three named precedents actually is that pattern.** `AuraTickIndicator` is —
it takes the sprite as its parent (`new AuraTickIndicator(this.shape)`,
`Mobs.ts:247` and `:280`). **The nameplate is not**: it lives on the separate
unfiltered `Game.layers.characterAdditions.namePlates` overlay and is glued to
the sprite per frame in `updatePlate` (`Mobs.ts:117-120`, `:188`), *deliberately*,
because a plate must stay legible above the darkness layer — which is precisely
why it then needs the explicit `DarknessOverlay.isHidden` call at `Mobs.ts:191`
to hide itself again in unlit areas. **Follow `AuraTickIndicator`, not the
plate**: parenting to `this.shape` puts the badge under the darkness filter with
the NPC it labels, so it dims and vanishes exactly when its subject does, and no
`isHidden` bookkeeping is needed. Driven purely by
`GameState.interactable_entity_id`: the
client shows it on `Game.map.getObject(id)` and hides the previous one when the
id changes or goes to 0. ⚑ **Anchor it off the sprite's rendered bounds, not the
wire `radius`** — 3a's own finding is that mob sprites size from
`GraphicsConfig` and ignore the wire value while NPCs size from the wire, so
"above the sprite" is only one expression if it reads the container (L19).

#### 6b.6 Implementation order

The tree stays green at every step; only the two halves of step 2 must not be
split. **[audit] Six steps, not five** — player registration was missing.

1. `.fbs` edits + regenerate both sides. Nothing reads them yet.
2. **Server: `triggers` table entry + the `approach`-only guard on the
   evaluator call (L18), together.** Adding the table entry alone would let
   authored `interact` load while still granting on approach — the exact silent
   double-fire the guard exists to prevent.
3. **[audit] Server: player registration first** — `AddPlayer` + the `Remove`
   sweep + the `game.go` player-branch case (§6b.3 step 3). Split out because it
   is the one step the plan had missed entirely, and because everything in step 4
   is unwritable without it: there is no player list to stamp or drain from.
   Landing it alone is inert and green.
4. Server: the stamp, then the `Interact` drain + validation, then `speak()`'s
   recipient. ⚑ **stamp before drain inside `Update` (L20)** — the `EquipSystem`
   shape this otherwise mirrors puts handlers first, which here refuses every
   keypress.
5. Content: 14 files flip. Boot `-content ../api` — this is where a wrong
   trigger table shows up.
6. Frontend: rebind, key, badge.

#### 6b.7 Test plan & acceptance

**Red first**, and the chunk hands one to itself: inverting
`TestParseTrigger_InteractIsNotAuthorableYet` is the opening move.

- Go: the ported 373-line evaluator suite must stay green **untouched** — 3b-i
  changes *when* `evaluate()` is called, never what it does. Any diff there is
  a bug in the split.
- Go, new: `interact` parses; an `interact` actor does **not** grant on the
  sensor edge — **assert by walking into range and checking the spellbook, not
  by pressing `E`** (L18 [audit]); a stamp and an `Interact` inside **one** tick
  succeed, which is the L20 pin and the one test that would catch a
  handlers-first `Update`; an `Interact` naming an actor the player was never
  told about is refused; a disconnected player is dropped from the system's own
  slice (§6b.3 step 3's `Remove` sweep);
  `interactable_entity_id` is stamped and cleared per tick;
  nearest wins with two overlapping sensors; the reply reaches only the
  interactor (D13) while an `approach` actor still fans out.
- Codec: a `GameState` round-trip pinning the new field, mirroring
  `gamestate_test.go`'s `activation_rejected` pair.
- Frontend: vitest over the badge's pure selection logic (which id is shown);
  `npm run typecheck` + prod build.
- **Boot both ways** with the pinned counts (83 skills / 15 factions / 64 mobs /
  485 spawns) — the loader is where a bad trigger surfaces and the sim harness
  cannot see it.
- Sim battery byte-identity is **expected and required**: `sim/world.go` never
  loads authored content and has no client, so 3b-i must not move a single
  number.
- **In-game (the acceptance test, `.claude/skills/verify`):** walk to the
  Farmer (−57/28.6) — badge appears, nothing is said; press `E` — the bubble and
  the unlock banner fire; walk away — badge gone; walk back and press again —
  re-triggers, already-known skills skipped. Emberkeeper (34.5/−19.6) for the
  ordered 3-grant walk stopping at the first gate. `R` fires cooldown slot 2 and
  `E` no longer does.

#### 6b.8 Not closed by 3b-i

The dialogue panel; `option.text` and `next` still read by nothing; NPC
nameplates (D12 chose the bare badge, so the name is still gated off by
`experience: 0`); **L2** (`SetFaction` nuking the authored aggro mask — an
interaction layer is precisely where charm / side-switching gets wanted).

---

### Chunk 3b-ii — the conversation panel

*Planned in full 2026-07-27, in a second design session held after 3b-i shipped
(the re-plan the sketch below asked for). Line numbers are post-3b-i HEAD
`d9b53aa0`.*

**The one-sentence chunk:** the panel is not a teaching dialog with buttons on
it — it is a **conversation tree browser**, and once that is the target,
"everything is an option" collapses the whole feature onto one mechanism the
schema already validates but nothing has ever read.

#### 6b.9 The reframe (PO brief, 2026-07-27)

The sketch this section replaces assumed a flat panel: lines, option labels,
pick one, done. The PO brief is a tree:

> a player approaches an NPC and presses E. Dialogue window pops up with three
> choices. First: *"Anything new happen around here"* → leads to an
> environmental text hint, displayed as a response in the conversation UI. This
> might also lead to quest starts or ends. The UI leaves the option of either
> further questions or going back. Second option would be *"teach me
> something"* → leads to a list in the same conversation UI window where the
> player can make a selection of what to learn. Things already learned are not
> shown in that list. Again, UI allows for going back to the selection. Third
> option could be *"tell me where I can find…"* with a list of options
> afterwards, similar to WoW guards in cities.

⭐ **That maps onto the authored schema with no new nesting**, because decision 6
built the container in full and only ever authored the degenerate case:

| the brief | the schema, unchanged |
|---|---|
| three choices at the greeting | a node with three `options` |
| "anything new" → hint text → back | option `next:` → a node with `lines`, no grants |
| "teach me something" → a pickable list | option `next:` → a node with **one option per skill**, each holding a single grant |
| "where can I find…" → directions list | identical shape: option → node of options → nodes with `lines` |
| already-learned entries not shown | `HasDiscovered`, promoted from *silent skip inside the walk* to **visibility** |
| too-low entries greyed with the wall | `grant.RequiredLevel`, rendered instead of stopping a walk |

⭐ **The consequence that shapes everything else: a "list" is just a node whose
options happen to be one-grant teachings.** Options are the only interactive
element in the entire panel — branch or grant, they are the same row. There is
no second concept to build, and quest offer/accept lands later as a new
`GrantKind` on the identical row.

#### 6b.10 Decisions (PO, 2026-07-27, via choice prompts)

**D15 — the panel is a tree browser; everything is an option.** Rows are
options; grants are what an option hands over. A teaching list is authored as
one option per skill. Nodes with no options are leaf replies (a hint, a
sign-post) and render as lines plus Back/Leave.

**D16 — the client walks a streamed tree; the server owns availability.** While
a conversation is open, `GameState` carries the **whole personalised tree** for
that actor: every reachable node, each option marked available or locked, with
already-known ones omitted. The client navigates instantly with a local
back-stack; only *taking* an option goes to the server, where it is validated
exactly as today. Server-side state is 2 fields (who is talking to whom) with
**no node bookkeeping** — the position in the tree is a client concern, because
every apply is validated on its own merits (in range · node exists and its
conditions pass · option available · level cleared · not already known), never
on the path taken to reach it. Rejected: one-node-at-a-time server traversal —
a round-trip per click, plus a real session lifecycle, to buy path validation
that condition checks already provide.

**D17 — teaching becomes per-entry selection, and the ordered grant WALK
retires.** Clicking *Ignite* teaches Ignite and nothing else. Already-known
entries are hidden; locked ones show the wall and, when clicked, the NPC answers
with the authored `blockedLine` and grants nothing. ⚑ **This is the chunk's one
behaviour change and it costs the 373-line ported evaluator suite** — that suite
pins the walk, which is precisely what 3b-i was careful not to touch. It is
rewritten around `present()` / `applyGrant()`. **The upside is that the 11
NPCs we do not re-author need no content migration at all:** `present()` expands
a legacy multi-grant option into one row per grant automatically.

**D18 — `trigger` is retired entirely; ambient speech becomes its own field.**
⚑ **The finding that forced this: `trigger` is a single value, so an NPC could
never both call out as you pass AND open a tree on `E`** — which is exactly the
NPC the PO described. So `interaction.ambient: ["…"]` is spoken as a world
bubble on the sensor's rising edge, to everyone standing around, independent of
anything else; and with the walk retired (D17) the `approach` trigger has no
remaining meaning. The enum, its parse table, `ParseTrigger` and **landmine
L18's guard** all go. *PO asked whether `approach` could be reused later for
quests that advance on approach: no — the reusable part is the rising-edge
`seen` map and `speakToSensor`, and those stay alive and exercised by `ambient`.
A future approach-fired quest hook needs a pointer to WHICH node fires
(`onApproach: <nodeId>`) plus one-shot-per-player-forever semantics that a
per-session `seen` map does not provide, and is more likely to want a world
trigger volume in a doorway than a property of a talkable NPC. Keeping the enum
would preserve a name whose behaviour no longer exists.*

**D19 — the NPC's speech moves INTO the panel; world bubbles stay for ambient
storytelling.** Node lines and an option's reply render inside the window. The
floating bubble survives for `ambient` only. ⚑ Consequence: **D13's private
`speak()` is retired** — a conversation reply no longer travels as an
`EntityMessage` at all, because the reply text is already in the streamed tree
(§6b.13). `speakToSensor` and `marshalSay` stay, now serving `ambient`.

**D20 — locked entries are shown, greyed, with the level wall named.**
`✗ Immolate — level 12` at level 2. Each NPC becomes a signpost for progression
and a reason to come back. Accepted cost: it names a skill before the player can
have it — but only to someone standing in front of the NPC, never through a
public endpoint (which is why serving the tree from the mob catalog was
rejected: `catalog.go`'s own comment forbids handing players an answer key).

**D21 — the panel is non-blocking, mouse-driven, and combat ends the
conversation.** Movement, auras and cooldowns keep working while it is open; it
closes on Escape, a second `E`, Leave, walking out of range, **or either party
entering combat**. ⚑ That last rule is what makes non-blocking safe: a player
cannot be trapped reading dialogue while something eats them.

**D22 — an actor in conversation holds position, and resumes afterwards.** So a
patrolling NPC on a road can be stopped and talked to. ⚑ Nothing in the game
patrols today — **all 14 conversants author `speed: 0`** — so the chunk also
authors a moving NPC (the `Wanderer`) to prove the rule in-game rather than
shipping a hold nothing exercises.

**Also decided:** Back and Leave are **automatic, never authored** — content
authors only forward `next` links, so no one can author a dead end a player is
stuck in. The panel sits **bottom-centre, above the action bars** (see L25).
Content scope is **2–3 real trees** (D23 below), the rest stay flat and render
correctly via D17's auto-expansion.

#### 6b.11 The authored shape after this chunk

```jsonc
"interaction": {
  "range": 2.0,                                   // [PLACEHOLDER] see L26
  "ambient": ["The bridge past the mill is out!"], // NEW (D18): bubble on approach, no panel
  "nodes": [
    { "id": "root",
      "lines": ["Fire remembers who feeds it."],
      "options": [
        {"text": "Teach me something.",        "next": "teachings"},
        {"text": "Anything new around here?",  "next": "news"},
        {"text": "Where can I find the mill?", "next": "directions"}
      ]},
    { "id": "teachings",
      "lines": ["What would you have of the flame?"],
      "options": [
        {"text": "Torch",  "grants": [{"kind": "teach_skill", "skill": "Torch",  "requiredLevel": 1,
                                       "line": "Let this be a light for you in dark places."}]},
        {"text": "Ignite", "blockedLine": "Fire doesn't suffer the careless. Grow stronger.",
                           "grants": [{"kind": "teach_skill", "skill": "Ignite", "requiredLevel": 7,
                                       "line": "Let me show you how to light a fire in your enemies."}]}
      ]},
    { "id": "news", "lines": ["They burned this forest to hide their camp."] }
  ]
}
```

**Two loader changes, both fail-at-boot:**

1. `trigger` is gone (D18). ⚑ **The mob loader is NOT strict** —
   `definitions.go:284` is a plain `json.Unmarshal` with no
   `DisallowUnknownFields`, unlike `world/zone.go:244` and `factions.go:184` —
   so a leftover `"trigger": "interact"` would be **silently ignored on all 14
   files**. Stripping the key from the content is therefore part of the same
   step, not a follow-up (L22).
2. **An option must carry at least one grant or a `next`.** Today an option with
   neither is merely pointless; under a panel it is a button that visibly does
   nothing. The existing `next`-names-no-node check (added in 3a for exactly
   this reason) already guards the other half.

**Cycles need no check.** `present()` serialises *every* node of the interaction
rather than walking the graph, so an authored loop (`news` → back to `root`) is
harmless by construction — there is no traversal to run away.

#### 6b.12 The evaluator split — `present()` and `applyGrant()`

`evaluate()` dies with the walk (D17). Two functions replace it:

```go
// present builds the personalised tree. Pure: it reads the spellbook and the
// level and mutates NOTHING — that is the whole point of the split (D8).
func present(in *mobs.Interaction, p learner) *presentedTree

// applyGrant hands over exactly one grant, validating it on its own merits.
func applyGrant(in *mobs.Interaction, p learner, nodeID string, option, grant int) (reply string, taught *skills.SkillID, ok bool)
```

`present()`'s rules, all of which are today's rules relocated:

| authored | presented |
|---|---|
| node whose `Conditions` fail | **omitted**, and any option whose `next` names it is hidden |
| entry node | the first node whose conditions pass — `selectNode()` verbatim, so a conditional greeting still works |
| option whose grants are all `HasDiscovered` | **hidden** (today: silently skipped mid-walk) |
| grant with `RequiredLevel` above the player | **locked**, with the level named (D20) |
| option with several grants and no `text` | **one row per grant**, labelled with the skill's display name — this is what makes the 11 un-migrated NPCs work (D17) |
| option with `text` | one row, that label |
| `grant.Line` / `option.BlockedLine` | the row's `reply` — what the NPC says when the row is clicked, chosen by the row's state |

⚑ **Carrying `reply` in the tree is what makes the panel feel instant**: the
client shows the NPC's answer the moment a row is clicked, with no round-trip,
and the row flips to *known* on the next snapshot when the server's grant lands
(L24).

#### 6b.13 The session, the end conditions, and the hold

**On the player:** one field, `conversingWith uint64` (plus its getter and
setter). Not a per-tick number — it survives across ticks, so it does **not**
join `ResetTickNumbers`.

**Opened** by an `Interact` whose `entity_id` matches the already-stamped
`Interactable()` — 3b-i's validation unchanged. **Ended** by any of:

- the client sending `close` (Leave / Escape / a second `E`);
- `Interactable() != conversingWith` — walked out of range, which costs nothing
  to check because the badge already computes it every tick;
- the player `InCombat()` **or** the actor `InCombat()` (D21) — both methods
  already exist (`player.go:248`, `Mob.InCombat()` since the round-3 fix), but
  ⚑ **neither is reachable through the interfaces this system holds**:
  `InCombat()` lives on `model.Combatant` (`model/combatant.go:24`), and
  `MobEntity` does **not** embed it, so `Conversant` and `interactor` each need
  the method added. Both concrete types satisfy it for free; the cost is the
  **test doubles** in `sys/interaction_test.go`, which is the same trap 3b-i hit
  with `model.Client`'s 7th method — `go build ./...` stays green while they
  break, and only `go test` says so;
- the actor dying or despawning, the player dying, the client disconnecting
  (`Remove` already sweeps both slices since 3b-i).

**The hold (D22)** is one guard at the top of `Mob.updateIdleMovement()`
(`model/mob/patrol.go:66`, after the `spawnInitialized` check): an actor with at
least one conversation partner does not walk. That single point covers route
patrol, wander *and* the walk-home default, and deliberately leaves the aggro
path alone — an actor that aggroes is in combat, which has already ended the
conversation. The flag is recomputed each tick by `InteractionSystem` with a
clear-then-set pass over its two slices (**no per-tick map** — the idle-alloc
discipline, `fe0044d0`).

#### 6b.14 The wire — nested tables on `GameState`, `Interact` grows

**`server.fbs`**, three new tables plus one `GameState` field. ⚑ **No new
`ServerMessageBody` member** — the same D10 refinement that kept L16 unexercised
in 3b-i:

```fbs
table ConversationOption {
  option_index:ubyte;      // AUTHORED index — never the presented one (L21)
  grant_index:ubyte = 255; // authored grant within the option; 255 = navigation only
  text:string;             // resolved label: authored text, else the skill's display name
  next:string;             // node to continue at; empty = none
  locked:bool = false;     // shown greyed (D20); already-known rows are omitted entirely
  required_level:ubyte = 0;// the wall to name while locked
  reply:string;            // what the actor says when this row is taken (grant line / blockedLine)
}
table ConversationNode { id:string; lines:[string]; options:[ConversationOption]; }
table Conversation { entity_id:ulong; entry_node:string; nodes:[ConversationNode]; }

// in GameState, appended at the table end:
conversation:Conversation;  // absent = no conversation open
```

**`client.fbs`**, `Interact` grows three fields — **the union is not touched
again**:

```fbs
table Interact {
  entity_id:ulong;
  node_id:string;             // "" = just open the conversation
  option_index:ubyte = 255;   // 255 = none
  grant_index:ubyte = 255;
  close:bool = false;         // the player dismissed the panel
}
```

Cost while a panel is open: today's fattest tree marshals to ~350 bytes/tick for
that one player; a future 10-node quest tree ~4 KB. Sent as **state**, every
tick, for consistency with `interactable_entity_id` — a change-only send is a
measurable optimisation available later, not a design requirement.

#### 6b.15 Frontend

- **`features/conversation/`**, split the way the repo already splits testable
  frontend logic (the `SkillTooltip` / `InteractBadgeTargeting` precedent): a
  **DOM-free navigation model** (entry node, follow `next`, back-stack, close
  when the server drops the tree) covered by vitest, plus a thin panel that
  renders it.
- **The panel is bottom-centre above the action bars** — see **L25**, it shares
  that column with `#castBar` and `#actionBars` and must not cover either.
- **Input:** `pointerdown`, never `click` (the documented `MouseManager`
  landmine — `click` listeners on HUD panels silently never fire). Escape and a
  second `E` close. No number-key selection: `1`/`2`/`3` are the aura hotkeys.
- **The badge hides while its own conversation is open** — it has already been
  accepted.
- **The panel is state-driven**: it closes because `conversation` went absent
  from the snapshot, never because the client decided to. Every server-side end
  condition (§6b.13) therefore needs no client counterpart.

#### 6b.16 Content

**D23 — 2–3 representative trees, the rest stay flat.**

- **Emberkeeper** — the teaching list: three one-grant options, level walls at
  1/7/12, so hidden-when-known and locked-with-wall are both visible in one
  screen.
- **TownCrier** — the hint branch: *"Anything new around here?"* → a leaf node,
  plus **`ambient`** lines so the same NPC calls out as you walk past (the NPC
  D18 exists for).
- **Wanderer** — the patrol: a `wanderRadius` [PLACEHOLDER] plus a small tree,
  so **D22's hold is provable in-game** rather than shipped blind. Waypoints
  authored per-spawn in the zone editor are the alternative if the PO prefers a
  road route.

The other 11 keep their single-option node and are rendered by D17's
auto-expansion. All 14 lose their now-dead `"trigger": "interact"` key (L22).

#### 6b.17 Implementation order

1. `.fbs` both directions + regenerate both sides. Nothing reads them yet.
2. **Schema + loader + content, together**: `ambient`, the grant-or-`next`
   option rule, `trigger` deleted, and the key stripped from all 14 files.
   ⚑ Together because the loader is not strict — split them and the content
   keeps a lying key that nothing rejects (L22).
3. **The evaluator split**: `present()` + `applyGrant()`, `evaluate()` deleted,
   the 373-line suite rewritten around the two. This is the chunk's core and its
   biggest single diff.
4. **Session + end conditions + the `GameState` marshal.**
5. **The hold** (D22) + the `Wanderer`'s movement.
6. **Frontend**: navigation model, panel, input, badge suppression.
7. **Content**: the 2–3 trees + `ambient` lines.

#### 6b.18 Test plan & acceptance

- **Go, `present()`** (all pure, no mutation — the assertion the split exists
  for): every reachable node emitted · a condition-failed node omitted *and*
  options pointing at it hidden · all-known option hidden · too-low option
  locked with its level · a legacy multi-grant option expanded to one row per
  grant · **the emitted indices are the AUTHORED ones** (L21) · entry node is
  `selectNode`'s.
- **Go, `applyGrant()`**: grants exactly one skill · refuses out of range,
  unknown node, condition-failed node, bad index, too-low level, already-known ·
  returns the authored `blockedLine` for a locked row and grants nothing.
- **Go, session**: ends on range loss, on the player entering combat, on the
  actor entering combat, on actor death and on disconnect · the actor holds
  position while a partner is conversing and **resumes afterwards** (a synthetic
  wandering actor, since only the authored `Wanderer` moves) · `ambient` fires
  once per rising edge and fans out to everyone in the sensor.
- **Loader**: an option with neither grant nor `next` is rejected · `ambient`
  parses · content pin that **no file authors `trigger`** (a raw-JSON assertion,
  because the loader will not catch it).
- **Codec**: `GameState` round-trip over the nested `Conversation` table
  (vectors of tables inside a table — the first such payload on this channel).
- **Frontend**: vitest over the navigation model (opens at the entry node,
  follows `next`, back-stack pops, Leave closes, an absent `conversation` closes
  it, hidden rows never render); `npm run typecheck` + prod build.
- **Boot both ways** with the pinned counts (83 skills / 15 factions / 64 mobs /
  777 props / 485 spawns / 5 campfires).
- **Sim battery**: expected byte-identical — no gameplay number moves. ⚑ The one
  thing to check is the **guardrail preset roster**, which gained the 14 NPC rows
  in 3a (L14): authoring `wanderRadius`/speed on the `Wanderer` may legitimately
  move that row and nothing else.
- **In-game (`.claude/skills/verify`, new `chunk3b-ii-conversation.mjs`)**: `E`
  at the Emberkeeper opens the panel with three-ish rows, Torch available,
  Ignite locked reading *level 7*; clicking Ignite while too low speaks the
  refusal and teaches nothing; clicking Torch teaches Torch **and only Torch**,
  the row vanishes, the unlock banner fires; Back returns to the greeting; Leave
  closes; walking out of range closes it; **being hit closes it**; the
  `Wanderer` stops while talked to and walks on afterwards; the `TownCrier`
  still calls out its `ambient` line as you pass **without** opening anything.
  ⚑ Walk in 0.5 s bursts and stop on the badge, never a fixed duration — 3b-i's
  harness finding, and doubly so against a moving target (L26).

#### 6b.19 Not closed by 3b-ii

Quest state and the journal (decision 6 still: shape only — a quest is a new
`GrantKind` on the identical row, plus a condition kind); vendors; NPC
nameplates (still gated off by `experience: 0` — the panel header now carries
the name instead); **L2** (`SetFaction` nuking the authored aggro mask — two
callers, inert today, and still exactly what a charm / side-switch / quest-
turns-hostile would trip over); a change-only send for the conversation tree
(§6b.14); approach-fired quest hooks (D18 — they want `onApproach: <nodeId>` and
persistent one-shot semantics, not the retired trigger).

⚑ **What the panel does NOT break:** every selection happens inside the window,
never in the world, so the GDD's "no targeting" pillar stands exactly as ruling 5
intended — the only world-space act is standing near someone and pressing a key.

---

## 7. Deliberately NOT built

- **A second component system.** The repo already has ECS; a parallel one is the
  failure mode this whole plan exists to avoid.
- **Unifying `*player` into `*Mob`.** Players keep their own type. They satisfy
  the same interfaces; that is the entire requirement.
- **Making everything killable or levelled "for symmetry".** A campfire that does
  not implement `Perishable` is *better* than a campfire with a level it never
  uses. Capabilities are opt-in by implementation.
- ~~**The gossip tree**~~ — **built in 3b-ii** (D15/D16: the panel walks the
  authored node graph). Decision 6's "shape only" now covers **quest state, the
  journal and vendors** alone; each is a new `GrantKind` or `ConditionKind` on
  the row the panel already renders, which is exactly the additive-content
  outcome that decision was taken for.
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

**L3 — summon scaling double-counts under dynamic levels.** ✅ **HELD in 1b** —
both mechanisms came out in the one change; the product is provably unchanged
(§11). Chunk 1b's
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
before the first snapshot. ✅ **RESOLVED by PO ruling 2026-07-27 (D3): bars on
NPCs are ACCEPTED** — *"they can now also act in the world; most will not act
but they can"*. No gate; `initHealthBar` is untouched. **The screenshot is still
required** — the ruling accepts a bar, not a mis-scaled sprite or a wrong layer.

**L6 — `Derived` is populated on mobs already, so the obvious test passes.**
`recomputeDerived()` (`skills/component.go:313`) is a `SkillComponent` method and
runs regardless of owner type. A mob equipping Hardy therefore has
`Derived.MaxHealthBonus` **correctly set today** — a debugger, a log line or a
test asserting on `Derived` all show the right number while the behaviour is
absent. **Every Chunk 1a test must assert on behaviour** (HP pool, damage taken,
distance moved), never on `Derived`.

**L7 — `sys/skills.go:1523` is a near-miss, not a mob-side reader.** ✅ **MOOT
since 1b** — that call site and `MaxHealthBonusAt` itself are deleted; kept for
the reasoning, not as a live pointer. It calls
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

**L9 — `speed: 0` is a MECHANISM inside the sim harness, not just a value.**
Four sites use it to mean *turret*, not *stationary*: `sim/chain.go:154` pins the
kite-stance mob at 0 explicitly so "its aura stays always on, so it still fights
back", `sim/scenario.go:169` documents the field that way, `simharness/main.go:127`'s
flag says so, and the explorer's knob is labelled **`speed (0=turret)`**
(`index.html:164`). The kite stance is half the **chain battery, which is where
the level curve comes from** — so the moment `auraAlwaysOn` reads `role`, an
un-migrated sim stops modelling a fight and the curve moves. Chunk 2 must carry
role through `MobSpec` → `world.go` → the synthetic definition, and through
`mobSpecOf` (`content.go:313`) for the preset roster. ⚑ **`FireTotem` is the
sharp edge**: an armed structure that is *not* in `guardrailExempt` (unlike
Brazier / PoisonPool / SpikeBarricade / Totem), so it runs `facetankSurvival` in
the guardrail battery on every run. Ruled 2026-07-27: **explicit role in the sim,
no `speed == 0` shorthand** — an inference in the balancing harness is worse than
one in the model layer, not better (see L4).

**L10 — a `structure` with a support aura has a sensor, and dropping its dummy
`aggroRadius` shrinks it.** `Campfire` (heal) and `WarbannerTotem` (shield) carry
support auras, so `refreshSensorMask` widens their sensor to `LayerCombatants`
and `updateSupportTarget` reaches `aggroRadius + targetRadius` (`support.go:109`).
Deleting the `0.1` dummy makes that a point sensor. **Inert** — both are
velocity-0 and always-on, the same pair of reasons round 5 pinned
campfires/totems as inert pacifists — but it is the chunk's only non-identity, so
pin it instead of assuming it. It also means the 50-mob preset roster is
**deliberately not byte-identical**: 12 rows move in the `aggroRadius` column
(the 10 structures to 0, plus the two follower dummies to an authored 3.5 under
D1) and nothing else.

**L11 — a passive faction's aggro sensor is BLIND, so "approach is aggro" needs
one extra line.** `refreshSensorMask` (`mob.go:651`) derives the sensor mask
from the *aggro* mask, and `aggroSensorMask(0)` returns `LayerNoneCollision`
(`mob.go:669`). A friendly NPC aggros nothing ⇒ its sensor reports nothing ⇒ the
NPC is silently mute, **with every unit test of the node evaluator still green**.
Chunk 3a must widen a conversant's mask to include `LayerPlayerCollision`,
mirroring the support-carrier widening two lines above in the same function. Pin
it directly (§6a.9) — this is the single most likely way 3a ships broken.

**L12 — the NPC's body goes from STATIC to DYNAMIC, and its layer must be
authored.** Today `addNpcEntity` registers the visual body via `AddStaticBody`
with `PlayerStatic|MobStatic|Viewport` (`npc.go:80`); as a mob it is a dynamic
shape from `Bodies()[0]` with whatever `body.collisionLayer` says — and the mob
**default is `Viewport|Action`** (`mob.go:150`), i.e. walk-through *and*
aura-targetable, the exact opposite of an NPC on both counts. Author
`collisionLayer: 97` (1+32+64) — today's bits verbatim, pointedly without
Action(2). The dynamic-body-blocks-the-player half is already proven live by
`Bramble` (layer 99), so the pattern is not new; only the missing Action bit is.

**L13 — the zone editor authors the teaching payload per PLACEMENT.** It is not
a viewer: `_ZoneEditorPanel.ts` has a full NPC form (sprite select, radius,
tooLowLine, lore lines, an add/remove teaching list) backed by `ZoneModel`'s
`ZoneNpc`/`ZoneTeaching` and a `zoneEditor_npcControls` block in
`groundTexturePanel.html` — ~127 `npc` references across four files. Moving
`interaction` onto the definition **removes that authoring surface** (D1 deletes
the mode rather than reworking it), so teachings become JSON-edited content like
every mob's skills, drops and resistances already are. PO-visible workflow
change, ruled 2026-07-27.

**L14 — the simharness preset roster grows by 14 rows; the guardrail battery
does not care.** `loadPresets` (`content.go:104`) builds the explorer roster
from the **real authored content**, so every new NPC definition appears in it —
50 → 64. Harmless but not byte-identical, and worth predicting so it does not
read as a regression. The guardrail battery is genuinely unaffected: unarmed
defs are skipped at `guardrail_test.go:214`
(`spec.Aura.DamageHP == 0 && spec.Aura.DotHP == 0 → continue`), and all 14 are
`skills: []`. The sim battery itself stays byte-identical for the usual reason
(L4: the sim never loads authored content).

**L15 — `E` is already the cooldown-slot-2 hotkey, and so are `Q` and `F`.**
`Controls.ts:57` — `cooldownHotkeys = [KeyCodes.Q, KeyCodes.E, KeyCodes.F]`.
**This plan's own pre-3b recommendation ("recommend `E`") would have silently
double-bound the key.** D9 resolves it by moving cooldown slot 2 `E` → `R`,
which the *"[PLACEHOLDER bindings until a keybinding UI exists]"* comment above
that line sanctions — but it is a muscle-memory change for anyone already
playing, so it belongs in the in-game checklist, not just the diff. Free letters
after the move: `T`, `G`, `X`, `C`, `V`, `Z`, `Space`. ⚑ Second half of the same
landmine: putting interact on `Controls`' edge-triggered hotkey path inherits
the dead-spectator guard (`Game.state !== PLAYING`) for free but **not**
chat/console suppression — that lives in `KeyboardManager`, so "press `E` with
the chat box open" is an explicit test case, not an assumption.

**L16 — `ServerMessageBody` is positional and unpinned too, not just
`ClientMessageBody`.** `server.fbs:417`. §28 Chunk 3 pinned `EntityType` and
`StatusEffect` with explicit permanent values; **neither union got the same
treatment**, so a reorder in either direction silently remaps every message type
and nothing but discipline stops it. 3b-i deliberately keeps the landmine
unexercised on the server side — D10's in-range signal is a `GameState` field,
not a new union member — but 3b-ii's node payload will be tempted to add one.
Ask first whether it can ride `GameState`. If a member is genuinely needed,
**pin both unions' values explicitly in the same change** rather than adding one
more positional entry.

**L17 — the interact sensor is one tick stale, and overlapping sensors need a
tie-break.** `InteractionSystem` (priority 20) reads `Sensor().Collisions()`,
which is the *previous* tick's broadphase result (`PhysicsSystem` is priority
0) — 3a documented this and it is exactly what approach detection wants. For a
prompt it is imperceptible at 30 Hz, and it is **deliberately also what the
server validates an incoming `Interact` against**: one comparison to the value
the client was actually told, not a second geometry implementation that could
disagree with the badge. The one-tick grace is forgiving in the player's favour.
⚑ Where two conversants' sensors overlap (a town square), the stamp must pick
one deterministically — **nearest by centre distance**; otherwise the badge
flickers between them as map iteration order changes. ⚑ **[audit] do the
tie-break on the player, not in a scratch map** — see §6b.3 step 6.

**L20 — [audit] inside `InteractionSystem.Update`, the stamp must precede the
drain, and getting it backwards refuses every keypress.** `ResetTickNumbers`
(`StatusEffectsSystem`, priority **101**) zeroes `interactableEntityID` at the
top of every tick, *before* `InteractionSystem` (priority 20) runs. So a drain
placed at the top of `Update` — which is the natural thing to write, because it
is exactly what `EquipSystem.Update` does (`equip.go:58`, handlers first, no
per-tick state to rebuild) — validates each incoming `Interact` against a field
that is still 0, and **every interaction is silently refused.** The sensor loop
must rebuild the stamp first, the drain second, in the same `Update`. This is
L18's sibling: both are ordering traps whose symptom is "the key does nothing",
both are invisible to the evaluator suite, and neither shows up in a build.
Pin it with a test that stamps and interacts in one tick.

**L18 — an `interact` actor must be skipped by the rising-edge grant path, or
it grants twice.** The `seen` map keeps running under 3b-i — it is what drives
the prompt — so the guard goes on the `evaluate()` **call**, not on the map.
Without it, walking up to an NPC grants the skill (approach path) and pressing
`E` grants it again (interact path); the second is a harmless no-op today only
because `HasDiscovered` short-circuits, which means **the bug presents as
something other than a double grant.** This is why §6b.6 forbids splitting the
table entry from the guard.

⚑ **[audit] the predicted symptom was wrong, and the real one hides better.**
This entry said the misfire would read as *"the conversation is empty when I
press the key"*. It would not: **all 14 conversants author node `lines`**
(verified 2026-07-27 — every one has `lines ≥ 1`, so `evaluate()`'s lore
fallback can never return empty for them). The actual presentation is **"the NPC
still ambushes me on walk-up, and `E` then just repeats its lore line"** — 3a's
behaviour plus a key that appears to work. That is harder to catch in a smoke
run than silence, because a bubble fires on both paths. So do not test the guard
by pressing `E`: **walk into range and assert nothing was granted.**

⚑ **[audit] a second-order note on D14's rationale.** D14 keeps `approach` partly
on the grounds that "the machinery behind it is what drives the prompt". Precise
version: the **sensor loop** drives the prompt, and it is unconditionally live.
The **`seen` map** does not — it gates `evaluate()` on the approach path only,
which after D11 has zero content users. D14's conclusion still stands (~5 lines,
an obvious future want), but the `seen` map specifically is dormant after 3b-i,
and a reader looking for "what keeps this alive" should not expect to find it in
the prompt path.

**L19 — the badge's anchor cannot read the wire radius.** 3a's own finding: mob
sprite classes size from `GraphicsConfig` and ignore `Mob.radius`, while NPCs
(which came off the Resource path) size from the wire — which is exactly how a
permanently-unwritten `radius` stayed invisible for the life of the project.
So "above the sprite" is only one expression if the badge measures the rendered
container, not either input. Anchor off the sprite's bounds.

⚑ **L18 and L20 both go away in 3b-ii** — D18 deletes the trigger enum, and with
it the guard L18 exists to protect. They stay recorded because the *class* of
bug (an ordering trap inside one `Update`, presenting as "the key does nothing")
outlives the specific guard: 3b-ii's session and hold passes are written into the
same `Update`, in the same order-dependent way. L20's stamp-before-drain rule
still binds.

**L21 — a presented option index is NOT its authored index.** `present()` omits
already-known options and condition-failed nodes, so the panel's third row can
be the definition's fifth option. If the client echoes its own row position, a
player learns the wrong skill — and it only misfires *after* they have learned
something, which is exactly when nobody is looking any more. The wire therefore
carries the **authored** `option_index` / `grant_index` explicitly (§6b.14), and
`applyGrant()` indexes the definition, never the presentation.

**L22 — the mob loader is not strict, so deleting `trigger` from Go leaves 14
lying keys.** `definitions.go:284` is a plain `json.Unmarshal`; unlike
`world/zone.go:244`, `props.go:113` and `factions.go:184`, it does **not** call
`DisallowUnknownFields`. So after D18 removes the field, every conversant keeps
authoring `"trigger": "interact"` and boot stays green while the key means
nothing. Strip the content in the same step as the Go change (§6b.17 step 2) and
pin it with a raw-JSON content assertion — the loader cannot give you that one.

**L23 — the hold flag is one tick stale by construction, and that is fine.**
`InteractionSystem` and `MobSystem` share priority **20**, so within a tick their
order is registration order, not design. An actor can therefore take one extra
33 ms step after a conversation opens or ends. Build nothing on same-tick
ordering here; the visible behaviour is "it stops", and one frame of drift is
imperceptible. (The sensor is *already* a tick stale by design — L17.)

**L24 — the reply the panel shows is optimistic.** `present()` ships each row's
`reply` inside the tree so the NPC answers instantly on click (§6b.12), which
means the client speaks **before** the server has applied anything. That is
correct only while a refusal is impossible-by-construction: the row's state was
computed by the same server from the same spellbook one tick earlier, and
nothing but the player's own action changes it. Do **not** add a
refusal-message wire path to "fix" this — add a test that the row states and
`applyGrant()`'s validation cannot disagree.

**L25 — the panel shares its column with the cast bar and the action bars.**
`#bottomCenter` (`HUD.less`, `bottom: 1rem; left: 50%`) stacks `#castBar` above
`#actionBars`, and the cast bar **appears and disappears** with a running cast.
A panel anchored relative to that stack will jump every time somebody casts.
Anchor it to a fixed offset that clears the whole stack, and check it with a
cast running — the bug is invisible in a still screenshot.

**L26 — talk range is ~1 unit today, and 3b-ii makes leaving it *end* something.**
No conversant authors `interaction.range`, so `SenseRadius()` falls back to
`aggroRadius: 1.0` on all 14. Under 3b-i that only governed when a badge lit;
under D21 it also governs when a conversation is **torn down**, so a range this
tight makes the panel fragile to ordinary shuffling — and D22 adds an actor that
walks away on its own. Author a real `range` [PLACEHOLDER 2.0] on the
conversants and let the PO tune it in-game. ⚑ For the harness this compounds
3b-i's finding that a **fixed walk duration cannot reach these actors**: step in
0.5 s bursts and stop on the badge, now against a moving target.

---

## 9. Test strategy

| chunk | pins | acceptance |
|---|---|---|
| **1a** | TDD red-first: mob + Hardy has more HP · mob + Tough takes less damage · mob + Swift moves faster. All **behavioural** (L6). Existing guardrails `-count=2`. | `go test ./...` green; **sim battery + level curve + pack matrix byte-identical** to a stashed baseline (no mob authors a passive, so identity is provable) |
| **1b** | summon HP/output pins at 2–3 owner levels; max-HP recompute clamps current health | sim battery **re-run and deltas recorded**; PO signs the summon numbers |
| **2** | loader rejects an unknown `role`, absent → `creature`, `aggroRadius` optional only for `structure`; **speed>0 + `structure` is always-on** and **speed-0 + `creature` gates** (proves the read moved off speed); owned-`structure` ≠ follower; content pin on all 50 roles | boot `-content ../api` clean with the pinned counts (**the real gate — L4**); sim battery/level curve/pack matrix byte-identical vs a `git worktree` HEAD build; preset roster moves in **exactly 10 `aggroRadius` cells** and nowhere else (L10) |
| **3a** | port all 373 lines of `sys/npc_test.go` onto the node evaluator (order + `blockedLine` gate + lore fallback); **a passive-faction conversant senses a player** (L11); 0 damage + no hostile acquisition on an NPC body (D5); the 9 loader rejections of §6a.2; content pin on all 14 defs incl. teaching order vs the pre-migration zone JSON | boot `-content ../api` clean with **mobs 50 → 64 · spawns 471 → 485 · factions 14 → 15 · the `placed npcs` line gone**; sim battery byte-identical and the preset roster **+14 rows, no cell moved** (L14); headless smoke (teach / blocked / lore); **screenshot** (bars are accepted per D3 — the shot is for sprite, size, layer, ring) |
| **3b-i** | invert `TestParseTrigger_InteractIsNotAuthorableYet` (the opening red); the **373-line evaluator suite stays green untouched** — 3b-i moves *when* `evaluate()` runs, never what it does, so any diff there is a bug in the split; an `interact` actor does not grant on the sensor edge (**L18**); an `Interact` naming an un-signalled actor is refused; `interactable_entity_id` stamped/cleared per tick and nearest-wins on overlap (**L17**); reply private to the interactor while `approach` still fans out (D13); `GameState` codec round-trip on the new field; content pin that all 14 author `interact` | boot `-content ../api` clean with the 3a counts unchanged (**83 skills / 15 factions / 64 mobs / 485 spawns**); **sim battery byte-identical — required, 3b-i moves no number**; frontend typecheck + vitest + prod build; in-game: badge on approach with **nothing said**, `E` teaches, walk away → badge gone, return → re-triggers; Emberkeeper's 3-grant walk still stops at the first gate; `R` fires cooldown 2 and `E` no longer does; `E` with the chat box open does nothing (**L15**) |
| **3b-ii** | **the 373-line evaluator suite is REWRITTEN**, not preserved — D17 retires the walk it pins. New: `present()` mutates nothing (the split's whole point) · condition-failed node omitted *and* its inbound options hidden · known hidden / too-low locked with its level · a legacy multi-grant option expands to one row per grant · **emitted indices are the AUTHORED ones (L21)** · `applyGrant()` grants exactly one and refuses range/node/index/level/known · session ends on range loss, on either party entering combat, on death and on disconnect · the actor holds position and resumes (L23) · `ambient` fires once per rising edge and fans out · loader rejects an option with neither grant nor `next` · **raw-JSON pin that no file authors `trigger` (L22)** · `GameState` codec round-trip over the nested `Conversation` tables · vitest over the DOM-free navigation model | boot `-content ../api` clean with the 3a counts (**83 skills / 15 factions / 64 mobs / 777 props / 485 spawns / 5 campfires**); sim battery byte-identical **except** a possible `Wanderer` row in the preset roster (L14/D22); frontend typecheck + vitest + prod build; in-game: `E` opens the panel, Ignite locked at *level 7* refuses with its authored line, Torch teaches **only Torch** and its row vanishes, Back returns, Leave closes, walking out of range closes, **being hit closes**, the `Wanderer` stops to talk and walks on after, the `TownCrier` calls out its ambient line **without** opening anything |

Backend gate every chunk: `go build ./...`, `go vet`, `go test -timeout 60s ./...`,
guardrails `-count=2`, boot `-content ../api` with 0 errors / 0 panics and the
content counts recorded.

---

## 10. Open questions (not blocking; resolve in the owning chunk)

1. ~~**Does a `structure` ever change level?**~~ **RESOLVED in 1b: yes,
   mechanically, and it is not special-cased.** A structure reads `Level()` like
   any other actor; an owned one (FireTotem, Totem) stands at its owner's level,
   an authored one at its `curveLevel`. Nothing tests for `speed <= 0` on this
   path.
2. **Should non-players get a base crit chance?** (gap 2 remnant) `casterCritChance`
   explicitly special-cases `model.PlayerEntity` for the flat base. Under decision 1
   the *passive* half already converges; the flat base is a separate design call.
   Not needed for any chunk here.
3. ~~**Do the 14 NPCs stay a distinct `zone.npcs` section or fold into
   `spawns`?**~~ **RESOLVED (PO 2026-07-27): fold into `spawns`** — §6a.5 / D1.
   `zone.npcs` and the editor's whole NPC mode are deleted; teachings become
   JSON content (L13), and facing/patrol come free.
4. **`Autoattack`** (parked in §31 as blocked on gap 3): decision 2 unblocks it.
   Re-raise as content after Chunk 1. Note the standing design rejection of a
   universal auto-attack for **players** — it would defuse the "choosing the
   Lantern costs you all your damage" trade-off the zone-1→2 tunnel is built on.
5. **The journal / quest ledger itself.** Deliberately out of scope; the typed
   grant list is the only thing this plan owes it.
6. ~~**Do the 2 legacy proving-grounds Sages migrate or drop?**~~ **RESOLVED
   (PO 2026-07-27): DROPPED** — D2. `proving-grounds.json` loses its `npcs`
   section entirely; 14 definitions, not 16. `NpcPlaceholder` keeps its pinned
   enum value and sprite class as an authorable "art not drawn yet" entityType.
7. ~~**Summon level: assigned at spawn or tracked live?**~~ **RESOLVED in 1b
   (PO 2026-07-26): tracked LIVE** — `Level()` reads the owner's current level,
   with no synced field (§11). The recommendation was taken.
8. **What aggro radius do `Companion` and `SoldierCompanion` get?** (Chunk 2, D1)
   They lose the `0.1` dummy and must author a real value; the plan proposes
   **3.5 [PLACEHOLDER]**, mirroring `MedicCompanion`. Inert today (a non-support
   follower's sensor is read by nothing), so it is a forward-looking number the
   PO can set to anything at execution time.

---

## 11. Chunk ledger

*(filled in as chunks land — one entry per chunk: what was decided inside it,
what shipped, which commit, what was verified.)*

- **Chunk 1a — one derived-stat formula: ✅ DONE 2026-07-26**, backend only,
  10 files + 1 new test file, committed `cf9a10c7`. ⏳ PO in-game check not
  required — see "no runtime surface" below.

  **Shipped, exactly as §7 specified.** Three factor methods on `DerivedStats`
  (`skills/component.go`): `MaxHealthFactor` / `DamageReductionFactor` /
  `MovementSpeedFactor`. Player migrated onto them (`player.maxHealthFactor`,
  `player.takeDamage`, `core/input.go:343`) with no behaviour change; `*Mob`
  now reads all three. Plus the two riders: `game.mob.walkingSpeedPerTick`
  (**0.055 preserved** — the L1 landmine held, the player's 0.05 was never
  adopted) and `Level()` on `*Mob` with `PowerScale()` derived from it.
  `Derived.Resistances` untouched, as the code audit deferred it.

  **3 decisions taken inside the chunk:**
  ① **Every pool cap goes through `MaxHealth()`**, not just the getter — the
  out-of-combat regen target, `Heal`'s `AddCapped`, `HealthRatio` and the
  full-health participant reset. Applying the factor to the getter alone would
  have widened the number on the wire while the mob still could not heal past
  its base pool. The stored `m.maxHealth` is now explicitly the **base** pool,
  which is the shape 1b generalizes. The full-health comparison moved `==` →
  `>=` for the same reason (a shrinking factor must not strand it).
  ② **The DR clamp lives inside `DamageReductionFactor`**, so no call site
  re-checks it; the player's inline `if r > 1 { r = 1 }` is gone.
  ③ **The speed factor applies at `stepLength()`, the consumption site** — not
  folded into the stored `velocity`, which is set once at construction and
  would freeze whatever loadout the mob spawned with. Same shape as the
  player's `core/input.go` site.

  **⚑ One plumbing step the plan flagged and it was real:** deriving
  `PowerScale()` live needed `curve.Curve` threaded into `MobDefinition` (the
  registry retained only the resulting float). The zero-value curve is neutral
  at every level, so hand-built sim/test definitions read 1 exactly as the old
  `PowerScale <= 0 → 1` guard did — the guard is gone, not replaced. A mapper
  that forgets to set `Curve` would silently flatten every mob to 1, so the
  registry test pins the field.

  **Verified.** TDD **red first on all 3 behavioural pins** (`0x0` vs `0x32`
  pool, `0x3c` vs `0x46` damage, 0.055 vs 0.0825 distance), all asserting on
  HP pool / damage taken / distance moved — never on `Derived` (L6). Plus pins
  for `Level`/`PowerScale`, the new knob's default + non-positive
  normalization, and the mapper's retained curve. `go build ./...` and
  `go vet ./...` clean · `go test -timeout 120s ./...` **exit 0, 27 packages** ·
  simharness guardrails **`-count=2`** · alloc guardrails **`-count=2`** (the
  new multiply sits on the per-tick `steer` path) · boot `-content ../api`
  **0 errors 0 panics 0 warnings**, 83 skills/14 factions/50 mobs/10 recipes/5
  prop defs/1 milestone/777 props/471 spawns/5 campfires/14 npcs, with the new
  `mob.walkingSpeedPerTick: 0.055` in the tuning-knob log line.

  **⭐ Acceptance criterion met: sim battery + level curve + pack matrix are
  BYTE-IDENTICAL** to a baseline captured before the first edit (TTK 6.67s /
  TTD 8.70s unchanged). That identity is the whole point of opening with 1a —
  1b's real balance deltas now measure against a clean baseline.

  **No in-game check requested:** nothing is player-visible, because no mob
  authors a `stat_multiplier` passive — which is exactly the property that
  makes byte-identity provable. Mob movement and damage are driven end-to-end
  by the sim through the real `mob.NewMob`.

- **Chunk 1b — dynamic levels + summon collapse: ✅ DONE 2026-07-26**, backend
  + 6 content JSONs, 30 files + 1 new test file, committed `ee01ccdb`.
  ⏳ PO in-game check not required — the world side is smoke-verified below and
  the summon numbers were signed off *before* the code, at design time.

  **2 PO decisions, taken up front against the real numbers** (choice prompts,
  2026-07-26):
  ① **Pure curve, authored bases unchanged** — a summon's pool is
  `baseMaxHealth × f(ownerLevel)`, and the flat `maxHealthPerOwnerLevel` knob is
  **retired from the schema and the 6 summon skills**, not kept alongside. An
  authored key the engine ignores is worse than no key, so it is rejected by the
  loader with a migration hint (`renamedEffectKeys`), the `factors.maxHealth`
  precedent.
  ② **Summon level tracks the owner LIVE**, not snapshotted at spawn: a
  companion whose player levels mid-fight keeps up. This is what a summon's
  *output* already did (`casterPowerScale` read the owner live); 1b makes its
  *body* consistent with it rather than the reverse.

  **⭐ The finding that made the sign-off easy: OUTPUT DOES NOT MOVE AT ALL.**
  All 6 summon mobs are authored `curveLevel: 1`, so today's product is
  `f(1) × SummonPower × f(ownerLevel)`. Setting `Level = owner.Level` turns the
  summon's own `PowerScale()` into `f(ownerLevel)`, and dropping
  `× owner.PowerScale()` from `casterPowerScale` reproduces the old product
  exactly — verified at L1/5/10/15/20/25/30 (1.0000 / 1.8882 / 4.0210 / 8.3081 /
  16.7949 / 33.3930 / 65.5373 on both sides). L3's double-apply is therefore
  avoided by removing one factor, not by retuning. `SummonPower` survives as
  what it always was: the linear per-skill specialization knob.

  **The balance delta is HP, and it is large by design** — `+2/owner level` flat
  → the curve:

  | summon (base) | L1 | L10 | L20 | L30 |
  |---|---|---|---|---|
  | Companion / FireTotem (60) | 60 → 60 | 78 → 166 | 98 → 517 | 118 → **1605** |
  | Shieldbearer (90) | 90 → 90 | 108 → 250 | 128 → 775 | 148 → **2407** |
  | Soldier (55) | 55 → 55 | 73 → 153 | 93 → 474 | 113 → **1471** |
  | Medic (45) | 45 → 45 | 63 → 125 | 83 → 388 | 103 → **1204** |
  | Totem (50) | 50 → 50 | 68 → 139 | 88 → 431 | 108 → **1337** |
  | *player pool, for scale (base 100)* | *100* | *277* | *861* | *2675* |

  The flat knob left a companion at ~4 % of a same-level player's pool at L30;
  the curve holds it at a constant fraction (60 % for the Companion) at every
  level — the "same-tier-relevant" property output already had.

  **Shipped.** `MaxHealth()` is now fully derived —
  `HP(baseMaxHealth × f(Level) × Derived.MaxHealthFactor())` — the same three
  factors the player's pool is derived from. `Level()` returns the owner's
  current level when owned, else the authored `curveLevel`. **The registry stops
  pre-deriving**: `Factors.MaxHealth` (derived) → `Factors.BaseMaxHealth` (the
  authored baseline verbatim), and the frozen `MobDefinition.PowerScale` field is
  **deleted** — `Curve` + `CurveLevel` already carry it, and a second
  representation of f(curveLevel) is exactly the drift this plan exists to
  remove. `RaiseMaxHealth` is gone; `RestoreToFullHealth()` replaces it at the
  spawn site.

  **4 decisions taken inside the chunk:**
  ① **The variance roll moved onto the BASE pool** and is stored unrounded
  (`baseMaxHealth float32` = authored × roll), so variance and curve compose in
  either order and the pool rounds exactly once, in `MaxHealth()`.
  ② **`Level()` derives from the owner rather than a synced field.** The plan
  said "a live field defaulting to curveLevel"; a settable field would need a
  system to push owner level-ups into every summon each tick, and nothing else
  wants to set a mob's level today (YAGNI). Reading the owner IS live, with zero
  plumbing. A `SetLevel` can be added the moment a consumer exists.
  ③ **The shrink clamp lives in `Update`** — a derived pool can now shrink
  (unequipped passive), and health above the cap would render as an over-full bar
  and hand out free effective HP. Growth is deliberately *not* mirrored: current
  health stays absolute and regenerates up, exactly like the player's.
  ④ **The spawn site refills explicitly** (`SetOwner` → `RestoreToFullHealth`)
  rather than `SetOwner` doing it as a side effect or `Heal` doing it (which
  would pop a floating heal number on every summon).

  **⚑ One trap the sim harness would have hidden:** `mobSpecOf` reads authored
  definitions, so with the pre-derivation gone it has to apply `f(curveLevel)`
  **and round it** — the live pool rounds through `vitals.HP`, and an unrounded
  preset would have modelled mobs the server cannot spawn. Caught by diffing the
  `/mobs` preset roster against a HEAD build, not by any test.

  **Verified.** TDD **red first on all 4 behavioural pins** — each verified by
  reverting the specific mechanism and watching the pin fail: owner-tracking
  (`TestMob_OwnedSummon_LevelTracksItsOwnerLive`, `TestCooldown_SpawnAdds…`),
  the curve on the pool (`TestMob_MaxHealth_RidesTheCurveAtItsLevel`,
  `TestNewMob_VarianceRollsAroundTheCurvedPool`), the shrink clamp
  (`TestMob_Update_ClampsHealthToAShrunkPool`) and the un-doubled output
  (`TestApplyDamageAura_OwnedCaster_ComposesOwnerCurveScale`). All assert on HP
  pool / damage dealt / level, never on `Derived` (L6). `go build ./...` and
  `go vet ./...` clean · `go test -timeout 180s ./...` **exit 0, 27 packages** ·
  simharness guardrails **`-count=2`** · alloc guardrails **`-count=2`** (the
  derived pool adds a `math.Pow` to the per-tick regen path — no allocation) ·
  boot `-content ../api` **0 errors 0 panics 0 warnings**, 83 skills/14
  factions/50 mobs/10 recipes/5 prop defs/1 milestone/777 props/471 spawns/5
  campfires/14 npcs.

  **⭐ Sim battery, level curve, pack matrix AND the 50-mob preset roster are
  BYTE-IDENTICAL** to a binary built from HEAD (`git worktree`, not a
  remembered number): TTK 6.67s / TTD 8.70s. That is the expected result and it
  is evidence, not a null: the sim contains no summons, and the world-mob half
  of the change re-derives the same pool the registry used to freeze. **Every
  number that moved is a summon number, and every summon number was priced
  before the first edit.**

  **In-game smoke** (`scratchpad/chunk1b-smoke.mjs`, world zone): joined, warped
  into the 7-wolf cluster at (−64, 8), pack gathered and chased — **0 console
  errors, 0 WebGL context losses**, health bars render, player 100/100. That
  path is the one worth smoking: `MaxHealth()` is now evaluated per read for
  every mob, every tick, on the wire. ⚑ The first run hit a §29 lost context
  (1 in ~6, the client said so itself); the retry was clean.
- **Chunk 2 — the authored role discriminator: ✅ DONE 2026-07-27**, planned and
  executed in one session (§5 is the plan, this is the ledger), backend +
  content, 42 files + 5 new, committed `0be771bd`. ✅ **The follower half is now
  HARNESS-VERIFIED in-game (2026-07-27)** — the gap "not covered" below describes
  is closed by the new `.claude/skills/verify/chunk2-follower.mjs`, which drives
  the aura panel with real clicks and so exercises the summon path end to end for
  the first time: 6/6, the companion trails at **0.8 → 1.44 units** across a
  **9.2-unit** walk, and it fights (`−8`/`−6` on a Wolf and a Boar, **XP 0 →
  70/300**, with every aura slot Empty so none of that damage was the player's).
  ⏳ PO's own sign-off deferred to the single pass after all open chunks land
  (PO 2026-07-27).

  **Shipped as §5 specified.** `mobs.Role` + the `roles` table + `ParseRole`
  (`items/mobs/role.go`) is the single source, resolved by the loader, `NewMob`,
  `sim/world.go` and the `-mob-role` flag alike. The absent→creature default is
  applied **twice** — loader for authored content, `NewMob` for the definitions
  tests and the sim build directly — so a zero-value `MobDefinition` keeps
  meaning what it meant. Three reads retired: `auraAlwaysOn` (field deleted),
  `isFollower()`, and the ten dummy `aggroRadius: 0.1` values. `roleSlots` →
  `loadoutSlots` (D5).

  **The 6 plan decisions all held**, plus one taken during execution: an
  unknown role **panics** in `NewMob` and in `sim/world.go` rather than
  degrading to creature. A silent default there is the exact failure class the
  chunk exists to remove, and both sites are only reachable by a definition that
  bypassed loader validation — the `ResolveEntityType` panic precedent (§27.2.1).
  The two entry points where a human can still be told (`-mob-role`, the decoded
  HTTP request) validate and report instead.

  **⚑ L9 was the finding that resized the chunk, and it was real.** Four sim
  sites used `speed: 0` as a *mechanism*: `chain.go`'s kite pin ("speed 0 keeps
  its aura always on, so it still fights back"), the `MobSpec` doc, the CLI flag,
  and the explorer's `speed (0=turret)` label. Left un-migrated, every kite-row
  mob stops fighting back and the **level curve moves**. PO ruling 2026-07-27:
  explicit role in the sim, no shorthand — *"aren't we moving away from speed
  defining what something is?"*. The explorer cost the ~15–20 lines the plan
  predicted: its `KNOBS` table is uniformly `type="number"`, `buildRequest()`
  pushes every value through `parseFloat` (a string ⇒ `NaN` ⇒ the run is
  silently skipped), and the preset-apply loop rounds — both needed a
  string-knob branch, and `STRING_KNOBS` is derived from the table so it cannot
  drift.

  **Content:** 36 creature / 10 structure / 4 follower. All 14 `_comment` blocks
  rewritten — they were *teaching* the retired inference ("speed 0 = aura
  always-on", "owned + moving = follower behavior"). `Companion` and
  `SoldierCompanion` author **3.5 [PLACEHOLDER]** (D1: the key stays required
  for followers); inert today, since a non-support follower's sensor is read by
  nothing. `FireTotem`/`Totem` are now live proof that role and ownership are
  orthogonal: structures **with** an owner.

  **Verified.** TDD red-first, and the pins are the interesting part: each
  authors a role that **contradicts** the old inference — a **speed-0.7
  structure** keeps its aura on, a **speed-0 creature** gates it, an **owned
  structure** does not follow — so they cannot pass against a speed read. Plus
  the 50-def role census and the sensor rule (`role_content_test.go`).
  `go build`/`go vet` clean · `go test -timeout 120s ./...` **exit 0, 27
  packages** · simharness + alloc guardrails **`-count=2`** · boot
  `-content ../api` **0 errors 0 panics 0 warnings**, 83 skills/14 factions/50
  mobs/10 recipes/5 prop defs/1 milestone/777 props/471 spawns/5 campfires/14
  npcs — **the real gate here** (L4: the sim never loads authored content).

  **⭐ Sim battery, level curve, pack matrix AND the chain battery byte-identical**
  to a binary built from HEAD (`git worktree`); the only JSON delta is the new
  `role` key echoed into the artifact. **The kite row is identical, which IS L9
  holding.** The 50-mob preset roster moves in **exactly 12 cells, all
  `aggroRadius`** (10 structures → 0, the 2 follower dummies → 3.5) — the
  predicted L10 delta, and nothing else moved.

  **In-game smoke** (`.claude/skills/verify/chunk2-roles.mjs`, kept): 3/3, **0
  console errors, 0 WebGL context losses**. Campfire **+46 HP in 8 s** where
  regen alone gives ~8 — the *rate* is the evidence, not "HP went up"; poison
  pool kills an idle player unprovoked; bramble stops a 3.2-unit walk at the
  computed wall face (−5.95). ⚑ **Two harness traps cost a rerun each and are
  now comments in the script:** the dev console input calls `stopPropagation()`
  on keydown, so WASD is swallowed while it holds focus — the first bramble run
  "passed" while the player never moved at all — and **screen-up is DECREASING
  world y**, so `w` walks *away* from a wall at a higher y. Also: warping onto a
  tree strands the player against it, so the approach point must be chosen from
  the zone JSON, not guessed.

  **Not covered in-game: the follower half.** Summoning a companion needs a
  cooldown equipped through the aura panel, which the headless harness handles
  badly. Pinned by the Go suite instead (the whole `companion_test.go` set,
  `role_test.go`'s four follower/owner pins, and `TestCooldown_SpawnMovingSummon…`).
  **PO check when convenient: summon a companion, confirm it trails you and
  fights what you fight.**
- **Chunk 3a — the NPC merge: ✅ DONE 2026-07-27**, planned and executed in one
  session (§6a is the plan, this is the ledger), backend + frontend + content,
  26 files changed + 15 new, 4 deleted, **−800 lines net**, committed
  `ba124ceb`. ✅ **HARNESS-VERIFIED in-game 2026-07-27** — `chunk3a-npc-merge.mjs`
  6/6 re-run green, plus the new `npc-portraits.mjs`: Farmer/Hermit/TownCrier/
  Emberkeeper render at correct size (the scale-`[0,0]` wire gap has not
  returned), **health bars present** (D3 as accepted) and **no nameplates** —
  while `Turnip 1`/`Boar 2`/`Stag 1` plates render in the same frames, so the
  gating is proven by an in-picture control rather than assumed. ⏳ PO's own
  sign-off deferred to the single pass after all open chunks land (PO
  2026-07-27); the **zone editor** half (D1) is untouched by the harness and
  stays manual.

  **`model/npc` is gone.** A teaching NPC is an ordinary actor whose definition
  carries an `interaction` block, placed as an ordinary spawn. Deleted outright:
  `model/npc` (122 + 101 test), `model.NpcEntity`, `model.Teaching`,
  `npc.SpriteFor`, `game.addNpcEntity` + its `AddEntity` case (the §24 matrix
  loses a helper), `world.Npc` + `world.Teaching` + the whole `zone.npcs` section
  and its five validations, `aurad.go`'s NPC boot loop, `sys/npc.go`, and the
  zone editor's entire NPC mode. `sys/npc.go` → `sys/interaction.go`.

  **⭐ The pilot (§6a.7 step 5) paid for itself immediately — and found a latent
  wire gap, not a chunk bug.** The migrated Farmer arrived, spoke, taught and
  attributed correctly, and rendered as **nothing**. A scene-graph probe found a
  valid 120×120 texture at `scale = [0, 0]`: **`Mob.radius` has been in
  `server.fbs` since the beginning and the server never wrote it**
  (`MobAddRadius` was absent from `MobEntityFlatbufMarshal`). Every mob sprite
  class sizes itself from `GraphicsConfig` and ignores the wire value, so a
  permanent 0 was invisible for the life of the project — until the merged NPCs,
  which size from the wire the way they always did on the Resource path. One
  line in `codec/mob.go`, pinned by `TestMobMarshalFlatbuf_Radius`. **No existing
  mob is affected** (they all still ignore it). ⚑ Generalizable: *a schema field
  nothing reads is not proof the server writes it.*

  **⚑ A forced sequencing change the plan did not predict.** `zone.go`'s "an NPC
  may not wear a mob sprite" guard fires the *instant* the 14 definitions exist —
  its premise ("NPCs ride the Resource path") is precisely what this chunk
  repeals — so it had to be deleted at step 2, not at the step-7 deletion pass.
  Consequence: the pilot's both-paths-live window is narrower than §6a.7
  imagined, though the per-`EntityType` client table still made the one-NPC
  pilot work exactly as intended.

  **4 PO rulings (2026-07-27), all taken before the first edit** — D1 placement
  folds into `spawns` (the editor's NPC mode deleted, not reworked) · D2 the 2
  legacy Sages **dropped**, 14 definitions not 16 · D3 **health bars on NPCs
  accepted** (*"they can now also act in the world … most will not act but they
  can"*), so `initHealthBar` is untouched and L5's open half closed with zero
  frontend work · D4 **role `creature`**, not `structure`. Plus three taken
  inside the chunk: D5 unattackability is now **two authored knobs** (faction
  `friendlyToPlayers` + a body layer without the Action bit) rather than a
  structural property of a type, so a killable NPC is a JSON edit · D6
  `trigger: "interact"` **hard-fails** until 3b · D7 `interaction.range` optional,
  sensor = `max(aggroRadius, range)`.

  **⚑ L11 was real and is closed.** `aggroSensorMask(0)` returns
  `LayerNoneCollision`, so a passive faction's sensor sees nothing — a merged NPC
  would have been **silently mute with every evaluator test green**.
  `refreshSensorMask` now widens for conversants, mirroring the support-carrier
  widening two lines above it, and it is pinned directly
  (`TestNewMob_ConversantSensesPlayersDespitePassiveFaction`), as is the
  narrowness of the widening (a passive non-conversant stays blind).

  **Content.** 14 definitions (ids 51–64) + `api/factions/townsfolk.json`
  (`hostileTo: []`, `friendlyToPlayers: true`). Body `radius 0.35` /
  `collisionLayer 97` (PlayerStatic+Viewport+MobStatic, **deliberately not
  Action(2)**) / `collisionMask 16` / `aggroRadius 1.0` — the pre-merge zone
  `radius` verbatim, which IS the interaction range under D7. `speed: 0`,
  `experience: 0` (nameplate gated for free), `skills: []` (the Turnip/Rockfall
  precedent), `baseMaxHealth: 200 [PLACEHOLDER]`. Four defs share the `Hermit`
  sprite via the `entityType` override (the `proving-*` precedent). **The def
  name is now player-visible** through `"Taught by: X"`, which deleted the old
  authored-name-vs-sprite-name fallback — so the anonymous second Hermit was
  **named `Lamplighter` by the PO**, and `Wanderer_1` lost its placement suffix.
  Frontend: 11 sprite classes moved `Resources` → `Mobs`, keeping
  `resources.trees` as their layer (the `mobs` layers are added to the stage
  *first*, so a new mob layer would have silently put every NPC under the trees).

  **⚑ A pre-merge zone file now fails LOUDLY**, not silently:
  `zone "world.json": cannot parse: json: unknown field "npcs"` — the zone
  decoder's `DisallowUnknownFields`. Worth knowing before the PO opens an old
  editor export.

  **Verified.** TDD red-first throughout; **all 373 lines of `sys/npc_test.go`
  ported** onto the node evaluator rather than rewritten — that port IS the
  chunk's acceptance test. `go build` / `go vet` / `go test -timeout 120s ./...`
  green; guardrails + alloc `-count=2` green; frontend `typecheck` + `vitest`
  (21) + prod build green. **Boot both ways, `-content ../api` AND embedded, 0
  errors / 0 warnings / 0 panics:**
  `83 skills/15 factions/64 mobs/10 recipes/5 prop defs/1 milestone/777 props/485 spawns/5 campfires`
  — mobs 50 → 64, factions 14 → 15, spawns 471 → 485, and the `placed npcs` line
  **gone**. **Sim battery + level curve + pack matrix + chain battery all
  BYTE-IDENTICAL** to a `git worktree` HEAD build; the **preset roster gains
  exactly 14 rows and moves 0 cells** among the 50 survivors — the predicted L14
  delta and nothing else.

  **In-game smoke** (`.claude/skills/verify/chunk3a-npc-merge.mjs`, kept): **6/6,
  0 console errors, 0 WebGL context losses.** Farmer teaches Harvest with the
  authored bubble and a `Taught by: Farmer` banner; **the Emberkeeper's 3-grant
  walk stops at the first gate** — a level-1 player gets Torch@1 and then the
  blocked line for Ignite@7, granting nothing further (one bubble:
  *"Let this be a light for you in dark places.\nFire doesn't suffer the
  careless…"*), which is the ordered walk surviving the move from zone entry to
  definition; ForestSign speaks its lore with no grants at all. Screenshots
  confirm sprite, size, layer, **the accepted health bar, and no nameplate**.
  ⚑ Chunk 2's two harness traps still bite (dev console swallows WASD;
  screen-up is decreasing world y) and are comments in the script. ⚑ New harness
  note: **`window.game` is a small facade** (`run`/`character`/`pause`/`play`) —
  no `EntityManager` on it, so scene-graph work goes through
  `character.plate.parent` and climbs to the root.

  **✅ PO in-game check — HARNESS-DONE 2026-07-27, PO sign-off deferred.** Ruling
  the same day: the PO's own pass happens **once, after every open chunk has
  landed**, not per chunk. Driven headlessly instead — `npc-portraits.mjs` (new,
  kept) frames Farmer, Hermit, TownCrier and the Emberkeeper one at a time in
  clear screen space and pairs each picture with the three assertions worth
  making: correct rendered size, **the health bar D3 accepted**, and **no
  nameplate** — with `Turnip 1`/`Boar 2`/`Stag 1` plates in the same frames as an
  in-picture control. Still manual and untouched by any harness: the **zone
  editor** (D1 — NPC mode gone, NPCs placed with the spawn tool, teachings
  JSON-only), and the taste question a ~10 fps headless run cannot answer —
  whether they *read* right.
- **Chunk 3b-i — the interact verb: ✅ DONE 2026-07-27**, wire + backend +
  frontend + content, 12 modified + 6 new (2 of them tests), committed
  `6368b2e5`. ✅ **HARNESS-VERIFIED in-game 2026-07-27** — the new
  `chunk3b-interact.mjs` (kept) **15/15, 0 console errors, 0 webgl context
  losses**. ⏳ PO's own sign-off deferred to the single pass after all open
  chunks land (PO 2026-07-27).

  **Talking is now something a player DOES.** All 14 conversants author
  `trigger: "interact"`; the sensor that used to open the conversation now only
  *offers* it. `GameState.interactable_entity_id` carries the offer, an
  `Interact` message accepts it, and the server validates the second against the
  first.

  **Shipped as §6b specified, with one step the plan had missed.** `.fbs`:
  `table Interact` appended to `ClientMessageBody` (**value 8**) and
  `interactable_entity_id` appended to `GameState`; **`ServerMessageBody`
  untouched**, so L16 stayed unexercised as D10 intended (both unions gained an
  APPEND-ONLY comment). Server: the `triggers` table entry **plus** the
  `approach`-only guard on the `evaluate()` call, together in one step (L18);
  `sense()` stamps, `handleInteracts()` drains; `speak()` took its audience as an
  argument and grew `speakToSensor()` for the approach path (D13), marshalling
  once and fanning rather than once per recipient. Player: `interactableEntityID`
  + `interactableDistSq`, cleared in `ResetTickNumbers`. Frontend: `E` bound on
  the existing edge-triggered hotkey path, cooldown slot 2 `E` → `R` (D9), and a
  world-anchored key cap on the mob's own shape.

  **⚑ The step the plan missed, and it was blocking: `InteractionSystem` had no
  players.** §6b.3 said the handler "lives in `InteractionSystem` (it owns the
  actor list and the evaluator)" — it owns the actor list and *nothing else*. The
  system is registered only in the **mob** branch of the add-entity matrix
  (`game.go:298`), so there was no queue to drain from and nothing to stamp onto.
  Added on the `EquipSystem` precedent: a `players []interactor` slice behind a
  minimal local interface, `AddPlayer`, a player-branch case, **and a `Remove`
  sweep for players** — without which every disconnect leaks a player and keeps
  draining a dead client's queue. Found by a pre-flight code audit of the plan,
  before the first edit.

  **⚑ New landmine L20, the sibling of L18: inside `Update`, the stamp must
  precede the drain.** `ResetTickNumbers` (priority 101) zeroes the field before
  `InteractionSystem` (priority 20) runs, so a handlers-first `Update` — which is
  exactly the shape `EquipSystem.Update` uses and the natural thing to write —
  validates every incoming `Interact` against 0 and **silently refuses all of
  them**. Both traps present as "the key does nothing", both are invisible to the
  evaluator suite, and neither shows up in a build. Pinned by a test that stamps
  and interacts in the same tick.

  **⚑ L18's predicted symptom was wrong, and the audit corrected it before it
  cost anything.** The landmine said a missing guard would read as *"the
  conversation is empty when I press the key"*. It would not: **all 14
  conversants author node `lines`** (verified), so the lore fallback can never
  return empty for them. The real presentation is *the NPC still ambushes you on
  walk-up and `E` merely repeats its lore line* — harder to catch, because a
  bubble fires on both paths. The test therefore walks into range and asserts
  **nothing was granted**, rather than pressing the key.

  **2 bugs the harness caught that no test could.** ① The cooldown slot 2 key
  hint is authored in **`HUD.html`**, not derived from `Controls.ts` — it still
  read `E`, so the UI would have taught the old key while the code used the new
  one. ② The badge anchor used `bounds.height / 2`, but a mob's shape is **not
  centred on its origin** (Farmer: `y −73.5`, height `115.5`), so the cap landed
  on the NPC's face; it reads `bounds.y` now. That is **L19 biting anyway** — the
  landmine correctly said "measure the container", and measuring the wrong
  property of it still put the badge in the wrong place.

  **Verified.** TDD red first — inverting
  `TestParseTrigger_InteractIsNotAuthorableYet` was the opening move, as planned,
  and `TestMapMobDefinition_RejectsInteractTrigger` inverted with it. The **373-line
  ported evaluator suite stayed green UNTOUCHED**; one call site changed
  (`speak` → `speakToSensor`) and no evaluator behaviour did. ⚑ A first cut
  called `a.Interaction()` twice per rising edge and broke
  `countingConversant`'s call count — hoisting it into a local kept that suite
  untouched, which is precisely the signal the "untouched" rule exists to give.
  New: the approach guard (asserted on the spellbook), stamp-and-interact in one
  tick (L20), an unoffered actor refused, the private reply vs the approach
  fan-out, nearest-wins in both registration orders, the `Remove` player sweep, a
  `GameState` round-trip pair, and 6 vitest cases over the badge's pure targeting
  logic. `go build`/`go vet` clean · `go test ./...` **exit 0** · simharness
  guardrails and alloc pins **`-count=2`** · frontend typecheck + **27 vitest
  passing** + prod build. Boot **both ways** 0 errors 0 warnings 0 panics —
  83 skills/15 factions/64 mobs/10 recipes/5 prop defs/1 milestone/777 props/485
  spawns/5 campfires.

  **⭐ Sim byte-identity was REQUIRED, not merely expected, and it held:** the
  default battery, `-levels`, `-matrix` and `-chain` all diff clean against a
  `git worktree` HEAD build (TTK 6.67s / TTD 8.70s). 3b-i moves no gameplay
  number, so any drift would have been a bug.

  **⚑ Harness finding worth carrying forward: a fixed walk duration cannot reach
  these actors.** The talk sensor is ~1 unit wide and headless walking speed
  swung from ~0.5 to ~1.5 units/s **within one session**, so a walk tuned for the
  Farmer sailed straight past the Emberkeeper — the badge lit and went out inside
  a single burst, reading exactly like "the badge never lit". Two full runs
  failed on it before a position probe showed the overshoot. `walkUntilBadge()`
  walks in 0.5 s bursts and stops on the state flip. Second, smaller: reading the
  cooldown-slot text *after* firing `R` reported the post-`R` state for both
  checks, making a correct PASS read as a contradiction.

  **Not closed by 3b-i:** the dialogue panel (3b-ii); `option.text` and `next`
  still read by nothing; NPC nameplates (D12 chose the bare badge); **L2**
  (`SetFaction` nuking the authored aggro mask). The badge's exact height above
  the sprite is a **[PLACEHOLDER]** — it reads correctly but sits close to the
  head, which is a taste question for the PO pass.
- **Chunk 3b — interact verb + dialogue panel: PLANNED 2026-07-27** ✅ `85afcdb1`
  (design session, no code). Split into **3b-i (the verb)** and **3b-ii (the panel)** —
  §6b is the plan, 7 new PO decisions **D8–D14**, 5 new landmines **L15–L19**.
  **3b-i is now DONE (entry above); 3b-ii is not started.** The planning session's own finding is D9's:
  **this plan had been recommending `E`, which is already the cooldown-slot-2
  hotkey** (L15). Two more that shaped it: the client had **no way to know who
  is interactable** (`GET /mobs` is a minimal projection), resolved as a
  `GameState` field rather than a new message — which keeps `ServerMessageBody`
  out of the change entirely (L16); and `option.text` is **unauthored on all
  14**, which is 3b-ii's content half and part of why the split exists.
- **Chunk 3b-ii — the conversation panel: PLANNED 2026-07-27** (second design
  session, held after 3b-i shipped — the re-plan the old sketch asked for; docs
  only, no code). §6b.9–6b.19 replaces a 20-line sketch with the full chunk plan:
  **9 PO decisions D15–D23 · 6 new landmines L21–L26 · a rewritten test-strategy
  row.**

  ⭐ **The reframe: the panel is a conversation TREE browser, not a teaching
  dialog** — and once that is the target, *everything is an option* collapses the
  feature onto one mechanism the schema already validates and nothing has ever
  read. The PO's brief (three greeting choices · a hint branch that can later
  start quests · a pickable teaching list · a WoW-guard directions list · back
  navigation) needs **no new nesting**: a "list" is just a node whose options
  happen to be one-grant teachings, so branch rows and grant rows are the same
  row, and `next` — authored, load-validated in 3a, read by nothing since — is
  the whole navigation mechanism.

  **The three rulings that delete machinery.** ① **D17 retires the ordered grant
  walk**: a list is not a walk, so clicking *Ignite* teaches Ignite and nothing
  else. ⚑ That costs the **373-line ported evaluator suite**, the one thing 3b-i
  was careful not to touch — it pins the walk. The compensation is that the 11
  NPCs left un-migrated need **zero content work**: `present()` expands their
  legacy multi-grant option into one row per grant. ② **D18 retires `trigger`
  entirely.** ⚑ The finding that forced it: **`trigger` is a single value, so an
  NPC could never both call out as you pass AND open a tree on `E`** — exactly
  the NPC the brief describes. `interaction.ambient` becomes its own field, and
  with the walk gone `approach` has no behaviour left to name. PO asked whether
  it could be reused for quests advancing on approach; ruled no — the reusable
  part is the rising-edge `seen` map and `speakToSensor`, which `ambient` keeps
  alive and exercised, while an approach-fired quest hook would want
  `onApproach: <nodeId>` plus one-shot-per-player-forever semantics a
  per-session map cannot give. **L18 and L20's guard go with it.** ③ **D19 moves
  speech into the panel**, which retires D13's private `speak()` — the reply text
  already rides the streamed tree.

  **D16 is the architectural call:** while a conversation is open, `GameState`
  carries the **whole personalised tree**; the client navigates instantly with a
  local back-stack and only *taking* an option goes to the server. Server state
  is 2 fields with **no node bookkeeping**, because every apply is validated on
  its own merits, never on the path taken to reach it — and `present()`
  serialises all nodes instead of walking them, so authored cycles need no check.
  `ServerMessageBody` stays untouched for the second chunk running (L16), and the
  answer-key objection killed the cheaper catalog-served variant.

  **⚑ 3 landmines worth reading before the first edit.** **L21** — `present()`
  omits hidden rows, so a presented index is **not** the authored one; the wire
  carries authored `option_index`/`grant_index` or a player learns the wrong
  skill, misfiring only *after* they have already learned something. **L22** —
  the mob loader is the one loader **without** `DisallowUnknownFields`
  (`definitions.go:284`), so deleting `trigger` from Go leaves 14 lying keys that
  boot green; strip the content in the same step and pin it with a raw-JSON
  assertion. **L26** — no conversant authors `interaction.range`, so talk range
  is `aggroRadius: 1.0` on all 14; under D21 leaving that range now **tears a
  conversation down**, and D22 adds an actor that walks away on its own.

  **Two rules that need content that does not exist yet:** D22 (an actor in
  conversation holds position) — ⚑ **all 14 conversants author `speed: 0`, so
  nothing patrols today**, and the chunk therefore authors a moving `Wanderer`
  rather than shipping a hold nothing exercises; and D23's 2–3 representative
  trees (Emberkeeper = the teaching list with its 1/7/12 walls, TownCrier = the
  hint branch **plus** `ambient`, Wanderer = the patrol). Ruled **one chunk, not
  a split** — every piece is unverifiable without the others.
