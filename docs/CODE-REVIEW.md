# Code review — DualSense for Codex (OpenMicro fork)

Date: 2026-10-25
Scope: whole working tree at `93f2b68` plus the uncommitted desktop work (tray, keyboard
shortcuts, clear-input, rumble). Read-only review; no production code changed.

> **Status (later on 2026-10-25):** the six P1 findings below are fixed on
> `codex/desktop-app` in the hardening commit that follows this review: PNG tray assets,
> DualSense Edge product-id selection, connect-timeout retry, cancellable/drained key chords,
> bundle-id activation, and a startup error dialog. The remaining findings still reflect the
> reviewed tree.

> **Follow-up (same day):** a second Codex review found three residual shutdown/cleanup
> ordering issues and a stale HID-provider handle. They are fixed in the follow-up commit:
> an atomic key-release barrier in the chord queue, input stopped before disposal in both
> entry points, a quit gate that defers repeated Quit, and provider abort on a late
> connection. The tray test now states that it validates PNG headers, not native decoding.

## How this review was done, and what it could not verify

Static review of every first-party source file plus targeted probes of the installed
`dualsense-ts` 6.15.x package. The verification gate (`typecheck`/`lint`/`format`/`test`) is
unreliable in this checkout because it lives under iCloud-synced `~/Documents`: many
`node_modules` files carry the `dataless` flag, so Node's internal package reader intermittently
fails with `ERR_INVALID_PACKAGE_CONFIG` and `tsc` stalls materializing type declarations.
`vitest` did complete once the filesystem cooperated: **302 tests, 301 passing, 1 timeout** in an
unrelated `RawHidDriver` dynamic import (it passes in isolation). `tsc` never completed. Treat
the "everything is solid" question as: _statically coherent and runtime-tested, but not freshly
typechecked here._ Run `npm run verify` from a local, non-iCloud checkout before shipping.

## Verdict

This is a thoughtfully designed codebase — well above typical "hack the controller onto an app"
quality. The split into controller HAL → router → dispatch → harness, the pure feedback/state
modules, and the host/client singleton are genuinely good. The current risk is not sloppiness;
it is that **the product surface has grown faster than the abstraction underneath it**. The
desktop companion re-implements the CLI host, the harness contract is keystroke-shaped, and the
GUI integration is a pile of macOS-specific side channels. Those three things are what will hurt
when you try to add DeepSeek, Claude Code, or another shell.

Strong points, concretely:

- `src/router.ts` is a clean input state machine (layer modifier, guard window, flick/rotation
  detector) with injectable time and no I/O.
- `src/state.ts` + `src/feedback.ts` are pure and easy to reason about; the attention-vs-manual
  focus rule (`nextFocus`) is subtle and correctly documented.
- `src/dispatch.ts` keeps effects injected, so the action model is testable without a controller.
- The host/client architecture (first process owns HID, later ones receive keystrokes over SSE)
  is the right shape for multi-session work, and it is the natural foundation for multi-app.
- Config is zod-validated, atomic-written, and never overwrites a broken file.
- Tests are real unit tests with fixture-based driver replay (6 controller fixtures), not smoke.

## Bugs and risks

### P1 — ship blockers

1. **The menu-bar icon is invisible.** `trayIconDataUrl()` returns an SVG data URL
   (`desktop/main/tray.ts:34-35`) which `nativeImage.createFromDataURL()` cannot decode on
   Electron 44 — it yields a 0×0 empty image, and `new Tray(emptyImage)` still succeeds. The app
   has no visible menu-bar presence, which is its primary UI. Ship 18×18/36×36 PNG template
   assets and assert `!image.isEmpty()` in a test (the current tray test only checks the data-URL
   prefix, which is why this escaped).

2. **DualSense Edge is detected but cannot connect.** `DUALSENSE_PIDS` includes the Edge PID
   `0x0df2` (`src/controller/hid-manager.ts:28`), so the Edge selects `DualSenseDriver`, but the
   installed `dualsense-ts` `NodeHIDProvider` enumerates only `vendorId 0x054c / productId
0x0ce6` (`node_hid_provider.js:49`). `connect()` therefore finds no controller, reports an
   error to subscribers nobody listens to, and the driver never emits `connected` or
   `disconnected`. Result: no input, no retry, no log line. Either pin Edge support upstream,
   pass the enumerated device path into the provider with a matching enumeration, or remove
   `0x0df2` from the list so the Edge falls through to the generic HID driver (input only).

3. **A failed controller open is silent and permanent.** `HidManager.attach()` only returns to
   polling after a `disconnected` event (`src/controller/hid-manager.ts:117-127`). For DualSense,
   a failed `provider.connect()` (device busy in another app, permission problem, unplug during
   connect) produces no connection transition, so the app sits forever with no controller, no
   error, and no retry. This is exactly the "connected but cannot open" case in the README. Add a
   connect timeout that emits `disconnected` (and logs at `warn`) when no `connected` arrives
   within ~2 s, or have the driver surface provider errors as `disconnected`.

4. **Queued AppleScript can strand modifiers after pause/quit.** `codex-app.ts` serialises
   chords through a module-level `osascriptQueue` (`:62`, `:135-148`). `releaseAllKeys()` is
   synchronous (`:159-170`), so `setPaused`, `applyConfig` and `stop` (which call `dispose()`)
   release keys _while a queued chord may still run afterward_ — a `key down` that executes after
   the release leaves Ctrl/Option/Shift held machine-wide. Add a generation token checked before
   each queued item (drop stale work), or drain the queue before releasing.

5. **AppleScript still targets `Codex`, while the app is now ChatGPT.** `main.ts:59-80` correctly
   probes for `ChatGPT`, but both AppleScript paths say `tell application "Codex" to activate`
   (`src/harness/codex-app.ts:128`, `:436`). On a ChatGPT-only install the activation fails, the
   subsequent keystrokes go to whatever is frontmost, and the error message blames Accessibility
   permissions. Use `tell application id "com.openai.codex"` (or resolve the installed bundle
   once at startup) and verify the frontmost app before typing.

6. **Startup has no failure path.** `app.whenReady().then(...)` has no `.catch`
   (`desktop/main/main.ts:264-286`). An invalid `~/.openmicro/config.json` (loadConfig throws), a
   missing native prebuild, or a runtime start failure leaves no window, no tray, and no dialog.
   Wrap it, show `dialog.showErrorBox`, and quit or fall back to defaults.

### P2 — correctness and UX

7. **CLI host and desktop companion can silently fight.** Both open the same HID device and bind
   the same port. The desktop falls back to "local-only LEDs" with a log line
   (`runtime.ts:131-145`) but the UI never says so, and whichever process loses the HID device
   looks like "controller not detected". The desktop plan already asks for an explicit conflict
   state; implement detection via `/health` + a HID open failure, and show it prominently.

8. **Touchpad click bypasses bindings.** The runtime intercepts touchpad presses before routing
   whenever `clickPointer` exists (`runtime.ts:206-209`), so the editor's "Touchpad Click" row
   (`src.tsx:31`) and the default `touchpad` binding never run in the desktop app. Route the
   binding first and fall back to a pointer click, or bind a distinct "pointer click" action.

9. **Hook installation can crash startup or lose user config.** `installHooks()` is called
   unguarded (`src/cli.ts:94`). `updateHookFile` handles invalid JSON, but a _valid_ JSON file
   with an unexpected shape (`null`, or `hooks.Stop` not being an array) makes the merge throw
   (`hooks-install.ts:138`), taking the CLI down. The Claude merge also drops any foreign entry
   that does not have a `hooks` array (`:138-148`) — data loss in the user's settings file. Wrap
   installation in try/catch, validate shapes defensively, and preserve unknown entries verbatim.

10. **Hook posts are unauthenticated outbound.** The installed curl posts prompts and session
    metadata to a fixed `127.0.0.1:48762` with no token (`hooks-install.ts:92`). If openmicro is
    not running and another local process holds that port, later Claude/Codex prompts are posted
    to it. Add a per-install secret file (0600) embedded in the hook URL and validated by the
    server; this also lets you reject forged state posts.

11. **Config application is not transactional and has no recovery.** The desktop writes the file
    and then applies it (`main.ts:250-262`); if the runtime apply fails, disk/UI/runtime diverge
    and the retry is rejected as stale. The error tells the user to reload, but the renderer only
    reads config on mount (`src.tsx:61-76`) and has no reload control. Validate → apply in
    memory → write, and add a "Reload from disk" action. Also version the schema: zod strips
    unknown fields, so an older app silently deletes fields written by a newer one.

12. **`refreshController` is a no-op.** It returns `snapshot()` without restarting the HID
    manager (`main.ts:241`). Meanwhile `snapshot()` enumerates node-hid synchronously on every
    poll and state change (`:85-128`), while the tray uses `runtime.isConnected`, so UI and tray
    can disagree. Cache identity from controller events and make refresh a real re-probe.

13. **Pointer helper is a startup/first-touch freeze and a tamper target.** The first touch runs
    `swiftc` synchronously (`codex-app.ts:96-100`) — seconds of frozen UI/input on a machine
    without cached toolchain — writing to a predictable `/tmp/openmicro-pointer-helper-v4` that
    is executed if present. Ship a signed helper in `Resources/`, or compile asynchronously at
    launch with a hash check. Also add `pointerHelper.stdin.on('error')`: writing to a dead
    child's stdin currently raises an unhandled stream error.

14. **The osascript queue is unbounded and slow.** Each keystroke costs a process spawn plus a
    150 ms activation delay (`:436`). D-pad auto-repeat fires every 100 ms, so held navigation
    builds a backlog: the d-pad lags behind the user and stale presses keep arriving. Coalesce
    repeats per key, drop obsolete movement events, and consider a single long-lived Swift helper
    using CGEvent keyboard events (you already have that helper for the pointer) instead of one
    `osascript` per press.

15. **Clipboard paste destroys non-text clipboard contents.** `PASTE_PROMPT_SCRIPT` saves and
    restores only text (`:121-133`); triggering a workflow prompt while an image is on the
    clipboard loses it. It also assumes activation succeeded. Save/restore all pasteboard types
    via `osascript`/`NSPasteboard`, and skip the paste if the target app is not frontmost.

16. **The GUI host mis-attributes foreign Codex sessions.** Header-less hooks are trusted as the
    GUI host when the host harness is `usesPty:false` (`server.ts:236`). A Codex _CLI_ session on
    the same machine (same `~/.codex/hooks.json`) also posts header-less hooks, so its
    executing/waiting state can drive the desktop LEDs and haptics. The Claude-origin sniff is a
    partial guard only. Add a session-ownership marker (e.g. a per-session nonce established when
    the app is launched) or filter by an app-specific field in the payload.

17. **Server hygiene.** `/register`, `/focus` and `/om-hook/*` have no body-size cap
    (`server.ts:47-54`); `pendingInstances` grows if a client registers and never opens its SSE
    stream (`:308-313`); clients never reconnect after a host restart (`client.ts:50-91`). All are
    local-only issues, but cheap to fix.

18. **Desktop lifecycle gaps.** No `app.on('activate')`, so clicking the Dock icon after
    close-to-hide does nothing. `setLoginItemSettings({openAtLogin:true})` runs on every launch,
    including development, and cannot be turned off from the UI. No `did-fail-load`,
    `render-process-gone`, or `unresponsive` handlers, so a renderer crash is a blank window.
    `installHooks()`'s trust notice is discarded (`runtime.ts:130`), so a user whose Codex hooks
    are untrusted never learns why the LEDs stay grey.

19. **Desktop task/project cycling depends on a private SQLite schema.** `scanDesktopThreads()`
    queries `~/.codex/state_5.sqlite` (`codex-app.ts:206-240`) and silently returns `[]` on
    failure, including on Node 22 where `node:sqlite` requires a flag. It works today; it will
    break on a Codex update and it makes "next chat" a no-op with no explanation. Prefer the
    app's own shortcuts/deep links where possible; treat the DB as an optional enhancement and
    log when it is unavailable.

20. **`openmicro/controller` semantics are good but not covered for the failure mode that
    matters**: no test asserts that a failed open eventually retries or emits an error. Add one
    with a fake provider/driver.

### Minor

- `HidManager.pollUntilFound()` constructs a driver just to test presence (and `attach()`
  enumerates again) — harmless but wasteful; reuse the probe result.
- `HidManager.attach()`'s `disconnected` handler stops `this.driver`, which may already be a
  newer driver if a stale driver emits late. Capture the driver in the closure.
- `src/pty.ts` leaves the `resize` listener and stdin listener attached after `dispose()`; fine
  for one process, a leak if reused.
- `doctor` returns on connection failure without `driver.stop()`, leaving the device open
  (`src/doctor.ts:410-418`).
- The Bluetooth output repair (`dualsense-bluetooth-output.ts`) depends on internal byte offsets
  of `dualsense-ts` 6.15.x while `package.json` allows `^6.15.0`. Pin the dependency (or add a
  golden-bytes test that fails on upgrade).
- `src/layers.ts` writes config with default 0644 permissions; prompt text and shortcuts are
  user content. Use 0600.
- `keyboard_shortcut` is accepted by config validation and offered in the editor for every
  harness, but only the codex-app harness implements it; on Claude/Codex it silently does
  nothing (`harness/types.ts` capability gap). Same for `clear_input` on hypothetical new
  harnesses. Make supported actions a declared capability and filter the UI/validation.

## Architecture assessment

**The harness abstraction is the right idea with the wrong centre of gravity.** It is a single
interface (`src/harness/types.ts`) and third-party registration exists, but every method is
shaped around "spawn a terminal and send bytes":

- `resolveAction(...) -> { bytes }` makes keystrokes the universal currency. That is why the
  codex-app harness has to grow tags (`osascript:`, `paste:`, `open:`) and an `execute()` that
  interprets them — a second, implicit protocol hidden inside a string.
- `stateForHookEvent(event, payload)` makes Claude/Codex hook names the universal state source.
  Any target without those hooks has no state, so the LEDs/haptics degrade to "layer colour".
- `installHooks()` writes global files for the _whole_ user account, not for the wrapped session.
- `command`/`buildArgs` assume a CLI child process, and `usesPty:false` is a boolean flag carrying
  an entirely different lifecycle (desktop launch, pointer, AppleScript, permissions).

**The CLI and desktop now duplicate the host.** `src/cli.ts` (565 lines) and
`desktop/main/runtime.ts` (332 lines) both own: HID lifecycle, router, repeat, touchpad, focus
selection, feedback debounce, thinking level, herdr/GUI branching, voice/PTT handling. They have
already drifted (global vs per-session thinking level; announce/status output; herdr present vs
no-op; rumble only in desktop). Every controller feature now needs two implementations, and the
desktop one — the one users will actually run — has no test for `main.ts` at all.

**Naming:** `Harness` collides with DeepSeek Harness (the app you are using right now). Rename the
abstraction (`AgentAdapter`/`AgentTarget`) before publishing an extension API; the confusion will
only grow.

## Extending to DeepSeek, Harness, Claude Code

The honest framing: today you support two _integration styles_, not "any app".

| Style                 | How it works                                       | What you get                                        | Examples                                                            |
| --------------------- | -------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------- |
| Terminal              | pty + lifecycle hooks + keystrokes                 | full state, submit/reject/prompt, multi-session     | Claude Code, Codex CLI, any TUI agent (Gemini CLI, opencode, aider) |
| macOS GUI             | `open`/deep links + osascript + clipboard + SQLite | partial actions, state only if the app shares hooks | Codex inside ChatGPT                                                |
| Web/app without hooks | none yet                                           | nothing                                             | DeepSeek web, ChatGPT chat, Claude Desktop                          |

Recommendation: evolve from "Harness = keystrokes" to **`Target` = `Transport` + `Capabilities`**:

```ts
type Transport =
  | { kind: 'pty'; command: string; args: string[] } // spawn + hooks
  | { kind: 'mac-app'; bundleId: string; adapter: GuiAdapter } // AX / AppleScript
  | { kind: 'rpc'; endpoint: string; protocol: 'acp' | 'jsonrpc' } // structured
  | { kind: 'http'; baseUrl: string; token?: string } // model/API mode

interface Target {
  readonly id: string
  readonly displayName: string
  readonly capabilities: ReadonlySet<Capability> // submit, interrupt, prompt, approve,
  // reject, newChat, effort, voice, status, models
  send(command: Command): Promise<Result> // structured, not bytes
  on(event: 'state' | 'thread' | 'permission', cb): Unsubscribe
  dispose(): Promise<void>
}
```

Then the same controller, router, layers, and feedback drive any target, and the UI can grey out
(or hide) actions a target cannot perform instead of silently no-op'ing.

Concrete paths, in order of value:

1. **Claude Code (already 90% done).** Keep the pty path. Add a `claude` target that uses the
   Agent SDK / `--output-format stream-json` where available, so state is structured instead of
   hook-sniffed. This is the lowest-risk win.

2. **DeepSeek / ChatGPT web / Claude Desktop (no hooks).** Two viable approaches:
   - _Keystroke adapter (fast, fragile):_ a generic macOS "frontmost app" adapter that sends
     recorded shortcuts (`keyboard_shortcut` already exists) and uses Accessibility (AXUIElement)
     to read whether a composer is empty / a response is streaming. No state API, but workable.
   - _Browser extension (robust for web):_ a small extension exposes `submit/stop/new chat` and a
     state event over a local WebSocket; the companion talks to it. This is the cleanest way to
     support ChatGPT/DeepSeek web without building a client.

3. **DeepSeek Harness / other Electron apps.** If the app exposes a local port, CDP, or MCP
   server, prefer that over synthetic keys: attach to the renderer/devtools protocol for input
   and read DOM state. Add a `--remote-debugging-port` launch flag (with user consent) or an
   in-app plugin.

4. **Protocol adapters (the strategic bet).** ACP (Zed's Agent Client Protocol), Codex
   app-server JSON-RPC, Claude Agent SDK, and MCP all give you structured prompt/cancel/approve
   and real state. One `rpc` transport would remove most of the AppleScript/SQLite fragility and
   make the controller usable from any editor that speaks the protocol.

5. **Direct-model mode (optional).** If the goal is "controller → ChatGPT/DeepSeek" rather than
   "controller → their app", a small local orchestrator can call the APIs directly: hold △ to
   record (DualSense mic or system mic) → local STT → prompt → stream to the lightbar/tray. That
   sidesteps every focus/keystroke problem and is the only path that gives you reliable state for
   web-only products. It is a different product (you own the chat UI), so treat it as a separate
   mode, not a replacement.

**Multi-target UX** is the feature that makes this feel like one product: a target registry
(`ChatGPT/Codex`, `Claude Code`, `DeepSeek`, …), auto-select the layer/profile from the frontmost
bundle id, and let PS cycle targets. The host/client split already gives you the routing primitives.

## Quality and process

- **Coverage is lopsided.** 266-ish unit tests, but `src/cli.ts` (the main orchestration, 565
  lines) and `desktop/main/main.ts` have no tests. Extract the host logic into a testable
  `ControllerHost` class used by both entry points; that single refactor fixes both duplication
  and coverage.
- **Add a replay mode.** `openmicro replay test/fixtures/...json --harness claude` (or a
  `--simulate` controller) would let you test end-to-end routing, feedback and dispatch with no
  hardware and no pty. The fixtures and `doctor` already produce exactly the data needed.
- **Contract tests for adapters.** A shared suite every `Target` must pass (submit, reject,
  prompt, state transitions, dispose releases held keys) is the only scalable way to add DeepSeek
  / Harness / Claude adapters without regressing the existing ones.
- **Packaging.** Unsigned ad-hoc app (`osxSign:false`), no notarization, no DMG, arm64-only, no
  auto-update, default Electron icon, and CI never builds the desktop app. Before distributing,
  add signing/notarization, an `.icns`, a packaged-launch smoke test (asar contents + native
  module load), and a macOS packaging job. Keep `node-hid`'s arm64 prebuild pinned.
- **Observability.** Synchronous append-only logging with no rotation or level control
  (`src/logger.ts`), and a `pgrep` every 1.5 s without backoff. Add rotation, `OPENMICRO_LOG_LEVEL`,
  and surface the last error in the UI instead of only the log file.
- **Docs.** `PLAN.md` and `docs/DESKTOP-APP-PLAN.md` are excellent. The README still promises
  "macOS-first, others untested" while CI runs Ubuntu; be explicit about what is supported.

## Suggested order of work

**Now (before adding targets):** tray PNG icon · startup error dialog · connect timeout/retry and
Edge handling · cancel queued AppleScript + release on quit · ChatGPT bundle-id activation ·
touchpad binding routing · `activate`/crash handlers · guard `installHooks()`.

**Next (make it a platform):** extract `ControllerHost` shared by CLI and desktop · rename
`Harness` → `Target` with capabilities · config schema v2 + migration + 0600 + reload · hook auth
token · adapter contract tests + replay mode · signed/notarized package.

**Then (extend):** generic macOS AX adapter + frontmost-app profile switching · browser-extension
bridge for ChatGPT/DeepSeek web · ACP/JSON-RPC transport · optional direct-model mode with
DualSense-mic push-to-talk · adaptive-trigger/haptic permission prompts · battery in tray.
