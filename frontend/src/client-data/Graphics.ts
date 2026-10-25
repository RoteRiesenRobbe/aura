import {meter2px} from './BasicConfig';
import {color, integer} from '../features/common/logic/Types';
import {LAND_COLOR} from './Theme';
import type {MedallionSpec} from './Medallions';

/**
 * Physical collider radius the backend uses for the player body, in meters.
 * Pinned to api/shared-constants.json `playerColliderRadius` via
 * SharedConstants.test.ts; Go twin: player.ColliderRadiusMeters
 * (model/player/player.go), asserted by cmd/aurad/shared_constants_test.go.
 */
const PLAYER_COLLIDER_RADIUS_METERS = 0.25;

export const GraphicsConfig = {

    // Derived from Theme so the page background (LESS @land-color) and the
    // terrain stay one fact; the LESS side is pinned by Theme.test.ts.
    landColor: <color> LAND_COLOR,

    hitAnimation: {
        /**
         * Maximum opacity of the flood filter that applied on game objects when they are hit.
         */
        floodOpacity: <number> 1,
        duration: <number> 500, //ms
    },

    character: {
        /**
         * Pixel radius of the character graphic. The sprite is drawn at the
         * physical body's size, so this derives from the collider radius
         * (30 px today) instead of restating it.
         */
        size: <number> meter2px(PLAYER_COLLIDER_RADIUS_METERS),
        file: require('../features/game-objects/assets/characters/player.png'),
        // Optional icon-pack portrait (README "Icons (PONETI pack)"): the
        // pack-manifest name that replaces `file` when the pack is loaded on
        // this machine. `file` stays the fallback everywhere else.
        packIcon: <string | undefined> undefined,
        /**
         * Physical collider radius used by backend for player body; see the
         * pinned constant above.
         */
        colliderRadiusMeters: <number> PLAYER_COLLIDER_RADIUS_METERS,

        hands: {
            fillColor: <color> 0xf2a586,
            lineColor: <color> 0x000000,
        },

    },

    mobs: <{
        [key: string]:
            {
                file: string,
                // Optional icon-pack portrait: a pack-manifest name that
                // replaces `file` when the pack is loaded on this machine
                // (README "Icons (PONETI pack)"); `file` stays the fallback.
                packIcon?: string,
                // Optional colour the pack portrait is multiplied by, baked
                // once into its texture (plan-appearance.md D33): kin that
                // share a bust and differ by colour. Never applies to `file`.
                packTint?: color,
                // Present = the species wears a medallion: its ring comes from
                // its faction's family (client-data/Medallions.ts), and it draws
                // at its collider's size, the wire radius, with no roll (D15,
                // PO 2026-10-17). Such a species authors no minSize.
                medallion?: MedallionSpec,
                // The per-instance size roll of a species WITHOUT a medallion.
                minSize?: number,
                // For an SVG portrait, the size it is rasterised at; a PNG
                // ignores it (Preloading.registerGameObjectSVG).
                maxSize: number,
                anchor?: {x: number, y: number}
            }
    }>{
        totem: {
            file: require('../features/game-objects/assets/mobs/totem.svg'),
            minSize: <number> 50,
            maxSize: <number> 50,
        },

        companion: {
            file: require('../features/game-objects/assets/mobs/companion.svg'),
            packIcon: 'portrait-black-hound',
            medallion: <MedallionSpec> {},
            maxSize: <number> 40,
        },

        campfire: {
            file: require('../features/game-objects/assets/mobs/campfire.png'),
            minSize: <number> 60,
            maxSize: <number> 60,
        },

        // The player-placed mini-campfire (downtime C2). Half the permanent
        // fire's 60 px [PLACEHOLDER, PO 2026-08-03]: it reuses the campfire
        // artwork for now, so SIZE is the only thing telling a player that the
        // thing they put down is temporary and personal rather than a landmark.
        camp: {
            file: require('../features/game-objects/assets/mobs/campfire.png'),
            minSize: <number> 30,
            maxSize: <number> 30,
        },

        turnip: {
            file: require('../features/game-objects/assets/mobs/turnip.svg'),
            packIcon: 'portrait-onion',
            // A purple-white turnip from the pack's onion (the pack has no
            // turnip, D34) [PLACEHOLDER shade].
            packTint: <color> 0xe0c0ff,
            medallion: <MedallionSpec> {},
            maxSize: <number> 26,
        },

        // The Turnip's forest-floor twins: same body, same size band.
        blueMushroom: {
            file: require('../features/game-objects/assets/mobs/blueMushroom.svg'),
            packIcon: 'portrait-mana-mushroom',
            medallion: <MedallionSpec> {},
            maxSize: <number> 26,
        },

        // Grandfather Knot's grove (docs/plan-grandfather-knot.md): a branch
        // heap, a little larger than the mushrooms.
        deadwood: {
            file: require('../features/game-objects/assets/mobs/deadwood.svg'),
            packIcon: 'portrait-tree-man',
            medallion: <MedallionSpec> {},
            maxSize: <number> 32,
        },

        // A talkable dead body (lore, quest talk_to targets): drawn flat like
        // the deadwood, never in a medallion. Shares its file with the
        // Remains prop; 54 = the prop's 0.45 radius x 120 px/unit, so a talkable
        // body and a silent one look the same size.
        remains: {
            file: require('../features/game-objects/assets/resources/remains.svg'),
            minSize: <number> 54,
            maxSize: <number> 54,
        },

        redMushroom: {
            file: require('../features/game-objects/assets/mobs/redMushroom.svg'),
            packIcon: 'portrait-fly-agaric',
            medallion: <MedallionSpec> {},
            maxSize: <number> 26,
        },

        // The beach's harvest-mob: a heap of washed-up kelp, a little wider
        // than a Turnip.
        seaweed: {
            file: require('../features/game-objects/assets/mobs/seaweed.svg'),
            packIcon: 'portrait-sea-kale',
            medallion: <MedallionSpec> {},
            maxSize: <number> 34,
        },

        // The beach's crab: placeholder art (one raised crusher, rust red)
        // until the Zone 1 art pass; the pack bust wins where it is loaded.
        sandClamper: {
            file: require('../features/game-objects/assets/mobs/sandClamper.svg'),
            packIcon: 'portrait-crab',
            medallion: <MedallionSpec> {},
            maxSize: <number> 46,
        },

        // Z1 wildlife + brambles (content pass C2).
        wolf: {
            file: require('../features/game-objects/assets/mobs/wolf.png'),
            packIcon: 'portrait-grey-wolf',
            medallion: <MedallionSpec> {},
            maxSize: <number> 46,
        },

        bear: {
            file: require('../features/game-objects/assets/mobs/bear.png'),
            packIcon: 'portrait-brown-bear',
            medallion: <MedallionSpec> {},
            maxSize: <number> 82,
        },

        boar: {
            file: require('../features/game-objects/assets/mobs/wildboar.png'),
            packIcon: 'portrait-boar',
            medallion: <MedallionSpec> {},
            maxSize: <number> 56,
        },

        // Zone 1's one elite. It used to roll a size bigger than the Boar it
        // leads; since D15 (PO 2026-10-17) it draws at its collider (0.5 m vs
        // the Boar's 0.4) and its tier rim carries the elite read.
        alphaBoar: {
            file: require('../features/game-objects/assets/mobs/wildboar_alpha.png'),
            packIcon: 'portrait-snarling-boar',
            medallion: <MedallionSpec> {},
            maxSize: <number> 62,
        },

        // First medallion-layered COMBAT mob. It used to roll its size per
        // instance; since D15 (PO 2026-10-17) every medallion draws at its
        // collider's size, so frame and portrait share the wire radius.
        stag: {
            file: require('../features/game-objects/assets/mobs/stag.png'),
            packIcon: 'portrait-doe',
            medallion: <MedallionSpec> {},
            maxSize: <number> 50,
        },

        // Placeholder art (plan-herding.md D11): the herd Hans wants back in
        // his pen, and the three named strays. A touch smaller than the stag.
        sheep: {
            file: require('../features/game-objects/assets/mobs/sheep.svg'),
            packIcon: 'portrait-sheep',
            medallion: <MedallionSpec> {},
            maxSize: <number> 44,
        },

        eliteWolf: {
            file: require('../features/game-objects/assets/mobs/eliteWolf.png'),
            packIcon: 'portrait-golden-wolf',
            medallion: <MedallionSpec> {},
            maxSize: <number> 64,
        },

        // maxSize is the 0.9 u body's radius (108 px): any smaller and the
        // medallion draws an upscaled, pixelated bake of the SVG.
        bramble: {
            file: require('../features/game-objects/assets/mobs/bramble.svg'),
            packIcon: 'portrait-carnivorous-plant',
            medallion: <MedallionSpec> {},
            maxSize: <number> 108,
        },

        // C3 kobold hideout + Dark Tunnel (content pass C3).
        kobold: {
            file: require('../features/game-objects/assets/mobs/kobold.png'),
            packIcon: 'portrait-goblin',
            medallion: <MedallionSpec> {},
            maxSize: <number> 36,
        },

        koboldRanged: {
            file: require('../features/game-objects/assets/mobs/koboldRanged.png'),
            packIcon: 'portrait-helmet-goblin',
            medallion: <MedallionSpec> {},
            maxSize: <number> 36,
        },

        spider: {
            file: require('../features/game-objects/assets/mobs/spider.svg'),
            packIcon: 'portrait-spider',
            medallion: <MedallionSpec> {},
            maxSize: <number> 46,
        },

        venomSpider: {
            file: require('../features/game-objects/assets/mobs/venomSpider.svg'),
            packIcon: 'portrait-green-spider',
            medallion: <MedallionSpec> {},
            maxSize: <number> 50,
        },

        poisonPool: {
            file: require('../features/game-objects/assets/mobs/poisonPool.svg'),
            minSize: <number> 60,
            maxSize: <number> 70,
        },

        // Drawn at the web AURA's radius (1.5 m = 180 px), not its 0.5 m body
        // like the pool: the picture is how a player reads where the slow is.
        // Fixed size, so every web promises the same area.
        spiderWeb: {
            file: require('../features/game-objects/assets/mobs/spiderWeb.svg'),
            minSize: <number> 180,
            maxSize: <number> 180,
        },

        rockfall: {
            file: require('../features/game-objects/assets/mobs/rockfall.svg'),
            minSize: <number> 58,
            maxSize: <number> 66,
        },

        // C4 Z2 village + bandit gate (content pass C4).
        bandit: {
            file: require('../features/game-objects/assets/mobs/bandit.png'),
            packIcon: 'portrait-robber',
            medallion: <MedallionSpec> {},
            maxSize: <number> 42,
        },

        banditRanged: {
            file: require('../features/game-objects/assets/mobs/banditRanged.svg'),
            packIcon: 'portrait-crossbowman',
            medallion: <MedallionSpec> {},
            maxSize: <number> 42,
        },

        banditHealer: {
            file: require('../features/game-objects/assets/mobs/banditHealer.svg'),
            packIcon: 'portrait-plague-doctor',
            medallion: <MedallionSpec> {},
            maxSize: <number> 42,
        },

        eliteBandit: {
            file: require('../features/game-objects/assets/mobs/eliteBandit.svg'),
            packIcon: 'portrait-assassin',
            medallion: <MedallionSpec> {},
            maxSize: <number> 58,
        },

        rallyDrummer: {
            file: require('../features/game-objects/assets/mobs/rallyDrummer.svg'),
            packIcon: 'portrait-feathered-chief',
            medallion: <MedallionSpec> {},
            maxSize: <number> 50,
        },

        armySoldier: {
            file: require('../features/game-objects/assets/mobs/armySoldier.svg'),
            packIcon: 'portrait-footman',
            medallion: <MedallionSpec> {},
            maxSize: <number> 42,
        },

        orc: {
            file: require('../features/game-objects/assets/mobs/orc.png'),
            packIcon: 'portrait-orc-brute',
            medallion: <MedallionSpec> {},
            maxSize: <number> 60,
        },

        spikeBarricade: {
            file: require('../features/game-objects/assets/mobs/spikeBarricade.svg'),
            minSize: <number> 60,
            maxSize: <number> 66,
        },

        orcWarlord: {
            file: require('../features/game-objects/assets/mobs/orcWarlord.svg'),
            packIcon: 'portrait-orc-warlord',
            medallion: <MedallionSpec> {},
            maxSize: <number> 84,
        },

        warbannerTotem: {
            file: require('../features/game-objects/assets/mobs/warbannerTotem.svg'),
            minSize: <number> 50,
            maxSize: <number> 54,
        },

        orcGrunt: {
            file: require('../features/game-objects/assets/mobs/orcGrunt.svg'),
            packIcon: 'portrait-orc-green',
            medallion: <MedallionSpec> {},
            maxSize: <number> 48,
        },

        soldierCompanion: {
            file: require('../features/game-objects/assets/mobs/soldierCompanion.svg'),
            packIcon: 'portrait-plate-knight',
            medallion: <MedallionSpec> {},
            maxSize: <number> 38,
        },

        shieldbearerCompanion: {
            file: require('../features/game-objects/assets/mobs/shieldbearerCompanion.svg'),
            packIcon: 'portrait-armored-knight',
            medallion: <MedallionSpec> {},
            maxSize: <number> 42,
        },

        medicCompanion: {
            file: require('../features/game-objects/assets/mobs/medicCompanion.svg'),
            packIcon: 'portrait-white-monk',
            medallion: <MedallionSpec> {},
            maxSize: <number> 36,
        },

        troll: {
            file: require('../features/game-objects/assets/mobs/troll.svg'),
            packIcon: 'portrait-troll',
            medallion: <MedallionSpec> {},
            maxSize: <number> 72,
        },

        banditPyromancer: {
            file: require('../features/game-objects/assets/mobs/banditPyromancer.svg'),
            packIcon: 'portrait-cultist',
            medallion: <MedallionSpec> {},
            maxSize: <number> 52,
        },

        // cL8-17 farm band + unique-art pass (2026-07-21): the dires get own
        // sprites (were Wolf/Bear reskins via entityType), sized between
        // their base kin and the elites/apex of their line.
        direWolf: {
            file: require('../features/game-objects/assets/mobs/direWolf.png'),
            packIcon: 'portrait-snarling-wolf',
            medallion: <MedallionSpec> {},
            maxSize: <number> 56,
        },

        direBear: {
            file: require('../features/game-objects/assets/mobs/direBear.png'),
            packIcon: 'portrait-roaring-bear',
            medallion: <MedallionSpec> {},
            maxSize: <number> 90,
        },

        giantSpider: {
            file: require('../features/game-objects/assets/mobs/giantSpider.svg'),
            packIcon: 'portrait-blue-spider',
            medallion: <MedallionSpec> {},
            maxSize: <number> 68,
        },

        alphaWolf: {
            file: require('../features/game-objects/assets/mobs/alphaWolf.png'),
            packIcon: 'portrait-shadow-wolf',
            medallion: <MedallionSpec> {},
            maxSize: <number> 68,
        },

        marauder: {
            file: require('../features/game-objects/assets/mobs/marauder.png'),
            packIcon: 'portrait-eyepatch-robber',
            medallion: <MedallionSpec> {},
            maxSize: <number> 52,
        },

        fireElemental: {
            file: require('../features/game-objects/assets/mobs/fireElemental.svg'),
            packIcon: 'portrait-fire-elemental',
            medallion: <MedallionSpec> {},
            maxSize: <number> 62,
        },

        // The Ashen Fields fire pair. `file` is the loud "?" placeholder: the
        // pack portrait is the only art, so builds without the atlases show it.
        firelord: {
            file: require('../features/game-objects/assets/resources/npcPlaceholder.svg'),
            packIcon: 'portrait-firelord',
            medallion: <MedallionSpec> {},
            maxSize: <number> 64,
        },
        fireStirer: {
            file: require('../features/game-objects/assets/resources/npcPlaceholder.svg'),
            packIcon: 'portrait-fire-stirer',
            medallion: <MedallionSpec> {},
            maxSize: <number> 60,
        },

        // Elite — deliberately larger than the lesser elemental so the tier
        // reads at a glance (body radius 0.55 vs 0.4).
        greaterFireElemental: {
            file: require('../features/game-objects/assets/mobs/greaterFireElemental.svg'),
            packIcon: 'portrait-magma-golem',
            medallion: <MedallionSpec> {},
            maxSize: <number> 84,
        },

        // Sized to match the plain totem (50/50) — they are siblings.
        fireTotem: {
            file: require('../features/game-objects/assets/mobs/fireTotem.svg'),
            minSize: <number> 50,
            maxSize: <number> 50,
        },
    },

    // NPC sprites (content pass C2). Since the actor merge (chunk 3a) an NPC is
    // an ordinary mob carrying an interaction block, so these ride the Mob wire
    // path and are referenced by the MOB definition's entityType. Sized like props.
    npcs: {
        // "Missing art" marker, rendered by authoring "entityType":
        // "NpcPlaceholder" on a mob definition. Loud on purpose, so an
        // unconfigured NPC cannot pass for content.
        placeholder: {
            file: require('../features/game-objects/assets/resources/npcPlaceholder.svg'),
            medallion: <MedallionSpec> {},
            maxSize: <number> 60,
        },
        signpost: {
            file: require('../features/game-objects/assets/resources/signpost.svg'),
            maxSize: <number> 55,
        },
        hermit: {
            file: require('../features/game-objects/assets/resources/hermit.png'),
            packIcon: 'portrait-prophet',
            medallion: <MedallionSpec> {},
            maxSize: <number> 60,
        },
        // ⭐ First medallion-layered NPC (art overhaul spike, 2026-08-15).
        // `file` is the PORTRAIT (background baked in for now); its medallion
        // ring is drawn over it. Both are 256×256 PNGs — a shared square canvas
        // is what makes them line up — see docs/art/pipeline.md §4.
        // PNG, not SVG: the art is painted, so an SVG export only ever wrapped
        // embedded rasters (98% of the old files). 256 px covers a 4K display at
        // the nearest zoom level; `maxSize` no longer sizes the texture, only
        // `size` from the entity scales it (Preloading.ts:55 is SVG-only).
        farmer: {
            file: require('../features/game-objects/assets/resources/farmer.png'),
            packIcon: 'portrait-bandana-farmer',
            medallion: <MedallionSpec> {},
            maxSize: <number> 60,
        },
        wanderer: {
            file: require('../features/game-objects/assets/resources/wanderer.svg'),
            packIcon: 'portrait-hooded-woman',
            medallion: <MedallionSpec> {},
            maxSize: <number> 60,
        },
        traveller: {
            file: require('../features/game-objects/assets/resources/traveller.svg'),
            packIcon: 'portrait-turban-elder',
            medallion: <MedallionSpec> {},
            maxSize: <number> 60,
        },
        townCrier: {
            file: require('../features/game-objects/assets/resources/townCrier.png'),
            packIcon: 'portrait-messenger',
            medallion: <MedallionSpec> {},
            maxSize: <number> 60,
        },
        dogNpc: {
            file: require('../features/game-objects/assets/resources/dogNpc.svg'),
            packIcon: 'portrait-black-hound',
            medallion: <MedallionSpec> {},
            maxSize: <number> 45,
        },
        miner: {
            file: require('../features/game-objects/assets/resources/miner.svg'),
            packIcon: 'portrait-dwarf',
            medallion: <MedallionSpec> {},
            maxSize: <number> 60,
        },
        cityGuard: {
            file: require('../features/game-objects/assets/resources/cityGuard.png'),
            packIcon: 'portrait-guard',
            medallion: <MedallionSpec> {},
            maxSize: <number> 60,
        },
        villageHealer: {
            file: require('../features/game-objects/assets/resources/villageHealer.svg'),
            packIcon: 'portrait-alchemist',
            medallion: <MedallionSpec> {},
            maxSize: <number> 60,
        },
        frontCaptain: {
            file: require('../features/game-objects/assets/resources/frontCaptain.svg'),
            packIcon: 'portrait-gold-helm',
            medallion: <MedallionSpec> {},
            maxSize: <number> 60,
        },
        // The wise old tree (docs/plan-grandfather-knot.md). Twice a normal NPC:
        // the drawn size follows his body radius (0.7, every other NPC 0.35),
        // so maxSize doubles only to match. The bark ring, not the grey one: a
        // tree in the forest frame (PO 2026-10-03), his own ring (D23).
        grandfatherKnot: {
            file: require('../features/game-objects/assets/resources/grandfatherKnot.png'),
            packIcon: 'portrait-old-tree-man',
            medallion: <MedallionSpec> {ring: 'forest'},
            maxSize: <number> 120,
        },
    },

    // The player's portraits, keyed by the api/appearance item id
    // (plan-appearance.md C3, D39: PONETI busts like the mobs', PO pick
    // 2026-10-20). Without the pack every one draws `character.file`.
    playerPortraits: <{ [item: string]: { packIcon: string } }> {
        'default': {packIcon: 'portrait-morion-helm'},
        'red-hood': {packIcon: 'portrait-red-hood'},
        'chainmail-coif': {packIcon: 'portrait-chainmail-coif'},
        'green-hood': {packIcon: 'portrait-green-hood'},
        'grey-beard': {packIcon: 'portrait-grey-beard'},
        'bright-smile': {packIcon: 'portrait-bright-smile'},
        'short-crop': {packIcon: 'portrait-short-crop'},
        'auburn-curls': {packIcon: 'portrait-auburn-curls'},
        // Earned, not a starter (C5, PO pick 2026-10-21).
        'villager': {packIcon: 'portrait-villager'},
        // Only the ascension stone grants it (C5b) [PLACEHOLDER bust].
        'gold-amulet': {packIcon: 'portrait-gold-amulet'},
    },

    // Per-SPECIES portraits for species that share one sprite class, keyed by
    // the catalog name (api/mobs `name`), so each one draws its own pack bust
    // (plan-appearance.md D33). Today: the species drawing the NpcPlaceholder
    // marker, which otherwise all wear the same purple face. Resolved in
    // Mob.resolvePortrait once the /mobs catalog names the species; without
    // the pack the class's `file` stays. A `packTint` recolours a bust that a
    // kin species shares (D33, D34) [PLACEHOLDER shades].
    speciesPortraits: <{ [species: string]: { packIcon: string, packTint?: color } }> {
        BlightedTreant: {packIcon: 'portrait-tree-man', packTint: <color> 0xa0c088},
        CultAcolyte: {packIcon: 'portrait-hades-servant'},
        CultHighPriest: {packIcon: 'portrait-old-cultist'},
        Cultist: {packIcon: 'portrait-purple-hood'},
        DeathKnight: {packIcon: 'portrait-death-knight'},
        Dragon: {packIcon: 'portrait-war-dragon'},
        DragonkinWarrior: {packIcon: 'portrait-dragon-warrior'},
        Drakeling: {packIcon: 'portrait-purple-drake'},
        Ghoul: {packIcon: 'portrait-zombie'},
        GiantRat: {packIcon: 'portrait-rat'},
        GiantScorpion: {packIcon: 'portrait-scorpion'},
        Mercenary: {packIcon: 'portrait-warrior'},
        MercenaryCaptain: {packIcon: 'portrait-bold-warrior'},
        MercenaryCrossbowman: {packIcon: 'portrait-spearman'},
        SandBasilisk: {packIcon: 'portrait-lizard'},
        Skeleton: {packIcon: 'portrait-skeleton'},
        SkeletonArcher: {packIcon: 'portrait-helmet-skeleton'},
        Treant: {packIcon: 'portrait-tree-man'},
        Wisp: {packIcon: 'portrait-ghost'},
    },

    // Player corpse (chunk 4): gravestone placeholder at the deathspot.
    corpse: {
        file: require('../features/game-objects/assets/corpse.svg'),
        size: <number> 50,
    },

    // No `resources` entry: trees and rocks draw through the generic prop path
    // (Props.ts), which reads each sprite from its api/props/*.json, and their
    // resource-spot decals were retired (plan-prop-draw-order.md P2, D8).

    miniMap: {
        /**
         * Every icon has a color and a size. Sizes are scaled just like the mini map.
         * `tree`, `stone` and `prop` are not live icons any more: they style the
         * props MapTerrain bakes from the zone data (MapProps).
         */
        icons: <{[key: string]: {color: color, alpha: number, sizeFactor: number}}> {
            character: {
                color: 0x00008B,
                alpha: 1,
                sizeFactor: 3,
            },
            /**
             * Another player, from the 1 Hz roster (plan-world-map.md C3, D7).
             * PO ruling: the same shape and size as your own dot, a different
             * colour — so the SAME sizeFactor is deliberate and MapPlayers
             * multiplies it by the very iconSizeFactor the AOI icons use.
             *
             * White [PLACEHOLDER]: it has to separate from your own dark-blue
             * dot AND from the campfire markers' orange ring (0xE37313), on
             * green terrain full-screen and on the dark HUD box docked.
             */
            otherPlayer: {
                color: 0xFFFFFF,
                alpha: 0.9,
                sizeFactor: 3,
            },
            tree: {
                color: 0x1F5B0B,
                alpha: 0.8,
                sizeFactor: 0.6,
            },
            stone: {
                color: 0x737373,
                alpha: 1,
                sizeFactor: 1,
            },
            /**
             * Every other placed prop (buildings, carts, stumps, fences): its
             * true footprint (sizeFactor 0.5 × MapProps.MAP_ICON_SIZE = 1).
             * The three prop styles are baked into the terrain from the zone
             * data (MapProps). [PLACEHOLDER] colour.
             */
            prop: {
                color: 0x4A3A28,
                alpha: 0.85,
                sizeFactor: 0.5,
            },
        },
    },

    vitalSigns: {
        /**
         * How many milliseconds old values are shown, after a vital sign has been reduced.
         */
        fadeInMS: <number> 1500,
    },

    /**
     * Contains information about types of ground textures that are available for placing.
     */
    groundTextureTypes: <{[key: string]: {displayName: string, file: string, minSize: number, maxSize: number }}> {
        'Dark Green Grass 1': {
            displayName: 'Greens - Gras, dark 1',
            file: require('../features/ground-textures/assets/textures/darkGrass1.svg'),
            minSize: 180,
            maxSize: 300,
        },
        'Dark Green Grass 2': {
            displayName: 'Greens - Gras, dark 2',
            file: require('../features/ground-textures/assets/textures/darkGrass2.svg'),
            minSize: 180,
            maxSize: 300,
        },
        'Green Grass 1': {
            displayName: 'Greens - Gras 1',
            file: require('../features/ground-textures/assets/textures/grass1.svg'),
            minSize: 180,
            maxSize: 300,
        },
        'Green Grass 2': {
            displayName: 'Greens - Gras 2',
            file: require('../features/ground-textures/assets/textures/grass2.svg'),
            minSize: 180,
            maxSize: 300,
        },
        'Dark Stone Patch': {
            displayName: 'Greys - Stone Patch, dark',
            file: require('../features/ground-textures/assets/textures/darkStonePatch.svg'),
            minSize: 130,
            maxSize: 300,
        },
        'Stone Patch': {
            displayName: 'Greys - Stone Patch',
            file: require('../features/ground-textures/assets/textures/stonePatch.svg'),
            minSize: 130,
            maxSize: 300,
        },
        'Pebble': {
            displayName: 'Greys - Pebbles',
            file: require('../features/ground-textures/assets/textures/pebble.svg'),
            minSize: 130,
            maxSize: 200,
        },
        'Dark Pebble': {
            displayName: 'Greys - Pebbles, dark',
            file: require('../features/ground-textures/assets/textures/darkPebble.svg'),
            minSize: 130,
            maxSize: 200,
        },
        'Rubble': {
            displayName: 'Greys - Rubble',
            file: require('../features/ground-textures/assets/textures/rubble.svg'),
            minSize: 50,
            maxSize: 100,
        },
        'Dark Rubble': {
            displayName: 'Greys - Rubble, dark',
            file: require('../features/ground-textures/assets/textures/darkRubble.svg'),
            minSize: 50,
            maxSize: 100,
        },
        'Puddle': {
            displayName: 'Blues - Puddle',
            file: require('../features/ground-textures/assets/textures/puddle.svg'),
            minSize: 60,
            maxSize: 140,
        },
        'Dark Puddle': {
            displayName: 'Blues - Puddle, dark',
            file: require('../features/ground-textures/assets/textures/darkPuddle.svg'),
            minSize: 60,
            maxSize: 140,
        },
        'Flowers': {
            displayName: 'Pinks - Flowers, white outlined',
            file: require('../features/ground-textures/assets/textures/flowers.png'),
            minSize: 70,
            maxSize: 100,
        },
        'Leaves': {
            displayName: 'Greens - Leaves',
            file: require('../features/ground-textures/assets/textures/leaves.svg'),
            minSize: 50,
            maxSize: 100,
        },
        'Sand': {
            displayName: 'Yellows - Sand',
            file: require('../features/ground-textures/assets/textures/sand1.png'),
            minSize: 150,
            maxSize: 200,
        },
        /**
         * Same shape as sand, but same color as {@link landColor}.
         */
        'Land': {
            displayName: 'Greens - Land',
            file: require('../features/ground-textures/assets/textures/land1.svg'),
            minSize: 150,
            maxSize: 200,
        },
        // The coast set (docs/art/assets.csv): beach and clifftop dressing for
        // the Strand, Wrecker's Bluff and Netmender's Coast. Placeholder SVGs.
        'Saltgrass': {
            displayName: 'Greens - Saltgrass',
            file: require('../features/ground-textures/assets/textures/saltgrass.svg'),
            minSize: 100,
            maxSize: 220,
        },
        'Dune Grass': {
            displayName: 'Yellows - Dune Grass',
            file: require('../features/ground-textures/assets/textures/duneGrass.svg'),
            minSize: 80,
            maxSize: 180,
        },
        'Shells': {
            displayName: 'Whites - Shells',
            file: require('../features/ground-textures/assets/textures/shells.svg'),
            minSize: 50,
            maxSize: 110,
        },
        /** A LINE drawn west to east: rotate it along the shore and overlap the ends. */
        'Kelp Line': {
            displayName: 'Browns - Kelp Line',
            file: require('../features/ground-textures/assets/textures/kelpLine.svg'),
            minSize: 120,
            maxSize: 300,
        }
    }
};
