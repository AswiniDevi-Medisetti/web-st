/* script.js
   Shared behavior for all pages:
   - Screen time engine (visibility/focus)
   - UI updates on index/main
   - Export CSV, pause/resume/reset
   - Contact form mailto + copy email
   - Small helpers for DOM
*/

(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const nowISO = () => new Date().toISOString().slice(0,10);
  const formatDuration = ms => {
    if(!ms || ms < 0) ms = 0;
    const sec = Math.floor(ms/1000)%60;
    const min = Math.floor(ms/60000)%60;
    const hrs = Math.floor(ms/3600000);
    return [hrs, min, sec].map(n => String(n).padStart(2,'0')).join(':');
  };

  // Storage keys & data model
  const DATA_KEY = 'st_data_v2';

  function loadData(){ try { return JSON.parse(localStorage.getItem(DATA_KEY) || '{}'); } catch(e){ return {}; } }
  function saveData(d){ localStorage.setItem(DATA_KEY, JSON.stringify(d)); }

  // Tracking engine
  let activeStart = null;
  let paused = false;
  let data = loadData();
  if(!data[nowISO()]) data[nowISO()] = { totalMs: 0, sessions: [] };

  function startSession(){
    if(paused) return;
    if(activeStart) return;
    activeStart = Date.now();
    data = loadData();
    const key = nowISO(); if(!data[key]) data[key] = { totalMs:0, sessions:[] };
    data[key].sessions.push({ start: new Date(activeStart).toISOString(), end: null });
    saveData(data);
    renderAll();
  }
  function stopSession(){
    if(!activeStart) return;
    const end = Date.now();
    const dur = end - activeStart;
    data = loadData();
    const key = nowISO(); if(!data[key]) data[key] = { totalMs:0, sessions:[] };
    // set last null-end session
    for(let i = data[key].sessions.length-1; i>=0; i--){
      if(data[key].sessions[i].end === null){
        data[key].sessions[i].end = new Date(end).toISOString();
        break;
      }
    }
    data[key].totalMs = (data[key].totalMs || 0) + dur;
    saveData(data);
    activeStart = null;
    renderAll();
  }

  function evaluateTracking(){
    const visible = document.visibilityState === 'visible';
    const focused = document.hasFocus();
    if(!paused && visible && focused) startSession(); else stopSession();
  }

  document.addEventListener('visibilitychange', evaluateTracking);
  window.addEventListener('focus', evaluateTracking);
  window.addEventListener('blur', evaluateTracking);

  // Pause/resume controls
  function setPaused(v){
    paused = !!v;
    if(paused) stopSession();
    else evaluateTracking();
    // update small UI chips/buttons if present
    $$('.chip, .btn').forEach(b => {/* no-op default */});
  }

  // Export CSV
  function buildCSV(){
    const d = loadData();
    const rows = [['date','total_seconds','session_start','session_end','session_seconds']];
    Object.keys(d).sort().forEach(day => {
      const rec = d[day];
      const total = Math.round((rec.totalMs||0)/1000);
      if(rec.sessions && rec.sessions.length){
        rec.sessions.forEach(s => {
          const st = s.start || '';
          const en = s.end || '';
          let sec = '';
          if(s.start && s.end) sec = Math.round((new Date(s.end) - new Date(s.start))/1000);
          rows.push([day, total, st, en, sec]);
        });
      } else {
        rows.push([day, total, '', '', '']);
      }
    });
    return rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  }
  function download(filename, text){
    const blob = new Blob([text], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 600);
  }

  // UI rendering (Index & Main)
  function renderHomePanel(){
    const elTotal = $('#homeTotal');
    const sessionsPreview = $('#homeSessionsList');
    if(!elTotal) return;
    const d = loadData();
    const today = d[nowISO()] || { totalMs:0, sessions:[] };
    const liveMs = activeStart ? (Date.now() - activeStart) : 0;
    elTotal.textContent = formatDuration((today.totalMs || 0) + liveMs);
    if((today.sessions || []).length === 0) sessionsPreview.textContent = 'No sessions yet — open the tracker to start monitoring.';
    else {
      const last = today.sessions.slice(-3).reverse();
      sessionsPreview.innerHTML = last.map(s=>{
        const st = s.start ? new Date(s.start).toLocaleTimeString() : '—';
        const en = s.end ? new Date(s.end).toLocaleTimeString() : 'active';
        return `${st} → ${en}`;
      }).join(' • ');
    }
  }

  // Sessions render for main page
  function renderSessionsList(){
    const container = $('#sessionsContainer');
    if(!container) return;
    const d = loadData();
    const today = d[nowISO()] || { totalMs:0, sessions:[] };
    if(!today.sessions || today.sessions.length === 0){
      container.innerHTML = `<div class="muted tiny">No sessions recorded yet. Leave the tab open to begin tracking.</div>`;
      return;
    }
    const items = today.sessions.slice().reverse().map(s=>{
      const st = s.start ? new Date(s.start) : null;
      const en = s.end ? new Date(s.end) : null;
      const durMs = (st && en) ? (en - st) : (st && activeStart ? (Date.now() - st.getTime()) : 0);
      return `<div class="session-item"><div>${st ? st.toLocaleTimeString() : '—'} → ${en ? en.toLocaleTimeString() : 'active'}</div><div>${formatDuration(durMs)}</div></div>`;
    }).join('');
    container.innerHTML = items;
  }

  // Circle progress (today relative to daily goal)
  function renderCircle(){
    const totalEl = $('#totalLarge');
    if(!totalEl) return;
    const d = loadData();
    const today = d[nowISO()] || { totalMs:0, sessions:[] };
    const liveMs = activeStart ? (Date.now() - activeStart) : 0;
    const totalMs = (today.totalMs || 0) + liveMs;
    totalEl.textContent = formatDuration(totalMs);
    const minutes = Math.round(totalMs/60000);
    $('#totalMinutes') && ($('#totalMinutes').textContent = `${minutes} min`);
    // choose a daily goal (for progress), eg 8 hours = 480 minutes
    const goalMin = 480;
    const percent = Math.min(100, Math.round((minutes / goalMin) * 100));
    const circle = document.querySelector('.progress-circle .fg');
    if(circle){
      const circumference = 2 * Math.PI * 46; // r=46 per CSS
      const dash = circumference - (percent/100) * circumference;
      circle.style.strokeDashoffset = dash;
    }
  }

  // Week chart (simple canvas bars)
  function renderWeekChart(){
    const canvas = $('#weekChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    // compute last 7 days minutes
    const d = loadData(); const labels = []; const vals = [];
    for(let i=6;i>=0;i--){
      const dt = new Date(); dt.setDate(dt.getDate() - i);
      const key = dt.toISOString().slice(0,10);
      labels.push(key.slice(5));
      const mins = Math.round(((d[key] && d[key].totalMs) ? d[key].totalMs : 0)/60000);
      vals.push(mins);
    }
    const w = canvas.width, h = canvas.height, pad = 24;
    ctx.clearRect(0,0,w,h);
    const max = Math.max(...vals, 10);
    const barW = (w - pad*2) / vals.length * 0.7;
    vals.forEach((v,i)=>{
      const x = pad + i * ((w - pad*2)/vals.length) + ( ((w - pad*2)/vals.length - barW)/2 );
      const barH = (v / max) * (h - pad*2);
      const y = h - pad - barH;
      // draw gradient bar
      const g = ctx.createLinearGradient(x, y, x, y + barH);
      g.addColorStop(0, '#7c5cff'); g.addColorStop(1, '#00d4ff');
      ctx.fillStyle = g; ctx.fillRect(x, y, barW, barH);
      // label
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '11px Inter, sans-serif';
      ctx.fillText(labels[i], x, h - 6);
    });
  }

  // render all UI bits (index & main)
  function renderAll(){
    renderHomePanel(); renderCircle(); renderSessionsList(); renderWeekChart();
  }

  // small live update loop
  setInterval(()=> {
    renderAll();
  }, 1000);

  // initial evaluate
  function evaluateTrackingState(){
    if(!paused && document.visibilityState === 'visible' && document.hasFocus()) startSession();
    else stopSession();
  }
  evaluateTrackingState();

  // Attach UI controls (pause/resume/export/reset)
  document.addEventListener('DOMContentLoaded', () => {
    // show year & dev names across pages if present
    $$('#year, #yearAbout, #yearMain, #yearContact').forEach(el => el && (el.textContent = new Date().getFullYear()));
    $$('#devName, #devNameAbout, #devNameMain, #devNameContact').forEach(el => el && (el.textContent = 'Your Name'));

    // Home small controls
    $('#homePause') && $('#homePause').addEventListener('click', ()=> { setPaused(true); showTempMsg('Tracking paused'); });
    $('#homeResume') && $('#homeResume').addEventListener('click', ()=> { setPaused(false); showTempMsg('Tracking resumed'); });

    // Tracker page controls
    $('#pauseBtn') && $('#pauseBtn').addEventListener('click', ()=> { setPaused(true); showTempMsg('Tracking paused'); });
    $('#resumeBtn') && $('#resumeBtn').addEventListener('click', ()=> { setPaused(false); showTempMsg('Tracking resumed'); });
    $('#resetToday') && $('#resetToday').addEventListener('click', ()=> {
      if(!confirm("Reset today's data? This cannot be undone.")) return;
      const d = loadData(); d[nowISO()] = { totalMs:0, sessions:[] }; saveData(d); renderAll(); showTempMsg('Today reset');
    });
    $('#exportCsv') && $('#exportCsv').addEventListener('click', ()=> {
      const csv = buildCSV(); download('screentime-export.csv', csv); showTempMsg('CSV downloaded');
    });

    // Contact copy email
    $('#copyEmail') && $('#copyEmail').addEventListener('click', async () => {
      const dev = $('#devEmail').textContent || 'dev@example.com';
      try { await navigator.clipboard.writeText(dev); showTempMsg('Email copied'); } catch(e){ showTempMsg(dev); }
    });

    // Contact form
    const contactForm = $('#contactForm');
    if(contactForm){
      contactForm.addEventListener('submit', e => {
        e.preventDefault();
        const name = $('#cname').value.trim();
        const email = $('#cemail').value.trim();
        const msg = $('#cmessage').value.trim();
        if(!name || !email || !msg){ showTempMsg('Please fill all fields'); return; }
        const subject = encodeURIComponent(`ScreenTime message from ${name}`);
        const body = encodeURIComponent(`From: ${name} <${email}>\n\n${msg}\n\n— Sent from ScreenTime UI`);
        const dev = $('#devEmail').textContent || 'dev@example.com';
        window.location.href = `mailto:${dev}?subject=${subject}&body=${body}`;
        showTempMsg('Opened email client');
      });
    }

    // Clear contact
    $('#clearContact') && $('#clearContact').addEventListener('click', ()=> {
      $('#cname').value = ''; $('#cemail').value = ''; $('#cmessage').value = '';
    });

    // small helpful tooltip message
    function showTempMsg(txt){
      const msg = document.createElement('div');
      msg.className = 'card msg-temp tiny';
      msg.style.position = 'fixed'; msg.style.right = '18px'; msg.style.bottom = '18px'; msg.style.zIndex = 9999;
      msg.textContent = txt;
      document.body.appendChild(msg);
      setTimeout(()=> msg.remove(), 2600);
    }

    // initial render
    renderAll();
  });

  // keep saving in storage on page unload (close any active session)
  window.addEventListener('beforeunload', ()=> {
    // if active, stop and persist
    stopSession();
  });

  // helpers exposed for console debugging
  window.ST = {
    startSession, stopSession, setPaused,
    getData: loadData, formatDuration
  };
})();
