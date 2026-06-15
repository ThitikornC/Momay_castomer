# Momay System Overview
> อัปเดต: 2026-06-05

---

## ภาพรวม

ระบบ Momay แบ่งออกเป็น **2 สายอิสระ** ตามมิเตอร์จริง:

| สาย | มิเตอร์ MAC | Frontend | Backend | MongoDB Collection |
|-----|------------|---------|---------|-------------------|
| **Deer** | `00:4B` | `D:\Momay_deer` | `D:\MomayDeerBN` | `pm_deers` |
| **Sand** | `D4:8A` | `D:\MomaySand` | `D:\MomaySandBN` | `pm_sands` |

แต่ละสายมี backend, frontend, และ MongoDB collection เป็นของตัวเองทั้งหมด ไม่แชร์กัน

---

## Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        PHYSICAL LAYER                           │
│                                                                  │
│   ┌─────────────────┐           ┌─────────────────┐             │
│   │  Meter DEER     │           │  Meter SAND     │             │
│   │  MAC: 00:4B     │           │  MAC: D4:8A     │             │
│   │  (ESP32)        │           │  (ESP32)        │             │
│   └────────┬────────┘           └────────┬────────┘             │
└────────────┼───────────────────────────── ┼────────────────────┘
             │ HTTP POST                     │ HTTP POST
             │ /esp/pm_deer                  │ /esp/pm_sand
             ▼                               ▼
┌────────────────────────┐   ┌────────────────────────┐
│   MomayDeerBN          │   │   MomaySandBN          │
│   (Railway)            │   │   (Railway)            │
│                        │   │                        │
│  momatdeerbn-          │   │  momaysandbn-          │
│  production.up.        │   │  production.up.        │
│  railway.app           │   │  railway.app           │
│                        │   │                        │
│  px_dh-daily-bill.js   │   │  px_dh-daily-bill.js   │
└────────────┬───────────┘   └────────────┬───────────┘
             │ mongoose                    │ mongoose
             ▼                             ▼
┌────────────────────────┐   ┌────────────────────────┐
│   MongoDB Atlas        │   │   MongoDB Atlas        │
│                        │   │                        │
│   pm_deers             │   │   pm_sands             │
│   peak_noti_deer       │   │   peak_noti_sand       │
│   daily_bill_noti_deer │   │   daily_bill_noti_sand │
│   daily_diff_noti_deer │   │   daily_diff_noti_sand │
│   test_noti_deer       │   │   test_noti_sand       │
│   push_subscriptions   │   │   push_subscriptions   │
└────────────────────────┘   └────────────────────────┘
             │                             │
             │ fetch API                   │ fetch API
             ▼                             ▼
┌────────────────────────┐   ┌────────────────────────┐
│   Momay_deer           │   │   MomaySand            │
│   (Frontend)           │   │   (Frontend)           │
│   D:\Momay_deer        │   │   D:\MomaySand         │
│                        │   │                        │
│   script.js            │   │   script.js            │
│   index.html           │   │   index.html           │
└────────────────────────┘   └────────────────────────┘
             │                             │
             ▼                             ▼
┌────────────────────────┐   ┌────────────────────────┐
│   User (Browser)       │   │   User (Browser)       │
│   Dashboard Deer       │   │   Dashboard Sand       │
└────────────────────────┘   └────────────────────────┘
```

---

## Backend API Endpoints (ทั้งคู่มีเหมือนกัน)

### ESP Receivers (รับข้อมูลจากมิเตอร์)
| Method | Route | หน้าที่ |
|--------|-------|---------|
| POST/PUT | `/esp/pm_deer` | รับข้อมูลจากมิเตอร์ 00:4B → บันทึกลง `pm_deers` |
| POST/PUT | `/esp/pm_sand` | รับข้อมูลจากมิเตอร์ D4:8A → บันทึกลง `pm_sands` |

### Dashboard APIs
| Route | หน้าที่ |
|-------|---------|
| `GET /daily-bill` | ค่าไฟวันนี้ (kWh + บาท) |
| `GET /daily-energy` | ชุดข้อมูล active_power ตามวันที่ |
| `GET /daily-energy/:source` | เวอร์ชัน legacy รองรับ `pm_deer` / `px_pm3250` |
| `GET /calendar` | ข้อมูลพลังงานรายวันสำหรับ FullCalendar |
| `GET /daily-diff` | เปรียบเทียบพลังงาน เมื่อวาน vs วันก่อน |
| `GET /hourly-bill/:date` | ค่าไฟรายชั่วโมง |
| `GET /hourly-summary` | สรุปพลังงานรายชั่วโมง |
| `GET /minute-power-range` | ข้อมูลพลังงานตาม range เวลา |
| `GET /solar-size` | คำนวณขนาดโซลาร์เซลล์ที่เหมาะสม |

### Push Notification APIs
| Route | หน้าที่ |
|-------|---------|
| `POST /api/subscribe` | ลงทะเบียน push subscription |
| `GET /api/notifications/all` | ดึง notification ทุก type |
| `GET /api/notifications/recent` | ดึง notification ล่าสุด |
| `GET /api/notifications/stats` | สถิติ notification |
| `PATCH /api/notifications/mark-read` | ทำเครื่องหมายอ่านแล้ว |
| `PATCH /api/notifications/mark-all-read` | ทำเครื่องหมายอ่านทั้งหมด |
| `DELETE /api/notifications` | ลบ notification |

### Auto Jobs (node-cron)
| Schedule | หน้าที่ |
|----------|---------|
| ทุก 1 นาที (`* * * * *`) | ตรวจ peak power ใหม่ → push notification |
| ทุกวันตี 1 (`0 0 1 * * *`, Asia/Bangkok) | คำนวณค่าไฟเมื่อวาน → push notification |

---

## Data Flow (ข้อมูลไหลยังไง)

```
มิเตอร์ส่ง HTTP POST ทุก ~1 นาที
         │
         ▼
Backend รับ → saveESPDoc() → บันทึกลง MongoDB
         │
         ├── cron ทุก 1 นาที: ตรวจ active_power_total ล่าสุด
         │   └── ถ้าเกิน peak วันนี้ → sendPushNotification('peak')
         │
         └── cron ตี 1: คำนวณ kWh เมื่อวาน
             └── sendPushNotification('daily_bill')

Frontend poll ทุก 2 วินาที (power bar)
Frontend poll ทุก 10 วินาที (daily bill)
```

---

## MongoDB Collections

### Deer Backend
```
pm_deers                    ← ข้อมูลไฟฟ้าจากมิเตอร์ 00:4B
peak_notifications_deer     ← แจ้งเตือน peak power
daily_bill_notifications_deer ← แจ้งเตือนค่าไฟรายวัน
daily_diff_notifications_deer ← แจ้งเตือนเปรียบเทียบวัน
test_notifications_deer     ← notification ทดสอบ
push_subscriptions          ← Web Push subscriptions
```

### Sand Backend
```
pm_sands                    ← ข้อมูลไฟฟ้าจากมิเตอร์ D4:8A
peak_notifications_sand
daily_bill_notifications_sand
daily_diff_notifications_sand
test_notifications_sand
push_subscriptions
```

---

## สิ่งที่ต้องตั้งใน Railway (manual action required)

| Repo | Environment Variables ที่ต้องตั้ง |
|------|----------------------------------|
| MomayDeerBN | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| MomaySandBN | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SESSION_SECRET` |
