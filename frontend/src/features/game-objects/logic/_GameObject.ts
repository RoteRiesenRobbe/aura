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

// Damage/heal arrive in VitalSign wire units (full health = 0xffffffff). This
// placeholder scale turns them into readable points (full health ≈ this many).
const HEALTH_DISPLAY_SCALE = 1000;
const MAX_VITAL_UNITS = 0xffffffff;

// vitalUnitsToDisplay converts a wire VitalSign delta to a display integer,
// never rounding a real hit down to 0.
export function vitalUnitsToDisplay(units: number): number {
    return Math.max(1, Math.round(units / MAX_VITAL_UNITS * HEALTH_DISPLAY_SCALE));
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
        if (value <= 0 || Game === null) return;

        const layer = Game.layers.characterAdditions.floatingNumbers;
        const label = (kind === 'damage' ? '-' : '+') + value + (kind === 'xp' ? ' XP' : '');
        const text = new Text({
            text: label,
            style: {
                fontFamily: 'Arial',
                fontSize: Math.max(14, this.size * 0.9),
                fontWeight: 'bold',
                fill: FLOATING_NUMBER_COLORS[kind],
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
