# Plan: `follows`, the summon that is a pet (one chunk)

**Status: ✅ COMPLETE 2026-09-13 (C1 `follows`, C2 the retirement of
`role: "follower"`, C3 the summon despawns with its owner), PO-walked the same
day, verdict "all three work" (the walk record closes §9).** Designed
2026-09-12, executed and walked the next day. Commit `[uncommitted]`. Schema:
DB none, wire none, conf none; content: five skill files gain the key (four by
this session, the fifth `summonspider.json` ticked by the PO in the Skills tab
during the walk), four mob files lose their role, four authoring notes are
rewritten, plus the generated vocabulary fixture (§6) and the `cp-defs` copies.

> Planning session opened by the PO after the first spell authored end to end
> in the content editor (`SummonSpider`, spell builder C4 look): the summoned
> Spider fought on the caster's side, was untargetable by other players, and
> **stood where it spawned**. The PO asked whether every companion needs its
> own mob entry, whether existing mobs could be reused, what that would take,
> and whether it makes the model more consistent. Ruled by choice prompt:
> **uniform**, not additive (§3 D1).

## 1. What this is

Today a summon follows its caster only when the mob it spawns is authored
`role: "follower"`. That is why every pet is a twin file (`SoldierCompanion`,
`MedicCompanion`, `ShieldbearerCompanion`, `Companion`): the wild species
cannot be summoned as a companion, because the permission to follow lives on
the mob, not on the spell.

Charm already does what the PO wants. A charmed wolf keeps its species file
and its `creature` role, and follows and defends its charmer because the
follow check reads a **runtime leader link**, never the role
(`model/mob/companion.go` `isFollower`: `charmer != nil`). This plan gives
the `spawn` effect the same idea: an authored **`follows: true`** on the
effect sets a runtime flag on the summon, and the follow check reads that
flag. "Is this summon a pet" becomes a fact about the SPELL, authored in the
Skills tab, and every mob in the `spawnMob` picker is a candidate.

## 2. Measured, not recalled (2026-09-12)

- **The follow check has one authored reader of the role**:
  `companion.go:75` `return m.role == mobs.RoleFollower && m.owner != nil`.
  Every other reader of `RoleFollower` is a test, an editor grouping
  (`tools/content-editor/public/app.js` `MOB_ROLE_GROUPS`, `validate.mjs`
  `ROLES`), the zone editor's palette kind (`ZoneModel.ts:202` and
  `tools/tiled/generate-palette.mjs:115` map `follower` to `companion`), or
  the content census `role_content_test.go` ("the authored followers").
- **`isFollower()` has three call sites**, and each is a behaviour a followed
  mob inherits: `patrol.go:104` (movement: `updateFollow`, no world
  archetype), `patrol.go:195` (no evade point, follow IS the return
  behaviour), `mob.go:1440` (targeting: acquisition from the owner's combat
  signals inside the 10 u tether, no sensor, no threat retention, no leash).
  Dormancy is NOT role-gated (`dormancy.go:42` reads `owner`/`charmer`).
- **The summon path already overrides allegiance and level** (`sys/skills.go`
  `buildSummon`: `EnlistUnder` / `Align`, `SetOwner`, TTL,
  `SetSummonPowerPerLevel`). What it does not touch: the body (collision
  pair, radius), `factors.speed`, `xpFactor`, the wander/idle knobs, and the
  role.
- **What a companion twin file carries beyond the role** (`soldier-companion.json`
  against `spider.json`): `collisionLayer 160` / `collisionMask 17` (walks
  through mobs and players, blocked by static geometry and borders),
  `speed 1.2` (above the player's), `xpFactor 0`, no `faction`, `curveLevel 1`,
  and no wander knobs. A wild mob keeps its own on every one of those.
- **The follow AI copes with a slow body**: it walks at full speed toward the
  hold ring and snaps beside the owner beyond 15 u (`companionTeleportDistance`),
  so a 0.55-speed Spider lags but never strands. Charmed wolves are the
  shipped evidence this is playable.
- **Ten shipped `spawn` effects name a follower-role mob**: `SummonCompanion`
  (1), `CallForAid` (3), `FieldMedics` (3), `HoldTheLine` (3). The other
  spawn users name structures (`FireTotem`, `SummonTotem`, `OmniStrike`) or
  portals (`OpenPortal`, `PullThrough`, `spawn_at_anchor`). `ThrowBomb` /
  `ThrowMine` (`projectile`) name `ProjectileBomb`.
- **`spawnParams()` is shared** by `spawn`, `spawn_at_anchor` and
  `projectile` (`definition.go` ~2140); per-type legality is the `effectKeys`
  row, so a key added to the `spawn` row alone is refused on the other two by
  the existing allowlist check.
- **The spawn params reach the client** (`Skills.ts` `SpawnParams` mirrors
  the Go struct by hand, `summonLoadout` is attached server-side for the
  tooltip). There is no completeness pin between the two.
- **A new effect key reaches the Skills tab in two mechanical steps**, both
  pinned: regenerate `api/skill-vocabulary.json` (the golden test) and add a
  `skill-presentation.mjs` entry (smoke leg (d) reddens without one; a bool
  with no entry would render as a text input).
- **Do not reuse the charmer link for a summon.** `EndCharm` calls
  `RevertFaction`, and the removal fan-out calls `EndCharm` on every mob
  whenever ANY entity leaves the world; a summon riding `charmer` would flip
  back to its species faction mid-TTL. `role` is never written after
  construction (entity-model chunk 2), so it is not the carrier either. The
  flag is a new field beside `charmer`.

## 3. Design

### D1 (PO, 2026-09-12): UNIFORM. `follows` is the ONLY authored way a summon follows.

Over "additive, opt-in" (the four companion skills keep following through
their mob's role and `follows` is only for wild mobs; three paths in one
function). The PO chose the cleaner story: two paths into the follow check,
**charm and `follows`**, and the role-based branch is retired. The cost the
PO accepted: `role: "follower"` loses its behavioural reader, which makes it
a content classification (§3.3) and opens Q1.

### 3.1 The rule

- `spawn` gains one bool key, **`follows`**. Absent means false.
- `buildSummon` sets the summon's runtime flag from the params
  **unconditionally**, and the OWNER PRECONDITION lives in `isFollower()`
  (C1 CALL A, amended 2026-09-13 from "only when an owner is bound": one
  guard in one place). A mob-cast summon, which never binds an owner,
  degrades to creature behaviour exactly as an ownerless follower does today;
  nothing new to handle.
- `isFollower()` becomes `charmer != nil || (follows && owner != nil)`. The
  `role` branch goes.
- Everything downstream is untouched: the three call sites, the tether, the
  hold ring, the jitter, dormancy, `leader()`.

### 3.2 The transition guard: a LOAD-TIME refusal, not a runtime silence

> ⚑ **RETIRED IN C2 (2026-09-13).** This guard existed only to protect the
> transition: it refused a `spawn` of a `follower`-role mob that forgot
> `follows`. C2 deleted the role, so there is no mob left that promises to
> follow and then does not, and a `spawn` without `follows` is an ordinary
> creature summon rather than a silent class. The rest of this section is the
> C1 record.

After D1, a `spawn` effect naming a follower-role mob without `follows: true`
would load clean and produce a summon that stands still: the exact silent
class the C3 category rider closed (a rule that lives only in a runtime
switch). So the loader gets the cross-kind rule where `spawnMob` is already
resolved at boot (mobs load after skills): **a `spawn` of a `follower`-role
mob must author `follows: true`**, refused with the file and the mob named,
visible in boot, `aurad -validate`, and the editor's save seam. The reverse
is legal by design (a creature with `follows`, the whole point).

### 3.3 What `role: "follower"` means after this chunk

> ⚑ **RETIRED IN C2 (2026-09-13), Q1 closed.** The classification below never
> outlived the chunk that described it: the PO saw the Skills tab hint narrate
> §3.2's guard and asked *"I thought we only have one concept? what does a
> follower rule even do now?"*. Ruling: one concept. The role, its guard and
> the zone editor's derived `companion` marker kind are all gone. The rest of
> this section is the C1 record.

A content classification, no longer a behaviour: "a mob authored to be
summoned as a pet: the companion body pair, `xpFactor 0`, no faction, never a
zone spawn". Its readers are the editors' groupings, the zone-editor palette
kind, and the content census. `role.go`'s comment and the manual's role
paragraph say so explicitly. Whether the value should be retired is Q1, not
this chunk.

### 3.4 What a wild-mob pet does NOT get, recorded and not fixed

Its own body and speed (no companion collision pair: it can body-block; no
1.2 speed: it lags, then snaps), its nameplate and XP settings (irrelevant
for an ally nobody can attack). The twin file stays the answer for a pet that
needs the smoother body; it becomes optional instead of mandatory.

## 4. The change, enumerated

**Go**

- `skills/definition.go`: `Follows bool` on `effectDef` (`json:"follows,omitempty"`)
  and on `SpawnParams`; `spawnParams()` copies it; the `spawn` row of
  `effectKeys` gains `follows`. NOT the `spawn_at_anchor` or `projectile`
  rows (a portal is a door, a bomb is a bomb).
- `model/mob`: a `follows bool` field beside `charmer`, a setter used only by
  the summon builder, `isFollower()` rewritten per §3.1. `role.go` comment.
- `sys/skills.go` `buildSummon`: `m.SetFollows(p.Follows)`, unconditional
  (CALL A; the owner precondition is `isFollower`'s).
- The cross-kind rule of §3.2 in the mob-side resolution of `spawnMob`, as a
  boot finding in the existing all-findings shape (C2). ⚑ CALL C: the pass
  collects with `errors.Join` instead of returning on the first finding, so
  one run lists all ten.
- `skills_behavior_test.go:2964` builds a follower-role summon fixture; it
  gains `Follows: true` or its assertion changes meaning.

**Content (four files, ten effects)**: `follows: true` on every `spawn`
effect of `SummonCompanion`, `CallForAid`, `FieldMedics`, `HoldTheLine`.
Authored through the Skills tab once the checkbox exists (its first real use),
then `cp-defs` via `make -C backend build`.

**Fixture + editor (mechanical, pinned)**: `UPDATE_SKILL_VOCABULARY=1 go test
-count=1 ./pkg/aura/skills/` from `backend/`; `skill-presentation.mjs`
`follows: { control: 'bool', group: PAYLOAD, hint: ... }` with the hint
stating §3.2's rule and §3.4's trade-off. No other editor edit: this is the
first real run of the §B4.2 pattern carrying a new key to the form.

**Client, a rider**: `Skills.ts` `SpawnParams` gains `follows?: boolean`, and
the tooltip's spawn line says "follows you" when set. One line each; no pin
exists to force it, so it is named here so it is not forgotten.

**Docs**: `manual-content-authoring.md` §2 (the spawn effect's keys) and the
role paragraph (lines ~79-88, ~163); `content-cooldowns.md` if it describes
the companion skills' follow behaviour; this doc's ledger; the add-content
skill only if its landmine list names the role.

## 5. ⚑ Landmines

- **L1: the charmer link is not the carrier** (§2, last bullet). A summon on
  `charmer` reverts faction on any entity's departure.
- **L2: `role` is never written after construction.** The flag is its own
  field; do not "simplify" by writing `RoleFollower` onto the summon.
- **L3: the silent standing summon.** Without §3.2, forgetting `follows` on
  a companion skill loads clean and the summon stands still. The loader rule
  is the guard; a content test alone would only cover shipped files.
  ⚑ **Defused by C2**, not by the guard: with the role retired, no mob def
  claims to be a pet, so a `spawn` without `follows` is an ordinary creature
  summon that behaves exactly as authored. The guard went with the role.
- **L4: three spawn forms share one mapper.** The `follows` field is read
  for `spawn_at_anchor` and `projectile` too; legality is the `effectKeys`
  row. Pin the refusal on both, so a future "let the portal follow" is a
  decision, not a leak.
- **L5: the TS mirror has no pin.** `Skills.ts` `SpawnParams` is a hand copy;
  the rider is the only thing that keeps the tooltip honest.
- **L6: `cp-defs`.** Four `api/skills/` edits need `make -C backend build`
  before the embedded-content pins are believed (`51659e0b`).
- **L7: `api/skills/summonspider.json`** (the PO's C4 test skill, id 152).
  ⚑ **Corrected 2026-09-13**: it was untracked at planning time, but it SHIPPED
  with C4 (`71183777`), so the `git add -A` warning is moot. It stays the
  natural exit-test subject, and C1 deliberately left it alone: it spawns the
  wild creature-role `Spider`, so the §3.2 rule does not fire on it and its
  `follows` box renders unchecked, which is exactly the state the PO's exit
  test changes.

## 6. Schema impact

**DB NONE** (summons are never persisted). **Wire NONE** (the catalog is
HTTP JSON, additive; FlatBuffers untouched). **Conf NONE.** **Content**:
four skill files gain one key per spawn effect; the generated fixture; the
`cp-defs` copies.

## 7. Test strategy (red-first where a seam exists)

- `model/mob/companion_test.go`: an owned `creature`-role mob WITH the flag
  follows at full speed (mirror `TestMob_FollowerFollowsOwnerAtFullSpeed`,
  which itself switches from `def.Role = RoleFollower` to the flag) · the
  same mob WITHOUT the flag does not (`TestMob_OwnedCreatureDoesNotFollowItsOwner`
  stays as is) · ⭐ **the retirement pin**: an owned `follower`-role mob
  WITHOUT the flag does not follow (this is what makes D1 uniform; a subject
  capable of the thing denied) · `TestMob_OwnerlessFollowerFallsBackToCreatureBehaviour`
  is rewritten around the flag (flag set, no owner: stands, TTL cleans up).
- `skills/definition` tests: `follows` accepted on `spawn`, refused on
  `spawn_at_anchor` and `projectile` (L4); the golden fixture test red until
  regenerated.
- The §3.2 rule: a fixture tree with a follower-role mob spawned without
  `follows` is refused naming both; the four shipped skills pass; `aurad
  -validate -content ../api` exits 0 after the content edit.
- `sys` behaviour: the existing companion acquisition test keeps passing with
  the fixture carrying the flag.
- Editor: `npm run smoke` (legs (a), (d) with the new entry), the browser
  harness sweep (SummonCompanion renders the checkbox checked).
- **In-game exit test, two halves**: (1) regression: `CallForAid` still
  brings three soldiers to heel; (2) the point: `SummonSpider` with
  `follows` ticked in the tab, restart, cast, the Spider trails the player
  and takes its fights. Both PO-walked, or the chunk is not done.

## 8. Open questions

1. ~~**Retire `role: "follower"`?**~~ ⭐ **CLOSED 2026-09-13, PO-ruled: retire
   the role now.** After D1 nothing behavioural read it; it only labelled four
   mob files for the two editors, the zone-editor palette and the content
   census, and C1's loader guard existed only to protect the transition. The
   PO saw the Skills tab hint describing that guard and asked *"I thought we
   only have one concept? what does a follower rule even do now?"*. One
   concept: the SPELL's `follows` key. Built as **C2** (§9).
2. **Should `follows` imply the companion body?** A second key (or the same
   one) could swap the collision pair and speed at spawn, making the twin
   files fully redundant. YAGNI until a wild pet's body-blocking actually
   grates in play.
3. **Charm and `follows` converge on one field?** `charmer` carries a
   timer, a buff and a faction revert; `follows` carries nothing but a bool.
   Leave separate; `leader()` is already the one seam both feed.

## 9. Chunk + ledger

- **C1 - `follows`** (everything in §4, verified per §7). ✅ **SHIPPED
  2026-09-13** `[uncommitted]`.
- **C2 - retire `role: "follower"`** (Q1, PO-ruled the same day). ✅ **SHIPPED
  2026-09-13** `[uncommitted]`.
- **C3 - the summon despawns with its owner** (§10, PO bug report the same
  day). ✅ **SHIPPED 2026-09-13** `[uncommitted]`.
- **The PO walk of all three**, 2026-09-13, verdict *"all three work"*: the
  record closes this section, below the C3 ledger. All three chunks ship in one
  commit.

### C1 ledger (2026-09-13)

**Schema: DB NONE** (summons are never persisted; the flag is a runtime field
that no save path reads). **Wire NONE** (the skill catalog is HTTP JSON and the
addition is optional; FlatBuffers untouched). **Conf NONE.** **Content**: four
skill files (`summon-companion.json` 1 effect, `call-for-aid.json` 3,
`field-medics.json` 3, `hold-the-line.json` 3) gain `follows: true`, plus the
generated `api/skill-vocabulary.json` and the four `backend/pkg/api/skills/`
`cp-defs` copies. ⚑ `api/skills/summonspider.json` was deliberately NOT touched:
ticking its box in the Skills tab is the PO's exit test.

**Three implementation calls (mine, not PO calls):**

- **CALL A - the owner precondition lives in `isFollower()`**
  (`follows && m.owner != nil`), not in `buildSummon`, which sets the flag
  unconditionally from `p.Follows`. One guard in one place, and
  `TestMob_OwnerlessFollowerFallsBackToCreatureBehaviour` keeps its exact
  meaning when rewritten around the flag. §3.1 and §4 were amended to match.
- **CALL B - the §3.2 loader rule applies wherever `effect.Spawn != nil`**,
  i.e. all three spawn forms. `follows` is not authorable on `spawn_at_anchor`
  or `projectile`, so a follower-role mob is unplaceable there; that is
  correct, a companion standing at a campfire is the same silent class.
- **CALL C - `validateSpawnEffects` collects with `errors.Join`** rather than
  returning on the first finding, so one `-validate` run lists all ten.
  `cmd/aurad/content.go` `stageFindings` already flattens joined errors, and
  `loadMobs` returns the registry error bare, so the shape survives to stdout
  (pinned by `TestRegistryFromFS_EverySpawnFindingIsReported`).

**Red→green proofs**

- `TestMap_SpawnEffectFollowsIsOptIn` red with `skill "SummonCompanion":
  effect "spawn": field "follows" is not valid on this effect type` (struct
  field present, `effectKeys` row not yet), green after the row.
- `TestMap_SpawnAtAnchorRefusesTheOptInAndPowerKeys` /
  `TestMap_ProjectileRefusesTheSummonOnlyKeys` gained a `follows` case each and
  stayed green across the row addition (L4 pinned in both directions).
- `TestVocabulary_FixtureMatchesTheLiveTables` red on the missing key,
  regenerated with `UPDATE_SKILL_VOCABULARY=1`.
- ⭐ **The retirement pin**
  `TestMob_OwnedFollowerRoleWithoutTheFlagDoesNotFollow` red BEFORE the
  `isFollower` rewrite (the owned follower-role mob stepped to
  `{0.0547, 0.0062}` instead of standing), green after.
- `TestMob_OwnedCreatureWithTheFollowsFlagFollowsItsOwner` red (`0` vs the
  0.055 full-speed step), green after the rewrite.
- 16 companion/charm tests went red on the fixture and green once
  `newTestCompanion` set the flag; `TestCooldown_SpawnMovingSummonFollowsOwner`
  red (no step) and green once the fixture's spawn params authored
  `Follows: true`.
- `TestRegistryFromFS_FollowerRoleSpawnWithoutFollowsHardFails` and
  `TestRegistryFromFS_EverySpawnFindingIsReported` red ("An error is expected
  but got nil"), green with the rule.

**The 10 → 0 measurement.** Before the content edit,
`./aurad -validate -content ../api` exited 1 with **13 finding(s)**: the ten
`mobs:` lines (HoldTheLine ×3 ShieldbearerCompanion, FieldMedics ×2
SoldierCompanion + ×1 MedicCompanion, CallForAid ×3 SoldierCompanion,
SummonCompanion ×1 Companion), each reading `spawnMob "X" is a follower-role
mob, so the spawn effect must author follows: true`, plus the three cascade
lines `quests / ascension / zones: skipped (mobs did not load)`. After the four
content edits: **0 finding(s), exit 0**.

**Also touched, beyond §4:** `cmd/simharness/main.go`'s `-mob-role` help text
said "follower acquires from its owner", which D1 made false; it now says the
value is a classification only. Three `effectKeys` comments and two test
comments counted the deliberately-missing keys ("TWO", "THREE") and were
re-counted.

**Verification (2026-09-13)**: `go build ./...` clean · `go test -count=1
./...` **35 packages, 0 failures** (`store` and `accounts` skip without
`AURA_TEST_DB_URL`) · `./aurad -validate -content ../api` **0 findings, exit
0** · editor `npm run smoke` **0 findings across 106 skill files / 163 effects,
34 effect types, 33 glyphs** · browser harness
`content-editor-skills-tab.mjs` **0 problems** (73 skills, 123 cards) and a
targeted check: the FOLLOWS checkbox with its hint renders CHECKED on
SummonCompanion and on all three CallForAid cards, UNCHECKED on SummonSpider
and SummonTotem · frontend `npm test` **668 tests / 37 files green**,
`npm run typecheck` clean.

### C2 ledger (2026-09-13) - the retirement of `role: "follower"`

**The PO ruling, in the PO's words.** Looking at the Skills tab's `follows`
hint, which narrated C1's §3.2 guard: *"I thought we only have one concept?
what does a follower rule even do now?"*. Ruled: **one concept**. Delete the
role and the guard, do not keep a label that only the editors read.

**Schema: DB NONE · wire NONE · conf NONE.** **Content**: the four companion
mob files (`companion.json`, `soldier-companion.json`, `medic-companion.json`,
`shieldbearer-companion.json`) each lose their `"role": "follower"` line, plus
the four `cp-defs` copies. Absent means creature, so nothing was written in its
place. ⚑ `api/skill-vocabulary.json` is untouched: the role never lived in the
skill vocabulary.

**⭐ CALL D (mine, recorded for the PO): the zone editor's derived `companion`
marker kind goes with the role.** `kindOf` in `ZoneModel.ts` and its mirror in
`tools/tiled/generate-palette.mjs` read ONLY `role === 'follower'`, so with the
role gone the bucket has no input. The four companion mobs fall into `combat`
in both editors; zone authors simply do not place them, exactly as they did not
before. **No replacement flag** (YAGNI), and deriving "companion" from
`xpFactor: 0` would be the infer-from-a-number pattern the entity model
retired. Consequences carried through: the `'companion'` member of `MobKind`,
the brown marker colour, the "Companions" optgroup, the `KIND_COLOUR` entry,
and with it Tiled's generated **`AuraSpawnCompanion` object class** (the
palette generator derives one class per kind), which also cost a line in
`aura-convert.js`'s "you forgot the Class" message and in
`manual-tiled-editor.md`. No zone places a companion, so no `api/zones/` file
changed.

**Tests deleted, each with its reason**

- `TestRegistryFromFS_FollowerRoleSpawnWithoutFollowsHardFails` and
  `TestRegistryFromFS_FollowerRoleSpawnWithFollowsLoads` (`registry_test.go`) -
  they pinned C1's transition guard, which is deleted. `followerPetJSON` went
  with them.
- ⭐ `TestMob_OwnedFollowerRoleWithoutTheFlagDoesNotFollow`
  (`model/mob/role_test.go`), C1's own retirement pin - **the negative space it
  pinned no longer exists.** It needed a subject capable of the thing denied (a
  mob authored `follower`); with the role retired there is no such subject, and
  the behaviour it asserted is already pinned by
  `TestMob_OwnedCreatureDoesNotFollowItsOwner`, which is now the only shape
  there is. Its former sibling comment says so.
- The follower census assertion in `TestContent_AuthoredRoleCensus`
  (`role_content_test.go`) - the role is gone, so is the bucket. Its two
  neighbours moved with it: creature 48 → 52 and `Len(byRole, 3)` → 2, both
  with a comment line in the file's existing count-history style.
- `it('classifies role follower as companion')` (`ZoneModel.test.ts`) -
  repurposed rather than dropped: it now asserts the retired value falls
  through to `combat`, which is the guarantee `kindOf` still owes (an
  unrecognized role must never throw).

**Tests repurposed**

- `TestRegistryFromFS_EverySpawnFindingIsReported` - it drove CALL C's
  `errors.Join` collection with two follower-role spawns missing `follows`. It
  now drives it with two spawnMob TYPOS (`"Compainon"`, `"Spidr"`). The
  behaviour pinned (two findings from one run, joined not wrapped, so
  `stageFindings` flattens them) is not specific to the retired rule, and the
  typo finding is the one that remains.
- `TestMapMobDefinition_MovingRolesStillRequireAggroRadius` →
  `TestMapMobDefinition_CreatureStillRequiresAggroRadius`: the loop over two
  moving roles is one role now, so the plural name would have lied.

**The red→green sequence, honestly.** Deleting `RoleFollower` from `role.go`
left the Go code compiling and the mobs package RED with ten content failures:
`contentRegistry(t)` reads the EMBEDDED `backend/pkg/api/mobs/`, which still
authored `"role": "follower"` and now hit `role "follower" must be one of
creature/structure`. That is the cp-defs seam (L6) doing its job, not a
mistake: the package went green only after the four `api/mobs/` edits and
`make -C backend build`. Nothing else in the tree needed the same wait.

**Files touched: 40, enumerated below and re-derived from `git diff
--name-only` rather than counted while writing.**

*Go, 14 files + 1 HTML*: `items/mobs/role.go` (the const, the map, three comments),
`items/mobs/registry.go` (the guard block + its doc paragraph; CALL C's
`errors.Join` collection STAYS, it still serves multiple typo findings),
`items/mobs/definitions.go` (the `Role` field doc),
`items/mobs/role_test.go`, `items/mobs/role_content_test.go`,
`items/mobs/registry_test.go`, `model/mob/mob.go` (the `role` field doc),
`model/mob/companion.go` (`isFollower`'s doc), `model/mob/support.go` (the
"different axis" comment), `model/mob/role_test.go`, `model/mob/mob.go`'s
`Interaction()` comment,
`model/mob/companion_test.go`, `sys/interaction.go` (the Conversant comment),
`sys/skills_behavior_test.go`, `cmd/simharness/main.go` (`-mob-role` help) and
`cmd/simharness/index.html` (the web explorer's hand-written role list, the
very drift `RoleNames()` exists to prevent).

*Content, 4 files*: the four companion mob files, plus their four `cp-defs`
copies under `backend/pkg/api/mobs/` (⚑ that directory is gitignored, unlike
`backend/pkg/api/skills/`, so the copies never show in `git status`: verify
them with grep, not with the diff).

*Editors, 13 files*: `tools/content-editor/validate.mjs` (`ROLES`),
`tools/content-editor/public/app.js` (`MOB_ROLE_GROUPS` + its comment),
`tools/content-editor/skill-presentation.mjs` (the `follows` hint, rewritten to
drop the guard sentence), `tools/tiled/generate-palette.mjs` (`kindOf` +
`KIND_COLOUR`), `tools/tiled/extensions/aura-zone/aura-convert.js` (the
Class-not-set message), `frontend/.../ZoneModel.ts`, `ZoneModel.test.ts`,
`ZoneEditor.ts`, `_ZoneEditorPanel.ts`, `AuraTiledConvert.test.ts`, and
`.claude/skills/verify/content-editor-skills-tab.mjs` (Structures first) and
`tools/content-editor/README.md` (two groups, not three).

*Generated, regenerated and kept, 3 files*: `tools/tiled/palette/content.json` (4 mobs
`companion` → `combat`), `tools/tiled/palette/propertytypes.json` and
`tools/tiled/aura.tiled-project` (both drop the `AuraSpawnCompanion` class, 55
lines each). `node tools/tiled/generate-palette.mjs` twice in a row is
idempotent.

*Docs, 6 files*: `manual-content-authoring.md` (the role paragraph, the
`aggroRadius` bullet, the spawn key row), `manual-tiled-editor.md` (three
Classes, not four), `content-mobs.md` (the soldier-companion row),
`plan-content-editor.md` (the two current-fact statements only; the C4 ledger
entries at §B12 are history and stay), `README.md` (the index line), this doc.
⚑ Deliberately NOT touched: `docs/feedback.md`'s dated intake row and
`.claude/skills/verify/chunk2-follower.mjs`, both history.

**Verification (2026-09-13, all this session's own runs)**

- `go build ./...` clean, `go vet ./...` clean, `gofmt -l` clean on every file
  edited here.
- `go test -count=1 ./...` **35 packages, 0 failures** (`store` and `accounts`
  skip without `AURA_TEST_DB_URL`).
- `./aurad -validate -content ../api` **0 finding(s), exit 0**, 63 mobs / 106
  skills / 2 zones. ⚑ Nothing surfaced from the companions becoming ordinary
  creatures: no loader rule keys off creature-ness that they now violate
  (`xpFactor 0` and the absent faction are legal on a creature).
- Content editor `npm run smoke` **0 findings across 106 skill files / 163
  effects, 34 effect types, 33 glyphs**.
- Browser harness `content-editor-skills-tab.mjs` **0 problems**: 73 skills,
  123 cards, and the picker now reads **Structures 11 · Creatures 52** with
  Structures first (was Followers 4 · Structures 11 · Creatures 48).
- Frontend `npm test` **678 tests / 38 files green**, `npm run typecheck`
  clean. ⚑ C1 measured 668 / 37; the extra file and ten tests are a CONCURRENT
  session's `FloatingNumberLayout.test.ts`, not C2's.
- Grep census, before → after: `role.*follower` in `api/` **4 → 0**;
  `RoleFollower` in `backend/` **17 → 0**; `'follower'` / `"follower"` in
  `frontend/src` **2 → 1** (the one remaining is the repurposed
  `ZoneModel.test.ts` case that pins the retired value falling through);
  `companion` as a kind in `frontend/src/features/zone-editor/` and
  `tools/tiled/` **7 → 0** (excluding comments that narrate the retirement).
  ⚑ The word "follower" itself survives in `backend/**/*.go` and is CORRECT
  there: it is the codebase's word for a mob that is currently following, which
  `isFollower()` still answers (`companion.go`, `patrol.go`, `mob.go`,
  `support.go`, `steering.go`'s wall-follower). What was swept is every use
  that named the ROLE VALUE: the narrowed grep
  `RoleFollower|"follower"|'follower'|follower-role|structure or follower` over
  `backend --include=*.go` returns only two lines, both C2 comments explaining
  what was retired.
- ⚑ `gofmt -l` flags `cmd/simharness/main.go`, and that is PRE-EXISTING at
  HEAD (an unaligned struct literal 13 lines below the help string this chunk
  edited); it was not touched, to keep the diff honest.

**⚑ Residue, NOT fixed, needs a PO call.** The four companion mobs' `_comment`
authoring notes still narrate the old model ("role follower", "followers
acquire from owner combat signals", "Companion pattern verbatim (role
follower…)"). They were left byte-identical on purpose, because rewriting a
`_comment` is a content-authoring judgement under the 2026-09-11 rule, not a
mechanical sweep. They are now factually wrong about their own files.

**The in-game exit tests were still owed when C2 landed**, C1's two and C2's
own (which is the same pair: the retirement is visible only as behaviour that
kept working). The PO walked them the same day, on the C3 build; the record
closes this section.

### C3 ledger (2026-09-13) - the summon despawns with its owner

**The bug, in the PO's words** (report 2026-09-13, after the C1/C2 look):
*"If I die, my companions remain but are no longer bound to me, they just stand
there until they disappear. They should de-spawn with the player."* Measured:
`updateFollow` answers a dead or absent leader with "stand", and nothing else
ever ended a summon early, so every pet, totem, portal and thrown bomb kept
standing for the rest of its TTL after its owner left the world.

**Three PO rulings by choice prompt, the same day**

- **R1 SCOPE: every OWNED summon**, not only the followers. Pets, totems,
  FireTotem, the portal pair, thrown bombs. One rule, no orphan class, and no
  orphans after a logout either.
- **R2 FLIGHT: a flight-path takeoff fires the same hook** and takes them too.
  A pet cannot follow a flight, and a totem left burning at the flight master
  is the same orphan by another name. One hook, no special case.
- **R3 TIMING: now**, as C3 of this plan.
- **R4 CAMP (PO, 2026-09-13, after the build): the placed `Camp` mini-campfire
  goes too, one rule.** Ruled by choice prompt when consequence 1 below was put
  to the PO; no exemption, no code.

**The shape.** `MobSystem.ForgetDeparted` was already the one hook both death
and disconnect reach (`game.RemoveEntity` fans out to every system's `Remove`),
and the flight takeoff already calls it directly (the `FlightForget` seam,
`core/input.go`). It broke charms through a `charmBreaker` capability and
dropped aggro through `targetForgetter`; C3 adds a **third capability**,
`ownedSummon { OwnedBy(id uint64) bool; ExpireWithOwner() }`, and the loop
retires whatever the departed entity owned. Nothing new is wired, and R2 costs
zero code: the flight seam was already calling this function.

**⚑ Expiring inside the loop is safe** because it removes nothing. The verb is
the TTL expiry's twin: it zeroes `health`, and `MobSystem.Update`'s deferred
sweep takes the mob out of `n.mobs` on the NEXT tick, which is the §27.1 rule
(never mutate `n.mobs` under iteration). Kill rewards do not flow (they only
flow through `PlayerTouches`) and stale threat rows onto the summon prune
themselves, exactly as on TTL expiry. Dormancy cannot strand one either: an
owned mob is never dormant (`dormancy.go:42`), so the sweep always sees it.

**⚑ The recursion edge, pinned.** A summon's OWN removal fans out through
`ForgetDeparted(summonID)` in turn. Nothing is owned by a mob (`owner` is a
`model.PlayerEntity`), so that pass is a no-op and cannot recurse or
double-remove. `ExpireWithOwner` is also idempotent, which the flight seam
needs: a mid-flight disconnect calls the hook a second time for the same
player.

**⭐ THE PORTAL FINDING (asked for, and it is a non-finding): there is no pair
link to respect.** `OpenPortal` (`spawn`, `PortalHome`) and `PullThrough`
(`spawn_at_anchor`, `PortalSummon`) are two independent skills, each spawning
ONE owned mob with its own TTL; no runtime structure ties a portal to a twin,
and no despawn logic exists beyond the TTL. Expiring one therefore leaves
nothing half-broken. It is also strictly consistent with what the portal
already did: `portalTravel.destination` resolves THROUGH `t.owner` at
step-through time, so an owner who died, logged out or took off already turned
the doorway into a locked "this leads nowhere" row (`interaction.go`, D3/D5).
C3 removes the door instead of leaving it standing and dead.

**⚑ TWO CONSEQUENCES THE PO SHOULD SEE, both falling out of R1 with no code:**

1. **The placed mini-campfire (`Camp`) goes too.** `applyCamp` binds an owner
   (`SetOwner(p)`), so under R1 the camp expires when its placer dies, logs out
   or flies. The PO's list named pets, totems, portals and bombs, not this. It
   was deliberately NOT special-cased: R1/R2 asked for one rule, and a heal
   fire burning for a player who is not there is the same orphan. If the PO
   wants it exempt, that is one `if` on the def name in `ForgetDeparted`, and
   the sys test already has the structure fixture to flip. **RULED R4: no
   exemption.** `campByOwner` needs
   nothing: its own comment says a stale id simply fails to resolve and is
   overwritten by the next placement.
2. **`doFuneral` is dead code, and that vindicates using this hook.**
   `ConnectionStateSystem.doFuneral` loops `p.OwnedEntities()` and removes each
   one, which reads like the natural home for this behaviour. It is inert:
   `player.ownedEntitites` is initialised empty and never appended to anywhere
   in the tree (a Berryhunter leftover). Left alone, out of scope, recorded
   here so the next reader does not "fix" C3 by moving it there.

**Red→green proofs** (every red is a real assertion, not a build error: the two
verbs were added as stubs first so the tests could fail on behaviour)

- `TestMob_OwnedBy_ReportsTheOwnerLink` red at `departure_test.go:117`,
  *"Should be true / its own owner"*; green with the `CharmedBy` twin.
- `TestMob_ExpireWithOwner_RetiresTheSummonOnItsNextUpdate` red at
  `departure_test.go:133`, *"Should be zero, but was 1 / health is zeroed on the
  spot"*, and at 134 *"the next Update reports it dead"*; green with the one
  assignment.
- `TestMob_ExpireWithOwner_IsIdempotent` red the same way at 147/148; green.
- ⭐ `TestMobSystem_Remove_ExpiresEveryOwnedSummonOfTheDepartedPlayer` red at
  `mob_test.go:263` *"Should be zero, but was 1 / the pet expires with its
  owner"*, 264 *"and so does the owned structure (R1)"*, and 269/270
  *"[]uint64{0x1} does not contain 0x2 / 0x3"* (the two summons still standing
  after a tick) - the PO's bug, reproduced headlessly. Green with the third
  capability. It carries a follower-flagged pet, a `structure`-role owned totem
  (R1's subject: owned but never a follower) and an unowned world mob that must
  survive.
- `TestMobSystem_ForgetDeparted_ExpiresOwnedSummonsForAFlightTakeoff` red at
  `mob_test.go:297` and 304; green. It pins R2 (the hook called directly, no
  entity removal at all) and the recursion edge in the same test.
- ⚑ **Nothing went red that was pinning the old behaviour.** No shipped test
  asserted a summon outliving its caster; the full suite passed unchanged on
  the first run after the implementation.

**Files touched: 9**

*Go, 2 + 2 tests*: `model/mob/mob.go` (`OwnedBy` + `ExpireWithOwner` beside
`Owner()`, and the TTL block's comment now names its twin),
`model/mob/companion.go` (`updateFollow`'s "a dead/absent owner means stand;
the TTL cleans up" was stale the moment C3 landed - it is now at most a
one-tick state for an owner who LEFT), `model/mob/departure_test.go` (3 tests),
`sys/mob.go` (the `ownedSummon` capability, the loop's third clause, and the
`ForgetDeparted` doc paragraph carrying R1/R2 and the why-it-is-safe note),
`sys/mob_test.go` (2 tests).

*Content, 4 files*: the four companion mobs' `_comment`s, PO-cleared as an
authoring fix - this closes C2's recorded residue. Each was rewritten under the
2026-09-11 rule (what it is, what is placeholder, at most one landmine): they
still claimed "role follower" and "followers acquire from owner combat
signals", both retired by C2. 309-347 characters each, down from 550-900, and
free of the glyphs and ALL-CAPS the manual's `_comment` rule bans. ⚑ Only the
`_comment` VALUE changed, by string replacement rather than a JSON round-trip,
so no key moved (L14): `git diff --numstat` reads 1 insertion / 2 deletions per
file, the second deletion being C2's `role` line.

⚑ **Left alone, out of scope**: `api/mobs/portal-home.json`'s note still says
the doorway stands "for its TTL and then dying with the summon sweep", which C3
makes incomplete rather than wrong. It was not among the four the PO cleared.

*Docs, 3 files*: `manual-content-authoring.md` (the spawn key row: `ttlTicks`
is not the only end), `content-cooldowns.md` (a banner above the table plus the
SummonCompanion row, which said "despawns on TTL" flat), this doc.

**Schema: DB NONE** (summons are never persisted; nothing about the departure
touches a save path - the disconnect save runs on the PLAYER, unchanged).
**Wire NONE** (the summon's removal reaches the client through the ordinary
entity sweep). **Conf NONE.** **Content**: four `_comment` values and their
`cp-defs` copies; no key, no number.

**Verification (2026-09-13, all this session's own runs)**

- `go build ./...` clean, `go vet ./...` clean, `gofmt -l` clean on all five
  edited Go files.
- `go test -count=1 ./...` **35 packages ok, 0 failures**, run once
  immediately after the implementation and again at the tail (`store` and
  `accounts` skip without `AURA_TEST_DB_URL`).
- `make -C backend build` (runs `cp-defs`), then
  `./aurad -validate -content ../api`: **0 finding(s), exit 0**, 63 mobs / 106
  skills / 12 factions / 13 quests / 2 zones.
- Frontend and the content editor are untouched by C3, so neither was re-run.

**The in-game walk, three halves** (C1's two plus C3's: cast a companion, die,
and watch it go with you): PO-walked the same day, record below.

### The PO walk (2026-09-13): "all three work"

The PO walked all three chunks in one sitting on the C3 build and gave the
verdict in three words: *"all three work"*.

- **The regression (C1)**: `CallForAid` still brings its three soldiers to
  heel. The role they used to follow through is gone; the key on the spell
  carries them.
- **The point (C1), and the PO's own authoring**: the PO ticked `follows` on
  `SummonSpider` in the Skills tab, restarted, cast it, and the wild Spider
  trails the player and takes its fights. The spell the PO built in the content
  editor yesterday became a pet today without a line of Go and without a twin
  mob file. ⚑ That tick is why the tree carries a FIFTH skill file:
  `api/skills/summonspider.json` and its `cp-defs` copy gain `follows: true`,
  authored by the PO through the tab, not by this session. The C1 ledger's
  "deliberately NOT touched" records the state at build time and stays as
  written.
- **The despawn (C3)**: summons vanish with their owner. Cast, die, and the
  companion goes with you instead of standing out its TTL.
- **C2 has no leg of its own**, by its nature: retiring `role: "follower"` is
  visible only as the two legs above continuing to work without it.

**The harness gate, re-run at wrap time on the C3 build.**
`.claude/skills/verify/chunk2-follower.mjs` owns the summon path end to end
(spellbook → cooldown slot → spawn → follow → engage) and is the script this
chunk invalidates or vindicates: **5 PASS · 1 INCONCLUSIVE · 0 console errors ·
0 WebGL context losses**. The follow leg is the whole chunk in one number,
`companion gap 0.8 → 1.49 units` across an 8.2-unit walk: the summon is an
ordinary creature-role mob now and still keeps station. The inconclusive leg is
the script's designed tri-state, not a red (the companion died in the
wolf-dense venue before it could earn its owner XP: `peak floating numbers 4`,
`XP 21 → 21`). ⚑ Its header comment, which narrated the retired role rule as
the reason a summon follows, was corrected in this wrap; its assertions needed
no change, because they measure the behaviour and not its carrier.
`content-editor-skills-tab.mjs` was NOT re-run: it last read 0 problems after
C2, and C3 touched no editor file.

## 10. C3: the summon despawns with its owner (PO bug, 2026-09-13)

Opened by the PO's report above, ruled by choice prompt the same day (R1-R3),
built as C3. The design is one paragraph long because the hook already existed:
the removal fan-out that breaks charms and drops aggro gains a third thing it
severs, the ownership link, and the verb it calls is the TTL expiry's twin. See
the C3 ledger in §9 for the rulings, the two PO-visible consequences (the placed
camp goes too; `doFuneral` is dead code) and the portal finding.
