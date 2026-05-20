package main

import (
	"fmt"
	"log"
	"os/exec"
	"regexp"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

var validSSHIdent = regexp.MustCompile(`^[a-zA-Z0-9._-]+$`)

type SSHState struct {
	Status string `json:"status"` // disconnected | connecting | connected | error
	User   string `json:"user"`
	Host   string `json:"host"`
	Port   int    `json:"port"`
	Error  string `json:"error"`
}

type sshManager struct {
	mu    sync.Mutex
	cmd   *exec.Cmd
	state SSHState
}

func (m *sshManager) get() SSHState {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.state
}

func (a *App) GetSSHState() SSHState {
	return a.ssh.get()
}

func (a *App) ConnectSSH(user, host string, remotePort int) error {
	if !validSSHIdent.MatchString(user) {
		return fmt.Errorf("invalid user: must be alphanumeric with . _ -")
	}
	if !validSSHIdent.MatchString(host) {
		return fmt.Errorf("invalid host")
	}

	a.ssh.mu.Lock()
	if a.ssh.cmd != nil {
		a.ssh.mu.Unlock()
		return fmt.Errorf("already connected")
	}
	localPort := int(a.port.Load())
	if remotePort <= 0 {
		remotePort = localPort
	}

	log.Printf("[fanar] ssh: connecting to %s@%s (new host keys will be auto-accepted)", user, host)
	cmd := exec.Command("ssh",
		"-N",
		"-o", "StrictHostKeyChecking=accept-new",
		"-o", "ExitOnForwardFailure=yes",
		"-o", "ServerAliveInterval=15",
		"-o", "ServerAliveCountMax=3",
		"-R", fmt.Sprintf("%d:localhost:%d", remotePort, localPort),
		fmt.Sprintf("%s@%s", user, host),
	)

	if err := cmd.Start(); err != nil {
		state := SSHState{Status: "error", User: user, Host: host, Port: remotePort, Error: err.Error()}
		a.ssh.state = state
		a.ssh.mu.Unlock()
		a.emitSSH(state)
		return err
	}

	a.ssh.cmd = cmd
	a.ssh.state = SSHState{Status: "connecting", User: user, Host: host, Port: remotePort}
	a.ssh.mu.Unlock()
	a.emitSSH(a.ssh.get())

	// Promote to "connected" after 1.5 s if the process is still alive.
	go func() {
		time.Sleep(1500 * time.Millisecond)
		a.ssh.mu.Lock()
		if a.ssh.cmd == cmd && a.ssh.state.Status == "connecting" {
			a.ssh.state.Status = "connected"
			s := a.ssh.state
			a.ssh.mu.Unlock()
			a.emitSSH(s)
		} else {
			a.ssh.mu.Unlock()
		}
	}()

	// Watch for process exit.
	go func() {
		err := cmd.Wait()
		a.ssh.mu.Lock()
		if a.ssh.cmd != cmd {
			a.ssh.mu.Unlock()
			return
		}
		a.ssh.cmd = nil
		var s SSHState
		if err != nil && a.ssh.state.Status != "disconnected" {
			s = SSHState{Status: "error", User: user, Host: host, Port: remotePort, Error: err.Error()}
		} else {
			s = SSHState{Status: "disconnected"}
		}
		a.ssh.state = s
		a.ssh.mu.Unlock()
		a.emitSSH(s)
	}()

	return nil
}

func (a *App) DisconnectSSH() {
	a.ssh.mu.Lock()
	cmd := a.ssh.cmd
	a.ssh.cmd = nil
	a.ssh.state = SSHState{Status: "disconnected"}
	a.ssh.mu.Unlock()

	if cmd != nil {
		_ = cmd.Process.Kill()
	}
	a.emitSSH(SSHState{Status: "disconnected"})
}

func (a *App) emitSSH(s SSHState) {
	if ctx := a.ctx.Load(); ctx != nil {
		runtime.EventsEmit(*ctx, "ssh:status", s)
	}
}
