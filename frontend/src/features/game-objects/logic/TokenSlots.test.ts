import {describe, expect, it} from 'vitest';
import {Container} from 'pixi.js';
import {createTokenSlots, FRAME_LABEL, INDICATORS_LABEL, TOKEN_LABEL} from './TokenSlots';

// The named slots of a token entity's shape (plan-appearance.md C0a,
// plan-entity-medallions.md §5.2): the draw order every overlay relies on.
describe('createTokenSlots', () => {
    it('stacks belowArt, token, aboveArt, with the disc under the portrait under the frame under the indicators', () => {
        const group = new Container();
        const portrait = new Container();
        const slots = createTokenSlots(group, portrait);

        expect(group.children).toEqual([slots.belowArt, slots.token, slots.aboveArt]);
        expect(slots.token.children).toEqual([slots.disc, slots.actualShape, slots.frame, slots.indicators]);
        expect(slots.actualShape.children).toEqual([portrait]);
        expect(slots.token.label).toBe(TOKEN_LABEL);
        // The harnesses find the frame by label, from the group.
        expect(group.getChildByLabel(FRAME_LABEL, true)).toBe(slots.frame);
        expect(group.getChildByLabel(INDICATORS_LABEL, true)).toBe(slots.indicators);
    });

    // plan-entity-presentation.md D3, L1: the state indicators move with a
    // lunge (inside token) but sit outside actualShape, so the portrait's
    // grey filter and the damage flash never reach them.
    it('keeps the indicators inside the token and out of actualShape', () => {
        const slots = createTokenSlots(new Container(), new Container());
        expect(slots.indicators.parent).toBe(slots.token);
        expect(slots.actualShape.children).not.toContain(slots.indicators);
    });
});
