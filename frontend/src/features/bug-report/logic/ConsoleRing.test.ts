import {describe, expect, it, vi} from 'vitest';
import {ConsoleRing, flattenArgs, installConsoleRing} from './ConsoleRing';

const at = new Date(2026, 10, 3, 21, 12, 3);

describe('flattenArgs', () => {
    it('joins arguments on one line', () => {
        expect(flattenArgs(['a', 1, true])).toBe('a 1 true');
    });

    it('writes an Error as name: message', () => {
        expect(flattenArgs(['failed:', new TypeError('x is undefined')])).toBe('failed: TypeError: x is undefined');
    });

    it('serializes plain objects, and survives one that cannot be', () => {
        expect(flattenArgs([{a: 1}])).toBe('{"a":1}');
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        expect(flattenArgs([cyclic])).toBe('[object Object]');
    });

    it('collapses newlines and runs of whitespace', () => {
        expect(flattenArgs(['line one\n   line two\ttab'])).toBe('line one line two tab');
    });
});

describe('ConsoleRing', () => {
    it('stamps level and local time', () => {
        const ring = new ConsoleRing();
        ring.push('error', ['boom'], at);
        expect(ring.entries()).toEqual(['[error 21:12:03] boom']);
    });

    it('keeps only the last `cap` entries, oldest first', () => {
        const ring = new ConsoleRing(3);
        for (let i = 1; i <= 5; i++) {
            ring.push('warn', [`n${i}`], at);
        }
        expect(ring.entries().map(e => e.split('] ')[1])).toEqual(['n3', 'n4', 'n5']);
    });

    it('truncates a long entry', () => {
        const ring = new ConsoleRing(20, 10);
        ring.push('error', ['0123456789abcdef'], at);
        expect(ring.entries()[0]).toBe('[error 21:12:03] 012345678…');
    });
});

describe('installConsoleRing', () => {
    function fakeTarget() {
        const listeners: Record<string, (event: unknown) => void> = {};
        const error = vi.fn();
        const warn = vi.fn();
        return {
            listeners, error, warn,
            target: {
                console: {error, warn} as unknown as Console,
                addEventListener: (type: string, fn: (event: unknown) => void) => {
                    listeners[type] = fn;
                },
            },
        };
    }

    it('records console.error and console.warn and still calls the originals', () => {
        const fake = fakeTarget();
        const ring = new ConsoleRing();
        installConsoleRing(fake.target, ring);

        fake.target.console.error('bad', 2);
        fake.target.console.warn('meh');

        expect(fake.error).toHaveBeenCalledWith('bad', 2);
        expect(fake.warn).toHaveBeenCalledWith('meh');
        expect(ring.entries().map(e => e.replace(/ \d\d:\d\d:\d\d/, ''))).toEqual(['[error] bad 2', '[warn] meh']);
    });

    it('records uncaught errors and unhandled rejections', () => {
        const fake = fakeTarget();
        const ring = new ConsoleRing();
        installConsoleRing(fake.target, ring);

        fake.listeners.error({message: 'Uncaught ReferenceError: foo', error: new ReferenceError('foo')});
        fake.listeners.unhandledrejection({reason: new Error('nope')});

        expect(ring.entries().map(e => e.replace(/ \d\d:\d\d:\d\d/, ''))).toEqual([
            '[uncaught] ReferenceError: foo',
            '[unhandled rejection] Error: nope',
        ]);
    });
});
