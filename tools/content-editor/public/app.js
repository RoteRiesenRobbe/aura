import { buildIndex, validateInteraction, validateQuest, validateAll } from '/validate.mjs';

/* ---- tiny DOM helper ------------------------------------------------- */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

const QUEST_SENTINELS = ['not_started', 'completed', 'running'];
const CONDITION_KINDS = ['minLevel', 'quest_at_stage', 'bloodline_ascensions', 'kills_this_life'];
const GRANT_KINDS = ['teach_skill', 'offer_quest', 'advance_quest', 'grant_xp', 'travel_to'];
const TRAVEL_MODES = ['home_campfire', 'caster'];
const ROW_KINDS = ['', 'ascension_catalog', 'memorial_names'];
const OBJECTIVE_KINDS = ['kill', 'harvest', 'talk_to'];

/* ---- state ------------------------------------------------------------ */
const state = {
  mobs: [],       // [{file, raw}]
  quests: [],     // [{file, raw}]
  skillNames: [],
  pristine: new Map(), // file -> JSON string at load/save time
  selected: null, // {kind:'npc'|'quest', file}
  npcFilter: '',
  questFilter: '',
};

const $ = (sel) => document.querySelector(sel);
const npcListEl = $('#npc-list');
const questListEl = $('#quest-list');
const editorRoot = $('#editor-root');
const emptyState = $('#empty-state');
const globalStatus = $('#global-status');
const validationSummary = $('#validation-summary');
const validationList = $('#validation-list');

function idx() { return buildIndex(state.mobs, state.quests, state.skillNames); }
function mobsWithInteraction() { return state.mobs.filter((m) => m.raw.interaction); }
function findMob(file) { return state.mobs.find((m) => m.file === file); }
function findQuest(file) { return state.quests.find((q) => q.file === file); }
function isDirty(file) { return state.pristine.get(file) !== JSON.stringify(stateRawFor(file)); }
function stateRawFor(file) {
  const m = findMob(file); if (m) return m.raw;
  const q = findQuest(file); if (q) return q.raw;
  return null;
}
function markPristine(file) { state.pristine.set(file, JSON.stringify(stateRawFor(file))); }

// Discards unsaved edits, restoring the in-memory copy to whatever was last
// loaded or saved (not a fetch — the pristine snapshot already held in
// state.pristine). Confirms only when there's actually something to lose.
// A never-saved draft (entry.isNew) has no pristine snapshot to restore —
// "reset" for it means dropping the draft entirely.
function resetEntry(entry, kind) {
  if (entry.isNew) {
    if (!confirm(`Discard the new, unsaved "${entry.file}"?`)) return;
    if (kind === 'npc') state.mobs = state.mobs.filter((m) => m !== entry);
    else state.quests = state.quests.filter((q) => q !== entry);
    state.selected = null;
    renderSidebar();
    renderEditor();
    return;
  }
  if (isDirty(entry.file) && !confirm(`Discard unsaved changes to "${entry.file}"?`)) return;
  entry.raw = JSON.parse(state.pristine.get(entry.file));
  renderSidebar();
  renderEditor();
}

/* ---- new-object creation ------------------------------------------------ */
// Slug used for filenames: lowercase, non-alphanumerics collapsed to single
// hyphens, matching every existing api/mobs|quests/*.json stem.
function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
// A mob's `name` doubles as its player-facing label (CamelCase -> spaces,
// mobs.DeriveDisplayName) — so a new NPC's `name` must actually BE CamelCase.
function toCamelName(s) {
  return s.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
}

// The CityGuard-shaped unattackable teaching-NPC template (docs/manual-
// content-authoring.md §1c): role creature + speed 0 so it never moves or
// fights, faction townsfolk so player auras skip it, collisionLayer 97
// authored explicitly (required once a mob carries `interaction`).
// entityType "NpcPlaceholder" is the documented deliberate-missing-art
// marker, so the file is playable the moment it's saved — no art/EntityType
// wiring (out of this tool's scope, see README) is needed to boot or test it.
function createNewNpc() {
  const display = prompt('New NPC name (e.g. "Village Blacksmith"):');
  if (!display) return;
  const name = toCamelName(display);
  const slug = slugify(display);
  if (!name || !slug) { alert('That name needs at least one letter or number.'); return; }
  const file = `api/mobs/${slug}.json`;
  if (findMob(file) || state.mobs.some((m) => m.raw.name === name)) {
    alert(`An NPC already resolves to "${file}" (name "${name}"). Pick a different name.`);
    return;
  }
  const nextId = state.mobs.reduce((max, m) => Math.max(max, m.raw.id || 0), 0) + 1;
  const raw = {
    id: nextId,
    name,
    type: 'MOB',
    entityType: 'NpcPlaceholder',
    faction: 'townsfolk',
    role: 'creature',
    tier: 'normal',
    curveLevel: 1,
    factors: { baseMaxHealth: 200, xpFactor: 0, speed: 0 },
    body: { radius: 0.35, collisionLayer: 97, collisionMask: 16, aggroRadius: 1.0 },
    skills: [],
    interaction: { range: 2, ambient: [], nodes: [{ id: 'root', lines: ["TODO: write this NPC's opening line."], options: [] }] },
  };
  const entry = { file, raw, isNew: true };
  state.mobs.push(entry);
  state.selected = { kind: 'npc', file };
  renderSidebar();
  renderEditor();
}

function createNewQuest() {
  const title = prompt('New quest title (e.g. "Rats in the Cellar"):');
  if (!title) return;
  const id = slugify(title);
  if (!id) { alert('That title needs at least one letter or number.'); return; }
  const file = `api/quests/${id}.json`;
  if (findQuest(file) || state.quests.some((q) => q.raw.id === id)) {
    alert(`A quest already resolves to "${file}" (id "${id}"). Pick a different title.`);
    return;
  }
  const raw = {
    id,
    title,
    stages: [{ id: 'start', journal: 'TODO: write this stage\'s journal text.', objectives: [] }],
  };
  const entry = { file, raw, isNew: true };
  state.quests.push(entry);
  state.selected = { kind: 'quest', file };
  renderSidebar();
  renderEditor();
}

/* ---- load -------------------------------------------------------------- */
async function loadAll() {
  const res = await fetch('/api/data');
  const data = await res.json();
  state.mobs = data.mobs;
  state.quests = data.quests;
  state.skillNames = data.skillNames;
  for (const m of state.mobs) markPristine(m.file);
  for (const q of state.quests) markPristine(q.file);
  renderSidebar();
  await runGlobalValidation();
  if (state.selected) renderEditor();
}

async function runGlobalValidation() {
  try {
    const res = await fetch('/api/validate');
    const { errors, warnings } = await res.json();
    renderValidationPanel(errors, warnings);
  } catch (e) {
    validationSummary.textContent = 'validation request failed: ' + e.message;
  }
}

function renderValidationPanel(errors, warnings) {
  validationSummary.textContent = `${errors.length} error(s), ${warnings.length} warning(s)`;
  globalStatus.className = errors.length ? 'has-errors' : warnings.length ? 'has-warnings' : '';
  globalStatus.textContent = errors.length ? `${errors.length} error(s)` : warnings.length ? `${warnings.length} warning(s)` : 'all clear';
  validationList.innerHTML = '';
  for (const e of errors) validationList.appendChild(validationRow(e, 'error'));
  for (const w of warnings) validationList.appendChild(validationRow(w, 'warning'));
  renderSidebar(); // refresh per-item error badges
}

function validationRow(item, cls) {
  const li = el('li', { class: cls, onclick: () => item.file && selectByFile(item.file) }, [
    item.file ? el('span', { class: 'file', text: item.file }) : null,
    document.createTextNode(item.message),
  ]);
  return li;
}

function selectByFile(file) {
  const m = findMob(file);
  if (m) { state.selected = { kind: 'npc', file }; renderSidebar(); renderEditor(); return; }
  const q = findQuest(file);
  if (q) { state.selected = { kind: 'quest', file }; renderSidebar(); renderEditor(); return; }
}

/* ---- sidebar ------------------------------------------------------------ */
function renderSidebar() {
  const npcs = mobsWithInteraction().filter((m) => matchesFilter(m.raw.name, state.npcFilter));
  npcListEl.innerHTML = '';
  for (const m of npcs.sort((a, b) => a.raw.name.localeCompare(b.raw.name))) {
    npcListEl.appendChild(sidebarItem(m.raw.name, m.file, 'npc'));
  }
  const quests = state.quests.filter((q) => matchesFilter(q.raw.title || q.raw.id, state.questFilter));
  questListEl.innerHTML = '';
  for (const q of quests.sort((a, b) => (a.raw.title || a.raw.id).localeCompare(b.raw.title || b.raw.id))) {
    questListEl.appendChild(sidebarItem(q.raw.title || q.raw.id, q.file, 'quest'));
  }
}

function matchesFilter(name, filter) {
  return !filter || (name || '').toLowerCase().includes(filter.toLowerCase());
}

function sidebarItem(label, file, kind) {
  const selected = state.selected && state.selected.file === file;
  const li = el('li', {
    class: selected ? 'selected' + (isDirty(file) ? ' dirty' : '') : (isDirty(file) ? 'dirty' : ''),
    onclick: () => { state.selected = { kind, file }; renderSidebar(); renderEditor(); },
  }, [
    el('span', { class: 'dirty-dot' }),
    el('span', { text: label }),
  ]);
  return li;
}

$('#npc-filter').addEventListener('input', (e) => { state.npcFilter = e.target.value; renderSidebar(); });
$('#quest-filter').addEventListener('input', (e) => { state.questFilter = e.target.value; renderSidebar(); });
$('#revalidate-btn').addEventListener('click', runGlobalValidation);
$('#npc-new-btn').addEventListener('click', createNewNpc);
$('#quest-new-btn').addEventListener('click', createNewQuest);

$('#npc-toggle').addEventListener('click', () => { state.npcCollapsed = !state.npcCollapsed; applyCollapsedState(); });
$('#quest-toggle').addEventListener('click', () => { state.questCollapsed = !state.questCollapsed; applyCollapsedState(); });
function applyCollapsedState() {
  $('#npc-toggle').closest('.sidebar-section').classList.toggle('collapsed', !!state.npcCollapsed);
  $('#quest-toggle').closest('.sidebar-section').classList.toggle('collapsed', !!state.questCollapsed);
}

/* ---- arrow overlay ------------------------------------------------------ */
// Draws a curve from every "out" handle (an option's `next` picker, or a
// quest stage's `next` picker) to the "in" handle of the card it targets.
// Handles are marked with data-anchor-out="<nodeId>" / data-anchor-in="<id>".
function drawArrows(container, svg) {
  const cRect = container.getBoundingClientRect();
  const outs = container.querySelectorAll('[data-anchor-out]');
  const ins = new Map();
  for (const inEl of container.querySelectorAll('[data-anchor-in]')) {
    ins.set(inEl.dataset.anchorIn, inEl);
  }
  let svgBody = '';
  for (const outEl of outs) {
    const targetId = outEl.dataset.anchorOut;
    if (!targetId) continue;
    const inEl = ins.get(targetId);
    if (!inEl) continue;
    const a = outEl.getBoundingClientRect();
    const b = inEl.getBoundingClientRect();
    const x1 = a.right - cRect.left, y1 = a.top + a.height / 2 - cRect.top;
    const x2 = b.left - cRect.left, y2 = b.top + b.height / 2 - cRect.top;
    const dx = Math.max(40, Math.abs(x2 - x1) / 2);
    svgBody += `<path d="M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}" />`;
    svgBody += `<circle cx="${x1}" cy="${y1}" r="2.5" /><circle cx="${x2}" cy="${y2}" r="2.5" />`;
  }
  svg.innerHTML = svgBody;
  svg.style.height = container.scrollHeight + 'px';
}

let redrawPending = null;
function scheduleRedraw(container, svg) {
  clearTimeout(redrawPending);
  redrawPending = setTimeout(() => drawArrows(container, svg), 30);
}
window.addEventListener('resize', () => { if (window.__ceRedraw) window.__ceRedraw(); });

/* ---- editor entry ------------------------------------------------------- */
function renderEditor() {
  if (!state.selected) { emptyState.hidden = false; editorRoot.hidden = true; return; }
  emptyState.hidden = true;
  editorRoot.hidden = false;
  editorRoot.innerHTML = '';
  if (state.selected.kind === 'npc') renderNpcEditor(findMob(state.selected.file));
  else renderQuestEditor(findQuest(state.selected.file));
}

/* ======================================================================
 * NPC / dialogue-tree editor
 * ==================================================================== */
function renderNpcEditor(entry) {
  const mob = entry.raw;
  mob.interaction = mob.interaction || { range: 2, ambient: [], nodes: [] };
  const inter = mob.interaction;

  const header = el('div', { class: 'editor-header' }, [
    el('div', {}, [
      el('h2', { text: mob.name }),
      el('div', { class: 'file-path' }, [
        document.createTextNode(entry.file),
        entry.isNew ? el('span', { class: 'new-badge', text: 'not yet saved' }) : null,
      ]),
    ]),
    el('div', { class: 'editor-actions' }, [
      el('span', { class: 'save-feedback', id: 'save-feedback' }),
      el('button', { onclick: () => resetEntry(entry, 'npc') }, 'Reset'),
      el('button', { class: 'primary', onclick: () => saveNpc(entry) }, 'Save'),
    ]),
  ]);
  editorRoot.appendChild(header);

  const topFields = el('div', { class: 'top-fields' }, [
    field('Range', numberInput(inter.range ?? 0, (v) => { inter.range = v; refreshDirtyAndErrors(); })),
    field('Ambient (one hail per line)', textArea((inter.ambient || []).join('\n'), (v) => {
      inter.ambient = splitLines(v); refreshDirtyAndErrors();
    }, 'lines-textarea')),
  ]);
  editorRoot.appendChild(topFields);

  const errBox = el('div', { class: 'errors-inline', id: 'npc-errors' });
  editorRoot.appendChild(errBox);

  const graphWrap = el('div', { class: 'graph-wrap' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'graph-svg');
  const nodeCol = el('div', { class: 'node-col' });
  graphWrap.appendChild(svg);
  graphWrap.appendChild(nodeCol);
  editorRoot.appendChild(graphWrap);

  function rerenderNodes() {
    nodeCol.innerHTML = '';
    inter.nodes.forEach((node, i) => nodeCol.appendChild(nodeCard(mob, inter, node, i)));
    scheduleRedraw(graphWrap, svg);
    refreshDirtyAndErrors();
  }
  window.__ceRedraw = () => scheduleRedraw(graphWrap, svg);

  editorRoot.appendChild(el('div', { class: 'add-row' }, [
    el('button', {
      onclick: () => {
        inter.nodes.push({ id: '', lines: [], options: [] });
        rerenderNodes();
      },
    }, '+ Add node'),
  ]));

  function refreshDirtyAndErrors() {
    const errors = validateInteraction(mob, idx());
    errBox.innerHTML = '';
    for (const e of errors) errBox.appendChild(el('div', { class: 'err-line', text: e.message }));
    sidebarBumpDirty();
  }

  function nodeCard(mob, inter, node, i) {
    const nodeIds = inter.nodes.map((n) => n.id).filter(Boolean);
    const card = el('div', { class: 'card', 'data-anchor-in': node.id || `__idx${i}` });

    const head = el('div', { class: 'card-head' }, [
      el('span', { class: 'idx', text: '#' + i }),
      el('input', {
        class: 'node-id', type: 'text', value: node.id, placeholder: 'node id',
        oninput: (e) => { node.id = e.target.value; card.dataset.anchorIn = node.id || `__idx${i}`; scheduleRedraw(graphWrap, svg); refreshDirtyAndErrors(); },
      }),
      select(ROW_KINDS, node.rows || '', (v) => {
        if (v) { node.rows = v; node.options = []; if (v === 'ascension_catalog' && !node.rewards) node.rewards = []; }
        else { delete node.rows; delete node.rewards; }
        rerenderNodes();
      }, (k) => k || 'rows: none'),
      el('div', { class: 'card-actions' }, [
        el('button', { title: 'Move up', onclick: () => { if (i > 0) { [inter.nodes[i - 1], inter.nodes[i]] = [inter.nodes[i], inter.nodes[i - 1]]; rerenderNodes(); } } }, '↑'),
        el('button', { title: 'Move down', onclick: () => { if (i < inter.nodes.length - 1) { [inter.nodes[i + 1], inter.nodes[i]] = [inter.nodes[i], inter.nodes[i + 1]]; rerenderNodes(); } } }, '↓'),
        el('button', { class: 'danger', onclick: () => { inter.nodes.splice(i, 1); rerenderNodes(); } }, 'Delete'),
      ]),
    ]);
    card.appendChild(head);

    card.appendChild(conditionsSection(node, refreshDirtyAndErrors));

    card.appendChild(el('div', { class: 'subsection' }, [
      el('label', { text: 'Lines' }),
      textArea((node.lines || []).join('\n'), (v) => { node.lines = splitLines(v); refreshDirtyAndErrors(); }, 'lines-textarea'),
    ]));

    if (node.rows === 'ascension_catalog') {
      card.appendChild(el('div', { class: 'subsection' }, [
        el('label', { text: 'Rewards (one unlock key per line)' }),
        textArea((node.rewards || []).join('\n'), (v) => { node.rewards = splitLines(v); refreshDirtyAndErrors(); }, 'rewards-textarea'),
      ]));
    }

    if (!node.rows) {
      const optsCol = el('div', { class: 'options-col' });
      node.options = node.options || [];
      node.options.forEach((opt, oi) => optsCol.appendChild(optionCard(mob, inter, node, opt, i, oi, nodeIds, refreshDirtyAndErrors, () => { rerenderNodes(); })));
      card.appendChild(el('div', { class: 'subsection' }, [
        el('div', { class: 'subsection-title', text: 'Options' }),
        node.options.length ? colHeaders([{ label: 'Text', cls: 'col-flex' }, { label: 'Next', cls: 'col-fixed-lg' }]) : null,
        optsCol,
        el('button', { class: 'add-row', onclick: () => { node.options.push({ text: '', next: '', grants: [] }); rerenderNodes(); } }, '+ Add option'),
      ]));
    }

    return card;
  }

  rerenderNodes();
}

function optionCard(mob, inter, node, opt, ni, oi, nodeIds, onChange, onStructuralChange) {
  const card = el('div', { class: 'option-card' });
  const row1 = el('div', { class: 'row1', 'data-anchor-out': opt.next || null }, [
    el('input', { type: 'text', class: 'col-flex', placeholder: 'row text', value: opt.text || '', oninput: (e) => { opt.text = e.target.value; onChange(); } }),
    select(['', ...nodeIds], opt.next || '', (v) => { opt.next = v; row1.dataset.anchorOut = v || ''; onChange(); }, (v) => v || '— next: none —', 'col-fixed-lg'),
    el('label', {
      class: 'check',
      title: 'Normally a row leading to a node the player can\'t reach yet (failed conditions) just vanishes. ON: this row stays visible, greyed, naming the gate, instead of disappearing — e.g. "Show me the rewards" on a locked ascension site.',
    }, [
      el('input', { type: 'checkbox', checked: !!opt.lockedWhenGated, onchange: (e) => { opt.lockedWhenGated = e.target.checked; onChange(); } }),
      'lockedWhenGated',
    ]),
    el('button', { class: 'danger', onclick: () => { node.options.splice(oi, 1); onStructuralChange(); } }, 'Delete row'),
  ]);
  card.appendChild(row1);

  const grantsCol = el('div', { class: 'grants-col' });
  opt.grants = opt.grants || [];
  opt.grants.forEach((g, gi) => grantsCol.appendChild(grantRow(mob, opt, g, gi, onChange, onStructuralChange)));
  card.appendChild(grantsCol);
  if (opt.grants.length) {
    grantsCol.before(colHeaders([{ label: 'Kind', cls: 'col-fixed-md' }, { label: 'Line', cls: 'col-flex' }]));
  }
  card.appendChild(el('button', { class: 'add-row', onclick: () => { opt.grants.push({ kind: 'teach_skill', line: '' }); onStructuralChange(); } }, '+ Add grant'));
  return card;
}

function grantRow(mob, opt, g, gi, onChange, onStructuralChange) {
  const wrap = el('div', { class: 'grant-row' });
  wrap.appendChild(select(GRANT_KINDS, g.kind, (v) => {
    for (const k of ['skill', 'requiredLevel', 'quest', 'fromStage', 'toStage', 'xp', 'mode']) delete g[k];
    g.kind = v; onStructuralChange();
  }, null, 'col-fixed-md'));
  wrap.appendChild(el('input', { type: 'text', class: 'col-flex', placeholder: 'line spoken', value: g.line || '', oninput: (e) => { g.line = e.target.value; onChange(); } }));

  if (g.kind === 'teach_skill') {
    wrap.appendChild(select(['', ...state.skillNames], g.skill || '', (v) => { g.skill = v; onChange(); }, (v) => v || '— skill —'));
    wrap.appendChild(numberInput(g.requiredLevel || 0, (v) => { g.requiredLevel = v; onChange(); }, 'req. level'));
  } else if (g.kind === 'offer_quest') {
    wrap.appendChild(select(['', ...state.quests.map((q) => q.raw.id)], g.quest || '', (v) => { g.quest = v; onStructuralChange(); }, (v) => v || '— quest —'));
  } else if (g.kind === 'advance_quest') {
    const questIds = ['', ...state.quests.map((q) => q.raw.id)];
    wrap.appendChild(select(questIds, g.quest || '', (v) => { g.quest = v; onStructuralChange(); }, (v) => v || '— quest —'));
    const quest = state.quests.find((q) => q.raw.id === g.quest);
    const stageIds = quest ? quest.raw.stages.map((s) => s.id) : [];
    wrap.appendChild(select(['', ...stageIds], g.fromStage || '', (v) => { g.fromStage = v; onStructuralChange(); }, (v) => v || '— from —'));
    wrap.appendChild(select(['', ...stageIds], g.toStage || '', (v) => { g.toStage = v; onChange(); }, (v) => v || '— to —'));
  } else if (g.kind === 'grant_xp') {
    wrap.appendChild(numberInput(g.xp || 0, (v) => { g.xp = v; onChange(); }, 'xp'));
  } else if (g.kind === 'travel_to') {
    wrap.appendChild(select(['', ...TRAVEL_MODES], g.mode || '', (v) => { g.mode = v; onChange(); }, (v) => v || '— mode —'));
  }
  wrap.appendChild(el('button', { class: 'danger', onclick: () => { opt.grants.splice(gi, 1); onStructuralChange(); } }, '×'));
  const hint = questRowHint(g);
  if (hint) wrap.appendChild(el('div', { class: 'grant-hint', text: hint }));
  return wrap;
}

// offer_quest/advance_quest rows show or hide themselves AUTOMATICALLY based
// on the player's live quest ledger (Ledger.CanApply, backend/pkg/aura/
// quests/ledger.go) — no `conditions` block is involved, and none is read
// for this. This surfaces that engine-truth in the editor so an author isn't
// left guessing why two rows on the same node feel mutually exclusive.
function questRowHint(g) {
  if (g.kind === 'offer_quest') {
    return g.quest
      ? `Shown automatically only while "${g.quest}" has not been accepted yet (or, if it's repeatable, once it's done).`
      : 'Pick a quest to see when this row is shown.';
  }
  if (g.kind === 'advance_quest') {
    return g.quest && g.fromStage
      ? `Shown automatically only while "${g.quest}" is currently at stage "${g.fromStage}".`
      : 'Pick a quest and a from-stage to see when this row is shown.';
  }
  if (g.kind === 'grant_xp') {
    return 'Bundled with the advance_quest/offer_quest grant on this row — applied together, never separately.';
  }
  return '';
}

function conditionsSection(node, onChange) {
  const col = el('div', { class: 'subsection' }, [el('div', {
    class: 'subsection-title',
    text: 'Conditions (all must pass)',
    title: 'Gates whether a player can reach THIS NODE at all. This is separate from a quest row\'s own visibility below — an offer_quest/advance_quest row shows or hides itself automatically from the player\'s live quest progress, with no condition authored anywhere.',
  })]);
  node.conditions = node.conditions || [];
  const headerSlot = el('div');
  const rowsWrap = el('div');
  function rerender() {
    headerSlot.innerHTML = '';
    if (node.conditions.length) headerSlot.appendChild(colHeaders([{ label: 'Kind', cls: 'col-fixed-md' }]));
    rowsWrap.innerHTML = '';
    node.conditions.forEach((c, ci) => rowsWrap.appendChild(conditionRow(node, c, ci, () => { rerender(); onChange(); })));
  }
  rerender();
  col.appendChild(headerSlot);
  col.appendChild(rowsWrap);
  col.appendChild(el('button', { class: 'add-row', onclick: () => { node.conditions.push({ kind: 'minLevel', value: 1 }); rerender(); onChange(); } }, '+ Add condition'));
  return col;
}

function conditionRow(node, c, ci, onChange) {
  const wrap = el('div', { class: 'condition-row' });
  wrap.appendChild(select(CONDITION_KINDS, c.kind, (v) => {
    for (const k of ['value', 'quest', 'stage', 'species']) delete c[k];
    c.kind = v; onChange();
  }, null, 'col-fixed-md'));
  if (c.kind === 'minLevel' || c.kind === 'bloodline_ascensions') {
    wrap.appendChild(numberInput(c.value || 0, (v) => { c.value = v; onChange(); }, 'value'));
  } else if (c.kind === 'quest_at_stage') {
    const questIds = ['', ...state.quests.map((q) => q.raw.id)];
    wrap.appendChild(select(questIds, c.quest || '', (v) => { c.quest = v; onChange(); }, (v) => v || '— quest —'));
    const quest = state.quests.find((q) => q.raw.id === c.quest);
    const stageOpts = ['', ...QUEST_SENTINELS, ...(quest ? quest.raw.stages.map((s) => s.id) : [])];
    wrap.appendChild(select(stageOpts, c.stage || '', (v) => { c.stage = v; onChange(); }, (v) => v || '— stage —'));
  } else if (c.kind === 'kills_this_life') {
    wrap.appendChild(select(['', ...state.mobs.map((m) => m.raw.name)], c.species || '', (v) => { c.species = v; onChange(); }, (v) => v || '— species —'));
    wrap.appendChild(numberInput(c.value || 0, (v) => { c.value = v; onChange(); }, 'count'));
  }
  wrap.appendChild(el('button', { class: 'danger', onclick: () => { node.conditions.splice(ci, 1); onChange(); } }, '×'));
  return wrap;
}

async function saveNpc(entry) {
  const fb = $('#save-feedback');
  fb.textContent = 'saving…'; fb.className = 'save-feedback';
  const res = await fetch('/api/save/mob', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: entry.file, raw: entry.raw, isNew: !!entry.isNew }) });
  const body = await res.json();
  if (!body.ok) {
    fb.className = 'save-feedback err';
    fb.textContent = body.errors.join(' · ');
    return;
  }
  entry.isNew = false;
  editorRoot.querySelector('.new-badge')?.remove();
  markPristine(entry.file);
  fb.className = 'save-feedback ok';
  fb.textContent = body.warnings.length ? 'saved — ' + body.warnings.join(' · ') : 'saved';
  renderSidebar();
  runGlobalValidation();
}

/* ======================================================================
 * Quest / stage-graph editor
 * ==================================================================== */
function renderQuestEditor(entry) {
  const quest = entry.raw;
  quest.stages = quest.stages || [];

  const header = el('div', { class: 'editor-header' }, [
    el('div', {}, [
      el('h2', { text: quest.title || quest.id }),
      el('div', { class: 'file-path' }, [
        document.createTextNode(entry.file),
        entry.isNew ? el('span', { class: 'new-badge', text: 'not yet saved' }) : null,
      ]),
    ]),
    el('div', { class: 'editor-actions' }, [
      el('span', { class: 'save-feedback', id: 'save-feedback' }),
      el('button', { onclick: () => resetEntry(entry, 'quest') }, 'Reset'),
      el('button', { class: 'primary', onclick: () => saveQuest(entry) }, 'Save'),
    ]),
  ]);
  editorRoot.appendChild(header);

  const topFields = el('div', { class: 'top-fields' }, [
    field('Title', textInput(quest.title || '', (v) => { quest.title = v; refresh(); })),
    field('Repeatable', checkboxInput(!!quest.repeatable, (v) => { quest.repeatable = v; refresh(); })),
  ]);
  editorRoot.appendChild(topFields);

  const errBox = el('div', { class: 'errors-inline', id: 'quest-errors' });
  editorRoot.appendChild(errBox);

  const graphWrap = el('div', { class: 'graph-wrap' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'graph-svg');
  const col = el('div', { class: 'node-col' });
  graphWrap.appendChild(svg);
  graphWrap.appendChild(col);
  editorRoot.appendChild(graphWrap);
  window.__ceRedraw = () => scheduleRedraw(graphWrap, svg);

  function rerender() {
    col.innerHTML = '';
    quest.stages.forEach((s, i) => col.appendChild(stageCard(quest, s, i)));
    scheduleRedraw(graphWrap, svg);
    refresh();
  }

  editorRoot.appendChild(el('div', { class: 'add-row' }, [
    el('button', { onclick: () => { quest.stages.push({ id: '', journal: '', objectives: [] }); rerender(); } }, '+ Add stage'),
  ]));

  function refresh() {
    const errors = validateQuest(quest, idx());
    errBox.innerHTML = '';
    for (const e of errors) errBox.appendChild(el('div', { class: 'err-line', text: e.message }));
    sidebarBumpDirty();
  }

  function stageCard(quest, s, i) {
    const stageIds = quest.stages.map((st) => st.id).filter(Boolean);
    const isDialogue = !(s.objectives && s.objectives.length);
    const card = el('div', { class: 'card', 'data-anchor-in': s.id || `__idx${i}` });
    const head = el('div', { class: 'card-head' }, [
      el('span', { class: 'idx', text: '#' + i }),
      el('input', {
        class: 'node-id', type: 'text', value: s.id, placeholder: 'stage id',
        oninput: (e) => { s.id = e.target.value; card.dataset.anchorIn = s.id || `__idx${i}`; scheduleRedraw(graphWrap, svg); refresh(); },
      }),
      el('div', { class: 'card-actions' }, [
        el('button', { title: 'Move up', onclick: () => { if (i > 0) { [quest.stages[i - 1], quest.stages[i]] = [quest.stages[i], quest.stages[i - 1]]; rerender(); } } }, '↑'),
        el('button', { title: 'Move down', onclick: () => { if (i < quest.stages.length - 1) { [quest.stages[i + 1], quest.stages[i]] = [quest.stages[i], quest.stages[i + 1]]; rerender(); } } }, '↓'),
        el('button', { class: 'danger', onclick: () => { quest.stages.splice(i, 1); rerender(); } }, 'Delete'),
      ]),
    ]);
    card.appendChild(head);

    card.appendChild(field('Journal', textArea(s.journal || '', (v) => { s.journal = v; refresh(); })));
    card.appendChild(field('Tracker (supports {n}/{m})', textInput(s.tracker || '', (v) => { s.tracker = v; refresh(); })));

    const objCol = el('div', { class: 'options-col' });
    s.objectives = s.objectives || [];
    s.objectives.forEach((o, oi) => objCol.appendChild(objectiveRow(s, o, oi, refresh, rerender)));
    card.appendChild(el('div', { class: 'subsection' }, [
      el('div', { class: 'subsection-title', text: 'Objectives (leave empty for a dialogue stage)' }),
      s.objectives.length ? colHeaders([{ label: 'Kind', cls: 'col-fixed-md' }, { label: 'Target', cls: 'col-flex' }, { label: 'Count', cls: 'col-fixed-sm' }]) : null,
      objCol,
      el('button', { class: 'add-row', onclick: () => { s.objectives.push({ kind: 'kill', species: '', count: 1 }); rerender(); } }, '+ Add objective'),
    ]));

    if (!isDialogue) {
      const nextRow = el('div', { class: 'subsection', 'data-anchor-out': s.next || null });
      nextRow.appendChild(el('label', { text: 'Next stage' }));
      nextRow.appendChild(select(['', ...stageIds.filter((id) => id !== s.id)], s.next || '', (v) => { s.next = v; nextRow.dataset.anchorOut = v || ''; refresh(); }, (v) => v || '— none —'));
      card.appendChild(nextRow);
    } else {
      card.appendChild(el('div', { class: 'subsection', text: 'Dialogue stage — advanced by an NPC\'s advance_quest grant, not by "next".' }));
    }

    card.appendChild(grantedByPanel(quest, s.id));
    return card;
  }

  rerender();
}

function objectiveRow(stage, o, oi, onChange, onStructuralChange) {
  const wrap = el('div', { class: 'condition-row' });
  wrap.appendChild(select(OBJECTIVE_KINDS, o.kind, (v) => {
    o.kind = v;
    if (v === 'talk_to') { o.npc = o.npc || o.species || ''; delete o.species; } else { o.species = o.species || o.npc || ''; delete o.npc; }
    onStructuralChange();
  }, null, 'col-fixed-md'));
  // Target is the same mob-name list either way (an npc IS a mob), so one
  // column serves kill/harvest's species and talk_to's npc — only the JSON
  // key it writes to differs.
  const targetLabel = o.kind === 'talk_to' ? '— npc —' : '— species —';
  const targetValue = o.kind === 'talk_to' ? (o.npc || '') : (o.species || '');
  wrap.appendChild(select(['', ...state.mobs.map((m) => m.raw.name)], targetValue, (v) => {
    if (o.kind === 'talk_to') o.npc = v; else o.species = v;
    onChange();
  }, (v) => v || targetLabel, 'col-flex'));
  wrap.appendChild(numberInput(o.count || 1, (v) => { o.count = v; onChange(); }, 'count', 'col-fixed-sm'));
  wrap.appendChild(el('button', { class: 'danger', onclick: () => { stage.objectives.splice(oi, 1); onStructuralChange(); } }, '×'));
  return wrap;
}

function grantedByPanel(quest, stageId) {
  const rows = [];
  const isFirstStage = quest.stages[0]?.id === stageId;
  for (const m of mobsWithInteraction()) {
    for (const node of m.raw.interaction.nodes || []) {
      for (const opt of node.options || []) {
        for (const g of opt.grants || []) {
          if (g.quest !== quest.id) continue;
          if (g.kind === 'offer_quest' && isFirstStage) {
            rows.push({ label: `${m.raw.name} · offers via node "${node.id}"`, file: m.file, nodeId: node.id });
          }
          if (g.kind === 'advance_quest' && (g.fromStage === stageId || g.toStage === stageId)) {
            rows.push({ label: `${m.raw.name} · ${g.fromStage} → ${g.toStage} (node "${node.id}")`, file: m.file, nodeId: node.id });
          }
        }
      }
    }
  }
  if (rows.length === 0) return el('div', { class: 'granted-by', text: 'No NPC references this stage yet.' });
  return el('div', { class: 'granted-by' }, [
    el('span', { text: 'Referenced by:' }),
    el('ul', {}, rows.map((r) => el('li', {}, [
      el('a', {
        href: '#',
        class: 'ref-link',
        title: `Jump to node "${r.nodeId}" on ${r.file}`,
        onclick: (e) => { e.preventDefault(); jumpToNode(r.file, r.nodeId); },
        text: r.label,
      }),
    ]))),
  ]);
}

// Switches the editor to the referenced NPC and scrolls/flashes the node
// that grants/turns in this stage — renderNpcEditor builds its DOM
// synchronously, so the target card already exists once selectByFile
// returns; only the flash needs a frame to land after layout.
function jumpToNode(mobFile, nodeId) {
  selectByFile(mobFile);
  requestAnimationFrame(() => {
    const target = editorRoot.querySelector(`[data-anchor-in="${CSS.escape(nodeId)}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('flash-highlight');
    setTimeout(() => target.classList.remove('flash-highlight'), 1500);
  });
}

async function saveQuest(entry) {
  const fb = $('#save-feedback');
  fb.textContent = 'saving…'; fb.className = 'save-feedback';
  const res = await fetch('/api/save/quest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: entry.file, raw: entry.raw, isNew: !!entry.isNew }) });
  const body = await res.json();
  if (!body.ok) {
    fb.className = 'save-feedback err';
    fb.textContent = body.errors.join(' · ');
    return;
  }
  entry.isNew = false;
  editorRoot.querySelector('.new-badge')?.remove();
  markPristine(entry.file);
  fb.className = 'save-feedback ok';
  fb.textContent = body.warnings.length ? 'saved — ' + body.warnings.join(' · ') : 'saved';
  renderSidebar();
  runGlobalValidation();
}

/* ---- small field builders ------------------------------------------------ */
function field(label, control) { return el('div', { class: 'field' }, [el('label', { text: label }), control]); }
function textInput(value, onChange) { return el('input', { type: 'text', value, oninput: (e) => onChange(e.target.value) }); }
function textArea(value, onChange, cls) {
  const ta = document.createElement('textarea');
  if (cls) ta.className = cls;
  ta.rows = 3;
  ta.value = value;
  ta.addEventListener('input', (e) => onChange(e.target.value));
  return ta;
}
function numberInput(value, onChange, placeholder, cls) {
  return el('input', { type: 'number', class: cls || '', value, placeholder: placeholder || '', oninput: (e) => onChange(e.target.value === '' ? 0 : Number(e.target.value)) });
}
function checkboxInput(checked, onChange) {
  return el('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) });
}
function select(options, value, onChange, labelFn, cls) {
  const sel = el('select', { class: cls || '', onchange: (e) => onChange(e.target.value) });
  for (const opt of options) {
    sel.appendChild(el('option', { value: opt, selected: opt === value }, labelFn ? labelFn(opt) : (opt || '—')));
  }
  return sel;
}
// A row of small muted column titles, sharing the same col-* flex-basis
// classes as the cells in the rows rendered below it, so it lines up even
// though flexbox items don't share widths automatically. Only label columns
// that are genuinely the same field in every row below — a kind-varying
// tail (a grant's kind-specific fields, say) stays unlabeled rather than
// claiming an alignment that isn't there.
function colHeaders(cells) {
  return el('div', { class: 'col-headers' }, cells.map((c) => el('span', { class: c.cls || '', text: c.label })));
}
function splitLines(v) {
  const lines = v.split('\n');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}
function sidebarBumpDirty() { renderSidebar(); }

loadAll();
