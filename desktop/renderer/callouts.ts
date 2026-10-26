// Callout model for the pad stage. Everything here is derived from the binding
// config, so rebinding a control changes the label on the pad and the row in the
// table in the same render — the diagram is a projection, not decoration.

import type { Action } from '../../src/harness/types.js'
import { keyboardShortcutLabel } from '../../src/keyboard-shortcut.js'
import type { ControlId, Layer } from '../../src/layers.js'

export type CalloutSide = 'left' | 'right' | 'top' | 'bottom'

export interface Callout {
  /** Control id, or a group id such as the d-pad cluster. */
  id: string
  /** Glyph or short name shown first in the chip. */
  button: string
  /** Human label for the current binding. */
  action: string
  side: CalloutSide
  /** Chip centre along its edge, in stage pixels. */
  y: number
  /** Point on the pad the leader line ends at, in stage pixels. */
  anchor: { x: number; y: number }
  /** Accent colour for the face buttons. */
  tone?: string
  bound: boolean
  /** Handled by the desktop wrapper; a binding here has no effect. */
  fixed?: boolean
}

/** The pad is drawn at 600px wide from a 480x320 viewBox, offset in the stage. */
const PAD = { left: 150, top: 70, scale: 1.25 }

const at = (x: number, y: number): { x: number; y: number } => ({
  x: PAD.left + x * PAD.scale,
  y: PAD.top + y * PAD.scale,
})

const ARROWS = new Set(['\x1b[A', '\x1b[B', '\x1b[C', '\x1b[D'])

function keysLabel(bytes: string): string {
  if (ARROWS.has(bytes)) return 'Arrow keys'
  if (bytes === '\x1b[Z') return 'Shift+Tab'
  // The desktop harness translates these three; label the effect, not the bytes.
  if (bytes === '\x15') return 'Clear input'
  if (bytes === '\x1b[109;6u') return 'Model picker'
  if (bytes === '\x1b[112;7u') return 'Plan mode'
  return 'Key sequence'
}

/**
 * Human label for an action, used by both the pad callouts and the table.
 *
 * Args:
 *     action (Action | undefined): Current binding, if any.
 *     workflows (Record<string, string>): Preset ids, for workflow labels.
 *
 * Returns:
 *     string: Short label, never an action type identifier.
 */
export function actionLabel(action: Action | undefined, workflows: Record<string, string>): string {
  if (!action) return 'Unassigned'
  switch (action.type) {
    case 'accept':
      return 'Submit'
    case 'reject':
      return 'Escape'
    case 'clear_input':
      return 'Clear input'
    case 'push_to_talk':
      return 'Hold to dictate'
    case 'new_chat':
      return 'New task'
    case 'focus_session':
      return 'Next chat'
    case 'herdr_space':
      return 'Next project'
    case 'thinking_depth':
      return action.delta > 0 ? 'Effort up' : 'Effort down'
    case 'layer':
      return 'Switch layer'
    case 'workflow':
      return action.presetId in workflows ? `Workflow · ${action.presetId}` : 'Workflow preset'
    case 'prompt':
      return 'Insert prompt'
    case 'keyboard_shortcut':
      return 'Shortcut'
    case 'keys':
      return keysLabel(action.bytes)
  }
}

/** The d-pad is one physical cluster: summarise its four bindings in one chip. */
function dpadSummary(layer: Layer | undefined, workflows: Record<string, string>): string {
  const ids: ControlId[] = ['dpad_up', 'dpad_down', 'dpad_left', 'dpad_right']
  const labels = ids.map((id) => actionLabel(layer?.bindings[id], workflows))
  const bound = labels.filter((label) => label !== 'Unassigned')
  if (bound.length === 0) return 'Unassigned'
  const distinct = new Set(bound)
  const shared = distinct.size === 1 ? (bound[0] as string) : 'Mixed bindings'
  // A partial cluster is a different state from a fully bound one; say so.
  return bound.length === ids.length ? shared : `${shared} · ${bound.length}/4`
}

/**
 * Build the callouts for one layer. Order is stable: the pad's layout does not
 * depend on which controls happen to be bound.
 *
 * Args:
 *     layer (Layer | undefined): Layer whose bindings drive the labels.
 *     workflows (Record<string, string>): Preset ids for workflow labels.
 *
 * Returns:
 *     Callout[]: One entry per annotated control, in render order.
 */
export function buildCallouts(
  layer: Layer | undefined,
  workflows: Record<string, string>,
): Callout[] {
  const label = (id: ControlId): string => actionLabel(layer?.bindings[id], workflows)

  const callouts: Omit<Callout, 'bound'>[] = [
    { id: 'l2', button: 'L2', action: label('l2'), side: 'left', y: 88, anchor: at(92, 14) },
    { id: 'l1', button: 'L1', action: label('l1'), side: 'left', y: 110, anchor: at(91, 32) },
    {
      id: 'view',
      button: 'Create',
      action: label('view'),
      side: 'left',
      y: 168,
      anchor: at(151, 78),
    },
    {
      id: 'dpad',
      button: 'D-pad',
      action: dpadSummary(layer, workflows),
      side: 'left',
      y: 213,
      anchor: at(130, 114),
    },
    { id: 'l3', button: 'L3', action: label('l3'), side: 'left', y: 301, anchor: at(176, 185) },
    {
      id: 'r2',
      button: 'R2',
      action: label('r2'),
      side: 'right',
      y: 88,
      anchor: at(388, 14),
    },
    {
      id: 'r1',
      button: 'R1',
      action: label('r1'),
      side: 'right',
      y: 110,
      anchor: at(389, 32),
    },
    {
      id: 'menu',
      button: 'Options',
      action: label('menu'),
      side: 'right',
      y: 168,
      anchor: at(328, 78),
    },
    {
      id: 'north',
      button: '△',
      action: label('north'),
      side: 'right',
      y: 190,
      anchor: at(350, 90),
      tone: '#35a15b',
    },
    {
      id: 'circle',
      button: '○',
      action: label('east'),
      side: 'right',
      y: 216,
      anchor: at(377, 118),
      tone: '#d6605e',
    },
    {
      id: 'square',
      button: '□',
      action: label('west'),
      side: 'right',
      y: 242,
      anchor: at(323, 118),
      tone: '#cf87b6',
    },
    {
      id: 'cross',
      button: '✕',
      action: label('south'),
      side: 'right',
      y: 268,
      anchor: at(350, 146),
      tone: '#7d92ff',
    },
    {
      id: 'r3',
      button: 'R3',
      action: label('r3'),
      side: 'right',
      y: 301,
      anchor: at(304, 185),
    },
    {
      id: 'touchpad',
      button: 'Touchpad',
      action: 'Move pointer · click',
      side: 'top',
      y: 45,
      anchor: at(240, 70),
      fixed: true,
    },
    {
      id: 'ps',
      button: 'PS',
      action: 'Launch ChatGPT',
      side: 'bottom',
      y: 492,
      anchor: at(240, 203),
      fixed: true,
    },
  ]

  return callouts.map((callout) => ({
    ...callout,
    bound: callout.fixed === true || callout.action !== 'Unassigned',
  }))
}

function keysDetail(bytes: string): string {
  if (ARROWS.has(bytes)) return '↑ ↓ ← →'
  if (bytes === '\x1b[Z') return '⇧Tab'
  if (bytes === '\x15') return '⌃U'
  return bytes.length > 0 ? 'raw sequence' : '—'
}

/**
 * Short description of what the binding sends, for the table's detail column.
 *
 * Args:
 *     action (Action | undefined): Current binding, if any.
 *     layers (Layer[]): Layer names, for `layer` actions.
 *
 * Returns:
 *     string: Key chord, deep link, or layer name; "—" when unbound.
 */
export function actionDetail(action: Action | undefined, layers: Layer[]): string {
  if (!action) return '—'
  switch (action.type) {
    case 'accept':
      return 'Enter'
    case 'reject':
      return 'Esc'
    case 'clear_input':
      return '⌘A ⌫'
    case 'push_to_talk':
      return '⌃⇧D (hold)'
    case 'new_chat':
      return 'codex://threads/new'
    case 'focus_session':
      return '⌘⇧]'
    case 'herdr_space':
      return '⌘⇧['
    case 'thinking_depth':
      return action.delta > 0 ? '⌃⌥=' : '⌃⌥-'
    case 'workflow':
      return 'prompt'
    case 'prompt':
      return action.text.length > 0 ? action.text : 'empty'
    case 'keyboard_shortcut':
      return keyboardShortcutLabel(action.code, action.modifiers)
    case 'keys':
      return keysDetail(action.bytes)
    case 'layer':
      return layers[action.index]?.name ?? `Layer ${action.index + 1}`
  }
}
