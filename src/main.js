const { app } = require("electron");
const path = require("path");
const { createTray, setState } = require("./tray");
const { init: initRecorder } = require("./recorder");
const { setJwt, isAuthenticated, sendHeartbeat } = require("./tokenClient");
const autoLaunch = require("./autoLaunch");
const logger = require("./logger");
const { HEARTBEAT_INTERVAL_MS } = require("./config");

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// Register custom protocol for deep link auth
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("pi-companion", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient("pi-companion");
}

let heartbeatInterval = null;

function handleDeepLink(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "auth" || parsed.pathname === "//auth") {
      const token = parsed.searchParams.get("token");
      if (token) {
        setJwt(token);
        setState("idle");
        logger.info("JWT received via deep link");
        startHeartbeat();
      }
    }
  } catch (err) {
    logger.error("Failed to handle deep link", err);
  }
}

// macOS: open-url event
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Windows/Linux: second-instance carries the deep link URL
app.on("second-instance", (_event, argv) => {
  const deepLink = argv.find((arg) => arg.startsWith("pi-companion://"));
  if (deepLink) {
    handleDeepLink(deepLink);
  }
});

function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  sendHeartbeat();
  heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
}

app.on("ready", async () => {
  logger.info("PI Companion starting", {
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion(),
  });

  // Tray only - no visible window
  createTray();

  // Enable auto-launch on first run
  await autoLaunch.enable();

  // Set initial state based on auth
  if (isAuthenticated()) {
    setState("idle");
    startHeartbeat();
  } else {
    setState("needs-login");
  }

  // Initialize recording SDK
  try {
    await initRecorder((state) => {
      setState(state);
    });
  } catch (err) {
    logger.error("Failed to initialize recorder", err);
    setState("error");
  }
});

// Keep app running when all windows are closed (tray app)
app.on("window-all-closed", (e) => {
  if (e && e.preventDefault) e.preventDefault();
});

app.on("before-quit", () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  logger.info("PI Companion shutting down");
});

// Prevent navigation in any accidentally created windows
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});