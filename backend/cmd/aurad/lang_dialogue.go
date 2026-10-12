package main

import (
	"fmt"
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/lang"
)

// plan-localization.md C3, C5a: the dialogue as keyed entries. Every node
// line, option, shown grant line and ambient line of every conversant carries
// its full key as its id (conv_<npc>_<slug>, or stock_<name> for a shared
// phrase, D27/D28), filled in by lang.EnglishFS as the file was read. A string
// without one is a finding; a slug used twice within one NPC surfaces as two
// strings on one key (langEntries). A shared phrase is one entry however many
// lines name it.

type dialogueEntry struct {
	lang.Entry
	where string
}

func dialogueEntries(defs []*mobs.MobDefinition) ([]dialogueEntry, []string) {
	var out []dialogueEntry
	var findings []string
	shared := map[string]bool{}

	add := func(mob, where, key, text string) {
		if strings.TrimSpace(text) == "" {
			return
		}
		if key == "" {
			findings = append(findings, fmt.Sprintf("lang mobs: %s %s has no id; run node tools/lang/extract-english.mjs (D27)", mob, where))
			return
		}
		if strings.HasPrefix(key, "stock_") {
			if shared[key] {
				return
			}
			shared[key] = true
		}
		out = append(out, dialogueEntry{lang.Entry{Key: key, Text: text}, fmt.Sprintf("mob %q %s", mob, where)})
	}

	for _, d := range defs {
		in := d.Interaction
		if in == nil {
			continue
		}
		for i, line := range in.Ambient {
			add(d.Name, fmt.Sprintf("ambient line %d", i), at(in.AmbientIDs, i), line)
		}
		for _, n := range in.Nodes {
			for i, line := range n.Lines {
				add(d.Name, fmt.Sprintf("node %q line %d", n.ID, i), at(n.LineIDs, i), line)
			}
			for oi := range n.Options {
				o := &n.Options[oi]
				add(d.Name, fmt.Sprintf("node %q option %d", n.ID, oi), o.ID, o.Text)
				for gi := range o.Grants {
					g := &o.Grants[gi]
					// Only the lead grant of a quest bundle is ever spoken
					// (sys/interaction.go); the rest carry no line.
					if gi > 0 && o.Grants[0].Kind.IsQuestKind() {
						continue
					}
					add(d.Name, fmt.Sprintf("node %q option %d grant %d", n.ID, oi, gi), g.LineID, g.Line)
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
