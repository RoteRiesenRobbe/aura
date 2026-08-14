package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestRefuseRemoteDatabase is the package's first test file, and it pins the
// one security guard in the tree (plan-accounts-frontend.md §10b ruling 10):
// the cleanup is a bulk DELETE by name pattern, and this function is the only
// thing standing between it and whatever AURA_DB_URL names.
//
// ⚑ THE KEYWORD/VALUE ROWS ARE THE DEFECT THIS FILE WAS WRITTEN FOR
// (research-code-quality.md §11.5 B4, fixed in plan-code-health.md C7): pgx
// accepts both DSN forms, and url.Parse("host=prod-db user=x") returns err ==
// nil with an empty Hostname() — which the guard used to read as "loopback",
// passing the exact shape it exists to refuse.
func TestRefuseRemoteDatabase(t *testing.T) {
	cases := []struct {
		name    string
		url     string
		allowed bool
	}{
		{"localhost", "postgres://aura:pw@localhost:5432/aura", true},
		{"loopback IPv4", "postgres://aura:pw@127.0.0.1:5432/aura", true},
		{"loopback IPv6", "postgres://aura:pw@[::1]:5432/aura", true},
		{"unix socket (scheme, empty host)", "postgres:///aura", true},
		{"postgresql scheme spelling", "postgresql://aura:pw@localhost/aura", true},

		{"a remote hostname", "postgres://aura:pw@prod-db.example.com/aura", false},
		{"a remote IP", "postgres://aura:pw@10.0.0.5/aura", false},
		// The B4 repro: keyword/value DSNs parse "successfully" into an empty
		// host. Refused by scheme now, remote or not.
		{"keyword/value naming a remote host", "host=prod-db user=aura dbname=aura", false},
		// ⚑ Deliberate: keyword/value form is refused EVEN FOR localhost. The
		// guard cannot see the host in that form, and the error tells the
		// operator to use the URL form instead of guessing.
		{"keyword/value naming localhost", "host=localhost user=aura dbname=aura", false},
		{"empty string", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := refuseRemoteDatabase(tc.url)
			if tc.allowed {
				assert.NoError(t, err)
			} else {
				assert.Error(t, err)
			}
		})
	}
}

// TestRefuseRemoteDatabase_NeverEchoesTheDSN pins the store.parseURL property
// the guard inherits: a connection string carries a password, and a refusal is
// exactly the output someone pastes into a chat window.
func TestRefuseRemoteDatabase_NeverEchoesTheDSN(t *testing.T) {
	for _, url := range []string{
		"postgres://aura:s3cretpw@prod-db.example.com/aura",
		"host=prod-db user=aura password=s3cretpw dbname=aura",
	} {
		err := refuseRemoteDatabase(url)
		require.Error(t, err)
		assert.NotContains(t, err.Error(), "s3cretpw",
			"a refusal must never carry the credentials it refused")
	}
}
