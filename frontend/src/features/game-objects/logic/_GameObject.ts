import {Container, Graphics, Text, Texture, Ticker} from 'pixi.js';
import {createInjectedSVG} from '../../core/logic/InjectedSVG';
import {BasicConfig as Constants} from '../../../client-data/BasicConfig';
import {IVector, Vector} from '../../core/logic/Vector';
import {isDefined, isUndefined, nearlyEqual, TwoDimensional} from '../../common/logic/Utils';
import {StatusEffect, StatusEffectDefinition} from './StatusEffect';
import {radians} from "../../common/logic/Types";
import {GameSetupEvent, PrerenderEvent} from "../../core/logic/Events";
import {IGame} from "../../core/logic/IGame";

let movementInterpolatedObjects = new Set();
let rotatingObjects = new Set();

let Game: IGame = null;
GameSetupEvent.subscribe((game: IGame) => {
    Game = game;
});

// Floating-number kinds (item 11) and their colors.
export type FloatingNumberKind = 'damage' | 'heal' | 'xp';
const FLOATING_NUMBER_COLORS: Record<FloatingNumberKind, number> = {
    damage: 0xFF4D4D,
    heal: 0x4DFF88,
    xp: 0xFFD700,
};

// Damage/heal arrive in absolute HP (item 11 Phase 1) — the floating number is
// the literal HP dealt. Kept as a helper so a tiny hit still shows at least 1.
export function hpToDisplay(hp: number): number {
    return Math.max(1, Math.round(hp));
}

export abstract class GameObject {
    readonly id: number;

    layer: Container;
    size: number = Constants.GRAPHIC_BASE_SIZE / 2;
    rotation: number = 0;
    turnRate: number = Constants.DEFAULT_TURN_RATE;
    isMovable: boolean = false;
    rotateOnPositioning: boolean = false;
    visibleOnMinimap: boolean = true;
    shape: Container;
    statusEffects: { [key: string]: StatusEffect };
    activeStatusEffect: StatusEffect = null;

    desiredPosition: Vector;
    desireTimestamp: number;

    desiredRotation: number;
    desiredRotationTimestamp: number;

    protected constructor(
        id: number,
        gameLayer: Container,
        x: number,
        y: number,
        size: number,
        rotation: number,
        svg: Texture,
        anchor?: IVector
    ) {
        this.id = id;
        this.layer = gameLayer;
        this.size = size;
        this.rotation = rotation;

        this.shape = this.initShape(svg, x, y, size, rotation, anchor);
        this.statusEffects = this.createStatusEffects();
        this.show();
    }

    static setup() {
        if (Constants.MOVEMENT_INTERPOLATION) {
            PrerenderEvent.subscribe(moveInterpolatedObjects);
        }
        if (Constants.LIMIT_TURN_RATE) {
            PrerenderEvent.subscribe(applyTurnRate);
        }
    };

    initShape(svg: Texture, x: number, y: number, size: number, rotation: number, anchor?: IVector): Container {
        if (svg) {
            return createInjectedSVG(svg, x, y, size, rotation, anchor);
        } else {
            return this.createShape(x, y, size, rotation);
        }
    }

    protected createStatusEffects() {
        // Default NOP
        return {};
    }

    /**
     * Fallback method if there is no SVG bound to this gameObject class.
     */
    createShape(x: number, y: number, size: number, rotation: number): Graphics {
        throw 'createShape not implemented for ' + this.constructor.name;
    }

    setPosition(x: number, y: number) {
        if (isUndefined(x)) {
            throw "x has to be defined.";
        }
        if (isUndefined(y)) {
            throw "y has to be defined.";
        }

        if (isDefined(this.desiredPosition) && //
            nearlyEqual(this.desiredPosition.x, x, 0.01) && //
            nearlyEqual(this.desiredPosition.y, y, 0.01)) {
            return false;
        }

        if (this.rotateOnPositioning) {
            this.setRotation(TwoDimensional.angleBetween(this.getX(), this.getY(), x, y));
        }

        if (Constants.MOVEMENT_INTERPOLATION) {
            this.desiredPosition = new Vector(x, y); //.sub(this.shape.position);
            this.desireTimestamp = performance.now();
            movementInterpolatedObjects.add(this);
        } else {
            this.shape.position.set(x, y);
        }

        return true;
    }

    movePosition(deltaX, deltaY?) {
        if (arguments.length === 1) {
            // Seems to be a vector
            deltaY = deltaX.y;
            deltaX = deltaX.x;
        }

        this.setPosition(
            this.getX() + deltaX,
            this.getY() + deltaY
        );
    }

    getPosition() {
        // Defensive copy
        // FIXME necessary?
        return Vector.clone(this.shape.position);
    }

    getX() {
        return this.getPosition().x;
    }

    getY() {
        return this.getPosition().y;
    }

    setRotation(rotation: radians) {
        if (isUndefined(rotation)) {
            return;
        }

        rotation %= 2 * Math.PI;

        if (Constants.LIMIT_TURN_RATE && this.turnRate > 0) {
            this.desiredRotation = rotation;
            this.desiredRotationTimestamp = performance.now();
            rotatingObjects.add(this);
        } else {
            this.getRotationShape().rotation = rotation;
        }
    }

    getRotation() {
        return this.getRotationShape().rotation;
    }

    getRotationShape(): Container {
        return this.shape;
    }

    show() {
        this.layer.addChild(this.shape);
    }

    hide() {
        this.layer.removeChild(this.shape);
    }

    updateStatusEffects(newStatusEffects: StatusEffectDefinition[]) {
        if (!Array.isArray(newStatusEffects) || newStatusEffects.length === 0) {
            this.hideActiveStatusEffect();
        } else {
            newStatusEffects = StatusEffect.sortByPriority(newStatusEffects);
            // Get the first (=highest priority) status effect that's supported by this GameObject
            let newStatusEffect = newStatusEffects.find(
                newStatusEffect => this.statusEffects.hasOwnProperty(newStatusEffect.id)
            );
            if (isDefined(newStatusEffect)) {
                if (this.activeStatusEffect === null) {
                    // No effect running, run one
                    this.showStatusEffect(newStatusEffect.id);
                } else if (this.activeStatusEffect.id !== newStatusEffect.id) {
                    this.activeStatusEffect.hide();
                    this.showStatusEffect(newStatusEffect.id);
                }
            } else {
                this.hideActiveStatusEffect();
            }
        }
    }

    private hideActiveStatusEffect() {
        if (this.activeStatusEffect !== null) {
            this.activeStatusEffect.hide();
            this.activeStatusEffect = null;
        }
    }

    // Gold burst ring shown when this entity fires a cooldown skill
    // (BurstFired status effect). Fades out over the server's VFX window
    // (~1.5 s); re-triggers are merged while a ring is showing.
    private burstRing: Graphics = null;

    showBurstRing(radiusPx?: number) {
        if (this.burstRing !== null) return;

        // burst_radius (px) from the wire is the true effect radius; radiusless
        // bursts (e.g. self-heal) fall back to a small ring around the entity.
        const radius = radiusPx > 0 ? radiusPx : this.size * 1.2;
        const ring = new Graphics()
            .circle(0, 0, radius)
            .fill({color: 0xFFD700, alpha: 0.18})
            .stroke({color: 0xFFD700, width: 5, alpha: 1});
        this.burstRing = ring;
        this.shape.addChild(ring);

        const durationMs = 1500;
        const start = performance.now();
        const fade = () => {
            const t = (performance.now() - start) / durationMs;
            if (t >= 1 || ring.destroyed) {
                Ticker.shared.remove(fade);
                if (!ring.destroyed) {
                    this.shape.removeChild(ring);
                    ring.destroy();
                }
                this.burstRing = null;
                return;
            }
            ring.alpha = 1 - t;
        };
        Ticker.shared.add(fade);
    }

    // Rising, fading combat number over the entity (item 11): damage/heal are
    // display points, XP is the raw amount. Detaches to the world-space
    // floatingNumbers layer so it keeps rising as the entity moves and never
    // inherits the shape's rotation.
    showFloatingNumber(value: number, kind: FloatingNumberKind) {
        if (value <= 0) return;
        const label = (kind === 'damage' ? '-' : '+') + value + (kind === 'xp' ? ' XP' : '');
        this.showFloatingText(label, FLOATING_NUMBER_COLORS[kind]);
    }

    // General rising, fading text over the entity — the floating-number
    // animation with a free label/color (first non-number use: the campfire
    // "bound" feedback, chunk 4).
    showFloatingText(label: string, color: number) {
        if (Game === null) return;

        const layer = Game.layers.characterAdditions.floatingNumbers;
        const text = new Text({
            text: label,
            style: {
                fontFamily: 'Arial',
                fontSize: Math.max(14, this.size * 0.9),
                fontWeight: 'bold',
                fill: color,
                stroke: {color: 0x000000, width: 4},
            },
        });
        text.anchor.set(0.5, 0.5);

        // Slight horizontal jitter so numbers stacking on the same tick fan out.
        const startX = this.shape.position.x + (Math.random() - 0.5) * this.size;
        const startY = this.shape.position.y - this.size;
        text.position.set(startX, startY);
        layer.addChild(text);

        const durationMs = 900;
        const risePx = this.size * 1.5;
        const start = performance.now();
        const animate = () => {
            const t = (performance.now() - start) / durationMs;
            if (t >= 1 || text.destroyed) {
                Ticker.shared.remove(animate);
                if (!text.destroyed) {
                    layer.removeChild(text);
                    text.destroy();
                }
                return;
            }
            text.position.y = startY - risePx * t;
            text.alpha = 1 - t * t; // ease-out fade
        };
        Ticker.shared.add(animate);
    }

    // Per-tick aura-hit VFX (item 11 Step 4): a single-instance sprite refreshed
    // on every hit tick. A fast-tick aura re-arms it every tick so it reads as a
    // sustained fire; a slow-tick aura lets it fade out between ticks so each hit
    // reads as a discrete slash. Which one is chosen is purely the server's
    // aura_hit_style (1 = slash, 2 = fire), driven by the aura's tickInterval.
    // This replaces the old white damage flash (former DamagedAmbient tint).
    private auraHitFx: Graphics = null;
    private auraHitFxStyle = 0;
    private auraHitFxExpiry = 0;
    private auraHitFxLifeMs = 200;
    // Horizontal sweep endpoints for the slash (style 1); unused for fire.
    private auraHitFxSweepFrom = 0;
    private auraHitFxSweepTo = 0;

    private static readonly AURA_HIT_LIFE_MS = {1: 220, 2: 240};

    showAuraHit(style: number) {
        if (style <= 0 || this.shape == null) return;

        const lifeMs = GameObject.AURA_HIT_LIFE_MS[style] ?? 200;

        // Same style still showing → just refresh its lifetime (sustained fire).
        if (this.auraHitFx !== null && this.auraHitFxStyle === style) {
            this.auraHitFxExpiry = performance.now() + lifeMs;
            return;
        }

        // New or changed style → rebuild the sprite.
        if (this.auraHitFx !== null && !this.auraHitFx.destroyed) {
            this.shape.removeChild(this.auraHitFx);
            this.auraHitFx.destroy();
        }
        const fx = this.buildAuraHitFx(style);
        this.auraHitFx = fx;
        this.auraHitFxStyle = style;
        this.auraHitFxLifeMs = lifeMs;
        this.auraHitFxExpiry = performance.now() + lifeMs;

        // The slash sweeps fully across the model, entering from a random side.
        if (style === 1) {
            const dir = Math.random() < 0.5 ? -1 : 1;
            this.auraHitFxSweepFrom = -dir * this.size * 1.2;
            this.auraHitFxSweepTo = dir * this.size * 1.2;
            fx.position.x = this.auraHitFxSweepFrom;
        } else {
            fx.position.x = 0;
        }
        this.shape.addChild(fx);

        const fade = () => {
            if (fx.destroyed) {
                Ticker.shared.remove(fade);
                return;
            }
            const remaining = this.auraHitFxExpiry - performance.now();
            if (remaining <= 0) {
                Ticker.shared.remove(fade);
                this.shape.removeChild(fx);
                fx.destroy();
                if (this.auraHitFx === fx) {
                    this.auraHitFx = null;
                    this.auraHitFxStyle = 0;
                }
                return;
            }
            const progress = Math.min(1, 1 - remaining / this.auraHitFxLifeMs);
            if (this.auraHitFxStyle === 1) {
                // Sweep across and fade symmetrically (bright mid-swing).
                fx.position.x = this.auraHitFxSweepFrom +
                    (this.auraHitFxSweepTo - this.auraHitFxSweepFrom) * progress;
                fx.alpha = Math.sin(progress * Math.PI);
            } else {
                fx.alpha = Math.min(1, remaining / this.auraHitFxLifeMs);
            }
        };
        Ticker.shared.add(fade);
    }

    // Placeholder aura-hit art: a bright slash streak that sweeps across the
    // model, or a cluster of orange fire sparks over the avatar. Both are
    // intentionally simple Graphics — real art is a later content/art pass.
    private buildAuraHitFx(style: number): Graphics {
        const s = this.size;
        const g = new Graphics();
        if (style === 1) {
            // Near-vertical streak taller than the model; the ticker sweeps its
            // x across, so it reads as a slash crossing the whole avatar.
            const w = Math.max(3, s * 0.14);
            g.moveTo(0, -s * 1.1).lineTo(0, s * 1.1)
                .stroke({color: 0xff5a4d, width: w * 2.4, alpha: 0.35}); // red glow
            g.moveTo(0, -s * 1.1).lineTo(0, s * 1.1)
                .stroke({color: 0xffffff, width: w, alpha: 0.95});       // white core
            g.rotation = (Math.random() * 0.4) - 0.2; // slight random tilt
        } else {
            // Sustained fire: jittered flame blobs centered low over the avatar.
            const colors = [0xffd24a, 0xff8c1a, 0xff3b1a];
            for (let i = 0; i < 5; i++) {
                const jx = (Math.random() - 0.5) * s * 0.8;
                const jy = s * (-0.05 + Math.random() * 0.4); // over the avatar body
                g.circle(jx, jy, s * (0.14 + Math.random() * 0.12))
                    .fill({color: colors[i % colors.length], alpha: 0.85});
            }
        }
        return g;
    }

    private showStatusEffect(statusEffectid: string) {
        this.activeStatusEffect = this.statusEffects[statusEffectid];
        this.activeStatusEffect.show();
    }

    public onMove(){
    }
}


function moveInterpolatedObjects() {
    let now = performance.now();

    movementInterpolatedObjects.forEach(
        /**
         *
         * @param {GameObject} gameObject
         */
        function (gameObject: GameObject) {
            let elapsedTimePortion = (now - gameObject.desireTimestamp) / Constants.SERVER_TICKRATE;
            if (elapsedTimePortion >= 1) {
                gameObject.shape.position.copyFrom(gameObject.desiredPosition);
                movementInterpolatedObjects.delete(gameObject);
            } else {
                gameObject.shape.position.copyFrom(
                    Vector.clone(gameObject.shape.position).lerp(
                        gameObject.desiredPosition,
                        elapsedTimePortion));
            }
            gameObject.onMove();
        });
}

function applyTurnRate() {
    let now = performance.now();

    rotatingObjects.forEach(
        /**
         *
         * @param {GameObject} gameObject
         */
        function (gameObject: GameObject) {
            let elapsedTime = now - gameObject.desiredRotationTimestamp;
            let rotationDifference = elapsedTime * gameObject.turnRate;
            let rotationShape = gameObject.getRotationShape();
            let currentRotation = rotationShape.rotation;
            let desiredRotation = gameObject.desiredRotation;
            // Choose direction of turning by applying a sign to rotationDifference
            if (currentRotation < desiredRotation) {
                if (Math.abs(currentRotation - desiredRotation) >= Math.PI) {
                    rotationDifference = -rotationDifference;
                }
            } else {
                if (Math.abs(currentRotation - desiredRotation) < Math.PI) {
                    rotationDifference = -rotationDifference;
                }
            }

            if ((rotationDifference >= 0 && currentRotation + rotationDifference >= desiredRotation) ||
                (rotationDifference < 0 && currentRotation + rotationDifference <= desiredRotation)) {
                rotationShape.rotation = desiredRotation;
                rotatingObjects.delete(gameObject);
            } else {
                rotationShape.rotation += rotationDifference;
            }

            gameObject.desiredRotationTimestamp = now;
        });
}
