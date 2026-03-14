const RecallAiSdk = require("@recallai/desktop-sdk");
const { fetchUploadToken } = require("./tokenClient");
const logger = require("./logger");
const { RECALL_REGION_URL } = require("./config");

let initialized = false;
let onStateChange = null;

function detectPlatform(windowTitle) {
  const lower = (windowTitle || "").toLowerCase();
  if (lower.includes("zoom")) return "zoom";
  if (lower.includes("meet.google") || lower.includes("google meet")) return "meet";
  if (lower.includes("teams")) return "teams";
  if (lower.includes("slack")) return "slack";
  return "zoom";
}

async function init(stateChangeCallback) {
  if (initialized) return;

  onStateChange = stateChangeCallback;

  RecallAiSdk.init({ apiUrl: RECALL_REGION_URL });
  initialized = true;

  logger.info("Recall SDK initialized", { region: RECALL_REGION_URL });

  if (process.platform === "darwin") {
    try {
      RecallAiSdk.requestPermission("accessibility");
      RecallAiSdk.requestPermission("microphone");
      RecallAiSdk.requestPermission("screen-capture");
      logger.info("macOS permissions requested");
    } catch (err) {
      logger.error("Failed to request macOS permissions", err);
    }
  }

  RecallAiSdk.addEventListener("meeting-detected", handleMeetingDetected);
  RecallAiSdk.addEventListener("recording-ended", handleRecordingEnded);
  RecallAiSdk.addEventListener("sdk-state-change", handleSdkStateChange);

  logger.info("SDK event listeners registered");
}

async function handleMeetingDetected(evt) {
  const { window: win } = evt;
  const windowId = win && win.id;
  const windowTitle = (win && win.title) || "Unknown Meeting";
  const platform = evt.platform || detectPlatform(windowTitle);

  logger.info(`Meeting detected: "${windowTitle}" on ${platform}`, { windowId });

  if (onStateChange) onStateChange("recording");

  try {
    const { upload_token } = await fetchUploadToken(platform);
    await RecallAiSdk.startRecording({
      windowId,
      uploadToken: upload_token,
    });
    logger.info("Recording started", { windowId, platform });
  } catch (err) {
    logger.error("Failed to start recording", err);
    if (onStateChange) {
      if (err.code === "JWT_EXPIRED" || err.code === "NOT_AUTHENTICATED") {
        onStateChange("needs-login");
      } else {
        onStateChange("error");
      }
    }
  }
}

function handleRecordingEnded(evt) {
  logger.info("Recording ended", { reason: evt && evt.reason });
  if (onStateChange) onStateChange("idle");
}

function handleSdkStateChange(evt) {
  logger.info("SDK state changed", { state: evt && evt.state });
}

module.exports = { init };