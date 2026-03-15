const { app, shell, Notification } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { createTray, setState } = require('./tray');
const { togglePanel, sendStatusUpdate } = require('./panel');
const { init: initRecorder } = require('./recorder');
const { setJwt, isAuthenticated, sendHeartbeat, startTokenRefresh, stopTokenRefresh } = require('./tokenClient');
const calendar = require('./calendar');
const { notifyMeetingStarting, notifyRecordingStarted } = require('./notifier');
const autoLaunch = require('./autoLaunch');
const logger = require('./logger');
const { HEARTBEAT_INTERVAL_MS, PI_APP_URL } = require('./config');

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

function notifyAuthRequired() {
  setState('needs-login');
  sendStatusUpdate('needs-login');
  if (Notification.isSupported()) {
    const n = new Notification({
      title: 'Performance IQ � Reconnect needed',
      body: 'Your session expired. Click to reconnect.',
    });
    n.on('click', () => shell.openExternal(`${PI_APP_URL}/settings`));
    n.show();
  }
}

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
        startHeartbeatLoop();
        startTokenRefresh(notifyAuthRequired);
        calendar.start();
      }
    }
  } catch (err) {
    logger.error('Failed to handle deep link', { error: err.message });
  }
}

app.on('open-url', (event, url) => { event.preventDefault(); handleDeepLink(url); });
app.on('second-instance', (_event, argv) => {
  const deepLink = argv.find(arg => arg.startsWith('pi-companion://'));
  if (deepLink) handleDeepLink(deepLink);
});

function startHeartbeatLoop() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  sendHeartbeat();
  heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
}

function setupAutoUpdater() {
  autoUpdater.logger = logger;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    logger.info('Update available', { version: info.version });
  });

  autoUpdater.on('update-downloaded', (info) => {
    logger.info('Update downloaded', { version: info.version });
    if (Notification.isSupported()) {
      const n = new Notification({
        title: 'Performance IQ update ready',
        body: `v${info.version} will install when you quit the app.`,
      });
      n.show();
    }
  });

  autoUpdater.on('error', (err) => {
    logger.warn('Auto-updater error', { error: err.message });
  });

  // Check for updates in production only, 10s after startup
  if (process.env.NODE_ENV !== 'development') {
    setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 10000);
    setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1000); // every 4h
  }
}

app.on('ready', async () => {
  logger.info('PI Companion starting', {
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion(),
  });

  createTray(togglePanel);
  await autoLaunch.enable();
  setupAutoUpdater();

  if (isAuthenticated()) {
    setState('idle');
    sendStatusUpdate('idle');
    startHeartbeatLoop();
    startTokenRefresh(notifyAuthRequired);
    calendar.start();
  } else {
    setState('needs-login');
    // Token may be expired — prompt user to reconnect via web app
    if (Notification.isSupported()) {
      const n = new Notification({
        title: 'Performance IQ — Reconnect needed',
        body: 'Open Settings in the web app to reconnect the companion.',
      });
      n.on('click', () => shell.openExternal(`${PI_APP_URL}/settings`));
      n.show();
    }
  }

  initRecorder({
    onMeetingDetected: (info) => {
      logger.info('Meeting detected by SDK', info);
      setState('recording');
      sendStatusUpdate('recording');
    },
    onRecordingEnded: (info) => {
      logger.info('Recording ended', info);
      setState(isAuthenticated() ? 'idle' : 'needs-login');
      sendStatusUpdate(isAuthenticated() ? 'idle' : 'needs-login');
    },
  });

  calendar.on('meeting-starting', (event) => {
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
    stopTokenRefresh();
    if (heartbeatInterval) clearInterval(heartbeatInterval);
  });
});

app.on('window-all-closed', (e) => e.preventDefault());