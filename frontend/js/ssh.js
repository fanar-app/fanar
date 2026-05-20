const SSH = {
  btn: null,
  dot: null,
  status: 'disconnected',

  init() {
    this.btn = document.getElementById('ssh-btn')
    this.dot = document.getElementById('ssh-dot')

    // Topbar button: opens prefs modal to SSH tab
    this.btn.addEventListener('click', () => {
      if (typeof openPrefs === 'function') openPrefs('ssh')
    })

    document.getElementById('ssh-user').addEventListener('input', () => this._updateCommand())
    document.getElementById('ssh-host').addEventListener('input', () => this._updateCommand())
    document.getElementById('ssh-remote-port').addEventListener('input', () => this._updateCommand())

    document.getElementById('ssh-copy-btn').addEventListener('click', () => {
      const text = document.getElementById('ssh-command-text').textContent
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('ssh-copy-btn')
        btn.classList.add('copied')
        setTimeout(() => btn.classList.remove('copied'), 1500)
      })
    })

    document.getElementById('ssh-connect-btn').addEventListener('click', () => {
      if (this.status === 'connected' || this.status === 'connecting') {
        this.disconnect()
      } else {
        this.connect()
      }
    })

    // Restore saved credentials
    const savedUser = localStorage.getItem('fanar.ssh.user')
    const savedHost = localStorage.getItem('fanar.ssh.host')
    if (savedUser) document.getElementById('ssh-user').value = savedUser
    if (savedHost) document.getElementById('ssh-host').value = savedHost
    this._updateCommand()

    if (window.go) {
      window.go.main.App.GetSSHState().then(s => this.applyState(s)).catch(() => {})
    }

    if (window.runtime) {
      window.runtime.EventsOn('ssh:status', s => this.applyState(s))
    }

    this._updateBtnVisibility()
  },

  _updateCommand() {
    const u = document.getElementById('ssh-user').value || 'user'
    const h = document.getElementById('ssh-host').value || 'myserver.com'
    const p = parseInt(document.getElementById('ssh-remote-port').value) || (window._fanarPort || 23517)
    document.getElementById('ssh-command-text').textContent =
      `ssh -R ${p}:localhost:${window._fanarPort || 23517} ${u}@${h} -N`
  },

  _updateBtnVisibility() {
    const hasHost = !!localStorage.getItem('fanar.ssh.host')
    this.btn.hidden = this.status === 'disconnected' && !hasHost
  },

  async connect() {
    if (!window.go) return
    const user = document.getElementById('ssh-user').value.trim()
    const host = document.getElementById('ssh-host').value.trim()
    const port = parseInt(document.getElementById('ssh-remote-port').value) || 0

    if (!user || !host) {
      document.getElementById('ssh-user').focus()
      return
    }

    localStorage.setItem('fanar.ssh.user', user)
    localStorage.setItem('fanar.ssh.host', host)
    this._updateBtnVisibility()

    try {
      await window.go.main.App.ConnectSSH(user, host, port)
    } catch (e) {
      this.applyState({ status: 'error', error: e.message || String(e) })
    }
  },

  disconnect() {
    if (window.go) window.go.main.App.DisconnectSSH()
  },

  applyState(s) {
    this.status = s.status
    const statusEl  = document.getElementById('ssh-status-text')
    const connectEl = document.getElementById('ssh-connect-btn')

    statusEl.className = `ssh-status ${s.status}`

    const labels = {
      disconnected: 'Disconnected',
      connecting:   'Connecting…',
      connected:    `Connected — ${s.user}@${s.host}:${s.port}`,
      error:        `Error: ${s.error}`,
    }
    statusEl.textContent = labels[s.status] ?? s.status

    const active = s.status === 'connected' || s.status === 'connecting'
    connectEl.textContent = active ? 'Disconnect' : 'Connect'
    connectEl.classList.toggle('disconnect', active)

    this.dot.className = `ssh-dot ${s.status}`
    this.dot.hidden = s.status === 'disconnected'
    this.btn.classList.toggle('active', active)

    this._updateBtnVisibility()
  }
}

document.addEventListener('DOMContentLoaded', () => SSH.init())
