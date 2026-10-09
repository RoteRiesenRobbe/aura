/**
 * The partial seam (plan-localization.md C0b): every HTML partial passes
 * through `Preloading.renderPartial`, which runs this pass right after the
 * partial is injected.
 *
 * - `data-i18n="key"` sets the element's textContent. ⚑ Leaf elements only:
 *   textContent on a parent wipes its children.
 * - `data-i18n-attr="placeholder:key;title:key2"` sets attributes.
 *
 * A sentence with markup inside it is an ICU rich-text message formatted in TS
 * with `tParts` (one handler per tag), never innerHTML.
 */
import {tKey} from './Locale';

export function applyI18n(root: ParentNode) {
    root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(element => {
        element.textContent = tKey(element.getAttribute('data-i18n'));
    });
    root.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach(element => {
        element.getAttribute('data-i18n-attr').split(';').forEach(entry => {
            const cut = entry.indexOf(':');
            if (cut > 0) {
                element.setAttribute(entry.slice(0, cut).trim(), tKey(entry.slice(cut + 1).trim()));
            }
        });
    });
}
