

.PHONY: dev build gen fmt

build: berryhunterd.build

gen:
	@go generate ./...

fmt:
	@gofumpt -l -w .

cp-defs:
	$(info "bundling items, mobs and skills definitions")
	@find ./pkg/api -type f -name '*.json' -delete
	@cp -rf ../api/items ../api/mobs ../api/skills ./pkg/api

%.build: gen cp-defs
	go build -o $* ./cmd/$*

dev: berryhunterd.dev

%.dev: gen cp-defs
	go run ./cmd/$* -dev
