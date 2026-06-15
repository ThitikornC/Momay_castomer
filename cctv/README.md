# MomayBUU CCTV — RTSP → Web (multi-camera)

ส่งภาพกล้อง CCTV (RTSP) ขึ้น Web ผ่าน WebSocket (JPEG) — **1 server เสิร์ฟได้หลายกล้อง** แยกตาม `cam id`
(เวอร์ชันนี้เป็น pass-through ล้วน — ตัดระบบนับคน/YOLO ออกแล้ว)

## Architecture
```
ห้อง101  relay.py(CAM_ID=101) ─┐
ห้อง200  relay.py(CAM_ID=200) ─┼─ WS /ws/relay?key=&cam=ID ─▶ server.py ─ WS /ws/stream?cam=ID ─▶ dashboard
ห้อง300  relay.py(CAM_ID=300) ─┘        (รันที่ local)         (1 instance บน Railway)
```

## 1. Deploy server บน Railway
- root = โฟลเดอร์ `cctv/` · ใช้ `Dockerfile` + `railway.json` (healthcheck `/health`)
- ENV: `RELAY_KEY` (ความลับ, ต้องตรงกับ relay) — `PORT` Railway ใส่ให้เอง
- server เบา (ไม่มี opencv) → ใช้ `requirements.txt`
- ได้ URL เช่น `https://your-cctv-server.up.railway.app`

## 2. เพิ่มกล้องในหน้า `/settings` (ไม่ต้องแตะโค้ด/RTSP ที่ relay)
ห้องที่ต้องการ → เพิ่มอุปกรณ์ **กล้อง**:
- `camId` = id กล้อง (เช่น `101`)
- `rtspUrl` = `rtsp://user:pass@ip:554/...`  ← relay จะดึงไปใช้เอง
- `streamKind` = **ws**, `wsUrl` = `wss://<cctv-server>/ws/stream?cam=101` (สำหรับ viewer/ลิงก์หน้าเว็บ)

## 3. รัน relay ที่ local (ตัวเดียว/site — ดึงรายการกล้องจาก gateway เอง)
```bash
cd cctv
pip install -r requirements-relay.txt
cp .env.example .env        # ตั้ง GATEWAY_URL, SERVER_URL, RELAY_KEY (ไม่ต้องตั้ง RTSP)
python relay.py
```
relay จะ `GET {GATEWAY_URL}/api/devices?category=camera` ทุก `REFRESH_SEC` → start/stop/restart กล้องตาม registry
→ **เพิ่ม/ลบ/แก้กล้องในหน้า settings แล้ว relay อัปเดตเอง ไม่ต้อง restart**

## Environment Variables (relay)
| ตัวแปร | default | คำอธิบาย |
|--------|---------|----------|
| `GATEWAY_URL` | http://localhost:8002 | gateway ที่เก็บ camera devices |
| `SERVER_URL` | ws://localhost:3100/ws/relay | cctv server (/ws/relay) |
| `RELAY_KEY` | changeme | รหัส relay (ตรงกับ server) |
| `REFRESH_SEC` | 30 | ดึงรายการกล้องใหม่ทุกกี่วินาที |
| `FRAME_WIDTH/HEIGHT` `FPS` `JPEG_QUALITY` `RTSP_TRANSPORT` | 640/480 15 40 tcp | ค่า default ต่อกล้อง (override ราย device ใน settings: fps/jpegQuality/transport ใน meta) |

> RTSP ของแต่ละกล้อง = ตั้งในหน้า `/settings` (meta.rtspUrl) ไม่ใช่ใน .env แล้ว

## หมายเหตุ
- `public/index.html` (player เดี่ยวเดิม) ไม่ได้ใช้แล้ว — viewer คือ dashboard
- endpoint: `GET /health`, `GET /cameras` (ดูกล้องที่ออนไลน์)
