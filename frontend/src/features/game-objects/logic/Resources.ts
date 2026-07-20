import * as PIXI from 'pixi.js';
import {Container, Graphics, Sprite, Texture, ViewContainer} from 'pixi.js';
import {GameObject} from './_GameObject';
import * as Preloading from '../../core/logic/Preloading';
import {deg2rad, isDefined, randomRotation, TwoDimensional} from '../../common/logic/Utils';
import {createInjectedSVG} from '../../core/logic/InjectedSVG';
import {GraphicsConfig} from '../../../client-data/Graphics';
import {IGame} from '../../core/logic/IGame';
import {GameSetupEvent, ResourceStockChangedEvent} from '../../core/logic/Events';
import {alea as SeedRandom} from 'seedrandom';
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
            Yielded: StatusEffect.forYielded(this.shape),
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

export class MarioTree extends Tree {
    static svg: Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, x, y, size, MarioTree.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(MarioTree, treeCfg.deciduousTreeFile, treeCfg.maxSize);

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

export class Bronze extends Mineral {
    static svg: Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, x, y, size, Bronze.svg);
    }

    createMinimapIcon() {
        const miniMapCfg = GraphicsConfig.miniMap.icons.bronze;
        return new Graphics()
            .poly(TwoDimensional.makePolygon(this.size * miniMapCfg.sizeFactor, 5, true))
            .fill({color: miniMapCfg.color, alpha: miniMapCfg.alpha});
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Bronze, mineralCfg.bronzeFile, mineralCfg.maxSize);

export class Iron extends Mineral {
    static svg: Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, x, y, size, Iron.svg);
    }

    createMinimapIcon() {
        const miniMapCfg = GraphicsConfig.miniMap.icons.iron;
        return new Graphics()
            .poly(TwoDimensional.makePolygon(this.size * miniMapCfg.sizeFactor, 6, true))
            .fill({color: miniMapCfg.color, alpha: miniMapCfg.alpha});
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Iron, mineralCfg.ironFile, mineralCfg.maxSize);

export class Titanium extends Mineral {
    static svg: Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, x, y, size, Titanium.svg);
        this.visibleOnMinimap = false;
    }

    createMinimapIcon() {
        const miniMapCfg = GraphicsConfig.miniMap.icons.titanium;
        return new Graphics()
            .poly(TwoDimensional.makePolygon(this.size * miniMapCfg.sizeFactor, 4, true))
            .fill({color: miniMapCfg.color, alpha: miniMapCfg.alpha});
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Titanium, mineralCfg.titaniumFile, mineralCfg.maxSize);

export class TitaniumShard extends Mineral {
    static resourceSpot: ISvgContainer = {svg: undefined};
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, x, y, size - (GraphicsConfig.character.size * 0.5), TitaniumShard.svg);
    }

    protected createResourceSpotTexture(x: number, y: number) {
        return createInjectedSVG(TitaniumShard.resourceSpot.svg, x, y, this.size * 0.9, this.rotation);
    }

    createMinimapIcon() {
        const miniMapCfg = GraphicsConfig.miniMap.icons.titaniumShard;
        return new Graphics()
            .poly(TwoDimensional.makePolygon(this.size * miniMapCfg.sizeFactor, 3, true))
            .fill({color: miniMapCfg.color, alpha: miniMapCfg.alpha});
    }

    get miniMapDynamic(): LevelOfDynamic {
        return LevelOfDynamic.REMOVABLE_REMEMBERED;
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(TitaniumShard.resourceSpot, mineralCfg.shardSpotFile, mineralCfg.shardMaxSize);
// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(TitaniumShard, mineralCfg.titaniumShardFile, mineralCfg.shardMaxSize);


const berryBushCfg = GraphicsConfig.resources.berryBush;

export class BerryBush extends Resource {
    static svg: Texture;
    static berry: ISvgContainer = {svg: undefined};
    // It's the little black cross on top of berries
    static calyx: ISvgContainer = {svg: undefined};

    actualShape: Container;
    berries: Container;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.berryBush, x, y, size, 0, BerryBush.svg);
    }

    initShape(svg: Texture, x: number, y: number, size: number, rotation: number) {
        const group = new Container();
        group.position.set(x, y);

        this.actualShape = super.initShape(svg, 0, 0, size, rotation);
        group.addChild(this.actualShape);

        return group;
    }

    createMinimapIcon() {
        const miniMapCfg = GraphicsConfig.miniMap.icons.berryBush;
        return new Graphics()
            .circle(0, 0, this.size * miniMapCfg.sizeFactor)
            .fill({color: miniMapCfg.color, alpha: miniMapCfg.alpha});
    }

    onStockChange(newStock: number, oldStock: number) {
        if (isDefined(this.berries)) {
            this.berries.parent.removeChild(this.berries);
        }

        this.berries = new Container();
        this.shape.addChild(this.berries);

        // Seed a random generator with the ID of the game object to make sure it always looks the same
        const seedRandom = new SeedRandom(this.id);

        for (let i = 0; i < this.capacity; i++) {
            if (i >= newStock) {
                break;
            }

            const berrySize = this.random(seedRandom, berryBushCfg.berryMinSize, berryBushCfg.berryMaxSize);

            const distance = this.random(seedRandom, 0.2, 0.4) * this.size;
            const x = Math.cos(Math.PI * 2 / this.capacity * i) * distance;
            const y = Math.sin(Math.PI * 2 / this.capacity * i) * distance;
            const berry = createInjectedSVG(BerryBush.berry.svg, x, y, berrySize);
            this.berries.addChild(berry);

            const calyx = createInjectedSVG(BerryBush.calyx.svg, x, y, berrySize, this.random(seedRandom, deg2rad(-65), deg2rad(220)));
            this.berries.addChild(calyx);
        }
        ResourceStockChangedEvent.trigger({
            entityType: this.constructor.name,
            newStock: newStock,
            oldStock: oldStock,
            position: this.getPosition(),
        });
    }

    random(rng: () => number, min: number, max: number) {
        return rng() * (max - min) + min;
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(BerryBush, berryBushCfg.bushFile, berryBushCfg.maxSize);
// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(BerryBush.berry, berryBushCfg.berryFile, berryBushCfg.berryMaxSize);
// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(BerryBush.calyx, berryBushCfg.calyxFile, berryBushCfg.berryMaxSize);

export class Flower extends Resource {
    static resourceSpot = {
        svg: null as Texture,
    };
    resourceSpotTexture: Sprite;

    static svg: Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.berryBush, x, y, size, randomRotation(), Flower.svg);
        this.visibleOnMinimap = false;

        this.resourceSpotTexture = createInjectedSVG(Flower.resourceSpot.svg, x, y, this.size * 1.667, randomRotation());
        Game.layers.terrain.resourceSpots.addChild(this.resourceSpotTexture);
    }

    hide() {
        this.resourceSpotTexture.parent.removeChild(this.resourceSpotTexture);
        super.hide();
    }

    createMinimapIcon(): ViewContainer {
        throw new Error('Method not implemented.');
    }
}

const flowerCfg = GraphicsConfig.resources.flower;
// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Flower.resourceSpot, flowerCfg.spotFile, flowerCfg.maxSize);
// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Flower, flowerCfg.file, flowerCfg.maxSize);

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

// --- NPC sprites (content pass C2) ---
// Resource-backed circle-bodied NPC sprites, picked by the zone-JSON npc
// entityType (server-side npc.SpriteFor). NPCs ride the Resource wire path,
// so these are plain fixed-rotation Resources like the House.

export class Signpost extends Resource {
    static svg: Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, 0, Signpost.svg);
        this.visibleOnMinimap = false;
    }

    createMinimapIcon(): ViewContainer {
        throw new Error('Method not implemented.');
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Signpost, GraphicsConfig.npcs.signpost.file, GraphicsConfig.npcs.signpost.maxSize);

export class Hermit extends Resource {
    static svg: Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, 0, Hermit.svg);
        this.visibleOnMinimap = false;
    }

    createMinimapIcon(): ViewContainer {
        throw new Error('Method not implemented.');
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Hermit, GraphicsConfig.npcs.hermit.file, GraphicsConfig.npcs.hermit.maxSize);

export class Farmer extends Resource {
    static svg: Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, 0, Farmer.svg);
        this.visibleOnMinimap = false;
    }

    createMinimapIcon(): ViewContainer {
        throw new Error('Method not implemented.');
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Farmer, GraphicsConfig.npcs.farmer.file, GraphicsConfig.npcs.farmer.maxSize);

export class Wanderer extends Resource {
    static svg: Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, 0, Wanderer.svg);
        this.visibleOnMinimap = false;
    }

    createMinimapIcon(): ViewContainer {
        throw new Error('Method not implemented.');
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Wanderer, GraphicsConfig.npcs.wanderer.file, GraphicsConfig.npcs.wanderer.maxSize);

export class Traveller extends Resource {
    static svg: Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, 0, Traveller.svg);
        this.visibleOnMinimap = false;
    }

    createMinimapIcon(): ViewContainer {
        throw new Error('Method not implemented.');
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Traveller, GraphicsConfig.npcs.traveller.file, GraphicsConfig.npcs.traveller.maxSize);

export class DogNpc extends Resource {
    static svg: Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, 0, DogNpc.svg);
        this.visibleOnMinimap = false;
    }

    createMinimapIcon(): ViewContainer {
        throw new Error('Method not implemented.');
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(DogNpc, GraphicsConfig.npcs.dogNpc.file, GraphicsConfig.npcs.dogNpc.maxSize);

export class Miner extends Resource {
    static svg: Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, 0, Miner.svg);
        this.visibleOnMinimap = false;
    }

    createMinimapIcon(): ViewContainer {
        throw new Error('Method not implemented.');
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Miner, GraphicsConfig.npcs.miner.file, GraphicsConfig.npcs.miner.maxSize);

// --- C4 Z2 village + bandit gate (content pass C4) ---

export class CityGuard extends Resource {
    static svg: Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, 0, CityGuard.svg);
        this.visibleOnMinimap = false;
    }

    createMinimapIcon(): ViewContainer {
        throw new Error('Method not implemented.');
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(CityGuard, GraphicsConfig.npcs.cityGuard.file, GraphicsConfig.npcs.cityGuard.maxSize);

export class VillageHealer extends Resource {
    static svg: Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, 0, VillageHealer.svg);
        this.visibleOnMinimap = false;
    }

    createMinimapIcon(): ViewContainer {
        throw new Error('Method not implemented.');
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(VillageHealer, GraphicsConfig.npcs.villageHealer.file, GraphicsConfig.npcs.villageHealer.maxSize);

export class FrontCaptain extends Resource {
    static svg: Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, 0, FrontCaptain.svg);
        this.visibleOnMinimap = false;
    }

    createMinimapIcon(): ViewContainer {
        throw new Error('Method not implemented.');
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(FrontCaptain, GraphicsConfig.npcs.frontCaptain.file, GraphicsConfig.npcs.frontCaptain.maxSize);

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
