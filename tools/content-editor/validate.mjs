// Shared validator, imported by both server.mjs (Node) and public/app.js
// (browser, as a plain ES module) — one definition of "is this content
// legal", not two that can drift.
//
// This is a best-effort PORT of the authoritative Go checks in
// backend/pkg/aura/items/mobs/interaction.go (mapToInteraction) and
// backend/pkg/aura/quests/quests.go + interactions.go (validateQuest,
// CrossValidate). It exists to catch the common authoring mistakes BEFORE
// `go build && go test` does, not to replace that boot-time check — a few
// deep corners (costs/consequences schema-room tombstones, the exact
// wire-index edge cases) are deliberately left to Go. See
// docs/plan-content-editor.md §4/§6.

const QUEST_STAGE_SENTINELS = ['not_started', 'completed', 'running'];
const CONDITION_KINDS = ['minLevel', 'quest_at_stage', 'bloodline_ascensions', 'kills_this_life'];
const GRANT_KINDS = ['teach_skill', 'offer_quest', 'advance_quest', 'grant_xp', 'travel_to'];
const TRAVEL_MODES = ['home_campfire', 'caster'];
const ROW_SOURCE_KINDS = ['ascension_catalog', 'memorial_names'];
const OBJECTIVE_KINDS = ['kill', 'harvest', 'talk_to'];

/** Builds the cross-file index every check needs: mob/quest/skill name sets
 * plus the dialogue-edge set that decides whether a stage is terminal. */
export function buildIndex(mobs, quests, skillNames) {
  const mobNames = new Set(mobs.map((m) => m.raw.name));
  const questsById = new Map(quests.map((q) => [q.raw.id, q.raw]));
  const skills = new Set(skillNames);

  // questId -> Set(stageId) that some NPC's advance_quest walks OUT of.
  const dialogueEdgeFrom = new Map();
  const offeredQuests = new Set();
  for (const { raw: mob } of mobs) {
    for (const node of mob.interaction?.nodes || []) {
      for (const opt of node.options || []) {
        for (const g of opt.grants || []) {
          if (g.kind === 'advance_quest' && g.quest && g.fromStage) {
            if (!dialogueEdgeFrom.has(g.quest)) dialogueEdgeFrom.set(g.quest, new Set());
            dialogueEdgeFrom.get(g.quest).add(g.fromStage);
          }
          if (g.kind === 'offer_quest' && g.quest) offeredQuests.add(g.quest);
        }
      }
    }
  }
  return { mobNames, questsById, skills, dialogueEdgeFrom, offeredQuests };
}

function stageById(quest, id) {
  return (quest.stages || []).find((s) => s.id === id) || null;
}

// Mirrors QuestDefinition.IsTerminal: no objectives, no `next`, and nothing
// anywhere walks a dialogue edge OUT of this stage.
function isTerminal(quest, stage, idx) {
  const edges = idx.dialogueEdgeFrom.get(quest.id);
  const hasOutgoing = edges ? edges.has(stage.id) : false;
  return (!stage.objectives || stage.objectives.length === 0) && !stage.next && !hasOutgoing;
}

/** Ports validateQuest (quests.go). Returns [{message}]. */
export function validateQuest(quest, idx) {
  const errors = [];
  const err = (m) => errors.push({ message: m });

  if (!quest.id) { err('quest without an id'); return errors; }
  const q = `quest "${quest.id}"`;
  if (!quest.title) err(`${q}: missing title`);
  if (!quest.stages || quest.stages.length === 0) { err(`${q}: no stages`); return errors; }

  const seen = new Set();
  for (const s of quest.stages) {
    if (!s.id) { err(`${q}: stage without an id`); continue; }
    if (seen.has(s.id)) err(`${q}: duplicate stage id "${s.id}"`);
    seen.add(s.id);
    if (!s.journal) err(`${q} stage "${s.id}": missing journal prose`);

    const objectives = s.objectives || [];
    if (objectives.length > 0 && !s.next) err(`${q} stage "${s.id}": objectives without a next stage`);
    if (objectives.length === 0 && s.next) {
      err(`${q} stage "${s.id}": next without objectives (a dialogue stage advances via rows)`);
    }
    for (const o of objectives) {
      if (!OBJECTIVE_KINDS.includes(o.kind)) {
        err(`${q} stage "${s.id}": objective kind "${o.kind}" must be one of ${OBJECTIVE_KINDS.join('/')}`);
        continue;
      }
      let name = o.species;
      if (o.kind === 'talk_to') {
        if (o.species) err(`${q} stage "${s.id}": talk_to names an npc, not a species`);
        name = o.npc;
      } else if (o.npc) {
        err(`${q} stage "${s.id}": ${o.kind} names a species, not an npc`);
      }
      if (!name) err(`${q} stage "${s.id}": objective "${o.kind}" without a target`);
      else if (!idx.mobNames.has(name)) err(`${q} stage "${s.id}": objective "${o.kind}" names unknown target "${name}"`);
    }
    if (s.tracker && (s.tracker.includes('{n}') || s.tracker.includes('{m}'))) {
      if (!objectives.some((o) => o.kind !== 'talk_to')) {
        err(`${q} stage "${s.id}": tracker uses {n}/{m} but the stage has no kill/harvest objective to count`);
      }
    }
  }
  for (const s of quest.stages) {
    if (!s.next) continue;
    if (s.next === s.id) { err(`${q} stage "${s.id}": next points to itself`); continue; }
    if (!stageById(quest, s.next)) err(`${q} stage "${s.id}": next "${s.next}" is not a stage`);
  }
  // Acyclic objective-stage chain (dialogue stages, having no `next`, break it).
  for (const start of quest.stages) {
    let steps = 0;
    let s = start;
    while (s && s.next) {
      steps++;
      if (steps > quest.stages.length) { err(`${q}: objective stages form a cycle through "${start.id}"`); break; }
      s = stageById(quest, s.next);
    }
  }
  return errors;
}

/** Ports mapToInteraction + the relevant half of CrossValidate. */
export function validateInteraction(mob, idx) {
  const errors = [];
  const err = (m) => errors.push({ message: m });
  const inter = mob.interaction;
  if (!inter) return errors;
  const who = `mob "${mob.name}"`;

  if (inter.trigger) err(`${who}: interaction.trigger was retired — use interaction.ambient`);
  if (inter.range != null && inter.range < 0) err(`${who}: interaction.range must not be negative`);
  const nodes = inter.nodes || [];
  if (nodes.length === 0) { err(`${who}: interaction.nodes must not be empty`); return errors; }

  const ids = new Set();
  for (const node of nodes) {
    if (!node.id?.trim()) { err(`${who}: an interaction node has no id`); continue; }
    if (ids.has(node.id)) err(`${who}: duplicate node id "${node.id}"`);
    ids.add(node.id);
  }

  for (const node of nodes) {
    const nWho = `${who}: node "${node.id}"`;
    if (node.rows) {
      if (!ROW_SOURCE_KINDS.includes(node.rows)) {
        err(`${nWho}: rows "${node.rows}" must be one of ${ROW_SOURCE_KINDS.join('/')}`);
      }
      if ((node.options || []).length > 0) {
        err(`${nWho}: a generated-row node must author no options — they would share one index space`);
      }
      if (!(node.lines || []).length) {
        err(`${nWho}: a generated-row node needs lines — its rows can come back empty`);
      }
      if (node.rows === 'ascension_catalog') {
        if (!('rewards' in node)) {
          err(`${nWho}: an ascension_catalog node must author "rewards" (use [] to offer none)`);
        } else {
          const seenReward = new Set();
          for (const key of node.rewards || []) {
            if (!key?.trim()) err(`${nWho}: a reward entry must name an unlock key`);
            else if (seenReward.has(key)) err(`${nWho}: reward "${key}" is offered twice by this node`);
            seenReward.add(key);
          }
        }
      } else if ('rewards' in node) {
        err(`${nWho}: rewards is only for an ascension_catalog node`);
      }
    } else if ('rewards' in node) {
      err(`${nWho}: rewards is only for an ascension_catalog node`);
    }

    for (const [ci, c] of (node.conditions || []).entries()) {
      const cWho = `${nWho} condition ${ci}`;
      if (!CONDITION_KINDS.includes(c.kind)) {
        err(`${cWho}: kind "${c.kind}" must be one of ${CONDITION_KINDS.join('/')}`);
        continue;
      }
      if (c.kind === 'quest_at_stage') {
        if (!c.quest || !c.stage) {
          err(`${cWho}: quest_at_stage needs a quest and a stage`);
        } else if (!idx.questsById.has(c.quest)) {
          err(`${cWho}: quest_at_stage names unknown quest "${c.quest}"`);
        } else if (!QUEST_STAGE_SENTINELS.includes(c.stage) && !stageById(idx.questsById.get(c.quest), c.stage)) {
          err(`${cWho}: quest_at_stage names stage "${c.stage}", which quest "${c.quest}" does not define`);
        }
      }
      if (c.kind === 'kills_this_life') {
        if (!c.species?.trim()) err(`${cWho}: kills_this_life needs a species`);
        if (!(c.value > 0)) err(`${cWho}: kills_this_life needs a positive count`);
      }
      if (c.kind === 'bloodline_ascensions' && !(c.value > 0)) {
        err(`${cWho}: bloodline_ascensions needs a positive count`);
      }
    }

    let grantsInNode = 0;
    for (const [oi, opt] of (node.options || []).entries()) {
      const oWho = `${nWho} option ${oi}`;
      if (opt.blockedLine) err(`${oWho}: blockedLine was retired — a locked row is greyed automatically`);
      const grants = opt.grants || [];
      grantsInNode += grants.length;

      let questKindIdx = -1;
      let questKindCount = 0;
      let xpCount = 0;
      let travelCount = 0;
      for (const [gi, g] of grants.entries()) {
        const gWho = `${oWho} grant ${gi}`;
        if (!GRANT_KINDS.includes(g.kind)) {
          err(`${gWho}: kind "${g.kind}" must be one of ${GRANT_KINDS.join('/')}`);
          continue;
        }
        if (!g.line?.trim()) err(`${gWho}: line must not be empty`);
        if (g.kind !== 'teach_skill' && g.skill) err(`${gWho}: a ${g.kind} grant hands over no skill — drop "skill"`);
        if (g.kind !== 'teach_skill' && g.requiredLevel) err(`${gWho}: a ${g.kind} grant takes no requiredLevel`);
        if (g.kind !== 'travel_to' && g.mode) err(`${gWho}: a ${g.kind} grant goes nowhere — drop "mode"`);

        if (g.kind === 'teach_skill') {
          if (g.quest || g.fromStage || g.toStage || g.xp) {
            err(`${gWho}: a teach_skill grant takes no quest/stage/xp keys`);
          }
          if (!g.skill) err(`${gWho}: teach_skill needs a skill`);
          else if (!idx.skills.has(g.skill)) err(`${gWho}: skill "${g.skill}" not found`);
        } else if (g.kind === 'offer_quest') {
          questKindCount++; if (questKindIdx < 0) questKindIdx = gi;
          if (!g.quest) err(`${gWho}: offer_quest needs a quest id`);
          else if (!idx.questsById.has(g.quest)) err(`${gWho}: offer_quest names unknown quest "${g.quest}"`);
          if (g.fromStage || g.toStage) err(`${gWho}: offer_quest carries no edge — drop fromStage/toStage`);
        } else if (g.kind === 'advance_quest') {
          questKindCount++; if (questKindIdx < 0) questKindIdx = gi;
          if (!g.quest) err(`${gWho}: advance_quest needs a quest id`);
          if (!g.fromStage || !g.toStage) err(`${gWho}: advance_quest needs fromStage and toStage`);
          else if (g.fromStage === g.toStage) err(`${gWho}: advance_quest edge "${g.fromStage}" → itself never progresses`);
          else if (g.quest && idx.questsById.has(g.quest)) {
            const quest = idx.questsById.get(g.quest);
            const from = stageById(quest, g.fromStage);
            const to = stageById(quest, g.toStage);
            if (!from) err(`${gWho}: advance_quest names fromStage "${g.fromStage}", which quest "${g.quest}" does not define`);
            else if ((from.objectives || []).length > 0) {
              err(`${gWho}: advance_quest leaves stage "${g.fromStage}", but that is an objective stage — it advances off its counters, not off a row`);
            }
            if (!to) err(`${gWho}: advance_quest names toStage "${g.toStage}", which quest "${g.quest}" does not define`);
          } else if (g.quest) {
            err(`${gWho}: advance_quest names unknown quest "${g.quest}"`);
          }
        } else if (g.kind === 'grant_xp') {
          xpCount++;
          if (!(g.xp > 0)) err(`${gWho}: grant_xp needs an xp amount`);
          if (g.quest || g.fromStage || g.toStage) err(`${gWho}: grant_xp is a reward on a quest row, not a quest op`);
        } else if (g.kind === 'travel_to') {
          travelCount++;
          if (g.quest || g.fromStage || g.toStage || g.xp) err(`${gWho}: travel_to takes no quest/stage/xp keys`);
          if (!g.mode) err(`${gWho}: travel_to needs a mode`);
          else if (!TRAVEL_MODES.includes(g.mode)) err(`${gWho}: mode "${g.mode}" must be one of ${TRAVEL_MODES.join('/')}`);
        }
      }

      if (questKindCount > 1) err(`${oWho}: one quest op per row — a row that advanced two quests at once could half-fail`);
      if (questKindCount === 1 && questKindIdx !== 0) {
        err(`${oWho}: the quest grant must come first, or its rewards are handed over before the quest check`);
      }
      if (xpCount > 0 && questKindCount === 0) err(`${oWho}: grant_xp needs an advance_quest on the same row`);
      if (questKindCount === 1 && !opt.text?.trim()) err(`${oWho}: a quest row needs authored text`);

      if (travelCount > 1) err(`${oWho}: one travel_to per row`);
      if (travelCount === 1) {
        if (grants.length > travelCount) err(`${oWho}: travel_to is a row of its own — it cannot share with other grants`);
        if (opt.next) err(`${oWho}: a travel_to row takes no next — stepping through ends the conversation`);
        if (!opt.text?.trim()) err(`${oWho}: a travel_to row needs authored text`);
      }

      if (grants.length === 0 && !opt.next) err(`${oWho}: needs at least one grant or a next`);

      if (opt.lockedWhenGated) {
        if (!opt.next) err(`${oWho}: lockedWhenGated names the gate on the node it leads to, so it needs a next`);
        if (grants.length > 0) err(`${oWho}: lockedWhenGated is for a pure navigation row — a locked row is inert`);
      }
    }

    if ((node.lines || []).length === 0 && grantsInNode === 0) {
      err(`${nWho}: needs lines or at least one grant`);
    }
  }

  // L3: conditional nodes must sit above the unconditional fallback, unless
  // they are only ever reached as a navigation destination.
  const destinations = new Set();
  for (const node of nodes) for (const opt of node.options || []) if (opt.next) destinations.add(opt.next);
  for (let i = 0; i < nodes.length; i++) {
    if ((nodes[i].conditions || []).length > 0) continue;
    for (const later of nodes.slice(i + 1)) {
      if ((later.conditions || []).length > 0 && !destinations.has(later.id)) {
        err(`${who}: node "${later.id}" is conditional but sits below the unconditional node "${nodes[i].id}" with nothing navigating to it — put conditional nodes first`);
      }
    }
    break;
  }

  for (const node of nodes) {
    for (const [oi, opt] of (node.options || []).entries()) {
      if (opt.next && !ids.has(opt.next)) {
        err(`${who}: node "${node.id}" option ${oi}: next "${opt.next}" names no node`);
      }
    }
  }

  for (const node of nodes) {
    for (const [oi, opt] of (node.options || []).entries()) {
      if (!opt.lockedWhenGated) continue;
      const dest = nodes.find((n) => n.id === opt.next);
      if (!dest || (dest.conditions || []).length === 0) {
        err(`${who}: node "${node.id}" option ${oi}: lockedWhenGated needs a gated destination`);
      }
    }
  }

  return errors;
}

/** grant_xp is only safe on an edge that ends the quest (otherwise abandon
 * + re-accept loops the reward). Needs the full cross-file edge index. */
function validateXpTerminal(mob, idx) {
  const errors = [];
  for (const node of mob.interaction?.nodes || []) {
    for (const [oi, opt] of (node.options || []).entries()) {
      const advance = (opt.grants || []).find((g) => g.kind === 'advance_quest');
      const hasXp = (opt.grants || []).some((g) => g.kind === 'grant_xp');
      if (!hasXp || !advance || !advance.quest) continue;
      const quest = idx.questsById.get(advance.quest);
      if (!quest) continue;
      const to = stageById(quest, advance.toStage);
      if (to && !isTerminal(quest, to, idx)) {
        errors.push({
          message: `mob "${mob.name}": node "${node.id}" option ${oi}: grant_xp sits on an edge that does not end quest "${quest.id}" — abandon leaves the counters standing, so that XP is loopable`,
        });
      }
    }
  }
  return errors;
}

/** Runs every check over the whole content set. `mobs`/`quests` are arrays
 * of {file, raw}; `skillNames` is a flat array of skill name strings. */
export function validateAll(mobs, quests, skillNames) {
  const idx = buildIndex(mobs, quests, skillNames);
  const errors = [];
  const warnings = [];

  for (const { file, raw } of quests) {
    for (const e of validateQuest(raw, idx)) errors.push({ file, kind: 'quest', ...e });
  }
  for (const { file, raw } of mobs) {
    if (!raw.interaction) continue;
    for (const e of validateInteraction(raw, idx)) errors.push({ file, kind: 'npc', ...e });
    for (const e of validateXpTerminal(raw, idx)) errors.push({ file, kind: 'npc', ...e });
  }
  for (const q of idx.questsById.values()) {
    if (!idx.offeredQuests.has(q.id)) {
      warnings.push({ file: null, kind: 'quest', message: `quest "${q.id}" is offered by no conversant, so it cannot be started in play` });
    }
  }
  return { errors, warnings, index: idx };
}
