# Plan — Content: Zone 1 (+ zone progression & mob taxonomy)

**Status:** CAPTURED (2026-07-09), **not scoped**. This stashes the concrete
zone/mob **content** ideas from a chat-side design discussion (source artifacts:
`mobs.jpg` mob-category sheet, `zones.png` zone map) so they don't evaporate.
It is **content-pass material (execution step 6 / roadmap item 12)** — per the
systems-first order, real zone design is authored *after* the systems it needs
exist. All numbers, names, and layouts are **[PLACEHOLDER]**.

> **Scope guard (same as world-foundation chunk 6):** do **not** invest in the
> actual zone layout / balance now. This doc is a parking lot + a shaping
> reference for the systems that Zone 1 will exercise (onboarding, harvest-mobs,
> NPC teaching, darkness/light, aggro archetypes). The one decision already
> *taken* from it is the **peasant onboarding** (GDD §5), because it resolved a
> live conflict — see §5.

---

## 1. Why capture it now

Zone 1 is the **concrete target** several upcoming systems are shaped against —
the same role the lava-bridge encounter plays for the encounter controller
(`roadmap.md` item 7). Writing it down lets the system steps (mob depth,
darkness/light, unlock sources) build toward something real without committing
to content early. It also pins two conflicts that surfaced and were resolved in
the 2026-07-09 design triage (§5).

---

## 2. Zone progression (from `zones.png`)

- **21+ zones.** A zone's **number = its position on the progression curve**,
  **not** an absolute character level. (Ties to the power curve, GDD §5: mobs are
  authored per zone tier; a zone number is where on the `f(char level)` curve its
  content sits.)
- **Scope tiers:**
  - **Prototype** = Zone 1 + Zone 2.
  - **Early build** = Zones 1–6 + the City.
  - **Full release** = everything up to the volcano / dragons (20+).
- Zone 1 = **village + forest** (incl. a wolf pack). Zone 2 = **further forest,
  directly before the City**. The **tunnel between Zone 1 and Zone 2** is the
  first dark area (the natural light-role tutorial — GDD §7, roadmap item 5).

---

## 3. Mob category taxonomy (from `mobs.jpg`)

Loose grouping for the eventual full roster (**all undecided**, content-pass
work — the current legacy Berryhunter mobs get replaced here, roadmap item 12):

- **Tiere (animals)** — wolves, boars, … (Zone 1 tier)
- **Small Fantasy** — kobolds, … (Zone 1–2 tier)
- **Humanoid** — bandits, guards, mercenaries, …
- **Fantasy**
- **Evil**
- **Corrupted Fantasy**
- **Elementals**
- **Dragons** (endgame tier)

Loose notes attached to the taxonomy (**all backlog, not decided** — cross-links
where a system already owns them):

- **Combat state / portraits with vs. without aura** — the "aura ring only shows
  in combat" behavior is captured at `roadmap.md` item 7 (auras off until
  aggroed → the ring follows the active-aura state).
- **Mob aggro / social aggro** (pulling nearby mobs) — belongs to the aggro &
  threat model, `roadmap.md` item 7.
- **Rested XP** — backlog; depends on offline accrual → after accounts (step 8).

---

## 4. Zone 1 design (village + forest)

### 4.1 Intended flow

```
  spawn (peasant) → farmer: turnip-field task → farmer: wolf-pack task
       → farmer sends the player toward the City
       → tunnel guard: warns of the darkness, points to a light-aura clue
       → tunnel (Zone 1 ↔ Zone 2): visibility radius extremely low —
         practically a hard gate, but mechanically PURELY VISUAL (TDD §4.2 /
         roadmap item 5: you can be hit in the dark, you just see poorly)
       → Zone 2 (further forest) → City
```

The tunnel is a **soft gate**: a player *can* walk through blind (darkness has no
mechanical effect), but the low visibility strongly pushes them to find the
light aura first — which is the point of the light-role tutorial.

### 4.2 NPCs

- **Farmer** — teaches the starting utility aura (Turnip-Pull) and gives the
  turnip-field + wolf-pack tasks. First instance of the **NPC-teaching +
  harvest-mob** loop (GDD §8).
- **Tunnel guard** — warns about the tunnel darkness and points to the
  **light-aura clue** (a world-exploration clue anchor, GDD §7 / roadmap item 9).

Both ride the friendly-NPC substrate (`roadmap.md` item 9 "Friendly NPCs — reuse
map"); the interaction depth (bare teach-on-approach vs. branching dialogue) is
the open scoping fork in `backlog.md` item 2.

### 4.3 Mobs (draft)

| Mob | Role | Notes |
|---|---|---|
| **Turnips** | Harvest-mob (chore) | Stationary, passive; only the Turnip-Pull utility aura damages them (tag-gated). XP only, **no drops**. The onboarding chore-mob (§5). |
| **Wolves** | Normal | The first real combat mobs (fight back). Come as a **pack** — the first 1-vs-N fight (pack sizing is a power-curve/sim question, GDD §5). |
| **Elite wolf** | Elite | Pack leader; candidate **kill-unlock** source. |
| **Kobolds** (or similar) | Normal / pest | Field pests near the farm; **no loot** (see §5 conflict resolution). |
| **Elite kobold** | Elite | — |
| **Wild boars** | Normal | Role in the flow still open (§6) — good **local-patrol / wander** archetype demo (roadmap item 7). |

---

## 5. Resolved conflicts (2026-07-09 design triage)

- **"Kobolds drop turnips" vs. "no item drops" (GDD §8) → RESOLVED.** Turnips are
  **harvest-mobs** (killing them gives XP only); kobolds are **pests with no
  loot**. No drop system is introduced.
- **"Wolf fight unlocks Damage Aura" vs. "Damage Aura is a guaranteed level-1
  milestone / players spawn with it" → RESOLVED via the peasant onboarding**
  (GDD §5): the player **starts with a utility aura** (Turnip-Pull), farms the
  chore-mobs to **level 1**, which milestone-unlocks the **Damage Aura**, and
  *then* fights wolves. So Damage Aura is a genuine level-1 unlock, "you always
  have exactly one aura from birth" holds, and the wolf fight is the first *real*
  combat rather than the unlock trigger. Generalizes to per-race starts
  (`backlog.md` item 12). **Dev note:** the build keeps spawning with Damage Aura
  for testing until the content pass flips the default.

---

## 6. Open questions (content-pass)

- **Campfire location(s)** in Zone 1 (death-respawn anchor + social hub; the
  respawn point is set by dwelling in the fire aura — roadmap step 3).
- **Light-aura clue** — exact wording + world location (must fit the "no quest
  log, no markers" principle; the tunnel guard points at it).
- **Rough zone geography** — village / farm / forest / wolf territory / tunnel
  mouth layout.
- **Resistances & damage types** for the Zone 1 mobs (the tag-resist mechanic is
  built — item 11 Phase 2 — but every mob currently defaults to `physical`;
  assign real tags here).
- **Wild boars' role** in the flow.
- **Turnip / chore fantasy per start** (destructive "pull" vs. constructive
  "close a molehill" — mechanically identical, GDD §5).

---

## 7. Additional world/content ideas (Gothic / WoW-Classic-inspired, undecided)

Parked seeds for later zones — not Zone 1, listed so they aren't lost:

- **Prison camp / mining colony** (Gothic 1 vibe).
- **Necromancer** as a caster mob.
- **Faction logic** among humanoids — bandit / mercenary / guard.
- **Guardian golem boss** before the mountain range.
- (… more as the zone map fills in.)

---

## 8. Cross-references

- `docs/gdd.md` §5 (peasant onboarding, power curve), §6 (unlock sources),
  §7 (world, darkness/light, clues), §8 (mobs, harvest-mobs), Appendix A
  (Turnip-Pull, tunnel, troll territory content).
- `docs/roadmap.md` items 4 (world), 5 (darkness/light), 7 (mob behavior/aggro),
  9 (unlock sources / friendly NPCs), 12 (content pass) + the Execution order.
- `docs/plan-world-zones.md` — the authoring pipeline (editor + `zone.json`) this
  content is authored *with*; §7.6 named sub-regions (a cave/forest split within
  Zone 1 would use it).
- `docs/backlog.md` items 2 (dialogue system), 12 (races).
- `docs/tdd.md` §4.2 (darkness = purely visual), §4.6 (zones).
