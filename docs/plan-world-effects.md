# Plan: world effects and heir buffs, what an ascension leaves behind

> **Status: DESIGN NARROWED 2026-09-28 (second PO session, D19-D30, §2.2). THE
> WORD IS RULED (*world effect*, D19) and the first build is scoped (D23).
> ⛔ BUILDING IS NOT APPROVED** (PO 2026-09-28: *"Not yet"*). Two things are
> missing, both named by the PO: **the first content** (Q11), and **the buff
> tray, which moves OUT of this plan into a new one** (D30; written AND approved 2026-10-01 as `plan-buff-tray.md`).
>
> ⚑ **The second session changed the shape, not only the scope**: three picks
> at the stone instead of two (D20), the *cause* is retired (D21), and the HUD
> indicator became a buff and debuff tray (D22) that another plan owns (D30).
> §3 is rewritten to match.
>
> Line refs come from two code surveys of the working tree on 2026-09-27
> (HEAD `56ebb5a7` plus the then-uncommitted aura-drawbacks C1). They were NOT
> re-surveyed on 2026-09-28; re-verify before executing.
>
> Origin: the PO, 2026-09-27, verbatim: *"I want to design a system that allows
> ascensions to have server wide and long lasting effects. That could be an npc
> type that is normally not present starts appearing for some time after a
> player ascended with a character. Or the xp gain for every player on the
> server is increased by 1 percent for 24 hours. Or a certain quest becomes
> available for a limited time. Or a mob stops appearing for a limited time."*
>
> **Schema, first build as scoped: DB +1 migration (`000004`, the FIRST
> world-scoped state: 3 tables + 1 column) · wire +1 server message · zone
> format +1 optional spawn key · content +2 directories, +1 condition kind,
> +2 node lists on a stone.** The tray's own wire needs are the tray plan's
> to state. Against the 2026-09-27 design: the `Character`
> wire field (Afterglow), the second spawn key and the quest `window` block
> are OUT of the first build. All numbers [PLACEHOLDER].

---

## 1. What this is

An ascension ends a character and, today, changes nothing for anyone else: the
ceremony is own-player only (ascension D29), no broadcast fires, a bystander
sees a character stand still for ten seconds and vanish. The memorial is the
only trace.

This plan gives an ascension two more outcomes beside the gift. The player
makes **three separate picks at the stone** (D20):

| Pick | What it is | Lands on | Lasts |
|---|---|---|---|
| the **gift** | a permanent unlock (shipped, untouched) | the bloodline | forever |
| a **heir buff** | a named, timed bonus | the next character in the same slot | hours |
| a **world effect** | a named, timed change | everyone on the server | hours or days |

All of them are visible in one HUD element, the **buff tray** (D22), which a
plan of its own designs and builds (D30).

It is also the first time the server holds state that belongs to the world
rather than to a character, and the first timer that survives a restart. Three
long-open notes ask for exactly that and close here: `roadmap.md:454` (timed
world states must be wire-visible, a controller owns the timers),
`tdd.md:149,154` (world state, and how it is persisted), `backlog.md:639-643`.
It is also the "shared moment" `plan-entity-presentation.md:146` deferred.

### What it is not

- Not a faction system. A faction's world effects are the list on that
  faction's stone, and the stone is gated by the pledge quest (camps are quest
  content, `plan-release-map.md` §3). Players still carry no faction axis.
- Not an event scripting language. A world effect is a flag plus a list of
  modifiers; what it means in the world is authored where the world already is
  authored (a spawn, a dialogue node).
- Not built for the four later triggers (D15). The controller's one entry
  point is the whole extension point.
- Not the buff tray. The element that shows every active buff and debuff is a
  new plan (D30). This plan only hands it its tenants (§3.9).

---

## 2. Decision ledger

### 2.1 First session (PO 2026-09-27, taken as choice prompts)

| # | Ruling |
|---|---|
| **D1** | A stone offers a **list**, the ascending player **picks** one. (Since D20: one list per pick.) |
| **D2** | ⭐ **GDD §5's "rewards never speed leveling" is RETIRED for timed effects.** PO: *"it is not a hard rule, it's one old idea that we are now going against... repeatedly leveling through the game is part of the game and players should be able to increase that. That is not meta slaving, it's a cooperative and open game anyways."* Effects may be powerful, for the individual or the whole server, and the ascending player benefits from their own world effect. |
| **D3** | Effects may take things away (a mob stops appearing). **No restriction** (against the recommended dependency check). ⚑ Legal, but nothing in the first build does it (D24, D25). |
| **D4** | The same effect triggered while it runs: its **duration extends, capped**. |
| **D5** | Visibility: a **named banner** at start and end, plus a persistent HUD indicator. (The indicator is the buff tray since D22.) |
| **D6** | **No duration floor.** The author decides; short events are legal. |
| **D7** | A windowed quest gets **extra time** after the effect ends, then is abandoned. The grace is authored per quest and may be zero. ⏸ Ruled, NOT in the first build (D24). |
| ~~D8~~ | ~~Two picks at the ceremony: the gift and the cause.~~ **SUPERSEDED by D20 and D21.** The PO's line of thought survives as flavour for a world effect's name: *"If they chose 'protect the weak'... they might decrease the defence or the hp of certain mobs."* |
| **D9** | ⭐ **Identity is the effect's NAME.** The same name extends (D4) and never grows stronger. Different names run side by side and their bonuses **add**, because they are independent. PO's example: *Nature's Guidance* (druids, +1 % XP) and *Righteous Power* (paladins, +1 % XP) both active is +2 %. |
| **D10** | Effects may modify **mobs** (HP, defence of selected mobs). Living mobs change **at once**. |
| **D11** | Heir effects: a timed XP boost on the **wall clock from the ascension**, and **Afterglow**. ⏸ Narrowed by D27: Afterglow is NOT in the first build. |
| **D12** | The HUD lists **every contributor** to a running effect. (In the circle's tooltip, P13.) |
| **D13** | The pick is stored: shown on the **memorial**, and available to **NPC dialogue** by name. (Since D21 the stored pick is the world effect.) |
| **D14** | List entries may be gated by **what the old life did**, differ **per stone**, and carry **limits on where the bonus applies**. |
| **D15** | The primitive stays open to four more triggers: **a command**, **boss kills** (GDD §7 "Special Events"), **community goals**, **calendar**. Only ascension and the command are designed here. |
| **D16** | ⭐ **"Breadth, never power" is retired ENTIRELY**, for the permanent gift too (against the recommendation). A gift may be a better aura, not only a different one. Veteran bloodlines may grow stronger than new ones over time. GDD §5 is amended (§3.10). |
| **D17** | A pick is **optional**: a list also offers a "none" row, the twin of the shipped "ascend with no gift" row. (Since D20: one such row per pick, P12.) |
| ~~D18~~ | ~~The word for the thing is OPEN.~~ **CLOSED by D19.** |

### 2.2 Second session (PO 2026-09-28, taken as choice prompts)

| # | Ruling |
|---|---|
| **D19** | ⭐ **The word is *world effect*.** The heir's thing is a ***heir buff*** (the PO's own words). The collision with a skill's `effects[]` is accepted: every identifier says the full `worldEffect`, never a bare `effect` (P11). |
| **D20** | ⭐ **Three separate picks at the stone.** PO: *"At a stone at ascension, the player picks three things: Their ascension reward, a buff for their heir and a world effect. each are separate choices."* |
| **D21** | **The *cause* is retired**, as a word and as a file. The stone carries two more lists beside the gifts. Gate and epitaph are authored on the effect itself. The memorial shows the world effect picked. |
| **D22** | ⭐ **A buff and debuff tray.** PO: *"all effects need to be visible inside a hud element. potentiall a buff / debuff HUD element that we still need to build. In this element, short and long term buffs and debuffs are listed in circles, with the time inside the circle going down by emptying the circle."* ⚑ The same session first ruled "built in this plan, long effects first"; **D30 reversed that an hour later.** |
| **D23** | **The first build carries eight applications**: *visitor*, *hunt*, *a way opens* (spawn gate) · *the town talks*, *extra lesson* (condition) · *server numbers* (XP gain, shorter downtime, faster respawns, unlock drop chance), *mob modifiers* (HP, defence), *player damage dealt* (modifier). |
| **D24** | **Not in the first build** (confirmed on a second asking), each still legal in the design: a threat leaves, species swap, lit tunnel, reinforcements, a good harvest, quest window, cross-stone reward, weather, and the player modifiers skill cost, cooldown time and movement speed. |
| **D25** | **One spawn key only.** Nothing in D23 suppresses a spawn, so `unlessWorldEffect` is not built. It is added the day a removal is authored. |
| **D26** | **A closing gate spares a fight.** A hunt target or visitor that is in combat when its window closes stays until the fight ends or it dies, and does not respawn (was P4, closes Q5). |
| **D27** | **The first heir buff catalogue is three stats**: XP gain, shorter downtime, damage dealt. Afterglow waits (narrows D11). |
| **D28** | **Effects run on the wall clock through server downtime.** A two-minute deploy costs an effect two minutes (was P3, closes Q4). |
| **D29** | **A world effect at its cap stays pickable**, and the row says that the pick adds the contributor and no time (closes Q14). |
| **D30** | ⭐ **The buff tray moves OUT into a new plan.** PO, asked what is missing before approval: *"Lets move the UI elements out, we need a fully new plan that displays currently active buffs and debuffs."* That plan owns the element and ALL its tenants, skill buffs included. This plan keeps only what it hands over (§3.9). |
| | ⛔ **Approval of §7: "Not yet"** (same session). Missing, by the PO: the first content (Q11) and the tray plan (D30). No chunk is approved. |

### 2.3 The first build at a glance

| Seam | Application | Instance to think with (content is Q11, not ruled) |
|---|---|---|
| Spawn gate | Visitor | The Wanderer stands at the village fire and offers *Kobolds on the Road* |
| Spawn gate | Hunt | A named white wolf in the forest, with a sure unlock drop |
| Spawn gate | A way opens | A `CaveMouth` that exists only inside the window. The `CaveExit` behind it is ungated, nobody is trapped |
| Condition | The town talks | The crier and the hermit name the ascended |
| Condition | Extra lesson | The hermit teaches a skill only inside the window |
| Modifier | Server numbers | *Nature's Guidance*: +1 % XP for everyone |
| Modifier | Mob modifiers | *Protect the Weak*: orcs lose HP or defence |
| Modifier | Player damage dealt | Fire damage +5 % for everyone |
| Heir buff | XP, downtime, damage | *Momentum*: the heir levels faster for a few hours |

---

## 3. The design

### 3.1 The model

A **world effect** is an authored, named thing with a duration, an extension
cap and a list of modifiers. It is either active or not. Everything else reads
that one fact.

```json
{
  "key": "natures-guidance",
  "displayName": "Nature's Guidance",
  "icon": "leaf",
  "epitaph": "who called Nature's Guidance upon the land",
  "durationSeconds": 86400,
  "maxSeconds": 259200,
  "bannerStart": "{name} has passed on. Nature's Guidance is upon the land.",
  "bannerEnd": "Nature's Guidance fades.",
  "conditions": [ { "kind": "kills_this_life", "species": "Wolf", "value": 20 } ],
  "modifiers": [
    { "stat": "xpGain", "bonus": 0.01 }
  ]
}
```

A **heir buff** has the same shape without the banners, the epitaph and the
extension cap:

```json
{
  "key": "momentum",
  "displayName": "Momentum",
  "icon": "footprints",
  "durationSeconds": 14400,
  "modifiers": [
    { "stat": "xpGain", "bonus": 0.10 }
  ]
}
```

- `conditions` are the gate at the stone (D14, D21). They use the shipped
  condition vocabulary and are judged only there: a command or a later trigger
  (D15) starts an effect without asking them.
- `epitaph` is what the memorial prints after the name (D13).
- `debuff: true` marks an effect the tray tints as a debuff (P15). Absent
  means buff.
- "Differs per stone" (D14) is list membership. One effect with two different
  gates at two stones is not supported; author two effects, which by D9 are
  two names that add.

Three seams carry the whole first build:

| Seam | What content writes | Carries |
|---|---|---|
| **Spawn gate** | `spawns[].whileWorldEffect` on a zone spawn | visitor, hunt, a way opens |
| **Condition kind** | `{ "kind": "world_effect_active", "effect": "..." }` on any dialogue node | the town talks, extra lesson |
| **Modifier** | `modifiers[]` on a world effect or a heir buff | XP, downtime, respawn rate, unlock chance, damage dealt, mob HP and defence |

### 3.2 The controller

One owner of the active set, in a new package `worldeffect` (P11).

- **Registry**: the authored definitions, loaded at boot, each given a dense
  index. Spawns and conditions resolve their effect key to that index at load,
  so an unknown key refuses the boot and a hot read is a slice index.
- **Active set**: per effect `startedAt`, `expiresAt` (wall clock) and the
  contributor list. Mutated on the game loop only.
- **One entry point**: `Start(key, contributor)`. The controller does not
  compute the expiry. It asks the store, which applies the extension rule in
  one SQL statement (§3.3), and adopts the answer. One place holds the rule
  (D4, D9).
- **Derived tables, rebuilt on change only**: the summed world modifiers per
  stat, and the per-mob-definition factors (selectors such as species, faction
  or tier resolve to definition ids when an effect starts or ends). An effect
  changes a few times a day; the rebuild may walk everything.
- **Expiry**: checked once per second against an injected clock, never per
  tick.
- **The loop reads, nobody else writes**: consumers see `Active(idx)` and the
  derived factors. The persistence write happens off the loop (the
  `GraveyardReader` and `Ascender` pattern, `persist/graveyard.go:67-180`).

Heir buffs do not live in the controller. They are per-player state, loaded
with the character (§3.8).

### 3.3 Persistence and restarts

Ticks restart at zero on every boot (`core/game.go:310`) and nothing timed
survives a restart today (`persist/state.go:57` refuses cooldowns and buffs on
purpose). A 24 h effect must outlive a deploy, so expiry is a wall-clock
timestamp in the database and the database owns it:

- The ascension transaction (`store/ascension.go:196`) already writes the
  sacrifice and the gift atomically. The two new picks join it: the world
  effect key on the character, the contribution row, the heir buff row, and
  the world effect upsert
  (`expires_at = LEAST(GREATEST(expires_at, now()) + duration, now() + max)`,
  `RETURNING started_at, expires_at`). Either the ascension happened with its
  picks or it did not happen.
- `started_at` resets when an effect starts after a lapse and stays when a
  running one is extended. The tray's circle is drawn from both timestamps
  (§3.9).
- The returned pair rides the ascension result to `drainAscensions`
  (`sys/persist.go:180`), where the controller adopts it and the banner fires.
  Two ascensions racing resolve in SQL, not in two places.
- At boot the controller loads every row whose expiry is in the future. An
  effect that lapsed while the server was down is simply not active; its end
  banner is skipped (D28).
- An ended effect's row stays with its past expiry. The upsert handles it, and
  the quest grace (D7, deferred) will derive from it.

### 3.4 The ceremony (D20, D21)

Today: a gift row click stashes `PendingAscension{Key, Gate}`
(`skills/component.go:323`) and starts the channel (`ApplyRow` → `stash` →
`UtilityAscend`, `sys/ascension_rows.go:200,269`); `applyAscension`
re-validates and hands off. With three picks the stone becomes a walk through
three nodes:

1. **The gift node.** Its content is unchanged, its behaviour is not: a gift
   row (or "ascend with no gift") records the gift and **navigates** on.
2. **The heir buff node**, `rows: "ascension_heir_buffs"`, with an authored
   ordered list `heirBuffs: [...]` on the stone. A row (or "no heir buff")
   records the pick and navigates on.
3. **The world effect node**, `rows: "ascension_world_effects"`, with
   `worldEffects: [...]`. A row (or "no world effect") is what now stashes
   the whole pick and starts the channel.

- Both new lists are the twin of the shipped `rewards` list: absent refuses
  the boot, `[]` is the legitimate empty one (ascension-sites D5). A node
  whose list is empty is skipped; on a stone where both are empty the gift
  row stays the trigger, as today.
- Locked rows show their gate named (the shipped `lockedWhenGated` reading).
- A world effect that already runs at its cap is still pickable: the pick
  adds the contributor and no time. The row says so (D29).
- `AscensionPick` gains the two keys as DATA (the reattach landmine: a
  closure over the player is judged against the wrong object after a
  reconnect). This is the chunk's core edit and where L6 bites: a half-made
  pick (gift chosen, the rest not yet) is new state that walking away, dying
  or a closed panel must throw away.
- The confirm names all three picks, says that the heir buff's clock starts
  now, and how long it runs (§5).

### 3.5 The spawn gate (D23, D25, D26)

NPCs are mobs and every mob comes from `spawns[]`, so one gate covers the
visitor, the hunt and the cave mouth.

- One optional key on `world.Spawn` (`world/zone.go:150-181`):
  `whileWorldEffect`. The point lives only while that effect is active.
- The check sits in the first-tick loop and the respawn loop
  (`sys/mob.go:183-188`, `:218-224`).
- On a change: a point whose gate opened spawns now; a point whose gate
  closed despawns its live mob (precedent: `encounter.System.Despawn`,
  `encounter/system.go:146`), **unless it is in combat** (D26): then it stays
  until the fight ends or it dies, and does not respawn.
- **A way opens** is a gated `CaveMouth`. It is never in combat, so it closes
  on time. The `CaveExit` on the far side is ungated: whoever is inside when
  the way closes walks out normally and cannot come back. ⚑ Unchecked: a
  player mid-interaction with the mouth at the closing second (L13).

### 3.6 Modifiers

| Stat | Scope | Read site | Note |
|---|---|---|---|
| `xpGain` | world, heir | after `curve.KillXP.Award` in `killXPFor` (`model/mob/mob.go:2354`), and at the quest `grant_xp` (`sys/interaction.go:1356`) | NOT in `player.AddExperience`: that carries the cheat (P7). A gray kill stays 0 |
| `regen` (downtime) | world, heir | `model/player/update.go:59-60` | one line |
| `damageDealt` | world, heir | ⚑ NOT SURVEYED (Q13) | new in D23; optional `damageType` filter |
| `respawnRate` | world | `rollDelay`, `sys/mob.go:392-398` | on the rolled value, before the clamp |
| `unlockChance` | world | `rewardPlayer`, `mob.go:2380-2386` | the roll is always consumed (RNG stream rule) |
| mob `maxHealth` | world | `Mob.MaxHealth()`, `mob.go:1889` | see below |
| mob `damageTaken` | world | the `hp32` line, `mob.go:1959` | |

**Everything adds (D9).** At a player read site the factor is
`1 + the world's summed bonus + the player's own heir bonus`.

**Mob modifiers need no refold.** Every mob stat is recomputed at each read,
so one multiplication by a per-definition factor reaches living mobs and new
spawns alike (D10). The mob package already takes server-set knobs this way
(`SetKillXP`, `SetHealthGainTick`, `mob.go:33-98`). The DerivedStats route was
rejected: it has no "refold every live mob" trigger, and building one is more
than the read-site lookup.

**A selector follows the AUTHORED mob, not the live one.** Selectors resolve
to definition ids when the effect starts. A mob whose faction changed at
runtime (charm, `Align`, `EnlistUnder`) keeps the modifier of the faction it
was authored with. That is the rule, not a defect.

**Limits (D14)** are a small filter on a modifier, not a language:
`belowLevel` (the player), `source` (`kill` or `quest`), `damageType`, and
for mob modifiers the selector itself (`species`, `faction`, `tier`, a level
band).

### 3.7 Quest windows (D7): DEFERRED by D24

Designed on 2026-09-27, not in the first build. The design is kept for the
day it is wanted: the quest file gains
`window: { "effect": "...", "graceSeconds": N }`, the deadline is derived
(the effect's last expiry plus the grace) and never stored, checked once per
second online and right after `Restore` at login. Its open question (does the
journal show the deadline, one more wire field) and its landmine (`Restore`
runs before the quest notifier is installed) wait with it.

### 3.8 Heir buffs (D11, D27)

- Keyed **(account, slot)**, like `bloodline_unlocks`, because the heir does
  not exist when the ascension commits (the C2b lesson: state keyed by slot
  cannot hang off a row that does not exist yet). The heir is the next
  character in the same slot, not the account (P1).
- Wall clock from the ascension (D28): the row is written in the ascension
  transaction and loaded when a character in that slot joins. The player
  holds its own small list of active heir buffs with their summed bonus per
  stat; expiry is checked once per second.
- Character select shows what is left of a slot's heir buff (§5).
- **Afterglow is deferred (D27).** Its 2026-09-27 design is kept: evaluated
  at the moment a kill pays, one `space.AppendCircleDynamics` probe per
  credited player, it never adds recipients; the ring's radius would ride the
  wire beside `light_radius` on `Character`. Its open question (several glows
  in range: the strongest or the sum) waits with it.

### 3.9 Visibility (D5, D12, D13, D22)

- **Banner**: `chat.ChatSystem.Broadcast` (`sys/chat/system.go:25`), the path
  the warlord uses. World effects only. No wire change.
- **The buff tray is another plan's (D30).** What this plan hands over:
  - `Welcome` is marshalled once per server lifetime (`core/game.go:99-122`)
    and cannot carry changing state. A new server message carries the active
    world effects and the player's own heir buffs: key, `started_at` and
    `expires_at` as wall-clock seconds, the debuff flag, the contributors.
    Sent at join and on change only; the client counts down by itself.
  - Each of them becomes a tray tenant. What the tray needs from a long
    effect: an icon, a name, two timestamps (the circle's fill is
    `time left / (expires_at - started_at)`, so an extension, D4, refills it
    in part), the debuff flag, and tooltip lines (every contributor, D12).
  - ⚑ The tenant contract is the tray plan's to rule. Whatever it rules,
    this plan's C2 follows; the list above is what a long effect can offer,
    not a spec for the tray.
- **Memorial**: the graveyard query returns the world effect key; the row
  reads the name plus the effect's `epitaph`.
- **Dialogue**: a node gated on an effect may use `{name}` for the latest
  contributor (the town talks).
- **The command**: `WORLDEFFECT start <key> [seconds]`,
  `WORLDEFFECT stop <key>`, `WORLDEFFECT list`, a closure in
  `NewCommandSystem` like `ANNOUNCE` (`sys/cmd/cmd.go:228-236`). It is also
  the harness's only way to test an effect without a level-30 character. A
  heir buff is tested through a real ascension on the cheat path.

### 3.10 GDD amendments this plan carries

| Where | Amendment | State |
|---|---|---|
| §5 "Meta-Progression: Character Sacrifice", *Rewards are breadth, never power* and the *Explicitly forbidden* list | Retired by D2 (timed effects) and D16 (the gift). The design test *"does a player who never sacrifices feel weaker in the endgame?"* no longer governs. | dated note applied 2026-09-27, the old text kept for its rationale |
| §5, the reward catalog | An ascension has three outcomes: the gift, the heir buff and the world effect (D20). | owed, with the first built chunk |
| §7 "Special Events" | The boss-kill world event is a later trigger of this primitive (D15). | owed, when that trigger is designed |
| §10 "Art Direction & UI" | The buff tray (D22). | owed by the tray plan (D30) |

---

## 4. Performance

| Path | Cost |
|---|---|
| Per tick, per mob (`MaxHealth`, damage taken) | one slice index and one multiply |
| Per hit (damage dealt) | one add and one multiply; with a `damageType` filter one compare more |
| Per kill | one add per credited player |
| Present path (`conditionsPass`, L15: O(1) only) | one slice index. ⚑ The evaluator receives only the player (`sys/interaction.go:1402`), so the flag reaches it through a `learner` method reading the controller's snapshot |
| Respawn loop | one slice index per waiting point |
| Effect start or end | rebuilds the derived tables and walks spawn points and live mobs once. A few times per day |
| Expiry check | once per second, world and per player |
| Wire | nothing per tick. One small message per player at join and per change |
| Database | one upsert inside a transaction that already runs; one read at boot; one read per join (heir buffs) |

Nothing here scales with the number of active effects on a hot path: the
derived tables are flattened when the set changes.

---

## 5. Fun and fairness

What the rulings buy, and what they knowingly give up.

- **D9 turns the balance ceiling into an authoring fact.** No runtime cap on
  the summed bonus exists or is needed: the maximum is "every authored effect
  active at once", which a content check can compute at boot. The simharness
  batteries run at a multiplier of 1.0 and cannot see any of this, so the
  guardrails should be pointed at that worst case (§7, C1). ⚑ `damageDealt`
  (D23) is the first modifier that moves TTK directly; it makes that check
  matter more.
- **Ascension now feeds itself**: faster leveling, more ascensions, more
  bonus. The dampers are the stone's price, the per-effect extension cap and
  the number of effects authored. All three are content numbers.
- **Capped extension still allows always-on.** Under steady ascensions a
  popular effect never lapses. Anything gated by an effect must be good
  content in both states, for an unknown length of time.
- **A small server sees few effects.** Content that exists only inside a
  window may go unseen for weeks. The command lets the PO run one by hand.
- **The first build takes nothing away** (D24, D25). The griefing surface
  that D1 with D3 opens (a removal on a pick list is a player acting on
  others) stays closed until a removal is authored.
- **D16 lets bloodlines grow in power.** A veteran's tenth character may be
  stronger than a newcomer's first, permanently. In a game without PvP and
  with shared XP that is a gap between helpers and helped, not between
  rivals, but group content tuned for veterans will be harder for a server
  of newcomers. Gift power is a content number like every other.
- **The heir clock runs while the player sleeps** (D11, D28). That is the
  wanted urgency. The confirm says that the buff starts now and how long it
  runs, and character select shows what is left.
- **Timezones**: no floor (D6). A two-hour effect belongs to whoever is
  online. An author who wants everyone to see it authors a day.

---

## 6. Schema and wire impact (stated per the standing rule)

**Database: one new migration pair, `000004_world_effects`.** Shipped SQL is
untouched. ⚑ The 2026-09-27 design said `000003`; map fog persistence took
that number the same day. Take the next free pair on the day C1 is built.

| Object | Columns | For |
|---|---|---|
| `game.world_effects` | `effect_key` PK, `started_at`, `expires_at` | the active set, and the last expiry of ended effects |
| `game.world_effect_contributions` | `effect_key`, `character_id` (nullable: a command has no character), `contributed_at` | D12. Names are joined, never copied, and the reader reuses the memorial's exact-match `'deleted_' \|\| id` filter, so an erased account's names are hidden the same way |
| `game.heir_buffs` | `account_id`, `slot_index`, `buff_key`, `started_at`, `expires_at`; PK on the first three | D27 |
| `game.characters.world_effect_key` | nullable `TEXT` | D13, the memorial |

The heir buff picked is not stored on the character: nothing reads it after
the buff has run out.

Standing rules apply: the `game.` namespace, no `ON DELETE CASCADE`. The live
database is un-backed-up by ruling (PO 2026-08-04): running effects die with
it, which is acceptable for timed state. `store` and `accounts` tests run with
`AURA_TEST_DB_URL` set.

**Quest ledger: NONE.**

**Wire**: +1 `ServerMessageBody` member (value 8, the values are pinned;
checked on disk 2026-09-28, `PlayerRoster = 7` is the last, `server.fbs:1167`). A both-sides deploy with a hard reload for connected
players. No field on `Character` (Afterglow is deferred).

**Zone format**: +1 optional key on a spawn. Absent means ungated, so no
shipped zone file changes.

**Content**: +2 directories (`api/world-effects/`, `api/heir-buffs/`), each in
`contentSources` and `cp-defs`; +1 condition kind; +2 node lists and +2 `rows`
kinds on the stones.

**Conf**: none.

---

## 7. Chunk breakdown (PROPOSAL, NOT approved: PO 2026-09-28 "Not yet")

Ordered so that every chunk is visible in-game by itself.

| Chunk | Contents | Schema |
|---|---|---|
| **C1** the primitive | `api/world-effects/` and the registry, the controller, migration `000004` (the world tables), restart survival, the `WORLDEFFECT` command, banners, the `xpGain` modifier at both award sites, the "everything active" content check | DB +1 migration |
| **C2** the tray tenants | the server message, world effects registered as tenants of the buff tray with their contributors. ⛔ Waits for the tray plan (D30) | wire +1 message |
| **C3** the ceremony | `api/heir-buffs/`, the two new picks and their nodes, both inside the ascension transaction, the memorial epitaph, the heir `xpGain` buff (its tray tenant follows C2), time left on character select | DB: the heir table and the character column (same migration if C1 has not shipped, a new pair if it has) |
| **C4** the spawn gate | the spawn key through all three zone writers and the Tiled class, the gate, spawn and despawn on change, the fight exemption (D26) | zone format +1 key |
| **C5** the condition | the condition kind, `{name}` in dialogue | none |
| **C6** the remaining modifiers | regen and damage dealt (world and heir), respawn rate, unlock chance, mob HP and defence with their selectors and limits | none |
| **C7** the first content | the effects, buffs, visitor, hunt, way and lesson the PO rules in Q11, authored with the `add-content` skill | content only |

Deferred, designed, no chunk: quest windows (§3.7), Afterglow (§3.8), the
second spawn key (D25).

⚑ **C2 is the only chunk that waits for the tray plan.** C1 is visible by its
banner and its XP, C4 to C6 in the world itself, so the order C1, C4, C5, C6
can run before the tray exists. C7 (the first content) is the other thing the
PO wants settled before approving (Q11).

### Test strategy

- Controller, pure Go with an injected clock: start, extend, the cap,
  expiry, two names adding, the derived tables after each change.
- Store, against `aura_test`: the upsert's three cases, two racing
  ascensions (the uncommitted-rival method from ascension C1), a restart
  (write, build a new controller, the effect is active with the same expiry).
- Red first for every read site: the modifier test fails before the
  multiplication exists.
- Spawn gate: a gated point is empty before, populated during, empty after;
  the mob it held is gone from `phy.Space` (§54: removal purges collision
  sets); a mob in combat at the closing second is still there and gone after
  the fight.
- Ceremony: a half-made pick is thrown away by walking off, dying and
  closing the panel; the pick survives a reconnect as data.
- The tray's own tests are the tray plan's. C2 pins the message: sent at
  join and on change, never per tick.
- In-game, per chunk, through the command. ⚑ A harness leg behind a real
  ascension needs a level-30 character; use the cheat path.
- Content tests read `api/` from disk: `-count=1`.

---

## 8. Open questions

| # | Question |
|---|---|
| ~~Q1~~ | ✅ **ANSWERED by D19**: *world effect*, and *heir buff*. §8.1 keeps the reasoning. |
| ~~Q2~~ | ✅ **ANSWERED by D16**: the rule is retired for the gift too. |
| ~~Q3~~ | ✅ **ANSWERED by D17**: optional, with a "none" row. |
| ~~Q4~~ | ✅ **ANSWERED by D28**: downtime counts. |
| ~~Q5~~ | ✅ **ANSWERED by D26**: the mob stays until the fight ends. |
| **Q6** | ⏸ Several Afterglows in range: the strongest, or the sum? Waits with Afterglow (D27). |
| **Q7** | ⏸ Does the journal show a windowed quest's deadline? Waits with quest windows (D24). |
| **Q8** | **Permanent effects** for community goals (D15): an effect with no expiry. Not designed here. |
| **Q9** | **Every number**: durations, caps, bonus sizes. |
| **Q10** | **Player-chosen names now reach banners, tooltips and NPC speech.** The character-name content filter is an open item (`CLAUDE.md`, smaller open threads); this plan raises its priority. |
| **Q11** | ⭐ **BLOCKS APPROVAL (PO 2026-09-28).** **The first real content**: which stone offers which world effects and heir buffs, and what the first visitor, hunt, way and lesson are. §2.3 holds instances to think with, none ruled. |
| ~~Q12~~ | ➡ **MOVED to the tray plan (D30)**: where it sits, the order of the circles, what it does past N tenants, the icon source, the phone layout. |
| **Q13** | **`damageDealt`'s read site** is not surveyed, and whether one site covers aura ticks, cooldown hits and summons alike is unknown. Owed before C6. |
| ~~Q14~~ | ✅ **ANSWERED by D29**: pickable, and the row says so. |
| ~~Q16~~ | ✅ **ANSWERED the same session**: what is missing before §7 can be approved is the first content (Q11) and the tray plan (D30). |
| ~~Q15~~ | ➡ **MOVED to the tray plan (D30)**: durations for stun, slow, shields and buffs on the wire (`applied_effects` is a bitmask without durations today). |

### 8.1 The word (closed by D19, kept for its reasoning)

The 2026-09-27 session left the word open because every candidate failed one
of five tests: not a bare "effect", fits good and bad alike, fits every
trigger, fits both scopes, reads on a banner and a HUD label.

What the second session found:

- **Players almost never read the generic noun.** A banner says *Nature's
  Guidance is upon the land*, a circle's tooltip says *Nature's Guidance,
  14 h left*. The generic word is what authors and code say.
- **The scope test dissolved**: the heir's thing got its own plain word
  (*heir buff*), so the world's word no longer has to fit the heir.
- *echo* (recommended), *tide*, *omen* and *season* were weighed. The PO
  chose the plain name that needs no teaching.

The price is the collision with a skill's `effects[]`, the `applied_effects`
bitmask and `EffectPips`. P11 is the rule that pays it.

---

## 9. Proposals adopted without a choice prompt (PO may veto any)

| # | Proposal |
|---|---|
| **P1** | The heir is the next character in the **same slot**, not the account. |
| **P2** | The **database owns the expiry**: the upsert computes it, the loop adopts the returned value. |
| ~~P3~~ | ✅ Ruled as D28. |
| ~~P4~~ | ✅ Ruled as D26. |
| **P5** | When a mob modifier starts or ends, a living mob's health is scaled with its maximum, so **its health ratio is kept**. Without this a mob whose maximum rises looks damaged (raising the maximum never raises current health, `mob.go:1176-1180`). |
| **P6** | ⏸ Afterglow does not stack with itself. Waits with Afterglow. |
| **P7** | The cheat XP command is **not** multiplied. |
| **P8** | ⏸ The quest deadline is derived, never stored. Waits with quest windows. |
| ~~P9~~ | Moot: one spawn key (D25). |
| **P10** | Both new lists are validated by the resolver passed at construction, the way the ascension catalog is (the C3 lesson: a validation pass that walks "every X" misses the second surface). |
| **P11** | **Every identifier says the full word**: `api/world-effects/`, `api/heir-buffs/` (⚑ the first hyphenated content directories, every shipped one is a single word), package `worldeffect`, `whileWorldEffect`, `world_effect_active`, the `WORLDEFFECT` command. A bare `effect` stays what it is today, a skill's. |
| **P12** | **Each of the three picks has its own "none" row** (D17 carried over to D20). |
| **P13** | **Contributors live in the circle's tooltip** (D12 inside D22's tray). A wish handed to the tray plan, which rules it (D30). |
| **P14** | **One pick starts one effect.** A row is an effect, not a bundle (the cause was one). |
| **P15** | **Buff or debuff is authored** (`debuff: true`), not derived from the sign of a modifier: a mob modifier's sign reads the other way round, and a visitor has no sign at all. |
| **P16** | **The order at the stone is gift, heir buff, world effect**, the order the PO named them in. |

---

## 10. Landmines

- **L1: three zone writers.** A new spawn key means `zone.go`
  (`DisallowUnknownFields`), `ZoneModel.getZoneAsJSON()` (a hand-written
  whitelist: the first in-game save deletes what it does not know, which
  already ate `spawn.level` once) and `aura-convert.js` plus the Tiled class,
  in one commit. The completeness pin reddens by design.
- **L2: zone files may carry uncommitted PO authoring** (zone-naming L2). C4
  adds an optional key and edits no zone file; keep it that way.
- **L3: `cmd/aurad` type-asserts its seams at runtime.** A new sink method
  builds green and dies at boot unless `core/game.go` carries the
  compile-time assertion.
- **L4: a new content directory must join `contentSources`** and its coverage
  test (`loaders_test.go`), and `cp-defs`. `backend/pkg/api/` is only partly
  gitignored. This plan adds two.
- **L5: the first passing node is the greeting** (`present()`). A node gated
  on an effect that sits above the fallback becomes the greeting for everyone
  while the effect runs. For *the town talks* that is the wanted thing; for
  *extra lesson* it is not, so the lesson node sits below the greeting.
- **L6: completion is not cancellation.** `CancelCast` clears the pending
  pick; the two new keys travel in the same struct and must survive
  completion the same way.
- **L7: dormant mobs skip `Update`**, so their health clamp waits until they
  wake and `HealthRatio()` can read above 1 for a moment (`sys/mob.go:203-206`).
  P5's scaling must reach dormant mobs too.
- **L8: two unique constraints on one insert report the older one.** The new
  tables' error mapping must name every constraint the upsert can trip.
- **L9: a content edit does not invalidate the Go test cache.**
- **L10: a new mob (every visitor, every hunt target) reddens the three
  census tests and the three simharness placement pins.**
- **L11**: ⏸ waits with quest windows (`Restore` runs before the quest
  notifier is installed).
- **L12: the content editor knows none of this.** Neither new directory has a
  tab, and the editor's JS validator (`validate.mjs`, the stale-port class of
  `plan-content-editor.md` §B3) will flag the new spawn key and the new
  condition kind on every open until it is patched, or until §B11 Q7 (Go
  validation on save) retires it.
- **L13: a gated `CaveMouth` closing under a player.** The mouth is an
  interaction-carrying mob; a despawn while a player stands in its
  interaction or is mid-transfer is unchecked. D26 exempts fights, not
  conversations.
- **L14: the word collides by ruling (D19).** A grep for `effect` finds the
  skill system. Search for `worldEffect`, `world_effect` and `world-effect`,
  and keep P11 in every new identifier.

---

## 11. Chunk ledgers

None. Nothing is built.
