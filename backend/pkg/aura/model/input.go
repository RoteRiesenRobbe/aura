package model

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// active_aura_slot wire values. NOTE: -2 is a wire-only sentinel — a workaround for
// FlatBuffers omitting a scalar equal to its schema default (-1), which makes an
// explicit -1 indistinguishable from an absent field. Twins of the frontend's
// NO_ACTIVE_AURA_CHANGE/DEACTIVATE_AURA_SLOT (ActiveAuraSlot.ts), one wire
// contract pinned on both sides by api/shared-constants.json `activeAuraSlot`
// (cmd/aurad/shared_constants_test.go / SharedConstants.test.ts). Collapse -2
// onto -1 if the schema default is ever changed and regenerated.
const (
	ActiveAuraSlotNoChange   = -1 // client sent no active-aura command this input (wire default)
	ActiveAuraSlotDeactivate = -2 // client explicitly requests Nothing (no active aura)
)

// InputTransportStats is a snapshot of the client-side input-transport counters
// (queue eviction and arrival-time queue depth), read across the read/tick
// goroutine boundary. It is a plain value type — deliberately NOT part of the
// Client interface, so the sim nopClient and the test fakes need not implement
// it (they never evict). core discovers a real client through a narrow local
// interface + type assertion. See plan-input-jitter.md chunk 1.
type InputTransportStats struct {
	Evicted   uint64 // inputs dropped from the front of a full queue on overflow
	Dropped   uint64 // inputs lost to the rare double-race (evict + re-push both missed)
	Arrivals  uint64 // total inputs pushed by the read goroutine
	QDepthSum uint64 // running sum of queue depth sampled on arrival (÷ Arrivals = mean depth)
}

type PlayerInput struct {
	Tick           uint64
	Movement       *phy.Vec2f
	Rotation       float32
	ActiveAuraSlot int // ActiveAuraSlotNoChange / ActiveAuraSlotDeactivate / >= 0 = switch to that slot

	// CooldownActivations holds cooldown slot indices to activate this tick;
	// empty for most inputs. Out-of-range values are dropped downstream.
	CooldownActivations []int
}
