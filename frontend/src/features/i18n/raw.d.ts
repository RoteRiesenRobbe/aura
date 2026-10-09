// `?raw` imports (webpack's `asset/source` rule, vitest natively) arrive as
// the file's text. The ARB catalogs load this way (plan-localization.md C0a).
declare module '*?raw' {
    const content: string;
    export default content;
}
