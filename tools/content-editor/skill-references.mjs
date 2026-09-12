// Every place a skill NAME is referenced by other content, computed once and
// used twice: the Skills tab's "Obtained via" panel renders it with jump
// links, and the server's rename guard (plan-content-editor.md §B10 L5)
// refuses a rename that would orphan any of these rows.
//
// ⚑ The reason this is one function and not two scans: the panel and the
// guard MUST agree. A row the panel shows but the guard misses is a rename
// that silently breaks content; a row the guard sees but the panel does not
// is a refusal the author cannot explain.
//
// ⚑ Loaded by the browser as a plain ES module (app.js) AND by node
// (save-skill.mjs, its tests), so it imports nothing from `node:` - the same
// constraint that keeps validate.mjs and skill-presentation.mjs portable.
//
// A jump target is PLAIN DATA ({kind, file, nodeId?}), never a closure: the
// server has no tabs to jump to, and the panel maps the data to its own
// navigation.

// `sources` = how a player OBTAINS the skill (the five spellbook routes);
// `refs` = other content naming it without granting it (a mob carrying it,
// a recipe consuming it as an ingredient). Both matter to a rename; only
// `sources` answers "is this cheat-only?".
export function collectSkillReferences(name, { mobs = [], milestones = null, recipes = [] } = {}) {
  const sources = [];
  const refs = [];
  if (!name) return { sources, refs };

  for (const m of (milestones && Array.isArray(milestones.raw) ? milestones.raw : [])) {
    if (m.skillName === name) {
      sources.push({ label: `Milestone · level ${m.level}`, jump: { kind: 'milestones', file: milestones.file } });
    }
  }

  for (const m of mobs) {
    for (const u of m.raw.unlocks || []) {
      if (u.skillName === name) {
        sources.push({ label: `${m.raw.name} · kill drop, ${u.chance != null ? `chance ${u.chance}` : 'guaranteed'}`, jump: { kind: 'mob', file: m.file } });
      }
    }
    for (const s of m.raw.skills || []) {
      if (s.skillName === name) {
        refs.push({ label: `${m.raw.name} · carries it at level ${s.level ?? 1}`, jump: { kind: 'mob', file: m.file } });
      }
    }
    if (!m.raw.interaction) continue;
    for (const node of m.raw.interaction.nodes || []) {
      // An ascension_catalog node's rewards are skill names too: the
      // meta-progression route (a sacrificed character unlocks one for the
      // slot), the fifth spellbook source in CLAUDE.md, missing from D6's list.
      if (node.rows === 'ascension_catalog' && (node.rewards || []).includes(name)) {
        sources.push({ label: `${m.raw.name} · ascension reward via node "${node.id}" (unlocks for the character slot)`, jump: { kind: 'mob', file: m.file, nodeId: node.id } });
      }
      for (const opt of node.options || []) {
        for (const g of opt.grants || []) {
          if (g.kind === 'teach_skill' && g.skill === name) {
            sources.push({ label: `${m.raw.name} · teaches via node "${node.id}"${g.requiredLevel ? `, level ${g.requiredLevel}+` : ''}`, jump: { kind: 'mob', file: m.file, nodeId: node.id } });
          }
        }
      }
    }
  }

  for (const r of recipes) {
    const ings = (r.raw.ingredients || []).map((i) => `${i.skill} ${i.level}`).join(' + ');
    if (r.raw.result === name) {
      sources.push({ label: `Recipe #${r.raw.id} · combination of ${ings || '(no ingredients)'}`, jump: { kind: 'recipe', file: r.file } });
    }
    for (const i of r.raw.ingredients || []) {
      if (i.skill === name) {
        refs.push({ label: `Recipe #${r.raw.id} · ingredient at level ${i.level} for ${r.raw.result || '(no result)'}`, jump: { kind: 'recipe', file: r.file } });
      }
    }
  }

  return { sources, refs };
}
