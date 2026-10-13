import {describe, expect, it} from 'vitest';
import {authoredLightColor, lightTint, WHITE_LIGHT} from './LightColor';

describe('lightTint (plan-lightmap.md D6)', () => {
    it('reads the wire default 0 as an unauthored, white light', () => {
        expect(lightTint(0)).toBe(WHITE_LIGHT);
    });

    it('keeps an authored colour', () => {
        expect(lightTint(0xffb060)).toBe(0xffb060);
    });
});

describe('authoredLightColor', () => {
    it('parses an authored #rrggbb', () => {
        expect(authoredLightColor('#ffc070', WHITE_LIGHT)).toBe(0xffc070);
    });

    it('falls back when nothing is authored', () => {
        expect(authoredLightColor(undefined, 0xffb060)).toBe(0xffb060);
    });

    it('treats an unparseable colour as unauthored', () => {
        expect(authoredLightColor('orange', WHITE_LIGHT)).toBe(WHITE_LIGHT);
        expect(authoredLightColor('#fff', WHITE_LIGHT)).toBe(WHITE_LIGHT);
    });
});
