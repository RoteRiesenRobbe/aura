.PHONY: build dev

# The PONETI icon pack lives outside the repo (README "Icons (PONETI pack)"),
# so the container only sees it when AURA_ICON_PACK_DIR is set on the host:
# it is then mounted read-only and the packer inside reads it from /icon-pack.
# Unset, the build proceeds without pack icons, like on any other machine.
ICON_PACK_ARGS := $(if $(AURA_ICON_PACK_DIR),-v "$(AURA_ICON_PACK_DIR):/icon-pack:ro" -e AURA_ICON_PACK_DIR=/icon-pack,)

dev:
	docker run -it -p 2001:2001 -v "$(shell pwd)/../:/build" $(ICON_PACK_ARGS) --entrypoint bash --rm node:20  -c "cd /build/frontend && npm install && npm run start -- --env port=2001"

# run the build with `node` from a Dockerimage, it breaks way too often
build:
	docker run -it -v "$(shell pwd)/../:/build" $(ICON_PACK_ARGS) --entrypoint bash --rm node:20  -c "cd /build/frontend && npm install && npm run build"
