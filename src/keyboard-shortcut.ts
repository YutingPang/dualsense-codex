import type { KeyboardModifier } from './harness/types.js'

// macOS virtual key codes used by System Events. The capture UI stores DOM
// KeyboardEvent.code values so key names are stable across keyboard layouts.
const MAC_KEY_CODES: Readonly<Record<string, number>> = {
  KeyA: 0,
  KeyS: 1,
  KeyD: 2,
  KeyF: 3,
  KeyH: 4,
  KeyG: 5,
  KeyZ: 6,
  KeyX: 7,
  KeyC: 8,
  KeyV: 9,
  KeyB: 11,
  KeyQ: 12,
  KeyW: 13,
  KeyE: 14,
  KeyR: 15,
  KeyY: 16,
  KeyT: 17,
  Digit1: 18,
  Digit2: 19,
  Digit3: 20,
  Digit4: 21,
  Digit6: 22,
  Digit5: 23,
  Equal: 24,
  Digit9: 25,
  Digit7: 26,
  Minus: 27,
  Digit8: 28,
  Digit0: 29,
  BracketRight: 30,
  KeyO: 31,
  KeyU: 32,
  BracketLeft: 33,
  KeyI: 34,
  KeyP: 35,
  Enter: 36,
  KeyL: 37,
  KeyJ: 38,
  Quote: 39,
  KeyK: 40,
  Semicolon: 41,
  Backslash: 42,
  Comma: 43,
  Slash: 44,
  KeyN: 45,
  KeyM: 46,
  Period: 47,
  Tab: 48,
  Space: 49,
  Backquote: 50,
  Backspace: 51,
  Delete: 117,
  Escape: 53,
  CapsLock: 57,
  NumpadDecimal: 65,
  NumpadMultiply: 67,
  NumpadAdd: 69,
  NumpadDivide: 75,
  NumpadEnter: 76,
  NumpadSubtract: 78,
  NumpadEqual: 81,
  Numpad0: 82,
  Numpad1: 83,
  Numpad2: 84,
  Numpad3: 85,
  Numpad4: 86,
  Numpad5: 87,
  Numpad6: 88,
  Numpad7: 89,
  Numpad8: 91,
  Numpad9: 92,
  F5: 96,
  F6: 97,
  F7: 98,
  F3: 99,
  F8: 100,
  F9: 101,
  F11: 103,
  F13: 105,
  F16: 106,
  F14: 107,
  F10: 109,
  F12: 111,
  F15: 113,
  Help: 114,
  Home: 115,
  PageUp: 116,
  ForwardDelete: 117,
  F4: 118,
  End: 119,
  F2: 120,
  PageDown: 121,
  F1: 122,
  ArrowLeft: 123,
  ArrowRight: 124,
  ArrowDown: 125,
  ArrowUp: 126,
}

const MODIFIER_LABELS: Record<KeyboardModifier, string> = {
  command: '⌘',
  control: '⌃',
  option: '⌥',
  shift: '⇧',
}

const CODE_LABELS: Readonly<Record<string, string>> = {
  Enter: 'Return',
  Escape: 'Esc',
  Backspace: 'Delete',
  ForwardDelete: 'Fn+Delete',
  Space: 'Space',
  Tab: 'Tab',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Minus: '-',
  Equal: '=',
}

export function macKeyCodeForDomCode(code: string): number | null {
  return MAC_KEY_CODES[code] ?? null
}

export function keyboardCodeLabel(code: string): string {
  return CODE_LABELS[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '')
}

export function keyboardShortcutLabel(
  code: string,
  modifiers: readonly KeyboardModifier[],
): string {
  const order: readonly KeyboardModifier[] = ['command', 'control', 'option', 'shift']
  const uniqueModifiers = new Set(modifiers)
  const prefix = order
    .filter((modifier) => uniqueModifiers.has(modifier))
    .map((m) => MODIFIER_LABELS[m])
  return [...prefix, keyboardCodeLabel(code)].join(' ')
}

export function appleScriptShortcutSteps(
  code: string,
  modifiers: readonly KeyboardModifier[],
): string[] | null {
  const keyCode = macKeyCodeForDomCode(code)
  if (keyCode === null) return null

  const order: readonly KeyboardModifier[] = ['control', 'option', 'shift', 'command']
  const activeModifiers = order.filter((modifier) => modifiers.includes(modifier))
  return [
    ...activeModifiers.map((modifier) => `key down ${modifier}`),
    `key code ${keyCode}`,
    ...activeModifiers.toReversed().map((modifier) => `key up ${modifier}`),
  ]
}
