all: build

.PHONY: build build.frontend build.backend all

build: build.frontend build.backend

build.backend:
	$(MAKE) -C backend build

build.frontend:
	$(MAKE) -C frontend build
