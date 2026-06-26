// The web UI, served at `/` straight from the app. Dependency-free HTML+JS so the single
// process serves the whole product — no separate frontend build, no Next.js server.
// Liquid-Glass tokens: light-first, one blue accent #3e7bfa, calm + thumb-first (390px).

export function renderUi(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>companybrain</title>
<style>
  :root { --blue:#3e7bfa; --ink:#1a1d21; --muted:#6b7280; --line:#eceef1; --bg:#f6f7f9; --card:#fff; }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  body { margin:0; font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:var(--bg); }
  .wrap { max-width:430px; margin:0 auto; min-height:100vh; padding:18px 16px 96px; }
  header { display:flex; align-items:center; gap:10px; margin-bottom:18px; }
  .logo { width:30px; height:30px; border-radius:9px; background:radial-gradient(circle at 30% 30%,var(--blue),#7aa6ff); }
  h1 { font-size:18px; margin:0; letter-spacing:-.2px; }
  h1 b { font-weight:700; }
  .sub { color:var(--muted); font-size:13px; margin:-12px 0 18px; }
  .seg { display:flex; gap:6px; background:#eef0f3; padding:4px; border-radius:12px; margin-bottom:16px; }
  .seg button { flex:1; border:0; background:transparent; padding:8px; border-radius:9px; font-size:13px; color:var(--muted); font-weight:600; }
  .seg button.on { background:#fff; color:var(--ink); box-shadow:0 1px 2px rgba(0,0,0,.06); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:14px; margin-bottom:10px; display:flex; gap:12px; align-items:flex-start; }
  .check { width:22px; height:22px; border-radius:50%; border:2px solid #d4d8de; flex:0 0 auto; margin-top:1px; cursor:pointer; }
  .card .t { font-weight:600; }
  .card .w { color:var(--muted); font-size:12.5px; margin-top:2px; }
  .empty { color:var(--muted); text-align:center; padding:32px 0; }
  .add { position:fixed; left:50%; transform:translateX(-50%); bottom:22px; width:398px; max-width:calc(100% - 32px); display:flex; gap:8px; }
  .add input { flex:1; border:1px solid var(--line); background:#fff; border-radius:13px; padding:13px 14px; font-size:15px; }
  .add button { border:0; background:var(--blue); color:#fff; font-weight:600; border-radius:13px; padding:0 18px; }
  .mono { font-family:"JetBrains Mono",ui-monospace,monospace; }
</style>
</head>
<body>
  <div class="wrap">
    <header><div class="logo"></div><h1>company<b>brain</b></h1></header>
    <div class="sub">Never forget a task or a follow-up — across every channel.</div>
    <div class="seg">
      <button class="on" data-side="yours">Your court</button>
      <button data-side="theirs">Their court</button>
    </div>
    <div id="list"><div class="empty">Loading…</div></div>
  </div>
  <form class="add" id="add">
    <input id="title" placeholder="Capture a loop…" autocomplete="off" />
    <button type="submit">Add</button>
  </form>
<script>
  let side = 'yours';
  const list = document.getElementById('list');
  async function load() {
    const r = await fetch('/api/loops?side=' + side);
    const loops = await r.json();
    if (!loops.length) { list.innerHTML = '<div class="empty">Nothing here. You\\'re clear.</div>'; return; }
    list.innerHTML = loops.map(function(l){
      return '<div class="card"><div class="check" data-id="'+l.id+'"></div>'
        + '<div><div class="t">'+escapeHtml(l.title)+'</div>'
        + '<div class="w mono">'+escapeHtml(l.channel)+' · '+escapeHtml(l.why||'')+'</div></div></div>';
    }).join('');
    document.querySelectorAll('.check').forEach(function(c){
      c.onclick = async function(){ await fetch('/api/loops/'+c.dataset.id+'/close',{method:'POST'}); load(); };
    });
  }
  document.querySelectorAll('.seg button').forEach(function(b){
    b.onclick = function(){ document.querySelectorAll('.seg button').forEach(x=>x.classList.remove('on')); b.classList.add('on'); side=b.dataset.side; load(); };
  });
  document.getElementById('add').onsubmit = async function(e){
    e.preventDefault();
    const t = document.getElementById('title');
    if (!t.value.trim()) return;
    await fetch('/api/loops',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:t.value,side:side})});
    t.value=''; load();
  };
  function escapeHtml(s){ return (s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  load();
</script>
</body>
</html>`;
}
