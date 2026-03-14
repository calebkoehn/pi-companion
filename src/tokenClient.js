const Store = require('electron-store');
const { PI_BACKEND_URL, TOKEN_RETRY_MAX, TOKEN_RETRY_BASE_DELAY_MS, HEARTBEAT_INTERVAL_MS } = require('./config');
const logger = require('./logger');
const machineId = require('./machineId');

const store = new Store({ encryptionKey: machineId.get() });
const REQUEST_TIMEOUT_MS = 30000;
const TOKEN_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const HEARTBEAT_FAILURE_NOTIFY_THRESHOLD = 5;

let heartbeatFailures = 0;
let tokenRefreshInterval = null;
let _onAuthRequired = null; // callback when token expires and refresh fails

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

function getJwt() { return store.get('pi_jwt'); }
function setJwt(token) { store.set('pi_jwt', token); }
function clearJwt() { store.delete('pi_jwt'); }

function isAuthenticated() {
  const jwt = store.get('pi_jwt');
  if (!jwt) return false;
  // Decode expiry without a library
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString());
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      logger.warn('Stored JWT is expired, clearing');
      clearJwt();
      return false;
    }
  } catch { /* non-standard JWT, trust it */ }
  return true;
}

function getTokenExpiry() {
  const jwt = store.get('pi_jwt');
  if (!jwt) return null;
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString());
    return payload.exp ? payload.exp * 1000 : null;
  } catch { return null; }
}

async function refreshToken() {
  const jwt = getJwt();
  if (!jwt) return false;
  try {
    const res = await fetchWithTimeout(`${PI_BACKEND_URL}/api/companion/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    });
    if (res.status === 401) { clearJwt(); return false; }
    if (!res.ok) return false;
    const { token } = await res.json();
    setJwt(token);
    logger.info('JWT refreshed successfully');
    return true;
  } catch (err) {
    logger.warn('Token refresh failed', { error: err.message });
    return false;
  }
}

function startTokenRefresh(onAuthRequired) {
  _onAuthRequired = onAuthRequired;
  if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);
  tokenRefreshInterval = setInterval(async () => {
    const expiry = getTokenExpiry();
    if (!expiry) return;
    const msUntilExpiry = expiry - Date.now();
    // Refresh if expiring within 24h
    if (msUntilExpiry < 24 * 60 * 60 * 1000) {
      logger.info('Token expiring soon, refreshing', { hoursLeft: Math.round(msUntilExpiry / 3600000) });
      const ok = await refreshToken();
      if (!ok && _onAuthRequired) {
        logger.warn('Auto-refresh failed, prompting user');
        _onAuthRequired();
      }
    }
  }, TOKEN_REFRESH_INTERVAL_MS);
}

function stopTokenRefresh() {
  if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);
}

async function fetchUploadToken(platform) {
  const jwt = getJwt();
  if (!jwt) throw Object.assign(new Error('Not authenticated'), { code: 'NOT_AUTHENTICATED' });

  let lastError;
  for (let attempt = 1; attempt <= TOKEN_RETRY_MAX; attempt++) {
    try {
      const res = await fetchWithTimeout(`${PI_BACKEND_URL}/api/companion/token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      });
      if (res.status === 401) throw Object.assign(new Error('JWT expired or invalid'), { code: 'JWT_EXPIRED' });
      if (!res.ok) throw new Error(`Token fetch failed: HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (err.code === 'JWT_EXPIRED' || err.code === 'NOT_AUTHENTICATED') throw err;
      if (attempt < TOKEN_RETRY_MAX) {
        const delay = TOKEN_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn(`Upload token attempt ${attempt} failed, retrying in ${delay}ms`, { error: err.message });
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

async function sendHeartbeat() {
  const jwt = getJwt();
  if (!jwt) return;
  try {
    const res = await fetchWithTimeout(`${PI_BACKEND_URL}/api/companion/heartbeat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    });
    if (res.status === 401) {
      logger.warn('Heartbeat got 401 - token expired');
      clearJwt();
      if (_onAuthRequired) _onAuthRequired();
      return;
    }
    if (res.ok) {
      if (heartbeatFailures > 0) {
        logger.info('Heartbeat restored after failures', { previousFailures: heartbeatFailures });
      }
      heartbeatFailures = 0;
    }
  } catch (err) {
    heartbeatFailures++;
    logger.warn('Heartbeat failed', { error: err.message, consecutiveFailures: heartbeatFailures });
    if (heartbeatFailures === HEARTBEAT_FAILURE_NOTIFY_THRESHOLD) {
      logger.error('Repeated heartbeat failures - connection lost');
      // Bubble up to main for notification if needed
    }
  }
}

module.exports = {
  getJwt, setJwt, clearJwt,
  isAuthenticated,
  fetchUploadToken,
  sendHeartbeat,
  refreshToken,
  startTokenRefresh,
  stopTokenRefresh,
};