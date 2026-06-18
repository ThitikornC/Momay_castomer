"""
MomayBUU CCTV Relay (registry-driven, multi-camera) — pass-through (ไม่มีนับคน)

ดึงรายการกล้อง + RTSP จาก gateway registry → ไม่ต้อง hardcode RTSP ต่อกล้องอีก
  GET {GATEWAY_URL}/api/devices?category=camera
      → [{ deviceId, meta:{ camId, rtspUrl, fps, jpegQuality, transport } }]
แต่ละกล้อง: RTSP → JPEG → ws {SERVER_URL}?key=KEY&cam=<camId>

เพิ่ม/ลบ/แก้กล้องในหน้า /settings → relay ตัวนี้อัปเดตเอง (refresh ทุก REFRESH_SEC)
รัน relay ตัวเดียวต่อ 1 site (เครื่องที่อยู่วงเดียวกับกล้อง)
"""
import os
import json
import time
import asyncio
import threading
import logging
import urllib.request

import cv2
import websockets
from dotenv import load_dotenv

import paths
from detector import PersonDetector

load_dotenv(os.path.join(paths.data_dir(), ".env"))

GATEWAY_URL  = os.getenv("GATEWAY_URL", "http://localhost:8002").rstrip("/")
SERVER_URL   = os.getenv("SERVER_URL", "ws://localhost:3100/ws/relay")
RELAY_KEY    = os.getenv("RELAY_KEY", "changeme")
REFRESH_SEC  = int(os.getenv("REFRESH_SEC", "30"))
DEF_WIDTH    = int(os.getenv("FRAME_WIDTH", "640"))
DEF_HEIGHT   = int(os.getenv("FRAME_HEIGHT", "480"))
DEF_FPS      = int(os.getenv("FPS", "15"))
DEF_QUALITY  = int(os.getenv("JPEG_QUALITY", "40"))
DEF_TRANSPORT = os.getenv("RTSP_TRANSPORT", "tcp").strip().lower()

# ── Person detection (ฟรี ขายได้ — ssd|hog|none) ──
DETECT_ENABLED = os.getenv("DETECT_ENABLED", "0").strip() in ("1", "true", "yes", "on")
DETECT_BACKEND = os.getenv("DETECT_BACKEND", "ssd").strip().lower()
DETECT_CONF    = float(os.getenv("DETECT_CONF", "0.5"))
DETECT_EVERY_N = max(1, int(os.getenv("DETECT_EVERY_N", "3")))   # detect ทุกกี่เฟรม (ลด CPU)
COUNT_POST_SEC = float(os.getenv("COUNT_POST_SEC", "2"))         # ส่ง count ขึ้น gateway ทุกกี่วิ
_detector = None   # สร้างครั้งเดียวใน manager() แล้วแชร์ทุกกล้อง


def _post_count(cam_id, count):
    """ส่งจำนวนคนของกล้องขึ้น gateway (fire-and-forget, ห้าม raise)"""
    try:
        data = json.dumps({"camId": str(cam_id), "count": int(count)}).encode()
        req = urllib.request.Request(
            f"{GATEWAY_URL}/api/camera-count", data=data,
            headers={"Content-Type": "application/json"}, method="POST")
        urllib.request.urlopen(req, timeout=5).read()
    except Exception:
        pass

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("relay")

should_run = True


class RTSPCapture:
    """อ่าน RTSP ใน thread แยก เก็บเฉพาะเฟรมล่าสุด"""
    def __init__(self, url, width, height, transport):
        self.url, self.width, self.height, self.transport = url, width, height, transport
        self._frame = None
        self._lock = threading.Lock()
        self.running = False

    def _open(self):
        if self.transport in ("tcp", "udp"):
            os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = f"rtsp_transport;{self.transport}"
        cap = cv2.VideoCapture(self.url, cv2.CAP_FFMPEG)
        try: cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception: pass
        return cap

    def start(self):
        self.running = True
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self):
        cap = self._open()
        while self.running:
            if cap is None or not cap.isOpened():
                time.sleep(0.5); cap = self._open(); continue
            ok, frame = cap.read()
            if not ok:
                time.sleep(0.02); continue
            if self.width and self.height:
                try: frame = cv2.resize(frame, (self.width, self.height))
                except Exception: pass
            with self._lock:
                self._frame = frame
        try: cap.release()
        except Exception: pass

    def get_frame(self):
        with self._lock:
            return self._frame

    def stop(self):
        self.running = False


def _cam_sig(cam):
    """ลายเซ็น config — เปลี่ยนเมื่อ rtsp/fps/quality เปลี่ยน → restart task"""
    return f"{cam['rtspUrl']}|{cam['fps']}|{cam['quality']}|{cam['transport']}|{cam['width']}x{cam['height']}"


async def camera_task(cam):
    """capture RTSP → ส่ง JPEG ขึ้น ws ต่อ 1 กล้อง (loop + reconnect)"""
    cam_id = cam["camId"]
    ws_url = f"{SERVER_URL}?key={RELAY_KEY}&cam={cam_id}"
    enc = [cv2.IMWRITE_JPEG_QUALITY, cam["quality"]]
    interval = 1.0 / max(1, cam["fps"])

    while should_run:
        capture = None; ws = None
        try:
            capture = RTSPCapture(cam["rtspUrl"], cam["width"], cam["height"], cam["transport"])
            capture.start()
            for _ in range(50):
                if capture.get_frame() is not None: break
                await asyncio.sleep(0.1)
            if capture.get_frame() is None:
                raise ConnectionError("no frames in 5s")

            ws = await websockets.connect(ws_url, ping_interval=10, ping_timeout=5, max_size=2**20, close_timeout=3)
            logger.info(f"[{cam_id}] ✓ streaming")
            sent = skip = 0; log_t = time.time()
            frame_i = 0; last_boxes = []; last_post = 0.0
            while should_run and capture.running:
                t0 = time.monotonic()
                frame = capture.get_frame()
                if frame is None:
                    await asyncio.sleep(0.005); continue
                if _detector is not None:
                    frame = frame.copy()                       # กันวาดทับเฟรมที่ capture แชร์อยู่
                    frame_i += 1
                    if frame_i % DETECT_EVERY_N == 0:          # detect ทุก N เฟรม (offload เข้า thread)
                        last_boxes = await asyncio.to_thread(_detector.detect, frame)
                    count = PersonDetector.draw(frame, last_boxes)
                    if time.time() - last_post >= COUNT_POST_SEC:   # ส่ง count ขึ้น gateway → heatmap
                        last_post = time.time()
                        asyncio.create_task(asyncio.to_thread(_post_count, cam_id, count))
                ok, jpeg = cv2.imencode(".jpg", frame, enc)
                if not ok: continue
                try:
                    await asyncio.wait_for(ws.send(jpeg.tobytes()), timeout=0.1); sent += 1
                except asyncio.TimeoutError: skip += 1
                except websockets.exceptions.ConnectionClosed:
                    logger.warning(f"[{cam_id}] server closed"); break
                now = time.time()
                if now - log_t >= 5.0:
                    logger.info(f"[{cam_id}] sent={sent} skip={skip}"); sent = skip = 0; log_t = now
                dt = time.monotonic() - t0
                if dt < interval: await asyncio.sleep(interval - dt)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(f"[{cam_id}] error: {e}")
        finally:
            if ws is not None:
                try: await ws.close()
                except Exception: pass
            if capture is not None: capture.stop()
        if should_run:
            await asyncio.sleep(3)


def fetch_cameras():
    """ดึง camera devices จาก gateway → list ของ config (เฉพาะที่มี rtspUrl + camId)"""
    url = f"{GATEWAY_URL}/api/devices?category=camera"
    with urllib.request.urlopen(url, timeout=8) as r:
        data = json.loads(r.read().decode())
    out = []
    for d in (data.get("devices") or []):
        m = d.get("meta") or {}
        cam_id, rtsp = m.get("camId"), m.get("rtspUrl")
        if not cam_id or not rtsp:
            continue
        out.append({
            "camId": str(cam_id),
            "rtspUrl": rtsp,
            "fps": int(m.get("fps") or DEF_FPS),
            "quality": int(m.get("jpegQuality") or DEF_QUALITY),
            "transport": (m.get("transport") or DEF_TRANSPORT).lower(),
            "width": int(m.get("width") or DEF_WIDTH),
            "height": int(m.get("height") or DEF_HEIGHT),
        })
    return out


async def manager():
    """ดึงรายการกล้องเป็นระยะ → start/stop/restart task ตาม config ใน registry"""
    global _detector
    tasks = {}   # camId → {task, sig}
    logger.info(f"=== CCTV relay (registry-driven) ===")
    logger.info(f"  Gateway: {GATEWAY_URL}/api/devices?category=camera")
    logger.info(f"  Server:  {SERVER_URL}")
    if DETECT_ENABLED:
        logger.info(f"  Detect:  ON (backend={DETECT_BACKEND} conf={DETECT_CONF} every={DETECT_EVERY_N})")
        _detector = await asyncio.to_thread(PersonDetector, DETECT_BACKEND, DETECT_CONF)
    else:
        logger.info(f"  Detect:  OFF")
    while should_run:
        try:
            cams = await asyncio.to_thread(fetch_cameras)
        except Exception as e:
            logger.warning(f"fetch cameras failed: {e}")
            cams = None

        if cams is not None:
            by_id = {c["camId"]: c for c in cams}
            # ลบ/รีสตาร์ท
            for cam_id in list(tasks):
                if cam_id not in by_id:
                    logger.info(f"[{cam_id}] removed → stop"); tasks[cam_id]["task"].cancel(); del tasks[cam_id]
                elif tasks[cam_id]["sig"] != _cam_sig(by_id[cam_id]):
                    logger.info(f"[{cam_id}] config changed → restart"); tasks[cam_id]["task"].cancel(); del tasks[cam_id]
            # เพิ่มใหม่
            for cam_id, cam in by_id.items():
                if cam_id not in tasks:
                    logger.info(f"[{cam_id}] start ({cam['rtspUrl'][:30]}…)")
                    tasks[cam_id] = {"task": asyncio.create_task(camera_task(cam)), "sig": _cam_sig(cam)}

        await asyncio.sleep(REFRESH_SEC)


def main():
    global should_run
    try:
        asyncio.run(manager())
    except KeyboardInterrupt:
        should_run = False
        logger.info("stopped")


if __name__ == "__main__":
    main()
