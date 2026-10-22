#!/usr/bin/env node
// Condense this repo's Claude Code session transcripts into a retro digest:
// per session, every message the PO typed, the tail of the assistant text it
// answered, plus interrupts and rejected tool calls. Subagent transcripts are
// skipped (the PO never talks to them).
//
//   node .claude/skills/retro/digest.mjs --since 2026-10-01 [--until 2026-10-22] [--out file.md] [--exclude <id prefix>]
//
// --since/--until compare against each session's LAST timestamp, so a session
// that started before the window but continued into it is included.
// --exclude drops one session (the running retro itself). All times are UTC.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
if (!args.since) {
    console.error('usage: digest.mjs --since <ISO date> [--until <ISO date>] [--out <file>] [--dir <transcript dir>]');
    process.exit(2);
}
const since = new Date(args.since);
const until = args.until ? new Date(args.until) : new Date('9999-01-01');
const dir = args.dir ?? path.join(os.homedir(), '.claude/projects', process.cwd().replaceAll('/', '-'));

const CONTEXT_CHARS = 500; // assistant text kept before each PO message
const PO_CHARS = 2000; // a pasted log can be huge; the opening carries the point

const clip = (s, n, tail = false) =>
    s.length <= n ? s : tail ? '…' + s.slice(s.length - n) : s.slice(0, n) + '…';
const oneLine = (s) => s.replace(/\s+/g, ' ').trim();

function textOf(content) {
    if (typeof content === 'string') return content;
    return content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

function digestSession(file) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    let first = null, last = null, lastAssistant = '';
    const events = [];
    for (const line of lines) {
        if (!line) continue;
        let o;
        try { o = JSON.parse(line); } catch { continue; }
        if (o.isSidechain) continue;
        if (o.timestamp) { first ??= o.timestamp; last = o.timestamp; }
        if (o.type === 'assistant') {
            const t = textOf(o.message?.content ?? []);
            if (t.trim()) lastAssistant = t;
            continue;
        }
        if (o.type !== 'user') continue;
        const content = o.message?.content ?? '';
        if (o.origin?.kind === 'human') {
            let t = textOf(content);
            const cmd = t.match(/<command-name>([^<]*)<\/command-name>/);
            const cmdArgs = t.match(/<command-args>([\s\S]*?)<\/command-args>/);
            if (cmd) t = `${cmd[1]} ${cmdArgs?.[1] ?? ''}`.trim();
            const images = Array.isArray(content) ? content.filter((c) => c.type === 'image').length : 0;
            events.push({
                kind: 'PO',
                at: o.timestamp,
                text: clip(t.trim(), PO_CHARS) + (images ? ` [+${images} image(s)]` : ''),
                before: lastAssistant ? clip(oneLine(lastAssistant), CONTEXT_CHARS, true) : '',
            });
            continue;
        }
        const raw = typeof content === 'string' ? content : JSON.stringify(content);
        if (raw.includes('[Request interrupted by user')) {
            events.push({ kind: 'INTERRUPT', at: o.timestamp, before: clip(oneLine(lastAssistant), CONTEXT_CHARS, true) });
        } else if (raw.includes("The user doesn't want to proceed with this tool use")) {
            const reason = raw.match(/the user said:\\n([^"]*)/);
            events.push({ kind: 'REJECTED TOOL CALL', at: o.timestamp, text: reason ? clip(reason[1].replace(/\\n/g, ' '), 400) : '' });
        }
    }
    return { first, last, events };
}

const sessions = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl') && !(args.exclude && f.startsWith(args.exclude)))
    .map((f) => ({ id: f.slice(0, -6), ...digestSession(path.join(dir, f)) }))
    .filter((s) => s.last && new Date(s.last) >= since && new Date(s.first) <= until && s.events.some((e) => e.kind === 'PO'))
    .sort((a, b) => a.first.localeCompare(b.first));

let out = `# Retro digest ${args.since} → ${args.until ?? 'now'}\n\n${sessions.length} session(s) from ${dir}\n`;
for (const s of sessions) {
    const counts = s.events.reduce((m, e) => ((m[e.kind] = (m[e.kind] ?? 0) + 1), m), {});
    out += `\n\n## Session ${s.id} (${s.first.slice(0, 16)} → ${s.last.slice(0, 16)} UTC) ${JSON.stringify(counts)}\n`;
    for (const e of s.events) {
        out += `\n### ${e.kind} ${e.at?.slice(11, 16) ?? ''}\n`;
        if (e.before) out += `> assistant before: ${e.before}\n\n`;
        if (e.text) out += `${e.text}\n`;
    }
}

if (args.out) {
    fs.writeFileSync(args.out, out);
    console.log(`${sessions.length} sessions, ${Math.round(out.length / 1024)} KB → ${args.out}`);
} else {
    process.stdout.write(out);
}
