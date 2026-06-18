# momay_ESP_pm25 — firmware เซ็นเซอร์ฝุ่น PM2.5 (Plantower PMS3003)

ใช้ระบบเดียวกับ `momay_ESP/` (WiFi + AP config portal + Settings + หน้าเว็บ + POST ขึ้น backend + mDNS)
**ต่างกันแค่:** อ่าน **เซ็นเซอร์ฝุ่น PMS3003 ผ่าน UART** แทนการอ่าน Modbus มิเตอร์ไฟ

## การต่อสาย (PMS3003 → ESP32)
| PMS3003 | ต่อกับ ESP32 |
|---|---|
| VCC (pin 1) | 5V |
| GND (pin 2) | GND |
| TX  (pin 5) | **RX2 = GPIO16** |
| RESET / SET | ปล่อยลอย = ทำงานปกติ |

> PMS3003 ส่งเฟรมเอง (passive) ทุก ~1 วินาที จึงต่อแค่ TX→RX ก็พอ (ลอจิก 3.3V)
> baud ตั้งใน `Serial2.begin(9600,...)` ใน `momay_ESP_pm25.ino`

## อ่านเซ็นเซอร์ก่อนต่อเน็ต
1. **ตอนบูต** — พิมพ์ค่าออก Serial Monitor (115200) ทันที แม้ยังไม่ต่อเน็ต
   ```
   ──── อ่าน PMS3003 (ก่อนต่อเน็ต) ────
     PM1.0 = 8 µg/m³
     PM2.5 = 14 µg/m³  (AQI 55 · ดี)
     PM10  = 19 µg/m³
   ```
2. **หน้าเว็บ `/sensor`** — อ่านสดทุกครั้งที่กด (refresh 3 วิ) โชว์ PM1.0/2.5/10 ทั้ง atm และ CF=1
   - ใช้ได้**ตอน AP** (ก่อนต่อเน็ต): ต่อ WiFi `Momay_PM_xxxxxx` → เปิด `http://192.168.4.1/sensor`
     หรือกดลิงก์ "🌫️ อ่านค่าฝุ่นเดี๋ยวนี้" ในหน้า config WiFi
   - ตอนต่อเน็ตแล้ว: `http://<ip>/sensor` หรือลิงก์ "🌫️ อ่านฝุ่นสด" หน้าหลัก

## ใช้งาน
1. อัปโหลดทั้งโฟลเดอร์ (3 ไฟล์ `.ino` คอมไพล์รวมกัน) — ต้องมี lib `ArduinoJson`
2. ต่อ WiFi `Momay_PM_xxxxxx` → ตั้ง SSID/รหัสที่หน้า portal (`192.168.4.1`)
3. ตั้ง **Server URL / interval** ที่ `/settings`

## payload ที่ POST ขึ้น gateway
ส่งเข้า **gateway** (ตัวเดียวกับที่ dashboard ใช้เป็น `VITE_DEVICES_API`) — ไม่ใช่ backend มิเตอร์ไฟ
ตั้ง **Server URL** ของ ESP (ที่ `/settings`) = **`https://<gateway>/api/sensor/data`**
JSON ส่งทุก `interval` วินาที (default 60s):
```json
{
  "deviceId": "pm-aabbcc",
  "pm1_0": 8, "pm2_5": 14, "pm10": 19,
  "pm1_0_cf1": 9, "pm2_5_cf1": 15, "pm10_cf1": 21,
  "aqi_us": 55,
  "timestamp": "2026-06-18T10:30:00Z",
  "mac_address": "AA:BB:CC:DD:EE:FF"
}
```
> `deviceId` ว่างใน `/settings` = ใช้ `pm-<MAC suffix>` อัตโนมัติ — gateway จะ **auto-register**
> เป็น device `category: 'sensor'` สถานะ `pending` ให้เอง (ค่อยตั้งห้อง/ชื่อที่หน้า Settings)

## ทำไมใช้ gateway (ไม่ใช่ Momay_meter.js)
`gateway/` เป็น single source of truth ของ "ห้อง + อุปกรณ์" อยู่แล้ว และเก็บ reading ต่อ `deviceId`
(`gw_readings`) เหมือนสวิตช์/มิเตอร์ → PM2.5 เป็นแค่ device อีกตัว ไม่ต้องมี backend แยก
(`Momay_meter.js` คือ "1 instance = 1 มิเตอร์ไฟ" — POST ฝุ่นเข้าไปจะปนข้อมูลมิเตอร์)

## ที่ทำไว้ให้รองรับแล้ว (ฝั่ง repo)
- **gateway**: `routes/sensor.js` (`POST /api/sensor/data` auto-register + เก็บ reading,
  `GET /api/sensor/:id/latest`), เพิ่ม field `pm1_0/pm2_5/pm10/aqi` ใน `models/reading.js`,
  เพิ่ม type `esp32-sensor` ใน `models/device.js`, register route ใน `server.js`
- **dashboard** (`MomayRelationshipLayer.jsx`): ตัด PM2.5 mock — การ์ดอ่าน `latest.pm2_5`
  ของ sensor device จาก `GET ${DEVICES_API}/api/devices/:deviceId` (gateway ตัวเดิม)
- **Settings (`/settings`)**: category "เซนเซอร์" → เลือกชนิด `pm25` + ตั้ง `deviceId` ให้ตรงกับ ESP

### ขั้นตอนเปิดใช้จริง
1. ต่อสาย + อัปโหลด firmware → ต่อ WiFi
2. ที่ ESP `/settings` ตั้ง Server URL = `https://<gateway>/api/sensor/data` (จด `deviceId` ที่โชว์ไว้)
3. รอ ESP ส่งข้อมูล → gateway auto-register device ใหม่ (pending)
4. ที่หน้าเว็บ `/settings` แก้ device นั้น: ตั้ง **ห้อง** + category "เซนเซอร์" → การ์ด PM2.5 ห้องนั้นจะขึ้นค่าจริง

## เทียบโฟลเดอร์ ESP
| โฟลเดอร์ | หน้าที่ |
|---|---|
| `momay_ESP/` | มิเตอร์ไฟ EM96 (ตัวเต็มเดิม) |
| `momay_ESP_ip/` | มิเตอร์ไฟ IP Power Meter |
| `momay_ESP_scan/` · `momay_ESP_check/` | เครื่องมือ debug Modbus |
| **`momay_ESP_pm25/` (นี่)** | **เซ็นเซอร์ฝุ่น PM2.5 PMS3003** |
