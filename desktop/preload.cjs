// companybrain desktop — preload bridge (CommonJS).
//
// Runs in an isolated world with Node access, but the renderer itself does not
// (contextIsolation: true, nodeIntegration: false). We expose a tiny, audited
// surface — window.companybrain — via contextBridge so the web UI can read a
// few facts about its host shell and ask for OS-level actions (open a link,
// quit). Nothing else crosses the boundary.

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('companybrain', {
  // App version from package.json (Electron's app.getVersion()).
  getVersion: () => ipcRenderer.invoke('app:get-version'),

  // Host platform: 'darwin' | 'win32' | 'linux'. Lets the UI tune shortcuts.
  getPlatform: () => process.platform,

  // Open an external URL in the user's default browser. The main process
  // validates the scheme (http/https only) before opening — never arbitrary
  // file:// or shell commands.
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),

  // Quit the whole app (window + tray + child server). Used by an in-UI "Quit"
  // affordance if we ever add one.
  quit: () => ipcRenderer.invoke('app:quit'),
});
