package skills

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
)

// catalogTestFS is a minimal registry: an aura with defaulted damage tags and
// a derived display name, a cooldown with an authored displayName override,
// and a passive. IDs are deliberately out of file order to pin the sort.
var catalogTestFS = fstest.MapFS{
	"nova_burst.json": &fstest.MapFile{Data: []byte(`{
		"id": 20,
		"name": "NovaBurst",
		"category": "cooldown",
		"maxLevel": 3,
		"cooldownTicks": 300,
		"cooldownTicksPerLevel": -30,
		"effects": [{
			"type": "instant_damage",
			"radius": 2.0,
			"damageHP": 10,
			"damageHPPerLevel": 2,
			"targetsEnemies": true
		}]
	}`)},
	"long_range_strike.json": &fstest.MapFile{Data: []byte(`{
		"id": 45,
		"name": "LongRangeStrike",
		"displayName": "Long-Range Strike",
		"category": "active_aura",
		"maxLevel": 5,
		"effects": [{
			"type": "damage_aura",
			"radius": 3.0,
			"damageHP": 4,
			"targetsEnemies": true,
			"maxTargets": 1
		}]
	}`)},
	"swift.json": &fstest.MapFile{Data: []byte(`{
		"id": 10,
		"name": "Swift",
		"category": "passive",
		"maxLevel": 3,
		"effects": [{
			"type": "stat_multiplier",
			"stat": "movementSpeed",
			"statBonus": 0.1,
			"statBonusPerLevel": 0.05
		}]
	}`)},
}

func catalogTestRegistry(t *testing.T) Registry {
	t.Helper()
	r, err := RegistryFromFS(catalogTestFS)
	if err != nil {
		t.Fatalf("RegistryFromFS: %v", err)
	}
	return r
}

// catalogTestCurve is deliberately NOT curve.Default() — the payload has to
// prove it carries the *configured* curve, and identical numbers could not
// tell the two apart.
var catalogTestCurve = curve.Curve{Growth: 1.5, MaxLevel: 12}

// catalogEntry mirrors the catalog JSON shape as loose maps — the test reads
// it the way the client does, so it pins the wire names, not Go internals.
type catalogEntry map[string]any

// decodeCatalog unwraps the {curve, skills} envelope and returns the skill
// list; decodeEnvelope is for the tests that care about the curve half.
func decodeCatalog(t *testing.T, data []byte) []catalogEntry {
	t.Helper()
	return decodeEnvelope(t, data).Skills
}

type catalogEnvelope struct {
	Curve  map[string]any `json:"curve"`
	Skills []catalogEntry `json:"skills"`
}

func decodeEnvelope(t *testing.T, data []byte) catalogEnvelope {
	t.Helper()
	var envelope catalogEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		t.Fatalf("catalog JSON does not decode: %v", err)
	}
	return envelope
}

func (e catalogEntry) effects(t *testing.T) []map[string]any {
	t.Helper()
	raw, ok := e["effects"].([]any)
	if !ok {
		t.Fatalf("entry %v: effects missing or not a list", e["name"])
	}
	effects := make([]map[string]any, len(raw))
	for i, r := range raw {
		effects[i] = r.(map[string]any)
	}
	return effects
}

func TestCatalogJSON_SortedAndComplete(t *testing.T) {
	data, err := CatalogJSON(catalogTestRegistry(t), catalogTestCurve)
	if err != nil {
		t.Fatalf("CatalogJSON: %v", err)
	}
	entries := decodeCatalog(t, data)

	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(entries))
	}
	// Sorted by ID regardless of file order.
	wantIDs := []float64{10, 20, 45}
	for i, want := range wantIDs {
		if got := entries[i]["id"]; got != want {
			t.Errorf("entry %d: id = %v, want %v", i, got, want)
		}
	}
}

func TestCatalogJSON_DisplayNames(t *testing.T) {
	data, err := CatalogJSON(catalogTestRegistry(t), catalogTestCurve)
	if err != nil {
		t.Fatalf("CatalogJSON: %v", err)
	}
	entries := decodeCatalog(t, data)

	// Derived: CamelCase → spaces.
	if got := entries[1]["displayName"]; got != "Nova Burst" {
		t.Errorf("NovaBurst displayName = %v, want %q", got, "Nova Burst")
	}
	// Single word stays as-is.
	if got := entries[0]["displayName"]; got != "Swift" {
		t.Errorf("Swift displayName = %v, want %q", got, "Swift")
	}
	// Authored override wins over derivation.
	if got := entries[2]["displayName"]; got != "Long-Range Strike" {
		t.Errorf("LongRangeStrike displayName = %v, want %q", got, "Long-Range Strike")
	}
}

func TestCatalogJSON_FieldsAndDefaults(t *testing.T) {
	data, err := CatalogJSON(catalogTestRegistry(t), catalogTestCurve)
	if err != nil {
		t.Fatalf("CatalogJSON: %v", err)
	}
	entries := decodeCatalog(t, data)

	nova := entries[1]
	if got := nova["category"]; got != "cooldown" {
		t.Errorf("category = %v, want %q", got, "cooldown")
	}
	if got := nova["maxLevel"]; got != float64(3) {
		t.Errorf("maxLevel = %v, want 3", got)
	}
	if got := nova["cooldownTicks"]; got != float64(300) {
		t.Errorf("cooldownTicks = %v, want 300", got)
	}
	if got := nova["cooldownTicksPerLevel"]; got != float64(-30) {
		t.Errorf("cooldownTicksPerLevel = %v, want -30", got)
	}

	effect := nova.effects(t)[0]
	if got := effect["type"]; got != "instant_damage" {
		t.Errorf("effect type = %v, want %q", got, "instant_damage")
	}
	if got := effect["radius"]; got != float64(2) {
		t.Errorf("radius = %v, want 2", got)
	}
	if got := effect["targetsEnemies"]; got != true {
		t.Errorf("targetsEnemies = %v, want true", got)
	}

	// Parsing defaults must survive into the catalog: absent damageTags →
	// [physical] — the whole point of serving the PARSED registry.
	damage, ok := effect["damage"].(map[string]any)
	if !ok {
		t.Fatalf("damage payload missing on instant_damage effect")
	}
	if got := damage["hp"]; got != float64(10) {
		t.Errorf("damage hp = %v, want 10", got)
	}
	tags, ok := damage["tags"].([]any)
	if !ok || len(tags) != 1 || tags[0] != "physical" {
		t.Errorf("damage tags = %v, want [physical]", damage["tags"])
	}

	// Other payloads stay absent — one payload per effect, not 14 nulls.
	if _, present := effect["heal"]; present {
		t.Errorf("nil heal payload should be omitted from the JSON")
	}

	// The passive's stat payload with its enum-free fields.
	stat, ok := entries[0].effects(t)[0]["stat"].(map[string]any)
	if !ok {
		t.Fatalf("stat payload missing on stat_multiplier effect")
	}
	if got := stat["name"]; got != "movementSpeed" {
		t.Errorf("stat name = %v, want movementSpeed", got)
	}

	// Selector serializes as a string on a capped effect.
	strike := entries[2].effects(t)[0]
	if got := strike["selector"]; got != "nearest" {
		t.Errorf("selector = %v, want %q", got, "nearest")
	}
}

// The curve half exists so the client can render what a heal/hit ACTUALLY
// lands for at the player's character level (round-4 tooltip fix): the
// tooltip's own model only ever knew the skill-level axis. It must be the
// CONFIGURED curve, not curve.Default() — a server booted on a retuned
// levelGrowth would otherwise ship tooltips that lie by the difference.
func TestCatalogJSON_CarriesTheConfiguredCurve(t *testing.T) {
	data, err := CatalogJSON(catalogTestRegistry(t), catalogTestCurve)
	if err != nil {
		t.Fatalf("CatalogJSON: %v", err)
	}
	envelope := decodeEnvelope(t, data)

	if envelope.Curve == nil {
		t.Fatalf("payload carries no curve: %s", data)
	}
	if got := envelope.Curve["growth"]; got != 1.5 {
		t.Errorf("curve growth = %v, want 1.5 (the configured value, not the default)", got)
	}
	if got := envelope.Curve["maxLevel"]; got != float64(12) {
		t.Errorf("curve maxLevel = %v, want 12", got)
	}
	// The skills half must survive the reshape unchanged — it is the same
	// list, one level deeper.
	if len(envelope.Skills) != 3 {
		t.Errorf("skills = %d entries, want 3", len(envelope.Skills))
	}
}

func TestCatalogHandler(t *testing.T) {
	handler, err := CatalogHandler(catalogTestRegistry(t), catalogTestCurve)
	if err != nil {
		t.Fatalf("CatalogHandler: %v", err)
	}

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest("GET", "/skills", nil))

	if rec.Code != 200 {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", got)
	}
	// Dev serves the client from :2001 against aurad on :2000 — the catalog
	// is public read-only content, so a wildcard origin is fine.
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("Access-Control-Allow-Origin = %q, want *", got)
	}
	entries := decodeCatalog(t, rec.Body.Bytes())
	if len(entries) != 3 {
		t.Errorf("handler served %d entries, want 3", len(entries))
	}
}
