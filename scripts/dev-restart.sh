#!/usr/bin/env bash
#
# Restart the dev processes for hand testing.
#
#   ./scripts/dev-restart.sh server     # aurad only (JSON/content or Go changes)
#   ./scripts/dev-restart.sh frontend   # webpack dev server only
#   ./scripts/dev-restart.sh all        # both
#
# Why this script exists: the kill step has to be `pkill -x <name>` (name-exact).
# `pkill -f <pattern>` matches the *full command line*, which includes the shell
# running the restart — so it kills itself before starting anything and the old
# process survives, silently serving stale code. That has burned several
# sessions. A shell is named `bash`/`sh`, so `-x` can never match it.
#
# This does NOT rebuild. Decide that first (see the `playtest` skill):
#   api/**.json only  -> no rebuild, aurad -content ../api picks it up
#   backend *.go      -> make -C backend build
#   api/schema/*.fbs  -> cd api/schema && ./make.sh, then backend build + frontend restart
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${AURA_LOG_DIR:-/tmp/aura-dev}"
mkdir -p "$LOG_DIR"

# Wait until $1 (url) answers, up to $2 seconds.
wait_for_http() {
	local url="$1" limit="$2" i=0
	while [ "$i" -lt "$limit" ]; do
		if curl -sf -o /dev/null "$url"; then return 0; fi
		sleep 1
		i=$((i + 1))
	done
	return 1
}

restart_server() {
	echo "==> aurad"
	pkill -x aurad || true          # -x, never -f (see header)
	sleep 1
	cd "$REPO/backend"
	setsid nohup ./aurad -dev -content ../api >"$LOG_DIR/server.log" 2>&1 </dev/null &
	if ! wait_for_http http://localhost:2000/ 20; then
		echo "!! aurad did not come up — last 20 log lines:" >&2
		tail -20 "$LOG_DIR/server.log" >&2
		return 1
	fi
	# Content is validated at boot and panics on violation; always show the counts.
	grep -hoE '"msg":"(Loaded|placed)[^}]*' "$LOG_DIR/server.log" | tail -12
	if grep -qiE 'panic|"level":"ERROR"' "$LOG_DIR/server.log"; then
		echo "!! panic/ERROR in the boot log — see $LOG_DIR/server.log" >&2
		return 1
	fi
}

restart_frontend() {
	echo "==> webpack"
	pkill -x webpack || true        # -x, never -f (see header)
	sleep 2
	cd "$REPO/frontend"
	setsid nohup npm run start >"$LOG_DIR/webpack.log" 2>&1 </dev/null &
	if ! wait_for_http http://localhost:2001/ 90; then
		echo "!! webpack did not come up — last 20 log lines:" >&2
		tail -20 "$LOG_DIR/webpack.log" >&2
		return 1
	fi
	grep -E 'compiled (successfully|with)' "$LOG_DIR/webpack.log" | tail -1
}

case "${1:-all}" in
server) restart_server ;;
frontend) restart_frontend ;;
all)
	restart_server
	restart_frontend
	;;
*)
	echo "usage: $0 [server|frontend|all]" >&2
	exit 2
	;;
esac

echo
echo "logs: $LOG_DIR"
echo "http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game"
