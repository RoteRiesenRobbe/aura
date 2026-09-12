# Plan: `follows`, the summon that is a pet (one chunk)

**Status: DESIGNED 2026-09-12, nothing built. Next chunk after spell builder
C4 (PO 2026-09-12: "plan it as its own next chunk"), ahead of spell builder
C5.** One chunk, C1, its own execution session. Schema: DB none, wire none,
conf none; content: four skill files plus the generated vocabulary fixture
(§6).

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
- `buildSummon` sets the summon's runtime flag from the params **only when
  an owner is bound** (a player caster). A mob-cast summon, which never
  binds an owner, degrades to creature behaviour exactly as an ownerless
  follower does today; nothing new to handle.
- `isFollower()` becomes `charmer != nil || follows`. The `role` branch goes.
- Everything downstream is untouched: the three call sites, the tether, the
  hold ring, the jitter, dormancy, `leader()`.

### 3.2 The transition guard: a LOAD-TIME refusal, not a runtime silence

After D1, a `spawn` effect naming a follower-role mob without `follows: true`
would load clean and produce a summon that stands still: the exact silent
class the C3 category rider closed (a rule that lives only in a runtime
switch). So the loader gets the cross-kind rule where `spawnMob` is already
resolved at boot (mobs load after skills): **a `spawn` of a `follower`-role
mob must author `follows: true`**, refused with the file and the mob named,
visible in boot, `aurad -validate`, and the editor's save seam. The reverse
is legal by design (a creature with `follows`, the whole point).

### 3.3 What `role: "follower"` means after this chunk

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
- `sys/skills.go` `buildSummon`: set the flag when `p.Follows` and an owner
  is bound.
- The cross-kind rule of §3.2 in the mob-side resolution of `spawnMob`, as a
  boot finding in the existing all-findings shape (C2).
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
- **L4: three spawn forms share one mapper.** The `follows` field is read
  for `spawn_at_anchor` and `projectile` too; legality is the `effectKeys`
  row. Pin the refusal on both, so a future "let the portal follow" is a
  decision, not a leak.
- **L5: the TS mirror has no pin.** `Skills.ts` `SpawnParams` is a hand copy;
  the rider is the only thing that keeps the tooltip honest.
- **L6: `cp-defs`.** Four `api/skills/` edits need `make -C backend build`
  before the embedded-content pins are believed (`51659e0b`).
- **L7: `api/skills/summonspider.json` is UNTRACKED** at planning time (the
  PO's C4 test skill, id 152). It is the natural exit-test subject; whether it
  ships is the PO's call, and any `git add -A` for C4 would carry it.

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

1. **Retire `role: "follower"`?** After D1 nothing behavioural reads it. It
   still labels the four companion mobs for the editors, the zone-editor
   palette and the census. Retiring it means re-roling four mob files to
   `creature`, deleting a role from the vocabulary, and re-teaching the
   palette what a companion is. Not this chunk; this chunk documents the
   narrower meaning (§3.3).
2. **Should `follows` imply the companion body?** A second key (or the same
   one) could swap the collision pair and speed at spawn, making the twin
   files fully redundant. YAGNI until a wild pet's body-blocking actually
   grates in play.
3. **Charm and `follows` converge on one field?** `charmer` carries a
   timer, a buff and a faction revert; `follows` carries nothing but a bool.
   Leave separate; `leader()` is already the one seam both feed.

## 9. Chunk + ledger

- **C1 - `follows`** (everything in §4, verified per §7). ⏳ NOT STARTED.

