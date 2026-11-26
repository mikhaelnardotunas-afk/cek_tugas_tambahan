/* =====================================================================
   AKTIVITAS SISWA (REALTIME)
   Guru melihat soal yang sedang dibuka siswa, waktu, dan jawaban yang
   sedang diketik/dipilih — diperbarui seketika lewat /api/activity.
   ===================================================================== */
const ACT_TXT = {
  mulai: () => '▶ Ujian dimulai',
  pindah: n => `➡ Membuka soal no. ${n}`,
  pilih: (n, a) => `🔘 Soal ${n}: memilih <b>${a}</b>`,
  ganti: (n, a) => `🔁 Soal ${n}: mengganti jawaban ke <b>${a}</b>`,
  ketik: (n, a) => `⌨ Soal ${n}: mengetik <b>${a}</b>`,
  hapus: n => `⌫ Soal ${n}: menghapus jawaban`,
  ragu: n => `🤔 Soal ${n}: ditandai ragu-ragu`,
  yakin: n => `✔ Soal ${n}: tanda ragu dihapus`,
  jeda: () => '⏸ Ujian dijeda guru',
  lanjut: () => '▶ Ujian dilanjutkan',
  waktu: (n, a) => `⏱ Guru menambah waktu ${a} menit`,
  selesai: (n, a) => `🏁 Selesai — ${a}`,
};

function pgAktivitas(c) {
  const A = G.A;
  const ex = findEx(G.d.live.examId);
  const hist = ex ? G.d.results.filter(r => r.examId === ex.id && ['selesai', 'berjalan'].includes(r.status))
    .sort((a, b) => b.startedAt - a.startedAt).slice(0, 80) : [];
  c.innerHTML = `<div class="card mb"><div class="card-b act-top">
      <div class="inline" style="flex:1;min-width:260px"><label class="muted" style="white-space:nowrap">Tampilkan:</label>
        <select id="aRid" style="flex:1"><option value="">● Sesi yang sedang berjalan di IFP (otomatis)</option>
        ${hist.map(r => `<option value="${r.id}" ${r.id === A.rid ? 'selected' : ''}>${esc(r.nama)} (${esc(r.kelas || '-')}) — ${r.status === 'berjalan' ? 'sedang mengerjakan' : U.tgl(r.startedAt) + ' • nilai ' + U.num((r.score || {}).nilai)}</option>`).join('')}</select></div>
      <label class="check"><input type="checkbox" id="aKunci" ${A.kunci ? 'checked' : ''}> Tampilkan kunci &amp; benar/salah</label>
      <span class="act-live" id="aLive"><i></i> Realtime</span>
    </div></div>
    <div id="actBody"><div class="card card-b muted">Memuat aktivitas…</div></div>`;
  $('#aRid').onchange = e => { A.rid = e.target.value; A.view = null; A.a = 0; A.d = null; A.key = ''; actFetchNow(); };
  $('#aKunci').onchange = e => { A.kunci = e.target.checked; A.key = ''; actRender(); };
  $('#actBody').onclick = actClick;
  A.key = '';
  if (A.d) actRender();
  if (!A.loop) { A.loop = true; actLoop(); setInterval(actTick, 1000); }
  else actFetchNow();
}

let ACT_CTRL = null;
function actFetchNow() { if (ACT_CTRL) ACT_CTRL.abort(); }
async function actLoop() {
  const A = G.A;
  for (; ;) {
    if (G.page !== 'aktivitas' || !G.token) { await U.sleep(400); A.a = 0; continue; }
    ACT_CTRL = new AbortController();
    try {
      const r = await fetch(`/api/activity?a=${A.a}&rid=${encodeURIComponent(A.rid)}`, { headers: { 'X-Token': G.token }, cache: 'no-store', signal: ACT_CTRL.signal });
      if (r.status === 401) { showLogin(); await U.sleep(2000); continue; }
      const d = await r.json();
      if (d.same) {   // versi online: belum ada perubahan -> hemat kuota bila lama tidak ada kegiatan
        A.off = d.now - Date.now();
        const idle = Date.now() - (A.lastChange || 0);
        await U.sleep(document.hidden ? 10000 : idle > 180000 ? 5000 : 1300); continue;
      }
      A.lastChange = Date.now();
      A.d = d; A.a = d.a; A.off = d.now - Date.now(); A.recv = Date.now();
      if ($('#aLive')) $('#aLive').classList.remove('bad');
      if (G.page === 'aktivitas') actRender();
    } catch (e) {
      if (e.name === 'AbortError') { A.a = 0; continue; }
      if ($('#aLive')) $('#aLive').classList.add('bad');
      await U.sleep(1500);
    }
  }
}

function actOptLabel(it, v) {
  const o = (it.options || []).find(x => x.v === v);
  return o ? `${o.k}. ${o.t}` : v;
}
function actAnsText(it, a) {
  if (!a || String(a.a || '').trim() === '') return '';
  return it.tipe === 'PG' ? actOptLabel(it, a.a) : a.a;
}
function actIsRight(it, a, score) {
  const det = score && score.detail && score.detail[it.qid];
  if (det) return det.benar;
  if (!a || String(a.a || '').trim() === '') return null;
  if (it.tipe === 'PG') return a.a === it.kunci;
  const norm = s => String(s).replace(/\s/g, '').replace('−', '-').replace(',', '.');
  const val = s => { const m = norm(s).match(/^(-?\d+(?:\.\d+)?)(?:\/(-?\d+(?:\.\d+)?))?$/); return m ? (m[2] ? +m[1] / +m[2] : +m[1]) : null; };
  return String(it.kunci || '').split('|').some(k => { k = k.trim(); if (!k) return false; const x = val(a.a), y = val(k); return norm(k) === norm(a.a) || (x !== null && y !== null && Math.abs(x - y) < 1e-6); });
}
function actDur(ms) {
  ms = Math.max(0, ms || 0);
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
  return m ? `${m} mnt ${s % 60} dtk` : `${s} dtk`;
}

function actRender() {
  const A = G.A, d = A.d, el = $('#actBody'); if (!el || !d) return;
  const r = d.res;
  if (!r) {
    el.innerHTML = `<div class="card card-b"><h3>Belum ada siswa yang mengerjakan</h3>
      <p class="muted">Mulai ujian dari menu <b>Kendali Ujian</b>. Halaman ini akan langsung menampilkan soal yang dibuka siswa, waktunya, dan jawaban yang diketik — tanpa perlu dimuat ulang.</p>
      <button class="b primary" onclick="go('kendali')">Ke Kendali Ujian</button></div>`;
    return;
  }
  const lv = d.live, n = r.items.length;
  const vIdx = A.view !== null && A.view < n ? A.view : r.index;
  const it = r.items[vIdx], a = r.answers[it.qid] || {};
  const answered = r.items.filter(x => String((r.answers[x.qid] || {}).a || '').trim()).length;
  const ragu = r.items.filter(x => (r.answers[x.qid] || {}).ragu).length;
  const st = r.status === 'selesai' ? ['res', 'Selesai'] : lv.status === 'paused' ? ['pause', 'Dijeda'] : ['run', 'Sedang mengerjakan'];
  const showK = A.kunci;
  const right = showK ? actIsRight(it, a, r.score) : null;

  // ---- soal yang dilihat
  let body;
  if (it.tipe === 'PG') {
    body = `<div class="act-opts">${it.options.map(o => {
      const sel = a.a === o.v, key = showK && o.v === it.kunci;
      return `<div class="act-opt ${sel ? 'sel' : ''} ${key ? 'key' : ''} ${sel && showK && !key ? 'wrong' : ''}"><span class="lt">${o.k}</span><span class="tx">${U.fmt(o.t)}</span>
        ${sel ? '<span class="badge blue">Pilihan siswa</span>' : ''}${key ? '<span class="badge green">Kunci</span>' : ''}</div>`;
    }).join('')}</div>`;
  } else {
    const typing = r.aktif && a.t && (Date.now() + A.off - a.t) < 3000;
    body = `<div class="act-essay"><small class="muted">Jawaban yang diketik siswa (isian angka):</small>
      <div class="act-type ${typing ? 'typing' : ''}">${a.a ? esc(a.a) : '<span class="muted" style="font-size:18px">— belum mengetik —</span>'}${r.aktif && vIdx === r.index ? '<i class="caret"></i>' : ''}</div>
      ${typing ? '<div class="act-typing">⌨ sedang mengetik…</div>' : ''}
      ${showK ? `<div class="mt"><span class="badge green">Kunci: ${esc(it.kunci)}</span></div>` : ''}</div>`;
  }
  const following = A.view === null || A.view === r.index;
  const html = `
  <div class="act-head card mb"><div class="card-b">
    <div class="act-who"><div class="act-av">${esc(U.initials(r.nama))}</div>
      <div><div class="mon-name" style="margin:0">${esc(r.nama)}</div><div class="muted">${esc(r.kelas || '-')}${r.nis ? ' • NIS ' + esc(r.nis) : ''}</div></div></div>
    <div class="mon-status ${st[0]}"><i></i> <span id="aStat">${st[1]}</span></div>
    <div class="act-kpi"><small>Sisa waktu</small><b id="aRem">--:--</b></div>
    <div class="act-kpi"><small>Waktu berjalan</small><b id="aEl">--:--</b></div>
    <div class="act-kpi"><small>Dijawab</small><b>${answered}/${n}</b></div>
    <div class="act-kpi"><small>Ragu-ragu</small><b>${ragu}</b></div>
    ${r.status === 'selesai' && r.score ? `<div class="act-kpi"><small>Nilai</small><b>${U.num(r.score.nilai)}</b></div>` : ''}
    ${r.aktif ? `<div class="btns">${lv.status === 'paused' ? '<button class="b primary sm" data-x="resume">▶ Lanjutkan</button>' : '<button class="b warn sm" data-x="pause">⏸ Jeda</button>'}
      <button class="b sm" data-x="add1">+1 menit</button><button class="b sm" data-x="add5">+5 menit</button></div>` : ''}
  </div><div class="bar" style="margin:0"><i style="width:${100 * answered / n}%"></i></div></div>

  <div class="act-strip mb">${r.items.map((x, i) => {
    const ax = r.answers[x.qid] || {}, done = String(ax.a || '').trim() !== '';
    const ok = showK ? actIsRight(x, ax, r.score) : null;
    return `<button data-i="${i}" class="${i === r.index ? 'cur' : ''} ${i === vIdx ? 'view' : ''} ${ax.ragu ? 'ragu' : done ? 'ok' : ''} ${ok === true ? 'right' : ok === false ? 'bad' : ''}" title="Soal ${i + 1}">${i + 1}${x.tipe !== 'PG' ? '<small>U</small>' : ''}</button>`;
  }).join('')}</div>

  <div class="act-grid">
    <div class="card">
      <div class="card-h"><h3>${vIdx === r.index && r.aktif ? '📍 Soal yang sedang dikerjakan' : '📄 Soal'} — No. ${vIdx + 1} dari ${n}</h3>
        <div class="btns"><span class="badge">${it.tipe === 'PG' ? 'Pilihan ganda' : 'Uraian (angka)'}</span>
          ${a.ragu ? '<span class="badge amber">Ragu-ragu</span>' : ''}
          ${right === true ? '<span class="badge green">Benar</span>' : right === false ? '<span class="badge red">Salah</span>' : ''}
          ${!following ? '<button class="b sm primary" data-x="follow">📍 Ikuti siswa</button>' : ''}</div></div>
      <div class="card-b">
        <div class="act-time">⏱ Waktu di soal ini: <b id="aQT">${actDur(r.waktuSoal[it.qid])}</b>
          ${a.t ? ` • jawaban terakhir diubah <b id="aAgo" data-t="${a.t}"></b>` : ''}</div>
        <div class="act-q">${U.fmt(it.soal)}</div>
        ${it.gambar ? `<div class="act-img"><img src="${esc(it.gambar)}"></div>` : ''}
        ${body}
      </div></div>
    <div class="stack">
      <div class="card"><div class="card-h"><h3>Jawaban per soal</h3></div>
        <div class="tbl-wrap act-tbl"><table class="t"><thead><tr><th>No</th><th>Jawaban siswa</th><th>Waktu</th>${showK ? '<th>Kunci</th>' : ''}</tr></thead><tbody>
        ${r.items.map((x, i) => {
          const ax = r.answers[x.qid] || {}, t = actAnsText(x, ax), ok = showK ? actIsRight(x, ax, r.score) : null;
          return `<tr data-i="${i}" class="${i === vIdx ? 'view' : ''}"><td>${i + 1}${i === r.index && r.aktif ? ' 📍' : ''}</td>
            <td>${t ? esc(U.shortText(t, 40)) : '<span class="muted">—</span>'}${ax.ragu ? ' <span class="badge amber">ragu</span>' : ''}${ok === true ? ' <span class="badge green">✓</span>' : ok === false ? ' <span class="badge red">✗</span>' : ''}</td>
            <td style="white-space:nowrap" ${i === r.index && r.aktif ? 'id="aRowT"' : ''}>${actDur(r.waktuSoal[x.qid])}</td>${showK ? `<td>${esc(U.shortText(x.tipe === 'PG' ? actOptLabel(x, x.kunci) : x.kunci, 24))}</td>` : ''}</tr>`;
        }).join('')}</tbody></table></div></div>
      <div class="card"><div class="card-h"><h3>Riwayat kegiatan</h3><small class="muted">terbaru di atas</small></div>
        <div class="act-log" id="aLog">${actLogHtml(r)}</div></div>
    </div>
  </div>`;
  const logEl = $('#aLog'), ls = logEl ? logEl.scrollTop : 0;
  el.innerHTML = html;
  if ($('#aLog')) $('#aLog').scrollTop = ls;
  actTick();
}
function actLogHtml(r) {
  const pos = {}; r.items.forEach((x, i) => pos[x.qid] = i);
  const rows = (r.log || []).slice().reverse();
  if (!rows.length) return '<div class="muted" style="padding:12px 16px">Belum ada kegiatan.</div>';
  return rows.map(e => {
    const i = pos[e.q], it = r.items[i], n = i === undefined ? '' : i + 1;
    let a = e.a;
    if (it && (e.j === 'pilih' || e.j === 'ganti')) { const o = it.options.find(x => x.v === a); a = o ? o.k : a; }
    const f = ACT_TXT[e.j];
    const txt = f ? f(n, esc(a ?? '')) : esc(e.j);
    return `<div class="act-li"><time>${new Date(e.t).toLocaleTimeString('id-ID')}</time><span>${txt}</span></div>`;
  }).join('');
}
function actTick() {
  const A = G.A, d = A.d; if (G.page !== 'aktivitas' || !d || !d.res || !$('#aRem')) return;
  const r = d.res, lv = d.live, t = Date.now() + A.off;
  let rem = null, el;
  if (r.aktif) {
    rem = lv.status === 'paused' ? lv.remaining : lv.endsAt - Math.max(t, lv.startAt || 0);
    el = Math.max(0, t - r.startedAt);
    if (lv.status === 'running' && t < lv.startAt) $('#aStat').textContent = 'Hitung mundur di IFP…';
  } else el = (r.finishedAt || t) - r.startedAt;
  $('#aRem').textContent = rem === null ? '—' : U.mmss(rem);
  $('#aRem').classList.toggle('warn', rem !== null && rem < 60000);
  $('#aEl').textContent = U.mmss(Math.max(0, el));
  // waktu di soal yang sedang dibuka siswa bertambah tiap detik
  const vIdx = A.view !== null && A.view < r.items.length ? A.view : r.index;
  if (r.aktif && lv.status === 'running' && t >= (lv.startAt || 0)) {
    const it = r.items[r.index], live = actDur((r.waktuSoal[it.qid] || 0) + (Date.now() - (A.recv || Date.now())));
    if (vIdx === r.index) $('#aQT').textContent = live;
    if ($('#aRowT')) $('#aRowT').textContent = live;
  }
  const ago = $('#aAgo');
  if (ago) { const s = Math.max(0, Math.round((t - +ago.dataset.t) / 1000)); ago.textContent = s < 5 ? 'baru saja' : s < 60 ? s + ' dtk lalu' : Math.floor(s / 60) + ' mnt lalu'; }
}

async function actClick(e) {
  const A = G.A;
  const s = e.target.closest('[data-i]');
  if (s) { const i = +s.dataset.i; A.view = A.d && A.d.res && i === A.d.res.index ? null : i; actRender(); return; }
  const b = e.target.closest('[data-x]'); if (!b) return;
  const x = b.dataset.x;
  if (x === 'follow') { A.view = null; actRender(); return; }
  if (x === 'pause') return act('/api/live/pause', {});
  if (x === 'resume') return act('/api/live/resume', {});
  if (x === 'add1') return act('/api/live/addtime', { menit: 1 }, 'Waktu ditambah 1 menit');
  if (x === 'add5') return act('/api/live/addtime', { menit: 5 }, 'Waktu ditambah 5 menit');
}
