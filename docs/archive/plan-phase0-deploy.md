# Plan: Phase-0 Deploy — Friends Playtest (~20 players)

> **Status:** HISTORICAL RECORD — **never executed as written**, superseded by
> `plan-playtest-deploy.md`, which is the deploy that actually went live
> 2026-07-21 (`a7a2267d`). Kept for the runbook detail and the hosting rationale.
> Not maintained.

*Planned 2026-07-14. Executes Phase 0 of `research-hosting.md` §4. One chunk:
a runbook session, not a coding session — the only repo changes are a deploy
script + refreshed `devops/` files. Written for an operator without prior
server experience; every command is copy-pasteable.*

> Numbers (instance sizes, prices) are placeholders per project rule.

## 1. Goal & scope

**Goal:** a URL friends can open in a browser and play together over the
internet. Session-based world — a crash or restart resets the session, which
is acceptable and even desirable at this phase (loud failures).

**Out of scope (deliberately, see §7):** metrics/observability, panic
recovery, rate limiting, join gating, CI deploys, persistence, backups,
Cloudflare. All Phase 1+ (`research-hosting.md` §4).

## 2. Decisions

- **Join stays open (Option A, decided 2026-07-14):** no join secret; rely on
  an unlisted domain + a strong cheat token. Blast radius of a stranger
  finding the server is "grief one session, restart". If it ever actually
  happens, a shared join secret (Option B — token check on `Join`, an
  afternoon incl. wire touch) is the response; it will be superseded by
  accounts (roadmap item 3) anyway.
- **Provider: Hetzner Cloud** *(placeholder/recommendation)* — smallest
  **x86** shared instance (CX-class, ~€4–8/mo). x86 deliberately: the WSL2
  dev machine builds `linux/amd64` natively, so no cross-compile step. EU
  region (audience is EU friends).
- **Domain: throwaway.** The rebrand (step 7, `plan-rebrand-cleanup.md`) is
  complete as of 2026-07-21, but deliberately kept the berryhunter.io URLs —
  the replacement domain is still an open PO call. Any cheap domain works
  for Phase 0. Subdomain fine.
- **Architecture: the proven `devops/` path** — single binary, systemd with
  `DynamicUser`, built-in autocert TLS, `-dev` flag to serve the frontend
  statically. No Docker, no reverse proxy, no goreleaser (KISS; those paths
  exist in-repo but are unmaintained).

## 3. Security posture (the point of this plan)

### 3.1 Verified attack surface (code recon 2026-07-14)

- Exactly **two HTTP routes**: `/game` (WebSocket) and `/` (static files; in
  non-dev mode `/` is just a 204 ping). No admin/editor/save endpoints — the
  zone editor saves via client-side file download (`file-saver`), the
  `?develop` panel is pure client code.
- **Cheats are server-side token-gated** (`sys/cmd`: string match against the
  configured token list; invalid attempts are logged). The only weakness is a
  guessable token — the historical `plz` must never ship.
- **Join is ungated** (accepted, §2) and **nothing is rate-limited**
  (accepted, §7).
- **TLS built-in**: with `server.tlsHost` set, autocert obtains a Let's
  Encrypt cert via the TLS-ALPN challenge **on port 443 only** — port 80 is
  never listened on. Consequence: no `http://`→`https://` redirect exists;
  share the full `https://` URL with friends.
- The frontend defaults its WebSocket to same-origin `wss://<host>/game`
  when served over standard https — **no `?wsUrl=` needed** in shared links.

### 3.2 Threat model

The game holds nothing valuable (no accounts, no persistence, no user data).
The asset needing protection is **the VPS itself** — a compromised box gets
abused (spam, attacks) at the owner's cost and name. Ranked:

1. **SSH compromise** → real-world consequences. Mitigated in §5.2 (key-only
   auth, provider firewall, auto-updates). This is the part to get right.
2. **Weak cheat token** → in-game god-mode griefing. Mitigated by one long
   random token (§5.4).
3. **Hostile client bytes** (malformed FlatBuffers from a non-browser
   client) → Go is memory-safe; worst case is a panic → systemd restarts in
   3 s → possible crash-loop DoS. Known gap (`research-v1-readiness.md` §3
   hurt-list #1), **accepted** for Phase 0.
4. **Join/connection spam** → no rate limiting. **Accepted**; Cloudflare +
   throttling is the Phase-1 answer.

### 3.3 Standing rules for the box

- The box runs **nothing but** sshd + aurad. No extra software, no
  other sites, no personal data, no reused passwords/keys.
- Provider account gets **2FA**.
- Treat the box as disposable: teardown = delete VPS (§6.4); rebuild from
  this runbook takes <1 h. Never store anything on it that isn't in the repo
  or this runbook.

## 4. Prerequisites (user tasks, ~1 h)

1. Hetzner Cloud account, **enable 2FA**.
2. Generate an SSH key locally if none exists (WSL2):
   `ssh-keygen -t ed25519` → upload the **public** key
   (`~/.ssh/id_ed25519.pub`) in the Hetzner console. The private key never
   leaves the dev machine.
3. Create the VPS: smallest x86 instance, Ubuntu LTS (24.04), EU location,
   **select the SSH key at creation** (Hetzner then provisions root as
   key-only — no password ever exists).
4. Create a **Hetzner Cloud Firewall** and attach it to the server — inbound
   allow **TCP 22 (SSH) + TCP 443 (HTTPS)** only, drop everything else
   (port 80 is unused, §3.1). Enforced outside the box, so a mistake inside
   the box can't open ports.
5. Buy/repurpose a domain; DNS **A record** → the VPS IPv4 (+ AAAA for IPv6
   if offered). Wait until `ping <domain>` answers with the VPS IP.

## 5. Runbook

### 5.1 Repo work (the only code-adjacent changes, done in the execution session)

- `devops/conf.json` → **replace** the stale pre-skill-system file with a
  fresh copy of `backend/conf.default.json`, server block changed to
  `{"path": "/game", "tlsHost": "<domain>", "frontendDir": "./frontend"}`
  (no `port` — TLS forces 443 and warns otherwise). Game block stays
  current-tuning verbatim.
- `devops/deploy.sh` → new ~20-line script: build backend
  (`make -C backend build`) + frontend (`cd frontend && npm run build`),
  `rsync` binary, `frontend/dist/` → `frontend/`, and conf to
  `root@<domain>:/opt/aurad/`, then `systemctl restart aurad`
  over ssh. **`tokens.list` is deliberately NOT deployed by the script** —
  it's written once by hand (§5.4) and never lives in the repo.
- `devops/README.md` → update to this flow (it still documents GOPATH-era
  steps in `update.sh`; `update.sh`/`up.sh` at repo root were dead and were
  pruned by the step-7 cleanup sweep, `93fba97e`).
- Verify `devops/aurad.service` as-is (it's sound: `DynamicUser`
  sandbox, auto-restart 3 s, `CAP_NET_BIND_SERVICE` for 443,
  `CacheDirectory` → autocert cert cache survives restarts).

### 5.2 Box hardening (once, as root over ssh, ~10 min)

```shell
ssh root@<domain>

# 1) verify what Hetzner provisioned: password auth must be off
sshd -T | grep -E 'passwordauthentication|permitrootlogin'
#    expect: passwordauthentication no
#    permitrootlogin without-password (= key-only) or prohibit-password
#    if not: set both in /etc/ssh/sshd_config.d/99-hardening.conf and
#    `systemctl reload ssh` — with the terminal kept open until a second
#    ssh login is confirmed working

# 2) automatic security patches
apt-get update && apt-get install -y unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

# 3) reboot to land pending kernel updates, then confirm key login works
reboot
```

No ufw needed — the provider firewall (§4.4) is the enforcement point.

### 5.3 App install (once)

```shell
ssh root@<domain>
mkdir -p /opt/aurad
# then from the dev machine: run devops/deploy.sh (copies binary, frontend, conf)

# systemd unit (contents = devops/aurad.service)
systemctl edit --force --full aurad
systemctl enable --now aurad
journalctl -f -u aurad     # watch the boot
```

### 5.4 Secrets (once, by hand, never in the repo)

```shell
# on the box:
openssl rand -hex 16 > /opt/aurad/tokens.list
cat /opt/aurad/tokens.list   # note it down locally, share with no one
```

The cheat URL is then `https://<domain>/?token=<that value>` — the operator's
private link. Friends get the plain `https://<domain>/`.

### 5.5 First-boot expectations

- Boot log shows `🦄 Booting TLS game-server`, `🔐 Requesting ACME
  certificate`, and `Loading content source=embedded` (embedded is correct
  for prod — no `-content` flag).
- First https request takes a few extra seconds (live ACME issuance), then
  the cert is cached (`CacheDirectory`) across restarts. Let's Encrypt rate
  limits (~5 issuances/domain/week) make cache persistence matter — don't
  delete the cache dir casually.
- Known cosmetic: autocert `Email` is hardcoded `dev@berryhunter.io`
  (`backend/cmd/aurad/aurad.go`; expiry-notice address only, functionally
  irrelevant). Step 7 deliberately left the berryhunter.io addresses in
  place — this changes with the domain decision, not before.

## 6. Verification & operations

### 6.1 Smoke checklist (the "in-game verify" of this chunk)

- [ ] `https://<domain>/` loads the game from a network that is NOT the dev
      machine's (phone on mobile data is the honest test).
- [ ] Two clients from two different networks join, see each other move,
      auras tick.
- [ ] Cheat with the real token works (e.g. `PING`); a wrong token is
      rejected and logged (`😡 … invalid token`).
- [ ] `http://<domain>/` does NOT load (expected — no port 80; share https
      links only).
- [ ] Kill test: `systemctl kill --signal=SIGKILL aurad` → unit is
      back within ~3 s (`systemctl status`), clients can rejoin.
- [ ] `sshd -T` re-checked after the reboot (hardening survived).
- [ ] From outside: `nmap <domain>` (or an online port scanner) shows only
      22 + 443 open.

### 6.2 During the playtest

- Logs: `journalctl -f -u aurad`.
- Balance/content patch: edit locally → `devops/deploy.sh` → ~5 s restart,
  players rejoin (announce in chat first). This is the whole deploy story at
  Phase 0.
- If griefed by a stranger (Option A risk materializing):
  `systemctl restart aurad` ends it; recurring → build Option B.

### 6.3 What "done" means

Smoke checklist green + one real evening playtest with ≥3 friends on
different networks survives without operator intervention.

### 6.4 Teardown / pause

Delete the VPS in the console (billing stops; hourly billed). Keep the
domain. Rebuild later = §4.3 onwards, <1 h. Nothing of value lives on the box.

## 7. Accepted risks & non-goals (recorded so they aren't re-argued)

| Risk | Status |
|---|---|
| Panic in game loop = full restart, possible crash-loop from hostile bytes | Accepted; Phase 1 (hurt-list #1) |
| No rate limiting (join/chat/input) | Accepted; Phase 1 |
| Open join — strangers can play/grief | Accepted (§2 Option A); response = Option B on demand |
| No observability beyond journald | Accepted; Phase 1 |
| No backups | Nothing to back up (session-based) |
| Deploy = restart with disconnects | Fine at this phase; Phase 2 requirement is only "no *state* loss", which needs persistence first |

## 8. Open items

- [ ] Pick the actual domain (user; throwaway).
- [ ] Execution session: §5.1 repo work → §4 user tasks → §5.2–5.5 → §6.1
      smoke. One session, no code beyond `devops/`.
