// The cross-language theme tokens (plan-code-health.md C6, D3).
//
// Colors that provably live in BOTH languages (LESS and TS) are defined here
// once, and Theme.test.ts PINS the LESS side (variables.less) against these
// values: cross-language color drift fails vitest instead of shipping.
//
// ⚑ A deliberate leaf module with no imports: OverheadHealthBar and EffectPips
// both read it (importing the bar's constants from the bar was a module cycle,
// C5 ledger), and it sits on the boot path.
//
// The overhead-bar family lives here wholesale as C6's single restyle seam,
// but only TWO of its members are cross-language (backdrop ≙ @backgroundColor,
// shield fill ≙ @shield-fill). HEALTH_FILL (0xaa3b3b) and the border have NO
// LESS twin (the HUD health bar is crimson/#840D25), so the pin deliberately
// does not cover them; do not go hunting for a mirror that does not exist.

// The brand orange (LESS: @brand; buttons, highlights, the cast/XP fill).
export const BRAND = 0xe37313;

// The level-up/unlock gold (LESS: @gold-levelup). ⚑ The keyframe flash gold
// (@gold-flash, CSS keyword `gold`) is a DIFFERENT, LESS-only hue; whether the
// two should unify is a recorded UI-pass follow-up.
export const LEVEL_UP_GOLD = 0xffd75e;

// Focus, the resource bar's own fill (LESS: @focus-color). The CSS KEYWORD on
// both sides, not a hex literal, so tooltip cost lines match the bar exactly.
export const FOCUS_COLOR_CSS = 'crimson';

// The terrain green (LESS: @land-color); the page background behind the canvas
// is deliberately the same color so letterboxing/overscroll is invisible.
export const LAND_COLOR = 0x006030;

// The overhead health/shield bar family (moved from OverheadHealthBar.ts, C5's
// recorded intent). The backdrop is also EffectPips' pip rim.
export const OVERHEAD_BAR_BACKDROP = {color: 0x000000, alpha: 0.6};
export const OVERHEAD_BAR_BORDER = {width: 1, color: 0xffffff, alpha: 0.35};
export const OVERHEAD_BAR_HEALTH_FILL = {color: 0xaa3b3b, alpha: 0.9};
// ≙ the HUD Focus bar's absorb segment (vitalSigns.less @shield-fill,
// rgba(125, 195, 255, 0.75)): one color in two languages, pinned.
export const OVERHEAD_BAR_SHIELD_FILL = {color: 0x7dc3ff, alpha: 0.75};

// Both encodings from one definition: numeric for Pixi, string for CSS-in-TS.
export function cssHex(color: number): string {
    return '#' + color.toString(16).padStart(6, '0');
}
