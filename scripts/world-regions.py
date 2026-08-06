#!/usr/bin/env python3
"""The ratified region map, as the rule a script can evaluate.

`plan-world-replacement.md` §3.7 (D6-era C1, PO 2026-08-06). O2 asked for a map
that assigns **each combat spawn to exactly one region** — §3.6's boxes did not,
they left 89 spawns in the seams. This is the fix: a priority-ordered rectangle
list over the full 144 x 72 bounds, FIRST MATCH WINS, so totality is structural
rather than checked.

⛔ This file and §3.7 are one fact in two places. If you edit the rectangles
here, edit the table and the grid there in the same commit.

Usage, from the repo root:

    python3 scripts/world-regions.py            # the coverage assert + census
    python3 scripts/world-regions.py --grid     # also render the ASCII map
    python3 scripts/world-regions.py --levels   # C2: which spawns still carry no level

Exit status is 1 if any combat spawn is unresolved — that is §9's coverage
assert, half (a). Half (b) — "spawns inside a chunk's regions that still carry
no decided level" — is `--levels`, and it is C2 that has to drive it to 0.
"""

import argparse
import json
import pathlib
import sys
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent

# (letter, name, x0, x1, y0, y1) — PRIORITY ORDER, first match wins.
# +y is SOUTH (§3.6). The letters are the ones §3.7's grid renders.
REGIONS = [
    ("R", "The front (S)", 24, 72, 24, 36),
    ("P", "NE fire pocket", 60, 72, -36, -24),
    ("D", "Dark forest (NW)", -72, -38, -36, -8),
    ("T", "Dark Tunnel belt (N)", -38, 40, -36, -16),
    ("B", "Bandit horde / NE", 40, 72, -36, -8),
    ("B", "Bandit horde / NE", 24, 40, -28, -8),
    ("F", "Farm / start (SW)", -72, -44, 16, 36),
    ("W", "West wildlife", -72, -30, -16, 36),
    ("K", "Kobold hideout", -30, -4, -16, 36),
    ("M", "Mid road / centre", -4, 30, -16, 36),
    ("V", "East village + Gates", 30, 72, -8, 24),
]

# D10, the ratified band table. The front is deliberately absent: D5 rules its
# difficulty is NOT re-tuned, so it has no target band.
BANDS = {
    "F": (1, 3),
    "W": (2, 6),
    "D": (4, 8),
    "K": (6, 10),
    "M": (8, 12),
    "T": (10, 14),
    "B": (12, 16),
    "V": (14, 18),
    "P": (17, 20),
}


def region(x, y):
    """The region a point falls in, or (None, 'UNASSIGNED')."""
    for letter, name, x0, x1, y0, y1 in REGIONS:
        if x0 <= x <= x1 and y0 <= y <= y1:
            return letter, name
    return None, "UNASSIGNED"


def load():
    """Combat spawns only. `xpFactor: 0` is the non-combat marker — NPCs,
    signs, structures and the 18 ArmySoldiers (D11), which stay out of scope."""
    catalog = {}
    for path in (ROOT / "api" / "mobs").glob("*.json"):
        definition = json.loads(path.read_text())
        catalog[definition["name"]] = definition
    zone = json.loads((ROOT / "api" / "zones" / "world.json").read_text())

    combat, other = [], []
    for spawn in zone["spawns"]:
        factors = catalog[spawn["mob"]].get("factors", {})
        (combat if factors.get("xpFactor", 1) != 0 else other).append(spawn)
    return catalog, zone, combat, other


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--grid", action="store_true", help="render the ASCII map")
    parser.add_argument("--levels", action="store_true", help="report spawns with no level")
    args = parser.parse_args()

    catalog, zone, combat, other = load()
    print(f"{len(zone['spawns'])} spawns: {len(combat)} combat, {len(other)} non-combat")

    unresolved = [s for s in combat if region(s["x"], s["y"])[0] is None]

    counts, species, levels = Counter(), {}, {}
    for spawn in combat:
        letter, _ = region(spawn["x"], spawn["y"])
        counts[letter] += 1
        species.setdefault(letter, set()).add(spawn["mob"])
        levels.setdefault(letter, []).append(spawn.get("level"))

    print()
    names = {letter: name for letter, name, *_ in REGIONS}
    for letter in "FWDKMTBVPR":
        band = BANDS.get(letter)
        band_s = f"{band[0]}-{band[1]}" if band else "unchanged"
        decided = sum(1 for v in levels.get(letter, []) if v is not None)
        print(
            f"  {letter}  {names[letter]:24s} {counts[letter]:4d} spawns  "
            f"{len(species.get(letter, ())):2d} species  band {band_s:9s}  "
            f"level authored on {decided}/{counts[letter]}"
        )

    if args.grid:
        print()
        print("       x=-72                                          x=+72")
        for row in range(18):
            y = -36 + 4 * row + 2
            line = "".join(region(-72 + 3 * col + 1.5, y)[0] or "?" for col in range(48))
            print(f"{y:6.1f} {line}")

    if args.levels:
        print()
        for letter in "FWDKMTBVPR":
            missing = sum(1 for v in levels.get(letter, []) if v is None)
            if missing:
                print(f"  {letter} {names[letter]:24s} {missing:4d} spawns still carry no level")

    print()
    if unresolved:
        print(f"COVERAGE ASSERT FAILED: {len(unresolved)} combat spawn(s) resolve to no region")
        for spawn in unresolved[:20]:
            print(f"    {spawn['mob']:20s} ({spawn['x']}, {spawn['y']})")
        return 1
    print(f"COVERAGE ASSERT OK: {len(combat)}/{len(combat)} combat spawns resolve to exactly one region")
    return 0


if __name__ == "__main__":
    sys.exit(main())
