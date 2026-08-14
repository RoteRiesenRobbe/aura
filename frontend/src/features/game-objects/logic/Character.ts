import {GameObject} from './_GameObject';
import {BasicConfig as Constants} from '../../../client-data/BasicConfig';
import {isDefined} from '../../common/logic/Utils';
import {createInjectedSVG} from '../../core/logic/InjectedSVG';
import * as Preloading from '../../core/logic/Preloading';
import {GraphicsConfig} from '../../../client-data/Graphics';
import {meter2px} from "../../../client-data/BasicConfig";
import {AuraTickIndicator} from './AuraTickIndicator';
import {AscensionChannelFx} from './AscensionChannelFx';
import {StatusEffect} from './StatusEffect';
import {IGame} from '../../core/logic/IGame';
import {
    CharacterMoved,
    GameSetupEvent,
    ISubscriptionToken,
    PlayerMoved,
    PrerenderEvent,
} from '../../core/logic/Events';
import {ICharacterLike} from './ICharacter';
import {createNamedContainer} from '../../pixi-js/logic/CustomData';
import {Container, Graphics, Sprite, Text, Texture} from 'pixi.js';
import * as TextDisplay from '../../../client-data/TextDisplay';
import {ISvgContainer} from '../../core/logic/ISvgContainer';
import {IMiniMapRendered, Layer, LevelOfDynamic} from '../../map/logic/MiniMapInterfaces';
import {AuraRingStack} from './AuraRings';
import {OverheadHealthBar} from './OverheadHealthBar';
import type {AuraDisplay, LevelDisplay, OverheadVitals} from './WireSetters';
import {BeatDetector} from './AuraBeat';

let Game: IGame = null;
GameSetupEvent.subscribe((game: IGame) => {
    Game = game;
});

export class Character extends GameObject
    implements ICharacterLike, IMiniMapRendered, OverheadVitals, AuraDisplay, LevelDisplay {
    static avatar: ISvgContainer = {svg: undefined};
    static readonly DOWNWARD_FACING_ROTATION = Math.PI / 2;


    name: string;
    nameElement: Text;
    levelElement: Text;
    isPlayerCharacter: boolean;
    movementSpeed: number;

    actualShape: Container;
    private auraRings: AuraRingStack;
    // The overhead health/shield bar + effect pips (shared component since
    // plan-code-health.md C5). Created in initHealthBar (constructor body),
    // so an initializer here is safe — unlike fields assigned in initShape.
    private overheadBar: OverheadHealthBar = null;
    // Bare tick indicator (skill-vocab chunk 6): a dot orbiting the aura ring
    // once per effective tick interval, so the beat is visible.
    private auraTickIndicator: AuraTickIndicator = null;
    // The ascension ceremony's channel effect — see setChannellingAscension.
    // Built on demand and dropped again, unlike the two above: it exists for
    // ten seconds once in a character's life.
    private ascensionFx: AscensionChannelFx = null;
    // Beat inference for the N5 ring pulse — see setAuraTick.
    private readonly auraBeat = new BeatDetector();
    // Name + level + HP/shield bar live on this world-space plate in the
    // unfiltered namePlates overlay (not on `shape`), so they stay readable
    // under the night tint — the chat-bubble follow pattern (GameObject.say).
    private plate: Container = null;
    private plateSubToken: ISubscriptionToken = null;

    constructor(id: number, x: number, y: number, name: string, isPlayerCharacter: boolean) {
        super(id, Game.layers.characters, x, y, GraphicsConfig.character.size, Character.DOWNWARD_FACING_ROTATION, Character.avatar.svg);
        this.name = name;
        this.isPlayerCharacter = isPlayerCharacter;
        this.movementSpeed = Constants.BASE_MOVEMENT_SPEED;
        this.isMovable = true;
        this.visibleOnMinimap = false;
        this.turnRate = 0;

        // Keep a fixed default facing (down) until explicit rotation is applied.
        this.setRotation(Character.DOWNWARD_FACING_ROTATION);
        // No rings until the first server state arrives (aura_category drives them).
        this.setAuraCategories(0);

        this.plate = createNamedContainer('characterPlate');
        this.plate.position.copyFrom(this.shape.position);
        Game.layers.characterAdditions.namePlates.addChild(this.plate);
        this.plateSubToken = PrerenderEvent.subscribe(this.updatePlate, this);

        this.initHealthBar();
        this.createName();
        this.setLevel(1);
    }

    // Per-frame: glue the plate to the (interpolated) character position.
    // Runs after the movement interpolation — GameObject.setup subscribed
    // that before any Character exists.
    private updatePlate() {
        this.plate.position.copyFrom(this.shape.position);
    }

    initShape(svg: Texture, x: number, y: number, size: number, rotation: number) {
        const group = new Container();
        group.position.set(x, y);

        this.auraRings = new AuraRingStack();
        group.addChild(this.auraRings.container);

        this.actualShape = createNamedContainer('actualShape');
        this.actualShape.addChild(super.initShape(svg, 0, 0, size, rotation));
        group.addChild(this.actualShape);

        return group;
    }

    createStatusEffects() {
        if (this.isPlayerCharacter) {
            super.createStatusEffects();
        }

        return {
            Damaged: StatusEffect.forDamaged(this.actualShape),
        };
    }

    getRotationShape() {
        return this.actualShape;
    }

    setRotation(rotation: number) {
        // Portrait rule (triage item 16): avatars are portraits and never
        // rotate — the local player included, per PO ruling.
        super.setRotation(Character.DOWNWARD_FACING_ROTATION);
    }

    createName() {
        if (!this.name) {
            return;
        }

        if (isDefined(this.nameElement)) {
            this.nameElement.text = this.name;
            return;
        }

        const text = new Text({
            text: this.name,
            style: TextDisplay.style({
                fill: 'white',
            }),
        });
        text.anchor.set(0.5, 0.5);
        this.plate.addChild(text);
        text.position.set(0, -1.3 * this.size);
        this.nameElement = text;
    }

    setLevel(level: number) {
        if (!isDefined(level) || level < 1) {
            level = 1;
        }

        if (!isDefined(this.levelElement)) {
            const text = new Text({
                text: String(level),
                style: TextDisplay.style({
                    fill: '#E9D5FF',
                    stroke: {color: '#2E1065', width: 3},
                    fontSize: 20,
                    fontWeight: '700',
                }),
            });
            text.anchor.set(0.5, 0.5);
            this.plate.addChild(text);
            text.position.set(0.72 * this.size, 0.72 * this.size);
            this.levelElement = text;
            return;
        }

        this.levelElement.text = String(level);
    }

    setHealth(health: number, maxHealth: number) {
        this.overheadBar.setHealth(health, maxHealth);
    }

    setShield(shieldHp: number, maxHealth: number) {
        this.overheadBar.setShield(shieldHp, maxHealth);
    }

    // setAppliedEffects drives the buff/debuff pips from the wire
    // applied_effects bitmask: the kinds currently applied TO this character
    // (a dot no longer waits for its first damage tick to become visible).
    setAppliedEffects(mask: number) {
        this.overheadBar?.setAppliedEffects(mask);
    }

    /**
     * Lifts this character onto the flyers layer for the duration of a flight,
     * and puts it back on landing (plan-flight-paths.md C3, PO pass
     * 2026-08-05: *"the player renders under props while flying"*).
     *
     * ⚑ It moves `this.layer` too, not just the child. `show()`/`hide()` add
     * and remove `shape` from whatever `layer` names, so reparenting the sprite
     * alone would leave `hide()` calling removeChild on a container that no
     * longer holds it — a silent no-op that strands a visible sprite in the
     * world after the entity is gone.
     *
     * Idempotent, and called every tick from the flight fan-out rather than on
     * an edge: a character that left and re-entered the viewport mid-flight is
     * a fresh object on the default layer, exactly like the interact badge's
     * re-apply.
     */
    setFlying(flying: boolean) {
        const target = flying ? Game.layers.flyers : Game.layers.characters;
        if (this.layer === target) {
            return;
        }
        this.layer = target;
        // Only re-add what was already on screen — an object mid-`hide()`
        // must not be resurrected by a flight state change.
        if (this.shape.parent !== null) {
            target.addChild(this.shape);
        }
    }

    // setAuraCategories drives the ring colours from the server-authoritative
    // Character.aura_category bitmask (triage item 7). 0 = no aura → no rings.
    // This replaced a hardcoded skill-ID switch: the categories are resolved
    // from the skill's effects backend-side, so new auras need no client change.
    setAuraCategories(mask: number) {
        this.auraRings.setCategories(mask);
    }

    setAuraRadius(radiusPx: number) {
        // `auraRadius` from the backend is already serialized in pixel units.
        this.auraRings.setRadius(radiusPx);
        this.ensureAuraTickIndicator().setRadius(radiusPx);
    }

    // setAuraTick drives the bare tick indicator from the wire
    // aura_tick_interval / aura_tick_phase fields (skill-vocab chunk 6), and
    // since N5 the ring pulse: the beat is inferred from the phase wrap,
    // guarded against the switch-reset stutter by keying the stream on the
    // active skill id (BeatDetector). Returns whether a beat landed so the
    // own player can drive the HUD metronome without game-objects importing
    // the HUD.
    setAuraTick(interval: number, phase: number, activeSkillId: number = 0): boolean {
        this.ensureAuraTickIndicator().setTick(interval, phase);
        const landed = this.auraBeat.observe(activeSkillId, interval, phase);
        this.auraRings.beat(landed);
        return landed;
    }

    /**
     * The ascension ceremony's channel effect (plan-ascension.md follow-up ②),
     * driven from the same snapshot fan-out that feeds the cast bar.
     *
     * ⚑ Built only once a ceremony actually starts, and torn down at both of
     * its endings (completed, or walked away from). The early return is what
     * keeps this free on the ~every tick of ~every session where nobody is
     * ascending: no object, no ticker callback, nothing added to the scene.
     */
    setChannellingAscension(active: boolean, progress: number) {
        if (!active && this.ascensionFx === null) {
            return;
        }
        this.ensureAscensionFx().update(active, progress, this.size);
    }

    private ensureAscensionFx(): AscensionChannelFx {
        if (this.ascensionFx === null) {
            this.ascensionFx = new AscensionChannelFx(this.shape);
        }
        return this.ascensionFx;
    }

    // Lazily create the indicator on this.shape (the container that holds the
    // aura sprites). NOT built in initShape: that runs during super(), before
    // this class's field initializers, so a `= null` field would clobber it.
    private ensureAuraTickIndicator(): AuraTickIndicator {
        if (this.auraTickIndicator === null) {
            this.auraTickIndicator = new AuraTickIndicator(this.shape);
        }
        return this.auraTickIndicator;
    }

    createMinimapIcon() {
        const miniMapCfg = GraphicsConfig.miniMap.icons.character;
        return new Graphics()
            .circle(0, 0, this.size * miniMapCfg.sizeFactor)
            .fill({color: miniMapCfg.color, alpha: miniMapCfg.alpha});
    }

    get miniMapLayer(): Layer {
        return Layer.CHARACTER;
    }

    get miniMapDynamic(): LevelOfDynamic {
        return LevelOfDynamic.DYNAMIC;
    }

    private initHealthBar() {
        // Below the avatar (positive y is down); item-11 VFX pass moved the
        // overhead bar under. The HUD health bar (bottom-right) is separate.
        // On the plate, the bar and its pips stay readable under the night
        // tint (unlike the mob bar, which deliberately rides `shape`).
        this.overheadBar = new OverheadHealthBar(this.size, Math.max(48, this.size * 1.7));
        this.plate.addChild(this.overheadBar.container);
    }

    // hide() is terminal for a Character (viewport removal / death both build
    // a fresh instance on return) — release the overlay plate with it.
    override hide() {
        super.hide();
        if (this.plateSubToken !== null) {
            this.plateSubToken.unsubscribe();
            this.plateSubToken = null;
        }
        if (this.plate !== null) {
            this.plate.parent?.removeChild(this.plate);
            this.plate.destroy({children: true});
            this.plate = null;
        }
    }

    override onMove(): void {
        if (this.isPlayerCharacter) {
            PlayerMoved.trigger(this.getPosition());
        } else {
            CharacterMoved.trigger(this.getPosition());
        }
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Character.avatar, GraphicsConfig.character.file, GraphicsConfig.character.size);

