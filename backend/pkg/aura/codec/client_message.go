package codec

import (
	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/fbutil"
)

func unwrapInput(msg *AuraApi.ClientMessage) *AuraApi.Input {
	i := &AuraApi.Input{}
	err := fbutil.UnwrapUnion[AuraApi.ClientMessageBody](msg, i)
	if err != nil {
		return nil
	}
	return i
}

func unmarshalInput(fbInput *AuraApi.Input) *model.PlayerInput {
	if fbInput == nil {
		return nil
	}

	i := &model.PlayerInput{}

	// umarshal simple scalars
	i.Tick = fbInput.Tick()
	i.Rotation = fbInput.Rotation()

	// parse Movement if existing
	m := fbInput.Movement(nil)
	if m != nil {
		i.Movement = &phy.Vec2f{
			X: m.X(),
			Y: m.Y(),
		}
	}

	i.ActiveAuraSlot = int(fbInput.ActiveAuraSlot())

	if n := fbInput.CooldownActivationsLength(); n > 0 {
		i.CooldownActivations = make([]int, 0, n)
		for j := 0; j < n; j++ {
			i.CooldownActivations = append(i.CooldownActivations, int(fbInput.CooldownActivations(j)))
		}
	}
	return i
}

func unwrapJoin(msg *AuraApi.ClientMessage) *AuraApi.Join {
	i := &AuraApi.Join{}
	err := fbutil.UnwrapUnion[AuraApi.ClientMessageBody](msg, i)
	if err != nil {
		return nil
	}
	return i
}

func unmarshalJoin(j *AuraApi.Join) *model.Join {
	if j == nil {
		return nil
	}

	join := &model.Join{
		PlayerName:     string(j.PlayerName()),
		ReconnectToken: string(j.ReconnectToken()),
	}
	return join
}

func unwrapCheat(msg *AuraApi.ClientMessage) *AuraApi.Cheat {
	i := &AuraApi.Cheat{}
	err := fbutil.UnwrapUnion[AuraApi.ClientMessageBody](msg, i)
	if err != nil {
		return nil
	}
	return i
}

func unmarshalCheat(c *AuraApi.Cheat) *model.Cheat {
	if c == nil {
		return nil
	}

	cheat := &model.Cheat{Token: string(c.Token()), Command: string(c.Command())}
	return cheat
}

func unwrapEquip(msg *AuraApi.ClientMessage) *AuraApi.Equip {
	i := &AuraApi.Equip{}
	err := fbutil.UnwrapUnion[AuraApi.ClientMessageBody](msg, i)
	if err != nil {
		return nil
	}
	return i
}

func unmarshalEquip(e *AuraApi.Equip) *model.EquipSkill {
	if e == nil {
		return nil
	}
	return &model.EquipSkill{
		SkillID: skills.SkillID(e.SkillId()),
		Slot:    int(e.Slot()),
	}
}

func unwrapInteract(msg *AuraApi.ClientMessage) *AuraApi.Interact {
	i := &AuraApi.Interact{}
	err := fbutil.UnwrapUnion[AuraApi.ClientMessageBody](msg, i)
	if err != nil {
		return nil
	}
	return i
}

func unmarshalInteract(i *AuraApi.Interact) *model.Interact {
	if i == nil {
		return nil
	}
	return &model.Interact{
		EntityID:    i.EntityId(),
		NodeID:      string(i.NodeId()),
		OptionIndex: i.OptionIndex(),
		GrantIndex:  i.GrantIndex(),
		Close:       i.Close(),
	}
}

func unwrapAbandonQuest(msg *AuraApi.ClientMessage) *AuraApi.AbandonQuest {
	i := &AuraApi.AbandonQuest{}
	err := fbutil.UnwrapUnion[AuraApi.ClientMessageBody](msg, i)
	if err != nil {
		return nil
	}
	return i
}

func unmarshalAbandonQuest(a *AuraApi.AbandonQuest) *model.AbandonQuest {
	if a == nil {
		return nil
	}
	return &model.AbandonQuest{QuestID: string(a.QuestId())}
}

func unwrapSpendSkillPoint(msg *AuraApi.ClientMessage) *AuraApi.SpendSkillPoint {
	i := &AuraApi.SpendSkillPoint{}
	err := fbutil.UnwrapUnion[AuraApi.ClientMessageBody](msg, i)
	if err != nil {
		return nil
	}
	return i
}

func unmarshalSpendSkillPoint(s *AuraApi.SpendSkillPoint) *model.SpendSkillPoint {
	if s == nil {
		return nil
	}
	return &model.SpendSkillPoint{
		SkillID: skills.SkillID(s.SkillId()),
		Unspend: s.Unspend(),
	}
}

func unwrapChatMessage(msg *AuraApi.ClientMessage) *AuraApi.ChatMessage {
	i := &AuraApi.ChatMessage{}
	err := fbutil.UnwrapUnion[AuraApi.ClientMessageBody](msg, i)
	if err != nil {
		return nil
	}
	return i
}

func unmarshalChatMessage(c *AuraApi.ChatMessage) *model.ChatMessage {
	if c == nil {
		return nil
	}

	cheat := model.ChatMessage(string(c.Message()))
	return &cheat
}

func InputMessageFlatbufferUnmarshal(msg *AuraApi.ClientMessage) *model.PlayerInput {
	fbutil.AssertBodyType[AuraApi.ClientMessageBody](msg, AuraApi.ClientMessageBodyInput)
	return unmarshalInput(unwrapInput(msg))
}

func JoinMessageFlatbufferUnmarshal(msg *AuraApi.ClientMessage) *model.Join {
	fbutil.AssertBodyType[AuraApi.ClientMessageBody](msg, AuraApi.ClientMessageBodyJoin)
	return unmarshalJoin(unwrapJoin(msg))
}

func CheatMessageFlatbufferUnmarshal(msg *AuraApi.ClientMessage) *model.Cheat {
	fbutil.AssertBodyType[AuraApi.ClientMessageBody](msg, AuraApi.ClientMessageBodyCheat)
	return unmarshalCheat(unwrapCheat(msg))
}

func ChatMessageFlatbufferUnmarshal(msg *AuraApi.ClientMessage) *model.ChatMessage {
	fbutil.AssertBodyType[AuraApi.ClientMessageBody](msg, AuraApi.ClientMessageBodyChatMessage)
	return unmarshalChatMessage(unwrapChatMessage(msg))
}

func EquipMessageFlatbufferUnmarshal(msg *AuraApi.ClientMessage) *model.EquipSkill {
	fbutil.AssertBodyType[AuraApi.ClientMessageBody](msg, AuraApi.ClientMessageBodyEquip)
	return unmarshalEquip(unwrapEquip(msg))
}

// Respawn carries no fields, so there is no unwrap/unmarshal pair — the
// asserted body type is the whole payload.
func RespawnMessageFlatbufferUnmarshal(msg *AuraApi.ClientMessage) *model.Respawn {
	fbutil.AssertBodyType[AuraApi.ClientMessageBody](msg, AuraApi.ClientMessageBodyRespawn)
	return &model.Respawn{}
}

func InteractMessageFlatbufferUnmarshal(msg *AuraApi.ClientMessage) *model.Interact {
	fbutil.AssertBodyType[AuraApi.ClientMessageBody](msg, AuraApi.ClientMessageBodyInteract)
	return unmarshalInteract(unwrapInteract(msg))
}

func SpendSkillPointMessageFlatbufferUnmarshal(msg *AuraApi.ClientMessage) *model.SpendSkillPoint {
	fbutil.AssertBodyType[AuraApi.ClientMessageBody](msg, AuraApi.ClientMessageBodySpendSkillPoint)
	return unmarshalSpendSkillPoint(unwrapSpendSkillPoint(msg))
}

func AbandonQuestMessageFlatbufferUnmarshal(msg *AuraApi.ClientMessage) *model.AbandonQuest {
	fbutil.AssertBodyType[AuraApi.ClientMessageBody](msg, AuraApi.ClientMessageBodyAbandonQuest)
	return unmarshalAbandonQuest(unwrapAbandonQuest(msg))
}

func ClientMessageFlatbufferUnmarshal(bytes []byte) *AuraApi.ClientMessage {
	return AuraApi.GetRootAsClientMessage(bytes, 0)
}
