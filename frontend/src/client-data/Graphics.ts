import {meter2px} from './BasicConfig';
import {color, integer} from '../features/common/logic/Types';

export const GraphicsConfig = {

    deepWaterColor: <color> 0x1C57B5,
    shallowWaterColor: <color> 0x287aff,
    landColor: <color> 0x006030,

    hitAnimation: {
        /**
         * Maximum opacity of the flood filter that applied on game objects when they are hit.
         */
        floodOpacity: <number> 1,
        duration: <number> 500, //ms
    },

    /**
     * Controls how translucent equipped placeables appear that are not yet placed
     */
    equippedPlaceableOpacity: <number> 0.6,

    character: {
        /**
         * Pixel radius of the character graphic.
         *
         * SYNCED WITH BACKEND
         */
        size: <number> 30,
        file: require('../features/game-objects/assets/characters/player.svg'),
        damageAuraFile: require('../features/game-objects/assets/effects/damageAura.svg'),
        healAuraFile: require('../features/game-objects/assets/effects/healAura.svg'),
        damageAuraRadiusMeters: <number> 1,
        /**
         * Physical collider radius used by backend for player body.
         *
         * SYNCED WITH BACKEND (backend/pkg/berryhunter/model/player/player.go)
         */
        colliderRadiusMeters: <number> 0.25,

        hands: {
            fillColor: <color> 0xf2a586,
            lineColor: <color> 0x000000,
        },

        actionAnimation: {
            /**
             * Should be synchronized with the value below,
             * but is purely used for a smooth client side animation.
             */
            duration: <integer> 500, // ms

            /**
             * How much of the animation is forward - the rest is reversing.
             * 0.4 ==> 40% (200ms of 500ms) are forward movement, 60% is backwards
             */
            relativeDurationForward: <number> 0.35,

            /**
             * How many ticks will the backend communicate an action in progress
             *
             * SYNCED WITH BACKEND
             */
            backendTicks: <integer> 10,
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
    },

    // NPC sprites (content pass C2): Resource-backed, referenced by the
    // zone-JSON npc entityType (server npc.SpriteFor). Sized like props.
    npcs: {
        signpost: {
            file: require('../features/game-objects/assets/resources/signpost.svg'),
            maxSize: <number> 55,
        },
        hermit: {
            file: require('../features/game-objects/assets/resources/hermit.svg'),
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
            deciduousTreeFile: require('../features/game-objects/assets/resources/deciduousTree.svg'),
        },

        mineral: {
            spotFile: require('../features/game-objects/assets/resources/stoneSpot.svg'),
            shardSpotFile: require('../features/game-objects/assets/resources/shardSpot.svg'),
            maxSize: <number> 142,
            shardMaxSize: <number> 71,

            stoneFile: require('../features/game-objects/assets/resources/stone.svg'),
            bronzeFile: require('../features/game-objects/assets/resources/bronze.svg'),
            ironFile: require('../features/game-objects/assets/resources/iron.svg'),
            titaniumFile: require('../features/game-objects/assets/resources/titanium.svg'),
            titaniumShardFile: require('../features/game-objects/assets/resources/titaniumShard.svg'),
        },

        berryBush: {
            bushFile: require('../features/game-objects/assets/resources/berryBush.svg'),
            maxSize: <number> (meter2px(0.5) * 2),

            berryFile: require('../features/game-objects/assets/resources/berry.svg'),
            berryMaxSize: <number> 11,
            berryMinSize: <number> 6,

            calyxFile: require('../features/game-objects/assets/resources/berryCalyx.svg'),
        },

        flower: {
            spotFile: require('../features/game-objects/assets/resources/flowerSpot.svg'),
            file: require('../features/game-objects/assets/resources/flower.svg'),
            minSize: <number> (meter2px(0.15) * 2),
            maxSize: <number> (meter2px(0.25) * 2),
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
            bronze: {
                color: 0xb57844,
                alpha: 1,
                sizeFactor: 1.5,
            },
            iron: {
                color: 0xa46262,
                alpha: 1,
                sizeFactor: 1.3,
            },
            titanium: {
                color: 0x181818,
                alpha: 1,
                sizeFactor: 1.3,
            },
            titaniumShard: {
                color: 0x181818,
                alpha: 1,
                sizeFactor: 2,
            },
            berryBush: {
                color: 0xc20071,
                alpha: 1,
                sizeFactor: 1.2,
            },
            BerrySeed: {
                color: 0xc20071,
                alpha: 1,
                sizeFactor: 1.2,
            },
            Workbench: {
                color: 0xFF0000,
                alpha: 1,
                sizeFactor: 1,
            },
            WorkbenchConstruction: {
                color: 0xFF00FF,
                alpha: 1,
                sizeFactor: 1,
            },
            Furnace: {
                color: 0xFF8000,
                alpha: 1,
                sizeFactor: 0.4,
            },
            WoodWall: {
                color: 0x8B4513,
                alpha: 1,
                sizeFactor: 0.7,
            },
            StoneWall: {
                color: 0x8B4513,
                alpha: 1,
                sizeFactor: 0.7,
            },
            BronzeWall: {
                color: 0x8B4513,
                alpha: 1,
                sizeFactor: 0.7,
            },
            IronWall: {
                color: 0x8B4513,
                alpha: 1,
                sizeFactor: 0.7,
            }
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
