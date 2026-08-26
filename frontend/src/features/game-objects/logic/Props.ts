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
 */
import {Container, Texture, ViewContainer} from 'pixi.js';
import * as Preloading from '../../core/logic/Preloading';
import {createInjectedSVG} from '../../core/logic/InjectedSVG';
import {requireAll} from '../../common/logic/Utils';
import {GameSetupEvent} from '../../core/logic/Events';
import {IGame} from '../../core/logic/IGame';
import {Resource} from './Resources';

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
const BESPOKE_ENTITY_TYPES = new Set(['RoundTree', 'Stone']);

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
