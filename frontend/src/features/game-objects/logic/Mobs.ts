import {IVector} from "../../core/logic/Vector";
import {GameObject, readTokenOffset, writeTokenOffset} from './_GameObject';
import {createTokenSlots, FRAME_LABEL} from './TokenSlots';
import * as Preloading from '../../core/logic/Preloading';
import {random, randomInt} from '../../common/logic/Utils';
import {GraphicsConfig} from '../../../client-data/Graphics';
import {MedallionSpec, RING_FAMILY_FILES, RingFamily, RingResolver, ringTint} from '../../../client-data/Medallions';
import {StatusEffect} from './StatusEffect';
import {IGame} from '../../core/logic/IGame';
import {GameSetupEvent, ISubscriptionToken, PrerenderEvent} from '../../core/logic/Events';
import {createNamedContainer} from '../../pixi-js/logic/CustomData';
import * as TextDisplay from '../../../client-data/TextDisplay';
import {difficultyColor, formatMobName, getLocalPlayerLevel, mobDefinition} from '../../../client-data/Mobs';
import {questMarkerColor, questMarkerFor, questMarkerGlyph} from '../../../client-data/QuestMarkers';
import * as PIXI from 'pixi.js';
import {createInjectedSVG} from "../../core/logic/InjectedSVG";
import * as SkillFx from '../../skill-fx/logic/SkillFx';
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

// Only a species WITHOUT a medallion rolls its size, so only it authors a
// minSize (D15, PO 2026-10-17); one without falls back to its maxSize.
function minSize(mob: keyof typeof GraphicsConfig.mobs) {
    return GraphicsConfig.mobs[mob].minSize ?? GraphicsConfig.mobs[mob].maxSize;
}

function anchor(mob: keyof typeof GraphicsConfig.mobs) {
    return GraphicsConfig.mobs[mob].anchor;
}

// A mob's medallion spec (Graphics.ts `medallion`): present = it wears a ring
// and draws at its collider's size (plan-appearance.md C1, D15).
function medallion(mob: keyof typeof GraphicsConfig.mobs): MedallionSpec | undefined {
    return GraphicsConfig.mobs[mob].medallion;
}

// The portrait source for a mob: its committed art, plus the pack-manifest
// name that overrides it when the icon pack is loaded (Graphics.ts `packIcon`,
// Preloading.PortraitSource). One helper, so the registrations below did not
// change when the pack arrived.
function file(mob: keyof typeof GraphicsConfig.mobs): Preloading.PortraitSource {
    return {file: GraphicsConfig.mobs[mob].file, packIcon: GraphicsConfig.mobs[mob].packIcon};
}

/**
 * ⭐ Frame layering (art overhaul, 2026-08-15).
 *
 * A framed entity draws TWO stacked sprites: the portrait (`file`) with a
 * frame over it. Since plan-appearance.md C1 a medallion species' frame is its
 * ring family (resolveRing); `withBorder` is left to the fixtures and summons
 * that still carry a `borderFile` of their own. The frame needs its own `ISvgContainer` holder
 * because `registerGameObjectSVG` writes exactly one `.svg` field per target,
 * and the class's own field already holds the portrait.
 *
 * The border goes on the outer `group`, NOT on `actualShape`, so the damage
 * flash floods the portrait only and the frame stays stable
 * (docs/art/pipeline.md §4). Both layers draw at the same `size` off the same
 * square canvas, which is what makes them register at any size.
 *
 * Since plan-natural-weapons.md (PO ruling D9) "the outer group" means the
 * group's TOKEN container, the sibling of the portrait that a lunge moves, so
 * the frame jabs with the face it frames. Since plan-appearance.md C0a the
 * border goes into the token's FRAME slot (createTokenSlots); `withBorder`
 * finds it by label.
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
        // Every caller hands in a Mob.initShape group, which always holds the
        // frame slot: a missing one throws here rather than drawing a frame
        // that stays behind when the body jabs.
        group.getChildByLabel(FRAME_LABEL, true).addChild(createInjectedSVG(border.svg, 0, 0, size, 0));
    }
    return group;
}

// One shared texture per ring family (client-data/Medallions.ts), drawn into
// a medallion mob's frame slot once its species' faction is known. The size is
// the SVG raster size: the families' 256 px canvas at its own scale, which
// covers the biggest collider (the Dragon's 96 px half-size) at DPR 2.
const RING_PRELOAD_SIZE = 128;
const ringTextures = Object.fromEntries(
    (Object.keys(RING_FAMILY_FILES) as RingFamily[]).map(family =>
        [family, registerBorder(RING_FAMILY_FILES[family], RING_PRELOAD_SIZE)]),
) as Record<RingFamily, ISvgContainer>;

// Nameplate offset below the overhead HP bar, in px. [PLACEHOLDER]
const NAMEPLATE_GAP = 16;

// Conversant (NPC) plate colour: plain white, deliberately outside both the
// difficulty palette (red/orange/yellow/green/gray all mean "a fight") and the
// player-character lavender. [PLACEHOLDER]
const CONVERSANT_PLATE_COLOR = 0xffffff;

// The quest-giver glyph (plan-quest-giver-markers.md C3): px above the art's top
// edge, its font size, and the px between it and the E badge when the two share
// the row (centred as a pair). [PLACEHOLDER]
const QUEST_GLYPH_GAP = 6;
const QUEST_GLYPH_SIZE = 34;
const QUEST_ROW_GAP = 4;

export abstract class Mob extends GameObject
    implements OverheadVitals, AuraDisplay, LevelDisplay, MobPlate, Interactable {

    protected actualShape: PIXI.Container;
    // The portrait and the ring as ONE node
    // (plan-natural-weapons.md §3.2, D9): the only thing a lunge moves.
    // belowArt and aboveArt are the slots under and over it
    // (createTokenSlots, plan-appearance.md C0a). All declared WITHOUT an
    // initializer, like actualShape.
    private token: PIXI.Container;
    protected belowArt: PIXI.Container;
    private aboveArt: PIXI.Container;
    private frame: PIXI.Container;
    // The medallion ring (plan-appearance.md C1): null for a species without a
    // medallion. Drawn once the catalog names the species' faction; see
    // resolveRing. Both are set after initShape, so initializers are safe.
    private ringResolver: RingResolver = null;
    private ring: PIXI.Sprite = null;
    // The wire tier rank, which tints the ring (Medallions.ringTint). Kept
    // apart from the ring because setTier runs before setMobId every tick, so
    // the first tier arrives before the ring exists. 0 = normal.
    private tierRank = 0;
    // Created in the constructor body (after field initializers), so the
    // initializer here is safe.
    private auraRings: AuraRingStack = null;
    // The overhead health/shield bar + effect pips (shared component since
    // plan-code-health.md C5). Created in initHealthBar (constructor body,
    // after field initializers), so the initializer here is safe — unlike
    // fields assigned in initShape.
    private overheadBar: OverheadHealthBar = null;
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
    // The `!` / `?` over a quest giver's head (plan-quest-giver-markers.md C3),
    // on the plate overlay so trees and darkness never cover it; built lazily on
    // the first marker. questGlyphKey is the last drawn glyph + colour, so the
    // text is only restyled when the marker or its tint actually changes.
    private questGlyph: PIXI.Text = null;
    private questGlyphKey = '';
    // How far the art's top edge sits above its origin, measured once (the
    // InteractBadge rule: the art's bounds, never the wire radius).
    private spriteTop: number = null;

    protected constructor(
        id: number,
        gameLayer: PIXI.Container,
        x: number,
        y: number,
        size: number,
        svg: PIXI.Texture,
        medallion?: MedallionSpec,
    ) {
        super(id, gameLayer, x, y, size, 0, svg);
        this.ringResolver = medallion ? new RingResolver(medallion) : null;
        // Bottom of belowArt: the ring renders behind the mob art and under
        // the campfire's dwell ring. Every mob gets one, as it already did on
        // its first snapshot (setAuraCategories); it stays empty until an
        // aura is drawn.
        this.auraRings = new AuraRingStack();
        this.belowArt.addChild(this.auraRings.container);
        this.initHealthBar();
        this.isMovable = true;

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
        this.resolveRing(mobId);
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
     * Draws the medallion ring from the species' faction (plan-appearance.md
     * C1, M-§6.1). Called on every setMobId, BEFORE its early return: the
     * resolver keeps answering "nothing yet" until the /mobs catalog knows the
     * species (M-§5.5), so a mob that arrived before the catalog gets its ring
     * on the first tick after it lands.
     */
    private resolveRing(mobId: number) {
        const family = this.ringResolver?.resolve(mobId, mobDefinition(mobId));
        if (family === undefined) {
            return;
        }
        this.ring?.destroy();
        this.ring = null;
        // Truthiness, as in withBorder: the texture may still be loading, and
        // then the next tick tries again rather than leaving the mob bare.
        const texture = ringTextures[family].svg;
        if (!texture) {
            this.ringResolver.forget();
            return;
        }
        this.ring = createInjectedSVG(texture, 0, 0, this.size, 0);
        this.ring.tint = ringTint(this.tierRank);
        this.frame.addChild(this.ring);
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
            ? `${formatMobName(definition.displayName)} ${this.effectiveLevel(definition)}`
            : formatMobName(definition.displayName);
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
        this.updateQuestGlyph();

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
     * Per-frame: the quest giver's `!` / `?` (plan-quest-giver-markers.md C3),
     * read off the server's per-species markers. Recomputed rather than pushed
     * for the plate tint's reason: the `!` colour moves with the PLAYER's level.
     */
    private updateQuestGlyph() {
        const marker = this.plateMobId > 0 ? questMarkerFor(this.plateMobId) : undefined;
        if (marker === undefined) {
            if (this.questGlyph !== null) {
                this.questGlyph.visible = false;
            }
            this.interactBadge?.setOffsetX(0);
            return;
        }
        if (this.questGlyph === null) {
            this.questGlyph = new PIXI.Text({
                text: '',
                style: TextDisplay.style({
                    stroke: {color: '#000000', width: 5},
                    fontSize: QUEST_GLYPH_SIZE,
                    fontWeight: '900',
                }),
            });
            this.questGlyph.anchor.set(0.5, 1);
            this.plate.addChild(this.questGlyph);
        }
        const glyph = questMarkerGlyph(marker.kind);
        const color = questMarkerColor(marker);
        const key = `${glyph}${color}`;
        if (key !== this.questGlyphKey) {
            this.questGlyphKey = key;
            this.questGlyph.text = glyph;
            this.questGlyph.style.fill = color;
        }
        if (this.spriteTop === null) {
            this.spriteTop = Math.max(0, -this.actualShape.getLocalBounds().y);
        }
        // One row, centred as a pair: `!` left, E right; the `!` alone is centred.
        const badgeWidth = this.interactBadge?.shownWidth() ?? 0;
        if (badgeWidth > 0) {
            const glyphWidth = this.questGlyph.width;
            const total = glyphWidth + QUEST_ROW_GAP + badgeWidth;
            this.questGlyph.x = (glyphWidth - total) / 2;
            this.interactBadge.setOffsetX((total - badgeWidth) / 2);
        } else {
            this.questGlyph.x = 0;
        }
        this.questGlyph.y = -(this.spriteTop + QUEST_GLYPH_GAP);
        this.questGlyph.visible = true;
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
            // Drawn into the shape group (its aboveArt slot) so it fades and
            // darkens with the mob, but anchored off the art alone — the group
            // also carries the aura rings, the dwell ring and the health bar (R4).
            this.interactBadge = new InteractBadge(this.aboveArt, this.actualShape);
        }
        this.interactBadge.setVisible(interactable);
    }

    // Terminal for a mob: EntityManager deletes the object on removal and
    // builds a fresh one if the mob re-enters the viewport, so the overlay
    // plate is released with it (the Character.hide precedent).
    override hide() {
        // A body parked mid-jab must not outlive the entity (§3.2 reset paths).
        this.setBodyOffset(0, 0);
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
            this.questGlyph = null;
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
            this.auraRings.setRadius(0);
            SkillFx.setGlowRadius(this, 0);
            return;
        }
        // Like hit reach, the visual ring extends by the player collider
        // radius (collision is shape-vs-shape).
        const ringRadius = radiusPx + meter2px(GraphicsConfig.character.colliderRadiusMeters);
        this.auraRings.setRadius(ringRadius);
        SkillFx.setGlowRadius(this, ringRadius);
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
        this.auraRings.setCategories(mask);
    }

    // setAuraTick drives the wind-up glow from the wire aura_tick_interval /
    // aura_tick_phase fields (skill-vocab chunk 6; since plan-skill-vfx.md C2a
    // the glow is drawn by SkillFx on its own layer rather than by an indicator
    // hanging off this shape), and since N5 the ring pulse (Character's twin).
    // Mobs carry no active skill id on the wire, so the stream key is 0 — mobs
    // never re-equip, and the interval guard still covers the aura-gating edge.
    setAuraTick(interval: number, phase: number): boolean {
        SkillFx.setGlowTick(this, interval, phase);
        // The ambient half (plan-skill-vfx.md C2b). A mob carries no active
        // skill id on the wire, so the SPECIES answers it: every species
        // authors at most one active aura and the /mobs catalog ships its id
        // (§12d.2). Gated exactly as the glow is - a mob's ambient draws
        // while its aura runs, so a pre-aggro gated mob draws none.
        // ⚑ Re-read per tick on purpose: the catalog may still have been
        // loading when setMobId ran, and this is what heals that.
        SkillFx.setAmbient(
            this, interval > 0 ? (mobDefinition(this.plateMobId)?.auraSkillId ?? 0) : 0, false);
        const landed = this.auraBeat.observe(0, interval, phase);
        this.auraRings.beat(landed);
        return landed;
    }

    initShape(svg: PIXI.Texture, x: number, y: number, size: number, rotation: number, anchor?: IVector): PIXI.Container {
        const group = new PIXI.Container();
        group.position.set(x, y);

        // The named slots (createTokenSlots, plan-appearance.md C0a): the token
        // (plan-natural-weapons.md §3.2, D9) holds the tier rim, the portrait,
        // then the frame slot with the ring (resolveRing, or withBorder), so
        // the rings, the bar and the badge in belowArt / aboveArt stay on the
        // logical position while a lunge moves it.
        const slots = createTokenSlots(group, super.initShape(svg, 0, 0, size, rotation, anchor));
        this.belowArt = slots.belowArt;
        this.token = slots.token;
        this.actualShape = slots.actualShape;
        this.frame = slots.frame;
        this.aboveArt = slots.aboveArt;

        return group;
    }

    override setBodyOffset(x: number, y: number): void {
        writeTokenOffset(this.token, x, y);
    }

    override bodyOffset(): { x: number, y: number } {
        return readTokenOffset(this.token);
    }

    /**
     * setTier recolours the medallion ring by the wire Mob.tier rank (triage
     * item 15; since plan-appearance.md C1, PO 2026-10-17, the ring's colour
     * IS the tier: grey, silver, gold). Tier was once invisible unless a mob
     * happened to have bespoke elite art, so an elite reskin of a normal mob
     * read as an ordinary mob. A species without a ring shows no tier.
     */
    setTier(rank: number) {
        if (this.tierRank === rank) {
            return;
        }
        this.tierRank = rank;
        if (this.ring) {
            this.ring.tint = ringTint(rank);
        }
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
        // On `shape` (aboveArt, not the plate) the bar inherits the night tint, the
        // corpse fade and the darkness hide — deliberate, unlike Character's.
        //
        // ⚑ 1.08, not 0.9: the sprite box spans ±size, so anything under 1.0
        // sits ON the artwork. The old placeholder SVGs only filled ~82% of
        // their box, which hid that — the bar landed in their empty margin.
        // Medallion PNGs fill the box edge to edge, so the bar has to clear
        // 1.0 outright. The 0.08 overshoot is the gap the old art used to have.
        this.overheadBar = new OverheadHealthBar(this.size, Math.max(30, this.size * 1.08));
        this.aboveArt.addChild(this.overheadBar.container);
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
// Medallion frame over the pack portrait (Graphics.ts `borderFile`, pipeline.md §4).
const companionBorder = registerBorder(GraphicsConfig.mobs.companion.borderFile, maxSize('companion'));

export class Companion extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.companion, x, y,
            randomInt(minSize('companion'), maxSize('companion')),
            Companion.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), companionBorder, size);
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
            // belowArt: above the aura ring (the constructor put it there
            // first), below the fire itself
            this.belowArt.addChild(this.dwellRing);
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

// The stationary harvest-mob (content pass C1): stands in the turnip field,
// never moves or fights back — only Harvest damages it (wildcard resist).
// No hit sound — the base Damaged flash suffices for the placeholder art.
export class Turnip extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.turnip, x, y,
            size, Turnip.svg, medallion('turnip'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Turnip, file('turnip'), maxSize('turnip'));

// The Turnip's forest-floor twins: Harvest-only, drawn under the walkers.
export class BlueMushroom extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.turnip, x, y,
            size, BlueMushroom.svg, medallion('blueMushroom'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(BlueMushroom, file('blueMushroom'), maxSize('blueMushroom'));

export class RedMushroom extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.turnip, x, y,
            size, RedMushroom.svg, medallion('redMushroom'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(RedMushroom, file('redMushroom'), maxSize('redMushroom'));

// Grandfather Knot's harvest target, the mushrooms' twin as dead branches.
export class Deadwood extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.turnip, x, y,
            size, Deadwood.svg, medallion('deadwood'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Deadwood, file('deadwood'), maxSize('deadwood'));

// A talkable dead body, drawn flat under the characters like the deadwood.
export class Remains extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.turnip, x, y, maxSize('remains'), Remains.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Remains, file('remains'), maxSize('remains'));

// The beach's harvest-mob (the Miller's ring), the Turnip's pattern.
export class Seaweed extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.turnip, x, y,
            size, Seaweed.svg, medallion('seaweed'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Seaweed, file('seaweed'), maxSize('seaweed'));

// --- Z1 wildlife + brambles (content pass C2), sharing the wildlife layer ---

export class Wolf extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, Wolf.svg, medallion('wolf'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Wolf, file('wolf'), maxSize('wolf'));

export class Bear extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, Bear.svg, medallion('bear'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Bear, file('bear'), maxSize('bear'));

export class Boar extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, Boar.svg, medallion('boar'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Boar, file('boar'), maxSize('boar'));

export class AlphaBoar extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, AlphaBoar.svg, medallion('alphaBoar'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(AlphaBoar, file('alphaBoar'), maxSize('alphaBoar'));

export class Stag extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, Stag.svg, medallion('stag'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Stag, file('stag'), maxSize('stag'));

export class EliteWolf extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, EliteWolf.svg, medallion('eliteWolf'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(EliteWolf, file('eliteWolf'), maxSize('eliteWolf'));

// The Harvest-gated destructible wall segment: a stationary solid mob,
// never moves or fights back (solid-mob pattern, plan-content-zones12.md §4).
// Medallion frame over the pack portrait (Graphics.ts `borderFile`, pipeline.md §4).
const brambleBorder = registerBorder(GraphicsConfig.mobs.bramble.borderFile, maxSize('bramble'));

export class Bramble extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('bramble'), maxSize('bramble')),
            Bramble.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), brambleBorder, size);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Bramble, file('bramble'), maxSize('bramble'));

// --- C3 kobold hideout + Dark Tunnel (content pass C3) ---

export class Kobold extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, Kobold.svg, medallion('kobold'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Kobold, file('kobold'), maxSize('kobold'));

export class KoboldRanged extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, KoboldRanged.svg, medallion('koboldRanged'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(KoboldRanged, file('koboldRanged'), maxSize('koboldRanged'));

export class Spider extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, Spider.svg, medallion('spider'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Spider, file('spider'), maxSize('spider'));

export class VenomSpider extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, VenomSpider.svg, medallion('venomSpider'));
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

// The web a giant spider drops mid-fight (plan-aura-drawbacks.md D7): the
// poison pool's shape, slowing instead of hurting. Flat on the ground, walked
// through, on the same under-the-walkers layer.
export class SpiderWeb extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.turnip, x, y,
            randomInt(minSize('spiderWeb'), maxSize('spiderWeb')),
            SpiderWeb.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(SpiderWeb, file('spiderWeb'), maxSize('spiderWeb'));

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

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, Bandit.svg, medallion('bandit'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Bandit, file('bandit'), maxSize('bandit'));

export class BanditRanged extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, BanditRanged.svg, medallion('banditRanged'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(BanditRanged, file('banditRanged'), maxSize('banditRanged'));

export class BanditHealer extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, BanditHealer.svg, medallion('banditHealer'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(BanditHealer, file('banditHealer'), maxSize('banditHealer'));

export class EliteBandit extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, EliteBandit.svg, medallion('eliteBandit'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(EliteBandit, file('eliteBandit'), maxSize('eliteBandit'));

export class RallyDrummer extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, RallyDrummer.svg, medallion('rallyDrummer'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(RallyDrummer, file('rallyDrummer'), maxSize('rallyDrummer'));

// --- C5 the front (content pass C5) ---

// Medallion frame over the pack portrait (Graphics.ts `borderFile`, pipeline.md §4).
const armySoldierBorder = registerBorder(GraphicsConfig.mobs.armySoldier.borderFile, maxSize('armySoldier'));

export class ArmySoldier extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('armySoldier'), maxSize('armySoldier')),
            ArmySoldier.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), armySoldierBorder, size);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(ArmySoldier, file('armySoldier'), maxSize('armySoldier'));

export class Orc extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, Orc.svg, medallion('orc'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Orc, file('orc'), maxSize('orc'));

export class Troll extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, Troll.svg, medallion('troll'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Troll, file('troll'), maxSize('troll'));

export class BanditPyromancer extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, BanditPyromancer.svg, medallion('banditPyromancer'));
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

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, OrcWarlord.svg, medallion('orcWarlord'));
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

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, OrcGrunt.svg, medallion('orcGrunt'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(OrcGrunt, file('orcGrunt'), maxSize('orcGrunt'));

// Medallion frame over the pack portrait (Graphics.ts `borderFile`, pipeline.md §4).
const soldierCompanionBorder = registerBorder(GraphicsConfig.mobs.soldierCompanion.borderFile, maxSize('soldierCompanion'));

export class SoldierCompanion extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('soldierCompanion'), maxSize('soldierCompanion')),
            SoldierCompanion.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), soldierCompanionBorder, size);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(SoldierCompanion, file('soldierCompanion'), maxSize('soldierCompanion'));

// Medallion frame over the pack portrait (Graphics.ts `borderFile`, pipeline.md §4).
const shieldbearerCompanionBorder = registerBorder(GraphicsConfig.mobs.shieldbearerCompanion.borderFile, maxSize('shieldbearerCompanion'));

export class ShieldbearerCompanion extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            randomInt(minSize('shieldbearerCompanion'), maxSize('shieldbearerCompanion')),
            ShieldbearerCompanion.svg);
    }

    override initShape(svg: PIXI.Texture, x: number, y: number, size: number,
                       rotation: number, anchor?: IVector): PIXI.Container {
        return withBorder(super.initShape(svg, x, y, size, rotation, anchor), shieldbearerCompanionBorder, size);
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

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, GiantSpider.svg, medallion('giantSpider'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(GiantSpider, file('giantSpider'), maxSize('giantSpider'));

export class AlphaWolf extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, AlphaWolf.svg, medallion('alphaWolf'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(AlphaWolf, file('alphaWolf'), maxSize('alphaWolf'));

export class Marauder extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, Marauder.svg, medallion('marauder'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Marauder, file('marauder'), maxSize('marauder'));

export class DireWolf extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, DireWolf.svg, medallion('direWolf'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(DireWolf, file('direWolf'), maxSize('direWolf'));

export class DireBear extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, DireBear.svg, medallion('direBear'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(DireBear, file('direBear'), maxSize('direBear'));

// Fire elementals (2026-07-21): high-band burn hazards, reusing the shared
// `wildlife` layer like the orcs and marauders — no new layer, so no Game.ts
// container/addChild pair is needed.
export class FireElemental extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, FireElemental.svg, medallion('fireElemental'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(FireElemental, file('fireElemental'), maxSize('fireElemental'));

export class GreaterFireElemental extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, GreaterFireElemental.svg, medallion('greaterFireElemental'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(
    GreaterFireElemental, file('greaterFireElemental'), maxSize('greaterFireElemental'));

// The Ashen Fields fire pair, on the shared `wildlife` layer like the fire
// elementals.
export class Firelord extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, Firelord.svg, medallion('firelord'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Firelord, file('firelord'), maxSize('firelord'));

export class FireStirer extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.wildlife, x, y,
            size, FireStirer.svg, medallion('fireStirer'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(FireStirer, file('fireStirer'), maxSize('fireStirer'));

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
//  1. They render on `mobs.npcs`, UNDER the characters and the props
//     (plan-prop-draw-order.md D9, PO 2026-10-02: "yes under players"). They
//     used to share the props container, which drew every NPC over the
//     player, stacked at random among the trees.
//  2. They size from the WIRE radius (the 4th constructor argument
//     EntityManager always passes) rather than from a GraphicsConfig
//     min/max roll — the npc entries carry no minSize, and a fixed
//     hand-placed NPC should not change size between sessions anyway.
//     Since D15 (PO 2026-10-17) every medallion mob does the same.
//  3. They keep the overhead health bar the Mob constructor draws (PO
//     2026-07-27): an NPC is an actor that can act, and most simply choose
//     not to. The nameplate stays off for free — the catalog's combatTarget
//     is false for anything that grants no XP.
function npcCfg(npc: keyof typeof GraphicsConfig.npcs) {
    return GraphicsConfig.npcs[npc];
}

// An NPC's medallion spec, the twin of medallion() above; narrowed for the
// same reason as npcFile below.
function npcMedallion(npc: keyof typeof GraphicsConfig.npcs): MedallionSpec | undefined {
    const cfg: { medallion?: MedallionSpec, maxSize: number } = npcCfg(npc);
    return cfg.medallion;
}

// The portrait source for an NPC, the twin of file() above: the committed art
// plus the optional pack-manifest name (Graphics.ts `packIcon`) that overrides
// it when the icon pack is loaded. The npcs map is a union of hand-written
// entries, only some of which carry a packIcon, hence the narrowing.
function npcFile(npc: keyof typeof GraphicsConfig.npcs): Preloading.PortraitSource {
    const cfg: { file: string, packIcon?: string } = npcCfg(npc);
    return {file: cfg.file, packIcon: cfg.packIcon};
}

export class Farmer extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.npcs, x, y, size, Farmer.svg, npcMedallion('farmer'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Farmer, npcFile('farmer'), npcCfg('farmer').maxSize);

// The "missing art" marker for an NPC definition whose entityType names no
// drawn sprite yet. Kept deliberately un-gamelike so unconfigured content
// cannot pass for finished content. Since the merge it is authorable directly
// (`"entityType": "NpcPlaceholder"` on a mob definition) rather than being a
// server-side fallback.
export class NpcPlaceholder extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.npcs, x, y, size, NpcPlaceholder.svg, npcMedallion('placeholder'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(NpcPlaceholder, npcFile('placeholder'), npcCfg('placeholder').maxSize);

export class Signpost extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.npcs, x, y, size, Signpost.svg);
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Signpost, npcFile('signpost'), npcCfg('signpost').maxSize);

export class Hermit extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.npcs, x, y, size, Hermit.svg, npcMedallion('hermit'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Hermit, npcFile('hermit'), npcCfg('hermit').maxSize);

export class Wanderer extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.npcs, x, y, size, Wanderer.svg, npcMedallion('wanderer'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Wanderer, npcFile('wanderer'), npcCfg('wanderer').maxSize);

export class Traveller extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.npcs, x, y, size, Traveller.svg, npcMedallion('traveller'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Traveller, npcFile('traveller'), npcCfg('traveller').maxSize);

export class TownCrier extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.npcs, x, y, size, TownCrier.svg, npcMedallion('townCrier'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(TownCrier, npcFile('townCrier'), npcCfg('townCrier').maxSize);

export class DogNpc extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.npcs, x, y, size, DogNpc.svg, npcMedallion('dogNpc'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(DogNpc, npcFile('dogNpc'), npcCfg('dogNpc').maxSize);

export class Miner extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.npcs, x, y, size, Miner.svg, npcMedallion('miner'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Miner, npcFile('miner'), npcCfg('miner').maxSize);

export class CityGuard extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.npcs, x, y, size, CityGuard.svg, npcMedallion('cityGuard'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(CityGuard, npcFile('cityGuard'), npcCfg('cityGuard').maxSize);

export class VillageHealer extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.npcs, x, y, size, VillageHealer.svg, npcMedallion('villageHealer'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(VillageHealer, npcFile('villageHealer'), npcCfg('villageHealer').maxSize);

export class FrontCaptain extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.npcs, x, y, size, FrontCaptain.svg, npcMedallion('frontCaptain'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(FrontCaptain, npcFile('frontCaptain'), npcCfg('frontCaptain').maxSize);

export class GrandfatherKnot extends Mob {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number, size: number) {
        super(id, Game.layers.mobs.npcs, x, y, size, GrandfatherKnot.svg, npcMedallion('grandfatherKnot'));
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(GrandfatherKnot, npcFile('grandfatherKnot'), npcCfg('grandfatherKnot').maxSize);
