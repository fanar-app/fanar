# webkit2_41 is required on Linux (Debian 12+/Ubuntu 22.04+); silently ignored on macOS/Windows
TAGS := webkit2_41

build:
	wails build -tags $(TAGS)

dev:
	wails dev -tags $(TAGS)

test:
	go test ./internal/...

.PHONY: build dev test
