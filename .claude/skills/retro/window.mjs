#!/usr/bin/env node
// Check retro incidents against the real transcripts (grep chokes on their
// long lines). Two modes; all times are UTC, as in the transcripts.
//
//   Window: everything said and run in one session between two times.
//     node .claude/skills/retro/window.mjs --session <id prefix> --from 18:12 --to 18:20 [--day 2026-10-11]
//
//   Commands: every tool call matching a regex since a date, across sessions,
//   e.g. to prove a rule held ("did anyone stage a directory after the fix?").
//     node .claude/skills/retro/window.mjs --grep 'git add' --since 2026-10-18T01:05
//
// Subagent turns are skipped in both modes. [--dir <transcript dir>] as in digest.mjs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const dir = args.dir ?? path.join(os.homedir(), '.claude/projects', process.cwd().replaceAll('/', '-'));

function* entries(file) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line) continue;
        let o;
        try { o = JSON.parse(line); } catch { continue; }
        if (!o.isSidechain && o.timestamp && o.message?.content) yield o;
    }
}
const partsOf = (c) => (typeof c === 'string' ? [{ type: 'text', text: c }] : c);
const inputOf = (p) => p.input?.command ?? JSON.stringify(p.input);

if (args.session) {
    const file = fs.readdirSync(dir).find((f) => f.startsWith(args.session) && f.endsWith('.jsonl'));
    if (!file) { console.error(`no session ${args.session} in ${dir}`); process.exit(1); }
    const from = args.from ?? '00:00', to = args.to ?? '23:59';
    for (const o of entries(path.join(dir, file))) {
        const t = o.timestamp.slice(11, 16);
        if ((args.day && !o.timestamp.startsWith(args.day)) || t < from || t > to) continue;
        for (const p of partsOf(o.message.content)) {
            if (p.type === 'text') console.log(`[${t} ${o.type}] ${p.text.slice(0, 1500)}`);
            else if (p.type === 'tool_use') console.log(`[${t} TOOL ${p.name}] ${inputOf(p).slice(0, 400)}`);
            else if (p.type === 'tool_result') {
                const s = typeof p.content === 'string' ? p.content : JSON.stringify(p.content);
                console.log(`[${t} RESULT] ${s.slice(0, 400)}`);
            }
        }
    }
} else if (args.grep) {
    const re = new RegExp(args.grep);
    const since = args.since ?? '0000';
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
        for (const o of entries(path.join(dir, file))) {
            if (o.type !== 'assistant' || o.timestamp < since) continue;
            for (const p of partsOf(o.message.content)) {
                if (p.type === 'tool_use' && re.test(inputOf(p))) {
                    console.log(`${file.slice(0, 8)} ${o.timestamp.slice(0, 16)} ${p.name}: ${inputOf(p).replace(/\s+/g, ' ').slice(0, 300)}`);
                }
            }
        }
    }
} else {
    console.error('usage: window.mjs --session <prefix> [--from HH:MM] [--to HH:MM] [--day YYYY-MM-DD]\n       window.mjs --grep <regex> [--since <ISO>]');
    process.exit(2);
}
