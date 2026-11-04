/**
 * The bug report's console buffer (plan-bug-report.md D7): the last few
 * errors and warnings, each flattened to one line.
 *
 * ⚑ L4: installed by the FIRST import in index.ts, so it sees boot and bake
 * errors. That is why this module imports nothing: anything it pulled in
 * would evaluate before the buffer exists.
 *
 * ⚑ Nothing here may call console.error/warn itself: once installed, that
 * would record into the ring it is writing.
 */

const DEFAULT_CAP = 20; // [PLACEHOLDER]
const DEFAULT_MAX_LENGTH = 300; // [PLACEHOLDER]

function flattenOne(arg: unknown): string {
    if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}`;
    }
    if (typeof arg === 'string') {
        return arg;
    }
    if (arg !== null && typeof arg === 'object') {
        try {
            return JSON.stringify(arg);
        } catch {
            return String(arg);
        }
    }
    return String(arg);
}

/** All arguments on one line, whitespace collapsed. */
export function flattenArgs(args: unknown[]): string {
    return args.map(flattenOne).join(' ').replace(/\s+/g, ' ').trim();
}

export class ConsoleRing {
    private readonly items: string[] = [];

    constructor(private readonly cap = DEFAULT_CAP, private readonly maxLength = DEFAULT_MAX_LENGTH) {
    }

    push(level: string, args: unknown[], now = new Date()) {
        const two = (n: number) => String(n).padStart(2, '0');
        const time = `${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`;
        let text = flattenArgs(args);
        if (text.length > this.maxLength) {
            text = text.slice(0, this.maxLength - 1) + '…';
        }
        this.items.push(`[${level} ${time}] ${text}`);
        if (this.items.length > this.cap) {
            this.items.shift();
        }
    }

    /** Oldest first. A copy: the caller may keep it. */
    entries(): string[] {
        return [...this.items];
    }
}

/** The page's one buffer. */
export const consoleRing = new ConsoleRing();

interface RingTarget {
    console: Console;
    addEventListener(type: string, listener: (event: unknown) => void): void;
}

/** Wrap console.error/warn (the originals still run) and hear uncaught errors. */
export function installConsoleRing(target: RingTarget = window as unknown as RingTarget, ring = consoleRing) {
    for (const level of ['error', 'warn'] as const) {
        const original = target.console[level];
        target.console[level] = (...args: unknown[]) => {
            ring.push(level, args);
            original.apply(target.console, args);
        };
    }
    target.addEventListener('error', (event) => {
        const e = event as ErrorEvent;
        ring.push('uncaught', [e.error ?? e.message]);
    });
    target.addEventListener('unhandledrejection', (event) => {
        ring.push('unhandled rejection', [(event as PromiseRejectionEvent).reason]);
    });
}
