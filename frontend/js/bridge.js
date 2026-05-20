// Wails event bridge — wires Go events to UI state
window.addEventListener('load', () => {
  if (!window.runtime) return

  window.runtime.EventsOn('payload:new', payload => {
    if (State.paused) {
      State.pending.push(payload)
      if (typeof updatePauseOverlay === 'function') updatePauseOverlay()
      return
    }
    State.payloads.push(payload)
    Feed.append(payload, State)
  })

  window.runtime.EventsOn('payload:cleared', () => {
    State.payloads = []
    State.pending = []
    render()
  })
})
