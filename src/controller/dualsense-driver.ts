// DualSense controller driver — dualsense-ts handles USB + Bluetooth report
// formats. Ported from the v1 extension (haptics/LED/battery dropped).

import { EventEmitter } from 'node:events'
import { Dualsense, DualsenseHID } from 'dualsense-ts'
import type { Axis, Momentary, Trigger } from 'dualsense-ts'
import { logger } from '../logger.js'
import type { ControllerHAL } from './hal.js'
import type { ControllerOutput } from './output.js'
import type { AxisId, ButtonId, ControllerEvent } from '../types.js'
import { OpenMicroDualSenseHIDProvider } from './dualsense-bluetooth-output.js'

export class DualSenseDriver extends EventEmitter implements ControllerHAL {
  readonly controllerType = 'dualsense' as const

  private controller: Dualsense | null = null
  private provider: OpenMicroDualSenseHIDProvider | null = null

  // dualsense-ts runs a 30 Hz output loop internally: it diffs lightbar/LED
  // state against what was last sent and pushes a HID feature report only on
  // change, handling USB vs Bluetooth report framing (and BT checksum)
  // itself. We just set desired state — no manual flush needed.
  get output(): ControllerOutput | undefined {
    const c = this.controller
    if (!c) return undefined
    return {
      setLightbar: (color) => c.lightbar.set(color),
      setPlayerLeds: (bitmask) => c.playerLeds.set(bitmask),
    }
  }

  start(): void {
    try {
      const provider = (this.provider = new OpenMicroDualSenseHIDProvider())
      const c = (this.controller = new Dualsense({ hid: new DualsenseHID(provider) }))

      c.connection.on('change', (input: Momentary) => {
        if (input.state) {
          this.emit('data', {
            kind: 'connected',
            controllerType: 'dualsense',
          } satisfies ControllerEvent)
          logger.info('DualSense connected')
        } else {
          this.emit('data', { kind: 'disconnected' } satisfies ControllerEvent)
          logger.info('DualSense disconnected')
        }
      })
      // 'change' only fires on transitions — announce if already plugged in.
      if (c.connection.state) {
        this.emit('data', {
          kind: 'connected',
          controllerType: 'dualsense',
        } satisfies ControllerEvent)
      }

      this.button(c.cross, 'south')
      this.button(c.circle, 'east')
      this.button(c.square, 'west')
      this.button(c.triangle, 'north')
      this.button(c.dpad.up, 'dpad_up')
      this.button(c.dpad.down, 'dpad_down')
      this.button(c.dpad.left, 'dpad_left')
      this.button(c.dpad.right, 'dpad_right')
      this.button(c.left.bumper, 'l1')
      this.button(c.right.bumper, 'r1')
      this.button(c.left.trigger.button, 'l2')
      this.button(c.right.trigger.button, 'r2')
      this.button(c.left.analog.button, 'l3')
      this.button(c.right.analog.button, 'r3')
      this.button(c.options, 'menu')
      this.button(c.create, 'view')
      c.ps.on('change', (i: Momentary) => {
        this.emit('data', {
          kind: 'system',
          control: 'playstation',
          pressed: i.state,
        } satisfies ControllerEvent)
      })
      // The physical click remains a normal remappable button. A single touch
      // is also exposed separately so GUI harnesses can use it as a trackpad.
      this.button(c.touchpad.button, 'touchpad')
      const emitTouch = (side: 'left' | 'right'): void => {
        const touch = c.touchpad[side]
        this.emit('data', {
          kind: 'touch',
          touch: `touchpad_${side}`,
          active: touch.contact.active,
          x: touch.x.state,
          y: touch.y.state,
        } satisfies ControllerEvent)
      }
      // Listen to the children explicitly. Touch.state is the Touch object
      // itself, so some dualsense-ts versions do not emit a parent `change`
      // when only a nested axis changes (especially with Bluetooth reports).
      c.touchpad.left.x.on('change', () => emitTouch('left'))
      c.touchpad.left.y.on('change', () => emitTouch('left'))
      c.touchpad.left.contact.on('change', () => emitTouch('left'))
      c.touchpad.right.x.on('change', () => emitTouch('right'))
      c.touchpad.right.y.on('change', () => emitTouch('right'))
      c.touchpad.right.contact.on('change', () => emitTouch('right'))

      this.axis(c.left.analog.x, 'left_x')
      // dualsense-ts negates hardware Y (up = +1); re-negate to the project
      // convention (y positive = down) that the router and other drivers use —
      // otherwise stick rotation direction and up/down flicks come out swapped.
      this.axis(c.left.analog.y, 'left_y', true)
      this.axis(c.right.analog.x, 'right_x')
      this.axis(c.right.analog.y, 'right_y', true)

      c.left.trigger.on('change', (t: Trigger) => {
        this.emit('data', {
          kind: 'axis',
          axis: 'l2',
          value: t.magnitude,
        } satisfies ControllerEvent)
      })
      c.right.trigger.on('change', (t: Trigger) => {
        this.emit('data', {
          kind: 'axis',
          axis: 'r2',
          value: t.magnitude,
        } satisfies ControllerEvent)
      })

      logger.info('DualSenseDriver started')
      void provider.connect()
    } catch (err) {
      logger.error('DualSenseDriver start failed', err)
    }
  }

  stop(): void {
    this.controller?.dispose()
    this.provider?.disconnect()
    this.controller = null
    this.provider = null
  }

  private button(input: Momentary, id: ButtonId): void {
    input.on('change', (i: Momentary) => {
      this.emit('data', { kind: 'button', button: id, pressed: i.state } satisfies ControllerEvent)
    })
  }

  private axis(input: Axis, id: AxisId, invert = false): void {
    input.on('change', (a: Axis) => {
      this.emit('data', {
        kind: 'axis',
        axis: id,
        value: invert ? -a.state : a.state,
      } satisfies ControllerEvent)
    })
  }
}
