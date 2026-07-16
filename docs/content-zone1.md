# Content — Zone 1 (village + forest)

**Design intent only.** This doc holds what Zone 1 is supposed to *be and
do*; exact runtime positions live in the zone JSON authored via the editor
(`manual-zone-editor.md`) and are never mirrored here. Conventions →
`README.md` → Content. Everything below is [PLACEHOLDER] until the content
pass (step 6) scopes it; rationale for the two resolved design conflicts is
kept in `archive-content-zone1-capture.md`.

## Intended flow

```
  spawn (peasant) → farmer: turnip-field task → farmer: wolf-pack task
       → farmer sends the player toward the City
       → tunnel guard: warns of the darkness, points to a light-aura clue
       → tunnel (Zone 1 ↔ Zone 2): visibility radius extremely low —
         practically a hard gate, but mechanically PURELY VISUAL (TDD §4.2:
         you can be hit in the dark, you just see poorly)
       → Zone 2 (further forest) → City
```

The tunnel is a **soft gate**: a player *can* walk through blind (darkness
has no mechanical effect), but the low visibility strongly pushes them to
find the Light aura first — the point of the light-role tutorial.

The onboarding beat (spawn with Turnip-Pull → chore-mobs to L1 → Damage
Aura milestone → wolves as first real combat) is the **peasant onboarding**,
decided in GDD §5.

## Areas (intent)

Village · farm + turnip field · forest · wolf-pack territory · tunnel mouth.
Rough geography is an open content-pass question (below). A cave/forest
split within the zone would use named sub-regions
(`plan-world-zones.md` §7.6).

## Cast

- NPCs: **Farmer**, **Tunnel guard** → `content-npcs.md`
- Mobs: **Turnips**, **Wolves**, **Elite wolf**, **Kobolds**, **Elite
  kobold**, **Wild boars** → `content-mobs.md`

## Open questions (content-pass)

- **Campfire location(s)** — death-respawn anchor + social hub (respawn
  point set by dwelling in the fire aura, step 3).
- **Light-aura clue** — exact wording + world location (no quest log, no
  markers; the tunnel guard points at it).
- **Rough zone geography** — village / farm / forest / wolf territory /
  tunnel-mouth layout.
- **Resistances & damage types** for the Zone 1 mobs — the tag-resist
  mechanic is built (item 11 Phase 2) but every mob defaults to `physical`;
  assign real tags here.
- **Wild boars' role** in the flow.
- **Turnip / chore fantasy per start** — destructive "pull" vs. constructive
  "close a molehill" (mechanically identical, GDD §5).
