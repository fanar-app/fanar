function timeAgo(iso) {
  const d = new Date(iso)
  if (!iso || isNaN(d) || d.getFullYear() < 2000) return ''
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return d.toLocaleDateString()
}

const COPY_ICON = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V3a1.5 1.5 0 00-1.5-1.5H3A1.5 1.5 0 001.5 3v6.5A1.5 1.5 0 003 11h2"/></svg>`
const DB_ICON = `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="8" cy="4" rx="6" ry="2.5"/><path d="M2 4v8c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V4"/><path d="M2 8c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5"/></svg>`

const SLOW_QUERY_MS      = 100
const SLOW_REQUEST_MS    = 1000
const CONTENT_MAX_HEIGHT = 240

function _filterLabel(type) {
  return type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)
}

function updateCounter(payloads) {
  const counts = {}
  for (const p of payloads) counts[p.type] = (counts[p.type] || 0) + 1
  document.querySelectorAll('.filter-btn').forEach(btn => {
    const type = btn.dataset.filter
    const count = type === 'all' ? payloads.length : (counts[type] || 0)
    const base = _filterLabel(type)
    btn.textContent = count > 0 ? `${base} (${count})` : base
  })
}

const Feed = {
  _scrollLocked: false,
  _newCount: 0,
  _tickInterval: null,

  init() {
    const feedEl = document.getElementById('feed')

    feedEl.addEventListener('scroll', () => {
      const atBottom = feedEl.scrollHeight - feedEl.scrollTop - feedEl.clientHeight < 60
      if (atBottom && this._newCount > 0) {
        this._newCount = 0
        document.getElementById('scroll-new-badge').hidden = true
      }
      this._scrollLocked = !atBottom
    })

    feedEl.addEventListener('click', e => {
      // Expand/collapse truncated content — check first to prevent header toggle
      const expandBtn = e.target.closest('.content-expand-btn')
      if (expandBtn) {
        const content = expandBtn.closest('.item-content')
        if (content.classList.contains('content-truncated')) {
          content.classList.remove('content-truncated')
          expandBtn.textContent = 'Show less'
        } else {
          content.classList.add('content-truncated')
          expandBtn.textContent = 'Show more'
        }
        return
      }

      // Badge click — filter by type
      const badge = e.target.closest('.item-badge')
      if (badge) {
        if (typeof setFilter === 'function') setFilter(badge.dataset.type)
        return
      }

      // Per-item copy button
      const copyBtn = e.target.closest('.item-copy-btn')
      if (copyBtn) {
        e.preventDefault()
        navigator.clipboard.writeText(copyBtn.dataset.content).then(() => {
          copyBtn.classList.add('copied')
          setTimeout(() => copyBtn.classList.remove('copied'), 1500)
        }).catch(() => {})
        return
      }

      // Timestamp toggle (relative ↔ absolute)
      const timeEl = e.target.closest('.item-time')
      if (timeEl) {
        if (timeEl.dataset.mode === 'abs') {
          timeEl.textContent = timeAgo(timeEl.dataset.ts)
          timeEl.dataset.mode = 'rel'
        } else {
          timeEl.textContent = new Date(timeEl.dataset.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          timeEl.dataset.mode = 'abs'
        }
        return
      }

      // Origin link — opens file in VS Code
      const link = e.target.closest('.origin-link')
      if (link) {
        e.preventDefault()
        window.open(`vscode://file/${link.dataset.file}:${link.dataset.line}`)
        return
      }

      // Collapse/expand item on header click
      const header = e.target.closest('.item-header')
      if (header) {
        const item = header.closest('.feed-item')
        item.classList.toggle('collapsed')
        if (!item.classList.contains('collapsed')) {
          this._applyTruncation(item)
        }
      }
    })

    document.getElementById('scroll-new-badge').addEventListener('click', () => {
      feedEl.scrollTop = feedEl.scrollHeight
      this._newCount = 0
      document.getElementById('scroll-new-badge').hidden = true
      this._scrollLocked = false
    })

    // Keep relative timestamps fresh every 30s (skip manually toggled ones)
    if (this._tickInterval) clearInterval(this._tickInterval)
    this._tickInterval = setInterval(() => {
      document.querySelectorAll('.item-time[data-ts]:not([data-mode="abs"])').forEach(el => {
        el.textContent = timeAgo(el.dataset.ts)
      })
    }, 30000)
  },

  _applyTruncation(container) {
    container.querySelectorAll('.item-content').forEach(el => {
      if (el.scrollHeight > CONTENT_MAX_HEIGHT && !el.querySelector('.content-expand-btn')) {
        el.classList.add('content-truncated')
        const btn = document.createElement('button')
        btn.className = 'content-expand-btn'
        btn.textContent = 'Show more'
        el.appendChild(btn)
      }
    })
  },

  // Full rebuild — used when filter/search/sort changes
  render(payloads, state) {
    const el = document.getElementById('feed')
    this._newCount = 0
    document.getElementById('scroll-new-badge').hidden = true

    const visible = this._filter(payloads, state)
    updateCounter(payloads)

    if (visible.length === 0) {
      const isFiltered = state.filter !== 'all' || !!state.search
      if (isFiltered) {
        const desc = state.filter !== 'all'
          ? `type <em>${esc(state.filter)}</em>`
          : `&ldquo;${esc(state.search)}&rdquo;`
        el.innerHTML = `<div class="empty-state">No results for ${desc}<br><button class="empty-clear-btn">Clear filters</button></div>`
        el.querySelector('.empty-clear-btn').addEventListener('click', () => {
          document.dispatchEvent(new CustomEvent('fanar:clearfilters'))
        })
      } else {
        const port = window._fanarPort || 23517
        el.innerHTML = `<div class="empty-state empty-quickstart">
          <div class="quickstart-title">No payloads yet</div>
          <div class="quickstart-hint">Send your first payload:</div>
          <pre class="quickstart-snippet">curl -s http://localhost:${port}/api/payloads \\
  -H "Content-Type: application/json" \\
  -d '{"type":"log","label":"Hello","content":"World"}'</pre>
        </div>`
      }
      return
    }

    const items = this._groupPayloads(visible)
    el.innerHTML = items.map(item => item._isGroup ? this._renderGroup(item) : this._renderItem(item)).join('')
    this._applyTruncation(el)
  },

  // Append a single item — used for live incoming payloads
  append(payload, state) {
    const el = document.getElementById('feed')

    const empty = el.querySelector('.empty-state')
    if (empty) empty.remove()

    updateCounter(state.payloads)

    if (!this._matches(payload, state)) return

    // Grouped payloads need a full rebuild to place within their group
    if (payload.requestId) {
      this.render(state.payloads, state)
      return
    }

    if (state.sort === 'oldest') {
      el.insertAdjacentHTML('beforeend', this._renderItem(payload, true))
      this._applyTruncation(el.lastElementChild)
      if (!this._scrollLocked) {
        el.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'end' })
      } else {
        this._newCount++
        document.getElementById('scroll-new-count').textContent = this._newCount
        document.getElementById('scroll-new-badge').hidden = false
      }
    } else if (state.sort === 'newest') {
      el.insertAdjacentHTML('afterbegin', this._renderItem(payload, true))
      this._applyTruncation(el.firstElementChild)
    } else {
      this.render(state.payloads, state)
    }
  },

  _filter(payloads, state) {
    const visible = payloads.filter(p => this._matches(p, state))
    return this._sort(visible, state.sort)
  },

  _sort(payloads, sort) {
    switch (sort) {
      case 'newest':
        return payloads.slice().reverse()
      case 'type':
        return payloads.slice().sort((a, b) =>
          a.type.localeCompare(b.type) || a.timestamp.localeCompare(b.timestamp)
        )
      case 'label':
        return payloads.slice().sort((a, b) =>
          (a.label || '').localeCompare(b.label || '') || a.timestamp.localeCompare(b.timestamp)
        )
      default: // oldest
        return payloads
    }
  },

  _matches(p, state) {
    if (state.filter !== 'all' && p.type !== state.filter) return false
    if (state.search) {
      const q = state.search.toLowerCase()
      return (p.label || '').toLowerCase().includes(q) ||
             (p.content || '').toLowerCase().includes(q) ||
             p.type.toLowerCase().includes(q) ||
             (p.origin?.file || '').toLowerCase().includes(q) ||
             (p.project || '').toLowerCase().includes(q)
    }
    return true
  },

  _groupPayloads(payloads) {
    const result = []
    const groups = new Map()

    for (const p of payloads) {
      if (p.requestId) {
        if (groups.has(p.requestId)) {
          groups.get(p.requestId).payloads.push(p)
        } else {
          const group = { _isGroup: true, requestId: p.requestId, payloads: [p] }
          groups.set(p.requestId, group)
          result.push(group)
        }
      } else {
        result.push(p)
      }
    }

    return result
  },

  _renderGroup(group) {
    let method = '', path = '', statusBadge = '', durationBadge = '', timeHtml = '', originFooter = ''
    const req = group.payloads.find(p => p.type === 'request')
    if (req) {
      try {
        const d = JSON.parse(req.content)
        method = d.method || ''
        path   = d.path   || ''
        const status = d.status || 0
        if (status) {
          const statusClass = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'ok'
          statusBadge = `<span class="request-status ${statusClass}">${status}</span>`
        }
        durationBadge = `<span class="duration-badge ${(d.duration || 0) > SLOW_REQUEST_MS ? 'slow' : ''}">${d.duration || 0}ms</span>`
        if ((d.queryCount || 0) > 0) {
          durationBadge += `<span class="query-count" title="${d.queryCount} ${d.queryCount === 1 ? 'query' : 'queries'}">${DB_ICON} ${d.queryCount}</span>`
        }
      } catch {}
      const exactTime = new Date(req.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      timeHtml = `<span class="group-time item-time" data-ts="${esc(req.timestamp)}" title="${exactTime}">${timeAgo(req.timestamp)}</span>`
      if (req.origin && req.origin.file) {
        originFooter = `<div class="group-origin"><a class="origin-link" href="#" data-file="${esc(req.origin.file)}" data-line="${req.origin.line}">${esc(req.origin.file.split('/').pop())}:${req.origin.line}</a></div>`
      }
    }

    const children = group.payloads.filter(p => p.type !== 'request')
    const hasChildren = children.length > 0
    const countLabel = hasChildren ? `<span class="group-count">${children.length}</span>` : ''
    const items = children.map(p => this._renderItem(p)).join('')

    const nameHtml = req && req.label
      ? `<span class="group-name">${esc(req.label)}</span>
         <span class="group-endpoint"><span class="request-method">${esc(method)}</span> <span class="request-path">${esc(path)}</span></span>`
      : `<span class="group-title"><span class="request-method">${esc(method)}</span> <span class="request-path">${esc(path)}</span></span>`

    const summaryInner = `
      <span class="group-chevron">▶</span>
      <span class="item-badge request">request</span>
      ${nameHtml}
      <span class="item-header-right">
        ${timeHtml}
        ${durationBadge}
        ${statusBadge}
        ${countLabel}
      </span>`

    if (hasChildren) {
      return `
        <details class="request-group" open>
          <summary>${summaryInner}</summary>
          ${originFooter}
          <div class="group-body">${items}</div>
        </details>`
    }
    return `
      <div class="request-group request-group-solo">
        <div class="request-group-summary">${summaryInner}</div>
        ${originFooter}
      </div>`
  },

  _renderItem(p, isNew = false) {
    const exactTime = new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const relTime   = timeAgo(p.timestamp)

    const originHtml = p.origin && p.origin.file
      ? `<span class="item-origin">
           <a class="origin-link" href="#"
              data-file="${esc(p.origin.file)}"
              data-line="${p.origin.line}">
             ${esc(p.origin.file.split('/').pop())}:${p.origin.line}
           </a>
         </span>`
      : ''

    let displayLabel = p.label
    if (!displayLabel && p.type === 'exception') {
      try { displayLabel = JSON.parse(p.content).name } catch {}
    }
    const label = displayLabel ? `<span class="item-label">${esc(displayLabel)}</span>` : ''
    const project = p.project ? `<span class="item-project">${esc(p.project)}</span>` : ''

    const footerHtml = originHtml ? `<div class="item-footer">${originHtml}</div>` : ''

    let durationBadge = '', statusBadge = ''
    if (p.type === 'query' || p.type === 'measure') {
      try {
        const d = JSON.parse(p.content)
        const threshold = p.type === 'query' ? SLOW_QUERY_MS : SLOW_REQUEST_MS
        durationBadge = `<span class="duration-badge ${(d.duration || 0) > threshold ? 'slow' : ''}">${d.duration || 0}ms</span>`
      } catch {}
    }
    if (p.type === 'request') {
      try {
        const d = JSON.parse(p.content)
        durationBadge = `<span class="duration-badge ${(d.duration || 0) > SLOW_REQUEST_MS ? 'slow' : ''}">${d.duration || 0}ms</span>`
        const status = d.status || 0
        if (status) {
          const cls = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'ok'
          statusBadge = `<span class="request-status ${cls}">${status}</span>`
        }
      } catch {}
    }

    const contentHtml = renderContent(p)
    return `
      <div class="feed-item${isNew ? ' feed-item--new' : ''}">
        <div class="item-body">
          <div class="item-header">
            <svg class="item-chevron" width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><path d="M2 1l4 3-4 3V1z"/></svg>
            <span class="item-badge ${esc(p.type)}" data-type="${esc(p.type)}" title="Filter by ${esc(p.type)}">${esc(p.type)}</span>
            ${label}
            ${project}
            <span class="item-header-right">
              <span class="item-time" data-ts="${esc(p.timestamp)}" title="${exactTime}">${relTime}</span>
              ${durationBadge}
              ${statusBadge}
            </span>
          </div>
          ${contentHtml ? `<div class="item-content">${contentHtml}</div>` : ''}
          ${footerHtml}
        </div>
      </div>`
  }
}

function renderContent(p) {
  switch (p.type) {
    case 'log':       return renderLog(p)
    case 'object':    return renderObject(p)
    case 'exception': return renderException(p)
    case 'query':     return renderQuery(p)
    case 'measure':   return renderMeasure(p)
    case 'request':   return renderRequest(p)
    default:          return `<pre>${esc(p.content)}</pre>`
  }
}

function renderLog(p) {
  try {
    const v = JSON.parse(p.content)
    if (typeof v === 'object' && v !== null) return `
      <div class="json-tree">${jsonTree(v)}</div>
      <button class="item-copy-btn content-copy-btn" data-content="${esc(JSON.stringify(v, null, 2))}" title="Copy" aria-label="Copy">${COPY_ICON}</button>`
    const text = String(v)
    return `
      <div class="log-value">${esc(text)}</div>
      <button class="item-copy-btn content-copy-btn" data-content="${esc(text)}" title="Copy" aria-label="Copy">${COPY_ICON}</button>`
  } catch {
    return `
      <div class="log-value">${esc(p.content)}</div>
      <button class="item-copy-btn content-copy-btn" data-content="${esc(p.content)}" title="Copy" aria-label="Copy">${COPY_ICON}</button>`
  }
}

function renderObject(p) {
  try {
    const v = JSON.parse(p.content)
    return `
      <div class="json-tree">${jsonTree(v)}</div>
      <button class="item-copy-btn content-copy-btn" data-content="${esc(JSON.stringify(v, null, 2))}" title="Copy" aria-label="Copy">${COPY_ICON}</button>`
  } catch {
    return `<pre>${esc(p.content)}</pre>`
  }
}

function renderException(p) {
  let data
  try { data = JSON.parse(p.content) } catch { return `<pre>${esc(p.content)}</pre>` }

  const frames = parseStack(data.stack || '')
  const framesHtml = frames.map(f => {
    const basename = f.file.split('/').pop() || f.file
    const isLib = f.file.includes('node_modules')
    return `<div class="stack-frame${isLib ? ' frame-lib' : ''}">
      <a class="origin-link" href="#" data-file="${esc(f.file)}" data-line="${f.line}">
        ${esc(f.fn || '(anonymous)')}
      </a>
      <span class="frame-loc" title="${esc(f.file)}:${f.line}">${esc(basename)}:${f.line}</span>
    </div>`
  }).join('')

  const copyText = data.stack || [data.name, data.message].filter(Boolean).join(': ')
  return `
    <button class="item-copy-btn content-copy-btn" data-content="${esc(copyText)}" title="Copy" aria-label="Copy">${COPY_ICON}</button>
    <div class="exc-name">${esc(data.name || 'Error')}</div>
    <div class="exc-message">${esc(data.message || '')}</div>
    ${frames.length ? `<div class="stack-trace">${framesHtml}</div>` : ''}`
}

function renderQuery(p) {
  let data
  try { data = JSON.parse(p.content) } catch { return `<pre>${esc(p.content)}</pre>` }

  const sql = highlightSQL(data.sql || '')
  const hasBindings = data.bindings != null &&
    !(Array.isArray(data.bindings) && data.bindings.length === 0)
  const bindingsHtml = hasBindings
    ? `<div class="query-bindings">
         <div class="query-bindings-label">Bindings</div>
         <div class="json-tree">${jsonTree(data.bindings)}</div>
       </div>`
    : ''

  return `
    <div class="query-sql-wrap">
      <pre class="query-sql">${sql}</pre>
      <button class="item-copy-btn query-sql-copy" data-content="${esc(data.sql || '')}" title="Copy SQL" aria-label="Copy SQL">${COPY_ICON}</button>
    </div>
    ${bindingsHtml}`
}

function renderMeasure(_p) {
  return ''
}

function renderRequest(p) {
  let data
  try { data = JSON.parse(p.content) } catch { return `<pre>${esc(p.content)}</pre>` }

  const queryCountHtml = (data.queryCount || 0) > 0
    ? `<div class="request-meta"><span class="query-count" title="${data.queryCount} ${data.queryCount === 1 ? 'query' : 'queries'}">${DB_ICON} ${data.queryCount}</span></div>`
    : ''

  const bodyHtml = data.body != null
    ? `<div class="request-body">
         <div class="request-body-label">
           Body
           <button class="item-copy-btn request-body-copy" data-content="${esc(JSON.stringify(data.body, null, 2))}" title="Copy payload" aria-label="Copy payload">${COPY_ICON}</button>
         </div>
         <div class="json-tree">${jsonTree(data.body)}</div>
       </div>`
    : ''

  return `${queryCountHtml}${bodyHtml}`
}

function jsonTree(v, depth = 0) {
  if (v === null) return '<span class="null">null</span>'
  const t = typeof v
  if (t === 'string') return `<span class="string">"${esc(v)}"</span>`
  if (t === 'number') return `<span class="number">${v}</span>`
  if (t === 'boolean') return `<span class="bool">${v}</span>`
  if (Array.isArray(v)) {
    if (v.length === 0) return '<span class="bracket">[]</span>'
    const items = v.map(item => `<div class="tree-item">${jsonTree(item, depth + 1)}</div>`).join('')
    return `<details ${depth < 1 ? 'open' : ''}><summary><span class="bracket">Array[${v.length}]</span></summary>${items}</details>`
  }
  if (t === 'object') {
    const keys = Object.keys(v)
    if (keys.length === 0) return '<span class="bracket">{}</span>'
    const items = keys.map(k =>
      `<div class="tree-item"><span class="key">"${esc(k)}"</span>: ${jsonTree(v[k], depth + 1)}</div>`
    ).join('')
    return `<details ${depth < 1 ? 'open' : ''}><summary><span class="bracket">Object{${keys.length}}</span></summary>${items}</details>`
  }
  return esc(String(v))
}

function highlightSQL(sql) {
  let formatted = sql
  if (window.sqlFormatter) {
    try {
      formatted = sqlFormatter.format(sql, { language: 'sql', tabWidth: 2, keywordCase: 'upper' })
    } catch {}
  }
  const kw = /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|AND|OR|NOT|IN|IS|NULL|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|DROP|ALTER|ADD|COLUMN|DISTINCT|COUNT|SUM|AVG|MIN|MAX|CASE|WHEN|THEN|ELSE|END|RETURNING|BEGIN|COMMIT|ROLLBACK|TRANSACTION)\b/gi
  return formatted.split(kw).map((part, i) =>
    i % 2 === 0 ? esc(part) : `<span class="sql-kw">${esc(part)}</span>`
  ).join('')
}

function parseStack(stack) {
  const frames = []
  for (const line of (stack || '').split('\n')) {
    const m = line.match(/at\s+(.+?)\s+\((.+):(\d+):\d+\)/) || line.match(/at\s+(.+):(\d+):\d+/)
    if (m) {
      if (m.length === 4) frames.push({ fn: m[1], file: m[2], line: +m[3] })
      else frames.push({ fn: '', file: m[1], line: +m[2] })
    }
  }
  return frames
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
