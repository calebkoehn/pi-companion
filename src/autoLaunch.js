const AutoLaunch = require("electron-auto-launch");
const { app } = require("electron");
const logger = require("./logger");

const autoLauncher = new AutoLaunch({
  name: "PI Companion",
  path: app.getPath("exe"),
  isHidden: true,
});

async function enable() {
  try {
    const isEnabled = await autoLauncher.isEnabled();
    if (!isEnabled) {
      await autoLauncher.enable();
      logger.info("Auto-launch enabled");
    }
  } catch (err) {
    logger.error("Failed to enable auto-launch", err);
  }
}

async function disable() {
  try {
    await autoLauncher.disable();
    logger.info("Auto-launch disabled");
  } catch (err) {
    logger.error("Failed to disable auto-launch", err);
  }
}

async function isEnabled() {
  try {
    return await autoLauncher.isEnabled();
  } catch {
    return false;
  }
}

module.exports = { enable, disable, isEnabled };