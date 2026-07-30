# Plan: the quest system — journal-carried quests on the interaction container

**Status: chunk C1 ✅ DONE 2026-07-30 (the ledger + events, backend only — full
ledger §11). Prerequisite chunk P ✅ 2026-07-30 `d45ba07c`. Next: C2 (dialogue
vocabulary); C0 remains standalone filler.**
**CODE-REVIEWED 2026-07-30** — three line-level sweeps (interaction container ·
XP/credit path · wire + content loading) checked every claim against HEAD;
corrections are folded in below, tagged *(code review)*. Four follow-up PO
rulings the same day: **D14–D17**. The review's one sequencing change: **Pass 3
item 1 of `plan-playtest-feedback.md` (presence-counts attribution, ruled
2026-07-29, unbuilt) ships BEFORE C1** (D15), so quest counters launch on the
final credit rule. New landmines L11–L15.
**Origin:** backlog §42 ruled the pillar (2026-07-29): quests exist, carried by
Gothic-diary journal entries, **no markers ever**, sidebar tracker a maybe — the
ruling lives in `gdd.md` §8 → "Quests & the Journal". This doc is the design
session that followed (same day): what a quest *is* mechanically, how it
progresses, and what has to be built. The PO's framing: the vision sits between
Gothic and WoW — written directions and resources, never markers; diverse quest
natures (kill-N, talk-to, find, and a skills-as-trade-goods idea in place of
item fetch).

Read together with: `backlog.md` §42 (the tension record + pillar ruling),
`gdd.md` §8 (Quest-like Content Through Existing Systems · Quests & the
Journal), `archive/plan-entity-model.md` §8b (the latent-trap set that
explicitly arms "the day quest-style content is authored" — L1/L2/L3/L4 below
are from it), and `plan-playtest-feedback.md` §Pass 3 item 1 (the
presence-counts attribution rework, now this plan's prerequisite chunk P per
D15).

---

## 1. The design in one paragraph

A quest is an authored content object (`api/quests/*.json`) made of **stages**;
quest state lives **on the player**, advanced **by events**, never on the NPC
(ruled in §42 before this session). A stage is either an **objective stage**
(kill-N / harvest-N / talk-to — auto-advances when the player's lifetime
counters satisfy it) or a **dialogue stage** (waits for the player to click an
authored row somewhere in the world). Offer, advance and turn-in are ordinary
conversation rows — new `GrantKind`s on the interaction container, exactly the
extension it was designed for. **Branching is dialogue-shaped:** several rows on
several NPCs can advance the same stage to *different* next stages with
*different* rewards — which is how "two NPCs can complete the quest" and,
later, camps fall out of the schema instead of being features. The journal is
the read model: each stage carries authored diary text, appended when the stage
is entered, grouped per quest under running/completed.

## 2. Decisions (all PO-ruled 2026-07-29, this session)

| # | Ruling |
|---|---|
| **D1** | **Multi-stage with branching, from the start.** The stage graph is first-class; branch points are dialogue rows (the player's click chooses the edge). Objective stages have one outgoing edge; divergence happens at dialogue. |
| **D2** | **First-pass verbs: kill-N, talk-to-X, harvest-N.** Discover-location is deferred — it is the one verb needing genuinely new machinery (named-area triggers), and it couples to §41's clue-anchor scoping. Harvest-N is kill-N of a harvest species: **same counters, no separate machinery.** |
| **D3** | **Retroactive credit, via lifetime counters.** The ledger keeps per-species kill/harvest counters and a talked-to set for the character's whole life; an objective is satisfied when the counter meets the authored threshold. PO leaned retroactive pending cost; the cost analysis (§3) put the mechanical delta at ~zero, so it is locked. Known design consequence, accepted: a veteran auto-completes on accept ("you've already slain them? Take this." — the Gothic feel); *"kill 8 MORE"* is inexpressible until a per-quest opt-out flag, deliberately deferred. |
| **D4** | **Quest credit = XP credit, by construction.** The lifetime counter increments at the same event that grants kill XP — quests and XP agree on what "you did" means, *whatever the attribution rule is*. *(Code review 2026-07-30:)* the hook is real and single — `rewardPlayer` (`model/mob/mob.go:1922`), fed by the mob's participant set — but the code's **current** rule is damage-touch participation + healers who landed ≥1 HP inside 10 s, **not** presence. "Presence counts" is the ruled-but-unbuilt **Pass 3 item 1** rework (`plan-playtest-feedback.md`, ruled 2026-07-29: aura active during the fight = credit, a light that lit nobody earns). Per **D15** that rework ships before C1; either way the quest side is a pure consumer downstream of the participant set and inherits any future attribution change with zero quest-side code. Charm/summon/companion credit already flows through `CreditTo()` (`model/mob/charm.go:71`, `sys/skills.go:494`) into the same call — a companion's kill counts for its owner for free. |
| **D5** | **Quest state is per-character.** The journal is this character's diary; a fresh character replays the world. Account-wide reward stays the sacrifice loop's job. (Couples loosely to §36/§41 scoping — step 8 confirms, see §8.) |
| **D6** | **One-shot, with schema room for repeatables.** A `repeatable` flag exists from day one; nothing authors it. The completed-set semantics are defined now so the flag is additive later. |
| **D7** | **Journal UI = Gothic 1's actual shape:** entries grouped under their quest, sections for running and completed. Not the flat chronological diary; not a checklist — entries are still only prose the player has already seen. |
| **D8** | **Skill turn-in ("bring me X" via trading a skill): SCHEMA ROOM ONLY.** Advance rows carry a typed `costs` list with an `unlearn_skill` kind defined in the vocabulary; **nothing authors it** until un-learning is ruled (slot eviction, combination ingredients, invested skill levels — open question, §9). |
| **D9** | **Plan for choices.** Two (or more) NPCs can be eligible to complete the same quest with different rewards — D1's branch edges make this pure content. Explicitly named as the seam the later **camps** concept plugs into. |
| **D10** | **Consequences: schema room, author none.** Advance rows also carry a typed `consequences` list (faction standing, hostility flips — the allegiance verbs from `archive/plan-faction-flips.md` were built with quest-turns-hostile as a named consumer). First pass authors only reward divergence; camps get their own design session. |
| **D11** | **Quests start at conversants only.** Every quest begins at a dialogue row — NPCs, signs, anything with an `interaction` block (the ForestSign counts for free). Kill-started / discovery-started would be a later additive trigger kind. |
| **D12** | **Build the first pass BEFORE step 8**, session-scoped exactly like the spellbook and level are today (everything wipes on restart anyway). Step 8 then persists a **live** ledger instead of a paper shape — and gets the shape as a known input either way. |
| **D13** | **Abandon yes, failure no** *(ruled 2026-07-29, follow-up prompt)*. A running quest can be abandoned from the journal: it returns to not-started (its stage path cleared, its diary entries gone) and is offerable again. The completed set is untouchable — a finished one-shot stays finished. No failable quests, no third journal section; a branch taken within a *running* quest is undone by abandoning, a branch sealed by *completion* is forever. See L10 for the XP-loop guard this makes necessary. |
| **D14** | *(ruled 2026-07-30, code-review follow-up)* **Quest catalog = minimal projection.** `/quests` serves only what the client renders — quest id, title, per-stage diary prose. Objectives, thresholds, the stage graph and rewards are **never served** (rewards live in the NPCs' interaction JSON, which has no endpoint at all). This is the `/mobs` zero-hint philosophy (`items/mobs/catalog.go:19-23`), not the `/skills` serve-everything one. Accepted residual leak: diary prose of unreached stages is curl-readable — no accounts means no per-player gating is possible. |
| **D15** | *(ruled 2026-07-30)* **The presence-counts attribution rework (Pass 3 item 1, `plan-playtest-feedback.md`) ships BEFORE C1**, as its own chunk, so quest counters never operate on the interim damage-touch rule. Quests stay a pure consumer of the credit event either way (D4). |
| **D16** | *(ruled 2026-07-30)* **Journal access: hotkey + HUD button.** `J` (free today — `E` is interact, `R` is cooldown slot 2) plus a small HUD button. |
| **D17** | *(ruled 2026-07-30)* **Stage entry / completion pings an alert banner** ("Journal updated", the unlock-banner channel). Garnish only, safe to lose on a dropped frame — the durable state rides `GameState` (L8). |

Standing constraints inherited, not re-decided: **no markers, ever** (GDD §8);
rewards are **actives / passives / cooldowns / XP only, no items** (GDD §7) —
which is precisely why D8's skill-trade is the only "fetch" shape possible;
sidebar tracker stays a *maybe* and is **not** in the first pass.

## 3. The retroactive-vs-after-accept cost analysis (what D3 rested on)

After-accept needs a per-quest counter map created at accept; retroactive needs
a lifetime per-species counter map (~64 species × one integer) plus a set of
talked-to conversant ids. Both are trivial in memory, both hook the same
existing kill/XP-attribution event, both add a small blob to step 8's character
record. The difference is not technical but authorial: retroactive trades away
"do it again" pacing for the diary-native "the deed already stands". D3 takes
that trade knowingly.

## 4. The quest object, the ledger, the events

**Content** (`api/quests/*.json`, one file per quest — loaded via a new
`contentSources` entry, see L5):

- `id`, `title`, `repeatable` (D6, unauthored)
- `stages[]` — each: `id`, `journal` (the diary prose appended on entry),
  and *either* `objectives[]` (kind `kill`/`harvest`/`talk_to`, species/npc,
  count; satisfied against lifetime counters per D3) with a single `next`,
  *or* nothing — a dialogue stage, advanced only by authored rows (D1).
  A stage with no outgoing edge is terminal; entering it completes the quest.

A quest file deliberately does **not** know who offers or advances it — those
rows live in the NPCs' interaction JSON and *reference* the quest (D9/D11: any
number of conversants can carry rows for the same quest; the file stays the
single source of truth for stages and prose, the world decides who talks about
it).

**Ledger** (per character, on the player, session-scoped until step 8):

- `quests`: quest id → ordered list of stage ids entered (+ completed flag).
  The *order* is stored, not just the current stage — branch paths differ, and
  the journal renders the entries for the stages this character actually walked
  (L6).
- `killCounts` / same-map harvest counts: species → lifetime count (D3, D4).
  *(Code review:)* keyed by **`MobID`** (unique 1–64, already on the wire) —
  never `EntityType`, and quest JSON authors species by *name* like zone spawns
  do, resolved at load. See L12 for why, and for the duplicate-id boot guard
  this requires.
- `talkedTo`: set of conversant **definitions** (`MobID`), stamped at the single
  session-open point (`SetConversingWith`, `sys/interaction.go:234` — a set
  makes its non-edge-triggered nature harmless). *(Code review:)* entity ids
  are process-local and reset on every respawn and restart, so they cannot key
  this set (L12).

**Events:** the counter increments ride the existing kill-credit fan-out —
`rewardPlayer` (`model/mob/mob.go:1922`), the one place "player P earned credit
for mob M" exists, downstream of the participant set so it inherits the D15
attribution rework and charm/summon `CreditTo()` routing for free (D4 — one
hook, no second crediting rule). The increment fires on **participation, not XP
amount** (L13 — 28 of 64 defs author `experience: 0` and a Bramble harvest must
still count). After any counter change or dialogue advance, the player's
*running objective stages* are re-checked — **event-driven at the credit event,
not a per-tick scan** (the idle-alloc discipline, `fe0044d0`); a satisfied
objective stage advances, appends its successor's journal text, and pings the
D17 banner. *(Code review:)* the `Unlock` channel is a **garnish precedent,
not a state channel** — see L8 for what actually carries the ledger.

## 5. Dialogue integration (the container extension)

New vocabulary on the shipped interaction container — every piece an additive
case behind the existing hard-fail loaders:

- **Grant kinds** (beside `teach_skill`): `offer_quest` (quest id — moves
  not-started → first stage), `advance_quest` (quest id, from-stage, to-stage —
  the branch edge; carries the row's other grants as the reward), `grant_xp`
  (amount, the second GDD-legal reward — must ride the normal level-up path,
  L9). *(Code review — a new kind is ~5 files, not 1:)* the loader today
  resolves a `skill` for **every** grant unconditionally
  (`items/mobs/interaction.go:238`), so C2 makes payload resolution per-kind,
  adds the new fields to both grant structs, relaxes the content pin
  `TestContent_EveryGrantIsAResolvedTeach`, and converts the two runtime
  `!= GrantTeachSkill` dispatches (`sys/interaction.go:446`, `:515`) into
  switches so the fourth kind is one case, not another comparison.
- **Condition kind** (beside `minLevel` — *(code review)* that is the authored
  spelling, not `min_level`): `quest_at_stage` (quest id +
  stage id | `not_started` | `completed`) — node-level, like all conditions
  today (L2). This is what makes an NPC's dialogue change as the quest
  progresses, hides the offer once running, and shows the turn-in only when
  earned. `present()`'s existing rule — an option whose `next` targets a
  condition-failed node is hidden — already propagates node gating onto rows.
  *(Code review:)* the evaluator's only input surface is the `learner`
  interface (`sys/interaction.go:365-369`) — `quest_at_stage` widens it, which
  is the one real coupling point; the ledger accessor it adds must be an O(1)
  map read, because `present()` runs per tick per conversing player (L15).
- **Schema room lists on advance rows** (defined, validated, unauthored):
  `costs[]` with kind `unlearn_skill` (D8) and `consequences[]` (D10, kinds
  reserved for faction standing / hostility).

## 6. Journal UI + wire

- **Catalog:** `/quests` is a **minimal projection** (D14) — quest id, title,
  per-stage `journal` prose, nothing else. Marshalled once at boot like the
  existing handlers; one entry in `aurad.go`'s sidecar map covers both boot
  paths. Client side, a `Quests.ts` on the `catalogUrl()` pattern (fetch at
  import, `.catch()` degrade — the global vitest fetch stub already covers a
  new module). The degrade is explicit: a failed fetch renders a "journal
  unavailable" state, **not** an empty journal — an empty journal is
  indistinguishable from having no quests.
- **The ledger rides `GameState` every tick** — quest id + ordered stage ids +
  completed flag, like the spellbook and the conversation tree. *(Code review —
  this replaces the session's original "full state at join + event-driven
  updates", which has NO precedent here: `Welcome` is a single shared buffer
  built once (`core/game.go:85-96`) and physically cannot carry per-player
  data, and `EntityMessage` is droppable, L8.)* Ids only — prose stays in the
  catalog, so the payload is far smaller than the ~2 KB conversation tree
  already re-sent 30×/s. The client diffs with the **view-signature pattern**
  (`Conversation.ts:38-48`) from day one — load-bearing, not an optimisation:
  the journal has clickable rows (abandon, D13), exactly the
  click-in-the-teardown-gap hazard the signature was written for.
- **Banner:** stage entry / completion emits a new `Journal`
  `EntityMessageKind` (**pinned = 2** at birth, §28) carrying only the banner
  string (D17) — the same state-vs-garnish split the spellbook uses (state on
  `GameState`, `Unlock` carries only the attribution line). New enums/fields
  follow the §28 pin discipline; all four unions are pinned since R1.
- The journal panel: grouped by quest, running/completed sections (D7), prose
  only, opened by `J` + a HUD button (D16), `pointerdown` not `click` (the
  standing HUD gotcha). Expect §39's presentation rework to restyle it later —
  keep the first pass plain.
- No markers of any kind; no tracker in the first pass.

## 7. Landmines

- **L1 — the N1 trap is a prerequisite, not a nice-to-have.** A row that both
  *grants* and *navigates* is broken independently at both ends today
  (`archive/plan-entity-model.md` §8b: server grants rows `present()` hid;
  client swallows the grant's line when following `next`). Quest turn-in rows
  are exactly that shape — reward plus follow-up node. Fix both ends first
  (C0), red tests in the direction L24 originally asked for.
- **L2 — option-level conditions do not exist.** `jsonInteractionOption` has no
  `conditions` field (`items/mobs/interaction.go:158-163`). **Re-verified
  2026-07-30:** `DisallowUnknownFields` IS on the mob loader
  (`definitions.go:296`), so an authored option-level `conditions` hard-fails at
  boot — but **two stale comments claim the opposite**
  (`items/mobs/interaction.go:141`, `interaction_content_test.go:134`); C0
  fixes them before they mislead the C2 implementer. Quest gating therefore
  works node-level + the hidden-inbound-option rule; if authoring pain demands
  option-level conditions, that is a C2 decision, not an accident.
- **L3 — node array order silently selects the greeting.** Quest-conditional
  greeting nodes must sit *above* the unconditional root or they can never be
  selected. Authoring discipline today; consider a loader lint in C2 (an
  unconditional node above a conditional one = the latter is dead).
- **L4 — the 255 index sentinel.** `option_index`/`grant_index` are `ubyte`
  with 255 = none and no loader count limit; `present()` truncates with bare
  `uint8()` casts (`sys/interaction.go:437`, `:473-474`), so a 256th entry
  silently aliases index 0. Quest content is what grows option lists. The C0
  guard caps **both options and grants at ≤254 per node/option** — 254, not
  255, because *(code review)* `option_index` has no 255-default on the server
  schema (`server.fbs:358`), so 255 is currently a *legitimate* authored index
  colliding with the client's none-sentinel. Minor cousin, note only:
  `RequiredLevel` is display-clamped to 255 (`:478`) while `applyGrant`
  compares the true `uint32` (`:524`).
- **L5 — `contentSources` must gain `quests/`, and it is ~5 hand-synced edits,
  not one** *(code review)*: three edits in `cmd/aurad/loaders.go` (struct
  field, embedded map, `sub("quests")`), a **new embed package**
  `pkg/api/quests/quests.go` — where the pinned landmine is the glob
  (`pkg/api/skills/skills.go:5-8`: a bare `*.json` silently drops
  subdirectories), the hardcoded `cp-defs` list in `backend/Makefile:16`, and
  CLAUDE.md's "seven directories" prose. The standing rule holds — a missing
  directory hard-fails, an *unregistered* one is invisible — and **no test can
  catch the unregistered case**; worse, **production runs disk mode**
  (`devops/aurad.service:9` → `-content ./api`), so the silent no-op reaches
  the live server. Also: there is no single boot-counts line — each loader logs
  its own `slog.Info`, so C1 adds a `Loaded quest definitions` line **and**
  updates the verify skill's grep (`.claude/skills/verify/SKILL.md:29`, which
  enumerates types by name — a quest count is invisible to every harness until
  that regex is edited; its expected counts are also stale, 75/12/40 vs the
  current 83/15/64). `deploy.sh` needs nothing (it copies `api/` whole).
- **L6 — store the path, not the position.** Grouped journal rendering needs
  the *ordered list of stages entered* per quest; branch paths differ per
  character, and "current stage" alone cannot reproduce the diary.
- **L7 — retroactive thresholds are lifetime totals.** An author writing
  `count: 8` must mean "has ever killed 8", not "kills 8 now". Manual-content
  note + review point until the opt-out flag exists.
- **L8 — `EntityMessage` is a garnish channel, never a state channel** *(code
  review — this corrects the session's original "journal updates ride the
  EntityMessage precedent")*. `Unlock` carries **no state**, only the banner
  string; the spellbook's real state rides `GameState` every tick and the
  client diffs it. The channel is lossy by construction: `SendMessage` drops on
  a full buffer (`net/client.go:132-142`) and **all four `SendUnlock` call
  sites discard that error** — safe precisely because durable state is re-sent
  30×/s. And `EntityMessage.entity_id` is already triple-overloaded (entity id
  / 0-broadcast / skill id) with no room for a stage path. So: ledger state on
  `GameState` (§6), the D17 banner as the only EntityMessage use, and pin every
  new enum value at birth (§28).
- **L9 — `grant_xp` goes through the front door, and the front door is
  smaller than the session assumed** *(code review)*. The path is
  `AddExperience` (`model/player/player.go:667`) — level derivation, clamp at
  1, heal-to-new-full, milestone unlocks + recipe cascade; the XP cheat is
  literally `p.AddExperience(xp)` (`sys/cmd/cmd.go:113-126`), proving external
  drivability. But the **band lock has no runtime existence** — it is an
  offline authoring convention (`sim/chain.go`, CLAUDE.md's Session-⑥ rule)
  with zero clamping at award time, and the path announces nothing. Quest XP
  amounts are therefore a **C4 authoring budget respected by hand**, not a
  mechanism the engine enforces.
- **L10 — abandon + mid-quest XP is a faucet (D13).** Abandoning resets to
  not-started while lifetime counters stand, so objective stages re-complete
  instantly on re-accept — any `grant_xp` on a *non-terminal* edge becomes
  loopable XP. Loader lint in C2: `grant_xp` is legal only on edges into a
  terminal stage (completion is protected by the completed set, which abandon
  never touches). `teach_skill` is idempotent and may sit anywhere.
- **L11 — the ledger must join the death/reconnect stash or it wipes on every
  death** *(code review — the review's biggest C1 gap)*. The player struct is
  destroyed and rebuilt on death and on reconnect; only `progression` +
  `SkillComponent` survive, via `deadState` (`sys/state.go:48-53`) and
  `reconnectStash` (`:69-79`). The ledger joins the stash at all five sites
  (`deadState`, `reconnectStash`, `tryRespawn`, `reattach`, `tryJoin`),
  mirroring the `SkillComponent` pointer-carry pattern — and C1's TDD list
  gains "ledger survives death and reconnect", without which no existing gate
  would notice the wipe.
- **L12 — identity keys are trapped** *(code review)*. Species =
  **`MobDefinition.ID`** (`MobID`, unique 1–64, already on the wire) — never
  `EntityType`, which is a sprite key with 9 overrides (Emberkeeper/
  Lamplighter/Shaman all render as `"Hermit"`). Conversants = the definition's
  `MobID` — never the entity id, which is process-local and resets on every
  respawn (`sys/mob.go:114-135` spawns a fresh entity) and restart. Two
  hardenings ride this: `registry.add` **silently overwrites a duplicate
  authored id** (`items/mobs/registry.go:42-44`) — C1 adds the two-line boot
  guard before counters key on ids — and 10 defs are `legacy: true` (never
  spawned by the live world), so C2's cross-validation rejects a quest
  objective or turn-in naming one, else `kill Rabbit` boots green and is
  uncompletable.
- **L13 — count participation, not XP amount.** 28 of 64 defs author
  `experience: 0` and `rewardPlayer` still runs for them; gate the counter on
  XP and every harvest-Bramble quest is impossible. Note the fragility, not
  bug: a player's own expiring totem is uncounted only *incidentally* (TTL
  expiry bypasses rewards, `mob.go:922-926`, and no friendly fire means an
  empty participant set) — if content ever makes enemy structures attackable,
  "destroy N totems" starts counting, which is a feature.
- **L14 — widening `model.PlayerEntity` breaks four hand-written fakes**
  (`model/mob/mob_test.go:100`, `sys/skills_behavior_test.go:164`,
  `encounter/smoke_test.go:33`, `sys/cmd/cmd_test.go:27`). Price it into C1;
  don't discover it at compile time.
- **L15 — `present()` already runs per tick per conversing player and
  allocates** (visibility map + slices, against the idle-alloc discipline its
  own neighbouring comment cites), and `conditionsPass` runs **twice per node**
  (`selectNode` + the visibility pass). Quest conditions multiply this — fine
  iff `quest_at_stage` is an O(1) map read on the player. C2's cheap courtesy:
  hoist `selectNode` onto the visibility map, halving condition evaluation. Do
  **not** build memoization or change-only sends preemptively — the schema
  comment (`server.fbs:455-462`) already marks that "a later optimisation, not
  a design requirement".

## 8. Chunks

| chunk | scope | gate |
|---|---|---|
| **C0** | Interaction hardening: fix N1 at both ends (server: `applyGrant` refuses what `present()` hides, converse-direction test; client: a grant+navigate row keeps its authored line), the L4 count guard (**≤254**, options AND grants), fix the two stale no-`DisallowUnknownFields` comments (L2). Zero behaviour change on shipped content. | `go test ./...` + vitest green; boot counts unchanged; existing conversation harnesses (`chunk3b-interact`, `chunk3b-ii-conversation`) green untouched |
| **P** *(external prerequisite, D15)* | **Pass 3 item 1 of `plan-playtest-feedback.md`**: presence-counts attribution (aura active during the fight = participant). Owned by that plan, executed as its own chunk before C1. **Planned in full 2026-07-30** (that doc's §Chunk P plan — P1 fixed conf radius `game.combat.presenceRadius` [PLACEHOLDER 8] · P2 presence joins a player fight, never starts one (≥1 existing participant, closes the NPC-battle watch-farm) · P3 one participant class, unlock rolls included — so quest counters count presence participants with zero quest-side code, per D4). | Per that plan's test strategy: TDD Go test on the participant-map precedent + a two-client smoke (`chunkP-presence.mjs`) |
| **C1** | The ledger + events, backend only: lifetime counters at the kill-credit fan-out (`rewardPlayer`, D4 — increment on participation, not XP amount, L13), talked-to stamping at session open, **ledger survival across death/reconnect (L11 — the five stash sites)**, `MobID` keys + the duplicate-id boot guard (L12), the `api/quests/` loader + all L5 registration edits (incl. the verify-skill grep), stage engine (objective satisfaction against counters, advance, journal append, completion, abandon per D13), a `QUEST` debug cheat to inspect/drive it. `model.PlayerEntity` widening updates the four fakes (L14). | TDD on the engine (retroactive satisfaction at accept · presence-credited kill advances · branch edges exclusive · one-shot refuses re-offer · repeatable flag round-trips unauthored · abandon clears the path, leaves counters + completed set, re-offer works · **ledger survives death and reconnect** · counter increments for an `experience: 0` species); sim battery byte-identical (nothing existing moves); boot `-content ../api` with the new count pinned |
| **C2** | Dialogue vocabulary: `offer_quest` / `advance_quest` / `grant_xp` grant kinds (**per-kind payload resolution** — the loader's unconditional skill lookup becomes conditional, the `TestContent_EveryGrantIsAResolvedTeach` pin relaxes, the two `!=` dispatches become switches, §5), `quest_at_stage` condition (widening `learner`, O(1) read, L15), `costs`/`consequences` schema room (D8/D10 — validated, unauthorable beyond parse), loader cross-validation (unknown quest/stage hard-fails; **legacy species rejected as targets**, L12), the L3 dead-node lint decision, the L10 `grant_xp`-terminal-only lint, the `selectNode` visibility-map hoist (L15). | Evaluator tests per kind; a fixture quest walkable end-to-end through `present()`/`applyGrant()` in Go tests alone |
| **C3** | Wire + journal: the D14 minimal-projection catalog (+ a test asserting the projection leaks nothing beyond titles/prose), ledger on `GameState` every tick + client view-signature diff (§6, L8), the `Journal` EntityMessageKind pinned = 2 (D17), the journal panel (D7) with `J` + HUD button (D16), the "journal unavailable" degrade state, incl. the abandon action (D13). | Codec round-trips; vitest on the journal view model; headless harness: offer → kill → auto-advance journal entry + banner → turn-in → completed section; abandon → quest gone from running, re-offerable |
| **C4** | First authored content: 3–4 quests exercising every first-pass verb + **one branch with two turn-in NPCs and different rewards** (D9's proof), placed on existing conversants. XP amounts sized against the band-lock *budget* by hand (L9). | The content itself is the test: full harness pass per quest path, both branch legs; boot counts pinned; manual PO walk |

Sequencing per D12/D15: **P → C1→C2→C3→C4**, all **before step 8**. C0 is
independent of everything and could ship as a filler chunk any time.

## 9. Open questions (deliberately not ruled this session)

1. **Un-learning** — what happens to an evicted skill's slot assignment,
   combinations that used it as an ingredient, and invested skill levels
   (evaporate = the tradeoff's teeth; refund = defanged)? Blocks authoring D8's
   skill-trade quests; nothing else waits on it.
2. **XP amounts** vs the Session-⑥ band lock — §42's "is XP alone motivating?"
   is partially answered by skill rewards + branch choice; the numbers are
   [PLACEHOLDER] like all numbers, sized in C4.
3. **Sidebar tracker** — GDD says *maybe*; not in the first pass, re-raise on
   playtest feedback.
4. **Discover-location** — needs named-area triggers; design it together with
   §41's clue-anchor scoping (and the GDD's open note on whether found clues
   write journal entries).
5. **Per-quest retroactivity opt-out** ("kill 8 *more*") — deferred until an
   author actually wants it.
6. ~~**Abandon / failure states**~~ — **RULED (PO 2026-07-29, D13): abandon
   yes, failure no.** Ledger removal op in C1, journal abandon action in C3,
   the L10 loader lint in C2.
7. **Multiple running quests** — assumed unlimited; revisit only if the journal
   UI drowns.

## 10. Step-8 handoff (what persistence must know)

The per-character record gains, in Actor vocabulary: `quests` (id → ordered
stage-path + completed), `killCounts` (`MobID` → lifetime count), `talkedTo`
(`MobID` set) — both maps keyed by the authored species id per L12, which is
why C1's duplicate-id boot guard must exist before any of this persists. All
per-character (D5); §36's bloodline / account scoping
question does not move quest state per this session's ruling, but step 8 should
confirm that alongside §41. Everything is small, append-mostly, and — per D12 —
already live by the time step 8 designs the schema.

## 11. Chunk C1 ledger — the ledger + events ✅ DONE 2026-07-30

**Scope delivered exactly as §8 priced it** (backend only: 25 files modified +
4 new; no wire, no frontend, no authored content — `api/quests/` ships a README
and `count: 0` until C4). New package **`pkg/aura/quests`**: definitions +
loader (species/NPC authored by *name*, resolved to `MobID` at load, L12;
`DisallowUnknownFields` + `_comment`; binary stage shape enforced — objectives
⇒ single `next`, dialogue ⇒ neither; dangling/self `next` and **objective-chain
cycles** hard-fail, because a cycle would loop the retroactive cascade forever)
and the **`Ledger`** (lifetime `killCounts` + `talkedTo` + per-quest walked
path, L6). `Accept` cascades retroactively (D3 — a veteran auto-completes on
the spot), `Abandon` clears the path and leaves counters + the completed set
(D13), `AdvanceDialogue` walks one branch edge — the C2 `advance_quest` seam,
driven by the new `QUEST` cheat (dump / `ACCEPT` / `ABANDON` / `ADVANCE`) until
rows exist. **The hooks:** `rewardPlayer` → `NoteKill(m.definition.ID)` (D4 —
participation not XP amount, L13, pinned by an `experience: 0` test; presence
participants and healers inherit for free, pinned by a `NotePresence` test);
session open in `handleInteracts` → `NoteTalkedTo(a.MobID())`. **L11 held:**
the ledger joins `deadState` + `reconnectStash` at all five sites,
pointer-carried like `SkillComponent`, pinned by four tests (respawn · alive
reconnect · dead-reconnect→respawn · join-while-dead). **L12's boot guard:**
`registry.add` hard-fails a duplicate authored mob id (proven red first).
**L14 played out as predicted:** the encounter fake's nil-interface tripwire
caught the widening at test-run time, not compile time.

**Shape decisions for C2 to build on:** ① *terminality is derived, not
authored* — a dialogue stage with no outgoing edge is terminal, and
`QuestDefinition.NoteDialogueEdgeFrom(stageID)` is the hook C2's interaction
loader calls per `advance_quest` row so a mid-quest dialogue stage waits
instead of completing (tests register edges the same way). ② The ledger holds
the boot registry; **nil is a supported registry** (the sim) — counters count,
nothing advances. ③ `Progress` is `{Path, Running, Completed}` with `Completed`
**sticky forever** (D13); a repeatable re-accept resets only the path.
④ `quests.NewRegistry(defs...)` is the in-memory fixture seam other packages'
tests use. ⑤ `model.Game` gained `Quests()`; `PlayerEntity` gained
`QuestLedger()`/`SetQuestLedger()`; the sys-internal `interactor` widened by
`QuestLedger()` only.

**L5 played out in full:** loaders.go ×3 · new embed pkg `pkg/api/quests`
(⚑ pattern `*`, not `*.json` — go:embed rejects a pattern matching nothing and
the directory holds only a README until C4; the loader skips non-`.json`) ·
Makefile `cp-defs` · `Loaded quest definitions` boot line · the verify-skill
grep + its stale canonical counts refreshed · CLAUDE.md "eight directories".

**Verified:** 34 new Go tests, **every hook proven red first** · build/vet/full
suite clean · guardrails + alloc `-count=2` · **sim battery BYTE-IDENTICAL all
4 legs** vs a pre-chunk worktree (TTK 6.67 s / TTD 8.70 s stand) ·
`make -C backend build` (cp-defs picks up `quests/`) · boot embedded **and**
`-content ../api`: counts pinned (15 factions/86 skills/64 mobs/1 milestone/10
recipes/5 props/777 props/485 spawns/5 campfires) + `Loaded quest definitions
count=0`, 0 errors 0 warnings · 66/66 vitest + typecheck (frontend untouched) ·
harness gate: `chunk3b-interact.mjs` 14/14 and `chunkP-presence.mjs` 6/6 re-run
green (they own the touched `handleInteracts`/`rewardPlayer` paths);
`chunk3b-ii-conversation.mjs` 28 PASS + 1 deliberate SKIP + **1 FAIL that is
NOT this chunk's** — *"…and walks on afterwards"* (the Wanderer resuming
patrol after a conversation, D22) fails **identically at pre-chunk HEAD**,
proven by stash + rebuild + re-run on a fresh server; recorded here per the
chunk-wrap rule instead of silently ignored, still open. ⚑ One first run was
invalidated by a WebGL context loss (§29's ~1-in-6) — rerun clean, the
standing rule held. Pre-existing repo-wide `gofmt -l` drift (44 files at HEAD)
was left untouched; none of the new code is affected.
