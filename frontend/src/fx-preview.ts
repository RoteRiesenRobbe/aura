/**
 * The live skill-VFX preview (plan-skill-vfx.md §12f.7): a DEV-ONLY second
 * webpack entry (webpack.dev.js) that the content editor iframes.
 *
 * It draws with the REAL `SkillFx` renderer, fed from two stub actors and no
 * server, so what an author sees is the code and cannot drift from it. It
 * imports Pixi, the manager, the bodies loader and nothing else: no socket, no
 * HUD, no settings UI, no sound.
 *
 * Two modes of one page:
 * - `fx-preview.html`: waits for the editor's `aura-fx-preview` message and
 *   loops that ONE layer between a caster (left) and a victim (right).
 * - `fx-preview.html?gallery`: the seven kinds side by side from
 *   `GALLERY_LAYERS`, each labelled, each on its own loop (the newcomer's legend).
 *
 * `window.__fxPreview` is the harness surface (.claude/skills/verify/skill-fx-preview.mjs).
 *
 * ⚑ Skills.ts fetches the real catalog at import; here that resolves to
 * `<this origin>/skills`, which the dev server 404s, so the catalog stays empty
 * apart from what this page registers. Were the page ever served where
 * `/skills` answers, the fetch's `catalog.clear()` would drop a registered
 * definition: each registration is therefore spawned from synchronously, and
 * `SkillFx` caches the look on that first event.
 */
import {Application, Container, Graphics} from 'pixi.js';
import onChange from 'on-change';
import {PrerenderEvent} from './features/core/logic/Events';
import {GameSettings} from './features/game-settings/logic/GameSettings';
import type {GameObject} from './features/game-objects/logic/_GameObject';
import {AuraApi} from './features/backend/logic/AuraApi';
import type {SkillEventData} from './features/backend/logic/SkillEventNumbers';
import {registerSkillDefinition, VisualLayer} from './client-data/Skills';
import * as SkillFx from './features/skill-fx/logic/SkillFx';
import {loadSkillFxBodies} from './features/skill-fx/logic/SkillFxBodyFiles';
import {VISUAL_KINDS} from './features/skill-fx/logic/SkillFxKinds';
import {
    buildPreviewDefinition,
    fitScale,
    GALLERY_LAYERS,
    GALLERY_PALETTE_TAG,
    GALLERY_REACH_UNITS,
    isTrustedOrigin,
    parsePreviewMessage,
    PREVIEW_READY_TYPE,
    PREVIEW_SKILL_ID,
    PREVIEW_STUB_RADIUS_PX,
    previewCycleMs,
    previewDistancePx,
    PreviewMessage,
} from './features/skill-fx/logic/SkillFxPreview';

/** Stub entity ids, far above anything the server hands out; slot N owns base + 2N, +1. */
const STUB_ID_BASE = 980_000;
/** The gallery is ONE row of seven slots that shares the frame's width: a slot is width / 7. */
const GALLERY_SLOTS = VISUAL_KINDS.length;
/** The label strip under the scene, in screen px. */
const LABEL_PX = 18;

interface Stub {
    id: number;
    shape: { position: { x: number, y: number }, destroyed: boolean, parent: object };
    size: number;
}

/** One caster/victim pair looping one layer. */
interface Slot {
    skillId: number;
    layer: VisualLayer | null;
    distPx: number;
    caster: Stub;
    victim: Stub;
}

const mode: 'gallery' | 'message' = new URLSearchParams(window.location.search).has('gallery')
    ? 'gallery' : 'message';

const stubsById = new Map<number, Stub>();
const timers: number[] = [];
let scene: Container = null;
let rings: Graphics = null;
let label: HTMLElement = null;

function makeStub(id: number): Stub {
    // ⚑ `parent` must be a non-null object: `anchorFor`'s liveness test is
    // `shape.parent !== null`, so a null one is born despawned (SkillFxStress).
    const stub: Stub = {id, shape: {position: {x: 0, y: 0}, destroyed: false, parent: {}}, size: PREVIEW_STUB_RADIUS_PX};
    stubsById.set(id, stub);
    return stub;
}

function asGameObject(stub: Stub): GameObject {
    return stub as unknown as GameObject;
}

function resolve(id: number): GameObject | undefined {
    const stub = stubsById.get(id);
    return stub ? asGameObject(stub) : undefined;
}

/** One moment of the slot's layer, fed through the manager's real entry points. */
function play(slot: Slot): void {
    const on = slot.layer.on;
    if (on === 'ambient') {
        SkillFx.setAmbient(asGameObject(slot.caster), slot.skillId, true);
        return;
    }
    const event: SkillEventData = {
        source: slot.caster.id,
        // A FIRED event names no victim on the wire.
        victim: on === 'fired' ? 0 : slot.victim.id,
        skillId: slot.skillId,
        amount: 1,
        kind: AuraApi.HitKind.Damage,
        fired: on === 'fired',
        phase: on === 'applied' ? AuraApi.HitPhase.Applied : AuraApi.HitPhase.Direct,
    };
    SkillFx.onSnapshot([event], resolve);
}

/** Play now, then again every cycle; an ambient layer plays once and holds. */
function loop(slot: Slot): void {
    play(slot);
    const cycle = previewCycleMs(slot.layer, slot.distPx);
    if (cycle > 0) {
        timers.push(window.setTimeout(() => loop(slot), cycle));
    }
}

function stopLoops(): void {
    timers.forEach(timer => window.clearTimeout(timer));
    timers.length = 0;
}

/** Place a slot's stubs in world px, caster at (x, y), and ring them. */
function place(slot: Slot, x: number, y: number): void {
    slot.caster.shape.position.x = x;
    slot.caster.shape.position.y = y;
    slot.victim.shape.position.x = x + slot.distPx;
    slot.victim.shape.position.y = y;
    for (const stub of [slot.caster, slot.victim]) {
        rings.circle(stub.shape.position.x, stub.shape.position.y, stub.size)
            .stroke({width: 1.5, color: 0x8b949e, alpha: 0.6});
    }
}

// --- message mode -----------------------------------------------------------

let single: Slot = null;
let app: Application = null;

function layoutSingle(): void {
    if (single === null) {
        return;
    }
    const w = app.screen.width;
    const h = app.screen.height - LABEL_PX;
    const scale = fitScale(single.distPx, w, h);
    scene.scale.set(scale);
    // The caster at the centre: a wave or an orbit spreads to the reach in
    // every direction, the victim sits at the reach on the right.
    scene.position.set(w / 2, h / 2);
    rings.clear();
    place(single, 0, 0);
}

/**
 * The page says "ready" BEFORE the renderer and the bodies are up (boot), so
 * the editor's 3 s handshake never races a slow WebGL init; a layer that
 * arrives in that window is held here and applied once booted. Only the
 * newest one matters, an older draft would be overdrawn at once anyway.
 */
let booted = false;
let pendingMessage: PreviewMessage | null = null;

function onMessage(event: MessageEvent): void {
    if (!isTrustedOrigin(event.origin)) {
        return;
    }
    const msg: PreviewMessage | null = parsePreviewMessage(event.data);
    if (msg === null) {
        return;
    }
    if (!booted) {
        pendingMessage = msg;
        return;
    }
    applyMessage(msg);
}

function applyMessage(msg: PreviewMessage): void {
    stopLoops();
    SkillFx.reset();
    SkillFx.forgetVisual(PREVIEW_SKILL_ID);
    registerSkillDefinition(buildPreviewDefinition(msg));
    const layer = msg.visual.layers[msg.layerIndex];
    if (single === null) {
        single = {
            skillId: PREVIEW_SKILL_ID, layer, distPx: 0,
            caster: makeStub(STUB_ID_BASE), victim: makeStub(STUB_ID_BASE + 1),
        };
    }
    single.layer = layer;
    single.distPx = previewDistancePx(msg.reachUnits);
    layoutSingle();
    label.textContent = `${layer.kind}, on ${layer.on}`;
    loop(single);
}

// --- gallery mode -----------------------------------------------------------

const gallerySlots: Slot[] = [];
const galleryCells: HTMLSpanElement[] = [];

/**
 * The gallery fits the FRAME: seven slots across whatever width the editor
 * gives the iframe (the PO's 100 % zoom cut the wave off at a fixed 1400 px),
 * re-laid on every resize. The label strip sits under the scene.
 */
function layoutGallery(): void {
    const slotW = app.screen.width / GALLERY_SLOTS;
    const slotH = Math.max(40, app.screen.height - LABEL_PX);
    const distPx = previewDistancePx(GALLERY_REACH_UNITS);
    const scale = fitScale(distPx, slotW, slotH);
    scene.scale.set(scale);
    scene.position.set(0, 0);
    rings.clear();
    gallerySlots.forEach((slot, index) => {
        // The caster at the slot's centre, in world px (the scene is scaled).
        place(slot, (index + 0.5) * slotW / scale, slotH / 2 / scale);
    });
    for (const cell of galleryCells) {
        cell.style.width = `${slotW}px`;
    }
    label.style.top = `${slotH}px`;
    label.style.bottom = 'auto';
    label.style.padding = '0';
}

function startGallery(): void {
    const distPx = previewDistancePx(GALLERY_REACH_UNITS);
    label.textContent = '';
    VISUAL_KINDS.forEach((kind, index) => {
        const layer = GALLERY_LAYERS[kind];
        const skillId = PREVIEW_SKILL_ID + 1 + index;
        registerSkillDefinition(buildPreviewDefinition({
            visual: {layers: [layer]}, layerIndex: 0,
            category: 'active_aura', paletteTag: GALLERY_PALETTE_TAG, reachUnits: GALLERY_REACH_UNITS,
        }, skillId));
        const slot: Slot = {
            skillId, layer, distPx,
            caster: makeStub(STUB_ID_BASE + index * 2),
            victim: makeStub(STUB_ID_BASE + index * 2 + 1),
        };
        gallerySlots.push(slot);
        const cell = document.createElement('span');
        cell.textContent = `${kind} (${layer.on})`;
        label.appendChild(cell);
        galleryCells.push(cell);
    });
    layoutGallery();
    app.renderer.on('resize', layoutGallery);
    gallerySlots.forEach(loop);
}

// --- boot -------------------------------------------------------------------

async function boot(): Promise<void> {
    label = document.getElementById('fx-label');
    // The preview shows what the author AUTHORED, not the viewer's slider.
    // Written on the on-change TARGET, so it neither fires a settings event nor
    // persists into this origin's stored settings, which the dev game on the
    // same origin reads.
    onChange.target(GameSettings.get()).vfx.density = 'full';

    const gallery = mode === 'gallery';
    // In BOTH modes, and FIRST: the editor swaps any frame, the gallery's
    // included, for its "dev server down" note unless this arrives within 3 s
    // of the iframe being added, and a wide gallery canvas plus the bodies can
    // take longer than that under load. It is matched by `event.source`, so it
    // is posted from this page's own window. targetOrigin '*' is fine: the
    // message carries nothing but its type. A layer posted back before the
    // renderer is up waits in pendingMessage.
    if (!gallery) {
        window.addEventListener('message', onMessage);
    }
    window.parent.postMessage({type: PREVIEW_READY_TYPE}, '*');

    app = new Application();
    await app.init({
        background: 0x101418,
        antialias: true,
        // Both modes fill the frame the editor gives them; the gallery re-lays
        // its seven slots on resize (layoutGallery).
        width: 480, height: 240, resizeTo: window,
    });
    document.getElementById('fx-root').appendChild(app.canvas);

    scene = new Container();
    rings = new Graphics();
    const fxLayer = new Container();
    scene.addChild(rings, fxLayer);
    app.stage.addChild(scene);
    SkillFx.setup(fxLayer);
    // The game triggers PrerenderEvent with the ticker's deltaMS (Game.ts); so does this.
    app.ticker.add(ticker => PrerenderEvent.trigger(ticker.deltaMS));

    await loadSkillFxBodies();

    if (gallery) {
        startGallery();
    } else {
        app.renderer.on('resize', layoutSingle);
        label.textContent = 'waiting for a layer';
    }
    booted = true;
    if (pendingMessage !== null) {
        const msg = pendingMessage;
        pendingMessage = null;
        applyMessage(msg);
    }
    (window as unknown as { __fxPreview: object }).__fxPreview = {
        counters: () => SkillFx.counters(),
        mode,
        ready: true,
    };
}

boot();
