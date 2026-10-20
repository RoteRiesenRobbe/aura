import {describe, expect, it} from 'vitest';
import {medallionElement, refreshMedallions} from './MedallionElement';
import {setAppearanceCatalog} from '../../../../client-data/Appearance';
import {RING_FAMILY_FILES} from '../../../../client-data/Medallions';
import {GraphicsConfig} from '../../../../client-data/Graphics';

// plan-appearance.md C3: the select card and the creation picker draw the
// same medallion as the world: the friendly disc, the portrait, the ring in
// its family and the normal tier's shade.
const catalog = {
    portraits: [
        {id: 'default', name: 'Morion Helm', starter: true, default: true},
        {id: 'green-hood', name: 'Green Hood', starter: true},
    ],
    rings: [
        {id: 'ring-leather', name: 'Leather Ring', family: 'leather', starter: true},
        {id: 'ring-plain', name: 'Plain Ring', family: 'grey', starter: true, default: true},
    ],
};

const parts = (el: HTMLElement) => ({
    disc: el.querySelector('.medallionDisc') as HTMLElement,
    portrait: el.querySelector('.medallionPortrait') as HTMLImageElement,
    ring: el.querySelector('.medallionRing') as HTMLImageElement,
});

describe('medallionElement', () => {
    it('stacks disc, portrait and ring, the ring in its family', () => {
        setAppearanceCatalog(catalog);
        const {disc, portrait, ring} = parts(medallionElement('green-hood', 'ring-leather'));
        expect(disc.style.backgroundColor).toBe('rgb(46, 111, 216)');
        // No pack in a test: the committed fallback portrait.
        expect(portrait.getAttribute('src')).toBe(GraphicsConfig.character.file);
        expect(ring.getAttribute('src')).toBe(RING_FAMILY_FILES.leather);
        expect(ring.style.filter).toBe('brightness(0.439)');
    });

    it('draws the defaults for an id the catalog does not hold', () => {
        setAppearanceCatalog(catalog);
        expect(parts(medallionElement('retired', 'retired')).ring.getAttribute('src')).toBe(RING_FAMILY_FILES.grey);
    });

    it('redraws once the catalog arrives', () => {
        setAppearanceCatalog(null);
        const root = document.createElement('div');
        root.appendChild(medallionElement('green-hood', 'ring-leather'));
        expect(parts(root).ring.getAttribute('src')).toBe(RING_FAMILY_FILES.grey);
        setAppearanceCatalog(catalog);
        refreshMedallions(root);
        expect(parts(root).ring.getAttribute('src')).toBe(RING_FAMILY_FILES.leather);
    });
});
