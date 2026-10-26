const packagedPaths = [
  '/.vite',
  '/package.json',
  '/node_modules/node-hid',
  '/node_modules/pkg-prebuilds',
]

const ignoredNodeHidPaths = (file) =>
  file.startsWith('/node_modules/node-hid/hidapi') ||
  file.startsWith('/node_modules/node-hid/src') ||
  (file.startsWith('/node_modules/node-hid/prebuilds/') &&
    !file.startsWith('/node_modules/node-hid/prebuilds/HID-darwin-arm64'))

module.exports = {
  rebuildConfig: {
    // node-hid ships an arm64 N-API prebuild that works across Node/Electron ABIs.
    ignoreModules: ['node-hid'],
  },
  packagerConfig: {
    name: 'DualSense for Codex',
    executableName: 'dualsense-for-codex',
    appBundleId: 'dev.openmicro.dualsense-for-codex',
    // Required for the Automation (Apple Events) prompt when the app activates
    // ChatGPT / asks System Events for keystrokes. Without it, a freshly
    // installed bundle can be denied silently.
    extendInfo: {
      NSAppleEventsUsageDescription:
        'DualSense for Codex sends keystrokes and pastes prompts into ChatGPT and controls System Events.',
    },
    asar: true,
    // The Vite build bundles application dependencies. Disabling Forge's
    // npm-prune pass avoids a very slow dependency-tree walk on macOS while
    // preserving the explicit packager ignore allowlist below.
    prune: false,
    osxSign: false,
    ignore: (file) =>
      file !== '' &&
      (ignoredNodeHidPaths(file) ||
        !packagedPaths.some((entry) => file.startsWith(entry) || entry.startsWith(`${file}/`))),
  },
  makers: [{ name: '@electron-forge/maker-zip', platforms: ['darwin'] }],
  plugins: [
    { name: '@electron-forge/plugin-auto-unpack-natives', config: {} },
    {
      name: '@electron-forge/plugin-vite',
      config: {
        build: [
          { entry: 'desktop/main/main.ts', config: 'vite.main.config.mjs' },
          {
            entry: 'desktop/preload/preload.ts',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [{ name: 'main_window', config: 'vite.renderer.config.mjs' }],
      },
    },
  ],
}
