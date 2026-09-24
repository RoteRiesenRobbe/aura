#!/usr/bin/env node
/**
 * Asset tracker — renders docs/art/assets.md from docs/art/assets.csv.
 *
 * ⭐ THE CSV IS THE SOURCE OF TRUTH. It imports into Google Sheets directly
 * (File → Import → Upload) with no tooling, which is the whole point: the
 * tracker is shared with artists and musicians who do not read markdown and do
 * not have the repo. The .md is a GENERATED reading view for the repo — never
 * edit it, your change is overwritten on the next run.
 *
 * Round-trip: export the Sheet back as CSV, drop it in place, re-run this. The
 * column set is fixed (COLS below) so a Sheets export lands byte-compatible as
 * long as nobody adds or reorders columns.
 *
 *   node tools/asset-tracker.mjs            # regenerate docs/art/assets.md
 *   node tools/asset-tracker.mjs --check    # exit 1 if the .md is stale
 *   node tools/asset-tracker.mjs --stats    # print the summary only
 */

import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV = path.join(ROOT, 'docs/art/assets.csv');
const MD = path.join(ROOT, 'docs/art/assets.md');

const COLS = ['id', 'kind', 'category', 'subcategory', 'name', 'zone', 'current_file', 'state',
    'priority', 'placements', 'size_px', 'format', 'target_path', 'constraints', 'owner', 'status', 'notes'];

/** States an asset row may be in. Anything else is a typo and fails the run. */
const STATES = {
    drawn: 'has its own art today',
    shared: '⚠ renders using another entity\'s art — needs its own to exist as a distinct thing',
    placeholder: 'a placeholder file ships; it is not the real thing',
    stock: 'a stock/borrowed texture stands in (the pd* set)',
    missing: 'nothing exists',
    code: 'drawn procedurally in code, no art file',
    blocked: 'cannot be delivered until engine work lands',
    'n/a': 'a constraint or a number to judge, not a file to draw',
};
const PRIORITIES = {
    P0: 'do first — highest placement count, or flagged ⭐ as unusually high stakes',
    P1: 'high — shared art, or 20+ placements, or a named gameplay gap',
    P2: 'normal — placed but not everywhere',
    P3: 'low — unplaced, deferred, or already fine',
};

// --- CSV ------------------------------------------------------------------

/** RFC4180 parse. Sheets exports quoted fields with doubled quotes; so do we. */
function parseCsv(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
            } else field += c;
            continue;
        }
        if (c === '"') { quoted = true; continue; }
        if (c === ',') { row.push(field); field = ''; continue; }
        if (c === '\r') continue;
        if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
        field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.length > 1 || r[0] !== '');
}

function load() {
    const rows = parseCsv(fs.readFileSync(CSV, 'utf8'));
    const header = rows.shift();
    const missing = COLS.filter(c => !header.includes(c));
    const extra = header.filter(c => !COLS.includes(c));
    if (missing.length || extra.length) {
        fail(`column mismatch in assets.csv\n  missing: ${missing.join(', ') || '(none)'}\n  unexpected: ${extra.join(', ') || '(none)'}\n` +
            `  A Sheets export must keep the column set and order intact.`);
    }
    return rows.map((cells, n) => {
        const r = {};
        header.forEach((h, i) => r[h] = (cells[i] ?? '').trim());
        r._line = n + 2;
        return r;
    });
}

function fail(msg) {
    console.error('asset-tracker: ' + msg);
    process.exit(1);
}

function validate(rows) {
    const errors = [];
    const seen = new Map();
    for (const r of rows) {
        if (!r.id) errors.push(`line ${r._line}: empty id`);
        if (seen.has(r.id)) errors.push(`line ${r._line}: duplicate id "${r.id}" (first seen line ${seen.get(r.id)})`);
        seen.set(r.id, r._line);
        if (!r.name) errors.push(`line ${r._line}: empty name`);
        if (!STATES[r.state]) errors.push(`line ${r._line} (${r.id}): unknown state "${r.state}" — one of ${Object.keys(STATES).join(', ')}`);
        if (!PRIORITIES[r.priority]) errors.push(`line ${r._line} (${r.id}): unknown priority "${r.priority}" — one of ${Object.keys(PRIORITIES).join(', ')}`);
    }
    if (errors.length) fail('assets.csv has ' + errors.length + ' problem(s):\n  ' + errors.join('\n  '));
}

// --- render ---------------------------------------------------------------

const STATE_MARK = {
    drawn: '✅', shared: '⚠️', placeholder: '🟡', stock: '🟡',
    missing: '❌', code: '⚙️', blocked: '⛔', 'n/a': '—',
};

function esc(s) {
    return String(s ?? '').replace(/\|/g, '\\|');
}

function countBy(rows, key) {
    const m = new Map();
    for (const r of rows) m.set(r[key], (m.get(r[key]) || 0) + 1);
    return m;
}

function render(rows) {
    const out = [];
    const p = s => out.push(s);
    const today = new Date().toISOString().slice(0, 10);

    p('# Asset tracker — art, animation, audio');
    p('');
    p('> ⛔ **GENERATED FILE — do not edit.** The source of truth is');
    p('> [`assets.csv`](assets.csv); this view is rebuilt by');
    p('> `node tools/asset-tracker.mjs`. Edit the CSV, or edit the Google Sheet and');
    p('> export it back over the CSV.');
    p('');
    p('> ⚑ **`current_file` and `format` DRIFT, and nothing here catches it.**');
    p('> Both columns are hand-typed and are never checked against disk, so when art');
    p('> is repainted the tracker keeps naming the old file. Found 2026-09-24:');
    p('> **25 rows still said `.svg` / `SVG`** — Tree, Boulder, Rock, 13 mobs,');
    p('> Campfire + Camp and 7 NPCs — a month after the painted PNGs landed');
    p('> (`abe150ac`, 2026-08-21). Corrected the same day against the real load');
    p('> paths (`client-data/Graphics.ts` and `api/props/*.json` `sprite`), not');
    p('> against "a .png exists next to it".');
    p('>');
    p('> ⭐ **Next iteration: make this checkable.** The audit is mechanical — parse');
    p('> `Graphics.ts` + `api/props/*.json`, compare to `current_file`, fail');
    p('> `--check` on a mismatch. Until that exists, **re-audit these two columns by');
    p('> hand after any art commit**, and treat a `.svg` in a row whose art you know');
    p('> is painted as stale rather than as fact.');
    p('');
    p('**To share with an artist or musician:** Google Sheets → File → Import →');
    p('Upload → `assets.csv` → *Replace current sheet*. Freeze the header row, filter');
    p('on `kind` / `priority` / `state`, and hand over the tab. The `owner` and');
    p('`status` columns are deliberately empty for them to fill.');
    p('');
    p('The brief every row is judged against — the Portrait Rule, tone, scale, and the');
    p('rendering constraints new art must survive — lives in [`README.md`](README.md).');
    p('How a file becomes a sprite: [`pipeline.md`](pipeline.md).');
    p('');
    p(`Rendered ${today} from ${rows.length} rows.`);
    p('');
    p('---');
    p('');

    // summary
    p('## Where the work is');
    p('');
    const byKind = countBy(rows, 'kind');
    const byState = countBy(rows, 'state');
    const byPrio = countBy(rows, 'priority');

    p('| Kind | Rows |');
    p('| --- | ---: |');
    [...byKind].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => p(`| ${k} | ${n} |`));
    p('');
    p('| State | Rows | Means |');
    p('| --- | ---: | --- |');
    Object.keys(STATES).forEach(s => {
        if (byState.get(s)) p(`| ${STATE_MARK[s]} ${s} | ${byState.get(s)} | ${esc(STATES[s])} |`);
    });
    p('');
    p('| Priority | Rows | Rule |');
    p('| --- | ---: | --- |');
    Object.keys(PRIORITIES).forEach(k => {
        if (byPrio.get(k)) p(`| **${k}** | ${byPrio.get(k)} | ${esc(PRIORITIES[k])} |`);
    });
    p('');

    // the actionable shortlist
    const todo = rows.filter(r => ['missing', 'shared', 'placeholder', 'stock', 'blocked'].includes(r.state));
    const p0 = todo.filter(r => r.priority === 'P0');
    p(`**${todo.length} rows need work** (missing, shared, placeholder, stock or blocked),`);
    p(`of which **${p0.length} are P0**:`);
    p('');
    p('| | Asset | Kind | State | Why it matters |');
    p('| --- | --- | --- | --- | --- |');
    p0.forEach(r => p(`| ${STATE_MARK[r.state]} | **${esc(r.name)}** | ${esc(r.category)} | ${esc(r.state)} | ${esc(r.notes)} |`));
    p('');
    p('---');
    p('');

    // full listing
    p('## Full listing');
    p('');
    const kinds = [...new Set(rows.map(r => r.kind))];
    for (const kind of kinds) {
        p(`# ${kind}`);
        p('');
        const inKind = rows.filter(r => r.kind === kind);
        const cats = [...new Set(inKind.map(r => r.category))];
        for (const cat of cats) {
            const inCat = inKind.filter(r => r.category === cat);
            p(`## ${cat} — ${inCat.length}`);
            p('');
            p('| | Name | Current | Pri | # | Size | Where / notes |');
            p('| --- | --- | --- | --- | ---: | --- | --- |');
            for (const r of inCat) {
                const where = [r.zone, r.notes].filter(Boolean).join(' — ');
                p(`| ${STATE_MARK[r.state]} | **${esc(r.name)}** | ${r.current_file ? '`' + esc(r.current_file) + '`' : '—'} | ${r.priority} | ${esc(r.placements)} | ${esc(r.size_px)} | ${esc(where)} |`);
            }
            p('');
        }
    }

    p('---');
    p('');
    p('## Columns');
    p('');
    p('| Column | What it is |');
    p('| --- | --- |');
    p('| `id` | Stable key. Never reuse or renumber — the Sheet is matched back on this. |');
    p('| `kind` | Art · Animation · Audio · Constraint. The top-level filter. |');
    p('| `category` | Mob, NPC, Prop, Terrain profile, Atmosphere, Music, SFX, … |');
    p('| `subcategory` | The grouping inside a category (e.g. *Animal — canine*). |');
    p('| `name` | What the thing is called in the game. |');
    p('| `zone` | Where it appears, when that is the point. |');
    p('| `current_file` | What renders it today, if anything. |');
    p('| `state` | See the state table above. |');
    p('| `priority` | See the priority table above. |');
    p('| `placements` | How many sit in the live world. The honest measure of how often a player looks at it. |');
    p('| `size_px` | On-screen pixels at zoom 1. ⚠️ `Graphics.ts` stores *half* these. |');
    p('| `format` | SVG · PNG · MP3. Painted work ships as PNG (see `pipeline.md` §3). |');
    p('| `target_path` | Where the delivered file lands in the repo. |');
    p('| `constraints` | What the art must survive — see `README.md` for each one in full. |');
    p('| `owner` | **For the artist to fill.** |');
    p('| `status` | **For the artist to fill** — todo / wip / review / done. |');
    p('| `notes` | Identity and intent: what it *is*, not what it looks like. |');

    return out.join('\n') + '\n';
}

// --- main -----------------------------------------------------------------

const rows = load();
validate(rows);
const md = render(rows);

if (process.argv.includes('--stats')) {
    console.log(`${rows.length} rows`);
    [...countBy(rows, 'kind')].forEach(([k, n]) => console.log(`  ${k}: ${n}`));
    [...countBy(rows, 'state')].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${k}: ${n}`));
    process.exit(0);
}

if (process.argv.includes('--check')) {
    const current = fs.existsSync(MD) ? fs.readFileSync(MD, 'utf8') : '';
    // The render stamps today's date, so compare everything but that line.
    const strip = s => s.replace(/^Rendered \d{4}-\d{2}-\d{2} from .*$/m, '');
    if (strip(current) !== strip(md)) {
        fail('docs/art/assets.md is stale — run `node tools/asset-tracker.mjs`');
    }
    console.log('asset-tracker: assets.md is up to date (' + rows.length + ' rows)');
    process.exit(0);
}

fs.writeFileSync(MD, md, 'utf8');
console.log(`asset-tracker: wrote docs/art/assets.md (${rows.length} rows)`);
