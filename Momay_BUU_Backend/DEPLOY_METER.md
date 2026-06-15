# คู่มือเพิ่มมิเตอร์ใหม่ (1 มิเตอร์ = 1 backend instance)

โค้ด `Momay_meter.js` เป็น **generic** แล้ว — โค้ดไฟล์เดียวใช้ deploy ได้ทุกมิเตอร์
ใช้ convention ชื่อ source = **`pm_<ชื่อห้อง>`** (เช่น `pm_101`, `pm_200`, `pm_building`)

## หลักการ
```
มิเตอร์(ESP32) ──POST /esp/pm_<ห้อง>──▶ backend instance ──เก็บ──▶ MongoDB
                                                                       │
หน้า /settings: meter device(apiBase=URL instance, source=pm_<ห้อง>) ──▶ dashboard ดึงมาแสดง
```
> ✅ **ตั้งชื่อมิเตอร์ที่ `METER_KEY` จุดเดียว** — collection ทั้งหมด (`pm_<key>s`, `*_<key>`) จะ derive ตามค่านี้
> ดังนั้น **ใช้ DB เดียวกันหลายมิเตอร์ได้** (collection แยกกันเองตาม `METER_KEY`) ขอแค่ `METER_KEY` ไม่ซ้ำกัน

## ขั้นตอน deploy มิเตอร์ใหม่ (เช่น "ห้อง 400" → `pm_400`)

### 1. Deploy บน Railway
- New Service → Deploy from repo → root = โฟลเดอร์ `Momay_BUU_Backend`
- ใช้ `Dockerfile` + `railway.json` ที่มีให้ (healthcheck `/`)
- ตั้ง Environment Variables:
  | ตัวแปร | ค่า |
  |--------|-----|
  | **`METER_KEY`** | **`400`** ← จุดเดียวที่กำหนดชื่อมิเตอร์ (default `deer`) collection จะเป็น `pm_400s`, `*_400` |
  | `MONGODB_URI` | ใช้ DB เดิมร่วมได้ (collection แยกตาม METER_KEY) หรือ DB ใหม่ก็ได้ |
  | `NODE_ENV` | `production` |
  | `CORS_ORIGINS` | โดเมน frontend (คั่นด้วย ,) — เว้นว่าง = อนุญาตหมด |
  | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | (ถ้าจะใช้ push) |
  | `SESSION_SECRET` | สุ่มสตริง |
- ได้ URL เช่น `https://momay-400-production.up.railway.app`
> มิเตอร์เดิม deer/sand: ถ้าไม่ตั้ง `METER_KEY` จะ default = `deer`; ตัว sand ให้ตั้ง `METER_KEY=sand` (ได้ collection `pm_sands`, `*_sand` เหมือนเดิม)

### 2. ตั้งค่ามิเตอร์ (ESP32) ให้ส่งข้อมูล
POST/PUT ไปที่: `https://<instance>/esp/pm_400`
(payload = ฟิลด์ไฟฟ้า เช่น `active_power_total`, `active_power_a/b/c`, `voltage`, `current`, ฯลฯ — ดู allowedFields ใน `saveESPDoc`)

ทดสอบเร็ว:
```bash
curl -X POST https://<instance>/esp/pm_400 -H "Content-Type: application/json" \
  -d '{"active_power_total":3.2,"voltage":220,"current":15}'
```

### 3. เพิ่ม meter device ในหน้า `/settings`
- เลือกห้อง (หรือสร้างห้องใหม่) → เพิ่มอุปกรณ์ประเภท **มิเตอร์ไฟ**
  - `apiBase` = URL instance (ข้อ 1)
  - `source`  = `pm_400`
- refresh dashboard → กราฟ/บิล/พลังงานของห้องนั้นจะดึงจาก backend ใหม่

## หมายเหตุ
- `source` ปัจจุบัน backend **ละเลย** (เสิร์ฟ PM_deer ของ instance เสมอ) — เป็นแค่ป้ายชื่อให้ frontend/ESP route อ่านง่าย
- endpoint ที่ dashboard ใช้: `/daily-energy/<source>`, `/daily-bill`, `/calendar`, `/solar-size`, `/daily-diff`, `/api/notifications/*`
- ถ้าอยากได้ "1 backend เสิร์ฟหลายมิเตอร์" (ไม่ต้อง deploy ต่อมิเตอร์) = ต้อง refactor multi-tenant (option C) — ยังไม่ได้ทำ
