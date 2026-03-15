import {GameObject} from './_GameObject';
import {BasicConfig as Constants} from '../../../client-data/BasicConfig';
import {hashCode, isDefined, random, randomFrom} from '../../common/logic/Utils';
import * as Equipment from '../../items/logic/Equipment';
import {EquipmentSlot} from '../../items/logic/Equipment';
import {createInjectedSVG} from '../../core/logic/InjectedSVG';
import * as Preloading from '../../core/logic/Preloading';
import {IVector, Vector} from '../../core/logic/Vector';
import {GraphicsConfig} from '../../../client-data/Graphics';
import {meter2px} from "../../../client-data/BasicConfig";
import {animateAction} from './AnimateAction';
import {StatusEffect} from './StatusEffect';
import {Animation} from '../../animations/logic/Animation';
import {Items} from '../../items/logic/Items';
import {IGame} from '../../core/logic/IGame';
import {
    CharacterEquippedItemEvent,
    CharacterMoved,
    GameSetupEvent,
    ISubscriptionToken,
    PlayerCraftingStateChangedEvent,
    PlayerMoved,
    PrerenderEvent,
} from '../../core/logic/Events';
import {ICharacterLike} from './ICharacter';
import {createNamedContainer} from '../../pixi-js/logic/CustomData';
import {Container, Graphics, Text, Texture} from 'pixi.js';
import * as TextDisplay from '../../../client-data/TextDisplay';
import {spatialAudio} from '../../audio/logic/SpatialAudio';
import {swingLightAudioCues} from '../../player/logic/PlayerJuice';
import {ISvgContainer} from '../../core/logic/ISvgContainer';
import {IMiniMapRendered, Layer, LevelOfDynamic} from '../../mini-map/logic/MiniMapInterfaces';

let Game: IGame = null;
GameSetupEvent.subscribe((game: IGame) => {
    Game = game;
});

export interface Hand {
    container: { group: Container & { originalTranslation: IVector }, slot: Container };
    originalTranslation: IVector;
    originalRotation: number;
}

export class Character extends GameObject implements ICharacterLike, IMiniMapRendered {
    static variants: ISvgContainer[] = [];
    static svg: Texture;
    static craftingIndicator: ISvgContainer = {svg: undefined};
    static damageAura: ISvgContainer = {svg: undefined};
    static hitAnimationFrameDuration: number = GraphicsConfig.character.actionAnimation.backendTicks;
    static readonly DOWNWARD_FACING_ROTATION = Math.PI / 2;
    private static readonly MAX_HEALTH = 0xffffffff;


    name: string;
    nameElement: Text;
    levelElement: Text;
    isPlayerCharacter: boolean;
    movementSpeed: number;

    currentAction: string | false;
    equipmentSlotGroups: { [key in EquipmentSlot]?: Container & { originalTranslation?: IVector }; };
    equippedItems;
    lastRemainingTicks: number = 0;
    useLeftHand: boolean = false;

    actualShape: Container;
    private healthFillGroup: Container;

    // Contains Containers that will mirror this characters position
    followGroups: Container[];

    messages: Text[];
    messagesGroup: Container;
    craftingIndicator: Container;

    leftHand: Hand;
    rightHand: Hand;

    private prerenderSubToken: ISubscriptionToken;

    constructor(id: number, x: number, y: number, name: string, isPlayerCharacter: boolean) {
        super(id, Game.layers.characters, x, y, GraphicsConfig.character.size, Character.DOWNWARD_FACING_ROTATION, Character.pickVariant(name).svg);
        this.name = name;
        this.isPlayerCharacter = isPlayerCharacter;
        this.movementSpeed = Constants.BASE_MOVEMENT_SPEED;
        this.isMovable = true;
        this.visibleOnMinimap = false;
        this.turnRate = 0;

        this.currentAction = false;

        /**
         * Needs the same properties as Equipment.Slots
         */
        this.equipmentSlotGroups = {};
        this.equippedItems = {};
        for (const equipmentSlot in Equipment.EquipmentSlot) {
            //noinspection JSUnfilteredForInLoop
            this.equippedItems[equipmentSlot] = null;
        }

        const placeableSlot = new Container();
        this.actualShape.addChild(placeableSlot);
        this.equipmentSlotGroups[Equipment.EquipmentSlot.PLACEABLE] = placeableSlot;
        placeableSlot.position.set(
            Constants.PLACEMENT_RANGE,
            0,
        );
        placeableSlot.alpha = GraphicsConfig.equippedPlaceableOpacity;

        this.createHands();

        Object.values(this.equipmentSlotGroups).forEach((equipmentSlot: { originalTranslation?: IVector, position: IVector }) => {
            equipmentSlot.originalTranslation = Vector.clone(equipmentSlot.position);
        });

        // Keep a fixed default facing (down) until explicit rotation is applied.
        this.setRotation(Character.DOWNWARD_FACING_ROTATION);

        this.initHealthBar();
        this.createName();
        this.setLevel(1);

        this.followGroups = [];

        const messagesFollowGroup = new Container();
        Game.layers.characterAdditions.chatMessages.addChild(messagesFollowGroup);
        this.followGroups.push(messagesFollowGroup);

        this.messages = [];
        this.messagesGroup = new Container();
        messagesFollowGroup.addChild(this.messagesGroup);
        this.messagesGroup.position.y = -1.2 * (this.size + 24);

        if (this.isPlayerCharacter) {
            const craftProgressFollowGroup = new Container();
            Game.layers.characterAdditions.craftProgress.addChild(craftProgressFollowGroup);
            this.followGroups.push(craftProgressFollowGroup);

            this.craftingIndicator = createNamedContainer('craftingIndicator');
            craftProgressFollowGroup.addChild(this.craftingIndicator);
            this.craftingIndicator.position.y = -1.2 * (this.size + 24) - 20;
            this.craftingIndicator.addChild(createInjectedSVG(Character.craftingIndicator.svg, 0, 0, 20));
            this.craftingIndicator.visible = false;

            const circle = new Graphics();
            circle.label = 'circle';
            this.craftingIndicator.addChild(circle);
            // Let the progress start at 12 o'clock
            circle.rotation = -0.5 * Math.PI;
        }

        this.followGroups.forEach(function (group: Container) {
            group.position.copyFrom(this.shape.position);
        }, this);

        this.prerenderSubToken = PrerenderEvent.subscribe(this.update, this);
    }

    /**
     * Picks a character variant based on the name. Same name = same look, by the magic of hash codes.
     */
    private static pickVariant(name: string): ISvgContainer {
        return Character.variants[hashCode(name) % Character.variants.length];
    }

    initShape(svg: Texture, x: number, y: number, size: number, rotation: number) {
        const group = new Container();
        group.position.set(x, y);

        group.addChild(createInjectedSVG(
            Character.damageAura.svg,
            0,
            0,
            meter2px(GraphicsConfig.character.damageAuraRadiusMeters),
        ));

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
            DamagedAmbient: StatusEffect.forDamagedOverTime(this.actualShape),
            Freezing: StatusEffect.forFreezing(this.actualShape),
        };
    }

    getRotationShape() {
        return this.actualShape;
    }

    setRotation(rotation: number) {
        if (!this.isPlayerCharacter) {
            rotation = Character.DOWNWARD_FACING_ROTATION;
        }

        super.setRotation(rotation);
    }

    createHands() {
        // TODO Hände unter die Frisur rendern
        const handAngleDistance = 0.4;

        this.leftHand = this.createHand(-handAngleDistance);
        this.actualShape.addChild(this.leftHand.container.group);

        this.rightHand = this.createHand(handAngleDistance);
        this.actualShape.addChild(this.rightHand.container.group);

        this.equipmentSlotGroups[Equipment.EquipmentSlot.HAND] = this.rightHand.container.slot;
    }

    createHand(handAngleDistance: number): Hand {
        const group = new Container() as Container & { originalTranslation: { x: number, y: number } };

        const handAngle = 0;
        group.position.set(
            Math.cos(handAngle + Math.PI * handAngleDistance) * this.size * 0.8,
            Math.sin(handAngle + Math.PI * handAngleDistance) * this.size * 0.8,
        );

        const slotGroup = new Container();
        group.addChild(slotGroup);
        slotGroup.position.set(-this.size * 0.2, 0);
        slotGroup.rotation = Math.PI / 2;

        // Intentionally no visible fist shape; keep slot/transform for held item visuals.

        group['originalTranslation'] = Vector.clone(group.position);
        return {
            container: {
                group: group,
                slot: slotGroup,
            },
            originalTranslation: {x: group.x, y: group.y},
            originalRotation: group.rotation,
        };
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
        this.shape.addChild(text);
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
            this.shape.addChild(text);
            text.position.set(0.72 * this.size, 0.72 * this.size);
            this.levelElement = text;
            return;
        }

        this.levelElement.text = String(level);
    }

    setHealth(health: number) {
        const relativeHealth = Math.max(0, Math.min(1, health / Character.MAX_HEALTH));
        this.healthFillGroup.scale.x = relativeHealth;
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

    getEquippedItemAnimationType() {
        let equippedItem = this.getEquippedItem(Equipment.EquipmentSlot.HAND);
        if (equippedItem === null) {
            equippedItem = Items.None;
        }

        return equippedItem.equipment.animation;
    }

    action(remainingTicks?: number) {
        if (isDefined(remainingTicks)) {
            if (this.lastRemainingTicks >= remainingTicks) {
                this.lastRemainingTicks = remainingTicks;
                return; // nothing to do - just let the animation roll
            }
            this.lastRemainingTicks = remainingTicks;
        }

        if (this.isSlotEquipped(Equipment.EquipmentSlot.PLACEABLE)) {
            this.animateAction(this.rightHand, 'stab', remainingTicks);
            this.currentAction = 'PLACING';
            return Character.hitAnimationFrameDuration;
        }

        // If nothing is equipped (= action with bare hand), use the boolean `useLeftHand`
        // to alternate between left and right punches
        if (this.getEquippedItem(Equipment.EquipmentSlot.HAND) === null && this.useLeftHand) {
            spatialAudio.play(randomFrom(swingLightAudioCues), this.getPosition(), {
                volume: 0.25,
                speed: random(0.8, 1.2),
            });
            this.currentAction = 'ALT';
            this.animateAction(this.leftHand, this.getEquippedItemAnimationType(), remainingTicks, true);
        } else {
            this.currentAction = 'MAIN';
            spatialAudio.play(randomFrom(swingLightAudioCues), this.getPosition(), {
                volume: 0.25,
                speed: random(0.8, 1.2),
            });
            this.animateAction(this.rightHand, this.getEquippedItemAnimationType(), remainingTicks);
        }
        this.useLeftHand = !this.useLeftHand;
        return Character.hitAnimationFrameDuration;
    }

    altAction() {
        if (this.isSlotEquipped(Equipment.EquipmentSlot.PLACEABLE)) {
            this.currentAction = false;
            return 0;
        }
    }

    private animateAction(
        hand: Hand,
        type: 'swing' | 'stab',
        remainingTicks?: number,
        mirrored: boolean = false,
    ) {
        animateAction({
            size: this.size,
            hand: hand,
            type,
            animation: new Animation(),
            animationFrame: remainingTicks,
            onDone: () => {
                this.currentAction = false;
            },
            mirrored,
        });
    }

    private initHealthBar() {
        const barWidth = Math.min(160, Math.max(30, this.size * 0.9));
        const barHeight = Math.max(5, Math.min(10, barWidth * 0.12));
        const borderWidth = 1;

        const bar = new Container();
        bar.y = -Math.max(48, this.size * 1.7);

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

        this.shape.addChild(bar);
        this.setHealth(Character.MAX_HEALTH);
    }

    update() {
        const timeDelta = Game.timeDelta;

        this.messages = this.messages.filter((message) => {
            message['timeToLife'] -= timeDelta;
            if (message['timeToLife'] <= 0) {
                this.messagesGroup.removeChild(message);
                return false;
            }
            return true;
        });

        this.followGroups.forEach((group) => {
            group.position.copyFrom(this.shape.position);
        }, this);

        if (this.isPlayerCharacter) {
            this.updatePlayerCharacter();
        }
    }

    updatePlayerCharacter() {
        if (Game.player.isCraftInProgress()) {
            const craftProgress = Game.player.craftProgress;
            let progress = 1 - (craftProgress.remainingTicks / craftProgress.requiredTicks);
            if (progress >= 1) {
                Game.player.craftProgress = null;
                progress = 1;
                this.craftingIndicator.visible = false;
            }

            const craftingIndicatorCircle = this.craftingIndicator.getChildByLabel('circle') as Graphics;
            craftingIndicatorCircle
                .clear()
                .arc(0, 0, 27, 0, progress * 2 * Math.PI)
                .stroke({
                    width: GraphicsConfig.character.craftingIndicator.lineWidth,
                    color: GraphicsConfig.character.craftingIndicator.lineColor,
                });
        } else {
            //TODO: this triggers all the time now, preventing audio loop from sticking when the window is not focused
            PlayerCraftingStateChangedEvent.trigger(false);
        }
    }

    isSlotEquipped(equipmentSlot: EquipmentSlot) {
        return this.equippedItems[equipmentSlot] !== null;
    }

    /**
     * @return {Boolean} whether or not the item was equipped
     */
    equipItem(item, equipmentSlot: EquipmentSlot): boolean {
        // If the same item is already equipped, just cancel
        if (this.equippedItems[equipmentSlot] === item) {
            return false;
        }

        const slotGroup = this.equipmentSlotGroups[equipmentSlot];
        // Offsets are applied to the slot itself to respect the slot rotation
        if (isDefined(item.graphic.offsetX)) {
            slotGroup.position.x = slotGroup.originalTranslation.x + item.graphic.offsetX * 2;
        } else {
            slotGroup.position.x = slotGroup.originalTranslation.x;
        }
        if (isDefined(item.graphic.offsetY)) {
            slotGroup.position.y = slotGroup.originalTranslation.y + item.graphic.offsetY * 2;
        } else {
            slotGroup.position.y = slotGroup.originalTranslation.y;
        }
        const equipmentGraphic = createInjectedSVG(item.graphic.svg, 0, 0, item.graphic.size);
        slotGroup.addChild(equipmentGraphic);

        if (equipmentSlot === Equipment.EquipmentSlot.PLACEABLE) {
            equipmentGraphic.rotation = Math.PI / -2;
        }

        this.equippedItems[equipmentSlot] = item;

        CharacterEquippedItemEvent.trigger({item, equipmentSlot});

        return true;
    }

    /**
     *
     * @param equipmentSlot
     * @return {Item} the item that was unequipped
     */
    unequipItem(equipmentSlot: EquipmentSlot) {
        // If the slot is already empty, just cancel
        if (this.equippedItems[equipmentSlot] === null) {
            return;
        }

        const slotGroup = this.equipmentSlotGroups[equipmentSlot];
        if (!this.isSlotEquipped(equipmentSlot)) {
            return;
        }
        slotGroup.removeChildAt(0);

        const item = this.equippedItems[equipmentSlot];
        this.equippedItems[equipmentSlot] = null;

        return item;
    }

    getEquippedItem(equipmentSlot) {
        return this.equippedItems[equipmentSlot];
    }

    say(message: string) {
        const textStyle = TextDisplay.style({
            fill: '#E37313',
            stroke: {color: '#000000', width: 3},
            wordWrap: true,
            wordWrapWidth: 14 * 16, // no idea why, but it fits the 14em in HTML
            breakWords: true,
            lineHeight: 22,
        });
        const fontSize = textStyle.fontSize as number;

        // Move all currently displayed messages up
        this.messages.forEach((message) => {
            message.position.y -= fontSize * 1.1;
        });

        const messageShape = new Text({
            text: message,
            style: textStyle,
        });
        messageShape.anchor.set(0.5, 1);
        messageShape['timeToLife'] = Constants.CHAT_MESSAGE_DURATION;
        this.messagesGroup.addChild(messageShape);

        this.messages.push(messageShape);
    }

    hide() {
        super.hide();
        this.followGroups.forEach(function (followGroup) {
            followGroup.parent.removeChild(followGroup);
        });
    }

    remove() {
        this.hide();
        this.prerenderSubToken.unsubscribe();
    }

    override onMove(): void {
        if (this.isPlayerCharacter) {
            PlayerMoved.trigger(this.getPosition());
        } else {
            CharacterMoved.trigger(this.getPosition());
        }
    }
}

Character.variants = new Array(GraphicsConfig.character.files.length);
GraphicsConfig.character.files.forEach((file: string | { default: string }, index: number) => {
    Character.variants[index] = {svg: undefined};
// noinspection JSIgnoredPromiseFromCall
    Preloading.registerGameObjectSVG(Character.variants[index], file, GraphicsConfig.character.size);
});

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(
    Character.craftingIndicator,
    GraphicsConfig.character.craftingIndicator.file,
    GraphicsConfig.character.craftingIndicator.size);

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(
    Character.damageAura,
    GraphicsConfig.character.damageAuraFile,
    meter2px(GraphicsConfig.character.damageAuraRadiusMeters));
