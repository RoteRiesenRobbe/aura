# Aura — Technical Design Document

**Version:** 0.3
**Status:** Living document
**Letzte Aktualisierung:** nach Phase 6.3 (Mob-Kapitel / Block 3 abgeschlossen) + Targeting-/LoS-Design-Session

> Begleitdokument zum [Game Design Document](./aura-gdd.md). Hier stehen ausschließlich technische Entscheidungen, Architektur und Implementierungs-Themen. Spielmechanik gehört ins GDD.
>
> Der konkrete, schrittweise Migrationsplan für das Skill-System lebt in `docs/skill-system-design.md` im Repo, der v1.0-Scope außerhalb des Skill-Systems in `docs/v1-roadmap.md`. Dieses TDD ist das übergeordnete technische Gesamtbild; bei Konflikten im Detail gelten die Repo-Docs.

---

## 1. Bestehender Prototype

- **Unser Fork (aktiv):** https://github.com/RoteRiesenRobbe/aura
- **Ursprünglicher Prototype (`upstream`):** https://github.com/Nullformed/aurahunter
- **Fork von:** https://github.com/trichner/berryhunter
- **Stack (vererbt):** Go-Server, WebSockets, Browser-Client (TypeScript/PixiJS)
- **Lokal:** WSL unter `/root/workspaces/aurahunter`
- **Server-Tick-Rate:** 30 ticks/s (33 ms/tick)

### Was bereits funktioniert
- Multiplayer-Sync via WebSockets
- Top-Down-Rendering im Browser
- Spieler-Movement
- Server-Client-Architektur (ECS-basiert, `github.com/EngoEngine/ecs`)
- **Datengetriebenes Skill-/Aura-System** (Phasen 1–6 der Migration): Skill-JSONs + Registry, `SkillComponent` an Spielern *und* Mobs, generisches `SkillSystem`, Toggle/Wechsel server-authoritative, Milestone-Unlocks, Spellbook + Equip-UI
- **Mob-Kapitel (Phase 6) komplett:** alle Mobs auf dem SkillSystem, Kill-Unlocks (per-Participant-Rolls), Participation-XP (alle Kampfbeteiligten inkl. Healer), Boss-Designation (AngryMammoth)

### Was fehlt für v1.0
- Accounts (Register / Login) und Persistenz (Spielerdaten, Welt-State)
- Skill-Leveling & Skill-Punkte-Verteilung (Phase 7)
- Passives & Cooldowns als spielbare Kategorien (Phase 8; Datenmodell vorbereitet)
- Kombinationen (Phase 9; Frage-Katalog liegt in `docs/combo-design-questions.md`)
- **Aura-Targeting: Selector + Zielanzahl** (neuer Schritt, siehe 4.1 — aktuell trifft jede Aura alle in Reichweite)
- Survival-Removal + Resource-Unifikation (Roadmap Items 1+2)
- Line-of-Sight für Auren (2D Raycast; bewusst deferred bis Zonen/Wände existieren)
- Zone-Chat (Berryhunter-Chat existiert, Zonen-Scoping fehlt)
- Handgebaute Welt & Zonen (aktuell prozedural assembliert)
- Minimap (Berryhunter-Minimap existiert, ggf. anpassen)

*(Meta-Progression / Character-Opfer ist explizit **nicht** v1.0 — siehe GDD §11 und Roadmap.)*

---

## 2. Tech-Entscheidung: Weiterentwickeln vs. Clean-Start

**Entscheidung (getroffen):** Weiterentwickeln (Berryhunter-Fork ausbauen).

**Begründung:** Die schwersten Teile (Multiplayer-Netcode, Movement, Top-Down-Rendering, Server-Client-Architektur) sind schon da. Alles was Aura braucht (Aura-System, Accounts, Persistenz, Line-of-Sight) kommt obendrauf — nicht statt was bestehendem. Der Code wurde inzwischen gemeinsam analysiert; die Struktur trägt die Aura-Features (das datengetriebene Skill-System inkl. Mob-Parität wurde sauber auf die bestehende ECS-Architektur aufgesetzt).

Clean-Start bleibt nur theoretische Rückfalloption, falls sich später herausstellt, dass die Code-Struktur ein Feature aktiv blockiert. Bisher kein Anzeichen dafür.

---

## 3. Stack

### Aktuell
- **Server:** Go (≥ 1.22)
- **Transport:** WebSockets
- **Protokoll:** FlatBuffers (flatc v24.3.25, Toolchain modernisiert)
- **Client:** Browser, TypeScript + webpack + PixiJS (aus Berryhunter)

### Offene Entscheidungen
- [ ] Datenbank (Accounts, Level, Skills, Zauberbuch, Meta-Progression)
- [ ] Hosting-Strategie für Production
- [ ] Auth-System (Richtung beschlossen: anonymous-first mit Upgrade-Pfad, siehe Roadmap Item 3; konkrete Umsetzung offen)
- [ ] Client-Build-Pipeline (aktuell webpack aus Berryhunter)
- [ ] Map-Format / Authoring-Tooling (Tiled vs. custom JSON — Roadmap Item 4)

---

## 4. Architektur — Neue Systeme

Die folgenden Systeme müssen geplant werden bevor implementiert wird. Jeweils eigene Spec-Diskussion nötig.

### 4.1 Skill-/Aura-System

**Status:** Kern steht (Phasen 1–6). Skill-Leveling (7), Passives/Cooldowns (8), Kombinationen (9) und der Targeting-Schritt sind offen. Details: `docs/skill-system-design.md`.

**Was bereits gebaut ist:**
- Skill-Definitionen als JSON (`api/skills/`), geladen über eine Registry (analog zu Items/Mobs)
- `SkillComponent` an Spielern und Mobs (gleiche Mechanik für beide; Mobs seit Phase 6 vollständig migriert, eigene Aura-Skills pro Mob, Aura-Wechsel per `SetActiveAura` technisch möglich)
- Generisches `SkillSystem` (ECS), verarbeitet die aktive Aura pro Tick
- Effekt-Typen: `damage_aura`, `heal_aura`, `stat_multiplier`, `instant_damage`
- Tick-Intervalle pro Effekt (`tickInterval` im JSON, `TickAccumulator` pro EquippedSkill); Reset beim Aura-Wechsel verhindert Rapid-Switch-DPS-Exploit
- Milestone-Unlocks und Kill-Unlocks datengetrieben; Spellbook über Wire + UI (Panel, Equip, Unlock-Glow)
- Fraktions-Logik deklarativ über Target-Flags pro Effekt (`targetsMobs` / `targetsPlayers` / `targetsStructures`) — kein Friendly Fire, Mob-Auren treffen Spieler, Mob-vs-Mob ausgeschlossen

**Targeting (beschlossen, noch nicht gebaut):**
- Jede Aura bekommt einen **Selector** und ein **maxTargets** als Effekt-Daten (analog zu `tickInterval`): `nearest` (Default für Damage *und* Heal) | `lowest_health` (**prozentual**: niedrigste current/max-Ratio, nicht absolute Werte).
- **Auswahl-Pipeline:** Reichweiten-Filter (Aura-Sensor, existiert) → *(später)* LoS-Filter → Selector-Sortierung → erste N. „Alle in Reichweite" ist der Spezialfall ohne Cap (späte Unlock-Auren).
- **Level-up-Achsen pro Aura frei kombinierbar** (Schaden/Heal, Radius, Zielanzahl, Tick-Rate) — d.h. neben den vorhandenen `*PerLevel`-Feldern kommen perspektivisch `maxTargetsPerLevel` und `tickIntervalPerLevel` [PLACEHOLDER] dazu. Balance-Notiz: Ziele × Schaden gleichzeitig zu skalieren ist der gefährlichste Multiplikator.
- **Heal:** Selector-Default ebenfalls nearest (auf Allies); heilt nie den Caster. Selbstheilung ist konzeptionell ein Cooldown.
- **Ehrlicher Ist-Zustand:** die implementierten `damage_aura`/`heal_aura` treffen heute **alle** passenden Entities in Reichweite (AoE-all). Die Umstellung ist ein eigener Migrationsschritt und ändert das shipped Verhalten der Basis-Auren — siehe Roadmap Item 11.
- **Frontend-Teil:** Per-Tick-**Hit-VFX auf dem getroffenen Ziel** (Slash bei langsamen Ticks, konstanter Effekt bei schnellen), damit der Kreis als Reichweite statt Trefferzone lesbar ist. *Deferred:* Sticky-Targeting gegen Ziel-Zappeln bei nearest.

**Anforderungen (Gesamtbild):**
- **Genau eine aktive Aura zur Zeit.** Slots sind ein Loadout (mehrere Auren ausgerüstet, eine aktiv), keine gleichzeitig wirkenden Auren. Passives wirken dauerhaft parallel; Cooldowns sind einzeln triggerbar.
- Tick-basierte Schaden-/Heilauren mit unterschiedlichen Intervallen, Ziel-Wahl per Selector + Cap
- Konstante Buffs/Debuffs (Tank, Speed) über Passives — nicht tick-basiert
- Auren wirken nur auf Ziele mit Line-of-Sight (LoS noch nicht gebaut, bewusst deferred)
- Resource-Verbrauch als Effekt-Parameter (`selfDamageFraction`-Muster; Roadmap Item 1 — kein separates Kosten-System)
- Sichtbarkeit / Sync zu allen Clients in Reichweite

**Beantwortete Fragen:**
- Server-Tick-Rate: **30 ticks/s** (aus Berryhunter geerbt)
- Unterschiedliche Tick-Intervalle pro Aura: über `tickInterval` pro Effekt (Default 1), akkumuliert pro EquippedSkill
- Passives-Stacking auf demselben Stat: **linear additiv** (`stat_multiplier`, `DerivedStats`)
- Targeting: **Selector + maxTargets pro Effekt** (siehe oben)
- Mob-Heal / heal_aura-Target-Flags: **bewusst später** — dort wo es geplant ist (Roadmap Item 7, Mob-Support-Behaviors); die zwei bekannten Limitierungen sind in `skill-system-design.md` dokumentiert

**Offene Fragen:**
- Wie syncen wir Aura-Visualisierung (Kreise, Hit-VFX) zu Clients ohne pro Frame zu spammen?
- Wie greifen Kombinationen technisch ineinander (→ Phase-9-Design, Frage-Katalog liegt vor)

### 4.2 Line-of-Sight (2D Raycast)

**Beschlossen: LoS bleibt im Scope** — es trägt zwei Pillars (Deckung/Positionstaktik, Licht-Support-Rolle). Aber es zerfällt in **zwei getrennte Probleme** mit völlig unterschiedlichen Kosten:

1. **Aura-Occlusion** — blockt eine Wand den Effekt? Kampfrelevant, muss server-authoritative sein. Das ist das eigentliche Hochrisiko-Item.
2. **Sicht/Dunkelheit** — was der Spieler *sieht* (Lichtkegel in Höhlen). **Beschlossen: rein Client-Rendering, keine mechanischen Auswirkungen** (kein Schaden-/Trefferchance-Malus im Dunkeln). Damit ist die Höhlen-Atmosphäre und das Zone-1→2-Tutorial billig und vom riskanten Teil entkoppelt (Roadmap Item 5; dort wird auch der `light_aura`-Effekt-Typ designed).

**Beschlossene Design-Punkte für die Occlusion:**
- **Occluder sind kuratiert:** ein blockt-LoS-Flag auf großen Objekten (Wände, Felsen, Klippen) — Deko-Bäume blocken *nicht*, sonst wird Waldkampf zerhackt und fühlt sich zufällig an.
- **Ansatz:** Occluder-Layer als Grid/Tilemap + Integer-Raycast (DDA) — schnell, Kosten ≈ Radius/Tile-Größe. Polygone nur falls das Map-Format es erzwingt.
- **LoS-Cache:** nicht jeden Tick neu rechnen — Recompute alle K Ticks oder bei Bewegung [PLACEHOLDER]; viele Auren ticken ohnehin seltener (`tickInterval`).
- **Synergie mit Targeting:** dank Ziel-Cap wird nach Selector *sortiert* geraycastet mit Early-Out — sobald N Ziele durchgekommen sind, ist Schluss. Im Normalfall N Raycasts statt „alle Kandidaten".

**Performance-Modell:** Die Last skaliert nicht mit Gesamt-Entities, sondern mit **ko-lokalisierten Aura-Castern** (der Blob: Boss-Event, Special-Event-Pfütze). Teuer ist die Broadphase („wer ist in Reichweite"), nicht der Raycast — und Berryhunter bringt Spatial Hashing in `phy` bereits mit. Grobe Erwartung: niedrige Hunderte gleichzeitig überlappende Caster pro Core tragbar; das ist eine Kurvenform-Schätzung, keine Zahl — **der Spike misst es** (Blob-Benchmark: X synthetische Caster, Tick-Zeit muss unter 33 ms bleiben).

**Timing (beschlossen):** LoS ist **kein Teil des Prototype-Pfads** — es hängt an Zonen/Wänden, die es zu blocken lohnt (Roadmap Item 6, abhängig von Item 4 Map-Format). Der Spike passiert, wenn das Map-Format ansteht.

**Offene Fragen:**
- Welt-Repräsentation der Occluder (hängt am Map-Format-Entscheid, Roadmap Item 4)
- Occluder statisch (vorbackbar) vs. Entities (Berryhunter-Ressourcen sind abbaubar → potenziell dynamisch)
- Recompute-Cadence des Caches (Tuning)
- LoS-Sampling: center-to-center zuerst; Ecken-Artefakte später

### 4.3 Persistenz

**Was muss persistent gespeichert werden:**
- Account (anonymous-first: Server-issued Secret in localStorage, optionales E-Mail/OAuth-Linking später — Richtung beschlossen, Roadmap Item 3)
- Charaktere pro Account (Name, Level, Position, Resource)
- Zauberbuch pro Charakter (welche Auren freigeschaltet, welche Level)
- Skill-Punkte-Verteilung pro Charakter
- Aktiver Build pro Charakter (welche Auren in welchen Slots)
- Meta-Progression pro Account (post-v1)
- Welt-State? (Campfires, Special-Event-Trigger, ...)

**Offene Fragen:**
- Datenbank-Wahl (SQL vs. Document vs. KV)
- Snapshot-Strategie bei Server-Crash
- Wie wird Welt-State persistiert ohne jeden Frame zu schreiben?
- Wächst der `chieftain`-Service (Scoreboard, SQLite) zum Account-Service oder kommt ein neuer Service?

### 4.4 Accounts & Auth

**Anforderungen:**
- Anonymous-first (spielen ohne Registrierung), Upgrade-Pfad für Geräte-übergreifende Sicherung
- Mehrere Charaktere pro Account
- Session-Management über WebSocket-Reconnects hinweg

**Offene Fragen:**
- E-Mail/OAuth-Linking konkret?
- Anti-Bot / Anti-Abuse?

### 4.5 Cooldown-System

- Pro-Spieler-Cooldowns für Q/E-Abilities
- Server-authoritative
- Client-Vorhersage für UI-Feedback
- **Status:** Datenmodell vorbereitet (`cooldown`-Kategorie, `CdTicks`, `instant_damage`-Effekt); Input-Weg beschlossen (Hotkeys + Ability-Bar-Klick, `cooldown_activations` auf `Input`); Umsetzung in Phase 8.2. Selbstheilung läuft über einen Cooldown (nicht über Heilauren).

### 4.6 Zonen & Zone-Chat

- Spieler sind in genau einer Zone
- Auren / Sichtbarkeit nur innerhalb Zone
- Zone-Chat: ein Channel pro Zone (Broadcast gefiltert nach Sender-Zone — beschlossen, Roadmap Item 8); globaler Chat bleibt bis Zonen existieren
- Zone-Übergänge (z.B. Tunnel zwischen Zone 1 und 2) — wie?

---

## 5. Bekannte technische Risiken

| Risiko | Schwere | Mitigation |
|---|---|---|
| Line-of-Sight Performance (Blob-Fall) | Hoch | Bewusst deferred bis Map-Format steht; dann Spike mit Blob-Benchmark; Grid-DDA + Cache + Ziel-Cap-Early-Out; nicht im Prototype-Pfad |
| Aura-Tick-Sync zwischen Clients | Mittel | Server-authoritative, delta-updates |
| Targeting-Umstellung ändert shipped Verhalten | Niedrig | Eigener Schritt, testgetrieben (TDD-Prinzip), Basis-Auren-Werte sind ohnehin [PLACEHOLDER] |
| DB-Schema-Migration während Live-Betrieb | Mittel | Migrations-Framework von Anfang an |
| Cheat-Resistenz | Niedrig (v1.0) | Server-authoritative für alles Kampfrelevante; Anti-Cheat erst später wichtig |

> Das frühere Risiko "Berryhunter-Code blockiert Aura-Features" hat sich nicht
> materialisiert — Skill-System inkl. Mob-Parität ließ sich sauber auf die
> bestehende ECS-Architektur aufsetzen.

---

## 6. Roadmap (technisch, grob)

Erste Skizze; die maßgeblichen Pläne sind `docs/skill-system-design.md` (Skill-System) und `docs/v1-roadmap.md` (Rest). Aktueller Fortschritt markiert:

1. ✅ **Repo-Setup & Onboarding** — Berryhunter lokal lauffähig, Claude Code aufgesetzt, Build-Pipeline verstanden
2. 🔄 **Skill-System-Migration** — Phasen 1–6 fertig (Tick-Engine, Damage-/Heal-Aura, Toggle, Unlocks, Spellbook+Equip, Mob-Parität, Kill-Unlocks, Participation-XP, Boss). Offen: Skill-Leveling (7), Passives/Cooldowns (8), Kombinationen (9)
3. ⬜ **Survival-Removal + Resource-Unifikation** — Roadmap Items 1+2 (Block 2)
4. ⬜ **Aura-Targeting: Selector + Zielanzahl** — eigener Schritt, spätestens vor dem Content-Pass (Roadmap Item 11)
5. ⬜ **Initial Content Pass** — erste echte Skill-/Mob-/Rezept-Inhalte (Prototype-Gate)
6. ⬜ **Accounts & Persistenz** — anonymous-first
7. ⬜ **Welt & Zonen** — Map-Format-Entscheid (Tiled-Spike), handgebaute Zonen, Zone-Chat
8. ⬜ **Line-of-Sight** — Spike (Blob-Benchmark), dann Occlusion ins Aura-System
9. ⬜ **Dunkelheit & Licht** — rein Rendering, `light_aura`-Effekt-Typ
10. ⬜ **Mob-Verhalten & Tiers** — Patrouillen-Archetypen, Spawn-Punkte in Map-Daten, Boss-Scripting, Mob-Heal
11. ⬜ **Polish & Closed Alpha**

---

## 7. Offene Tech-Entscheidungen (Sammelpunkt)

- [ ] Datenbank-Wahl
- [ ] Hosting-Strategie (Production)
- [ ] Auth-Umsetzung (Richtung: anonymous-first, beschlossen)
- [ ] Map-Format / Authoring-Tooling (Tiled vs. custom JSON) — größte Unbekannte in Item 4, bestimmt auch die Occluder-Repräsentation
- [ ] Client-Build-Pipeline
- [ ] Logging / Monitoring von Anfang an?
- [ ] Migrations-Framework für DB
- [ ] Saisonale vs. Permanent-Server (Infrastruktur-Frage zusätzlich zur Design-Frage)

---

## 8. Aufgeschobene technische Schuld

Die maßgebliche, aktuelle Liste lebt in `CLAUDE.md` (Migration-Status) und `docs/skill-system-design.md` (Deferred Tech Debt) im Repo — dieses TDD wiederholt sie nicht. Aktuelle Highlights zur Orientierung:

- `net_test.go` hängt `go test ./...` (kein echter Test) — safe Test-Scope nutzen
- Equip-Level=1-Lücke (Spellbook speichert nur Discovery, keine Level) — löst sich mit Phase 7
- Mob-Aura-Ring-Radius ist eine Frontend-Konstante (manuell synchron halten, bis wire-driven)
- Ein Tick-Accumulator pro EquippedSkill (Multi-Effekt-Skills mit verschiedenen Intervallen brauchen per-Effekt-Accumulator, bevor so ein Skill shipped)
