import {IVector} from "../../core/logic/Vector";
import {GameObject} from './_GameObject';
import * as Preloading from '../../core/logic/Preloading';
import {random, randomInt} from '../../common/logic/Utils';
import {GraphicsConfig} from '../../../client-data/Graphics';
import {StatusEffect} from './StatusEffect';
import {IGame} from '../../core/logic/IGame';
import {GameSetupEvent, ISubscriptionToken, PrerenderEvent} from '../../core/logic/Events';
import {createNamedContainer} from '../../pixi-js/logic/CustomData';
import * as TextDisplay from '../../../client-data/TextDisplay';
import {difficultyColor, getLocalPlayerLevel, mobDefinition, TierRank} from '../../../client-data/Mobs';
import * as PIXI from 'pixi.js';
import {createInjectedSVG} from "../../core/logic/InjectedSVG";
import {AuraTickIndicator} from './AuraTickIndicator';
import {AuraRingStack} from './AuraRings';
import {EffectPips} from './EffectPips';
import {InteractBadge} from './InteractBadge';
import {shieldBarSegments} from './ShieldBarMath';
import {BeatDetector} from './AuraBeat';
import {meter2px} from "../../../client-data/BasicConfig";
import * as DarknessOverlay from '../../darkness/logic/DarknessOverlay';
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

/**
 * Portrait frame ring per mob tier, keyed by the wire `Mob.tier` rank
 * (triage item 15). The rank ↔ meaning contract is TierRank
 * (client-data/Mobs.ts), pinned against the backend by
 * api/shared-constants.json (§35 C4c); only the styles live here.
 *
 * Normal is deliberately absent: the common case stays unmarked, so a frame
 * always means "this one is above baseline". All values [PLACEHOLDER].
 */
const TIER_FRAME_STYLES: { readonly [rank: number]: { color: number, width: number, alpha: number } | undefined } = {
    [TierRank.Elite]: {color: 0xc8ccd4, width: 2, alpha: 0.85},  // silver
    [TierRank.Boss]: {color: 0xe8c04a, width: 3, alpha: 0.95},   // gold
};

// Nameplate offset below the overhead HP bar, in px. [PLACEHOLDER]
const NAMEPLATE_GAP = 16;

export abstract class Mob extends GameObject {

    protected actualShape: PIXI.Container;
    private healthFillGroup: PIXI.Container;
    // Absorb segment on the overhead bar (skill-vocab chunk 2, bare).
    private shieldFillGroup: PIXI.Container;
    // Raw wire values, kept so either setter can re-derive BOTH bar segments —
    // the split depends on health + shield together (N1, shieldBarSegments).
    private lastHealth: number = 1;
    private lastMaxHealth: number = 1;
    private lastShieldHp: number = 0;
    private barInnerX: number = 0;
    private barInnerWidth: number = 0;
    private auraRings: AuraRingStack = null;
    // Buff/debuff pips under the overhead bar (wire applied_effects). Created
    // in initHealthBar (constructor body, after field initializers), so the
    // initializer here is safe — unlike fields assigned in initShape.
    private effectPips: EffectPips = null;
    // Tier frame ring (triage item 15); tierRank caches the last drawn rank so
    // the Graphics is only rebuilt when the tier actually changes, not per tick.
    //
    // Deliberately declared WITHOUT initializers, like actualShape above: these
    // are assigned in initShape(), which the _GameObject constructor calls
    // before subclass field initializers run — an `= null` here would silently
    // overwrite the value initShape just set.
    private tierFrame: PIXI.Graphics;
    private tierFrameRadius: number;
    private tierRank: number;
    // Bare tick indicator (skill-vocab chunk 6): a dot orbiting the aura ring
    // once per effective tick interval — reading a mob's beat to dodge its
    // ticks is the design-critical use case.
    private auraTickIndicator: AuraTickIndicator = null;
    // Beat inference for the N5 ring pulse — see setAuraTick.
    private readonly auraBeat = new BeatDetector();
    // Interact prompt (chunk 3b-i): shown only while the server names this
    // entity in GameState.interactable_entity_id. Created lazily on the first
    // show, so the overwhelming majority of mobs — which nobody can talk to —
    // never build one.
    private interactBadge: InteractBadge = null;
    // Level-tinted nameplate (feedback pass C item 2). Like the character
    // plate it lives on the UNFILTERED namePlates overlay: the whole point of
    // the plate is its colour, and the night filter would recolour a tint
    // rendered inside `shape` — a green mob would read yellow at dusk.
    private plate: PIXI.Container = null;
    private plateSubToken: ISubscriptionToken = null;
    private nameElement: PIXI.Text = null;
    // Last rendered species + difference, so the plate is rebuilt only when
    // something actually changed (the wire re-sends mobId every tick, and the
    // difference moves when the PLAYER levels, not the mob).
    private plateMobId: number = 0;
    private plateDifference: number = null;

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

        this.plate = createNamedContainer('mobPlate');
        this.plate.position.copyFrom(this.shape.position);
        Game.layers.characterAdditions.namePlates.addChild(this.plate);
        this.plateSubToken = PrerenderEvent.subscribe(this.updatePlate, this);
    }

    /**
     * setMobId resolves the species against the /mobs catalog and renders
     * "<Name> <cL>" under the health bar, tinted by how far the mob's combat
     * level sits from the player's (decision 5). An id the catalog does not
     * know (catalog still loading, or fetch failed) renders nothing at all —
     * a nameless mob beats a mob labelled "undefined".
     */
    setMobId(mobId: number) {
        if (this.plateMobId === mobId) {
            return;
        }
        this.plateMobId = mobId;
        this.plateDifference = null; // force a re-tint for the new species

        const definition = mobDefinition(mobId);
        // No plate for an unknown id (catalog still loading or fetch failed —
        // a nameless mob beats one labelled "undefined"), nor for the
        // fixtures/summons/obstacles that are MobDefinitions without being
        // things you fight.
        if (!definition || !definition.combatTarget) {
            this.nameElement?.destroy();
            this.nameElement = null;
            return;
        }

        if (this.nameElement === null) {
            const text = new PIXI.Text({
                text: '',
                style: TextDisplay.style({
                    stroke: {color: '#000000', width: 3},
                    fontSize: 16,
                    fontWeight: '700',
                }),
            });
            text.anchor.set(0.5, 0);
            text.position.set(0, this.nameplateY());
            this.plate.addChild(text);
            this.nameElement = text;
        }
        this.nameElement.text = `${definition.displayName} ${definition.curveLevel}`;
    }

    // Y offset of the plate text: under the overhead bar, whose own offset is
    // derived from the mob size in initHealthBar — kept in one expression so
    // the two cannot drift apart.
    private nameplateY(): number {
        return Math.max(30, this.size * 0.9) + NAMEPLATE_GAP;
    }

    /**
     * Per-frame: glue the plate to the (interpolated) mob position and keep
     * the difficulty tint current. The tint is recomputed rather than pushed
     * on level-up: it depends on the PLAYER's level, so a push would need
     * every live mob to subscribe to a level event — this comparison is two
     * integer ops and only touches PixiJS when the band actually changes.
     *
     * The plate also mirrors the shape's alpha so it fades with the mob's
     * corpse fade-out instead of hanging at full opacity over a vanishing mob,
     * and hides outright while the mob stands in unlit darkness — the plate
     * renders on the overlay ABOVE the darkness layer, so without this it is
     * the one thing still legible in a fully black area (see isHidden()).
     * DarknessOverlay subscribes to PrerenderEvent during Game construction,
     * i.e. before any mob exists, so the light positions it tests against have
     * already been advanced for this frame.
     */
    private updatePlate() {
        this.plate.position.copyFrom(this.shape.position);
        this.plate.alpha = this.shape.alpha;
        this.plate.visible = !DarknessOverlay.isHidden(
            this.shape.position.x, this.shape.position.y);

        if (this.nameElement === null) {
            return;
        }
        const definition = mobDefinition(this.plateMobId);
        if (!definition) {
            return;
        }
        const difference = definition.curveLevel - getLocalPlayerLevel();
        if (difference === this.plateDifference) {
            return;
        }
        this.plateDifference = difference;
        this.nameElement.style.fill = difficultyColor(definition.curveLevel);
    }

    /**
     * Show or hide the interact prompt over this mob (chunk 3b-i). The caller
     * passes whether this entity is the one on offer, so the badge and the
     * range check behind it can never disagree.
     *
     * ⚑ Server-driven for every mob EXCEPT campfires. `interactable_entity_id`
     * names conversants, and a campfire has no authored `interaction` — its
     * offer is added client-side (flight C3, Backend.campfireUnderPlayer) from
     * the bind radius the server streams. Still one range check, still not a
     * second implementation of one; just not the same publisher.
     */
    setInteractable(interactable: boolean) {
        if (!interactable && this.interactBadge === null) {
            return; // the common case: no badge, and none wanted
        }
        if (this.interactBadge === null) {
            // Drawn into the shape group so it fades and darkens with the mob,
            // but anchored off the art alone — the group also carries the aura
            // rings, the dwell ring and the health bar (R4).
            this.interactBadge = new InteractBadge(this.shape, this.actualShape);
        }
        this.interactBadge.setVisible(interactable);
    }

    // Terminal for a mob: EntityManager deletes the object on removal and
    // builds a fresh one if the mob re-enters the viewport, so the overlay
    // plate is released with it (the Character.hide precedent).
    override hide() {
        super.hide();
        if (this.interactBadge !== null) {
            this.interactBadge.destroy();
            this.interactBadge = null;
        }
        if (this.plateSubToken !== null) {
            this.plateSubToken.unsubscribe();
            this.plateSubToken = null;
        }
        if (this.plate !== null) {
            this.plate.parent?.removeChild(this.plate);
            this.plate.destroy({children: true});
            this.plate = null;
            this.nameElement = null;
        }
    }

    /**
     * Wire-driven aura ring (Mob.aura_radius, mob-depth chunk 3c): the
     * backend sends the active aura's effective radius in px, 0 while the
     * aura is gated — the ring only shows while the mob is aggroed.
     * Replaces the hand-synced damageAuraRadiusMeters constant.
     */
    setAuraRadius(radiusPx: number) {
        if (radiusPx <= 0) {
            if (this.auraRings !== null) {
                this.auraRings.setRadius(0);
            }
            if (this.auraTickIndicator !== null) {
                this.auraTickIndicator.setRadius(0);
            }
            return;
        }
        // Like hit reach, the visual ring extends by the player collider
        // radius (collision is shape-vs-shape).
        const ringRadius = radiusPx + meter2px(GraphicsConfig.character.colliderRadiusMeters);
        this.ensureAuraRings().setRadius(ringRadius);
        if (this.auraTickIndicator === null) {
            this.auraTickIndicator = new AuraTickIndicator(this.shape);
        }
        this.auraTickIndicator.setRadius(ringRadius);
    }

    // setAppliedEffects drives the buff/debuff pips from the wire
    // applied_effects bitmask: the kinds currently applied TO this mob — your
    // dot on it is visible between damage ticks, a slowed mob reads as slowed.
    setAppliedEffects(mask: number) {
        this.effectPips?.setMask(mask);
    }

    // setAuraCategories drives the ring colours from the wire Mob.aura_category
    // bitmask (triage item 7). Before this, every mob ring rendered the same red
    // damage sprite regardless of what the aura actually did — a healer's and a
    // slower's aura were indistinguishable from a damage aura.
    setAuraCategories(mask: number) {
        this.ensureAuraRings().setCategories(mask);
    }

    private ensureAuraRings(): AuraRingStack {
        if (this.auraRings === null) {
            this.auraRings = new AuraRingStack();
            // Bottom of the display list: the ring renders behind the mob art.
            this.shape.addChildAt(this.auraRings.container, 0);
        }
        return this.auraRings;
    }

    // setAuraTick drives the bare tick indicator from the wire
    // aura_tick_interval / aura_tick_phase fields (skill-vocab chunk 6), and
    // since N5 the ring pulse (Character's twin). Mobs carry no active skill
    // id on the wire, so the stream key is 0 — mobs never re-equip, and the
    // interval guard still covers the aura-gating edge.
    setAuraTick(interval: number, phase: number): boolean {
        if (this.auraTickIndicator === null) {
            this.auraTickIndicator = new AuraTickIndicator(this.shape);
        }
        this.auraTickIndicator.setTick(interval, phase);
        const landed = this.auraBeat.observe(0, interval, phase);
        // The ring stack is created lazily with the first visible radius; a
        // gated aura has no ring to pulse.
        this.auraRings?.beat(landed);
        return landed;
    }

    initShape(svg: PIXI.Texture, x: number, y: number, size: number, rotation: number, anchor?: IVector): PIXI.Container {
        const group = new PIXI.Container();
        group.position.set(x, y);

        this.actualShape = new PIXI.Container();
        this.actualShape.addChild(super.initShape(svg, 0, 0, size, rotation, anchor));
        group.addChild(this.actualShape);

        // Tier frame ring (triage item 15) — drawn over the portrait so it reads
        // against dark mob art. Sized from the mob's own graphic, and left
        // invisible until the wire tier arrives (normal tier stays invisible).
        this.tierFrame = new PIXI.Graphics();
        this.tierFrame.visible = false;
        this.tierFrameRadius = size;
        group.addChild(this.tierFrame);

        return group;
    }

    /**
     * setTier draws the portrait frame ring from the wire Mob.tier rank (triage
     * item 15): normal is unmarked, elite and boss get a frame. Tier was
     * previously invisible unless a mob happened to have bespoke elite art, so
     * an elite reskin of a normal mob read as an ordinary mob.
     */
    setTier(rank: number) {
        // Guard with a truthiness check, not isDefined: isDefined only excludes
        // undefined, so it passes for null and would crash on the assignment.
        if (!this.tierFrame) {
            return;
        }
        const style = TIER_FRAME_STYLES[rank];
        if (!style) {
            // Normal tier (or an unknown rank) — no frame.
            this.tierFrame.visible = false;
            this.tierRank = rank;
            return;
        }
        if (this.tierRank === rank) {
            return;
        }
        this.tierRank = rank;
        this.tierFrame.clear();
        this.tierFrame
            .circle(0, 0, this.tierFrameRadius)
            .stroke({width: style.width, color: style.color, alpha: style.alpha});
        this.tierFrame.visible = true;
    }

    setRotation(rotation: number) {
        // Portrait rule (triage item 16): mob icons are portraits and never
        // rotate — ignore the wire heading and keep the default facing
        // (mirrors the fixed rotation on non-local characters).
    }

    getRotationShape(): PIXI.Container {
        return this.actualShape;
    }

    setHealth(health: number, maxHealth: number) {
        this.lastHealth = health;
        this.lastMaxHealth = maxHealth;
        this.layoutBars();
    }

    // setShield renders the absorb segment (skill-vocab chunk 2, bare);
    // 0 hides it. Mirrors Character.setShield (the two overhead bars share
    // no base); split maths shared via shieldBarSegments (N1) — the shield
    // sits directly after the health fill and always fits, because the bar's
    // denominator is total effective HP.
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

        // Buff/debuff pips just under the bar (mirrors Character.initHealthBar;
        // the two overhead bars share no base).
        this.effectPips = new EffectPips();
        this.effectPips.container.y = barHeight / 2 + 9;
        bar.addChild(this.effectPips.container);

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

    /**
     * The wire bind radius in px, 0 when none has been published.
     *
     * Read by `FlightOrigin.fireUnderPlayer` to answer "am I standing at this
     * fire" with the SERVER's radius rather than a client copy — the same
     * value already drawn as the bind circle, so what the player sees and what
     * the prompt tests are one number.
     */
    dwellRadius(): number {
        return this.dwellRingRadius;
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Campfire, file('campfire'), maxSize('campfire'));

// The player-placed mini-campfire (plan-downtime.md C2): the same artwork at
// half the size, on the same layer, and deliberately NOT a subclass of
// Campfire — a camp can never be bound to, so it must never grow the dwell
// bind circle. Its own wire EntityType is what lets it size independently.
export class Camp extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.campfire, x, y,
            randomInt(minSize('camp'), maxSize('camp')),
            Camp.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Camp, file('camp'), maxSize('camp'));

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

// --- C5 the front (content pass C5) ---

export class ArmySoldier extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('armySoldier'), maxSize('armySoldier')),
            ArmySoldier.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(ArmySoldier, file('armySoldier'), maxSize('armySoldier'));

export class Orc extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('orc'), maxSize('orc')),
            Orc.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Orc, file('orc'), maxSize('orc'));

export class Troll extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('troll'), maxSize('troll')),
            Troll.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Troll, file('troll'), maxSize('troll'));

export class BanditPyromancer extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('banditPyromancer'), maxSize('banditPyromancer')),
            BanditPyromancer.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(BanditPyromancer, file('banditPyromancer'), maxSize('banditPyromancer'));

export class SpikeBarricade extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('spikeBarricade'), maxSize('spikeBarricade')),
            SpikeBarricade.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(SpikeBarricade, file('spikeBarricade'), maxSize('spikeBarricade'));

// --- C6 Orc Warlord arena (content pass C6) ---

export class OrcWarlord extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('orcWarlord'), maxSize('orcWarlord')),
            OrcWarlord.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(OrcWarlord, file('orcWarlord'), maxSize('orcWarlord'));

export class WarbannerTotem extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('warbannerTotem'), maxSize('warbannerTotem')),
            WarbannerTotem.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(WarbannerTotem, file('warbannerTotem'), maxSize('warbannerTotem'));

export class OrcGrunt extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('orcGrunt'), maxSize('orcGrunt')),
            OrcGrunt.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(OrcGrunt, file('orcGrunt'), maxSize('orcGrunt'));

export class SoldierCompanion extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('soldierCompanion'), maxSize('soldierCompanion')),
            SoldierCompanion.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(SoldierCompanion, file('soldierCompanion'), maxSize('soldierCompanion'));

export class ShieldbearerCompanion extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('shieldbearerCompanion'), maxSize('shieldbearerCompanion')),
            ShieldbearerCompanion.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(ShieldbearerCompanion, file('shieldbearerCompanion'), maxSize('shieldbearerCompanion'));

export class MedicCompanion extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('medicCompanion'), maxSize('medicCompanion')),
            MedicCompanion.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(MedicCompanion, file('medicCompanion'), maxSize('medicCompanion'));

// --- cL8-17 farm band + unique-art pass (2026-07-21): the dires get their
// own sprites (were Wolf/Bear entityType reskins), plus the three farm-band
// normals. All share the wildlife layer. ---

export class GiantSpider extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('giantSpider'), maxSize('giantSpider')),
            GiantSpider.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(GiantSpider, file('giantSpider'), maxSize('giantSpider'));

export class AlphaWolf extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('alphaWolf'), maxSize('alphaWolf')),
            AlphaWolf.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(AlphaWolf, file('alphaWolf'), maxSize('alphaWolf'));

export class Marauder extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('marauder'), maxSize('marauder')),
            Marauder.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Marauder, file('marauder'), maxSize('marauder'));

export class DireWolf extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('direWolf'), maxSize('direWolf')),
            DireWolf.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(DireWolf, file('direWolf'), maxSize('direWolf'));

export class DireBear extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('direBear'), maxSize('direBear')),
            DireBear.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(DireBear, file('direBear'), maxSize('direBear'));

// Fire elementals (2026-07-21): high-band burn hazards, reusing the shared
// `wildlife` layer like the orcs and marauders — no new layer, so no Game.ts
// container/addChild pair is needed.
export class FireElemental extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('fireElemental'), maxSize('fireElemental')),
            FireElemental.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(FireElemental, file('fireElemental'), maxSize('fireElemental'));

export class GreaterFireElemental extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('greaterFireElemental'), maxSize('greaterFireElemental')),
            GreaterFireElemental.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(
    GreaterFireElemental, file('greaterFireElemental'), maxSize('greaterFireElemental'));

// The player-summoned fire totem: stationary and fixed-size, on the same
// `totem` layer as its plain sibling.
export class FireTotem extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.totem, x, y,
            randomInt(minSize('fireTotem'), maxSize('fireTotem')),
            FireTotem.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(FireTotem, file('fireTotem'), maxSize('fireTotem'));


// --- NPC sprites (plan-entity-model.md chunk 3a) ---
//
// The teaching/lore NPCs used to be a separate statless type riding the
// RESOURCE wire path; merged onto the actor model they ride the MOB path, so
// their sprite classes live here. Three deliberate departures from the mob
// classes above:
//
//  1. They render on `resources.trees`, the layer they have always been on.
//     The `mobs` layers are added to the stage BEFORE `resources`, so giving
//     them a mob layer would silently move every NPC underneath the trees.
//  2. They size from the WIRE radius (the 4th constructor argument
//     EntityManager always passes) rather than from a GraphicsConfig
//     min/max roll — the npc entries carry no minSize, and a fixed
//     hand-placed NPC should not change size between sessions anyway.
//  3. They keep the overhead health bar the Mob constructor draws (PO
//     2026-07-27): an NPC is an actor that can act, and most simply choose
//     not to. The nameplate stays off for free — the catalog's combatTarget
//     is false for anything that grants no XP.
function npcCfg(npc: keyof typeof GraphicsConfig.npcs) {
    return GraphicsConfig.npcs[npc];
}

export class Farmer extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, Farmer.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Farmer, npcCfg('farmer').file, npcCfg('farmer').maxSize);

// The "missing art" marker for an NPC definition whose entityType names no
// drawn sprite yet. Kept deliberately un-gamelike so unconfigured content
// cannot pass for finished content. Since the merge it is authorable directly
// (`"entityType": "NpcPlaceholder"` on a mob definition) rather than being a
// server-side fallback.
export class NpcPlaceholder extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, NpcPlaceholder.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(NpcPlaceholder, npcCfg('placeholder').file, npcCfg('placeholder').maxSize);

export class Signpost extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, Signpost.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Signpost, npcCfg('signpost').file, npcCfg('signpost').maxSize);

export class Hermit extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, Hermit.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Hermit, npcCfg('hermit').file, npcCfg('hermit').maxSize);

export class Wanderer extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, Wanderer.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Wanderer, npcCfg('wanderer').file, npcCfg('wanderer').maxSize);

export class Traveller extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, Traveller.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Traveller, npcCfg('traveller').file, npcCfg('traveller').maxSize);

export class TownCrier extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, TownCrier.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(TownCrier, npcCfg('townCrier').file, npcCfg('townCrier').maxSize);

export class DogNpc extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, DogNpc.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(DogNpc, npcCfg('dogNpc').file, npcCfg('dogNpc').maxSize);

export class Miner extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, Miner.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Miner, npcCfg('miner').file, npcCfg('miner').maxSize);

export class CityGuard extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, CityGuard.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(CityGuard, npcCfg('cityGuard').file, npcCfg('cityGuard').maxSize);

export class VillageHealer extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, VillageHealer.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(VillageHealer, npcCfg('villageHealer').file, npcCfg('villageHealer').maxSize);

export class FrontCaptain extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, FrontCaptain.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(FrontCaptain, npcCfg('frontCaptain').file, npcCfg('frontCaptain').maxSize);
