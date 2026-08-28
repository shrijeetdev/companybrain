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
  --bg:#eef1f8; --bg2:#e4e8f1;
  --surface:rgba(255,255,255,.72); --surface2:rgba(255,255,255,.5);
  --glass:rgba(255,255,255,.65); --glassThin:rgba(255,255,255,.5);
  --glassBorder:rgba(255,255,255,.6); --glassHi:rgba(255,255,255,.9);
  --glassShadow:rgba(82,99,140,.12);
  --text:#0f172a; --muted:#5b6478; --faint:#8b95a8;
  --accent:#3b6ff6; --accent2:#6c5ce7;
  --accentSoft:rgba(59,111,246,.1); --accentGlow:rgba(59,111,246,.35);
  --blue:#3b6ff6; --blue2:#5b93ff; --blueSoft:rgba(59,111,246,.15);
  --green:#00b894; --greenSoft:rgba(0,184,148,.12);
  --amber:#fdcb6e; --amberSoft:rgba(253,203,110,.16);
  --red:#ff6b81; --redSoft:rgba(255,107,129,.12);
  --teal:#00cec9; --tealSoft:rgba(0,206,201,.12);
  --violet:#a29bfe; --violetSoft:rgba(162,155,254,.14);
  --pink:#fd79a8; --pinkSoft:rgba(253,121,168,.12);
  --scroll:rgba(82,99,140,.2);
  --shadow:0 2px 8px rgba(82,99,140,.08),0 8px 24px rgba(82,99,140,.06);
  --shadow-md:0 4px 12px rgba(82,99,140,.1),0 12px 32px rgba(82,99,140,.08);
  --shadow-lg:0 12px 40px rgba(82,99,140,.18),0 24px 60px rgba(82,99,140,.12);
  --shadow-glow:0 0 0 1px rgba(255,255,255,.4),0 8px 28px var(--accentGlow);
  --nav-w:240px;
  --grad-accent:linear-gradient(135deg,#3b6ff6 0%,#6c5ce7 100%);
  --grad-accent2:linear-gradient(135deg,#6c5ce7 0%,#a29bfe 100%);
  --grad-surface:linear-gradient(135deg,rgba(255,255,255,.9) 0%,rgba(255,255,255,.6) 100%);
  --grad-glass:linear-gradient(135deg,rgba(255,255,255,.7) 0%,rgba(255,255,255,.4) 100%);
  --b1c:rgba(59,111,246,.22); --b2c:rgba(108,92,231,.18); --b3c:rgba(0,206,201,.14);
  --m1c:rgba(59,111,246,.14); --m2c:rgba(108,92,231,.12); --m3c:rgba(0,184,148,.1);
}
[data-theme="dark"] {
  --bg:#06070d; --bg2:#0d0f1a;
  --surface:rgba(22,24,38,.55); --surface2:rgba(255,255,255,.05);
  --glass:rgba(22,24,38,.6); --glassThin:rgba(13,15,26,.55);
  --glassBorder:rgba(255,255,255,.12); --glassHi:rgba(255,255,255,.16);
  --glassShadow:rgba(0,0,0,.4);
  --text:#eef1f8; --muted:#8b95a8; --faint:#5b6478;
  --scroll:rgba(180,180,220,.18);
  --shadow:0 4px 16px rgba(0,0,0,.4);
  --shadow-md:0 8px 24px rgba(0,0,0,.5);
  --shadow-lg:0 12px 40px rgba(0,0,0,.6),0 24px 60px rgba(0,0,0,.4);
  --shadow-glow:0 0 0 1px rgba(255,255,255,.08),0 8px 32px var(--accentGlow);
  --grad-accent:linear-gradient(135deg,#3b6ff6 0%,#6c5ce7 100%);
  --grad-accent2:linear-gradient(135deg,#6c5ce7 0%,#a29bfe 100%);
  --grad-surface:linear-gradient(135deg,rgba(40,44,68,.6) 0%,rgba(22,24,38,.5) 100%);
  --grad-glass:linear-gradient(135deg,rgba(30,33,52,.6) 0%,rgba(22,24,38,.45) 100%);
  --b1c:rgba(59,111,246,.42); --b2c:rgba(108,92,231,.36); --b3c:rgba(0,206,201,.22);
  --m1c:rgba(59,111,246,.3); --m2c:rgba(108,92,231,.26); --m3c:rgba(0,184,148,.22);
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
html,body{margin:0;padding:0;height:100%;overflow:hidden;}
body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Hanken Grotesk',system-ui,sans-serif;font-size:14px;line-height:1.45;color:var(--text);background:var(--bg);background-image:radial-gradient(at 0% 0%,var(--m1c) 0%,transparent 50%),radial-gradient(at 100% 0%,var(--m2c) 0%,transparent 50%),radial-gradient(at 50% 100%,var(--m3c) 0%,transparent 50%);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
::-webkit-scrollbar{width:8px;height:8px;}
::-webkit-scrollbar-thumb{background:var(--scroll);border-radius:8px;border:2px solid transparent;background-clip:padding-box;}
::-webkit-scrollbar-thumb:hover{background:var(--accent);background-clip:padding-box;}
::-webkit-scrollbar-track{background:transparent;}
input,button,textarea{font-family:inherit;}
input:focus,textarea:focus{outline:none;}
button{cursor:pointer;}
/* H1: keyboard accessibility — visible focus ring on every focusable control. */
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px;}
button:focus-visible,[tabindex="0"]:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
.nav-item:focus-visible,#notif-btn:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;}

@keyframes cbFade{from{opacity:0}to{opacity:1}}
@keyframes cbFadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes cbPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.85)}}
@keyframes cbSpin{to{transform:rotate(360deg)}}
@keyframes cbDrift{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(var(--dx,30px),var(--dy,-24px)) scale(1.12)}}
@keyframes cbMesh{0%{transform:translate(-3%,-2%) scale(1.12) rotate(0deg)}33%{transform:translate(3%,2%) scale(1.22) rotate(4deg)}66%{transform:translate(-2%,3%) scale(1.18) rotate(-3deg)}100%{transform:translate(-3%,-2%) scale(1.12) rotate(0deg)}}
@keyframes cbSlideIn{from{transform:translateX(100%);opacity:0}to{transform:none;opacity:1}}
@keyframes cbSlideUp{from{opacity:0;transform:translate(-50%,14px) scale(.98)}to{opacity:1;transform:translate(-50%,0) scale(1)}}
@keyframes cbGlow{0%,100%{box-shadow:0 0 20px var(--accentGlow)}50%{box-shadow:0 0 36px var(--accentGlow)}}
@keyframes cbShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes cbFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}

#app{position:relative;width:100%;height:100vh;display:flex;flex-direction:column;overflow:hidden;}

/* bg blobs */
#bg-blobs{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;}
.blob{position:absolute;border-radius:50%;filter:blur(60px);}
.blob1{top:-12%;left:8%;width:46%;height:60%;background:radial-gradient(circle,var(--b1c,rgba(59,111,246,.28)),transparent 68%);--dx:40px;--dy:30px;animation:cbDrift 19s ease-in-out infinite;}
.blob2{top:30%;right:-6%;width:42%;height:58%;background:radial-gradient(circle,var(--b2c,rgba(108,92,231,.22)),transparent 68%);--dx:-32px;--dy:26px;animation:cbDrift 23s ease-in-out infinite;}
.blob3{bottom:-16%;left:34%;width:40%;height:52%;background:radial-gradient(circle,var(--b3c,rgba(0,206,201,.16)),transparent 68%);--dx:28px;--dy:-22px;animation:cbDrift 27s ease-in-out infinite;}
.blob4{top:50%;left:50%;width:30%;height:40%;background:radial-gradient(circle,rgba(253,121,168,.1),transparent 68%);--dx:-24px;--dy:30px;animation:cbDrift 31s ease-in-out infinite;}
#mesh{position:absolute;inset:-25%;background:radial-gradient(38% 44% at 24% 28%,var(--m1c,rgba(59,111,246,.22)),transparent 64%),radial-gradient(40% 42% at 78% 26%,var(--m2c,rgba(108,92,231,.18)),transparent 66%),radial-gradient(44% 46% at 62% 82%,var(--m3c,rgba(0,184,148,.18)),transparent 66%);animation:cbMesh 28s ease-in-out infinite;pointer-events:none;}
#grain{position:absolute;inset:0;z-index:6;pointer-events:none;opacity:.025;mix-blend-mode:soft-light;background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E');background-size:170px 170px;}
[data-theme="dark"] #grain{opacity:.05;}

#shell{position:relative;z-index:1;display:flex;flex:1;min-height:0;}

/* sidebar — frosted glass with gradient overlay */
#sidebar{width:var(--nav-w);flex-shrink:0;display:flex;flex-direction:column;padding:18px 14px 16px;gap:2px;border-right:1px solid var(--glassBorder);background:var(--grad-glass),var(--glassThin);backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);box-shadow:inset -1px 0 0 var(--glassBorder),4px 0 24px rgba(82,99,140,.06);}
[data-theme="dark"] #sidebar{box-shadow:inset -1px 0 0 var(--glassBorder),4px 0 32px rgba(0,0,0,.3);}
.logo-row{display:flex;align-items:center;gap:10px;padding:4px 8px 16px;}
.logo-icon{width:34px;height:34px;border-radius:11px;background:var(--grad-accent);display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 6px 18px var(--accentGlow),inset 0 1px 0 rgba(255,255,255,.3);flex-shrink:0;}
.logo-text{font-family:&quot;JetBrains Mono&quot;,monospace;font-weight:700;font-size:15px;letter-spacing:-.4px;}
.logo-text span{background:var(--grad-accent);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}
.logo-sub{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:9px;color:var(--faint);margin-top:3px;letter-spacing:.5px;}
.sidebar-search{padding:0 2px 12px;position:relative;}
.sidebar-search input{width:100%;background:rgba(255,255,255,.5);border:1px solid var(--glassBorder);border-radius:12px;padding:9px 11px 9px 32px;font-size:12.5px;color:var(--text);transition:all .2s;box-shadow:inset 0 1px 2px rgba(82,99,140,.04);}
[data-theme="dark"] .sidebar-search input{background:rgba(255,255,255,.06);}
.sidebar-search input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accentSoft);background:rgba(255,255,255,.7);}
[data-theme="dark"] .sidebar-search input:focus{background:rgba(255,255,255,.08);}
.sidebar-search input::placeholder{color:var(--faint);}
.ss-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);pointer-events:none;opacity:.4;}
.nav-item{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:12px;cursor:pointer;font-size:13px;font-weight:500;color:var(--muted);transition:all .2s cubic-bezier(.4,0,.2,1);user-select:none;min-height:42px;position:relative;width:100%;border:1px solid transparent;background:transparent;font-family:inherit;text-align:left;}
.nav-item:hover{background:rgba(255,255,255,.4);color:var(--text);transform:translateX(2px);}
[data-theme="dark"] .nav-item:hover{background:rgba(255,255,255,.06);}
.nav-item.active{background:var(--accentSoft);color:var(--accent);font-weight:600;box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 4px 14px var(--accentGlow);}
.nav-item.active::before{content:'';position:absolute;left:-14px;top:50%;transform:translateY(-50%);width:3px;height:20px;background:var(--grad-accent);border-radius:0 3px 3px 0;box-shadow:0 0 8px var(--accentGlow);}
.nav-item .ni{width:18px;height:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.nav-badge{margin-left:auto;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--grad-accent);color:#fff;font-size:10px;font-weight:700;font-family:&quot;JetBrains Mono&quot;,monospace;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px var(--accentGlow);}
.sidebar-bot{margin-top:auto;display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--glassBorder);padding-top:12px;}
.agent-status{display:flex;align-items:center;gap:9px;padding:10px 12px;border-radius:12px;background:var(--surface2);border:1px solid var(--glassBorder);transition:all .2s;}
.agent-status:hover{background:rgba(255,255,255,.6);transform:translateY(-1px);}
[data-theme="dark"] .agent-status:hover{background:rgba(255,255,255,.08);}
.agent-dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 10px var(--green),0 0 0 3px rgba(0,184,148,.15);animation:cbPulse 2.4s ease-in-out infinite;}
.agent-label{font-size:11px;font-weight:600;line-height:1.2;}
.agent-sublabel{font-size:9px;color:var(--faint);font-family:&quot;JetBrains Mono&quot;,monospace;margin-top:2px;}
.role-switcher{padding:0 2px;}
.role-sw-label{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:8px;color:var(--faint);letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px;padding:0 9px;}
.role-chips{display:flex;gap:4px;flex-wrap:wrap;padding:0 4px;}
.role-chip{padding:4px 9px;border-radius:8px;border:1px solid var(--glassBorder);background:transparent;font-size:10.5px;font-weight:600;color:var(--faint);cursor:pointer;transition:all .2s;min-height:28px;}
.role-chip.on{background:var(--accentSoft);color:var(--accent);border-color:rgba(59,111,246,.4);box-shadow:0 2px 8px var(--accentGlow);}
.role-chip:hover:not(.on){background:rgba(255,255,255,.06);color:var(--muted);}

/* theme picker */
.theme-picker{position:relative;}
.theme-btn{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:10px;border:1px solid var(--glassBorder);background:transparent;font-size:11px;font-weight:500;color:var(--faint);width:100%;min-height:38px;transition:all .2s;}
.theme-btn:hover{background:var(--bg2);color:var(--text);}
.theme-panel{position:absolute;bottom:calc(100% + 8px);left:0;right:0;background:var(--surface);backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);border:1px solid var(--glassBorder);border-radius:16px;padding:14px 12px;display:none;z-index:50;box-shadow:var(--shadow-lg),inset 0 1px 0 var(--glassHi);}
.theme-panel.open{display:block;animation:cbFadeUp .2s ease;}
.theme-panel-lbl{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:9px;color:var(--faint);letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px;padding:0 2px;}
.theme-swatches{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;}
.theme-swatch{height:32px;border-radius:10px;cursor:pointer;border:2px solid transparent;transition:all .2s;box-shadow:inset 0 1px 0 rgba(255,255,255,.3);}
.theme-swatch:hover{transform:scale(1.06);}
.theme-swatch.on{border-color:var(--accent);box-shadow:0 0 0 2px var(--accentSoft),inset 0 1px 0 rgba(255,255,255,.3);}

/* main */
#main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;}
#topbar{display:none;align-items:center;gap:10px;padding:12px 18px;flex-shrink:0;border-bottom:1px solid var(--glassBorder);background:var(--grad-glass),var(--glassThin);backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);box-shadow:0 4px 20px rgba(82,99,140,.06);}
[data-theme="dark"] #topbar{box-shadow:0 4px 20px rgba(0,0,0,.3);}
#topbar .logo-text{font-size:15px;}
#notif-btn{position:relative;width:42px;height:42px;border-radius:12px;border:1px solid var(--glassBorder);background:rgba(255,255,255,.4);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;margin-left:auto;transition:all .2s;backdrop-filter:blur(10px);padding:0;}
#notif-btn > svg{pointer-events:none;}
[data-theme="dark"] #notif-btn{background:rgba(255,255,255,.06);}
#notif-btn:hover{background:rgba(255,255,255,.7);transform:translateY(-1px);box-shadow:var(--shadow-md);}
[data-theme="dark"] #notif-btn:hover{background:rgba(255,255,255,.12);}
#notif-count{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--red);color:#fff;font-size:9px;font-weight:700;font-family:&quot;JetBrains Mono&quot;,monospace;display:none;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(255,107,129,.5);}
#content{flex:1;overflow-y:auto;min-height:0;padding:28px clamp(16px,4vw,32px) 100px;}
#content>div{max-width:1100px;margin:0 auto;animation:cbFadeUp .35s cubic-bezier(.16,1,.3,1);}

/* notifications panel */
#notif-panel{position:fixed;top:0;right:0;width:360px;height:100%;background:var(--grad-glass),rgba(12,13,24,.94);backdrop-filter:blur(36px) saturate(180%);-webkit-backdrop-filter:blur(36px) saturate(180%);border-left:1px solid var(--glassBorder);z-index:100;transform:translateX(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);overflow-y:auto;padding:22px 18px;box-shadow:-12px 0 40px rgba(0,0,0,.2);}
#notif-panel.open{transform:none;}
.notif-head{display:flex;align-items:center;gap:10px;margin-bottom:20px;}
.notif-title{font-size:16px;font-weight:700;flex:1;letter-spacing:-.3px;}
.notif-close{width:38px;height:38px;border-radius:10px;border:1px solid var(--glassBorder);background:transparent;color:var(--muted);display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;transition:all .2s;}
.notif-close:hover{background:rgba(255,255,255,.06);color:var(--text);}

/* section header */
.sec-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:24px;flex-wrap:wrap;}
.sec-title{font-size:26px;font-weight:800;letter-spacing:-.6px;background:linear-gradient(135deg,var(--text) 0%,var(--muted) 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}
[data-theme="dark"] .sec-title{background:linear-gradient(135deg,#fff 0%,var(--muted) 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}
.sec-sub{font-size:13px;color:var(--muted);margin-top:4px;}
.head-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;}

/* glass card — the hero element. Layered translucency + inner glow. */
.gc{background:var(--grad-surface),var(--surface);border:1px solid var(--glassBorder);box-shadow:var(--shadow),inset 0 1px 0 var(--glassHi);border-radius:18px;backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);transition:transform .2s cubic-bezier(.16,1,.3,1),box-shadow .2s;}
.gc:hover{transform:translateY(-2px);box-shadow:var(--shadow-md),inset 0 1px 0 var(--glassHi);}
[data-theme="dark"] .gc{background:var(--grad-surface),var(--surface);box-shadow:var(--shadow),inset 0 1px 0 var(--glassHi);}

/* ═══ PREMIUM GLASS v2 ═══ layered translucency + specular sweep + tactile depth */
.glass-hero{position:relative;overflow:hidden;background:linear-gradient(135deg,rgba(59,111,246,.14) 0%,rgba(108,92,231,.1) 50%,rgba(0,206,201,.06) 100%),var(--surface);border:1px solid var(--glassBorder);box-shadow:0 8px 32px var(--accentGlow),0 2px 8px rgba(82,99,140,.08),inset 0 1px 0 var(--glassHi),inset 0 0 0 1px rgba(255,255,255,.08);backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);}
[data-theme="dark"] .glass-hero{background:linear-gradient(135deg,rgba(59,111,246,.22) 0%,rgba(108,92,231,.18) 50%,rgba(0,206,201,.08) 100%),var(--surface);box-shadow:0 8px 40px var(--accentGlow),0 2px 12px rgba(0,0,0,.4),inset 0 1px 0 var(--glassHi);}
.glass-hero::before{content:'';position:absolute;top:0;left:-60%;width:60%;height:100%;background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.12) 50%,transparent 70%);animation:cbSweep 7s ease-in-out infinite;pointer-events:none;}
[data-theme="dark"] .glass-hero::before{background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.06) 50%,transparent 70%);}
@keyframes cbSweep{0%,100%{left:-60%}50%{left:120%}}
.glass-premium{position:relative;overflow:hidden;background:var(--grad-surface),var(--surface);box-shadow:var(--shadow-md),inset 0 1px 0 var(--glassHi),inset 0 -1px 0 rgba(82,99,140,.04);backdrop-filter:blur(22px) saturate(180%);-webkit-backdrop-filter:blur(22px) saturate(180%);}
.glass-premium::after{content:'';position:absolute;top:0;left:0;right:0;height:50%;background:linear-gradient(180deg,rgba(255,255,255,.06) 0%,transparent 100%);pointer-events:none;border-radius:18px 18px 0 0;}
[data-theme="dark"] .glass-premium::after{background:linear-gradient(180deg,rgba(255,255,255,.03) 0%,transparent 100%);}
.glass-tile{transition:transform .25s cubic-bezier(.16,1,.3,1),box-shadow .25s,border-color .2s;position:relative;}
.glass-tile:hover{transform:translateY(-3px);box-shadow:0 12px 36px var(--accentGlow),var(--shadow-md),inset 0 1px 0 var(--glassHi);border-color:rgba(59,111,246,.3);}
[data-theme="dark"] .glass-tile:hover{box-shadow:0 12px 40px var(--accentGlow),var(--shadow-md),inset 0 1px 0 var(--glassHi);}
.glass-tile:active{transform:translateY(-1px) scale(.99);}

/* Premium buttons — gradient fill + tactile press */
.btn-glass{background:var(--grad-accent);color:#fff;border:none;font-weight:700;letter-spacing:.2px;box-shadow:0 6px 20px var(--accentGlow),inset 0 1px 0 rgba(255,255,255,.3),inset 0 -2px 0 rgba(0,0,0,.1);transition:all .18s cubic-bezier(.16,1,.3,1);position:relative;overflow:hidden;}
.btn-glass::before{content:'';position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent);transition:left .5s;}
.btn-glass:hover{transform:translateY(-2px);box-shadow:0 10px 28px var(--accentGlow),inset 0 1px 0 rgba(255,255,255,.4),inset 0 -2px 0 rgba(0,0,0,.12);}
.btn-glass:hover::before{left:120%;}
.btn-glass:active{transform:translateY(0) scale(.97);}

/* Glass inputs — focus glow ring */
.input-glass{background:rgba(255,255,255,.5);border:1px solid var(--glassBorder);box-shadow:inset 0 1px 3px rgba(82,99,140,.06);transition:all .2s;}
[data-theme="dark"] .input-glass{background:rgba(255,255,255,.07);}
.input-glass:focus{background:rgba(255,255,255,.7);border-color:var(--accent);box-shadow:0 0 0 4px var(--accentSoft),inset 0 1px 3px rgba(82,99,140,.06);}
[data-theme="dark"] .input-glass:focus{background:rgba(255,255,255,.1);}

/* Skeleton shimmer */
.sk{background:linear-gradient(90deg,var(--bg2) 25%,var(--surface2) 50%,var(--bg2) 75%);background-size:200% 100%;animation:cbShimmer 1.4s linear infinite;border-radius:12px;}
.sk-line{height:14px;margin-bottom:8px;border-radius:7px;}
.sk-line.w60{width:60%;}.sk-line.w40{width:40%;}.sk-line.w80{width:80%;}
.sk-card{height:64px;border-radius:14px;margin-bottom:10px;}

/* Premium toast — dark glass works in both themes; existing #toast .toast-inner already styled above */

/* Mobile: floating + button + bottom nav */
@media(max-width:900px){
  #fab{position:fixed;bottom:78px;right:18px;width:56px;height:56px;border-radius:18px;background:var(--grad-accent);border:none;color:#fff;font-size:28px;font-weight:300;box-shadow:0 8px 24px var(--accentGlow),inset 0 1px 0 rgba(255,255,255,.3);z-index:25;transition:all .2s cubic-bezier(.16,1,.3,1);display:flex;align-items:center;justify-content:center;line-height:1;}
  #fab:hover{transform:translateY(-3px) scale(1.05);box-shadow:0 12px 32px var(--accentGlow);}
  #fab:active{transform:scale(.92);}
}

/* briefing panel */
.brief-card{padding:20px 22px;border-radius:20px;margin-bottom:24px;background:var(--grad-surface),var(--surface);backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);}
.brief-header{display:flex;align-items:center;gap:12px;margin-bottom:14px;}
.brief-brain{width:40px;height:40px;border-radius:13px;background:var(--grad-accent);display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 8px 22px var(--accentGlow),inset 0 1px 0 rgba(255,255,255,.3);flex-shrink:0;animation:cbFloat 4s ease-in-out infinite;}
.brief-label{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:9px;font-weight:700;color:var(--accent);letter-spacing:.8px;text-transform:uppercase;}
.brief-title{font-size:14px;font-weight:600;margin-top:2px;color:var(--text);line-height:1.4;}
.brief-sw{display:flex;gap:2px;margin-left:auto;background:rgba(255,255,255,.06);padding:3px;border-radius:10px;border:1px solid var(--glassBorder);}
.brief-sw-btn{padding:6px 10px;border:none;border-radius:8px;background:transparent;font-size:10px;font-weight:600;color:var(--faint);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.3px;min-height:28px;transition:all .2s;}
.brief-sw-btn.on{background:var(--grad-accent);color:#fff;box-shadow:0 2px 8px var(--accentGlow);}
.brief-stats{display:flex;gap:10px;flex-wrap:wrap;}
.brief-stat{flex:1;min-width:80px;padding:12px 14px;border-radius:13px;background:var(--bg2);border:1px solid var(--glassBorder);transition:all .2s;}
.brief-stat:hover{transform:translateY(-1px);box-shadow:var(--shadow-md);}
[data-theme="dark"] .brief-stat{background:rgba(255,255,255,.04);}
.brief-stat-val{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:20px;font-weight:700;}
.brief-stat-lbl{font-size:10px;color:var(--muted);margin-top:2px;}

/* CEO KPI row */
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(115px,1fr));gap:10px;margin-bottom:20px;}
.kpi-card{padding:14px 15px;border-radius:14px;}
.kpi-val{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:26px;font-weight:700;line-height:1;}
.kpi-lbl{font-size:11px;color:var(--muted);margin-top:7px;}

/* role-specific panels */
.role-panel{padding:18px 20px;border-radius:18px;margin-bottom:20px;border-left:4px solid transparent;border-image:var(--grad-accent) 1;background:var(--grad-surface),var(--surface);}
.role-panel-lbl{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:9px;font-weight:800;background:var(--grad-accent);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:.8px;text-transform:uppercase;margin-bottom:8px;}
.role-panel-title{font-size:15px;font-weight:700;margin-bottom:4px;letter-spacing:-.2px;}
.role-panel-sub{font-size:12.5px;color:var(--muted);line-height:1.55;}
.role-stats{display:flex;gap:20px;margin-top:14px;padding-top:12px;border-top:1px solid var(--glassBorder);}
.role-stat-val{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:20px;font-weight:800;letter-spacing:-.3px;}
.role-stat-lbl{font-size:10px;color:var(--muted);margin-top:3px;font-weight:600;}

/* accountability */
.acct-row{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap;}
.acct-avatar{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:800;color:#fff;border:2px solid var(--glass);box-shadow:0 2px 6px rgba(31,38,135,.18);flex-shrink:0;}
[data-theme="dark"] .acct-avatar{box-shadow:0 2px 6px rgba(0,0,0,.4);}
.acct-stack{display:flex;align-items:center;}
.acct-stack .acct-avatar{margin-left:-8px;transition:transform .15s;}
.acct-stack:hover .acct-avatar{transform:translateY(-2px);}
.acct-stack .acct-avatar:first-child{margin-left:0;}
.acct-txt{font-size:10.5px;color:var(--faint);white-space:nowrap;}
.acct-btn{font-size:10.5px;color:var(--accent);background:transparent;border:none;padding:0;cursor:pointer;font-weight:600;}
.acct-btn:hover{text-decoration:underline;}

/* loop cards */
.loops-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;}
.col-head{display:flex;align-items:center;gap:8px;margin-bottom:5px;padding:0 2px;}
.col-dot{width:9px;height:9px;border-radius:3px;}
.col-label{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;}
.col-count{margin-left:auto;font-family:&quot;JetBrains Mono&quot;,monospace;font-size:12px;color:var(--muted);}
.col-hint{font-size:10.5px;color:var(--faint);display:block;margin:-2px 0 10px 17px;}
.loop-card{display:flex;align-items:flex-start;gap:12px;padding:15px 17px;border-radius:15px;margin-bottom:10px;animation:cbFadeUp .3s ease both;transition:transform .2s cubic-bezier(.16,1,.3,1),box-shadow .2s,border-color .2s;}
.loop-card:hover{transform:translateY(-2px);box-shadow:var(--shadow-md),inset 0 1px 0 var(--glassHi),0 8px 24px var(--accentGlow);border-color:rgba(59,111,246,.25);}
.loop-card .check-btn{width:24px;height:24px;border-radius:50%;border:2px solid rgba(120,120,160,.4);background:transparent;flex-shrink:0;margin-top:1px;transition:all .2s;min-height:24px;}
.loop-card .check-btn:hover{border-color:var(--green);background:rgba(0,184,148,.12);transform:scale(1.1);}
.loop-info{flex:1;min-width:0;}
.loop-title-row{display:flex;align-items:flex-start;gap:8px;margin-bottom:4px;}
.loop-title-row .loop-title{flex:1;min-width:0;}
.loop-title{font-size:14.5px;font-weight:700;line-height:1.35;letter-spacing:-.1px;}
.loop-meta{font-size:12px;color:var(--muted);margin-top:3px;}
.loop-chan{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:10px;font-weight:700;letter-spacing:.5px;color:var(--faint);text-transform:uppercase;}
.loop-actions{display:flex;align-items:center;gap:16px;margin-top:11px;}
.age-pill{font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:8px;white-space:nowrap;flex-shrink:0;letter-spacing:.3px;}
.age-fresh{background:var(--greenSoft);color:var(--green);box-shadow:0 1px 3px rgba(0,184,148,.15);}
.age-mid{background:var(--amberSoft);color:var(--amber);box-shadow:0 1px 3px rgba(253,203,110,.15);}
.age-old{background:var(--redSoft);color:var(--red);box-shadow:0 1px 3px rgba(255,107,129,.15);}
.link-btn{font-size:11.5px;font-weight:600;color:var(--muted);background:transparent;border:none;padding:0;cursor:pointer;min-height:28px;transition:color .15s;}
.link-btn:hover{color:var(--text);}
.link-btn.teal{color:var(--teal);}
.link-btn.teal:hover{color:#00cec9;text-shadow:0 0 8px rgba(0,206,201,.5);}

/* quick-add bar */
#qbar{position:fixed;left:var(--nav-w);right:0;bottom:0;padding:14px clamp(16px,4vw,32px);background:var(--grad-glass),var(--glassThin);backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);border-top:1px solid var(--glassBorder);display:flex;gap:12px;z-index:20;box-shadow:0 -8px 28px rgba(82,99,140,.06);}
[data-theme="dark"] #qbar{box-shadow:0 -8px 28px rgba(0,0,0,.3);}
#qbar input{flex:1;min-width:0;background:rgba(255,255,255,.55);border:1px solid var(--glassBorder);border-radius:14px;padding:12px 16px;font-size:14px;color:var(--text);transition:all .2s;box-shadow:inset 0 1px 3px rgba(82,99,140,.05);}
[data-theme="dark"] #qbar input{background:rgba(255,255,255,.07);}
#qbar input:focus{border-color:var(--accent);box-shadow:0 0 0 4px var(--accentSoft),inset 0 1px 3px rgba(82,99,140,.05);background:rgba(255,255,255,.7);}
[data-theme="dark"] #qbar input:focus{background:rgba(255,255,255,.1);}
#qbar input::placeholder{color:var(--faint);}
#qbar button{background:var(--grad-accent);border:none;border-radius:14px;padding:12px 22px;font-size:13px;font-weight:700;color:#fff;box-shadow:0 6px 20px var(--accentGlow),inset 0 1px 0 rgba(255,255,255,.25);min-height:46px;transition:all .2s;letter-spacing:.2px;}
#qbar button:hover{transform:translateY(-2px);box-shadow:0 10px 28px var(--accentGlow),inset 0 1px 0 rgba(255,255,255,.3);}
#qbar button:active{transform:translateY(0);}
.qhint{font-size:11px;color:var(--faint);font-family:&quot;JetBrains Mono&quot;,monospace;align-self:center;white-space:nowrap;}

/* segments */
.seg-bar{display:flex;gap:4px;padding:5px;border-radius:14px;background:rgba(255,255,255,.4);border:1px solid var(--glassBorder);width:fit-content;margin-bottom:20px;flex-wrap:wrap;box-shadow:inset 0 1px 2px rgba(82,99,140,.04);}
[data-theme="dark"] .seg-bar{background:rgba(255,255,255,.05);}
.seg-btn{padding:7px 14px;border-radius:9px;border:none;background:transparent;font-size:13px;font-weight:500;color:var(--muted);min-height:36px;}
.seg-btn.on{background:rgba(255,255,255,.1);color:var(--text);box-shadow:0 1px 4px rgba(0,0,0,.2);}

/* task/lead cards */
.item-card{display:flex;align-items:flex-start;gap:12px;padding:14px 17px;border-radius:15px;margin-bottom:10px;transition:transform .2s cubic-bezier(.16,1,.3,1),box-shadow .2s,border-color .2s;}
.item-card:hover{transform:translateY(-2px);box-shadow:var(--shadow-md),inset 0 1px 0 var(--glassHi),0 6px 18px var(--accentGlow);border-color:rgba(59,111,246,.25);}
.item-card .check-btn{width:22px;height:22px;border-radius:50%;border:2px solid rgba(120,120,160,.4);background:transparent;flex-shrink:0;margin-top:1px;transition:all .2s;min-height:22px;}
.item-card .check-btn:hover{border-color:var(--blue);transform:scale(1.1);}
.emoji-ic{font-size:19px;line-height:1;flex-shrink:0;margin-top:1px;}
.item-title{font-size:14px;font-weight:700;line-height:1.3;letter-spacing:-.1px;}
.item-sub{font-size:12px;color:var(--muted);margin-top:3px;}
.stage-pill{font-size:11px;font-weight:800;padding:3px 10px;border-radius:8px;white-space:nowrap;letter-spacing:.3px;box-shadow:0 1px 3px rgba(0,0,0,.06);}
.task-overdue{border-left:3px solid var(--red) !important;border-top-left-radius:12px !important;border-bottom-left-radius:12px !important;}
.task-due-soon{border-left:3px solid var(--amber) !important;border-top-left-radius:11px !important;border-bottom-left-radius:11px !important;}
.lead-avatar{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px;font-weight:700;}

/* lead detail drawer */
.lead-detail{display:none;padding:14px 16px 16px;border-top:1px solid var(--glassBorder);margin-top:2px;animation:cbFadeUp .25s cubic-bezier(.16,1,.3,1);width:100%;}
.lead-detail.open{display:block;}
.lead-detail-row{display:flex;gap:8px;margin-bottom:8px;font-size:12.5px;}
.lead-detail-lbl{color:var(--faint);min-width:80px;font-family:&quot;JetBrains Mono&quot;,monospace;font-size:10px;padding-top:1px;font-weight:600;}
.lead-detail-val{color:var(--text);font-weight:600;}
.lead-action-strip{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;}
.lead-action-btn{padding:9px 13px;border-radius:11px;border:1px solid var(--glassBorder);background:rgba(255,255,255,.4);color:var(--muted);font-size:12px;font-weight:600;min-height:38px;transition:all .2s;backdrop-filter:blur(10px);}
[data-theme="dark"] .lead-action-btn{background:rgba(255,255,255,.05);}
.lead-action-btn:hover{background:rgba(255,255,255,.7);color:var(--text);transform:translateY(-1px);box-shadow:var(--shadow-md);}
[data-theme="dark"] .lead-action-btn:hover{background:rgba(255,255,255,.1);}
.lead-action-btn.primary{background:var(--accentSoft);color:var(--accent);border-color:rgba(59,111,246,.4);box-shadow:0 2px 8px var(--accentGlow);}
.lead-action-btn.primary:hover{background:var(--accent);color:#fff;box-shadow:0 6px 18px var(--accentGlow);}
.lead-timeline{position:relative;margin-top:14px;padding-left:18px;}
.lead-timeline::before{content:'';position:absolute;left:5px;top:6px;bottom:6px;width:2px;background:var(--grad-accent);border-radius:2px;opacity:.4;}
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
.prog-wrap{flex:1;height:6px;border-radius:6px;background:rgba(255,255,255,.08);overflow:hidden;box-shadow:inset 0 1px 2px rgba(82,99,140,.08);}
.prog-fill{height:100%;border-radius:6px;transition:width .5s cubic-bezier(.16,1,.3,1);box-shadow:0 0 8px currentColor;}
.hire-btn{display:flex;align-items:center;gap:10px;padding:14px 16px;border-radius:15px;border:1.5px dashed rgba(59,111,246,.4);color:var(--accent);font-size:13px;font-weight:700;background:transparent;width:100%;margin-top:8px;cursor:pointer;min-height:50px;transition:all .2s;}
.hire-btn:hover{background:var(--accentSoft);border-color:var(--accent);transform:translateY(-1px);box-shadow:0 4px 14px var(--accentGlow);}
.auto-card{padding:16px 18px;border-radius:16px;margin-bottom:10px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
.auto-info{flex:1;min-width:180px;}
.auto-label{font-size:14px;font-weight:700;letter-spacing:-.2px;}
.auto-desc{font-size:12px;color:var(--muted);margin-top:3px;}
.lvls{display:flex;gap:3px;padding:4px;border-radius:12px;background:rgba(0,0,0,.18);border:1px solid var(--glassBorder);box-shadow:inset 0 1px 2px rgba(0,0,0,.15);}
[data-theme="dark"] .lvls{background:rgba(0,0,0,.3);}
.lvl{padding:7px 14px;border-radius:9px;border:none;background:transparent;font-size:12px;font-weight:700;color:var(--muted);min-height:36px;transition:all .2s;}
.lvl:hover{color:var(--text);}
.lvl.on{background:var(--grad-accent);color:#fff;box-shadow:0 3px 10px var(--accentGlow),inset 0 1px 0 rgba(255,255,255,.25);}
.approve-card{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:15px;margin-bottom:9px;}
.approve-title{font-size:13.5px;font-weight:700;}
.approve-action{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:11px;color:var(--faint);margin-top:3px;}
.approve-btn{padding:9px 17px;border-radius:11px;border:none;font-size:12px;font-weight:700;min-height:38px;transition:all .2s;}
.approve-btn.ok{background:linear-gradient(135deg,var(--green),#3ee3b0);color:#fff;box-shadow:0 4px 14px rgba(0,184,148,.3),inset 0 1px 0 rgba(255,255,255,.25);}
.approve-btn.ok:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(0,184,148,.4),inset 0 1px 0 rgba(255,255,255,.3);}
.approve-btn.no{background:rgba(255,107,129,.14);color:var(--red);border:1px solid rgba(255,107,129,.2);}
.approve-btn.no:hover{background:rgba(255,107,129,.22);transform:translateY(-1px);}

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
.event-icon{width:36px;height:36px;border-radius:12px;background:var(--grad-surface),var(--surface2);border:1px solid var(--glassBorder);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;box-shadow:inset 0 1px 0 var(--glassHi);transition:transform .2s;}
.event-icon:hover{transform:scale(1.08);}
.date-sep{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:10px;color:var(--faint);letter-spacing:.6px;padding:10px 0 8px;display:flex;align-items:center;gap:12px;font-weight:700;}
.date-sep::before,.date-sep::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,transparent,var(--glassBorder),transparent);}
.undo-btn{margin-left:auto;padding:7px 14px;border-radius:10px;border:1px solid var(--glassBorder);background:rgba(255,255,255,.4);color:var(--muted);font-size:12px;font-weight:600;min-height:34px;transition:all .2s;backdrop-filter:blur(10px);}
[data-theme="dark"] .undo-btn{background:rgba(255,255,255,.05);}
.undo-btn:hover{background:var(--accentSoft);color:var(--accent);border-color:rgba(59,111,246,.4);transform:translateY(-1px);box-shadow:0 4px 12px var(--accentGlow);}
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
#toast{position:fixed;left:50%;bottom:100px;transform:translateX(-50%) translateY(20px);opacity:0;pointer-events:none;transition:all .35s cubic-bezier(.16,1,.3,1);z-index:300;max-width:min(92vw,420px);}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto;}
#toast .toast-inner{display:flex;align-items:center;gap:10px;padding:13px 17px;border-radius:14px;background:linear-gradient(135deg,rgba(22,24,38,.96),rgba(30,33,52,.94));backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);border:1px solid rgba(255,255,255,.14);box-shadow:0 16px 48px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.1);color:#fff;font-size:13.5px;font-weight:500;}
#toast .toast-undo{background:var(--grad-accent);color:#fff;border:none;border-radius:9px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;margin-left:8px;box-shadow:0 4px 12px var(--accentGlow);transition:transform .15s;}
#toast .toast-undo:hover{transform:scale(1.05);}

/* buttons */
.btn-primary{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:12px;border:none;background:var(--grad-accent);color:#fff;font-size:13px;font-weight:700;box-shadow:0 6px 18px var(--accentGlow),inset 0 1px 0 rgba(255,255,255,.25);min-height:42px;transition:all .2s;letter-spacing:.2px;}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 10px 26px var(--accentGlow),inset 0 1px 0 rgba(255,255,255,.3);}
.btn-primary:active{transform:translateY(0);}
.btn-primary:disabled{opacity:.6;cursor:not-allowed;transform:none;}
.btn-ghost{display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border-radius:11px;border:1px solid var(--glassBorder);background:rgba(255,255,255,.4);color:var(--muted);font-size:12.5px;font-weight:600;min-height:38px;transition:all .2s;backdrop-filter:blur(10px);}
[data-theme="dark"] .btn-ghost{background:rgba(255,255,255,.05);}
.btn-ghost:hover{background:rgba(255,255,255,.7);color:var(--text);transform:translateY(-1px);box-shadow:var(--shadow-md);}
[data-theme="dark"] .btn-ghost:hover{background:rgba(255,255,255,.1);}
.btn-danger{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:12px;border:none;background:linear-gradient(135deg,var(--red),#ff8a95);color:#fff;font-size:13px;font-weight:700;min-height:42px;box-shadow:0 6px 18px rgba(255,107,129,.3),inset 0 1px 0 rgba(255,255,255,.25);transition:all .2s;}
.btn-danger:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(255,107,129,.4),inset 0 1px 0 rgba(255,255,255,.3);}

/* dark mode toggle */
.dark-toggle{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:9px;border:1px solid var(--glassBorder);background:transparent;font-size:11px;font-weight:500;color:var(--muted);width:100%;min-height:34px;cursor:pointer;}
.dark-toggle:hover{background:var(--bg2);color:var(--text);}
.topbar-dark-toggle{width:36px;height:36px;border-radius:9px;border:1px solid var(--glassBorder);background:transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--muted);margin-left:auto;}
.topbar-dark-toggle:hover{background:var(--bg2);color:var(--text);}

/* empty / spinner */
.empty{color:var(--faint);text-align:center;padding:40px 0;font-size:13px;}
.empty-dashed{padding:30px 18px;text-align:center;border-radius:14px;border:1px dashed rgba(255,255,255,.1);color:var(--faint);font-size:12.5px;margin-top:4px;}
.spin{width:24px;height:24px;border:3px solid rgba(255,255,255,.1);border-top-color:var(--accent);border-right-color:var(--accent2);border-radius:50%;animation:cbSpin .7s linear infinite;margin:40px auto;display:block;filter:drop-shadow(0 0 6px var(--accentGlow));}

/* kanban board */
.kanban-wrap{margin-top:4px;}.overdue-strip{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:14px;background:linear-gradient(135deg,rgba(255,107,129,.1),rgba(255,107,129,.05));border:1px solid rgba(255,107,129,.25);margin-bottom:16px;box-shadow:0 4px 14px rgba(255,107,129,.08);}.overdue-strip-count{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:14px;font-weight:800;color:var(--red);}.overdue-strip-label{font-size:13px;color:var(--red);flex:1;font-weight:600;}.kanban-board{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}.kanban-col{min-width:0;}.kanban-col-head{display:flex;align-items:center;gap:7px;padding:0 2px 12px;}.kanban-col-dot{width:10px;height:10px;border-radius:3px;flex-shrink:0;box-shadow:0 0 8px currentColor;}.kanban-col-label{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);}.kanban-col-count{margin-left:auto;font-family:&quot;JetBrains Mono&quot;,monospace;font-size:11px;font-weight:700;color:var(--faint);background:var(--surface2);padding:2px 8px;border-radius:8px;border:1px solid var(--glassBorder);}.kanban-col-body{display:flex;flex-direction:column;gap:8px;min-height:80px;}.kanban-task-card{padding:13px 14px;border-radius:14px;transition:all .2s cubic-bezier(.16,1,.3,1);}.kanban-task-card:hover{transform:translateY(-2px);box-shadow:var(--shadow-md),inset 0 1px 0 var(--glassHi);}.kanban-task-card.overdue{border-left:3px solid var(--red);border-top-left-radius:11px;border-bottom-left-radius:11px;}.kanban-task-card.due-soon{border-left:3px solid var(--amber);border-top-left-radius:11px;border-bottom-left-radius:11px;}.kanban-task-row{display:flex;align-items:flex-start;gap:9px;}.kanban-check{width:19px;height:19px;border-radius:50%;border:2px solid var(--glassBorder);background:transparent;flex-shrink:0;margin-top:2px;cursor:pointer;transition:all .2s;min-height:19px;}.kanban-check:hover{border-color:var(--green);background:var(--greenSoft);transform:scale(1.1);}.kanban-task-emoji{font-size:14px;flex-shrink:0;margin-top:1px;}.kanban-task-title{font-size:13.5px;font-weight:600;color:var(--text);line-height:1.3;flex:1;}.kanban-task-sub{font-size:10.5px;color:var(--muted);margin-top:3px;}.kanban-task-foot{display:flex;align-items:center;gap:6px;margin-top:8px;flex-wrap:wrap;}.priority-pill{font-size:9px;font-weight:800;padding:3px 7px;border-radius:6px;font-family:&quot;JetBrains Mono&quot;,monospace;white-space:nowrap;letter-spacing:.3px;}.priority-high{background:var(--redSoft);color:var(--red);box-shadow:0 1px 3px rgba(255,107,129,.2);}.priority-med{background:var(--amberSoft);color:var(--amber);}.priority-low{background:var(--greenSoft);color:var(--green);}.kanban-add-btn{display:flex;align-items:center;gap:7px;padding:10px 12px;border-radius:12px;border:1.5px dashed var(--glassBorder);background:transparent;color:var(--faint);font-size:12px;width:100%;cursor:pointer;margin-top:6px;min-height:38px;transition:all .2s;font-weight:500;}.kanban-add-btn:hover{border-color:var(--accent);color:var(--accent);background:var(--accentSoft);transform:translateY(-1px);}

/* pipeline board */
.pipeline-board{display:flex;gap:12px;overflow-x:auto;padding-bottom:12px;-webkit-overflow-scrolling:touch;margin-top:4px;}.pipeline-board::-webkit-scrollbar{height:4px;}.pipeline-col{min-width:210px;width:210px;flex-shrink:0;}.pipeline-col-head{display:flex;align-items:center;gap:6px;padding:0 2px 10px;}.pipeline-stage-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}.pipeline-stage-label{font-family:&quot;JetBrains Mono&quot;,monospace;font-size:9.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);}.pipeline-col-count{margin-left:auto;font-family:&quot;JetBrains Mono&quot;,monospace;font-size:11px;color:var(--faint);}.pipeline-col-body{display:flex;flex-direction:column;gap:7px;min-height:80px;}.pipeline-lead-card{padding:11px 12px;border-radius:12px;cursor:pointer;transition:transform .15s,box-shadow .15s;}.pipeline-lead-card:hover{transform:translateY(-1px);box-shadow:var(--shadow-md);}.pipeline-lead-avatar{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;font-weight:700;color:#fff;}.pipeline-lead-name{font-size:12.5px;font-weight:600;color:var(--text);line-height:1.3;}.pipeline-lead-sub{font-size:10.5px;color:var(--muted);margin-top:2px;}.pipeline-lead-foot{display:flex;gap:5px;margin-top:8px;flex-wrap:wrap;}.plead-adv-btn{padding:4px 9px;border-radius:6px;border:1px solid var(--glassBorder);background:var(--surface2);color:var(--muted);font-size:10.5px;font-weight:500;min-height:26px;cursor:pointer;transition:all .15s;text-decoration:none;}.plead-adv-btn:hover{background:var(--accentSoft);color:var(--accent);border-color:rgba(62,123,250,.3);}

/* bento grid */
.bento-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:13px;margin-top:4px;}.bento-card{border-radius:18px;padding:20px;min-height:170px;display:flex;flex-direction:column;position:relative;overflow:hidden;cursor:pointer;transition:transform .25s cubic-bezier(.16,1,.3,1),box-shadow .25s;box-shadow:var(--shadow),inset 0 1px 0 rgba(255,255,255,.2);}.bento-card::after{content:'';position:absolute;top:0;left:0;right:0;height:50%;background:linear-gradient(180deg,rgba(255,255,255,.1) 0%,transparent 100%);pointer-events:none;}.bento-card:hover{transform:translateY(-4px) scale(1.01);box-shadow:var(--shadow-lg),0 12px 36px rgba(59,111,246,.2),inset 0 1px 0 rgba(255,255,255,.3);}.bento-hero{grid-column:span 2;min-height:190px;}.bento-card-emoji{font-size:26px;margin-bottom:auto;}.bento-card-name{font-size:15px;font-weight:700;line-height:1.3;color:#fff;}.bento-card-desc{font-size:11.5px;opacity:.8;margin-top:4px;color:#fff;line-height:1.4;}.bento-card-foot{display:flex;align-items:center;gap:8px;margin-top:12px;}.bento-prog-bar{flex:1;height:3px;border-radius:3px;background:rgba(255,255,255,.25);overflow:hidden;}.bento-prog-fill{height:100%;border-radius:3px;background:rgba(255,255,255,.75);}.bento-pct{font-size:10px;font-weight:700;color:rgba(255,255,255,.8);font-family:&quot;JetBrains Mono&quot;,monospace;}.bento-status{font-size:9.5px;font-weight:700;padding:3px 8px;border-radius:5px;background:rgba(255,255,255,.2);color:#fff;font-family:&quot;JetBrains Mono&quot;,monospace;}.bento-new-card{border-radius:18px;padding:20px;min-height:170px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:2px dashed var(--glassBorder);cursor:pointer;transition:all .2s;color:var(--faint);background:transparent;}.bento-new-card:hover{border-color:var(--accent);color:var(--accent);background:var(--accentSoft);transform:translateY(-2px);box-shadow:0 8px 24px var(--accentGlow);}

/* modals */
.modal-backdrop{position:fixed;inset:0;background:rgba(8,10,20,.45);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:200;display:none;align-items:center;justify-content:center;padding:18px;}.modal-backdrop.open{display:flex;animation:cbFade .2s ease;}.modal-box{background:var(--grad-surface),var(--surface);border:1px solid var(--glassBorder);border-radius:24px;width:100%;max-width:500px;max-height:88vh;overflow-y:auto;box-shadow:var(--shadow-lg),inset 0 1px 0 var(--glassHi);animation:cbModalUp .25s cubic-bezier(.16,1,.3,1);backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);}.modal-head{display:flex;align-items:center;gap:12px;padding:22px 22px 0;}.modal-title{font-size:17px;font-weight:700;flex:1;letter-spacing:-.3px;}.modal-close{width:34px;height:34px;border-radius:10px;border:1px solid var(--glassBorder);background:transparent;color:var(--muted);font-size:16px;cursor:pointer;transition:all .2s;}.modal-close:hover{background:rgba(255,255,255,.06);color:var(--text);transform:rotate(90deg);}.modal-body{padding:18px 22px 4px;}.modal-foot{display:flex;gap:10px;justify-content:flex-end;padding:14px 22px 22px;}.modal-field{margin-bottom:14px;}.modal-label{display:block;font-size:10px;font-weight:700;color:var(--muted);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px;}.modal-input,.modal-select{width:100%;padding:11px 14px;border-radius:12px;border:1px solid var(--glassBorder);background:rgba(255,255,255,.5);color:var(--text);font-size:13.5px;font-family:inherit;transition:all .2s;box-shadow:inset 0 1px 2px rgba(82,99,140,.04);}[data-theme="dark"] .modal-input,[data-theme="dark"] .modal-select{background:rgba(255,255,255,.07);}.modal-input:focus,.modal-select:focus{border-color:var(--accent);box-shadow:0 0 0 4px var(--accentSoft),inset 0 1px 2px rgba(82,99,140,.04);outline:none;background:rgba(255,255,255,.7);}[data-theme="dark"] .modal-input:focus,[data-theme="dark"] .modal-select:focus{background:rgba(255,255,255,.1);}@keyframes cbModalUp{from{opacity:0;transform:translateY(20px) scale(.96)}to{opacity:1;transform:none}}

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

/* drag-and-drop + project/agent extras */
.kanban-task-card[draggable="true"]{cursor:grab;}
.kanban-task-card.dragging{opacity:.4;}
.kanban-col-body.drag-over{background:var(--accentSoft);border-radius:12px;outline:2px dashed var(--accent);outline-offset:-2px;}
.pipeline-lead-card[draggable="true"]{cursor:grab;}
.pipeline-lead-card.dragging{opacity:.4;}
.pipeline-col-body.drag-over{background:var(--accentSoft);border-radius:12px;outline:2px dashed var(--accent);outline-offset:-2px;}
.proj-color-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
.proj-color-swatch{width:28px;height:28px;border-radius:50%;border:2px solid transparent;cursor:pointer;flex-shrink:0;transition:transform .12s;}
.proj-color-swatch:hover{transform:scale(1.12);}
.proj-color-swatch.on{border-color:var(--text);box-shadow:0 0 0 2px var(--surface),0 0 0 4px var(--accent);}
.proj-upload-row{display:flex;align-items:center;gap:10px;}
.proj-upload-preview{width:52px;height:52px;border-radius:12px;background-size:cover;background-position:center;border:1px solid var(--glassBorder);flex-shrink:0;background-color:var(--bg2);}
.proj-detail-hero{border-radius:16px;padding:22px;min-height:110px;display:flex;flex-direction:column;justify-content:flex-end;margin-bottom:14px;position:relative;}
.proj-detail-emoji{font-size:30px;margin-bottom:8px;}
.proj-detail-name{font-size:19px;font-weight:700;color:#fff;}
.proj-detail-row{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
.proj-stepper-btn{width:28px;height:28px;border-radius:8px;border:1px solid var(--glassBorder);background:var(--bg2);color:var(--text);font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;min-height:28px;}
.proj-stepper-btn:hover{background:var(--accentSoft);color:var(--accent);border-color:rgba(62,123,250,.3);}
.agent-card.custom{border-left:3px solid var(--accent);}
.agent-remove-btn{margin-left:auto;background:transparent;border:none;color:var(--faint);cursor:pointer;font-size:16px;padding:2px 6px;border-radius:6px;flex-shrink:0;}
.agent-remove-btn:hover{color:var(--red);background:var(--redSoft);}
.emoji-pick-row{display:flex;gap:6px;flex-wrap:wrap;}
.emoji-pick-btn{width:34px;height:34px;border-radius:9px;border:1.5px solid var(--glassBorder);background:var(--bg2);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;min-height:34px;transition:all .12s;}
.emoji-pick-btn.on{border-color:var(--accent);background:var(--accentSoft);}
</style>
</head>
<body>
<div id="app">
  <div id="bg-blobs"><div id="mesh"></div><div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div></div>
  <div id="grain"></div>

  <div id="shell">
    <nav id="sidebar">
      <div class="logo-row">
        <div class="logo-icon">&#129504;</div>
        <div><div class="logo-text">company<span>brain</span></div><div class="logo-sub">v1 &middot; forget-nothing</div></div>
      </div>
      <div class="sidebar-search">
        <svg class="ss-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="sidebar-search-input" placeholder="Search…" autocomplete="off"/>
      </div>
      <div id="side-nav"></div>
      <div class="sidebar-bot">
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
        <button id="notif-btn" aria-label="Notifications" type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span id="notif-count"></span>
        </button>
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
    <div class="glass-premium" style="background:var(--grad-surface),var(--surface);backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);border-radius:24px 24px 0 0;width:100%;padding:12px 16px max(32px,env(safe-area-inset-bottom));border:1px solid var(--glassBorder);border-bottom:none;box-shadow:0 -8px 40px rgba(82,99,140,.12),inset 0 1px 0 var(--glassHi);">
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

  <div class="modal-backdrop" id="ai-modal">
    <div class="modal-box">
      <div class="modal-head"><span style="font-size:22px;">🤖</span><span class="modal-title">Assign to AI</span><button class="modal-close" id="ai-modal-close">×</button></div>
      <div class="modal-body">
        <div class="modal-field"><label class="modal-label">Task</label><div id="ai-modal-task" style="font-size:13px;font-weight:600;color:var(--text);"></div></div>
        <div class="modal-field"><label class="modal-label">Action</label><select class="modal-select" id="ai-modal-action"><option value="">Not an AI task</option><option value="generate">Generate — write the deliverable onto the task</option><option value="publish_blog">Publish blog — draft a post to WordPress (needs approval)</option></select></div>
        <div class="modal-field"><label class="modal-label">Prompt override (optional)</label><textarea class="modal-input" id="ai-modal-prompt" rows="2" placeholder="Leave blank to use the task title" style="resize:vertical;"></textarea></div>
        <div class="modal-field"><label class="modal-label">Model override (optional)</label><input class="modal-input" id="ai-modal-model" placeholder="e.g. openai/gpt-4o-mini" autocomplete="off"/></div>
        <div class="modal-field"><label class="modal-label">Runs</label><div id="ai-modal-runs" style="font-size:12px;color:var(--muted);">No runs yet.</div></div>
      </div>
      <div class="modal-foot"><button class="btn-ghost" id="ai-modal-cancel">Close</button><button class="btn-primary" id="ai-modal-save">Save</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="lead-modal">
    <div class="modal-box">
      <div class="modal-head"><span style="font-size:20px;">🤝</span><span class="modal-title">New lead</span><button class="modal-close" id="lead-modal-close">×</button></div>
      <div class="modal-body">
        <div style="display:flex;gap:3px;padding:3px;border-radius:9px;background:var(--bg2);border:1px solid var(--glassBorder);margin-bottom:14px;"><button class="capture-tab on" id="lead-tab-type" style="flex:1;padding:7px;border-radius:7px;border:none;background:var(--surface);font-size:12px;font-weight:600;color:var(--text);cursor:pointer;min-height:34px;box-shadow:var(--shadow-md);">&#9997; Type details</button><button class="capture-tab" id="lead-tab-photo" style="flex:1;padding:7px;border-radius:7px;border:none;background:transparent;font-size:12px;font-weight:500;color:var(--muted);cursor:pointer;min-height:34px;">&#128247; Scan card</button></div>
        <div id="lead-type-form"><div class="modal-field"><label class="modal-label">Name *</label><input class="modal-input" id="lead-name" placeholder="John Smith" autocomplete="off"/></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div class="modal-field"><label class="modal-label">Phone</label><input class="modal-input" id="lead-phone" placeholder="+91 98765 00000"/></div><div class="modal-field"><label class="modal-label">Email</label><input class="modal-input" id="lead-email" placeholder="john@acme.com"/></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div class="modal-field"><label class="modal-label">Company</label><input class="modal-input" id="lead-company" placeholder="Acme Inc."/></div><div class="modal-field"><label class="modal-label">Title</label><input class="modal-input" id="lead-title" placeholder="CEO"/></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div class="modal-field"><label class="modal-label">Deal value ($)</label><input class="modal-input" id="lead-value" type="number" min="0" placeholder="5000"/></div></div><div class="modal-field"><label class="modal-label">Notes</label><textarea class="modal-input" id="lead-notes" rows="2" placeholder="Met at conference, interested in services" style="resize:vertical;"></textarea></div></div>
        <div id="lead-photo-form" style="display:none;"><div id="lead-upload-area" style="padding:28px 20px;border-radius:12px;border:2px dashed var(--glassBorder);text-align:center;cursor:pointer;transition:all .15s;"><div style="font-size:32px;margin-bottom:10px;">&#128247;</div><div style="font-size:13px;font-weight:600;color:var(--text);">Tap to upload business card</div><div style="font-size:11.5px;color:var(--faint);margin-top:4px;">AI will extract name, phone, email and company</div><input type="file" id="lead-card-file" accept="image/*" style="display:none;"/></div><div id="lead-extracted" style="display:none;margin-top:12px;padding:12px;border-radius:10px;background:var(--bg2);border:1px solid var(--glassBorder);"><div style="font-size:11px;font-weight:600;color:var(--accent);margin-bottom:8px;font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.4px;">EXTRACTED</div><div id="lead-extracted-fields"></div></div></div>
      </div>
      <div class="modal-foot"><button class="btn-ghost" id="lead-modal-cancel">Cancel</button><button class="btn-primary" id="lead-modal-save">Save lead</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="proj-modal">
    <div class="modal-box">
      <div class="modal-head"><span style="font-size:20px;" id="proj-modal-icon">📦</span><span class="modal-title" id="proj-modal-title">New project</span><button class="modal-close" id="proj-modal-close">×</button></div>
      <div class="modal-body">
        <div class="modal-field"><label class="modal-label">Choose a template</label><div id="proj-template-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;"></div></div>
        <div class="modal-field"><label class="modal-label">Or pick a custom color</label><div class="proj-color-row" id="proj-color-row"></div></div>
        <div class="modal-field"><label class="modal-label">Or upload a custom image</label><div class="proj-upload-row"><div class="proj-upload-preview" id="proj-upload-preview"></div><input type="file" id="proj-image-file" accept="image/*" style="display:none;"/><button class="btn-ghost" id="proj-image-btn" type="button">Upload image</button><button class="btn-ghost" id="proj-image-clear" type="button" style="display:none;">Remove</button></div></div>
        <div class="modal-field"><label class="modal-label">Emoji</label><div class="emoji-pick-row" id="proj-emoji-row"></div></div>
        <div class="modal-field"><label class="modal-label">Project name</label><input class="modal-input" id="proj-modal-name" placeholder="My new project" autocomplete="off"/></div>
        <div class="modal-field"><label class="modal-label">Description (optional)</label><textarea class="modal-input" id="proj-modal-desc" rows="2" placeholder="What is this project about?" style="resize:vertical;"></textarea></div>
      </div>
      <div class="modal-foot"><button class="btn-danger" id="proj-modal-delete" style="display:none;margin-right:auto;">Delete</button><button class="btn-ghost" id="proj-modal-cancel">Cancel</button><button class="btn-primary" id="proj-modal-save">Create project</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="proj-detail-modal">
    <div class="modal-box">
      <div class="modal-head"><span class="modal-title">Project</span><button class="modal-close" id="proj-detail-close">×</button></div>
      <div class="modal-body" id="proj-detail-body"></div>
      <div class="modal-foot"><button class="btn-danger" id="proj-detail-delete" style="margin-right:auto;">Delete</button><button class="btn-ghost" id="proj-detail-edit">Edit</button><button class="btn-primary" id="proj-detail-close-btn">Close</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="agent-modal">
    <div class="modal-box">
      <div class="modal-head"><span style="font-size:20px;">🤖</span><span class="modal-title" id="agent-modal-title">Hire a new agent</span><button class="modal-close" id="agent-modal-close">×</button></div>
      <div class="modal-body">
        <div class="modal-field"><label class="modal-label">Emoji</label><div class="emoji-pick-row" id="agent-emoji-row"></div></div>
        <div class="modal-field"><label class="modal-label">Agent name</label><input class="modal-input" id="agent-modal-name" placeholder="e.g. Nova" autocomplete="off"/></div>
        <div class="modal-field"><label class="modal-label">Role / what it does</label><input class="modal-input" id="agent-modal-role" placeholder="e.g. Drafts weekly reports"/></div>
        <div class="modal-field"><label class="modal-label">Autonomy</label><div class="lvls" id="agent-modal-autonomy"><button type="button" class="lvl" data-lvl="off">Off</button><button type="button" class="lvl" data-lvl="ask">Ask</button><button type="button" class="lvl" data-lvl="auto">Auto</button></div></div>
      </div>
      <div class="modal-foot"><button class="btn-danger" id="agent-modal-delete" style="display:none;margin-right:auto;">Remove</button><button class="btn-ghost" id="agent-modal-cancel">Cancel</button><button class="btn-primary" id="agent-modal-save">Hire agent</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="auth-modal">
    <div class="modal-box" style="max-width:430px;">
      <div class="modal-head"><span style="font-size:20px;">🔐</span><span class="modal-title">Sign in to companybrain</span></div>
      <div class="modal-body">
        <div style="font-size:12px;color:var(--muted);line-height:1.45;margin-bottom:12px;">Sign in with your email or username. Your role and permissions are assigned by the server.</div>
        <div class="modal-field"><label class="modal-label">Email or username</label><input class="modal-input" id="auth-identifier" type="text" placeholder="you@company.com" autocomplete="username" autocapitalize="none" spellcheck="false"/></div>
        <div class="modal-field"><label class="modal-label">Password</label><input class="modal-input" id="auth-password" type="password" placeholder="Enter password" autocomplete="current-password"/></div>
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

  <!-- floating quick-add button (mobile only) -->
  <button id="fab" aria-label="Quick add">+</button>
</div>
<script>
(function(){
  function showErr(e){
    var m=e&&e.message?e.message:String(e);
    document.getElementById('view').innerHTML='<div style="padding:24px;color:#ff6b6b;font-family:monospace;font-size:13px;white-space:pre-wrap">JS error: '+m+'</div>';
  }
  try {
  var tab='home', side='yours', taskDay='today', leadView='all', activeRole='ceo', loopCount=0;
  var me=null, appStarted=false;
  var TEAM_USERS=[]; // fetched on boot — real users for assignment pickers
  var h0=new Date().getHours();
  var briefMode=h0<12?'am':h0<17?'pm':'eve';

  var TABS=[
    {id:'home',  ic:'🏠', label:'Home'},
    {id:'loops', ic:'🔁', label:'Follow-ups'},
    {id:'tasks', ic:'✅',  label:'Tasks'},
    {id:'leads', ic:'🤝', label:'Pipeline'},
    {id:'projects',ic:'📦', label:'Projects'},
    {id:'team',  ic:'👥', label:'Team'},
    {id:'reports',ic:'📊', label:'Reports'},
    {id:'settings', ic:'⚙️', label:'Settings'},
  ];

  var SVG={
    home:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 2l9 7.5V20a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2V9.5z"/></svg>',
    loops:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    tasks:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    leads:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    projects:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="6" height="6" rx="1"/><rect x="9" y="3" width="6" height="6" rx="1"/><rect x="16" y="3" width="6" height="6" rx="1"/><rect x="2" y="12" width="6" height="6" rx="1"/><rect x="9" y="12" width="6" height="6" rx="1"/></svg>',
    agents:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 7V4M8 13h.01M16 13h.01"/></svg>',
    methods:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
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
    {k:'executeAi',    label:'Execute AI tasks', desc:'Run AI-assigned tasks (publishing always needs approval)'},
  ];

  var EVENT_ICONS={
    'loop.created':'🔄','loop.closed':'✅','loop.snoozed':'😴','loop.captured':'🔄','loop.reopened':'↩️',
    'task.created':'📝','task.completed':'✔️','task.moved':'➡️',
    'ai.task.queued':'🤖','ai.task.executed':'🤖','ai.task.failed':'⚠️',
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
  // Only send a JSON content-type when there IS a body: declaring one on an empty POST
  // makes Fastify's body parser fail with 'Unexpected end of JSON input' (400).
  function post(path,body,method){return api(path,{method:method||'POST',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});}
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
  function userFor(id){
    // Map the current logged-in user to "You" even if their ID differs from legacy seed IDs.
    if(me&&(id===me.userId||(me.email&&id===me.email))) return {name:'You',initials:(me.initials||'YO'),role:me.role,color:'linear-gradient(140deg,var(--accent),var(--accent2))'};
    if(USERS[id]) return USERS[id];
    // ponytail: friendly fallback — strip prefixes like "user_" and title-case the rest.
    var clean=(id||'').replace(/^user_/,'').replace(/_/g,' ').trim();
    if(!clean) clean='Unknown';
    return {name:clean.charAt(0).toUpperCase()+clean.slice(1),initials:(clean.slice(0,2)).toUpperCase(),color:'linear-gradient(140deg,#6b6b78,#9a9aa8)'};
  }
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
  function openAuthModal(msg){
    var m=document.getElementById('auth-modal');
    if(!m) return;
    var err=document.getElementById('auth-error');
    if(err){
      if(msg){err.style.display='block';err.textContent=msg;}
      else{err.style.display='none';err.textContent='';}
    }
    m.classList.add('open');
    var id=document.getElementById('auth-identifier');
    var pw=document.getElementById('auth-password');
    var target=id&&id.value?id:pw;
    if(target) setTimeout(function(){target.focus();},20);
  }
  function closeAuthModal(){
    var m=document.getElementById('auth-modal');
    if(m) m.classList.remove('open');
    var err=document.getElementById('auth-error');
    if(err){err.style.display='none';err.textContent='';}
    var pw=document.getElementById('auth-password');
    if(pw) pw.value='';
  }
  function loginWithPassword(){
    var id=document.getElementById('auth-identifier');
    var pw=document.getElementById('auth-password');
    var btn=document.getElementById('auth-login-btn');
    var identifier=id&&id.value?id.value.trim():'';
    var password=pw&&pw.value||'';
    if(!identifier){openAuthModal('Email or username is required');return;}
    if(!password){openAuthModal('Password is required');return;}
    if(btn){btn.disabled=true;btn.textContent='Signing in…';}
    post('/api/auth/login',{userId:identifier,key:password}).then(function(res){
      applySessionUser(res&&res.user?res.user:null);
      closeAuthModal();
      startApp();
    }).catch(function(e){
      openAuthModal(e&&e.message?e.message:'Invalid email/username or password');
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
      applySessionUser(null);
      openAuthModal();
      return false;
    }).catch(function(){
      applySessionUser(null);
      openAuthModal();
      return false;
    });
  }
  function startApp(){
    if(appStarted) return;
    appStarted=true;
    buildNav();
    render();
    loadNotifications();
    setupSSE();
    // Fetch real team users for assignment pickers (best-effort — fails silently for non-CEO)
    api('/api/admin/users').then(function(users){TEAM_USERS=users||[];}).catch(function(){TEAM_USERS=[];});
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
  var BOT_TABS=['home','tasks','loops','leads','projects'];
  var MORE_TABS=['team','reports','settings'];
  function buildNav(){
    var sn=document.getElementById('side-nav');
    sn.innerHTML=TABS.map(function(t){
      var badge=(t.id==='loops'&&loopCount>0)?'<span class="nav-badge">'+loopCount+'</span>':'';
      return '<button type="button" class="nav-item'+(t.id===tab?' active':'')+'" data-tab="'+t.id+'" aria-current="'+(t.id===tab?'page':'false')+'">'
        +'<span class="ni" aria-hidden="true">'+SVG[t.id]+'</span>'+t.label+badge+'</button>';
    }).join('');
    sn.querySelectorAll('.nav-item').forEach(function(el){
      el.onclick=function(){tab=el.dataset.tab;buildNav();buildBotNav();render();};
    });
    buildBotNav();
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
    qfield.placeholder=tab==='loops'?'Add a follow-up…':tab==='tasks'?'Add a task for today…':'Add lead (name or paste a note)…';
    view.innerHTML='<div class="spin"></div>';
    if(tab==='home')          loadToday();
    else if(tab==='loops')    loadLoops();
    else if(tab==='tasks')    loadTasks();
    else if(tab==='leads')    loadLeads();
    else if(tab==='projects') loadProjects();
    else if(tab==='team')     loadTeam();
    else if(tab==='methods')  loadMethods();
    else if(tab==='reports')  loadReports();
    else if(tab==='settings') loadSettings();
    else                      loadEvents();
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
      +'<div class="role-panel-title">Waiting on me</div>'
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
  // ── Today dashboard (Sprint 2 — the landing view) ──────────────────────────
  function loadToday(){
    // skeleton while loading
    view.innerHTML='<div class="sec-head"><div><div class="sk sk-line w40" style="height:28px;width:180px;"></div><div class="sk sk-line w40" style="margin-top:8px;"></div></div></div>'
      +'<div class="glass-hero" style="padding:24px 26px;border-radius:22px;margin-bottom:20px;"><div class="sk sk-line w40"></div><div class="sk sk-line w80" style="height:20px;"></div><div class="sk sk-line w60" style="height:12px;margin-top:12px;"></div></div>'
      +'<div class="sk sk-card"></div><div class="sk sk-card"></div><div class="sk sk-card"></div>';
    Promise.all([api('/api/today'), api('/api/autonomy')]).then(function(res){
      var d=res[0]||{};
      var settings=res[1]||{};
      var approvalItems=(d.pendingApprovals||[]);
      var attentionItems=(d.needsAttention||[]);
      var waitingItems=(d.waitingOnThem||[]);
      var wins=(d.winsToday||[]);
      var team=(d.teamStatus||[]);
      var stats=d.stats||{};

      var html='<div class="sec-head"><div><div class="sec-title">Today</div><div class="sec-sub">'+new Date().toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'})+'</div></div></div>';

      // Hero summary card — premium glass with glow + shimmer sweep
      var totalNeeds=stats.overdueCount+stats.waitingOnMeCount+approvalItems.length;
      var heroIcon=totalNeeds>0?'⚡':'🎉';
      html+='<div class="glass-hero" style="padding:24px 26px;border-radius:22px;margin-bottom:20px;">';
      html+='<div style="display:flex;align-items:flex-start;gap:16px;position:relative;z-index:1;">';
      html+='<div style="width:52px;height:52px;border-radius:16px;background:var(--grad-accent);display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 8px 24px var(--accentGlow),inset 0 1px 0 rgba(255,255,255,.3);flex-shrink:0;animation:cbFloat 4s ease-in-out infinite;">'+heroIcon+'</div>';
      html+='<div style="flex:1;min-width:0;">';
      html+='<div style="font-family:&quot;JetBrains Mono&quot;,monospace;font-size:10px;font-weight:800;letter-spacing:.6px;color:var(--accent);margin-bottom:6px;">'+(totalNeeds>0?'NEEDS YOUR ATTENTION':'ALL CLEAR')+'</div>';
      html+='<div style="font-size:28px;font-weight:800;letter-spacing:-.8px;line-height:1.2;">'+(totalNeeds>0?totalNeeds+' thing'+(totalNeeds===1?'':'s')+' to do':'Nothing urgent today')+'</div>';
      html+='<div style="font-size:13px;color:var(--muted);margin-top:8px;">';
      var parts=[];
      if(stats.overdueCount>0) parts.push('<span style="color:var(--red);font-weight:600;">'+stats.overdueCount+' overdue</span>');
      if(stats.waitingOnMeCount>0) parts.push('<span style="color:var(--amber);font-weight:600;">'+stats.waitingOnMeCount+' waiting on me</span>');
      if(approvalItems.length>0) parts.push('<span style="color:var(--violet);font-weight:600;">'+approvalItems.length+' approval'+(approvalItems.length===1?'':'s')+'</span>');
      if(parts.length===0) parts.push('You\u2019re all caught up.');
      html+=parts.join(' · ')+'</div></div></div></div>';

      // Approvals (moved from Settings — inline on home)
      if(approvalItems.length){
        html+='<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.5px;margin:18px 0 8px;">PENDING APPROVALS</div>';
        html+=approvalItems.map(function(ap){
          return '<div class="glass-premium glass-tile" style="padding:14px 16px;border-radius:14px;display:flex;align-items:center;gap:12px;margin-bottom:8px;border:1px solid var(--glassBorder);">'
            +'<div style="width:36px;height:36px;border-radius:11px;background:var(--violetSoft);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.3);">🔔</div>'
            +'<div style="flex:1;min-width:0;"><div style="font-size:13.5px;font-weight:700;">'+esc(ap.title)+'</div><div style="font-size:11px;color:var(--faint);margin-top:2px;">'+esc(ap.action)+'</div></div>'
            +'<button class="approve-btn ok" data-approve="'+ap.id+'">Approve</button>'
            +'<button class="approve-btn no" data-dismiss="'+ap.id+'">Dismiss</button></div>';
        }).join('');
      }

      // Needs attention list
      if(attentionItems.length){
        html+='<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.5px;margin:18px 0 8px;">OVERDUE &amp; STALE</div>';
        html+=attentionItems.map(function(item){
          var icon=item.kind==='task'?'✅':'🔁';
          var overdue=item.dueAt&&item.dueAt<Date.now();
          var accent=overdue?'var(--red)':'var(--amber)';
          return '<div class="glass-premium glass-tile" style="padding:14px 16px;border-radius:14px;display:flex;align-items:center;gap:12px;margin-bottom:8px;border-left:3px solid '+accent+';border-top:1px solid var(--glassBorder);border-right:1px solid var(--glassBorder);border-bottom:1px solid var(--glassBorder);">'
            +'<div style="font-size:18px;flex-shrink:0;">'+icon+'</div>'
            +'<div style="flex:1;min-width:0;"><div style="font-size:13.5px;font-weight:600;">'+esc(item.title)+'</div>'
            +(item.why?'<div style="font-size:11px;color:var(--faint);margin-top:2px;">'+esc(item.why)+'</div>':'')
            +'</div>'
            +(item.kind==='task'?'<button class="btn-glass home-complete-btn" data-task="'+item.id+'" style="font-size:11px;padding:7px 14px;border-radius:10px;">Done</button>':'<button class="btn-ghost home-snooze-btn" data-loop="'+item.id+'" style="font-size:11px;padding:7px 14px;">Snooze</button>')
            +'</div>';
        }).join('');
      }

      // Waiting on them
      if(waitingItems.length){
        html+='<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.5px;margin:18px 0 8px;">WAITING ON THEM</div>';
        html+=waitingItems.slice(0,5).map(function(item){
          var ageDays=Math.floor((Date.now()-(item.updatedAt||item.createdAt||Date.now()))/86400e3);
          var ageColor=ageDays>=7?'var(--red)':ageDays>=3?'var(--amber)':'var(--faint)';
          return '<div class="glass-premium glass-tile" style="padding:12px 14px;border-radius:12px;display:flex;align-items:center;gap:10px;margin-bottom:6px;border:1px solid var(--glassBorder);">'
            +'<div style="font-size:14px;opacity:.5;flex-shrink:0;">⏳</div>'
            +'<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;color:var(--text);">'+esc(item.title)+'</div></div>'
            +'<span style="font-size:10px;color:'+ageColor+';font-family:&quot;JetBrains Mono&quot;,monospace;font-weight:700;">'+ago(item.updatedAt||item.createdAt)+'</span>'
            +(ageDays>=3?'<button class="btn-ghost home-nudge-btn" data-loop="'+item.id+'" style="font-size:10px;padding:5px 10px;color:var(--amber);">Nudge</button>':'')
            +'</div>';
        }).join('');
      }

      // Team mini-status (managers+)
      if(team.length&&(me&&(me.role==='ceo'||me.role==='manager'))){
        html+='<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.5px;margin:18px 0 8px;">TEAM</div>';
        html+='<div class="glass-premium" style="padding:14px 16px;border-radius:16px;border:1px solid var(--glassBorder);">';
        html+=team.slice(0,4).map(function(t){
          var openColor=t.openTasks>5?'var(--red)':t.openTasks>0?'var(--amber)':'var(--green)';
          return '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;'+(team.indexOf(t)<Math.min(team.length,4)-1?'border-bottom:1px solid var(--glassBorder);':'')+'">'
            +avatarHtml(t.userId)
            +'<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;">'+esc(t.name||t.userId)+'</div>'
            +(t.completedToday>0?'<div style="font-size:10px;color:var(--green);font-family:&quot;JetBrains Mono&quot;,monospace;margin-top:1px;">'+t.completedToday+' done today</div>':'')
            +'</div>'
            +'<div style="text-align:right;"><div style="font-size:18px;font-weight:700;color:'+openColor+';font-family:&quot;JetBrains Mono&quot;,monospace;line-height:1;">'+t.openTasks+'</div><div style="font-size:9px;color:var(--faint);text-transform:uppercase;letter-spacing:.3px;">open</div></div></div>';
        }).join('');
        html+='</div>';
      }

      // Wins today
      if(wins.length){
        html+='<div style="font-size:11px;font-weight:700;color:var(--green);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.5px;margin:18px 0 8px;">✅ DONE TODAY</div>';
        html+='<div class="glass-premium" style="padding:16px 18px;border-radius:16px;display:flex;align-items:center;gap:14px;border:1px solid var(--glassBorder);">';
        html+='<div style="width:44px;height:44px;border-radius:13px;background:var(--greenSoft);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.3);">🏆</div>';
        html+='<div><div style="font-size:15px;font-weight:700;color:var(--green);">'+wins.length+' item'+(wins.length===1?'':'s')+' completed</div>';
        html+='<div style="font-size:12px;color:var(--muted);margin-top:2px;">Keep it up.</div></div></div>';
      }

      view.innerHTML=html;

      // Wire actions
      view.querySelectorAll('[data-approve]').forEach(function(b){b.onclick=function(){post('/api/approvals/'+b.dataset.approve+'/approve').then(function(){toast('Approved');loadToday();});};});
      view.querySelectorAll('[data-dismiss]').forEach(function(b){b.onclick=function(){post('/api/approvals/'+b.dataset.dismiss+'/dismiss').then(function(){toast('Dismissed');loadToday();});};});
      view.querySelectorAll('.home-complete-btn').forEach(function(b){
        b.onclick=function(){
          // optimistic: fade out + disable immediately
          var card=b.closest('.glass-tile')||b.closest('.gc');
          if(card){card.style.transition='opacity .3s,transform .3s';card.style.opacity='.4';card.style.transform='translateX(8px)';}
          b.disabled=true;b.textContent='...';
          post('/api/tasks/'+b.dataset.task+'/complete').then(function(){
            toast('Task completed');
            setTimeout(loadToday,300);
          }).catch(function(e){
            if(card){card.style.opacity='1';card.style.transform='none';}
            b.disabled=false;b.textContent='Done';
            toast(e&&e.message?e.message:'Failed');
          });
        };
      });
      view.querySelectorAll('.home-snooze-btn').forEach(function(b){b.onclick=function(){post('/api/loops/'+b.dataset.loop+'/snooze',{hours:24}).then(function(){toast('Snoozed 24h');loadToday();});};});
      view.querySelectorAll('.home-nudge-btn').forEach(function(b){b.onclick=function(){b.disabled=true;b.textContent='...';post('/api/loops/'+b.dataset.loop+'/snooze',{hours:1}).then(function(){toast('Reminder queued');loadToday();}).catch(function(){b.disabled=false;b.textContent='Nudge';});};});
    }).catch(function(e){
      view.innerHTML='<div class="gc" style="padding:20px;color:var(--muted);">Could not load your dashboard. '+(e&&e.message?esc(e.message):'')+' <button class="btn-ghost" onclick="loadToday()" style="margin-left:8px;">Retry</button></div>';
    });
  }

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

      var html='<div class="sec-head"><div><div class="sec-title">Follow-ups</div>'
        +'<div class="sec-sub">Who owes the next move across every channel.</div></div>'
        +'<div class="head-actions"><button class="btn-ghost" id="sweep-btn">↻ Check messages</button></div></div>'
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
      view.querySelectorAll('[data-assign-loop]').forEach(function(b){b.onclick=function(){openAssignPicker(b.dataset.assignLoop);};});
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

  // ── assign picker (replaces prompt() — real user dropdown) ─────────────────
  function openAssignPicker(loopId){
    // Build from TEAM_USERS (fetched on boot). Fallback to the demo USERS roster if admin/users not accessible.
    var users=TEAM_USERS.length?TEAM_USERS:Object.keys(USERS).map(function(uid){return{userId:uid,name:USERS[uid].name,role:USERS[uid].role};});
    var back=document.createElement('div');
    back.className='modal-backdrop open';
    back.style.zIndex='250';
    var html='<div class="modal-box" style="max-width:400px;">'
      +'<div class="modal-head"><span style="font-size:20px;">👤</span><span class="modal-title">Assign to</span><button class="modal-close" data-assign-close>×</button></div>'
      +'<div class="modal-body">'
      +'<select class="modal-select" id="assign-picker-select" style="margin-bottom:12px;">'
      +users.map(function(u){return '<option value="'+u.userId+'">'+esc(u.name||u.userId)+(u.role?' ('+u.role+')':'')+'</option>';}).join('')
      +'</select>'
      +'</div>'
      +'<div class="modal-foot"><button class="btn-ghost" data-assign-cancel>Cancel</button><button class="btn-primary" id="assign-picker-confirm">Assign</button></div>'
      +'</div>';
    back.innerHTML=html;
    document.body.appendChild(back);
    back.addEventListener('click',function(e){if(e.target===back)back.remove();});
    var closeBtn=back.querySelector('[data-assign-close]');
    if(closeBtn)closeBtn.onclick=function(){back.remove();};
    var cancelBtn=back.querySelector('[data-assign-cancel]');
    if(cancelBtn)cancelBtn.onclick=function(){back.remove();};
    var confirmBtn=back.querySelector('#assign-picker-confirm');
    var select=back.querySelector('#assign-picker-select');
    if(confirmBtn)confirmBtn.onclick=function(){
      var uid=select&&select.value;
      if(uid)post('/api/loops/'+loopId+'/assign',{userIds:[uid]}).then(function(){toast('Assigned');back.remove();loadLoops();}).catch(function(e){toast(e&&e.message?e.message:'Failed');});
    };
  }

  // ── tasks ─────────────────────────────────────────────────────────────────
  function loadTasks(){
    api('/api/tasks').then(function(tasks){
      tasks=tasks||[];
      // Tasks store day as enum: 'today' | 'tomorrow' | 'upcoming'. Bucket by enum, not by calendar date.
      var overdueAll=tasks.filter(function(t){return t.day!=='today'&&t.day!=='tomorrow'&&t.day!=='upcoming'&&!t.completed;});
      var todayTasks=tasks.filter(function(t){return t.day==='today'&&!t.completed;});
      var tmrTasks=tasks.filter(function(t){return t.day==='tomorrow'&&!t.completed;});
      var upcomingTasks=tasks.filter(function(t){return t.day==='upcoming'&&!t.completed;});
      var completedTasks=tasks.filter(function(t){return t.completed;});
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Tasks</div><div class="sec-sub">Your board — what needs doing and when.</div></div><div class="head-actions"><button class="btn-primary" id="new-task-btn">+ New task</button></div></div>'
        +'<div class="kanban-wrap">'
        +(overdueAll.length?'<div class="overdue-strip"><span class="overdue-strip-count">'+overdueAll.length+'</span><span class="overdue-strip-label">in an unknown day — move them or complete them</span></div>':'')
        +'<div class="kanban-board">'+kanbanCol('TODAY','#ef4444',todayTasks,'today')+kanbanCol('TOMORROW','#f59e0b',tmrTasks,'tomorrow')+kanbanCol('UPCOMING','#3e7bfa',upcomingTasks,'upcoming')+'</div>'
        +(completedTasks.length?'<div style="margin-top:20px;"><div style="font-size:11px;font-weight:700;color:var(--green);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.5px;margin-bottom:8px;">✅ COMPLETED ('+completedTasks.length+')</div>'+completedTasks.slice(0,10).map(function(t){return '<div class="item-card gc" style="opacity:.6;padding:10px 14px;margin-bottom:6px;"><span style="text-decoration:line-through;color:var(--muted);">'+esc(t.title)+'</span></div>';}).join('')+'</div>':'')
        +'</div>';
      var nt=document.getElementById('new-task-btn'); if(nt) nt.onclick=function(){openNewTaskModal();};
      ['today','tomorrow','upcoming'].forEach(function(d){var btn=document.getElementById('kadd-'+d);if(btn)btn.onclick=function(){openNewTaskModal(d);};});
      view.querySelectorAll('[data-done]').forEach(function(b){b.onclick=function(){post('/api/tasks/'+b.dataset.done+'/complete').then(function(){toast('Task completed');loadTasks();});};});
      view.querySelectorAll('[data-move]').forEach(function(b){b.onclick=function(){post('/api/tasks/'+b.dataset.move+'/move',{day:b.dataset.day}).then(function(){toast('Task moved');loadTasks();});};});
      view.querySelectorAll('[data-ai]').forEach(function(b){b.onclick=function(e){e.stopPropagation();openAiModal(b.dataset.ai);};});
      wireTaskDragAndDrop();
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load tasks: '+(e&&e.message||e)+'</div>';});
  }
  function kanbanCol(label,dotColor,items,colDay){
    var cards=items.length?items.map(function(t){
      var pr=t.priority==='high'?'<span class="priority-pill priority-high">HIGH</span>':t.priority==='med'?'<span class="priority-pill priority-med">MED</span>':t.priority==='low'?'<span class="priority-pill priority-low">LOW</span>':'';
      return '<div class="kanban-task-card gc" draggable="true" data-task-id="'+t.id+'"><div class="kanban-task-row"><button class="kanban-check" data-done="'+t.id+'"></button><span class="kanban-task-emoji">'+esc(t.emoji||'📝')+'</span><div style="flex:1;min-width:0;"><div class="kanban-task-title">'+esc(t.title)+'</div><div class="kanban-task-sub">'+esc(t.list||'Inbox')+'</div></div></div><div class="kanban-task-foot">'+pr+'<button class="btn-ghost" data-ai="'+t.id+'" title="Assign to AI" style="font-size:10px;padding:3px 8px;min-height:24px;">'+aiPill(t)+'</button>'+(colDay!=='today'?'<button class="btn-ghost" data-move="'+t.id+'" data-day="today" style="font-size:10px;padding:3px 8px;min-height:24px;">→ Today</button>':'')+'</div></div>';
    }).join(''):'<div class="empty-dashed" style="font-size:11px;padding:16px 12px;">No tasks for '+label.toLowerCase()+'.</div>';
    return '<div class="kanban-col"><div class="kanban-col-head"><span class="kanban-col-dot" style="background:'+dotColor+'"></span><span class="kanban-col-label">'+label+'</span><span class="kanban-col-count">'+items.length+'</span></div><div class="kanban-col-body" data-col-day="'+colDay+'">'+cards+'<button class="kanban-add-btn" id="kadd-'+colDay+'">+ Add</button></div></div>';
  }
  function wireTaskDragAndDrop(){
    var dragged=null;
    view.querySelectorAll('.kanban-task-card').forEach(function(card){
      card.addEventListener('dragstart',function(e){
        dragged=card;
        card.classList.add('dragging');
        try{e.dataTransfer.setData('text/plain',card.dataset.taskId);}catch(err){}
        e.dataTransfer.effectAllowed='move';
      });
      card.addEventListener('dragend',function(){
        card.classList.remove('dragging');
        view.querySelectorAll('.kanban-col-body.drag-over').forEach(function(c){c.classList.remove('drag-over');});
        dragged=null;
      });
    });
    view.querySelectorAll('.kanban-col-body').forEach(function(col){
      col.addEventListener('dragover',function(e){
        e.preventDefault();
        e.dataTransfer.dropEffect='move';
        col.classList.add('drag-over');
      });
      col.addEventListener('dragleave',function(){col.classList.remove('drag-over');});
      col.addEventListener('drop',function(e){
        e.preventDefault();
        col.classList.remove('drag-over');
        var taskId=dragged?dragged.dataset.taskId:(e.dataTransfer?e.dataTransfer.getData('text/plain'):null);
        var day=col.dataset.colDay;
        if(!taskId||!day)return;
        post('/api/tasks/'+taskId+'/move',{day:day}).then(function(){toast('Task moved');loadTasks();});
      });
    });
  }
  function isDueSoon(t){return t.dueAt&&t.dueAt>Date.now()&&t.dueAt<Date.now()+86400e3;}

  // ── leads ─────────────────────────────────────────────────────────────────
  var LEAD_STAGES=[{id:'new',label:'NEW',dot:'#9ca3af'},{id:'contacted',label:'CONTACTED',dot:'#3e7bfa'},{id:'meeting',label:'MEETING',dot:'#7c3aed'},{id:'proposal',label:'PROPOSAL',dot:'#f59e0b'},{id:'won',label:'WON',dot:'#10b981'},{id:'lost',label:'LOST',dot:'#ef4444'}];
  function loadLeads(){
    api('/api/leads').then(function(leads){
      leads=leads||[];
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Leads</div><div class="sec-sub">Pipeline — move each contact toward a close.</div></div><div class="head-actions"><button class="btn-primary" id="new-lead-btn">+ New lead</button></div></div><div class="pipeline-board">'
        +LEAD_STAGES.map(function(stage){var stageLeads=leads.filter(function(l){return(l.stage||'new')===stage.id;});var stageValue=stageLeads.reduce(function(s,l){return s+((typeof l.value==='number')?l.value:0);},0);return '<div class="pipeline-col"><div class="pipeline-col-head"><span class="pipeline-stage-dot" style="background:'+stage.dot+'"></span><span class="pipeline-stage-label">'+stage.label+'</span><span class="pipeline-col-count">'+stageLeads.length+(stageValue>0?' · $'+(stageValue>=1000?Math.round(stageValue/1000)+'k':stageValue):'')+'</span></div><div class="pipeline-col-body" data-stage="'+stage.id+'">'+(stageLeads.length?stageLeads.map(function(l){var initials=(l.name||'?').trim().split(/\s+/).slice(0,2).map(function(w){return w[0]?w[0].toUpperCase():'';}).join('');var hue=((l.name||'A').charCodeAt(0)*37)%360;var canAdv=stage.id!=='won'&&stage.id!=='lost';var valBadge=(typeof l.value==='number'&&l.value>0)?'<span style="font-size:10px;font-weight:700;color:var(--green);font-family:&quot;JetBrains Mono&quot;,monospace;">$'+(l.value>=1000?Math.round(l.value/1000)+'k':l.value)+'</span>':'';return '<div class="pipeline-lead-card gc" draggable="true" data-lead-id="'+l.id+'"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><div class="pipeline-lead-avatar" style="background:hsl('+hue+',35%,52%)">'+initials+'</div><div style="flex:1;min-width:0;"><div class="pipeline-lead-name">'+esc(l.name)+'</div>'+(l.company?'<div class="pipeline-lead-sub">'+esc(l.company)+'</div>':'')+'</div>'+valBadge+'</div><div class="pipeline-lead-foot">'+(canAdv?'<button class="plead-adv-btn" data-advance="'+l.id+'">Advance →</button>':'<span class="stage-pill lead-stage-'+stage.id+'">'+stage.label+'</span>')+(l.phone?'<a class="plead-adv-btn" href="https://wa.me/'+esc(l.phone.replace(/[^0-9]/g,''))+'" target="_blank" onclick="event.stopPropagation()">WA</a>':'')+'</div></div>';}).join(''):'<div style="font-size:11px;color:var(--faint);padding:10px 2px;">No leads here.</div>')+'</div></div>';}).join('')+'</div>';
      document.getElementById('new-lead-btn').onclick=function(){openNewLeadModal();};
      view.querySelectorAll('[data-advance]').forEach(function(b){b.onclick=function(e){e.stopPropagation();post('/api/leads/'+b.dataset.advance+'/advance').then(function(){toast('Advanced');loadLeads();});};});
      wireLeadDragAndDrop();
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load leads: '+(e&&e.message||e)+'</div>';});
  }
  function wireLeadDragAndDrop(){
    var dragged=null;
    view.querySelectorAll('.pipeline-lead-card').forEach(function(card){
      card.addEventListener('dragstart',function(e){
        dragged=card;
        card.classList.add('dragging');
        try{e.dataTransfer.setData('text/plain',card.dataset.leadId);}catch(err){}
        e.dataTransfer.effectAllowed='move';
      });
      card.addEventListener('dragend',function(){
        card.classList.remove('dragging');
        view.querySelectorAll('.pipeline-col-body.drag-over').forEach(function(c){c.classList.remove('drag-over');});
        dragged=null;
      });
    });
    view.querySelectorAll('.pipeline-col-body').forEach(function(col){
      col.addEventListener('dragover',function(e){
        e.preventDefault();
        e.dataTransfer.dropEffect='move';
        col.classList.add('drag-over');
      });
      col.addEventListener('dragleave',function(){col.classList.remove('drag-over');});
      col.addEventListener('drop',function(e){
        e.preventDefault();
        col.classList.remove('drag-over');
        var leadId=dragged?dragged.dataset.leadId:(e.dataTransfer?e.dataTransfer.getData('text/plain'):null);
        var stage=col.dataset.stage;
        if(!leadId||!stage)return;
        post('/api/leads/'+leadId+'/stage',{stage:stage},'PUT').then(function(){toast('Lead moved');loadLeads();});
      });
    });
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
  var AGENT_EMOJIS=['🤖','🔭','🗺️','📒','🧭','🛰️','🧠','⚡','🔔','🧩','🕵️','📡'];
  var agentEmojiPick='🤖';
  var editingAgentId=null;
  function customAgents(){
    try{return JSON.parse(localStorage.getItem('cb-custom-agents')||'[]');}catch(e){return [];}
  }
  function saveCustomAgents(list){
    localStorage.setItem('cb-custom-agents',JSON.stringify(list));
  }
  function loadAgents(){
    api('/api/agents').then(function(agents){
      agents=agents||[];
      var custom=customAgents();
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">AI Agents</div>'
        +'<div class="sec-sub">Your autonomous workforce — scoped, logged, fully reversible.</div></div></div>';
      var wrap=document.createElement('div');
      function agentCardHtml(a,isCustom){
        var done=a.done||0,pending=a.pending||0,total=done+pending;
        return '<div class="agent-card gc'+(isCustom?' custom':'')+'"'+(isCustom?' data-agent-id="'+a.id+'" style="cursor:pointer;"':'')+'>'
          +'<div style="display:flex;align-items:center;gap:13px;">'
          +'<div style="width:42px;height:42px;flex-shrink:0;border-radius:13px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 6px 16px var(--accentGlow);">'+esc(a.emoji||'🤖')+'</div>'
          +'<div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;gap:8px;"><span class="agent-name">'+esc(a.name)+'</span>'+autoBadge(a.autonomy)+'</div>'
          +'<div class="agent-role">'+esc(a.role)+'</div></div>'
          +(isCustom?'<button class="agent-remove-btn" data-remove-agent="'+a.id+'" title="Remove agent">✕</button>':'<span style="display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;color:var(--green);flex-shrink:0;"><span style="width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 0 3px rgba(55,192,138,.18);"></span>online</span>')
          +'</div>'+progBar(done,total)+'</div>';
      }
      var cards=agents.map(function(a){return agentCardHtml(a,false);}).join('');
      cards+=custom.map(function(a){return agentCardHtml(a,true);}).join('');
      if(!agents.length&&!custom.length) cards='<div class="empty-dashed">No agents configured yet.</div>';
      cards+='<button class="hire-btn" id="hire-agent-btn"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>Hire a new agent</button>';
      wrap.innerHTML=cards;
      view.appendChild(wrap);
      wrap.querySelector('#hire-agent-btn').onclick=function(){openAgentModal();};
      wrap.querySelectorAll('[data-agent-id]').forEach(function(el){
        el.onclick=function(e){
          if(e.target.closest('[data-remove-agent]'))return;
          openAgentModal(el.dataset.agentId);
        };
      });
      wrap.querySelectorAll('[data-remove-agent]').forEach(function(b){
        b.onclick=function(e){
          e.stopPropagation();
          var list=customAgents().filter(function(a){return a.id!==b.dataset.removeAgent;});
          saveCustomAgents(list);
          toast('Agent removed');
          loadAgents();
        };
      });
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load agents: '+(e&&e.message||e)+'</div>';});
  }
  function openAgentModal(agentId){
    var m=document.getElementById('agent-modal');
    if(!m)return;
    editingAgentId=agentId||null;
    var existing=agentId?customAgents().find(function(a){return a.id===agentId;}):null;
    document.getElementById('agent-modal-title').textContent=existing?'Edit agent':'Hire a new agent';
    document.getElementById('agent-modal-name').value=existing?existing.name:'';
    document.getElementById('agent-modal-role').value=existing?existing.role:'';
    document.getElementById('agent-modal-save').textContent=existing?'Save agent':'Hire agent';
    document.getElementById('agent-modal-delete').style.display=existing?'':'none';
    agentEmojiPick=existing?(existing.emoji||'🤖'):'🤖';
    renderAgentEmojiRow();
    var lvl=existing?(existing.autonomy||'ask'):'ask';
    m.querySelectorAll('#agent-modal-autonomy .lvl').forEach(function(b){b.classList.toggle('on',b.dataset.lvl===lvl);});
    m.classList.add('open');
    document.getElementById('agent-modal-name').focus();
  }
  function closeAgentModal(){
    var m=document.getElementById('agent-modal');
    if(m)m.classList.remove('open');
    editingAgentId=null;
  }
  function renderAgentEmojiRow(){
    var g=document.getElementById('agent-emoji-row');
    if(!g)return;
    g.innerHTML=AGENT_EMOJIS.map(function(em){return '<button type="button" class="emoji-pick-btn'+(em===agentEmojiPick?' on':'')+'" data-em="'+em+'">'+em+'</button>';}).join('');
    g.querySelectorAll('.emoji-pick-btn').forEach(function(b){b.onclick=function(){agentEmojiPick=b.dataset.em;renderAgentEmojiRow();};});
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
      // Filter out noisy internal automation events — a businessman cares about leads, tasks, loops, and approvals, not routine agent briefings.
      var HIDDEN_NOTIF_TYPES={'briefing.delivered':1};
      events=events.filter(function(e){return !HIDDEN_NOTIF_TYPES[e.type];});
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
    else if(tab==='tasks'||tab==='home') post('/api/tasks',{title:v,day:taskDay}).then(function(){toast('Task added');render();});
    else if(tab==='leads'){
      if(v.length>24||/[,@]/.test(v)) post('/api/leads/quick-add',{note:v}).then(function(){toast('Lead created from note');render();});
      else post('/api/leads',{name:v}).then(function(){toast('Lead created');render();});
    }
  };

  // FAB (mobile) — focus the quick-add input
  var fab=document.getElementById('fab');
  if(fab) fab.onclick=function(){qfield.focus();};

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
  var PROJECT_EMOJIS=['\u{1F4E6}','\u{1F4C4}','\u{1F4F1}','\u{1F680}','\u{1F4C5}','\u{1F91D}','\u{1F389}','\u{1F4BC}','\u{1F3AF}','\u{1F3A8}','\u{1F6E0}\uFE0F','\u{1F4CA}'];
  var PROJECT_COLORS=['#3e7bfa','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#6b7280','#14b8a6','#d946ef'];
  var selectedTemplate=0;
  var selectedColor=null;
  var selectedImage=null;
  var selectedEmoji=null;
  var editingProjectId=null;
  var viewingProjectId=null;
  function getProjects(){
    try{return JSON.parse(localStorage.getItem('cb-projects')||'[]');}catch(e){return [];}
  }
  function saveProjects(list){
    localStorage.setItem('cb-projects',JSON.stringify(list));
  }
  function projectCardBg(p){
    if(p.img) return 'url('+p.img+') center/cover no-repeat';
    return p.bg||PROJECT_PALETTES[0];
  }
  function loadProjects(){
    var projects=getProjects();
    var html='<div class="sec-head"><div><div class="sec-title">Projects</div><div class="sec-sub">Everything your team is building.</div></div><div class="head-actions"><button class="btn-primary" id="new-proj-btn">+ New project</button></div></div><div class="bento-grid">';
    projects.forEach(function(p,i){
      var bg=projectCardBg(p);
      var done=p.done||0;var total=p.total||0;
      var pct=total>0?Math.round(done/total*100):0;
      html+='<div class="bento-card'+(i===0?' bento-hero':'')+'" data-project-id="'+p.id+'" style="background:'+bg+';"><div class="bento-card-emoji">'+esc(p.emoji||'\u{1F4E6}')+'</div><div class="bento-card-name">'+esc(p.name)+'</div>'+(p.desc?'<div class="bento-card-desc">'+esc(p.desc)+'</div>':'')+'<div class="bento-card-foot">'+(total?'<div class="bento-prog-bar"><div class="bento-prog-fill" style="width:'+pct+'%"></div></div><span class="bento-pct">'+pct+'%</span>':'')+'<span class="bento-status">'+esc(p.status||'active')+'</span></div></div>';
    });
    html+='<button class="bento-new-card" id="bento-new-card-btn"><div style="font-size:28px;">+</div><div style="font-size:13px;font-weight:600;">New project</div></button></div>';
    view.innerHTML=html;
    var nbtn=document.getElementById('new-proj-btn');
    var nbtn2=document.getElementById('bento-new-card-btn');
    if(nbtn)nbtn.onclick=function(){openNewProjectModal();};
    if(nbtn2)nbtn2.onclick=function(){openNewProjectModal();};
    view.querySelectorAll('[data-project-id]').forEach(function(el){
      el.onclick=function(){openProjectDetail(el.dataset.projectId);};
    });
  }
  function openNewProjectModal(existingId){
    var m=document.getElementById('proj-modal');
    if(!m)return;
    editingProjectId=existingId||null;
    var existing=existingId?getProjects().find(function(p){return p.id===existingId;}):null;
    document.getElementById('proj-modal-title').textContent=existing?'Edit project':'New project';
    document.getElementById('proj-modal-save').textContent=existing?'Save changes':'Create project';
    document.getElementById('proj-modal-delete').style.display=existing?'':'none';
    document.getElementById('proj-modal-name').value=existing?existing.name:'';
    document.getElementById('proj-modal-desc').value=existing?(existing.desc||''):'';
    selectedTemplate=0;
    selectedColor=existing&&existing.color?existing.color:null;
    selectedImage=existing&&existing.img?existing.img:null;
    selectedEmoji=existing?(existing.emoji||null):null;
    renderTemplateGrid();
    renderProjColorRow();
    renderProjEmojiRow();
    updateProjImagePreview();
    m.classList.add('open');
    document.getElementById('proj-modal-name').focus();
  }
  function closeNewProjectModal(){
    var m=document.getElementById('proj-modal');
    if(m)m.classList.remove('open');
    editingProjectId=null;
  }
  function renderTemplateGrid(){
    var g=document.getElementById('proj-template-grid');
    if(!g)return;
    g.innerHTML=PROJECT_TEMPLATES.map(function(t,i){return '<div class="proj-tmpl-card" data-ti="'+i+'" style="aspect-ratio:3/2;border-radius:10px;display:flex;align-items:flex-end;padding:8px;cursor:pointer;border:2px solid transparent;background:'+t.bg+';transition:all .15s;"><span style="font-size:10.5px;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.4);">'+t.emoji+' '+t.name+'</span></div>';}).join('');
    g.querySelectorAll('.proj-tmpl-card').forEach(function(el){
      el.onclick=function(){
        selectedTemplate=parseInt(el.dataset.ti);
        selectedColor=null;
        selectedImage=null;
        selectedEmoji=null;
        renderTemplateGrid();
        renderProjColorRow();
        renderProjEmojiRow();
        updateProjImagePreview();
      };
      el.classList.toggle('on',!selectedColor&&!selectedImage&&parseInt(el.dataset.ti)===selectedTemplate);
      el.style.borderColor=(!selectedColor&&!selectedImage&&parseInt(el.dataset.ti)===selectedTemplate)?'var(--accent)':'transparent';
    });
  }
  function renderProjColorRow(){
    var g=document.getElementById('proj-color-row');
    if(!g)return;
    g.innerHTML=PROJECT_COLORS.map(function(c){return '<div class="proj-color-swatch'+(selectedColor===c?' on':'')+'" data-c="'+c+'" style="background:'+c+';"></div>';}).join('');
    g.querySelectorAll('.proj-color-swatch').forEach(function(el){
      el.onclick=function(){
        selectedColor='linear-gradient(135deg,'+el.dataset.c+','+el.dataset.c+'cc)';
        selectedImage=null;
        renderTemplateGrid();
        renderProjColorRow();
        updateProjImagePreview();
      };
    });
  }
  function renderProjEmojiRow(){
    var g=document.getElementById('proj-emoji-row');
    if(!g)return;
    var cur=selectedEmoji||(PROJECT_TEMPLATES[selectedTemplate]&&PROJECT_TEMPLATES[selectedTemplate].emoji)||PROJECT_EMOJIS[0];
    g.innerHTML=PROJECT_EMOJIS.map(function(em){return '<button type="button" class="emoji-pick-btn'+(em===cur?' on':'')+'" data-em="'+em+'">'+em+'</button>';}).join('');
    g.querySelectorAll('.emoji-pick-btn').forEach(function(b){b.onclick=function(){selectedEmoji=b.dataset.em;renderProjEmojiRow();};});
  }
  function updateProjImagePreview(){
    var p=document.getElementById('proj-upload-preview');
    var clearBtn=document.getElementById('proj-image-clear');
    if(!p)return;
    if(selectedImage){
      p.style.backgroundImage='url('+selectedImage+')';
      if(clearBtn)clearBtn.style.display='';
    }else{
      p.style.backgroundImage='';
      if(clearBtn)clearBtn.style.display='none';
    }
  }
  function currentProjectBgForSave(){
    if(selectedColor) return selectedColor;
    return PROJECT_TEMPLATES[selectedTemplate].bg;
  }
  function openProjectDetail(id){
    var projects=getProjects();
    var p=projects.find(function(x){return x.id===id;});
    if(!p)return;
    viewingProjectId=id;
    var m=document.getElementById('proj-detail-modal');
    if(!m)return;
    var bg=projectCardBg(p);
    var done=p.done||0,total=p.total||0;
    var body=document.getElementById('proj-detail-body');
    body.innerHTML='<div class="proj-detail-hero" style="background:'+bg+';"><div class="proj-detail-emoji">'+esc(p.emoji||'\u{1F4E6}')+'</div><div class="proj-detail-name">'+esc(p.name)+'</div></div>'
      +(p.desc?'<div style="font-size:13px;color:var(--muted);margin-bottom:14px;line-height:1.5;">'+esc(p.desc)+'</div>':'')
      +'<div class="proj-detail-row"><span style="font-size:11px;font-weight:700;color:var(--muted);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.5px;">STATUS</span><select class="modal-select" id="proj-detail-status" style="width:auto;flex:1;"><option value="active"'+(p.status==='active'?' selected':'')+'>Active</option><option value="paused"'+(p.status==='paused'?' selected':'')+'>Paused</option><option value="done"'+(p.status==='done'?' selected':'')+'>Done</option></select></div>'
      +'<div class="proj-detail-row"><span style="font-size:11px;font-weight:700;color:var(--muted);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.5px;">PROGRESS</span><button class="proj-stepper-btn" id="proj-detail-total-minus">−</button><span style="font-family:&quot;JetBrains Mono&quot;,monospace;font-size:13px;font-weight:600;min-width:56px;text-align:center;" id="proj-detail-progress-label">'+done+' / '+total+'</span><button class="proj-stepper-btn" id="proj-detail-total-plus">+</button></div>'
      +'<div class="proj-detail-row"><span style="font-size:11px;font-weight:700;color:var(--muted);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.5px;">DONE STEPS</span><button class="proj-stepper-btn" id="proj-detail-done-minus">−</button><button class="proj-stepper-btn" id="proj-detail-done-plus">+</button></div>'
      +'<div style="font-size:10.5px;color:var(--faint);">Created '+new Date(p.createdAt||Date.now()).toLocaleDateString()+'</div>';
    function refreshProgress(){
      var cur=getProjects().find(function(x){return x.id===id;});
      if(!cur)return;
      document.getElementById('proj-detail-progress-label').textContent=(cur.done||0)+' / '+(cur.total||0);
    }
    function updateProject(patch){
      var list=getProjects();
      var idx=list.findIndex(function(x){return x.id===id;});
      if(idx<0)return;
      list[idx]=Object.assign({},list[idx],patch);
      saveProjects(list);
      refreshProgress();
    }
    document.getElementById('proj-detail-status').onchange=function(e){updateProject({status:e.target.value});};
    document.getElementById('proj-detail-total-plus').onclick=function(){var cur=getProjects().find(function(x){return x.id===id;});updateProject({total:(cur.total||0)+1});};
    document.getElementById('proj-detail-total-minus').onclick=function(){var cur=getProjects().find(function(x){return x.id===id;});updateProject({total:Math.max(cur.done||0,(cur.total||0)-1)});};
    document.getElementById('proj-detail-done-plus').onclick=function(){var cur=getProjects().find(function(x){return x.id===id;});updateProject({done:Math.min(cur.total||0,(cur.done||0)+1)});};
    document.getElementById('proj-detail-done-minus').onclick=function(){var cur=getProjects().find(function(x){return x.id===id;});updateProject({done:Math.max(0,(cur.done||0)-1)});};
    m.classList.add('open');
  }
  function closeProjectDetail(){
    var m=document.getElementById('proj-detail-modal');
    if(m)m.classList.remove('open');
    loadProjects();
    viewingProjectId=null;
  }
  function deleteProject(id){
    var list=getProjects().filter(function(p){return p.id!==id;});
    saveProjects(list);
  }
  // --- AI tasks: assign an action, watch the run, approve an awaiting_review draft. ---
  var AI_LABEL={queued:'Queued',running:'Running',awaiting_review:'Review',done:'Done',failed:'Failed',cancelled:'Off'};
  function aiPill(t){
    if(!t.aiAction) return 'AI';
    return 'AI: '+(AI_LABEL[t.aiStatus||'queued']||t.aiStatus);
  }
  var aiModalTaskId=null;
  function openAiModal(taskId){
    var m=document.getElementById('ai-modal');
    if(!m)return;
    aiModalTaskId=taskId;
    api('/api/tasks').then(function(tasks){
      var t=(tasks||[]).filter(function(x){return x.id===taskId;})[0]||{};
      document.getElementById('ai-modal-task').textContent=t.title||taskId;
      document.getElementById('ai-modal-action').value=t.aiAction||'';
      document.getElementById('ai-modal-prompt').value=(t.aiConfig&&t.aiConfig.promptOverride)||'';
      document.getElementById('ai-modal-model').value=(t.aiConfig&&t.aiConfig.modelOverride)||'';
      loadAiRuns(taskId);
      m.classList.add('open');
    }).catch(function(e){toast('Could not open: '+(e&&e.message||e));});
  }
  function closeAiModal(){
    var m=document.getElementById('ai-modal');
    if(m)m.classList.remove('open');
    aiModalTaskId=null;
  }
  function loadAiRuns(taskId){
    var box=document.getElementById('ai-modal-runs');
    if(!box)return;
    api('/api/tasks/'+taskId+'/ai-runs').then(function(r){
      var runs=(r&&r.runs)||[];
      if(!runs.length){box.textContent='No runs yet.';return;}
      box.innerHTML=runs.map(function(run){
        var head='<div style="font-size:11px;color:var(--muted);">'+esc(run.model)+' - '+esc(run.status)+' - '+ago(run.at)+'</div>';
        var body=run.error
          ? '<div style="font-size:12px;color:var(--red);margin-top:4px;">'+esc(run.error)+'</div>'
          : '<div style="font-size:12px;margin-top:4px;white-space:pre-wrap;max-height:140px;overflow:auto;">'+esc((run.output||'').slice(0,1200))+'</div>';
        var link=(run.resultRef&&(run.resultRef.indexOf('https://')===0||run.resultRef.indexOf('http://')===0))
          ? '<div style="margin-top:4px;"><a href="'+esc(run.resultRef)+'" target="_blank" rel="noopener noreferrer" style="font-size:11px;">Open result</a></div>'
          : '';
        var approve=run.status==='awaiting_review'
          ? '<button class="btn-primary" data-approve="'+esc(run.id)+'" style="font-size:11px;padding:4px 10px;min-height:26px;margin-top:6px;">Approve and run</button>'
          : '';
        return '<div class="gc" style="padding:10px 12px;margin-bottom:8px;border-radius:12px;">'+head+body+link+approve+'</div>';
      }).join('');
      box.querySelectorAll('[data-approve]').forEach(function(b){
        b.onclick=function(){
          post('/api/ai-runs/'+b.dataset.approve+'/approve').then(function(){
            toast('Approved - running the action');
            setTimeout(function(){pollAiRuns(taskId,4);loadTasks();},800);
          }).catch(function(e){toast('Approve failed: '+(e&&e.message||e));});
        };
      });
    }).catch(function(){box.textContent='Could not load runs.';});
  }
  // The run happens in the background worker, so re-poll briefly until it settles.
  function pollAiRuns(taskId,tries){
    loadAiRuns(taskId);
    if(tries>0) setTimeout(function(){
      if(aiModalTaskId===taskId) pollAiRuns(taskId,tries-1);
    },1200);
  }
  function saveAiAction(){
    if(!aiModalTaskId)return;
    var taskId=aiModalTaskId;
    var action=document.getElementById('ai-modal-action').value||null;
    var promptOverride=document.getElementById('ai-modal-prompt').value.trim();
    var modelOverride=document.getElementById('ai-modal-model').value.trim();
    var config={};
    if(promptOverride)config.promptOverride=promptOverride;
    if(modelOverride)config.modelOverride=modelOverride;
    post('/api/tasks/'+taskId+'/ai',{action:action,config:Object.keys(config).length?config:undefined}).then(function(){
      toast(action?'Queued for AI':'AI action cleared');
      loadTasks();
      if(action){setTimeout(function(){pollAiRuns(taskId,4);loadTasks();},1200);}else{closeAiModal();}
    }).catch(function(e){toast('Failed: '+(e&&e.message||e));});
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
    ['lead-name','lead-phone','lead-email','lead-company','lead-title','lead-value','lead-notes'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
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
    var mai=document.getElementById('ai-modal');
    if(mai){
      document.getElementById('ai-modal-close').onclick=closeAiModal;
      document.getElementById('ai-modal-cancel').onclick=closeAiModal;
      mai.onclick=function(e){if(e.target===mai)closeAiModal();};
      document.getElementById('ai-modal-save').onclick=saveAiAction;
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
        var lv=document.getElementById('lead-value');
        post('/api/leads',{name:name,phone:document.getElementById('lead-phone').value.trim()||undefined,email:document.getElementById('lead-email').value.trim()||undefined,company:document.getElementById('lead-company').value.trim()||undefined,title:document.getElementById('lead-title').value.trim()||undefined,value:lv&&lv.value?Number(lv.value):undefined,what:document.getElementById('lead-notes').value.trim()||undefined}).then(function(){closeNewLeadModal();toast('Lead created');loadLeads();});
      };
    }
    var mp=document.getElementById('proj-modal');
    if(mp){
      document.getElementById('proj-modal-close').onclick=closeNewProjectModal;
      document.getElementById('proj-modal-cancel').onclick=closeNewProjectModal;
      mp.onclick=function(e){if(e.target===mp)closeNewProjectModal();};
      var projImgBtn=document.getElementById('proj-image-btn');
      var projImgFile=document.getElementById('proj-image-file');
      var projImgClear=document.getElementById('proj-image-clear');
      if(projImgBtn&&projImgFile){
        projImgBtn.onclick=function(){projImgFile.click();};
        projImgFile.onchange=function(){
          var file=projImgFile.files&&projImgFile.files[0];
          if(!file)return;
          var reader=new FileReader();
          reader.onload=function(e){
            selectedImage=e.target.result;
            selectedColor=null;
            updateProjImagePreview();
            renderTemplateGrid();
            renderProjColorRow();
          };
          reader.readAsDataURL(file);
        };
      }
      if(projImgClear) projImgClear.onclick=function(){selectedImage=null;projImgFile.value='';updateProjImagePreview();};
      document.getElementById('proj-modal-delete').onclick=function(){
        if(!editingProjectId)return;
        deleteProject(editingProjectId);
        closeNewProjectModal();
        toast('Project deleted');
        loadProjects();
      };
      document.getElementById('proj-modal-save').onclick=function(){
        var name=document.getElementById('proj-modal-name').value.trim();
        if(!name)return;
        var desc=document.getElementById('proj-modal-desc').value.trim();
        var emoji=selectedEmoji||PROJECT_TEMPLATES[selectedTemplate].emoji;
        var bg=currentProjectBgForSave();
        var projects=getProjects();
        if(editingProjectId){
          var idx=projects.findIndex(function(p){return p.id===editingProjectId;});
          if(idx>=0){
            projects[idx]=Object.assign({},projects[idx],{name:name,desc:desc,emoji:emoji,bg:bg,color:selectedColor,img:selectedImage});
          }
          toast('Project updated');
        }else{
          projects.unshift({id:Date.now().toString(),name:name,desc:desc,emoji:emoji,bg:bg,color:selectedColor,img:selectedImage,status:'active',done:0,total:0,createdAt:Date.now()});
          toast('Project created');
        }
        saveProjects(projects);
        closeNewProjectModal();
        loadProjects();
      };
    }
    var pdm=document.getElementById('proj-detail-modal');
    if(pdm){
      document.getElementById('proj-detail-close').onclick=closeProjectDetail;
      document.getElementById('proj-detail-close-btn').onclick=closeProjectDetail;
      pdm.onclick=function(e){if(e.target===pdm)closeProjectDetail();};
      document.getElementById('proj-detail-edit').onclick=function(){
        var id=viewingProjectId;
        closeProjectDetail();
        openNewProjectModal(id);
      };
      document.getElementById('proj-detail-delete').onclick=function(){
        if(!viewingProjectId)return;
        deleteProject(viewingProjectId);
        closeProjectDetail();
        toast('Project deleted');
      };
    }
    var agm=document.getElementById('agent-modal');
    if(agm){
      document.getElementById('agent-modal-close').onclick=closeAgentModal;
      document.getElementById('agent-modal-cancel').onclick=closeAgentModal;
      agm.onclick=function(e){if(e.target===agm)closeAgentModal();};
      agm.querySelectorAll('#agent-modal-autonomy .lvl').forEach(function(b){
        b.onclick=function(){agm.querySelectorAll('#agent-modal-autonomy .lvl').forEach(function(x){x.classList.remove('on');});b.classList.add('on');};
      });
      document.getElementById('agent-modal-delete').onclick=function(){
        if(!editingAgentId)return;
        var list=customAgents().filter(function(a){return a.id!==editingAgentId;});
        saveCustomAgents(list);
        closeAgentModal();
        toast('Agent removed');
        loadAgents();
      };
      document.getElementById('agent-modal-save').onclick=function(){
        var name=document.getElementById('agent-modal-name').value.trim();
        if(!name)return;
        var role=document.getElementById('agent-modal-role').value.trim()||'Custom agent';
        var lvlBtn=agm.querySelector('#agent-modal-autonomy .lvl.on');
        var autonomy=lvlBtn?lvlBtn.dataset.lvl:'ask';
        var list=customAgents();
        if(editingAgentId){
          var idx=list.findIndex(function(a){return a.id===editingAgentId;});
          if(idx>=0) list[idx]=Object.assign({},list[idx],{name:name,role:role,emoji:agentEmojiPick,autonomy:autonomy});
          toast('Agent updated');
        }else{
          list.push({id:'agent_custom_'+Date.now(),name:name,role:role,emoji:agentEmojiPick,autonomy:autonomy,done:0,pending:0});
          toast('Agent hired');
        }
        saveCustomAgents(list);
        closeAgentModal();
        loadAgents();
      };
    }
    var am=document.getElementById('auth-modal');
    if(am){
      var idInput=document.getElementById('auth-identifier');
      var pwInput=document.getElementById('auth-password');
      var loginBtn=document.getElementById('auth-login-btn');
      if(loginBtn) loginBtn.onclick=loginWithPassword;
      if(idInput) idInput.onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();loginWithPassword();}};
      if(pwInput) pwInput.onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();loginWithPassword();}};
    }
    var lo=document.getElementById('logout-btn');
    if(lo) lo.onclick=function(){logoutSession();};
    var loTop=document.getElementById('topbar-logout-btn');
    if(loTop) loTop.onclick=function(){logoutSession();};
  })();
  var teamView='ceo';
  function loadTeam(){
    var role=me&&me.role;
    var isManager=role==='ceo'||role==='manager';
    var subViews=[{id:'ceo',label:'CEO'},{id:'mgr',label:'Manager'},{id:'emp',label:'Employee'},{id:'client',label:'Client'},{id:'agents',label:'AI Agents'}];
    var html='<div class="sec-head"><div><div class="sec-title">Team</div><div class="sec-sub">Per-employee performance from time tracking.</div></div></div>';
    if(teamView==='agents'){loadAgents();return;}
    // Access guard: only managers/CEOs see team performance dashboards
    if(!isManager){
      html+='<div class="gc" style="padding:40px 24px;border-radius:16px;text-align:center;">'
        +'<div style="font-size:34px;margin-bottom:10px;">🔒</div>'
        +'<div style="font-size:15px;font-weight:700;">You don\u2019t have access</div>'
        +'<div style="font-size:12.5px;color:var(--muted);margin-top:6px;">Team performance dashboards are available to managers and CEOs.</div></div>';
      view.innerHTML=html;
      return;
    }
    html+='<div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:20px;background:var(--bg2);border:1px solid var(--glassBorder);border-radius:12px;padding:3px;width:fit-content;">'+subViews.map(function(sv){return '<button class="team-sv-btn'+(sv.id===teamView?' on':'')+'" data-sv="'+sv.id+'" style="padding:7px 14px;border-radius:9px;border:none;background:'+(sv.id===teamView?'var(--surface)':'transparent')+';font-size:12.5px;font-weight:'+(sv.id===teamView?'600':'500')+';color:'+(sv.id===teamView?'var(--text)':'var(--muted)')+';min-height:36px;cursor:pointer;box-shadow:'+(sv.id===teamView?'var(--shadow-md)':'none')+';">'+sv.label+'</button>';}).join('')+'</div>';
    view.innerHTML=html+'<div class="spin"></div>';
    api('/api/team/performance').then(function(res){
      res=res||[];
      var people=Array.isArray(res)?res:(res.people||res.team||[]);
      people=people.slice().sort(function(a,b){return (b.points||0)-(a.points||0);});
      var detail='';
      if(teamView==='ceo'){
        // Aggregate KPIs across the team
        var totTasks=people.reduce(function(s,p){return s+(p.tasksDone||0);},0);
        var totLoops=people.reduce(function(s,p){return s+(p.loopsClosed||0);},0);
        var totFocus=people.reduce(function(s,p){return s+(p.focusMinutes||0);},0);
        detail='<div class="kpi-grid">'
          +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--accent)">'+people.length+'</div><div class="kpi-lbl">team members</div></div>'
          +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--green)">'+totTasks+'</div><div class="kpi-lbl">tasks done (30d)</div></div>'
          +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--amber)">'+totLoops+'</div><div class="kpi-lbl">loops closed</div></div>'
          +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--teal)">'+Math.round(totFocus/60)+'h</div><div class="kpi-lbl">focus time</div></div>'
          +'</div>';
      }else if(teamView==='mgr'){
        detail='<div class="gc" style="padding:18px 20px;border-radius:16px;"><div style="font-size:14px;font-weight:700;margin-bottom:14px;">Workload overview</div>';
        if(people.length){
          var maxTasks=Math.max.apply(null,people.map(function(p){return p.tasksDone||0;}).concat([1]));
          detail+=people.map(function(p){
            var pct=Math.round(((p.tasksDone||0)/maxTasks)*100);
            return '<div style="margin-bottom:14px;"><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px;"><span>'+esc(p.name||'Unknown')+'</span><span style="color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;">'+(p.tasksDone||0)+' tasks</span></div><div style="height:5px;border-radius:5px;background:var(--bg2);overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:var(--accent);border-radius:5px;"></div></div></div>';
          }).join('');
        }else{
          detail+='<div class="empty-dashed">No team data yet — connect time tracking.</div>';
        }
        detail+='</div>';
      }
      // Employee cards (real data) for ceo/mgr/emp views
      if(teamView==='ceo'||teamView==='mgr'||teamView==='emp'){
        detail+='<div class="gc" style="padding:18px 20px;border-radius:16px;"><div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin-bottom:12px;">'+(teamView==='emp'?'YOUR STATS':'TEAM MEMBERS')+'</div>';
        if(people.length){
          detail+=people.map(function(p){
            var initials=(p.name||'?').trim().split(/\s+/).slice(0,2).map(function(w){return w[0].toUpperCase();}).join('');
            var hue=((p.name||'A').charCodeAt(0)*37)%360;
            return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--glassBorder);">'
              +'<div style="width:36px;height:36px;border-radius:50%;background:hsl('+hue+',35%,52%);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;">'+esc(initials)+'</div>'
              +'<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;">'+esc(p.name||'Unknown')+(p.role?' <span style="color:var(--muted);font-weight:500;font-size:11px;">('+esc(p.role)+')</span>':'')+'</div>'
              +'<div style="font-size:11px;color:var(--muted);margin-top:2px;font-family:\\'JetBrains Mono\\',monospace;">'+(p.tasksDone||0)+' tasks · '+(p.loopsClosed||0)+' loops · '+Math.round((p.focusMinutes||0)/60)+'h focus</div></div>'
              +'<div style="font-family:\\'JetBrains Mono\\',monospace;font-size:12px;font-weight:600;color:var(--accent);">'+(p.points||0)+' pts</div></div>';
          }).join('');
        }else{
          detail+='<div class="empty-dashed">No team data yet — connect time tracking.</div>';
        }
        detail+='</div>';
      }
      if(teamView==='client'){
        detail='<div class="gc" style="padding:18px 20px;border-radius:16px;border-left:3px solid var(--teal);"><div style="font-size:11px;font-weight:700;color:var(--teal);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin-bottom:8px;">CLIENT PORTAL - READ ONLY</div><div style="font-size:15px;font-weight:700;margin-bottom:4px;">Your project</div><div style="font-size:12.5px;color:var(--muted);">Project deliverables and progress will appear here once shared.</div></div>';
      }
      view.innerHTML=html+detail;
      view.querySelectorAll('[data-sv]').forEach(function(b){b.onclick=function(){teamView=b.dataset.sv;loadTeam();};});
    }).catch(function(e){
      view.innerHTML=html+'<div class="empty">Failed to load team data: '+(e&&e.message||e)+'</div>';
      view.querySelectorAll('[data-sv]').forEach(function(b){b.onclick=function(){teamView=b.dataset.sv;loadTeam();};});
    });
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
  // ── methods (productivity) ────────────────────────────────────────────────────
  function methodTaskCard(t){
    var pr=t.priority==='high'?'<span class="priority-pill priority-high">HIGH</span>':t.priority==='med'?'<span class="priority-pill priority-med">MED</span>':t.priority==='low'?'<span class="priority-pill priority-low">LOW</span>':'';
    return '<div class="kanban-task-card gc" data-mtask="'+esc(t.id||'')+'" style="cursor:pointer;">'
      +'<div class="kanban-task-row"><button class="kanban-check" data-mdone="'+esc(t.id||'')+'"></button>'
      +'<span class="kanban-task-emoji">'+esc(t.emoji||'📝')+'</span>'
      +'<div style="flex:1;min-width:0;"><div class="kanban-task-title">'+esc(t.title||t.name||'Untitled')+'</div>'
      +(t.note||t.list?'<div class="kanban-task-sub">'+esc(t.note||t.list)+'</div>':'')+'</div></div>'
      +'<div class="kanban-task-foot">'+pr+'</div></div>';
  }
  function wireMethodTaskCards(){
    view.querySelectorAll('[data-mtask]').forEach(function(c){
      c.onclick=function(e){
        if(e.target.classList.contains('kanban-check'))return;
        toast('Opening task\u2026');
      };
    });
    view.querySelectorAll('[data-mdone]').forEach(function(b){
      b.onclick=function(e){
        e.stopPropagation();
        var id=b.dataset.mdone;
        if(!id)return;
        post('/api/tasks/'+id+'/complete').then(function(){toast('Task completed');}).catch(function(){});
      };
    });
  }
  function renderMethodResult(methodId, result, meta){
    result=result||{};
    function col(label, dotColor, tasks){
      tasks=tasks||[];
      var cards=tasks.length?tasks.map(methodTaskCard).join(''):'<div class="empty-dashed" style="font-size:11px;padding:14px 10px;">Nothing here.</div>';
      return '<div class="kanban-col"><div class="kanban-col-head"><span class="kanban-col-dot" style="background:'+dotColor+'"></span><span class="kanban-col-label">'+label+'</span><span class="kanban-col-count">'+tasks.length+'</span></div><div class="kanban-col-body">'+cards+'</div></div>';
    }
    function listSection(label, dotColor, tasks){
      tasks=tasks||[];
      var items=tasks.length?tasks.map(methodTaskCard).join(''):'<div class="empty-dashed" style="font-size:11px;padding:14px 10px;">Nothing here.</div>';
      return '<div class="gc" style="padding:14px 16px;border-radius:14px;margin-bottom:14px;">'
        +'<div style="display:flex;align-items:center;gap:7px;margin-bottom:10px;"><span style="width:8px;height:8px;border-radius:2px;background:'+dotColor+';flex-shrink:0;"></span>'
        +'<span style="font-family:\\'JetBrains Mono\\',monospace;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);">'+label+'</span>'
        +'<span style="margin-left:auto;font-family:\\'JetBrains Mono\\',monospace;font-size:11px;color:var(--faint);">'+tasks.length+'</span></div>'
        +'<div style="display:flex;flex-direction:column;gap:7px;">'+items+'</div></div>';
    }
    var html='<div style="margin-bottom:16px;display:flex;align-items:center;gap:10px;">'
      +'<button class="btn-ghost" id="methods-back" style="font-size:12px;padding:7px 12px;">← All methods</button>'
      +'<div style="font-size:16px;">'+esc((meta&&meta.icon)||'🧭')+'</div>'
      +'<div><div style="font-size:16px;font-weight:700;">'+esc((meta&&meta.name)||methodId)+'</div>'
      +'<div style="font-size:11px;color:var(--muted);margin-top:2px;">'+esc((meta&&meta.description)||'')+'</div></div></div>';

    if(methodId==='eisenhower'){
      html+='<div class="kanban-board" style="grid-template-columns:repeat(4,1fr);">'
        +col('Q1 · DO','#ef4444',result.q1||result.do)
        +col('Q2 · SCHEDULE','#3e7bfa',result.q2||result.schedule)
        +col('Q3 · DELEGATE','#f59e0b',result.q3||result.delegate)
        +col('Q4 · DROP','#9ca3af',result.q4||result.drop)
        +'</div>';
    }else if(methodId==='moscow'){
      html+=listSection('MUST HAVE','#ef4444',result.must||result.M)
        +listSection('SHOULD HAVE','#f59e0b',result.should||result.S)
        +listSection('COULD HAVE','#3e7bfa',result.could||result.C)
        +listSection('WON\u2019T HAVE','#9ca3af',result.wont||result.W);
    }else if(methodId==='abcde'){
      var ranks=[{k:'A',col:'#ef4444'},{k:'B',col:'#f59e0b'},{k:'C',col:'#3e7bfa'},{k:'D',col:'#9ca3af'},{k:'E',col:'#6b7280'}];
      var tasks=result.tasks||result.ranked||[];
      html+='<div style="display:flex;flex-direction:column;gap:7px;">'+tasks.map(function(t){
        var rk=(t.rank||'').toString().toUpperCase().charAt(0);
        var rc=ranks.filter(function(r){return r.k===rk;})[0]||{col:'var(--faint)'};
        var c2=methodTaskCard(Object.assign({},t));
        return '<div style="display:flex;gap:10px;">'
          +'<span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;background:'+rc.col+'22;color:#fff;font-weight:700;font-size:14px;font-family:\\'JetBrains Mono\\',monospace;flex-shrink:0;">'+esc(rk||'?')+'</span>'
          +'<div style="flex:1;min-width:0;">'+c2+'</div></div>';
      }).join('')+'</div>';
    }else if(methodId==='gtd'){
      var groups=result.contexts||result.groups||{};
      var inbox=result.inbox||[];
      var keys=Object.keys(groups);
      html+=(inbox.length?listSection('INBOX','#9ca3af',inbox):'')
        +keys.map(function(k){return listSection(k,'#3e7bfa',groups[k]||[]);}).join('');
      if(!inbox.length&&!keys.length)html+='<div class="empty-dashed">Your inbox is clear. Nothing to organize.</div>';
    }else if(methodId==='twominute'){
      html+='<div class="kanban-board" style="grid-template-columns:repeat(2,1fr);">'
        +col('DO NOW < 2 MIN','#10b981',result.doNow||result.quick||[])
        +col('LONGER','#3e7bfa',result.longer||result.longerTasks||[])
        +'</div>';
    }else if(methodId==='frog'){
      var f=result.frog||result.task;
      html+='<div class="gc" style="padding:22px;border-radius:16px;border-left:4px solid var(--red);margin-bottom:14px;">'
        +'<div style="font-size:11px;font-weight:700;color:var(--red);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;">🐸 EAT THIS FROG FIRST</div>'
        +'<div style="font-size:18px;font-weight:700;margin-top:10px;">'+esc(f&&(f.title)||'No frog identified today')+'</div>'
        +(f&&(f.why||f.reason)?'<div style="font-size:12.5px;color:var(--muted);margin-top:8px;line-height:1.5;">'+esc(f.why||f.reason)+'</div>':'')
        +'</div>';
    }else if(methodId==='threethree'){
      html+='<div class="kanban-board" style="grid-template-columns:repeat(3,1fr);">'
        +col('DEEP WORK','#3e7bfa',(result.deep||[]).slice(0,3))
        +col('MEDIUM','#f59e0b',(result.medium||[]).slice(0,3))
        +col('SMALL','#10b981',(result.small||[]).slice(0,3))
        +'</div>';
    }else if(methodId==='pareto'){
      html+=listSection('VITAL 20%','#ef4444',result.vital||result.vital20||[])
        +listSection('USEFUL 80%','#9ca3af',result.useful||result.useful80||[]);
    }else if(methodId==='timeblock'){
      var blocks=result.blocks||[];
      html+='<div class="gc" style="padding:16px 18px;border-radius:16px;">';
      var colmap={deep:'var(--blue)',meeting:'var(--amber)',admin:'var(--faint)',call:'var(--teal)',focus:'var(--green)'};
      for(var h=9;h<=18;h++){
        var hh=(h<10?'0':'')+h;
        var slot=blocks.filter(function(b){return (b.start||9)<=h&&(b.end||19)>h;});
        html+='<div style="display:flex;align-items:stretch;gap:0;border-bottom:1px solid var(--glassBorder);min-height:32px;">'
          +'<div style="width:46px;font-family:\\'JetBrains Mono\\',monospace;font-size:10px;color:var(--muted);padding:6px 0;flex-shrink:0;">'+hh+':00</div>'
          +'<div style="flex:1;display:flex;flex-direction:column;gap:3px;padding:4px 0;">';
        if(slot.length){
          slot.forEach(function(b){
            var c=colmap[b.type]||'var(--faint)';
            html+='<div style="background:'+c+'22;border-radius:7px;padding:5px 9px;font-size:11.5px;font-weight:600;color:var(--text);">'+esc(b.title||b.type||'block')+'</div>';
          });
        }
        html+='</div></div>';
      }
      html+='</div>';
    }else if(methodId==='pomodoro'){
      var tasks=result.tasks||[];
      html+='<div class="gc" style="padding:16px 18px;border-radius:16px;">'
        +'<div style="font-size:12px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin-bottom:12px;">🍅 POMODORO PLAN</div>'
        +'<div style="display:flex;flex-direction:column;gap:8px;">'+(tasks.length?tasks.map(function(t){
          var sess=t.sessions||t.pomodoros||Math.ceil((t.minutes||25)/25);
          return '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--glassBorder);">'
            +'<span style="font-size:16px;">🍅</span>'
            +'<div style="flex:1;font-size:13px;font-weight:600;">'+esc(t.title||'Task')+'</div>'
            +'<span style="font-family:\\'JetBrains Mono\\',monospace;font-size:12px;font-weight:600;color:var(--accent);">'+esc(sess)+' \u00d7 <span style="color:var(--muted);font-weight:500;">('+(t.minutes||sess*25)+'m)</span></span></div>';
        }).join(''):'<div class="empty-dashed">No tasks to plan.</div>')+'</div></div>';
    }else{
      // Fallback: try to render known arrays
      var keys=Object.keys(result).filter(function(k){return Array.isArray(result[k]);});
      if(keys.length){
        html+=keys.map(function(k){return listSection(k.toUpperCase(),'#3e7bfa',result[k]);}).join('');
      }else{
        html+='<div class="gc" style="padding:18px;border-radius:16px;"><div style="font-size:13px;color:var(--muted);">No structured output for this method yet.</div></div>';
      }
    }
    view.innerHTML=html;
    var back=document.getElementById('methods-back');
    if(back) back.onclick=function(){tab='methods';buildNav();loadMethods();};
    wireMethodTaskCards();
  }
  function loadMethods(){
    api('/api/methods').then(function(res){
      var methods=(res&&res.methods)||[];
      if(!methods.length){
        view.innerHTML='<div class="sec-head"><div><div class="sec-title">Methods</div><div class="sec-sub">Productivity frameworks to triage and plan your work.</div></div></div>'
          +'<div class="empty-dashed">No methods available yet.</div>';
        return;
      }
      view.innerHTML='<div class="sec-head"><div><div class="sec-title">Methods</div><div class="sec-sub">Productivity frameworks — pick one to triage your tasks.</div></div></div>'
        +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">'+methods.map(function(m){
          return '<div class="gc method-card" data-method="'+esc(m.id)+'" style="padding:16px;border-radius:14px;cursor:pointer;transition:transform .15s,box-shadow .15s;">'
            +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;">'
            +'<span style="width:38px;height:38px;border-radius:10px;background:var(--accentSoft);display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0;">'+esc(m.icon||'🧭')+'</span>'
            +'<div style="font-size:14px;font-weight:700;">'+esc(m.name||m.id)+'</div></div>'
            +'<div style="font-size:12px;color:var(--muted);line-height:1.5;">'+esc(m.description||'')+'</div></div>';
        }).join('')+'</div>';
      view.querySelectorAll('.method-card').forEach(function(c){
        c.onclick=function(){
          view.innerHTML='<div class="spin"></div>';
          api('/api/methods/'+c.dataset.method).then(function(r){
            r=r||{};
            renderMethodResult(c.dataset.method, r.result, r.meta||{id:c.dataset.method});
          }).catch(function(e){view.innerHTML='<div class="empty">Failed to run method: '+(e&&e.message||e)+'</div>';});
        };
      });
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load methods: '+(e&&e.message||e)+'</div>';});
  }
  function loadReports(){
    view.innerHTML='<div class="spin"></div>';
    api('/api/reports?days=30').then(function(r){
      r=r||{};
      var loops=r.loops||{}, tasks=r.tasks||{}, leads=r.leads||{}, prod=r.productivity||{}, summary=r.summary||{}, lb=r.leaderboard||[];
      var month=new Date().toLocaleDateString([],{month:'long', year:'numeric'});
      var html='<div class="sec-head"><div><div class="sec-title">Reports</div><div class="sec-sub">30-day analytics — loops, tasks, leads, and productivity.</div></div></div>'
        +'<div style="padding:20px;border-radius:16px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;margin-bottom:16px;">'
        +'<div style="font-family:\\'JetBrains Mono\\',monospace;font-size:10px;opacity:.8;letter-spacing:.5px;text-transform:uppercase;">'+esc(month)+' · last 30 days</div>'
        +'<div style="font-size:18px;font-weight:700;margin-top:6px;">'+esc(summary.headline||('Strong month — '+loops.closedInWindow+' loops closed.'))+'</div>'
        +(summary.sub?'<div style="font-size:12.5px;opacity:.85;margin-top:4px;">'+esc(summary.sub)+'</div>':'')
        +'</div>'
        // KPI cards
        +'<div class="kpi-grid">'
        +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--accent);">'+(loops.closedInWindow||0)+'</div><div class="kpi-lbl">loops closed</div></div>'
        +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--green);">'+(tasks.completedInWindow||0)+'</div><div class="kpi-lbl">tasks done</div></div>'
        +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--teal);">'+(leads.won||0)+'</div><div class="kpi-lbl">leads won</div></div>'
        +'<div class="kpi-card gc"><div class="kpi-val" style="color:var(--green);">$'+(leads.pipelineValue>=1000?Math.round(leads.pipelineValue/1000)+'k':(leads.pipelineValue||0))+'</div><div class="kpi-lbl">in pipeline</div></div>'
        +'</div>'
        // velocity sparkline + rates
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;">'
        +'<div class="gc" style="padding:16px 18px;border-radius:16px;">'
        +'<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin-bottom:4px;">7-DAY VELOCITY</div>'
        +velocitySparkline(prod.velocityTrend||[])
        +'</div>'
        +'<div class="gc" style="padding:16px 18px;border-radius:16px;">'
        +'<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin-bottom:12px;">RATES</div>'
        +'<div style="display:flex;flex-direction:column;gap:10px;">'
        +rateRow('On-time close rate', (loops.onTimeRate||0), 'var(--green)')
        +rateRow('Lead conversion', (leads.conversionRate||0), 'var(--teal)')
        +rateRow('Task completion', (tasks.completionRate||0), 'var(--accent)')
        +'</div></div>'
        +'</div>'
        // leaderboard
        +'<div class="gc" style="padding:16px 18px;border-radius:16px;"><div style="font-size:12px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin-bottom:12px;">LEADERBOARD</div>'
        +(lb.length?lb.slice().sort(function(a,b){return (b.points||0)-(a.points||0);}).map(function(p,i){
          var medals=['\u{1F947}','\u{1F948}','\u{1F949}'];
          var fm=(prod.bestDay&&p.name===prod.bestDay)?'\u2B50':'';
          return '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--glassBorder);">'
            +'<span style="font-family:\\'JetBrains Mono\\',monospace;font-size:11px;font-weight:700;color:var(--faint);min-width:18px;">'+(i+1)+'</span>'
            +'<span style="font-size:16px;">'+(medals[i]||'')+'</span>'
            +'<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;">'+esc(p.name||'Unknown')+'</div>'
            +'<div style="font-size:10.5px;color:var(--muted);margin-top:2px;font-family:\\'JetBrains Mono\\',monospace;">'
            +(p.tasksDone||0)+' tasks · '+(p.loopsClosed||0)+' loops · '+Math.round((p.focusMinutes||0)/60)+'h focus</div></div>'
            +'<span style="font-family:\\'JetBrains Mono\\',monospace;font-size:12px;font-weight:600;color:var(--accent);">'+(p.points||0)+' pts</span></div>';
        }).join(''):'<div class="empty-dashed">No leaderboard data yet — start closing loops and tasks.</div>')
        +'</div>';
      view.innerHTML=html;
    }).catch(function(e){view.innerHTML='<div class="empty">Failed to load reports: '+(e&&e.message||e)+'</div>';});
  }
  function velocitySparkline(trend){
    trend=trend||[];
    if(!trend.length) return '<div style="font-size:11px;color:var(--faint);padding:12px 0;">No velocity data yet.</div>';
    var max=Math.max.apply(null,trend.concat([1]));
    var w=140, h=40, barW=Math.floor(w/trend.length)-2;
    var bars=trend.map(function(v,i){
      var bh=Math.max(2,Math.round((v/max)*h));
      var x=i*(barW+2);
      var y=h-bh;
      return '<rect x="'+x+'" y="'+y+'" width="'+barW+'" height="'+bh+'" rx="2" fill="var(--accent)"/>';
    }).join('');
    return '<svg width="'+w+'" height="'+h+'" style="display:block;margin-top:6px;">'+bars+'</svg>'
      +'<div style="font-size:10.5px;color:var(--muted);margin-top:6px;font-family:\\'JetBrains Mono\\',monospace;">best day: '+esc(trend.indexOf(Math.max.apply(null,trend))>=0?'this week':'—')+'</div>';
  }
  function rateRow(label, rate, color){
    var pct=Math.round((rate||0)*100);
    return '<div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;"><span style="color:var(--text);">'+label+'</span><span style="color:'+color+';font-family:\\'JetBrains Mono\\',monospace;font-weight:600;">'+pct+'%</span></div>'
      +'<div style="height:5px;border-radius:5px;background:var(--bg2);overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:'+color+';border-radius:5px;"></div></div></div>';
  }
  function loadSettings(){
    Promise.all([api('/api/autonomy'),api('/api/approvals'),api('/api/connections')]).then(function(res){
      var settings=res[0]||{};
      var approvals=(res[1]||[]).filter(function(a){return a.status==='pending';});
      var conns=res[2]||{};
      var isCeo=me&&me.role==='ceo';
      var connStatus=function(key){return(conns[key]||{}).status||'disconnected';};
      var connOk=function(key){var s=connStatus(key);return s==='connected';};

      // Build channel cards with real Connect buttons
      function channelCard(name,icon,key,desc,connectHtml,statusExtra){
        var st=connStatus(key);
        var ok=st==='connected';
        var statusLabel=st==='connecting'?'Connecting\u2026':st==='connected'?'Connected':st==='error'?'Error':'Not connected';
        var statusColor=ok?'var(--green)':st==='connecting'?'var(--amber)':st==='error'?'var(--red)':'var(--muted)';
        var subtext=statusExtra||statusLabel;
        return '<div class="gc" style="padding:14px 16px;border-radius:14px;margin-bottom:8px;">'
          +'<div style="display:flex;align-items:center;gap:11px;margin-bottom:8px;">'
          +'<div style="width:36px;height:36px;border-radius:10px;background:var(--bg2);border:1px solid var(--glassBorder);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">'+icon+'</div>'
          +'<div style="flex:1;min-width:0;"><div style="font-size:13.5px;font-weight:700;">'+name+'</div><div style="font-size:11px;color:var(--muted);margin-top:1px;">'+esc(desc)+'</div></div>'
          +'<span style="font-size:9.5px;font-weight:700;padding:3px 9px;border-radius:6px;background:'+(ok?'var(--greenSoft)':st==='connecting'?'var(--amberSoft)':'var(--bg2)')+';color:'+statusColor+';font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.3px;">'+statusLabel.toUpperCase()+'</span>'
          +'</div>'
          +(ok?'<div style="font-size:11px;color:var(--faint);margin-bottom:8px;font-family:&quot;JetBrains Mono&quot;,monospace;">'+esc(subtext)+'</div>':'')
          +(ok&&isCeo?'<button class="btn-ghost conn-disconnect-btn" data-channel="'+key+'" style="font-size:11px;padding:6px 12px;">Disconnect</button>':'')
          +(!ok&&isCeo?'<div style="margin-top:4px;">'+connectHtml+'</div>':'')
          +(st==='connecting'&&isCeo?'<div style="font-size:11px;color:var(--amber);margin-top:6px;"><span class="spin" style="display:inline-block;width:12px;height:12px;border-width:2px;vertical-align:middle;margin-right:6px;"></span>Waiting for connection\u2026</div>':'')
          +'</div>';
      }

      var waCloudConn=channelCard('WhatsApp Business','\u{1F4F1}','whatsapp_cloud','Official Meta Cloud API for business messaging',
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">'
        +'<input class="modal-input conn-input" data-field="phoneNumberId" placeholder="Phone Number ID"/>'
        +'<input class="modal-input conn-input" data-field="accessToken" type="password" placeholder="Access Token"/>'
        +'<input class="modal-input conn-input" data-field="webhookVerifyToken" placeholder="Verify Token (optional)"/>'
        +'<input class="modal-input conn-input" data-field="appSecret" type="password" placeholder="App Secret (optional)"/>'
        +'</div>'
        +'<button class="btn-primary conn-save-btn" data-channel="whatsapp_cloud" style="font-size:12px;padding:7px 14px;">Connect WhatsApp Cloud</button>'
        ,(conns.whatsapp_cloud||{}).phone||'');

      var waBaileysConn=channelCard('WhatsApp (QR)','\u{1F4F1}','whatsapp_baileys','Free — scan QR code with your personal WhatsApp',
        '<button class="btn-primary conn-start-btn" data-channel="whatsapp_baileys" style="font-size:12px;padding:7px 14px;">Start QR Pairing</button>'
        +'<div style="font-size:10.5px;color:var(--faint);margin-top:6px;">Opens terminal QR. Use for personal/dev accounts only.</div>'
      );

      var gmailConn=channelCard('Gmail','\u{1F4E7}','gmail','Read emails, auto-create tasks from messages',
        '<button class="btn-primary conn-gmail-btn" style="font-size:12px;padding:7px 14px;">\u{1F517} Connect with Google</button>'
        +'<div style="font-size:10.5px;color:var(--faint);margin-top:6px;">Requires GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET in server .env</div>'
        ,(conns.gmail||{}).email||'');

      var calendarConn=channelCard('Google Calendar','\u{1F4C5}','calendar','Sync events and deadlines',
        '<div style="font-size:11px;color:var(--muted);">Coming soon — uses same Google OAuth as Gmail</div>'
      );

      var slackConn=channelCard('Slack','\u{1F4AC}','slack','Watch channels, capture messages as loops',
        '<div style="font-size:11px;color:var(--muted);">Set SLACK_BOT_TOKEN in .env to enable</div>'
      );

      var telegramConn=channelCard('Telegram','\u{2708}\uFE0F','telegram','Bot messages become tracked loops',
        '<div style="font-size:11px;color:var(--muted);">Set TELEGRAM_BOT_TOKEN in .env to enable</div>'
      );

      var githubConn=channelCard('GitHub','\u{1F419}','github','Issues, PRs, and commits as open loops',
        '<div style="font-size:11px;color:var(--muted);">Set GITHUB_TOKEN + GITHUB_WEBHOOK_SECRET in .env to enable</div>'
      );

      var html='<div class="sec-head"><div><div class="sec-title">Settings</div><div class="sec-sub">Integrations, autonomy, and personalisation.</div></div></div>';
      var ksActive = settings.killSwitch === true;
      html+='<div style="padding:16px 18px;border-radius:14px;background:'+(ksActive?'linear-gradient(135deg,rgba(0,184,148,.15),rgba(0,184,148,.06))':'rgba(239,68,68,.08)')+';border:1px solid '+(ksActive?'rgba(0,184,148,.3)':'rgba(239,68,68,.18)')+';display:flex;align-items:center;gap:12px;margin-bottom:20px;"><div style="flex:1;"><div style="font-size:14px;font-weight:700;color:'+(ksActive?'var(--green)':'var(--red)')+';">Kill switch '+(ksActive?'ACTIVE — autonomous actions paused':'Standby')+'</div><div style="font-size:12px;color:'+(ksActive?'var(--green)':'var(--red)')+';opacity:.75;margin-top:2px;">'+(ksActive?'All autonomous actions are paused. Click to resume.':'Pause ALL autonomous actions immediately.')+'</div></div><button class="'+(ksActive?'btn-primary':'btn-danger')+'" id="kill-switch-btn" data-paused="'+ksActive+'">'+(ksActive?'Resume autonomy':'Pause all')+'</button></div>';
      if(approvals.length){
        html+='<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin-bottom:8px;">PENDING APPROVALS ('+approvals.length+')</div>'
          +approvals.map(function(ap){return '<div class="gc" style="padding:12px 14px;border-radius:13px;display:flex;align-items:center;gap:10px;margin-bottom:7px;"><div style="flex:1;"><div style="font-size:13px;font-weight:600;">'+esc(ap.title)+'</div><div style="font-family:\\'JetBrains Mono\\',monospace;font-size:10.5px;color:var(--faint);margin-top:2px;">'+esc(ap.action)+'</div></div><button class="approve-btn ok" data-approve="'+ap.id+'">Approve</button><button class="approve-btn no" data-dismiss="'+ap.id+'" style="margin-left:5px;">Dismiss</button></div>';}).join('');
      }
      html+='<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin:16px 0 8px;">AUTONOMY</div>'
        +ACTIONS.map(function(a){var cur=settings[a.k]||'off';return '<div class="gc auto-card" style="padding:14px 16px;border-radius:14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;"><div style="flex:1;min-width:160px;"><div style="font-size:13.5px;font-weight:600;">'+a.label+'</div><div style="font-size:11.5px;color:var(--muted);margin-top:3px;">'+a.desc+'</div></div><div class="lvls">'+['off','ask','auto'].map(function(lv){return '<button class="lvl'+(lv===cur?' on':'')+'" data-act="'+a.k+'" data-lvl="'+lv+'">'+(lv.charAt(0).toUpperCase()+lv.slice(1))+'</button>';}).join('')+'</div></div>';}).join('');
      html+='<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin:16px 0 8px;">INTEGRATIONS</div>'
        +waCloudConn+waBaileysConn+gmailConn+calendarConn+slackConn+telegramConn+githubConn;
      html+='<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:\\'JetBrains Mono\\',monospace;letter-spacing:.5px;margin:16px 0 8px;">APPEARANCE</div>'
        +'<div class="gc" style="padding:14px 16px;border-radius:14px;display:flex;align-items:center;gap:12px;margin-bottom:8px;"><div style="flex:1;"><div style="font-size:13.5px;font-weight:600;">Dark mode</div><div style="font-size:11.5px;color:var(--muted);margin-top:3px;">Switch between light and dark interface.</div></div><button class="btn-ghost" id="settings-dark-toggle">'+(darkMode?'Switch to light':'Switch to dark')+'</button></div>'
        +'<div style="font-size:11.5px;color:var(--muted);margin-bottom:8px;">Wallpaper</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">'
        +THEMES.map(function(t){return '<div style="cursor:pointer;" onclick="applyTheme(\\''+t.id+'\\')"><div style="aspect-ratio:3/2;border-radius:10px;background:'+t.swatch+';border:2px solid '+(activeTheme===t.id?'var(--accent)':'transparent')+';transition:all .15s;"></div><div style="text-align:center;font-size:10px;color:var(--muted);margin-top:4px;">'+t.label+'</div></div>';}).join('')+'</div>';
      html+=adminUsersPanelHtml();
      view.innerHTML=html;

      // Bind settings handlers
      var std=document.getElementById('settings-dark-toggle');
      if(std)std.onclick=function(){applyDark(!darkMode);loadSettings();};
      // B11: Kill switch — real persisted state via PUT /api/autonomy/kill-switch
      var ksb=document.getElementById('kill-switch-btn');
      if(ksb)ksb.onclick=function(){
        var nextPause=ksb.dataset.paused!=='true';
        ksb.disabled=true;ksb.textContent='Working\u2026';
        post('/api/autonomy/kill-switch',{paused:nextPause},'PUT').then(function(){
          toast(nextPause?'Autonomy paused — all autonomous actions stopped.':'Autonomy resumed.');
          loadSettings();
        }).catch(function(e){toast(e.message||'Failed');ksb.disabled=false;ksb.textContent=nextPause?'Pause all':'Resume autonomy';});
      };
      view.querySelectorAll('.lvl').forEach(function(b){b.onclick=function(){post('/api/autonomy',{action:b.dataset.act,level:b.dataset.lvl},'PUT').then(function(){toast('Saved');loadSettings();});};});
      view.querySelectorAll('[data-approve]').forEach(function(b){b.onclick=function(){post('/api/approvals/'+b.dataset.approve+'/approve').then(function(){toast('Approved');loadSettings();});};});
      view.querySelectorAll('[data-dismiss]').forEach(function(b){b.onclick=function(){post('/api/approvals/'+b.dataset.dismiss+'/dismiss').then(function(){toast('Dismissed');loadSettings();});};});

      // WhatsApp Cloud — save credentials
      view.querySelectorAll('.conn-save-btn').forEach(function(btn){
        btn.onclick=function(){
          var channel=btn.dataset.channel;
          var card=btn.closest('.gc');
          var fields={};
          card.querySelectorAll('.conn-input').forEach(function(inp){
            if(inp.value.trim()) fields[inp.dataset.field]=inp.value.trim();
          });
          if(!fields.phoneNumberId||!fields.accessToken){toast('Phone Number ID and Access Token are required');return;}
          btn.disabled=true;btn.textContent='Connecting\u2026';
          post('/api/connections/'+channel,fields).then(function(){toast('WhatsApp Cloud connected!');loadSettings();}).catch(function(e){toast(e.message||'Failed');btn.disabled=false;btn.textContent='Connect WhatsApp Cloud';});
        };
      });

      // WhatsApp Baileys — start QR
      view.querySelectorAll('.conn-start-btn').forEach(function(btn){
        btn.onclick=function(){
          btn.disabled=true;btn.textContent='Starting\u2026';
          post('/api/connections/whatsapp_baileys/start',{}).then(function(r){
            toast(r.message||'QR pairing started — check server console');
            loadSettings();
          }).catch(function(e){toast(e.message||'Failed');btn.disabled=false;btn.textContent='Start QR Pairing';});
        };
      });

      // Gmail — OAuth
      view.querySelectorAll('.conn-gmail-btn').forEach(function(btn){
        btn.onclick=function(){
          btn.disabled=true;btn.textContent='Loading\u2026';
          api('/api/connections/gmail/auth-url').then(function(r){
            if(r.error){toast(r.error);btn.disabled=false;btn.textContent='\u{1F517} Connect with Google';return;}
            if(r.authUrl) window.location.href=r.authUrl;
            else{toast('Failed to get auth URL');btn.disabled=false;btn.textContent='\u{1F517} Connect with Google';}
          }).catch(function(e){toast(e.message||'Failed');btn.disabled=false;btn.textContent='\u{1F517} Connect with Google';});
        };
      });

      // Disconnect buttons
      view.querySelectorAll('.conn-disconnect-btn').forEach(function(btn){
        btn.onclick=function(){
          if(!confirm('Disconnect this integration?')) return;
          post('/api/connections/'+btn.dataset.channel+'/disconnect',{}).then(function(){toast('Disconnected');loadSettings();});
        };
      });

      bindAdminUserUi();
    });
  }

  function adminUsersPanelHtml(){
    var roles=['client','employee','manager','ceo','agent'];
    var roleOpts=roles.map(function(r){return '<option value="'+r+'">'+roleLabel(r)+'</option>';}).join('');
    var html='<div style="font-size:11px;font-weight:700;color:var(--muted);font-family:&quot;JetBrains Mono&quot;,monospace;letter-spacing:.5px;margin:18px 0 8px;">USER MANAGEMENT</div>';
    if(!me||me.role!=='ceo'){
      return html+'<div class="gc" style="padding:14px 16px;border-radius:14px;color:var(--muted);font-size:12.5px;">Only CEO/admin users can manage accounts.</div>';
    }
    return html+'<div class="gc" style="padding:14px 16px;border-radius:14px;margin-bottom:10px;">'
      +'<div style="font-size:13.5px;font-weight:700;margin-bottom:10px;">Create user</div>'
      +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;">'
      +'<input class="modal-input" id="admin-new-name" placeholder="Full name" autocomplete="off"/>'
      +'<input class="modal-input" id="admin-new-email" placeholder="Email" autocomplete="off"/>'
      +'<input class="modal-input" id="admin-new-username" placeholder="Username optional" autocomplete="off"/>'
      +'<select class="modal-select" id="admin-new-role">'+roleOpts+'</select>'
      +'<input class="modal-input" id="admin-new-password" type="password" placeholder="Temporary password" autocomplete="new-password"/>'
      +'<button class="btn-primary" id="admin-create-user">Create</button>'
      +'</div><div id="admin-user-msg" style="font-size:12px;color:var(--muted);margin-top:8px;"></div></div>'
      +'<div class="gc" style="padding:14px 16px;border-radius:14px;"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;"><div style="font-size:13.5px;font-weight:700;">Users</div><button class="btn-ghost" id="admin-refresh-users">Refresh</button></div><div id="admin-users-list"><div class="spin"></div></div></div>'
      +'<div class="gc" style="padding:14px 16px;border-radius:14px;margin-top:12px;"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;"><div><div style="font-size:13.5px;font-weight:700;">API keys</div><div style="font-size:11px;color:var(--muted);">For MCP hosts (Claude Desktop, Cursor). Shown once on create.</div></div><button class="btn-ghost" id="admin-refresh-keys">Refresh</button></div>'
      +'<div style="display:grid;grid-template-columns:minmax(160px,1fr) 140px 160px auto;gap:8px;align-items:end;margin-bottom:10px;">'
      +'<div class="modal-field" style="margin:0;"><label class="modal-label">Name</label><input class="modal-input" id="admin-key-name" placeholder="MCP Agent" autocomplete="off"/></div>'
      +'<div class="modal-field" style="margin:0;"><label class="modal-label">Scopes</label><select class="modal-select" id="admin-key-scopes"><option value="read">Read only</option><option value="read,write">Read and write</option></select></div>'
      +'<div class="modal-field" style="margin:0;"><label class="modal-label">Agent user</label><select class="modal-select" id="admin-key-actor"><option value="">None</option></select></div>'
      +'<button class="btn-primary" id="admin-create-key">Create key</button></div>'
      +'<div id="admin-key-reveal" style="display:none;font-size:12px;margin-bottom:10px;padding:10px 12px;border-radius:10px;background:var(--accentSoft);"></div>'
      +'<div id="admin-keys-list"><div class="spin"></div></div></div>';
  }

  function adminMsg(msg,isErr){
    var el=document.getElementById('admin-user-msg');
    if(!el) return;
    el.style.color=isErr?'var(--red)':'var(--muted)';
    el.textContent=msg||'';
  }
  function bindAdminUserUi(){
    if(!me||me.role!=='ceo') return;
    var create=document.getElementById('admin-create-user');
    var refresh=document.getElementById('admin-refresh-users');
    if(refresh) refresh.onclick=loadAdminUsers;
    if(create) create.onclick=function(){
      var body={
        name:(document.getElementById('admin-new-name').value||'').trim(),
        email:(document.getElementById('admin-new-email').value||'').trim(),
        username:(document.getElementById('admin-new-username').value||'').trim()||undefined,
        role:document.getElementById('admin-new-role').value,
        password:document.getElementById('admin-new-password').value||''
      };
      if(!body.name||!body.email||!body.password){adminMsg('Name, email, and password are required',true);return;}
      post('/api/admin/users',body).then(function(){
        adminMsg('User created',false);
        ['admin-new-name','admin-new-email','admin-new-username','admin-new-password'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
        loadAdminUsers();
      }).catch(function(e){adminMsg(e&&e.message?e.message:'Could not create user',true);});
    };
    loadAdminUsers();
    var refreshKeys=document.getElementById('admin-refresh-keys');
    if(refreshKeys) refreshKeys.onclick=loadApiKeys;
    var createKey=document.getElementById('admin-create-key');
    if(createKey) createKey.onclick=createApiKey;
    loadApiKeys();
  }
  function loadApiKeys(){
    var box=document.getElementById('admin-keys-list');
    if(!box) return;
    box.innerHTML='<div class="spin"></div>';
    // Offer the org's agent accounts as the key's owner, so writes are attributed to one.
    api('/api/admin/users').then(function(users){
      var sel=document.getElementById('admin-key-actor');
      if(sel){
        var agents=(users||[]).filter(function(u){return u.role==='agent';});
        sel.innerHTML='<option value="">None</option>'+agents.map(function(u){
          return '<option value="'+esc(u.userId)+'">'+esc(u.name)+'</option>';
        }).join('');
      }
    }).catch(function(){});
    api('/api/admin/keys').then(function(r){
      var keys=(r&&r.keys)||[];
      if(!keys.length){box.innerHTML='<div style="font-size:12px;color:var(--muted);">No API keys yet.</div>';return;}
      box.innerHTML=keys.map(function(k){
        return '<div class="admin-key-row" data-key-id="'+esc(k.id)+'" style="border-top:1px solid var(--glassBorder);padding:10px 0;display:grid;grid-template-columns:minmax(160px,1fr) 120px 140px auto;gap:8px;align-items:center;">'
          +'<div><div style="font-size:13px;font-weight:700;">'+esc(k.name)+'</div><div style="font-size:11px;color:var(--muted);">'+esc(k.prefix)+'... - created '+agoLabel(k.createdAt)+'</div></div>'
          +'<div style="font-size:11px;color:var(--muted);">'+esc((k.scopes||[]).join(', '))+'</div>'
          +'<div style="font-size:11px;color:var(--muted);">'+(k.lastUsedAt?('used '+agoLabel(k.lastUsedAt)):'never used')+'</div>'
          +'<button class="btn-danger admin-revoke-key">Revoke</button></div>';
      }).join('');
      box.querySelectorAll('.admin-key-row').forEach(function(row){
        row.querySelector('.admin-revoke-key').onclick=function(){
          if(!confirm('Revoke this key? Any host using it stops working immediately.')) return;
          post('/api/admin/keys/'+encodeURIComponent(row.dataset.keyId),null,'DELETE')
            .then(function(){toast('Key revoked');loadApiKeys();})
            .catch(function(e){toast(e&&e.message?e.message:'Could not revoke key');});
        };
      });
    }).catch(function(e){box.innerHTML='<div style="font-size:12px;color:var(--red);">'+esc(e&&e.message?e.message:'Could not load keys')+'</div>';});
  }
  function agoLabel(ts){var a=ago(ts);return a==='just now'?a:a+' ago';}
  function createApiKey(){
    var name=(document.getElementById('admin-key-name').value||'').trim();
    if(!name){toast('Name the key first');return;}
    var scopes=document.getElementById('admin-key-scopes').value.split(',');
    var actorId=document.getElementById('admin-key-actor').value||undefined;
    post('/api/admin/keys',{name:name,scopes:scopes,actorId:actorId}).then(function(r){
      var box=document.getElementById('admin-key-reveal');
      if(box){
        box.style.display='block';
        box.innerHTML='<div style="font-weight:700;margin-bottom:4px;">Copy this key now - it is never shown again.</div><code style="word-break:break-all;">'+esc(r.key)+'</code>';
      }
      document.getElementById('admin-key-name').value='';
      loadApiKeys();
    }).catch(function(e){toast(e&&e.message?e.message:'Could not create key');});
  }
  function loadAdminUsers(){
    var box=document.getElementById('admin-users-list');
    if(!box) return;
    box.innerHTML='<div class="spin"></div>';
    api('/api/admin/users').then(function(users){
      box.innerHTML=renderAdminUsers(users||[]);
      bindAdminUserRows();
    }).catch(function(e){box.innerHTML='<div style="font-size:12px;color:var(--red);">'+esc(e&&e.message?e.message:'Could not load users')+'</div>';});
  }
  function renderAdminUsers(users){
    if(!users.length) return '<div style="font-size:12px;color:var(--muted);">No users yet.</div>';
    var roles=['client','employee','manager','ceo','agent'];
    return users.map(function(u){
      var roleOpts=roles.map(function(r){return '<option value="'+r+'" '+(u.role===r?'selected':'')+'>'+roleLabel(r)+'</option>';}).join('');
      return '<div class="admin-user-row" data-user-id="'+esc(u.userId)+'" style="border-top:1px solid var(--glassBorder);padding:12px 0;display:grid;grid-template-columns:minmax(180px,1fr) 140px 120px 1fr auto;gap:8px;align-items:center;">'
        +'<div><div style="font-size:13px;font-weight:700;">'+esc(u.name)+'</div><div style="font-size:11px;color:var(--muted);">'+esc(u.email||'')+(u.username?' · '+esc(u.username):'')+'</div></div>'
        +'<select class="modal-select admin-role" style="min-height:34px;">'+roleOpts+'</select>'
        +'<select class="modal-select admin-active" style="min-height:34px;"><option value="true" '+(u.active===false?'':'selected')+'>Active</option><option value="false" '+(u.active===false?'selected':'')+'>Disabled</option></select>'
        +'<div style="display:flex;gap:6px;"><input class="modal-input admin-password" type="password" placeholder="New password" autocomplete="new-password" style="min-height:34px;"/><button class="btn-ghost admin-set-password">Set</button></div>'
        +'<div style="display:flex;gap:6px;"><button class="btn-ghost admin-save-user">Save</button><button class="btn-danger admin-delete-user">Delete</button></div>'
        +'</div>';
    }).join('');
  }
  function bindAdminUserRows(){
    document.querySelectorAll('.admin-user-row').forEach(function(row){
      var uid=row.dataset.userId;
      var save=row.querySelector('.admin-save-user');
      var del=row.querySelector('.admin-delete-user');
      var setPw=row.querySelector('.admin-set-password');
      if(save) save.onclick=function(){
        var role=row.querySelector('.admin-role').value;
        var active=row.querySelector('.admin-active').value==='true';
        post('/api/admin/users/'+encodeURIComponent(uid),{role:role,active:active},'PATCH').then(function(){toast('User updated');loadAdminUsers();}).catch(function(e){toast(e&&e.message?e.message:'Could not update user');});
      };
      if(setPw) setPw.onclick=function(){
        var input=row.querySelector('.admin-password');
        var pw=input&&input.value||'';
        if(!pw){toast('Enter a new password');return;}
        post('/api/admin/users/'+encodeURIComponent(uid)+'/password',{password:pw}).then(function(){toast('Password reset');if(input)input.value='';}).catch(function(e){toast(e&&e.message?e.message:'Could not reset password');});
      };
      if(del) del.onclick=function(){
        if(!confirm('Delete this user? This cannot be undone.')) return;
        post('/api/admin/users/'+encodeURIComponent(uid),null,'DELETE').then(function(){toast('User deleted');loadAdminUsers();}).catch(function(e){toast(e&&e.message?e.message:'Could not delete user');});
      };
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
