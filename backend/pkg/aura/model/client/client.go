package client

import (
	"log"
	"sync/atomic"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/codec"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/net"
	"github.com/google/flatbuffers/go"
	"github.com/google/uuid"
)

var _ = model.Client(&client{})

type client struct {
	c         *net.Client
	joins     chan *model.Join
	inputs    chan *model.PlayerInput
	cheats    chan *model.Cheat
	chat      chan *model.ChatMessage
	equips    chan *model.EquipSkill
	spends    chan *model.SpendSkillPoint
	respawns  chan *model.Respawn
	interacts chan *model.Interact
	abandons  chan *model.AbandonQuest
	respecs   chan *model.Respec
	utilities chan *model.UseUtility
	flights   chan *model.StartFlight
	uuid      uuid.UUID

	// Input-transport instrumentation (plan-input-jitter.md chunk 1). Written on
	// the read goroutine inside pushInput, read on the tick goroutine via
	// InputTransportStats — hence atomics, no locks.
	evicted   atomic.Uint64 // oldest-input evictions on a full queue
	dropped   atomic.Uint64 // double-race drops (both evict and re-push lost)
	arrivals  atomic.Uint64 // total inputs pushed
	qDepthSum atomic.Uint64 // sum of queue depth sampled on arrival
}

// InputTransportStats snapshots the transport counters. Concrete method on
// *client — deliberately NOT on the model.Client interface (see the type's doc).
func (c *client) InputTransportStats() model.InputTransportStats {
	return model.InputTransportStats{
		Evicted:   c.evicted.Load(),
		Dropped:   c.dropped.Load(),
		Arrivals:  c.arrivals.Load(),
		QDepthSum: c.qDepthSum.Load(),
	}
}

func (c *client) UUID() uuid.UUID {
	return c.uuid
}

func (c *client) NextInput() *model.PlayerInput {
	select {
	case msg := <-c.inputs:
		return msg
	default:
	}
	return nil
}

func (c *client) NextJoin() *model.Join {
	select {
	case msg := <-c.joins:
		return msg
	default:
	}
	return nil
}

func (c *client) NextCheat() *model.Cheat {
	select {
	case msg := <-c.cheats:
		return msg
	default:
	}
	return nil
}

func (c *client) NextChatMessage() *model.ChatMessage {
	select {
	case msg := <-c.chat:
		return msg
	default:
	}
	return nil
}

func (c *client) NextEquip() *model.EquipSkill {
	select {
	case msg := <-c.equips:
		return msg
	default:
	}
	return nil
}

func (c *client) NextSpendSkillPoint() *model.SpendSkillPoint {
	select {
	case msg := <-c.spends:
		return msg
	default:
	}
	return nil
}

func (c *client) NextRespawn() *model.Respawn {
	select {
	case msg := <-c.respawns:
		return msg
	default:
	}
	return nil
}

func (c *client) NextInteract() *model.Interact {
	select {
	case msg := <-c.interacts:
		return msg
	default:
	}
	return nil
}

func (c *client) NextAbandonQuest() *model.AbandonQuest {
	select {
	case msg := <-c.abandons:
		return msg
	default:
	}
	return nil
}

func (c *client) NextRespec() *model.Respec {
	select {
	case msg := <-c.respecs:
		return msg
	default:
	}
	return nil
}

func (c *client) NextUseUtility() *model.UseUtility {
	select {
	case msg := <-c.utilities:
		return msg
	default:
	}
	return nil
}

func (c *client) NextStartFlight() *model.StartFlight {
	select {
	case msg := <-c.flights:
		return msg
	default:
	}
	return nil
}

func (c *client) Close() {
	c.c.Close()
	close(c.inputs)
	close(c.joins)
	close(c.cheats)
	close(c.chat)
}

func (c *client) SendMessage(bytes []byte) error {
	return c.c.SendMessage(bytes)
}

// SendUnlock marshals a kind=Unlock EntityMessage (skill id in entity_id, the
// source label in message) and enqueues it — see plan-unlock-attribution.md.
func (c *client) SendUnlock(skillID uint64, source string) error {
	builder := flatbuffers.NewBuilder(64)
	msg := codec.EntityMessageFlatbufMarshal(builder, skillID, source, AuraApi.EntityMessageKindUnlock)
	builder.Finish(msg)
	return c.SendMessage(builder.FinishedBytes())
}

// SendJournal marshals a kind=Journal EntityMessage carrying the banner line
// (plan-quests.md C3, D17) and enqueues it. entity_id is unused — the client
// branches on the kind before it reads it, exactly as it does for Unlock.
func (c *client) SendJournal(text string) error {
	builder := flatbuffers.NewBuilder(64)
	msg := codec.EntityMessageFlatbufMarshal(builder, 0, text, AuraApi.EntityMessageKindJournal)
	builder.Finish(msg)
	return c.SendMessage(builder.FinishedBytes())
}

// pushInput enqueues an input for the tick loop. On overflow the OLDEST input
// is evicted and the newest kept — movement is a stateless snapshot where
// newest wins — but the evicted input's one-shot commands (aura switch,
// cooldown activations) are carried into the incoming input so a queue
// overflow can never eat a click (C2 PO finding 2026-07-17: the aura selector
// stuttered while moving because the command's input was blind-dropped).
// A newer aura command supersedes an evicted one.
func (c *client) pushInput(i *model.PlayerInput) {
	// Instrumentation (chunk 1): sample queue depth on arrival before the send,
	// so q_mean = qDepthSum/arrivals reports how saturated the queue runs.
	c.arrivals.Add(1)
	c.qDepthSum.Add(uint64(len(c.inputs)))

	select {
	case c.inputs <- i:
		return
	default:
	}
	select {
	case old := <-c.inputs:
		c.evicted.Add(1)
		if i.ActiveAuraSlot == model.ActiveAuraSlotNoChange {
			i.ActiveAuraSlot = old.ActiveAuraSlot
		}
		if len(old.CooldownActivations) > 0 {
			i.CooldownActivations = append(old.CooldownActivations, i.CooldownActivations...)
		}
	default:
	}
	select {
	case c.inputs <- i:
	default:
		// Both eviction and re-push lost the race against the reader — rare
		// enough to just drop.
		c.dropped.Add(1)
		log.Print("Input dropped.")
	}
}

func (c *client) routeMessage(msg *AuraApi.ClientMessage) {
	// route message
	switch msg.BodyType() {
	case AuraApi.ClientMessageBodyInput:
		i := codec.InputMessageFlatbufferUnmarshal(msg)
		c.pushInput(i)
	case AuraApi.ClientMessageBodyJoin:
		j := codec.JoinMessageFlatbufferUnmarshal(msg)
		select {
		case c.joins <- j:
		default:
			log.Print("Join dropped.")
		}
	case AuraApi.ClientMessageBodyCheat:
		m := codec.CheatMessageFlatbufferUnmarshal(msg)
		select {
		case c.cheats <- m:
		default:
			log.Print("Cheat dropped.")
		}
	case AuraApi.ClientMessageBodyChatMessage:
		m := codec.ChatMessageFlatbufferUnmarshal(msg)
		select {
		case c.chat <- m:
		default:
			log.Print("ChatMessage dropped.")
		}
	case AuraApi.ClientMessageBodyEquip:
		m := codec.EquipMessageFlatbufferUnmarshal(msg)
		select {
		case c.equips <- m:
		default:
			log.Print("Equip dropped.")
		}
	case AuraApi.ClientMessageBodySpendSkillPoint:
		m := codec.SpendSkillPointMessageFlatbufferUnmarshal(msg)
		select {
		case c.spends <- m:
		default:
			log.Print("SpendSkillPoint dropped.")
		}
	case AuraApi.ClientMessageBodyRespawn:
		m := codec.RespawnMessageFlatbufferUnmarshal(msg)
		select {
		case c.respawns <- m:
		default:
			log.Print("Respawn dropped.")
		}
	case AuraApi.ClientMessageBodyInteract:
		m := codec.InteractMessageFlatbufferUnmarshal(msg)
		select {
		case c.interacts <- m:
		default:
			log.Print("Interact dropped.")
		}
	case AuraApi.ClientMessageBodyAbandonQuest:
		m := codec.AbandonQuestMessageFlatbufferUnmarshal(msg)
		select {
		case c.abandons <- m:
		default:
			log.Print("AbandonQuest dropped.")
		}
	case AuraApi.ClientMessageBodyRespec:
		m := codec.RespecMessageFlatbufferUnmarshal(msg)
		select {
		case c.respecs <- m:
		default:
			log.Print("Respec dropped.")
		}
	case AuraApi.ClientMessageBodyUseUtility:
		m := codec.UseUtilityMessageFlatbufferUnmarshal(msg)
		select {
		case c.utilities <- m:
		default:
			log.Print("UseUtility dropped.")
		}
	case AuraApi.ClientMessageBodyStartFlight:
		m := codec.StartFlightMessageFlatbufferUnmarshal(msg)
		select {
		case c.flights <- m:
		default:
			log.Print("StartFlight dropped.")
		}
	}
}

func NewClient(c *net.Client) model.Client {
	newClient := &client{
		c:         c,
		inputs:    make(chan *model.PlayerInput, 2),
		joins:     make(chan *model.Join, 2),
		cheats:    make(chan *model.Cheat, 2),
		chat:      make(chan *model.ChatMessage, 2),
		equips:    make(chan *model.EquipSkill, 2),
		spends:    make(chan *model.SpendSkillPoint, 2),
		respawns:  make(chan *model.Respawn, 2),
		interacts: make(chan *model.Interact, 2),
		abandons:  make(chan *model.AbandonQuest, 2),
		respecs:   make(chan *model.Respec, 2),
		utilities: make(chan *model.UseUtility, 2),
		flights:   make(chan *model.StartFlight, 2),
		uuid:      uuid.New(),
	}

	c.OnMessage(func(client *net.Client, bytes []byte) {
		msg := codec.ClientMessageFlatbufferUnmarshal(bytes)
		newClient.routeMessage(msg)
	})

	c.OnDisconnect(func(o *net.Client) {
		// TODO channel leak?
		// newClient.Close()
	})
	return newClient
}
