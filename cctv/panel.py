"""
MomayBUU CCTV Relay — Control Panel (รันที่เครื่องไซต์)

หน้าเว็บ local สำหรับคุม relay โดยไม่ต้องแตะไฟล์/คอมมานด์:
  • แก้ค่า .env (Gateway/Server/Key/คุณภาพ) แล้วกด Save → restart relay ให้เอง
  • ปุ่ม Start / Stop / Restart
  • ดูสถานะ + log สด (กล้องไหน streaming อยู่)

รันด้วย stdlib ล้วน (นอกจาก relay deps เดิม: opencv-python / websockets / python-dotenv)

    python panel.py        → เปิด http://127.0.0.1:8090 อัตโนมัติ + start relay ให้เลย
"""
import os
import sys
import json
import secrets
import threading
import subprocess
import webbrowser
from collections import deque
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

import paths

HERE       = os.path.dirname(os.path.abspath(__file__))
DATA_DIR   = paths.data_dir()
ENV_PATH   = os.path.join(DATA_DIR, ".env")
PANEL_PORT = int(os.getenv("PANEL_PORT", "8090"))
FROZEN     = getattr(sys, "frozen", False)
PANEL_PIN  = os.getenv("PANEL_PIN", "240124")   # รหัสเข้า Control Panel (เปลี่ยนผ่าน env ได้)
_tokens    = set()                              # session tokens ที่ล็อกอินผ่านแล้ว (in-memory)

# ลำดับฟิลด์ใน .env + ค่า default (เติมค่าไซต์ปัจจุบันให้ → ติดตั้งเสร็จใช้ได้ทันที)
ENV_FIELDS = [
    ("GATEWAY_URL",    "https://gatewaycctvswirroombooking-production.up.railway.app"),
    ("SERVER_URL",     "wss://cctv-production-c602.up.railway.app/ws/relay"),
    ("RELAY_KEY",      "51440c9674413e60393f78d5832bbb88cf5ed5c93ba82a6c35edf01ebd7dba24"),
    ("REFRESH_SEC",    "30"),
    ("FRAME_WIDTH",    "640"),
    ("FRAME_HEIGHT",   "480"),
    ("FPS",            "15"),
    ("JPEG_QUALITY",   "40"),
    ("RTSP_TRANSPORT", "tcp"),
    ("DETECT_ENABLED", "0"),
    ("DETECT_BACKEND", "ssd"),
    ("DETECT_CONF",    "0.5"),
    ("DETECT_EVERY_N", "3"),
]
DEFAULTS = dict(ENV_FIELDS)


def read_env():
    vals = dict(DEFAULTS)
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                vals[k.strip()] = v.strip()
    return vals


def write_env(vals):
    lines = ["# MomayBUU CCTV relay — แก้ผ่าน Control Panel (panel.py)\n"]
    for k, _ in ENV_FIELDS:
        lines.append(f"{k}={vals.get(k, DEFAULTS[k])}\n")
    with open(ENV_PATH, "w", encoding="utf-8") as f:
        f.writelines(lines)


class Relay:
    """จัดการ relay.py เป็น subprocess + เก็บ log ล่าสุดไว้โชว์"""
    def __init__(self):
        self.proc = None
        self.log  = deque(maxlen=400)
        self.lock = threading.Lock()

    def running(self):
        return self.proc is not None and self.proc.poll() is None

    def start(self):
        if self.running():
            return
        with self.lock:
            self.log.clear()
        # frozen (.exe): เรียกตัวเองด้วย --relay · dev: รัน relay.py ด้วย python
        cmd = [sys.executable, "--relay"] if FROZEN else [sys.executable, "-u", os.path.join(HERE, "relay.py")]
        self.proc = subprocess.Popen(
            cmd,
            cwd=DATA_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace",
        )
        threading.Thread(target=self._reader, args=(self.proc,), daemon=True).start()

    def _reader(self, proc):
        for line in proc.stdout:
            with self.lock:
                self.log.append(line.rstrip("\n"))

    def stop(self):
        if self.proc is not None and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self.proc = None

    def restart(self):
        self.stop()
        self.start()

    def tail(self, n=80):
        with self.lock:
            return list(self.log)[-n:]


relay = Relay()


PAGE = """<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MomayBUU CCTV Relay</title>
<style>
  :root{--bg:#0d0a12;--card:#16121d;--line:#2a2436;--gold:#FFB800;--txt:#e8e2f0;--mut:#8b7fa0}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--txt);font-family:Segoe UI,Sarabun,sans-serif;font-size:14px}
  .wrap{max-width:760px;margin:0 auto;padding:20px 16px 48px}
  h1{font-size:18px;color:var(--gold);margin:0 0 2px;display:flex;align-items:center;gap:8px}
  .sub{color:var(--mut);font-size:12px;margin-bottom:18px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:14px}
  .row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  label{display:block;font-size:12px;color:var(--mut);margin:10px 0 4px}
  input{width:100%;background:#0c0a10;border:1px solid var(--line);border-radius:8px;padding:9px 11px;color:var(--txt);font-size:13px;font-family:inherit}
  input:focus{outline:none;border-color:var(--gold)}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
  .grid5{display:grid;grid-template-columns:repeat(5,1fr);gap:0 10px}
  button{border:none;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
  .b-gold{background:var(--gold);color:#1a1206}
  .b-out{background:transparent;border:1px solid var(--line);color:var(--txt)}
  .b-red{background:#3a1414;border:1px solid #6b2020;color:#ff8a8a}
  .badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px}
  .dot{width:9px;height:9px;border-radius:50%;display:inline-block}
  .on{background:#13301c;color:#4ade80}.on .dot{background:#4ade80;box-shadow:0 0 6px #4ade80}
  .off{background:#301313;color:#ff8a8a}.off .dot{background:#ef4444}
  pre{background:#08060c;border:1px solid var(--line);border-radius:8px;padding:12px;height:240px;overflow:auto;margin:0;
      font-family:Consolas,monospace;font-size:12px;color:#b9f5c9;white-space:pre-wrap;word-break:break-all}
  .hint{font-size:11px;color:var(--mut);margin-top:3px}
  .toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:var(--gold);color:#1a1206;
         padding:10px 18px;border-radius:10px;font-weight:700;opacity:0;transition:.25s;pointer-events:none}
  .toast.show{opacity:1}
</style></head>
<body>
  <div id="lock" style="position:fixed;inset:0;z-index:999;background:#0d0a12;display:flex;align-items:center;justify-content:center">
    <div style="background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px 26px;text-align:center;width:280px">
      <div style="font-size:30px;margin-bottom:4px">🔒</div>
      <div style="color:var(--gold);font-weight:800;font-size:15px;margin-bottom:14px">MomayBUU CCTV Relay</div>
      <input id="pin" type="password" inputmode="numeric" placeholder="ใส่รหัส" autofocus
        style="width:100%;box-sizing:border-box;text-align:center;letter-spacing:4px;font-size:18px;background:#0c0a10;border:1px solid var(--line);border-radius:8px;padding:10px;color:var(--txt)"
        onkeydown="if(event.key==='Enter')login()">
      <div id="pinErr" style="color:#ff6b6b;font-size:12px;height:16px;margin-top:6px"></div>
      <button class="b-gold" style="width:100%;margin-top:6px" onclick="login()">เข้าสู่ระบบ</button>
    </div>
  </div>
  <div class="wrap">
  <h1>📷 MomayBUU CCTV Relay</h1>
  <div class="sub">เครื่องนี้ดึงภาพกล้อง (RTSP) จาก registry → ส่งขึ้น cctv server · แก้ค่าแล้วกด <b>บันทึก + รีสตาร์ท</b></div>

  <div class="card">
    <div class="row" style="justify-content:space-between">
      <span id="statusBadge" class="badge off"><span class="dot"></span>กำลังโหลด…</span>
      <div class="row">
        <button class="b-gold" onclick="act('start')">▶ Start</button>
        <button class="b-out"  onclick="act('restart')">↻ Restart</button>
        <button class="b-red"  onclick="act('stop')">■ Stop</button>
      </div>
    </div>
  </div>

  <div class="card">
    <b style="color:var(--gold);font-size:13px">การเชื่อมต่อ</b>
    <label>Gateway URL <span class="hint">(registry กล้อง /api/devices)</span></label>
    <input id="GATEWAY_URL">
    <label>CCTV Server URL <span class="hint">(ปลายทาง /ws/relay)</span></label>
    <input id="SERVER_URL">
    <label>Relay Key <span class="hint">(ต้องตรงกับ ENV ของ cctv server)</span></label>
    <input id="RELAY_KEY">
  </div>

  <div class="card">
    <b style="color:var(--gold);font-size:13px">ค่า default ต่อกล้อง</b>
    <div class="hint">override รายตัวได้ที่หน้า /settings ของ Momay (fps / jpegQuality / transport)</div>
    <div class="grid5">
      <div><label>กว้าง</label><input id="FRAME_WIDTH"></div>
      <div><label>สูง</label><input id="FRAME_HEIGHT"></div>
      <div><label>FPS</label><input id="FPS"></div>
      <div><label>JPEG Q</label><input id="JPEG_QUALITY"></div>
      <div><label>Transport</label><input id="RTSP_TRANSPORT"></div>
    </div>
    <label>Refresh (วินาที) <span class="hint">ดึงรายการกล้องใหม่ทุกกี่วิ</span></label>
    <input id="REFRESH_SEC" style="max-width:140px">
  </div>

  <div class="card">
    <b style="color:var(--gold);font-size:13px">ตรวจจับคน (Person detection)</b>
    <div class="hint">ฟรี · ใช้เชิงพาณิชย์ได้ (ไม่ใช้ YOLO) · วาดกรอบ + นับจำนวนคนบนภาพ</div>
    <div class="grid">
      <div><label>เปิดใช้งาน</label>
        <select id="DETECT_ENABLED"><option value="0">ปิด</option><option value="1">เปิด</option></select></div>
      <div><label>โมเดล</label>
        <select id="DETECT_BACKEND">
          <option value="ssd">SSD MobileNet (แม่นกว่า)</option>
          <option value="hog">HOG (เบา ไม่ต้องโหลด)</option>
        </select></div>
    </div>
    <div class="grid">
      <div><label>ความมั่นใจขั้นต่ำ <span class="hint">0–1 (ยิ่งสูงยิ่งเข้ม)</span></label><input id="DETECT_CONF"></div>
      <div><label>detect ทุกกี่เฟรม <span class="hint">ยิ่งมาก CPU ยิ่งเบา</span></label><input id="DETECT_EVERY_N"></div>
    </div>
    <div class="hint" style="margin-top:6px">SSD จะโหลดโมเดลครั้งแรกอัตโนมัติ (~180MB tar ครั้งเดียว) ถ้าโหลดไม่ได้จะ fallback เป็น HOG</div>
    <div style="margin-top:14px"><button class="b-gold" onclick="save()">💾 บันทึก + รีสตาร์ท relay</button></div>
  </div>

  <div class="card">
    <div class="row" style="justify-content:space-between;margin-bottom:8px">
      <b style="color:var(--gold);font-size:13px">Log</b>
      <span class="hint">อัปเดตอัตโนมัติทุก 2 วิ · มองหา <code>[id] ✓ streaming</code></span>
    </div>
    <pre id="log">…</pre>
  </div>
</div>
<div id="toast" class="toast"></div>
<script>
  const FIELDS=["GATEWAY_URL","SERVER_URL","RELAY_KEY","REFRESH_SEC","FRAME_WIDTH","FRAME_HEIGHT","FPS","JPEG_QUALITY","RTSP_TRANSPORT","DETECT_ENABLED","DETECT_BACKEND","DETECT_CONF","DETECT_EVERY_N"];
  let editing=false;
  FIELDS.forEach(f=>{const el=document.getElementById(f); el.addEventListener('focus',()=>editing=true); el.addEventListener('blur',()=>editing=false);});
  function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800);}
  function render(s){
    if(!editing) FIELDS.forEach(f=>{ if(s.env[f]!==undefined) document.getElementById(f).value=s.env[f]; });
    const b=document.getElementById('statusBadge');
    b.className='badge '+(s.running?'on':'off');
    b.innerHTML='<span class="dot"></span>'+(s.running?'relay กำลังทำงาน':'relay หยุดอยู่');
    const log=document.getElementById('log'); const atBottom=log.scrollTop+log.clientHeight>=log.scrollHeight-20;
    log.textContent=s.log.join('\\n')||'(ยังไม่มี log)'; if(atBottom) log.scrollTop=log.scrollHeight;
  }
  function showLock(){ document.getElementById('lock').style.display='flex'; setTimeout(()=>document.getElementById('pin').focus(),50); }
  function hideLock(){ document.getElementById('lock').style.display='none'; }
  async function login(){
    const pin=document.getElementById('pin').value;
    const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'pin='+encodeURIComponent(pin)});
    document.getElementById('pin').value='';
    if(r.ok){ document.getElementById('pinErr').textContent=''; hideLock(); poll(); }
    else { document.getElementById('pinErr').textContent='รหัสไม่ถูกต้อง'; }
  }
  async function poll(){ try{const r=await fetch('/api/state'); if(r.status===401){showLock();return} render(await r.json());}catch(e){} }
  async function act(a){ const r=await fetch('/api/'+a,{method:'POST'}); if(r.status===401){showLock();return} toast(a==='start'?'เริ่ม relay':a==='stop'?'หยุด relay':'รีสตาร์ท'); setTimeout(poll,400); }
  async function save(){
    const body=FIELDS.map(f=>f+'='+encodeURIComponent(document.getElementById(f).value)).join('&');
    const r=await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
    if(r.status===401){ showLock(); return }
    editing=false; toast('บันทึกแล้ว — รีสตาร์ท relay'); setTimeout(poll,500);
  }
  poll(); setInterval(poll,2000);
</script>
</body></html>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # เงียบ ไม่ spam console
        pass

    def _send(self, code, body, ctype="application/json", cookie=None):
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(data)

    def _authed(self):
        raw = self.headers.get("Cookie", "")
        if not raw:
            return False
        try:
            tok = SimpleCookie(raw).get("panel_token")
            return bool(tok) and tok.value in _tokens
        except Exception:
            return False

    def _body_form(self):
        n = int(self.headers.get("Content-Length", 0) or 0)
        return parse_qs(self.rfile.read(n).decode("utf-8")) if n else {}

    def do_GET(self):
        if self.path == "/" or self.path.startswith("/index"):
            return self._send(200, PAGE, "text/html; charset=utf-8")
        if self.path == "/api/state":
            if not self._authed():
                return self._send(401, '{"auth":false}')
            return self._send(200, json.dumps({
                "running": relay.running(),
                "env": read_env(),
                "log": relay.tail(),
            }))
        self._send(404, "{}")

    def do_POST(self):
        # ── login: ตรวจ PIN → ออก token ใส่ cookie ──
        if self.path == "/api/login":
            pin = (self._body_form().get("pin", [""])[0]).strip()
            if pin == PANEL_PIN:
                tok = secrets.token_hex(16)
                _tokens.add(tok)
                return self._send(200, '{"ok":true}',
                                  cookie=f"panel_token={tok}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400")
            return self._send(401, '{"ok":false}')
        if self.path == "/api/logout":
            raw = self.headers.get("Cookie", "")
            try:
                tok = SimpleCookie(raw).get("panel_token")
                if tok:
                    _tokens.discard(tok.value)
            except Exception:
                pass
            return self._send(200, '{"ok":true}', cookie="panel_token=; Path=/; Max-Age=0")

        # ── ทุก endpoint ที่เหลือ ต้องล็อกอินก่อน ──
        if not self._authed():
            return self._send(401, '{"auth":false}')
        if self.path == "/api/save":
            form = self._body_form()
            cur = read_env()
            for k, _ in ENV_FIELDS:
                if k in form:
                    cur[k] = form[k][0].strip()
            write_env(cur)
            relay.restart()
            return self._send(200, json.dumps({"ok": True}))
        if self.path == "/api/start":   relay.start();   return self._send(200, '{"ok":true}')
        if self.path == "/api/stop":    relay.stop();    return self._send(200, '{"ok":true}')
        if self.path == "/api/restart": relay.restart(); return self._send(200, '{"ok":true}')
        self._send(404, "{}")


def main():
    if not os.path.exists(ENV_PATH):
        write_env(dict(DEFAULTS))
        print(f"[panel] สร้าง .env จากค่า default แล้ว → {ENV_PATH}")
    relay.start()
    url = f"http://127.0.0.1:{PANEL_PORT}"
    print(f"[panel] Control Panel: {url}  (relay กำลัง start…)")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    server = ThreadingHTTPServer(("127.0.0.1", PANEL_PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[panel] ปิด…")
    finally:
        relay.stop()
        server.server_close()


if __name__ == "__main__":
    main()
