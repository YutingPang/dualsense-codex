import { describe, expect, it } from 'vitest'
import { TouchpadGestureTracker } from '../src/pointer.js'
import type { ControllerEvent } from '../src/types.js'

function touch(
  touchId: 'touchpad_left' | 'touchpad_right',
  active: boolean,
  x: number,
  y: number,
): Extract<ControllerEvent, { kind: 'touch' }> {
  return { kind: 'touch', touch: touchId, active, x, y }
}

describe('TouchpadGestureTracker', () => {
  it('moves the pointer with one left-hand contact', () => {
    const tracker = new TouchpadGestureTracker(1000, 0)
    expect(tracker.update(touch('touchpad_left', true, -0.5, -0.25))).toBeNull()
    expect(tracker.update(touch('touchpad_left', true, -0.4, -0.05))).toMatchObject({
      type: 'move',
      dx: 100,
      dy: 200,
    })
  })

  it('switches to scrolling with two contacts without a jump', () => {
    const tracker = new TouchpadGestureTracker(1000, 0)
    tracker.update(touch('touchpad_left', true, 0, 0))
    expect(tracker.update(touch('touchpad_right', true, 0.4, 0))).toBeNull()
    expect(tracker.update(touch('touchpad_left', true, 0.1, 0.2))).toMatchObject({
      type: 'scroll',
      dx: 50,
      dy: 100,
    })
  })

  it('resets when the second finger lifts before returning to movement', () => {
    const tracker = new TouchpadGestureTracker(1000, 0)
    tracker.update(touch('touchpad_left', true, 0, 0))
    tracker.update(touch('touchpad_right', true, 0.4, 0))
    tracker.update(touch('touchpad_right', false, 0.4, 0))
    expect(tracker.update(touch('touchpad_left', true, 0.8, 0.8))).toBeNull()
  })
})
