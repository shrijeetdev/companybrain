// Web UI — Liquid Glass dark design, served at `/` by the single Fastify process.
// Pure HTML + CSS + vanilla JS. No build step, no framework, no external JS deps.
// Matches the Company Brain Liquid Glass design system.

export function renderUi(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>companybrain</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root {
  --bg:#0a0b0f; --surface:rgba(20,20,26,.62); --surface2:rgba(255,255,255,.04);
  --glass:rgba(20,20,26,.6); --glassThin:rgba(15,17,23,.62);
  --glassBorder:rgba(255,255,255,.1); --glassHi:rgba(255,255,255,.12);
  --text:#eef0f5; --muted:#9a9aa8; --faint:#6b6b78;
  --accent:#8b7bff; --accent2:#a78bff; --accentSoft:rgba(139,123,255,.18); --accentGlow:rgba(139,123,255,.4);
  --blue:#3e7bfa; --blue2:#5b93ff; --blueSoft:rgba(62,123,250,.15);
  --green:#37c08a; --greenSoft:rgba(55,192,138,.15);
  --amber:#e8a13a; --amberSoft:rgba(232,161,58,.15);
  --red:#f0556b; --redSoft:rgba(240,85,107,.14);
  --teal:#16b7ae; --tealSoft:rgba(22,183,174,.14);
  --scroll:rgba(160,160,180,.22);
  --nav-w:220px;
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
html,body{margin:0;padding:0;height:100%;overflow:hidden;}
body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Hanken Grotesk',system-ui,sans-serif;font-size:14px;line-height:1.45;color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased;}
::-webkit-scrollbar{width:8px;height:8px;}
::-webkit-scrollbar-thumb{background:var(--scroll);border-radius:8px;border:2px solid transparent;background-clip:padding-box;}
::-webkit-scrollbar-track{background:transparent;}
input,button,textarea{font-family:inherit;}
input:focus,textarea:focus{outline:none;}
button{cursor:pointer;}

/* animations */
@keyframes cbFade{from{opacity:0}to{opacity:1}}
@keyframes cbFadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes cbPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.85)}}
@keyframes cbSpin{to{transform:rotate(360deg)}}
@keyframes cbBlink{0%,100%{opacity:1}50%{opacity:.15}}
@keyframes cbDrift{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(var(--dx,30px),var(--dy,-24px)) scale(1.12)}}
@keyframes cbMesh{0%{transform:translate(-3%,-2%) scale(1.12) rotate(0deg)}33%{transform:translate(3%,2%) scale(1.22) rotate(4deg)}66%{transform:translate(-2%,3%) scale(1.18) rotate(-3deg)}100%{transform:translate(-3%,-2%) scale(1.12) rotate(0deg)}}

/* layout */
#app{position:relative;width:100%;height:100vh;display:flex;flex-direction:column;overflow:hidden;}

/* animated blobs bg */
#bg-blobs{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;}
.blob{position:absolute;border-radius:50%;filter:blur(40px);}
.blob1{top:-12%;left:8%;width:46%;height:60%;background:radial-gradient(circle,rgba(139,123,255,.28),transparent 68%);--dx:40px;--dy:30px;animation:cbDrift 19s ease-in-out infinite;}
.blob2{top:30%;right:-6%;width:42%;height:58%;background:radial-gradient(circle,rgba(91,141,239,.22),transparent 68%);--dx:-32px;--dy:26px;animation:cbDrift 23s ease-in-out infinite;}
.blob3{bottom:-16%;left:34%;width:40%;height:52%;background:radial-gradient(circle,rgba(232,161,58,.14),transparent 68%);--dx:28px;--dy:-22px;animation:cbDrift 27s ease-in-out infinite;}
#mesh{position:absolute;inset:-25%;background:radial-gradient(38% 44% at 24% 28%,rgba(22,207,152,.22),transparent 64%),radial-gradient(40% 42% at 78% 26%,rgba(91,141,239,.18),transparent 66%),radial-gradient(44% 46% at 62% 82%,rgba(124,79,208,.18),transparent 66%);animation:cbMesh 28s ease-in-out infinite;pointer-events:none;}
#grain{position:absolute;inset:0;z-index:6;pointer-events:none;opacity:.04;mix-blend-mode:soft-light;background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E');background-size:170px 170px;}

/* shell */
#shell{position:relative;z-index:1;display:flex;flex:1;min-height:0;}

/* sidebar */
#sidebar{width:var(--nav-w);flex-shrink:0;display:flex;flex-direction:column;padding:20px 14px;gap:4px;border-right:1px solid var(--glassBorder);background:var(--glassThin);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);}
.logo-row{display:flex;align-items:center;gap:9px;padding:2px 8px 18px;}
.logo-text{font-family:'JetBrains Mono',monospace;font-weight:600;font-size:14px;letter-spacing:-.3px;}
.logo-text span{color:var(--accent);}
.logo-sub{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--faint);margin-top:3px;letter-spacing:.4px;}
.nav-item{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:500;color:var(--muted);transition:background .15s,color .15s;user-select:none;}
.nav-item:hover{background:rgba(255,255,255,.06);color:var(--text);}
.nav-item.active{background:rgba(139,123,255,.18);color:var(--text);}
.nav-item .ni{width:17px;height:17px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.nav-badge{margin-left:auto;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--accent);color:#fff;font-size:10px;font-weight:700;font-family:'JetBrains Mono',monospace;display:flex;align-items:center;justify-content:center;}
.sidebar-bot{margin-top:auto;display:flex;flex-direction:column;gap:8px;}
.agent-status{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:11px;background:var(--surface2);border:1px solid var(--glassBorder);}
.agent-dot{width:8px;height:8px;border-radius:50%;background:var(--green);animation:cbPulse 2.4s ease-in-out infinite;}
.agent-label{font-size:11px;font-weight:500;line-height:1.2;}
.agent-sublabel{font-size:9px;color:var(--faint);font-family:'JetBrains Mono',monospace;margin-top:2px;}

/* main */
#main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;}

/* top bar (mobile) */
#topbar{display:none;align-items:center;gap:10px;padding:11px 16px;flex-shrink:0;border-bottom:1px solid var(--glassBorder);background:var(--glassThin);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);}
#topbar .logo-text{font-size:15px;}

/* content */
#content{flex:1;overflow-y:auto;min-height:0;padding:24px clamp(14px,4vw,28px) 100px;}
#content>div{max-width:1100px;margin:0 auto;animation:cbFadeUp .3s ease;}

/* section header */
.sec-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px;flex-wrap:wrap;}
.sec-title{font-size:22px;font-weight:700;letter-spacing:-.5px;}
.sec-sub{font-size:12.5px;color:var(--muted);margin-top:3px;}

/* glass card */
.gc{background:var(--glass);backdrop-filter:blur(20px) saturate(150%);-webkit-backdrop-filter:blur(20px) saturate(150%);border:1px solid var(--glassBorder);box-shadow:inset 0 1px 0 var(--glassHi),0 4px 16px rgba(0,0,0,.14);border-radius:16px;}

/* loop cards */
.loops-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;}
.col-head{display:flex;align-items:center;gap:8px;margin-bottom:13px;padding:0 2px;}
.col-dot{width:9px;height:9px;border-radius:3px;}
.col-label{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;}
.col-count{margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--muted);}
.loop-card{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:14px;margin-bottom:10px;animation:cbFadeUp .3s ease both;}
.loop-card .check-btn{width:22px;height:22px;border-radius:50%;border:2px solid rgba(120,120,160,.4);background:transparent;flex-shrink:0;margin-top:1px;transition:border-color .15s;}
.loop-card .check-btn:hover{border-color:var(--green);}
.loop-info{flex:1;min-width:0;}
.loop-title{font-size:14px;font-weight:600;line-height:1.35;}
.loop-meta{font-size:12px;color:var(--muted);margin-top:4px;}
.loop-actions{display:flex;align-items:center;gap:12px;margin-top:10px;}
.age-pill{font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:7px;white-space:nowrap;}
.age-fresh{background:var(--greenSoft);color:var(--green);}
.age-mid{background:var(--amberSoft);color:var(--amber);}
.age-old{background:var(--redSoft);color:var(--red);}
.link-btn{font-size:12px;font-weight:500;color:var(--muted);background:transparent;border:none;padding:0;}
.link-btn:hover{color:var(--text);}
.link-btn.accent{color:var(--accent);}
.link-btn.teal{color:var(--teal);}

/* quick-add bar */
#qbar{position:fixed;left:var(--nav-w);right:0;bottom:0;padding:12px clamp(14px,4vw,28px);background:var(--glassThin);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);border-top:1px solid var(--glassBorder);display:flex;gap:10px;z-index:20;}
#qbar input{flex:1;min-width:0;background:rgba(255,255,255,.07);border:1px solid var(--glassBorder);border-radius:12px;padding:11px 14px;font-size:14px;color:var(--text);}
#qbar input::placeholder{color:var(--faint);}
#qbar button{background:linear-gradient(135deg,var(--accent),var(--accent2));border:none;border-radius:12px;padding:11px 20px;font-size:13px;font-weight:600;color:#fff;box-shadow:0 4px 14px var(--accentGlow);}

/* segments / tabs */
.seg-bar{display:flex;gap:4px;padding:4px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid var(--glassBorder);width:fit-content;margin-bottom:18px;}
.seg-btn{padding:7px 14px;border-radius:9px;border:none;background:transparent;font-size:13px;font-weight:500;color:var(--muted);}
.seg-btn.on{background:rgba(255,255,255,.1);color:var(--text);box-shadow:0 1px 4px rgba(0,0,0,.2);}

/* task/lead cards */
.item-card{display:flex;align-items:flex-start;gap:12px;padding:13px 16px;border-radius:14px;margin-bottom:9px;}
.item-card .check-btn{width:20px;height:20px;border-radius:50%;border:2px solid rgba(120,120,160,.4);background:transparent;flex-shrink:0;margin-top:1px;transition:border-color .15s;}
.item-card .check-btn:hover{border-color:var(--blue);}
.emoji-ic{font-size:18px;line-height:1;flex-shrink:0;margin-top:1px;}
.item-title{font-size:13.5px;font-weight:600;line-height:1.3;}
.item-sub{font-size:12px;color:var(--muted);margin-top:3px;}
.stage-pill{font-size:11px;font-weight:600;padding:3px 10px;border-radius:8px;white-space:nowrap;margin-left:auto;}

/* autonomy */
.auto-card{padding:15px 17px;border-radius:15px;margin-bottom:10px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
.auto-info{flex:1;min-width:180px;}
.auto-label{font-size:14px;font-weight:600;}
.auto-desc{font-size:12px;color:var(--muted);margin-top:3px;}
.lvls{display:flex;gap:3px;padding:3px;border-radius:10px;background:rgba(0,0,0,.2);border:1px solid var(--glassBorder);}
.lvl{padding:6px 13px;border-radius:7px;border:none;background:transparent;font-size:12px;font-weight:600;color:var(--muted);}
.lvl.on{background:rgba(255,255,255,.12);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.25);}
.approve-card{display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:14px;margin-bottom:9px;}
.approve-title{font-size:13px;font-weight:600;}
.approve-action{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--faint);margin-top:3px;}
.approve-btn{padding:7px 14px;border-radius:9px;border:none;font-size:12px;font-weight:600;}
.approve-btn.ok{background:linear-gradient(135deg,var(--green),#3ee3b0);color:#fff;}
.approve-btn.no{background:rgba(240,85,107,.14);color:var(--red);}

/* events */
.event-card{padding:12px 16px;border-radius:13px;margin-bottom:8px;display:flex;align-items:center;gap:12px;}
.event-type{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;color:var(--accent);}
.event-meta{font-size:11.5px;color:var(--muted);margin-top:2px;}
.undo-btn{margin-left:auto;padding:6px 12px;border-radius:8px;border:1px solid var(--glassBorder);background:transparent;color:var(--muted);font-size:12px;font-weight:500;}
.undo-btn:hover{background:rgba(255,255,255,.06);color:var(--text);}
.rev-badge{margin-left:auto;font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:7px;background:var(--blueSoft);color:var(--blue);}

/* leads */
.stage-bar{display:flex;gap:6px;margin-bottom:18px;overflow-x:auto;padding-bottom:4px;}
.stage-chip{padding:7px 14px;border-radius:9px;border:1px solid var(--glassBorder);background:var(--surface2);font-size:12.5px;font-weight:500;color:var(--muted);white-space:nowrap;}
.stage-chip.on{background:rgba(139,123,255,.2);color:var(--accent);border-color:rgba(139,123,255,.3);}
.lead-stage-new{background:rgba(150,150,170,.12);color:var(--muted);}
.lead-stage-contacted{background:var(--blueSoft);color:var(--blue);}
.lead-stage-meeting{background:rgba(124,92,255,.15);color:#9b7bff;}
.lead-stage-proposal{background:var(--amberSoft);color:var(--amber);}
.lead-stage-won{background:var(--greenSoft);color:var(--green);}
.lead-stage-lost{background:rgba(100,100,120,.1);color:var(--faint);}

/* agents tab */
.agent-card{padding:16px 18px;border-radius:15px;margin-bottom:10px;}
.agent-name{font-size:14px;font-weight:700;}
.agent-role{font-size:12px;color:var(--muted);margin-top:2px;}
.auto-badge{font-size:10px;font-weight:700;padding:3px 9px;border-radius:6px;font-family:'JetBrains Mono',monospace;letter-spacing:.3px;}
.auto-auto{background:var(--greenSoft);color:var(--green);}
.auto-ask{background:var(--amberSoft);color:var(--amber);}
.auto-off{background:rgba(120,120,140,.12);color:var(--faint);}
.agent-stats{display:flex;gap:20px;margin-top:11px;padding-top:10px;border-top:1px solid var(--glassBorder);}
.agent-stat-val{font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:600;}
.agent-stat-lbl{font-size:10.5px;color:var(--muted);margin-top:2px;}

/* mobile bottom nav */
#botnav{display:none;position:fixed;left:0;right:0;bottom:0;background:var(--glassThin);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);border-top:1px solid var(--glassBorder);padding:6px 6px max(8px,env(safe-area-inset-bottom));z-index:30;}
#botnav button{flex:1;border:none;background:transparent;padding:6px 0;font-size:10px;font-weight:600;color:var(--muted);display:flex;flex-direction:column;align-items:center;gap:3px;}
#botnav button.on{color:var(--accent);}
#botnav .bn-ic{font-size:18px;line-height:1;}

/* empty state */
.empty{color:var(--faint);text-align:center;padding:40px 0;font-size:13px;}
.empty-dashed{padding:30px 18px;text-align:center;border-radius:14px;border:1px dashed rgba(255,255,255,.1);color:var(--faint);font-size:12.5px;margin-top:4px;}

/* action buttons */
.btn-primary{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:11px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:13px;font-weight:600;box-shadow:0 4px 14px var(--accentGlow);}
.btn-ghost{display:inline-flex;align-items:center;gap:7px;padding:8px 13px;border-radius:10px;border:1px solid var(--glassBorder);background:rgba(255,255,255,.05);color:var(--muted);font-size:12.5px;font-weight:500;}
.btn-ghost:hover{background:rgba(255,255,255,.08);color:var(--text);}

/* section header action row */
.head-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;}

/* sweep / action bar above content */
.action-strip{display:flex;align-items:center;gap:10px;margin-bottom:20px;flex-wrap:wrap;}

/* loading spinner */
.spin{width:20px;height:20px;border:2.5px solid rgba(255,255,255,.12);border-top-color:var(--accent);border-radius:50%;animation:cbSpin .8s linear infinite;margin:40px auto;display:block;}

@media (max-width:700px){
  #sidebar{display:none;}
  #topbar{display:flex;}
  #botnav{display:flex;}
  #qbar{left:0;bottom:56px;}
  #content{padding:16px 14px 140px;}
}
</style>
</head>
<body>
<div id="app">
  <!-- animated background -->
  <div id="bg-blobs">
    <div id="mesh"></div>
    <div class="blob blob1"></div>
    <div class="blob blob2"></div>
    <div class="blob blob3"></div>
  </div>
  <div id="grain"></div>

  <div id="shell">
    <!-- DESKTOP SIDEBAR -->
    <nav id="sidebar">
      <div class="logo-row">
        <div>
          <div class="logo-text">company<span>brain</span></div>
          <div class="logo-sub">v1 · forget-nothing</div>
        </div>
      </div>
      <div id="side-nav"></div>
      <div class="sidebar-bot">
        <div class="agent-status">
          <div class="agent-dot"></div>
          <div>
            <div class="agent-label">Agent online</div>
            <div class="agent-sublabel">watching all channels</div>
          </div>
        </div>
      </div>
    </nav>

    <!-- MAIN AREA -->
    <main id="main">
      <!-- mobile top bar -->
      <div id="topbar">
        <div class="logo-text">company<span style="color:var(--accent)">brain</span></div>
        <div id="mob-seg" style="margin-left:auto;"></div>
      </div>

      <div id="content">
        <div id="view"><div class="spin"></div></div>
      </div>
    </main>
  </div>

  <!-- quick-add bar -->
  <form id="qbar" style="display:none">
    <input id="qfield" autocomplete="off"/>
    <button type="submit">Add</button>
  </form>

  <!-- mobile bottom nav -->
  <div id="botnav"></div>
</div>
<script>
(function(){
  function showErr(e){
    var m=e&&e.message?e.message:String(e);
    document.getElementById('view').innerHTML='<div style="padding:24px;color:#ff6b6b;font-family:monospace;font-size:13px;white-space:pre-wrap">JS error: '+m+'</div>';
  }
  try {
  var tab = 'loops', side = 'yours', taskDay = 'today', leadView = 'all';

  var TABS = [
    {id:'loops',  ic:'\\u{1F501}', label:'Loops'},
    {id:'tasks',  ic:'\\u2705',    label:'Tasks'},
    {id:'leads',  ic:'\\u{1F91D}',label:'Leads'},
    {id:'agents', ic:'\\u{1F916}',label:'Agents'},
    {id:'auto',   ic:'\\u2699\\uFE0F',label:'Auto'},
    {id:'events', ic:'\\u{1F4DC}',label:'Activity'},
  ];

  var SVG = {
    loops:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    tasks:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    leads:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    agents:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 7V4M8 13h.01M16 13h.01"/></svg>',
    auto:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.1 5A9 9 0 0 1 21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9"/></svg>',
    events:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22V8M5 12H2a10 10 0 0 0 20 0h-3M12 2v3"/></svg>',
  };

  var ACTIONS = [
    {k:'draftReplies', label:'Draft replies', desc:'Acknowledge inbound messages automatically'},
    {k:'chase', label:'Chase loops', desc:'Nudge when the ball is in their court'},
    {k:'sendReminders', label:'Send reminders', desc:'Remind on snoozed loops before they slip'},
    {k:'createTasks', label:'Create tasks', desc:'Turn asks in messages into tasks'},
    {k:'joinMeetings', label:'Join meetings', desc:'Attend and take notes autonomously'},
  ];

  var view = document.getElementById('view');
  var qbar = document.getElementById('qbar');
  var qfield = document.getElementById('qfield');

  // ── helpers ──────────────────────────────────────────────────────────────
  function esc(s){return (s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function api(path,opts){return fetch(path,opts).then(function(r){return r.json().catch(function(){return null;});});}
  function post(path,body,method){return api(path,{method:method||'POST',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});}
  function ago(ts){
    var d=(Date.now()-ts)/1e3;
    if(d<60) return 'just now';
    if(d<3600) return Math.round(d/60)+'m';
    if(d<86400) return Math.round(d/3600)+'h';
    return Math.round(d/86400)+'d';
  }
  function ageCls(ts){
    var d=(Date.now()-ts)/86400e3;
    if(d<1) return 'age-fresh';
    if(d<3) return 'age-mid';
    return 'age-old';
  }
  function stageCls(s){return 'lead-stage-'+(s||'new');}
  function autoBadge(a){return '<span class="auto-badge auto-'+(a||'off')+'">'+(a||'off').toUpperCase()+'</span>';}

  // ── nav ───────────────────────────────────────────────────────────────────
  function buildNav(){
    var sn = document.getElementById('side-nav');
    sn.innerHTML = TABS.map(function(t){
      return '<div class="nav-item'+(t.id===tab?' active':'') +'" data-tab="'+t.id+'">'
        +'<span class="ni">'+SVG[t.id]+'</span>'+t.label+'</div>';
    }).join('');
    sn.querySelectorAll('.nav-item').forEach(function(el){
      el.onclick=function(){tab=el.dataset.tab;buildNav();buildBotNav();render();};
    });

    var bn = document.getElementById('botnav');
    bn.style.display='flex';
    bn.innerHTML = TABS.map(function(t){
      return '<button data-tab="'+t.id+'" class="'+(t.id===tab?'on':'') +'"><span class="bn-ic">'+t.ic+'</span>'+t.label+'</button>';
    }).join('');
    bn.querySelectorAll('button').forEach(function(b){
      b.onclick=function(){tab=b.dataset.tab;buildNav();buildBotNav();render();};
    });
  }
  function buildBotNav(){
    document.querySelectorAll('#botnav button').forEach(function(b){b.classList.toggle('on',b.dataset.tab===tab);});
    document.querySelectorAll('#side-nav .nav-item').forEach(function(el){el.classList.toggle('active',el.dataset.tab===tab);});
  }

  // ── segment bar ───────────────────────────────────────────────────────────
  function segBar(opts,cur,onPick){
    var el = document.createElement('div');
    el.className='seg-bar';
    el.innerHTML=opts.map(function(o){return '<button class="seg-btn'+(o.v===cur?' on':'')+'" data-v="'+o.v+'">'+o.label+'</button>';}).join('');
    el.querySelectorAll('.seg-btn').forEach(function(b){b.onclick=function(){onPick(b.dataset.v);};});
    return el;
  }

  // ── render ────────────────────────────────────────────────────────────────
  function render(){
    var showBar = tab==='loops'||tab==='tasks'||tab==='leads';
    qbar.style.display = showBar?'flex':'none';
    qfield.placeholder = tab==='loops'?'Capture a loop…':tab==='tasks'?'Add a task for today…':'Add lead (name or paste a note)…';
    view.innerHTML='<div class="spin"></div>';
    if(tab==='loops')  loadLoops();
    else if(tab==='tasks') loadTasks();
    else if(tab==='leads') loadLeads();
    else if(tab==='agents') loadAgents();
    else if(tab==='auto') loadAuto();
    else loadEvents();
  }

  // ── loops ─────────────────────────────────────────────────────────────────
  function loadLoops(){
    api('/api/loops').then(function(all){
      all=all||[];
      var yours=all.filter(function(l){return l.side==='yours';});
      var theirs=all.filter(function(l){return l.side==='theirs';});

      var html='<div class="sec-head"><div><div class="sec-title">Open Loops</div>'
        +'<div class="sec-sub">Who owes the next move across every channel.</div></div>'
        +'<div class="head-actions"><button class="btn-ghost" id="sweep-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>Sweep now</button></div></div>'
        +'<div class="loops-grid">'
        +loopCol('Your court','waiting on you','#e8a13a',yours)
        +loopCol('Their court','waiting on others','#2bc4bf',theirs)
        +'</div>';
      view.innerHTML=html;

      view.querySelectorAll('[data-close]').forEach(function(b){b.onclick=function(){post('/api/loops/'+b.dataset.close+'/close').then(loadLoops);};});
      view.querySelectorAll('[data-snooze]').forEach(function(b){b.onclick=function(){post('/api/loops/'+b.dataset.snooze+'/snooze',{hours:24}).then(loadLoops);};});
      var sw=document.getElementById('sweep-btn');
      if(sw) sw.onclick=function(){sw.disabled=true;loadLoops();};
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load loops: '+(e&&e.message||e)+'</div>';});
  }
  function loopCol(label,hint,dotColor,items){
    var cards = items.length ? items.map(function(l){
      var ageStr = ago(l.updatedAt||l.createdAt||Date.now());
      var cls = ageCls(l.updatedAt||l.createdAt||Date.now());
      var isTheirs = l.side==='theirs';
      return '<div class="loop-card gc">'
        +'<button class="check-btn" data-close="'+l.id+'" title="Mark done"></button>'
        +'<div class="loop-info">'
        +'<div class="loop-title">'+esc(l.title)+'</div>'
        +'<div class="loop-meta">'+esc(l.channel||'manual')+(l.why?' · '+esc(l.why):'')+'</div>'
        +'<div class="loop-actions">'
        +(isTheirs
          ? '<button class="link-btn teal" data-snooze="'+l.id+'">Nudge them</button>'
          : '<button class="link-btn" data-snooze="'+l.id+'">Snooze</button>')
        +'<span style="flex:1"></span>'
        +'<span class="age-pill '+cls+'">'+ageStr+'</span>'
        +'</div></div></div>';
    }).join('') : '<div class="empty-dashed">'+(label==='Your court'?'Nothing in your court. Clean board.':'No one&#39;s keeping you waiting.')+'</div>';

    return '<div>'
      +'<div class="col-head"><span class="col-dot" style="background:'+dotColor+'"></span>'
      +'<span class="col-label">'+label+'</span>'
      +'<span style="font-size:11.5px;color:var(--faint);margin-left:4px;">'+hint+'</span>'
      +'<span class="col-count">'+items.length+'</span></div>'
      +cards+'</div>';
  }

  // ── tasks ─────────────────────────────────────────────────────────────────
  function loadTasks(){
    api('/api/tasks').then(function(tasks){
      tasks=tasks||[];
      var filtered=tasks.filter(function(t){return t.day===taskDay;});
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Tasks</div>'
        +'<div class="sec-sub">Your tasks — capture anything, complete what matters.</div></div></div>';
      view.appendChild(segBar([{v:'today',label:'Today'},{v:'tomorrow',label:'Tomorrow'},{v:'upcoming',label:'Upcoming'}],taskDay,function(v){taskDay=v;loadTasks();}));
      var cardWrap=document.createElement('div');
      cardWrap.innerHTML = filtered.length ? filtered.map(function(t){
        var pr = t.priority==='high'?'<span class="auto-badge auto-ask" style="margin-left:auto">HIGH</span>'
                :t.priority==='med'?'<span class="auto-badge" style="margin-left:auto;background:var(--blueSoft);color:var(--blue)">MED</span>':'';
        return '<div class="item-card gc">'
          +'<button class="check-btn" data-done="'+t.id+'" title="Complete"></button>'
          +'<div class="emoji-ic">'+esc(t.emoji||'✅')+'</div>'
          +'<div class="loop-info"><div class="item-title">'+esc(t.title)+'</div>'
          +'<div class="item-sub">'+esc(t.list||'Inbox')+'</div></div>'
          +pr+'</div>';
      }).join('') : '<div class="empty-dashed">No tasks for '+taskDay+'.</div>';
      view.appendChild(cardWrap);
      view.querySelectorAll('[data-done]').forEach(function(b){b.onclick=function(){post('/api/tasks/'+b.dataset.done+'/complete').then(loadTasks);};});
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load tasks: '+(e&&e.message||e)+'</div>';});
  }

  // ── leads ─────────────────────────────────────────────────────────────────
  function loadLeads(){
    api('/api/leads').then(function(leads){
      leads=leads||[];
      if(leadView==='open') leads=leads.filter(function(l){return l.stage!=='won'&&l.stage!=='lost';});
      if(leadView==='won') leads=leads.filter(function(l){return l.stage==='won';});

      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Leads</div>'
        +'<div class="sec-sub">Pipeline — advance each contact toward a close.</div></div></div>';

      var seg=segBar([{v:'all',label:'All'},{v:'open',label:'Open'},{v:'won',label:'Won ✓'}],leadView,function(v){leadView=v;loadLeads();});
      view.appendChild(seg);

      var cardWrap=document.createElement('div');
      cardWrap.innerHTML = leads.length ? leads.map(function(l){
        var sub=[l.company,l.title].filter(Boolean).map(esc).join(' · ');
        var canAdv=l.stage!=='won'&&l.stage!=='lost';
        return '<div class="item-card gc" style="align-items:center;">'
          +'<div class="loop-info"><div class="item-title">'+esc(l.name)+'</div>'
          +(sub?'<div class="item-sub">'+sub+'</div>':'')
          +(l.what?'<div class="item-sub" style="margin-top:2px">'+esc(l.what)+'</div>':'')
          +'</div>'
          +'<span class="stage-pill '+stageCls(l.stage)+'">'+esc(l.stage)+'</span>'
          +(canAdv?'<button class="btn-ghost" data-advance="'+l.id+'" style="margin-left:8px;padding:7px 12px;">Advance →</button>':'')
          +'</div>';
      }).join('') : '<div class="empty-dashed">No leads yet. Add one below.</div>';
      view.appendChild(cardWrap);
      view.querySelectorAll('[data-advance]').forEach(function(b){b.onclick=function(){post('/api/leads/'+b.dataset.advance+'/advance').then(loadLeads);};});
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load leads: '+(e&&e.message||e)+'</div>';});
  }

  // ── agents ────────────────────────────────────────────────────────────────
  function loadAgents(){
    api('/api/agents').then(function(agents){
      agents=agents||[];
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">AI Agents</div>'
        +'<div class="sec-sub">Your autonomous workforce — specialist agents working alongside the team.</div></div></div>';
      var wrap=document.createElement('div');
      wrap.innerHTML = agents.length ? agents.map(function(a){
        return '<div class="agent-card gc">'
          +'<div style="display:flex;align-items:center;gap:13px;">'
          +'<div style="width:42px;height:42px;flex-shrink:0;border-radius:13px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 6px 16px var(--accentGlow);">'+esc(a.emoji||'🤖')+'</div>'
          +'<div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;gap:8px;">'
          +'<span class="agent-name">'+esc(a.name)+'</span>'
          +autoBadge(a.autonomy)+'</div>'
          +'<div class="agent-role">'+esc(a.role)+'</div></div></div>'
          +'<div class="agent-stats">'
          +'<div><div class="agent-stat-val" style="color:var(--green)">'+a.done+'</div><div class="agent-stat-lbl">done</div></div>'
          +'<div><div class="agent-stat-val" style="color:var(--amber)">'+a.pending+'</div><div class="agent-stat-lbl">pending</div></div>'
          +'</div></div>';
      }).join('') : '<div class="empty-dashed">No agents configured yet.</div>';
      view.appendChild(wrap);
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load agents: '+(e&&e.message||e)+'</div>';});
  }

  // ── autonomy ──────────────────────────────────────────────────────────────
  function loadAuto(){
    Promise.all([api('/api/autonomy'),api('/api/approvals')]).then(function(res){
      var settings=res[0]||{}, approvals=(res[1]||[]).filter(function(a){return a.status==='pending';});
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Autonomy</div>'
        +'<div class="sec-sub">What the AI may do on its own — and what needs your approval first.</div></div></div>';

      if(approvals.length){
        var apWrap=document.createElement('div');
        apWrap.innerHTML='<div style="font-family:&#39;JetBrains Mono&#39;,monospace;font-size:10px;color:var(--faint);letter-spacing:.5px;margin:0 0 10px;">PENDING APPROVALS</div>'
          +approvals.map(function(ap){
            return '<div class="approve-card gc">'
              +'<div style="flex:1;min-width:0;"><div class="approve-title">'+esc(ap.title)+'</div>'
              +'<div class="approve-action">'+esc(ap.action)+'</div></div>'
              +'<button class="approve-btn ok" data-approve="'+ap.id+'">Approve</button>'
              +'<button class="approve-btn no" data-dismiss="'+ap.id+'" style="margin-left:6px">Dismiss</button></div>';
          }).join('');
        apWrap.querySelectorAll('[data-approve]').forEach(function(b){b.onclick=function(){post('/api/approvals/'+b.dataset.approve+'/approve').then(loadAuto);};});
        apWrap.querySelectorAll('[data-dismiss]').forEach(function(b){b.onclick=function(){post('/api/approvals/'+b.dataset.dismiss+'/dismiss').then(loadAuto);};});
        view.appendChild(apWrap);
      }

      var autoWrap=document.createElement('div');
      autoWrap.innerHTML='<div style="font-family:&#39;JetBrains Mono&#39;,monospace;font-size:10px;color:var(--faint);letter-spacing:.5px;margin:18px 0 10px;">AUTONOMY SETTINGS</div>'
        +ACTIONS.map(function(a){
          var cur=settings[a.k]||'off';
          var lvls=['off','ask','auto'].map(function(lv){
            return '<button class="lvl'+(lv===cur?' on':'')+'" data-act="'+a.k+'" data-lvl="'+lv+'">'+(lv.charAt(0).toUpperCase()+lv.slice(1))+'</button>';
          }).join('');
          return '<div class="auto-card gc"><div class="auto-info"><div class="auto-label">'+a.label+'</div><div class="auto-desc">'+a.desc+'</div></div><div class="lvls">'+lvls+'</div></div>';
        }).join('');
      autoWrap.querySelectorAll('.lvl').forEach(function(b){b.onclick=function(){post('/api/autonomy',{action:b.dataset.act,level:b.dataset.lvl},'PUT').then(loadAuto);};});
      view.appendChild(autoWrap);
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load autonomy: '+(e&&e.message||e)+'</div>';});
  }

  // ── events ────────────────────────────────────────────────────────────────
  function loadEvents(){
    api('/api/events').then(function(events){
      events=events||[];
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Activity</div>'
        +'<div class="sec-sub">Everything that happened — scoped, logged, and reversible.</div></div></div>';
      var wrap=document.createElement('div');
      wrap.innerHTML = events.length ? events.map(function(e){
        var canUndo=e.reversible&&e.undo;
        return '<div class="event-card gc">'
          +'<div style="flex:1;min-width:0;"><div class="event-type">'+esc(e.type)+'</div>'
          +'<div class="event-meta">'+esc(e.actorId||'system')+(e.channel?' · '+esc(e.channel):'')
          +' · '+new Date(e.at).toLocaleString()+'</div></div>'
          +(canUndo?'<button class="undo-btn" data-undo="'+e.id+'">Undo</button>'
            :e.reversible?'<span class="rev-badge">reversible</span>':'')
          +'</div>';
      }).join('') : '<div class="empty-dashed">No activity yet. Start capturing loops.</div>';
      view.appendChild(wrap);
      view.querySelectorAll('[data-undo]').forEach(function(b){b.onclick=function(){post('/api/events/'+b.dataset.undo+'/undo').then(loadEvents);};});
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load events: '+(e&&e.message||e)+'</div>';});
  }

  // ── quick-add ─────────────────────────────────────────────────────────────
  document.getElementById('qbar').onsubmit=function(e){
    e.preventDefault();
    var v=qfield.value.trim(); if(!v) return;
    qfield.value='';
    if(tab==='loops') post('/api/loops',{title:v,side:side}).then(render);
    else if(tab==='tasks') post('/api/tasks',{title:v,day:taskDay}).then(render);
    else if(tab==='leads'){
      if(v.length>24||/[,@]/.test(v)) post('/api/leads/quick-add',{note:v}).then(render);
      else post('/api/leads',{name:v}).then(render);
    }
  };

  // ── boot ──────────────────────────────────────────────────────────────────
  buildNav();
  render();
  } catch(e) { showErr(e); }
})();
</script>
</body>
</html>`;
}
