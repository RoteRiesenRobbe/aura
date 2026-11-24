import {describe, expect, it} from 'vitest';
import {renderLines} from './AlertBanner';

// The banner's two type styles (PF3 feedback, PO 2026-11-24): the first line is
// the headline, the rest the smaller source line. textContent must stay the
// message as sent: eight browser harnesses match the banner by its text.
describe('AlertBanner.renderLines', () => {
    it('puts the first line in the title and the rest in the detail', () => {
        const el = document.createElement('div');
        renderLines(el, 'Learned Short Spear\nTaught by the City Guard');
        expect(el.querySelector('.alertTitle')?.textContent).toBe('Learned Short Spear');
        expect(el.querySelector('.alertDetail')?.textContent).toBe('Taught by the City Guard');
        expect(el.textContent).toBe('Learned Short Spear\nTaught by the City Guard');
    });

    it('a one-line message has no detail', () => {
        const el = document.createElement('div');
        renderLines(el, 'Level 5');
        expect(el.querySelector('.alertDetail')).toBeNull();
        expect(el.textContent).toBe('Level 5');
    });

    it('replaces the previous message entirely', () => {
        const el = document.createElement('div');
        renderLines(el, 'one\ntwo');
        renderLines(el, 'three');
        expect(el.textContent).toBe('three');
        expect(el.children).toHaveLength(1);
    });
});
