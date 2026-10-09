# Plan - Localization (multi-language text; English + German first)

**Status:** ✅ C0a-C4 BUILT 2026-10-10 on branch `localization` (not merged; §10 ledger). Exit check owed: the PO's German playthrough, then detection on. Six chunks (C0a, C0b, C1–C4).
**DB schema NONE in every chunk; wire schema YES in C2 + C3** (appended fields
only, both binding regenerations required - see L1). **Content format YES in
C2 + C3**: quest objectives gain `tracker`, mobs gain `namePlural` (Q2), every
dialogue string gains an `id` (D20). The build supports N
left-to-right, Latin-script languages (CJK line breaking and fonts, and
right-to-left text, are not designed here); the first two are **en** (the
authored source) and **de** (the first translation, hand-adjustable). Grounded
in a full text-surface survey run 2026-08-23 (§1; counts refreshed 2026-10-06,
line refs still pinned to 2026-08-23, see §8).
**Revised 2026-10-05 (PO):** the file and message formats follow industry
standards: ICU MessageFormat in ARB files, with required translator notes and
a generated English source file (D16-D19; D7 superseded, D3/D6 amended). A
translation platform is recorded as a possibility, not a decision (§9).
**Reviewed 2026-10-06 (industry-standards pass):** added D20-D23 (a stable id
for every translatable string, dialogue included, PO-ruled 2026-10-07; a
pseudo-locale; a German style guide; the after-launch rule) and L16-L19, found
region and zone names arriving bundled into the client (now served, PO
2026-10-07), corrected
§8's D9 recommendation and C3's actor-name lookup, and split C0. Q1-Q6 were
all PO-ruled 2026-10-07 (D20; objective wording, superseding D9 for
objectives; detection only when German is complete; German in the same
change; du; typed message arguments). The review's other recommendations are
my calls.

**Scope:** everything a *player* reads. Deliberately out: the dev panel, zone
editor, console and cheat feedback (dev-facing, ~135 HTML + ~45 TS sites) ·
`NameGenerator.ts`'s 45 generated names (a content/culture question, not a
translation one) · player-authored character names (literal forever, never
translated) · fonts (**D4**: German ships with fallback-face umlauts until
`plan-ui-font.md` runs) · voiced audio (none exists; music has no language). Credits + changelog: §8.

---

## 1. Where text lives today (survey 2026-08-23)

The architecture is already **half right for this**: the FlatBuffers wire
carries ids for all *static* content (quest ids + stage ids, skill ids, entity
types), and the words come from three HTTP catalogs the client fetches at boot
(`/quests`, `/skills`, `/mobs`; contract stated at `quests/catalog.go:8-20`).
The quest ledger persists **stage ids, not prose** (journal text is re-resolved
per read), no player-visible sentence lives in Postgres, and PixiJS text is
runtime-rasterized (no bitmap atlases). What is *not* localizable today:

| Pool | Size (heuristic) | Today | Chunk |
| --- | --- | --- | --- |
| Frontend UI strings | ~160 HTML-partial sites + ~120 TS sites | English literals at the use site; no i18n library, no catalog | C0b |
| `SkillTooltip.ts` | ~29 sites | English *sentence assembly* from fragments, with capitalization logic | C4 |
| Authored content in `api/` | ~300 strings at survey time; **≈ 810 on 2026-10-07** (upper bound): ≈ 417 dialogue strings in 36 conversants and 134 nodes after `plan-quest-dialogue.md` C3 (180 node lines, 166 option texts, 71 shown grant lines; 28 more grant lines are never shown, see C3; stock phrases repeat, e.g. "I am on it." and "I'll do it." 19× each), 141 quest strings (22 titles, 71 journals, 40 stage + 8 objective trackers), 105 mob + 122 skill names (10 skill `displayName`s authored, the rest derived), 11 skill `description`s, 15 faction names | English inline in the authored JSON | C1 + C3 |
| Client-bundled content (found 2026-10-06) | 50 region titles/subtitles (26 regions) + 5 zone names | English in `api/regions/regions.json` and the zone JSON, imported into the client bundle at build time (`RegionNames.ts:15`, `Game.ts:917`); never served (C1 serves the text via `/lang`) | C1 |
| Server-composed wire text | ~60 Go sites | Finished English via `fmt.Sprintf`/concat, shipped as strings | C2 + C3 |
| Accounts HTTP errors | 14 messages | English `error` string **plus a machine `code`** (`accounts/respond.go:23-37`) - already shaped for client-side mapping | C0b |

Facts that make this cheaper than it looks (the second withdrawn 2026-10-06):

- **Most display names were never authored.** 0/61 mobs and 65/72 skills have
  no display name (2026-10-06: 0/105 and 112/122); `DeriveDisplayName`
  (`skills/catalog.go:62`, applied to mobs at `items/mobs/catalog.go:99`)
  splits the CamelCase id. Under D3 that derived output simply **is** the
  English text - no naming pass is a prerequisite; only German needs authored
  names, which is inherent to translating. ⚑ For skills the English is
  `Display()` (an authored `displayName` wins), never `DeriveDisplayName` on
  the raw name - the codebase's own warning (`sys/interaction.go:1113`).
- ~~**The conversation wire already carries natural text keys.**~~ ⛔
  **Withdrawn 2026-10-06:** `option_index` is an array position
  (`server.fbs:693`) and node `lines` are plain arrays of strings, so dialogue
  text has no identity at all. D20 gives every dialogue string an id. The
  conversant's identity is `Mob.mob_id` (`server.fbs:401`), never its entity
  type (L18).

Four facts that make it harder:

- All three catalogs and `Welcome` are **marshaled exactly once** at boot
  (`quests/catalog.go:37`; wired in `cmd/aurad/aurad.go` ~:269-282). Per-locale
  serving generalizes this to marshal-once-*per-locale* (D6). `Welcome` stays
  untouched: its only free string, `server_name`, is a proper noun and stays
  deliberately untranslated.
- English **grammar is baked into composition**: `"Talk to the " + o.TargetName`
  (`quests/ledger.go:542`), the `" and "`/`", "` name joiner
  (`encounter/warlord.go:230-242`), `verb + ' you'` with capitalization
  (`SkillTooltip.ts:395`). Extraction alone does not survive German word order;
  D16's ICU messages and the Q2 ruling (D9, C2) are the answer. ⚑ And it is
  live (2026-10-06): the opening quest's `gather` stage authors no tracker by
  design, so it shows "Talk to the Hendrik" - already wrong in English, since
  a personal name takes no article (fixed by Q2's required talk_to tracker).
- German pluralizes and **inflects**: "3/8 Wolf slain" is "3/8 Wölfe erlegt"
  (plural ≠ display name) and "Talk to the Farmer" wants a dative. The codebase
  already dodged this once and wrote it down (`ascension_rows.go:373`, P21:
  "N × Species, because it DOES NOT PLURALISE"). D9 extended that dodge; the
  PO's Q2 ruling replaced it for objectives with real plural forms.
- **Some content text never passes through the server** (found 2026-10-06).
  Region titles/subtitles and zone names are imported into the client bundle
  at build time (`RegionNames.ts:15`, `Game.ts:917`). ✅ PO 2026-10-07: their
  text moves to the server-served `/lang` bundle (D6 item 2, C1).

---

## 2. PO decisions (2026-08-23)

- **D1 - dynamic server text becomes KEYS + ARGS on the wire; the client
  formats everything.** The server stays fully locale-free, broadcasts stay one
  payload, and all translation lives in ONE place (the client). Cost accepted
  with it: appended wire fields on `EntityMessage`, `QuestProgress` and the
  conversation tables, and reworking the ~60 Go composition sites to emit
  structured data. Offered and not taken: server-side locale (Join field + DB
  column + per-connection state + Go message tables + per-recipient
  broadcasts).
- **D2 - the language choice is CLIENT-SIDE.** Settings toggle, stored in
  localStorage, defaulting from `navigator.language`, en fallback. No DB
  migration, no Join change; catalog HTTP requests carry a `lang` param.
  Accepted with it: the choice does not follow the account across devices.
  ⚑ **Amendments, review 2026-10-06; (b) PO-ruled 2026-10-07 (Q3), (a) my
  call:**
  (a) detection reads `navigator.languages` (the whole preference list, not
  just `navigator.language`) and negotiates by truncation, `de-AT → de → en`;
  the server serves the same chain, where "unknown → en" would skip `de`.
  (b) ✅ Detection ships at **C4's exit**, not C0. Until German is complete the
  default stays `en` and German is opt-in through the toggle; otherwise every
  German-locale player sees a half-German game through C1-C3 (C1 alone mixes
  German quest titles with English objective lines). That includes the PO:
  this machine's Windows UI is German.
- **D3 - translations are SIDECAR LOCALE FILES.** English stays inline in the
  authored `api/` JSON as the source; German lives in an overlay tree
  (`api/lang/de/`) keyed by content id + field, completeness test-pinned,
  missing keys fall back to English. Offered and not taken: inline
  `{"en":…,"de":…}` objects (churns ~90 authored files), full per-language
  content trees (mirrored balance edits by hand).
  ⚑ **Amended 2026-10-05 by D17 + D19:** the overlay files are ARB with flat
  keys (`api/lang/de/<domain>.arb`), and a generated English source file sits
  beside each (`api/lang/en/<domain>.arb`). The authored JSON stays the
  English source of truth.
- **D4 - font work is DEFERRED ENTIRELY to `plan-ui-font.md`.** `stone-age`
  (4.3 KB, almost certainly basic-Latin-only; ⚑ verified 2026-10-06: 91 code
  points, none of Ä Ö Ü ä ö ü ß „ “ – ’, so German quotes and dashes fall back
  too, while `Capture Smallz`, the start screen's face, covers German) will
  render German umlauts in the `serif` fallback face, mixed-typeface, until
  that pass runs. Accepted
  knowingly; offered and not taken: a minimal umlaut fix in this plan, and
  pulling the full swap forward. ⚑ Consequence for that plan: **glyph coverage
  for the shipped locales becomes a hard requirement on the future face**, on
  top of its recorded size-retune cost.
- **D5 - the widened spoiler leak is ACCEPTED.** Keys-on-wire makes every
  authored string curl-readable in the public per-language bundles: hidden
  dialogue branches, which NPC teaches which skill (option text + `skill_id`),
  grant reply lines. This widens the one leak previously on record (quest diary
  prose, `quests/catalog.go:15-21`, whose comment records the opposite
  philosophy as deliberate). Ruled with the fact in view, 2026-08-23; the
  rationale offered: datamining is in the spirit of "the community discovers
  and shares".

**Format rulings (PO, 2026-10-05).** The PO asked for "a format most supported
by exporters/importers, using industry standards for localization", with
translator notes in the files.

- **D16 - industry standards, not a home-grown format.** BCP 47 locale tags
  (`en`, `de`, later `de-AT`). **ICU MessageFormat** with CLDR plural rules for
  every message: a plural lives *inside* the message
  (`{n, plural, one {# Wolf} other {# Wölfe}}`), which is what translation
  platforms recognize and show translators as a plural. Numbers go through
  `Intl.NumberFormat` per locale, so de gets its decimal comma for free. One
  client library: FormatJS **`intl-messageformat`**, reversing D7's "no ICU
  library". The server stays formatting-free (D1). A plain `{name}` argument
  is already valid ICU, so the authored `{n}/{m}` trackers and
  `plan-npc-hails.md`'s `{name}` need no rewrite.
  ⚑ **Found with `tools/arb-sample/`, 2026-10-05:** a bare `{x}` prints the
  raw JS number even in de (`1500`, `12.5`). Only `{x, number}` formats it per
  locale (`1.500`, `12,5`). Rule: a numeric placeholder that can reach 1,000
  or carry decimals is written `{x, number}`. The D18 notes pin can enforce
  this from the placeholder's declared `type`.
  ✅ **Refined 2026-10-07 (PO-ruled):** EVERY number a player sees goes
  through locale formatting, with no exceptions to remember. Every numeric
  placeholder is `{x, number}` or a plural argument, pinned from its declared
  `type`, in UI and content messages alike. Authors keep writing `{n}/{m}` in
  quest trackers; the D19 generator writes them into the English source as
  `{n, number}/{m, number}`, and the ICU pin (§6) requires the same in the
  German, so nobody types `, number` by hand. The same goes beyond numbers: lists go through
  `Intl.ListFormat` (de "A, B und C"), and percentages and units through
  `Intl.NumberFormat`'s percent/unit styles or ICU number skeletons (de
  "30 %", "1,5 s"); none of them is concatenated by hand. Two doors closed in
  writing: **MessageFormat 2** (Unicode, stable since CLDR 47, March 2025) was
  considered and not taken, because translation-platform support is thin and
  JS has no native implementation yet. **No precompile step**:
  `intl-messageformat` 12.x is ~10 KB gzipped including its parser, and
  server-served content cannot be precompiled anyway.
- **D17 - the files are ARB** (Google's Application Resource Bundle: plain
  JSON, ICU messages, an `@@locale` header, flat keys, `@key` metadata). It is
  one published spec that Weblate, Lokalise, Crowdin and Phrase all read the
  same way. This applies to both homes in D6: the UI catalogs and the content
  overlays. Offered and not taken:
  - plain/i18next JSON: no place for notes;
  - vendor "Structured JSON": each platform has its own field names (Transifex
    `string`/`developer_comment`/`character_limit`, Lokalise
    `translation`/`notes`/`limit`), and Weblate reads neither;
  - Chrome `messages.json`: no ICU;
  - gettext PO: keys by English text, and its own plural syntax clashes with
    ICU;
  - XLIFF: an exchange format, not a runtime one; any platform exports it
    from ARB when an agency needs it.

  Accepted with it: there is **no portable character-limit field**. A
  character count is a weak proxy in a proportional-font UI anyway; C4's
  length sweep is the real check, and platforms set per-key limits in their
  own UI.

  Also accepted with it (named by the 2026-10-06 review): **ARB is
  monolingual.** A bilingual format (gettext PO, XLIFF) stores the source
  beside each translation and marks the translation fuzzy when the source
  changes; an ARB target file cannot say its German is outdated. A platform
  tracks that in its own database. Until one exists, D20's translated-from
  record is the guard.
- **D18 - translator notes are REQUIRED.** Every key in an English source
  file carries `@key.description`, and every placeholder carries a
  `description` and an `example`. The placeholder note is where D9's "this
  name does not inflect" reaches the translator (D9 superseded for
  objectives by Q2: the note now says which form a placeholder carries). Notes live only in the
  English files; target files are key → string. UI notes are written by hand
  with the key; content notes are generated (D19). The `@` metadata is
  stripped before anything ships to a client. ⚑ **Review 2026-10-06:**
  Weblate documents ARB support for message descriptions, not for placeholder
  notes, so an instruction a translator must not miss (e.g. "this name is not
  inflected") goes in the message's `description`, and the placeholder note
  repeats it. Example:

  ```json
  "questTrackerKill": "{n}/{m} {m, plural, one {{mob}} other {{mobPlural}}} slain",
  "@questTrackerKill": {
    "description": "Quest tracker line for a kill objective. {mob} and {mobPlural} are the mob's own singular and plural forms; the plural branch picks one by the required count {m}.",
    "placeholders": {
      "mob":       { "type": "String", "description": "Mob name, singular", "example": "Wolf" },
      "mobPlural": { "type": "String", "description": "Mob name, plural", "example": "Wolves" },
      "n":         { "type": "int", "description": "Killed so far", "example": "3" },
      "m":         { "type": "int", "description": "Required", "example": "8" }
    }
  }
  ```

- **D19 - an English SOURCE file per content domain, GENERATED.**
  Translation tools work on a source/target pair, and under D3 English exists
  only inline in the authored JSON. A generator reusing the boot extractor
  writes `api/lang/en/<domain>.arb`, with descriptions written automatically
  from structure: which quest, stage and field; which NPC and node; what each
  placeholder is. The output is checked in, and a Go test fails when the
  checked-in copy is stale (the codegen pattern). ⛔ Never hand-edit
  `api/lang/en/`; edit the authored JSON and regenerate. Offered and not
  taken: moving English out of the authored JSON (~90 files of churn, and
  authoring gets worse).
  ⚑ **Review 2026-10-06:** regenerate with the repo's existing idiom, an
  `UPDATE_…=1 go test -count=1` run as for `api/skill-vocabulary.json`, so
  there is no new tool. The staleness test compares bytes, so the ARB files
  need `eol=lf` in `.gitattributes` (L16). The generated keys follow D20.

## 3. Design decisions (mine, flag if wrong)

- **D6 - two string homes, split by who needs the text first.** (The
  2026-10-06 review found region and zone names arriving a third way, bundled
  into the client; ✅ PO 2026-10-07: they are SERVED like all other content
  text, item 2, so every content translation ships on one path.)
  1. **Client-bundled UI catalog** (`frontend/src/lang/en.arb` + `de.arb`,
     D17; was `.ts`):
     everything the client can need *before or without* a connection (account
     screens, HUD chrome, banners) **plus the wire-message templates** for
     C2/C3's keys - templates version with the client code that formats them.
  2. **Server-served content text**: the three catalogs serve per-locale
     payloads (`?lang=de`, marshal-once-per-locale, unknown locale → en), and a
     new **`/lang` bundle endpoint** serves the content text that no catalog
     carries, as a flat key→string map per locale: region titles/subtitles and
     zone names from C1, the authored interaction text (conversation
     lines/options/replies/ambients) from C3. English is extracted from the
     authored JSON at boot; German comes from the D3 overlay. What is served
     is the ARB with its `@` metadata stripped (D18). The client keeps
     importing `regions.json` and the zone JSON for their geometry and ids;
     only the displayed text comes from `/lang`.
- ⛔ **D7 - SUPERSEDED 2026-10-05 by D16 (ICU MessageFormat).** Plurals live
  inside the ICU message, not in `.one`/`.other` key variants, and one library
  does the formatting. The `{x}` argument syntax it chose is ICU's own, so
  nothing authored changes. Original text, for the record:
  **one placeholder + plural convention, no ICU library.** Named `{x}`
  placeholders everywhere (the authored `tracker`'s `{n}/{m}` and
  `plan-npc-hails.md`'s `{name}` are the precedents - one syntax, three
  surfaces). Pluralization by key variants (`key.one` / `key.other`) selected
  on a designated numeric arg, client-side, only where a message needs it.
  en/de both fit one/other; a future language with more forms adds variants,
  not machinery (KISS/YAGNI).
- **D8 - structured wire fields carry IDS, never display names; arguments are
  TYPED** (typing ✅ PO-ruled 2026-10-07, Q6). One message table carries a key
  plus a list of `MessageArg`s, each saying what it is: a reference (a kind -
  mob, skill, quest, region - plus its id), a number, or literal text
  (player names). The client resolves a reference from its localized
  catalogs; nothing is parsed out of a string. One rule covers objectives,
  lock reasons, unlock labels and announcement args - a bare English name in
  an arg is how en leaks into de journals (the survey's `ledger.go:542`
  `o.TargetName` is exactly this bug waiting). Offered and not taken:
  - strings with a prefix (`"@mob:34"`, the 2026-08-23 plan): in-band
    inference, the pattern the project's change-only wire fields lesson warns
    against, safe only while `auth.ValidateCharacterName` forbids a leading
    `@`, and numbers would arrive as text;
  - one wire table per event (`SkillTaught {mob_id, skill_id}`): strictest,
    but about 20 new schema tables.
- ⛔ **D9 - SUPERSEDED for quest objectives by the PO's Q2 ruling
  (2026-10-07):** no label shape. Kill and harvest lines use a proper CLDR
  plural over a per-mob plural form (`{m, plural, one {{mob}} other
  {{mobPlural}}}`; every mob a kill or harvest objective names gets `name` +
  `namePlural` in en and de). talk_to and reach objectives MUST author their
  own `tracker` (unless the stage authors a stage tracker), because an
  article or preposition ("mit der Stadtwache", "nach Brunnstedt") cannot be
  built from a name; the loader refuses one without. Any objective MAY author
  a `tracker`. The other name templates (unlock banners, the warlord
  announcement, lock reasons) are held to the same bar in C2: proper
  grammar, no label dodge. Original text, for the record:
  **the P21 dodge becomes the template-authoring RULE, both languages.**
  Templates place name references in **uninflected positions** ("Wolf: 3/8
  erlegt", not "3/8 Wölfe erlegt"), so a nominative-singular display name is
  always grammatical. Recorded escape hatch if a template cannot dodge:
  per-form name variants in the de sidecar (e.g. `name` + `namePlural`),
  additive later. Without this rule C2/C3's German pass discovers inflection
  mid-chunk.
  ⚑ **Clarified 2026-10-05 (PO question):** English is not exempt. It needs a
  plural form too, and the composed fallback in `quests/ledger.go` already
  renders "3/8 Wolf slain" in English for a kill stage with no authored
  `tracker`. ⚑ **Corrected 2026-10-06:** the 2026-10-05 text said nobody sees
  it because every kill quest authors its tracker. The opening quest does not:
  `dinner-for-the-family`'s `gather` stage authors no tracker by design, since
  a stage tracker covers only the first countable objective and the stage has
  four (two talks, 3 Stags, 6 Beets). It shows "0/3 Stag slain", "0/6 Beet
  harvested" and "Talk to the Hendrik" (`quests/ledger.go:679`), the last
  already wrong in English. So the rule's real scope is small: **only
  code-composed templates where a name is an argument**. That is the objective fallbacks ("Talk to the", "Go to",
  slain/harvested), unlock banners, the warlord announcement and lock reasons.
  Authored prose writes nouns as words, and the translator inflects them
  freely. ICU `select` on a gender attribute (D16) is the standard route if
  the escape hatch is ever needed. Ruled in §8 (Q2).
- **D10 - `EntityMessage.key` is OPTIONAL; empty key = render `message`
  verbatim.** One rule covers player chat (never keyed), the en fallback, and
  old payloads. `message` keeps carrying the composed English as fallback
  during the transition; nobody makes `key` required.
- **D11 - switching language RELOADS the page.** The client boots once and has
  no teardown path (`plan-leaving-the-world.md` / backlog §52); live re-render
  of every text surface is a rebuild nobody asked for. localStorage is read
  before boot; the settings toggle writes it and reloads.
  Download size is *not* the reason (PO question, 2026-10-05). The content
  catalogs and the `/lang` bundle fetch only the chosen locale, with gaps
  filled with English on the server. The UI catalogs for both locales are a
  few KB in the bundle.
  ⚑ **Review 2026-10-06:** the toggle lives in the HUD settings panel
  (`settings.partial.html`), so switching mid-session reloads inside the world
  and drops the connection. Confirm first ("The game will reload"), or offer
  the toggle only before entering the world.
- **D12 - locale is PINNED EXPLICITLY everywhere automation or the PO looks.**
  Every harness leg sets the locale via localStorage before boot rather than
  trusting the default - ⚑ the PO's real browser is German-locale, so once
  detection turns on (C4's exit, Q3) `navigator.language` flips their manual
  checks to de, and harness Chromium inheriting the host locale would flip too
  (existing legs assert English strings, L5). Bonus: the de and pseudo legs are
  the same script with the other localStorage pin.
  ⚑ **Review 2026-10-06, the mechanics:** about 90 scripts under
  `.claude/skills/verify/` each open their own `browser.newContext({ viewport
  })`, with no shared launch helper, so the pin is one mechanical sweep adding
  `locale: 'en-US'` to those calls. Playwright's own option pins
  `navigator.language`, Accept-Language and the page's `Intl` defaults
  together, which a localStorage pin does not; a C0a leg asserts the client
  resolved `en`. The PO's machine is confirmed German (its Windows UI), so the
  flip is real.
- **D13 - completeness is TEST-PINNED, runtime fallback is silent.** A vitest
  pin diffs the en/de UI-catalog key sets; a Go test diffs the extracted en
  content keys against the de overlay (failures name keys; a checked-in
  allowlist covers deliberately-untranslated entries during rollout). At
  runtime a missing key falls back to en with no warning - the
  hand-maintained-table lesson says the *pin* is the guard, never the eye.
- **D14 - unknown key / unknown kind DEGRADES READABLE, never blank.** The
  client formatter renders an unresolvable key as the key plus its literal
  args (the `ascension_rows.go:399` "an unnamed requirement" analogue), and an
  unknown lock-reason kind gets a generic template. A forgotten client
  template must degrade to readable English-ish output, not an empty row.
  ⚑ **Review 2026-10-06, three details:** (1) precedence: when `key` is set
  but the client has no template, a non-empty `message` (D10's English) wins,
  and key + args render only when it is empty. (2) A de message that fails to
  compile (`intl-messageformat` throws in its constructor) falls back to the
  en message, then to this rule. (3) Compiled messages are cached per
  (locale, key), because the conversation view is rebuilt every tick while
  the panel is open (`Conversation.ts`).
- **D15 - accounts errors localize by CODE.** The client maps
  `respond.go`'s machine codes to catalog keys and shows the server's English
  `error` string only as fallback. ⚑ `codeRule`'s message *names the violated
  rule* - those stay English-fallback until rule sub-codes exist (§8).

**Added by the 2026-10-06 review** (my calls like D6-D15, except D20 and D23
and D22's form of address, which the PO ruled 2026-10-07, §8):

- **D20 - every translatable string has a STABLE ID, and translations are
  keyed by it** (✅ **PO ruling 2026-10-07, Q1**). This is the industry
  standard for game text: an id given when the string is written, generated
  by a tool rather than typed, stored with the string, and unchanged when the
  text is edited or moved (Yarn Spinner's `#line:` tags, Unreal's namespace +
  key). ⛔ **A translation is never keyed by an array position**: one inserted
  line would move every later translation onto the wrong sentence. Three
  cases:
  - **Content that has ids keeps them**: quest id + stage id + field
    (`quest.wolves-on-the-road.title`), mob and skill registry ids, faction
    names, region ids. A quest objective's tracker is keyed by its kind +
    target (`quest.dinner-for-the-family.gather.talk_to.Hendrik.tracker`); the
    loader refuses two objectives with the same kind + target in one stage
    (none of the 31 today).
  - **Dialogue gets ids.** Every node line, option, grant and ambient line in
    `api/mobs/*.json` carries an `id`: a line becomes `{"id": "a1b2c3",
    "text": "…"}`, and options and grants, already objects, gain an `id`.
    Keys are `conv.<id>`. Ids are short random hex, unique across all
    content, and a tool fills them in for every string that lacks one without
    reformatting the file (the Yarn Spinner "Add Line Tags" pattern), so
    nobody types one. The loader refuses a missing or duplicate id, naming the
    file and node. The wire carries the ids and the client looks the text up
    (C3).
  - **UI strings** keep their hand-written keys (`settingsLanguage`), named by
    meaning.

  **The translated-from record catches edits.** Beside each German ARB, a
  generated `<file>.source.json` (the loader reads only `*.arb`) records, per
  key, the English the German was translated from. A test fails on every key
  whose English has changed since ("outdated: was X, now Y"; D13's allowlist
  covers it during rollout), while the German keeps showing. Once the German
  is checked, an update run (the `UPDATE_…=1` idiom, D19) rewrites the
  record. It covers the UI files too. Offered and not taken: ARB's own
  `source_text` attribute inside the German file (standard, but a platform or
  editor that rewrites the file may drop it), and content-hash keys (an
  English typo fix would hide the German until it is re-keyed).
- **D21 - a PSEUDO-LOCALE from C0a.** A dev-only locale, `en-XA`, chosen only
  by an explicit pin (D12's mechanism), never by detection. It renders
  English with accented letters, about 35 % padding and brackets around every
  message. Every lookup path applies it: `t()` on the client, and the
  per-locale builders on the server (catalogs and `/lang`), only to the
  fields the D19 extractor marks as text, so ids are never touched. Any
  visible text without the markers is a string this plan missed, whether from
  a partial, a TS literal, a catalog or a server-composed message.
  Truncation and concatenation show up from C0a instead of C4's sweep. A
  harness leg (`i18n-pseudo.mjs`) that scans the visible text for unmarked
  words (player names and digits excepted) turns "did we catch every string"
  from a survey into a test. The FormatJS CLI ships the same pseudo-locales,
  but only for its own compiled-JSON pipeline; about 20 lines per side cover
  every home here. Side effect: `stone-age` has none of the accented glyphs,
  so the pseudo UI previews D4's fallback face.
- **D22 - a German STYLE GUIDE and GLOSSARY before the first German string**
  (written in C0a as `docs/manual-localization-de.md`, or as a CSV glossary,
  which every platform imports). It settles:
  - the form of address: **du** (✅ PO-ruled 2026-10-07, Q5);
  - the fixed terms: Aura, Level/Stufe, Skill/Fertigkeit, Cooldown,
    Spellbook, XP/EP, Elite/Boss, …;
  - which names translate: personal names stay, role and species names
    translate; region names (✅ PO-ruled 2026-10-07, Q5): descriptive ones
    translate ("Saltgrass Strand" → "Salzgrasstrand"), coined ones stay
    ("Brunnstedt"), decided name by name in the glossary;
  - gender-neutral address of the player: there is no player-gender
    argument, so a line like "Du bist ein wahrer Held" cannot be right for
    every player.

  Without it, six chunks of German drafted across sessions, and by AI, drift
  between "Fertigkeit" and "Fähigkeit".
- **D23 - after launch, an English content edit carries its German**
  (✅ **PO ruling 2026-10-07, Q4**). Once German is announced, every English edit
  turns D20's translated-from check red, and every new string turns D13's
  completeness pin red. The rule:
  the German lands in the same change (Claude drafts it in the content
  session, the PO reviews), and the allowlist stays a deliberate escape
  hatch, never a backlog (✅ PO 2026-10-07: allowed after launch, §8). Both steps (regenerate per D19, then translate)
  join the `add-content` skill and CLAUDE.md's content rules in C1. Offered
  and not taken: English first with a German backlog, the norm for teams
  with separate translators; here that backlog would have no owner.

---

## 4. The chunks

C0 was one chunk until the 2026-10-06 review split it: the machinery (C0a)
and the extraction sweep (C0b) are each about a session.

### C0a - client i18n machinery (frontend-only, wire NONE)

- **`Locale.ts`**: resolve order localStorage → `en` until C4's exit; from
  then localStorage → `navigator.languages`, negotiated (D2 amendments (a) +
  (b), Q3) → `en`. The detection code lands here behind that switch;
  `t(key, params)` formats through `intl-messageformat`
  (D16), one compiled message cached per (locale, key), with D14's fallbacks;
  catalogs `lang/en.arb` + `lang/de.arb` (D17, `@` metadata stripped at
  build). The D13 vitest key-set pin replaces the tsc check that `.ts`
  catalogs would have given, and the key-usage scan (§6) covers what tsc
  checked at the call sites. ⚑ No webpack or vitest rule reads `.arb` today:
  import with `?raw` + `JSON.parse` (the `?raw` rule already exists for SVGs,
  and vitest supports it natively), or add a `type: 'json'` rule to both
  configs. tsconfig's `lib` is `es2017`: add the `es20xx.intl` libs whose
  types the code uses (`PluralRules`, `ListFormat`, `DisplayNames`).
- **The page declares its language**: `document.documentElement.lang` = the
  resolved locale at boot. The built page has no `lang` at all today; WCAG
  3.1.1 (Level A) requires it, and screen readers, CSS hyphenation and the
  browser's translate offer read it. Decide `translate="no"` on the game root:
  browser auto-translate rewrites DOM text that the game also writes.
- **Settings toggle** + D11 reload (with its confirm); each language listed
  under its own name ("Deutsch", via `Intl.DisplayNames`).
- **D21 pseudo-locale** and **D22 style guide + glossary**, both before any
  German is written.
- **D20's translated-from record** for the UI files, with its vitest check.
- **D12 sweep**: add the explicit en pin to every existing harness leg (the
  Playwright `locale` sweep).

### C0b - static UI strings (frontend-only, wire NONE)

- **The partial seam**: every HTML partial flows through
  `Preloading.renderPartial` (call sites like `HUD.ts:84`) - one post-inject
  pass resolves `data-i18n` (textContent) and `data-i18n-attr` (placeholder/
  title) attributes. Extract the ~160 user-facing sites: `HUD.html`,
  `accountScreens.html`, `startScreen.html`, `settings.partial.html`,
  `accountNag.html`, `endScreen.html`. ⚑ **`data-i18n` goes on leaf elements
  only** (review 2026-10-06): `textContent` on a parent wipes its children,
  and three sentences carry markup today ("Signed in as `<span
  id=accountUsername>`." at `settings.partial.html:88`, "`<em>Recall</em>`
  takes you back…" at `HUD.html:239`, the Chrome/Firefox links at
  `startScreen.html:14`). Markup inside a sentence is an ICU rich-text tag
  (`"Signed in as <user>{name}</user>."`), formatted to parts with one
  handler per tag; never innerHTML.
- **TS literal sweep** (~120 sites): `HUD.ts`, `CharacterSelect.ts`,
  `AuthForms.ts`, `AccountFlow.ts`/`AccountsApi.ts`, `Backend.ts:149`
  ("Connection lost"), `Journal.ts`, `Conversation.ts` ('Confirm', 'Leave.',
  `level ${n}`), `MiniMap.ts`, `Utilities.ts`, `Skills.ts:521-523`,
  `Player.ts` ('Level up!'), `DeleteDialog.ts`, `CharacterCreation.ts`,
  `RegistrationNag.ts`. **Excluded**: `SkillTooltip.ts` (C4), dev tools
  (out of scope).
- **D15 accounts-error mapping**.
- German UI text authored with the chunk under D22 (text is the PO's, like
  all de text), each key with its hand-written note (D18).

### C1 - per-locale content catalogs (backend + content, wire NONE)

- **`api/lang/de/`** sidecar tree (D3, ARB per D17): one file per domain
  (`quests.arb`, `mobs.arb`, `skills.arb` with the 11 skill descriptions,
  `factions.arb`, and `regions.arb` with the zone names, served via `/lang`)
  with flat
  keys built from the content's own stable ids + field (D20; e.g.
  `quest.wolves-on-the-road.title`, `quest.wolves-on-the-road.s1.tracker`);
  the final key spelling waits on the ARB key check in §8. Beside it, the
  **D19 generator** writes `api/lang/en/<domain>.arb` with generated notes,
  plus its staleness test, **D20's translated-from record** for the content
  files lands with its Go test, and `.gitattributes` gains
  `*.arb text eol=lf` (L16).
  ⚑ The new directory **must join
  `contentSources` in `cmd/aurad/loaders.go` AND the `cp-defs` target**, or
  every translation edit silently no-ops (the standing CLAUDE.md rule; the
  silent-no-op class).
- **Overlay loader**: refuses a malformed key and a file that is not valid
  UTF-8 at boot, naming it (L17); missing keys fall back en at serve time
  (D13); the Go completeness test ships with it. ✅ **Orphans are a TEST
  failure, not a boot failure** (PO 2026-10-07): a German entry whose content
  was deleted (or a typo'd key that matches no content) is skipped at boot
  and named by the completeness test, so a leftover translation can never
  block a playtest.
- **Content loader** (review 2026-10-06, replaces L14's escaper): refuses `{`,
  `}` and `'{` in authored text outside the field's known placeholders, with
  the file and field named. Authored English is then valid ICU as written, and
  the generator copies it verbatim, except that numeric placeholders become
  `{x, number}` (D16).
- **Catalog serving**: `CatalogJSON` takes a locale; handlers hold
  `map[locale][]byte` built at boot (marshal-once-per-locale) and read
  `?lang=`, unknown → en. Display names: en = `Display()` for skills (an
  authored `displayName` wins) and `DeriveDisplayName` output for mobs, de =
  overlay.
- **Region and zone names** (D6 item 2, PO 2026-10-07): the **`/lang`
  endpoint is born here**, serving `regions.arb` per locale
  (marshal-once-per-locale, unknown → en); the client fetches it at boot with
  the catalogs, and the region banner and the zone curtain read the
  localized title from it, keeping `regions.json` and the zone JSON for
  geometry and ids. C3 adds the dialogue to the same endpoint.
- **Authoring steps** (D23): the regeneration command (D19) and the
  translation step join the `add-content` skill and CLAUDE.md's content rules.
- **Client**: catalog fetches pass the locale - ⚑ `catalogUrl` does
  `url.search = ''` (`Urls.ts`), so the lang param must be set *after* that
  line or it is silently stripped.
- Quest titles + journal prose render localized with **zero client logic
  change** (already catalog-resolved). German quest/name text authored with
  the chunk.

### C2 - wire keys+args: system messages + objectives (schema YES)

- **Schema, appended only** (both regens, L1): `EntityMessage` gains
  `key:string` + `args:[MessageArg]` (D10; the new `MessageArg` table and
  its ref-kind enum per D8/Q6); `QuestProgress` gains a structured
  objective list (new table: kind + target id + `n`/`m` + done), and
  `CatalogStage` gains the authored `tracker` template so the client can
  substitute `{n}/{m}` itself (today server-side at `ledger.go:529`). ⚑ Serving
  tracker templates for unreached stages is exactly what the
  `quests/catalog.go:15` minimal-projection comment exists to prevent - D5's
  accepted leak starts HERE, so this chunk also updates that comment to cite
  D5 (L13). The old
  `objectives:[string]` keeps its slot (positional table, appended-last -
  `server.fbs`'s own warning) and stops being filled once the client switches.
- **Go sites converted to key+args**: journal banners (`player.go:1317-1326`),
  unlock source labels (`interaction.go:529`, `mob/mob.go:2213`,
  `player.go:1130/:1150`, `cmd/cmd.go:149`), memorial rows
  (`memorial_rows.go:47/:76/:88`), save-state warnings
  (`persist.go:586/:604`), the warlord announcement (`warlord.go:51-52`; the
  English `" and "`/`", "` name-list joiner at :230-242 becomes
  `Intl.ListFormat` on the client, de "A, B und C"). Args follow D8 (typed:
  references by kind + id, regions included; numbers as numbers; player names
  as text). Ambient/hail lines stay
  literal English `message` this chunk and move with the rest of the
  conversation content in C3.
- **One list of server keys** (review 2026-10-06): every key the server can
  send is a Go constant in one file, and a Go test reads
  `frontend/src/lang/en.arb` and fails on a constant with no template or with
  different placeholder names. Without it a forgotten template surfaces only
  as D14's degraded text; today only the lock-reason kinds are pinned (L6).
- **Objective wording (Q2, PO-ruled 2026-10-07):** kill and harvest lines
  are built with a CLDR plural over each mob's `name` + `namePlural` (both
  languages; the de overlay carries both forms). ✅ `namePlural` is required
  only on mobs some kill or harvest objective names, and the loader refuses
  such a target without one; other mobs do not author it (PO 2026-10-07).
  talk_to and reach objectives must author a `tracker` unless their stage
  authors a stage `tracker`, which already replaces every objective line
  (✅ PO 2026-10-07); the loader refuses one without, and content missing one
  is fixed in this chunk.
  Every objective kind may author a `tracker` (talk_to already can,
  `ledger.go:680`; kill/harvest/reach gain it, `{n}/{m}` substituted per
  objective). Quest format change: +`tracker` on three objective kinds,
  required on two; mob format: +`namePlural`. The structured objective list
  and the catalog carry the per-objective template. The other name templates
  (unlock banners, warlord announcement, lock reasons) are checked against
  the same bar: proper grammar, no label dodge.
- **Client formatter**: key → UI-catalog template, typed-arg resolution
  against the localized catalogs (D8), D14 readable degradation.

### C3 - the conversation surface (schema YES, content, the big one)

- **Entry step: every dialogue string gets its D20 id.** Run the tagging tool
  over the 36 NPC files, then switch the loader to refuse a missing or
  duplicate id. Every reader of the dialogue format changes with it: the Go
  loader and its test fixtures, and the content editor (`validate.mjs`, and
  `public/app.js`, whose lines textarea would strip the ids, L19).
- **The `/lang` bundle gains the dialogue** (D6; the endpoint is born in C1
  with the region names): flat id→string map of all authored interaction
  text (`conv.<id>` for every node line, option, grant
  line and ambient line, D20), extracted from `api/mobs/*.json` at boot, de
  from the overlay, marshal-once-per-locale. **This is where D5's accepted
  leak lives.** Each grant has its own id and line, since a teaching option
  shows one row per grant (`sys/interaction.go:1078-1136`). ⚑ The 28 grant
  lines inside quest bundles are never shown (only the lead grant's line is
  returned, `sys/interaction.go:1400`), though the loader requires them
  (`items/mobs/interaction.go:712`): they are not extracted, or the loader
  stops requiring them (a content call).
- **Wire**: the server stops filling `ConversationOption.text`/`reply` and
  `ConversationNode.lines` with prose and sends each string's D20 id instead
  (appended fields); the client looks the text up in the bundle. The composed
  `"%s - locked: %s"` (`interaction.go:1017/:1067`) is replaced by an appended
  structured lock-reason list (kind + args) mirroring `describeConditions`'s
  cases (`ascension_rows.go:340-400`), which itself turns structured.
  ⚑ **Since `plan-quest-dialogue.md` C1 (2026-10-06) a gate has a mode**
  (`mobs.Gate{Mode, Conditions}`, `conditionsMode` `all`/`any`), and
  `describeConditions` joins with ", " or " or ". The structured list carries
  the mode too, and the client joins with `Intl.ListFormat` (`conjunction` /
  `disjunction`: de "… und …" / "… oder …"); the same holds for the ascension
  entries, which share the gate;
  `travelClosedReason` (`interaction.go:1001`) and the `"an NPC"` fallback
  become keys. Runtime-synthesized ascension row text ("Spend this
  character…", `:130/:160/:279`) becomes UI-catalog keys + args. The panel
  header's `Conversation.actor_name` (`server.fbs:475`) is resolved
  client-side too - the conversant's `Mob.mob_id` is in the snapshot via
  `entity_id` (⚑ corrected 2026-10-06: never its entity type, which would
  name all five Farmers alike, L18), so the localized mobs catalog answers,
  and the server-filled string becomes the fallback (otherwise German
  dialogue renders under an English NPC name).
- ⚑ **Entry gate**: verify `skill_id` is populated on every teach row - the
  `plan-conversation-journal.md` D17 fallback ("the granted skill's display name") must be computed
  client-side from it once `text` stops carrying prose.
- **German dialogue pass**: the ~220 authored sentences (≈ 417 strings on
  2026-10-07, after the two-row quest shape: 180 lines, 166 option texts, 71
  shown grant lines) + ambients into `api/lang/de/mobs.arb`.
- ⚑ **The quest-dialogue content pins read row TEXT through `present()`**
  (`sys/quest_content_test.go`: the rats walk, every quest's progress row, the
  Crier's wolves row). When the wire stops carrying prose, those pins keep
  reading the server-side model (which still holds the English) or move to
  ids; they must stay green either way. The same plan's text-surgery script
  (C3, turn-ins moved byte for byte across 15 files) is the precedent for
  D20's format-preserving id tool.
- Bonus, not a goal: the per-tick conversation tree (re-sent 30×/s while open,
  `plan-entity-model.md`'s D16 contract preserved) shrinks - keys instead of
  prose.

### C4 - tooltips + the German polish pass (frontend + content)

- **`SkillTooltip.ts` rework**: per-locale template tables replace fragment
  assembly - category/stat labels, selector words, gate-key sentences, trigger
  clauses, cadence fragments, and the `verb + ' you'` capitalization logic
  (`:395`). ⚑ This visit is the chance to close the standing `TICKING_TYPES`
  watch item (hand-maintained set, silent failure) with a completeness pin.
  ⚑ The tooltip keeps growing: effect types round 2 (C0/C1, 2026-10-07) added
  the `stat_aura`/`instant_stat` phrases ("when it reaches someone new",
  "for {secs}", "applies to") and a "Threat" stat label, and more rounds will
  follow. Survey the fragment set at C4 entry rather than trusting §1's 29
  sites; every new effect type until then adds English-only fragments.
- **German number formatting**: ruled by D16 (`Intl.NumberFormat` per locale,
  so de gets the decimal comma). This chunk routes the tooltip's numbers
  through it, since tooltips are where decimals actually appear, and its
  percentages and durations through `Intl`'s percent/unit styles (de "30 %",
  "1,5 s"; D16's review note).
- **The +30 % length sweep**: German runs ~30 % longer than English and nobody
  has measured the fixed-width HUD slots, conversation rows or tooltip widths
  against that; fixes are CSS. Concrete targets (review 2026-10-06): the five
  `white-space: nowrap` sites (`HUD.less` ×4, `accountScreens.less` ×1), and
  Pixi text against long German compounds ("Fertigkeitspunkte"): Pixi has no
  hyphenation, and `breakWords` is on in one place only
  (`_GameObject.ts:356`). D21's pseudo-locale will have shown most of these
  since C0a.
- **Exit check**: a full German PO playthrough is this plan's in-game verdict,
  and the D13/D20 allowlist is empty (completeness is hard at ship time, §8).
  Only then does language detection turn on (D2 amendment (b), Q3).

---

## 5. Landmines

- ⚑ **L1 - BOTH FlatBuffers regenerations, every schema chunk.** A Go-only
  regen boots fine and the client reads `undefined` forever - the
  `plan-immune-feedback.md` landmine, twice here (C2, C3).
- ⚑ **L2 - `catalogUrl` strips the query.** `url.search = ''` in `Urls.ts`
  silently eats a naively-appended `?lang=`; en text would render with no
  error anywhere (fallback masks it, D13's pins do not cover the URL).
- ⚑ **L3 - `api/lang/` outside `contentSources`/`cp-defs` silently no-ops**
  (C1 bullet 1). Also the standing cache rule: content edits do not invalidate
  the Go test cache - **`go test -count=1`** applies to translation edits too.
- ⚑ **L4 - the D5 leak is a STANDING property, not a one-time event.** Every
  future authored secret (dialogue branch, teaching) is public in the bundles
  from the day it ships. Content authors design discovery knowing the answer
  key is curl-readable.
- ⚑ **L5 - harness scripts assert English on-screen text** ("Step through.",
  journal lines, tooltip lines). Every chunk keeps them green under the D12
  explicit en pin; none may rely on the browser default after C0a.
- ⚑ **L6 - the lock-reason coupling is a durable tax of D1.** Every future
  `ConditionKind` costs a wire encoding + a client template + a de string,
  where today it costs one Go case. D14's degradation is the safety net, the
  Go-side test pinning kind-coverage (§6) is the guard.
- ⚑ **L7 - en leaking into de through args.** Any Go site that passes a
  *display name* instead of an id (D8) ships English into German clients with
  no error. `ledger.go:542`'s `o.TargetName` is the known instance; grep for
  name-typed args at review time in C2/C3.
- ⚑ **L8 - inflection (D9, Q2).** A German translation that inflects a mob
  reference reads wrong the moment the template is reused for another species. Q2's
  ruling: a shared template uses only the forms each name carries (`name`,
  `namePlural`); anything that needs an article, case or preposition is an
  authored per-objective `tracker`.
- ⚑ **L9 - mixed-face German until `plan-ui-font.md`** (D4, accepted):
  umlauts render in fallback `serif`, and the global
  `font-variant: small-caps` synthesizes on the fallback face. Do not
  diagnose it as a rendering bug; do not fix it here.
- ⚑ **L10 - `EntityMessage` drops on a full buffer** (the schema's own L8) -
  keys+args change nothing about delivery; durable state still rides
  `GameState`. Do not move anything durable onto the keyed channel because it
  "now looks structured".
- ⚑ **L11 - the old `objectives` field is positional.** `server.fbs` warns an
  insert above it silently renumbers `completed`; the C2 addition appends, and
  the dead field's slot stays reserved forever.
- ⚑ **L12 - cross-plan placeholder collision.** `plan-npc-hails.md` (in
  flight) substitutes `{name}` server-side into authored ambient text; C3
  moves ambients to keys, at which point the substitution becomes a client-side
  arg. Whichever ships second reconciles; the shared `{x}` syntax (D16; D7
  superseded) is what makes that cheap. Same story for `plan-mob-voicelines.md`'s aggro lines.
- ⚑ **L13 - the leak philosophy comment goes stale in C2, not C3.**
  `quests/catalog.go:15` records "minimal projection" as deliberate, and C2's
  tracker-on-catalog addition is the first thing that violates it; C2 updates
  the comment to cite D5, or the next reader restores the old philosophy in
  good faith.
- ⚑ **L14 - authored English is not ICU-aware (D16).** Dialogue and journal
  text was written as plain prose. Once it is extracted into an ARB file, it
  is parsed as an ICU message, where `{` and `}` are syntax and an apostrophe
  directly before them starts a quoted run. (`Wrecker's Bluff` itself is
  safe.) The D19 generator must escape authored text that is not meant as a
  placeholder, and the de syntax pin (§6) catches the reverse case.
  Deliberate placeholders (`{n}`, `{m}`, `plan-npc-hails.md`'s `{name}`) pass
  through. ⚑ **Revised 2026-10-06:** refuse instead of escaping. The content
  loader rejects such text at boot (C1), so authored English is valid ICU as
  written, the generator copies it verbatim (numeric placeholders become
  `{x, number}`, D16), and the ICU pin (§6) covers en
  as well as de.
- ⚑ **L15 - `api/lang/en/` is GENERATED (D19).** A hand edit there is
  overwritten on the next run, and the staleness test fails before that. Edit
  the authored JSON.
- ⚑ **L16 - CRLF breaks the staleness test.** At least one machine checks out
  with `core.autocrlf=true`, and D19's test compares bytes, so a CRLF working
  copy reads as stale with nothing edited. `.gitattributes` already documents
  the same failure for zone files; `*.arb text eol=lf` joins it (C1).
- ⚑ **L17 - ANSI-saved German loads as U+FFFD with boot green.** Go's
  `encoding/json` silently replaces invalid UTF-8 with U+FFFD, and PowerShell's
  `Set-Content` writes the ANSI codepage by default on the Windows box, so
  "Wölfe" saved that way loads as "W�lfe". The overlay loader checks UTF-8 by
  file name (C1). (`Out-File` writes UTF-8 with a BOM there, which
  `encoding/json` refuses loudly; that one is harmless.)
- ⚑ **L18 - only ids are identities (D20).** Text is never keyed by an array
  position (an inserted line shifts every later one) or by an entity type
  (five Farmers and nine Signposts each share one, and Eliza borrows
  `VillageHealer`). Name lookups go through the mob definition
  (`Mob.mob_id`).
- ⚑ **L19 - the content editor would strip the dialogue ids.** It edits a
  node's lines as one textarea and rebuilds the list from the text
  (`tools/content-editor/public/app.js:999`, and a second lines textarea at
  `:944`), so a save would drop every D20
  id, and re-tagging would mint new ones, cutting each line from its German.
  C3 changes it to one row per line that keeps its id; until then, the
  loader's refusal of a missing id is the loud failure. The same class as a
  zone converter that opens a shape it cannot write back.

---

## 6. Test strategy

**Frontend (vitest):** `t()` interpolation, ICU plural selection, en fallback
on missing key, D14 readable degradation (including D14's precedence and the
compile-failure fallback) · en/de key-set equality pin (D13) · typed-arg
resolution (mob/skill/quest/region references, numbers, literal text; D8) ·
`SkillTooltip` template output per locale (C4; the existing tooltip tests are
the en baseline) · **ICU syntax pin**: every message (UI and content, en and
de; en added 2026-10-06) parses with `intl-messageformat`'s parser, and every
de message uses exactly the arguments of its en source (L14) · **notes pin**
(D18): every en key carries a `description`, and every placeholder carries a
`description` and an `example` · **key-usage scan** (added 2026-10-06): every
key used in TS (`t('…')`) or HTML (`data-i18n`) exists in `en.arb`, unused
keys are reported, and no key is computed at runtime · the D21 pseudo
transform · D20's translated-from check for the UI files.

**Go:** overlay loader refuses a malformed key and skips an orphaned one;
completeness test with named failures for missing AND orphaned keys +
allowlist (D13) · the generated
`api/lang/en/*.arb` is not stale (D19/L15) · per-locale catalog
payloads: de overlay applied, unknown locale → en, byte-stable across
requests (marshal-once-per-locale) · structured objectives carry ids never
names (D8/L7 pin) · lock-reason kinds cover every `ConditionKind`
(L6 completeness pin) · `-count=1` after every content/lang edit (L3).
Added 2026-10-06: every server key constant has a template in
`frontend/src/lang/en.arb` with the same placeholder names (C2) · the content
loader refuses ICU syntax outside a field's placeholders, by file and field
(L14) · the overlay loader refuses non-UTF-8, by file name (L17) · the loader
refuses a dialogue string without an id, a duplicate id, and two objectives
with the same kind + target in one stage (D20) · D20's translated-from check:
an edited English string fails with was/now while its German is still served.

**Sim:** the full battery byte-identical - no gameplay number moves in any
chunk; TTK/TTD and the guardrails stand by construction.

**Harness (`.claude/skills/verify`):** existing legs green under the explicit
en pin (D12, swept in C0a; one leg asserts the client resolved `en`) · new
`i18n-pseudo.mjs` (D21, from C0a): boot with the pseudo pin, scan the visible
text, fail on unmarked words · new `i18n-de.mjs`: boot with the de pin →
settings toggle shows German, journal renders a German title + objective,
a conversation renders German lines and a German locked row, an unlock banner
renders German with a resolved name ref · C4 adds a German tooltip leg.

**Boot:** `-content ../api` clean, 0 WARN / 0 ERROR, census unchanged
(105/61 at plan time).

**In-game:** the PO's own browser defaults to German only from C4's exit
(Q3); until then German is checked by switching it on in settings. C4's exit
is the full German playthrough.

---

## 7. Effort + schema impact

| Chunk | Size | Schema |
| --- | --- | --- |
| C0a client i18n machinery | ~1 session; `Locale.ts` + ARB loading + pins + toggle + `lang` + pseudo-locale + style guide + the harness `locale` sweep | DB NONE · wire NONE |
| C0b UI strings | ~1 session; big but mechanical (~280 sites, each with a note) + de UI text | DB NONE · wire NONE |
| C1 per-locale catalogs | ~1 session; loader + overlay + serving (catalogs + the new `/lang` endpoint for region/zone names) + de names/quests/regions | DB NONE · wire NONE (HTTP param only) |
| C2 system messages + objectives | ~1 session; ~20 Go sites + 2 tables' appends + client formatter + the server-key pin | DB NONE · **wire YES** (appended) · quest format +`tracker` on three objective kinds (required on talk_to and reach) · mob format +`namePlural` (Q2) |
| C3 conversation surface | ~1.5 sessions; the id pass over 36 NPC files + bundle endpoint + lock reasons (with the gate mode) + ≈ 417 de strings | DB NONE · **wire YES** (appended) · content format: every dialogue string gains an `id` (D20) |
| C4 tooltips + polish | ~1 session; template rework + length sweep + PO playthrough | DB NONE · wire NONE |

Total new machinery is deliberately small: one client i18n module (on one
library, `intl-messageformat`, D16), one overlay loader, one en-source
generator (D19), one bundle endpoint, one formatter, one pseudo transform
(D21). The bulk is extraction and German authoring: ~600–700 translatable
units at survey time, **≈ 1,230 on 2026-10-07** (≈ 865 content strings,
counted as an upper bound, + ~280 UI sites + ~60 server templates + the
tooltip fragments).

---

## 8. Open

- ✅ **Credits + changelog** (closed 2026-10-07; PO: no preference, so the
  default stands): they stay English - the changelog is written per release
  in one language, credits are names.
- **`codeRule` sub-codes** (D15): the validation-rule messages stay
  English-fallback until the accounts API names which rule machine-readably.
  Small, additive, unowned.
- ✅ **Completeness at ship time is HARD** (D13; PO-ruled 2026-10-07): German
  is announced (and detection turns on, Q3) only when the allowlist is empty:
  every string translated, none outdated (D20). ✅ **After launch the
  allowlist may take entries again** (PO 2026-10-07): an English change that
  must ship before its German (an emergency fix) lists its key, and German
  players see that string in English until it is translated. D23's rule
  stays the normal path; the list is the exception, not a backlog.
- ✅ **Where this plan sits in the execution order** (PO 2026-10-07:
  "soonish"): early, ahead of the release map's content pass. Every chunk of
  new content authored before C1 adds to the de backlog, so "before the
  release map's content pass" is materially cheaper than after. Exact slot in
  `roadmap.md` still to be set.
- **`plan-ui-font.md` inherits a hard requirement** (D4): the future face must
  cover the shipped locales' scripts (de: Latin + umlauts + ß) - recorded here
  so the font pass reads it before picking.
- D6–D15 (and D21–D23, added 2026-10-06; D20 was ruled 2026-10-07) are my
  calls, not rulings. The one worth a second look: D11 (reload-on-switch,
  which backlog §52's teardown work would later soften for free). D9 was
  superseded for objectives by the PO's Q2 ruling, 2026-10-07.
- ✅ **Repeated stock phrases: per-line ids WITH a shared fallback** (PO
  2026-10-07; raised after `plan-quest-dialogue.md` C3 put "I am on it." and
  "I'll do it." on 19 nodes each, "Do you have a task for me?" on 17).
  - An authored list, `api/lang/stock.json`, names the shared phrases
    descriptively: `{"quest-accept": "I'll do it.", "quest-progress": "I am
    on it.", "ask-task": "Do you have a task for me?"}`.
  - The generator gives each a shared entry (`stock.quest-accept`) and links
    every dialogue line whose English matches the phrase exactly. A line
    keeps its own D20 id.
  - The server builds each German line from the first that exists: the
    line's own German (an override, e.g. one NPC's voice), the shared
    phrase's German, the English.
  - The completeness test counts a line as translated when either exists;
    the translated-from record covers stock entries too. A line whose English
    is reworded no longer matches, shows English until translated, and is
    named by the test.
  - Repeats not on the list stay per line; the generator reports any English
    string used 3+ times that the list does not name.
  - Not taken: dialogue lines pointing at a stock name instead of carrying
    text (one English edit would cover all, but authoring and the content
    editor change); pre-filling copies (19 entries to edit later).
- ✅ **PO calls from the 2026-10-06 review, all ruled 2026-10-07:**
  - ~~**Q1, stable keys (D20)**~~ ✅ **RULED 2026-10-07 (PO):** every
    translatable string has a stable id, dialogue included, and a
    translated-from record flags German whose English changed (D20).
    Content-hash keys rejected.
  - ~~**Q2, D9's shape**~~ ✅ **RULED 2026-10-07 (PO):** no label shape.
    Kill and harvest lines use a CLDR plural over per-mob `name` +
    `namePlural`; talk_to and reach must author a `tracker`; any objective
    may (D9, C2).
  - ✅ **Q3 RULED 2026-10-07 (PO): detection ships only when German is
    complete.** Was: when detection ships (D2 amendment b): at C4's exit
    (recommended), or from C0a as D2 is written.
  - ✅ **Q4 RULED 2026-10-07 (PO): yes, German in the same change.** Was:
    after launch (D23): an English content edit carries its German in
    the same change (recommended), or English first with a German backlog.
  - ✅ **Q5 RULED 2026-10-07 (PO): du; descriptive region names translate,
    coined ones stay.** Was: style (D22): du (recommended)? Do region names translate
    ("Saltgrass Strand")?
  - ✅ **Q6 RULED 2026-10-07 (PO): one message table, key + typed arguments
    (D8).** Was: a typed `MessageArg` table, or keep the prefixed strings.
- **D9's shape, ✅ RULED 2026-10-07 (Q2): B for kill and harvest, plus
  authored trackers (required on talk_to and reach).** Neither
  recommendation below was taken; kept for the record. It only touches the
  code-composed templates (D9's clarification). Three options:
  - **A, label shape** ("Wolf: 3/8 slain" / "Wolf: 3/8 erlegt"): no cost.
  - **B, a plural name form in BOTH languages** ("3/8 wolves slain"): a
    `namePlural` per mob in en *and* de, because deriving English plurals
    from the id fails ("Wolf" → "Wolfs"). German "Talk to the {npc}" still
    needs the label shape.
  - **C, full German forms**: case forms plus a gender per name, via ICU
    `select`.

  ~~**Recommendation: A, plus requiring an authored `tracker` on every kill
  and harvest stage**, so count lines never use the name fallback. Content
  already does this.~~ ⛔ Withdrawn 2026-10-06: content does not, and cannot.
  A stage tracker covers one countable objective, so `dinner-for-the-family`'s
  four-objective `gather` stage has none by design and shows the fallback,
  including "Talk to the Hendrik".

  **Recommendation (revised 2026-10-06): A for every code-composed objective
  line, talk_to included** (exact wording at C2), **plus an optional authored
  `tracker` on every objective kind** (talk_to already has one,
  `ledger.go:680`; kill/harvest/reach gain it). An author who wants natural
  wording writes it per objective, in both languages; an untracked objective
  stays grammatical through the label shape. B and C remain additive later.
- **The ARB key scheme (D17).** The ARB spec asks for identifier-style keys,
  and Flutter's code generator enforces that. Translation platforms are
  generally lenient, but our planned keys carry dots and hyphens
  (`conv.a1b2c3`, `quest.wolves-on-the-road.title`).
  Before C0a fixes the scheme, import a sample file into the platform we
  would use (§9) and check it round-trips unchanged. (The spec's own wording,
  checked 2026-10-06: an id's naming "should follow the convention for
  constant string in the target language"; it says nothing about dots.)
- ⚑ **The §1 survey is STALE** (taken 2026-08-23). Text surfaces added since:
  - the region banner `title`/`subtitle` in `api/regions/regions.json`
    (region identity R1);
  - the `reach` objective's composed "Go to {title}" line in
    `quests/ledger.go` (R2);
  - the buff tray's visible half (⚑ corrected 2026-10-06: built, `116a9519`;
    its tooltips show skill names, mob skills included);
  - new quests and NPC lines (`eliza-sends-me` and others).

  Line refs in §1–§4 are pinned to 2026-08-23. For example, `ledger.go:542`
  ("Talk to the") and `:529` (tracker substitution) are now `:679` and
  `:664-668`. Re-survey at C0a entry. The content counts were refreshed
  2026-10-06 (§1), which also found the client-bundled region and zone text
  (served via `/lang` from C1, D6).

---

## 9. Translation platform - a possibility, not a decision (2026-10-05)

Nothing in this plan requires one. ARB files in git, edited by hand, work from
C0a onward, and D17's point is that a platform can be added at any time without
changing a file. The candidates, as researched 2026-10-05:

- **Weblate**, the leading free open-source platform. GPL v3+, and every
  feature is in the free code: its paid plans differ by hosting capacity and
  support, not features. It reads and writes ARB, checks ICU MessageFormat
  syntax, and commits translations back to git. Components are configured by
  filemask, e.g. `api/lang/*/quests.arb` and `frontend/src/lang/*.arb`; the
  ARB `description`s (D18) are what it shows translators as context. Ways to
  run it:
  - **self-hosted**: free, with optional support from €53/month. It is a
    server app (Docker, or Python + Postgres + Redis), so it needs a host,
    e.g. the playtest box. ⚑ (2026-10-06) A poor fit while that box still has
    open ops items (no backups, firewall; `plan-playtest-deploy.md` §Ops);
  - **Hosted Libre plan**: free, but only for **public** open-source
    projects. The private repo most likely rules it out;
  - **Hosted cloud**: from €47/month for 10,000 strings. The ~600–700 units
    per language (§7) fit the smallest tier, and so do the ≈ 1,230 counted
    2026-10-07.
- **Tolgee**: open source and free to self-host. Its standout feature is
  click-to-translate in the running app, which reaches DOM text only here,
  never Pixi-rendered text. Some features are paid. Its cloud free tier is
  500 keys (2026-10-06), too few for this project.
- **Crowdin** (added 2026-10-06): proprietary and hosted, with a free plan
  that third-party summaries put at 60K hosted words, 1 private project and 1
  integration (e.g. GitHub), with unlimited translators. It reads ARB and
  ICU. That is likely €0 for this private repo with nothing to host; check the
  limits (whether hosted words multiply by language) at sign-up.

The choice can wait until there are translators other than the PO. Until
then, D13's pins, D18's notes and D20's translated-from record do the
platform's checking job in the repo.

---

## 10. Ledger (built 2026-10-10, branch `localization`, one session)

All six chunks built and committed one per chunk; NOT merged to main.

- **C0a** `48131082`: `features/i18n/logic/Locale.ts` (resolve once, negotiate by
  truncation, detection written but OFF per Q3; `t`/`tKey`/`tParts`, per-(locale,
  key) cache, D14 fallbacks; `<html lang>` + `translate="no"`; `en-XA` pseudo).
  ⚑ `intl-messageformat` is **10.7** (npm's resolution), not 12.x; same API.
  Settings toggle (confirm + reload). Pins in `src/lang/catalogs.test.ts` cover the UI
  AND content ARBs: completeness + allowlist, orphans, ICU parse + de/en argument
  parity, notes, numeric formatting, translated-from record (`*.source.json`),
  key-usage scan (`t('…')` literal; runtime keys use `tKey`). Style guide:
  `docs/manual-localization-de.md`. D12 sweep: every harness context pins
  `locale: 'en-US'`; `i18n-pseudo.mjs` (en / de / no-detection / pseudo scan).
- **C0b** `60c1107c`: `data-i18n` / `data-i18n-attr` / `data-i18n-rich` (+
  `data-i18n-tag` children cloned, never innerHTML) resolved in
  `Preloading.renderPartial`; ~120 TS sites; D15 by machine code (`rule` stays English).
- **C1** `96ff311a`: `pkg/aura/lang` (leaf): overlays (UTF-8 + key checks by file,
  L17), `Negotiate`, marshal-once-per-locale `Handler`, Go pseudo, ICU refusal of
  authored text (L14, `{ } < >`), key builders (D20). A `lang` stage in
  `loadContent` (so `-validate` sees it). Catalogs localized; `/lang` born. Generated
  `api/lang/en/*.arb` pinned fresh (`cmd/aurad/lang_content_test.go`). `api/lang` in
  `contentSources` + cp-defs; `*.arb` eol=lf. ⚑ Faction names are not extracted:
  nothing serves them by id (`targetFactions` are display names).
- **C2** `775802ad`: wire `EntityMessage.key/args:[MessageArg]`,
  `QuestProgress.objective_list:[QuestObjective]`. Server keys in
  `lang/message.go`, pinned against `en.arb`. ⚑ The old `objectives` strings and
  `message` stay FILLED (English fallback), deliberately. Q2's rules live in the
  boot's lang stage, not the quest parser, so unit fixtures stay short.
- **C3** `4261d08a`: 446 ids tagged; loader reads `{id, text}` (bare strings
  still parse for fixtures; the lang stage refuses missing/duplicate ids in
  shipped content). Stock phrases (`api/lang/stock.json`, 9). Wire: option
  `text_id/reply_id/text_key/reply_key/locks/locks_any`, node `line_ids`. ⚑ Prose
  stays on the wire (fallback); the per-tick shrink is not taken. ⚑ Memorial
  rows' "· level N" and the travel fallback beyond its lock reason stay English.
  Content editor keeps ids through a textarea edit (L19).
- **C4** `5a83c1cd`: 99 tooltip templates, English byte-identical except the
  faction list (Intl.ListFormat). `hyphens: auto` + `overflow-wrap` on body.
  ⛔ **Exit check NOT done**: no PO German playthrough yet, so detection stays
  OFF and the allowlists are empty but unreviewed. All German is Claude's draft
  under D22; the PO reviews it.
- **Verified:** vitest 1615/0 · Go full suite bar the known
  `TestPropContent_C1bMigrationPreservesLookAndCollision` · `i18n-de.mjs` 7/7 ·
  `i18n-pseudo.mjs` 4/4 · content-editor smoke (only the stale-binary note).
- **Schema:** DB NONE in every chunk · wire YES in C2 + C3 (appended only, both
  regens) · content: mobs +`namePlural` (16), objectives +`tracker` (5), every
  dialogue string +`id`.
