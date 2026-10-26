import { describe, expect, it, vi } from 'vitest'
import { ShutdownCoordinator } from '../src/shutdown.js'

describe('ShutdownCoordinator', () => {
  it('stops input before awaiting dispose, then finishes once', async () => {
    const order: string[] = []
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const coordinator = new ShutdownCoordinator({
      stopInput: () => order.push('stop-input'),
      dispose: async () => {
        order.push('dispose:start')
        await gate
        order.push('dispose:end')
      },
      finish: () => order.push('finish'),
    })

    const first = coordinator.run()
    // stopInput is synchronous and dispose is already in flight.
    expect(order).toEqual(['stop-input', 'dispose:start'])
    expect(coordinator.run()).toBe(first) // memoised

    release()
    await first
    expect(order).toEqual(['stop-input', 'dispose:start', 'dispose:end', 'finish'])
  })

  it('still finishes when dispose rejects', async () => {
    const finish = vi.fn()
    const coordinator = new ShutdownCoordinator({
      stopInput: () => {},
      dispose: async () => {
        throw new Error('drain failed')
      },
      finish,
    })

    await expect(coordinator.run()).rejects.toThrow('drain failed')
    expect(finish).toHaveBeenCalledOnce()
  })
})
