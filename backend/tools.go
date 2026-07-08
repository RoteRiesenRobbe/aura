//go:build tools

// Package tools anchors build-time tool dependencies in go.mod so that
// `go generate ./...` (which invokes them via `go run`) keeps working
// after `go mod tidy`. Never compiled (tools build tag).
package tools

import (
	_ "github.com/dmarkham/enumer"
)
