import {describe, expect, it} from 'vitest';
import {buildBugReport, formatFrameStats, formatLocalTime, formatUptime, frameStats, warpForm} from './ReportText';

describe('buildBugReport', () => {
    it('puts the message first, verbatim, then the diagnostics in a stable order', () => {
        const text = buildBugReport('The map is blue.\n  Second line, indented.', {
            gameVersion: 'abc1234 (2026-11-04)',
            httpRtt: '42 ms',
            console: [],
        });
        const lines = text.split('\n');
        expect(lines[0]).toBe('== Bug report ==');
        expect(lines[1]).toBe('The map is blue.');
        expect(lines[2]).toBe('  Second line, indented.');
        expect(lines[3]).toBe('');
        expect(lines[4]).toBe('== Diagnostics ==');
        expect(lines[5]).toBe('report id:      n/a');
        expect(lines[6]).toBe('game version:   abc1234 (2026-11-04)');
        expect(text.indexOf('game version:')).toBeLessThan(text.indexOf('http rtt:'));
        expect(text.indexOf('http rtt:')).toBeLessThan(text.indexOf('character:'));
    });

    it('prints n/a for every missing fact', () => {
        const text = buildBugReport('', {console: []});
        for (const label of ['report id', 'game version', 'local time', 'browser', 'device', 'screen',
            'renderer', 'gpu', 'minimap', 'fps check', 'http rtt', 'settings', 'character', 'server', 'session']) {
            expect(text).toMatch(new RegExp(`^${label}: +n/a$`, 'm'));
        }
    });

    it('marks an empty message instead of leaving a blank section', () => {
        const text = buildBugReport('   ', {console: []});
        expect(text.split('\n')[1]).toBe('(no message)');
    });

    it('lists the console entries indented under their header, or says there are none', () => {
        const withEntries = buildBugReport('x', {console: ['[error 21:12:03] boom', '[warn 21:12:04] hmm']});
        expect(withEntries).toContain('console (last 2):\n  [error 21:12:03] boom\n  [warn 21:12:04] hmm');
        const without = buildBugReport('x', {console: []});
        expect(without).toMatch(/^console: +none$/m);
    });
});

describe('frameStats', () => {
    it('is null for no frames', () => {
        expect(frameStats([])).toBeNull();
    });

    it('handles one frame', () => {
        expect(frameStats([20])).toEqual({frames: 1, durationMs: 20, avgFps: 50, medianMs: 20, p95Ms: 20, worstMs: 20});
    });

    it('reports avg fps over the whole window and the slow tail separately', () => {
        // 19 smooth frames and one stall: the median stays smooth, the worst shows the stall.
        const deltas = [...Array(19).fill(10), 500];
        const stats = frameStats(deltas);
        expect(stats.frames).toBe(20);
        expect(stats.durationMs).toBe(690);
        expect(stats.avgFps).toBeCloseTo(20 / 0.69, 5);
        expect(stats.medianMs).toBe(10);
        expect(stats.p95Ms).toBe(10);
        expect(stats.worstMs).toBe(500);
    });

    it('does not reorder the caller\'s array', () => {
        const deltas = [30, 10, 20];
        frameStats(deltas);
        expect(deltas).toEqual([30, 10, 20]);
    });
});

describe('formatFrameStats', () => {
    it('writes one line with the visibility state', () => {
        const stats = frameStats([...Array(19).fill(10), 500]);
        expect(formatFrameStats(stats, 'visible'))
            .toBe('0.7 s · 20 frames · avg 29.0 fps · median 10 ms · p95 10 ms · worst 500 ms · tab visible');
    });

    it('says why there is no number', () => {
        expect(formatFrameStats(null, 'hidden')).toBe('n/a (no frames) · tab hidden');
    });
});

describe('warpForm', () => {
    it('gives the position in meters and the WARP command in world px', () => {
        expect(warpForm(4944, -942)).toBe('at 41.20, -7.85 (WARP 4944 -942)');
    });

    it('rounds the WARP form to whole pixels', () => {
        expect(warpForm(100.4, 239.6)).toBe('at 0.84, 2.00 (WARP 100 240)');
    });
});

describe('formatUptime', () => {
    it('reads seconds, then minutes, then hours and minutes', () => {
        expect(formatUptime(42_400)).toBe('42 s');
        expect(formatUptime(12 * 60_000 + 59_000)).toBe('12 min');
        expect(formatUptime(65 * 60_000)).toBe('1 h 05 min');
    });
});

describe('formatLocalTime', () => {
    it('shows local time, zone and offset, then UTC', () => {
        // 20:14 UTC, at UTC+1 (getTimezoneOffset() returns -60 there).
        const date = new Date(Date.UTC(2026, 10, 3, 20, 14));
        expect(formatLocalTime(date, 'Europe/Berlin', -60))
            .toBe('2026-11-03 21:14 (Europe/Berlin, UTC+1) · UTC 20:14');
    });

    it('handles a negative offset with minutes and a day boundary', () => {
        // 02:30 UTC on the 4th is 22:00 on the 3rd at UTC-4:30.
        const date = new Date(Date.UTC(2026, 10, 4, 2, 30));
        expect(formatLocalTime(date, 'X/Y', 270))
            .toBe('2026-11-03 22:00 (X/Y, UTC-4:30) · UTC 02:30');
    });
});
