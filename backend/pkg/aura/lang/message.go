package lang

// Keyed wire messages (plan-localization.md C2, D1/D8/D10): the server sends a
// KEY and TYPED arguments, and the client formats the sentence in its own
// language from frontend/src/lang/<locale>.arb. English is the fallback the
// server still composes (D10), shown only when the client has no template.

// ArgKind mirrors AuraApi.MessageArgKind one for one (pinned in codec).
type ArgKind uint8

const (
	ArgText ArgKind = iota
	ArgNumber
	ArgMob
	ArgSkill
	ArgQuest
	ArgRegion
	ArgList
)

// Arg is one named ICU argument. A reference (mob, skill, quest, region) is
// an ID the client resolves from its localized catalog, never a display name:
// a name here is how English leaks into German (L7).
type Arg struct {
	Name   string
	Kind   ArgKind
	Text   string
	Number float64
	ID     uint64
	Items  []string
}

// Message is a keyed message plus its English fallback.
type Message struct {
	Key     string
	Args    []Arg
	English string
}

// Literal is an unkeyed message: rendered verbatim everywhere (player chat,
// the ANNOUNCE cheat).
func Literal(text string) Message { return Message{English: text} }

func Text(name, text string) Arg          { return Arg{Name: name, Kind: ArgText, Text: text} }
func Number(name string, n float64) Arg   { return Arg{Name: name, Kind: ArgNumber, Number: n} }
func MobRef(name string, id uint64) Arg   { return Arg{Name: name, Kind: ArgMob, ID: id} }
func SkillRef(name string, id uint64) Arg { return Arg{Name: name, Kind: ArgSkill, ID: id} }
func QuestRef(name, questID string) Arg   { return Arg{Name: name, Kind: ArgQuest, Text: questID} }
func RegionRef(name, regionID string) Arg { return Arg{Name: name, Kind: ArgRegion, Text: regionID} }
func List(name string, items []string) Arg {
	return Arg{Name: name, Kind: ArgList, Items: items}
}

// The server's message keys: EVERY key the server can send, in one place, with
// its argument names. lang_keys_test.go pins each against the client's
// frontend/src/lang/en.arb: a key with no template, or with other placeholder
// names, fails there instead of degrading silently on screen (D14).
const (
	KeyUnlockDroppedBy   = "unlockDroppedBy"
	KeyUnlockLevelReward = "unlockLevelReward"
	KeyUnlockCombination = "unlockCombination"
	KeyUnlockTaughtBy    = "unlockTaughtBy"
	KeyUnlockCheat       = "unlockCheat"
	KeyJournalUpdated    = "journalUpdated"
	KeyQuestComplete     = "questComplete"
	KeyWarlordFallen     = "warlordFallen"
	KeyWarlordReturned   = "warlordReturned"
	KeySaveResumed       = "saveResumed"
	KeySaveFailing       = "saveFailing"
	// KeyContentLines carries authored lines by id (C3): the client shows
	// each conv.<id> from the /lang bundle, one per line.
	KeyContentLines = "contentLines"
)

// ServerKeys is each key's argument names.
var ServerKeys = map[string][]string{
	KeyUnlockDroppedBy:   {"mob"},
	KeyUnlockLevelReward: {"level"},
	KeyUnlockCombination: nil,
	KeyUnlockTaughtBy:    {"mob"},
	KeyUnlockCheat:       nil,
	KeyJournalUpdated:    {"quest"},
	KeyQuestComplete:     {"quest"},
	KeyWarlordFallen:     {"names", "count"},
	KeyWarlordReturned:   nil,
	KeySaveResumed:       nil,
	KeySaveFailing:       nil,
	KeyContentLines:      {"ids"},
}
