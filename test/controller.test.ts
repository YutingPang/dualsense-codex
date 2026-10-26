import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const hid = vi.hoisted(() => ({
  close: vi.fn(),
  construct: vi.fn(),
  devices: vi.fn(),
}))

vi.mock('node-hid', () => ({
  devices: hid.devices,
  HID: class extends EventEmitter {
    constructor(path: string) {
      super()
      hid.construct(path)
    }

    close(): void {
      hid.close()
    }
  },
}))

import { HidManager } from '../src/controller/index.js'
import type { ControllerEvent } from '../src/types.js'

class FakeDriver extends EventEmitter<{ data: [ControllerEvent] }> {
  readonly controllerType = 'generic-hid' as const
  start = vi.fn()
  stop = vi.fn()
}

describe('HidManager lifecycle', () => {
  beforeEach(() => {
    vi.useRealTimers()
    hid.close.mockClear()
    hid.construct.mockClear()
    hid.devices.mockReset()
  })

  it('owns one device and releases it across idempotent start/stop cycles', () => {
    hid.devices.mockReturnValue([
      { path: 'test-pad', productId: 1, usage: 5, usagePage: 1, vendorId: 1 },
    ])
    const manager = new HidManager()

    manager.start()
    manager.start()
    expect(hid.construct).toHaveBeenCalledTimes(1)

    manager.stop()
    manager.stop()
    expect(hid.close).toHaveBeenCalledTimes(1)

    manager.start()
    expect(hid.construct).toHaveBeenCalledTimes(2)
    manager.stop()
    expect(hid.close).toHaveBeenCalledTimes(2)
  })

  it('stops reconnect polling', () => {
    vi.useFakeTimers()
    hid.devices.mockReturnValue([])
    const manager = new HidManager()

    manager.start()
    expect(hid.devices).toHaveBeenCalledTimes(1)
    manager.stop()
    vi.advanceTimersByTime(4000)

    expect(hid.devices).toHaveBeenCalledTimes(1)
  })
})

describe('HidManager attach recovery', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('retries a detected controller that never emits connected', () => {
    vi.useFakeTimers()
    try {
      const drivers: FakeDriver[] = []
      const factory = vi.fn(() => {
        const driver = new FakeDriver()
        drivers.push(driver)
        return driver
      })
      const manager = new HidManager(factory)

      manager.start()
      expect(factory).toHaveBeenCalledTimes(1)
      expect(drivers[0]!.start).toHaveBeenCalledOnce()

      vi.advanceTimersByTime(1999)
      expect(drivers[0]!.stop).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      expect(drivers[0]!.stop).toHaveBeenCalledOnce()

      // The reconnect poll is what actually finds the device again.
      vi.advanceTimersByTime(2000)
      expect(factory).toHaveBeenCalledTimes(2)
      expect(drivers[1]!.start).toHaveBeenCalledOnce()

      manager.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels the attach timeout once a controller connects', () => {
    vi.useFakeTimers()
    try {
      const drivers: FakeDriver[] = []
      const manager = new HidManager(() => {
        const driver = new FakeDriver()
        drivers.push(driver)
        return driver
      })

      manager.start()
      drivers[0]!.emit('data', { kind: 'connected', controllerType: 'generic-hid' })
      vi.advanceTimersByTime(10_000)

      expect(drivers[0]!.stop).not.toHaveBeenCalled()
      manager.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores a late disconnect from a driver it already replaced', () => {
    vi.useFakeTimers()
    try {
      const drivers: FakeDriver[] = []
      const manager = new HidManager(() => {
        const driver = new FakeDriver()
        drivers.push(driver)
        return driver
      })

      manager.start()
      vi.advanceTimersByTime(2000) // first attach times out
      vi.advanceTimersByTime(2000) // poll attaches the second driver
      expect(drivers).toHaveLength(2)

      drivers[0]!.emit('data', { kind: 'disconnected' })
      expect(drivers[1]!.stop).not.toHaveBeenCalled()

      manager.stop()
    } finally {
      vi.useRealTimers()
    }
  })
})
