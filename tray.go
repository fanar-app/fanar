//go:build !linux

package main

import (
	"os"

	"github.com/energye/systray"
)

func shouldPreventClose() bool { return true }

func runTray(app *App) {
	systray.Run(func() {
		systray.SetTitle("⬢ Fanar")
		systray.SetTooltip("Fanar — Universal Debug Receiver")

		mOpen := systray.AddMenuItem("Open Fanar", "Show the Fanar window")
		systray.AddSeparator()
		mQuit := systray.AddMenuItem("Quit Fanar", "")

		mOpen.Click(func() { app.Show() })
		mQuit.Click(func() {
			systray.Quit()
			os.Exit(0)
		})
	}, nil)
}
