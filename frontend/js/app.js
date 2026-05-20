const State = {
  payloads: [],
  filter: 'all',
  search: '',
  sort: 'oldest',
  paused: false,
  pending: [],
  panelOpen: false,
}

function render() {
  Feed.render(State.payloads, State)
}

function filterActive() {
  return State.filter !== 'all' || !!State.search
}

function updateSearchPanel() {
  const panel     = document.getElementById('search-panel')
  const searchBtn = document.getElementById('search-btn')
  const searchDot = document.getElementById('search-dot')
  const active    = filterActive()
  const visible   = State.panelOpen || active

  panel.hidden = !visible
  document.body.classList.toggle('search-panel-visible', visible)
  searchBtn.classList.toggle('active', visible)
  searchDot.hidden = !active
}

function updateFilterChip() {
  const row  = document.getElementById('filter-chip-row')
  const chip = document.getElementById('active-filter-chip')
  const active = State.filter !== 'all'
  row.hidden = !active
  document.body.classList.toggle('filter-chip-visible', active)
  if (active) chip.textContent = State.filter
}

function setFilter(type) {
  State.filter = type
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === type)
  })
  updateSearchPanel()
  updateFilterChip()
  render()
}

function clearAllFilters() {
  State.search = ''
  document.getElementById('search').value = ''
  State.filter = 'all'
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === 'all')
  })
  updateSearchPanel()
  updateFilterChip()
  render()
}

// Global so bridge.js can call it
function updatePauseOverlay() {
  const overlay = document.getElementById('pause-overlay')
  const msg     = document.getElementById('pause-overlay-msg')
  overlay.hidden = !State.paused
  if (State.paused) {
    const n = State.pending.length
    msg.textContent = n > 0 ? `Paused — ${n} new ${n === 1 ? 'item' : 'items'} waiting` : 'Paused'
  }
}

// Global so ssh.js can call it
function openPrefs(tab) {
  document.getElementById('prefs-modal').hidden = false
  if (tab) {
    document.querySelectorAll('.prefs-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab)
    })
    document.querySelectorAll('.prefs-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `pane-${tab}`)
    })
  }
}

async function init() {
  Feed.init()
  if (window.go) {
    try {
      const [payloads, port] = await Promise.all([
        window.go.main.App.GetPayloads(),
        window.go.main.App.GetPort(),
      ])
      State.payloads = payloads || []
      window._fanarPort = port
      document.getElementById('port-input').value = port
      document.getElementById('ssh-remote-port').value = port
    } catch (e) {
      console.error('init failed', e)
    }
  }
  render()

  document.getElementById('search-btn').addEventListener('click', () => {
    if (filterActive()) return  // panel is pinned when filter active
    State.panelOpen = !State.panelOpen
    updateSearchPanel()
    if (State.panelOpen) document.getElementById('search').focus()
  })

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => setFilter(btn.dataset.filter))
  })

  document.getElementById('clear-filter-btn').addEventListener('click', () => {
    setFilter('all')
  })

  document.getElementById('search').addEventListener('input', e => {
    State.search = e.target.value
    updateSearchPanel()
    render()
  })

  document.getElementById('sort-select').addEventListener('change', e => {
    State.sort = e.target.value
    render()
  })

  document.addEventListener('fanar:clearfilters', clearAllFilters)

  const ICON_PAUSE = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="3" x2="5" y2="13"/><line x1="11" y1="3" x2="11" y2="13"/></svg>`
  const ICON_PLAY  = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5l10 5.5-10 5.5z"/></svg>`

  const pauseBtn = document.getElementById('pause-btn')
  pauseBtn.addEventListener('click', () => {
    State.paused = !State.paused
    pauseBtn.innerHTML = State.paused ? ICON_PLAY : ICON_PAUSE
    pauseBtn.title     = State.paused ? 'Resume' : 'Pause'
    pauseBtn.setAttribute('aria-label', State.paused ? 'Resume feed' : 'Pause feed')
    pauseBtn.classList.toggle('active', State.paused)
    if (!State.paused && State.pending.length > 0) {
      State.payloads.push(...State.pending)
      State.pending = []
      render()
    }
    updatePauseOverlay()
  })

  document.getElementById('pause-overlay').addEventListener('click', () => {
    pauseBtn.click()
  })

  document.getElementById('clear-btn').addEventListener('click', async () => {
    if (window.go) {
      try { await window.go.main.App.ClearPayloads() } catch (e) { console.error(e) }
    }
    State.payloads = []
    State.pending = []
    render()
  })

  document.getElementById('export-btn').addEventListener('click', async () => {
    if (!window.go) return
    const data = Feed._filter(State.payloads, State)
    try {
      await window.go.main.App.ExportJSON(JSON.stringify(data, null, 2))
    } catch (e) {
      console.error('export failed', e)
    }
  })

  initTheme()
  initPortPane()
  initPrefs()

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      document.getElementById('clear-btn').click()
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault()
      document.getElementById('search').focus()
    }
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault()
      pauseBtn.click()
    }
    if (e.key === 'Escape') {
      if (document.activeElement === document.getElementById('search')) {
        e.preventDefault()
        clearAllFilters()
        State.panelOpen = false
        document.getElementById('search').blur()
        updateSearchPanel()
      }
      const modal = document.getElementById('prefs-modal')
      if (!modal.hidden) { e.preventDefault(); modal.hidden = true }
    }
    if (e.key === '?' && !e.target.matches('input, textarea, select')) {
      e.preventDefault()
      openPrefs('shortcuts')
    }
  })
}

function initTheme() {
  const saved  = localStorage.getItem('fanar.theme')
  const system = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'warm-dark'

  function applyTheme(name) {
    document.documentElement.dataset.theme = name
    localStorage.setItem('fanar.theme', name)
    document.querySelectorAll('.theme-option input').forEach(r => {
      r.checked = r.value === name
    })
  }

  applyTheme(saved || system)

  document.querySelectorAll('#pane-theme .theme-option input').forEach(radio => {
    radio.addEventListener('change', () => applyTheme(radio.value))
  })
}

function initPortPane() {
  const input = document.getElementById('port-input')

  document.getElementById('port-save-btn').addEventListener('click', async () => {
    const port = parseInt(input.value, 10)
    if (!port || port < 1 || port > 65535 || port === window._fanarPort) return

    if (window.go) {
      try {
        await window.go.main.App.SetPort(port)
        window._fanarPort = port
        document.getElementById('ssh-remote-port').value = port
        SSH._updateCommand()
        document.getElementById('prefs-modal').hidden = true
        showRestartBanner(port)
      } catch (e) {
        console.error('SetPort failed', e)
      }
    }
  })

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('port-save-btn').click()
  })
}

function initPrefs() {
  const modal = document.getElementById('prefs-modal')

  document.getElementById('prefs-btn').addEventListener('click', () => {
    modal.hidden = !modal.hidden
  })

  document.getElementById('prefs-close').addEventListener('click', () => {
    modal.hidden = true
  })

  modal.querySelector('.modal-backdrop').addEventListener('click', () => {
    modal.hidden = true
  })

  modal.querySelectorAll('.prefs-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      modal.querySelectorAll('.prefs-tab').forEach(t => t.classList.remove('active'))
      modal.querySelectorAll('.prefs-pane').forEach(p => p.classList.remove('active'))
      tab.classList.add('active')
      document.getElementById(`pane-${tab.dataset.tab}`).classList.add('active')
    })
  })
}

function showRestartBanner(port) {
  const banner = document.getElementById('restart-banner')
  document.getElementById('restart-banner-msg').textContent =
    `Port changed to ${port} — restart Fanar to apply.`
  banner.hidden = false
  document.body.classList.add('restart-banner-visible')

  document.getElementById('restart-now-btn').onclick = () => {
    if (window.go) window.go.main.App.Restart()
  }

  document.getElementById('restart-dismiss-btn').onclick = () => {
    banner.hidden = true
    document.body.classList.remove('restart-banner-visible')
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init().then(() => {
    const splash = document.getElementById('splash')
    setTimeout(() => {
      splash.classList.add('hiding')
      splash.addEventListener('animationend', () => splash.remove(), { once: true })
    }, 3000)
  })
})
