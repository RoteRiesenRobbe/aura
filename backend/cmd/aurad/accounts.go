package main

import (
	"fmt"
	"log/slog"
	"os"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/accounts"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/origins"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

// Placeholder values for the two NOT NULL character columns that have no
// player-facing chooser yet. [PLACEHOLDER]
//
// ⚑ Both are blocked on other work, not undecided here: avatars are their own
// feature (plan-avatar-system.md, whose §8 asks whether avatar ownership is
// per-account — this schema says per-character), and player.Faction() is
// hardcoded to aligned, so there is no faction choice to record. When either
// picker lands it becomes a field on the create request, not a migration.
const (
	defaultCharacterAvatar  = "default"
	defaultCharacterFaction = "aligned"
)

// buildOriginPolicy assembles the one allowlist that guards BOTH the WebSocket
// handshake and the credentialed /api endpoints (backlog §43).
//
// Three sources, in order of how explicit they are:
//
//   - server.allowedOrigins from the conf, for anything unusual.
//   - https://<tlsHost>, derived, because a TLS deployment serves the client
//     from aurad itself and that is by construction the real origin. Deriving it
//     means the live server is protected without anyone remembering to author it.
//   - loopback on any port, but ONLY with -dev: webpack serves the client on
//     :2001 while aurad answers on :2000, so the ports genuinely differ and
//     cannot be listed up front.
func buildOriginPolicy(config *cfg.Config, dev bool) *origins.Policy {
	allowed := append([]string{}, config.Server.AllowedOrigins...)
	if config.Server.TlsHost != "" {
		allowed = append(allowed, "https://"+config.Server.TlsHost)
	}
	policy := origins.New(allowed, dev)

	// Logged because a rejected connection is otherwise a silent 403 with no way
	// to see what the server would have accepted.
	slog.Info("🚧 browser origin allowlist",
		slog.Any("origins", policy.Origins()),
		slog.Bool("loopback_allowed", policy.LoopbackAllowed()))
	if len(policy.Origins()) == 0 && !policy.LoopbackAllowed() {
		slog.Warn("no browser origin is allowed — every browser request will be refused; " +
			"set server.tlsHost or server.allowedOrigins")
	}
	return policy
}

// buildAccountsServer wires the eight endpoints.
//
// ⚑ THIS IS WHERE AURA_JWT_KEY IS FIRST READ. 1b declared the constant and
// validated a secret's length but never reached for the variable, because it had
// nothing to sign for. An absent or short key fails the boot loudly: HS512 is
// symmetric, so this one secret both signs and verifies every session, and
// anyone who can reproduce it can forge any of them.
func buildAccountsServer(db *store.Store, policy *origins.Policy, config *cfg.Config) (*accounts.Server, error) {
	secret := os.Getenv(auth.EnvJWTKey)
	if secret == "" {
		return nil, fmt.Errorf("%s is not set; it signs every session and must come from a CSPRNG "+
			"(see plan-accounts-implementation.md §0 for how to generate one)", auth.EnvJWTKey)
	}
	keys, err := auth.NewKeys([]byte(secret), auth.TokenLifetime)
	if err != nil {
		return nil, err
	}

	return accounts.New(accounts.Config{
		Store:    db,
		Keys:     keys,
		Gate:     auth.NewGate(auth.DefaultGateSlots),
		Tickets:  auth.NewTicketStore(auth.TicketTTL),
		Throttle: auth.NewThrottle(auth.ThrottleDecay),
		// ⚑ Constructed here and, for now, never populated: chunk 3 wires it into
		// ConnectionStateSystem, where Join claims the account slot atomically.
		// Until then /select's live-session check is correct and inert.
		Sessions: auth.NewSessionRegistry(),
		Origins:  policy,

		MaxAliveCharacters: config.Game.Player.MaxAliveCharacters,
		DefaultAvatar:      defaultCharacterAvatar,
		DefaultFaction:     defaultCharacterFaction,
	})
}
