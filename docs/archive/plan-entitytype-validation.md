# Plan — Validate the mob EntityType name-fallback at load (backlog §27.2.1)

**Status:** ✅ DONE 2026-07-24, test-first, committed `c3938be7` (docs
`[this commit]`). Single chunk, ~1 h. Fixed the one live-server crash risk left
in the §27 code-health sweep (`docs/backlog.md` §27.2.1, §27.4 order item #3),
and bundled the two adjacent cleanups (map dedupe + `log.Fatalf`→`panic`).
Recorded inline in `backlog.md` §27.2.1, joining the other §27 fixes (§27.1
`f6fcfbad`, §27.2.2 `b4b0e66d`, §27.3 `eee10331`).

**Shipped as planned — all three coupled edits, no deviations.** New resolver
`mobs.ResolveEntityType` (`items/mobs/entitytype.go`); loader validates the
effective lookup with distinct per-knob messages; `NewMob` deletes the `types`
map, uses the resolver, and panics on the unreachable-for-loaded-content path.
Pins: `TestResolveEntityType`, `TestMapMobDefinition_UnknownNameFallbackFails`
(regression — fails on the pre-fix loader), `TestNewMob_PanicsOnUnresolvedEntityType`.
**Verified:** `go build`/`vet` clean, `go test ./...` green (29 pkgs); boot over
`-content ../api` loads 50 mobs 0 panics; negative boot check (a mob `name` →
non-EntityType) fails at load, not first spawn. In-game smoke skipped as
optional (negative-boot + tests cover the logic). No wire/schema/JSON change.

## The bug (backlog §27.2.1)

A mob's wire `EntityType` is resolved from a **string** at mob-construction time:
the def's optional `entityType` override, falling back to the def `name`
(`model/mob/mob.go:60-68`). The **override** is validated at content load
(`items/mobs/definitions.go:326-331`, pinned by
`TestMapMobDefinition_UnknownEntityTypeFails`) — but the **name-fallback path is
validated nowhere**. A mob whose `name` is not a FlatBuffers EntityType passes
the loader clean and dies at **first spawn** via `log.Fatalf` in `NewMob`
(`mob.go:67`), which takes the **whole server process** down.

Reachable at runtime, not just at boot: the `spawn` effect
(`sys/skills.go:1501`) and encounter spawns (`encounter/system.go:151`) build
mobs at cast time. On the live F&F server this is a latent crash-at-first-encounter,
not a deploy-time failure.

**The zero-value trap that shapes the fix:** `AuraApi.EntityType` is a `uint16`
whose zero value `EntityType(0)` is `EntityTypeDebugCircle` — a *real* type. So a
missing lookup is not "nothing"; without a guard a bad name silently renders the
mob **as a debug circle**. The `if !ok` guard in `NewMob` is what converts that
silent-wrong-render into a loud failure. This is why the guard cannot simply be
deleted (see Decisions).

## What actually reaches `NewMob` (verified 2026-07-24)

Exactly **two** construction paths build a `MobDefinition`:

| Path | Where | Validated today? |
|---|---|---|
| **Loader** | `definitions.go:361` via `mapToMobDefinition` — feeds all content, the `spawn` effect, and encounter spawns (they all `GetByName()` off the registry) | override yes, name-fallback **no** ← the bug |
| **Sim** | `sim/world.go:148` — direct struct literal, hardcodes `EntityType: "Dodo"`, never touches the loader | not applicable (in-code, hardcoded-valid) |

Both `NewMob`'s `types` map (built from `AuraApi.EnumNamesEntityType`) and the
loader's `AuraApi.EnumValuesEntityType` check are the **same** name→EntityType
mapping expressed twice — a DRY smell this chunk collapses.

**All real content and every test fixture already resolve** to a valid
EntityType (checked all `api/mobs/*.json` without an override, and all
`definitions_test.go` fixture names) — so the new load-time check needs **zero**
content or fixture changes, only new negative tests.

## Decisions

### The guard stays (as a `panic`), it is not deleted

After load-time validation, `NewMob`'s guard is **unreachable for loaded
content** but **still live for direct construction** (the sim, tests, any future
in-code def) — where it protects against the `EntityType(0) = DebugCircle`
zero-value trap. So it is a narrowed-purpose guard, **not dead code**, and per
the project rule ("if it still serves a purpose that's fine") it earns its place.

The codebase already uses exactly this idiom five lines above one of the call
sites (`sys/skills.go:1497`):

> `// Unreachable for loaded content — mobs.RegistryFromFS hard-fails`
> `// unresolved spawnMob names at boot. Guards direct construction.`

Two rejected alternatives, both worse:

- **Delete the guard outright** (`entityType := types[lookup]`) → a bad name in
  the sim/a test silently renders `DebugCircle`. Reintroduces a subtler version
  of the bug we're fixing.
- **Store a resolved `EntityType` field on the def + delete the guard** → looks
  clean ("parse, don't validate"), but the field is *forgettable*: a future 3rd
  construction path that skips it silently gets `DebugCircle`, with no guard left
  to catch it. Also cycle-adjacent (`items/mobs` can't import `model`; would use
  `AuraApi.EntityType`). Lateral move at best, bigger surface.
- **`NewMob` returns `error`** → genuinely correct Go, but adds error ceremony
  to 5 call sites for a path unreachable at all of them (they use loaded defs).
  Fails KISS/YAGNI.

What we keep from the "resolve-once" idea is its **one real win** — a single
name→EntityType resolver — without the field or the guard deletion.

### `log.Fatalf` → `panic`

`NewMob`'s `log.Fatalf` (`mob.go:67`) is the **last `log.Fatalf` in `model/`**
(`research-code-quality.md` §5's three-logging-styles finding). `log.Fatalf`
calls `os.Exit(1)`: in a test/sim that trips the guard it kills the **whole test
binary** with no stack trace, reporting nothing else. `panic` is the honest
signal for a violated invariant ("this def bypassed the loader's guarantee"),
gives a stack trace, and fails just the offending test/sim unit.

## The change (one chunk, three coupled edits)

### 1. One shared resolver in `items/mobs` (DRY)

Add to the `mobs` package a single exported resolver — the source of truth for
the name/override → wire-type mapping:

```go
// ResolveEntityType maps a mob's effective wire-type key — the entityType
// override if set, else the def name — to its FlatBuffers EntityType. ok is
// false when the key names no EntityType; callers hard-fail (loader at boot,
// NewMob via panic for direct construction).
func ResolveEntityType(override, name string) (AuraApi.EntityType, bool) {
	key := override
	if key == "" {
		key = name
	}
	t, ok := AuraApi.EnumValuesEntityType[key]
	return t, ok
}
```

### 2. Loader validates the effective lookup (the actual §27.2.1 fix)

Replace the override-only block (`definitions.go:325-331`) with a call to the
resolver over the **effective** key, keeping distinct messages so an author
knows which knob is wrong:

```go
// The wire EntityType is the override if present, else the def name
// (mob.NewMob's fallback). Validate whichever will actually be looked up so an
// unresolvable name fails here at load (a boot error) instead of at first spawn
// (a live-server crash — §27.2.1), matching the override's existing fail-fast.
if _, ok := mobs.ResolveEntityType(m.EntityType, m.Name); !ok {
	if m.EntityType != "" {
		return nil, fmt.Errorf("mob %q: entityType %q is not a known EntityType", m.Name, m.EntityType)
	}
	return nil, fmt.Errorf("mob %q: name is not a known EntityType and no entityType override is set", m.Name)
}
```

(This code is *inside* the `mobs` package, so the call is unqualified —
`ResolveEntityType(...)`. Shown qualified above only for clarity.)

### 3. `NewMob` uses the shared resolver + panics (dedupe + honest failure)

- Delete the package-level `types` map (`mob.go:20-25`).
- Replace the lookup + `log.Fatalf` (`mob.go:60-68`) with:

```go
entityType, ok := mobs.ResolveEntityType(d.EntityType, d.Name)
if !ok {
	// Unreachable for registry-loaded defs: the loader validates resolvability
	// at content load (§27.2.1). Reaching here means a def was built outside the
	// loader (a synthetic sim/test def) with an unresolved EntityType — panic so
	// it fails that unit with a stack trace rather than os.Exit-ing the process.
	panic(fmt.Sprintf("mob %d/%s: EntityType %q unresolved — def bypassed loader validation", d.ID, d.Name, entityKeyOf(d)))
}
```

`ResolveEntityType` returns `AuraApi.EntityType`; convert with
`model.EntityType(entityType)` at the existing assignment (matching today's
`model.EntityType(id)`). Drop the now-unused `log` import from `mob.go` **only
if** no other `log.` call remains in the file (there are `log.Printf`s in the
equip loop — so `log` stays; confirm during edit). `entityKeyOf` is just the
override-else-name expression inlined — no new helper needed; the message can
build the key locally.

## Test strategy (TDD — write failing tests first)

**Backend, `items/mobs/definitions_test.go`:**
- `TestMapMobDefinition_UnknownNameFallbackFails` (new) — a def with **no
  override** and a `name` that is not an EntityType → `mapToMobDefinition`
  returns an error mentioning the name. This is the regression pin for §27.2.1;
  it fails on `main` (the name-fallback loads clean today).
- `TestMapMobDefinition_AbsentEntityTypeStaysEmpty` (existing, name `Dodo`) must
  stay green — a valid name with no override still loads, `def.EntityType`
  empty. Confirms the fix doesn't over-reject.
- `TestMapMobDefinition_UnknownEntityTypeFails` (existing, override
  `NoSuchWireType`) must stay green — the override path still fails with its own
  message.

**`items/mobs` resolver:**
- `TestResolveEntityType` — override wins over name; empty override falls back to
  name; unknown key → `ok == false`. Pure unit, no fixtures.

**`model/mob/mob_test.go`:**
- Line 288 (`assert.Equal(t, types["Dodo"], m.Type())`) references the deleted
  `types` map → swap to `AuraApi.EntityTypeDodo`. Not a behavior change; keeps
  the existing spawn test green.
- Optional: `TestNewMob_PanicsOnUnresolvedEntityType` — a synthetic def with a
  bad EntityType → `require.Panics`. Pins the direct-construction guard so a
  future "just delete it" doesn't pass silently.

Full suite: `go test ./...` (29 pkgs) green, `go vet` clean, `go build ./...`
clean.

## Verification checklist (per project "Sanity checks")

- [ ] `cd backend && go build ./...` clean
- [ ] `go vet ./...` clean
- [ ] `go test ./...` green (29 pkgs) — new pins fail on `main`, pass after
- [ ] Boot over real content: `./aurad -dev -content ../api` loads all mobs with
      **0 load errors, 0 panics** (all names already resolve — regression check
      that the new guard rejects nothing legitimate)
- [ ] Negative boot check: temporarily point one `api/mobs/*.json` `name` at a
      non-EntityType (no override) → boot **fails with the load error**, not a
      first-spawn crash. Revert.
- [ ] `make -C backend build` (runs `cp-defs`) — the fix is Go-only, no schema/
      JSON change, so no frontend rebuild needed (unlike §26).
- [ ] In-game smoke: join, spawn/encounter a mob, confirm normal render (no
      DebugCircle regression). Optional — the negative boot check + tests cover
      the logic; this confirms no accidental EntityType mis-assignment.

## Scope notes

- **No wire/schema/JSON change** — pure Go. No FlatBuffers regen, no frontend
  touch, no content edits.
- **Sim unaffected** — it hardcodes `EntityType: "Dodo"` (valid); it now routes
  through `ResolveEntityType` like everything else, no behavior change.
- **Determinism unaffected** — this touches type resolution only, not RNG
  (§27.2.2) or spawn order.
- Leaves §27.4 items #6 (`§27.2.3` mob regen → `conf.json`) and #7 (the small
  §27.2.8/§27.3.3 hygiene) as the next unscheduled §27 work.

## Cross-links

- `docs/backlog.md` §27.2.1 (the finding), §27.4 (order — this is item #3),
  §27.2.2 (`b4b0e66d`, the sibling `mob.go` fix whose comments this mirrors)
- `docs/research-code-quality.md` §5 (three-logging-styles — this removes the
  last `model/` `log.Fatalf`)
- `sys/skills.go:1497` (the house "guards direct construction" idiom this adopts)
