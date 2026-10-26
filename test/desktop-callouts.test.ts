import { describe, expect, it } from 'vitest'
import { buildCallouts, actionLabel } from '../desktop/renderer/callouts.js'
import { DEFAULT_CONFIG } from '../src/layers.js'
import type { Layer } from '../src/layers.js'

const workflows = DEFAULT_CONFIG.workflows

const layer = (bindings: Layer['bindings']): Layer => ({
  name: 'Test',
  color: { r: 255, g: 255, b: 255 },
  bindings,
})

const callout = (calls: ReturnType<typeof buildCallouts>, id: string) =>
  calls.find((entry) => entry.id === id)

describe('pad callouts', () => {
  it('labels actions in human terms, never as action type ids', () => {
    expect(actionLabel({ type: 'accept' }, workflows)).toBe('Submit')
    expect(actionLabel({ type: 'push_to_talk' }, workflows)).toBe('Hold to dictate')
    expect(actionLabel({ type: 'thinking_depth', delta: -1 }, workflows)).toBe('Effort down')
    expect(actionLabel({ type: 'workflow', presetId: 'review-pr' }, workflows)).toBe(
      'Workflow · review-pr',
    )
    expect(actionLabel({ type: 'keys', bytes: '\x1b[A' }, workflows)).toBe('Arrow keys')
    expect(actionLabel({ type: 'keys', bytes: '\x15' }, workflows)).toBe('Clear input')
    expect(actionLabel({ type: 'keys', bytes: '\x1b[109;6u' }, workflows)).toBe('Model picker')
    expect(actionLabel(undefined, workflows)).toBe('Unassigned')
  })

  it('updates the callout when its control is rebound', () => {
    const before = callout(buildCallouts(DEFAULT_CONFIG.layers[0], workflows), 'cross')
    expect(before?.action).toBe('Submit')

    const after = callout(buildCallouts(layer({ south: { type: 'new_chat' } }), workflows), 'cross')
    expect(after?.action).toBe('New task')
  })

  it('greys out a callout when the binding is cleared', () => {
    const cleared = callout(buildCallouts(layer({}), workflows), 'cross')
    expect(cleared?.action).toBe('Unassigned')
    expect(cleared?.bound).toBe(false)
  })

  it('summarises the d-pad cluster and reports a mixed layer', () => {
    const arrows = layer({
      dpad_up: { type: 'keys', bytes: '\x1b[A' },
      dpad_down: { type: 'keys', bytes: '\x1b[B' },
      dpad_left: { type: 'keys', bytes: '\x1b[D' },
      dpad_right: { type: 'keys', bytes: '\x1b[C' },
    })
    expect(callout(buildCallouts(arrows, workflows), 'dpad')?.action).toBe('Arrow keys')

    const mixed = layer({
      dpad_up: { type: 'accept' },
      dpad_down: { type: 'keys', bytes: '\x1b[B' },
    })
    expect(callout(buildCallouts(mixed, workflows), 'dpad')?.action).toBe('Mixed bindings · 2/4')

    // One direction bound is a partial cluster, not a fully bound one.
    expect(
      callout(buildCallouts(layer({ dpad_up: { type: 'accept' } }), workflows), 'dpad')?.action,
    ).toBe('Submit · 1/4')
  })

  it('keeps wrapper-owned controls bound whatever the config says', () => {
    const touched = buildCallouts(layer({ touchpad: { type: 'accept' } }), workflows)
    expect(callout(touched, 'touchpad')).toMatchObject({
      action: 'Move pointer · click',
      fixed: true,
      bound: true,
    })
  })

  it('keeps every callout anchor inside the stage', () => {
    for (const entry of buildCallouts(DEFAULT_CONFIG.layers[0], workflows)) {
      expect(entry.anchor.x).toBeGreaterThan(0)
      expect(entry.anchor.x).toBeLessThan(1040)
      expect(entry.anchor.y).toBeGreaterThan(0)
      expect(entry.anchor.y).toBeLessThan(540)
    }
  })
})
