package constant

// Hardcoded constants
const (
	ViewPortWidth  = 20.0
	ViewPortHeight = 12.0
	TicksPerSecond = 30
	// StepMillis is the fixed dt handed to every ECS system, derived so it
	// cannot drift from the loop's real tick length (time.Second /
	// TicksPerSecond = 33.33 ms; a hand-written 33.0 restated the rounded
	// value, plan-code-health.md C3).
	StepMillis = 1000.0 / TicksPerSecond
)
