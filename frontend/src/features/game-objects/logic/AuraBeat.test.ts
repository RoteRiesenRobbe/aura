import {describe, it, expect} from 'vitest';
import {BeatDetector} from './AuraBeat';

// N5 (plan-feel-pass-2.md §5, D3): the client is never told a tick landed —
// it infers the beat from the aura_tick_phase wrap. The trap this detector
// exists for: the server RESETS the tick accumulator on an aura switch, so a
// naive "phase decreased → beat" fires spuriously at every switch — the exact
// stutter the indicator's baseline alpha was introduced to bury (C2 PO
// finding 2026-07-17). A beat is only a beat within the SAME stream: same
// active skill, same interval, with a prior observation.
describe('BeatDetector', () => {
    it('fires on a phase wrap within a steady stream', () => {
        const d = new BeatDetector();
        expect(d.observe(7, 40, 10)).toBe(false); // first observation seeds
        expect(d.observe(7, 40, 25)).toBe(false); // rising toward the beat
        expect(d.observe(7, 40, 38)).toBe(false);
        expect(d.observe(7, 40, 2)).toBe(true);   // wrapped — the beat landed
        expect(d.observe(7, 40, 15)).toBe(false); // rising again
        expect(d.observe(7, 40, 1)).toBe(true);   // next beat
    });

    it('stays quiet across an aura switch, even at the same interval (the stutter trap)', () => {
        const d = new BeatDetector();
        d.observe(7, 40, 10);
        d.observe(7, 40, 30);
        // Switch to another 40-tick aura: the server resets the accumulator,
        // so the phase drops 30 → 0 exactly like a wrap. The key says it is
        // a different stream — no pulse.
        expect(d.observe(9, 40, 0)).toBe(false);
        expect(d.observe(9, 40, 12)).toBe(false);
        // The new stream's own wrap fires normally.
        expect(d.observe(9, 40, 39)).toBe(false);
        expect(d.observe(9, 40, 3)).toBe(true);
    });

    it('stays quiet when the interval changes mid-stream (haste)', () => {
        const d = new BeatDetector();
        d.observe(7, 40, 30);
        // tick_rate halves the effective interval; the phase drop is a
        // re-scale, not a landed tick.
        expect(d.observe(7, 20, 3)).toBe(false);
        expect(d.observe(7, 20, 18)).toBe(false);
        expect(d.observe(7, 20, 1)).toBe(true);
    });

    it('resets through a deactivation instead of comparing against stale phase', () => {
        const d = new BeatDetector();
        d.observe(7, 40, 30);
        expect(d.observe(0, 0, 0)).toBe(false);  // aura off
        expect(d.observe(7, 40, 2)).toBe(false); // reactivated: seeds, no ghost beat
        expect(d.observe(7, 40, 38)).toBe(false);
        expect(d.observe(7, 40, 1)).toBe(true);
    });

    it('does not fire on an unchanged phase (duplicate snapshot)', () => {
        const d = new BeatDetector();
        d.observe(7, 40, 12);
        expect(d.observe(7, 40, 12)).toBe(false);
    });

    it('never fires while there is no active aura', () => {
        const d = new BeatDetector();
        expect(d.observe(0, 0, 0)).toBe(false);
        expect(d.observe(0, 0, 0)).toBe(false);
    });
});
