const CopyPlugin = require('copy-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const path = require('path');

module.exports = {
  entry: './src/main.js',
  module: { rules: require('./webpack.rules') },
  externals: { '@recallai/desktop-sdk': 'commonjs @recallai/desktop-sdk' },
  plugins: [
    new Dotenv({ path: path.resolve(__dirname, '.env'), silent: true }),
    new CopyPlugin({
      patterns: [
        { from: path.resolve(__dirname, 'src/assets'), to: path.resolve(__dirname, '.webpack/main/assets') },
        { from: path.resolve(__dirname, 'src/panel.html'), to: path.resolve(__dirname, '.webpack/main/panel.html') },
      ],
    }),
  ],
};
