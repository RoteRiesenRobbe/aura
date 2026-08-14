// ProgressFill is the one fill mechanism behind every HUD progress bar
// (plan-code-health.md C5): the vital-sign bars, the cast bar and the flight
// bar used to ship three hand-rolled indicator writers (scale here, width
// twice in HUD.ts). Scale, not width, so the fill never triggers layout; the
// bar's LESS gives the .indicator `width: 100%` and a left-edge
// transform-origin, and whether the write animates is the sheet's decision
// (the vital bars transition over 33 ms, cast/flight deliberately jump).
export class ProgressFill {
    private readonly indicator: HTMLElement;

    constructor(container: HTMLElement) {
        this.indicator = container.querySelector('.indicator');
    }

    /** @param fraction 0.0 - 1.0 */
    setFraction(fraction: number) {
        this.indicator.style.scale = (fraction * 100).toFixed(2) + '% 1';
    }
}
