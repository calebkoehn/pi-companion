const path = require('path');

module.exports = {
  target: 'electron-main',
  entry: './src/main.js',
  module: { rules: require('./webpack.rules') },
  externals: {
    '@recallai/desktop-sdk': 'commonjs @recallai/desktop-sdk',
    'electron-updater': 'commonjs electron-updater',
    'electron-store': 'commonjs electron-store',
    'electron-auto-launch': 'commonjs electron-auto-launch',
  },
};