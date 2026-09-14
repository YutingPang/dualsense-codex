const packagedPaths = [
  '/.vite',
  '/package.json',
  '/node_modules/node-hid',
  '/node_modules/pkg-prebuilds',
]

module.exports = {
  rebuildConfig: {
    // node-hid ships an arm64 N-API prebuild that works across Node/Electron ABIs.
    ignoreModules: ['node-hid'],
  },
  packagerConfig: {
    name: 'DualSense for Codex',
    executableName: 'dualsense-for-codex',
    appBundleId: 'dev.openmicro.dualsense-for-codex',
    asar: true,
    osxSign: false,
    ignore: (file) =>
      file !== '' &&
      !packagedPaths.some((entry) => file.startsWith(entry) || entry.startsWith(`${file}/`)),
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
