package mobs

import (
	"fmt"
	"sort"
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// Interaction is the conversation an actor carries (plan-entity-model.md chunk
// 3a, decision 6): the container is authored in FULL — nodes, conditions,
// options and a typed grant list — while today's content only ever fills in the
// degenerate one-node case. That asymmetry is deliberate and is the whole point
// of the decision: gossip trees (more nodes + next links), quest offer/accept
// (new grant kinds), vendors and the journal all become later ADDITIVE content
// instead of a schema migration, because the nesting they need already exists.
//
// It replaces model/npc: an NPC is not a type, it is an ordinary actor whose
// definition carries one of these plus a friendly faction. The evaluator lives
// in sys/interaction.go and preserves the ordered teaching walk verbatim.
type Interaction struct {
	Trigger Trigger

	// Range is the interaction reach in server units. OPTIONAL (0 = absent):
	// the effective sensor is MobDefinition.SenseRadius, the wider of this and
	// body.aggroRadius (D7). Talk range and aggro range are genuinely different
	// quantities — a teaching guard that fights bandits senses enemies far
	// further away than it will hold a conversation — but an NPC that only
	// talks authors one radius, not two.
	Range float32

	Nodes []InteractionNode
}

// InteractionNode is one thing the actor can say. Conditions gate the node as a
// whole; the evaluator speaks the FIRST node whose conditions all pass.
type InteractionNode struct {
	ID         string
	Conditions []InteractionCondition
	// Lines are the lore/sign-post fallback, spoken when the node granted
	// nothing (an all-learned sage, or a pure flavour NPC that never grants).
	Lines   []string
	Options []InteractionOption
}

// InteractionOption is one branch of a node. 3a authors exactly one per node
// and selects it implicitly; 3b renders Text as a button in the dialogue panel.
type InteractionOption struct {
	Text string
	// BlockedLine is spoken, and the walk stops, when the player fails a
	// grant's RequiredLevel — today's tooLowLine.
	BlockedLine string
	Grants      []InteractionGrant
	// Next names the node to continue at (3b). Empty = the conversation ends.
	// Validated at load even though nothing follows it yet, so a broken link
	// fails at boot rather than the first time 3b walks the graph.
	Next string
}

// InteractionGrant is one typed thing an option hands the player. The list is
// typed rather than hardcoded as "teach a skill" precisely so a quest turn-in
// or a vendor sale is a new Kind and not a new schema.
//
// RequiredLevel stays a plain field rather than a Conditions list: it is
// world.Teaching's field verbatim, and the ordered stop-at-the-first-too-low
// walk is a property of the grant LIST, not of a condition engine. Adding
// conditions to a grant later is an additive key.
type InteractionGrant struct {
	Kind          GrantKind
	RequiredLevel uint32
	// Line is spoken when the grant lands.
	Line string
	// Skill is the definition resolved at load for GrantTeachSkill — the same
	// discipline as the skill loadout and the kill unlocks: an unknown name is
	// a boot failure, never a runtime surprise.
	Skill *skills.SkillDefinition
}

// InteractionCondition gates a node. 3a implements minLevel only; the shape
// exists so quest state slots in without touching authored files.
type InteractionCondition struct {
	Kind  ConditionKind
	Value int
}

// Trigger is what opens the conversation.
type Trigger string

const (
	// TriggerApproach fires on the rising edge of a player entering the sensor
	// — the pre-merge NPC behaviour, preserved exactly by chunk 3a.
	TriggerApproach Trigger = "approach"
	// TriggerInteract waits for the player to press the interact key in range
	// (chunk 3b). Named here so the vocabulary is complete, but deliberately
	// ABSENT from the triggers table until the engine implements it — see
	// ParseTrigger.
	TriggerInteract Trigger = "interact"
)

// triggers is the single source of authorable triggers, the tierRanks/roles
// precedent. TriggerInteract is missing ON PURPOSE (D6): the loader never
// accepts content the engine cannot honour, because an accepted-but-inert
// trigger would ship an NPC that silently does nothing.
var triggers = map[string]Trigger{
	string(TriggerApproach): TriggerApproach,
}

// ParseTrigger resolves an authored trigger. Absent means approach — the only
// behaviour 3a has, so an interaction block need not restate it.
func ParseTrigger(name string) (Trigger, bool) {
	if name == "" {
		return TriggerApproach, true
	}
	t, ok := triggers[name]
	return t, ok
}

// GrantKind is what an option hands over.
type GrantKind string

// GrantTeachSkill adds a skill to the player's spellbook (the only kind today).
const GrantTeachSkill GrantKind = "teach_skill"

var grantKinds = map[string]GrantKind{
	string(GrantTeachSkill): GrantTeachSkill,
}

// ParseGrantKind resolves an authored grant kind. Unlike a trigger there is no
// default: an untyped grant is a mistake, not a shorthand.
func ParseGrantKind(name string) (GrantKind, bool) {
	k, ok := grantKinds[name]
	return k, ok
}

// ConditionKind is what a node checks before it speaks.
type ConditionKind string

// ConditionMinLevel passes when the player's level is at least Value.
const ConditionMinLevel ConditionKind = "minLevel"

var conditionKinds = map[string]ConditionKind{
	string(ConditionMinLevel): ConditionMinLevel,
}

// ParseConditionKind resolves an authored condition kind.
func ParseConditionKind(name string) (ConditionKind, bool) {
	k, ok := conditionKinds[name]
	return k, ok
}

// jsonInteraction is the authored shape. Kept beside the resolved types rather
// than in definitions.go so the whole container reads in one place.
type jsonInteraction struct {
	Trigger string                `json:"trigger"` // absent → "approach"
	Range   float32               `json:"range"`   // absent → body.aggroRadius
	Nodes   []jsonInteractionNode `json:"nodes"`
}

type jsonInteractionNode struct {
	ID         string                     `json:"id"`
	Conditions []jsonInteractionCondition `json:"conditions"`
	Lines      []string                   `json:"lines"`
	Options    []jsonInteractionOption    `json:"options"`
}

type jsonInteractionOption struct {
	Text        string                 `json:"text"`
	BlockedLine string                 `json:"blockedLine"`
	Grants      []jsonInteractionGrant `json:"grants"`
	Next        string                 `json:"next"`
}

type jsonInteractionGrant struct {
	Kind          string `json:"kind"`
	Skill         string `json:"skill"`
	RequiredLevel uint32 `json:"requiredLevel"`
	Line          string `json:"line"`
}

type jsonInteractionCondition struct {
	Kind  string `json:"kind"`
	Value int    `json:"value"`
}

// mapToInteraction validates and resolves an authored interaction block. Every
// anomaly is a boot failure, the same standard as the rest of the mob loader:
// a conversation that misbehaves is discovered by a player, at which point the
// content has already shipped.
//
// legacyRefs collects legacy-tagged skills a live mob teaches, exactly as the
// skill loadout and kill unlocks do.
func (m *mobDefinition) mapToInteraction(sr skills.Registry, legacyRefs *[]string) (*Interaction, error) {
	ji := m.Interaction
	if ji == nil {
		return nil, nil
	}

	trigger, ok := ParseTrigger(ji.Trigger)
	if !ok {
		return nil, fmt.Errorf("mob %q: interaction.trigger %q must be one of %s", m.Name, ji.Trigger, names(triggers))
	}
	if ji.Range < 0 {
		return nil, fmt.Errorf("mob %q: interaction.range %v must not be negative", m.Name, ji.Range)
	}
	if len(ji.Nodes) == 0 {
		return nil, fmt.Errorf("mob %q: interaction.nodes must not be empty", m.Name)
	}

	in := &Interaction{Trigger: trigger, Range: ji.Range}
	ids := make(map[string]bool, len(ji.Nodes))
	for i := range ji.Nodes {
		jn := &ji.Nodes[i]
		if strings.TrimSpace(jn.ID) == "" {
			return nil, fmt.Errorf("mob %q: interaction node %d: id must not be empty", m.Name, i)
		}
		if ids[jn.ID] {
			return nil, fmt.Errorf("mob %q: interaction node %d: duplicate id %q", m.Name, i, jn.ID)
		}
		ids[jn.ID] = true

		node := InteractionNode{ID: jn.ID, Lines: jn.Lines}
		for j, jc := range jn.Conditions {
			kind, ok := ParseConditionKind(jc.Kind)
			if !ok {
				return nil, fmt.Errorf("mob %q: interaction node %q condition %d: kind %q must be one of %s",
					m.Name, jn.ID, j, jc.Kind, names(conditionKinds))
			}
			node.Conditions = append(node.Conditions, InteractionCondition{Kind: kind, Value: jc.Value})
		}

		grants := 0
		for j := range jn.Options {
			jo := &jn.Options[j]
			opt := InteractionOption{Text: jo.Text, BlockedLine: jo.BlockedLine, Next: jo.Next}
			gated := false
			for k, jg := range jo.Grants {
				kind, ok := ParseGrantKind(jg.Kind)
				if !ok {
					return nil, fmt.Errorf("mob %q: interaction node %q option %d grant %d: kind %q must be one of %s",
						m.Name, jn.ID, j, k, jg.Kind, names(grantKinds))
				}
				if strings.TrimSpace(jg.Line) == "" {
					return nil, fmt.Errorf("mob %q: interaction node %q option %d grant %d: line must not be empty",
						m.Name, jn.ID, j, k)
				}
				def, err := sr.GetByName(jg.Skill)
				if err != nil {
					return nil, fmt.Errorf("mob %q: interaction node %q option %d grant %d: skill %q not found: %w",
						m.Name, jn.ID, j, k, jg.Skill, err)
				}
				if def.Legacy && !m.Legacy {
					*legacyRefs = append(*legacyRefs, "teaching "+def.Name)
				}
				if jg.RequiredLevel > 0 {
					gated = true
				}
				opt.Grants = append(opt.Grants, InteractionGrant{
					Kind:          kind,
					RequiredLevel: jg.RequiredLevel,
					Line:          jg.Line,
					Skill:         def,
				})
			}
			// Today's rule, moved from the zone loader: a level-gated walk that
			// stops has to have something to say, or a player who is too low
			// meets silence and reads it as a broken NPC.
			if gated && strings.TrimSpace(jo.BlockedLine) == "" {
				return nil, fmt.Errorf("mob %q: interaction node %q option %d: blockedLine is required when a grant has a requiredLevel",
					m.Name, jn.ID, j)
			}
			grants += len(opt.Grants)
			node.Options = append(node.Options, opt)
		}

		// The other rule moved from the zone loader: an NPC with neither
		// teachings nor lore lines says nothing at all.
		if len(node.Lines) == 0 && grants == 0 {
			return nil, fmt.Errorf("mob %q: interaction node %q: needs lines or at least one grant", m.Name, jn.ID)
		}
		in.Nodes = append(in.Nodes, node)
	}

	// A next that names no node is a conversation dead-ending mid-sentence.
	// Nothing in 3a follows a link, which is exactly why this is checked here:
	// the bug would otherwise surface only once 3b starts walking the graph.
	for _, node := range in.Nodes {
		for j, opt := range node.Options {
			if opt.Next != "" && !ids[opt.Next] {
				return nil, fmt.Errorf("mob %q: interaction node %q option %d: next %q names no node",
					m.Name, node.ID, j, opt.Next)
			}
		}
	}
	return in, nil
}

// names renders a parse table's keys for an error message, sorted so the text
// is stable across runs.
func names[T ~string](table map[string]T) string {
	keys := make([]string, 0, len(table))
	for k := range table {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return strings.Join(keys, "/")
}
