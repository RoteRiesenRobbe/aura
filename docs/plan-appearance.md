# Appearance: the player chooses their token, and every actor wears a medallion

> **Status: APPROVED 2026-10-17 (planning session, five PO prompt rounds, D1-D22;
> refined the same day, D23-D30, §3.7). C0a SHIPPED 2026-10-17, C1 DONE 2026-10-17 (§12;
> PO look passed, the real-phone check waived to the next deploy). C1b DONE 2026-10-18 (D31-D34,
> PO look passed). C2 DONE 2026-10-19 (D35-D36), C2b DONE 2026-10-19 (D37-D38, one `Medallion`
component for every token). C3 DONE 2026-10-20 (D39, the chosen player medallion). C4 DONE 2026-10-21
(the in-game picker; PO look passed 2026-10-22). C5 DONE 2026-10-21 (ownership and unlocks, server + wire; split
by the PO into C5 + C5c; PO look passed 2026-10-22). C5c DONE 2026-10-23 (the unlock client; PO look
passed the same day). C5b DONE 2026-10-23 (the stone bonus only, D21c; the pick moved to
`plan-ascension-ceremony.md` AC2; PO look passed the same day). Next: C6.** Order (D24): C0a → C1 → C1b → C2 → C2b → C3 → C4 → C5 → C5c (+C5b) → C6, C0b whenever the artist's pilot lands;
> `plan-entity-presentation.md`'s design session follows C6. One plan for two things the PO ruled must be built
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

### 3.5 Proposed by this plan (approved with the plan, 2026-10-17)

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

- ⚑ **AMENDED 2026-10-22 by `plan-ascension-ceremony.md` (R2, R6-R8):** (b) is now a
  look step IN ADDITION to the skill gift, one slot per step, always skippable, nothing
  preselected for the heir; it is built there (AC2). (c) stays here, in C5b.
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

### 3.7 Refinement (PO, 2026-10-17, three prompt rounds)

- **D23. Specific NPCs may wear their own ring** (M-D7, which the first chunk
  list had dropped). One client-side key per species, `medallion.ring`
  [PLACEHOLDER name] beside M-D13's `additions`/`decoration` keys in
  `Graphics.ts`, names a ring family that replaces the faction family. A unique
  NPC ring is a family of one member, so it goes through the same family
  registry and the same completeness pin. Visual-only: disc, rim and portrait
  follow the normal rules. Named NPCs are already one species file each
  (`eliza`, `lionett`, `governor`, ...), so no per-instance key is needed.
  Built in C1. *Schema: none.*
- **D24. C0 splits, and work starts now.** C0a (the named sub-container
  refactor + the M-D15 measurement table) needs no art. C1 onward run on
  placeholder rings; the pilot's real art swaps in when it lands, and C0b (the
  pilot in the full stack, the circle numbers recorded in the asset spec) slots
  in then. Each chunk's PO look judges the mechanism, not the art.
- **D25. Locked items show their conditions AND this character's progress**
  (answers Q6; extends D8). Numeric kinds show a count: `minLevel` "level 6/10",
  `skill_level` "Thorns 6/10", `bloodline_ascensions` "1/3"; `quest_at_stage`
  words the condition only. Progress is this character's own, also on an
  account item (no account-wide lookup). The client computes it from state it
  already holds for the owner where it can (level, spellbook levels); C5
  surveys the rest (the ascension count, the quest ledger) and adds a value to
  the lock-reason data only where the client lacks one.
- **D26. Medallions are world-only.** The minimap keeps its flat dots (M-§12.7).
- **D27. No extra boss mark.** Normal bare, Elite mid rim, Boss full rim
  (M-D3, M-§12.5), until play says bosses do not read.
- **D28. Stance mirrors the live aggro relationship** (M-§12.8): prey reads
  neutral until it retaliates, hostile while it fights, neutral again when it
  calms.
- **D29. Stance colours: hostile red, neutral yellow, friendly blue**
  [PLACEHOLDER shades] (M-§12.3; yellow avoids green-means-easy on the
  nameplate). The colour-blindness check stays C2's exit.
- **D30. The starter set is 4 portraits and 2 rings** [PLACEHOLDER; the PO picked **8
  portraits** at C3, 2026-10-20, see D39], all
  placeholder art until the artist's portraits land. The two starter rings name
  two families (D2).
- **D31. Mob and NPC portraits come from the PONETI pack** (PO 2026-10-18,
  amends D3 and M-D18 for mobs and NPCs; player portraits stay C3's call).
  Every species that wears a medallion carries a `packIcon` naming a
  `Characters_nobg` bust (transparent background), so every live and local
  build draws a set PONETI portrait. The committed `file` is only the fallback
  for clones without the pack (the repo is public, `THIRD_PARTY.md`): any art
  that works, no quality bar. Found in the C2 survey: every committed portrait
  bakes an opaque backdrop (15 artist PNGs 100 % opaque inside the ring, 23
  SVGs with a background `<circle>`), so a disc behind them could never show.
  Where the pack has no true match (stag, sheep, mushrooms, ...), the closest
  stand-in, PO-approved from contact sheets.
- **D33. Portraits are per species, and kin share a bust** (PO 2026-10-18):
  the 21 species drawing the `NpcPlaceholder` marker get their own PONETI
  portrait too, through a client-side override keyed by the species id
  (resolved in `setMobId` like the ring; no wire change). Species that read as
  kin in game share one bust and differ by colour or a feature ("a wolf and a
  grey wolf might be the same portrait but with a different colour"). Recolour
  [proposed]: a multiply `portraitTint` first (free), a hue shift baked once
  per species into a shared texture where a tint cannot reach the colour; never
  a live per-sprite filter (fill rate, L5).
- **D34. A higher rank in a kin line looks more menacing** (PO 2026-10-18):
  each species keeps its own portrait (wolf, elite-wolf, dire-wolf and
  alpha-wolf are four species); within a line the stronger one gets a
  separate, more menacing bust where the pack has one (wolf calm grey →
  elite golden → dire snarling → alpha the black shadow wolf), and a recolour
  (D33) only where it has none. Tints were previewed: red reads "burning",
  black drowns the detail, so they stay the fallback. Harvestables may use
  any pack icon, not only character busts (they are objects: fly agaric,
  mana mushroom, onion for the turnip, sea kale).
- **D39. Player portraits are PONETI busts too** (PO 2026-10-20, C3; amends D3 for
  players as D31 did for mobs). Eight `Characters_nobg` human busts, picked from a
  contact sheet of the ones no NPC wears: Human_01 1 (`default`), 02 1, 05 1, 07 2,
  14 2, 47, 49, 53. Clones without the pack draw `player.png`. The artist's player
  portraits replace them later. The starter rings are the grey (default) and the
  leather family (PO pick).
- **D32. A calmed mob reads neutral** (PO 2026-10-18): yellow for the calm's
  duration, its normal stance when it wears off.
- **D35. "Fighting the player side" means target OR threat** (PO 2026-10-18,
  C2): a mob that does not hunt players on sight reads hostile while its aggro
  target is player-side or any player-side entity is on its threat table, so a
  prey fleeing its attacker and a pacifist being beaten read hostile too. It
  reads neutral again when its aggro resets (leash home, calm).
- **D36. Harvestables get a passive `flora` faction** (PO 2026-10-18, C2):
  they named no faction and so fell back to the hostile default, which would
  have painted them red. `api/factions/flora.json` (hostileTo [], nobody
  hunts it) on turnip, beet, both mushrooms, deadwood, seaweed and bramble;
  Rockfall (a rock, no medallion) stays faction-less. Chosen over a code rule
  ("no skills reads neutral").
- **D37. One medallion system for every token** (PO 2026-10-19, at the C2
  look: "one unique system for how the tokens / medallions are composed, used
  for everything. Art can differ but the process and logic needs to be the
  same for all"). An actor is either a medallion or a plain world object
  (sprite only, no frame); there is no third, bordered kind. The audit found
  three composition paths: the medallion path inside `Mob`, the old
  `withBorder`/`borderFile` path (Companion, SoldierCompanion,
  ShieldbearerCompanion, ArmySoldier, Bramble, Campfire, Camp) and the
  player's own `Character.border`. C2b folds them into one component.
- **D38. Campfire and Camp are plain objects** (PO 2026-10-19): sprite only,
  like the totems and signposts (C1's "objects keep their own models").
- **Cut: "avatar state reactions"** (damaged / happy / dead, `roadmap.md`
  step 8b). The hit flash already ships, dead is D14; nothing else is planned.

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
| `ClientMessageBody` | **+1** `SelectAppearance{portrait, ring} = 13` | server validates both against the owned set, refuses silently otherwise, writes the character row. ⚑ Shipped at C4 against the STARTER set (`Catalog.WearableLook`); C5 swaps the owned set into it AND into `CheckStarterLook` (accounts create, by id) |
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

**Order (D24): C0a → C1 → C1b → C2 → C2b → C3 → C4 → C5 (+C5b) → C6; C0b
whenever the pilot lands.**

- **C0a, plumbing and the sizing table** (M-C0 minus the art): the named
  sub-container refactor (M-§5.2) and the M-D15 measurement table (visual roll
  vs `body.radius` per species) for the PO's sizing ruling. ⚑ **The refactor is
  the prerequisite for touching the player token at all.** *No art needed.*
  *Schema: none.*
- **C0b, the pilot** (whenever it lands): the artist's pilot frame set in the
  full stack on one species, circle numbers measured and recorded in
  `art/medallion-asset-spec.md` §3 (M-D17), placeholder rings swapped for real
  ones. *Schema: none.*
- **C1, the frame stack for mobs and NPCs** (M-C1): spec + resolver written with
  the player branch in view (D20), frame bake, catalog faction + family map with
  its completeness pin, tier rim (no extra boss mark, D27), the M-D14 predicate,
  the per-species NPC ring override (D23), the ruled sizing. Runs on placeholder
  rings (D24). Real-phone exit. *Schema: `/mobs` +1 field.*
- **C1b, PONETI portraits + a plain disc** (D31; inserted 2026-10-18, runs
  before C2): every medallion species gets a `_nobg` `packIcon` (the 19
  existing ones move to their `_nobg` twins; the rest picked from contact
  sheets, PO-approved); manifest lines + repack; a vitest pin that every
  medallion species carries a manifest-listed `packIcon`; one shared greyscale
  disc sprite in the `token` slot below `actualShape`, sized to the ring's
  window, one fixed neutral shade (it fills the `_nobg` busts' see-through
  shoulders, the reason September chose `WithBackground`); the 23 SVG
  fallbacks lose their background circle, the 15 artist PNGs stay as they are;
  `THIRD_PARTY.md` notes the portraits; the atlas weight measured.
  *Schema: none.*
- **C2, stance drives the disc** (M-C2): `Mob.Stance()` (friendly: aligned
  faction or `FriendlyToPlayers`; hostile: the aggro set holds the player side,
  or the aggro target is player-side; neutral otherwise; calmed reads neutral,
  D32), the `stance:ubyte` appended to `table Mob` (0 = hostile), the tier
  path's codec and `WireSetters` route, the C1b disc tinted red / yellow /
  blue (D29) with a colour-blindness check. Independent of C3-C6.
  *Schema: `Mob` +1.*
- **C2b, one medallion component** (D37, D38; inserted 2026-10-19): the
  disc, portrait, ring and their tier and stance tints move out of `Mob` into
  one component that `Mob` and `Character` both build into the token slots;
  the four companions, ArmySoldier and Bramble wear it (transparent `_nobg`
  busts, the collider size, no roll; the medic's bust picked from a contact
  sheet), and so does the player (friendly disc set locally per D4, a default
  ring family until C3's choice); Campfire and Camp become plain objects;
  `withBorder`, `registerBorder`, `borderFile` and `Character.border` are
  deleted, and a vitest pin refuses any `borderFile` coming back. Pulls C6's
  "summons onto the medallion" forward. *Schema: none (pack manifest only).*
- **C3, the player wears a chosen medallion.** `Character` onto the resolver
  (friendly disc, no rim); `api/appearance/` + loader + `/appearance`;
  `Character.portrait`/`ring` on the wire; the migration (`characters.ring`
  plus the unlock table, so C5 adds no second migration); the creation picker
  with the **starter set only** (4 portraits, 2 rings, D30); select cards show the chosen portrait; a cheat to
  set any item. Runs on placeholder portraits and the pilot family ring. *Needs
  C0a + C1's resolver. Schema: the migration, `Character` +2, `/appearance`,
  accounts create.*
- **C4, the in-game picker.** The "Appearance" HUD button, hotkey
  **C** (PO 2026-10-21; free beside WASD/arrows, 1-3, Q R F, E, J, M, B, P, `, Enter,
  Esc, all bound in `Controls.ts`/`HUD.ts`), phone-sheet entry, `PanelExclusivity`
  registration (HUD chrome stays `plan-ui-pass.md`'s style: cite it, do not
  restyle); `SelectAppearance`; the choice persists. Still starter set only.
  *Schema: `ClientMessageBody` +1.*
- **C5, ownership and unlocks.** The `skill_level` condition; the evaluator and
  its four callers; scope writes (⚑ the account-scope write path is new, §9);
  `appearance_owned` on the wire; locked entries greyed with their hint and this
  character's progress (D25); toast +
  glow + highlight (D13); the creation payload for successors with the D12
  preselect; count-based ascension items (D21a) through the evaluator, plus
  their grant inside `AscendCharacter` (D21).
  *Schema: owner block +1, accounts list fields, `KeyUnlockAppearance`.*
- **C5c, the unlock client** (split from C5 by the PO 2026-10-21): locked entries
  greyed with their hint and this character's progress (D8, D25; `/appearance` already
  serves each item's `locks`, `scope`, `conditionsMode`); the glow on the Appearance
  buttons and the entry highlighted (D13; the client diffs `appearance_owned`, first
  send = silent baseline); creation offers the account's and the slot's items and
  preselects the predecessor's look where still owned (D12; the accounts list already
  carries `appearanceOwned`, per slot `appearanceOwned`, `predecessorPortrait`,
  `predecessorRing`); `chunk2-accounts` gains the preselect leg. ⚑ D25 survey: in game
  the client holds the level and the spellbook levels, NOT the slot's ascension count
  (only the `/characters` slot card has it): cache it client-side or add a value.
  ⭐ **Ruled at the C5c start (PO, 2026-10-23, prompt rounds):** (1) the hint is a
  **tooltip only** (hover; phones get no hint, amending D8 for the phone), and it is
  **the game's tooltip, the skills' one** (`SkillTooltip.showTooltip`: name, slot,
  "Locked: …"), never the browser's `title` (PO at the C5c look; both mounts, so
  creation's tiles lost their `title` too); (2) creation
  offers **wearable items only** (starters + account + that slot's bloodline items),
  locked items show only in the in-game panel (amending D9's "same items" for creation);
  (3) **the server sends the progress**: the owner block carries, per locked item the
  character does not own, its lock reasons with `have` (the `lockReasons` path the
  dialogue rows use), so every condition kind, now and later, gets its progress without
  client code. (Before the first owner block a locked tile's tooltip is its name; the
  catalog's static `locks` are not worded, which would need progress-less lang keys for
  a state that lasts one tick.)
  *Schema: wire `GameState` +1 vector, +1 table; DB none.*
- **C5b, stone rewards** (D21b, D21c). ⚑ 2026-10-22: the `pick` half moved to
  `plan-ascension-ceremony.md` AC2; C5b keeps only the `bonus` (D21c). Appearance entries in a site's reward
  list, `pick` rows beside the skill rows and `bonus` grants on top, written in
  the `AscendCharacter` transaction; the stone's rows render the item. May fold
  into C5 if C5 runs small. *Schema: ascension content format +1 entry kind; no
  new migration.*
  ⭐ **Ruled at the C5b start (PO, 2026-10-23, prompt round):** (1) a look only a stone
  gives is marked by an **explicit field**, `"grantedBy": "stone"` [PLACEHOLDER key], with
  a `bloodline` or `account` scope and no conditions (the loader refuses conditions beside
  it, a starter, and a `character` scope); the evaluator never grants it on its own, and
  AC2's look steps reuse the same marker; (2) until owned, the in-game panel shows it
  **greyed with a generic hint**, "Locked: a gift of an ascension stone", the server
  sending a new lock kind (+1 `ConversationLockKind`, en + de); (3) placeholder content:
  the **main stone** (`ascension-stone`) gives a **new portrait** (a spare PONETI bust,
  C5's villager route), **bloodline** scope. The stone authors the list on its `catalog`
  node beside `rewards` (where its price lives), `bonusLooks: [ids]` [PLACEHOLDER key];
  it is granted on every ascension there, the empty pick included; no toast (the heir's
  first owned set is a silent baseline, creation offers it).
- **C6, player corpses and summons.** The corpse carries the portrait with the
  death marker (D14). (Summons onto the medallion moved to C2b.) If Q4's marker is a
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
- **A real-phone fill-rate check** stays C1's exit (M-§5.4); waived by the PO
  2026-10-18 to the next deploy's phone pass.

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
- **L7. Every rebuild of the player struct must carry the look** (found at C4).
  `state.go` builds a player in four places (join, respawn, F5 reconnect,
  revive); C3 set the look only at the join, so a death or a reload drew the
  defaults, and once the look is saved that default would be written over the
  choice. `deadState` and `reconnectStash` carry it now, pinned by four tests in
  `state_appearance_test.go`. Anything C5 or C6 adds to the player (owned set,
  corpse portrait) has the same four doors. ⚑ C5 found the same gap in the
  ticket's bloodline and account (`lineage`, now carried too).
- **L8. The evaluator watches three revisions** (level, `SkillComponent`, the
  quest ledger's SAVE revision), found at C5. A condition whose input moves none
  of them (a kill count: the ledger's `Revision` ignores objective progress)
  would wait for an unrelated change, so the appearance loader refuses
  `kills_this_life`. A new condition kind must move a watched revision or join
  the watch.

---

## 10. Open PO calls

Answered 2026-10-17: Q1 ascension sources → **D21** · Q2 origins → **D22**
(deferred) · Q3 storage → **one table** (D18) · Q5 starter set → **D30** ·
Q6 hints → **D25** (conditions + this character's progress) · M-§12 item 3
stance colours → **D29** · item 4 corpses → **D14** · item 5 boss mark →
**D27** · item 7 minimap → **D26** · item 8 prey stance → **D28**.

Still open, each with a ruled owner and moment:

1. **Q4. The death marker's look** (skull overlay, greyed portrait, broken ring):
   art's call at C6.
2. ~~**M-§12.1, M-D15 sizing**~~: **RULED 2026-10-17** (PO): the ring is drawn at the
   collider (2 × `body.radius`, the wire radius) and the per-instance size roll is gone
   for every medallion species. Recorded in C1's ledger (§12).
3. **M-§12.2, family membership and count**: the art budget call at C0b.
4. **M-§12.6, animation**: static ships; out of scope until asked for.

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

---

## 12. Chunk ledgers

### C0a - SHIPPED 2026-10-17 `b9cf2d5e`

The named sub-container refactor (M-§5.2) and the M-D15 measurement table
(M-§5.3). No art, nothing on screen changed.

- **Slots:** `createTokenSlots` (`TokenSlots.ts`) builds every token entity's
  `shape` as `belowArt` (aura ring stack, then the campfire's dwell ring) ·
  `token` (M-§5.2's `art`; the shipped name stays: `actualShape`, then a `frame`
  slot with tier frame and border) · `aboveArt` (Mob: health bar, interact
  badge; Character: ascension channel effect). Mob and Character both use it;
  `withBorder` finds `frame` by label. Every `addChildAt(i)` is gone. The burst
  ring still appends to `shape` above all three (base class, every entity kind).
- **Room left, nothing built:** the tier rim (M-D16) and the stance disc go into
  `token` BELOW `actualShape`; the medallion stays outside `actualShape`, which
  the damage flash scales (M-§5.1).
- **Mob aura rings are made in the constructor** now, not on first use. Every
  mob already got one on its first snapshot (`setAuraCategories` runs every
  tick), so this is no change on screen; it is what lets the dwell ring append
  after it without an index.
- **The table:** `plan-entity-medallions.md` Appendix A, 102 eligible species
  (rolled / wire-radius / player / excluded). Rolled combat mobs draw 1.00-1.50×
  their collider (most 1.0-1.25); only Deadwood (0.72-0.89) and the low ends of
  AlphaBoar, Boar, Bear, Troll draw smaller. NPCs, placeholders and the player
  are 1.00 by construction. "Summon" = a species a skill's `spawnMob` names (a
  reading, not a code flag). Observations only; D15 is the PO's.
- ⚑ **M-§2.4's container rows are stale** (written 2026-08-20, before the
  natural-weapons token); the slot list in `TokenSlots.ts` is the current truth.
- ⚑ **`r4-badge.mjs` was red at HEAD**, unrelated: it warped to the Hermit's
  pre-rebuild spot (-55, 25). Moved to (-121, -29), and its geometry probe now
  steps out of `aboveArt` to the shape group (harness rule 8).

**Schema:** DB none · wire none · conf none · content none.

**Verified:** typecheck clean · vitest 1773/0 (+1 `TokenSlots.test.ts`, the slot
order) · backend build green (no Go change) · before/after on fresh builds, five
venues (starting campfire: ring + dwell + border; Hermit: border + badge;
Elite Wolf with its aggro ring; Alpha Boar: tier frame; the tunnel campfire and
dire wolves under darkness; the player in every shot): every drawn leaf in
order, kind, visibility, alpha, blend and texture identical on 27/29 matched
shapes, the other 2 differing only in zero-size empty Graphics whose reported
origin follows the camera by 1 px; fixed-size bounds identical; screenshots
match by eye; 0 page errors both runs · `r4-badge.mjs vanilla` 7/7 after the
venue fix.

### C1 - DONE 2026-10-17 `6ef833f4` (PO look passed 2026-10-18; phone check at the next deploy)

The frame stack for mobs and NPCs (M-C1). Rulings taken in the session (PO,
2026-10-17, prompt rounds):

- **D15 ruled: ring = collider, no roll.** Every medallion species draws at its
  wire radius (the collider); `randomInt(minSize, maxSize)` is gone for them and
  so is their `minSize`. `maxSize` stays as the SVG raster size. Species without
  a medallion (fixtures, hazards, summons, objects) keep their roll.
- **A grey fallback ring for everything without a family** ("a default greyish
  boring fallback for everything"): no faction, an unmapped faction. The grey
  ring is the existing `npcBorder.png` (its art file names it `Border_Default /
  Gray`); no new asset.
- **The gate is spec presence** (M-D14 as built): a species wears a medallion
  when its `Graphics.ts` entry carries `medallion`. A vitest pin holds every
  combat target and conversant in `api/mobs` to it.
- **Conversant OBJECTS stay bare** ("things in the world to interact with that
  have models instead"): `signpost` (signs, stones, roots, cave mouths),
  `remains`, `fireTotem` (the portals) are named exemptions in the pin.
- **The frame bake is DEFERRED to C0b** (a plan deviation): with one ring layer
  and no addition/decoration art, a RenderTexture would composite nothing. The
  ring draws as one shared texture per family.

What was built:

- **`/mobs` + `faction`** (`catalog.go`, `MobDefinition.FactionName`): the
  authored name, `""` for none. `TestMobCatalogJSON_FactionIsTheAuthoredName`
  (red first) and the field-set pin updated with the second deliberate
  exception.
- **`client-data/Medallions.ts`**: `RING_FAMILY_FILES` (grey = npcBorder,
  forest, leather = leatherBorder_01, leatherClaws = leatherBorder_02, all
  [PLACEHOLDER] until C0b), `FACTION_FAMILIES` (wildlife ×2, spider, elemental,
  troll → forest; bandit, kobold → leather; orc → leatherClaws; everything else
  grey), `MedallionSpec {ring?}` (D23, and C3's player ring, D20),
  `ringFamily()`, `RingResolver` (M-§5.5: retries every tick until the catalog
  knows the species AND the family texture has loaded, then resolves once per
  species id; `forget()` re-arms it).
- **`Graphics.ts`**: 34 mob and 12 NPC entries carry `medallion`; their
  `borderFile` and `minSize` are gone. Grandfather Knot carries `{ring:
  'forest'}`, the first D23 override (his forest frame, PO 2026-10-03).
- **`Mobs.ts`**: the `Mob` constructor takes the spec (in place of the unused
  `anchor`); `resolveRing` draws the ring into the `frame` slot from
  `setMobId`, before its early return. 37 per-class `withBorder` overrides and
  border registrations deleted; fixtures and summons keep `withBorder`.
  `TIER_FRAME_STYLES` and the tier frame are GONE. **The tier recolours the
  ring itself** (PO 2026-10-17, after seeing a stroked rim outside and then
  inside the ring: "if the rims are hand drawn, a yellow extra line won't
  fit"): `Medallions.ringTint` tints the ring sprite normal dark grey `0x707070`,
  elite silver `0xffffff` (untinted: a tint cannot brighten past the art),
  boss gold `0xffd040` (retuned by the PO the same day) [PLACEHOLDER shades; silver
  over gold/red to keep red free for the C2 hostile disc]. **This retires
  M-D12's "normal stays bare" and M-D16's rim layer** (no `rim` slot, no rim
  sprite). The family stays keyed on faction (PO, same round). A tint only
  multiplies, so **ring art must be GREYSCALE** (`medallion-asset-spec.md`
  owes the change): the three coloured placeholder borders are wrapped in
  generated SVGs that desaturate the PNG once at load
  (`assets/border/greyscale/*.svg`, [PLACEHOLDER] until C0b); `npcBorder.png`
  is grey already.
- Visible changes: every medallion mob draws at its collider (most smaller,
  DireBear by up to a third, Deadwood larger); Marauder and KoboldRanged move
  from leatherBorder_02 to leatherBorder_01 (bandit/kobold → leather);
  VenomSpider, GreaterFireElemental, DogNpc, the harvest mobs and every
  NpcPlaceholder species gain a ring; every ring is greyscale now and its
  colour is the tier (the old forest/leather browns are gone until greyscale
  art lands). ArmySoldier (xpFactor 0, friendly: not a combat
  target, D14) keeps its own grey `borderFile` AND its size roll beside humans
  that now draw at the collider. SVG portraits (the harvest mobs, Deadwood, the
  placeholders) fill ~82 % of their box, so the ring overlaps their edge until
  C0b fits portraits into the ring's window. `docs/art/pipeline.md` §4 now
  points at the `medallion` key (M-D9's owed edit).

⚑ **Merged with herding H1/H2 (2026-10-18):** the new `Sheep` species came in
with its own forest `borderFile` and size roll; the coverage pin failed it
because the named sheep (Baabara, Woolliam, Lambert) are conversants, so Sheep
now wears a medallion like every other species (townsfolk: the grey ring, at
its collider).

**Schema:** DB none · wire none · `/mobs` +1 field (`faction`) · conf none ·
content none.

**Verified:** Go build + vet; `go test -count=1 ./...` green except the known
`world.TestPropContent_C1bMigrationPreservesLookAndCollision` (Tree/Boulder,
CLAUDE.md known-inconclusive) · typecheck clean · vitest 1784/0 (+11
`Medallions.test.ts`: the resolver table, the race, the tier tints, the
faction-map pin, the coverage pin) · new harness
`c1-medallions.mjs` 6/6 twice (Wolf forest 72 px, Bandit leather 72, Alpha
Boar forest 120 silver, Hermit grey 84, Grandfather Knot forest 168, Dragon
grey 192 gold: every diameter = 2 × `body.radius` × 120; families checked by
texture identity, since webpack inlines the SVG rings) + screenshots; one
earlier run lost its WebGL context (§29, environment) ·
`r4-badge.mjs vanilla` 7/7.

**PO look passed 2026-10-18** on the retuned tints ("works like this"). ⚑
**Waived to the next deploy** (PO 2026-10-18): the real-phone fill-rate check
(C1's exit, M-§5.4). The cost went DOWN, not up: a token draws portrait + ring
where it drew portrait + border + tier circle. Known gaps until C0b: silver
reads only as a lighter grey beside normal, because the placeholder rings are
mid-grey (lighter greyscale art lifts it), and normal-tinted leather turns
near-black on dark ground. ⚑ **`npc-portraits.mjs` is stale at HEAD**, not
from C1: its four NPC positions predate the world rebuild (all plates ABSENT,
control 0). ⚑ The first harness run hit a stale `backend/aurad`:
`dev-restart.sh server` did not rebuild after the Go change; `make -C backend
build` first.


### C1b - DONE 2026-10-18 `1a89b788` (PO look passed 2026-10-18: "looks good and works")

PONETI portraits and a plain disc (D31-D34, inserted before C2 in the C2
planning round, PO 2026-10-18).

- **Portraits:** every medallion species names a `Characters_nobg` bust (or,
  for the harvestables, any pack icon: D34) as its `packIcon`; the 18 existing
  `portrait-*` entries the medallion species used moved to their `_nobg` twins
  (two twins are numbered differently: `orc-green` = `Orc_5`, `orc-warlord` =
  `Orc_2`), 46 entries are new. The five non-medallion `portrait-*` users
  (companions, ArmySoldier, Bramble) keep their `WithBackground` art.
- **Per-species busts (D33):** `GraphicsConfig.speciesPortraits`, keyed by the
  catalog `name`, gives the 20 NpcPlaceholder species their own bust;
  `Mob.resolvePortrait` swaps it in once the catalog names the species (beside
  `resolveRing`), and puts the class portrait back for a species without one.
  ProjectileBomb keeps the marker (not a combat target or conversant).
- **Kin (D34):** the wolf, bear, boar, spider, fire elemental and cultist lines
  get separate busts, more menacing per rank; only the turnip (an onion,
  `packTint` 0xe0c0ff) and the blighted treant (the treant's bust, 0xa0c088)
  are recoloured. `packIconTexture(name, tint)` bakes the multiply into the
  portrait's canvas once per name + tint; never a per-sprite filter.
- **Disc:** a `disc` slot in `token` below `actualShape` (`TokenSlots.ts`); one
  shared white canvas circle, one sprite per medallion mob, at
  `PackIconFiles.PORTRAIT_FILL` (0.86) of the ring, tinted `Medallions.DISC_SHADE`
  0x6b6b6b [PLACEHOLDER] until C2 tints it by stance.
- **Fallback art:** the 21 template SVGs lost their gradient rim and background
  circle (the thin outline stays, under the ring); mushrooms, deadwood and
  seaweed were already transparent; the 15 artist PNGs and the purple
  placeholder marker are unchanged (a clone draws their own backdrop over the
  disc).
- **Pins:** `Medallions.test.ts` +2 (every medallion species names a portrait
  the manifest lists; `speciesPortraits` keys name real species; falsified by
  dropping Ghoul's entry), `PackIcons.test.ts` counts `speciesPortraits`,
  `TokenSlots.test.ts` the new slot order (red first).
- **Atlas weight:** 152 icons in 4 atlases, ~15 MB → ~19 MB (phone load still
  unmeasured, the open roadmap item).

**Schema:** DB none · wire none · catalog none · conf none · content none
(client art config and the pack manifest only).

**Verified:** typecheck clean · vitest 1792/0 · prod build + repack ·
`c1-medallions.mjs` extended with the C1b legs (disc slot, tint, size, pack
portrait, every subject a distinct portrait) and five venues (Elite + Alpha
Wolf, Dire Wolf, Turnip, Cultist, Skeleton): 12 PASS / 0 FAIL / 0
INCONCLUSIVE (second run; the first hit the known join race) + screenshots ·
`r4-badge.mjs vanilla` 7/7. ⚑ The tinted onion reads only as a small round
bauble at the turnip's 36 px.

### C2 - DONE 2026-10-19 `2099803e` (PO look 2026-10-19: approved for commit; it surfaced D37)

The disc shows the mob's stance toward the player side (D28, D29, D32, D35,
D36).

- **`Mob.Stance()`** (`model/mob/mob.go`), first match wins: calmed reads
  neutral (D32); aligned faction or `FriendlyToPlayers` reads friendly;
  hostile when the aggro set holds the player side, or the aggro target or
  any threat row is player-side (D35); neutral otherwise. `model.Stance`
  (`model/faction.go`) holds the three values.
- **Wire:** `enum Stance : ubyte { Hostile, Neutral, Friendly }` and
  `stance:Stance = Hostile` appended to `table Mob`; `codec/mob.go` writes
  it beside the tier. `MobEntity` gains `Stance()`.
- **Client:** `GameStateMessage` reads it, `EntityManager` routes it to
  `setStance` (`WireSetters.MobPlate`), `Mobs.ts` tints the disc;
  `Medallions.stanceTint` replaces `DISC_SHADE`: hostile `0xc0392b`, neutral
  `0xd4a017`, friendly `0x2e6fd8` [PLACEHOLDER], unknown reads neutral.
- **Content (D36):** `api/factions/flora.json` + `"faction": "flora"` on
  seven harvestables. Their ring family stays the grey fallback (flora is
  not in `FACTION_FAMILIES`), so nothing else on screen changes.
- **Colour blindness** (Machado 2009 simulation, CIE76 ΔE between pairs):
  every pair stays apart under protan, deutan and tritan views; the weakest is
  red/yellow under deutan at ΔE 32 (ΔL 22, the two still differ in
  brightness). No shade change needed.
- **Pins:** `model/mob/stance_test.go` (7 tests: idle by aggro set, prey hit
  by a player then reset, prey targeting a summon, prey fighting a wolf stays
  neutral, calmed, charmed + friendly species, enlisted under a hostile
  summoner), `codec` `TestMobMarshalFlatbuf_Stance` (round trip + the model
  and wire enums pinned against each other), `Medallions.test.ts` +2
  (`stanceTint`). All red first.

**Schema:** DB none · wire `Mob` +1 (`stance`, +1 enum) · catalog none ·
conf none · content +1 faction (`flora`), 7 mob files name it.

**Verified:** `go build` · Go suite green bar the two known pre-existing
failures (`world` prop pin, `cmd/simharness` placements battery, both red on
clean main too) · typecheck · vitest 1794/0 · prod build ·
`c1-medallions.mjs` 13 PASS / 0 FAIL / 0 INCONCLUSIVE (every subject's idle
stance, plus a live leg: boars under the starting aura turn hostile while
idle boars stay neutral) · `r4-badge vanilla` 7/7 · `hygiene-wire-prune` 0
console errors · harness rows cleaned (server stopped first).

### C2b - DONE 2026-10-19 `6eef8da6` (PO look passed 2026-10-19: "all looks good and works as intended")

One composition path for every token (D37, D38): an actor is a medallion or a
plain world object, and the old bordered kind is gone.

- **`Medallion`** (`game-objects/logic/Medallion.ts`, beside `TokenSlots.ts`):
  the disc, the portrait swap (`speciesPortraits`), the ring and the tier and
  stance tints, MOVED out of `Mob` unchanged (the ring textures and the shared
  disc texture moved with them). `setRing` answers false while the ring
  texture is still loading. `Mob` keeps only the `RingResolver` (the
  catalog-race retry, M-§5.5) and forwards `setTier`/`setStance`, which may
  still arrive before `setMobId`.
- **Six actors became medallion species** (`medallion: {}`, collider size, no
  roll, `minSize` gone): Companion (`portrait-black-hound`, DogNpc's bust, a
  D33 kin share), SoldierCompanion (`Human_44_nobg`), ShieldbearerCompanion
  (`Human_23_nobg`), MedicCompanion (`Human_16_nobg`, new key
  `portrait-white-monk`, PO pick from a contact sheet), ArmySoldier
  (`Footman_nb`), Bramble (`Monster_Flower_nb`). `portrait-hound` deleted;
  repacked, 152 icons in 4 atlases. ⚑ Their `maxSize` stays: it is the SVG
  raster size of the committed fallback, the same reason D15 kept it.
- **The player wears it too:** `Character` builds a `Medallion` with a
  friendly disc set locally (D4) and `PLAYER_RING` = the grey fallback family
  (PO pick, until C3's choice), normal tier; it retries the ring every
  prerender until the texture has loaded (the old `Character.border` never
  retried). The blue disc sits behind the opaque `player.png` until C3.
- **Summon rings follow the faction rule** (PO pick): companions have no
  catalog faction, so they and Bramble (`flora`) and ArmySoldier
  (`human_army`) wear grey. Summons read friendly from `Mob.Stance()`.
- **D38:** Campfire and Camp are plain objects.
- **Deleted:** `withBorder`, `registerBorder`, `borderFile` (the type field +
  8 entries), `Character.border`, `playerBorder_01.png`.
- **Pins** (`Medallions.test.ts`, the first two red first): no `borderFile`
  in mobs, npcs or character; every `Graphics` key is a medallion or on the
  named `PLAIN_OBJECTS` list; no medallion species has a `minSize`; the
  portrait pin's skip narrowed to non-combat placeholder species, so summons
  need a manifest bust. `Medallion.test.ts` (6 tests) covers the component.
- **Proof that the 37 existing medallion species did not change:** a
  scene-graph leaf dump (kind, visibility, alpha, blend, tint, texture key,
  size per leaf) at 13 venues, before and after. ⚑ A repack changes every
  portrait's canvas hash without a visible change: scaled `drawImage` bleeds
  neighbouring atlas pixels. So the "before" is HEAD's code built against the
  NEW atlas. Result: 29 groups identical; only the four intended differ
  (Companion: blue disc + grey ring, 60 px instead of the rolled 80;
  ArmySoldier: 72 px instead of 74/80, disc + ring; Campfire: frame empty;
  player: blue disc + grey ring instead of `playerBorder`).

**Schema:** NONE (client art config + pack manifest).

**Verified:** typecheck · vitest 1803/0 · prod build · `go build` (no Go
change) · `c1-medallions.mjs` extended (player, summoned companion, bare
campfire, ArmySoldier) 17 PASS / 0 FAIL / 0 INCONCLUSIVE · `r4-badge vanilla`
7/7 · `hygiene-wire-prune` 0 console errors · content-editor smoke 0 findings
· `generate-palette.mjs` output unchanged · harness rows cleaned (server
stopped first). Two older harness failures, unrelated (no token code
involved): `skill-fx-preview.mjs` fails 2 legs (its `KINDS` list lacks
`rush`, added in `d9a0b2ac`); `c3-zone-editor-level.mjs` 6/7, leg 3
INCONCLUSIVE twice (the click selects spawn #479, not #0).

### C3 - DONE 2026-10-20 `e0bd30d0` (PO in-game checks passed 2026-10-20)

The player wears a chosen medallion (D19, D20, D30, D39). Rulings taken in the
session (PO, 2026-10-19/20, prompt rounds): player portraits are PONETI busts
(D39), the starter rings are grey (default) + leather, the `LOOK` cheat is
live only (C4 owns the save path; ⚑ amended at C4 by the PO 2026-10-21: LOOK now
persists like a pick), the starter set is the 8 busts the PO picked.

- **Content:** `api/appearance/` (one file per item, the file named after its id):
  8 portraits (`default`, `red-hood`, `chainmail-coif`, `green-hood`, `grey-beard`,
  `bright-smile`, `short-crop`, `auburn-curls`) and 2 rings (`ring-plain` = grey,
  the default; `ring-leather`). Names in `api/lang/{en,de}/appearance.arb`
  (`appearance.<id>.name`), hydrated like regions (`lang.DomainAppearance`); the
  JS twin (`tools/lang/content-text.mjs`, `extract-english.mjs`, the key
  fixture) knows the domain.
- **Loader** (`pkg/aura/appearance`): slug ids, slot portrait | ring, a ring
  must name a family and a portrait must not, unknown fields refused, and every
  item a starter until C5 (no `conditions` yet: YAGNI). The default portrait
  and ring must exist as starters, which keeps every pre-C3 row valid. Each
  slot is sorted by id; **wire value = 1 + the position, 0 = the default**.
- **Wired:** `contentSources` + `cp-defs` + `-validate` + the boot line
  `Loaded appearance items portraits=8 rings=2`; `GET /appearance` per locale
  (`lang.Handler`), each slot in wire order, the two defaults marked
  `default: true` so the client never restates their ids.
- **Migration `000004_appearance`:** `characters.ring TEXT NOT NULL DEFAULT
  'ring-plain'` (the store test pins the default to `appearance.DefaultRing`)
  and `game.appearance_unlocks` (scope CHECK per owner shape, three partial
  unique indexes, no CASCADE), unwritten until C5. `characters.avatar` has its
  first reader.
- **Accounts:** `POST /characters` takes optional `portrait` + `ring` (absent =
  the defaults), checked against the starter set (`Config.Looks`, replacing
  `DefaultAvatar`), else 400 `bad_request`; the list carries `ring`; the
  ticket carries `Ring`.
- **Game + wire:** the join resolves the ticket's look to wire values once
  (`ConnectionStateSystem.lookOf`; an id the catalog lacks logs and draws the
  default, never refuses the join); `table Character` +`portrait:ushort`,
  `ring:ushort` (appended). `LOOK <item-id>` sets either slot, owned or not,
  live only (persists since C4).
- **Client:** `client-data/Appearance.ts` (the catalog, `portraitAt`/`ringAt`/
  `wireOf`, `lookArt`, `defaultLook`), `GraphicsConfig.playerPortraits` (id →
  bust), `Character.setLook` via both wire routes (EntityManager for others,
  Player.ts for the own token), redrawn every frame by `drawLook` until the
  catalog, the atlases and the ring texture have all landed (the §5 race).
  `Medallion.setPortraitTexture` is the ONE portrait swap; the species path
  calls it too (D37). `PLAYER_RING` deleted.
- **Creation + select:** `MedallionElement.ts` draws the same medallion as DOM
  (friendly disc, the bust's own baked canvas as a data URL, the family ring at
  the normal tier's shade as a brightness filter, exact for greyscale art), for
  the picker's preview, its tiles (each tile is the medallion it would make
  with the other slot's pick) and every select card. Labels `t()` en + de.
- **Pack:** manifest +8 `portrait-*` busts, repacked (160 icons, 4 atlases).
- **Found:** the content editor's validate seam copies a hand list of content
  directories (`tools/content-editor/aurad-validate.mjs` `CONTENT_SUBDIRS`), a
  third list beside `contentSources` and the validate test's; without
  `appearance` there every editor validation would have failed.
- **Pins** (red first unless noted): the loader (refusals, order, wire values,
  defaults), hydration, the store (look round trip, the ring default, the scope
  CHECKs and uniqueness), accounts (create/list/ticket, refusals), the join
  look, the wire round trip, `LOOK`, the client catalog + its completeness pins
  (every portrait has a manifest bust, every ring a drawable family), the DOM
  medallion, the create request body. Written together with their code: the
  `default` flag, `Medallion.setPortraitTexture`, `lookArt`/`defaultLook`.

**Schema:** DB **+1 migration** (`characters.ring`, `appearance_unlocks`) · wire
`Character` +2 · catalog +1 endpoint (`/appearance`) · accounts create +2 fields,
list +1 · content +1 directory, +1 lang domain · conf none.

**Verified:** Go build + vet; `go test -count=1 ./...` with `AURA_TEST_DB_URL`
green bar the two known reds (`world` prop pin, simharness placements battery);
`-validate` 0 findings · typecheck · vitest 1819/0 · prod build · the migration
on the dev data (dumped first, server stopped): version 3 → 4 clean, 40 rows
backfilled · `c1-medallions.mjs` extended with the C3 legs (picker 10 tiles,
preview, own ring = the Bandit's leather texture, own bust by `LOOK` swap
identity, select card art = picker art, the same after a relog through
character select): 26/1 (the C2 boar-stance leg lost a timing race; its
screenshot shows the hostile disc), re-run 27/0/0 · `r4-badge vanilla` 7/7 ·
`hygiene-wire-prune` 0 console errors · editor `smoke.mjs` 0 findings · harness
rows cleaned (server stopped first). ⚑ A page reload reconnects into the
stashed character: a relog leg must leave through character select. ⚑ The
second Playwright page draws late; wait on the wire value, not a timeout.
`content-editor-lang.mjs` is stale (its quest "Boars in the Field" is gone),
recorded in the verify skill.

### C4 - DONE 2026-10-21 `79f6721e`, PO look passed 2026-10-22

The in-game picker (D9-D11). Ruled in the session (PO, 2026-10-21): hotkey **C**
(before the session); **LOOK persists** like a pick (one save path; it skips
the starter check, so from C5 on a dev can save an unowned item through it).

- **Wire:** `table SelectAppearance { portrait:ushort; ring:ushort; }`,
  `ClientMessageBody` 13 (appended); codec unmarshal + round-trip pin; the
  client channel `NextSelectAppearance` (and the five `model.Client` fakes).
- **Validation:** `Catalog.ID(slot, wire)` (Wire's inverse) and
  `Catalog.WearableLook(portrait, ring)`: both halves must be starter items as
  wire values; 0, an unknown value or a non-starter refuses the WHOLE message,
  silently. The non-starter refusal is pinned in-package on a hand-built catalog
  (the loader refuses non-starters until C5). C5 swaps the owned set into
  `WearableLook` and `CheckStarterLook`.
- **Game:** `ConnectionStateSystem.applyLookPicks` (it owns the catalog) wears a
  valid pick on the next snapshot, any time, combat included (D11).
- **Persistence:** `persist.CharacterState` +`Portrait`/`Ring` (ids, through
  `idsOf`: wire 0 or a retired value saves the default id, clearing a dead id
  like `home_campfire_id`); `SaveCharacter` writes `avatar` + `ring`;
  `saveWatch` carries the look, so a change forces a save. Save only: the join
  still reads the look off the ticket (`lookOf`), each side points at the other.
- **Found (L7):** respawn, F5 reconnect and revive rebuilt the player without
  the look (a C3 gap); `deadState` and `reconnectStash` carry it now.
- **Client:** `LookPicker.ts` (the tile builder, moved out of
  `CharacterCreation.ts`; both mounts call it, D9); `AppearancePanel.ts`, a
  member of the exclusive family (`PanelId` +`appearance`), opened by C
  (`Controls.ts`, beside J/M/B behind the chat/console guards), the desktop
  button under Spellbook and the ☰ sheet's row (both `.appearanceOpenButton`),
  closed by ✕, Escape, a second C or any family member. ⚑ What it shows as worn
  is the server's answer (`setOwnLook`, fed by `Player.ts` every snapshot), never
  the press. `SelectAppearanceMessage.ts`. Labels en + de (`appearance.label`,
  `appearance.close.title`, two button titles); the slot labels reuse
  creation's.
- **Chrome** (`plan-ui-pass.md` C3/C6 patterns, no restyle): the panel is the
  journal/help ink panel; its tiles use the gold selection. The medallion DOM
  rules moved into one `.medallion-dom()` mixin (`variables.less`) both sheets
  call. ⚑ Two visible consequences for the PO look: the desktop **quest tracker
  sits one button height lower** (its top is hand-coupled to the column), and
  on the phone the floating Map button hides over the open panel (the
  spellbook's C3 rule, extended). On the phone the registration nag covers the
  panel's title, as it covers the spellbook's (the open nag item).
- **Also found (not C4's):** `ReviveAtCorpse` does not restore the quest
  ledger (parked in `roadmap.md`); `TestPassages_EveryDoorCarriesItsWords` is
  red on HEAD (the barn exit's text, the passages thread).

**Schema:** DB **none** (writes the existing `avatar` and `ring` columns) · wire
`ClientMessageBody` +1 · `persist.CharacterState` +2 fields (the fingerprint
changes, so every live character takes one extra write after the deploy) ·
frontend lang +4 keys · content none · conf none.

**Verified:** Go build + vet; `go test -count=1 ./...` with `AURA_TEST_DB_URL`
green bar three reds, all red on HEAD: the two known (`world` prop pin, the
simharness placements battery) and `TestPassages_EveryDoorCarriesItsWords`
(store + accounts run with `-p 1`: they share `aura_test`, and in parallel one
dropped the other's schema) · red first: `ID`/`WearableLook`, the four carry
pins (all four reproduced the C3 gap), the pick + refusal + forced save + default
ids, the store write, the codec round trip, `LookPicker` and `AppearancePanel`
(vitest) · typecheck · vitest 1875/0 · prod build · `c1-medallions` **41/0/0**
(the first run on a fresh server died at join, the skill's known race; the next
was 40/0/1, the observer leg's own bug, fixed: a player's name is not in the
plate layer) · `chunk2-accounts` 24/24, 0 console errors (the creation picker
moved into `LookPicker`) · `mobile-layout` all legs green bar leg 7 (red at HEAD,
the journal unreachable from the sheet; a join race first, re-run); the
Appearance row sits at 214-262 px of the 844 px sheet, no overflow ·
`hygiene-wire-prune` 0 console errors · harness rows cleaned, server stopped
first.

### C5 - DONE 2026-10-21, PO look passed 2026-10-22 `0533ef28` (server + wire; the client half is C5c)

Ownership and unlocks (D6-D8, D12, D13, D15, D16, D21a, D25). Ruled in the session
(PO, 2026-10-21, prompt rounds): **C5 splits** into C5 (server, wire, content, the
minimum client) and **C5c** (greyed hints with progress, glow + highlight, the
creation preselect, §7); the three unlocks are **`ring-forest`** (character, `minLevel`
3), **`ring-leather-claws`** (bloodline, `bloodline_ascensions` 1) and **`villager`**
(account, `village-welcome` completed; PONETI bust `Human_01`, named "Villager" /
"Dorfbewohner"), all numbers [PLACEHOLDER]; the **lineage gap is folded in** (below).
⚑ The contact sheet of the 120 spare busts did not reach the PO (this session could
not place a file), so the bust was picked from a description. **PO look passed 2026-10-22** ("all good",
the bust included: the three unlocks, toasts, wear, death/relog carry, the bloodline slot
split and the lineage regressions).

- **`skill_level {skill, value}`** (D15): `value`, not §4.1's `level`, because every
  condition kind uses `value` and the loaders refuse unknown keys. Parsed in
  `mobs.ParseCondition` (a skill and a positive value), resolved by
  `mobs.ResolveSkillCondition` (refuses an unknown skill and a value past its
  `maxLevel`), judged on the spellbook level (an unresolved skill fails closed),
  `LockSkillLevel` = 6 with its skill id, `describeCondition`, and the client's
  `lock.skill-level` en + de. ⚑ The species/quest/skill resolution the ascension
  catalog ran privately is now `mobs.ResolveCondition`, shared with the appearance
  loader. ⚑ `LockKind`, `LockReason` and the new `LockReasonOf` moved to
  `items/mobs/lockreason.go` (`cfg` imports `appearance`, so `appearance` cannot
  import `model`); `model` keeps aliases, no caller changed.
- **Catalog:** locked items carry `scope` + `conditions` (+ `conditionsMode`); a
  starter carries none of them; `kills_this_life` is refused (L8). `Flat` /
  `AtFlat` (every portrait in wire order, then every ring) and `Gated`.
  `/appearance` serves `scope`, `conditionsMode` and `locks` (lock data, no
  progress). `appearance.Load` takes a `World` (skills + mob + quest checks);
  `cmd/aurad` loads it after quests (`appearanceWorld`), and the embedded-copy pin
  now loads through `loadContent`.
- **Evaluator** (`sys/appearance_grants.go`, §4.4's `Grant(p)`): **one watch
  replaces the four call sites.** Level, `SkillComponent.Revision` and the quest
  ledger's save `Revision` are exactly what a level-up, a skill raise and a stage
  change move; the first sight of a connection is the join's catch-up (it also
  catches the XP/SKILL/QUEST cheats). It reuses `conditionsPass`, only ever adds
  (D16: a respec revokes nothing), and announces each grant (`SendUnlock`, entity id
  = the flat index, key `unlock.appearance`).
- **Persistence (L1):** the grants ride `SaveCharacter` (`CharacterState
  .AppearanceGrants`, ids + scope; `saveWatch` watches the owned set's size, so a
  grant saves at once). The UPDATE now `RETURNING account_id, slot_index`, and each
  grant is an `INSERT ... ON CONFLICT DO NOTHING` at its scope (the
  discovered-campfires rule), never into `bloodline_unlocks` (L2). That is the
  account write path: through the save of the character that earned it. ⚑ Loss
  window: a crash before any save loses the grant until the next join re-grants it
  (when the condition still holds); a save on a character deleted in the same
  moment (`ErrGone`) loses an account grant for good. `AppearanceGrants` is
  `omitempty`: only characters owning a locked item change fingerprint.
- **Owned set:** `/select` reads it (`store.OwnedAppearance`: account ∪ this slot's
  bloodline ∪ this character) onto the ticket (`AppearanceOwned`, ids); the join
  turns it into sorted flat indices on the player (an id the catalog lacks is
  logged and dropped). `deadState` + `reconnectStash` carry it (L7).
- **Validators:** `WearableLook(portrait, ring, owned)` (SelectAppearance) and
  `CheckOwnedLook(portrait, ring, owned)` (creation, replacing `CheckStarterLook`;
  owned = the account's rows and, with a slot, that slot's bloodline rows; an
  anonymous first visitor owns starters only). ⚑ `LOOK` still saves any item (C4
  ruling): a dev can save an unowned one.
- **Wire:** `GameState.appearance_owned:[ushort]` (appended) in the owner block;
  `ownerStateGate` watches its size, so a grant resends the block on the same tick.
  `ConversationLock` +`skill:ushort`, `ConversationLockKind` +`SkillLevel = 6`
  (not in §6's list: a dialogue row may gate on the new kind). `KeyUnlockAppearance`
  (`unlock.appearance`, "Wear it under Appearance" / "Anlegen unter Aussehen"),
  pinned by `message_test.go`'s `ServerKeys` loop; `unlock.banner` +`appearance`
  ("New look: {name}" / "Neues Aussehen: {name}").
- **D21a:** `RequestAscension` evaluates the bloodline and account items at the
  count + 1 (`ascended` wraps the player) and hands them to `AscendCharacter`, which
  writes them in the sacrifice's transaction (a failed ascension grants nothing).
  `persist.AscensionRequest` + `AscensionSink` +1 argument.
- **Accounts list:** `appearanceOwned` (account items), per slot `appearanceOwned`
  (bloodline items, never null), `predecessorPortrait` / `predecessorRing` (the last
  spent life's look, from `SlotBloodlines`), for C5c's creation.
- **Client (the minimum):** the catalog types, `itemAtFlat`, the owned set off the
  wire (`setOwnedAppearance`, `isWearable`, answering right after the §5 race), the
  in-game picker offering starters + owned (`renderLookPicker`'s `offered`;
  creation stays starters-only until C5c), and the toast (`Backend.ts` routes
  `unlock.appearance` before the skill path and waits for `appearanceReady`, so a
  join-tick grant never shows a blank name).
- **Content:** the three items, names en + de (`extract-english.mjs`), manifest
  `portrait-villager` + `playerPortraits.villager`, repacked (161 icons).
- **Found (L7, folded in by the PO):** `BloodlineUnlocks`, `BloodlineAscensions` and
  `AccountID` rode only the fresh join; respawn, reconnect and revive dropped them, so
  after one death the stone offered spent rewards, `bloodline_ascensions` gates read
  0 and the memorial stopped marking your names. `lineage` rides `deadState` and
  `reconnectStash` now, pinned at all four doors (all four reproduced the gap).
- **Found at the cleanup:** `cmd/harnessdb -cleanup` failed on
  `appearance_unlocks_character_id_fkey` the first time a harness character owned a
  grant (the 000002/000003 story again); the table now leaves with the account-keyed
  list, before `game.characters`. Production only soft-deletes, so nothing else
  hard-deletes a character.

**Schema:** DB **none** (writes the shipped `appearance_unlocks`) · wire `GameState`
+1 vector, `ConversationLock` +1 field, `ConversationLockKind` +1 value, +1 message
key · `/appearance` +3 fields per item · accounts list +1 field, +3 per slot ·
ticket +1 · `persist.CharacterState` +1 (fingerprint changes only for owners of a
locked item) · `AscensionRequest` / `AscendCharacter` +1 argument · content +3
items, +3 names en + de · frontend lang +2 keys, +1 banner branch · manifest +1
bust · conf none.

**Verified:** Go build + vet; `go test -count=1 -p 1 ./...` with `AURA_TEST_DB_URL`
green bar the three reds red on HEAD (`world` prop pin, simharness placements,
`TestPassages_EveryDoorCarriesItsWords`) · red first: `skill_level` parse / resolve /
judge / lock reason, the codec lock round trip + kind mirror (the comment claimed a
pin that did not exist), the gated loader + refusals, `Flat`, both validators, the
evaluator (join catch-up, once on a level-up, a respec revokes nothing), the
ticket's owned set, the forced save naming scopes, the four-door carries (owned and
lineage), the store per scope (idempotent, a plain delete keeps the bloodline row,
nothing crosses accounts or slots, ascension grants, the predecessor look), accounts
create/list/select, the owner-block resend; D21a's two pins written after the code
and falsified by mutation (dropping the +1, dropping the scope filter) · `-validate`
0 findings · typecheck · vitest 1879/0 · prod build · `c1-medallions` **49/0/0** (C5
legs: not offered at level 1, `XP` earns it with the toast, worn, kept through a
relog; a forged-catalog page's pick refused by the server; the first run died at
the known join race, the second missed the queued toast at 20 s, fixed to 90 s) ·
`hygiene-wire-prune` 0 console errors · harness rows cleaned (server stopped first) · `chunk2-accounts` **24/24**, 0 console errors (two earlier runs timed out at the first name fill, "element is not visible" for 30 s, while the screen was up when photographed; the third, unchanged, passed: a load-timing flake, not C5).

### C5c - DONE 2026-10-23 `a343d038`, PO look passed 2026-10-23 ("all good")

The unlock client (D8, D12, D13, D25). Ruled in the session (PO, 2026-10-23, prompt rounds;
recorded in §7): the hint is a **tooltip only** (phones get none) and it is **the game's
tooltip**, the skills' one, never the browser's `title` (ruled at the PO look); creation
offers **wearable items only**; **the server sends the progress** ("why does the game even
need the ascension count?": only for D25's progress, so the ideal is the server words none
and computes all of it, the way dialogue rows already get theirs).

- **Wire:** `GameState.appearance_locks:[AppearanceLock]` (appended) in the owner block;
  `table AppearanceLock { item:ushort; locks:[ConversationLock]; }`, the item a flat index
  like `appearance_owned`. `codec.AppearanceLocksMarshalFlatbuf` reuses
  `lockReasonsFlatbuf`, so a locked look's reasons are a locked row's.
- **Server:** the evaluator (`grantEarned`) lists every gated item the player does not own
  and does not earn this pass, with `lockReasons` (the rows' `have`), on
  `model.PlayerEntity.AppearanceLocks`. ⚑ No door carries it and no gate field watches it:
  the grant watch's revisions (level, skill, the ledger's SAVE revision) are a subset of the
  owner block's gate (level, skill, the DISPLAY revision, the owned size), the state system
  runs before the net system, and every removal forgets the watch, so a respawn, reconnect
  or revive relists on its first tick (pinned for respawn).
- **Wording, one dialect:** `lockReasonText` moved from `GameStateMessage` to `WireText`
  over plain `LockData` (`decodeLock` off the wire); rows use `lockedText`, the panel
  `lockedReasonsLine` ("Locked: …", `appearance.locked`; `appearance.locked-bare` before the
  first block, a state that lasts one tick, instead of wording the catalog's static locks).
- **Picker (`LookPicker.ts`):** `TileRules {shown, locked, fresh}` replaces `offered`. A
  locked tile is greyed (`.locked`, `aria-disabled`) and a press picks nothing; a fresh one
  pulses (`.fresh::after`, the breadcrumb's entry keyframe). Every tile's hover is the game
  tooltip (`SkillTooltip.attachTooltips`/`showTooltip`, one delegated listener per mount):
  the name, the slot, the lock line. No `title` on any tile, in either mount.
- **Panel (`AppearancePanel.ts`):** shows every item; `setLocks` from the owner block; D13 as
  the spellbook's model: the first owned set is a silent baseline, a later item goes into
  `unseen`, the open buttons and the ☰ pulse (`.breadcrumb`) while it is unseen and the panel
  shut, a grant flashes the visible entry points (`unlockPulse`). ⚑ **Seen = the panel was
  shut**, not the spellbook's 500 ms dwell: the panel shows every item at once, and a re-render
  on the dwell would have cut the glow at half a second.
- **☰ has two owners now:** `MenuBreadcrumb.ts` (`setMenuBreadcrumb(owner, on)`); Spellbook
  and Appearance each set their own flag, so neither clears the other's pulse.
- **Creation (D12):** `CharacterSelect` hands each create card's `LookHeritage` (the account's
  `appearanceOwned` + the slot's, the predecessor's portrait/ring) through `AccountFlow` to
  `CharacterCreation.show`; `heirWears` filters the offer, `heirLook` preselects each slot
  separately where still wearable, else the default. The home mount has no list: starters.
  `AccountsApi` types the list fields C5 shipped.
- **Found (by the harness):** the open panel rebuilt its tiles on every owner-block HEARTBEAT
  (`setLocks` bumped the render revision unconditionally), so a press landed on a detached
  tile. `setLocks` now ignores an unchanged list (pinned).

**Schema:** DB **none** · wire `GameState` +1 vector, +1 table · frontend lang +2 keys en + de
(`appearance.locked`, `appearance.locked-bare`; the de record refreshed) · accounts API none
(typed only) · content none · conf none.

**Verified:** Go build + vet; `go test -count=1 -p 1 ./...` with `AURA_TEST_DB_URL` green bar the
three reds red on HEAD (`TestPassages_EveryDoorCarriesItsWords`, the simharness placements
battery, the `world` prop pin) · red first: the lock list with progress + a grant leaving it +
the respawn relist, the owner-block round trip, `lockReasonText`/`lockedText`, the locked/fresh
tiles, the game tooltip (no `title`), the panel's locks/baseline/glow/seen and the unchanged
heartbeat, `heirLook`/`heirWears`, the select handover · typecheck · vitest 1898/0 · prod build ·
`c1-medallions` **52/0/1** (the 1 INCONCLUSIVE: no campfire in view, unrelated; new C5c legs: the forest ring greyed, the game tooltip "Locked: level 3
(1/3)", a forced press wears nothing, the earned ring lights the button and glows, shutting the
panel counts it as seen; the first runs died at the known join race and at Playwright refusing an
`aria-disabled` click, now forced) · `chunk2-accounts` **27/27** (new leg 8: a seeded spent life in
slot 1 preselects villager + claws, the slot without a past starts on the defaults and is offered
the account's look only; one earlier run's "confirm is disabled and counting down" read "Delete"
after the 1 s countdown, green on the rerun, the dialog untouched) · a creation hover screenshot
(the game tooltip above `#accountScreens`, both at z 100, the tooltip later in the body) · harness
rows cleaned, server stopped first.

### C5b - DONE 2026-10-23 `d7412d1c`, PO look passed 2026-10-23 ("works as described")

The stone bonus (D21c): a look a stone grants on top of whatever was picked, the empty pick
included. The pick half moved to `plan-ascension-ceremony.md` AC2 (2026-10-22); C5b builds the
seams AC2 reuses. Ruled at the start (PO, 2026-10-23, one prompt round; recorded in §7): an
**explicit marker** `grantedBy: "stone"`; until owned the panel shows the item **greyed with a
generic hint**; placeholder content on the **main stone**, a **new portrait**, **bloodline** scope.
At the look the PO asked why it is a single fixed look with no choice at the stone: that is AC1 +
AC2 (the step walk and the look step in the picker), not this chunk.

- **Catalog:** `Item.GrantedBy` + `StoneGift()`; the loader refuses an unknown source, conditions
  or a mode beside the marker, a starter stone gift, and a `character` or absent scope (granted in
  the sacrifice, a character item lands on the life that ends). `Gated()` lists stone gifts (they
  are locked); `/appearance` serves their one lock `{kind: 7}`.
- ⚑ **An empty gate PASSES** (`conditionsPass`): a stone gift's gate is empty by design, so both
  evaluators skip it by the marker, `grantEarned` (listing it locked with `LockStoneGift`) and
  `ascensionAppearance`'s count pass. Both guards pinned and falsified by mutation. A future
  source-granted item kind has the same trap.
- **Authoring:** `InteractionNode.BonusLooks` from `bonusLooks` on an `ascension_catalog` node
  only (beside `rewards` and the stone's price), shape-checked in `mapBonusLooks`;
  `appearance.CrossValidateStones` (run in `cmd/aurad/content.go` after the catalog loads)
  refuses an id that is not a stone gift and warns for a stone gift no stone names.
- **Grant path:** `AscensionPick.BonusLooks` (stashed with the price), `applyAscension` →
  `RequestAscension(p, key, bonusLooks)` (+1 argument, the `connState` seam too) →
  `ascensionAppearance(p, bonus)` appends each stone gift not owned (an id the catalog lacks is
  dropped) → `AscensionRequest.Appearance`, written by the unchanged `AscendCharacter`.
- **Wire + words:** `ConversationLockKind.StoneGift = 7` (`mobs.LockStoneGift`, model alias,
  codec mirror pin); `lock.stone-gift` "a gift of an ascension stone" / "ein Geschenk eines
  Aufstiegssteins", so the tooltip reads "Locked: a gift of an ascension stone".
- **Content:** `gold-amulet` (PONETI Human_12, "Gold Amulet" / "Goldamulett" [PLACEHOLDER]; no
  unused bust read as an elder, so it is named after the bust), manifest + `playerPortraits`,
  repacked (162); the main stone's `bonusLooks` and one line naming it ("Whatever you pick, the
  line that follows may also wear the Gold Amulet."). ⚑ That line repeats the item's name: a
  rename touches both. Editor: a "Bonus looks" textarea beside Rewards, the shape rule ported
  to `validate.mjs` (mob nodes are edited in place, so the key survived a save anyway).

**Schema:** DB **none** (writes the shipped `appearance_unlocks`) · wire `ConversationLockKind`
+1 value · content +1 node key, +1 item key (`grantedBy`), +1 item, +1 stone line en + de · frontend
lang +1 key en + de (record refreshed) · manifest +1 bust · `AscensionPick` +1 field,
`RequestAscension` +1 argument · conf none.

**Verified:** Go build + vet; `go test -count=1 -p 1 ./...` with `AURA_TEST_DB_URL` green bar the
three known reds (`TestPassages_EveryDoorCarriesItsWords`, the simharness placements battery, the
`world` prop pin; `TestEmbeddedAppearance`'s census moved 3 → 4 gated) · red first: the loader
marker + refusals + `/appearance` lock, `CrossValidateStones`, `mapBonusLooks`, the evaluator skip
+ lock reason, the count pass skip, the bonus grant (owned and unknown ids dropped), the bonus
riding the stash to completion for a reward and the empty pick, the codec mirror, the client
wording en + de · `-validate` 0 findings (10 portraits) · typecheck · vitest 1903/0 · prod build ·
editor tests 12/0 · `c2a-ascension-site` **35/35** (new legs: the catalog names the bonus, the dev
DB holds `gold-amulet` at `bloodline` on the spent slot, the heir's creation offers it unworn) ·
`c1-medallions` **53/0/1** on the rerun (new leg: the gold-amulet tile greyed with "Locked: a gift
of an ascension stone"; the first run's `live stance` leg failed for want of a boar in reach, a
venue flake; a `timeout 900` wrapper killed one earlier attempt mid-join) · harness rows cleaned,
server stopped first.
