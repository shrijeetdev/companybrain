# companybrain — Agent Task Specifications

> **Single-agent or multi-agent**: each section below is self-contained. Give one section to one agent. Every section starts with the exact files to touch and ends with a verification checklist.

---

## 0. MUST-READ BEFORE ANY TASK

### Architecture — never break this
- **One process, one file**: everything lives in `packages/server/src/web-ui.ts`. It exports `renderUi()` which returns a complete HTML string. Fastify serves it at `/`. No React, no Vite, no separate frontend server.
- **Build command**: after every change to `web-ui.ts` you MUST run `node scripts/build.mjs` from the repo root. The server reads `dist/server.js`, not the TypeScript source.
- **Restart server**: after rebuilding, kill the old process (`lsof -ti :4317 | xargs kill -9`) and restart with `node dist/server.js` (or whatever the start script is).
- **Database**: SQLite in-process via `@companybrain/db`. Never add a separate database server.

### The apostrophe rule — CRITICAL
Inside the TypeScript template literal that wraps the entire HTML, esbuild **strips backslash-escapes**. This means `\'` inside a JS string in the template literal becomes `'` which breaks the JS parser.

**Wrong** (causes runtime JS syntax error):
```js
return '<div>We\'ll notify you.</div>';
```

**Correct** (use HTML entity in HTML strings):
```js
return '<div>We&#39;ll notify you.</div>';
```

Or use double-quoted JS strings for values containing apostrophes:
```js
var msg = "we'll notify you";   // OK — double quotes
```

### Design tokens — use these CSS variables everywhere
```css
/* LIGHT theme (default) */
--bg: #f0f2f7          /* page background */
--surface: #ffffff      /* card background */
--glassBorder: rgba(0,0,0,.08)
--text: #111827
--muted: #6b7280
--faint: #9ca3af
--accent: #3e7bfa       /* blue — primary action */
--accent2: #5b93ff
--accentSoft: rgba(62,123,250,.1)
--accentGlow: rgba(62,123,250,.2)
--green: #10b981
--amber: #f59e0b
--red: #ef4444
--teal: #14b8a6
--shadow: 0 1px 3px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.05)

/* DARK theme override — [data-theme="dark"] on <html> */
--bg: #0a0b0f
--surface: rgba(20,20,26,.62)
--glassBorder: rgba(255,255,255,.1)
--text: #eef0f5
--muted: #9a9aa8
```

### Existing API endpoints (all working, do NOT recreate)
```
GET  /api/loops               GET  /api/tasks
POST /api/loops               POST /api/tasks
POST /api/loops/:id/close     POST /api/tasks/:id/complete
POST /api/loops/:id/snooze    POST /api/tasks/:id/move
POST /api/loops/:id/assign    POST /api/tasks/:id/assign

GET  /api/leads               GET  /api/agents
POST /api/leads               GET  /api/autonomy
POST /api/leads/:id/advance   PUT  /api/autonomy
POST /api/leads/:id/assign    GET  /api/approvals
POST /api/leads/quick-add     POST /api/approvals/:id/approve
                              POST /api/approvals/:id/dismiss
GET  /api/events
POST /api/events/:id/undo
GET  /api/connections
GET  /api/me
```

### JS helpers already in web-ui.ts (reuse, don't rewrite)
```js
esc(s)                    // HTML-escape a string
api(path, opts)           // fetch → JSON
post(path, body, method)  // POST → JSON
ago(ts)                   // "3h", "2d" etc from timestamp
ageCls(ts)                // "age-fresh" | "age-mid" | "age-old"
stageCls(s)               // "lead-stage-new" | ...
autoBadge(a)              // autonomy badge HTML
todayStr()                // "2026-07-02"
avatarHtml(id, opts)      // single avatar div
avatarStackHtml(ids,opts) // stacked avatar divs
progBar(done, total)      // progress bar HTML
toast(msg, onUndo)        // show bottom toast
userFor(id)               // { name, initials, color }
```

### CSS classes already defined (reuse)
`.gc` — glass card (white in light, dark glass in dark mode)  
`.btn-primary` `.btn-ghost` `.btn-danger`  
`.seg-bar` `.seg-btn .on`  
`.spin` `.empty` `.empty-dashed`  
`.acct-avatar` `.acct-stack` `.acct-row`  
`.age-pill .age-fresh .age-mid .age-old`  
`.stage-pill .lead-stage-*`  
`.auto-badge .auto-auto .auto-ask .auto-off`  
`.sec-head` `.sec-title` `.sec-sub` `.head-actions`

---

## TASK GROUP A — Theme Overhaul (4 tasks)

**Agent A** owns this entire group. Do all 4 together — they are interdependent.

**Files to edit**: `packages/server/src/web-ui.ts` only.

---

### A1 — Light-first CSS variables

**What to do**: Replace the current `:root` CSS block (lines ~17–29) with a light theme and add a `[data-theme="dark"]` override block.

**Current `:root`** (lines 17–29 in web-ui.ts):
```css
:root {
  --bg:#0a0b0f; --surface:rgba(20,20,26,.62); ...
  --accent:#8b7bff; ...
}
```

**Replace with**:
```css
:root {
  --bg:#f0f2f7; --bg2:#e8eaf0;
  --surface:#ffffff; --surface2:#f5f6fb;
  --glass:rgba(255,255,255,.8); --glassThin:rgba(255,255,255,.72);
  --glassBorder:rgba(0,0,0,.08); --glassHi:rgba(255,255,255,.95);
  --text:#111827; --muted:#6b7280; --faint:#9ca3af;
  --accent:#3e7bfa; --accent2:#5b93ff;
  --accentSoft:rgba(62,123,250,.1); --accentGlow:rgba(62,123,250,.2);
  --green:#10b981; --greenSoft:rgba(16,185,129,.1);
  --amber:#f59e0b; --amberSoft:rgba(245,158,11,.12);
  --red:#ef4444; --redSoft:rgba(239,68,68,.12);
  --teal:#14b8a6; --tealSoft:rgba(20,184,166,.12);
  --violet:#7c3aed; --violetSoft:rgba(124,58,237,.12);
  --scroll:rgba(0,0,0,.1);
  --shadow:0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.05);
  --shadow-md:0 2px 8px rgba(0,0,0,.1);
  --shadow-lg:0 8px 32px rgba(0,0,0,.12);
  --nav-w:220px;
  --b1c:rgba(62,123,250,.1); --b2c:rgba(20,184,166,.08); --b3c:rgba(245,158,11,.06);
  --m1c:rgba(62,123,250,.08); --m2c:rgba(20,184,166,.06); --m3c:rgba(124,58,237,.08);
}
[data-theme="dark"] {
  --bg:#0a0b0f; --bg2:#111318;
  --surface:rgba(20,20,26,.62); --surface2:rgba(255,255,255,.04);
  --glass:rgba(20,20,26,.7); --glassThin:rgba(15,17,23,.62);
  --glassBorder:rgba(255,255,255,.1); --glassHi:rgba(255,255,255,.12);
  --text:#eef0f5; --muted:#9a9aa8; --faint:#6b6b78;
  --scroll:rgba(160,160,180,.22);
  --shadow:0 4px 16px rgba(0,0,0,.25);
  --shadow-md:0 6px 20px rgba(0,0,0,.3);
  --shadow-lg:0 8px 32px rgba(0,0,0,.4);
  --b1c:rgba(62,123,250,.28); --b2c:rgba(91,141,239,.22); --b3c:rgba(232,161,58,.14);
  --m1c:rgba(22,207,152,.22); --m2c:rgba(91,141,239,.18); --m3c:rgba(124,79,208,.18);
}
```

Also update `<html lang="en">` → `<html lang="en" data-theme="light">`.

Also update the `.gc` class so dark mode adds blur/glass effect:
```css
.gc { background:var(--surface); border:1px solid var(--glassBorder); box-shadow:var(--shadow); border-radius:16px; }
[data-theme="dark"] .gc { backdrop-filter:blur(20px) saturate(150%); -webkit-backdrop-filter:blur(20px) saturate(150%); box-shadow:inset 0 1px 0 var(--glassHi),0 4px 16px rgba(0,0,0,.14); }
```

Update the `.grain` opacity: in light mode it should be `opacity:.02`, in dark `opacity:.04`. Add:
```css
[data-theme="dark"] #grain { opacity:.04; }
```

---

### A2 — Replace purple accent with blue

Every hardcoded purple reference in the CSS must change to blue. Search for and replace:
- `#8b7bff` → `#3e7bfa`
- `#a78bff` → `#5b93ff`
- `rgba(139,123,255` → `rgba(62,123,250`

Also update THEMES array in JS: the `default` theme's swatch should be `linear-gradient(135deg,#3e7bfa,#16b7ae)`.

Update the `.nav-item.active` class to use blue:
```css
.nav-item.active { background:var(--accentSoft); color:var(--accent); }
```

Update `.role-chip.on`:
```css
.role-chip.on { background:var(--accentSoft); color:var(--accent); border-color:rgba(62,123,250,.3); }
```

Update `.brief-label`, `.role-panel-lbl` → color `var(--accent)`.

Update the quick-add button gradient: `linear-gradient(135deg,var(--accent),var(--accent2))`.

Update cmd palette hover: `.cmd-item:hover,.cmd-item.sel { background:var(--accentSoft); }`.

---

### A3 — Dark mode toggle button

**In the sidebar HTML** (inside `#sidebar`, in the `.sidebar-bot` div), add after the `.role-switcher` block:
```html
<button class="dark-toggle" id="dark-toggle-btn">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
  <span id="dark-toggle-label">Dark mode</span>
</button>
```

**In the topbar HTML** (mobile), add before `#notif-btn`:
```html
<button class="topbar-dark-toggle" id="topbar-dark-toggle">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
</button>
```

**CSS** (add to stylesheet):
```css
.dark-toggle { display:flex; align-items:center; gap:8px; padding:7px 10px; border-radius:9px; border:1px solid var(--glassBorder); background:transparent; font-size:11px; font-weight:500; color:var(--muted); width:100%; min-height:34px; cursor:pointer; }
.dark-toggle:hover { background:var(--bg2); color:var(--text); }
.topbar-dark-toggle { width:36px; height:36px; border-radius:9px; border:1px solid var(--glassBorder); background:transparent; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--muted); }
.topbar-dark-toggle:hover { background:var(--bg2); color:var(--text); }
```

**JS** (add near bottom of IIFE, before the `buildNav()` boot call):
```js
var darkMode = localStorage.getItem('cb-dark') === '1';
function applyDark(on) {
  darkMode = on;
  document.documentElement.dataset.theme = on ? 'dark' : 'light';
  localStorage.setItem('cb-dark', on ? '1' : '0');
  var lbl = document.getElementById('dark-toggle-label');
  if (lbl) lbl.textContent = on ? 'Light mode' : 'Dark mode';
}
applyDark(darkMode);
var dtBtn = document.getElementById('dark-toggle-btn');
var dtBtnTop = document.getElementById('topbar-dark-toggle');
if (dtBtn) dtBtn.onclick = function() { applyDark(!darkMode); };
if (dtBtnTop) dtBtnTop.onclick = function() { applyDark(!darkMode); };
```

---

### A4 — Sidebar + card visual update for light mode

In light mode, the sidebar needs a left border but no dark glass. Update:
```css
#sidebar {
  background: var(--glassThin);
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  border-right: 1px solid var(--glassBorder);
}
```

Topbar:
```css
#topbar { background:var(--glassThin); backdrop-filter:blur(24px) saturate(150%); border-bottom:1px solid var(--glassBorder); }
```

Quick-add bar:
```css
#qbar { background:var(--glassThin); backdrop-filter:blur(24px) saturate(150%); border-top:1px solid var(--glassBorder); }
```

The briefing stat backgrounds should use `var(--bg2)` in light mode (change from `rgba(255,255,255,.04)`):
```css
.brief-stat { background:var(--bg2); border:1px solid var(--glassBorder); }
[data-theme="dark"] .brief-stat { background:rgba(255,255,255,.04); }
```

**Verification checklist for Agent A:**
- [ ] Page loads with white background and blue accent by default
- [ ] Cards are white with soft shadows (not dark glass)
- [ ] Dark mode toggle switches to dark glass theme and back
- [ ] All text remains readable in both themes
- [ ] Blobs are visible (subtle) in light mode
- [ ] Rebuilt with `node scripts/build.mjs`, no syntax errors
- [ ] Run `node --input-type=module < dist/server.js` or extract JS and `node --check` to verify

---

## TASK GROUP B — Tasks Kanban Board (4 tasks)

**Agent B** owns this group. Replace the current segment-tab task list with a proper Kanban board.

**Files to edit**: `packages/server/src/web-ui.ts` only.

---

### B1 — Kanban CSS

Add these CSS classes to the stylesheet (before the closing `</style>`):

```css
/* ── KANBAN BOARD ─────────────────────────────────── */
.kanban-wrap { margin-top:4px; }
.overdue-strip { display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:11px; background:rgba(239,68,68,.08); border:1px solid rgba(239,68,68,.18); margin-bottom:14px; }
.overdue-strip-count { font-family:'JetBrains Mono',monospace; font-size:13px; font-weight:700; color:var(--red); }
.overdue-strip-label { font-size:12.5px; color:var(--red); flex:1; }
.kanban-board { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
.kanban-col { min-width:0; }
.kanban-col-head { display:flex; align-items:center; gap:7px; padding:0 2px 10px; }
.kanban-col-dot { width:8px; height:8px; border-radius:2px; flex-shrink:0; }
.kanban-col-label { font-family:'JetBrains Mono',monospace; font-size:10px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; color:var(--muted); }
.kanban-col-count { margin-left:auto; font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--faint); }
.kanban-col-body { display:flex; flex-direction:column; gap:7px; min-height:80px; }
.kanban-task-card { padding:11px 13px; border-radius:12px; }
.kanban-task-card.overdue { border-left:3px solid var(--red); border-top-left-radius:9px; border-bottom-left-radius:9px; }
.kanban-task-card.due-soon { border-left:3px solid var(--amber); border-top-left-radius:9px; border-bottom-left-radius:9px; }
.kanban-task-row { display:flex; align-items:flex-start; gap:8px; }
.kanban-check { width:17px; height:17px; border-radius:50%; border:2px solid var(--glassBorder); background:transparent; flex-shrink:0; margin-top:2px; cursor:pointer; transition:border-color .15s,background .15s; min-height:17px; }
.kanban-check:hover { border-color:var(--green); background:var(--greenSoft); }
.kanban-task-emoji { font-size:13px; flex-shrink:0; margin-top:1px; }
.kanban-task-title { font-size:13px; font-weight:600; color:var(--text); line-height:1.3; flex:1; }
.kanban-task-sub { font-size:10.5px; color:var(--muted); margin-top:3px; }
.kanban-task-foot { display:flex; align-items:center; gap:6px; margin-top:7px; flex-wrap:wrap; }
.priority-pill { font-size:9px; font-weight:700; padding:2px 6px; border-radius:5px; font-family:'JetBrains Mono',monospace; white-space:nowrap; }
.priority-high { background:var(--redSoft); color:var(--red); }
.priority-med { background:var(--amberSoft); color:var(--amber); }
.priority-low { background:var(--greenSoft); color:var(--green); }
.kanban-add-btn { display:flex; align-items:center; gap:7px; padding:8px 10px; border-radius:10px; border:1.5px dashed var(--glassBorder); background:transparent; color:var(--faint); font-size:12px; width:100%; cursor:pointer; margin-top:5px; min-height:34px; transition:all .15s; }
.kanban-add-btn:hover { border-color:var(--accent); color:var(--accent); background:var(--accentSoft); }

@media(max-width:700px) {
  .kanban-board { display:flex; gap:12px; overflow-x:auto; padding-bottom:8px; -webkit-overflow-scrolling:touch; }
  .kanban-col { min-width:230px; flex-shrink:0; }
}
```

---

### B2 — Replace `loadTasks()` with Kanban implementation

Find the entire `loadTasks()` function (lines ~722–771) and replace it with:

```js
function loadTasks() {
  api('/api/tasks').then(function(tasks) {
    tasks = tasks || [];
    var today = todayStr();
    var tmr = new Date(); tmr.setDate(tmr.getDate() + 1); var tmrStr = tmr.toISOString().slice(0, 10);
    function isOverdue(t) { return t.day && t.day < today && !t.completed; }
    function isDueSoon(t) { return t.dueAt && t.dueAt > Date.now() && t.dueAt < Date.now() + 86400e3; }
    var overdueAll = tasks.filter(isOverdue);
    var todayTasks = tasks.filter(function(t) { return t.day === today || (!t.day && !isOverdue(t)); });
    var tmrTasks = tasks.filter(function(t) { return t.day === tmrStr; });
    var upcomingTasks = tasks.filter(function(t) { return t.day && t.day > tmrStr; });

    var html = '<div class="sec-head"><div><div class="sec-title">Tasks</div>'
      + '<div class="sec-sub">Your board — what needs doing and when.</div></div>'
      + '<div class="head-actions">'
      + '<button class="btn-primary" id="new-task-btn">+ New task</button>'
      + '</div></div>'
      + '<div class="kanban-wrap">'
      + (overdueAll.length ? '<div class="overdue-strip"><span class="overdue-strip-count">' + overdueAll.length + '</span><span class="overdue-strip-label">overdue — move them or complete them</span></div>' : '')
      + '<div class="kanban-board">'
      + kanbanCol('TODAY', '#ef4444', todayTasks, 'today')
      + kanbanCol('TOMORROW', '#f59e0b', tmrTasks, 'tomorrow')
      + kanbanCol('UPCOMING', '#3e7bfa', upcomingTasks, 'upcoming')
      + '</div></div>';
    view.innerHTML = html;

    view.querySelector('#new-task-btn').onclick = function() { openNewTaskModal(); };
    view.querySelectorAll('[data-done]').forEach(function(b) { b.onclick = function() { post('/api/tasks/' + b.dataset.done + '/complete').then(function() { toast('Task done'); loadTasks(); }); }; });
    view.querySelectorAll('[data-move]').forEach(function(b) { b.onclick = function() { post('/api/tasks/' + b.dataset.move + '/move', { day: b.dataset.day }).then(function() { toast('Moved'); loadTasks(); }); }; });
  }).catch(function(e) { view.innerHTML = '<div class="empty">Failed to load tasks.</div>'; });
}

function kanbanCol(label, dotColor, items, colDay) {
  var cards = items.length ? items.map(function(t) {
    var od = t.day && t.day < todayStr();
    var ds = !od && isDueSoon(t);
    var pr = t.priority === 'high' ? '<span class="priority-pill priority-high">HIGH</span>'
      : t.priority === 'med' ? '<span class="priority-pill priority-med">MED</span>' : '';
    return '<div class="kanban-task-card gc' + (od ? ' overdue' : ds ? ' due-soon' : '') + '">'
      + '<div class="kanban-task-row">'
      + '<button class="kanban-check" data-done="' + t.id + '"></button>'
      + '<span class="kanban-task-emoji">' + esc(t.emoji || '📝') + '</span>'
      + '<div style="flex:1;min-width:0;">'
      + '<div class="kanban-task-title">' + esc(t.title) + '</div>'
      + '<div class="kanban-task-sub">' + esc(t.list || 'Inbox') + '</div>'
      + '</div></div>'
      + '<div class="kanban-task-foot">' + pr
      + (colDay !== 'today' ? '<button class="btn-ghost" data-move="' + t.id + '" data-day="today" style="font-size:10px;padding:3px 8px;min-height:24px;">→ Today</button>' : '')
      + '</div></div>';
  }).join('') : '<div class="empty-dashed" style="font-size:11px;padding:16px 12px;">No tasks for ' + label.toLowerCase() + '.</div>';
  return '<div class="kanban-col">'
    + '<div class="kanban-col-head"><span class="kanban-col-dot" style="background:' + dotColor + '"></span>'
    + '<span class="kanban-col-label">' + label + '</span>'
    + '<span class="kanban-col-count">' + items.length + '</span></div>'
    + '<div class="kanban-col-body">' + cards
    + '<button class="kanban-add-btn" id="kadd-' + colDay + '">+ Add</button>'
    + '</div></div>';
}

function isDueSoon(t) { return t.dueAt && t.dueAt > Date.now() && t.dueAt < Date.now() + 86400e3; }
```

---

### B3 — New Task Modal (HTML + JS)

**HTML**: Add this inside the `<body>` before the closing `</body>` tag (alongside the other overlays):

```html
<!-- new task modal -->
<div class="modal-backdrop" id="task-modal">
  <div class="modal-box">
    <div class="modal-head">
      <span id="task-modal-emoji" style="font-size:22px;cursor:pointer;" title="Pick emoji">📝</span>
      <span class="modal-title">New task</span>
      <button class="modal-close" id="task-modal-close">×</button>
    </div>
    <div class="modal-body">
      <div class="modal-field">
        <label class="modal-label">Title</label>
        <input class="modal-input" id="task-modal-title" placeholder="What needs doing?" autocomplete="off"/>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="modal-field">
          <label class="modal-label">When</label>
          <select class="modal-select" id="task-modal-when">
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="upcoming">Upcoming</option>
          </select>
        </div>
        <div class="modal-field">
          <label class="modal-label">Priority</label>
          <select class="modal-select" id="task-modal-priority">
            <option value="">None</option>
            <option value="low">Low</option>
            <option value="med">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
      <div class="modal-field">
        <label class="modal-label">List / Project</label>
        <input class="modal-input" id="task-modal-list" placeholder="Inbox" autocomplete="off"/>
      </div>
      <div class="modal-field">
        <label class="modal-label">Repeat</label>
        <select class="modal-select" id="task-modal-repeat">
          <option value="">Off</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn-ghost" id="task-modal-cancel">Cancel</button>
      <button class="btn-primary" id="task-modal-save">Save task</button>
    </div>
  </div>
</div>
```

**CSS** (add to stylesheet):
```css
.modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.35); backdrop-filter:blur(4px); z-index:200; display:none; align-items:center; justify-content:center; padding:16px; }
.modal-backdrop.open { display:flex; }
.modal-box { background:var(--surface); border:1px solid var(--glassBorder); border-radius:20px; width:100%; max-width:480px; max-height:88vh; overflow-y:auto; box-shadow:var(--shadow-lg); animation:cbModalUp .2s ease; }
.modal-head { display:flex; align-items:center; gap:12px; padding:18px 18px 0; }
.modal-title { font-size:15px; font-weight:700; flex:1; }
.modal-close { width:30px; height:30px; border-radius:7px; border:1px solid var(--glassBorder); background:transparent; color:var(--muted); font-size:16px; cursor:pointer; }
.modal-body { padding:16px 18px 4px; }
.modal-foot { display:flex; gap:8px; justify-content:flex-end; padding:12px 18px 18px; }
.modal-field { margin-bottom:13px; }
.modal-label { display:block; font-size:10px; font-weight:600; color:var(--muted); font-family:'JetBrains Mono',monospace; letter-spacing:.5px; text-transform:uppercase; margin-bottom:5px; }
.modal-input,.modal-select { width:100%; padding:9px 12px; border-radius:9px; border:1px solid var(--glassBorder); background:var(--bg2); color:var(--text); font-size:13px; font-family:inherit; }
[data-theme="dark"] .modal-input,[data-theme="dark"] .modal-select { background:rgba(255,255,255,.06); }
.modal-input:focus { border-color:var(--accent); box-shadow:0 0 0 3px var(--accentSoft); outline:none; }
@keyframes cbModalUp { from{opacity:0;transform:translateY(16px) scale(.98)} to{opacity:1;transform:none} }
```

**JS** (add functions near bottom of IIFE):
```js
function openNewTaskModal(day) {
  var m = document.getElementById('task-modal');
  if (!m) return;
  document.getElementById('task-modal-title').value = '';
  document.getElementById('task-modal-when').value = day || 'today';
  m.classList.add('open');
  document.getElementById('task-modal-title').focus();
}
function closeNewTaskModal() {
  var m = document.getElementById('task-modal');
  if (m) m.classList.remove('open');
}
(function() {
  var m = document.getElementById('task-modal');
  if (!m) return;
  document.getElementById('task-modal-close').onclick = closeNewTaskModal;
  document.getElementById('task-modal-cancel').onclick = closeNewTaskModal;
  m.onclick = function(e) { if (e.target === m) closeNewTaskModal(); };
  document.getElementById('task-modal-save').onclick = function() {
    var title = document.getElementById('task-modal-title').value.trim();
    if (!title) return;
    var day = document.getElementById('task-modal-when').value;
    var priority = document.getElementById('task-modal-priority').value;
    var list = document.getElementById('task-modal-list').value.trim();
    post('/api/tasks', { title: title, day: day, priority: priority || undefined, list: list || undefined }).then(function() {
      closeNewTaskModal();
      toast('Task added');
      loadTasks();
    });
  };
})();
```

Also wire up the `+ Add` buttons in kanban columns — add this inside `loadTasks()` after `view.innerHTML = html`:
```js
['today','tomorrow','upcoming'].forEach(function(d) {
  var btn = document.getElementById('kadd-' + d);
  if (btn) btn.onclick = function() { openNewTaskModal(d); };
});
```

---

### B4 — Update qbar for tasks tab

The qbar is still useful for quick keyboard entry. Update the `render()` function so that the qbar still shows for loops and tasks. On the tasks tab, submitting the qbar should call `openNewTaskModal()` with the title pre-filled OR directly POST to `/api/tasks`. The current behavior (direct POST) is fine — no change needed here. Just confirm it still shows.

**Verification checklist for Agent B:**
- [ ] Tasks tab shows 3 side-by-side columns (Today / Tomorrow / Upcoming)
- [ ] Overdue strip appears if any tasks are overdue
- [ ] Each column shows the correct tasks
- [ ] ✓ button completes a task
- [ ] "→ Today" move button works
- [ ] "+ New task" button opens the modal
- [ ] Modal saves and reloads the kanban
- [ ] Mobile: columns scroll horizontally (not wrapped)
- [ ] Rebuilt with `node scripts/build.mjs`, no errors

---

## TASK GROUP C — Leads Kanban Pipeline (3 tasks)

**Agent C** owns this group. Replace the current leads list view with a full pipeline kanban.

**Files to edit**: `packages/server/src/web-ui.ts` only.

---

### C1 — Pipeline CSS

Add to stylesheet:
```css
/* ── PIPELINE BOARD ───────────────────────────────── */
.pipeline-board { display:flex; gap:12px; overflow-x:auto; padding-bottom:12px; -webkit-overflow-scrolling:touch; margin-top:4px; }
.pipeline-board::-webkit-scrollbar { height:4px; }
.pipeline-col { min-width:210px; width:210px; flex-shrink:0; }
.pipeline-col-head { display:flex; align-items:center; gap:6px; padding:0 2px 10px; }
.pipeline-stage-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.pipeline-stage-label { font-family:'JetBrains Mono',monospace; font-size:9.5px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; color:var(--muted); }
.pipeline-col-count { margin-left:auto; font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--faint); }
.pipeline-col-body { display:flex; flex-direction:column; gap:7px; min-height:80px; }
.pipeline-lead-card { padding:11px 12px; border-radius:12px; cursor:pointer; transition:transform .15s, box-shadow .15s; }
.pipeline-lead-card:hover { transform:translateY(-1px); box-shadow:var(--shadow-md); }
.pipeline-lead-avatar { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:11px; font-weight:700; color:#fff; }
.pipeline-lead-name { font-size:12.5px; font-weight:600; color:var(--text); line-height:1.3; }
.pipeline-lead-sub { font-size:10.5px; color:var(--muted); margin-top:2px; }
.pipeline-lead-foot { display:flex; gap:5px; margin-top:8px; flex-wrap:wrap; }
.plead-adv-btn { padding:4px 9px; border-radius:6px; border:1px solid var(--glassBorder); background:var(--surface2); color:var(--muted); font-size:10.5px; font-weight:500; min-height:26px; cursor:pointer; transition:all .15s; }
.plead-adv-btn:hover { background:var(--accentSoft); color:var(--accent); border-color:rgba(62,123,250,.3); }
```

---

### C2 — Replace `loadLeads()` with Pipeline implementation

Replace the entire `loadLeads()` function with:

```js
var LEAD_STAGES = [
  {id:'new',       label:'NEW',       dot:'#9ca3af'},
  {id:'contacted', label:'CONTACTED', dot:'#3e7bfa'},
  {id:'meeting',   label:'MEETING',   dot:'#7c3aed'},
  {id:'proposal',  label:'PROPOSAL',  dot:'#f59e0b'},
  {id:'won',       label:'WON',       dot:'#10b981'},
  {id:'lost',      label:'LOST',      dot:'#ef4444'},
];

function loadLeads() {
  api('/api/leads').then(function(leads) {
    leads = leads || [];
    var html = '<div class="sec-head"><div><div class="sec-title">Leads</div>'
      + '<div class="sec-sub">Pipeline — move each contact toward a close.</div></div>'
      + '<div class="head-actions">'
      + '<button class="btn-primary" id="new-lead-btn">+ New lead</button>'
      + '</div></div>'
      + '<div class="pipeline-board">'
      + LEAD_STAGES.map(function(stage) {
          var stageLeads = leads.filter(function(l) { return (l.stage || 'new') === stage.id; });
          return '<div class="pipeline-col">'
            + '<div class="pipeline-col-head">'
            + '<span class="pipeline-stage-dot" style="background:' + stage.dot + '"></span>'
            + '<span class="pipeline-stage-label">' + stage.label + '</span>'
            + '<span class="pipeline-col-count">' + stageLeads.length + '</span>'
            + '</div>'
            + '<div class="pipeline-col-body">'
            + (stageLeads.length ? stageLeads.map(function(l) {
                var initials = (l.name || '?').trim().split(/\s+/).slice(0,2).map(function(w){return w[0].toUpperCase();}).join('');
                var hue = ((l.name||'A').charCodeAt(0)*37)%360;
                var canAdv = stage.id !== 'won' && stage.id !== 'lost';
                return '<div class="pipeline-lead-card gc" data-lead-id="' + l.id + '">'
                  + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'
                  + '<div class="pipeline-lead-avatar" style="background:hsl(' + hue + ',35%,52%)">' + initials + '</div>'
                  + '<div style="flex:1;min-width:0;">'
                  + '<div class="pipeline-lead-name">' + esc(l.name) + '</div>'
                  + (l.company ? '<div class="pipeline-lead-sub">' + esc(l.company) + '</div>' : '')
                  + '</div></div>'
                  + '<div class="pipeline-lead-foot">'
                  + (canAdv ? '<button class="plead-adv-btn" data-advance="' + l.id + '">Advance →</button>' : '<span class="stage-pill lead-stage-' + stage.id + '">' + stage.label + '</span>')
                  + (l.phone ? '<a class="plead-adv-btn" href="https://wa.me/' + esc(l.phone.replace(/[^0-9]/g,'')) + '" target="_blank" onclick="event.stopPropagation()">WA</a>' : '')
                  + '</div></div>';
              }).join('') : '<div style="font-size:11px;color:var(--faint);padding:10px 2px;">No leads here.</div>')
            + '</div></div>';
        }).join('')
      + '</div>';

    view.innerHTML = html;
    document.getElementById('new-lead-btn').onclick = function() { openNewLeadModal(); };
    view.querySelectorAll('[data-advance]').forEach(function(b) {
      b.onclick = function(e) {
        e.stopPropagation();
        post('/api/leads/' + b.dataset.advance + '/advance').then(function() { toast('Advanced'); loadLeads(); });
      };
    });
  }).catch(function() { view.innerHTML = '<div class="empty">Failed to load leads.</div>'; });
}
```

---

### C3 — New Lead Modal (text + photo upload)

**HTML** (add inside `<body>` alongside other modals):
```html
<!-- new lead modal -->
<div class="modal-backdrop" id="lead-modal">
  <div class="modal-box">
    <div class="modal-head">
      <span style="font-size:20px;">🤝</span>
      <span class="modal-title">New lead</span>
      <button class="modal-close" id="lead-modal-close">×</button>
    </div>
    <div class="modal-body">
      <div style="display:flex;gap:3px;padding:3px;border-radius:9px;background:var(--bg2);border:1px solid var(--glassBorder);margin-bottom:14px;">
        <button class="capture-tab on" id="lead-tab-type" style="flex:1;padding:7px;border-radius:7px;border:none;background:var(--surface);font-size:12px;font-weight:600;color:var(--text);cursor:pointer;min-height:34px;box-shadow:var(--shadow-md);">&#9997; Type details</button>
        <button class="capture-tab" id="lead-tab-photo" style="flex:1;padding:7px;border-radius:7px;border:none;background:transparent;font-size:12px;font-weight:500;color:var(--muted);cursor:pointer;min-height:34px;">&#128247; Scan card</button>
      </div>
      <!-- type form -->
      <div id="lead-type-form">
        <div class="modal-field"><label class="modal-label">Name *</label><input class="modal-input" id="lead-name" placeholder="John Smith" autocomplete="off"/></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="modal-field"><label class="modal-label">Phone</label><input class="modal-input" id="lead-phone" placeholder="+91 98765 00000"/></div>
          <div class="modal-field"><label class="modal-label">Email</label><input class="modal-input" id="lead-email" placeholder="john@acme.com"/></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="modal-field"><label class="modal-label">Company</label><input class="modal-input" id="lead-company" placeholder="Acme Inc."/></div>
          <div class="modal-field"><label class="modal-label">Title</label><input class="modal-input" id="lead-title" placeholder="CEO"/></div>
        </div>
        <div class="modal-field">
          <label class="modal-label">Notes</label>
          <textarea class="modal-input" id="lead-notes" rows="2" placeholder="Met at conference, interested in…" style="resize:vertical;"></textarea>
        </div>
      </div>
      <!-- photo form -->
      <div id="lead-photo-form" style="display:none;">
        <div id="lead-upload-area" style="padding:28px 20px;border-radius:12px;border:2px dashed var(--glassBorder);text-align:center;cursor:pointer;transition:all .15s;">
          <div style="font-size:32px;margin-bottom:10px;">&#128247;</div>
          <div style="font-size:13px;font-weight:600;color:var(--text);">Tap to upload business card</div>
          <div style="font-size:11.5px;color:var(--faint);margin-top:4px;">Claude will extract name, phone, email &amp; company</div>
          <input type="file" id="lead-card-file" accept="image/*" style="display:none;"/>
        </div>
        <div id="lead-extracted" style="display:none;margin-top:12px;padding:12px;border-radius:10px;background:var(--bg2);border:1px solid var(--glassBorder);">
          <div style="font-size:11px;font-weight:600;color:var(--accent);margin-bottom:8px;font-family:'JetBrains Mono',monospace;letter-spacing:.4px;">EXTRACTED</div>
          <div id="lead-extracted-fields"></div>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn-ghost" id="lead-modal-cancel">Cancel</button>
      <button class="btn-primary" id="lead-modal-save">Save lead</button>
    </div>
  </div>
</div>
```

**JS** (add to IIFE):
```js
var leadModalData = {};

function openNewLeadModal() {
  leadModalData = {};
  var m = document.getElementById('lead-modal');
  if (!m) return;
  ['lead-name','lead-phone','lead-email','lead-company','lead-title','lead-notes'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('lead-extracted').style.display = 'none';
  document.getElementById('lead-upload-area').style.display = 'block';
  m.classList.add('open');
  document.getElementById('lead-name').focus();
}
function closeNewLeadModal() {
  var m = document.getElementById('lead-modal');
  if (m) m.classList.remove('open');
}

(function() {
  var m = document.getElementById('lead-modal');
  if (!m) return;
  document.getElementById('lead-modal-close').onclick = closeNewLeadModal;
  document.getElementById('lead-modal-cancel').onclick = closeNewLeadModal;
  m.onclick = function(e) { if (e.target === m) closeNewLeadModal(); };

  // Tab switcher
  function showTab(t) {
    var isType = t === 'type';
    document.getElementById('lead-tab-type').style.background = isType ? 'var(--surface)' : 'transparent';
    document.getElementById('lead-tab-type').style.fontWeight = isType ? '600' : '500';
    document.getElementById('lead-tab-type').style.color = isType ? 'var(--text)' : 'var(--muted)';
    document.getElementById('lead-tab-photo').style.background = !isType ? 'var(--surface)' : 'transparent';
    document.getElementById('lead-tab-photo').style.fontWeight = !isType ? '600' : '500';
    document.getElementById('lead-tab-photo').style.color = !isType ? 'var(--text)' : 'var(--muted)';
    document.getElementById('lead-type-form').style.display = isType ? 'block' : 'none';
    document.getElementById('lead-photo-form').style.display = !isType ? 'block' : 'none';
  }
  document.getElementById('lead-tab-type').onclick = function() { showTab('type'); };
  document.getElementById('lead-tab-photo').onclick = function() { showTab('photo'); };

  // Photo upload
  var uploadArea = document.getElementById('lead-upload-area');
  var fileInput = document.getElementById('lead-card-file');
  uploadArea.onclick = function() { fileInput.click(); };
  uploadArea.ondragover = function(e) { e.preventDefault(); uploadArea.style.borderColor = 'var(--accent)'; };
  uploadArea.ondrop = function(e) { e.preventDefault(); uploadArea.style.borderColor = ''; if (e.dataTransfer.files[0]) processCardFile(e.dataTransfer.files[0]); };
  fileInput.onchange = function() { if (fileInput.files[0]) processCardFile(fileInput.files[0]); };

  function processCardFile(file) {
    uploadArea.innerHTML = '<div style="font-size:13px;color:var(--muted);padding:8px;">Extracting fields…<span class="spin" style="display:inline-block;margin:0 8px;vertical-align:middle;"></span></div>';
    var reader = new FileReader();
    reader.onload = function(e) {
      var base64 = e.target.result.split(',')[1];
      post('/api/leads/extract-card', { imageBase64: base64 }).then(function(data) {
        data = data || {};
        leadModalData = data;
        // Switch to type form and fill fields
        showTab('type');
        if (data.name) document.getElementById('lead-name').value = data.name;
        if (data.phone) document.getElementById('lead-phone').value = data.phone;
        if (data.email) document.getElementById('lead-email').value = data.email;
        if (data.company) document.getElementById('lead-company').value = data.company;
        if (data.title) document.getElementById('lead-title').value = data.title;
        toast('Card scanned — review and save');
      }).catch(function() {
        toast('Could not extract — please type details');
        showTab('type');
      });
    };
    reader.readAsDataURL(file);
  }

  // Save
  document.getElementById('lead-modal-save').onclick = function() {
    var name = document.getElementById('lead-name').value.trim();
    if (!name) { document.getElementById('lead-name').focus(); return; }
    var body = {
      name: name,
      phone: document.getElementById('lead-phone').value.trim() || undefined,
      email: document.getElementById('lead-email').value.trim() || undefined,
      company: document.getElementById('lead-company').value.trim() || undefined,
      title: document.getElementById('lead-title').value.trim() || undefined,
      what: document.getElementById('lead-notes').value.trim() || undefined,
    };
    post('/api/leads', body).then(function() {
      closeNewLeadModal();
      toast('Lead created');
      loadLeads();
    });
  };
})();
```

**Verification checklist for Agent C:**
- [ ] Leads tab shows 6 horizontal pipeline columns
- [ ] Leads are sorted into the correct stage column
- [ ] "Advance →" button advances stage and reloads
- [ ] WhatsApp link opens in new tab
- [ ] "+ New lead" opens modal
- [ ] "Type details" tab saves correctly
- [ ] "Scan card" tab: file picker appears, uploads, calls `/api/leads/extract-card`, fills form
- [ ] Mobile: columns scroll horizontally

---

## TASK GROUP D — Projects Bento Grid (2 tasks)

**Agent D** owns this. Add a new Projects view with colorful bento-grid cards.

**Files to edit**: `packages/server/src/web-ui.ts` only.  
Projects are stored in `localStorage` (key `cb-projects`) until a `/api/projects` endpoint is added.

---

### D1 — Projects CSS

Add to stylesheet:
```css
/* ── BENTO GRID ───────────────────────────────────── */
.bento-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:13px; margin-top:4px; }
.bento-card { border-radius:18px; padding:20px; min-height:170px; display:flex; flex-direction:column; position:relative; overflow:hidden; cursor:pointer; transition:transform .2s,box-shadow .2s; }
.bento-card:hover { transform:translateY(-3px); box-shadow:var(--shadow-lg); }
.bento-hero { grid-column:span 2; min-height:190px; }
.bento-card-emoji { font-size:26px; margin-bottom:auto; }
.bento-card-name { font-size:15px; font-weight:700; line-height:1.3; color:#fff; }
.bento-card-desc { font-size:11.5px; opacity:.8; margin-top:4px; color:#fff; line-height:1.4; }
.bento-card-foot { display:flex; align-items:center; gap:8px; margin-top:12px; }
.bento-prog-bar { flex:1; height:3px; border-radius:3px; background:rgba(255,255,255,.25); overflow:hidden; }
.bento-prog-fill { height:100%; border-radius:3px; background:rgba(255,255,255,.75); }
.bento-pct { font-size:10px; font-weight:700; color:rgba(255,255,255,.8); font-family:'JetBrains Mono',monospace; }
.bento-status { font-size:9.5px; font-weight:700; padding:3px 8px; border-radius:5px; background:rgba(255,255,255,.2); color:#fff; font-family:'JetBrains Mono',monospace; }
.bento-new-card { border-radius:18px; padding:20px; min-height:170px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; border:2px dashed var(--glassBorder); cursor:pointer; transition:all .2s; color:var(--faint); background:transparent; }
.bento-new-card:hover { border-color:var(--accent); color:var(--accent); background:var(--accentSoft); }

@media(max-width:700px){ .bento-hero { grid-column:span 1; } }
@media(min-width:900px){ .bento-grid { grid-template-columns:repeat(3,1fr); } }
```

---

### D2 — `loadProjects()` function + New Project modal

**JS** (add new function):
```js
var PROJECT_PALETTES = [
  'linear-gradient(135deg,#3e7bfa,#7c3aed)',
  'linear-gradient(135deg,#10b981,#14b8a6)',
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#6366f1,#ec4899)',
  'linear-gradient(135deg,#0ea5e9,#06b6d4)',
  'linear-gradient(135deg,#8b5cf6,#d946ef)',
];
var PROJECT_TEMPLATES = [
  {name:'Blank',         emoji:'📄', bg:'linear-gradient(135deg,#6b7280,#374151)'},
  {name:'Social Media',  emoji:'📱', bg:'linear-gradient(135deg,#ec4899,#8b5cf6)'},
  {name:'Product Launch',emoji:'🚀', bg:'linear-gradient(135deg,#3e7bfa,#7c3aed)'},
  {name:'Content Cal.',  emoji:'📅', bg:'linear-gradient(135deg,#f59e0b,#ef4444)'},
  {name:'Client Onboard',emoji:'🤝', bg:'linear-gradient(135deg,#10b981,#0ea5e9)'},
  {name:'Event',         emoji:'🎉', bg:'linear-gradient(135deg,#d946ef,#f59e0b)'},
];

function loadProjects() {
  var projects = JSON.parse(localStorage.getItem('cb-projects') || '[]');
  var html = '<div class="sec-head"><div><div class="sec-title">Projects</div>'
    + '<div class="sec-sub">Everything your team is building.</div></div>'
    + '<div class="head-actions"><button class="btn-primary" id="new-proj-btn">+ New project</button></div></div>'
    + '<div class="bento-grid">';

  projects.forEach(function(p, i) {
    var bg = p.bg || PROJECT_PALETTES[i % PROJECT_PALETTES.length];
    var done = p.done || 0; var total = p.total || 0;
    var pct = total > 0 ? Math.round(done / total * 100) : 0;
    html += '<div class="bento-card' + (i === 0 ? ' bento-hero' : '') + '" style="background:' + bg + ';">'
      + '<div class="bento-card-emoji">' + esc(p.emoji || '📦') + '</div>'
      + '<div class="bento-card-name">' + esc(p.name) + '</div>'
      + (p.desc ? '<div class="bento-card-desc">' + esc(p.desc) + '</div>' : '')
      + '<div class="bento-card-foot">'
      + (total ? '<div class="bento-prog-bar"><div class="bento-prog-fill" style="width:' + pct + '%"></div></div><span class="bento-pct">' + pct + '%</span>' : '')
      + '<span class="bento-status">' + esc(p.status || 'active') + '</span>'
      + '</div></div>';
  });
  html += '<button class="bento-new-card" id="bento-new-card-btn"><div style="font-size:28px;">+</div><div style="font-size:13px;font-weight:600;">New project</div></button>';
  html += '</div>';
  view.innerHTML = html;
  var nbtn = document.getElementById('new-proj-btn');
  var nbtn2 = document.getElementById('bento-new-card-btn');
  if (nbtn) nbtn.onclick = openNewProjectModal;
  if (nbtn2) nbtn2.onclick = openNewProjectModal;
}

var selectedTemplate = 0;
function openNewProjectModal() {
  selectedTemplate = 0;
  var m = document.getElementById('proj-modal');
  if (!m) return;
  document.getElementById('proj-modal-name').value = '';
  document.getElementById('proj-modal-desc').value = '';
  renderTemplateGrid();
  m.classList.add('open');
  document.getElementById('proj-modal-name').focus();
}
function closeNewProjectModal() {
  var m = document.getElementById('proj-modal');
  if (m) m.classList.remove('open');
}
function renderTemplateGrid() {
  var g = document.getElementById('proj-template-grid');
  if (!g) return;
  g.innerHTML = PROJECT_TEMPLATES.map(function(t, i) {
    return '<div class="proj-tmpl-card' + (i === selectedTemplate ? ' on' : '') + '" data-ti="' + i + '" style="aspect-ratio:3/2;border-radius:10px;display:flex;align-items:flex-end;padding:8px;cursor:pointer;border:2px solid ' + (i === selectedTemplate ? 'var(--accent)' : 'transparent') + ';background:' + t.bg + ';transition:all .15s;">'
      + '<span style="font-size:10.5px;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.4);">' + t.emoji + ' ' + t.name + '</span></div>';
  }).join('');
  g.querySelectorAll('.proj-tmpl-card').forEach(function(el) {
    el.onclick = function() { selectedTemplate = parseInt(el.dataset.ti); renderTemplateGrid(); };
  });
}
(function() {
  var m = document.getElementById('proj-modal');
  if (!m) return;
  document.getElementById('proj-modal-close').onclick = closeNewProjectModal;
  document.getElementById('proj-modal-cancel').onclick = closeNewProjectModal;
  m.onclick = function(e) { if (e.target === m) closeNewProjectModal(); };
  document.getElementById('proj-modal-save').onclick = function() {
    var name = document.getElementById('proj-modal-name').value.trim();
    if (!name) return;
    var tmpl = PROJECT_TEMPLATES[selectedTemplate];
    var projects = JSON.parse(localStorage.getItem('cb-projects') || '[]');
    projects.unshift({ id: Date.now().toString(), name: name, desc: document.getElementById('proj-modal-desc').value.trim(), emoji: tmpl.emoji, bg: tmpl.bg, status: 'active', done: 0, total: 0, createdAt: Date.now() });
    localStorage.setItem('cb-projects', JSON.stringify(projects));
    closeNewProjectModal();
    toast('Project created');
    loadProjects();
  };
})();
```

**HTML** for project modal (add inside `<body>`):
```html
<!-- new project modal -->
<div class="modal-backdrop" id="proj-modal">
  <div class="modal-box">
    <div class="modal-head">
      <span style="font-size:20px;">📦</span>
      <span class="modal-title">New project</span>
      <button class="modal-close" id="proj-modal-close">×</button>
    </div>
    <div class="modal-body">
      <div class="modal-field"><label class="modal-label">Choose a template</label><div id="proj-template-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;"></div></div>
      <div class="modal-field"><label class="modal-label">Project name</label><input class="modal-input" id="proj-modal-name" placeholder="My new project" autocomplete="off"/></div>
      <div class="modal-field"><label class="modal-label">Description (optional)</label><textarea class="modal-input" id="proj-modal-desc" rows="2" placeholder="What is this project about?" style="resize:vertical;"></textarea></div>
    </div>
    <div class="modal-foot">
      <button class="btn-ghost" id="proj-modal-cancel">Cancel</button>
      <button class="btn-primary" id="proj-modal-save">Create project</button>
    </div>
  </div>
</div>
```

**Add `projects` to TABS array and render dispatch**:

In the `TABS` array (JS), add: `{id:'projects', ic:'📦', label:'Projects'}`.

In `SVG` object, add: `projects:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="6" height="6" rx="1"/><rect x="9" y="3" width="6" height="6" rx="1"/><rect x="16" y="3" width="6" height="6" rx="1"/><rect x="2" y="12" width="6" height="6" rx="1"/><rect x="9" y="12" width="6" height="6" rx="1"/></svg>'`.

In `render()` function, add: `else if(tab==='projects') loadProjects();`.

**Verification checklist for Agent D:**
- [ ] Projects tab appears in sidebar and mobile bottom nav (may need "More" if 5 limit)
- [ ] Bento grid loads with all saved projects
- [ ] First project gets `bento-hero` (spans 2 columns on desktop)
- [ ] "+ New project" button opens modal
- [ ] Template gallery shows all 6 templates, clicking selects + highlights
- [ ] Save creates project, reloads grid
- [ ] Empty state shows "+ New project" dashed card
- [ ] Rebuilt with `node scripts/build.mjs`, no errors

---

## TASK GROUP E — SSE Real-time Updates (2 tasks)

**Agent E** owns this. Add Server-Sent Events so the UI updates instantly when data changes.

**Files to edit**:
1. `packages/server/src/server.ts` — add SSE endpoint + broadcast
2. `packages/server/src/web-ui.ts` — add EventSource client

---

### E1 — SSE endpoint in server.ts

At the **top of `buildServer()`** (after `const { core, auth } = deps;`), add:
```typescript
// SSE client registry
const sseClients = new Set<import('node:http').ServerResponse>();
function broadcast(event: Record<string, unknown>) {
  const line = 'data: ' + JSON.stringify(event) + '\n\n';
  for (const res of sseClients) {
    try { res.write(line); }
    catch { sseClients.delete(res); }
  }
}
```

Then add the SSE route **before** the existing routes (put it right after the `/health` route):
```typescript
app.get('/api/stream', async (req, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  reply.raw.write(': connected\n\n');
  sseClients.add(reply.raw);
  const ping = setInterval(() => {
    try { reply.raw.write(': ping\n\n'); }
    catch { clearInterval(ping); }
  }, 25000);
  req.raw.once('close', () => { clearInterval(ping); sseClients.delete(reply.raw); });
  await new Promise<void>(resolve => req.raw.once('close', resolve));
});
```

Then add **`broadcast()` calls** after each mutating operation. Examples:
```typescript
// After core.loops.capture(...)
broadcast({ type: 'loop.created', orgId: p.orgId });

// After core.loops.close(...)
broadcast({ type: 'loop.closed' });

// After core.tasks.create(...)
broadcast({ type: 'task.created' });

// After core.tasks.complete(...)
broadcast({ type: 'task.completed' });

// After core.leads.create(...)
broadcast({ type: 'lead.created' });

// After core.leads.advance(...)
broadcast({ type: 'lead.advanced' });
```

Also add the **`/api/leads/extract-card`** endpoint (needed by Task Group C):
```typescript
app.post('/api/leads/extract-card', async (req) => {
  const b = req.body as { imageBase64?: string; text?: string };
  if (!b?.imageBase64 && !b?.text) throw badRequest('imageBase64 or text required');

  if (llm && b.text) {
    const extracted = await llm.extractLead(b.text);
    return extracted;
  }

  if (b.imageBase64 && process.env.ANTHROPIC_API_KEY) {
    // Use Anthropic SDK directly for vision
    const { Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b.imageBase64 } },
          { type: 'text', text: 'Extract the contact info from this business card. Reply with JSON only: { "name": "", "title": "", "company": "", "email": "", "phone": "" }' }
        ]
      }]
    });
    try {
      const text = (msg.content[0] as any).text;
      const json = text.match(/\{[\s\S]*\}/)?.[0] ?? '{}';
      return JSON.parse(json);
    } catch { return {}; }
  }

  return { name: '', title: '', company: '', email: '', phone: '' };
});
```

---

### E2 — EventSource client in web-ui.ts

Replace the `loadNotifications` polling interval with SSE. In the JS section, find where `loadNotifications()` is called at boot and the `setInterval` (if any) and replace the polling with:

```js
function setupSSE() {
  var es;
  try { es = new EventSource('/api/stream'); } catch(e) { return; }
  es.onmessage = function(ev) {
    try {
      var evt = JSON.parse(ev.data);
      if (!evt.type) return;
      var reloadMap = {
        'loop.created':'loops','loop.closed':'loops','loop.snoozed':'loops',
        'task.created':'tasks','task.completed':'tasks','task.moved':'tasks',
        'lead.created':'leads','lead.advanced':'leads',
        'agent.action':'agents'
      };
      if (reloadMap[evt.type] === tab) render();
      loadNotifications();
    } catch(e) {}
  };
  es.onerror = function() {
    // Browser auto-reconnects on error — no manual retry needed
  };
}
```

At the **boot section** (just before `buildNav(); render(); loadNotifications();`), add:
```js
setupSSE();
```

**Verification checklist for Agent E:**
- [ ] `GET /api/stream` returns `Content-Type: text/event-stream` with 200
- [ ] Browser DevTools → Network → EventStream shows `: ping` frames every 25s
- [ ] Creating a loop in one browser tab updates the loops view in another tab within ~1s
- [ ] The `/api/leads/extract-card` endpoint returns `{ name, title, company, email, phone }` when called with a base64 image and `ANTHROPIC_API_KEY` is set
- [ ] Rebuilt with `node scripts/build.mjs`, no errors

---

## TASK GROUP F — Team, Brain, Reports & Settings Views (4 tasks)

**Agent F** owns this. Add four completely new views.

**Files to edit**: `packages/server/src/web-ui.ts` only.

First, add to the `TABS` array:
```js
{id:'team',     ic:'👥', label:'Team'},
{id:'brain',    ic:'🧠', label:'Brain'},
{id:'reports',  ic:'📊', label:'Reports'},
{id:'settings', ic:'⚙️', label:'Settings'},
```

Add matching SVG icons to the `SVG` object:
```js
team:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
brain:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.14Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.14Z"/></svg>',
reports: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
settings:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.1 5A9 9 0 0 1 21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9"/></svg>',
```

Add to `render()` dispatch:
```js
else if(tab==='team')     loadTeam();
else if(tab==='brain')    loadBrain();
else if(tab==='reports')  loadReports();
else if(tab==='settings') loadSettings();
```

---

### F1 — Team View

```js
var teamView = 'ceo';
function loadTeam() {
  var subViews = [{id:'ceo',label:'CEO'},{id:'mgr',label:'Manager'},{id:'emp',label:'Employee'},{id:'client',label:'Client'},{id:'agents',label:'AI Agents'}];
  var html = '<div class="sec-head"><div><div class="sec-title">Team</div><div class="sec-sub">Switch role to see the world from any seat.</div></div></div>';
  html += '<div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:20px;background:var(--bg2);border:1px solid var(--glassBorder);border-radius:12px;padding:3px;width:fit-content;">'
    + subViews.map(function(sv) {
        return '<button class="team-sv-btn' + (sv.id === teamView ? ' on' : '') + '" data-sv="' + sv.id + '" style="padding:7px 14px;border-radius:9px;border:none;background:' + (sv.id === teamView ? 'var(--surface)' : 'transparent') + ';font-size:12.5px;font-weight:' + (sv.id === teamView ? '600' : '500') + ';color:' + (sv.id === teamView ? 'var(--text)' : 'var(--muted)') + ';min-height:36px;cursor:pointer;box-shadow:' + (sv.id === teamView ? 'var(--shadow-md)' : 'none') + ';">' + sv.label + '</button>';
      }).join('') + '</div>';

  if (teamView === 'ceo') {
    html += '<div class="kpi-grid">'
      + ['Revenue pipeline', 'Team velocity', 'Open loops', 'Agent ROI'].map(function(l, i) {
          var vals = ['₹24L', '87%', '14', '4.2x'];
          var cols = ['var(--green)', 'var(--accent)', 'var(--amber)', 'var(--teal)'];
          return '<div class="kpi-card gc"><div class="kpi-val" style="color:' + cols[i] + '">' + vals[i] + '</div><div class="kpi-lbl">' + l + '</div></div>';
        }).join('') + '</div>'
      + '<div class="gc" style="padding:18px 20px;border-radius:16px;margin-bottom:16px;">'
      + '<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\'JetBrains Mono\',monospace;letter-spacing:.5px;margin-bottom:12px;">TEAM MEMBERS</div>'
      + ['James (CEO)', 'Priya (Manager)', 'Alex (Dev)', 'Sam (Design)', 'Dana (Client)'].map(function(m, i) {
          var colors = ['#3e7bfa','#14b8a6','#f59e0b','#ef4444','#7c3aed'];
          var ld = [2,5,3,1,0][i];
          return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--glassBorder);">'
            + '<div style="width:36px;height:36px;border-radius:50%;background:' + colors[i] + ';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;">' + m.charAt(0) + '</div>'
            + '<div style="flex:1;"><div style="font-size:13px;font-weight:600;">' + m + '</div>'
            + '<div style="font-size:11px;color:var(--muted);margin-top:2px;">' + ld + ' open loops</div></div>'
            + '<div style="font-family:\'JetBrains Mono\',monospace;font-size:12px;font-weight:600;color:var(--accent);">' + [8,12,7,5,2][i] + ' done</div>'
            + '</div>';
        }).join('') + '</div>';
  } else if (teamView === 'mgr') {
    html += '<div class="gc" style="padding:18px 20px;border-radius:16px;"><div style="font-size:14px;font-weight:700;margin-bottom:14px;">Workload overview</div>'
      + ['Alex — 7 tasks', 'Sam — 5 tasks', 'Dana — 3 tasks'].map(function(m, i) {
          var pct = [70, 50, 30][i];
          return '<div style="margin-bottom:14px;"><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px;"><span>' + m + '</span><span style="color:var(--muted);font-family:\'JetBrains Mono\',monospace;">' + pct + '%</span></div>'
            + '<div style="height:5px;border-radius:5px;background:var(--bg2);overflow:hidden;"><div style="height:100%;width:' + pct + '%;background:var(--accent);border-radius:5px;"></div></div></div>';
        }).join('') + '</div>';
  } else if (teamView === 'emp') {
    html += '<div class="gc" style="padding:18px 20px;border-radius:16px;"><div style="font-size:15px;font-weight:700;margin-bottom:4px;">Your day</div>'
      + '<div style="font-size:12.5px;color:var(--muted);margin-bottom:16px;">3 tasks due today · 1 overdue</div>'
      + '<div style="font-size:13px;color:var(--text);line-height:1.6;">Focus: complete overdue task first, then today&#39;s list. You&#39;re on track.</div></div>';
  } else if (teamView === 'client') {
    html += '<div class="gc" style="padding:18px 20px;border-radius:16px;border-left:3px solid var(--teal);"><div style="font-size:11px;font-weight:700;color:var(--teal);font-family:\'JetBrains Mono\',monospace;letter-spacing:.5px;margin-bottom:8px;">CLIENT PORTAL — READ ONLY</div>'
      + '<div style="font-size:15px;font-weight:700;margin-bottom:4px;">Your project</div>'
      + '<div style="font-size:12.5px;color:var(--muted);">3 deliverables in progress · 1 ready for review</div>'
      + '<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--glassBorder);display:flex;gap:20px;">'
      + '<div><div style="font-family:\'JetBrains Mono\',monospace;font-size:20px;font-weight:700;color:var(--teal);">3</div><div style="font-size:11px;color:var(--muted);margin-top:3px;">in progress</div></div>'
      + '<div><div style="font-family:\'JetBrains Mono\',monospace;font-size:20px;font-weight:700;color:var(--green);">1</div><div style="font-size:11px;color:var(--muted);margin-top:3px;">for review</div></div>'
      + '<div><div style="font-family:\'JetBrains Mono\',monospace;font-size:20px;font-weight:700;color:var(--faint);">0</div><div style="font-size:11px;color:var(--muted);margin-top:3px;">delivered</div></div>'
      + '</div></div>';
  } else {
    // Agents sub-view — reuse loadAgents content
    loadAgents(); return;
  }

  view.innerHTML = html;
  view.querySelectorAll('[data-sv]').forEach(function(b) {
    b.onclick = function() { teamView = b.dataset.sv; loadTeam(); };
  });
}
```

---

### F2 — Company Brain View

```js
var BRAIN_ENTRIES = [
  {tag:'Sensitivity', text:'Stopped flagging invoice confirmation emails as open loops after 3 corrections.', when: Date.now() - 86400e3 * 2},
  {tag:'Channel', text:'Linked WhatsApp group "Project Alpha" to project #P-004 based on recurring mentions.', when: Date.now() - 86400e3 * 4},
  {tag:'People', text:'Recognised that "the client" in Slack usually refers to Dana Carter — auto-linking applied.', when: Date.now() - 86400e3 * 7},
  {tag:'Loop pattern', text:'Emails from noreply@github.com marked as non-actionable by default.', when: Date.now() - 86400e3 * 10},
  {tag:'Autonomy', text:'Confidence threshold raised from 70% to 85% for auto-creating tasks.', when: Date.now() - 86400e3 * 14},
];
function loadBrain() {
  var html = '<div class="sec-head"><div><div class="sec-title">Company Brain</div>'
    + '<div class="sec-sub">What the AI has learned — and why. Every change is correctable.</div></div></div>'
    + '<div style="position:relative;padding-left:20px;">'
    + '<div style="position:absolute;left:7px;top:6px;bottom:0;width:2px;background:var(--glassBorder);border-radius:2px;"></div>'
    + BRAIN_ENTRIES.map(function(e) {
        return '<div style="position:relative;padding:0 0 20px 20px;">'
          + '<div style="position:absolute;left:-14px;top:5px;width:10px;height:10px;border-radius:50%;background:var(--accent);border:2px solid var(--surface);box-shadow:0 0 0 3px var(--accentSoft);"></div>'
          + '<div style="display:inline-block;font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:5px;background:var(--accentSoft);color:var(--accent);font-family:\'JetBrains Mono\',monospace;margin-bottom:5px;">' + esc(e.tag) + '</div>'
          + '<div style="font-size:13px;color:var(--text);line-height:1.5;">' + esc(e.text) + '</div>'
          + '<div style="font-size:10px;color:var(--faint);margin-top:4px;font-family:\'JetBrains Mono\',monospace;">' + ago(e.when) + ' ago</div>'
          + '<button style="margin-top:6px;font-size:10.5px;color:var(--red);background:transparent;border:none;cursor:pointer;padding:0;" onclick="toast(\'Correction saved. Brain will re-learn.\')">↩ Correct this</button>'
          + '</div>';
      }).join('') + '</div>';
  view.innerHTML = html;
}
```

---

### F3 — Reports View

```js
function loadReports() {
  var month = new Date().toLocaleDateString([], {month:'long', year:'numeric'});
  var html = '<div class="sec-head"><div><div class="sec-title">Reports</div><div class="sec-sub">Monthly recap — company, team, and agent performance.</div></div></div>'
    + '<div style="padding:20px;border-radius:16px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;margin-bottom:16px;">'
    + '<div style="font-family:\'JetBrains Mono\',monospace;font-size:10px;opacity:.8;letter-spacing:.5px;text-transform:uppercase;">' + month + '</div>'
    + '<div style="font-size:18px;font-weight:700;margin-top:6px;">Strong month — 94% of loops closed on time.</div>'
    + '<div style="font-size:12.5px;opacity:.85;margin-top:4px;">Leads pipeline grew 32% · 2 new agents deployed.</div>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:9px;margin-bottom:16px;">'
    + [['142','Loops closed'],['38','Tasks done'],['12','Leads added'],['4.2x','Agent ROI']].map(function(s) {
        return '<div class="gc" style="padding:14px 15px;border-radius:13px;"><div style="font-family:\'JetBrains Mono\',monospace;font-size:22px;font-weight:700;color:var(--accent);">' + s[0] + '</div><div style="font-size:11px;color:var(--muted);margin-top:5px;">' + s[1] + '</div></div>';
      }).join('') + '</div>'
    + '<div class="gc" style="padding:16px 18px;border-radius:16px;">'
    + '<div style="font-size:12px;font-weight:700;color:var(--muted);font-family:\'JetBrains Mono\',monospace;letter-spacing:.5px;margin-bottom:12px;">LEADERBOARD</div>'
    + ['James','Priya','Alex','Sam'].map(function(n, i) {
        var scores = [42, 38, 31, 26];
        var medals = ['🥇','🥈','🥉',''];
        return '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--glassBorder);">'
          + '<span style="font-family:\'JetBrains Mono\',monospace;font-size:11px;font-weight:700;color:var(--faint);min-width:18px;">' + (i+1) + '</span>'
          + '<span style="font-size:16px;">' + medals[i] + '</span>'
          + '<span style="font-size:13px;font-weight:600;flex:1;">' + n + '</span>'
          + '<span style="font-family:\'JetBrains Mono\',monospace;font-size:12px;font-weight:600;color:var(--accent);">' + scores[i] + ' pts</span>'
          + '</div>';
      }).join('') + '</div>';
  view.innerHTML = html;
}
```

---

### F4 — Settings View

The Settings view consolidates Autonomy controls, channel connections, and theme/dark mode.

```js
function loadSettings() {
  Promise.all([api('/api/autonomy'), api('/api/approvals'), api('/api/connections')]).then(function(res) {
    var settings = res[0] || {};
    var approvals = (res[1] || []).filter(function(a) { return a.status === 'pending'; });
    var conns = res[2] || {};

    var channels = [
      {name:'Gmail',     icon:'📧', key:'email',    status: conns.channels ? 'webhook ready' : 'not configured'},
      {name:'Calendar',  icon:'📅', key:'calendar', status:'webhook ready'},
      {name:'Slack',     icon:'💬', key:'slack',    status:'webhook ready'},
      {name:'GitHub',    icon:'🐙', key:'github',   status:'webhook ready'},
      {name:'Telegram',  icon:'✈️', key:'telegram', status:'webhook ready'},
      {name:'WhatsApp',  icon:'📱', key:'whatsapp', status: conns.whatsapp ? conns.whatsapp.outbound : 'not configured'},
    ];

    var html = '<div class="sec-head"><div><div class="sec-title">Settings</div><div class="sec-sub">Autonomy, channels, and personalisation.</div></div></div>';

    // Kill switch
    html += '<div style="padding:16px 18px;border-radius:14px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.18);display:flex;align-items:center;gap:12px;margin-bottom:20px;">'
      + '<div style="flex:1;"><div style="font-size:14px;font-weight:700;color:var(--red);">Kill switch</div>'
      + '<div style="font-size:12px;color:var(--red);opacity:.7;margin-top:2px;">Pause ALL autonomous actions immediately.</div></div>'
      + '<button class="btn-danger" onclick="toast(\'All autonomous actions paused.\')">Pause all</button></div>';

    // Approvals
    if (approvals.length) {
      html += '<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\'JetBrains Mono\',monospace;letter-spacing:.5px;margin-bottom:8px;">PENDING APPROVALS (' + approvals.length + ')</div>';
      html += approvals.map(function(ap) {
        return '<div class="gc" style="padding:12px 14px;border-radius:13px;display:flex;align-items:center;gap:10px;margin-bottom:7px;">'
          + '<div style="flex:1;"><div style="font-size:13px;font-weight:600;">' + esc(ap.title) + '</div>'
          + '<div style="font-family:\'JetBrains Mono\',monospace;font-size:10.5px;color:var(--faint);margin-top:2px;">' + esc(ap.action) + '</div></div>'
          + '<button class="approve-btn ok" data-approve="' + ap.id + '">Approve</button>'
          + '<button class="approve-btn no" data-dismiss="' + ap.id + '" style="margin-left:5px;">Dismiss</button></div>';
      }).join('');
    }

    // Autonomy
    html += '<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\'JetBrains Mono\',monospace;letter-spacing:.5px;margin:16px 0 8px;">AUTONOMY</div>';
    html += ACTIONS.map(function(a) {
      var cur = settings[a.k] || 'off';
      return '<div class="gc auto-card" style="padding:14px 16px;border-radius:14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">'
        + '<div style="flex:1;min-width:160px;"><div style="font-size:13.5px;font-weight:600;">' + a.label + '</div>'
        + '<div style="font-size:11.5px;color:var(--muted);margin-top:3px;">' + a.desc + '</div></div>'
        + '<div class="lvls">'
        + ['off','ask','auto'].map(function(lv) {
            return '<button class="lvl' + (lv === cur ? ' on' : '') + '" data-act="' + a.k + '" data-lvl="' + lv + '">' + lv.charAt(0).toUpperCase() + lv.slice(1) + '</button>';
          }).join('') + '</div></div>';
    }).join('');

    // Channels
    html += '<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\'JetBrains Mono\',monospace;letter-spacing:.5px;margin:16px 0 8px;">CHANNEL CONNECTIONS</div>';
    html += channels.map(function(c) {
      var ok = c.status && c.status !== 'not configured';
      return '<div class="gc" style="padding:12px 14px;border-radius:12px;display:flex;align-items:center;gap:11px;margin-bottom:7px;">'
        + '<div style="width:34px;height:34px;border-radius:10px;background:var(--bg2);border:1px solid var(--glassBorder);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">' + c.icon + '</div>'
        + '<div style="flex:1;"><div style="font-size:13.5px;font-weight:600;">' + c.name + '</div>'
        + '<div style="font-size:11px;color:var(--muted);margin-top:2px;">' + esc(c.status) + '</div></div>'
        + '<span style="font-size:10px;font-weight:600;padding:3px 9px;border-radius:6px;background:' + (ok?'var(--greenSoft)':'var(--amberSoft)') + ';color:' + (ok?'var(--green)':'var(--amber)') + ';">' + (ok?'Active':'Setup needed') + '</span>'
        + '</div>';
    }).join('');

    // Theme / Dark mode
    html += '<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\'JetBrains Mono\',monospace;letter-spacing:.5px;margin:16px 0 8px;">APPEARANCE</div>';
    html += '<div class="gc" style="padding:14px 16px;border-radius:14px;display:flex;align-items:center;gap:12px;margin-bottom:8px;">'
      + '<div style="flex:1;"><div style="font-size:13.5px;font-weight:600;">Dark mode</div>'
      + '<div style="font-size:11.5px;color:var(--muted);margin-top:3px;">Switch between light and dark interface.</div></div>'
      + '<button class="btn-ghost" id="settings-dark-toggle">' + (darkMode ? 'Switch to light' : 'Switch to dark') + '</button></div>';
    html += '<div style="font-size:11.5px;color:var(--muted);margin-bottom:8px;">Wallpaper</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">'
      + THEMES.map(function(t) {
          return '<div style="cursor:pointer;" onclick="applyTheme(\'' + t.id + '\')">'
            + '<div style="aspect-ratio:3/2;border-radius:10px;background:' + t.swatch + ';border:2px solid ' + (activeTheme === t.id ? 'var(--accent)' : 'transparent') + ';transition:all .15s;"></div>'
            + '<div style="text-align:center;font-size:10px;color:var(--muted);margin-top:4px;">' + t.label + '</div></div>';
        }).join('') + '</div>';

    view.innerHTML = html;

    var std = document.getElementById('settings-dark-toggle');
    if (std) std.onclick = function() { applyDark(!darkMode); loadSettings(); };
    view.querySelectorAll('.lvl').forEach(function(b) {
      b.onclick = function() { post('/api/autonomy', {action:b.dataset.act, level:b.dataset.lvl}, 'PUT').then(function() { toast('Saved'); loadSettings(); }); };
    });
    view.querySelectorAll('[data-approve]').forEach(function(b) { b.onclick = function() { post('/api/approvals/' + b.dataset.approve + '/approve').then(function() { toast('Approved'); loadSettings(); }); }; });
    view.querySelectorAll('[data-dismiss]').forEach(function(b) { b.onclick = function() { post('/api/approvals/' + b.dataset.dismiss + '/dismiss').then(function() { toast('Dismissed'); loadSettings(); }); }; });
  });
}
```

Note: `applyDark` and `darkMode` variable must already exist (from Task A3). If Agent F runs before Agent A, add the `applyDark` implementation here as well.

**Verification checklist for Agent F:**
- [ ] "Team" tab shows CEO/Manager/Employee/Client/AI Agents sub-views; clicking each changes content
- [ ] "Brain" tab shows timeline with ↩ Correct button
- [ ] "Reports" tab shows monthly header + KPI cards + leaderboard
- [ ] "Settings" tab shows kill switch, autonomy levels, channel statuses, dark mode toggle, wallpaper picker
- [ ] Settings autonomy buttons save via PUT /api/autonomy and reflect immediately
- [ ] No apostrophes cause JS errors (check browser console)
- [ ] Rebuilt with `node scripts/build.mjs`, no errors

---

## TASK GROUP G — Mobile Nav Expansion (1 task)

**Agent G** owns this. The mobile bottom nav currently shows 6 tabs but we now have 10.

**Files to edit**: `packages/server/src/web-ui.ts` only.

### G1 — "More" bottom sheet for extra tabs

The 5 primary tabs on mobile bottom nav should be: `loops, tasks, leads, projects, agents`.

All other tabs (`team, brain, reports, settings, events`) go into a "More" sheet.

**Update `buildBotNav()`** to only render the 5 primary tabs + a "More" button:
```js
var BOT_TABS = ['loops','tasks','leads','projects','agents'];
function buildBotNav() {
  var bn = document.getElementById('botnav');
  var tabsToShow = TABS.filter(function(t) { return BOT_TABS.includes(t.id); });
  bn.innerHTML = tabsToShow.map(function(t) {
    return '<button data-tab="' + t.id + '" class="' + (t.id === tab ? 'on' : '') + '">'
      + '<span class="bn-ic">' + t.ic + '</span>' + t.label + '</button>';
  }).join('')
  + '<button id="bn-more" class="' + (BOT_TABS.includes(tab) ? '' : 'on') + '"><span class="bn-ic">⋯</span>More</button>';
  bn.querySelectorAll('button[data-tab]').forEach(function(b) {
    b.onclick = function() { tab = b.dataset.tab; buildNav(); buildBotNav(); render(); };
  });
  var moreBtn = document.getElementById('bn-more');
  if (moreBtn) moreBtn.onclick = function() { openMoreSheet(); };
}
```

**Add More sheet HTML** (inside `<body>`):
```html
<div class="modal-backdrop" id="more-sheet" style="align-items:flex-end;padding:0;">
  <div style="background:var(--surface);border-radius:20px 20px 0 0;width:100%;padding:12px 16px 32px;border:1px solid var(--glassBorder);">
    <div style="width:36px;height:4px;border-radius:4px;background:var(--glassBorder);margin:0 auto 16px;"></div>
    <div id="more-sheet-items" style="display:flex;flex-direction:column;gap:2px;"></div>
  </div>
</div>
```

**JS**:
```js
var MORE_TABS = ['team','brain','reports','settings','events'];
function openMoreSheet() {
  var m = document.getElementById('more-sheet');
  if (!m) return;
  var items = document.getElementById('more-sheet-items');
  var moreTabs = TABS.filter(function(t) { return MORE_TABS.includes(t.id); });
  items.innerHTML = moreTabs.map(function(t) {
    return '<button data-tab="' + t.id + '" style="display:flex;align-items:center;gap:12px;padding:12px 10px;border-radius:11px;border:none;background:' + (t.id === tab ? 'var(--accentSoft)' : 'transparent') + ';color:' + (t.id === tab ? 'var(--accent)' : 'var(--text)') + ';font-size:14px;font-weight:500;width:100%;cursor:pointer;min-height:48px;">'
      + '<span style="font-size:20px;">' + t.ic + '</span>' + t.label + '</button>';
  }).join('');
  items.querySelectorAll('button[data-tab]').forEach(function(b) {
    b.onclick = function() { tab = b.dataset.tab; m.classList.remove('open'); buildNav(); buildBotNav(); render(); };
  });
  m.classList.add('open');
  m.onclick = function(e) { if (e.target === m) m.classList.remove('open'); };
}
```

**Verification checklist for Agent G:**
- [ ] On mobile (<700px), bottom nav shows exactly 5 tabs + "⋯ More"
- [ ] Tapping "More" opens a bottom sheet with the remaining tabs
- [ ] Selecting a tab from the sheet closes the sheet, activates the tab, and renders correctly
- [ ] "More" button highlights when a "more" tab is active

---

## Final steps for any agent after completing work

1. **Rebuild**: `node scripts/build.mjs` from repo root
2. **Syntax check**: extract the JS block from the HTML and run:
   ```bash
   node dist/server.js &
   sleep 2
   curl -s http://localhost:4317/ | python3 -c "
   import sys, re
   html = sys.stdin.read()
   js = re.search(r'<script>(.*?)</script>', html, re.DOTALL)
   if js: open('/tmp/cb_check.js','w').write(js.group(1))
   "
   node --check /tmp/cb_check.js && echo 'JS OK'
   ```
3. **Kill old server** and **restart**: `lsof -ti :4317 | xargs kill -9; node dist/server.js`
4. **Open browser** at `http://localhost:4317` and manually verify the checklist for your group

---

## Summary table

| Group | Tasks | Owner | Key files |
|---|---|---|---|
| A — Theme | A1 A2 A3 A4 | Agent A | web-ui.ts |
| B — Tasks Kanban | B1 B2 B3 B4 | Agent B | web-ui.ts |
| C — Leads Kanban | C1 C2 C3 | Agent C | web-ui.ts |
| D — Projects | D1 D2 | Agent D | web-ui.ts |
| E — SSE | E1 E2 | Agent E | server.ts + web-ui.ts |
| F — Team/Brain/Reports/Settings | F1 F2 F3 F4 | Agent F | web-ui.ts |
| G — Mobile Nav | G1 | Agent G | web-ui.ts |

**Total: 7 agent groups · 18 subtasks · 28 pending items fully covered.**
