const { BrowserWindow, screen, ipcMain, shell } = require('electron');
const path = require('path');
const { PI_APP_URL } = require('./config');
const calendar = require('./calendar');
const logger = require('./logger');

let win = null;

function createPanel() {
  win = new BrowserWindow({
    width: 360,
    height: 560,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'panel-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'panel.html'));
  win.on('blur', () => { if (win && win.isVisible()) win.hide(); });

  ipcMain.handle('get-events', () => ({
    events: calendar.getEvents(),
    calendarConnected: calendar.isCalendarConnected() !== false,
  }));
  ipcMain.handle('get-status', () => 'idle');
  ipcMain.handle('record-meeting', (_e, id) => { calendar.recordMeeting(id); logger.info('Meeting marked for recording', { id }); });
  ipcMain.handle('skip-meeting',   (_e, id) => { calendar.skipMeeting(id);   logger.info('Meeting skipped', { id }); });
  ipcMain.handle('open-dashboard', () => shell.openExternal(PI_APP_URL));
  ipcMain.handle('open-settings',  () => shell.openExternal(`${PI_APP_URL}/settings`));

  calendar.on('events-updated', (events) => {
    if (win && !win.isDestroyed()) win.webContents.send('events-updated', events);
  });

  return win;
}

function togglePanel(trayBounds) {
  if (!win || win.isDestroyed()) createPanel();
  if (win.isVisible()) { win.hide(); return; }
  const { workArea } = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const x = Math.min(Math.round(trayBounds.x + trayBounds.width / 2 - 180), workArea.x + workArea.width - 368);
  const y = Math.round(trayBounds.y + trayBounds.height + 4);
  win.setPosition(x, y);
  win.show();
  win.focus();
}

function sendStatusUpdate(status) {
  if (win && !win.isDestroyed()) win.webContents.send('status-changed', status);
}

module.exports = { createPanel, togglePanel, sendStatusUpdate };
