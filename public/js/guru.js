/* ===================== PANEL GURU ===================== */
const $ = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => [...el.querySelectorAll(q)];
const esc = U.esc;
const G = {
  token: localStorage.getItem('ujian_token') || '', d: null, v: 0, page: localStorage.getItem('ujian_page') || 'kendali',
  selStu: null, kelasF: '', tabF: 'belum', q: '', bankSel: null, qf: { tipe: '', level: '', q: '' }, qChecked: new Set(),
  sf: { kelas: '', q: '' }, sChecked: new Set(), rep: { examId: null, tab: 'rekap', kelas: '' }, mon: null, monKey: '',
  A: { d: null, a: 0, rid: '', view: null, kunci: false, loop: false, off: 0, key: '' },
};
const TITLES = { kendali: 'Kendali Ujian', aktivitas: 'Aktivitas Siswa (Realtime)', tugas: 'Tugas Tambahan', siswa: 'Data Siswa', bank: 'Bank Soal', ujian: 'Pengaturan Ujian', laporan: 'Laporan & Nilai', pengaturan: 'Pengaturan', panduan: 'Panduan Penggunaan' };

/* ---------------- Dasar ---------------- */
async function api(path, body) {
  const opt = { headers: { 'X-Token': G.token } };
  if (body !== undefined) { opt.method = 'POST'; opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let r;
  try { r = await fetch(path, opt); } catch (e) { throw new Error('Tidak dapat terhubung ke server. Pastikan server.py masih berjalan.'); }
  const j = await r.json().catch(() => ({ error: 'Respon server tidak valid' }));
  if (r.status === 401) { showLogin(); throw new Error('AUTH'); }
  if (j.error) throw new Error(j.error);
  return j;
}
async function act(path, body, okMsg) {
  try { const r = await api(path, body); if (okMsg) toast(okMsg, 'ok'); await reload(); return r; }
  catch (e) { if (e.message !== 'AUTH') toast(e.message, 'err'); return null; }
}
function toast(msg, type = '') {
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), type === 'err' ? 5000 : 2800);
}
function modal({ title, body, foot = '', size = '' }) {
  const el = document.createElement('div'); el.className = 'mback';
  el.innerHTML = `<div class="modal ${size}"><div class="modal-h"><h3>${title}</h3><button class="modal-x" type="button">×</button></div>
    <div class="modal-b">${body}</div>${foot !== false ? `<div class="modal-f">${foot}</div>` : ''}</div>`;
  $('#modalRoot').appendChild(el);
  el.close = () => el.remove();
  el.querySelector('.modal-x').onclick = el.close;
  return el;
}
const modalOpen = () => !!$('#modalRoot .mback');
function confirmBox(msg, { ok = 'Ya, lanjutkan', danger = false, title = 'Konfirmasi' } = {}) {
  return new Promise(res => {
    const m = modal({ title, body: `<p style="margin:0;line-height:1.6">${msg}</p>`, foot: `<button class="b" data-x="0">Batal</button><button class="b ${danger ? 'danger solid' : 'primary'}" data-x="1">${ok}</button>` });
    m.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { m.close(); res(b.dataset.x === '1'); });
    m.querySelector('.modal-x').onclick = () => { m.close(); res(false); };
  });
}
function pickFile(accept) {
  return new Promise(res => { const f = $('#filePick'); f.value = ''; f.accept = accept; f.onchange = () => res(f.files[0]); f.click(); });
}
const nk = k => String(k).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
async function readSheet(file, prefer) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const name = wb.SheetNames.find(n => n.toUpperCase() === prefer) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false });
  return rows.map(r => { const o = {}; for (const k in r) o[nk(k)] = r[k]; return o; });
}
function pick(o, keys) { for (const k of keys) if (o[k] !== undefined && String(o[k]).trim() !== '') return String(o[k]).trim(); return ''; }
function writeXlsx(filename, sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(s => {
    const ws = XLSX.utils.aoa_to_sheet(s.aoa);
    if (s.cols) ws['!cols'] = s.cols.map(w => ({ wch: w }));
    if (s.merges) ws['!merges'] = s.merges;
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}
const safeName = s => String(s || 'data').replace(/[\\/:*?"<>|]+/g, '').trim();

/* ---------------- Data bantu ---------------- */
const findEx = id => G.d.exams.find(e => e.id === id);
const findBank = id => G.d.banks.find(b => b.id === id);
const findStu = id => G.d.students.find(s => s.id === id);
const kkmOf = ex => (ex && ex.kkm !== null && ex.kkm !== '' && ex.kkm !== undefined) ? +ex.kkm : +(G.d.settings.kkm || 75);
function participants(ex) {
  const k = ex.kelas || [];
  return G.d.students.filter(s => !k.length || k.includes(s.kelas)).sort((a, b) => (a.kelas || '').localeCompare(b.kelas || '') || a.nama.localeCompare(b.nama));
}
function latestMap(examId) {
  const m = {};
  G.d.results.forEach(r => { if (r.examId === examId && r.status === 'selesai' && (!m[r.studentId] || r.startedAt > m[r.studentId].startedAt)) m[r.studentId] = r; });
  return m;
}
const allKelas = () => [...new Set(G.d.students.map(s => s.kelas).filter(Boolean))].sort();
function bankCount(bid) {
  const q = G.d.questions.filter(x => x.bankId === bid);
  return { pg: q.filter(x => x.tipe === 'PG').length, es: q.filter(x => x.tipe !== 'PG').length, all: q.length };
}

/* ---------------- Login & boot ---------------- */
function showLogin() { $('#shell').classList.add('hidden'); $('#login').classList.remove('hidden'); setTimeout(() => $('#pin').focus(), 50); }
$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  try {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: $('#pin').value }) });
    const j = await r.json();
    if (!j.token) { $('#loginErr').textContent = j.error || 'PIN salah'; return; }
    G.token = j.token; localStorage.setItem('ujian_token', j.token); $('#pin').value = ''; $('#loginErr').textContent = '';
    boot();
  } catch (err) { $('#loginErr').textContent = 'Server tidak terhubung'; }
};
$('#logout').onclick = () => { localStorage.removeItem('ujian_token'); G.token = ''; showLogin(); };
$$('#nav a').forEach(a => a.onclick = () => go(a.dataset.p));
function go(p) { G.page = p; localStorage.setItem('ujian_page', p); render(); $('.content').scrollTop = 0; }

async function boot() {
  try { await reload(); } catch (e) { if (e.message !== 'AUTH') toast(e.message, 'err'); return; }
  $('#login').classList.add('hidden'); $('#shell').classList.remove('hidden');
  if (!G.syncing) { G.syncing = true; sync(); setInterval(monitorTick, 1000); }
}
async function reload(renderIt = true) {
  G.d = await api('/api/data');
  G.v = G.d.v;
  const s = G.d.settings;
  $('#sbSekolah').textContent = s.sekolah || 'Matematika';
  $('#ifpUrl').textContent = 'Alamat IFP: ' + ifpAddr();
  if (renderIt) render();
}
async function sync() {
  for (; ;) {
    try {
      const r = await fetch('/api/live?v=' + G.v, { cache: 'no-store' });
      const d = await r.json();
      $('#conn').classList.remove('bad'); $('#conn').innerHTML = '<i></i> Terhubung';
      if (d.same) {   // versi online: belum ada perubahan -> hemat kuota bila lama tidak ada kegiatan
        const idle = Date.now() - (G.lastChange || 0);
        await U.sleep(document.hidden ? 20000 : idle > 180000 ? 6000 : 2500); continue;
      }
      G.lastChange = Date.now();
      if (d.v !== G.v && G.token) {
        G.v = d.v;
        const live = ['kendali', 'laporan'].includes(G.page) && !modalOpen() && !(document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && G.page !== 'kendali');
        try { await reload(live); } catch (e) { }
      }
    } catch (e) {
      $('#conn').classList.add('bad'); $('#conn').innerHTML = '<i></i> Terputus';
      await U.sleep(2000);
    }
  }
}
function render() {
  if (!G.d) return;
  $$('#nav a').forEach(a => a.classList.toggle('act', a.dataset.p === G.page));
  $('#pageTitle').textContent = TITLES[G.page] || '';
  const c = $('#content'), st = c.scrollTop;
  const fn = { kendali: pgKendali, aktivitas: pgAktivitas, tugas: pgTugas, siswa: pgSiswa, bank: pgBank, ujian: pgUjian, laporan: pgLaporan, pengaturan: pgPengaturan, panduan: pgPanduan }[G.page] || pgKendali;
  fn(c);
  c.scrollTop = st;
}

/* =====================================================================
   KENDALI UJIAN
   ===================================================================== */
function pgKendali(c) {
  const d = G.d, lv = d.live, ex = findEx(lv.examId);
  if (!d.exams.length) {
    c.innerHTML = `<div class="card card-b"><h3>Belum ada pengaturan ujian</h3><p class="muted">Buat dulu ujian di menu <b>Pengaturan Ujian</b>: pilih bank soal, jumlah soal, dan durasi.</p>
      <button class="b primary" onclick="go('ujian')">Buat Ujian</button></div>`;
    return;
  }
  let info = '<p class="muted">Pilih ujian yang akan ditampilkan di IFP.</p>';
  if (ex) {
    const parts = participants(ex), done = latestMap(ex.id), nDone = parts.filter(p => done[p.id]).length;
    info = `<div class="kv">
      <div><small>Soal / siswa</small><b>${(+ex.jmlPG || 0) + (+ex.jmlEssay || 0)}</b><small>${ex.jmlPG} PG • ${ex.jmlEssay} uraian</small></div>
      <div><small>Durasi</small><b>${ex.durasi} menit</b><small>KKM ${kkmOf(ex)}</small></div>
      <div><small>Sudah ujian</small><b>${nDone} / ${parts.length}</b><small>${(ex.kelas || []).join(', ') || 'Semua kelas'}</small></div></div>
      <div class="bar"><i style="width:${parts.length ? 100 * nDone / parts.length : 0}%"></i></div>`;
  }
  c.innerHTML = `<div class="grid-k">
    <div class="stack">
      <div class="card"><div class="card-h"><h3>1. Ujian yang ditampilkan di IFP</h3><button class="b sm" onclick="go('ujian')">Atur ujian</button></div>
        <div class="card-b"><select id="kExam">${d.exams.map(e => `<option value="${e.id}" ${e.id === lv.examId ? 'selected' : ''}>${esc(e.nama)}</option>`).join('')}
          ${!ex ? '<option value="" selected>— pilih ujian —</option>' : ''}</select>${info}</div></div>
      <div class="card"><div class="card-h"><h3>2. Pilih siswa</h3>
          <div class="btns"><button class="b primary" id="kRoll" title="Undi acak, hanya dari siswa yang belum ujian">🎲 Acak Siswa</button>
          <div class="seg" id="kTab"><button data-t="belum">Belum</button><button data-t="sudah">Sudah</button><button data-t="semua">Semua</button></div></div></div>
        <div class="card-b" style="padding-bottom:10px"><div class="inline" style="margin-bottom:10px">
          <input type="search" id="kQ" placeholder="Cari nama / NIS…" value="${esc(G.q)}" style="flex:1">
          <select id="kKelas" style="width:150px"><option value="">Semua kelas</option>${[...new Set((ex ? participants(ex) : []).map(s => s.kelas))].map(k => `<option ${k === G.kelasF ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
          <div class="picklist" id="kList"></div></div>
        <div class="startbar"><div><small class="muted">Siswa terpilih</small><div id="kSel" style="font-weight:700;font-size:16px">—</div></div>
          <button class="b success lg" id="kStart">▶ MULAI UJIAN</button></div></div>
    </div>
    <div class="stack">
      <div class="card"><div class="card-h"><h3>3. Monitor layar IFP</h3><small id="monSmall"></small></div><div class="card-b" id="mon">Memuat…</div></div>
      <div class="card"><div class="card-h"><h3>Pesan berjalan di IFP</h3></div><div class="card-b">
        <div class="inline"><input type="text" id="kMsg" placeholder="Contoh: Siswa berikutnya bersiap di depan kelas" value="${esc(lv.pesan || '')}" style="flex:1">
        <button class="b primary" id="kMsgGo">Tampilkan</button><button class="b" id="kMsgDel">Hapus</button></div></div></div>
      <div class="card"><div class="card-h"><h3>Menghubungkan IFP</h3></div><div class="card-b">
        <p style="margin-top:0">Sambungkan IFP ke Wi-Fi yang sama dengan laptop ini, lalu buka browser di IFP dan ketik:</p>
        ${online() ? `<div class="ifpurl" style="font-size:20px;display:inline-block;margin:0 8px 8px 0">${esc(location.origin)}</div>` : d.ips.map(ip => `<div class="ifpurl" style="font-size:20px;display:inline-block;margin:0 8px 8px 0">http://${ip}:${d.port}</div>`).join('')}
        <p class="muted" style="margin-bottom:0">Ketuk layar IFP sekali agar suara dan layar penuh aktif. Jika tidak terhubung, izinkan Python di Windows Firewall (lihat Panduan).</p></div></div>
    </div></div>`;
  $('#kExam').onchange = e => act('/api/live/select', { examId: e.target.value }, 'Ujian di IFP diganti');
  $$('#kTab button').forEach(b => { b.classList.toggle('act', b.dataset.t === G.tabF); b.onclick = () => { G.tabF = b.dataset.t; $$('#kTab button').forEach(x => x.classList.toggle('act', x === b)); renderPick(); }; });
  $('#kQ').oninput = e => { G.q = e.target.value; renderPick(); };
  $('#kKelas').onchange = e => { G.kelasF = e.target.value; renderPick(); };
  $('#kStart').onclick = () => startExam(false);
  $('#kRoll').onclick = doRoll;
  $('#kMsgGo').onclick = () => act('/api/live/message', { pesan: $('#kMsg').value }, 'Pesan ditampilkan di IFP');
  $('#kMsgDel').onclick = () => { $('#kMsg').value = ''; act('/api/live/message', { pesan: '' }); };
  $('#mon').onclick = monitorClick;
  renderPick();
  G.monKey = ''; renderMonitor();
}
function renderPick() {
  const el = $('#kList'); if (!el) return;
  const ex = findEx(G.d.live.examId);
  if (!ex) { el.innerHTML = '<div class="card-b muted">Pilih ujian terlebih dahulu.</div>'; return; }
  const done = latestMap(ex.id), q = G.q.toLowerCase();
  const list = participants(ex).filter(s => (!G.kelasF || s.kelas === G.kelasF) && (!q || s.nama.toLowerCase().includes(q) || (s.nis || '').includes(q))
    && (G.tabF === 'semua' || (G.tabF === 'sudah' ? done[s.id] : !done[s.id])));
  const runId = G.mon && G.mon.res && ['running', 'paused'].includes(G.mon.live.status) ? G.mon.res.studentId : null;
  el.innerHTML = list.map((s, i) => {
    const r = done[s.id];
    return `<div class="pick ${s.id === G.selStu ? 'sel' : ''}" data-id="${s.id}"><span class="no">${i + 1}</span><span class="nm">${esc(s.nama)}</span><span class="kl">${esc(s.kelas)}</span>
      ${s.id === runId ? '<span class="badge amber">Mengerjakan</span>' : r ? `<span class="badge ${r.score.nilai >= kkmOf(ex) ? 'green' : 'red'}">${U.num(r.score.nilai)}</span>` : '<span class="badge">Belum</span>'}</div>`;
  }).join('') || `<div class="card-b muted">${G.d.students.length ? 'Tidak ada siswa pada daftar ini.' : 'Belum ada data siswa. Tambahkan di menu Data Siswa.'}</div>`;
  el.querySelectorAll('.pick').forEach(p => p.onclick = () => {
    G.selStu = p.dataset.id; renderPick();
    const rl = G.d.live.status === 'roll' && G.d.live.roll;
    if (rl && rl.winnerId !== p.dataset.id) act('/api/live/roll/cancel', {});   // guru memilih manual: undian dibatalkan
  });
  const s = findStu(G.selStu);
  $('#kSel').innerHTML = s ? `${esc(s.nama)} <span class="muted" style="font-weight:400">(${esc(s.kelas)})</span>${done[s.id] ? ' <span class="badge amber">sudah pernah ujian</span>' : ''}` : '—';
}
async function doRoll() {
  const ex = findEx(G.d.live.examId);
  if (!ex) return toast('Pilih ujian terlebih dahulu', 'err');
  try {
    const r = await api('/api/live/roll', { examId: ex.id, kelas: G.kelasF });
    G.selStu = r.winnerId; G.tabF = 'belum';
    toast(`Terpilih: ${r.nama}${r.kelas ? ' (' + r.kelas + ')' : ''} — sisa ${r.sisa} siswa`, 'ok');
    await reload();
  } catch (e) { if (e.message !== 'AUTH') toast(e.message, 'err'); }
}
async function startExam(ulang) {
  if (!G.selStu) return toast('Pilih siswa terlebih dahulu', 'err');
  try {
    await api('/api/live/start', { examId: G.d.live.examId, studentId: G.selStu, ulang });
    toast('Ujian dimulai di layar IFP', 'ok'); await reload();
  } catch (e) {
    if (e.message === 'ULANG') {
      if (await confirmBox('Siswa ini <b>sudah mengerjakan</b> ujian ini. Ulangi ujian? Nilai lama akan diganti oleh nilai yang baru.', { ok: 'Ya, ulangi' })) startExam(true);
    } else if (e.message !== 'AUTH') toast(e.message, 'err');
  }
}
function online() { return G.d && G.d.mode === 'online'; }
function ifpAddr() { return online() ? location.origin : 'http://' + ((G.d.ips || [])[0] || 'IP-LAPTOP') + ':' + G.d.port; }
let MON_N = 0;
async function monitorTick() {
  if (G.page !== 'kendali' || !G.token || !$('#mon')) return;
  if (online()) {   // online: cek tiap 2 detik saat ujian berjalan, tiap 6 detik saat santai
    const busy = G.mon && ['running', 'paused', 'roll'].includes(G.mon.live.status);
    if (document.hidden || Date.now() - MON_N < (busy ? 1900 : 5900)) { if (G.mon) { G.mon.now += 1000; renderMonitor(); } return; }
    MON_N = Date.now();
  }
  try {
    const m = await api('/api/monitor' + (online() && G.mon && G.mon.k ? '?k=' + encodeURIComponent(G.mon.k) : ''));
    if (m.same) { if (G.mon) G.mon.now = m.now; } else G.mon = m;
    renderMonitor();
  } catch (e) { }
}
function renderMonitor() {
  const el = $('#mon'), m = G.mon; if (!el || !m) return;
  const lv = m.live, res = m.res, t = m.now;
  const key = [lv.status, lv.resultId, lv.tahanHasil, res && res.status, m.roll && m.roll.winnerId + m.roll.startAt].join('|');
  if (key !== G.monKey) {
    const prev = G.monKey; G.monKey = key;
    if (lv.status === 'result' && res && res.studentId === G.selStu && !prev.startsWith('result')) {
      const ex = findEx(lv.examId), done = latestMap(lv.examId);
      const nxt = ex && participants(ex).find(s => !done[s.id] && s.id !== res.studentId);
      if (nxt) { G.selStu = nxt.id; }
    }
    if (lv.status === 'roll' && m.roll) {
      el.innerHTML = `<div class="mon-status res"><i></i> Undian siswa sedang tampil di IFP</div>
        <div class="muted" style="margin-top:12px">Siswa terpilih:</div>
        <div class="mon-name">${esc(m.roll.winnerNama)}</div><div class="muted">${esc(m.roll.winnerKelas || '')}</div>
        <div class="btns mt"><button class="b success lg" data-a="rollstart">▶ Mulai ujian siswa ini</button>
        <button class="b" data-a="reroll">🎲 Acak lagi</button><button class="b danger" data-a="rollcancel">✕ Batalkan undian</button></div>
        <p class="muted">Anda juga bisa memilih siswa lain secara manual pada daftar di kiri.</p>`;
    } else if (lv.status === 'board' || !res) {
      el.innerHTML = `<div class="mon-status"><i></i> Layar IFP menampilkan Papan Nilai</div>
        <p class="muted">Tidak ada siswa yang sedang mengerjakan. Pilih siswa lalu tekan <b>Mulai Ujian</b>.</p>`;
    } else if (lv.status === 'result') {
      const sc = res.score || {};
      el.innerHTML = `<div class="mon-status res"><i></i> Menampilkan hasil di IFP</div>
        <div class="mon-name">${esc(res.nama)}</div><div class="muted">${esc(res.kelas || '')}</div>
        <div class="bigscore">${U.num(sc.nilai)}</div>
        <div class="muted mb">PG benar ${sc.pgBenar}/${sc.pgTotal}${sc.essayTotal ? ` • Uraian ${U.num(sc.essayEarned)}/${U.num(sc.essayTotal)}` : ''}</div>
        <div class="btns"><button class="b primary" data-a="board">⟲ Kembali ke Papan Nilai</button>
        <button class="b" data-a="hold">${lv.tahanHasil ? '▶ Lepas tahan (kembali otomatis)' : '⏸ Tahan hasil di layar'}</button>
        <button class="b" data-a="sheet">📄 Lembar jawaban</button></div>
        <p class="muted" id="mBack"></p>`;
    } else {
      el.innerHTML = `<div class="mon-status ${lv.status === 'paused' ? 'pause' : 'run'}"><i></i> <span id="mStat"></span></div>
        <div class="mon-name">${esc(res.nama)}</div><div class="muted">${esc(res.kelas || '')}</div>
        <div class="mon-timer" id="mTimer">--:--</div>
        <div class="bar"><i id="mBar"></i></div>
        <div class="kv"><div><small>Dijawab</small><b id="mAns"></b></div><div><small>Sedang di soal</small><b id="mIdx"></b></div><div><small>Ragu-ragu</small><b id="mRagu"></b></div></div>
        <div class="btns">
          ${lv.status === 'paused' ? '<button class="b primary" data-a="resume">▶ Lanjutkan</button>' : '<button class="b warn" data-a="pause">⏸ Jeda</button>'}
          <button class="b" data-a="add1">+1 menit</button><button class="b" data-a="add5">+5 menit</button>
          <button class="b success" data-a="stop">■ Hentikan &amp; Nilai</button>
          <button class="b danger" data-a="cancel">✕ Batalkan sesi</button></div>
        <div class="btns mt"><button class="b primary block" data-a="aktivitas">👁 Lihat aktivitas siswa (soal, waktu, jawaban) realtime</button></div>`;
    }
    renderPick();
  }
  if (res && ['running', 'paused'].includes(lv.status)) {
    const rem = lv.status === 'paused' ? lv.remaining : lv.endsAt - Math.max(t, lv.startAt || 0);
    const cd = lv.status === 'running' && t < lv.startAt;
    $('#mStat').textContent = lv.status === 'paused' ? 'Ujian dijeda' : cd ? 'Hitung mundur di IFP…' : 'Sedang mengerjakan';
    $('#mTimer').textContent = U.mmss(rem); $('#mTimer').classList.toggle('warn', rem < 60000);
    $('#mBar').style.width = (100 * res.answered / res.total) + '%';
    $('#mAns').textContent = res.answered + ' / ' + res.total; $('#mIdx').textContent = 'No. ' + ((res.index || 0) + 1); $('#mRagu').textContent = res.ragu;
  }
  if (lv.status === 'result' && $('#mBack')) $('#mBack').textContent = lv.tahanHasil ? 'Hasil ditahan di layar sampai Anda menekan Kembali ke Papan Nilai.' : 'IFP kembali ke papan nilai dalam ' + Math.max(0, Math.ceil((lv.resultUntil - t) / 1000)) + ' detik.';
  $('#monSmall').textContent = new Date(t).toLocaleTimeString('id-ID');
}
async function monitorClick(e) {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a, m = G.mon;
  if (a === 'rollstart') { if (m.roll) { G.selStu = m.roll.winnerId; startExam(false); } return; }
  if (a === 'reroll') return doRoll();
  if (a === 'rollcancel') return act('/api/live/roll/cancel', {}, 'Undian dibatalkan');
  if (a === 'aktivitas') return go('aktivitas');
  if (a === 'pause') return act('/api/live/pause', {});
  if (a === 'resume') return act('/api/live/resume', {});
  if (a === 'add1') return act('/api/live/addtime', { menit: 1 }, 'Waktu ditambah 1 menit');
  if (a === 'add5') return act('/api/live/addtime', { menit: 5 }, 'Waktu ditambah 5 menit');
  if (a === 'stop') { if (await confirmBox('Hentikan ujian sekarang? Jawaban yang sudah diisi akan langsung dinilai.')) act('/api/live/stop', {}); return; }
  if (a === 'cancel') { if (await confirmBox('Batalkan sesi ini? Jawaban siswa <b>tidak disimpan</b> dan siswa dianggap belum ujian.', { danger: true, ok: 'Batalkan sesi' })) act('/api/live/cancel', {}, 'Sesi dibatalkan'); return; }
  if (a === 'board') return act('/api/live/board', {});
  if (a === 'hold') return act('/api/live/hold', { tahan: !m.live.tahanHasil });
  if (a === 'sheet') { await reload(false); const r = G.d.results.find(x => x.id === m.live.resultId); if (r) answerSheet(r); }
}

/* =====================================================================
   DATA SISWA
   ===================================================================== */
function pgSiswa(c) {
  const kel = allKelas(), q = G.sf.q.toLowerCase();
  const list = G.d.students.filter(s => (!G.sf.kelas || s.kelas === G.sf.kelas) && (!q || s.nama.toLowerCase().includes(q) || (s.nis || '').includes(q)))
    .sort((a, b) => (a.kelas || '').localeCompare(b.kelas || '') || a.nama.localeCompare(b.nama));
  c.innerHTML = `<div class="toolbar">
      <button class="b primary" id="sAdd">+ Tambah Siswa</button>
      <button class="b" id="sImp">⬆ Impor Excel</button><button class="b" id="sTpl">⬇ Unduh Template</button><button class="b" id="sExp">Ekspor Excel</button>
      <span class="sp"></span>
      <input type="search" id="sQ" placeholder="Cari nama / NIS" value="${esc(G.sf.q)}" style="width:220px">
      <select id="sK" style="width:160px"><option value="">Semua kelas</option>${kel.map(k => `<option ${k === G.sf.kelas ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select>
    </div>
    <div class="card"><div class="card-h"><h3>${list.length} siswa ${G.sf.kelas ? 'di kelas ' + esc(G.sf.kelas) : ''}</h3>
      <div class="btns"><span class="muted" id="sCnt"></span><button class="b danger sm" id="sDel" disabled>Hapus terpilih</button><button class="b sm" id="sMoveK" disabled>Ubah kelas terpilih</button></div></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th style="width:34px"><input type="checkbox" id="sAll"></th><th style="width:44px">No</th><th>NIS</th><th>Nama Siswa</th><th class="c">L/P</th><th>Kelas</th><th class="r">Aksi</th></tr></thead>
      <tbody>${list.map((s, i) => `<tr><td><input type="checkbox" class="sCh" value="${s.id}" ${G.sChecked.has(s.id) ? 'checked' : ''}></td><td>${i + 1}</td><td>${esc(s.nis)}</td><td><b>${esc(s.nama)}</b></td>
        <td class="c">${esc(s.jk)}</td><td>${esc(s.kelas)}</td><td class="act"><button class="b xs" data-e="${s.id}">Edit</button> <button class="b xs danger" data-d="${s.id}">Hapus</button></td></tr>`).join('')
      || '<tr><td colspan="7" class="muted c" style="padding:30px">Belum ada siswa. Klik <b>Impor Excel</b> atau <b>Tambah Siswa</b>.</td></tr>'}</tbody></table></div></div>`;
  $('#sAdd').onclick = () => editStudent();
  $('#sImp').onclick = importStudents;
  $('#sTpl').onclick = () => writeXlsx('Template_Data_Siswa.xlsx', [{
    name: 'SISWA', cols: [12, 32, 12, 6],
    aoa: [['NIS', 'NAMA', 'KELAS', 'JK'], ['1001', 'Andi Pratama', 'VIII A', 'L'], ['1002', 'Bunga Lestari', 'VIII A', 'P'], ['1003', 'Citra Dewi', 'VIII B', 'P']]
  }, { name: 'PETUNJUK', cols: [90], aoa: [['PETUNJUK PENGISIAN DATA SISWA'], ['1. Isi mulai baris ke-2. Baris pertama (judul kolom) jangan diubah.'], ['2. NAMA wajib diisi. NIS, KELAS, dan JK (L/P) dianjurkan.'], ['3. Siswa dengan NIS yang sama akan diperbarui, bukan ditambah dobel.'], ['4. Contoh pada sheet SISWA boleh dihapus.']] }]);
  $('#sExp').onclick = () => writeXlsx('Data_Siswa.xlsx', [{ name: 'SISWA', cols: [12, 32, 12, 6], aoa: [['NIS', 'NAMA', 'KELAS', 'JK'], ...list.map(s => [s.nis, s.nama, s.kelas, s.jk])] }]);
  $('#sQ').oninput = e => { G.sf.q = e.target.value; const p = e.target.selectionStart; pgSiswa(c); const n = $('#sQ'); n.focus(); n.setSelectionRange(p, p); };
  $('#sK').onchange = e => { G.sf.kelas = e.target.value; pgSiswa(c); };
  const upd = () => { const n = G.sChecked.size; $('#sDel').disabled = $('#sMoveK').disabled = !n; $('#sCnt').textContent = n ? n + ' dipilih' : ''; };
  $$('.sCh').forEach(ch => ch.onchange = () => { ch.checked ? G.sChecked.add(ch.value) : G.sChecked.delete(ch.value); upd(); });
  $('#sAll').onchange = e => { $$('.sCh').forEach(ch => { ch.checked = e.target.checked; e.target.checked ? G.sChecked.add(ch.value) : G.sChecked.delete(ch.value); }); upd(); };
  upd();
  $$('[data-e]').forEach(b => b.onclick = () => editStudent(findStu(b.dataset.e)));
  $$('[data-d]').forEach(b => b.onclick = async () => { const s = findStu(b.dataset.d); if (await confirmBox(`Hapus siswa <b>${esc(s.nama)}</b>?`, { danger: true, ok: 'Hapus' })) act('/api/students/delete', { ids: [s.id] }, 'Siswa dihapus'); });
  $('#sDel').onclick = async () => { if (await confirmBox(`Hapus <b>${G.sChecked.size} siswa</b> terpilih?`, { danger: true, ok: 'Hapus' })) { await act('/api/students/delete', { ids: [...G.sChecked] }, 'Siswa dihapus'); G.sChecked.clear(); render(); } };
  $('#sMoveK').onclick = () => {
    const m = modal({ title: 'Ubah kelas', body: `<div class="field"><label>Kelas baru untuk ${G.sChecked.size} siswa</label><input type="text" id="mvK" list="klist"><datalist id="klist">${kel.map(k => `<option value="${esc(k)}">`).join('')}</datalist></div>`, foot: '<button class="b primary" id="mvGo">Simpan</button>' });
    $('#mvGo', m).onclick = async () => {
      const k = $('#mvK', m).value.trim(); if (!k) return;
      for (const id of G.sChecked) { const s = { ...findStu(id), kelas: k }; await api('/api/students/save', { student: s }); }
      m.close(); G.sChecked.clear(); toast('Kelas diperbarui', 'ok'); reload();
    };
  };
}
function editStudent(s) {
  s = s || { nis: '', nama: '', kelas: G.sf.kelas || '', jk: '' };
  const m = modal({
    title: s.id ? 'Edit Siswa' : 'Tambah Siswa', body: `<div class="frow"><div class="field"><label>NIS</label><input type="text" id="fNis" value="${esc(s.nis)}"></div>
      <div class="field"><label>Jenis kelamin</label><select id="fJk"><option value="">-</option><option ${s.jk === 'L' ? 'selected' : ''} value="L">Laki-laki (L)</option><option ${s.jk === 'P' ? 'selected' : ''} value="P">Perempuan (P)</option></select></div></div>
      <div class="field"><label>Nama lengkap *</label><input type="text" id="fNama" value="${esc(s.nama)}"></div>
      <div class="field"><label>Kelas</label><input type="text" id="fKelas" value="${esc(s.kelas)}" list="klist2" placeholder="contoh: VIII A"><datalist id="klist2">${allKelas().map(k => `<option value="${esc(k)}">`).join('')}</datalist></div>`,
    foot: `${s.id ? '' : '<button class="b" id="fMore">Simpan &amp; tambah lagi</button>'}<button class="b primary" id="fSave">Simpan</button>`
  });
  setTimeout(() => $('#fNama', m).focus(), 30);
  const save = async more => {
    const st = { ...s, nis: $('#fNis', m).value, nama: $('#fNama', m).value, kelas: $('#fKelas', m).value, jk: $('#fJk', m).value };
    const r = await act('/api/students/save', { student: st }, 'Data siswa disimpan');
    if (!r) return;
    m.close(); if (more) editStudent({ nis: '', nama: '', kelas: st.kelas, jk: '' });
  };
  $('#fSave', m).onclick = () => save(false);
  if (!s.id) $('#fMore', m).onclick = () => save(true);
}
async function importStudents() {
  const f = await pickFile('.xlsx,.xls,.csv'); if (!f) return;
  let rows;
  try { rows = (await readSheet(f, 'SISWA')).map(r => ({ nis: pick(r, ['nis', 'nisn', 'no_induk', 'nomor_induk']), nama: pick(r, ['nama', 'nama_siswa', 'nama_lengkap', 'name']), kelas: pick(r, ['kelas', 'rombel', 'kelas_rombel']), jk: pick(r, ['jk', 'l_p', 'lp', 'jenis_kelamin', 'gender']) })).filter(r => r.nama); }
  catch (e) { return toast('Gagal membaca file: ' + e.message, 'err'); }
  if (!rows.length) return toast('Tidak ada data. Pastikan ada kolom NAMA.', 'err');
  const m = modal({
    title: 'Impor Data Siswa', size: 'wide', body: `<p>Ditemukan <b>${rows.length} siswa</b> pada file <b>${esc(f.name)}</b>.</p>
      <div class="tbl-wrap" style="max-height:300px"><table class="t"><thead><tr><th>No</th><th>NIS</th><th>Nama</th><th>Kelas</th><th>JK</th></tr></thead><tbody>
      ${rows.slice(0, 200).map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.nis)}</td><td>${esc(r.nama)}</td><td>${esc(r.kelas)}</td><td>${esc(r.jk)}</td></tr>`).join('')}</tbody></table></div>
      <div class="mt"><label class="check"><input type="radio" name="im" value="append" checked> Tambahkan ke data yang ada (NIS sama akan diperbarui)</label>
      <label class="check"><input type="radio" name="im" value="replace"> Hapus semua siswa lama, ganti dengan data ini</label></div>`,
    foot: '<button class="b primary" id="imGo">Impor sekarang</button>'
  });
  $('#imGo', m).onclick = async () => {
    const r = await act('/api/students/import', { rows, mode: $('input[name=im]:checked', m).value });
    if (r) { m.close(); toast(`Impor selesai: ${r.added} ditambah, ${r.updated} diperbarui`, 'ok'); }
  };
}

/* =====================================================================
   BANK SOAL
   ===================================================================== */
function pgBank(c) {
  const d = G.d;
  if (!G.bankSel || !findBank(G.bankSel)) G.bankSel = d.banks[0] ? d.banks[0].id : null;
  const bank = findBank(G.bankSel);
  const qf = G.qf, qq = qf.q.toLowerCase();
  const qs = bank ? d.questions.filter(q => q.bankId === bank.id && (!qf.tipe || q.tipe === qf.tipe) && (!qf.level || q.level === qf.level) && (!qq || q.soal.toLowerCase().includes(qq))) : [];
  c.innerHTML = `<div class="banklayout">
    <div class="card banklist"><div class="card-h"><h3>Daftar Bank Soal</h3><button class="b primary sm" id="bAdd">+ Bank</button></div>
      ${d.banks.map(b => { const n = bankCount(b.id); return `<div class="bk ${b.id === G.bankSel ? 'sel' : ''}" data-b="${b.id}"><b>${esc(b.nama)}</b><small>${n.pg} PG • ${n.es} uraian</small></div>`; }).join('') || '<div class="card-b muted">Belum ada bank soal.</div>'}
      <div class="card-b"><button class="b block" id="bImpAll">⬆ Impor Excel (multi-bank)</button><button class="b block mt" id="bTpl">⬇ Unduh Template Soal</button></div></div>
    <div>${bank ? `
      <div class="card mb"><div class="card-h"><div><h3>${esc(bank.nama)}</h3><small>${esc(bank.keterangan || '')}</small></div>
        <div class="btns"><button class="b sm" id="bEdit">Ubah nama</button><button class="b sm" id="bCopy">Duplikat</button><button class="b sm" id="bExp">Ekspor Excel</button><button class="b sm danger" id="bDel">Hapus bank</button></div></div></div>
      <div class="toolbar"><button class="b primary" id="qAdd">+ Tambah Soal</button><button class="b" id="qImp">⬆ Impor ke bank ini</button>
        <span class="sp"></span><input type="search" id="qQ" placeholder="Cari teks soal…" value="${esc(qf.q)}" style="width:200px">
        <select id="qT" style="width:130px"><option value="">Semua tipe</option><option value="PG" ${qf.tipe === 'PG' ? 'selected' : ''}>Pilihan ganda</option><option value="ESSAY" ${qf.tipe === 'ESSAY' ? 'selected' : ''}>Uraian</option></select>
        <select id="qL" style="width:130px"><option value="">Semua tingkat</option>${['Mudah', 'Sedang', 'Sukar'].map(l => `<option ${qf.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="card"><div class="card-h"><h3>${qs.length} soal</h3><div class="btns"><span class="muted" id="qCnt"></span><button class="b sm" id="qMove" disabled>Pindah ke bank…</button><button class="b sm danger" id="qDel" disabled>Hapus terpilih</button></div></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th style="width:34px"><input type="checkbox" id="qAll"></th><th style="width:40px">No</th><th>Soal</th><th>Tipe</th><th>Tingkat</th><th class="c">Bobot</th><th>Kunci</th><th class="r">Aksi</th></tr></thead><tbody>
      ${qs.map((q, i) => `<tr><td><input type="checkbox" class="qCh" value="${q.id}" ${G.qChecked.has(q.id) ? 'checked' : ''}></td><td>${i + 1}</td>
        <td class="qprev">${U.fmt(U.shortText(q.soal, 160))}${q.gambar ? `<img src="${esc(q.gambar)}">` : ''}</td>
        <td>${q.tipe === 'PG' ? '<span class="badge blue">PG</span>' : '<span class="badge purple">Uraian</span>'}</td>
        <td>${esc(q.level || '-')}</td><td class="c">${q.bobot}</td>
        <td>${q.tipe === 'PG' ? `<b>${esc(q.kunci)}</b>` : `<span class="muted">${esc(U.shortText(q.kunci, 40))}</span>`}</td>
        <td class="act"><button class="b xs" data-e="${q.id}">Edit</button> <button class="b xs" data-c="${q.id}">Salin</button> <button class="b xs danger" data-d="${q.id}">Hapus</button></td></tr>`).join('')
        || '<tr><td colspan="8" class="c muted" style="padding:30px">Belum ada soal pada bank ini.</td></tr>'}</tbody></table></div></div>`
      : `<div class="card card-b"><h3>Buat bank soal pertama</h3><p class="muted">Bank soal adalah kumpulan soal (misalnya per materi). Anda bisa membuat banyak bank, lalu memilih satu atau beberapa bank saat mengatur ujian.</p></div>`}
    </div></div>`;
  $('#bAdd').onclick = () => editBank();
  $('#bTpl').onclick = downloadQTemplate;
  $('#bImpAll').onclick = () => importQuestions(null);
  $$('[data-b]').forEach(el => el.onclick = () => { G.bankSel = el.dataset.b; G.qChecked.clear(); pgBank(c); });
  if (!bank) return;
  $('#bEdit').onclick = () => editBank(bank);
  $('#bCopy').onclick = () => act('/api/banks/copy', { id: bank.id }, 'Bank soal diduplikat');
  $('#bExp').onclick = () => exportBank(bank);
  $('#bDel').onclick = async () => { if (await confirmBox(`Hapus bank <b>${esc(bank.nama)}</b> beserta <b>${bankCount(bank.id).all} soal</b> di dalamnya? Hasil ujian yang sudah ada tetap tersimpan.`, { danger: true, ok: 'Hapus bank' })) act('/api/banks/delete', { id: bank.id }, 'Bank soal dihapus'); };
  $('#qAdd').onclick = () => editQuestion({ bankId: bank.id });
  $('#qImp').onclick = () => importQuestions(bank.id);
  $('#qQ').oninput = e => { qf.q = e.target.value; const p = e.target.selectionStart; pgBank(c); const n = $('#qQ'); n.focus(); n.setSelectionRange(p, p); };
  $('#qT').onchange = e => { qf.tipe = e.target.value; pgBank(c); };
  $('#qL').onchange = e => { qf.level = e.target.value; pgBank(c); };
  const upd = () => { const n = G.qChecked.size; $('#qDel').disabled = $('#qMove').disabled = !n; $('#qCnt').textContent = n ? n + ' dipilih' : ''; };
  $$('.qCh').forEach(ch => ch.onchange = () => { ch.checked ? G.qChecked.add(ch.value) : G.qChecked.delete(ch.value); upd(); });
  $('#qAll').onchange = e => { $$('.qCh').forEach(ch => { ch.checked = e.target.checked; e.target.checked ? G.qChecked.add(ch.value) : G.qChecked.delete(ch.value); }); upd(); };
  upd();
  const Q = id => d.questions.find(q => q.id === id);
  $$('[data-e]').forEach(b => b.onclick = () => editQuestion(Q(b.dataset.e)));
  $$('[data-c]').forEach(b => b.onclick = () => { const q = JSON.parse(JSON.stringify(Q(b.dataset.c))); delete q.id; editQuestion(q); });
  $$('[data-d]').forEach(b => b.onclick = async () => { if (await confirmBox('Hapus soal ini?', { danger: true, ok: 'Hapus' })) act('/api/questions/delete', { ids: [b.dataset.d] }, 'Soal dihapus'); });
  $('#qDel').onclick = async () => { if (await confirmBox(`Hapus <b>${G.qChecked.size} soal</b> terpilih?`, { danger: true, ok: 'Hapus' })) { await act('/api/questions/delete', { ids: [...G.qChecked] }, 'Soal dihapus'); G.qChecked.clear(); render(); } };
  $('#qMove').onclick = () => {
    const m = modal({ title: 'Pindahkan soal', body: `<div class="field"><label>Pindahkan ${G.qChecked.size} soal ke bank:</label><select id="mvB">${d.banks.filter(b => b.id !== bank.id).map(b => `<option value="${b.id}">${esc(b.nama)}</option>`).join('')}</select></div>`, foot: '<button class="b primary" id="mvGo">Pindahkan</button>' });
    $('#mvGo', m).onclick = async () => { const v = $('#mvB', m).value; if (!v) return; await act('/api/questions/move', { ids: [...G.qChecked], bankId: v }, 'Soal dipindahkan'); G.qChecked.clear(); m.close(); render(); };
  };
}
function editBank(b) {
  b = b || { nama: '', keterangan: '' };
  const m = modal({ title: b.id ? 'Ubah Bank Soal' : 'Bank Soal Baru', body: `<div class="field"><label>Nama bank soal *</label><input type="text" id="bN" value="${esc(b.nama)}" placeholder="contoh: Teorema Pythagoras"></div>
    <div class="field"><label>Keterangan</label><input type="text" id="bK" value="${esc(b.keterangan || '')}" placeholder="contoh: Kelas 8 Semester 1"></div>`, foot: '<button class="b primary" id="bS">Simpan</button>' });
  setTimeout(() => $('#bN', m).focus(), 30);
  $('#bS', m).onclick = async () => { const r = await act('/api/banks/save', { bank: { ...b, nama: $('#bN', m).value, keterangan: $('#bK', m).value } }, 'Bank soal disimpan'); if (r) { G.bankSel = r.bank.id; m.close(); render(); } };
}
const Q_HEAD = ['BANK_SOAL', 'TIPE', 'SOAL', 'OPSI_A', 'OPSI_B', 'OPSI_C', 'OPSI_D', 'OPSI_E', 'KUNCI', 'KATA_KUNCI', 'BOBOT', 'TINGKAT', 'PEMBAHASAN'];
const Q_COLS = [22, 8, 60, 20, 20, 20, 20, 14, 8, 26, 7, 9, 40];
function downloadQTemplate() {
  writeXlsx('Template_Bank_Soal.xlsx', [{
    name: 'SOAL', cols: Q_COLS, aoa: [Q_HEAD,
      ['Teorema Pythagoras', 'PG', 'Segitiga siku-siku dengan sisi tegak 6 cm dan 8 cm. Panjang sisi miringnya adalah ...', '10 cm', '12 cm', '14 cm', '48 cm', '', 'A', '', 1, 'Mudah', 'c^2 = 6^2 + 8^2 = 100, c = 10 cm'],
      ['Teorema Pythagoras', 'PG', 'Manakah yang merupakan tripel Pythagoras?', '3, 4, 6', '5, 12, 13', '6, 7, 8', '7, 8, 10', '', 'B', '', 1, 'Sedang', ''],
      ['Teorema Pythagoras', 'ESSAY', 'Hitung panjang sisi miring segitiga siku-siku dengan sisi tegak 9 cm dan 12 cm!', '', '', '', '', '', '15 cm', '', 2, 'Sedang', 'c^2 = 81 + 144 = 225, c = 15'],
      ['SPLDV', 'ESSAY', 'Gradien garis yang melalui titik (0, 0) dan (4, 2) adalah ...', '', '', '', '', '', '1/2', '', 2, 'Sedang', 'm = 2/4 = 1/2 (jawaban 0,5 juga benar)'],
      ['SPLDV', 'PG', 'Penyelesaian dari x + y = 10 dan x - y = 2 adalah ...', 'x = 6, y = 4', 'x = 4, y = 6', 'x = 5, y = 5', 'x = 8, y = 2', '', 'A', '', 1, 'Mudah', ''],
    ]
  }, {
    name: 'PETUNJUK', cols: [22, 95], aoa: [['KOLOM', 'PETUNJUK PENGISIAN'],
    ['BANK_SOAL', 'Nama bank soal (materi). Jika belum ada, bank otomatis dibuat. Boleh dikosongkan bila mengimpor ke bank yang sedang dibuka.'],
    ['TIPE', 'PG = pilihan ganda, ESSAY = isian angka. Siswa menjawab ESSAY dengan papan angka (0-9, koma, minus, pecahan /), jadi KUNCI essay harus berupa angka.'],
    ['SOAL', 'Teks soal. Pangkat ditulis x^2 atau x^{10}, akar ditulis sqrt(25), huruf tebal **teks**.'],
    ['OPSI_A s.d. OPSI_E', 'Pilihan jawaban (khusus PG). Minimal 2 opsi. OPSI_E boleh kosong.'],
    ['KUNCI', 'PG: huruf A/B/C/D/E. ESSAY: angka jawaban, contoh 15 atau -2 atau 2,5 atau 1/2. Pecahan dan desimal yang nilainya sama dianggap benar (1/2 = 0,5). Alternatif dipisah tanda | .'],
    ['KATA_KUNCI', '(Opsional, ESSAY) Kata kunci yang harus ada, dipisah titik koma ; . Alternatif dipisah | . Nilai = bobot × (kata kunci yang ditemukan / jumlah kata kunci).'],
    ['', 'Jika KATA_KUNCI kosong, jawaban essay dinilai benar bila sama dengan KUNCI (spasi/huruf besar diabaikan) atau angka-angkanya sama.'],
    ['BOBOT', 'Skor soal. Kosong = 1 untuk PG dan 2 untuk ESSAY.'],
    ['TINGKAT', 'Mudah / Sedang / Sukar.'],
    ['PEMBAHASAN', '(Opsional) Ditampilkan setelah siswa selesai jika fitur pembahasan diaktifkan.'],
    ['GAMBAR', 'Gambar soal ditambahkan lewat aplikasi (menu Bank Soal → Edit soal → Unggah gambar).'],
    ['', 'Nilai essay otomatis tetap bisa dikoreksi manual oleh guru di menu Laporan → Koreksi Uraian.']]
  }]);
}
function exportBank(bank) {
  const qs = G.d.questions.filter(q => q.bankId === bank.id);
  writeXlsx('Bank_Soal_' + safeName(bank.nama) + '.xlsx', [{ name: 'SOAL', cols: Q_COLS, aoa: [Q_HEAD, ...qs.map(q => [bank.nama, q.tipe, q.soal, ...'ABCDE'.split('').map(k => (q.opsi || {})[k] || ''), q.kunci, q.kataKunci || '', q.bobot, q.level || '', q.pembahasan || ''])] }]);
}
async function importQuestions(bankId) {
  const f = await pickFile('.xlsx,.xls,.csv'); if (!f) return;
  let rows;
  try {
    rows = (await readSheet(f, 'SOAL')).map(r => ({
      bank: pick(r, ['bank_soal', 'bank', 'materi']), tipe: pick(r, ['tipe', 'jenis', 'jenis_soal']) || 'PG', soal: pick(r, ['soal', 'pertanyaan', 'butir_soal']),
      opsi_a: pick(r, ['opsi_a', 'a', 'pilihan_a']), opsi_b: pick(r, ['opsi_b', 'b', 'pilihan_b']), opsi_c: pick(r, ['opsi_c', 'c', 'pilihan_c']),
      opsi_d: pick(r, ['opsi_d', 'd', 'pilihan_d']), opsi_e: pick(r, ['opsi_e', 'e', 'pilihan_e']), kunci: pick(r, ['kunci', 'kunci_jawaban', 'jawaban']),
      kata_kunci: pick(r, ['kata_kunci', 'keyword']), bobot: pick(r, ['bobot', 'skor', 'poin']), tingkat: pick(r, ['tingkat', 'level', 'tingkat_kesukaran']),
      pembahasan: pick(r, ['pembahasan', 'penjelasan']), gambar: pick(r, ['gambar']),
    })).filter(r => r.soal);
  } catch (e) { return toast('Gagal membaca file: ' + e.message, 'err'); }
  if (!rows.length) return toast('Tidak ada soal. Pastikan memakai template (kolom SOAL).', 'err');
  if (!bankId) { const noBank = rows.filter(r => !r.bank).length; if (noBank) return toast(`${noBank} baris tidak memiliki BANK_SOAL. Isi kolom itu, atau buka bank lalu pakai "Impor ke bank ini".`, 'err'); }
  const grp = {};
  rows.forEach(r => { const b = r.bank || findBank(bankId).nama; grp[b] = grp[b] || { pg: 0, es: 0 }; r.tipe.toUpperCase().startsWith('P') ? grp[b].pg++ : grp[b].es++; });
  const m = modal({
    title: 'Impor Bank Soal', size: 'wide', body: `<p>Ditemukan <b>${rows.length} soal</b> pada <b>${esc(f.name)}</b>:</p>
    <table class="t mb"><thead><tr><th>Bank soal</th><th class="c">PG</th><th class="c">Uraian</th><th>Status</th></tr></thead><tbody>${Object.entries(grp).map(([b, n]) => `<tr><td>${esc(b)}</td><td class="c">${n.pg}</td><td class="c">${n.es}</td><td>${G.d.banks.some(x => x.nama.toLowerCase() === b.toLowerCase()) ? '<span class="badge">sudah ada → soal ditambahkan</span>' : '<span class="badge green">bank baru</span>'}</td></tr>`).join('')}</tbody></table>
    <div class="tbl-wrap" style="max-height:260px"><table class="t"><thead><tr><th>No</th><th>Tipe</th><th>Soal</th><th>Kunci</th></tr></thead><tbody>${rows.slice(0, 100).map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.tipe)}</td><td>${esc(U.shortText(r.soal, 90))}</td><td>${esc(r.kunci)}</td></tr>`).join('')}</tbody></table></div>
    ${bankId ? `<div class="mt"><label class="check"><input type="radio" name="iq" value="append" checked> Tambahkan ke soal yang ada</label><label class="check"><input type="radio" name="iq" value="replace"> Hapus soal lama di bank <b>${esc(findBank(bankId).nama)}</b> dulu</label></div>` : ''}`,
    foot: '<button class="b primary" id="iqGo">Impor sekarang</button>'
  });
  $('#iqGo', m).onclick = async () => {
    const mode = bankId ? $('input[name=iq]:checked', m).value : 'append';
    const r = await act('/api/questions/import', { rows, bankId, mode });
    if (!r) return;
    m.close();
    if (r.errors.length) modal({ title: `Impor: ${r.added} soal masuk, ${r.errors.length} dilewati`, body: `<ul>${r.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`, foot: '' });
    else toast(`${r.added} soal berhasil diimpor`, 'ok');
  };
}
async function resizeImage(file, max = 1400) {
  const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
  const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = url; });
  const sc = Math.min(1, max / Math.max(img.width, img.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height);
  return file.type === 'image/png' ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.9);
}
function editQuestion(q) {
  q = Object.assign({ tipe: 'PG', soal: '', gambar: '', opsi: { A: '', B: '', C: '', D: '', E: '' }, kunci: 'A', kataKunci: '', bobot: '', level: 'Sedang', pembahasan: '' }, q);
  q.opsi = Object.assign({ A: '', B: '', C: '', D: '', E: '' }, q.opsi || {});
  const m = modal({
    title: q.id ? 'Edit Soal' : 'Tambah Soal', size: 'xwide', body: `<div class="grid2">
    <div>
      <div class="frow"><div class="field"><label>Bank soal</label><select id="eB">${G.d.banks.map(b => `<option value="${b.id}" ${b.id === q.bankId ? 'selected' : ''}>${esc(b.nama)}</option>`).join('')}</select></div>
        <div class="field"><label>Tipe soal</label><div class="seg" id="eT"><button type="button" data-t="PG">Pilihan Ganda</button><button type="button" data-t="ESSAY">Uraian / Isian</button></div></div></div>
      <div class="field"><label>Teks soal *</label><textarea id="eS" rows="5">${esc(q.soal)}</textarea><small>Pangkat: <code>x^2</code> atau <code>x^{10}</code> • indeks: <code>a_{1}</code> • akar: <code>sqrt(25)</code> • tebal: <code>**teks**</code></small></div>
      <div class="field"><label>Gambar (opsional)</label><div class="imgdrop" id="eImg"></div><small>Bisa juga menempel gambar (Ctrl+V) saat jendela ini terbuka.</small></div>
      <div id="ePG" class="opts-edit"><label style="font-weight:600;font-size:13px">Pilihan jawaban — klik bulatan untuk menandai kunci</label>
        ${'ABCDE'.split('').map(k => `<div class="opt-row"><label><input type="radio" name="eK" value="${k}" ${q.kunci === k ? 'checked' : ''}>${k}</label><input type="text" id="eO${k}" value="${esc(q.opsi[k])}" placeholder="Opsi ${k}${k === 'E' ? ' (boleh kosong)' : ''}"></div>`).join('')}</div>
      <div id="eES"><div class="field"><label>Kunci jawaban</label><input type="text" id="eKu" value="${esc(q.tipe === 'PG' ? '' : q.kunci)}" placeholder="contoh: 15 cm|15"><small>Siswa menjawab dengan papan angka, jadi isi kunci berupa angka: <code>15</code>, <code>-2</code>, <code>2,5</code>, <code>1/2</code>. Nilai sama dianggap benar (1/2 = 0,5). Alternatif dipisah <code>|</code>.</small></div>
        <div class="field"><label>Kata kunci (opsional)</label><input type="text" id="eKK" value="${esc(q.kataKunci)}" placeholder="contoh: substitusi; eliminasi|eleminasi"><small>Pisahkan dengan <code>;</code>. Nilai = bobot × (kata kunci ditemukan ÷ jumlah kata kunci).</small></div></div>
      <div class="frow"><div class="field"><label>Bobot / skor</label><input type="number" id="eW" min="0.5" step="0.5" value="${esc(q.bobot)}" placeholder="PG 1, Uraian 2"></div>
        <div class="field"><label>Tingkat kesukaran</label><select id="eL">${['Mudah', 'Sedang', 'Sukar'].map(l => `<option ${q.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="field"><label>Pembahasan (opsional)</label><textarea id="eP" rows="2">${esc(q.pembahasan)}</textarea></div>
    </div>
    <div><label style="font-weight:600;font-size:13px">Pratinjau</label><div class="preview-box" id="ePrev"></div>
      <div class="note mt">Tips matematika: gunakan simbol langsung seperti × ÷ − ≤ ≥ ≠ π ° √ ² ³ atau penulisan <code>^</code> untuk pangkat.</div>
      <div class="btns mt">${['×', '÷', '−', '±', '≤', '≥', '≠', '≈', 'π', '°', '√', '²', '³', '∠', '△', '∥', '⊥'].map(s => `<button class="b xs" type="button" data-sym="${s}">${s}</button>`).join('')}</div></div>
  </div>`, foot: `${q.id ? '' : '<button class="b" id="eMore">Simpan &amp; tambah lagi</button>'}<button class="b primary" id="eSave">Simpan soal</button>`
  });
  let tipe = q.tipe === 'PG' ? 'PG' : 'ESSAY', gambar = q.gambar || '', lastFocus = $('#eS', m);
  const setT = t => { tipe = t; $$('#eT button', m).forEach(b => b.classList.toggle('act', b.dataset.t === t)); $('#ePG', m).classList.toggle('hidden', t !== 'PG'); $('#eES', m).classList.toggle('hidden', t === 'PG'); prev(); };
  const imgBox = () => {
    $('#eImg', m).innerHTML = gambar ? `<img src="${esc(gambar)}"><button class="b sm danger" type="button" id="eImgDel">Hapus gambar</button> <button class="b sm" type="button" id="eImgUp">Ganti</button>` : '<button class="b sm" type="button" id="eImgUp">Unggah gambar</button>';
    $('#eImgUp', m).onclick = async () => { const f = await pickFile('image/*'); if (f) upImg(f); };
    if ($('#eImgDel', m)) $('#eImgDel', m).onclick = () => { gambar = ''; imgBox(); prev(); };
  };
  const upImg = async f => { try { const r = await api('/api/upload', { dataUrl: await resizeImage(f) }); gambar = r.url; imgBox(); prev(); } catch (e) { toast(e.message, 'err'); } };
  m.addEventListener('paste', e => { const it = [...(e.clipboardData || {}).items || []].find(i => i.type.startsWith('image/')); if (it) { e.preventDefault(); upImg(it.getAsFile()); } });
  const prev = () => {
    const k = ($('input[name=eK]:checked', m) || {}).value;
    $('#ePrev', m).innerHTML = `<div style="font-size:15px">${U.fmt($('#eS', m).value) || '<span class="muted">Teks soal…</span>'}</div>${gambar ? `<img src="${esc(gambar)}" style="max-width:100%;max-height:220px;margin-top:8px">` : ''}
      ${tipe === 'PG' ? `<ol type="A" style="margin:10px 0 0;padding-left:22px">${'ABCDE'.split('').filter(x => $('#eO' + x, m).value.trim()).map(x => `<li style="${x === k ? 'color:#15803d;font-weight:700' : ''}" value="${x.charCodeAt(0) - 64}">${U.fmt($('#eO' + x, m).value)}${x === k ? ' ✔' : ''}</li>`).join('')}</ol>`
        : `<div class="mt muted">Kunci: <b>${esc($('#eKu', m).value || '-')}</b></div>`}
      ${$('#eP', m).value ? `<div class="mt" style="font-size:13px"><b>Pembahasan:</b> ${U.fmt($('#eP', m).value)}</div>` : ''}`;
  };
  $$('#eT button', m).forEach(b => b.onclick = () => setT(b.dataset.t));
  $$('input,textarea,select', m).forEach(i => { i.addEventListener('input', prev); i.addEventListener('change', prev); i.addEventListener('focus', () => { if (i.type === 'text' || i.tagName === 'TEXTAREA') lastFocus = i; }); });
  $$('[data-sym]', m).forEach(b => b.onclick = () => { const i = lastFocus, s = i.selectionStart ?? i.value.length; i.value = i.value.slice(0, s) + b.dataset.sym + i.value.slice(i.selectionEnd ?? s); i.focus(); i.setSelectionRange(s + 1, s + 1); prev(); });
  imgBox(); setT(tipe);
  const save = async more => {
    const o = {}; 'ABCDE'.split('').forEach(k => o[k] = $('#eO' + k, m).value.trim());
    const nq = {
      id: q.id, bankId: $('#eB', m).value, tipe, soal: $('#eS', m).value.trim(), gambar,
      opsi: tipe === 'PG' ? o : {}, kunci: tipe === 'PG' ? (($('input[name=eK]:checked', m) || {}).value || '') : $('#eKu', m).value.trim(),
      kataKunci: tipe === 'PG' ? '' : $('#eKK', m).value.trim(), bobot: +$('#eW', m).value || (tipe === 'PG' ? 1 : 2),
      level: $('#eL', m).value, pembahasan: $('#eP', m).value.trim(),
    };
    if (tipe === 'PG' && Object.values(o).filter(Boolean).length < 2) return toast('Isi minimal 2 pilihan jawaban', 'err');
    if (tipe !== 'PG' && !nq.kunci && !nq.kataKunci) return toast('Isi kunci jawaban atau kata kunci', 'err');
    const r = await act('/api/questions/save', { question: nq }, 'Soal disimpan');
    if (!r) return;
    m.close(); G.bankSel = nq.bankId;
    if (more) editQuestion({ bankId: nq.bankId, tipe, level: nq.level, bobot: q.bobot });
  };
  $('#eSave', m).onclick = () => save(false);
  if (!q.id) $('#eMore', m).onclick = () => save(true);
}

/* =====================================================================
   PENGATURAN UJIAN
   ===================================================================== */
function pgUjian(c) {
  const d = G.d;
  c.innerHTML = `<div class="toolbar"><button class="b primary" id="xAdd">+ Buat Ujian Baru</button><span class="sp"></span>
    <span class="muted">Ujian aktif di IFP ditandai garis biru.</span></div>
    <div class="examcards">${d.exams.map(e => {
      const banks = (e.bankIds || []).map(findBank).filter(Boolean), done = Object.keys(latestMap(e.id)).length, parts = participants(e).length;
      const mode = !+e.jmlEssay ? 'PG semua' : !+e.jmlPG ? 'Uraian semua' : 'Campuran';
      return `<div class="card examcard ${e.id === d.live.examId ? 'active' : ''}"><div class="card-h"><div><h3>${esc(e.nama)}</h3><small>${U.tgl(new Date(e.tanggal).getTime(), false)}</small></div>
        ${e.id === d.live.examId ? '<span class="badge blue">Aktif di IFP</span>' : ''}</div>
        <div class="card-b"><ul>
          <li><b>${(+e.jmlPG || 0) + (+e.jmlEssay || 0)} soal</b> per siswa (${mode}: ${e.jmlPG} PG, ${e.jmlEssay} uraian)</li>
          <li>Durasi <b>${e.durasi} menit</b> • KKM ${kkmOf(e)}</li>
          <li>Bank: ${banks.map(b => esc(b.nama)).join(', ') || '<span style="color:#b91c1c">belum dipilih</span>'}</li>
          <li>Peserta: ${(e.kelas || []).join(', ') || 'semua kelas'} (${done}/${parts} selesai)</li>
          <li>${e.acakSoal ? 'Soal diacak' : 'Soal berurutan'}, ${e.acakOpsi ? 'opsi diacak' : 'opsi tetap'}${e.tampilPembahasan ? ', pembahasan tampil' : ''}${e.tampilNilai ? '' : ', nilai disembunyikan di papan'}</li></ul>
        <div class="btns mt">${e.id !== d.live.examId ? `<button class="b primary sm" data-on="${e.id}">Tampilkan di IFP</button>` : ''}<button class="b sm" data-e="${e.id}">Edit</button><button class="b sm" data-c="${e.id}">Duplikat</button>
          <button class="b sm" data-r="${e.id}">Laporan</button><button class="b sm danger" data-d="${e.id}">Hapus</button></div></div></div>`;
    }).join('') || '<div class="card card-b muted">Belum ada ujian.</div>'}</div>`;
  $('#xAdd').onclick = () => editExam();
  $$('[data-on]').forEach(b => b.onclick = () => act('/api/live/select', { examId: b.dataset.on }, 'Ujian ditampilkan di IFP'));
  $$('[data-e]').forEach(b => b.onclick = () => editExam(findEx(b.dataset.e)));
  $$('[data-c]').forEach(b => b.onclick = () => { const e = JSON.parse(JSON.stringify(findEx(b.dataset.c))); delete e.id; e.nama += ' (salinan)'; editExam(e); });
  $$('[data-r]').forEach(b => b.onclick = () => { G.rep.examId = b.dataset.r; go('laporan'); });
  $$('[data-d]').forEach(b => b.onclick = async () => {
    const e = findEx(b.dataset.d), n = G.d.results.filter(r => r.examId === e.id).length;
    const m = modal({ title: 'Hapus ujian', body: `<p>Hapus pengaturan ujian <b>${esc(e.nama)}</b>?</p>${n ? `<label class="check"><input type="checkbox" id="dRes"> Hapus juga ${n} hasil/nilai siswa</label><p class="muted">Jika tidak dicentang, hasil tetap tersimpan di cadangan data.</p>` : ''}`, foot: '<button class="b danger solid" id="dGo">Hapus</button>' });
    $('#dGo', m).onclick = async () => { await act('/api/exams/delete', { id: e.id, hapusHasil: !!($('#dRes', m) || {}).checked }, 'Ujian dihapus'); m.close(); };
  });
}
function editExam(e) {
  e = Object.assign({ nama: '', tanggal: new Date().toISOString().slice(0, 10), bankIds: [], jmlPG: 10, jmlEssay: 0, durasi: 15, kelas: [], acakSoal: true, acakOpsi: true, urutan: 'campur', tampilNilai: true, tampilPembahasan: false, kkm: '', detikHasil: 20, catatan: '' }, e || {});
  const kel = allKelas();
  const m = modal({
    title: e.id ? 'Edit Ujian' : 'Buat Ujian Baru', size: 'wide', body: `
    <div class="frow"><div class="field" style="grid-column:span 2"><label>Nama ujian *</label><input type="text" id="xN" value="${esc(e.nama)}" placeholder="contoh: Ujian Praktikum Matematika Semester Ganjil"></div>
      <div class="field"><label>Tanggal</label><input type="date" id="xD" value="${esc(e.tanggal)}"></div></div>
    <div class="field"><label>Bank soal yang dipakai (boleh lebih dari satu)</label><div class="bankpick">${G.d.banks.map(b => { const n = bankCount(b.id); return `<label class="check"><input type="checkbox" class="xB" value="${b.id}" ${e.bankIds.includes(b.id) ? 'checked' : ''}> ${esc(b.nama)} <span class="muted">(${n.pg} PG, ${n.es} uraian)</span></label>`; }).join('') || '<span class="muted">Belum ada bank soal.</span>'}</div></div>
    <div class="field"><label>Komposisi soal tiap siswa</label><div class="seg" id="xMode"><button type="button" data-m="pg">PG semua</button><button type="button" data-m="es">Uraian semua</button><button type="button" data-m="mix">Campuran</button></div></div>
    <div class="frow"><div class="field"><label>Jumlah soal PG</label><input type="number" id="xPG" min="0" value="${e.jmlPG}"><small id="xPGa"></small></div>
      <div class="field"><label>Jumlah soal uraian</label><input type="number" id="xES" min="0" value="${e.jmlEssay}"><small id="xESa"></small></div>
      <div class="field"><label>Durasi (menit)</label><input type="number" id="xDur" min="1" value="${e.durasi}"></div>
      <div class="field"><label>KKM</label><input type="number" id="xK" min="0" max="100" value="${e.kkm ?? ''}" placeholder="bawaan ${G.d.settings.kkm}"></div></div>
    <div class="field"><label>Kelas peserta <span class="muted" style="font-weight:400">(tidak dicentang = semua kelas)</span></label><div class="btns">${kel.map(k => `<label class="check" style="margin-right:12px"><input type="checkbox" class="xKl" value="${esc(k)}" ${e.kelas.includes(k) ? 'checked' : ''}> ${esc(k)}</label>`).join('') || '<span class="muted">Belum ada data kelas.</span>'}</div></div>
    <div class="grid2"><div>
      <label class="check"><input type="checkbox" id="xAS" ${e.acakSoal ? 'checked' : ''}> Ambil &amp; acak soal secara acak untuk tiap siswa</label>
      <label class="check"><input type="checkbox" id="xAO" ${e.acakOpsi ? 'checked' : ''}> Acak urutan pilihan jawaban (A–E)</label>
      <div class="field"><label>Urutan tipe soal</label><select id="xU"><option value="campur" ${e.urutan === 'campur' ? 'selected' : ''}>Campur acak</option><option value="pg_dulu" ${e.urutan === 'pg_dulu' ? 'selected' : ''}>PG dulu, lalu uraian</option><option value="essay_dulu" ${e.urutan === 'essay_dulu' ? 'selected' : ''}>Uraian dulu, lalu PG</option></select></div></div>
    <div>
      <label class="check"><input type="checkbox" id="xTN" ${e.tampilNilai ? 'checked' : ''}> Tampilkan nilai siswa di IFP (papan &amp; hasil)</label>
      <label class="check"><input type="checkbox" id="xTP" ${e.tampilPembahasan ? 'checked' : ''}> Tampilkan kunci &amp; pembahasan setelah siswa selesai</label>
      <div class="field"><label>Lama layar hasil sebelum kembali ke papan (detik)</label><input type="number" id="xDH" min="5" value="${e.detikHasil}"></div></div></div>
    <div class="field"><label>Catatan</label><input type="text" id="xC" value="${esc(e.catatan || '')}"></div>
    <div class="note" id="xInfo"></div>`, foot: '<button class="b primary" id="xS">Simpan ujian</button>'
  });
  const avail = () => { const ids = $$('.xB:checked', m).map(x => x.value); let pg = 0, es = 0; ids.forEach(id => { const n = bankCount(id); pg += n.pg; es += n.es; }); return { pg, es }; };
  let mode = !+e.jmlEssay ? 'pg' : !+e.jmlPG ? 'es' : 'mix';
  const upd = () => {
    const a = avail();
    $$('#xMode button', m).forEach(b => b.classList.toggle('act', b.dataset.m === mode));
    $('#xPG', m).disabled = mode === 'es'; $('#xES', m).disabled = mode === 'pg';
    if (mode === 'es') $('#xPG', m).value = 0; if (mode === 'pg') $('#xES', m).value = 0;
    $('#xPGa', m).textContent = `Tersedia ${a.pg} soal PG`; $('#xESa', m).textContent = `Tersedia ${a.es} soal uraian`;
    const pg = +$('#xPG', m).value, es = +$('#xES', m).value;
    const bad = pg > a.pg || es > a.es;
    $('#xInfo', m).className = 'note' + (bad ? ' amber' : '');
    $('#xInfo', m).innerHTML = bad ? `⚠ Jumlah soal melebihi yang tersedia di bank (PG ${a.pg}, uraian ${a.es}). Tambah soal atau kurangi jumlah.` :
      `Setiap siswa akan mendapat <b>${pg + es} soal</b> (${pg} PG + ${es} uraian) yang diambil ${$('#xAS', m).checked ? '<b>acak</b>' : 'berurutan'} dari ${a.pg + a.es} soal tersedia, dengan waktu <b>${$('#xDur', m).value} menit</b>.${$('#xAS', m).checked && a.pg + a.es > pg + es ? ' Soal antarsiswa berbeda-beda.' : ''}`;
  };
  $$('#xMode button', m).forEach(b => b.onclick = () => { mode = b.dataset.m; upd(); });
  $$('input,select', m).forEach(i => i.addEventListener('input', upd));
  upd();
  $('#xS', m).onclick = async () => {
    const ex = {
      ...e, nama: $('#xN', m).value.trim(), tanggal: $('#xD', m).value, bankIds: $$('.xB:checked', m).map(x => x.value),
      jmlPG: +$('#xPG', m).value || 0, jmlEssay: +$('#xES', m).value || 0, durasi: +$('#xDur', m).value || 15, kelas: $$('.xKl:checked', m).map(x => x.value),
      acakSoal: $('#xAS', m).checked, acakOpsi: $('#xAO', m).checked, urutan: $('#xU', m).value, tampilNilai: $('#xTN', m).checked, tampilPembahasan: $('#xTP', m).checked,
      kkm: $('#xK', m).value === '' ? null : +$('#xK', m).value, detikHasil: +$('#xDH', m).value || 20, catatan: $('#xC', m).value,
    };
    if (!ex.bankIds.length) return toast('Pilih minimal satu bank soal', 'err');
    const a = avail(); if (ex.jmlPG > a.pg || ex.jmlEssay > a.es) return toast('Jumlah soal melebihi soal yang tersedia', 'err');
    if (ex.jmlPG + ex.jmlEssay < 1) return toast('Jumlah soal minimal 1', 'err');
    const r = await act('/api/exams/save', { exam: ex }, 'Pengaturan ujian disimpan'); if (r) m.close();
  };
}

/* =====================================================================
   LAPORAN
   ===================================================================== */
function repData(ex) {
  const lm = latestMap(ex.id), kkm = kkmOf(ex);
  let rows = Object.values(lm);
  if (G.rep.kelas) rows = rows.filter(r => r.kelas === G.rep.kelas);
  rows.sort((a, b) => b.score.nilai - a.score.nilai || (a.finishedAt - a.startedAt) - (b.finishedAt - b.startedAt));
  let rank = 0, last = null; rows.forEach((r, i) => { if (r.score.nilai !== last) { rank = i + 1; last = r.score.nilai; } r._rank = rank; });
  const parts = participants(ex).filter(s => !G.rep.kelas || s.kelas === G.rep.kelas);
  const belum = parts.filter(s => !lm[s.id]);
  const n = rows.map(r => r.score.nilai);
  const avg = n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0;
  const sorted = [...n].sort((a, b) => a - b);
  const med = !n.length ? 0 : sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const sd = n.length > 1 ? Math.sqrt(n.reduce((a, b) => a + (b - avg) ** 2, 0) / (n.length - 1)) : 0;
  return { rows, belum, parts, kkm, stat: { n: n.length, avg, max: n.length ? Math.max(...n) : 0, min: n.length ? Math.min(...n) : 0, med, sd, tuntas: rows.filter(r => r.score.nilai >= kkm).length } };
}
function itemAnalysis(rows) {
  const map = {}, order = [];
  const sortedRows = [...rows].sort((a, b) => b.score.nilai - a.score.nilai);
  const k = Math.max(1, Math.round(sortedRows.length * 0.27));
  const upper = new Set(sortedRows.slice(0, k).map(r => r.id)), lower = new Set(sortedRows.slice(-k).map(r => r.id));
  rows.forEach(r => r.items.forEach(it => {
    let A = map[it.qid];
    if (!A) { A = map[it.qid] = { it, n: 0, sum: 0, choices: {}, up: [0, 0], lo: [0, 0], kosong: 0 }; order.push(it.qid); }
    const det = (r.score.detail || {})[it.qid] || { skor: 0 }, frac = it.bobot ? det.skor / it.bobot : 0;
    const a = (r.answers[it.qid] || {}).a || '';
    A.n++; A.sum += frac; if (!String(a).trim()) A.kosong++;
    if (it.tipe === 'PG' && a) A.choices[a] = (A.choices[a] || 0) + 1;
    if (upper.has(r.id)) { A.up[0] += frac; A.up[1]++; } if (lower.has(r.id)) { A.lo[0] += frac; A.lo[1]++; }
  }));
  const bank = Object.fromEntries(G.d.questions.map(q => [q.id, q]));
  return order.map(id => {
    const A = map[id], P = A.n ? A.sum / A.n : 0;
    const D = rows.length >= 4 && A.up[1] && A.lo[1] ? A.up[0] / A.up[1] - A.lo[0] / A.lo[1] : null;
    const q = bank[id];
    return { ...A, P, D, Pk: P > 0.7 ? 'Mudah' : P >= 0.3 ? 'Sedang' : 'Sukar', Dk: D === null ? '-' : D >= 0.4 ? 'Sangat baik' : D >= 0.3 ? 'Baik' : D >= 0.2 ? 'Cukup' : 'Perlu revisi', opsi: q ? q.opsi : null, kunciAsli: it => it.kunci };
  });
}
function pgLaporan(c) {
  const d = G.d;
  if (!G.rep.examId || !findEx(G.rep.examId)) G.rep.examId = d.live.examId && findEx(d.live.examId) ? d.live.examId : (d.exams[0] || {}).id;
  const ex = findEx(G.rep.examId);
  if (!ex) { c.innerHTML = '<div class="card card-b muted">Belum ada ujian.</div>'; return; }
  const R = repData(ex), kelasList = [...new Set(participants(ex).map(s => s.kelas))];
  const tabs = { rekap: 'Rekap Nilai', statistik: 'Statistik', analisis: 'Analisis Butir Soal', koreksi: 'Koreksi Uraian', belum: `Belum Ujian (${R.belum.length})` };
  c.innerHTML = `<div class="toolbar"><select id="rEx" style="width:320px">${d.exams.map(e => `<option value="${e.id}" ${e.id === ex.id ? 'selected' : ''}>${esc(e.nama)}</option>`).join('')}</select>
      <select id="rK" style="width:150px"><option value="">Semua kelas</option>${kelasList.map(k => `<option ${k === G.rep.kelas ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select>
      <span class="sp"></span><button class="b" id="rXls">⬇ Ekspor Excel (lengkap)</button><button class="b primary" id="rPrint">🖨 Cetak</button></div>
    <div class="stats mb">
      <div class="stat"><small>Peserta</small><b>${R.parts.length}</b></div><div class="stat"><small>Sudah ujian</small><b>${R.stat.n}</b></div>
      <div class="stat"><small>Rata-rata</small><b>${U.num(R.stat.avg)}</b></div><div class="stat"><small>Tertinggi</small><b>${U.num(R.stat.max)}</b></div>
      <div class="stat"><small>Terendah</small><b>${U.num(R.stat.min)}</b></div><div class="stat"><small>Tuntas (KKM ${R.kkm})</small><b>${R.stat.n ? Math.round(100 * R.stat.tuntas / R.stat.n) : 0}%</b></div></div>
    <div class="tabs">${Object.entries(tabs).map(([k, v]) => `<button data-tab="${k}" class="${G.rep.tab === k ? 'act' : ''}">${v}</button>`).join('')}</div>
    <div id="rBody"></div>`;
  $('#rEx').onchange = e => { G.rep.examId = e.target.value; G.rep.kelas = ''; render(); };
  $('#rK').onchange = e => { G.rep.kelas = e.target.value; render(); };
  $$('[data-tab]').forEach(b => b.onclick = () => { G.rep.tab = b.dataset.tab; render(); });
  $('#rXls').onclick = () => exportReport(ex, R);
  $('#rPrint').onclick = () => printReport(ex, R);
  const body = $('#rBody');
  ({ rekap: tabRekap, statistik: tabStat, analisis: tabAnalisis, koreksi: tabKoreksi, belum: tabBelum })[G.rep.tab](body, ex, R);
}
function tabRekap(el, ex, R) {
  el.innerHTML = `<div class="card"><div class="card-h"><h3>Rekap nilai — ${esc(ex.nama)}${G.rep.kelas ? ' — ' + esc(G.rep.kelas) : ''}</h3>
      <div class="btns"><button class="b sm" id="rSheets">🖨 Cetak semua lembar jawaban</button><button class="b sm" id="rRegrade">Hitung ulang nilai</button></div></div>
    <div class="tbl-wrap"><table class="t"><thead><tr><th class="c">Rank</th><th>NIS</th><th>Nama</th><th>Kelas</th><th class="c">PG benar</th><th class="c">Skor uraian</th><th class="c">Nilai</th><th class="c">Predikat</th><th>Keterangan</th><th>Lama</th><th>Selesai</th><th class="r">Aksi</th></tr></thead><tbody>
    ${R.rows.map(r => `<tr><td class="c"><b>${r._rank}</b></td><td>${esc(r.nis)}</td><td><b>${esc(r.nama)}</b></td><td>${esc(r.kelas)}</td>
      <td class="c">${r.score.pgBenar}/${r.score.pgTotal}</td><td class="c">${r.score.essayTotal ? U.num(r.score.essayEarned) + '/' + U.num(r.score.essayTotal) : '-'}</td>
      <td class="c"><b style="font-size:15px">${U.num(r.score.nilai)}</b></td><td class="c">${U.predikat(r.score.nilai)}</td>
      <td>${r.score.nilai >= R.kkm ? '<span class="badge green">Tuntas</span>' : '<span class="badge red">Belum tuntas</span>'}</td>
      <td>${U.durasi(r.finishedAt - r.startedAt)}</td><td><small>${U.tgl(r.finishedAt)}<br>${{ submit: 'dikumpulkan', waktu: 'waktu habis', guru: 'dihentikan guru' }[r.finishReason] || ''}</small></td>
      <td class="act"><button class="b xs" data-sh="${r.id}">Lembar jawaban</button> <button class="b xs" data-ifp="${r.id}">Tampil di IFP</button> <button class="b xs danger" data-del="${r.id}">Reset</button></td></tr>`).join('')
    || '<tr><td colspan="12" class="c muted" style="padding:30px">Belum ada siswa yang menyelesaikan ujian ini.</td></tr>'}</tbody></table></div></div>`;
  $('#rSheets').onclick = () => printSheets(ex, R.rows);
  $('#rRegrade').onclick = () => act('/api/results/regrade', { examId: ex.id }, 'Nilai dihitung ulang');
  $$('[data-sh]', el).forEach(b => b.onclick = () => answerSheet(G.d.results.find(r => r.id === b.dataset.sh)));
  $$('[data-ifp]', el).forEach(b => b.onclick = () => act('/api/live/showresult', { resultId: b.dataset.ifp }, 'Hasil ditampilkan di IFP'));
  $$('[data-del]', el).forEach(b => b.onclick = async () => { const r = G.d.results.find(x => x.id === b.dataset.del); if (await confirmBox(`Reset hasil <b>${esc(r.nama)}</b>? Nilai dihapus dan siswa bisa ujian lagi.`, { danger: true, ok: 'Reset' })) act('/api/results/delete', { ids: G.d.results.filter(x => x.examId === r.examId && x.studentId === r.studentId).map(x => x.id) }, 'Hasil siswa direset'); });
}
function tabStat(el, ex, R) {
  const bins = Array(10).fill(0); R.rows.forEach(r => bins[Math.min(9, Math.floor(r.score.nilai / 10))]++);
  const mx = Math.max(1, ...bins);
  const byK = {}; R.rows.forEach(r => { (byK[r.kelas] = byK[r.kelas] || []).push(r.score.nilai); });
  const pk = { A: 0, B: 0, C: 0, D: 0 }; R.rows.forEach(r => pk[U.predikat(r.score.nilai)]++);
  const tuntasPct = R.stat.n ? R.stat.tuntas / R.stat.n : 0;
  const C = 2 * Math.PI * 54;
  el.innerHTML = `<div class="grid2"><div class="card"><div class="card-h"><h3>Distribusi nilai</h3></div><div class="card-b">
      <div class="hist">${bins.map(b => `<div style="height:${100 * b / mx}%;${b ? '' : 'background:#e5e9f0'}"><span>${b || ''}</span></div>`).join('')}</div>
      <div class="histlbl">${bins.map((b, i) => `<span>${i * 10}–${i === 9 ? 100 : i * 10 + 9}</span>`).join('')}</div></div></div>
    <div class="card"><div class="card-h"><h3>Ketuntasan</h3></div><div class="card-b" style="display:flex;gap:24px;align-items:center">
      <svg width="150" height="150" viewBox="0 0 140 140"><circle cx="70" cy="70" r="54" fill="none" stroke="#fdecec" stroke-width="22"/>
        <circle cx="70" cy="70" r="54" fill="none" stroke="#15803d" stroke-width="22" stroke-dasharray="${C * tuntasPct} ${C}" transform="rotate(-90 70 70)"/>
        <text x="70" y="76" text-anchor="middle" font-size="22" font-weight="700" fill="#1f2937">${Math.round(tuntasPct * 100)}%</text></svg>
      <div><p><span class="badge green">Tuntas</span> ${R.stat.tuntas} siswa</p><p><span class="badge red">Belum tuntas</span> ${R.stat.n - R.stat.tuntas} siswa</p>
      <p class="muted">Median ${U.num(R.stat.med)} • Simpangan baku ${U.num(R.stat.sd, 2)}</p>
      <p>Predikat: A ${pk.A} • B ${pk.B} • C ${pk.C} • D ${pk.D}</p></div></div></div></div>
    <div class="card mt"><div class="card-h"><h3>Perbandingan per kelas</h3></div><div class="tbl-wrap"><table class="t"><thead><tr><th>Kelas</th><th class="c">Sudah ujian</th><th class="c">Rata-rata</th><th class="c">Tertinggi</th><th class="c">Terendah</th><th class="c">Tuntas</th></tr></thead><tbody>
    ${Object.entries(byK).sort().map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td class="c">${v.length}</td><td class="c">${U.num(v.reduce((a, b) => a + b, 0) / v.length)}</td><td class="c">${U.num(Math.max(...v))}</td><td class="c">${U.num(Math.min(...v))}</td><td class="c">${v.filter(x => x >= R.kkm).length} (${Math.round(100 * v.filter(x => x >= R.kkm).length / v.length)}%)</td></tr>`).join('') || '<tr><td colspan="6" class="muted c">Belum ada data.</td></tr>'}</tbody></table></div></div>
    <div class="card mt"><div class="card-h"><h3>10 besar</h3></div><div class="card-b">${R.rows.slice(0, 10).map(r => `<div style="display:flex;gap:10px;align-items:center;margin-bottom:6px"><b style="width:26px">${r._rank}.</b><span style="width:220px">${esc(r.nama)}</span><div class="bar" style="flex:1"><i style="width:${r.score.nilai}%"></i></div><b style="width:50px;text-align:right">${U.num(r.score.nilai)}</b></div>`).join('') || '<span class="muted">Belum ada data.</span>'}</div></div>`;
}
function tabAnalisis(el, ex, R) {
  const A = itemAnalysis(R.rows);
  el.innerHTML = `<div class="note mb">Indeks kesukaran (P) = proporsi skor benar (P &gt; 0,70 mudah • 0,30–0,70 sedang • &lt; 0,30 sukar). Daya beda (D) = selisih P kelompok atas 27% dan bawah 27% (≥ 0,40 sangat baik • 0,30 baik • 0,20 cukup • &lt; 0,20 perlu revisi). Daya beda dihitung bila minimal 4 siswa.</div>
  <div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>No</th><th>Soal</th><th>Tipe</th><th class="c">Muncul</th><th class="c">P</th><th>Kesukaran</th><th class="c">D</th><th>Daya beda</th><th class="c">Kosong</th><th>Sebaran jawaban (PG)</th></tr></thead><tbody>
  ${A.map((a, i) => `<tr><td>${i + 1}</td><td class="qprev" style="max-width:380px">${U.fmt(U.shortText(a.it.soal, 120))}<br><small class="muted">Tingkat di bank: ${esc(a.it.level || '-')}</small></td>
    <td>${a.it.tipe === 'PG' ? '<span class="badge blue">PG</span>' : '<span class="badge purple">Uraian</span>'}</td><td class="c">${a.n}×</td>
    <td class="c"><b>${U.num(a.P, 2)}</b></td><td><span class="badge ${a.Pk === 'Mudah' ? 'green' : a.Pk === 'Sedang' ? 'blue' : 'red'}">${a.Pk}</span></td>
    <td class="c">${a.D === null ? '-' : U.num(a.D, 2)}</td><td>${a.D === null ? '-' : `<span class="badge ${a.D >= 0.3 ? 'green' : a.D >= 0.2 ? 'amber' : 'red'}">${a.Dk}</span>`}</td><td class="c">${a.kosong}</td>
    <td>${a.it.tipe === 'PG' ? `<div class="choicebar">${'ABCDE'.split('').filter(k => a.opsi ? (a.opsi[k] || '').trim() : a.choices[k]).map(k => `<span class="${k === a.it.kunci ? 'key' : ''}" title="${esc(a.opsi ? a.opsi[k] : '')}">${k}: ${a.choices[k] || 0}</span>`).join('')}</div>` : '<span class="muted">-</span>'}</td></tr>`).join('')
    || '<tr><td colspan="10" class="c muted" style="padding:30px">Belum ada data.</td></tr>'}</tbody></table></div></div>
  <p class="muted">Huruf pada sebaran jawaban mengacu pada opsi asli di bank soal (sebelum diacak). Kunci ditandai hijau.</p>`;
}
function tabKoreksi(el, ex, R) {
  const groups = {};
  R.rows.forEach(r => r.items.filter(it => it.tipe !== 'PG').forEach(it => { (groups[it.qid] = groups[it.qid] || { it, list: [] }).list.push(r); }));
  const g = Object.values(groups);
  el.innerHTML = g.length ? `<div class="note mb">Skor uraian dinilai otomatis dari kunci/kata kunci. Periksa jawaban siswa dan ubah skornya bila perlu; nilai akhir langsung diperbarui.</div>` + g.map(({ it, list }) => `
    <div class="essayq"><div class="hd"><div class="qprev"><b>${U.fmt(it.soal)}</b></div>
      <div class="mt" style="font-size:13px">Kunci: <b>${esc(it.kunci || '-')}</b>${it.kataKunci ? ` • Kata kunci: <b>${esc(it.kataKunci)}</b>` : ''} • Bobot maks: <b>${it.bobot}</b></div></div>
      <table class="t"><thead><tr><th>Nama</th><th>Jawaban siswa</th><th class="c">Skor</th><th>Sumber</th><th style="width:230px">Ubah skor</th></tr></thead><tbody>
      ${list.map(r => { const det = r.score.detail[it.qid] || {}; const a = (r.answers[it.qid] || {}).a || ''; return `<tr><td><b>${esc(r.nama)}</b><br><small class="muted">${esc(r.kelas)}</small></td>
        <td class="ans-cell">${a ? esc(a) : '<i class="muted">(kosong)</i>'}</td><td class="c"><b>${U.num(det.skor, 2)}</b> / ${it.bobot}</td>
        <td>${det.sumber === 'manual' ? '<span class="badge blue">manual</span>' : '<span class="badge">otomatis</span>'}</td>
        <td><div class="inline"><input type="number" step="0.5" min="0" max="${it.bobot}" value="${det.skor}" style="width:80px" data-r="${r.id}" data-q="${it.qid}">
          <button class="b xs primary" data-save="${r.id}|${it.qid}">Simpan</button>${det.sumber === 'manual' ? `<button class="b xs" data-auto="${r.id}|${it.qid}" title="Kembalikan ke penilaian otomatis">Otomatis</button>` : ''}</div></td></tr>`;
      }).join('')}</tbody></table></div>`).join('') : '<div class="card card-b muted">Tidak ada soal uraian pada hasil ujian ini.</div>';
  $$('[data-save]', el).forEach(b => b.onclick = () => { const [rid, qid] = b.dataset.save.split('|'); const v = $(`input[data-r="${rid}"][data-q="${qid}"]`, el).value; act('/api/results/grade', { resultId: rid, qid, skor: v }, 'Skor disimpan'); });
  $$('[data-auto]', el).forEach(b => b.onclick = () => { const [rid, qid] = b.dataset.auto.split('|'); act('/api/results/grade', { resultId: rid, qid, skor: '' }, 'Dikembalikan ke penilaian otomatis'); });
}
function tabBelum(el, ex, R) {
  el.innerHTML = `<div class="card"><div class="card-h"><h3>${R.belum.length} siswa belum ujian</h3></div><div class="tbl-wrap"><table class="t"><thead><tr><th>No</th><th>NIS</th><th>Nama</th><th>Kelas</th><th class="r">Aksi</th></tr></thead><tbody>
    ${R.belum.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.nis)}</td><td><b>${esc(s.nama)}</b></td><td>${esc(s.kelas)}</td><td class="act"><button class="b xs primary" data-go="${s.id}">Pilih di Kendali Ujian</button></td></tr>`).join('') || '<tr><td colspan="5" class="c muted" style="padding:30px">Semua peserta sudah ujian. 🎉</td></tr>'}</tbody></table></div></div>`;
  $$('[data-go]', el).forEach(b => b.onclick = async () => { G.selStu = b.dataset.go; G.tabF = 'belum'; if (G.d.live.examId !== ex.id) await act('/api/live/select', { examId: ex.id }); go('kendali'); });
}
function answerText(it, a) {
  if (it.tipe !== 'PG') return a || '';
  const o = it.options.find(x => x.v === a); return o ? `${o.k}. ${o.t}` : '';
}
function keyText(it) { if (it.tipe !== 'PG') return it.kunci; const o = it.options.find(x => x.v === it.kunci); return o ? `${o.k}. ${o.t}` : it.kunci; }
function answerSheet(r) {
  const ex = findEx(r.examId);
  const m = modal({
    title: 'Lembar Jawaban — ' + esc(r.nama), size: 'xwide', body: `<div class="kv"><div><small>Nama / Kelas</small><b>${esc(r.nama)}</b><small>${esc(r.kelas)} • NIS ${esc(r.nis || '-')}</small></div>
      <div><small>Nilai</small><b style="font-size:26px;color:#1d4ed8">${U.num(r.score.nilai)}</b><small>Predikat ${U.predikat(r.score.nilai)} • ${r.score.nilai >= kkmOf(ex) ? 'Tuntas' : 'Belum tuntas'}</small></div>
      <div><small>Waktu</small><b>${U.durasi(r.finishedAt - r.startedAt)}</b><small>${U.tgl(r.finishedAt)}</small></div></div>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>No</th><th>Soal</th><th>Jawaban siswa</th><th>Kunci</th><th class="c">Skor</th></tr></thead><tbody>
    ${r.items.map((it, i) => { const det = r.score.detail[it.qid] || {}; const a = (r.answers[it.qid] || {}).a || ''; return `<tr><td>${i + 1}</td><td class="qprev" style="max-width:420px">${U.fmt(it.soal)}${it.gambar ? `<img src="${esc(it.gambar)}">` : ''}</td>
      <td class="ans-cell">${a ? U.fmt(answerText(it, a)) : '<i class="muted">(kosong)</i>'}</td><td>${U.fmt(keyText(it))}</td>
      <td class="c">${det.benar ? '✅' : det.skor > 0 ? '🟡' : '❌'} ${U.num(det.skor, 2)}/${it.bobot}</td></tr>`;
    }).join('')}</tbody></table></div>`, foot: '<button class="b primary" id="shP">🖨 Cetak lembar ini</button>'
  });
  $('#shP', m).onclick = () => printSheets(ex, [r]);
}

/* ---------- Cetak & ekspor ---------- */
function kop() {
  const s = G.d.settings;
  return `<div class="kop">${s.logo ? `<img src="${esc(s.logo)}">` : ''}<div class="tx"><b>${esc(s.sekolah)}</b><span>${esc(s.alamat || '')}</span></div>${s.logo ? '<div style="width:70px"></div>' : ''}</div>`;
}
function ttd() {
  const s = G.d.settings;
  return `<div class="ttd"><div>Mengetahui,<br>Kepala Sekolah<div class="sp"></div><b><u>${esc(s.kepsek || '..............................')}</u></b><br>${s.nipKepsek ? 'NIP. ' + esc(s.nipKepsek) : ''}</div>
    <div>${esc(s.kota || '...............')}, ${U.tglPanjang()}<br>Guru Mata Pelajaran<div class="sp"></div><b><u>${esc(s.guru || '..............................')}</u></b><br>${s.nip ? 'NIP. ' + esc(s.nip) : ''}</div></div>`;
}
function infoBlock(ex, extra = '') {
  const s = G.d.settings;
  return `<table class="p-info"><tr><td>Mata Pelajaran</td><td>: ${esc(s.mapel)}</td><td style="padding-left:30px">Tahun Ajaran</td><td>: ${esc(s.tahunAjaran)} / ${esc(s.semester)}</td></tr>
    <tr><td>Ujian</td><td>: ${esc(ex.nama)}</td><td style="padding-left:30px">Kelas</td><td>: ${esc(G.rep.kelas || (ex.kelas || []).join(', ') || 'Semua')}</td></tr>${extra}</table>`;
}
function doPrint(html) { $('#print').innerHTML = html; setTimeout(() => window.print(), 350); }
function printReport(ex, R) {
  const tab = G.rep.tab;
  if (tab === 'analisis') {
    const A = itemAnalysis(R.rows);
    return doPrint(`<div class="p-page">${kop()}<div class="p-title">Analisis Butir Soal</div><div class="p-sub">${esc(ex.nama)}</div>${infoBlock(ex)}
      <table class="p-t"><thead><tr><th>No</th><th>Soal</th><th>Tipe</th><th>Muncul</th><th>P</th><th>Kesukaran</th><th>D</th><th>Daya Beda</th></tr></thead><tbody>
      ${A.map((a, i) => `<tr><td class="c">${i + 1}</td><td>${U.fmt(U.shortText(a.it.soal, 140))}</td><td class="c">${a.it.tipe === 'PG' ? 'PG' : 'Uraian'}</td><td class="c">${a.n}</td><td class="c">${U.num(a.P, 2)}</td><td>${a.Pk}</td><td class="c">${a.D === null ? '-' : U.num(a.D, 2)}</td><td>${a.Dk}</td></tr>`).join('')}</tbody></table>${ttd()}</div>`);
  }
  if (tab === 'belum') {
    return doPrint(`<div class="p-page">${kop()}<div class="p-title">Daftar Siswa Belum Ujian</div><div class="p-sub">${esc(ex.nama)}</div>${infoBlock(ex)}
      <table class="p-t"><thead><tr><th>No</th><th>NIS</th><th>Nama</th><th>Kelas</th><th>Keterangan</th></tr></thead><tbody>${R.belum.map((s, i) => `<tr><td class="c">${i + 1}</td><td>${esc(s.nis)}</td><td>${esc(s.nama)}</td><td>${esc(s.kelas)}</td><td></td></tr>`).join('')}</tbody></table>${ttd()}</div>`);
  }
  const st = R.stat;
  doPrint(`<div class="p-page">${kop()}<div class="p-title">Daftar Nilai Ujian Praktikum</div><div class="p-sub">${esc(ex.nama)} — ${U.tgl(new Date(ex.tanggal).getTime(), false)}</div>${infoBlock(ex, `<tr><td>KKM</td><td>: ${R.kkm}</td><td style="padding-left:30px">Jumlah Soal</td><td>: ${ex.jmlPG} PG + ${ex.jmlEssay} uraian, ${ex.durasi} menit</td></tr>`)}
    <table class="p-t"><thead><tr><th>No</th><th>NIS</th><th>Nama Siswa</th><th>Kelas</th><th>PG Benar</th><th>Skor Uraian</th><th>Nilai</th><th>Predikat</th><th>Keterangan</th></tr></thead><tbody>
    ${R.rows.sort((a, b) => (a.kelas || '').localeCompare(b.kelas || '') || a.nama.localeCompare(b.nama)).map((r, i) => `<tr><td class="c">${i + 1}</td><td>${esc(r.nis)}</td><td>${esc(r.nama)}</td><td class="c">${esc(r.kelas)}</td><td class="c">${r.score.pgBenar}/${r.score.pgTotal}</td><td class="c">${r.score.essayTotal ? U.num(r.score.essayEarned) + '/' + U.num(r.score.essayTotal) : '-'}</td><td class="c"><b>${U.num(r.score.nilai)}</b></td><td class="c">${U.predikat(r.score.nilai)}</td><td>${r.score.nilai >= R.kkm ? 'Tuntas' : 'Belum tuntas'}</td></tr>`).join('')}
    ${R.belum.map((s, i) => `<tr><td class="c">${R.rows.length + i + 1}</td><td>${esc(s.nis)}</td><td>${esc(s.nama)}</td><td class="c">${esc(s.kelas)}</td><td class="c">-</td><td class="c">-</td><td class="c">-</td><td class="c">-</td><td>Belum ujian</td></tr>`).join('')}</tbody></table>
    <table class="p-t" style="width:60%;margin-top:12px"><tr><td>Rata-rata</td><td class="c">${U.num(st.avg)}</td><td>Tertinggi</td><td class="c">${U.num(st.max)}</td><td>Terendah</td><td class="c">${U.num(st.min)}</td></tr>
    <tr><td>Tuntas</td><td class="c">${st.tuntas}</td><td>Belum tuntas</td><td class="c">${st.n - st.tuntas}</td><td>Ketuntasan</td><td class="c">${st.n ? Math.round(100 * st.tuntas / st.n) : 0}%</td></tr></table>${ttd()}</div>`);
}
function printSheets(ex, rows) {
  if (!rows.length) return toast('Tidak ada data', 'err');
  doPrint(rows.map(r => `<div class="p-page">${kop()}<div class="p-title">Lembar Jawaban Ujian Praktikum</div><div class="p-sub">${esc(ex.nama)}</div>
    <table class="p-info"><tr><td>Nama</td><td>: <b>${esc(r.nama)}</b></td><td style="padding-left:30px">Nilai</td><td>: <b>${U.num(r.score.nilai)}</b> (${U.predikat(r.score.nilai)}, ${r.score.nilai >= kkmOf(ex) ? 'Tuntas' : 'Belum tuntas'})</td></tr>
    <tr><td>Kelas / NIS</td><td>: ${esc(r.kelas)} / ${esc(r.nis || '-')}</td><td style="padding-left:30px">Waktu</td><td>: ${U.tgl(r.finishedAt)} (${U.durasi(r.finishedAt - r.startedAt)})</td></tr></table>
    <table class="p-t"><thead><tr><th>No</th><th>Soal</th><th>Jawaban</th><th>Kunci</th><th>Skor</th></tr></thead><tbody>
    ${r.items.map((it, i) => { const det = r.score.detail[it.qid] || {}; const a = (r.answers[it.qid] || {}).a || ''; return `<tr><td class="c">${i + 1}</td><td>${U.fmt(it.soal)}${it.gambar ? `<br><img src="${esc(it.gambar)}" style="max-height:110px">` : ''}</td><td>${U.fmt(answerText(it, a)) || '-'}</td><td>${U.fmt(keyText(it))}</td><td class="c">${U.num(det.skor, 2)}/${it.bobot}</td></tr>`; }).join('')}</tbody></table>${ttd()}</div>`).join(''));
}
function exportReport(ex, R) {
  const s = G.d.settings, A = itemAnalysis(R.rows);
  const head = [[s.sekolah], ['DAFTAR NILAI ' + String(ex.nama).toUpperCase()], ['Mata pelajaran: ' + s.mapel + ' • Tahun ajaran ' + s.tahunAjaran + ' ' + s.semester + ' • KKM ' + R.kkm], []];
  const rekap = [...head, ['Rank', 'NIS', 'Nama', 'Kelas', 'PG Benar', 'Jumlah PG', 'Skor Uraian', 'Maks Uraian', 'Nilai', 'Predikat', 'Keterangan', 'Lama (menit)', 'Selesai'],
    ...R.rows.map(r => [r._rank, r.nis, r.nama, r.kelas, r.score.pgBenar, r.score.pgTotal, r.score.essayEarned, r.score.essayTotal, r.score.nilai, U.predikat(r.score.nilai), r.score.nilai >= R.kkm ? 'Tuntas' : 'Belum tuntas', Math.round((r.finishedAt - r.startedAt) / 6000) / 10, U.tgl(r.finishedAt)]),
  [], ['Rata-rata', R.stat.avg.toFixed(2)], ['Tertinggi', R.stat.max], ['Terendah', R.stat.min], ['Simpangan baku', R.stat.sd.toFixed(2)], ['Ketuntasan', R.stat.n ? Math.round(100 * R.stat.tuntas / R.stat.n) + '%' : '0%']];
  const det = [['Nama', 'Kelas', 'No', 'Tipe', 'Soal', 'Jawaban', 'Kunci', 'Skor', 'Bobot', 'Benar']];
  R.rows.forEach(r => r.items.forEach((it, i) => { const dd = r.score.detail[it.qid] || {}; det.push([r.nama, r.kelas, i + 1, it.tipe, it.soal, answerText(it, (r.answers[it.qid] || {}).a || ''), keyText(it), dd.skor, it.bobot, dd.benar ? 'Ya' : 'Tidak']); }));
  writeXlsx('Laporan_' + safeName(ex.nama) + (G.rep.kelas ? '_' + safeName(G.rep.kelas) : '') + '.xlsx', [
    { name: 'Rekap Nilai', cols: [6, 12, 30, 10, 9, 9, 11, 11, 8, 9, 13, 12, 20], aoa: rekap },
    { name: 'Analisis Butir', cols: [5, 60, 8, 8, 8, 10, 8, 14, 8, 30], aoa: [['No', 'Soal', 'Tipe', 'Muncul', 'P', 'Kesukaran', 'D', 'Daya beda', 'Kosong', 'Sebaran (opsi asli)'], ...A.map((a, i) => [i + 1, a.it.soal, a.it.tipe, a.n, +a.P.toFixed(2), a.Pk, a.D === null ? '-' : +a.D.toFixed(2), a.Dk, a.kosong, a.it.tipe === 'PG' ? Object.entries(a.choices).map(([k, v]) => k + ':' + v).join(' ') + ' (kunci ' + a.it.kunci + ')' : ''])] },
    { name: 'Detail Jawaban', cols: [26, 10, 5, 7, 60, 30, 30, 7, 7, 7], aoa: det },
    { name: 'Belum Ujian', cols: [5, 12, 30, 10], aoa: [['No', 'NIS', 'Nama', 'Kelas'], ...R.belum.map((x, i) => [i + 1, x.nis, x.nama, x.kelas])] },
  ]);
}

/* =====================================================================
   PENGATURAN
   ===================================================================== */
function pgPengaturan(c) {
  const s = G.d.settings;
  const f = (k, label, ph = '') => `<div class="field"><label>${label}</label><input type="text" data-k="${k}" value="${esc(s[k] ?? '')}" placeholder="${ph}"></div>`;
  c.innerHTML = `<div class="grid2"><div class="stack">
    <div class="card"><div class="card-h"><h3>Identitas sekolah &amp; laporan</h3></div><div class="card-b">
      ${f('sekolah', 'Nama sekolah')}${f('alamat', 'Alamat sekolah (untuk kop laporan)')}
      <div class="frow">${f('mapel', 'Mata pelajaran')}${f('judul', 'Judul di layar IFP')}</div>
      <div class="frow">${f('tahunAjaran', 'Tahun ajaran', '2026/2027')}${f('semester', 'Semester', 'Ganjil')}${f('kota', 'Kota (tanda tangan)')}</div>
      <div class="frow">${f('guru', 'Nama guru')}${f('nip', 'NIP guru')}</div>
      <div class="frow">${f('kepsek', 'Nama kepala sekolah')}${f('nipKepsek', 'NIP kepala sekolah')}</div>
      <div class="frow"><div class="field"><label>KKM bawaan</label><input type="number" data-k="kkm" value="${esc(s.kkm)}"></div>
        <div class="field"><label>Suara di IFP</label><select data-k="suara"><option value="1" ${s.suara !== false ? 'selected' : ''}>Aktif</option><option value="0" ${s.suara === false ? 'selected' : ''}>Mati</option></select></div></div>
      <div class="field"><label>Logo sekolah</label><div class="inline">${s.logo ? `<img src="${esc(s.logo)}" style="height:56px;border:1px solid #dde3ec;border-radius:6px">` : '<span class="muted">Belum ada</span>'}
        <button class="b sm" id="lgUp">Unggah logo</button>${s.logo ? '<button class="b sm danger" id="lgDel">Hapus</button>' : ''}</div></div>
      <button class="b primary" id="stSave">Simpan pengaturan</button></div></div>
    <div class="card"><div class="card-h"><h3>Ganti PIN guru</h3></div><div class="card-b">
      <div class="frow"><div class="field"><label>PIN baru</label><input type="password" id="p1"></div><div class="field"><label>Ulangi PIN baru</label><input type="password" id="p2"></div></div>
      <button class="b" id="pSave">Ganti PIN</button><p class="muted">PIN melindungi halaman guru agar tidak bisa dibuka dari IFP oleh siswa.</p></div></div>
  </div><div class="stack">
    <div class="card"><div class="card-h"><h3>Cadangan data</h3></div><div class="card-b">
      <p style="margin-top:0">Satu file cadangan berisi <b>semua</b>: siswa, bank soal, gambar soal, logo, ujian, nilai, tugas tambahan, dan pengaturan.</p>
      <div class="btns"><button class="b primary" id="bkDl">⬇ Unduh cadangan (.json)</button><button class="b" id="bkUp">⬆ Pulihkan / impor cadangan</button></div>
      <div class="note mt" style="background:#f6f8fb;border-radius:6px;padding:10px 12px">
        <b>Pindah data offline ↔ online:</b> unduh cadangan di aplikasi asal, lalu buka aplikasi tujuan → Pengaturan → <i>Pulihkan / impor cadangan</i>. PIN aplikasi tujuan ikut berganti menjadi PIN dari cadangan.</div>
      <p class="muted">${online() ? 'Versi online: data tersimpan di database Upstash Redis.' : 'Data juga tersimpan otomatis di folder <code>data/db.json</code> setiap detik.'}</p>
      <div id="bkProg" class="muted"></div></div></div>
    <div class="card"><div class="card-h"><h3>Bersihkan data</h3></div><div class="card-b">
      <div class="btns"><button class="b danger" data-rs="hasil">Hapus semua nilai</button><button class="b danger" data-rs="siswa">Hapus semua siswa</button>
        <button class="b danger" data-rs="soal">Hapus semua bank soal</button><button class="b danger solid" data-rs="semua">Kosongkan semua</button></div>
      <div class="btns mt"><button class="b" data-rs="demo">Muat ulang data contoh</button></div>
      <p class="muted">Unduh cadangan dulu sebelum menghapus data. Data contoh: 2 bank soal Pythagoras & SPLDV, 3 siswa kelas DEMO.</p></div></div>
    <div class="card"><div class="card-h"><h3>Jaringan</h3></div><div class="card-b">
      <p style="margin-top:0">Alamat untuk dibuka di IFP:</p>${online() ? `<div class="ifpurl" style="display:inline-block;font-size:18px;margin:0 8px 8px 0">${esc(location.origin)}</div>` : G.d.ips.map(ip => `<div class="ifpurl" style="display:inline-block;font-size:18px;margin:0 8px 8px 0">http://${ip}:${G.d.port}</div>`).join('')}
      <p style="margin:6px 0 0">Halaman tugas tambahan untuk siswa: <b>${esc(online() ? location.origin : 'http://' + ((G.d.ips || [])[0] || 'IP-LAPTOP') + ':' + G.d.port)}/tugas</b></p>
      <p class="muted">Jika laptop punya beberapa alamat, gunakan yang satu jaringan dengan IFP (biasanya diawali 192.168.).</p></div></div>
  </div></div>`;
  $('#stSave').onclick = () => {
    const ns = {}; $$('[data-k]', c).forEach(i => ns[i.dataset.k] = i.dataset.k === 'kkm' ? +i.value : i.dataset.k === 'suara' ? i.value === '1' : i.value);
    act('/api/settings/save', { settings: ns }, 'Pengaturan disimpan');
  };
  $('#lgUp').onclick = async () => { const fl = await pickFile('image/*'); if (!fl) return; try { const r = await api('/api/upload', { dataUrl: await resizeImage(fl, 400) }); act('/api/settings/save', { settings: { logo: r.url } }, 'Logo disimpan'); } catch (e) { toast(e.message, 'err'); } };
  if ($('#lgDel')) $('#lgDel').onclick = () => act('/api/settings/save', { settings: { logo: '' } }, 'Logo dihapus');
  $('#pSave').onclick = async () => {
    const a = $('#p1').value, b = $('#p2').value;
    if (a.length < 4) return toast('PIN minimal 4 karakter', 'err'); if (a !== b) return toast('PIN tidak sama', 'err');
    try { const r = await api('/api/settings/save', { settings: { pin: a } }); G.token = r.token; localStorage.setItem('ujian_token', r.token); toast('PIN berhasil diganti', 'ok'); $('#p1').value = $('#p2').value = ''; } catch (e) { toast(e.message, 'err'); }
  };
  $('#bkDl').onclick = () => downloadBackup();
  $('#bkUp').onclick = () => restoreBackup();
  const LBL = { hasil: 'menghapus SEMUA nilai/hasil ujian', siswa: 'menghapus SEMUA data siswa', soal: 'menghapus SEMUA bank soal dan soal', semua: 'mengosongkan SELURUH data (PIN tetap)', demo: 'menambahkan data contoh (2 bank soal, 3 siswa DEMO, 1 ujian contoh) tanpa menghapus data lain' };
  $$('[data-rs]', c).forEach(b => b.onclick = async () => { if (await confirmBox(`Anda akan ${LBL[b.dataset.rs]}. Lanjutkan?`, { danger: true, ok: 'Ya' })) act('/api/reset', { what: b.dataset.rs }, 'Selesai'); });
}

/* =====================================================================
   PANDUAN
   ===================================================================== */
/* ---------- Cadangan lengkap (termasuk gambar) & impor offline <-> online */
function usedImages(d) {
  const set = new Set(), take = u => { if (typeof u === 'string' && u.startsWith('/img/')) set.add(u.slice(5)); };
  take((d.settings || {}).logo);
  (d.questions || []).forEach(q => take(q.gambar));
  (d.tugasItems || []).forEach(t => take(t.gambar));
  (d.penugasan || []).forEach(p => Object.values(p.tugas || {}).forEach(t => take(t.gambar)));
  return [...set];
}
const b64FromBuf = buf => { let s = '', a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
async function gzB64(text) {
  if (!window.CompressionStream) return null;
  const st = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return b64FromBuf(await new Response(st).arrayBuffer());
}
async function downloadBackup() {
  const prog = $('#bkProg'); const say = t => { if (prog) prog.textContent = t; };
  try {
    say('Mengambil data…');
    const d = await api('/api/backup'), names = usedImages(d), imgs = {};
    for (let i = 0; i < names.length; i++) {
      say(`Mengambil gambar ${i + 1} dari ${names.length}…`);
      try { const r = await fetch('/img/' + names[i]); if (r.ok) imgs[names[i]] = b64FromBuf(await r.arrayBuffer()); } catch (e) { }
    }
    d._images = imgs;
    const blob = new Blob([JSON.stringify(d)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `Cadangan_Ujian_${online() ? 'ONLINE' : 'OFFLINE'}_` + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json'; a.click();
    say(`Cadangan diunduh (${(d.results || []).length} hasil ujian, ${Object.keys(imgs).length} gambar).`);
  } catch (e) { say(''); if (e.message !== 'AUTH') toast(e.message, 'err'); }
}
async function restoreBackup() {
  const fl = await pickFile('.json'); if (!fl) return;
  let data; try { data = JSON.parse(await fl.text()); } catch (e) { return toast('File tidak valid', 'err'); }
  if (!data || !data.students || !data.questions) return toast('Ini bukan file cadangan aplikasi ujian.', 'err');
  const imgs = data._images || {}; delete data._images;
  const info = `${(data.students || []).length} siswa, ${(data.questions || []).length} soal, ${(data.results || []).length} hasil ujian, ${(data.tugasItems || []).length} tugas, ${Object.keys(imgs).length} gambar`;
  if (!await confirmBox(`Pulihkan dari <b>${esc(fl.name)}</b>?<br><span class="muted">${info}</span><br><br>Semua data di aplikasi ini akan <b>diganti</b>. PIN ikut berganti menjadi PIN dari cadangan.`, { danger: true, ok: 'Pulihkan' })) return;
  const prog = $('#bkProg'); const say = t => { if (prog) prog.textContent = t; };
  try {
    say('Mengirim data…');
    const text = JSON.stringify({ db: data }), gz = text.length > 300000 ? await gzB64(text) : null;
    const r = await api('/api/restore', gz ? { gz } : { db: data });
    G.token = r.token; localStorage.setItem('ujian_token', r.token);
    const names = Object.keys(imgs);
    for (let i = 0; i < names.length; i++) { say(`Mengirim gambar ${i + 1} dari ${names.length}…`); await api('/api/img/put', { name: names[i], data: imgs[names[i]] }); }
    say(''); toast(`Data dipulihkan: ${info}`, 'ok'); reload();
  } catch (e) { say(''); if (e.message !== 'AUTH') toast(e.message, 'err'); }
}

function pgPanduan(c) {
  const ip = online() ? location.host : ((G.d.ips || [])[0] || '192.168.x.x') + ':' + G.d.port;
  c.innerHTML = `<div class="card card-b doc">
  <h3 style="margin-top:0">Alur singkat pada hari ujian</h3>
  <ol><li>Nyalakan hotspot/Wi-Fi (HP, modem, atau router). Sambungkan <b>laptop</b> dan <b>IFP</b> ke jaringan yang sama. Internet tidak diperlukan.</li>
    <li>Di laptop, jalankan <code>JALANKAN.bat</code> (Windows). Halaman guru terbuka otomatis.</li>
    <li>Di IFP, buka browser (Chrome) dan ketik <code>http://${ip}</code>, lalu ketuk layar sekali.</li>
    <li>Di menu <b>Kendali Ujian</b>: pilih ujian → pilih siswa (klik nama, atau tekan <b>🎲 Acak Siswa</b>) → tekan <b>MULAI UJIAN</b>.</li>
    <li>IFP menampilkan hitung mundur 3-2-1, siswa mengerjakan langsung di IFP.</li>
    <li>Buka menu <b>👁 Aktivitas Siswa</b> untuk melihat secara langsung soal yang sedang dibuka siswa, sisa waktu, lama di tiap soal, dan jawaban yang dipilih/diketik siswa. Klik nomor soal untuk melihat soal lain, centang <i>Tampilkan kunci</i> untuk melihat benar/salah.</li>
    <li>Setelah siswa menekan <b>Selesai</b> (atau waktu habis), nilai langsung tampil, lalu IFP kembali ke papan nilai (sudah/belum ujian). Siswa berikutnya otomatis terpilih di laptop.</li></ol>
  <h3>Persiapan sebelum hari ujian</h3>
  <ol><li><b>Data Siswa</b> → Unduh Template → isi di Excel → Impor Excel.</li>
    <li><b>Bank Soal</b> → Unduh Template Soal → isi soal PG/uraian → Impor. Bisa banyak bank (misalnya per materi). Gambar soal ditambahkan lewat tombol Edit soal.</li>
    <li><b>Pengaturan Ujian</b> → Buat Ujian Baru → pilih bank, komposisi (PG semua/uraian semua/campuran), jumlah soal, durasi, kelas peserta.</li>
    <li>Coba dulu dengan siswa kelas DEMO, lalu reset hasilnya di <b>Laporan → Reset</b>.</li></ol>
  <h3>Acak siswa (roling)</h3>
  <ul><li>Tombol <b>🎲 Acak Siswa</b> mengundi satu siswa dari yang <b>belum ujian</b>. IFP menampilkan nama berputar lalu berhenti pada siswa terpilih, dengan suara dan konfeti.</li>
    <li>Siswa yang sudah ujian tidak akan terpilih lagi. Jika kolom Kelas pada daftar difilter, undian hanya dari kelas itu.</li>
    <li>Siswa terpilih otomatis menjadi siswa yang dipilih. Tekan <b>Mulai ujian siswa ini</b>, atau <b>Acak lagi</b> bila ingin mengundi ulang.</li>
    <li>Guru tetap bisa memilih manual: klik nama siswa pada daftar (undian di IFP otomatis dibatalkan).</li></ul>
  <h3>Selama ujian</h3>
  <ul><li><b>Jeda</b> menghentikan waktu sementara; <b>+1/+5 menit</b> menambah waktu; <b>Hentikan &amp; Nilai</b> langsung menilai; <b>Batalkan sesi</b> membuang jawaban.</li>
    <li>Siswa bisa: memilih jawaban, menandai <b>Ragu-ragu</b>, melompat lewat <b>Daftar Soal</b>, dan <b>Coret-coret</b> di layar untuk menghitung.</li>
    <li>Soal uraian/isian dijawab dengan papan angka besar (0–9, koma desimal, minus, dan garis pecahan). Kunci uraian harus berupa angka.</li>
    <li>Jika IFP sempat mati/terputus, buka lagi alamatnya: siswa kembali ke soal dengan jawaban yang sudah tersimpan.</li></ul>
  <h3>Penilaian</h3>
  <ul><li>Nilai = (total skor diperoleh ÷ total bobot) × 100.</li>
    <li>PG dinilai otomatis. Uraian dinilai otomatis dari kunci (angka yang sama dianggap benar) atau kata kunci; guru dapat mengoreksi di <b>Laporan → Koreksi Uraian</b>.</li>
    <li>Laporan: rekap nilai &amp; peringkat, statistik, analisis butir soal (kesukaran &amp; daya beda), lembar jawaban per siswa, daftar belum ujian; dapat dicetak (dengan kop &amp; tanda tangan) atau diekspor ke Excel.</li></ul>
  <h3>Jika IFP tidak bisa membuka alamat</h3>
  <ul><li>Pastikan laptop dan IFP di Wi-Fi yang sama, dan alamat diketik lengkap dengan <code>:${G.d.port}</code>.</li>
    <li>Windows Firewall: saat pertama menjalankan, pilih <b>Allow access / Izinkan</b> untuk Python (centang jaringan Private dan Public). Atau atur jaringan Wi-Fi laptop sebagai <b>Private</b>.</li>
    <li>Hotspot HP tertentu memblokir antarperangkat (AP isolation). Coba buat hotspot dari laptop (Settings → Mobile hotspot) dan sambungkan IFP ke sana.</li></ul>
  <h3>👁 Aktivitas Siswa (realtime)</h3>
  <ul><li>Menampilkan soal yang sedang dibuka siswa, sisa waktu, lama di tiap soal, dan jawaban yang dipilih/diketik siswa saat itu juga.</li>
    <li>Klik nomor soal untuk melihat soal lain; <b>📍 Ikuti siswa</b> untuk kembali. Centang <i>Tampilkan kunci</i> untuk melihat benar/salah.</li>
    <li>Pilih nama pada kotak <i>Tampilkan</i> untuk membuka kembali sesi siswa yang sudah selesai.</li></ul>
  <h3>📝 Tugas Tambahan</h3>
  <ol><li><b>Daftar Tugas</b>: isi tugas lebih dulu — tambah satu per satu, <b>Impor Excel</b> (unduh template dulu), atau <b>Ambil dari Bank Soal</b>. Kelompokkan dengan <b>Paket</b> (misalnya per materi).</li>
    <li><b>Penugasan Siswa</b>: pilih ujian, kelas, <b>batas nilai</b> (kosong = KKM), serta jumlah tugas <b>paling sedikit</b> dan <b>paling banyak</b>.</li>
    <li>Tekan <b>Lihat rencana pembagian</b>. Siswa dengan nilai paling rendah mendapat tugas paling banyak; yang mendekati batas mendapat paling sedikit. Tugas tiap siswa diacak sehingga berbeda-beda. Tekan <b>Acak lagi</b> bila ingin susunan lain, lalu <b>Simpan</b>.</li>
    <li>Pada penugasan yang dibuka: cetak <b>lembar tugas per siswa</b>, cetak daftar + kunci untuk guru, ekspor Excel, centang tugas yang sudah dikumpulkan, isi nilai tugas dan catatan, atau 🎲 acak ulang tugas satu siswa.</li>
    <li>Centang <b>Tampilkan di halaman siswa</b> agar siswa bisa melihat tugasnya di alamat <code>${online() ? esc(location.origin) : 'http://' + ip}/tugas</code>: siswa mengetik namanya, melihat tugasnya, dan bisa <b>mengunduh PDF</b>. Kunci dan nilai tidak ditampilkan ke siswa.</li></ol>
  <h3>🌐 Versi offline &amp; online</h3>
  <ul><li>Aplikasi tersedia dalam dua versi dengan fitur yang sama: <b>offline</b> (laptop guru + IFP satu Wi-Fi) dan <b>online</b> (internet, di Vercel). Ini versi <b>${online() ? 'ONLINE' : 'OFFLINE'}</b>.</li>
    <li>Memindahkan data: di aplikasi asal buka <b>Pengaturan → Unduh cadangan</b>; di aplikasi tujuan buka <b>Pengaturan → Pulihkan / impor cadangan</b>. Semua ikut: siswa, bank soal, gambar, logo, ujian, nilai, tugas tambahan, pengaturan, dan PIN.</li>
    <li>Versi online memakai database gratis (Upstash) dengan kuota bulanan. Agar hemat, tutup tab panel guru/IFP bila tidak dipakai; untuk ujian harian di kelas, versi offline tetap pilihan utama.</li></ul></div>`;
}

/* ---------------- Mulai ---------------- */
if (G.token) boot(); else showLogin();
