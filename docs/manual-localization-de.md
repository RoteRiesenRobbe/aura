# Manual - German style guide + glossary

The rules every German string follows (plan-localization.md D22), written
before the first German string so text drafted across sessions, and by AI,
does not drift. The PO reviews all German text; this file is the yardstick.

## 1. Address and tone

- **du**, always (PO, Q5). Capitalised only where German capitalises it
  anyway: "du", "dein", "dir" in running text, never "Du"/"Dein".
- NPCs talk like people in a village, not like a manual: short sentences,
  contractions where natural ("Hast du's?", "Geht's dir gut?").
- **Gender-neutral address of the player.** There is no player-gender
  argument, so never write a form that assumes one: no "Du bist ein wahrer
  Held", write "Du hast Mut bewiesen" / "Gut gemacht". Avoid participles and
  nouns that inflect for the player's gender.
- UI buttons are infinitives or imperatives without "bitte" ("Speichern",
  "Verlassen", "Konto erstellen").

## 2. Typography

- Quotes „…“ (U+201E/U+201C), apostrophe ’ (U+2019), dash – (U+2013) with
  spaces. ⚑ `stone-age` has none of these (D4/L9): they render in the
  fallback face until `plan-ui-font.md` runs. Accepted.
- Numbers never by hand: every number is an ICU `{x, number}` or plural
  argument (D16), so "1.500" and "12,5" come from `Intl`.
- Percent and units with a narrow space as `Intl` writes them ("30 %",
  "1,5 s").
- Files are UTF-8 without BOM (L17). On Windows, never `Set-Content` without
  `-Encoding utf8`.

## 3. Glossary - fixed terms

| English | German | Note |
| --- | --- | --- |
| Aura | Aura (pl. Auren) | the core mechanic, never "Feld" |
| active aura | aktive Aura | |
| passive | Passive (pl. Passive) | "passive Fähigkeit" in prose |
| cooldown (ability) | Abklingfähigkeit; the timer: Abklingzeit | |
| skill | Fertigkeit | ⛔ never "Fähigkeit" for the game term |
| skill point | Fertigkeitspunkt | |
| spellbook | Zauberbuch | |
| level | Stufe | "Stufe 5", "Stufenaufstieg!" |
| level up! | Stufe aufgestiegen! | |
| XP / experience | EP / Erfahrung | |
| resource (the one bar) | Kraft | HP and mana at once |
| elite / boss | Elite / Boss | |
| quest | Auftrag (pl. Aufträge) | |
| journal | Tagebuch | |
| campfire | Lagerfeuer | |
| recall | Rückkehr | |
| map | Karte | |
| character | Figur | "Figur erstellen" |
| account | Konto | |
| sign in / log in | anmelden | |
| register / create account | Konto erstellen | |
| death / you died | Tod / Du bist gestorben | |
| stun / slow | Betäubung / Verlangsamung | |
| threat | Bedrohung | |
| damage | Schaden | |
| heal | Heilung / heilen | |
| ascension | Aufstieg | the character-sacrifice loop |
| bloodline | Blutlinie | |
| memorial | Gedenkstein | |
| stranger (an NPC addressing the player) | Fremder | PO 2026-10-14; a deliberate exception to §1's gender-neutral rule, never "Fremdling" |

## 4. Names

- **Personal names stay**: Hendrik, Eliza, Brunnstedt-born names.
- **Role and species names translate**: Farmer → Bauer, Wolf → Wolf,
  Boar → Keiler, Village Healer → Dorfheilerin/Dorfheiler (pick the NPC's
  sex from the content; when unknown, "Heilkundige" is avoided, ask the PO).
- **Region names** (PO, Q5): descriptive ones translate ("Saltgrass Strand"
  → "Salzgrasstrand"), coined ones stay ("Brunnstedt", "Wrecker's Bluff" →
  "Strandräuberklippe" only if descriptive; decided name by name in
  `api/lang/de/regions.arb`, the glossary of record for place names).
- A mob a kill or harvest objective counts carries its plural INSIDE its
  name (D24): `{count, plural, one {Wolf} other {Wölfe}}`. The plural is a
  real German plural ("Wölfe", "Keiler", "Rüben"); German needs only `one`
  and `other`. A mob nobody counts stays plain text.
- Some names have a length limit (D30, in the key's English note and its
  `x-maxLength`): mob names 26 characters, skill names 30, quest titles 30,
  region titles 24 [PLACEHOLDER]s. German is held to the same limit; the
  completeness test names a German text that is over it.
- Player-authored character names are never translated.

## 5. Grammar the templates cannot do

A shared template only ever uses the forms a name carries (its plural forms,
D24). Anything that needs an article, a case or a preposition
("mit der Stadtwache sprechen", "nach Brunnstedt gehen") is an authored
per-objective `tracker` (L8). A UI template that inserts a name says so in
its note (D31); German keeps the name nominative and words the line around it
("Fallen gelassen von: {mob}"), and a later language that would inflect the name
phrases the line as a label.

## 6. Workflow

- English is authored in `api/lang/en/<domain>.arb` (D27, C5a): the content
  editor writes it, or a hand edit drafts text inline in the content JSON and
  runs `node tools/lang/extract-english.mjs`. German goes in
  `api/lang/de/<domain>.arb` (content) and `frontend/src/lang/de/frontend.arb` (UI),
  under the same dotted keys (D29).
- A dialogue line's key carries its NPC and a frozen slug
  (`conv.Farmer.fields-need-work`); a shared phrase (`stock.quest-accept`) is
  ONE German line for every NPC that says it (D28). An NPC that should say it
  differently gets its own line, with its own German.
- After checking German against its English, refresh the translated-from
  records (D20): `UPDATE_LANG_SOURCE=1 npx vitest run src/lang` (UI) and
  `cd backend && UPDATE_LANG=1 go test -count=1 -run TestLang ./cmd/aurad/`
  (content). The content editor shows what is owed after every save
  ("German owed", `aurad -lang-status`).
- After launch, an English edit carries its German in the same change (D23).
  There is no allowlist (removed 2026-10-14): German that cannot land with its
  English leaves the German pin red until it does.
