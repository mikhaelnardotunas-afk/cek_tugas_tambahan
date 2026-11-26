/* ===================== LAYAR SISWA (IFP) ===================== */
const S = {
  v: 0, d: null, off: 0, rid: null, items: [], ans: {}, idx: 0, screen: '', boardKey: '',
  scratch: {}, saveT: null, warned: false, lastCd: null, sending: false,
};
const $ = (q, el = document) => el.querySelector(q);
const app = $('#app');
const now = () => Date.now() + S.off;

/* ---------- Maskot (karakter orisinal: "Bulbul si Bola Angka") */
function mascot(mood = 'happy') {
  const mouth = {
    happy: '<path d="M38 66 Q50 78 62 66" stroke="#2b2d42" stroke-width="4" fill="none" stroke-linecap="round"/>',
    wow: '<ellipse cx="50" cy="69" rx="7" ry="8" fill="#2b2d42"/><ellipse cx="50" cy="72" rx="4" ry="3" fill="#ff7eb6"/>',
    think: '<path d="M40 70 Q50 66 60 71" stroke="#2b2d42" stroke-width="4" fill="none" stroke-linecap="round"/>',
    cheer: '<path d="M34 63 Q50 86 66 63 Z" fill="#2b2d42"/><path d="M40 72 Q50 80 60 72" fill="#ff7eb6"/>',
  }[mood] || '';
  const arms = mood === 'cheer'
    ? '<path d="M16 52 L4 30" stroke="#2b2d42" stroke-width="5" stroke-linecap="round"/><path d="M84 52 L96 30" stroke="#2b2d42" stroke-width="5" stroke-linecap="round"/><circle cx="4" cy="28" r="5" fill="#ffc93c" stroke="#2b2d42" stroke-width="3"/><circle cx="96" cy="28" r="5" fill="#ffc93c" stroke="#2b2d42" stroke-width="3"/>'
    : '<path d="M16 60 L5 70" stroke="#2b2d42" stroke-width="5" stroke-linecap="round"/><path d="M84 60 L95 50" stroke="#2b2d42" stroke-width="5" stroke-linecap="round"/><circle cx="96" cy="48" r="5" fill="#ffc93c" stroke="#2b2d42" stroke-width="3"/>';
  return `<svg viewBox="0 0 100 110">
    <ellipse cx="50" cy="106" rx="28" ry="4" fill="rgba(0,0,0,.15)"/>
    ${arms}
    <path d="M50 4 L50 14" stroke="#2b2d42" stroke-width="4"/><circle cx="50" cy="5" r="5" fill="#ff6b6b" stroke="#2b2d42" stroke-width="3"/>
    <circle cx="50" cy="56" r="40" fill="#ffc93c" stroke="#2b2d42" stroke-width="4"/>
    <path d="M22 40 Q50 22 78 40" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".6"/>
    <circle cx="36" cy="50" r="9" fill="#fff" stroke="#2b2d42" stroke-width="3"/><circle cx="64" cy="50" r="9" fill="#fff" stroke="#2b2d42" stroke-width="3"/>
    <circle cx="${mood === 'think' ? 39 : 37}" cy="${mood === 'think' ? 47 : 51}" r="4" fill="#2b2d42"/><circle cx="${mood === 'think' ? 67 : 65}" cy="${mood === 'think' ? 47 : 51}" r="4" fill="#2b2d42"/>
    <circle cx="26" cy="64" r="5" fill="#ff7eb6" opacity=".7"/><circle cx="74" cy="64" r="5" fill="#ff7eb6" opacity=".7"/>
    ${mouth}
    <text x="50" y="98" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="13" fill="#2b2d42">π</text>
  </svg>`;
}
document.querySelectorAll('.mascot').forEach(m => m.innerHTML = mascot(m.dataset.mood));

/* ---------- Pembuka */
$('#tapstart').addEventListener('click', () => {
  Sfx.unlock(); Sfx.pop(); goFull();
  $('#tapstart').remove();
  try { navigator.wakeLock && navigator.wakeLock.request('screen'); } catch (e) { }
});
$('#fsbtn').onclick = () => { document.fullscreenElement ? document.exitFullscreen() : goFull(); };
function goFull() { const el = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || (() => { })).call(el); }
document.addEventListener('contextmenu', e => e.preventDefault());

/* ---------- Sinkronisasi dengan server */
async function poll() {
  for (; ;) {
    try {
      const r = await fetch('/api/live?v=' + S.v, { cache: 'no-store' });
      const d = await r.json();
      $('#netbad').classList.add('hidden');
      S.off = d.now - Date.now();
      if (d.same) {   // versi online: belum ada perubahan -> hemat kuota bila lama tidak ada kegiatan
        const idle = Date.now() - (S.lastChange || 0);
        await U.sleep(document.hidden ? 15000 : idle > 180000 ? 5000 : 1300); continue;
      }
      S.lastChange = Date.now();
      S.v = d.v;
      apply(d);
    } catch (e) {
      $('#netbad').classList.remove('hidden');
      await U.sleep(2000);
    }
  }
}
async function post(url, body) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return await r.json();
    } catch (e) { await U.sleep(700); }
  }
  return { error: 'net' };
}

function apply(d) {
  S.d = d;
  Sfx.on = d.settings.suara !== false;
  const st = d.status;
  if ((st === 'running' || st === 'paused') && d.session) {
    const se = d.session;
    if (S.rid !== se.resultId) {
      S.rid = se.resultId; S.items = se.items; S.ans = JSON.parse(JSON.stringify(se.answers || {}));
      S.idx = 0; S.scratch = {}; S.warned = false; S.lastCd = null; S.screen = ''; S.sending = false;
    }
    if (S.screen !== 'exam') renderExam();
    togglePause(st === 'paused');
  } else if (st === 'roll' && d.roll) {
    closeLayers();
    if (S.screen !== 'roll:' + d.roll.startAt) renderRoll(d.roll);
  } else if (st === 'result' && d.session) {
    closeLayers();
    if (S.screen !== 'result:' + d.session.resultId) renderResult(d.session);
  } else {
    closeLayers();
    S.rid = null;
    const key = JSON.stringify([d.board, d.pesan, d.settings]);
    if (S.screen !== 'board' || key !== S.boardKey) { S.boardKey = key; renderBoard(d); }
  }
}
function closeLayers() {
  document.querySelectorAll('.overlay,.countdown,#scratch').forEach(e => e.remove());
}

/* ---------- Header umum */
function header(right = '') {
  document.body.classList.toggle('inexam', S.screen !== 'board');
  const s = S.d.settings;
  return `<div class="topbar">
    <div class="brand"><div class="logo">${s.logo ? `<img src="${U.esc(s.logo)}">` : '📐'}</div>
      <div><h1>${U.esc(s.judul || 'Ujian Praktikum')}</h1><small>${U.esc(s.sekolah)} • ${U.esc(s.mapel)}</small></div></div>
    <div class="spacer"></div>${right}
    <div class="pill clock" id="clock"></div></div>`;
}

/* ---------- PAPAN NILAI */
function stars(n, kkm) { const k = n >= 90 ? 3 : n >= kkm ? 2 : 1; return '⭐'.repeat(k); }
const COLORS = ['#ff6b6b', '#4d96ff', '#ffc93c', '#3ec98a', '#a66cff', '#ff9f1c', '#ff7eb6'];
function colorFor(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; }

function renderBoard(d) {
  S.screen = 'board';
  const b = d.board;
  if (!b) {
    app.innerHTML = header() + `<div class="welcome"><div class="card">
      <div class="mascot big">${mascot('wow')}</div>
      <h2>Selamat Datang!</h2><p>Menunggu guru memilih ujian…</p></div></div>`;
    tickClock(); return;
  }
  const total = b.sudah.length + b.belum.length;
  const pct = total ? Math.round(100 * b.sudah.length / total) : 0;
  const top = b.tampilNilai ? b.sudah.slice(0, 3) : [];
  const pod = (p, cls, medal) => p ? `<div class="pod ${cls}"><div class="ava" style="background:${colorFor(p.nama)}">${cls === 'p1' ? '<span class="crown">👑</span>' : ''}${U.initials(p.nama)}</div>
      <div class="nm">${U.esc(p.nama)}</div><div class="block">${medal}<br>${U.num(p.nilai)}</div></div>` : `<div class="pod ${cls}" style="opacity:.25"><div class="ava">?</div><div class="nm">&nbsp;</div><div class="block">${medal}</div></div>`;
  const podium = top.length ? `<div class="podium">${pod(top[1], 'p2', '🥈')}${pod(top[0], 'p1', '🥇')}${pod(top[2], 'p3', '🥉')}</div><div class="podium-base"></div><div style="height:calc(var(--u)*1.2)"></div>` : '';
  const sudah = b.sudah.map((p, i) => `<div class="row" style="animation-delay:${Math.min(i, 15) * 40}ms">
      <div class="rk" style="background:${b.tampilNilai ? (i < 3 ? ['#ffc93c', '#9aa5b8', '#e09b5b'][i] : '#4d96ff') : '#3ec98a'}">${b.tampilNilai ? i + 1 : '✓'}</div>
      <div class="nm">${U.esc(p.nama)}<small>${U.esc(p.kelas)}</small></div>
      ${b.tampilNilai ? `<div class="stars">${stars(p.nilai, b.kkm)}</div><div class="score ${p.tuntas ? '' : 'low'}">${U.num(p.nilai)}</div>` : '<div class="score">Selesai</div>'}
    </div>`).join('') || `<div class="empty">Belum ada yang ujian.<br>Siapa yang pertama? 🙋</div>`;
  const belum = b.belum.map((p, i) => `<div class="chip" style="animation-delay:${Math.min(i, 30) * 25}ms"><span class="dot" style="background:${colorFor(p.nama)}">${U.initials(p.nama)}</span>${U.esc(p.nama)}</div>`).join('')
    || `<div class="empty">🎉 Semua siswa sudah ujian!</div>`;
  app.innerHTML = header(`<div class="mascot-corner"><div class="bubble">${b.belum.length ? 'Tunggu giliranmu ya! 😊' : 'Kalian hebat! 🎉'}</div><div class="mascot">${mascot('happy')}</div></div>`) + `
    <div class="examtitle"><span class="tag">📝 ${U.esc(b.nama)}</span>
      <div class="meta">${b.jumlahSoal} soal • ${b.durasi} menit • KKM ${U.num(b.kkm, 0)}</div></div>
    <div class="board">
      <div class="card panel"><h2>🏆 Sudah Ujian <span class="pill count">${b.sudah.length} siswa</span></h2>
        ${podium}<div class="list" id="ls1">${sudah}</div></div>
      <div class="card panel"><h2>⏳ Belum Ujian <span class="pill count">${b.belum.length} siswa</span></h2>
        <div style="font-weight:600">Progres kelas: ${pct}%</div><div class="progressbig"><i style="width:${pct}%"></i></div>
        <div class="list" id="ls2"><div class="chips">${belum}</div></div></div>
    </div>
    ${d.pesan ? `<div class="card ticker"><span>📢 ${U.esc(d.pesan)}</span></div>` : ''}
`;
  tickClock(); autoScroll();
}
let scrollT = null;
function autoScroll() {
  clearInterval(scrollT);
  scrollT = setInterval(() => {
    ['#ls1', '#ls2'].forEach(id => {
      const el = $(id); if (!el || el.scrollHeight <= el.clientHeight + 4) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) el.scrollTop = 0; else el.scrollTop += el.clientHeight * 0.6;
    });
  }, 6000);
}
function tickClock() { const c = $('#clock'); if (c) c.textContent = '🕐 ' + new Date(now()).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }

/* ---------- UJIAN */
function renderExam() {
  S.screen = 'exam'; document.body.classList.add('inexam');
  const se = S.d.session;
  app.innerHTML = `<div style="height:calc(var(--u)*1.5)"></div><div class="exam">
    <div class="card exambar">
      <div class="ava" style="background:${colorFor(se.nama)}">${U.initials(se.nama)}</div>
      <div class="who"><b>${U.esc(se.nama)}</b><small>${U.esc(se.kelas)} • ${U.esc(S.d.board ? S.d.board.nama : '')}</small></div>
      <div class="grow"></div><div class="dots" id="dots"></div><div class="grow"></div>
      <div class="timer" id="timer">--:--</div>
      <button class="btn green" id="bFinish">🏁 Selesai</button>
    </div>
    <div class="qwrap" id="qarea"></div>
    <div class="navbar">
      <button class="btn blue" id="bPrev">◀ Sebelumnya</button>
      <button class="btn" id="bRagu">🤔 Ragu-ragu</button>
      <button class="btn" id="bGrid">🔢 Daftar Soal</button>
      <button class="btn purple" id="bScratch">✏️ Coret-coret</button>
      <div class="grow"></div>
      <button class="btn orange" id="bNext">Berikutnya ▶</button>
    </div></div>`;
  $('#bPrev').onclick = () => go(S.idx - 1);
  $('#bNext').onclick = () => S.idx >= S.items.length - 1 ? confirmFinish() : go(S.idx + 1);
  $('#bRagu').onclick = () => { const it = S.items[S.idx]; const a = S.ans[it.qid] || { a: '' }; a.ragu = !a.ragu; S.ans[it.qid] = a; Sfx.click(); save(it.qid); renderQ(); };
  $('#bGrid').onclick = showGrid;
  $('#bScratch').onclick = openScratch;
  $('#bFinish').onclick = confirmFinish;
  renderQ();
  tick();
}
function go(i) {
  if (i < 0 || i >= S.items.length) return;
  flushEssay(); S.idx = i; Sfx.click(); renderQ();
  post('/api/ifp/answer', { resultId: S.rid, index: i });
}
function answered(it) { return String((S.ans[it.qid] || {}).a || '').trim() !== ''; }

function renderQ() {
  const it = S.items[S.idx]; if (!it) return;
  const a = S.ans[it.qid] || { a: '' };
  const isPG = it.tipe === 'PG';
  const q = $('#qarea');
  q.className = 'qwrap' + (isPG ? '' : ' essay');
  const qcard = `<div class="card qcard">
      <div class="qhead"><span class="qno">Soal ${S.idx + 1}</span><span class="qtype">dari ${S.items.length} • ${isPG ? '🔘 Pilihan Ganda' : '🔢 Isian Angka'}</span>
        ${a.ragu ? '<span class="pill" style="background:var(--c)">🤔 Ragu</span>' : ''}</div>
      <div class="qtext">${U.fmt(it.soal)}</div>
      ${it.gambar ? `<div class="qimg"><img src="${U.esc(it.gambar)}"></div>` : ''}
    </div>`;
  if (isPG) {
    q.innerHTML = qcard + `<div class="opts">${it.options.map(o =>
      `<button class="opt ${a.a === o.v ? 'sel' : ''}" data-v="${U.esc(o.v)}"><span class="lt">${o.k}</span><span>${U.fmt(o.t)}</span></button>`).join('')}</div>`;
    q.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      const cur = S.ans[it.qid] || {};
      S.ans[it.qid] = { a: b.dataset.v, ragu: !!cur.ragu };
      Sfx.pop(); save(it.qid); renderQ();
    });
  } else {
    q.innerHTML = qcard + `<div class="card essaybox">
      <label>🔢 Jawabanmu (angka):</label>
      <div class="numdisp" id="ta"></div>
      <div class="kbd num" id="kbd"></div></div>`;
    buildNumpad(it);
  }
  $('#bPrev').disabled = S.idx === 0;
  $('#bNext').innerHTML = S.idx >= S.items.length - 1 ? '🏁 Selesai' : 'Berikutnya ▶';
  $('#bNext').className = 'btn ' + (S.idx >= S.items.length - 1 ? 'green' : 'orange');
  $('#bRagu').classList.toggle('on', !!a.ragu);
  updDots();
}
function updDots() {
  const el = $('#dots'); if (!el) return;
  el.innerHTML = S.items.map((it, i) => `<i class="${i === S.idx ? 'cur' : (S.ans[it.qid] || {}).ragu ? 'ragu' : answered(it) ? 'ok' : ''}"></i>`).join('');
}
/* Papan angka: hanya angka, koma desimal, tanda minus, dan garis pecahan */
const NUMKEYS = ['7', '8', '9', '⌫', '4', '5', '6', 'C', '1', '2', '3', '−', '0', ',', '/'];
function showNum(v) {
  const el = $('#ta'); if (!el) return;
  el.innerHTML = v ? U.esc(v) + '<i class="caret"></i>' : '<span class="ph">Ketuk angka di bawah</span>';
}
function buildNumpad(it) {
  const k = $('#kbd'); if (!k) return;
  showNum((S.ans[it.qid] || {}).a || '');
  k.innerHTML = NUMKEYS.map(x => `<button data-x="${x}" class="${x === '⌫' ? 'del' : x === 'C' ? 'fn' : /[0-9]/.test(x) ? '' : 'op'} ${x === '0' ? 'w2' : ''}">${x === 'C' ? 'Hapus' : x}</button>`).join('');
  k.querySelectorAll('button').forEach(b => b.onclick = () => {
    const x = b.dataset.x;
    let v = String((S.ans[it.qid] || {}).a || '');
    const part = v.split('/').pop();
    if (x === '⌫') v = v.slice(0, -1);
    else if (x === 'C') v = '';
    else if (x === '−') { if (!part.startsWith('-')) v = v.slice(0, v.length - part.length) + '-' + part; else v = v.slice(0, v.length - part.length) + part.slice(1); }
    else if (x === ',') { if (!part.includes(',')) v += (part === '' || part === '-' ? '0' : '') + ','; }
    else if (x === '/') { if (!v.includes('/') && /[0-9]$/.test(v)) v += '/'; }
    else if (v.length < 18) v = (part === '0' ? v.slice(0, -1) : v) + x;
    Sfx.click();
    S.ans[it.qid] = { a: v, ragu: !!(S.ans[it.qid] || {}).ragu };
    showNum(v); debounceSave(it.qid); updDots();
  });
}
// keyboard fisik (jika IFP memakai keyboard): hanya angka
document.addEventListener('keydown', e => {
  if (S.screen !== 'exam' || !$('#kbd') || $('.overlay') || $('#scratch')) return;
  const map = { Backspace: '⌫', Delete: 'C', '-': '−', ',': ',', '.': ',', '/': '/' };
  const x = /^[0-9]$/.test(e.key) ? e.key : map[e.key];
  if (!x) return;
  e.preventDefault();
  const b = $(`#kbd button[data-x="${x}"]`); if (b) b.click();
});
function save(qid) {
  const a = S.ans[qid] || { a: '' };
  post('/api/ifp/answer', { resultId: S.rid, qid, a: a.a || '', ragu: !!a.ragu, index: S.idx });
}
function debounceSave(qid) { clearTimeout(S.saveT); S.saveT = setTimeout(() => { S.saveT = null; save(qid); }, S.d && S.d.mode === 'online' ? 600 : 250); }
function flushEssay() {
  if (S.saveT) { clearTimeout(S.saveT); S.saveT = null; const it = S.items[S.idx]; if (it) save(it.qid); }
}

/* ---------- Daftar soal */
function showGrid() {
  Sfx.click();
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<div class="card modal"><h2>🔢 Daftar Soal</h2>
    <div class="legend"><span><i style="background:#3ec98a"></i>Sudah dijawab</span><span><i style="background:#ffc93c"></i>Ragu-ragu</span><span><i style="background:#fff"></i>Belum</span></div>
    <div class="gridnav" style="grid-template-columns:repeat(${Math.min(10, S.items.length)}, calc(var(--u)*6.2))">${S.items.map((it, i) =>
      `<button data-i="${i}" class="${(S.ans[it.qid] || {}).ragu ? 'ragu' : answered(it) ? 'ok' : ''} ${i === S.idx ? 'cur' : ''}">${i + 1}${it.tipe !== 'PG' ? '<small>U</small>' : ''}</button>`).join('')}</div>
    <div class="acts"><button class="btn" id="gClose">Tutup</button></div></div>`;
  document.body.appendChild(ov);
  ov.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { ov.remove(); go(+b.dataset.i); });
  $('#gClose').onclick = () => ov.remove();
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
}

/* ---------- Selesai */
function confirmFinish() {
  flushEssay(); Sfx.click();
  const kosong = S.items.filter(it => !answered(it)).length;
  const ragu = S.items.filter(it => (S.ans[it.qid] || {}).ragu).length;
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<div class="card modal"><div class="mascot big">${mascot(kosong ? 'think' : 'cheer')}</div>
    <h2>${kosong ? 'Eits, tunggu dulu!' : 'Sudah yakin?'}</h2>
    <p>${kosong ? `Masih ada <b>${kosong} soal</b> yang belum dijawab.` : 'Semua soal sudah dijawab. Hebat!'}${ragu ? `<br>Ada <b>${ragu} soal</b> yang kamu tandai ragu-ragu.` : ''}</p>
    <div class="acts"><button class="btn blue" id="fBack">🔍 Periksa Lagi</button><button class="btn green" id="fGo">🏁 Ya, Kumpulkan!</button></div></div>`;
  document.body.appendChild(ov);
  $('#fBack').onclick = () => ov.remove();
  $('#fGo').onclick = async () => {
    if (S.sending) return; S.sending = true;
    $('#fGo').disabled = true; $('#fGo').textContent = 'Mengirim…';
    const r = await post('/api/ifp/submit', { resultId: S.rid, answers: S.ans });
    if (r.error) { S.sending = false; ov.remove(); }
  };
}

/* ---------- Jeda */
function togglePause(on) {
  let ov = $('#pauseov');
  if (on && !ov) {
    ov = document.createElement('div'); ov.className = 'overlay'; ov.id = 'pauseov';
    ov.innerHTML = `<div class="card modal"><div class="paused-face">⏸️</div><h2>Ujian Dijeda</h2><p>Tunggu sebentar ya, guru sedang menjeda ujian.<br>Waktu tidak berjalan.</p></div>`;
    document.body.appendChild(ov);
  } else if (!on && ov) ov.remove();
}

/* ---------- Coret-coret */
function openScratch() {
  Sfx.click(); flushEssay();
  const it = S.items[S.idx];
  const wrap = document.createElement('div'); wrap.id = 'scratch';
  wrap.innerHTML = `<canvas></canvas><div class="card scrtools">
      <b>✏️</b>
      ${['#2b2d42', '#ff3b3b', '#2f6bff', '#16a34a'].map((c, i) => `<button class="swatch ${i ? '' : 'sel'}" data-c="${c}" style="background:${c}"></button>`).join('')}
      <button class="btn" data-w="4">Tipis</button><button class="btn on" data-w="8">Tebal</button>
      <button class="btn" id="sErase">🧽 Hapus</button><button class="btn" id="sPaper">📄 Kertas</button>
      <button class="btn red" id="sClear">🗑️ Bersihkan</button><button class="btn green" id="sClose">✔ Tutup</button></div>`;
  document.body.appendChild(wrap);
  const cv = wrap.querySelector('canvas'), dpr = window.devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let color = '#2b2d42', width = 8, erase = false, drawing = false, last = null;
  const saved = S.scratch[it.qid];
  if (saved) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, innerWidth, innerHeight); img.src = saved.img; if (saved.paper) wrap.classList.add('paper'); }
  cv.onpointerdown = e => { drawing = true; last = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); dot(e); };
  cv.onpointermove = e => {
    if (!drawing) return;
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = color; ctx.lineWidth = erase ? 40 : width;
    ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(e.clientX, e.clientY); ctx.stroke(); last = [e.clientX, e.clientY];
  };
  const dot = e => { ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over'; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(e.clientX, e.clientY, (erase ? 40 : width) / 2, 0, 7); ctx.fill(); };
  cv.onpointerup = cv.onpointercancel = () => drawing = false;
  wrap.querySelectorAll('.swatch').forEach(b => b.onclick = () => { color = b.dataset.c; erase = false; wrap.querySelectorAll('.swatch').forEach(x => x.classList.toggle('sel', x === b)); $('#sErase').classList.remove('on'); });
  wrap.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { width = +b.dataset.w; wrap.querySelectorAll('[data-w]').forEach(x => x.classList.toggle('on', x === b)); });
  $('#sErase').onclick = () => { erase = !erase; $('#sErase').classList.toggle('on', erase); };
  $('#sPaper').onclick = () => wrap.classList.toggle('paper');
  $('#sClear').onclick = () => { ctx.clearRect(0, 0, cv.width, cv.height); };
  $('#sClose').onclick = () => { S.scratch[it.qid] = { img: cv.toDataURL(), paper: wrap.classList.contains('paper') }; wrap.remove(); };
}

/* ---------- ROLING / UNDIAN SISWA */
function renderRoll(r) {
  S.screen = 'roll:' + r.startAt; S.rollStep = -1; S.rollEnd = false;
  document.body.classList.add('inexam');
  app.innerHTML = `<div class="rollwrap"><div class="card rollcard">
      <div class="mascot big" id="rollmas">${mascot('think')}</div>
      <h2 id="rollttl">🎲 Siapa yang maju?</h2>
      <div class="rollwin"><div class="rollname" id="rollname">?</div></div>
      <div class="rollsub" id="rollsub">Mengundi…</div></div></div>`;
  const screen = S.screen, TOTAL = 48, names = r.names.length ? r.names : [r.winnerNama];
  const late = now() - r.startAt > r.dur + 1500;           // halaman baru dibuka setelah undian selesai
  const loop = () => {
    if (S.screen !== screen) return;
    const p = Math.min(1, Math.max(0, (now() - r.startAt) / r.dur));
    const idx = late ? TOTAL : Math.floor(TOTAL * (1 - Math.pow(1 - p, 3)));
    if (idx !== S.rollStep && !S.rollEnd) {
      S.rollStep = idx;
      const el = $('#rollname');
      if (idx >= TOTAL) {
        S.rollEnd = true;
        el.textContent = r.winnerNama; el.classList.add('final'); el.classList.remove('spin');
        $('#rollttl').textContent = '🎉 Giliran kamu!';
        $('#rollsub').innerHTML = (r.winnerKelas ? `Kelas ${U.esc(r.winnerKelas)} • ` : '') + 'Silakan bersiap maju ke depan 🙋';
        $('#rollmas').innerHTML = mascot('cheer');
        if (!late) { Sfx.win(); confetti(); }
      } else {
        el.textContent = names[idx % names.length]; el.classList.add('spin');
        el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
        Sfx.tick();
      }
    }
    if (!S.rollEnd) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/* ---------- HASIL */
function renderResult(se) {
  S.screen = 'result:' + se.resultId; document.body.classList.add('inexam');
  const sc = se.score || {};
  const n = sc.nilai || 0, kkm = se.kkm || 75;
  const k = n >= 90 ? 3 : n >= kkm ? 2 : 1;
  const msg = n >= 90 ? 'Luar biasa! Kamu jenius matematika! 🚀' : n >= kkm ? 'Hebat! Kamu berhasil! 💪' : n >= 50 ? 'Bagus, terus berlatih ya! 📚' : 'Jangan menyerah, ayo belajar lagi! 🌱';
  let list = '';
  if (se.pembahasan) {
    list = `<div class="reslist"><h3>📖 Pembahasan</h3>${se.items.map((it, i) => {
      const a = (se.answers[it.qid] || {}).a || '';
      const det = se.detail[it.qid] || {};
      const ansTxt = it.tipe === 'PG' ? (it.options.find(o => o.v === a) || {}) : null;
      const keyTxt = it.tipe === 'PG' ? (it.options.find(o => o.v === it.kunci) || {}) : null;
      return `<div class="it ${det.benar ? 'ok' : 'no'}"><b>${i + 1}.</b> ${U.fmt(it.soal)}
        <div class="ans">Jawabanmu: ${it.tipe === 'PG' ? (ansTxt.k ? ansTxt.k + '. ' + U.fmt(ansTxt.t) : '<i>kosong</i>') : U.esc(a || '(kosong)')} ${det.benar ? '✅' : '❌'}</div>
        <div class="ans">Kunci: ${it.tipe === 'PG' ? keyTxt.k + '. ' + U.fmt(keyTxt.t) : U.esc(it.kunci)}</div>
        ${it.pembahasan ? `<div class="bh">💡 ${U.fmt(it.pembahasan)}</div>` : ''}</div>`;
    }).join('')}</div>`;
  }
  const showN = se.tampilNilai !== false;
  app.innerHTML = `<div class="result"><div class="card rescard">
      <div class="mascot big">${mascot(n >= kkm ? 'cheer' : 'happy')}</div>
      <h2>${n >= kkm ? 'Selamat!' : 'Kerja bagus!'}</h2><div class="nm">${U.esc(se.nama)} • ${U.esc(se.kelas)}</div>
      ${showN ? `<div class="bigstars">${[1, 2, 3].map(i => `<span class="${i <= k ? '' : 'off'}" style="animation-delay:${i * 0.25}s">⭐</span>`).join('')}</div>
      <div class="bignum" id="bignum">0</div>
      <div class="resgrid">
        ${sc.pgTotal ? `<span class="pill">✅ PG benar: ${sc.pgBenar} / ${sc.pgTotal}</span>` : ''}
        ${sc.essayTotal ? `<span class="pill">✍️ Skor uraian: ${U.num(sc.essayEarned)} / ${U.num(sc.essayTotal)}</span>` : ''}
        <span class="pill" style="background:${n >= kkm ? 'var(--d)' : 'var(--orange)'};color:#fff">${n >= kkm ? 'TUNTAS' : 'Belum tuntas'} (KKM ${U.num(kkm, 0)})</span>
      </div><div class="resmsg">${msg}</div>` : `<div class="resmsg" style="font-size:calc(var(--u)*3)">Jawabanmu sudah tersimpan. Terima kasih! 🙏</div>`}
      ${list}
      <div class="backin" id="backin"></div></div></div>`;
  if (showN) {
    let t0 = null; const el = $('#bignum');
    const anim = ts => { if (!t0) t0 = ts; const p = Math.min(1, (ts - t0) / 1600); el.textContent = U.num(n * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(anim); };
    requestAnimationFrame(anim);
  }
  if (n >= kkm) { Sfx.win(); confetti(); } else Sfx.soft();
}

/* ---------- Konfeti */
function confetti() {
  const cv = $('#confetti'), ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const P = Array.from({ length: 220 }, () => ({
    x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * .6, r: 6 + Math.random() * 8,
    c: COLORS[Math.floor(Math.random() * COLORS.length)], vx: -2 + Math.random() * 4, vy: 3 + Math.random() * 4, a: Math.random() * 6, va: -.2 + Math.random() * .4,
  }));
  const t0 = performance.now();
  const step = t => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    P.forEach(p => { p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); });
    if (t - t0 < 5000) requestAnimationFrame(step); else ctx.clearRect(0, 0, cv.width, cv.height);
  };
  requestAnimationFrame(step);
}

/* ---------- Detak waktu */
function tick() {
  const d = S.d; if (!d) return;
  tickClock();
  if (S.screen === 'exam' && d.session) {
    const se = d.session, t = now();
    // hitung mundur sebelum mulai
    let cd = $('.countdown');
    if (se.startAt && t < se.startAt && d.status === 'running') {
      const n = Math.ceil((se.startAt - t) / 1000);
      if (!cd) { cd = document.createElement('div'); cd.className = 'countdown'; document.body.appendChild(cd); }
      const label = n > 3 ? 'Siap?' : n;
      if (S.lastCd !== label) {
        S.lastCd = label;
        cd.innerHTML = `<div><div class="who">Giliran:<b>${U.esc(se.nama)}</b></div><div class="num" style="${n > 3 ? 'font-size:calc(var(--u)*12)' : ''}">${label}</div></div>`;
        if (n <= 3) Sfx.beep();
      }
    } else if (cd) { cd.remove(); Sfx.go(); }
    const rem = d.status === 'paused' ? (se.remaining || 0) : (se.endsAt - Math.max(t, se.startAt || 0));
    const el = $('#timer');
    if (el) {
      el.textContent = '⏱️ ' + U.mmss(rem);
      el.classList.toggle('warn', rem < 60000);
      if (rem < 60000 && rem > 0 && !S.warned && d.status === 'running') { S.warned = true; Sfx.warn(); }
      if (rem <= 0 && d.status === 'running' && !$('#timeup')) {
        flushEssay();
        const ov = document.createElement('div'); ov.className = 'overlay'; ov.id = 'timeup';
        ov.innerHTML = `<div class="card modal"><div class="paused-face">⏰</div><h2>Waktu Habis!</h2><p>Jawabanmu sedang dikumpulkan…</p></div>`;
        document.body.appendChild(ov);
      }
    }
  }
  if (S.screen.startsWith('result') && d.session) {
    const b = $('#backin');
    if (b) b.textContent = d.session.tahan ? '' : 'Kembali ke papan nilai dalam ' + Math.max(0, Math.ceil((d.session.resultUntil - now()) / 1000)) + ' detik…';
  }
}
setInterval(tick, 250);
poll();
