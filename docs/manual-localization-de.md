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

## 4. Names

- **Personal names stay**: Hendrik, Eliza, Brunnstedt-born names.
- **Role and species names translate**: Farmer → Bauer, Wolf → Wolf,
  Boar → Keiler, Village Healer → Dorfheilerin/Dorfheiler (pick the NPC's
  sex from the content; when unknown, "Heilkundige" is avoided, ask the PO).
- **Region names** (PO, Q5): descriptive ones translate ("Saltgrass Strand"
  → "Salzgrasstrand"), coined ones stay ("Brunnstedt", "Wrecker's Bluff" →
  "Strandräuberklippe" only if descriptive; decided name by name in
  `api/lang/de/regions.arb`, the glossary of record for place names).
- Mob names carry `name` + `namePlural` wherever a kill or harvest
  objective names them (Q2); the plural is a real German plural ("Wölfe",
  "Keiler", "Rüben").
- Player-authored character names are never translated.

## 5. Grammar the templates cannot do

A shared template only ever uses the forms a name carries (`name`,
`namePlural`). Anything that needs an article, a case or a preposition
("mit der Stadtwache sprechen", "nach Brunnstedt gehen") is an authored
per-objective `tracker` (L8).

## 6. Workflow

- English is authored in `api/` JSON; `api/lang/en/` is generated (never
  edit it, L15). German goes in `api/lang/de/<domain>.arb` (content) and
  `frontend/src/lang/de.arb` (UI).
- After checking German against its English, refresh the translated-from
  records (D20): `UPDATE_LANG_SOURCE=1 npx vitest run src/lang` (UI) and
  `UPDATE_LANG=1 go test -count=1 ./pkg/aura/lang/` (content).
- After launch, an English edit carries its German in the same change (D23).
