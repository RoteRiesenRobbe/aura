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

## Ops & security posture

Audited 2026-07-22 (PO question: "ist der Server sicher?"). Framing: security
scales with what there is to lose, and today that is one restartable game
process with no data behind it. Recorded here so the *next* posture step isn't
rediscovered from scratch.

### Current state (audited 2026-07-22)

| Surface | State |
|---|---|
| Open ports | **22, 80, 443** only — everything else binds loopback (systemd-resolve) |
| `aurad` | non-root user `aurad`, `ProtectSystem=strict`, `NoNewPrivileges`, `PrivateTmp` |
| SSH | root `prohibit-password`; **`PasswordAuthentication no`** (2026-07-22, see below) |
| Patching | `unattended-upgrades` active, 0 pending |
| Shell users | `root` only |
| ufw / iptables / Hetzner cloud firewall | all inactive — nothing to block, see ruling below |

~110 failed SSH logins/24 h = internet background noise, dead-ends against
key-only root. Not a compromise indicator.

### Done 2026-07-22 — SSH key-only

`/etc/ssh/sshd_config.d/00-hardening.conf` with `PasswordAuthentication no` +
`KbdInteractiveAuthentication no`. Drop-in rather than editing the main config,
so `openssh-server` package updates don't clobber it. Applied with
`systemctl reload ssh` (not restart — no live session or player interrupted).

Verified: `sshd -t` before reload → fresh non-multiplexed connection after →
`sshd -T` shows `passwordauthentication no` → forced-password counter-probe
returns `Permission denied (publickey)` → `aurad` still active.

Motivation was pre-emptive, not acute: with root key-only and no second shell
user, password auth was already unusable. It removes the trap where a future
"let me quickly add a user" silently opens a bruteforceable door.

### Cloud firewall — deliberately NOT applied (2026-07-22)

The Hetzner UI's "no firewalls applied" is a statement, not a warning: with
only 22/80/443 listening and all three wanted, a firewall would block nothing
today. **It becomes real defense-in-depth the moment something can bind
`0.0.0.0` by accident — i.e. the database in step 8.** Deferred to there, not
dismissed.

fail2ban likewise skipped: with key-only root it reduces log noise, not risk.

### Carry into the step-8 persistence planning session

Persistence — not public launch — is the posture tipping point: it's the first
time the box holds something whose loss hurts. Attach a small ops block to that
plan:

- [ ] Hetzner cloud firewall, allow 22/80/443 only (now that a DB exists)
- [ ] DB bound to localhost, never `0.0.0.0`
- [ ] Daily backup + a **restore** actually exercised once
- [ ] Credential handling (DB password not in the repo, same pattern as `tokens.list`)
- [ ] GDPR applies as soon as accounts carry e-mail addresses of non-friends

Roughly an hour if done *while* building persistence; an unpleasant afternoon
retrofitted.

### Carry into any public launch

App-layer, not host-layer — these already sit in "known-accepted risks" above
and stay acceptable only while the URL is unlisted:

- [ ] Rate limiting / join-flood protection — **the likely way a playtest
  actually breaks**: once the URL reaches a Discord, one bored person with a
  script can swamp the server
- [ ] WebSocket `CheckOrigin` currently returns `true` for any origin

### Rule of thumb

**Now:** nothing. → **With persistence:** firewall + backups + DB closed. →
**Before public:** rate limiting + `CheckOrigin`.

## Status

- **Security posture audited + SSH hardened 2026-07-22** (key-only SSH; cloud
  firewall deliberately deferred to step 8). See §Ops & security posture.
- **DEPLOYED + LIVE + PO-VERIFIED 2026-07-21, `a7a2267d`:** `https://aura-game.duckdns.org/`
  (Hetzner CX23 `159.69.148.73`, systemd `aurad`, LE cert, `-content ./api`).
  §A–§D complete: machine checks green incl. live Playwright join smoke, PO
  played live ("hat alles geklappt, wir können spielen").
- **Ops quick-ref:** full update `devops/deploy.sh root@159.69.148.73`;
  map/content only `devops/deploy.sh root@159.69.148.73 --content-only`;
  logs `ssh root@159.69.148.73 journalctl -u aurad -f`. Every restart wipes
  characters — `ANNOUNCE` in-game first. Cheat token: server
  `/opt/aurad/tokens.list` only, never in the repo.
