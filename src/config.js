const path = require('path');

const PI_BACKEND_URL  = process.env.PI_BACKEND_URL  || 'https://performanceintelligenceai.com';
const RECALL_REGION_URL = process.env.RECALL_REGION_URL || 'https://us-west-2.recall.ai';
const PI_APP_URL      = process.env.PI_APP_URL      || 'https://performanceintelligenceai.com';
const NODE_ENV        = process.env.NODE_ENV        || 'production';

const HEARTBEAT_INTERVAL_MS     = 60  * 1000;   // 1 min
const TOKEN_RETRY_MAX           = 3;
const TOKEN_RETRY_BASE_DELAY_MS = 1000;

const LOG_DIR = process.platform === 'darwin'
  ? path.join(process.env.HOME || '~', 'Library', 'Logs', 'PICompanion')
  : path.join(process.env.APPDATA || path.join(process.env.HOME || '~', '.config'), 'PICompanion', 'logs');

module.exports = {
  PI_BACKEND_URL,
  RECALL_REGION_URL,
  PI_APP_URL,
  NODE_ENV,
  HEARTBEAT_INTERVAL_MS,
  TOKEN_RETRY_MAX,
  TOKEN_RETRY_BASE_DELAY_MS,
  LOG_DIR,
};