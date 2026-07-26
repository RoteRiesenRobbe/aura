import {defineConfig} from 'vitest/config';

// The first JS test infra in this repo (round-4 tooltip fix). Deliberately
// minimal: no coverage thresholds, no global injection — tests import
// {describe, it, expect} explicitly so tsconfig's `types` array stays
// untouched and `npm run typecheck` keeps working unchanged.
//
// jsdom, not node: the client's module graph reaches window at import time
// (Urls.ts derives the catalog host from window.location, PixiJS wants a
// document), so even a pure-formatting unit needs a browser-shaped global.
export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.ts'],
        setupFiles: ['./vitest.setup.ts'],
    },
});
