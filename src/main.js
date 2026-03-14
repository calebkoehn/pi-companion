const { app, shell } = require('electron');
const path = require('path');
const { createTray, setState } = require('./tray');
const { togglePanel, sendStatusUpdate } = require('./panel');
const { init: initRecorder } = require('./recorder');
const { setJwt, isAuthenticated, sendHeartbeat } = require('./tokenClient');
const calendar = require('./calendar');
const { notifyMeetingStarting, notifyRecordingStarted } = require('./notifier');
const autoLaunch = require('./autoLaunch');
const logger = require('./logger');
const { HEARTBEAT_INTERVAL_MS } = require('./config');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('pi-companion', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('pi-companion');
}

let heartbeatInterval = null;

function handleDeepLink(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'auth' || parsed.pathname === '//auth') {
      const token = parsed.searchParams.get('token');
      if (token) {
        setJwt(token);
        setState('idle');
        sendStatusUpdate('idle');
        logger.info('JWT received via deep link');
        startHeartbeat();
        calendar.start();
      }
    }
  } catch (err) {
    logger.error('Failed to handle deep link', err);
  }
}

app.on('open-url', (event, url) => { event.preventDefault(); handleDeepLink(url); });
app.on('second-instance', (_event, argv) => {
  const deepLink = argv.find(arg => arg.startsWith('pi-companion://'));
  if (deepLink) handleDeepLink(deepLink);
});

function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  sendHeartbeat();
  heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
}

app.on('ready', async () => {
  logger.info('PI Companion starting', { platform: process.platform, arch: process.arch, version: app.getVersion() });

  createTray(togglePanel);

  await autoLaunch.enable();

  if (isAuthenticated()) {
    setState('idle');
    sendStatusUpdate('idle');
    startHeartbeat();
    calendar.start();
  } else {
    setState('needs-login');
  }

  initRecorder({
    onMeetingDetected: (info) => {
      logger.info('Meeting detected by SDK', info);
      setState('recording');
      sendStatusUpdate('recording');
    },
    onRecordingEnded: (info) => {
      logger.info('Recording ended', info);
      setState('idle');
      sendStatusUpdate('idle');
    },
  });

  calendar.on('meeting-starting', (event) => {
    if (calendar.isRecording ? calendar.isRecording(event.id) : false) return;
    notifyMeetingStarting(event, {
      onRecord: (ev) => {
        calendar.recordMeeting(ev.id);
        notifyRecordingStarted(ev);
        logger.info('User chose to record from notification', { title: ev.title });
      },
      onSkip: (ev) => {
        calendar.skipMeeting(ev.id);
        logger.info('User skipped meeting from notification', { title: ev.title });
      },
    });
  });

  app.on('before-quit', () => {
    logger.info('PI Companion shutting down');
    calendar.stop();
    if (heartbeatInterval) clearInterval(heartbeatInterval);
  });
});

app.on('window-all-closed', (e) => e.preventDefault());
