package main

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
)

// Serving the game client must NOT depend on -dev.
//
// The regression this guards is a deployment one, not a rendering one: -dev also
// opens the reserved `hrnss_` character-name prefix and the loopback origin
// exception (buildAccountsServer / buildOriginPolicy). While serving the client
// was gated on -dev, the live systemd unit had to run with it, and the two
// security rules were off in production with nothing failing to say so.
func TestServeFrontend_DoesNotRequireDev(t *testing.T) {
	t.Run("a deployment conf serves the client without -dev", func(t *testing.T) {
		assert.True(t, serveFrontend(cfg.Server{FrontendDir: "./frontend"}, false))
	})

	t.Run("-dev still implies it, so local runs and harnesses are unchanged", func(t *testing.T) {
		assert.True(t, serveFrontend(cfg.Server{FrontendDir: ""}, true))
	})

	t.Run("no frontendDir and no -dev falls through to the 204 ping", func(t *testing.T) {
		assert.False(t, serveFrontend(cfg.Server{FrontendDir: ""}, false))
	})
}

// The live conf is what actually carries the deployment across the change above,
// so assert against the real file rather than a literal: an edit that dropped
// frontendDir from it would take the public site down with every test green.
func TestLiveConfStillServesTheFrontend(t *testing.T) {
	raw, err := os.ReadFile("../../../devops/conf.json")
	require.NoError(t, err, "devops/conf.json is the live server's conf")

	var live struct {
		Server cfg.Server `json:"server"`
	}
	require.NoError(t, json.Unmarshal(raw, &live))

	require.NotEmpty(t, live.Server.FrontendDir,
		"devops/conf.json must set server.frontendDir — it is the ONLY reason the live "+
			"server serves the client now that -dev is gone from devops/aurad.service")
	assert.True(t, serveFrontend(live.Server, false),
		"the live conf must serve the client on a non-dev boot")

	// ⚑ The other half of dropping -dev: the loopback exception is gone, so the
	// live allowlist is whatever tlsHost derives and nothing else. An empty one
	// is the nastiest possible failure — the site loads, and then every browser
	// is refused at the WebSocket handshake and every /api call.
	policy := buildOriginPolicy(&cfg.Config{Server: live.Server}, false)
	assert.NotEmpty(t, policy.Origins(),
		"the live conf must yield at least one allowed browser origin (set server.tlsHost)")
	assert.False(t, policy.LoopbackAllowed(), "loopback origins must not be allowed on live")
	assert.True(t, policy.Allows("https://"+live.Server.TlsHost),
		"the live site's own origin must be allowed")
}
