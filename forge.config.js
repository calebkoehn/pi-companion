const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: {
      unpackDir: "node_modules/@recallai"
    },
    osxSign: {
      continueOnError: false,
      optionsForFile: (_) => {
        return {
          entitlements: './Entitlements.plist'
        };
      }
    },
    icon: './muesli',
    extendInfo: {
      NSUserNotificationAlertStyle: "alert",
    },
    protocols: [
      {
        name: "PI Companion",
        schemes: ["pi-companion"],
      },
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-dmg'
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        devContentSecurityPolicy: "default-src * 'unsafe-inline' 'unsafe-eval' data: blob: filesystem: mediastream: file:;",
        mainConfig: './webpack.main.config.js',
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [],
        },
      },
    },
    {
      name: "@timfish/forge-externals-plugin",
      config: {
        externals: ["@recallai/desktop-sdk"],
        includeDeps: true
      }
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