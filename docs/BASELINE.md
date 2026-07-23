# Fork baseline

This repository currently tracks `stephenleo/OpenMicro` as its upstream implementation baseline.
The first milestone is to verify the existing controller and harness paths before product-specific
features are added.

## Environment verified on 2026-07-22

- macOS development environment
- Node.js 24.14.0 (the package requires Node.js 22 or newer)
- OpenMicro 1.3.0
- Sony DualSense verified over Bluetooth
  - VID: `0x054c`
  - PID: `0x0ce6`
  - selected driver: `dualsense` via `dualsense-ts`
  - all 17 buttons passed
  - both sticks reached the full `-1..1` range
  - both triggers reached the full `0..1` range
  - lightbar red/blue and player-LED writes passed with the OpenMicro Bluetooth transport fix

## Automated baseline

- TypeScript typecheck: pass
- ESLint: pass
- Production build: pass
- Unit tests: 266 pass when the local-loopback server suite is allowed to bind to `127.0.0.1`
- Package smoke tests: not run in the bundled development runtime because it provides Node.js but
  not the `npm` executable used by those tests

## Hardware verification

The Bluetooth diagnostic fixture is stored at
`test/fixtures/controllers/054c-0ce6-bluetooth.json`.

The controller must be actively connected before starting OpenMicro. On macOS, appearing under
Bluetooth as a remembered device is not sufficient. With the USB cable disconnected, press the PS
button once and verify that `node-hid` can enumerate the controller before running:

```bash
node dist/cli.js doctor
```

Bluetooth input and output are fully functional. The OpenMicro transport wrapper repairs the
Bluetooth output envelope emitted by `dualsense-ts` 6.15.x and sends the required standalone LED
release report when a wireless connection opens. The normal macOS connection light is blue, so a
blue light alone must not be counted as proof that OpenMicro changed the lightbar; the completed
test explicitly changed red to blue through the repaired driver.

After the controller diagnostic passes, validate both harnesses:

```bash
node dist/cli.js codex
node dist/cli.js codex-app
```

For `codex-app`, macOS Accessibility permission is required for generated keystrokes. The original
OpenMicro README documents the optional Codex keyboard-shortcut assignments for reasoning effort
and the model picker.

## Product work after baseline

1. Complete a separate DualSense USB diagnostic fixture for regression coverage.
2. Validate submit, interrupt, new-chat, navigation, workflow prompts, and session feedback against
   Codex CLI and Codex App.
3. Add an explicit approval action that cannot be confused with ordinary Enter/submit input.
4. Design a ChatGPT adapter and push-to-talk flow behind the existing harness abstraction.
5. Add a graphical profile editor only after the action and safety models are stable.
