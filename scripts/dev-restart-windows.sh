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

# Every aurad boot needs AURA_DB_URL and AURA_JWT_KEY — an unset AURA_DB_URL is
# FATAL (cmd/aurad/database.go). Source the gitignored local env file if it
# exists; an already-exported value still wins. Kept in sync with dev-restart.sh.
if [ -f "$REPO/backend/.env.local" ]; then
	set -a
	# shellcheck disable=SC1091
	. "$REPO/backend/.env.local"
	set +a
fi
if [ -z "${AURA_DB_URL:-}" ]; then
	echo -e "${RED}✖ AURA_DB_URL is not set and backend/.env.local does not exist.${RESET}" >&2
	echo -e "  Copy the template and edit it:  cp backend/.env.local.example backend/.env.local" >&2
	exit 1
fi

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

# Kill whatever is LISTENING on $1 (TCP port), by PID, via PowerShell.
kill_port() {
	local port="$1" name="${2:-port-$1}" pids pid i=0
	while [ "$i" -lt 5 ]; do
		pids="$(netstat -ano 2>/dev/null | grep -E ":${port}[[:space:]].*LISTENING" | awk '{print $NF}' | sort -u || true)"
		if [ -z "$pids" ]; then
			break
		fi
		for pid in $pids; do
			if [ "$pid" != "0" ] && [ -n "$pid" ]; then
				echo -e "${YELLOW}  🛑 [${name}]${RESET} Killing PID $pid listening on port $port..."
				taskkill //F //PID "$pid" 2>/dev/null || powershell.exe -NoProfile -Command "Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue" 2>/dev/null || true
			fi
		done
		sleep 1
		i=$((i + 1))
	done
}

# aurad's boot is FATAL without a reachable database, so bring one up first.
#
# This is a no-op for most setups: if anything already answers on the
# AURA_DB_URL port - Docker's container, a service left on Automatic, a remote
# database - it returns before touching any service, so a stray local service
# is never started underneath a Docker user. It acts only when nothing is
# serving AND a local Postgres service exists, which is the case on a Windows
# box that deliberately keeps Postgres on StartType=Manual because it is only
# ever needed for aurad. Starting one without elevation needs start/stop rights
# on that single service, granted by an ACE in its SDDL. Override the service
# name with AURA_PG_SERVICE.
ensure_db() {
	local port
	port="$(printf '%s' "${AURA_DB_URL:-}" | sed -nE 's#.*:([0-9]+)/.*#\1#p')"
	[ -z "$port" ] && port=5432

	if netstat -ano 2>/dev/null | grep -qE ":${port}[[:space:]].*LISTENING"; then
		return 0
	fi

	local svc="${AURA_PG_SERVICE:-postgresql-x64-16}"
	local status
	status="$(powershell.exe -NoProfile -Command "(Get-Service $svc -ErrorAction SilentlyContinue).Status" 2>/dev/null | tr -d '\r\n')"
	if [ -z "$status" ]; then
		echo -e "${YELLOW}  ⚠ [db]${RESET} nothing on port ${port} and no '${svc}' service - start your database first"
		return 0
	fi

	echo -e "${BLUE}  ▶ [db]${RESET} starting Postgres service (${svc})..."
	powershell.exe -NoProfile -Command "Start-Service $svc" >/dev/null 2>&1 || true

	local pg_isready="/c/Program Files/PostgreSQL/16/bin/pg_isready.exe"
	local i=0
	while [ "$i" -lt 20 ]; do
		if [ -x "$pg_isready" ]; then
			if "$pg_isready" -h 127.0.0.1 -p "$port" >/dev/null 2>&1; then
				echo -e "${GREEN}  ✓ [db]${RESET} Postgres accepting connections on ${port}"
				return 0
			fi
		elif netstat -ano 2>/dev/null | grep -qE ":${port}[[:space:]].*LISTENING"; then
			echo -e "${GREEN}  ✓ [db]${RESET} Postgres listening on ${port}"
			return 0
		fi
		sleep 1
		i=$((i + 1))
	done

	echo -e "${RED}  ✖ [db]${RESET} '${svc}' did not start (rights? port ${port} in use?) - aurad cannot boot without a database" >&2
	return 1
}

restart_server() {
	ensure_db
	echo -e "${CYAN}⚡ [aurad]${RESET} ${BOLD}Building backend (go build -o aurad.exe)...${RESET}"
	( cd "$REPO/backend" && go build -o aurad.exe ./cmd/aurad )

	echo -e "${CYAN}⚡ [aurad]${RESET} ${BOLD}Restarting backend server...${RESET}"
	echo -e "${YELLOW}  🛑 [aurad]${RESET} Cleaning up stale aurad processes..."
	taskkill //F //IM aurad.exe 2>/dev/null || true
	taskkill //F //IM aurad 2>/dev/null || true
	powershell.exe -NoProfile -Command "Get-Process aurad,aurad.exe -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue" 2>/dev/null || true
	kill_port 2000 "aurad"
	cd "$REPO/backend"
	echo -e "${BLUE}  ▶ [aurad]${RESET} Launching ./aurad.exe (logs: $LOG_DIR/server.log)..."
	nohup ./aurad.exe -dev -content ../api -zone world >"$LOG_DIR/server.log" 2>&1 </dev/null &
	disown
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
	kill_port 2001 "webpack"
	cd "$REPO/frontend"
	echo -e "${BLUE}  ▶ [webpack]${RESET} Launching webpack dev server (logs: $LOG_DIR/webpack.log)..."
	nohup npm run start >"$LOG_DIR/webpack.log" 2>&1 </dev/null &
	disown
	if ! wait_for_http http://localhost:2001/ 90 "webpack"; then
		echo -e "${RED}!! [webpack] webpack did not come up — last 20 log lines:${RESET}" >&2
		tail -20 "$LOG_DIR/webpack.log" >&2 || true
		return 1
	fi
	# curl can succeed a moment before the "compiled" summary line is
	# flushed to the log (webpack's persistent cache can finish fast) —
	# poll briefly instead of failing the whole script over a race.
	local j=0
	while [ "$j" -lt 15 ]; do
		if grep -qE 'compiled (successfully|with)' "$LOG_DIR/webpack.log" 2>/dev/null; then
			local comp_line
			comp_line="$(grep -E 'compiled (successfully|with)' "$LOG_DIR/webpack.log" | tail -1)"
			echo -e "${GREEN}  ✓ [webpack]${RESET} ${comp_line}"
			break
		fi
		sleep 1
		j=$((j + 1))
	done
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
