import {
  buildIndex, validateInteraction, validateQuest, validateAll, validateMob, validateFaction,
  validateRecipe, validateMilestones,
  ROLES, TIERS, DAMAGE_TYPES, RESIST_WILDCARD, GATE_KEYS, COLLISION_LAYER_BITS, RESERVED_FACTION_NAMES,
} from '/validate.mjs';

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
  skillMaxLevels: {}, // {name: maxLevel}, for recipe ingredient range checks
  factions: [],   // [{file, raw}]
  recipes: [],    // [{file, raw}]
  milestones: null, // {file, raw} — raw is the WHOLE array; one shared file, not one per entry
  entityTypes: [],
  pristine: new Map(), // file -> JSON string at load/save time
  selected: null, // {kind:'mob'|'quest'|'faction'|'recipe'|'milestones', file} — an NPC IS a mob (one w/ interaction), so one editor covers both
  npcFilter: '',
  questFilter: '',
  mobFilter: '',
  factionFilter: '',
  recipeFilter: '',
  // Faction names (or 'hostile', the built-in default for an unauthored
  // faction) collapsed in each sidebar tab — separate per tab so browsing
  // Mobs and NPCs can be folded differently. Session-only, like every other
  // UI-state field here; not persisted across a reload.
  npcFactionCollapsed: new Set(),
  mobFactionCollapsed: new Set(),
  // stat-section titles ('Identity', 'Factors', ...) collapsed in the mob
  // editor — shared across every mob you open, since it's "I don't care
  // about Factors right now" rather than a per-mob preference.
  mobSectionCollapsed: new Set(),
};

const $ = (sel) => document.querySelector(sel);
const npcListEl = $('#npc-list');
const questListEl = $('#quest-list');
const mobListEl = $('#mob-list');
const factionListEl = $('#faction-list');
const recipeListEl = $('#recipe-list');
const milestonesListEl = $('#milestones-list');
const editorRoot = $('#editor-root');
const emptyState = $('#empty-state');
const globalStatus = $('#global-status');
const validationSummary = $('#validation-summary');
const validationList = $('#validation-list');

function idx() {
  return buildIndex(state.mobs, state.quests, state.skillNames, {
    factionNames: state.factions.map((f) => f.raw.name),
    entityTypes: state.entityTypes,
    skillMaxLevels: state.skillMaxLevels,
    recipes: state.recipes,
  });
}
function factionDisplayName(name) {
  if (!name) return 'Hostile';
  const f = state.factions.find((f) => f.raw.name === name);
  return f ? (f.raw.displayName || f.raw.name) : name;
}
function mobsWithInteraction() { return state.mobs.filter((m) => m.raw.interaction); }
function findMob(file) { return state.mobs.find((m) => m.file === file); }
function findQuest(file) { return state.quests.find((q) => q.file === file); }
function findFaction(file) { return state.factions.find((f) => f.file === file); }
function findRecipe(file) { return state.recipes.find((r) => r.file === file); }
function isDirty(file) { return state.pristine.get(file) !== JSON.stringify(stateRawFor(file)); }
function stateRawFor(file) {
  const m = findMob(file); if (m) return m.raw;
  const q = findQuest(file); if (q) return q.raw;
  const f = findFaction(file); if (f) return f.raw;
  const r = findRecipe(file); if (r) return r.raw;
  if (state.milestones && state.milestones.file === file) return state.milestones.raw;
  return null;
}
function markPristine(file) { state.pristine.set(file, JSON.stringify(stateRawFor(file))); }

// Discards unsaved edits, restoring the in-memory copy to whatever was last
// loaded or saved (not a fetch — the pristine snapshot already held in
// state.pristine). Confirms only when there's actually something to lose.
// A never-saved draft (entry.isNew) has no pristine snapshot to restore —
// "reset" for it means dropping the draft entirely. `kind` is 'mob',
// 'quest', or 'faction'; renderMobEditor already handles a mob with/without
// `interaction` uniformly, so resetting one that had a dialogue tree added
// and then reverted just re-renders the same editor with that section
// collapsed away.
function resetEntry(entry, kind) {
  if (entry.isNew) {
    if (!confirm(`Discard the new, unsaved "${entry.file}"?`)) return;
    if (kind === 'mob') state.mobs = state.mobs.filter((m) => m !== entry);
    else if (kind === 'quest') state.quests = state.quests.filter((q) => q !== entry);
    else if (kind === 'faction') state.factions = state.factions.filter((f) => f !== entry);
    else if (kind === 'recipe') state.recipes = state.recipes.filter((r) => r !== entry);
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
  state.selected = { kind: 'mob', file };
  renderSidebar();
  renderEditor();
}

// The Wolf-shaped combat-mob template (CLAUDE.md's ARCHETYPE RULE — HP 55 /
// speed 0.7 / aggro 3.0 is the reference unit every other species' numbers
// are a RATIO to, TestGuardrails_ArchetypeTrade enforces it catalog-wide).
// No `entityType` and no `faction` are set: a new mob resolves by NAME
// against the EntityType enum, and for a genuinely new species that
// legitimately fails validation immediately — which is deliberate. This
// editor never pretends a species with no sprite is ready to ship; the error
// box is what tells you to either author an `entityType` override reusing
// existing art, or walk the manual 5-file wire path first.
function createNewMob() {
  const display = prompt('New mob name (e.g. "Cave Troll"):');
  if (!display) return;
  const name = toCamelName(display);
  const slug = slugify(display);
  if (!name || !slug) { alert('That name needs at least one letter or number.'); return; }
  const file = `api/mobs/${slug}.json`;
  if (findMob(file) || state.mobs.some((m) => m.raw.name === name)) {
    alert(`A mob already resolves to "${file}" (name "${name}"). Pick a different name.`);
    return;
  }
  const nextId = state.mobs.reduce((max, m) => Math.max(max, m.raw.id || 0), 0) + 1;
  const raw = {
    id: nextId,
    name,
    type: 'MOB',
    tier: 'normal',
    curveLevel: 1,
    factors: { baseMaxHealth: 55, speed: 0.7 },
    body: { radius: 0.3, aggroRadius: 3 },
    skills: [],
    unlocks: [],
  };
  const entry = { file, raw, isNew: true };
  state.mobs.push(entry);
  state.selected = { kind: 'mob', file };
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

// Faction filenames are snake_case matching their `name` field verbatim
// (wildlife_predator.json) — a different convention from mobs/quests'
// kebab-case slugs, so this gets its own slugifier rather than reusing
// slugify().
function snakeSlugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function createNewFaction() {
  const display = prompt('New faction name (e.g. "Sea Raiders"):');
  if (!display) return;
  const name = snakeSlugify(display);
  if (!name) { alert('That name needs at least one letter or number.'); return; }
  if (RESERVED_FACTION_NAMES.includes(name)) { alert(`"${name}" is a reserved built-in faction and can't be declared.`); return; }
  const file = `api/factions/${name}.json`;
  if (findFaction(file) || state.factions.some((f) => f.raw.name === name)) {
    alert(`A faction already resolves to "${file}" (name "${name}"). Pick a different name.`);
    return;
  }
  const raw = { name, displayName: display, hostileTo: [], friendlyToPlayers: false };
  const entry = { file, raw, isNew: true };
  state.factions.push(entry);
  state.selected = { kind: 'faction', file };
  renderSidebar();
  renderEditor();
}

// A recipe's filename has no fixed relationship to its `result` field
// (`barrier-home.json` results in "Barrier") — it's just a descriptive slug
// — so this prompts for a filename-ish title separately from picking the
// result skill, which happens in the editor form itself (left blank here,
// so validation immediately flags it as the one thing left to fill in).
function createNewRecipe() {
  const title = prompt('New recipe name, for the filename (e.g. "Ice Wall"; you\'ll pick the result skill next, in the form):');
  if (!title) return;
  const slug = slugify(title);
  if (!slug) { alert('That name needs at least one letter or number.'); return; }
  const file = `api/recipes/${slug}.json`;
  if (findRecipe(file)) { alert(`A recipe already resolves to "${file}". Pick a different name.`); return; }
  const nextId = state.recipes.reduce((max, r) => Math.max(max, r.raw.id ?? 0), 0) + 1;
  const raw = { id: nextId, result: '', ingredients: [] };
  const entry = { file, raw, isNew: true };
  state.recipes.push(entry);
  state.selected = { kind: 'recipe', file };
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
  state.skillMaxLevels = data.skillMaxLevels;
  state.factions = data.factions;
  state.recipes = data.recipes;
  state.milestones = data.milestones;
  state.entityTypes = data.entityTypes;
  for (const m of state.mobs) markPristine(m.file);
  for (const q of state.quests) markPristine(q.file);
  for (const f of state.factions) markPristine(f.file);
  for (const r of state.recipes) markPristine(r.file);
  if (state.milestones) markPristine(state.milestones.file);
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
  if (m) { state.selected = { kind: 'mob', file }; renderSidebar(); renderEditor(); return; }
  const q = findQuest(file);
  if (q) { state.selected = { kind: 'quest', file }; renderSidebar(); renderEditor(); return; }
  const f = findFaction(file);
  if (f) { state.selected = { kind: 'faction', file }; renderSidebar(); renderEditor(); return; }
  const r = findRecipe(file);
  if (r) { state.selected = { kind: 'recipe', file }; renderSidebar(); renderEditor(); return; }
  if (state.milestones && state.milestones.file === file) {
    state.selected = { kind: 'milestones', file }; renderSidebar(); renderEditor(); return;
  }
}

/* ---- sidebar ------------------------------------------------------------ */
// NPCs/Mobs are the SAME editor now (renderMobEditor) — an NPC is just a mob
// that carries an interaction block (docs/manual-content-authoring.md §1c) —
// so both tabs use kind:'mob' throughout; they differ only in which slice of
// the roster they filter to, as a browsing convenience.
function renderSidebar() {
  const npcs = mobsWithInteraction().filter((m) => matchesFilter(m.raw.name, state.npcFilter));
  renderFactionGroupedList(npcListEl, npcs, state.npcFactionCollapsed);

  const quests = state.quests.filter((q) => matchesFilter(q.raw.title || q.raw.id, state.questFilter));
  questListEl.innerHTML = '';
  for (const q of quests.sort((a, b) => (a.raw.title || a.raw.id).localeCompare(b.raw.title || b.raw.id))) {
    questListEl.appendChild(sidebarItem(q.raw.title || q.raw.id, q.file, 'quest'));
  }

  const mobs = state.mobs.filter((m) => matchesFilter(m.raw.name, state.mobFilter));
  renderFactionGroupedList(mobListEl, mobs, state.mobFactionCollapsed);

  const factions = state.factions.filter((f) => matchesFilter(f.raw.displayName || f.raw.name, state.factionFilter));
  factionListEl.innerHTML = '';
  for (const f of factions.sort((a, b) => (a.raw.displayName || a.raw.name).localeCompare(b.raw.displayName || b.raw.name))) {
    factionListEl.appendChild(sidebarItem(f.raw.displayName || f.raw.name, f.file, 'faction'));
  }

  const recipes = state.recipes.filter((r) => matchesFilter(r.raw.result, state.recipeFilter));
  recipeListEl.innerHTML = '';
  for (const r of recipes.sort((a, b) => (a.raw.result || '').localeCompare(b.raw.result || ''))) {
    recipeListEl.appendChild(sidebarItem(r.raw.result || '(no result set)', r.file, 'recipe'));
  }

  milestonesListEl.innerHTML = '';
  if (state.milestones) {
    milestonesListEl.appendChild(sidebarItem(`Milestone unlocks (${state.milestones.raw.length})`, state.milestones.file, 'milestones'));
  }
}

function matchesFilter(name, filter) {
  return !filter || (name || '').toLowerCase().includes(filter.toLowerCase());
}

// Groups entries by mob.faction (absent = the built-in 'hostile' default),
// alphabetically by DISPLAY name, each group a collapsible <li><ul> nested
// inside the outer .item-list — collapsedSet tracks which faction NAMES
// (the raw key, not the display label) are folded, shared across a re-render
// so re-selecting an item doesn't reset what the user folded.
function renderFactionGroupedList(container, entries, collapsedSet) {
  container.innerHTML = '';
  const groups = new Map();
  for (const m of entries) {
    const faction = m.raw.faction || '';
    if (!groups.has(faction)) groups.set(faction, []);
    groups.get(faction).push(m);
  }
  const factions = [...groups.keys()].sort((a, b) => factionDisplayName(a).localeCompare(factionDisplayName(b)));
  for (const faction of factions) {
    const items = groups.get(faction).sort((a, b) => a.raw.name.localeCompare(b.raw.name));
    container.appendChild(factionGroup(faction, items, collapsedSet));
  }
}

function factionGroup(faction, items, collapsedSet) {
  const collapsed = collapsedSet.has(faction);
  const itemsList = el('ul', { class: 'faction-items' }, items.map((m) => sidebarItem(m.raw.name, m.file, 'mob')));
  const li = el('li', { class: 'faction-group' + (collapsed ? ' collapsed' : '') }, [
    el('div', {
      class: 'faction-header',
      onclick: () => {
        if (collapsedSet.has(faction)) collapsedSet.delete(faction); else collapsedSet.add(faction);
        renderSidebar();
      },
    }, [
      el('span', { class: 'chevron', text: '▾' }),
      el('span', { class: 'faction-name', text: factionDisplayName(faction) }),
      el('span', { class: 'faction-count', text: String(items.length) }),
    ]),
    itemsList,
  ]);
  return li;
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
$('#mob-filter').addEventListener('input', (e) => { state.mobFilter = e.target.value; renderSidebar(); });
$('#faction-filter').addEventListener('input', (e) => { state.factionFilter = e.target.value; renderSidebar(); });
$('#recipe-filter').addEventListener('input', (e) => { state.recipeFilter = e.target.value; renderSidebar(); });
$('#revalidate-btn').addEventListener('click', runGlobalValidation);
$('#npc-new-btn').addEventListener('click', createNewNpc);
$('#quest-new-btn').addEventListener('click', createNewQuest);
$('#mob-new-btn').addEventListener('click', createNewMob);
$('#faction-new-btn').addEventListener('click', createNewFaction);
$('#recipe-new-btn').addEventListener('click', createNewRecipe);

const tabButtons = document.querySelectorAll('#sidebar-tabs .tab-btn');
for (const btn of tabButtons) {
  btn.addEventListener('click', () => switchSidebarTab(btn.dataset.tab));
}
function switchSidebarTab(tab) {
  for (const btn of tabButtons) btn.classList.toggle('active', btn.dataset.tab === tab);
  for (const sec of document.querySelectorAll('.sidebar-section')) {
    sec.hidden = sec.dataset.section !== tab;
  }
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
  if (state.selected.kind === 'quest') renderQuestEditor(findQuest(state.selected.file));
  else if (state.selected.kind === 'faction') renderFactionEditor(findFaction(state.selected.file));
  else if (state.selected.kind === 'recipe') renderRecipeEditor(findRecipe(state.selected.file));
  else if (state.selected.kind === 'milestones') renderMilestonesEditor(state.milestones);
  else renderMobEditor(findMob(state.selected.file));
}

/* ======================================================================
 * Mob editor — full stat fields PLUS the dialogue tree when the mob carries
 * one. An NPC is not a separate schema: it's an ordinary mob definition with
 * an `interaction` block (docs/manual-content-authoring.md §1c), so one
 * editor covers both — the dialogue-tree section just doesn't render (a
 * "+ Add dialogue tree" button stands in) when there's no interaction yet.
 * ==================================================================== */
function renderMobEditor(entry) {
  const mob = entry.raw;

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
      el('button', { onclick: () => resetEntry(entry, 'mob') }, 'Reset'),
      el('button', { class: 'primary', onclick: () => saveMob(entry) }, 'Save'),
    ]),
  ]);
  editorRoot.appendChild(header);

  const errBox = el('div', { class: 'errors-inline', id: 'mob-errors' });
  editorRoot.appendChild(errBox);

  // One combined validation pass — mob-level rules always, interaction-level
  // ones only when this mob actually carries a dialogue tree — shown in one
  // place rather than split across sections; each message already names its
  // own node/option, so it's still easy to place.
  function refreshErrors() {
    const errors = [...validateMob(mob, idx()), ...(mob.interaction ? validateInteraction(mob, idx()) : [])];
    errBox.innerHTML = '';
    for (const e of errors) errBox.appendChild(el('div', { class: 'err-line', text: e.message }));
    sidebarBumpDirty();
  }

  editorRoot.appendChild(identitySection(mob, refreshErrors));
  editorRoot.appendChild(factorsSection(mob, refreshErrors));
  editorRoot.appendChild(bodySection(mob, refreshErrors));
  editorRoot.appendChild(skillsSection(mob, refreshErrors));
  editorRoot.appendChild(unlocksSection(mob, refreshErrors));
  editorRoot.appendChild(dialogueTreeSection(mob, refreshErrors));

  refreshErrors();
}

// A collapsible section: click the header to fold/unfold the body, state
// tracked in state.mobSectionCollapsed (shared across every mob you open —
// "hide Factors while I work on dialogue" is a standing preference, not a
// per-mob one). Callers append their content into the RETURNED `.body`, not
// the section itself, and return `.section` up to renderMobEditor.
function statSection(title) {
  const collapsed = state.mobSectionCollapsed.has(title);
  const body = el('div', { class: 'stat-section-body' });
  const section = el('div', { class: 'stat-section' + (collapsed ? ' collapsed' : '') }, [
    el('div', {
      class: 'stat-section-head',
      onclick: () => {
        if (state.mobSectionCollapsed.has(title)) state.mobSectionCollapsed.delete(title); else state.mobSectionCollapsed.add(title);
        renderEditor();
      },
    }, [
      el('span', { class: 'chevron', text: '▾' }),
      el('h3', { text: title }),
    ]),
    body,
  ]);
  return { section, body };
}

function identitySection(mob, onChange) {
  const col = statSection('Identity');
  col.body.appendChild(el('div', { class: 'stat-grid' }, [
    field('Faction (blank = hostile)', select(['', ...state.factions.map((f) => f.raw.name)], mob.faction || '', (v) => { mob.faction = v; onChange(); }, (v) => v ? factionDisplayName(v) : '— hostile —')),
    field('Tier', select(TIERS, mob.tier || 'normal', (v) => { mob.tier = v; onChange(); })),
    field('Role', select(ROLES, mob.role || 'creature', (v) => { mob.role = v; onChange(); })),
    field('Curve level', numberInput(mob.curveLevel ?? 1, (v) => { mob.curveLevel = v; onChange(); })),
    field('Entity type override (blank = name resolves)', select(['', ...state.entityTypes], mob.entityType || '', (v) => { mob.entityType = v; onChange(); }, (v) => v || '— use name —')),
    field('Legacy', checkboxInput(!!mob.legacy, (v) => { mob.legacy = v; onChange(); })),
  ]));
  return col.section;
}

function factorsSection(mob, onChange) {
  const factors = mob.factors || {};
  const setFactor = (key) => (v) => { mob.factors = mob.factors || {}; mob.factors[key] = v; onChange(); };
  const col = statSection('Factors');
  col.body.appendChild(el('div', { class: 'stat-grid' }, [
    field('Base max health', numberInput(factors.baseMaxHealth ?? 0, setFactor('baseMaxHealth'))),
    field('XP factor (blank = 1, ordinary; 0 = no XP)', nullableNumberInput(factors.xpFactor, (v) => {
      mob.factors = mob.factors || {};
      if (v === undefined) delete mob.factors.xpFactor; else mob.factors.xpFactor = v;
      onChange();
    })),
    field('CC immune (required at tier elite/boss)', triStateSelect(factors.ccImmune, (v) => {
      mob.factors = mob.factors || {};
      if (v === undefined) delete mob.factors.ccImmune; else mob.factors.ccImmune = v;
      onChange();
    })),
    field('Speed', numberInput(factors.speed ?? 0, setFactor('speed'))),
    field('Delta phi', numberInput(factors.deltaPhi ?? 0, setFactor('deltaPhi'))),
    field('Turn rate', numberInput(factors.turnRate ?? 0, setFactor('turnRate'))),
    field('Max health variance [0,1)', numberInput(factors.maxHealthVariance ?? 0, setFactor('maxHealthVariance'))),
    field('Flee below health ratio [0,1]', numberInput(factors.fleeBelowHealthRatio ?? 0, setFactor('fleeBelowHealthRatio'))),
    field('Support threshold [0,1] (blank = 1.0)', numberInput(factors.supportThreshold ?? 0, setFactor('supportThreshold'))),
    field('Wander radius (needs speed > 0)', numberInput(factors.wanderRadius ?? 0, setFactor('wanderRadius'))),
    field('Idle speed factor [0,1]', numberInput(factors.idleSpeedFactor ?? 0, setFactor('idleSpeedFactor'))),
    field('Idle dwell min ticks', numberInput(factors.idleDwellMinTicks ?? 0, setFactor('idleDwellMinTicks'))),
    field('Idle dwell max ticks', numberInput(factors.idleDwellMaxTicks ?? 0, setFactor('idleDwellMaxTicks'))),
  ]));
  col.body.appendChild(el('div', { class: 'subsection' }, [
    el('div', { class: 'subsection-title', text: 'Resistances (blank = no entry; 0 = immune)' }),
    resistancesGrid(mob, onChange),
  ]));
  col.body.appendChild(el('div', { class: 'subsection' }, [
    el('div', { class: 'subsection-title', text: 'Gate keys (chore-only damage; opts this mob into being hit by it)' }),
    gateKeysCheckboxes(mob, onChange),
  ]));
  return col.section;
}

function bodySection(mob, onChange) {
  const body = mob.body || {};
  const setBody = (key) => (v) => { mob.body = mob.body || {}; mob.body[key] = v; onChange(); };
  const col = statSection('Body');
  col.body.appendChild(el('div', { class: 'stat-grid' }, [
    field('Radius', numberInput(body.radius ?? 0, setBody('radius'))),
    field('Aggro radius (required unless role = structure)', numberInput(body.aggroRadius ?? 0, setBody('aggroRadius'))),
  ]));
  col.body.appendChild(el('div', { class: 'subsection' }, [
    el('div', { class: 'subsection-title', text: 'Collision layer — what this body IS' }),
    bodyBitmask(mob, 'collisionLayer', onChange),
  ]));
  col.body.appendChild(el('div', { class: 'subsection' }, [
    el('div', { class: 'subsection-title', text: 'Collision mask — what this body COLLIDES WITH' }),
    bodyBitmask(mob, 'collisionMask', onChange),
  ]));
  return col.section;
}

function resistancesGrid(mob, onChange) {
  const wrap = el('div', { class: 'resist-grid' });
  const resistances = (mob.factors && mob.factors.resistances) || {};
  for (const tag of [...DAMAGE_TYPES, RESIST_WILDCARD]) {
    const current = resistances[tag];
    wrap.appendChild(el('div', { class: 'resist-cell' }, [
      el('label', { text: tag === RESIST_WILDCARD ? '* (all)' : tag }),
      el('input', {
        type: 'number', value: current ?? '', placeholder: '—',
        oninput: (e) => {
          const v = e.target.value;
          mob.factors = mob.factors || {};
          if (v === '') {
            if (mob.factors.resistances) delete mob.factors.resistances[tag];
          } else {
            mob.factors.resistances = mob.factors.resistances || {};
            mob.factors.resistances[tag] = Number(v);
          }
          onChange();
        },
      }),
    ]));
  }
  return wrap;
}

function gateKeysCheckboxes(mob, onChange) {
  const wrap = el('div', { class: 'bitmask-group' });
  const keys = (mob.factors && mob.factors.gateKeys) || [];
  for (const key of GATE_KEYS) {
    wrap.appendChild(el('label', { class: 'bitmask-bit' }, [
      el('input', {
        type: 'checkbox', checked: keys.includes(key),
        onchange: (e) => {
          mob.factors = mob.factors || {};
          const list = mob.factors.gateKeys || [];
          if (e.target.checked) { if (!list.includes(key)) list.push(key); }
          else { const i = list.indexOf(key); if (i >= 0) list.splice(i, 1); }
          mob.factors.gateKeys = list;
          onChange();
        },
      }),
      key,
    ]));
  }
  return wrap;
}

function bodyBitmask(mob, key, onChange) {
  const wrap = el('div', { class: 'bitmask-group' });
  let mask = (mob.body && mob.body[key]) || 0;
  for (const { bit, name } of COLLISION_LAYER_BITS) {
    wrap.appendChild(el('label', { class: 'bitmask-bit' }, [
      el('input', {
        type: 'checkbox', checked: (mask & bit) !== 0,
        onchange: (e) => {
          mask = e.target.checked ? (mask | bit) : (mask & ~bit);
          mob.body = mob.body || {};
          mob.body[key] = mask;
          onChange();
        },
      }),
      name,
    ]));
  }
  return wrap;
}

function skillsSection(mob, onChange) {
  const col = statSection('Skills');
  const rowsWrap = el('div');
  function rerender() {
    const skills = mob.skills || [];
    rowsWrap.innerHTML = '';
    if (skills.length) rowsWrap.appendChild(colHeaders([{ label: 'Skill', cls: 'col-flex' }, { label: 'Level', cls: 'col-fixed-sm' }]));
    skills.forEach((s, i) => rowsWrap.appendChild(skillRow(mob, s, i, () => { rerender(); onChange(); })));
  }
  rerender();
  col.body.appendChild(rowsWrap);
  col.body.appendChild(el('button', { class: 'add-row', onclick: () => { mob.skills = mob.skills || []; mob.skills.push({ skillName: '', level: 1 }); rerender(); onChange(); } }, '+ Add skill'));
  return col.section;
}

function skillRow(mob, s, i, onChange) {
  const wrap = el('div', { class: 'condition-row' });
  wrap.appendChild(select(['', ...state.skillNames], s.skillName || '', (v) => { s.skillName = v; onChange(); }, (v) => v || '— skill —', 'col-flex'));
  wrap.appendChild(numberInput(s.level ?? 1, (v) => { s.level = v; onChange(); }, 'level', 'col-fixed-sm'));
  wrap.appendChild(el('button', { class: 'danger', onclick: () => { mob.skills.splice(i, 1); onChange(); } }, '×'));
  return wrap;
}

function unlocksSection(mob, onChange) {
  const col = statSection('Unlocks (kill-drop skill grants)');
  const rowsWrap = el('div');
  function rerender() {
    const unlocks = mob.unlocks || [];
    rowsWrap.innerHTML = '';
    if (unlocks.length) rowsWrap.appendChild(colHeaders([{ label: 'Skill', cls: 'col-flex' }, { label: 'Chance (blank = guaranteed)', cls: 'col-fixed-md' }]));
    unlocks.forEach((u, i) => rowsWrap.appendChild(unlockRow(mob, u, i, () => { rerender(); onChange(); })));
  }
  rerender();
  col.body.appendChild(rowsWrap);
  col.body.appendChild(el('button', { class: 'add-row', onclick: () => { mob.unlocks = mob.unlocks || []; mob.unlocks.push({ skillName: '' }); rerender(); onChange(); } }, '+ Add unlock'));
  return col.section;
}

function unlockRow(mob, u, i, onChange) {
  const wrap = el('div', { class: 'condition-row' });
  wrap.appendChild(select(['', ...state.skillNames], u.skillName || '', (v) => { u.skillName = v; onChange(); }, (v) => v || '— skill —', 'col-flex'));
  wrap.appendChild(nullableNumberInput(u.chance, (v) => { if (v === undefined) delete u.chance; else u.chance = v; onChange(); }, 'chance', 'col-fixed-md'));
  wrap.appendChild(el('button', { class: 'danger', onclick: () => { mob.unlocks.splice(i, 1); onChange(); } }, '×'));
  return wrap;
}

// The dialogue-tree UI, unchanged from the earlier NPC-only editor except
// that it now returns a container to slot under the stat sections instead
// of appending straight to editorRoot, and reports edits through `onChange`
// (renderMobEditor's combined validator) instead of keeping its own error
// box. "+ Add dialogue tree" triggers a full renderEditor() since adding the
// block changes what this whole function needs to show.
function dialogueTreeSection(mob, onChange) {
  const col = statSection('Dialogue tree');
  if (!mob.interaction) {
    col.body.appendChild(el('div', { class: 'mob-readonly-note' }, 'This mob has no interaction block — it is not an NPC.'));
    col.body.appendChild(el('button', {
      class: 'primary',
      onclick: () => {
        mob.interaction = { range: 2, ambient: [], nodes: [{ id: 'root', lines: ["TODO: write this NPC's opening line."], options: [] }] };
        renderEditor();
      },
    }, '+ Add dialogue tree'));
    return col.section;
  }

  const inter = mob.interaction;
  col.body.appendChild(el('div', { class: 'top-fields' }, [
    field('Range', numberInput(inter.range ?? 0, (v) => { inter.range = v; onChange(); })),
    field('Ambient (one hail per line)', textArea((inter.ambient || []).join('\n'), (v) => {
      inter.ambient = splitLines(v); onChange();
    }, 'lines-textarea')),
  ]));

  const graphWrap = el('div', { class: 'graph-wrap' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'graph-svg');
  const nodeCol = el('div', { class: 'node-col' });
  graphWrap.appendChild(svg);
  graphWrap.appendChild(nodeCol);
  col.body.appendChild(graphWrap);

  function rerenderNodes() {
    nodeCol.innerHTML = '';
    inter.nodes.forEach((node, i) => nodeCol.appendChild(nodeCard(mob, inter, node, i)));
    scheduleRedraw(graphWrap, svg);
    onChange();
  }
  window.__ceRedraw = () => scheduleRedraw(graphWrap, svg);

  col.body.appendChild(el('div', { class: 'add-row' }, [
    el('button', {
      onclick: () => {
        inter.nodes.push({ id: '', lines: [], options: [] });
        rerenderNodes();
      },
    }, '+ Add node'),
  ]));

  function nodeCard(mob, inter, node, i) {
    const nodeIds = inter.nodes.map((n) => n.id).filter(Boolean);
    const card = el('div', { class: 'card', 'data-anchor-in': node.id || `__idx${i}` });

    const head = el('div', { class: 'card-head' }, [
      el('span', { class: 'idx', text: '#' + i }),
      el('input', {
        class: 'node-id', type: 'text', value: node.id, placeholder: 'node id',
        oninput: (e) => { node.id = e.target.value; card.dataset.anchorIn = node.id || `__idx${i}`; scheduleRedraw(graphWrap, svg); onChange(); },
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

    card.appendChild(conditionsSection(node, onChange));

    card.appendChild(el('div', { class: 'subsection' }, [
      el('label', { text: 'Lines' }),
      textArea((node.lines || []).join('\n'), (v) => { node.lines = splitLines(v); onChange(); }, 'lines-textarea'),
    ]));

    if (node.rows === 'ascension_catalog') {
      card.appendChild(el('div', { class: 'subsection' }, [
        el('label', { text: 'Rewards (one unlock key per line)' }),
        textArea((node.rewards || []).join('\n'), (v) => { node.rewards = splitLines(v); onChange(); }, 'rewards-textarea'),
      ]));
    }

    if (!node.rows) {
      const optsCol = el('div', { class: 'options-col' });
      const options = node.options || [];
      options.forEach((opt, oi) => optsCol.appendChild(optionCard(mob, inter, node, opt, i, oi, nodeIds, onChange, () => { rerenderNodes(); })));
      card.appendChild(el('div', { class: 'subsection' }, [
        el('div', { class: 'subsection-title', text: 'Options' }),
        options.length ? colHeaders([{ label: 'Text', cls: 'col-flex' }, { label: 'Next', cls: 'col-fixed-lg' }]) : null,
        optsCol,
        el('button', { class: 'add-row', onclick: () => { node.options = node.options || []; node.options.push({ text: '', next: '', grants: [] }); rerenderNodes(); } }, '+ Add option'),
      ]));
    }

    return card;
  }

  rerenderNodes();
  return col.section;
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
  const grants = opt.grants || [];
  grants.forEach((g, gi) => grantsCol.appendChild(grantRow(mob, opt, g, gi, onChange, onStructuralChange)));
  card.appendChild(grantsCol);
  if (grants.length) {
    grantsCol.before(colHeaders([{ label: 'Kind', cls: 'col-fixed-md' }, { label: 'Line', cls: 'col-flex' }]));
  }
  card.appendChild(el('button', { class: 'add-row', onclick: () => { opt.grants = opt.grants || []; opt.grants.push({ kind: 'teach_skill', line: '' }); onStructuralChange(); } }, '+ Add grant'));
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
  const headerSlot = el('div');
  const rowsWrap = el('div');
  function rerender() {
    const conditions = node.conditions || [];
    headerSlot.innerHTML = '';
    if (conditions.length) headerSlot.appendChild(colHeaders([{ label: 'Kind', cls: 'col-fixed-md' }]));
    rowsWrap.innerHTML = '';
    conditions.forEach((c, ci) => rowsWrap.appendChild(conditionRow(node, c, ci, () => { rerender(); onChange(); })));
  }
  rerender();
  col.appendChild(headerSlot);
  col.appendChild(rowsWrap);
  col.appendChild(el('button', { class: 'add-row', onclick: () => { node.conditions = node.conditions || []; node.conditions.push({ kind: 'minLevel', value: 1 }); rerender(); onChange(); } }, '+ Add condition'));
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

async function saveMob(entry) {
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
    const objectives = s.objectives || [];
    objectives.forEach((o, oi) => objCol.appendChild(objectiveRow(s, o, oi, refresh, rerender)));
    card.appendChild(el('div', { class: 'subsection' }, [
      el('div', { class: 'subsection-title', text: 'Objectives (leave empty for a dialogue stage)' }),
      objectives.length ? colHeaders([{ label: 'Kind', cls: 'col-fixed-md' }, { label: 'Target', cls: 'col-flex' }, { label: 'Count', cls: 'col-fixed-sm' }]) : null,
      objCol,
      el('button', { class: 'add-row', onclick: () => { s.objectives = s.objectives || []; s.objectives.push({ kind: 'kill', species: '', count: 1 }); rerender(); } }, '+ Add objective'),
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
// that grants/turns in this stage — renderMobEditor builds its DOM
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

/* ======================================================================
 * Faction editor
 * ==================================================================== */
function renderFactionEditor(entry) {
  const faction = entry.raw;

  const header = el('div', { class: 'editor-header' }, [
    el('div', {}, [
      el('h2', { text: faction.displayName || faction.name }),
      el('div', { class: 'file-path' }, [
        document.createTextNode(entry.file),
        entry.isNew ? el('span', { class: 'new-badge', text: 'not yet saved' }) : null,
      ]),
    ]),
    el('div', { class: 'editor-actions' }, [
      el('span', { class: 'save-feedback', id: 'save-feedback' }),
      el('button', { onclick: () => resetEntry(entry, 'faction') }, 'Reset'),
      el('button', { class: 'primary', onclick: () => saveFaction(entry) }, 'Save'),
    ]),
  ]);
  editorRoot.appendChild(header);

  const errBox = el('div', { class: 'errors-inline', id: 'faction-errors' });
  editorRoot.appendChild(errBox);

  function refreshErrors() {
    const errors = validateFaction(faction, idx());
    errBox.innerHTML = '';
    for (const e of errors) errBox.appendChild(el('div', { class: 'err-line', text: e.message }));
    sidebarBumpDirty();
  }

  editorRoot.appendChild(el('div', { class: 'top-fields' }, [
    field('Display name (blank = internal name)', textInput(faction.displayName || '', (v) => { faction.displayName = v; refreshErrors(); })),
    field('Friendly to players (harm-proof to player/summon damage)', checkboxInput(!!faction.friendlyToPlayers, (v) => { faction.friendlyToPlayers = v; refreshErrors(); })),
  ]));

  editorRoot.appendChild(el('div', { class: 'subsection' }, [
    el('div', {
      class: 'subsection-title',
      text: 'Hostile to (proactively aggros)',
      title: 'Every faction that fights players declares hostileTo: ["aligned"] — retaliation (fighting back when hit) is automatic and separate from this list, which only drives PROACTIVE aggro.',
    }),
    hostileToCheckboxes(faction, refreshErrors),
  ]));

  refreshErrors();
}

function hostileToCheckboxes(faction, onChange) {
  const wrap = el('div', { class: 'bitmask-group' });
  const targets = [...RESERVED_FACTION_NAMES, ...state.factions.map((f) => f.raw.name).filter((n) => n !== faction.name)].sort();
  const list = faction.hostileTo || [];
  for (const target of targets) {
    const label = target === 'aligned' ? 'aligned (players)' : target === 'hostile' ? 'hostile (the unauthored default)' : factionDisplayName(target);
    wrap.appendChild(el('label', { class: 'bitmask-bit' }, [
      el('input', {
        type: 'checkbox', checked: list.includes(target),
        onchange: (e) => {
          faction.hostileTo = faction.hostileTo || [];
          if (e.target.checked) { if (!faction.hostileTo.includes(target)) faction.hostileTo.push(target); }
          else { const i = faction.hostileTo.indexOf(target); if (i >= 0) faction.hostileTo.splice(i, 1); }
          onChange();
        },
      }),
      label,
    ]));
  }
  return wrap;
}

async function saveFaction(entry) {
  const fb = $('#save-feedback');
  fb.textContent = 'saving…'; fb.className = 'save-feedback';
  const res = await fetch('/api/save/faction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: entry.file, raw: entry.raw, isNew: !!entry.isNew }) });
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
 * Recipe editor — a combination unlock: `result` (an already-authored skill)
 * plus an `ingredients[]` threshold (each own skill's level, checked, never
 * spent). Flat schema, same top-fields/subsection shape as the faction
 * editor rather than the mob editor's collapsible stat sections.
 * ==================================================================== */
function renderRecipeEditor(entry) {
  const recipe = entry.raw;

  const header = el('div', { class: 'editor-header' }, [
    el('div', {}, [
      el('h2', { text: recipe.result || '(no result set)' }),
      el('div', { class: 'file-path' }, [
        document.createTextNode(entry.file),
        entry.isNew ? el('span', { class: 'new-badge', text: 'not yet saved' }) : null,
      ]),
    ]),
    el('div', { class: 'editor-actions' }, [
      el('span', { class: 'save-feedback', id: 'save-feedback' }),
      el('button', { onclick: () => resetEntry(entry, 'recipe') }, 'Reset'),
      el('button', { class: 'primary', onclick: () => saveRecipe(entry) }, 'Save'),
    ]),
  ]);
  editorRoot.appendChild(header);

  const errBox = el('div', { class: 'errors-inline', id: 'recipe-errors' });
  editorRoot.appendChild(errBox);

  function refreshErrors() {
    const errors = validateRecipe(recipe, idx());
    errBox.innerHTML = '';
    for (const e of errors) errBox.appendChild(el('div', { class: 'err-line', text: e.message }));
    sidebarBumpDirty();
  }

  editorRoot.appendChild(el('div', { class: 'top-fields' }, [
    field('Id (author-picked, must be unique)', numberInput(recipe.id ?? 0, (v) => { recipe.id = v; refreshErrors(); })),
    field('Result skill (must already exist under api/skills/)', select(['', ...state.skillNames], recipe.result || '', (v) => { recipe.result = v; refreshErrors(); }, (v) => v || '— pick a skill —')),
  ]));

  editorRoot.appendChild(el('div', { class: 'subsection' }, [
    el('div', {
      class: 'subsection-title',
      text: 'Ingredients',
      title: 'Each ingredient is a THRESHOLD, not a cost — the player\'s spellbook level for that skill must be at or above the given level, and nothing is spent when the recipe fires. A recipe result can itself be named as another recipe\'s ingredient (chaining is legal and expected).',
    }),
    ingredientsEditor(recipe, refreshErrors),
  ]));

  refreshErrors();
}

function ingredientsEditor(recipe, onChange) {
  const container = el('div');
  const rowsWrap = el('div');
  function rerender() {
    const ingredients = recipe.ingredients || [];
    rowsWrap.innerHTML = '';
    if (ingredients.length) rowsWrap.appendChild(colHeaders([{ label: 'Skill', cls: 'col-flex' }, { label: 'Level', cls: 'col-fixed-sm' }]));
    ingredients.forEach((ing, i) => rowsWrap.appendChild(ingredientRow(recipe, ing, i, () => { rerender(); onChange(); })));
  }
  rerender();
  container.appendChild(rowsWrap);
  container.appendChild(el('button', {
    class: 'add-row',
    onclick: () => { recipe.ingredients = recipe.ingredients || []; recipe.ingredients.push({ skill: '', level: 1 }); rerender(); onChange(); },
  }, '+ Add ingredient'));
  return container;
}

function ingredientRow(recipe, ing, i, onChange) {
  const wrap = el('div', { class: 'condition-row' });
  wrap.appendChild(select(['', ...state.skillNames], ing.skill || '', (v) => { ing.skill = v; onChange(); }, (v) => v || '— skill —', 'col-flex'));
  wrap.appendChild(numberInput(ing.level ?? 1, (v) => { ing.level = v; onChange(); }, 'level', 'col-fixed-sm'));
  wrap.appendChild(el('button', { class: 'danger', onclick: () => { recipe.ingredients.splice(i, 1); onChange(); } }, '×'));
  return wrap;
}

async function saveRecipe(entry) {
  const fb = $('#save-feedback');
  fb.textContent = 'saving…'; fb.className = 'save-feedback';
  const res = await fetch('/api/save/recipe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: entry.file, raw: entry.raw, isNew: !!entry.isNew }) });
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
 * Milestones editor — ONE shared file (api/milestones/milestone-unlocks.json)
 * holding a flat array, not one file per entry like every other kind here.
 * `entry` is state.milestones itself: {file, raw}, raw the whole array.
 * ==================================================================== */
function renderMilestonesEditor(entry) {
  const list = entry.raw;

  const header = el('div', { class: 'editor-header' }, [
    el('div', {}, [
      el('h2', { text: 'Milestone unlocks' }),
      el('div', { class: 'file-path' }, [document.createTextNode(entry.file)]),
    ]),
    el('div', { class: 'editor-actions' }, [
      el('span', { class: 'save-feedback', id: 'save-feedback' }),
      el('button', { onclick: () => resetEntry(entry, 'milestones') }, 'Reset'),
      el('button', { class: 'primary', onclick: () => saveMilestones(entry) }, 'Save'),
    ]),
  ]);
  editorRoot.appendChild(header);

  editorRoot.appendChild(el('div', { class: 'mob-readonly-note' },
    'Every entry grants that skill automatically: at character creation for level ≤ 1, and again on every level-up through the new level. Duplicate levels and duplicate skills are both legal (nothing here or in Go dedupes them). No other content references this file.'));

  const errBox = el('div', { class: 'errors-inline', id: 'milestones-errors' });
  editorRoot.appendChild(errBox);

  function refreshErrors() {
    const errors = validateMilestones(list, idx());
    errBox.innerHTML = '';
    for (const e of errors) errBox.appendChild(el('div', { class: 'err-line', text: e.message }));
    sidebarBumpDirty();
  }

  const rowsWrap = el('div');
  function rerender() {
    rowsWrap.innerHTML = '';
    if (list.length) rowsWrap.appendChild(colHeaders([{ label: 'Level', cls: 'col-fixed-sm' }, { label: 'Skill', cls: 'col-flex' }]));
    list.forEach((m, i) => rowsWrap.appendChild(milestoneRow(list, m, i, () => { rerender(); refreshErrors(); })));
  }
  rerender();
  editorRoot.appendChild(rowsWrap);
  editorRoot.appendChild(el('button', {
    class: 'add-row',
    onclick: () => { list.push({ level: 1, skillName: '' }); rerender(); refreshErrors(); },
  }, '+ Add milestone'));

  refreshErrors();
}

function milestoneRow(list, m, i, onChange) {
  const wrap = el('div', { class: 'condition-row' });
  wrap.appendChild(numberInput(m.level ?? 1, (v) => { m.level = v; onChange(); }, 'level', 'col-fixed-sm'));
  wrap.appendChild(select(['', ...state.skillNames], m.skillName || '', (v) => { m.skillName = v; onChange(); }, (v) => v || '— skill —', 'col-flex'));
  wrap.appendChild(el('button', { class: 'danger', onclick: () => { list.splice(i, 1); onChange(); } }, '×'));
  return wrap;
}

async function saveMilestones(entry) {
  const fb = $('#save-feedback');
  fb.textContent = 'saving…'; fb.className = 'save-feedback';
  const res = await fetch('/api/save/milestones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: entry.raw }) });
  const body = await res.json();
  if (!body.ok) {
    fb.className = 'save-feedback err';
    fb.textContent = body.errors.join(' · ');
    return;
  }
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
// Blank means "delete the key", not 0 — for the handful of fields where Go
// distinguishes absent from an authored falsy value via a pointer
// (factors.xpFactor/ccImmune, unlocks[].chance). `value` is a number or
// undefined; onChange receives a Number or undefined, never ''.
function nullableNumberInput(value, onChange, placeholder, cls) {
  return el('input', {
    type: 'number', class: cls || '', value: value ?? '', placeholder: placeholder || '',
    oninput: (e) => onChange(e.target.value === '' ? undefined : Number(e.target.value)),
  });
}
// unset / true / false — the same pointer-semantics need as above, for
// factors.ccImmune (required, and the tier does not decide it).
function triStateSelect(value, onChange) {
  const current = value === true ? 'true' : value === false ? 'false' : '';
  const sel = el('select', { onchange: (e) => onChange(e.target.value === '' ? undefined : e.target.value === 'true') });
  for (const [v, label] of [['', '— unset —'], ['true', 'true'], ['false', 'false']]) {
    sel.appendChild(el('option', { value: v, selected: v === current }, label));
  }
  return sel;
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
