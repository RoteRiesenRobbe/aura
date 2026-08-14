// Command harnessdb prepares and tidies the database the browser harness and
// the load bot run against (plan-accounts-frontend.md §10b ruling 2 and 10).
//
// Two jobs, deliberately separate:
//
//	-cleanup  remove the throwaway ANONYMOUS accounts that harness clients and
//	          load bots mint for themselves. They are the accumulating ones:
//	          one account + credentials + character per client per run.
//	-seed     ensure the two credentialed hrnss_ accounts exist. Only the script
//	          that tests login / register / logout needs them, because those
//	          cannot use the anonymous path — they are testing credentials.
//
// ⚑ IT REFUSES ANY NON-LOOPBACK DATABASE. The cleanup is a bulk DELETE driven
// by a name pattern, and "the harness must never point at production" is a rule
// that survives exactly as long as the person remembering it. Ruling 10 makes
// it a guard instead.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net"
	nurl "net/url"
	"os"
	"strings"
	"time"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

// harnessAccounts are the credentialed accounts. Two, because "a second login
// is rejected" needs two browsers and therefore two identities (§11).
var harnessAccounts = []string{"hrnss_01", "hrnss_02"}

// envHarnessPassword holds the shared password for the seeded accounts.
//
// ⚑ From the environment, never the repo — the same rule as AURA_DB_URL. One
// password for both is fine: they exist only in a disposable dev database and
// are refused registration by name, so they can never be a production account.
const envHarnessPassword = "AURA_HARNESS_PW"

func main() {
	cleanup := flag.Bool("cleanup", false, "delete anonymous accounts owning hrnss_ characters")
	seed := flag.Bool("seed", false, "ensure the credentialed hrnss_ accounts exist")
	flag.Parse()

	if !*cleanup && !*seed {
		fmt.Fprintln(os.Stderr, "nothing to do: pass -cleanup, -seed, or both")
		os.Exit(2)
	}

	url := os.Getenv(store.EnvURL)
	if url == "" {
		fmt.Fprintf(os.Stderr, "%s is not set\n", store.EnvURL)
		os.Exit(1)
	}
	if err := refuseRemoteDatabase(url); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	db, err := store.Open(ctx, url)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer db.Close()

	if *cleanup {
		if err := runCleanup(ctx, db); err != nil {
			fmt.Fprintln(os.Stderr, "cleanup:", err)
			os.Exit(1)
		}
	}
	if *seed {
		if err := runSeed(ctx, db); err != nil {
			fmt.Fprintln(os.Stderr, "seed:", err)
			os.Exit(1)
		}
	}
}

// refuseRemoteDatabase is the guard ruling 10 asks for.
//
// ⚑ It reports the HOST and never the connection string — store.parseURL exists
// because pgx wraps a net/url error carrying the password verbatim, and a tool
// that prints the URL on refusal would reintroduce that leak at the one moment
// someone is most likely to paste the output into a chat window.
func refuseRemoteDatabase(raw string) error {
	u, err := nurl.Parse(raw)
	if err != nil {
		return fmt.Errorf("%s is not a parseable connection string", store.EnvURL)
	}
	// ⚑ NO SCHEME MEANS THE HOST WAS NEVER PARSED, not "no host". pgx also
	// accepts the keyword/value DSN form ("host=prod-db user=…"), which
	// url.Parse "succeeds" on with an empty Hostname() — exactly the answer the
	// loopback branch below reads as safe. Refusing the form outright is the
	// only honest option: this guard cannot see where such a string points
	// (research-code-quality.md §11.5 B4). Localhost in URL form still passes.
	if u.Scheme == "" {
		return fmt.Errorf(
			"%s has no URL scheme, so its host cannot be verified as loopback.\n"+
				"Use the URL form (postgres://…@localhost/…) — this tool bulk-deletes "+
				"accounts by name pattern and refuses any connection string it cannot "+
				"prove local (plan-accounts-frontend.md §10b ruling 10)", store.EnvURL)
	}
	host := u.Hostname()
	if host == "" || host == "localhost" {
		return nil
	}
	ip := net.ParseIP(host)
	if ip != nil && ip.IsLoopback() {
		return nil
	}
	return fmt.Errorf(
		"refusing to touch a non-loopback database (host %q).\n"+
			"This tool bulk-deletes accounts by name pattern and the harness must never "+
			"point at a live environment (plan-accounts-frontend.md §10b ruling 10)", host)
}

// runCleanup removes the accounts a harness run leaves behind.
//
// The child rows go with them: characters, credentials and bloodline unlocks
// all carry account_id foreign keys, so they are deleted first rather than
// relying on a cascade the schema deliberately does not declare.
func runCleanup(ctx context.Context, db *store.Store) error {
	// Two kinds of residue, both identifiable only because of the hrnss_ prefix:
	//
	//   1. anonymous accounts that own an hrnss_ character — every harness
	//      client and every load bot, one per run;
	//   2. accounts REGISTERED under an hrnss_ username by the login/register
	//      script, minus the two long-lived seeded ones.
	//
	// ⚑ The seeded pair is excluded by name rather than by a flag column.
	// Deleting them would make the next login test fail with "incorrect username
	// or password" — which reads as a broken login, not as a wiped fixture.
	const selectVictims = `
		SELECT DISTINCT a.id
		  FROM game.accounts a
		  JOIN game.account_credentials ac ON ac.account_id = a.id
		  LEFT JOIN game.characters c ON c.account_id = a.id
		 WHERE (
		         (ac.username IS NULL AND c.name LIKE 'hrnss\_%')
		         OR (ac.username IS NOT NULL AND ac.username LIKE 'hrnss\_%')
		       )
		   AND (ac.username IS NULL OR ac.username <> ALL($1))`

	rows, err := db.Pool.Query(ctx, selectVictims, harnessAccounts)
	if err != nil {
		return err
	}
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if len(ids) == 0 {
		fmt.Println("cleanup: nothing to remove")
		return nil
	}

	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// The character-scoped tables go first, and they are keyed by character_id
	// rather than account_id — which is why they need their own loop.
	//
	// ⚑ THE ORDER INSIDE THIS LIST IS THE FK ORDER: character_loadout_slots has
	// a composite foreign key into character_spellbook, so slots leave first.
	// The schema carries no ON DELETE CASCADE anywhere, deliberately (a
	// graveyard that a stray delete can silently break is worse than one that
	// refuses to be broken) — so every child table is this tool's problem.
	//
	// ⚑ Step 8a chunk 4 is what made these rows exist. Before it, a harness
	// character had none and the cleanup ran green against exactly the same
	// list; the day saving shipped it started failing on a foreign key, which is
	// a good enough reason to state the rule here rather than rediscover it.
	const ofTheseAccounts = ` WHERE character_id IN
		(SELECT id FROM game.characters WHERE account_id = ANY($1))`
	for _, table := range []string{
		"game.character_loadout_slots",
		"game.character_spellbook",
		"game.character_flags",
		// Migration 000002 (plan-world-map.md C2): the discovered-campfire set.
		// ⚑ It landed here the way the comment above predicts — the first
		// cleanup after the migration failed on this exact foreign key. Any new
		// character-scoped table is this tool's problem on the day it ships.
		"game.character_campfires",
	} {
		if _, err := tx.Exec(ctx, "DELETE FROM "+table+ofTheseAccounts, ids); err != nil {
			return fmt.Errorf("%s: %w", table, err)
		}
	}

	// ⚑ audit_log is in this list and is easy to forget: it records SUCCESSES
	// only, so an account that merely created a character has no rows and the
	// missing FK never bites. It only fails once a harness account has actually
	// registered or logged in — i.e. exactly the login/register script, and long
	// after the cleanup looked like it worked.
	for _, table := range []string{
		"game.audit_log",
		"game.bloodline_unlocks",
		"game.characters",
		"game.account_credentials",
	} {
		if _, err := tx.Exec(ctx, "DELETE FROM "+table+" WHERE account_id = ANY($1)", ids); err != nil {
			return fmt.Errorf("%s: %w", table, err)
		}
	}
	if _, err := tx.Exec(ctx, "DELETE FROM game.accounts WHERE id = ANY($1)", ids); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}

	fmt.Printf("cleanup: removed %d anonymous harness account(s)\n", len(ids))
	return nil
}

// runSeed creates the credentialed harness accounts if they are missing.
//
// ⚑ Idempotent: running it twice is a no-op, so it can sit at the top of a
// harness run without a "have I seeded yet" flag anywhere.
//
// ⚑ Seeded DIRECTLY, because POST /api/auth/register refuses the hrnss_ prefix
// by design and must keep refusing it — that refusal is what reserves the
// namespace from real players.
func runSeed(ctx context.Context, db *store.Store) error {
	password := os.Getenv(envHarnessPassword)
	if password == "" {
		return fmt.Errorf("%s is not set; harness credentials come from the environment, never the repo",
			envHarnessPassword)
	}
	if err := auth.ValidatePassword(password, "hrnss"); err != nil {
		var rule *auth.RuleError
		if errors.As(err, &rule) {
			return fmt.Errorf("%s is not a usable password: %s", envHarnessPassword, rule.Message)
		}
		return err
	}

	gate := auth.NewGate(auth.DefaultGateSlots)
	created := 0
	for _, username := range harnessAccounts {
		var exists bool
		err := db.Pool.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM game.account_credentials WHERE username = $1)`,
			username).Scan(&exists)
		if err != nil {
			return err
		}
		if exists {
			continue
		}

		hash, err := gate.Hash(ctx, password)
		if err != nil {
			return err
		}

		tx, err := db.Pool.Begin(ctx)
		if err != nil {
			return err
		}
		var accountID int64
		if err := tx.QueryRow(ctx,
			`INSERT INTO game.accounts DEFAULT VALUES RETURNING id`).Scan(&accountID); err != nil {
			_ = tx.Rollback(ctx)
			return err
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO game.account_credentials (account_id, username, password_hash)
			 VALUES ($1, $2, $3)`, accountID, username, hash); err != nil {
			_ = tx.Rollback(ctx)
			return err
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
		created++
	}

	if created == 0 {
		fmt.Printf("seed: %s already present\n", strings.Join(harnessAccounts, ", "))
		return nil
	}
	fmt.Printf("seed: created %d account(s)\n", created)
	return nil
}
