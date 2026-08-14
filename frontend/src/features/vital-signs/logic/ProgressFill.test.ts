import {describe, expect, it} from 'vitest';
import {ProgressFill} from './ProgressFill';

// The shared fill mechanism (plan-code-health.md C5 item 2): one class drives
// the .indicator of every HUD progress bar (vital signs, cast bar, flight
// bar) via the scale property. Style READ-BACK on purpose — jsdom's computed
// styles are unreliable for `scale`.

const build = () => {
    const node = document.createElement('div');
    const indicator = document.createElement('div');
    indicator.className = 'indicator';
    node.appendChild(indicator);
    return {fill: new ProgressFill(node), indicator};
};

describe('ProgressFill', () => {
    it('scales the indicator to the fraction', () => {
        const {fill, indicator} = build();
        fill.setFraction(0.5);
        expect(indicator.style.scale).toBe('50.00% 1');
    });

    it('renders empty at 0', () => {
        const {fill, indicator} = build();
        fill.setFraction(0);
        expect(indicator.style.scale).toBe('0.00% 1');
    });

    it('renders full at 1', () => {
        const {fill, indicator} = build();
        fill.setFraction(1);
        expect(indicator.style.scale).toBe('100.00% 1');
    });
});
