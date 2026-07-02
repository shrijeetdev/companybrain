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

  // --- API Helper ---
  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }

  // --- Toast ---
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.getElementById('toast-container').appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // --- Modal ---
  function openModal(title, bodyHtml, footerHtml = '') {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml;
    document.getElementById('modal-overlay').classList.add('open');
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
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
    document.querySelectorAll('.nav-item').forEach(item => {
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
  }

  function renderLoops(container) {
    const yourLoops = loops.filter(l => l.side === 'yours');
    const theirLoops = loops.filter(l => l.side === 'theirs');

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
          <div>
            <div class="col-head">
              <div class="col-dot" style="background:var(--accent)"></div>
              <div class="col-label">Your Court</div>
              <div class="col-count">${yourLoops.length}</div>
            </div>
            <div class="col-hint">What you owe</div>
            ${yourLoops.map(loop => renderLoopCard(loop)).join('')}
          </div>
          <div>
            <div class="col-head">
              <div class="col-dot" style="background:var(--amber)"></div>
              <div class="col-label">Their Court</div>
              <div class="col-count">${theirLoops.length}</div>
            </div>
            <div class="col-hint">What you're waiting on</div>
            ${theirLoops.map(loop => renderLoopCard(loop)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderLoopCard(loop) {
    const timeAgo = getTimeAgo(loop.updatedAt);
    return `
      <div class="loop-card gc">
        <button class="check-btn" onclick="app.closeLoop('${loop.id}')"></button>
        <div class="loop-info">
          <div class="loop-title-row">
            <span class="loop-emoji">${getChannelEmoji(loop.channel)}</span>
            <div class="loop-title">${escapeHtml(loop.title)}</div>
          </div>
          <div class="loop-meta">${loop.channel} · ${timeAgo}</div>
          <div class="loop-actions">
            <button class="loop-action" onclick="app.snoozeLoop('${loop.id}')">Snooze</button>
            <button class="loop-action" onclick="app.assignLoop('${loop.id}')">Assign</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderTasks(container) {
    const todayTasks = tasks.filter(t => t.day === 'today');
    const tomorrowTasks = tasks.filter(t => t.day === 'tomorrow');
    const upcomingTasks = tasks.filter(t => t.day === 'upcoming');

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
          <div class="task-col">
            <div class="kanban-header">
              <div class="kanban-dot" style="background:var(--red)"></div>
              <div class="kanban-label">Today</div>
              <div class="kanban-count">${todayTasks.length}</div>
            </div>
            ${todayTasks.map(task => renderTaskCard(task)).join('')}
          </div>
          <div class="task-col">
            <div class="kanban-header">
              <div class="kanban-dot" style="background:var(--amber)"></div>
              <div class="kanban-label">Tomorrow</div>
              <div class="kanban-count">${tomorrowTasks.length}</div>
            </div>
            ${tomorrowTasks.map(task => renderTaskCard(task)).join('')}
          </div>
          <div class="task-col">
            <div class="kanban-header">
              <div class="kanban-dot" style="background:var(--blue)"></div>
              <div class="kanban-label">Upcoming</div>
              <div class="kanban-count">${upcomingTasks.length}</div>
            </div>
            ${upcomingTasks.map(task => renderTaskCard(task)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderTaskCard(task) {
    return `
      <div class="task-card gc">
        <button class="check-btn" onclick="app.completeTask('${task.id}')"></button>
        <div class="task-emoji">${task.emoji || '📋'}</div>
        <div class="task-title">${escapeHtml(task.title)}</div>
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
              <div class="kanban-col">
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
      <div class="lead-card gc">
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

        <div class="loops-grid">
          ${projects.length === 0 ? '<div class="col-hint">No projects yet. Create one to get started.</div>' : ''}
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
          </div>
          <div class="role-panel">
            <div class="role-panel-lbl">Atlas</div>
            <div class="role-panel-title">Task Manager</div>
            <div class="role-panel-sub">Organizes and tracks tasks</div>
          </div>
          <div class="role-panel">
            <div class="role-panel-lbl">Ledger</div>
            <div class="role-panel-title">Audit Keeper</div>
            <div class="role-panel-sub">Maintains the audit trail</div>
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
        <div class="gc" style="padding:20px;">
          <div style="text-align:center;color:var(--muted);">Team management coming soon</div>
        </div>
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
        <div class="gc" style="padding:20px;">
          <div style="text-align:center;color:var(--muted);">Learning timeline coming soon</div>
        </div>
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
        <div class="gc" style="padding:20px;">
          <div style="text-align:center;color:var(--muted);">Reports coming soon</div>
        </div>
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
        <div class="gc" style="padding:20px;">
          <div style="text-align:center;color:var(--muted);">Activity log coming soon</div>
        </div>
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

  // --- Event Handlers ---
  function initEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
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

    // Notifications
    document.getElementById('notif-btn').addEventListener('click', () => {
      document.getElementById('notif-panel').classList.toggle('open');
    });
    document.getElementById('notif-close').addEventListener('click', () => {
      document.getElementById('notif-panel').classList.remove('open');
    });

    // Search
    document.getElementById('search-input').addEventListener('input', (e) => {
      const query = String(e.target.value || '').trim().toLowerCase();

      // Filter sidebar navigation items
      document.querySelectorAll('#nav .nav-item').forEach((item) => {
        const text = (item.textContent || '').toLowerCase();
        item.style.display = !query || text.includes(query) ? '' : 'none';
      });

      // Lightweight in-page filtering for visible cards in the current view
      document.querySelectorAll('#content .gc, #content .loop-card, #content .task-card, #content .lead-card').forEach((card) => {
        const text = (card.textContent || '').toLowerCase();
        card.style.display = !query || text.includes(query) ? '' : 'none';
      });
    });

    // Close theme panel on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.theme-picker')) {
        document.getElementById('theme-panel').classList.remove('open');
      }
    });
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
        showToast('Loop closed');
        loadData();
      } catch (err) {
        showToast('Failed to close loop', 'error');
      }
    },
    snoozeLoop: async (id) => {
      try {
        await api(`/api/loops/${id}/snooze`, { method: 'POST', body: JSON.stringify({ hours: 24 }) });
        showToast('Loop snoozed');
        loadData();
      } catch (err) {
        showToast('Failed to snooze loop', 'error');
      }
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
        showToast('Task completed');
        loadData();
      } catch (err) {
        showToast('Failed to complete task', 'error');
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
    closeModal,
  };

  // --- Init ---
  function init() {
    setTheme(currentTheme);
    initEventListeners();
    loadData();
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
