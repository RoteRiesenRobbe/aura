package encounter

import (
	"log/slog"
	"math"

	"github.com/trichner/berryhunter/pkg/berryhunter/model/mob"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
)

// SmokeEncounter is THROWAWAY proving-grounds content: it exists to exercise
// the chunk-9 spine end to end (immunity gating, scripted spawns, encounter-
// owned timers, scripted flee with retained threat, arena reset), not to be
// a designed boss — real boss scripts are content-pass work (item 12),
// authored against the same seams. All numbers [PLACEHOLDER].
//
// Script: the ProvingBoss is invulnerable while any of its 3 ProvingGuards
// lives (guards respawn on encounter-owned 60 s timers — killing all three
// inside the window is the mechanic). At half health the boss enters a
// one-shot flee phase: it runs from its top-threat attacker while 2
// ProvingAdds spawn; both dead → it re-engages, targeting by the threat it
// retained throughout. On the boss's death the whole arena respawns fresh
// after a delay, so the encounter is repeatable in-game.
const (
	smokeBossName  = "ProvingBoss"
	smokeGuardName = "ProvingGuard"
	smokeAddName   = "ProvingAdd"

	guardCount        = 3
	guardRingRadius   = 4
	guardRespawnTicks = 1800 // ~60 s
	fleeBelowRatio    = 0.5
	addCount          = 2
	resetDelayTicks   = 900 // ~30 s
)

// smokeBossPos is a low-traffic pocket in the ESE of proving-grounds, away
// from the cat-vs-mammoth frontline (~44,11) and the Ember Ring (SW corner).
var smokeBossPos = phy.Vec2f{X: 53, Y: -22}

type SmokeEncounter struct {
	spawned bool

	boss           *mob.Mob
	guards         [guardCount]*mob.Mob
	guardRespawnAt [guardCount]uint64 // 0 = no respawn scheduled

	fled bool // one-shot flee latch per arena cycle
	adds map[uint64]*mob.Mob

	resetAt uint64 // 0 = no reset scheduled
}

func NewSmokeEncounter() *SmokeEncounter {
	return &SmokeEncounter{adds: make(map[uint64]*mob.Mob)}
}

func (e *SmokeEncounter) Name() string { return "proving-grounds-smoke" }

func guardPos(i int) phy.Vec2f {
	angle := 2 * math.Pi * float64(i) / guardCount
	return smokeBossPos.Add(phy.Vec2f{
		X: guardRingRadius * float32(math.Cos(angle)),
		Y: guardRingRadius * float32(math.Sin(angle)),
	})
}

func (e *SmokeEncounter) spawnBoss(s *System) {
	boss, err := s.SpawnMob(smokeBossName, smokeBossPos)
	if err != nil {
		slog.Error("smoke encounter: boss spawn failed", slog.Any("error", err))
		return
	}
	e.boss = boss
}

func (e *SmokeEncounter) spawnGuard(s *System, i int) {
	guard, err := s.SpawnMob(smokeGuardName, guardPos(i))
	if err != nil {
		slog.Error("smoke encounter: guard spawn failed", slog.Any("error", err))
		return
	}
	e.guards[i] = guard
	e.guardRespawnAt[i] = 0
}

func (e *SmokeEncounter) anyGuardAlive() bool {
	for _, g := range e.guards {
		if g != nil {
			return true
		}
	}
	return false
}

func (e *SmokeEncounter) OnTick(s *System) {
	if !e.spawned {
		e.spawned = true
		e.spawnBoss(s)
		for i := range e.guards {
			e.spawnGuard(s, i)
		}
	}

	// Arena reset: a fresh cycle some time after the boss died.
	if e.boss == nil && e.resetAt > 0 && s.Ticks() >= e.resetAt {
		e.resetAt = 0
		e.fled = false
		e.spawnBoss(s)
		for i := range e.guards {
			if e.guards[i] == nil {
				e.spawnGuard(s, i)
			}
		}
	}

	// Encounter-owned guard respawn timers — the "kill all three within the
	// window" sub-objective emerges from these, no window tracking needed.
	for i := range e.guards {
		if e.guards[i] == nil && e.guardRespawnAt[i] > 0 && s.Ticks() >= e.guardRespawnAt[i] {
			e.spawnGuard(s, i)
		}
	}

	if e.boss == nil {
		return
	}

	// Immunity re-derived every tick: an idempotent flag write, so the
	// condition needs no transition tracking (9b).
	e.boss.SetInvulnerable(e.anyGuardAlive())

	// One-shot flee phase at half health: run from the threat holders while
	// the adds are up (9e). The override also suspends the boss's leash, so
	// its threat table survives the whole phase.
	if !e.fled && e.boss.HealthRatio() > 0 && e.boss.HealthRatio() <= fleeBelowRatio {
		e.fled = true
		e.boss.SetFleeOverride(true)
		for i := 0; i < addCount; i++ {
			offset := phy.Vec2f{X: float32(2*i - 1), Y: 1} // beside the boss
			add, err := s.SpawnMob(smokeAddName, e.boss.Position().Add(offset))
			if err != nil {
				slog.Error("smoke encounter: add spawn failed", slog.Any("error", err))
				continue
			}
			e.adds[add.Basic().ID()] = add
		}
	}

	// Adds dead → re-engage: retention re-targets the highest retained
	// threat the moment the override drops (idempotent write, like above).
	if e.fled && len(e.adds) == 0 {
		e.boss.SetFleeOverride(false)
	}
}

func (e *SmokeEncounter) OnMobDeath(s *System, mobID uint64) {
	if e.boss != nil && e.boss.Basic().ID() == mobID {
		e.boss = nil
		e.resetAt = s.Ticks() + resetDelayTicks
		slog.Info("smoke encounter complete: boss down, arena resets",
			slog.Uint64("resetAt", e.resetAt))
		return
	}
	for i := range e.guards {
		if e.guards[i] != nil && e.guards[i].Basic().ID() == mobID {
			e.guards[i] = nil
			e.guardRespawnAt[i] = s.Ticks() + guardRespawnTicks
			return
		}
	}
	delete(e.adds, mobID)
}
