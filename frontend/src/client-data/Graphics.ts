import {meter2px} from './BasicConfig';
import {color, integer} from '../features/common/logic/Types';
import {LAND_COLOR} from './Theme';

/**
 * Physical collider radius the backend uses for the player body, in meters.
 * Pinned to api/shared-constants.json `playerColliderRadius` via
 * SharedConstants.test.ts; Go twin: player.ColliderRadiusMeters
 * (model/player/player.go), asserted by cmd/aurad/shared_constants_test.go.
 */
const PLAYER_COLLIDER_RADIUS_METERS = 0.25;

export const GraphicsConfig = {

    deepWaterColor: <color> 0x1C57B5,
    shallowWaterColor: <color> 0x287aff,
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
        file: require('../features/game-objects/assets/characters/player.svg'),
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
                minSize: number,
                maxSize: number,
                anchor?: {x: number, y: number}
            }
    }>{
        dodo: {
            file: require('../features/game-objects/assets/mobs/boar.svg'),
            minSize: <number> 35,
            maxSize: <number> 45,
        },

        saberToothCat: {
            file: require('../features/game-objects/assets/mobs/lion.svg'),
            minSize: <number> 45,
            maxSize: <number> 60,
        },

        mammoth: {
            file: require('../features/game-objects/assets/mobs/skeleton.svg'),
            minSize: <number> 60,
            maxSize: <number> 80,
        },

        angryMammoth: {
            file: require('../features/game-objects/assets/mobs/angryMammoth.svg'),
            minSize: <number> 180,
            maxSize: <number> 220,
        },

        totem: {
            file: require('../features/game-objects/assets/mobs/totem.svg'),
            minSize: <number> 50,
            maxSize: <number> 50,
        },

        rabbit: {
            file: require('../features/game-objects/assets/mobs/rabbit.svg'),
            minSize: <number> 22,
            maxSize: <number> 30,
        },

        companion: {
            file: require('../features/game-objects/assets/mobs/companion.svg'),
            minSize: <number> 40,
            maxSize: <number> 40,
        },

        brazier: {
            file: require('../features/game-objects/assets/mobs/brazier.svg'),
            minSize: <number> 50,
            maxSize: <number> 50,
        },

        healer: {
            file: require('../features/game-objects/assets/mobs/healer.svg'),
            minSize: <number> 44,
            maxSize: <number> 44,
        },

        campfire: {
            file: require('../features/game-objects/assets/mobs/campfire.svg'),
            minSize: <number> 60,
            maxSize: <number> 60,
        },

        // The player-placed mini-campfire (downtime C2). Half the permanent
        // fire's 60 px [PLACEHOLDER, PO 2026-08-03]: it reuses the campfire
        // artwork for now, so SIZE is the only thing telling a player that the
        // thing they put down is temporary and personal rather than a landmark.
        camp: {
            file: require('../features/game-objects/assets/mobs/campfire.svg'),
            minSize: <number> 30,
            maxSize: <number> 30,
        },

        turnip: {
            file: require('../features/game-objects/assets/mobs/turnip.svg'),
            minSize: <number> 20,
            maxSize: <number> 26,
        },

        // Z1 wildlife + brambles (content pass C2). wildboar.svg because
        // boar.svg is taken by the legacy Dodo skin.
        wolf: {
            file: require('../features/game-objects/assets/mobs/wolf.svg'),
            minSize: <number> 38,
            maxSize: <number> 46,
        },

        bear: {
            file: require('../features/game-objects/assets/mobs/bear.svg'),
            minSize: <number> 70,
            maxSize: <number> 82,
        },

        boar: {
            file: require('../features/game-objects/assets/mobs/wildboar.svg'),
            minSize: <number> 46,
            maxSize: <number> 56,
        },

        stag: {
            file: require('../features/game-objects/assets/mobs/stag.svg'),
            minSize: <number> 42,
            maxSize: <number> 50,
        },

        eliteWolf: {
            file: require('../features/game-objects/assets/mobs/eliteWolf.svg'),
            minSize: <number> 56,
            maxSize: <number> 64,
        },

        bramble: {
            file: require('../features/game-objects/assets/mobs/bramble.svg'),
            minSize: <number> 58,
            maxSize: <number> 66,
        },

        // C3 kobold hideout + Dark Tunnel (content pass C3).
        kobold: {
            file: require('../features/game-objects/assets/mobs/kobold.svg'),
            minSize: <number> 30,
            maxSize: <number> 36,
        },

        koboldRanged: {
            file: require('../features/game-objects/assets/mobs/koboldRanged.svg'),
            minSize: <number> 30,
            maxSize: <number> 36,
        },

        spider: {
            file: require('../features/game-objects/assets/mobs/spider.svg'),
            minSize: <number> 38,
            maxSize: <number> 46,
        },

        venomSpider: {
            file: require('../features/game-objects/assets/mobs/venomSpider.svg'),
            minSize: <number> 42,
            maxSize: <number> 50,
        },

        poisonPool: {
            file: require('../features/game-objects/assets/mobs/poisonPool.svg'),
            minSize: <number> 60,
            maxSize: <number> 70,
        },

        rockfall: {
            file: require('../features/game-objects/assets/mobs/rockfall.svg'),
            minSize: <number> 58,
            maxSize: <number> 66,
        },

        // C4 Z2 village + bandit gate (content pass C4).
        bandit: {
            file: require('../features/game-objects/assets/mobs/bandit.svg'),
            minSize: <number> 36,
            maxSize: <number> 42,
        },

        banditRanged: {
            file: require('../features/game-objects/assets/mobs/banditRanged.svg'),
            minSize: <number> 36,
            maxSize: <number> 42,
        },

        banditHealer: {
            file: require('../features/game-objects/assets/mobs/banditHealer.svg'),
            minSize: <number> 36,
            maxSize: <number> 42,
        },

        eliteBandit: {
            file: require('../features/game-objects/assets/mobs/eliteBandit.svg'),
            minSize: <number> 50,
            maxSize: <number> 58,
        },

        rallyDrummer: {
            file: require('../features/game-objects/assets/mobs/rallyDrummer.svg'),
            minSize: <number> 44,
            maxSize: <number> 50,
        },

        armySoldier: {
            file: require('../features/game-objects/assets/mobs/armySoldier.svg'),
            minSize: <number> 36,
            maxSize: <number> 42,
        },

        orc: {
            file: require('../features/game-objects/assets/mobs/orc.svg'),
            minSize: <number> 52,
            maxSize: <number> 60,
        },

        spikeBarricade: {
            file: require('../features/game-objects/assets/mobs/spikeBarricade.svg'),
            minSize: <number> 60,
            maxSize: <number> 66,
        },

        orcWarlord: {
            file: require('../features/game-objects/assets/mobs/orcWarlord.svg'),
            minSize: <number> 78,
            maxSize: <number> 84,
        },

        warbannerTotem: {
            file: require('../features/game-objects/assets/mobs/warbannerTotem.svg'),
            minSize: <number> 50,
            maxSize: <number> 54,
        },

        orcGrunt: {
            file: require('../features/game-objects/assets/mobs/orcGrunt.svg'),
            minSize: <number> 42,
            maxSize: <number> 48,
        },

        soldierCompanion: {
            file: require('../features/game-objects/assets/mobs/soldierCompanion.svg'),
            minSize: <number> 34,
            maxSize: <number> 38,
        },

        shieldbearerCompanion: {
            file: require('../features/game-objects/assets/mobs/shieldbearerCompanion.svg'),
            minSize: <number> 38,
            maxSize: <number> 42,
        },

        medicCompanion: {
            file: require('../features/game-objects/assets/mobs/medicCompanion.svg'),
            minSize: <number> 32,
            maxSize: <number> 36,
        },

        troll: {
            file: require('../features/game-objects/assets/mobs/troll.svg'),
            minSize: <number> 64,
            maxSize: <number> 72,
        },

        banditPyromancer: {
            file: require('../features/game-objects/assets/mobs/banditPyromancer.svg'),
            minSize: <number> 46,
            maxSize: <number> 52,
        },

        // cL8-17 farm band + unique-art pass (2026-07-21): the dires get own
        // sprites (were Wolf/Bear reskins via entityType), sized between
        // their base kin and the elites/apex of their line.
        direWolf: {
            file: require('../features/game-objects/assets/mobs/direWolf.svg'),
            minSize: <number> 48,
            maxSize: <number> 56,
        },

        direBear: {
            file: require('../features/game-objects/assets/mobs/direBear.svg'),
            minSize: <number> 78,
            maxSize: <number> 90,
        },

        giantSpider: {
            file: require('../features/game-objects/assets/mobs/giantSpider.svg'),
            minSize: <number> 58,
            maxSize: <number> 68,
        },

        alphaWolf: {
            file: require('../features/game-objects/assets/mobs/alphaWolf.svg'),
            minSize: <number> 58,
            maxSize: <number> 68,
        },

        marauder: {
            file: require('../features/game-objects/assets/mobs/marauder.svg'),
            minSize: <number> 44,
            maxSize: <number> 52,
        },

        fireElemental: {
            file: require('../features/game-objects/assets/mobs/fireElemental.svg'),
            minSize: <number> 52,
            maxSize: <number> 62,
        },

        // Elite — deliberately larger than the lesser elemental so the tier
        // reads at a glance (body radius 0.55 vs 0.4).
        greaterFireElemental: {
            file: require('../features/game-objects/assets/mobs/greaterFireElemental.svg'),
            minSize: <number> 72,
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
            maxSize: <number> 60,
        },
        signpost: {
            file: require('../features/game-objects/assets/resources/signpost.svg'),
            maxSize: <number> 55,
        },
        hermit: {
            file: require('../features/game-objects/assets/resources/hermit.svg'),
            maxSize: <number> 60,
        },
        farmer: {
            file: require('../features/game-objects/assets/resources/farmer.svg'),
            maxSize: <number> 60,
        },
        wanderer: {
            file: require('../features/game-objects/assets/resources/wanderer.svg'),
            maxSize: <number> 60,
        },
        traveller: {
            file: require('../features/game-objects/assets/resources/traveller.svg'),
            maxSize: <number> 60,
        },
        townCrier: {
            file: require('../features/game-objects/assets/resources/townCrier.svg'),
            maxSize: <number> 60,
        },
        dogNpc: {
            file: require('../features/game-objects/assets/resources/dogNpc.svg'),
            maxSize: <number> 45,
        },
        miner: {
            file: require('../features/game-objects/assets/resources/miner.svg'),
            maxSize: <number> 60,
        },
        cityGuard: {
            file: require('../features/game-objects/assets/resources/cityGuard.svg'),
            maxSize: <number> 60,
        },
        villageHealer: {
            file: require('../features/game-objects/assets/resources/villageHealer.svg'),
            maxSize: <number> 60,
        },
        frontCaptain: {
            file: require('../features/game-objects/assets/resources/frontCaptain.svg'),
            maxSize: <number> 60,
        },
    },

    // Static zone props with dedicated art (content pass C1). Rect props are
    // sized from the wire radius (= max half-extent) — the SVG aspect must
    // match the prop body in api/props/.
    props: {
        house: {
            file: require('../features/game-objects/assets/resources/house.svg'),
            maxSize: <number> 480,
        },
        gateWall: {
            file: require('../features/game-objects/assets/resources/gateWall.svg'),
            maxSize: <number> 288,
        },
    },

    // Player corpse (chunk 4): gravestone placeholder at the deathspot.
    corpse: {
        file: require('../features/game-objects/assets/corpse.svg'),
        size: <number> 50,
    },

    resources: {
        tree: {
            spotFile: require('../features/game-objects/assets/resources/treeSpot.svg'),
            maxSize: <number> 210,

            roundTreeFile: require('../features/game-objects/assets/resources/roundTree.svg'),
        },

        mineral: {
            spotFile: require('../features/game-objects/assets/resources/stoneSpot.svg'),
            maxSize: <number> 142,

            stoneFile: require('../features/game-objects/assets/resources/stone.svg'),
        },
    },

    miniMap: {
        /**
         * Every icon has a color and a size. Sizes are scaled just like the mini map.
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
            file: require('../features/ground-textures/assets/textures/flowers.svg'),
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
            file: require('../features/ground-textures/assets/textures/sand1.svg'),
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
        }
    }
};
