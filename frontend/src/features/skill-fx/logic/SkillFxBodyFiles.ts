/**
 * Where skill VFX bodies come from (plan-skill-vfx.md C3a, §12f.4 D).
 *
 * The half of {@link SkillFxBodies} that cannot be unit-tested: it reaches the
 * asset set through webpack's `require.context` and the GPU through `Assets`.
 * It is kept as thin as that implies - a name table, a loader, and the two
 * calls that hand both to the pure module - and it is imported for its SIDE
 * EFFECT by Game.ts and by nothing else. The RegionPaint.ts precedent, which
 * discovers its own PNG folder the same way.
 *
 * ⚑ Nothing may import this from inside the vitest graph: vitest is not
 * webpack, and `require.context` is a compile-time construct with no runtime
 * behind it. That is the whole reason the split exists.
 *
 * ⚑ THE FOLDER IS THE SOURCE (§12f.2). `api/skill-fx/bodies.json` is Go's copy
 * of this same list for the content validator, and a Go pin fails when the two
 * drift; the client never reads it. Drop a PNG in the folder and a skill file
 * can name it.
 *
 * ⛔ PNG only, never SVG: `webpack.common.js` inlines every `.svg` as a base64
 * data URI into the JS bundle, while rasters go through `type: 'asset'`.
 */
import {Assets, Texture} from 'pixi.js';
import {registerPreload} from '../../core/logic/Preloading';
import {bodyNameOf, declareBodies, setBodyTexture} from './SkillFxBodies';

const filesContext = require.context('../assets/bodies', false, /\.png$/);

const FILES: { [name: string]: string } = {};
filesContext.keys().forEach((key: string) => {
    const asset = filesContext(key) as string | { default: string };
    FILES[bodyNameOf(key)] = typeof asset === 'string' ? asset : asset.default;
});

const NAMES = Object.keys(FILES);
declareBodies(NAMES);

// Through Preloading, so a body is never missing from the first fight of a
// session (the header of SkillFxBodies says why that is right here and wrong
// for RegionPaint's per-zone tiles).
//
// ⚑ The `.catch` is load-bearing, not tidiness: Preloading waits on a
// `Promise.all`, so ONE rejected texture would hang the start screen forever.
// A body that fails to decode simply never lands, and its layers draw their
// placeholder - the same degrade path an unknown body name takes.
NAMES.forEach((name) => {
    registerPreload(
        Assets.load(FILES[name])
            .then((texture: Texture) => setBodyTexture(name, texture))
            .catch((error: unknown) => {
                console.warn(`[skill-fx] body "${name}" failed to load `
                    + `- drawing its placeholder instead.`, error);
            }),
    );
});
