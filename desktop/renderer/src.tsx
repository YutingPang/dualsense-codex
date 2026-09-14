import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Action } from '../../src/harness/types.js'
import type {
  ConfigEnvelope,
  ControlId,
  DesktopSnapshot,
  OpenMicroConfig,
} from '../shared/contracts.js'
import './style.css'

const CONTROLS: { id: ControlId; label: string }[] = [
  { id: 'south', label: '× Cross' },
  { id: 'east', label: '○ Circle' },
  { id: 'west', label: '□ Square' },
  { id: 'north', label: '△ Triangle' },
  { id: 'dpad_up', label: 'D-pad Up' },
  { id: 'dpad_down', label: 'D-pad Down' },
  { id: 'dpad_left', label: 'D-pad Left' },
  { id: 'dpad_right', label: 'D-pad Right' },
  { id: 'l1', label: 'L1' },
  { id: 'r1', label: 'R1' },
  { id: 'l2', label: 'L2' },
  { id: 'r2', label: 'R2' },
  { id: 'l3', label: 'L3' },
  { id: 'r3', label: 'R3' },
  { id: 'menu', label: 'Options' },
  { id: 'view', label: 'Create' },
  { id: 'touchpad', label: 'Touchpad Click' },
  { id: 'lstick_up', label: 'Left Stick Up' },
  { id: 'lstick_down', label: 'Left Stick Down' },
  { id: 'lstick_left', label: 'Left Stick Left' },
  { id: 'lstick_right', label: 'Left Stick Right' },
  { id: 'rstick_up', label: 'Right Stick Up' },
  { id: 'rstick_down', label: 'Right Stick Down' },
  { id: 'rstick_left', label: 'Right Stick Left' },
  { id: 'rstick_right', label: 'Right Stick Right' },
]

type EditableActionType = Action['type'] | 'none'

function App() {
  const [snapshot, setSnapshot] = useState<DesktopSnapshot | null>(null)
  const [envelope, setEnvelope] = useState<ConfigEnvelope | null>(null)
  const [draft, setDraft] = useState<OpenMicroConfig | null>(null)
  const [layerIndex, setLayerIndex] = useState(0)
  const [control, setControl] = useState<ControlId>('south')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = (operation: Promise<DesktopSnapshot>) => {
    setError(null)
    void operation.then(setSnapshot).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  useEffect(() => {
    load(window.openMicroDesktop.getSnapshot())
    const presencePoll = setInterval(() => {
      void window.openMicroDesktop.getSnapshot().then(setSnapshot)
    }, 1500)
    void window.openMicroDesktop
      .getConfig()
      .then((next) => {
        setEnvelope(next)
        setDraft(structuredClone(next.config))
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      )
    return () => clearInterval(presencePoll)
  }, [])
  const connected = snapshot?.controller.connected ?? false
  const codexRunning = snapshot?.codex.running ?? false
  const binding = draft?.layers[layerIndex]?.bindings[control]
  const dirty =
    envelope && draft ? JSON.stringify(envelope.config) !== JSON.stringify(draft) : false

  const updateBinding = (next: Action | null) => {
    if (!draft) return
    const updated = structuredClone(draft)
    const layer = updated.layers[layerIndex]
    if (!layer) return
    if (next) layer.bindings[control] = next
    else delete layer.bindings[control]
    setDraft(updated)
  }

  const changeActionType = (type: EditableActionType) => {
    switch (type) {
      case 'none':
        updateBinding(null)
        break
      case 'accept':
      case 'reject':
      case 'push_to_talk':
      case 'new_chat':
      case 'herdr_space':
        updateBinding({ type })
        break
      case 'thinking_depth':
        updateBinding({ type, delta: 1 })
        break
      case 'workflow':
        updateBinding({ type, presetId: Object.keys(draft?.workflows ?? {})[0] ?? '' })
        break
      case 'prompt':
        updateBinding({ type, text: '' })
        break
      case 'focus_session':
        updateBinding({ type, index: -1 })
        break
      case 'layer':
        updateBinding({ type, index: 0 })
        break
      case 'keys':
        updateBinding({ type, bytes: '' })
        break
    }
  }

  const apply = () => {
    if (!draft || !envelope) return
    setSaving(true)
    setError(null)
    void window.openMicroDesktop
      .applyConfig({ config: draft, baseRevision: envelope.revision })
      .then((next) => {
        setEnvelope(next)
        setDraft(structuredClone(next.config))
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      )
      .finally(() => setSaving(false))
  }

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">OPENMICRO COMPANION</p>
          <h1>DualSense for Codex</h1>
          <p className="subtitle">Configure your controller without editing source code.</p>
        </div>
        <span className={`status ${codexRunning ? 'connected' : ''}`}>
          <span className="dot" />
          {codexRunning ? 'Codex running' : 'Codex offline'}
        </span>
      </header>

      <section className="hero device-hero">
        <div className="controller" aria-label="DualSense controller preview">
          <span className="stick left" />
          <span className="stick right" />
          <span className="pad">＋</span>
          <span className="buttons">
            △ ○
            <br />□ ×
          </span>
          <span className="touchpad" />
        </div>
        <div className="panel">
          <p className="label">DEVICE</p>
          <h2>{snapshot?.controller.productName ?? 'DualSense not detected'}</h2>
          <p>
            {connected
              ? codexRunning
                ? 'Controller ready — PlayStation starts or focuses Codex.'
                : 'Controller ready — Codex is offline. Press PlayStation to launch it.'
              : 'You can configure bindings while the controller is disconnected.'}
          </p>
          <button onClick={() => load(window.openMicroDesktop.refreshController())}>
            Refresh connection
          </button>
        </div>
      </section>

      {draft && (
        <section className="editor">
          <aside>
            <p className="label">LAYERS</p>
            <div className="layer-list">
              {draft.layers.map((layer, index) => (
                <button
                  className={index === layerIndex ? 'selected' : ''}
                  key={index}
                  onClick={() => setLayerIndex(index)}
                >
                  <span
                    className="layer-color"
                    style={{
                      background: `rgb(${layer.color.r} ${layer.color.g} ${layer.color.b})`,
                    }}
                  />
                  {layer.name}
                </button>
              ))}
            </div>
          </aside>
          <div className="control-list">
            <p className="label">CONTROLS</p>
            <div className="control-grid">
              {CONTROLS.map((item) => (
                <button
                  className={item.id === control ? 'selected' : ''}
                  key={item.id}
                  onClick={() => setControl(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="binding-editor">
            <p className="label">BINDING</p>
            <h2>{CONTROLS.find((item) => item.id === control)?.label}</h2>
            <label>
              Action
              <select
                value={binding?.type ?? 'none'}
                onChange={(event) => changeActionType(event.target.value as EditableActionType)}
              >
                <option value="none">Unassigned</option>
                <option value="accept">Enter / confirm</option>
                <option value="reject">Escape / cancel</option>
                <option value="new_chat">New task</option>
                <option value="push_to_talk">Hold to talk</option>
                <option value="prompt">Insert prompt text</option>
                <option value="workflow">Workflow preset</option>
                <option value="thinking_depth">Reasoning effort</option>
                <option value="layer">Switch layer</option>
                <option value="focus_session">Cycle task</option>
                <option value="keys">Desktop shortcut (advanced)</option>
              </select>
            </label>
            {binding?.type === 'prompt' && (
              <label>
                Prompt text
                <textarea
                  value={binding.text}
                  onChange={(event) => updateBinding({ ...binding, text: event.target.value })}
                />
              </label>
            )}
            {binding?.type === 'workflow' && (
              <label>
                Preset
                <select
                  value={binding.presetId}
                  onChange={(event) => updateBinding({ ...binding, presetId: event.target.value })}
                >
                  {Object.keys(draft.workflows).map((preset) => (
                    <option key={preset}>{preset}</option>
                  ))}
                </select>
              </label>
            )}
            {binding?.type === 'layer' && (
              <label>
                Destination layer
                <select
                  value={binding.index}
                  onChange={(event) =>
                    updateBinding({ ...binding, index: Number(event.target.value) })
                  }
                >
                  {draft.layers.map((layer, index) => (
                    <option key={index} value={index}>
                      {layer.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {binding?.type === 'thinking_depth' && (
              <label>
                Direction
                <select
                  value={binding.delta}
                  onChange={(event) =>
                    updateBinding({ ...binding, delta: Number(event.target.value) as 1 | -1 })
                  }
                >
                  <option value="1">Increase</option>
                  <option value="-1">Decrease</option>
                </select>
              </label>
            )}
            {binding?.type === 'keys' && (
              <label>
                Legacy key sequence
                <input
                  value={binding.bytes}
                  onChange={(event) => updateBinding({ ...binding, bytes: event.target.value })}
                />
              </label>
            )}
          </div>
        </section>
      )}

      <section className="apply-bar">
        <span>{dirty ? 'Unsaved changes' : 'Configuration is up to date'}</span>
        <div>
          <button
            disabled={!dirty}
            onClick={() => setDraft(envelope ? structuredClone(envelope.config) : null)}
          >
            Discard
          </button>
          <button className="primary" disabled={!dirty || saving} onClick={apply}>
            {saving ? 'Applying…' : 'Apply changes'}
          </button>
        </div>
      </section>

      <section className="runtime">
        <div>
          <p className="label">RUNTIME</p>
          <h2>{snapshot?.runtime.paused ? 'Controller paused' : 'Ready for configuration'}</h2>
          <p>Pause controller output while changing bindings or testing Codex shortcuts.</p>
        </div>
        <button
          className={snapshot?.runtime.paused ? 'primary' : 'danger'}
          onClick={() => load(window.openMicroDesktop.setPaused(!snapshot?.runtime.paused))}
        >
          {snapshot?.runtime.paused ? 'Resume' : 'Pause'}
        </button>
      </section>

      {error && <p className="error">{error}</p>}
      <footer>
        v{snapshot?.app.version ?? '…'} · {snapshot?.app.packaged ? 'Packaged app' : 'Development'}
      </footer>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
