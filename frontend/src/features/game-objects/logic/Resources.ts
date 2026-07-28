import {Container, Graphics, Sprite, Texture, ViewContainer} from 'pixi.js';
import {GameObject} from './_GameObject';
import * as Preloading from '../../core/logic/Preloading';
import {randomRotation, TwoDimensional} from '../../common/logic/Utils';
import {createInjectedSVG} from '../../core/logic/InjectedSVG';
import {GraphicsConfig} from '../../../client-data/Graphics';
import {IGame} from '../../core/logic/IGame';
import {GameSetupEvent, ResourceStockChangedEvent} from '../../core/logic/Events';
import {StatusEffect} from './StatusEffect';
import {ISvgContainer} from '../../core/logic/ISvgContainer';
import './ResourceJuice';
import {IMiniMapRendered, Layer, LevelOfDynamic} from '../../mini-map/logic/MiniMapInterfaces';

let Game: IGame = null;
GameSetupEvent.subscribe((game: IGame) => {
    Game = game;
});

export abstract class Resource extends GameObject implements IMiniMapRendered {
    capacity: number;
    baseScale: number;
    private _stock: number;

    protected constructor(
        id: number,
        gameLayer: Container,
        x: number,
        y: number,
        size: number,
        rotation: number,
        svg: Texture,
    ) {
        super(id, gameLayer, x, y, size, rotation, svg);

        this.baseScale = this.shape.scale.x;
    }

    get stock() {
        return this._stock;
    }

    set stock(newStock: number) {
        if (this._stock !== newStock) {
            this.onStockChange(newStock, this._stock);
            this._stock = newStock;
        }
    }

    /**
     * @param newStock
     * @param oldStock
     * @protected
     */
    protected onStockChange(newStock: number, oldStock: number) {
        ResourceStockChangedEvent.trigger({
            entityType: this.constructor.name,
            newStock: newStock,
            oldStock: oldStock,
            position: this.getPosition(),
        });
        const scale = newStock / this.capacity;
        this.shape.scale.set(this.baseScale * scale);
    }

    createStatusEffects() {
        return {
            Damaged: StatusEffect.forDamaged(this.shape),
            DamagedAmbient: StatusEffect.forDamagedOverTime(this.shape),
        };
    }

    abstract createMinimapIcon(): ViewContainer;

    get miniMapLayer(): Layer {
        return Layer.OTHER;
    }
    get miniMapDynamic(): LevelOfDynamic {
        return LevelOfDynamic.STATIC;
    }
}

export abstract class Tree extends Resource {
    static resourceSpot: ISvgContainer = {svg: undefined};
    resourceSpotTexture: Sprite;

    protected constructor(id: number, x: number, y: number, size: number, svg: Texture) {
        super(id, Game.layers.resources.trees, x, y, size * 1.8 + GraphicsConfig.character.size, 0, svg);

        this.resourceSpotTexture = createInjectedSVG(Tree.resourceSpot.svg, x, y, this.size * 0.7, randomRotation());
        Game.layers.terrain.resourceSpots.addChild(this.resourceSpotTexture);
    }

    createMinimapIcon() {
        const miniMapCfg = GraphicsConfig.miniMap.icons.tree;
        return new Graphics()
            .circle(0, 0, this.size * miniMapCfg.sizeFactor)
            .fill({color: miniMapCfg.color, alpha: miniMapCfg.alpha});
    }

    hide() {
        this.resourceSpotTexture.parent.removeChild(this.resourceSpotTexture);
        super.hide();
    }
}

const treeCfg = GraphicsConfig.resources.tree;
// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Tree.resourceSpot, treeCfg.spotFile, treeCfg.maxSize);

export class RoundTree extends Tree {
    static svg: Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, x, y, size, RoundTree.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(RoundTree, treeCfg.roundTreeFile, treeCfg.maxSize);

export abstract class Mineral extends Resource {
    static resourceSpot: ISvgContainer = {svg: undefined};
    resourceSpotTexture: Sprite;

    protected constructor(id: number, x: number, y: number, size: number, svg: Texture, applyVisualPadding: boolean = true) {
        super(id, Game.layers.resources.minerals, x, y,
            applyVisualPadding ? size * 1.1 + GraphicsConfig.character.size : size, // Add some space so the character can get visually close to the collider
            0, // Due to the shadow in the mineral graphics, those should not be randomly rotated
            svg);

        this.resourceSpotTexture = this.createResourceSpotTexture(x, y);
        Game.layers.terrain.resourceSpots.addChild(this.resourceSpotTexture);
    }

    protected createResourceSpotTexture(x: number, y: number) {
        return createInjectedSVG(Mineral.resourceSpot.svg, x, y, this.size * 0.7, this.rotation);
    }

    hide() {
        this.resourceSpotTexture.parent.removeChild(this.resourceSpotTexture);
        super.hide();
    }
}

const mineralCfg = GraphicsConfig.resources.mineral;
// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Mineral.resourceSpot, mineralCfg.spotFile, mineralCfg.maxSize);

export class Stone extends Mineral {
    static svg: Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, x, y, size, Stone.svg);
    }

    createMinimapIcon() {
        const miniMapCfg = GraphicsConfig.miniMap.icons.stone;
        return new Graphics()
            .poly(TwoDimensional.makePolygon(this.size * miniMapCfg.sizeFactor, 6, true))
            .fill({color: miniMapCfg.color, alpha: miniMapCfg.alpha});
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Stone, mineralCfg.stoneFile, mineralCfg.maxSize);

// The rect-bodied house prop (content pass C1). Props ride the Resource wire
// table, whose single size scalar is the max half-extent of the rect body —
// the true aspect comes from the prop def itself (the same JSON the server
// derives its body from), because SVG preloading rasterizes to a square
// texture and loses the source proportions.
const houseDef = require('../../../../../api/props/house.json') as {
    body: { width: number; height: number };
};

export class House extends Resource {
    static svg: Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, 0, House.svg);
        this.visibleOnMinimap = false;
    }

    initShape(svg: Texture, x: number, y: number, size: number, rotation: number): Container {
        const sprite = createInjectedSVG(svg, x, y, size, rotation);
        // createInjectedSVG scales square from the max half-extent; shrink the
        // shorter body axis back to the authored proportions.
        const {width, height} = houseDef.body;
        const max = Math.max(width, height);
        sprite.width = size * 2 * (width / max);
        sprite.height = size * 2 * (height / max);
        return sprite;
    }

    // Props stream a constant stock/capacity of 1/1; the base setter's
    // uniform rescale would squash the non-square sprite, so skip it.
    protected onStockChange(newStock: number, oldStock: number) {
    }

    createMinimapIcon(): ViewContainer {
        throw new Error('Method not implemented.');
    }
}

const houseCfg = GraphicsConfig.props.house;
// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(House, houseCfg.file, houseCfg.maxSize);

// The NPC sprites that used to live here moved to Mobs.ts with the actor
// merge (plan-entity-model.md chunk 3a) — NPCs ride the Mob wire path now.

// The square rampart block prop (content pass C4): City Gates flanks + the
// blocked roads. Square body, so the plain square SVG scaling is already
// correct — no aspect correction needed (unlike House).
export class GateWall extends Resource {
    static svg: Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, 0, GateWall.svg);
        this.visibleOnMinimap = false;
    }

    // Props stream a constant stock/capacity of 1/1; skip the base setter's
    // rescale (House precedent).
    protected onStockChange(newStock: number, oldStock: number) {
    }

    createMinimapIcon(): ViewContainer {
        throw new Error('Method not implemented.');
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(GateWall, GraphicsConfig.props.gateWall.file, GraphicsConfig.props.gateWall.maxSize);
