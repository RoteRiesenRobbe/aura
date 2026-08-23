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
