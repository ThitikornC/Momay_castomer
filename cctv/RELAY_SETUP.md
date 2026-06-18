# MomayBUU CCTV Relay — ติดตั้ง & ใช้งานที่ไซต์

Relay = โปรแกรมที่รัน **ที่หน้างาน** (เครื่องที่อยู่วงเดียวกับกล้อง) ดึงภาพ RTSP จากทุกกล้อง
→ (ถ้าเปิด) ตรวจจับคน วาดกรอบ+นับ → ส่งขึ้น CCTV server บนคลาวด์ → โผล่ในหน้า Momay

> **1 ไซต์ = รัน relay ตัวเดียว** (ดึงทุกกล้องจาก registry เอง) · เพิ่ม/แก้กล้องทำที่หน้า `/settings`

---

## 1. ภาพรวมระบบ (Architecture)

```
            ┌──────────── ที่ไซต์ (เครื่องเดียว, วงเน็ตเดียวกับกล้อง) ───────────┐
            │                                                                   │
 กล้อง 1 ─RTSP─┐                                                                  │
 กล้อง 2 ─RTSP─┤   ┌─────────── relay.py ───────────┐    ┌──── panel.py ────┐    │
 กล้อง 3 ─RTSP─┘   │ ดึงทุกกล้องจาก registry          │    │ หน้าเว็บตั้งค่า    │    │
            │      │ → (option) ตรวจจับคน detector.py │◀──│ แก้ .env/start/  │    │
            │      │ → encode JPEG                   │    │ stop/ดู log      │    │
            │      └───────────────┬─────────────────┘    └──────────────────┘    │
            └──────────────────────┼────────────────────────────────────────────┘
                                   │  WS  /ws/relay?key=&cam=<id>   (ส่งภาพขึ้นคลาวด์)
                                   ▼
                    ┌──────── CCTV server (Railway) ────────┐
                    │ cctv-production-c602.up.railway.app   │
                    │ แยกภาพตาม cam id, ให้ viewer ดึง        │
                    └───────────────┬───────────────────────┘
                                    │  WS  /ws/stream?cam=<id>
                                    ▼
                         หน้า Momay (dashboard / /cam)

         gateway (registry) = gatewaycctvswirroombooking-production.up.railway.app
         relay ถาม:  GET /api/devices?category=camera  → ได้ camId + rtspUrl ของทุกกล้อง
```

## 2. ขั้นตอนการตรวจจับคน (Person detection flow)

```
เฟรมจาก RTSP ──► ทุก DETECT_EVERY_N เฟรม? ──ใช่──► detector.detect(frame)  (รันใน thread)
       │                  │                            │
       │                  ไม่ใช่                       ▼
       │                  │                     boxes = [(x1,y1,x2,y2,conf)...]  (เฉพาะ "person")
       ▼                  ▼                            │
   ใช้ boxes เดิม ◄────────┴──────────◄─────────────────┘
       │
       ▼
   วาดกรอบ + ป้าย "Persons: N" ──► encode JPEG ──► ส่งขึ้น server
```

- **โมเดล:** `ssd` = SSD MobileNet V2 COCO ผ่าน `cv2.dnn` (TensorFlow Model Zoo, **Apache-2.0 → ขายได้**)
  โหลด `.pb` อัตโนมัติครั้งแรก (`models/`), ถ้าโหลดไม่ได้ → fallback `hog`
- **`hog`** = `cv2.HOGDescriptor` (built-in opencv, Apache-2.0) เบา ไม่ต้องโหลดอะไร
- ทั้งหมดอยู่ใน `opencv-python` ไม่เพิ่ม dependency · **ไม่ใช้ YOLO** (YOLO = AGPL ขายไม่ได้)

---

## 3. ติดตั้งที่เครื่องใหม่ (ง่ายสุด)

1. ติดตั้ง **Python 3.9+** (Windows: ติ๊ก *Add Python to PATH*)
2. ก๊อปโฟลเดอร์ `cctv/` ไปเครื่องนั้น (หรือ `git clone` ทั้ง repo)
3. ดับเบิลคลิก:
   - **Windows** → `setup.bat`
   - **Linux / macOS / Pi** → `bash setup.sh`

สคริปต์จะ: สร้าง venv → ลง dependency → เปิด **Control Panel** ที่ `http://127.0.0.1:8090` และ start relay ให้เลย

## 3.5 ทำเป็นไฟล์ติดตั้ง .exe (เครื่องปลายทางไม่ต้องลง Python)

มี 2 แบบ — build ครั้งเดียวบนเครื่อง Windows ที่มี Python แล้วเอาผลลัพธ์ไปแจก:

**A) โฟลเดอร์พกพา (ง่ายสุด)**
1. ดับเบิลคลิก **`build_exe.bat`** → ได้ `dist\MomayRelay\`
2. zip โฟลเดอร์ `dist\MomayRelay\` ไปวางที่เครื่องไซต์ แตกแล้วรัน **`MomayRelay.exe`** ได้เลย

**B) ตัวติดตั้งจริง (Setup.exe + เปิดอัตโนมัติตอนบูต)**
1. รัน `build_exe.bat` (ข้อ A) ก่อน
2. ลง [Inno Setup](https://jrsoftware.org/isdl.php) → เปิด **`installer.iss`** → กด **Compile**
3. ได้ `Output\MomayRelay-Setup.exe` — ติดตั้งที่เครื่องไซต์ (ติ๊ก "เปิดอัตโนมัติเมื่อเข้า Windows" ได้)
   ติดตั้งแบบ per-user (LocalAppData) จึงเขียน `.env`/โมเดลได้ ไม่ติดสิทธิ์ Program Files

> ทั้ง 2 แบบ: รัน `MomayRelay.exe` = เปิด Control Panel + start relay · `MomayRelay.exe --relay` = relay ล้วน
> `.env` และโมเดลที่ดาวน์โหลด จะอยู่**ข้าง exe** (แก้ผ่าน Control Panel ได้ตามปกติ)

## 4. หน้า Control Panel (`panel.py`)

เปิด `http://127.0.0.1:8090` แล้วตั้งค่าได้จากเบราว์เซอร์ (ไม่ต้องแก้ไฟล์):

| ส่วน | ตั้งอะไร |
|------|---------|
| การเชื่อมต่อ | `GATEWAY_URL`, `SERVER_URL`, `RELAY_KEY` (ต้องตรงกับ server) |
| ค่า default ต่อกล้อง | width/height, FPS, JPEG quality, transport |
| ตรวจจับคน | เปิด/ปิด, โมเดล (ssd/hog), conf, detect ทุกกี่เฟรม |
| ปุ่ม | Start / Stop / Restart + ดู log สด |

กด **บันทึก + รีสตาร์ท** → เขียน `.env` ให้ + restart relay อัตโนมัติ

## 5. เพิ่มกล้องใหม่ (ทำที่ Momay `/settings` เท่านั้น)

อุปกรณ์ประเภท **กล้อง**:
- `camId` = id ไม่ซ้ำ (เช่น 200, 201)
- `rtspUrl` = `rtsp://user:pass@ip:554/...` — **ถ้ารหัสผ่านมี `@` ต้องเปลี่ยนเป็น `%40`**
- `streamKind` = **ws**
- `wsUrl` = `wss://cctv-production-c602.up.railway.app/ws/stream?cam=<camId>`

relay เห็นกล้องใหม่เองภายใน `REFRESH_SEC` (30 วิ) — ไม่ต้อง restart

---

## ตัวแปร `.env` (relay)

| ตัวแปร | default | ความหมาย |
|--------|---------|----------|
| `GATEWAY_URL` | — | gateway ที่เก็บกล้อง (`/api/devices?category=camera`) |
| `SERVER_URL` | — | CCTV server `/ws/relay` |
| `RELAY_KEY` | changeme | ต้องตรงกับ ENV ของ server |
| `REFRESH_SEC` | 30 | ดึงรายการกล้องใหม่ทุกกี่วิ |
| `FRAME_WIDTH/HEIGHT` `FPS` `JPEG_QUALITY` `RTSP_TRANSPORT` | 640/480 15 40 tcp | ค่า default ต่อกล้อง (override รายตัวที่ /settings) |
| `DETECT_ENABLED` | 0 | เปิดตรวจจับคน (1=เปิด) |
| `DETECT_BACKEND` | ssd | `ssd` \| `hog` \| `none` |
| `DETECT_CONF` | 0.5 | ความมั่นใจขั้นต่ำ 0–1 |
| `DETECT_EVERY_N` | 3 | detect ทุกกี่เฟรม (มาก=CPU เบา) |
