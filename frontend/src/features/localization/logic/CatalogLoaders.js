// The UI catalogs loaded on demand (plan-localization.md C8): one entry per
// locale besides English, each a content-hashed chunk of its own. English is
// bundled by Locale.ts and needs no entry.
//
// Plain JS on purpose: tsconfig compiles TypeScript to CommonJS, which turns
// an `import()` into a synchronous `require()` and webpack then bundles the
// catalog into the main chunk. Webpack parses this file itself, so the
// `import()` stays a split point. A new locale is one line here (and its
// folder under src/lang/); SUPPORTED_LOCALES derives from this map.
export const CATALOG_LOADERS = {
	de: function () {
		return import(/* webpackChunkName: "lang-de" */ '../../../lang/de/frontend.arb?raw');
	},
};
