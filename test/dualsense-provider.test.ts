import { afterEach, describe, expect, it, vi } from 'vitest'
import { HIDProvider, NodeHIDProvider } from 'dualsense-ts'
import { OpenMicroDualSenseHIDProvider } from '../src/controller/dualsense-bluetooth-output.js'

// dualsense-ts enumerates a static product id; the provider mutates it. Restore
// the library default so these cases cannot leak into other test files.
const originalProductId = HIDProvider.productId

afterEach(() => {
  ;(HIDProvider as unknown as { productId: number }).productId = originalProductId
})

describe('OpenMicroDualSenseHIDProvider product selection', () => {
  it('defaults to the standard DualSense product id', () => {
    new OpenMicroDualSenseHIDProvider()
    expect(HIDProvider.productId).toBe(0x0ce6)
  })

  // Regression: the Edge (0x0df2) was selected as a DualSense but invisible to
  // dualsense-ts's fixed-PID enumeration, so it never connected and never
  // retried. Point its static product id at the detected device before connect.
  it('points dualsense-ts at the DualSense Edge product id', () => {
    new OpenMicroDualSenseHIDProvider(0x0df2)
    expect(HIDProvider.productId).toBe(0x0df2)
  })
})

describe('OpenMicroDualSenseHIDProvider abort', () => {
  // Regression: NodeHIDProvider.connect() awaits import('node-hid'), so stop()
  // can run before the device is opened. The discarded provider then opens and
  // claims the controller; abort() must close that late handle.
  it('closes a connection that completes after abort', async () => {
    const originalConnect = NodeHIDProvider.prototype.connect
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const disconnect = vi.spyOn(NodeHIDProvider.prototype, 'disconnect')

    NodeHIDProvider.prototype.connect = async function () {
      await gate
    }
    try {
      const provider = new OpenMicroDualSenseHIDProvider()
      const connecting = provider.connect()
      provider.abort()
      release()
      await connecting

      // One disconnect from abort(), one from connect()'s stale-handle check.
      expect(disconnect).toHaveBeenCalledTimes(2)
    } finally {
      NodeHIDProvider.prototype.connect = originalConnect
      disconnect.mockRestore()
    }
  })
})
