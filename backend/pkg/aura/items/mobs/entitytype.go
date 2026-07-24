package mobs

import "github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"

// ResolveEntityType maps a mob's effective wire-type key — the entityType
// override if set, else the def name — to its FlatBuffers EntityType. ok is
// false when the key names no EntityType; callers hard-fail (the loader at boot,
// mob.NewMob via panic for direct construction). Single source of truth for the
// name/override → wire-type mapping (§27.2.1).
func ResolveEntityType(override, name string) (AuraApi.EntityType, bool) {
	key := override
	if key == "" {
		key = name
	}
	t, ok := AuraApi.EnumValuesEntityType[key]
	return t, ok
}
