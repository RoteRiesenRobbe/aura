import {describe, expect, it} from 'vitest';
import {Container} from 'pixi.js';
import {createTokenSlots, FRAME_LABEL, TOKEN_LABEL} from './TokenSlots';

// The named slots of a token entity's shape (plan-appearance.md C0a,
// plan-entity-medallions.md §5.2): the draw order every overlay relies on.
describe('createTokenSlots', () => {
    it('stacks belowArt, token, aboveArt, with the portrait under the frame', () => {
        const group = new Container();
        const portrait = new Container();
        const slots = createTokenSlots(group, portrait);

        expect(group.children).toEqual([slots.belowArt, slots.token, slots.aboveArt]);
        expect(slots.token.children).toEqual([slots.actualShape, slots.frame]);
        expect(slots.actualShape.children).toEqual([portrait]);
        expect(slots.token.label).toBe(TOKEN_LABEL);
        // withBorder finds the frame by label, from the group.
        expect(group.getChildByLabel(FRAME_LABEL, true)).toBe(slots.frame);
    });
});
