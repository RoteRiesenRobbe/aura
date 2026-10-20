import {beforeEach, describe, expect, it, vi} from 'vitest';
import {Container, Sprite, Texture} from 'pixi.js';
import {createTokenSlots, TokenSlots} from './TokenSlots';
import {registerGameObjectSVG} from '../../core/logic/Preloading';
import {Medallion} from './Medallion';
import {RING_FAMILY_FILES, ringTint, stanceTint} from '../../../client-data/Medallions';
import {TierRank} from '../../../client-data/Mobs';
import {Stance} from '../../../../../api/schema/js/aura-api/stance';
import {ISvgContainer} from '../../core/logic/ISvgContainer';

// The ring preloads register at import; record their holders instead of
// loading anything, so a test decides which ring texture has "loaded".
vi.mock('../../core/logic/Preloading', () => ({registerGameObjectSVG: vi.fn()}));

function ringHolder(family: keyof typeof RING_FAMILY_FILES): ISvgContainer {
    const call = vi.mocked(registerGameObjectSVG).mock.calls.find(([, file]) => file === RING_FAMILY_FILES[family]);
    return call[0] as ISvgContainer;
}

// One composition path for every token (plan-appearance.md C2b, D37): the
// medallion fills the token slots, and Mob and Character only feed it.
describe('Medallion', () => {
    let slots: TokenSlots;
    let portrait: Sprite;
    const ringTexture = new Texture();

    beforeEach(() => {
        for (const family of Object.keys(RING_FAMILY_FILES) as (keyof typeof RING_FAMILY_FILES)[]) {
            ringHolder(family).svg = undefined;
        }
        portrait = new Sprite(Texture.WHITE);
        slots = createTokenSlots(new Container(), portrait);
    });

    const build = () => new Medallion(slots, portrait, 30, Texture.WHITE);
    const ring = () => slots.frame.children[0] as Sprite;
    const disc = () => slots.disc.children[0] as Sprite;

    it('puts the disc in the disc slot and no ring before one is set', () => {
        build();
        expect(slots.disc.children).toHaveLength(1);
        expect(slots.frame.children).toHaveLength(0);
        expect(slots.actualShape.children).toEqual([portrait]);
    });

    it('draws the ring into the frame slot once its texture has loaded', () => {
        const medallion = build();
        expect(medallion.setRing('grey')).toBe(false);
        expect(slots.frame.children).toHaveLength(0);

        ringHolder('grey').svg = ringTexture;
        expect(medallion.setRing('grey')).toBe(true);
        expect(slots.frame.children).toHaveLength(1);
        expect(ring().texture).toBe(ringTexture);
    });

    it('swaps the ring rather than stacking a second one', () => {
        ringHolder('grey').svg = ringTexture;
        ringHolder('forest').svg = new Texture();
        const medallion = build();
        medallion.setRing('grey');
        medallion.setRing('forest');
        expect(slots.frame.children).toHaveLength(1);
        expect(ring().texture).toBe(ringHolder('forest').svg);
    });

    // The wire sends tier and stance before the species id every tick, so
    // both arrive before the ring exists (C1, C2).
    it('keeps a tier and stance set before the ring and applies them', () => {
        const medallion = build();
        medallion.setTier(TierRank.Boss);
        medallion.setStance(Stance.Friendly);
        expect(disc().tint).toBe(stanceTint(Stance.Friendly));

        ringHolder('grey').svg = ringTexture;
        medallion.setRing('grey');
        expect(ring().tint).toBe(ringTint(TierRank.Boss));

        medallion.setTier(TierRank.Elite);
        expect(ring().tint).toBe(ringTint(TierRank.Elite));
    });

    it('starts hostile and normal, the wire defaults', () => {
        const medallion = build();
        expect(disc().tint).toBe(stanceTint(Stance.Hostile));
        ringHolder('grey').svg = ringTexture;
        medallion.setRing('grey');
        expect(ring().tint).toBe(ringTint(TierRank.Normal));
    });

    it('keeps the class portrait for a species without its own bust', () => {
        const medallion = build();
        medallion.setPortrait('NoSuchSpecies');
        expect(portrait.texture).toBe(Texture.WHITE);
    });

    // The player's chosen portrait (plan-appearance.md C3) goes through the
    // same swap as a species bust: one portrait path for every token.
    it('wears a given portrait texture and keeps the drawn size', () => {
        const medallion = build();
        const {width, height} = portrait;
        const bust = new Texture();
        medallion.setPortraitTexture(bust);
        expect(portrait.texture).toBe(bust);
        expect(portrait.width).toBe(width);
        expect(portrait.height).toBe(height);
    });

    it('falls back to the class portrait for no texture (no pack on this machine)', () => {
        const medallion = build();
        medallion.setPortraitTexture(new Texture());
        medallion.setPortraitTexture(null);
        expect(portrait.texture).toBe(Texture.WHITE);
    });
});
