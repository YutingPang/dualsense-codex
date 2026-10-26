# DualSense for Codex — Desktop MVP Implementation Plan

Date: September 14, 2026

This plan captures the product direction agreed in this conversation and the implications of the initial code review. It is intended for implementation in a new task. It does not represent completed implementation or verified hardware behavior.

## Outcome

Build a standalone macOS companion app that lets the user operate the installed Codex desktop app with a PlayStation 5 DualSense controller and change its controls through a graphical interface.

The defining workflow is:

1. Launch the companion app from Finder.
2. Connect the controller and see its status.
3. Select a physical control, choose an action, and apply the change.
4. Return to Codex and use the new binding immediately.
5. Relaunch the companion app and retain the configuration.

Routine customization must no longer require editing source code, editing JSON, or asking Codex to modify bindings.

The user has chosen a desktop application over a local browser interface. Build toward that delivery format directly. The app controls the existing Codex desktop client; it does not implement another chat client or require model API credentials. Use **DualSense for Codex** as a provisional working name without renaming the existing npm package or implying official affiliation.

## Implementation position

Use Electron, React, and TypeScript, retaining the existing Node.js controller and harness code wherever practical. This is an engineering choice based on the current repository, not a requirement to rebuild its internals around a new framework.

The desktop shell adds packaging, menu-bar lifecycle, native-module compatibility, and macOS permission handling. Validate those dependencies before investing in the full editor. A successful development window is insufficient: the packaged app must also load the controller stack and execute supported desktop actions.

Target the current Mac and its detected architecture first. Keep existing CLI entry points functional, but limit the first graphical interface to DualSense and the Codex desktop harness.

## Starting point and review evidence

The repository is `/Users/yutingpang/Documents/DualSense`, an OpenMicro-based TypeScript project. Useful existing boundaries include:

| Area                      | Existing implementation                            | Intended use                                                                               |
| ------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Controller transport      | `src/controller/`                                  | Reuse device discovery, normalized events, and reconnection                                |
| Input interpretation      | `src/router.ts`, `src/keymap.ts`, `src/pointer.ts` | Retain gestures and layers while fixing input lifecycle behavior                           |
| Configuration             | `src/layers.ts`                                    | Evolve the existing persistent configuration rather than creating a second store           |
| Action dispatch           | `src/dispatch.ts`                                  | Share action handling between the CLI and desktop runtime                                  |
| Codex desktop integration | `src/harness/codex-app.ts`                         | Isolate shortcuts, deep links, clipboard operations, and pointer execution                 |
| Startup and orchestration | `src/cli.ts`                                       | Extract reusable lifecycle logic; do not import the executable into the GUI                |
| Local coordination        | `src/server.ts`                                    | Preserve existing host/client and hook behavior; do not mistake it for a configuration API |

The review found several concrete mismatches between the current PoC and a configurable product:

- Desktop touchpad clicks bypass the binding router and always invoke the pointer click handler. An editor cannot promise to remap this control until that path is configuration-driven.
- Layer transitions can consume release events before the caller stops repeating keys or releases a hold-to-talk chord. Disconnect handling also leaves parts of the input lifecycle uncleared.
- Configuration is loaded at startup. Saving a file alone cannot update every runtime consumer consistently.
- Layer indices and some other configuration fields lack the constraints a graphical editor needs. A syntactically valid configuration can still refer to an invalid layer or missing workflow.
- Desktop task cycling depends on an internal Codex SQLite schema and maintains its own cursor. It does not reliably follow tasks selected with the mouse.
- Shortcut dispatch and successful Codex behavior are different observations. The app cannot infer permission approval or reasoning state merely from sending a key.

These are code-review findings. Hardware reproductions and current regression results must be established during implementation. The historical Bluetooth verification in `docs/BASELINE.md` is useful context, not fresh acceptance evidence. Checks launched during review stalled without returning results; do not report the current suite as passing.

At planning time, the working tree contains an existing change in `src/harness/codex-app.ts` adding a Control+Option+P Plan mode mapping, plus an untracked `.pnpm-store/`. Preserve the user's work. Inspect the active package manager and dependency layout before changing installations or lockfiles. Leave the upstream `PLAN.md` intact; this document defines the desktop MVP.

## Product contract

### Desktop lifecycle

The app launches without a terminal, owns one controller runtime, and remains available in the menu bar after its settings window closes. The menu provides Open Settings, Pause/Resume, and Quit.

A second launch opens the existing instance. If another OpenMicro process owns the controller or host port, show a clear conflict and recovery instruction. Do not silently attach the GUI to a terminal-owned runtime or terminate unrelated processes.

The interface must remain usable without a connected controller: configuration can still be edited and saved. Device absence, disconnection, and permission errors are distinct states.

### Configuration experience

Use a clickable DualSense SVG diagram with a matching accessible control list. Display familiar controller names and symbols rather than exposing internal identifiers such as `south` to the user.

The editor contains:

- Connection and runtime status, plus a prominent pause control.
- The controller diagram and the selected control's binding.
- A layer selector, editable layer names and colors, and a separate indication of the active runtime layer.
- An action editor with the appropriate fields for each action.
- Apply, discard pending changes, and restore-defaults controls.
- A compact recent-action view that distinguishes recognized input, dispatch, and execution errors.

A capture mode lets the user press a physical button to select it. Capture must suppress all actual output, including touchpad clicks, movement, and scrolling. Exiting capture clears transient input and waits for held controls to return to neutral before resuming.

While the settings window has focus, suspend Codex-directed actions so controller input cannot repeatedly activate Codex and steal editing focus. Model manual pause, editing suspension, and capture explicitly; leaving the editor must not override a manual pause.

Applying settings updates the running behavior without restarting. Show whether changes are pending, saved and active, or failed. Editing one layer must not silently change which layer is active.

### Actions and controls

Support the existing six-layer model. Expose a useful initial catalog:

- Enter and Escape.
- New task.
- Insert prompt text and select or edit workflow presets.
- Navigation and supported desktop shortcuts.
- Hold-to-talk.
- Increase/decrease reasoning effort, model picker, and Plan mode where their shortcuts have been configured and verified.
- Switch configuration layer.
- Existing task/project cycling, visibly marked experimental when its current limitations remain.

Prompt insertion should preserve the current desktop behavior: fill the composer and let the user submit separately. Label Enter as a focus-dependent send/confirm key, not as verified permission approval.

Allow buttons and stick-direction flicks to be mapped. Preserve existing rotation bindings in configuration, with advanced editing if needed. Hold-to-talk requires paired press/release events and must not be assignable to a one-shot flick.

Make touchpad movement, scrolling, and physical click behavior configurable. Include basic sensitivity settings and enable/disable controls. The pointer path must obey pause and capture just like other actions.

For custom desktop shortcuts, record structured keys and modifiers and translate them through a supported key map. Do not ask users to enter terminal escape sequences. Keep legacy `keys.bytes` configurations readable, but do not accept arbitrary AppleScript or shell text through the interface.

L1 can currently act as a layer modifier or be reclaimed as a normal binding. Explain that tradeoff in the editor and retain UI-based layer switching when the physical modifier is reassigned.

## Engineering design

### One runtime, multiple entry points

Extract the smallest reusable runtime from `src/cli.ts`, with explicit start, pause, resume, stop, configuration-application, and state-subscription operations. Importing the runtime must not launch Codex, install hooks, bind a server, or open HID automatically.

The desktop backend owns configuration, HID, routing, and system input. Initially host asynchronous orchestration in the Electron main process and run native helpers separately. Move controller execution into a utility process if measurements show blocking or stability problems; do not add a daemon or network API solely for architectural symmetry.

Keep the CLI's terminal routing and existing harness boundaries. Avoid expanding this effort into a rewrite of all CLI or herdr behavior.

An appropriate initial layout is:

```text
src/runtime/           Shared orchestration and input lifecycle
src/controller/        Existing controller drivers
src/harness/           Existing adapters and desktop execution
src/config/            Configuration schema, migration, and persistence
desktop/main/          Window, tray, IPC, and runtime host
desktop/preload/       Narrow renderer-facing interface
desktop/renderer/      React editor and controller diagram
desktop/native/        Build-time macOS helper sources, if needed
```

Adjust the layout to the build system rather than moving unrelated code for cosmetic reasons.

### Restricted UI boundary

Enable renderer sandboxing and context isolation, with Node integration disabled. Expose specific operations through preload, such as reading a snapshot, validating/applying configuration, selecting a layer, pausing, entering capture mode, and subscribing to status.

Validate input again in the backend. Do not expose unrestricted filesystem access, command execution, raw IPC, or script execution. Throttle high-frequency axis telemetry for display without delaying the controller's action path.

### Configuration as a transaction

Continue using `~/.openmicro/config.json` as the authoritative store.

Add a schema version and migration for existing unversioned files. Preserve existing bindings and workflows, back up before migration, and leave invalid files untouched. Extend the model for pointer settings and structured desktop shortcuts. Derive TypeScript types and validation from a shared source where practical.

Validate both field values and references: layer indices are integers from 0 to 5, RGB channels are integers from 0 to 255, workflow references exist, and action/trigger combinations are supported.

Applying a revision should:

1. Validate and prepare the complete candidate configuration.
2. Reject stale edits or external-file conflicts rather than silently overwriting them.
3. Suspend dispatch and finish or cancel active input safely.
4. Persist through a unique temporary file and atomic replacement.
5. Install a consistent configuration revision across routing, dispatch, feedback, and the UI.
6. Resume only when the runtime state permits it.

If persistence or installation fails, retain or restore the last usable revision and report the actual disk/runtime state. Do not show success after updating only some consumers. Serialize applications. Automatic filesystem watching is optional; an explicit reload path with conflict handling is sufficient for this version.

### Input lifecycle before remapping

Track ongoing actions by the press that started them. Releasing a button must stop that original action even if the active layer or mapping has changed. Release processing cannot depend on a successful lookup in the new binding table.

Create a shared cleanup path for disconnect, pause, layer changes, configuration application, shutdown, and execution failures. It must stop repeat timers and dictation, release synthetic modifiers, and reset held controls and gesture trackers.

Add cancellation or generation tracking to queued desktop actions. Old shortcuts must not execute after pause or a configuration change. Maintain ordering between deep links and subsequent discrete actions, prevent repeat backlogs, and prioritize cleanup so a slow executor cannot strand keys.

Make clipboard restoration exception-safe and avoid overwriting content the user copied while a paste was in progress. Handle native helper launch failures, exits, and stdin errors explicitly.

### Desktop integration limitations

Keep the Codex adapter as the boundary for app-specific behavior. Preserve read-only access where existing task cycling uses internal storage, surface failures, and do not claim that its cursor matches the current visible task. A working directory is not a complete project identity.

Capabilities that require Codex shortcut assignments need setup instructions and a test state. Dispatch success is not proof of the corresponding app state. Do not invent an external Codex control API or silently modify account-synced shortcuts.

## Delivery sequence

### Milestone 1 — Prove the packaged execution path

Inspect `AGENTS.md`, the working tree, architecture, Node version, dependency links, and package-manager state. Diagnose the stalled checks before repeatedly launching more test processes. Record existing failures separately from new failures.

Create a minimal Electron shell and a local `.app` for the current architecture. Verify controller module loading and enumeration, window/tray lifecycle, app activation, and one controlled desktop shortcut. Coordinate hardware and real-input checks with the user when required.

Validate Electron native-module rebuilding without breaking the standalone CLI's dependencies. Isolate build artifacts if the two runtimes need different native binaries.

Replace runtime compilation of the pointer helper with a build-time compiled resource. The packaged app must not require users to have Xcode or a Swift compiler installed, and must not execute a replaceable binary from a predictable temporary location.

**Exit evidence:** a Finder-launched artifact that loads its native dependencies, handles controller absence, exits cleanly, and has documented Accessibility/Automation requirements for the actual responsible processes.

### Milestone 2 — Make runtime transitions reliable

Extract the reusable runtime and implement desktop single-instance ownership. Fix release handling, disconnect reset, queue cancellation, and the touchpad's configuration bypass.

Write focused regressions for a held key across a layer switch, disconnect during dictation, pause with queued actions, and reconnect with stale input state.

**Exit evidence:** automated lifecycle regressions pass, and the CLI remains operational. The runtime can be paused and stopped without leaving synthetic keys or pending actions active.

### Milestone 3 — Establish the configuration contract

Implement the shared schema, migrations, action catalog, persistence, revision conflict handling, and transactional application. Describe each action's fields, allowed triggers, desktop support, and setup requirements in a catalog the UI can consume.

**Exit evidence:** old configurations load without losing bindings; invalid edits and failed saves preserve the usable configuration; applied edits affect the runtime without a restart.

### Milestone 4 — Complete the editor workflow

Build the diagram, control list, layer editing, action forms, workflow editor, shortcut capture, pointer settings, and apply/discard flows. Connect real controller events to highlights and capture mode. Support editing with no device connected.

**Exit evidence:** the user can bind Square to a custom prompt, apply it, use it in Codex, and retain it after relaunch. Capture and settings interactions do not leak operations into Codex or other applications.

### Milestone 5 — Validate and hand off the app

Finish permission guidance, shortcut setup, error messages, defaults restoration, and tray status. Include desktop sources in type, lint, and formatting checks. Run:

```sh
npm run typecheck && npm run lint && npm run format:check && npm test
```

Build both the CLI and desktop artifact. Test the packaged application on the real controller: Bluetooth reconnect, button release, dictation release, sticks, touchpad, layers, persistence, window closure, and full shutdown. Test USB when available; label unavailable checks as unverified.

Write `docs/DESKTOP-APP-VALIDATION.md` with the environment, automated results, hardware results, permissions, artifact location, and remaining limitations. Distinguish successful event dispatch from the observed Codex response.

**Exit evidence:** a local `.app`, reproducible development/build commands, usage instructions, and a validation record. A development-only window or a mock controller demonstration does not satisfy completion.

## Scope boundaries and release handling

Defer cross-platform packaging, cloud sync, accounts, profile marketplaces, automatic updates, login launch, project-based profile switching, arbitrary controller chords, and multi-step macros. Preserve existing features where feasible without presenting them all as validated GUI capabilities.

Public distribution, signing/notarization, version bumps, npm publication, PR publication, and release tags are outside this implementation request. Deliver a local build without making Apple developer credentials a prerequisite. Document any local launch limitations honestly. If release work is later requested, follow `AGENTS.md`, including its verification gate and release-within-parent-PR convention.

## Instructions for the implementation task

Implement this plan in the existing repository. Start with the packaged execution path, preserve the user's uncommitted work, and make routine implementation decisions without reopening the agreed desktop direction. Keep changes scoped to the companion app and the runtime work it needs.

When progress requires a connected controller, macOS permission, or a particular Codex window state, give the user a concrete test step and continue independent implementation while waiting. Do not replace missing hardware evidence with assumptions or historical fixtures.

At completion, provide the application path, build and launch instructions, verification results, and unresolved limitations. Do not publish a release or overwrite the user's configuration as part of testing.
