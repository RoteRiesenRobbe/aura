# Plan: Friends & Family Playtest Deployment

**Goal:** get the current game publicly reachable — easy, fast, safe — for an
invited friends-and-family playtest. Not a productionization step; accounts &
persistence (roadmap item 3) stays the next real feature and is explicitly NOT
part of this.

**Session:** 2026-07-21 (combined plan + setup session, PO-directed pivot).

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Hosting | Small VPS (Hetzner-class, EU, amd64) | Matches the repo's inherited devops path exactly: single binary, systemd, built-in TLS. Always on, ~€4–6/mo. |
| Domain | Free DuckDNS subdomain (`<name>.duckdns.org`) | Zero purchase, works with Let's Encrypt (duckdns.org is on the Public Suffix List → per-subdomain rate limits). Real domain remains an open PO call from the rebrand. |
| TLS | Built-in `autocert` (Let's Encrypt) | Already in `aurad` (`server.tlsHost`); no reverse proxy to operate. Port-80 companion listener added this session (http-01 fallback + https redirect). |
| Frontend serving | `aurad -dev` serving `frontend/dist` | The `-dev` flag just means "serve the frontend dir" — it enables nothing unsafe. One process, same origin, client auto-derives `wss://host/game`. |
| Content on server | `-content ./api` | PO map/content edits deploy as JSON upload + restart — no rebuild. Closes the loop with the PO's ongoing zone-editor passes. |
| Cheat safety | `tokens.list` with one private token | Cheats (GOD/WARP/XP/…) are token-gated server-side. Token stays with the PO; players can't cheat. Joining stays open — acceptable for an unlisted URL. |
| Persistence | None (unchanged) | Server restart wipes all characters (reconnect stash is in-memory, TTL ~10 min). Playtest-acceptable; set expectations in the invite + announce restarts. |

## Known-accepted risks (fine for F&F, revisit before any public launch)

- WebSocket `CheckOrigin` returns true (any origin may connect).
- No rate limiting / join flood protection — the URL is the only gate.
- No persistence: restarts and crashes lose characters (systemd auto-restarts
  within seconds; reconnect stash survives ~10 min of client disconnect but
  not a server restart).
- `autocert` account email is still `dev@berryhunter.io` (harmless; cert
  expiry mail only).

## Checklist

### A. Repo-side prep (this session)

- [x] `devops/conf.json` refreshed to the current config shape (full file —
  `loadConf` does a plain parse, no default-merging) with `tlsHost` +
  `frontendDir` + `zone: world`.
- [x] `devops/aurad.service` gains `-content ./api`.
- [x] `devops/README.md` rewritten as the actual runbook (GCP ops-agent cruft
  dropped).
- [x] `devops/deploy.sh` — build backend + frontend, assemble
  `devops/bundle/`, optional rsync + restart; `--content-only` fast path for
  map edits.
- [x] Port-80 listener in `bootTlsServer` (`m.HTTPHandler(nil)`: ACME http-01
  + redirect to https).
- [x] Local verification: `go build ./...` + frontend `npm run build` green.

### B. PO-only steps (nobody else can do these)

- [x] Create the VPS: **Hetzner CX23, Ubuntu 26.04, Nürnberg,
  `159.69.148.73`** (2026-07-21). No cloud firewall configured (nothing else
  runs on the box; revisit if it ever hosts more).
- [x] DuckDNS: **`aura-game.duckdns.org`** → VPS IP.
- [x] `devops/conf.json` → `server.tlsHost: aura-game.duckdns.org`.
- [x] Cheat token: generated (`robbe-…`), lives only in
  `/opt/aurad/tokens.list` on the server + PO chat log. PO may replace anytime.

### C. Server setup (done 2026-07-21, driven over SSH from the session)

- [x] `ssh root@159.69.148.73` reachable (key `~/.ssh/id_ed25519`,
  comment `aura-playtest`).
- [x] `/opt/aurad/tokens.list` written (1 token).
- [x] `devops/deploy.sh root@159.69.148.73` — build + bundle + rsync green.
- [x] Unit installed, `systemctl enable --now aurad` — boot log clean: content
  source `./api`, zone `world`, 5 campfires / 14 npcs, warlord encounter,
  TLS boot + ACME cert for `aura-game.duckdns.org`.

### D. Verification

- [x] `https://aura-game.duckdns.org/` → HTTP 200, title "Aura", valid LE cert.
- [x] `http://` → 302 → https (new port-80 companion listener working live).
- [x] `/skills` serves the catalog JSON.
- [x] Live Playwright join smoke: WebSocket connected, joined as SmokeBot,
  spawned at the starting campfire, HUD rendered, zero page errors
  (scratchpad `live-smoke.mjs`).
- [x] PO played live from a normal network, 2026-07-21 — blanket-verified
  ("hat alles geklappt, wir können spielen"): join, play, cheats via token
  link. Live boot counts: 82 skills/14 factions/50 mobs/10 recipes/815 props/
  399 spawns/5 campfires/14 npcs, 0 panics (PO map edits since the triage-pass
  banner account for the prop/spawn delta).

### E. Ops notes / invite text

- **Update, full:** `devops/deploy.sh root@<host>` (rebuilds everything,
  ~seconds of downtime, wipes characters — announce first, e.g. via
  `ANNOUNCE`).
- **Update, map/content only:** `devops/deploy.sh root@<host> --content-only`
  (no rebuild; still a restart → still wipes characters).
- **Logs:** `journalctl -u aurad -f`. **Liveness:** in TLS mode `/` serves the
  frontend, `/skills` is a cheap probe.
- **Cert cache** lives in the systemd `CacheDirectory` (`/var/cache/aurad`-
  equivalent, survives restarts — don't wipe it, LE rate limits apply).
- Invite line for testers: *progress is not saved yet — server restarts reset
  characters; a browser reload within ~10 min keeps yours.*

## Status

- **DEPLOYED + LIVE + PO-VERIFIED 2026-07-21, `a7a2267d`:** `https://aura-game.duckdns.org/`
  (Hetzner CX23 `159.69.148.73`, systemd `aurad`, LE cert, `-content ./api`).
  §A–§D complete: machine checks green incl. live Playwright join smoke, PO
  played live ("hat alles geklappt, wir können spielen").
- **Ops quick-ref:** full update `devops/deploy.sh root@159.69.148.73`;
  map/content only `devops/deploy.sh root@159.69.148.73 --content-only`;
  logs `ssh root@159.69.148.73 journalctl -u aurad -f`. Every restart wipes
  characters — `ANNOUNCE` in-game first. Cheat token: server
  `/opt/aurad/tokens.list` only, never in the repo.
