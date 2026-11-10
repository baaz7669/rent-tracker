// Preload bridge: the only way the page can reach the disk. Keep this surface small.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rentAPI', {
  isDesktop: true,
  readDbSync: () => ipcRenderer.sendSync('db:read'),
  writeDbSync: (json) => ipcRenderer.sendSync('db:write', json),
  backupNow: (payload) =>
    ipcRenderer.invoke('backup:save', {
      filename: payload && payload.filename,
      content: payload && payload.content,
    }),
  backupSilently: (payload) =>
    ipcRenderer.invoke('backup:save-silent', {
      filename: payload && payload.filename,
      content: payload && payload.content,
    }),
  openBackupFolder: () => ipcRenderer.invoke('backup:open-folder'),
  notify: (payload) => ipcRenderer.invoke('app:notify', { title: payload && payload.title, body: payload && payload.body }),
  savePdf: (opts) =>
    ipcRenderer.invoke('pdf:save', {
      filename: opts && opts.filename,
      pageSize: opts && opts.pageSize,
    }),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getUpdateState: () => ipcRenderer.invoke('update:state'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
});
