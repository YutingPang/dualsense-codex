import { describe, expect, it } from 'vitest'
import { QuitGate } from '../desktop/main/quit-gate.js'

describe('QuitGate', () => {
  it('defers repeated quits until the drain completes', () => {
    const gate = new QuitGate()

    expect(gate.begin()).toBe('start')
    // A second Cmd+Q while draining must be deferred, not allowed through.
    expect(gate.begin()).toBe('waiting')
    expect(gate.begin()).toBe('waiting')

    gate.complete()
    expect(gate.begin()).toBe('finished')
  })
})
