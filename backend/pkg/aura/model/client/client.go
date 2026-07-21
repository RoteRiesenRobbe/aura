package client

import (
	"log"

	"github.com/google/uuid"
	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/codec"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/net"
)

var _ = model.Client(&client{})

type client struct {
	c      *net.Client
	joins  chan *model.Join
	inputs chan *model.PlayerInput
	cheats chan *model.Cheat
	chat   chan *model.ChatMessage
	equips   chan *model.EquipSkill
	spends   chan *model.SpendSkillPoint
	respawns chan *model.Respawn
	uuid     uuid.UUID
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

// pushInput enqueues an input for the tick loop. On overflow the OLDEST input
// is evicted and the newest kept — movement is a stateless snapshot where
// newest wins — but the evicted input's one-shot commands (aura switch,
// cooldown activations) are carried into the incoming input so a queue
// overflow can never eat a click (C2 PO finding 2026-07-17: the aura selector
// stuttered while moving because the command's input was blind-dropped).
// A newer aura command supersedes an evicted one.
func (c *client) pushInput(i *model.PlayerInput) {
	select {
	case c.inputs <- i:
		return
	default:
	}
	select {
	case old := <-c.inputs:
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
	}
}

func NewClient(c *net.Client) model.Client {
	newClient := &client{
		c:      c,
		inputs: make(chan *model.PlayerInput, 2),
		joins:  make(chan *model.Join, 2),
		cheats: make(chan *model.Cheat, 2),
		chat:   make(chan *model.ChatMessage, 2),
		equips:   make(chan *model.EquipSkill, 2),
		spends:   make(chan *model.SpendSkillPoint, 2),
		respawns: make(chan *model.Respawn, 2),
		uuid:     uuid.New(),
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
