# Aura — Game Design Document

**Version:** 0.8
**Status:** Living document
**Letzte Aktualisierung:** Planungssession 6 (Targeting & Line-of-Sight)

---

## 1. Vision & Pitch

**Tagline:** MMO lite — Resource vs. Resource, so simplified as possible.

**Kernprinzip:** Spieler und NPCs interagieren ausschließlich über **Auren** — kreisförmige Effektfelder. **Kein manuelles Zielen:** jede Aura wählt ihre Ziele selbst, nach einer festen, pro Aura definierten Regel (Default: das nächste gültige Ziel in Reichweite). Positionierung und Cooldown-/Wechsel-Timing sind die einzigen Skill-Ausdrucksformen — *wer* getroffen wird, steuert man über die eigene Position.

**Inspiration:**
- WoW Classic — Progression, Worldbuilding, Environmental Storytelling, langsame Steigerung im Ton
- Gothic 1 & 2 — Low-Poly Look, dichte organische Welt
- Hotline Miami / Monaco / Rimworld — Top-Down Art Direction (nicht isometrisch, nicht Pixel Art)

**Plattform:** Browser-basiert.

---

## 2. Core Loop

1. Spieler bewegt sich durch eine persistente shared Open World
2. Trifft auf Mobs / andere Spieler — eigene Aura wählt automatisch nach ihrer Regel Ziele in Reichweite und tickt auf sie
3. Schaden, Heilung, Buffs entstehen durch Auren-Overlap; Cooldown-Abilities modifizieren temporär
4. Kampf endet → XP für alle Beteiligten → ggf. Aura-Unlock
5. Level-Up → Skill-Punkte → bestehende Auren stärken oder Kombinationen freischalten
6. Welt erkunden → Hinweise finden → neue Auren / Passives / Cooldowns freischalten
7. Slots neu belegen, Build anpassen, schwierigere Inhalte angehen

Alles dreht sich um die Resource (Sektion 3) und die Auren (Sektion 4).

---

## 3. Resource

Jeder Spieler und jeder NPC hat genau **eine Resource**. Sie repräsentiert HP, Mana und alles andere gleichzeitig. Fällt sie auf 0 → Tod.

### Verbrauch
- Schaden durch Gegner-Auren reduziert die Resource
- Eigene Heilauren auf andere Spieler kosten regelmäßig Resource
- Mächtigere Auren kosten mehr Resource pro Tick

### Regeneration
- Langsame passive Regeneration außerhalb von Kämpfen
- Durch eigene Cooldown-Abilities
- Durch Heilauren anderer Spieler
- Durch Campfires (Environmental)

### Tod
Bei Resource = 0:
- **Respawn** am zuletzt besuchten Lagerfeuer
- **XP-Verlust** des aktuellen Levels (zurück auf 0 XP innerhalb des aktuellen Levels — kein Level-Down)
- Kein Hardcore-Death, kein Gear-Loss

Da Tod denselben Effekt auf den XP-Fortschritt hat wie ein Respec, kann nach dem Tod direkt kostenfrei umgeskillt werden (siehe Sektion 5).

---

## 4. Auren

### Definition

Eine Aura ist ein kreisförmiges Effektfeld um einen Spieler oder NPC. Der Kreis ist die **Reichweite**, aus der die Aura ihre Ziele schlägt — nicht zwingend eine Trefferzone für alles darin. **Line-of-Sight-basiert** — Auren gehen nicht durch Wände oder große Umgebungsobjekte (Occluder sind kuratiert, siehe Tech-Dokument).

```
       . . . . .
     .           .
    .   M         .          P  = Spieler (Caster)
    .       ###   .          M  = nächstes gültiges Ziel → wird getroffen
    .   P   ###   .          M2 = Mob hinter Wand        → safe (LoS blockt)
    .       ###   .          M3 = Mob außerhalb          → safe (zu weit)
    .         M2  .          ### = Wand
     .           .
       . . . . .       M3
```

### Targeting

Jede Aura hat einen **Selector** (nach welcher Regel Ziele gewählt werden) und eine **Zielanzahl** — beides pro Aura festgelegt, als Daten, nicht als Code.

- **Default-Selector für alles (Damage und Heal): nearest** — das nächstgelegene gültige Ziel. Positionierung steuert damit direkt, wer getroffen bzw. geheilt wird: ein Schritt Richtung Boss = triff den Boss.
- **lowest_health** (spezielle Auren): das prozentual am stärksten verwundete Ziel — niedrigste aktuelle Resource *relativ zur Max-Resource*, nicht absolut. Damit trifft/heilt es den relativ Angeschlagensten statt in gemischten Kämpfen immer den Add mit kleiner Max-Resource.
- **Zielanzahl:** Basis-Auren treffen wenige Ziele (Startwert 1 [PLACEHOLDER]). Mehr Ziele gibt es über Level-ups (pro Aura definiert) oder als eigene Unlocks. Auren, die *alle* Ziele in Reichweite treffen, sind späte Unlocks.
- **Auswahl-Pipeline:** Reichweite filtern → Line-of-Sight filtern → nach Selector sortieren → die ersten N nehmen.

Heilauren heilen andere Spieler, **nie den Caster**. Selbstheilung ist konzeptionell ein Cooldown (siehe Anhang A, Heilmagie-Cooldown).

### Slot-System

Spieler haben drei Slot-Kategorien, alle wachsen mit Level:

- **Aktiv-Slots** — Auren die man aktiv wechseln und einsetzen kann (~4 initial, Tastatur 1–4)
- **Passiv-Slots** — dauerhaft wirkende Effekte
- **Cooldown-Slots** — aktive Abilities mit Cooldown, separate Buttons (Q, E, ...)

Alle Slots zusammen bilden den **Build**. Man kann mehr Auren im Zauberbuch haben als Slots — man wählt aktiv aus.

```
  ZAUBERBUCH (alles gefunden)            BUILD (aktiv ausgewählt)
  +-----------------------+              +-----------------------+
  | Damage Aura     Lv 4  |              | Aktiv-Slots:          |
  | Heal Aura       Lv 2  |   ------>    |   [1] Damage Aura     |
  | Tank Aura       Lv 1  |              |   [2] Heal Aura       |
  | Speed Aura      Lv 3  |              |   [3] Licht           |
  | Licht           Lv 1  |              |   [4] —               |
  | Fackel (Pass.)  Lv 2  |              |                       |
  | Schnell (Pass.) Lv 5  |              | Passiv-Slots:         |
  | Attack (CD)     Lv 3  |              |   - Schnell           |
  | Flee   (CD)     Lv 1  |              |                       |
  | ...                   |              | Cooldown-Slots:       |
  +-----------------------+              |   [Q] Attack          |
                                         |   [E] Flee            |
                                         +-----------------------+
```

### Aura-Verhalten

- Immer genau **eine** Aktiv-Aura aktiv, mid-fight wechselbar
- **Schaden und Heilung:** tick-basiert (Intervall variiert je Aura), Ziel-Wahl per Selector + Zielanzahl (siehe Targeting)
- **Buffs/Debuffs** (Tank, Speed, ...): konstant, nicht tick-basiert

### Basis-Auren

Einfache Einzeleffekt-Auren. Beispiele: Damage, Heal, Tank (Damage Reduction), Speed, Cooldown Reduction, XP-Boost, Revive, Campfire-Build, Licht.

Jede Basis-Aura wird separat mit Skill-Punkten gelevelt. **Was ein Level-up verbessert, ist pro Aura individuell festgelegt** — mehr Schaden/Heilung, größere Reichweite, mehr Ziele, schnellere Tick-Rate; auch mehrere Achsen zugleich sind möglich. *Balance-Notiz für den Content-Pass: „mehr Ziele × mehr Schaden pro Ziel" auf derselben Aura ist der gefährlichste Multiplikator — bewusst einsetzen.*

> Vollständige Liste der Basis-Auren noch TBD. Siehe Anhang A für gesammelte Spell-Ideen.

### Kombinationen

Bestimmte Kombinationen aus freigeschalteten Auren, Passives und Cooldowns — jeweils auf bestimmten Leveln — schalten neue Auren, Passives oder Cooldowns frei.

Drei wichtige Eigenschaften:

- **Kategorien-übergreifend:** Eine Kombination kann beliebig Auren, Passives und Cooldowns mischen.
- **Beliebige Level:** Komponenten können auf unterschiedlichen Leveln verlangt sein — eine Aura auf Level 7 kombiniert mit einem Passive auf Level 3.
- **Beliebige Unlock-Art:** Das Ergebnis kann eine neue Aura, ein neuer Passive oder ein neuer Cooldown sein — unabhängig von den Komponenten.

**Beispiele:**

- Damage(5) + Heal(5) → "Damage+Heal" Aura
- Schnell-Passive(3) + Heal-Aura(7) → neue Aura
- Feuer-Schlag-Aura(8) + Eis-Aura(2) → neuer Cooldown
- Feuer-Schlag-Aura(5) + Feuer-Schild-Cooldown(5) + Schnell-Passive(5) → Pyromancer-Aura

Kombinationen können auch andere Kombinations-Unlocks als Zutaten haben (wenige, manuell designed).

Kombinations-Rezepte sind **fest und kuratiert** — nicht algorithmisch. Sie stehen nirgendwo im Spiel dokumentiert; Spieler experimentieren und teilen die Funde online. Alle Unlocks aus Kombinationen werden separat gelevelt.

### Cooldown-Abilities

Modifizieren temporär den nächsten Tick oder die aktive Aura. Beispiele:
- **Attack:** Nächster Tick 2× Schaden. CD 10s
- **Flee:** Radius −80%, Speed +80%. CD 60s
- **Ultimate:** Massiver Einzel-Burst, stark reduzierter Radius. CD 60min

### Schadenstypen

Schadenstypen ermöglichen thematische Kombi-Auren und interessante Mob-Resistances. Mobs haben Resistances gegen bestimmte Typen und machen selbst Schaden eines bestimmten Typs. Beispiel: eine Feuer-Schlag-Aura macht Feuer-Schaden, gegen den Feuer-resistente Mobs weniger anfällig sind.

Konkrete Typen TBD — Feuer, Eis, Physisch als Ausgangspunkt.

### Visuelle Darstellung

Kreise die sich im Uhrzeigersinn füllen, Tick wenn voll. Der Kreis liest sich als **Reichweiten-Indikator**, nicht als Trefferzone: pro Tick zeigt ein **Hit-Effekt auf dem tatsächlich getroffenen Ziel**, wen die Aura schlägt — bei langsam tickenden Auren z.B. ein Schwert-Slash über dem Ziel, bei schnell tickenden (Feuer) ein konstanter Effekt auf dem Ziel. So bleibt Single-/Wenig-Target im großen Kreis intuitiv lesbar.

*Deferred:* Sticky-Targeting gegen Ziel-Zappeln bei nearest (Ziel behalten bis es stirbt oder die Reichweite verlässt) — erst bauen, wenn das Zappeln real stört. Overlaps mehrerer Spieler-Auren visuell noch zu lösen.

---

## 5. Progression

### Level & XP

- Start bei Level 1 in der Startzone
- XP für alle Beteiligten am Kampf (Schaden, Heilung, Buff)
- Niedrig-Level-Mobs geben ab einem Abstand keine XP mehr
- Höheres Mob-Level → mehr XP
- Jedes Level: mehr Slots, mehr Skill-Punkte

### Milestone-Unlocks

Bei bestimmten Levels garantierte Unlocks. Entwurf:

| Level | Unlock |
|---|---|
| 1 | Damage Aura |
| 2 | Heal Aura |
| 3 | Tank Aura |
| 4 | Cooldown-Ability (erste) |
| 5 | Erster Skill-Punkt |
| 5+ | Skill-Punkte bei Level-Up |

### Skill-System

- Skill-Punkte bei jedem Level-Up (ca. 30 bei Maxlevel — Balancing TBD)
- Punkte investierbar in jede freigeschaltete Aura, jeden Passive, jeden Cooldown
- Nur skillbar was bereits gefunden ist — neue Unlocks starten auf Level 1
- Was ein Level-up konkret verbessert (Schaden/Heilung, Reichweite, Zielanzahl, Tick-Rate), ist pro Aura definiert (siehe Sektion 4)
- Bestimmte Level-Kombinationen freigeschalteter Auren/Passives/Cooldowns schalten neue Inhalte frei (siehe Sektion 4)
- Kein fester Klassenweg

### Respec

Möglich. **Kosten:** der gesamte aktuelle Level-Fortschritt (XP des aktuellen Levels zurück auf 0).

Da der Tod denselben Effekt hat, kann man nach dem Tod direkt kostenfrei umskillen.

### Meta-Progression: Character-Opfer

Einen Max-Level-Char "opfern" (Lore: Opfern vs. Fortschicken à la Arc Raiders, noch offen) schaltet **account-weit permanent** frei:

- Neue Basis-Auren (z.B. Speed-Aura)
- Einzigartige Auren/Effekte die sonst nicht erhältlich sind
- Kosmetische Unlocks (Avatar-Portraits)

Neue Chars profitieren von allen bisherigen Opfern.

---

## 6. Zauberbuch & Unlocks

Das **Zauberbuch** ist die Sammlung aller Auren, Passives und Cooldowns die ein Spieler gefunden hat. Daraus wählt man den aktiven Build.

Es gibt fünf Wege an neue Einträge zu kommen:

1. **Milestone-Unlocks** — Garantiert bei bestimmten Levels (siehe Sektion 5)
2. **Monster-Kill-Unlocks** — Bestimmte (nicht alle) Gegner droppen beim Tod Auren oder Passives
3. **Welt-Entdeckung** — Über Hinweis-Ankerpunkte in der Welt (siehe Sektion 7)
4. **NPC-Teaching** — Friedliche NPCs lehren beim Annähern eine spezifische Aura. Oft thematisch verknüpft mit Mobs in der Nähe die nur durch genau diese Aura schädigbar sind (siehe Sektion 8 → Ernte-Mobs)
5. **Meta-Progression** — Character-Opfer schalten account-weit neue Basis-Auren frei (siehe Sektion 5)

---

## 7. Spielwelt

### Welt-Design

Persistente shared Open World, mehrere verbundene Zonen für unterschiedliche Level-Bereiche. Inspiration WoW Classic: langsame Steigerung in Ton, Schwierigkeit und Story-Gewicht — vom kleinen Dulli im Wald zu Drachen und Untoten erst sehr spät.

Welt wird vom Designer skizziert und manuell umgesetzt — nicht algorithmisch generiert. Environmental Storytelling zentral.

### Zonen

Jede Zone hat:
- Eigenen Area-Chat (nur für Spieler in dieser Zone)
- Eigenes Terrain: Gras, Wüste, Spinnweben, Lavaerde, etc.
- Eigene Dekoration, Mobs, Geometrie (Höhlen, Flüsse, offene Flächen)
- Eigene Sounds / Soundtrack (angestrebt)

### Open-World-Dungeons

Keine Instanzen. WoW-Classic-Style Höhlen in der offenen Welt. Spieler kennen sie und kehren gemeinsam zurück.

### Dunkelheit & Licht

Bestimmte Gebiete (Höhlen, Tunnel zwischen Zonen) sind dunkel — Sichtfeld stark eingeschränkt, ähnlich wie Höhlen in älteren Top-Down-Spielen. Der Tunnel zwischen Zone 1 und Zone 2 ist der erste solche Bereich und dient als natürliches Tutorial für das Rollen-Konzept.

**Beschlossen: Dunkelheit ist rein visuell.** Sie schränkt die Sicht ein, hat aber keine Auswirkungen auf Schaden, Trefferchance oder Aura-Verhalten — im Dunkeln *kann* man getroffen werden, man *sieht* nur schlecht. Der Wert der Licht-Rolle ist Sicht für die Gruppe (positionieren, ausweichen, Ziele erkennen).

Lösungen für Dunkelheit:
- **Licht-Aura** (Aktiv, früh erhältlich) — erzwingt Trade-off: Licht oder Schaden. Kann auf andere gerichtet werden (Support-Licht).
- **Fackel-Passive** (später freischaltbar) — dauerhaftes Licht ohne Aktiv-Slot zu blockieren.

Siehe Anhang A.

### Welt-Entdeckungs-Hinweise

Jede Zone hat 1–n **Hinweis-Ankerpunkte** die auf versteckte Belohnungen zeigen — immer obfuscated, kein Quest-Marker-Feeling.

Hinweis-Typen:
- Schilder / Inschriften (*"Weg des Kriegers"*)
- NPC-Dialog (*"Da hinten sind Trolle die viel über Heilmagie verstehen"*)
- Umgebungs-Details (Altar, Symbol, Geräusch)

**Belohnungen** sind ausschließlich: Aktives, Passives, Cooldowns, XP. Kein Loot, keine Items.

Hinweis-Sprache und Belohnung müssen im Nachhinein logisch zusammenpassen — nicht offensichtlich, aber nachvollziehbar. Kein Quest-Log, kein Marker.

```
   Schild im Wald                NPC im Dorf
   +-----------+                 "Da hinten sind Trolle,
   | Weg des   |                  die viel über Heilmagie
   | Kriegers  |                  verstehen..."
   +-----+-----+                       |
         |                              |
         v                              v
   kurzer Dungeon                Troll-Gebiet
         |                              |
         v                              v
   DPS-Aura unlock              Heilmagie-Cooldown unlock
```

### Special Events

Endgame-Boss-Kill löst einmaliges Welt-Event aus. Beispiel: Pfütze spawnt, 10 Sekunden drinstehen = seltene Aura unlock, danach weg. Kann "gestohlen" werden.

---

## 8. NPCs & Mobs

- Feste Spawn-Punkte, designte Welt (kein procedural)
- Patrollierende Mobs mit Max-Chase-Distanz
- Mobs haben eigene Auren — Line-of-Sight und Targeting-Regeln gelten auch für sie
- Mobs haben Resistances und einen eigenen Schadens-Typ (siehe Sektion 4)
- Keine Item-Drops — nur XP und gelegentlich Aura-Unlocks

### Mob-Typen

| Typ | Beschreibung |
|---|---|
| Normal | Solo machbar für Level-appropriaten Spieler |
| Elite | Für Gruppen, mehr XP |
| Boss | Starke Elite in besonderen Orten |
| Endgame Boss | Raid-Level, löst Special Event aus |
| Ernte-Mob | Stationär, friedlich oder passiv. Nur durch eine spezifische Aura schädigbar (oft via NPC-Teaching gelernt, siehe Sektion 6). Gibt viel XP, langsamer Respawn. Beispiel: Rüben auf einem Bauernhof-Feld, die nur die "Rüben-Ziehen"-Aura schädigt. |

### Quest-artige Inhalte über bestehende Systeme

Aura + Mob-Resistance + NPC-Teaching ergibt zusammen ein implizites Quest-System ohne dass ein dediziertes Quest-System nötig ist. Schema:

```
  Friedlicher NPC  ───── lehrt ─────►  Spezifische Aura
        │                                     │
        │ steht thematisch                    │ ist einzige Quelle
        │ in der Nähe von                     │ von Schaden gegen
        ▼                                     ▼
   Ernte-Mob-Population  ◄── nur damit zu ernten ──┘
   (gibt viel XP)
```

Beispiele für mögliche Varianten:
- Bauer + Rüben-Ziehen-Aura + Rüben-Feld
- Fischer + Angel-Aura + Fische im See
- Holzfäller + Holz-Hau-Aura + Bäume
- Bergmann + Schürf-Aura + Erz-Adern

Effekt: Weiche "Berufs"-Identität ohne Klassen-System, plus Anreiz die Welt zu erkunden um spezielle NPCs zu finden.

---

## 9. Multiplayer & Kooperation

- Persistente shared Welt — alles sichtbar, alles geteilt
- Keine formalen Gruppen in v1 — jeder am Kampf Beteiligte kriegt XP
- Kein PvP initial (frühestens nach 5 Jahren)
- Kein Griefing möglich by design

### Rollen-Design

**Spieler gleichen gegenseitig Lücken aus und füllen Rollen — das ist für alle größeren Challenges essenziell, nicht optional.** Das Slot-System zwingt Spezialisierung; Kooperation füllt die Lücken.

Beispiele:
- Licht-Support im Tunnel — ein Spieler trägt Licht-Aura, andere Damage
- Heal-Support beim Boss — klassischer Tank/DD/Heal-Tanz
- Speed-Buff während Flucht — siehe "Fly, You Fools!" in Anhang A

---

## 10. Art Direction & UI

### Art Direction
- **No Pixel Art**
- **Fully Top-Down** — exakt von oben, nicht 2,5D, nicht isometrisch
- Low-Poly mit Icons für Abilities, Portraits für Spieler/NPCs
- Referenzen: Hotline Miami, Gods Trigger, Monaco, Rimworld, Gothic 1+2
- System first, not presentation first

### UI-Elemente (v1.0)
- Resource-Bar
- XP-Bar
- Ability-Leiste (Aktiv-Slots 1–4, Cooldowns Q/E/...)
- Aura-Panel (aktuell gewählter Build aus Zauberbuch)
- Minimap
- Zone-Chat

```
  +-------------------------------------------------------+
  | Zone: Whispering Wood                    +---------+  |
  |                                          | Minimap |  |
  |                                          |   . P   |  |
  |              .  M  o                     |    .    |  |
  |             [P]                          +---------+  |
  |              ~~                                       |
  |                                                       |
  |                                                       |
  |  Resource [============              ]                |
  |  XP       [===                       ]                |
  |                                          +----------+ |
  |  [1][2][3][4]    Q   E                   | Chat ... | |
  +-------------------------------------------------------+
       Aktiv-Slots   Cooldowns
```

### Bewegungssteuerung
Maus oder WASD — noch offen.

---

## 11. Scope v1.0

**Muss drin:**
- [ ] Accounts (Register/Login)
- [ ] Aura-System (Basis-Auren, Cooldowns, erste Kombis, Targeting: Selector + Zielanzahl)
- [ ] Zauberbuch mit Milestone- und Monster-Unlocks
- [ ] Progression (Level, Skill-System, Slots)
- [ ] Persistente Welt
- [ ] 2–3 Zonen
- [ ] Mob-Typen: Normal, Elite, Boss
- [ ] UI: Resource-Bar, XP-Bar, Ability-Leiste, Aura-Panel, Minimap, Zone-Chat
- [ ] Line-of-Sight für Auren
- [ ] Campfire

**Nicht in v1.0:**
PvP, formales Gruppen-System, Economy, Mobile, Endgame-Raid-Events, Character-Opfer (nice to have)

---

## 12. Offene Design-Fragen

*(Technische Fragen siehe separates Tech-Dokument.)*

### Mechanik
- [ ] Name der Resource (Essence / Focus / Power?)
- [ ] Genaue Slot-Anzahl pro Kategorie und Wachstum per Level
- [ ] Sind Passiv- und Cooldown-Slots dasselbe?
- [ ] Skill-Punkte pro Level final (aktuell ~30 bei Maxlevel angedacht)
- [ ] Max-Level konkret
- [x] ~~Trifft jede Aura alle in Reichweite?~~ → **Beschlossen:** Selector + Zielanzahl pro Aura; Default nearest, Basis-Auren gecappt; AoE-alle als später Unlock (siehe Sektion 4, Targeting)
- [x] ~~lowest-HP absolut oder prozentual?~~ → **Beschlossen:** prozentual (relativ zur Max-Resource)

### Welt & Inhalte
- [ ] Welche Basis-Auren gibt es konkret (vollständige Liste)
- [ ] Pro Aura: Selector, Start-Zielanzahl und Level-up-Achsen festlegen (Content-Pass)
- [ ] Feste Kombinations-Rezepte ausarbeiten
- [ ] Schadenstypen definieren (Feuer, Eis, Physisch, ...)

### Steuerung & UI
- [ ] Bewegungssteuerung: Maus oder WASD?
- [ ] Aura-Visualisierung bei Overlaps

### Meta
- [ ] Saisonal vs. Permanent-Server?
- [ ] Lore: Opfern vs. Fortschicken?

---

## Anhang A — Spell / Aura / Cooldown Ideen (Sammlung)

Unsortierte Ideen-Liste, gruppiert nach Kategorie. Noch nicht final — zum Experimentieren und Iterieren.

### A.1 Aktive Auren

| Name | Effekt | Notiz |
|---|---|---|
| Fly, You Fools! | Erhöht Movespeed aller Verbündeten im Radius. Caster wird nicht gebufft / bleibt zurück. | LotR-Ref, Risk/Reward für Support |
| Purple Rain | Färbt alle im Umkreis lila. Kein Kampf-Nutzen. | Reines Flavor/Meme |
| Licht | Erzeugt Licht in dunklen Gebieten. Kann auf andere gerichtet werden (Support-Licht). | Frühes Spiel, Zone 1 → 2, kein Kampfeffekt |
| Feuer-Schlag | Feuer-Schaden auf das lowest_health-Target (prozentual) im Umkreis. | Komponente Pyromancer-Kombi, Beispiel für lowest_health-Selector |
| Long Range Execute *(Arbeitsname)* | Sehr großer Radius, sehr langsamer Tick, hoher Schaden auf das prozentual niedrigste Ziel. **Hartes Single-Target-Cap** — trifft nie mehrere Ziele, egal welches Level. | Beispiel für per-Aura-Selector + festes Cap |
| Rüben-Ziehen | Schädigt ausschließlich Rüben-Mobs auf einem Feld. Keine Wirkung auf andere Mobs. | NPC-Teaching (Bauer), Ernte-Mob-Beispiel |

### A.2 Passives

| Name | Effekt | Notiz |
|---|---|---|
| Fackel | Dauerhaftes Licht um den Caster. | Löst Licht-Trade-off, Zone 2+ |
| Schnell | +5% Movespeed. | Komponente Pyromancer-Kombi |

### A.3 Cooldowns

| Name | Effekt | Notiz |
|---|---|---|
| Feuer-Schild | 30s lang reflektiert 20% des eingehenden Schadens. | Komponente Pyromancer-Kombi |
| Heilmagie-Cooldown *(Arbeitsname)* | Stellt eigene Resource wieder her. | Reward aus Troll-Gebiet (Hinweis-Ankerpunkt); **einziger Weg zur Selbstheilung** — Heilauren heilen nie den Caster |

### A.4 Kombinations-Rezepte

| Ergebnis | Rezept | Notiz |
|---|---|---|
| Paladin-Aura | Damage(3) + Heal(3) | Macht beides, aber schwächer als einzeln |
| Pyromancer-Aura | Feuer-Schlag(5) + Feuer-Schild(5) + Schnell(5) | Cross-Category-Beispiel |

### A.5 Mob-Ideen

| Name | Notiz |
|---|---|
| Trolle | "Viel über Heilmagie versiert" — ermöglichen Heilmagie-Cooldown-Unlock |
| Rüben | Stationäre Ernte-Mobs auf Bauernhof-Feldern. Nur durch Rüben-Ziehen-Aura schädigbar. Viel XP, langsamer Respawn. |

### A.6 Zonen / Welt-Locations

| Ort | Notiz |
|---|---|
| Tunnel Zone 1 → Zone 2 | Erster dunkler Bereich, natürliches Licht-Tutorial |
| Höhlen allgemein | Dunkel, Pokemon-Höhlen-Stil |
| "Weg des Kriegers"-Schild | Hinweis-Ort, führt zu kurzem Dungeon mit DPS-Aura-Reward |
| Troll-Gebiet | Hinweis-NPC führt hin, Reward = Heilmagie-Cooldown |
| Bauernhof mit Rüben-Feld | Friedlicher Bauer-NPC lehrt Rüben-Ziehen-Aura. Feld nebenan = stationäre Rüben-Mobs. Ernte-Mob-Beispiel. |
