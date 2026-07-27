package model

// The personalised conversation tree (plan-entity-model.md chunk 3b-ii, D16).
//
// While a player has a panel open, GameState carries the WHOLE tree for the
// actor they are talking to: every node whose conditions pass, every row marked
// available or locked, with already-known ones omitted. The client then walks it
// instantly with a local back-stack, and only *taking* a row goes back to the
// server — where it is validated on its own merits, never on the path taken to
// reach it. That is what keeps server-side session state down to two fields with
// no node bookkeeping.
//
// ⚑ These types live in model rather than beside the evaluator in sys/ because
// codec has to marshal them and sys already imports codec — a sys-local tree
// would be unmarshalable. They are transport shapes only: no behaviour, and
// nothing reads them but the marshaller.

// ConversationNoGrant is the GrantIndex of a row that only navigates. It is the
// wire default too (ConversationOption.grant_index = 255), so "this row hands
// over nothing" needs no separate flag.
const ConversationNoGrant uint8 = 255

// Conversation is one actor's tree as it looks to one player right now.
// Recomputed every tick while the panel is open, so a row flips to known the
// tick after the grant lands.
type Conversation struct {
	EntityID uint64
	// ActorName is the definition's display name. The panel header carries it,
	// which is why NPCs still need no nameplate (they stay gated off by
	// experience: 0).
	ActorName string
	// EntryNode is where the panel opens: the first node whose conditions pass,
	// so a conditional greeting still works.
	EntryNode string
	Nodes     []ConversationNode
}

// ConversationNode is one screen of the panel: what the actor says, plus the
// rows the player can pick. A node with no options is a leaf reply (a hint, a
// sign-post) and renders as lines plus Back/Leave.
type ConversationNode struct {
	ID      string
	Lines   []string
	Options []ConversationOption
}

// ConversationOption is one row — the only interactive element in the whole
// panel (D15). Branch or grant, it is the same row.
type ConversationOption struct {
	// ⚑ OptionIndex and GrantIndex are the AUTHORED indices into the definition,
	// never this row's position in the presentation (L21). present() omits
	// already-known rows and condition-failed nodes, so the panel's third row
	// can be the definition's fifth option — and a client echoing its own
	// position back would teach the wrong skill, misfiring only AFTER the player
	// has already learned something.
	OptionIndex uint8
	// GrantIndex is ConversationNoGrant for a row that only navigates.
	GrantIndex uint8
	// Text is the resolved label: the authored option text, else the granted
	// skill's display name.
	Text string
	// Next is the node to continue at; empty = this row only grants.
	Next string
	// Locked rows are shown greyed with the wall named (D20) — each NPC is a
	// signpost for progression and a reason to come back. Already-KNOWN rows are
	// omitted entirely rather than locked.
	Locked        bool
	RequiredLevel uint8
	// Reply is what the actor says when this row is taken: the grant's line, or
	// the option's blockedLine while locked. ⚑ Carried in the tree so the panel
	// answers on click with no round-trip, which makes it optimistic by design
	// (L24) — correct only because the row's state was computed by the same
	// server from the same spellbook, and nothing but this player's own action
	// changes it.
	Reply string
}
