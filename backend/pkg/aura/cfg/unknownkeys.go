package cfg

import (
	"encoding/json"
	"reflect"
	"sort"
	"strings"
)

// UnknownKeys reports the path-qualified keys in a raw conf that correspond to
// no cfg.Config field (§35 C2, D2). ReadConfig turns each into a boot warning
// rather than a hard fail — a deployed conf with a stale key must still boot,
// but drift toward dead config should be loud (the embedded default once
// carried 8 dead keys for years with no signal).
//
// Two deliberate exemptions: "_"-prefixed keys at any depth (the house
// _comment/_stash convention, L2), and case-insensitive field matches, which
// encoding/json accepts and applies — warning on those would cry wolf on keys
// that work.
func UnknownKeys(raw []byte) ([]string, error) {
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, err
	}
	var unknown []string
	walkUnknown(reflect.TypeOf(Config{}), m, "", &unknown)
	sort.Strings(unknown)
	return unknown, nil
}

func walkUnknown(t reflect.Type, m map[string]any, prefix string, out *[]string) {
	byTag := make(map[string]reflect.Type, t.NumField())
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		tag, _, _ := strings.Cut(f.Tag.Get("json"), ",")
		if tag == "-" {
			continue
		}
		if tag == "" {
			tag = f.Name
		}
		byTag[tag] = f.Type
	}
	match := func(key string) (reflect.Type, bool) {
		if ft, ok := byTag[key]; ok {
			return ft, true
		}
		for tag, ft := range byTag {
			if strings.EqualFold(tag, key) {
				return ft, true
			}
		}
		return nil, false
	}

	for key, val := range m {
		if strings.HasPrefix(key, "_") {
			continue
		}
		path := key
		if prefix != "" {
			path = prefix + "." + key
		}
		ft, ok := match(key)
		if !ok {
			*out = append(*out, path)
			continue
		}
		for ft.Kind() == reflect.Pointer {
			ft = ft.Elem()
		}
		if sub, isObject := val.(map[string]any); isObject && ft.Kind() == reflect.Struct {
			walkUnknown(ft, sub, path, out)
		}
	}
}
