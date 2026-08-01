#!/usr/bin/env bash
# One-time, no-root setup of the headless-browser harness that drives the
# simharness web explorer (driver.mjs next to this script) AND every script in
# .claude/skills/verify. Idempotent — everything lands in $AURA_RUN_DIR
# (default ~/.cache/aurahunter-run).
#
# ⚑ TWO HALVES, AND ONLY THE FIRST IS UNIVERSAL. The npm half (playwright +
# chromium) is all any machine needs. The deb half below exists solely because
# the Linux CONTAINER this was written in lacks three shared libs the headless
# shell links against — it is not part of "installing playwright", and on a
# machine that already has them (Windows, macOS, a normal desktop Linux) it is
# both unnecessary and impossible: `dpkg-deb` does not exist there.
#
# That distinction is worth stating because it read as "the harness cannot run
# here" on the Windows dev box for three chunks (8a 1a/1b/1c all recorded "no
# browser harness ran"), when in fact the two npm lines were the whole job.
set -euo pipefail

DIR="${AURA_RUN_DIR:-$HOME/.cache/aurahunter-run}"
mkdir -p "$DIR"
cd "$DIR"

[ -f package.json ] || npm init -y >/dev/null
node -e "require('playwright')" 2>/dev/null || npm i playwright --no-audit --no-fund
npx playwright install chromium

# --- Linux-container-only: the three libs the headless shell needs and this
# --- image lacks. Skipped anywhere dpkg-deb is absent, which is every machine
# --- that ships them in the first place.
if command -v dpkg-deb >/dev/null 2>&1; then
  mkdir -p "$DIR/debs" "$DIR/libs"
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
else
  echo "no dpkg-deb: skipping the container shared-lib extraction (not needed here)"
fi

# Prove it, rather than announcing it. A launch failure here is far cheaper to
# read than the same failure inside a harness script twenty steps in.
#
# ⚑ The workdir is recomputed INSIDE node, from AURA_RUN_DIR/HOME, exactly as
# every harness script does — deliberately not interpolated from $DIR. Under Git
# Bash on Windows the shell's $DIR is a POSIX path (/c/Users/…) that node cannot
# resolve, so interpolating it would fail here while the real scripts work.
node -e "
const { createRequire } = require('node:module');
const { join } = require('node:path');
const dir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const { chromium } = createRequire(join(dir, 'noop.js'))('playwright');
chromium.launch({ args: ['--no-sandbox'] })
  .then(async b => { console.log('chromium ' + b.version() + ' launches, resolved from ' + dir); await b.close(); })
  .catch(e => { console.error('chromium will not launch: ' + e.message); process.exit(1); });
"

echo "browser harness ready in $DIR"
