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
// definition carries one of these plus a friendly faction. Chunk 3b-ii is
// where the container is finally READ in full: present() (sys/interaction.go)
// serialises every node into the panel's tree and `next` becomes navigation.
type Interaction struct {
	// Ambient is what the actor calls out to everyone standing around it, on
	// the rising edge of a player entering its sensor (chunk 3b-ii, D18). It
	// is deliberately INDEPENDENT of the conversation: a town crier both
	// shouts the news as you pass AND opens a tree on the interact key, which
	// is precisely what the retired single-valued `trigger` could not express.
	// Empty (the common case) = the actor says nothing unprompted.
	Ambient []string

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

	// Rows names a GENERATED row source, empty for the overwhelming majority
	// of nodes whose rows are authored above (plan-ascension.md §4.2, P10).
	// Some lists cannot be authored at all because they are per-player and
	// composed at render time: what a bloodline may still learn, and the names
	// cut into the memorial. The node declares where its rows come from and the
	// evaluator asks a provider for them.
	//
	// ⚑ A source node authors NO options, and that is the index space talking
	// rather than tidiness: a generated row is addressed by its position in the
	// source's list, so an authored option would claim the same numbers.
	Rows RowSourceKind

	// Rewards is what an `ascension_catalog` node OFFERS: unlock keys, in the
	// order a player will see them (plan-ascension-sites.md D3). A site owns its
	// reward list the same way C1 made it own its price.
	//
	// ⭐ IT IS THIS NODE'S INDEX SPACE. A generated row carries its position in
	// THIS list as its OptionIndex, so present and apply must both derive the
	// order from here — indexing the global catalog instead would spend a reward
	// the player never saw.
	//
	// ⚑ REQUIRED on a catalog node and refused on every other kind of node (D5 /
	// P3). An absent list is a boot failure rather than "serve everything",
	// because a catch-all is the implicit global this whole plan exists to
	// remove; an authored empty list is legitimate and means a stone that ends
	// lives and hands nothing back. Both therefore arrive here as nil, and
	// nothing below this line needs to tell them apart.
	//
	// ⚑ The keys are NOT resolved here: `mobs` holds no catalog, and `ascension`
	// imports `mobs`, so the reverse is a cycle. ascension.CrossValidate checks
	// them at boot, where both registries stand (P4).
	Rewards []string
}

// RowSourceKind names one generated row list. A closed vocabulary with the
// refuse-at-boot discipline every other authored kind has: a typo must never
// ship as a node that silently shows nothing, which is precisely the failure
// mode a dynamic list has and an authored one does not.
type RowSourceKind string

// RowSourceAscensionCatalog is what a bloodline may still learn: the ascension
// catalog minus the entries this slot has already spent, with gated entries
// rendered locked (plan-ascension.md D18). C3's memorial is the second consumer
// and lands as one more entry here.
const RowSourceAscensionCatalog RowSourceKind = "ascension_catalog"

// RowSourceMemorialNames is the graveyard: every name any bloodline has laid
// down, newest first (plan-ascension.md D11/D25, built in C3 step 6).
//
// ⭐ THE SECOND CONSUMER OF THIS HOOK, and the one P10 was designed against:
// "one hook, two consumers, or it is not the extension the plan said it was".
// It is also the one that proves the hook is not secretly grant-shaped, because
// a memorial row GRANTS NOTHING and is inert on both ends.
//
// ⚑ Unlike the catalog's rows, these come from the DATABASE, which the per-tick
// present path may never touch. The rows are served from an in-memory snapshot
// that a timer refreshes on the other side of the persistence seam
// (sys.GraveyardNames).
const RowSourceMemorialNames RowSourceKind = "memorial_names"

var rowSourceKinds = map[string]RowSourceKind{
	string(RowSourceAscensionCatalog): RowSourceAscensionCatalog,
	string(RowSourceMemorialNames):    RowSourceMemorialNames,
}

// ParseRowSourceKind resolves an authored row source.
func ParseRowSourceKind(name string) (RowSourceKind, bool) {
	k, ok := rowSourceKinds[name]
	return k, ok
}

// InteractionOption is one row of a node, and the ONLY interactive element in
// the whole panel (chunk 3b-ii, D15). Branch or grant, it is the same row: a
// teaching list is just a node whose options happen to be one-grant teachings,
// and a quest offer will land later as a new GrantKind on this identical row.
//
// Every option must either grant something or navigate — an option that does
// neither is a button a player clicks and watches do nothing.
type InteractionOption struct {
	// Text is the row's label. Empty is legal and means "label me from what I
	// grant": present() falls back to the skill's display name, which is what
	// renders the NPCs that were never re-authored into trees.
	Text   string
	Grants []InteractionGrant
	// Next names the node to continue at. Empty = this row only grants.
	// Validated at load since 3a; 3b-ii is where it is finally READ, and it is
	// the entire navigation mechanism — Back and Leave are automatic, so no
	// author can strand a player in a dead end.
	Next string

	// LockedWhenGated opts this row into rendering LOCKED, with the destination
	// node's gate named for the player, when that destination's conditions do
	// not pass, instead of vanishing (plan-ascension-sites.md C2 / D2).
	//
	// ⭐ OPT-IN, and that is P5 rather than caution: presentOptions hides a row
	// whose destination this player cannot see, and every quest tree in the game
	// depends on it. Flipping the default would leak hidden nodes out of all of
	// them at once: the branch a player has not unlocked, the turn-in they
	// cannot yet make. A site naming its own price is one authored row.
	//
	// The loader refuses it where it could not mean anything: with no Next, on
	// an unconditional destination, and on a row that grants.
	LockedWhenGated bool
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
	// a boot failure, never a runtime surprise. nil for every other kind.
	Skill *skills.SkillDefinition

	// Quest is the quest id an offer/advance drives; FromStage and ToStage are
	// the branch edge an advance walks (C2).
	//
	// ⚑ These stay STRINGS rather than a resolved *quests.QuestDefinition, unlike
	// Skill above: the quests package resolves species names against this one, so
	// a pointer here would be an import cycle. They are validated instead by a
	// post-load cross-validation pass, once both registries exist — which is also
	// the only point at which terminality is knowable (see quests.CrossValidate).
	Quest     string
	FromStage string
	ToStage   string
	// XP is the amount GrantXP awards.
	XP uint64
}

// InteractionCondition gates a node — minLevel, or a quest's position in the
// player's ledger.
type InteractionCondition struct {
	Kind  ConditionKind
	Value int
	// Quest and Stage carry ConditionQuestAtStage's payload. Stage is a stage id
	// or one of the two sentinels; validated against the quest graph at boot.
	Quest string
	Stage string
	// Species is ConditionKillsThisLife's authored species name, and SpeciesID is
	// that name resolved against the mob registry (plan-ascension.md P20).
	//
	// ⭐ THE TWO-FIELD SHAPE IS FORCED, and the same forces the Quest field above
	// records: ParseCondition holds no registry, and for a dialogue node the
	// registry does not exist yet: mapToInteraction runs per definition, so a
	// node gating on a species authored in another file has nothing to resolve
	// against. The name therefore rides through the parse and a later pass fills
	// in the id (resolveConditionSpecies for nodes; the catalog loader for
	// ascension entries).
	//
	// ⚑ Resolution happens at LOAD and never at evaluation: conditionsPass runs
	// per tick per conversing player (L15), so a registry lookup there would
	// multiply into the render path. Species survives past resolution because the
	// player-facing progress line names the species, and re-deriving a name from
	// an id would be a second lookup on that same path.
	Species   string
	SpeciesID MobID
}

// maxAddressableIndex is the highest option/grant index a row can carry (L4,
// plan-quests.md C0). option_index and grant_index are `ubyte` on the wire and
// present() narrows with a bare uint8() cast, so a 256th entry aliases index 0
// and hands over the wrong thing — silently, and only for the player who clicks
// the row nobody tested.
//
// ⚑ 254, not 255: grant_index defaults to 255 as the client's "this row only
// navigates" sentinel (server.fbs:375), while option_index has no default at all
// (:372) — so an authored index 255 would be a legitimate value colliding with
// that sentinel. Capping both at the same number keeps the two indices'
// authoring rule identical instead of off by one for a reason nobody remembers.
const maxAddressableIndex = 254

// GrantKind is what an option hands over.
type GrantKind string

const (
	// GrantTeachSkill adds a skill to the player's spellbook.
	GrantTeachSkill GrantKind = "teach_skill"

	// GrantOfferQuest moves a quest from not-started onto its first stage
	// (plan-quests.md C2 / D11 — every quest begins at a dialogue row).
	GrantOfferQuest GrantKind = "offer_quest"
	// GrantAdvanceQuest walks one authored branch edge: this quest, out of this
	// stage, into that one (D1/D9). Several rows on several NPCs may move the
	// same stage to DIFFERENT next stages with different rewards, which is how
	// "two NPCs complete the quest" is content rather than a feature.
	GrantAdvanceQuest GrantKind = "advance_quest"
	// GrantXP is the second GDD-legal reward (no items, ever). It rides the
	// normal AddExperience path — level derivation, heal-to-new-full, milestone
	// unlocks — because a second XP path would be a second set of level-up bugs
	// (L9). ⚑ Amounts are an offline authoring budget with no runtime clamp.
	GrantXP GrantKind = "grant_xp"
)

var grantKinds = map[string]GrantKind{
	string(GrantTeachSkill):   GrantTeachSkill,
	string(GrantOfferQuest):   GrantOfferQuest,
	string(GrantAdvanceQuest): GrantAdvanceQuest,
	string(GrantXP):           GrantXP,
}

// IsQuestKind reports whether the kind drives the quest ledger. Such a grant
// LEADS its option and makes the whole option one atomic row: the quest op is
// applied first and, if it is refused, nothing else in the option is handed over
// (§5, the PO's ruling). That is what stops a re-clicked turn-in paying twice.
func (k GrantKind) IsQuestKind() bool {
	return k == GrantOfferQuest || k == GrantAdvanceQuest
}

// ParseGrantKind resolves an authored grant kind. Unlike a trigger there is no
// default: an untyped grant is a mistake, not a shorthand.
func ParseGrantKind(name string) (GrantKind, bool) {
	k, ok := grantKinds[name]
	return k, ok
}

// ConditionKind is what a node checks before it speaks.
type ConditionKind string

const (
	// ConditionMinLevel passes when the player's level is at least Value.
	ConditionMinLevel ConditionKind = "minLevel"

	// ConditionBloodlineAscensions passes when this character's SLOT has ascended
	// at least Value times (plan-ascension.md D18, tier B). The count rides the
	// play ticket, resolved once in the off-loop /select path from the account's
	// own rows, so evaluating it is an O(1) read on the per-tick present path
	// like every other kind here.
	//
	// ⭐ THE NAME CARRIES ITS SCOPE, and that is a rule rather than a style
	// choice (D18). A bare "ascensions" would leave per-life and cross-life
	// ambiguous, and that line is the entire cost model: this one is free
	// because the count is derivable from game.characters at ticket time, while
	// a counter that accumulates across lives would need a migration (tier C,
	// not taken).
	//
	// ⚑ Session-constant by construction: ascending ENDS the session, so nothing
	// can change this value while a player is looking at it.
	ConditionBloodlineAscensions ConditionKind = "bloodline_ascensions"

	// ConditionQuestAtStage passes when the player's ledger has Quest at Stage —
	// a stage id, or the two sentinels below. This is what makes an NPC's dialogue
	// change as a quest progresses: it hides the offer once the quest is running
	// and shows the turn-in only when it is earned. Node-level like every
	// condition (L2), which reaches rows through present()'s existing rule that an
	// option pointing at a hidden node is itself hidden.
	ConditionQuestAtStage ConditionKind = "quest_at_stage"

	// ConditionKillsThisLife passes when the player has killed at least Value of
	// Species since this CHARACTER was created (plan-ascension.md D18 tier A,
	// built in §13 step 1). The counter is the quest ledger's: NoteKill counts
	// every credited kill of every species unconditionally, quest or no quest,
	// and KillCount reads one map entry, so this kind costs no new state and no
	// new surface, only its own evaluation.
	//
	// ⭐ THE NAME CARRIES ITS SCOPE, and this is the kind that rule was written
	// for (D18). "This life" is free precisely because the counters die with the
	// character row, which is §4.8's whole point; the same question asked across
	// a bloodline's lives is tier C and costs a migration. A bare "kills" would
	// have left an author unable to tell which one they were buying.
	//
	// ⚑ Unlike every other kind here, it carries an authored NAME that must be
	// resolved before it can be evaluated. See Species/SpeciesID below.
	ConditionKillsThisLife ConditionKind = "kills_this_life"
)

// The stage sentinels a quest_at_stage condition may name instead of a stage
// id. ⚑ They live HERE, in the package that parses them, rather than with the
// ledger that answers them: quests imports mobs (species names resolve to MobIDs
// at load), so the reverse direction is an import cycle. The ledger's matcher
// reads these constants.
//
// ⚑ A sentinel is named in FOUR places and all four must learn it together: this
// block, the loader's error string below, quests.CheckStageRef (which would
// otherwise refuse the name as an undefined stage id and fail boot), and
// Ledger.MatchesStage. The ascension catalog needs no edit — it calls the same
// checker rather than copying it.
const (
	QuestStageNotStarted = "not_started"
	QuestStageCompleted  = "completed"
	// QuestStageRunning is the whole in-progress band without naming a stage:
	// accepted, not yet finished (intake round 8 item 2). It exists because
	// conditions are AND-ed with no negation, so "while this quest is running"
	// was otherwise inexpressible except by duplicating a node once per stage —
	// and a row that answers a question only a running quest asks is exactly
	// what should leave when the quest does.
	QuestStageRunning = "running"
)

var conditionKinds = map[string]ConditionKind{
	string(ConditionMinLevel):            ConditionMinLevel,
	string(ConditionQuestAtStage):        ConditionQuestAtStage,
	string(ConditionBloodlineAscensions): ConditionBloodlineAscensions,
	string(ConditionKillsThisLife):       ConditionKillsThisLife,
}

// ParseConditionKind resolves an authored condition kind.
func ParseConditionKind(name string) (ConditionKind, bool) {
	k, ok := conditionKinds[name]
	return k, ok
}

// CostKind and ConsequenceKind are D8/D10's reserved vocabulary: named so the
// eventual implementation is an additive case, and refused at boot so nothing
// half-implemented can ship. See jsonInteractionOption for why.
type CostKind string

// CostUnlearnSkill trades a known skill away — the only "fetch quest" shape the
// GDD's no-items rule permits (D8). BLOCKED on §9 question 1.
const CostUnlearnSkill CostKind = "unlearn_skill"

var costKinds = map[string]CostKind{
	string(CostUnlearnSkill): CostUnlearnSkill,
}

type ConsequenceKind string

const (
	// ConsequenceFactionHostile flips a faction against the player — the named
	// consumer the allegiance verbs of archive/plan-faction-flips.md were built
	// for (D10). BLOCKED on the camps design session.
	ConsequenceFactionHostile ConsequenceKind = "faction_hostile"
	// ConsequenceFactionStanding moves standing with a faction (D10).
	ConsequenceFactionStanding ConsequenceKind = "faction_standing"
)

var consequenceKinds = map[string]ConsequenceKind{
	string(ConsequenceFactionHostile):  ConsequenceFactionHostile,
	string(ConsequenceFactionStanding): ConsequenceFactionStanding,
}

// jsonInteraction is the authored shape. Kept beside the resolved types rather
// than in definitions.go so the whole container reads in one place.
type jsonInteraction struct {
	// ⚑ Trigger is a TOMBSTONE, kept solely to reject it (D18) — and the reason
	// has changed since it was written. It used to be that the mob loader was the
	// one loader WITHOUT DisallowUnknownFields, so deleting the field outright
	// would have let a stale content file boot green with a key that means
	// nothing. R1 closed that (definitions.go:296), so deleting it would now
	// hard-fail too — but as `unknown field "trigger"`, which says the key is a
	// typo. The tombstone is what turns that into a sentence naming its
	// replacement, for a PO who authors these files by hand (L22).
	Trigger string                `json:"trigger"`
	Ambient []string              `json:"ambient"` // absent → says nothing unprompted
	Range   float32               `json:"range"`   // absent → body.aggroRadius
	Nodes   []jsonInteractionNode `json:"nodes"`
}

type jsonInteractionNode struct {
	ID         string                  `json:"id"`
	Conditions []JSONCondition         `json:"conditions"`
	Lines      []string                `json:"lines"`
	Rows       string                  `json:"rows"`
	Options    []jsonInteractionOption `json:"options"`

	// ⚑ A POINTER, and that is D5 rather than style: absent and `[]` are
	// different authored statements — "this site says nothing about what it
	// offers", which is refused, and "this site offers nothing", which is
	// legitimate — and a plain slice decodes both to nil.
	Rewards *[]string `json:"rewards"`
}

type jsonInteractionOption struct {
	Text string `json:"text"`
	// ⚑ BlockedLine is a TOMBSTONE, kept solely to reject it (Q1/R1, the
	// `trigger` precedent above): a locked row is greyed with its wall named and
	// clicking it does nothing — the greying is the message, and nothing
	// replaces the line. Without this the loader's DisallowUnknownFields would
	// still fail, but as `unknown field "blockedLine"`, which reads as a typo
	// rather than as a retirement (L22).
	BlockedLine string                 `json:"blockedLine"`
	Grants      []jsonInteractionGrant `json:"grants"`
	Next        string                 `json:"next"`
	// LockedWhenGated: see InteractionOption's field. Opt-in per row (P5).
	LockedWhenGated bool `json:"lockedWhenGated"`

	// Costs and Consequences are D8/D10 SCHEMA ROOM: the vocabulary is fixed here
	// so the day un-learning is ruled (§9 question 1) and camps are designed, both
	// arrive as an additive case rather than a schema migration. Authoring either
	// is a named boot failure today — see mapToInteraction. ⚑ Do not "just
	// implement" one: an unlearn that leaves an evicted skill's slot assignment,
	// its combinations and its invested levels undefined is the open question, not
	// the code.
	Costs        []jsonInteractionCost        `json:"costs"`
	Consequences []jsonInteractionConsequence `json:"consequences"`
}

type jsonInteractionGrant struct {
	Kind          string `json:"kind"`
	Skill         string `json:"skill"`
	RequiredLevel uint32 `json:"requiredLevel"`
	Line          string `json:"line"`

	Quest     string `json:"quest"`
	FromStage string `json:"fromStage"`
	ToStage   string `json:"toStage"`
	XP        uint64 `json:"xp"`
}

// JSONCondition is the AUTHORED shape of one condition, exported because a
// dialogue node is no longer the only thing conditions gate: an ascension
// catalog entry carries the same list (plan-ascension.md D18, "two surfaces,
// one language"). Sharing the struct and ParseCondition below is what keeps
// that literal rather than aspirational — a second authored shape would be a
// second vocabulary the day either side gained a kind.
type JSONCondition struct {
	Kind    string `json:"kind"`
	Value   int    `json:"value"`
	Quest   string `json:"quest"`
	Stage   string `json:"stage"`
	Species string `json:"species"`
}

// ParseCondition resolves and validates one authored condition. The error names
// the failure but not WHERE it was authored — callers add that, because "mob X
// node Y condition 3" and "ascension entry FrostShield condition 0" are the
// same mistake in two different files.
func ParseCondition(jc JSONCondition) (InteractionCondition, error) {
	kind, ok := ParseConditionKind(jc.Kind)
	if !ok {
		return InteractionCondition{}, fmt.Errorf("kind %q must be one of %s", jc.Kind, names(conditionKinds))
	}
	cond := InteractionCondition{
		Kind:    kind,
		Value:   jc.Value,
		Quest:   jc.Quest,
		Stage:   jc.Stage,
		Species: strings.TrimSpace(jc.Species),
	}
	if kind == ConditionKillsThisLife {
		if cond.Species == "" {
			return InteractionCondition{}, fmt.Errorf(
				"kills_this_life needs a species to count: an unnamed one resolves to nothing and " +
					"locks the gate forever")
		}
		// Same reasoning as the ascension count below, and one more: with a
		// threshold of zero the gate would pass before anything was ever counted,
		// so an unresolved species could never make itself known either.
		if cond.Value <= 0 {
			return InteractionCondition{}, fmt.Errorf(
				"kills_this_life needs a positive count: %d passes for every character alive, "+
					"which is an authored gate that does nothing", cond.Value)
		}
	}
	if kind == ConditionBloodlineAscensions && cond.Value <= 0 {
		return InteractionCondition{}, fmt.Errorf(
			"bloodline_ascensions needs a positive count: %d passes for every character alive, "+
				"which is an authored gate that does nothing", cond.Value)
	}
	if kind == ConditionQuestAtStage && (cond.Quest == "" || cond.Stage == "") {
		return InteractionCondition{}, fmt.Errorf("quest_at_stage needs a quest and a stage (a stage id, %q, %q or %q)",
			QuestStageNotStarted, QuestStageCompleted, QuestStageRunning)
	}
	return cond, nil
}

type jsonInteractionCost struct {
	Kind  string `json:"kind"`
	Skill string `json:"skill"`
}

type jsonInteractionConsequence struct {
	Kind    string `json:"kind"`
	Faction string `json:"faction"`
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

	if ji.Trigger != "" {
		return nil, fmt.Errorf("mob %q: interaction.trigger was retired — nothing speaks unprompted now, "+
			"and walk-by lore is interaction.ambient (plan-entity-model.md D18)", m.Name)
	}
	if ji.Range < 0 {
		return nil, fmt.Errorf("mob %q: interaction.range %v must not be negative", m.Name, ji.Range)
	}
	if len(ji.Nodes) == 0 {
		return nil, fmt.Errorf("mob %q: interaction.nodes must not be empty", m.Name)
	}

	in := &Interaction{Ambient: ji.Ambient, Range: ji.Range}
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
		if jn.Rows != "" {
			kind, ok := ParseRowSourceKind(jn.Rows)
			if !ok {
				return nil, fmt.Errorf("mob %q: interaction node %q: rows %q must be one of %s",
					m.Name, jn.ID, jn.Rows, names(rowSourceKinds))
			}
			// ⭐ The index space, not tidiness: a generated row is addressed by
			// its position in the source's list, so an authored option on the
			// same node claims the same numbers, and the collision surfaces
			// only as a player clicking one row and being handed another.
			if len(jn.Options) > 0 {
				return nil, fmt.Errorf("mob %q: interaction node %q: a %q node generates its rows, so it must "+
					"author none — the two would share one index space and a click would hand over the wrong row",
					m.Name, jn.ID, jn.Rows)
			}
			// ⚑ A generated list may legitimately come back EMPTY (D14: a
			// bloodline that has learned everything it can teach). The lines
			// are what the node says then, so a source node without them is a
			// blank panel exactly when the content most needs to explain itself.
			if len(jn.Lines) == 0 {
				return nil, fmt.Errorf("mob %q: interaction node %q: a %q node needs lines — its rows can come back "+
					"empty, and then the lines are all it has to say", m.Name, jn.ID, jn.Rows)
			}
			node.Rows = kind
		}
		if err := mapRewards(m.Name, jn, &node); err != nil {
			return nil, err
		}
		for j, jc := range jn.Conditions {
			cond, err := ParseCondition(jc)
			if err != nil {
				return nil, fmt.Errorf("mob %q: interaction node %q condition %d: %w", m.Name, jn.ID, j, err)
			}
			node.Conditions = append(node.Conditions, cond)
		}

		if len(jn.Options) > maxAddressableIndex+1 {
			return nil, fmt.Errorf("mob %q: interaction node %q: %d options, but only indices 0..%d are addressable on the wire",
				m.Name, jn.ID, len(jn.Options), maxAddressableIndex)
		}

		grants := 0
		for j := range jn.Options {
			jo := &jn.Options[j]
			if len(jo.Grants) > maxAddressableIndex+1 {
				return nil, fmt.Errorf("mob %q: interaction node %q option %d: %d grants, but only indices 0..%d are addressable on the wire",
					m.Name, jn.ID, j, len(jo.Grants), maxAddressableIndex)
			}
			if jo.BlockedLine != "" {
				return nil, fmt.Errorf("mob %q: interaction node %q option %d: blockedLine was retired — a locked "+
					"row is greyed with its wall named and clicking it is inert; the greying is the message, and "+
					"nothing replaces the line (plan-conversation-journal.md Q1/R1)", m.Name, jn.ID, j)
			}
			if err := m.checkSchemaRoom(jn.ID, j, jo); err != nil {
				return nil, err
			}
			opt := InteractionOption{Text: jo.Text, Next: jo.Next, LockedWhenGated: jo.LockedWhenGated}
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
				where := fmt.Sprintf("mob %q: interaction node %q option %d grant %d", m.Name, jn.ID, j, k)
				g, err := m.mapGrant(where, kind, jg, sr, legacyRefs)
				if err != nil {
					return nil, err
				}
				opt.Grants = append(opt.Grants, g)
			}
			if err := m.checkQuestRowShape(jn.ID, j, &opt); err != nil {
				return nil, err
			}
			// An option is a clickable row now (D15), so one that neither
			// grants nor navigates is a button that visibly does nothing.
			// Under 3a's implicit walk it was merely pointless.
			if len(opt.Grants) == 0 && opt.Next == "" {
				return nil, fmt.Errorf("mob %q: interaction node %q option %d: needs at least one grant or a next",
					m.Name, jn.ID, j)
			}
			// The flag names a DESTINATION's gate, and it renders a row that is
			// inert on both ends. Neither survives without a `next`, and a row
			// that grants would be offered locked and then refused by applyGrant
			// (the present/apply disagreement L24's pin exists to prevent).
			// (The destination being gated at all is checked below, once every
			// node is known.)
			if opt.LockedWhenGated {
				if opt.Next == "" {
					return nil, fmt.Errorf("mob %q: interaction node %q option %d: lockedWhenGated names the gate on "+
						"the node it leads to, so it needs a next", m.Name, jn.ID, j)
				}
				if len(opt.Grants) > 0 {
					return nil, fmt.Errorf("mob %q: interaction node %q option %d: lockedWhenGated is for a pure "+
						"navigation row — a locked row is inert and applyGrant refuses it, so a grant behind one "+
						"could never be handed over (P5)", m.Name, jn.ID, j)
				}
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

	// L3: selectNode speaks the FIRST node whose conditions all pass, so an
	// unconditional node makes every conditional node BELOW it unreachable as a
	// greeting — silently, and the symptom is an NPC saying the wrong thing rather
	// than anything failing. Quest-conditional greetings are the shape that trips
	// this, so the rule lands with the vocabulary that introduces them. The
	// authoring shape it enforces: conditional nodes first, the unconditional
	// fallback last.
	//
	// ⚑ A node below the fallback is not useless — options can still navigate to
	// it. Only its use as a GREETING is dead, which is why the message names that.
	//
	// ⭐ And that is exactly why a NAVIGATION DESTINATION is exempt (intake round 8
	// item 2): a node an option points at was never competing to be the greeting,
	// so its position below the fallback is the author's intent rather than the
	// mistake this rule catches. Hiding an info row REQUIRES the shape — options
	// carry no conditions, so a row is gated by gating the node behind it, and
	// hoisting that node above the fallback would make it the greeting the moment
	// its condition passed. ⚑ The trade, stated: a node that is both a destination
	// and a would-be conditional greeting now passes with its greeting use silently
	// dead. Authoring an option to a node is a clear enough statement of intent to
	// be worth that, and the alternative is a legal shape nobody can author.
	destinations := make(map[string]bool, len(in.Nodes))
	for _, node := range in.Nodes {
		for _, opt := range node.Options {
			if opt.Next != "" {
				destinations[opt.Next] = true
			}
		}
	}
	for i := range in.Nodes {
		if len(in.Nodes[i].Conditions) > 0 {
			continue
		}
		for _, later := range in.Nodes[i+1:] {
			if len(later.Conditions) > 0 && !destinations[later.ID] {
				return nil, fmt.Errorf("mob %q: interaction node %q is conditional but sits below the unconditional "+
					"node %q with nothing navigating to it, so it can never be selected as the greeting — "+
					"put conditional nodes first (L3)",
					m.Name, later.ID, in.Nodes[i].ID)
			}
		}
		break
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

	// An unconditional destination is visible to everybody, so a lockedWhenGated
	// row pointing at one can never fire. Refused rather than tolerated: a flag
	// that silently does nothing is the same authoring failure DisallowUnknownFields
	// catches one keystroke earlier, and the author's intent here (a gate the
	// player can read) is stated clearly enough to be worth holding them to.
	for _, node := range in.Nodes {
		for j, opt := range node.Options {
			if !opt.LockedWhenGated {
				continue
			}
			dest := nodeByID(in, opt.Next)
			if dest == nil || len(dest.Conditions) == 0 {
				return nil, fmt.Errorf("mob %q: interaction node %q option %d: lockedWhenGated needs a GATED "+
					"destination to name, but node %q carries no conditions and is visible to everybody",
					m.Name, node.ID, j, opt.Next)
			}
		}
	}
	return in, nil
}

// mapRewards resolves a catalog node's authored reward list, and refuses one
// anywhere else (plan-ascension-sites.md C3, D3/D5/P3).
//
// ⚑ It validates SHAPE only. Whether a key names a real reward is
// ascension.CrossValidate's question, because this package holds no catalog and
// cannot import one without a cycle.
func mapRewards(mobName string, jn *jsonInteractionNode, node *InteractionNode) error {
	if node.Rows != RowSourceAscensionCatalog {
		if jn.Rewards != nil {
			return fmt.Errorf("mob %q: interaction node %q: rewards is what an %q node offers, and this node is "+
				"not one — the key would be silently inert here",
				mobName, jn.ID, RowSourceAscensionCatalog)
		}
		return nil
	}
	// ⭐ ABSENT IS A BOOT FAILURE, not "offer everything" (D5). A site owns its
	// reward list exactly as C1 made it own its price, and a catch-all default is
	// the implicit global this plan exists to remove. An authored `[]` is a
	// different and legitimate statement, which is why the authored field is a
	// pointer.
	if jn.Rewards == nil {
		return fmt.Errorf("mob %q: interaction node %q: an %q node must author the rewards it offers — "+
			"there is no catch-all, and `\"rewards\": []` is how a site says it offers none (D5)",
			mobName, jn.ID, RowSourceAscensionCatalog)
	}
	seen := make(map[string]bool, len(*jn.Rewards))
	for i, key := range *jn.Rewards {
		key = strings.TrimSpace(key)
		if key == "" {
			return fmt.Errorf("mob %q: interaction node %q reward %d: must name an unlock key", mobName, jn.ID, i)
		}
		// The catalog's own duplicate check, one layer down: two rows spending one
		// bloodline_unlocks key leaves the second unpickable forever, and it reaches
		// the player as a row that greys out for no reason once they click its twin.
		if seen[key] {
			return fmt.Errorf("mob %q: interaction node %q reward %d: %q is already offered by this node — "+
				"one unlock key spends once, so the second row could never be taken", mobName, jn.ID, i, key)
		}
		seen[key] = true
		node.Rewards = append(node.Rewards, key)
	}
	return nil
}

// nodeByID finds a node in a parsed interaction. Load-time only: the render path
// has its own (sys.nodeByID), where the same walk is under L15's per-tick budget.
func nodeByID(in *Interaction, id string) *InteractionNode {
	for i := range in.Nodes {
		if in.Nodes[i].ID == id {
			return &in.Nodes[i]
		}
	}
	return nil
}

// mapGrant resolves one grant's payload FOR ITS KIND (C2, §5). Before quests
// there was one kind, so the loader resolved a `skill` unconditionally — which
// would have forced every new kind to author a dummy skill name to boot at all.
// Each kind now states which keys it needs and which it refuses, because a key
// that means nothing for the kind it sits on is exactly the silently-ignored
// authored line DisallowUnknownFields exists to prevent.
func (m *mobDefinition) mapGrant(where string, kind GrantKind, jg jsonInteractionGrant,
	sr skills.Registry, legacyRefs *[]string,
) (InteractionGrant, error) {
	g := InteractionGrant{Kind: kind, RequiredLevel: jg.RequiredLevel, Line: jg.Line}

	if kind != GrantTeachSkill && jg.Skill != "" {
		return g, fmt.Errorf("%s: a %s grant hands over no skill — drop the `skill` key", where, kind)
	}
	if kind == GrantTeachSkill && (jg.Quest != "" || jg.FromStage != "" || jg.ToStage != "" || jg.XP != 0) {
		return g, fmt.Errorf("%s: a teach_skill grant takes no quest/stage/xp keys — a reward that also advances "+
			"a quest is two grants on one option, not one grant doing both", where)
	}
	// A quest edge is walkable when the ledger says so; a level wall is a
	// property of a teachable skill. Mixing them would put the same gate in two
	// vocabularies with only one of them enforced at the ledger.
	if kind != GrantTeachSkill && jg.RequiredLevel != 0 {
		return g, fmt.Errorf("%s: a %s grant takes no requiredLevel — the quest's own stage graph is its gate", where, kind)
	}

	switch kind {
	case GrantTeachSkill:
		def, err := sr.GetByName(jg.Skill)
		if err != nil {
			return g, fmt.Errorf("%s: skill %q not found: %w", where, jg.Skill, err)
		}
		if def.Legacy && !m.Legacy {
			*legacyRefs = append(*legacyRefs, "teaching "+def.Name)
		}
		g.Skill = def

	case GrantOfferQuest:
		if jg.Quest == "" {
			return g, fmt.Errorf("%s: offer_quest needs a quest id", where)
		}
		if jg.FromStage != "" || jg.ToStage != "" {
			return g, fmt.Errorf("%s: offer_quest carries no edge — the quest file's first stage is where an "+
				"accept lands, so drop fromStage/toStage", where)
		}
		g.Quest = jg.Quest

	case GrantAdvanceQuest:
		if jg.Quest == "" {
			return g, fmt.Errorf("%s: advance_quest needs a quest id", where)
		}
		if jg.FromStage == "" || jg.ToStage == "" {
			return g, fmt.Errorf("%s: advance_quest needs fromStage and toStage — the edge IS the row", where)
		}
		if jg.FromStage == jg.ToStage {
			return g, fmt.Errorf("%s: advance_quest edge %q → itself never progresses", where, jg.FromStage)
		}
		g.Quest, g.FromStage, g.ToStage = jg.Quest, jg.FromStage, jg.ToStage

	case GrantXP:
		if jg.XP == 0 {
			return g, fmt.Errorf("%s: grant_xp needs an xp amount", where)
		}
		if jg.Quest != "" || jg.FromStage != "" || jg.ToStage != "" {
			return g, fmt.Errorf("%s: grant_xp is a reward on a quest row, not a quest op — it takes no "+
				"quest/stage keys", where)
		}
		g.XP = jg.XP
	}
	return g, nil
}

// checkQuestRowShape enforces what makes an atomic turn-in row safe (§5, the
// PO's ruling): a quest-bearing option is ONE row whose grants are applied
// together, so the quest op must LEAD — applyGrant walks the option in authored
// order and abandons the row if the quest op is refused, which is the whole
// defence against a re-clicked turn-in paying out twice. A reward above the
// advance would already have been handed over by then.
func (m *mobDefinition) checkQuestRowShape(nodeID string, j int, opt *InteractionOption) error {
	where := fmt.Sprintf("mob %q: interaction node %q option %d", m.Name, nodeID, j)

	questGrants, xpGrants, questFirst := 0, 0, false
	for i := range opt.Grants {
		switch {
		case opt.Grants[i].Kind.IsQuestKind():
			questGrants++
			questFirst = questFirst || i == 0
		case opt.Grants[i].Kind == GrantXP:
			xpGrants++
		}
	}

	if questGrants > 1 {
		return fmt.Errorf("%s: one quest op per row — a row that advanced two quests at once could half-fail", where)
	}
	if questGrants == 1 && !questFirst {
		return fmt.Errorf("%s: the quest grant must come first, or its rewards are handed over before anything "+
			"checks whether the quest can advance at all", where)
	}
	// L10's authorable half: a grant_xp nobody gates is a row a player clicks
	// forever. (The other half — that the edge must END the quest, because
	// abandoning leaves the lifetime counters standing so objective stages
	// re-complete instantly — needs the stage graph, and lives in
	// quests.CrossValidate.)
	if xpGrants > 0 && questGrants == 0 {
		return fmt.Errorf("%s: grant_xp needs an advance_quest on the same row, or it is an XP faucet "+
			"(plan-quests.md L10)", where)
	}
	// A flat multi-grant option labels each row from its skill (D17); a bundle is
	// one row and has nothing to derive a label from.
	if questGrants == 1 && strings.TrimSpace(opt.Text) == "" {
		return fmt.Errorf("%s: a quest row needs an authored text — it renders as one row and has no skill "+
			"name to fall back on", where)
	}
	return nil
}

// checkSchemaRoom refuses D8/D10's reserved lists. The kinds are parsed first so
// a typo inside the reserved vocabulary reports as a typo; only a well-formed
// entry gets the "not implemented yet" answer. ⚑ Parsing and ignoring these
// instead would be the L-O failure from archive/plan-faction-flips.md: authored
// content that silently does nothing.
func (m *mobDefinition) checkSchemaRoom(nodeID string, j int, jo *jsonInteractionOption) error {
	where := fmt.Sprintf("mob %q: interaction node %q option %d", m.Name, nodeID, j)

	for i, jc := range jo.Costs {
		if _, ok := costKinds[jc.Kind]; !ok {
			return fmt.Errorf("%s cost %d: kind %q must be one of %s", where, i, jc.Kind, names(costKinds))
		}
		return fmt.Errorf("%s cost %d: costs are schema room only (plan-quests.md D8) — un-learning is unruled "+
			"(§9 question 1: slot eviction, combination ingredients, invested levels), so nothing may author one yet", where, i)
	}
	for i, jc := range jo.Consequences {
		if _, ok := consequenceKinds[jc.Kind]; !ok {
			return fmt.Errorf("%s consequence %d: kind %q must be one of %s", where, i, jc.Kind, names(consequenceKinds))
		}
		return fmt.Errorf("%s consequence %d: consequences are schema room only (plan-quests.md D10) — camps get "+
			"their own design session, so nothing may author one yet", where, i)
	}
	return nil
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
