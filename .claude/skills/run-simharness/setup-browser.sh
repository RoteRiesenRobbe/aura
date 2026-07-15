#!/usr/bin/env bash
# One-time, no-root setup of the headless-browser harness used to drive the
# simharness web explorer (driver.mjs next to this script). Idempotent —
# everything lands in $AURA_RUN_DIR (default ~/.cache/aurahunter-run):
# playwright + chromium-headless-shell via npm, plus the three shared libs
# the shell needs that this container lacks (libnspr4 / libnss3 / libasound2),
# extracted from Ubuntu debs with dpkg-deb -x — no sudo required.
set -euo pipefail

DIR="${AURA_RUN_DIR:-$HOME/.cache/aurahunter-run}"
mkdir -p "$DIR/debs" "$DIR/libs"
cd "$DIR"

[ -f package.json ] || npm init -y >/dev/null
node -e "require('playwright')" 2>/dev/null || npm i playwright --no-audit --no-fund
npx playwright install chromium

# Pinned for Ubuntu noble. If a URL 404s, the archive bumped the version:
# look up the current filename at https://packages.ubuntu.com/noble/<pkg>.
base=http://archive.ubuntu.com/ubuntu/pool/main
for deb in \
  n/nspr/libnspr4_4.35-1.1build1_amd64.deb \
  n/nss/libnss3_3.98-1build1_amd64.deb \
  a/alsa-lib/libasound2t64_1.2.11-1build2_amd64.deb; do
  f="debs/$(basename "$deb")"
  [ -f "$f" ] || curl -sf -o "$f" "$base/$deb"
  dpkg-deb -x "$f" libs
done

echo "browser harness ready in $DIR"
