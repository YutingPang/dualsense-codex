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
shortcut never reaches the app; the companion prints the error and a permission hint rather than
failing silently.

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

L2 and L3 walk the project and chat lists the companion reads from `~/.codex`; browsing inside the
app with the mouse does not move that cursor.

In the Claude Code and Codex CLI harnesses, L2 cycles herdr workspaces and touchpad click cycles
session focus instead.

## Configuration

The menu-bar **Open Settings** window is the supported way to edit bindings: pick a control,
choose an action, record a keyboard shortcut, assign a layer colour, then **Apply changes**.

The file behind it is `~/.openmicro/config.json` — six layers of bindings plus named workflow
prompts. Hand-editing works, and a malformed file makes startup fail loudly rather than overwrite
your config. Actions include `accept`, `reject`, `clear_input`, `push_to_talk`, `new_chat`,
`keyboard_shortcut`, `prompt`, `workflow`, `thinking_depth`, `layer`, `focus_session`, and raw
`keys`.

## The terminal CLI

The CLI is the same controller engine without the desktop shell. The agent CLI you select must
already be installed and on your `PATH` — the harness launches it rather than bundling it.
`codex-app` needs only the desktop app:

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

### Installing a build

The **installed app** loads its window from the packaged `app.asar`, not from your checkout. Editing
the renderer changes nothing until you rebuild and replace that copy — the classic symptom is
launching the app and seeing last week's UI while `main` looks correct.

From the repository root, with dependencies installed:

```sh
npm run desktop:package
```

Then quit the app — **Quit DualSense for Codex** in the menu-bar menu, not just closing the window —
and wait for the process to exit. Replace the bundle you actually launch (this example assumes the
copy in `~/Applications`; use the same commands against `/Applications` if yours lives there):

```sh
mkdir -p ~/Applications
BACKUP="$HOME/Applications/DualSense for Codex.app.bak-$(date +%Y%m%d-%H%M%S)"
mv ~/Applications/"DualSense for Codex.app" "$BACKUP" &&
  cp -R "out/DualSense for Codex-darwin-arm64/DualSense for Codex.app" ~/Applications/ &&
  open -a ~/Applications/"DualSense for Codex.app"
```

The `&&` chain matters: if the move fails, the copy is skipped instead of landing beside the old
bundle. On a first install there is nothing to back up — skip the `mv` and copy directly.

For a faster loop, `npm run desktop:start` serves the renderer from Vite and reloads on save, so you
never touch `~/Applications` at all.

Two things that bite:

- **Quitting is not obvious.** Closing the settings window leaves the app running in the menu bar.
  Use **Quit DualSense for Codex**, then confirm the old process is gone before replacing the bundle
  — a surviving instance keeps showing the old window, and in one case `kill` alone did not stop it.
- **Builds can stall in an iCloud-synced checkout.** When `node_modules` files have been evicted
  (`dataless`), the forge build blocks reading them. Building from a clone outside `~/Documents`
  avoids it; [docs/REVIEW.md](docs/REVIEW.md#environment-notes) covers the symptoms.

Backups accumulate at roughly 288 MB each, so prune the `.bak-*` directories once a build is
confirmed good. The login item registered by the app points at the installed path, so a rebuilt
bundle there is also what starts at login.

## Lineage and license

MIT licensed. Forked from [stephenleo/OpenMicro](https://github.com/stephenleo/OpenMicro): the
controller drivers, harness layer, CLI, and most tests originate there, and upstream improvements
are merged periodically. This fork adds the Electron companion, the visual binding editor, the
DualSense Bluetooth output path, and the touchpad pointer.
