package codec

// Points2px is the world-scale factor (pixel-points per meter), applied to
// every wire position. The client restates it (PIXEL_PER_METER, BasicConfig.ts);
// both sides are pinned by api/shared-constants.json `pointsPerMeter`
// (cmd/aurad/shared_constants_test.go / SharedConstants.test.ts).
const Points2px = 120.0

func f32ToPx(f float32) float32 {
	return f * Points2px
}

func f32ToU16Px(f float32) uint16 {
	return uint16(f * Points2px)
}

func intToF32Px(i int) float32 {
	return float32(i * Points2px)
}
