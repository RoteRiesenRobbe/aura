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
    // The resource/placeable items were pruned with the dead server-side layer
    // (backlog §26); only the None sentinel remains. The rest of this frontend
    // item scaffolding (BackendConstants.itemLookupTable, features/items/logic)
    // is now unread and comes out with the §28 item-system removal.
};
