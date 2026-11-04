/**
 * The bug report's text (plan-bug-report.md D3): pure, so vitest pins it.
 *
 * Plain text in a stable order, `label: value` lines, a missing fact prints
 * `n/a`. The labels stay English in every locale (Q2): this section is for the
 * developers, read like a log. The player's words come first, verbatim.
 */

/** One fact per line. Absent = `n/a`. */
export interface Diagnostics {
    reportId?: string;
    gameVersion?: string;
    localTime?: string;
    browser?: string;
    device?: string;
    screen?: string;
    renderer?: string;
    gpu?: string;
    minimap?: string;
    fpsCheck?: string;
    httpRtt?: string;
    settings?: string;
    character?: string;
    server?: string;
    session?: string;
    /** Already formatted entries, oldest first (ConsoleRing). */
    console: string[];
}

/** The order the lines print in, and their labels. */
const FIELDS: [keyof Omit<Diagnostics, 'console'>, string][] = [
    ['reportId', 'report id'],
    ['gameVersion', 'game version'],
    ['localTime', 'local time'],
    ['browser', 'browser'],
    ['device', 'device'],
    ['screen', 'screen'],
    ['renderer', 'renderer'],
    ['gpu', 'gpu'],
    ['minimap', 'minimap'],
    ['fpsCheck', 'fps check'],
    ['httpRtt', 'http rtt'],
    ['settings', 'settings'],
    ['character', 'character'],
    ['server', 'server'],
    ['session', 'session'],
];

/** `report id:` plus padding: the values line up in one column. */
const LABEL_WIDTH = 16;

function line(label: string, value: string | undefined): string {
    return `${label}:`.padEnd(LABEL_WIDTH) + (value === undefined || value === '' ? 'n/a' : value);
}

export function buildBugReport(message: string, diagnostics: Diagnostics): string {
    const out: string[] = ['== Bug report =='];
    out.push(message.trim() === '' ? '(no message)' : message.replace(/\s+$/, ''));
    out.push('', '== Diagnostics ==');
    for (const [key, label] of FIELDS) {
        out.push(line(label, diagnostics[key]));
    }
    if (diagnostics.console.length === 0) {
        out.push(line('console', 'none'));
    } else {
        out.push(`console (last ${diagnostics.console.length}):`);
        for (const entry of diagnostics.console) {
            out.push(`  ${entry}`);
        }
    }
    return out.join('\n');
}

export interface FrameStats {
    frames: number;
    durationMs: number;
    avgFps: number;
    medianMs: number;
    p95Ms: number;
    worstMs: number;
}

/** The fps check's arithmetic (D5). Null for no frames. */
export function frameStats(deltas: number[]): FrameStats | null {
    if (deltas.length === 0) {
        return null;
    }
    const sorted = [...deltas].sort((a, b) => a - b);
    const durationMs = deltas.reduce((sum, d) => sum + d, 0);
    // Nearest-rank percentiles: an actual frame time, never an interpolation.
    const rank = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
    return {
        frames: deltas.length,
        durationMs,
        avgFps: durationMs > 0 ? deltas.length / (durationMs / 1000) : 0,
        medianMs: rank(0.5),
        p95Ms: rank(0.95),
        worstMs: sorted[sorted.length - 1],
    };
}

/**
 * ⚑ The visibility state is part of the line on purpose (L8): a backgrounded
 * tab is throttled to ~1 fps, and that number must read as such.
 */
export function formatFrameStats(stats: FrameStats | null, visibility: string): string {
    if (!stats) {
        return `n/a (no frames) · tab ${visibility}`;
    }
    const ms = (v: number) => `${Math.round(v)} ms`;
    return `${(stats.durationMs / 1000).toFixed(1)} s · ${stats.frames} frames · avg ${stats.avgFps.toFixed(1)} fps`
        + ` · median ${ms(stats.medianMs)} · p95 ${ms(stats.p95Ms)} · worst ${ms(stats.worstMs)} · tab ${visibility}`;
}

/** World px per meter; the server's unit (BasicConfig PIXEL_PER_METER). */
const PX_PER_METER = 120;

/** The position in meters, and the WARP cheat that takes a developer there. */
export function warpForm(xPx: number, yPx: number): string {
    const m = (v: number) => (v / PX_PER_METER).toFixed(2);
    return `at ${m(xPx)}, ${m(yPx)} (WARP ${Math.round(xPx)} ${Math.round(yPx)})`;
}

/** How long the page has been open: a leak or a slow decay reads differently at 2 min and 3 h. */
export function formatUptime(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 60) {
        return `${s} s`;
    }
    const min = Math.floor(s / 60);
    if (min < 60) {
        return `${min} min`;
    }
    return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

/**
 * `offsetMinutes` is `Date.getTimezoneOffset()`: minutes to ADD to local time
 * to reach UTC, so UTC+1 is -60. Passed in so the test does not depend on the
 * machine's zone.
 */
export function formatLocalTime(date: Date, timeZone: string, offsetMinutes: number): string {
    const two = (n: number) => String(n).padStart(2, '0');
    const local = new Date(date.getTime() - offsetMinutes * 60_000);
    const stamp = (d: Date, withDay: boolean) =>
        (withDay ? `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())} ` : '')
        + `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
    const east = -offsetMinutes;
    const abs = Math.abs(east);
    const offset = `UTC${east < 0 ? '-' : '+'}${Math.floor(abs / 60)}${abs % 60 ? `:${two(abs % 60)}` : ''}`;
    return `${stamp(local, true)} (${timeZone}, ${offset}) · UTC ${stamp(date, false)}`;
}
