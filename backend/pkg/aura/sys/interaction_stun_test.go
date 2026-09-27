package sys

// A stunned player at the InteractionSystem (plan-aura-drawbacks.md C2, P3):
// opening a conversation and taking a row are refused with the Stunned reason
// (skill id 0); a Close is always honoured. On a REAL player, because the
// refusal reads Stunned() through a structural assert.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/player"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func stunnedConversant(t *testing.T) (step func(), m *mob.Mob, p model.PlayerEntity, c *fakeClient) {
	t.Helper()
	space := phy.NewSpace()
	m = mob.NewMob(npcDef("Farmer", teachingInteraction([]string{"lore"}, grant(1, 1, "learned heal"))), 0, nil)
	m.SetPosition(phy.Vec2f{})
	addNpcToSpace(t, space, m)

	c = &fakeClient{uuid: uuid.New()}
	p = player.New(newStateFakeGame(t), c, "stunned-talker")
	p.SetPosition(phy.Vec2f{X: 1})
	addBodies(space, p.Bodies())

	s := NewInteractionSystem()
	s.AddEntity(m)
	s.AddPlayer(p)
	step = func() {
		p.(ccTickable).ResetTickNumbers()
		space.Update()
		s.Update(33.0)
	}
	step()
	require.Equal(t, m.Basic().ID(), p.Interactable(), "precondition: in range and offered")
	return step, m, p, c
}

func TestStunInteraction_OpeningIsRefused(t *testing.T) {
	step, m, p, c := stunnedConversant(t)
	require.True(t, p.(stunnable).ApplyStun(ccTestSource, 60))
	step() // clears the landing's own stamp

	c.interacts = append(c.interacts, &model.Interact{EntityID: m.Basic().ID(), GrantIndex: model.ConversationNoGrant})
	step()

	assert.Zero(t, p.ConversingWith(), "a stunned player cannot open a conversation")
	id, reason := p.ActivationRejected()
	assert.Equal(t, skills.SkillID(0), id)
	assert.Equal(t, model.ActivationRejectedStunned, reason)
}

func TestStunInteraction_TakingARowIsRefused(t *testing.T) {
	step, m, p, c := stunnedConversant(t)
	require.True(t, p.(stunnable).ApplyStun(ccTestSource, 60))
	step()

	c.interacts = append(c.interacts, &model.Interact{EntityID: m.Basic().ID(), NodeID: "root"})
	step()

	assert.False(t, p.SkillComponent().HasDiscovered(1), "no grant while stunned")
	assert.Empty(t, c.unlocks)
	_, reason := p.ActivationRejected()
	assert.Equal(t, model.ActivationRejectedStunned, reason)
}

func TestStunInteraction_CloseIsAlwaysHonoured(t *testing.T) {
	step, m, p, c := stunnedConversant(t)
	c.interacts = append(c.interacts, &model.Interact{EntityID: m.Basic().ID(), GrantIndex: model.ConversationNoGrant})
	step()
	require.Equal(t, m.Basic().ID(), p.ConversingWith(), "precondition: the panel is open")

	require.True(t, p.(stunnable).ApplyStun(ccTestSource, 60))
	c.interacts = append(c.interacts, &model.Interact{Close: true})
	step()

	assert.Zero(t, p.ConversingWith(), "dismissing a panel is never refused")
}
