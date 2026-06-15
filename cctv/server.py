"""
MomayBUU CCTV Server (multi-camera) — Runs on Railway

  [RTSP] ← relay.py(cam=X) ──WS /ws/relay?key=&cam=X──▶ server.py ──WS /ws/stream?cam=X──▶ Browser

1 instance เสิร์ฟได้หลายกล้อง (แยกตาม cam id)

Endpoints:
  WS   /ws/relay?key=KEY&cam=ID   relay.py ส่ง JPEG เข้า (ต่อกล้อง, ต้องมี key)
  WS   /ws/stream?cam=ID          browser ดู (ต่อกล้อง)
  GET  /health                    สถานะรวม
  GET  /cameras                   รายชื่อกล้องที่ออนไลน์
"""
import os
import asyncio
import logging
from typing import Dict, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

RELAY_KEY = os.getenv("RELAY_KEY", "changeme")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("cctv-server")

app = FastAPI(title="MomayBUU CCTV Server (multi-cam)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ─── State แยกตาม cam id ───
relays:  Dict[str, WebSocket]      = {}   # cam → relay ws (ผู้ส่งภาพ)
viewers: Dict[str, Set[WebSocket]] = {}   # cam → set ของ viewer ws
latest:  Dict[str, bytes]          = {}   # cam → frame ล่าสุด (ให้ viewer ใหม่เห็นทันที)


@app.get("/health")
async def health():
    cams = set(relays) | set(viewers) | set(latest)
    return JSONResponse({
        "status": "ok",
        "cameras": {
            c: {"relay": c in relays, "viewers": len(viewers.get(c, set()))}
            for c in sorted(cams)
        },
    })


@app.get("/cameras")
async def cameras():
    cams = set(relays) | set(latest)
    return JSONResponse([
        {"cam": c, "relay_connected": c in relays, "viewers": len(viewers.get(c, set()))}
        for c in sorted(cams)
    ])


@app.websocket("/ws/relay")
async def relay_endpoint(websocket: WebSocket, key: str = Query(""), cam: str = Query("cam1")):
    if key != RELAY_KEY:
        await websocket.close(code=1008, reason="Unauthorized")
        logger.warning(f"Relay rejected (bad key) cam={cam}")
        return

    await websocket.accept()

    # แทน relay เดิมของกล้องนี้ถ้ามี
    old = relays.get(cam)
    if old is not None:
        try:
            await old.close()
        except Exception:
            pass
        logger.info(f"Replaced existing relay cam={cam}")

    relays[cam] = websocket
    logger.info(f"✓ relay connected cam={cam} (viewers={len(viewers.get(cam, set()))})")

    try:
        while True:
            data = await websocket.receive_bytes()
            latest[cam] = data
            vs = viewers.get(cam)
            if vs:
                dead = []
                async def _send(v, d):
                    try:
                        await asyncio.wait_for(v.send_bytes(d), timeout=0.15)
                    except Exception:
                        dead.append(v)
                await asyncio.gather(*[_send(v, data) for v in list(vs)])
                for d in dead:
                    vs.discard(d)
    except WebSocketDisconnect:
        logger.info(f"✗ relay disconnected cam={cam}")
    except Exception as e:
        logger.error(f"Relay error cam={cam}: {e}")
    finally:
        if relays.get(cam) is websocket:
            relays.pop(cam, None)


@app.websocket("/ws/stream")
async def stream_endpoint(websocket: WebSocket, cam: str = Query("cam1")):
    await websocket.accept()
    viewers.setdefault(cam, set()).add(websocket)
    logger.info(f"+ viewer cam={cam} total={len(viewers[cam])}")

    # ส่ง frame ล่าสุดทันที ไม่ต้องรอ
    if latest.get(cam):
        try:
            await websocket.send_bytes(latest[cam])
        except Exception:
            pass

    try:
        while True:
            await websocket.receive_text()   # keep-alive (ไม่ได้ใช้ข้อความ)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        vs = viewers.get(cam)
        if vs:
            vs.discard(websocket)
            if not vs:
                viewers.pop(cam, None)
        logger.info(f"- viewer cam={cam}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "3100"))
    logger.info(f"Starting CCTV multi-cam server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
