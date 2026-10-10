// Company Brain Frontend Application
// Vanilla JavaScript - no frameworks, no build step

(function() {
  'use strict';

  // --- State ---
  let currentPage = 'loops';
  let currentRole = 'ceo';
  let currentTheme = localStorage.getItem('cb-theme') || 'light';
  let loops = [];
  let tasks = [];
  let leads = [];
  let projects = JSON.parse(localStorage.getItem('cb-projects') || '[]');
  let notifications = [];
  let selectedIndex = -1;
  let pendingKeystroke = null;
  let lastAction = null;

  // --- API Helper ---
  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }

  // --- Toast with Undo ---
  function showToast(message, type = 'success', undoAction = null) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${escapeHtml(message)}</span>
      ${undoAction ? '<button class="toast-undo">Undo</button>' : ''}
    `;
    if (undoAction) {
      toast.querySelector('.toast-undo').addEventListener('click', () => {
        undoAction();
        toast.remove();
      });
    }
    document.getElementById('toast-container').appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // --- Modal ---
  function openModal(title, bodyHtml, footerHtml = '') {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml;
    document.getElementById('modal-overlay').classList.add('open');
    const firstInput = document.querySelector('#modal-body input, #modal-body textarea');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
  }

  // --- Bottom Sheet (Mobile) ---
  function openBottomSheet(contentHtml) {
    document.getElementById('bottom-sheet-content').innerHTML = contentHtml;
    document.getElementById('bottom-sheet-overlay').classList.add('open');
  }

  function closeBottomSheet() {
    document.getElementById('bottom-sheet-overlay').classList.remove('open');
  }

  // --- Command Palette ---
  const commandPalette = {
    commands: [
      { id: 'new-loop', icon: '🔄', title: 'New Loop', section: 'Actions', action: () => app.openNewLoop(), shortcut: ['n', 'l'] },
      { id: 'new-task', icon: '✅', title: 'New Task', section: 'Actions', action: () => app.openNewTask(), shortcut: ['n', 't'] },
      { id: 'new-lead', icon: '👥', title: 'New Lead', section: 'Actions', action: () => app.openNewLead(), shortcut: ['n', 'd'] },
      { id: 'new-project', icon: '📁', title: 'New Project', section: 'Actions', action: () => app.openNewProject() },
      { id: 'go-loops', icon: '🔄', title: 'Go to Loops', section: 'Navigation', action: () => navigateTo('loops'), shortcut: ['g', 'l'] },
      { id: 'go-tasks', icon: '✅', title: 'Go to Tasks', section: 'Navigation', action: () => navigateTo('tasks'), shortcut: ['g', 't'] },
      { id: 'go-leads', icon: '👥', title: 'Go to Leads', section: 'Navigation', action: () => navigateTo('leads'), shortcut: ['g', 'd'] },
      { id: 'go-projects', icon: '📁', title: 'Go to Projects', section: 'Navigation', action: () => navigateTo('projects'), shortcut: ['g', 'p'] },
      { id: 'go-agents', icon: '🤖', title: 'Go to Agents', section: 'Navigation', action: () => navigateTo('agents') },
      { id: 'go-settings', icon: '⚙️', title: 'Go to Settings', section: 'Navigation', action: () => navigateTo('settings') },
      { id: 'toggle-theme', icon: '🌙', title: 'Toggle Dark Mode', section: 'Appearance', action: () => setTheme(currentTheme === 'dark' ? 'light' : 'dark') },
      { id: 'shortcuts', icon: '⌨️', title: 'Keyboard Shortcuts', section: 'Help', action: () => app.showShortcuts(), shortcut: ['?'] },
    ],

    open() {
      const overlay = document.getElementById('cmd-overlay');
      overlay.classList.add('open');
      const input = document.getElementById('cmd-input');
      input.value = '';
      this.renderResults('');
      setTimeout(() => input.focus(), 50);
    },

    close() {
      document.getElementById('cmd-overlay').classList.remove('open');
    },

    renderResults(query) {
      const container = document.getElementById('cmd-results');
      const q = query.toLowerCase().trim();

      // Also search through actual data
      let results = [];

      // Add commands
      const matchingCommands = this.commands.filter(cmd =>
        !q || cmd.title.toLowerCase().includes(q) || cmd.section.toLowerCase().includes(q)
      );

      // Add matching items from data
      if (q) {
        loops.forEach(loop => {
          if (loop.title.toLowerCase().includes(q)) {
            results.push({ type: 'item', icon: getChannelEmoji(loop.channel), title: loop.title, sub: loop.channel, action: () => navigateTo('loops') });
          }
        });
        tasks.forEach(task => {
          if (task.title.toLowerCase().includes(q)) {
            results.push({ type: 'item', icon: '✅', title: task.title, sub: task.day, action: () => navigateTo('tasks') });
          }
        });
        leads.forEach(lead => {
          if ((lead.name || '').toLowerCase().includes(q) || (lead.company || '').toLowerCase().includes(q)) {
            results.push({ type: 'item', icon: '👤', title: lead.name, sub: lead.company || lead.stage, action: () => navigateTo('leads') });
          }
        });
      }

      // Group commands by section
      const sections = {};
      matchingCommands.forEach(cmd => {
        if (!sections[cmd.section]) sections[cmd.section] = [];
        sections[cmd.section].push(cmd);
      });

      let html = '';

      // Render data results first if searching
      if (results.length > 0) {
        html += '<div class="cmd-section">Results</div>';
        results.slice(0, 5).forEach((r, i) => {
          html += `<div class="cmd-result" data-index="${i}" onclick="app.executeCmdItem(${i})">
            <div class="cmd-result-icon">${r.icon}</div>
            <div class="cmd-result-text">
              <div class="cmd-result-title">${escapeHtml(r.title)}</div>
              <div class="cmd-result-sub">${escapeHtml(r.sub)}</div>
            </div>
          </div>`;
        });
      }

      // Render command sections
      Object.entries(sections).forEach(([section, cmds]) => {
        html += `<div class="cmd-section">${section}</div>`;
        cmds.forEach((cmd, i) => {
          const idx = results.length + i;
          html += `<div class="cmd-result" data-index="${idx}" data-cmd-id="${cmd.id}">
            <div class="cmd-result-icon">${cmd.icon}</div>
            <div class="cmd-result-text">
              <div class="cmd-result-title">${escapeHtml(cmd.title)}</div>
            </div>
            ${cmd.shortcut ? `<div class="cmd-result-shortcut">${cmd.shortcut.map(k => `<kbd>${k}</kbd>`).join('')}</div>` : ''}
          </div>`;
        });
      });

      if (!html) {
        html = '<div class="cmd-section" style="text-align:center;padding:24px;color:var(--muted);">No results found</div>';
      }

      container.innerHTML = html;

      // Store combined results for keyboard nav
      this._currentResults = [...results.map(r => r.action), ...matchingCommands.map(c => c.action)];
      this._selectedIndex = -1;
    },

    navigate(direction) {
      const results = this._currentResults || [];
      if (!results.length) return;

      const items = document.querySelectorAll('#cmd-results .cmd-result');
      items.forEach(item => item.classList.remove('active'));

      this._selectedIndex += direction;
      if (this._selectedIndex < 0) this._selectedIndex = results.length - 1;
      if (this._selectedIndex >= results.length) this._selectedIndex = 0;

      const active = items[this._selectedIndex];
      if (active) {
        active.classList.add('active');
        active.scrollIntoView({ block: 'nearest' });
      }
    },

    select() {
      const results = this._currentResults || [];
      if (this._selectedIndex >= 0 && this._selectedIndex < results.length) {
        this.close();
        results[this._selectedIndex]();
      }
    }
  };

  // Store for command palette item actions
  window._cmdItemActions = [];

  // --- Context Menu ---
  function showContextMenu(e, items) {
    e.preventDefault();
    const existing = document.querySelector('.context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${Math.min(e.clientX, window.innerWidth - 200)}px`;
    menu.style.top = `${Math.min(e.clientY, window.innerHeight - 200)}px`;

    items.forEach(item => {
      if (item.separator) {
        menu.innerHTML += '<div class="context-menu-sep"></div>';
        return;
      }
      const div = document.createElement('div');
      div.className = `context-menu-item${item.danger ? ' danger' : ''}`;
      div.innerHTML = `<span>${item.icon || ''}</span><span>${item.label}</span>`;
      div.addEventListener('click', () => {
        menu.remove();
        item.action();
      });
      menu.appendChild(div);
    });

    document.body.appendChild(menu);
    const closeMenu = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  // --- Theme ---
  function setTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cb-theme', theme);
    document.querySelectorAll('.theme-swatch').forEach(s => {
      s.classList.toggle('on', s.dataset.theme === theme);
    });
  }

  // --- Navigation ---
  function navigateTo(page) {
    currentPage = page;
    selectedIndex = -1;
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });
    renderPage();
  }

  // --- Render Functions ---
  function renderPage() {
    const content = document.getElementById('content');
    switch (currentPage) {
      case 'loops': renderLoops(content); break;
      case 'tasks': renderTasks(content); break;
      case 'leads': renderLeads(content); break;
      case 'projects': renderProjects(content); break;
      case 'agents': renderAgents(content); break;
      case 'team': renderTeam(content); break;
      case 'brain': renderBrain(content); break;
      case 'reports': renderReports(content); break;
      case 'settings': renderSettings(content); break;
      case 'activity': renderActivity(content); break;
      default: renderLoops(content);
    }
    selectedIndex = -1;
  }

  function renderLoops(container) {
    const yourLoops = loops.filter(l => l.side === 'yours');
    const theirLoops = loops.filter(l => l.side === 'theirs');

    if (loops.length === 0) {
      container.innerHTML = renderEmptyState('🔄', 'No open loops', 'When someone messages you or you create a follow-up, it appears here.', 'New Loop', 'app.openNewLoop()');
      return;
    }

    container.innerHTML = `
      <div>
        <div class="sec-head">
          <div>
            <div class="sec-title">Open Loops</div>
            <div class="sec-sub">Never forget a follow-up</div>
          </div>
          <div class="head-actions">
            <button class="btn btn-primary" onclick="app.openNewLoop()">+ New Loop</button>
          </div>
        </div>

        <div class="loops-grid">
          <div data-container="yours" data-drop-target="true">
            <div class="col-head">
              <div class="col-dot" style="background:var(--accent)"></div>
              <div class="col-label">Your Court</div>
              <div class="col-count">${yourLoops.length}</div>
            </div>
            <div class="col-hint">What you owe</div>
            ${yourLoops.map((loop, i) => renderLoopCard(loop, i)).join('')}
          </div>
          <div data-container="theirs" data-drop-target="true">
            <div class="col-head">
              <div class="col-dot" style="background:var(--amber)"></div>
              <div class="col-label">Their Court</div>
              <div class="col-count">${theirLoops.length}</div>
            </div>
            <div class="col-hint">What you're waiting on</div>
            ${theirLoops.map((loop, i) => renderLoopCard(loop, i + yourLoops.length)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderLoopCard(loop, index) {
    const timeAgo = getTimeAgo(loop.updatedAt);
    return `
      <div class="loop-card gc tilt-card" data-draggable="true" data-drag-type="loop" data-id="${loop.id}" data-index="${index}" data-swipeable="true" oncontextmenu="app.loopContextMenu(event,'${loop.id}')">
        <div class="tilt-shine"></div>
        <button class="check-btn" onclick="app.closeLoop('${loop.id}')" data-tooltip="Complete"></button>
        <div class="loop-info">
          <div class="loop-title-row">
            <span class="loop-emoji">${getChannelEmoji(loop.channel)}</span>
            <div class="loop-title inline-edit" contenteditable="false" data-loop-id="${loop.id}" onblur="app.saveLoopTitle('${loop.id}', this.textContent)">${escapeHtml(loop.title)}</div>
          </div>
          <div class="loop-meta">${loop.channel} · ${timeAgo}</div>
          <div class="loop-actions">
            <button class="loop-action" onclick="app.snoozeLoop('${loop.id}')">Snooze</button>
            <button class="loop-action" onclick="app.assignLoop('${loop.id}')">Assign</button>
            <button class="loop-action" onclick="app.openLoopDetail('${loop.id}')">Detail</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderTasks(container) {
    const todayTasks = tasks.filter(t => t.day === 'today');
    const tomorrowTasks = tasks.filter(t => t.day === 'tomorrow');
    const upcomingTasks = tasks.filter(t => t.day === 'upcoming');

    if (tasks.length === 0) {
      container.innerHTML = renderEmptyState('✅', 'No tasks yet', 'Create your first task to start tracking your work.', 'New Task', 'app.openNewTask()');
      return;
    }

    container.innerHTML = `
      <div>
        <div class="sec-head">
          <div>
            <div class="sec-title">Tasks</div>
            <div class="sec-sub">Your board — what needs doing and when.</div>
          </div>
          <div class="head-actions">
            <button class="btn btn-primary" onclick="app.openNewTask()">+ New task</button>
          </div>
        </div>

        <div class="tasks-board">
          <div class="task-col" data-container="today" data-drop-target="true">
            <div class="kanban-header">
              <div class="kanban-dot" style="background:var(--red)"></div>
              <div class="kanban-label">Today</div>
              <div class="kanban-count">${todayTasks.length}</div>
            </div>
            ${todayTasks.map((task, i) => renderTaskCard(task, i)).join('')}
          </div>
          <div class="task-col" data-container="tomorrow" data-drop-target="true">
            <div class="kanban-header">
              <div class="kanban-dot" style="background:var(--amber)"></div>
              <div class="kanban-label">Tomorrow</div>
              <div class="kanban-count">${tomorrowTasks.length}</div>
            </div>
            ${tomorrowTasks.map((task, i) => renderTaskCard(task, i + todayTasks.length)).join('')}
          </div>
          <div class="task-col" data-container="upcoming" data-drop-target="true">
            <div class="kanban-header">
              <div class="kanban-dot" style="background:var(--blue)"></div>
              <div class="kanban-label">Upcoming</div>
              <div class="kanban-count">${upcomingTasks.length}</div>
            </div>
            ${upcomingTasks.map((task, i) => renderTaskCard(task, i + todayTasks.length + tomorrowTasks.length)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderTaskCard(task, index) {
    return `
      <div class="task-card gc tilt-card" data-draggable="true" data-drag-type="task" data-id="${task.id}" data-index="${index}" data-swipeable="true" oncontextmenu="app.taskContextMenu(event,'${task.id}')">
        <div class="tilt-shine"></div>
        <button class="check-btn" onclick="app.completeTask('${task.id}')" data-tooltip="Complete"></button>
        <div class="task-emoji">${task.emoji || '📋'}</div>
        <div class="task-title inline-edit" contenteditable="false" data-task-id="${task.id}" onblur="app.saveTaskTitle('${task.id}', this.textContent)">${escapeHtml(task.title)}</div>
        <div class="task-meta">${task.list}</div>
        <div class="task-tags">
          ${task.priority ? `<span class="task-tag priority-${task.priority}">${task.priority.toUpperCase()}</span>` : ''}
          <span class="task-tag day">→ ${task.day}</span>
        </div>
      </div>
    `;
  }

  function renderLeads(container) {
    const stages = ['new', 'contacted', 'meeting', 'proposal', 'won'];

    if (leads.length === 0) {
      container.innerHTML = renderEmptyState('👥', 'No leads yet', 'Add your first lead to start building your pipeline.', 'New Lead', 'app.openNewLead()');
      return;
    }

    container.innerHTML = `
      <div>
        <div class="sec-head">
          <div>
            <div class="sec-title">Leads</div>
            <div class="sec-sub">CRM pipeline</div>
          </div>
          <div class="head-actions">
            <button class="btn btn-primary" onclick="app.openNewLead()">+ New lead</button>
          </div>
        </div>

        <div class="leads-board">
          ${stages.map(stage => {
            const stageLeads = leads.filter(l => l.stage === stage);
            return `
              <div class="kanban-col" data-container="${stage}" data-drop-target="true">
                <div class="kanban-header">
                  <div class="kanban-dot" style="background:${getStageColor(stage)}"></div>
                  <div class="kanban-label">${stage}</div>
                  <div class="kanban-count">${stageLeads.length}</div>
                </div>
                ${stageLeads.map(lead => renderLeadCard(lead)).join('')}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderLeadCard(lead) {
    return `
      <div class="lead-card gc tilt-card" data-draggable="true" data-drag-type="lead" data-id="${lead.id}" data-swipeable="true" oncontextmenu="app.leadContextMenu(event,'${lead.id}')">
        <div class="tilt-shine"></div>
        <div class="lead-avatar">${lead.name.charAt(0).toUpperCase()}</div>
        <div class="lead-name">${escapeHtml(lead.name)}</div>
        <div class="lead-company">${escapeHtml(lead.company || '')}</div>
        <div class="lead-stage">${lead.stage}</div>
        <div class="lead-actions">
          <button class="lead-action" onclick="app.advanceLead('${lead.id}')">Advance</button>
          <button class="lead-action" onclick="app.assignLead('${lead.id}')">Assign</button>
        </div>
      </div>
    `;
  }

  function renderProjects(container) {
    container.innerHTML = `
      <div>
        <div class="sec-head">
          <div>
            <div class="sec-title">Projects</div>
            <div class="sec-sub">Organize your work</div>
          </div>
          <div class="head-actions">
            <button class="btn btn-primary" onclick="app.openNewProject()">+ New project</button>
          </div>
        </div>

        ${projects.length === 0 ? renderEmptyState('📁', 'No projects yet', 'Create your first project to organize related tasks.', 'New Project', 'app.openNewProject()') : ''}
        <div class="loops-grid">
          ${projects.map(project => `
            <div class="gc" style="padding:16px;border-radius:14px;">
              <div style="font-size:15px;font-weight:600;margin-bottom:4px;">${escapeHtml(project.name)}</div>
              <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">${escapeHtml(project.description || '')}</div>
              <div style="font-size:10px;color:var(--faint);">${project.template || 'blank'}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderAgents(container) {
    container.innerHTML = `
      <div>
        <div class="sec-head">
          <div>
            <div class="sec-title">AI Agents</div>
            <div class="sec-sub">Your AI workforce</div>
          </div>
        </div>
        <div class="gc" style="padding:20px;">
          <div class="role-panel">
            <div class="role-panel-lbl">Scout</div>
            <div class="role-panel-title">Channel Monitor</div>
            <div class="role-panel-sub">Watches all channels and captures loops</div>
            <div style="margin-top:10px"><span class="status-badge online"><span class="status-dot"></span> Online</span></div>
          </div>
          <div class="role-panel">
            <div class="role-panel-lbl">Atlas</div>
            <div class="role-panel-title">Task Manager</div>
            <div class="role-panel-sub">Organizes and tracks tasks</div>
            <div style="margin-top:10px"><span class="status-badge online"><span class="status-dot"></span> Online</span></div>
          </div>
          <div class="role-panel">
            <div class="role-panel-lbl">Ledger</div>
            <div class="role-panel-title">Audit Keeper</div>
            <div class="role-panel-sub">Maintains the audit trail</div>
            <div style="margin-top:10px"><span class="status-badge online"><span class="status-dot"></span> Online</span></div>
          </div>
        </div>
      </div>
    `;
  }

  function renderTeam(container) {
    container.innerHTML = `
      <div>
        <div class="sec-head">
          <div>
            <div class="sec-title">Team</div>
            <div class="sec-sub">Manage your team</div>
          </div>
        </div>
        ${renderEmptyState('👥', 'Team management coming soon', 'Invite team members and assign roles to collaborate effectively.')}
      </div>
    `;
  }

  function renderBrain(container) {
    container.innerHTML = `
      <div>
        <div class="sec-head">
          <div>
            <div class="sec-title">Company Brain</div>
            <div class="sec-sub">What the brain learned</div>
          </div>
        </div>
        ${renderEmptyState('🧠', 'Learning timeline coming soon', 'The brain will learn from your interactions and provide insights over time.')}
      </div>
    `;
  }

  function renderReports(container) {
    container.innerHTML = `
      <div>
        <div class="sec-head">
          <div>
            <div class="sec-title">Reports</div>
            <div class="sec-sub">Per-scope monthly recaps</div>
          </div>
        </div>
        ${renderEmptyState('📊', 'Reports coming soon', 'Generate reports on loops, tasks, and lead performance.')}
      </div>
    `;
  }

  function renderSettings(container) {
    container.innerHTML = `
      <div>
        <div class="sec-head">
          <div>
            <div class="sec-title">Settings</div>
            <div class="sec-sub">Configure your workspace</div>
          </div>
        </div>
        <div class="gc" style="padding:20px;">
          <div class="role-panel">
            <div class="role-panel-lbl">Autonomy</div>
            <div class="role-panel-title">AI Autonomy Controls</div>
            <div class="role-panel-sub">Configure how AI agents act on your behalf</div>
          </div>
          <div class="role-panel">
            <div class="role-panel-lbl">Connections</div>
            <div class="role-panel-title">Channel Connections</div>
            <div class="role-panel-sub">Connect WhatsApp, Email, Slack, and more</div>
          </div>
          <div class="role-panel">
            <div class="role-panel-lbl">Shortcuts</div>
            <div class="role-panel-title">Keyboard Shortcuts</div>
            <div class="role-panel-sub">Learn shortcuts to work faster</div>
            <button class="btn btn-secondary" style="margin-top:12px" onclick="app.showShortcuts()">View Shortcuts</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderActivity(container) {
    container.innerHTML = `
      <div>
        <div class="sec-head">
          <div>
            <div class="sec-title">Activity</div>
            <div class="sec-sub">Audit trail</div>
          </div>
        </div>
        ${renderEmptyState('📋', 'Activity log coming soon', 'Track all changes and actions across your workspace.')}
      </div>
    `;
  }

  // --- Empty State Helper ---
  function renderEmptyState(icon, title, sub, actionLabel, actionClick) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">${icon}</div>
        <div class="empty-state-title">${title}</div>
        <div class="empty-state-sub">${sub}</div>
        ${actionLabel ? `<button class="btn btn-primary empty-state-action" onclick="${actionClick}">${actionLabel}</button>` : ''}
      </div>
    `;
  }

  // --- Helper Functions ---
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  function getChannelEmoji(channel) {
    const emojis = { whatsapp: '💬', email: '📧', slack: '💼', telegram: '✈️', github: '🐙', calendar: '📅', manual: '📝' };
    return emojis[channel] || '📝';
  }

  function getStageColor(stage) {
    const colors = { new: 'var(--blue)', contacted: 'var(--amber)', meeting: 'var(--teal)', proposal: 'var(--violet)', won: 'var(--green)', lost: 'var(--red)' };
    return colors[stage] || 'var(--blue)';
  }

  // --- Data Loading ---
  async function loadData() {
    try {
      [loops, tasks, leads] = await Promise.all([
        api('/api/loops'),
        api('/api/tasks'),
        api('/api/leads'),
      ]);
      document.getElementById('loops-badge').textContent = loops.length;
      renderPage();
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }

  // --- Keyboard Navigation ---
  function handleKeyboardShortcuts(e) {
    // Ignore if typing in input
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.contentEditable === 'true') {
      if (e.key === 'Escape') e.target.blur();
      return;
    }

    // Command palette
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      commandPalette.open();
      return;
    }

    // ? for shortcuts
    if (e.key === '?') {
      e.preventDefault();
      app.showShortcuts();
      return;
    }

    // / for search
    if (e.key === '/') {
      e.preventDefault();
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.focus();
      return;
    }

    // j/k for navigation
    if (e.key === 'j') {
      e.preventDefault();
      navigateSelection(1);
      return;
    }
    if (e.key === 'k') {
      e.preventDefault();
      navigateSelection(-1);
      return;
    }

    // x for complete
    if (e.key === 'x' && selectedIndex >= 0) {
      e.preventDefault();
      completeSelected();
      return;
    }

    // s for snooze
    if (e.key === 's' && selectedIndex >= 0) {
      e.preventDefault();
      snoozeSelected();
      return;
    }

    // n for new (then l/t/d for type)
    if (e.key === 'n') {
      e.preventDefault();
      pendingKeystroke = 'n';
      setTimeout(() => { pendingKeystroke = null; }, 1000);
      return;
    }

    // g for go-to
    if (e.key === 'g') {
      e.preventDefault();
      pendingKeystroke = 'g';
      setTimeout(() => { pendingKeystroke = null; }, 1000);
      return;
    }

    // Handle pending keystroke
    if (pendingKeystroke === 'n') {
      pendingKeystroke = null;
      if (e.key === 'l') { app.openNewLoop(); return; }
      if (e.key === 't') { app.openNewTask(); return; }
      if (e.key === 'd') { app.openNewLead(); return; }
    }
    if (pendingKeystroke === 'g') {
      pendingKeystroke = null;
      if (e.key === 'l') { navigateTo('loops'); return; }
      if (e.key === 't') { navigateTo('tasks'); return; }
      if (e.key === 'd') { navigateTo('leads'); return; }
      if (e.key === 'p') { navigateTo('projects'); return; }
    }
  }

  function navigateSelection(direction) {
    const cards = document.querySelectorAll(`#content .gc[data-index]`);
    if (!cards.length) return;

    // Remove current selection
    cards.forEach(c => c.style.outline = 'none');

    selectedIndex += direction;
    if (selectedIndex < 0) selectedIndex = cards.length - 1;
    if (selectedIndex >= cards.length) selectedIndex = 0;

    const card = cards[selectedIndex];
    if (card) {
      card.style.outline = '2px solid var(--accent)';
      card.style.outlineOffset = '2px';
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function completeSelected() {
    const cards = document.querySelectorAll(`#content .gc[data-index]`);
    const card = cards[selectedIndex];
    if (!card) return;
    const id = card.dataset.id;
    if (currentPage === 'loops') app.closeLoop(id);
    else if (currentPage === 'tasks') app.completeTask(id);
  }

  function snoozeSelected() {
    const cards = document.querySelectorAll(`#content .gc[data-index]`);
    const card = cards[selectedIndex];
    if (!card) return;
    const id = card.dataset.id;
    if (currentPage === 'loops') app.snoozeLoop(id);
  }

  // --- SSE (Server-Sent Events) ---
  let eventSource = null;
  function connectSSE() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource('/api/stream');
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'loop.created' || data.type === 'loop.closed' || data.type === 'loop.snoozed') {
          loadData();
        }
      } catch {}
    };
    eventSource.onerror = () => {
      setTimeout(connectSSE, 5000);
    };
  }

  // --- Drag & Drop System ---
  const dragDrop = {
    draggedElement: null,
    draggedData: null,
    placeholder: null,
    sourceContainer: null,

    init() {
      document.addEventListener('dragstart', this.handleDragStart.bind(this));
      document.addEventListener('dragend', this.handleDragEnd.bind(this));
      document.addEventListener('dragover', this.handleDragOver.bind(this));
      document.addEventListener('dragenter', this.handleDragEnter.bind(this));
      document.addEventListener('dragleave', this.handleDragLeave.bind(this));
      document.addEventListener('drop', this.handleDrop.bind(this));

      // Touch drag support for mobile
      document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
      document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
      document.addEventListener('touchend', this.handleTouchEnd.bind(this));
    },

    handleDragStart(e) {
      const draggable = e.target.closest('[data-draggable="true"]');
      if (!draggable) return;

      this.draggedElement = draggable;
      this.draggedData = {
        id: draggable.dataset.id,
        type: draggable.dataset.dragType,
        source: draggable.closest('[data-container]')?.dataset.container,
      };
      this.sourceContainer = draggable.closest('[data-container]');

      draggable.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggable.dataset.id);

      // Create placeholder
      this.placeholder = document.createElement('div');
      this.placeholder.className = 'drag-placeholder';
      this.placeholder.style.height = `${draggable.offsetHeight}px`;
    },

    handleDragEnd(e) {
      const draggable = e.target.closest('[data-draggable="true"]');
      if (draggable) draggable.classList.remove('dragging');

      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      if (this.placeholder && this.placeholder.parentNode) {
        this.placeholder.remove();
      }

      this.draggedElement = null;
      this.draggedData = null;
      this.placeholder = null;
      this.sourceContainer = null;
    },

    handleDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const container = e.target.closest('[data-container]');
      if (!container || !this.placeholder) return;

      const afterElement = this.getDragAfterElement(container, e.clientY);
      if (afterElement) {
        container.insertBefore(this.placeholder, afterElement);
      } else {
        container.appendChild(this.placeholder);
      }
    },

    handleDragEnter(e) {
      const container = e.target.closest('[data-container]');
      if (container) container.classList.add('drag-over');
    },

    handleDragLeave(e) {
      const container = e.target.closest('[data-container]');
      if (container && !container.contains(e.relatedTarget)) {
        container.classList.remove('drag-over');
      }
    },

    handleDrop(e) {
      e.preventDefault();
      const container = e.target.closest('[data-container]');
      if (!container || !this.draggedElement) return;

      container.classList.remove('drag-over');

      // Insert at placeholder position
      if (this.placeholder && this.placeholder.parentNode) {
        this.placeholder.parentNode.insertBefore(this.draggedElement, this.placeholder);
      }

      // Emit drop event for handlers
      const dropEvent = new CustomEvent('itemdrop', {
        detail: {
          id: this.draggedData.id,
          type: this.draggedData.type,
          source: this.draggedData.source,
          target: container.dataset.container,
          newIndex: Array.from(container.children).indexOf(this.draggedElement),
        },
      });
      container.dispatchEvent(dropEvent);

      // Animate the dropped item
      this.draggedElement.classList.add('animate-bounce');
      setTimeout(() => this.draggedElement?.classList.remove('animate-bounce'), 300);
    },

    getDragAfterElement(container, y) {
      const draggableElements = [...container.querySelectorAll('[data-draggable="true"]:not(.dragging)')];

      return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset, element: child };
        }
        return closest;
      }, { offset: Number.NEGATIVE_INFINITY }).element;
    },

    // Touch drag for mobile
    touchStartY: 0,
    touchClone: null,

    handleTouchStart(e) {
      const draggable = e.target.closest('[data-draggable="true"]');
      if (!draggable) return;

      this.touchStartY = e.touches[0].clientY;
      this.draggedElement = draggable;
      this.draggedData = {
        id: draggable.dataset.id,
        type: draggable.dataset.dragType,
        source: draggable.closest('[data-container]')?.dataset.container,
      };
    },

    handleTouchMove(e) {
      if (!this.draggedElement) return;

      const touch = e.touches[0];
      const deltaY = Math.abs(touch.clientY - this.touchStartY);

      // Start drag after 10px movement
      if (deltaY > 10 && !this.touchClone) {
        e.preventDefault();
        this.draggedElement.classList.add('dragging');

        // Create visual clone
        this.touchClone = this.draggedElement.cloneNode(true);
        this.touchClone.classList.add('drag-ghost');
        this.touchClone.style.width = `${this.draggedElement.offsetWidth}px`;
        document.body.appendChild(this.touchClone);

        this.placeholder = document.createElement('div');
        this.placeholder.className = 'drag-placeholder';
        this.placeholder.style.height = `${this.draggedElement.offsetHeight}px`;
        this.draggedElement.parentNode.insertBefore(this.placeholder, this.draggedElement);
      }

      if (this.touchClone) {
        this.touchClone.style.left = `${touch.clientX - this.draggedElement.offsetWidth / 2}px`;
        this.touchClone.style.top = `${touch.clientY - 30}px`;

        // Find container under touch point
        this.touchClone.style.display = 'none';
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        this.touchClone.style.display = '';

        const container = elementBelow?.closest('[data-container]');
        if (container) {
          const afterElement = this.getDragAfterElement(container, touch.clientY);
          if (afterElement) {
            container.insertBefore(this.placeholder, afterElement);
          } else {
            container.appendChild(this.placeholder);
          }
        }
      }
    },

    handleTouchEnd(e) {
      if (this.touchClone) {
        // Drop at placeholder position
        if (this.placeholder && this.placeholder.parentNode) {
          this.placeholder.parentNode.insertBefore(this.draggedElement, this.placeholder);
          this.draggedElement.classList.add('animate-bounce');
          setTimeout(() => this.draggedElement?.classList.remove('animate-bounce'), 300);
        }
        this.touchClone.remove();
        this.touchClone = null;
      }

      if (this.draggedElement) {
        this.draggedElement.classList.remove('dragging');
      }
      if (this.placeholder && this.placeholder.parentNode) {
        this.placeholder.remove();
      }

      this.draggedElement = null;
      this.draggedData = null;
      this.placeholder = null;
    },
  };

  // --- 3D Tilt Effect ---
  function initTiltEffect() {
    document.addEventListener('mousemove', (e) => {
      document.querySelectorAll('.tilt-card').forEach(card => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          const rotateX = (y - centerY) / 20;
          const rotateY = (centerX - x) / 20;

          const inner = card.querySelector('.tilt-card-inner') || card;
          inner.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        }
      });
    });

    document.addEventListener('mouseleave', (e) => {
      if (e.target.classList?.contains('tilt-card')) {
        const inner = e.target.querySelector('.tilt-card-inner') || e.target;
        inner.style.transform = 'perspective(1000px) rotateX(0) rotateY(0)';
      }
    }, true);
  }

  // --- Ripple Effect ---
  function createRipple(e) {
    const button = e.currentTarget;
    const circle = document.createElement('span');
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${e.clientX - button.getBoundingClientRect().left - radius}px`;
    circle.style.top = `${e.clientY - button.getBoundingClientRect().top - radius}px`;
    circle.classList.add('btn-ripple');

    const existingRipple = button.querySelector('.btn-ripple');
    if (existingRipple) existingRipple.remove();

    button.appendChild(circle);
    setTimeout(() => circle.remove(), 600);
  }

  // --- Gesture Handler (Swipe) ---
  const gestureHandler = {
    startX: 0,
    startY: 0,
    startTime: 0,

    init() {
      document.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: true });
      document.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: true });
    },

    onTouchStart(e) {
      this.startX = e.touches[0].clientX;
      this.startY = e.touches[0].clientY;
      this.startTime = Date.now();
    },

    onTouchEnd(e) {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const deltaX = endX - this.startX;
      const deltaY = endY - this.startY;
      const deltaTime = Date.now() - this.startTime;

      // Quick swipe detection (under 300ms, more than 50px)
      if (deltaTime < 300 && Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
        const card = e.target.closest('[data-swipeable="true"]');
        if (!card) return;

        if (deltaX > 0) {
          // Swipe right - complete
          card.dispatchEvent(new CustomEvent('swiperight', { detail: { id: card.dataset.id } }));
          card.classList.add('animate-bounce');
        } else {
          // Swipe left - snooze/delete
          card.dispatchEvent(new CustomEvent('swipeleft', { detail: { id: card.dataset.id } }));
          card.classList.add('animate-shake');
        }
        setTimeout(() => card.classList.remove('animate-bounce', 'animate-shake'), 300);
      }
    },
  };

  // --- Smooth Scroll ---
  function smoothScrollTo(element) {
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // --- Intersection Observer for Animations ---
  function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-slide-down');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.gc, .loop-card, .task-card, .lead-card').forEach(el => {
      observer.observe(el);
    });
  }

  // --- Event Listeners ---
  function initEventListeners() {
    // Navigation (sidebar)
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => navigateTo(item.dataset.page));
    });

    // Navigation (bottom nav)
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
      item.addEventListener('click', () => navigateTo(item.dataset.page));
    });

    // Role switcher
    document.querySelectorAll('.role-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        currentRole = chip.dataset.role;
        document.querySelectorAll('.role-chip').forEach(c => c.classList.remove('on'));
        chip.classList.add('on');
        renderPage();
      });
    });

    // Theme
    document.getElementById('theme-toggle').addEventListener('click', () => {
      document.getElementById('theme-panel').classList.toggle('open');
    });

    document.querySelectorAll('.theme-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => setTheme(swatch.dataset.theme));
    });

    // Modal
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    // Bottom sheet
    document.getElementById('bottom-sheet-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeBottomSheet();
    });

    // Notifications
    document.getElementById('notif-btn').addEventListener('click', () => {
      document.getElementById('notif-panel').classList.toggle('open');
    });
    document.getElementById('notif-close').addEventListener('click', () => {
      document.getElementById('notif-panel').classList.remove('open');
    });

    // Command palette
    document.getElementById('cmd-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) commandPalette.close();
    });
    document.getElementById('cmd-input').addEventListener('input', (e) => {
      commandPalette.renderResults(e.target.value);
    });
    document.getElementById('cmd-input').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); commandPalette.navigate(1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); commandPalette.navigate(-1); }
      if (e.key === 'Enter') { e.preventDefault(); commandPalette.select(); }
      if (e.key === 'Escape') { commandPalette.close(); }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Search
    document.getElementById('search-input').addEventListener('input', (e) => {
      const query = String(e.target.value || '').trim().toLowerCase();
      document.querySelectorAll('#nav .nav-item').forEach((item) => {
        const text = (item.textContent || '').toLowerCase();
        item.style.display = !query || text.includes(query) ? '' : 'none';
      });
      document.querySelectorAll('#content .gc, #content .loop-card, #content .task-card, #content .lead-card').forEach((card) => {
        const text = (card.textContent || '').toLowerCase();
        card.style.display = !query || text.includes(query) ? '' : 'none';
      });
    });

    // Close panels on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.theme-picker')) {
        document.getElementById('theme-panel').classList.remove('open');
      }
    });

    // Connect SSE
    connectSSE();

    // Drag & Drop event handlers
    document.addEventListener('itemdrop', async (e) => {
      const { id, type, source, target } = e.detail;
      if (type === 'task' && source !== target) {
        try {
          await api(`/api/tasks/${id}/move`, { method: 'POST', body: JSON.stringify({ day: target }) });
          showToast(`Task moved to ${target}`);
          loadData();
        } catch (err) {
          showToast('Failed to move task', 'error');
          loadData();
        }
      }
      if (type === 'loop' && source !== target) {
        // Switch between your/theirs court
        const newSide = target === 'yours' ? 'yours' : 'theirs';
        showToast(`Loop moved to ${newSide === 'yours' ? 'Your Court' : 'Their Court'}`);
        loadData();
      }
      if (type === 'lead' && source !== target) {
        showToast(`Lead moved to ${target}`);
        loadData();
      }
    });

    // Swipe event handlers
    document.addEventListener('swiperight', async (e) => {
      const { id } = e.detail;
      if (currentPage === 'loops') app.closeLoop(id);
      else if (currentPage === 'tasks') app.completeTask(id);
    });
    document.addEventListener('swipeleft', async (e) => {
      const { id } = e.detail;
      if (currentPage === 'loops') app.snoozeLoop(id);
      else if (currentPage === 'tasks') app.moveTask(id, 'upcoming');
    });

    // Button ripple effect
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn');
      if (btn) createRipple(e);
    });

    // Init scroll animations after data loads
    setTimeout(initScrollAnimations, 500);
  }

  // --- Public API (for onclick handlers) ---
  window.app = {
    openNewLoop: () => {
      openModal('New Loop', `
        <input class="input" id="new-loop-title" placeholder="Loop title" style="margin-bottom:12px;">
        <input class="input" id="new-loop-why" placeholder="Why (optional)">
      `, `
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.createLoop()">Create</button>
      `);
    },
    createLoop: async () => {
      const title = document.getElementById('new-loop-title').value.trim();
      const why = document.getElementById('new-loop-why').value.trim();
      if (!title) return showToast('Title is required', 'error');
      try {
        await api('/api/loops', { method: 'POST', body: JSON.stringify({ title, why }) });
        closeModal();
        showToast('Loop created');
        loadData();
      } catch (err) {
        showToast('Failed to create loop', 'error');
      }
    },
    closeLoop: async (id) => {
      try {
        await api(`/api/loops/${id}/close`, { method: 'POST' });
        showToast('Loop closed', 'success', async () => {
          await api(`/api/loops`, { method: 'POST', body: JSON.stringify({ title: 'Restored loop', side: 'yours' }) });
          loadData();
        });
        loadData();
      } catch (err) {
        showToast('Failed to close loop', 'error');
      }
    },
    snoozeLoop: async (id) => {
      try {
        await api(`/api/loops/${id}/snooze`, { method: 'POST', body: JSON.stringify({ hours: 24 }) });
        showToast('Loop snoozed for 24h');
        loadData();
      } catch (err) {
        showToast('Failed to snooze loop', 'error');
      }
    },
    saveLoopTitle: async (id, title) => {
      title = title.trim();
      if (!title) return;
      try {
        await api(`/api/loops/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
      } catch (err) {
        showToast('Failed to save', 'error');
        loadData();
      }
    },
    openLoopDetail: (id) => {
      const loop = loops.find(l => l.id === id);
      if (!loop) return;
      openModal(loop.title, `
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">Channel</div>
          <div>${getChannelEmoji(loop.channel)} ${loop.channel}</div>
        </div>
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">Status</div>
          <div class="status-badge ${loop.side === 'yours' ? 'busy' : 'online'}">${loop.side === 'yours' ? 'Your Court' : 'Their Court'}</div>
        </div>
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">Created</div>
          <div>${new Date(loop.createdAt).toLocaleString()}</div>
        </div>
      `, `
        <button class="btn btn-secondary" onclick="app.closeModal()">Close</button>
        <button class="btn btn-primary" onclick="app.closeLoop('${id}');app.closeModal()">Complete</button>
      `);
    },
    loopContextMenu: (e, id) => {
      showContextMenu(e, [
        { icon: '✅', label: 'Complete', action: () => app.closeLoop(id) },
        { icon: '😴', label: 'Snooze 24h', action: () => app.snoozeLoop(id) },
        { icon: '👤', label: 'Assign', action: () => app.assignLoop(id) },
        { separator: true },
        { icon: '✏️', label: 'Edit', action: () => {
          const titleEl = document.querySelector(`[data-loop-id="${id}"]`);
          if (titleEl) { titleEl.contentEditable = 'true'; titleEl.focus(); }
        }},
      ]);
    },
    assignLoop: async (id) => {
      showToast('Assignment coming soon', 'info');
    },
    openNewTask: () => {
      openModal('New Task', `
        <input class="input" id="new-task-title" placeholder="Task title" style="margin-bottom:12px;">
        <select class="input" id="new-task-day" style="margin-bottom:12px;">
          <option value="today">Today</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="upcoming">Upcoming</option>
        </select>
        <select class="input" id="new-task-priority">
          <option value="">No priority</option>
          <option value="low">Low</option>
          <option value="med">Medium</option>
          <option value="high">High</option>
        </select>
      `, `
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.createTask()">Create</button>
      `);
    },
    createTask: async () => {
      const title = document.getElementById('new-task-title').value.trim();
      const day = document.getElementById('new-task-day').value;
      const priority = document.getElementById('new-task-priority').value || null;
      if (!title) return showToast('Title is required', 'error');
      try {
        await api('/api/tasks', { method: 'POST', body: JSON.stringify({ title, day, priority }) });
        closeModal();
        showToast('Task created');
        loadData();
      } catch (err) {
        showToast('Failed to create task', 'error');
      }
    },
    completeTask: async (id) => {
      try {
        await api(`/api/tasks/${id}/complete`, { method: 'POST' });
        showToast('Task completed', 'success', () => {
          loadData();
        });
        loadData();
      } catch (err) {
        showToast('Failed to complete task', 'error');
      }
    },
    saveTaskTitle: async (id, title) => {
      title = title.trim();
      if (!title) return;
      try {
        await api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
      } catch (err) {
        showToast('Failed to save', 'error');
        loadData();
      }
    },
    taskContextMenu: (e, id) => {
      showContextMenu(e, [
        { icon: '✅', label: 'Complete', action: () => app.completeTask(id) },
        { icon: '📅', label: 'Move to Tomorrow', action: () => app.moveTask(id, 'tomorrow') },
        { icon: '📅', label: 'Move to Upcoming', action: () => app.moveTask(id, 'upcoming') },
        { separator: true },
        { icon: '✏️', label: 'Edit', action: () => {
          const titleEl = document.querySelector(`[data-task-id="${id}"]`);
          if (titleEl) { titleEl.contentEditable = 'true'; titleEl.focus(); }
        }},
      ]);
    },
    moveTask: async (id, day) => {
      try {
        await api(`/api/tasks/${id}/move`, { method: 'POST', body: JSON.stringify({ day }) });
        showToast(`Task moved to ${day}`);
        loadData();
      } catch (err) {
        showToast('Failed to move task', 'error');
      }
    },
    openNewLead: () => {
      openModal('New Lead', `
        <input class="input" id="new-lead-name" placeholder="Name" style="margin-bottom:12px;">
        <input class="input" id="new-lead-company" placeholder="Company" style="margin-bottom:12px;">
        <input class="input" id="new-lead-email" placeholder="Email" style="margin-bottom:12px;">
        <input class="input" id="new-lead-phone" placeholder="Phone">
      `, `
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.createLead()">Create</button>
      `);
    },
    createLead: async () => {
      const name = document.getElementById('new-lead-name').value.trim();
      const company = document.getElementById('new-lead-company').value.trim();
      const email = document.getElementById('new-lead-email').value.trim();
      const phone = document.getElementById('new-lead-phone').value.trim();
      if (!name) return showToast('Name is required', 'error');
      try {
        await api('/api/leads', { method: 'POST', body: JSON.stringify({ name, company, email, phone }) });
        closeModal();
        showToast('Lead created');
        loadData();
      } catch (err) {
        showToast('Failed to create lead', 'error');
      }
    },
    advanceLead: async (id) => {
      try {
        await api(`/api/leads/${id}/advance`, { method: 'POST' });
        showToast('Lead advanced');
        loadData();
      } catch (err) {
        showToast('Failed to advance lead', 'error');
      }
    },
    assignLead: async (id) => {
      showToast('Assignment coming soon', 'info');
    },
    leadContextMenu: (e, id) => {
      showContextMenu(e, [
        { icon: '➡️', label: 'Advance Stage', action: () => app.advanceLead(id) },
        { icon: '👤', label: 'Assign', action: () => app.assignLead(id) },
      ]);
    },
    openNewProject: () => {
      openModal('New Project', `
        <input class="input" id="new-project-name" placeholder="Project name" style="margin-bottom:12px;">
        <input class="input" id="new-project-desc" placeholder="Description (optional)">
      `, `
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.createProject()">Create</button>
      `);
    },
    createProject: () => {
      const name = document.getElementById('new-project-name').value.trim();
      const description = document.getElementById('new-project-desc').value.trim();
      if (!name) return showToast('Name is required', 'error');
      const project = {
        id: 'proj_' + Date.now(),
        name,
        description,
        template: 'blank',
        createdAt: Date.now(),
      };
      projects.push(project);
      localStorage.setItem('cb-projects', JSON.stringify(projects));
      closeModal();
      showToast('Project created');
      renderPage();
    },
    showShortcuts: () => {
      document.getElementById('shortcuts-overlay').classList.add('open');
    },
    closeShortcuts: () => {
      document.getElementById('shortcuts-overlay').classList.remove('open');
    },
    executeCmdItem: (index) => {
      if (window._cmdItemActions && window._cmdItemActions[index]) {
        commandPalette.close();
        window._cmdItemActions[index]();
      }
    },
    closeModal,
    closeBottomSheet,
  };

  // --- Init ---
  function init() {
    setTheme(currentTheme);
    initEventListeners();
    dragDrop.init();
    gestureHandler.init();
    initTiltEffect();
    loadData();
    initPushNotifications();
  }

  // --- Push Notifications ---
  function initPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    // Subscribe to push on first visit
    navigator.serviceWorker.ready.then(async (reg) => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            localStorage.getItem('cb-vapid-key') || ''
          )
        });
        // Send subscription to server
        api('/api/notifications/subscribe', {
          method: 'POST',
          body: JSON.stringify({ subscription })
        }).catch(() => {});
      } catch (e) {
        console.log('Push subscription skipped:', e.message);
      }
    });
  }

  function urlBase64ToUint8Array(base64String) {
    if (!base64String) return new Uint8Array(0);
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  }

  // --- SSE Reconnection ---
  let sseRetryCount = 0;
  function connectSSE() {
    const source = new EventSource('/api/sse');
    source.onopen = () => { sseRetryCount = 0; };
    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        handleSSE(data);
      } catch {}
    };
    source.onerror = () => {
      source.close();
      const delay = Math.min(30000, 1000 * Math.pow(2, sseRetryCount++));
      setTimeout(connectSSE, delay);
    };
  }

  function handleSSE(data) {
    if (data.type === 'loop.captured' || data.type === 'loop.created') {
      showToast('New loop captured', 'info');
    } else if (data.type === 'task.completed') {
      showToast('Task completed', 'success');
    } else if (data.type === 'lead.advanced') {
      showToast('Lead advanced', 'info');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
