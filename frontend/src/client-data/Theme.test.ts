import {describe, expect, it} from 'vitest';
import {readFileSync} from 'fs';

import {
    BRAND,
    FOCUS_COLOR_CSS,
    LAND_COLOR,
    LEVEL_UP_GOLD,
    OVERHEAD_BAR_SHIELD_FILL,
    cssHex,
} from './Theme';

// Code-health C6 (D3): the cross-language color pin. variables.less is the
// LESS half of the theme tokens and cannot import Theme.ts, so it is a mirror
// by construction; this suite is what keeps it honest, the
// TestFlightViewportScale_MatchesTheClient mechanism pointed at LESS instead
// of Go. Only the tokens that provably live in BOTH languages are pinned;
// LESS-only tokens (@gold-flash, the @panel-* family, the z scale) have no TS
// twin and deliberately no pin.

// vitest runs with cwd = frontend/.
const VARIABLES_PATH = 'src/features/user-interface/assets/variables.less';
const less = readFileSync(VARIABLES_PATH, 'utf-8');

// The definition line of one LESS variable, e.g. `@brand: #e37313;` → its
// value text. Asserting the match EXISTS is half the pin: a renamed variable
// must fail loudly here, never pass zero comparisons (the flight-pin lesson).
function lessValue(name: string): string {
    const match = less.match(new RegExp(`^@${name}:\\s*([^;]+);`, 'm'));
    expect(match,
        `@${name} not found in ${VARIABLES_PATH} — renamed, deleted, or moved? ` +
        'The TS twin lives in client-data/Theme.ts; move BOTH or fix the name.'
    ).not.toBeNull();
    return match![1].trim();
}

function rgbTriple(color: number): string {
    const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
    return `rgb(${r}, ${g}, ${b})`;
}

function rgbaOf(fill: {color: number, alpha: number}): string {
    const r = (fill.color >> 16) & 0xff, g = (fill.color >> 8) & 0xff, b = fill.color & 0xff;
    return `rgba(${r}, ${g}, ${b}, ${fill.alpha})`;
}

describe('Theme ↔ variables.less pins (C6)', () => {
    it('pins @brand to Theme.BRAND', () => {
        expect(lessValue('brand').toLowerCase()).toBe(cssHex(BRAND));
    });

    it('pins @gold-levelup to Theme.LEVEL_UP_GOLD', () => {
        expect(lessValue('gold-levelup').toLowerCase()).toBe(cssHex(LEVEL_UP_GOLD));
    });

    it('pins @focus-color to Theme.FOCUS_COLOR_CSS (the keyword, not a hex)', () => {
        expect(lessValue('focus-color')).toBe(FOCUS_COLOR_CSS);
    });

    it('pins @land-color to Theme.LAND_COLOR', () => {
        expect(lessValue('land-color')).toBe(rgbTriple(LAND_COLOR));
    });

    it('pins @shield-fill to Theme.OVERHEAD_BAR_SHIELD_FILL, alpha included', () => {
        expect(lessValue('shield-fill')).toBe(rgbaOf(OVERHEAD_BAR_SHIELD_FILL));
    });
});

describe('cssHex', () => {
    it('renders the padded lowercase hex form Pixi and CSS both accept', () => {
        expect(cssHex(0xE37313)).toBe('#e37313');
        expect(cssHex(0x006030)).toBe('#006030');
        expect(cssHex(0x000000)).toBe('#000000');
    });
});
