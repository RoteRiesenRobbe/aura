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

# ---- 3. the generated palette is in step with api/ --------------------------
echo
echo "generated palette matches the content it is generated from"
before="$(cat tools/tiled/palette/content.json tools/tiled/palette/propertytypes.json \
          tools/tiled/palette/terrain.tsx tools/tiled/palette/props.tsx \
          tools/tiled/aura.tiled-project)"
node tools/tiled/generate-palette.mjs >/dev/null
after="$(cat tools/tiled/palette/content.json tools/tiled/palette/propertytypes.json \
         tools/tiled/palette/terrain.tsx tools/tiled/palette/props.tsx \
         tools/tiled/aura.tiled-project)"
if [ "$before" = "$after" ]; then
    ok "up to date and idempotent"
else
    bad "the checked-in palette was STALE — it has just been regenerated, commit it"
fi

echo
if [ "$fail" -eq 0 ]; then
    echo "all green."
    echo "⚑ still a human check: open tools/tiled/aura.tiled-project, click a spawn,"
    echo "  and confirm the mob dropdown renders (project state does not load headlessly)."
else
    echo "FAILED — see above."
fi
exit "$fail"
