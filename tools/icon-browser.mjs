/**
 * A local browser for the PONETI "6000 Fantasy Icons" pack: every PNG in one
 * scrollable grid, with text search, folder dropdowns, a background filter and
 * a marker on the icons pack-manifest.json already uses. Click an icon for a
 * large preview and a ready-to-paste manifest path.
 *
 *   node tools/icon-browser.mjs            # then open http://localhost:4620
 *   PORT=4700 node tools/icon-browser.mjs
 *
 * ⛔ Seat holder only, like the packer: it reads the pack from
 * AURA_ICON_PACK_DIR (exported, or read from backend/.env.local) and serves it
 * on 127.0.0.1 only. Never publish this page or its images anywhere: the
 * licence allows the art only embedded in the build (THIRD_PARTY.md).
 */
import {createServer} from 'node:http';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {ENV_PACK_DIR, ROOT, readManifest, resolvePackDir} from './icon-pack-common.mjs';

const PORT = Number(process.env.PORT) || 4620;

/** The pack dir from the environment, else from backend/.env.local (the seat
 *  holder's usual place for it, which a plain shell has not sourced). */
function packDirFromEnv() {
    if (process.env[ENV_PACK_DIR]) {
        return resolvePackDir();
    }
    const envFile = path.join(ROOT, 'backend/.env.local');
    if (existsSync(envFile)) {
        const match = readFileSync(envFile, 'utf8').match(new RegExp(`^\\s*(?:export\\s+)?${ENV_PACK_DIR}=["']?([^"'\\n]+)`, 'm'));
        if (match) {
            return resolvePackDir(match[1].trim());
        }
    }
    return resolvePackDir();
}

function listPngs(dir, base = dir, out = []) {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            listPngs(full, base, out);
        } else if (entry.name.toLowerCase().endsWith('.png')) {
            out.push(path.relative(base, full).split(path.sep).join('/'));
        }
    }
    return out;
}

const packDir = packDirFromEnv();
const files = listPngs(packDir).sort((a, b) => a.localeCompare(b, 'en', {numeric: true}));

// Manifest path -> the game-facing names using it.
const used = {};
for (const {name, file} of readManifest()) {
    (used[file] ||= []).push(name);
}
const index = JSON.stringify({files, used});

const server = createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === '/') {
        res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
        res.end(PAGE);
    } else if (url.pathname === '/index.json') {
        res.writeHead(200, {'content-type': 'application/json'});
        res.end(index);
    } else if (url.pathname.startsWith('/png/')) {
        const rel = decodeURIComponent(url.pathname.slice('/png/'.length));
        const full = path.resolve(packDir, rel);
        if (!full.startsWith(packDir + path.sep) || !full.toLowerCase().endsWith('.png') || !existsSync(full)) {
            res.writeHead(404);
            res.end();
            return;
        }
        res.writeHead(200, {'content-type': 'image/png', 'cache-control': 'max-age=86400'});
        res.end(readFileSync(full));
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`icon-browser: ${files.length} icons from ${packDir}`);
    console.log(`icon-browser: http://localhost:${PORT}`);
});

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PONETI Icons</title>
<style>
:root { --bg:#1b1916; --panel:#26231f; --line:#3b362f; --text:#e9e2d4; --dim:#9a917f; --accent:#d9a441; --used:#6fbf73; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:14px/1.4 system-ui, sans-serif; }
header { position:sticky; top:0; z-index:2; background:var(--panel); border-bottom:1px solid var(--line);
  padding:10px 16px; display:flex; flex-wrap:wrap; gap:8px 12px; align-items:center; }
header h1 { font-size:15px; margin:0 8px 0 0; color:var(--accent); }
input, select { background:var(--bg); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:5px 8px; font:inherit; }
input[type=search] { width:min(320px, 100%); }
label { color:var(--dim); display:flex; gap:6px; align-items:center; }
#count { margin-left:auto; color:var(--dim); }
#grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(var(--cell), 1fr)); gap:6px; padding:12px 16px; }
.cell { background:var(--panel); border:1px solid var(--line); border-radius:4px; padding:4px; cursor:pointer; position:relative; }
.cell:hover { border-color:var(--accent); }
.cell img { width:100%; aspect-ratio:1; display:block; }
.cell .name { font-size:11px; color:var(--dim); overflow:hidden; white-space:nowrap; text-overflow:ellipsis; margin-top:2px; }
.cell.used { border-color:var(--used); }
.cell.used::after { content:"used"; position:absolute; top:2px; right:2px; font-size:10px; background:var(--used); color:#111; padding:0 4px; border-radius:3px; }
body.nonames .name { display:none; }
#more { display:block; margin:0 auto 24px; padding:8px 20px; background:var(--panel); color:var(--text); border:1px solid var(--line); border-radius:4px; cursor:pointer; }
dialog { background:var(--panel); color:var(--text); border:1px solid var(--line); border-radius:6px; max-width:min(560px, calc(100vw - 32px)); }
dialog img { width:256px; height:256px; display:block; margin:0 auto 10px; background:repeating-conic-gradient(#2e2a25 0 25%, #24211d 0 50%) 0 0/16px 16px; }
dialog code { display:block; word-break:break-all; background:var(--bg); padding:6px 8px; border-radius:4px; margin:4px 0 10px; }
dialog button { background:var(--bg); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:5px 12px; cursor:pointer; margin-right:6px; }
dialog button:hover { border-color:var(--accent); }
</style>
</head>
<body>
<header>
  <h1>PONETI Icons</h1>
  <input type="search" id="q" placeholder="Search names and folders (words AND, -word excludes)" autofocus>
  <select id="cat"><option value="">All categories</option></select>
  <select id="sub"><option value="">All folders</option></select>
  <select id="bg">
    <option value="">Any background</option>
    <option value="bg">With background</option>
    <option value="nobg">No background</option>
  </select>
  <label><input type="checkbox" id="usedOnly"> used only</label>
  <label><input type="checkbox" id="names" checked> names</label>
  <label>size <input type="range" id="size" min="48" max="200" value="96"></label>
  <span id="count"></span>
</header>
<div id="grid"></div>
<button id="more" hidden>Show more</button>
<dialog id="detail">
  <img id="dImg" alt="">
  <div id="dUsed"></div>
  <div>Manifest path</div><code id="dPath"></code>
  <button id="copy">Copy manifest path</button><button id="close">Close</button>
</dialog>
<script>
const PAGE_SIZE = 600;
const $ = (id) => document.getElementById(id);
let all = [], used = {}, shown = [], rendered = 0;


function isNoBg(file) { return /(nobg|_nb\\b|_nb\\.png|nobackground)/i.test(file); }

function folders(file) { const parts = file.split('/'); parts.pop(); return parts; }

async function load() {
  const data = await (await fetch('/index.json')).json();
  used = data.used;
  // A pack dir that holds one wrapper folder (6000FantasyIcons/) gets it
  // stripped for display and categories; the manifest path keeps it.
  const firsts = new Set(data.files.map((f) => f.split('/')[0]));
  const strip = firsts.size === 1 && data.files[0].includes('/') ? [...firsts][0].length + 1 : 0;
  all = data.files.map((manifest) => {
    const file = manifest.slice(strip), dirs = folders(file);
    return {file, manifest, cat: dirs[0] || '(root)', sub: dirs.join('/') || '(root)', noBg: isNoBg(file),
      hay: file.toLowerCase().replace(/[_\\-]/g, ' ')};
  });
  const cats = [...new Set(all.map((i) => i.cat))].sort();
  for (const c of cats) $('cat').add(new Option(c + ' (' + all.filter((i) => i.cat === c).length + ')', c));
  fillSubs();
  apply();
}

function fillSubs() {
  const cat = $('cat').value, sel = $('sub');
  sel.length = 1;
  const subs = {};
  for (const i of all) if (!cat || i.cat === cat) subs[i.sub] = (subs[i.sub] || 0) + 1;
  for (const s of Object.keys(subs).sort()) sel.add(new Option(s + ' (' + subs[s] + ')', s));
}

function apply() {
  const words = $('q').value.toLowerCase().replace(/[_\\-]/g, ' ').split(/\\s+/).filter(Boolean);
  const want = words.filter((w) => !w.startsWith('-'));
  const not = words.filter((w) => w.startsWith('-') && w.length > 1).map((w) => w.slice(1));
  const cat = $('cat').value, sub = $('sub').value, bg = $('bg').value, usedOnly = $('usedOnly').checked;
  shown = all.filter((i) =>
    (!cat || i.cat === cat) && (!sub || i.sub === sub) &&
    (!bg || (bg === 'nobg') === i.noBg) &&
    (!usedOnly || used[i.manifest]) &&
    want.every((w) => i.hay.includes(w)) && !not.some((w) => i.hay.includes(w)));
  $('grid').textContent = '';
  rendered = 0;
  renderMore();
}

function renderMore() {
  const frag = document.createDocumentFragment();
  for (const i of shown.slice(rendered, rendered + PAGE_SIZE)) {
    const cell = document.createElement('div');
    cell.className = 'cell' + (used[i.manifest] ? ' used' : '');
    cell.title = i.file + (used[i.manifest] ? '\\nused as: ' + used[i.manifest].join(', ') : '');
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = '/png/' + i.manifest.split('/').map(encodeURIComponent).join('/');
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = i.file.split('/').pop().replace(/\\.png$/i, '');
    cell.append(img, name);
    cell.onclick = () => openDetail(i, img.src);
    frag.append(cell);
  }
  $('grid').append(frag);
  rendered = Math.min(rendered + PAGE_SIZE, shown.length);
  $('more').hidden = rendered >= shown.length;
  $('count').textContent = shown.length + ' of ' + all.length + ' icons' + (rendered < shown.length ? ' (' + rendered + ' drawn)' : '');
}

function openDetail(i, src) {
  $('dImg').src = src;
  $('dPath').textContent = i.manifest;
  $('dUsed').textContent = used[i.manifest] ? 'Used as: ' + used[i.manifest].join(', ') : '';
  $('copy').textContent = 'Copy manifest path';
  $('detail').showModal();
}

$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('dPath').textContent); $('copy').textContent = 'Copied'; }
  catch { getSelection().selectAllChildren($('dPath')); $('copy').textContent = 'Select + Ctrl+C'; }
};
$('close').onclick = () => $('detail').close();
$('detail').onclick = (e) => { if (e.target === $('detail')) $('detail').close(); };
$('more').onclick = renderMore;
// Draw the next page when the end of the grid scrolls into view.
new IntersectionObserver((es) => { if (es[0].isIntersecting && !$('more').hidden) renderMore(); }, {rootMargin: '800px'}).observe($('more'));

let timer;
$('q').oninput = () => { clearTimeout(timer); timer = setTimeout(apply, 120); };
$('cat').onchange = () => { fillSubs(); apply(); };
for (const id of ['sub', 'bg', 'usedOnly']) $(id).onchange = apply;
$('names').onchange = () => document.body.classList.toggle('nonames', !$('names').checked);
$('size').oninput = () => document.documentElement.style.setProperty('--cell', $('size').value + 'px');
document.documentElement.style.setProperty('--cell', '96px');
load();
</script>
</body>
</html>`;
