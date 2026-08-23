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

    // ⭐ No padding factor here any more (plan-prop-scale.md C1b). The sprite is
    // drawn at exactly the streamed radius, which is the prop type's VISUAL body
    // from api/props/tree.json (1.4 units); the smaller trunk collider is
    // `body.collisionFactor` server-side. Two reasons the factor moved into
    // content: the Tiled box is sized from the same authored body, so the editor
    // now matches the game pixel for pixel — and the old form
    // (`size * 1.15 + character.size`) had a CONSTANT addend, which made
    // per-placement scale non-linear on screen (2.00× the collider at scale
    // 0.294, 1.27× at 2.045). The mineral art pass had already made this exact
    // argument and dropped its own addend; the tree kept one until now.
    // ⚑ Retuning a tree's on-screen size is now an api/props/tree.json edit.
    protected constructor(id: number, x: number, y: number, size: number, rotation: number, svg: Texture) {
        super(id, Game.layers.resources.trees, x, y, size, rotation, svg);

        // The spot decal keeps its own random angle: it is ground scuffing, not
        // part of the tree, and turning with the crown would read as a decal
        // glued to the trunk.
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

    constructor(id: number, x: number, y: number, size: number, rotation: number) {
        super(id, x, y, size, rotation, RoundTree.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(RoundTree, treeCfg.roundTreeFile, treeCfg.maxSize);

export abstract class Mineral extends Resource {
    static resourceSpot: ISvgContainer = {svg: undefined};
    resourceSpotTexture: Sprite;

    protected constructor(id: number, x: number, y: number, size: number, rotation: number, svg: Texture) {
        super(id, Game.layers.resources.minerals, x, y,
            // ⭐ The 1.07 padding this used to apply now lives in the authored
            // body (api/props/rock.json, boulder.json) with a matching
            // collisionFactor, so the sprite draws at exactly the streamed
            // radius — same size on screen, same collider, and the Tiled box
            // finally agrees with both (plan-prop-scale.md C1b). The
            // `applyVisualPadding` opt-out went with it: nothing ever passed
            // false.
            size,
            // ⚑ The authored angle only (plan-prop-scale.md C2) — minerals are
            // still never given a RANDOM one, because the shadow is baked into
            // the art and scattering it would light every rock differently.
            // Deliberately rotating one in the editor turns its shadow with it;
            // that is the D3 trade, taken knowingly.
            rotation,
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

    constructor(id: number, x: number, y: number, size: number, rotation: number) {
        super(id, x, y, size, rotation, Stone.svg);
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

    constructor(id: number, x: number, y: number, size: number, rotation: number) {
        super(id, Game.layers.resources.trees, x, y, size, rotation, House.svg);
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

    constructor(id: number, x: number, y: number, size: number, rotation: number) {
        super(id, Game.layers.resources.trees, x, y, size, rotation, GateWall.svg);
        this.visibleOnMinimap = false;
    }

    createMinimapIcon(): ViewContainer {
        throw new Error('Method not implemented.');
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(GateWall, GraphicsConfig.props.gateWall.file, GraphicsConfig.props.gateWall.maxSize);
