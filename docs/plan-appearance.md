# Appearance: the player chooses their token, and every actor wears a medallion

> **Status: DESIGNED 2026-10-17 (planning session, five PO prompt rounds, D1-D22),
> NOT approved, nothing built.** One plan for two things the PO ruled must be built
> together: the **entity medallions** (`plan-entity-medallions.md`, every actor as a
> token in a ring) and the player's **Appearance** (a chosen portrait and a chosen
> ring, a starter set plus unlocks, owned per character, bloodline or account).
> It **supersedes `plan-avatar-system.md`** (2026-07-14, written before accounts
> existed) and **takes over the chunks of `plan-entity-medallions.md`**. That doc
> stays the design reference for the token layers (§3), its decisions D1-D18 and
> the compositor (§7); this plan does not restate them, it cites them as **M-D1 ...
> M-D18** and **M-§n**.
>
> All numbers are [PLACEHOLDER]. Line refs surveyed 2026-10-17 at `ab6fbb23`.
>
> **Schema as designed:** DB **+1 migration** (one table, one column) · wire
> **+2 `Character` fields, +1 owner-block vector, +1 client message, +1 `Resource`
> field, +1 `Mob` field (M-§6.2)** · catalog **+1 endpoint, +1 `/mobs` field
> (M-§6.1)** · content **+1 directory (`api/appearance/`), +1 condition kind,
> +1 ascension-site reward entry kind** ·
> conf NONE.

---

## 1. Why one plan

The PO asked for a way to choose the art of the player token, at character
creation and in-game, and to work out how that meets the medallion plan. Two
existing docs each owned half:

- `plan-entity-medallions.md` designs the token: six `Token_*` layers, a frame bake,
  a live allegiance disc. Its C5 (customization) was blocked on the avatar plan,
  and its §9 says *do not design a parallel mechanism*.
- `plan-avatar-system.md` designs a picker and an unlock track, but predates
  accounts, bloodlines and the medallion. Its account-only ownership and its
  session-scoped v0 no longer fit.

The PO ruled (2026-10-17, prompt round 2-3): **build them together, the whole
medallion plan included** (mobs, NPCs, the allegiance disc, players). One plan
owns the sequence so the medallion resolver is written with the player as its
second caller from the start.

---

## 2. What exists (surveyed 2026-10-17)

### 2.1 The player token today

- One shared portrait and one shared border for every player:
  `Character.avatar` / `Character.border` are static containers
  (`frontend/src/features/game-objects/logic/Character.ts:36-41`), registered
  once at module load (`:375-379`) from `GraphicsConfig.character.{file, packIcon,
  borderFile}` (`client-data/Graphics.ts:27-42`). `initShape` (`:114`) builds a
  `token` container of portrait plus border (`:134-135`).
- **The player is already sized from its collider**: `size` derives from
  `PLAYER_COLLIDER_RADIUS_METERS` (`Graphics.ts:33`). M-D15's rule (the ring tracks
  the physical body) is therefore already true for players (see D17).
- A player corpse is a static gravestone (`Corpse.ts`, 28 lines, constructor
  `(id, x, y)`). On the wire it is a `Resource` (`server.fbs:339`, marshalled by
  `CorpseEntityFlatbufMarshal`, `codec/gamestate.go:979`) carrying no owner and no
  look. Only players leave corpses (`corpse.New` at `sys/state.go:1070` and
  `:1169`, both the player death path).

### 2.2 The avatar column exists and nothing reads it

- `game.characters.avatar TEXT NOT NULL -- content key`
  (`store/migrations/000001_accounts_and_characters.up.sql:103`). Creation writes
  the constant `DefaultAvatar` (`accounts/characters.go:147`;
  `cmd/aurad/accounts.go:24` sets `"default"`).
- It flows into `auth.Ticket.Avatar` (`accounts/characters.go:396`,
  `auth/ticket.go:45-66`) and **stops there**: `player.Player` has no avatar, the
  join uses only the name (`sys/state.go:929`), the wire has no field.
- The select screen draws a static `.characterPortrait.default` div; its comment
  (`CharacterSelect.ts:206`) already points at the avatar plan. Creation sends
  only `{name, slotIndex?}` (`AccountsApi.ts:337`).

### 2.3 Bloodlines

- **A bloodline is a slot**, `(account_id, slot_index)`; there is no bloodline id.
  Lives chain through `previous_character_id` (`000001...up.sql:117-124`).
- `game.bloodline_unlocks(account_id, slot_index, unlock_key, unlocked_at)`
  (`:87`), no FK to characters by design, written by `Store.AscendCharacter`
  (`store/ascension.go:196`) and read at `/select` by `LoadBloodline`
  (`store/ascension.go:46`) into the ticket. At join, `seedBloodlineUnlocks`
  (`sys/persist.go:450`) resolves **every key as a skill name** and drops unknown
  ones.
- No per-account unlock table exists. `character_flags` is per character
  key/value.
- Successor creation runs through `CharacterCreation` with the slot index, so a
  new life already passes the creation screen.

### 2.4 The unlock seams

| Source (D6) | Where it happens today | Seam for appearance |
| --- | --- | --- |
| Level milestone | `AddExperience` → `applyMilestoneUnlocks` (`model/player/player.go:1153`, `:1171`, `:1327`) | after the level changes |
| Quest | quest stages carry no rewards; rewards are dialogue grants (`applyGrant`, `sys/interaction.go:1270`) and the ledger advances there | after a quest stage changes |
| Ascension | `bloodline_ascensions` condition (`items/mobs/interaction.go:392`), count from `LoadBloodline` | at join (the count only changes across a life) |
| Ability level | `handleSpendSkillPoint` → `RaiseSkillLevel` (`sys/equip/equip.go:171`, `skills/component.go:816`); **no hook exists** | after a successful raise, `def` and the new level in scope |

The shared **condition vocabulary** (`minLevel`, `bloodline_ascensions`,
`quest_at_stage`, `kills_this_life`, `items/mobs/interaction.go:375-417`) already
gates dialogue rows and ascension rewards, and `lockReasons`
(`sys/ascension_rows.go:353`) already turns an unmet gate into typed lock reasons
that the **client words in its own language** (`plan-localization.md` C3).

### 2.5 Unlock feedback for spells

- Toast: `SendUnlock` (`model/client/client.go:182`) sends an `EntityMessage`
  `kind=Unlock` with a keyed message; `Backend.ts:324-336` shows
  `t('unlock.banner', {category, name})` in `AlertBanner`.
- Glow: `HUD.updateSpellbook` (`HUD.ts:798`) diffs the owner-only spellbook vector
  against `knownSpellbookIds` (first call is a silent baseline), pulses the
  spellbook button and the phone menu button, and `Spellbook.noteUnlocked` marks
  and glows the row (`Spellbook.ts:158`, `:325`).

### 2.6 HUD

Spellbook (`B`) and journal (`J`) buttons in `HUD.html` (`:61`, `:73-76`), the
phone sheet entries (`:290`, `:299`, `MobileMenu.ts`), hotkeys in
`Controls.ts`, panel exclusion in `PanelExclusivity.ts`.

---

## 3. Decisions

Rulings from the 2026-10-17 prompt rounds (PO), then the design choices this
plan proposes on top (marked *proposed*).

### 3.1 What the player chooses (rounds 1 and 3)

- **D1. Two separate picks: a portrait and a ring.** The portrait is
  `Token_Portrait`, the ring is `Token_BorderStyle` (M-§3). Additions,
  decoration, disc and rim are not choosable.
- **D2. Rings come from ONE shared pool with the mob ring families** (M-D10). A
  player may earn, say, the Wildlife wood ring. A ring item names a family; it
  draws no art of its own.
- **D3. Portraits are drawn by the internal artist** and committed to the repo
  like mob art (M-D18). Placeholders until they land. The PONETI pack is not a
  source (its atlases stay out of the public repo, clones would draw glyphs).
- **D4. The player's disc shows allegiance, the same rule as everyone** (M-D11):
  players read friendly.
- **D5. No rim on player tokens in v1.** A rule or an unlock may add one later
  (ascension count and level bands were offered and not taken).

### 3.2 What is on offer and who owns it (rounds 1 and 2)

- **D6. A free starter set plus unlocks.** Unlock sources in v1: a **quest**, an
  **ascension**, a **level milestone**, and **an ability reaching a level**. No
  mob-kill source.
- **D7. Each item declares its own ownership scope:** `character` (one life),
  `bloodline` (the slot's chain of lives), or `account`.
- **D8. Locked items appear greyed with a hint** on how to earn them.

### 3.3 Where it is chosen (rounds 1, 2 and 4)

- **D9. One picker, two mounts:** character creation and in-game. Both show the
  same items: the starter set plus everything owned.
- **D10. In-game, the picker opens from a new HUD button** with the
  player-facing name **"Appearance"** (German *Aussehen*).
- **D11. Changing is free and allowed any time**, combat included; it takes
  effect for everyone on the next snapshot.
- **D12. A new life in a bloodline picks again at creation**, preselected with
  the predecessor's portrait and ring wherever they are still owned.
- **D13. Earning an item gets the new-spell treatment:** a toast, a pulsing
  glow on the entry point, and the entry highlighted in the picker.

### 3.4 Corpses (round 3)

- **D14. A dead player's corpse keeps their portrait** with a death marker on it
  (a skull overlay, the portrait greyed, or both: art's call). This answers
  M-§5.7 for players. Mobs leave no corpses, so the ruling is complete.

### 3.5 Proposed by this plan

- **D15 (proposed). One unlock rule: an item declares its conditions, in the
  existing condition vocabulary, and its scope. When a character meets the
  conditions, the item is granted at that scope, permanently.** That covers every
  D6 source with shipped vocabulary:

  | Source | Condition |
  | --- | --- |
  | quest | `quest_at_stage {quest, stage: completed}` (or any stage) |
  | level milestone | `minLevel` |
  | ascension | `bloodline_ascensions` |
  | ability level | **NEW** `skill_level {skill, level}` |

  The one new kind joins the shared vocabulary, so dialogue rows and ascension
  rewards can use it too. The hint (D8) is nearly free: `lockReasons` already
  turns conditions into typed reasons the client words; the new kind costs one
  `LockReason` kind, one case in `lockReasons` and its en + de wording.
  What the rule leaves alone: an item granted **by a specific stone** (picked
  there, or added on top of the pick). The stone owns that, see D21.
- **D16 (proposed). Grants are permanent.** A respec that lowers a skill, or any
  later state change, revokes nothing. "Permanent" is bounded by scope: a
  character item ends with that life.
- **D17 (proposed). Player chunks are not gated on M-D15's sizing ruling**,
  because players already size from the collider (§2.1). Only mobs wait on C0's
  measurement table.
- **D18 (proposed; one table PO-ruled 2026-10-17). Storage is ONE new table, not
  `bloodline_unlocks`.** That table means "a skill gift from a sacrifice", one row
  per ascension, and its reader resolves every key as a skill. Reusing it needs a
  namespace plus a filter in two readers and blurs what a row means. Details §4.3.
- **D19 (proposed). The chosen portrait lives in the existing
  `characters.avatar` column; the ring gets a new `characters.ring` column.** The
  choice is per character even when the item is account-owned: two characters
  may wear different looks from the same owned pool.
- **D20 (proposed). The resolver gets the player as its second caller.** M-§7.1's
  `resolveMedallion(spec, faction, tier)` keys the ring on the faction family; for
  a player it keys on the chosen ring item's family, with no rim (D5) and the
  friendly disc (D4). C1 writes the resolver with that branch in view.

### 3.6 Answered at the end of the session (PO, 2026-10-17)

- **D21. Ascension unlocks come three ways.** (a) **By count**: an item's
  `bloodline_ascensions` condition (D15). (b) **A pick at the stone**: an
  appearance item offered as a row beside the skill rewards, taken *instead of* a
  skill. (c) **An additional reward of a specific stone**: granted on top of
  whatever was picked, whenever a character ascends at that stone. (b) and (c)
  belong to the **site**, following `plan-ascension-sites.md` (each stone owns
  its price and its rewards): the site's reward list gains appearance entries,
  each marked `pick` or `bonus` [PLACEHOLDER keys]. The grant is written in the
  same transaction as the sacrifice (`AscendCharacter`), at the item's declared
  scope (D7), so a failed ascension grants nothing. An appearance pick writes
  `appearance_unlocks` and never touches `bloodline_unlocks` (L2).
  ⚑ **An item in any site's reward list must be `bloodline` or `account`
  scope** (proposed): granted during the sacrifice, a `character` item would
  land on the life that is ending. The loader refuses it, in the cross-validation
  that already lives in `ascension/interactions.go`.
  ⚑ Picks are proposed to share the skill rows' index space (`grant_index`), and
  so the catalog's 254-entry wire cap (`ascension/catalog.go`, index 254 = the
  empty pick, 255 = no grant); bonuses are not rows and do not count.
  ⚑ **Count-based items (a) are granted in the same transaction too**
  (proposed): the new count is known there (sacrificed rows + 1). Otherwise the
  evaluator would only see the new count at the successor's first join, after
  creation, and the creation picker (D9) and its preselect (D12) would miss
  exactly the item the ascension just earned.
- **D22. Player origins (backlog §56) are deferred.** Not in this plan; the
  creation screen is laid out so an origin column can be added later without a
  redesign.

---

## 4. Data model

### 4.1 The catalog: `api/appearance/` (the tenth content directory)

One file per item [PLACEHOLDER shape]:

```json
{
  "id": "wanderer",
  "slot": "portrait",
  "scope": "account",
  "starter": true
}
```

```json
{
  "id": "ring-wildwood",
  "slot": "ring",
  "family": "wildlife",
  "scope": "bloodline",
  "conditions": [{ "kind": "skill_level", "skill": "Thorns", "level": 10 }],
  "conditionsMode": "all"
}
```

- `id` is a slug (the loader refuses others, the quest-id rule), never renamed,
  never deleted (the skill-file rule, `manual-content-authoring.md` §2: retire by
  removing it from offers, since a stored choice or grant may name it).
- `slot`: `portrait` | `ring`. `family` only on rings, and must name a family in
  the client's family registry (pinned, §8).
- `starter: true` items are owned by everyone and carry no conditions; `scope`
  is then irrelevant and may be omitted.
- Names live in `api/lang/{en,de}/appearance.arb`, never inline (D27 of
  `plan-localization.md`), German in the same change.
- ⚑ `contentSources` (`cmd/aurad/loaders.go`) must list the directory or an edit
  silently no-ops; `cp-defs` copies it for the embedded build.
- Art stays client-side: a `Graphics.ts` (or sibling) map from portrait id to
  file, rings resolved through the family registry. Assets in
  `assets/characters/portraits/` [PLACEHOLDER path].

### 4.2 The catalog on the client

`GET /appearance`, fetched like `/mobs`, projects per item: id, slot, family,
scope, starter, and the conditions as **lock-reason data** (the same typed shape
`lockReasons` produces), so the picker can word the hint without the server
pre-rendering text. The wire indexes items by their position in this catalog
(sorted by id, stable for one server build).

### 4.3 Ownership (one migration pair, `000004_appearance`)

One table [PLACEHOLDER names]:

```sql
CREATE TABLE game.appearance_unlocks (
    account_id    BIGINT NOT NULL REFERENCES game.accounts(id),
    scope         TEXT   NOT NULL CHECK (scope IN ('character', 'bloodline', 'account')),
    slot_index    INT,     -- set for 'bloodline' only
    character_id  BIGINT REFERENCES game.characters(id),  -- set for 'character' only
    item_key      TEXT   NOT NULL,
    unlocked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (...)   -- exactly the owner column(s) the scope needs
);
-- three partial unique indexes, one per scope, so a grant is idempotent
```

- Standing rules (`manual-db-migrations.md` §3): `game.` namespace, no
  `ON DELETE CASCADE`, no secrets, no JSONB.
- One table, not three (PO 2026-10-17, D18).
- **Bloodline items follow the slot**, exactly as `bloodline_unlocks` does: a
  plain delete of a character does not reset them (no FK, by design).
- Starter items are never stored.

The choice: `characters.avatar` holds the portrait id (D19). The default
starter portrait's id **is** `default`, so existing rows are already valid and
need no backfill. The same migration
adds `characters.ring TEXT NOT NULL DEFAULT '<default ring id>'`. Shipped
migrations are frozen, so no rename of `avatar`.

### 4.4 Evaluation

One server function, `appearance.Grant(p)` [PLACEHOLDER name]: for every
not-yet-owned item, test its conditions against the player; grant each one that
passes at its scope (persist, add to the owned set, send the toast). Four
callers, all surveyed (§2.4): **join** (catch-up, which also covers items added
to content later and the ascension count), **after a level-up**, **after a quest
stage change**, **after a successful skill raise**. The catalog is small, so a
full pass per call is fine; no index per condition kind (YAGNI).

Owned set at join = starter ∪ account rows ∪ this slot's bloodline rows ∪ this
character's rows. It rides the ticket like `BloodlineUnlocks` does.

---

## 5. Wire and API

| Surface | Change | Notes |
| --- | --- | --- |
| `table Character` | **+2 appended** `portrait:ushort`, `ring:ushort` | catalog indices; 0 = default. Every client draws every player's look. |
| `GameState` owner block | **+1** `appearance_owned:[ushort]`, change-only under `owner_state` | the client diffs it for the glow, as `updateSpellbook` diffs the spellbook (first call = silent baseline) |
| `ClientMessageBody` | **+1** `SelectAppearance{portrait, ring} = 13` | server validates both against the owned set, refuses silently otherwise, writes the character row |
| `table Resource` | **+1 appended** `portrait:ushort` | set on player corpses only (D14); 0 = gravestone. Props never set it, so FlatBuffers writes nothing for them (a default-valued scalar costs no bytes) |
| `table Mob` | **+1 appended** stance `ubyte` | M-§6.2, unchanged |
| `EntityMessage` | new key `KeyUnlockAppearance` (`lang/message.go`) | `unlock.banner` gains an `appearance` category; en + de; `message_test.go` pins it |
| `GET /appearance` | new endpoint | §4.2 |
| `GET /mobs` | **+1** faction field | M-§6.1, unchanged |
| accounts `/characters` | list gains: account-owned items, per slot the bloodline-owned items and the predecessor's portrait + ring; each card's own portrait + ring | creation needs the owned pool before a character exists (D9, D12) |
| accounts `POST /characters` | gains `portrait`, `ring` | validated against starter ∪ account ∪ that slot's bloodline |

⚑ **The catalog race** (M-§5.5) applies to `portrait` and `ring`: a character
resolved before `/appearance` lands must be re-resolved when it does, or it
keeps the default forever (the setters early-return on unchanged values).

---

## 6. Schema impact

| Layer | Impact |
| --- | --- |
| **Database** | **+1 migration pair** `000004_appearance`: the `appearance_unlocks` table and `characters.ring`. `characters.avatar` gets its first reader. |
| **FlatBuffers** | `Character` +2, owner block +1, `ClientMessageBody` +1, `Resource` +1, `Mob` +1 (all appended) |
| **HTTP catalog** | `GET /appearance` new; `/mobs` +1 field |
| **Accounts API** | `/characters` list and create gain fields (§5) |
| **Content** | `api/appearance/` new directory; condition kind `skill_level`; appearance entries in ascension-site reward lists (D21); `api/lang/{en,de}/appearance.arb` |
| **conf.json** | NONE |

---

## 7. Chunks (provisional)

Medallion C0-C2 keep their content from M-§10; C3 onward replace M-C3 and M-C5
and absorb `plan-avatar-system.md` §7. One session each.

- **C0, medallion contract, plumbing, sizing table** (M-C0 as written): the
  artist's pilot frame set, the named sub-container refactor (M-§5.2), the D15
  measurement table, one prototype species in the full stack. ⚑ **The refactor is
  the prerequisite for touching the player token at all.** *Blocked on the
  artist's pilot.* *Schema: none.*
- **C1, the frame stack for mobs and NPCs** (M-C1): spec + resolver written with
  the player branch in view (D20), frame bake, catalog faction + family map with
  its completeness pin, tier rim, the D14 predicate, the ruled sizing. Real-phone
  exit. *Schema: `/mobs` +1 field.*
- **C2, allegiance slice + live disc** (M-C2): the stance field. Independent of
  C3-C6, may run in parallel. *Schema: `Mob` +1.*
- **C3, the player wears a chosen medallion.** `Character` onto the resolver
  (friendly disc, no rim); `api/appearance/` + loader + `/appearance`;
  `Character.portrait`/`ring` on the wire; the migration (`characters.ring`
  plus the unlock table, so C5 adds no second migration); the creation picker
  with the **starter set only**; select cards show the chosen portrait; a cheat to
  set any item. Runs on placeholder portraits and the pilot family ring. *Needs
  C0 + C1's resolver. Schema: the migration, `Character` +2, `/appearance`,
  accounts create.*
- **C4, the in-game picker.** The "Appearance" HUD button, hotkey
  [PLACEHOLDER, checked against B/J/M/E], phone-sheet entry, `PanelExclusivity`
  registration (HUD chrome stays `plan-ui-pass.md`'s style: cite it, do not
  restyle); `SelectAppearance`; the choice persists. Still starter set only.
  *Schema: `ClientMessageBody` +1.*
- **C5, ownership and unlocks.** The `skill_level` condition; the evaluator and
  its four callers; scope writes (⚑ the account-scope write path is new, §9);
  `appearance_owned` on the wire; locked entries greyed with their hint; toast +
  glow + highlight (D13); the creation payload for successors with the D12
  preselect; count-based ascension items (D21a) through the evaluator, plus
  their grant inside `AscendCharacter` (D21).
  *Schema: owner block +1, accounts list fields, `KeyUnlockAppearance`.*
- **C5b, stone rewards** (D21b, D21c). Appearance entries in a site's reward
  list, `pick` rows beside the skill rows and `bonus` grants on top, written in
  the `AscendCharacter` transaction; the stone's rows render the item. May fold
  into C5 if C5 runs small. *Schema: ascension content format +1 entry kind; no
  new migration.*
- **C6, player corpses and summons.** The corpse carries the portrait with the
  death marker (D14); summons onto the medallion (M-C4). If Q4's marker is a
  broken ring, the corpse carries the player's ring too (one more `Resource`
  field) or wears a fixed death ring; decided with Q4. *Schema: `Resource` +1
  (or +2).*

What waits on art, and what does not: all data plumbing (C3-C5) runs on
placeholders. The frame bake (C1), the family rings, the real portraits and the
death marker are art; each chunk's PO look judges the mechanism if the art has
not landed.

---

## 8. Test strategy

- **Go, red first:** the catalog loader (slug ids, `slot`/`family` rules,
  unknown condition kinds refused, `starter` items carry no conditions); the
  `skill_level` condition parse and evaluate; the evaluator per scope (grant once,
  idempotent, never revoked by a respec); `SelectAppearance` refuses an unowned
  item; creation refuses an unowned pick; the successor sees the bloodline items
  and the predecessor's look.
- **Store tests** (`AURA_TEST_DB_URL`): the migration round trip; the three
  scopes' uniqueness; a plain delete keeps bloodline rows.
- **Completeness pins (vitest):** every catalog portrait id resolves to an
  asset; every ring item's `family` is in the family registry; plus the
  medallion pins of M-§11. Unknown ids fall back loudly, never invisibly.
- **The catalog race** (§5): a character resolved before `/appearance` lands is
  re-resolved.
- **Lang:** `TestLang` and `catalogs.test.ts` cover the new keys in en + de.
- **Playwright** (`verify` skill), two clients: create with a picked portrait,
  the other client sees it; change in-game, the other client sees the change;
  meet a condition (cheat), the toast fires and the entry glows; die, the corpse
  shows the portrait.
- **A real-phone fill-rate check** stays C1's exit (M-§5.4).

---

## 9. Landmines

- **L1. The account-scope write is a new path.** Everything the persist system
  flushes today is per character. An account grant is written from the game
  loop for a row no character owns; budget it in C5.
- **L2. `seedBloodlineUnlocks` treats every `bloodline_unlocks` key as a skill**
  and drops the rest. Appearance never writes there (D18); keep it that way.
- **L3. The catalog race** (M-§5.5, §5): two new catalog-sourced selectors.
- **L4. Silent content no-ops:** `contentSources` must list `api/appearance/`; a
  content edit does not invalidate the Go test cache (`-count=1`); without
  `-content ../api` the embedded copy is read.
- **L5. Fill rate** (M-§5.4) now on every player as well: the player token pays
  the same ~3 quads as a normal mob.
- **L6. HUD chrome belongs to `plan-ui-pass.md`**, whose next chunk is C9
  (mobile). The new button must fit both the desktop column and the phone sheet.

---

## 10. Open PO calls

Answered 2026-10-17: Q1 ascension sources → **D21** · Q2 origins → **D22**
(deferred) · Q3 storage → **one table** (D18).

4. **Q4. The death marker's look** (skull overlay, greyed portrait, broken ring):
   art's call at C6, recorded so it is not forgotten.
5. **Q5. Starter set size**: how many portraits and rings are free.
   [PLACEHOLDER]
6. **Q6. Hints for account items:** if another character on the account is
   closer to earning an item, does the hint say so? Proposal: no, the hint words
   the conditions only.
7. Carried from the medallion plan, unchanged: **M-§12** items 1-3 and 5-8
   (D15 sizing, family membership, stance colours, the boss mark, animation,
   minimap, prey stance). Item 4 (corpses) is answered by D14.

---

## 11. Relationship to other docs

- **`plan-entity-medallions.md`**: design reference for the token (layers,
  decisions M-D1-M-D18, compositor, asset contract via
  `art/medallion-asset-spec.md`). Its chunk list and M-§9 are replaced by §7
  here.
- **`plan-avatar-system.md`**: superseded. What carries over: one picker with two
  mounts, server-side validation of a chosen id, the diff-the-owner-stream glow,
  "cosmetic never touches the physics body" (`tdd.md:143`). What does not:
  account-only ownership, the session-scoped v0, the integer ids in a single
  `avatars.json`, the mob-kill source.
- **`plan-entity-presentation.md`**: its PO-ruled order (medallions first)
  stands; read "medallions" as this plan's C0-C2.
- **`plan-ui-pass.md`**: owns the HUD's visual language (L6).
- **Backlog §56** (origins): deferred (D22).
- **`plan-ascension-sites.md`** (archived): D21's stone rewards extend its
  per-site reward lists.
