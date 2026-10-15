import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {
    declarePageLanguage,
    formatList,
    formatNumber,
    loadCatalog,
    negotiate,
    PSEUDO_LOCALE,
    pseudo,
    readableFallback,
    resolveLocale,
    setLocaleForTest,
    t,
    tKey,
    tParts,
} from './Locale';

beforeAll(() => loadCatalog('de'));
afterEach(() => setLocaleForTest('en'));

describe('negotiate (D2 amendment (a))', () => {
    it('truncates de-AT to de', () => {
        expect(negotiate(['de-AT'])).toBe('de');
    });
    it('walks the whole preference list', () => {
        expect(negotiate(['fr-FR', 'fr', 'de-CH', 'en'])).toBe('de');
    });
    it('answers null when nothing is supported', () => {
        expect(negotiate(['fr', 'ja-JP'])).toBeNull();
    });
});

describe('resolveLocale', () => {
    it('defaults to en while detection is off (Q3)', () => {
        expect(resolveLocale(null, ['de-DE'], false)).toBe('en');
    });
    it('a stored choice wins', () => {
        expect(resolveLocale('de', ['en-US'], false)).toBe('de');
    });
    it('detects when detection is on', () => {
        expect(resolveLocale(null, ['de-AT', 'en'], true)).toBe('de');
    });
    it('the pseudo-locale is chosen only by an explicit pin (D21)', () => {
        expect(resolveLocale(PSEUDO_LOCALE, [], false)).toBe(PSEUDO_LOCALE);
        expect(resolveLocale(null, [PSEUDO_LOCALE], true)).toBe('en');
    });
    it('an unknown stored value falls back to en', () => {
        expect(resolveLocale('xx', [], false)).toBe('en');
    });
});

describe('t()', () => {
    it('formats the en message', () => {
        expect(t('settings.language.heading')).toBe('Language');
    });
    it('formats the de message', () => {
        setLocaleForTest('de');
        expect(t('settings.language.heading')).toBe('Sprache');
    });
    it('degrades an unknown key readable, never blank (D14)', () => {
        expect(t('noSuchKey', {mob: 'Wolf', n: 3})).toBe('noSuchKey (Wolf, 3)');
        expect(readableFallback('k')).toBe('k');
    });
    it('a runtime key with no template shows the server English first (D14 (1))', () => {
        expect(tKey('noSuchKey', {a: 1}, 'Server English')).toBe('Server English');
        expect(tKey('noSuchKey', {a: 1}, '')).toBe('noSuchKey (1)');
    });
    it('pseudo-localizes every message (D21)', () => {
        setLocaleForTest(PSEUDO_LOCALE);
        const text = t('settings.language.heading');
        expect(text.charAt(0)).toBe('[');
        expect(text).not.toMatch(/[A-Za-z]/);
    });
    it('formats rich-text tags to nodes, never innerHTML', () => {
        const nodes = tParts('settings.language.heading', {}, {});
        expect(nodes.map(n => n.textContent).join('')).toBe('Language');
    });
});

describe('pseudo', () => {
    it('accents, pads ~35 % and brackets', () => {
        const out = pseudo('Hello');
        expect(out).toBe('[Ĥéļļó··]');
    });
    it('leaves the empty string alone', () => {
        expect(pseudo('')).toBe('');
    });
});

describe('Intl formatting (D16)', () => {
    it('de gets its decimal comma and grouping', () => {
        setLocaleForTest('de');
        expect(formatNumber(1500)).toBe('1.500');
        expect(formatNumber(12.5)).toBe('12,5');
    });
    it('de joins lists with und', () => {
        setLocaleForTest('de');
        expect(formatList(['A', 'B', 'C'])).toBe('A, B und C');
        setLocaleForTest('en');
        expect(formatList(['A', 'B', 'C'])).toBe('A, B, and C');
    });
});

describe('the page language', () => {
    it('declares lang and opts out of auto-translate', () => {
        setLocaleForTest('de');
        declarePageLanguage(document);
        expect(document.documentElement.lang).toBe('de');
        expect(document.documentElement.getAttribute('translate')).toBe('no');
    });
});

// L21 (C5b): the pseudo-locale marks the TEXT of a plural branch, because it
// runs on the formatted message; the syntax never reaches it.
describe('pseudo inside plural branches (L21)', () => {
    it('accents the chosen branch of a plural message', () => {
        setLocaleForTest(PSEUDO_LOCALE);
        try {
            expect(t('journal.objective.kill', {n: 3, m: 8, mob: 'Wolves'})).toMatch(/^\[3\/8 Ŵóļṽéš šļáíñ·+\]$/);
        } finally {
            setLocaleForTest('en');
        }
    });
});
