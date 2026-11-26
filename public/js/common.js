/* Fungsi bersama untuk halaman guru & IFP */
const U = {
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  /* Format teks soal: x^2, x^{10}, a_1, sqrt(x), **tebal**, baris baru */
  fmt(s) {
    let t = U.esc(s);
    t = t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    t = t.replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>').replace(/\^(-?[0-9a-zA-Z]+)/g, '<sup>$1</sup>');
    t = t.replace(/_\{([^}]+)\}/g, '<sub>$1</sub>');
    t = t.replace(/sqrt\(([^()]*)\)/g, '√<span style="text-decoration:overline">$1</span>');
    t = t.replace(/\n/g, '<br>');
    return t;
  },
  shortText(s, n = 110) {
    s = String(s || '').replace(/\s+/g, ' ');
    return s.length > n ? s.slice(0, n) + '…' : s;
  },
  mmss(ms) {
    ms = Math.max(0, ms);
    const s = Math.ceil(ms / 1000), m = Math.floor(s / 60), r = s % 60;
    return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  },
  durasi(ms) {
    if (!ms || ms < 0) return '-';
    const s = Math.round(ms / 1000), m = Math.floor(s / 60);
    return m + ' mnt ' + (s % 60) + ' dtk';
  },
  tgl(ms, jam = true) {
    if (!ms) return '-';
    const d = new Date(ms);
    const opt = { day: '2-digit', month: 'short', year: 'numeric' };
    if (jam) Object.assign(opt, { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleString('id-ID', opt);
  },
  tglPanjang(d = new Date()) {
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  },
  num(n, d = 1) {
    if (n === null || n === undefined || isNaN(n)) return '-';
    const r = Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
    return String(r).replace('.', ',');
  },
  predikat(n) {
    if (n >= 90) return 'A';
    if (n >= 80) return 'B';
    if (n >= 70) return 'C';
    return 'D';
  },
  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  initials(n) { return String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase(); },
};

/* Suara sederhana (tanpa file audio) */
const Sfx = {
  ctx: null, on: true,
  unlock() { try { this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume(); } catch (e) { } },
  tone(f, d = 0.12, type = 'sine', vol = 0.18, delay = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + d + 0.05);
  },
  click() { this.tone(660, 0.07, 'triangle', 0.12); },
  pop() { this.tone(520, 0.06, 'sine', 0.15); this.tone(880, 0.08, 'sine', 0.12, 0.05); },
  beep() { this.tone(740, 0.18, 'square', 0.08); },
  go() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.16, i * 0.09)); },
  warn() { this.tone(440, 0.15, 'sawtooth', 0.06); this.tone(440, 0.15, 'sawtooth', 0.06, 0.25); },
  win() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.16, i * 0.12)); },
  tick() { this.tone(700 + Math.random() * 500, 0.04, 'square', 0.05); },
  soft() { [392, 523, 659].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.14, i * 0.15)); },
};
