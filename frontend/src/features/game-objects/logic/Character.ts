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
import {FIRE_WARD_SKILL_ID, HEAL_AURA_SKILL_ID, LIFEWARDEN_AURA_SKILL_ID, PALADIN_AURA_SKILL_ID, REJUVENATION_AURA_SKILL_ID, VANGUARD_AURA_SKILL_ID, WARBANNER_AURA_SKILL_ID} from '../../../client-data/Skills';

let Game: IGame = null;
GameSetupEvent.subscribe((game: IGame) => {
    Game = game;
});

export class Character extends GameObject implements ICharacterLike, IMiniMapRendered {
    static avatar: ISvgContainer = {svg: undefined};
    static damageAura: ISvgContainer = {svg: undefined};
    static healAura: ISvgContainer = {svg: undefined};
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
    private healthFraction: number = 1;
    private shieldFraction: number = 0;
    private barInnerX: number = 0;
    private barInnerWidth: number = 0;
    private damageAuraSprite: Sprite;
    private healAuraSprite: Sprite;
    // Bare tick indicator (skill-vocab chunk 6): a dot orbiting the aura ring
    // once per effective tick interval, so the beat is visible.
    private auraTickIndicator: AuraTickIndicator = null;
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
        // No ring until the first server state arrives (active_skill_id drives it).
        this.setActiveSkill(0);

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

        this.damageAuraSprite = createInjectedSVG(
            Character.damageAura.svg,
            0,
            0,
            meter2px(GraphicsConfig.character.damageAuraRadiusMeters),
        );
        group.addChild(this.damageAuraSprite);

        this.healAuraSprite = createInjectedSVG(
            Character.healAura.svg,
            0,
            0,
            meter2px(GraphicsConfig.character.damageAuraRadiusMeters),
        );
        this.healAuraSprite.visible = false;
        group.addChild(this.healAuraSprite);

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
        const relativeHealth = maxHealth > 0 ? Math.max(0, Math.min(1, health / maxHealth)) : 0;
        this.healthFillGroup.scale.x = relativeHealth;
        this.healthFraction = relativeHealth;
        this.layoutShieldFill();
    }

    // setShield renders the absorb segment (skill-vocab chunk 2, bare):
    // width per shieldHp/maxHealth, anchored at the end of the HP fill —
    // sliding left over it when the bar is too full to fit, so an active
    // shield is always visible. 0 hides it.
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

    // setActiveSkill drives the aura ring from the server-authoritative
    // Character.active_skill_id wire field. 0 = Nothing → no ring.
    // Ring style per skill ID is a client-side mapping (resolved question 6).
    setActiveSkill(skillId: number) {
        // Paladin and Vanguard both damage and support at once, so they
        // show both rings; pure support auras (heal, FireWard resist) show
        // only the heal-style ring; everything else shows the damage ring.
        const isDual = skillId === PALADIN_AURA_SKILL_ID || skillId === VANGUARD_AURA_SKILL_ID || skillId === WARBANNER_AURA_SKILL_ID;
        const isSupport = skillId === HEAL_AURA_SKILL_ID || skillId === FIRE_WARD_SKILL_ID || skillId === REJUVENATION_AURA_SKILL_ID || skillId === LIFEWARDEN_AURA_SKILL_ID;
        this.damageAuraSprite.visible = skillId !== 0 && !isSupport;
        this.healAuraSprite.visible = isSupport || isDual;
    }

    setAuraRadius(radiusPx: number) {
        // `auraRadius` from the backend is already serialized in pixel units.
        const diameter = radiusPx * 2;
        this.damageAuraSprite.width = diameter;
        this.damageAuraSprite.height = diameter;
        this.healAuraSprite.width = diameter;
        this.healAuraSprite.height = diameter;
        this.ensureAuraTickIndicator().setRadius(radiusPx);
    }

    // setAuraTick drives the bare tick indicator from the wire
    // aura_tick_interval / aura_tick_phase fields (skill-vocab chunk 6).
    setAuraTick(interval: number, phase: number) {
        this.ensureAuraTickIndicator().setTick(interval, phase);
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

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(
    Character.damageAura,
    GraphicsConfig.character.damageAuraFile,
    meter2px(GraphicsConfig.character.damageAuraRadiusMeters));

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(
    Character.healAura,
    GraphicsConfig.character.healAuraFile,
    meter2px(GraphicsConfig.character.damageAuraRadiusMeters));
