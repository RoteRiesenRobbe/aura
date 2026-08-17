import {htmlModuleToString, htmlToElement, isNumber} from '../../common/logic/Utils';
import {BasicConfig as Constants} from '../../../client-data/BasicConfig';
import {PreloadingProgressedEvent, PreloadingStartedEvent, StartScreenDomReadyEvent} from './Events';
import {Assets, Texture} from 'pixi.js';
import {ISvgContainer} from "./ISvgContainer";


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
    svgPath: string | { default: string; },
    maxSize: number,
) {
    const src = htmlModuleToString(svgPath);
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
     */
    const isVector = src.startsWith('data:image/svg') || /\.svg(\?|$)/i.test(src);
    return registerPreload(
        Assets.load(isVector
            ? {src, data: {width: sourceScale, height: sourceScale}}
            : {src},
        ).then((texture: Texture) => {
            gameObjectClass.svg = texture;
        }),
    );
}

export function renderPartial(
    html: (string | { default: string }),
    onDomReady = () => {},
) {
    document.body.appendChild(htmlToElement(htmlModuleToString(html)));
    onDomReady();
}
