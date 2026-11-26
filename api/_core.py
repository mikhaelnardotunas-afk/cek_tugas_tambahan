#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
UJIAN PRAKTIKUM MATEMATIKA - Server Offline
Laptop guru = server, IFP = layar siswa. Satu jaringan Wi-Fi, tanpa internet.
Hanya butuh Python 3.8+ (tanpa instalasi paket tambahan).

Jalankan:  python server.py            (port 8080)
           python server.py 9000       (port lain)
"""
import base64
import hashlib
import json
import mimetypes
import os
import random
import re
import secrets
import socket
import sys
import threading
import time
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

BASE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(BASE, "public")
DATA = os.path.join(BASE, "data")
IMG_DIR = os.path.join(DATA, "images")
DB_FILE = os.path.join(DATA, "db.json")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8080
MODE = "offline"   # versi online (Vercel) mengganti ini menjadi "online"

LOCK = threading.RLock()
COND = threading.Condition(LOCK)
ACOND = threading.Condition(LOCK)   # khusus panel "Aktivitas Siswa" (realtime)
STATE = {"version": 1, "dirty": False, "act": 1}


def now_ms():
    return int(time.time() * 1000)


def new_id(prefix=""):
    return prefix + uuid.uuid4().hex[:10]


# ----------------------------------------------------------------------------
# DATABASE
# ----------------------------------------------------------------------------
def default_db():
    return {
        "settings": {
            "sekolah": "SMP Kristen Basaan",
            "alamat": "",
            "mapel": "Matematika",
            "judul": "Ujian Praktikum Matematika",
            "guru": "",
            "nip": "",
            "kepsek": "",
            "nipKepsek": "",
            "tahunAjaran": "2026/2027",
            "semester": "Ganjil",
            "kota": "",
            "kkm": 75,
            "pin": "1234",
            "secret": secrets.token_hex(16),
            "logo": "",
            "suara": True,
        },
        "students": [],
        "banks": [],
        "questions": [],
        "exams": [],
        "results": [],
        "live": {"status": "board", "examId": None, "resultId": None},
        "tugasItems": [],
        "penugasan": [],
    }


def seed_demo(db, append=False):
    """Data contoh agar aplikasi bisa langsung dicoba."""
    b1 = {"id": new_id("b_"), "nama": "Teorema Pythagoras", "keterangan": "Contoh bank soal kelas 8"}
    b2 = {"id": new_id("b_"), "nama": "SPLDV & Persamaan Garis", "keterangan": "Contoh bank soal kelas 8"}
    Q = []

    def pg(bank, soal, a, b, c, d, kunci, level="Sedang", bahas=""):
        Q.append({"id": new_id("q_"), "bankId": bank["id"], "tipe": "PG", "soal": soal, "gambar": "",
                  "opsi": {"A": a, "B": b, "C": c, "D": d, "E": ""}, "kunci": kunci, "kataKunci": "",
                  "bobot": 1, "level": level, "pembahasan": bahas})

    def es(bank, soal, kunci, kk="", bobot=2, level="Sedang", bahas=""):
        Q.append({"id": new_id("q_"), "bankId": bank["id"], "tipe": "ESSAY", "soal": soal, "gambar": "",
                  "opsi": {}, "kunci": kunci, "kataKunci": kk, "bobot": bobot, "level": level, "pembahasan": bahas})

    pg(b1, "Sebuah segitiga siku-siku memiliki sisi tegak 6 cm dan 8 cm. Panjang sisi miringnya adalah ...",
       "10 cm", "12 cm", "14 cm", "48 cm", "A", "Mudah", "c² = 6² + 8² = 36 + 64 = 100, jadi c = 10 cm.")
    pg(b1, "Manakah yang merupakan tripel Pythagoras?", "3, 4, 6", "5, 12, 13", "6, 7, 8", "7, 8, 10", "B",
       "Mudah", "5² + 12² = 25 + 144 = 169 = 13².")
    pg(b1, "Panjang diagonal persegi panjang dengan panjang 12 cm dan lebar 5 cm adalah ...",
       "13 cm", "15 cm", "17 cm", "7 cm", "A", "Sedang", "d² = 12² + 5² = 169, d = 13 cm.")
    pg(b1, "Sisi miring segitiga siku-siku 25 cm dan salah satu sisi tegaknya 7 cm. Sisi tegak lainnya ...",
       "18 cm", "24 cm", "26 cm", "32 cm", "B", "Sedang", "b² = 25² − 7² = 625 − 49 = 576, b = 24 cm.")
    pg(b1, "Sebuah tangga 5 m disandarkan pada tembok. Jarak kaki tangga ke tembok 3 m. Tinggi tembok yang dicapai tangga ...",
       "2 m", "3 m", "4 m", "8 m", "C", "Sedang", "t² = 5² − 3² = 16, t = 4 m.")
    pg(b1, "Segitiga dengan sisi 9 cm, 12 cm, dan 16 cm termasuk segitiga ...",
       "siku-siku", "lancip", "tumpul", "sama sisi", "C", "Sukar", "16² = 256 > 9² + 12² = 225, maka tumpul.")
    es(b1, "Hitung panjang sisi miring segitiga siku-siku yang sisi tegaknya 9 cm dan 12 cm! (tulis angka dan satuan)",
       "15 cm|15", "", 2, "Mudah", "c² = 81 + 144 = 225, c = 15 cm.")
    es(b1, "Diagonal sebuah persegi panjang 26 cm dan lebarnya 10 cm. Berapa cm panjangnya?",
       "24", "", 2, "Sedang", "p² = 26² − 10² = 676 − 100 = 576, p = 24 cm.")
    pg(b2, "Penyelesaian dari x + y = 10 dan x − y = 2 adalah ...", "x = 6, y = 4", "x = 4, y = 6",
       "x = 5, y = 5", "x = 8, y = 2", "A", "Mudah", "Jumlahkan: 2x = 12 → x = 6, y = 4.")
    pg(b2, "Gradien garis y = 3x − 5 adalah ...", "−5", "3", "−3", "5", "B", "Mudah", "Bentuk y = mx + c, m = 3.")
    pg(b2, "Gradien garis yang melalui titik (1, 2) dan (3, 8) adalah ...", "2", "3", "4", "6", "B", "Sedang",
       "m = (8 − 2)/(3 − 1) = 6/2 = 3.")
    pg(b2, "Harga 2 buku dan 1 pensil Rp8.000, harga 1 buku dan 1 pensil Rp5.000. Harga 1 buku adalah ...",
       "Rp2.000", "Rp3.000", "Rp4.000", "Rp5.000", "B", "Sedang", "Kurangkan: buku = 8.000 − 5.000 = Rp3.000.")
    pg(b2, "Persamaan garis yang melalui (0, 2) dengan gradien 4 adalah ...", "y = 2x + 4", "y = 4x − 2",
       "y = 4x + 2", "y = −4x + 2", "C", "Sedang", "y = mx + c → y = 4x + 2.")
    pg(b2, "Garis yang sejajar dengan y = −2x + 7 memiliki gradien ...", "2", "−2", "1/2", "−1/2", "B", "Sukar",
       "Garis sejajar memiliki gradien sama.")
    es(b2, "Tentukan nilai x dari sistem 2x + y = 11 dan x + y = 7!", "4", "", 2, "Sedang",
       "Kurangkan: x = 11 − 7 = 4.")
    es(b2, "Tentukan gradien garis 4x + 2y = 6!", "-2", "", 2, "Sukar", "2y = −4x + 6 → y = −2x + 3, m = −2.")
    studs = [
        {"id": new_id("s_"), "nis": "0001", "nama": "Contoh Siswa Satu", "kelas": "DEMO", "jk": "L"},
        {"id": new_id("s_"), "nis": "0002", "nama": "Contoh Siswa Dua", "kelas": "DEMO", "jk": "P"},
        {"id": new_id("s_"), "nis": "0003", "nama": "Contoh Siswa Tiga", "kelas": "DEMO", "jk": "L"},
    ]
    ex = default_exam()
    ex.update({"id": new_id("e_"), "nama": "Contoh Ujian Praktikum", "bankIds": [b1["id"], b2["id"]],
               "jmlPG": 5, "jmlEssay": 2, "durasi": 10, "kelas": []})
    if append:
        db["banks"] += [b1, b2]
        db["questions"] += Q
        db["students"] += studs
        db["exams"] += [ex]
    else:
        db["banks"], db["questions"], db["students"], db["exams"] = [b1, b2], Q, studs, [ex]
    if not db["live"].get("examId") or not append:
        db["live"]["examId"] = ex["id"]


def default_exam():
    return {
        "id": "", "nama": "", "tanggal": time.strftime("%Y-%m-%d"), "bankIds": [], "jmlPG": 10, "jmlEssay": 0,
        "durasi": 15, "kelas": [], "acakSoal": True, "acakOpsi": True, "urutan": "campur",
        "tampilNilai": True, "tampilPembahasan": False, "kkm": None, "detikHasil": 20,
        "izinkanUlang": False, "catatan": "",
    }


def load_db():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                db = json.load(f)
            base = default_db()
            for k, v in base.items():
                db.setdefault(k, v)
            for k, v in base["settings"].items():
                db["settings"].setdefault(k, v)
            for e in db["exams"]:
                for k, v in default_exam().items():
                    e.setdefault(k, v)
            return db
        except Exception as ex:  # file rusak -> simpan cadangan
            print("! db.json rusak:", ex)
            os.replace(DB_FILE, DB_FILE + ".rusak-" + str(int(time.time())))
    db = default_db()
    seed_demo(db)
    return db


DB = None  # diisi di main() (offline) atau per permintaan (online)


def save_now():
    with LOCK:
        data = json.dumps(DB, ensure_ascii=False, indent=1)
        STATE["dirty"] = False
    tmp = DB_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(data)
    os.replace(tmp, DB_FILE)


def mark(bump=True):
    """Tandai data berubah. bump=True -> layar IFP/guru diberi tahu."""
    STATE["dirty"] = True
    if bump:
        STATE["version"] += 1
        COND.notify_all()


def saver_loop():
    while True:
        time.sleep(1)
        if STATE["dirty"]:
            try:
                save_now()
            except Exception as ex:
                print("! gagal simpan:", ex)


# ----------------------------------------------------------------------------
# PENILAIAN
# ----------------------------------------------------------------------------
def norm(s):
    s = str(s or "").lower().strip()
    s = s.replace("×", "x").replace("*", "x").replace("÷", "/").replace(":", "/")
    s = s.replace("−", "-").replace("–", "-").replace("²", "^2").replace("³", "^3")
    s = re.sub(r"(\d),(\d)", r"\1.\2", s)
    s = re.sub(r"\s+", "", s)
    s = s.rstrip(".")
    return s


NUM_RE = re.compile(r"-?\d+(?:[.,]\d+)?")


def nums(s):
    out = []
    for n in NUM_RE.findall(str(s or "").replace("−", "-")):
        try:
            out.append(float(n.replace(",", ".")))
        except ValueError:
            pass
    return out


def num_value(s):
    """Nilai angka dari '12', '-2', '2,5', '1/2'. None jika bukan angka murni."""
    t = re.sub(r"\s+", "", str(s or "")).replace("−", "-").replace(",", ".")
    m = re.fullmatch(r"(-?\d+(?:\.\d+)?)(?:/(-?\d+(?:\.\d+)?))?", t)
    if not m:
        return None
    a = float(m.group(1))
    if m.group(2) is not None:
        b = float(m.group(2))
        return None if b == 0 else a / b
    return a


def score_essay(ans, kunci, kata_kunci, bobot):
    ans = str(ans or "").strip()
    if not ans:
        return 0.0
    bobot = float(bobot or 1)
    kk = [g.strip() for g in str(kata_kunci or "").split(";") if g.strip()]
    if kk:
        a = norm(ans)
        hit = 0
        for g in kk:
            alts = [norm(x) for x in g.split("|") if x.strip()]
            if any(x and x in a for x in alts):
                hit += 1
        return round(bobot * hit / len(kk), 2)
    for k in str(kunci or "").split("|"):
        k = k.strip()
        if not k:
            continue
        if norm(k) == norm(ans):
            return bobot
        va, vk = num_value(ans), num_value(k)
        if va is not None and vk is not None and abs(va - vk) < 1e-6:
            return bobot
        kn = nums(k)
        an = nums(ans)
        if kn and an and all(any(abs(x - y) < 1e-6 for y in an) for x in kn) and len(an) <= len(kn) + 1:
            return bobot
    return 0.0


def grade(res):
    earned = total = 0.0
    pg_b = pg_t = 0
    es_e = es_t = 0.0
    detail = {}
    manual = res.get("manual", {})
    for it in res["items"]:
        b = float(it.get("bobot") or 1)
        total += b
        a = (res["answers"].get(it["qid"]) or {}).get("a", "")
        if it["tipe"] == "PG":
            pg_t += 1
            ok = a != "" and a == it["kunci"]
            sc = b if ok else 0.0
            if ok:
                pg_b += 1
            detail[it["qid"]] = {"skor": sc, "benar": ok}
        else:
            es_t += b
            if it["qid"] in manual:
                sc = float(manual[it["qid"]])
                src = "manual"
            else:
                sc = score_essay(a, it.get("kunci"), it.get("kataKunci"), b)
                src = "otomatis"
            es_e += sc
            detail[it["qid"]] = {"skor": sc, "benar": sc >= b, "sumber": src}
        earned += detail[it["qid"]]["skor"]
    nilai = round(100.0 * earned / total, 1) if total else 0.0
    res["score"] = {"earned": round(earned, 2), "total": total, "nilai": nilai, "pgBenar": pg_b,
                    "pgTotal": pg_t, "essayEarned": round(es_e, 2), "essayTotal": es_t, "detail": detail}
    return res["score"]


# ----------------------------------------------------------------------------
# HELPER DATA
# ----------------------------------------------------------------------------
def find(lst, _id):
    for x in lst:
        if x.get("id") == _id:
            return x
    return None


def exam_kkm(ex):
    k = ex.get("kkm") if ex else None
    return float(k) if k not in (None, "") else float(DB["settings"].get("kkm") or 75)


def participants(ex):
    kelas = ex.get("kelas") or []
    st = [s for s in DB["students"] if not kelas or s.get("kelas") in kelas]
    return sorted(st, key=lambda s: (s.get("kelas", ""), s.get("nama", "").lower()))


def latest_results(exam_id):
    """Hasil terakhir (selesai) per siswa untuk ujian tertentu."""
    out = {}
    for r in DB["results"]:
        if r["examId"] == exam_id and r["status"] == "selesai":
            prev = out.get(r["studentId"])
            if not prev or r["startedAt"] > prev["startedAt"]:
                out[r["studentId"]] = r
    return out


def build_items(ex):
    banks = set(ex.get("bankIds") or [])
    pool = [q for q in DB["questions"] if q["bankId"] in banks]
    pgs = [q for q in pool if q["tipe"] == "PG"]
    ess = [q for q in pool if q["tipe"] != "PG"]
    npg, nes = int(ex.get("jmlPG") or 0), int(ex.get("jmlEssay") or 0)
    if npg > len(pgs):
        raise ValueError(f"Soal PG di bank hanya {len(pgs)}, diminta {npg}.")
    if nes > len(ess):
        raise ValueError(f"Soal essay di bank hanya {len(ess)}, diminta {nes}.")
    if npg + nes == 0:
        raise ValueError("Jumlah soal masih 0. Atur jumlah soal pada menu Ujian.")
    if ex.get("acakSoal", True):
        chosen_pg = random.sample(pgs, npg)
        chosen_es = random.sample(ess, nes)
    else:
        chosen_pg, chosen_es = pgs[:npg], ess[:nes]
    if ex.get("urutan") == "pg_dulu":
        chosen = chosen_pg + chosen_es
    elif ex.get("urutan") == "essay_dulu":
        chosen = chosen_es + chosen_pg
    else:
        chosen = chosen_pg + chosen_es
        if ex.get("acakSoal", True):
            random.shuffle(chosen)
    items = []
    for q in chosen:
        it = {"qid": q["id"], "tipe": q["tipe"], "soal": q["soal"], "gambar": q.get("gambar", ""),
              "kunci": q.get("kunci", ""), "kataKunci": q.get("kataKunci", ""),
              "bobot": float(q.get("bobot") or (1 if q["tipe"] == "PG" else 2)),
              "level": q.get("level", ""), "pembahasan": q.get("pembahasan", ""), "options": []}
        if q["tipe"] == "PG":
            keys = [k for k in "ABCDE" if str((q.get("opsi") or {}).get(k, "")).strip()]
            order = keys[:]
            if ex.get("acakOpsi", True):
                random.shuffle(order)
            for i, orig in enumerate(order):
                it["options"].append({"k": "ABCDE"[i], "v": orig, "t": q["opsi"][orig]})
        items.append(it)
    return items


# ----------------------------------------------------------------------------
# AKTIVITAS SISWA (waktu per soal + catatan kegiatan)
# ----------------------------------------------------------------------------
def act_bump():
    STATE["act"] += 1
    ACOND.notify_all()


def track_time(res, t=None):
    """Tambahkan lama berada di soal saat ini (hanya saat ujian berjalan)."""
    t = t or now_ms()
    lv = DB["live"]
    since = res.get("idxAt")
    if since and lv.get("status") == "running" and lv.get("resultId") == res["id"]:
        since = max(since, lv.get("startAt") or 0)
        if t > since and res["items"]:
            i = min(max(int(res.get("index") or 0), 0), len(res["items"]) - 1)
            qid = res["items"][i]["qid"]
            ws = res.setdefault("waktuSoal", {})
            ws[qid] = ws.get(qid, 0) + (t - since)
    res["idxAt"] = t


def log_act(res, jenis, qid=None, a=None, t=None):
    """Catatan kegiatan. Ketikan beruntun pada soal yang sama digabung jadi satu baris."""
    t = t or now_ms()
    lg = res.setdefault("log", [])
    if jenis == "ketik" and lg and lg[-1]["j"] == "ketik" and lg[-1].get("q") == qid and t - lg[-1]["t"] < 8000:
        lg[-1].update({"a": a, "t": t})
    else:
        e = {"t": t, "j": jenis}
        if qid is not None:
            e["q"] = qid
        if a is not None:
            e["a"] = a
        lg.append(e)
        if len(lg) > 400:
            del lg[:len(lg) - 400]
    act_bump()


def activity_payload(rid=None):
    lv = DB["live"]
    res = find(DB["results"], rid or lv.get("resultId"))
    if not res and not rid:  # tidak ada sesi: tampilkan sesi terakhir ujian ini
        cand = [r for r in DB["results"] if r["examId"] == lv.get("examId") and r["status"] in ("selesai", "berjalan")]
        res = max(cand, key=lambda r: r["startedAt"]) if cand else None
    out = {"a": STATE["act"], "v": STATE["version"], "now": now_ms(),
           "live": {k: lv.get(k) for k in ("status", "resultId", "startAt", "endsAt", "remaining")}}
    if not res:
        return out
    aktif = lv.get("resultId") == res["id"] and lv.get("status") in ("running", "paused")
    ws = dict(res.get("waktuSoal") or {})
    idx = min(max(int(res.get("index") or 0), 0), max(len(res["items"]) - 1, 0))
    if aktif and lv.get("status") == "running" and res.get("idxAt") and res["items"]:
        since = max(res["idxAt"], lv.get("startAt") or 0)
        q = res["items"][idx]["qid"]
        ws[q] = ws.get(q, 0) + max(0, now_ms() - since)
    out["res"] = {
        "id": res["id"], "nama": res["nama"], "kelas": res.get("kelas", ""), "nis": res.get("nis", ""),
        "status": res["status"], "aktif": aktif, "index": idx, "startedAt": res["startedAt"],
        "finishedAt": res.get("finishedAt"), "durasi": res.get("durasi"), "tambahWaktu": res.get("tambahWaktu", 0),
        "items": [{"qid": i["qid"], "tipe": i["tipe"], "soal": i["soal"], "gambar": i.get("gambar", ""),
                   "bobot": i["bobot"], "kunci": i.get("kunci", ""), "options": i["options"]} for i in res["items"]],
        "answers": res["answers"], "waktuSoal": ws, "log": (res.get("log") or [])[-150:],
        "score": res.get("score") if res["status"] == "selesai" else None,
    }
    return out


def finalize(reason="submit"):
    lv = DB["live"]
    res = find(DB["results"], lv.get("resultId"))
    if not res or res["status"] != "berjalan":
        return None
    track_time(res)
    log_act(res, "selesai", a={"submit": "Siswa menekan Selesai", "waktu": "Waktu habis",
                               "guru": "Dihentikan guru"}.get(reason, reason))
    res["status"] = "selesai"
    res["finishedAt"] = now_ms()
    res["finishReason"] = reason
    grade(res)
    ex = find(DB["exams"], res["examId"])
    lv["status"] = "result"
    lv["resultUntil"] = now_ms() + int((ex or {}).get("detikHasil") or 20) * 1000
    mark()
    return res


def tick_due(lv, t=None):
    """True jika ada perubahan otomatis yang harus dijalankan (waktu habis / kembali ke papan)."""
    t = t or now_ms()
    if lv.get("status") == "running" and lv.get("endsAt") and t >= lv["endsAt"]:
        return True
    return bool(lv.get("status") == "result" and lv.get("resultUntil") and t >= lv["resultUntil"]
                and not lv.get("tahanHasil"))


def tick_once():
    lv = DB["live"]
    t = now_ms()
    if lv.get("status") == "running" and lv.get("endsAt") and t >= lv["endsAt"]:
        finalize("waktu")
    elif lv.get("status") == "result" and lv.get("resultUntil") and t >= lv["resultUntil"]:
        if not lv.get("tahanHasil"):
            lv["status"] = "board"
            lv["resultId"] = None
            mark()


def ticker():
    """Cek waktu habis & kembali ke papan otomatis."""
    while True:
        time.sleep(0.5)
        with LOCK:
            tick_once()


def strip_item(it, reveal=False):
    d = {"qid": it["qid"], "tipe": it["tipe"], "soal": it["soal"], "gambar": it.get("gambar", ""),
         "bobot": it["bobot"], "options": [{"k": o["k"], "v": o["v"], "t": o["t"]} for o in it["options"]]}
    if reveal:
        d["kunci"] = it.get("kunci", "")
        d["pembahasan"] = it.get("pembahasan", "")
    return d


def board_payload(ex):
    if not ex:
        return None
    lr = latest_results(ex["id"])
    kkm = exam_kkm(ex)
    sudah, belum = [], []
    for s in participants(ex):
        r = lr.get(s["id"])
        if r:
            sudah.append({"id": s["id"], "nama": s["nama"], "kelas": s.get("kelas", ""),
                          "nilai": r["score"]["nilai"] if ex.get("tampilNilai", True) else None,
                          "tuntas": r["score"]["nilai"] >= kkm, "t": r.get("finishedAt", 0)})
        else:
            belum.append({"id": s["id"], "nama": s["nama"], "kelas": s.get("kelas", "")})
    if ex.get("tampilNilai", True):
        sudah.sort(key=lambda x: (-(x["nilai"] or 0), x["t"]))
    else:
        sudah.sort(key=lambda x: x["t"])
    return {"examId": ex["id"], "nama": ex["nama"], "tampilNilai": ex.get("tampilNilai", True),
            "kkm": kkm, "sudah": sudah, "belum": belum,
            "jumlahSoal": int(ex.get("jmlPG") or 0) + int(ex.get("jmlEssay") or 0), "durasi": ex.get("durasi")}


def live_payload():
    lv = DB["live"]
    st = DB["settings"]
    ex = find(DB["exams"], lv.get("examId"))
    out = {"v": STATE["version"], "now": now_ms(), "status": lv.get("status", "board"),
           "settings": {"sekolah": st["sekolah"], "mapel": st["mapel"], "judul": st["judul"],
                        "logo": st.get("logo", ""), "suara": st.get("suara", True)},
           "board": board_payload(ex), "pesan": lv.get("pesan", ""), "mode": MODE}
    if lv.get("status") == "roll" and lv.get("roll"):
        r = lv["roll"]
        out["roll"] = {"names": r["names"], "winnerNama": r["winnerNama"], "winnerKelas": r["winnerKelas"],
                       "startAt": r["startAt"], "dur": r["dur"]}
    res = find(DB["results"], lv.get("resultId"))
    if res and lv.get("status") in ("running", "paused", "result"):
        out["session"] = {
            "resultId": res["id"], "nama": res["nama"], "kelas": res.get("kelas", ""),
            "startAt": lv.get("startAt"), "endsAt": lv.get("endsAt"), "remaining": lv.get("remaining"),
            "durasi": res.get("durasi"),
            "items": [strip_item(i, reveal=(lv["status"] == "result" and ex and ex.get("tampilPembahasan")))
                      for i in res["items"]],
            "answers": res["answers"],
        }
        if lv["status"] == "result":
            sc = res.get("score") or {}
            out["session"]["score"] = {k: sc.get(k) for k in
                                       ("nilai", "pgBenar", "pgTotal", "essayEarned", "essayTotal")}
            out["session"]["detail"] = sc.get("detail", {})
            out["session"]["tampilNilai"] = True if not ex else ex.get("tampilNilai", True)
            out["session"]["pembahasan"] = bool(ex and ex.get("tampilPembahasan"))
            out["session"]["kkm"] = exam_kkm(ex)
            out["session"]["resultUntil"] = lv.get("resultUntil")
            out["session"]["tahan"] = bool(lv.get("tahanHasil"))
    return out


def monitor_payload():
    lv = DB["live"]
    out = {"live": {k: lv.get(k) for k in ("status", "examId", "resultId", "startAt", "endsAt", "remaining",
                                           "resultUntil", "tahanHasil")}, "now": now_ms()}
    if lv.get("status") == "roll" and lv.get("roll"):
        r = lv["roll"]
        out["roll"] = {"winnerId": r["winnerId"], "winnerNama": r["winnerNama"], "winnerKelas": r["winnerKelas"],
                       "startAt": r["startAt"], "dur": r["dur"]}
    res = find(DB["results"], lv.get("resultId"))
    if res:
        answered = sum(1 for it in res["items"] if str((res["answers"].get(it["qid"]) or {}).get("a", "")).strip())
        ragu = sum(1 for v in res["answers"].values() if v.get("ragu"))
        out["res"] = {"id": res["id"], "nama": res["nama"], "kelas": res.get("kelas"), "studentId": res["studentId"],
                      "total": len(res["items"]), "answered": answered, "ragu": ragu,
                      "index": res.get("index", 0), "status": res["status"], "score": res.get("score")}
    return out


def ifp_answer(body):
    """Simpan jawaban / perpindahan soal dari IFP. Mengembalikan (kode, objek)."""
    lv = DB["live"]
    res = find(DB["results"], body.get("resultId"))
    if not res or res["status"] != "berjalan" or lv.get("status") != "running":
        return 409, {"error": "Sesi tidak aktif"}
    t = now_ms()
    if "index" in body:
        ni = int(body["index"])
        if ni != int(res.get("index") or 0):
            track_time(res, t)
            res["index"] = ni
            if 0 <= ni < len(res["items"]):
                log_act(res, "pindah", res["items"][ni]["qid"], t=t)
    if "qid" in body:
        qid = body["qid"]
        it = next((i for i in res["items"] if i["qid"] == qid), None)
        old = res["answers"].get(qid) or {}
        na, nr = str(body.get("a", ""))[:5000], bool(body.get("ragu"))
        res["answers"][qid] = {"a": na, "ragu": nr, "t": t}
        if it and na != old.get("a", ""):
            if it["tipe"] == "PG":
                log_act(res, "pilih" if not old.get("a") else "ganti", qid, na, t)
            else:
                log_act(res, "ketik" if na else "hapus", qid, na, t)
        if it and nr != bool(old.get("ragu")):
            log_act(res, "ragu" if nr else "yakin", qid, t=t)
    act_bump()
    mark(bump=False)
    return 200, {"ok": True}


def ifp_submit(body):
    lv = DB["live"]
    if lv.get("resultId") != body.get("resultId") or lv.get("status") != "running":
        return 409, {"error": "Sesi tidak aktif"}
    res = find(DB["results"], lv["resultId"])
    for qid, a in (body.get("answers") or {}).items():
        res["answers"][qid] = a
    finalize("submit")
    return 200, {"ok": True}


def public_settings():
    st = dict(DB["settings"])
    st.pop("secret", None)
    return st


def data_payload():
    d = {k: v for k, v in DB.items() if k != "settings"}
    d["settings"] = public_settings()
    d["v"] = STATE["version"]
    d["mode"] = MODE
    return d


# --- gambar (versi online mengganti dua fungsi ini) -------------------------
def save_image(name, raw):
    os.makedirs(IMG_DIR, exist_ok=True)
    with open(os.path.join(IMG_DIR, os.path.basename(name)), "wb") as f:
        f.write(raw)


def load_image(name):
    fp = os.path.join(IMG_DIR, os.path.basename(name))
    if os.path.isfile(fp):
        with open(fp, "rb") as f:
            return f.read()
    return None


def used_images():
    """Nama file gambar yang dipakai soal, tugas, dan logo."""
    names = set()
    def take(u):
        if isinstance(u, str) and u.startswith("/img/"):
            names.add(os.path.basename(u))
    take(DB["settings"].get("logo"))
    for q in DB["questions"]:
        take(q.get("gambar"))
    for t in DB.get("tugasItems") or []:
        take(t.get("gambar"))
    for p in DB.get("penugasan") or []:
        for t in (p.get("tugas") or {}).values():
            take(t.get("gambar"))
    return sorted(names)


def backup_payload(with_images=False):
    d = json.loads(json.dumps({k: v for k, v in DB.items()}))
    d["settings"].pop("secret", None)
    d["_app"] = "UJIAN PRAKTIK MATEMATIKA V3"
    d["_dibuat"] = now_ms()
    d["_dari"] = MODE
    if with_images:
        imgs = {}
        for n in used_images():
            raw = load_image(n)
            if raw:
                imgs[n] = base64.b64encode(raw).decode()
        d["_images"] = imgs
    return d


# ----------------------------------------------------------------------------
# TUGAS TAMBAHAN
# ----------------------------------------------------------------------------
def tugas_clean(t):
    out = {k: clean_str(t.get(k)) for k in ("paket", "judul", "isi", "kunci", "gambar")}
    out["paket"] = out["paket"] or "Umum"
    if not out["isi"] and not out["gambar"]:
        raise ValueError("Isi tugas / soal wajib diisi.")
    if not out["judul"]:
        out["judul"] = U_short(out["isi"], 60) or "Tugas"
    return out


def U_short(s, n):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return s if len(s) <= n else s[:n - 1] + "…"


def jumlah_tugas(nilai, batas, terendah, mn, mx):
    """Nilai paling rendah -> tugas paling banyak (mx); mendekati batas -> paling sedikit (mn)."""
    if nilai is None:
        return mx
    span = batas - terendah
    if span <= 0:
        return mx
    return max(mn, min(mx, mn + int(round((batas - nilai) / span * (mx - mn)))))


def plan_penugasan(body):
    ex = find(DB["exams"], body.get("examId"))
    if not ex:
        raise ValueError("Pilih ujian terlebih dahulu.")
    try:
        batas = float(body.get("batas") if body.get("batas") not in (None, "") else exam_kkm(ex))
        mn = int(body.get("min") or 1)
        mx = int(body.get("max") or mn)
    except (TypeError, ValueError):
        raise ValueError("Batas nilai dan jumlah tugas harus berupa angka.")
    if mn < 1 or mx < mn:
        raise ValueError("Jumlah tugas: minimal paling sedikit 1 dan maksimal tidak boleh lebih kecil dari minimal.")
    pakets = [p for p in (body.get("paket") or []) if p]
    pool = [t for t in DB["tugasItems"] if not pakets or t.get("paket") in pakets]
    if not pool:
        raise ValueError("Daftar tugas masih kosong. Isi dulu Daftar Tugas (atau pilih paket yang ada tugasnya).")
    kelas = body.get("kelas") or ""
    lr = latest_results(ex["id"])
    cands = []
    for s in participants(ex):
        if kelas and s.get("kelas") != kelas:
            continue
        r = lr.get(s["id"])
        if r:
            nv = float(r["score"]["nilai"])
            if nv < batas:
                cands.append((s, nv))
        elif body.get("belum"):
            cands.append((s, None))
    if not cands:
        raise ValueError(f"Tidak ada siswa dengan nilai di bawah {U_num(batas)} pada ujian ini.")
    vals = [v for _, v in cands if v is not None]
    low = min(vals) if vals else 0.0
    cands.sort(key=lambda x: (-1 if x[1] is None else x[1], x[0].get("nama", "").lower()))
    usage = {t["id"]: 0 for t in pool}
    order_ix = {t["id"]: i for i, t in enumerate(pool)}
    used_sets = set()
    siswa = []
    for s, nv in cands:
        n = min(jumlah_tugas(nv, batas, low, mn, mx), len(pool))
        pick = []
        for attempt in range(40):
            ranked = sorted(pool, key=lambda t: usage[t["id"]] + random.random() * (1 + attempt * 0.6))
            pick = [t["id"] for t in ranked[:n]]
            if frozenset(pick) not in used_sets:
                break
        used_sets.add(frozenset(pick))
        for tid in pick:
            usage[tid] += 1
        pick.sort(key=lambda tid: order_ix[tid])
        siswa.append({"studentId": s["id"], "nama": s["nama"], "kelas": s.get("kelas", ""), "nis": s.get("nis", ""),
                      "nilai": nv, "jumlah": len(pick), "taskIds": pick, "selesai": {}, "nilaiTugas": "",
                      "catatan": ""})
    used = {tid for x in siswa for tid in x["taskIds"]}
    snap = {t["id"]: {k: t.get(k, "") for k in ("paket", "judul", "isi", "kunci", "gambar")}
            for t in pool if t["id"] in used}
    nama = clean_str(body.get("nama")) or f"Tugas Tambahan — {ex['nama']}"
    return {"id": new_id("t_"), "nama": nama, "examId": ex["id"], "examNama": ex["nama"], "batas": batas,
            "min": mn, "max": mx, "paket": pakets, "kelas": kelas, "dibuat": now_ms(), "tampil": False,
            "tenggat": clean_str(body.get("tenggat")), "petunjuk": clean_str(body.get("petunjuk")),
            "siswa": siswa, "tugas": snap}


def U_num(v):
    v = float(v)
    return str(int(v)) if v.is_integer() else str(round(v, 1)).replace(".", ",")


def tugas_public_payload():
    st = DB["settings"]
    out = []
    for p in DB.get("penugasan") or []:
        if not p.get("tampil"):
            continue
        tg = p.get("tugas") or {}
        out.append({"id": p["id"], "nama": p["nama"], "examNama": p.get("examNama", ""), "tenggat": p.get("tenggat", ""),
                    "petunjuk": p.get("petunjuk", ""),
                    "siswa": [{"sid": x["studentId"], "nama": x["nama"], "kelas": x.get("kelas", ""),
                               "tugas": [{"judul": tg.get(t, {}).get("judul", ""), "isi": tg.get(t, {}).get("isi", ""),
                                          "gambar": tg.get(t, {}).get("gambar", ""),
                                          "selesai": bool((x.get("selesai") or {}).get(t))} for t in x["taskIds"]]}
                              for x in p["siswa"]]})
    return {"sekolah": st.get("sekolah"), "mapel": st.get("mapel"), "logo": st.get("logo", ""), "paket": out}


# ----------------------------------------------------------------------------
# AKSI GURU
# ----------------------------------------------------------------------------
def token_for(pin):
    return hashlib.sha256((str(pin) + DB["settings"]["secret"]).encode()).hexdigest()


def clean_str(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def act(path, body):
    s = DB["settings"]
    # ---------- siswa
    if path == "/api/students/save":
        st = body["student"]
        st["nama"] = clean_str(st.get("nama"))
        if not st["nama"]:
            raise ValueError("Nama siswa wajib diisi.")
        for k in ("nis", "kelas", "jk"):
            st[k] = clean_str(st.get(k))
        if st.get("id"):
            old = find(DB["students"], st["id"])
            if not old:
                raise ValueError("Siswa tidak ditemukan.")
            old.update(st)
        else:
            st["id"] = new_id("s_")
            DB["students"].append(st)
        mark()
        return {"ok": True, "student": st}
    if path == "/api/students/delete":
        ids = set(body.get("ids") or [])
        DB["students"] = [x for x in DB["students"] if x["id"] not in ids]
        mark()
        return {"ok": True}
    if path == "/api/students/import":
        rows = body.get("rows") or []
        if body.get("mode") == "replace":
            DB["students"] = []
        added = updated = 0
        for r in rows:
            nama = clean_str(r.get("nama"))
            if not nama:
                continue
            nis = clean_str(r.get("nis"))
            kelas = clean_str(r.get("kelas"))
            ex = None
            for x in DB["students"]:
                if (nis and x.get("nis") == nis) or (not nis and x["nama"].lower() == nama.lower()
                                                     and x.get("kelas") == kelas):
                    ex = x
                    break
            data = {"nis": nis, "nama": nama, "kelas": kelas, "jk": clean_str(r.get("jk")).upper()[:1]}
            if ex:
                ex.update(data)
                updated += 1
            else:
                data["id"] = new_id("s_")
                DB["students"].append(data)
                added += 1
        mark()
        return {"ok": True, "added": added, "updated": updated}
    # ---------- bank
    if path == "/api/banks/save":
        b = body["bank"]
        b["nama"] = clean_str(b.get("nama"))
        if not b["nama"]:
            raise ValueError("Nama bank soal wajib diisi.")
        if b.get("id"):
            old = find(DB["banks"], b["id"])
            old.update(b)
        else:
            b["id"] = new_id("b_")
            DB["banks"].append(b)
        mark()
        return {"ok": True, "bank": b}
    if path == "/api/banks/delete":
        bid = body["id"]
        DB["banks"] = [x for x in DB["banks"] if x["id"] != bid]
        DB["questions"] = [q for q in DB["questions"] if q["bankId"] != bid]
        for e in DB["exams"]:
            e["bankIds"] = [x for x in e.get("bankIds", []) if x != bid]
        mark()
        return {"ok": True}
    if path == "/api/banks/copy":
        src = find(DB["banks"], body["id"])
        nb = {"id": new_id("b_"), "nama": src["nama"] + " (salinan)", "keterangan": src.get("keterangan", "")}
        DB["banks"].append(nb)
        for q in [q for q in DB["questions"] if q["bankId"] == src["id"]]:
            c = json.loads(json.dumps(q))
            c["id"] = new_id("q_")
            c["bankId"] = nb["id"]
            DB["questions"].append(c)
        mark()
        return {"ok": True}
    # ---------- soal
    if path == "/api/questions/save":
        q = body["question"]
        q["tipe"] = "PG" if str(q.get("tipe", "PG")).upper().startswith("P") else "ESSAY"
        if not clean_str(q.get("soal")) and not q.get("gambar"):
            raise ValueError("Teks soal wajib diisi.")
        if q["tipe"] == "PG":
            q["kunci"] = clean_str(q.get("kunci")).upper()[:1]
            if not clean_str((q.get("opsi") or {}).get(q["kunci"])):
                raise ValueError("Kunci jawaban harus menunjuk opsi yang terisi.")
        if not find(DB["banks"], q.get("bankId")):
            raise ValueError("Pilih bank soal.")
        if q.get("id"):
            old = find(DB["questions"], q["id"])
            old.clear()
            old.update(q)
        else:
            q["id"] = new_id("q_")
            DB["questions"].append(q)
        mark()
        return {"ok": True, "question": q}
    if path == "/api/questions/delete":
        ids = set(body.get("ids") or [])
        DB["questions"] = [x for x in DB["questions"] if x["id"] not in ids]
        mark()
        return {"ok": True}
    if path == "/api/questions/move":
        ids = set(body.get("ids") or [])
        for q in DB["questions"]:
            if q["id"] in ids:
                q["bankId"] = body["bankId"]
        mark()
        return {"ok": True}
    if path == "/api/questions/import":
        rows = body.get("rows") or []
        default_bank = body.get("bankId")
        if body.get("mode") == "replace" and default_bank:
            DB["questions"] = [q for q in DB["questions"] if q["bankId"] != default_bank]
        added, errors = 0, []
        for i, r in enumerate(rows):
            soal = clean_str(r.get("soal"))
            if not soal:
                continue
            bank_nama = clean_str(r.get("bank"))
            bank = None
            if bank_nama:
                bank = next((b for b in DB["banks"] if b["nama"].lower() == bank_nama.lower()), None)
                if not bank:
                    bank = {"id": new_id("b_"), "nama": bank_nama, "keterangan": "Dibuat dari impor Excel"}
                    DB["banks"].append(bank)
            else:
                bank = find(DB["banks"], default_bank)
            if not bank:
                errors.append(f"Baris {i + 2}: bank soal kosong")
                continue
            tipe = "PG" if clean_str(r.get("tipe") or "PG").upper().startswith("P") else "ESSAY"
            opsi = {k: clean_str(r.get("opsi_" + k.lower())) for k in "ABCDE"}
            kunci = clean_str(r.get("kunci"))
            if tipe == "PG":
                kunci = kunci.upper()[:1]
                if not opsi.get(kunci):
                    errors.append(f"Baris {i + 2}: kunci '{kunci}' tidak cocok dengan opsi")
                    continue
            try:
                bobot = float(clean_str(r.get("bobot")) or (1 if tipe == "PG" else 2))
            except ValueError:
                bobot = 1 if tipe == "PG" else 2
            DB["questions"].append({
                "id": new_id("q_"), "bankId": bank["id"], "tipe": tipe, "soal": soal,
                "gambar": clean_str(r.get("gambar")), "opsi": opsi if tipe == "PG" else {}, "kunci": kunci,
                "kataKunci": clean_str(r.get("kata_kunci")), "bobot": bobot,
                "level": clean_str(r.get("tingkat")) or "Sedang", "pembahasan": clean_str(r.get("pembahasan"))})
            added += 1
        mark()
        return {"ok": True, "added": added, "errors": errors}
    # ---------- ujian
    if path == "/api/exams/save":
        e = body["exam"]
        if not clean_str(e.get("nama")):
            raise ValueError("Nama ujian wajib diisi.")
        base = default_exam()
        base.update(e)
        e = base
        if e.get("id"):
            old = find(DB["exams"], e["id"])
            old.update(e)
        else:
            e["id"] = new_id("e_")
            DB["exams"].append(e)
            if not DB["live"].get("examId"):
                DB["live"]["examId"] = e["id"]
        mark()
        return {"ok": True, "exam": e}
    if path == "/api/exams/delete":
        eid = body["id"]
        if DB["live"].get("examId") == eid and DB["live"].get("status") in ("running", "paused"):
            raise ValueError("Ujian sedang berlangsung.")
        DB["exams"] = [x for x in DB["exams"] if x["id"] != eid]
        if body.get("hapusHasil"):
            DB["results"] = [r for r in DB["results"] if r["examId"] != eid]
        if DB["live"].get("examId") == eid:
            DB["live"]["examId"] = None
        mark()
        return {"ok": True}
    # ---------- live
    lv = DB["live"]
    if path == "/api/live/select":
        if lv.get("status") in ("running", "paused"):
            raise ValueError("Tidak bisa ganti ujian saat siswa sedang mengerjakan.")
        lv["examId"] = body.get("examId")
        lv["status"] = "board"
        lv["resultId"] = None
        lv["roll"] = None
        mark()
        return {"ok": True}
    if path == "/api/live/roll":
        # Undi siswa: hanya yang BELUM ujian, tidak sedang mengerjakan, dan bukan hasil undian sebelumnya
        if lv.get("status") in ("running", "paused"):
            raise ValueError("Masih ada siswa yang sedang mengerjakan.")
        ex = find(DB["exams"], body.get("examId") or lv.get("examId"))
        if not ex:
            raise ValueError("Pilih ujian terlebih dahulu.")
        done = latest_results(ex["id"])
        pool = [x for x in participants(ex) if x["id"] not in done]
        if body.get("kelas"):
            pool = [x for x in pool if x.get("kelas") == body["kelas"]]
        if not pool:
            raise ValueError("Tidak ada siswa yang bisa diundi: semua siswa pada daftar ini sudah ujian.")
        prev = (lv.get("roll") or {}).get("winnerId") if lv.get("status") == "roll" else None
        cand = [x for x in pool if x["id"] != prev] or pool
        w = random.choice(cand)
        names = [x["nama"] for x in pool]
        random.shuffle(names)
        names = names[:60]
        if w["nama"] not in names:
            names[0] = w["nama"]
        lv.update({"status": "roll", "examId": ex["id"], "resultId": None, "tahanHasil": False,
                   "roll": {"winnerId": w["id"], "winnerNama": w["nama"], "winnerKelas": w.get("kelas", ""),
                            "names": names, "startAt": now_ms() + 400, "dur": 6500}})
        mark()
        return {"ok": True, "winnerId": w["id"], "nama": w["nama"], "kelas": w.get("kelas", ""), "sisa": len(pool) - 1}
    if path == "/api/live/roll/cancel":
        if lv.get("status") == "roll":
            lv.update({"status": "board", "roll": None})
            mark()
        return {"ok": True}
    if path == "/api/live/start":
        if lv.get("status") in ("running", "paused"):
            raise ValueError("Masih ada siswa yang sedang mengerjakan.")
        ex = find(DB["exams"], body.get("examId") or lv.get("examId"))
        stu = find(DB["students"], body.get("studentId"))
        if not ex or not stu:
            raise ValueError("Pilih ujian dan siswa terlebih dahulu.")
        items = build_items(ex)
        for r in DB["results"]:
            if r["examId"] == ex["id"] and r["studentId"] == stu["id"] and r["status"] == "selesai":
                if not body.get("ulang"):
                    raise ValueError("ULANG")
                r["status"] = "diulang"
        t = now_ms()
        start_at = t + (6500 if MODE == "online" else 4000)  # hitung mundur 3-2-1 (online: beri waktu layar IFP menangkap)
        res = {"id": new_id("r_"), "examId": ex["id"], "studentId": stu["id"], "nama": stu["nama"],
               "nis": stu.get("nis", ""), "kelas": stu.get("kelas", ""), "items": items, "answers": {},
               "manual": {}, "startedAt": start_at, "finishedAt": None, "status": "berjalan",
               "durasi": int(ex.get("durasi") or 15), "index": 0, "tambahWaktu": 0,
               "waktuSoal": {}, "idxAt": start_at, "log": [{"t": start_at, "j": "mulai"}]}
        DB["results"].append(res)
        act_bump()
        lv["roll"] = None
        lv.update({"status": "running", "examId": ex["id"], "resultId": res["id"], "startAt": start_at,
                   "endsAt": start_at + int(ex.get("durasi") or 15) * 60000, "remaining": None,
                   "tahanHasil": False})
        mark()
        return {"ok": True}
    if path == "/api/live/pause":
        if lv.get("status") == "running":
            res = find(DB["results"], lv.get("resultId"))
            if res:
                track_time(res)
                log_act(res, "jeda")
            lv["remaining"] = max(0, lv["endsAt"] - now_ms())
            lv["status"] = "paused"
            mark()
        return {"ok": True}
    if path == "/api/live/resume":
        if lv.get("status") == "paused":
            lv["endsAt"] = now_ms() + int(lv.get("remaining") or 0)
            if lv.get("startAt", 0) > now_ms():
                lv["startAt"] = now_ms()
            lv["remaining"] = None
            lv["status"] = "running"
            res = find(DB["results"], lv.get("resultId"))
            if res:
                res["idxAt"] = now_ms()
                log_act(res, "lanjut")
            mark()
        return {"ok": True}
    if path == "/api/live/addtime":
        ms = int(float(body.get("menit", 5)) * 60000)
        if lv.get("status") == "running":
            lv["endsAt"] += ms
        elif lv.get("status") == "paused":
            lv["remaining"] = int(lv.get("remaining") or 0) + ms
        res = find(DB["results"], lv.get("resultId"))
        if res:
            res["tambahWaktu"] = res.get("tambahWaktu", 0) + ms // 60000
            if res["status"] == "berjalan":
                log_act(res, "waktu", a=ms // 60000)
        mark()
        return {"ok": True}
    if path == "/api/live/stop":
        if lv.get("status") == "paused":
            lv["status"] = "running"
        finalize("guru")
        return {"ok": True}
    if path == "/api/live/cancel":
        res = find(DB["results"], lv.get("resultId"))
        if res and res["status"] == "berjalan":
            DB["results"] = [r for r in DB["results"] if r["id"] != res["id"]]
            # pulihkan hasil lama yang sempat ditandai 'diulang'
            olds = [r for r in DB["results"] if r["examId"] == res["examId"] and r["studentId"] == res["studentId"]
                    and r["status"] == "diulang"]
            if olds:
                max(olds, key=lambda r: r["startedAt"])["status"] = "selesai"
        lv.update({"status": "board", "resultId": None, "roll": None})
        mark()
        act_bump()
        return {"ok": True}
    if path == "/api/live/board":
        if lv.get("status") in ("running", "paused"):
            raise ValueError("Siswa masih mengerjakan.")
        lv.update({"status": "board", "resultId": None, "tahanHasil": False, "roll": None})
        mark()
        return {"ok": True}
    if path == "/api/live/hold":
        lv["tahanHasil"] = bool(body.get("tahan"))
        if not lv["tahanHasil"]:
            lv["resultUntil"] = now_ms() + 8000
        mark()
        return {"ok": True}
    if path == "/api/live/showresult":
        res = find(DB["results"], body.get("resultId"))
        if not res or lv.get("status") in ("running", "paused"):
            raise ValueError("Tidak dapat menampilkan hasil sekarang.")
        lv.update({"status": "result", "resultId": res["id"], "examId": res["examId"], "tahanHasil": True})
        mark()
        return {"ok": True}
    if path == "/api/live/message":
        lv["pesan"] = clean_str(body.get("pesan"))[:200]
        mark()
        return {"ok": True}
    # ---------- hasil
    if path == "/api/results/grade":
        res = find(DB["results"], body["resultId"])
        it = next((i for i in res["items"] if i["qid"] == body["qid"]), None)
        if body.get("skor") in (None, ""):
            res.setdefault("manual", {}).pop(body["qid"], None)
        else:
            sc = float(body["skor"])
            sc = max(0.0, min(sc, float(it["bobot"])))
            res.setdefault("manual", {})[body["qid"]] = sc
        grade(res)
        mark()
        return {"ok": True, "score": res["score"]}
    if path == "/api/results/delete":
        ids = set(body.get("ids") or [])
        DB["results"] = [r for r in DB["results"] if r["id"] not in ids or r["status"] == "berjalan"]
        mark()
        return {"ok": True}
    if path == "/api/results/regrade":
        for r in DB["results"]:
            if r["status"] == "selesai" and (not body.get("examId") or r["examId"] == body["examId"]):
                grade(r)
        mark()
        return {"ok": True}
    # ---------- tugas tambahan
    if path == "/api/tugas/save":
        it = body.get("item") or {}
        data = tugas_clean(it)
        if it.get("id"):
            old = find(DB["tugasItems"], it["id"])
            if not old:
                raise ValueError("Tugas tidak ditemukan.")
            old.update(data)
            data = old
        else:
            data["id"] = new_id("k_")
            DB["tugasItems"].append(data)
        mark()
        return {"ok": True, "item": data}
    if path == "/api/tugas/delete":
        ids = set(body.get("ids") or [])
        DB["tugasItems"] = [x for x in DB["tugasItems"] if x["id"] not in ids]
        mark()
        return {"ok": True}
    if path == "/api/tugas/import":
        rows = body.get("rows") or []
        if body.get("mode") == "replace":
            pk = {clean_str(r.get("paket")) or "Umum" for r in rows}
            DB["tugasItems"] = [x for x in DB["tugasItems"] if x.get("paket") not in pk]
        added, errors = 0, []
        for i, r in enumerate(rows):
            try:
                d = tugas_clean(r)
            except ValueError as e:
                if any(clean_str(v) for v in r.values()):
                    errors.append(f"Baris {i + 2}: {e}")
                continue
            d["id"] = new_id("k_")
            DB["tugasItems"].append(d)
            added += 1
        mark()
        return {"ok": True, "added": added, "errors": errors}
    if path == "/api/tugas/frombank":
        ids = body.get("qids") or []
        paket = clean_str(body.get("paket")) or "Dari Bank Soal"
        n = 0
        for q in DB["questions"]:
            if q["id"] not in ids:
                continue
            isi = q.get("soal", "")
            kunci = q.get("kunci", "")
            if q.get("tipe") == "PG":
                op = q.get("opsi") or {}
                isi += "\n" + "\n".join(f"{k}. {op[k]}" for k in "ABCDE" if clean_str(op.get(k)))
                kunci = f"{kunci}. {op.get(kunci, '')}" if kunci else ""
            DB["tugasItems"].append({"id": new_id("k_"), "paket": paket, "judul": U_short(q.get("soal", ""), 60) or "Soal",
                                     "isi": isi, "kunci": clean_str(kunci), "gambar": q.get("gambar", "")})
            n += 1
        mark()
        return {"ok": True, "added": n}
    if path == "/api/penugasan/buat":
        plan = plan_penugasan(body)
        if body.get("simpan"):
            DB["penugasan"].append(plan)
            mark()
        return {"ok": True, "plan": plan}
    if path == "/api/penugasan/simpan":
        plan = body.get("plan") or {}
        if not plan.get("siswa"):
            raise ValueError("Rencana tugas kosong.")
        plan["id"] = new_id("t_")
        plan["dibuat"] = now_ms()
        DB["penugasan"].append(plan)
        mark()
        return {"ok": True, "id": plan["id"]}
    if path in ("/api/penugasan/update", "/api/penugasan/acakulang", "/api/penugasan/tampil",
                "/api/penugasan/delete", "/api/penugasan/info"):
        p = find(DB["penugasan"], body.get("id"))
        if not p:
            raise ValueError("Data tugas tambahan tidak ditemukan.")
        if path == "/api/penugasan/delete":
            DB["penugasan"] = [x for x in DB["penugasan"] if x["id"] != p["id"]]
        elif path == "/api/penugasan/tampil":
            p["tampil"] = bool(body.get("tampil"))
        elif path == "/api/penugasan/info":
            for k in ("nama", "tenggat", "petunjuk"):
                if k in body:
                    p[k] = clean_str(body[k])
        else:
            x = next((x for x in p["siswa"] if x["studentId"] == body.get("studentId")), None)
            if not x:
                raise ValueError("Siswa tidak ada dalam daftar ini.")
            if path == "/api/penugasan/update":
                if "taskId" in body:
                    x.setdefault("selesai", {})[body["taskId"]] = bool(body.get("selesai"))
                if body.get("semua") is not None:
                    x["selesai"] = {t: bool(body["semua"]) for t in x["taskIds"]}
                for k in ("nilaiTugas", "catatan"):
                    if k in body:
                        x[k] = clean_str(body[k])
            else:  # acak ulang tugas satu siswa (jumlah tetap)
                pool = [t for t in DB["tugasItems"] if not p.get("paket") or t.get("paket") in p["paket"]]
                if len(pool) < x["jumlah"]:
                    raise ValueError("Daftar tugas tidak cukup untuk diacak ulang.")
                cnt = {}
                for y in p["siswa"]:
                    for t in y["taskIds"]:
                        cnt[t] = cnt.get(t, 0) + 1
                old = set(x["taskIds"])
                ranked = sorted(pool, key=lambda t: cnt.get(t["id"], 0) + (2 if t["id"] in old else 0) + random.random())
                ix = {t["id"]: i for i, t in enumerate(pool)}
                x["taskIds"] = sorted([t["id"] for t in ranked[:x["jumlah"]]], key=lambda t: ix[t])
                x["selesai"] = {}
                for t in pool:
                    if t["id"] in x["taskIds"]:
                        p.setdefault("tugas", {})[t["id"]] = {k: t.get(k, "") for k in ("paket", "judul", "isi", "kunci", "gambar")}
        mark()
        return {"ok": True}
    # ---------- pengaturan
    if path == "/api/settings/save":
        new = body.get("settings") or {}
        for k, v in new.items():
            if k in ("secret",):
                continue
            if k == "pin":
                v = clean_str(v)
                if len(v) < 4:
                    raise ValueError("PIN minimal 4 karakter.")
            s[k] = v
        mark()
        return {"ok": True, "token": token_for(s["pin"])}
    if path == "/api/restore":
        data = body.get("db")
        if not isinstance(data, dict) or "students" not in data or "questions" not in data:
            raise ValueError("File cadangan tidak valid.")
        keep_secret = s["secret"]
        data = {k: v for k, v in data.items() if not k.startswith("_")}
        base = default_db()
        base_settings = base["settings"]
        DB.clear()
        DB.update(base)
        DB.update(data)
        for k, v in base_settings.items():
            DB["settings"].setdefault(k, v)
        for e in DB["exams"]:
            for k, v in default_exam().items():
                e.setdefault(k, v)
        DB["settings"]["secret"] = keep_secret
        DB["live"] = {"status": "board", "examId": DB["live"].get("examId"), "resultId": None}
        mark()
        return {"ok": True, "token": token_for(DB["settings"]["pin"])}
    if path == "/api/reset":
        what = body.get("what")
        if what == "hasil":
            DB["results"] = [r for r in DB["results"] if r["status"] == "berjalan"]
        elif what == "siswa":
            DB["students"] = []
        elif what == "soal":
            DB["questions"], DB["banks"] = [], []
        elif what == "semua":
            sec, pin = s["secret"], s["pin"]
            DB.clear()
            DB.update(default_db())
            DB["settings"]["secret"], DB["settings"]["pin"] = sec, pin
        elif what == "tugas":
            DB["tugasItems"], DB["penugasan"] = [], []
        elif what == "demo":
            seed_demo(DB, append=True)
        mark()
        return {"ok": True}
    if path == "/api/upload":
        m = re.match(r"data:image/(\w+);base64,(.*)", body.get("dataUrl", ""), re.S)
        if not m:
            raise ValueError("Format gambar tidak dikenali.")
        ext = {"jpeg": "jpg"}.get(m.group(1), m.group(1))
        name = new_id("img_") + "." + ext
        save_image(name, base64.b64decode(m.group(2)))
        return {"ok": True, "url": "/img/" + name}
    if path == "/api/img/put":
        name = os.path.basename(clean_str(body.get("name")))
        if not re.fullmatch(r"[\w.-]+\.(png|jpg|jpeg|gif|webp|svg)", name, re.I):
            raise ValueError("Nama gambar tidak valid.")
        save_image(name, base64.b64decode(body.get("data") or ""))
        return {"ok": True}
    raise KeyError(path)


# ----------------------------------------------------------------------------
# HTTP
# ----------------------------------------------------------------------------
def local_ips():
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except Exception:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ips.add(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    ips.discard("127.0.0.1")
    return sorted(ips) or ["127.0.0.1"]


class Handler(BaseHTTPRequestHandler):
    server_version = "UjianPraktikum/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def send_json(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def send_file(self, fp):
        if not os.path.isfile(fp):
            self.send_error(404)
            return
        ctype = mimetypes.guess_type(fp)[0] or "application/octet-stream"
        if fp.endswith(".js"):
            ctype = "application/javascript"
        if fp.endswith(".woff2"):
            ctype = "font/woff2"
        with open(fp, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith(("text", "application/j")) else ""))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def authed(self):
        return self.headers.get("X-Token") == token_for(DB["settings"]["pin"])

    def read_body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        b = json.loads(self.rfile.read(n).decode("utf-8"))
        if isinstance(b, dict) and isinstance(b.get("gz"), str):  # isi besar dikirim terkompresi
            import gzip
            b = json.loads(gzip.decompress(base64.b64decode(b["gz"])).decode("utf-8"))
        return b

    def do_GET(self):
        u = urlparse(self.path)
        p = unquote(u.path)
        qs = parse_qs(u.query)
        if p == "/api/live":
            v = int((qs.get("v") or ["0"])[0])
            with COND:
                if v == STATE["version"]:
                    COND.wait(timeout=20)
                return self.send_json(live_payload())
        if p == "/api/activity":
            if not self.authed():
                return self.send_json({"error": "AUTH"}, 401)
            a = int((qs.get("a") or ["0"])[0])
            rid = (qs.get("rid") or [""])[0] or None
            with ACOND:
                if a == STATE["act"]:
                    ACOND.wait(timeout=15)
                return self.send_json(activity_payload(rid))
        if p == "/api/tugas-siswa":
            with LOCK:
                return self.send_json(tugas_public_payload())
        if p == "/api/ping":
            return self.send_json({"ok": True, "now": now_ms()})
        if p.startswith("/api/"):
            if not self.authed():
                return self.send_json({"error": "AUTH"}, 401)
            with LOCK:
                if p == "/api/data":
                    d = data_payload()
                    d["ips"] = local_ips()
                    d["port"] = PORT
                    return self.send_json(d)
                if p == "/api/monitor":
                    return self.send_json(monitor_payload())
                if p == "/api/backup":
                    return self.send_json(backup_payload(bool(qs.get("images"))))
            return self.send_json({"error": "Tidak ditemukan"}, 404)
        if p.startswith("/img/"):
            return self.send_file(os.path.join(IMG_DIR, os.path.basename(p)))
        if p in ("/tugas", "/tugas/"):
            return self.send_file(os.path.join(PUBLIC, "tugas.html"))
        if p in ("/", "/ifp", "/siswa"):
            return self.send_file(os.path.join(PUBLIC, "index.html"))
        if p in ("/guru", "/guru/"):
            return self.send_file(os.path.join(PUBLIC, "guru.html"))
        fp = os.path.normpath(os.path.join(PUBLIC, p.lstrip("/")))
        if not fp.startswith(PUBLIC):
            return self.send_error(403)
        return self.send_file(fp)

    def do_POST(self):
        p = urlparse(self.path).path
        try:
            body = self.read_body()
        except Exception:
            return self.send_json({"error": "Data tidak valid"}, 400)
        try:
            with LOCK:
                if p == "/api/login":
                    if clean_str(body.get("pin")) == clean_str(DB["settings"]["pin"]):
                        return self.send_json({"ok": True, "token": token_for(DB["settings"]["pin"])})
                    return self.send_json({"error": "PIN salah"}, 403)
                if p == "/api/ifp/answer":
                    code, obj = ifp_answer(body)
                    return self.send_json(obj, code)
                if p == "/api/ifp/submit":
                    code, obj = ifp_submit(body)
                    return self.send_json(obj, code)
                if not self.authed():
                    return self.send_json({"error": "AUTH"}, 401)
                return self.send_json(act(p, body))
        except KeyError as ex:
            return self.send_json({"error": "Perintah tidak dikenal: " + str(ex)}, 404)
        except ValueError as ex:
            return self.send_json({"error": str(ex)}, 400)
        except Exception as ex:
            import traceback
            traceback.print_exc()
            return self.send_json({"error": "Kesalahan server: " + str(ex)}, 500)


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        ex = sys.exc_info()[1]
        if isinstance(ex, (ConnectionError, TimeoutError)):
            return  # klien menutup koneksi (biasa terjadi), abaikan
        super().handle_error(request, client_address)


def main():
    global DB
    os.makedirs(IMG_DIR, exist_ok=True)
    DB = load_db()
    threading.Thread(target=saver_loop, daemon=True).start()
    threading.Thread(target=ticker, daemon=True).start()
    save_now()
    try:
        srv = Server(("0.0.0.0", PORT), Handler)
    except OSError:
        print(f"! Port {PORT} sedang dipakai. Mungkin server sudah berjalan di jendela lain.")
        print(f"  Buka http://localhost:{PORT}/guru atau jalankan: python server.py 8081")
        input("Tekan Enter untuk menutup...")
        return
    ips = local_ips()
    line = "=" * 62
    print(line)
    print("  UJIAN PRAKTIKUM MATEMATIKA  -  server berjalan (offline)")
    print(line)
    print(f"  Halaman GURU (laptop ini) : http://localhost:{PORT}/guru")
    for ip in ips:
        print(f"  Halaman SISWA (buka di IFP): http://{ip}:{PORT}")
    print(f"  PIN guru awal             : {DB['settings']['pin'] if DB['settings']['pin'] == '1234' else '(sudah diganti)'}")
    print(line)
    print("  Jangan tutup jendela ini selama ujian. Tekan Ctrl+C untuk berhenti.")
    print(line)
    if "--no-browser" not in sys.argv:
        threading.Timer(1.2, lambda: webbrowser.open(f"http://localhost:{PORT}/guru")).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        save_now()
        print("Data tersimpan. Server berhenti.")


if __name__ == "__main__":
    main()
