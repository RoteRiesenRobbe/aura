package skills

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

//go:embed milestone-unlocks.json
var milestoneUnlocksJSON []byte

// MilestoneUnlock pairs a player level with the skill that becomes discovered
// when the player first reaches that level.
type MilestoneUnlock struct {
	Level uint32
	Skill *SkillDefinition
}

// DefaultMilestoneUnlocks returns the milestone table from the embedded JSON,
// with all skill names resolved against r. Fails if any name is unknown.
func DefaultMilestoneUnlocks(r Registry) ([]MilestoneUnlock, error) {
	return milestoneUnlocksFromJSON(milestoneUnlocksJSON, r)
}

type milestoneUnlockRaw struct {
	Level     uint32 `json:"level"`
	SkillName string `json:"skillName"`
}

func milestoneUnlocksFromJSON(data []byte, r Registry) ([]MilestoneUnlock, error) {
	var raw []milestoneUnlockRaw
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("milestone-unlocks: %w", err)
	}

	unlocks := make([]MilestoneUnlock, 0, len(raw))
	for _, entry := range raw {
		def, err := r.GetByName(entry.SkillName)
		if err != nil {
			return nil, fmt.Errorf("milestone-unlocks level %d: skill %q not found", entry.Level, entry.SkillName)
		}
		unlocks = append(unlocks, MilestoneUnlock{Level: entry.Level, Skill: def})
	}
	return unlocks, nil
}
