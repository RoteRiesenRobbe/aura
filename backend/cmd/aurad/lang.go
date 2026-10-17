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
)

// plan-localization.md C1, C5a: every translatable content string as a keyed
// entry, read off the loaded registries (whose text came from api/lang/en/,
// D27). The entries feed the /lang bundle and the completeness test, so the
// two can never disagree about a key.

// langDomains is every content domain, in file order. "bundle" marks the
// domains the /lang endpoint serves as a flat key → text map (D6 item 2): the
// text no catalog carries.
var langDomains = []struct {
	name   string
	bundle bool
}{
	{"quests", false},
	{"mobs", false}, // the names ride /mobs
	// The NPC dialogue and the shared phrases (C3, D28): split out of mobs
	// 2026-10-15 (PO), one translator component of its own.
	{"conversations", true},
	{"skills", false},
	{"regions", true},
}

// langEntries reads every domain's entries. Findings name authored text that
// would not survive as ICU (L14), two strings sharing one key, and the
// Q2 rules, by domain and key.
func langEntries(c loadedContent, zoneNames map[string]string) (map[string][]lang.Entry, []string) {
	out := map[string][]lang.Entry{}
	var findings []string
	seen := map[string]string{}
	addChecked := func(domain, where string, e lang.Entry, check func(string) error) {
		if prev, dup := seen[e.Key]; dup {
			findings = append(findings, fmt.Sprintf("lang %s: %s and %s both map to the key %s; rename one", domain, prev, where, e.Key))
			return
		}
		seen[e.Key] = where
		if err := check(e.Text); err != nil {
			findings = append(findings, fmt.Sprintf("lang %s: %s: %v", domain, e.Key, err))
			return
		}
		out[domain] = append(out[domain], e)
	}
	add := func(domain, where string, e lang.Entry, allowed ...string) {
		addChecked(domain, where, e, func(text string) error { return lang.CheckAuthoredText(text, allowed...) })
	}
	// A mob name may carry its plural forms as ICU (D24).
	addName := func(domain, where string, e lang.Entry) { addChecked(domain, where, e, lang.CheckMobName) }

	if c.quests != nil {
		for _, q := range c.quests.All() {
			add("quests", fmt.Sprintf("quest %q title", q.ID), lang.Entry{Key: lang.QuestTitle(q.ID), Text: q.Title})
			for _, s := range q.Stages {
				where := fmt.Sprintf("quest %q stage %q", q.ID, s.ID)
				if s.Journal != "" {
					add("quests", where+" journal", lang.Entry{Key: lang.QuestJournal(q.ID, s.ID), Text: s.Journal})
				}
				if s.Tracker != "" {
					add("quests", where+" tracker", trackerEntry(lang.QuestStageTracker(q.ID, s.ID), s.Tracker), "n", "m")
				}
				for _, o := range s.Objectives {
					// Q2 (PO 2026-10-07): every objective line must be grammatical
					// in every language. talk_to and reach need an article or a
					// preposition no template can build from a name, so they author
					// their own tracker unless the stage's tracker replaces every
					// line; a kill/harvest line counts the mob, so its name must
					// author its plural forms (D24).
					if (o.Kind == quests.ObjectiveTalkTo || o.Kind == quests.ObjectiveReach) && o.Tracker == "" && s.Tracker == "" {
						findings = append(findings, fmt.Sprintf("lang quests: quest %q stage %q: a %s objective (%s) needs its own "+
							"tracker, e.g. %q (plan-localization.md Q2)", q.ID, s.ID, o.Kind, o.TargetName, "Talk to "+o.TargetName))
					}
					if (o.Kind == quests.ObjectiveKill || o.Kind == quests.ObjectiveHarvest) && c.mobs != nil {
						if def, err := c.mobs.Get(o.Target); err == nil && !lang.HasPlural(def.NameMessage()) {
							findings = append(findings, fmt.Sprintf("lang quests: quest %q stage %q: %s objective counts %s, "+
								"whose name has no plural; write it as {count, plural, one {…} other {…}} in %s (plan-localization.md D24)",
								q.ID, s.ID, o.Kind, def.Name, lang.MobName(def.Name)))
						}
					}
					if o.Tracker == "" {
						continue
					}
					target := quests.ObjectiveTargetKey(&o)
					add("quests", fmt.Sprintf("%s %s objective %s tracker", where, o.Kind, target),
						trackerEntry(lang.QuestObjectiveTracker(q.ID, s.ID, o.Kind.String(), target), o.Tracker), "n", "m")
				}
			}
		}
	}

	if c.mobs != nil {
		mobDefs := c.mobs.Mobs()
		sort.Slice(mobDefs, func(i, j int) bool { return mobDefs[i].Name < mobDefs[j].Name })
		for _, d := range mobDefs {
			addName("mobs", fmt.Sprintf("mob %q name", d.Name), lang.Entry{Key: lang.MobName(d.Name), Text: d.NameMessage()})
		}
		dialogue, dialogueFindings := dialogueEntries(mobDefs)
		findings = append(findings, dialogueFindings...)
		for _, e := range dialogue {
			add("conversations", e.where, e.Entry, e.args...)
		}
	}

	if c.skills != nil {
		skillDefs := c.skills.All()
		sort.Slice(skillDefs, func(i, j int) bool { return skillDefs[i].Name < skillDefs[j].Name })
		for _, s := range skillDefs {
			add("skills", fmt.Sprintf("skill %q name", s.Name), lang.Entry{Key: lang.SkillName(s.Name), Text: s.Display()})
			if s.Description != "" {
				add("skills", fmt.Sprintf("skill %q description", s.Name), lang.Entry{Key: lang.SkillDescription(s.Name), Text: s.Description})
			}
		}
	}

	for _, r := range c.regions {
		add("regions", fmt.Sprintf("region %q title", r.ID), lang.Entry{Key: lang.RegionTitle(r.ID), Text: r.Title})
		if r.Subtitle != "" {
			add("regions", fmt.Sprintf("region %q subtitle", r.ID), lang.Entry{Key: lang.RegionSubtitle(r.ID), Text: r.Subtitle})
		}
	}
	stems := make([]string, 0, len(zoneNames))
	for stem := range zoneNames {
		stems = append(stems, stem)
	}
	sort.Strings(stems)
	for _, stem := range stems {
		add("regions", fmt.Sprintf("zone %q name", stem), lang.Entry{Key: lang.ZoneName(stem), Text: zoneNames[stem]})
	}
	// The words a door shows (plan-passages.md D6), all optional: an entry for
	// each one the English authors, for a placed exit or anchor. One for
	// anything else is an orphan (D7), the test's to refuse; a duplicate exit
	// id is the zone loader's (checkSetWide).
	english := c.langBundle.Overlay(lang.Source)
	optional := func(where, key string) {
		if text := english[key]; text != "" {
			add("regions", where, lang.Entry{Key: key, Text: text})
		}
	}
	for _, z := range c.zones {
		for _, a := range z.Anchors {
			optional(fmt.Sprintf("anchor %q text", a.Name), lang.AnchorText(a.Name))
		}
		for _, e := range z.Exits {
			if e.ID == "" {
				continue
			}
			optional(fmt.Sprintf("exit %q title", e.ID), lang.ExitTitle(e.ID))
			optional(fmt.Sprintf("exit %q text", e.ID), lang.ExitText(e.ID))
			optional(fmt.Sprintf("exit %q row", e.ID), lang.ExitGo(e.ID))
		}
	}
	return out, findings
}

func trackerEntry(key, text string) lang.Entry {
	return lang.Entry{Key: key, Text: lang.NumberPlaceholders(text, "n", "m")}
}

// zoneNamesFrom is each top-level zone's English display name, keyed by its
// file stem (the client's zone identity, ActiveZone.ts), from the English
// bundle (D27). The zone file's own `name` is a dev label only (the Tiled
// converter keeps writing it), so a shipped zone without English is a
// finding. The debug zone set (labelFallback) is a dev tool whose zones ship
// nowhere: it speaks its labels rather than owing English keys that would be
// orphans for the shipped set.
func zoneNamesFrom(zones fs.FS, english map[string]string, labelFallback bool) (map[string]string, []string, error) {
	files, err := fs.Glob(zones, "*.json")
	if err != nil {
		return nil, nil, err
	}
	out := map[string]string{}
	var findings []string
	for _, f := range files {
		stem := strings.TrimSuffix(path.Base(f), ".json")
		key := lang.ZoneName(stem)
		if text := english[key]; text != "" {
			out[stem] = text
		} else if labelFallback {
			raw, err := fs.ReadFile(zones, f)
			if err != nil {
				return nil, nil, err
			}
			var head struct {
				Name string `json:"name"`
			}
			if err := json.Unmarshal(raw, &head); err != nil {
				return nil, nil, fmt.Errorf("zones/%s: %w", f, err)
			}
			if head.Name != "" {
				out[stem] = head.Name
			}
		} else {
			findings = append(findings, fmt.Sprintf("lang regions: zone %q has no English name (%s in api/lang/en/regions.arb)", stem, key))
		}
	}
	return out, findings, nil
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
				flat[e.Key] = tr(e.Key, e.Text)
			}
		}
		return json.Marshal(flat)
	})
}
