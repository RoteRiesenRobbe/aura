// Package skillfx embeds api/skill-fx/, the generated list of skill-VFX body
// names (plan-skill-vfx.md C3a). The directory name is hyphenated like the
// api/ one it mirrors; a Go package name cannot be, hence the spelling.
package skillfx

import "embed"

// The pattern is * rather than *.json, the ascension.go precedent: the .json
// is GENERATED (tools/make-skill-fx-manifest.mjs) and copied in by cp-defs.
// The copy is tracked like every sibling's except the mobs', so a fresh clone
// builds and boots; with * a missing list is still a content finding at load,
// which is where it can say something useful, never a compile error. The
// loader reads bodies.json by name and ignores everything else.
//
//go:embed *
var SkillFx embed.FS
