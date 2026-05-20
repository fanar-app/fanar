//go:build linux

package main

func shouldPreventClose() bool { return false }

func runTray(_ *App) {}
