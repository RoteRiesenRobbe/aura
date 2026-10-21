package cmd

import (
	"fmt"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/lang"
	"log"
	"strconv"
	"strings"

	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/appearance"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/codec"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/minions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/google/flatbuffers/go"
	"github.com/google/uuid"
)

var commands = map[string]Command{
	"PING": func(g model.Game, p model.PlayerEntity, arg *string) error {
		msg := "PONG"
		if arg != nil && len(*arg) > 0 {
			msg += " " + *arg
		}

		log.Println(msg)

		builder := flatbuffers.NewBuilder(32)
		acceptMsg := codec.PongMessageFlatbufMarshal(builder)
		builder.Finish(acceptMsg)
		p.Client().SendMessage(builder.FinishedBytes())

		return nil
	},
	"KILL": func(g model.Game, p model.PlayerEntity, arg *string) error {
		target := p
		if arg != nil && len(*arg) > 0 {
			id, err := strconv.ParseUint(*arg, 10, 64)
			if err != nil {
				return err
			}
			other, err := g.GetEntity(id)
			if err != nil {
				return err
			}
			player, ok := other.(model.PlayerEntity)
			if !ok {
				return fmt.Errorf("entity %d is not a player", id)
			}
			target = player
		}

		target.VitalSigns().Health = 0

		return nil
	},
	// GOD [on|off]: bare GOD toggles, 'on' and 'off' set it (scripts use
	// those, so sending one twice cannot flip it back).
	"GOD": func(g model.Game, p model.PlayerEntity, arg *string) error {
		switch {
		case arg == nil || *arg == "":
			p.SetGodmode(!p.IsGod())
		case strings.EqualFold(*arg, "on"):
			p.SetGodmode(true)
		case strings.EqualFold(*arg, "off"):
			p.SetGodmode(false)
		default:
			return fmt.Errorf("usage: 'GOD', 'GOD on' or 'GOD off'")
		}

		return nil
	},
	// SPEED [factor|off] multiplies the player's movement speed for testing —
	// no arg = 2, 'off' resets. Composes on top of passive speed bonuses.
	"SPEED": func(g model.Game, p model.PlayerEntity, arg *string) error {
		if arg == nil || len(*arg) == 0 {
			p.SetSpeedCheat(2)
			return nil
		}
		if *arg == "off" {
			p.SetSpeedCheat(0)
			return nil
		}
		factor, err := strconv.ParseFloat(*arg, 32)
		if err != nil {
			return fmt.Errorf("cannot parse factor: %s", err)
		}
		if factor <= 0 {
			return fmt.Errorf("factor must be > 0, got %v", factor)
		}
		p.SetSpeedCheat(float32(factor))

		return nil
	},
	"XP": func(g model.Game, p model.PlayerEntity, arg *string) error {
		if arg == nil || len(*arg) == 0 {
			return fmt.Errorf("no argument, usage: 'XP <amount>'")
		}

		xp, err := strconv.ParseUint(*arg, 10, 64)
		if err != nil {
			return err
		}

		p.AddExperience(xp)

		return nil
	},
	// SKILL <name> adds a skill to the player's spellbook by registry name
	// (e.g. 'SKILL FireWard') — the dev/testing shortcut past the unlock
	// sources. Discovery is idempotent and runs the recipe cascade, exactly
	// like the real milestone/kill-drop paths.
	"SKILL": func(g model.Game, p model.PlayerEntity, arg *string) error {
		if arg == nil || len(*arg) == 0 {
			return fmt.Errorf("no argument, usage: 'SKILL <name>' or 'SKILL all'")
		}
		if strings.EqualFold(*arg, "all") {
			discoverAll(g, p)
			return nil
		}

		def, err := g.Skills().GetByName(*arg)
		if err != nil {
			return err
		}

		if !p.SkillComponent().HasDiscovered(def.ID) {
			p.SkillComponent().Discover(def.ID)
			// Exercise the same unlock UI the real sources use (label "Cheat").
			p.Client().SendUnlock(uint64(def.ID), lang.Message{Key: lang.KeyUnlockCheat, English: "Cheat"})
		}
		p.ApplyRecipeCascade()

		return nil
	},
	// WIZARD [on|off]: on grants every skill (SKILL all), resets every running
	// cooldown and fires cooldowns without starting one; off restores
	// cooldowns and keeps the skills. Bare WIZARD toggles, like GOD.
	"WIZARD": func(g model.Game, p model.PlayerEntity, arg *string) error {
		var on bool
		switch {
		case arg == nil || *arg == "":
			on = !p.NoCooldownCheat()
		case strings.EqualFold(*arg, "on"):
			on = true
		case strings.EqualFold(*arg, "off"):
			on = false
		default:
			return fmt.Errorf("usage: 'WIZARD', 'WIZARD on' or 'WIZARD off'")
		}
		p.SetNoCooldownCheat(on)
		if on {
			discoverAll(g, p)
			p.SkillComponent().ResetCooldowns()
		}
		return nil
	},
	// QUEST inspects and drives the quest ledger (plan-quests.md C1) — the
	// only driver for dialogue edges until C2 authors advance_quest rows.
	//   QUEST                        dump the ledger to the server log
	//   QUEST ACCEPT <id>            start a quest
	//   QUEST ABANDON <id>           abandon a running quest (D13)
	//   QUEST ADVANCE <id> <from> <to>  walk one dialogue branch edge
	"QUEST": func(g model.Game, p model.PlayerEntity, arg *string) error {
		if arg == nil || len(*arg) == 0 {
			log.Printf("📜 quest ledger of '%s':", p.Name())
			for _, line := range p.QuestLedger().DebugLines() {
				log.Println("📜   " + line)
			}
			return nil
		}
		argv := strings.Split(*arg, " ")
		sub, rest := argv[0], argv[1:]
		switch {
		case sub == "ACCEPT" && len(rest) == 1:
			return p.QuestLedger().Accept(rest[0])
		case sub == "ABANDON" && len(rest) == 1:
			return p.QuestLedger().Abandon(rest[0])
		case sub == "ADVANCE" && len(rest) == 3:
			return p.QuestLedger().AdvanceDialogue(rest[0], rest[1], rest[2])
		}
		return fmt.Errorf("usage: 'QUEST', 'QUEST ACCEPT <id>', 'QUEST ABANDON <id>' or 'QUEST ADVANCE <id> <from> <to>'")
	},
	"DAMAGE": func(g model.Game, p model.PlayerEntity, arg *string) error {
		if arg == nil || len(*arg) == 0 {
			return fmt.Errorf("no argument, usage: 'DAMAGE <percentage>'")
		}

		dmg, err := strconv.ParseUint(*arg, 10, 64)
		if err != nil {
			return err
		}

		dmgf := float32(dmg) / 100.0
		if dmgf > 1 {
			// Anything at or over 100 % empties the pool. Clamping here keeps the
			// float→uint32 conversion below in range; out-of-range conversions are
			// implementation-defined in Go.
			dmgf = 1
		}

		// The percentage is of the player's OWN pool, not of the vitals.VitalSign
		// type ceiling. SubFraction() means the latter, which was fine while
		// health was a fraction of ^VitalSign(0) but has been wrong since player
		// health became absolute HP (item 11) — every argument subtracted a
		// fraction of ~4.3 billion, so DAMAGE 1 was instantly lethal.
		h := p.VitalSigns().Health
		p.VitalSigns().Health = h.Sub(uint32(float32(p.MaxHealth()) * dmgf))
		p.StatusEffects().Add(model.StatusEffectDamaged)

		return nil
	},
}

// discoverAll adds every skill in the registry to the spellbook, mob skills
// included, then runs the recipe cascade once. No unlock banner: one per
// skill would bury the screen.
func discoverAll(g model.Game, p model.PlayerEntity) {
	sc := p.SkillComponent()
	for _, def := range g.Skills().All() {
		sc.Discover(def.ID)
	}
	p.ApplyRecipeCascade()
}

type CommandSystem struct {
	players  []model.PlayerEntity
	tokens   []string
	commands map[string]Command
	g        model.Game
}

// Announcer is the server-wide system-message surface (chat.ChatSystem) —
// narrow so the cheat set doesn't depend on the chat package.
type Announcer interface {
	Broadcast(text string)
}

// MapRevealer is the map reveal's owner (sys.ConnectionStateSystem), narrow
// for Announcer's reason.
type MapRevealer interface {
	RevealMap(p model.PlayerEntity, zones []cfg.PlacedBounds)
}

// Campfires resolves campfire destinations for WARP and HOME
// (sys.ConnectionStateSystem), narrow for Announcer's reason.
type Campfires interface {
	CampfirePosition(id string) (phy.Vec2f, bool)
	AnchorOf(client uuid.UUID) (phy.Vec2f, bool)
}

// NewCommandSystem wires the cheat set: the static package commands plus the
// space-bound THREAT closure (the space enables the query-nearby-mobs form),
// the announcer-bound ANNOUNCE closure, the zone-bound REVEALMAP closure, the
// campfire-bound WARP and HOME closures and the catalog-bound LOOK closure.
func NewCommandSystem(g model.Game, tokens []string, space *phy.Space, announcer Announcer,
	revealer MapRevealer, zones []cfg.PlacedBounds, fires Campfires, looks appearance.Catalog) *CommandSystem {
	cmds := make(map[string]Command, len(commands)+6)
	for name, action := range commands {
		cmds[name] = action
	}
	cmds["THREAT"] = threatCommand(space)
	cmds["ANNOUNCE"] = announceCommand(announcer)
	cmds["REVEALMAP"] = revealCommand(revealer, zones)
	cmds["WARP"] = warpCommand(fires)
	cmds["HOME"] = homeCommand(fires)
	cmds["LOOK"] = lookCommand(looks)
	return &CommandSystem{tokens: tokens, g: g, commands: cmds}
}

// warpCommand builds WARP <x> <y> (world px, 120 per unit; the client's
// JUMPER sends this form) and WARP <spawnpoint-id> (onto that campfire).
func warpCommand(fires Campfires) Command {
	return func(g model.Game, p model.PlayerEntity, arg *string) error {
		if arg == nil || *arg == "" {
			return fmt.Errorf("usage: 'WARP <x> <y>' (px) or 'WARP <spawnpoint-id>'")
		}

		argv := strings.Split(*arg, " ")
		switch len(argv) {
		case 1:
			pos, ok := fires.CampfirePosition(argv[0])
			if !ok {
				return fmt.Errorf("no campfire with the id '%s'", argv[0])
			}
			teleport(p, pos)
			return nil
		case 2:
			x, err := strconv.ParseFloat(argv[0], 32)
			if err != nil {
				return fmt.Errorf("cannot parse argument X: %s", err)
			}
			y, err := strconv.ParseFloat(argv[1], 32)
			if err != nil {
				return fmt.Errorf("cannot parse argument Y: %s", err)
			}
			teleport(p, phy.Vec2f{X: float32(x / codec.Points2px), Y: float32(y / codec.Points2px)})
			return nil
		}
		return fmt.Errorf("expected 1 or 2 arguments, got %d", len(argv))
	}
}

// homeCommand builds HOME: onto the campfire the player is bound to, at once
// (the Recall utility's destination, without its cast).
func homeCommand(fires Campfires) Command {
	return func(g model.Game, p model.PlayerEntity, arg *string) error {
		pos, ok := fires.AnchorOf(p.Client().UUID())
		if !ok {
			return fmt.Errorf("no campfire bound")
		}
		teleport(p, pos)
		return nil
	}
}

// teleport moves a player, cancelling a running flight first
// (plan-flight-paths.md L9): Ground() is the one re-entry (shapes back,
// viewport restored, flight cleared) — without it the next tick's lerp would
// silently snap the warp back. No-op on the ground.
func teleport(p model.PlayerEntity, pos phy.Vec2f) {
	p.Ground()
	p.SetPosition(pos)
}

// lookCommand builds LOOK <item-id>: wears any appearance item, owned or not
// (plan-appearance.md C3), in the slot the item belongs to. It persists like
// an in-game pick (C4, PO 2026-10-21): the save path reads the worn look and
// asks nothing about how it was put on.
func lookCommand(looks appearance.Catalog) Command {
	return func(g model.Game, p model.PlayerEntity, arg *string) error {
		if arg == nil || *arg == "" {
			return fmt.Errorf("usage: 'LOOK <appearance-item-id>'")
		}
		item, ok := looks.Item(*arg)
		if !ok {
			return fmt.Errorf("no appearance item with the id '%s'", *arg)
		}
		portrait, ring := p.Look()
		if item.Slot == appearance.SlotPortrait {
			portrait = looks.Wire(item.Slot, item.ID)
		} else {
			ring = looks.Wire(item.Slot, item.ID)
		}
		p.SetLook(portrait, ring)
		return nil
	}
}

// announceCommand builds ANNOUNCE <text> — the dev shortcut onto the same
// server-wide banner path the Orc Warlord encounter uses (content pass C6).
func announceCommand(announcer Announcer) Command {
	return func(g model.Game, p model.PlayerEntity, arg *string) error {
		if arg == nil || len(*arg) == 0 {
			return fmt.Errorf("no argument, usage: 'ANNOUNCE <text>'")
		}
		announcer.Broadcast(*arg)
		return nil
	}
}

// revealCommand builds REVEALMAP: uncovers every loaded zone on the player's
// world map, dark areas included, as if the character had seen it all. The
// reveal persists like an explored one (it only ever grows, so there is no
// undo short of the database).
func revealCommand(revealer MapRevealer, zones []cfg.PlacedBounds) Command {
	return func(g model.Game, p model.PlayerEntity, arg *string) error {
		revealer.RevealMap(p, zones)
		return nil
	}
}

// threatDumpRadius [PLACEHOLDER] is how far around the player the no-arg
// THREAT form looks for mobs.
const threatDumpRadius = 15

// threatCommand builds THREAT — the threat-table debug dump (encounter-
// controller chunk 9; wanted since the taunt chunk): no argument dumps every
// mob within threatDumpRadius of the player to the server log, 'THREAT <id>'
// dumps one mob by entity ID.
func threatCommand(space *phy.Space) Command {
	return func(g model.Game, p model.PlayerEntity, arg *string) error {
		if arg != nil && len(*arg) > 0 {
			id, err := strconv.ParseUint(*arg, 10, 64)
			if err != nil {
				return fmt.Errorf("usage: 'THREAT [<entityID>]': %w", err)
			}
			e, err := g.GetEntity(id)
			if err != nil {
				return err
			}
			m, ok := e.(*mob.Mob)
			if !ok {
				return fmt.Errorf("entity %d is not a mob", id)
			}
			log.Println(formatThreatReport(m))
			return nil
		}

		found := mobsNearby(space, p.Position(), threatDumpRadius)
		if len(found) == 0 {
			log.Printf("THREAT: no mobs within %d units", threatDumpRadius)
			return nil
		}
		for _, m := range found {
			log.Println(formatThreatReport(m))
		}
		return nil
	}
}

// mobsNearby returns the mobs whose bodies lie within radius of pos. The
// probe's mask spans both combatant body layers plus Viewport-only bodies
// (braziers), so every mob kind is found.
func mobsNearby(space *phy.Space, pos phy.Vec2f, radius float32) []*mob.Mob {
	probe := phy.NewCircle(pos, radius)
	probe.Shape().Mask = int(model.LayerActionCollision | model.LayerPlayerCollision | model.LayerViewportCollision)
	var found []*mob.Mob
	for _, h := range space.QueryCircle(probe) {
		if m, ok := h.Shape().UserData.(*mob.Mob); ok {
			found = append(found, m)
		}
	}
	return found
}

// formatThreatReport renders one mob's threat state as a single log line:
// identity, immunity, current aggro target and the sorted threat rows
// (player names resolved where the entity carries one).
func formatThreatReport(m *mob.Mob) string {
	rows, targetID := m.ThreatSnapshot()
	var b strings.Builder
	fmt.Fprintf(&b, "THREAT mob=%d def=%s invulnerable=%t target=%d rows=%d",
		m.Basic().ID(), m.MobDefinition().Name, m.Invulnerable(), targetID, len(rows))
	for _, row := range rows {
		fmt.Fprintf(&b, " | %d", row.Entity.Basic().ID())
		if named, ok := row.Entity.(interface{ Name() string }); ok {
			fmt.Fprintf(&b, "(%s)", named.Name())
		}
		fmt.Fprintf(&b, "=%.1f", row.Threat)
	}
	return b.String()
}

func (*CommandSystem) New(w *ecs.World) {
	log.Println("CommandSystem nominal")
}

func (*CommandSystem) Priority() int {
	return -50
}

func (c *CommandSystem) AddPlayer(p model.PlayerEntity) {
	c.players = append(c.players, p)
}

func (c *CommandSystem) Update(dt float32) {
	// handle cheat commands
	for _, player := range c.players {
		cheat := player.Client().NextCheat()
		if cheat == nil {
			continue
		}

		if !c.validateToken(cheat.Token) {
			log.Printf("😡 Player '%s' presented invalid token '%s'", player.Name(), cheat.Token)
			continue
		}

		argv := strings.SplitN(cheat.Command, " ", 2)
		if len(argv) < 1 {
			continue
		}
		cmd := strings.ToUpper(argv[0])
		action, ok := c.commands[cmd]
		if action == nil || !ok {
			log.Printf("⁉️ Invalid Action.")
			continue
		}

		var actionArg *string = nil
		if len(argv) > 1 {
			actionArg = &argv[1]
		}
		err := action(c.g, player, actionArg)
		if err != nil {
			log.Printf("😰 Action '%s' failed: %s", cmd, err)
			continue
		}

		log.Printf("😎 Executed '%s'.", cmd)
	}
}

func (c *CommandSystem) validateToken(token string) bool {
	for _, t := range c.tokens {
		if t == token {
			return true
		}
	}

	return false
}

func (c *CommandSystem) Remove(e ecs.BasicEntity) {
	i := minions.FindBasic(func(idx int) model.BasicEntity {
		return c.players[idx]
	}, len(c.players), e)

	if i >= 0 {
		c.players = append(c.players[:i], c.players[i+1:]...)
	}
}

type Command func(g model.Game, p model.PlayerEntity, arg *string) error
