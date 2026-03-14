const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInWorld('pi', {
  getEvents:       ()    => ipcRenderer.invoke('get-events'),
  getStatus:        ()    => ipcRenderer.invoke('get-status'),
  recordMeeting:   (id)  => ipcRenderer.invoke('record-meeting', id),
  skipMeeting:   (id)  => ipcRenderer.invoke('skip-meeting', id),
  openDashboard:   ()    => ipcRenderer.invoke('open-dashboard'),
  openSettings:    ()    => ipcRenderer.invoke('open-settings'),
  onEventsUpdated: (cb)  => ipcRenderer.on('events-updated', (_e, ev) => cb(ev)),
  onStatusChanged: (cb)  => ipcRenderer.on('status-changed', (_e, s)  => cb(s)),
});
