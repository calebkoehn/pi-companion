const AutoLaunch = require('electron-auto-launch');
const logger = require('./logger');

let _launcher = null;

function getLauncher() {
  if (!_launcher) {
    const { app } = require('electron');
    _launcher = new AutoLaunch({
      name: 'PI Companion',
      path: app.getPath('exe'),
      isHidden: true,
    });
  }
  return _launcher;
}

async function enable() {
  try {
    const launcher = getLauncher();
    const isEnabled = await launcher.isEnabled();
    if (!isEnabled) {
      await launcher.enable();
      logger.info('Auto-launch enabled');
    }
  } catch (err) {
    logger.warn('Failed to enable auto-launch', { error: err.message });
  }
}

async function disable() {
  try {
    await getLauncher().disable();
    logger.info('Auto-launch disabled');
  } catch (err) {
    logger.warn('Failed to disable auto-launch', { error: err.message });
  }
}

async function isEnabled() {
  try {
    return await getLauncher().isEnabled();
  } catch {
    return false;
  }
}

module.exports = { enable, disable, isEnabled };