import {beforeEach, describe, expect, it, vi} from 'vitest';
import {Graphics, Sprite, Texture} from 'pixi.js';
import {registerGameObjectSVG} from '../../core/logic/Preloading';
import {ISvgContainer} from '../../core/logic/ISvgContainer';
import {StateIndicators} from './StateIndicators';
import {AppliedEffectBit, STATE_ROWS, indicatorOffset, indicatorRadius, tokenState} from './TokenState';

// The glyph files preload at import; record their holders instead, so a test
// decides when the placeholder has "loaded".
vi.mock('../../core/logic/Preloading', () => ({registerGameObjectSVG: vi.fn()}));

function glyphHolder(id: string): ISvgContainer {
    const file = STATE_ROWS.find(row => row.id === id).glyph.file;
    const call = vi.mocked(registerGameObjectSVG).mock.calls.find(([, f]) => f === file);
    return call[0] as ISvgContainer;
}

// plan-entity-presentation.md D4: one child per live indicator, at its row's
// reserved angle on the circle just outside the ring, redrawn only when the
// state changes.
describe('StateIndicators', () => {
    const size = 30;
    const angleOf = (id: string) => STATE_ROWS.find(row => row.id === id).angle;

    beforeEach(() => {
        glyphHolder('dead').svg = undefined;
    });

    it('places each live indicator at its reserved angle', () => {
        const indicators = new StateIndicators(size);
        indicators.setState(tokenState(AppliedEffectBit.Dot | AppliedEffectBit.Slow | AppliedEffectBit.Hot, false));
        const children = indicators.container.children;
        expect(children.map(child => child.label).sort()).toEqual(['dot', 'hot', 'slow']);
        for (const child of children) {
            const {x, y} = indicatorOffset(angleOf(child.label), indicatorRadius(size));
            expect(child.x, child.label).toBeCloseTo(x, 10);
            expect(child.y, child.label).toBeCloseTo(y, 10);
        }
    });

    it('hides when nothing is applied and draws nothing for stealth', () => {
        const indicators = new StateIndicators(size);
        indicators.setState(tokenState(AppliedEffectBit.Stealth, false));
        expect(indicators.container.children).toHaveLength(0);
        expect(indicators.container.visible).toBe(false);
    });

    // Without the pack (every unit test), a glyph row falls back to its disc.
    it('draws a colour disc where no glyph is loaded', () => {
        const indicators = new StateIndicators(size);
        indicators.setState(tokenState(0, true));
        expect(indicators.container.children).toHaveLength(1);
        expect(indicators.container.children[0]).toBeInstanceOf(Graphics);
        expect(indicators.container.children[0].label).toBe('dead');
    });

    // plan-appearance.md D42, D46: without the pack the committed placeholder
    // file draws the glyph.
    it('draws the placeholder file where the pack has no glyph', () => {
        const skull = new Texture();
        glyphHolder('dead').svg = skull;
        const indicators = new StateIndicators(size);
        indicators.setState(tokenState(0, true));
        const drawn = indicators.container.children[0] as Sprite;
        expect(drawn).toBeInstanceOf(Sprite);
        expect(drawn.texture).toBe(skull);
        expect(drawn.label).toBe('dead');
    });

    // A corpse sets its state once; a glyph that loads after must still show
    // (EP1 ledger: "C6 should draw after packIconsReady or re-resolve").
    it('upgrades a fallback disc once its glyph loads', () => {
        const indicators = new StateIndicators(size);
        indicators.setState(tokenState(0, true));
        expect(indicators.container.children[0]).toBeInstanceOf(Graphics);

        const skull = new Texture();
        glyphHolder('dead').svg = skull;
        indicators.refresh();
        const drawn = indicators.container.children[0] as Sprite;
        expect(drawn).toBeInstanceOf(Sprite);
        expect(drawn.texture).toBe(skull);
        expect(drawn.label).toBe('dead');
        const {x, y} = indicatorOffset(angleOf('dead'), indicatorRadius(size));
        expect(drawn.x).toBeCloseTo(x, 10);
        expect(drawn.y).toBeCloseTo(y, 10);
    });

    it('keeps its children on a refresh with nothing new loaded', () => {
        const indicators = new StateIndicators(size);
        indicators.setState(tokenState(AppliedEffectBit.Dot, true));
        const first = indicators.container.children[0];
        indicators.refresh();
        expect(indicators.container.children[0]).toBe(first);
    });

    it('redraws on a change and keeps its children on a repeat', () => {
        const indicators = new StateIndicators(size);
        indicators.setState(tokenState(AppliedEffectBit.Dot, false));
        const first = indicators.container.children[0];
        indicators.setState(tokenState(AppliedEffectBit.Dot, false));
        expect(indicators.container.children[0]).toBe(first);

        indicators.setState(tokenState(AppliedEffectBit.Fear, false));
        expect(indicators.container.children.map(child => child.label)).toEqual(['fear']);
        expect(first.destroyed).toBe(true);

        indicators.setState(tokenState(0, false));
        expect(indicators.container.children).toHaveLength(0);
        expect(indicators.container.visible).toBe(false);
    });
});
