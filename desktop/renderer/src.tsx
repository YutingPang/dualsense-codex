import { Fragment, StrictMode, useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createRoot } from 'react-dom/client'
import type { Action, KeyboardModifier } from '../../src/harness/types.js'
import { keyboardShortcutLabel, macKeyCodeForDomCode } from '../../src/keyboard-shortcut.js'
import { isAxisControl } from '../../src/layers.js'
import type {
  ConfigEnvelope,
  ControlId,
  DesktopSnapshot,
  OpenMicroConfig,
} from '../shared/contracts.js'
import { actionDetail, actionLabel } from './callouts.js'
import { PadStage } from './PadStage.js'
import './style.css'

/** Physical buttons: always listed, always callout-annotated on the pad. */
const BUTTON_CONTROLS: ControlId[] = [
  'south',
  'east',
  'west',
  'north',
  'dpad_up',
  'dpad_down',
  'dpad_left',
  'dpad_right',
  'l1',
  'r1',
  'l2',
  'r2',
  'l3',
  'r3',
  'menu',
  'view',
  'touchpad',
]

/** Gesture-only controls: driven by stick flicks, no press/release edge. */
const GESTURE_CONTROLS: ControlId[] = [
  'lstick_up',
  'lstick_down',
  'lstick_left',
  'lstick_right',
  'rstick_up',
  'rstick_down',
  'rstick_left',
  'rstick_right',
]

const LABELS: Partial<Record<ControlId, string>> = {
  south: 'Cross / A',
  east: 'Circle / B',
  west: 'Square / X',
  north: 'Triangle / Y',
  dpad_up: 'D-pad Up',
  dpad_down: 'D-pad Down',
  dpad_left: 'D-pad Left',
  dpad_right: 'D-pad Right',
  l1: 'L1',
  r1: 'R1',
  l2: 'L2',
  r2: 'R2',
  l3: 'L3',
  r3: 'R3',
  menu: 'Options',
  view: 'Create',
  touchpad: 'Touchpad Click',
  lstick_up: 'Left Stick Up',
  lstick_down: 'Left Stick Down',
  lstick_left: 'Left Stick Left',
  lstick_right: 'Left Stick Right',
  rstick_up: 'Right Stick Up',
  rstick_down: 'Right Stick Down',
  rstick_left: 'Right Stick Left',
  rstick_right: 'Right Stick Right',
}

const GLYPHS: Partial<Record<ControlId, string>> = {
  south: '✕',
  east: '○',
  west: '□',
  north: '△',
  touchpad: 'TP',
}

type EditableActionType = Action['type'] | 'none'

function App() {
  const [snapshot, setSnapshot] = useState<DesktopSnapshot | null>(null)
  const [envelope, setEnvelope] = useState<ConfigEnvelope | null>(null)
  const [draft, setDraft] = useState<OpenMicroConfig | null>(null)
  const [layerIndex, setLayerIndex] = useState(0)
  const [control, setControl] = useState<ControlId>('south')
  const [saving, setSaving] = useState(false)
  const [capturingShortcut, setCapturingShortcut] = useState(false)
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
  const chatGptRunning = snapshot?.chatgpt.running ?? false
  const paused = snapshot?.runtime.paused ?? false
  const layer = draft?.layers[layerIndex]
  const binding = layer?.bindings[control]
  const dirty =
    envelope && draft ? JSON.stringify(envelope.config) !== JSON.stringify(draft) : false

  const updateBinding = (next: Action | null) => {
    if (!draft) return
    const updated = structuredClone(draft)
    const target = updated.layers[layerIndex]
    if (!target) return
    if (next) target.bindings[control] = next
    else delete target.bindings[control]
    setDraft(updated)
  }

  const changeActionType = (type: EditableActionType) => {
    setCapturingShortcut(false)
    switch (type) {
      case 'none':
        updateBinding(null)
        break
      case 'accept':
      case 'reject':
      case 'clear_input':
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
      case 'keyboard_shortcut':
        updateBinding({ type, code: 'KeyA', modifiers: [] })
        break
    }
  }

  const captureShortcutKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!capturingShortcut) return
    event.preventDefault()
    event.stopPropagation()
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return

    if (macKeyCodeForDomCode(event.code) === null) {
      setError(`“${event.key}” is not supported as a keyboard shortcut key yet.`)
      setCapturingShortcut(false)
      return
    }

    const modifiers: KeyboardModifier[] = []
    if (event.metaKey) modifiers.push('command')
    if (event.ctrlKey) modifiers.push('control')
    if (event.altKey) modifiers.push('option')
    if (event.shiftKey) modifiers.push('shift')
    updateBinding({ type: 'keyboard_shortcut', code: event.code, modifiers })
    setCapturingShortcut(false)
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

  const selectControl = (id: ControlId) => {
    setCapturingShortcut(false)
    setControl(id)
  }

  const boundCount = layer ? Object.keys(layer.bindings).length : 0

  const detail = (id: ControlId): string =>
    draft ? actionDetail(layer?.bindings[id], draft.layers) : '—'

  const row = (id: ControlId) => {
    const action = layer?.bindings[id]
    const open = id === control
    return (
      <Fragment key={id}>
        <tr
          className={open ? 'selected' : ''}
          onClick={() => selectControl(id)}
          aria-selected={open}
        >
          <td>
            <div className="ctl">
              <span className={`glyph ${id}`}>
                {GLYPHS[id] ?? (id.startsWith('lstick') || id.startsWith('rstick') ? '↗' : '')}
              </span>
              {LABELS[id] ?? id}
            </div>
          </td>
          <td className="action">
            {actionLabel(action, draft?.workflows ?? {})}
            {id === 'touchpad' && <span className="pill">fixed in desktop</span>}
          </td>
          <td className="keys">{detail(id)}</td>
          <td className="edit">{open ? 'Editing' : 'Edit ›'}</td>
        </tr>
        {open && (
          <tr className="editor-row">
            <td colSpan={4}>
              <div className="editor">
                <label>
                  Action
                  <select
                    value={binding?.type ?? 'none'}
                    onChange={(event) => changeActionType(event.target.value as EditableActionType)}
                  >
                    <option value="none">Unassigned</option>
                    <option value="accept">Enter / confirm</option>
                    <option value="reject">Escape / cancel</option>
                    <option value="clear_input">Clear all input</option>
                    <option value="keyboard_shortcut">Keyboard key / shortcut</option>
                    <option value="new_chat">New task</option>
                    <option value="push_to_talk" disabled={isAxisControl(id)}>
                      {isAxisControl(id) ? 'Hold to talk (needs a button)' : 'Hold to talk'}
                    </option>
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
                      onChange={(event) =>
                        updateBinding({ ...binding, presetId: event.target.value })
                      }
                    >
                      {Object.keys(draft?.workflows ?? {}).map((preset) => (
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
                      {draft?.layers.map((item, index) => (
                        <option key={index} value={index}>
                          {item.name}
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
                {binding?.type === 'keyboard_shortcut' && (
                  <label>
                    Keyboard key or combination
                    <button
                      type="button"
                      onClick={() => {
                        setError(null)
                        setCapturingShortcut(true)
                      }}
                      onKeyDown={captureShortcutKey}
                    >
                      {capturingShortcut
                        ? 'Press a key or combination…'
                        : `Record shortcut (${keyboardShortcutLabel(binding.code, binding.modifiers)})`}
                    </button>
                    <span className="hint">
                      Click to record a key or combo such as ⌘ K or ⌃ ⇧ M. It will be sent to the
                      foreground app.
                    </span>
                  </label>
                )}
                <button className="ghost clear" onClick={() => updateBinding(null)}>
                  Clear binding
                </button>
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <p className="eyebrow">DualSense for Codex</p>
          <h1>Bindings</h1>
        </div>
        <div className="statuses">
          <span className={`status ${connected ? '' : 'offline'}`}>
            <span className="dot" />
            {connected
              ? (snapshot?.controller.productName ?? 'Controller connected')
              : 'No controller'}
          </span>
          <span className={`status ${chatGptRunning ? '' : 'offline'}`}>
            <span className="dot" />
            {chatGptRunning ? 'ChatGPT running' : 'ChatGPT offline'}
          </span>
          <button
            className="ghost"
            onClick={() => load(window.openMicroDesktop.refreshController())}
          >
            Refresh
          </button>
          <button
            className={paused ? 'primary' : 'ghost'}
            onClick={() => load(window.openMicroDesktop.setPaused(!paused))}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </header>

      {draft && (
        <div className="body">
          <aside className="rail">
            <p className="eyebrow">Layers</p>
            {draft.layers.map((item, index) => (
              <button
                key={index}
                className={`layer ${index === layerIndex ? 'selected' : ''}`}
                onClick={() => {
                  setCapturingShortcut(false)
                  setLayerIndex(index)
                }}
              >
                <span
                  className="layer-color"
                  style={{ background: `rgb(${item.color.r} ${item.color.g} ${item.color.b})` }}
                />
                {item.name}
                <span className="count">{Object.keys(item.bindings).length}</span>
              </button>
            ))}
            <div className="sep" />
            <p className="eyebrow">Workflows</p>
            {Object.keys(draft.workflows).map((preset) => (
              <div className="item" key={preset}>
                {preset}
              </div>
            ))}
          </aside>

          <section className="main">
            <PadStage
              layer={layer}
              workflows={draft.workflows}
              selected={control}
              connected={connected}
              onSelect={selectControl}
            />

            <div className="list-head">
              <h2>Bindings</h2>
              <span className="sub">
                {layer?.name} · {boundCount} bound
              </span>
              <span className="spacer" />
              <span className={`state ${dirty ? 'dirty' : ''}`}>
                {dirty ? 'Unsaved changes' : 'Up to date'}
              </span>
            </div>

            <table>
              <thead>
                <tr>
                  <th className="c-control">Control</th>
                  <th>Action</th>
                  <th className="c-keys">Sends</th>
                  <th className="c-edit" />
                </tr>
              </thead>
              <tbody>
                {BUTTON_CONTROLS.map((id) => row(id))}
                <tr className="group">
                  <td colSpan={4}>Stick gestures · fire on return to centre</td>
                </tr>
                {GESTURE_CONTROLS.map((id) => row(id))}
              </tbody>
            </table>

            <div className="apply-bar">
              <span>Changes apply to the running companion when you Apply.</span>
              <span className="spacer" />
              <button
                className="ghost"
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
        </div>
      )}

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
