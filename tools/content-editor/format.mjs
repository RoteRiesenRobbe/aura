// A JSON pretty-printer that keeps short arrays/objects on one line, closer
// to this repo's hand-authored content style than a flat `JSON.stringify(v,
// null, 2)` (which blows every nested object onto its own set of lines,
// including a trivial two-key `{ "text": ..., "next": ... }` row, and turns
// a one-line save into a whole-file diff).
//
// It is NOT byte-identical to any given hand-authored file — that content
// was typed by hand, not run through one deterministic formatter, so no
// fixed rule reproduces it exactly. This gets close and stays internally
// consistent: an array with more than one element always breaks one item
// per line (matching every `options`/`nodes`/`stages` list in the shipped
// content); a short array/object inlines when it fits and none of its
// children needed to break.
const WIDTH = 100;

export function prettyJson(value) {
  return render(value, '');
}

function render(value, indent) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const isArray = Array.isArray(value);
  const entries = isArray ? value : Object.entries(value);
  if (entries.length === 0) return isArray ? '[]' : '{}';

  const childIndent = indent + '  ';
  const rendered = entries.map((item) =>
    isArray ? render(item, childIndent) : `${JSON.stringify(item[0])}: ${render(item[1], childIndent)}`);

  const anyChildBroke = rendered.some((s) => s.includes('\n'));
  const singleLine = (isArray ? '[ ' : '{ ') + rendered.join(', ') + (isArray ? ' ]' : ' }');
  const fits = indent.length + singleLine.length <= WIDTH;
  const arrayAllowsInline = !isArray || entries.length <= 1;

  if (!anyChildBroke && fits && arrayAllowsInline) return singleLine;

  const open = isArray ? '[' : '{';
  const close = isArray ? ']' : '}';
  const body = rendered.map((s) => childIndent + s).join(',\n');
  return `${open}\n${body}\n${indent}${close}`;
}
