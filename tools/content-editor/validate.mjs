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

// Mob-definition vocabulary, ported from the Go single sources of truth:
// backend/pkg/aura/items/mobs/role.go, definitions.go's tierRanks, and
// backend/pkg/aura/skills/definition.go's DamageTypes/GateKeys.
export const ROLES = ['creature', 'structure', 'follower'];
export const TIERS = ['normal', 'elite', 'boss'];
const TIER_RANK = { normal: 0, elite: 1, boss: 2 };
export const DAMAGE_TYPES = ['physical', 'fire', 'frost', 'nature', 'poison', 'bleed'];
export const RESIST_WILDCARD = '*';
export const GATE_KEYS = ['harvest', 'smash'];
// backend/pkg/aura/model/layers.go: CollisionLayer is `0x1 << iota` from
// LayerPlayerStaticCollision, with one reserved gap bit (8) that must never
// be offered — see that file's comment on why the gap cannot be filled.
export const COLLISION_LAYER_BITS = [
  { bit: 1, name: 'PlayerStatic' },
  { bit: 2, name: 'Action' },
  { bit: 4, name: 'Weapon' },
  { bit: 16, name: 'Border' },
  { bit: 32, name: 'Viewport' },
  { bit: 64, name: 'MobStatic' },
  { bit: 128, name: 'Player' },
  { bit: 256, name: 'Placeable' },
];

// Faction vocabulary, ported from backend/pkg/aura/factions/factions.go.
// "aligned"/"hostile" are the two built-in factions (player/summon, and the
// default a mob gets with no faction key) — never declarable as a NEW
// faction's own name, but always valid hostileTo targets (every faction
// that fights players declares hostileTo: ["aligned"]).
export const RESERVED_FACTION_NAMES = ['aligned', 'hostile'];
// MaxFactions(64) - firstContentID(2): the aggro bitmask is a uint64, and
// the two built-ins occupy bits 0-1.
export const MAX_FACTIONS = 62;

/** Builds the cross-file index every check needs: mob/quest/skill name sets
 * plus the dialogue-edge set that decides whether a stage is terminal.
 * `extra.factionNames`/`extra.entityTypes` (arrays) feed mob-stat validation;
 * `extra.skillMaxLevels` ({name: maxLevel}) and `extra.recipes` ([{file,raw}])
 * feed recipe validation. Omit what doesn't apply at a given call site. */
export function buildIndex(mobs, quests, skillNames, extra = {}) {
  const mobNames = new Set(mobs.map((m) => m.raw.name));
  const questsById = new Map(quests.map((q) => [q.raw.id, q.raw]));
  const skills = new Set(skillNames);
  const factionNames = new Set(extra.factionNames || []);
  const entityTypes = new Set(extra.entityTypes || []);
  const skillMaxLevels = new Map(Object.entries(extra.skillMaxLevels || {}));

  // recipe id -> [{file, result}] sharing it, so a recipe can be checked
  // against every OTHER recipe's id (including a freshly-created one that
  // hasn't saved yet) without a separate cross-file pass.
  const recipeIdOwners = new Map();
  for (const { file, raw } of extra.recipes || []) {
    if (raw.id == null) continue;
    if (!recipeIdOwners.has(raw.id)) recipeIdOwners.set(raw.id, []);
    recipeIdOwners.get(raw.id).push({ file, result: raw.result });
  }

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
  return {
    mobNames, questsById, skills, dialogueEdgeFrom, offeredQuests, factionNames, entityTypes,
    skillMaxLevels, recipeIdOwners,
  };
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

/** Ports mapToMobDefinition's error-returning checks (backend/pkg/aura/items/
 * mobs/definitions.go). Runs for EVERY mob, interaction or not — an NPC is
 * just a mob that also carries one (docs/manual-content-authoring.md §1c),
 * and these are mob-level rules, not interaction-level ones. Order mirrors
 * the Go function so a fix here is easy to cross-check against it. */
export function validateMob(mob, idx) {
  const errors = [];
  const err = (m) => errors.push({ message: m });
  const who = `mob "${mob.name}"`;
  const factors = mob.factors || {};
  const body = mob.body || {};

  const role = mob.role || 'creature';
  if (mob.role && !ROLES.includes(mob.role)) {
    err(`${who}: role "${mob.role}" must be one of ${ROLES.join('/')}`);
  }
  if (!(body.aggroRadius > 0) && role !== 'structure') {
    err(`${who}: body.aggroRadius is required and must be > 0 for role "${role}"`);
  }

  if (factors.maxHealth) {
    err(`${who}: factors.maxHealth is raw authoring — author factors.baseMaxHealth + tier + curveLevel instead (C0 tier+baseline rule)`);
  }
  if ('experience' in factors) {
    err(`${who}: factors.experience was replaced by the kill-XP formula — author factors.xpFactor instead (0 stays 0; any other value: drop the key, the default 1 is a full at-level kill)`);
  }
  const xpFactor = factors.xpFactor ?? 1;
  if (xpFactor < 0) err(`${who}: factors.xpFactor ${xpFactor} must be >= 0`);

  const tier = mob.tier || 'normal';
  if (mob.tier && !TIERS.includes(mob.tier)) {
    err(`${who}: tier "${mob.tier}" must be one of ${TIERS.join('/')}`);
  }
  const rank = TIER_RANK[tier] ?? 0;
  if (rank >= TIER_RANK.elite && !('ccImmune' in factors)) {
    err(`${who}: tier "${tier}" must author factors.ccImmune (true or false) — the tier does not decide it`);
  }

  if (mob.curveLevel != null && mob.curveLevel < 0) {
    err(`${who}: curveLevel ${mob.curveLevel} must be >= 1`);
  }
  const variance = factors.maxHealthVariance ?? 0;
  if (variance < 0 || variance >= 1) err(`${who}: factors.maxHealthVariance ${variance} must be in [0, 1)`);
  const fleeRatio = factors.fleeBelowHealthRatio ?? 0;
  if (fleeRatio < 0 || fleeRatio > 1) err(`${who}: factors.fleeBelowHealthRatio ${fleeRatio} must be in [0, 1]`);
  const supportThreshold = factors.supportThreshold ?? 0;
  if (supportThreshold < 0 || supportThreshold > 1) err(`${who}: factors.supportThreshold ${supportThreshold} must be in [0, 1] (or absent for 1.0)`);

  const wanderRadius = factors.wanderRadius ?? 0;
  if (wanderRadius < 0) err(`${who}: factors.wanderRadius ${wanderRadius} must not be negative`);
  if (wanderRadius > 0 && !(factors.speed > 0)) err(`${who}: stationary mob (speed 0) cannot carry a default wanderRadius`);
  const idleSpeedFactor = factors.idleSpeedFactor ?? 0;
  if (idleSpeedFactor < 0 || idleSpeedFactor > 1) err(`${who}: factors.idleSpeedFactor ${idleSpeedFactor} must be in (0, 1] (or absent)`);
  const dwellMin = factors.idleDwellMinTicks ?? 0;
  const dwellMax = factors.idleDwellMaxTicks ?? 0;
  if (dwellMin < 0 || dwellMax < 0) err(`${who}: idle dwell ticks must not be negative`);
  if (dwellMax > 0 && dwellMin > dwellMax) err(`${who}: idleDwellMinTicks ${dwellMin} exceeds idleDwellMaxTicks ${dwellMax}`);

  for (const [tag, multiplier] of Object.entries(factors.resistances || {})) {
    if (!tag) { err(`${who}: resistances: empty tag`); continue; }
    if (tag !== RESIST_WILDCARD && !DAMAGE_TYPES.includes(tag)) {
      if (GATE_KEYS.includes(tag)) err(`${who}: resistances["${tag}"]: that is a GATE KEY, not a damage type — author it in factors.gateKeys`);
      else err(`${who}: resistances["${tag}"]: unknown damage type`);
      continue;
    }
    if (multiplier < 0) err(`${who}: resistances["${tag}"]: must be >= 0, got ${multiplier}`);
  }
  for (const key of factors.gateKeys || []) {
    if (!GATE_KEYS.includes(key)) {
      if (DAMAGE_TYPES.includes(key)) err(`${who}: gateKeys: "${key}" is a DAMAGE TYPE, not a gate key — author it in factors.resistances`);
      else err(`${who}: gateKeys: unknown gate key "${key}"`);
    }
  }

  const wireKey = mob.entityType || mob.name;
  if (!idx.entityTypes.has(wireKey)) {
    if (mob.entityType) err(`${who}: entityType "${mob.entityType}" is not a known EntityType`);
    else err(`${who}: name is not a known EntityType and no entityType override is set`);
  }

  if (mob.faction) {
    if (mob.faction === 'aligned') err(`${who}: faction "aligned" is summon-only and cannot be authored`);
    else if (!idx.factionNames.has(mob.faction)) err(`${who}: faction "${mob.faction}" not found`);
  }

  for (const s of mob.skills || []) {
    if (!s.skillName || !idx.skills.has(s.skillName)) err(`${who}: skill "${s.skillName}" not found`);
  }
  for (const u of mob.unlocks || []) {
    if (!u.skillName || !idx.skills.has(u.skillName)) err(`${who}: unlock skill "${u.skillName}" not found`);
    const chance = u.chance ?? 1.0;
    if (chance <= 0 || chance > 1) err(`${who}: unlock "${u.skillName}" chance ${chance} must be in (0, 1]`);
  }

  // The two cross-field checks from mapToMobDefinition that fire only once
  // an interaction is attached — a conversant with no sensor, or one riding
  // the dangerous unset-collisionLayer default (aura-targetable by nothing
  // stopping it).
  if (mob.interaction) {
    const senseRadius = Math.max(body.aggroRadius || 0, mob.interaction.range || 0);
    if (!(senseRadius > 0)) err(`${who}: an interaction needs a sensor — author interaction.range or body.aggroRadius`);
    if (!(body.collisionLayer > 0)) err(`${who}: a mob carrying an interaction must author body.collisionLayer explicitly — the unset default is aura-targetable`);
  }

  return errors;
}

/** Ports RegistryFromFS's per-faction checks (backend/pkg/aura/factions/
 * factions.go): a required (possibly empty) hostileTo list, each entry
 * resolving to a known faction (a declared one, or the two reserved
 * built-ins), no self-reference, and the friendlyToPlayers/hostileTo
 * "aligned" contradiction. Duplicate-name-across-files and the total
 * MAX_FACTIONS cap are cross-file checks — see validateAll. */
export function validateFaction(faction, idx) {
  const errors = [];
  const err = (m) => errors.push({ message: m });
  const name = faction.name;
  if (!name || !name.trim()) { err('faction without a name'); return errors; }
  const who = `faction "${name}"`;
  if (RESERVED_FACTION_NAMES.includes(name)) err(`${who}: name is reserved (built-in) and cannot be declared`);

  if (!Array.isArray(faction.hostileTo)) {
    err(`${who}: hostileTo is required (use [] for a passive, retaliation-only faction)`);
    return errors;
  }
  let hostileToAligned = false;
  for (const ref of faction.hostileTo) {
    if (ref === name) { err(`${who}: hostileTo must not reference itself`); continue; }
    if (!RESERVED_FACTION_NAMES.includes(ref) && !idx.factionNames.has(ref)) {
      err(`${who}: hostileTo references unknown faction "${ref}"`);
      continue;
    }
    if (ref === 'aligned') hostileToAligned = true;
  }
  if (faction.friendlyToPlayers && hostileToAligned) {
    err(`${who}: friendlyToPlayers contradicts hostileTo "aligned"`);
  }
  return errors;
}

/** Ports recipe.go's load-time checks (backend/pkg/aura/skills/recipe.go):
 * `id` is required and must be globally unique (author-picked, not
 * auto-incremented by Go); `result` must resolve to an ALREADY-authored
 * skill — a recipe cannot create one, only unlock an existing definition via
 * a second path; ingredients must be non-empty, and each one's skill must
 * resolve with its level in [1, that skill's maxLevel]. Cross-recipe
 * chaining (one recipe's result named as another's ingredient), two recipes
 * sharing an ingredient set, and a skill repeated within one ingredient list
 * are all legal by design (recipe.go's own doc comment + the shipped
 * Warbanner/Spearhead chain) — none of that is flagged here. */
export function validateRecipe(recipe, idx) {
  const errors = [];
  const err = (m) => errors.push({ message: m });
  const who = recipe.result ? `recipe "${recipe.result}"` : `recipe id ${recipe.id ?? '?'}`;

  if (typeof recipe.id !== 'number') {
    err(`${who}: id is required and must be a number`);
  } else {
    const owners = idx.recipeIdOwners.get(recipe.id) || [];
    if (owners.length > 1) {
      const others = owners.map((o) => `"${o.result || o.file}"`).join(', ');
      err(`${who}: id ${recipe.id} is not unique — shared by ${others}`);
    }
  }

  if (!recipe.result) err(`${who}: result is required`);
  else if (!idx.skills.has(recipe.result)) {
    err(`${who}: unknown result skill "${recipe.result}" — the result must already be authored under api/skills/`);
  }

  const ingredients = recipe.ingredients || [];
  if (ingredients.length === 0) { err(`${who}: empty ingredient list`); return errors; }
  ingredients.forEach((ing, i) => {
    const iWho = `${who} ingredient ${i}`;
    if (!ing.skill) { err(`${iWho}: needs a skill`); return; }
    if (!idx.skills.has(ing.skill)) { err(`${iWho}: unknown skill "${ing.skill}"`); return; }
    const maxLevel = idx.skillMaxLevels.get(ing.skill);
    if (!(ing.level >= 1) || (maxLevel != null && ing.level > maxLevel)) {
      err(`${iWho}: "${ing.skill}" level ${ing.level} must be in [1, ${maxLevel ?? '?'}]`);
    }
  });
  return errors;
}

/** Ports skills/milestones.go: every entry's `skillName` must resolve
 * against the skill registry; `level` must be a non-negative integer. Go
 * enforces neither uniqueness nor sort order — two skills at the same level,
 * or the same skill twice, are both legal — so neither is flagged here. */
export function validateMilestones(list, idx) {
  const errors = [];
  const err = (m) => errors.push({ message: m });
  if (!Array.isArray(list)) { err('milestone-unlocks.json must be a JSON array'); return errors; }
  list.forEach((entry, i) => {
    const who = `milestone entry ${i} (level ${entry.level})`;
    if (!Number.isInteger(entry.level) || entry.level < 0) err(`${who}: level must be a non-negative integer`);
    if (!entry.skillName) err(`${who}: skillName is required`);
    else if (!idx.skills.has(entry.skillName)) err(`${who}: skill "${entry.skillName}" not found`);
  });
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
 * of {file, raw}; `skillNames` is a flat array of skill name strings; `extra`
 * is buildIndex's optional {factionNames, entityTypes, skillMaxLevels}, plus
 * `extra.factions`/`extra.recipes` ([{file, raw}]) so those files themselves
 * get validated here too, and `extra.milestones` ({file, raw} — raw is the
 * whole array, it's one shared file) — the per-mob loops above only ever
 * read faction/skill NAMES as a reference target, never validate those
 * definitions on their own. */
export function validateAll(mobs, quests, skillNames, extra = {}) {
  const idx = buildIndex(mobs, quests, skillNames, extra);
  const errors = [];
  const warnings = [];
  const factions = extra.factions || [];
  const recipes = extra.recipes || [];

  for (const { file, raw } of quests) {
    for (const e of validateQuest(raw, idx)) errors.push({ file, kind: 'quest', ...e });
  }
  for (const { file, raw } of mobs) {
    for (const e of validateMob(raw, idx)) errors.push({ file, kind: 'mob', ...e });
    if (!raw.interaction) continue;
    for (const e of validateInteraction(raw, idx)) errors.push({ file, kind: 'npc', ...e });
    for (const e of validateXpTerminal(raw, idx)) errors.push({ file, kind: 'npc', ...e });
  }
  for (const { file, raw } of factions) {
    for (const e of validateFaction(raw, idx)) errors.push({ file, kind: 'faction', ...e });
  }
  if (factions.length > MAX_FACTIONS) {
    errors.push({ file: null, kind: 'faction', message: `${factions.length} factions declared, at most ${MAX_FACTIONS} are supported` });
  }
  for (const { file, raw } of recipes) {
    for (const e of validateRecipe(raw, idx)) errors.push({ file, kind: 'recipe', ...e });
  }
  if (extra.milestones) {
    for (const e of validateMilestones(extra.milestones.raw, idx)) {
      errors.push({ file: extra.milestones.file, kind: 'milestones', ...e });
    }
  }
  for (const q of idx.questsById.values()) {
    if (!idx.offeredQuests.has(q.id)) {
      warnings.push({ file: null, kind: 'quest', message: `quest "${q.id}" is offered by no conversant, so it cannot be started in play` });
    }
  }
  return { errors, warnings, index: idx };
}
