# -*- coding: utf-8 -*-
"""
UJIAN PRAKTIK MATEMATIKA V3 — VERSI ONLINE (Vercel + Upstash Redis)

Logika aplikasi sama persis dengan versi offline (_core.py = salinan server.py).
File ini hanya mengganti cara menyimpan data: dari file data/db.json menjadi
database Upstash Redis, dan menyesuaikan pembaruan realtime agar hemat kuota.
"""
import base64
import gzip
import json
import os
import sys
import threading
import time
import uuid
import zlib
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _core as core  # noqa: E402

core.MODE = "online"
P = "upm:"  # awalan semua kunci di Redis
CORE_KEYS = ["settings", "students", "banks", "questions", "exams", "live", "tugasItems", "penugasan"]
SUMMARY = ("id", "examId", "studentId", "nama", "nis", "kelas", "status", "startedAt", "finishedAt", "durasi",
           "tambahWaktu", "finishReason")
REQ_LOCK = threading.Lock()  # satu permintaan pada satu waktu per instance


# ----------------------------------------------------------------------------
# Redis (Upstash REST API, tanpa pustaka tambahan)
# ----------------------------------------------------------------------------
class RedisError(Exception):
    pass


def _env(*names):
    for n in names:
        v = os.environ.get(n)
        if v:
            return v.strip()
    return ""


class Store:
    def __init__(self):
        self.url = _env("UPSTASH_REDIS_REST_URL", "KV_REST_API_URL").rstrip("/")
        self.token = _env("UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN")
        if not self.url or not self.token:  # nama variabel dengan awalan lain (mis. STORAGE_KV_REST_API_URL)
            for k, v in sorted(os.environ.items()):
                if not self.url and k.endswith(("REST_API_URL", "REDIS_REST_URL")) and v.startswith("https://"):
                    self.url = v.strip().rstrip("/")
                if not self.token and k.endswith(("REST_API_TOKEN", "REDIS_REST_TOKEN")) and "READ_ONLY" not in k:
                    self.token = v.strip()
        if not self.url or not self.token:
            raise RedisError("Database belum terhubung. Hubungkan Upstash Redis di Vercel (lihat PANDUAN).")

    def _post(self, path, payload):
        req = urllib.request.Request(self.url + path, data=json.dumps(payload).encode(),
                                     headers={"Authorization": "Bearer " + self.token,
                                              "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            raise RedisError("Database menolak permintaan: " + e.read().decode(errors="ignore")[:200])
        except urllib.error.URLError as e:
            raise RedisError("Database tidak dapat dihubungi: " + str(e.reason))

    def cmd(self, *args):
        r = self._post("", list(args))
        if isinstance(r, dict) and r.get("error"):
            raise RedisError(r["error"])
        return r.get("result")

    def pipe(self, cmds, atomic=False):
        if not cmds:
            return []
        r = self._post("/multi-exec" if atomic else "/pipeline", cmds)
        out = []
        for x in r:
            if isinstance(x, dict) and x.get("error"):
                raise RedisError(x["error"])
            out.append(x.get("result") if isinstance(x, dict) else x)
        return out

    def mget(self, keys):
        return self.cmd("MGET", *keys) if keys else []


def enc(obj):
    return "z:" + base64.b64encode(zlib.compress(json.dumps(obj, ensure_ascii=False).encode(), 6)).decode()


def dec(s):
    if s is None:
        return None
    if s.startswith("z:"):
        return json.loads(zlib.decompress(base64.b64decode(s[2:])))
    return json.loads(s)


# ----------------------------------------------------------------------------
# DB yang dimuat sebagian (hanya bagian yang dibutuhkan setiap permintaan)
# ----------------------------------------------------------------------------
def summary(r):
    d = {k: dict.get(r, k) for k in SUMMARY if dict.__contains__(r, k)}
    sc = dict.get(r, "score")
    if sc:
        d["score"] = {k: v for k, v in sc.items() if k != "detail"}
    return d


class ResultStub(dict):
    """Ringkasan hasil; isi lengkap (soal, jawaban) dimuat otomatis saat dibutuhkan."""

    def __init__(self, data, db):
        super().__init__(data)
        self._db = db
        self._full = False

    def _ensure(self):
        if not self._full:
            self._full = True
            full = self._db._load_result(dict.__getitem__(self, "id"))
            if full:
                dict.update(self, full)

    def __missing__(self, k):
        self._ensure()
        return dict.__getitem__(self, k)

    def get(self, k, d=None):
        if not dict.__contains__(self, k):
            self._ensure()
        return dict.get(self, k, d)

    def __setitem__(self, k, v):
        self._ensure()
        dict.__setitem__(self, k, v)

    def setdefault(self, k, d=None):
        self._ensure()
        return dict.setdefault(self, k, d)

    def update(self, *a, **kw):
        self._ensure()
        dict.update(self, *a, **kw)

    def pop(self, *a):
        self._ensure()
        return dict.pop(self, *a)


class OnlineDB(dict):
    def __init__(self, store):
        super().__init__()
        self.store = store
        self.orig = {}  # kunci -> teks JSON saat dimuat (untuk mendeteksi perubahan)
        self.res_orig = {}  # id hasil -> teks JSON lengkap saat dimuat
        self.index_orig = None
        self.prefetched = {}
        self.noload = False
        self.extra = {}

    # --- memuat
    def load(self, keys, results=False, result_ids=()):
        keys = [k for k in keys if not dict.__contains__(self, k)]
        want = [P + "k:" + k for k in keys]
        if results and not dict.__contains__(self, "results"):
            want.append(P + "resindex")
        rids = [r for r in result_ids if r and r not in self.prefetched]
        want += [P + "res:" + r for r in rids]
        want += [P + x for x in ("ver", "actv")]
        vals = self.store.mget(want) if want else []
        i = 0
        base = core.default_db()
        for k in keys:
            v = vals[i]
            i += 1
            obj = dec(v) if v is not None else base[k]
            if k == "settings" and v is not None:
                for kk, vv in base["settings"].items():
                    obj.setdefault(kk, vv)
            if k == "exams":
                for e in obj:
                    for kk, vv in core.default_exam().items():
                        e.setdefault(kk, vv)
            dict.__setitem__(self, k, obj)
            self.orig[k] = json.dumps(obj, ensure_ascii=False, sort_keys=True) if v is not None else None
        if results and not dict.__contains__(self, "results"):
            idx = dec(vals[i]) or []
            i += 1
            self.index_orig = json.dumps(idx, ensure_ascii=False, sort_keys=True)
            dict.__setitem__(self, "results", [ResultStub(x, self) for x in idx])
        for r in rids:
            self.prefetched[r] = vals[i]
            i += 1
        core.STATE["version"] = int(vals[i] or 0)
        core.STATE["act"] = int(vals[i + 1] or 0)

    def put_raw(self, key, raw):
        """Masukkan nilai yang sudah diambil (hemat satu perintah)."""
        obj = dec(raw) if raw is not None else core.default_db()[key]
        if key == "settings":
            for kk, vv in core.default_db()["settings"].items():
                obj.setdefault(kk, vv)
        dict.__setitem__(self, key, obj)
        self.orig[key] = json.dumps(obj, ensure_ascii=False, sort_keys=True) if raw is not None else None

    def _load_result(self, rid):
        raw = self.prefetched.pop(rid, None) if rid in self.prefetched else self.store.cmd("GET", P + "res:" + rid)
        full = dec(raw) if raw else None
        if full:
            self.res_orig[rid] = json.dumps(full, ensure_ascii=False, sort_keys=True)
        return full

    def load_all_full(self):
        self.load(CORE_KEYS, results=True)
        stubs = [r for r in dict.__getitem__(self, "results") if isinstance(r, ResultStub) and not r._full]
        for n in range(0, len(stubs), 200):
            part = stubs[n:n + 200]
            vals = self.store.mget([P + "res:" + dict.__getitem__(r, "id") for r in part])
            for r, v in zip(part, vals):
                r._full = True
                full = dec(v) if v else None
                if full:
                    self.res_orig[full["id"]] = json.dumps(full, ensure_ascii=False, sort_keys=True)
                    dict.update(r, full)

    def __missing__(self, key):
        if self.noload:
            raise KeyError(key)
        if key == "results":
            self.load([], results=True)
        elif key in CORE_KEYS:
            self.load([key])
        else:
            raise KeyError(key)
        return dict.__getitem__(self, key)

    def get(self, k, d=None):
        try:
            return self[k]
        except KeyError:
            return d

    def clear(self):
        dict.clear(self)
        self.noload = True

    def items(self):
        if not self.noload:
            self.load_all_full()
        return dict.items(self)

    # --- menyimpan
    def save_cmds(self):
        cmds = []
        for k in CORE_KEYS:
            if dict.__contains__(self, k):
                js = json.dumps(dict.__getitem__(self, k), ensure_ascii=False, sort_keys=True)
                if js != self.orig.get(k):
                    cmds.append(["SET", P + "k:" + k, enc(dict.__getitem__(self, k))])
        if dict.__contains__(self, "results"):
            cur = dict.__getitem__(self, "results")
            idx, ids = [], set()
            for r in cur:
                ids.add(r["id"])
                idx.append(summary(r))
                if isinstance(r, ResultStub) and not r._full:
                    continue
                js = json.dumps(r, ensure_ascii=False, sort_keys=True)
                if js != self.res_orig.get(r["id"]):
                    cmds.append(["SET", P + "res:" + r["id"], enc(dict(r))])
            ijs = json.dumps(idx, ensure_ascii=False, sort_keys=True)
            if ijs != self.index_orig:
                cmds.append(["SET", P + "resindex", enc(idx)])
                old = {x["id"] for x in json.loads(self.index_orig or "[]")}
                for gone in old - ids:
                    cmds.append(["DEL", P + "res:" + gone])
        return cmds


# ----------------------------------------------------------------------------
# Penghubung dengan logika inti
# ----------------------------------------------------------------------------
FLAGS = {"bump": False, "act": False}


def _mark(bump=True):
    if bump:
        FLAGS["bump"] = True


def _act_bump():
    FLAGS["act"] = True


STORE = {"s": None}


def store():
    if STORE["s"] is None:
        STORE["s"] = Store()
    return STORE["s"]


def _save_image(name, raw):
    store().cmd("SET", P + "img:" + os.path.basename(name), base64.b64encode(raw).decode())


def _load_image(name):
    v = store().cmd("GET", P + "img:" + os.path.basename(name))
    return base64.b64decode(v) if v else None


core.mark = _mark
core.act_bump = _act_bump
core.save_image = _save_image
core.load_image = _load_image


def new_db():
    FLAGS["bump"] = FLAGS["act"] = False
    db = OnlineDB(store())
    core.DB = db
    return db


def acquire():
    s = store()
    tok = uuid.uuid4().hex
    t_end = time.time() + 8
    while time.time() < t_end:
        if s.cmd("SET", P + "lock", tok, "NX", "PX", "9000") == "OK":
            return tok
        time.sleep(0.06)
    raise RedisError("Server sibuk, coba lagi.")


def release(tok):
    try:
        store().cmd("EVAL", "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) end return 0",
                    "1", P + "lock", tok)
    except Exception:
        pass


def commit(db):
    cmds = db.save_cmds()
    if FLAGS["bump"]:
        cmds.append(["INCR", P + "ver"])
    if FLAGS["act"]:
        cmds.append(["INCR", P + "actv"])
    if cmds:
        store().pipe(cmds, atomic=True)


def ensure_init():
    """Database baru: isi data awal (sama seperti versi offline)."""
    if STORE.get("init"):
        return
    s = store()
    if s.cmd("EXISTS", P + "k:settings"):
        STORE["init"] = True
        return
    tok = acquire()
    try:
        if s.cmd("EXISTS", P + "k:settings"):
            return
        db = new_db()
        db.noload = True
        base = core.default_db()
        core.seed_demo(base)
        dict.update(db, base)
        db.index_orig = "[]"
        FLAGS["bump"] = True
        commit(db)
        STORE["init"] = True
    finally:
        release(tok)


def mutate(fn, preload=(), results=False, result_ids=(), full=False):
    """Jalankan perubahan data dengan kunci (agar tidak bertabrakan)."""
    tok = acquire()
    try:
        db = new_db()
        if full:
            db.load_all_full()
        else:
            db.load(list(preload), results=results, result_ids=result_ids)
        out = fn(db)
        commit(db)
        return out
    finally:
        release(tok)


def run_tick_if_due(live):
    if core.tick_due(live):
        mutate(lambda db: core.tick_once(), preload=CORE_KEYS, results=True,
               result_ids=[live.get("resultId")])
        return True
    return False


def authed(handler, db):
    return handler.headers.get("X-Token") == core.token_for(db["settings"]["pin"])


# ----------------------------------------------------------------------------
# HTTP
# ----------------------------------------------------------------------------
class handler(BaseHTTPRequestHandler):
    server_version = "UjianPraktikumOnline/3"

    def log_message(self, fmt, *args):
        pass

    def send_json(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        gz = len(data) > 20000 and "gzip" in (self.headers.get("Accept-Encoding") or "")
        if gz:
            data = gzip.compress(data, 6)
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        if gz:
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def route(self):
        u = urlparse(self.path)
        qs = parse_qs(u.query)
        p = (qs.pop("__r", [None])[0]) or unquote(u.path)
        if not p.startswith("/"):
            p = "/" + p
        return p, qs

    def read_body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        b = json.loads(self.rfile.read(n).decode("utf-8"))
        if isinstance(b, dict) and isinstance(b.get("gz"), str):  # isi besar dikirim terkompresi
            b = json.loads(gzip.decompress(base64.b64decode(b["gz"])).decode("utf-8"))
        return b

    def safe(self, fn):
        with REQ_LOCK:
            try:
                return fn()
            except core.json.JSONDecodeError:
                return self.send_json({"error": "Data tidak valid"}, 400)
            except RedisError as ex:
                return self.send_json({"error": str(ex)}, 503)
            except KeyError as ex:
                return self.send_json({"error": "Perintah tidak dikenal: " + str(ex)}, 404)
            except ValueError as ex:
                return self.send_json({"error": str(ex)}, 400)
            except Exception as ex:  # noqa
                import traceback
                traceback.print_exc()
                return self.send_json({"error": "Kesalahan server: " + str(ex)}, 500)

    # ------------------------------------------------------------------ GET
    def do_GET(self):
        self.safe(self._get)

    def _get(self):
        p, qs = self.route()
        q = lambda k, d="": (qs.get(k) or [d])[0]  # noqa: E731
        if p.startswith("/img/"):
            raw = _load_image(p[5:])
            if not raw:
                self.send_response(404)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            ctype = core.mimetypes.guess_type(p)[0] or "application/octet-stream"
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
            self.end_headers()
            self.wfile.write(raw)
            return
        if p == "/api/ping":
            return self.send_json({"ok": True, "now": core.now_ms(), "mode": "online"})
        ensure_init()
        s = store()
        if p == "/api/live":
            v = int(q("v", "0") or 0)
            ver, live = s.mget([P + "ver", P + "k:live"])
            live = dec(live) or core.default_db()["live"]
            if run_tick_if_due(live):
                ver = None
            if ver is not None and int(ver) == v and v > 0:
                return self.send_json({"same": True, "v": v, "now": core.now_ms()})
            db = new_db()
            lv_res = live.get("resultId")
            db.load(["settings", "exams", "students", "live"], results=True, result_ids=[lv_res])
            return self.send_json(core.live_payload())
        if p == "/api/tugas-siswa":
            db = new_db()
            db.load(["settings", "penugasan"])
            return self.send_json(core.tugas_public_payload())
        # ---- halaman guru (perlu PIN)
        db = new_db()
        if p == "/api/monitor":
            k = q("k")
            ver, actv, live, st = s.mget([P + "ver", P + "actv", P + "k:live", P + "k:settings"])
            live = dec(live) or core.default_db()["live"]
            if run_tick_if_due(live):
                k = ""
            key = f"{ver or 0}:{actv or 0}"
            db.put_raw("settings", st)
            if not authed(self, db):
                return self.send_json({"error": "AUTH"}, 401)
            if k and k == key:
                return self.send_json({"same": True, "k": key, "now": core.now_ms()})
            db.load(["live"], results=True, result_ids=[live.get("resultId")])
            out = core.monitor_payload()
            out["k"] = key
            return self.send_json(out)
        if p == "/api/activity":
            a = int(q("a", "0") or 0)
            rid = q("rid") or None
            actv, live, st = s.mget([P + "actv", P + "k:live", P + "k:settings"])
            live = dec(live) or core.default_db()["live"]
            if run_tick_if_due(live):
                a = -1
            db.put_raw("settings", st)
            if not authed(self, db):
                return self.send_json({"error": "AUTH"}, 401)
            if a > 0 and int(actv or 0) == a:
                return self.send_json({"same": True, "a": a, "now": core.now_ms()})
            db.load(["live", "exams"], results=True, result_ids=[rid or live.get("resultId")])
            return self.send_json(core.activity_payload(rid))
        db.load(["settings"])
        if not authed(self, db):
            return self.send_json({"error": "AUTH"}, 401)
        if p == "/api/data":
            db.load_all_full()
            d = core.data_payload()
            d["ips"] = []
            d["port"] = None
            return self.send_json(d)
        if p == "/api/backup":
            db.load_all_full()
            return self.send_json(core.backup_payload(False))
        return self.send_json({"error": "Tidak ditemukan"}, 404)

    # ----------------------------------------------------------------- POST
    def do_POST(self):
        self.safe(self._post)

    def _post(self):
        p, _ = self.route()
        body = self.read_body()
        ensure_init()
        if p == "/api/login":
            db = new_db()
            db.load(["settings"])
            if core.clean_str(body.get("pin")) == core.clean_str(db["settings"]["pin"]):
                return self.send_json({"ok": True, "token": core.token_for(db["settings"]["pin"])})
            return self.send_json({"error": "PIN salah"}, 403)
        if p in ("/api/ifp/answer", "/api/ifp/submit"):
            fn = core.ifp_answer if p == "/api/ifp/answer" else core.ifp_submit
            pre = ["live"] if p == "/api/ifp/answer" else CORE_KEYS
            code, obj = mutate(lambda db: fn(body), preload=pre, results=True, result_ids=[body.get("resultId")])
            return self.send_json(obj, code)
        db = new_db()
        db.load(["settings"])
        if not authed(self, db):
            return self.send_json({"error": "AUTH"}, 401)
        heavy = p in ("/api/results/regrade", "/api/restore", "/api/reset")
        if p in ("/api/upload", "/api/img/put"):
            return self.send_json(core.act(p, body))
        live = db.get("live")  # untuk memuat hasil yang sedang berjalan sekaligus

        def run(d):
            return core.act(p, body)
        out = mutate(run, preload=CORE_KEYS, results=True, result_ids=[(live or {}).get("resultId")], full=heavy)
        return self.send_json(out)
