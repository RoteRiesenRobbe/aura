package model

import "github.com/RoteRiesenRobbe/aura/pkg/aura/phy"

type HeatRadiator struct {
	HeatPerTick uint32
	Radius      float32
	Body        phy.DynamicCollider
}
