/* Halaman siswa: ketik nama -> lihat tugas tambahan -> unduh PDF */
const $ = q => document.querySelector(q);
const T = { d: null, pick: null, q: '', kelas: null };   // pick = {pid, sid}

async function load() {
  try {
    const r = await fetch('/api/tugas-siswa', { cache: 'no-store' });
    T.d = await r.json();
  } catch (e) { $('#app').innerHTML = '<div class="card empty">Tidak dapat terhubung ke server. Coba muat ulang halaman.</div>'; return; }
  const d = T.d;
  $('#sk').textContent = [d.sekolah, d.mapel].filter(Boolean).join(' • ');
  if (d.logo && !$('#hd img')) $('#hd').firstElementChild.outerHTML = `<img src="${U.esc(d.logo)}" alt="">`;
  draw();
}
/* semua siswa dari semua penugasan yang ditampilkan */
function allEntries() {
  const out = [];
  (T.d.paket || []).forEach(p => p.siswa.forEach(s => out.push({ p, s })));
  return out;
}
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function search(q) {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return [];
  return allEntries().filter(({ s }) => { const n = norm(s.nama); return words.every(w => n.includes(w)); })
    .sort((a, b) => a.s.nama.localeCompare(b.s.nama));
}

function draw() {
  const d = T.d, app = $('#app');
  if (!d.paket || !d.paket.length) { app.innerHTML = '<div class="card empty">🎉 Belum ada tugas tambahan yang dibagikan.</div>'; return; }
  if (T.pick) return drawTasks();
  const kelas = [...new Set(allEntries().map(e => e.s.kelas || '-'))].sort();
  app.innerHTML = `<div class="card"><h2>🔍 Ketik namamu</h2>
      <input class="big" id="q" placeholder="contoh: Andi" autocomplete="off" value="${U.esc(T.q)}">
      <div id="res"></div>
      <details ${T.kelas ? 'open' : ''}><summary>atau cari lewat kelas</summary>
        <div class="sel" style="margin-top:8px">${kelas.map(k => `<button data-k="${U.esc(k)}" class="${k === T.kelas ? 'on' : ''}">Kelas ${U.esc(k)}</button>`).join('')}</div>
        <div id="kl"></div></details></div>`;
  const q = $('#q');
  q.oninput = () => { T.q = q.value; drawResults(); };
  app.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { T.kelas = T.kelas === b.dataset.k ? null : b.dataset.k; draw(); });
  drawResults(); drawKelas();
  if (!T.kelas) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}
function entryBtn({ p, s }) {
  return `<button class="pill" data-pid="${p.id}" data-sid="${s.sid}"><div>${U.esc(s.nama)}<small>Kelas ${U.esc(s.kelas || '-')}${T.d.paket.length > 1 ? ' • ' + U.esc(p.nama) : ''}</small></div><span>${s.tugas.length} tugas</span></button>`;
}
function bindPick(el) { el.querySelectorAll('[data-sid]').forEach(b => b.onclick = () => { T.pick = { pid: b.dataset.pid, sid: b.dataset.sid }; draw(); window.scrollTo(0, 0); }); }
function drawResults() {
  const el = $('#res'); if (!el) return;
  const q = norm(T.q);
  if (q.length < 2) { el.innerHTML = '<p class="hint">Ketik minimal 2 huruf dari namamu, lalu ketuk namamu.</p>'; return; }
  const list = search(T.q);
  el.innerHTML = list.length ? `<div class="res">${list.slice(0, 30).map(entryBtn).join('')}</div>`
    : `<p class="hint">Nama "<b>${U.esc(T.q)}</b>" tidak ada di daftar tugas tambahan. Periksa ejaannya. Jika tetap tidak ada, berarti kamu tidak mendapat tugas tambahan. 👍</p>`;
  bindPick(el);
}
function drawKelas() {
  const el = $('#kl'); if (!el || !T.kelas) return;
  const list = allEntries().filter(e => (e.s.kelas || '-') === T.kelas).sort((a, b) => a.s.nama.localeCompare(b.s.nama));
  el.innerHTML = `<div class="res">${list.map(entryBtn).join('')}</div>`;
  bindPick(el);
}
function current() {
  const p = (T.d.paket || []).find(x => x.id === T.pick.pid);
  const s = p && p.siswa.find(x => x.sid === T.pick.sid);
  return p && s ? { p, s } : null;
}
function drawTasks() {
  const c = current();
  if (!c) { T.pick = null; return draw(); }
  const { p, s } = c, done = s.tugas.filter(t => t.selesai).length;
  $('#app').innerHTML = `<div class="acts"><button class="btn" id="bk">← Cari nama lain</button><button class="btn pdf" id="pdf">⬇ Unduh PDF</button></div>
    <div class="card"><h2>👋 Halo, ${U.esc(s.nama)}!</h2>
      <div class="info">Kelas <b>${U.esc(s.kelas || '-')}</b> • kamu mendapat <b>${s.tugas.length} tugas</b>${done ? `, <b>${done}</b> sudah ditandai selesai oleh guru` : ''}.
        ${p.tenggat ? `<br>📅 Dikumpulkan: <b>${U.esc(p.tenggat)}</b>` : ''}${p.petunjuk ? `<br>📌 ${U.fmt(p.petunjuk)}` : ''}</div>
      ${s.tugas.map((t, i) => `<div class="task ${t.selesai ? 'done' : ''}"><div class="no">${t.selesai ? '✓' : i + 1}</div><div style="flex:1"><b>${U.esc(t.judul)}</b>${t.selesai ? '<span class="tag">Selesai</span>' : ''}
        <div class="isi">${U.fmt(t.isi)}</div>${t.gambar ? `<img src="${U.esc(t.gambar)}" alt="">` : ''}</div></div>`).join('')}
      <p class="muted" style="margin-bottom:0">${U.esc(p.nama)}</p></div>`;
  $('#bk').onclick = () => { T.pick = null; draw(); };
  $('#pdf').onclick = async () => {
    const b = $('#pdf'); b.disabled = true; b.textContent = 'Membuat PDF…';
    try { await makePdf(p, s); } catch (e) { alert('PDF gagal dibuat: ' + e.message); }
    b.disabled = false; b.textContent = '⬇ Unduh PDF';
  };
}

/* ---------- PDF (dibuat di HP/IFP, tanpa internet) ---------- */
function pdfText(s) {
  // ubah penulisan soal ke teks biasa yang pasti tercetak dengan huruf standar PDF
  return String(s || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\^\{([^}]+)\}/g, (m, x) => /^[0-9a-z]+$/i.test(x) ? '^' + x : '^(' + x + ')')
    .replace(/_\{([^}]+)\}/g, '_$1')
    .replace(/sqrt\(([^()]*)\)/g, 'akar($1)')
    .replace(/²/g, '^2').replace(/³/g, '^3').replace(/¹/g, '^1').replace(/[⁰⁴⁵⁶⁷⁸⁹]/g, c => '^' + '0456789'.charAt('⁰⁴⁵⁶⁷⁸⁹'.indexOf(c)))
    .replace(/[−–—]/g, '-').replace(/√/g, 'akar').replace(/π/g, 'pi').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=').replace(/≈/g, '~')
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/•/g, '-')
    .replace(/[^\x00-\x7E\n×÷°±éèáàíóúñÉÁ]/g, '');   // huruf di luar standar PDF dibuang (misalnya emoji)
}
function loadImage(src) {
  return new Promise(res => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
        const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0);
        res({ data: cv.toDataURL('image/jpeg', 0.85), w: im.naturalWidth, h: im.naturalHeight });
      } catch (e) { res(null); }
    };
    im.onerror = () => res(null);
    im.src = src;
  });
}
async function makePdf(p, s) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 18, R = 192, W = R - L, BOTTOM = 280;
  let y = 18;
  const need = h => { if (y + h > BOTTOM) { doc.addPage(); y = 18; } };
  const write = (txt, size, style = 'normal', x = L, width = W, gap = 0.5) => {
    doc.setFont('helvetica', style); doc.setFontSize(size);
    const lines = doc.splitTextToSize(pdfText(txt), width), lh = size * 0.42;
    lines.forEach(ln => { need(lh); doc.text(ln, x, y + lh * 0.8); y += lh; });
    y += gap;
  };
  const logo = T.d.logo ? await loadImage(T.d.logo) : null;
  if (logo) { doc.addImage(logo.data, 'JPEG', L, y - 2, 16, 16 * logo.h / logo.w); }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(pdfText(T.d.sekolah || ''), 105, y + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.text(pdfText(T.d.mapel || ''), 105, y + 10, { align: 'center' });
  y += 16; doc.setLineWidth(0.6); doc.line(L, y, R, y); doc.setLineWidth(0.2); doc.line(L, y + 1, R, y + 1); y += 7;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('LEMBAR TUGAS TAMBAHAN', 105, y, { align: 'center' }); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.splitTextToSize(pdfText(p.nama), W).forEach(ln => { doc.text(ln, 105, y, { align: 'center' }); y += 4.6; });
  y += 4;
  const row = (a, b) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.text(a, L, y); doc.text(': ' + pdfText(b), L + 32, y); y += 6; };
  row('Nama', s.nama); row('Kelas', s.kelas || '-'); row('Jumlah tugas', String(s.tugas.length));
  if (p.tenggat) row('Dikumpulkan', p.tenggat);
  if (p.petunjuk) { y += 1; write('Petunjuk: ' + p.petunjuk, 11, 'italic'); }
  y += 3;
  for (let i = 0; i < s.tugas.length; i++) {
    const t = s.tugas[i];
    need(16);
    const top = y;
    doc.setFillColor(255, 140, 66); doc.circle(L + 4, y + 3.6, 3.6, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text(String(i + 1), L + 4, y + 5, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    write(t.judul + (t.selesai ? '  (sudah selesai)' : ''), 12, 'bold', L + 11, W - 11, 0.8);
    write(t.isi, 11, 'normal', L + 11, W - 11, 1.5);
    if (t.gambar) {
      const im = await loadImage(t.gambar);
      if (im) {
        let w = Math.min(W - 11, 120), h = w * im.h / im.w;
        if (h > 90) { h = 90; w = h * im.w / im.h; }
        need(h + 3); doc.addImage(im.data, 'JPEG', L + 11, y, w, h); y += h + 3;
      }
    }
    if (y > top) { doc.setDrawColor(210, 225, 240); doc.line(L, y + 1.5, R, y + 1.5); doc.setDrawColor(0, 0, 0); }
    y += 5;
  }
  need(30); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text('Paraf guru:', 140, y); doc.text('(.............................)', 140, y + 22);
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8.5); doc.setTextColor(120); doc.text(`${pdfText(s.nama)} - halaman ${i} dari ${n}`, 105, 290, { align: 'center' }); doc.setTextColor(0); }
  doc.save(('Tugas_Tambahan_' + s.nama).replace(/[^\w-]+/g, '_') + '.pdf');
}

load();
setInterval(() => { if (!T.pick && !T.q) load(); }, 60000);
