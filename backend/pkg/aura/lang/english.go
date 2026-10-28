package lang

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"strings"
	"sync"
)

// plan-localization.md C5a (D27): ENGLISH LIVES IN ARB. The authored content
// JSON keeps structure and ids; every translatable string is in
// api/lang/en/<domain>.arb under its key (D29). The loaders still read one
// JSON with its text in it: EnglishFS joins the two as a file is read, so no
// parser, validator or runtime reader changes, and a check on the text (a
// quest title is required, a tracker's {n}/{m} needs a count) still sees text
// (L24).
//
// It refuses, naming the file and key:
//   - inline English in a content file (the draft the extract tool moves out:
//     node tools/lang/extract-english.mjs);
//   - a required string with no English.
// Unit fixtures that build content in memory with inline text never pass
// through it, so their parsers keep accepting text as before.

// Domain names which content files a hydration reads.
type Domain int

const (
	DomainQuest Domain = iota
	DomainMob
	DomainSkill
	DomainRegions
	DomainAppearance
)

// countPlaceholders are the authored counts a tracker substitutes ({n}/{m}).
var countPlaceholders = []string{"n", "m"}

// Hydrate returns one content file with its English filled in from en.
// Unparsable JSON comes back unchanged, so its loader reports the syntax error
// with the right offset.
func Hydrate(domain Domain, data []byte, en map[string]string) ([]byte, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	var root any
	if err := dec.Decode(&root); err != nil {
		return data, nil
	}
	obj, ok := root.(map[string]any)
	if !ok {
		return data, nil
	}
	h := &hydrator{en: en}
	switch domain {
	case DomainQuest:
		h.quest(obj)
	case DomainMob:
		h.mob(obj)
	case DomainSkill:
		h.skill(obj)
	case DomainRegions:
		h.regions(obj)
	case DomainAppearance:
		h.text(obj, "name", AppearanceName(str(obj["id"])), fmt.Sprintf("appearance %q", str(obj["id"])), true)
	}
	if len(h.errs) > 0 {
		return nil, errors.Join(h.errs...)
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(root); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

type hydrator struct {
	en   map[string]string
	errs []error
}

func (h *hydrator) fail(format string, args ...any) {
	h.errs = append(h.errs, fmt.Errorf(format, args...))
}

// text fills obj[field] from key. Inline text is refused; a required key
// without English is refused; an optional one leaves the field absent.
func (h *hydrator) text(obj map[string]any, field, key, where string, required bool) {
	if _, inline := obj[field]; inline {
		h.fail("%s: inline English in %q; run node tools/lang/extract-english.mjs (plan-localization.md D27)", where, field)
		return
	}
	if s := h.en[key]; s != "" {
		obj[field] = s
	} else if required {
		h.fail("%s: no English for %s (api/lang/en)", where, key)
	}
}

func (h *hydrator) tracker(obj map[string]any, key, where string) {
	h.text(obj, "tracker", key, where, false)
	if s, ok := obj["tracker"].(string); ok {
		obj["tracker"] = PlainPlaceholders(s, countPlaceholders...)
	}
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

func objects(v any) []map[string]any {
	list, _ := v.([]any)
	out := make([]map[string]any, 0, len(list))
	for _, item := range list {
		if m, ok := item.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func (h *hydrator) quest(q map[string]any) {
	id := str(q["id"])
	where := fmt.Sprintf("quest %q", id)
	h.text(q, "title", QuestTitle(id), where, true)
	for _, s := range objects(q["stages"]) {
		sid := str(s["id"])
		stageWhere := fmt.Sprintf("quest %q stage %q", id, sid)
		h.text(s, "journal", QuestJournal(id, sid), stageWhere, true)
		h.tracker(s, QuestStageTracker(id, sid), stageWhere)
		for _, o := range objects(s["objectives"]) {
			kind := str(o["kind"])
			target := str(o["region"]) + str(o["species"]) + str(o["npc"])
			h.tracker(o, QuestObjectiveTracker(id, sid, kind, target), fmt.Sprintf("%s %s objective %s", stageWhere, kind, target))
		}
	}
}

// questGrantKinds lead a bundle whose other grants are never spoken (C3).
var questGrantKinds = map[string]bool{"offer_quest": true, "advance_quest": true}

func (h *hydrator) mob(m map[string]any) {
	npc := str(m["name"])
	where := fmt.Sprintf("mob %q", npc)
	h.text(m, "displayName", MobName(npc), where, true)
	inter, ok := m["interaction"].(map[string]any)
	if !ok {
		return
	}
	h.lines(inter, "ambient", npc, where+" ambient")
	for _, n := range objects(inter["nodes"]) {
		nodeWhere := fmt.Sprintf("%s node %q", where, str(n["id"]))
		h.lines(n, "lines", npc, nodeWhere)
		for oi, o := range objects(n["options"]) {
			optWhere := fmt.Sprintf("%s option %d", nodeWhere, oi)
			h.ref(o, "text", npc, optWhere)
			grants := objects(o["grants"])
			bundle := len(grants) > 0 && questGrantKinds[str(grants[0]["kind"])]
			for gi, g := range grants {
				if bundle && gi > 0 {
					if _, inline := g["line"]; inline {
						h.fail("%s grant %d: a bundle's follower grant is never spoken; drop its line", optWhere, gi)
					}
					continue
				}
				h.ref(g, "line", npc, fmt.Sprintf("%s grant %d", optWhere, gi))
			}
		}
	}
}

// lines turns each {"id": slug} or {"stock": name} into {"id": key, "text": English},
// keeping a gated line's conditions and conditionsMode.
func (h *hydrator) lines(obj map[string]any, field, npc, where string) {
	list, ok := obj[field].([]any)
	if !ok {
		return
	}
	for i, item := range list {
		line, ok := item.(map[string]any)
		if _, inline := line["text"]; !ok || inline {
			h.fail("%s line %d: inline English; run node tools/lang/extract-english.mjs (plan-localization.md D27)", where, i)
			continue
		}
		key, ok := h.refKey(line, npc, fmt.Sprintf("%s line %d", where, i))
		if !ok {
			continue
		}
		text := h.en[key]
		if text == "" {
			h.fail("%s line %d: no English for %s (api/lang/en)", where, i, key)
			continue
		}
		hydratedLine := map[string]any{"id": key, "text": text}
		for _, gateKey := range []string{"conditions", "conditionsMode"} {
			if v, ok := line[gateKey]; ok {
				hydratedLine[gateKey] = v
			}
		}
		list[i] = hydratedLine
	}
}

// ref fills an option's text or a grant's line from its id or shared phrase;
// an item with neither has no authored text.
func (h *hydrator) ref(obj map[string]any, field, npc, where string) {
	if _, inline := obj[field]; inline {
		h.fail("%s: inline English in %q; run node tools/lang/extract-english.mjs (plan-localization.md D27)", where, field)
		return
	}
	key, ok := h.refKey(obj, npc, where)
	if !ok {
		return
	}
	text := h.en[key]
	if text == "" {
		h.fail("%s: no English for %s (api/lang/en)", where, key)
		return
	}
	obj["id"] = key
	obj[field] = text
}

// refKey is the key a dialogue item names: its own line (conv.<npc>.<slug>)
// or a shared phrase (stock.<name>, D28). The stock reference is consumed: the
// loader sees the key as the item's id (the wire carries it, D27).
func (h *hydrator) refKey(obj map[string]any, npc, where string) (string, bool) {
	id, stock := str(obj["id"]), str(obj["stock"])
	switch {
	case id != "" && stock != "":
		h.fail("%s: names both an id and a shared phrase", where)
		return "", false
	case stock != "":
		delete(obj, "stock")
		return StockPhrase(stock), true
	case id != "":
		return Conversation(npc, id), true
	}
	return "", false
}

func (h *hydrator) skill(s map[string]any) {
	name := str(s["name"])
	where := fmt.Sprintf("skill %q", name)
	h.text(s, "displayName", SkillName(name), where, true)
	h.text(s, "description", SkillDescription(name), where, false)
}

func (h *hydrator) regions(doc map[string]any) {
	for _, r := range objects(doc["regions"]) {
		id := str(r["id"])
		where := fmt.Sprintf("region %q", id)
		h.text(r, "title", RegionTitle(id), where, true)
		h.text(r, "subtitle", RegionSubtitle(id), where, false)
	}
}

// PlainPlaceholders turns `{n, number}` back into the authored `{n}` (the
// reverse of NumberPlaceholders).
func PlainPlaceholders(text string, names ...string) string {
	for _, n := range names {
		text = strings.ReplaceAll(text, "{"+n+", number}", "{"+n+"}")
	}
	return text
}

// ---------------------------------------------------------------- the FS seam

// EnglishFrom loads every en/*.arb of the lang tree once, on first use.
func EnglishFrom(langFS fs.FS) func() (map[string]string, error) {
	var once sync.Once
	var en map[string]string
	var err error
	return func() (map[string]string, error) {
		once.Do(func() {
			en = map[string]string{}
			var files []string
			if files, err = fs.Glob(langFS, path.Join(Source, "*.arb")); err != nil {
				return
			}
			for _, f := range files {
				var messages map[string]string
				if messages, err = ReadARB(langFS, f); err != nil {
					return
				}
				for k, v := range messages {
					en[k] = v
				}
			}
		})
		return en, err
	}
}

// EnglishFS reads content like fsys, with every .json file hydrated (D27).
// Only DomainRegions' regions.json is a regions file; every other domain
// hydrates every .json it holds.
func EnglishFS(fsys fs.FS, domain Domain, english func() (map[string]string, error)) fs.FS {
	return englishFS{fsys: fsys, domain: domain, english: english}
}

type englishFS struct {
	fsys    fs.FS
	domain  Domain
	english func() (map[string]string, error)
}

func (e englishFS) hydrates(name string) bool {
	if path.Ext(name) != ".json" {
		return false
	}
	return e.domain != DomainRegions || path.Base(name) == "regions.json"
}

func (e englishFS) ReadFile(name string) ([]byte, error) {
	data, err := fs.ReadFile(e.fsys, name)
	if err != nil || !e.hydrates(name) {
		return data, err
	}
	en, err := e.english()
	if err != nil {
		return nil, &fs.PathError{Op: "read", Path: name, Err: err}
	}
	out, err := Hydrate(e.domain, data, en)
	if err != nil {
		return nil, &fs.PathError{Op: "read", Path: name, Err: err}
	}
	return out, nil
}

func (e englishFS) ReadDir(name string) ([]fs.DirEntry, error) { return fs.ReadDir(e.fsys, name) }

func (e englishFS) Open(name string) (fs.File, error) {
	f, err := e.fsys.Open(name)
	if err != nil || !e.hydrates(name) {
		return f, err
	}
	info, err := f.Stat()
	f.Close()
	if err != nil {
		return nil, err
	}
	if info.IsDir() {
		return e.fsys.Open(name)
	}
	data, err := e.ReadFile(name)
	if err != nil {
		return nil, err
	}
	return &memFile{Reader: bytes.NewReader(data), info: memInfo{info, int64(len(data))}}, nil
}

type memFile struct {
	*bytes.Reader
	info memInfo
}

func (m *memFile) Stat() (fs.FileInfo, error) { return m.info, nil }
func (m *memFile) Close() error               { return nil }

type memInfo struct {
	fs.FileInfo
	size int64
}

func (i memInfo) Size() int64 { return i.size }
