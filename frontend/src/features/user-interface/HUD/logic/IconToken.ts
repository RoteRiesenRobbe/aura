// The ink-ringed icon token (UI pass C4) - the one place the direction-C glyph
// treatment is built, so C5's icon-only ability bar re-sizes it instead of
// growing a second copy.
//
// Shape, from the ratified §4 list: a solid parchment glyph inside an ink ring
// on the moss field, with the mockup's corner motif. Everything visual lives in
// `.ink-token` in HUD.less; this module only builds the element and picks
// between the glyph and its fallback.
//
// ⚑ The glyph is INLINE SVG, not a background image or an <img>: `currentColor`
// is what tints it, so the token's colour follows the row's state (selected,
// dimmed, hovered) with no second asset per state. The path data is bundled by
// SkillIcons.generated.ts - no runtime request, ever.

import {SKILL_GLYPHS} from '../../../../client-data/icons/SkillIcons.generated';

/** The class every token carries, and what the harness asserts against. */
export const TOKEN_CLASS = 'ink-token';

/**
 * Build a token for a glyph path ("author/name"), falling back to `fallback`'s
 * first character when the path is null or names a glyph that is not bundled.
 *
 * The unbundled case is a content typo - both completeness pins (the Go content
 * test and SkillIcons.test.ts) exist to catch it before it ships - so the
 * fallback is a safety net, not a normal path.
 */
export function createIconToken(iconPath: string | null, fallback: string): HTMLElement {
    const token = document.createElement('span');
    token.className = TOKEN_CLASS;

    const glyph = iconPath ? SKILL_GLYPHS[iconPath] : undefined;
    if (!glyph) {
        token.classList.add('letterFallback');
        token.textContent = (fallback.trim()[0] ?? '?').toUpperCase();
        return token;
    }

    // innerHTML on GENERATED, repo-local markup: the strings come from the
    // committed module the fetch script wrote, never from the wire.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', glyph.viewBox);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.innerHTML = glyph.body;
    token.appendChild(svg);
    return token;
}

/** Whether a glyph path is one this build can actually draw. */
export function hasGlyph(iconPath: string | null): boolean {
    return !!iconPath && iconPath in SKILL_GLYPHS;
}
