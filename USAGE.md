# คู่มือการใช้งาน — Momay BUU (People Flow + Energy + IoT)

ระบบ dashboard + ตั้งค่ากลาง + คุมอุปกรณ์ (มิเตอร์ไฟ / สวิตช์ / แอร์ IR / กล้อง) สำหรับสำนักหอสมุด ม.บูรพา

---

## 1. โครงสร้างระบบ (monorepo — 1 repo หลาย service)

```
frontend/            React SPA — dashboard /momaymodel, ตั้งค่า /settings, viewer /cam, เช็คอิน /checkin
gateway/             ศูนย์กลาง (Node+MongoDB+MQTT) — registry ห้อง/อุปกรณ์, คุมสวิตช์, booking, auto on/off
Momay_BUU_Backend/   มิเตอร์ไฟ (Momay_meter.js) — deploy 1 instance/มิเตอร์ ด้วย METER_KEY
cctv/                กล้อง — server.py (cloud, multi-cam) + relay.py (local, ดึง RTSP จาก registry)
api-gateway/         person-counter MJPEG (ระบบนับคน)
```

ไดอะแกรมย่อ:
```
ผู้ใช้ ──▶ frontend ──┬─ /api/config, /api/devices, /api/bookings, /api/tasmota ──▶ gateway ──▶ MongoDB + MQTT broker
                      ├─ /daily-bill, /daily-energy ──▶ Momay_meter (deer/sand/…)
                      └─ /ws/stream?cam= ──▶ cctv server ◀── relay.py(local) ◀── กล้อง RTSP
```

---

## 2. รัน Local (สำหรับพัฒนา)

> ⚠️ ถ้า shell ตั้ง `NODE_ENV=production` ให้ติดตั้ง deps ด้วย `npm install --include=dev` (ไม่งั้น vite/devDeps จะไม่ลง)

```bash
# 1) gateway (ศูนย์กลาง)
cd gateway && npm install
cp .env.example .env        # ใส่ MONGODB_URI, MQTT_BROKER ฯลฯ
node seed.js                # สร้างห้อง+มิเตอร์เริ่มต้น (ครั้งแรก)
node server.js              # :8002

# 2) frontend
cd frontend && npm install --include=dev
echo "VITE_DEVICES_API=http://localhost:8002" > .env.local
npm run dev                 # :5173

# 3) มิเตอร์ (ถ้าจะรันโลคัล)
cd Momay_BUU_Backend && npm install && node Momay_meter.js

# 4) cctv relay (รันที่เครื่องในวงเดียวกับกล้อง)
cd cctv && pip install -r requirements-relay.txt
cp .env.example .env        # ใส่ GATEWAY_URL, SERVER_URL, RELAY_KEY
python relay.py
```
เปิด `http://localhost:5173/momaymodel`

---

## 3. การใช้งานหน้าเว็บ

### 3.1 Dashboard (`/momaymodel`)
- **เลือกห้อง** ปุ่มล่างผัง: รวม / 101 / 200 / 300
- **กราฟพลังงาน + บิล + วงกลมวันนี้/เมื่อวาน + แนวโน้ม** — ดึงจากมิเตอร์ของห้องที่เลือก
- **แถบควบคุม:**
  - 💡 **แสงสว่าง** — 1 ปุ่ม/สวิตช์ (กดเปิด/ปิด, รอ MQTT ยืนยันจริงก่อนแสดงไฟติด/ดับ, offline = "…")
  - ❄️ **แอร์** — เปิด panel ตั้งอุณหภูมิ/โหมด
  - 📷 **กล้อง** — เปิด popup ดู stream
  - **PM2.5** — ค่าฝุ่น
- **Booking** (ปุ่มมุมบนกราฟ) → ดูตาราง + จองห้อง

### 3.2 จองห้อง + QR เช็คอิน
1. กด **Booking** → เลือกวัน/เวลา/ชื่อ → **ยืนยันการจอง**
2. ระบบสร้าง **QR** (และ **บันทึกลงเครื่องอัตโนมัติ**) — QR = ลิงก์ `/checkin?id=...`
3. ผู้จอง **สแกน QR** ด้วยมือถือ → หน้าเช็คอิน → ระบบบันทึก check-in
4. **ไฟห้องเปิดอัตโนมัติ** ในช่วงเวลาจอง (auto-control), หมดเวลา → ปิดเอง

### 3.3 หน้าตั้งค่ากลาง (`/settings`)
จัดการได้ทั้งหมดผ่านเว็บ ไม่ต้องแก้โค้ด:
- **ห้อง** — เพิ่ม/ลบ/แก้ (ชื่อ, ป้ายสั้น, ลำดับ, ชนิด room/building, รูปผัง, heatmap)
- **อุปกรณ์ต่อห้อง** — เพิ่ม/ลบ/แก้ แยกตามประเภท:

| ประเภท | ฟิลด์ที่กรอก |
|--------|--------------|
| **มิเตอร์ไฟ** | `apiBase` (URL backend) + `source` (เช่น pm_101) |
| **สวิตช์ WiFi** | `mqttTopic` (Tasmota) + `channel` (เลขรีเลย์ 1,2,… เว้น=รีเลย์เดียว) |
| **IR Remote** | `tuyaDeviceId` + `irModel` + `remoteId` |
| **กล้อง** | `camId` + `rtspUrl` (relay ดึงไปใช้) + `streamKind`/`wsUrl` (สำหรับดู) + fps/quality |

> หลังเพิ่ม/แก้ → **refresh dashboard** เพื่อเห็นผล

---

## 4. เพิ่มอุปกรณ์ใหม่ (ไม่ต้องแตะโค้ด)

### มิเตอร์ใหม่
1. Deploy `Momay_BUU_Backend/` เป็น service ใหม่บน Railway → ตั้ง env **`METER_KEY=<ชื่อ>`** + `MONGODB_URI`
2. ตั้ง ESP32 ให้ POST เข้า `<instance>/esp/pm_<ชื่อ>`
3. หน้า `/settings` → เพิ่มอุปกรณ์ **มิเตอร์ไฟ** → `apiBase` = URL instance, `source` = `pm_<ชื่อ>`
> ดูละเอียด: `Momay_BUU_Backend/DEPLOY_METER.md`

### สวิตช์ (หลายรีเลย์/หลายโซน)
- `/settings` → เพิ่ม **สวิตช์** หลายตัวในห้องเดียวได้:
  - คนละเครื่อง → `mqttTopic` ต่างกัน
  - เครื่องเดียวหลายรีเลย์ → `mqttTopic` เดิม + `channel` = 1, 2, 3…
- dashboard จะขึ้นปุ่มแยกทุกตัวตาม `label`

### กล้อง (RTSP — ไม่ต้อง hardcode)
1. `/settings` → เพิ่ม **กล้อง** → `camId` + `rtspUrl` (+ wsUrl สำหรับดู)
2. relay.py (รันอยู่) จะดึง config มาดึงภาพให้เองภายใน ~30 วิ (ไม่ต้อง restart)
3. กล้องแต่ละตัวมี **ลิงก์ viewer** ในหน้า settings (ปุ่มคัดลอก/เปิดดู) → แชร์/ฝังหน้าเว็บได้

---

## 5. Deploy (Railway — 1 repo หลาย service)
ตั้งแต่ละ service เป็น Railway service โดยกำหนด **Root Directory** + Dockerfile ของโฟลเดอร์นั้น + env:

| service | Root Dir | env หลัก |
|---|---|---|
| frontend | `frontend/` | `VITE_DEVICES_API`, `VITE_GATEWAY_URL`, `VITE_HOME=/momaymodel` |
| gateway | `gateway/` | `MONGODB_URI`, `MQTT_BROKER/USERNAME/PASSWORD`, `BOOKINGS_DB` |
| meter (ต่อตัว) | `Momay_BUU_Backend/` | `METER_KEY`, `MONGODB_URI` |
| cctv server | `cctv/` | `RELAY_KEY` |
| relay | — | **ไม่ deploy** รันที่ local |

---

## 6. หมายเหตุ / ข้อจำกัดปัจจุบัน
- **ยังไม่มี auth** ที่ gateway/settings — ก่อนใช้งานจริงควรใส่ (มี `GATEWAY_KEY` เตรียมไว้)
- **แอร์ผ่าน gateway (Tuya IR)** — signing แก้ถูกแล้ว แต่ endpoint AC ต้องใช้ `/v2.0/infrareds/{ir}/air-conditioners/{remote}/command` (ยังรอ port จากตัวที่ทำงานได้)
- **มิเตอร์รวม "ทั้งอาคาร"** ยังเป็น placeholder — ตั้ง backend จริง หรือทำ aggregate
- **MQTT broker** ควรใช้ TLS + รหัสที่แข็งแรงสำหรับ production
