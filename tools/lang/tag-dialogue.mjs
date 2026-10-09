#!/usr/bin/env node
// tag-dialogue.mjs — give every dialogue string a stable id (plan-localization.md
// D20, the Yarn Spinner "Add Line Tags" pattern). Nobody types an id.
//
//   node tools/lang/tag-dialogue.mjs          # tag api/mobs/**/*.json in place
//   node tools/lang/tag-dialogue.mjs --check  # exit 1 if any string lacks an id
//
// What gets an id, inside each file's `interaction`:
//   - every node line and ambient line: "text" becomes {"id": "a1b2c3", "text": "text"}
//   - every option object, and every grant object that carries a `line`: "id" is
//     inserted as its first key.
// ⚑ FORMAT-PRESERVING: the file is edited as text at the exact token offsets,
// never re-serialized, so a tagged file differs from the original by the ids
// alone. An existing id is never changed (that would cut the line from its
// German). Ids are 6 hex characters, unique across all content.
import {readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join, dirname, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const mobsDir = join(root, 'api', 'mobs');
const check = process.argv.includes('--check');

function files(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...files(full));
        else if (name.endsWith('.json')) out.push(full);
    }
    return out;
}

// A minimal JSON parser that records every value's [start, end) offset and
// its path, so edits can be made at token positions.
function parseWithSpans(text) {
    let i = 0;
    const spans = [];
    const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
    const value = (path) => {
        ws();
        const start = i;
        let v;
        const c = text[i];
        if (c === '{') {
            i++;
            v = {};
            const objStart = start;
            ws();
            if (text[i] === '}') { i++; }
            else {
                for (;;) {
                    ws();
                    const key = string();
                    ws();
                    i++; // :
                    v[key] = value(path.concat(key));
                    ws();
                    if (text[i] === ',') { i++; continue; }
                    i++; // }
                    break;
                }
            }
            spans.push({path, start: objStart, end: i, kind: 'object', v});
            return v;
        }
        if (c === '[') {
            i++;
            v = [];
            ws();
            if (text[i] === ']') { i++; }
            else {
                for (let k = 0; ; k++) {
                    v.push(value(path.concat(k)));
                    ws();
                    if (text[i] === ',') { i++; continue; }
                    i++; // ]
                    break;
                }
            }
            spans.push({path, start, end: i, kind: 'array', v});
            return v;
        }
        if (c === '"') {
            v = string();
            spans.push({path, start, end: i, kind: 'string', v});
            return v;
        }
        const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i));
        i += m[0].length;
        v = JSON.parse(m[0]);
        spans.push({path, start, end: i, kind: 'literal', v});
        return v;
    };
    const string = () => {
        const start = i;
        i++;
        while (text[i] !== '"') { if (text[i] === '\\') i++; i++; }
        i++;
        return JSON.parse(text.slice(start, i));
    };
    const v = value([]);
    return {v, spans};
}

const used = new Set();
const all = files(mobsDir);
const parsed = all.map(f => {
    const text = readFileSync(f, 'utf8');
    return {f, text, ...parseWithSpans(text)};
});
// Collect the ids already in use, across every file, before minting any.
for (const p of parsed) {
    for (const s of p.spans) {
        if (s.kind === 'object' && typeof s.v.id === 'string' && s.path.includes('interaction')) used.add(s.v.id);
    }
}
const mint = () => {
    for (;;) {
        const id = randomBytes(3).toString('hex');
        if (!used.has(id)) { used.add(id); return id; }
    }
};

const isLine = (path) => {
    const n = path.length;
    return path[0] === 'interaction' && typeof path[n - 1] === 'number'
        && (path[n - 2] === 'lines' || path[n - 2] === 'ambient');
};
const isOption = (path) => path[0] === 'interaction' && typeof path[path.length - 1] === 'number' && path[path.length - 2] === 'options';
const isGrant = (path) => path[0] === 'interaction' && typeof path[path.length - 1] === 'number' && path[path.length - 2] === 'grants';

let missing = 0;
let tagged = 0;
for (const p of parsed) {
    const edits = [];
    for (const s of p.spans) {
        if (s.kind === 'string' && isLine(s.path)) {
            missing++;
            edits.push({start: s.start, end: s.end, text: `{"id": "${mint()}", "text": ${p.text.slice(s.start, s.end)}}`});
        } else if (s.kind === 'object' && (isOption(s.path) || (isGrant(s.path) && typeof s.v.line === 'string')) && typeof s.v.id !== 'string') {
            missing++;
            // Insert right after "{", matching the object's own spacing style.
            const after = p.text.slice(s.start + 1, s.end);
            const nl = /^\s*\n(\s*)/.exec(after);
            const insert = nl ? `\n${nl[1]}"id": "${mint()}",` : ` "id": "${mint()}",`;
            edits.push({start: s.start + 1, end: s.start + 1, text: insert});
        }
    }
    if (check || edits.length === 0) continue;
    edits.sort((a, b) => b.start - a.start);
    let out = p.text;
    for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
    JSON.parse(out); // never write a file that does not parse
    writeFileSync(p.f, out);
    tagged += edits.length;
    console.log(`${relative(root, p.f)}: ${edits.length} id(s)`);
}
if (check) {
    if (missing) {
        console.error(`${missing} dialogue string(s) without an id; run node tools/lang/tag-dialogue.mjs`);
        process.exit(1);
    }
    console.log('every dialogue string has an id');
} else {
    console.log(`${tagged} id(s) added`);
}
