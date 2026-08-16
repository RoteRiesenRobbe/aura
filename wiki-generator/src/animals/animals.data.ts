import {GraphicsConfig} from "../../../frontend/src/client-data/Graphics";

export const animals = [
    {
        graphic: GraphicsConfig.mobs.wolf.file,
        definition: require('../../../api/mobs/wolf.json'),
    }, {
        graphic: GraphicsConfig.mobs.boar.file,
        definition: require('../../../api/mobs/boar.json'),
    }, {
        graphic: GraphicsConfig.mobs.stag.file,
        definition: require('../../../api/mobs/stag.json'),
    }
];
