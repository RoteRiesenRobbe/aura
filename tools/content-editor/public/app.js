import {
  buildIndex, validateInteraction, validateQuest, validateAll, validateMob, validateFaction,
  validateRecipe, validateMilestones,
  ROLES, TIERS, DAMAGE_TYPES, RESIST_WILDCARD, GATE_KEYS, COLLISION_LAYER_BITS, RESERVED_FACTION_NAMES, TRAVEL_MODES,
} from '/validate.mjs';
import {
  EFFECT_TYPE_NOTES, EFFECT_TYPE_DEFAULTS, CATEGORY_LABELS, HIDDEN_EFFECT_TYPES, TEST_RIG_SKILLS,
  resolveAt, scalingPairs, presentationFor, labelFor, ticksToSecondsLabel, formatNumber,
} from '/skill-presentation.mjs';
import { collectSkillReferences } from '/skill-references.mjs';

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
  skills: [],     // [{file, raw}], BOTH api/skills/*.json and api/skills/mobs/*.json (§B10 L6); the tab shows only the former
  skillVocabulary: null, // the generated fixture merged with shared-constants (vocabulary.mjs); the Skills form renders FROM this
  skillIcons: {},  // {key: {viewBox, body}} - the VENDORED glyph set, parsed off the generated client artifact (C4, §B4.4)
  ticksPerSecond: 30,
  entityTypes: [],
  pristine: new Map(), // file -> JSON string at load/save time
  selected: null, // {kind:'mob'|'quest'|'faction'|'recipe'|'milestones', file} — an NPC IS a mob (one w/ interaction), so one editor covers both
  npcFilter: '',
  questFilter: '',
  mobFilter: '',
  factionFilter: '',
  recipeFilter: '',
  skillFilter: '',
  // Faction names (or 'hostile', the built-in default for an unauthored
  // faction) collapsed in each sidebar tab — separate per tab so browsing
  // Mobs and NPCs can be folded differently. Session-only, like every other
  // UI-state field here; not persisted across a reload.
  npcFactionCollapsed: new Set(),
  mobFactionCollapsed: new Set(),
  skillCategoryCollapsed: new Set(),
  // stat-section titles ('Identity', 'Factors', ...) collapsed in the mob
  // editor — shared across every mob you open, since it's "I don't care
  // about Factors right now" rather than a per-mob preference.
  mobSectionCollapsed: new Set(),
  skillSectionCollapsed: new Set(),
};

// The Skills tab's scope (D2): player skills at the top of api/skills/. The
// mob-embedded ones under api/skills/mobs/ share the id and name space and
// ride in state.skills for that reason, but never appear in the tab (§B11 Q1).
const PLAYER_SKILL_FILE = /^api\/skills\/[^/]+\.json$/;
function playerSkills() { return state.skills.filter((s) => PLAYER_SKILL_FILE.test(s.file)); }

const $ = (sel) => document.querySelector(sel);
const npcListEl = $('#npc-list');
const questListEl = $('#quest-list');
const mobListEl = $('#mob-list');
const factionListEl = $('#faction-list');
const recipeListEl = $('#recipe-list');
const milestonesListEl = $('#milestones-list');
const skillListEl = $('#skill-list');
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
function findSkill(file) { return state.skills.find((s) => s.file === file); }
function isDirty(file) { return state.pristine.get(file) !== JSON.stringify(stateRawFor(file)); }
function stateRawFor(file) {
  const m = findMob(file); if (m) return m.raw;
  const q = findQuest(file); if (q) return q.raw;
  const f = findFaction(file); if (f) return f.raw;
  const r = findRecipe(file); if (r) return r.raw;
  const s = findSkill(file); if (s) return s.raw;
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
    else if (kind === 'skill') state.skills = state.skills.filter((s) => s !== entry);
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

// A new player skill (spell builder C4, §B4.5). Deliberately the SMALLEST
// prefill that is still a real file: `id`, `name` and `maxLevel`, no category
// and no effect card. The category decides which effect types are legal at all
// (the C3 rider's rule), so guessing one would either pick the author's
// direction for them or seed a card the loader refuses; the live hints ask for
// the rest instead. PO ruling 2026-09-12.
//
// ⚑ maxLevel 5 because 53 of the 72 shipped player skills use it, and it never
// decreases afterwards (L4), so the cheapest default is the common one.
// ⚑ `icon` is left EMPTY on purpose: the required hint forces a deliberate
// pick from the vendored set rather than inheriting someone else's glyph.
// ⚑ The id is max + 1 over BOTH skill folders (L6), which is why it reads
// state.skills and not playerSkills() - and it can re-mint the id of a deleted
// skill that held the maximum (L3), which the form says beside the field until
// C5's lock closes it.
function createNewSkill() {
  const display = prompt('New skill name (e.g. "Frost Nova"):');
  if (!display) return;
  const name = toCamelName(display);
  const slug = slugify(display);
  if (!name || !slug) { alert('That name needs at least one letter or number.'); return; }
  const file = `api/skills/${slug}.json`;
  if (findSkill(file) || state.skills.some((s) => s.raw.name === name)) {
    alert(`A skill already resolves to "${file}" (name "${name}"). Pick a different name.`);
    return;
  }
  const nextId = state.skills.reduce((max, s) => Math.max(max, s.raw.id || 0), 0) + 1;
  const raw = { id: nextId, name, maxLevel: 5, effects: [] };
  const entry = { file, raw, isNew: true };
  state.skills.push(entry);
  state.selected = { kind: 'skill', file };
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
  state.skills = data.skills;
  state.skillVocabulary = data.skillVocabulary;
  state.skillIcons = data.skillIcons || {};
  state.ticksPerSecond = data.ticksPerSecond;
  state.entityTypes = data.entityTypes;
  for (const m of state.mobs) markPristine(m.file);
  for (const s of state.skills) markPristine(s.file);
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
  const s = findSkill(file);
  if (s) { state.selected = { kind: 'skill', file }; renderSidebar(); renderEditor(); return; }
  if (state.milestones && state.milestones.file === file) {
    state.selected = { kind: 'milestones', file }; renderSidebar(); renderEditor(); return;
  }
}

// D6: a jump from the sources panel lands "in its own tab" - the sidebar
// follows the selection, unlike a plain selectByFile.
function jumpTo(tab, file) {
  switchSidebarTab(tab);
  selectByFile(file);
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

  renderSkillList();
}

// Skills grouped by category in the fixture's order (Auras · Cooldowns ·
// Passives, §B4.3). A file authoring a category the fixture does not know
// still shows, in its own group, rather than vanishing from the sidebar.
function renderSkillList() {
  const categories = state.skillVocabulary ? state.skillVocabulary.categories : [];
  const skills = playerSkills().filter((s) => matchesFilter(s.raw.name, state.skillFilter));
  const groups = new Map(categories.map((c) => [c, []]));
  for (const s of skills) {
    const cat = s.raw.category || '';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(s);
  }
  renderGroupedList(skillListEl, [...groups].map(([cat, items]) => ({
    key: cat,
    label: CATEGORY_LABELS[cat] || cat || '(no category)',
    items: items.sort((a, b) => (a.raw.name || '').localeCompare(b.raw.name || '')).map((s) => ({
      label: s.raw.name || s.file,
      file: s.file,
      badges: skillBadges(s),
    })),
  })), state.skillCategoryCollapsed, 'skill');
}

// The row markers a skill can carry: the cheat-only test rigs (C4) and a draft
// that has never been written. Both are ROW badges, kept out of the row's own
// name so anything reading the sidebar by name still matches.
function skillBadges(entry) {
  const out = [];
  if (TEST_RIG_SKILLS.includes(entry.raw.name)) out.push({ text: 'test rig', title: TEST_RIG_TITLE, cls: 'rig-badge' });
  if (entry.isNew) out.push({ text: 'not yet saved', title: 'A draft: nothing is on disk until you Save.', cls: 'new-badge' });
  return out;
}

function matchesFilter(name, filter) {
  return !filter || (name || '').toLowerCase().includes(filter.toLowerCase());
}

// Groups mobs by mob.faction (absent = the built-in 'hostile' default),
// alphabetically by DISPLAY name; collapsedSet tracks which faction NAMES
// (the raw key, not the display label) are folded.
function renderFactionGroupedList(container, entries, collapsedSet) {
  const groups = new Map();
  for (const m of entries) {
    const faction = m.raw.faction || '';
    if (!groups.has(faction)) groups.set(faction, []);
    groups.get(faction).push(m);
  }
  const factions = [...groups.keys()].sort((a, b) => factionDisplayName(a).localeCompare(factionDisplayName(b)));
  renderGroupedList(container, factions.map((faction) => ({
    key: faction,
    label: factionDisplayName(faction),
    items: groups.get(faction).sort((a, b) => a.raw.name.localeCompare(b.raw.name)).map((m) => ({ label: m.raw.name, file: m.file })),
  })), collapsedSet, 'mob');
}

// A sidebar list of collapsible groups, each a <li><ul> nested inside the
// outer .item-list: mobs/NPCs by faction, skills by category. `groups` is
// [{key, label, items: [{label, file}]}] in display order; empty groups are
// skipped. collapsedSet holds the folded group KEYS, shared across a re-render
// so re-selecting an item doesn't reset what the user folded.
function renderGroupedList(container, groups, collapsedSet, kind) {
  container.innerHTML = '';
  for (const group of groups) {
    if (group.items.length === 0) continue;
    container.appendChild(listGroup(group, collapsedSet, kind));
  }
}

function listGroup({ key, label, items }, collapsedSet, kind) {
  const collapsed = collapsedSet.has(key);
  const itemsList = el('ul', { class: 'group-items' }, items.map((it) => sidebarItem(it.label, it.file, kind, it.badges)));
  const li = el('li', { class: 'list-group' + (collapsed ? ' collapsed' : '') }, [
    el('div', {
      class: 'group-header',
      onclick: () => {
        if (collapsedSet.has(key)) collapsedSet.delete(key); else collapsedSet.add(key);
        renderSidebar();
      },
    }, [
      el('span', { class: 'chevron', text: '▾' }),
      el('span', { class: 'group-name', text: label }),
      el('span', { class: 'group-count', text: String(items.length) }),
    ]),
    itemsList,
  ]);
  return li;
}

// One row. ⚑ The NAME lives in its own `.item-name` span, separate from any
// badge: a row's text content is what filters, harnesses and anything else
// reading the sidebar match on, and folding a badge into it would rename the
// row as far as all of them are concerned.
function sidebarItem(label, file, kind, badges) {
  const selected = state.selected && state.selected.file === file;
  const li = el('li', {
    class: selected ? 'selected' + (isDirty(file) ? ' dirty' : '') : (isDirty(file) ? 'dirty' : ''),
    onclick: () => { state.selected = { kind, file }; renderSidebar(); renderEditor(); },
  }, [
    el('span', { class: 'dirty-dot' }),
    el('span', { class: 'item-name', text: label }),
    ...(badges || []).map((b) => el('span', { class: b.cls, title: b.title, text: b.text })),
  ]);
  return li;
}

$('#npc-filter').addEventListener('input', (e) => { state.npcFilter = e.target.value; renderSidebar(); });
$('#quest-filter').addEventListener('input', (e) => { state.questFilter = e.target.value; renderSidebar(); });
$('#mob-filter').addEventListener('input', (e) => { state.mobFilter = e.target.value; renderSidebar(); });
$('#faction-filter').addEventListener('input', (e) => { state.factionFilter = e.target.value; renderSidebar(); });
$('#recipe-filter').addEventListener('input', (e) => { state.recipeFilter = e.target.value; renderSidebar(); });
$('#skill-filter').addEventListener('input', (e) => { state.skillFilter = e.target.value; renderSidebar(); });
$('#revalidate-btn').addEventListener('click', runGlobalValidation);
$('#npc-new-btn').addEventListener('click', createNewNpc);
$('#quest-new-btn').addEventListener('click', createNewQuest);
$('#mob-new-btn').addEventListener('click', createNewMob);
$('#faction-new-btn').addEventListener('click', createNewFaction);
$('#recipe-new-btn').addEventListener('click', createNewRecipe);
$('#skill-new-btn').addEventListener('click', createNewSkill);

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
  else if (state.selected.kind === 'skill') renderSkillEditor(findSkill(state.selected.file));
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
// tracked in a per-editor set (state.mobSectionCollapsed by default, shared
// across every mob you open: "hide Factors while I work on dialogue" is a
// standing preference, not a per-mob one; the skill editor passes its own).
// Callers append their content into the RETURNED `.body`, not the section
// itself, and return `.section` up to the editor.
function statSection(title, collapsedSet = state.mobSectionCollapsed) {
  const collapsed = collapsedSet.has(title);
  const body = el('div', { class: 'stat-section-body' });
  const section = el('div', { class: 'stat-section' + (collapsed ? ' collapsed' : '') }, [
    el('div', {
      class: 'stat-section-head',
      onclick: () => {
        if (collapsedSet.has(title)) collapsedSet.delete(title); else collapsedSet.add(title);
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
    for (const k of ['skill', 'requiredLevel', 'quest', 'fromStage', 'toStage', 'xp', 'mode', 'anchor']) delete g[k];
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
    wrap.appendChild(select(['', ...TRAVEL_MODES], g.mode || '', (v) => { g.mode = v; if (v !== 'anchor') delete g.anchor; onStructuralChange(); }, (v) => v || '— mode —'));
    if (g.mode === 'anchor') {
      // The destination is the placement's spawns[].anchor (U3b); this is only
      // the default for a placement that names none, so blank deletes the key.
      wrap.appendChild(el('input', { type: 'text', placeholder: 'default anchor (optional)', value: g.anchor || '', oninput: (e) => { if (e.target.value) g.anchor = e.target.value; else delete g.anchor; onChange(); } }));
    }
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
  if (g.kind === 'travel_to' && g.mode === 'anchor') {
    return 'Delivers to the zone anchor named on the PLACEMENT (world.json spawns[].anchor); the field here is only a default for a placement that names none. Whether the anchor exists is checked at boot, not here.';
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
  jumpTo('npc', mobFile);
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


/* ======================================================================
 * Skill editor: the spell builder (plan-content-editor.md §B4.3, §B5 C1+C3).
 * The form is rendered FROM the vocabulary served on /api/data
 * (api/skill-vocabulary.json merged with shared-constants): a key in
 * effectKeys[type] ⇒ a field, authored or not. ⛔ L1: no per-type field list
 * is typed here.
 *
 * C3 made it writable. Three rules hold everywhere in this section:
 *
 *   1. EDIT THE RAW OBJECT IN PLACE (L7/L8). Keys are assigned and deleted on
 *      the object that came off disk, never on a rebuilt one, so _comment and
 *      every key the form does not render (hitStyle, legacy, forwardUnits,
 *      armTicks - §B4.8) round-trip untouched.
 *   2. BLANK DELETES THE KEY (L2). Absent and 0 are different values to the
 *      loader (tickInterval absent = every tick, an authored 0 is refused), so
 *      an emptied input removes the key and a typed 0 writes 0. This is the
 *      rule for EVERY control, not a list of which keys need it.
 *   3. THE LOADER IS THE VALIDATOR (D9). The checks rendered live are hints;
 *      they never block Save. The gate is `aurad -validate` on the way through
 *      POST /api/save/skill.
 * ==================================================================== */

const editorPane = $('#editor-pane');

// The test-rig badge's tooltip (C4): the three Omni skills are cheat rigs, not
// content, and nothing in their files says so - see TEST_RIG_SKILLS.
const TEST_RIG_TITLE = 'A cheat-only test rig, never content: it exists to exercise every effect surface from the SKILL cheat and is obtained by nothing. Do not tune it as if it shipped.';

// The auto-id's own caveat (§B10 L3), shown beside the read-only id field of a
// brand-new draft.
const NEW_ID_HINT = 'Auto-assigned: the highest id across both skill folders, plus one. ⚑ If the skill that held the highest id was deleted, this re-mints that id, and ids are persisted in every character\'s spellbook row. C5\'s registry lock (ids with tombstones) is the real fix; until it lands, check that nothing was deleted recently.';

// The authoring-note rule, shown under the _comment box (PO 2026-09-11).
const COMMENT_HINT = 'An authoring note, not a session ledger: what the skill is, which values are placeholder, and at most one landmine sentence with a doc pointer. No dates, hashes, chunk names, glyphs or placement claims ("cheat-only", "dropped by wolves") - placement lives in the mob, milestone and recipe files and goes stale here. Under ~400 characters. Full rule: docs/manual-content-authoring.md, "The _comment field". Blank deletes the key.';

// Re-renders the open editor after a STRUCTURAL change (a card added, moved,
// removed, a type or a category switched), keeping the scroll position.
// ⚑ Text and number edits must NOT come here: a re-render mid-keystroke takes
// the focus out of the input being typed into. They mutate and then refresh
// only what reads the value (the dirty dot, the hints, the level tables).
function rerenderSkillEditor() {
  const top = editorPane ? editorPane.scrollTop : 0;
  renderEditor();
  if (editorPane) editorPane.scrollTop = top;
}

function renderSkillEditor(entry) {
  const skill = entry.raw;
  const vocab = state.skillVocabulary;
  const effects = Array.isArray(skill.effects) ? skill.effects : [];
  // §B4.8: a skill authoring a parked effect type opens READ-ONLY, whole. One
  // guard here rather than a condition on thirty controls, because that is
  // exactly how a parked file becomes editable by accident.
  const readOnly = effects.some((e) => e && HIDDEN_EFFECT_TYPES.includes(e.type));

  editorRoot.appendChild(el('div', { class: 'editor-header' }, [
    el('div', {}, [
      el('h2', {}, [
        document.createTextNode(skill.displayName || deriveDisplayName(skill.name || '')),
        TEST_RIG_SKILLS.includes(skill.name) ? el('span', { class: 'rig-badge', text: 'test rig', title: TEST_RIG_TITLE }) : null,
        readOnly ? el('span', { class: 'readonly-badge', text: 'read-only', title: 'This skill authors a parked effect type (plan-content-editor.md §B4.8), so the builder shows it but never writes it.' }) : null,
      ]),
      el('div', { class: 'file-path' }, [
        document.createTextNode(entry.file),
        entry.isNew ? el('span', { class: 'new-badge', text: 'not yet saved' }) : null,
      ]),
    ]),
    el('div', { class: 'editor-actions' }, readOnly
      ? [el('span', { class: 'save-feedback', title: 'Its second in-game pass decides the type (plan-prototype-projectile.md); until then nothing here is written.', text: 'Read-only: a parked effect type.' })]
      : [
        el('span', { class: 'save-feedback', id: 'save-feedback' }),
        el('button', { onclick: () => resetEntry(entry, 'skill') }, 'Reset'),
        el('button', { class: 'primary', onclick: () => saveSkill(entry) }, 'Save'),
      ]),
  ]));

  if (!vocab) {
    editorRoot.appendChild(el('div', { class: 'errors-inline' }, [el('div', { class: 'err-line', text: 'No skill vocabulary was served on /api/data - regenerate api/skill-vocabulary.json (see the README).' })]));
    return;
  }

  for (const type of HIDDEN_EFFECT_TYPES) {
    if (effects.some((e) => e && e.type === type)) {
      editorRoot.appendChild(el('div', { class: 'parked-banner', text: `Effect type "${type}": ${EFFECT_TYPE_NOTES[type]?.text || 'hidden from the type picker (§B4.8).'}` }));
    }
  }

  const hintBox = el('div', { class: 'errors-inline' });
  const ctx = {
    vocab, skill, effects, entry, readOnly,
    previews: [],
    // A value edit: the object is already mutated, so refresh what READS it.
    onEdit() {
      sidebarBumpDirty();
      refreshHints();
      for (const refresh of ctx.previews) refresh();
    },
    // A shape edit: rebuild the form.
    onStructural() { rerenderSkillEditor(); },
  };
  function refreshHints() {
    hintBox.innerHTML = '';
    for (const line of skillHints(ctx)) hintBox.appendChild(el('div', { class: 'err-line', text: line }));
  }

  const comment = skillCommentSection(ctx);
  if (comment) editorRoot.appendChild(comment);
  editorRoot.appendChild(hintBox);
  // The post-save checklist lands HERE, under the header beside the save
  // feedback, not at the bottom of a long form (PO look 2026-09-12: "where is
  // that checklist?"). Empty until a save fills it (renderChecklist).
  editorRoot.appendChild(el('div', { class: 'save-checklist-box', id: 'skill-checklist-box', hidden: true }, [
    el('div', { class: 'label', text: 'After this save' }),
    el('ol', { class: 'save-checklist', id: 'skill-checklist' }),
  ]));
  editorRoot.appendChild(skillIdentitySection(ctx));
  editorRoot.appendChild(skillCategorySection(ctx));
  editorRoot.appendChild(skillEffectsSection(ctx));
  editorRoot.appendChild(skillVisualsSection());
  editorRoot.appendChild(skillSourcesSection(skill));
  editorRoot.appendChild(skillAfterSavingSection(ctx));
  refreshHints();
}

// CamelCase → spaces, the catalog's DeriveDisplayName for a skill with no
// authored displayName.
function deriveDisplayName(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

function skillSection(title) { return statSection(title, state.skillSectionCollapsed); }

// Which block of the form draws a top-level key. Placement, read off the
// presentation table's `section` (default Identity) rather than a list here -
// so a key the table does not name still renders, and L1 holds.
function sectionOf(key) { return (presentationFor(key) || {}).section || 'identity'; }

// Assigns or DELETES: `undefined` removes the key outright (rule 2 above).
function setKey(obj, key, value) {
  if (value === undefined) delete obj[key];
  else obj[key] = value;
}

// The skill-level _comment, editable in place (PO ruling 2026-09-11). It is
// the one underscore key the content ships and the loader ignores it, so it
// never reaches the seam - the rule below it is the only guard it has.
function skillCommentSection(ctx) {
  const value = typeof ctx.skill._comment === 'string' ? ctx.skill._comment : '';
  if (ctx.readOnly && !value) return null;
  const wrap = el('div', { class: 'skill-comment' }, [el('span', { class: 'label', text: '_comment' })]);
  if (ctx.readOnly) {
    wrap.appendChild(document.createTextNode(value));
    return wrap;
  }
  wrap.appendChild(textArea(value, (v) => { setKey(ctx.skill, '_comment', v.trim() === '' ? undefined : v); ctx.onEdit(); }));
  wrap.appendChild(el('div', { class: 'hint', text: COMMENT_HINT }));
  return wrap;
}

// The live checks (D9): what the fixture makes free, as hints, NEVER a gate.
// Save stays enabled with every one of these showing - the loader answers on
// save, and a second opinion that could block it is exactly the JS port §B3
// forbids.
function skillHints(ctx) {
  const { skill, vocab, effects } = ctx;
  const out = [];
  for (const key of ['name', 'icon', 'category', 'maxLevel']) {
    if (skill[key] === undefined || skill[key] === '') out.push(`${key} is required on a player skill.`);
  }
  if (skill.category !== undefined && skill.category !== '' && !vocab.categories.includes(skill.category)) {
    out.push(`category "${skill.category}" is not one of ${vocab.categories.join(', ')}.`);
  }
  if (effects.length === 0) out.push('No effects: the loader refuses a skill without at least one.');
  effects.forEach((e, i) => {
    if (e === null || typeof e !== 'object') { out.push(`effects[${i}] is not an object.`); return; }
    if (!e.type) out.push(`effects[${i}] has no type.`);
    else if (!vocab.effectKeys[e.type]) out.push(`effects[${i}] has type "${e.type}", which the vocabulary does not know.`);
    else {
      const illegal = illegalTypeLine(vocab, e.type, skill.category);
      if (illegal) out.push(`effects[${i}]: ${illegal}`);
    }
  });
  const scoped = [...new Set(effects.filter((e) => e && vocab.factionScoped.includes(e.type)).map((e) => e.type))];
  if (scoped.length && !(Array.isArray(skill.targetFactions) && skill.targetFactions.length > 0)) {
    out.push(`targetFactions is MANDATORY here: this skill authors ${scoped.join(' + ')}, and the loader refuses an empty allowlist.`);
  }
  return out;
}

// 1. Identity (§B4.3 item 1) - the top-level keys that are neither the
// category block's nor `effects`, in the fixture's own order.
function skillIdentitySection(ctx) {
  const col = skillSection('Identity');
  const keys = ctx.vocab.topLevelKeys.filter((k) => k !== 'effects' && sectionOf(k) !== 'category');
  col.body.appendChild(el('div', { class: 'stat-grid' }, keyFields(keys, ctx.skill, ctx)));
  return col.section;
}

// 2. Category block (§B4.3 item 2): cooldowns author cadence + cast; auras
// and passives author nothing extra. targetFactions is per skill, every
// category, and turns MANDATORY when any effect is faction-scoped (calm,
// charm - fixture `factionScoped`; the loader hard-fails an empty list then).
//
// ⚑ Switching the category re-renders this block but deletes NOTHING: whether
// a leftover cooldownTicks on an aura is legal is the loader's call, and the
// seam reports it on save. The tool does not guess.
function skillCategorySection(ctx) {
  const { skill, vocab, effects } = ctx;
  const category = skill.category || '';
  const col = skillSection(`Category: ${CATEGORY_LABELS[category] || category || 'unset'}`);
  if (category === 'cooldown') {
    const keys = vocab.topLevelKeys.filter((k) => sectionOf(k) === 'category' && k !== 'targetFactions');
    col.body.appendChild(el('div', { class: 'stat-grid' }, keyFields(keys, skill, ctx)));
    if (!(skill.castTicks > 0)) {
      col.body.appendChild(el('div', { class: 'grant-hint', text: 'castInterruptedByDamage is inert here: castTicks is 0, so there is no cast to interrupt (the loader refuses it authored true).' }));
    }
    col.body.appendChild(livePreview(ctx, 'Per level', skill, vocab.topLevelKeys));
  } else {
    col.body.appendChild(el('div', { class: 'mob-readonly-note', text: category === 'active_aura' ? 'An aura has no cooldown or cast: it is toggled, one active at a time, and ticks on its own cadence (each effect\'s tickInterval).' : category === 'passive' ? 'A passive is always on and has no cadence, cooldown or cast.' : 'Unknown category - the loader would refuse this file.' }));
  }
  const scoped = effects.filter((e) => e && vocab.factionScoped.includes(e.type)).map((e) => e.type);
  const factionsField = keyField('targetFactions', skill, ctx);
  if (scoped.length) {
    factionsField.classList.add('mandatory');
    factionsField.appendChild(el('div', { class: 'hint', text: `MANDATORY: this skill authors ${[...new Set(scoped)].join(' + ')}, so the loader refuses an empty allowlist. Note it gates EVERY effect of the skill, allies included (OmniStrike lists "aligned" for that reason).` }));
  }
  col.body.appendChild(el('div', { class: 'subsection' }, [factionsField]));
  return col.section;
}

// 3. Effects (§B4.3 item 3): one card per authored effect, each rendered from
// effectKeys[type] ∪ costKeys, split into the shared and payload groups by
// the presentation table, with the per-level preview underneath. C3 adds
// add · remove · reorder · change type.
function skillEffectsSection(ctx) {
  const col = skillSection(`Effects (${ctx.effects.length})`);
  if (ctx.effects.length === 0) col.body.appendChild(el('div', { class: 'mob-readonly-note', text: 'No effects authored - the loader refuses a skill without at least one.' }));
  ctx.effects.forEach((effect, i) => col.body.appendChild(effectCard(effect, i, ctx)));
  if (!ctx.readOnly) {
    const type = EFFECT_TYPE_DEFAULTS[ctx.skill.category];
    col.body.appendChild(el('button', { class: 'add-row', onclick: () => addEffect(ctx) }, type ? `+ Add effect (${type})` : '+ Add effect'));
  }
  return col.section;
}

// A fresh card starts on the category's default type (§B4.5,
// EFFECT_TYPE_DEFAULTS), or with no type at all when the category is unset or
// unknown - then the picker is the next thing the author touches.
function addEffect(ctx) {
  // ctx.effects may be the empty stand-in used for a file that authors none,
  // so push onto the real array, creating it first if need be.
  if (!Array.isArray(ctx.skill.effects)) ctx.skill.effects = [];
  const type = EFFECT_TYPE_DEFAULTS[ctx.skill.category];
  ctx.skill.effects.push(type ? { type } : {});
  ctx.onStructural();
}

function moveEffect(ctx, i, delta) {
  const list = ctx.effects;
  const j = i + delta;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  ctx.onStructural();
}

function removeEffect(ctx, i) {
  const effect = ctx.effects[i];
  const authored = effect && typeof effect === 'object' ? Object.keys(effect).filter((k) => k !== 'type') : [];
  if (authored.length > 0 && !confirm(`Delete effect #${i} (${(effect && effect.type) || 'no type'}) and the ${authored.length} key(s) it authors?\n\n${authored.join(', ')}`)) return;
  ctx.effects.splice(i, 1);
  ctx.onStructural();
}

// ⭐ The category rule (C3 rider, PO 2026-09-12), carried here by the fixture's
// `effectCategories` - Go owns it, the picker only reads it. A stat_multiplier
// on an active aura used to LOAD and then do nothing: the aura tick dispatcher
// handles eight types and drops the rest, and stat bonuses are summed over
// passive slots only. The loader now refuses it; these two functions make sure
// the builder cannot author it in the first place.
//
// An unset or unknown category answers "every type": the fixture cannot say
// which are legal, and hiding everything would be worse than offering too much.
function legalEffectTypes(vocab, category) {
  const all = Object.keys(vocab.effectCategories).sort();
  if (!category || !vocab.categories.includes(category)) return all;
  return all.filter((t) => (vocab.effectCategories[t] || []).includes(category));
}

// The refusal, worded as the loader words it, for a card whose CURRENT type is
// illegal - which the picker cannot prevent (change the category of a skill
// that already authors effects and every card can land here). null when the
// pairing is fine or the fixture cannot judge it.
function illegalTypeLine(vocab, type, category) {
  const legal = vocab.effectCategories[type];
  if (!legal || !category || !vocab.categories.includes(category)) return null;
  if (legal.includes(category)) return null;
  const article = /^[aeiou]/.test(category) ? 'an' : 'a';
  return `"${type}" is not legal on ${article} ${category} skill; legal on: ${legal.join(', ')}. The loader refuses this file.`;
}

// §B4.3: switching a card's type drops the keys the new type does not accept -
// the loader would refuse them anyway - so the author is shown exactly what
// goes, INCLUDING the keys the form never renders (§B4.8), and may cancel.
// Keys the new type also accepts stay in place, untouched.
function changeEffectType(effect, next, ctx, selectEl, previous) {
  const allowed = ctx.vocab.effectKeys[next] || [];
  const dropped = Object.keys(effect).filter((k) => k !== 'type' && !allowed.includes(k) && !ctx.vocab.costKeys.includes(k));
  if (dropped.length > 0) {
    const names = dropped.map((k) => ((presentationFor(k) || {}).hidden ? `${k} (not shown)` : k));
    if (!confirm(`Changing this effect from "${previous || '(none)'}" to "${next || '(none)'}" deletes ${dropped.length} authored key(s) the new type does not accept:\n\n${names.join('\n')}\n\nContinue?`)) {
      selectEl.value = previous || '';
      return;
    }
    for (const k of dropped) delete effect[k];
  }
  setKey(effect, 'type', next === '' ? undefined : next);
  ctx.onStructural();
}

function effectCard(effect, i, ctx) {
  const { vocab } = ctx;
  const card = el('div', { class: 'card effect-card' });
  if (effect === null || typeof effect !== 'object') {
    card.appendChild(el('div', { class: 'err-line', text: `effects[${i}] is not an object` }));
    return card;
  }
  const type = effect.type;
  const allowed = vocab.effectKeys[type];
  const note = EFFECT_TYPE_NOTES[type];

  // The picker offers the types this skill's CATEGORY can author (the rider's
  // filter, legalEffectTypes) minus the parked ones; a skill already authoring
  // a parked type keeps it selectable so the card still reads (and that whole
  // skill is read-only anyway, so the switch can never fire).
  // A card with no type yet (a fresh one on a skill whose category is unset)
  // needs the blank option to exist, or the select shows the first type while
  // the object authors none, and picking that type could never fire `change`.
  // An illegal current type stays selectable too - taking it out of the list
  // would silently retype the card; the red line below says what is wrong.
  const pickable = [...(type ? [] : ['']), ...legalEffectTypes(vocab, ctx.skill.category).filter((t) => !HIDDEN_EFFECT_TYPES.includes(t) || t === type)];
  if (type && !pickable.includes(type)) pickable.push(type);
  const typeSelect = select(pickable, type || '', (v) => changeEffectType(effect, v, ctx, typeSelect, type), (t) => t || '— type —', 'type-select');
  typeSelect.disabled = ctx.readOnly;
  card.appendChild(el('div', { class: 'card-head' }, [
    el('span', { class: 'idx', text: '#' + i }),
    typeSelect,
    note ? el('span', { class: 'type-note' + (note.parked ? ' parked' : ''), text: note.text }) : null,
    ctx.readOnly ? null : el('div', { class: 'card-actions' }, [
      el('button', { title: 'Move up', onclick: () => moveEffect(ctx, i, -1) }, '↑'),
      el('button', { title: 'Move down', onclick: () => moveEffect(ctx, i, 1) }, '↓'),
      el('button', { class: 'danger', onclick: () => removeEffect(ctx, i) }, 'Delete'),
    ]),
  ]));

  const illegal = illegalTypeLine(vocab, type, ctx.skill.category);
  if (illegal) card.appendChild(el('div', { class: 'err-line', text: illegal }));

  if (!allowed) {
    card.appendChild(el('div', { class: 'err-line', text: `Unknown effect type "${type}" - the vocabulary has no key list for it, so nothing can be rendered.` }));
    return card;
  }

  const keys = [...vocab.costKeys, ...allowed];
  const shared = keys.filter((k) => (presentationFor(k) || {}).group === 'shared');
  const payload = keys.filter((k) => !shared.includes(k));
  if (shared.length) card.appendChild(el('div', { class: 'subsection' }, [el('div', { class: 'subsection-title', text: 'Shared' }), el('div', { class: 'stat-grid' }, keyFields(shared, effect, ctx))]));
  if (payload.length) card.appendChild(el('div', { class: 'subsection' }, [el('div', { class: 'subsection-title', text: 'Payload' }), el('div', { class: 'stat-grid' }, keyFields(payload, effect, ctx))]));
  if (keys.length === 0) card.appendChild(el('div', { class: 'grant-hint', text: 'This type authors no fields.' }));

  // Anything authored outside the type's list is a boot failure; smoke.mjs
  // catches it offline, the card names it in place.
  const stray = Object.keys(effect).filter((k) => k !== 'type' && !keys.includes(k));
  for (const k of stray) {
    const hint = vocab.renamedKeys[k];
    card.appendChild(el('div', { class: 'stray-key', text: hint ? `"${k}" is a retired key - use ${hint}` : `"${k}" is not a key ${type} accepts; the loader refuses this file.` }));
  }

  card.appendChild(livePreview(ctx, 'Per level', effect, keys));
  return card;
}

// 4. Visuals (D3, §B4.8): coming soon, nothing rendered, nothing written.
function skillVisualsSection() {
  const col = skillSection('Visuals');
  col.body.appendChild(el('div', { class: 'visuals-placeholder', text: 'Coming soon. No VFX ruling exists yet (plan-entity-presentation.md §39; prototype/skill-visuals is parked), so this section authors nothing. hitStyle, the one visual lever the schema has today, is not shown and is preserved untouched.' }));
  return col.section;
}

// 5. Obtained via (D6, §B4.6): every placement of this skill - milestone rows,
// mob unlocks[], NPC teach_skill grants, ascension rewards, recipe results -
// plus what merely references it (a mob carrying it, a recipe consuming it).
//
// ⭐ The scan itself lives in skill-references.mjs because the SERVER runs it
// too, as the rename guard (§B10 L5): a row this panel shows but the guard
// misses would be a rename that silently breaks content.
function skillSourcesSection(skill) {
  const col = skillSection('Obtained via');
  const { sources, refs } = collectSkillReferences(skill.name, { mobs: state.mobs, recipes: state.recipes, milestones: state.milestones });

  const panel = el('div', { class: 'sources-panel' });
  if (sources.length === 0) {
    panel.appendChild(el('div', { class: 'cheat-only' }, [document.createTextNode('cheat-only ('), el('code', { text: `SKILL ${skill.name}` }), document.createTextNode(') - no milestone, kill drop, NPC or recipe grants it. Placement happens in the other tabs, not here (D6).')]));
  } else {
    panel.appendChild(el('ul', {}, sources.map((s) => el('li', {}, [refLink(s.label, () => jumpToReference(s.jump))]))));
  }
  if (refs.length) {
    panel.appendChild(el('div', { class: 'sources-title', text: 'Also referenced by (a rename must see these)' }));
    panel.appendChild(el('ul', {}, refs.map((r) => el('li', {}, [refLink(r.label, () => jumpToReference(r.jump))]))));
  }
  panel.appendChild(el('div', { class: 'grant-hint', text: 'Invisible to this panel: the SKILL cheat, the harness scripts and the sim-harness presets, which reference skills by name too (§B10 L5). A rename is refused on save while any row above exists.' }));
  col.body.appendChild(panel);
  return col.section;
}

// 6. After saving (§B4.7, C4). Rendered ALWAYS, not only after a write:
// testing a skill that already exists is the common case, and the link is the
// fastest way to look at one. The CHECKLIST the save response carries is
// dropped in here by saveSkill() and stays until the form is re-rendered.
//
// ⚑ The token and the ports are the CLAUDE.md dev defaults, not secrets.
function skillAfterSavingSection(ctx) {
  const col = skillSection('After saving');
  const name = ctx.skill.name || '';
  const link = testLinkFor(name);
  col.body.appendChild(el('div', { class: 'after-saving' }, [
    el('div', { class: 'grant-hint', text: 'A save writes the file; the running game reads content at BOOT, so restart aurad (./scripts/dev-restart-windows.sh server) before looking for the change in game.' }),
    el('div', { class: 'test-link-row' }, [
      el('a', { class: 'ref-link', href: link, target: '_blank', rel: 'noreferrer', text: link }),
      el('button', { onclick: (e) => copyToClipboard(link, e.target) }, 'Copy'),
    ]),
    el('div', { class: 'grant-hint', text: `Joins with GOD on and ${name || 'this skill'} granted, so the skill is in the bar immediately. An aura still needs its slot switched on (the first press of its number key).` }),
  ]));
  return col.section;
}

// D8's link: the dev client, a cheat token, GOD and the skill granted.
function testLinkFor(name) {
  return `http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&start-cmds=GOD,SKILL ${name}`;
}

// navigator.clipboard is unavailable over plain http on some browsers and in
// some headless contexts, so the failure says so instead of doing nothing.
function copyToClipboard(text, button) {
  const done = (msg) => { button.textContent = msg; setTimeout(() => { button.textContent = 'Copy'; }, 2000); };
  if (!navigator.clipboard || !navigator.clipboard.writeText) { done('copy unavailable, select the link'); return; }
  navigator.clipboard.writeText(text).then(() => done('copied'), () => done('copy failed, select the link'));
}

// A reference's jump target is plain data ({kind, file, nodeId?}) so the
// server can use the same scan; this is the browser half that navigates.
function jumpToReference(jump) {
  if (jump.kind === 'milestones') return jumpTo('milestones', jump.file);
  if (jump.kind === 'recipe') return jumpTo('recipe', jump.file);
  if (jump.nodeId) return jumpToNode(jump.file, jump.nodeId);
  return jumpTo('mob', jump.file);
}

function refLink(label, jump) {
  return el('a', { href: '#', class: 'ref-link', onclick: (e) => { e.preventDefault(); jump(); }, text: label });
}

// Saving a skill (C3). Two things happen here that no other tab's save does:
//
//   ⚑ the maxLevel-lowering confirm (L4): persisted spellbook levels may
//     exceed a lowered cap, and the reconciliation clamp (backlog §61) is not
//     built. C5 turns this into a loader refusal; until then it is a question.
//   ⚑ the HTTP-status branch (L12): a 200 {ok:false} is the loader refusing
//     the content, a non-200 is the validator failing to ANSWER (no binary, a
//     stale one, a crash). Reading `ok` alone would render "build aurad first"
//     as a clean pass.
async function saveSkill(entry) {
  const fb = $('#save-feedback');
  const pristine = JSON.parse(state.pristine.get(entry.file) || 'null');
  if (pristine && typeof pristine.maxLevel === 'number' && typeof entry.raw.maxLevel === 'number' && entry.raw.maxLevel < pristine.maxLevel) {
    if (!confirm(`Lowering maxLevel from ${pristine.maxLevel} to ${entry.raw.maxLevel}.\n\nSkill levels are persisted per character: any spellbook row already above ${entry.raw.maxLevel} keeps its level, and nothing clamps it (the reconciliation policy is backlog §61, unbuilt). The rule is that a shipped skill's maxLevel never decreases, and C5 will make this a loader refusal.\n\nSave anyway?`)) return;
  }
  fb.textContent = 'saving…'; fb.className = 'save-feedback';
  const res = await fetch('/api/save/skill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: entry.file, raw: entry.raw, isNew: !!entry.isNew }) });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  const errors = (body && body.errors) || [];
  if (!res.ok) {
    fb.className = 'save-feedback err';
    fb.textContent = `the validator could not run (HTTP ${res.status}), nothing was written: ${errors.join(' · ') || 'no message'}`;
    return;
  }
  if (!body || body.ok !== true) {
    fb.className = 'save-feedback err';
    fb.textContent = (body && body.stage === 'validate' ? 'refused by aurad -validate: ' : 'refused: ') + (errors.join(' · ') || 'no message');
    return;
  }
  const wasNew = !!entry.isNew;
  entry.isNew = false;
  editorRoot.querySelector('.new-badge')?.remove();
  markPristine(entry.file);
  renderChecklist(body.checklist || []);
  fb.className = 'save-feedback ok';
  const warnings = body.warnings && body.warnings.length ? body.warnings.join(' · ') + ' · ' : '';
  fb.textContent = `saved${wasNew ? ' (new file written)' : ''}: ${warnings}see the checklist below`;
  renderSidebar();
  runGlobalValidation();
}

// The post-save checklist (§B4.7). It comes off the RESPONSE rather than being
// built here: the registry pin's count is a fact about what the server just
// wrote, and a client-side guess at it would drift the moment a file is added
// by hand. It survives until the form is re-rendered (a re-selection, a
// structural edit), which is deliberately not "until dismissed": the list is a
// receipt for the save that just happened, not standing state.
function renderChecklist(items) {
  const box = $('#skill-checklist');
  if (!box) return;
  box.innerHTML = '';
  for (const item of items) box.appendChild(el('li', { text: item }));
  const wrap = $('#skill-checklist-box');
  if (wrap) wrap.hidden = items.length === 0;
}

/* ---- field rendering, from the presentation table ---------------------- */

// Fields for `keys` (in the given order) read off `obj`. A key whose
// `<key>PerLevel` sibling is also in the list renders as a pair; the sibling
// is skipped on its own turn; hidden keys are skipped outright (§B4.8) and,
// because every edit is in place, survive untouched.
function keyFields(keys, obj, ctx) {
  const set = new Set(keys);
  const out = [];
  for (const key of keys) {
    const entry = presentationFor(key) || {};
    if (entry.hidden) continue;
    if (key.endsWith('PerLevel') && set.has(key.slice(0, -'PerLevel'.length))) continue;
    if (set.has(key + 'PerLevel')) {
      out.push(el('div', { class: 'pair' }, [keyField(key, obj, ctx), keyField(key + 'PerLevel', obj, ctx, entry.unit)]));
    } else {
      out.push(keyField(key, obj, ctx));
    }
  }
  return out;
}

// One labeled control for `key` on `obj`. `unitOverride` lets a per-level
// field borrow its base's unit. No presentation entry ⇒ a plain text input
// (§B3: never silently unauthorable).
function keyField(key, obj, ctx, unitOverride) {
  const entry = presentationFor(key) || { control: 'text' };
  const unit = entry.unit || unitOverride;
  const wrap = el('div', { class: 'field', title: key });
  wrap.appendChild(el('label', { text: labelFor(key) }));
  const row = el('div', { class: 'field-row' });
  const seconds = el('span', { class: 'seconds' });
  const markAuthored = () => wrap.classList.toggle('unauthored', obj[key] === undefined);
  const onSet = (value) => {
    setKey(obj, key, value);
    markAuthored();
    if (unit === 'ticks') seconds.textContent = ticksToSecondsLabel(obj[key], state.ticksPerSecond);
    ctx.onEdit();
  };
  row.appendChild(fieldControl(entry, key, obj, ctx, onSet));
  if (unit && entry.control === 'number') {
    row.appendChild(el('span', { class: 'unit', text: UNIT_LABELS[unit] || unit }));
    if (unit === 'ticks') {
      seconds.textContent = ticksToSecondsLabel(obj[key], state.ticksPerSecond);
      row.appendChild(seconds);
    }
  }
  wrap.appendChild(row);
  if (entry.hint) wrap.appendChild(el('div', { class: 'hint', text: entry.hint }));
  // The auto-id's caveat, on a NEW draft only: an existing skill's id is
  // simply what it has always been, and repeating L3 beside it would be noise.
  if (key === 'id' && ctx.entry && ctx.entry.isNew) wrap.appendChild(el('div', { class: 'hint', text: NEW_ID_HINT }));
  markAuthored();
  return wrap;
}

const UNIT_LABELS = { ticks: 'ticks', units: 'u', hp: 'HP', fraction: 'frac', factor: '×', count: '' };

// The control itself. Every write goes through onSet, and `undefined` DELETES
// the key - the absent-vs-0 tri-state (L2) is the rule for the whole form, not
// a list of which keys need it.
//
// ⚑ `id` is the one key that stays read-only even in a writable editor: it is
// persisted in every character's spellbook row (C5 locks it for real).
function fieldControl(entry, key, obj, ctx, onSet) {
  const value = obj[key];
  const locked = ctx.readOnly || key === 'id';
  let control;
  switch (entry.control) {
    case 'number':
      control = nullableNumberInput(value, (v) => onSet(Number.isFinite(v) ? v : undefined), '—');
      break;
    case 'bool':
      // Every skill bool is a plain Go bool (definition.go), so absent IS
      // false and unchecked deletes the key rather than writing `false`.
      control = checkboxInput(value === true, (v) => onSet(v ? true : undefined));
      break;
    case 'textarea':
      control = textArea(typeof value === 'string' ? value : '', (v) => onSet(v === '' ? undefined : v));
      break;
    case 'select': {
      const options = optionList(entry.options, ctx);
      if (value !== undefined && value !== '' && !options.includes(value)) options.push(value);
      control = select(['', ...options], value ?? '', (v) => { onSet(v === '' ? undefined : v); ctx.onStructural(); }, (v) => v || '— unset —');
      break;
    }
    case 'multi': {
      const options = optionList(entry.options, ctx);
      const chosen = Array.isArray(value) ? value : [];
      for (const v of chosen) if (!options.includes(v)) options.push(v);
      control = el('div', { class: 'bitmask-group' }, options.map((opt) => el('label', { class: 'bitmask-bit' }, [
        el('input', {
          type: 'checkbox', checked: chosen.includes(opt), disabled: locked,
          onchange: (e) => {
            const next = Array.isArray(obj[key]) ? [...obj[key]] : [];
            const at = next.indexOf(opt);
            if (e.target.checked) { if (at < 0) next.push(opt); }
            else if (at >= 0) next.splice(at, 1);
            onSet(next.length > 0 ? next : undefined);
          },
        }),
        entry.options === 'factions' ? factionOptionLabel(opt) : opt,
      ])));
      if (options.length === 0) control.appendChild(el('span', { class: 'grant-hint', text: '(no options)' }));
      break;
    }
    case 'icon':
      control = iconPicker(key, obj, onSet, locked);
      break;
    case 'mob':
      control = mobPicker(key, obj, ctx, onSet, locked);
      break;
    case 'text':
    default:
      control = el('input', {
        type: 'text',
        value: value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value),
        placeholder: '—',
        oninput: (e) => onSet(e.target.value === '' ? undefined : e.target.value),
      });
  }
  if ('disabled' in control) control.disabled = locked;
  return control;
}

// The option list behind a select/multi entry, by the NAME the presentation
// table gives - every list comes from the served vocabulary or the loaded
// content, never a literal here.
function optionList(name, ctx) {
  const { vocab } = ctx;
  switch (name) {
    case 'categories': return [...vocab.categories];
    case 'selectors': return [...vocab.selectors];
    case 'statNames': return [...vocab.statNames];
    case 'gateKeys': return [...vocab.gateKeys];
    case 'damageTypes': return [...vocab.damageTypes];
    case 'resistTags': return [...vocab.damageTypes, vocab.resistWildcard];
    // The two reserved names resolve in the loader's registry too
    // (factions.go seeds "aligned" and "hostile"), so both are legal here.
    case 'factions': return [...state.factions.map((f) => f.raw.name).sort(), ...RESERVED_FACTION_NAMES];
    default: return [];
  }
}

/* ---- the two pickers C4 added (§B4.4, §B4.6) --------------------------- */

// The text the icon picker ends on, in the plan's own words (§B4.4): the set
// is closed, and widening it is a script run, not a text field.
const ICON_FOOTER = 'a glyph outside the set is not selectable; add one with node scripts/fetch-skill-icons.mjs (downloads from game-icons.net and regenerates the committed artifacts, CC BY attribution included).';

// Radio groups need a name each, and several icon fields can exist at once in
// principle; one counter per page is enough.
let radioGroupSeq = 0;

// The icon picker: the VENDORED glyph set as the actual SVGs, tinted through
// currentColor. Radios rather than buttons on purpose - the read-only rule for
// a parked skill is "zero enabled controls", and only a real form control can
// honour `disabled`.
//
// ⚑ The file's CURRENT value is always offered, even when the set does not
// carry it (marked as such), so opening a skill can never silently change it.
// Clearing writes no key at all (the L2 tri-state rule).
function iconPicker(key, obj, onSet, locked) {
  const glyphs = state.skillIcons || {};
  const keys = Object.keys(glyphs).sort();
  const current = typeof obj[key] === 'string' ? obj[key] : '';
  const group = `icon-pick-${radioGroupSeq++}`;
  const grid = el('div', { class: 'icon-grid' });

  const option = (value, title, body, cls) => el('label', { class: 'icon-option' + (value === current ? ' current' : '') + (cls ? ' ' + cls : ''), title }, [
    el('input', { type: 'radio', name: group, checked: value === current, disabled: locked, onchange: (e) => {
      // The highlight follows the pick on the spot: a value edit never
      // re-renders the form (only a structural one does), so without this
      // "(none)" stayed lit until the next category change (PO look).
      for (const l of grid.querySelectorAll('.icon-option.current')) l.classList.remove('current');
      e.target.closest('.icon-option').classList.add('current');
      onSet(value === '' ? undefined : value);
    } }),
    body,
  ]);

  grid.appendChild(option('', 'No icon: the spellbook row falls back to a letter. Every shipped player skill authors one.', el('span', { class: 'icon-none', text: '(none)' })));
  for (const k of keys) {
    const glyph = glyphs[k];
    grid.appendChild(option(k, k, el('span', { class: 'glyph', html: `<svg viewBox="${glyph.viewBox}" width="22" height="22" fill="currentColor" aria-hidden="true">${glyph.body}</svg>` })));
  }
  if (current && !keys.includes(current)) {
    grid.appendChild(option(current, `${current} is authored here but is not in the vendored set, so it renders as a letter fallback in game.`, el('span', { class: 'icon-none', text: `${current} (not vendored)` }), 'not-vendored'));
  }

  return el('div', { class: 'icon-picker' }, [
    grid,
    el('div', { class: 'hint', text: keys.length === 0 ? `No vendored glyph was served on /api/data: ${ICON_FOOTER}` : ICON_FOOTER }),
  ]);
}

// The spawnMob picker: EVERY mob, grouped by role (PO ruling 2026-09-12), with
// a jump into the Mobs tab for the one currently picked - the summon's own
// stats, aura and art live on the mob and are edited there (D2).
//
// ⚑ Never a filter. Go has no role rule on spawnMob at all, so a filter typed
// in here would be the only place such a rule existed, and it would hide
// shipped content: `spawn_at_anchor` names PortalHome and PortalSummon and
// `projectile` names ProjectileBomb.
//
// ⚑ Two roles since plan-summon-follows.md C2 retired the third. A pet is made
// by the SPELL's `follows` key, so the four companion mobs are ordinary
// creatures and sit in the Creatures group with everything else.
const MOB_ROLE_GROUPS = [['structure', 'Structures'], ['creature', 'Creatures']];

function mobPicker(key, obj, ctx, onSet, locked) {
  const current = typeof obj[key] === 'string' ? obj[key] : '';
  const byRole = new Map(MOB_ROLE_GROUPS.map(([role]) => [role, []]));
  for (const m of state.mobs) {
    // An absent `role` IS creature (mobs/definitions.go's default), so the
    // grouping must not invent a fourth group for it.
    const role = m.raw.role || 'creature';
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role).push(m.raw.name);
  }
  const roleLabel = (role) => (MOB_ROLE_GROUPS.find(([r]) => r === role) || [role, role])[1];

  const sel = el('select', { class: 'mob-select', onchange: (e) => { onSet(e.target.value === '' ? undefined : e.target.value); ctx.onStructural(); } });
  sel.appendChild(el('option', { value: '', selected: current === '' }, '(none)'));
  let known = false;
  for (const [role, names] of byRole) {
    if (names.length === 0) continue;
    const optgroup = el('optgroup', { label: roleLabel(role) });
    for (const name of [...names].sort((a, b) => (a || '').localeCompare(b || ''))) {
      if (name === current) known = true;
      optgroup.appendChild(el('option', { value: name, selected: name === current }, name));
    }
    sel.appendChild(optgroup);
  }
  // The current value always stays offered, even when no mob carries it, so
  // opening a file never rewrites it.
  if (current && !known) {
    const optgroup = el('optgroup', { label: 'Not a mob on disk' });
    optgroup.appendChild(el('option', { value: current, selected: true }, current));
    sel.appendChild(optgroup);
  }
  sel.disabled = locked;

  const mob = state.mobs.find((m) => m.raw.name === current);
  return el('div', { class: 'mob-picker' }, [
    sel,
    mob ? refLink('edit in Mobs', () => jumpTo('mob', mob.file)) : (current ? el('span', { class: 'stray-key', text: 'no mob on disk carries that name; the loader refuses this file' }) : null),
  ]);
}

function factionOptionLabel(name) {
  if (name === 'aligned') return 'aligned (players)';
  if (name === 'hostile') return 'hostile (the unauthored default)';
  return factionDisplayName(name);
}

/* ---- the per-level preview (D5) ---------------------------------------- */

// A per-level table that re-reads its object whenever a value changes. The
// tables are the one part of the skill form that depends on values it does
// not itself draw (maxLevel decides the column count, every base/per-level
// pair decides a row), so each one registers a refresh in ctx rather than
// waiting for a re-render that a text edit must not trigger.
function livePreview(ctx, title, obj, keys) {
  const build = () => levelPreview(title, scalingRowsFor(obj, keys), ctx.skill.maxLevel);
  let node = build();
  ctx.previews.push(() => {
    const next = build();
    node.replaceWith(next);
    node = next;
  });
  return node;
}

// The scaling rows an object authors: every pair in `keys` (base +
// `<base>PerLevel`) where at least one half is authored. Hidden keys are
// excluded like everywhere else.
function scalingRowsFor(obj, keys) {
  return scalingPairs(keys)
    .filter(({ base, perLevel }) => !(presentationFor(base) || {}).hidden && (obj[base] !== undefined || obj[perLevel] !== undefined))
    .map(({ base, perLevel }) => ({ key: base, base: obj[base], perLevel: obj[perLevel], unit: (presentationFor(base) || {}).unit }));
}

// One column per level 1..maxLevel, one row per scaling pair, each cell
// base + (level-1) × perLevel (skills/scaling.go). A pair whose per-level
// half is absent or 0 is flat and rendered dimmed, so the eye goes to what
// actually moves. Tick rows carry seconds beside every cell.
function levelPreview(title, rows, maxLevel) {
  const levels = Math.max(1, Number(maxLevel) || 1);
  if (rows.length === 0) return el('div', { class: 'grant-hint', text: 'No level-scaling pair authored.' });
  const head = el('tr', {}, [el('th', { text: title }), ...Array.from({ length: levels }, (_, i) => el('th', { text: `L${i + 1}` }))]);
  const body = rows.map((r) => {
    const flat = !(typeof r.perLevel === 'number' && r.perLevel !== 0);
    return el('tr', { class: flat ? 'flat' : '' }, [
      el('td', { text: labelFor(r.key) }),
      ...Array.from({ length: levels }, (_, i) => {
        const v = resolveAt(r.base, r.perLevel, i + 1);
        return el('td', {}, [
          document.createTextNode(formatNumber(v)),
          r.unit === 'ticks' ? el('span', { class: 'seconds', text: ticksToSecondsLabel(v, state.ticksPerSecond) }) : null,
        ]);
      }),
    ]);
  });
  return el('div', { class: 'level-table-wrap' }, [el('table', { class: 'level-table' }, [el('thead', {}, [head]), el('tbody', {}, body)])]);
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
