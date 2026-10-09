package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"path"
	"sort"
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/lang"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// plan-localization.md C1: the content text, extracted from the loaded
// registries into per-domain entries. The SAME extraction feeds the generated
// English source files (D19, api/lang/en/<domain>.arb, pinned by
// lang_content_test.go) and the /lang bundle served at boot, so the two can
// never disagree about a key.

// langDomains is every content domain, in file order. "bundle" marks the
// domains the /lang endpoint serves as a flat key → text map (D6 item 2): the
// text no catalog carries.
var langDomains = []struct {
	name   string
	bundle bool
}{
	{"quests", false},
	{"mobs", true}, // names ride /mobs; the dialogue (C3) rides /lang
	{"skills", false},
	{"regions", true},
}

// langEntries extracts every domain's entries. Findings name authored text
// that would not survive as ICU (L14), by domain and key.
func langEntries(c loadedContent, zoneNames map[string]string, stock map[string]string) (map[string][]lang.Entry, []string) {
	out := map[string][]lang.Entry{}
	var findings []string
	add := func(domain string, e lang.Entry, allowed ...string) {
		if err := lang.CheckAuthoredText(e.Text, allowed...); err != nil {
			findings = append(findings, fmt.Sprintf("lang %s: %s: %v", domain, e.Key, err))
			return
		}
		out[domain] = append(out[domain], e)
	}

	if c.quests != nil {
		for _, q := range c.quests.All() {
			add("quests", lang.Entry{Key: lang.QuestTitle(q.ID), Text: q.Title,
				Description: fmt.Sprintf("Quest title of %q, shown in the journal list and the tracker.", q.ID)})
			for _, s := range q.Stages {
				if s.Journal != "" {
					add("quests", lang.Entry{Key: lang.QuestJournal(q.ID, s.ID), Text: s.Journal,
						Description: fmt.Sprintf("Journal (diary) entry of quest %q, stage %q: written in the player's voice, first person.", q.ID, s.ID)})
				}
				if s.Tracker != "" {
					add("quests", trackerEntry(lang.QuestStageTracker(q.ID, s.ID), s.Tracker,
						fmt.Sprintf("Tracker line of quest %q, stage %q: the one objective line shown under the quest title.", q.ID, s.ID)), "n", "m")
				}
				for _, o := range s.Objectives {
					// Q2 (PO 2026-10-07): every objective line must be grammatical
					// in every language. talk_to and reach need an article or a
					// preposition no template can build from a name, so they author
					// their own tracker unless the stage's tracker replaces every
					// line; a kill/harvest line is worded from the mob's name +
					// namePlural, so the mob must author its plural.
					if (o.Kind == quests.ObjectiveTalkTo || o.Kind == quests.ObjectiveReach) && o.Tracker == "" && s.Tracker == "" {
						findings = append(findings, fmt.Sprintf("lang quests: quest %q stage %q: a %s objective (%s) needs its own "+
							"tracker, e.g. %q (plan-localization.md Q2)", q.ID, s.ID, o.Kind, o.TargetName, "Talk to "+o.TargetName))
					}
					if (o.Kind == quests.ObjectiveKill || o.Kind == quests.ObjectiveHarvest) && c.mobs != nil {
						if def, err := c.mobs.Get(o.Target); err == nil && def.NamePlural == "" {
							findings = append(findings, fmt.Sprintf("lang quests: quest %q stage %q: %s objective names %s, "+
								"which authors no namePlural (plan-localization.md Q2)", q.ID, s.ID, o.Kind, def.Name))
						}
					}
					if o.Tracker == "" {
						continue
					}
					add("quests", trackerEntry(lang.QuestObjectiveTracker(q.ID, s.ID, o.Kind.String(), quests.ObjectiveTargetKey(&o)), o.Tracker,
						fmt.Sprintf("Tracker line of one %s objective (%s) in quest %q, stage %q. Write the whole line: articles, case and prepositions belong here (L8).", o.Kind.String(), o.TargetName, q.ID, s.ID)), "n", "m")
				}
			}
		}
	}

	if c.mobs != nil {
		mobDefs := c.mobs.Mobs()
		sort.Slice(mobDefs, func(i, j int) bool { return mobDefs[i].Name < mobDefs[j].Name })
		for _, d := range mobDefs {
			add("mobs", lang.Entry{Key: lang.MobName(d.Name), Text: skills.DeriveDisplayName(d.Name),
				Description: fmt.Sprintf("Name of the %s (nameplate, conversation header, quest lines). Singular, nominative; never inflected by a template (D9/L8).", d.Name)})
			if d.NamePlural != "" {
				add("mobs", lang.Entry{Key: lang.MobNamePlural(d.Name), Text: d.NamePlural,
					Description: fmt.Sprintf("Plural name of the %s, used by kill/harvest objective lines (Q2): \"3/8 <plural> slain\". Nominative plural.", d.Name)})
			}
		}
	}

	if c.mobs != nil {
		mobDefs := c.mobs.Mobs()
		sort.Slice(mobDefs, func(i, j int) bool { return mobDefs[i].Name < mobDefs[j].Name })
		dialogue, dialogueFindings := dialogueEntries(mobDefs, stock)
		findings = append(findings, dialogueFindings...)
		for _, e := range dialogue {
			add("mobs", e)
		}
	}

	if c.skills != nil {
		skillDefs := c.skills.All()
		sort.Slice(skillDefs, func(i, j int) bool { return skillDefs[i].Name < skillDefs[j].Name })
		for _, s := range skillDefs {
			add("skills", lang.Entry{Key: lang.SkillName(s.Name), Text: s.Display(),
				Description: fmt.Sprintf("Name of the skill %s: spellbook, ability bar, tooltip title, unlock banner.", s.Name)})
			if s.Description != "" {
				add("skills", lang.Entry{Key: lang.SkillDescription(s.Name), Text: s.Description,
					Description: fmt.Sprintf("Tooltip prose block of the skill %s.", s.Name)})
			}
		}
	}

	for _, r := range c.regions {
		add("regions", lang.Entry{Key: lang.RegionTitle(r.ID), Text: r.Title,
			Description: fmt.Sprintf("Region banner title of the place %q. Descriptive names translate, coined ones stay (style guide §4).", r.ID)})
		if r.Subtitle != "" {
			add("regions", lang.Entry{Key: lang.RegionSubtitle(r.ID), Text: r.Subtitle,
				Description: fmt.Sprintf("Region banner subtitle under %q.", r.Title)})
		}
	}
	stems := make([]string, 0, len(zoneNames))
	for stem := range zoneNames {
		stems = append(stems, stem)
	}
	sort.Strings(stems)
	for _, stem := range stems {
		add("regions", lang.Entry{Key: lang.ZoneName(stem), Text: zoneNames[stem],
			Description: fmt.Sprintf("Name of the zone %q, shown on the crossing curtain when no region names the arrival point.", stem)})
	}
	return out, findings
}

func trackerEntry(key, text, description string) lang.Entry {
	var ph []lang.Placeholder
	if strings.Contains(text, "{n}") {
		ph = append(ph, lang.Placeholder{Name: "n", Type: "int", Description: "Count done so far", Example: "3"})
	}
	if strings.Contains(text, "{m}") {
		ph = append(ph, lang.Placeholder{Name: "m", Type: "int", Description: "Count required", Example: "8"})
	}
	return lang.Entry{Key: key, Text: lang.NumberPlaceholders(text, "n", "m"), Description: description, Placeholders: ph}
}

// zoneNamesFrom reads each top-level zone file's display name, keyed by its
// file stem (the client's zone identity, ActiveZone.ts).
func zoneNamesFrom(zones fs.FS) (map[string]string, error) {
	out := map[string]string{}
	files, err := fs.Glob(zones, "*.json")
	if err != nil {
		return nil, err
	}
	for _, f := range files {
		raw, err := fs.ReadFile(zones, f)
		if err != nil {
			return nil, err
		}
		var head struct {
			Name string `json:"name"`
		}
		if err := json.Unmarshal(raw, &head); err != nil {
			return nil, fmt.Errorf("zones/%s: %w", f, err)
		}
		if head.Name != "" {
			out[strings.TrimSuffix(path.Base(f), ".json")] = head.Name
		}
	}
	return out, nil
}

// langBundleHandler serves /lang (D6 item 2): the bundle domains' text as one
// flat key → text map per locale, marshaled once per locale at boot.
func langBundleHandler(b *lang.Bundle, entries map[string][]lang.Entry) (http.Handler, error) {
	return lang.Handler(b, func(tr lang.Tr) ([]byte, error) {
		flat := map[string]string{}
		for _, d := range langDomains {
			if !d.bundle {
				continue
			}
			for _, e := range entries[d.name] {
				if strings.HasPrefix(e.Key, "mob.") {
					continue // names ride /mobs
				}
				flat[e.Key] = tr(e.Key, e.Text)
			}
		}
		return json.Marshal(flat)
	})
}
