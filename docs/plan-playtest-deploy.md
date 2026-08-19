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
| Persistence | ~~None (unchanged)~~ → **SUPERSEDED by step 8a** | *As decided 2026-07-21:* server restart wipes all characters (reconnect stash in-memory, TTL ~10 min). **No longer true since 8a chunk 4** — accounts + characters persist to PostgreSQL on the box, and shutdown flushes live characters. ⚑ And the box holds real data that **is not backed up**, by ruling — see §Status. |

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
  ~seconds of downtime — announce first, e.g. via `ANNOUNCE`). ⚑ Since step 8a a
  restart **keeps** characters; the flush happens on shutdown, so give it its
  moment rather than killing the process.
- **Update, map/content only:** `devops/deploy.sh root@<host> --content-only`
  (no rebuild; still a restart, so still announce).
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
| Agent (Claude Code) access | passphrase-less root key on the dev box; permission rules narrowed 2026-07-22, see below |

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

### Done 2026-07-22 — agent access narrowed (Claude Code permissions)

Same audit, second surface: the deploy path itself. `~/.ssh/id_ed25519` on the
dev box has **no passphrase** and authenticates as **root** — and
`.claude/settings.local.json` allowed `Bash(ssh *)` with **no deny rules at
all**. Net effect: an unattended root shell on the live server, invoked without
a confirmation prompt.

The realistic failure modes are *not* "the agent turns malicious":

- **A mistyped destructive command.** `deploy.sh` already runs
  `rsync --delete` against `/opt/aurad/`; a hand-typed variant with a wrong
  path and no prompt has nothing to catch it.
- **Prompt injection.** Web pages, server logs and files all get read into
  context. An agent holding a *pre-approved* root shell is a far more valuable
  injection target than one that has to ask.

Narrowed to what the runbook actually needs (blanket `Bash(ssh *)` and the
ad-hoc `ssh -o … root@… ' *` rule both removed):

| Allowed unprompted | Now prompts |
|---|---|
| `devops/deploy.sh *` (full + `--content-only`) | any ad-hoc `ssh root@… '<command>'` |
| `ssh root@159.69.148.73 journalctl *` | |
| `ssh root@159.69.148.73 systemctl status *` | |

Plus 8 deny rules over ssh — `rm`, `dd`, `mkfs`, `shutdown`, `reboot`,
`poweroff`, `userdel`, `chown -R`. Deny beats allow, so they hold even if a
broader allow rule gets added later.

**Deploys are unaffected:** permission checks apply to the top-level command,
so the `ssh`/`rsync`/`systemctl restart` calls *inside* `deploy.sh` are not
separately gated.

Two caveats, recorded so they aren't mistaken for solved:

- Prefix rules ending in `*` are a raised bar, **not a sandbox** — a command
  that starts as an allowed `journalctl` call can in principle chain further.
  The deny list is the backstop.
- `.claude/settings.local.json` is gitignored (global
  `~/.config/git/ignore`), so these rules are **per-machine** — a second dev
  box starts from the blanket default and must redo them.

Not done, deliberately: key passphrase and a non-root deploy user with a narrow
`systemctl restart aurad` sudo rule. Both add friction that only pays off once
the box holds data → folded into the step-8 block below.

### Cloud firewall — deliberately NOT applied (2026-07-22)

The Hetzner UI's "no firewalls applied" is a statement, not a warning: with
only 22/80/443 listening and all three wanted, a firewall would block nothing
today. **It becomes real defense-in-depth the moment something can bind
`0.0.0.0` by accident — i.e. the database in step 8.** Deferred to there, not
dismissed.

fail2ban likewise skipped: with key-only root it reduces log noise, not risk.

### Carried into step 8 — outcome recorded inline (step 8a closed 2026-08-04)

Persistence — not public launch — is the posture tipping point: it's the first
time the box holds something whose loss hurts. Attach a small ops block to that
plan:

> **Where this list stands now that 8a has shipped:** the durability item was
> **ruled deferred** (see its entry) and the rest of this block is **still owed** —
> closing step 8a did not tick the firewall, the localhost bind, the credential
> item, or the non-root deploy user. The GDPR line stays live too. This is the
> home of that debt; nothing else tracks it.

- [ ] Hetzner cloud firewall, allow 22/80/443 only (now that a DB exists)
- [ ] DB bound to localhost, never `0.0.0.0`
- ⏸ ~~Daily backup + a **restore** actually exercised once.~~ **DEFERRED by PO
  ruling 2026-08-04** — the live server is a testing ground even while externally
  reachable, and infinite persistence is not the goal yet, so a lost database
  costs a playtest, not a player's history. Step 8a closed without it; we come
  back when history is meant to be permanent (natural trigger: the
  character-sacrifice loop). **The learnings below survive the deferral** — read
  them before improvising a dump. ⚑ Two things learned
  while taking the one-off dump before migration `000002` (2026-08-04): a dump
  is only a backup once it has been **restored** somewhere (that one was, into a
  throwaway DB — 18 character rows, 12 accounts, 65 spellbook rows), and **live
  is PostgreSQL 18.4 while the dev container is 16.14**, so a live dump does
  *not* restore onto the dev box — it dies on `unrecognized configuration
  parameter "transaction_timeout"` (PG 17+). Deleting that `SET` line works, but
  the restore target's major version belongs in this checklist item, not in
  someone's head at 3am.
- [ ] Credential handling (DB password not in the repo, same pattern as `tokens.list`)
- [ ] Deploy as a non-root user (narrow `systemctl restart aurad` sudo rule) +
  passphrase or a separate unattended deploy key — see agent-access section
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

**Now:** nothing. → **With persistence:** firewall + ~~backups~~ + DB closed
(backups deferred 2026-08-04 — see the checklist above; the *firewall* and
*DB closed* halves are untouched by that ruling and still owed). →
**Before public:** rate limiting + `CheckOrigin`.

## Status

- ⭐ **The box now persists (step 8a, closed 2026-08-04), and it is NOT backed
  up.** PO ruling the same day: no backups for now — the live server is still a
  testing ground even though it is externally reachable, and infinite persistence
  is not the ultimate goal yet. Treat the live database as **losable**: it holds
  real accounts and characters, and nothing off-box holds a copy. Revisit is
  expected, not forgotten — see §Ops & security posture and
  `archive/plan-accounts-implementation.md` §8.
- **Security posture audited + SSH hardened 2026-07-22** (key-only SSH; cloud
  firewall deliberately deferred to step 8 — ⚑ **still owed**: the 2026-08-04
  ruling deferred *durability*, not the firewall / DB-bound-to-localhost /
  credential-handling items). See §Ops & security posture.
- **Agent access narrowed 2026-07-22** — blanket `Bash(ssh *)` replaced by
  three runbook-shaped allow rules + 8 ssh deny rules; deploys unaffected, ad-hoc
  remote commands now prompt. Rules are per-machine (file is gitignored).
- **DEPLOYED 2026-08-18, `f5949100` (baseline was `9c3d1c5b`, 2026-08-07):** the
  ascension + CC/retaliation + effect-types C1–C4 + portal-spells + code-health
  stack, both-sides deploy (FlatBuffers changed: `ConversationOption.skill_id`
  added, legacy `EntityType` values removed → hard refresh required; nobody was
  connected). **No new DB migrations** (000001/000002 already live; `store.Migrate`
  no-op). Pre-deploy `pg_dump` taken with aurad stopped (flush confirmed, 0 live)
  and pulled off-box to `devops/aura-backup-predeploy-20260818.sql` (397 KB;
  restore test skipped — zero schema delta, decision recorded). ⚑ **That dump was
  DELETED 2026-08-19 (PO: "live works fine, I'd prefer to just remove it") and was
  never committed** — it held real accounts and password hashes, so git was the
  wrong home for it. Its only job was rolling this deploy back; the deploy is live
  and PO-verified, and the standing ruling is that the live DB is losable. Nothing
  now exists to restore from, which is the deliberate posture, not an oversight. Verified: boot
  0 WARN/0 ERROR, census 102 skills/60 mobs, new client bundle
  `main.eb1f8f84…js` served. **PO smoke check on live passed 2026-08-18.**
- **DEPLOYED + LIVE + PO-VERIFIED 2026-07-21, `a7a2267d`:** `https://aura-game.duckdns.org/`
  (Hetzner CX23 `159.69.148.73`, systemd `aurad`, LE cert, `-content ./api`).
  §A–§D complete: machine checks green incl. live Playwright join smoke, PO
  played live ("hat alles geklappt, wir können spielen").
- **Ops quick-ref:** full update `devops/deploy.sh root@159.69.148.73`;
  map/content only `devops/deploy.sh root@159.69.148.73 --content-only`;
  logs `ssh root@159.69.148.73 journalctl -u aurad -f`. ⚑ **Restarts no longer
  wipe characters** (persistence live since 8a chunk 4) — but `aurad` flushes
  live characters on shutdown, so still `ANNOUNCE` before a restart and give the
  shutdown its moment (`💾 flushed N live character(s) for shutdown`). Cheat
  token: server `/opt/aurad/tokens.list` only, never in the repo.
