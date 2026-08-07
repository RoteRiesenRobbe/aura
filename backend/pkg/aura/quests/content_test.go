package quests

// Content pins for the first authored quests (plan-quests.md chunk C4).
//
// The plan priced C4 as "the content itself is the test", and the headless
// harness is where a quest is actually walked in a browser. What lives here is
// what the harness cannot see cheaply and what would rot silently: that every
// authored quest is REACHABLE and CONSISTENT with the rows scattered across
// the conversants' interaction blocks, and that the shapes the first pass
// exists to prove are still authored — all three first-pass verbs, D9's
// two-turn-in branch, and the XP budget (L9: the band lock has no runtime
// existence, so an authored amount is only ever as correct as somebody's
// memory of it). The non-terminal dialogue edge left content with Q4 (§7 q3,
// PO 2026-07-30): the Miner's lamp leg was dropped, so the derivation's
// non-terminal direction lives only in the ledger's fixture tests now.
//
// ⚑ It reads the EMBEDDED content (pkg/api/...), which `make cp-defs` syncs from
// api/. A quest edited in api/ and not copied fails here, which is the intended
// early warning: production runs disk mode, but every other path runs embedded.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	afactions "github.com/RoteRiesenRobbe/aura/pkg/api/factions"
	amobs "github.com/RoteRiesenRobbe/aura/pkg/api/mobs"
	aquests "github.com/RoteRiesenRobbe/aura/pkg/api/quests"
	askills "github.com/RoteRiesenRobbe/aura/pkg/api/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// contentRegistries reproduces the BOOT SEQUENCE, cross-validation included, and
// the last part is not ceremony.
//
// ⚑ Terminality is derived from the edges the world authors (C1 shape decision
// ①), and CrossValidate is what registers them. A registry loaded without it
// reads every dialogue stage as terminal, so a quest completes at its first
// turn-in stage with nothing having been turned in — which is precisely what the
// first draft of the veteran test below asserted its way into. loaders.go
// guarantees the order in production; a test that skipped it would be measuring a
// world that never runs.
func contentRegistries(t *testing.T) (mobs.Registry, Registry) {
	t.Helper()

	fr, err := factions.RegistryFromFS(afactions.Factions)
	require.NoError(t, err)
	sr, err := skills.RegistryFromFS(askills.Skills, fr)
	require.NoError(t, err)
	mr, err := mobs.RegistryFromFS(sr, fr, curve.Default(), amobs.Mobs)
	require.NoError(t, err)
	qr, err := RegistryFromFS(aquests.Quests, mr)
	require.NoError(t, err)
	_, err = CrossValidate(mr, qr)
	require.NoError(t, err)
	return mr, qr
}

// The authored census. A pin, not a rule: a fifth quest means a line here.
var expectedQuests = map[string]string{
	"village-welcome":    "Village Welcome",
	"turnip-chore":       "Turnip Chore",
	"wolves-on-the-road": "Wolves on the Road",
	"the-lost-lamp":      "The Lost Lamp", // retitled 2026-08-02 with the plain-text pass (no stylized quest text yet)

	// The generic kill quests (plan-generic-kill-quests.md C1 + C2).
	"boars-in-the-field":          "Boars in the Field",
	"dire-wolves-in-the-forest":   "Dire Wolves in the Forest",
	"kobolds-on-the-road":         "Kobolds on the Road",
	"spiders-in-the-diggings":     "Spiders in the Diggings",
	"dire-wolves-at-the-camp":     "Dire Wolves at the Camp",
	"bandits-at-the-shrine":       "Bandits at the Shrine",
	"alpha-wolves-at-the-village": "Alpha Wolves at the Village",
	"bears-at-the-walls":          "Bears at the Walls",
	"thin-the-orc-line":           "Thin the Orc Line",
}

func TestContent_QuestCensus(t *testing.T) {
	_, qr := contentRegistries(t)

	titles := map[string]string{}
	for _, q := range qr.All() {
		titles[q.ID] = q.Title
		assert.False(t, q.Repeatable, "%s: nothing may author repeatable yet (D6)", q.ID)
	}
	assert.Equal(t, expectedQuests, titles)
}

// The whole point of the cross-validation pass, run against the real world
// rather than fixtures: every quest reference on every conversation row resolves,
// every advance_quest edge is legal, grant_xp only ever ends a quest (L10), and
// nothing is authored that no conversant offers (D11) — the last one being a
// WARNING at boot, which is exactly the sort of thing nobody reads.
func TestContent_CrossValidatesWithNothingUnreachable(t *testing.T) {
	mr, qr := contentRegistries(t)

	warnings, err := CrossValidate(mr, qr)
	require.NoError(t, err)
	assert.Empty(t, warnings, "every authored quest must be startable in play, not only by the QUEST cheat")
}

// D2's three verbs, all authored. The first pass exists to prove the machine
// handles each of them against real content; losing one to an edit would leave
// its code path with no eyes on it anywhere.
func TestContent_EveryFirstPassVerbIsAuthored(t *testing.T) {
	_, qr := contentRegistries(t)

	seen := map[ObjectiveKind]string{}
	for _, q := range qr.All() {
		for _, s := range q.Stages {
			for _, o := range s.Objectives {
				seen[o.Kind] = q.ID + "/" + s.ID
			}
		}
	}

	assert.NotEmpty(t, seen[ObjectiveKill], "no quest counts kills")
	assert.NotEmpty(t, seen[ObjectiveHarvest], "no quest counts harvests")
	assert.NotEmpty(t, seen[ObjectiveTalkTo], "no quest counts a conversation")
}

// ⭐ D9, and the reason C4 was worth authoring by hand: two conversants finish the
// SAME quest out of the same stage, into different terminal stages, for different
// rewards — and no code anywhere knows there is a choice. If a future edit
// collapses the branch, the schema's headline capability goes back to being
// untested by content.
func TestContent_TheWolfQuestBranchesToTwoTurnInsWithDifferentRewards(t *testing.T) {
	mr, qr := contentRegistries(t)

	q, err := qr.Get("wolves-on-the-road")
	require.NoError(t, err)

	type leg struct {
		mob     string
		toStage string
		skill   string
		xp      uint64
	}
	var legs []leg
	for _, def := range mr.Mobs() {
		if def.Interaction == nil {
			continue
		}
		for _, node := range def.Interaction.Nodes {
			for _, opt := range node.Options {
				l := leg{mob: def.Name}
				for _, g := range opt.Grants {
					switch g.Kind {
					case mobs.GrantAdvanceQuest:
						if g.Quest != q.ID || g.FromStage != "carry_word" {
							continue
						}
						l.toStage = g.ToStage
					case mobs.GrantTeachSkill:
						l.skill = g.Skill.Name
					case mobs.GrantXP:
						l.xp = g.XP
					}
				}
				if l.toStage != "" {
					legs = append(legs, l)
				}
			}
		}
	}

	require.Len(t, legs, 2, "the branch is exactly two legs")
	assert.NotEqual(t, legs[0].mob, legs[1].mob, "two DIFFERENT conversants finish it")
	assert.NotEqual(t, legs[0].toStage, legs[1].toStage, "into two different terminal stages")
	assert.NotEqual(t, legs[0].skill, legs[1].skill, "for two different rewards, or the choice is cosmetic")

	for _, l := range legs {
		assert.NotEmpty(t, l.skill, "%s: the leg teaches nothing", l.mob)
		assert.NotZero(t, l.xp, "%s: the leg pays no XP", l.mob)
		to := q.Stage(l.toStage)
		require.NotNil(t, to, "%s: %s is not a stage", l.mob, l.toStage)
		assert.True(t, q.IsTerminal(to), "%s: a branch leg must END the quest — L10 permits grant_xp nowhere else", l.mob)
	}
}

// ⚑ L5b (conversation-journal Q4/R3): Lantern is QUEST-ONLY. The 5 % kobold
// drops were deleted with Q4, so the traveller's turn-in row on the-lost-lamp
// is the aura's SINGLE source — and Lantern is the light the zone-1/2 tunnel
// is designed around. This is the reachability guarantee
// content-skill-inventory.md states in prose and nothing else enforces: a
// content edit that loses the row (or quietly re-adds a drop) changes an
// authored decision, and this test is where it says so.
func TestContent_LanternIsQuestOnlyAndHasASource(t *testing.T) {
	mr, _ := contentRegistries(t)

	var sources []string
	for _, def := range mr.Mobs() {
		for _, u := range def.Unlocks {
			assert.NotEqual(t, "Lantern", u.Skill.Name,
				"%s: the Lantern kill-drop was deleted with Q4 (R3) — the quest is the only source", def.Name)
		}
		if def.Interaction == nil {
			continue
		}
		for _, node := range def.Interaction.Nodes {
			for _, opt := range node.Options {
				turnInOf := ""
				teachesLantern := false
				for _, g := range opt.Grants {
					switch {
					case g.Kind == mobs.GrantAdvanceQuest:
						turnInOf = g.Quest
					case g.Kind == mobs.GrantTeachSkill && g.Skill.Name == "Lantern":
						teachesLantern = true
					}
				}
				if teachesLantern {
					sources = append(sources, def.Name)
					assert.Equal(t, "the-lost-lamp", turnInOf,
						"Lantern rides the lamp quest's turn-in row — a guaranteed reward, not a re-teach")
				}
			}
		}
	}
	assert.Equal(t, []string{"LamplessTraveller"}, sources,
		"exactly one row in the world grants Lantern")
}

// Every stage a quest defines can actually be walked into. An orphan stage is
// invisible content: it loads, it validates, it is served in the catalog, and no
// player ever sees a word of it. Nothing else checks this — the loader only
// checks that edges point AT real stages, never that stages have anything
// pointing at them.
func TestContent_EveryStageIsReachable(t *testing.T) {
	mr, qr := contentRegistries(t)

	// Which stages a row anywhere in the world advances INTO.
	byDialogue := map[string]map[string]bool{}
	for _, def := range mr.Mobs() {
		if def.Interaction == nil {
			continue
		}
		for _, node := range def.Interaction.Nodes {
			for _, opt := range node.Options {
				for _, g := range opt.Grants {
					if g.Kind != mobs.GrantAdvanceQuest {
						continue
					}
					if byDialogue[g.Quest] == nil {
						byDialogue[g.Quest] = map[string]bool{}
					}
					byDialogue[g.Quest][g.ToStage] = true
				}
			}
		}
	}

	for _, q := range qr.All() {
		for i, s := range q.Stages {
			if i == 0 {
				continue // the entry stage; an offer row lands here
			}
			reachedByCounter := false
			for _, other := range q.Stages {
				if other.Next == s.ID {
					reachedByCounter = true
				}
			}
			assert.True(t, reachedByCounter || byDialogue[q.ID][s.ID],
				"quest %q stage %q: nothing enters it, so its diary entry can never be written", q.ID, s.ID)
		}
	}
}

// L9's authoring budget, written down where an edit trips over it. The band lock
// is an OFFLINE convention with no runtime clamp of any kind, so these numbers
// are only ever as correct as somebody's memory — which is what this pin is for.
// PO-ruled 2026-07-30 ("punchy — about half a level each"): a level-1 player needs
// 300 XP, a level-5 one 622, so a quest is worth roughly half the level it is
// aimed at, and none of them approaches the ~560 XP the wolf cull's own kills pay.
func TestContent_QuestXPBudget(t *testing.T) {
	mr, _ := contentRegistries(t)

	total := map[string]uint64{}
	for _, def := range mr.Mobs() {
		if def.Interaction == nil {
			continue
		}
		for _, node := range def.Interaction.Nodes {
			for _, opt := range node.Options {
				quest := ""
				var xp uint64
				for _, g := range opt.Grants {
					switch g.Kind {
					case mobs.GrantAdvanceQuest:
						quest = g.Quest
					case mobs.GrantXP:
						xp += g.XP
					}
				}
				if quest != "" && xp > 0 {
					total[quest] += xp
				}
			}
		}
	}

	assert.Equal(t, map[string]uint64{
		"village-welcome":    150,
		"turnip-chore":       150,
		"wolves-on-the-road": 800, // 400 per leg, and a player can only ever walk one
		"the-lost-lamp":      700,

		// The generic kill quests (plan-generic-kill-quests.md C1 + C2): the L9
		// half-level rule applied literally — ½ × 300 × 1.2^(targetLevel−1).
		"boars-in-the-field":          180,  // L2 boars
		"dire-wolves-in-the-forest":   370,  // L6 dire wolves
		"kobolds-on-the-road":         450,  // L7 kobolds
		"spiders-in-the-diggings":     930,  // L11 spiders
		"dire-wolves-at-the-camp":     930,  // L11 dire wolves
		"bandits-at-the-shrine":       1250, // L12–13 bandits (split the pair)
		"alpha-wolves-at-the-village": 1900, // L15 alpha wolves
		"bears-at-the-walls":          2300, // L16 bears
		"thin-the-orc-line":           4800, // L20 elite orcs
	}, total)
}

// A whole quest walked off the REAL registry, using the REAL authored edge —
// accept, count eight real wolf kills, take the militia leg. The ledger's own
// tests do this against fixtures; what this adds is that the authored numbers and
// stage ids line up with each other, which is the defect an edit actually causes.
func TestContent_TheWolfQuestWalksEndToEnd(t *testing.T) {
	mr, qr := contentRegistries(t)

	wolf, err := mr.GetByName("Wolf")
	require.NoError(t, err)

	l := NewLedger(qr)
	require.NoError(t, l.Accept("wolves-on-the-road"))

	path, running, completed := l.Progress("wolves-on-the-road")
	assert.Equal(t, []string{"thin"}, path, "a fresh character starts at the objective stage")
	assert.True(t, running)
	assert.False(t, completed)

	for i := 0; i < 7; i++ {
		l.NoteKill(wolf.ID)
	}
	_, _, completed = l.Progress("wolves-on-the-road")
	assert.False(t, completed, "seven is not eight")

	l.NoteKill(wolf.ID)
	path, running, _ = l.Progress("wolves-on-the-road")
	assert.Equal(t, []string{"thin", "carry_word"}, path, "the eighth kill advances off the counters alone")
	assert.True(t, running, "and stops at the dialogue stage, waiting for a turn-in row")

	require.NoError(t, l.AdvanceDialogue("wolves-on-the-road", "carry_word", "told_militia"))
	path, running, completed = l.Progress("wolves-on-the-road")
	assert.Equal(t, []string{"thin", "carry_word", "told_militia"}, path, "the journal renders the path walked, not a position (L6)")
	assert.False(t, running)
	assert.True(t, completed)

	assert.False(t, l.MatchesStage("wolves-on-the-road", "told_militia"),
		"a completed quest must not still match its terminal stage, or the other leg's turn-in row stays clickable forever")
	assert.True(t, l.MatchesStage("wolves-on-the-road", mobs.QuestStageCompleted))
}

// D3's accepted consequence, on the quest deliberately built to meet it first: a
// character who has already done the deed completes the objective stage the
// instant they accept. Every player will have spoken to the crier (he teaches the
// base damage aura), so this is the normal path through village-welcome, not a
// corner case.
func TestContent_VillageWelcomeRequiresFreshTalksForAVeteran(t *testing.T) {
	// N4/D4 reversed D3 here: a veteran who has already met both villagers no
	// longer auto-advances at accept — every objective means "since this stage
	// started", and a talk target must be spoken to again.
	mr, qr := contentRegistries(t)

	farmer, err := mr.GetByName("Farmer")
	require.NoError(t, err)
	crier, err := mr.GetByName("TownCrier")
	require.NoError(t, err)

	l := NewLedger(qr)
	l.NoteTalkedTo(farmer.ID)
	l.NoteTalkedTo(crier.ID)

	require.NoError(t, l.Accept("village-welcome"))
	path, running, _ := l.Progress("village-welcome")
	assert.Equal(t, []string{"meet"}, path, "the old talks do not satisfy the fresh stage")
	assert.True(t, running)

	l.NoteTalkedTo(farmer.ID)
	l.NoteTalkedTo(crier.ID)
	path, running, _ = l.Progress("village-welcome")
	assert.Equal(t, []string{"meet", "back"}, path, "fresh talks advance to the turn-in stage")
	assert.True(t, running, "the reward still has to be collected")
}
