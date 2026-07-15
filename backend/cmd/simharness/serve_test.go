package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/trichner/berryhunter/pkg/berryhunter/sim"
)

func postRun(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/run", strings.NewReader(body))
	w := httptest.NewRecorder()
	handleRun(w, req)
	return w
}

func TestHandleRun_RunsBatteryAndReturnsReport(t *testing.T) {
	w := postRun(t, `{
		"player": {"maxHealth": 100, "aura": {"damageHP": 10, "tickInterval": 3, "radius": 1.0, "maxTargets": 1}},
		"mob": {"maxHealth": 40, "speed": 0, "bodyRadius": 0.2, "aggroRadius": 2.4,
		        "aura": {"damageHP": 5, "tickInterval": 2, "radius": 1.0, "maxTargets": 1}},
		"runs": 5, "seed": 1, "distance": 0.3, "maxSeconds": 60
	}`)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var report sim.Report
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &report))
	require.Len(t, report.Results, 2)
	assert.Equal(t, "TTK", report.Results[0].Scenario.Name)
	assert.Equal(t, "TTD", report.Results[1].Scenario.Name)
	// The exact-cadence fixture (sim_test.go): TTK resolves in 12 ticks = 0.4 s
	// on every seeded run, and the raw values ride along for the histogram.
	ttk := report.Results[0].Distribution
	assert.Equal(t, 5, ttk.Samples)
	require.Len(t, ttk.Values, 5)
	assert.InDelta(t, 0.4, ttk.P50, 1e-9)
}

// The preset roster maps authored mobs onto MobSpecs — pinned against the
// embedded SaberToothCat (60 HP, aura 8 HP / 20 ticks / r1.0 at level 1).
func TestLoadMobPresets_EmbeddedContent(t *testing.T) {
	presets, err := loadMobPresets("")
	require.NoError(t, err)
	require.NotEmpty(t, presets)

	byName := map[string]sim.MobSpec{}
	for _, p := range presets {
		byName[p.Name] = p.Spec
	}
	cat, ok := byName["SaberToothCat"]
	require.True(t, ok, "embedded roster must contain SaberToothCat")
	assert.EqualValues(t, 60, cat.MaxHealth)
	assert.InDelta(t, 0.5, cat.Speed, 1e-6)
	assert.InDelta(t, 8, cat.Aura.DamageHP, 1e-6)
	assert.Equal(t, 20, cat.Aura.TickInterval)
	assert.InDelta(t, 1.0, cat.Aura.Radius, 1e-6)
}

func TestHandleMobs_ServesRoster(t *testing.T) {
	presets := []mobPreset{{Name: "SimMob", Spec: sim.MobSpec{MaxHealth: 40}}}
	req := httptest.NewRequest(http.MethodGet, "/mobs", nil)
	w := httptest.NewRecorder()
	handleMobs(presets)(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	var got []mobPreset
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &got))
	require.Len(t, got, 1)
	assert.Equal(t, "SimMob", got[0].Name)
	assert.EqualValues(t, 40, got[0].Spec.MaxHealth)
}

func TestHandleRun_RejectsBadInput(t *testing.T) {
	assert.Equal(t, http.StatusBadRequest, postRun(t, `{"runs": 0}`).Code, "runs below bounds")
	assert.Equal(t, http.StatusBadRequest, postRun(t, `{"runs": 999999, "maxSeconds": 60}`).Code, "runs above bounds")
	assert.Equal(t, http.StatusBadRequest, postRun(t, `not json`).Code, "malformed body")

	req := httptest.NewRequest(http.MethodGet, "/run", nil)
	w := httptest.NewRecorder()
	handleRun(w, req)
	assert.Equal(t, http.StatusMethodNotAllowed, w.Code, "GET is not a run")
}
