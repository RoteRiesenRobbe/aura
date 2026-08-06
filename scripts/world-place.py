#!/usr/bin/env python3
"""C2, the re-placement: the authored placement table, as the rule that writes it.

`plan-world-replacement.md` C2 (2026-08-06). C1 ratified the region map
(`world-regions.py` / §3.7) and the band table (D10). This file is the other
half: for every region, WHICH species stand there and WHICH rung of the band
each spawn takes. Running it with `--apply` writes `level` onto all 423 combat
spawns of `api/zones/world.json` and re-skins the 27 spawns the thin regions
need (§3.9).

⛔ This file and §3.10 are one fact in two places. Edit both or neither.

Three rules, and only three — the point of a table this size is that the
judgement lives in PLAN and nothing else is inventing numbers:

  R1  Within a region, rungs ascend by the D6 archetype ratio HPx
      (`baseMaxHealth` / 55). The plate then tracks the fight.
  R2  A species authored a multi-rung range spreads its spawns evenly across
      those rungs ordered by DISTANCE FROM THE START FIRE (`spawnpoint-1`,
      -58.2/+24) — one world-wide geometric axis, so no region has to defend a
      difficulty direction of its own. Ties break on (x, y).
  R3  When a region sheds a species, it sheds the instances FARTHEST from the
      start fire, and the freed points go to the incoming species deepest-first.
      A species retreats toward home; what replaces it arrives from away.

Two authored exceptions, both PO rulings, both narrow:

  D13 the village livestock ring — `wildlife_prey` within RING_RADIUS of the
      village fire keeps its species AND its native curveLevel, inside a 14–18
      region. Without it the only bound fire in the east is ringed by at-level
      hostiles.
  D14 the front (R) has no D10 band (D5: not retuned), so R1 does not apply
      there; its rungs are authored outright.

Usage, from the repo root:

    python3 scripts/world-place.py            # plan the placement, print it
    python3 scripts/world-place.py --apply    # write api/zones/world.json
    python3 scripts/world-place.py --check    # the asserts (exit 1 on failure)

`--check` is §9's test strategy in code: coverage, absent-stays-absent against
git HEAD, the campfire geometry, and the quest species. It reads the file on
disk and does not trust PLAN, except where it has to.
"""

import argparse
import importlib.util
import json
import math
import pathlib
import subprocess
import sys
from collections import Counter, defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
WORLD = ROOT / "api" / "zones" / "world.json"

# The region map is `world-regions.py` and stays there — the hyphen in the name
# is why this is a loader rather than an import.
_spec = importlib.util.spec_from_file_location(
    "world_regions", ROOT / "scripts" / "world-regions.py")
wr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(wr)

# The world's origin of travel — R2's axis. Every "near/far" in this file is
# measured from the farm campfire, because that is where every character starts.
START = (-58.2, 24.0)

# D13. The village fire is the only bound respawn in the east and it sits inside
# a 14-18 region; prey this close to it stays ambient at its native level.
VILLAGE_FIRE = (44.0, 10.5)
RING_RADIUS = 10.0

# The canonical spawn key order — the zone editor's serializer
# (`ZoneModel.ts` getZoneAsJSON). `level` sits between idleSpeedFactor and
# waypoints, so a later editor save round-trips diff-clean.
KEY_ORDER = [
    "mob", "x", "y", "angle", "respawnTicks", "respawnVariancePct",
    "wanderRadius", "idleSpeedFactor", "level", "waypoints", "patrolMode",
]

# ---------------------------------------------------------------------------
# THE TABLE. (species, count, lo_rung, hi_rung) per region, ordered by rung.
# Counts are the TARGET roster; where one differs from what stands there today,
# R3 moves the difference. The band in the header is D10's, unchanged.
# ---------------------------------------------------------------------------
PLAN = {
    # F — Farm / start, band 1-3. No moves: the farm's four species already
    # ramp Turnip (harvest) -> Stag (passive) -> Boar (tougher passive) ->
    # Wolf, which wolf.json calls "the first real combat mob after the farm".
    "F": [
        ("Turnip", 6, 1, 1),
        ("Stag", 2, 1, 1),
        ("Boar", 10, 2, 2),
        ("Wolf", 7, 3, 3),
    ],
    # W — West wildlife, band 2-6. §3.9's milder defect: 73 of 74 spawns are
    # Wolf/Stag/Boar, so rungs 5 and 6 have no tenant. 5 Wolves become 3
    # DireWolf + 2 Bear — the two predators the western woods already imply,
    # and both are already placed elsewhere, so no new species enters the world.
    # 38 Wolves is still far above the 8 that `wolves-on-the-road` needs.
    "W": [
        ("Stag", 16, 2, 2),
        ("Wolf", 38, 3, 3),
        ("Boar", 14, 4, 4),
        ("DireWolf", 4, 5, 5),
        ("Bear", 2, 6, 6),
    ],
    # D — Dark forest (NW), band 4-8. Wolf x12 stretched to 8 was the defect;
    # 5 of them become 3 DireWolf + 2 Spider, which fills rungs 5 and 6.
    "D": [
        ("Wolf", 7, 4, 4),
        ("Spider", 3, 5, 5),
        ("DireWolf", 3, 6, 6),
        ("Bear", 5, 7, 7),
        ("EliteWolf", 3, 8, 8),
    ],
    # K — Kobold hideout, band 6-10. Rung 9 had no tenant above DireWolf; 2
    # Wolves become AlphaWolf so the hideout tops out on something. The 20
    # Kobolds `the-lost-lamp` needs are untouched.
    "K": [
        ("Stag", 5, 6, 6),
        ("KoboldRanged", 6, 6, 6),
        ("Kobold", 20, 7, 7),
        ("Wolf", 19, 8, 8),
        ("Boar", 9, 8, 8),
        ("DireWolf", 4, 9, 9),
        ("AlphaWolf", 2, 10, 10),
    ],
    # M — Mid road / centre, band 8-12. 13 species over 5 rungs: the one region
    # that needed nothing moved.
    "M": [
        ("Stag", 11, 8, 8),
        ("Wolf", 26, 8, 8),
        ("BanditRanged", 2, 9, 9),
        ("Boar", 15, 9, 9),
        ("BanditHealer", 1, 9, 9),
        ("BanditPyromancer", 1, 10, 10),
        ("RallyDrummer", 1, 10, 10),
        ("Bandit", 10, 10, 10),
        ("DireWolf", 11, 11, 11),
        ("AlphaWolf", 3, 11, 11),
        ("Troll", 2, 12, 12),
        ("Bear", 3, 12, 12),
        ("DireBear", 4, 12, 12),
    ],
    # T — Dark Tunnel belt, band 10-14, the SOLO gate (D7). 11 species, nothing
    # moved. Spider takes two rungs so 12 is not three DireWolves alone.
    "T": [
        ("Stag", 1, 10, 10),
        ("Wolf", 12, 10, 10),
        ("Boar", 5, 11, 11),
        ("VenomSpider", 6, 11, 11),
        ("Spider", 14, 11, 12),
        ("DireWolf", 3, 12, 12),
        ("AlphaWolf", 1, 13, 13),
        ("Troll", 1, 13, 13),
        ("Bear", 1, 13, 13),
        ("GiantSpider", 5, 14, 14),
        ("Marauder", 1, 14, 14),
    ],
    # B — Bandit horde / NE, band 12-16, the GROUP gate (D7), one band above
    # the tunnel. 10 species, nothing moved; Bandit and DireWolf each take two
    # rungs so the camp's bulk is not all on 13.
    "B": [
        ("BanditRanged", 2, 12, 12),
        ("BanditHealer", 2, 12, 12),
        ("Bandit", 11, 12, 13),
        ("BanditPyromancer", 2, 13, 13),
        ("DireWolf", 10, 13, 14),
        ("AlphaWolf", 4, 14, 14),
        ("Marauder", 8, 15, 15),
        ("EliteWolf", 3, 15, 15),
        ("DireBear", 1, 16, 16),
        ("EliteBandit", 1, 16, 16),
    ],
    # V — East village + Gates, band 14-18. §3.9's blocker, and the pass's
    # biggest single edit: 26 of 31 spawns were Boar (cL2) and DireWolf (cL6).
    # D12 rules it PREDATOR-heavy rather than bandit — the village keeps its
    # guarded-settlement reading and the woods around it have gone bad, instead
    # of a second bandit camp pitched next to the CityGuard. 15 spawns re-skin.
    # The 5 ring Boars (D13) are handled before this table and are not in it.
    # The lone Marauder is the V->M patroller (#402): it keeps its route, and
    # it is the one bandit-faction spawn left in V by design — a scout on the
    # road west, not a camp at the gate.
    "V": [
        ("DireWolf", 8, 14, 14),
        ("AlphaWolf", 6, 15, 15),
        ("Bear", 5, 16, 16),
        ("Marauder", 1, 16, 16),
        ("EliteWolf", 3, 17, 17),
        ("DireBear", 3, 18, 18),
    ],
    # P — NE fire pocket, band 17-20. D8 keeps it as the Zone-3 teaser. Five
    # spawns, two species; FireElemental spreads over three rungs so the pocket
    # is a ramp rather than a step.
    "P": [
        ("FireElemental", 4, 17, 19),
        ("GreaterFireElemental", 1, 20, 20),
    ],
    # R — The front (S). D5: NOT retuned, so it has no D10 band and R1 does not
    # apply. D14 (PO, C2) makes its adds honest: the 3 Trolls stood at cL11
    # beside cL20 Orcs, which is a plate that lies about the fight. Orc and
    # OrcGrunt keep 20 — the ceiling does not move.
    "R": [
        ("Troll", 3, 17, 18),
        ("OrcGrunt", 3, 20, 20),
        ("Orc", 12, 20, 20),
    ],
}

# `wolves-on-the-road` and `the-lost-lamp` count kills of a species in a place.
# Re-placement can make a quest uncompletable without touching the quest file.
QUEST_FLOORS = [("W", "Wolf", 8), ("K", "Kobold", 6), ("F", "Turnip", 5)]


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def hpx(catalog, name):
    return catalog[name]["factors"]["baseMaxHealth"] / 55.0


def seg_dist(point, a, b):
    """Distance from a point to the segment a-b."""
    (px, py), (ax, ay), (bx, by) = point, a, b
    dx, dy = bx - ax, by - ay
    span = dx * dx + dy * dy
    t = 0.0 if span == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / span))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def clearance(catalog, spawn, point):
    """How much room a character standing at `point` has before this spawn can
    acquire them: the closest the mob ever gets, minus its aggro radius. The
    species is the PLACED one — re-skinning is exactly what moves this number.

    ⚑ A patroller is a POLYLINE, not a disc. Treating its farthest waypoint as
    a wander radius reads the two routes that pass near a fire as if they
    surrounded it, when in fact both run away from it — which is a false
    campfire failure, and the kind that gets an assert deleted rather than
    fixed."""
    definition = catalog[spawn["mob"]]
    aggro = definition.get("body", {}).get("aggroRadius") or 0.0
    post = (spawn["x"], spawn["y"])
    if spawn.get("waypoints"):
        route = [post] + [(w["x"], w["y"]) for w in spawn["waypoints"]]
        near = min(seg_dist(point, route[i], route[i + 1]) for i in range(len(route) - 1))
    else:
        wander = spawn["wanderRadius"] if spawn.get("wanderRadius") is not None \
            else definition.get("factors", {}).get("wanderRadius") or 0.0
        near = max(0.0, dist(point, post) - wander)
    return near - aggro


def aggros_players(catalog, name):
    """Prey (`hostileTo: []`) never acquires a player; it only retaliates. The
    campfire constraint is about what walks up to a respawning character, so a
    Boar 3 units from a fire is not the same fact as a Kobold 3 units away."""
    faction = catalog[name].get("faction")
    if faction is None:
        return False  # Turnips, brambles, braziers: props with no aggro at all.
    hostile = json.loads((ROOT / "api" / "factions" / f"{faction}.json").read_text())
    return "aligned" in hostile.get("hostileTo", [])


def plan_placement(catalog, zone):
    """Return {spawn index: (species, level)} for all 423 combat spawns."""
    combat_idx = [i for i, s in enumerate(zone["spawns"])
                  if catalog[s["mob"]].get("factors", {}).get("xpFactor", 1) != 0]
    by_region = defaultdict(list)
    for i in combat_idx:
        s = zone["spawns"][i]
        by_region[wr.region(s["x"], s["y"])[0]].append(i)

    out = {}
    for letter, indices in by_region.items():
        entries = PLAN[letter]
        pool = list(indices)

        # D13, before the table: the village livestock keep species and level.
        if letter == "V":
            ring = [i for i in pool
                    if catalog[zone["spawns"][i]["mob"]].get("faction") == "wildlife_prey"
                    and dist((zone["spawns"][i]["x"], zone["spawns"][i]["y"]),
                             VILLAGE_FIRE) <= RING_RADIUS]
            for i in ring:
                out[i] = (zone["spawns"][i]["mob"], catalog[zone["spawns"][i]["mob"]]["curveLevel"])
            pool = [i for i in pool if i not in set(ring)]

        # R3. Keep what the target roster still wants, nearest-to-start first;
        # a waypoint spawn is never shed (§4.2 wants a per-route decision, and
        # this pass's decision is that a patroller keeps its route).
        wanted = {name: count for name, count, _, _ in entries}
        keep, freed = defaultdict(list), []
        for name in sorted({zone["spawns"][i]["mob"] for i in pool}):
            instances = [i for i in pool if zone["spawns"][i]["mob"] == name]
            instances.sort(key=lambda i: (zone["spawns"][i].get("waypoints") is None,
                                          dist((zone["spawns"][i]["x"], zone["spawns"][i]["y"]), START),
                                          zone["spawns"][i]["x"], zone["spawns"][i]["y"]))
            n = wanted.get(name, 0)
            keep[name] = instances[:n]
            freed += instances[n:]
        # Deepest-first: the farthest freed point gets the highest-rung arrival.
        freed.sort(key=lambda i: (-dist((zone["spawns"][i]["x"], zone["spawns"][i]["y"]), START),
                                  zone["spawns"][i]["x"], zone["spawns"][i]["y"]))
        for name, count, lo, _ in sorted(entries, key=lambda e: -e[2]):
            short = count - len(keep[name])
            for _ in range(short):
                keep[name].append(freed.pop(0))
        assert not freed, f"{letter}: {len(freed)} freed point(s) unclaimed"

        # R2. Spread each species across its rung range, near-to-far.
        for name, count, lo, hi in entries:
            instances = sorted(keep[name],
                               key=lambda i: (dist((zone["spawns"][i]["x"], zone["spawns"][i]["y"]), START),
                                              zone["spawns"][i]["x"], zone["spawns"][i]["y"]))
            rungs = hi - lo + 1
            for n, i in enumerate(instances):
                out[i] = (name, lo + (n * rungs) // len(instances))
    return out


def rewrite(zone, placement):
    for i, (name, level) in placement.items():
        spawn = zone["spawns"][i]
        spawn["mob"] = name
        spawn["level"] = level
        zone["spawns"][i] = {k: spawn[k] for k in KEY_ORDER if k in spawn}


def report(catalog, zone, placement):
    per = defaultdict(lambda: defaultdict(Counter))
    for i, (name, level) in placement.items():
        s = zone["spawns"][i]
        per[wr.region(s["x"], s["y"])[0]][level][name] += 1
    for letter in "FWDKMTBVPR":
        band = wr.BANDS.get(letter)
        print(f"\n  {letter}  band {f'{band[0]}-{band[1]}' if band else 'unchanged (D5)'}")
        for level in sorted(per[letter]):
            roster = "  ".join(f"{n} x{c}" for n, c in per[letter][level].most_common())
            print(f"      L{level:<3d} {roster}")


def check(catalog, zone, base="HEAD"):
    """§9's test strategy. Every leg reads the file on disk."""
    ok = True
    spawns = zone["spawns"]
    combat = [s for s in spawns if catalog[s["mob"]].get("factors", {}).get("xpFactor", 1) != 0]
    other = [s for s in spawns if s not in combat]

    def leg(name, passed, detail=""):
        nonlocal ok
        ok = ok and passed
        print(f"  [{'OK ' if passed else 'FAIL'}] {name}{'  ' + detail if detail else ''}")

    leg("split", len(combat) == 423 and len(other) == 62,
        f"{len(combat)} combat / {len(other)} non-combat")
    leg("coverage (a): every combat spawn resolves to one region",
        all(wr.region(s["x"], s["y"])[0] for s in combat))
    missing = [s for s in combat if s.get("level") is None]
    leg("coverage (b): every combat spawn carries a level",
        not missing, f"{423 - len(missing)}/423 levelled")
    leg("absent-stays-absent: no non-combat spawn gained a level",
        not any("level" in s for s in other))
    leg("loader: every level is an int >= 1",
        all(isinstance(s.get("level"), int) and s["level"] >= 1 for s in combat))

    # D10, as an assert rather than a claim. The two exemptions are both
    # rulings, and naming them here is what keeps them decisions: the front has
    # no band (D5) and the village livestock ring stands below its region's
    # band on purpose (D13).
    outside = []
    for s in combat:
        band = wr.BANDS.get(wr.region(s["x"], s["y"])[0])
        if not band or not (s["level"] < band[0] or s["level"] > band[1]):
            continue
        if dist((s["x"], s["y"]), VILLAGE_FIRE) <= RING_RADIUS \
                and catalog[s["mob"]].get("faction") == "wildlife_prey":
            continue  # D13
        outside.append((s["mob"], s["level"]))
    leg("D10: every level sits inside its region's band (D5 front + D13 ring exempt)",
        not outside, f"{len(outside)} outside: {sorted(set(outside))[:6]}")

    # Absent-stays-absent, the strong form: against git HEAD, only `mob` and
    # `level` may differ, and only on combat spawns.
    try:
        head = json.loads(subprocess.check_output(
            ["git", "show", f"{base}:api/zones/world.json"], cwd=ROOT, text=True))
        same_shape = len(head["spawns"]) == len(spawns) and all(
            k == "spawns" or head[k] == zone[k] for k in zone)
        drift = []
        for before, after in zip(head["spawns"], spawns):
            for key in set(before) | set(after):
                if key in ("mob", "level"):
                    continue
                if before.get(key) != after.get(key):
                    drift.append((before["mob"], key))
            if (before["x"], before["y"]) != (after["x"], after["y"]):
                drift.append((before["mob"], "moved"))
        leg("diff guard: only `mob` and `level` changed, nothing else",
            same_shape and not drift, f"{len(drift)} stray field change(s)")
        reskin = [(b["mob"], a["mob"]) for b, a in zip(head["spawns"], spawns) if b["mob"] != a["mob"]]
        leg("re-skins stay inside the combat set",
            all(catalog[b].get("factors", {}).get("xpFactor", 1) != 0
                and catalog[a].get("factors", {}).get("xpFactor", 1) != 0 for b, a in reskin),
            f"{len(reskin)} spawn(s) re-skinned")
    except subprocess.CalledProcessError:
        leg("diff guard", False, "could not read HEAD:api/zones/world.json")

    # §5's hard constraint, geometric and post-edit. A player standing on a
    # bound fire must be outside the reach of everything that would come for
    # them — measured on the PLACED species, which is what re-skinning moves.
    print("\n  campfires (§5) — clearance = closest approach - aggroRadius")
    for fire in zone["campfires"]:
        point = (fire["x"], fire["y"])
        threats = sorted(((clearance(catalog, s, point), s) for s in combat
                          if aggros_players(catalog, s["mob"])), key=lambda t: t[0])
        room, worst = threats[0]
        band = wr.BANDS.get(wr.region(fire["x"], fire["y"])[0])
        ceiling = band[1] if band else 20
        over = [(c, s) for c, s in threats if c < 6 and s["level"] > ceiling]
        leg(f"{fire['id']:14s} nearest {worst['mob']} L{worst['level']}",
            room > 0 and not over,
            f"clearance {room:+.2f}u; {len(over)} spawn(s) above band within 6u of clearance")

    print()
    for letter, species, floor in QUEST_FLOORS:
        n = sum(1 for s in combat if s["mob"] == species and wr.region(s["x"], s["y"])[0] == letter)
        leg(f"quest floor: {species} in region {letter} >= {floor}", n >= floor, f"{n} placed")
    return ok


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write api/zones/world.json")
    parser.add_argument("--check", action="store_true", help="run §9's asserts on the file")
    parser.add_argument("--base", default="HEAD",
                        help="git ref the diff guard compares against. Defaults to HEAD, "
                             "which is right while C2 is uncommitted; ONCE C2 IS COMMITTED "
                             "pass the pre-pass commit (3df461a8) or the guard passes "
                             "against itself and proves nothing.")
    args = parser.parse_args()

    catalog, zone, combat, other = wr.load()
    if args.check:
        return 0 if check(catalog, zone, args.base) else 1

    placement = plan_placement(catalog, zone)
    reskin = sum(1 for i, (name, _) in placement.items() if zone["spawns"][i]["mob"] != name)
    print(f"{len(placement)} combat spawns levelled, {reskin} re-skinned "
          f"({len(other)} non-combat untouched)")
    report(catalog, zone, placement)

    if args.apply:
        rewrite(zone, placement)
        WORLD.write_text(json.dumps(zone, indent=2) + "\n")
        print(f"\nwrote {WORLD.relative_to(ROOT)}")
    else:
        print("\n(dry run — pass --apply to write)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
