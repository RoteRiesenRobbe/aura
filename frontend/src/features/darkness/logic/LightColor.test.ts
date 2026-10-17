import {describe, expect, it} from 'vitest';
import {authoredLightColor, lightTint, ownLightTint, WHITE_LIGHT, wireLightRadius} from './LightColor';

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

describe('ownLightTint (plan-lightmap.md D9: sight takes the D5 rule)', () => {
    it('draws the wire colour while the light wins the radius', () => {
        expect(ownLightTint(300, 120, 0xffc98a)).toBe(0xffc98a);
    });

    it('draws white while sight wins: sight is eyes, not a light', () => {
        expect(ownLightTint(120, 240, 0xffc98a)).toBe(WHITE_LIGHT);
    });

    it('keeps the wire colour on a tie', () => {
        expect(ownLightTint(240, 240, 0xffc98a)).toBe(0xffc98a);
    });

    it('draws white with no light at all', () => {
        expect(ownLightTint(0, 120, 0)).toBe(WHITE_LIGHT);
    });
});

describe('wireLightRadius (plan-lightmap.md D8: a campfire draws one light)', () => {
    it('drops the wire light of a respawn anchor: its static glow already draws it', () => {
        expect(wireLightRadius(840, 90)).toBe(0);
    });

    it('keeps the light of every other entity', () => {
        expect(wireLightRadius(840, 0)).toBe(840);
        expect(wireLightRadius(840, undefined)).toBe(840);
    });
});
