# DualSense for Codex — Desktop Validation

Date: September 14, 2026

## Environment

- macOS on Apple Silicon (`arm64`)
- Packaged with Electron 44.3.0 and Electron Forge 7.11.2
- System Node 26.5.0 runs under Rosetta (`x64`)
- Native arm64 packaging was also exercised with Node 24.19.0 (`arm64`)

## Automated evidence

- `npm run typecheck`: passed, including desktop main, preload, and renderer sources.
- `npm run lint`: passed.
- `npm run format:check`: passed after formatting the pre-existing README drift.
- `npm test`: 18 files and 279 tests passed with local-loopback access enabled.
- The Forge package command under native arm64 Node generated an arm64 `.app`.
- The packaged executable is arm64.
- The package contains `node-hid`'s `HID-darwin-arm64/node-napi-v4.node` outside ASAR and loads without an immediate main-process error.
- The packaged process remained running after launch, confirming the menu-bar lifecycle did not immediately exit.

## Implemented desktop surface

- Finder-launchable settings window and menu-bar lifecycle.
- Single-instance behavior.
- Sandboxed, context-isolated renderer with a narrow preload bridge.
- DualSense and generic controller enumeration.
- Manual pause/resume state.
- Six-layer binding editor with action-specific fields.
- Atomic configuration persistence and stale-revision rejection.
- Stronger configuration validation for colors, layer references, and workflows.
- Input fixes for releases across layer switches and touchpad mode transitions.

## Hardware and permission checks still required

The following require an interactive user session and are not claimed as verified:

- Visual inspection of the settings window through macOS accessibility tooling.
- Bluetooth connection and reconnect with a physical DualSense.
- USB connection.
- Accessibility and Automation permission prompts.
- Observed Codex response to shortcuts, prompt insertion, and hold-to-talk.
- Pointer movement, scrolling, and click behavior from the packaged app.

The Rosetta-hosted Node 26 process returned early while cross-packaging arm64
and did not leave an artifact. Packaging must currently run under native arm64
Node; this limitation is documented in the README.

## Artifact

`out/DualSense for Codex-darwin-arm64/DualSense for Codex.app`

This is an unsigned local development build. It has not been notarized or published.
