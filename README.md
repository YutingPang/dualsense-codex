# DualSense for Codex

A macOS menu-bar companion that turns a Sony DualSense into a physical control surface for the
ChatGPT/Codex desktop app. The terminal CLI it grew out of ships in the same repo.

Built on [OpenMicro](https://github.com/stephenleo/OpenMicro), which provides the controller layer,
the harness abstraction, and the CLI. This fork adds the desktop companion, DualSense Bluetooth
output, and the touchpad pointer.

> **Status: working, not distributed.** Runs from source on Apple Silicon macOS and drives the
> Codex desktop app. Verified on a DualSense over USB and Bluetooth. Not notarized, not packaged
> for release, and not tested on Intel Macs. Other controllers are input-only.

## What it does

- **Drives the desktop app, not a terminal.** Submit, dismiss, dictate, start a task, and switch
  layers while the ChatGPT/Codex window has focus.
- **Lives in the menu bar.** Shows controller and app state, starts at login, and keeps listening
  while ChatGPT is closed. The PlayStation button brings the app forward.
- **Six layers, edited visually.** Pick a control, pick an action, record a shortcut. The editor
  writes `~/.openmicro/config.json` only when you press Apply, and refuses to overwrite a file
  that changed underneath it.
- **Status on the pad.** The lightbar follows the focused session — blue executing, amber
  waiting, green stopped — and rumble marks the transitions worth noticing. There is no red
  state in practice: Codex exposes no error event to map one from.
- **Terminal workflow included.** The OpenMicro CLI still drives Claude Code and Codex CLI from
  the same controller, with multi-session focus and lightbar status.

## Quick start

Requires macOS on Apple Silicon, Node.js 22 or newer, and a DualSense (USB or Bluetooth).

```sh
git clone https://github.com/YutingPang/dualsense-codex.git
cd dualsense-codex
npm install

npm run desktop:start     # run the companion from source
npm run desktop:package   # build out/DualSense for Codex-darwin-arm64/DualSense for Codex.app
```

Use a native arm64 Node. Under Rosetta the CLI starts, but the arm64 package will not build.

> `npm i -g openmicro` installs **upstream** OpenMicro, not this companion. The desktop app is not
> published to npm.

macOS asks for **Accessibility** permission (and **Automation** for System Events) the first time
the companion synthesises a keystroke. Grant it to **DualSense for Codex**. Without it the
shortcut never reaches the app; the companion prints the failing command and a permission hint
rather than failing silently.

## One-time setup in the ChatGPT/Codex app

Two chords are user-assigned inside the app, and OpenMicro cannot set them for you. Open
**Settings → Keyboard shortcuts**:

- **Dictation → `⌃⇧D`** (Control+Shift+D) so △ holds push-to-talk. The chord is fixed in the
  harness — assigning some other shortcut inside the app will not move it.
- **Increase / Decrease reasoning effort → `⌃⌥=` / `⌃⌥-`** so right-stick flicks step the
  reasoning level. These avoid the app's ⌘ `+`/`-` zoom bindings on the same keys.
- Optional: **Model picker → `⌃⇧M`**, so R3 opens it and you can watch the level change.

The app's own _Decrease_ shortcut stops one step short of the lowest level, even when pressed
physically — use the model picker for that one.

## Default controls

![Default DualSense bindings](assets/default-dualsense-controls.png)

| Control                   | Action                                                 |
| ------------------------- | ------------------------------------------------------ |
| ✕ / A (south)             | Submit or confirm                                      |
| ○ / B (east)              | Clear all unsent input, including dictated text        |
| △ / Y (north)             | Hold to dictate (needs the `⌃⇧D` shortcut)             |
| □ / X (west)              | New task                                               |
| D-pad                     | Arrow keys — navigate menus, repeats while held        |
| Left stick flick ↑ ↓ ← →  | Workflow prompts: review PR / debug / refactor / tests |
| Right stick flick → ←     | Increase / decrease reasoning effort                   |
| R1                        | Shift+Tab — cycle permission modes                     |
| R2                        | Clear the input (select-all + delete in the app)       |
| L2                        | Jump to the next project                               |
| L3                        | Cycle chats in the current project                     |
| R3                        | Open the model picker (needs the `⌃⇧M` shortcut)       |
| Options                   | Escape — close, cancel, or interrupt                   |
| Create                    | New task                                               |
| Touchpad click            | Primary mouse click                                    |
| Touchpad drag             | Move the pointer (one finger), scroll (two fingers)    |
| L1 + face button or d-pad | Select one of six layers (d-pad up/down only)          |
| PS button                 | Launch or focus ChatGPT                                |

L1 is the layer modifier unless you bind it explicitly; the first layer ships with these defaults,
the other five start empty. Stick flicks fire after the stick returns to centre.

Workflow prompts prefill the composer rather than sending — press ✕ to submit. Most controls are
remappable in the editor, but touchpad click, touch gestures, and the PS button are handled by the
desktop wrapper and ignore bindings.

In the terminal CLI, L2 cycles herdr workspaces and touchpad click cycles session focus instead.

## Configuration

The menu-bar **Open Settings** window is the supported way to edit bindings: pick a control,
choose an action, record a keyboard shortcut, assign a layer colour, then **Apply changes**.

The file behind it is `~/.openmicro/config.json` — six layers of bindings plus named workflow
prompts. Hand-editing works, and a malformed file makes startup fail loudly rather than overwrite
your config. Actions include `accept`, `reject`, `clear_input`, `push_to_talk`, `new_chat`,
`keyboard_shortcut`, `prompt`, `workflow`, `thinking_depth`, `layer`, `focus_session`, and raw
`keys`.

## The terminal CLI

The CLI is the same controller engine without the desktop shell. Claude Code and Codex CLI must
already be installed and on your `PATH` — the harnesses launch them, they are not bundled:

```sh
npm run dev -- claude      # Claude Code in a pty
npm run dev -- codex       # Codex CLI in a pty
npm run dev -- codex-app   # drive the desktop app from a terminal
npm run dev -- doctor      # diagnose a controller and capture a fixture
```

The first process owns the controller and becomes the host; later ones register as clients, so one
controller can drive several sessions. On DualSense the lightbar follows the focused session and
the player LEDs show occupied slots. Claude Code and Codex CLI are supported through the same
layers and workflows; where a harness has no verified equivalent for an action, OpenMicro leaves it
unmapped instead of sending a guessed keystroke. Hook installation is automatic — Codex may ask
you to trust the hooks in `/hooks`.

Controller support depends on the device and transport. See [CONTROLLERS.md](CONTROLLERS.md), or
run `npm run dev -- doctor` to check yours. The doctor writes a report that can be committed
unchanged to `test/fixtures/controllers/`, where CI replays it as a regression test.

## Library APIs

The package still exports `openmicro/harness` (implement and register a new agent CLI),
`openmicro/controller` (the HID manager without the CLI), and `openmicro/logging`
(side-effect-free status strings). They are unchanged from upstream; see the
[upstream README](https://github.com/stephenleo/OpenMicro) for the contracts.

## Troubleshooting

**Controller is connected but cannot be opened.** Another process probably owns it exclusively.
Quit other controller tools, Steam, browser tabs using Gamepad/WebHID, and PS Remote Play. On
macOS, this lists the processes holding the DualSense:

```sh
ioreg -r -n "DualSense Wireless Controller" -l -w0 | grep IOUserClientCreator
```

**Commands do nothing while the controller works.** Accessibility or Automation permission is
missing for **DualSense for Codex** (System Settings → Privacy & Security). The companion logs the
failure to the terminal when started with `npm run desktop:start`.

## Development

```sh
npm run verify     # typecheck, lint, format check, tests
npm test           # vitest only
```

Changes land through pull requests with an independent review pinned to a commit SHA — see
[docs/REVIEW.md](docs/REVIEW.md) for the workflow, the reviewer prompt, and the severity rubric.
The rules in [AGENTS.md](AGENTS.md) apply to humans and agents alike.

## Lineage and license

MIT licensed. Forked from [stephenleo/OpenMicro](https://github.com/stephenleo/OpenMicro): the
controller drivers, harness layer, CLI, and most tests originate there, and upstream improvements
are merged periodically. This fork adds the Electron companion, the visual binding editor, the
DualSense Bluetooth output path, and the touchpad pointer.
