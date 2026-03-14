const { Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const { PI_APP_URL } = require('./config');
const logger = require('./logger');

let tray = null;
let currentState = 'idle';
const ICON_DIR = path.join(__dirname, 'assets');
const ICONS = {
  idle: path.join(ICON_DIR, 'tray-idle.png'),
  recording: path.join(ICON_DIR, 'tray-recording.png'),
  error: path.join(ICON_DIR, 'tray-error.png'),
  'needs-login': path.join(ICON_DIR, 'tray-error.png'),
};

function loadIcon(state) {
  try {
    let icon = nativeImage.createFromPath(ICONS[state] || ICONS.idle);
    icon = icon.resize({ width: 16, height: 16 });
    icon.setTemplateImage(true);
    return icon;
  } catch {
    return nativeImage.createEmpty();
  }
}

function createTray(onLeftClick) {
  tray = new Tray(loadIcon('idle'));
  tray.setToolTip('Performance IQ');

  // Left click = toggle panel
  tray.on('click', () => {
    if (onLeftClick) onLeftClick(tray.getBounds());
  });

  // Right click = context menu
  tray.on('right-click', () => buildContextMenu());

  updateContextMenu();
  logger.info('System tray created');
  return tray;
}

function updateContextMenu() {
  if (!tray) return;
  const items = [
    { label: stateLabel(), enabled: false },
    { type: 'separator' },
    { label: 'Open Dashboard', click: () => shell.openExternal(PI_APP_URL) },
    { label: 'Settings', click: () => shell.openExternal(`${PI_APP_URL}/settings`) },
    { type: 'separator' },
    { label: 'Quit', click: () => require('electron').app.quit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function buildContextMenu() {
  updateContextMenu();
  tray.popUpContextMenu();
}

function stateLabel() {
  if (currentState === 'recording') return '● Recording';
  if (currentState === 'needs-login') return 'Not connected — click to connect';
  return 'Performance IQ — Idle';
}

function setState(state) {
  currentState = state;
  if (tray) {
    tray.setImage(loadIcon(state));
    updateContextMenu();
  }
}

function getTray() { return tray; }

module.exports = { createTray, setState, getTray };
