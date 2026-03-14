const Store = require("electron-store");
const { PI_BACKEND_URL, TOKEN_RETRY_MAX, TOKEN_RETRY_BASE_DELAY_MS } = require("./config");
const logger = require("./logger");
const machineId = require("./machineId");

const store = new Store({ encryptionKey: machineId.get() });

function getJwt() {
  return store.get("pi_jwt");
}

function setJwt(token) {
  store.set("pi_jwt", token);
}

function clearJwt() {
  store.delete("pi_jwt");
}

function isAuthenticated() {
  return !!store.get("pi_jwt");
}

async function fetchUploadToken(platform) {
  const jwt = getJwt();
  if (!jwt) {
    throw Object.assign(new Error("Not authenticated"), { code: "NOT_AUTHENTICATED" });
  }

  let lastError;
  for (let attempt = 1; attempt <= TOKEN_RETRY_MAX; attempt++) {
    try {
      const res = await fetch(`${PI_BACKEND_URL}/api/companion/token`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ platform }),
      });

      if (res.status === 401) {
        throw Object.assign(new Error("JWT expired or invalid"), { code: "JWT_EXPIRED" });
      }

      if (!res.ok) {
        throw new Error(`Token fetch failed: HTTP ${res.status}`);
      }

      return await res.json();
    } catch (err) {
      lastError = err;

      if (err.code === "JWT_EXPIRED" || err.code === "NOT_AUTHENTICATED") {
        throw err;
      }

      if (attempt < TOKEN_RETRY_MAX) {
        const delay = TOKEN_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn(`Token fetch attempt ${attempt} failed, retrying in ${delay}ms`, {
          error: err.message,
        });
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

async function sendHeartbeat() {
  const jwt = getJwt();
  if (!jwt) return;

  try {
    await fetch(`${PI_BACKEND_URL}/api/companion/heartbeat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    logger.warn("Heartbeat failed", { error: err.message });
  }
}

module.exports = { fetchUploadToken, sendHeartbeat, getJwt, setJwt, clearJwt, isAuthenticated };