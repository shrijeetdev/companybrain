// The web UI, served at `/` straight from the app. Dependency-free HTML+CSS+JS so the
// single process serves the whole product — no separate frontend build, no Next.js server.
// Liquid-Glass tokens: light-first, one blue accent #3e7bfa, calm + thumb-first (390px).
// Tabs: Loops · Tasks · Leads · Agents · Activity — each backed by the app's own API.

export function renderUi(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>companybrain</title>
<style>
  :root {
    --blue:#3e7bfa; --blue-soft:#7aa6ff; --ink:#1a1d21; --muted:#6b7280; --line:#eceef1;
    --bg:#f6f7f9; --card:#fff; --green:#34c759; --amber:#ff9f0a; --red:#ff3b30; --violet:#7c5cff;
  }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  body { margin:0; font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:var(--bg); }
  .wrap { max-width:430px; margin:0 auto; min-height:100vh; padding:18px 16px 150px; }
  header { display:flex; align-items:center; gap:10px; margin-bottom:4px; }
  .logo { width:30px; height:30px; border-radius:9px; background:radial-gradient(circle at 30% 30%,var(--blue),var(--blue-soft)); }
  h1 { font-size:18px; margin:0; letter-spacing:-.2px; font-weight:500; }
  h1 b { font-weight:700; }
  .sub { color:var(--muted); font-size:13px; margin:2px 0 16px; }
  .seg { display:flex; gap:6px; background:#eef0f3; padding:4px; border-radius:12px; margin-bottom:14px; }
  .seg button { flex:1; border:0; background:transparent; padding:8px; border-radius:9px; font-size:13px; color:var(--muted); font-weight:600; cursor:pointer; }
  .seg button.on { background:#fff; color:var(--ink); box-shadow:0 1px 2px rgba(0,0,0,.06); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:14px; margin-bottom:10px; display:flex; gap:12px; align-items:flex-start; }
  .check { width:22px; height:22px; border-radius:50%; border:2px solid #d4d8de; flex:0 0 auto; margin-top:1px; cursor:pointer; background:transparent; }
  .check:active { background:var(--blue); border-color:var(--blue); }
  .grow { flex:1; min-width:0; }
  .t { font-weight:600; }
  .w { color:var(--muted); font-size:12.5px; margin-top:2px; }
  .mono { font-family:"JetBrains Mono",ui-monospace,monospace; }
  .row { display:flex; align-items:center; gap:8px; }
  .pill { font-size:11px; font-weight:700; padding:3px 8px; border-radius:999px; background:#eef0f3; color:var(--muted); white-space:nowrap; }
  .pill.blue { background:rgba(62,123,250,.12); color:var(--blue); }
  .pill.green { background:rgba(52,199,89,.14); color:#1f9d44; }
  .pill.amber { background:rgba(255,159,10,.16); color:#b9710a; }
  .pill.violet { background:rgba(124,92,255,.14); color:var(--violet); }
  .empty { color:var(--muted); text-align:center; padding:34px 0; }
  .btn { border:0; border-radius:11px; padding:8px 12px; font-size:13px; font-weight:600; cursor:pointer; }
  .btn.ghost { background:#eef0f3; color:var(--ink); }
  .btn.blue { background:var(--blue); color:#fff; }
  .emoji { font-size:20px; line-height:1; flex:0 0 auto; }
  .stat { display:flex; gap:14px; margin:2px 0 6px; }
  .stat .n { font-weight:700; } .stat .l { color:var(--muted); font-size:12px; }
  .bar { position:fixed; left:50%; transform:translateX(-50%); bottom:70px; width:398px; max-width:calc(100% - 32px); display:flex; gap:8px; }
  .bar input { flex:1; min-width:0; border:1px solid var(--line); background:#fff; border-radius:13px; padding:13px 14px; font-size:15px; }
  .bar button { border:0; background:var(--blue); color:#fff; font-weight:600; border-radius:13px; padding:0 18px; cursor:pointer; }
  nav { position:fixed; left:50%; transform:translateX(-50%); bottom:0; width:100%; max-width:430px; display:flex; background:rgba(255,255,255,.92); backdrop-filter:blur(12px); border-top:1px solid var(--line); padding:6px 6px max(8px,env(safe-area-inset-bottom)); }
  nav button { flex:1; border:0; background:transparent; padding:6px 0; font-size:11px; font-weight:600; color:var(--muted); cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:3px; }
  nav button.on { color:var(--blue); }
  nav .ic { font-size:18px; line-height:1; }
</style>
</head>
<body>
  <div class="wrap">
    <header><div class="logo"></div><h1>company<b>brain</b></h1></header>
    <div class="sub" id="sub">Never forget a task or a follow-up — across every channel.</div>
    <div id="seg"></div>
    <div id="list"><div class="empty">Loading…</div></div>
  </div>
  <form class="bar" id="bar"><input id="field" autocomplete="off" /><button type="submit">Add</button></form>
  <nav id="nav"></nav>
<script>
  var tab = 'loops', side = 'yours', taskDay = 'today', leadView = 'all';
  var TABS = [
    { id:'loops',  ic:'\\u{1F501}', label:'Loops' },
    { id:'tasks',  ic:'\\u2705',     label:'Tasks' },
    { id:'leads',  ic:'\\u{1F91D}', label:'Leads' },
    { id:'agents', ic:'\\u{1F916}', label:'Agents' },
    { id:'events', ic:'\\u{1F4DC}', label:'Activity' },
  ];
  var SUBS = {
    loops:'Open loops — who owes the next move.',
    tasks:'Your tasks, grouped by day.',
    leads:'Pipeline — drag a lead forward.',
    agents:'Your AI workforce and what they handle.',
    events:'Everything that happened — scoped, logged, reversible.'
  };
  var list = document.getElementById('list');
  var nav = document.getElementById('nav');
  var seg = document.getElementById('seg');
  var bar = document.getElementById('bar');
  var field = document.getElementById('field');

  function esc(s){ return (s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function api(path, opts){ return fetch(path, opts).then(function(r){ return r.json().catch(function(){return null;}); }); }
  function post(path, body){ return api(path, { method:'POST', headers:{'content-type':'application/json'}, body: body?JSON.stringify(body):undefined }); }

  nav.innerHTML = TABS.map(function(t){
    return '<button data-tab="'+t.id+'"><span class="ic">'+t.ic+'</span>'+t.label+'</button>';
  }).join('');
  nav.querySelectorAll('button').forEach(function(b){ b.onclick = function(){ tab=b.dataset.tab; render(); }; });

  function setSeg(opts, cur, onPick){
    seg.style.display='flex';
    seg.className='seg';
    seg.innerHTML = opts.map(function(o){ return '<button class="'+(o.v===cur?'on':'')+'" data-v="'+o.v+'">'+o.label+'</button>'; }).join('');
    seg.querySelectorAll('button').forEach(function(b){ b.onclick=function(){ onPick(b.dataset.v); }; });
  }

  function render(){
    document.getElementById('sub').textContent = SUBS[tab];
    nav.querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', b.dataset.tab===tab); });
    if (tab==='loops') { setSeg([{v:'yours',label:'Your court'},{v:'theirs',label:'Their court'}], side, function(v){ side=v; load(); }); }
    else if (tab==='tasks') { setSeg([{v:'today',label:'Today'},{v:'tomorrow',label:'Tomorrow'},{v:'upcoming',label:'Upcoming'}], taskDay, function(v){ taskDay=v; load(); }); }
    else if (tab==='leads') { setSeg([{v:'all',label:'All'},{v:'open',label:'Open'},{v:'won',label:'Won'}], leadView, function(v){ leadView=v; load(); }); }
    else { seg.style.display='none'; seg.innerHTML=''; }

    var showBar = tab==='loops'||tab==='tasks'||tab==='leads';
    bar.style.display = showBar ? 'flex' : 'none';
    field.placeholder = tab==='loops' ? 'Capture a loop…' : tab==='tasks' ? 'Add a task…' : tab==='leads' ? 'Add lead (name, or paste a note)…' : '';
    load();
  }

  function load(){
    if (tab==='loops') return loadLoops();
    if (tab==='tasks') return loadTasks();
    if (tab==='leads') return loadLeads();
    if (tab==='agents') return loadAgents();
    if (tab==='events') return loadEvents();
  }

  function loadLoops(){
    api('/api/loops?side='+side).then(function(loops){
      loops = loops||[];
      if(!loops.length){ list.innerHTML = '<div class="empty">Nothing here. You\\'re clear.</div>'; return; }
      list.innerHTML = loops.map(function(l){
        return '<div class="card"><button class="check" data-close="'+l.id+'"></button>'
          + '<div class="grow"><div class="t">'+esc(l.title)+'</div>'
          + '<div class="w mono">'+esc(l.channel)+(l.why?' \\u00b7 '+esc(l.why):'')+'</div></div>'
          + '<button class="btn ghost" data-snooze="'+l.id+'">Snooze</button></div>';
      }).join('');
      wire();
    });
  }

  function loadTasks(){
    api('/api/tasks').then(function(tasks){
      tasks = (tasks||[]).filter(function(t){ return t.day===taskDay; });
      if(!tasks.length){ list.innerHTML = '<div class="empty">No tasks '+taskDay+'.</div>'; return; }
      list.innerHTML = tasks.map(function(t){
        var pr = t.priority==='high'?'<span class="pill amber">high</span>':t.priority==='med'?'<span class="pill blue">med</span>':'';
        return '<div class="card"><button class="check" data-done="'+t.id+'"></button>'
          + '<div class="emoji">'+esc(t.emoji||'\\u2705')+'</div>'
          + '<div class="grow"><div class="t">'+esc(t.title)+'</div>'
          + '<div class="w">'+esc(t.list||'Inbox')+'</div></div>'+pr+'</div>';
      }).join('');
      wire();
    });
  }

  function loadLeads(){
    api('/api/leads').then(function(leads){
      leads = leads||[];
      if (leadView==='open') leads = leads.filter(function(l){ return l.stage!=='won'&&l.stage!=='lost'; });
      if (leadView==='won') leads = leads.filter(function(l){ return l.stage==='won'; });
      if(!leads.length){ list.innerHTML = '<div class="empty">No leads yet.</div>'; return; }
      var cls = { new:'', contacted:'blue', meeting:'violet', proposal:'amber', won:'green', lost:'' };
      list.innerHTML = leads.map(function(l){
        var sub = [l.company, l.title].filter(Boolean).map(esc).join(' \\u00b7 ');
        var adv = (l.stage==='won'||l.stage==='lost') ? '' : '<button class="btn blue" data-advance="'+l.id+'">Advance</button>';
        return '<div class="card"><div class="grow"><div class="row"><span class="t">'+esc(l.name)+'</span>'
          + '<span class="pill '+(cls[l.stage]||'')+'">'+esc(l.stage)+'</span></div>'
          + (sub?'<div class="w">'+sub+'</div>':'')
          + (l.what?'<div class="w">'+esc(l.what)+'</div>':'')+'</div>'+adv+'</div>';
      }).join('');
      wire();
    });
  }

  function loadAgents(){
    api('/api/agents').then(function(agents){
      agents = agents||[];
      list.innerHTML = agents.map(function(a){
        var au = a.autonomy==='auto'?'<span class="pill green">auto</span>':a.autonomy==='ask'?'<span class="pill amber">ask</span>':'<span class="pill">off</span>';
        return '<div class="card"><div class="emoji">'+esc(a.emoji)+'</div>'
          + '<div class="grow"><div class="row"><span class="t">'+esc(a.name)+'</span>'+au+'</div>'
          + '<div class="w">'+esc(a.role)+'</div>'
          + '<div class="stat"><span><span class="n">'+a.done+'</span> <span class="l">done</span></span>'
          + '<span><span class="n">'+a.pending+'</span> <span class="l">pending</span></span></div></div></div>';
      }).join('');
    });
  }

  function loadEvents(){
    api('/api/events').then(function(events){
      events = events||[];
      if(!events.length){ list.innerHTML = '<div class="empty">No activity yet.</div>'; return; }
      list.innerHTML = events.map(function(e){
        var when = new Date(e.at).toLocaleString();
        return '<div class="card"><div class="grow"><div class="t mono">'+esc(e.type)+'</div>'
          + '<div class="w">'+esc(e.actorId)+(e.channel?' \\u00b7 '+esc(e.channel):'')+' \\u00b7 '+esc(when)+'</div></div>'
          + (e.reversible?'<span class="pill blue">reversible</span>':'')+'</div>';
      }).join('');
    });
  }

  function wire(){
    list.querySelectorAll('[data-close]').forEach(function(b){ b.onclick=function(){ post('/api/loops/'+b.dataset.close+'/close').then(load); }; });
    list.querySelectorAll('[data-snooze]').forEach(function(b){ b.onclick=function(){ post('/api/loops/'+b.dataset.snooze+'/snooze',{hours:24}).then(load); }; });
    list.querySelectorAll('[data-done]').forEach(function(b){ b.onclick=function(){ post('/api/tasks/'+b.dataset.done+'/complete').then(load); }; });
    list.querySelectorAll('[data-advance]').forEach(function(b){ b.onclick=function(){ post('/api/leads/'+b.dataset.advance+'/advance').then(load); }; });
  }

  bar.onsubmit = function(e){
    e.preventDefault();
    var v = field.value.trim(); if(!v) return;
    var done = function(){ field.value=''; load(); };
    if (tab==='loops') post('/api/loops',{ title:v, side:side }).then(done);
    else if (tab==='tasks') post('/api/tasks',{ title:v, day:taskDay }).then(done);
    else if (tab==='leads') {
      // A short value is a name; a longer note goes through quick-add (AI-structured if configured).
      if (v.length > 24 || /[,@]/.test(v)) post('/api/leads/quick-add',{ note:v }).then(done);
      else post('/api/leads',{ name:v }).then(done);
    }
  };

  render();
</script>
</body>
</html>`;
}
