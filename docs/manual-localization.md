# Manual - localizing a feature

How to add player-facing text so that every language gets it. The checklist,
not the reasoning: each line names the ruling in `plan-localization.md` (Dn,
Ln) that explains it. German wording: `manual-localization-de.md`.

**The rule:** player-facing text is never a literal in code. Dev tools (dev
panel, zone editor, console, cheat feedback) are out of scope.

## 1. Where a string lives

| The text is… | Home | Key shape |
| --- | --- | --- |
| UI chrome, or a template code fills in | `frontend/src/lang/<locale>/frontend.arb` | `<area>.<thing>[.<part>]` (D32) |
| Written per content item (quest, mob, skill, NPC line, region) | `api/lang/<locale>/<domain>.arb` (`quests`, `mobs` = names, `conversations` = dialogue + shared phrases, `skills`, `regions`) | built from content ids (D29); see the `add-content` skill |
| A sentence the server sends | a key in `backend/pkg/aura/lang/message.go` + its template in `frontend.arb` | as UI keys |

## 2. UI text (frontend)

- Add the key to `en/frontend.arb` with a note (`@key.description`, and per
  placeholder `description` + `example`; D18), and its German to
  `de/frontend.arb` in the same change (D23).
- Key shape (D32): lowercase, hyphenated, dot-separated parts; the first part
  is the feature area (`hud`, `help`, `spellbook`, `journal`, `tooltip`, …);
  a role is a last part (`.title`, `.label`, `.heading`, `.body`); no key is
  the dotted prefix of another; never start with a content root (`quest`,
  `mob`, `skill`, `region`, `zone`, `conv`, `stock`).
- Code: `t('area.key', {args})` with a literal key. A computed key only via
  `tKey(key, args, fallback)`, and only for a closed code list (below).
- HTML partials: `data-i18n="key"` on LEAF elements (text), `data-i18n-attr=
  "title:key;placeholder:key2"` (attributes), `data-i18n-rich="key"` for a
  sentence with markup (each tag a `data-i18n-tag` child; never innerHTML).
  `data-i18n-skip` marks deliberate non-translation (credits, proper nouns).
  A partial inserted outside `Preloading.renderPartial` runs `applyI18n` on
  its root itself.
- Numbers: every one through `{x, number}`, a plural, or `formatNumber`;
  lists through `formatList`; never `+ ' '` concatenation (D16).
- A name inserted into a template stays nominative; its note says so, and a
  language that would inflect it phrases the line as a label (D31).
- A closed code list (damage types, gate keys): one key per code
  (`damage-type.fire`) and a Go test that every code has its key
  (`skills/damage_type_names_test.go` is the model). Unknown code → itself.
- Only English is bundled. Every other locale's `frontend.arb` is a chunk of
  its own, listed in `localization/logic/CatalogLoaders.js` (that map IS the
  list of playable UI locales), and `index.ts` evaluates the game's modules
  only once it has loaded (C8). Code that runs before then sees English.

## 3. Names from catalogs

- Mob names: `mobName(id, count)` / `formatMobName(text, count)`, never
  `.displayName` raw: it may hold ICU plural syntax (D24, L20).
- Skills, quests, regions: read the localized catalogs and `/lang` bundle the
  client already fetched; never a name the server sent as text (L7).

## 4. Server-sent text (Go)

- Send `lang.Message{Key, Args, English}`: a key constant in
  `lang/message.go` + its argument names in `ServerKeys` + the template in
  `frontend.arb` (`message_test.go` pins them against each other).
- Arguments are typed (D8): `lang.MobRef` / `SkillRef` / `QuestRef` /
  `RegionRef` carry IDS, `Number`, `List`, `Text` (player names only).
  A display name in an argument ships English to every language (L7).
- `English` is the fallback for clients without the template (D10).
- ⚑ No test catches a `fmt.Sprintf` sentence sent to a player: review for it.

## 5. Checks

- `cd frontend && npm test`: completeness, ICU parity, notes, key shape,
  key usage, and the hard-coded text scans (TS and HTML).
- After the German is written: `UPDATE_LANG_SOURCE=1 npx vitest run src/lang`
  (UI record); content: `cd backend && UPDATE_LANG=1 go test -count=1 -run
  TestLang ./cmd/aurad/`.
- `aurad -lang-status -content ../api`: missing / outdated / too long (D25).
- A new screen: run `.claude/skills/verify/i18n-pseudo.mjs`; any unaccented
  word on screen is a string that bypassed the catalog (D21).
- Harness scripts pin `locale: 'en-US'` in `browser.newContext` (D12): this
  machine's browser is German.

## 6. Translating in a spreadsheet

`node tools/lang/sheet.mjs export` writes one CSV per language (`de.csv`:
key, English, translation, note, length limit, status); `node
tools/lang/sheet.mjs import de.csv` writes the translation column back into
the ARBs, or refuses the whole sheet naming the bad rows. It never writes
English and never refreshes the translated-from records: review the git diff,
then run §5's record step. `--help` lists the rules and the Google Sheets
traps (untick "Convert text to numbers, dates, and formulas" on import).
Tests: `node --test tools/lang/*.test.mjs` (plan-localization.md C9).

For a text pass rather than a translation pass, `python3
tools/lang/dialogue-sheet.py --out <dir>` writes the same rows for dialogue and
quests only (conversations, quests, door words), in play order from the starting
campfire, with section, speaker, quest and kind columns, as `.xlsx` (upload to
Google Drive for a Sheet) and `.csv`. Before importing German from it, `--strip
<edited.csv>` drops the context columns, which `sheet.mjs import` refuses.
