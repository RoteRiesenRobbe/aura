package resource

import (
	"fmt"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"math"
	"math/rand"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

var _ = model.ResourceEntity(&Resource{})

type Resource struct {
	model.BaseEntity
	resource items.Item
	stock    model.ResourceStock

	rand                    *rand.Rand
	invReplenishProbability int
	statusEffects           model.StatusEffects
}

func (r *Resource) replenish(i int) {
	res := &r.stock
	res.Available += i
	if res.Available > res.Capacity {
		res.Available = res.Capacity
	}
}

func (r *Resource) Resource() items.Item {
	return r.resource
}

func (r *Resource) StatusEffects() *model.StatusEffects {
	return &r.statusEffects
}

func (r *Resource) Stock() *model.ResourceStock {
	return &r.stock
}

func (r *Resource) Update(dt float32) {
	if r.invReplenishProbability <= 0 {
		return
	}
	if r.rand.Intn(r.invReplenishProbability) == 0 {
		r.replenish(1)
	}
}

func NewResource(body *phy.Circle, rand *rand.Rand, resource items.Item, entityType model.EntityType) (*Resource, error) {
	if resource.ItemDefinition == nil {
		return nil, fmt.Errorf("no resource provided")
	}

	/*
	 * Resources should be their own entities, but they are not - they are represented as items as well
	 *
	 * To mitigate this, this logic exist:
	 * If an item does not define a ItemDefinition.Resource, it itself is used as the Resource
	 * But if it does, the referenced item is used as stock. Resource related factors in resource(item)
	 *   override anything that is defined in the referenced item.
	 *
	 * Any example for this is TitaniumShard (granting Titanium) and BerrySeeds (granting Berry),
	 * but both a bit different from the base resource.
	 */
	replenishProbability := resource.Factors.ReplenishProbability
	resourceName := resource.Name
	resourceItem := resource
	capacity := resource.Factors.Capacity
	startStock := resource.Factors.StartStock
	resourceFallback := resource.Resource
	if resourceFallback != nil {
		resourceItem = *resourceFallback

		if replenishProbability == nil {
			replenishProbability = resourceFallback.Factors.ReplenishProbability
			resourceName = resourceFallback.Name
		}

		if capacity == nil {
			capacity = resourceFallback.Factors.Capacity
		}
		if startStock == nil {
			startStock = resourceFallback.Factors.StartStock
		}
	}

	invReplenishProbability := 0
	if replenishProbability != nil && *replenishProbability > 0 {

		if *replenishProbability < 0 || *replenishProbability > 1 {
			return nil, fmt.Errorf("invalid replenishProbability '%g' for %s not in (0,1]", *replenishProbability, resourceName)
		}

		invReplenishProbability = int(1.0 / *replenishProbability)
	}

	cpct := 0
	if capacity != nil {
		cpct = *capacity
	}

	ss := 0.5
	if startStock != nil {
		ss = float64(*startStock)
	}

	if body == nil {
		return nil, fmt.Errorf("no body provided")
	}

	base := model.NewBaseEntity(body, entityType)
	r := &Resource{
		BaseEntity: base,
		resource:   resource,
		stock: model.ResourceStock{
			Item:      resourceItem,
			Capacity:  cpct,
			Available: int(math.Round(float64(cpct) * ss)),
		},
		rand:                    rand,
		invReplenishProbability: invReplenishProbability,
		statusEffects:           model.NewStatusEffects(),
	}
	r.Body.Shape().UserData = r
	return r, nil
}

func (r *Resource) MobTouches(e model.MobEntity, factors mobs.Factors) {
	// Nothing yet
}

func (r *Resource) PlayerTouches(p model.PlayerEntity, damage model.Damage) {
	// Nothing yet
}
