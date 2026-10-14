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
import {tKey, tParts} from './Locale';

export function applyI18n(root: ParentNode) {
    root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(element => {
        element.textContent = tKey(element.getAttribute('data-i18n'));
    });
    // A sentence with markup inside: each child marked `data-i18n-tag="name"`
    // is the template for the ICU tag <name>…</name>; it is cloned (attributes,
    // ids, hrefs kept) around the translated chunk.
    root.querySelectorAll<HTMLElement>('[data-i18n-rich]').forEach(element => {
        const tags: Record<string, (chunks: string) => Node> = {};
        element.querySelectorAll<HTMLElement>('[data-i18n-tag]').forEach(child => {
            tags[child.getAttribute('data-i18n-tag')] = (chunks: string) => {
                const clone = child.cloneNode(false) as HTMLElement;
                clone.removeAttribute('data-i18n-tag');
                clone.textContent = chunks;
                return clone;
            };
        });
        const nodes = tParts(element.getAttribute('data-i18n-rich'), {}, tags);
        element.textContent = '';
        nodes.forEach(node => element.appendChild(node));
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
