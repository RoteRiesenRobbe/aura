import {lookArt, wireOf, appearanceReady} from '../../../../client-data/Appearance';
import {RING_FAMILY_FILES, ringTint, stanceTint} from '../../../../client-data/Medallions';
import {TierRank} from '../../../../client-data/Mobs';
import {GraphicsConfig} from '../../../../client-data/Graphics';
import {packIconsReady, packIconTexture} from '../../../../client-data/icons/PackIconFiles';
import {Stance} from '../../../../../../api/schema/js/aura-api/stance';

/**
 * A player's medallion as DOM (plan-appearance.md C3): the select cards and
 * the creation picker draw it, from the same art as the world token
 * (Appearance.lookArt, D37). The disc is the friendly stance (D4) and the
 * ring wears the normal tier's shade.
 *
 * The portrait is the pack bust's own baked canvas (PackIconFiles), as a data
 * URL made once per bust; without the pack, the committed fallback.
 */

const CLASS = 'medallion';
const portraitUrls = new Map<string, string>();

function portraitUrl(packIcon: string | undefined): string {
    const cached = packIcon && portraitUrls.get(packIcon);
    if (cached) {
        return cached;
    }
    const canvas = packIconTexture(packIcon)?.source.resource as HTMLCanvasElement | undefined;
    if (!canvas) {
        return GraphicsConfig.character.file;
    }
    const url = canvas.toDataURL();
    portraitUrls.set(packIcon, url);
    return url;
}

function hex(color: number): string {
    return '#' + color.toString(16).padStart(6, '0');
}

// The ring art is greyscale and the tier tint a grey (Medallions.RING_TINTS),
// so a multiply by it is exactly a brightness filter.
const RING_BRIGHTNESS = Math.round(((ringTint(TierRank.Normal) >> 16) & 0xff) / 255 * 1000) / 1000;

function fill(el: HTMLElement) {
    const {packIcon, family} = lookArt(wireOf('portrait', el.dataset.portrait), wireOf('ring', el.dataset.ring));
    (el.querySelector('.medallionPortrait') as HTMLImageElement).src = portraitUrl(packIcon);
    (el.querySelector('.medallionRing') as HTMLImageElement).src = RING_FAMILY_FILES[family];
}

function part(tag: string, className: string): HTMLElement {
    const element = document.createElement(tag);
    element.className = className;
    if (element instanceof HTMLImageElement) {
        element.alt = '';
        element.draggable = false;
    }
    return element;
}

/** A medallion wearing the portrait and ring of these appearance item ids. */
export function medallionElement(portraitId: string, ringId: string): HTMLElement {
    const el = part('div', CLASS);
    el.dataset.portrait = portraitId;
    el.dataset.ring = ringId;
    const disc = part('div', 'medallionDisc');
    disc.style.backgroundColor = hex(stanceTint(Stance.Friendly));
    const ring = part('img', 'medallionRing');
    ring.style.filter = `brightness(${RING_BRIGHTNESS})`;
    el.append(disc, part('img', 'medallionPortrait'), ring);
    fill(el);
    return el;
}

/** Redraws every medallion under root: the catalog or the pack arrived. */
export function refreshMedallions(root: ParentNode = document) {
    root.querySelectorAll<HTMLElement>('.' + CLASS).forEach(fill);
}

// Either may land after a card was drawn; the cards then catch up.
Promise.all([appearanceReady, packIconsReady]).then(() => refreshMedallions());
