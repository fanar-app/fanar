package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"fanar-app/internal/server"
	"fanar-app/internal/store"
)

type App struct {
	ctx    atomic.Pointer[context.Context]
	store  *store.Store
	server *server.Server
	port   atomic.Int32
	ssh    sshManager
}

func NewApp(s *store.Store, srv *server.Server, port int) *App {
	a := &App{store: s, server: srv}
	a.port.Store(int32(port))
	return a
}

func (a *App) startup(ctx context.Context) {
	a.ctx.Store(&ctx)
	a.server.SetContext(ctx)
}

func (a *App) GetPayloads() []store.Payload {
	payloads, err := a.store.List()
	if err != nil {
		log.Printf("[fanar] store.List: %v", err)
	}
	return payloads
}

func (a *App) ClearPayloads() {
	if err := a.store.Clear(); err != nil {
		log.Printf("[fanar] store.Clear: %v", err)
	}
}

func (a *App) GetPort() int {
	return int(a.port.Load())
}

func (a *App) Show() {
	if ctx := a.ctx.Load(); ctx != nil {
		runtime.WindowShow(*ctx)
	}
}

// badPorts mirrors the WHATWG Fetch spec blocklist — browsers and Node.js fetch reject these.
var badPorts = map[int]bool{
	1: true, 7: true, 9: true, 11: true, 13: true, 15: true, 17: true, 19: true,
	20: true, 21: true, 22: true, 23: true, 25: true, 37: true, 42: true, 43: true,
	53: true, 69: true, 77: true, 79: true, 87: true, 95: true, 101: true, 102: true,
	103: true, 104: true, 109: true, 110: true, 111: true, 119: true, 123: true,
	135: true, 137: true, 139: true, 143: true, 161: true, 179: true, 389: true,
	427: true, 444: true, 465: true, 512: true, 513: true, 514: true, 515: true,
	526: true, 530: true, 531: true, 532: true, 540: true, 548: true, 554: true,
	556: true, 563: true, 587: true, 601: true, 636: true, 989: true, 990: true,
	993: true, 995: true, 1719: true, 1720: true, 1723: true, 2049: true, 3659: true,
	4045: true, 5060: true, 5061: true, 6000: true, 6566: true, 6665: true, 6666: true,
	6667: true, 6668: true, 6669: true, 10080: true,
}

func (a *App) SetPort(port int) error {
	if port < 1 || port > 65535 {
		return fmt.Errorf("invalid port: %d", port)
	}
	if badPorts[port] {
		return fmt.Errorf("port %d is blocked by browsers and Node.js fetch (WHATWG bad port list)", port)
	}
	a.port.Store(int32(port))
	if err := a.store.SetPort(port); err != nil {
		log.Printf("[fanar] could not save port: %v", err)
	}
	a.DisconnectSSH()
	return nil
}

func (a *App) ExportJSON(data string) error {
	ctx := a.ctx.Load()
	if ctx == nil {
		return fmt.Errorf("app not ready")
	}
	path, err := runtime.SaveFileDialog(*ctx, runtime.SaveDialogOptions{
		DefaultFilename: fmt.Sprintf("fanar-%s.json", time.Now().Format("2006-01-02T15-04-05")),
		Filters:         []runtime.FileFilter{{DisplayName: "JSON", Pattern: "*.json"}},
	})
	if err != nil || path == "" {
		return err
	}
	return os.WriteFile(path, []byte(data), 0644)
}

func (a *App) Restart() {
	exe, err := os.Executable()
	if err != nil {
		log.Printf("[fanar] restart: %v", err)
		return
	}
	// Shut down the HTTP server so the new process can bind the port immediately.
	a.server.Shutdown()
	// Re-execs the inner binary directly. On macOS this bypasses the .app bundle
	// launcher, which is fine for a non-sandboxed tool.
	if err := exec.Command(exe, os.Args[1:]...).Start(); err != nil {
		log.Printf("[fanar] restart: %v", err)
		a.server.Start(int(a.port.Load())) // restore server if spawn failed
		return
	}
	a.store.Close() // flush before exit; defers are skipped by os.Exit
	os.Exit(0)
}
