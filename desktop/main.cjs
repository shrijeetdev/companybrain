// companybrain desktop — Electron main process (CommonJS).
//
// One app, one window: we spawn the companybrain server (the same dist/server.js
// that `pnpm start` runs) as a CHILD PROCESS bound to 127.0.0.1:4317, wait for its
// /health endpoint, then load the server's own web UI into a BrowserWindow. The
// desktop app is a thin native shell — all the product logic still lives in the
// server bundle. Quitting the app kills the child server first so we never leave
// an orphaned process holding the port.
//
// Security: the child binds 127.0.0.1 ONLY (set via COMPANYBRAIN_HOST), so the
// server is never exposed to the LAN from the desktop app. We also disable
// nodeIntegration and enable contextIsolation in the renderer, and expose a tiny
// safe API through preload.cjs.

'use strict';

const { app, BrowserWindow, Menu, Tray, ipcMain, shell, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');

// --- Configuration ---------------------------------------------------------
// The server always runs on localhost:4317 inside the desktop app. These are
// passed to the child so cli/bin/companybrain.ts reads them from process.env.
const PORT = Number(process.env.COMPANYBRAIN_PORT) || 4317;
const HOST = process.env.COMPANYBRAIN_HOST || '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;
const HEALTH_URL = `${BASE_URL}/health`;
const HEALTH_POLL_MS = 300; // poll the health endpoint this often
const HEALTH_TIMEOUT_MS = 15000; // give up waiting for the server after this

// Resolve the server bundle. In dev (running from source) it lives at the repo's
// dist/server.js. In a packaged app it's copied into the app's resources dir by
// electron-builder (extraResources) under the "server" subfolder.
function resolveServerPath() {
  // app.isPackaged is true for an asar'd/packaged build.
  if (app.isPackaged) {
    // process.resourcesPath points at <app>/Contents/Resources (mac) or the
    // resources dir on win/linux. electron-builder copies dist/ (containing
    // server.js) and node_modules/ here via extraResources — see
    // electron-builder.yml.
    return path.join(process.resourcesPath, 'dist', 'server.js');
  }
  // Dev: desktop/ sits at <repo>/desktop, so the bundle is ../dist/server.js.
  return path.join(__dirname, '..', 'dist', 'server.js');
}

const SERVER_PATH = resolveServerPath();

// --- Mutable state ---------------------------------------------------------
let mainWindow = null; // the BrowserWindow once created
let splashWindow = null; // transient Liquid Glass loading window
let serverProc = null; // the spawned companybrain server child process
let tray = null; // system-tray icon + menu
let serverReady = false; // becomes true once /health responds 200
let isQuitting = false; // guards against double-shutdown on 'before-quit'

// --- Logging ---------------------------------------------------------------
// Tiny tagged logger; the main process has no pino. Piped to stderr so it shows
// up when running `npm start` from a terminal and in packaged crash reports.
function log(...args) {
  console.error('[companybrain:desktop]', ...args);
}

// --- Single instance lock --------------------------------------------------
// Second launch focuses the existing window instead of starting a second server
// (which would fail to bind port 4317 anyway). requestSingleInstanceLock must be
// be called before app.ready fires.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log('another instance is already running — exiting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance — focus our window.
    log('second instance detected — focusing existing window.');
    showMainWindow();
  });
}

// --- Server lifecycle ------------------------------------------------------

// Spawn the companybrain server as a child node process. The child inherits the
// app's PATH/env so it can resolve node_modules, then we override HOST/PORT to
// force localhost binding.
function startServer() {
  if (!fs.existsSync(SERVER_PATH)) {
    log(`FATAL: server bundle not found at ${SERVER_PATH}`);
    log('Build it first from the repo root: pnpm build  (produces dist/server.js)');
    return;
  }

  // Force the child to bind loopback only — never expose the desktop server to
  // the LAN. Inherit the rest of the env (HOME for ~/.companybrain, etc.).
  const env = {
    ...process.env,
    COMPANYBRAIN_PORT: String(PORT),
    COMPANYBRAIN_HOST: HOST,
    // The server normally opens a browser tab on boot; the desktop app is the
    // browser, so suppress that to avoid a duplicate tab.
    COMPANYBRAIN_NO_OPEN: '1',
  };

  log(`spawning server: node ${SERVER_PATH}`);
  serverProc = spawn('node', [SERVER_PATH], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  // Surface the server's stdout/stderr in the desktop log stream, tagged so the
  // two are distinguishable. This is invaluable for debugging packaged builds.
  serverProc.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
  serverProc.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));

  serverProc.on('error', (err) => log('server spawn error:', err));

  serverProc.on('exit', (code, signal) => {
    log(`server exited (code=${code} signal=${signal})`);
    serverProc = null;
    // If the server dies unexpectedly while the app is still running, quit —
    // the window has nothing to talk to. Don't trigger this during a clean quit.
    if (!isQuitting) {
      log('server died unexpectedly — quitting desktop app.');
      app.quit();
    }
  });
}

// Poll /health until it returns 200 or the timeout elapses. Resolves true/false.
function waitForServer() {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const tick = () => {
      const req = http.get(HEALTH_URL, (res) => {
        // Drain so the socket can be reused/freed.
        res.resume();
        if (res.statusCode === 200) {
          serverReady = true;
          log('server is healthy');
          return resolve(true);
        }
        scheduleNext();
      });
      req.on('error', () => scheduleNext()); // ECONNREFUSED while booting — normal
      req.setTimeout(HEALTH_POLL_MS, () => {
        req.destroy();
        scheduleNext();
      });
    };

    const scheduleNext = () => {
      if (Date.now() - startedAt >= HEALTH_TIMEOUT_MS) {
        log(`server did not become healthy within ${HEALTH_TIMEOUT_MS}ms`);
        return resolve(false);
      }
      setTimeout(tick, HEALTH_POLL_MS);
    };

    tick();
  });
}

// Kill the child server cleanly. We try SIGTERM (lets fastify close gracefully)
// then escalate to SIGKILL if it doesn't exit within a few seconds. Idempotent.
async function stopServer() {
  const proc = serverProc;
  if (!proc) return;
  serverProc = null;

  const pid = proc.pid;
  log(`stopping server (pid=${pid})`);

  await new Promise((resolve) => {
    const killTimer = setTimeout(() => {
      log('server did not exit on SIGTERM — sending SIGKILL');
      try {
        proc.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      resolve();
    }, 4000);

    proc.once('exit', () => {
      clearTimeout(killTimer);
      resolve();
    });

    try {
      proc.kill('SIGTERM');
    } catch {
      clearTimeout(killTimer);
      resolve();
    }
  });
}

// --- Windows ---------------------------------------------------------------

// Liquid Glass loading splash. Frameless, transparent, centered — shown the
// instant the app starts so the user sees something immediately while the server
// boots. Destroyed once the main window's web contents finish loading.
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 560,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    center: true,
    show: true,
    alwaysOnTop: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      // The splash is static markup — no node, no preload needed.
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'index.html'));

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

// The main app window. Loads the server's web UI (http://127.0.0.1:4317/). Kept
// hidden until its contents are ready so the user never sees a blank browser
// frame — the splash covers that gap.
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false, // reveal on 'did-finish-load' (see below)
    backgroundColor: '#0b0d12',
    title: 'CompanyBrain',
    // A subtle dark title bar matches the Liquid Glass aesthetic; the web UI
    // paints its own chrome. titleBarStyle hiddenInset on mac gives the traffic
    // lights hover overlay.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false, // security: renderer has no Node access
      contextIsolation: true, // security: preload runs in isolated world
      sandbox: true,
      spellcheck: true,
    },
  });

  // Forward external link clicks (target=_blank) to the OS browser, never a new
  // Electron window. Keeps the app a single window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Once the UI has actually rendered, hide the splash and show the window.
  mainWindow.webContents.on('did-finish-load', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // If the page crashes hard, reload once.
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log('renderer gone:', details.reason);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
  });

  mainWindow.on('close', (e) => {
    // On macOS the convention is to keep the app alive when the window closes.
    // We honor that unless the user explicitly Quit (which sets isQuitting).
    if (!isQuitting && process.platform === 'darwin') {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(BASE_URL + '/');

  // Wire up renderer → main control channel (quit / version / open-external).
  // See preload.cjs for the exposed surface.
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:quit', () => app.quit());
  ipcMain.handle('app:open-external', (_e, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      return shell.openExternal(url);
    }
    return null;
  });
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

// --- Application menu ------------------------------------------------------
// A conventional menu bar with the standard roles so keyboard shortcuts
// (Cmd+C/V, Cmd+W, etc.) work on every platform.
function buildAppMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // App menu (mac only) — About / Quit.
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about', label: 'About CompanyBrain' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [isMac ? { role: 'close' } : { role: 'quit', label: 'Quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
              { type: 'separator' },
              { label: 'Speech', submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }] },
            ]
          : [{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }]),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'minimize' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    {
      role: 'help',
      submenu: [
        { label: 'About CompanyBrain', click: () => showAbout() },
        { label: 'Visit vexocore.in', click: () => shell.openExternal('https://vexocore.in') },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showAbout() {
  // Simple informational alert — keeps dependencies minimal (no about panel UI).
  const { dialog } = require('electron');
  dialog.showMessageBox({
    type: 'info',
    title: 'CompanyBrain',
    message: 'CompanyBrain',
    detail: `Version ${app.getVersion()}\nA team operating system that never lets a loop slip.\n\nServer: ${BASE_URL}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}`,
    buttons: ['OK'],
  });
}

// --- System tray -----------------------------------------------------------
// A persistent tray icon with Open/Quit. Lets the app keep running in the
// background on Windows/Linux even after the window is closed (matches the
// "always-on team brain" product model). On mac the dock serves a similar role.
function createTray() {
  // We build a 1x1 transparent image if no icon file ships yet, so the tray
  // works out of the box. Replace desktop/build/icon.png with a real 22x22 PNG.
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  let image;
  try {
    image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) image = nativeImage.createEmpty();
  } catch {
    image = nativeImage.createEmpty();
  }

  tray = new Tray(image);
  tray.setToolTip('CompanyBrain');

  const menu = Menu.buildFromTemplate([
    { label: 'Open CompanyBrain', click: () => showMainWindow() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);

  // Click the tray icon (win/linux) to reopen the window.
  tray.on('click', () => showMainWindow());
}

// --- App lifecycle wiring --------------------------------------------------

// Hide the dock icon on macOS until we have a window — avoids a bouncy tile
// with no window during the brief server-boot window.
if (process.platform === 'darwin') {
  app.dock.hide();
}

app.whenReady().then(async () => {
  buildAppMenu();
  createTray();
  createSplash();

  // Start the server and wait for it. The splash is already showing.
  startServer();
  const ok = await waitForServer();

  if (!ok) {
    log('server failed to start — the splash will stay visible with an error.');
    // Tell the splash to show an error state (renderer.js listens for this).
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send('server-error');
    }
    return;
  }

  createMainWindow();
  if (process.platform === 'darwin') app.dock.show();
});

// Clean up the child server on quit. We intercept before-quit so we can run the
// graceful shutdown, then complete the quit once the server is gone.
app.on('before-quit', async (e) => {
  if (isQuitting) return; // already handling
  isQuitting = true;
  if (serverProc) {
    e.preventDefault(); // pause the quit until the server is stopped
    log('before-quit: stopping server…');
    await stopServer();
    app.quit(); // re-issue quit now that cleanup is done
  }
});

// mac: re-show the window when the user clicks the dock icon.
app.on('activate', () => {
  if (mainWindow) {
    showMainWindow();
  } else if (serverReady) {
    createMainWindow();
  }
});

// Final safety net — make sure the child is dead if the process is killed.
app.on('will-quit', () => {
  if (serverProc) {
    try {
      serverProc.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  }
});

// Keep a reference so net/http are treated as used (defensive; some bundlers
// tree-shake otherwise). No runtime effect.
void net;
