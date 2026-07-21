package vitals

import (
	"math/rand"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
)

const Max = ^VitalSign(0)

type VitalSign uint32

func FractionToAbsPerTick(fractionPerS float32) uint32 {
	return uint32(fractionPerS / constant.TicksPerSecond * float32(Max))
}

func (v VitalSign) Fraction() float32 {
	return float32(float32(v) / float32(Max))
}

func (v VitalSign) AddFraction(n float32) VitalSign {
	if n == 0 {
		return v
	}

	if n >= 1 {
		return v.Add(uint32(Max))
	}

	if n > 0 {
		add := uint32(float32(Max) * n)
		return v.Add(add)
	}

	if n <= -1 {
		return v.Sub(uint32(Max))
	}

	sub := uint32(float32(Max) * -n)
	return v.Sub(sub)
}

func (v VitalSign) SubFraction(n float32) VitalSign {
	return v.AddFraction(-n)
}

func (v VitalSign) AddInt(n int) VitalSign {
	if n == 0 {
		return v
	}

	if n > 0 {
		return v.Add(uint32(n))
	}

	return v.Sub(uint32(-n))
}

func (v VitalSign) Add(n uint32) VitalSign {
	d := Max - v
	add := VitalSign(n)
	if d > add {
		return v + add
	}
	return Max
}

func (v VitalSign) Sub(n uint32) VitalSign {
	sub := VitalSign(n)
	if v < sub {
		return 0
	}
	return v - sub
}

func (v VitalSign) UInt32() uint32 {
	return uint32(v)
}

// RollVariance rolls a percentage variance band around a center value
// (item 11 Phase 3, decision C2): uniform in [center×(1−variance),
// center×(1+variance)]. variance 0 returns the center exactly and consumes no
// RNG draw, so seeded sequences (mob drop rolls) are unchanged for
// variance-free definitions.
func RollVariance(center, variance float32, rnd *rand.Rand) float32 {
	if variance == 0 {
		return center
	}
	return center * (1 + (2*rnd.Float32()-1)*variance)
}

// HP rounds an absolute health amount (in HP points) to an integer, returning
// at least 1 whenever the raw amount is positive so a real hit or heal never
// rounds away to nothing (item 11 Phase 1 min-1 rule). A non-positive amount
// yields 0.
func HP(amount float32) uint32 {
	if amount <= 0 {
		return 0
	}
	n := uint32(amount + 0.5)
	if n < 1 {
		n = 1
	}
	return n
}

// AddCapped adds n HP points but never exceeds maxHP (an entity's maxHealth).
// Health is stored as absolute HP (item 11 Phase 1), so heals clamp at the
// entity's own maximum rather than the VitalSign type ceiling.
func (v VitalSign) AddCapped(n uint32, maxHP VitalSign) VitalSign {
	nv := v.Add(n)
	if nv > maxHP {
		return maxHP
	}
	return nv
}
