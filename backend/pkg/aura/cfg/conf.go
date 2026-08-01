package cfg

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
)

type Server struct {
	Port        int    `json:"port"`
	TlsHost     string `json:"tlsHost"`
	FrontendDir string `json:"frontendDir"`

	// AllowedOrigins is the browser-origin allowlist guarding both the WebSocket
	// handshake and the credentialed /api endpoints (backlog §43).
	//
	// ⚑ Usually EMPTY, and that is correct: a TLS deployment derives
	// https://<tlsHost> automatically and -dev allows loopback on any port, so
	// this exists for the case neither covers — a second front-end host, or a
	// staging origin. Origins are not secrets, so conf.json is the right home
	// (unlike AURA_DB_URL and AURA_JWT_KEY, which are not).
	AllowedOrigins []string `json:"allowedOrigins"`
}

type Config struct {
	Server Server `json:"server"`
	Game   struct {
		// Zone selects which zone file (by file stem, e.g. "scaffold" for
		// scaffold.json) to load. Empty loads the sole zone when only one
		// exists; the -zone flag overrides this.
		Zone                   string  `json:"zone"`
		TotalDayCycleSeconds   uint64  `json:"totalDayCycleSeconds"`
		DayTimeSeconds         uint64  `json:"dayTimeSeconds"`
		MobChaseIntoAuraMargin float32 `json:"mobChaseIntoAuraMargin"`
		Player                 struct {
			// constant for out-of-combat health regen
			HealthGainTick float32 `json:"healthGainTick"`

			//
			WalkingSpeedPerTick float32 `json:"walkingSpeedPerTick"`
			BaseHealth          int     `json:"baseHealth"`
			// LevelGrowth + MaxLevel define f(character level) =
			// levelGrowth^(L-1) — the number-inflation curve (GDD §5,
			// [WORKING LOCK 2026-07-16]: 1.12 × 30). Replaced the linear
			// maxHealthLevelGainFraction in C0.
			LevelGrowth           float64 `json:"levelGrowth"`
			MaxLevel              int     `json:"maxLevel"`
			LevelUpXPBase         uint32  `json:"levelUpXPBase"`
			LevelUpXPGrowthFactor float32 `json:"levelUpXPGrowthFactor"`
			SkillPointsPerLevel   int     `json:"skillPointsPerLevel"`
			// CritChance is the flat base crit chance every player character
			// has (§4.3 v2, PO 2026-07-20) [PLACEHOLDER 0.05]; skill-authored
			// chance and the critChance passive stat add on top.
			CritChance float32 `json:"critChance"`

			// MaxAliveCharacters is how many characters an account may have
			// alive at once — the character-select slot count (8a chunk 1c).
			// [PLACEHOLDER 3]
			//
			// ⚑ An APPLICATION concern by design: nothing in the schema bounds
			// slot_index, because the cap is a config knob while the database
			// invariant is only "at most one alive character per slot".
			// ⚑ RAISING it is safe; LOWERING it strands anyone sitting in a slot
			// the UI no longer renders (plan-accounts-frontend.md §9 item 2).
			MaxAliveCharacters int `json:"maxAliveCharacters"`
		} `json:"player"`

		// Mob mirrors the player block's vocabulary for stats both entity kinds
		// have (backlog §27.2.3). Same names, same units, different block — so
		// unifying them later is a rename, not a redesign (§31).
		Mob struct {
			// HealthGainTick is out-of-combat regen as a fraction of the mob's
			// max pool per tick — the SAME unit as player.healthGainTick.
			// Absent → the built-in default (full pool in 5 s). [PLACEHOLDER]
			HealthGainTick float32 `json:"healthGainTick"`
			// WalkingSpeedPerTick is the base movement step in world units per
			// tick, multiplied by each mob's factors.speed — the SAME unit as
			// player.walkingSpeedPerTick, deliberately NOT the same value
			// (0.055 vs 0.05; every authored factors.speed is tuned against
			// it). Absent → the built-in default. [PLACEHOLDER]
			WalkingSpeedPerTick float32 `json:"walkingSpeedPerTick"`
		} `json:"mob"`

		// Combat holds factors that apply to every acting entity (player, mob,
		// summon) rather than to one kind — see cfg.CombatConfig.
		Combat struct {
			DefaultCritFactor  float32 `json:"defaultCritFactor"`
			HealerThreatFactor float32 `json:"healerThreatFactor"`
			PresenceRadius     float32 `json:"presenceRadius"`
		} `json:"combat"`
	} `json:"game"`
}

// LevelCurve builds f(character level) from the conf pair. THE single
// construction point: the player stat scale, the mob registry's tier+baseline
// derivation and the /skills catalog all read the same curve, and three
// hand-written `curve.Curve{Growth: …, MaxLevel: …}` literals are exactly how
// one of them quietly keeps an old growth after a retune (GDD §5 one-knob
// rule). ReadConfig has already defaulted both fields, so this needs none.
func (c *Config) LevelCurve() curve.Curve {
	return curve.Curve{Growth: c.Game.Player.LevelGrowth, MaxLevel: c.Game.Player.MaxLevel}
}

// reads the config from file
func ReadConfig(filename string) (*Config, error) {
	var err error
	// read file
	dat, err := os.ReadFile(filename)
	if err != nil {
		return nil, err
	}

	// parse config
	config := &Config{}
	if err := json.Unmarshal(dat, config); err != nil {
		return nil, err
	}

	// Unknown keys WARN, they never fail the boot (§35 D2): a hard fail on a
	// deployed or local conf would block the next boot for zero gain, while
	// the warning gives the same drift signal. The struct parse above
	// succeeded, so the map parse inside UnknownKeys cannot fail.
	unknown, _ := UnknownKeys(dat)
	for _, key := range unknown {
		slog.Warn("unknown config key — not a config key; delete it, or prefix it with _ to keep it as a comment",
			slog.String("key", key), slog.String("file", filename))
	}

	// Default if values are missing
	if config.Game.TotalDayCycleSeconds <= 0 {
		config.Game.TotalDayCycleSeconds = 600
	}
	if config.Game.DayTimeSeconds <= 0 {
		config.Game.DayTimeSeconds = 400
	}
	// f(L) curve defaults [WORKING LOCK 2026-07-16]. Defaulted HERE — the
	// single point both consumers read through — because the curve feeds two
	// places that must never diverge: the player-side PlayerConfig.LevelCurve
	// and the mob registry's tier+baseline derivation (C0, GDD §5 one-knob
	// rule).
	if config.Game.Player.LevelGrowth <= 0 {
		config.Game.Player.LevelGrowth = curve.Default().Growth
	}
	if config.Game.Player.MaxLevel <= 0 {
		config.Game.Player.MaxLevel = curve.Default().MaxLevel
	}
	if config.Game.Player.CritChance <= 0 {
		config.Game.Player.CritChance = 0.05
	}
	// Defaulted here, like every other player knob, so an absent key and a key
	// restating the default resolve identically (§35 D1) — the property the
	// shrink-to-deltas confs depend on.
	if config.Game.Player.MaxAliveCharacters <= 0 {
		config.Game.Player.MaxAliveCharacters = 3
	}
	// An absent port on a plain-HTTP boot would otherwise bind ":0" — a random
	// ephemeral port. TLS boots serve on 443 and warn about any configured
	// port, so they keep the honest zero.
	if config.Server.Port == 0 && config.Server.TlsHost == "" {
		config.Server.Port = 2000
	}
	// Validate
	if config.Game.DayTimeSeconds > config.Game.TotalDayCycleSeconds {
		return config, fmt.Errorf("invalid configuration: DayTimeSeconds (%d) must not be larger than TotalDayCycleSeconds (%d)",
			config.Game.DayTimeSeconds, config.Game.TotalDayCycleSeconds)
	}
	return config, err
}
