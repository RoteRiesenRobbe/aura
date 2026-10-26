import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ColorMatrixFilter, Container, Sprite, Texture} from 'pixi.js';
import {createTokenSlots, TokenSlots} from './TokenSlots';
import {registerGameObjectSVG} from '../../core/logic/Preloading';
import {Medallion} from './Medallion';
import {GREY_DISC, GREY_RING, RING_FAMILY_FILES, ringTint, stanceTint} from '../../../client-data/Medallions';
import {AppliedEffectBit, tokenState} from './TokenState';
import {TierRank} from '../../../client-data/Mobs';
import {Stance} from '../../../../../api/schema/js/aura-api/stance';
import {ISvgContainer} from '../../core/logic/ISvgContainer';
import {setAppearanceCatalog} from '../../../client-data/Appearance';

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

    // plan-appearance.md C6 (EP D9): the worn look is drawn by the medallion,
    // so the Character and the Corpse share it, catalog race included (L8).
    describe('look', () => {
        const forest = new Texture();

        beforeEach(() => {
            setAppearanceCatalog(null);
            ringHolder('grey').svg = ringTexture;
            ringHolder('forest').svg = forest;
        });

        it('draws the default ring until the catalog lands, then the worn one', () => {
            const medallion = build();
            medallion.setLook(0, 1);
            medallion.refresh();
            expect(ring().texture).toBe(ringTexture);

            setAppearanceCatalog({
                portraits: [],
                rings: [{id: 'leafy', name: 'x', family: 'forest', starter: true}],
            });
            medallion.refresh();
            expect(ring().texture).toBe(forest);
        });

        // A Mob wears no look: refresh must leave its species ring alone, so
        // any token may call it for the glyph upgrade (the C6 review).
        it('leaves the ring of a token wearing no look alone', () => {
            const medallion = build();
            medallion.setRing('forest');
            medallion.refresh();
            expect(ring().texture).toBe(forest);
        });

        it('keeps the ring sprite while the look stays the same', () => {
            const medallion = build();
            medallion.setLook(0, 0);
            medallion.refresh();
            const drawn = ring();
            medallion.refresh();
            expect(ring()).toBe(drawn);
        });
    });

    // plan-entity-presentation.md D5, D6: the medallion owns its final tints,
    // and a grey (dead) token greys disc and ring by tint, the portrait alone
    // by a filter.
    describe('state', () => {
        const dead = tokenState(0, true);
        const alive = tokenState(0, false);

        it('greys disc and ring by tint, and brings tier and stance back on ungrey', () => {
            ringHolder('grey').svg = ringTexture;
            const medallion = build();
            medallion.setRing('grey');
            medallion.setTier(TierRank.Boss);
            medallion.setStance(Stance.Friendly);

            medallion.setState(dead);
            expect(ring().tint).toBe(GREY_RING);
            expect(disc().tint).toBe(GREY_DISC);

            medallion.setState(alive);
            expect(ring().tint).toBe(ringTint(TierRank.Boss));
            expect(disc().tint).toBe(stanceTint(Stance.Friendly));
        });

        // L2: setRing recreates the sprite; a late ring on a corpse must not
        // bring the tier colour back.
        it('keeps grey on a ring drawn after the grey', () => {
            const medallion = build();
            medallion.setState(dead);
            ringHolder('grey').svg = ringTexture;
            medallion.setRing('grey');
            expect(ring().tint).toBe(GREY_RING);
        });

        it('stays grey through a tier or stance change, and takes them on ungrey', () => {
            ringHolder('grey').svg = ringTexture;
            const medallion = build();
            medallion.setRing('grey');
            medallion.setState(dead);
            medallion.setTier(TierRank.Elite);
            medallion.setStance(Stance.Neutral);
            expect(ring().tint).toBe(GREY_RING);
            expect(disc().tint).toBe(GREY_DISC);

            medallion.setState(alive);
            expect(ring().tint).toBe(ringTint(TierRank.Elite));
            expect(disc().tint).toBe(stanceTint(Stance.Neutral));
        });

        // L1: a filter covers every descendant, so the grey sits on the
        // portrait's slot alone, never on the token or the frame.
        it('greys the portrait through one filter on actualShape only', () => {
            const medallion = build();
            medallion.setState(dead);
            const filters = slots.actualShape.filters as ColorMatrixFilter[];
            expect(filters).toHaveLength(1);
            expect(filters[0]).toBeInstanceOf(ColorMatrixFilter);
            expect(filters[0].enabled).toBe(true);
            expect(slots.token.filters ?? null).toBeNull();
            expect(slots.frame.filters ?? null).toBeNull();
            expect(slots.indicators.filters ?? null).toBeNull();

            medallion.setState(alive);
            expect((slots.actualShape.filters as ColorMatrixFilter[])[0].enabled).toBe(false);
        });

        it('builds no filter for a token that never greys', () => {
            const medallion = build();
            medallion.setState(tokenState(AppliedEffectBit.Dot | AppliedEffectBit.Stealth, false));
            expect(slots.actualShape.filters ?? null).toBeNull();
        });

        // The damage flash appends its own filter (StatusEffect.ts); the grey
        // joins it rather than replacing it.
        it('appends the grey beside a filter already on the portrait', () => {
            const flash = new ColorMatrixFilter();
            slots.actualShape.filters = [flash];
            const medallion = build();
            medallion.setState(dead);
            const filters = slots.actualShape.filters as ColorMatrixFilter[];
            expect(filters).toHaveLength(2);
            expect(filters[0]).toBe(flash);
        });

        it('draws the indicators into the indicators slot', () => {
            const medallion = build();
            medallion.setState(tokenState(AppliedEffectBit.Dot | AppliedEffectBit.Hot, false));
            expect(slots.indicators.children).toHaveLength(1);
            const drawn = slots.indicators.children[0] as Container;
            expect(drawn.children.map(child => child.label).sort()).toEqual(['dot', 'hot']);
        });
    });
});
