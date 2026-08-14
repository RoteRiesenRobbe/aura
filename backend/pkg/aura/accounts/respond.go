package accounts

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

// The machine-readable error codes. The client branches on THESE; the messages
// beside them are for the player and may be reworded freely. Pinned to
// api/shared-constants.json `apiErrorCodes` (shared_constants_pin_test.go here,
// SharedConstants.test.ts on the client).
//
// ⚑ Several distinct internal causes share one message on purpose — §5b's rule
// is that no response may reveal whether an account exists. codeInvalidLogin
// covers "no such username" and "wrong password" both, and that equalisation is
// worthless unless the timing matches too (auth.Gate.Verify).
const (
	codeRule              = "rule"                 // a validation rule failed; Message names which
	codeNameTaken         = "name_taken"           //
	codeUsernameTaken     = "username_taken"       // ⚑ the one accepted enumeration vector
	codeSlotsFull         = "slots_full"           //
	codeSlotTaken         = "slot_taken"           // a CHOSEN slot is occupied — not the cap
	codeInvalidLogin      = "invalid_credentials"  // "no such user" AND "wrong password"
	codeAlreadyLoggedIn   = "already_logged_in"    //
	codeAlreadyRegistered = "already_registered"   //
	codeCharacterPlaying  = "character_playing"    //
	codeNoIdentity        = "no_identity"          // nothing was presented
	codeSessionExpired    = "session_expired"      // something was presented and no longer resolves
	codeForbiddenOrigin   = "forbidden_origin"     //
	codeBadRequest        = "bad_request"          //
	codeBusy              = "busy"                 // the bcrypt gate was full — NOT a failed login
	codeDatabase          = "database_unavailable" //
	codeInternal          = "internal"             //
)

// The player-facing strings, verbatim from implementation.md §5b. They live as
// constants so the wordings that were reasoned about stay the wordings that
// ship — particularly the ambiguous ones, which look like sloppy error messages
// unless you know they are load-bearing.
const (
	msgInvalidLogin      = "Incorrect username or password."
	msgAlreadyLoggedIn   = "This account is already logged in."
	msgUsernameTaken     = "That username is already taken."
	msgNameTaken         = "That character name is taken."
	msgSlotsFull         = "All character slots are full."
	msgSlotTaken         = "That character slot is taken."
	msgAlreadyRegistered = "That account is already registered."
	msgCharacterPlaying  = "That character is in the world right now. Leave the world first."
	msgSignedOut         = "You are signed out. Please log in again."
	msgDatabase          = "Aura is having trouble reaching its database. Please try again in a moment."
	msgBusy              = "Aura is busy right now. Please try again in a moment."
	msgGeneric           = "Something went wrong. Please try again."
	msgBadRequest        = "That request could not be understood."
	msgForbiddenOrigin   = "That request came from an origin this server does not serve."
)

// errorBody is what a refused request returns.
//
// Ref is present only when something was logged — it is the correlation id from
// that log line, so a player quoting it in a bug report points an operator
// straight at the real cause behind a vague message.
type errorBody struct {
	Error string `json:"error"`
	Code  string `json:"code"`
	Ref   string `json:"ref,omitempty"`
}

// writeJSON sends a success payload.
func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if payload != nil {
		_ = json.NewEncoder(w).Encode(payload)
	}
}

// refuse answers with a player-facing message and a machine code, and logs
// nothing — for the refusals that ARE the explanation (a rule failed, a name is
// taken). Nothing here is a surprise to an operator.
func refuse(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, errorBody{Error: message, Code: code})
}

// fail answers with a message and logs the real cause behind it.
//
// ⚑ THIS IS THE COUNTERWEIGHT TO THE VAGUE MESSAGES, and §5b is explicit that it
// is not optional: the same design that stops an error confirming an account
// exists also blinds an operator during an incident, unless every ambiguous
// string has an unambiguous log line behind it. The correlation id is what ties
// the two together.
//
// ⚑ Never pass token or password material in cause, including truncated forms.
func fail(w http.ResponseWriter, r *http.Request, status int, code, message string, cause error, attrs ...slog.Attr) {
	ref := correlationID()
	args := []any{
		slog.String("ref", ref),
		slog.String("code", code),
		slog.String("path", r.URL.Path),
		slog.Any("err", cause),
	}
	for _, attr := range attrs {
		args = append(args, attr)
	}
	slog.Error("accounts request failed", args...)
	writeJSON(w, status, errorBody{Error: message, Code: code, Ref: ref})
}

// failStore answers an unexpected error from a store call, choosing between the
// two player-facing strings §5b offers for it.
//
// ⚑ The distinction is a HEURISTIC and only ever picks a sentence. "Aura is
// having trouble reaching its database" is honest and actionable when the
// database is down and misleading when the real cause is a bug, so it is worth
// getting right — but the log line carries the true cause either way, which is
// what an operator actually works from.
func failStore(w http.ResponseWriter, r *http.Request, cause error, what string) {
	if store.IsUnavailable(cause) {
		fail(w, r, http.StatusServiceUnavailable, codeDatabase, msgDatabase, cause, slog.String("while", what))
		return
	}
	fail(w, r, http.StatusInternalServerError, codeInternal, msgGeneric, cause, slog.String("while", what))
}

// correlationID is short on purpose: it is quoted by humans, into bug reports
// and chat messages, so it has to survive being read aloud and retyped.
func correlationID() string {
	buf := make([]byte, 4)
	if _, err := rand.Read(buf); err != nil {
		return "unknown"
	}
	return hex.EncodeToString(buf)
}
