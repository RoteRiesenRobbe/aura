// The content-text rules live in tools/lang/content-text.mjs (keys, slugs,
// notes, the ARB writer), shared with the extract tool. This re-export lets
// validate.mjs import them as './content-text.mjs' from Node, while the
// browser gets the same file at /content-text.mjs (server.mjs serves it).
export * from '../lang/content-text.mjs';
