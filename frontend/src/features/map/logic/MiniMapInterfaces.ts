import {ViewContainer} from 'pixi.js';

export enum Layer {
    CHARACTER,
    OTHER,
}

/**
 * A LIVE map icon: it follows its entity every frame and goes when the entity
 * does. Placed props are not this — they are baked per zone (MapProps).
 */
export interface IMiniMapRendered {
    get id(): number;
    getX(): number;
    getY(): number;

    createMinimapIcon(): ViewContainer;
    get miniMapLayer(): Layer
}
