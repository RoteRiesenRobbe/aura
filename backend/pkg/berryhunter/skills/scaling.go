package skills

// Scaled is THE level-scaling convention for every leveled value in the
// skill system: base + (level−1) × perLevel. Level 1 always yields the
// base; negative perLevel means "stronger/faster at higher levels".
// Floors (0, 1, uncapped sentinels) differ per field and stay at the
// call sites.
func Scaled[T interface{ ~int | ~float32 }](base, perLevel T, level int) T {
	return base + T(level-1)*perLevel
}
