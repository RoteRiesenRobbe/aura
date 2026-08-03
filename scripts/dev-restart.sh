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

# If running on Windows/Git Bash, delegate to the Windows variant.
if [[ "${OSTYPE:-}" == "msys"* || "${OSTYPE:-}" == "cygwin"* || "${OSTYPE:-}" == "win32"* ]] || (uname -s 2>/dev/null | grep -qi -E 'mingw|msys|cygwin'); then
	exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dev-restart-windows.sh" "$@"
fi

if [ -t 1 ] && [ "${TERM:-}" != "dumb" ]; then
	BOLD='\033[1m'
	RED='\033[1;31m'
	GREEN='\033[1;32m'
	YELLOW='\033[1;33m'
	BLUE='\033[1;34m'
	MAGENTA='\033[1;35m'
	CYAN='\033[1;36m'
	RESET='\033[0m'
else
	BOLD='' RED='' GREEN='' YELLOW='' BLUE='' MAGENTA='' CYAN='' RESET=''
fi

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${AURA_LOG_DIR:-/tmp/aura-dev}"
mkdir -p "$LOG_DIR"

# Wait until $1 (url) answers, up to $2 seconds.
wait_for_http() {
	local url="$1" limit="$2" name="${3:-server}" i=0
	while [ "$i" -lt "$limit" ]; do
		if curl -sf --connect-timeout 1 --max-time 2 -o /dev/null "$url"; then
			echo -e "${GREEN}  ✓ [${name}]${RESET} HTTP server responding at ${url} (${i}s)"
			return 0
		fi
		if [ "$((i % 3))" -eq 0 ] && [ "$i" -gt 0 ]; then
			echo -e "${BLUE}  ⏳ [${name}]${RESET} Waiting for ${url}... (${i}s/${limit}s)"
		fi
		sleep 1
		i=$((i + 1))
	done
	echo -e "${RED}  ✖ [${name}]${RESET} Timed out waiting for ${url} after ${limit}s" >&2
	return 1
}

# Kill whatever is LISTENING on $1 (TCP port).
kill_port() {
	local port="$1" name="${2:-port-$1}" i=0
	while [ "$i" -lt 5 ]; do
		local pids=""
		if command -v lsof >/dev/null 2>&1; then
			pids="$(lsof -ti:${port} 2>/dev/null || true)"
		elif command -v fuser >/dev/null 2>&1; then
			fuser -k ${port}/tcp >/dev/null 2>&1 || true
			break
		fi
		if [ -z "$pids" ]; then
			break
		fi
		for pid in $pids; do
			if [ -n "$pid" ] && [ "$pid" != "0" ]; then
				echo -e "${YELLOW}  🛑 [${name}]${RESET} Killing PID $pid listening on port $port..."
				kill -9 "$pid" 2>/dev/null || true
			fi
		done
		sleep 1
		i=$((i + 1))
	done
}

restart_server() {
	echo -e "${CYAN}⚡ [aurad]${RESET} ${BOLD}Restarting backend server...${RESET}"
	echo -e "${YELLOW}  🛑 [aurad]${RESET} Cleaning up stale aurad processes and port 2000..."
	pkill -x aurad 2>/dev/null || true          # -x, never -f (see header)
	pkill -x aurad.exe 2>/dev/null || true
	kill_port 2000 "aurad"
	cd "$REPO/backend"
	echo -e "${BLUE}  ▶ [aurad]${RESET} Launching ./aurad in background (logs: $LOG_DIR/server.log)..."
	setsid nohup ./aurad -dev -content ../api >"$LOG_DIR/server.log" 2>&1 </dev/null &
	if ! wait_for_http http://localhost:2000/ 20 "aurad"; then
		echo -e "${RED}!! [aurad] aurad did not come up — last 20 log lines:${RESET}" >&2
		tail -20 "$LOG_DIR/server.log" >&2 || true
		return 1
	fi
	# Content is validated at boot and panics on violation; always show the counts.
	echo -e "${CYAN}  📊 [aurad]${RESET} Content loaded successfully:"
	grep -hoE '"msg":"(Loaded|placed)[^}]*' "$LOG_DIR/server.log" | tail -12 | sed 's/^/     /' || true
	if grep -qiE 'panic|"level":"ERROR"' "$LOG_DIR/server.log"; then
		echo -e "${RED}!! [aurad] panic/ERROR in the boot log — see $LOG_DIR/server.log:${RESET}" >&2
		grep -iE 'panic|"level":"ERROR"' "$LOG_DIR/server.log" | tail -10 >&2 || true
		return 1
	fi
}

restart_frontend() {
	echo -e "${MAGENTA}⚡ [webpack]${RESET} ${BOLD}Restarting frontend dev server...${RESET}"
	echo -e "${YELLOW}  🛑 [webpack]${RESET} Cleaning up port 2001..."
	pkill -x webpack 2>/dev/null || true        # -x, never -f (see header)
	kill_port 2001 "webpack"
	cd "$REPO/frontend"
	echo -e "${BLUE}  ▶ [webpack]${RESET} Launching webpack dev server (logs: $LOG_DIR/webpack.log)..."
	setsid nohup npm run start >"$LOG_DIR/webpack.log" 2>&1 </dev/null &
	if ! wait_for_http http://localhost:2001/ 90 "webpack"; then
		echo -e "${RED}!! [webpack] webpack did not come up — last 20 log lines:${RESET}" >&2
		tail -20 "$LOG_DIR/webpack.log" >&2 || true
		return 1
	fi
	local comp_line
	comp_line="$(grep -E 'compiled (successfully|with)' "$LOG_DIR/webpack.log" | tail -1 || true)"
	if [ -n "$comp_line" ]; then
		echo -e "${GREEN}  ✓ [webpack]${RESET} ${comp_line}"
	fi
}

case "${1:-all}" in
server)
	restart_server
	echo
	echo -e "${BOLD}====================================================================${RESET}"
	echo -e "${GREEN}✨ [READY] aurad is live!${RESET}"
	echo -e "${BOLD}====================================================================${RESET}"
	echo -e "  📁 ${BOLD}Logs:${RESET}   $LOG_DIR/server.log"
	echo -e "  🎮 ${BOLD}Play:${RESET}   http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&develop"
	echo -e "${BOLD}====================================================================${RESET}"
	;;
frontend)
	restart_frontend
	echo
	echo -e "${BOLD}====================================================================${RESET}"
	echo -e "${GREEN}✨ [READY] webpack is live!${RESET}"
	echo -e "${BOLD}====================================================================${RESET}"
	echo -e "  📁 ${BOLD}Logs:${RESET}   $LOG_DIR/webpack.log"
	echo -e "  🎮 ${BOLD}Play:${RESET}   http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&develop"
	echo -e "${BOLD}====================================================================${RESET}"
	;;
all)
	restart_server
	restart_frontend
	echo
	echo -e "${BOLD}====================================================================${RESET}"
	echo -e "${GREEN}✨ [READY] Aura dev environment is live!${RESET}"
	echo -e "${BOLD}====================================================================${RESET}"
	echo -e "  📁 ${BOLD}Logs:${RESET}   $LOG_DIR"
	echo -e "  🎮 ${BOLD}Play:${RESET}   http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game"
	echo -e "  🛠️  ${BOLD}Dev:${RESET}    http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&develop"
	echo -e "${BOLD}====================================================================${RESET}"
	;;
*)
	echo -e "${RED}usage: $0 [server|frontend|all]${RESET}" >&2
	exit 2
	;;
esac
