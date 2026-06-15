# Momay Frontend Overview — MomayBUU
> อัปเดต: 2026-06-05

---

## ภาพรวม

MomayBUU เป็น **PWA (Progressive Web App)** สำหรับแสดงข้อมูลพลังงาน + ควบคุมห้อง ของอาคารหอสมุด BUU
ทำงานทั้งแบบ browser ปกติ และ kiosk (fullscreen, 1080×1920)

---

## โครงสร้างโฟลเดอร์

```
D:\MomayBUU\
├── index.html          ← หน้าหลัก (PWA shell)
├── script.js           ← logic ทั้งหมดของหน้าหลัก
├── style.css           ← styling หลัก
├── sw.js               ← Service Worker (cache + push notification)
├── manifest.json       ← PWA config (fullscreen, portrait)
├── dashboard/          ← หน้า admin dashboard (แยกต่างหาก)
│   ├── script.js       ← admin logic (booking management, logs)
│   └── auth.js         ← JWT authentication
├── auth-backend/       ← auth server code (deploy แยก)
├── MomayDocBN/         ← local backend สำหรับ room control (deploy แยก)
├── cctv/               ← CCTV viewer
└── Control/            ← control panel
```

---

## Diagram ภาพรวม

```
┌─────────────────────────────────────────────────────────────────────┐
│                     MomayBUU (Browser / Kiosk)                     │
│                                                                     │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐    │
│  │       index.html         │  │       dashboard/             │    │
│  │       script.js          │  │       script.js + auth.js    │    │
│  │                          │  │                              │    │
│  │  • Energy display        │  │  • Admin login (JWT)         │    │
│  │  • Power chart           │  │  • Booking management        │    │
│  │  • Room booking          │  │  • Announcements             │    │
│  │  • Device control        │  │  • Logs                      │    │
│  │  • Notifications         │  │  • Multi-room energy stats   │    │
│  │  • Solar/CCTV/Calendar   │  │                              │    │
│  └──────────┬───────────────┘  └──────────────┬───────────────┘    │
└─────────────┼────────────────────────────────── ┼──────────────────┘
              │                                    │
   ┌──────────┴──────────┐             ┌──────────┴──────────┐
   │  3 Backend แยกกัน  │             │  3 Backend แยกกัน  │
   └──────────┬──────────┘             └──────────┬──────────┘
              │                                    │
   ┌──────────▼──────────────────────────────────▼──────────────────┐
   │                                                                 │
   │  momaysandbn-production.up.railway.app   ← Energy data (Sand)  │
   │  momaydocbn-production.up.railway.app    ← Room control/IoT    │
   │  aut-production.up.railway.app           ← JWT Auth (dashboard)│
   │                                                                 │
   └─────────────────────────────────────────────────────────────────┘
```

---

## Features ทั้งหมดใน script.js

### 1. PIN Gate
- PIN: `1608` (hardcoded ใน source)
- เก็บ session ใน `sessionStorage` → unlock ตลอด session
- Development bypass: บรรทัด 82 set `momay_unlocked = '1'` ตลอดเวลา (ยังเปิดอยู่)

### 2. Energy Display (หน้าหลัก)
| Feature | API | Refresh |
|---------|-----|---------|
| Realtime kW + Donut chart | `/daily-energy/pm_sand` | **ทุก 2 วินาที** |
| Daily bill (THB + Unit) | `/daily-bill` | **ทุก 10 วินาที** |
| Bill comparison (today vs yesterday) | `/daily-bill` (2 วัน) | **ทุก 60 วินาที** |
| Hourly power chart (1440 จุด) | `/daily-energy/pm_sand` | เมื่อเปลี่ยนวัน |
| Day/Night energy bar chart (7 วัน) | `/solar-size` | เมื่อเปลี่ยนวัน |

### 3. Check-in & Countdown
- ดึง active booking → แสดง countdown HH:MM:SS
- Refresh **ทุก 5 วินาที**
- ถ้ามี booking → แสดง bulb/AC status อัตโนมัติ

### 4. Device Control
| อุปกรณ์ | Protocol | API |
|---------|---------|-----|
| หลอดไฟ | Sonoff MQTT | `POST /api/toggle-device` |
| แอร์ ON/OFF | Tuya IR | `POST /api/tuya-ac` |
| แอร์ full control | Tuya IR | `POST /api/tuya-ac/scenes` |

- AC panel: ตั้ง temp (16–30°C), mode (Cool/Heat/Auto/Fan/Dry), wind (Auto/1/2/3)
- Bulb: poll confirm state 6×500ms หลัง toggle

### 5. Room Booking
- ดูตาราง schedule รายชั่วโมง (00:00–24:00)
- จองห้องพร้อม QR code ยืนยัน
- 3 ห้อง: ห้อง 101, ห้อง 200, ห้อง 300
- **ห้อง 101 เท่านั้นที่มีข้อมูล energy จริง**

### 6. Calendar
- FullCalendar แสดงค่าไฟรายวัน (kWh + บาท)
- คลิกวันเพื่อดู daily bill

### 7. Solar / Kwang Popup
- แสดง solar capacity แนะนำ, savings รายวัน/เดือน/ปี
- Export report เป็นรูปภาพ (html2canvas) หรือ Share

### 8. Notifications (Bell)
- ดึง `/api/notifications/all?limit=50` **ทุก 30 วินาที**
- แสดง badge จำนวน unread
- Types: peak, daily_bill, daily_diff
- Bell/Calendar/Kwang icon จะ shake เมื่อมี notification ใหม่

### 9. Weather
- API: Open-Meteo (Sukhothai, lat 17.008, lon 99.824)
- Refresh **ทุก 5 นาที**
- แสดงใน marquee header

### 10. CCTV
- WebSocket stream: `ws://host/ws/stream`
- รับ JPEG frames แสดง FPS counter
- มี LED indicator + offline state

### 11. Radar / Heatmap
- แสดง user density จำลอง (mock data) รายชั่วโมง
- ไม่ได้ดึงจาก API จริง

### 12. Kiosk Mode
- ตรวจ window size 1080×1920 → `scale(2)` อัตโนมัติ
- บังคับได้ด้วย `?scale=2` ใน URL

---

## Polling Summary

```
ทุก 2  วินาที  ──── Realtime kW (power bar + donut)
ทุก 5  วินาที  ──── Check-in status + countdown
ทุก 10 วินาที  ──── Daily bill
ทุก 30 วินาที  ──── Notifications
ทุก 60 วินาที  ──── Bill comparison (today vs yesterday)
ทุก 5  นาที    ──── Weather
เมื่อเปลี่ยนวัน ─── Hourly chart + Day/Night chart
```

---

## PWA / Service Worker

- **Cache name**: `momay-cache-v2.19.2`
- **Strategy**:
  - `/api/*` → Network-only (ไม่ cache)
  - HTML/CSS/JS → Network-first (fallback cache)
  - Images → Cache-first
  - `/daily-energy`, `/daily-bill`, `/solar-size` → Network-first
- **Push**: รับ push event → `showNotification()` → ส่ง message ให้ client
- **VAPID push subscription** ลงทะเบียนที่ `momaydocbn-production.up.railway.app/api/subscribe`

---

## Dashboard (Admin)

- Login ด้วย JWT (`aut-production.up.railway.app`)
- Lockout 5 attempts → 30 วินาที
- Energy config ต่อห้อง:

| ห้อง | Backend ที่ใช้ |
|------|--------------|
| ห้อง 101 | `momatdeerbn-production.up.railway.app` |
| ห้อง 200 | `momaysandbn-production.up.railway.app` |
| ห้อง 300 | `momaysandbn-production.up.railway.app` |

- Features: จัดการ booking, announcements, logs, multi-room energy stats

---

## จุดที่ควรระวัง

| จุด | รายละเอียด |
|-----|-----------|
| PIN hardcoded | `1608` อยู่ใน source code ที่ใครก็ดูได้ |
| Dev bypass เปิดอยู่ | บรรทัด 82: `sessionStorage.setItem('momay_unlocked', '1')` ทำให้ PIN ไม่ทำงาน |
| ห้อง 101 ใน dashboard | ชี้ไป `momatdeerbn.../pm_sand` แต่ DeerBN ไม่มี `/pm_sand` แล้ว |
| Push subscription URL | sw.js ชี้ไป `momaydocbn-production` ต่างจาก API_BASE ใน script.js |
| SandBN notification bug | Peak/DailyBill notification ไม่บันทึก DB (bug ที่ยังไม่แก้ใน SandBN) |
