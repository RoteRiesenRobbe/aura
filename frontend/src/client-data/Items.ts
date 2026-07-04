/**
 * Register of available items in the game.
 *
 */
import {ItemType} from '../features/items/logic/ItemType';
import {EquipmentSlot} from "../features/items/logic/Equipment";
import {meter2px} from './BasicConfig';
import {GraphicsConfig} from './Graphics';

/**
 * ItemName: {
 *      icon: {
 *          file: require('./relative/path/to/file.svg)
 *          svg: injected, svg node loaded from file
 *      },
 *      graphic: {
 *          file: require('./relative/path/to/file.svg)
 *          svg: injected, svg node loaded from file
 *          size: optional number, defaults to 100
 *          offsetX: optional number, defaults to 0
 *          offsetY: optional number, default to 0
 *      },
 *      definition: require('./relative/path/to/item.json)
 *      type: ItemType,
 *      equipment: {  must be defined if type == EQUIPMENT! contains configuration for equipment
 *          slot: Equipment.Slots,
 *          animation: 'stab' | 'swing'
 *      },
 *      placeable: { must be defined if type == PLACEBALE! contains configuration for placeables
 *          layer: string, defines the layer this placeable is part of.
 *                 See Game.js for defined layers
 *          multiPlacing: optional boolean, default false
 *                        after placenment item stays equipped
 *          visibleOnMinimap: optional boolean, default false
 *                            If true, a minimap icon is created for this placeable.
 *                            The looks have to be defined in:
 *                            GraphicsConfig.miniMap.icons.<itemName>
 *          directions: optional boolean|number.
 *                      false = no rotation at all.
 *                      4 = only 4 directions.
 *                      8 = only 8 directions.
 *                      If omitted, the placeable is freely rotated.
 *      }
 * }
 */
export const ItemsConfig = {
    None: {
        definition: require('../../../api/items/none.json'),
        equipment: {
            animation: 'swing'
        }
    },

    /***********************************
     * PLACEABLES
     ***********************************/
    Campfire: {
        icon: {file: require('../features/items/assets/icons/fireCampIcon.svg')},
        graphic: {
            file: require('../features/items/assets/icons/fireCamp.svg'),
            size: 100
        },
        definition: require('../../../api/items/placeables/campfire.json'),
        type: ItemType.PLACEABLE,
        placeable: {
            layer: 'placeables.campfire'
        }
    },
    BigCampfire: {
        icon: {file: require('../features/items/assets/icons/fireBigCampIcon.svg')},
        graphic: {
            file: require('../features/items/assets/icons/fireBigCamp.svg'),
            size: 120
        },
        definition: require('../../../api/items/placeables/big-campfire.json'),
        type: ItemType.PLACEABLE,
        placeable: {
            layer: 'placeables.campfire'
        }
    },

    /***********************************
     * RESOURCES
     ***********************************/
    Wood: {
        icon: {file: require('../features/items/assets/icons/woodIcon.svg')},
        definition: require('../../../api/items/resources/wood.json'),
        type: ItemType.RESOURCE
    },
    Stone: {
        icon: {file: require('../features/items/assets/icons/stoneIcon.svg')},
        definition: require('../../../api/items/resources/stone.json'),
        type: ItemType.RESOURCE
    },
    Bronze: {
        icon: {file: require('../features/items/assets/icons/bronzeIcon.svg')},
        definition: require('../../../api/items/resources/bronze.json'),
        type: ItemType.RESOURCE
    },
    Iron: {
        icon: {file: require('../features/items/assets/icons/ironIcon.svg')},
        definition: require('../../../api/items/resources/iron.json'),
        type: ItemType.RESOURCE
    },
    Titanium: {
        icon: {file: require('../features/items/assets/icons/titaniumIcon.svg')},
        definition: require('../../../api/items/resources/titanium.json'),
        type: ItemType.RESOURCE
    },
    Feather: {
        icon: {file: require('../features/items/assets/icons/feather.svg')},
        definition: require('../../../api/items/resources/feather.json'),
        type: ItemType.RESOURCE
    },
};
