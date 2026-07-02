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
.blob1{top:-12%;left:8%;width:46%;height:60%;background:radial-gradient(circle,var(--b1c,rgba(62,123,250,.28)),transparent 68%);--dx:40px;--dy:30px;animation:cbDrift 19s ease-in-out infinite;}
.blob2{top:30%;right:-6%;width:42%;height:58%;background:radial-gradient(circle,var(--b2c,rgba(91,141,239,.22)),transparent 68%);--dx:-32px;--dy:26px;animation:cbDrift 23s ease-in-out infinite;}
.blob3{bottom:-16%;left:34%;width:40%;height:52%;background:radial-gradient(circle,var(--b3c,rgba(232,161,58,.14)),transparent 68%);--dx:28px;--dy:-22px;animation:cbDrift 27s ease-in-out infinite;}
#mesh{position:absolute;inset:-25%;background:radial-gradient(38% 44% at 24% 28%,var(--m1c,rgba(22,207,152,.22)),transparent 64%),radial-gradient(40% 42% at 78% 26%,var(--m2c,rgba(91,141,239,.18)),transparent 66%),radial-gradient(44% 46% at 62% 82%,var(--m3c,rgba(124,79,208,.18)),transparent 66%);animation:cbMesh 28s ease-in-out infinite;pointer-events:none;}
#grain{position:absolute;inset:0;z-index:6;pointer-events:none;opacity:.02;mix-blend-mode:soft-light;background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E');background-size:170px 170px;}
[data-theme="dark"] #grain{opacity:.04;}

#shell{position:relative;z-index:1;display:flex;flex:1;min-height:0;}

/* sidebar */
#sidebar{width:var(--nav-w);flex-shrink:0;display:flex;flex-direction:column;padding:16px 12px 14px;gap:2px;border-right:1px solid var(--glassBorder);background:var(--glassThin);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);}
.logo-row{display:flex;align-items:center;gap:9px;padding:2px 8px 12px;}
.logo-text{font-family:&quot;JetBrains Mono&quot;,monospace;font-weight:600;font-size:14px;letter-spacing:-.3px;}
.logo-text span{color:var(--accent);}
.logo-sub{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:9px;color:var(--faint);margin-top:3px;letter-spacing:.4px;}
.sidebar-search{padding:0 2px 10px;position:relative;}
.sidebar-search input{width:100%;background:rgba(255,255,255,.06);border:1px solid var(--glassBorder);border-radius:10px;padding:8px 10px 8px 30px;font-size:12px;color:var(--text);}
.sidebar-search input::placeholder{color:var(--faint);}
.ss-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);pointer-events:none;opacity:.4;}
.nav-item{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:500;color:var(--muted);transition:background .15s,color .15s;user-select:none;min-height:40px;}
.nav-item:hover{background:var(--bg2);color:var(--text);}
.nav-item.active{background:var(--accentSoft);color:var(--accent);}
.nav-item .ni{width:17px;height:17px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.nav-badge{margin-left:auto;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--accent);color:#fff;font-size:10px;font-weight:700;font-family:&quot;JetBrains Mono&quot;,monospace;display:flex;align-items:center;justify-content:center;}
.sidebar-bot{margin-top:auto;display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--glassBorder);padding-top:10px;}
.agent-status{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:11px;background:var(--surface2);border:1px solid var(--glassBorder);}
.agent-dot{width:8px;height:8px;border-radius:50%;background:var(--green);animation:cbPulse 2.4s ease-in-out infinite;}
.agent-label{font-size:11px;font-weight:500;line-height:1.2;}
.agent-sublabel{font-size:9px;color:var(--faint);font-family:&quot;JetBrains Mono&quot;,monospace;margin-top:2px;}
.role-switcher{padding:0 2px;}
.role-sw-label{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:8px;color:var(--faint);letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px;padding:0 9px;}
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
.theme-panel-lbl{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:9px;color:var(--faint);letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px;padding:0 2px;}
.theme-swatches{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;}
.theme-swatch{height:30px;border-radius:9px;cursor:pointer;border:2px solid transparent;transition:border-color .15s;}
.theme-swatch.on{border-color:var(--accent);}

/* main */
#main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;}
#topbar{display:none;align-items:center;gap:10px;padding:11px 16px;flex-shrink:0;border-bottom:1px solid var(--glassBorder);background:var(--glassThin);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);}
#topbar .logo-text{font-size:15px;}
#notif-btn{position:relative;width:40px;height:40px;border-radius:10px;border:1px solid var(--glassBorder);background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;margin-left:auto;}
#notif-btn:hover{background:rgba(255,255,255,.08);}
#notif-count{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--red);color:#fff;font-size:9px;font-weight:700;font-family:&quot;JetBrains Mono&quot;,monospace;display:none;align-items:center;justify-content:center;}
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
.brief-label{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:9px;font-weight:600;color:var(--accent);letter-spacing:.8px;text-transform:uppercase;}
.brief-title{font-size:13px;font-weight:500;margin-top:2px;color:var(--text);line-height:1.4;}
.brief-sw{display:flex;gap:2px;margin-left:auto;}
.brief-sw-btn{padding:5px 9px;border:none;border-radius:7px;background:transparent;font-size:10px;font-weight:600;color:var(--faint);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.3px;min-height:28px;}
.brief-sw-btn.on{background:rgba(255,255,255,.1);color:var(--text);}
.brief-stats{display:flex;gap:9px;flex-wrap:wrap;}
.brief-stat{flex:1;min-width:80px;padding:10px 13px;border-radius:11px;background:var(--bg2);border:1px solid var(--glassBorder);}
[data-theme="dark"] .brief-stat{background:rgba(255,255,255,.04);}
.brief-stat-val{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:20px;font-weight:700;}
.brief-stat-lbl{font-size:10px;color:var(--muted);margin-top:2px;}

/* CEO KPI row */
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(115px,1fr));gap:10px;margin-bottom:20px;}
.kpi-card{padding:14px 15px;border-radius:14px;}
.kpi-val{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:26px;font-weight:700;line-height:1;}
.kpi-lbl{font-size:11px;color:var(--muted);margin-top:7px;}

/* role-specific panels */
.role-panel{padding:16px 18px;border-radius:16px;margin-bottom:18px;border-left:3px solid var(--accent);}
.role-panel-lbl{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:9px;font-weight:600;color:var(--accent);letter-spacing:.7px;text-transform:uppercase;margin-bottom:8px;}
.role-panel-title{font-size:14px;font-weight:600;margin-bottom:4px;}
.role-panel-sub{font-size:12px;color:var(--muted);line-height:1.5;}
.role-stats{display:flex;gap:18px;margin-top:12px;padding-top:11px;border-top:1px solid var(--glassBorder);}
.role-stat-val{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:18px;font-weight:700;}
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
.col-label{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;}
.col-count{margin-left:auto;font-family:&quot;JetBrains Mono&quot;,monospace;font-size:12px;color:var(--muted);}
.col-hint{font-size:10.5px;color:var(--faint);display:block;margin:-2px 0 10px 17px;}
.loop-card{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:14px;margin-bottom:10px;animation:cbFadeUp .3s ease both;}
.loop-card .check-btn{width:22px;height:22px;border-radius:50%;border:2px solid rgba(120,120,160,.4);background:transparent;flex-shrink:0;margin-top:1px;transition:border-color .15s,background .15s;min-height:22px;}
.loop-card .check-btn:hover{border-color:var(--green);background:rgba(55,192,138,.1);}
.loop-info{flex:1;min-width:0;}
.loop-title-row{display:flex;align-items:flex-start;gap:8px;margin-bottom:4px;}
.loop-title-row .loop-title{flex:1;min-width:0;}
.loop-title{font-size:14px;font-weight:600;line-height:1.35;}
.loop-meta{font-size:12px;color:var(--muted);margin-top:2px;}
.loop-chan{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:10px;font-weight:600;letter-spacing:.4px;color:var(--faint);text-transform:uppercase;}
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
.qhint{font-size:11px;color:var(--faint);font-family:&quot;JetBrains Mono&quot;,monospace;align-self:center;white-space:nowrap;}

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
.lead-detail-lbl{color:var(--faint);min-width:80px;font-family:&quot;JetBrains Mono&quot;,monospace;font-size:10px;padding-top:1px;}
.lead-detail-val{color:var(--text);font-weight:500;}
.lead-action-strip{display:flex;gap:7px;margin-top:10px;flex-wrap:wrap;}
.lead-action-btn{padding:8px 12px;border-radius:9px;border:1px solid var(--glassBorder);background:rgba(255,255,255,.04);color:var(--muted);font-size:12px;font-weight:500;min-height:36px;}
.lead-action-btn:hover{background:rgba(255,255,255,.08);color:var(--text);}
.lead-action-btn.primary{background:var(--accentSoft);color:var(--accent);border-color:rgba(62,123,250,.3);}
.lead-timeline{position:relative;margin-top:12px;padding-left:16px;}
.lead-timeline::before{content:'';position:absolute;left:5px;top:4px;bottom:4px;width:1.5px;background:var(--glassBorder);}
.lead-tl-item{position:relative;padding-left:16px;margin-bottom:12px;}
.lead-tl-item::before{content:'';position:absolute;left:-10.5px;top:4px;width:9px;height:9px;border-radius:50%;background:var(--bg);border:2px solid var(--accent);}
.lead-tl-text{font-size:12px;line-height:1.4;}
.lead-tl-when{font-size:10px;color:var(--faint);margin-top:2px;font-family:&quot;JetBrains Mono&quot;,monospace;}

/* agent / autonomy */
.agent-card{padding:16px 18px;border-radius:15px;margin-bottom:10px;}
.agent-name{font-size:14px;font-weight:700;}
.agent-role{font-size:12px;color:var(--muted);margin-top:2px;}
.auto-badge{font-size:10px;font-weight:700;padding:3px 9px;border-radius:6px;font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.3px;}
.auto-auto{background:var(--greenSoft);color:var(--green);}
.auto-ask{background:var(--amberSoft);color:var(--amber);}
.auto-off{background:rgba(120,120,140,.12);color:var(--faint);}
.prog-wrap{flex:1;height:5px;border-radius:5px;background:rgba(255,255,255,.08);overflow:hidden;}
.prog-fill{height:100%;border-radius:5px;transition:width .4s ease;}
.hire-btn{display:flex;align-items:center;gap:10px;padding:13px 15px;border-radius:14px;border:1px dashed rgba(120,120,160,.3);color:var(--accent);font-size:12.5px;font-weight:600;background:transparent;width:100%;margin-top:6px;cursor:pointer;min-height:48px;}
.hire-btn:hover{background:var(--accentSoft);border-color:rgba(62,123,250,.4);}
.auto-card{padding:15px 17px;border-radius:15px;margin-bottom:10px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
.auto-info{flex:1;min-width:180px;}
.auto-label{font-size:14px;font-weight:600;}
.auto-desc{font-size:12px;color:var(--muted);margin-top:3px;}
.lvls{display:flex;gap:3px;padding:3px;border-radius:10px;background:rgba(0,0,0,.2);border:1px solid var(--glassBorder);}
.lvl{padding:6px 13px;border-radius:7px;border:none;background:transparent;font-size:12px;font-weight:600;color:var(--muted);min-height:36px;}
.lvl.on{background:rgba(255,255,255,.12);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.25);}
.approve-card{display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:14px;margin-bottom:9px;}
.approve-title{font-size:13px;font-weight:600;}
.approve-action{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:11px;color:var(--faint);margin-top:3px;}
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
.event-type{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:12px;font-weight:600;color:var(--accent);}
.event-meta{font-size:11.5px;color:var(--muted);margin-top:2px;}
.event-icon{width:34px;height:34px;border-radius:10px;background:var(--surface2);border:1px solid var(--glassBorder);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;}
.date-sep{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:10px;color:var(--faint);letter-spacing:.5px;padding:8px 0 6px;display:flex;align-items:center;gap:10px;}
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
.cmd-group{padding:8px 18px 2px;font-family:&quot;JetBrains Mono&quot;,monospace;font-size:9px;color:var(--faint);letter-spacing:.6px;text-transform:uppercase;}
.cmd-item{display:flex;align-items:center;gap:12px;padding:10px 18px;cursor:pointer;font-size:13px;border-radius:0;min-height:44px;}
.cmd-item:hover,.cmd-item.sel{background:var(--accentSoft);}
.cmd-item-ic{width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid var(--glassBorder);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;}
.cmd-item-label{font-weight:500;flex:1;}
.cmd-item-hint{font-size:10px;color:var(--faint);font-family:&quot;JetBrains Mono&quot;,monospace;padding:2px 6px;border-radius:5px;background:rgba(255,255,255,.06);border:1px solid var(--glassBorder);}

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
.btn-danger{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:11px;border:none;background:var(--red);color:#fff;font-size:13px;font-weight:600;min-height:40px;}

/* dark mode toggle */
.dark-toggle{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:9px;border:1px solid var(--glassBorder);background:transparent;font-size:11px;font-weight:500;color:var(--muted);width:100%;min-height:34px;cursor:pointer;}
.dark-toggle:hover{background:var(--bg2);color:var(--text);}
.topbar-dark-toggle{width:36px;height:36px;border-radius:9px;border:1px solid var(--glassBorder);background:transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--muted);margin-left:auto;}
.topbar-dark-toggle:hover{background:var(--bg2);color:var(--text);}

/* empty / spinner */
.empty{color:var(--faint);text-align:center;padding:40px 0;font-size:13px;}
.empty-dashed{padding:30px 18px;text-align:center;border-radius:14px;border:1px dashed rgba(255,255,255,.1);color:var(--faint);font-size:12.5px;margin-top:4px;}
.spin{width:20px;height:20px;border:2.5px solid rgba(255,255,255,.12);border-top-color:var(--accent);border-radius:50%;animation:cbSpin .8s linear infinite;margin:40px auto;display:block;}

/* kanban board */
.kanban-wrap{margin-top:4px;}.overdue-strip{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:11px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.18);margin-bottom:14px;}.overdue-strip-count{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:13px;font-weight:700;color:var(--red);}.overdue-strip-label{font-size:12.5px;color:var(--red);flex:1;}.kanban-board{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}.kanban-col{min-width:0;}.kanban-col-head{display:flex;align-items:center;gap:7px;padding:0 2px 10px;}.kanban-col-dot{width:8px;height:8px;border-radius:2px;flex-shrink:0;}.kanban-col-label{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);}.kanban-col-count{margin-left:auto;font-family:&quot;JetBrains Mono&quot;,monospace;font-size:11px;color:var(--faint);}.kanban-col-body{display:flex;flex-direction:column;gap:7px;min-height:80px;}.kanban-task-card{padding:11px 13px;border-radius:12px;}.kanban-task-card.overdue{border-left:3px solid var(--red);border-top-left-radius:9px;border-bottom-left-radius:9px;}.kanban-task-card.due-soon{border-left:3px solid var(--amber);border-top-left-radius:9px;border-bottom-left-radius:9px;}.kanban-task-row{display:flex;align-items:flex-start;gap:8px;}.kanban-check{width:17px;height:17px;border-radius:50%;border:2px solid var(--glassBorder);background:transparent;flex-shrink:0;margin-top:2px;cursor:pointer;transition:border-color .15s,background .15s;min-height:17px;}.kanban-check:hover{border-color:var(--green);background:var(--greenSoft);}.kanban-task-emoji{font-size:13px;flex-shrink:0;margin-top:1px;}.kanban-task-title{font-size:13px;font-weight:600;color:var(--text);line-height:1.3;flex:1;}.kanban-task-sub{font-size:10.5px;color:var(--muted);margin-top:3px;}.kanban-task-foot{display:flex;align-items:center;gap:6px;margin-top:7px;flex-wrap:wrap;}.priority-pill{font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;font-family:&quot;JetBrains Mono&quot;,monospace;white-space:nowrap;}.priority-high{background:var(--redSoft);color:var(--red);}.priority-med{background:var(--amberSoft);color:var(--amber);}.priority-low{background:var(--greenSoft);color:var(--green);}.kanban-add-btn{display:flex;align-items:center;gap:7px;padding:8px 10px;border-radius:10px;border:1.5px dashed var(--glassBorder);background:transparent;color:var(--faint);font-size:12px;width:100%;cursor:pointer;margin-top:5px;min-height:34px;transition:all .15s;}.kanban-add-btn:hover{border-color:var(--accent);color:var(--accent);background:var(--accentSoft);}

/* pipeline board */
.pipeline-board{display:flex;gap:12px;overflow-x:auto;padding-bottom:12px;-webkit-overflow-scrolling:touch;margin-top:4px;}.pipeline-board::-webkit-scrollbar{height:4px;}.pipeline-col{min-width:210px;width:210px;flex-shrink:0;}.pipeline-col-head{display:flex;align-items:center;gap:6px;padding:0 2px 10px;}.pipeline-stage-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}.pipeline-stage-label{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:9.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);}.pipeline-col-count{margin-left:auto;font-family:&quot;JetBrains Mono&quot;,monospace;font-size:11px;color:var(--faint);}.pipeline-col-body{display:flex;flex-direction:column;gap:7px;min-height:80px;}.pipeline-lead-card{padding:11px 12px;border-radius:12px;cursor:pointer;transition:transform .15s,box-shadow .15s;}.pipeline-lead-card:hover{transform:translateY(-1px);box-shadow:var(--shadow-md);}.pipeline-lead-avatar{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;font-weight:700;color:#fff;}.pipeline-lead-name{font-size:12.5px;font-weight:600;color:var(--text);line-height:1.3;}.pipeline-lead-sub{font-size:10.5px;color:var(--muted);margin-top:2px;}.pipeline-lead-foot{display:flex;gap:5px;margin-top:8px;flex-wrap:wrap;}.plead-adv-btn{padding:4px 9px;border-radius:6px;border:1px solid var(--glassBorder);background:var(--surface2);color:var(--muted);font-size:10.5px;font-weight:500;min-height:26px;cursor:pointer;transition:all .15s;text-decoration:none;}.plead-adv-btn:hover{background:var(--accentSoft);color:var(--accent);border-color:rgba(62,123,250,.3);}

/* bento grid */
.bento-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:13px;margin-top:4px;}.bento-card{border-radius:18px;padding:20px;min-height:170px;display:flex;flex-direction:column;position:relative;overflow:hidden;cursor:pointer;transition:transform .2s,box-shadow .2s;}.bento-card:hover{transform:translateY(-3px);box-shadow:var(--shadow-lg);}.bento-hero{grid-column:span 2;min-height:190px;}.bento-card-emoji{font-size:26px;margin-bottom:auto;}.bento-card-name{font-size:15px;font-weight:700;line-height:1.3;color:#fff;}.bento-card-desc{font-size:11.5px;opacity:.8;margin-top:4px;color:#fff;line-height:1.4;}.bento-card-foot{display:flex;align-items:center;gap:8px;margin-top:12px;}.bento-prog-bar{flex:1;height:3px;border-radius:3px;background:rgba(255,255,255,.25);overflow:hidden;}.bento-prog-fill{height:100%;border-radius:3px;background:rgba(255,255,255,.75);}.bento-pct{font-size:10px;font-weight:700;color:rgba(255,255,255,.8);font-family:&quot;JetBrains Mono&quot;,monospace;}.bento-status{font-size:9.5px;font-weight:700;padding:3px 8px;border-radius:5px;background:rgba(255,255,255,.2);color:#fff;font-family:&quot;JetBrains Mono&quot;,monospace;}.bento-new-card{border-radius:18px;padding:20px;min-height:170px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:2px dashed var(--glassBorder);cursor:pointer;transition:all .2s;color:var(--faint);background:transparent;}.bento-new-card:hover{border-color:var(--accent);color:var(--accent);background:var(--accentSoft);}

/* modals */
.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.35);backdrop-filter:blur(4px);z-index:200;display:none;align-items:center;justify-content:center;padding:16px;}.modal-backdrop.open{display:flex;}.modal-box{background:var(--surface);border:1px solid var(--glassBorder);border-radius:20px;width:100%;max-width:480px;max-height:88vh;overflow-y:auto;box-shadow:var(--shadow-lg);animation:cbModalUp .2s ease;}.modal-head{display:flex;align-items:center;gap:12px;padding:18px 18px 0;}.modal-title{font-size:15px;font-weight:700;flex:1;}.modal-close{width:30px;height:30px;border-radius:7px;border:1px solid var(--glassBorder);background:transparent;color:var(--muted);font-size:16px;cursor:pointer;}.modal-body{padding:16px 18px 4px;}.modal-foot{display:flex;gap:8px;justify-content:flex-end;padding:12px 18px 18px;}.modal-field{margin-bottom:13px;}.modal-label{display:block;font-size:10px;font-weight:600;color:var(--muted);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.5px;text-transform:uppercase;margin-bottom:5px;}.modal-input,.modal-select{width:100%;padding:9px 12px;border-radius:9px;border:1px solid var(--glassBorder);background:var(--bg2);color:var(--text);font-size:13px;font-family:inherit;}[data-theme="dark"] .modal-input,[data-theme="dark"] .modal-select{background:rgba(255,255,255,.06);}.modal-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accentSoft);outline:none;}@keyframes cbModalUp{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:none}}

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
  .kanban-board{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;-webkit-overflow-scrolling:touch;}
  .kanban-col{min-width:230px;flex-shrink:0;}
  .bento-hero{grid-column:span 1;}
}
@media(min-width:900px){.bento-grid{grid-template-columns:repeat(3,1fr);}}
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
        <button class="dark-toggle" id="dark-toggle-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          <span id="dark-toggle-label">Dark mode</span>
        </button>
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
        <div class="agent-status" id="session-user-card">
          <div style="width:18px;height:18px;border-radius:6px;background:var(--accentSoft);display:flex;align-items:center;justify-content:center;color:var(--accent);font-size:11px;font-weight:700;">👤</div>
          <div style="flex:1;min-width:0;"><div class="agent-label" id="session-user-name">Guest</div><div class="agent-sublabel" id="session-user-role">not signed in</div></div>
          <button class="btn-ghost" id="logout-btn" style="padding:4px 8px;min-height:28px;font-size:10.5px;display:none;">Logout</button>
        </div>
      </div>
    </nav>

    <main id="main">
      <div id="topbar">
        <div class="logo-text">company<span style="color:var(--accent)">brain</span></div>
        <button class="topbar-dark-toggle" id="topbar-dark-toggle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </button>
        <div id="notif-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span id="notif-count"></span>
        </div>
        <button class="topbar-dark-toggle" id="topbar-logout-btn" title="Sign out" style="display:none;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>
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

  <div class="modal-backdrop" id="more-sheet" style="align-items:flex-end;padding:0;">
    <div style="background:var(--surface);border-radius:20px 20px 0 0;width:100%;padding:12px 16px 32px;border:1px solid var(--glassBorder);">
      <div style="width:36px;height:4px;border-radius:4px;background:var(--glassBorder);margin:0 auto 16px;"></div>
      <div id="more-sheet-items" style="display:flex;flex-direction:column;gap:2px;"></div>
    </div>
  </div>

  <div class="modal-backdrop" id="task-modal">
    <div class="modal-box">
      <div class="modal-head"><span id="task-modal-emoji" style="font-size:22px;cursor:pointer;" title="Pick emoji">📝</span><span class="modal-title">New task</span><button class="modal-close" id="task-modal-close">×</button></div>
      <div class="modal-body">
        <div class="modal-field"><label class="modal-label">Title</label><input class="modal-input" id="task-modal-title" placeholder="What needs doing?" autocomplete="off"/></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div class="modal-field"><label class="modal-label">When</label><select class="modal-select" id="task-modal-when"><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="upcoming">Upcoming</option></select></div><div class="modal-field"><label class="modal-label">Priority</label><select class="modal-select" id="task-modal-priority"><option value="">None</option><option value="low">Low</option><option value="med">Medium</option><option value="high">High</option></select></div></div>
        <div class="modal-field"><label class="modal-label">List / Project</label><input class="modal-input" id="task-modal-list" placeholder="Inbox" autocomplete="off"/></div>
        <div class="modal-field"><label class="modal-label">Repeat</label><select class="modal-select" id="task-modal-repeat"><option value="">Off</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
      </div>
      <div class="modal-foot"><button class="btn-ghost" id="task-modal-cancel">Cancel</button><button class="btn-primary" id="task-modal-save">Save task</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="lead-modal">
    <div class="modal-box">
      <div class="modal-head"><span style="font-size:20px;">🤝</span><span class="modal-title">New lead</span><button class="modal-close" id="lead-modal-close">×</button></div>
      <div class="modal-body">
        <div style="display:flex;gap:3px;padding:3px;border-radius:9px;background:var(--bg2);border:1px solid var(--glassBorder);margin-bottom:14px;"><button class="capture-tab on" id="lead-tab-type" style="flex:1;padding:7px;border-radius:7px;border:none;background:var(--surface);font-size:12px;font-weight:600;color:var(--text);cursor:pointer;min-height:34px;box-shadow:var(--shadow-md);">&#9997; Type details</button><button class="capture-tab" id="lead-tab-photo" style="flex:1;padding:7px;border-radius:7px;border:none;background:transparent;font-size:12px;font-weight:500;color:var(--muted);cursor:pointer;min-height:34px;">&#128247; Scan card</button></div>
        <div id="lead-type-form"><div class="modal-field"><label class="modal-label">Name *</label><input class="modal-input" id="lead-name" placeholder="John Smith" autocomplete="off"/></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div class="modal-field"><label class="modal-label">Phone</label><input class="modal-input" id="lead-phone" placeholder="+91 98765 00000"/></div><div class="modal-field"><label class="modal-label">Email</label><input class="modal-input" id="lead-email" placeholder="john@acme.com"/></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div class="modal-field"><label class="modal-label">Company</label><input class="modal-input" id="lead-company" placeholder="Acme Inc."/></div><div class="modal-field"><label class="modal-label">Title</label><input class="modal-input" id="lead-title" placeholder="CEO"/></div></div><div class="modal-field"><label class="modal-label">Notes</label><textarea class="modal-input" id="lead-notes" rows="2" placeholder="Met at conference, interested in services" style="resize:vertical;"></textarea></div></div>
        <div id="lead-photo-form" style="display:none;"><div id="lead-upload-area" style="padding:28px 20px;border-radius:12px;border:2px dashed var(--glassBorder);text-align:center;cursor:pointer;transition:all .15s;"><div style="font-size:32px;margin-bottom:10px;">&#128247;</div><div style="font-size:13px;font-weight:600;color:var(--text);">Tap to upload business card</div><div style="font-size:11.5px;color:var(--faint);margin-top:4px;">AI will extract name, phone, email and company</div><input type="file" id="lead-card-file" accept="image/*" style="display:none;"/></div><div id="lead-extracted" style="display:none;margin-top:12px;padding:12px;border-radius:10px;background:var(--bg2);border:1px solid var(--glassBorder);"><div style="font-size:11px;font-weight:600;color:var(--accent);margin-bottom:8px;font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.4px;">EXTRACTED</div><div id="lead-extracted-fields"></div></div></div>
      </div>
      <div class="modal-foot"><button class="btn-ghost" id="lead-modal-cancel">Cancel</button><button class="btn-primary" id="lead-modal-save">Save lead</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="proj-modal">
    <div class="modal-box">
      <div class="modal-head"><span style="font-size:20px;">📦</span><span class="modal-title">New project</span><button class="modal-close" id="proj-modal-close">×</button></div>
      <div class="modal-body"><div class="modal-field"><label class="modal-label">Choose a template</label><div id="proj-template-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;"></div></div><div class="modal-field"><label class="modal-label">Project name</label><input class="modal-input" id="proj-modal-name" placeholder="My new project" autocomplete="off"/></div><div class="modal-field"><label class="modal-label">Description (optional)</label><textarea class="modal-input" id="proj-modal-desc" rows="2" placeholder="What is this project about?" style="resize:vertical;"></textarea></div></div>
      <div class="modal-foot"><button class="btn-ghost" id="proj-modal-cancel">Cancel</button><button class="btn-primary" id="proj-modal-save">Create project</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="auth-modal">
    <div class="modal-box" style="max-width:430px;">
      <div class="modal-head"><span style="font-size:20px;">🔐</span><span class="modal-title">Sign in to companybrain</span></div>
      <div class="modal-body">
        <div style="font-size:12px;color:var(--muted);line-height:1.45;margin-bottom:12px;">Use your user identity + workspace access key.</div>
        <div class="modal-field"><label class="modal-label">User</label><select class="modal-select" id="auth-user"></select></div>
        <div class="modal-field"><label class="modal-label">Access key</label><input class="modal-input" id="auth-key" type="password" placeholder="Enter access key" autocomplete="current-password"/></div>
        <div id="auth-error" style="display:none;font-size:12px;color:var(--red);margin-top:4px;"></div>
      </div>
      <div class="modal-foot"><button class="btn-primary" id="auth-login-btn">Sign in</button></div>
    </div>
  </div>

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
  var me=null, authUsers=[], appStarted=false;
  var h0=new Date().getHours();
  var briefMode=h0<12?'am':h0<17?'pm':'eve';

  var TABS=[
    {id:'loops',  ic:'🔁', label:'Loops'},
    {id:'tasks',  ic:'✅',  label:'Tasks'},
    {id:'leads',  ic:'🤝', label:'Leads'},
    {id:'projects', ic:'📦', label:'Projects'},
    {id:'agents', ic:'🤖', label:'Agents'},
    {id:'team',   ic:'👥', label:'Team'},
    {id:'brain',  ic:'🧠', label:'Brain'},
    {id:'reports',ic:'📊', label:'Reports'},
    {id:'settings', ic:'⚙️', label:'Settings'},
    {id:'events', ic:'📜', label:'Activity'},
  ];

  var SVG={
    loops:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    tasks:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    leads:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    projects:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="6" height="6" rx="1"/><rect x="9" y="3" width="6" height="6" rx="1"/><rect x="16" y="3" width="6" height="6" rx="1"/><rect x="2" y="12" width="6" height="6" rx="1"/><rect x="9" y="12" width="6" height="6" rx="1"/></svg>',
    agents:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 7V4M8 13h.01M16 13h.01"/></svg>',
    team:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    brain:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.14Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.14Z"/></svg>',
    reports:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    settings:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.1 5A9 9 0 0 1 21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9"/></svg>',
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
    {id:'default', label:'Default', b1:'rgba(62,123,250,.28)', b2:'rgba(91,141,239,.22)', b3:'rgba(232,161,58,.14)', m1:'rgba(22,207,152,.22)', m2:'rgba(91,141,239,.18)', m3:'rgba(124,79,208,.18)', swatch:'linear-gradient(135deg,#3e7bfa,#16b7ae)'},
    {id:'aurora',  label:'Aurora',  b1:'rgba(22,207,152,.3)',   b2:'rgba(62,123,250,.2)',  b3:'rgba(62,123,250,.12)',m1:'rgba(22,207,152,.25)', m2:'rgba(62,123,250,.2)',  m3:'rgba(55,192,138,.18)', swatch:'linear-gradient(135deg,#16cf98,#3e7bfa)'},
    {id:'blush',   label:'Blush',   b1:'rgba(240,85,107,.22)',  b2:'rgba(232,161,58,.18)', b3:'rgba(62,123,250,.1)',m1:'rgba(240,85,107,.2)',  m2:'rgba(232,161,58,.16)', m3:'rgba(91,141,239,.16)',swatch:'linear-gradient(135deg,#f0556b,#e8a13a)'},
    {id:'mist',    label:'Mist',    b1:'rgba(91,141,239,.26)',  b2:'rgba(22,183,174,.2)',  b3:'rgba(62,123,250,.14)', m1:'rgba(22,183,174,.22)', m2:'rgba(91,141,239,.18)', m3:'rgba(62,123,250,.16)', swatch:'linear-gradient(135deg,#3e7bfa,#16b7ae)'},
    {id:'sage',    label:'Sage',    b1:'rgba(55,192,138,.26)',  b2:'rgba(22,207,152,.2)',  b3:'rgba(91,141,239,.14)', m1:'rgba(55,192,138,.24)', m2:'rgba(22,207,152,.18)', m3:'rgba(91,141,239,.16)', swatch:'linear-gradient(135deg,#37c08a,#16cf98)'},
    {id:'sand',    label:'Sand',    b1:'rgba(232,161,58,.28)',  b2:'rgba(240,85,107,.16)', b3:'rgba(22,183,174,.14)', m1:'rgba(232,161,58,.24)', m2:'rgba(240,85,107,.16)', m3:'rgba(22,183,174,.16)', swatch:'linear-gradient(135deg,#e8a13a,#f0556b)'},
    {id:'frost',   label:'Frost',   b1:'rgba(91,141,239,.22)', b2:'rgba(62,123,250,.22)', b3:'rgba(22,183,174,.12)', m1:'rgba(91,141,239,.2)',  m2:'rgba(62,123,250,.18)', m3:'rgba(22,183,174,.16)', swatch:'linear-gradient(135deg,#5b93ff,#3e7bfa)'},
    {id:'dusk',    label:'Dusk',    b1:'rgba(124,79,208,.28)',  b2:'rgba(240,85,107,.18)', b3:'rgba(232,161,58,.12)', m1:'rgba(124,79,208,.24)', m2:'rgba(240,85,107,.16)', m3:'rgba(232,161,58,.14)', swatch:'linear-gradient(135deg,#7c4fd0,#f0556b)'},
  ];

  var PROJECT_PALETTES=[
    'linear-gradient(135deg,#3e7bfa,#7c3aed)',
    'linear-gradient(135deg,#10b981,#14b8a6)',
    'linear-gradient(135deg,#f59e0b,#ef4444)',
    'linear-gradient(135deg,#6366f1,#ec4899)',
    'linear-gradient(135deg,#0ea5e9,#06b6d4)',
    'linear-gradient(135deg,#8b5cf6,#d946ef)',
  ];
  var PROJECT_TEMPLATES=[
    {name:'Blank',         emoji:'📄', bg:'linear-gradient(135deg,#6b7280,#374151)'},
    {name:'Social Media',  emoji:'📱', bg:'linear-gradient(135deg,#ec4899,#8b5cf6)'},
    {name:'Product Launch',emoji:'🚀', bg:'linear-gradient(135deg,#3e7bfa,#7c3aed)'},
    {name:'Content Cal.',  emoji:'📅', bg:'linear-gradient(135deg,#f59e0b,#ef4444)'},
    {name:'Client Onboard',emoji:'🤝', bg:'linear-gradient(135deg,#10b981,#0ea5e9)'},
    {name:'Event',         emoji:'🎉', bg:'linear-gradient(135deg,#d946ef,#f59e0b)'},
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
  var darkMode=localStorage.getItem('cb-dark')==='1';

  // ── helpers ──────────────────────────────────────────────────────────────
  function esc(s){return (s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function api(path,opts){
    return fetch(path,opts).then(function(r){
      return r.text().then(function(t){
        var body=null;
        if(t){try{body=JSON.parse(t);}catch(_e){body=null;}}
        if(!r.ok){
          var e=new Error(body&&body.error?body.error:('HTTP '+r.status));
          e.status=r.status; e.body=body;
          if(r.status===401){
            appStarted=false;
            applySessionUser(null);
            openAuthModal('Session expired. Sign in again.');
          }
          throw e;
        }
        return body;
      });
    });
  }
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
      +'<span style="font-family:&quot;JetBrains Mono&quot;,monospace;font-size:11px;font-weight:600;color:var(--accent);width:32px;text-align:right;">'+pct+'%</span>'
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

  function roleFromApi(role){
    if(role==='manager') return 'mgr';
    if(role==='employee') return 'emp';
    if(role==='client') return 'client';
    return 'ceo';
  }
  function roleLabel(role){
    if(role==='manager') return 'Manager';
    if(role==='employee') return 'Employee';
    if(role==='client') return 'Client';
    if(role==='agent') return 'AI Agent';
    return 'CEO';
  }
  function updateSessionUi(){
    var n=document.getElementById('session-user-name');
    var r=document.getElementById('session-user-role');
    var lo=document.getElementById('logout-btn');
    var loTop=document.getElementById('topbar-logout-btn');
    if(me){
      if(n) n.textContent=me.name||me.userId||'User';
      if(r) r.textContent=(roleLabel(me.role)||'Member')+(me.email?' · '+me.email:'');
      if(lo) lo.style.display='inline-flex';
      if(loTop) loTop.style.display='inline-flex';
    }else{
      if(n) n.textContent='Guest';
      if(r) r.textContent='not signed in';
      if(lo) lo.style.display='none';
      if(loTop) loTop.style.display='none';
    }
  }
  function applySessionUser(user){
    me=user||null;
    if(me&&me.role) activeRole=roleFromApi(me.role);
    updateSessionUi();
  }
  function populateAuthUsers(users){
    authUsers=users||[];
    var sel=document.getElementById('auth-user');
    if(!sel) return;
    if(!authUsers.length){
      sel.innerHTML='<option value="user_local">user_local</option>';
      return;
    }
    sel.innerHTML=authUsers.map(function(u){
      var lbl=(u.name||u.userId)+' · '+roleLabel(u.role||'employee');
      return '<option value="'+esc(u.userId)+'">'+esc(lbl)+'</option>';
    }).join('');
  }
  function openAuthModal(msg){
    var m=document.getElementById('auth-modal');
    if(!m) return;
    var err=document.getElementById('auth-error');
    if(err){
      if(msg){err.style.display='block';err.textContent=msg;}
      else{err.style.display='none';err.textContent='';}
    }
    m.classList.add('open');
    var key=document.getElementById('auth-key');
    if(key) setTimeout(function(){key.focus();},20);
  }
  function closeAuthModal(){
    var m=document.getElementById('auth-modal');
    if(m) m.classList.remove('open');
    var err=document.getElementById('auth-error');
    if(err){err.style.display='none';err.textContent='';}
    var key=document.getElementById('auth-key');
    if(key) key.value='';
  }
  function loginWithKey(){
    var sel=document.getElementById('auth-user');
    var key=document.getElementById('auth-key');
    var btn=document.getElementById('auth-login-btn');
    var uid=sel&&sel.value||'';
    var accessKey=key&&key.value||'';
    if(!uid){openAuthModal('Select a user');return;}
    if(!accessKey){openAuthModal('Access key is required');return;}
    if(btn){btn.disabled=true;btn.textContent='Signing in…';}
    post('/api/auth/login',{userId:uid,key:accessKey}).then(function(res){
      applySessionUser(res&&res.user?res.user:null);
      closeAuthModal();
      startApp();
    }).catch(function(e){
      openAuthModal(e&&e.message?e.message:'Invalid credentials');
    }).finally(function(){
      if(btn){btn.disabled=false;btn.textContent='Sign in';}
    });
  }
  function ensureSession(){
    return api('/api/auth/me').then(function(s){
      if(s&&s.authenticated&&s.user){
        applySessionUser(s.user);
        return true;
      }
      return api('/api/auth/users').then(function(info){
        populateAuthUsers(info&&info.users||[]);
        applySessionUser(null);
        openAuthModal();
        return false;
      }).catch(function(){
        populateAuthUsers([]);
        applySessionUser(null);
        openAuthModal('Could not load users. Try again.');
        return false;
      });
    });
  }
  function startApp(){
    if(appStarted) return;
    appStarted=true;
    buildNav();
    render();
    loadNotifications();
    setupSSE();
  }
  function logoutSession(){
    post('/api/auth/logout').catch(function(){}).then(function(){
      appStarted=false;
      applySessionUser(null);
      ensureSession().then(function(ok){ if(ok) startApp(); });
    });
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
  function applyDark(on){
    darkMode=on;
    document.documentElement.dataset.theme=on?'dark':'light';
    localStorage.setItem('cb-dark',on?'1':'0');
    var lbl=document.getElementById('dark-toggle-label');
    if(lbl) lbl.textContent=on?'Light mode':'Dark mode';
  }
  applyDark(darkMode);
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
  var dtBtn=document.getElementById('dark-toggle-btn');
  var dtBtnTop=document.getElementById('topbar-dark-toggle');
  if(dtBtn) dtBtn.onclick=function(){applyDark(!darkMode);};
  if(dtBtnTop) dtBtnTop.onclick=function(){applyDark(!darkMode);};

  // ── nav ───────────────────────────────────────────────────────────────────
  var BOT_TABS=['loops','tasks','leads','projects','agents'];
  var MORE_TABS=['team','brain','reports','settings','events'];
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
    buildBotNav();
    var rc=document.getElementById('role-chips');
    if(rc) rc.querySelectorAll('.role-chip').forEach(function(c){
      c.classList.toggle('on',c.dataset.role===activeRole);
      c.onclick=function(){activeRole=c.dataset.role;buildNav();if(tab==='loops') loadLoops();};
    });
  }
  function buildBotNav(){
    var bn=document.getElementById('botnav');
    if(bn){
      var tabsToShow=TABS.filter(function(t){return BOT_TABS.indexOf(t.id)>=0;});
      bn.innerHTML=tabsToShow.map(function(t){return '<button data-tab="'+t.id+'" class="'+(t.id===tab?'on':'')+'"><span class="bn-ic">'+t.ic+'</span>'+t.label+'</button>';}).join('')
        +'<button id="bn-more" class="'+(BOT_TABS.indexOf(tab)>=0?'':'on')+'"><span class="bn-ic">⋯</span>More</button>';
      bn.querySelectorAll('button[data-tab]').forEach(function(b){b.onclick=function(){tab=b.dataset.tab;buildNav();render();};});
      var moreBtn=document.getElementById('bn-more');
      if(moreBtn) moreBtn.onclick=function(){openMoreSheet();};
    }
    document.querySelectorAll('#side-nav .nav-item').forEach(function(el){el.classList.toggle('active',el.dataset.tab===tab);});
  }
  function openMoreSheet(){
    var m=document.getElementById('more-sheet');
    if(!m) return;
    var items=document.getElementById('more-sheet-items');
    var moreTabs=TABS.filter(function(t){return MORE_TABS.indexOf(t.id)>=0;});
    items.innerHTML=moreTabs.map(function(t){return '<button data-tab="'+t.id+'" style="display:flex;align-items:center;gap:12px;padding:12px 10px;border-radius:11px;border:none;background:'+(t.id===tab?'var(--accentSoft)':'transparent')+';color:'+(t.id===tab?'var(--accent)':'var(--text)')+';font-size:14px;font-weight:500;width:100%;cursor:pointer;min-height:48px;"><span style="font-size:20px;">'+t.ic+'</span>'+t.label+'</button>';}).join('');
    items.querySelectorAll('button[data-tab]').forEach(function(b){b.onclick=function(){tab=b.dataset.tab;m.classList.remove('open');buildNav();render();};});
    m.classList.add('open');
    m.onclick=function(e){if(e.target===m)m.classList.remove('open');};
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
    else if(tab==='projects') loadProjects();
    else if(tab==='agents') loadAgents();
    else if(tab==='team')   loadTeam();
    else if(tab==='brain')  loadBrain();
    else if(tab==='reports') loadReports();
    else if(tab==='settings') loadSettings();
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
      +'<div class="role-panel-sub">'+theirs.length+' items in progress. We&#39;ll notify you when something needs your input.</div>'
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
    }).join(''):('<div class="empty-dashed">'+(label==='YOUR COURT'?'Nothing in your court. Clean board.':'No one&#39;s keeping you waiting.')+'</div>');
    return '<div><div class="col-head"><span class="col-dot" style="background:'+dotColor+'"></span><span class="col-label">'+label+'</span><span class="col-count">'+items.length+'</span></div><span class="col-hint">'+hint+'</span>'+cards+'</div>';
  }

  // ── tasks ─────────────────────────────────────────────────────────────────
  function loadTasks(){
    api('/api/tasks').then(function(tasks){
      tasks=tasks||[];
      var today=todayStr();
      var tmr=new Date(); tmr.setDate(tmr.getDate()+1); var tmrStr=tmr.toISOString().slice(0,10);
      function isOverdue(t){return t.day&&t.day<today&&!t.completed;}
      var overdueAll=tasks.filter(isOverdue);
      var todayTasks=tasks.filter(function(t){return t.day===today||(!t.day&&!isOverdue(t));});
      var tmrTasks=tasks.filter(function(t){return t.day===tmrStr;});
      var upcomingTasks=tasks.filter(function(t){return t.day&&t.day>tmrStr;});
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Tasks</div><div class="sec-sub">Your board — what needs doing and when.</div></div><div class="head-actions"><button class="btn-primary" id="new-task-btn">+ New task</button></div></div>'
        +'<div class="kanban-wrap">'
        +(overdueAll.length?'<div class="overdue-strip"><span class="overdue-strip-count">'+overdueAll.length+'</span><span class="overdue-strip-label">overdue — move them or complete them</span></div>':'')
        +'<div class="kanban-board">'+kanbanCol('TODAY','#ef4444',todayTasks,'today')+kanbanCol('TOMORROW','#f59e0b',tmrTasks,'tomorrow')+kanbanCol('UPCOMING','#3e7bfa',upcomingTasks,'upcoming')+'</div></div>';
      var nt=document.getElementById('new-task-btn'); if(nt) nt.onclick=function(){openNewTaskModal();};
      ['today','tomorrow','upcoming'].forEach(function(d){var btn=document.getElementById('kadd-'+d);if(btn)btn.onclick=function(){openNewTaskModal(d);};});
      view.querySelectorAll('[data-done]').forEach(function(b){b.onclick=function(){post('/api/tasks/'+b.dataset.done+'/complete').then(function(){toast('Task completed');loadTasks();});};});
      view.querySelectorAll('[data-move]').forEach(function(b){b.onclick=function(){post('/api/tasks/'+b.dataset.move+'/move',{day:b.dataset.day}).then(function(){toast('Task moved');loadTasks();});};});
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load tasks: '+(e&&e.message||e)+'</div>';});
  }
  function kanbanCol(label,dotColor,items,colDay){
    var cards=items.length?items.map(function(t){
      var od=t.day&&t.day<todayStr();
      var ds=!od&&isDueSoon(t);
      var pr=t.priority==='high'?'<span class="priority-pill priority-high">HIGH</span>':t.priority==='med'?'<span class="priority-pill priority-med">MED</span>':t.priority==='low'?'<span class="priority-pill priority-low">LOW</span>':'';
      return '<div class="kanban-task-card gc'+(od?' overdue':ds?' due-soon':'')+'"><div class="kanban-task-row"><button class="kanban-check" data-done="'+t.id+'"></button><span class="kanban-task-emoji">'+esc(t.emoji||'📝')+'</span><div style="flex:1;min-width:0;"><div class="kanban-task-title">'+esc(t.title)+'</div><div class="kanban-task-sub">'+esc(t.list||'Inbox')+'</div></div></div><div class="kanban-task-foot">'+pr+(colDay!=='today'?'<button class="btn-ghost" data-move="'+t.id+'" data-day="today" style="font-size:10px;padding:3px 8px;min-height:24px;">→ Today</button>':'')+'</div></div>';
    }).join(''):'<div class="empty-dashed" style="font-size:11px;padding:16px 12px;">No tasks for '+label.toLowerCase()+'.</div>';
    return '<div class="kanban-col"><div class="kanban-col-head"><span class="kanban-col-dot" style="background:'+dotColor+'"></span><span class="kanban-col-label">'+label+'</span><span class="kanban-col-count">'+items.length+'</span></div><div class="kanban-col-body">'+cards+'<button class="kanban-add-btn" id="kadd-'+colDay+'">+ Add</button></div></div>';
  }
  function isDueSoon(t){return t.dueAt&&t.dueAt>Date.now()&&t.dueAt<Date.now()+86400e3;}

  // ── leads ─────────────────────────────────────────────────────────────────
  var LEAD_STAGES=[{id:'new',label:'NEW',dot:'#9ca3af'},{id:'contacted',label:'CONTACTED',dot:'#3e7bfa'},{id:'meeting',label:'MEETING',dot:'#7c3aed'},{id:'proposal',label:'PROPOSAL',dot:'#f59e0b'},{id:'won',label:'WON',dot:'#10b981'},{id:'lost',label:'LOST',dot:'#ef4444'}];
  function loadLeads(){
    api('/api/leads').then(function(leads){
      leads=leads||[];
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Leads</div><div class="sec-sub">Pipeline — move each contact toward a close.</div></div><div class="head-actions"><button class="btn-primary" id="new-lead-btn">+ New lead</button></div></div><div class="pipeline-board">'
        +LEAD_STAGES.map(function(stage){var stageLeads=leads.filter(function(l){return(l.stage||'new')===stage.id;});return '<div class="pipeline-col"><div class="pipeline-col-head"><span class="pipeline-stage-dot" style="background:'+stage.dot+'"></span><span class="pipeline-stage-label">'+stage.label+'</span><span class="pipeline-col-count">'+stageLeads.length+'</span></div><div class="pipeline-col-body">'+(stageLeads.length?stageLeads.map(function(l){var initials=(l.name||'?').trim().split(/\s+/).slice(0,2).map(function(w){return w[0].toUpperCase();}).join('');var hue=((l.name||'A').charCodeAt(0)*37)%360;var canAdv=stage.id!=='won'&&stage.id!=='lost';return '<div class="pipeline-lead-card gc" data-lead-id="'+l.id+'"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><div class="pipeline-lead-avatar" style="background:hsl('+hue+',35%,52%)">'+initials+'</div><div style="flex:1;min-width:0;"><div class="pipeline-lead-name">'+esc(l.name)+'</div>'+(l.company?'<div class="pipeline-lead-sub">'+esc(l.company)+'</div>':'')+'</div></div><div class="pipeline-lead-foot">'+(canAdv?'<button class="plead-adv-btn" data-advance="'+l.id+'">Advance →</button>':'<span class="stage-pill lead-stage-'+stage.id+'">'+stage.label+'</span>')+(l.phone?'<a class="plead-adv-btn" href="https://wa.me/'+esc(l.phone.replace(/[^0-9]/g,''))+'" target="_blank" onclick="event.stopPropagation()">WA</a>':'')+'</div></div>';}).join(''):'<div style="font-size:11px;color:var(--faint);padding:10px 2px;">No leads here.</div>')+'</div></div>';}).join('')+'</div>';
      document.getElementById('new-lead-btn').onclick=function(){openNewLeadModal();};
      view.querySelectorAll('[data-advance]').forEach(function(b){b.onclick=function(e){e.stopPropagation();post('/api/leads/'+b.dataset.advance+'/advance').then(function(){toast('Advanced');loadLeads();});};});
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

  // ── projects ──────────────────────────────────────────────────────────────
  var PROJECT_PALETTES=['linear-gradient(135deg,#3e7bfa,#7c3aed)','linear-gradient(135deg,#10b981,#14b8a6)','linear-gradient(135deg,#f59e0b,#ef4444)','linear-gradient(135deg,#6366f1,#ec4899)','linear-gradient(135deg,#0ea5e9,#06b6d4)','linear-gradient(135deg,#8b5cf6,#d946ef)'];
  var PROJECT_TEMPLATES=[{name:'Blank',emoji:'📄',bg:'linear-gradient(135deg,#6b7280,#374151)'},{name:'Social Media',emoji:'📱',bg:'linear-gradient(135deg,#ec4899,#8b5cf6)'},{name:'Product Launch',emoji:'🚀',bg:'linear-gradient(135deg,#3e7bfa,#7c3aed)'},{name:'Content Cal.',emoji:'📅',bg:'linear-gradient(135deg,#f59e0b,#ef4444)'},{name:'Client Onboard',emoji:'🤝',bg:'linear-gradient(135deg,#10b981,#0ea5e9)'},{name:'Event',emoji:'🎉',bg:'linear-gradient(135deg,#d946ef,#f59e0b)'}];



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
        apWrap.innerHTML='<div style="font-family:\\'JetBrains Mono\\',monospace;font-size:10px;color:var(--faint);letter-spacing:.5px;margin:0 0 10px;">PENDING APPROVALS</div>'
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
      autoWrap.innerHTML='<div style="font-family:\\'JetBrains Mono\\',monospace;font-size:10px;color:var(--faint);letter-spacing:.5px;margin:18px 0 10px;">AUTONOMY SETTINGS</div>'
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
            +'<div class="event-meta" style="margin-top:1px;font-family:\\'JetBrains Mono\\',monospace;font-size:10px;">'+ts+'</div></div>'
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

  function setupSSE(){
    var es;
    try{es=new EventSource('/api/stream');}catch(e){return;}
    es.onmessage=function(ev){
      try{
        var evt=JSON.parse(ev.data);
        if(!evt.type) return;
        var reloadMap={'loop.created':'loops','loop.closed':'loops','loop.snoozed':'loops','task.created':'tasks','task.completed':'tasks','task.moved':'tasks','lead.created':'leads','lead.advanced':'leads','agent.action':'agents'};
        if(reloadMap[evt.type]===tab) render();
        loadNotifications();
      }catch(e){}
    };
  }
  var selectedTemplate=0;
  function loadProjects(){
    var projects=JSON.parse(localStorage.getItem('cb-projects')||'[]');
    var html='<div class="sec-head"><div><div class="sec-title">Projects</div><div class="sec-sub">Everything your team is building.</div></div><div class="head-actions"><button class="btn-primary" id="new-proj-btn">+ New project</button></div></div><div class="bento-grid">';
    projects.forEach(function(p,i){
      var bg=p.bg||PROJECT_PALETTES[i%PROJECT_PALETTES.length];
      var done=p.done||0;var total=p.total||0;
      var pct=total>0?Math.round(done/total*100):0;
      html+='<div class="bento-card'+(i===0?' bento-hero':'')+'" style="background:'+bg+';"><div class="bento-card-emoji">'+esc(p.emoji||'\u{1F4E6}')+'</div><div class="bento-card-name">'+esc(p.name)+'</div>'+(p.desc?'<div class="bento-card-desc">'+esc(p.desc)+'</div>':'')+'<div class="bento-card-foot">'+(total?'<div class="bento-prog-bar"><div class="bento-prog-fill" style="width:'+pct+'%"></div></div><span class="bento-pct">'+pct+'%</span>':'')+'<span class="bento-status">'+esc(p.status||'active')+'</span></div></div>';
    });
    html+='<button class="bento-new-card" id="bento-new-card-btn"><div style="font-size:28px;">+</div><div style="font-size:13px;font-weight:600;">New project</div></button></div>';
    view.innerHTML=html;
    var nbtn=document.getElementById('new-proj-btn');
    var nbtn2=document.getElementById('bento-new-card-btn');
    if(nbtn)nbtn.onclick=openNewProjectModal;
    if(nbtn2)nbtn2.onclick=openNewProjectModal;
  }
  function openNewProjectModal(){
    selectedTemplate=0;
    var m=document.getElementById('proj-modal');
    if(!m)return;
    document.getElementById('proj-modal-name').value='';
    document.getElementById('proj-modal-desc').value='';
    renderTemplateGrid();
    m.classList.add('open');
    document.getElementById('proj-modal-name').focus();
  }
  function closeNewProjectModal(){
    var m=document.getElementById('proj-modal');
    if(m)m.classList.remove('open');
  }
  function renderTemplateGrid(){
    var g=document.getElementById('proj-template-grid');
    if(!g)return;
    g.innerHTML=PROJECT_TEMPLATES.map(function(t,i){return '<div class="proj-tmpl-card'+(i===selectedTemplate?' on':'')+'" data-ti="'+i+'" style="aspect-ratio:3/2;border-radius:10px;display:flex;align-items:flex-end;padding:8px;cursor:pointer;border:2px solid '+(i===selectedTemplate?'var(--accent)':'transparent')+';background:'+t.bg+';transition:all .15s;"><span style="font-size:10.5px;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.4);">'+t.emoji+' '+t.name+'</span></div>';}).join('');
    g.querySelectorAll('.proj-tmpl-card').forEach(function(el){el.onclick=function(){selectedTemplate=parseInt(el.dataset.ti);renderTemplateGrid();};});
  }
  function openNewTaskModal(day){
    var m=document.getElementById('task-modal');
    if(!m)return;
    document.getElementById('task-modal-title').value='';
    document.getElementById('task-modal-when').value=day||'today';
    m.classList.add('open');
    document.getElementById('task-modal-title').focus();
  }
  function closeNewTaskModal(){
    var m=document.getElementById('task-modal');
    if(m)m.classList.remove('open');
  }
  var leadModalData={};
  function openNewLeadModal(){
    leadModalData={};
    var m=document.getElementById('lead-modal');
    if(!m)return;
    ['lead-name','lead-phone','lead-email','lead-company','lead-title','lead-notes'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
    document.getElementById('lead-extracted').style.display='none';
    document.getElementById('lead-upload-area').style.display='block';
    m.classList.add('open');
    document.getElementById('lead-name').focus();
  }
  function closeNewLeadModal(){
    var m=document.getElementById('lead-modal');
    if(m)m.classList.remove('open');
  }
  function showTab(t){
    var isType=t==='type';
    document.getElementById('lead-tab-type').style.background=isType?'var(--surface)':'transparent';
    document.getElementById('lead-tab-type').style.fontWeight=isType?'600':'500';
    document.getElementById('lead-tab-type').style.color=isType?'var(--text)':'var(--muted)';
    document.getElementById('lead-tab-photo').style.background=!isType?'var(--surface)':'transparent';
    document.getElementById('lead-tab-photo').style.fontWeight=!isType?'600':'500';
    document.getElementById('lead-tab-photo').style.color=!isType?'var(--text)':'var(--muted)';
    document.getElementById('lead-type-form').style.display=isType?'block':'none';
    document.getElementById('lead-photo-form').style.display=!isType?'block':'none';
  }
  function processCardFile(file){
    var uploadArea=document.getElementById('lead-upload-area');
    uploadArea.innerHTML='<div style="font-size:13px;color:var(--muted);padding:8px;">Extracting fields...<span class="spin" style="display:inline-block;margin:0 8px;vertical-align:middle;"></span></div>';
    var reader=new FileReader();
    reader.onload=function(e){
      var base64=e.target.result.split(',')[1];
      post('/api/leads/extract-card',{imageBase64:base64}).then(function(data){
        data=data||{};leadModalData=data;
        showTab('type');
        if(data.name)document.getElementById('lead-name').value=data.name;
        if(data.phone)document.getElementById('lead-phone').value=data.phone;
        if(data.email)document.getElementById('lead-email').value=data.email;
        if(data.company)document.getElementById('lead-company').value=data.company;
        if(data.title)document.getElementById('lead-title').value=data.title;
        toast('Card scanned - review and save');
      }).catch(function(){toast('Could not extract - please type details');showTab('type');});
    };
    reader.readAsDataURL(file);
  }
  (function(){
    var m=document.getElementById('task-modal');
    if(m){
      document.getElementById('task-modal-close').onclick=closeNewTaskModal;
      document.getElementById('task-modal-cancel').onclick=closeNewTaskModal;
      m.onclick=function(e){if(e.target===m)closeNewTaskModal();};
      document.getElementById('task-modal-save').onclick=function(){
        var title=document.getElementById('task-modal-title').value.trim();
        if(!title)return;
        var day=document.getElementById('task-modal-when').value;
        var priority=document.getElementById('task-modal-priority').value;
        var list=document.getElementById('task-modal-list').value.trim();
        post('/api/tasks',{title:title,day:day,priority:priority||undefined,list:list||undefined}).then(function(){closeNewTaskModal();toast('Task added');loadTasks();});
      };
    }
    var ml=document.getElementById('lead-modal');
    if(ml){
      document.getElementById('lead-modal-close').onclick=closeNewLeadModal;
      document.getElementById('lead-modal-cancel').onclick=closeNewLeadModal;
      ml.onclick=function(e){if(e.target===ml)closeNewLeadModal();};
      document.getElementById('lead-tab-type').onclick=function(){showTab('type');};
      document.getElementById('lead-tab-photo').onclick=function(){showTab('photo');};
      var uploadArea=document.getElementById('lead-upload-area');
      var fileInput=document.getElementById('lead-card-file');
      if(uploadArea){uploadArea.onclick=function(){fileInput.click();};uploadArea.ondragover=function(e){e.preventDefault();uploadArea.style.borderColor='var(--accent)';};uploadArea.ondrop=function(e){e.preventDefault();uploadArea.style.borderColor='';if(e.dataTransfer.files[0])processCardFile(e.dataTransfer.files[0]);};}
      if(fileInput)fileInput.onchange=function(){if(fileInput.files[0])processCardFile(fileInput.files[0]);};
      document.getElementById('lead-modal-save').onclick=function(){
        var name=document.getElementById('lead-name').value.trim();
        if(!name){document.getElementById('lead-name').focus();return;}
        post('/api/leads',{name:name,phone:document.getElementById('lead-phone').value.trim()||undefined,email:document.getElementById('lead-email').value.trim()||undefined,company:document.getElementById('lead-company').value.trim()||undefined,title:document.getElementById('lead-title').value.trim()||undefined,what:document.getElementById('lead-notes').value.trim()||undefined}).then(function(){closeNewLeadModal();toast('Lead created');loadLeads();});
      };
    }
    var mp=document.getElementById('proj-modal');
    if(mp){
      document.getElementById('proj-modal-close').onclick=closeNewProjectModal;
      document.getElementById('proj-modal-cancel').onclick=closeNewProjectModal;
      mp.onclick=function(e){if(e.target===mp)closeNewProjectModal();};
      document.getElementById('proj-modal-save').onclick=function(){
        var name=document.getElementById('proj-modal-name').value.trim();
        if(!name)return;
        var tmpl=PROJECT_TEMPLATES[selectedTemplate];
        var projects=JSON.parse(localStorage.getItem('cb-projects')||'[]');
        projects.unshift({id:Date.now().toString(),name:name,desc:document.getElementById('proj-modal-desc').value.trim(),emoji:tmpl.emoji,bg:tmpl.bg,status:'active',done:0,total:0,createdAt:Date.now()});
        localStorage.setItem('cb-projects',JSON.stringify(projects));
        closeNewProjectModal();
        toast('Project created');
        loadProjects();
      };
    }
    var am=document.getElementById('auth-modal');
    if(am){
      var keyInput=document.getElementById('auth-key');
      var loginBtn=document.getElementById('auth-login-btn');
      if(loginBtn) loginBtn.onclick=loginWithKey;
      if(keyInput) keyInput.onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();loginWithKey();}};
    }
    var lo=document.getElementById('logout-btn');
    if(lo) lo.onclick=function(){logoutSession();};
    var loTop=document.getElementById('topbar-logout-btn');
    if(loTop) loTop.onclick=function(){logoutSession();};
  })();
  var teamView='ceo';
  function loadTeam(){
    var subViews=[{id:'ceo',label:'CEO'},{id:'mgr',label:'Manager'},{id:'emp',label:'Employee'},{id:'client',label:'Client'},{id:'agents',label:'AI Agents'}];
    var html='<div class="sec-head"><div><div class="sec-title">Team</div><div class="sec-sub">Switch role to see the world from any seat.</div></div></div>';
    html+='<div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:20px;background:var(--bg2);border:1px solid var(--glassBorder);border-radius:12px;padding:3px;width:fit-content;">'+subViews.map(function(sv){return '<button class="team-sv-btn'+(sv.id===teamView?' on':'')+'" data-sv="'+sv.id+'" style="padding:7px 14px;border-radius:9px;border:none;background:'+(sv.id===teamView?'var(--surface)':'transparent')+';font-size:12.5px;font-weight:'+(sv.id===teamView?'600':'500')+';color:'+(sv.id===teamView?'var(--text)':'var(--muted)')+';min-height:36px;cursor:pointer;box-shadow:'+(sv.id===teamView?'var(--shadow-md)':'none')+';">'+sv.label+'</button>';}).join('')+'</div>';
    if(teamView==='ceo'){
      html+='<div class="kpi-grid">'+['Revenue pipeline','Team velocity','Open loops','Agent ROI'].map(function(l,i){var vals=['\u20B924L','87%','14','4.2x'];var cols=['var(--green)','var(--accent)','var(--amber)','var(--teal)'];return '<div class="kpi-card gc"><div class="kpi-val" style="color:'+cols[i]+'">'+vals[i]+'</div><div class="kpi-lbl">'+l+'</div></div>';}).join('')+'</div>'
        +'<div class="gc" style="padding:18px 20px;border-radius:16px;margin-bottom:16px;"><div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin-bottom:12px;">TEAM MEMBERS</div>'
        +['James (CEO)','Priya (Manager)','Alex (Dev)','Sam (Design)','Dana (Client)'].map(function(m,i){var colors=['#3e7bfa','#14b8a6','#f59e0b','#ef4444','#7c3aed'];var ld=[2,5,3,1,0][i];return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--glassBorder);"><div style="width:36px;height:36px;border-radius:50%;background:'+colors[i]+';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;">'+m.charAt(0)+'</div><div style="flex:1;"><div style="font-size:13px;font-weight:600;">'+m+'</div><div style="font-size:11px;color:var(--muted);margin-top:2px;">'+ld+' open loops</div></div><div style="font-family:\\'JetBrains Mono\\',monospace;font-size:12px;font-weight:600;color:var(--accent);">'+[8,12,7,5,2][i]+' done</div></div>';}).join('')+'</div>';
    }else if(teamView==='mgr'){
      html+='<div class="gc" style="padding:18px 20px;border-radius:16px;"><div style="font-size:14px;font-weight:700;margin-bottom:14px;">Workload overview</div>'
        +['Alex - 7 tasks','Sam - 5 tasks','Dana - 3 tasks'].map(function(m,i){var pct=[70,50,30][i];return '<div style="margin-bottom:14px;"><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px;"><span>'+m+'</span><span style="color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;">'+pct+'%</span></div><div style="height:5px;border-radius:5px;background:var(--bg2);overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:var(--accent);border-radius:5px;"></div></div></div>';}).join('')+'</div>';
    }else if(teamView==='emp'){
      html+='<div class="gc" style="padding:18px 20px;border-radius:16px;"><div style="font-size:15px;font-weight:700;margin-bottom:4px;">Your day</div><div style="font-size:12.5px;color:var(--muted);margin-bottom:16px;">3 tasks due today - 1 overdue</div><div style="font-size:13px;color:var(--text);line-height:1.6;">Focus: complete overdue task first, then today&#39;s list. You&#39;re on track.</div></div>';
    }else if(teamView==='client'){
      html+='<div class="gc" style="padding:18px 20px;border-radius:16px;border-left:3px solid var(--teal);"><div style="font-size:11px;font-weight:700;color:var(--teal);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin-bottom:8px;">CLIENT PORTAL - READ ONLY</div><div style="font-size:15px;font-weight:700;margin-bottom:4px;">Your project</div><div style="font-size:12.5px;color:var(--muted);">3 deliverables in progress - 1 ready for review</div><div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--glassBorder);display:flex;gap:20px;"><div><div style="font-family:\\'JetBrains Mono\\',monospace;font-size:20px;font-weight:700;color:var(--teal);">3</div><div style="font-size:11px;color:var(--muted);margin-top:3px;">in progress</div></div><div><div style="font-family:\\'JetBrains Mono\\',monospace;font-size:20px;font-weight:700;color:var(--green);">1</div><div style="font-size:11px;color:var(--muted);margin-top:3px;">for review</div></div><div><div style="font-family:\\'JetBrains Mono\\',monospace;font-size:20px;font-weight:700;color:var(--faint);">0</div><div style="font-size:11px;color:var(--muted);margin-top:3px;">delivered</div></div></div></div>';
    }else{
      loadAgents();return;
    }
    view.innerHTML=html;
    view.querySelectorAll('[data-sv]').forEach(function(b){b.onclick=function(){teamView=b.dataset.sv;loadTeam();};});
  }
  var BRAIN_ENTRIES=[
    {tag:'Sensitivity', text:'Stopped flagging invoice confirmation emails as open loops after 3 corrections.', when:Date.now()-86400e3*2},
    {tag:'Channel', text:'Linked WhatsApp group "Project Alpha" to project #P-004 based on recurring mentions.', when:Date.now()-86400e3*4},
    {tag:'People', text:'Recognised that "the client" in Slack usually refers to Dana Carter - auto-linking applied.', when:Date.now()-86400e3*7},
    {tag:'Loop pattern', text:'Emails from noreply@github.com marked as non-actionable by default.', when:Date.now()-86400e3*10},
    {tag:'Autonomy', text:'Confidence threshold raised from 70% to 85% for auto-creating tasks.', when:Date.now()-86400e3*14},
  ];
  function loadBrain(){
    var html='<div class="sec-head"><div><div class="sec-title">Company Brain</div><div class="sec-sub">What the AI has learned - and why. Every change is correctable.</div></div></div><div style="position:relative;padding-left:20px;"><div style="position:absolute;left:7px;top:6px;bottom:0;width:2px;background:var(--glassBorder);border-radius:2px;"></div>'
      +BRAIN_ENTRIES.map(function(e){return '<div style="position:relative;padding:0 0 20px 20px;"><div style="position:absolute;left:-14px;top:5px;width:10px;height:10px;border-radius:50%;background:var(--accent);border:2px solid var(--surface);box-shadow:0 0 0 3px var(--accentSoft);"></div><div style="display:inline-block;font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:5px;background:var(--accentSoft);color:var(--accent);font-family:\\'JetBrains Mono\\',monospace;margin-bottom:5px;">'+esc(e.tag)+'</div><div style="font-size:13px;color:var(--text);line-height:1.5;">'+esc(e.text)+'</div><div style="font-size:10px;color:var(--faint);margin-top:4px;font-family:\\'JetBrains Mono\\',monospace;">'+ago(e.when)+' ago</div><button style="margin-top:6px;font-size:10.5px;color:var(--red);background:transparent;border:none;cursor:pointer;padding:0;" onclick="toast(\\'Correction saved. Brain will re-learn.\\')">\u21A9 Correct this</button></div>';}).join('')+'</div>';
    view.innerHTML=html;
  }
  function loadReports(){
    var month=new Date().toLocaleDateString([],{month:'long', year:'numeric'});
    var html='<div class="sec-head"><div><div class="sec-title">Reports</div><div class="sec-sub">Monthly recap - company, team, and agent performance.</div></div></div><div style="padding:20px;border-radius:16px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;margin-bottom:16px;"><div style="font-family:\\'JetBrains Mono\\',monospace;font-size:10px;opacity:.8;letter-spacing:.5px;text-transform:uppercase;">'+month+'</div><div style="font-size:18px;font-weight:700;margin-top:6px;">Strong month - 94% of loops closed on time.</div><div style="font-size:12.5px;opacity:.85;margin-top:4px;">Leads pipeline grew 32% - 2 new agents deployed.</div></div>'
      +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:9px;margin-bottom:16px;">'+[['142','Loops closed'],['38','Tasks done'],['12','Leads added'],['4.2x','Agent ROI']].map(function(s){return '<div class="gc" style="padding:14px 15px;border-radius:13px;"><div style="font-family:\\'JetBrains Mono\\',monospace;font-size:22px;font-weight:700;color:var(--accent);">'+s[0]+'</div><div style="font-size:11px;color:var(--muted);margin-top:5px;">'+s[1]+'</div></div>';}).join('')+'</div>'
      +'<div class="gc" style="padding:16px 18px;border-radius:16px;"><div style="font-size:12px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin-bottom:12px;">LEADERBOARD</div>'
      +['James','Priya','Alex','Sam'].map(function(n,i){var scores=[42,38,31,26];var medals=['\u{1F947}','\u{1F948}','\u{1F949}',''];return '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--glassBorder);"><span style="font-family:\\'JetBrains Mono\\',monospace;font-size:11px;font-weight:700;color:var(--faint);min-width:18px;">'+(i+1)+'</span><span style="font-size:16px;">'+medals[i]+'</span><span style="font-size:13px;font-weight:600;flex:1;">'+n+'</span><span style="font-family:\\'JetBrains Mono\\',monospace;font-size:12px;font-weight:600;color:var(--accent);">'+scores[i]+' pts</span></div>';}).join('')+'</div>';
    view.innerHTML=html;
  }
  function loadSettings(){
    Promise.all([api('/api/autonomy'),api('/api/approvals'),api('/api/connections')]).then(function(res){
      var settings=res[0]||{};
      var approvals=(res[1]||[]).filter(function(a){return a.status==='pending';});
      var conns=res[2]||{};
      var channels=[
        {name:'Gmail',icon:'\u{1F4E7}',key:'email',status:conns.channels?'webhook ready':'not configured'},
        {name:'Calendar',icon:'\u{1F4C5}',key:'calendar',status:'webhook ready'},
        {name:'Slack',icon:'\u{1F4AC}',key:'slack',status:'webhook ready'},
        {name:'GitHub',icon:'\u{1F419}',key:'github',status:'webhook ready'},
        {name:'Telegram',icon:'\u{2708}\uFE0F',key:'telegram',status:'webhook ready'},
        {name:'WhatsApp',icon:'\u{1F4F1}',key:'whatsapp',status:conns.whatsapp?conns.whatsapp.outbound:'not configured'},
      ];
      var html='<div class="sec-head"><div><div class="sec-title">Settings</div><div class="sec-sub">Autonomy, channels, and personalisation.</div></div></div>';
      html+='<div style="padding:16px 18px;border-radius:14px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.18);display:flex;align-items:center;gap:12px;margin-bottom:20px;"><div style="flex:1;"><div style="font-size:14px;font-weight:700;color:var(--red);">Kill switch</div><div style="font-size:12px;color:var(--red);opacity:.7;margin-top:2px;">Pause ALL autonomous actions immediately.</div></div><button class="btn-danger" onclick="toast(\\'All autonomous actions paused.\\')">Pause all</button></div>';
      if(approvals.length){
        html+='<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin-bottom:8px;">PENDING APPROVALS ('+approvals.length+')</div>'
          +approvals.map(function(ap){return '<div class="gc" style="padding:12px 14px;border-radius:13px;display:flex;align-items:center;gap:10px;margin-bottom:7px;"><div style="flex:1;"><div style="font-size:13px;font-weight:600;">'+esc(ap.title)+'</div><div style="font-family:\\'JetBrains Mono\\',monospace;font-size:10.5px;color:var(--faint);margin-top:2px;">'+esc(ap.action)+'</div></div><button class="approve-btn ok" data-approve="'+ap.id+'">Approve</button><button class="approve-btn no" data-dismiss="'+ap.id+'" style="margin-left:5px;">Dismiss</button></div>';}).join('');
      }
      html+='<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin:16px 0 8px;">AUTONOMY</div>'
        +ACTIONS.map(function(a){var cur=settings[a.k]||'off';return '<div class="gc auto-card" style="padding:14px 16px;border-radius:14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;"><div style="flex:1;min-width:160px;"><div style="font-size:13.5px;font-weight:600;">'+a.label+'</div><div style="font-size:11.5px;color:var(--muted);margin-top:3px;">'+a.desc+'</div></div><div class="lvls">'+['off','ask','auto'].map(function(lv){return '<button class="lvl'+(lv===cur?' on':'')+'" data-act="'+a.k+'" data-lvl="'+lv+'">'+(lv.charAt(0).toUpperCase()+lv.slice(1))+'</button>';}).join('')+'</div></div>';}).join('');
      html+='<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin:16px 0 8px;">CHANNEL CONNECTIONS</div>'
        +channels.map(function(c){var ok=c.status&&c.status!=='not configured';return '<div class="gc" style="padding:12px 14px;border-radius:12px;display:flex;align-items:center;gap:11px;margin-bottom:7px;"><div style="width:34px;height:34px;border-radius:10px;background:var(--bg2);border:1px solid var(--glassBorder);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">'+c.icon+'</div><div style="flex:1;"><div style="font-size:13.5px;font-weight:600;">'+c.name+'</div><div style="font-size:11px;color:var(--muted);margin-top:2px;">'+esc(c.status)+'</div></div><span style="font-size:10px;font-weight:600;padding:3px 9px;border-radius:6px;background:'+(ok?'var(--greenSoft)':'var(--amberSoft)')+';color:'+(ok?'var(--green)':'var(--amber)')+';">'+(ok?'Active':'Setup needed')+'</span></div>';}).join('');
      html+='<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin:16px 0 8px;">APPEARANCE</div>'
        +'<div class="gc" style="padding:14px 16px;border-radius:14px;display:flex;align-items:center;gap:12px;margin-bottom:8px;"><div style="flex:1;"><div style="font-size:13.5px;font-weight:600;">Dark mode</div><div style="font-size:11.5px;color:var(--muted);margin-top:3px;">Switch between light and dark interface.</div></div><button class="btn-ghost" id="settings-dark-toggle">'+(darkMode?'Switch to light':'Switch to dark')+'</button></div>'
        +'<div style="font-size:11.5px;color:var(--muted);margin-bottom:8px;">Wallpaper</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">'
        +THEMES.map(function(t){return '<div style="cursor:pointer;" onclick="applyTheme(\\''+t.id+'\\')"><div style="aspect-ratio:3/2;border-radius:10px;background:'+t.swatch+';border:2px solid '+(activeTheme===t.id?'var(--accent)':'transparent')+';transition:all .15s;"></div><div style="text-align:center;font-size:10px;color:var(--muted);margin-top:4px;">'+t.label+'</div></div>';}).join('')+'</div>';
      view.innerHTML=html;
      var std=document.getElementById('settings-dark-toggle');
      if(std)std.onclick=function(){applyDark(!darkMode);loadSettings();};
      view.querySelectorAll('.lvl').forEach(function(b){b.onclick=function(){post('/api/autonomy',{action:b.dataset.act,level:b.dataset.lvl},'PUT').then(function(){toast('Saved');loadSettings();});};});
      view.querySelectorAll('[data-approve]').forEach(function(b){b.onclick=function(){post('/api/approvals/'+b.dataset.approve+'/approve').then(function(){toast('Approved');loadSettings();});};});
      view.querySelectorAll('[data-dismiss]').forEach(function(b){b.onclick=function(){post('/api/approvals/'+b.dataset.dismiss+'/dismiss').then(function(){toast('Dismissed');loadSettings();});};});
    });
  }

  // ── boot ──────────────────────────────────────────────────────────────────
  updateSessionUi();
  ensureSession().then(function(ok){
    if(ok) startApp();
  }).catch(function(e){
    showErr(e);
  });
  } catch(e) { showErr(e); }
})();
</script>
</body>
</html>`;
}
