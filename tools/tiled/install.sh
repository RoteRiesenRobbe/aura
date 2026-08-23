#!/usr/bin/env bash
# Link this repo's Tiled extension into Tiled's user extensions directory.
#
# ⚑ Why this exists: a project-local "extensionsPath" in aura.tiled-project does
# NOT load for Tiled's headless --export-map path (C0 measured it: relative,
# subdirectory and absolute all fail). Extensions only load reliably from the
# user directory, so each machine runs this once. The source of truth stays
# version-controlled here.
#
# ⚑ ONCE per machine, and that is now literal (C5): the extension is two script
# files and carries no content at all. Adding a mob, a texture or a prop is
# `node tools/tiled/generate-palette.mjs` and a reopen — never a reinstall.
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/extensions/aura-zone"

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) DEST="$LOCALAPPDATA/Tiled/extensions/aura-zone" ;;
  Darwin)               DEST="$HOME/Library/Preferences/Tiled/extensions/aura-zone" ;;
  *)                    DEST="${XDG_DATA_HOME:-$HOME/.local/share}/tiled/extensions/aura-zone" ;;
esac

mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -r "$SRC" "$DEST"
echo "installed: $DEST"
echo
echo "restart Tiled, then open the PROJECT:  tools/tiled/aura.tiled-project"
echo "and open world.json from its folder list (api/zones)."
echo
echo "The project is what carries the custom types — the mob/terrain/prop enums"
echo "and the per-kind colours. Opening api/zones/world.json on its own still"
echo "works, but those types will be missing; import palette/propertytypes.json"
echo "by hand (View > Custom Types) if you prefer that flow."
