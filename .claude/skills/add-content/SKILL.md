---
name: add-content
description: Author or replace game content — a mob, ability (aura/passive/cooldown), faction, recipe, prop, NPC, effect type, or scripted encounter. Use whenever adding/editing anything under api/ that the game loads. Surfaces the silent-break landmines (wire hand-sync, registry pins) and the verification tail on top of the authoritative manual.
---

The authoritative how-to is **`docs/manual-content-authoring.md`** — read the
section for your content type and follow it. This skill is the **pre-flight
landmine list + the verification tail**, not a replacement for the manual. Its
whole reason to exist is that the manual's steps are easy to half-complete, and
a half-complete content add fails *silently* (invisible entity, red suite at
HEAD, skill shows as "Skill #id").

## Step 0 — read the manual section

`docs/manual-content-authoring.md`: §1 new mob · §1b prop · §1c NPC sprite ·
§2 ability · §3 VFX · §4 icons · §5 encounter · "Factions" · the wire table at
the bottom. Trust the code over the manual if a path has drifted.

## Silent-break landmines (the stuff the manual warns about, collected)

- **New art = the 5-file wire path, in order:** append the enum entry at the
  **END** of `api/schema/server.fbs` `EntityType` → `cd api/schema && ./make.sh`
  (regens Go **and** TS) → SVG → a render class → **a `gameObjectClasses` entry
  for the new enum key** (`GameStateMessage.ts`; the map is an enum-keyed
  `Record`, so a missing entry is a **compile error**, not a silent desync —
  `npm run typecheck` catches it). Reused art via an `entityType` override
  needs **none** of this.
- **A new frontend layer is TWO edits in `core/logic/Game.ts`** —
  `createNamedContainer(...)` **and** `cameraGroup.addChild(...)`. Miss the
  second and the sprite renders off-stage (invisible but functional). Reusing a
  layer needs neither.
- **New skill = NO client-side edit.** The old `Skills.ts` triple map is gone
  (plan-ui-polish C1): the client fetches skill metadata from the aurad sidecar
  (`GET /skills`) at startup, so the backend registry is the single source. No
  `.fbs` regen for skills either.
- **Mob health is tier+baseline** (`tier` + `curveLevel` + `factors.baseMaxHealth`);
  author skill damage/heal HP as curve-position-1 baselines too. Raw
  `factors.maxHealth` **hard-fails at load** — a review reject.
- **Gated damage tags:** combat mobs need **no** harvest/resistance entry; only
  gate obstacles opt in (`{"*":0,"<tag>":1}`, e.g. turnip `harvest`, rockfall
  `smash`). The `"*"` wildcard does not opt in.
- **`milestone-unlocks.json` is embedded** → needs a **rebuild even with
  `-content`**. Plain `api/` JSON does not.

## Registry pins — the thing that leaves the suite RED at HEAD

Adding skills/recipes without bumping their pinned counts makes `go test` fail
at HEAD (this bit C2 — "Part 1 never bumped the pinned count"). After adding:

- **Skills:** `backend/pkg/aura/skills/registry_test.go` →
  `assert.Len(t, r.All(), N)` (~line 168). Bump `N` by skills added.
- **Recipes:** `backend/pkg/aura/skills/recipe_test.go` →
  `assert.Len(t, rr.All(), N)` (~line 168, `TestRecipes_C7Net`). Bump by recipes
  added, and extend the cascade assertions if the net changed.
- **Mobs: THREE content censuses in `backend/pkg/aura/items/mobs`**, and a new
  def trips every one it belongs to (measured, ascension-sites C1):
  `interaction_content_test.go` (the named list of conversants — any def with an
  `interaction` block), `role_content_test.go` (`assert.Len(byRole[RoleCreature],
  N)` — an NPC or a talking object is a **creature that authors speed 0**, never a
  structure), and `xpfactor_test.go` (`assert.Len(free, N)` — every `xpFactor: 0`
  species). They are *supposed* to break; add the name and bump the counts with a
  line saying what the def is. ⚑ They read `api/` from disk, so **`go test
  -count=1`** or a stale green hides all three.
- **Sim-harness presets** auto-derive player auras (§A "never a surprise") —
  if you added a player-facing aura/recipe result, confirm the preset appears
  (see the run-simharness skill).

## Verification tail — do NOT declare done without these

1. **Build:** `make -C backend build` (Go/`.fbs`/embedded change), **or**
   `-content ../api` + server restart for JSON-only edits.
2. **Test:** `cd backend && go test -timeout 60s ./...` — the pins live here; a
   stale pin = red suite. Run `-race` on the affected packages for logic.
3. **Boot-count check:** restart and confirm each `Loaded … definitions count=`
   line went up by exactly what you added — see the **Boot-count sanity check**
   section of the `verify` skill for the exact grep. A stale `aurad`
   process silently masks new content.
4. **In-game smoke:** the `verify` skill (real client, HUD-driven).
5. **Regenerate `docs/content-skill-inventory.md`** if you touched skills,
   mob `unlocks[]`, NPC `teachings[]`, recipes, or the milestone table. It is
   **generated, not hand-maintained** — the doc carries its own regeneration
   script. Re-run the reachability sweep at the bottom too: every player skill
   should have a non-legacy world source (`FireWard` is the one known,
   tracked exception). This is the step that keeps the docs honest: the
   step-7 A.6 rename (`24806352`) touched zero docs, and the catalogs drifted
   for days — stale names, wrong drop chances, and a reachability summary
   claiming 7 cheat-only skills when only 1 was.

   The three design catalogs (`content-auras.md` / `content-passives.md` /
   `content-cooldowns.md`) deliberately **do not** repeat sources or numbers —
   they point here. Don't "helpfully" add drop chances back into them.
