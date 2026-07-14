# Avatar System — Selection, Unlock Gating & Mid-Game Re-Selection

> **Status: DESIGN SKETCH 2026-07-14, not scheduled for execution yet.**
> Ties together two roadmap items that were written independently into one
> coherent system: the **join-screen portrait picker** (`roadmap.md:493`,
> "Avatar selection (new-mode)") and the **icon-unlock track**
> (`roadmap.md:474`, character/token icons unlocked at milestones). Both live
> in execution-order **step 8** ("Accounts & persistence + UI polish / avatar /
> audio", `roadmap.md:875`), deliberately after the content pass (step 6) and
> the rebrand (step 7). This note gives step 8 something concrete to build
> against; it does not pull the work forward. All numbers are [PLACEHOLDER].

---

## 1. Why one note

The roadmap currently has two disconnected lines:

- **Picker** — a start-screen portrait chooser; the choice persists via
  `accounts` (item 3) and is made multiplayer-visible with one `avatar_id`
  field on `Character` + a frontend id→SVG map.
- **Icon-unlock track** — character/token icons unlocked at milestones,
  level-ups, mob kills, aura unlocks; described as "a cosmetic lane parallel to
  the spellbook unlocks."

Neither says how they connect. The obvious questions fall out of putting them
side by side:

1. Does the picker only offer avatars the account has **unlocked**, or is it a
   fixed list?
2. Can a player **re-open** the picker mid-game to switch, or is the choice
   locked at join?
3. Where do unlocks **live** — per-character or per-account?
4. What is the **wire** cost, and does it touch the physics body? (`tdd.md:143`
   is a hard constraint: cosmetic avatar rewards are rendering-only — sprite
   scale, never the physics body.)

This note answers all four with the simplest design that satisfies the vision
(KISS/YAGNI), reusing the milestone mechanism that already exists.

---

## 2. The design in one paragraph

An **avatar** is a cosmetic identity — one SVG texture, nothing more. Every
account owns a **set of unlocked avatar ids**, growing over time via the same
milestone/kill/unlock triggers as the spellbook. The player picks one **active
avatar** from that set; the active id rides on `Character` so every other
client renders it. The picker is available **both at join and any time in-game**
from the same UI, and it only offers unlocked avatars. Unlocks are **per-account
meta-progression** (they outlive any single character), which matches the GDD's
account-sacrifice framing and the fact that new characters should keep what the
account earned.

---

## 3. Data model

### 3.1 Avatar catalog (content, data-defined)

Mirror the milestone pattern exactly — a JSON catalog embedded at build time,
resolved into typed values at boot. This is the DRY move: the unlock table is
authored the same way `milestone-unlocks.json` is (`skills/milestones.go`).

`api/avatars/avatars.json` (new content dir, embedded like items/mobs/skills):

```json
[
  { "id": 1, "name": "Wanderer",  "file": "wanderer.svg",  "unlock": "default" },
  { "id": 2, "name": "Emberkin",  "file": "emberkin.svg",  "unlock": "milestone", "level": 5 },
  { "id": 3, "name": "Tuskbane",  "file": "tuskbane.svg",  "unlock": "kill", "mob": "angryMammoth" }
]
```

- `id` — stable ushort, the only thing on the wire. Never reused.
- `file` — frontend SVG path (id→SVG map lives client-side; the server never
  needs the art).
- `unlock` — how the account earns it: `default` (always owned), `milestone`
  (reach `level`), `kill` (first kill of `mob`), later `aura` (discover a
  specific skill). Start with `default` + `milestone` only (YAGNI); add `kill`
  when the mob chapter has bespoke drops.

`id` 0 is reserved = "no avatar / fall back to the single legacy `player.svg`",
so old clients and un-migrated accounts render exactly as today.

### 3.2 Ownership (per-account)

The account record gains an **unlocked-avatar set** and an **active-avatar id**:

```
UnlockedAvatars  set<ushort>   // ids the account has earned; {} ⇒ defaults only
ActiveAvatar     ushort        // currently selected; 0 ⇒ legacy player.svg
```

Both persist with the account (roadmap item 3). Until accounts exist, a
**session-scoped** default (active = whatever the picker last chose, unlocked =
defaults + anything earned this session) is a valid v0 that needs no persistence
— the picker still works, it just forgets on disconnect. This lets the picker +
wire + rendering ship independently of the account service if step 8 sequences
them apart.

---

## 4. Wire changes (minimal)

Two additions, both append-only (positional field IDs stay stable — the
`Character` table already documents this discipline at `server.fbs:161`):

1. **`Character.avatar_id:ushort = 0`** — appended at the table end. Every
   client renders the owner's chosen avatar. `0` = legacy `player.svg`, so the
   field is backward-compatible by construction.

2. **Owner-only unlocked set** — parallel to how `spellbook:[ushort]` is "sent
   only to the owning player" (`server.fbs:242`). Add
   `unlocked_avatars:[ushort]` to the same owner-only stream so the client can
   populate the picker with exactly the earned set. No per-tick cost concern —
   like the spellbook, it only changes on an unlock.

**No new client→server message is needed if we reuse the existing input/cheat
path**, but a select-avatar action is cleaner: a small `SelectAvatar{avatar_id}`
client message (or an `ActionType`) that the server validates against
`UnlockedAvatars` before writing `ActiveAvatar`. Server-side validation is
non-negotiable — never trust a client-sent avatar id (reject ids not in the
owned set, exactly as a skill activation re-checks its precondition).

**Physics untouched.** `avatar_id` feeds only the SVG texture swap in
`Character.ts` (`Character.avatar` / `GraphicsConfig.character.file`). The
collision circle (`radius`) is independent. This satisfies `tdd.md:143`.

---

## 5. Unlock mechanism (reuse, don't reinvent)

The spellbook already proves the whole pattern; avatars are a second consumer of
it:

- **Milestone avatars** — a table just like `milestone-unlocks.json`, keyed by
  level → avatar id. When the player crosses the level, add the id to
  `UnlockedAvatars` (idempotent, survives death — mirror the milestone-retention
  invariant tested in `player_test.go`).
- **Kill / aura avatars** — hang off the same hooks the spellbook drop-unlocks
  already use (mob-death unlock, skill-discovery). One shared "grant unlock"
  seam, two payload kinds (skill vs avatar).
- **Feedback** — the client already diffs the spellbook stream to fire unlock
  glow (skill-system Phase 3.7/Q9). Diff `unlocked_avatars` the same way to fire
  an avatar-unlock popup. This folds directly into the **unlock & level-up popup
  queue** already scoped at `roadmap.md:477` — build it as one
  trigger→notification system, not two.

---

## 6. UI — one picker, two entry points

**Same component, two mounts:**

- **Join screen** — portrait grid; unlocked avatars selectable, locked ones
  shown greyed with their unlock hint ("Reach level 5", "Defeat the Mammoth") so
  the collection is legible as a goal. Default avatar preselected.
- **In-game** — the same grid reachable from a HUD/menu button. Selecting writes
  `ActiveAvatar` via the select-avatar action; the change is visible to everyone
  next tick (it just changes `avatar_id` on `Character`). No respawn, no combat
  consequence — it is purely cosmetic, so mid-fight switching is harmless and
  needn't be restricted.

Locked entries in-game double as the collection/achievement view — the
"cosmetic lane parallel to the spellbook" the roadmap asked for, with no
separate screen.

---

## 7. Build order (when step 8 arrives)

Sequenced so each chunk is independently shippable and in-game verifiable:

1. **Catalog + rendering** — `avatars.json` + client id→SVG map + `avatar_id`
   on `Character` + `Character.ts` texture swap. Prove with a cheat that sets
   `avatar_id`; confirm other clients see it. No picker, no unlocks yet.
2. **Picker (session-scoped)** — the grid component + select-avatar action +
   server-side ownership validation, backed by the session-scoped default from
   §3.2. Both mounts (join + in-game). Unlocked set = all `default` avatars for
   now.
3. **Unlock track** — milestone avatar table + grant seam + `unlocked_avatars`
   owner stream + locked/greyed entries + unlock popup (shared with the
   level-up popup queue).
4. **Persistence** — once the account service (item 3) lands, back
   `UnlockedAvatars` + `ActiveAvatar` with it instead of session scope. This is
   the only chunk that hard-depends on accounts; everything above ships without
   them.

---

## 8. Open questions (for the step-8 design session)

1. **Scope of ownership** — per-account (this note's assumption, matches
   meta-progression) vs per-character. Per-account is simpler and matches the
   vision; confirm before building persistence.
2. **`kill`/`aura` unlock kinds** — include from the start, or ship
   `default`+`milestone` and add the others with the mob chapter's bespoke
   drops? (YAGNI leans to the latter.)
3. **Select-avatar transport** — dedicated `SelectAvatar` client message vs a
   new `ActionType` on the existing input path. Lightweight either way; decide
   with whoever owns the protocol at step 8.
4. **Does avatar choice affect anything but the sprite?** Per `tdd.md:143` it
   must not touch the physics body. Confirm it also stays out of any
   gameplay-visible signal (no hitbox, no aura-range tell). This note assumes
   pure cosmetic.
5. **Art pipeline** — portrait (picker thumbnail) vs in-world SVG: one asset
   scaled, or two per avatar? Affects the `avatars.json` shape (`file` vs
   `file` + `portrait`). [PLACEHOLDER art either way.]

---

## 9. What this note deliberately does NOT do

- No production code — this is a design sketch for a not-yet-scheduled step.
- No new numbers treated as decisions (levels, avatar count all placeholder).
- No pull-forward of step 8; the picker still waits on the content pass and (for
  persistence) the account service.
