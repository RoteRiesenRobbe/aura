package accounts

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

// characterView is one row of character-select.
//
// ⚑ Name, level and avatar are what a player needs to tell three characters
// apart at a glance, and all three already live on the row. "Last played" is
// deliberately absent: it would need a new column and a new write path
// (plan-accounts-frontend.md §4).
type characterView struct {
	ID         int64     `json:"id"`
	SlotIndex  int       `json:"slotIndex"`
	Name       string    `json:"name"`
	Avatar     string    `json:"avatar"`
	Faction    string    `json:"faction"`
	Level      int       `json:"level"`
	Experience int64     `json:"experience"`
	CreatedAt  time.Time `json:"createdAt"`
}

func viewOf(c store.Character) characterView {
	return characterView{
		ID:         c.ID,
		SlotIndex:  c.SlotIndex,
		Name:       c.Name,
		Avatar:     c.Avatar,
		Faction:    c.Faction,
		Level:      c.Level,
		Experience: c.Experience,
		CreatedAt:  c.CreatedAt,
	}
}

type createCharacterRequest struct {
	Name string `json:"name"`
}

type createCharacterResponse struct {
	Character characterView `json:"character"`
	// AnonymousSecret is present ONLY when this request minted a new account.
	//
	// ⚑ It is the raw secret, and this response is the only time it exists in a
	// readable form anywhere — the server stores its SHA-256 and nothing else, so
	// a client that drops it has permanently lost the account. It goes straight
	// to localStorage (plan-accounts-frontend.md §5.1).
	AnonymousSecret string `json:"anonymousSecret,omitempty"`
}

type listCharactersResponse struct {
	Characters         []characterView `json:"characters"`
	MaxAliveCharacters int             `json:"maxAliveCharacters"`
	// HasProgress answers §6's "is this anon account worth warning about" without
	// the client having to infer it. ⚑ Inferring it from the character list would
	// be right today and wrong the day sacrifice ships, because an account whose
	// only character was sacrificed still holds bloodline unlocks.
	HasProgress bool `json:"hasProgress"`
	// Registered tells the client whether to offer Logout and the registration
	// nag (plan-accounts-frontend.md §5.3, §5.4).
	Registered bool `json:"registered"`
	// Username is present only for a registered account, and is what the
	// settings panel shows as "Signed in as …".
	//
	// ⚑ It lives here because this is the ONE call the client makes to ask "who
	// am I". Without it the only other source is /session/refresh, which mints a
	// new token as a side effect — reading a name should not rotate a session.
	Username string `json:"username,omitempty"`
}

// handleCreateCharacter creates a character, minting an account behind it when
// the caller has no identity at all.
//
// ⚑ THE NO-IDENTITY BRANCH IS THE COMMON CASE, not an edge case. Anonymous-first
// means a player creates a character and plays with no signup, so this is the
// most frequent write in the product — and account, credentials and character
// all commit in ONE transaction, which is exactly what makes registering later
// cost no progress (and what makes a separate accounts database unworkable;
// plan-accounts-frontend.md §10a).
func (s *Server) handleCreateCharacter(w http.ResponseWriter, r *http.Request) {
	var body createCharacterRequest
	if !decodeBody(w, r, &body) {
		return
	}

	// Identity is OPTIONAL here and only here. errNoIdentity is the first-ever
	// visitor; anything else presented has to resolve or the request is refused,
	// because silently creating a second account for someone whose secret went
	// stale would strand the first one.
	who, err := s.resolveCaller(r.Context(), r)
	switch {
	case errors.Is(err, errNoIdentity):
		who = caller{}
	case errors.Is(err, errSessionStale):
		refuse(w, http.StatusUnauthorized, codeSessionExpired, msgSignedOut)
		return
	case err != nil:
		failStore(w, r, err, "resolving the caller's identity")
		return
	}

	// ⚑ The harness-prefix half of the rule lives in the second argument: a
	// character may carry hrnss_ only when the creating account's username does.
	// An anonymous caller passes "", which reads as "no username ⇒ no prefix" —
	// never as "unchecked".
	if err := auth.ValidateCharacterName(body.Name, who.username, s.cfg.AllowHarnessNames); err != nil {
		refuseRule(w, err)
		return
	}

	params := store.NewCharacter{
		AccountID: who.accountID,
		Name:      body.Name,
		Avatar:    s.cfg.DefaultAvatar,
		Faction:   s.cfg.DefaultFaction,
		MaxAlive:  s.cfg.MaxAliveCharacters,
	}
	// A secret is minted only on the branch that needs one — an existing account
	// already has its own, and generating one regardless would put a second
	// unusable secret in a variable next to the real account id.
	var rawSecret string
	if who.accountID == 0 {
		raw, key, secretErr := auth.NewAnonymousSecret()
		if secretErr != nil {
			fail(w, r, http.StatusInternalServerError, codeInternal, msgGeneric, secretErr)
			return
		}
		rawSecret, params.AnonymousSecretKey = raw, key
	}

	created, err := s.cfg.Store.CreateCharacter(r.Context(), params)
	switch {
	case errors.Is(err, store.ErrNameTaken):
		refuse(w, http.StatusConflict, codeNameTaken, msgNameTaken)
		return
	case errors.Is(err, store.ErrSlotsFull):
		// ⚑ Should be unreachable — the UI hides the create affordance at the cap —
		// so it is worth a log line as a bug signal rather than a silent 409.
		slog.Warn("character creation hit the slot cap; the UI should not have offered it",
			slog.Int64("account_id", who.accountID), slog.Int("max", s.cfg.MaxAliveCharacters))
		refuse(w, http.StatusConflict, codeSlotsFull, msgSlotsFull)
		return
	case err != nil:
		failStore(w, r, err, "creating a character")
		return
	}

	writeJSON(w, http.StatusCreated, createCharacterResponse{
		Character:       viewOf(created),
		AnonymousSecret: rawSecret,
	})
}

// handleListCharacters is character-select's data.
func (s *Server) handleListCharacters(w http.ResponseWriter, r *http.Request) {
	who, ok := s.requireCaller(w, r)
	if !ok {
		return
	}

	// ⚑ ALIVE ROWS ONLY, by design. Sacrificed and deleted characters are history
	// and belong to a graveyard view that does not exist and is not scheduled.
	characters, err := s.cfg.Store.AliveCharacters(r.Context(), who.accountID)
	if err != nil {
		failStore(w, r, err, "listing characters")
		return
	}
	hasProgress, err := s.cfg.Store.HasProgress(r.Context(), who.accountID)
	if err != nil {
		failStore(w, r, err, "checking an account for progress")
		return
	}

	views := make([]characterView, 0, len(characters))
	for _, c := range characters {
		views = append(views, viewOf(c))
	}
	writeJSON(w, http.StatusOK, listCharactersResponse{
		Characters:         views,
		MaxAliveCharacters: s.cfg.MaxAliveCharacters,
		HasProgress:        hasProgress,
		Registered:         who.registered(),
		Username:           who.username,
	})
}

// handleDeleteCharacter soft-deletes one of the caller's characters.
func (s *Server) handleDeleteCharacter(w http.ResponseWriter, r *http.Request) {
	who, ok := s.requireCaller(w, r)
	if !ok {
		return
	}
	characterID, ok := pathCharacterID(w, r)
	if !ok {
		return
	}

	// ⚑ Refuse while that character is in the world. Deleting the row under a
	// live session would leave the game holding a character that no longer exists
	// and whose name has already been released to someone else.
	if live, playing := s.cfg.Sessions.Live(who.accountID); playing && live.CharacterID == characterID {
		refuse(w, http.StatusConflict, codeCharacterPlaying, msgCharacterPlaying)
		return
	}

	// Ownership is part of the UPDATE's WHERE clause, so "not yours" and "no such
	// id" are the same answer — ids are BIGSERIAL and guessable.
	err := s.cfg.Store.SoftDeleteCharacter(r.Context(), who.accountID, characterID)
	if errors.Is(err, store.ErrNoCharacter) {
		refuse(w, http.StatusNotFound, codeBadRequest, msgBadRequest)
		return
	}
	if err != nil {
		failStore(w, r, err, "deleting a character")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

type selectCharacterResponse struct {
	CharacterID int64 `json:"characterId"`
	// Ticket is the play ticket, opaque to everything outside package auth. The
	// client presents it on the WS Join and nothing else; it parses nothing out
	// of it, and neither does anything here.
	Ticket string `json:"ticket"`
	// TicketTTLSeconds lets the client decide when a retry is pointless without
	// hardcoding the server's number.
	TicketTTLSeconds int `json:"ticketTtlSeconds"`
}

// handleSelectCharacter proves ownership and mints the play ticket.
//
// ⚑ THIS IS WHERE OWNERSHIP IS CHECKED — over authenticated HTTP, where the
// cookie unambiguously applies — and it is the only place a ticket is minted.
// The socket then carries no identity of its own: the character id comes OUT of
// the ticket, so a client cannot present a ticket for one character and ask to
// play another. There is nowhere to say which one (implementation.md §7b).
func (s *Server) handleSelectCharacter(w http.ResponseWriter, r *http.Request) {
	who, ok := s.requireCaller(w, r)
	if !ok {
		return
	}
	characterID, ok := pathCharacterID(w, r)
	if !ok {
		return
	}

	// ⚑ A COURTESY CHECK, and it must stay one. Its job is telling a player here
	// rather than after character-select appears to have succeeded. It cannot be
	// authoritative: two tabs can call this simultaneously, both pass, and both
	// receive valid tickets — a mint-time check cannot be atomic with a session
	// that does not exist yet. `Join` claims the account slot atomically, and
	// chunk 3 owns that claim (implementation.md §5).
	//
	// ⚑ CONNECTED, not Live. A stashed session still holds the account's slot,
	// but it is a player whose socket dropped — and the reconnect path needs a
	// ticket to prove who it is (plan-accounts-frontend.md §10b, PO 2026-08-01).
	// Refusing on Live() here would make "refresh the page mid-fight" fail for
	// the full 10-minute stash window, which is the one scenario the reconnect
	// feature exists for.
	if _, playing := s.cfg.Sessions.Connected(who.accountID); playing {
		refuse(w, http.StatusConflict, codeAlreadyLoggedIn, msgAlreadyLoggedIn)
		return
	}

	character, err := s.cfg.Store.AliveCharacter(r.Context(), who.accountID, characterID)
	if errors.Is(err, store.ErrNoCharacter) {
		refuse(w, http.StatusNotFound, codeBadRequest, msgBadRequest)
		return
	}
	if err != nil {
		failStore(w, r, err, "reading a character for selection")
		return
	}

	// ⚑ The character's identity rides the ticket so the game loop never reads
	// the database to answer a Join — this row has just been read to prove
	// ownership, and reading it again inside the single-goroutine tick would
	// stall every player. See auth.Ticket.
	ticket, err := s.cfg.Tickets.Mint(auth.Ticket{
		AccountID:   who.accountID,
		CharacterID: character.ID,
		Name:        character.Name,
		Avatar:      character.Avatar,
		Faction:     character.Faction,
	})
	if err != nil {
		fail(w, r, http.StatusInternalServerError, codeInternal, msgGeneric, err)
		return
	}
	writeJSON(w, http.StatusOK, selectCharacterResponse{
		CharacterID:      character.ID,
		Ticket:           ticket,
		TicketTTLSeconds: int(auth.TicketTTL.Seconds()),
	})
}

// pathCharacterID reads {id} out of the route pattern.
func pathCharacterID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		refuse(w, http.StatusBadRequest, codeBadRequest, msgBadRequest)
		return 0, false
	}
	return id, true
}

// decodeBody reads a JSON body, refusing anything malformed or oversized.
//
// ⚑ DisallowUnknownFields is deliberately NOT set. A conf file gaining a stray
// key is drift worth warning about; a browser sending a field a newer client
// added is an ordinary version skew, and failing it would make every frontend
// deploy have to precede its backend exactly.
func decodeBody(w http.ResponseWriter, r *http.Request, into any) bool {
	if err := json.NewDecoder(r.Body).Decode(into); err != nil {
		refuse(w, http.StatusBadRequest, codeBadRequest, msgBadRequest)
		return false
	}
	return true
}

// refuseRule answers a validation failure.
//
// ⚑ ONLY an *auth.RuleError may be shown to a player verbatim. That type exists
// to make the distinction visible at exactly this call site: its Message is a
// vetted sentence naming the one rule that failed, while any other error is an
// internal cause that must be logged and replaced with an apology. Falling
// through to err.Error() here is how an internal message reaches a player.
func refuseRule(w http.ResponseWriter, err error) {
	var rule *auth.RuleError
	if errors.As(err, &rule) {
		refuse(w, http.StatusBadRequest, codeRule, rule.Message)
		return
	}
	refuse(w, http.StatusBadRequest, codeBadRequest, msgBadRequest)
}
