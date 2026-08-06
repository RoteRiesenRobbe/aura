package core

import (
	"testing"

	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
)

// The Welcome's gray knobs (plan-world-replacement.md C0). The client derives
// the nameplate's gray boundary from these, so "gray" and "pays nothing" are
// one rule instead of two copies of one — and that only holds if the numbers on
// the wire are the numbers the server prices kills with.
//
// ⚑ WHY THESE GO THROUGH g.welcomeMsg AND NOT codec's round-trip. A codec test
// proves the two fields survive the encoder; it passes identically whether the
// caller handed it the raw conf block or the normalized economy, which is the
// only thing that can actually go wrong here. The discriminating assert has to
// start at the same place the real Welcome does — NewGameWith.
//
// ⚑ It also pins the BOOT ORDERING. g.welcomeMsg is marshalled ONCE, during
// construction, so this wiring is only correct because mob.SetKillXP runs
// before core.NewGameWith in cmd/aurad. Nothing else would catch a reorder:
// the server would keep paying the configured economy while every client
// tinted against the built-in default.

func decodeWelcome(t *testing.T, msg []byte) *AuraApi.Welcome {
	t.Helper()
	require.NotEmpty(t, msg, "the game must marshal a Welcome at construction")
	sm := AuraApi.GetRootAsServerMessage(msg, 0)
	require.Equal(t, AuraApi.ServerMessageBodyWelcome, sm.BodyType())
	var tbl flatbuffers.Table
	require.True(t, sm.Body(&tbl))
	w := &AuraApi.Welcome{}
	w.Init(tbl.Bytes, tbl.Pos)
	return w
}

// A conf block that authors nothing — the live server's shape (§35/L5) and the
// shape a calibration pass writing only base+growth produces — must put the
// EFFECTIVE defaults on the wire, not the raw zeroes. Zeroes here would tell
// the client ZD = 0, i.e. every mob below its level is gray, while the server
// went on paying the full taper.
func TestWelcome_GrayKnobs_ShipNormalizedNotRaw(t *testing.T) {
	restore := mob.KillXPConfig()
	t.Cleanup(func() { mob.SetKillXP(restore) })

	conf := &cfg.Config{}
	conf.Game.Player.KillXP = curve.KillXP{Base: 60, Growth: 1.15} // gray fields left unauthored
	mob.SetKillXP(conf.Game.Player.KillXP)                         // exactly what cmd/aurad does at boot

	g, err := NewGameWith(1, Config(conf))
	require.NoError(t, err)

	w := decodeWelcome(t, g.(*game).welcomeMsg)
	assert.Equal(t, int32(5), w.GrayBase(),
		"an unauthored grayBase must reach the client as the effective default, not 0")
	assert.Equal(t, int32(10), w.GrayStep(),
		"an unauthored grayStep must reach the client as the effective default, not 0")
}

// The other half: an authored economy must actually reach the wire. Without
// this the test above is satisfied by hardcoding the defaults, and the conf
// knob the PO turns (plan-xp-formula.md §11: edit conf.json, restart, no
// rebuild) would move the pay without moving the plate.
func TestWelcome_GrayKnobs_TrackTheConfiguredEconomy(t *testing.T) {
	restore := mob.KillXPConfig()
	t.Cleanup(func() { mob.SetKillXP(restore) })

	conf := &cfg.Config{}
	conf.Game.Player.KillXP = curve.KillXP{Base: 40, Growth: 1.2, GrayBase: 11, GrayStep: 3}
	mob.SetKillXP(conf.Game.Player.KillXP)

	g, err := NewGameWith(1, Config(conf))
	require.NoError(t, err)

	w := decodeWelcome(t, g.(*game).welcomeMsg)
	assert.EqualValues(t, 11, w.GrayBase())
	assert.EqualValues(t, 3, w.GrayStep())
}
