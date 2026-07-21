#!/usr/bin/env bash
# Build + bundle + push the playtest deployment (docs/plan-playtest-deploy.md).
#
#   devops/deploy.sh                          build + bundle only (devops/bundle/)
#   devops/deploy.sh root@host                build + bundle + rsync + restart
#   devops/deploy.sh root@host --content-only push api/ JSON + restart, no rebuild
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="$ROOT/devops/bundle"
HOST="${1:-}"
MODE="${2:-}"

restart() {
    ssh "$1" 'systemctl restart aurad && sleep 2 && journalctl -u aurad -n 25 --no-pager'
}

if [[ "$MODE" == "--content-only" ]]; then
    [[ -n "$HOST" ]] || { echo "usage: deploy.sh root@host --content-only" >&2; exit 1; }
    rsync -az --delete "$ROOT/api/" "$HOST:/opt/aurad/api/"
    restart "$HOST"
    exit 0
fi

make -C "$ROOT/backend" build
(cd "$ROOT/frontend" && npm run build)

rm -rf "$BUNDLE"
mkdir -p "$BUNDLE"
cp "$ROOT/backend/aurad" "$BUNDLE/"
cp "$ROOT/devops/conf.json" "$BUNDLE/"
cp -R "$ROOT/frontend/dist" "$BUNDLE/frontend"
cp -R "$ROOT/api" "$BUNDLE/api"

if grep -q CHANGE-ME "$BUNDLE/conf.json"; then
    echo "⚠️  devops/conf.json still has the CHANGE-ME.duckdns.org placeholder" >&2
fi
echo "bundle ready: $BUNDLE"

if [[ -n "$HOST" ]]; then
    # tokens.list is server-authored (private cheat token) — never overwrite it
    rsync -az --delete --exclude tokens.list "$BUNDLE/" "$HOST:/opt/aurad/"
    restart "$HOST"
fi
