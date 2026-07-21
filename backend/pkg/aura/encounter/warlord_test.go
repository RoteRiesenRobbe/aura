package encounter

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// fakeAnnouncer captures Announce broadcasts.
type fakeAnnouncer struct {
	messages []string
}

func (f *fakeAnnouncer) Broadcast(text string) { f.messages = append(f.messages, text) }

// warlordArena drives the Orc Warlord encounter like the smoke arena does.
type warlordArena struct {
	t         *testing.T
	s         *System
	g         *fakeGame
	enc       *OrcWarlordEncounter
	announcer *fakeAnnouncer
}

var (
	testHome      = phy.Vec2f{X: 28, Y: -10}
	testBanner1   = phy.Vec2f{X: 26, Y: -12}
	testBanner2   = phy.Vec2f{X: 26, Y: -8}
	testWaveMouth = phy.Vec2f{X: 33, Y: -10}
)

func newWarlordArena(t *testing.T) *warlordArena {
	g := newFakeGame()
	g.mobReg = &fakeRegistry{defs: map[string]*mobs.MobDefinition{
		warlordMobName:   smokeDef(35, warlordMobName, "AngryMammoth", 900, 0.6),
		warbannerMobName: smokeDef(36, warbannerMobName, "SaberToothCat", 160, 0.4),
		gruntMobName:     smokeDef(37, gruntMobName, "Rabbit", 75, 0.35),
	}}
	s := NewSystem(g, nil)
	g.es = s
	announcer := &fakeAnnouncer{}
	s.SetAnnouncer(announcer)
	enc := NewOrcWarlordEncounter(testHome, testBanner1, testBanner2, testWaveMouth)
	s.Register(enc)
	return &warlordArena{t: t, s: s, g: g, enc: enc, announcer: announcer}
}

func (a *warlordArena) step(n int) {
	for i := 0; i < n; i++ {
		removed := map[uint64]bool{}
		for _, id := range a.g.removed {
			removed[id] = true
		}
		for _, m := range a.g.added {
			if !removed[m.Basic().ID()] {
				if !m.Update(0) {
					a.g.RemoveEntity(m.Basic())
				}
			}
		}
		a.s.Update(0)
		a.g.tick++
	}
}

func (a *warlordArena) killBanners() {
	for _, b := range a.enc.banners {
		if b != nil {
			killMob(b)
		}
	}
	a.step(1)
}

// damageBossTo takes the boss to the given health ratio via one player hit
// and steps once so threshold latches fire.
func (a *warlordArena) damageBossTo(p *fakePlayer, ratio float32) {
	boss := a.enc.boss
	target := float32(boss.MaxHealth()) * ratio
	delta := float32(boss.Health()) - target
	require.Greater(a.t, delta, float32(0), "boss must be above the target ratio")
	boss.PlayerTouches(p, model.Damage{HP: delta})
	a.step(1)
}

func TestWarlord_BootSpawnAtAnchorsAndGate(t *testing.T) {
	a := newWarlordArena(t)

	a.step(1)

	require.NotNil(t, a.enc.boss, "the warlord spawns on the first tick")
	require.Len(t, a.g.added, 3, "boss + 2 warbanners")
	assert.Equal(t, testHome, a.enc.boss.Position())
	assert.Equal(t, testBanner1, a.enc.banners[0].Position())
	assert.Equal(t, testBanner2, a.enc.banners[1].Position())
	assert.Empty(t, a.announcer.messages, "the boot spawn is silent")

	a.enc.boss.PlayerTouches(newFakePlayer(testHome), model.Damage{HP: 10})
	assert.Equal(t, a.enc.boss.MaxHealth(), a.enc.boss.Health(),
		"the warlord is immune while a warbanner stands")
}

func TestWarlord_GateLiftsWithOneBannerDownStaysUp(t *testing.T) {
	a := newWarlordArena(t)
	a.step(1)

	killMob(a.enc.banners[0])
	a.step(1)
	a.enc.boss.PlayerTouches(newFakePlayer(testHome), model.Damage{HP: 10})
	assert.Equal(t, a.enc.boss.MaxHealth(), a.enc.boss.Health(),
		"one standing warbanner keeps the gate up")

	a.killBanners()
	a.enc.boss.PlayerTouches(newFakePlayer(testHome), model.Damage{HP: 10})
	assert.Equal(t, a.enc.boss.MaxHealth()-10, a.enc.boss.Health(),
		"both warbanners down → the gate lifts")
}

func TestWarlord_WavesAtThresholds(t *testing.T) {
	a := newWarlordArena(t)
	a.step(1)
	a.killBanners()
	base := len(a.g.added)

	p := newFakePlayer(testHome)
	a.damageBossTo(p, 0.6)
	assert.Equal(t, base+waveSize, len(a.g.added), "one grunt wave at 66%")

	a.damageBossTo(p, 0.5)
	assert.Equal(t, base+waveSize, len(a.g.added), "no second wave between thresholds")

	a.damageBossTo(p, 0.3)
	// 33%: the second wave spawns AND the re-gate replants both banners.
	assert.Equal(t, base+2*waveSize+2, len(a.g.added), "second wave + 2 replanted banners")
	require.NotNil(t, a.enc.banners[0], "banner 0 replanted")
	require.NotNil(t, a.enc.banners[1], "banner 1 replanted")

	a.enc.boss.PlayerTouches(p, model.Damage{HP: 10})
	assert.Equal(t, float32(0.3)*float32(a.enc.boss.MaxHealth()), float32(a.enc.boss.Health()),
		"the re-gate makes the warlord immune again")
}

func TestWarlord_RegateOnlyOncePerCycle(t *testing.T) {
	a := newWarlordArena(t)
	a.step(1)
	a.killBanners()

	p := newFakePlayer(testHome)
	a.damageBossTo(p, 0.3)
	a.killBanners() // fell the replanted banners
	count := len(a.g.added)

	a.damageBossTo(p, 0.2)
	assert.Equal(t, count, len(a.g.added), "no second re-gate, no third wave")
	a.enc.boss.PlayerTouches(p, model.Damage{HP: 10})
	assert.Less(t, a.enc.boss.Health(), a.enc.boss.MaxHealth(),
		"the warlord stays vulnerable for the burn")
}

func TestWarlord_WipeReArmsViaFullRegen(t *testing.T) {
	a := newWarlordArena(t)
	a.step(1)
	a.killBanners()

	p := newFakePlayer(testHome)
	a.damageBossTo(p, 0.3) // waves fired, banners replanted (re-gate)
	a.killBanners()        // gate broken again mid-burn
	require.True(t, a.enc.waveLow && a.enc.regated, "latches armed mid-fight")

	// The group wipes: the attacker's corpse is gone from the arena — out of
	// aura reach and sensor, so the leash counts down, clears aggro + threat,
	// and out-of-combat regen carries the boss back to full.
	p.pos = phy.Vec2f{X: -50, Y: 30}
	a.step(400)
	require.Equal(t, a.enc.boss.MaxHealth(), a.enc.boss.Health(), "boss regenerated to full")

	assert.False(t, a.enc.waveHigh || a.enc.waveLow || a.enc.regated,
		"full regen re-arms every latch")
	require.NotNil(t, a.enc.banners[0], "wipe replants banner 0")
	require.NotNil(t, a.enc.banners[1], "wipe replants banner 1")
	a.enc.boss.PlayerTouches(p, model.Damage{HP: 10})
	assert.Equal(t, a.enc.boss.MaxHealth(), a.enc.boss.Health(),
		"the fresh cycle starts gated again")
}

func TestWarlord_BannersKilledPreEngagementStayDown(t *testing.T) {
	a := newWarlordArena(t)
	a.step(1)

	a.killBanners()
	a.step(50)

	assert.Nil(t, a.enc.banners[0], "pre-pull banner kills stick — no replant without engagement")
	assert.Nil(t, a.enc.banners[1], "pre-pull banner kills stick — no replant without engagement")
}

func TestWarlord_KillAnnouncesRespawnsAndEmptiesArena(t *testing.T) {
	a := newWarlordArena(t)
	a.step(1)
	a.killBanners()

	alice := newFakePlayer(testHome)
	alice.name = "Alice"
	a.damageBossTo(alice, 0.3) // wave + re-gate: grunts + banners on the field
	a.killBanners()
	require.NotEmpty(t, a.enc.grunts, "grunts on the field before the kill")

	killMob(a.enc.boss)
	a.step(1)

	require.Nil(t, a.enc.boss, "the kill is dispatched")
	require.Len(t, a.announcer.messages, 1, "one kill broadcast")
	assert.Contains(t, a.announcer.messages[0], "Alice", "the broadcast credits the participants")
	assert.True(t, strings.Contains(a.announcer.messages[0], "fallen"), a.announcer.messages[0])

	a.step(2)
	assert.Empty(t, a.enc.grunts, "the arena empties: grunts despawned")
	assert.Nil(t, a.enc.banners[0], "the arena empties: banners despawned")
	assert.Nil(t, a.enc.banners[1], "the arena empties: banners despawned")

	a.g.tick += respawnDelayTicks
	a.step(1)
	require.NotNil(t, a.enc.boss, "the warlord respawns after the delay")
	require.NotNil(t, a.enc.banners[0], "fresh banners with him")
	require.Len(t, a.announcer.messages, 2, "the respawn is broadcast")
	assert.True(t, strings.Contains(a.announcer.messages[1], "returned"), a.announcer.messages[1])

	a.enc.boss.PlayerTouches(alice, model.Damage{HP: 10})
	assert.Equal(t, a.enc.boss.MaxHealth(), a.enc.boss.Health(),
		"the fresh warlord starts gated")
}

func TestFormatKillCredit(t *testing.T) {
	assert.Equal(t, "brave nameless heroes", formatKillCredit(nil))
	assert.Equal(t, "Alice", formatKillCredit([]string{"Alice"}))
	assert.Equal(t, "Alice and Bob", formatKillCredit([]string{"Alice", "Bob"}))
	assert.Equal(t, "Alice, Bob and Cleo", formatKillCredit([]string{"Alice", "Bob", "Cleo"}))
	assert.Equal(t, "Alice, Bob, Cleo and 2 others",
		formatKillCredit([]string{"Alice", "Bob", "Cleo", "Dan", "Eve"}))
}
