import { afterEach, describe, expect, it } from 'vitest'
import { HIDProvider } from 'dualsense-ts'
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
