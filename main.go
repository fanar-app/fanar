package main

import (
	"context"
	"embed"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"fanar-app/internal/server"
	"fanar-app/internal/store"
)

//go:embed all:frontend
var rawAssets embed.FS

func main() {
	assets, err := fs.Sub(rawAssets, "frontend")
	if err != nil {
		log.Fatal(err)
	}

	dataDir, err := os.UserConfigDir()
	if err != nil {
		log.Fatal(err)
	}
	dbDir := filepath.Join(dataDir, "fanar")
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		log.Fatal(err)
	}

	s, err := store.New(filepath.Join(dbDir, "fanar.db"))
	if err != nil {
		log.Fatal(err)
	}
	defer s.Close()

	port := s.GetPort()
	if p, err := strconv.Atoi(strings.TrimSpace(os.Getenv("FANAR_PORT"))); err == nil && p > 0 {
		port = p
	}

	srv := server.New(s)
	srv.Start(port)

	app := NewApp(s, srv, port)

	go runTray(app)

	if err := wails.Run(&options.App{
		Title:            "Fanar",
		Width:            1200,
		Height:           800,
		MinWidth:         800,
		MinHeight:        500,
		BackgroundColour: &options.RGBA{R: 17, G: 17, B: 17, A: 255},
		AssetServer:      &assetserver.Options{Assets: assets},
		OnStartup:        app.startup,
		Bind:          []any{app},
		OnBeforeClose: func(ctx context.Context) (prevent bool) {
			if shouldPreventClose() {
				runtime.WindowHide(ctx)
				return true
			}
			return false
		},
	}); err != nil {
		log.Fatal(err)
	}
}
