# Aura — password recovery & client-side routing

Password recovery for registered accounts, plus the client-side routing an
emailed link requires.

**Its own plan, sequenced after the three `plan-accounts-*` docs**, because it
is the only part of accounts that depends on infrastructure aura does not have —
**outbound email**. Keeping it inside 8a would have blocked login and
character-select behind a mail-provider decision. Everything here assumes
accounts, login and registration already exist.

⚑ **Until this ships, a registered player who forgets their password is locked
out permanently.** PO-accepted as an interim state, with the register form
saying so plainly (§5). The stopgap is manual SQL by an operator; there is no
self-service path.

---

## 1. Scope

| In | Out |
|---|---|
| Optional recovery email on an existing account | Email as an identity or a registration requirement |
| Forgot-password → emailed token → reset form | Account recovery for **anonymous** accounts (impossible by construction — see below) |
| Session invalidation on password change | Two-factor auth, magic-link login |
| Real client-side routing | Changing how login itself works |
| Outbound mail infrastructure | Transactional mail beyond recovery (no newsletters, no notifications) |

⚑ **Anonymous accounts remain unrecoverable, permanently.** They have no
identity to prove ownership with — that is the trade recorded in
`plan-accounts-implementation.md` §7, and this plan does not change it. The
mitigation stays the registration nag.

---

## 2. Schema additions

Three columns on `game.account_credentials` (`plan-accounts-schema.md`), added
by this plan's own migration:

```sql
ALTER TABLE game.account_credentials
    ADD COLUMN recovery_email             TEXT,
    ADD COLUMN password_reset_sha256      TEXT UNIQUE,
    ADD COLUMN password_reset_expires_at  TIMESTAMPTZ,
    -- A recovery address is only meaningful for an account that can be logged
    -- into; without this, an anonymous account could carry a recovery email
    -- that recovers nothing.
    ADD CONSTRAINT recovery_email_needs_username
        CHECK (recovery_email IS NULL OR username IS NOT NULL),
    -- Token and expiry travel together.
    ADD CONSTRAINT reset_token_has_expiry
        CHECK ((password_reset_sha256 IS NULL) = (password_reset_expires_at IS NULL));
```

⚑ **`password_reset_sha256` is SHA-256, not bcrypt, and that is deliberate** —
it is a **lookup key**, and a salted hash cannot be looked up. Full reasoning in
`plan-accounts-schema.md` §"Hashing: lookup keys vs. verifiers". Do not "fix" a
failing lookup by storing the token in plaintext.

⚑ **`recovery_email` is deliberately NOT `UNIQUE`** — uniqueness would leak
whether an address is already registered, and would stop household members
sharing one address. Recovery is initiated by *username*, never by email.

### `token_generation` belongs to 8a, not to this plan

The session-revocation column lives in `plan-accounts-schema.md` and is created
by **8a chunk 1a**. This plan is a *consumer* of it, not its owner, because 8a
has two consumers of its own:

- **Logout** — clearing a cookie logs out that browser and does nothing to a
  token copied off the machine. Without the column, logout is not revocation.
- **Silent session refresh** — `/api/session/refresh` renews a JWT indefinitely
  while the player is in the world. Without a generation check, a stolen token
  can be refreshed forever with nothing able to stop it.

⚑ **The revocation primitive must exist before the things that need revoking.**
Declaring it here would have shipped 8a with cookies, refresh and a logout
button and **no way to invalidate any token**, until a plan deliberately
sequenced last happened to land.

**This plan bumps it on reset; 8a bumps it on logout.**

---

## 3. Endpoints

| Method | Path | Auth | Does |
|---|---|---|---|
| `POST` | `/api/auth/recovery-email` | JWT | Add or change the recovery address on a registered account. Settings only. |
| `POST` | `/api/auth/forgot-password` | none (username in body) | Mint a reset token if the account exists *and* has a recovery email. **Always** returns the same generic 200. |
| `POST` | `/api/auth/reset-password` | none (token in body) | Validate the single-use, unexpired token; set the new password; invalidate live sessions. |

```
POST /api/auth/forgot-password  { username }
  → always responds 200 with the same generic body, whether or not the
    username exists or has a recovery email
  → if it exists AND has recovery_email:
      mint a 256-bit CSPRNG token, store SHA-256(token) in
        password_reset_sha256,
      set password_reset_expires_at = now() + 1 hour  [PLACEHOLDER],
      email the raw token as a link

POST /api/auth/reset-password   { token, new_password }
  → look up by SHA-256(token), check not expired
  → set password_hash, clear password_reset_sha256 + expires_at
  → increment token_generation  (invalidates every live JWT, §4)
```

---

## 4. Four properties that are easy to get wrong

1. **`forgot-password` always returns the same response.** Distinguishing "no
   such user" from "email sent" turns the endpoint into a username enumeration
   oracle. The same rule already governs login's error messages
   (`plan-accounts-implementation.md` §5b).
2. **The token is hashed at rest, with SHA-256** (§2).
3. **Single-use and expiring**, cleared on successful reset.
4. **A successful reset must invalidate existing sessions.** Otherwise
   recovering an account someone else broke into leaves the attacker's JWT valid
   for its full lifetime — which is the *main reason the feature exists*.
   Stateless JWTs cannot be revoked individually, so `token_generation` is
   compared on every verify: a mismatch means the token predates the reset and
   is rejected.

⚑ **`/api/session/refresh` must compare `token_generation` too.** 8a's silent
refresh renews a JWT transparently while the player is in the world; if refresh
skips the check, a session the attacker keeps alive by refreshing never expires,
and "a reset invalidates existing sessions" quietly becomes false for exactly
the attacker this feature exists to evict. The refresh handler applies the same
checks login does — it is not a rubber stamp.

⚑ **Rate limiting is mandatory here**, not optional: `forgot-password` is both
an enumeration surface and a way to flood someone's inbox. It joins the
requirement recorded in `plan-accounts-implementation.md` §0 and §7b.

---

## 5. Frontend

### Real client-side routing

The reset link arrives by email and must land on a specific screen. The client
today is a single page with show/hide screens and **no router** — the only
precedent is query params (`?develop`, `?token=`). **PO ruling: real routing**,
not a `?reset=<token>` query param.

That makes routing a deliverable of this plan, not a side effect:

- Routes needed at minimum: the game itself, `/reset` (token in the URL), and
  whatever the login/character-select screens become.
- ⚑ **This touches the boot path**, shared with the reconnect flow
  (`willAutoRejoin`, `plan-accounts-frontend.md` §2) and the WebGL context the
  game canvas lives in. Route changes must not remount the game canvas — a lost
  WebGL context is a known, hard-to-diagnose failure mode in this project
  (`backlog.md` §29).
- The library choice is open (§8). Whatever is picked must work with the
  existing webpack build and not require a framework migration.

### Screens

- **Forgot-password form** — one field (username), reached from the login form's
  new **"Forgot password?"** link. Always shows the same confirmation regardless
  of outcome (§4.1).
- **Reset-password form** — reached by following the emailed link; new-password
  field only. Validates against the same password rules as registration
  (`plan-accounts-implementation.md` §7 "Password rules").
- **Settings** — an add/change recovery-email control in the existing Account
  group.
- **Register form copy** — while this plan is unshipped, the register form
  states plainly that password recovery is not yet available. **Remove that line
  as part of this plan.**

---

## 6. Mail infrastructure

Net-new; aura sends no email of any kind today. Needed before any of the above
works end to end:

- A provider or relay, and a decision about running one at all (a transactional
  service vs. SMTP on the existing VPS — the latter is cheaper and much more
  likely to land in spam folders).
- A sender domain with SPF and DKIM. ⚑ The eventual domain is **parked until
  v1**, so this either uses `aura-game.duckdns.org` or waits.
- Bounce handling, even if the handling is "log it".
- **A dev mail catcher** (Mailpit/MailHog) so the flow is testable locally
  without sending real mail.

---

## 7. Test strategy

- **Go**: token mint → hash → lookup round-trip; expiry; single-use (a second
  use of the same token fails); `token_generation` bump rejecting a pre-reset
  JWT **and a pre-reset refresh attempt**; `forgot-password` returning an
  identical response for existing, non-existent, and email-less accounts.
- **Frontend**: routing (a `/reset` URL with a token lands on the right screen,
  a bad token shows the right error), and the password-rule validator shared
  with registration.
- **Manual/dev**: the full loop against a local mail catcher.

---

## 8. Open questions

All five belong to this plan's own session; three hinge on the mail-provider
decision.

1. Router library, and whether the login/character-select screens migrate onto
   it or stay show/hide.
2. Token lifetime — 1 hour is [PLACEHOLDER].
3. Should changing a password while *logged in* (not via reset) also bump
   `token_generation`? (Argument for: a password change is usually a response to
   suspected compromise.)
4. Mail provider, and whether it waits on the v1 domain decision.
5. Does an account with a recovery email get any notification when its password
   is reset, or when the address is changed? (Standard practice; needs the mail
   infrastructure either way.)
