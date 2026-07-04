// companybrain desktop — splash renderer (plain browser JS, no framework).
//
// This script runs ONLY inside the loading splash (index.html). The real product
// UI is served by the companybrain server and loaded into the main window; this
// just keeps the splash's status line in sync and surfaces a clear error if the
// server never comes up. It has no Node access (contextIsolation: true).

(function () {
  'use strict';

  const statusEl = document.getElementById('status');
  const textEl = document.getElementById('status-text');

  // Rotating messages so the splash feels alive during a slow cold boot (the
  // SQLite migration + worker scheduling on first run can take a few seconds).
  const MESSAGES = [
    'Starting your workspace…',
    'Booting SQLite + workers…',
    'Loading channels…',
    'Almost there…',
  ];
  let msgIndex = 0;

  const timer = setInterval(() => {
    msgIndex = (msgIndex + 1) % MESSAGES.length;
    if (textEl) textEl.textContent = MESSAGES[msgIndex];
  }, 2200);

  // The main process sends 'server-error' if /health never returns 200 within
  // the timeout (main.cjs waitForServer). Swap the spinner for an error state
  // and tell the user how to recover.
  window.electron?.ipcRenderer?.on?.('server-error', () => {
    clearInterval(timer);
    statusEl?.classList.add('is-error');
    if (textEl) {
      textEl.textContent =
        'Could not start the local server. Check the terminal, then relaunch.';
    }
  });

  // The preload exposes window.companybrain, but the splash window intentionally
  // has NO preload (it's static markup), so window.companybrain is undefined
  // here. The main window (which does have the preload) doesn't load this file.
})();
