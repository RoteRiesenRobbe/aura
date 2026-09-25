import {htmlModuleToString, htmlToElement, isNumber} from '../../common/logic/Utils';
import {BasicConfig as Constants} from '../../../client-data/BasicConfig';
import {PreloadingProgressedEvent, PreloadingStartedEvent, StartScreenDomReadyEvent} from './Events';
import {Assets, Texture} from 'pixi.js';
import {ISvgContainer} from "./ISvgContainer";
import {packIconTexture, packIconsReady} from '../../../client-data/icons/PackIconFiles';

/**
 * A portrait source that may be OVERRIDDEN by an icon-pack portrait: `file` is
 * the committed art and the fallback, `packIcon` names a pack-manifest entry
 * (Graphics.ts `packIcon`). Without the pack on this machine only `file` draws.
 */
export interface PortraitSource {
    file: string | { default: string; };
    packIcon?: string;
}


const promises = [];
let numberOfPromises = 0;
let loadedPromises = 0;
let executeResolve: (value: void) => void;

export function executePreload() {
    return new Promise<void>(function (resolve) {
        executeResolve = resolve;
        PreloadingStartedEvent.trigger();
    });
}

StartScreenDomReadyEvent.subscribe(() => {
    let loadCycle = 1;
    /*
     * As preloads have the chance to register new preloads themself, all preloads are loaded recursively.
     */
    (function waitForPreloads() {
        return new Promise<void>(function (resolve) {
            loadCycle++;
            if (promises.length > 0) {
                let promisesToResolve = promises.slice();
                promises.length = 0;
                return Promise.all(promisesToResolve).then(waitForPreloads).then(resolve);
            }
            resolve();
        });
    })().then(executeResolve);
});

export function registerPreload(preloadingPromise: Promise<any>) {
    preloadingPromise.then(function (data) {
        loadedPromises++;
        PreloadingProgressedEvent.trigger(loadedPromises / numberOfPromises);

        return data;
    });
    // add promise to list of promises executed before setup()
    promises.push(preloadingPromise);
    numberOfPromises++;

    return preloadingPromise;
}

export function registerGameObjectSVG(
    gameObjectClass: ISvgContainer,
    svgPath: string | { default: string; } | PortraitSource,
    maxSize: number,
) {
    const portrait = isPortraitSource(svgPath) ? svgPath : {file: svgPath};
    const src = htmlModuleToString(portrait.file);
    let sourceScale = Constants.GRAPHICS_RESOLUTION * (2 * Constants.GRAPHIC_BASE_SIZE);
    if (isNumber(maxSize)) {
        // Scale sourceScale according to the maximum required graphic size
        sourceScale = Constants.GRAPHICS_RESOLUTION * (2 * maxSize);
    }
    /*
     * `data` is spread verbatim into Pixi's ImageSource options
     * (assets/loader/parsers/textures/loadTextures.mjs). For an SVG the
     * width/height pair is the RASTERISATION size — the whole point of
     * passing it. For a raster it OVERRIDES the file's real pixel
     * dimensions instead, so a 256×256 PNG announced as `sourceScale`
     * square renders as a top-left crop scaled up. Vectors only.
     *
     * Painted art therefore ships as PNG (see Graphics.ts `farmer`) and
     * `maxSize` stops meaning anything for it: the texture is whatever the
     * file holds, and only the entity's `size` scales the sprite.
     *
     * ⛔ The bake is SQUARE, so a sprite whose viewBox is NOT square must
     * author `preserveAspectRatio="none"` on its root `<svg>` — without it
     * the two engines disagree and only one of them looks right. Chromium
     * re-renders the vector straight into the square destination rect
     * (stretched, filling it); Firefox honours the default `xMidYMid meet`
     * and LETTERBOXES the art inside that square. The stretch is the one this
     * pipeline wants: Props.ts squashes the square sprite back to the body's
     * aspect afterwards, undoing it exactly. Letterboxed art gets squashed a
     * second time instead — measured on `bridge.svg` (5:2), which came out
     * 2.5× too flat in Firefox while Chrome looked correct.
     */
    const isVector = src.startsWith('data:image/svg') || /\.svg(\?|$)/i.test(src);
    const fileTexture = Assets.load(isVector
        ? {src, data: {width: sourceScale, height: sourceScale}}
        : {src},
    );
    // The pack portrait wins when this build loaded it; the file is always
    // loaded too, so a pack that fails to land costs nothing but the swap.
    // packIconsReady never rejects, and packIconTexture answers null rather
    // than throwing, so the file path stays the one that can fail here.
    return registerPreload(
        Promise.all([fileTexture, packIconsReady]).then(([texture]: [Texture, void]) => {
            gameObjectClass.svg = (portrait.packIcon && packIconTexture(portrait.packIcon)) || texture;
        }),
    );
}

function isPortraitSource(source: string | { default: string; } | PortraitSource): source is PortraitSource {
    return typeof source === 'object' && source !== null && 'file' in source;
}

export function renderPartial(
    html: (string | { default: string }),
    onDomReady = () => {},
) {
    document.body.appendChild(htmlToElement(htmlModuleToString(html)));
    onDomReady();
}
