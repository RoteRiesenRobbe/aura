import {Container, Graphics, Sprite, Texture, ViewContainer} from 'pixi.js';
import {GameObject} from './_GameObject';
import * as Preloading from '../../core/logic/Preloading';
import {randomRotation, TwoDimensional} from '../../common/logic/Utils';
import {createInjectedSVG} from '../../core/logic/InjectedSVG';
import {GraphicsConfig} from '../../../client-data/Graphics';
import {IGame} from '../../core/logic/IGame';
import {GameSetupEvent} from '../../core/logic/Events';
import {StatusEffect} from './StatusEffect';
import {ISvgContainer} from '../../core/logic/ISvgContainer';
import {IMiniMapRendered, Layer, LevelOfDynamic} from '../../map/logic/MiniMapInterfaces';

let Game: IGame = null;
GameSetupEvent.subscribe((game: IGame) => {
    Game = game;
});

// The wire table this rides is still called Resource, but nothing harvestable
// is left on it — props are its only occupants since the actor merge moved NPCs
// to the Mob path. The stock/capacity yield pair (and the sprite rescale it
// drove) went with the pre-accounts hygiene chunk: the server had been sending
// a constant 1/1 ever since the §26 prune emptied the resource system.
export abstract class Resource extends GameObject implements IMiniMapRendered {
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

    // ⚑ This factor absorbs the art's own padding, so it is tied to the asset.
    // The old SVG drew its crown at 65% of the canvas (circle r=32.491 of 100)
    // and 1.8 compensated for that; the PNG fills 95.5%, so the same factor
    // rendered the tree ~1.47× too big. 1.15 restores the previous on-screen
    // crown (~320 px). Retune whenever the art's fill fraction changes:
    //   factor = (targetCrownPx / fillFraction - character.size) / 120
    protected constructor(id: number, x: number, y: number, size: number, svg: Texture) {
        super(id, Game.layers.resources.trees, x, y, size * 1.15 + GraphicsConfig.character.size, 0, svg);

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
            // Painted PNG art fills 94.9% of its canvas where the placeholder
            // SVG's rock filled only 70% (the rest was margin plus a baked
            // drop-shadow raster), so the old `size * 1.1 + character.size`
            // rendered the new art 1.35x too big — and unevenly, because a flat
            // +30px is half a Rock but a sixth of a Boulder: 1.52x vs 1.20x of
            // their colliders. A single multiplier lands both on ~1.10x, the
            // 1.07 pairing with art that fills 93.4% of its canvas. Same fix the tree took
            // (1.8 -> 1.15) when its PNG landed.
            applyVisualPadding ? size * 1.07 : size,
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

    createMinimapIcon(): ViewContainer {
        throw new Error('Method not implemented.');
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(GateWall, GraphicsConfig.props.gateWall.file, GraphicsConfig.props.gateWall.maxSize);
