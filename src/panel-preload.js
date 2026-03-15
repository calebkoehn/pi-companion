const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pi', {
  getEvents:        ()    => ipcRenderer.invoke('get-events'),
  getStatus:        ()    => ipcRenderer.invoke('get-status'),
  getVersion:       ()    => ipcRenderer.invoke('get-version'),
  startRecording:   (ev)  => ipcRenderer.invoke('start-recording', ev),
  stopRecording:    (id)  => ipcRenderer.invoke('stop-recording', id),
  recordMeeting:    (id)  => ipcRenderer.invoke('record-meeting', id),
  skipMeeting:      (id)  => ipcRenderer.invoke('skip-meeting', id),
  openDashboard:    ()    => ipcRenderer.invoke('open-dashboard'),
  openSettings:     ()    => ipcRenderer.invoke('open-settings'),
  onEventsUpdated:  (cb)  => ipcRenderer.on('events-updated', (_e, ev) => cb(ev)),
  onStatusChanged:  (cb)  => ipcRenderer.on('status-changed', (_e, s)  => cb(s)),
  onRecordingState: (cb)  => ipcRenderer.on('recording-state', (_e, s) => cb(s)),
});
