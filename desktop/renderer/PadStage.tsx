// The pad stage: the controller plus one callout per annotated control.
//
// Both the chips and their leader lines come from `buildCallouts`, which reads
// the same `Layer` the table edits — so rebinding a control moves both the label
// here and the row below in the same render.

import type { ControlId, Layer } from '../../src/layers.js'
import { buildCallouts } from './callouts.js'
import { DualSense } from './pad.js'

/** Chip clicks map back to the control the table should select. */
const CHIP_TO_CONTROL: Record<string, ControlId | null> = {
  l2: 'l2',
  l1: 'l1',
  view: 'view',
  dpad: 'dpad_up',
  l3: 'l3',
  r2: 'r2',
  r1: 'r1',
  menu: 'menu',
  north: 'north',
  circle: 'east',
  square: 'west',
  cross: 'south',
  r3: 'r3',
  touchpad: 'touchpad',
  ps: null,
}

/** Selected control → the pad button to light up. */
const HIGHLIGHT_FOR_CONTROL: Partial<Record<ControlId, string>> = {
  south: 'cross',
  east: 'circle',
  west: 'square',
  north: 'triangle',
  l1: 'l1',
  l2: 'l2',
  r1: 'r1',
  r2: 'r2',
  touchpad: 'touchpad',
}

type Props = {
  layer: Layer | undefined
  workflows: Record<string, string>
  selected: ControlId
  connected: boolean
  onSelect: (control: ControlId) => void
}

export function PadStage({ layer, workflows, selected, connected, onSelect }: Props) {
  const callouts = buildCallouts(layer, workflows)
  const highlightKey = HIGHLIGHT_FOR_CONTROL[selected]
  const highlight = highlightKey ? { [highlightKey]: '#7d92ff' } : {}

  return (
    <div className="stage">
      <svg className="leads" viewBox="0 0 900 540" aria-hidden="true">
        {callouts.map((callout) => {
          const from =
            callout.side === 'left'
              ? { x: 125, y: callout.y }
              : callout.side === 'right'
                ? { x: 775, y: callout.y }
                : callout.side === 'top'
                  ? { x: 450, y: callout.y + 16 }
                  : { x: 450, y: callout.y - 16 }
          return (
            <g key={callout.id} className={callout.bound ? '' : 'muted'}>
              <line x1={from.x} y1={from.y} x2={callout.anchor.x} y2={callout.anchor.y} />
              <circle cx={callout.anchor.x} cy={callout.anchor.y} r={2.2} />
            </g>
          )
        })}
      </svg>

      <div className="pad">
        <DualSense
          lightbar={connected ? '#5b8cff' : '#3a3d48'}
          glow={connected ? 0.9 : 0.25}
          playerLeds={connected ? 0b00011 : 0}
          highlight={highlight}
          width={600}
        >
          <g>
            <circle cx={240} cy={203} r={9} fill="#22242c" stroke="#3a3d48" strokeWidth={1.4} />
            <text
              x={240}
              y={206.5}
              textAnchor="middle"
              fontSize={7}
              fontWeight={700}
              fill="#9aa0ae"
              fontFamily="ui-sans-serif, sans-serif"
            >
              PS
            </text>
          </g>
        </DualSense>
      </div>

      {callouts.map((callout) => {
        const control = CHIP_TO_CONTROL[callout.id]
        const classes = [
          'chip',
          callout.side,
          callout.bound ? '' : 'unbound',
          callout.fixed ? 'fixed' : '',
          control && control === selected ? 'selected' : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <button
            key={callout.id}
            type="button"
            className={classes}
            style={{ top: `${callout.y}px` }}
            disabled={!control}
            onClick={() => control && onSelect(control)}
          >
            {callout.tone && <span className="swatch" style={{ background: callout.tone }} />}
            <span className="b">{callout.button}</span>
            <span className="a">{callout.action}</span>
          </button>
        )
      })}
    </div>
  )
}
