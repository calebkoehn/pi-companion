require('dotenv').config();
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const { execSync } = require('child_process');

module.exports = {
  packagerConfig: {
    appBundleId: 'com.performanceiq.companion',
    icon: './src/assets/icon',
    asar: { unpackDir: 'node_modules/@recallai' },
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
  hooks: {
    generateAssets: async () => {
      console.log('[forge] Running custom webpack build...');
      execSync('node scripts/build.js', { stdio: 'inherit', cwd: __dirname });
    },
  },
  makers: [
    { name: '@electron-forge/maker-dmg' },
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: { owner: 'calebkoehn', name: 'pi-companion' },
        prerelease: false,
        draft: false,
      },
    },
  ],
  plugins: [
    { name: '@electron-forge/plugin-auto-unpack-natives', config: {} },
    // webpack plugin removed — custom build in hooks.generateAssets (scripts/build.js)
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