/**
 * The DOM half of SpectateFade: one black element over the canvas and UNDER the
 * start and account screens, so the panels stay readable while the world behind
 * them cuts. Styled inline: it is one element with four static properties.
 */
let el: HTMLElement | undefined;

export function setOpacity(opacity: number): void {
    if (!el) {
        if (opacity <= 0) {
            return;
        }
        el = document.createElement('div');
        el.id = 'spectateFade';
        // Below @z-registration-nag (90), the lowest of the pre-join layers.
        el.style.cssText = 'position:fixed;inset:0;background:#000;pointer-events:none;z-index:80';
        document.body.appendChild(el);
    }
    el.style.opacity = String(opacity);
}

export function remove(): void {
    el?.remove();
    el = undefined;
}
