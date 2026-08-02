#!/usr/bin/env bash
#
# Windows/git-bash variant of dev-restart.sh for this machine.
#
#   ./scripts/dev-restart-windows.sh server     # build + run aurad only
#   ./scripts/dev-restart-windows.sh frontend   # webpack dev server only
#   ./scripts/dev-restart-windows.sh all        # both
#
# Why this exists instead of dev-restart.sh: that script kills via
# `pkill -x <name>` and backgrounds via `setsid` — neither exists in this
# git-bash. This one kills by finding the PID actually LISTENING on the
# port (via `netstat -ano`) and stopping just that PID through PowerShell,
# which works regardless of what the process is named (aurad vs aurad.exe,
# and node.exe is ambiguous — several unrelated node processes can be
# running at once, so killing by name would be wrong here).
#
# This DOES rebuild the backend every time (plain `go build`, no `make` —
# it isn't installed on this machine). It does NOT rebuild the frontend;
# webpack's own dev server does that.
#
# Local quirk pinned in CLAUDE.md: this machine's conf.json names no zone,
# so aurad needs -zone world explicitly or boot panics.
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

# Kill whatever is LISTENING on $1 (TCP port), by PID, via PowerShell.
kill_port() {
	local port="$1" pids pid
	pids="$(netstat -ano | grep -E ":${port}[[:space:]].*LISTENING" | awk '{print $NF}' | sort -u)"
	for pid in $pids; do
		echo "   killing PID $pid (port $port)"
		powershell.exe -NoProfile -Command "Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue"
	done
	[ -n "${pids:-}" ] && sleep 1 || true
}

restart_server() {
	echo "==> building aurad"
	( cd "$REPO/backend" && go build -o aurad.exe ./cmd/aurad )

	echo "==> aurad"
	kill_port 2000
	cd "$REPO/backend"
	nohup ./aurad.exe -dev -content ../api -zone world >"$LOG_DIR/server.log" 2>&1 </dev/null &
	disown
	if ! wait_for_http http://localhost:2000/ 20; then
		echo "!! aurad did not come up — last 20 log lines:" >&2
		tail -20 "$LOG_DIR/server.log" >&2
		return 1
	fi
	# Content is validated at boot and panics on violation; always show the counts.
	grep -hoE '"msg":"(Loaded|placed)[^}]*' "$LOG_DIR/server.log" | tail -12 || true
	if grep -qiE 'panic|"level":"ERROR"' "$LOG_DIR/server.log"; then
		echo "!! panic/ERROR in the boot log — see $LOG_DIR/server.log" >&2
		return 1
	fi
}

restart_frontend() {
	echo "==> webpack"
	kill_port 2001
	cd "$REPO/frontend"
	nohup npm run start >"$LOG_DIR/webpack.log" 2>&1 </dev/null &
	disown
	if ! wait_for_http http://localhost:2001/ 90; then
		echo "!! webpack did not come up — last 20 log lines:" >&2
		tail -20 "$LOG_DIR/webpack.log" >&2
		return 1
	fi
	# curl can succeed a moment before the "compiled" summary line is
	# flushed to the log (webpack's persistent cache can finish fast) —
	# poll briefly instead of failing the whole script over a race.
	local j=0
	while [ "$j" -lt 15 ]; do
		if grep -qE 'compiled (successfully|with)' "$LOG_DIR/webpack.log"; then
			grep -E 'compiled (successfully|with)' "$LOG_DIR/webpack.log" | tail -1
			break
		fi
		sleep 1
		j=$((j + 1))
	done
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
