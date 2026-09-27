# Plan: world effects, the cause an ascension leaves behind

> **Status: DESIGN IN PROGRESS 2026-09-27 (PO session, seventeen rulings taken
> as choice prompts, §2). NOTHING IS APPROVED FOR BUILDING** (PO, same session:
> *"Nothing to build yet. Let's find other applications and narrow down exactly
> what we want first."*). The chunk split in §7 is a proposal, not a schedule.
> Line refs come from two code surveys of the working tree on 2026-09-27
> (HEAD `56ebb5a7` plus the uncommitted aura-drawbacks C1); re-verify before
> executing.
>
> Origin: the PO, 2026-09-27, verbatim: *"I want to design a system that allows
> ascensions to have server wide and long lasting effects. That could be an npc
> type that is normally not present starts appearing for some time after a
> player ascended with a character. Or the xp gain for every player on the
> server is increased by 1 percent for 24 hours. Or a certain quest becomes
> available for a limited time. Or a mob stops appearing for a limited time."*
>
> **Schema, whole plan as designed: DB +1 migration (`000003`, the FIRST
> world-scoped state: 3 tables + 1 column) · wire +1 server message, +1
> appended field on `Character`, +1 field on the conversation condition JSON
> (content, not wire) · zone format +2 optional spawn keys · content +2
> directories.** All numbers [PLACEHOLDER].

---

## 1. What this is

An ascension ends a character and, today, changes nothing for anyone else: the
ceremony is own-player only (ascension D29), no broadcast fires, a bystander
sees a character stand still for ten seconds and vanish. The memorial is the
only trace.

This plan gives an ascension a second outcome beside the gift: **the cause the
character commits to** (D8). A cause starts one or more named, timed effects:

- on the **world**: everyone on the server, for hours or days;
- on the **heir**: the next character in the same slot, for a short time.

It is also the first time the server holds state that belongs to the world
rather than to a character, and the first timer that survives a restart. Three
long-open notes ask for exactly that and close here: `roadmap.md:454` (timed
world states must be wire-visible, a controller owns the timers),
`tdd.md:149,154` (world state, and how it is persisted), `backlog.md:639-643`.
It is also the "shared moment" `plan-entity-presentation.md:146` deferred.

### What it is not

- Not a faction system. A faction's causes are the list on that faction's
  stone, and the stone is gated by the pledge quest (camps are quest content,
  `plan-release-map.md` §3). Players still carry no faction axis.
- Not an event scripting language. An effect is a flag plus a list of
  modifiers; what it means in the world is authored where the world already is
  authored (a spawn, a dialogue node, a quest).
- Not built for the four later triggers (D15). The controller's one entry
  point is the whole extension point.

---

## 2. Decision ledger (PO 2026-09-27, taken as choice prompts)

| # | Ruling |
|---|---|
| **D1** | A stone offers a **list** of causes, the ascending player **picks** one. |
| **D2** | ⭐ **GDD §5's "rewards never speed leveling" is RETIRED for timed effects.** PO: *"it is not a hard rule, it's one old idea that we are now going against... repeatedly leveling through the game is part of the game and players should be able to increase that. That is not meta slaving, it's a cooperative and open game anyways."* Effects may be powerful, for the individual or the whole server, and the ascending player benefits from their own world effect. |
| **D3** | Effects may take things away (a mob stops appearing). **No restriction** (against the recommended dependency check). |
| **D4** | The same effect triggered while it runs: its **duration extends, capped**. |
| **D5** | Visibility: a **named banner** at start and end, plus a **persistent HUD indicator**. |
| **D6** | **No duration floor.** The author decides; short events are legal. |
| **D7** | A windowed quest gets **extra time** after the effect ends, then is abandoned. The grace is authored per quest and may be zero (PO: *"for some special events, they might also be abandoned instantly. We'll see."*). |
| **D8** | **Two picks at the ceremony**: the gift (shipped, untouched) and the cause. PO: *"the effect is basically the cause that this character now commits itself to. If they chose 'protect the weak'... they might decrease the defence or the hp of certain mobs."* |
| **D9** | ⭐ **Identity is the effect's NAME.** The same name extends (D4) and never grows stronger. Different names run side by side and their bonuses **add**, because they are independent. PO's example: *Nature's Guidance* (druids, +1 % XP) and *Righteous Power* (paladins, +1 % XP) both active is +2 %. |
| **D10** | Effects may modify **mobs** (HP, defence of selected mobs). Living mobs change **at once**. |
| **D11** | Heir effects: a **timed XP boost** on the **wall clock from the ascension**, and **Afterglow**, a slotless glow beside the heir's one active aura that shares the bonus with players inside it. |
| **D12** | The HUD lists **every contributor** to a running effect. |
| **D13** | The cause is stored: shown on the **memorial**, and available to **NPC dialogue** by name. |
| **D14** | Cause entries may be gated by **what the old life did**, differ **per stone**, and carry **limits on where the bonus applies**. |
| **D15** | The primitive stays open to four more triggers: **a command**, **boss kills** (GDD §7 "Special Events"), **community goals**, **calendar**. Only ascension and the command are designed here. |
| **D16** | ⭐ **"Breadth, never power" is retired ENTIRELY**, for the permanent gift too (against the recommendation). A gift may be a better aura, not only a different one. Veteran bloodlines may grow stronger than new ones over time. GDD §5 is amended (§3.10). |
| **D17** | A cause is **optional**: a stone that offers causes also offers a "no cause" row, the twin of the shipped "ascend with no gift" row. |
| **D18** | **The word for the thing is OPEN** and needs its own discussion (§8.1). Journal deadlines, permanent effects and the name filter stay open questions (§8). |

### The first catalogue (PO picks, same session)

| Family | Picked | Not picked |
|---|---|---|
| Visible world changes | visitors · hunts · the world changes character (species swap, lit tunnel, NPCs talk about it) | "a threat leaves" as a catalogue family (⚑ still legal by D3, and the PO's origin message names it) |
| Server numerics | XP gain · shorter downtime · faster mob respawns · unlock drop chance | |
| Heir | timed XP boost · Afterglow | catch-up until level N · head start |

---

## 3. The design

### 3.1 The model

An **effect** is an authored, named thing with a scope, a duration, an
extension cap and a list of modifiers. It is either active or not. Everything
else reads that one fact.

```json
{
  "key": "natures-guidance",
  "displayName": "Nature's Guidance",
  "scope": "world",
  "durationSeconds": 86400,
  "maxSeconds": 259200,
  "bannerStart": "{name} has passed on. Nature's Guidance is upon the land.",
  "bannerEnd": "Nature's Guidance fades.",
  "modifiers": [
    { "stat": "xpGain", "bonus": 0.01 }
  ]
}
```

A **cause** is what the player picks at the stone. It names the effects it
starts and carries the gate and the epitaph:

```json
{
  "key": "protect-the-weak",
  "displayName": "Protect the Weak",
  "epitaph": "who chose to protect the weak",
  "conditions": [ { "kind": "kills_this_life", "species": "Orc", "value": 20 } ],
  "world": ["the-weak-are-sheltered"],
  "heir": ["momentum", "afterglow"]
}
```

Three seams carry the whole catalogue:

| Seam | What content writes | Carries |
|---|---|---|
| **Spawn gate** | `spawns[].whileEffect` / `unlessEffect` on a zone spawn | visitors, hunts, a threat leaves, species swap, lantern bearers |
| **Condition kind** | `{ "kind": "world_effect_active", "effect": "..." }` on any dialogue node | quest windows, extra lessons, NPC talk, a reward at stone B that exists only while stone A's effect runs |
| **Modifier** | `modifiers[]` on the effect itself | XP, regen, respawn rate, unlock chance, mob HP and defence |

### 3.2 The controller

One owner of the active set, in a new package (working name `worldfx`, see
§8 Q1 for the word).

- **Registry**: the authored definitions, loaded at boot, each given a dense
  index. Spawns, conditions and quests resolve their effect key to that index
  at load, so an unknown key refuses the boot and a hot read is a slice index.
- **Active set**: per effect `expiresAt` (wall clock) and the contributor
  list. Mutated on the game loop only.
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

### 3.3 Persistence and restarts

Ticks restart at zero on every boot (`core/game.go:310`) and nothing timed
survives a restart today (`persist/state.go:57` refuses cooldowns and buffs on
purpose). A 24 h effect must outlive a deploy, so expiry is a wall-clock
timestamp in the database and the database owns it:

- The ascension transaction (`store/ascension.go:196`) already writes the
  sacrifice and the gift atomically. The cause joins it: the cause key on the
  character, the contribution row, the heir rows, and the world effect upsert
  (`expires_at = LEAST(GREATEST(expires_at, now()) + duration, now() + max)`,
  `RETURNING expires_at`). Either the ascension happened with its cause or it
  did not happen.
- The returned expiry rides the ascension result to `drainAscensions`
  (`sys/persist.go:180`), where the controller adopts it and the banner fires.
  Two ascensions racing resolve in SQL, not in two places.
- At boot the controller loads every row whose expiry is in the future. An
  effect that lapsed while the server was down is simply not active; its end
  banner is skipped.
- An ended effect's row **stays** with its past expiry. The quest grace (§3.7)
  is derived from it.

### 3.4 The ceremony (D1, D8, D14)

Today: a row click stashes `PendingAscension{Key, Gate}`
(`skills/component.go:323`), the channel runs, `applyAscension` re-validates
and hands off. The second pick is a second node:

1. The catalog node (the gift). Its content is unchanged, **its behaviour is
   not**: today the gift row click itself stashes the pick and starts the
   channel (`ApplyRow` → `stash` → `UtilityAscend`,
   `sys/ascension_rows.go:200,269`). With two picks, a gift row (and the
   "ascend with no gift" row) records the gift and **navigates** to the
   causes node.
2. A new node `rows: "ascension_causes"` with an authored ordered list
   `causes: [...]`, the twin of the shipped `rewards` list. An absent list
   refuses the boot, `[]` is the legitimate empty one (ascension-sites D5).
   On a stone with an empty list the gift row stays the trigger, as today.
3. Locked rows show their gate named (the shipped `lockedWhenGated` reading).
4. The **cause row** (or the "no cause" row, D17) is now what stashes the pick
   and starts the channel. `AscensionPick` gains the cause key as DATA (the
   reattach landmine: a closure over the player is judged against the wrong
   object after a reconnect). This is the chunk's core edit and where L6
   bites: a half-made pick (gift chosen, cause not yet) is new state that
   walking away, dying or a closed panel must throw away.

"Tied to the stone" (D14) is authoring: each stone owns its list. A faction's
stone is a stone whose price includes the pledge quest.

### 3.5 Spawn gates (D3, visitors, hunts)

NPCs are mobs and every mob comes from `spawns[]`, so one gate covers both.

- Two optional keys on `world.Spawn` (`world/zone.go:150-181`): `whileEffect`
  (the point lives only while the effect is active) and `unlessEffect` (the
  point is suppressed while it is active). A point authors at most one.
- The check sits in the first-tick loop and the respawn loop
  (`sys/mob.go:183-188`, `:218-224`).
- On a change: a point whose gate opened spawns now; a point whose gate
  closed despawns its live mob (precedent: `encounter.System.Despawn`,
  `encounter/system.go:146`).
- A species swap is two points at one position, one `whileEffect` and one
  `unlessEffect`, under the same key.
- A lit tunnel is a visitor carrying a light **passive** (`api/skills/torch.json`
  is one). ⚑ Not a light aura: a creature's aura is off until it is aggroed
  (`mob.go:236-244`), a passive is always on. Light radius is already
  streamed for mobs (`codec/mob.go:58`).

### 3.6 Modifiers

| Stat | Read site | Note |
|---|---|---|
| `xpGain` | after `curve.KillXP.Award` in `killXPFor` (`model/mob/mob.go:2354`), and at the quest `grant_xp` (`sys/interaction.go:1356`) | NOT in `player.AddExperience`: that carries the cheat. A gray kill stays 0 (L3). |
| `regen` (downtime) | `model/player/update.go:59-60` | one line |
| `respawnRate` | `rollDelay`, `sys/mob.go:392-398` | on the rolled value, before the clamp |
| `unlockChance` | `rewardPlayer`, `mob.go:2380-2386` | the roll is always consumed (RNG stream rule) |
| mob `maxHealth` | `Mob.MaxHealth()`, `mob.go:1889` | see below |
| mob `damageTaken` | the `hp32` line, `mob.go:1959` | |

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
`belowLevel` (the player), `source` (`kill` or `quest`), and for mob
modifiers the selector itself (`species`, `faction`, `tier`, a level band).

### 3.7 Quest windows (D7)

- The offer is gated by the condition kind, on the node that offers it.
- The quest file gains `window: { "effect": "...", "graceSeconds": N }`.
- The deadline is **derived, not stored**: while the effect is active there is
  none; once it ended the deadline is the effect's last expiry plus the grace.
  The quest ledger needs no clock and `quests/persist.go` no new field.
- Online: `QuestSystem.Update` checks once per second. At login: right after
  `Restore` (`sys/persist.go:483-487`).
- If the effect was triggered again in the meantime, the quest simply lives
  on.

### 3.8 Heir effects (D11)

- Keyed **(account, slot)**, like `bloodline_unlocks`, because the heir does
  not exist when the ascension commits (the C2b lesson: state keyed by slot
  cannot hang off a row that does not exist yet).
- Wall clock from the ascension: the rows are written in the ascension
  transaction and loaded when a character in that slot joins.
- **Afterglow** is evaluated at the moment a kill pays, never per tick: for
  each credited player, one `space.AppendCircleDynamics` probe
  (`phy/space.go:199`) finds heirs in range. It only raises the XP of players
  the kill already pays; it never adds recipients, so the unlock RNG stream
  does not shift (`mob.go:2275-2279`).
- The ring is visible to others, so its radius rides the wire beside
  `light_radius` on `Character`.

### 3.9 Visibility (D5, D12, D13)

- **Banner**: `chat.ChatSystem.Broadcast` (`sys/chat/system.go:25`), the path
  the warlord uses. No wire change.
- **HUD**: `Welcome` is marshalled once per server lifetime
  (`core/game.go:99-122`) and cannot carry changing state. A new server message
  carries the active world effects (name, expiry as wall-clock seconds so the
  client counts down by itself, contributors) and the player's own heir
  effects; sent at join and on change only. There is no own-player buff tray
  today (`applied_effects` is a bitmask without durations), so the indicator
  is a new HUD element.
- **Memorial**: the graveyard query returns the cause key; the row reads the
  name plus the cause's `epitaph`.
- **Dialogue**: a node gated on an effect may use `{name}` for the latest
  contributor.
- **The command**: `EFFECT start <key> [seconds]`, `EFFECT stop <key>`,
  `EFFECT list`, a closure in `NewCommandSystem` like `ANNOUNCE`
  (`sys/cmd/cmd.go:228-236`). It is also the harness's only way to test an
  effect without a level-30 character.

### 3.10 GDD amendments this plan carries

| Where | Amendment | State |
|---|---|---|
| §5 "Meta-Progression: Character Sacrifice", *Rewards are breadth, never power* and the *Explicitly forbidden* list | Retired by D2 (timed effects) and D16 (the gift). The design test *"does a player who never sacrifices feel weaker in the endgame?"* no longer governs. | dated note applied 2026-09-27, the old text kept for its rationale |
| §5, the reward catalog | An ascension has two outcomes: the gift and the cause (D8). | owed, with the first built chunk |
| §7 "Special Events" | The boss-kill world event is a later trigger of this primitive (D15). | owed, when that trigger is designed |

---

## 4. Performance

| Path | Cost |
|---|---|
| Per tick, per mob (`MaxHealth`, damage taken) | one slice index and one multiply |
| Per kill | one add per credited player; Afterglow adds one grid probe per credited player |
| Present path (`conditionsPass`, L15: O(1) only) | one slice index. ⚑ The evaluator receives only the player (`sys/interaction.go:1402`), so the flag reaches it through a `learner` method reading the controller's snapshot |
| Respawn loop | one slice index per waiting point |
| Effect start or end | rebuilds the derived tables and walks spawn points and live mobs once. A few times per day |
| Expiry check | once per second |
| Wire | nothing per tick. One small message per player at join and per change |
| Database | one upsert inside a transaction that already runs; one read at boot |

Nothing here scales with the number of active effects on a hot path: the
derived tables are flattened when the set changes.

---

## 5. Fun and fairness

What the rulings buy, and what they knowingly give up.

- **D9 turns the balance ceiling into an authoring fact.** No runtime cap on
  the summed bonus exists or is needed: the maximum is "every authored effect
  active at once", which a content check can compute at boot. The simharness
  batteries run at a multiplier of 1.0 and cannot see any of this, so the
  guardrails should be pointed at that worst case (§7, C1).
- **Ascension now feeds itself**: faster leveling, more ascensions, more
  bonus. The dampers are the stone's price, the per-effect extension cap and
  the number of effects authored. All three are content numbers.
- **Capped extension still allows always-on.** Under steady ascensions a
  popular effect never lapses. Anything gated by an effect must be good
  content in both states, for an unknown length of time.
- **A small server sees few effects.** Content that exists only inside a
  window may go unseen for weeks. The command lets the PO run one by hand.
- **D1 with D3 makes griefing possible by choice.** A removal on a pick list
  is a player acting on others. D7's grace softens the quest case; the
  remaining guard is which removals an author puts on a list. This gives up
  part of "no griefing possible by design", by ruling.
- **D16 lets bloodlines grow in power.** A veteran's tenth character may be
  stronger than a newcomer's first, permanently. In a game without PvP and
  with shared XP that is a gap between helpers and helped, not between
  rivals, but group content tuned for veterans will be harder for a server
  of newcomers. Gift power is a content number like every other.
- **The heir clock runs while the player sleeps** (D11). That is the wanted
  urgency. The confirm should say that the boost starts now and how long it
  runs, and character select should show what is left.
- **Timezones**: no floor (D6). A two-hour effect belongs to whoever is
  online. An author who wants everyone to see it authors a day.

---

## 6. Schema and wire impact (stated per the standing rule)

**Database: one new migration pair, `000003_world_effects`.** Shipped SQL is
untouched.

| Object | Columns | For |
|---|---|---|
| `game.world_effects` | `effect_key` PK, `started_at`, `expires_at` | the active set, and the last expiry of ended effects (§3.7) |
| `game.world_effect_contributions` | `effect_key`, `character_id` (nullable: a command has no character), `contributed_at` | D12. Names are joined, never copied, and the reader reuses the memorial's exact-match `'deleted_' \|\| id` filter, so an erased account's names are hidden the same way |
| `game.heir_effects` | `account_id`, `slot_index`, `effect_key`, `expires_at`; PK on the first three | D11 |
| `game.characters.cause_key` | nullable `TEXT` | D13 |

Standing rules apply: the `game.` namespace, no `ON DELETE CASCADE`. The live
database is un-backed-up by ruling (PO 2026-08-04): running effects die with
it, which is acceptable for timed state. `store` and `accounts` tests run with
`AURA_TEST_DB_URL` set.

**Quest ledger: NONE** (the deadline is derived, §3.7).

**Wire**: +1 `ServerMessageBody` member (value 8, the values are pinned,
`server.fbs:1126`); +1 appended `float` on `Character` for the Afterglow
radius. Appended fields renumber nothing, but this is a both-sides deploy with
a hard reload for connected players.

**Zone format**: +2 optional keys on a spawn. Absent means ungated, so no
shipped zone file changes.

**Content**: +2 directories (effects, causes), each in `contentSources` and
`cp-defs`; +1 condition kind; +1 optional quest block; +1 node list on the
stones.

**Conf**: none.

---

## 7. Chunk breakdown (PROPOSAL, nothing approved)

Ordered so that every chunk is visible in-game by itself.

| Chunk | Contents | Schema |
|---|---|---|
| **C1** the primitive | the effects directory and registry, the controller, migration `000003` (world tables), restart survival, the `EFFECT` command, banners, the `xpGain` modifier at both award sites, the "everything active" content check | DB +1 migration |
| **C2** the HUD | the server message, the indicator with time left and contributors | wire +1 message |
| **C3** the ceremony | the causes directory, the second pick, the cause inside the ascension transaction, the memorial epitaph, heir rows and the heir XP boost, time left on character select | DB: the heir table and the cause column (same migration if C1 has not shipped, a new pair if it has) |
| **C4** spawn gates | the two spawn keys through all three zone writers and the Tiled class, the gate, spawn and despawn on change | zone format +2 keys |
| **C5** conditions and quest windows | the condition kind, the quest `window` block, grace and abandon online and at login, `{name}` in dialogue | none |
| **C6** the remaining modifiers | regen, respawn rate, unlock chance, mob HP and defence with their selectors and limits | none |
| **C7** Afterglow | the kill-time probe, the ring, the wire field | wire +1 field |

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
  sets).
- Quest window: abandoned at login when the grace passed offline; alive when
  the effect was re-triggered.
- In-game, per chunk, through the command. ⚑ A harness leg behind a real
  ascension needs a level-30 character; use the cheat path.
- Content tests read `api/` from disk: `-count=1`.

---

## 8. Open questions

| # | Question |
|---|---|
| **Q1** | **The word.** Open by ruling (D18), see §8.1. |
| ~~Q2~~ | ✅ **ANSWERED by D16**: the rule is retired for the gift too. |
| ~~Q3~~ | ✅ **ANSWERED by D17**: optional, with a "no cause" row. |
| **Q4** | **Does server downtime count against a running effect?** Proposed yes (P3). |
| **Q5** | **A gated mob whose window closes while it is being fought** (P4 proposes it stays until the fight ends). |
| **Q6** | **Several Afterglows in range**: the strongest, or the sum? (P6 proposes the strongest.) |
| **Q7** | **Does the journal show a windowed quest's deadline?** That is one more wire field on the journal entry. |
| **Q8** | **Permanent effects** for community goals (D15): an effect with no expiry. Not designed here. |
| **Q9** | **Every number**: durations, caps, bonus sizes, the Afterglow radius, the grace. |
| **Q10** | **Player-chosen names now reach banners and NPC speech.** The character-name content filter is an open item (`CLAUDE.md`, smaller open threads); this plan raises its priority. |
| **Q11** | **The first real content**: which stones offer which causes, and what the first visitor, hunt and quest window are. |

### 8.1 The word (Q1, open by ruling, PO 2026-09-27: "need a deeper discussion")

**Why it matters before the first chunk.** The word becomes a content
directory, a Go package, a wire message, a spawn key, a condition kind and a
HUD label in the same session. Renaming afterwards costs the three-key rename
`plan-zone-naming.md` N2 is still paying for.

**What the word has to survive:**

1. It must not be a bare "effect". That already names a skill's `effects[]`,
   the `applied_effects` bitmask and `EffectPips`, and "effect types" is a
   finished project of its own.
2. It must fit good and bad alike (D3): a blessing cannot make wolves
   vanish from a quest.
3. It must fit every trigger (D15). *Cause* is right at the stone (D8) and
   wrong for a calendar date, so the pick and the thing are two words.
4. It must fit both scopes. The heir's boost is not a state of the world.
5. It must read in a banner and on a HUD label without explanation.

**Candidates so far**, none ruled:

| Word | For | Against |
|---|---|---|
| *world effect* | plain, needs no teaching | fails 4; still says "effect" in every sentence |
| *omen* | short, neutral in sign, reads well in a banner | an omen foretells, it does not act |
| *tide* | rises, lasts, ebbs: fits extension and expiry | not obvious at first read; odd for the heir |
| *legacy* | what a character leaves behind; fits the heir scope best | wrong for a boss kill or a date |

**Until it is ruled** this doc says "world effect" and "heir effect", and the
sketches in §3 use `whileEffect`, `world_effect_active` and `worldfx` as
placeholders. No chunk starts before the word is ruled.

---

## 9. Proposals adopted without a choice prompt (PO may veto any)

| # | Proposal |
|---|---|
| **P1** | The heir is the next character in the **same slot**, not the account. |
| **P2** | The **database owns the expiry**: the upsert computes it, the loop adopts the returned value. |
| **P3** | Effects run on the **wall clock through downtime**. A two-minute deploy costs an effect two minutes. |
| **P4** | A closing gate does **not** despawn a mob that is in combat; the mob leaves when the fight ends or it dies, and does not respawn. D10's "at once" was ruled for stat changes. |
| **P5** | When a mob modifier starts or ends, a living mob's health is scaled with its maximum, so **its health ratio is kept**. Without this a mob whose maximum rises looks damaged (raising the maximum never raises current health, `mob.go:1176-1180`). |
| **P6** | Afterglow does not stack with itself: the strongest glow in range counts. A player carrying their own heir boost gets the larger of the two. |
| **P7** | The cheat XP command is **not** multiplied. |
| **P8** | The quest deadline is **derived** from the effect's last expiry, never stored per quest. A lost effect row reads as "expired long ago". |
| **P9** | A spawn point authors **at most one** gate key. |
| **P10** | The cause is validated by the resolver passed at construction, the way the ascension catalog is (the C3 lesson: a validation pass that walks "every X" misses the second surface). |

---

## 10. Landmines

- **L1: three zone writers.** A new spawn key means `zone.go`
  (`DisallowUnknownFields`), `ZoneModel.getZoneAsJSON()` (a hand-written
  whitelist: the first in-game save deletes what it does not know, which
  already ate `spawn.level` once) and `aura-convert.js` plus the Tiled class,
  in one commit. The completeness pin reddens by design.
- **L2: all three zone files carry uncommitted PO authoring** (zone-naming
  L2). C4 adds optional keys and edits no zone file; keep it that way.
- **L3: `cmd/aurad` type-asserts its seams at runtime.** A new sink method
  builds green and dies at boot unless `core/game.go` carries the
  compile-time assertion.
- **L4: a new content directory must join `contentSources`** and its coverage
  test (`loaders_test.go`), and `cp-defs`. `backend/pkg/api/` is only partly
  gitignored.
- **L5: the first passing node is the greeting** (`present()`). A node gated
  on an effect that sits above the fallback becomes the greeting for everyone
  while the effect runs. That is sometimes the wanted thing (the NPC talks
  about the ascension) and sometimes not.
- **L6: completion is not cancellation.** `CancelCast` clears the pending
  pick; the cause travels in the same struct and must survive completion the
  same way.
- **L7: dormant mobs skip `Update`**, so their health clamp waits until they
  wake and `HealthRatio()` can read above 1 for a moment (`sys/mob.go:203-206`).
  P5's scaling must reach dormant mobs too.
- **L8: two unique constraints on one insert report the older one.** The new
  tables' error mapping must name every constraint the upsert can trip.
- **L9: a content edit does not invalidate the Go test cache.**
- **L10: a new mob (every visitor, every hunt target) reddens the three
  census tests and the three simharness placement pins.**
- **L11: `Restore` runs before the quest notifier is installed.** The
  login-time abandon clears the fields directly and bumps the revision; it
  must not go through the notify path.
- **L12: the content editor knows none of this.** Neither new directory has a
  tab, and the editor's JS validator (`validate.mjs`, the stale-port class of
  `plan-content-editor.md` §B3) will flag the new spawn keys, the quest
  `window` block and the new condition kind on every open until it is
  patched, or until §B11 Q7 (Go validation on save) retires it.

---

## 11. Chunk ledgers

None. Nothing is built.
