import { describe, expect, it, vi } from 'vitest'
import { ChordQueue } from '../src/chord-queue.js'

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

describe('ChordQueue', () => {
  it('runs tasks serially instead of interleaving them', async () => {
    const order: string[] = []
    let releaseFirst: () => void = () => {}
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const queue = new ChordQueue()

    queue.run(async () => {
      order.push('first:start')
      await firstGate
      order.push('first:end')
    })
    queue.run(async () => {
      order.push('second')
    })

    await tick()
    expect(order).toEqual(['first:start']) // second waits for the first chord

    releaseFirst()
    await queue.settle()
    expect(order).toEqual(['first:start', 'first:end', 'second'])
  })

  it('drops queued tasks on cancel but waits for the in-flight one', async () => {
    let releaseFirst: () => void = () => {}
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const second = vi.fn()
    const queue = new ChordQueue()

    queue.run(() => firstGate)
    queue.run(async () => {
      second()
    })
    await tick()

    let cancelled = false
    const cancellation = queue.cancel().then(() => {
      cancelled = true
    })
    releaseFirst()

    expect(second).not.toHaveBeenCalled()
    expect(cancelled).toBe(false) // still waiting for the in-flight chord
    await cancellation
    expect(cancelled).toBe(true)
    expect(second).not.toHaveBeenCalled()
  })

  it('accepts new work after cancel so pause/resume stays usable', async () => {
    const queue = new ChordQueue()
    const after = vi.fn()

    await queue.cancel()
    queue.run(async () => {
      after()
    })
    await queue.settle()

    expect(after).toHaveBeenCalledOnce()
  })

  it('keeps running after a task rejects', async () => {
    const queue = new ChordQueue()
    const after = vi.fn()

    queue.run(async () => {
      throw new Error('osascript failed')
    })
    queue.run(async () => {
      after()
    })
    await queue.settle()

    expect(after).toHaveBeenCalledOnce()
  })
})
