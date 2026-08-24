# Plan - Conditional NPC hails ("Well met, {name}")

**Status:** ⏸ DEFERRED 2026-08-24 (PO choice, together with
`plan-mob-voicelines.md`): tackle only if play-feel makes it necessary again.
Previously: 📋 PLANNED 2026-08-17, not started. One chunk, backend + content,
**frontend zero-change, schema NONE.** PO ask from the conditional-NPC
conversation 2026-08-17: NPCs greet a passing player differently depending on
what that character has done (met the NPC before, finished their quest, killed
enough of something), and address them by name.

**Scope:** the walk-by greeting only - the `interaction.ambient` field grows
conditions, variants and a `{name}` substitution, and the condition vocabulary
gains a `talked_to` / `never_talked_to` pair (which conversation *nodes* get
for free). Nothing else: no dialogue-panel personalization, no new dialogue
mechanics, no faction standing (that is `plan-camps.md` C1's), no mob shouts
(that is `plan-mob-voicelines.md`). Gating a trainer's teachings behind a quest
or a kill feat needs **zero code today** (a `quest_at_stage` / `kills_this_life`
condition on the teachings node, the `lampless-traveller.json:29` pattern) and
is deliberately not in this plan - it is ordinary content authoring.

---

## 1. Why this is small

Every layer already exists and is proven in-game:

| Layer | What already exists | Where |
| --- | --- | --- |
| The trigger edge | `sense()` speaks ambient lines on the sensor rising edge (D18) | `sys/interaction.go:245`, edge at :272 |
| The audience | the actor's sensor; `speakToSensor` marshals once, fans to every player in it | `sys/interaction.go:450` |
| The condition language | `JSONCondition` + `ParseCondition` + `conditionsPass`, four kinds shipped, shared by nodes and the ascension catalog ("two surfaces, one language") | `items/mobs/interaction.go:466/:478`, `sys/interaction.go:1026` |
| The feat state | quest ledger: `MatchesStage` (quest history survives turn-in), `KillCount` (lifetime, quest or no quest), `HasTalkedTo` - all O(1) in-memory reads, all persisted | `quests/ledger.go:205/:147/:154`, `quests/persist.go:20` |
| The player's name | `Name()` is on `model.PlayerEntity` itself | `model/player.go:58` |
| The wire + rendering | `EntityMessageKindChat`, bubble over the speaking entity, unchanged | `codec/chat.go`, `Chat.ts:58` |

So the work is: widen the `ambient` shape → evaluate conditions at the rising
edge → substitute `{name}` → reuse the existing fan-out, behind a throttle.
**No new message kind, no schema change, no FlatBuffers regeneration, no client
change, no migration.**

---

## 2. PO decisions (2026-08-17)

- **D1 - audience: PUBLIC, the whole sensor.** Everyone nearby hears "Well
  met, Momo", exactly the Town Crier's current audience rule, so
  `speakToSensor` is reused verbatim. Accepted with it: two players arriving
  the same moment fight over the NPC's single latest-wins bubble slot
  (`Chat.ts:65`, non-Character speakers are single-slot), and a bystander sees
  a line addressed to someone else. Offered and not taken: a private
  per-recipient send, and a per-variant audience knob; the trade-offs were on
  the prompt, the pick is the ruling (no reason stated).
  ⚑ Content consequence: author lines that read fine to a bystander.
- **D2 - re-greet: a per-NPC-per-player throttle, ~180 s [PLACEHOLDER].**
  The `plan-mob-voicelines.md` D1 shape, but keyed per pair because the line
  is chosen per player. Returning to town after a hunt earns a fresh greeting;
  pacing at the sensor edge does not. In-memory only. Offered and not taken:
  once-per-session, and once-per-life (which would have been the only option
  with a persistence surface).

## 3. Design decisions (mine, flag if wrong)

- **D3 - `ambient` becomes an ordered VARIANT LIST, first match wins.**
  ```json
  "ambient": [
    { "conditions": [ { "kind": "quest_at_stage", "quest": "wolves-on-the-road", "stage": "completed" } ],
      "lines": ["The road is safer for your work, {name}."] },
    { "conditions": [ { "kind": "talked_to", "species": "TownCrier" } ],
      "lines": ["Well met again, {name}."] },
    { "lines": ["Hail Adventurer"] }
  ]
  ```
  Absent `conditions` = always true; the first variant whose conditions all
  pass speaks; none passing = silence. This mirrors the entry-node convention
  (the first *visible* node is the entry, `lampless-traveller.json`'s
  completed-greeting sits above root for the same reason), so authors already
  know the idiom. Rejected: a second field beside a kept `[]string` `ambient`
  (two vocabularies for one behaviour), and per-variant audience knobs (YAGNI
  after D1).
- **D4 - negation by PAIRED KINDS: `talked_to` and `never_talked_to`**, both
  taking the existing `species` field (any conversant's MobID - naming the
  NPC's own species gives first-meeting vs returning, naming another gives
  "ah, you've met my brother" on a *node*, which falls out for free). The
  precedent is `quest_at_stage`'s `not_started` sentinel: this vocabulary does
  negation by naming the state, not with a generic `not:` flag (reserved
  generality, the thing this loader refuses at boot elsewhere). Conditions
  stay AND-only.
- **D5 - `{name}` substitution on the hail path only.** One
  `strings.ReplaceAll` on the chosen lines at speak time. Node/panel text
  stays literal: `present()` rebuilds per tick per conversing player, and a
  substitution pass there is an allocation on the L15 path for a feature
  nobody asked for. Additive later if wanted.
- **D6 - the old `[]string` shape is REFUSED BY NAME.** Only one authored
  file uses `ambient` today (`town-crier.json:24`), migrated in this same
  chunk - but the loader should still answer a hand-authored `["Hail"]` with
  a sentence naming the new shape, not `json: cannot unmarshal string`. The
  `trigger`/`blockedLine` tombstone rule (L22: the PO authors these files by
  hand): a custom `UnmarshalJSON` that sniffs a leading `"` and says so,
  ~10 lines.
- **D7 - throttle keyed by (actor entity id, player entity id), lazily
  expired.** A relog mints a new player entity id, so a relog resets the
  throttle - accepted, and the harness leg exploits it (§6). State the map
  holds must *survive* a player leaving the sensor (that is its whole job, it
  cannot self-rebuild the way `s.seen` does), so entries are dropped lazily
  when read expired, plus on player removal.

---

## 4. The change, file by file

### 4.1 Content vocabulary - `items/mobs/interaction.go`

- `jsonInteraction.Ambient` (:404) `[]string` → `[]jsonAmbientVariant`
  (`Conditions []JSONCondition` + `Lines []string`), with D6's shape-sniffing
  unmarshal. `Lines` empty → refused (an authored variant that says nothing is
  the silently-inert class DisallowUnknownFields exists for).
- Resolved `Interaction.Ambient` (:30) → `[]AmbientVariant` mirroring
  `InteractionNode`'s resolved conditions; mapper at :551 grows the loop.
- Two new `ConditionKind`s beside :324, two `conditionKinds` entries (:350),
  `ParseCondition` validation on the `kills_this_life` model (:493): a
  `talked_to`/`never_talked_to` without a `species` resolves to nothing and is
  refused by name. ⚑ Species resolution must accept any mob id, not just
  conversants - the condition is meaningful for any mob a talk-to quest can
  name.

### 4.2 The evaluator - `sys/interaction.go`

- Two cases in `conditionsPass` (:1026): `p.QuestLedger().HasTalkedTo(id)` and
  its negation. O(1) map reads, so L15 holds. Nodes gain both kinds with zero
  further work - the evaluator is shared.
- `sense()` (:281): replace the flat `if ambient := ...; len(ambient) > 0`
  with, per rising edge of player `p`:
  1. throttle check for (actor, p) - inside the window → done;
  2. walk the variants in order, first one whose conditions pass for `p` wins
     (the entering player is the subject; the whole sensor is the audience,
     D1) - none → done;
  3. substitute `{name}` with `p.Name()`;
  4. `speakToSensor(a, lines)` - marshalled fresh per edge, since the text is
     now per-edge;
  5. stamp the throttle.
  `p` is already in hand as `model.PlayerEntity` (:251), which satisfies
  `learner` at compile time through the existing `interactor` embed wired in
  `game.go` - **no new runtime structural assert**, so the R2/R3
  silent-wiring class has no foothold here.
- Throttle state on the system: `map[uint64]map[uint64]int64` last-hail tick
  (or a flat pair-keyed map), `const hailCooldownTicks = 180 *
  constant.TicksPerSecond // ~3 min [PLACEHOLDER]`, purged on player removal
  and lazily on expired reads.

### 4.3 Content - `api/mobs/`

Migrate `town-crier.json` to the new shape in the same commit as 4.1 (the
loader change hard-fails the old shape at boot, which is the point). New
variants per §5.

---

## 5. Landmines

- ⚑ **L1 - the hail path READS `HasTalkedTo` and never writes it.** The
  talked-to stamp lives at panel open only (`sys/interaction.go:328`) and
  `NoteTalkedTo` re-checks running quest stages (`quests/ledger.go:121`):
  stamping on proximity would advance talk-to quest objectives by walking
  past. This is the finding that justifies writing this plan down. A test
  pins it (§6.5).
- ⚑ **L2 - "met" means "has talked", not "has seen".** A player who never
  presses E hears the first-meeting hail on every (throttled) approach,
  forever. Accepted semantics, and arguably right: the NPC keeps inviting a
  stranger over.
- ⚑ **L3 - allocation.** The idle-loop alloc pins run with zero players and
  cannot see this path. The rule stands anyway: condition evaluation runs on
  the rising edge only, never per tick; the throttle map allocates on the
  edge only; the marshal happens only when a variant actually speaks. Re-run
  the alloc pins with `-count=2` regardless (the voicelines L3 discipline).
- ⚑ **L4 - the double-fan quirk changes shape.** Today two players entering
  the same tick trigger two identical `speakToSensor` fans (invisible: same
  text, latest-wins). After this chunk the two fans may carry *different*
  text and the last one wins the bubble for everyone. That is D1, accepted;
  noting it so nobody reads it as a regression.
- ⚑ **L5 - the bubble needs the speaker in the viewport.** `Chat.showMessage`
  silently drops messages for untracked entities (`Chat.ts:58`). Talk-reach
  sensors (~2 u) are far inside the viewport, fine today; it is why a
  hypothetical 60-unit greeter would go mute.
- ⚑ **L6 - the shape change breaks fixtures too.** `interaction_test.go` and
  any harness-authored interaction JSON that uses `ambient` must move with
  the loader; grep for `"ambient"` beyond `api/mobs/` before calling 4.1
  done. And per the standing lock: content edits do not invalidate the Go
  test cache - **`go test -count=1`** after the content pass.
- ⚑ **L7 - throttle resets on relog** (D7: keyed by entity id, in-memory).
  Accepted for flavour speech; do not "fix" it into persistence without a PO
  ask.

---

## 6. Test strategy

**Go, items/mobs (loader):**
1. New shape parses: conditions optional, order preserved; empty `lines`
   refused; unknown condition kind refused by name.
2. Old `[]string` shape refused with the D6 sentence (the tombstone test
   pattern, `interaction_content_test.go:176` precedent).
3. `talked_to`/`never_talked_to` without a species refused by name; with an
   unknown species refused by name.

**Go, sys (evaluator + edge):**
4. First-match-wins: a player passing variants 1 and 3 hears variant 1; a
   player passing none hears silence; conditions are judged against the
   *entering* player (two players, different ledger states, two edges, two
   different lines).
5. **The hail never writes the ledger** (L1): after a hail,
   `HasTalkedTo(actor)` is still false and a running talk-to stage is still
   incomplete.
6. Throttle: second edge inside the window is silent; after the window it
   speaks; two different actors greet independently; entries drop on player
   removal.
7. `{name}` substitution lands in the fanned bytes; a line without the token
   is untouched.
8. `talked_to`/`never_talked_to` as *node* conditions gate a node like any
   other kind (the free cross-NPC surface, D4).

**Content:** boot `-content ../api` clean, pinned counts unchanged,
`go test -count=1`.

**Sim:** the full battery byte-identical - sim mobs author no `interaction`
block, so this must hold by construction; TTK 6.67 s / TTD 8.70 s stand.

**Harness (`.claude/skills/verify`):** new `npc-hail.mjs` against the Town
Crier: (1) fresh character approaches → the first-meeting line renders over
the *crier's* entity (not a screen position - the `Cam Boundaries: On` trap);
(2) walk out and back inside the throttle → no second bubble; (3) open the
panel with E, close, **relog** (D7/L7 resets the throttle, the talked-to flag
persists), approach → the returning-visitor line containing the character's
name.

---

## 7. Effort

One chunk, ~half a session:

| Part | Size |
| --- | --- |
| Ambient variant shape + D6 unmarshal + two condition kinds | ~60 lines |
| `sense()` edge rework + throttle + substitution | ~40 lines |
| Go tests (§6.1–8) | ~180 lines |
| Harness leg | ~90 lines |
| Content | 2–3 files, PO text |
| Frontend | **0** |

**Schema impact: NONE.** `talked_to` reads the existing persisted
`quests.talkedTo` flag; the throttle is in-memory; no migration, no new flag
key.

---

## 8. Content proposal (text is the PO's, all [PLACEHOLDER])

- **Town Crier** - the showcase, three variants as in D3: quest-completed
  (`wolves-on-the-road` - `MatchesStage` answers regardless of who took the
  turn-in, D9's branch notwithstanding) → returning-visitor (`talked_to`
  TownCrier) → the existing "Hail Adventurer" fallback, byte-identical as the
  last variant.
- **Lampless Traveller** - one variant, quest-completed (`the-lost-lamp`),
  no fallback: silent otherwise, exactly today, and the proof that
  conditional-only authoring degrades to silence.
- **Farmer** - one `kills_this_life` variant (Wolf, ~10) as the kill-feat
  greeting, plus a plain fallback. Demonstrates the third condition family on
  the hail surface.

## 9. Open

- The 180 s throttle [PLACEHOLDER] - first number to check in the PO pass.
- D3–D7 are my calls, not rulings - D6 (refuse-by-name) and D7 (relog resets)
  are the two worth a second look.
- `{name}` in panel/node text: additive later, deliberately out (D5).
- This partially answers backlog item 2's open "contextuality" and
  "statefulness" questions (an NPC may branch on ledger state; memory is the
  talked-to set, per life). The rest of item 2's questions stay open there.
- Cross-life greetings ("the third of your line...") already work via the
  existing `bloodline_ascensions` kind, zero code, whenever content wants one.
