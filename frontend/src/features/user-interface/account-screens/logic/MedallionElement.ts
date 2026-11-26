import {lookArt, wireOf, appearanceReady} from '../../../../client-data/Appearance';
import {RING_FAMILY_FILES, stanceTint} from '../../../../client-data/Medallions';
import {GraphicsConfig} from '../../../../client-data/Graphics';
import {packIconsReady, packIconTexture} from '../../../../client-data/icons/PackIconFiles';
import {Stance} from '../../../../../../api/schema/js/aura-api/stance';

/**
 * A player's medallion as DOM (plan-appearance.md C3): the select cards and
 * the creation picker draw it, from the same art as the world token
 * (Appearance.lookArt, D37). The disc is the friendly stance (D4) and the
 * ring wears its item's colour (F16).
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

// The ring art is greyscale and the world tints it by multiplying. As DOM,
// the item's colour (F16) is a layer masked to the ring's shape and
// multiplied over it (.medallionRingTint, variables.less).
function fill(el: HTMLElement) {
    const {packIcon, family, tint} = lookArt(wireOf('portrait', el.dataset.portrait), wireOf('ring', el.dataset.ring));
    const ringUrl = RING_FAMILY_FILES[family];
    (el.querySelector('.medallionPortrait') as HTMLImageElement).src = portraitUrl(packIcon);
    (el.querySelector('.medallionRing') as HTMLImageElement).src = ringUrl;
    const tintLayer = el.querySelector('.medallionRingTint') as HTMLElement;
    tintLayer.style.backgroundColor = hex(tint);
    tintLayer.style.setProperty('mask-image', `url("${ringUrl}")`);
    tintLayer.style.setProperty('-webkit-mask-image', `url("${ringUrl}")`);
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
    el.append(disc, part('img', 'medallionPortrait'), part('img', 'medallionRing'), part('div', 'medallionRingTint'));
    fill(el);
    return el;
}

/** Redraws every medallion under root: the catalog or the pack arrived. */
export function refreshMedallions(root: ParentNode = document) {
    root.querySelectorAll<HTMLElement>('.' + CLASS).forEach(fill);
}

// Either may land after a card was drawn; the cards then catch up.
Promise.all([appearanceReady, packIconsReady]).then(() => refreshMedallions());
