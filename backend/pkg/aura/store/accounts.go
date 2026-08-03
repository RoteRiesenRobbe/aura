package store

import (
	"context"
	"errors"
	"fmt"
	"net"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// The conflicts a caller has to tell apart, because each maps to a DIFFERENT
// player-facing string (implementation.md §5b) and two of them deliberately
// disclose existence where the rest deliberately do not.
var (
	// ErrUsernameTaken is registration losing the username unique index. ⚑ It is
	// the ONE enumeration vector §5b accepts as unavoidable — a registration form
	// must say why it failed — which is why registration is throttled.
	ErrUsernameTaken = errors.New("store: that username is already taken")
	// ErrAlreadyRegistered means the account already carries credentials.
	// Registration UPDATEs an existing anonymous row exactly once; a second
	// attempt is a bug or a replay, never a normal path.
	ErrAlreadyRegistered = errors.New("store: that account already has credentials")
)

// Credentials is one account's login material, as the auth path needs it.
//
// ⚑ Username and PasswordHash are empty for an anonymous account, and that is a
// legitimate playable state — not a half-written row. The CHECK constraint keeps
// them empty or set together.
type Credentials struct {
	AccountID       int64
	Username        string
	PasswordHash    string
	TokenGeneration int
}

// Registered reports whether the account has been upgraded out of anonymity.
func (c Credentials) Registered() bool { return c.Username != "" }

// CreateAnonymousAccount mints an account and its credentials row inside tx,
// carrying only the anonymous secret's lookup key.
//
// ⚑ It takes a transaction rather than opening one, because it is never the
// whole operation: an account is minted BEHIND a character creation, and the two
// writes have to commit together or a player ends up owning an account with
// nothing in it (plan-accounts-frontend.md §5.1). That coupling is also the
// reason a separate accounts DATABASE was rejected — see §10a.
func CreateAnonymousAccount(ctx context.Context, tx pgx.Tx, secretKey string) (int64, error) {
	var accountID int64
	if err := tx.QueryRow(ctx,
		`INSERT INTO game.accounts DEFAULT VALUES RETURNING id`).Scan(&accountID); err != nil {
		return 0, fmt.Errorf("creating an account: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO game.account_credentials (account_id, anonymous_secret_sha256) VALUES ($1, $2)`,
		accountID, secretKey); err != nil {
		return 0, fmt.Errorf("creating the credentials row: %w", err)
	}
	return accountID, nil
}

// CredentialsByAnonymousSecret resolves a presented anonymous secret to its
// account.
//
// The argument is the LOOKUP KEY (auth.AnonymousSecretKey), never the raw
// secret — hashing at the boundary is what keeps the raw token out of query
// logs and out of this package entirely.
//
// ⚑ It returns the whole credentials row, not just the id, because the account
// it lands on MAY BE REGISTERED. Registration updates this same row and leaves
// the secret in place, so a browser that registered and kept its local copy
// still resolves here — and the caller needs the username to apply the harness
// prefix rule. Returning a bare id would have made "anonymous secret ⇒
// anonymous account" an assumption rather than a fact.
//
// ⚑ An anonymised account has no credentials row at all, so an erased account's
// old secret lands here as ErrNoAccount and can never resolve again. That is the
// erasure path working (plan-accounts-frontend.md §6), not a missing row.
func (s *Store) CredentialsByAnonymousSecret(ctx context.Context, secretKey string) (Credentials, error) {
	return s.scanCredentials(ctx,
		`SELECT account_id, coalesce(username, ''), coalesce(password_hash, ''), token_generation
		   FROM game.account_credentials WHERE anonymous_secret_sha256 = $1`, secretKey)
}

// CredentialsByUsername finds the row a login attempt has to verify against.
//
// ⚑ ErrNoAccount here means "no such username", and the caller must NOT
// short-circuit on it: it still has to run a full bcrypt comparison against an
// empty hash, or the equalised error messages protect nothing against a stopwatch
// (auth.Gate.Verify, implementation.md §7b).
func (s *Store) CredentialsByUsername(ctx context.Context, username string) (Credentials, error) {
	return s.scanCredentials(ctx,
		`SELECT account_id, coalesce(username, ''), coalesce(password_hash, ''), token_generation
		   FROM game.account_credentials WHERE username = $1`, username)
}

// CredentialsByAccount reads an account's own credentials.
//
// ⚑ ErrNoAccount means ERASED, not "not yet registered" — the row is inserted
// with the account and only erasure removes it. A caller reading its absence as
// "generation 0" would resurrect every token that account ever held.
func (s *Store) CredentialsByAccount(ctx context.Context, accountID int64) (Credentials, error) {
	return s.scanCredentials(ctx,
		`SELECT account_id, coalesce(username, ''), coalesce(password_hash, ''), token_generation
		   FROM game.account_credentials WHERE account_id = $1`, accountID)
}

func (s *Store) scanCredentials(ctx context.Context, sql string, arg any) (Credentials, error) {
	var c Credentials
	err := s.Pool.QueryRow(ctx, sql, arg).
		Scan(&c.AccountID, &c.Username, &c.PasswordHash, &c.TokenGeneration)
	if errors.Is(err, pgx.ErrNoRows) {
		return Credentials{}, ErrNoAccount
	}
	if err != nil {
		return Credentials{}, fmt.Errorf("reading credentials: %w", err)
	}
	return c, nil
}

// SetCredentials is registration: it adds a username and password hash to an
// account that already exists.
//
// ⚑ An UPDATE, never an INSERT. Registration is an upgrade of the row the player
// has been playing on, which is what makes signing up cost no progress — the
// whole point of anonymous-first. A second row would orphan everything they did.
//
// The WHERE clause carries the "not already registered" guard so the check and
// the write are one statement; a read-then-write would let two concurrent
// registrations both pass the check.
func (s *Store) SetCredentials(ctx context.Context, accountID int64, username, passwordHash string) error {
	tag, err := s.Pool.Exec(ctx,
		`UPDATE game.account_credentials SET username = $2, password_hash = $3
		  WHERE account_id = $1 AND username IS NULL`,
		accountID, username, passwordHash)
	if isUniqueViolation(err, "account_credentials_username_key") {
		return ErrUsernameTaken
	}
	if err != nil {
		return fmt.Errorf("setting credentials: %w", err)
	}
	if tag.RowsAffected() == 0 {
		// Either the row is gone (erased) or it already carries a username. Both
		// refuse; telling them apart would need a second query for no gain.
		return ErrAlreadyRegistered
	}
	return nil
}

// Audit event names. The set is closed here rather than at the call sites so a
// typo cannot quietly create a new event nobody queries for.
const (
	AuditLogin  = "login"
	AuditLogout = "logout"
	// AuditAnonymousSession is a stored anonymous secret exchanged for a session
	// (backlog §46).
	//
	// ⚑ ITS OWN EVENT, not AuditLogin. Nobody typed anything: this is a browser
	// spending a secret it has held since it created its first character. An
	// operator reading the trail needs to tell "someone knew the password" from
	// "a returning guest re-opened a session", and one name for both would hide
	// exactly the case worth noticing.
	AuditAnonymousSession = "anonymous_session"
	AuditRegister         = "register"
	AuditPasswordChange   = "password_change"
	AuditErasure          = "erasure"
)

// RecordAuditEvent writes one successful account event.
//
// ⚑ SUCCESSES ONLY. A failed login is the one event an attacker can generate
// without limit, so recording those would turn an operator's support tool into
// an amplification target — failures are the throttle's business
// (implementation.md §0).
//
// ⚑ Never pass token or password material, including truncated forms.
//
// sourceIP may be empty or unparseable; it is stored NULL rather than failing
// the write, because an audit row with an unknown source still answers "did this
// account log in at all".
func (s *Store) RecordAuditEvent(ctx context.Context, accountID int64, event, sourceIP string) error {
	var ip *string
	if parsed := net.ParseIP(sourceIP); parsed != nil {
		text := parsed.String()
		ip = &text
	}
	if _, err := s.Pool.Exec(ctx,
		`INSERT INTO game.audit_log (account_id, event, source_ip) VALUES ($1, $2, $3)`,
		accountID, event, ip); err != nil {
		return fmt.Errorf("recording an audit event: %w", err)
	}
	return nil
}

// isUniqueViolation reports whether err is Postgres' 23505 raised by a specific
// named constraint.
//
// ⚑ Matching on the NAME, not merely on the code, is what lets one INSERT tell
// "that name is taken" from "that slot filled up underneath me" — two conflicts
// on the same statement with completely different answers (one is a player
// error, the other is a retry). The names are auto-generated by Postgres, so
// they are pinned by a database test rather than trusted.
func isUniqueViolation(err error, constraint string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == constraint
}
