const { BrowserWindow, screen, ipcMain, shell, app } = require('electron');
const path = require('path');
const { PI_APP_URL } = require('./config');
const calendar = require('./calendar');
const recorder = require('./recorder');
const logger = require('./logger');

let win = null;

// Register IPC handlers once at module load — NOT inside createPanel()
// Re-registering inside createPanel() causes duplicate handler errors when
// the window is destroyed and recreated, making all IPC calls hang forever.
ipcMain.handle('get-events',      () => ({
  events: calendar.getEvents(),
  calendarConnected: calendar.isCalendarConnected() !== false,
}));
ipcMain.handle('get-status',      () => {
  const state = recorder.getRecordingState();
  return state.recording ? 'recording' : 'idle';
});
ipcMain.handle('get-version',     () => app.getVersion());

// Record button: mark in calendar + start actual SDK recording
ipcMain.handle('start-recording', async (_e, calendarEvent) => {
  calendar.recordMeeting(calendarEvent.id);
  const result = await recorder.startRecordingForEvent(calendarEvent);
  logger.info('Start recording via panel', { eventId: calendarEvent.id, result });
  if (result.success) {
    sendStatusUpdate('recording');
  } else if (result.pending) {
    // Recording queued — will auto-start when meeting window opens
    sendStatusUpdate('meeting-detected');
  }
  return result;
});

// Stop button: stop the actual SDK recording
ipcMain.handle('stop-recording', async (_e, eventId) => {
  const result = await recorder.stopActiveRecording();
  logger.info('Stop recording via panel', { eventId, result });
  // recording-ended event from SDK will update status
  return result;
});

// Legacy handlers — still used for marking intent when no meeting window is detected yet
ipcMain.handle('record-meeting',  (_e, id) => { calendar.recordMeeting(id); logger.info('Meeting marked for recording', { id }); });
ipcMain.handle('skip-meeting',    (_e, id) => { calendar.skipMeeting(id);   logger.info('Meeting skipped', { id }); });
ipcMain.handle('open-dashboard',  () => shell.openExternal(PI_APP_URL));
ipcMain.handle('open-settings',   () => shell.openExternal(`${PI_APP_URL}/settings`));

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

  return win;
}

// Forward calendar updates to the panel whenever it is open
calendar.on('events-updated', (events) => {
  if (win && !win.isDestroyed()) win.webContents.send('events-updated', events);
});

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
