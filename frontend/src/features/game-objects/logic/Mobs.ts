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
import {AuraTickIndicator} from './AuraTickIndicator';
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
    // Absorb segment on the overhead bar (skill-vocab chunk 2, bare).
    private shieldFillGroup: PIXI.Container;
    private healthFraction: number = 1;
    private shieldFraction: number = 0;
    private barInnerX: number = 0;
    private barInnerWidth: number = 0;
    private auraSprite: PIXI.Container = null;
    // Bare tick indicator (skill-vocab chunk 6): a dot orbiting the aura ring
    // once per effective tick interval — reading a mob's beat to dodge its
    // ticks is the design-critical use case.
    private auraTickIndicator: AuraTickIndicator = null;

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
            if (this.auraTickIndicator !== null) {
                this.auraTickIndicator.setRadius(0);
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
        if (this.auraTickIndicator === null) {
            this.auraTickIndicator = new AuraTickIndicator(this.shape);
        }
        this.auraTickIndicator.setRadius(ringRadius);
    }

    // setAuraTick drives the bare tick indicator from the wire
    // aura_tick_interval / aura_tick_phase fields (skill-vocab chunk 6).
    setAuraTick(interval: number, phase: number) {
        if (this.auraTickIndicator === null) {
            this.auraTickIndicator = new AuraTickIndicator(this.shape);
        }
        this.auraTickIndicator.setTick(interval, phase);
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
        this.healthFraction = relativeHealth;
        this.layoutShieldFill();
    }

    // setShield renders the absorb segment (skill-vocab chunk 2, bare):
    // width per shieldHp/maxHealth, anchored at the end of the HP fill —
    // sliding left over it when the bar is too full to fit, so an active
    // shield is always visible. 0 hides it. Mirrors Character.setShield (the
    // two overhead bars share no base).
    setShield(shieldHp: number, maxHealth: number) {
        this.shieldFraction = maxHealth > 0 ? Math.max(0, Math.min(1, shieldHp / maxHealth)) : 0;
        this.layoutShieldFill();
    }

    private layoutShieldFill() {
        if (!this.shieldFillGroup) {
            return;
        }
        this.shieldFillGroup.visible = this.shieldFraction > 0;
        this.shieldFillGroup.scale.x = this.shieldFraction;
        this.shieldFillGroup.position.x = this.barInnerX +
            Math.min(this.healthFraction, 1 - this.shieldFraction) * this.barInnerWidth;
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

        // Absorb segment (skill-vocab chunk 2); laid out by layoutShieldFill.
        this.barInnerX = -innerWidth / 2;
        this.barInnerWidth = innerWidth;
        this.shieldFillGroup = new PIXI.Container();
        this.shieldFillGroup.position.set(-innerWidth / 2, -innerHeight / 2);
        this.shieldFillGroup.addChild(
            new PIXI.Graphics()
                .rect(0, 0, innerWidth, innerHeight)
                .fill({color: 0x7dc3ff, alpha: 0.75}),
        );
        this.shieldFillGroup.visible = false;
        bar.addChild(this.shieldFillGroup);

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

// The player-summoned companion (mob-depth chunk 6): follows its owner and
// assists in combat. Fixed size, no hit sound — the base Damaged flash
// suffices for the placeholder art.
export class Companion extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.companion, x, y,
            randomInt(minSize('companion'), maxSize('companion')),
            Companion.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Companion, file('companion'), maxSize('companion'));

// The world-spawned environmental fire hazard (hazard fix): stationary,
// structurally unkillable (Viewport-only body layer), pure aura carrier.
export class Brazier extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.brazier, x, y,
            randomInt(minSize('brazier'), maxSize('brazier')),
            Brazier.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Brazier, file('brazier'), maxSize('brazier'));

// The support mob (mob-depth chunk 8): a seek-healer that moves to and heals
// the most-wounded ally of its faction. Its heal ring (aura_radius) shows only
// while it is actively healing someone; floating green heal numbers appear on
// the allies it tops up.
export class Healer extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.healer, x, y,
            randomInt(minSize('healer'), maxSize('healer')),
            Healer.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Healer, file('healer'), maxSize('healer'));

// The fixed world campfire (atmosphere & recovery chunk 2): a permanent
// aligned heal fixture. Brazier pattern — stationary, structurally unkillable
// (Viewport-only body layer), pure aura carrier. Fixed size.
export class Campfire extends Mob {
    static svg: PIXI.Texture;

    private dwellRing: PIXI.Graphics = null;
    private dwellRingRadius = 0;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.campfire, x, y,
            randomInt(minSize('campfire'), maxSize('campfire')),
            Campfire.svg);
    }

    // The darker orange bind circle inside the heal-range ring, drawn from
    // the wire dwell_radius (chunk 4) — the server's bind factor is the
    // single source of truth. True-radius: the server checks the player's
    // center, so the circle gets NO collider-radius extension (unlike the
    // outer ring). Snapshots repeat the value 30×/s; redraw only on change.
    setDwellRadius(radiusPx: number) {
        if (radiusPx === this.dwellRingRadius) {
            return;
        }
        this.dwellRingRadius = radiusPx;
        if (radiusPx <= 0) {
            if (this.dwellRing !== null) {
                this.dwellRing.visible = false;
            }
            return;
        }
        if (this.dwellRing === null) {
            this.dwellRing = new PIXI.Graphics();
            // above the aura ring sprite (child 0), below the fire itself
            this.shape.addChildAt(this.dwellRing, Math.min(1, this.shape.children.length));
        }
        this.dwellRing.clear()
            .circle(0, 0, radiusPx)
            .fill({color: 0xB84A00, alpha: 0.25})
            .stroke({color: 0xB84A00, width: 3, alpha: 0.8});
        this.dwellRing.visible = true;
    }

    // A hidden aura (fade-out sets 0) hides the bind circle with it.
    override setAuraRadius(radiusPx: number) {
        super.setAuraRadius(radiusPx);
        if (radiusPx <= 0) {
            this.setDwellRadius(0);
        }
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Campfire, file('campfire'), maxSize('campfire'));

// The stationary harvest-mob (content pass C1): stands in the Rübenfeld field,
// never moves or fights back — only Harvest damages it (wildcard resist).
// No hit sound — the base Damaged flash suffices for the placeholder art.
export class Turnip extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.turnip, x, y,
            randomInt(minSize('turnip'), maxSize('turnip')),
            Turnip.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Turnip, file('turnip'), maxSize('turnip'));

// --- Z1 wildlife + brambles (content pass C2), sharing the wildlife layer ---

export class Wolf extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('wolf'), maxSize('wolf')),
            Wolf.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Wolf, file('wolf'), maxSize('wolf'));

export class Bear extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('bear'), maxSize('bear')),
            Bear.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Bear, file('bear'), maxSize('bear'));

export class Boar extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('boar'), maxSize('boar')),
            Boar.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Boar, file('boar'), maxSize('boar'));

export class Stag extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('stag'), maxSize('stag')),
            Stag.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Stag, file('stag'), maxSize('stag'));

export class EliteWolf extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('eliteWolf'), maxSize('eliteWolf')),
            EliteWolf.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(EliteWolf, file('eliteWolf'), maxSize('eliteWolf'));

// The Harvest-gated destructible wall segment: a stationary solid mob,
// never moves or fights back (solid-mob pattern, plan-content-zones12.md §4).
export class Bramble extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('bramble'), maxSize('bramble')),
            Bramble.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Bramble, file('bramble'), maxSize('bramble'));

// --- C3 kobold hideout + Dark Tunnel (content pass C3) ---

export class Kobold extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('kobold'), maxSize('kobold')),
            Kobold.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Kobold, file('kobold'), maxSize('kobold'));

export class KoboldRanged extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('koboldRanged'), maxSize('koboldRanged')),
            KoboldRanged.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(KoboldRanged, file('koboldRanged'), maxSize('koboldRanged'));

export class Spider extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('spider'), maxSize('spider')),
            Spider.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Spider, file('spider'), maxSize('spider'));

export class VenomSpider extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('venomSpider'), maxSize('venomSpider')),
            VenomSpider.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(VenomSpider, file('venomSpider'), maxSize('venomSpider'));

// Environmental hazard fixture (brazier pattern): flat puddle, renders under
// the walking mobs on the turnip layer.
export class PoisonPool extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.turnip, x, y,
            randomInt(minSize('poisonPool'), maxSize('poisonPool')),
            PoisonPool.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(PoisonPool, file('poisonPool'), maxSize('poisonPool'));

// The Pickaxe-gated destructible tunnel obstacle: a stationary solid mob,
// never moves or fights back (solid-mob pattern, plan-content-zones12.md §4).
export class Rockfall extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('rockfall'), maxSize('rockfall')),
            Rockfall.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Rockfall, file('rockfall'), maxSize('rockfall'));

// --- C4 Z2 village + bandit gate (content pass C4) ---

export class Bandit extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('bandit'), maxSize('bandit')),
            Bandit.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Bandit, file('bandit'), maxSize('bandit'));

export class BanditRanged extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('banditRanged'), maxSize('banditRanged')),
            BanditRanged.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(BanditRanged, file('banditRanged'), maxSize('banditRanged'));

export class BanditHealer extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('banditHealer'), maxSize('banditHealer')),
            BanditHealer.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(BanditHealer, file('banditHealer'), maxSize('banditHealer'));

export class EliteBandit extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('eliteBandit'), maxSize('eliteBandit')),
            EliteBandit.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(EliteBandit, file('eliteBandit'), maxSize('eliteBandit'));

export class RallyDrummer extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('rallyDrummer'), maxSize('rallyDrummer')),
            RallyDrummer.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(RallyDrummer, file('rallyDrummer'), maxSize('rallyDrummer'));

// Rasterization size for the shared ring texture [PLACEHOLDER 4 m]: the
// sprite is scaled per mob to the wire-driven radius (chunk 3c), this only
// bounds the texture resolution.
// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(
    Mob.damageAura,
    GraphicsConfig.character.damageAuraFile,
    meter2px(4),
);
