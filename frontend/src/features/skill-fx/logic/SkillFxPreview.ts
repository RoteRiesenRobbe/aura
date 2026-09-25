/**
 * The PURE half of the dev-only live VFX preview (plan-skill-vfx.md §12f.7).
 *
 * `src/fx-preview.ts` is a second webpack entry, dev only, that the content
 * editor iframes: it feeds the REAL `SkillFx` renderer from two stub actors, so
 * what an author sees is the code and cannot drift from it. Everything that can
 * be decided without Pixi is decided here and pinned in SkillFxPreview.test.ts:
 * the synthetic skill it registers, how long one loop lasts, how the scene is
 * scaled into the canvas, which origins may drive it, what the gallery shows,
 * and which messages are accepted at all.
 *
 * ⚑ The synthetic definition is built from four facts the editor already knows
 * (the layer, the category, the palette tag, the reach), never from the raw
 * file: the planner reads `radius`, the palette reads `damage.tags`, nothing
 * else. The colour is NEVER forged as a `tint`: a layer with a resolved body
 * takes no palette tint (§12f.2), so a forged one would recolour a body the
 * game leaves as drawn.
 */
import {CATEGORY_MAP, SkillCategory, SkillDefinition, VisualDef, VisualLayer} from '../../../client-data/Skills';
import {meter2px} from '../../../client-data/BasicConfig';
import {VISUAL_KINDS, VisualKind} from './SkillFxKinds';
import {eventLifetimeMs} from './SkillFxStress';

/** The preview's skill id, far above anything the server hands out. */
export const PREVIEW_SKILL_ID = 990_000;

/** The message type the editor sends, and the one the preview answers with. */
export const PREVIEW_MESSAGE_TYPE = 'aura-fx-preview';
export const PREVIEW_READY_TYPE = 'aura-fx-preview-ready';

/** The gap between two loops of one layer. [PLACEHOLDER] */
export const PREVIEW_GAP_MS = 600;

/** The stub actors' radius in px, the stress driver's (a player's). */
export const PREVIEW_STUB_RADIUS_PX = 26;

/** Caster-to-victim distance bounds, in world units. [PLACEHOLDER] */
export const PREVIEW_MIN_REACH_UNITS = 1;
export const PREVIEW_MAX_REACH_UNITS = 4;

/** Room kept around the scene, past the reach, in world px: a stub and a margin. */
const SCENE_PAD_PX = PREVIEW_STUB_RADIUS_PX + 12;

/** The four moments a layer can play on (api/skill-vocabulary.json `visualTriggers`). */
const TRIGGERS = ['ambient', 'fired', 'hit', 'applied'];

/** What the editor sends, once parsed: the protocol of §12f.7.2. */
export interface PreviewMessage {
    visual: VisualDef;
    layerIndex: number;
    /** the file's category (`active_aura`) or the client's (`aura`); null on a draft */
    category: string | null;
    /** the palette tag (`fire`, `frost`...), or null for an untyped skill */
    paletteTag: string | null;
    /** the skill's widest effect radius, in world units */
    reachUnits: number;
}

/**
 * The one-layer synthetic skill the preview registers under `id`.
 * `visual.layers[layerIndex]` becomes the ONLY layer, so a three-layer skill
 * gets three small previews rather than one busy one.
 */
export function buildPreviewDefinition(msg: PreviewMessage, id = PREVIEW_SKILL_ID): SkillDefinition {
    const layer = msg.visual.layers[msg.layerIndex];
    const category: SkillCategory = CATEGORY_MAP[msg.category ?? '']
        ?? (isClientCategory(msg.category) ? msg.category : 'aura');
    return {
        id,
        name: `FxPreview${id}`,
        displayName: 'VFX preview',
        category,
        visual: {layers: [layer]},
        effects: [{
            type: 'damage_aura',
            radius: msg.reachUnits,
            damage: msg.paletteTag ? {tags: [msg.paletteTag]} : undefined,
        }],
    } as unknown as SkillDefinition;
}

function isClientCategory(category: string | null): category is SkillCategory {
    return category === 'aura' || category === 'passive' || category === 'cooldown';
}

/** The caster-to-victim distance in world px: the reach, clamped to [1 u, 4 u]. */
export function previewDistancePx(reachUnits: number): number {
    const units = Number.isFinite(reachUnits) ? reachUnits : PREVIEW_MIN_REACH_UNITS;
    return meter2px(Math.min(PREVIEW_MAX_REACH_UNITS, Math.max(PREVIEW_MIN_REACH_UNITS, units)));
}

/**
 * One loop of `layer`, in ms: the layer's own life as the C4 helper prices it
 * (a bolt's life is its flight, hence the distance), plus the engine's hit
 * mark when the moment is `hit`, plus the gap. 0 for `ambient`, which is state
 * and does not loop.
 */
export function previewCycleMs(layer: VisualLayer, distPx: number): number {
    if (layer.on === 'ambient') {
        return 0;
    }
    return eventLifetimeMs([layer], distPx, layer.on === 'hit') + PREVIEW_GAP_MS;
}

/**
 * The scale the fx container is drawn at so the whole scene fits the canvas.
 * The scene is a square around the CASTER, reach + a pad on every side: a wave
 * or an orbit spreads to the reach in every direction, and the victim sits at
 * the reach on the right. Kinds draw in world px, so scaling the container is
 * exact. 1 for a degenerate input.
 */
export function fitScale(reachPx: number, canvasW: number, canvasH: number): number {
    if (!(reachPx > 0) || !(canvasW > 0) || !(canvasH > 0)) {
        return 1;
    }
    return Math.min(canvasW, canvasH) / (2 * (reachPx + SCENE_PAD_PX));
}

/**
 * Only a dev origin may drive the preview: `http://localhost` or
 * `http://127.0.0.1`, any port. Dev-only, and still no reason to accept more.
 */
export function isTrustedOrigin(origin: string): boolean {
    return /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin);
}

/**
 * The newcomer's legend (`?gallery`): one canonical layer per kind, the
 * manual's own examples, every one on its placeholder (no body) so what shows
 * is the kind itself. The table is keyed by kind, and the test pins that it
 * names every kind in VISUAL_KINDS exactly once: an eighth kind reddens it.
 */
export const GALLERY_LAYERS: Record<VisualKind, VisualLayer> = {
    'strike': {kind: 'strike', on: 'hit', curve: 'thrust'},
    'projectile': {kind: 'projectile', on: 'hit'},
    'beam': {kind: 'beam', on: 'hit', curve: 'extend'},
    'cast-pose': {kind: 'cast-pose', on: 'fired'},
    'orbit': {kind: 'orbit', on: 'fired'},
    'emitter': {kind: 'emitter', on: 'fired', motion: 'swirl'},
    'wave': {kind: 'wave', on: 'fired'},
};

/** The gallery's shared palette tag and reach. [PLACEHOLDER] */
export const GALLERY_PALETTE_TAG = 'fire';
export const GALLERY_REACH_UNITS = 1;

/**
 * An editor message, or null for anything malformed: a wrong `type` (the
 * preview's OWN ready message included, which a top-level page posts to
 * itself), no layers, an index out of range, a layer whose kind or moment the
 * renderer does not know, a reach that is not a number.
 */
export function parsePreviewMessage(data: unknown): PreviewMessage | null {
    if (!isObject(data) || data.type !== PREVIEW_MESSAGE_TYPE) {
        return null;
    }
    const visual = data.visual;
    if (!isObject(visual) || !Array.isArray(visual.layers)) {
        return null;
    }
    const layers = visual.layers as unknown[];
    const layerIndex = data.layerIndex;
    if (typeof layerIndex !== 'number' || !Number.isInteger(layerIndex)
        || layerIndex < 0 || layerIndex >= layers.length) {
        return null;
    }
    const layer = layers[layerIndex];
    if (!isObject(layer)
        || !(VISUAL_KINDS as readonly unknown[]).includes(layer.kind)
        || !TRIGGERS.includes(layer.on as string)) {
        return null;
    }
    const reachUnits = data.reachUnits;
    if (typeof reachUnits !== 'number' || !Number.isFinite(reachUnits)) {
        return null;
    }
    const category = typeof data.category === 'string' ? data.category : null;
    const paletteTag = typeof data.paletteTag === 'string' && data.paletteTag !== ''
        ? data.paletteTag : null;
    return {
        visual: {layers: layers as VisualLayer[]},
        layerIndex, category, paletteTag, reachUnits,
    };
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
