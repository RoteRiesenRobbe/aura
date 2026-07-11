import {IVector} from "../../core/logic/Vector";
import {GameObject} from './_GameObject';
import * as Preloading from '../../core/logic/Preloading';
import {isUndefined, random, randomInt} from '../../common/logic/Utils';
import {GraphicsConfig} from '../../../client-data/Graphics';
import {StatusEffect} from './StatusEffect';
import {IGame} from '../../core/logic/IGame';
import {GameSetupEvent} from '../../core/logic/Events';
import * as PIXI from 'pixi.js';
import {createInjectedSVG} from "../../core/logic/InjectedSVG";
import {meter2px} from "../../../client-data/BasicConfig";
import {ISvgContainer} from "../../core/logic/ISvgContainer";
import './MobJuice';

let Game: IGame = null;
GameSetupEvent.subscribe((game: IGame) => {
    Game = game;
});

function maxSize(mob: keyof typeof GraphicsConfig.mobs) {
    return GraphicsConfig.mobs[mob].maxSize;
}

function minSize(mob: keyof typeof GraphicsConfig.mobs) {
    return GraphicsConfig.mobs[mob].minSize;
}

function anchor(mob: keyof typeof GraphicsConfig.mobs) {
    return GraphicsConfig.mobs[mob].anchor;
}

function file(mob: keyof typeof GraphicsConfig.mobs) {
    return GraphicsConfig.mobs[mob].file;
}

export abstract class Mob extends GameObject {
    static damageAura: ISvgContainer = {svg: undefined};

    protected actualShape: PIXI.Container;
    private healthFillGroup: PIXI.Container;
    private auraSprite: PIXI.Container = null;

    protected constructor(
        id: number,
        gameLayer: PIXI.Container,
        x: number,
        y: number,
        size: number,
        svg: PIXI.Texture,
        anchor?: IVector
    ) {
        super(id, gameLayer, x, y, size, 0, svg, anchor);
        this.initHealthBar();
        this.isMovable = true;
        this.visibleOnMinimap = false;
    }

    /**
     * Wire-driven aura ring (Mob.aura_radius, mob-depth chunk 3c): the
     * backend sends the active aura's effective radius in px, 0 while the
     * aura is gated — the ring only shows while the mob is aggroed.
     * Replaces the hand-synced damageAuraRadiusMeters constant.
     */
    setAuraRadius(radiusPx: number) {
        if (radiusPx <= 0) {
            if (this.auraSprite !== null) {
                this.auraSprite.visible = false;
            }
            return;
        }
        // Like hit reach, the visual ring extends by the player collider
        // radius (collision is shape-vs-shape).
        const ringRadius = radiusPx + meter2px(GraphicsConfig.character.colliderRadiusMeters);
        if (this.auraSprite === null) {
            this.auraSprite = createInjectedSVG(Mob.damageAura.svg, 0, 0, ringRadius);
            this.shape.addChildAt(this.auraSprite, 0);
        }
        this.auraSprite.visible = true;
        this.auraSprite.width = ringRadius * 2;
        this.auraSprite.height = ringRadius * 2;
    }

    initShape(svg: PIXI.Texture, x: number, y: number, size: number, rotation: number, anchor?: IVector): PIXI.Container {
        const group = new PIXI.Container();
        group.position.set(x, y);

        this.actualShape = new PIXI.Container();
        this.actualShape.addChild(super.initShape(svg, 0, 0, size, rotation, anchor));
        group.addChild(this.actualShape);

        return group;
    }

    setRotation(rotation: number) {
        if (isUndefined(rotation)) {
            return;
        }

        // Keep all mob graphics facing down at default backend angle.
        super.setRotation(rotation);
    }

    getRotationShape(): PIXI.Container {
        return this.actualShape;
    }

    setHealth(health: number, maxHealth: number) {
        const relativeHealth = maxHealth > 0 ? Math.max(0, Math.min(1, health / maxHealth)) : 0;
        this.healthFillGroup.scale.x = relativeHealth;
    }

    protected override createStatusEffects() {
        return {
            Damaged: StatusEffect.forDamaged(this.actualShape),
        };
    }

    private initHealthBar() {
        const barWidth = Math.min(160, Math.max(30, this.size * 0.9));
        const barHeight = Math.max(5, Math.min(10, barWidth * 0.12));
        const borderWidth = 1;

        const bar = new PIXI.Container();
        // Below the mob (positive y is down); item-11 VFX pass moved it under.
        bar.y = Math.max(30, this.size * 0.9);

        bar.addChild(
            new PIXI.Graphics()
                .rect(-barWidth / 2, -barHeight / 2, barWidth, barHeight)
                .fill({color: 0x000000, alpha: 0.6})
                .stroke({width: borderWidth, color: 0xffffff, alpha: 0.35}),
        );

        const innerWidth = barWidth - 2 * borderWidth;
        const innerHeight = barHeight - 2 * borderWidth;
        this.healthFillGroup = new PIXI.Container();
        this.healthFillGroup.position.set(-innerWidth / 2, -innerHeight / 2);
        this.healthFillGroup.addChild(
            new PIXI.Graphics()
                .rect(0, 0, innerWidth, innerHeight)
                .fill({color: 0xaa3b3b, alpha: 0.9}),
        );
        bar.addChild(this.healthFillGroup);

        this.shape.addChild(bar);
        this.setHealth(1, 1); // full until the first snapshot
    }
}

export class Dodo extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.dodo, x, y,
            randomInt(minSize('dodo'), maxSize('dodo')),
            Dodo.svg);
    }

    protected override createStatusEffects() {
        return {
            Damaged: StatusEffect.forDamaged(this.actualShape,
                [{
                    soundId: 'dodoHit',
                    options: {
                        volume: random(0.4, 0.5),
                        speed: random(1, 1.1),
                    },
                    chanceToPlay: 0.3,
                }]),
        };
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Dodo, file('dodo'), maxSize('dodo'));

export class SaberToothCat extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.saberToothCat, x, y,
            randomInt(minSize('saberToothCat'), maxSize('saberToothCat')),
            SaberToothCat.svg);

    }

    protected override createStatusEffects() {
        return {
            Damaged: StatusEffect.forDamaged(this.actualShape,
                [{
                    soundId: 'saberToothCatHit',
                    options: {
                        volume: random(0.4, 0.5),
                        speed: random(0.9, 1),
                    },
                    chanceToPlay: 0.3,
                }]),
        };
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(SaberToothCat, file('saberToothCat'), maxSize('saberToothCat'));


export class Mammoth extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.mammoth, x, y,
            randomInt(minSize('mammoth'), maxSize('mammoth')),
            Mammoth.svg,
            anchor('mammoth'));
    }

    protected override createStatusEffects() {
        return {
            Damaged: StatusEffect.forDamaged(this.actualShape,
                [{
                    soundId: 'mammothHit',
                    options: {
                        volume: random(0.4, 0.5),
                        speed: random(1, 1.1),
                    },
                    chanceToPlay: 0.3,
                }]),
        };
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Mammoth, file('mammoth'), maxSize('mammoth'));

export class AngryMammoth extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.bossMobs, x, y,
            randomInt(minSize('angryMammoth'), maxSize('angryMammoth')),
            AngryMammoth.svg,
            anchor('angryMammoth'));
    }

    protected override createStatusEffects() {
        return {
            Damaged: StatusEffect.forDamaged(this.actualShape,
                [{
                    soundId: 'mammothHit',
                    options: {
                        volume: random(0.6, 0.7),
                        speed: random(0.4, 0.5),
                    },
                    chanceToPlay: 0.3,
                }]),
        };
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(AngryMammoth, file('angryMammoth'), maxSize('angryMammoth'));

// The player-summoned totem (mob-depth chunk 1): stationary, fixed size, no
// hit sound — the base Damaged flash suffices for the placeholder art.
export class Totem extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.totem, x, y,
            randomInt(minSize('totem'), maxSize('totem')),
            Totem.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Totem, file('totem'), maxSize('totem'));

// The cowardly critter (mob-depth chunk 2): chases like a Dodo while healthy,
// flees below half health. No hit sound — base Damaged flash suffices for the
// placeholder art.
export class Rabbit extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.rabbit, x, y,
            randomInt(minSize('rabbit'), maxSize('rabbit')),
            Rabbit.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Rabbit, file('rabbit'), maxSize('rabbit'));

// Rasterization size for the shared ring texture [PLACEHOLDER 4 m]: the
// sprite is scaled per mob to the wire-driven radius (chunk 3c), this only
// bounds the texture resolution.
// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(
    Mob.damageAura,
    GraphicsConfig.character.damageAuraFile,
    meter2px(4),
);
