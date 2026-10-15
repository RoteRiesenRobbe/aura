package main

import (
	"fmt"
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/lang"
)

// plan-localization.md C3, C5a: the dialogue as keyed entries. Every node
// line, option, shown grant line and ambient line of every conversant carries
// its full key as its id (conv.<npc>.<slug>, or stock.<name> for a shared
// phrase, D27/D28), filled in by lang.EnglishFS as the file was read. A string
// without one is a finding; a slug used twice within one NPC surfaces as two
// strings on one key (langEntries). A shared phrase is one entry however many
// lines name it.

type dialogueEntry struct {
	lang.Entry
	where string
	// args are the placeholders the text may carry: {skill} on a teach line.
	args []string
}

func dialogueEntries(defs []*mobs.MobDefinition) ([]dialogueEntry, []string) {
	var out []dialogueEntry
	var findings []string
	shared := map[string]bool{}

	// teach marks a teach_skill grant's line, the one place {skill} is filled in
	// (stock.teach-skill, 2026-10-15).
	add := func(mob, where, key, text string, teach bool) {
		if strings.TrimSpace(text) == "" {
			return
		}
		var args []string
		if strings.Contains(text, "{"+lang.SkillArg+"}") {
			if !teach {
				findings = append(findings, fmt.Sprintf("lang conversations: %s %s: only a teach_skill grant's line can name {%s}", mob, where, lang.SkillArg))
				return
			}
			args = []string{lang.SkillArg}
		}
		if key == "" {
			findings = append(findings, fmt.Sprintf("lang conversations: %s %s has no id; run node tools/lang/extract-english.mjs (D27)", mob, where))
			return
		}
		if strings.HasPrefix(key, lang.StockPrefix) {
			if shared[key] {
				return
			}
			shared[key] = true
		}
		out = append(out, dialogueEntry{lang.Entry{Key: key, Text: text}, fmt.Sprintf("mob %q %s", mob, where), args})
	}

	for _, d := range defs {
		in := d.Interaction
		if in == nil {
			continue
		}
		for i, line := range in.Ambient {
			add(d.Name, fmt.Sprintf("ambient line %d", i), at(in.AmbientIDs, i), line, false)
		}
		for _, n := range in.Nodes {
			for i, line := range n.Lines {
				add(d.Name, fmt.Sprintf("node %q line %d", n.ID, i), at(n.LineIDs, i), line, false)
			}
			for oi := range n.Options {
				o := &n.Options[oi]
				add(d.Name, fmt.Sprintf("node %q option %d", n.ID, oi), o.ID, o.Text, false)
				for gi := range o.Grants {
					g := &o.Grants[gi]
					// Only the lead grant of a quest bundle is ever spoken
					// (sys/interaction.go); the rest carry no line.
					if gi > 0 && o.Grants[0].Kind.IsQuestKind() {
						continue
					}
					add(d.Name, fmt.Sprintf("node %q option %d grant %d", n.ID, oi, gi), g.LineID, g.Line, g.Kind == mobs.GrantTeachSkill)
				}
			}
		}
	}
	return out, findings
}

func at(ids []string, i int) string {
	if i < len(ids) {
		return ids[i]
	}
	return ""
}
