# Running Aura on a VPS (friends & family playtest)

Full checklist + decisions: `docs/plan-playtest-deploy.md`. This is the terse
runbook. One process (`aurad`) serves the frontend, the WebSocket (`/game`)
and the skill catalog (`/skills`) with built-in Let's Encrypt TLS on 443.

## Prerequisites (once)

- VPS: Ubuntu 24.04, amd64, smallest tier, EU. Firewall: TCP 22/80/443 open.
- DNS: a hostname (e.g. DuckDNS subdomain) pointing at the VPS IP.
- `server.tlsHost` in `devops/conf.json` set to that hostname.
- SSH access as root (`ssh root@<host>` works from your machine).

## First-time server setup

```shell
ssh root@<host>
mkdir -p /opt/aurad
# private cheat token — keep it secret, players must not have it
echo '<private-token>' > /opt/aurad/tokens.list
exit

# from the repo root — builds backend+frontend, rsyncs the bundle
devops/deploy.sh root@<host>       # first run: the restart at the end fails
                                   # (no unit installed yet) — that's fine

scp devops/aurad.service root@<host>:/etc/systemd/system/aurad.service
ssh root@<host> 'systemctl daemon-reload && systemctl enable --now aurad'

# follow the logs — expect content source ./api, zone world, token count 1,
# "🦄 Booting TLS game-server"; the ACME cert is fetched on the first request
ssh root@<host> journalctl -f -u aurad
```

Game URL for testers: `https://<host>/`
PO with cheats: `https://<host>/?token=<private-token>`

## Updating

```shell
devops/deploy.sh root@<host>                  # full: rebuild + push + restart
devops/deploy.sh root@<host> --content-only   # map/content JSON only, no rebuild
```

Any restart wipes characters (no persistence yet) — announce in-game first
(`ANNOUNCE <text>` cheat).

## Notes

- The `-dev` flag in the unit just means "serve the frontend dir"; cheats are
  gated by `tokens.list`, not by this flag.
- Let's Encrypt cert is cached in the systemd `CacheDirectory` — don't delete
  it (rate limits).
- `tokens.list` lives outside the deploy bundle and is never overwritten by
  `deploy.sh` (rsync excludes it).
