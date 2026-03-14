const { Tray, Menu, nativeImage, shell } = require("electron");
const path = require("path");
const { PI_APP_URL } = require("./config");
const logger = require("./logger");

let tray = null;
let currentState = "idle";
let meetingTitle = null;

const ICON_DIR = path.join(__dirname, "assets");

const ICONS = {
  idle: path.join(ICON_DIR, "tray-idle.png"),
  recording: path.join(ICON_DIR, "tray-recording.png"),
  error: path.join(ICON_DIR, "tray-error.png"),
  "needs-login": path.join(ICON_DIR, "tray-error.png"),
};

function createTray() {
  const iconPath = ICONS.idle;
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    icon = icon.resize({ width: 16, height: 16 });
    icon.setTemplateImage(true);
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip("PI Companion");
  updateMenu();

  logger.info("System tray created");
  return tray;
}

function setState(state, title) {
  currentState = state;
  meetingTitle = title || null;

  const iconPath = ICONS[state] || ICONS.idle;
  try {
    let icon = nativeImage.createFromPath(iconPath);
    icon = icon.resize({ width: 16, height: 16 });
    icon.setTemplateImage(true);
    if (tray) tray.setImage(icon);
  } catch {
    // Icon file may not exist during development
  }

  updateMenu();
}

function updateMenu() {
  if (!tray) return;

  const statusLine =
    currentState === "recording"
      ? `Recording: ${meetingTitle || "Meeting"}`
      : currentState === "needs-login"
        ? "Not connected \u2014 click to log in"
        : currentState === "error"
          ? "PI Companion \u2014 Error"
          : "PI Companion \u2014 Idle";

  const menuItems = [
    { label: statusLine, enabled: false },
    { type: "separator" },
    {
      label: "Open PI Web App",
      click: () => {
        shell.openExternal(PI_APP_URL);
      },
    },
  ];

  if (currentState === "needs-login") {
    menuItems.push({
      label: "Log in via PI Web App",
      click: () => {
        shell.openExternal(`${PI_APP_URL}/settings`);
      },
    });
  }

  menuItems.push({ type: "separator" });
  menuItems.push({
    label: "Quit",
    click: () => {
      const { app } = require("electron");
      app.quit();
    },
  });

  const contextMenu = Menu.buildFromTemplate(menuItems);
  tray.setContextMenu(contextMenu);
}

function getTray() {
  return tray;
}

module.exports = { createTray, setState, getTray };