# Research - how many WoW Classic class spells Aura's effect types can build

**Point-in-time, 2026-09-29 survey, recovered and counted 2026-10-07.** The
2026-09-29 session classified every spell and ended before reporting; the list
below is that classification, unchanged. Effect vocabulary as of `d35ab702`
(no effect type changed between the two dates). Consumer:
`plan-effect-types-round-2.md`.

**Scope (PO pick):** every trainer-taught ability of the 9 classes at patch
1.12, ranks collapsed to one row, plus the active abilities talents grant.
Sources: warcraft.wiki.gg "<Class> abilities (Classic)" pages.

**Buckets:** **Y** builds cleanly today · **R** builds roughly, something is
lost (the reason says what) · **N** not buildable, a missing effect type (the
hole tag names it) · **X** does not apply to Aura by design (one resource, no
items, no water or falling, camera-only).

## Result

| Bucket | Count | Share |
|---|---|---|
| Y | 167 | 43 % |
| R | 114 | 30 % |
| N | 67 | 17 % |
| X | 38 | 10 % |

Buildable at least roughly: 281 of 386 (73 %), or 281 of the 348 that apply
(81 %).

N by missing type: ally-stat 15 · dispel 11 · cast-mod 11 · enemy-debuff 8 ·
trigger 6 · cc-immunity 3 · redirect 3 · threat-mod 3 · state 2 · stealth 2 ·
heal-mod 2 · displace 1.

## The 2026-10-07 ranking of new effect types

Unlocks = N spells that become buildable; cleans up = R spells that become
exact. A spell can count under several rows. The last column marks the PO's
2026-10-07 picks.

| Rank | Type | Unlocks | Cleans up | Picked |
|---|---|---|---|---|
| 1 | Stat buff/debuff on others | 21 | 7 | yes (C1) |
| 2 | Dispel | 11 | 2 | |
| 3 | Empower next cast | 9 | 1 | yes (C4) |
| 4 | `threat` stat | 3 | 1 | yes (C1) |
| 5 | `healingReceived` stat | 2 | 3 | |
| 6 | Cadence (tick rate) on others | 2 | 2 | |
| 7 | Silence | 0 | 6 | |
| 8 | Fear | 0 | 6 | yes (C5) |
| 9 | Timed CC immunity | 3 | 0 | |
| 10 | Damage share / redirect | 3 | 0 | |
| 11 | Death ward (self revive on death) | 2 | 0 (+2 rough) | (mob death triggers picked instead, C7) |
| 12 | Reset cooldowns | 2 | 0 | |
| 13 | Charge to a target | 0 | 3 | yes (C3) |
| 14 | Proc on hit | 2 | 6 | |
| 15 | Consume own DoT/HoT | 0 (+1 rough) | 2 | |
| 16 | Stacking debuffs | 0 | 2 | |
| 17 | Thorns on others | 0 | 2 | yes (C2) |
| 18 | Shared / DoT lifesteal | 0 | 2 | |
| 19 | Stealth | 2 | 7 | yes (C6, towards mobs only) |
| 20 | Summon a player | 1 | 0 | |
| 21 | Sacrifice a summon | 1 | 0 | |
| 22 | Shrink aggro radius | 0 | 1 | |
| 23 | Cone shape | 0 | 1 | |
| 24 | Polymorph | 0 | 1 | |

Not effect types, the rest of the R losses: combo points 7 (breaks the one
resource rule), ground-targeted casts 5, reactive windows ("usable after you
were hit") 5, facing / positional 2, stance ability gating 4.

## The list

| Class | Spell | Lvl | WoW effect | B | Aura mapping or reason | Hole |
|---|---|---|---|---|---|---|
| Warrior | Battle Stance | 1 | Balanced stance, gates which abilities are usable | R | active aura carrying a while-active stat_multiplier; the ability gating is lost |  |
| Warrior | Heroic Strike | 1 | Strong melee hit | Y | instant_damage, nearest, maxTargets 1 |  |
| Warrior | Battle Shout | 1 | Party attack power buff | N | stat_multiplier is self-only | ally-stat |
| Warrior | Charge | 4 | Rush to an enemy, brief stun | R | dash + stun; dash follows the movement vector, it does not seek a target |  |
| Warrior | Rend | 4 | Bleed over time | Y | instant_dot (bleed) |  |
| Warrior | Thunder Clap | 6 | AoE damage, slows enemy attack speed | R | instant_damage all; the attack-speed slow has no type (movement instant_slow instead) |  |
| Warrior | Hamstring | 8 | Damage + movement slow | Y | instant_damage + instant_slow |  |
| Warrior | Bloodrage | 10 | Trade health for rage | X | one resource, rage does not exist |  |
| Warrior | Defensive Stance | 10 | Less damage taken, less dealt, more threat | R | aura with stat_multiplier damageReduction up / damageDealt down; threat bonus lost |  |
| Warrior | Sunder Armor | 10 | Stacking armor reduction | R | instant_resist with factor > 1 on enemies (physical vulnerability); stacking lost |  |
| Warrior | Taunt | 10 | Force an enemy onto you | Y | taunt |  |
| Warrior | Overpower | 12 | Strike usable after the target dodges | R | instant_damage; the dodge gate is lost |  |
| Warrior | Shield Bash | 12 | Damage + interrupt | R | instant_damage + short stun (stun suppresses casts) |  |
| Warrior | Demoralizing Shout | 14 | AoE, enemies deal less melee damage | N | no effect lowers an enemy's output (an ally resist field is the nearest thing) | enemy-debuff |
| Warrior | Revenge | 14 | Counter after block, dodge or parry | R | instant_damage; the gate is lost |  |
| Warrior | Mocking Blow | 16 | Damage + taunt | Y | instant_damage + taunt |  |
| Warrior | Shield Block | 16 | Block more for a few seconds | Y | instant_resist on self (physical) |  |
| Warrior | Disarm | 18 | Enemy loses its weapon | N | no effect lowers an enemy's output | enemy-debuff |
| Warrior | Cleave | 20 | Hit the target and one neighbour | Y | instant_damage, maxTargets 2 |  |
| Warrior | Retaliation | 20 | Counterattack every melee hit for 15 s | Y | retaliate_burst |  |
| Warrior | Intimidating Shout | 22 | AoE fear | R | calm (whole circle, breaks on damage) or stun; mobs do not flee |  |
| Warrior | Execute | 24 | Finisher below 20 % health | Y | instant_damage with executeBelowFraction |  |
| Warrior | Challenging Shout | 26 | AoE taunt | Y | taunt (a query circle already) |  |
| Warrior | Shield Wall | 28 | 75 % less damage for 10 s | Y | instant_resist on self |  |
| Warrior | Berserker Stance | 30 | More crit, more damage taken | R | aura with stat_multiplier critChance up / damageReduction down |  |
| Warrior | Intercept | 30 | In-combat charge + stun | R | dash + stun |  |
| Warrior | Slam | 30 | Cast-time heavy hit | Y | instant_damage with castTicks |  |
| Warrior | Berserker Rage | 32 | Immune to fear and incapacitate | N | no timed CC immunity for players | cc-immunity |
| Warrior | Whirlwind | 36 | Hit every nearby enemy | Y | instant_damage, selector all |  |
| Warrior | Pummel | 38 | Interrupt | R | short stun |  |
| Warrior | Recklessness | 50 | +100 % crit, more damage taken, 15 s | R | no timed stat buff; tick_rate as the burst window, or a stance aura with critChance up |  |
| Warrior | Piercing Howl | T | AoE slow | Y | instant_slow |  |
| Warrior | Sweeping Strikes | T | Next 5 swings hit an extra target | R | an aura variant with maxTargets 2; the 5-swing window is lost |  |
| Warrior | Mortal Strike | T | Big hit, target receives 50 % less healing | R | instant_damage; healing reduction has no type |  |
| Warrior | Death Wish | T | +20 % damage, fear immune, 30 s | R | tick_rate as the burst window; no timed damageDealt buff |  |
| Warrior | Bloodthirst | T | Hit that heals you | Y | instant_damage with lifestealFraction |  |
| Warrior | Last Stand | T | +30 % max health for 20 s | Y | instant_shield on self |  |
| Warrior | Concussion Blow | T | 5 s stun | Y | stun |  |
| Warrior | Shield Slam | T | Damage + dispel one buff | R | instant_damage; the dispel half is lost |  |
| Mage | Arcane Intellect / Arcane Brilliance | 1 | Ally intellect (a bigger pool) | N | stat_multiplier is self-only | ally-stat |
| Mage | Fireball | 1 | Cast-time nuke + short burn | Y | instant_damage + instant_dot, castTicks |  |
| Mage | Frost Armor / Ice Armor | 1 | Armor, attackers are slowed | Y | passive: resist_passive + retaliate_slow (FrostShield exists) |  |
| Mage | Conjure Water / Food / Mana Gem | 4 | Create consumables | X | no item system |  |
| Mage | Frostbolt | 4 | Nuke + slow | Y | instant_damage + instant_slow |  |
| Mage | Fire Blast | 6 | Instant nuke | Y | instant_damage |  |
| Mage | Arcane Missiles | 8 | Channelled missiles | Y | damage_aura, nearest 1 (a channel is the aura form) |  |
| Mage | Polymorph | 8 | Incapacitate, breaks on damage | R | calm (breaks on damage, faction allowlist); the sheep's regen and wander are lost |  |
| Mage | Frost Nova | 10 | AoE damage + root | Y | instant_damage + instant_slow at 100 % |  |
| Mage | Dampen Magic | 12 | Ally takes less spell damage and less healing | R | instant_resist on an ally; the healing half is lost |  |
| Mage | Slow Fall | 12 | Fall slowly | X | no falling |  |
| Mage | Arcane Explosion | 14 | Instant AoE around the caster | Y | instant_damage, selector all |  |
| Mage | Detect Magic | 16 | Show the target's buffs | X | UI only |  |
| Mage | Flamestrike | 16 | Ground-targeted AoE + burning ground | R | projectile carrying a burst, or a self-centred burst + instant_dot; no free ground targeting |  |
| Mage | Amplify Magic | 18 | Ally takes more spell damage and more healing | R | instant_resist with factor > 1 on an ally; the healing half is lost |  |
| Mage | Remove Lesser Curse | 18 | Remove a curse | N | no effect removes a buff or debuff | dispel |
| Mage | Blink | 20 | Teleport forward, breaks stuns | Y | dash |  |
| Mage | Blizzard | 20 | Channelled ground AoE at range + slow | R | self-centred damage_aura + slow_aura, or a projectile dropping a totem that carries them |  |
| Mage | Evocation | 20 | Channel to refill mana | Y | self_heal or instant_hot on self (one resource) |  |
| Mage | Mana Shield | 20 | Absorb damage into mana | R | instant_shield on self with a cost; the conversion is moot with one resource |  |
| Mage | Fire Ward / Frost Ward | 20 | Absorb fire or frost damage | Y | instant_resist on self, typed (FireWard exists) |  |
| Mage | Teleport (city) | 20 | Teleport self to a capital | R | recall (the destination is the bound campfire only) |  |
| Mage | Scorch | 22 | Fast small nuke | Y | instant_damage, short castTicks |  |
| Mage | Counterspell | 24 | Interrupt + school lockout | R | short stun |  |
| Mage | Cone of Cold | 26 | Cone damage + slow | R | a circle, not a cone: instant_damage + instant_slow |  |
| Mage | Mage Armor | 34 | Magic resistance + regen while casting | Y | resist_passive |  |
| Mage | Portal (city) | 40 | Portal the party can use | Y | spawn_at_anchor (OpenPortal exists) |  |
| Mage | Presence of Mind | T | Next spell is instant | N | no effect modifies the next cast | cast-mod |
| Mage | Arcane Power | T | +30 % damage, +30 % cost, 15 s | R | tick_rate as the burst window; no timed damageDealt buff |  |
| Mage | Pyroblast | T | Long cast, huge nuke + burn | Y | instant_damage + instant_dot, long castTicks |  |
| Mage | Blast Wave | T | AoE damage + slow around the caster | Y | instant_damage + instant_slow |  |
| Mage | Combustion | T | Growing crit until 3 crits land | R | tick_rate as the burst window; the crit-counting state is lost |  |
| Mage | Cold Snap | T | Reset frost cooldowns | N | no effect touches another skill's cooldown | cast-mod |
| Mage | Ice Block | T | Immune and frozen for 10 s | Y | instant_resist on self (Invulnerability pattern) |  |
| Mage | Ice Barrier | T | Absorb shield | Y | instant_shield on self |  |
| Priest | Power Word: Fortitude / Prayer of Fortitude | 1 | Ally stamina | N | stat_multiplier is self-only | ally-stat |
| Priest | Lesser Heal / Heal / Greater Heal | 1 | Cast-time single heal | Y | heal_aura lowest_health 1, or instant_hot as a cooldown |  |
| Priest | Smite | 1 | Holy nuke | Y | instant_damage |  |
| Priest | Shadow Word: Pain | 4 | Damage over time | Y | instant_dot |  |
| Priest | Power Word: Shield | 6 | Absorb shield on an ally | Y | instant_shield |  |
| Priest | Fade | 8 | Temporarily drop threat | Y | detaunt (Fade exists) |  |
| Priest | Renew | 8 | Heal over time | Y | instant_hot |  |
| Priest | Resurrection | 10 | Revive a dead player | Y | revive |  |
| Priest | Mind Blast | 10 | Nuke with a cooldown | Y | instant_damage |  |
| Priest | Inner Fire | 12 | Self armor buff | Y | passive stat_multiplier damageReduction |  |
| Priest | Psychic Scream | 14 | AoE fear | R | calm or stun; mobs do not flee |  |
| Priest | Cure Disease / Abolish Disease | 14 | Remove diseases | N | no effect removes a debuff | dispel |
| Priest | Dispel Magic | 18 | Remove magic effects | N | no effect removes a buff or debuff | dispel |
| Priest | Flash Heal | 20 | Fast heal | Y | instant_hot / heal_aura |  |
| Priest | Holy Fire | 20 | Nuke + burn | Y | instant_damage + instant_dot |  |
| Priest | Shackle Undead | 20 | Hold one undead | R | stun or calm limited by a targetFactions allowlist |  |
| Priest | Mind Soothe | 20 | Shrink the target's aggro radius | R | calm; no effect changes an aggro radius |  |
| Priest | Mind Vision | 22 | See through the target's eyes | X | camera only |  |
| Priest | Mana Burn | 24 | Destroy mana, deal damage | R | one resource: becomes a plain instant_damage |  |
| Priest | Prayer of Healing | 30 | Group heal | Y | heal_aura or instant_hot, selector all |  |
| Priest | Mind Control | 30 | Control a humanoid | Y | charm (the mob fights for you; you do not steer it) |  |
| Priest | Shadow Protection / Prayer of Shadow Protection | 30 | Ally shadow resistance | Y | instant_resist on allies (no shadow type: nearest of the six) |  |
| Priest | Levitate | 34 | Float | X | no falling, no water |  |
| Priest | Divine Spirit / Prayer of Spirit | T | Ally spirit | N | stat_multiplier is self-only | ally-stat |
| Priest | Starshards | 10 | Channelled arcane damage (racial) | Y | damage_aura / instant_dot |  |
| Priest | Desperate Prayer | 10 | Instant self heal (racial) | Y | self_heal |  |
| Priest | Hex of Weakness | 10 | Enemy deals less damage, heals less (racial) | N | no effect lowers an enemy's output | enemy-debuff |
| Priest | Touch of Weakness | 10 | Next attacker takes damage and is weakened (racial) | R | retaliate_damage; the weaken half is lost |  |
| Priest | Elune's Grace | 20 | Less ranged damage taken, more dodge (racial) | Y | instant_resist on self |  |
| Priest | Feedback | 20 | Attackers' spells burn their mana (racial) | R | retaliate_burst |  |
| Priest | Shadowguard | 20 | Charges of damage to attackers (racial) | Y | retaliate_damage |  |
| Priest | Fear Ward | 20 | Ally immune to the next fear (racial) | N | no CC immunity buff | cc-immunity |
| Priest | Inner Focus | T | Next spell free with bonus crit | N | no effect modifies the next cast | cast-mod |
| Priest | Power Infusion | T | Ally +20 % spell damage | N | stat_multiplier is self-only | ally-stat |
| Priest | Holy Nova | T | AoE damage + heal around the caster | Y | instant_damage + instant_hot (the native shape of this game) |  |
| Priest | Lightwell | T | Placed well allies click to heal | R | spawn a totem carrying hot_aura; the click is lost |  |
| Priest | Spirit of Redemption | T | Heal freely for 10 s after dying | N | no on-death trigger | trigger |
| Priest | Mind Flay | T | Channelled damage + slow | Y | damage_aura + slow_aura |  |
| Priest | Vampiric Embrace | T | Your damage heals the party | R | lifesteal heals the caster only |  |
| Priest | Shadowform | T | More shadow damage, less physical damage taken | R | stance aura with stat_multiplier damageDealt + damageReduction |  |
| Priest | Silence | T | Target cannot cast | R | stun (bundles movement); a cast-only lock does not exist |  |
| Warlock | Demon Skin / Demon Armor | 1 | Self armor + regen | Y | passive stat_multiplier damageReduction / resist_passive |  |
| Warlock | Immolate | 1 | Nuke + burn | Y | instant_damage + instant_dot (Immolate exists) |  |
| Warlock | Shadow Bolt | 1 | Cast-time nuke | Y | instant_damage, castTicks |  |
| Warlock | Summon Imp | 1 | Ranged caster pet | Y | spawn with follows |  |
| Warlock | Corruption | 4 | Damage over time | Y | instant_dot |  |
| Warlock | Curse of Weakness | 4 | Enemy deals less damage | N | no effect lowers an enemy's output | enemy-debuff |
| Warlock | Life Tap | 6 | Convert health to mana | X | one resource |  |
| Warlock | Curse of Agony | 8 | Ramping damage over time | Y | instant_dot (the ramp is lost) |  |
| Warlock | Fear | 8 | One enemy flees | R | calm or stun; mobs do not flee |  |
| Warlock | Create Healthstone | 10 | Conjure a healing item | X | no item system (its role is self_heal) |  |
| Warlock | Drain Soul | 10 | Channelled DoT, grants a shard on kill | R | damage_aura nearest 1; the shard is lost |  |
| Warlock | Summon Voidwalker | 10 | Tank pet | Y | spawn with follows (ShieldbearerCompanion pattern) |  |
| Warlock | Health Funnel | 12 | Spend own health to heal the pet | Y | heal_aura with costFractionOfMax |  |
| Warlock | Curse of Recklessness | 14 | Enemy hits harder, has less armor, will not flee | R | instant_resist factor > 1 (physical vulnerability); the rest is lost |  |
| Warlock | Drain Life | 14 | Channelled damage that heals you | Y | damage_aura with lifestealFraction |  |
| Warlock | Unending Breath | 16 | Breathe underwater | X | no water |  |
| Warlock | Create Soulstone | 18 | Stored self-resurrection | N | no on-death trigger | trigger |
| Warlock | Searing Pain | 18 | Fast nuke, high threat | Y | instant_damage |  |
| Warlock | Rain of Fire | 20 | Channelled ground AoE at range | R | self-centred damage_aura, or a projectile dropping a totem that carries it |  |
| Warlock | Ritual of Summoning | 20 | Summon a player to you | N | no effect moves another entity | displace |
| Warlock | Summon Succubus | 20 | Melee pet with a charm | Y | spawn with follows |  |
| Warlock | Eye of Kilrogg | 22 | Remote scouting eye | X | camera only |  |
| Warlock | Drain Mana | 24 | Channel, steal mana | R | one resource: a second Drain Life |  |
| Warlock | Sense Demons | 24 | Show demons on the minimap | X | tracking |  |
| Warlock | Curse of Tongues | 26 | Enemy casts slower | N | no effect lowers an enemy's output | enemy-debuff |
| Warlock | Detect Invisibility | 26 | See invisible units | X | no invisibility |  |
| Warlock | Banish | 28 | Remove a demon or elemental from the fight | R | stun + instant_resist on the target, targetFactions allowlist |  |
| Warlock | Create Firestone / Spellstone | 28 | Conjure an off-hand item | X | no item system |  |
| Warlock | Enslave Demon | 30 | Control a demon | Y | charm with a targetFactions allowlist (CharmElemental exists) |  |
| Warlock | Hellfire | 30 | AoE fire around you that also burns you | Y | damage_aura with a cost: the cost IS health |  |
| Warlock | Summon Felhunter | 30 | Anti-caster pet | R | spawn with follows; its dispel and silence are lost |  |
| Warlock | Curse of the Elements | 32 | Enemy takes more fire and frost damage | Y | instant_resist factor > 1 (FireVulnerability exists as the aura form) |  |
| Warlock | Shadow Ward | 32 | Absorb shadow damage | Y | instant_resist on self |  |
| Warlock | Howl of Terror | 40 | AoE fear | R | calm or stun; mobs do not flee |  |
| Warlock | Summon Felsteed / Dreadsteed | 40 | Mount | X | no mounts |  |
| Warlock | Death Coil | 42 | Damage, heal self, brief horror | Y | instant_damage with lifestealFraction + stun |  |
| Warlock | Curse of Shadow | 44 | Enemy takes more shadow and arcane damage | Y | instant_resist factor > 1 |  |
| Warlock | Soul Fire | 48 | Long cast, huge nuke | Y | instant_damage, long castTicks |  |
| Warlock | Inferno | 50 | Summon an Infernal, stuns on landing | Y | spawn with ttlTicks + stun |  |
| Warlock | Curse of Doom | 60 | Huge damage after 60 s | Y | instant_dot with one tick at a long interval |  |
| Warlock | Ritual of Doom | 60 | Summon a Doomguard | Y | spawn with ttlTicks; the ritual is lost |  |
| Warlock | Amplify Curse | T | Next curse is stronger | N | no effect modifies the next cast | cast-mod |
| Warlock | Siphon Life | T | DoT that heals you | R | instant_dot + instant_hot on self (dots carry no lifesteal rider) |  |
| Warlock | Curse of Exhaustion | T | Movement slow | Y | instant_slow |  |
| Warlock | Fel Domination | T | Next summon is fast and cheap | N | no effect modifies the next cast | cast-mod |
| Warlock | Dark Pact | T | Take mana from the pet | X | one resource |  |
| Warlock | Demonic Sacrifice | T | Kill your pet for a buff | N | no effect reads or consumes a summon | state |
| Warlock | Soul Link | T | Pet takes 30 % of your damage | N | no damage redirect | redirect |
| Warlock | Shadowburn | T | Instant nuke | Y | instant_damage |  |
| Warlock | Conflagrate | T | Consume Immolate for burst | R | instant_damage; the consume is lost |  |
| Rogue | Eviscerate | 1 | Finisher, damage per combo point | R | instant_damage; combo points do not exist |  |
| Rogue | Sinister Strike | 1 | Builder hit | Y | instant_damage |  |
| Rogue | Stealth | 1 | Invisible while sneaking | N | no stealth | stealth |
| Rogue | Backstab | 4 | Big hit from behind | R | instant_damage; no facing, the positional gate is lost |  |
| Rogue | Pick Pocket | 4 | Steal from a mob | X | no items |  |
| Rogue | Gouge | 6 | 4 s incapacitate, breaks on damage | R | calm or stun |  |
| Rogue | Evasion | 8 | +50 % dodge for 15 s | Y | instant_resist on self (physical) |  |
| Rogue | Sap | 10 | Long incapacitate out of combat | R | calm; the stealth gate is lost |  |
| Rogue | Slice and Dice | 10 | Finisher, attack speed buff | R | tick_rate; combo scaling lost |  |
| Rogue | Sprint | 10 | Speed burst | Y | speed_burst (Swift exists) |  |
| Rogue | Kick | 12 | Interrupt | R | short stun |  |
| Rogue | Expose Armor | 14 | Finisher, armor reduction | R | instant_resist factor > 1; combo scaling lost |  |
| Rogue | Garrote | 14 | Stealth opener, bleed | R | instant_dot; the stealth gate is lost |  |
| Rogue | Feint | 16 | Drop threat | Y | detaunt |  |
| Rogue | Pick Lock | 16 | Open locks | X | no locks |  |
| Rogue | Ambush | 18 | Stealth opener, big hit | R | instant_damage; the stealth gate is lost |  |
| Rogue | Rupture | 20 | Finisher, bleed | R | instant_dot; combo scaling lost |  |
| Rogue | Instant Poison | 20 | Weapon coat, chance for nature damage | R | a second damage_aura effect on the active aura (always on, no proc) |  |
| Rogue | Crippling Poison | 20 | Weapon coat, chance to slow | R | slow_aura beside the damage_aura (always on, no proc) |  |
| Rogue | Distract | 22 | Turn mobs to face a spot | X | no facing |  |
| Rogue | Vanish | 22 | Drop combat and enter stealth | R | calm + detaunt drops the fight; the stealth is lost |  |
| Rogue | Detect Traps / Disarm Trap | 24 | Find and disarm traps | X | no traps to find |  |
| Rogue | Mind-numbing Poison | 24 | Weapon coat, slower casting | N | no effect lowers an enemy's output | enemy-debuff |
| Rogue | Cheap Shot | 26 | Stealth opener, stun | R | stun; the stealth gate is lost |  |
| Rogue | Deadly Poison | 30 | Weapon coat, stacking DoT | R | dot_aura beside the damage_aura (Envenom pattern); stacking lost |  |
| Rogue | Kidney Shot | 30 | Finisher, stun | R | stun; combo scaling lost |  |
| Rogue | Wound Poison | 32 | Weapon coat, healing reduction | N | no healing-received modifier | heal-mod |
| Rogue | Blind | 34 | 10 s disorient, breaks on damage | R | calm |  |
| Rogue | Safe Fall | 40 | Less fall damage | X | no falling |  |
| Rogue | Cold Blood | T | Next attack crits | N | no effect modifies the next cast | cast-mod |
| Rogue | Riposte | T | Counter after a parry, disarms | R | instant_damage; gate and disarm lost |  |
| Rogue | Blade Flurry | T | Attack speed + hits a second target, 15 s | R | tick_rate; the extra target is lost |  |
| Rogue | Adrenaline Rush | T | Double energy regen for 15 s | Y | tick_rate (Haste exists) |  |
| Rogue | Ghostly Strike | T | Hit + dodge buff | Y | instant_damage + instant_resist on self |  |
| Rogue | Preparation | T | Reset cooldowns | N | no effect touches another skill's cooldown | cast-mod |
| Rogue | Hemorrhage | T | Hit + target takes more physical damage | Y | instant_damage + instant_resist factor > 1 |  |
| Rogue | Premeditation | T | Free combo points from stealth | X | combo points do not exist |  |
| Druid | Healing Touch | 1 | Cast-time heal | Y | heal_aura lowest_health 1, or instant_hot |  |
| Druid | Mark of the Wild / Gift of the Wild | 1 | Ally armor, stats and resistances | R | instant_resist on allies covers armor and resistances; the stats are lost |  |
| Druid | Wrath | 1 | Nuke | Y | instant_damage |  |
| Druid | Moonfire | 4 | Nuke + DoT | Y | instant_damage + instant_dot |  |
| Druid | Rejuvenation | 4 | Heal over time | Y | instant_hot (Rejuvenation exists) |  |
| Druid | Thorns | 6 | Attackers take damage | Y | retaliate_damage (FireShield pattern; self only) |  |
| Druid | Entangling Roots | 8 | Root + DoT | Y | instant_slow at 100 % + instant_dot |  |
| Druid | Bear Form / Dire Bear Form | 10 | Tank shape: health, armor, own ability bar | R | stance aura with stat_multiplier maxHealth + damageReduction; the ability swap is lost |  |
| Druid | Demoralizing Roar | 10 | AoE, enemies deal less damage | N | no effect lowers an enemy's output | enemy-debuff |
| Druid | Growl | 10 | Taunt | Y | taunt |  |
| Druid | Maul | 10 | Strong bear hit | Y | instant_damage |  |
| Druid | Teleport: Moonglade | 10 | Teleport to Moonglade | R | recall (the bound campfire only) |  |
| Druid | Enrage | 12 | Generate rage, lose armor | X | rage does not exist |  |
| Druid | Regrowth | 12 | Heal + heal over time | Y | two instant_hot effects (one fast, one slow) |  |
| Druid | Bash | 14 | Stun | Y | stun |  |
| Druid | Cure Poison / Abolish Poison | 14 | Remove poisons | N | no effect removes a debuff | dispel |
| Druid | Aquatic Form | 16 | Swim form | X | no water |  |
| Druid | Swipe | 16 | Hit 3 enemies | Y | instant_damage, maxTargets 3 |  |
| Druid | Faerie Fire | 18 | Armor reduction, blocks stealth | Y | instant_resist factor > 1 (physical) |  |
| Druid | Hibernate | 18 | Sleep a beast or dragonkin | R | calm with a targetFactions allowlist |  |
| Druid | Cat Form | 20 | Melee shape: own ability bar | R | stance aura with stat_multiplier; the ability swap is lost |  |
| Druid | Claw | 20 | Builder hit | Y | instant_damage |  |
| Druid | Prowl | 20 | Stealth | N | no stealth | stealth |
| Druid | Rebirth | 20 | Combat resurrection | Y | revive |  |
| Druid | Rip | 20 | Finisher, bleed | R | instant_dot; combo scaling lost |  |
| Druid | Starfire | 20 | Long cast nuke | Y | instant_damage, castTicks |  |
| Druid | Shred | 22 | Big hit from behind | R | instant_damage; no facing |  |
| Druid | Soothe Animal | 22 | Shrink a beast's aggro radius | R | calm with a targetFactions allowlist |  |
| Druid | Rake | 24 | Hit + bleed | Y | instant_damage + instant_dot |  |
| Druid | Remove Curse | 24 | Remove a curse | N | no effect removes a debuff | dispel |
| Druid | Tiger's Fury | 24 | Damage buff for 6 s | R | tick_rate as the burst window |  |
| Druid | Dash | 26 | Speed burst | Y | speed_burst |  |
| Druid | Challenging Roar | 28 | AoE taunt | Y | taunt |  |
| Druid | Cower | 28 | Drop threat | Y | detaunt |  |
| Druid | Travel Form | 30 | Fast travel shape | Y | aura with stat_multiplier movementSpeed (while active) |  |
| Druid | Tranquility | 30 | Channelled group heal | Y | heal_aura, selector all (FieldMedics pattern) |  |
| Druid | Ferocious Bite | 32 | Finisher, damage | R | instant_damage; combo scaling lost |  |
| Druid | Ravage | 32 | Stealth opener from behind | R | instant_damage; both gates lost |  |
| Druid | Track Humanoids | 32 | Minimap tracking | X | tracking |  |
| Druid | Frenzied Regeneration | 36 | Convert rage into health | Y | instant_hot on self |  |
| Druid | Pounce | 36 | Stealth opener, stun + bleed | R | stun + instant_dot; the stealth gate is lost |  |
| Druid | Feline Grace | 40 | Less fall damage | X | no falling |  |
| Druid | Hurricane | 40 | Channelled ground AoE + attack slow | R | self-centred damage_aura; ranged placement and the attack slow are lost |  |
| Druid | Innervate | 40 | Huge mana regen on an ally | R | one resource: an instant_hot on an ally |  |
| Druid | Barkskin | 44 | Less damage taken, slower attacks | Y | instant_resist on self |  |
| Druid | Nature's Grasp | T | Next attacker is rooted | R | retaliate_slow at 100 % (a passive, not a charge) |  |
| Druid | Omen of Clarity | T | Hits can make the next spell free | N | no proc trigger | trigger |
| Druid | Insect Swarm | T | DoT + enemy misses more | R | instant_dot; the miss chance is lost |  |
| Druid | Feral Charge | T | Charge + root | R | dash + instant_slow at 100 % |  |
| Druid | Nature's Swiftness | T | Next spell is instant | N | no effect modifies the next cast | cast-mod |
| Druid | Swiftmend | T | Consume a HoT for an instant heal | R | instant heal; the consume is lost |  |
| Druid | Moonkin Form | T | Armor shape + party spell crit aura | R | stance aura for the armor; the ally crit is lost |  |
| Druid | Leader of the Pack | T | Party crit aura | N | stat_multiplier is self-only | ally-stat |
| Hunter | Auto Shot | 1 | Automatic ranged attack | Y | damage_aura, nearest 1: the base mechanic of this game |  |
| Hunter | Raptor Strike | 1 | Strong melee hit | Y | instant_damage |  |
| Hunter | Track (Beasts, Humanoids, Undead, ...) | 1 | Minimap tracking, 8 spells | X | tracking |  |
| Hunter | Aspect of the Monkey | 4 | +8 % dodge | R | aura with stat_multiplier damageReduction |  |
| Hunter | Serpent Sting | 4 | Poison DoT | Y | instant_dot (poison) |  |
| Hunter | Arcane Shot | 6 | Instant shot | Y | instant_damage |  |
| Hunter | Hunter's Mark | 6 | Target takes more ranged damage, shows on the map | Y | instant_resist factor > 1 |  |
| Hunter | Concussive Shot | 8 | Slow (daze) | Y | instant_slow |  |
| Hunter | Aspect of the Hawk | 10 | More ranged attack power | Y | aura with stat_multiplier damageDealt |  |
| Hunter | Call Pet / Dismiss Pet | 10 | Bring out or put away the pet | Y | spawn with follows (SummonCompanion exists) |  |
| Hunter | Feed Pet | 10 | Keep the pet happy | X | no pet upkeep |  |
| Hunter | Revive Pet | 10 | Resurrect the pet | R | cast the spawn again |  |
| Hunter | Tame Beast | 10 | Make a beast your permanent pet | R | charm with a targetFactions allowlist (CharmBeast exists); timed, not permanent |  |
| Hunter | Distracting Shot | 12 | Ranged taunt | Y | taunt |  |
| Hunter | Mend Pet | 12 | Channelled pet heal | Y | heal_aura |  |
| Hunter | Wing Clip | 12 | Hit + slow | Y | instant_damage + instant_slow |  |
| Hunter | Eagle Eye | 14 | Zoom the camera far away | X | camera only |  |
| Hunter | Eyes of the Beast | 14 | Control the pet directly | X | camera and control |  |
| Hunter | Scare Beast | 14 | Fear a beast | R | calm with a targetFactions allowlist |  |
| Hunter | Immolation Trap | 16 | Placed trap, burns whoever triggers it | Y | spawn a trap mob carrying dot_aura (FireTotem pattern) |  |
| Hunter | Mongoose Bite | 16 | Counter after a dodge | R | instant_damage; the gate is lost |  |
| Hunter | Multi-Shot | 18 | Hit up to 3 targets | Y | instant_damage, maxTargets 3 |  |
| Hunter | Aspect of the Cheetah | 20 | +30 % speed, dazed when hit | Y | aura with stat_multiplier movementSpeed |  |
| Hunter | Disengage | 20 | Drop threat in melee | Y | detaunt |  |
| Hunter | Freezing Trap | 20 | Placed trap, freezes one enemy | R | spawn a trap mob whose burst stuns or calms |  |
| Hunter | Scorpid Sting | 22 | Enemy hits less often | N | no effect lowers an enemy's output | enemy-debuff |
| Hunter | Beast Lore | 24 | Inspect a beast | X | UI only |  |
| Hunter | Rapid Fire | 26 | +40 % attack speed for 15 s | Y | tick_rate |  |
| Hunter | Frost Trap | 28 | Placed trap, slowing field | Y | spawn a totem carrying slow_aura |  |
| Hunter | Aspect of the Beast | 30 | Untrackable | X | tracking |  |
| Hunter | Feign Death | 30 | Drop combat by playing dead | R | calm + detaunt |  |
| Hunter | Flare | 32 | Reveal stealth in an area | X | no stealth to reveal |  |
| Hunter | Explosive Trap | 34 | Placed trap, AoE burst | Y | projectile with forwardUnits 0 (ThrowMine exists) |  |
| Hunter | Viper Sting | 36 | Drain mana over time | R | one resource: a second Serpent Sting |  |
| Hunter | Aspect of the Pack | 40 | Party +30 % speed | Y | speed_aura (FlyYouFools exists; the caster is excluded) |  |
| Hunter | Volley | 40 | Channelled ground AoE at range | R | self-centred damage_aura, or a projectile dropping a totem |  |
| Hunter | Aspect of the Wild | 46 | Party nature resistance | Y | resist_aura on allies |  |
| Hunter | Tranquilizing Shot | 60 | Remove an enrage | N | no effect removes a buff | dispel |
| Hunter | Aimed Shot | T | Cast-time heavy shot | Y | instant_damage, castTicks |  |
| Hunter | Scatter Shot | T | 4 s disorient | R | calm or stun |  |
| Hunter | Trueshot Aura | T | Party attack power | N | stat_multiplier is self-only | ally-stat |
| Hunter | Bestial Wrath | T | Pet enrages: +50 % damage, CC immune | N | no effect buffs a summon's stats | ally-stat |
| Hunter | Intimidation | T | Pet stuns its target | R | stun from the caster instead of the pet |  |
| Hunter | Deterrence | T | +25 % dodge and parry for 10 s | Y | instant_resist on self |  |
| Hunter | Counterattack | T | Counter after a parry, roots | R | instant_damage + instant_slow; the gate is lost |  |
| Hunter | Wyvern Sting | T | Sleep, then a DoT when it ends | R | calm + instant_dot at once; the sequence is lost |  |
| Paladin | Devotion Aura | 1 | Party armor | Y | resist_aura on allies (physical) |  |
| Paladin | Holy Light | 1 | Cast-time heal | Y | heal_aura lowest_health 1, or instant_hot |  |
| Paladin | Seal of Righteousness | 1 | Each swing adds holy damage | R | a second damage effect on the active aura |  |
| Paladin | Blessing of Might | 4 | Ally attack power (and Greater) | N | stat_multiplier is self-only | ally-stat |
| Paladin | Judgement | 4 | Unleash the active seal on the target | N | no effect reads or consumes another skill's state | state |
| Paladin | Divine Protection | 6 | Immune for 6 s, cannot attack | Y | instant_resist on self (Invulnerability pattern) |  |
| Paladin | Seal of the Crusader | 6 | More attack power, faster weaker swings | R | tick_rate |  |
| Paladin | Hammer of Justice | 8 | Stun | Y | stun (Paralyze exists) |  |
| Paladin | Purify / Cleanse | 8 | Remove poison, disease, magic | N | no effect removes a debuff | dispel |
| Paladin | Blessing of Protection | 10 | Ally immune to physical damage | Y | instant_resist on an ally (physical) |  |
| Paladin | Lay on Hands | 10 | Full heal for all of your mana | Y | heal with healFractionOfMax 1 and a large cost |  |
| Paladin | Redemption | 12 | Revive a dead player | Y | revive |  |
| Paladin | Blessing of Wisdom | 14 | Ally mana regen (and Greater) | R | one resource: a long instant_hot |  |
| Paladin | Retribution Aura | 16 | Party members reflect damage | R | retaliate_damage is self-only |  |
| Paladin | Righteous Fury | 16 | Your holy damage causes more threat | N | no threat multiplier stat | threat-mod |
| Paladin | Blessing of Freedom | 18 | Ally immune to movement impairment | N | no CC immunity buff | cc-immunity |
| Paladin | Exorcism | 20 | Nuke vs undead and demons | Y | instant_damage with a targetFactions allowlist |  |
| Paladin | Flash of Light | 20 | Fast cheap heal | Y | instant_hot / heal_aura |  |
| Paladin | Sense Undead | 20 | Minimap tracking | X | tracking |  |
| Paladin | Concentration Aura | 22 | Party resists cast pushback | X | casts have no pushback |  |
| Paladin | Seal of Justice | 22 | Swings can stun | N | no proc trigger | trigger |
| Paladin | Turn Undead | 24 | Fear one undead | R | calm with a targetFactions allowlist |  |
| Paladin | Blessing of Salvation | 26 | Ally causes 30 % less threat (and Greater) | N | no threat multiplier stat | threat-mod |
| Paladin | Resistance Auras (Shadow, Frost, Fire) | 28 | Party resistance, 3 spells | Y | resist_aura on allies |  |
| Paladin | Divine Intervention | 30 | Die to make an ally immune and out of combat | N | no self-sacrifice trigger | trigger |
| Paladin | Seal of Light | 30 | Swings can heal you | Y | lifesteal_burst (Bloodthirst exists) |  |
| Paladin | Divine Shield | 34 | Immune for 12 s | Y | instant_resist on self (Invulnerability pattern) |  |
| Paladin | Seal of Wisdom | 38 | Swings can restore mana | R | one resource: a second Seal of Light |  |
| Paladin | Blessing of Light | 40 | Ally receives more from your heals (and Greater) | N | no healing-received modifier | heal-mod |
| Paladin | Summon Warhorse / Charger | 40 | Mount | X | no mounts |  |
| Paladin | Hammer of Wrath | 44 | Ranged finisher below 20 % health | Y | instant_damage with executeBelowFraction |  |
| Paladin | Blessing of Sacrifice | 46 | Take part of an ally's damage | N | no damage redirect | redirect |
| Paladin | Holy Wrath | 50 | AoE nuke vs undead and demons | Y | instant_damage all, targetFactions allowlist |  |
| Paladin | Blessing of Kings | T | Ally +10 % all stats (and Greater) | N | stat_multiplier is self-only | ally-stat |
| Paladin | Blessing of Sanctuary | T | Ally takes less damage, blocks hurt the attacker (and Greater) | R | instant_resist on an ally; the reflect half is self-only |  |
| Paladin | Consecration | T | Holy ground around you | Y | damage_aura: the native shape of this game |  |
| Paladin | Divine Favor | T | Next heal crits | N | no effect modifies the next cast | cast-mod |
| Paladin | Holy Shock | T | Instant damage or heal | Y | instant_damage / instant_hot |  |
| Paladin | Holy Shield | T | More block, blocks damage the attacker | Y | instant_resist on self + retaliate_burst |  |
| Paladin | Repentance | T | 6 s incapacitate | R | calm or stun |  |
| Paladin | Sanctity Aura | T | Party holy damage | N | stat_multiplier is self-only | ally-stat |
| Paladin | Seal of Command | T | Swings can deal a large extra hit | R | critChance + critFactor rider on the aura |  |
| Shaman | Healing Wave | 1 | Cast-time heal | Y | heal_aura lowest_health 1, or instant_hot |  |
| Shaman | Lightning Bolt | 1 | Cast-time nuke | Y | instant_damage, castTicks (LightningStrike exists) |  |
| Shaman | Rockbiter Weapon | 1 | Weapon imbue, more attack power | Y | stat_multiplier damageDealt on the aura |  |
| Shaman | Earth Shock | 4 | Nuke + interrupt | R | instant_damage + short stun |  |
| Shaman | Stoneskin Totem | 4 | Party takes less melee damage | Y | spawn a totem carrying resist_aura |  |
| Shaman | Earthbind Totem | 6 | Slowing field | Y | spawn a totem carrying slow_aura |  |
| Shaman | Lightning Shield | 8 | Charges of damage to attackers | Y | retaliate_damage |  |
| Shaman | Stoneclaw Totem | 8 | Totem that taunts | R | spawn a totem mob; whether mobs prefer it is aggro tuning |  |
| Shaman | Flame Shock | 10 | Nuke + burn | Y | instant_damage + instant_dot |  |
| Shaman | Flametongue Weapon | 10 | Weapon imbue, fire damage per swing | Y | a second damage_aura effect (fire) on the aura |  |
| Shaman | Searing Totem | 10 | Totem that shoots one enemy | Y | spawn a totem carrying damage_aura (FireTotem exists) |  |
| Shaman | Strength of Earth Totem | 10 | Party strength | N | stat_multiplier is self-only | ally-stat |
| Shaman | Ancestral Spirit | 12 | Revive a dead player | Y | revive |  |
| Shaman | Fire Nova Totem | 12 | Totem that explodes after 5 s | Y | projectile with forwardUnits 0 and armTicks (ThrowMine exists) |  |
| Shaman | Purge | 12 | Remove enemy buffs | N | no effect removes a buff | dispel |
| Shaman | Cure Poison / Cure Disease | 16 | Remove poison or disease | N | no effect removes a debuff | dispel |
| Shaman | Tremor Totem | 18 | Totem that breaks fear, charm, sleep | N | no effect removes a debuff | dispel |
| Shaman | Frost Shock | 20 | Nuke + slow | Y | instant_damage + instant_slow |  |
| Shaman | Frostbrand Weapon | 20 | Weapon imbue, swings can slow | R | slow_aura beside the damage_aura (always on, no proc) |  |
| Shaman | Ghost Wolf | 20 | Fast travel shape | Y | aura with stat_multiplier movementSpeed, or speed_burst |  |
| Shaman | Healing Stream Totem | 20 | Totem that heals the party | Y | spawn a totem carrying hot_aura / heal_aura |  |
| Shaman | Lesser Healing Wave | 20 | Fast heal | Y | instant_hot / heal_aura |  |
| Shaman | Poison / Disease Cleansing Totem | 22 | Totem that removes poison or disease | N | no effect removes a debuff | dispel |
| Shaman | Water Breathing / Water Walking | 22 | Water utility | X | no water |  |
| Shaman | Resistance Totems (Frost, Fire, Nature) | 24 | Party resistance, 3 spells | Y | spawn a totem carrying resist_aura |  |
| Shaman | Far Sight | 26 | Remote view | X | camera only |  |
| Shaman | Mana Spring Totem | 26 | Party mana regen | R | one resource: a second Healing Stream |  |
| Shaman | Flametongue Totem | 28 | Party weapons deal fire damage | N | no ally damage buff | ally-stat |
| Shaman | Astral Recall | 30 | Second hearthstone | Y | recall |  |
| Shaman | Grounding Totem | 30 | Totem eats one hostile spell | N | no damage redirect | redirect |
| Shaman | Reincarnation | 30 | Self-resurrect on death | N | no on-death trigger | trigger |
| Shaman | Windfury Weapon | 30 | Weapon imbue, chance for extra swings | R | critChance + critFactor rider on the aura |  |
| Shaman | Chain Lightning | 32 | Nuke jumping to 3 targets | Y | instant_damage, maxTargets 3 (the jump falloff is lost) |  |
| Shaman | Windfury Totem | 32 | Party chance for extra swings | N | no ally damage buff | ally-stat |
| Shaman | Sentry Totem | 34 | Remote view | X | camera only |  |
| Shaman | Windwall Totem | 36 | Party takes less ranged damage | Y | spawn a totem carrying resist_aura |  |
| Shaman | Chain Heal | 40 | Heal jumping to 3 allies | Y | heal, lowest_health, maxTargets 3 |  |
| Shaman | Grace of Air Totem | 42 | Party agility | N | stat_multiplier is self-only | ally-stat |
| Shaman | Tranquil Air Totem | 50 | Party causes less threat | N | no threat multiplier stat | threat-mod |
| Shaman | Elemental Mastery | T | Next spell crits for free | N | no effect modifies the next cast | cast-mod |
| Shaman | Nature's Swiftness | T | Next spell is instant | N | no effect modifies the next cast | cast-mod |
| Shaman | Stormstrike | T | Hit + target takes more nature damage | Y | instant_damage + instant_resist factor > 1 |  |
| Shaman | Mana Tide Totem | T | Burst of party mana regen | R | one resource: a totem carrying hot_aura |  |
