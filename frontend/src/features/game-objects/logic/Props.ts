/**
 * Generic, JSON-driven prop rendering (the collapse of the old per-prop
 * boilerplate: a hand-written class + a Graphics.ts entry per simple prop,
 * one for each of House/GateWall/Tombstone doing the exact same thing). A
 * "simple" prop — no behavior beyond drawing its sprite at its authored
 * size/aspect — needs none of that any more: `api/props/*.json` names its own
 * sprite file, and this module discovers every such prop at build time and
 * derives a render class for it. Since plan-prop-draw-order.md P2 that is
 * every prop with art, trees and rocks included; the `Resource` base class
 * lives here, and Resources.ts is gone.
 *
 * A future prop needing its own behavior: write a class extending Resource,
 * add its entityType to BESPOKE_ENTITY_TYPES below, give it its own
 * `gameObjectClasses` line. PropPlaceholder (plan-prop-placeholders.md C2) is
 * the one such class today.
 */
import {Container, Graphics, Text, Texture} from 'pixi.js';
import * as Preloading from '../../core/logic/Preloading';
import {createInjectedSVG} from '../../core/logic/InjectedSVG';
import {requireAll} from '../../common/logic/Utils';
import {GameSetupEvent} from '../../core/logic/Events';
import {IGame} from '../../core/logic/IGame';
import {GameObject} from './_GameObject';
import {StatusEffect} from './StatusEffect';
import {addChildOrdered} from './OrderedLayer';
import * as TextDisplay from '../../../client-data/TextDisplay';
import {
    LABEL_REFERENCE_FONT_SIZE,
    PropFootprint,
    propFootprint,
    propLabelFontSize,
} from './PropPlaceholderLayout';

let Game: IGame = null;
GameSetupEvent.subscribe((game: IGame) => {
    Game = game;
});

// The wire table this rides is still called Resource, but nothing harvestable
// is left on it — props are its only occupants since the actor merge moved NPCs
// to the Mob path. The stock/capacity yield pair (and the sprite rescale it
// drove) went with the pre-accounts hygiene chunk: the server had been sending
// a constant 1/1 ever since the §26 prune emptied the resource system.
//
// ⚑ Not a live map icon: every placed prop is baked into the map from the zone
// data instead (MapProps), so the map does not depend on what was streamed.
export abstract class Resource extends GameObject {
    protected constructor(
        id: number,
        gameLayer: Container,
        x: number,
        y: number,
        size: number,
        rotation: number,
        svg: Texture,
    ) {
        super(id, gameLayer, x, y, size, rotation, svg);
    }

    createStatusEffects() {
        return {
            Damaged: StatusEffect.forDamaged(this.shape),
            DamagedAmbient: StatusEffect.forDamagedOverTime(this.shape),
        };
    }

    // ⭐ By entity id, never appended (plan-prop-draw-order.md D6): ids ascend
    // in zone-file order, so a later prop in the file draws on top, and a prop
    // that leaves the view and comes back returns to its own slot.
    show() {
        addChildOrdered(this.layer, this.shape, this.id);
    }

}

interface PropDefJSON {
    name: string;
    entityType: string;
    sprite: string;
    body: { radius?: number; width?: number; height?: number };
    // Whether placements of this type block movement unless the placement says
    // otherwise. ⭐ ABSENT MEANS TRUE — a prop is solid unless its type declares
    // it decorative — which is why nothing here may coerce it with `!`. Read it
    // through propBlocksMovement() below.
    //
    // ⚑ Server-authoritative: collision is the server's, and this copy exists so
    // the in-game zone editor can COLOUR a prop by what it will actually do.
    blocksMovement?: boolean;
}

type GameObjectClass = new (...args: any[]) => unknown;

/**
 * Which container a prop draws in — the z-order question, and the only thing
 * `underfoot` decides (PO 2026-09-16).
 *
 * ⭐ A prop you WALK ON has to draw BELOW the character walking on it.
 * `props.standing` is added AFTER `layers.characters` (Game.ts), which is
 * right for a tree — you walk behind it — and wrong for a bridge, which would
 * cover the player crossing it. `underfoot` puts it on `props.underfoot`, the
 * last TERRAIN slot, under every entity. It is the mobs-under-characters ruling ("a
 * player standing on a campfire must never be covered by its art") applied to
 * world geometry, and the server refuses a `crossesPaths` placement outside it.
 *
 * ⭐ A PLACEMENT fact since plan-prop-draw-order.md P3 (D4): the placement sits
 * in the zone file's props.underfoot or it does not, and the server streams
 * that as Resource.underfoot. So one prop type can draw in both containers (a
 * broken crate on the road, another one underfoot), and nothing here may read
 * it off the type.
 *
 * ⚑ Resolved per INSTANCE, never captured at module load: the generated
 * classes below are built while this module is imported, and `Game` is still
 * null until the GameSetupEvent fires.
 */
function propLayer(underfoot: boolean): Container {
    return underfoot ? Game.layers.props.underfoot : Game.layers.props.standing;
}

// PropPlaceholder is drawn procedurally (below), never from a sprite.
// ⚑ Tree and Rock/Boulder used to be excluded here too, for their hand-written
// Tree/Stone classes and the resource-spot decal; both retired with
// plan-prop-draw-order.md P2 (D8), so they ride the generic path like
// everything else.
const BESPOKE_ENTITY_TYPES = new Set(['PropPlaceholder']);

// Escape hatch for a future prop whose SVG needs extra rasterisation
// crispness beyond the derived (body units × PX_PER_UNIT). Empty today.
//
// ⚑ The torch briefly used it, at a 0.13 u body: the derived 31 px bake was
// thin for the one small prop a player deliberately looks at. Doubling the
// body to 0.26 u (PO 2026-09-20) made the derived value 62 px and the entry
// redundant, so it came back out rather than sitting here agreeing with the
// default.
const MAX_SIZE_OVERRIDE: Partial<Record<string, number>> = {};

// Confirmed by measuring every existing simple prop's hand-authored maxSize
// against its body (GateWall 2.4 × 120 = 288, House 4 × 120 = 480, Tombstone
// 0.8 × 120 = 96) — the same px/unit convention the WARP cheat uses.
const PX_PER_UNIT = 120;

const propDefs = requireAll(require.context('../../../../../api/props', false, /\.json$/)) as unknown as PropDefJSON[];

// Keyed by full filename INCLUDING extension: this directory holds both an
// .svg and a .png for some stems (roundTree, stone), so a stem-only key would
// collide.
const spriteContext = require.context('../assets/resources', false, /\.(svg|png)$/);
const spriteFilesByName: { [filename: string]: string | { default: string } } = {};
spriteContext.keys().forEach((key: string) => {
    spriteFilesByName[key.replace(/^\.\//, '')] = spriteContext(key);
});

// A prop with no special behavior: the sprite is drawn at exactly the
// streamed size, aspect-corrected only when the body is a non-square
// rectangle (mirrors the old House class). `bodyAspect` lives on the
// concrete subclass as a STATIC field, not an instance field: initShape()
// runs inside the GameObject constructor's super() chain, before any of a
// subclass's own field initializers have run, so an instance field would
// still read undefined here (the same reason House used to read a
// module-level constant instead of `this`).
abstract class SimpleProp extends Resource {
    static bodyAspect: { width: number; height: number } | null = null;

    protected constructor(id: number, layer: Container, x: number, y: number,
                          size: number, rotation: number, svg: Texture) {
        super(id, layer, x, y, size, rotation, svg);
    }

    initShape(svg: Texture, x: number, y: number, size: number, rotation: number): Container {
        const sprite = createInjectedSVG(svg, x, y, size, rotation);
        const aspect = (this.constructor as typeof SimpleProp).bodyAspect;
        if (aspect !== null) {
            const max = Math.max(aspect.width, aspect.height);
            sprite.width = size * 2 * (aspect.width / max);
            sprite.height = size * 2 * (aspect.height / max);
        }
        return sprite;
    }
}

function bodyUnits(body: PropDefJSON['body']): { w: number; h: number; isRect: boolean } {
    const isRect = body.width !== undefined && body.height !== undefined;
    return isRect
        ? {w: body.width, h: body.height, isRect}
        : {w: body.radius * 2, h: body.radius * 2, isRect};
}

const defsByEntityType = new Map<string, PropDefJSON[]>();
for (const def of propDefs) {
    if (BESPOKE_ENTITY_TYPES.has(def.entityType)) {
        continue;
    }
    const group = defsByEntityType.get(def.entityType) ?? [];
    group.push(def);
    defsByEntityType.set(def.entityType, group);
}

export const genericPropClasses: Record<string, GameObjectClass> = {};

defsByEntityType.forEach((defs, entityType) => {
    // All defs sharing one entityType share one sprite — it's what the wire
    // entityType picks. Sized generously enough for the largest body among
    // them; aspect-corrected from the first rect-bodied def (today, no
    // entityType mixes a rect def with a differently-shaped one).
    const sprite = defs[0].sprite;
    const spriteFile = spriteFilesByName[sprite];
    if (spriteFile === undefined) {
        throw new Error(`Props.ts: entityType "${entityType}" names sprite "${sprite}", `
            + `not found in game-objects/assets/resources`);
    }

    let maxUnits = 0;
    let bodyAspect: { width: number; height: number } | null = null;
    for (const def of defs) {
        const units = bodyUnits(def.body);
        maxUnits = Math.max(maxUnits, units.w, units.h);
        if (units.isRect && bodyAspect === null) {
            bodyAspect = {width: units.w, height: units.h};
        }
    }
    const maxSize = MAX_SIZE_OVERRIDE[entityType] ?? Math.round(maxUnits * PX_PER_UNIT);

    class GeneratedProp extends SimpleProp {
        static svg: Texture;
        static bodyAspect = bodyAspect;

        // The 6th and 7th arguments are EntityManager's one constructor seam
        // (prop name, then the streamed `underfoot`); only the second is read
        // here. The layer is resolved in the super() ARGUMENT: `this` does
        // not exist yet.
        constructor(id: number, x: number, y: number, size: number, rotation: number,
                    _propName?: string, underfoot?: boolean) {
            super(id, propLayer(underfoot === true), x, y, size, rotation, GeneratedProp.svg);
        }
    }

    // noinspection JSIgnoredPromiseFromCall
    Preloading.registerGameObjectSVG(GeneratedProp, spriteFile, maxSize);
    genericPropClasses[entityType] = GeneratedProp;
});

// ---------------------------------------------------------------------------
// PropPlaceholder — the "missing art" stand-in for a prop
// (plan-prop-placeholders.md C2).
// ---------------------------------------------------------------------------

// Every definition, keyed by its name — which for a prop IS its identity:
// zone placements name it and the server refuses duplicates. This is the whole
// reason Resource.prop_name rides the wire: the wire says PropPlaceholder for
// every placeholder alike, and the name is what recovers WHICH one, and with it
// the body shape. The label needs no lookup at all — it is the name.
//
// Built over ALL defs, not just the placeholder ones: it costs nothing (there
// are six), and a def that stops being a placeholder must not silently drop out
// of a map whose whole job is to answer "which prop is this".
const propDefsByName = new Map<string, PropDefJSON>();
for (const def of propDefs) {
    propDefsByName.set(def.name, def);
}

/**
 * The definition a zone placement names, or undefined when this build has never
 * seen it. The map bakes every placed prop from this (MapProps).
 */
export function propDefinition(name: string): PropDefJSON | undefined {
    return propDefsByName.get(name);
}

/**
 * Whether a placement of `type` blocks movement — the client-side mirror of the
 * server's world.Prop.Blocks(), and the ONE place the default is applied here.
 *
 * ⭐ THE DEFAULT IS TRUE AT BOTH ENDS OF THE TRI-STATE, which is the bit worth
 * getting right: an absent placement value inherits the type, and an absent TYPE
 * value means blocking. A prop is solid unless somebody has said otherwise.
 *
 * ⚑ An unknown type answers true as well. Guessing "decorative" for a prop the
 * client cannot resolve would draw a walk-through marker over something the
 * server is very much colliding with, and that lie is the worse of the two.
 */
export function propBlocksMovement(type: string, placement?: boolean): boolean {
    if (placement !== undefined) { return placement; }
    const def = propDefsByName.get(type);
    return def === undefined || def.blocksMovement !== false;
}

// The loud, deliberately un-gamelike palette, shared with npcPlaceholder.svg so
// "unfinished" reads the same everywhere. The prop is SQUARED where the NPC is
// round, and outlined in red rather than in dark purple, so the two are told
// apart at a glance. [PLACEHOLDER]
const PLACEHOLDER_FILL = 0x5b2a86;
const PLACEHOLDER_FILL_ALPHA = 0.85;
const PLACEHOLDER_STROKE = 0xff3b30;
const PLACEHOLDER_LABEL = 0xffffff;
// Outline width as a fraction of the footprint's smaller half-extent, clamped
// so a tombstone-sized prop is not all border and a house is not hairlined.
const STROKE_FACTOR = 0.06;
const STROKE_MIN = 1.5;
const STROKE_MAX = 5;

/**
 * A prop authored with `"entityType": "PropPlaceholder"`: drawn procedurally,
 * at the authored footprint, with the prop's NAME auto-fit inside it.
 *
 * ⭐ Procedural and not a sprite, because one image cannot be a circle AND a
 * 4:3 house AND a 2:0.6 bench — and `bodyAspect` on the generic path is a
 * STATIC per-class field taken from the first rect def in the group, so a
 * second rect placeholder could never have got its own aspect (§4.1). Drawing
 * it means no art file, no `maxSize` rasterisation and no Preloading entry.
 *
 * ⚑ The shape is built in the CONSTRUCTOR BODY, not in initShape, and that is
 * forced rather than stylistic: initShape runs inside the GameObject
 * constructor's super() chain, before any subclass field initializer and
 * before the propName argument could be stored anywhere `this` can see. So
 * initShape returns an empty positioned container and the drawing is added to
 * it a moment later. (SimpleProp above hits the same wall and solves it with a
 * static field — which cannot work here, where every instance may be a
 * different definition.)
 */
export class PropPlaceholder extends Resource {
    constructor(id: number, x: number, y: number, size: number, rotation: number, propName: string,
                underfoot?: boolean) {
        // ⚑ The layer is resolved in the super() ARGUMENT, from the streamed
        // per-placement flag (D4): `this` does not exist yet. The placeholder
        // path honours `underfoot` like the generic one, because a prop with no
        // art yet is still walked across or around.
        super(id, propLayer(underfoot === true), x, y, size, rotation, null);

        // ⚑ The SHAPE needs the definition; the LABEL does not — the wire
        // carries the name itself. So a name this build cannot resolve (a prop
        // def added to the server since the last webpack build, or deleted from
        // under a running client) still draws a labelled square at the streamed
        // size rather than nothing. An invisible prop that nonetheless blocks
        // movement is the worse lie, and a labelled square says which prop it
        // is even when its body is unknown.
        const def = propDefsByName.get(propName);
        const footprint = propFootprint(def ? def.body : {}, size);
        this.shape.addChild(drawFootprint(footprint));

        const label = propName ? buildLabel(propName, footprint) : null;
        if (label !== null) {
            this.shape.addChild(label);
        }
    }

    /**
     * An empty container at the placement's position and angle; the drawing is
     * added by the constructor body (see the class comment).
     *
     * Everything lives inside this ONE rotated container, so the label turns
     * with the prop and therefore cannot leave the bounds it was fitted to
     * (§4.3). An axis-aligned label would read better on a steeply rotated
     * prop but is able to spill — the in-game pass decides, and swapping is a
     * one-line change here.
     */
    initShape(_svg: Texture, x: number, y: number, _size: number, rotation: number): Container {
        const container = new Container();
        container.position.set(x, y);
        container.rotation = rotation;
        return container;
    }
}

function drawFootprint(footprint: PropFootprint): Graphics {
    const width = Math.min(STROKE_MAX,
        Math.max(STROKE_MIN, Math.min(footprint.halfWidth, footprint.halfHeight) * STROKE_FACTOR));

    const g = new Graphics();
    if (footprint.isRect) {
        g.rect(-footprint.halfWidth, -footprint.halfHeight,
            footprint.halfWidth * 2, footprint.halfHeight * 2);
    } else {
        g.circle(0, 0, footprint.halfWidth);
    }
    return g
        .fill({color: PLACEHOLDER_FILL, alpha: PLACEHOLDER_FILL_ALPHA})
        .stroke({width, color: PLACEHOLDER_STROKE});
}

/**
 * The auto-fit name (D3), or null when it cannot be drawn legibly at this size.
 *
 * ⚑ Measured at the reference size and then RE-STYLED to the fitted one rather
 * than scaled: a prop is built once and never moves, so the crisper
 * re-rasterisation costs nothing, where `text.scale` would leave every label in
 * the world slightly soft.
 */
function buildLabel(name: string, footprint: PropFootprint): Text | null {
    const text = new Text({
        text: name,
        style: TextDisplay.style({
            fontSize: LABEL_REFERENCE_FONT_SIZE,
            fontWeight: '700',
            fill: PLACEHOLDER_LABEL,
            stroke: {color: '#2d1443', width: 3},
        }),
    });

    const fontSize = propLabelFontSize(footprint, text.width, text.height);
    if (fontSize === null) {
        text.destroy();
        return null;
    }

    text.style.fontSize = fontSize;
    // Stroke width is in px and does not follow fontSize, so a label shrunk to
    // the floor would otherwise be mostly outline.
    text.style.stroke = {color: '#2d1443', width: Math.max(1, fontSize / 10)};
    text.anchor.set(0.5, 0.5);
    text.position.set(0, 0);
    return text;
}
