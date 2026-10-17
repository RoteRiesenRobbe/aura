import {afterEach, describe, expect, it, vi} from 'vitest';
import {loadCatalog, PSEUDO_LOCALE, setLocaleForTest, SUPPORTED_LOCALES, t} from './Locale';

// plan-localization.md C8: English is bundled, every other locale's UI catalog
// is its own chunk, loaded once after the locale resolves.

afterEach(() => {
    setLocaleForTest('en');
    vi.restoreAllMocks();
});

describe('UI catalogs on demand (C8)', () => {
    it('a locale whose catalog has not loaded reads English, never a raw key', () => {
        setLocaleForTest('de');
        expect(t('settings.language.heading')).toBe('Language');
    });

    it('English and the pseudo-locale need no load', () => {
        expect(loadCatalog('en')).toBeNull();
        expect(loadCatalog(PSEUDO_LOCALE)).toBeNull();
    });

    it('loads the German catalog once', async () => {
        setLocaleForTest('de');
        await loadCatalog('de');
        expect(t('settings.language.heading')).toBe('Sprache');
        expect(loadCatalog('de')).toBeNull();
    });

    it('every supported locale but English has a loader', () => {
        expect(SUPPORTED_LOCALES[0]).toBe('en');
        expect(SUPPORTED_LOCALES).toContain('de');
    });
});

describe('a failed catalog load (C8, D14)', () => {
    it('degrades to English with one warning', async () => {
        vi.resetModules();
        vi.doMock('./CatalogLoaders', () => ({
            CATALOG_LOADERS: {de: () => Promise.reject(new Error('chunk blocked'))},
        }));
        const fresh = await import('./Locale');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        fresh.setLocaleForTest('de');
        await fresh.loadCatalog('de');
        expect(warn).toHaveBeenCalledTimes(1);
        expect(fresh.locale()).toBe('en');
        expect(fresh.contentLocale()).toBe('en');
        expect(fresh.t('settings.language.heading')).toBe('Language');
        vi.doUnmock('./CatalogLoaders');
    });
});
