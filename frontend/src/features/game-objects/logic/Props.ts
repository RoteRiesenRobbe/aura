/**
 * Generic, JSON-driven prop rendering (the collapse of the old per-prop
 * boilerplate: a hand-written Resources.ts class + a Graphics.ts entry per
 * simple prop, one for each of House/GateWall/Tombstone doing the exact same
 * thing). A "simple" prop — no behavior beyond drawing its sprite at its
 * authored size/aspect — needs none of that any more: `api/props/*.json`
 * names its own sprite file, and this module discovers every such prop at
 * build time and derives a render class for it.
 *
 * Props with real behavior (Tree/RoundTree, Mineral/Stone — the resource-spot
 * decal, the non-random mineral rotation) keep their bespoke classes in
 * Resources.ts, excluded here by entityType. A future prop needing its own
 * behavior follows the same path: write a class, add its entityType to
 * BESPOKE_ENTITY_TYPES below, give it its own `gameObjectClasses` line.
 *
 * PropPlaceholder is the one bespoke class that lives HERE rather than in
 * Resources.ts (plan-prop-placeholders.md C2), because it is the only render
 * class that needs the prop DEFINITIONS this module already compiles in.
 */
import {Container, Graphics, Text, Texture, ViewContainer} from 'pixi.js';
import * as Preloading from '../../core/logic/Preloading';
import {createInjectedSVG} from '../../core/logic/InjectedSVG';
import {requireAll} from '../../common/logic/Utils';
import {GameSetupEvent} from '../../core/logic/Events';
import {IGame} from '../../core/logic/IGame';
import {Resource} from './Resources';
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

interface PropDefJSON {
    name: string;
    entityType: string;
    sprite: string;
    body: { radius?: number; width?: number; height?: number };
}

type GameObjectClass = new (...args: any[]) => unknown;

// Tree/RoundTree and Mineral/Stone have real behavior (resource-spot decal,
// authored-not-random rotation) and keep their hand-written Resources.ts
// classes — never routed through the generic path.
const BESPOKE_ENTITY_TYPES = new Set(['RoundTree', 'Stone', 'PropPlaceholder']);

// Escape hatch for a future prop whose SVG needs extra rasterisation
// crispness beyond the derived (body units × PX_PER_UNIT). Empty today.
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

    protected constructor(id: number, x: number, y: number, size: number, rotation: number, svg: Texture) {
        super(id, Game.layers.resources.trees, x, y, size, rotation, svg);
        this.visibleOnMinimap = false;
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

    createMinimapIcon(): ViewContainer {
        throw new Error('Method not implemented.');
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

        constructor(id: number, x: number, y: number, size: number, rotation: number) {
            super(id, x, y, size, rotation, GeneratedProp.svg);
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
    constructor(id: number, x: number, y: number, size: number, rotation: number, propName: string) {
        super(id, Game.layers.resources.trees, x, y, size, rotation, null);
        this.visibleOnMinimap = false;

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

    createMinimapIcon(): ViewContainer {
        throw new Error('Method not implemented.');
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
