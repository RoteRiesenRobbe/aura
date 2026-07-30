package model

import (
	"net/http"

	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

type Game interface {
	// Handler returns a http request HandlerFunc that upgrades
	// requests to a websocket connection and starts the game protocol
	Handler() http.Handler

	// Loop starts and runs the games loop tick per tick
	Loop()

	// AddEntity adds an entity to the game
	AddEntity(e BasicEntity)

	// RemoveEntity removes an entity from the game
	RemoveEntity(e ecs.BasicEntity)

	// Finds an entity by its id
	GetEntity(id uint64) (BasicEntity, error)

	// Mobs returns the registry with all available mob definitions
	Mobs() mobs.Registry

	// Skills returns the registry with all available skill definitions
	Skills() skills.Registry

	// Quests returns the registry with all available quest definitions
	// (plan-quests.md C1); nil in worlds without quest content (the sim).
	Quests() quests.Registry

	// Ticks returns the number of ticks
	Ticks() uint64

	// Bounds returns the rectangular world size in server units.
	Bounds() (width, height float32)

	Config() *cfg.GameConfig
}
