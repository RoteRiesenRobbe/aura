package cfg

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func readConf(t *testing.T, body string) *Config {
	t.Helper()
	path := filepath.Join(t.TempDir(), "conf.json")
	require.NoError(t, os.WriteFile(path, []byte(body), 0o644))
	conf, err := ReadConfig(path)
	require.NoError(t, err)
	return conf
}

// An absent server.port used to reach bootServer as 0, which binds ":0" — a
// random ephemeral port, with nothing in the log calling it out (§35 C1.2).
// TLS boots are deliberately excluded: they serve on 443 regardless and warn
// about any configured port, so inventing one there would make every
// production boot cry wolf about config the operator never wrote.
func TestReadConfig_PortDefaults(t *testing.T) {
	t.Run("absent port on a plain-HTTP conf defaults to 2000", func(t *testing.T) {
		conf := readConf(t, `{"game":{}}`)
		assert.Equal(t, 2000, conf.Server.Port)
	})

	t.Run("absent port on a TLS conf stays 0", func(t *testing.T) {
		conf := readConf(t, `{"server":{"tlsHost":"example.org"},"game":{}}`)
		assert.Equal(t, 0, conf.Server.Port)
	})

	t.Run("an authored port is kept", func(t *testing.T) {
		conf := readConf(t, `{"server":{"port":80},"game":{}}`)
		assert.Equal(t, 80, conf.Server.Port)
	})
}

// D2 (§35 C2): unknown conf keys warn at boot instead of failing it. The
// regression fixture is the exact embedded conf.default.json state the
// pre-accounts hygiene session found (c183ce12^ — kept verbatim): keys that no
// longer exist on cfg.Config had accumulated silently for years because
// nothing ever looked at the raw JSON beside the struct.
func TestUnknownKeys(t *testing.T) {
	t.Run("the embedded default's historical dead keys are all reported, path-qualified", func(t *testing.T) {
		historical := `{
		  "server": {
		    "port": 2000,
		    "frontendDir": "../frontend/dist"
		  },
		  "game": {
		    "heatFractionPerSecond": 0.04,
		    "mobChaseIntoAuraMargin": 0.2,
		    "player": {
		      "healthGainTick": 0.00033,
		      "walkingSpeedPerTick": 0.05,
		      "damageAuraRadius": 1,
		      "damageAuraDamageFraction": 0.009,
		      "damageAuraLevelGainFraction": 0.002,
		      "levelGrowth": 1.12,
		      "maxLevel": 30,
		      "healAuraRadius": 1,
		      "healAuraHealTickFraction": 0.001,
		      "healAuraLevelGainFraction": 0.0005,
		      "healAuraSelfDamageTickFraction": 0.0015,
		      "levelUpXPBase": 300,
		      "levelUpXPGrowthFactor": 1.2
		    }
		  }
		}`
		unknown, err := UnknownKeys([]byte(historical))
		require.NoError(t, err)
		assert.Equal(t, []string{
			"game.heatFractionPerSecond",
			"game.player.damageAuraDamageFraction",
			"game.player.damageAuraLevelGainFraction",
			"game.player.damageAuraRadius",
			"game.player.healAuraHealTickFraction",
			"game.player.healAuraLevelGainFraction",
			"game.player.healAuraRadius",
			"game.player.healAuraSelfDamageTickFraction",
		}, unknown)
	})

	t.Run("underscore-prefixed keys are exempt at any depth", func(t *testing.T) {
		unknown, err := UnknownKeys([]byte(
			`{"_comment":"x","game":{"mob":{"_comment":"y"},"player":{"_walkingSpeedPerTick":0.2}}}`))
		require.NoError(t, err)
		assert.Empty(t, unknown, "the _comment/_stash house convention (L2) must never warn")
	})

	t.Run("a fully known conf reports nothing", func(t *testing.T) {
		unknown, err := UnknownKeys([]byte(
			`{"server":{"port":2000,"tlsHost":"","frontendDir":"x"},"game":{"zone":"world","player":{"critChance":0.05},"mob":{"healthGainTick":0.1},"combat":{"defaultCritFactor":2}}}`))
		require.NoError(t, err)
		assert.Empty(t, unknown)
	})

	t.Run("case-insensitive matches are accepted, mirroring encoding/json", func(t *testing.T) {
		// encoding/json falls back to a case-insensitive field match, so
		// "Port" WORKS — warning about it would cry wolf on a key that is
		// actually applied.
		unknown, err := UnknownKeys([]byte(`{"server":{"Port":2000}}`))
		require.NoError(t, err)
		assert.Empty(t, unknown)
	})
}
