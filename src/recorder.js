const RecallAiSdk = require('@recallai/desktop-sdk');
const { fetchUploadToken } = require('./tokenClient');
const logger = require('./logger');
const { RECALL_REGION_URL } = require('./config');

let initialized = false;
let onStateChange = null;

const PLATFORMS = [
  { key: 'zoom',   patterns: ['zoom'] },
  { key: 'meet',   patterns: ['meet.google', 'google meet'] },
  { key: 'teams',  patterns: ['teams.microsoft', 'microsoft teams'] },
  { key: 'slack',  patterns: ['slack huddle', 'slack call'] },
  { key: 'webex',  patterns: ['webex'] },
  { key: 'around', patterns: ['around.co'] },
];

function detectPlatform(windowTitle) {
  const lower = (windowTitle || '').toLowerCase();
  for (const { key, patterns } of PLATFORMS) {
    if (patterns.some(p => lower.includes(p))) return key;
  }
  logger.warn('Unknown meeting platform', { windowTitle });
  return 'zoom'; // safe default for Recall SDK
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
  onStateChange = callbacks.onMeetingDetected ? callbacks : null;

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
  RecallAiSdk.addEventListener('recording-ended', handleRecordingEnded);
  RecallAiSdk.addEventListener('sdk-state-change', handleSdkStateChange);
  RecallAiSdk.addEventListener('error', handleSdkError);
  logger.info('SDK event listeners registered');
}

async function fetchWithRetry(platform, attempt = 1, maxAttempts = 3) {
  const delay = 1000 * Math.pow(2, attempt - 1);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const result = await fetchUploadToken(platform);
      return result;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    if (err.code === 'JWT_EXPIRED' || err.code === 'NOT_AUTHENTICATED') throw err;
    if (attempt >= maxAttempts) throw err;
    logger.warn('Upload token fetch failed, retrying', { attempt, error: err.message });
    await new Promise(r => setTimeout(r, delay));
    return fetchWithRetry(platform, attempt + 1, maxAttempts);
  }
}

async function handleMeetingDetected(evt) {
  const win = evt && evt.window;
  const windowId = win && win.id;
  const windowTitle = (win && win.title) || 'Unknown Meeting';
  const platform = (evt && evt.platform) || detectPlatform(windowTitle);

  logger.info('Meeting detected', { windowTitle, platform, windowId });
  if (onStateChange && onStateChange.onMeetingDetected) {
    onStateChange.onMeetingDetected({ windowTitle, platform });
  }

  try {
    const { upload_token } = await fetchWithRetry(platform);
    await RecallAiSdk.startRecording({ windowId, uploadToken: upload_token });
    logger.info('Recording started', { windowId, platform });
  } catch (err) {
    logger.error('Failed to start recording', { error: err.message, code: err.code });
    if (onStateChange && onStateChange.onMeetingDetected) {
      if (err.code === 'JWT_EXPIRED' || err.code === 'NOT_AUTHENTICATED') {
        onStateChange.onRecordingEnded && onStateChange.onRecordingEnded({ reason: 'auth' });
      }
    }
  }
}

function handleRecordingEnded(evt) {
  const reason = evt && evt.reason;
  logger.info('Recording ended', { reason });
  if (onStateChange && onStateChange.onRecordingEnded) {
    onStateChange.onRecordingEnded({ reason });
  }
}

function handleSdkStateChange(evt) {
  logger.info('SDK state changed', { state: evt && evt.state });
}

function handleSdkError(evt) {
  logger.error('Recall SDK error', { error: evt && evt.message, code: evt && evt.code });
  // SDK crashed Ñ try to recover by reinitializing
  initialized = false;
  setTimeout(() => {
    logger.info('Attempting SDK recovery after error');
    init(onStateChange || {});
  }, 5000);
}

module.exports = { init };