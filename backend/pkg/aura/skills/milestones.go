package skills

import (
	"encoding/json"
	"fmt"
	"io/fs"
)

// milestoneUnlocksFile is the single file the table is authored in, under
// api/milestones/.
const milestoneUnlocksFile = "milestone-unlocks.json"

// MilestoneUnlock pairs a player level with the skill that becomes discovered
// when the player first reaches that level.
type MilestoneUnlock struct {
	Level uint32
	Skill *SkillDefinition
}

// MilestoneUnlocksFromFS returns the milestone table read from fsys (the
// api/milestones/ layout), with all skill names resolved against r. Fails if
// the file is missing or any name is unknown.
func MilestoneUnlocksFromFS(fsys fs.FS, r Registry) ([]MilestoneUnlock, error) {
	data, err := fs.ReadFile(fsys, milestoneUnlocksFile)
	if err != nil {
		return nil, fmt.Errorf("milestone-unlocks: %w", err)
	}
	return milestoneUnlocksFromJSON(data, r)
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
