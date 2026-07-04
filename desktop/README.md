# CompanyBrain Desktop

A thin **Electron** shell that wraps the CompanyBrain server into a native
desktop app for **macOS, Windows, and Linux**. The desktop app is *not* a
re-implementation — it spawns the same `dist/server.js` bundle the web app uses,
waits for it to come up, then loads the server's own web UI into a window. All
product logic (channels, loops, SQLite, workers) lives in the server; the
desktop layer just adds a native chrome, system tray, single-instance behavior,
and clean lifecycle management.

---

## 1. Prerequisites

The desktop app needs the **server bundle** (`dist/server.js`) and its
`node_modules/` to exist. From the **repo root** (one level up from this
`desktop/` folder), run:

```sh
pnpm install
pnpm build        # produces ../dist/server.js (and the rest of dist/)
```

> The desktop app does **not** have its own copy of the server's dependencies at
> dev time — it runs the bundle produced by the monorepo's build step. In a
> packaged build, electron-builder copies `../dist` and `../node_modules` into
> the app's resources (see [`electron-builder.yml`](./electron-builder.yml)).

You also need Node.js (the version pinned in the repo root) installed, because
the desktop app spawns a child `node` process to run the server even when
packaged.

## 2. Development

```sh
cd desktop
npm install        # electron + electron-builder
npm start          # launches electron .
```

What `npm start` does:

1. Electron loads `main.cjs` (the main process).
2. `main.cjs` shows a Liquid Glass **splash** window immediately.
3. It spawns the server: `node ../dist/server.js` with
   `COMPANYBRAIN_PORT=4317` and `COMPANYBRAIN_HOST=127.0.0.1` (loopback only —
   the desktop server is **never** exposed to the LAN).
4. It polls `http://127.0.0.1:4317/health` every 300 ms (timeout 15 s).
5. Once healthy, it opens the **main BrowserWindow** pointed at
   `http://127.0.0.1:4317/`, closes the splash, and you're in.

`Ctrl/Cmd+R` reloads the UI; `Ctrl/Cmd+Shift+I` opens DevTools (handy — the
loaded UI is the real server UI, so you can inspect it exactly as in a browser).

## 3. Packaging installers

```sh
# Build for the CURRENT OS you're running on:
npm run dist

# Or target a specific platform:
npm run dist:mac      # → release/CompanyBrain-<ver>.dmg  and .zip
npm run dist:win      # → release/CompanyBrain Setup <ver>.exe   (NSIS)
npm run dist:linux    # → release/CompanyBrain-<ver>.AppImage
```

Installers/output land in [`release/`](./release) (gitignored).

**Cross-building notes:**

- `npm run dist:win` **from macOS** requires either
  [`wine`](https://www.winehq.org/) locally (for code-signing/resource steps)
  or, more reliably, running it on a Windows VM (Parallels / VMware) or in CI
  (GitHub Actions `windows-latest` runner). Code-signing a Windows build still
  needs an authenticode cert — without one the installer works but Windows
  SmartScreen will warn.
- `npm run dist:mac` should run on macOS (Apple Silicon or Intel). Notarization
  requires Apple Developer credentials supplied via env vars in CI; locally it's
  skipped and produces an unsigned `.app`/`.dmg`.
- Linux AppImages build on any host.

See [`build/README.md`](./build/README.md) for the icon files you need to drop
into [`build/`](./build) before publishing a branded release.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Electron main process (main.cjs)                            │
│                                                              │
│   ┌────────────┐   spawn    ┌─────────────────────────────┐  │
│   │            │ ─────────► │ node dist/server.js         │  │
│   │  main.cjs  │            │  (child process)            │  │
│   │            │ ◄───────── │  binds 127.0.0.1:4317       │  │
│   │            │  /health   │  reads/writes ~/.companybrain │
│   └─────┬──────┘   poll     └─────────────────────────────┘  │
│         │                                                    │
│         │ loadURL(http://127.0.0.1:4317/)                    │
│         ▼                                                    │
│   ┌──────────────────────────┐  preload.cjs (contextBridge)  │
│   │  BrowserWindow           │ ────────────────────────────► │
│   │  (renders server's UI)   │   exposes window.companybrain │
│   └──────────────────────────┘   (version / openExternal /   │
│                                  quit)                       │
└─────────────────────────────────────────────────────────────┘
```

**Key design points:**

- **One app, one server, one window.** A single-instance lock
  (`app.requestSingleInstanceLock`) prevents a second launch from spawning a
  second server (which couldn't bind 4317 anyway); instead it focuses the
  existing window.
- **Loopback-only.** The child server is told `COMPANYBRAIN_HOST=127.0.0.1`, so
  it only accepts connections from the local machine. The desktop server is not
  reachable from the network.
- **Lifecycle is bound.** `'before-quit'` SIGTERMs the child (SIGKILLs after 4 s
  if it hangs), and a `'will-quit'` safety net force-kills it. If the server
  dies on its own while the app is running, the app quits (the window has
  nothing to talk to). Quitting the app therefore never leaves an orphaned
  `node server.js` holding port 4317.
- **System tray.** A tray icon with **Open** / **Quit** lets the app keep
  running in the background after the window closes (Windows/Linux). On macOS
  the Dock plays that role; closing the window just hides it unless you Quit.
- **Splash → main.** The splash (`index.html` + `styles.css` + `renderer.js`)
  is shown instantly; it's replaced by the server UI once `/health` is green, so
  the user never stares at a blank window during the SQLite boot.
- **Security.** The renderer has `nodeIntegration: false`,
  `contextIsolation: true`, and `sandbox: true`. The only bridge to the host is
  the tiny audited API in `preload.cjs` (`window.companybrain`). External links
  (`target=_blank`) are routed to the user's default browser via
  `shell.openExternal`, never to a new Electron window.

### How the data dir works

The server stores everything under **`~/.companybrain/`** (created on first
run): the **SQLite** database, attachments, logs, and worker state. This dir is
read by the child server the same way the CLI/web server reads it — the desktop
app does **not** touch it directly.

Because `~/.companybrain/` lives outside the app bundle/install location, your
data **persists across app updates and reinstalls**. Uninstalling the desktop
app does **not** delete it; remove the folder manually if you want a truly clean
slate:

```sh
rm -rf ~/.companybrain        # macOS / Linux
rmdir /S "%USERPROFILE%\.companybrain"   # Windows
```

The desktop app's only concern with the data dir is that the child server has
read/write access to `$HOME` (the parent env is inherited, so this just works).

---

## Files in this folder

| File | Role |
| --- | --- |
| [`main.cjs`](./main.cjs) | Electron main process — server lifecycle, windows, tray, menu. |
| [`preload.cjs`](./preload.cjs) | contextBridge — the only `window.companybrain` API exposed to the UI. |
| [`renderer.js`](./renderer.js) | Splash-window script (rotating status, error state). |
| [`index.html`](./index.html) | Liquid Glass splash markup. |
| [`styles.css`](./styles.css) | Splash styles (frosted glass + aurora). |
| [`electron-builder.yml`](./electron-builder.yml) | Packaging config (targets, extraResources, icons). |
| [`build/`](./build) | Icon assets (`icon.icns` / `icon.ico` / `icon.png`) — see [`build/README.md`](./build/README.md). |
| [`release/`](./release) | Build output (gitignored). |
