import type { ControllerEvent } from './types.js'

export interface TouchpadGesture {
  type: 'move' | 'scroll'
  dx: number
  dy: number
}

type Touch = Extract<ControllerEvent, { kind: 'touch' }>

/** Converts one/two absolute touch contacts into relative pointer gestures. */
export class TouchpadGestureTracker {
  private readonly touches = new Map<Touch['touch'], Touch>()
  private last: { mode: 'move' | 'scroll'; x: number; y: number } | null = null

  constructor(
    private readonly sensitivity = 1100,
    private readonly deadzone = 0.0025,
  ) {}

  update(event: Touch): TouchpadGesture | null {
    this.touches.set(event.touch, event)
    const left = this.touches.get('touchpad_left')
    const right = this.touches.get('touchpad_right')
    const mode = left?.active && right?.active ? 'scroll' : left?.active ? 'move' : null
    if (!mode || !left) {
      this.last = null
      return null
    }
    const x = mode === 'scroll' ? (left.x + right!.x) / 2 : left.x
    const y = mode === 'scroll' ? (left.y + right!.y) / 2 : left.y
    if (!this.last) {
      this.last = { mode, x, y }
      return null
    }
    if (this.last.mode !== mode) {
      // Require a fresh event after a one/two-finger transition. Reusing the
      // other contact's old coordinate creates a large pointer jump.
      this.last = mode === 'scroll' ? { mode, x, y } : null
      return null
    }
    const rawDx = x - this.last.x
    const rawDy = y - this.last.y
    this.last = { mode, x, y }
    if (Math.hypot(rawDx, rawDy) < this.deadzone) return null
    return {
      type: mode,
      dx: Math.round(rawDx * this.sensitivity * 1_000_000) / 1_000_000,
      dy: Math.round(rawDy * this.sensitivity * 1_000_000) / 1_000_000,
    }
  }

  reset(): void {
    this.touches.clear()
    this.last = null
  }
}
