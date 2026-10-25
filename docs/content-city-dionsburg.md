# Content — The City: Dionsburg

**Design intent for the city hub.** What Dionsburg is supposed to *be and do*:
its districts, its buildings, the hill it stands on, and the layout rules the
PO has ruled. Exact positions live in `api/zones/world.json` (area
`city-hub`), authored in Tiled, and are never mirrored here. Numbers are
[PLACEHOLDER] unless marked FINAL.

**Owns:** the city's layout decisions. **Not here:** the prop kit and its art
(`archive/plan-city-assets.md`, `docs/art/assets.csv`), where the city sits in
the world (`content-world.md`: the hub, three entrances), the shared
level-design primitives (`content-zone-design-guide.md`), cliff mechanics
(`plan-cliffs.md`).

---

## 1. What the city is

The hub between the early zones and the war in the south. A walled town of
humans, dwarves, gnomes and elves, with the orc front just beyond the south
gate: soldiers march out through the south, the wounded come back the same
way. The banner reads "Dionsburg — Walls and Wells".

Built so far (all 2026-10-24): streets, decals and props `801f3dbd`; the roof
kit with four new buildings `ffa21785`; Cathedral Hill (uncommitted at the time
of writing).

## 2. Districts

PO brief, 2026-10-24. ⭐ **The districts stay where they were first built**
(PO, same day): a full organic re-layout was drafted and REJECTED ("I did not
like your planned layout"). Changes are made inside the existing layout, small
and one at a time.

```text
              north gate
   gnome craft    |    dwarven military · jail
        (NW)      |          (NE)
 west   market  fountain  ══ CATHEDRAL HILL ══════════
 gate    (W)    square    town hall · cathedral · cemetery
 (shut)           |       library · mage tower    (E/SE)
   slum (SW)      |
   lazaret        |
              south gate → the orc front
```

| District | Where | What it holds |
| --- | --- | --- |
| Market + fountain | west of centre, by the (shut) west gate | stalls, the central fountain square, the bind point |
| Gnome craft (Handwerk) | NW | the workshop, cranes, boiler, lumber |
| Dwarven military | NE | barracks with watchtowers, the jail (stays beside the barracks, PO), the Anvilguard Forge |
| Cathedral + cemetery | east | the cathedral, its cemetery against the east wall |
| Town hall | north of the cathedral nave | civic seat; the Governor stands inside |
| Library + mage quarter | SE | the library, the elven mage tower, moon pool, pylons |
| Slum + lazaret | SW, toward the south gate | tents, lean-tos; the wounded soldiers are treated by the gate |
| South gate | south | guard post and guard spawns facing the orc war |

- **Wells** are spread through the districts (the "Wells" in the banner).
- **Trees and bushes** line the roads and mark key points (PO started it,
  2026-10-24).
- **The cemetery is a doorway, not only a graveyard** (PO): it leads to a
  high-level dungeon (the crypt) and to a tunnel to the zone east of the city.
  Both are **moved there and stubbed** (PO "move + stub"): the crypt entrance is
  a prop, the tunnel exit is hidden. Neither destination is built.

## 3. Buildings

**One pattern for every walk-in building:** a `Wall` path inside the roof's
edge, a door gap with a `Doorway` prop outside it, a `Flagstone` floor region
whose id names the place (its banner in `api/lang/{en,de}/regions.arb`), and an
interior of props. Roofs reveal as you walk under them.

**Roofs come from the modular roof kit** (PO 2026-10-24): three pieces (span,
hip end, L-corner) on a 2 × 4 module, in four tinted materials (Slate, Clay,
Stone, Copper), so any rectangle, L, U or Z roof is assembled rather than
drawn. A building's district shows in its roof colour.

Added with the kit (PO 2026-10-24, names chosen by the PO):

| Building | Where | Roof |
| --- | --- | --- |
| The Gilded Tankard (tavern) | NW of the fountain, an L with a beer garden in the notch facing the square. ⚑ PO correction: NW, not NE, so it does not fight the town hall for space | Clay |
| Dionsburg Town Hall | north of the cathedral nave; the Governor moved inside (PO) | Slate |
| Anvilguard Forge | left of the barracks, in the space the PO cleared | Stone |
| Library | grown by one roof segment, then moved up toward the cathedral by the PO | (its own art) |
| Mage tower | enlarged by the PO (it felt small) | (its own art) |

## 4. Cathedral Hill

⭐ **The east of the city stands on a rise** (PO 2026-10-24). The hill is
visual only: there is no height in the game. A wall line stops movement and
the art shows the drop; auras still reach up and down the slope.

### 4.1 What is up, what is down

- **Up:** the town hall, the cathedral, the cemetery, the library, the mage
  tower and the whole SE corner. The city walls close it east and south.
- **Down:** the market and the fountain square (they need flat, open access
  from the west), the slum (the lowest, poorest corner: rich up, poor down
  tells the story by itself), the south gate front with its guard post, the
  gnome quarter.
- **The north side has no wall:** the ground rises gently from the dwarven
  road to the cathedral, and the wall starts just east of the town hall.

### 4.2 The edge

- **One retaining wall** faces the square: it starts north of the town hall,
  turns round its NW corner (PO 2026-10-24), runs south past the cathedral's
  west front, and continues past the guard post into the south city wall.
- **Masonry, not rock** (`Retaining Wall` profile): the city holds its terrace
  up with a built wall. Natural `Cliff` stays for the wild zones.
- **The wall's ends step down course by course**, like a garden wall following
  a slope (PO: the pointed cliff end "doesn't look convincing for walls").
- **The south end tucks under the city wall** (PO): the wall paths come
  before the city wall in the path list, so the city wall draws over them.

### 4.2a The ground up top

- **The hill wears `Upper City`, not the `City` dirt** (PO 2026-10-25):
  pale swept gravel (`upper-ground` tile), one region laid right after the
  `city-hub` region so the building floors still draw over it.
- **Its edge:** the retaining wall's upper face on the west, 0.5 inside the
  city wall east and south, and 2.25 south of the dwarven road on the north,
  where no wall stands. The profile's 1.5 fade lies outside the polygon, so
  it hides under the walls and shows only as the gentle rise up from the road.
- **Move the retaining wall, move the region's west edge with it.**

### 4.3 The ways up

- **Two stairs** from the square (`CityStairs`): the grand stair to the
  cathedral's west door, and a smaller one for the town hall lane.
- **One road up** (PO 2026-10-24): the main road climbs through the only gap,
  south-west of the cathedral. The south gate road meets it below the gap; the
  cathedral's south street branches off it on the hill, by the signpost.
- **To make room,** the market and the fountain square moved 4 west, tapering
  to nothing at the west gate (PO 2026-10-24).

### 4.4 Options weighed and dropped

- **A separate knoll for the mage tower,** with a sunken lane between it and
  the library: dropped, the PO folded the tower into the hill to keep it
  simple.
- **A second rise for the dwarven keep (NE):** held back. Next to the cathedral
  hill it would turn the dwarven street into a gully; revisit after the first
  hill has been seen in play.
- **An enclosed plateau with levels** (`plan-cliffs.md` §8, Option B): stays
  parked. The PO wants ground that rises at one end and simply continues.

## 5. Layout rules (for whoever edits the city next)

- **Small changes inside the districts** (§2), never a re-layout without the PO.
- **A wall line faces the way it is drawn:** walking along it from its first
  point, the face (the low side) is on your right hand, so a line drawn north
  to south faces west and one drawn east to west faces north. Draw it along
  the middle of the face.
- **Straight legs:** masonry stretches visibly around a bend; corners are
  mitred joints between straight runs.
- **Gaps:** a stair gap uses flat wall ends and a stair prop across; a road gap
  uses stepped (`fade`) ends either side of the road.
- **Path order is draw order** within the area: anything that must draw over
  the retaining wall (the city wall) comes after it.
- **The guard post, the market and the slum stay on the low ground;** nothing
  civic or sacred moves down.

## 6. Open

- ⚑ **The Governor's spawn is filed under the `deep-woods` area** although he
  stands in the town hall: harmless in play, confusing in Tiled. Move it into
  `city-hub` when convenient.
- ⚑ **The Governor's lines may still place him at the gate** beside the City
  Guard; unchecked since the move.
- ⚑ **German region titles** (Schmiede Ambosswacht, Zum Goldenen Krug, Rathaus
  von Dionsburg) are owed the PO's review.
- ⚑ **The roof kit's tinted Tiled previews** (one SVG copy per material, Tiled
  only): keep or drop, unruled.
- **Placeholder art:** `CityStairs` and the `Retaining Wall` tile are
  placeholders (`docs/art/assets.csv`).
- **Not built:** the crypt dungeon and the east tunnel's destination (§2).
