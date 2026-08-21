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
import {OverheadHealthBar} from './OverheadHealthBar';
import type {AuraDisplay, DwellRing, Interactable, LevelDisplay, MobPlate, OverheadVitals} from './WireSetters';
import {InteractBadge} from './InteractBadge';
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
 * ⭐ Medallion layering (art overhaul, 2026-08-15).
 *
 * A medallion entity draws TWO stacked sprites: the portrait (`file`) with a
 * frame (`borderFile`) over it. The frame needs its own `ISvgContainer` holder
 * because `registerGameObjectSVG` writes exactly one `.svg` field per target,
 * and the class's own field already holds the portrait.
 *
 * The border goes on the outer `group`, NOT on `actualShape`, so the damage
 * flash floods the portrait only and the frame stays stable
 * (docs/art/pipeline.md §4). Both layers draw at the same `size` off the same
 * square canvas, which is what makes them register — including on a combat mob
 * whose size is rolled per instance.
 */
function registerBorder(borderFile: string, size: number): ISvgContainer {
    const holder: ISvgContainer = {svg: undefined};
    // noinspection JSIgnoredPromiseFromCall
    Preloading.registerGameObjectSVG(holder, borderFile, size);
    return holder;
}

function withBorder(group: PIXI.Container, border: ISvgContainer, size: number): PIXI.Container {
    // Truthiness, not isDefined: the holder starts as `undefined` and the
    // preload may not have resolved by the time the first entity is built.
    if (border.svg) {
        group.addChild(createInjectedSVG(border.svg, 0, 0, size, 0));
    }
    return group;
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

// Conversant (NPC) plate colour: plain white, deliberately outside both the
// difficulty palette (red/orange/yellow/green/gray all mean "a fight") and the
// player-character lavender. [PLACEHOLDER]
const CONVERSANT_PLATE_COLOR = 0xffffff;

export abstract class Mob extends GameObject
    implements OverheadVitals, AuraDisplay, LevelDisplay, MobPlate, Interactable {

    protected actualShape: PIXI.Container;
    private auraRings: AuraRingStack = null;
    // The overhead health/shield bar + effect pips (shared component since
    // plan-code-health.md C5). Created in initHealthBar (constructor body,
    // after field initializers), so the initializer here is safe — unlike
    // fields assigned in initShape.
    private overheadBar: OverheadHealthBar = null;
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
    // Server-resolved effective level of THIS instance (wire Mob.level,
    // plan-mob-levels.md C2); 0 = not sent yet or an old server, which falls
    // back to the species catalog value — today's behaviour exactly.
    private plateLevel: number = 0;

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
     * "<Name> <level>" under the health bar, tinted by how far the mob's level
     * sits from the player's (decision 5). The NAME comes from the catalog;
     * the LEVEL comes from the wire (setLevel), because it is a property of the
     * placement rather than the species (plan-mob-levels.md C2). An id the catalog does not
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
        // things you fight. Conversants (intake round 9 item 1) DO plate:
        // name-only, so the journal's "Return to the Lamplighter" has an
        // in-world anchor.
        if (!definition || !(definition.combatTarget || definition.conversant)) {
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
        this.refreshPlateText();
    }

    /**
     * setLevel takes the server-resolved effective level of this instance
     * (plan-mob-levels.md C2), which is what makes one species placeable at
     * many levels: two Wolves standing at 1 and 25 must not plate the same.
     *
     * ⚑ This has to re-render the text, not just record the number. The plate
     * text is written ONCE per species (setMobId early-returns on an unchanged
     * id), and the level arrives on a later field of the same snapshot — so a
     * setter that only stored the value would leave every plate stamped with
     * the catalog fallback forever. The TINT would still be right, because it
     * is recomputed per frame off `plateDifference`, which is exactly what
     * makes the half-fix look correct in-game.
     */
    setLevel(level: number) {
        if (this.plateLevel === level) {
            return;
        }
        this.plateLevel = level;
        this.plateDifference = null; // force a re-tint at the new level
        this.refreshPlateText();
    }

    /**
     * The level the plate speaks with: the wire value, falling back to the
     * species catalog while it is absent (0 = not sent yet, or an old server
     * during a rollout). One accessor on purpose — the text and the tint must
     * never disagree about which number they are showing.
     */
    private effectiveLevel(definition: { curveLevel: number }): number {
        return this.plateLevel > 0 ? this.plateLevel : definition.curveLevel;
    }

    private refreshPlateText() {
        if (this.nameElement === null) {
            return;
        }
        const definition = mobDefinition(this.plateMobId);
        if (!definition) {
            return;
        }
        // A conversant-only plate carries no level: the number is a combat
        // fact, and an unattackable NPC speaking one would imply a fight.
        this.nameElement.text = definition.combatTarget
            ? `${definition.displayName} ${this.effectiveLevel(definition)}`
            : definition.displayName;
    }

    // Y offset of the plate text: under the overhead bar, read off the bar's
    // own anchor so the two cannot drift apart.
    private nameplateY(): number {
        return this.overheadBar.anchorY + NAMEPLATE_GAP;
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
        // Conversant-only plates never tint — the colour is a statement that
        // this is not a fight, and it does not move with the player's level.
        // plateDifference doubles as the "styled once" marker; setMobId resets
        // it to null on a species change, which is exactly when a restyle is
        // due.
        if (!definition.combatTarget) {
            if (this.plateDifference === null) {
                this.plateDifference = 0;
                this.nameElement.style.fill = CONVERSANT_PLATE_COLOR;
            }
            return;
        }
        const level = this.effectiveLevel(definition);
        const difference = level - getLocalPlayerLevel();
        if (difference === this.plateDifference) {
            return;
        }
        this.plateDifference = difference;
        this.nameElement.style.fill = difficultyColor(level);
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
        this.overheadBar?.setAppliedEffects(mask);
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
        this.overheadBar.setHealth(health, maxHealth);
    }

    setShield(shieldHp: number, maxHealth: number) {
        this.overheadBar.setShield(shieldHp, maxHealth);
    }

    protected override createStatusEffects() {
        return {
            Damaged: StatusEffect.forDamaged(this.actualShape),
        };
    }

    private initHealthBar() {
        // Below the mob (positive y is down); item-11 VFX pass moved it under.
        // On `shape` (not the plate) the bar inherits the night tint, the
        // corpse fade and the darkness hide — deliberate, unlike Character's.
        //
        // ⚑ 1.08, not 0.9: the sprite box spans ±size, so anything under 1.0
        // sits ON the artwork. The old placeholder SVGs only filled ~82% of
        // their box, which hid that — the bar landed in their empty margin.
        // Medallion PNGs fill the box edge to edge, so the bar has to clear
        // 1.0 outright. The 0.08 overshoot is the gap the old art used to have.
        this.overheadBar = new OverheadHealthBar(this.size, Math.max(30, this.size * 1.08));
        this.shape.addChild(this.overheadBar.container);
    }
}

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

// The fixed world campfire (atmosphere & recovery chunk 2): a permanent
// aligned heal fixture. Hazard-fixture pattern — stationary, structurally unkillable
// (Viewport-only body layer), pure aura carrier. Fixed size.
const campfireBorder = registerBorder(GraphicsConfig.mobs.campfire.borderFile, maxSize('campfire'));

export class Campfire extends Mob implements DwellRing {
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

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), campfireBorder, size);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Campfire, file('campfire'), maxSize('campfire'));

// The player-placed mini-campfire (plan-downtime.md C2): the same artwork at
// half the size, on the same layer, and deliberately NOT a subclass of
// Campfire — a camp can never be bound to, so it must never grow the dwell
// bind circle. Its own wire EntityType is what lets it size independently.
const campBorder = registerBorder(GraphicsConfig.mobs.camp.borderFile, maxSize('camp'));

export class Camp extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.campfire, x, y,
            randomInt(minSize('camp'), maxSize('camp')),
            Camp.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), campBorder, size);
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

const wolfBorder = registerBorder(GraphicsConfig.mobs.wolf.borderFile, maxSize('wolf'));

export class Wolf extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('wolf'), maxSize('wolf')),
            Wolf.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), wolfBorder, size);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Wolf, file('wolf'), maxSize('wolf'));

const bearBorder = registerBorder(GraphicsConfig.mobs.bear.borderFile, maxSize('bear'));

export class Bear extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('bear'), maxSize('bear')),
            Bear.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), bearBorder, size);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Bear, file('bear'), maxSize('bear'));

const boarBorder = registerBorder(GraphicsConfig.mobs.boar.borderFile, maxSize('boar'));

export class Boar extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('boar'), maxSize('boar')),
            Boar.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), boarBorder, size);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Boar, file('boar'), maxSize('boar'));

const stagBorder = registerBorder(GraphicsConfig.mobs.stag.borderFile, maxSize('stag'));

export class Stag extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('stag'), maxSize('stag')),
            Stag.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), stagBorder, size);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Stag, file('stag'), maxSize('stag'));

const eliteWolfBorder = registerBorder(GraphicsConfig.mobs.eliteWolf.borderFile, maxSize('eliteWolf'));

export class EliteWolf extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('eliteWolf'), maxSize('eliteWolf')),
            EliteWolf.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), eliteWolfBorder, size);
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

const koboldBorder = registerBorder(GraphicsConfig.mobs.kobold.borderFile, maxSize('kobold'));

export class Kobold extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('kobold'), maxSize('kobold')),
            Kobold.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), koboldBorder, size);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Kobold, file('kobold'), maxSize('kobold'));

const koboldRangedBorder = registerBorder(GraphicsConfig.mobs.koboldRanged.borderFile, maxSize('koboldRanged'));

export class KoboldRanged extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('koboldRanged'), maxSize('koboldRanged')),
            KoboldRanged.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), koboldRangedBorder, size);
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

const banditBorder = registerBorder(GraphicsConfig.mobs.bandit.borderFile, maxSize('bandit'));

export class Bandit extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('bandit'), maxSize('bandit')),
            Bandit.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), banditBorder, size);
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

const orcBorder = registerBorder(GraphicsConfig.mobs.orc.borderFile, maxSize('orc'));

export class Orc extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('orc'), maxSize('orc')),
            Orc.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), orcBorder, size);
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

const alphaWolfBorder = registerBorder(GraphicsConfig.mobs.alphaWolf.borderFile, maxSize('alphaWolf'));

export class AlphaWolf extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('alphaWolf'), maxSize('alphaWolf')),
            AlphaWolf.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), alphaWolfBorder, size);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(AlphaWolf, file('alphaWolf'), maxSize('alphaWolf'));

const marauderBorder = registerBorder(GraphicsConfig.mobs.marauder.borderFile, maxSize('marauder'));

export class Marauder extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('marauder'), maxSize('marauder')),
            Marauder.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), marauderBorder, size);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Marauder, file('marauder'), maxSize('marauder'));

const direWolfBorder = registerBorder(GraphicsConfig.mobs.direWolf.borderFile, maxSize('direWolf'));

export class DireWolf extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('direWolf'), maxSize('direWolf')),
            DireWolf.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), direWolfBorder, size);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(DireWolf, file('direWolf'), maxSize('direWolf'));

const direBearBorder = registerBorder(GraphicsConfig.mobs.direBear.borderFile, maxSize('direBear'));

export class DireBear extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('direBear'), maxSize('direBear')),
            DireBear.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), direBearBorder, size);
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

// Addressed directly rather than via npcCfg(): that helper returns the union of
// every npc entry, and only the medallion NPCs carry a borderFile.
const farmerBorder = registerBorder(
    GraphicsConfig.npcs.farmer.borderFile, GraphicsConfig.npcs.farmer.maxSize);

export class Farmer extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, Farmer.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), farmerBorder, size);
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

const hermitBorder = registerBorder(
    GraphicsConfig.npcs.hermit.borderFile, GraphicsConfig.npcs.hermit.maxSize);

export class Hermit extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, Hermit.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), hermitBorder, size);
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

const townCrierBorder = registerBorder(
    GraphicsConfig.npcs.townCrier.borderFile, GraphicsConfig.npcs.townCrier.maxSize);

export class TownCrier extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, TownCrier.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), townCrierBorder, size);
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

const cityGuardBorder = registerBorder(
    GraphicsConfig.npcs.cityGuard.borderFile, GraphicsConfig.npcs.cityGuard.maxSize);

export class CityGuard extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.resources.trees, x, y, size, CityGuard.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), cityGuardBorder, size);
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
