

.PHONY: dev build gen fmt db-up db-down db-shell db-test db-reset

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

# ---------------------------------------------------------------------------
# Local development database (Docker)
#
# Two databases live on one server, and the split is not cosmetic:
#   aura       durable dev data — your characters survive here
#   aura_test  DISPOSABLE — every DB test calls store.Rollback(), which drops
#              the whole `game` schema. Never point AURA_TEST_DB_URL at `aura`.
# ---------------------------------------------------------------------------
DB_CONTAINER := aura-dev-db
DB_VOLUME    := aura-dev-pgdata
DB_IMAGE     := postgres:16-alpine
AURA_DB_URL      ?= postgres://aura:aura@127.0.0.1:5432/aura?sslmode=disable
AURA_TEST_DB_URL ?= postgres://aura:aura@127.0.0.1:5432/aura_test?sslmode=disable

db-up:
	@docker start $(DB_CONTAINER) 2>/dev/null || \
	  docker run -d --name $(DB_CONTAINER) --restart unless-stopped \
	    -e POSTGRES_USER=aura -e POSTGRES_PASSWORD=aura -e POSTGRES_DB=aura \
	    -p 5432:5432 -v $(DB_VOLUME):/var/lib/postgresql/data $(DB_IMAGE)
	@printf 'waiting for postgres'; \
	 for i in $$(seq 1 30); do \
	   docker exec $(DB_CONTAINER) pg_isready -U aura -d aura >/dev/null 2>&1 && break; \
	   printf '.'; sleep 1; \
	 done; echo
	@docker exec $(DB_CONTAINER) psql -U aura -d postgres -tAc \
	  "SELECT 1 FROM pg_database WHERE datname='aura_test'" | grep -q 1 || \
	  docker exec $(DB_CONTAINER) psql -U aura -d postgres -c "CREATE DATABASE aura_test OWNER aura"
	@echo "ready — export AURA_DB_URL='$(AURA_DB_URL)'"

db-down:
	@docker stop $(DB_CONTAINER)

db-shell:
	@docker exec -it $(DB_CONTAINER) psql -U aura -d aura

# Run the DB-touching suites against the disposable database.
db-test: db-up
	@AURA_TEST_DB_URL="$(AURA_TEST_DB_URL)" go test -timeout 120s ./pkg/aura/store/... ./pkg/aura/accounts/...

# Wipe ONLY the disposable test database. Dev data in `aura` is untouched.
db-reset: db-up
	@docker exec $(DB_CONTAINER) psql -U aura -d postgres -c "DROP DATABASE IF EXISTS aura_test"
	@docker exec $(DB_CONTAINER) psql -U aura -d postgres -c "CREATE DATABASE aura_test OWNER aura"
	@echo "aura_test recreated empty"
