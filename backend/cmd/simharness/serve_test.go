package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/sim"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
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
	presets, _, err := loadPresets("")
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

// Player-aura presets (content pass C5, §A "never a surprise"): every
// player-authored skill (id < 100 — mob skills number from 101) carrying a
// damage_aura maps onto AuraSpecs at L1 and max level. Pinned against the
// Vanguard (14 HP at L1, tick 40, r1.2, 2 targets) and Damage.
//
// ⚑ The max-level leg resolves the cap and the slope FROM the registry rather
// than restating them: `maxLevel` is authored per skill from the {1, 5, 10}
// vocabulary and moves with a balance pass (plan-numbers-rewrite C2a took
// Vanguard 5 → 10), so a hardcoded "Vanguard L5" pins the cap of the day
// instead of the derivation rule this test exists to check.
func TestLoadPlayerAuraPresets_EmbeddedContent(t *testing.T) {
	_, sr, err := loadContent("")
	require.NoError(t, err)
	vanguard, err := sr.GetByName("Vanguard")
	require.NoError(t, err)

	_, presets, err := loadPresets("")
	require.NoError(t, err)
	require.NotEmpty(t, presets)

	byName := map[string]sim.AuraSpec{}
	for _, p := range presets {
		byName[p.Name] = p.Spec
	}

	v1, ok := byName["Vanguard L1"]
	require.True(t, ok, "roster must contain the Vanguard at L1")
	assert.InDelta(t, 14, v1.DamageHP, 1e-6)
	assert.Equal(t, 40, v1.TickInterval)
	assert.InDelta(t, 1.2, v1.Radius, 1e-6)
	assert.Equal(t, 2, v1.MaxTargets)

	vMax, ok := byName[fmt.Sprintf("Vanguard L%d", vanguard.MaxLevel)]
	require.True(t, ok, "roster must contain the Vanguard at max level")
	direct := vanguard.Effects[0].Damage
	require.NotNil(t, direct, "Vanguard's first effect is the damage payload")
	assert.InDelta(t, skills.Scaled(direct.HP, direct.HPPerLevel, vanguard.MaxLevel),
		vMax.DamageHP, 1e-6)

	_, ok = byName["Damage L1"]
	assert.True(t, ok, "plain damage skills derive too")

	for name := range byName {
		assert.NotContains(t, name, "KoboldVolley", "mob skills (id >= 100) stay out of the player dropdown")
	}
}

// dot_aura content derives into presets (C8 full-roster pass): a dot-only
// mob must NOT read as a harmless turret. BanditPyromancer's EmberAura
// (7.5 HP ×1.7623 power scale at cL6, 3 events every 40 ticks, applied on a
// 50-tick aura cadence, r3) and VenomSpider's VenomSpit (5 HP ×1.4049 at
// cL4, 4 events every 45 ticks) are the pins. EmberAura went 6 → 7.5 with the
// playtest-1 Pass A Z2 damage pass (×1.25, PO 2026-07-22).
func TestLoadMobPresets_DotAuraMobsDerive(t *testing.T) {
	presets, _, err := loadPresets("")
	require.NoError(t, err)

	byName := map[string]sim.MobSpec{}
	for _, p := range presets {
		byName[p.Name] = p.Spec
	}

	pyro, ok := byName["BanditPyromancer"]
	require.True(t, ok, "roster must contain BanditPyromancer")
	assert.InDelta(t, 7.5*1.7623417, pyro.Aura.DamageHP, 1e-3)
	assert.Equal(t, 3, pyro.Aura.DotTicks)
	assert.Equal(t, 40, pyro.Aura.DotTickInterval)
	assert.Equal(t, 50, pyro.Aura.TickInterval)
	assert.InDelta(t, 3.0, pyro.Aura.Radius, 1e-6)

	spider, ok := byName["VenomSpider"]
	require.True(t, ok, "roster must contain VenomSpider")
	assert.InDelta(t, 5*1.404928, spider.Aura.DamageHP, 1e-3)
	assert.Equal(t, 4, spider.Aura.DotTicks)
	assert.Equal(t, 45, spider.Aura.DotTickInterval)
}

// Player dot skills join the roster too — Immolate and the Wildfire
// combo capstone were invisible to the balance pass before. Pinned against
// Immolate (dot 10.5 HP +2.1/lvl after the crit-rework-v2 dot
// compensation, 3 events every 60 ticks, aura tick 20 after the 2026-07-21
// dot-responsiveness halving).
func TestLoadPlayerAuraPresets_DotSkillsDerive(t *testing.T) {
	_, presets, err := loadPresets("")
	require.NoError(t, err)

	byName := map[string]sim.AuraSpec{}
	for _, p := range presets {
		byName[p.Name] = p.Spec
	}

	imm, ok := byName["Immolate L1"]
	require.True(t, ok, "roster must contain Immolate at L1")
	assert.InDelta(t, 10.5, imm.DamageHP, 1e-6)
	assert.Equal(t, 3, imm.DotTicks)
	// ⚑ The 20-tick application cadence against a 60-tick dot cadence is
	// deliberate and SURVIVED the cost pass: C2c briefly moved it to 60 (three
	// applications per dot event means the caster is charged three times per hit
	// landed), then measured that the change cost real damage in short fights —
	// a 2 s delay to the first tick against a ~5 s kill — and reverted it,
	// pricing the effect at a third instead. The 2026-07-21 dot-responsiveness
	// halving stands.
	assert.Equal(t, 60, imm.DotTickInterval)
	assert.Equal(t, 20, imm.TickInterval)

	_, ok = byName["Wildfire L1"]
	assert.True(t, ok, "the Wildfire combo capstone derives too")
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

func postCurve(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/curve", strings.NewReader(body))
	w := httptest.NewRecorder()
	handleCurve(w, req)
	return w
}

// The chunk-2 endpoint: a CurveConfig in, the full curve report out — level
// sweep, gap band and triple table in one response.
func TestHandleCurve_RunsCurveBattery(t *testing.T) {
	w := postCurve(t, `{
		"fixture": {
			"curve": {"growth": 1.3, "maxLevel": 4},
			"player": {"maxHealth": 100, "aura": {"damageHP": 10, "tickInterval": 3, "radius": 1.0, "maxTargets": 1}},
			"mob": {"maxHealth": 40, "speed": 0, "bodyRadius": 0.2, "aggroRadius": 2.4,
			        "aura": {"damageHP": 5, "tickInterval": 2, "radius": 1.0, "maxTargets": 1}},
			"xp": {"levelUpBase": 300, "levelUpGrowth": 1.2, "killBase": 40, "killGrowth": 1.2}
		},
		"baseSeed": 1, "runs": 3, "distance": 0.3, "refLevel": 2, "maxDelta": 1,
		"growthCandidates": [1.3], "maxLevelCandidates": [4]
	}`)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var report sim.CurveReport
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &report))
	require.Len(t, report.Levels, 4)
	require.Len(t, report.Gaps, 3, "Δ = -1..+1")
	require.Len(t, report.Triple, 1)
	assert.Equal(t, 2, report.RefLevel)
	assert.Equal(t, 3, report.Levels[0].TTK.Runs)
}

func TestHandleCurve_RejectsBadInput(t *testing.T) {
	assert.Equal(t, http.StatusBadRequest, postCurve(t, `{"runs": 0}`).Code, "runs below bounds")
	assert.Equal(t, http.StatusBadRequest, postCurve(t,
		`{"fixture": {"curve": {"growth": 1.1, "maxLevel": 0}}, "runs": 5}`).Code, "level span missing")
	assert.Equal(t, http.StatusBadRequest, postCurve(t,
		`{"fixture": {"curve": {"growth": 1.1, "maxLevel": 60}}, "runs": 2000, "maxDelta": 12}`).Code, "fight budget exceeded")
	assert.Equal(t, http.StatusBadRequest, postCurve(t, `not json`).Code, "malformed body")

	req := httptest.NewRequest(http.MethodGet, "/curve", nil)
	w := httptest.NewRecorder()
	handleCurve(w, req)
	assert.Equal(t, http.StatusMethodNotAllowed, w.Code, "GET is not a run")
}

func postMatrix(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/matrix", strings.NewReader(body))
	w := httptest.NewRecorder()
	handleMatrix(w, req)
	return w
}

// The chunk-3 endpoint: a MatrixConfig in, the build × pack-size report out.
// Exact-cadence fixture: the capped player clears pack 1 on tick 12 (0.4 s)
// and pack 2 sequentially on tick 24 (0.8 s), surviving both — no overwhelm.
func TestHandleMatrix_RunsMatrix(t *testing.T) {
	w := postMatrix(t, `{
		"player": {"maxHealth": 100, "aura": {"damageHP": 10, "tickInterval": 3, "radius": 1.0, "maxTargets": 1}},
		"mob": {"maxHealth": 40, "speed": 0, "bodyRadius": 0.2, "aggroRadius": 2.4,
		        "aura": {"damageHP": 5, "tickInterval": 2, "radius": 1.0, "maxTargets": 1}},
		"maxTargetsCandidates": [1], "maxPackSize": 2,
		"baseSeed": 1, "runs": 3, "distance": 0.3
	}`)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var report sim.MatrixReport
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &report))
	require.Len(t, report.Rows, 1)
	row := report.Rows[0]
	assert.Equal(t, 1, row.MaxTargets)
	assert.Equal(t, -1, row.OverwhelmPack)
	require.Len(t, row.Cells, 2)
	assert.Equal(t, 1.0, row.Cells[0].WinRate)
	assert.InDelta(t, 0.4, row.Cells[0].ClearTime.P50, 1e-9)
	assert.Equal(t, 1.0, row.Cells[1].WinRate)
	assert.InDelta(t, 0.8, row.Cells[1].ClearTime.P50, 1e-9)
}

func TestHandleMatrix_RejectsBadInput(t *testing.T) {
	assert.Equal(t, http.StatusBadRequest, postMatrix(t,
		`{"maxTargetsCandidates": [1], "maxPackSize": 2, "runs": 0}`).Code, "runs below bounds")
	assert.Equal(t, http.StatusBadRequest, postMatrix(t,
		`{"maxTargetsCandidates": [1], "maxPackSize": 0, "runs": 3}`).Code, "pack size below bounds")
	assert.Equal(t, http.StatusBadRequest, postMatrix(t,
		`{"maxTargetsCandidates": [], "maxPackSize": 2, "runs": 3}`).Code, "no build candidates")
	assert.Equal(t, http.StatusBadRequest, postMatrix(t,
		`{"maxTargetsCandidates": [-1], "maxPackSize": 2, "runs": 3}`).Code, "negative candidate")
	assert.Equal(t, http.StatusBadRequest, postMatrix(t,
		`{"maxTargetsCandidates": [1,2,3,0], "maxPackSize": 12, "runs": 2000}`).Code, "fight budget exceeded")
	assert.Equal(t, http.StatusBadRequest, postMatrix(t, `not json`).Code, "malformed body")

	req := httptest.NewRequest(http.MethodGet, "/matrix", nil)
	w := httptest.NewRecorder()
	handleMatrix(w, req)
	assert.Equal(t, http.StatusMethodNotAllowed, w.Code, "GET is not a run")
}

func postChain(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/chain", strings.NewReader(body))
	w := httptest.NewRecorder()
	handleChain(w, req)
	return w
}

// The chunk-4 endpoint: a ChainConfig in, the facetank-vs-kite chain report
// out. Exact-cadence fixture (the chain_test.go pin): both stances survive,
// the kite bot pays no recovery, efficiency lands strictly inside (0, 1).
func TestHandleChain_RunsChainBattery(t *testing.T) {
	w := postChain(t, `{
		"player": {"maxHealth": 128, "aura": {"damageHP": 10, "tickInterval": 3, "radius": 2.0, "maxTargets": 1}},
		"mob": {"maxHealth": 40, "speed": 0, "bodyRadius": 0.2, "aggroRadius": 2.4,
		        "aura": {"damageHP": 16, "tickInterval": 5, "radius": 1.0, "maxTargets": 1}},
		"chainFights": 3, "downtimeSeconds": 10, "regenTick": 0.03125,
		"baseSeed": 1, "runs": 2
	}`)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var report sim.ChainReport
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &report))
	require.Len(t, report.Rows, 1)
	row := report.Rows[0]
	assert.Equal(t, 1.0, row.Facetank.SurviveRate)
	assert.True(t, row.Kite.Feasible)
	assert.Zero(t, row.Kite.MeanRecoverySeconds)
	assert.Greater(t, row.Efficiency, 0.0)
	assert.Less(t, row.Efficiency, 1.0)
}

func TestHandleChain_RejectsBadInput(t *testing.T) {
	assert.Equal(t, http.StatusBadRequest, postChain(t,
		`{"chainFights": 3, "runs": 0}`).Code, "runs below bounds")
	assert.Equal(t, http.StatusBadRequest, postChain(t,
		`{"chainFights": 0, "runs": 3}`).Code, "chainFights below bounds")
	assert.Equal(t, http.StatusBadRequest, postChain(t,
		`{"chainFights": 100, "runs": 1000}`).Code, "cycle budget exceeded")
	assert.Equal(t, http.StatusBadRequest, postChain(t,
		`{"chainFights": 3, "runs": 3, "levels": [1,2], "curve": {"growth": 0}}`).Code, "brackets without a curve")
	assert.Equal(t, http.StatusBadRequest, postChain(t,
		`{"chainFights": 3, "runs": 3, "regenTick": 2}`).Code, "regenTick above bounds")
	assert.Equal(t, http.StatusBadRequest, postChain(t, `not json`).Code, "malformed body")

	req := httptest.NewRequest(http.MethodGet, "/chain", nil)
	w := httptest.NewRecorder()
	handleChain(w, req)
	assert.Equal(t, http.StatusMethodNotAllowed, w.Code, "GET is not a run")
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
