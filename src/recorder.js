const RecallAiSdk = require('@recallai/desktop-sdk');
const { fetchUploadToken } = require('./tokenClient');
const logger = require('./logger');
const { RECALL_REGION_URL } = require('./config');

let initialized = false;
let onStateChange = null;

// Track active recording state so UI can trigger start/stop
let activeWindowId = null;
let activePlatform = null;
let activeCalendarEvent = null;
let detectedWindowId = null;   // Set when SDK detects a meeting window (before recording starts)
let detectedPlatform = null;
let recording = false;
let pendingRecordEvent = null;  // Set when user clicks Record before meeting window is detected

const PLATFORMS = [
  { key: 'zoom',   patterns: ['zoom'] },
  { key: 'meet',   patterns: ['meet.google', 'google meet'] },
  { key: 'teams',  patterns: ['teams.microsoft', 'microsoft teams'] },
  { key: 'slack',  patterns: ['slack huddle', 'slack call'] },
  { key: 'webex',  patterns: ['webex'] },
  { key: 'around', patterns: ['around.co'] },
];

function detectPlatformFromTitle(windowTitle) {
  const lower = (windowTitle || '').toLowerCase();
  for (const { key, patterns } of PLATFORMS) {
    if (patterns.some(p => lower.includes(p))) return key;
  }
  return null;
}

function resolvePlatform(evt) {
  // Prefer the SDK-provided platform, then detect from window title/url, then fallback
  const win = evt && evt.window;
  if (win && win.platform) return win.platform;
  const fromTitle = detectPlatformFromTitle(win && win.title);
  if (fromTitle) return fromTitle;
  const fromUrl = detectPlatformFromTitle(win && win.url);
  if (fromUrl) return fromUrl;
  logger.warn('Could not detect platform, defaulting to zoom', {
    title: win && win.title,
    url: win && win.url,
    sdkPlatform: win && win.platform,
  });
  return 'zoom';
}

// Normalize SDK platform names to what the backend API expects
function normalizeForApi(platform) {
  const map = {
    'google-meet': 'meet',
    'google_meet': 'meet',
    'googlemeet': 'meet',
    'microsoft-teams': 'teams',
    'microsoft_teams': 'teams',
    'slack-huddle': 'slack',
    'slack_huddle': 'slack',
  };
  return map[(platform || '').toLowerCase()] || platform;
}

async function initWithRetry(attempt = 1, maxAttempts = 5) {
  const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
  try {
    RecallAiSdk.init({ apiUrl: RECALL_REGION_URL });
    logger.info('Recall SDK initialized', { region: RECALL_REGION_URL, attempt });
    return true;
  } catch (err) {
    logger.warn('SDK init failed', { attempt, error: err.message });
    if (attempt >= maxAttempts) {
      logger.error('SDK init gave up after max attempts');
      return false;
    }
    await new Promise(r => setTimeout(r, delay));
    return initWithRetry(attempt + 1, maxAttempts);
  }
}

async function init(callbacks = {}) {
  if (initialized) return;
  onStateChange = callbacks || {};

  const ok = await initWithRetry();
  if (!ok) return;
  initialized = true;

  if (process.platform === 'darwin') {
    try {
      RecallAiSdk.requestPermission('accessibility');
      RecallAiSdk.requestPermission('microphone');
      RecallAiSdk.requestPermission('screen-capture');
      logger.info('macOS permissions requested');
    } catch (err) {
      logger.warn('Permission request failed', { error: err.message });
    }
  }

  RecallAiSdk.addEventListener('meeting-detected', handleMeetingDetected);
  RecallAiSdk.addEventListener('meeting-updated', handleMeetingUpdated);
  RecallAiSdk.addEventListener('meeting-closed', handleMeetingClosed);
  RecallAiSdk.addEventListener('recording-started', handleRecordingStarted);
  RecallAiSdk.addEventListener('recording-ended', handleRecordingEnded);
  RecallAiSdk.addEventListener('sdk-state-change', handleSdkStateChange);
  RecallAiSdk.addEventListener('error', handleSdkError);
  logger.info('SDK event listeners registered');
}

async function fetchWithRetry(platform, title, attempt = 1, maxAttempts = 3) {
  const delay = 1000 * Math.pow(2, attempt - 1);
  try {
    const result = await fetchUploadToken(platform, title);
    return result;
  } catch (err) {
    if (err.code === 'JWT_EXPIRED' || err.code === 'NOT_AUTHENTICATED') throw err;
    if (attempt >= maxAttempts) throw err;
    logger.warn('Upload token fetch failed, retrying', { attempt, error: err.message });
    await new Promise(r => setTimeout(r, delay));
    return fetchWithRetry(platform, title, attempt + 1, maxAttempts);
  }
}

// --- SDK event handlers ---

async function handleMeetingDetected(evt) {
  const win = evt && evt.window;
  const windowId = win && win.id;
  const platform = resolvePlatform(evt);

  // Store detected meeting window so startRecordingForEvent can use it
  detectedWindowId = windowId;
  detectedPlatform = platform;

  logger.info('Meeting detected', {
    windowTitle: win && win.title,
    windowUrl: win && win.url,
    sdkPlatform: win && win.platform,
    resolvedPlatform: platform,
    windowId,
  });

  if (onStateChange.onMeetingDetected) {
    onStateChange.onMeetingDetected({ windowId, windowTitle: win && win.title, platform });
  }

  // If user already clicked Record but meeting wasn't detected yet, auto-start now
  if (pendingRecordEvent) {
    const pendingEvent = pendingRecordEvent;
    pendingRecordEvent = null;
    logger.info('Pending recording found — auto-starting recording now', {
      eventTitle: pendingEvent.title || pendingEvent.summary,
      windowId,
      platform,
    });
    // Small delay to let the meeting window fully initialize
    setTimeout(() => startRecordingForEvent(pendingEvent), 2000);
  }
}

function handleMeetingUpdated(evt) {
  const win = evt && evt.window;
  logger.info('Meeting updated', { windowId: win && win.id, title: win && win.title, platform: win && win.platform });
  // Update detected platform/window if it changed
  if (win && win.id) {
    detectedWindowId = win.id;
    if (win.platform) detectedPlatform = win.platform;
  }
}

function handleMeetingClosed(evt) {
  const win = evt && evt.window;
  logger.info('Meeting closed', { windowId: win && win.id });
  // If the closed window was our detected/active window, clean up
  if (win && win.id === detectedWindowId) {
    detectedWindowId = null;
    detectedPlatform = null;
  }
  if (win && win.id === activeWindowId) {
    // Recording will end via recording-ended event, but clean up tracking
    activeWindowId = null;
    activePlatform = null;
    activeCalendarEvent = null;
  }
}

function handleRecordingStarted(evt) {
  const win = evt && evt.window;
  recording = true;
  activeWindowId = win && win.id;
  logger.info('Recording started (SDK event)', { windowId: activeWindowId });
  if (onStateChange.onRecordingStarted) {
    onStateChange.onRecordingStarted({ windowId: activeWindowId, calendarEvent: activeCalendarEvent });
  }
}

function handleRecordingEnded(evt) {
  const win = evt && evt.window;
  logger.info('Recording ended', { windowId: win && win.id });
  recording = false;
  activeWindowId = null;
  activePlatform = null;
  activeCalendarEvent = null;
  pendingRecordEvent = null;
  if (onStateChange.onRecordingEnded) {
    onStateChange.onRecordingEnded({ windowId: win && win.id });
  }
}

function handleSdkStateChange(evt) {
  const state = evt && evt.sdk && evt.sdk.state && evt.sdk.state.code;
  logger.info('SDK state changed', { state });
  if (state === 'recording') {
    recording = true;
  } else if (state === 'idle') {
    recording = false;
  }
}

function handleSdkError(evt) {
  logger.error('Recall SDK error', { error: evt && evt.message, code: evt && evt.code, type: evt && evt.type });
  // SDK crashed — try to recover by reinitializing
  initialized = false;
  recording = false;
  activeWindowId = null;
  detectedWindowId = null;
  setTimeout(() => {
    logger.info('Attempting SDK recovery after error');
    init(onStateChange || {});
  }, 5000);
}

// --- Public API for UI/IPC to control recording ---

async function startRecordingForEvent(calendarEvent) {
  if (recording) {
    logger.warn('Already recording, ignoring startRecordingForEvent');
    return { success: false, reason: 'already_recording' };
  }
  if (!detectedWindowId) {
    // No meeting window detected yet — store as pending so we auto-start when SDK detects it
    pendingRecordEvent = calendarEvent;
    logger.info('No meeting window yet — queued as pending recording', {
      eventTitle: calendarEvent && calendarEvent.title,
      eventId: calendarEvent && calendarEvent.id,
    });
    return { success: false, reason: 'no_meeting_detected', pending: true };
  }

  const platform = detectedPlatform || 'zoom';
  const apiPlatform = normalizeForApi(platform);
  activeCalendarEvent = calendarEvent;
  activePlatform = platform;

  logger.info('Starting recording for calendar event', {
    eventTitle: calendarEvent && calendarEvent.title,
    eventId: calendarEvent && calendarEvent.id,
    windowId: detectedWindowId,
    platform,
    apiPlatform,
  });

  try {
    const eventTitle = calendarEvent && (calendarEvent.title || calendarEvent.summary);
    const { upload_token } = await fetchWithRetry(apiPlatform, eventTitle);
    await RecallAiSdk.startRecording({ windowId: detectedWindowId, uploadToken: upload_token });
    activeWindowId = detectedWindowId;
    recording = true;
    logger.info('Recording started via UI', { windowId: activeWindowId, platform });

    if (onStateChange.onMeetingDetected) {
      onStateChange.onMeetingDetected({ windowId: activeWindowId, platform, windowTitle: calendarEvent && calendarEvent.title });
    }

    return { success: true };
  } catch (err) {
    logger.error('Failed to start recording for event', { error: err.message, code: err.code });
    activeCalendarEvent = null;
    activePlatform = null;
    if (err.code === 'JWT_EXPIRED' || err.code === 'NOT_AUTHENTICATED') {
      if (onStateChange.onRecordingEnded) onStateChange.onRecordingEnded({ reason: 'auth' });
    }
    return { success: false, reason: err.message };
  }
}

async function stopActiveRecording() {
  if (!recording || !activeWindowId) {
    logger.warn('No active recording to stop', { recording, activeWindowId });
    return { success: false, reason: 'not_recording' };
  }

  logger.info('Stopping recording via UI', { windowId: activeWindowId });
  try {
    await RecallAiSdk.stopRecording({ windowId: activeWindowId });
    // recording-ended event will clean up state
    return { success: true };
  } catch (err) {
    logger.error('Failed to stop recording', { error: err.message });
    return { success: false, reason: err.message };
  }
}

function getRecordingState() {
  return {
    recording,
    activeWindowId,
    activePlatform,
    activeCalendarEvent,
    detectedWindowId,
    detectedPlatform,
    initialized,
  };
}

module.exports = {
  init,
  startRecordingForEvent,
  stopActiveRecording,
  getRecordingState,
};