const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    appBundleId: 'com.performanceiq.companion',
    asar: { unpackDir: 'node_modules/@recallai' },
    icon: './src/assets/icon',
    extendInfo: { NSUserNotificationAlertStyle: 'alert' },
    protocols: [{ name: 'PI Companion', schemes: ['pi-companion'] }],
    osxSign: {
      identity: 'Developer ID Application: Caleb Koehn (QLZ7FP98A3)',
      continueOnError: false,
      optionsForFile: (_) => ({ entitlements: './Entitlements.plist' }),
    },
    osxNotarize: process.env.APPLE_ID ? {
      tool: 'notarytool',
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: 'QLZ7FP98A3',
    } : undefined,
  },
  rebuildConfig: {},
  makers: [
    { name: '@electron-forge/maker-dmg', config: { format: 'ULFO' } },
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: { owner: 'calebkoehn', name: 'pi-companion' },
        prerelease: false,
        draft: true,
      },
    },
  ],
  plugins: [
    { name: '@electron-forge/plugin-auto-unpack-natives', config: {} },
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        devContentSecurityPolicy: "default-src * 'unsafe-inline' 'unsafe-eval' data: blob: filesystem: mediastream: file:;",
        mainConfig: './webpack.main.config.js',
        renderer: { config: './webpack.renderer.config.js', entryPoints: [] },
      },
    },
    {
      name: '@timfish/forge-externals-plugin',
      config: { externals: ['@recallai/desktop-sdk'], includeDeps: true },
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};