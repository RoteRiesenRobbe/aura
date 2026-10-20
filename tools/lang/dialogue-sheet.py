#!/usr/bin/env python3
"""Every dialogue line and quest text, English + German, in play order.

    python3 tools/lang/dialogue-sheet.py [--out <dir>]
        Writes aura-dialogue-and-quests.xlsx and .csv to --out (default: the
        current directory). Upload the .xlsx to Google Drive to get a Sheet.

    python3 tools/lang/dialogue-sheet.py --strip <edited.csv>
        Drops the context columns from a sheet downloaded as CSV, writing
        <edited>.import.csv for `node tools/lang/sheet.mjs import`.

Rows come from `sheet.mjs export --locale de`, reordered along the path from
the starting campfire: shared phrases, the campfire, then each placed NPC
(conversation in node order, the quests they offer, then the NPCs those quests
send you to), door words, and last the NPCs and quests not on the path. The
seven sheet.mjs columns are kept as they are, so the German round-trips once
the context columns are stripped (sheet.mjs refuses columns it does not know).
Standard library only.
"""
import csv, glob, json, math, os, subprocess, sys, tempfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
API = os.path.join(ROOT, 'api')
TOOL_COLS = ['file', 'key', 'en', 'de', 'note', 'maxLength', 'status']

if len(sys.argv) == 3 and sys.argv[1] == '--strip':
    src = sys.argv[2]
    with open(src, encoding='utf-8-sig', newline='') as f:
        edited = list(csv.DictReader(f))
    dst = os.path.splitext(src)[0] + '.import.csv'
    with open(dst, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, TOOL_COLS, lineterminator='\r\n', quoting=csv.QUOTE_ALL)
        w.writeheader()
        for r in edited:
            w.writerow({c: r.get(c, '') for c in TOOL_COLS})
    print('wrote', dst)
    sys.exit(0)

OUT = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.getcwd()
os.makedirs(OUT, exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'lang', 'sheet.mjs'), 'export', '--locale', 'de', '--out', tmp],
                   check=True, stdout=subprocess.DEVNULL)
    with open(os.path.join(tmp, 'de.csv'), encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
by_key = {r['key']: r for r in rows}
WANTED_FILES = {'conversations', 'quests'}
DOOR_PREFIX = ('exit.', 'anchor.', 'exit-look.')
wanted = {k for k, r in by_key.items()
          if r['file'] in WANTED_FILES or (r['file'] == 'regions' and k.startswith(DOOR_PREFIX))}

def name_of(mob):
    r = by_key.get(f'mob.{mob}.name')
    return r['en'] if r else mob

# ---------------------------------------------------------------- content
mobs = {}
for f in glob.glob(os.path.join(API, 'mobs', '*.json')):
    d = json.load(open(f, encoding='utf-8'))
    if d.get('interaction'):
        mobs[d['name']] = d
quests = {}
for f in glob.glob(os.path.join(API, 'quests', '*.json')):
    d = json.load(open(f, encoding='utf-8'))
    quests[d['id']] = d

def qtitle(q):
    r = by_key.get(f'quest.{q}.title')
    lvl = quests.get(q, {}).get('level')
    return f"{r['en'] if r else q} (L{lvl})" if lvl else (r['en'] if r else q)

# where each conversant stands (main zones only; .debug is skipped on purpose)
placed = {}
start = None
def walk(o, zone, region):
    global start
    if isinstance(o, dict):
        if 'spawns' in o and 'bounds' not in o:
            region = o.get('name') or o.get('id') or region
        if o.get('mob') in mobs and o['mob'] not in placed:
            placed[o['mob']] = (zone, region, o.get('x', 0), o.get('y', 0))
        if o.get('startingSpawn') and zone == 'world.json':
            start = (o.get('x', 0), o.get('y', 0))
        for v in o.values():
            walk(v, zone, region)
    elif isinstance(o, list):
        for v in o:
            walk(v, zone, region)
for f in sorted(glob.glob(os.path.join(API, 'zones', '*.json'))):
    walk(json.load(open(f, encoding='utf-8')), os.path.basename(f), '')

REGION_LABEL = {'farmlands': 'Farmlands', 'deep-woods': 'Deep Woods', 'brunnstedt': 'Brunnstedt',
                'umberwood': 'Umberwood', 'glimmerwood': 'Glimmerwood', 'Underworld': 'Kobold Cave'}

def offers(mob):
    out = []
    for n in mobs[mob]['interaction']['nodes']:
        for o in n.get('options', []):
            for g in o.get('grants', []):
                if g.get('kind') == 'offer_quest' and g['quest'] not in out:
                    out.append(g['quest'])
    return out

def region_rank(region):
    lv = [quests[q].get('level', 99) for m, p in placed.items() if p[1] == region for q in offers(m) if q in quests]
    xs = [p[2] for p in placed.values() if p[1] == region]
    return (0 if region == 'farmlands' else 1, min(lv) if lv else 99, min(xs))

def npc_rank(m):
    zone, region, x, y = placed[m]
    if zone != 'world.json':
        return (9, 0, x)
    d = math.hypot(x - start[0], y - start[1]) if region == 'farmlands' else x
    return (0,) + region_rank(region) + (d,)

path = sorted(placed, key=npc_rank)

# ---------------------------------------------------------------- emit
out, seen = [], set()
def emit(key, section, zone, speaker, quest, kind):
    if key not in wanted or key in seen:
        return
    seen.add(key)
    out.append({'Section': section, 'Zone': zone, 'Speaker': speaker, 'Quest': quest, 'Kind': kind, **by_key[key]})

def text_key(mob, ref):
    if ref.get('stock'):
        return f"stock.{ref['stock']}"
    if ref.get('id'):
        return f"conv.{mob}.{ref['id']}"
    return None

def node_quest(node, inherited):
    for o in node.get('options', []):
        for g in o.get('grants', []):
            if g.get('quest'):
                return qtitle(g['quest'])
    for c in node.get('conditions', []):
        if c.get('quest'):
            return qtitle(c['quest'])
    return inherited

def conversation(mob, section, zone):
    it = mobs[mob]['interaction']
    who = name_of(mob)
    for a in it.get('ambient', []):
        emit(f"conv.{mob}.{a['id']}", section, zone, who, '', 'Ambient (said unprompted)')
    nodes = {n['id']: n for n in it['nodes']}
    done = set()
    def dfs(nid, quest):
        if nid in done or nid not in nodes:
            return
        done.add(nid)
        n = nodes[nid]
        q = node_quest(n, quest)
        for ln in n.get('lines', []):
            k = text_key(mob, ln)
            if k: emit(k, section, zone, who, q, f'Line ({nid})')
        for o in n.get('options', []):
            k = text_key(mob, o)
            if k: emit(k, section, zone, 'Player', q, f'Player option ({nid})')
            for g in o.get('grants', []):
                k = text_key(mob, g)
                if k: emit(k, section, zone, who, qtitle(g['quest']) if g.get('quest') else q, f'Reply ({g["kind"]})')
            if o.get('next'):
                dfs(o['next'], q)
    dfs('root', '')
    for n in it['nodes']:
        dfs(n['id'], '')
    # anything authored for this speaker the walk did not reach
    for k in sorted(wanted - seen):
        if k.startswith(f'conv.{mob}.'):
            emit(k, section, zone, who, '', 'Other')

def quest_block(q, section, zone):
    title = qtitle(q)
    emit(f'quest.{q}.title', section, zone, 'Journal', title, 'Quest title')
    stages = {s['id']: s for s in quests[q]['stages']}
    order, cur = [], quests[q]['stages'][0]['id']
    while cur in stages and cur not in order:
        order.append(cur)
        cur = stages[cur].get('next')
    order += [s for s in stages if s not in order]
    for sid in order:
        emit(f'quest.{q}.{sid}.journal', section, zone, 'Journal', title, f'Journal ({sid})')
        emit(f'quest.{q}.{sid}.tracker', section, zone, 'Journal', title, f'Tracker ({sid})')
        for ob in stages[sid].get('objectives', []):
            tgt = ob.get('npc') or ob.get('species') or ob.get('region') or ''
            emit(f"quest.{q}.{sid}.{ob['kind']}.{tgt}.tracker", section, zone, 'Journal', title, f'Tracker ({sid}, {ob["kind"]} {tgt})')
    for k in sorted(wanted - seen):
        if k.startswith(f'quest.{q}.'):
            emit(k, section, zone, 'Journal', title, 'Other')

def involved(q):
    """NPCs a quest sends the player to: talk_to targets, then whoever advances it."""
    out = []
    for s in quests[q]['stages']:
        for ob in s.get('objectives', []):
            if ob.get('npc') in mobs: out.append(ob['npc'])
    for m, d in mobs.items():
        if f'"quest": "{q}"' in json.dumps(d['interaction']):
            out.append(m)
    return [m for m in dict.fromkeys(out) if m in placed]

done_npc, done_q = set(), set()
def visit(mob):
    if mob in done_npc:
        return
    done_npc.add(mob)
    zone, region, _, _ = placed[mob]
    label = REGION_LABEL.get(region) or ('Kobold Cave' if zone == 'koboldCave.json' else region or zone)
    conversation(mob, f'{label}: {name_of(mob)}', label)
    mine = [q for q in offers(mob) if q in quests and q not in done_q]
    for q in mine:
        done_q.add(q)
        quest_block(q, f'{label}: {name_of(mob)}', label)
    for q in mine:
        for m in involved(q):
            visit(m)

# 1. shared phrases, 2. the campfire (first E press), 3. the path, 4. doors, 5. the rest
for k in sorted(wanted):
    if k.startswith('stock.'):
        emit(k, '0 Shared phrases (any NPC)', '', 'Player / NPC', '', 'Stock phrase')
conversation('Campfire', 'Every campfire', 'Everywhere')
done_npc.add('Campfire')
for m in path:
    visit(m)
emit_doors = sorted(k for k in wanted if k.startswith(DOOR_PREFIX))
for k in emit_doors:
    emit(k, 'Doors and passages', '', 'Door', '', 'Door words')
conversation('CaveMouth', 'Doors and passages', '')
done_npc.add('CaveMouth')
for m in sorted(mobs):
    if m not in done_npc:
        why = 'runtime-spawned' if m.startswith('Portal') else 'not placed in the main world'
        conversation(m, f'Not on the path ({why}): {name_of(m)}', '')
        for q in offers(m):
            if q not in done_q and q in quests:
                done_q.add(q)
                quest_block(q, f'Not on the path ({why}): {name_of(m)}', '')
for q in sorted(quests):
    if q not in done_q:
        quest_block(q, 'Quests no NPC offers (parked)', '')
for k in sorted(wanted - seen):
    emit(k, 'Unsorted', '', '', '', 'Other')

assert len(seen) == len(wanted), (len(seen), len(wanted))
for i, r in enumerate(out, 1):
    r['Order'] = i

COLS = ['Order', 'Section', 'Zone', 'Speaker', 'Quest', 'Kind', 'en', 'de', 'note', 'status', 'key', 'file', 'maxLength']
assert set(TOOL_COLS) <= set(COLS)
with open(os.path.join(OUT, 'aura-dialogue-and-quests.csv'), 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.DictWriter(f, COLS, lineterminator='\r\n', quoting=csv.QUOTE_ALL)
    w.writeheader()
    for r in out:
        w.writerow({c: r[c] for c in COLS})

# ---------------------------------------------------------------- xlsx
# Hand-written SpreadsheetML (no openpyxl here): inline strings, three styles.
import zipfile
from xml.sax.saxutils import escape
INFO = [
    'Aura: every dialogue line and quest text, English + German, in play order.',
    'Order follows the path from the starting campfire: shared phrases, the campfire, then each NPC by region',
    '(Farmlands, Deep Woods, Brunnstedt, then the later regions by quest level, then the Kobold Cave).',
    'After each NPC come the quests they offer (title, journal, trackers per stage), then the NPCs those quests send you to.',
    'Within an NPC, rows follow the conversation: a node\'s lines, each player option, the reply, then the node it leads to.',
    'Shared phrases (stock.*) are used by many NPCs and appear once, at the top.',
    'Not on the path: NPCs only placed in the debug world or spawned at runtime (portals), and parked quests.',
    'Left out on purpose: UI text, mob/skill/region names (no dialogue).',
    '',
    'Editing: change the de column freely. Keep the key column intact; rows are matched by key, so sorting and filtering are safe.',
    'Bring German back: File > Download > CSV of the first tab, `python3 tools/lang/dialogue-sheet.py --strip <file.csv>`, then `node tools/lang/sheet.mjs import <file>.import.csv`.',
    'English edits are NOT imported by the tool (English is authored in api/lang/en or the content editor): mark them and hand them over.',
    'When importing a CSV into Google Sheets: untick "Convert text to numbers, dates, and formulas".',
    '{name}, {count, plural, ...} and similar are placeholders: keep them as they are.',
]
WIDTH = {'Order': 7, 'Section': 26, 'Zone': 13, 'Speaker': 14, 'Quest': 26, 'Kind': 22, 'en': 60, 'de': 60,
         'note': 40, 'status': 8, 'key': 40, 'file': 13, 'maxLength': 9}
WRAP = {'en', 'de', 'note', 'Section', 'Quest', 'Kind'}
def col(i):
    s = ''
    while i:
        i, r = divmod(i - 1, 26); s = chr(65 + r) + s
    return s
def cell(ref, v, style):
    v = escape(str(v)).replace('\n', '&#10;')
    return f'<c r="{ref}" t="inlineStr" s="{style}"><is><t xml:space="preserve">{v}</t></is></c>'
# styles: 0 default, 1 header, 2/3 shade A/B no wrap, 4/5 shade A/B wrap
styles = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF3B4A5A"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF5"/></patternFill></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="6"><xf/>
<xf fontId="1" fillId="2" applyFont="1" applyFill="1"/>
<xf fillId="3" applyFill="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf fillId="4" applyFill="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf fillId="3" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf fillId="4" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs></styleSheet>"""
NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
rowsx = ['<row r="1">' + ''.join(cell(f'{col(i)}1', c, 1) for i, c in enumerate(COLS, 1)) + '</row>']
shade, last = 0, None
for n, r in enumerate(out, 2):
    if r['Section'] != last:
        shade, last = 1 - shade, r['Section']
    rowsx.append(f'<row r="{n}">' + ''.join(
        cell(f'{col(i)}{n}', r[c], (4 if c in WRAP else 2) + shade) for i, c in enumerate(COLS, 1)) + '</row>')
cols = ''.join(f'<col min="{i}" max="{i}" width="{WIDTH[c]}" customWidth="1"/>' for i, c in enumerate(COLS, 1))
last_ref = f'{col(len(COLS))}{len(out) + 1}'
sheet1 = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet {NS}>'
          '<sheetViews><sheetView workbookViewId="0"><pane xSplit="7" ySplit="1" topLeftCell="H2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>'
          f'<cols>{cols}</cols><sheetData>{"".join(rowsx)}</sheetData><autoFilter ref="A1:{last_ref}"/></worksheet>')
sheet2 = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet {NS}><cols><col min="1" max="1" width="130" customWidth="1"/></cols><sheetData>'
          + ''.join(f'<row r="{i}">{cell(f"A{i}", t, 0)}</row>' for i, t in enumerate(INFO, 1)) + '</sheetData></worksheet>')
workbook = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook {NS}><sheets>'
            '<sheet name="Dialogue &amp; quests" sheetId="1" r:id="rId1"/><sheet name="How to use" sheetId="2" r:id="rId2"/></sheets>'
            '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\'Dialogue &amp; quests\'!$A$1:$' + col(len(COLS)) + '$' + str(len(out) + 1) + '</definedName></definedNames></workbook>')
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/_rels/workbook.xml.rels': f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'<Relationship Id="rId1" Type="{REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="{REL}/worksheet" Target="worksheets/sheet2.xml"/>'
        f'<Relationship Id="rId3" Type="{REL}/styles" Target="styles.xml"/></Relationships>',
    'xl/workbook.xml': workbook, 'xl/styles.xml': styles,
    'xl/worksheets/sheet1.xml': sheet1, 'xl/worksheets/sheet2.xml': sheet2,
}
with zipfile.ZipFile(os.path.join(OUT, 'aura-dialogue-and-quests.xlsx'), 'w', zipfile.ZIP_DEFLATED) as z:
    for name, data in files.items():
        z.writestr(name, data)
print(len(out), 'rows;', len(path), 'placed NPCs;', len(done_q), 'quests')
