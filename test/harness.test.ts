import { beforeEach, describe, expect, it, vi } from 'vitest'

const execFile = vi.hoisted(() => vi.fn())
const execFileSync = vi.hoisted(() => vi.fn())
const spawn = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFile, execFileSync, spawn }))

import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { claudeHarness } from '../src/harness/claude.js'
import { codexHarness } from '../src/harness/codex.js'
import {
  codexAppHarness,
  cycleProject,
  cycleThread,
  scanDesktopThreads,
} from '../src/harness/codex-app.js'
import { harnessFor, registerHarness } from '../src/harness/index.js'
import type { Harness } from '../src/harness/types.js'

describe('registry', () => {
  it('resolves the built-in harnesses', () => {
    expect(harnessFor('claude').kind).toBe('claude')
    expect(harnessFor('codex').kind).toBe('codex')
    expect(harnessFor('codex-app').kind).toBe('codex-app')
  })

  it('throws a clear error listing known kinds on unknown lookup', () => {
    expect(() => harnessFor('gpt5')).toThrowError(/unknown harness 'gpt5'.*claude.*codex/s)
  })

  it('registers a third-party harness under its own kind', () => {
    const gemini: Harness = { ...codexHarness, kind: 'gemini' }
    registerHarness(gemini)
    expect(harnessFor('gemini')).toBe(gemini)
  })
})

describe('claude harness', () => {
  const ctx = { thinkingLevel: 2 }

  it('maps hook events to states', () => {
    expect(claudeHarness.stateForHookEvent('SessionStart', {})).toBe('idle')
    expect(claudeHarness.stateForHookEvent('UserPromptSubmit', {})).toBe('executing')
    expect(claudeHarness.stateForHookEvent('PostToolUse', {})).toBe('executing')
    expect(claudeHarness.stateForHookEvent('Stop', {})).toBe('complete')
    expect(claudeHarness.stateForHookEvent('PreToolUse', {})).toBe('waiting')
    expect(claudeHarness.stateForHookEvent('Notification', { message: 'ready' })).toBe('waiting')
    expect(claudeHarness.stateForHookEvent('SessionEnd', {})).toBeNull()
    expect(claudeHarness.stateForHookEvent('WeirdFutureEvent', {})).toBeNull()
  })

  it('sniffs an error notification best-effort', () => {
    expect(claudeHarness.stateForHookEvent('Notification', { message: 'Build failed' })).toBe(
      'error',
    )
    expect(claudeHarness.stateForHookEvent('Notification', 'not an object')).toBe('waiting')
  })

  it('resolves the verified keybindings', () => {
    expect(claudeHarness.resolveAction({ type: 'accept' }, ctx)).toEqual({ bytes: '\r' })
    expect(claudeHarness.resolveAction({ type: 'reject' }, ctx)).toEqual({ bytes: '\x1b' })
    expect(claudeHarness.resolveAction({ type: 'push_to_talk' }, ctx)).toEqual({ bytes: ' ' })
    expect(claudeHarness.resolveAction({ type: 'new_chat' }, ctx)).toEqual({ bytes: '/clear\r' })
    expect(claudeHarness.resolveAction({ type: 'prompt', text: 'hi' }, ctx)).toEqual({
      bytes: 'hi\r',
    })
    expect(claudeHarness.resolveAction({ type: 'keys', bytes: '\x1b[A' }, ctx)).toEqual({
      bytes: '\x1b[A',
    })
  })

  it('steps thinking depth through the effort levels and clamps', () => {
    // level 2 (high) + 1 → 3 (xhigh)
    expect(
      claudeHarness.resolveAction({ type: 'thinking_depth', delta: 1 }, { thinkingLevel: 2 }),
    ).toEqual({
      bytes: '/effort xhigh\r',
      thinkingLevel: 3,
    })
    // clamp at top (max = index 4)
    expect(
      claudeHarness.resolveAction({ type: 'thinking_depth', delta: 1 }, { thinkingLevel: 4 }),
    ).toEqual({
      bytes: '/effort max\r',
      thinkingLevel: 4,
    })
    // clamp at bottom (low = index 0)
    expect(
      claudeHarness.resolveAction({ type: 'thinking_depth', delta: -1 }, { thinkingLevel: 0 }),
    ).toEqual({
      bytes: '/effort low\r',
      thinkingLevel: 0,
    })
  })

  it('returns null for actions that never reach a harness', () => {
    expect(claudeHarness.resolveAction({ type: 'workflow', presetId: 'x' }, ctx)).toBeNull()
    expect(claudeHarness.resolveAction({ type: 'focus_session', index: 0 }, ctx)).toBeNull()
    expect(claudeHarness.resolveAction({ type: 'layer', index: 1 }, ctx)).toBeNull()
  })
})

describe('codex harness', () => {
  const ctx = { thinkingLevel: 1 }

  it('maps hook events to states', () => {
    expect(codexHarness.stateForHookEvent('UserPromptSubmit', {})).toBe('executing')
    expect(codexHarness.stateForHookEvent('PostToolUse', {})).toBe('executing')
    expect(codexHarness.stateForHookEvent('PermissionRequest', {})).toBe('waiting')
    expect(codexHarness.stateForHookEvent('Stop', {})).toBe('complete')
    expect(codexHarness.stateForHookEvent('SessionEnd', {})).toBeNull()
    expect(codexHarness.stateForHookEvent('Notification', {})).toBeNull()
  })

  it('resolves verified keybindings and returns null for documented gaps', () => {
    expect(codexHarness.resolveAction({ type: 'accept' }, ctx)).toEqual({ bytes: '\r' })
    expect(codexHarness.resolveAction({ type: 'reject' }, ctx)).toEqual({ bytes: '\x1b' })
    expect(codexHarness.resolveAction({ type: 'new_chat' }, ctx)).toEqual({ bytes: '/new\r' })
    expect(codexHarness.resolveAction({ type: 'prompt', text: 'hi' }, ctx)).toEqual({
      bytes: 'hi\r',
    })
    expect(codexHarness.resolveAction({ type: 'keys', bytes: '\x1b[B' }, ctx)).toEqual({
      bytes: '\x1b[B',
    })
    // documented gaps — no voice, no deterministic effort keystroke
    expect(codexHarness.resolveAction({ type: 'push_to_talk' }, ctx)).toBeNull()
    expect(codexHarness.resolveAction({ type: 'thinking_depth', delta: 1 }, ctx)).toBeNull()
  })
})

describe('codex-app harness', () => {
  const ctx = { thinkingLevel: 1 }

  beforeEach(() => {
    execFile.mockReset()
    execFileSync.mockReset()
    // Osascript runs are queued; the callback must fire or the queue jams and
    // later tests silently never reach execFile.
    execFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1]
      if (typeof cb === 'function') cb(null, '', '')
    })
  })

  it('is a GUI harness (no pty)', () => {
    expect(codexAppHarness.usesPty).toBe(false)
    expect(codexAppHarness.buildArgs([])).toEqual(['-b', 'com.openai.codex'])
  })

  it('resolves actions to tagged open/osascript bytes', () => {
    expect(codexAppHarness.resolveAction({ type: 'accept' }, ctx)).toEqual({
      bytes: 'osascript:keystroke return',
    })
    // push_to_talk emulates the app's hold-to-dictate chord: the button-down
    // edge holds the keys, the button-up edge releases them.
    expect(codexAppHarness.resolveAction({ type: 'push_to_talk', pressed: true }, ctx)).toEqual({
      bytes: 'osascript:key down control\nkey down shift\nkey down "d"',
    })
    expect(codexAppHarness.resolveAction({ type: 'push_to_talk', pressed: false }, ctx)).toEqual({
      bytes: 'osascript:key up "d"\nkey up shift\nkey up control',
    })
    expect(codexAppHarness.resolveAction({ type: 'new_chat' }, ctx)).toEqual({
      bytes: 'open:codex://threads/new',
    })
  })

  it('encodes prompt text for pasting into the current composer', () => {
    const text = '修复 a & b?'
    expect(codexAppHarness.resolveAction({ type: 'prompt', text }, ctx)).toEqual({
      bytes: 'paste:' + Buffer.from(text).toString('base64'),
    })
  })

  it('maps reject to Escape and known key bytes to System Events equivalents', () => {
    expect(codexAppHarness.resolveAction({ type: 'reject' }, ctx)).toEqual({
      bytes: 'osascript:key code 53',
    })
    expect(codexAppHarness.resolveAction({ type: 'keys', bytes: '\x1b[A' }, ctx)).toEqual({
      bytes: 'osascript:key code 126',
    })
    expect(codexAppHarness.resolveAction({ type: 'keys', bytes: '\x1b[5~' }, ctx)).toEqual({
      bytes: 'osascript:key code 116',
    })
    expect(codexAppHarness.resolveAction({ type: 'keys', bytes: '\x1b[6~' }, ctx)).toEqual({
      bytes: 'osascript:key code 121',
    })
    expect(codexAppHarness.resolveAction({ type: 'keys', bytes: '\x1b[91;10u' }, ctx)).toEqual({
      bytes:
        'osascript:key down command\nkey down shift\nkey code 33\nkey up shift\nkey up command',
    })
    expect(codexAppHarness.resolveAction({ type: 'keys', bytes: '\x1b[93;10u' }, ctx)).toEqual({
      bytes:
        'osascript:key down command\nkey down shift\nkey code 30\nkey up shift\nkey up command',
    })
    expect(codexAppHarness.resolveAction({ type: 'keys', bytes: '\x15' }, ctx)).toEqual({
      bytes: 'osascript:keystroke "a" using command down\nkey code 51',
    })
    // Ctrl+Shift+M (CSI-u) → the app's user-assigned "Open model picker" chord.
    expect(codexAppHarness.resolveAction({ type: 'keys', bytes: '\x1b[109;6u' }, ctx)).toEqual({
      bytes:
        'osascript:key down control\nkey down shift\nkey code 46\nkey up shift\nkey up control',
    })
  })

  it('maps thinking_depth to the user-assigned effort shortcut chords', () => {
    expect(codexAppHarness.resolveAction({ type: 'thinking_depth', delta: 1 }, ctx)).toEqual({
      bytes:
        'osascript:key down control\nkey down option\nkey code 24\nkey up option\nkey up control',
    })
    expect(codexAppHarness.resolveAction({ type: 'thinking_depth', delta: -1 }, ctx)).toEqual({
      bytes:
        'osascript:key down control\nkey down option\nkey code 27\nkey up option\nkey up control',
    })
  })

  it('returns null for documented gaps and core-only actions', () => {
    expect(codexAppHarness.resolveAction({ type: 'keys', bytes: '\x07' }, ctx)).toBeNull()
    expect(codexAppHarness.resolveAction({ type: 'workflow', presetId: 'x' }, ctx)).toBeNull()
    expect(codexAppHarness.resolveAction({ type: 'layer', index: 1 }, ctx)).toBeNull()
  })

  it('scans visible threads from the catalog db in stable id order', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'om-state-'))
    const dbPath = path.join(dir, 'state.sqlite')
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
      DatabaseSync: new (path: string) => {
        exec(sql: string): void
        close(): void
      }
    }
    const db = new DatabaseSync(dbPath)
    db.exec(`CREATE TABLE threads (
      id TEXT PRIMARY KEY, cwd TEXT, source TEXT, archived INTEGER,
      updated_at INTEGER, recency_at_ms INTEGER
    );
    INSERT INTO threads VALUES
      ('a', '/p1', 'cli', 0, 1, 1000),
      ('b', '/p2', 'vscode', 0, 2, 2000),
      ('c', '/p1', 'cli', 1, 3, 3000),
      ('d', '/p1', '{"subagent":"review"}', 0, 4, 4000),
      ('e', '/p1', 'cli', 0, 5, NULL);`)
    db.close()
    const threads = scanDesktopThreads(dbPath)
    expect(threads.map((t) => t.id)).toEqual(['e', 'b', 'a']) // archived + subagent excluded
    expect(threads.find((t) => t.id === 'e')?.mtime).toBe(5000) // recency falls back to updated_at
    expect(scanDesktopThreads(path.join(dir, 'missing.sqlite'))).toEqual([])
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('cycles threads within a project with wrap-around', () => {
    const threads = [
      { id: 't3', cwd: '/p1', mtime: 3 },
      { id: 'other', cwd: '/p2', mtime: 2 },
      { id: 't1', cwd: '/p1', mtime: 1 },
    ]
    const cur = { threadId: null, cwd: null }
    expect(cycleThread(threads, cur)?.id).toBe('t1')
    expect(cycleThread(threads, cur)?.id).toBe('t3') // wraps, never leaves /p1
  })

  it('starts from the most active thread instead of the newest-created project', () => {
    const threads = [
      { id: 'new-singleton', cwd: '/new', mtime: 2 },
      { id: 'active', cwd: '/current', mtime: 4 },
      { id: 'next', cwd: '/current', mtime: 3 },
    ]
    const cur = { threadId: null, cwd: null }

    expect(cycleThread(threads, cur)?.id).toBe('next')
    expect(cycleThread(threads, cur)?.id).toBe('active')
  })

  it('cycles projects by recency with wrap-around, landing on the newest thread', () => {
    const threads = [
      { id: 'a2', cwd: '/pa', mtime: 4 },
      { id: 'b1', cwd: '/pb', mtime: 3 },
      { id: 'a1', cwd: '/pa', mtime: 2 },
    ]
    const cur = { threadId: null, cwd: null }
    expect(cycleProject(threads, cur)?.id).toBe('b1') // cold start: switch away from most-active /pa
    expect(cycleProject(threads, cur)?.id).toBe('a2') // wraps back to /pa's newest
    expect(cur).toEqual({ threadId: 'a2', cwd: '/pa' })
  })

  it('returns to the most active project when the cursor sits on an unknown cwd', () => {
    const threads = [
      { id: 'a1', cwd: '/pa', mtime: 3 },
      { id: 'b1', cwd: '/pb', mtime: 2 },
    ]
    const cur = { threadId: 'x', cwd: '/gone' }
    expect(cycleProject(threads, cur)?.cwd).toBe('/pa')
  })

  it('delegates hook-event mapping to the codex harness', () => {
    for (const event of ['UserPromptSubmit', 'PermissionRequest', 'PostToolUse', 'Stop']) {
      expect(codexAppHarness.stateForHookEvent(event, {})).toBe(
        codexHarness.stateForHookEvent(event, {}),
      )
    }
    expect(codexAppHarness.stateForHookEvent('WeirdFutureEvent', {})).toBeNull()
  })

  it('executes open: bytes via execFile with an arg array', () => {
    codexAppHarness.execute?.('open:codex://new')
    expect(execFile).toHaveBeenCalledWith('open', ['codex://new'], expect.any(Function))
  })

  it('pastes prompts into the current composer and preserves Unicode', async () => {
    const text = '检查当前改动，并修复 a & b?'
    codexAppHarness.execute?.('paste:' + Buffer.from(text).toString('base64'))
    await new Promise((resolve) => setImmediate(resolve))
    expect(execFile).toHaveBeenCalledWith(
      'osascript',
      expect.arrayContaining(['--', text]),
      { timeout: 5000 },
      expect.any(Function),
    )
    const args = execFile.mock.calls[0]![1] as string[]
    expect(args.join('\n')).toContain('keystroke "v" using command down')
    expect(args[1]).not.toContain(text) // text is argv, never interpolated into AppleScript source
  })

  it('executes osascript: bytes as activate + System Events keystroke', async () => {
    codexAppHarness.execute?.('osascript:keystroke return')
    await new Promise((resolve) => setImmediate(resolve)) // queued behind a microtask
    expect(execFile).toHaveBeenCalledWith(
      'osascript',
      [
        '-e',
        'tell application id "com.openai.codex" to activate',
        '-e',
        'delay 0.15',
        '-e',
        'tell application "System Events" to keystroke return',
      ],
      { timeout: 5000 },
      expect.any(Function),
    )
  })

  it('serializes concurrent osascript chords instead of interleaving them', async () => {
    codexAppHarness.execute?.('osascript:key down control\nkey up control')
    codexAppHarness.execute?.('osascript:keystroke return')
    await new Promise((resolve) => setImmediate(resolve))
    expect(execFile).toHaveBeenCalledTimes(2)
    // Second chord runs strictly after the first one's callback fired.
    const firstArgs = execFile.mock.calls[0]![1] as string[]
    expect(firstArgs).toContain('tell application "System Events" to key down control')
  })

  it('releases all held keys when a key-down chord fails', async () => {
    execFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1]
      if (typeof cb === 'function') cb(new Error('timeout'), '', '')
    })
    codexAppHarness.execute?.('osascript:key down control\nkey code 24\nkey up control')
    await new Promise((resolve) => setImmediate(resolve))
    expect(execFileSync).toHaveBeenCalledWith(
      'osascript',
      expect.arrayContaining(['tell application "System Events" to key up control']),
      { timeout: 3000 },
    )
  })

  it('releases all held keys on dispose', () => {
    codexAppHarness.dispose?.()
    expect(execFileSync).toHaveBeenCalledWith(
      'osascript',
      expect.arrayContaining([
        'tell application "System Events" to key up control',
        'tell application "System Events" to key up shift',
        'tell application "System Events" to key up "d"',
      ]),
      { timeout: 3000 },
    )
  })

  it('ignores untagged bytes', () => {
    codexAppHarness.execute?.('\x03')
    expect(execFile).not.toHaveBeenCalled()
  })

  it('survives a pointer helper that fails to spawn', () => {
    const stdinHandlers = new Map<string, (arg?: unknown) => void>()
    const stdin = {
      destroyed: false,
      writable: true,
      write: vi.fn(),
      on: vi.fn((event: string, handler: (arg?: unknown) => void) => {
        stdinHandlers.set(event, handler)
      }),
    }
    const childHandlers = new Map<string, (arg?: unknown) => void>()
    spawn.mockReturnValue({
      stdin,
      stderr: { on: vi.fn() },
      killed: false,
      kill: vi.fn(),
      on: vi.fn((event: string, handler: (arg?: unknown) => void) => {
        childHandlers.set(event, handler)
      }),
    })
    codexAppHarness.movePointer?.(1, 2)
    expect(childHandlers.has('error')).toBe(true)
    expect(stdinHandlers.has('error')).toBe(true)
    // An unhandled 'error' event throws; the handler must contain it instead.
    expect(() => childHandlers.get('error')?.(new Error('spawn ENOENT'))).not.toThrow()
    codexAppHarness.movePointer?.(3, 4)
    expect(stdin.write).toHaveBeenCalledTimes(1)
  })

  it('restores the clipboard when the paste subprocess is killed', async () => {
    let reads = 0
    execFileSync.mockImplementation((command: unknown) => {
      if (command !== '/usr/bin/pbpaste') return undefined
      reads += 1
      // First read is the snapshot; the killed paste left the prompt behind.
      return reads === 1 ? 'earlier clipboard' : 'draft prompt'
    })
    execFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1]
      if (typeof cb === 'function') cb(new Error('ETIMEDOUT'), '', '')
    })
    codexAppHarness.execute?.('paste:' + Buffer.from('draft prompt').toString('base64'))
    await new Promise((resolve) => setImmediate(resolve))
    expect(execFileSync).toHaveBeenCalledWith('/usr/bin/pbcopy', {
      input: 'earlier clipboard',
      timeout: 1000,
    })
  })

  it('leaves a clipboard the user replaced during the paste alone', async () => {
    let reads = 0
    execFileSync.mockImplementation((command: unknown) => {
      if (command !== '/usr/bin/pbpaste') return undefined
      reads += 1
      return reads === 1 ? 'earlier clipboard' : 'copied while the paste was running'
    })
    execFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1]
      if (typeof cb === 'function') cb(new Error('ETIMEDOUT'), '', '')
    })
    codexAppHarness.execute?.('paste:' + Buffer.from('draft prompt').toString('base64'))
    await new Promise((resolve) => setImmediate(resolve))
    expect(execFileSync).not.toHaveBeenCalledWith('/usr/bin/pbcopy', expect.anything())
  })
})
