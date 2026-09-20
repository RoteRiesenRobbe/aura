#!/usr/bin/env bash
# The Tiled zone format's verify leg: does a real Tiled still round-trip
# api/zones/world.json byte for byte, and does it still refuse a bad zone?
#
# Run after touching anything under tools/tiled/:
#
#     bash tools/tiled/verify.sh
#
# ⚑ This drives the REAL Tiled binary, not a simulation of it. The vitest suite
# covers the pure converter; what it cannot cover is Tiled's own reader/writer
# path, the tsx tileset loader, and the palette lookup — which is exactly where
# C1's CRLF bug and C2's fixed-depth palette bug both lived.
#
# ⚑ What it CANNOT cover, because a project does not load headlessly
# (tiled.project is null under --export-map): whether the custom types render
# as a form in the Properties panel. That stays a human check in the GUI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

find_tiled() {
    if command -v tiled >/dev/null 2>&1; then command -v tiled; return; fi
    for p in "/c/Program Files/Tiled/tiled.exe" \
             "/c/Program Files (x86)/Tiled/tiled.exe" \
             "/Applications/Tiled.app/Contents/MacOS/Tiled"; do
        if [ -x "$p" ]; then echo "$p"; return; fi
    done
    echo "verify: cannot find Tiled — install it, or put it on PATH" >&2
    exit 1
}
TILED="$(find_tiled)"

# Tiled takes native paths; git bash hands out /c/... ones.
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fail=0
ok()   { echo "  ✅ $1"; }
bad()  { echo "  ❌ $1"; fail=1; }

echo "Tiled: $TILED"
echo

# ---- 0. ⚑ are we even testing the working tree? -----------------------------
# install.sh COPIES the extension into Tiled's user directory, and --export-map
# loads it from there — so every leg below runs the INSTALLED copy, not the repo
# one. Editing aura-convert.js and running verify.sh therefore reports green on
# stale code, which is a false pass in the one place that is supposed to catch
# them. (Measured the hard way during plan-prop-scale.md C1: three legs
# disagreed with vitest until the copy was refreshed.)
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) INSTALLED="$LOCALAPPDATA/Tiled/extensions/aura-zone" ;;
  Darwin)               INSTALLED="$HOME/Library/Preferences/Tiled/extensions/aura-zone" ;;
  *)                    INSTALLED="${XDG_DATA_HOME:-$HOME/.local/share}/tiled/extensions/aura-zone" ;;
esac
echo "installed extension matches the repo"
if [ ! -d "$INSTALLED" ]; then
    bad "not installed at $INSTALLED — run: bash tools/tiled/install.sh"
elif diff -r -q "$INSTALLED" tools/tiled/extensions/aura-zone >/dev/null 2>&1; then
    ok "in step — the legs below test this working tree"
else
    bad "STALE: $INSTALLED differs from tools/tiled/extensions/aura-zone.
     Every leg below would test the OLD code and could pass for the wrong
     reason. Run: bash tools/tiled/install.sh   (and restart Tiled)"
fi
# Nothing below is trustworthy against a stale copy, so stop here.
if [ "$fail" -ne 0 ]; then echo; echo "FAILED — see above."; exit 1; fi

# ---- 1. the acceptance criterion (D6): load + save changes nothing ----------
echo "round-trip api/zones/world.json"
if "$TILED" --export-map aura-zone api/zones/world.json "$(native "$TMP/out.json")" >/dev/null 2>&1 \
   && cmp -s api/zones/world.json "$TMP/out.json"; then
    ok "byte-identical ($(wc -c < api/zones/world.json) bytes)"
else
    bad "NOT byte-identical — diff: $(cmp api/zones/world.json "$TMP/out.json" 2>&1 | head -1)"
fi

# ⚑ The repo has two zone writers that disagree by one byte (world-place.py
# appends a newline, ZoneModel.getZoneAsJSON does not), so BOTH conventions
# must survive. The copy lives inside the repo because the palette is found by
# walking up from the zone file.
echo
echo "round-trip with the other trailing-newline convention"
mkdir -p tools/tiled/.verify
trap 'rm -rf "$TMP" "$ROOT/tools/tiled/.verify"' EXIT
if [ -n "$(tail -c 1 api/zones/world.json)" ]; then
    printf '%s\n' "$(cat api/zones/world.json)" > tools/tiled/.verify/flipped.json
else
    head -c -1 api/zones/world.json > tools/tiled/.verify/flipped.json
fi
# Guard against a vacuous pass: if the flip produced the same bytes, this leg
# would be re-testing the first one and reporting green for nothing.
if [ "$(wc -c < tools/tiled/.verify/flipped.json)" = "$(wc -c < api/zones/world.json)" ]; then
    bad "the flipped copy is the same size — the convention was not flipped"
elif "$TILED" --export-map aura-zone tools/tiled/.verify/flipped.json \
        "$(native "$ROOT/tools/tiled/.verify/flipped-out.json")" >/dev/null 2>&1 \
   && cmp -s tools/tiled/.verify/flipped.json tools/tiled/.verify/flipped-out.json; then
    ok "byte-identical — the file keeps whatever it arrived with"
else
    bad "the trailing newline was not preserved"
fi

# ---- 2. save-time validation still refuses what the server would reject -----
echo
echo "a prop dropped on the spawns layer"
node -e '
const fs = require("fs");
const z = JSON.parse(fs.readFileSync("api/zones/world.json", "utf8"));
fs.writeFileSync("tools/tiled/.verify/bad.json", JSON.stringify({
    name: z.name, bounds: z.bounds, terrain: [], props: [],
    spawns: [{mob: "Tree", x: 1, y: 1, angle: 0}],
    campfires: z.campfires, anchors: z.anchors,
}, null, 2));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/bad.json \
        "$(native "$ROOT/tools/tiled/.verify/bad-out.json")" >/dev/null 2>&1; then
    bad "the save was ACCEPTED — validation is not running"
elif [ -e tools/tiled/.verify/bad-out.json ]; then
    bad "refused, but a file was written anyway"
else
    ok "refused, nothing written"
fi

# ---- 2b. per-placement prop scale survives Tiled's own box handling ---------
# ⚑ vitest cannot cover this leg: it drives the pure converter, which never
# meets Tiled's MapObject. Scale is carried IN the object's width, so the whole
# feature rests on Tiled handing back exactly the box we set — the same class of
# assumption whose failure produced C1's CRLF bug (plan-prop-scale.md C1).
echo
echo "a zone with scaled props round-trips"
node -e '
const C = require("./tools/tiled/extensions/aura-zone/aura-convert.js");
const fs = require("fs");
C.useContent(require("./tools/tiled/palette/content.json"));
const z = JSON.parse(fs.readFileSync("api/zones/world.json", "utf8"));
fs.writeFileSync("tools/tiled/.verify/scaled.json", C.serializeZone({
    name: z.name, bounds: z.bounds, terrain: [], spawns: [],
    campfires: z.campfires, anchors: z.anchors,
    props: [
        // A circle body and a rect body, scaled up and down, plus an
        // unscaled neighbour that must NOT grow a scale key.
        {type: "Tree",  x: 0, y: 0, rotation: 0,     blocksMovement: true, scale: 2.5},
        {type: "House", x: 8, y: 0, rotation: 0,     blocksMovement: true, scale: 0.5},
        {type: "Rock",  x: -8, y: 0, rotation: 1.25, blocksMovement: true, scale: 10},
        {type: "Boulder", x: 0, y: 8, rotation: 0.5, blocksMovement: true},
    ],
}, false));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/scaled.json         "$(native "$ROOT/tools/tiled/.verify/scaled-out.json")" >/dev/null 2>&1    && cmp -s tools/tiled/.verify/scaled.json tools/tiled/.verify/scaled-out.json; then
    ok "byte-identical — scale survives, and the unscaled prop stays unscaled"
else
    bad "scale did not survive: $(cmp tools/tiled/.verify/scaled.json         tools/tiled/.verify/scaled-out.json 2>&1 | head -1)"
fi

echo
echo "a prop resized past the scale rail"
node -e '
const C = require("./tools/tiled/extensions/aura-zone/aura-convert.js");
const fs = require("fs");
C.useContent(require("./tools/tiled/palette/content.json"));
const z = JSON.parse(fs.readFileSync("api/zones/world.json", "utf8"));
fs.writeFileSync("tools/tiled/.verify/overscale.json", C.serializeZone({
    name: z.name, bounds: z.bounds, terrain: [], spawns: [],
    campfires: z.campfires, anchors: z.anchors,
    props: [{type: "Tree", x: 0, y: 0, rotation: 0, blocksMovement: true, scale: 25}],
}, false));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/overscale.json         "$(native "$ROOT/tools/tiled/.verify/overscale-out.json")" >/dev/null 2>&1; then
    bad "the save was ACCEPTED — the scale rail is not enforced"
elif [ -e tools/tiled/.verify/overscale-out.json ]; then
    bad "refused, but a file was written anyway"
else
    ok "refused, nothing written"
fi

# ---- 2b-ii. a prop's TRI-STATE blocksMovement survives a real Tiled save ----
# ⭐ The one that matters is the INHERITING prop: it must come back carrying no
# key at all. A converter that helpfully filled in a bool would freeze today's
# answer into the file, and re-typing the prop in api/props/ would stop moving
# its placements — which is the whole reason the tri-state exists.
#
# ⛔ THIS LEG PROVES THE VALUE SURVIVES AND NOTHING ABOUT THE DROPDOWN. Headless
# --export-map loads no project, so tiled.propertyValue throws and the enum
# degrades to a bare string — measured during the 2026-09-15 profile split. The
# class member itself is pinned statically by vitest (AuraTiledConvert.test.ts),
# and the GUI wiring is a human check in the footer.
echo
echo "a prop's tri-state blocksMovement round-trips"
node -e '
const C = require("./tools/tiled/extensions/aura-zone/aura-convert.js");
const fs = require("fs");
C.useContent(require("./tools/tiled/palette/content.json"));
const z = JSON.parse(fs.readFileSync("api/zones/world.json", "utf8"));
fs.writeFileSync("tools/tiled/.verify/propblocks.json", C.serializeZone({
    name: z.name, bounds: z.bounds, terrain: [], spawns: [],
    campfires: z.campfires, anchors: z.anchors,
    props: [
        // Inheriting — NO key, and it must still have none on the way back.
        {type: "Tree", x: 0, y: 0, rotation: 0},
        // The two explicit overrides, one each way.
        {type: "House", x: 8, y: 0, rotation: 0, blocksMovement: true},
        {type: "Rock", x: -8, y: 0, rotation: 0, blocksMovement: false},
    ],
}, false));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/propblocks.json         "$(native "$ROOT/tools/tiled/.verify/propblocks-out.json")" >/dev/null 2>&1    && cmp -s tools/tiled/.verify/propblocks.json tools/tiled/.verify/propblocks-out.json; then
    ok "byte-identical — the inheriting prop grew no key, both overrides survived"
else
    bad "blocksMovement did not survive: $(cmp tools/tiled/.verify/propblocks.json         tools/tiled/.verify/propblocks-out.json 2>&1 | head -1)"
fi

# ---- 2c. a region survives Tiled's own property handling --------------------
# ⚑ vitest cannot cover this leg either: the profile is a TYPED enum property,
# and Tiled hands a typed enum back as an INDEX into the declared values, never
# as the string (plan-region-primitive.md C2). The pure converter is tested
# against a hand-built index; only the real binary proves the index Tiled
# actually returns is the one the palette declared.
echo
echo "a zone with regions round-trips"
node -e '
const C = require("./tools/tiled/extensions/aura-zone/aura-convert.js");
const fs = require("fs");
const content = require("./tools/tiled/palette/content.json");
C.useContent(content);
const z = JSON.parse(fs.readFileSync("api/zones/world.json", "utf8"));
// Every profile the palette offers, so a wrong index lands on a DIFFERENT
// name rather than accidentally on the right one.
const regions = content.PROFILE_NAMES.map(function (profile, i) {
    const x = -60 + i * 12;
    return {profile: profile, points: [
        {x: x, y: 0}, {x: x + 8, y: 0}, {x: x + 8, y: 9}, {x: x, y: 9},
    ]};
});
fs.writeFileSync("tools/tiled/.verify/regions.json", C.serializeZone({
    name: z.name, bounds: z.bounds, terrain: [], props: [], spawns: [],
    campfires: z.campfires, regions: regions, anchors: z.anchors,
}, false));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/regions.json \
        "$(native "$ROOT/tools/tiled/.verify/regions-out.json")" >/dev/null 2>&1 \
   && cmp -s tools/tiled/.verify/regions.json tools/tiled/.verify/regions-out.json; then
    ok "byte-identical — every profile came back as its own name, not an index"
else
    bad "regions did not survive: $(cmp tools/tiled/.verify/regions.json \
        tools/tiled/.verify/regions-out.json 2>&1 | head -1)"
fi

echo
echo "a PLACED zone round-trips — the origin survives real Tiled"
# ⭐ THE ONE LEG THAT COVERS THE FOURTH WRITER. Every other leg here uses
# world.json or a fixture derived from it, and world.json authors NO origin — so
# until the underworld shipped, nothing in this file ever carried a map-level
# value that Tiled could silently drop. aura-world-format.js has to copy each of
# those onto the TileMap by hand, and the vitest completeness pin cannot see it:
# the pin exercises the PURE converter, not Tiled's own read/write path. The
# origin went missing exactly this way, and the server refused the next boot.
node -e '
const C = require("./tools/tiled/extensions/aura-zone/aura-convert.js");
const z = require("./api/zones/world.json");
fs = require("fs");
fs.writeFileSync("tools/tiled/.verify/placed.json", C.serializeZone({
    // ⛑ BOTH AXES NON-ZERO, the fixture trap AuraTiledConvert.test.ts already
    // documents for origin and paths.blocksMovement: with x at 0 the serializer
    // reconstructs it from y alone, so dropping originX is invisible and this leg
    // passes while half the bridge is broken. (Proven: it did.)
    name: z.name, bounds: {width: 48, height: 28}, origin: {x: 500, y: 300},
    terrain: [], props: [], spawns: [],
    campfires: [{id: "underworld-1", x: 0, y: 8}],
    anchors: [{name: "under-west", x: -16, y: 0}],
}, false));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/placed.json \
        "$(native "$ROOT/tools/tiled/.verify/placed-out.json")" >/dev/null 2>&1 \
   && cmp -s tools/tiled/.verify/placed.json tools/tiled/.verify/placed-out.json; then
    ok "byte-identical — the zone came back at its own origin, not at {0,0}"
else
    bad "a placed zone did not survive: $(cmp tools/tiled/.verify/placed.json \
        tools/tiled/.verify/placed-out.json 2>&1 | head -1)"
fi

echo
echo "a CLOSED path round-trips — the SHAPE carries the flag"
# ⭐ P1's own leg (plan-zone-polygons.md). `closed` is the first zone field that
# is not a property at all: it is Tiled's object SHAPE, so the whole feature
# rests on Tiled handing a polygon back as a polygon and a polyline back as a
# polyline on the paths layer — which the pure converter can only assume. If the
# shape were flattened either way, a moat would silently open (or every road
# would close) and no vitest leg could see it.
#
# ⛑ BOTH kinds in ONE fixture, and the ring authored with a DIFFERENT point
# count: with only a ring here, a converter that closed everything would still
# round-trip byte-identically and this leg would pass while every road in the
# world became a loop. (The same trap the origin fixture documents one leg up.)
node -e '
const C = require("./tools/tiled/extensions/aura-zone/aura-convert.js");
const fs = require("fs");
C.useContent(require("./tools/tiled/palette/content.json"));
const z = JSON.parse(fs.readFileSync("api/zones/world.json", "utf8"));
fs.writeFileSync("tools/tiled/.verify/closedpath.json", C.serializeZone({
    name: z.name, bounds: z.bounds, terrain: [], props: [], spawns: [],
    campfires: z.campfires, anchors: z.anchors,
    paths: [
        // A moat: closed, blocking, three points.
        {profile: "Water", width: 4, blocksMovement: true, closed: true,
         points: [{x: -20, y: -10}, {x: -8, y: -10}, {x: -14, y: 2}]},
        // A ring road: closed, decorative, four points.
        {profile: "Road", width: 2.5, closed: true,
         points: [{x: 4, y: -8}, {x: 16, y: -8}, {x: 16, y: 4}, {x: 4, y: 4}]},
        // And an ORDINARY open road beside them, which must stay open.
        {profile: "Road", width: 2.5, points: [{x: -20, y: 12}, {x: 20, y: 12}]},
    ],
}, false));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/closedpath.json         "$(native "$ROOT/tools/tiled/.verify/closedpath-out.json")" >/dev/null 2>&1    && cmp -s tools/tiled/.verify/closedpath.json tools/tiled/.verify/closedpath-out.json; then
    ok "byte-identical — the rings came back rings and the road came back open"
else
    bad "a closed path did not survive: $(cmp tools/tiled/.verify/closedpath.json         tools/tiled/.verify/closedpath-out.json 2>&1 | head -1)"
fi

echo
echo "polygons and paths SHARE a layer and come back to their own arrays"
# ⭐ P2's leg (plan-zone-polygons.md D5). Two classes ride the paths layer and
# modelToZone routes by CLASS, so the whole primitive rests on Tiled handing the
# class back on every object in a mixed layer — which the pure converter can only
# assume, because it never meets Tiled's MapObject.
#
# ⛑ The fixture MIXES both classes and gives them DIFFERENT point counts and
# profiles. With polygons alone, a converter that read the whole layer as paths
# would be refused for a missing width (loud); with paths alone, one that read
# them as polygons would round-trip fine (silent). Only the mix catches both, and
# only a mix with different shapes catches a swap.
node -e '
const C = require("./tools/tiled/extensions/aura-zone/aura-convert.js");
const fs = require("fs");
C.useContent(require("./tools/tiled/palette/content.json"));
const z = JSON.parse(fs.readFileSync("api/zones/world.json", "utf8"));
fs.writeFileSync("tools/tiled/.verify/polygons.json", C.serializeZone({
    name: z.name, bounds: z.bounds, terrain: [], props: [], spawns: [],
    campfires: z.campfires, anchors: z.anchors,
    polygons: [
        // A blocking rock mass, four points.
        {profile: "Mountains", blocksMovement: true, points: [
            {x: -20, y: -10}, {x: -12, y: -10}, {x: -12, y: -2}, {x: -20, y: -2}]},
        // A decorative lake, three — and it must NOT grow a blocksMovement key.
        {profile: "Water", points: [{x: 4, y: -8}, {x: 14, y: -8}, {x: 9, y: 2}]},
    ],
    // ...and an ordinary path beside them on the same layer, which must come
    // back a path, with its width, and not as a filled shape.
    paths: [{profile: "Road", width: 2.5, points: [{x: -20, y: 12}, {x: 20, y: 12}]}],
}, false));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/polygons.json \
        "$(native "$ROOT/tools/tiled/.verify/polygons-out.json")" >/dev/null 2>&1 \
   && cmp -s tools/tiled/.verify/polygons.json tools/tiled/.verify/polygons-out.json; then
    ok "byte-identical — the classes survived a shared layer, in order"
else
    bad "polygons did not survive: $(cmp tools/tiled/.verify/polygons.json \
        tools/tiled/.verify/polygons-out.json 2>&1 | head -1)"
fi

echo
echo "ATMOSPHERES ride a layer of their OWN and come back intact"
# ⭐ A0's leg (plan-region-atmosphere.md D16). This is the NINTH object layer,
# and it is the first shape in the format that does NOT ride an existing layer
# by class — so the thing under test is that real Tiled creates, exports and
# reads back a layer the extension only just learned about. `aura-world-format.js`
# derives its known-layer set from C.LAYERS, which the pure converter can only
# assume holds at runtime.
#
# ⛑ The fixture puts an atmosphere OVER a blocking polygon on purpose, which is
# the authoring case D16 exists for: the fog covers the wall, and the two must
# come back to DIFFERENT arrays rather than one swallowing the other. A
# same-layer scheme would have made this ambiguous and this leg is what proves
# it is not.
#
# ⛔ It also pins D15 negatively: the atmosphere authors NO blocksMovement and
# NO outline, and a round-trip that grew either would produce a zone file that
# zone.go refuses by name on the next boot — loud, but only after the save.
#
# ⭐ THE PROFILES HERE ARE AIR NAMES since the 2026-09-15 table split — the
# polygon below wears a TERRAIN profile and the atmospheres wear ATMOSPHERE
# ones, so this map exercises both vocabularies at once.
# ⚑ This fixture used to author "Mountains" and "Swamp" on the atmospheres,
# which was the exact L15 mistake the split exists to make unrepresentable.
#
# ⛔ WHAT THIS LEG CANNOT SEE, measured 2026-09-16 rather than assumed: which
# ENUM TYPE the AuraAtmosphere.profile member points at. Headless --export-map
# loads no project, so tiled.propertyValue throws and aura-world-format.js
# falls back to writing the bare STRING (see typedValue there) — the name
# round-trips whatever the member declares. Pointing AuraAtmosphere back at
# AuraProfile was mutation-tested and this leg stayed GREEN. The enum wiring is
# pinned statically instead, in AuraTiledConvert.test.ts, and the DROPDOWN
# itself is a human check like the mob one at the foot of this script.
node -e '
const C = require("./tools/tiled/extensions/aura-zone/aura-convert.js");
const fs = require("fs");
C.useContent(require("./tools/tiled/palette/content.json"));
const z = JSON.parse(fs.readFileSync("api/zones/world.json", "utf8"));
fs.writeFileSync("tools/tiled/.verify/atmospheres.json", C.serializeZone({
    name: z.name, bounds: z.bounds, terrain: [], props: [], spawns: [],
    campfires: z.campfires, anchors: z.anchors,
    // The wall the fog hangs over — a different layer, a different array.
    polygons: [{profile: "Mountains", blocksMovement: true, points: [
        {x: -20, y: -10}, {x: -12, y: -10}, {x: -12, y: -2}, {x: -20, y: -2}]}],
    atmospheres: [
        // A dark cave interior, four points, covering the wall above.
        {profile: "Cave Air", points: [
            {x: -22, y: -12}, {x: -10, y: -12}, {x: -10, y: 0}, {x: -22, y: 0}]},
        // A second bank with a different profile and point count, so a
        // converter that collapsed the array to one shape is caught.
        // ⚑ "Fog" is at a DIFFERENT index in AuraAtmosphereProfile than
        // "Cave Air", so a decode against the wrong list cannot land on it.
        {profile: "Fog", points: [{x: 4, y: -8}, {x: 14, y: -8}, {x: 9, y: 2}]},
    ],
}, false));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/atmospheres.json \
        "$(native "$ROOT/tools/tiled/.verify/atmospheres-out.json")" >/dev/null 2>&1 \
   && cmp -s tools/tiled/.verify/atmospheres.json tools/tiled/.verify/atmospheres-out.json; then
    ok "byte-identical — the ninth layer survived, the fog did not eat the wall,
        and both enums decoded to their own vocabulary"
else
    bad "atmospheres did not survive: $(cmp tools/tiled/.verify/atmospheres.json \
        tools/tiled/.verify/atmospheres-out.json 2>&1 | head -1)"
fi

echo
echo "CLEARINGS share the atmospheres layer and come back to their OWN array"
# ⭐ A4's leg (plan-region-atmosphere.md §11). The atmospheres layer now holds
# TWO classes — AuraAtmosphere paints, AuraClearing erases — and modelToZone
# routes them by class into two arrays. That routing is the thing under test.
#
# ⛔ THIS IS THE FOURTH WRITER AND ONLY THIS FILE CAN SEE IT. The pure converter
# is pinned by vitest, but aura-world-format.js — the half that talks to real
# Tiled — is not, and it has already produced two real defects this way: a
# dropped `origin`, and a `className` it wrote for years and never read back.
# That second one is exactly this shape: harmless while a layer held ONE class,
# fatal the moment a class became the discriminator. A4 makes the atmospheres
# layer the second layer where that is true, so it needs the same guard the
# paths layer got.
#
# ⛑ The fixture deliberately puts the clearing INSIDE the bank it cuts, which is
# the authoring case, and gives the two DIFFERENT point counts so a converter
# that collapsed them into one array cannot pass by accident.
#
# ⛔ What this leg CANNOT see, the same measured limit as the atmospheres leg
# above: which ENUM the AuraClearing.clears member declares. Headless
# --export-map loads no project, so the value round-trips as a bare string
# whatever the member says. The enum wiring is pinned statically in
# AuraTiledConvert.test.ts and the dropdown is a human check in the footer.
node -e '
const C = require("./tools/tiled/extensions/aura-zone/aura-convert.js");
const fs = require("fs");
C.useContent(require("./tools/tiled/palette/content.json"));
const z = JSON.parse(fs.readFileSync("api/zones/world.json", "utf8"));
fs.writeFileSync("tools/tiled/.verify/clearings.json", C.serializeZone({
    name: z.name, bounds: z.bounds, terrain: [], props: [], spawns: [],
    campfires: z.campfires, anchors: z.anchors,
    atmospheres: [
        {profile: "Cave Air", points: [
            {x: -22, y: -12}, {x: -10, y: -12}, {x: -10, y: 0}, {x: -22, y: 0}]},
    ],
    clearings: [
        // Inside the bank above: the lit pocket at a cave mouth.
        {clears: "both", points: [
            {x: -18, y: -8}, {x: -14, y: -8}, {x: -14, y: -4}]},
        // A second hole, a different clears value AND a different point count,
        // so a converter that kept only one — or defaulted the enum — is caught.
        {clears: "haze", points: [
            {x: 4, y: -8}, {x: 14, y: -8}, {x: 14, y: 2}, {x: 4, y: 2}]},
    ],
}, false));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/clearings.json \
        "$(native "$ROOT/tools/tiled/.verify/clearings-out.json")" >/dev/null 2>&1 \
   && cmp -s tools/tiled/.verify/clearings.json tools/tiled/.verify/clearings-out.json; then
    ok "byte-identical — the class split survived real Tiled, and the hole did not
        come back as a fog bank"
else
    bad "clearings did not survive: $(cmp tools/tiled/.verify/clearings.json \
        tools/tiled/.verify/clearings-out.json 2>&1 | head -1)"
fi

echo
echo "a zone with a vertex-less CLEARING is REFUSED"
# ⚑ The atmospheres layer shipped without this leg and it cost a boot
# (2026-09-14, see the atmosphere version below). A4 adds a second class to that
# layer, so it gets its own from day one rather than after the same lesson.
node -e '
const C = require("./tools/tiled/extensions/aura-zone/aura-convert.js");
const fs = require("fs");
C.useContent(require("./tools/tiled/palette/content.json"));
const z = JSON.parse(fs.readFileSync("api/zones/world.json", "utf8"));
fs.writeFileSync("tools/tiled/.verify/emptyclearing.json", C.serializeZone({
    name: z.name, bounds: z.bounds, terrain: [], props: [], spawns: [],
    campfires: z.campfires, anchors: z.anchors,
    clearings: [{clears: "both", points: []}],
}, false));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/emptyclearing.json \
        "$(native "$ROOT/tools/tiled/.verify/emptyclearing-out.json")" >/dev/null 2>&1; then
    bad "the save was ACCEPTED — an empty clearing would break the next boot"
elif [ -e tools/tiled/.verify/emptyclearing-out.json ]; then
    bad "refused, but a file was written anyway"
else
    ok "refused, nothing written"
fi

echo
echo "EVERY ATMOSPHERE PROFILE comes back as its own name (the 2026-09-15 split)"
# ⭐ The air’s own copy of the regions leg above: one atmosphere per air
# profile, so every name the palette offers is proven to survive a real Tiled
# round-trip rather than only the two the fixture above happens to use.
#
# ⛔ It does NOT prove which enum the member declares — see the measured note
# on the atmospheres leg above. What it proves is that no air profile name is
# mangled, dropped or reordered on the way through, which is a real failure
# mode for a layer and a vocabulary this young.
node -e '
const C = require("./tools/tiled/extensions/aura-zone/aura-convert.js");
const fs = require("fs");
const content = require("./tools/tiled/palette/content.json");
C.useContent(content);
const z = JSON.parse(fs.readFileSync("api/zones/world.json", "utf8"));
// Every air profile the palette offers, each on its own triangle, stepped
// along X so no two shapes coincide.
const air = content.AIR_PROFILE_NAMES.map(function (profile, i) {
    const x = -20 + i * 6;
    return {profile: profile, points: [
        {x: x, y: -10}, {x: x + 4, y: -10}, {x: x + 2, y: -6}]};
});
if (air.length === 0) { throw new Error("no air profiles in the palette"); }
fs.writeFileSync("tools/tiled/.verify/air-profiles.json", C.serializeZone({
    name: z.name, bounds: z.bounds, terrain: [], props: [], spawns: [],
    campfires: z.campfires, anchors: z.anchors, atmospheres: air,
}, false));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/air-profiles.json \
        "$(native "$ROOT/tools/tiled/.verify/air-profiles-out.json")" >/dev/null 2>&1 \
   && cmp -s tools/tiled/.verify/air-profiles.json tools/tiled/.verify/air-profiles-out.json; then
    ok "byte-identical — every air profile came back as its own name, not an index"
else
    bad "air profiles did not survive: $(cmp tools/tiled/.verify/air-profiles.json \
        tools/tiled/.verify/air-profiles-out.json 2>&1 | head -1)"
fi

echo
echo "OUTLINES survive on both surface types"
# ⭐ P4's leg (plan-zone-polygons.md D3). outlineProfile is a TYPED ENUM property,
# and Tiled hands a typed enum back as an INDEX into the declared values, never
# as the string — the same trap the regions leg exists for, now on a SECOND
# member of the same enum type. The pure converter is tested against a
# hand-built index; only the real binary proves the index Tiled returns for this
# member is the one the palette declared.
#
# ⛑ The two shapes name DIFFERENT outline profiles, and neither matches its own
# body profile. A fixture where the outline repeated the body would round-trip
# byte-identically even if the reader took the wrong property.
node -e '
const C = require("./tools/tiled/extensions/aura-zone/aura-convert.js");
const fs = require("fs");
C.useContent(require("./tools/tiled/palette/content.json"));
const z = JSON.parse(fs.readFileSync("api/zones/world.json", "utf8"));
fs.writeFileSync("tools/tiled/.verify/outlines.json", C.serializeZone({
    name: z.name, bounds: z.bounds, terrain: [], props: [], spawns: [],
    campfires: z.campfires, anchors: z.anchors,
    polygons: [
        {profile: "Water", outlineProfile: "Coast", outlineWidth: 1.25, points: [
            {x: 4, y: -8}, {x: 14, y: -8}, {x: 9, y: 2}]},
        // ...and one with NO outline beside it, which must keep both keys absent.
        {profile: "Mountains", points: [
            {x: -20, y: -10}, {x: -12, y: -10}, {x: -12, y: -2}]},
    ],
    paths: [{profile: "Road", width: 2.5, outlineProfile: "Desert", outlineWidth: 0.5,
             points: [{x: -20, y: 12}, {x: 20, y: 12}]}],
}, false));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/outlines.json \
        "$(native "$ROOT/tools/tiled/.verify/outlines-out.json")" >/dev/null 2>&1 \
   && cmp -s tools/tiled/.verify/outlines.json tools/tiled/.verify/outlines-out.json; then
    ok "byte-identical — each outline came back as its own name, not an index"
else
    bad "outlines did not survive: $(cmp tools/tiled/.verify/outlines.json \
        tools/tiled/.verify/outlines-out.json 2>&1 | head -1)"
fi

echo
echo "a half-authored outline (a profile with no width)"
node -e '
const C = require("./tools/tiled/extensions/aura-zone/aura-convert.js");
const fs = require("fs");
C.useContent(require("./tools/tiled/palette/content.json"));
const z = JSON.parse(fs.readFileSync("api/zones/world.json", "utf8"));
fs.writeFileSync("tools/tiled/.verify/halfoutline.json", C.serializeZone({
    name: z.name, bounds: z.bounds, terrain: [], props: [], spawns: [],
    campfires: z.campfires, anchors: z.anchors,
    // ⚑ A zero-wide outline strokes nothing, so this fails SILENTLY in game and
    // has to be caught where the author can still see the object.
    paths: [{profile: "Road", width: 2.5, outlineProfile: "Desert", outlineWidth: 0,
             points: [{x: -20, y: 12}, {x: 20, y: 12}]}],
}, false));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/halfoutline.json \
        "$(native "$ROOT/tools/tiled/.verify/halfoutline-out.json")" >/dev/null 2>&1; then
    bad "the save was ACCEPTED — a zero-wide outline is not caught"
elif [ -e tools/tiled/.verify/halfoutline-out.json ]; then
    bad "refused, but a file was written anyway"
else
    ok "refused, nothing written"
fi

echo
echo "a polygon naming a profile that does not exist"
node -e '
const C = require("./tools/tiled/extensions/aura-zone/aura-convert.js");
const fs = require("fs");
C.useContent(require("./tools/tiled/palette/content.json"));
const z = JSON.parse(fs.readFileSync("api/zones/world.json", "utf8"));
fs.writeFileSync("tools/tiled/.verify/badpolyprofile.json", C.serializeZone({
    name: z.name, bounds: z.bounds, terrain: [], props: [], spawns: [],
    campfires: z.campfires, anchors: z.anchors,
    // ⚑ zone.go ACCEPTS this (D8) and the client absorbs it (D11), so Tiled is
    // the only place it can be caught — and the polygon class has to inherit
    // that check rather than merely look like it does.
    polygons: [{profile: "no-such-profile", points: [
        {x: 0, y: 0}, {x: 8, y: 0}, {x: 8, y: 8},
    ]}],
}, false));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/badpolyprofile.json \
        "$(native "$ROOT/tools/tiled/.verify/badpolyprofile-out.json")" >/dev/null 2>&1; then
    bad "the save was ACCEPTED — the profile vocabulary is not enforced on polygons"
elif [ -e tools/tiled/.verify/badpolyprofile-out.json ]; then
    bad "refused, but a file was written anyway"
else
    ok "refused, nothing written"
fi

echo
echo "a zone with a vertex-less atmosphere is REFUSED"
# ⛔ THE LEG FOR A BOOT THAT ACTUALLY BROKE (2026-09-14). The atmospheres layer
# shipped without a validateModel leg — the only shape layer without one — so
# Tiled saved three objects with no vertices and aurad died on
# "atmosphere 0: needs at least 3 points to enclose an area, got 0".
#
# ⭐ Save-time validation exists to catch what the SERVER would reject while the
# author is still looking at the object. A new shape layer without a leg here is
# a broken boot waiting to happen, and only this file drives the real binary.
node -e '
const C = require("./tools/tiled/extensions/aura-zone/aura-convert.js");
const fs = require("fs");
C.useContent(require("./tools/tiled/palette/content.json"));
const z = JSON.parse(fs.readFileSync("api/zones/world.json", "utf8"));
fs.writeFileSync("tools/tiled/.verify/emptyatmo.json", C.serializeZone({
    name: z.name, bounds: z.bounds, terrain: [], props: [], spawns: [],
    campfires: z.campfires, anchors: z.anchors,
    atmospheres: [{profile: "Fog", points: []}],
}, false));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/emptyatmo.json \
        "$(native "$ROOT/tools/tiled/.verify/emptyatmo-out.json")" >/dev/null 2>&1; then
    bad "the save was ACCEPTED — an empty atmosphere would break the next boot"
elif [ -e tools/tiled/.verify/emptyatmo-out.json ]; then
    bad "refused, but a file was written anyway"
else
    ok "refused, nothing written"
fi

echo
echo "a region naming a profile that does not exist"
node -e '
const C = require("./tools/tiled/extensions/aura-zone/aura-convert.js");
const fs = require("fs");
C.useContent(require("./tools/tiled/palette/content.json"));
const z = JSON.parse(fs.readFileSync("api/zones/world.json", "utf8"));
fs.writeFileSync("tools/tiled/.verify/badprofile.json", C.serializeZone({
    name: z.name, bounds: z.bounds, terrain: [], props: [], spawns: [],
    campfires: z.campfires, anchors: z.anchors,
    // ⚑ zone.go ACCEPTS this (D8) and the client absorbs it (D11), so Tiled is
    // the only place it can be caught at all.
    regions: [{profile: "no-such-profile", points: [
        {x: 0, y: 0}, {x: 8, y: 0}, {x: 8, y: 8},
    ]}],
}, false));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/badprofile.json \
        "$(native "$ROOT/tools/tiled/.verify/badprofile-out.json")" >/dev/null 2>&1; then
    bad "the save was ACCEPTED — the profile vocabulary is not enforced"
elif [ -e tools/tiled/.verify/badprofile-out.json ]; then
    bad "refused, but a file was written anyway"
else
    ok "refused, nothing written"
fi

echo
echo "AREA EFFECTS survive on all three shapes — the FOURTH WRITER's leg"
# ⭐ E1's leg (plan-area-effects.md). `effect` is a TYPED ENUM property on three
# different classes across two layers, and Tiled hands a typed enum back as an
# INDEX into the declared values, never as the string — the same trap the regions
# and outlines legs exist for, now on a third vocabulary.
#
# ⛔ AND THIS IS THE ONLY THING THAT COVERS THE FOURTH WRITER FOR THIS KEY.
# aura-world-format.js copies object properties GENERICALLY (its `for key in
# src.properties` on the way in, `o.properties()` on the way out), so `effect`
# should need no code there at all — unlike `origin`, which is a MAP-level value
# that has to be copied onto the TileMap by hand and went missing exactly that
# way. "Should need none" is a claim, and the vitest pin cannot test it: the pin
# exercises the PURE converter and never meets Tiled's MapObject. This leg is
# what turns the claim into a measurement.
#
# ⛑ THREE shapes, THREE DIFFERENT effects, and two of them share the paths
# layer. A fixture naming one effect everywhere would round-trip byte-identically
# even with the reader cross-wired to the wrong class — the trap the polygons and
# clearings fixtures each document in their own words. The atmosphere also proves
# the key crosses a layer boundary, since its half lives in a different branch.
#
# ⛔ What this leg CANNOT see, the same measured limit as the atmospheres leg
# above: which ENUM the `effect` members declare. Headless --export-map loads no
# project, so tiled.propertyValue throws and the value round-trips as a bare
# string whatever the member says. That wiring is pinned statically in
# AuraTiledConvert.test.ts and the dropdown is a human check in the footer.
node -e '
const C = require("./tools/tiled/extensions/aura-zone/aura-convert.js");
const fs = require("fs");
const content = require("./tools/tiled/palette/content.json");
C.useContent(content);
const z = JSON.parse(fs.readFileSync("api/zones/world.json", "utf8"));
// ⚑ Names taken from the generated vocabulary, never typed: renaming a skill
// must not redden this leg, and a hand-typed name would.
const E = content.EFFECT_NAMES;
// ⚑ Profiles derived too, and for a sharper reason than tidiness: the first cut
// of this leg named "Lava" and "Miasma", which live only in an UNCOMMITTED
// profile table — so the leg was green in the working tree and would have been
// red the moment it was committed. A fixture must not depend on content that
// might not be there.
const P = content.PROFILE_NAMES[0], A = content.AIR_PROFILE_NAMES[0];
fs.writeFileSync("tools/tiled/.verify/effects.json", C.serializeZone({
    name: z.name, bounds: z.bounds, terrain: [], props: [], spawns: [],
    campfires: z.campfires, anchors: z.anchors,
    // A river that does something to whoever wades it — a stroked shape.
    paths: [{profile: P, width: 2.5, effect: E[0],
        points: [{x: -20, y: 12}, {x: 20, y: 12}]}],
    // The lava pool — a FILLED shape, on the same layer as the path above, with
    // a different effect. Also decorative-sibling free: the polygon and the path
    // must come back to their own arrays carrying their own names.
    polygons: [{profile: P, blocksMovement: true, effect: E[1], points: [
        {x: -20, y: -10}, {x: -12, y: -10}, {x: -12, y: -2}, {x: -20, y: -2}]}],
    // The miasma — AIR, on a different layer, with a third effect. This is the
    // half that proves the key is not a ground-shape-only property.
    atmospheres: [{profile: A, effect: E[2],
        points: [{x: 4, y: -8}, {x: 14, y: -8}, {x: 9, y: 2}]}],
}, false));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/effects.json \
        "$(native "$ROOT/tools/tiled/.verify/effects-out.json")" >/dev/null 2>&1 \
   && cmp -s tools/tiled/.verify/effects.json tools/tiled/.verify/effects-out.json; then
    ok "byte-identical — three shapes, three effects, two layers, none swapped"
else
    bad "area effects did not survive: $(cmp tools/tiled/.verify/effects.json \
        tools/tiled/.verify/effects-out.json 2>&1 | head -1)"
fi

echo
echo "a DECORATIVE shape grows no effect key — the inert-at-HEAD acceptance test"
# ⭐ D10, and it is the acceptance criterion for the whole chunk: the feature
# costs exactly zero until authored. A Tiled class member ALWAYS has a value, so
# the risk is the mirror image of the leg above — every one of the world's paths,
# polygons and fog banks growing an `"effect": "(no effect)"` nobody wrote on its
# first save. The round-trip of the shipped world.json at the top of this file
# already covers that for real content; this states it as its own leg so a
# failure says WHY rather than reporting 40 stray lines of diff.
node -e '
const C = require("./tools/tiled/extensions/aura-zone/aura-convert.js");
const fs = require("fs");
C.useContent(require("./tools/tiled/palette/content.json"));
const z = JSON.parse(fs.readFileSync("api/zones/world.json", "utf8"));
fs.writeFileSync("tools/tiled/.verify/noeffect.json", C.serializeZone({
    name: z.name, bounds: z.bounds, terrain: [], props: [], spawns: [],
    campfires: z.campfires, anchors: z.anchors,
    paths: [{profile: "Road", width: 2.5, points: [{x: -20, y: 12}, {x: 20, y: 12}]}],
    polygons: [{profile: "Mountains", points: [
        {x: -20, y: -10}, {x: -12, y: -10}, {x: -12, y: -2}]}],
    atmospheres: [{profile: "Fog", points: [{x: 4, y: -8}, {x: 14, y: -8}, {x: 9, y: 2}]}],
}, false));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/noeffect.json \
        "$(native "$ROOT/tools/tiled/.verify/noeffect-out.json")" >/dev/null 2>&1 \
   && cmp -s tools/tiled/.verify/noeffect.json tools/tiled/.verify/noeffect-out.json \
   && ! grep -q '"effect"' tools/tiled/.verify/noeffect-out.json; then
    ok "byte-identical, and no effect key appeared anywhere"
else
    bad "a decorative shape changed on save: $(cmp tools/tiled/.verify/noeffect.json \
        tools/tiled/.verify/noeffect-out.json 2>&1 | head -1)"
fi

echo
echo "a shape naming an effect that does not exist is REFUSED"
# ⚑ L5's rule applied the day the key lands: a new authored field without a
# validateModel leg is a broken boot waiting to happen, and the atmospheres layer
# has already taught that lesson once the expensive way. The server refuses this
# too (world.CrossValidateAreaEffects), so what is under test is WHEN and WHERE
# it is reported — next to the object, with an id, hours earlier.
node -e '
const C = require("./tools/tiled/extensions/aura-zone/aura-convert.js");
const fs = require("fs");
const content = require("./tools/tiled/palette/content.json");
C.useContent(content);
const z = JSON.parse(fs.readFileSync("api/zones/world.json", "utf8"));
fs.writeFileSync("tools/tiled/.verify/badeffect.json", C.serializeZone({
    name: z.name, bounds: z.bounds, terrain: [], props: [], spawns: [],
    campfires: z.campfires, anchors: z.anchors,
    polygons: [{profile: content.PROFILE_NAMES[0], effect: "NoSuchSkill", points: [
        {x: 0, y: 0}, {x: 8, y: 0}, {x: 8, y: 8}]}],
}, false));
'
if "$TILED" --export-map aura-zone tools/tiled/.verify/badeffect.json \
        "$(native "$ROOT/tools/tiled/.verify/badeffect-out.json")" >/dev/null 2>&1; then
    bad "the save was ACCEPTED — the effect vocabulary is not enforced"
elif [ -e tools/tiled/.verify/badeffect-out.json ]; then
    bad "refused, but a file was written anyway"
else
    ok "refused, nothing written"
fi

# ---- 3. the generated palette is in step with api/ --------------------------
echo
echo "generated palette matches the content it is generated from"
# ⚑ The templates are in here too, and they are the half most likely to go
# stale unnoticed: they carry a prop's body size baked into a box, so editing
# api/props/*.json without regenerating leaves the Templates view handing out
# the OLD size — which the box-is-the-scale rule then authors as a multiplier.
# `|| true`: the glob finds nothing on a checkout that predates them, and an
# empty `before` is exactly the "stale, regenerate" answer this leg should give.
palette_state() {
    cat tools/tiled/palette/content.json tools/tiled/palette/propertytypes.json \
        tools/tiled/palette/terrain.tsx tools/tiled/palette/props.tsx \
        tools/tiled/palette/templates/*/*.tx \
        tools/tiled/aura.tiled-project 2>/dev/null || true
}
before="$(palette_state)"
node tools/tiled/generate-palette.mjs >/dev/null
after="$(palette_state)"
if [ "$before" = "$after" ]; then
    ok "up to date and idempotent"
else
    bad "the checked-in palette was STALE — it has just been regenerated, commit it"
fi

echo
if [ "$fail" -eq 0 ]; then
    echo "all green."
    echo "⚑ still a human check (project state does not load headlessly):"
    echo "  1. open tools/tiled/aura.tiled-project, click a spawn, confirm the mob"
    echo "     dropdown renders;"
    echo "  2. click an AuraAtmosphere on the atmospheres layer and confirm its"
    echo "     profile dropdown offers the AIR names only — Cave Air, Gloom, Fog —"
    echo "     while a region offers the ground ones. That separation is the point of"
    echo "     the 2026-09-15 table split and no headless leg can see it."
    echo "  3. click an AuraClearing on the SAME layer and confirm it has NO profile"
    echo "     field at all, and that its 'clears' field is a DROPDOWN offering"
    echo "     darkness / haze / both. The empty property bag is the A4 ruling (L7):"
    echo "     a clearing paints nothing, so there is no look to name."
    echo "  4. click an AuraPath, an AuraPolygon and an AuraAtmosphere and confirm each"
    echo "     has an 'effect' DROPDOWN listing the skills, led by '(no effect)' — and"
    echo "     that an AuraRegion and an AuraClearing have NO effect field at all."
    echo "     Which enum a member declares is invisible headlessly (measured), so the"
    echo "     three legs above prove the NAME survives and nothing about the wiring."
    echo "  5. click a prop on the props layer and confirm it has a 'blocksMovement'"
    echo "     DROPDOWN reading '(inherit)' / 'blocks' / 'walk through' — then DRAG A"
    echo "     FRESH ONE from the Templates view and confirm it shows the same"
    echo "     field, already sitting at '(inherit)'. ⛔ That second half is the whole"
    echo "     point: AuraProp carried no members at all until 2026-09-17, so a newly"
    echo "     dragged prop had an EMPTY Properties panel and saved as non-blocking."
    echo "  6. in that same Templates view, drag a Tree, a House and a Sand patch onto"
    echo "     the map and confirm each lands at its TRUE footprint — save, and the"
    echo "     three placements carry NO 'scale' key and the patch reads \"size\": 1."
    echo "     ⛔ Drag them from the TILESET instead and every one is wrong: the tree"
    echo "     arrives at 1.524 (roundTree.png is 512² against a 336 px body) and the"
    echo "     house is REFUSED outright, because its image aspect is not its body's."
    echo "     A template carries the box; a tileset tile carries only the picture."
    echo "     ⚑ Nothing headless can perform a drag, so this is the only leg there is."
    echo "  7. the escape hatch, for everything already dropped the old way: drag a"
    echo "     tree off the TILESET on purpose, then Map ▸ Fit to true size"
    echo "     (Ctrl+Alt+F). It must snap to the body box WITHOUT sliding — a tile"
    echo "     object anchors bottom-left, so a resize that ignores the centre walks"
    echo "     the art up and right by half the change. Then Ctrl+Z: one undo step,"
    echo "     not one per object. ⚑ Also try it on a REGION polygon and confirm it"
    echo "     is left alone and named in the message — only props and terrain have"
    echo "     a true size, and squashing a drawn shape is the bug, not the fix."
    echo "  8. the LAYERS panel, top to bottom: anchors · atmospheres · darkAreas ·"
    echo "     campfires · spawns · props · terrain · paths · regions. That is the"
    echo "     CLIENT's draw order upside down, which is what Tiled's panel shows —"
    echo "     regions at the BOTTOM because a region is the ground everything else"
    echo "     is drawn on (plan-zone-naming.md D1). ⚑ A vitest leg pins the array"
    echo "     order; only your eyes can confirm Tiled built the panel from it."
    echo "  9. in that same panel, 'regions' and 'atmospheres' — and ONLY those two —"
    echo "     show a CLOSED PADLOCK, while both layers are still fully VISIBLE (D2)."
    echo "     Click a big region polygon: it must not select. Click a prop standing"
    echo "     inside that region: it must select. ⛔ Then unlock regions, close the"
    echo "     file and reopen it — the padlock is BACK, and that is correct, not a"
    echo "     bug: a zone file stores arrays, not layers, and Tiled's session file"
    echo "     carries no lock state, so the converter's flag is the only state there"
    echo "     is. Verifying this headlessly is impossible — --export-map never"
    echo "     builds a Layers panel."
else
    echo "FAILED — see above."
fi
exit "$fail"
