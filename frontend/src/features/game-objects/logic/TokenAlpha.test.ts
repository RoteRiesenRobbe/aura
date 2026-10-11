import {describe, expect, it} from 'vitest';
import {AppliedEffectBit, STEALTH_ALPHA, tokenAlpha} from './EffectPips';

// A stealthed token is translucent to every viewer (plan-effect-types-round-2.md C6, D24).
describe('tokenAlpha', () => {
    it('is translucent exactly when the Stealth bit is set', () => {
        expect(tokenAlpha(0)).toBe(1);
        expect(tokenAlpha(AppliedEffectBit.Slow | AppliedEffectBit.Fear)).toBe(1);
        expect(tokenAlpha(AppliedEffectBit.Stealth)).toBe(STEALTH_ALPHA);
        expect(tokenAlpha(AppliedEffectBit.Stealth | AppliedEffectBit.Dot)).toBe(STEALTH_ALPHA);
        expect(STEALTH_ALPHA).toBeLessThan(1);
    });
});
