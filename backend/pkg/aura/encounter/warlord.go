package encounter

import (
	"fmt"
	"log/slog"
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// OrcWarlordEncounter is the Ork World Boss (content pass C6, §B ticket) —
// the first designed encounter on the spine and the v1 completion beat.
//
// Script: the Orc Warlord is invulnerable while either of his two Warbanner
// totems stands (the totems shield nearby orcs but not themselves — fell them
// fast). At 66% and 33% boss HP a wave of OrcGrunts charges in from the wave
// mouth; at 33% the banners also replant ONCE per cycle (the re-gate: break
// the gate again under wave pressure, then burn). A wipe needs no script
// logic of its own — the boss leashes, walks home and regenerates like any
// mob; the script observes "engaged and back at full" and re-arms its latches
// and banners. On the kill every participant + recent healer receives Call
// for Aid via the mob's chance-1.0 unlock (base machinery, not script), the
// kill is broadcast server-wide with the credit names, the arena empties, and
// the warlord returns after ~5 min with a second broadcast.
//
// WHERE the fight happens is the zone's: the four anchor positions come from
// zone.json (warlord-home / warbanner-1 / warbanner-2 / wave-mouth, editor-
// movable); registration in aurad hard-fails at boot when one is
// missing. WHAT happens is this file: the structure tunables below are the
// PO's one-line-change surface. All numbers [PLACEHOLDER].
const (
	warlordMobName   = "OrcWarlord"
	warbannerMobName = "WarbannerTotem"
	gruntMobName     = "OrcGrunt"

	// Zone-anchor names the encounter is registered against (aurad).
	WarlordAnchorHome      = "warlord-home"
	WarlordAnchorBanner1   = "warbanner-1"
	WarlordAnchorBanner2   = "warbanner-2"
	WarlordAnchorWaveMouth = "wave-mouth"

	waveHighRatio     = 0.66 // first grunt wave at 66% boss HP
	waveLowRatio      = 0.33 // second grunt wave at 33%
	regateRatio       = 0.33 // banners replant once per cycle at 33%
	waveSize          = 3    // grunts per wave
	respawnDelayTicks = 9000 // ~5 min until the warlord returns
)

const (
	warlordKillAnnouncement   = "The Orc Warlord has fallen to %s!"
	warlordReturnAnnouncement = "The Orc Warlord has returned to the front!"
)

type OrcWarlordEncounter struct {
	home      phy.Vec2f
	bannerPos [2]phy.Vec2f
	waveMouth phy.Vec2f

	spawned bool
	boss    *mob.Mob
	banners [2]*mob.Mob
	grunts  map[uint64]*mob.Mob

	// Per-cycle one-shot latches. engaged marks "the boss left full HP" —
	// the wipe re-arm keys on it, so felling banners before the pull never
	// hands out free replants.
	engaged  bool
	waveHigh bool
	waveLow  bool
	regated  bool

	respawnAt uint64 // 0 = no respawn scheduled
}

// NewOrcWarlordEncounter takes its positions from the zone's anchors —
// resolved (and hard-failed on absence) by the registration site.
func NewOrcWarlordEncounter(home, banner1, banner2, waveMouth phy.Vec2f) *OrcWarlordEncounter {
	return &OrcWarlordEncounter{
		home:      home,
		bannerPos: [2]phy.Vec2f{banner1, banner2},
		waveMouth: waveMouth,
		grunts:    make(map[uint64]*mob.Mob),
	}
}

func (e *OrcWarlordEncounter) Name() string { return "orc-warlord" }

func (e *OrcWarlordEncounter) spawnBoss(s *System) {
	boss, err := s.SpawnMob(warlordMobName, e.home)
	if err != nil {
		slog.Error("orc warlord: boss spawn failed", slog.Any("error", err))
		return
	}
	e.boss = boss
}

func (e *OrcWarlordEncounter) spawnBanner(s *System, i int) {
	banner, err := s.SpawnMob(warbannerMobName, e.bannerPos[i])
	if err != nil {
		slog.Error("orc warlord: banner spawn failed", slog.Any("error", err))
		return
	}
	e.banners[i] = banner
}

// replantBanners respawns every felled banner (re-gate / wipe / fresh cycle).
func (e *OrcWarlordEncounter) replantBanners(s *System) {
	for i := range e.banners {
		if e.banners[i] == nil {
			e.spawnBanner(s, i)
		}
	}
}

// spawnWave charges waveSize grunts in from the wave mouth, fanned out so
// they don't stack on one point.
func (e *OrcWarlordEncounter) spawnWave(s *System) {
	for i := 0; i < waveSize; i++ {
		offset := phy.Vec2f{X: 0, Y: float32(i - waveSize/2)}
		grunt, err := s.SpawnMob(gruntMobName, e.waveMouth.Add(offset))
		if err != nil {
			slog.Error("orc warlord: grunt spawn failed", slog.Any("error", err))
			continue
		}
		e.grunts[grunt.Basic().ID()] = grunt
	}
}

// spawnCycle sets up a fresh arena: boss home, banners planted, latches clear.
func (e *OrcWarlordEncounter) spawnCycle(s *System) {
	e.engaged = false
	e.waveHigh = false
	e.waveLow = false
	e.regated = false
	e.spawnBoss(s)
	e.replantBanners(s)
}

func (e *OrcWarlordEncounter) anyBannerAlive() bool {
	return e.banners[0] != nil || e.banners[1] != nil
}

func (e *OrcWarlordEncounter) OnTick(s *System) {
	if !e.spawned {
		e.spawned = true
		e.spawnCycle(s) // boot spawn is silent — he has always been there
	}

	// The warlord returns some time after a kill, announced.
	if e.boss == nil && e.respawnAt > 0 && s.Ticks() >= e.respawnAt {
		e.respawnAt = 0
		e.spawnCycle(s)
		s.Announce(warlordReturnAnnouncement)
	}
	if e.boss == nil {
		return
	}

	ratio := e.boss.HealthRatio()

	// Wipe re-arm: the base leash + walk-home + out-of-combat regen IS the
	// wipe handling — once an engaged boss is back at full, the cycle is
	// fresh. Keyed on engaged so pre-pull banner kills don't replant.
	if e.engaged && ratio >= 1 {
		e.engaged = false
		e.waveHigh = false
		e.waveLow = false
		e.regated = false
		e.replantBanners(s)
	}
	if !e.engaged && ratio < 1 {
		e.engaged = true
	}

	// Reinforcement waves + the one-shot re-gate.
	if !e.waveHigh && ratio > 0 && ratio <= waveHighRatio {
		e.waveHigh = true
		e.spawnWave(s)
	}
	if !e.waveLow && ratio > 0 && ratio <= waveLowRatio {
		e.waveLow = true
		e.spawnWave(s)
	}
	if !e.regated && ratio > 0 && ratio <= regateRatio {
		e.regated = true
		e.replantBanners(s)
	}

	// The gate, re-derived every tick (idempotent flag write, smoke pattern)
	// — AFTER the replants above, so a re-gate protects the same tick it
	// lands rather than leaving a one-tick vulnerability window.
	e.boss.SetInvulnerable(e.anyBannerAlive())
}

func (e *OrcWarlordEncounter) OnMobDeath(s *System, mobID uint64) {
	if e.boss != nil && e.boss.Basic().ID() == mobID {
		names := e.boss.KillCreditNames()
		e.boss = nil
		e.respawnAt = s.Ticks() + respawnDelayTicks
		s.Announce(fmt.Sprintf(warlordKillAnnouncement, formatKillCredit(names)))
		// The arena empties until the respawn (PO ruling): despawn what the
		// group left standing. Removal routes back through OnMobDeath for
		// each id — the references are cleared first, so those dispatches
		// find nothing to do.
		for i := range e.banners {
			if b := e.banners[i]; b != nil {
				e.banners[i] = nil
				s.Despawn(b)
			}
		}
		for id, g := range e.grunts {
			delete(e.grunts, id)
			s.Despawn(g)
		}
		slog.Info("orc warlord down — the v1 journey beat",
			slog.Uint64("respawnAt", e.respawnAt), slog.Int("credited", len(names)))
		return
	}
	for i := range e.banners {
		if e.banners[i] != nil && e.banners[i].Basic().ID() == mobID {
			e.banners[i] = nil
			return
		}
	}
	delete(e.grunts, mobID)
}

// formatKillCredit renders the broadcast name list: up to three names spelled
// out, the rest folded into "and N others".
func formatKillCredit(names []string) string {
	switch len(names) {
	case 0:
		return "brave nameless heroes"
	case 1:
		return names[0]
	case 2:
		return names[0] + " and " + names[1]
	case 3:
		return names[0] + ", " + names[1] + " and " + names[2]
	default:
		return fmt.Sprintf("%s and %d others", strings.Join(names[:3], ", "), len(names)-3)
	}
}
