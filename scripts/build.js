#!/usr/bin/env node
/**
 * Manual webpack build + asset copy.
 * Replaces @electron-forge/plugin-webpack for production builds.
 */
const webpack = require('webpack');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, '.webpack', 'main');

// Clean & create output dir
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// Load config & set production overrides
const config = require('../webpack.main.config.js');
config.mode = 'production';
config.devtool = false;
config.output = { path: OUT, filename: 'index.js' };

console.log('[build] Compiling webpack...');

webpack(config, (err, stats) => {
  if (err) { console.error('[build] FATAL:', err); process.exit(1); }
  if (stats.hasErrors()) {
    console.error('[build] Webpack errors:');
    stats.toJson().errors.forEach(e => console.error(' ', e.message.split('\n')[0]));
    process.exit(1);
  }
  const assets = stats.toJson({ assets: true }).assets;
  console.log('[build] Webpack OK:', assets.map(a => `${a.name} (${a.size}b)`).join(', '));

  // Copy static assets that the app loads at runtime via __dirname
  const copies = [
    ['src/panel.html', 'panel.html'],
    ['src/panel-preload.js', 'panel-preload.js'],
    ['assets/tray-idle.png', 'assets/tray-idle.png'],
    ['assets/tray-recording.png', 'assets/tray-recording.png'],
    ['assets/tray-error.png', 'assets/tray-error.png'],
  ];

  for (const [src, dest] of copies) {
    const srcPath = path.join(ROOT, src);
    const destPath = path.join(OUT, dest);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    console.log(`[build] Copied ${src} → .webpack/main/${dest}`);
  }

  console.log('[build] Done.');
});
