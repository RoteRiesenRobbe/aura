package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/lang"
)

// plan-localization.md C3: the dialogue as keyed entries (conv.<id>, D20).
// Every node line, option, shown grant line and ambient line of every
// conversant; a string without an id, or an id used twice anywhere, is a
// finding (the boot refuses it). Ids come from tools/lang/tag-dialogue.mjs.

// loadStockPhrases reads api/lang/stock.json: phrase name → its exact English.
func loadStockPhrases(fsys fs.FS) (map[string]string, error) {
	raw, err := fs.ReadFile(fsys, "stock.json")
	if err != nil {
		return nil, fmt.Errorf("lang/stock.json: %w", err)
	}
	var doc map[string]string
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("lang/stock.json: %w", err)
	}
	delete(doc, "_comment")
	return doc, nil
}

func dialogueEntries(defs []*mobs.MobDefinition, stock map[string]string) ([]lang.Entry, []string) {
	var out []lang.Entry
	var findings []string
	byText := make(map[string]string, len(stock))
	for name, text := range stock {
		byText[text] = name
	}
	names := make([]string, 0, len(stock))
	for name := range stock {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		out = append(out, lang.Entry{Key: lang.StockPhrase(name), Text: stock[name],
			Description: fmt.Sprintf("Shared stock phrase %q, used by many conversations; every line whose English matches falls back to this German (§8).", name)})
	}

	seen := map[string]string{}
	add := func(mob, where, id, text, description string) {
		if strings.TrimSpace(text) == "" {
			return
		}
		if id == "" {
			findings = append(findings, fmt.Sprintf("lang mobs: %s %s has no id; run node tools/lang/tag-dialogue.mjs (D20)", mob, where))
			return
		}
		if prev, dup := seen[id]; dup {
			findings = append(findings, fmt.Sprintf("lang mobs: %s %s reuses id %q (also %s); ids are unique across all content (D20)", mob, where, id, prev))
			return
		}
		seen[id] = mob + " " + where
		out = append(out, lang.Entry{Key: lang.Conversation(id), Text: text, Description: description, Stock: byText[text]})
	}

	for _, d := range defs {
		in := d.Interaction
		if in == nil {
			continue
		}
		who := skillsDisplay(d.Name)
		for i, line := range in.Ambient {
			add(d.Name, fmt.Sprintf("ambient line %d", i), at(in.AmbientIDs, i), line,
				fmt.Sprintf("%s calls this out to a player walking past (speech bubble).", who))
		}
		for _, n := range in.Nodes {
			for i, line := range n.Lines {
				add(d.Name, fmt.Sprintf("node %q line %d", n.ID, i), at(n.LineIDs, i), line,
					fmt.Sprintf("%s speaks this in the conversation, node %q, line %d.", who, n.ID, i+1))
			}
			for oi := range n.Options {
				o := &n.Options[oi]
				add(d.Name, fmt.Sprintf("node %q option %d", n.ID, oi), o.ID, o.Text,
					fmt.Sprintf("A row the player picks when talking to %s (node %q), written as the player's own words.", who, n.ID))
				for gi := range o.Grants {
					g := &o.Grants[gi]
					// Only the lead grant of a quest bundle is ever spoken
					// (sys/interaction.go), so the rest are not extracted.
					if gi > 0 && o.Grants[0].Kind.IsQuestKind() {
						continue
					}
					add(d.Name, fmt.Sprintf("node %q option %d grant %d", n.ID, oi, gi), g.LineID, g.Line,
						fmt.Sprintf("%s answers this when the player picks %q (node %q).", who, o.Text, n.ID))
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

func skillsDisplay(name string) string {
	var b strings.Builder
	for i, r := range name {
		if i > 0 && r >= 'A' && r <= 'Z' {
			b.WriteRune(' ')
		}
		b.WriteRune(r)
	}
	return b.String()
}
