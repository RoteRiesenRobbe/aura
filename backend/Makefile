

.PHONY: dev build gen fmt

build: aurad.build

gen:
	@go generate ./...

fmt:
	@gofumpt -l -w .

cp-defs:
	$(info "bundling mobs, skills and recipe definitions")
	@find ./pkg/api -type f -name '*.json' -delete
	@cp -rf ../api/mobs ../api/skills ../api/recipes ../api/zones ../api/props ../api/factions ../api/milestones ../api/quests ./pkg/api

%.build: gen cp-defs
	go build -o $* ./cmd/$*

dev: aurad.dev

%.dev: gen cp-defs
	go run ./cmd/$* -dev
