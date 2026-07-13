# Research: Hosting & Deployment — Prototype to 1k DAU

*Written 2026-07-13. Companion to `research-v1-readiness.md` (ops gaps) and
roadmap execution-order step 9 (Ops & closed-alpha readiness). This doc records
the hosting inventory, the load math, and the phased deployment shape so they
don't get relitigated at step 9. It is not an execution plan — Phase 0 becomes
a small chunk when the first internet playtest is wanted; Phases 1–2 fold into
their owning roadmap items.*

> **All numbers in this doc are estimates/placeholders** per project rule —
> DAU→CCU ratios, instance sizes, and prices are for thinking, not decisions.

## 1. Decision record

- **Persistent servers** (decided 2026-07-13, user) — no seasonal-wipe model.
  Closes the tdd.md §7 open question "Seasonal vs. permanent servers".
  Consequences: the persistence/backup/migration burden in Phase 2 is real and
  permanent — "what survives a crash/deploy" (v1-readiness hurt-list #2) must
  be designed *with* the accounts step (roadmap item 3), and zero-data-loss
  deploys become a hard requirement for public release, not a nice-to-have.
  There is no periodic wipe to amnesty schema mistakes: DB migrations
  discipline (tdd.md §7) matters from the first persisted byte.

## 2. What the repo already has (inherited from Berryhunter, working)

- **`devops/`** — the real production setup berryhunter.io ran on:
  - `berryhunterd.service` — systemd unit: `DynamicUser`, auto-restart
    (3 s, unlimited), `AmbientCapabilities=CAP_NET_BIND_SERVICE` so the
    binary binds 80/443 directly, State/CacheDirectory for the autocert cache.
  - `README.md` — step-by-step box bring-up (copy binary + frontend `dist/` +
    conf to `/opt/berryhunterd`, `touch tokens.list`, enable unit).
  - `cloud-ops-agent.yaml` — GCP Cloud Logging shipper config (optional).
  - `conf.json` — **stale**: pre-skill-system tuning values (`healthGainTick`,
    `damageAuraRadius`, …). A Phase-0 deploy must start from the current
    `conf.default.json`, not this file.
- **Built-in TLS.** With `server.tlsHost` set, the backend runs Let's Encrypt
  via `autocert` and terminates `wss://` itself on 443 (HTTP on 80 for the
  ACME challenge). No reverse proxy needed.
- **`-dev` flag ≠ debug mode.** It only means "also serve the frontend
  statically" (`flag.BoolVar(&dev, "dev", false, "Serve frontend directly")`);
  the old prod unit deliberately ran with it. One binary serves game socket +
  static client. Cheats are gated by `tokens.list`, not by `-dev`.
- **Docker scripts + `.goreleaser.yaml`** — alternative packaging paths,
  currently unmaintained. Not needed for the phased plan below; the
  systemd-on-a-VM path is simpler and proven. Revisit only if a reason appears
  (KISS).

## 3. Load math: why 1k DAU is not a scaling problem

Rule-of-thumb DAU→CCU conversion for session games: peak concurrency ≈ 5–15 %
of DAU → **1k DAU ≈ 50–150 peak CCU** *(estimate)*.

Against the architecture (per `architecture.md`'s own scaling analysis):

- Single-threaded 30 Hz loop comfortably handles **tens of players per zone**;
  AOI-filtered snapshots already avoid the O(players × world) trap.
- The designed scale-out seam is **per-zone Spaces/processes** — which is also
  a planned gameplay feature (zones), not speculative infrastructure.
- With 2–3 zones at v1, 150 CCU spreads to ~50–75 per zone: within budget on
  one vertically-scaled VM, with the per-zone split as headroom if a single
  zone runs hot.

**Conclusion: one VM carries the game through 1k DAU.** No load balancers, no
orchestration, no sharding. What 1k DAU actually demands is the
`research-v1-readiness.md` §3 hurt list — persistence, panic isolation,
observability, graceful deploys, rate limiting — i.e. **ops and persistence
work, not infrastructure architecture**. True horizontal concerns (cross-VM
zone routing, border ghosting) sit far beyond this horizon and are already
sketched in `plan-world-zones.md`.

## 4. Phased deployment shape

### Phase 0 — first internet playtest (~20 friends)

*Planned in detail → `plan-phase0-deploy.md` (2026-07-14; join stays open =
Option A decided there).*

Goal: a URL friends can open. Session-based world; a crash restarts the
session — acceptable, even desirable (loud failures).

- One cheap VPS *(Hetzner CX-class or similar, ~€5–10/mo; EU region fine for a
  friends playtest)* + a domain.
- Reuse the `devops/` path as-is: release frontend build + `berryhunterd`
  binary + systemd unit + `tlsHost` autocert.
- Work items (~a day): fresh prod `conf.json` from `conf.default.json`;
  `tokens.list` with a non-guessable token (it gates cheats); a copy-files
  deploy script; smoke the autocert/systemd path for bit-rot.
- Deliberately **not** in scope: metrics, persistence, rate limiting, CI
  deploys.
- Timing: worth doing **during the content pass** (roadmap item 12), not after
  — real playtests feed content/balance. Becomes its own small chunk when
  wanted.

### Phase 1 — closed alpha (~50–100 invited players)

Same box, plus the minimal ops kit (all items already identified in
`research-v1-readiness.md`; step 9 owns them):

- Panic recovery per tick + error telemetry (hurt-list #1).
- Tick-duration histogram + player-count + error-counter metrics; a health
  endpoint (hurt-list #3).
- CI actually running `go test ./...` + frontend `tsc --noEmit`/lint.
- Planned-restart deploy tooling (announce → drain → restart) — still
  session-based, so "drain" is just a warning broadcast.
- Join throttling / per-connection input sanity (hurt-list #5; lands naturally
  with accounts, item 3).
- Optional: static frontend behind Cloudflare free tier — doubles as the DDoS
  story; the VM then only serves the WebSocket.

### Phase 2 — public release (1k DAU)

Still one (vertically scaled) VM, or one process per zone on the same box once
that seam exists. New work, all persistence-driven (see §1):

- **Database** for accounts/progression (tdd.md §7 open decision). At this
  scale *SQLite + Litestream* or a single Postgres both suffice
  *(placeholder)*; choose with the accounts design, item 3.
- Snapshot cadence + graceful-shutdown drain to DB (designed with item 3, per
  v1-readiness).
- Zero-data-loss deploys: shutdown hook persists, systemd restarts, clients
  reconnect. (Seamless no-disconnect deploys are **not** required at this
  scale — a 30-second announced restart is fine; what must never be lost is
  state.)
- Automated off-box backups + restore drill; migrations framework.
- Real alerting on the Phase-1 metrics (tick overruns, error spikes, restarts).
- Region: single region only; pick where the audience is *(placeholder: EU)*.

## 5. Open questions (deliberately not decided here)

- **Provider** — Hetzner-class VPS vs. GCP (the inherited logging config
  points at GCP; no lock-in either way). Decide at Phase 0; trivially
  reversible while stateless.
- **Database choice + migrations framework** — owned by the accounts design
  (item 3), constrained only by §1 (persistent, so migrations matter).
- **Domain/branding** — coupled to the rebrand (step 7); Phase 0 can run on a
  throwaway domain.
- **Cloudflare-in-front vs. binary-terminates-TLS** — revisit at Phase 1; the
  autocert path wins on simplicity until DDoS/CDN needs say otherwise.
