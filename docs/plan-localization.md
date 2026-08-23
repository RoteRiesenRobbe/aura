# Plan - Localization (multi-language text; English + German first)

**Status:** 📋 PLANNED 2026-08-23, not started. Five chunks (C0–C4).
**DB schema NONE in every chunk; wire schema YES in C2 + C3** (appended fields
only, both binding regenerations required - see L1). The build supports N
languages; the first two are **en** (the authored source) and **de** (the first
translation, hand-adjustable). Grounded in a full text-surface survey run
2026-08-23 (§1).

**Scope:** everything a *player* reads. Deliberately out: the dev panel, zone
editor, console and cheat feedback (dev-facing, ~135 HTML + ~45 TS sites) ·
`NameGenerator.ts`'s 45 generated names (a content/culture question, not a
translation one) · player-authored character names (literal forever, never
translated) · fonts (**D4**: German ships with fallback-face umlauts until
`plan-ui-font.md` runs) · audio (none exists). Credits + changelog: §8.

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
| Frontend UI strings | ~160 HTML-partial sites + ~120 TS sites | English literals at the use site; no i18n library, no catalog | C0 |
| `SkillTooltip.ts` | ~29 sites | English *sentence assembly* from fragments, with capitalization logic | C4 |
| Authored content in `api/` | ~300 strings (~220 NPC dialogue sentences, 78 quest title/journal/tracker, 10 faction names, 7 skill displayNames) | English inline in the authored JSON | C1 + C3 |
| Server-composed wire text | ~60 Go sites | Finished English via `fmt.Sprintf`/concat, shipped as strings | C2 + C3 |
| Accounts HTTP errors | 14 messages | English `error` string **plus a machine `code`** (`accounts/respond.go:23-37`) - already shaped for client-side mapping | C0 |

Two facts that make this cheaper than it looks:

- **Most display names were never authored.** 0/61 mobs and 65/72 skills have
  no display name; `DeriveDisplayName` (`skills/catalog.go:64`, applied to mobs
  at `items/mobs/catalog.go:67`) splits the CamelCase id. Under D3 that derived
  output simply **is** the English text - no naming pass is a prerequisite;
  only German needs authored names, which is inherent to translating.
- **The conversation wire already carries natural text keys.** Options carry
  the *authored* `option_index` and nodes carry authored `id`s
  (`server.fbs:~411-475`), so keying conversation text needs no new identity
  scheme.

Three facts that make it harder:

- All three catalogs and `Welcome` are **marshaled exactly once** at boot
  (`quests/catalog.go:37`; wired in `cmd/aurad/aurad.go` ~:269-282). Per-locale
  serving generalizes this to marshal-once-*per-locale* (D6). `Welcome` stays
  untouched: its only free string, `server_name`, is a proper noun and stays
  deliberately untranslated.
- English **grammar is baked into composition**: `"Talk to the " + o.TargetName`
  (`quests/ledger.go:542`), the `" and "`/`", "` name joiner
  (`encounter/warlord.go:230-242`), `verb + ' you'` with capitalization
  (`SkillTooltip.ts:395`). Extraction alone does not survive German word order;
  D7/D9 are the answer.
- German pluralizes and **inflects**: "3/8 Wolf slain" is "3/8 Wölfe erlegt"
  (plural ≠ display name) and "Talk to the Farmer" wants a dative. The codebase
  already dodged this once and wrote it down (`ascension_rows.go:373`, P21:
  "N × Species, because it DOES NOT PLURALISE"). D9 extends that dodge.

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
- **D3 - translations are SIDECAR LOCALE FILES.** English stays inline in the
  authored `api/` JSON as the source; German lives in an overlay tree
  (`api/lang/de/`) keyed by content id + field, completeness test-pinned,
  missing keys fall back to English. Offered and not taken: inline
  `{"en":…,"de":…}` objects (churns ~90 authored files), full per-language
  content trees (mirrored balance edits by hand).
- **D4 - font work is DEFERRED ENTIRELY to `plan-ui-font.md`.** `stone-age`
  (4.3 KB, almost certainly basic-Latin-only) will render German umlauts in
  the `serif` fallback face, mixed-typeface, until that pass runs. Accepted
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

## 3. Design decisions (mine, flag if wrong)

- **D6 - two string homes, split by who needs the text first.**
  1. **Client-bundled UI catalog** (`frontend/src/lang/en.ts` + `de.ts`):
     everything the client can need *before or without* a connection (account
     screens, HUD chrome, banners) **plus the wire-message templates** for
     C2/C3's keys - templates version with the client code that formats them.
  2. **Server-served content text**: the three catalogs serve per-locale
     payloads (`?lang=de`, marshal-once-per-locale, unknown locale → en), and a
     new **`/lang` bundle endpoint** serves the authored interaction text
     (conversation lines/options/replies/ambients) as a flat key→string map
     per locale (C3). English is extracted from the authored JSON at boot;
     German comes from the D3 overlay.
- **D7 - one placeholder + plural convention, no ICU library.** Named `{x}`
  placeholders everywhere (the authored `tracker`'s `{n}/{m}` and
  `plan-npc-hails.md`'s `{name}` are the precedents - one syntax, three
  surfaces). Pluralization by key variants (`key.one` / `key.other`) selected
  on a designated numeric arg, client-side, only where a message needs it.
  en/de both fit one/other; a future language with more forms adds variants,
  not machinery (KISS/YAGNI).
- **D8 - structured wire fields carry IDS, never display names.** Args are
  `[string]`; a value with a sigil prefix is a reference the client resolves
  from its localized catalogs (`@mob:34`, `@skill:147`, `@quest:wolves-on-
  the-road`), anything else is a literal (player names, digits). One rule
  covers objectives, lock reasons, unlock labels and announcement args - a
  bare English name in an arg is how en leaks into de journals (the survey's
  `ledger.go:542` `o.TargetName` is exactly this bug waiting).
- **D9 - the P21 dodge becomes the template-authoring RULE, both languages.**
  Templates place name references in **uninflected positions** ("Wolf: 3/8
  erlegt", not "3/8 Wölfe erlegt"), so a nominative-singular display name is
  always grammatical. Recorded escape hatch if a template cannot dodge:
  per-form name variants in the de sidecar (e.g. `name` + `namePlural`),
  additive later. Without this rule C2/C3's German pass discovers inflection
  mid-chunk.
- **D10 - `EntityMessage.key` is OPTIONAL; empty key = render `message`
  verbatim.** One rule covers player chat (never keyed), the en fallback, and
  old payloads. `message` keeps carrying the composed English as fallback
  during the transition; nobody makes `key` required.
- **D11 - switching language RELOADS the page.** The client boots once and has
  no teardown path (`plan-leaving-the-world.md` / backlog §52); live re-render
  of every text surface is a rebuild nobody asked for. localStorage is read
  before boot; the settings toggle writes it and reloads.
- **D12 - locale is PINNED EXPLICITLY everywhere automation or the PO looks.**
  Every harness leg sets the locale via localStorage before boot rather than
  trusting the default - ⚑ the PO's real browser is likely German-locale, so after C0
  `navigator.language` flips their manual checks to de, and harness Chromium
  inheriting the host locale would flip too (existing legs assert English
  strings, L5). Bonus: the de smoke leg is the same script with the other pin.
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
- **D15 - accounts errors localize by CODE.** The client maps
  `respond.go`'s machine codes to catalog keys and shows the server's English
  `error` string only as fallback. ⚑ `codeRule`'s message *names the violated
  rule* - those stay English-fallback until rule sub-codes exist (§8).

---

## 4. The chunks

### C0 - client i18n core + static UI strings (frontend-only, wire NONE)

- **`Locale.ts`**: resolve order localStorage → `navigator.language` prefix →
  `en`; `t(key, params)` with D7 interpolation + plural variants; catalogs
  `lang/en.ts` + `lang/de.ts` (typed, so a missing key is a tsc error where
  possible, plus the D13 vitest key-set pin).
- **The partial seam**: every HTML partial flows through
  `Preloading.renderPartial` (call sites like `HUD.ts:84`) - one post-inject
  pass resolves `data-i18n` (textContent) and `data-i18n-attr` (placeholder/
  title) attributes. Extract the ~160 user-facing sites: `HUD.html`,
  `accountScreens.html`, `startScreen.html`, `settings.partial.html`,
  `accountNag.html`, `endScreen.html`.
- **TS literal sweep** (~120 sites): `HUD.ts`, `CharacterSelect.ts`,
  `AuthForms.ts`, `AccountFlow.ts`/`AccountsApi.ts`, `Backend.ts:149`
  ("Connection lost"), `Journal.ts`, `Conversation.ts` ('Confirm', 'Leave.',
  `level ${n}`), `MiniMap.ts`, `Utilities.ts`, `Skills.ts:521-523`,
  `Player.ts` ('Level up!'), `DeleteDialog.ts`, `CharacterCreation.ts`,
  `RegistrationNag.ts`. **Excluded**: `SkillTooltip.ts` (C4), dev tools
  (out of scope).
- **Settings toggle** + D11 reload; **D15 accounts-error mapping**.
- **D12 sweep**: add the explicit en pin to every existing harness leg.
- German UI text authored with the chunk (text is the PO's, like all de text).

### C1 - per-locale content catalogs (backend + content, wire NONE)

- **`api/lang/de/`** sidecar tree (D3): one file per domain (`quests.json`,
  `mobs.json`, `skills.json`, `factions.json`), keyed by content id + field
  path (e.g. `{"wolves-on-the-road": {"title": "…", "stages": {"s1":
  {"journal": "…", "tracker": "…"}}}}`). ⚑ The new directory **must join
  `contentSources` in `cmd/aurad/loaders.go` AND the `cp-defs` target**, or
  every translation edit silently no-ops (the standing CLAUDE.md rule; the
  silent-no-op class).
- **Overlay loader**: refuses unknown ids/fields by name at boot (the
  DisallowUnknownFields discipline); missing keys fall back en at serve time
  (D13); the Go completeness test ships with it.
- **Catalog serving**: `CatalogJSON` takes a locale; handlers hold
  `map[locale][]byte` built at boot (marshal-once-per-locale) and read
  `?lang=`, unknown → en. Display names: en = `DeriveDisplayName` output,
  de = overlay.
- **Client**: catalog fetches pass the locale - ⚑ `catalogUrl` does
  `url.search = ''` (`Urls.ts`), so the lang param must be set *after* that
  line or it is silently stripped.
- Quest titles + journal prose render localized with **zero client logic
  change** (already catalog-resolved). German quest/name text authored with
  the chunk.

### C2 - wire keys+args: system messages + objectives (schema YES)

- **Schema, appended only** (both regens, L1): `EntityMessage` gains
  `key:string` + `args:[string]` (D10); `QuestProgress` gains a structured
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
  English `" and "`/`", "` name-list joiner at :230-242 becomes a client-side
  list template). Args follow D8 (ids + sigils; player names literal).
  Ambient/hail lines stay literal English `message` this chunk and move with
  the rest of the conversation content in C3.
- **Client formatter**: key → UI-catalog template, sigil-arg resolution
  against the localized catalogs, D14 readable degradation.

### C3 - the conversation surface (schema YES, content, the big one)

- **`/lang/{locale}` bundle endpoint** (D6): flat key→string map of all
  authored interaction text - `conv.<species>.<node>.line.<i>`,
  `….opt.<option_index>.text`, `….opt.<i>.reply`, `ambient.<variant>.<i>` -
  extracted from `api/mobs/*.json` at boot, de from the overlay,
  marshal-once-per-locale. **This is where D5's accepted leak lives.**
- **Wire**: the server stops filling `ConversationOption.text`/`reply` and
  `ConversationNode.lines` with prose the client can resolve by key (species +
  node id + authored `option_index` - all already on the wire). The composed
  `"%s - locked: %s"` (`interaction.go:1017/:1067`) is replaced by an appended
  structured lock-reason list (kind + args) mirroring `describeConditions`'s
  cases (`ascension_rows.go:340-400`), which itself turns structured;
  `travelClosedReason` (`interaction.go:1001`) and the `"an NPC"` fallback
  become keys. Runtime-synthesized ascension row text ("Spend this
  character…", `:130/:160/:279`) becomes UI-catalog keys + args. The panel
  header's `Conversation.actor_name` (`server.fbs:475`) is resolved
  client-side too - the conversant's entity type is in the snapshot via
  `entity_id`, so the localized mobs catalog answers, and the server-filled
  string becomes the fallback (otherwise German dialogue renders under an
  English NPC name).
- ⚑ **Entry gate**: verify `skill_id` is populated on every teach row - the
  D17 fallback ("the granted skill's display name") must be computed
  client-side from it once `text` stops carrying prose.
- **German dialogue pass**: the ~220 authored sentences + ambients into
  `api/lang/de/mobs.json`.
- Bonus, not a goal: the per-tick conversation tree (re-sent 30×/s while open,
  D16 contract preserved) shrinks - keys instead of prose.

### C4 - tooltips + the German polish pass (frontend + content)

- **`SkillTooltip.ts` rework**: per-locale template tables replace fragment
  assembly - category/stat labels, selector words, gate-key sentences, trigger
  clauses, cadence fragments, and the `verb + ' you'` capitalization logic
  (`:395`). ⚑ This visit is the chance to close the standing `TICKING_TYPES`
  watch item (hand-maintained set, silent failure) with a completeness pin.
- **German number formatting** decided here (decimal comma vs point; tooltips
  are where decimals actually appear).
- **The +30 % length sweep**: German runs ~30 % longer than English and nobody
  has measured the fixed-width HUD slots, conversation rows or tooltip widths
  against that; fixes are CSS.
- **Exit check**: a full German PO playthrough is this plan's in-game verdict.

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
  explicit en pin; none may rely on the browser default after C0.
- ⚑ **L6 - the lock-reason coupling is a durable tax of D1.** Every future
  `ConditionKind` costs a wire encoding + a client template + a de string,
  where today it costs one Go case. D14's degradation is the safety net, the
  Go-side test pinning kind-coverage (§6) is the guard.
- ⚑ **L7 - en leaking into de through args.** Any Go site that passes a
  *display name* instead of an id (D8) ships English into German clients with
  no error. `ledger.go:542`'s `o.TargetName` is the known instance; grep for
  name-typed args at review time in C2/C3.
- ⚑ **L8 - inflection (D9).** A German translation that inflects a `@mob` ref
  reads wrong the moment the template is reused for another species. The
  authoring rule is in D9; the escape hatch (per-form variants) is additive.
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
  arg. Whichever ships second reconciles; the shared `{x}` syntax (D7) is what
  makes that cheap. Same story for `plan-mob-voicelines.md`'s aggro lines.
- ⚑ **L13 - the leak philosophy comment goes stale in C2, not C3.**
  `quests/catalog.go:15` records "minimal projection" as deliberate, and C2's
  tracker-on-catalog addition is the first thing that violates it; C2 updates
  the comment to cite D5, or the next reader restores the old philosophy in
  good faith.

---

## 6. Test strategy

**Frontend (vitest):** `t()` interpolation, plural-variant selection, en
fallback on missing key, D14 readable degradation · en/de key-set equality pin
(D13) · sigil-arg resolution (`@mob`/`@skill`/`@quest` + literal passthrough) ·
`SkillTooltip` template output per locale (C4; the existing tooltip tests are
the en baseline).

**Go:** overlay loader refuses unknown ids/fields by name; missing-key
completeness test with named failures + allowlist (D13) · per-locale catalog
payloads: de overlay applied, unknown locale → en, byte-stable across
requests (marshal-once-per-locale) · structured objectives carry ids never
names (D8/L7 pin) · lock-reason kinds cover every `ConditionKind`
(L6 completeness pin) · `-count=1` after every content/lang edit (L3).

**Sim:** the full battery byte-identical - no gameplay number moves in any
chunk; TTK/TTD and the guardrails stand by construction.

**Harness (`.claude/skills/verify`):** existing legs green under the explicit
en pin (D12, swept in C0) · new `i18n-de.mjs`: boot with the de pin →
settings toggle shows German, journal renders a German title + objective,
a conversation renders German lines and a German locked row, an unlock banner
renders German with a resolved name ref · C4 adds a German tooltip leg.

**Boot:** `-content ../api` clean, 0 WARN / 0 ERROR, census unchanged
(105/61 at plan time).

**In-game:** per-chunk PO checklists note that the PO's own browser will
default to German after C0 (D12); C4's exit is the full German playthrough.

---

## 7. Effort + schema impact

| Chunk | Size | Schema |
| --- | --- | --- |
| C0 client core + UI strings | ~1 session; big but mechanical (~280 sites) + de UI text | DB NONE · wire NONE |
| C1 per-locale catalogs | ~1 session; loader + overlay + serving + de names/quests | DB NONE · wire NONE (HTTP param only) |
| C2 system messages + objectives | ~1 session; ~20 Go sites + 2 tables' appends + client formatter | DB NONE · **wire YES** (appended) |
| C3 conversation surface | ~1–1.5 sessions; bundle endpoint + lock reasons + ~220 de sentences | DB NONE · **wire YES** (appended) |
| C4 tooltips + polish | ~1 session; template rework + length sweep + PO playthrough | DB NONE · wire NONE |

Total new machinery is deliberately small: one client i18n module, one overlay
loader, one bundle endpoint, one formatter. The bulk is extraction and German
authoring (~600–700 translatable units, heuristic).

---

## 8. Open

- **Credits + changelog**: stay English (my default - the changelog is written
  per release in one language, credits are names) or join C0? PO call.
- **`codeRule` sub-codes** (D15): the validation-rule messages stay
  English-fallback until the accounts API names which rule machine-readably.
  Small, additive, unowned.
- **Hard vs allowlisted completeness at ship time** (D13): during the build an
  allowlist is pragmatic; before "German is supported" is announced, the
  allowlist should be empty or deliberate. PO call at C4.
- **Where this plan sits in the execution order** - unscheduled; it competes
  with the release map. ⚑ One sequencing note: every chunk of new content
  authored before C1 adds to the de backlog, so "before the release map's
  content pass" is materially cheaper than after.
- **`plan-ui-font.md` inherits a hard requirement** (D4): the future face must
  cover the shipped locales' scripts (de: Latin + umlauts + ß) - recorded here
  so the font pass reads it before picking.
- D6–D15 are my calls, not rulings. The two worth a second look: D9 (the
  uninflected-template rule shapes how all German text is written) and D11
  (reload-on-switch, which backlog §52's teardown work would later soften for
  free).
