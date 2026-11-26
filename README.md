# Ujian Praktik Matematika V3 — Versi Online

Versi online dari aplikasi Ujian Praktik Matematika (fitur sama dengan versi offline).

- Halaman guru: `/guru` (PIN awal **1234**, segera ganti di Pengaturan)
- Layar siswa / IFP: `/`
- Halaman tugas tambahan siswa: `/tugas`

## Cara memasang (ringkas)
1. Unggah semua isi folder ini ke repository GitHub baru.
2. Di vercel.com → **Add New → Project** → pilih repository ini → **Deploy**.
3. Di proyek Vercel → **Storage** → **Upstash for Redis** (gratis) → hubungkan ke proyek.
4. **Deployments → Redeploy** agar database terbaca.
5. Buka `https://nama-proyek.vercel.app/guru`, lalu impor data dari versi offline:
   **Pengaturan → Pulihkan / impor cadangan**.

Panduan lengkap ada pada dokumen PANDUAN yang menyertai aplikasi.

## Isi folder
- `public/` — tampilan (sama dengan versi offline)
- `api/index.py` — server online (Vercel Python), data di Upstash Redis
- `api/_core.py` — logika aplikasi (salinan `server.py` versi offline)
- `vercel.json` — pengaturan alamat
