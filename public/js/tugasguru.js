/* =====================================================================
   TUGAS TAMBAHAN
   Siswa dengan nilai di bawah batas mendapat tugas. Nilai paling rendah
   mendapat tugas paling banyak; makin dekat ke batas, makin sedikit.
   Tugas tiap siswa diacak dari Daftar Tugas sehingga berbeda-beda.
   ===================================================================== */
G.T = { tab: 'penugasan', paket: '', q: '', checked: new Set(), open: null, form: null };

function pgTugas(c) {
  const T = G.T;
  if (!G.d.tugasItems) G.d.tugasItems = [];
  if (!G.d.penugasan) G.d.penugasan = [];
  if (T.open && !G.d.penugasan.find(p => p.id === T.open)) T.open = null;
  c.innerHTML = `<div class="tabs mb" id="tgTabs">
      <button data-t="penugasan">📋 Penugasan Siswa</button>
      <button data-t="daftar">📚 Daftar Tugas <span class="badge">${G.d.tugasItems.length}</span></button></div>
    <div id="tgBody"></div>`;
  $$('#tgTabs button').forEach(b => { b.classList.toggle('act', b.dataset.t === T.tab); b.onclick = () => { T.tab = b.dataset.t; T.open = null; pgTugas(c); }; });
  const body = $('#tgBody');
  if (T.tab === 'daftar') tgDaftar(body);
  else if (T.open) tgDetail(body, G.d.penugasan.find(p => p.id === T.open));
  else tgPenugasan(body);
}
const tgPakets = () => [...new Set(G.d.tugasItems.map(t => t.paket || 'Umum'))].sort();

/* ---------------------------------------------------------------- DAFTAR TUGAS */
function tgDaftar(el) {
  const T = G.T, pk = tgPakets(), q = T.q.toLowerCase();
  const list = G.d.tugasItems.filter(t => (!T.paket || t.paket === T.paket) && (!q || (t.judul + ' ' + t.isi).toLowerCase().includes(q)));
  el.innerHTML = `<div class="card">
    <div class="card-h"><h3>Daftar Tugas / Soal Tugas</h3>
      <div class="btns"><button class="b primary" id="tAdd">+ Tambah tugas</button><button class="b" id="tImp">⬆ Impor Excel</button>
        <button class="b" id="tTpl">⬇ Template</button><button class="b" id="tBank">📚 Ambil dari Bank Soal</button></div></div>
    <div class="card-b">
      <p class="muted" style="margin-top:0">Isi daftar ini terlebih dahulu. Saat membuat penugasan, tugas tiap siswa diambil acak dari sini. Kelompokkan dengan <b>Paket</b> (misalnya per materi) agar bisa memilih paket mana yang dipakai.</p>
      <div class="inline mb"><select id="tPk" style="width:220px"><option value="">Semua paket (${G.d.tugasItems.length})</option>${pk.map(p => `<option ${p === T.paket ? 'selected' : ''} value="${esc(p)}">${esc(p)} (${G.d.tugasItems.filter(t => t.paket === p).length})</option>`).join('')}</select>
        <input type="search" id="tQ" placeholder="Cari tugas…" value="${esc(T.q)}" style="flex:1">
        <button class="b danger" id="tDel" ${T.checked.size ? '' : 'disabled'}>Hapus terpilih (${T.checked.size})</button></div>
      ${list.length ? `<div class="tbl-wrap" style="max-height:62vh"><table class="t"><thead><tr><th style="width:30px"><input type="checkbox" id="tAll"></th><th>No</th><th>Paket</th><th>Judul</th><th>Isi tugas</th><th>Kunci (guru)</th><th></th></tr></thead><tbody>
        ${list.map((t, i) => `<tr><td><input type="checkbox" data-ck="${t.id}" ${T.checked.has(t.id) ? 'checked' : ''}></td><td>${i + 1}</td><td><span class="badge blue">${esc(t.paket)}</span></td>
          <td><b>${esc(t.judul)}</b></td><td>${U.fmt(U.shortText(t.isi, 140))}${t.gambar ? ' <span class="badge">🖼 gambar</span>' : ''}</td><td>${esc(U.shortText(t.kunci, 40)) || '<span class="muted">—</span>'}</td>
          <td class="act"><button class="b xs" data-ed="${t.id}">Edit</button> <button class="b xs danger" data-dl="${t.id}">Hapus</button></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="muted" style="padding:20px 0">${G.d.tugasItems.length ? 'Tidak ada tugas yang cocok.' : 'Belum ada tugas. Tambahkan satu per satu, impor dari Excel, atau ambil dari Bank Soal.'}</div>`}
    </div></div>`;
  $('#tAdd').onclick = () => tgEdit({ paket: T.paket || (pk[0] || 'Umum') });
  $('#tTpl').onclick = tgTemplate;
  $('#tImp').onclick = tgImport;
  $('#tBank').onclick = tgFromBank;
  $('#tPk').onchange = e => { T.paket = e.target.value; tgDaftar(el); };
  $('#tQ').oninput = e => { T.q = e.target.value; const p = e.target.selectionStart; tgDaftar(el); const n = $('#tQ'); n.focus(); n.setSelectionRange(p, p); };
  $$('[data-ck]', el).forEach(x => x.onchange = () => { x.checked ? T.checked.add(x.dataset.ck) : T.checked.delete(x.dataset.ck); tgDaftar(el); });
  if ($('#tAll')) $('#tAll').onchange = e => { list.forEach(t => e.target.checked ? T.checked.add(t.id) : T.checked.delete(t.id)); tgDaftar(el); };
  $$('[data-ed]', el).forEach(b => b.onclick = () => tgEdit(G.d.tugasItems.find(t => t.id === b.dataset.ed)));
  $$('[data-dl]', el).forEach(b => b.onclick = async () => { if (await confirmBox('Hapus tugas ini dari daftar? (Tugas yang sudah dibagikan ke siswa tidak berubah.)', { danger: true, ok: 'Hapus' })) act('/api/tugas/delete', { ids: [b.dataset.dl] }, 'Tugas dihapus'); });
  $('#tDel').onclick = async () => { if (await confirmBox(`Hapus <b>${T.checked.size}</b> tugas terpilih?`, { danger: true, ok: 'Hapus' })) { await act('/api/tugas/delete', { ids: [...T.checked] }, 'Tugas dihapus'); T.checked.clear(); } };
}
function tgEdit(t) {
  t = Object.assign({ paket: 'Umum', judul: '', isi: '', kunci: '', gambar: '' }, t);
  let gambar = t.gambar || '';
  const m = modal({
    title: t.id ? 'Edit Tugas' : 'Tambah Tugas', size: 'wide', body: `
    <div class="frow"><div class="field"><label>Paket tugas</label><input type="text" id="gP" list="gPl" value="${esc(t.paket)}" placeholder="contoh: Aritmatika"><datalist id="gPl">${tgPakets().map(p => `<option value="${esc(p)}">`).join('')}</datalist></div>
      <div class="field"><label>Judul singkat</label><input type="text" id="gJ" value="${esc(t.judul)}" placeholder="contoh: Latihan penjumlahan bilangan bulat"></div></div>
    <div class="field"><label>Isi tugas / soal *</label><textarea id="gI" rows="6" placeholder="Tuliskan perintah tugas atau soal. Boleh beberapa baris.">${esc(t.isi)}</textarea>
      <small>Pangkat: <code>x^2</code> • akar: <code>sqrt(25)</code> • tebal: <code>**teks**</code></small></div>
    <div class="field"><label>Kunci / catatan untuk guru (opsional, tidak dilihat siswa)</label><input type="text" id="gK" value="${esc(t.kunci)}"></div>
    <div class="field"><label>Gambar (opsional)</label><div class="imgdrop" id="gImg"></div></div>
    <label style="font-weight:600;font-size:13px">Pratinjau</label><div class="preview-box" id="gPrev"></div>`,
    foot: `${t.id ? '' : '<button class="b" id="gMore">Simpan &amp; tambah lagi</button>'}<button class="b primary" id="gSave">Simpan</button>`
  });
  const prev = () => { $('#gPrev', m).innerHTML = `<b>${esc($('#gJ', m).value)}</b><div style="font-size:15px;margin-top:4px">${U.fmt($('#gI', m).value) || '<span class="muted">Isi tugas…</span>'}</div>${gambar ? `<img src="${esc(gambar)}" style="max-width:100%;max-height:200px;margin-top:8px">` : ''}`; };
  const imgBox = () => {
    $('#gImg', m).innerHTML = gambar ? `<img src="${esc(gambar)}"><button class="b sm danger" type="button" id="gDel">Hapus gambar</button>` : '<button class="b sm" type="button" id="gUp">Unggah gambar</button>';
    if ($('#gUp', m)) $('#gUp', m).onclick = async () => { const f = await pickFile('image/*'); if (!f) return; try { gambar = (await api('/api/upload', { dataUrl: await resizeImage(f) })).url; imgBox(); prev(); } catch (e) { toast(e.message, 'err'); } };
    if ($('#gDel', m)) $('#gDel', m).onclick = () => { gambar = ''; imgBox(); prev(); };
  };
  imgBox(); prev();
  ['#gJ', '#gI'].forEach(s => $(s, m).oninput = prev);
  const save = async more => {
    const item = { id: t.id, paket: $('#gP', m).value, judul: $('#gJ', m).value, isi: $('#gI', m).value, kunci: $('#gK', m).value, gambar };
    const r = await act('/api/tugas/save', { item }, 'Tugas disimpan');
    if (!r) return;
    m.close(); if (more) tgEdit({ paket: item.paket });
  };
  $('#gSave', m).onclick = () => save(false);
  if ($('#gMore', m)) $('#gMore', m).onclick = () => save(true);
}
function tgTemplate() {
  writeXlsx('Template_Daftar_Tugas.xlsx', [
    { name: 'TUGAS', cols: [22, 34, 70, 30], aoa: [['PAKET', 'JUDUL', 'TUGAS', 'KUNCI'],
      ['Aritmatika', 'Penjumlahan bilangan bulat', 'Kerjakan di buku tulis:\na) −15 + 27\nb) 34 + (−48)\nc) −26 + (−19)', 'a) 12  b) −14  c) −45'],
      ['Aritmatika', 'Soal cerita pembagian', 'Ibu membagikan 63 kue sama banyak kepada 9 anak. Berapa kue yang diterima setiap anak? Tuliskan cara pengerjaannya.', '7'],
      ['Aritmatika', 'Membuat soal sendiri', 'Buatlah 5 soal perkalian 2 digit × 1 digit beserta jawabannya.', '']] },
    { name: 'PETUNJUK', cols: [16, 90], aoa: [['KOLOM', 'PETUNJUK'],
      ['PAKET', 'Kelompok tugas, misalnya nama materi. Boleh kosong (otomatis "Umum").'],
      ['JUDUL', 'Judul singkat tugas. Boleh kosong (otomatis dari awal isi tugas).'],
      ['TUGAS', 'Isi/perintah tugas atau soal (wajib). Boleh beberapa baris (Alt+Enter di Excel). Pangkat x^2, akar sqrt(25).'],
      ['KUNCI', 'Opsional. Kunci/catatan untuk guru, tidak ditampilkan ke siswa.'],
      ['', 'Hapus contoh pada sheet TUGAS sebelum mengisi.']] }]);
}
async function tgImport() {
  const f = await pickFile('.xlsx,.xls,.csv'); if (!f) return;
  let rows;
  try {
    rows = (await readSheet(f, 'TUGAS')).map(r => ({ paket: pick(r, ['paket', 'materi', 'kelompok']), judul: pick(r, ['judul', 'nama_tugas']), isi: pick(r, ['tugas', 'isi', 'soal', 'isi_tugas', 'perintah']), kunci: pick(r, ['kunci', 'jawaban', 'catatan']), gambar: pick(r, ['gambar']) }))
      .filter(r => r.isi);
  } catch (e) { return toast('Gagal membaca file: ' + e.message, 'err'); }
  if (!rows.length) return toast('Tidak ada tugas. Pastikan memakai template (kolom TUGAS).', 'err');
  const grp = {}; rows.forEach(r => { const p = r.paket || 'Umum'; grp[p] = (grp[p] || 0) + 1; });
  const m = modal({
    title: 'Impor Daftar Tugas', size: 'wide', body: `<p>Ditemukan <b>${rows.length} tugas</b>: ${Object.entries(grp).map(([p, n]) => `<span class="badge blue">${esc(p)}: ${n}</span>`).join(' ')}</p>
      <div class="tbl-wrap" style="max-height:260px"><table class="t"><thead><tr><th>No</th><th>Paket</th><th>Judul</th><th>Tugas</th></tr></thead><tbody>${rows.slice(0, 100).map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.paket || 'Umum')}</td><td>${esc(r.judul)}</td><td>${esc(U.shortText(r.isi, 90))}</td></tr>`).join('')}</tbody></table></div>
      <div class="mt"><label class="check"><input type="radio" name="tm" value="append" checked> Tambahkan ke daftar yang ada</label><label class="check"><input type="radio" name="tm" value="replace"> Ganti tugas lama pada paket yang sama</label></div>`,
    foot: '<button class="b primary" id="tmGo">Impor sekarang</button>'
  });
  $('#tmGo', m).onclick = async () => {
    const r = await act('/api/tugas/import', { rows, mode: $('input[name=tm]:checked', m).value });
    if (!r) return; m.close();
    if (r.errors.length) modal({ title: `${r.added} tugas masuk, ${r.errors.length} dilewati`, body: `<ul>${r.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`, foot: '' });
    else toast(`${r.added} tugas berhasil diimpor`, 'ok');
  };
}
function tgFromBank() {
  if (!G.d.banks.length) return toast('Bank soal masih kosong', 'err');
  let bank = G.d.banks[0].id, sel = new Set();
  const m = modal({
    title: 'Ambil Soal dari Bank Soal', size: 'xwide', body: `<div class="frow"><div class="field"><label>Bank soal</label><select id="fbB">${G.d.banks.map(b => `<option value="${b.id}">${esc(b.nama)}</option>`).join('')}</select></div>
      <div class="field"><label>Tingkat</label><select id="fbL"><option value="">Semua</option><option>Mudah</option><option>Sedang</option><option>Sukar</option></select></div>
      <div class="field"><label>Masukkan ke paket tugas</label><input type="text" id="fbP" list="fbPl" placeholder="contoh: Remedial Aritmatika"><datalist id="fbPl">${tgPakets().map(p => `<option value="${esc(p)}">`).join('')}</datalist></div></div>
      <div class="inline mb"><button class="b sm" id="fbAll">Pilih semua yang tampil</button><button class="b sm" id="fbNone">Kosongkan pilihan</button><span class="muted" id="fbN"></span></div>
      <div class="tbl-wrap" style="max-height:50vh" id="fbList"></div>`,
    foot: '<button class="b primary" id="fbGo">Tambahkan ke Daftar Tugas</button>'
  });
  const shown = () => G.d.questions.filter(q => q.bankId === bank && (!$('#fbL', m).value || q.level === $('#fbL', m).value));
  const draw = () => {
    $('#fbList', m).innerHTML = `<table class="t"><thead><tr><th></th><th>No</th><th>Tipe</th><th>Tingkat</th><th>Soal</th><th>Kunci</th></tr></thead><tbody>${shown().map((q, i) => `<tr><td><input type="checkbox" data-q="${q.id}" ${sel.has(q.id) ? 'checked' : ''}></td><td>${i + 1}</td><td>${q.tipe}</td><td>${esc(q.level || '')}</td><td>${U.fmt(U.shortText(q.soal, 120))}</td><td>${esc(q.kunci)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Tidak ada soal.</td></tr>'}</tbody></table>`;
    $$('[data-q]', m).forEach(x => x.onchange = () => { x.checked ? sel.add(x.dataset.q) : sel.delete(x.dataset.q); $('#fbN', m).textContent = sel.size + ' soal dipilih'; });
    $('#fbN', m).textContent = sel.size + ' soal dipilih';
  };
  $('#fbB', m).onchange = e => { bank = e.target.value; draw(); };
  $('#fbL', m).onchange = draw;
  $('#fbAll', m).onclick = () => { shown().forEach(q => sel.add(q.id)); draw(); };
  $('#fbNone', m).onclick = () => { sel.clear(); draw(); };
  $('#fbP', m).value = G.T.paket || (findBank(bank) || {}).nama || '';
  $('#fbGo', m).onclick = async () => {
    if (!sel.size) return toast('Pilih soal terlebih dahulu', 'err');
    const r = await act('/api/tugas/frombank', { qids: [...sel], paket: $('#fbP', m).value }, '');
    if (r) { toast(`${r.added} soal masuk ke Daftar Tugas`, 'ok'); m.close(); }
  };
  draw();
}

/* ---------------------------------------------------------------- PENUGASAN */
function tgPenugasan(el) {
  const T = G.T, d = G.d;
  const ex0 = findEx(d.live.examId) || d.exams[0];
  const F = T.form = Object.assign({ examId: ex0 ? ex0.id : '', kelas: '', batas: '', min: 1, max: 5, paket: [], belum: false, nama: '', tenggat: '', petunjuk: '' }, T.form || {});
  const ex = findEx(F.examId);
  const kkm = ex ? kkmOf(ex) : 75;
  const pk = tgPakets();
  el.innerHTML = `<div class="grid2" style="align-items:start">
    <div class="card"><div class="card-h"><h3>Buat Tugas Tambahan</h3></div><div class="card-b">
      ${!d.tugasItems.length ? `<div class="note mb" style="background:var(--amber-l);padding:10px 12px;border-radius:6px">Daftar Tugas masih kosong. <a href="#" id="toDaftar">Isi Daftar Tugas dulu</a>.</div>` : ''}
      <div class="frow"><div class="field"><label>Ujian</label><select id="fEx">${d.exams.map(e => `<option value="${e.id}" ${e.id === F.examId ? 'selected' : ''}>${esc(e.nama)}</option>`).join('')}</select></div>
        <div class="field"><label>Kelas</label><select id="fKl"><option value="">Semua kelas</option>${[...new Set((ex ? participants(ex) : []).map(s => s.kelas))].map(k => `<option ${k === F.kelas ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div></div>
      <div class="frow"><div class="field"><label>Batas nilai (di bawah ini dapat tugas)</label><input type="number" id="fBt" value="${esc(F.batas)}" placeholder="KKM ujian: ${kkm}"></div>
        <div class="field"><label>Tugas paling sedikit</label><input type="number" id="fMn" min="1" value="${esc(F.min)}"></div>
        <div class="field"><label>Tugas paling banyak</label><input type="number" id="fMx" min="1" value="${esc(F.max)}"></div></div>
      <div class="field"><label>Paket tugas yang dipakai</label><div class="btns" id="fPk">${pk.length ? pk.map(p => `<label class="check" style="margin:0 10px 0 0"><input type="checkbox" value="${esc(p)}" ${!F.paket.length || F.paket.includes(p) ? 'checked' : ''}> ${esc(p)} <span class="muted">(${d.tugasItems.filter(t => t.paket === p).length})</span></label>`).join('') : '<span class="muted">—</span>'}</div></div>
      <label class="check"><input type="checkbox" id="fBl" ${F.belum ? 'checked' : ''}> Sertakan siswa yang <b>belum ujian</b> (mendapat jumlah tugas paling banyak)</label>
      <div class="frow"><div class="field"><label>Nama penugasan (opsional)</label><input type="text" id="fNm" value="${esc(F.nama)}" placeholder="Tugas Tambahan — ${esc(ex ? ex.nama : '')}"></div>
        <div class="field"><label>Batas pengumpulan (opsional)</label><input type="text" id="fTg" value="${esc(F.tenggat)}" placeholder="contoh: Senin, 7 Desember 2026"></div></div>
      <div class="field"><label>Petunjuk untuk siswa (opsional)</label><textarea id="fPt" rows="2" placeholder="contoh: Kerjakan di buku tulis, kumpulkan ke guru.">${esc(F.petunjuk)}</textarea></div>
      <div class="note" id="fInfo" style="background:#f6f8fb;padding:10px 12px;border-radius:6px"></div>
      <div class="btns mt"><button class="b primary lg" id="fGo">Lihat rencana pembagian →</button></div>
    </div></div>
    <div class="card"><div class="card-h"><h3>Penugasan tersimpan</h3><a class="b sm" href="/tugas" target="_blank">Halaman siswa ↗</a></div><div class="card-b">
      ${d.penugasan.length ? d.penugasan.slice().sort((a, b) => b.dibuat - a.dibuat).map(p => {
        const tot = p.siswa.reduce((a, x) => a + x.taskIds.length, 0), sel = p.siswa.reduce((a, x) => a + x.taskIds.filter(t => (x.selesai || {})[t]).length, 0);
        return `<div class="tg-item"><div style="flex:1"><b>${esc(p.nama)}</b><div class="muted">${esc(p.examNama || '')} • batas ${U.num(p.batas)} • ${p.siswa.length} siswa • ${U.tgl(p.dibuat)}</div>
          <div class="bar" style="height:6px;margin-top:6px"><i style="width:${tot ? 100 * sel / tot : 0}%;background:var(--green)"></i></div><small class="muted">${sel}/${tot} tugas selesai</small></div>
          <div class="btns" style="flex-direction:column;align-items:stretch">${p.tampil ? '<span class="badge green">Tampil di halaman siswa</span>' : '<span class="badge">Belum ditampilkan</span>'}<button class="b sm primary" data-open="${p.id}">Buka</button></div></div>`;
      }).join('') : '<p class="muted" style="margin:0">Belum ada penugasan.</p>'}
    </div></div></div>`;
  const read = () => Object.assign(F, { examId: $('#fEx').value, kelas: $('#fKl').value, batas: $('#fBt').value, min: +$('#fMn').value || 1, max: +$('#fMx').value || 1, belum: $('#fBl').checked, nama: $('#fNm').value, tenggat: $('#fTg').value, petunjuk: $('#fPt').value, paket: $$('#fPk input:checked').map(i => i.value) });
  const info = () => {
    let below = 0, done = 0, belum = 0; const b = F.batas === '' ? kkm : +F.batas;
    if (ex) { const lm = latestMap(ex.id); participants(ex).forEach(s => { if (F.kelas && s.kelas !== F.kelas) return; const r = lm[s.id]; if (r) { done++; if (r.score.nilai < b) below++; } else belum++; }); }
    $('#fInfo').innerHTML = `Saat ini: <b>${done}</b> siswa sudah ujian, <b>${below}</b> siswa nilainya di bawah <b>${U.num(b)}</b>${F.belum && belum ? ` (+ <b>${belum}</b> belum ujian)` : ''}.
      Nilai paling rendah mendapat <b>${esc(F.max)}</b> tugas, yang paling dekat ke batas mendapat <b>${esc(F.min)}</b> tugas.`;
  };
  ['#fEx', '#fKl'].forEach(s => $(s).onchange = () => { read(); if (s === '#fEx') F.kelas = ''; tgPenugasan(el); });
  ['#fBt', '#fMn', '#fMx', '#fBl'].forEach(s => $(s).addEventListener('input', () => { read(); info(); }));
  info();
  $$('#fPk input').forEach(i => i.onchange = read);
  if ($('#toDaftar')) $('#toDaftar').onclick = e => { e.preventDefault(); T.tab = 'daftar'; render(); };
  $('#fGo').onclick = () => { read(); if (pk.length && !F.paket.length) return toast('Pilih minimal satu paket tugas', 'err'); tgPreview(); };
  $$('[data-open]', el).forEach(b => b.onclick = () => { T.open = b.dataset.open; render(); });
}
async function tgPreview() {
  const F = G.T.form;
  let plan;
  try { plan = (await api('/api/penugasan/buat', F)).plan; } catch (e) { if (e.message !== 'AUTH') toast(e.message, 'err'); return; }
  const m = modal({
    title: 'Rencana Pembagian Tugas', size: 'xwide', body: `<p style="margin-top:0"><b>${plan.siswa.length} siswa</b> di bawah nilai <b>${U.num(plan.batas)}</b> • ${plan.min}–${plan.max} tugas per siswa • diambil dari ${Object.keys(plan.tugas).length} tugas berbeda.</p>
      <div class="tbl-wrap" style="max-height:55vh"><table class="t"><thead><tr><th>No</th><th>Nama</th><th>Kelas</th><th class="c">Nilai</th><th class="c">Jumlah tugas</th><th>Tugas yang didapat</th></tr></thead><tbody>
      ${plan.siswa.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.nama)}</td><td>${esc(x.kelas)}</td><td class="c">${x.nilai === null ? '<span class="badge amber">belum ujian</span>' : `<span class="badge red">${U.num(x.nilai)}</span>`}</td><td class="c"><b>${x.jumlah}</b></td>
        <td>${x.taskIds.map(t => `<span class="badge blue" style="margin:1px">${esc(U.shortText(plan.tugas[t].judul, 34))}</span>`).join(' ')}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted">Belum tersimpan. Tekan <b>Acak lagi</b> untuk susunan tugas lain, atau <b>Simpan</b> untuk membagikan.</p>`,
    foot: '<button class="b" id="pvAgain">🎲 Acak lagi</button><button class="b primary" id="pvSave">Simpan penugasan</button>'
  });
  $('#pvAgain', m).onclick = () => { m.close(); tgPreview(); };
  $('#pvSave', m).onclick = async () => {
    const r = await act('/api/penugasan/simpan', { plan }, 'Penugasan disimpan');
    if (r) { m.close(); G.T.open = r.id; G.T.form = null; render(); }
  };
}

/* ---------------------------------------------------------------- DETAIL */
function tgDetail(el, p) {
  const tg = p.tugas || {};
  const tot = p.siswa.reduce((a, x) => a + x.taskIds.length, 0), sel = p.siswa.reduce((a, x) => a + x.taskIds.filter(t => (x.selesai || {})[t]).length, 0);
  el.innerHTML = `<div class="btns mb"><button class="b" id="dBack">← Kembali</button></div>
    <div class="card mb"><div class="card-h"><h3>${esc(p.nama)}</h3>
      <div class="btns"><label class="check" style="margin:0"><input type="checkbox" id="dShow" ${p.tampil ? 'checked' : ''}> <b>Tampilkan di halaman siswa</b> (/tugas)</label></div></div>
      <div class="card-b"><div class="kv" style="grid-template-columns:repeat(5,1fr);margin-top:0">
        <div><small>Ujian</small><b style="font-size:14px">${esc(p.examNama || '-')}</b></div><div><small>Batas nilai</small><b>${U.num(p.batas)}</b></div>
        <div><small>Siswa</small><b>${p.siswa.length}</b></div><div><small>Tugas / siswa</small><b>${p.min}–${p.max}</b></div><div><small>Selesai</small><b>${sel}/${tot}</b></div></div>
        <div class="frow"><div class="field"><label>Nama</label><input type="text" id="dNm" value="${esc(p.nama)}"></div><div class="field"><label>Batas pengumpulan</label><input type="text" id="dTg" value="${esc(p.tenggat || '')}"></div></div>
        <div class="field"><label>Petunjuk untuk siswa</label><textarea id="dPt" rows="2">${esc(p.petunjuk || '')}</textarea></div>
        <div class="btns"><button class="b" id="dInfo">Simpan keterangan</button><span style="flex:1"></span>
          <button class="b primary" id="dPrint">🖨 Cetak lembar tugas (per siswa)</button><button class="b" id="dKey">🖨 Cetak daftar + kunci (guru)</button>
          <button class="b" id="dXls">⬇ Ekspor Excel</button><button class="b danger" id="dDel">Hapus</button></div></div></div>
    <div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>No</th><th>Nama</th><th class="c">Nilai ujian</th><th>Tugas (centang jika selesai)</th><th style="width:110px">Nilai tugas</th><th style="width:170px">Catatan</th><th></th></tr></thead><tbody>
      ${p.siswa.map((x, i) => {
        const dn = x.taskIds.filter(t => (x.selesai || {})[t]).length;
        return `<tr><td>${i + 1}</td><td><b>${esc(x.nama)}</b><div class="muted">${esc(x.kelas)}</div></td>
          <td class="c">${x.nilai === null ? '<span class="badge amber">belum</span>' : `<span class="badge red">${U.num(x.nilai)}</span>`}</td>
          <td>${x.taskIds.map((t, j) => `<label class="tg-task"><input type="checkbox" data-done="${x.studentId}|${t}" ${(x.selesai || {})[t] ? 'checked' : ''}> ${j + 1}. ${esc(U.shortText((tg[t] || {}).judul || '(tugas dihapus)', 60))}</label>`).join('')}
            <div class="muted" style="margin-top:4px">${dn}/${x.taskIds.length} selesai ${dn < x.taskIds.length ? `• <a href="#" data-all="${x.studentId}">tandai semua</a>` : '✔'}</div></td>
          <td><input type="text" data-nt="${x.studentId}" value="${esc(x.nilaiTugas || '')}" placeholder="—"></td>
          <td><input type="text" data-ct="${x.studentId}" value="${esc(x.catatan || '')}" placeholder="—"></td>
          <td class="act"><button class="b xs" data-pr="${x.studentId}">🖨</button> <button class="b xs" data-re="${x.studentId}" title="Acak ulang tugas siswa ini">🎲</button></td></tr>`;
      }).join('')}</tbody></table></div></div>`;
  const keep = async (path, body, msg) => { const r = await act(path, Object.assign({ id: p.id }, body), msg); return r; };
  $('#dBack').onclick = () => { G.T.open = null; render(); };
  $('#dShow').onchange = e => keep('/api/penugasan/tampil', { tampil: e.target.checked }, e.target.checked ? 'Tugas tampil di halaman siswa' : 'Tugas disembunyikan dari siswa');
  $('#dInfo').onclick = () => keep('/api/penugasan/info', { nama: $('#dNm').value, tenggat: $('#dTg').value, petunjuk: $('#dPt').value }, 'Keterangan disimpan');
  $('#dDel').onclick = async () => { if (await confirmBox(`Hapus penugasan <b>${esc(p.nama)}</b>? Daftar Tugas tidak ikut terhapus.`, { danger: true, ok: 'Hapus' })) { await keep('/api/penugasan/delete', {}, 'Penugasan dihapus'); G.T.open = null; render(); } };
  $('#dPrint').onclick = () => tgPrint(p, p.siswa, false);
  $('#dKey').onclick = () => tgPrintKey(p);
  $('#dXls').onclick = () => tgExport(p);
  $$('[data-done]', el).forEach(b => b.onchange = () => { const [sid, t] = b.dataset.done.split('|'); keep('/api/penugasan/update', { studentId: sid, taskId: t, selesai: b.checked }); });
  $$('[data-all]', el).forEach(b => b.onclick = e => { e.preventDefault(); keep('/api/penugasan/update', { studentId: b.dataset.all, semua: true }, 'Semua tugas ditandai selesai'); });
  $$('[data-nt]', el).forEach(b => b.onchange = () => keep('/api/penugasan/update', { studentId: b.dataset.nt, nilaiTugas: b.value }, 'Nilai tugas disimpan'));
  $$('[data-ct]', el).forEach(b => b.onchange = () => keep('/api/penugasan/update', { studentId: b.dataset.ct, catatan: b.value }, 'Catatan disimpan'));
  $$('[data-pr]', el).forEach(b => b.onclick = () => tgPrint(p, p.siswa.filter(x => x.studentId === b.dataset.pr), false));
  $$('[data-re]', el).forEach(b => b.onclick = async () => { if (await confirmBox('Acak ulang tugas siswa ini? Jumlah tugas tetap, tanda selesai dikosongkan.', { ok: 'Acak ulang' })) keep('/api/penugasan/acakulang', { studentId: b.dataset.re }, 'Tugas siswa diacak ulang'); });
}
function tgPrint(p, rows) {
  const tg = p.tugas || {}, s = G.d.settings;
  if (!rows.length) return toast('Tidak ada data', 'err');
  doPrint(rows.map(x => `<div class="p-page">${kop()}<div class="p-title">Lembar Tugas Tambahan</div><div class="p-sub">${esc(p.nama)}</div>
    <table class="p-info"><tr><td>Nama</td><td>: <b>${esc(x.nama)}</b></td><td style="padding-left:30px">Mata Pelajaran</td><td>: ${esc(s.mapel)}</td></tr>
      <tr><td>Kelas / NIS</td><td>: ${esc(x.kelas)} / ${esc(x.nis || '-')}</td><td style="padding-left:30px">Jumlah tugas</td><td>: ${x.taskIds.length}</td></tr>
      ${p.tenggat ? `<tr><td>Dikumpulkan</td><td colspan="3">: <b>${esc(p.tenggat)}</b></td></tr>` : ''}</table>
    ${p.petunjuk ? `<p style="margin:8px 0"><b>Petunjuk:</b> ${U.fmt(p.petunjuk)}</p>` : ''}
    <table class="p-t"><thead><tr><th style="width:34px">No</th><th>Tugas</th><th style="width:70px">Paraf</th></tr></thead><tbody>
    ${x.taskIds.map((t, i) => { const k = tg[t] || {}; return `<tr><td class="c">${i + 1}</td><td><b>${esc(k.judul || '')}</b><br>${U.fmt(k.isi || '')}${k.gambar ? `<br><img src="${esc(k.gambar)}" style="max-height:150px">` : ''}</td><td></td></tr>`; }).join('')}</tbody></table>${ttd()}</div>`).join(''));
}
function tgPrintKey(p) {
  const tg = p.tugas || {};
  doPrint(`<div class="p-page">${kop()}<div class="p-title">Daftar Tugas Tambahan (Pegangan Guru)</div><div class="p-sub">${esc(p.nama)} — batas nilai ${U.num(p.batas)}</div>
    <table class="p-t"><thead><tr><th>No</th><th>Nama</th><th>Kelas</th><th>Nilai</th><th>Tugas</th><th>Selesai</th><th>Nilai tugas</th></tr></thead><tbody>
    ${p.siswa.map((x, i) => `<tr><td class="c">${i + 1}</td><td>${esc(x.nama)}</td><td>${esc(x.kelas)}</td><td class="c">${x.nilai === null ? '-' : U.num(x.nilai)}</td>
      <td>${x.taskIds.map((t, j) => `${j + 1}. ${esc((tg[t] || {}).judul || '')}`).join('<br>')}</td><td class="c">${x.taskIds.filter(t => (x.selesai || {})[t]).length}/${x.taskIds.length}</td><td class="c">${esc(x.nilaiTugas || '')}</td></tr>`).join('')}</tbody></table>
    <div class="p-title" style="margin-top:18px">Kunci / Catatan Tugas</div>
    <table class="p-t"><thead><tr><th>Tugas</th><th>Kunci / catatan</th><th>Dipakai</th></tr></thead><tbody>
    ${Object.entries(tg).map(([t, k]) => `<tr><td><b>${esc(k.judul)}</b><br>${U.fmt(k.isi)}</td><td>${U.fmt(k.kunci || '-')}</td><td class="c">${p.siswa.filter(x => x.taskIds.includes(t)).length} siswa</td></tr>`).join('')}</tbody></table>${ttd()}</div>`);
}
function tgExport(p) {
  const tg = p.tugas || {};
  writeXlsx(safeName(p.nama) + '.xlsx', [
    { name: 'REKAP', cols: [5, 30, 8, 12, 11, 12, 10, 12, 24, 60], aoa: [['No', 'Nama', 'Kelas', 'NIS', 'Nilai Ujian', 'Jumlah Tugas', 'Selesai', 'Nilai Tugas', 'Catatan', 'Daftar Tugas'],
      ...p.siswa.map((x, i) => [i + 1, x.nama, x.kelas, x.nis || '', x.nilai === null ? 'belum ujian' : x.nilai, x.taskIds.length, x.taskIds.filter(t => (x.selesai || {})[t]).length, x.nilaiTugas || '', x.catatan || '', x.taskIds.map((t, j) => `${j + 1}. ${(tg[t] || {}).judul || ''}`).join('\n')])] },
    { name: 'TUGAS PER SISWA', cols: [30, 8, 5, 34, 70, 30, 9], aoa: [['Nama', 'Kelas', 'No', 'Judul', 'Tugas', 'Kunci', 'Selesai'],
      ...p.siswa.flatMap(x => x.taskIds.map((t, j) => [x.nama, x.kelas, j + 1, (tg[t] || {}).judul || '', (tg[t] || {}).isi || '', (tg[t] || {}).kunci || '', (x.selesai || {})[t] ? 'Ya' : 'Belum']))] },
    { name: 'INFO', cols: [22, 60], aoa: [['Nama penugasan', p.nama], ['Ujian', p.examNama || ''], ['Batas nilai', p.batas], ['Tugas per siswa', `${p.min} - ${p.max}`], ['Batas pengumpulan', p.tenggat || ''], ['Petunjuk', p.petunjuk || ''], ['Dibuat', U.tgl(p.dibuat)]] }]);
}
