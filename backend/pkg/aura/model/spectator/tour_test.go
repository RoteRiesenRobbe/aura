package spectator

import (
	"math"
	"math/rand"
	"os"
	"regexp"
	"strconv"
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const stepMillis = 33

func dist(a, b phy.Vec2f) float64 {
	return math.Hypot(float64(a.X-b.X), float64(a.Y-b.Y))
}

// The world zone's shape: 144 × 72 at the origin, spawns right up to the wall.
func worldPlan() *TourPlan {
	return NewTourPlan(phy.Vec2f{}, 144, 72, []phy.Vec2f{
		{X: -70, Y: -35}, {X: 70, Y: 35}, {X: 0, Y: 0}, {X: 60, Y: -30},
	})
}

func TestTour_StaysInsideTheInsetAndNeverOutrunsItsSpeed(t *testing.T) {
	tour := worldPlan().NewTour(rand.New(rand.NewSource(1)))
	maxX := float64(144/2 - constant.ViewPortWidth/2*TourViewportScale)
	maxY := float64(72/2 - constant.ViewPortHeight/2*TourViewportScale)
	maxStep := TourSpeed * stepMillis / 1000.0

	prev := tour.Position()
	jumps := 0
	for i := 0; i < 30*120; i++ { // two minutes
		pos := tour.Advance(stepMillis)
		assert.LessOrEqual(t, math.Abs(float64(pos.X)), maxX+1e-3)
		assert.LessOrEqual(t, math.Abs(float64(pos.Y)), maxY+1e-3)
		if d := dist(prev, pos); d > maxStep+1e-3 {
			jumps++ // a cut; anything else is a sweep step
		}
		prev = pos
	}
	// 120 s / 20.8 s per shot = 5 cuts. A cut can land near the old spot and
	// read as a step, so the floor is loose, but motion with NO cut is a bug.
	assert.GreaterOrEqual(t, jumps, 3)
	assert.LessOrEqual(t, jumps, 5)
}

// A spawn beside the wall must not collapse the sweep onto one point: the
// client reads "stopped moving" as the cue for a cut that then never comes.
func TestTour_EverySweepMoves(t *testing.T) {
	tour := worldPlan().NewTour(rand.New(rand.NewSource(5)))
	for i := 0; i < 200; i++ {
		tour.nextSweep()
		assert.GreaterOrEqual(t, dist(tour.from, tour.to), TourSpeed*TourSweepSeconds/2-1e-3)
	}
}

// The hold is the client's fade cue: the view must actually stand still for
// TourHoldSeconds before every cut.
func TestTour_HoldsStillBeforeTheCut(t *testing.T) {
	tour := worldPlan().NewTour(rand.New(rand.NewSource(2)))
	tour.Advance(TourSweepSeconds * 1000)
	end := tour.Position()
	tour.Advance(TourHoldSeconds*1000 - stepMillis)
	assert.Equal(t, end, tour.Position(), "still inside the hold")
}

func TestTourPlan_DropsForeignSpawnsAndSurvivesNone(t *testing.T) {
	underworld := phy.Vec2f{X: 0, Y: 300}
	plan := NewTourPlan(phy.Vec2f{}, 144, 72, []phy.Vec2f{underworld})
	require.Len(t, plan.anchors, 1)
	assert.Equal(t, phy.Vec2f{}, plan.anchors[0], "no spawn in the zone: its centre is the anchor")
}

// A zone smaller than the scaled AOI box locks the view to its centre instead
// of producing an inverted clamp.
func TestTourPlan_SmallZoneLocksToItsCentre(t *testing.T) {
	origin := phy.Vec2f{X: 0, Y: 300}
	tour := NewTourPlan(origin, 30, 20, []phy.Vec2f{{X: 5, Y: 305}}).
		NewTour(rand.New(rand.NewSource(3)))
	for i := 0; i < 30*30; i++ {
		assert.Equal(t, origin, tour.Advance(stepMillis))
	}
}

func TestNewTouringSpectator_ScalesTheBoxAndMoves(t *testing.T) {
	tour := worldPlan().NewTour(rand.New(rand.NewSource(4)))
	s := NewTouringSpectator(tour, nil)
	start := s.Position()

	box := s.Viewport().(*phy.Box)
	assert.InDelta(t, constant.ViewPortWidth/2*TourViewportScale, box.Extent().X, 1e-6)
	assert.InDelta(t, constant.ViewPortHeight/2*TourViewportScale, box.Extent().Y, 1e-6)
	assert.InDelta(t, TourViewportScale, s.ViewportScale(), 1e-6)

	for i := 0; i < 30; i++ {
		s.Advance(stepMillis)
	}
	assert.Greater(t, dist(start, s.Position()), 0.1)
	assert.Equal(t, s.Position(), box.Position(), "the AOI box rides along")
}

// The death spectators watch the spot the character died on.
func TestNewSpectator_NeverMoves(t *testing.T) {
	deathspot := phy.Vec2f{X: 12, Y: -7}
	s := NewSpectator(deathspot, nil)
	for i := 0; i < 30*30; i++ {
		s.Advance(stepMillis)
	}
	assert.Equal(t, deathspot, s.Position())
	assert.InDelta(t, 1, s.ViewportScale(), 1e-6)
}

const zoomTSPath = "../../../../../frontend/src/features/camera/logic/Zoom.ts"

var spectateViewportScaleTS = regexp.MustCompile(`SPECTATE_VIEWPORT_SCALE\s*=\s*([0-9.]+)`)

// The client zooms out by the same factor the server grows the AOI box by.
// Each side is internally consistent, so nothing else notices a drift
// (TestFlightViewportScale_MatchesTheClient is the precedent).
func TestTourViewportScale_MatchesTheClient(t *testing.T) {
	source, err := os.ReadFile(zoomTSPath)
	require.NoError(t, err, "cannot read %s — if the client moved, move this pin with it", zoomTSPath)
	match := spectateViewportScaleTS.FindSubmatch(source)
	require.NotNil(t, match, "SPECTATE_VIEWPORT_SCALE is gone from %s", zoomTSPath)
	client, err := strconv.ParseFloat(string(match[1]), 64)
	require.NoError(t, err)
	assert.InDelta(t, float64(TourViewportScale), client, 1e-9,
		"tour.go's TourViewportScale and Zoom.ts's SPECTATE_VIEWPORT_SCALE must be retuned TOGETHER")
}
