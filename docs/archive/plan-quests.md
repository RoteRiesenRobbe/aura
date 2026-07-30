# Plan: the quest system — journal-carried quests on the interaction container

**Status: ✅ COMPLETE — chunk C4 DONE 2026-07-30 (ledger §15), the first four
authored quests, and with it the whole plan. Prior: C3 ✅ `604f3f4d` (§14),
C0 ✅ `2a3b137d` + C2 ✅ `2dc6973a` (§12/§13), C1 ✅ `d3b89328` (§11),
prerequisite chunk P ✅ `d45ba07c`. Nothing here is open; the deferrals are
listed in §9 and the step-8 handoff in §10.**
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
| **C0** ✅ | Interaction hardening: fix N1 at both ends (server: `applyGrant` refuses what `present()` hides, converse-direction test; client: a grant+navigate row keeps its authored line), the L4 count guard (**≤254**, options AND grants), fix the two stale no-`DisallowUnknownFields` comments (L2). Zero behaviour change on shipped content. | `go test ./...` + vitest green; boot counts unchanged; existing conversation harnesses (`chunk3b-interact`, `chunk3b-ii-conversation`) green untouched — **DONE, ledger §12** |
| **P** *(external prerequisite, D15)* | **Pass 3 item 1 of `plan-playtest-feedback.md`**: presence-counts attribution (aura active during the fight = participant). Owned by that plan, executed as its own chunk before C1. **Planned in full 2026-07-30** (that doc's §Chunk P plan — P1 fixed conf radius `game.combat.presenceRadius` [PLACEHOLDER 8] · P2 presence joins a player fight, never starts one (≥1 existing participant, closes the NPC-battle watch-farm) · P3 one participant class, unlock rolls included — so quest counters count presence participants with zero quest-side code, per D4). | Per that plan's test strategy: TDD Go test on the participant-map precedent + a two-client smoke (`chunkP-presence.mjs`) |
| **C1** | The ledger + events, backend only: lifetime counters at the kill-credit fan-out (`rewardPlayer`, D4 — increment on participation, not XP amount, L13), talked-to stamping at session open, **ledger survival across death/reconnect (L11 — the five stash sites)**, `MobID` keys + the duplicate-id boot guard (L12), the `api/quests/` loader + all L5 registration edits (incl. the verify-skill grep), stage engine (objective satisfaction against counters, advance, journal append, completion, abandon per D13), a `QUEST` debug cheat to inspect/drive it. `model.PlayerEntity` widening updates the four fakes (L14). | TDD on the engine (retroactive satisfaction at accept · presence-credited kill advances · branch edges exclusive · one-shot refuses re-offer · repeatable flag round-trips unauthored · abandon clears the path, leaves counters + completed set, re-offer works · **ledger survives death and reconnect** · counter increments for an `experience: 0` species); sim battery byte-identical (nothing existing moves); boot `-content ../api` with the new count pinned |
| **C2** ✅ **DONE, ledger §13** | Dialogue vocabulary: `offer_quest` / `advance_quest` / `grant_xp` grant kinds (**per-kind payload resolution** — the loader's unconditional skill lookup becomes conditional, the `TestContent_EveryGrantIsAResolvedTeach` pin relaxes, the two `!=` dispatches become switches, §5), `quest_at_stage` condition (widening `learner`, O(1) read, L15), `costs`/`consequences` schema room (D8/D10 — validated, unauthorable beyond parse), loader cross-validation (unknown quest/stage hard-fails; **legacy species rejected as targets**, L12), the L3 dead-node lint decision, the L10 `grant_xp`-terminal-only lint, the `selectNode` visibility-map hoist (L15). | Evaluator tests per kind; a fixture quest walkable end-to-end through `present()`/`applyGrant()` in Go tests alone |
| **C3** ✅ **DONE, ledger §14** | Wire + journal: the D14 minimal-projection catalog (+ a test asserting the projection leaks nothing beyond titles/prose), ledger on `GameState` every tick + client view-signature diff (§6, L8), the `Journal` EntityMessageKind pinned = 2 (D17), the journal panel (D7) with `J` + HUD button (D16), the "journal unavailable" degrade state, incl. the abandon action (D13). | Codec round-trips; vitest on the journal view model; headless harness: offer → kill → auto-advance journal entry + banner → turn-in → completed section; abandon → quest gone from running, re-offerable |
| **C4** ✅ **DONE, ledger §15** | First authored content: 3–4 quests exercising every first-pass verb + **one branch with two turn-in NPCs and different rewards** (D9's proof), placed on existing conversants. XP amounts sized against the band-lock *budget* by hand (L9). | The content itself is the test: full harness pass per quest path, both branch legs; boot counts pinned; manual PO walk |

Sequencing per D12/D15: **P → C1→C2→C3→C4**, all **before step 8**. C0 was
nominally independent filler, but shipped **immediately before C2 in the same
session** — L1 is literal, and the both-ends N1 defect is exactly the shape of
the turn-in rows C2 makes authorable. **P ✅ · C1 ✅ · C0 ✅ · C2 ✅ · C3 ✅ ·
C4 ✅ — all six shipped 2026-07-30, and the plan is closed.**

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

## 11. Chunk C1 ledger — the ledger + events ✅ DONE 2026-07-30 `d3b89328`

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
proven by stash + rebuild + re-run on a fresh server. **Follow-up diagnosis
2026-07-30: the product is CORRECT** — the hold+release is now pinned
server-side (`TestMob_ConversingHoldsThenReleasesWander`, model/mob; the
resume half previously had only harness eyes) — **the harness leg is rotten**:
its drift pin can land on a container whose position never changes (the badge
rides the shape group since R4), reading exactly-0 drift while the real actor
demonstrably ambles. Marked KNOWN ROTTEN in the script header + the verify
skill's coverage map; repair belongs to the next conversation-touching session
(C2/C3), with one instrumented run to see which container gets pinned. ⚑ One first run was
invalidated by a WebGL context loss (§29's ~1-in-6) — rerun clean, the
standing rule held. Pre-existing repo-wide `gofmt -l` drift (44 files at HEAD)
was left untouched; none of the new code is affected.

## 12. Chunk C0 ledger — interaction hardening ✅ DONE 2026-07-30 `2a3b137d`

**Scope delivered exactly as §8 priced it** (7 files, zero behaviour change on
shipped content — no content edit, no wire change, no new vocabulary). Run
FIRST in the same session as C2 rather than as standalone filler, because L1 is
literal: a row that both grants and navigates is broken independently at both
ends, and that is the shape of every quest turn-in row C2 makes authorable.

**N1, the server half.** `applyGrant` now refuses a row whose `next` names a
condition-failed node, via a single `destinationVisible()` that states the rule
`presentOptions` applies — so the two ends cannot drift again. `presentOptions`
keeps reading the visibility map it already built (the same predicate, one
lookup cheaper); the only case the shared form covers alone is a `next` naming
no node at all, which the loader rejects at boot and which now fails closed
rather than panicking.

**N1, the converse test §8b explicitly asked for.**
`TestPresentAndApplyGrant_CannotDisagree` iterates only the rows `present()`
emitted, so it proves *presented ⇒ accepted* and structurally cannot prove the
converse. The new `TestApplyGrant_AcceptsOnlyWhatPresentEmitted` enumerates
EVERY authored (node, option, grant) triple across four levels and asserts that
anything `applyGrant` accepts was on screen. Red first, in exactly the
direction L24 wanted.

**N1, the client half.** `ConversationModel.take()` set `spokenReply` and then
cleared it two lines later when following `next` — correct for a pure
navigation row, and it silently swallowed the grant's authored line for a row
that did both. ⚑ **A visible presentation decision, not a pure bug fix:** the
grant's line now *leads* the destination node's lines rather than replacing
them (new `replyLeadsNode` + `replyLines()`), because on a navigating row the
text underneath is prose the player has not read yet, so either choice alone
loses content. A pure grant row still replaces the greeting (unchanged — that
text was already read) and a pure navigation row still shows only the
destination (unchanged). `ConversationView.lines`' own doc comment already said
"plus any reply already spoken", so this is the shape originally intended.

**L4, the 255 sentinel.** `maxAddressableIndex = 254` guards **both** options
per node and grants per option, paired with accept-at-255-entries tests so the
boundary is pinned from both sides. ⚑ 254 and not 255 because `grant_index`
defaults to 255 as the client's none-sentinel (`server.fbs:375`) while
`option_index` has no default at all (`:372`), making an authored 255 a
legitimate value colliding with that sentinel; capping both identically keeps
the authoring rule from being off by one for a reason nobody remembers.

**L2.** Both stale comments claiming the mob loader lacks
`DisallowUnknownFields` corrected (`items/mobs/interaction.go`,
`interaction_content_test.go`) — R1 closed that gap, so the Trigger tombstone's
value is now the *named* error rather than the only error, and the raw-JSON
probe's value is the *diagnosis* (it names the file; a loader failure fails
every `contentRegistry` test at once).

**Verified:** 4 new tests, every one red first · `go build`/`vet`/full suite
clean · guardrails + alloc `-count=2` · 68/68 vitest (+2 new) + typecheck ·
boot embedded AND `-content ../api`, counts unchanged (15 factions/86 skills/64
mobs/1 milestone/10 recipes/0 quests/5 prop defs/777 props/485 spawns/5
campfires), 0 errors 0 warnings 0 panics · harness gate on the two scripts C0
owns, each run SOLO: `chunk3b-interact.mjs` **14/14**,
`chunk3b-ii-conversation.mjs` **29/29 + 1 deliberate SKIP**, 0 WebGL context
losses.

⚑ **Correction to §11's harness note:** C1 recorded the D22 Wanderer *"…and
walks on afterwards"* leg as a pre-existing FAIL and marked it KNOWN ROTTEN. It
**passed in both clean solo runs here**, so it is **flaky, not deterministically
rotten** — the drift pin sometimes lands on the container that does move. The
rot diagnosis stands as a description of the failure mode; "always fails" does
not. Repair is still worth doing, but it is not blocking and not C2's.

## 13. Chunk C2 ledger — the dialogue vocabulary ✅ DONE 2026-07-30 `2dc6973a`

**Scope delivered as §8 priced it**, backend only: 3 new grant kinds, 1 new
condition kind, the D8/D10 schema room, the loader cross-validation, the L3 and
L10 lints, and the L15 hoist. No wire, no frontend, no authored content — the
quest count still boots at 0 until C4.

**⭐ The one design gap §5 left open, PO-ruled this session: the turn-in
bundle.** §5 said `advance_quest` "carries the row's other grants as the
reward", but the shipped model is strictly ONE row per grant, and a multi-grant
option means the opposite of a bundle — it is the flat teaching MENU the 11
un-re-authored NPCs render from (D17). The PO ruled **option-as-atomic-row**:
an option carrying a quest grant renders as exactly one row (labelled by the
authored `text`, which the loader now requires because a bundle has no skill
name to fall back on), and taking it applies every grant in that option in
authored order. Rejected: reward-rides-the-destination-node (two clicks, the
player can walk away from the reward, and it cannot express "same stage, two
different rewards") and one-grant-per-row-strictly (which would duplicate every
other grant kind inside `advance_quest`'s payload).

⚑ **The ordering is the transaction, not tidiness.** `applyQuestRow` runs the
ledger op FIRST and abandons the whole row if it is refused, which is what stops
a re-clicked turn-in paying out twice — the ledger is the only thing that knows
the quest already moved, so nothing may be handed over before it has spoken.
That is why the loader *hard-fails a quest grant that does not sit at index 0*:
a reward above the advance would already be paid by the time the refusal
arrives. Pinned by a test asserting a second click grants **no** XP and **no**
skill, and by another asserting a turn-in taken at the wrong stage pays nothing
at all rather than "everything except the advance".

**Per-kind payload resolution.** The loader resolved a `skill` for EVERY grant
unconditionally, so any new kind would have had to author a dummy skill name to
boot. `mapGrant` now states per kind which keys are required and which are
refused — a quest grant carrying a `skill`, a teach carrying quest keys, a quest
grant carrying a `requiredLevel` (the quest's own stage graph is its gate) are
each a named boot failure.

**⭐ `quests.CrossValidate` — a new post-load pass, and it had to be one.** Mobs
load BEFORE quests (objectives resolve species *names* against the mob registry,
L12), so at `mapToInteraction` time there is no quest registry to check against.
The pass runs from `loaders.go` once both registries stand, in **two phases**,
and the split is load-bearing rather than tidy: **terminality is derived, not
authored** (C1's shape decision ①), so every `advance_quest` edge in the world
must be registered via C1's `NoteDialogueEdgeFrom` before any question about a
stage being terminal can be answered — which is exactly what L10 asks. Phase 1
validates references and registers edges; phase 2 answers the terminal question.

**The lints.** L10 in both halves — the mob loader refuses a standalone
`grant_xp` (an infinite faucet needing no stage graph to see), and
cross-validation refuses `grant_xp` on an edge that does not END the quest,
because abandon leaves the lifetime counters standing so objective stages
re-complete instantly, while completion is protected by the completed set
abandon never touches. **L3 hard-fails** a conditional node sitting below an
unconditional one (dead as a greeting, invisible in play — the NPC just says the
wrong thing); free to add now because no shipped content authors conditions at
all, and quest-conditional greetings are precisely the shape that trips it.
**L12** rejects a legacy-tagged species as an objective target — elsewhere a
legacy reference is a warning, here it is fatal, because the target is not in
the world and the quest is unwinnable while looking authored and loaded.
**D8/D10** parse their kind tables first (so a typo reads as a typo) and then
hard-fail the well-formed entry with a named "schema room only" error — the L-O
lesson from `archive/plan-faction-flips.md`: authored content that silently does
nothing is the failure mode to design out.

**Dead content warns rather than fails.** A quest no conversant offers cannot be
started in play (D11), but it is a `slog.Warn`, not a boot failure, because the
QUEST cheat deliberately drives a quest before its rows exist — which is how C4
will iterate.

**L15.** `selectNode` is **deleted**: it picked the first node whose conditions
pass, which is exactly the first entry `present()` already puts in its
visibility map, so it was a second implementation of one rule that also doubled
`conditionsPass` evaluations on a path that runs per tick per conversing player.
`quest_at_stage` is answered by `Ledger.MatchesStage`, an O(1) map read that
fails closed on a nil ledger.

**Shape decisions C3 inherits:** ① the stage sentinels `not_started` /
`completed` live in **`mobs`**, not `quests` — quests imports mobs, so the
reverse is an import cycle; ② `MatchesStage` treats a completed quest as
matching `completed` and NOT its terminal stage id, so a turn-in row gated on
that stage cannot stay clickable forever; ③ `learner` gained `QuestLedger()` +
`AddExperience()` and `interactor`'s duplicate declaration was dropped — **no
`model.PlayerEntity` widening and no L14 fake cost**, since both methods already
exist there.

**Verified:** 40 new Go tests, every hook red first · `go build`/`vet`/full suite
clean · guardrails + alloc `-count=2` · **sim battery BYTE-IDENTICAL all 4 legs**
vs a HEAD worktree (TTK 6.67 s / TTD 8.70 s stand) · boot embedded AND
`-content ../api`, counts unchanged (15 factions/86 skills/64 mobs/1 milestone/10
recipes/**0 quests**/5 prop defs/777 props/485 spawns/5 campfires), 0 errors 0
warnings 0 panics · 68/68 vitest + typecheck (frontend untouched by C2) ·
harness gate, each script run SOLO: `chunk3b-ii-conversation.mjs` **29/29 + 1
SKIP**, `chunk3b-interact.mjs` **14/14**, `chunkP-presence.mjs` **6/6**, 0 WebGL
context losses.

**Also proven against REAL content**, not only fixtures: a genuine
`api/quests/*.json` plus a Farmer patched with an offer node and a turn-in bundle
boots clean (`count: 1`, no warnings, terminality derived correctly), and all
nine failure modes are refused on real files with "nobody offers" warning
instead. ⚑ Two incidental findings from that probe: **the mob loader registers
every file in its directory regardless of extension** (a stray `farmer.json.bak`
tripped C1's duplicate-id guard — unplanned live proof that guard works, and a
reason content dirs must not hold scratch files), and the mob loader's
one-quest-op-per-row rule fires *before* cross-validation, so a probe for the
L10 terminal rule must put the second edge on a different node.

**⚑ Harness lesson, learned the expensive way twice:** these browser harnesses
**cannot be run in parallel, or alongside anything else touching the server**.
Two concurrent runs produced 17 wholesale FAILs including "E opens the panel"
(one harness summons a companion and fires cooldowns beside the NPCs the other is
talking to, and `sense()` withdraws the talk offer for EVERY player at once when
an actor is in combat); later, probe boots competing for port 2000 killed a
harness loop mid-run. Both failure modes read exactly like a product regression
in the feature under test. Run them **sequentially, alone**, on a freshly
restarted server — a stale server also degraded `chunkP-presence` to 3 PASS + a
no-kill SKIP until restarted.

## 14. Chunk C3 ledger — the wire + the journal ✅ DONE 2026-07-30 `604f3f4d`

**Scope delivered as §8 priced it**: the D14 catalog, the ledger on `GameState`,
the `Journal` EntityMessageKind, the journal panel on `J` + a HUD button, the
degrade state, and abandon — backend, wire and frontend, no authored content
(`api/quests/` still boots `count: 0` until C4). **PO call this session: the
panel is a CENTERED OVERLAY**, not a left-column or bottom-centre panel — a
journal is read rather than glanced at, it needs room for several stages of
prose, and the bottom-centre stack is already the conversation panel's.

**The wire.** `QuestProgress { quest_id, stages[], completed }` +
`GameState.quest_progress`, appended at the table end; `EntityMessageKind.Journal
= 2` and `ClientMessageBody.AbandonQuest = 9`, both **pinned at birth** (§28).
Nothing renumbered — the wire-prune smoke decoded 649 sprites with 0 errors.

⚑ **`Ledger.Snapshot()` sorts, and the sort is load-bearing.** Go randomises map
iteration order, so an unsorted projection would hand the client a different
byte string every tick, defeat its view signature, and rebuild the journal's
abandon rows ~30×/s — the exact click-in-the-teardown-gap hazard the signature
was written for in 3b-ii. It also returns `nil` when empty (and on a nil ledger,
failing closed like `MatchesStage`), so a quest-less player allocates nothing on
the per-tick path.

⚑ **The D17 notifier is installed by the OWNER, not at construction** — this is
the one trap of the chunk and it is L11's shadow. The ledger outlives the player
struct: it rides `deadState`/`reconnectStash` across death and reconnect, so a
callback captured in `NewLedger` would keep firing banners into a client that
has been closed since — the banner would simply stop existing after the first
death, with nothing failing. `player.adoptQuestLedger` is now the single site
where ownership and notification change hands together, and
`TestReconnect_JournalBannerFollowsTheNewClient` pins it (proven red first: the
new client heard nothing).

**One notice per player action, not per stage.** `enter()` cascades — a
retroactive accept can walk several stages at once (D3) — so it pings once at
the end of the walk with where the quest came to rest. Abandon is silent: it is
a click in the panel the player is already reading.

**Abandon is its own system.** `sys.QuestSystem` drains one `AbandonQuest` per
player per tick. It is not a branch of the InteractionSystem because the journal
is not a conversation — no actor, no range, no session, just a player acting on
their own ledger — and a refusal is silent, because the panel re-renders from
the next snapshot either way.

**The degrade is explicit, and that is the point of D14's split.** A missing
skill name renders as "Skill #7"; a journal with no words is indistinguishable
from a journal with no quests. So `Quests.ts` tracks `loading | ready |
unavailable`, `JournalModel` carries that state through instead of collapsing it
to an empty list, and the panel says *"Journal unavailable"*, *"Opening the
journal…"* or *"Nothing written here yet."* The model takes its catalog
**injected** rather than imported, which is what keeps it fetch-free and
unit-testable.

**Verified:** 20 new Go tests + 9 new vitest cases, the two behavioural hooks
proven red first · `go build`/`vet`/full suite clean · guardrails + alloc
`-count=2` · **sim battery BYTE-IDENTICAL all 4 legs** vs a HEAD worktree
(TTK 6.67 s / TTD 8.70 s stand) · typecheck + **76/76 vitest** + prod build ·
boot embedded AND `-content ../api`: 15 factions/86 skills/64 mobs/1 milestone/
10 recipes/**0 quests**/5 prop defs/777 props/485 spawns/5 campfires, 0 errors
0 warnings · harness, each run SOLO on a fresh server: **new
`chunkC3-journal.mjs` 14/14**, `chunk3b-ii-conversation.mjs` **29/29 + 1 SKIP**,
`chunk3b-interact.mjs` **14/14**, `hygiene-wire-prune.mjs` clean (the `.fbs`
gate), 0 WebGL context losses. ⚑ One run was invalidated by a context loss
(§29's ~1-in-6) and re-run clean — the standing rule held again.

**The harness needed real content, and C4 owns `api/quests/`.** So
`chunkC3-journal.mjs` ships in two halves: half A always runs (catalog reachable,
J and the button open/close, the empty-vs-broken degrade), half B **SKIPs** unless
the fixture beside it is installed — `cp .claude/skills/verify/chunkC3-probe-quest.json
api/quests/`, restart, run, delete. Half B walked the full path this session:
accept → the running section with its diary + *"Journal updated"* → abandon by
CLICKING the row → gone → re-accept (proving not-started) → a real conversation
with the Emberkeeper satisfies the `talk_to` objective → auto-advance → both
entries in walked order in Completed → *"Quest complete"*. The probe's objective
is a talk rather than a kill deliberately: talking is the one reliable headless
event, and it needs no combat.

⚑ **The flaky D22 Wanderer leg is REPAIRED** (PO asked for it this session, and
it was worth it — the diagnosis in §11/§12 was half right). `pinBadgedActor()`
ran *after* the panel opened, but the badge is suppressed for whoever the panel
belongs to, so the pin never matched and the measurement silently fell back to
`findMover`'s "largest mover" — the camera, or a boar that later left the
viewport and froze at its last position, giving drift 0 during AND after. It now
pins while the badge is still lit, measures the baseline on that same actor, and
goes **INCONCLUSIVE** rather than red if it cannot pin at all. The numbers are
meaningful for the first time: **before 1.206 / during 0 / after 1.178** units
per 4 s (the old fallback read 5.351 — the camera pan).

**Shape decisions C4 inherits:** ① the catalog is the only place words live, so a
quest with no `journal` prose is invisible in the panel even though the loader
already refuses one (`missing journal prose`) — nothing to do, just do not expect
the panel to invent a line for an unknown stage, it skips it; ② the banner text
is composed server-side (`Journal updated: <title>` / `Quest complete: <title>`)
unlike the unlock banner, whose line the client composes from its catalog —
because the journal's title is already on the wire's other end and the banner is
one sentence; ③ `J` sits in `Controls.handleFunctionKeys`, behind the same
chat/console guards as Escape, so typing "journal" in chat cannot open it.

## 15. Chunk C4 ledger — the first authored quests ✅ DONE 2026-07-30

**Scope delivered as §8 priced it, and the shape of the diff is the result worth
recording: four quest files, seven conversants' `interaction` blocks, one Go test
file and one harness — and NOT ONE LINE of engine code.** C1–C3 built a
vocabulary; C4 is the proof it was the right one, because authoring a branching,
multi-NPC, three-verb quest set needed no new kind, no new field and no
migration. The quest count boots at **4**.

**The four quests, and what each is for:**

| id | wiring | verb / shape |
|---|---|---|
| `village-welcome` | Hermit offers **and** turns in; Farmer + TownCrier are the targets | **talk_to**, and D3's retroactive credit met head-on: most players have already spoken to both (the crier teaches the first ability), so accepting cascades on the spot and the journal shows two entries at once |
| `turnip-chore` | Farmer offers and turns in | **harvest**, on the cheapest venue in the game — and its offer row navigates to the node where he teaches the very aura the objective needs |
| `wolves-on-the-road` | TownCrier offers; **CityGuard or Shaman** turns in | **kill**, and ⭐ **D9's proof**: one stage, two authored edges, two terminal stages, two different rewards (Taunt + 400 XP / Slow + 400 XP), and no code anywhere knows there is a choice |
| `the-lost-lamp` | LamplessTraveller offers → **Miner** advances → traveller turns in | a three-conversant chain carrying the game's only **non-terminal** `advance_quest` edge — the thing C1's derived terminality and C2's two-phase cross-validation exist for |

**PO calls this session.** ① Rewards may create **new sources for drop-only
skills**, not just XP: Taunt (RallyDrummer-only), Slow (BanditRanged-only) and
**Lantern** — whose only source was a 5 % Kobold roll, i.e. a brutal gate on the
light the tunnel tutorial is built around. ② Four quests rather than three, which
is what buys the non-terminal edge. ③ XP **"punchy — about half a level each"**:
150 / 150 / 400 per leg / 700. ⚑ The flag raised with the option stands on
record: punchy quest XP bends the Session-⑥ kills-per-hour band the sim battery
is tuned against, and L9 means nothing clamps it at runtime — the numbers are
pinned in `quests/content_test.go` because a budget nobody can see is a budget
nobody keeps.

⭐ **The authoring shape C4 discovered, now written down in
`manual-content-authoring.md` § 6.** None of it is new mechanism; all of it is
what the shipped mechanism *implies*, and it was only visible once real trees
were authored:

① **A quest-conditional greeting HIJACKS the greeting, and that is L3's
consequence rather than a bug.** Conditional nodes must sit above the
unconditional root, and the greeting is the first node whose conditions pass — so
whenever a quest state is live at an NPC, that state *is* what they open with.
It reads as Gothic (the NPC leads with what is happening) and it costs one row:
**every quest node needs a way back to `root`**, or the NPC's ordinary teachings
are unreachable while a quest runs. ⚑ The TownCrier needed more than that — he
hands out the player's **first ability**, and behind a quest greeting that ability
sat three clicks deep behind a row labelled as a refusal, so his offer node
carries a direct row to `teachings`. That was a genuine onboarding regression,
found by reading the authored tree rather than by any test.

② **A quest row's `next` must name a node visible BEFORE the row is taken.**
`destinationVisible` runs ahead of the ledger op (C0's N1 fix), so pointing an
offer row at a node gated on "quest running" hides the row from itself. Every
quest row here points at the unconditional `root` — which also sidesteps the
panel snapping when the node under the player's feet vanishes a tick later.

③ **Rewards can only ride a turn-in row**, so the only quest shape that pays is
`objective stage → dialogue stage → terminal stage entered by a rewarding row`.
An objective stage that completes a quest hands over nothing, silently. L10's
lint enforces the same shape from the other end.

④ Minor, but it cost a boot: **`_comment` exists only at the top level of a mob
definition**. Nested nodes and options are `DisallowUnknownFields` all the way
down, so per-node authoring rationale has nowhere to live — it goes in the
definition's own `_comment`, which is what every touched NPC now carries.

⚑ **The trap the tests found, and it is not a test artefact.** A `Ledger` built
on a quest registry that never went through `quests.CrossValidate` reads **every
dialogue stage as terminal**, because terminality is derived from the edges the
world authors (C1 ①) and cross-validation is what registers them. The first draft
of the veteran-cascade test asserted its way into exactly that: `village-welcome`
"completed" the instant it was accepted, with nothing turned in. `loaders.go`
guarantees the order in production; the fix was to make the test helper reproduce
the **boot sequence** rather than just the loaders, and to say why in a comment.

**Content pins** (`pkg/aura/quests/content_test.go`, 8 tests over the real
embedded content): the census, cross-validation with **no** unreachable quest,
all three first-pass verbs still authored, D9's branch (two NPCs → two terminal
stages → two different rewards), the non-terminal edge, **every stage reachable**
(nothing else checks that — the loader only checks that edges point AT stages,
never that a stage has anything pointing at it), the XP budget, and two ledger
walks over the real graph.

**The harness.** New **`chunkC4-quests.mjs`**, four legs, and it walks the real
world rather than a fixture: A `village-welcome` end to end (offer row → two real
conversations → the objective advancing off the counters with no click → turn-in
→ **XP 0 → 150** on the bar), B `turnip-chore` end to end including learning
Harvest inside the same conversation, equipping it and harvesting **five real
turnips**, D the Miner's row proving the quest advances **without** completing,
and C **eight real wolf kills** followed by both branch legs — the Shaman's row
seen and left, the CityGuard's taken, Taunt landing in the spellbook, and the
Shaman's row **gone** afterwards (C2's shape decision ②: a completed quest matches
`completed`, never its terminal stage). Only the kobold objective is deliberately
not walked (the kill path is already proven twice, and six kobolds cost what eight
wolves cost).

⚑ **C4 broke one existing harness assertion, and fixing it was C4's job** (the
standing rule that a chunk repairs what its premise reverses):
`chunk3b-ii-conversation` asserted the TownCrier's greeting had **exactly two
rows** — a content count, which the verify skill's rule 1 forbids for exactly this
reason. It now asserts the row it means, by name. Note also that C4 *strengthened*
`chunkC3-journal`: its minimal-projection leg had been SKIPping for want of any
quest to project.

**Verified:** 8 new Go content pins (the CrossValidate trap proven red first) ·
`go build`/`vet`/full suite clean · guardrails + alloc `-count=2` · **sim battery
BYTE-IDENTICAL all 4 legs** vs a HEAD worktree (TTK 6.67 s / TTD 8.70 s stand) ·
typecheck + **76/76 vitest** (frontend untouched) · boot embedded **and**
`-content ../api`, identical: 15 factions/86 skills/64 mobs/1 milestone/10
recipes/**4 quests**/5 prop defs/777 props/485 spawns/5 campfires, **0 errors 0
warnings** · harness, each run SOLO on a freshly restarted server:
**`chunkC4-quests.mjs` 28/28 + 1 deliberate SKIP**, `chunk3b-ii-conversation.mjs`
**29/29 + 1 SKIP** (after the repair), `chunk3b-interact.mjs` **14/14**,
`chunkC3-journal.mjs` **8/8 + 1 SKIP** (half B still wants its probe fixture),
0 WebGL context losses on the runs of record. ⚑ One earlier C4 run was invalidated
by a context loss (§29's ~1-in-6) and re-run clean — the standing rule held again.

**What C4 deliberately did not do:** author `repeatable` (D6 — schema room),
`costs`/`consequences` (D8/D10 — both still hard-fail at boot), or
discover-location (§9 question 4). The Session-⑥ band question (§9 question 2) is
answered only as far as *these* four quests go, by hand.
