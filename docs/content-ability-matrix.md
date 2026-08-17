# Content - The Ability Matrix (possibility space)

**Written 2026-08-10 as a design/planning pass. Nothing here is built.**

> ⛔ **PARKED 2026-08-10, same day.** PO ruling: the real content pass happens
> **once the desired effect types and the known holes are closed**, not before.
> Which makes this doc an **input** to that work rather than a plan competing
> with it: §2 (what the dispatch actually allows) and §7 (what the vocabulary
> cannot express) are the hole list to close.
>
> **§8 and §9 are provisional and must not be read as decisions.** The four
> directions in §9 were given against a hypothetical framing and were explicitly
> ruled **provisional, to be revisited at the content pass**. §1 to §7 are
> measurements against the tree and stand on their own.

This doc answers one question: *given the effect vocabulary the engine has
today, what is the complete space of auras, passives and cooldowns we could
author for a release version, and how big is it?*

It is a **map of the possibility space and the empty cells**. It is deliberately
not a fourth copy of the content tables:

| What | Lives in |
|---|---|
| Numbers, unlock sources, drop chances | `content-skill-inventory.md` (generated from data) |
| Per-ability design intent, why it exists | `content-auras.md` · `content-passives.md` · `content-cooldowns.md` |
| Recipes | `content-recipes.md` |
| **The grid, the empty cells, the count** | this file |

Every number in a proposed cell is **[PLACEHOLDER]** by project rule, and every
proposed *name* is a working title for the PO to accept, rename or reject.

**Scope: player skills**, 52 files in `api/skills/` on 2026-08-10. The 37
mob-only skills in `api/skills/mobs/` use the same vocabulary and the same grid;
they are authoring details of their mobs and are not counted here.

⚑ **`content-skill-inventory.md` has drifted twice over, and both ways cancel
out.** Its prose still says "the 50 player skills" while its tables already list
52 rows; of those rows one (Recall) no longer exists as content, and one that
does exist (Discipline) is missing. Regenerate it before trusting any per-skill
line, exactly as its own header warns.

---

## 1. The atoms - what the engine can express today

Seven independent axes. Read against `backend/pkg/aura/skills/definition.go`
(the loader) and `backend/pkg/aura/sys/skills.go` (the dispatch) on 2026-08-10.

### 1.1 Category (3)

| Category | Runtime shape | Slot rule |
|---|---|---|
| `active_aura` | ticks continuously on a cadence while active | **exactly one active at a time** (loadout of several, switchable) |
| `passive` | folded once at equip time into `DerivedStats` | several run in parallel |
| `cooldown` | fires once per activation, then a timer | several equipped, triggered individually |

### 1.2 Effect types (31 authorable)

⚑ Re-counted 2026-08-17 off `effectTypeMap`: the 2026-08-10 figure (28 in the
enum, 27 reachable) predates `stun`, the three retaliate types and
`instant_resist`. Re-derive it rather than incrementing it.

Grouped by what a player would call them:

| Family | Effect types |
|---|---|
| **Direct output** | `damage_aura` · `instant_damage` · `heal_aura` · `self_heal` |
| **Over time** | `dot_aura` · `instant_dot` · `hot_aura` · `instant_hot` |
| **Absorb** | `shield_aura` · `instant_shield` |
| **Mitigation** | `resist_aura` · `resist_passive` · `instant_resist` |
| **Control** | `slow_aura` · `stun` · `calm` · `charm` |
| **Threat** | `taunt` · `detaunt` |
| **Movement / tempo** | `dash` · `speed_burst` · `tick_rate` |
| **Triggered riders** | `lifesteal_burst` · `retaliate_slow` · `retaliate_damage` · `retaliate_burst` |
| **Scalars** | `stat_multiplier` (6 stats) |
| **Other** | `light_aura` · `spawn` · `revive` · `recall` |

⚑ **`recall` is an orphan.** No skill in `api/skills/` authors it any more:
`plan-downtime.md` D7/D8 made Recall a baseline utility every character holds
from creation, riding the wire's `UtilityKind` rather than the skill catalog.
The effect type still exists and still dispatches, so it is a free cell if a
*second* teleport ability is ever wanted.

### 1.3 Damage types (6, closed vocabulary)

`physical` · `fire` · `frost` · `nature` · `poison` · `bleed`

Closed on purpose: an unknown type is a typo, not an extension point. A type is
**mechanically** meaningful only where a resistance exists to read it; otherwise
it is flavour and a colour. That distinction drives the honest count in §6.

### 1.4 Gate keys (2, closed vocabulary)

`harvest` · `smash`. A gated damage payload hits **only** mobs that opt in by
naming the key, and carries no damage type at all (authoring both hard-fails).
This is the lock-and-key chore axis, not a resistance.

### 1.5 Stats for `stat_multiplier` (6)

`movementSpeed` · `maxHealth` · `damageReduction` · `critChance` ·
`damageDealt` · `costReduction`

### 1.6 Riders on a damage payload (5, all optional, all composable)

`executeBelowFraction` + `executeBonusFactor` · `berserkerMaxBonusFactor` ·
`critChance`/`critFactor` · `lifestealFraction` · `variance`

Composition order is fixed: base × berserker × execute × crit, then variance,
then the target's mitigation.

### 1.7 Shape knobs (the variant axes)

Radius (+per level) · tick interval (+per level) · selector
(`nearest` / `lowest_health` / `all`) · `maxTargets` (+per level) ·
`targetsEnemies` / `targetsAllies` / `targetsSelf` / `targetsStructures` ·
`targetFactions` allowlist · cost fraction · buff durations · cooldown length ·
`maxLevel` and every per-level slope.

**These make variants, not new abilities.** The shipped precedent is explicit:
Damage, Wild and LongRangeStrike are one cell at three geometries, and the
catalog already flags Wild as the trap variant because its geometry does not buy
enough. Keeping shape knobs out of the base count is what stops the number
becoming fiction.

---

## 2. The dispatch grid - which cells are alive

⚑ **The loader does not validate category against effect type.** A `dot_aura`
authored on a passive loads clean and then does nothing, because
`recomputeDerived` only reads four effect types. What decides whether a cell
exists is the **runtime dispatch**, in three places:

- aura tick: `sys/skills.go` (7 types) plus `light_aura`, which is projected
  rather than ticked
- passive fold: `skills/component.go recomputeDerived` (4 types) plus
  `light_aura`, read by the light scan
- cooldown fire: `sys/skills.go fireCooldown` (18 types)

| Effect type | active_aura | passive | cooldown |
|---|:--:|:--:|:--:|
| `damage_aura` | ✅ | ✗ | ✗ |
| `instant_damage` | ✗ | ✗ | ✅ |
| `dot_aura` | ✅ | ✗ | ✗ |
| `instant_dot` | ✗ | ✗ | ✅ |
| `heal_aura` | ✅ | ✗ | ✗ |
| `self_heal` | ✗ | ✗ | ✅ |
| `hot_aura` | ✅ | ✗ | ✗ |
| `instant_hot` | ✗ | ✗ | ✅ |
| `shield_aura` | ✅ | ✗ | ✗ |
| `instant_shield` | ✗ | ✗ | ✅ |
| `resist_aura` | ✅ | ✗ | ✗ |
| `resist_passive` | ✗ | ✅ | ✗ |
| `instant_resist` | ✗ | ✗ | ✅ |
| `slow_aura` | ✅ | ✗ | ✗ |
| `stun` | ✗ | ✗ | ✅ |
| `calm` | ✗ | ✗ | ✅ |
| `charm` | ✗ | ✗ | ✅ |
| `taunt` / `detaunt` | ✗ | ✗ | ✅ |
| `dash` | ✗ | ✗ | ✅ |
| `speed_burst` | ✗ | ✗ | ✅ |
| `tick_rate` | ✗ | ✗ | ✅ |
| `lifesteal_burst` | ✗ | ✗ | ✅ |
| `retaliate_slow` | ✗ | ✅ | ✗ |
| `retaliate_damage` | ✗ | ✅ | ✗ |
| `retaliate_burst` | ✗ | ✗ | ✅ |
| `stat_multiplier` | ✗ | ✅ | ✗ |
| `light_aura` | ✅ | ✅ | ✗ |
| `spawn` | ✗ | ✗ | ✅ |
| `revive` | ✗ | ✗ | ✅ |
| `recall` | ✗ | ✗ | ✅ (orphaned) |

**32 live (category × effect) cells.** Everything below is built on this grid.

⭐ **The resist row's cooldown cell went live 2026-08-17** (plan-effect-types.md
C3, D5): `instant_resist`, the `instant_shield` twin, delivering a timed
resistance buff to allies in a one-shot query circle. Invulnerability is its
first content, but the type is generic on purpose - an ordinary five-second
fire ward on a cooldown is now content with no code.

The obvious structural holes it shows, each cheap in code and each a real design
question rather than an oversight:

- **no aura-form control except slow** (a taunt aura, a fear aura, a stun aura)
- **no cooldown-form light** (a flare)
- **no passive-form output** by design (a passive that ticks damage would be a
  second active aura that dodges the one-slot rule)
- **no aura-form threat** (a tank has no sustained aggro tool, only Taunt's
  pulse)

---

## 3. The single-effect matrix (tier 1)

Fully expanded: each live cell times its content axis. ✅ = shipped and named,
◻ = empty and authorable **today with zero code**, working title in italics.

### 3.1 Damage by type and delivery

| Damage type | aura (`damage_aura`) | dot aura (`dot_aura`) | burst (`instant_damage`) | applied dot (`instant_dot`) |
|---|---|---|---|---|
| physical | ✅ Damage / Wild / LongRangeStrike / Berserker / Vanguard-line | ◻ *Rend Aura* | ✅ DamageBurst / Shockwave | ◻ *Lacerate* |
| fire | ◻ *Ember Aura* | ✅ Immolate / Wildfire | ✅ NovaBurst | ✅ Ignite |
| **frost** | ✅ Suppression (only) | ◻ *Frostbite* | ◻ *Glacial Burst* | ◻ *Chillbrand* |
| **nature** | ◻ *Bramble Aura* | ◻ *Spore Cloud* | ◻ *Nature's Wrath* | ◻ *Blight* |
| poison | ◻ *Venom Aura* | ◻ *Toxic Aura* | ◻ *Venom Burst* | ◻ *Envenom* |
| bleed | ✅ Reaper (only) | ◻ *Hemorrhage* | ✅ DamageBurst / Shockwave (with physical) | ◻ *Deep Wound* |
| GATE `harvest` | ✅ Harvest | n/a | ◻ *Scythe* (a burst harvest) | n/a |
| GATE `smash` | ✅ Pickaxe | n/a | ◻ *Blast Charge* | n/a |

**8 of 24 typed damage cells filled, 2 of 4 gated.** The two whole rows are the
big empty blocks: **nature has no skill at all**, and frost has exactly one, in
a combination result.

⚑ **Do not trust the `DamageTypes` comment in `definition.go:201`.** It says
"frost and nature ship with no skill carrying them (D4, accepted deliberately)",
and the frost half was **never true**: commit `40d9b204` (numbers rewrite Pass 1)
added that comment and gave Suppression its `["frost"]` tag in the same commit.
Before it, Suppression authored no tags at all and defaulted to physical.
Nothing catches this, and nothing can: `frost` is a legal member of the closed
vocabulary, so the loader is satisfied, and no test asserts the claim. Read as
design intent it says "frost is deliberately empty, leave it"; the truth is
"frost has one skill and it is a late-game combination result", which is a
different content decision. The nature half is still accurate.

⚑ **The PO's own example lives here.** "An aura with a slow might be a Frost
Aura" is not a single cell: it is `damage_aura(frost)` **plus** `slow_aura` on
one skill, which is a tier-3 two-effect skill and is exactly the shape
Suppression already ships in (LRS-range damage plus a slow at the same radius).
Suppression is the mechanic; *Frost Aura* is the name that mechanic should have
had. That is worth deciding before more of the frost line is authored.

### 3.2 Healing, absorb, mitigation

| | aura | passive | cooldown |
|---|---|---|---|
| direct heal | ✅ Heal / Lifewarden / Paladin / Vanguard-line | n/a | ✅ FirstAid (self) · ◻ *Mend* (ally instant heal) |
| heal over time | ✅ Rejuvenation | n/a | ✅ Recover (self) · ◻ *Renew* (ally HoT) |
| absorb | ✅ Vanguard / Warbanner | n/a | ✅ Barrier |
| resist `physical` | ◻ *Bulwark Aura* | ✅ ThickHide | ◻ *Brace* |
| resist `fire` | ✅ FireWard / Wildfire | ◻ *Fireproof* | ◻ *Flameguard* (timed) |
| resist `frost` | ◻ *Warmth Aura* | ◻ *Coldblood* | ◻ *Thaw* |
| resist `nature` | ◻ *Verdant Ward* | ◻ *Barkskin* | ◻ *Purge* |
| resist `poison` | ◻ *Cleansing Aura* | ✅ Antivenom | ◻ *Antitoxin* |
| resist `bleed` | ◻ *Staunch Aura* | ◻ *Clotting* | ◻ *Field Dressing* |
| resist **all** (`*`) | ✅ Aegis | ◻ *Aegis Sigil* | ✅ Sanctuary |

**5 of 21 resist cells filled.** ⚑ The block grew twice in one week: the
cooldown column stopped being `n/a` when `instant_resist` shipped (C3, D5), and
the wildcard row is new with it - `resistTags: ["*"]` covers every damage tag
at once, which at factor 0 is invulnerability and above 0 is a blanket ward.
Every empty cell in the block is pure content. Resistances are the thing that makes a damage
type mechanical rather than cosmetic, so §3.1 and this block have to be filled
in step with each other: a frost line with no frost resistance anywhere is a
colour, not a build axis.

⚑ **Vulnerability is proven on the mob side and missing on the player side.**
A resistance factor **above 1** means "takes more", and shipped content already
uses it: `fire-elemental.json` and `greater-fire-elemental.json` author
`{"fire": 0.25, "frost": 1.5}`, so a fire elemental takes 150% from frost.
Bears author `{"frost": 0.5}`. The mechanic works and is live.

What did **not** exist is a player ability that *inflicts* it. `resist_aura`
takes the same factor and a target-flag set, so a factor above 1 aimed at
enemies should read as "this target takes more fire damage", but nothing in the
content did this and nothing pinned it. That was the unverified half.

⭐ **VERIFIED AND CLOSED 2026-08-16 (plan-effect-types.md C1, D1).** It works,
it is pinned at three layers (the buff store, `applyResistAura`'s eligibility,
and the `takeDamage` read seam), and the first curse ships:
**FireVulnerability** (id 66), `resist_aura` + `resistFactor: 1.2 +0.05/L` +
`targetsEnemies`, with `targetsAllies` and `targetsSelf` off so a group can
stand inside it. Zero new effect types. ⚑ One real defect was in the way and is
fixed (D2): the buff store's per-source "strongest" pick was lowest-factor
outright, correct for wards and inverted for curses, so two casters of one
vulnerability skill at different levels landed the *weakest* of the pair.
"Strongest" is now the factor furthest from 1 in either direction.

So the resist block does double into a *ward* half and a *curse* half (*Fire
Vulnerability* is authored; *Sunder*, the physical twin, is still an empty
cell), and it is the cleanest support role the game did not have. **Every
remaining curse cell is now pure content**: a vulnerability aura per damage
type, and the same payload on `resist_passive` for a permanent version.

⭐ **INVULNERABILITY CLOSED 2026-08-17 (plan-effect-types.md C3, D5/D6/D7),
and it needed no immunity mechanic of its own.** Factor 0 has always meant
immune; what was missing was a tag list that covers *everything* and a
cooldown delivery for a resist buff. Both landed as one small chunk: the
reserved wildcard `"*"` (map-shaped resistances understood it since item 11;
the tag-list resist BUFFS now do too, per hit tag) and the generic
`instant_resist` type. Two skills ship: **Sanctuary** (id 69, cooldown, 5 s of
immunity on the nearest ally, +1 ally per level) and **Aegis** (id 70, aura,
the same immunity held on a 3 s cadence). ⚑ The aura half needed one new
authoring lever, and it is a PRICING lever, not a duration knob:
`buffLifetimeMatchesInterval` drops the standard interval + 1 lifetime so the
buff expires exactly as re-application arrives. Without it an invulnerability
aura would pay once (a refresh is not work, R2 / §5.2) and hold somebody
immortal for free. With it, every cycle at base cadence is a fresh application
and is charged, while a `tick_rate` haste arrives early enough to refresh for
nothing - so tick speed is the investment that makes holding one affordable.
The known cost is an accepted once-per-cycle ordering window where an enemy
aura processed earlier in the same pass lands one hit unprotected (explicit PO
ruling: counterplay texture, documented, not fixed). Neither skill has any new
visibility: an immune target lights the ordinary teal resist pip, and immunity
otherwise reads as damage numbers that stop appearing (D10).

### 3.3 Control, threat, movement, tempo, light

| | aura | passive | cooldown |
|---|---|---|---|
| slow | ✅ Slow / Suppression / Warbanner | ✅ FrostShield (retaliate) | ◻ *Cripple* (needs code: no cooldown slow) |
| stun | ◻ (needs code) | n/a | ✅ Paralyze · ◻ *Concussion* (short, wide) · ◻ *Petrify* (long, single) |
| calm | ◻ (needs code) | n/a | ✅ Calm · ◻ *Pacify* (scoped to bandits/kobolds) |
| charm | n/a | n/a | ✅ CharmBeast · ✅ BindElemental · ◻ *Enthrall* (per faction, one per allowlist) |
| taunt | ◻ (needs code) | n/a | ✅ Taunt |
| detaunt | ◻ (needs code) | n/a | ✅ Fade · ✅ HoldTheLine |
| move speed | n/a | ◻ *Fleetfoot* (`movementSpeed` is the one unused stat) | ✅ Swift |
| blink | n/a | n/a | ✅ Dash · ◻ *Retreat* (backwards), ◻ *Leap* (longer, longer CD) |
| aura cadence | n/a | n/a | ✅ Haste · ◻ *Focus* (longer and weaker) |
| light | ✅ Lantern | ✅ Torch | ◻ *Flare* (needs code) |
| revive | n/a | n/a | ✅ Revive |
| lifesteal | n/a | n/a | ✅ Bloodthirst |
| reflect | n/a | ✅ FireShield (flat amount) | ✅ Retribution (timed % of the hit) |
| scalars | n/a | ✅ Hardy · Tough · KeenEye · Strong · Discipline | n/a |

The `targetFactions` allowlist is a **content** multiplier on the control row:
BindElemental exists precisely to prove that a second charm needs zero Go
changes. Every faction in the registry is therefore a free calm/charm ability,
at the cost of one JSON file each.

### 3.4 Companions (`spawn`) - where the grid becomes recursive

A `spawn` effect names a mob, and that mob carries **its own skill loadout drawn
from this same grid**. So the companion axis is not one cell, it is the whole
matrix again, once per body type.

| Body | Loadout | Shipped |
|---|---|---|
| Totem (stationary, area denial) | any aura cell | ✅ SummonTotem (poke) · ✅ FireTotem (fire dot, all targets, + light) |
| Companion (mobile, follows, assists) | any aura cell | ✅ SummonCompanion · ✅ CallForAid (3×) · ✅ FieldMedics (2 + medic) · ✅ HoldTheLine (3 shieldbearers + detaunt) |
| Elemental (themed, per damage type) | typed damage aura | ◻ *Summon Fire Elemental* (the mob exists, the skill does not) · ◻ *Frost / Stone / Venom Elemental* |

Named examples that are pure content, no code:

- ◻ *Frost Totem*: totem with `slow_aura`, area denial as control
- ◻ *Healing Totem*: totem with `heal_aura`, the group support totem
- ◻ *Thorn Totem*: totem with `dot_aura(nature)`
- ◻ *Watchfire*: totem with `light_aura`, portable light for the tunnels
- ◻ *Ward Totem*: totem with `resist_aura`, a resistance station for a boss
- ◻ *Taunt Totem*: a body that holds aggro, the tank's decoy
- ◻ *Summon Fire Elemental*: the PO's own example; the FireElemental mob and
  its aura both already exist, so this is one skill JSON

⚑ **Cooldown ≥ max TTL is a content convention, not a rule**, and it is what
keeps summons one-at-a-time. Any new summon must respect it or it stacks.

---

## 4. Multi-effect skills (tier 3)

A skill is a **list** of effects, and every effect is charged and applied
independently. This is where the space stops being countable, and it is also
where the game's most memorable abilities already live.

Shipped: **9 of 52 player skills carry more than one effect** (Paladin,
Suppression, Vanguard, Warbanner, Wildfire, NovaBurst, CallForAid, FieldMedics,
HoldTheLine). Every one of them reads as a distinct fantasy rather than as a
number tweak, which is the argument for treating this tier as the release
content strategy rather than as an exotic corner.

The named shapes worth having, all authorable today:

| Shape | Effects | Working title |
|---|---|---|
| damage + slow | `damage_aura(frost)` + `slow_aura` | *Frost Aura* (the PO's example; Suppression is this mechanic under the wrong name) |
| damage + light | `damage_aura(fire)` + `light_aura` | Wildfire ✅ (already) |
| damage + self-resist | `damage_aura(X)` + `resist_aura(X, self)` | *Elementalist* line, one per type |
| heal + shield | `heal_aura` + `shield_aura` | *Warden* |
| burst + dot | `instant_damage` + `instant_dot` | NovaBurst ✅ |
| burst + stun | `instant_damage` + `stun` | *Skullcrack* |
| dot + slow | `dot_aura(poison)` + `slow_aura` | *Miasma* |
| summon + buff | `spawn` + `instant_shield` | HoldTheLine ✅ (detaunt variant) |
| taunt + shield | `taunt` + `instant_shield` | *Bulwark*, the missing tank cooldown |

**The combination system is the sanctioned mechanism for this tier.** Recipes
are curated, cross-category, and stack recursively (a combination result can be
an ingredient). The calibration rule is already fixed: results sit at roughly
70% of their components' standalone values, side-grades are *different, never
better*, and Vanguard plus its C7 trio is the one sanctioned power ceiling.

---

## 5. The pruning rules - what makes a cell *relevant*

The grid is bigger than the game. Six standing rules cut it down, and every one
of them is already ruled:

1. **One active aura at a time.** Two auras doing the same job at different
   geometry compete for a single slot, so the second one only earns its place if
   it is a genuine side-grade. This is the hardest filter on the whole matrix
   and it applies to the biggest row (damage).
2. **No targeting.** `selector` + `maxTargets` is the only aim there is.
   Anything whose design needs a chosen target cannot exist.
3. **Heal auras never heal the caster.** Self-sustain has to be a cooldown, so
   the heal row is structurally split rather than duplicated.
4. **Free baseline.** The base damage aura stays free at every resource level;
   no cost curve may leave a player with no action.
5. **Combination calibration.** Results ≈70% of components; unlock variants are
   side-grades. Vanguard is the one named exception, not precedent.
6. **`applied_effects` is a full ubyte** (backlog §39). Every *new* visible-buff
   archetype ships without its own pip until that widening. Paralyze and
   Bloodthirst are already queued on it, and a stun is currently
   indistinguishable from a slow on the wire. This is a real cap on how many
   *distinct-feeling* buffs can ship before the wire work is done.

---

## 6. The count

Three tiers, each with the formula visible. All of it [PLACEHOLDER]-class.

### Tier 1 - mechanically distinct single-effect abilities

```
  typed damage      4 cells × 6 damage types      = 24
  gated damage      2 deliveries × 2 gate keys    =  4
  resistance        3 cells × 6 damage types      = 18
  wildcard resist   3 cells × 1 ("all damage")    =  3
  stat multiplier   1 cell  × 6 stats             =  6
  everything else   22 cells × 1                  = 22
                                                   ---
                                                    77
```

**77 mechanically distinct abilities are authorable today with zero code.**

⚑ The resistance block grew by 9 on 2026-08-17 (C3): `instant_resist` added a
third delivery to all six damage types, and the wildcard tag added an
"all damage" subject across the three.

Measured against `api/skills/*.json` on 2026-08-10: **39 filled, 29 empty** of
the 68 cells that existed then. The 9 new cells add 2 filled (Sanctuary, Aegis)
and 7 empty; a full re-measure is owed at the next content pass. The empties are
not scattered; they cluster:

| Empty block | Cells | What is missing |
|---|---|---|
| nature line | 6 | no nature skill of any kind, damage or resist |
| poison line | 5 | players deal no poison at all; only the Antivenom passive exists |
| frost line | 5 | one aura, inside a combination result, and no way for a *player* to gain frost resistance (mobs already have it: bears 0.5, fire elementals 1.5) |
| bleed line | 4 | rides physical, never stands alone, no bleed resistance |
| physical line | 3 | no physical dot of either delivery, no physical resist *aura* |
| fire line | 2 | no fire damage *aura*, no fire resist passive |
| gated bursts | 2 | Harvest and Pickaxe have no cooldown twin |
| `movementSpeed` passive | 1 | the one unused stat |
| `recall` | 1 | orphaned effect type, no skill authors it |
| **total** | **29** | |

### Tier 2 - variants of a filled cell

Mathematically, one damage cell alone has 2⁵ = 32 rider subsets × 3 selectors ×
3 target-cap bands = **288 shapes**, before radius, cadence, cost and duration.
That number is real and useless: almost none of those shapes are
*distinguishable in play*.

The honest multiplier comes from shipped precedent. The `damage_aura(physical)`
cell carries **five** distinguishable variants (Damage, Wild, LongRangeStrike,
Berserker, Reaper) and the catalog already judges one of them a trap. So:

```
  damage / dot cells        × 3 to 5 variants
  utility + control cells   × 1 to 2 variants
```

Applied to 68 cells with the mix as it stands, that is roughly
**68 × 2.2 ≈ 150** single-effect abilities that stay distinguishable from each
other. Past that, variants start reading as duplicates and the one-aura-slot
rule makes the duplicate dead content.

### Tier 3 - multi-effect and companions

Unbounded by construction:

```
  2-effect skills   C(68,2)  =  2,278
  3-effect skills   C(68,3)  = 50,116
  companions        every body × every aura cell, recursively
```

The ceiling here is **curation and distinguishability, not the schema**. The
recipe system is the sanctioned channel: fixed, hand-designed, undocumented
in-game.

### The defensible band

| | Count |
|---|---|
| Authored today | **52** |
| Tier-1 grid, zero code | **68** (39 used) |
| Tier 1 + distinguishable variants | **~150** |
| Realistic release target (recommendation) | **110 to 140** |
| Upper bound before abilities read as duplicates | **~180 to 200** |

A release at ~120 abilities means roughly **doubling** what exists, and the
arithmetic says that is reachable **without a single new effect type**: filling
the 29 empty tier-1 cells plus one or two variants each, plus 25 to 35 curated
combination results, lands squarely in the band.

---

## 7. What the vocabulary cannot express

The inverse list, which is the other half of the question. Each of these needs
Go work, and each is a genuine design question rather than an omission:

| Missing | Notes |
|---|---|
| ~~**Reflect / damage return**~~ **RESOLVED 2026-08-17** | Built as predicted (plan-effect-types.md C2, D3/D4): `retaliate_damage`, the `retaliate_slow` twin, on the same passive spine and the same trigger site. The one decision that was not obvious is PO ruling D4 — the reflect leaves through the mob's ORDINARY player-damage entry with the wearer as toucher, so it takes the attacker's resistances, builds threat, makes the wearer a participant, and a reflect-only kill pays XP and kill credit. A bare health deduction was explicitly rejected; without it, a shield would have been the one damage source in the game that cannot finish a fight. Shipped as content (*FireShield*, id 67). No wire or DB change. ⭐ **The percentage half followed on 2026-08-17** (PO ruling): `retaliate_burst`, a cooldown that puts a timed self-buff up, structurally a `lifesteal_burst` read from the hit side rather than a second FireShield. Its share is of the PRE-MITIGATION swing (so a tanky build does not weaken its own reflect), its damage type is authored on the skill rather than mirrored from the incoming hit, and level buys share rather than uptime. The two reflects compose as TWO separate attributed deliveries, never one summed hit, because each carries its own damage type. Shipped as *Retribution*, id 68. |
| **Knockback / displacement of others** | `dash` moves only the caster. No effect moves a target. |
| **Player-targeted CC** | Deliberately inert (`plan-skill-vocab` §3.1); the cc-and-retaliation plan's open question 3 scoped "can a mob stun a player" out of v1. |
| **Silence on its own** | `stun` bundles movement plus cast suppression. A cast-only lock is one gate away but does not exist. |
| **Cleanse / dispel** | No effect removes a buff or debuff. There is no counter to a dot except outlasting it. |
| **Ally buffs of any kind** | `stat_multiplier` is equip-time and self-only, `speed_burst` and `tick_rate` and `lifesteal_burst` are all self-only. The "Fly, You Fools!" idea (speed up allies, not yourself) is not authorable. **This is the biggest single gap for the group-support pillar.** |
| ~~**Vulnerability debuffs**~~ **RESOLVED 2026-08-16** | It WAS already authorable: `resist_aura` with `resistFactor > 1` and `targetsEnemies` (plan-effect-types.md C1, D1). Verified, pinned and shipped as content (*FireVulnerability*, id 66). One real defect fell out and was fixed: the buff store picked the *lowest* factor per source as "strongest", which is right for wards and inverted for curses, so two casters of one vuln skill at different levels landed the weakest (D2 — "strongest" is now furthest from 1 in both directions). No new effect type, no wire or DB change. See §3.2. |
| **Stealth / invisibility** | `detaunt` is the nearest thing. |
| **Conditional triggers generally** | `retaliate_slow` and `retaliate_damage` are the only runtime triggers in the game, and they share one site. No on-kill, on-crit, below-X%-HP, or on-dodge hooks. Every "when X happens, do Y" ability is blocked on this, and it is the single highest-leverage addition on this list. |
| **Ground-targeted placement** | `spawn` drops at a caster offset. Area denial only exists where a totem stands. |
| **Resource drain** | There is one resource, so a drain is just damage. Correct by design, listed so nobody proposes it twice. |

⚑ **Root is NOT on this list.** A 100% slow *is* a root: movement and aura
cadence run on independent paths, so a fully-slowed mob stands still and keeps
swinging. That is the distinction the Paralyze chunk turned on.

---

## 8. Recommendation (PROVISIONAL, superseded by the parking)

> This is what was recommended before the parking ruling. It assumed the content
> pass ran next. It does not: the effect types and holes get closed first, which
> reorders everything below. Kept as the reasoning, not as the plan.

If this becomes work, the cheapest order by value:

1. **Fill the resist grid before the damage grid.** Resistances are what make a
   damage type mechanical instead of a colour. 9 empty cells, pure content.
2. **Author one full elemental line end to end** (frost is the obvious pick:
   the name *Frost Aura* is already what the PO reaches for, and slow already
   reads as frost). Aura, dot, burst, applied dot, resist aura, resist passive,
   elemental summon: 7 abilities, zero code, and it proves the pattern for
   nature and poison.
3. **Rename or re-slot Suppression** if *Frost Aura* is to be the frost
   identity. Deciding this before the line is authored is much cheaper than
   after.
4. **Totem and companion loadouts** are the highest ratio of felt novelty to
   authoring cost in the whole document: one JSON file per body, and the body
   art already exists for several.
5. **Then, and only then, the two code additions worth their price:** ally-
   targeted buffs (the group-support pillar has no ability that buffs another
   player) and a general conditional-trigger hook (which unlocks a whole class
   of ability rather than one ability).

Everything in §7 beyond those two is a v2 conversation.

---

## 9. Provisional directions (2026-08-10) - NOT rulings

> ⚑ **Explicitly demoted the same day they were given.** The PO answered four
> scoping questions, then parked the pass and ruled the answers **provisional,
> to be revisited once the effect types and holes are closed**. Nothing here
> binds the content pass, and none of it has been recorded anywhere else on
> purpose. They are kept only so the next session can see what was considered
> and why, and the "consequences to carry" notes stay useful whichever way the
> real decisions land.

**P1 (leaning). Rename Suppression to Frost Aura.** The frost identity goes to the
skill that already has the mechanic rather than to a new one. Consequences to
carry: it is a **combination result**, so the frost fantasy arrives late-game
unless a lower rung is authored under it later; `content-recipes.md`, the three
catalogs and the inventory all name it; and renaming is much cheaper now than
after players have learned the name (the Light to Lantern precedent).

**P2 (leaning). All six damage types get full lines.** Aura, dot aura, burst, applied dot,
resist aura and resist passive for each: the whole 24-cell damage grid plus the
12-cell resist grid. This is the largest authoring load in the document and it
needs **zero code**. It also promotes §7's vulnerability question from curiosity
to blocker, because six resistance lines with no way to exploit them is half a
system. **Nature is the true greenfield** (no skill of any kind) and poison the
strangest gap (players face poison and can resist it, but cannot deal it).

**P3 (leaning). A release target around 110 to 140 abilities.** Roughly double the current 52.
The arithmetic: 29 empty tier-1 cells plus one or two variants each, plus 25 to
35 curated combination results. Reachable without a single new effect type. The
watch item is the one-active-aura rule: past this band the extra damage auras
compete for one slot and the losers become dead content, which is the Wild
trap-pick lesson at scale.

**P4 (leaning). Ally-targeted buffs, named the biggest gap.** The
group-support pillar says players filling roles for each other is essential, not
optional, and today support means healing or shielding and nothing else. This
needs Go work: an ally-targeted buff delivery path, since `stat_multiplier` is
equip-time self-only and `speed_burst` / `tick_rate` / `lifesteal_burst` are all
self-only by construction. The "Fly, You Fools!" idea in `content-auras.md` is
the design that has been waiting for it. Conditional triggers (§7) were the
runner-up and stay unowned.

⚑ **P2 and P4, if they hold, would change §8's recommended order.** Resistances
first still holds (P2 would make them mandatory rather than optional), but the
"one line end to end" step becomes "six lines", and the ally-buff code work
moves from a v2 conversation into scope. §8 is left as written because it
records what was recommended before any of this, and the parking means neither
§8 nor §9 is the plan: that gets written at the content pass.
