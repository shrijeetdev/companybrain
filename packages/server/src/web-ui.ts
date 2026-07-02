// Web UI — Liquid Glass dark design, served at `/` by the single Fastify process.
// Pure HTML + CSS + vanilla JS. No build step, no framework, no external JS deps.
// Matches the Company Brain Liquid Glass design system.

export function renderUi(): string {
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>companybrain</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root {
  --bg:#f0f2f7; --bg2:#e8eaf0;
  --surface:#ffffff; --surface2:#f5f6fb;
  --glass:rgba(255,255,255,.8); --glassThin:rgba(255,255,255,.72);
  --glassBorder:rgba(0,0,0,.08); --glassHi:rgba(255,255,255,.95);
  --text:#111827; --muted:#6b7280; --faint:#9ca3af;
  --accent:#3e7bfa; --accent2:#5b93ff;
  --accentSoft:rgba(62,123,250,.1); --accentGlow:rgba(62,123,250,.2);
  --blue:#3e7bfa; --blue2:#5b93ff; --blueSoft:rgba(62,123,250,.15);
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
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
html,body{margin:0;padding:0;height:100%;overflow:hidden;}
body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Hanken Grotesk',system-ui,sans-serif;font-size:14px;line-height:1.45;color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased;}
::-webkit-scrollbar{width:8px;height:8px;}
::-webkit-scrollbar-thumb{background:var(--scroll);border-radius:8px;border:2px solid transparent;background-clip:padding-box;}
::-webkit-scrollbar-track{background:transparent;}
input,button,textarea{font-family:inherit;}
input:focus,textarea:focus{outline:none;}
button{cursor:pointer;}

@keyframes cbFade{from{opacity:0}to{opacity:1}}
@keyframes cbFadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes cbPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.85)}}
@keyframes cbSpin{to{transform:rotate(360deg)}}
@keyframes cbDrift{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(var(--dx,30px),var(--dy,-24px)) scale(1.12)}}
@keyframes cbMesh{0%{transform:translate(-3%,-2%) scale(1.12) rotate(0deg)}33%{transform:translate(3%,2%) scale(1.22) rotate(4deg)}66%{transform:translate(-2%,3%) scale(1.18) rotate(-3deg)}100%{transform:translate(-3%,-2%) scale(1.12) rotate(0deg)}}
@keyframes cbSlideIn{from{transform:translateX(100%);opacity:0}to{transform:none;opacity:1}}
@keyframes cbSlideUp{from{opacity:0;transform:translate(-50%,14px) scale(.98)}to{opacity:1;transform:translate(-50%,0) scale(1)}}

#app{position:relative;width:100%;height:100vh;display:flex;flex-direction:column;overflow:hidden;}

/* bg blobs */
#bg-blobs{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;}
.blob{position:absolute;border-radius:50%;filter:blur(40px);}
.blob1{top:-12%;left:8%;width:46%;height:60%;background:radial-gradient(circle,var(--b1c,rgba(139,123,255,.28)),transparent 68%);--dx:40px;--dy:30px;animation:cbDrift 19s ease-in-out infinite;}
.blob2{top:30%;right:-6%;width:42%;height:58%;background:radial-gradient(circle,var(--b2c,rgba(91,141,239,.22)),transparent 68%);--dx:-32px;--dy:26px;animation:cbDrift 23s ease-in-out infinite;}
.blob3{bottom:-16%;left:34%;width:40%;height:52%;background:radial-gradient(circle,var(--b3c,rgba(232,161,58,.14)),transparent 68%);--dx:28px;--dy:-22px;animation:cbDrift 27s ease-in-out infinite;}
#mesh{position:absolute;inset:-25%;background:radial-gradient(38% 44% at 24% 28%,var(--m1c,rgba(22,207,152,.22)),transparent 64%),radial-gradient(40% 42% at 78% 26%,var(--m2c,rgba(91,141,239,.18)),transparent 66%),radial-gradient(44% 46% at 62% 82%,var(--m3c,rgba(124,79,208,.18)),transparent 66%);animation:cbMesh 28s ease-in-out infinite;pointer-events:none;}
#grain{position:absolute;inset:0;z-index:6;pointer-events:none;opacity:.02;mix-blend-mode:soft-light;background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E');background-size:170px 170px;}
[data-theme="dark"] #grain{opacity:.04;}

#shell{position:relative;z-index:1;display:flex;flex:1;min-height:0;}

/* sidebar */
#sidebar{width:var(--nav-w);flex-shrink:0;display:flex;flex-direction:column;padding:16px 12px 14px;gap:2px;border-right:1px solid var(--glassBorder);background:var(--glassThin);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);}
.logo-row{display:flex;align-items:center;gap:9px;padding:2px 8px 12px;}
.logo-text{font-family:'JetBrains Mono',monospace;font-weight:600;font-size:14px;letter-spacing:-.3px;}
.logo-text span{color:var(--accent);}
.logo-sub{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--faint);margin-top:3px;letter-spacing:.4px;}
.sidebar-search{padding:0 2px 10px;position:relative;}
.sidebar-search input{width:100%;background:rgba(255,255,255,.06);border:1px solid var(--glassBorder);border-radius:10px;padding:8px 10px 8px 30px;font-size:12px;color:var(--text);}
.sidebar-search input::placeholder{color:var(--faint);}
.ss-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);pointer-events:none;opacity:.4;}
.nav-item{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:500;color:var(--muted);transition:background .15s,color .15s;user-select:none;min-height:40px;}
.nav-item:hover{background:var(--bg2);color:var(--text);}
.nav-item.active{background:var(--accentSoft);color:var(--accent);}
.nav-item .ni{width:17px;height:17px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.nav-badge{margin-left:auto;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--accent);color:#fff;font-size:10px;font-weight:700;font-family:'JetBrains Mono',monospace;display:flex;align-items:center;justify-content:center;}
.sidebar-bot{margin-top:auto;display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--glassBorder);padding-top:10px;}
.agent-status{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:11px;background:var(--surface2);border:1px solid var(--glassBorder);}
.agent-dot{width:8px;height:8px;border-radius:50%;background:var(--green);animation:cbPulse 2.4s ease-in-out infinite;}
.agent-label{font-size:11px;font-weight:500;line-height:1.2;}
.agent-sublabel{font-size:9px;color:var(--faint);font-family:'JetBrains Mono',monospace;margin-top:2px;}
.role-switcher{padding:0 2px;}
.role-sw-label{font-family:'JetBrains Mono',monospace;font-size:8px;color:var(--faint);letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px;padding:0 9px;}
.role-chips{display:flex;gap:4px;flex-wrap:wrap;padding:0 4px;}
.role-chip{padding:4px 9px;border-radius:7px;border:1px solid var(--glassBorder);background:transparent;font-size:10.5px;font-weight:600;color:var(--faint);cursor:pointer;transition:all .15s;min-height:28px;}
.role-chip.on{background:var(--accentSoft);color:var(--accent);border-color:rgba(62,123,250,.3);}
.role-chip:hover:not(.on){background:rgba(255,255,255,.05);color:var(--muted);}

/* theme picker */
.theme-picker{position:relative;}
.theme-btn{display:flex;align-items:center;gap:8px;padding:8px 11px;border-radius:9px;border:1px solid var(--glassBorder);background:transparent;font-size:11px;font-weight:500;color:var(--faint);width:100%;min-height:36px;}
.theme-btn:hover{background:var(--bg2);color:var(--text);}
.theme-panel{position:absolute;bottom:calc(100% + 6px);left:0;right:0;background:var(--surface);backdrop-filter:blur(20px);border:1px solid var(--glassBorder);border-radius:14px;padding:12px 10px;display:none;z-index:50;box-shadow:var(--shadow-lg);}
.theme-panel.open{display:block;animation:cbFadeUp .15s ease;}
.theme-panel-lbl{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--faint);letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px;padding:0 2px;}
.theme-swatches{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;}
.theme-swatch{height:30px;border-radius:9px;cursor:pointer;border:2px solid transparent;transition:border-color .15s;}
.theme-swatch.on{border-color:var(--accent);}

/* main */
#main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;}
#topbar{display:none;align-items:center;gap:10px;padding:11px 16px;flex-shrink:0;border-bottom:1px solid var(--glassBorder);background:var(--glassThin);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);}
#topbar .logo-text{font-size:15px;}
#notif-btn{position:relative;width:40px;height:40px;border-radius:10px;border:1px solid var(--glassBorder);background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;margin-left:auto;}
#notif-btn:hover{background:rgba(255,255,255,.08);}
#notif-count{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--red);color:#fff;font-size:9px;font-weight:700;font-family:'JetBrains Mono',monospace;display:none;align-items:center;justify-content:center;}
#content{flex:1;overflow-y:auto;min-height:0;padding:24px clamp(14px,4vw,28px) 100px;}
#content>div{max-width:1100px;margin:0 auto;animation:cbFadeUp .3s ease;}

/* notifications panel */
#notif-panel{position:fixed;top:0;right:0;width:340px;height:100%;background:rgba(12,13,18,.96);backdrop-filter:blur(24px);border-left:1px solid var(--glassBorder);z-index:100;transform:translateX(100%);transition:transform .25s cubic-bezier(.4,0,.2,1);overflow-y:auto;padding:20px 16px;}
#notif-panel.open{transform:none;}
.notif-head{display:flex;align-items:center;gap:10px;margin-bottom:18px;}
.notif-title{font-size:15px;font-weight:700;flex:1;}
.notif-close{width:36px;height:36px;border-radius:9px;border:1px solid var(--glassBorder);background:transparent;color:var(--muted);display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;}

/* section header */
.sec-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px;flex-wrap:wrap;}
.sec-title{font-size:22px;font-weight:700;letter-spacing:-.5px;}
.sec-sub{font-size:12.5px;color:var(--muted);margin-top:3px;}
.head-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;}

/* glass card */
.gc{background:var(--surface);border:1px solid var(--glassBorder);box-shadow:var(--shadow);border-radius:16px;}
[data-theme="dark"] .gc{backdrop-filter:blur(20px) saturate(150%);-webkit-backdrop-filter:blur(20px) saturate(150%);box-shadow:inset 0 1px 0 var(--glassHi),0 4px 16px rgba(0,0,0,.14);}

/* briefing panel */
.brief-card{padding:18px 20px;border-radius:18px;margin-bottom:22px;}
.brief-header{display:flex;align-items:center;gap:11px;margin-bottom:13px;}
.brief-brain{width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 4px 14px var(--accentGlow);flex-shrink:0;}
.brief-label{font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:600;color:var(--accent);letter-spacing:.8px;text-transform:uppercase;}
.brief-title{font-size:13px;font-weight:500;margin-top:2px;color:var(--text);line-height:1.4;}
.brief-sw{display:flex;gap:2px;margin-left:auto;}
.brief-sw-btn{padding:5px 9px;border:none;border-radius:7px;background:transparent;font-size:10px;font-weight:600;color:var(--faint);font-family:'JetBrains Mono',monospace;letter-spacing:.3px;min-height:28px;}
.brief-sw-btn.on{background:rgba(255,255,255,.1);color:var(--text);}
.brief-stats{display:flex;gap:9px;flex-wrap:wrap;}
.brief-stat{flex:1;min-width:80px;padding:10px 13px;border-radius:11px;background:var(--bg2);border:1px solid var(--glassBorder);}
[data-theme="dark"] .brief-stat{background:rgba(255,255,255,.04);}
.brief-stat-val{font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:700;}
.brief-stat-lbl{font-size:10px;color:var(--muted);margin-top:2px;}

/* CEO KPI row */
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(115px,1fr));gap:10px;margin-bottom:20px;}
.kpi-card{padding:14px 15px;border-radius:14px;}
.kpi-val{font-family:'JetBrains Mono',monospace;font-size:26px;font-weight:700;line-height:1;}
.kpi-lbl{font-size:11px;color:var(--muted);margin-top:7px;}

/* role-specific panels */
.role-panel{padding:16px 18px;border-radius:16px;margin-bottom:18px;border-left:3px solid var(--accent);}
.role-panel-lbl{font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:600;color:var(--accent);letter-spacing:.7px;text-transform:uppercase;margin-bottom:8px;}
.role-panel-title{font-size:14px;font-weight:600;margin-bottom:4px;}
.role-panel-sub{font-size:12px;color:var(--muted);line-height:1.5;}
.role-stats{display:flex;gap:18px;margin-top:12px;padding-top:11px;border-top:1px solid var(--glassBorder);}
.role-stat-val{font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:700;}
.role-stat-lbl{font-size:10px;color:var(--muted);margin-top:2px;}

/* accountability */
.acct-row{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap;}
.acct-avatar{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;border:2px solid var(--glass);box-shadow:0 1px 3px rgba(31,38,135,.2);flex-shrink:0;}
.acct-stack{display:flex;align-items:center;}
.acct-stack .acct-avatar{margin-left:-7px;}
.acct-stack .acct-avatar:first-child{margin-left:0;}
.acct-txt{font-size:10.5px;color:var(--faint);white-space:nowrap;}
.acct-btn{font-size:10.5px;color:var(--accent);background:transparent;border:none;padding:0;cursor:pointer;}
.acct-btn:hover{text-decoration:underline;}

/* loop cards */
.loops-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;}
.col-head{display:flex;align-items:center;gap:8px;margin-bottom:5px;padding:0 2px;}
.col-dot{width:9px;height:9px;border-radius:3px;}
.col-label{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;}
.col-count{margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--muted);}
.col-hint{font-size:10.5px;color:var(--faint);display:block;margin:-2px 0 10px 17px;}
.loop-card{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:14px;margin-bottom:10px;animation:cbFadeUp .3s ease both;}
.loop-card .check-btn{width:22px;height:22px;border-radius:50%;border:2px solid rgba(120,120,160,.4);background:transparent;flex-shrink:0;margin-top:1px;transition:border-color .15s,background .15s;min-height:22px;}
.loop-card .check-btn:hover{border-color:var(--green);background:rgba(55,192,138,.1);}
.loop-info{flex:1;min-width:0;}
.loop-title-row{display:flex;align-items:flex-start;gap:8px;margin-bottom:4px;}
.loop-title-row .loop-title{flex:1;min-width:0;}
.loop-title{font-size:14px;font-weight:600;line-height:1.35;}
.loop-meta{font-size:12px;color:var(--muted);margin-top:2px;}
.loop-chan{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.4px;color:var(--faint);text-transform:uppercase;}
.loop-actions{display:flex;align-items:center;gap:16px;margin-top:10px;}
.age-pill{font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:7px;white-space:nowrap;flex-shrink:0;}
.age-fresh{background:var(--greenSoft);color:var(--green);}
.age-mid{background:var(--amberSoft);color:var(--amber);}
.age-old{background:var(--redSoft);color:var(--red);}
.link-btn{font-size:11.5px;font-weight:500;color:var(--muted);background:transparent;border:none;padding:0;cursor:pointer;min-height:28px;}
.link-btn:hover{color:var(--text);}
.link-btn.teal{color:var(--teal);}

/* quick-add bar */
#qbar{position:fixed;left:var(--nav-w);right:0;bottom:0;padding:12px clamp(14px,4vw,28px);background:var(--glassThin);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);border-top:1px solid var(--glassBorder);display:flex;gap:10px;z-index:20;}
#qbar input{flex:1;min-width:0;background:rgba(255,255,255,.07);border:1px solid var(--glassBorder);border-radius:12px;padding:11px 14px;font-size:14px;color:var(--text);}
#qbar input::placeholder{color:var(--faint);}
#qbar button{background:linear-gradient(135deg,var(--accent),var(--accent2));border:none;border-radius:12px;padding:11px 20px;font-size:13px;font-weight:600;color:#fff;box-shadow:0 4px 14px var(--accentGlow);min-height:44px;}
.qhint{font-size:11px;color:var(--faint);font-family:'JetBrains Mono',monospace;align-self:center;white-space:nowrap;}

/* segments */
.seg-bar{display:flex;gap:4px;padding:4px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid var(--glassBorder);width:fit-content;margin-bottom:18px;flex-wrap:wrap;}
.seg-btn{padding:7px 14px;border-radius:9px;border:none;background:transparent;font-size:13px;font-weight:500;color:var(--muted);min-height:36px;}
.seg-btn.on{background:rgba(255,255,255,.1);color:var(--text);box-shadow:0 1px 4px rgba(0,0,0,.2);}

/* task/lead cards */
.item-card{display:flex;align-items:flex-start;gap:12px;padding:13px 16px;border-radius:14px;margin-bottom:9px;}
.item-card .check-btn{width:20px;height:20px;border-radius:50%;border:2px solid rgba(120,120,160,.4);background:transparent;flex-shrink:0;margin-top:1px;transition:border-color .15s;min-height:20px;}
.item-card .check-btn:hover{border-color:var(--blue);}
.emoji-ic{font-size:18px;line-height:1;flex-shrink:0;margin-top:1px;}
.item-title{font-size:13.5px;font-weight:600;line-height:1.3;}
.item-sub{font-size:12px;color:var(--muted);margin-top:3px;}
.stage-pill{font-size:11px;font-weight:600;padding:3px 10px;border-radius:8px;white-space:nowrap;}
.task-overdue{border-left:3px solid var(--red) !important;border-top-left-radius:11px !important;border-bottom-left-radius:11px !important;}
.task-due-soon{border-left:3px solid var(--amber) !important;border-top-left-radius:11px !important;border-bottom-left-radius:11px !important;}
.lead-avatar{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px;font-weight:700;}

/* lead detail drawer */
.lead-detail{display:none;padding:12px 14px 14px;border-top:1px solid var(--glassBorder);margin-top:2px;animation:cbFadeUp .2s ease;width:100%;}
.lead-detail.open{display:block;}
.lead-detail-row{display:flex;gap:8px;margin-bottom:7px;font-size:12px;}
.lead-detail-lbl{color:var(--faint);min-width:80px;font-family:'JetBrains Mono',monospace;font-size:10px;padding-top:1px;}
.lead-detail-val{color:var(--text);font-weight:500;}
.lead-action-strip{display:flex;gap:7px;margin-top:10px;flex-wrap:wrap;}
.lead-action-btn{padding:8px 12px;border-radius:9px;border:1px solid var(--glassBorder);background:rgba(255,255,255,.04);color:var(--muted);font-size:12px;font-weight:500;min-height:36px;}
.lead-action-btn:hover{background:rgba(255,255,255,.08);color:var(--text);}
.lead-action-btn.primary{background:var(--accentSoft);color:var(--accent);border-color:rgba(139,123,255,.3);}
.lead-timeline{position:relative;margin-top:12px;padding-left:16px;}
.lead-timeline::before{content:'';position:absolute;left:5px;top:4px;bottom:4px;width:1.5px;background:var(--glassBorder);}
.lead-tl-item{position:relative;padding-left:16px;margin-bottom:12px;}
.lead-tl-item::before{content:'';position:absolute;left:-10.5px;top:4px;width:9px;height:9px;border-radius:50%;background:var(--bg);border:2px solid var(--accent);}
.lead-tl-text{font-size:12px;line-height:1.4;}
.lead-tl-when{font-size:10px;color:var(--faint);margin-top:2px;font-family:'JetBrains Mono',monospace;}

/* agent / autonomy */
.agent-card{padding:16px 18px;border-radius:15px;margin-bottom:10px;}
.agent-name{font-size:14px;font-weight:700;}
.agent-role{font-size:12px;color:var(--muted);margin-top:2px;}
.auto-badge{font-size:10px;font-weight:700;padding:3px 9px;border-radius:6px;font-family:'JetBrains Mono',monospace;letter-spacing:.3px;}
.auto-auto{background:var(--greenSoft);color:var(--green);}
.auto-ask{background:var(--amberSoft);color:var(--amber);}
.auto-off{background:rgba(120,120,140,.12);color:var(--faint);}
.prog-wrap{flex:1;height:5px;border-radius:5px;background:rgba(255,255,255,.08);overflow:hidden;}
.prog-fill{height:100%;border-radius:5px;transition:width .4s ease;}
.hire-btn{display:flex;align-items:center;gap:10px;padding:13px 15px;border-radius:14px;border:1px dashed rgba(120,120,160,.3);color:var(--accent);font-size:12.5px;font-weight:600;background:transparent;width:100%;margin-top:6px;cursor:pointer;min-height:48px;}
.hire-btn:hover{background:var(--accentSoft);border-color:rgba(139,123,255,.4);}
.auto-card{padding:15px 17px;border-radius:15px;margin-bottom:10px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
.auto-info{flex:1;min-width:180px;}
.auto-label{font-size:14px;font-weight:600;}
.auto-desc{font-size:12px;color:var(--muted);margin-top:3px;}
.lvls{display:flex;gap:3px;padding:3px;border-radius:10px;background:rgba(0,0,0,.2);border:1px solid var(--glassBorder);}
.lvl{padding:6px 13px;border-radius:7px;border:none;background:transparent;font-size:12px;font-weight:600;color:var(--muted);min-height:36px;}
.lvl.on{background:rgba(255,255,255,.12);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.25);}
.approve-card{display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:14px;margin-bottom:9px;}
.approve-title{font-size:13px;font-weight:600;}
.approve-action{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--faint);margin-top:3px;}
.approve-btn{padding:8px 16px;border-radius:9px;border:none;font-size:12px;font-weight:600;min-height:36px;}
.approve-btn.ok{background:linear-gradient(135deg,var(--green),#3ee3b0);color:#fff;}
.approve-btn.no{background:rgba(240,85,107,.14);color:var(--red);}

/* leads */
.lead-stage-new{background:rgba(150,150,170,.12);color:var(--muted);}
.lead-stage-contacted{background:var(--blueSoft);color:var(--blue);}
.lead-stage-meeting{background:rgba(124,92,255,.15);color:#9b7bff;}
.lead-stage-proposal{background:var(--amberSoft);color:var(--amber);}
.lead-stage-won{background:var(--greenSoft);color:var(--green);}
.lead-stage-lost{background:rgba(100,100,120,.1);color:var(--faint);}

/* events */
.event-card{padding:12px 16px;border-radius:13px;margin-bottom:8px;display:flex;align-items:center;gap:12px;}
.event-type{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;color:var(--accent);}
.event-meta{font-size:11.5px;color:var(--muted);margin-top:2px;}
.event-icon{width:34px;height:34px;border-radius:10px;background:var(--surface2);border:1px solid var(--glassBorder);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;}
.date-sep{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--faint);letter-spacing:.5px;padding:8px 0 6px;display:flex;align-items:center;gap:10px;}
.date-sep::before,.date-sep::after{content:'';flex:1;height:1px;background:var(--glassBorder);}
.undo-btn{margin-left:auto;padding:6px 12px;border-radius:8px;border:1px solid var(--glassBorder);background:transparent;color:var(--muted);font-size:12px;font-weight:500;min-height:32px;}
.undo-btn:hover{background:rgba(255,255,255,.06);color:var(--text);}
.rev-badge{margin-left:auto;font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:7px;background:var(--blueSoft);color:var(--blue);}

/* command palette */
#cmd-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);z-index:300;display:none;align-items:flex-start;justify-content:center;padding-top:14vh;}
#cmd-overlay.open{display:flex;}
#cmd-box{width:100%;max-width:530px;border-radius:18px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.5);border:1px solid var(--glassBorder);}
#cmd-search{width:100%;padding:16px 18px;background:rgba(16,17,22,.98);border:none;font-size:15px;color:var(--text);border-bottom:1px solid var(--glassBorder);}
#cmd-results{max-height:360px;overflow-y:auto;background:rgba(12,13,18,.97);}
.cmd-group{padding:8px 18px 2px;font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--faint);letter-spacing:.6px;text-transform:uppercase;}
.cmd-item{display:flex;align-items:center;gap:12px;padding:10px 18px;cursor:pointer;font-size:13px;border-radius:0;min-height:44px;}
.cmd-item:hover,.cmd-item.sel{background:var(--accentSoft);}
.cmd-item-ic{width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid var(--glassBorder);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;}
.cmd-item-label{font-weight:500;flex:1;}
.cmd-item-hint{font-size:10px;color:var(--faint);font-family:'JetBrains Mono',monospace;padding:2px 6px;border-radius:5px;background:rgba(255,255,255,.06);border:1px solid var(--glassBorder);}

/* mobile bottom nav — 44px hit targets */
#botnav{display:none;position:fixed;left:0;right:0;bottom:0;background:var(--glassThin);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);border-top:1px solid var(--glassBorder);padding:4px 0 max(6px,env(safe-area-inset-bottom));z-index:30;}
#botnav button{flex:1;border:none;background:transparent;padding:0;min-height:48px;font-size:10px;font-weight:600;color:var(--muted);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;}
#botnav button.on{color:var(--accent);}
#botnav .bn-ic{font-size:18px;line-height:1;}

/* toast */
#toast{position:fixed;left:50%;bottom:92px;transform:translateX(-50%) translateY(20px);opacity:0;pointer-events:none;transition:all .25s ease;z-index:200;max-width:min(92vw,420px);}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto;}
#toast .toast-inner{display:flex;align-items:center;gap:10px;padding:11px 15px;border-radius:13px;background:rgba(26,26,46,.95);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.1);box-shadow:0 14px 40px rgba(0,0,0,.35);color:#fff;font-size:13px;}
#toast .toast-undo{background:var(--accentSoft);color:var(--accent);border:none;border-radius:8px;padding:5px 11px;font-size:12px;font-weight:600;cursor:pointer;margin-left:6px;}

/* buttons */
.btn-primary{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:11px;border:none;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:13px;font-weight:600;box-shadow:0 4px 14px var(--accentGlow);min-height:40px;}
.btn-ghost{display:inline-flex;align-items:center;gap:7px;padding:8px 13px;border-radius:10px;border:1px solid var(--glassBorder);background:rgba(255,255,255,.05);color:var(--muted);font-size:12.5px;font-weight:500;min-height:36px;}
.btn-ghost:hover{background:rgba(255,255,255,.08);color:var(--text);}

/* empty / spinner */
.empty{color:var(--faint);text-align:center;padding:40px 0;font-size:13px;}
.empty-dashed{padding:30px 18px;text-align:center;border-radius:14px;border:1px dashed rgba(255,255,255,.1);color:var(--faint);font-size:12.5px;margin-top:4px;}
.spin{width:20px;height:20px;border:2.5px solid rgba(255,255,255,.12);border-top-color:var(--accent);border-radius:50%;animation:cbSpin .8s linear infinite;margin:40px auto;display:block;}

/* sheets / modals on mobile */
.sheet-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(2px);z-index:90;display:none;}
.sheet-backdrop.open{display:block;}

@media (max-width:700px){
  #sidebar{display:none;}
  #topbar{display:flex;}
  #botnav{display:flex;}
  #qbar{left:0;bottom:60px;}
  #content{padding:16px 14px 150px;}
  #notif-panel{width:100%;}
  .loops-grid{grid-template-columns:1fr;}
  .kpi-grid{grid-template-columns:repeat(2,1fr);}
}
</style>
</head>
<body>
<div id="app">
  <div id="bg-blobs"><div id="mesh"></div><div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div></div>
  <div id="grain"></div>

  <div id="shell">
    <nav id="sidebar">
      <div class="logo-row">
        <div><div class="logo-text">company<span>brain</span></div><div class="logo-sub">v1 &middot; forget-nothing</div></div>
      </div>
      <div class="sidebar-search">
        <svg class="ss-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="sidebar-search-input" placeholder="Search…" autocomplete="off"/>
      </div>
      <div id="side-nav"></div>
      <div class="sidebar-bot">
        <div class="role-switcher">
          <div class="role-sw-label">View as</div>
          <div class="role-chips" id="role-chips">
            <button class="role-chip on" data-role="ceo">CEO</button>
            <button class="role-chip" data-role="mgr">Mgr</button>
            <button class="role-chip" data-role="emp">Emp</button>
            <button class="role-chip" data-role="client">Client</button>
          </div>
        </div>
        <div class="theme-picker" id="theme-picker">
          <button class="theme-btn" id="theme-toggle-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
            Wallpaper
          </button>
          <div class="theme-panel" id="theme-panel">
            <div class="theme-panel-lbl">Choose theme</div>
            <div class="theme-swatches" id="theme-swatches"></div>
          </div>
        </div>
        <div class="agent-status">
          <div class="agent-dot"></div>
          <div><div class="agent-label">Agent online</div><div class="agent-sublabel">watching all channels</div></div>
        </div>
      </div>
    </nav>

    <main id="main">
      <div id="topbar">
        <div class="logo-text">company<span style="color:var(--accent)">brain</span></div>
        <div id="notif-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span id="notif-count"></span>
        </div>
      </div>
      <div id="content"><div id="view"><div class="spin"></div></div></div>
    </main>
  </div>

  <form id="qbar" style="display:none">
    <input id="qfield" autocomplete="off"/>
    <span class="qhint">⌘K</span>
    <button type="submit">Add</button>
  </form>

  <div id="botnav"></div>

  <!-- command palette -->
  <div id="cmd-overlay">
    <div id="cmd-box">
      <input id="cmd-search" placeholder="Search or jump to…" autocomplete="off" spellcheck="false"/>
      <div id="cmd-results"></div>
    </div>
  </div>

  <!-- notifications panel -->
  <div id="notif-panel">
    <div class="notif-head">
      <div class="notif-title">Notifications</div>
      <button class="notif-close" id="notif-close">×</button>
    </div>
    <div id="notif-list"><div class="spin"></div></div>
  </div>

  <!-- toast -->
  <div id="toast"><div class="toast-inner"><span id="toast-msg"></span></div></div>
</div>
<script>
(function(){
  function showErr(e){
    var m=e&&e.message?e.message:String(e);
    document.getElementById('view').innerHTML='<div style="padding:24px;color:#ff6b6b;font-family:monospace;font-size:13px;white-space:pre-wrap">JS error: '+m+'</div>';
  }
  try {
  var tab='loops', side='yours', taskDay='today', leadView='all', activeRole='ceo', loopCount=0;
  var h0=new Date().getHours();
  var briefMode=h0<12?'am':h0<17?'pm':'eve';

  var TABS=[
    {id:'loops',  ic:'🔁', label:'Loops'},
    {id:'tasks',  ic:'✅',  label:'Tasks'},
    {id:'leads',  ic:'🤝', label:'Leads'},
    {id:'agents', ic:'🤖', label:'Agents'},
    {id:'auto',   ic:'⚙️', label:'Auto'},
    {id:'events', ic:'📜', label:'Activity'},
  ];

  var SVG={
    loops:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    tasks:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    leads:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    agents:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 7V4M8 13h.01M16 13h.01"/></svg>',
    auto:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.1 5A9 9 0 0 1 21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9"/></svg>',
    events:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22V8M5 12H2a10 10 0 0 0 20 0h-3M12 2v3"/></svg>',
  };

  var ACTIONS=[
    {k:'draftReplies', label:'Draft replies', desc:'Acknowledge inbound messages automatically'},
    {k:'chase',        label:'Chase loops',   desc:'Nudge when the ball is in their court'},
    {k:'sendReminders',label:'Send reminders',desc:'Remind on snoozed loops before they slip'},
    {k:'createTasks',  label:'Create tasks',  desc:'Turn asks in messages into tasks'},
    {k:'joinMeetings', label:'Join meetings', desc:'Attend and take notes autonomously'},
  ];

  var EVENT_ICONS={
    'loop.created':'🔄','loop.closed':'✅','loop.snoozed':'😴','loop.captured':'🔄','loop.reopened':'↩️',
    'task.created':'📝','task.completed':'✔️','task.moved':'➡️',
    'lead.created':'🤝','lead.advanced':'📈',
    'briefing.delivered':'🧠','agent.action':'🤖',
    'approval.approved':'✅','approval.dismissed':'🚫','event.undone':'↩️'
  };

  var THEMES=[
    {id:'default', label:'Default', b1:'rgba(139,123,255,.28)', b2:'rgba(91,141,239,.22)', b3:'rgba(232,161,58,.14)', m1:'rgba(22,207,152,.22)', m2:'rgba(91,141,239,.18)', m3:'rgba(124,79,208,.18)', swatch:'linear-gradient(135deg,#8b7bff,#3e7bfa)'},
    {id:'aurora',  label:'Aurora',  b1:'rgba(22,207,152,.3)',   b2:'rgba(62,123,250,.2)',  b3:'rgba(139,123,255,.18)',m1:'rgba(22,207,152,.25)', m2:'rgba(62,123,250,.2)',  m3:'rgba(55,192,138,.18)', swatch:'linear-gradient(135deg,#16cf98,#3e7bfa)'},
    {id:'blush',   label:'Blush',   b1:'rgba(240,85,107,.22)',  b2:'rgba(232,161,58,.18)', b3:'rgba(139,123,255,.14)',m1:'rgba(240,85,107,.2)',  m2:'rgba(232,161,58,.16)', m3:'rgba(167,123,255,.16)',swatch:'linear-gradient(135deg,#f0556b,#e8a13a)'},
    {id:'mist',    label:'Mist',    b1:'rgba(91,141,239,.26)',  b2:'rgba(22,183,174,.2)',  b3:'rgba(62,123,250,.14)', m1:'rgba(22,183,174,.22)', m2:'rgba(91,141,239,.18)', m3:'rgba(62,123,250,.16)', swatch:'linear-gradient(135deg,#3e7bfa,#16b7ae)'},
    {id:'sage',    label:'Sage',    b1:'rgba(55,192,138,.26)',  b2:'rgba(22,207,152,.2)',  b3:'rgba(91,141,239,.14)', m1:'rgba(55,192,138,.24)', m2:'rgba(22,207,152,.18)', m3:'rgba(91,141,239,.16)', swatch:'linear-gradient(135deg,#37c08a,#16cf98)'},
    {id:'sand',    label:'Sand',    b1:'rgba(232,161,58,.28)',  b2:'rgba(240,85,107,.16)', b3:'rgba(22,183,174,.14)', m1:'rgba(232,161,58,.24)', m2:'rgba(240,85,107,.16)', m3:'rgba(22,183,174,.16)', swatch:'linear-gradient(135deg,#e8a13a,#f0556b)'},
    {id:'frost',   label:'Frost',   b1:'rgba(167,139,255,.22)', b2:'rgba(62,123,250,.22)', b3:'rgba(22,183,174,.12)', m1:'rgba(167,139,255,.2)',  m2:'rgba(62,123,250,.18)', m3:'rgba(22,183,174,.16)', swatch:'linear-gradient(135deg,#a78bff,#5b93ff)'},
    {id:'dusk',    label:'Dusk',    b1:'rgba(124,79,208,.28)',  b2:'rgba(240,85,107,.18)', b3:'rgba(232,161,58,.12)', m1:'rgba(124,79,208,.24)', m2:'rgba(240,85,107,.16)', m3:'rgba(232,161,58,.14)', swatch:'linear-gradient(135deg,#7c4fd0,#f0556b)'},
  ];

  // Local user roster for accountability display in the single-user demo.
  var USERS={
    'user_local':{name:'You',initials:'YO',role:'ceo',color:'linear-gradient(140deg,var(--accent),var(--accent2))'},
    'user_ceo':{name:'James',initials:'JM',role:'ceo',color:'linear-gradient(140deg,#3e7bfa,#5b93ff)'},
    'user_mgr':{name:'Priya',initials:'PN',role:'mgr',color:'linear-gradient(140deg,#16b7ae,#54d8d0)'},
    'user_emp':{name:'Alex',initials:'AK',role:'emp',color:'linear-gradient(140deg,#e8932a,#f4b65e)'},
    'user_dev':{name:'Sam',initials:'SB',role:'emp',color:'linear-gradient(140deg,#f0556b,#f98598)'},
    'user_client':{name:'Dana',initials:'DC',role:'client',color:'linear-gradient(140deg,#7c4fd0,#9b6cf0)'}
  };

  var view=document.getElementById('view');
  var qbar=document.getElementById('qbar');
  var qfield=document.getElementById('qfield');
  var activeTheme=localStorage.getItem('cb-theme')||'default';

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
  function todayStr(){return new Date().toISOString().slice(0,10);}
  function dateLabel(ts){
    if(!ts) return '';
    var d=new Date(ts);
    return d.toLocaleDateString([],{month:'short',day:'numeric'});
  }
  function userFor(id){return USERS[id]||{name:(id||'').replace(/_/g,' ').replace(/^user /,''),initials:(id||'??').slice(-2).toUpperCase(),color:'linear-gradient(140deg,#6b6b78,#9a9aa8)'};}
  function avatarHtml(id,opts){
    opts=opts||{};
    var u=userFor(id);
    var sz=opts.size||22;
    var style='width:'+sz+'px;height:'+sz+'px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:'+Math.max(8,sz*0.4)+'px;font-weight:700;color:#fff;background:'+u.color+';border:2px solid var(--glass);box-shadow:0 1px 3px rgba(31,38,135,.2);flex-shrink:0;';
    return '<div class="acct-avatar" title="'+esc(u.name)+'" style="'+style+'">'+esc(u.initials)+'</div>';
  }
  function avatarStackHtml(ids,opts){
    opts=opts||{};
    var list=(ids||[]).slice(0,4);
    if(!list.length) return '';
    var html='<div class="acct-stack">';
    list.forEach(function(id){html+=avatarHtml(id,{size:opts.size||22});});
    html+='</div>';
    return html;
  }
  function progBar(done,total){
    var pct=total>0?Math.round(done/total*100):0;
    var col=pct>=80?'var(--green)':pct>=40?'var(--amber)':'var(--faint)';
    return '<div style="display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid var(--glassBorder);">'
      +'<span style="font-size:11px;color:var(--green);font-weight:600;white-space:nowrap;">'+done+' done</span>'
      +'<div class="prog-wrap"><div class="prog-fill" style="width:'+pct+'%;background:'+col+';"></div></div>'
      +'<span style="font-size:11px;color:var(--muted);white-space:nowrap;">'+Math.max(0,total-done)+' left</span>'
      +'<span style="font-family:\'JetBrains Mono\',monospace;font-size:11px;font-weight:600;color:var(--accent);width:32px;text-align:right;">'+pct+'%</span>'
      +'</div>';
  }
  function toast(msg,onUndo){
    var t=document.getElementById('toast');
    var inner=t.querySelector('.toast-inner');
    inner.innerHTML='<span id="toast-msg">'+esc(msg)+'</span>'+(onUndo?'<button class="toast-undo">Undo</button>':'');
    t.classList.add('show');
    if(onUndo) inner.querySelector('.toast-undo').onclick=function(){onUndo();t.classList.remove('show');};
    setTimeout(function(){t.classList.remove('show');},3200);
  }

  // ── theme ─────────────────────────────────────────────────────────────────
  function applyTheme(id){
    var t=THEMES.filter(function(x){return x.id===id;})[0]||THEMES[0];
    var r=document.documentElement.style;
    r.setProperty('--b1c',t.b1); r.setProperty('--b2c',t.b2); r.setProperty('--b3c',t.b3);
    r.setProperty('--m1c',t.m1); r.setProperty('--m2c',t.m2); r.setProperty('--m3c',t.m3);
    activeTheme=id; localStorage.setItem('cb-theme',id);
    document.querySelectorAll('.theme-swatch').forEach(function(s){s.classList.toggle('on',s.dataset.tid===id);});
  }
  function buildThemePicker(){
    var sw=document.getElementById('theme-swatches');
    if(!sw) return;
    sw.innerHTML=THEMES.map(function(t){
      return '<div class="theme-swatch'+(t.id===activeTheme?' on':'')+'" data-tid="'+t.id+'" title="'+t.label+'" style="background:'+t.swatch+'"></div>';
    }).join('');
    sw.querySelectorAll('.theme-swatch').forEach(function(s){s.onclick=function(){applyTheme(s.dataset.tid);};});
  }
  var themeBtn=document.getElementById('theme-toggle-btn');
  var themePanel=document.getElementById('theme-panel');
  if(themeBtn) themeBtn.onclick=function(e){e.stopPropagation();themePanel.classList.toggle('open');buildThemePicker();};
  document.addEventListener('click',function(e){if(themePanel&&!themePanel.contains(e.target)&&e.target!==themeBtn) themePanel.classList.remove('open');});
  applyTheme(activeTheme);

  // ── nav ───────────────────────────────────────────────────────────────────
  function buildNav(){
    var sn=document.getElementById('side-nav');
    sn.innerHTML=TABS.map(function(t){
      var badge=(t.id==='loops'&&loopCount>0)?'<span class="nav-badge">'+loopCount+'</span>':'';
      return '<div class="nav-item'+(t.id===tab?' active':'')+'" data-tab="'+t.id+'">'
        +'<span class="ni">'+SVG[t.id]+'</span>'+t.label+badge+'</div>';
    }).join('');
    sn.querySelectorAll('.nav-item').forEach(function(el){
      el.onclick=function(){tab=el.dataset.tab;buildNav();buildBotNav();render();};
    });
    var bn=document.getElementById('botnav');
    bn.innerHTML=TABS.map(function(t){
      return '<button data-tab="'+t.id+'" class="'+(t.id===tab?'on':'')+'"><span class="bn-ic">'+t.ic+'</span>'+t.label+'</button>';
    }).join('');
    bn.querySelectorAll('button').forEach(function(b){b.onclick=function(){tab=b.dataset.tab;buildNav();buildBotNav();render();};});
    var rc=document.getElementById('role-chips');
    if(rc) rc.querySelectorAll('.role-chip').forEach(function(c){
      c.classList.toggle('on',c.dataset.role===activeRole);
      c.onclick=function(){activeRole=c.dataset.role;buildNav();if(tab==='loops') loadLoops();};
    });
  }
  function buildBotNav(){
    document.querySelectorAll('#botnav button').forEach(function(b){b.classList.toggle('on',b.dataset.tab===tab);});
    document.querySelectorAll('#side-nav .nav-item').forEach(function(el){el.classList.toggle('active',el.dataset.tab===tab);});
  }

  // ── segment bar ───────────────────────────────────────────────────────────
  function segBar(opts,cur,onPick){
    var el=document.createElement('div'); el.className='seg-bar';
    el.innerHTML=opts.map(function(o){return '<button class="seg-btn'+(o.v===cur?' on':'')+'" data-v="'+o.v+'">'+o.label+'</button>';}).join('');
    el.querySelectorAll('.seg-btn').forEach(function(b){b.onclick=function(){onPick(b.dataset.v);};});
    return el;
  }

  // ── render ────────────────────────────────────────────────────────────────
  function render(){
    var showBar=tab==='loops'||tab==='tasks'||tab==='leads';
    qbar.style.display=showBar?'flex':'none';
    qfield.placeholder=tab==='loops'?'Capture a loop…':tab==='tasks'?'Add a task for today…':'Add lead (name or paste a note)…';
    view.innerHTML='<div class="spin"></div>';
    if(tab==='loops')       loadLoops();
    else if(tab==='tasks')  loadTasks();
    else if(tab==='leads')  loadLeads();
    else if(tab==='agents') loadAgents();
    else if(tab==='auto')   loadAuto();
    else                    loadEvents();
  }

  // ── role panel ────────────────────────────────────────────────────────────
  function rolePanelHtml(yours, theirs){
    if(activeRole==='mgr') return '<div class="role-panel gc" style="border-left-color:var(--blue);">'
      +'<div class="role-sw-label" style="color:var(--blue);">MANAGER VIEW</div>'
      +'<div class="role-panel-title">Team summary</div>'
      +'<div class="role-panel-sub">You have '+yours.length+' loops in your court. '
      +(theirs.length?' '+theirs.length+' are waiting on your team.':' Your team has no open waiting loops.')+'</div>'
      +'<div class="role-stats">'
      +'<div><div class="role-stat-val" style="color:var(--blue)">'+yours.length+'</div><div class="role-stat-lbl">your actions</div></div>'
      +'<div><div class="role-stat-val" style="color:var(--teal)">'+theirs.length+'</div><div class="role-stat-lbl">team actions</div></div>'
      +'<div><div class="role-stat-val" style="color:var(--amber)">'+['user_emp','user_dev'].length+'</div><div class="role-stat-lbl">direct reports</div></div>'
      +'</div></div>';
    if(activeRole==='emp') return '<div class="role-panel gc" style="border-left-color:var(--green);">'
      +'<div class="role-sw-label" style="color:var(--green);">EMPLOYEE VIEW — MY WORK</div>'
      +'<div class="role-panel-title">Your court</div>'
      +'<div class="role-panel-sub">'+yours.length+' loops need your attention. Focus on the oldest ones first.</div>'
      +'<div class="role-stats">'
      +'<div><div class="role-stat-val" style="color:var(--green)">'+yours.length+'</div><div class="role-stat-lbl">open loops</div></div>'
      +'<div><div class="role-stat-val" style="color:var(--amber)">'+theirs.length+'</div><div class="role-stat-lbl">waiting on others</div></div>'
      +'<div><div class="role-stat-val" style="color:var(--faint)">—</div><div class="role-stat-lbl">time tracked</div></div>'
      +'</div></div>';
    if(activeRole==='client') return '<div class="role-panel gc" style="border-left-color:var(--teal);">'
      +'<div class="role-sw-label" style="color:var(--teal);">CLIENT PORTAL — READ-ONLY</div>'
      +'<div class="role-panel-title">Your project</div>'
      +'<div class="role-panel-sub">'+theirs.length+' items in progress. We\'ll notify you when something needs your input.</div>'
      +'<div class="role-stats">'
      +'<div><div class="role-stat-val" style="color:var(--teal)">'+theirs.length+'</div><div class="role-stat-lbl">in progress</div></div>'
      +'<div><div class="role-stat-val" style="color:var(--green)">0</div><div class="role-stat-lbl">delivered</div></div>'
      +'</div></div>';
    return '';
  }

  // ── loops ─────────────────────────────────────────────────────────────────
  function loadLoops(){
    api('/api/loops').then(function(all){
      all=all||[];
      var yours=all.filter(function(l){return l.side==='yours';});
      var theirs=all.filter(function(l){return l.side==='theirs';});
      var escalating=all.filter(function(l){return (Date.now()-(l.updatedAt||l.createdAt||Date.now()))/86400e3>=3;}).length;
      loopCount=all.length; buildNav();

      var summary=all.length?all.length+' open loop'+(all.length!==1?'s':'')+' · '+escalating+' escalating':'Clean board. Nothing open right now.';
      var greetings={am:'Good morning.',pm:'Good afternoon.',eve:'Good evening.'};
      var modeIcons={am:'☀️',pm:'🌤️',eve:'🌆'};
      var kpiHtml=activeRole==='ceo'
        ?'<div class="kpi-grid">'
          +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--amber)">'+yours.length+'</div><div class="kpi-lbl">to action</div></div>'
          +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--teal)">'+theirs.length+'</div><div class="kpi-lbl">waiting on others</div></div>'
          +'<div class="kpi-card gc"><div class="kpi-val" style="color:'+(escalating?'var(--red)':'var(--green)')+'">'+escalating+'</div><div class="kpi-lbl">escalating</div></div>'
          +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--accent)">'+all.length+'</div><div class="kpi-lbl">total open</div></div>'
          +'</div>':rolePanelHtml(yours,theirs);

      var html='<div class="sec-head"><div><div class="sec-title">Open Loops</div>'
        +'<div class="sec-sub">Who owes the next move across every channel.</div></div>'
        +'<div class="head-actions"><button class="btn-ghost" id="sweep-btn">↻ Sweep now</button></div></div>'
        +kpiHtml
        +'<div class="brief-card gc">'
        +'<div class="brief-header"><div class="brief-brain">🧠</div>'
        +'<div><div class="brief-label">BRAIN · BRIEFING</div>'
        +'<div class="brief-title">'+modeIcons[briefMode]+' '+greetings[briefMode]+' '+summary+'</div></div>'
        +'<div class="brief-sw">'
        +'<button class="brief-sw-btn'+(briefMode==='am'?' on':'')+'" data-bm="am">AM</button>'
        +'<button class="brief-sw-btn'+(briefMode==='pm'?' on':'')+'" data-bm="pm">PM</button>'
        +'<button class="brief-sw-btn'+(briefMode==='eve'?' on':'')+'" data-bm="eve">EVE</button>'
        +'</div></div>'
        +'<div class="brief-stats">'
        +'<div class="brief-stat"><div class="brief-stat-val" style="color:var(--amber)">'+yours.length+'</div><div class="brief-stat-lbl">your court</div></div>'
        +'<div class="brief-stat"><div class="brief-stat-val" style="color:var(--teal)">'+theirs.length+'</div><div class="brief-stat-lbl">their court</div></div>'
        +'<div class="brief-stat" style="'+(escalating?'border-color:rgba(240,85,107,.25)':'')+'"><div class="brief-stat-val" style="color:'+(escalating?'var(--red)':'var(--green)')+'">'+escalating+'</div><div class="brief-stat-lbl">escalating</div></div>'
        +'</div></div>'
        +'<div class="loops-grid">'+loopCol('YOUR COURT','waiting on you','#e8a13a',yours)+loopCol('THEIR COURT','waiting on others','#2bc4bf',theirs)+'</div>';
      view.innerHTML=html;

      view.querySelectorAll('[data-bm]').forEach(function(b){b.onclick=function(){briefMode=b.dataset.bm;loadLoops();};});
      view.querySelectorAll('[data-close]').forEach(function(b){b.onclick=function(){post('/api/loops/'+b.dataset.close+'/close').then(function(){toast('Loop closed',function(){/* undo placeholder */});loadLoops();});};});
      view.querySelectorAll('[data-snooze]').forEach(function(b){b.onclick=function(){post('/api/loops/'+b.dataset.snooze+'/snooze',{hours:24}).then(function(){toast('Snoozed 24h');loadLoops();});};});
      view.querySelectorAll('[data-assign-loop]').forEach(function(b){b.onclick=function(){var uid=prompt('Assign to user ID (e.g. user_local, user_emp):','user_local');if(uid)post('/api/loops/'+b.dataset.assignLoop+'/assign',{userIds:[uid]}).then(function(){toast('Assigned');loadLoops();});};});
      var sw=document.getElementById('sweep-btn');
      if(sw) sw.onclick=function(){sw.disabled=true;toast('Sweeping channels…');loadLoops();};
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load loops: '+(e&&e.message||e)+'</div>';});
  }
  function loopCol(label,hint,dotColor,items){
    var cards=items.length?items.map(function(l){
      var ageStr=ago(l.updatedAt||l.createdAt||Date.now());
      var cls=ageCls(l.updatedAt||l.createdAt||Date.now());
      var isTheirs=l.side==='theirs';
      var chan=(l.channel||'manual').toUpperCase().replace(/-/g,' ');
      var creator=l.createdBy?('captured by '+esc(userFor(l.createdBy).name)+' · '+ago(l.createdAt)):(l.createdAt?'captured '+ago(l.createdAt):'');
      var assignees=l.assignedTo&&l.assignedTo.length?l.assignedTo:[l.createdBy];
      return '<div class="loop-card gc">'
        +'<button class="check-btn" data-close="'+l.id+'" title="Mark done"></button>'
        +'<div class="loop-info">'
        +'<div class="loop-title-row"><div class="loop-title">'+esc(l.title)+'</div><span class="age-pill '+cls+'">'+ageStr+'</span></div>'
        +'<div class="loop-meta"><span class="loop-chan">'+chan+'</span>'+(l.why?' · '+esc(l.why):'')+'</div>'
        +'<div class="acct-row">'
        +avatarStackHtml(assignees,{size:22})
        +'<span class="acct-txt">'+(l.assignedTo&&l.assignedTo.length?'assigned':'owner')+'</span>'
        +'<button class="acct-btn" data-assign-loop="'+l.id+'">Assign</button>'
        +'</div>'
        +(creator?'<div class="loop-creator">'+creator+'</div>':'')
        +'<div class="loop-actions">'
        +(isTheirs?'<button class="link-btn teal" data-snooze="'+l.id+'">Nudge them</button>':'<button class="link-btn" data-snooze="'+l.id+'">Snooze</button>')
        +'<button class="link-btn" data-close="'+l.id+'" style="color:var(--faint)">Not a task</button>'
        +'</div></div></div>';
    }).join(''):('<div class="empty-dashed">'+(label==='YOUR COURT'?'Nothing in your court. Clean board.':'No one\'s keeping you waiting.')+'</div>');
    return '<div><div class="col-head"><span class="col-dot" style="background:'+dotColor+'"></span><span class="col-label">'+label+'</span><span class="col-count">'+items.length+'</span></div><span class="col-hint">'+hint+'</span>'+cards+'</div>';
  }

  // ── tasks ─────────────────────────────────────────────────────────────────
  function loadTasks(){
    api('/api/tasks').then(function(tasks){
      tasks=tasks||[];
      var today=todayStr();
      var tmr=new Date(); tmr.setDate(tmr.getDate()+1); var tmrStr=tmr.toISOString().slice(0,10);
      function isOverdue(t){return t.day&&t.day<today;}
      function isDueSoon(t){return t.dueAt && t.dueAt > Date.now() && t.dueAt < Date.now()+86400e3;}
      var overdueAll=tasks.filter(isOverdue);
      var filtered=taskDay==='overdue'?overdueAll
        :taskDay==='today'?tasks.filter(function(t){return t.day===today||(!t.day&&taskDay==='today');})
        :taskDay==='tomorrow'?tasks.filter(function(t){return t.day===tmrStr;})
        :tasks.filter(function(t){return t.day&&t.day>tmrStr;});

      var segs=[{v:'today',label:'Today'},{v:'tomorrow',label:'Tomorrow'},{v:'upcoming',label:'Upcoming'}];
      if(overdueAll.length) segs.push({v:'overdue',label:'⚠ Overdue ('+overdueAll.length+')'});

      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Tasks</div>'
        +'<div class="sec-sub">Your tasks — capture anything, complete what matters.</div></div>'
        +(overdueAll.length?'<div class="head-actions"><span class="age-pill age-old" style="padding:5px 10px;">'+overdueAll.length+' overdue</span></div>':'')
        +'</div>';
      view.appendChild(segBar(segs,taskDay,function(v){taskDay=v;loadTasks();}));
      var cardWrap=document.createElement('div');
      cardWrap.innerHTML=filtered.length?filtered.map(function(t){
        var pr=t.priority==='high'?'<span class="auto-badge auto-ask" style="margin-left:auto">HIGH</span>'
                :t.priority==='med'?'<span class="auto-badge" style="margin-left:auto;background:var(--blueSoft);color:var(--blue)">MED</span>':'';
        var od=isOverdue(t);
        var ds=!od && isDueSoon(t);
        var dueTxt=t.dueAt?'<span style="margin-left:8px;font-size:10px;font-weight:600;color:'+(od?'var(--red)':ds?'var(--amber)':'var(--faint)')+'">'+(od?'OVERDUE':dateLabel(t.dueAt))+'</span>':'';
        var assignees=t.assignees&&t.assignees.length?t.assignees:[t.createdBy];
        var moveBtns='<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">'
          +(t.day!=='today'?'<button class="lead-action-btn" data-move="'+t.id+'" data-day="today">Move today</button>':'')
          +(t.day!=='tomorrow'?'<button class="lead-action-btn" data-move="'+t.id+'" data-day="tomorrow">Move tomorrow</button>':'')
          +'<button class="acct-btn" data-assign-task="'+t.id+'" style="margin-left:auto">Assign</button>'
          +'</div>';
        return '<div class="item-card gc'+(od?' task-overdue':ds?' task-due-soon':'')+'">'
          +'<button class="check-btn" data-done="'+t.id+'" title="Complete"></button>'
          +'<div class="emoji-ic">'+esc(t.emoji||'📝')+'</div>'
          +'<div class="loop-info" style="flex:1;min-width:0;"><div class="item-title">'+esc(t.title)+'</div>'
          +'<div class="item-sub">'+esc(t.list||'Inbox')+dueTxt+'</div>'
          +'<div class="acct-row" style="margin-top:8px;">'+avatarStackHtml(assignees,{size:20})+'<span class="acct-txt">assigned</span></div>'
          +moveBtns
          +'</div>'
          +pr+'</div>';
      }).join(''):'<div class="empty-dashed">No tasks for '+taskDay+'.</div>';
      view.appendChild(cardWrap);
      view.querySelectorAll('[data-done]').forEach(function(b){b.onclick=function(){post('/api/tasks/'+b.dataset.done+'/complete').then(function(){toast('Task completed');loadTasks();});};});
      view.querySelectorAll('[data-move]').forEach(function(b){b.onclick=function(){post('/api/tasks/'+b.dataset.move+'/move',{day:b.dataset.day}).then(function(){toast('Task moved');loadTasks();});};});
      view.querySelectorAll('[data-assign-task]').forEach(function(b){b.onclick=function(){var uid=prompt('Assign to user ID (e.g. user_local, user_emp):','user_local');if(uid)post('/api/tasks/'+b.dataset.assignTask+'/assign',{userIds:[uid]}).then(function(){toast('Assigned');loadTasks();});};});
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
      view.appendChild(segBar([{v:'all',label:'All'},{v:'open',label:'Open'},{v:'won',label:'Won ✓'}],leadView,function(v){leadView=v;loadLeads();}));
      var cardWrap=document.createElement('div');
      cardWrap.innerHTML=leads.length?leads.map(function(l,i){
        var sub=[l.company,l.title].filter(Boolean).map(esc).join(' · ');
        var canAdv=l.stage!=='won'&&l.stage!=='lost';
        var initials=(l.name||'?').trim().split(/\s+/).slice(0,2).map(function(w){return w.charAt(0).toUpperCase();}).join('');
        var hue=((l.name||'A').charCodeAt(0)*37+(l.name||'A').charCodeAt((l.name||'A').length-1)*13)%360;
        var assignees=l.assignedTo&&l.assignedTo.length?l.assignedTo:[l.createdBy];
        return '<div class="item-card gc" style="align-items:center;flex-wrap:wrap;cursor:pointer;" data-lead-idx="'+i+'">'
          +'<div class="lead-avatar" style="background:hsl('+hue+',35%,22%);color:hsl('+hue+',55%,68%)">'+initials+'</div>'
          +'<div class="loop-info"><div class="item-title">'+esc(l.name)+'</div>'
          +(sub?'<div class="item-sub">'+sub+'</div>':'')
          +'<div class="acct-row" style="margin-top:7px;">'+avatarStackHtml(assignees,{size:20})+'<span class="acct-txt">owner · '+ago(l.createdAt)+'</span></div>'
          +'</div>'
          +'<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">'
          +'<span class="stage-pill '+stageCls(l.stage)+'">'+esc(l.stage)+'</span>'
          +(canAdv?'<button class="btn-ghost" data-advance="'+l.id+'" style="padding:6px 11px;font-size:12px;">Advance →</button>':'')
          +'</div>'
          +'<div class="lead-detail" id="lead-detail-'+i+'" style="width:100%;">'
          +(l.what?'<div class="lead-detail-row"><span class="lead-detail-lbl">WHAT</span><span class="lead-detail-val">'+esc(l.what)+'</span></div>':'')
          +(l.company?'<div class="lead-detail-row"><span class="lead-detail-lbl">COMPANY</span><span class="lead-detail-val">'+esc(l.company)+'</span></div>':'')
          +(l.title?'<div class="lead-detail-row"><span class="lead-detail-lbl">ROLE</span><span class="lead-detail-val">'+esc(l.title)+'</span></div>':'')
          +(l.phone?'<div class="lead-detail-row"><span class="lead-detail-lbl">PHONE</span><span class="lead-detail-val">'+esc(l.phone)+'</span></div>':'')
          +(l.email?'<div class="lead-detail-row"><span class="lead-detail-lbl">EMAIL</span><span class="lead-detail-val">'+esc(l.email)+'</span></div>':'')
          +'<div class="lead-detail-row"><span class="lead-detail-lbl">STAGE</span><span class="lead-detail-val"><span class="stage-pill '+stageCls(l.stage)+'">'+esc(l.stage)+'</span></span></div>'
          +'<div class="lead-detail-row"><span class="lead-detail-lbl">OWNER</span><span class="lead-detail-val">'+avatarStackHtml(assignees,{size:20})+'<span style="margin-left:6px">'+esc(userFor(assignees[0]).name)+'</span></span></div>'
          +'<div class="lead-detail-row"><span class="lead-detail-lbl">CREATED</span><span class="lead-detail-val">'+new Date(l.createdAt).toLocaleString()+'</span></div>'
          +'<div class="lead-action-strip">'
          +(canAdv?'<button class="lead-action-btn primary" data-advance="'+l.id+'">Advance stage →</button>':'')
          +(l.email?'<a class="lead-action-btn" href="mailto:'+esc(l.email)+'">✉ Email</a>':'')
          +(l.phone?'<a class="lead-action-btn" href="https://wa.me/'+esc(l.phone.replace(/[^0-9]/g,''))+'" target="_blank">📱 WhatsApp</a>':'')
          +'<button class="lead-action-btn" data-meet="'+l.id+'">📹 Meet</button>'
          +'<button class="lead-action-btn" data-assign-lead="'+l.id+'">Assign</button>'
          +'</div>'
          +'<div class="lead-timeline" id="lead-tl-'+l.id+'"><div class="spin" style="width:16px;height:16px;margin:10px 0;"></div></div>'
          +'</div>'
          +'</div>';
      }).join(''):'<div class="empty-dashed">No leads yet. Add one below.</div>';
      view.appendChild(cardWrap);
      cardWrap.querySelectorAll('[data-lead-idx]').forEach(function(card){
        card.onclick=function(e){
          if(e.target.closest('button')||e.target.closest('a')) return;
          var det=document.getElementById('lead-detail-'+card.dataset.leadIdx);
          if(!det) return;
          det.classList.toggle('open');
          if(det.classList.contains('open')){
            var lead=leads[parseInt(card.dataset.leadIdx)];
            loadLeadTimeline(lead.id,'lead-tl-'+lead.id);
          }
        };
      });
      view.querySelectorAll('[data-advance]').forEach(function(b){b.onclick=function(e){e.stopPropagation();post('/api/leads/'+b.dataset.advance+'/advance').then(function(){toast('Lead advanced');loadLeads();});};});
      view.querySelectorAll('[data-meet]').forEach(function(b){b.onclick=function(e){e.stopPropagation();var meet='meet.google.com/'+Math.random().toString(36).slice(2,11);toast('Meet link: '+meet);};});
      view.querySelectorAll('[data-assign-lead]').forEach(function(b){b.onclick=function(e){e.stopPropagation();var uid=prompt('Assign lead to user ID:','user_local');if(uid)post('/api/leads/'+b.dataset.assignLead+'/assign',{userIds:[uid]}).then(function(){toast('Lead assigned');loadLeads();});};});
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load leads: '+(e&&e.message||e)+'</div>';});
  }
  function loadLeadTimeline(leadId,containerId){
    var c=document.getElementById(containerId);
    if(!c) return;
    api('/api/events?entityId='+encodeURIComponent(leadId)).then(function(events){
      events=events||[];
      if(!events.length){c.innerHTML='<div class="lead-tl-item"><div class="lead-tl-text" style="color:var(--faint)">No activity yet.</div></div>';return;}
      c.innerHTML=events.map(function(e){
        var ic=EVENT_ICONS[e.type]||'📝';
        return '<div class="lead-tl-item">'
          +'<div class="lead-tl-text">'+ic+' '+esc(e.type)+' by '+esc(userFor(e.actorId).name)+'</div>'
          +'<div class="lead-tl-when">'+new Date(e.at).toLocaleString()+'</div>'
          +'</div>';
      }).join('');
    }).catch(function(){c.innerHTML='<div class="lead-tl-item"><div class="lead-tl-text" style="color:var(--faint)">Could not load timeline.</div></div>';});
  }

  // ── agents ────────────────────────────────────────────────────────────────
  function loadAgents(){
    api('/api/agents').then(function(agents){
      agents=agents||[];
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">AI Agents</div>'
        +'<div class="sec-sub">Your autonomous workforce — scoped, logged, fully reversible.</div></div></div>';
      var wrap=document.createElement('div');
      var cards=agents.length?agents.map(function(a){
        var done=a.done||0,pending=a.pending||0,total=done+pending;
        return '<div class="agent-card gc">'
          +'<div style="display:flex;align-items:center;gap:13px;">'
          +'<div style="width:42px;height:42px;flex-shrink:0;border-radius:13px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 6px 16px var(--accentGlow);">'+esc(a.emoji||'🤖')+'</div>'
          +'<div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;gap:8px;"><span class="agent-name">'+esc(a.name)+'</span>'+autoBadge(a.autonomy)+'</div>'
          +'<div class="agent-role">'+esc(a.role)+'</div></div>'
          +'<span style="display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;color:var(--green);flex-shrink:0;">'
          +'<span style="width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 0 3px rgba(55,192,138,.18);"></span>online</span>'
          +'</div>'+progBar(done,total)+'</div>';
      }).join(''):'<div class="empty-dashed">No agents configured yet.</div>';
      cards+='<button class="hire-btn"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>Hire a new agent — connect a skill or MCP tool</button>';
      wrap.innerHTML=cards;
      view.appendChild(wrap);
      wrap.querySelector('.hire-btn').onclick=function(){toast('Agent hiring coming soon — configure in Settings.');};
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
        apWrap.innerHTML='<div style="font-family:\'JetBrains Mono\',monospace;font-size:10px;color:var(--faint);letter-spacing:.5px;margin:0 0 10px;">PENDING APPROVALS</div>'
          +approvals.map(function(ap){
            return '<div class="approve-card gc"><div style="flex:1;min-width:0;"><div class="approve-title">'+esc(ap.title)+'</div>'
              +'<div class="approve-action">'+esc(ap.action)+'</div></div>'
              +'<button class="approve-btn ok" data-approve="'+ap.id+'">Approve</button>'
              +'<button class="approve-btn no" data-dismiss="'+ap.id+'" style="margin-left:6px">Dismiss</button></div>';
          }).join('');
        apWrap.querySelectorAll('[data-approve]').forEach(function(b){b.onclick=function(){post('/api/approvals/'+b.dataset.approve+'/approve').then(function(){toast('Approved');loadAuto();});};});
        apWrap.querySelectorAll('[data-dismiss]').forEach(function(b){b.onclick=function(){post('/api/approvals/'+b.dataset.dismiss+'/dismiss').then(function(){toast('Dismissed');loadAuto();});};});
        view.appendChild(apWrap);
      }
      var autoWrap=document.createElement('div');
      autoWrap.innerHTML='<div style="font-family:\'JetBrains Mono\',monospace;font-size:10px;color:var(--faint);letter-spacing:.5px;margin:18px 0 10px;">AUTONOMY SETTINGS</div>'
        +ACTIONS.map(function(a){
          var cur=settings[a.k]||'off';
          var lvls=['off','ask','auto'].map(function(lv){
            return '<button class="lvl'+(lv===cur?' on':'')+'" data-act="'+a.k+'" data-lvl="'+lv+'">'+(lv.charAt(0).toUpperCase()+lv.slice(1))+'</button>';
          }).join('');
          return '<div class="auto-card gc"><div class="auto-info"><div class="auto-label">'+a.label+'</div><div class="auto-desc">'+a.desc+'</div></div><div class="lvls">'+lvls+'</div></div>';
        }).join('');
      autoWrap.querySelectorAll('.lvl').forEach(function(b){b.onclick=function(){post('/api/autonomy',{action:b.dataset.act,level:b.dataset.lvl},'PUT').then(function(){toast('Autonomy updated');loadAuto();});};});
      view.appendChild(autoWrap);
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load autonomy: '+(e&&e.message||e)+'</div>';});
  }

  // ── events ────────────────────────────────────────────────────────────────
  function loadEvents(){
    api('/api/events').then(function(events){
      events=events||[];
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Activity</div>'
        +'<div class="sec-sub">Everything the agent touched — logged and reversible.</div></div></div>';
      var wrap=document.createElement('div');
      if(!events.length){
        wrap.innerHTML='<div class="empty-dashed">No activity yet. Start capturing loops.</div>';
      } else {
        var lastDate='',rows='';
        events.forEach(function(e){
          var d=new Date(e.at);
          var dk=d.toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'});
          if(dk!==lastDate){rows+='<div class="date-sep">'+dk+'</div>';lastDate=dk;}
          var canUndo=e.reversible&&e.undo;
          var ic=EVENT_ICONS[e.type]||'📝';
          var ts=d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
          rows+='<div class="event-card gc"><div class="event-icon">'+ic+'</div>'
            +'<div style="flex:1;min-width:0;"><div class="event-type">'+esc(e.type)+'</div>'
            +'<div class="event-meta">'+esc(userFor(e.actorId).name)+(e.channel?' · '+esc(e.channel):'')+'</div>'
            +'<div class="event-meta" style="margin-top:1px;font-family:\'JetBrains Mono\',monospace;font-size:10px;">'+ts+'</div></div>'
            +(canUndo?'<button class="undo-btn" data-undo="'+e.id+'">Undo</button>':e.reversible?'<span class="rev-badge">reversible</span>':'')
            +'</div>';
        });
        wrap.innerHTML=rows;
      }
      view.appendChild(wrap);
      view.querySelectorAll('[data-undo]').forEach(function(b){b.onclick=function(){post('/api/events/'+b.dataset.undo+'/undo').then(function(){toast('Undone');loadEvents();});};});
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load events: '+(e&&e.message||e)+'</div>';});
  }

  // ── notifications panel ───────────────────────────────────────────────────
  var notifPanel=document.getElementById('notif-panel');
  var notifBtn=document.getElementById('notif-btn');
  var notifCount=document.getElementById('notif-count');
  function loadNotifications(){
    api('/api/events').then(function(events){
      events=events||[];
      var recent=events.slice(0,20);
      var unread=events.filter(function(e){return Date.now()-e.at<86400e3;}).length;
      if(unread>0){notifCount.textContent=unread>9?'9+':unread;notifCount.style.display='flex';}
      else{notifCount.style.display='none';}
      var nl=document.getElementById('notif-list');
      if(!nl) return;
      nl.innerHTML=recent.length?recent.map(function(e){
        var ic=EVENT_ICONS[e.type]||'📝';
        var ts=new Date(e.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--glassBorder);">'
          +'<div class="event-icon" style="flex-shrink:0;">'+ic+'</div>'
          +'<div style="flex:1;min-width:0;"><div class="event-type" style="font-size:11px;">'+esc(e.type)+'</div>'
          +'<div class="event-meta">'+esc(userFor(e.actorId).name)+' · '+ts+'</div></div></div>';
      }).join(''):'<div class="empty-dashed">No recent activity.</div>';
    });
  }
  if(notifBtn) notifBtn.onclick=function(){notifPanel.classList.toggle('open');if(notifPanel.classList.contains('open')) loadNotifications();};
  var notifClose=document.getElementById('notif-close');
  if(notifClose) notifClose.onclick=function(){notifPanel.classList.remove('open');};

  // ── command palette ───────────────────────────────────────────────────────
  var cmdOverlay=document.getElementById('cmd-overlay');
  var cmdSearch=document.getElementById('cmd-search');
  var cmdResults=document.getElementById('cmd-results');
  var cmdSel=0;
  var CMD_ITEMS=[
    {group:'Go to', ic:'🔁', label:'Loops',    hint:'1', fn:function(){switchTab('loops');}},
    {group:'Go to', ic:'✅',   label:'Tasks',    hint:'2', fn:function(){switchTab('tasks');}},
    {group:'Go to', ic:'🤝', label:'Leads',    hint:'3', fn:function(){switchTab('leads');}},
    {group:'Go to', ic:'🤖', label:'Agents',   hint:'4', fn:function(){switchTab('agents');}},
    {group:'Go to', ic:'⚙️',label:'Autonomy', hint:'5', fn:function(){switchTab('auto');}},
    {group:'Go to', ic:'📜', label:'Activity', hint:'6', fn:function(){switchTab('events');}},
    {group:'Actions',ic:'🔁',label:'Add loop',    hint:'', fn:function(){switchTab('loops');setTimeout(function(){qfield.focus();},80);}},
    {group:'Actions',ic:'✅',  label:'Add task',    hint:'', fn:function(){switchTab('tasks');setTimeout(function(){qfield.focus();},80);}},
    {group:'Actions',ic:'🤝',label:'Add lead',    hint:'', fn:function(){switchTab('leads');setTimeout(function(){qfield.focus();},80);}},
    {group:'Actions',ic:'↻',  label:'Sweep loops', hint:'', fn:function(){switchTab('loops');setTimeout(function(){var s=document.getElementById('sweep-btn');if(s) s.click();},300);}},
  ];
  function switchTab(t){tab=t;buildNav();buildBotNav();render();closePalette();}
  function openPalette(){cmdOverlay.classList.add('open');cmdSearch.value='';cmdSearch.focus();renderPalette('');}
  function closePalette(){cmdOverlay.classList.remove('open');}
  function renderPalette(q){
    q=q.toLowerCase();
    var items=q?CMD_ITEMS.filter(function(c){return c.label.toLowerCase().indexOf(q)>=0||c.group.toLowerCase().indexOf(q)>=0;}):CMD_ITEMS;
    if(!items.length){cmdResults.innerHTML='<div class="empty" style="padding:20px">No results</div>';return;}
    var lastGrp='',html='';
    items.forEach(function(c,i){
      if(c.group!==lastGrp){html+='<div class="cmd-group">'+c.group+'</div>';lastGrp=c.group;}
      html+='<div class="cmd-item'+(i===cmdSel?' sel':'')+'" data-ci="'+i+'">'
        +'<div class="cmd-item-ic">'+c.ic+'</div>'
        +'<span class="cmd-item-label">'+c.label+'</span>'
        +(c.hint?'<span class="cmd-item-hint">'+c.hint+'</span>':'')
        +'</div>';
    });
    cmdResults.innerHTML=html;
    cmdResults.querySelectorAll('.cmd-item').forEach(function(el){
      el.onclick=function(){items[parseInt(el.dataset.ci)].fn();};
    });
  }
  if(cmdSearch){
    cmdSearch.oninput=function(){cmdSel=0;renderPalette(cmdSearch.value);};
    cmdSearch.onkeydown=function(e){
      var els=cmdResults.querySelectorAll('.cmd-item');
      if(e.key==='ArrowDown'){cmdSel=Math.min(cmdSel+1,els.length-1);e.preventDefault();}
      else if(e.key==='ArrowUp'){cmdSel=Math.max(cmdSel-1,0);e.preventDefault();}
      else if(e.key==='Enter'){var sel=cmdResults.querySelector('.cmd-item.sel');if(sel) sel.click();}
      else if(e.key==='Escape'){closePalette();return;}
      renderPalette(cmdSearch.value);
    };
  }
  if(cmdOverlay) cmdOverlay.onclick=function(e){if(e.target===cmdOverlay) closePalette();};

  // ── quick-add ─────────────────────────────────────────────────────────────
  document.getElementById('qbar').onsubmit=function(e){
    e.preventDefault();
    var v=qfield.value.trim(); if(!v) return;
    qfield.value='';
    if(tab==='loops') post('/api/loops',{title:v,side:side}).then(function(){toast('Loop captured');render();});
    else if(tab==='tasks') post('/api/tasks',{title:v,day:taskDay}).then(function(){toast('Task added');render();});
    else if(tab==='leads'){
      if(v.length>24||/[,@]/.test(v)) post('/api/leads/quick-add',{note:v}).then(function(){toast('Lead created from note');render();});
      else post('/api/leads',{name:v}).then(function(){toast('Lead created');render();});
    }
  };

  // ── keyboard shortcuts ────────────────────────────────────────────────────
  document.addEventListener('keydown',function(ev){
    var tag=(document.activeElement||{}).tagName||'';
    var inInput=tag==='INPUT'||tag==='TEXTAREA';
    if((ev.metaKey||ev.ctrlKey)&&ev.key==='k'){
      ev.preventDefault();
      if(cmdOverlay.classList.contains('open')){closePalette();}
      else{openPalette();}
      return;
    }
    if(inInput) return;
    if(ev.key==='Escape'){closePalette();notifPanel.classList.remove('open');if(document.activeElement)document.activeElement.blur();return;}
    var idx='123456'.indexOf(ev.key);
    if(idx>=0&&idx<TABS.length){tab=TABS[idx].id;buildNav();buildBotNav();render();}
  });

  // ── sidebar search ────────────────────────────────────────────────────────
  var ssi=document.getElementById('sidebar-search-input');
  if(ssi){ssi.oninput=function(){
    var q=ssi.value.toLowerCase();
    document.querySelectorAll('#side-nav .nav-item').forEach(function(el){
      el.style.display=(!q||el.textContent.toLowerCase().indexOf(q)>=0)?'':'none';
    });
  };}

  // ── boot ──────────────────────────────────────────────────────────────────
  buildNav();
  render();
  loadNotifications();
  } catch(e) { showErr(e); }
})();
</script>
</body>
</html>`;
}
