import { ResourceStockChangedEvent } from '../../core/logic/Events';
import * as Resources from './Resources';
import { isUndefined, random } from '../../common/logic/Utils';
import * as PIXI from 'pixi.js';
import { registerPreload } from '../../core/logic/Preloading';
import { spatialAudio } from '../../audio/logic/SpatialAudio';

ResourceStockChangedEvent.subscribe((payload) => {
    if (isUndefined(payload.oldStock)) {
        // Object was just placed
        return;
    }

    if (payload.newStock >= payload.oldStock) {
        // Tree is growing
        return;
    }

    switch (payload.entityType) {
        case Resources.RoundTree.name:
            spatialAudio.play('tree-chop',
                payload.position, {
                speed: random(0.9, 1.11),
                volume: random(0.8, 1.25),
            });
            break;
        case Resources.Mineral.name:
        case Resources.Stone.name:
            spatialAudio.play('mineral-hit-dull',
                payload.position, {
                speed: random(0.7, 1.3),
                volume: random(1, 1.25),
            });
            break;
        default:
            return;
    }
});


PIXI.Assets.add({ alias: 'tree-chop', src: require('../assets/resources/536736__egomassive__chop.mp3') });
PIXI.Assets.add({ alias: 'mineral-hit-dull', src: require('../assets/resources/319229__worthahep88__single-rock-hit-dirt-2.mp3') });
// noinspection JSIgnoredPromiseFromCall
registerPreload(PIXI.Assets.load('tree-chop'));
registerPreload(PIXI.Assets.load('mineral-hit-dull'));
