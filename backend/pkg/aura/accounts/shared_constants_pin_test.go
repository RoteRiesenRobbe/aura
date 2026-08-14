package accounts

// plan-code-health.md C4 (research-code-quality §11.3 F3): the refusal codes
// are verbatim string twins of the client's API_ERROR_CODES (AccountsApi.ts),
// which branches UI flow on them; a renamed code degrades every client branch
// to the generic error path with nothing failing. The codes are unexported by
// design, so unlike the other shared-constants pins this one lives in-package
// (the same reason model/mob's conf pin does). The client half is
// SharedConstants.test.ts; both assert set equality against
// api/shared-constants.json `apiErrorCodes`.

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestApiErrorCodes_MatchSharedConstants(t *testing.T) {
	raw, err := os.ReadFile("../../../../api/shared-constants.json")
	require.NoError(t, err)
	var fixture struct {
		ApiErrorCodes []string `json:"apiErrorCodes"`
	}
	require.NoError(t, json.Unmarshal(raw, &fixture))
	require.NotEmpty(t, fixture.ApiErrorCodes, "the fixture must carry an apiErrorCodes list")

	// Spelled out because Go constants cannot be enumerated by reflection
	// (the shared_constants_test.go convention): a NEW code needs a fixture
	// entry, this list, and the client list touched together.
	assert.ElementsMatch(t, []string{
		codeRule,
		codeNameTaken,
		codeUsernameTaken,
		codeSlotsFull,
		codeSlotTaken,
		codeInvalidLogin,
		codeAlreadyLoggedIn,
		codeAlreadyRegistered,
		codeCharacterPlaying,
		codeNoIdentity,
		codeSessionExpired,
		codeForbiddenOrigin,
		codeBadRequest,
		codeBusy,
		codeDatabase,
		codeInternal,
	}, fixture.ApiErrorCodes,
		"accounts' refusal codes have drifted from api/shared-constants.json — the client branches UI flow on these strings")
}
