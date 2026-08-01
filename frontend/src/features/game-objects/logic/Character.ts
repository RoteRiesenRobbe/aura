import {GameObject} from './_GameObject';
import {BasicConfig as Constants} from '../../../client-data/BasicConfig';
import {isDefined} from '../../common/logic/Utils';
import {createInjectedSVG} from '../../core/logic/InjectedSVG';
import * as Preloading from '../../core/logic/Preloading';
import {GraphicsConfig} from '../../../client-data/Graphics';
import {meter2px} from "../../../client-data/BasicConfig";
import {AuraTickIndicator} from './AuraTickIndicator';
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
import {IMiniMapRendered, Layer, LevelOfDynamic} from '../../mini-map/logic/MiniMapInterfaces';
import {AuraRingStack} from './AuraRings';
import {EffectPips} from './EffectPips';
import {shieldBarSegments} from './ShieldBarMath';
import {BeatDetector} from './AuraBeat';

let Game: IGame = null;
GameSetupEvent.subscribe((game: IGame) => {
    Game = game;
});

export class Character extends GameObject implements ICharacterLike, IMiniMapRendered {
    static avatar: ISvgContainer = {svg: undefined};
    static readonly DOWNWARD_FACING_ROTATION = Math.PI / 2;


    name: string;
    nameElement: Text;
    levelElement: Text;
    isPlayerCharacter: boolean;
    movementSpeed: number;

    actualShape: Container;
    private healthFillGroup: Container;
    // Absorb segment on the overhead bar (skill-vocab chunk 2, bare).
    private shieldFillGroup: Container;
    // Raw wire values, kept so either setter can re-derive BOTH bar segments —
    // the split depends on health + shield together (N1, shieldBarSegments).
    private lastHealth: number = 1;
    private lastMaxHealth: number = 1;
    private lastShieldHp: number = 0;
    private barInnerX: number = 0;
    private barInnerWidth: number = 0;
    private auraRings: AuraRingStack;
    // Buff/debuff pips under the overhead bar (wire applied_effects). Created
    // in initHealthBar (constructor body), so an initializer here is safe —
    // unlike fields assigned in initShape.
    private effectPips: EffectPips = null;
    // Bare tick indicator (skill-vocab chunk 6): a dot orbiting the aura ring
    // once per effective tick interval, so the beat is visible.
    private auraTickIndicator: AuraTickIndicator = null;
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
        this.lastHealth = health;
        this.lastMaxHealth = maxHealth;
        this.layoutBars();
    }

    // setShield renders the absorb segment (skill-vocab chunk 2, bare);
    // 0 hides it. Split maths shared with the HUD bar via shieldBarSegments
    // (N1): the shield sits directly after the health fill and always fits,
    // because the bar's denominator is total effective HP.
    setShield(shieldHp: number, maxHealth: number) {
        this.lastShieldHp = shieldHp;
        this.lastMaxHealth = maxHealth;
        this.layoutBars();
    }

    private layoutBars() {
        const {healthFraction, shieldFraction} =
            shieldBarSegments(this.lastHealth, this.lastShieldHp, this.lastMaxHealth);
        this.healthFillGroup.scale.x = healthFraction;
        if (!this.shieldFillGroup) {
            return;
        }
        this.shieldFillGroup.visible = shieldFraction > 0;
        this.shieldFillGroup.scale.x = shieldFraction;
        this.shieldFillGroup.position.x = this.barInnerX + healthFraction * this.barInnerWidth;
    }

    // setAppliedEffects drives the buff/debuff pips from the wire
    // applied_effects bitmask: the kinds currently applied TO this character
    // (a dot no longer waits for its first damage tick to become visible).
    setAppliedEffects(mask: number) {
        this.effectPips?.setMask(mask);
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
        const barWidth = Math.min(160, Math.max(30, this.size * 0.9));
        const barHeight = Math.max(5, Math.min(10, barWidth * 0.12));
        const borderWidth = 1;

        const bar = new Container();
        // Below the avatar (positive y is down); item-11 VFX pass moved the
        // overhead bar under. The HUD health bar (bottom-right) is separate.
        bar.y = Math.max(48, this.size * 1.7);

        bar.addChild(
            new Graphics()
                .rect(-barWidth / 2, -barHeight / 2, barWidth, barHeight)
                .fill({color: 0x000000, alpha: 0.6})
                .stroke({width: borderWidth, color: 0xffffff, alpha: 0.35}),
        );

        const innerWidth = barWidth - 2 * borderWidth;
        const innerHeight = barHeight - 2 * borderWidth;
        this.healthFillGroup = new Container();
        this.healthFillGroup.position.set(-innerWidth / 2, -innerHeight / 2);
        this.healthFillGroup.addChild(
            new Graphics()
                .rect(0, 0, innerWidth, innerHeight)
                .fill({color: 0xaa3b3b, alpha: 0.9}),
        );
        bar.addChild(this.healthFillGroup);

        // Absorb segment (skill-vocab chunk 2); laid out by layoutShieldFill.
        this.barInnerX = -innerWidth / 2;
        this.barInnerWidth = innerWidth;
        this.shieldFillGroup = new Container();
        this.shieldFillGroup.position.set(-innerWidth / 2, -innerHeight / 2);
        this.shieldFillGroup.addChild(
            new Graphics()
                .rect(0, 0, innerWidth, innerHeight)
                .fill({color: 0x7dc3ff, alpha: 0.75}),
        );
        this.shieldFillGroup.visible = false;
        bar.addChild(this.shieldFillGroup);

        // Buff/debuff pips just under the bar; on the plate they stay readable
        // under the night tint, like the bar itself.
        this.effectPips = new EffectPips();
        this.effectPips.container.y = barHeight / 2 + 9;
        bar.addChild(this.effectPips.container);

        this.plate.addChild(bar);
        this.setHealth(1, 1); // full until the first snapshot
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

