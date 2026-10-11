import _extend = require('lodash/assignIn');
import {TextStyleOptions} from 'pixi.js/lib/scene/text/TextStyle';
import {registerPreload} from '../features/core/logic/Preloading';

// The one face for all text, DOM and canvas alike (plan-ui-font.md §6). The
// DOM half is `body` in userInterface.less.
export const UI_FONT_FAMILY = 'Inter';

export function defaultStyle(): TextStyleOptions {
    return {
        fontFamily: [UI_FONT_FAMILY, 'Arial', 'sans-serif'],
        fontSize: 30,
        align: 'center',
    };
}

export function style(additionalStyle: TextStyleOptions): TextStyleOptions {
    return _extend(defaultStyle(), additionalStyle);
}

// PixiJS bakes a Text's glyphs when it is created and never re-renders on a
// late font, so a nameplate made before the face arrives stays in the fallback
// face for good (plan-ui-font.md F2). Hold boot until the weights the canvas
// draws are resident. A failed load only costs the fallback face, so it never
// rejects. jsdom has no `document.fonts`.
// noinspection JSIgnoredPromiseFromCall
registerPreload(Promise.all(
    ['400', '700'].map(weight =>
        document.fonts?.load(`${weight} 30px "${UI_FONT_FAMILY}"`).catch(() => [])),
));
