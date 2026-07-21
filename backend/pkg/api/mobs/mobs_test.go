package mobs

import (
	"io/fs"
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/be"
)

func TestLsMobs(t *testing.T) {
	entries, err := fs.ReadDir(Mobs, ".")
	be.NoError(t, err)
	be.True(t, len(entries) > 0)
}
