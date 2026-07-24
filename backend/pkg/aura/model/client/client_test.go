package client

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
)

func newTestClient() *client {
	return &client{inputs: make(chan *model.PlayerInput, 2)}
}

func drain(c *client) []*model.PlayerInput {
	var out []*model.PlayerInput
	for {
		select {
		case i := <-c.inputs:
			out = append(out, i)
		default:
			return out
		}
	}
}

// A full input queue must never eat a one-shot aura command: the newest input
// replaces the oldest, but the oldest input's command is carried forward
// (C2 PO finding 2026-07-17 — the aura selector stuttered whenever the queue
// overflowed while moving, because the click's input was blind-dropped).
func TestPushInputOverflowCarriesAuraCommand(t *testing.T) {
	c := newTestClient()

	c.pushInput(&model.PlayerInput{ActiveAuraSlot: 2}) // the click
	c.pushInput(&model.PlayerInput{ActiveAuraSlot: model.ActiveAuraSlotNoChange})
	// Overflow: this movement input evicts the click input.
	c.pushInput(&model.PlayerInput{ActiveAuraSlot: model.ActiveAuraSlotNoChange})

	got := drain(c)
	if len(got) != 2 {
		t.Fatalf("queue length = %d, want 2", len(got))
	}
	found := false
	for _, i := range got {
		if i.ActiveAuraSlot == 2 {
			found = true
		}
	}
	if !found {
		t.Fatalf("aura command lost on overflow: %+v, %+v", got[0], got[1])
	}
}

// The newest command wins if BOTH the evicted and the incoming input carry
// one — the older command is superseded, not queued behind.
func TestPushInputOverflowNewestCommandWins(t *testing.T) {
	c := newTestClient()

	c.pushInput(&model.PlayerInput{ActiveAuraSlot: 1})
	c.pushInput(&model.PlayerInput{ActiveAuraSlot: model.ActiveAuraSlotNoChange})
	c.pushInput(&model.PlayerInput{ActiveAuraSlot: model.ActiveAuraSlotDeactivate})

	got := drain(c)
	for _, i := range got {
		if i.ActiveAuraSlot == 1 {
			t.Fatalf("superseded command survived: %+v", i)
		}
	}
}

// Eviction on a full queue increments the transport counter (chunk 1
// instrumentation) without regressing the one-shot carry-forward property.
func TestPushInputOverflowIncrementsEvicted(t *testing.T) {
	c := newTestClient()

	c.pushInput(&model.PlayerInput{ActiveAuraSlot: model.ActiveAuraSlotNoChange})
	c.pushInput(&model.PlayerInput{ActiveAuraSlot: model.ActiveAuraSlotNoChange})
	// Overflow: this third input evicts the oldest.
	c.pushInput(&model.PlayerInput{ActiveAuraSlot: model.ActiveAuraSlotNoChange})

	ts := c.InputTransportStats()
	if ts.Evicted != 1 {
		t.Fatalf("evicted = %d, want 1", ts.Evicted)
	}
	if ts.Dropped != 0 {
		t.Fatalf("dropped = %d, want 0", ts.Dropped)
	}
	if ts.Arrivals != 3 {
		t.Fatalf("arrivals = %d, want 3", ts.Arrivals)
	}
	// Queue depth sampled before each send: 0, then 1, then 2 (full → evict).
	if ts.QDepthSum != 3 {
		t.Fatalf("qDepthSum = %d, want 3 (0+1+2)", ts.QDepthSum)
	}
	// The C2 carry-forward property must still hold: two inputs remain queued.
	if got := drain(c); len(got) != 2 {
		t.Fatalf("queue length = %d, want 2", len(got))
	}
}

// Cooldown activations from an evicted input are prepended, never lost.
func TestPushInputOverflowCarriesCooldowns(t *testing.T) {
	c := newTestClient()

	c.pushInput(&model.PlayerInput{CooldownActivations: []int{1}, ActiveAuraSlot: model.ActiveAuraSlotNoChange})
	c.pushInput(&model.PlayerInput{ActiveAuraSlot: model.ActiveAuraSlotNoChange})
	c.pushInput(&model.PlayerInput{CooldownActivations: []int{0}, ActiveAuraSlot: model.ActiveAuraSlotNoChange})

	var all []int
	for _, i := range drain(c) {
		all = append(all, i.CooldownActivations...)
	}
	has := func(v int) bool {
		for _, x := range all {
			if x == v {
				return true
			}
		}
		return false
	}
	if !has(1) || !has(0) {
		t.Fatalf("cooldown activations lost on overflow: %v", all)
	}
}
