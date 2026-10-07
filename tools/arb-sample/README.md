# ARB sample - an editor trial kit

A throwaway sample for trying translation editors against the format
`docs/plan-localization.md` rules (D16-D19: ICU MessageFormat in ARB files,
notes required). Not loaded by the game. Delete it once an editor is chosen.

- `app_en.arb`: the English **source**, with notes on every key and
  placeholder (D18). Real game text where possible.
- `app_de.arb`: the German **target**, key → string only. One key is
  deliberately missing.
- `l10n.yaml`: a Flutter-style marker some editors use to find the source
  file.

Before trying an editor, copy the folder (or commit it) so you can diff what
the editor wrote against the original.

## What to check in each editor

| # | Check | Keys involved |
| --- | --- | --- |
| 1 | Does it open en as the source and de as the translation, side by side? | all |
| 2 | Does it show the **description** and the **placeholder examples** while you translate? | `quest.objective.kill`, `quest.wolves-on-the-road.thin.tracker` |
| 3 | **Key style** (the open item in plan §8): are dotted, hyphenated keys accepted and saved unchanged, the same as the identifier-style twin? | `quest.wolves-on-the-road.title` vs `questWolvesOnTheRoadTitle` |
| 4 | **Plural**: does it give a separate input per German plural form (`=0` / `one` / `other`), or one raw text box? | `hud.skillPoints` |
| 5 | Is the **missing** German key shown as untranslated? | `conv.reinhard.turnips.line.1` |
| 6 | **Placeholder check**: change `{n}` to `{x}` in the German tracker. Does it warn? | `quest.wolves-on-the-road.thin.tracker` |
| 7 | **Escaping**: does `'{'this'}'` stay intact, or does the editor flag it or rewrite it? | `test.escaping` |
| 8 | **Round trip**: save without changes, then diff. Are key order, `@@locale`, the notes in en, the umlauts and the `–`/`—` dashes preserved? | all |

Round-trip diff, from the repo root:

```bash
git diff --no-index <your-copy>/app_de.arb tools/arb-sample/app_de.arb
```
