#!/usr/bin/env node
/**
 * Writes docs/content-skill-inventory.md from api/, in full.
 *
 *     node tools/content-editor/skill-inventory.mjs      # or: npm run inventory
 *
 * The doc has NO hand-edited region and no markers: every line of it, prose
 * included, comes from the template at the bottom of this file. That is the
 * whole point. The file used to call itself generated while being maintained
 * by hand, and it drifted three separate ways (a cap pass its MaxLv column
 * never saw, rows for files that did not exist, files with no row), each drift
 * hidden by the next because the totals cancelled.
 *
 * ⚑ NOTHING here types a per-type field list, a unit or a key order by hand.
 * The columns come from api/skill-vocabulary.json (which Go generates from the
 * tables that actually parse a skill file) and from skill-presentation.mjs
 * (which the smoke asserts covers that fixture both ways). Key ORDER follows
 * the fixture, never Object.keys of the file: a tab-authored skill carries
 * `category` and `icon` last, and a renderer walking file order would produce
 * a diff every time someone re-saved an untouched skill.
 *
 * ⚑ Sources come from collectSkillReferences, the same scan the editor's
 * rename guard and "Obtained via" panel use, so the doc and the tool can never
 * disagree about whether a skill is reachable.
 *
 * ⚑ `hidden: true` in skill-presentation.mjs means "the editor form does not
 * draw this control". It is not a statement about the doc: forwardUnits and
 * armTicks ARE the content of ThrowMine, so this renders every authored key.
 *
 * Self-checks (all fatal, exit 1): every skill file rendered exactly once,
 * player + mob counts summing to the files on disk, a second render byte-equal
 * to the first, every top-level key either rendered or deliberately skipped,
 * every authored effect key inside the fixture's list for its type with a
 * presentation entry, and every skill NAME another content file points at
 * present in the registry.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listJsonFiles } from './files.mjs';
import { readSkillVocabulary } from './vocabulary.mjs';
import {
  presentationFor, labelFor, scalingPairs, ticksToSecondsLabel, formatNumber,
  CATEGORY_LABELS, TEST_RIG_SKILLS, HIDDEN_EFFECT_TYPES,
} from './skill-presentation.mjs';
import { collectSkillReferences } from './skill-references.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const API = path.join(ROOT, 'api');
const OUT = path.join(ROOT, 'docs', 'content-skill-inventory.md');

const problems = [];
const fail = (msg) => problems.push(msg);

// ---------------------------------------------------------------------------
// Readers. Same shapes as server.mjs ({ file, raw }), same listJsonFiles walk.
// ---------------------------------------------------------------------------

function readDir(...parts) {
  return listJsonFiles(path.join(API, ...parts)).map((abs) => ({
    file: path.relative(ROOT, abs).split(path.sep).join('/'),
    abs,
    raw: JSON.parse(readFileSync(abs, 'utf8')),
  }));
}

function readMilestonesEntry() {
  const abs = path.join(API, 'milestones', 'milestone-unlocks.json');
  return {
    file: path.relative(ROOT, abs).split(path.sep).join('/'),
    raw: JSON.parse(readFileSync(abs, 'utf8')),
  };
}

function gitShortHash() {
  try {
    return execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Cell rendering. Units and labels come from presentationFor(key); nothing
// below knows the name of a single effect key.
// ---------------------------------------------------------------------------

// A markdown table cell: pipes escaped, newlines collapsed. One unescaped pipe
// in an authored description silently breaks the whole table.
const cell = (s) => String(s ?? '').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();

// The table reads as prose, not as headings: labelFor's title case is lowered
// word by word, except for an all-caps word, which is an acronym the override
// put there on purpose ("Damage HP" → "damage HP", "TTL ticks" unchanged).
function shortLabel(key) {
  return labelFor(key)
    .split(' ')
    .map((w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase()))
    .join(' ');
}

const signed = (n) => (n >= 0 ? `+${formatNumber(n)}` : formatNumber(n));
const pct = (n) => `${formatNumber(n * 100)}%`;
const signedPct = (n) => (n >= 0 ? `+${pct(n)}` : `-${pct(-n)}`);

// A number in the unit its presentation entry declares, with its per-level
// slope folded in when the pair authors one. A slope of 0 is authored all over
// the content (Damage's radiusPerLevel) and adds nothing to a reader.
function renderNumber(key, value, slope, ticksPerSecond) {
  const unit = (presentationFor(key) || {}).unit;
  const hasSlope = typeof slope === 'number' && Number.isFinite(slope) && slope !== 0;
  if (unit === 'fraction') return pct(value) + (hasSlope ? ` ${signedPct(slope)}/L` : '');
  if (unit === 'factor') return `×${formatNumber(value)}` + (hasSlope ? ` ${signed(slope)}/L` : '');
  if (unit === 'units') return `${formatNumber(value)} u` + (hasSlope ? ` ${signed(slope)}/L` : '');
  if (unit === 'ticks') {
    const secs = ticksToSecondsLabel(value, ticksPerSecond);
    return `${formatNumber(value)}t${secs ? ` (${secs})` : ''}` + (hasSlope ? ` ${signed(slope)}/L` : '');
  }
  return formatNumber(value) + (hasSlope ? ` ${signed(slope)}/L` : '');
}

// One authored key → one phrase, or '' when it says nothing (a false flag).
// `slope` is its *PerLevel sibling's value when the fixture pairs them.
function renderKey(key, value, slope, ticksPerSecond) {
  if (typeof value === 'boolean') {
    if (!value) return '';
    // A targets* flag reads better as the bare audience it names.
    const flag = key.startsWith('targets') ? key.slice('targets'.length) : key;
    return flag.charAt(0).toLowerCase() + flag.slice(1);
  }
  if (Array.isArray(value)) return value.length ? `${shortLabel(key)} ${value.join('/')}` : '';
  if (typeof value === 'number') return `${shortLabel(key)} ${renderNumber(key, value, slope, ticksPerSecond)}`;
  return `${shortLabel(key)} ${value}`;
}

// ---------------------------------------------------------------------------
// Skill rendering
// ---------------------------------------------------------------------------

const COST_LABEL_SUFFIX = 'of max';

// The effect's payload, in FIXTURE key order. `type` heads the phrase.
// `withCost` is false for the player tables, which lift the cost into a column
// of their own, and true for the mob-only table, which has no such column: a
// mob skill that one day authors a cost must not lose it in silence.
function renderEffect(effect, vocabulary, ticksPerSecond, where, withCost) {
  const type = effect.type;
  const allowed = vocabulary.effectKeys[type];
  if (!allowed) {
    fail(`${where}: effect type "${type}" is not in the vocabulary fixture`);
    return cell(type || '(no type)');
  }
  const costKeys = new Set(vocabulary.costKeys);
  const known = new Set([...allowed, ...costKeys, 'type']);
  for (const key of Object.keys(effect)) {
    if (key.startsWith('_')) continue;
    if (!known.has(key)) fail(`${where}: effect key "${key}" is not legal on type "${type}" (fixture effectKeys)`);
  }

  const paired = new Map(scalingPairs(allowed).map((p) => [p.base, p.perLevel]));
  const parts = [];
  for (const key of [...allowed, ...(withCost ? vocabulary.costKeys : [])]) {
    if (costKeys.has(key) && !withCost) continue;
    if (key.endsWith('PerLevel') && paired.has(key.slice(0, -'PerLevel'.length))) continue;
    if (effect[key] === undefined || effect[key] === null) continue;
    if (!presentationFor(key)) fail(`${where}: key "${key}" has no entry in skill-presentation.mjs`);
    const phrase = renderKey(key, effect[key], paired.has(key) ? effect[paired.get(key)] : undefined, ticksPerSecond);
    if (phrase) parts.push(phrase);
  }
  return `${type}${parts.length ? `: ${parts.join(', ')}` : ''}`;
}

function renderEffects(raw, vocabulary, ticksPerSecond, withCost = false) {
  const effects = raw.effects || [];
  if (!effects.length) return '';
  return effects.map((e, i) => renderEffect(e, vocabulary, ticksPerSecond, `${raw.name} effect ${i + 1}`, withCost)).join(' · ');
}

// Cost is per EFFECT, not per skill (costKeys are legal on every type, and
// NovaBurst and OmniStrike author more than one). Identical strings collapse.
function renderCost(raw, vocabulary, ticksPerSecond) {
  const [base, perLevel] = vocabulary.costKeys;
  const out = [];
  for (const e of raw.effects || []) {
    if (typeof e[base] !== 'number') continue;
    const text = `${renderNumber(base, e[base], e[perLevel], ticksPerSecond)} ${COST_LABEL_SUFFIX}`;
    if (!out.includes(text)) out.push(text);
  }
  return out.join(' · ');
}

function renderTiming(raw, vocabulary, ticksPerSecond) {
  const paired = new Map(scalingPairs(vocabulary.topLevelKeys).map((p) => [p.base, p.perLevel]));
  const parts = [];
  if (typeof raw.cooldownTicks === 'number') {
    parts.push(`CD ${renderNumber('cooldownTicks', raw.cooldownTicks, raw[paired.get('cooldownTicks')], ticksPerSecond)}`);
  }
  if (typeof raw.castTicks === 'number' && raw.castTicks !== 0) {
    parts.push(`cast ${renderNumber('castTicks', raw.castTicks, raw[paired.get('castTicks')], ticksPerSecond)}`);
  }
  if (raw.castInterruptedByDamage) parts.push('interruptible');
  return parts.join(' · ');
}

function renderName(raw) {
  return raw.displayName ? `${raw.name} "${raw.displayName}"` : raw.name;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

const KIND_ORDER = ['milestone', 'drop', 'teach', 'quest', 'recipe', 'ascension'];
const KIND_LABEL = {
  milestone: 'Milestone', drop: 'Kill drop', teach: 'NPC teaching',
  quest: 'Quest reward', recipe: 'Recipe', ascension: 'Ascension',
};

// The ascension catalog's own gate file, indexed by unlockKey. ⚑ Indexed, not
// derived from the skill name: the file slugs are kebab-case and a JS guess at
// "KeenEye" → "keen-eye" would be a second, silently-wrong copy of a rule that
// lives in Go.
function readAscensionGates() {
  const byKey = new Map();
  for (const entry of readDir('ascension')) {
    if (!entry.raw.unlockKey) continue;
    byKey.set(entry.raw.unlockKey, entry.raw.conditions || []);
  }
  return byKey;
}

function conditionText(c) {
  const bits = [c.kind];
  if (c.species) bits.push(c.species);
  if (c.quest) bits.push(c.quest);
  if (c.stage) bits.push(c.stage);
  if (c.value !== undefined) bits.push(String(c.value));
  return bits.join(' ');
}

function sourceText(source, ascensionGates) {
  switch (source.kind) {
    case 'milestone': return `MS L${source.level}`;
    case 'drop': return `Drop: ${source.mob} ${source.chance == null ? 'guaranteed' : formatNumber(source.chance)}`;
    case 'teach': return `NPC: ${source.mob}${source.requiredLevel ? ` @L${source.requiredLevel}` : ''}`;
    case 'quest': return `Quest: ${source.quest} via ${source.mob}`;
    case 'recipe': return `Recipe: ${source.ingredients.map((i) => `${i.skill} ${i.level}`).join(' + ')}`;
    case 'ascension': {
      const gates = ascensionGates.get(source.skill) || [];
      return `Ascension via ${source.mob}${gates.length ? ` (${gates.map(conditionText).join('; ')})` : ''}`;
    }
    default: return source.label;
  }
}

function sortSources(sources) {
  return [...sources].sort((a, b) => {
    const ka = KIND_ORDER.indexOf(a.kind);
    const kb = KIND_ORDER.indexOf(b.kind);
    if (ka !== kb) return ka - kb;
    return String(a.mob ?? a.recipe ?? a.level ?? '').localeCompare(String(b.mob ?? b.recipe ?? b.level ?? ''));
  });
}

// ---------------------------------------------------------------------------
// The build
// ---------------------------------------------------------------------------

function build() {
  const vocabulary = readSkillVocabulary(ROOT);
  const ticksPerSecond = JSON.parse(readFileSync(path.join(API, 'shared-constants.json'), 'utf8')).ticksPerSecond;

  const mobs = readDir('mobs');
  const recipes = readDir('recipes');
  const milestones = readMilestonesEntry();
  const ascensionGates = readAscensionGates();

  // BOTH skill folders, one walk, one classification: a file directly under
  // api/skills/ is a player skill, anything deeper is mob-embedded.
  const all = readDir('skills').map((s) => ({
    ...s,
    mobOnly: s.file.split('/').length > 3,
  })).sort((a, b) => (a.raw.id ?? 0) - (b.raw.id ?? 0));

  const players = all.filter((s) => !s.mobOnly);
  const mobSkills = all.filter((s) => s.mobOnly);

  // --- self-check: one row per file, and the two halves summing to the walk.
  const seen = new Set();
  for (const s of all) {
    if (seen.has(s.file)) fail(`${s.file} appears twice in the walk`);
    seen.add(s.file);
  }
  if (players.length + mobSkills.length !== all.length) {
    fail(`${players.length} player + ${mobSkills.length} mob-only != ${all.length} skill files on disk`);
  }
  const byName = new Map();
  for (const s of all) {
    if (byName.has(s.raw.name)) fail(`two skill files claim the name "${s.raw.name}"`);
    byName.set(s.raw.name, s);
  }

  // --- self-check: every top-level key is handled, so a new Go key is loud.
  const RENDERED_TOP = new Set([
    'id', 'name', 'displayName', 'icon', 'description', 'category', 'maxLevel',
    'cooldownTicks', 'cooldownTicksPerLevel', 'castTicks', 'castTicksPerLevel',
    'castInterruptedByDamage', 'targetFactions', 'effects',
  ]);
  // 'legacy' is a retired flag, never shown to a reader; 'visual' is the VFX
  // layer list (plan-skill-vfx.md C0, authored in the editor's Visuals section
  // since C3b), which says nothing about what a skill DOES: this is a numbers
  // document, so the look stays out of it on purpose.
  const SKIPPED_TOP = new Set(['legacy', 'visual']);
  for (const key of vocabulary.topLevelKeys) {
    if (!RENDERED_TOP.has(key) && !SKIPPED_TOP.has(key)) {
      fail(`top-level key "${key}" is in the vocabulary fixture but this generator neither renders nor skips it`);
    }
  }

  // --- references, once per skill.
  const deps = { mobs, milestones, recipes };
  const info = new Map();
  for (const s of all) {
    const { sources, refs } = collectSkillReferences(s.raw.name, deps);
    // sourceText needs the skill name to look its ascension gate up.
    for (const src of sources) src.skill = s.raw.name;
    info.set(s.raw.name, { sources: sortSources(sources), refs });
  }

  // --- self-check: every name another content file points at exists on disk.
  const dangling = new Set();
  const want = (name, where) => { if (name && !byName.has(name)) dangling.add(`${name} (named by ${where})`); };
  for (const m of milestones.raw) want(m.skillName, milestones.file);
  for (const m of mobs) {
    for (const u of m.raw.unlocks || []) want(u.skillName, m.file);
    for (const k of m.raw.skills || []) want(k.skillName, m.file);
    for (const node of (m.raw.interaction || {}).nodes || []) {
      for (const r of node.rewards || []) want(r, `${m.file} node "${node.id}"`);
      for (const opt of node.options || []) {
        for (const g of opt.grants || []) if (g.kind === 'teach_skill') want(g.skill, `${m.file} node "${node.id}"`);
      }
    }
  }
  for (const r of recipes) {
    want(r.raw.result, r.file);
    for (const i of r.raw.ingredients || []) want(i.skill, r.file);
  }
  for (const key of ascensionGates.keys()) want(key, 'api/ascension/');
  for (const d of [...dangling].sort()) fail(`dangling skill reference: ${d}`);

  // --- quest XP, out of the same interaction walk (not a skill source).
  const questXp = [];
  for (const m of mobs) {
    for (const node of (m.raw.interaction || {}).nodes || []) {
      for (const opt of node.options || []) {
        const grants = opt.grants || [];
        const quest = (grants.find((g) => g.kind === 'advance_quest' || g.kind === 'offer_quest') || {}).quest;
        for (const g of grants) {
          if (g.kind !== 'grant_xp' || !quest) continue;
          // Keyed on the MOB too: both legs of wolves-on-the-road pay 400, and
          // a (quest, xp) key would keep whichever mob file readdirSync
          // happened to return first, which differs between filesystems.
          if (!questXp.some((q) => q.quest === quest && q.xp === g.xp && q.mob === m.raw.name)) {
            questXp.push({ quest, xp: g.xp, mob: m.raw.name });
          }
        }
      }
    }
  }
  questXp.sort((a, b) => a.quest.localeCompare(b.quest) || a.xp - b.xp || a.mob.localeCompare(b.mob));

  // --- ascension stones and their catalogs.
  const stones = [];
  for (const m of mobs) {
    for (const node of (m.raw.interaction || {}).nodes || []) {
      if (node.rows !== 'ascension_catalog') continue;
      stones.push({ mob: m.raw.name, rewards: [...(node.rewards || [])].sort() });
    }
  }
  stones.sort((a, b) => a.mob.localeCompare(b.mob));

  return render({
    vocabulary, ticksPerSecond, players, mobSkills, all, info, recipes,
    milestones, ascensionGates, questXp, stones,
  });
}

// ---------------------------------------------------------------------------
// The template. Every line of the doc lives here.
// ---------------------------------------------------------------------------

function render(ctx) {
  const {
    vocabulary, ticksPerSecond, players, mobSkills, all, info, recipes,
    milestones, ascensionGates, questXp, stones,
  } = ctx;

  const isRig = (raw) => TEST_RIG_SKILLS.includes(raw.name);
  const isPrototype = (raw) => (raw.effects || []).some((e) => HIDDEN_EFFECT_TYPES.includes(e.type));

  const sourcesCell = (raw) => {
    const { sources } = info.get(raw.name);
    const tags = [];
    if (isRig(raw)) tags.push('**test rig**');
    if (isPrototype(raw)) tags.push('**prototype**');
    const texts = sources.map((s) => sourceText(s, ascensionGates));
    if (!texts.length) texts.push(`**Cheat only** (\`SKILL ${raw.name}\`)`);
    return cell([...texts, ...tags].join(' · '));
  };

  const playerRow = (s) => [
    s.raw.id,
    cell(renderName(s.raw)),
    s.raw.maxLevel ?? '',
    cell(s.raw.icon ?? ''),
    cell(renderCost(s.raw, vocabulary, ticksPerSecond)),
    cell(renderTiming(s.raw, vocabulary, ticksPerSecond)),
    cell(renderEffects(s.raw, vocabulary, ticksPerSecond)),
    cell((s.raw.targetFactions || []).join('/')),
    sourcesCell(s.raw),
    cell(s.raw.description ?? ''),
  ].join(' | ');

  const table = (header, rows) => [
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r} |`),
  ].join('\n');

  const PLAYER_HEADER = ['ID', 'Name', 'MaxLv', 'Icon', 'Cost', 'Timing', 'Effects', 'Faction scope', 'Sources', 'Description'];
  const byCategory = (cat) => players.filter((s) => s.raw.category === cat);
  const auras = byCategory('active_aura');
  const passives = byCategory('passive');
  const cooldowns = byCategory('cooldown');

  const uncategorised = players.filter((s) => !['active_aura', 'passive', 'cooldown'].includes(s.raw.category));
  if (uncategorised.length) fail(`player skills with an unknown category: ${uncategorised.map((s) => s.raw.name).join(', ')}`);

  // --- mob-only table
  const mobRow = (s) => {
    const carried = info.get(s.raw.name).refs
      .filter((r) => r.kind === 'carries')
      .map((r) => ({ mob: r.mob, level: r.level }))
      .sort((a, b) => a.mob.localeCompare(b.mob));
    return [
      s.raw.id,
      cell(renderName(s.raw)),
      s.raw.maxLevel ?? '',
      cell(renderTiming(s.raw, vocabulary, ticksPerSecond)),
      cell(renderEffects(s.raw, vocabulary, ticksPerSecond, true)),
      cell(carried.length ? carried.map((c) => `${c.mob} L${c.level}`).join(' · ') : 'none'),
    ].join(' | ');
  };

  // --- reachability
  const kindCounts = new Map(KIND_ORDER.map((k) => [k, 0]));
  for (const s of players) {
    for (const src of info.get(s.raw.name).sources) {
      kindCounts.set(src.kind, (kindCounts.get(src.kind) ?? 0) + 1);
    }
  }

  const sourceless = players.filter((s) => info.get(s.raw.name).sources.length === 0);
  const rigs = sourceless.filter((s) => isRig(s.raw));
  const protos = sourceless.filter((s) => isPrototype(s.raw) && !isRig(s.raw));
  const unplaced = sourceless.filter((s) => !isRig(s.raw) && !isPrototype(s.raw));

  // A recipe is reachable when every ingredient has a non-recipe source, or is
  // itself a reachable recipe. Spearhead is an ingredient of Warbanner AND a
  // recipe result, so a single pass would call Warbanner unreachable.
  const directlySourced = new Set(
    players.filter((s) => info.get(s.raw.name).sources.some((x) => x.kind !== 'recipe')).map((s) => s.raw.name),
  );
  const reachable = new Set(directlySourced);
  for (let pass = 0; pass < recipes.length + 1; pass += 1) {
    for (const r of recipes) {
      if (reachable.has(r.raw.result)) continue;
      if ((r.raw.ingredients || []).every((i) => reachable.has(i.skill))) reachable.add(r.raw.result);
    }
  }
  const recipeRows = [...recipes].sort((a, b) => (a.raw.id ?? 0) - (b.raw.id ?? 0)).map((r) => {
    const ings = (r.raw.ingredients || []).map((i) => `${i.skill} ${i.level}`).join(' + ');
    const ok = (r.raw.ingredients || []).every((i) => reachable.has(i.skill));
    return `- **${r.raw.result}** = ${ings} (every ingredient has a source: ${ok ? 'yes' : 'NO'})`;
  });

  // NPC teachings, grouped by teacher.
  const teachersMap = new Map();
  for (const s of players) {
    for (const src of info.get(s.raw.name).sources) {
      if (src.kind !== 'teach') continue;
      if (!teachersMap.has(src.mob)) teachersMap.set(src.mob, []);
      teachersMap.get(src.mob).push(`${s.raw.name}${src.requiredLevel ? ` @L${src.requiredLevel}` : ''}`);
    }
  }
  const teacherLines = [...teachersMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mob, list]) => `- **${mob}**: ${list.sort().join(' · ')}`);
  const teachingCount = [...teachersMap.values()].reduce((n, l) => n + l.length, 0);

  const questRewardLines = [];
  for (const s of players) {
    for (const src of info.get(s.raw.name).sources) {
      if (src.kind !== 'quest') continue;
      questRewardLines.push(`- **${s.raw.name}**: \`${src.quest}\`, on the turn-in row at ${src.mob}`);
    }
  }
  questRewardLines.sort();

  const milestoneRows = [...milestones.raw]
    .sort((a, b) => a.level - b.level)
    .map((m) => `| L${m.level} | ${m.skillName} |`);

  const stoneLines = stones.map((st) => {
    const rewards = st.rewards.map((name) => {
      const gates = ascensionGates.get(name) || [];
      return gates.length ? `${name} (${gates.map(conditionText).join('; ')})` : name;
    });
    return `- **${st.mob}**: ${rewards.join(' · ')}`;
  });

  const list = (lines, empty) => (lines.length ? lines.join('\n') : empty);
  const names = (rows) => (rows.length ? rows.map((s) => s.raw.name).sort().join(', ') : 'none');

  // LOCAL date, not the UTC slice: this line's whole job is to make staleness
  // measurable, and a UTC date reads a day behind for a whole evening.
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const generated = `${today} from api/ at ${gitShortHash()}`;

  return `# Skill inventory

Every skill the game loads, one row each: the fields it authors and how a
player gets hold of it. The rows cover both content folders, \`api/skills/\`
(the player spellbook) and \`api/skills/mobs/\` (the abilities mobs carry), and
everything on this page is derived from the content tree, never typed by hand.

**Regenerate it with \`npm run inventory\` in \`tools/content-editor/\`.** It
rewrites this whole file from \`api/\` in a second or so.

**It is fine for this file to lag behind \`api/\`.** It is a snapshot for
reading, not a pin: nothing breaks when a skill changes and the doc does not,
and nobody owes a regeneration as part of a content edit. Run the command
whenever you want a current picture. The content tree, the loader and its tests
are the truth about what the game does; this page never is.

Generated ${generated}.

Every number here is **[PLACEHOLDER]** by project rule. Per-ability design
intent lives in \`content-auras.md\` / \`content-passives.md\` /
\`content-cooldowns.md\`; this page owns the values and the sources.

**Notation.** \`14 +0.2222/L\` = base 14, plus 0.2222 per skill level (a slope of
0 is not shown). Ticks carry their seconds at ${ticksPerSecond} ticks/s.
Fractions of a pool read as percentages. Flags are named when set
(\`enemies\`, \`allies\`, \`follows\`). Effect keys appear in the order the
authoring vocabulary defines them, so re-saving a skill never reshuffles a row.

**Source kinds.** \`MS L<n>\` = milestone unlock · \`Drop\` = kill unlock with
its chance · \`NPC\` = taught on approach (\`@L<n>\` = the character level it
gates on) · \`Quest\` = a guaranteed reward on a quest turn-in row · \`Recipe\` =
combination result · \`Ascension\` = the bloodline catalog (\`api/ascension/\`),
with its gate conditions where it has any. **Cheat only** = no source in the
world; the \`SKILL\` cheat is the only way to hold it. Two cheat-only kinds are
marked because the code already knows them: **test rig** (\`TEST_RIG_SKILLS\`,
kitchen-sink rigs that must never gain a source) and **prototype** (a skill
using an effect type in \`HIDDEN_EFFECT_TYPES\`, parked pending a verdict).

**${all.length} skills = ${players.length} player (${auras.length} auras, ${passives.length} passives, ${cooldowns.length} cooldowns) + ${mobSkills.length} mob-only.**

## ${CATEGORY_LABELS.active_aura} (${auras.length})

${table(PLAYER_HEADER, auras.map(playerRow))}

## ${CATEGORY_LABELS.passive} (${passives.length})

${table(PLAYER_HEADER, passives.map(playerRow))}

## ${CATEGORY_LABELS.cooldown} (${cooldowns.length})

${table(PLAYER_HEADER, cooldowns.map(playerRow))}

## Mob-only skills (${mobSkills.length})

Loaded from \`api/skills/mobs/\`. They share the id and name space with the
player skills but never reach a spellbook: a mob carries one through its
\`skills[]\` list. A row carried by **none** is either a summon's kit whose mob
is not placed yet, or dead content.

${table(['ID', 'Name', 'MaxLv', 'Timing', 'Effects', 'Carried by'], mobSkills.map(mobRow))}

## Reachability

Counts are source ROWS across the ${players.length} player skills, so a skill with two
teachers counts twice.

${KIND_ORDER.map((k) => `- **${KIND_LABEL[k]}:** ${kindCounts.get(k)}`).join('\n')}

### Cheat only (${sourceless.length})

- **Unplaced (${unplaced.length})**, finished abilities with no source yet: ${names(unplaced)}
- **Test rigs (${rigs.length})**, tooling that must never gain a source: ${names(rigs)}
- **Prototypes (${protos.length})**, parked with delete among the verdicts on offer: ${names(protos)}

### Recipes (${recipes.length})

${list(recipeRows, '- none')}

### NPC teachings (${teachingCount} across ${teachersMap.size} teachers)

${list(teacherLines, '- none')}

### Milestone unlocks (${milestones.raw.length})

| Level | Skill |
|---|---|
${milestoneRows.join('\n')}

### Quest rewards (${questRewardLines.length})

${list(questRewardLines, '- none')}

### Ascension catalogs (${stones.length})

${list(stoneLines, '- none')}

### Quest XP (${questXp.length} rows)

Not a skill source, but it falls out of the same interaction walk and it is the
other half of a turn-in row's payout.

${list(questXp.map((q) => `- \`${q.quest}\`: ${q.xp} XP at ${q.mob}`), '- none')}
`;
}

// ---------------------------------------------------------------------------

const first = build();
const second = build();
if (first !== second) fail('two renders over the same tree differ: the generator is not deterministic');

// Both renders push into the same list, so each finding lands twice.
const unique = [...new Set(problems)];
if (unique.length) {
  console.error(`skill-inventory: ${unique.length} problem(s)`);
  for (const p of unique) console.error(`  - ${p}`);
  process.exit(1);
}

writeFileSync(OUT, first, 'utf8');
console.log(`skill-inventory: wrote ${path.relative(ROOT, OUT)}`);
