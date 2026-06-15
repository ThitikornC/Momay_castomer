# แผนที่ UI หน้า `/momaymodel` → ตำแหน่งในโค้ด

ไฟล์เดียว: [`frontend/src/pages/MomayRelationshipLayer.jsx`](frontend/src/pages/MomayRelationshipLayer.jsx) (~3030 บรรทัด)
คอมโพเนนต์หลักที่ render หน้านี้: **`MomayRelationshipLayerInner()`** — เริ่มบรรทัด **2314**, ส่วน `return(...)` (JSX) เริ่ม ~**2557**

> ⚠️ เลขบรรทัดอาจขยับเมื่อแก้โค้ด — ดูคู่กับ comment marker `{/* ══ ... ══ */}` ในไฟล์

---

## โครงหน้า (บน → ล่าง ตามที่ผู้ใช้เห็น)

| ส่วน UI | บรรทัด | หมายเหตุ |
|---|---|---|
| **กรอบบน "Relationship Layer"** | `2557` `{/* ══ Relationship Layer ══ */}` | กรอบครอบส่วนบนทั้งหมด |
| ├ แถบข้อความวิ่ง (ticker) | ~`2586` | "Collaborative Sensing Platform by Momay…" |
| ├ การ์ดข้อมูลผู้ใช้ | `2631` | User Number / Contract / Date Installed |
| ├ ไอคอน **ปฏิทิน** → เปิด Calendar popup | `2693` (`calIconRef`) | |
| ├ ไอคอน **โซลาร์** → เปิด Solar popup | `2719` (`solarIconRef`) | |
| ├ ไอคอน **กระดิ่ง** noti → เปิด Notif popup | `2749` (`bellIconRef`) | badge = `notifCount` |
| ├ การ์ด **"พลังงานวันนี้" / "แนวโน้มวันนี้"** | ~`2762`–`2775` | ค่าจาก `energyToday`/`energyYesterday` |
| └ **Floor Plan Viewer** | `2592` `{/* ── Floor Plan Viewer ── */}` | ผัง 3 มิติ + heatmap |
| &nbsp;&nbsp;├ **ปุ่มเลือกห้อง** (รวม/101/200/300) | `2817` (`BUU_ROOMS.map`) | กดเปลี่ยน `selectedFloor` |
| &nbsp;&nbsp;└ ผังแต่ละชั้น + **HeatmapAnimatedCanvas** | `2848`, `2883` | |
| **Mobile Control Panel** (จอ <900px) | `2909` `{/* ══ Mobile Control Panel ══ */}` | |
| **กราฟพลังงาน** `<MomayPowerChart>` | `2963` / call `2965` | apiBase/device ตามห้อง |
| **แถบควบคุม** `<MomayStatusRow>` | `2994` / call `2997` | ไฟ/แอร์/กล้อง/PM2.5 |
| **บิล + บาร์รายสัปดาห์** `<MomayBillPanel>` | `3004` / call `3006` | |
| **แถวล่าง** `<LayerGreedy>` + `<LayerDP>` | `3009` / `3013` / `3018` | embed 2 เลเยอร์ |
| **Popups** (ซ่อนจนกด) | Booking `2973` · Calendar `2978` · Solar `2983` · Notif `2988` | |

---

## คอมโพเนนต์ย่อย (จุดนิยาม)

| คอมโพเนนต์ | บรรทัด | ทำอะไร |
|---|---|---|
| `HeatmapAnimatedCanvas` | `152` | วาด heatmap เคลื่อนไหวบนผัง |
| `DonutMetric` | `422` | วงโดนัทเปอร์เซ็นต์ |
| `FloorTrackCard` / `TotalTrackCard` | `467` / `498` | การ์ดจำนวนคนต่อชั้น |
| `MomayCalendarPopup` | `656` | ปฏิทินพลังงานรายวัน (ใช้ `/calendar`) |
| `MomaySolarPopup` | `826` | คำนวณโซลาร์ (ใช้ `/solar-size`) |
| `MomayNotifPopup` | `1131` | รายการแจ้งเตือน (`/api/notifications/*`) |
| **`MomayBookingPopup`** | `1253` | จองห้อง + **สร้าง QR เช็คอิน + auto-save** (QR effect ~`1278`, render QR ~`1390`) |
| **`MomayPowerChart`** | `1425` | กราฟ power รายวัน (`_fetchEnergyForDate`) |
| **`MomayStatusRow`** | `1650` | แถบคุมอุปกรณ์ (ดูตารางล่าง) |
| **`MomayBillPanel`** | `2127` | บิลวันนี้/เมื่อวาน + บาร์ Day/Night 7 วัน |
| `mapConfigRooms` | `390` | แปลง `/api/config` → รูปแบบ `BUU_ROOMS` |

---

## ภายใน `MomayStatusRow` (แถบควบคุม) — บรรทัด 1650+

| ส่วน | บรรทัด | หมายเหตุ |
|---|---|---|
| รับ props `room`, `devices` + แยก switch/ir/camera | ~`1650`–`1657` | |
| poll สถานะสวิตช์จาก gateway (`meta.relay`) | ~`1690` | source of truth จาก MQTT |
| `toggleSwitch` (รอ MQTT ยืนยันจริง) | ~`1740` | ไม่ optimistic |
| `sendAcCommand` (แอร์ → gateway/tuya หรือ momaybuu) | ~`1760` | |
| CCTV ws/mjpeg connect | ~`1790` | จาก camera device |
| สร้าง `lightItems` (1 ปุ่ม/สวิตช์) + items อื่น | ~`1900` | |
| render การ์ดควบคุม (ไฟ/แอร์/กล้อง/PM2.5) | ~`1965` | "กำลังสั่ง…" ตอน pending |

---

## ข้อมูล/ตรรกะสำคัญใน `MomayRelationshipLayerInner` (2314+)

| สิ่ง | บรรทัด |
|---|---|
| โหลด config จาก `/api/config` (แทน BUU_ROOMS) + cache | ~`2330` (effect) |
| weather (open-meteo) | ~`2367` |
| poll noti (ตามมิเตอร์ห้อง) | ~`2380` |
| โหลดบิลวันนี้/เมื่อวาน (ตามมิเตอร์ห้อง) | ~`2420` |
| active-booking poll | ~`2449` |
| `selectedFloor` (ห้องที่เลือก) | state ใน Inner |

---

## ที่มาข้อมูลของแต่ละส่วน (ห้องที่เลือก → backend)
- **กราฟ/บิล/พลังงาน** → `BUU_ROOMS[selectedFloor].apiBase` + `.device` (meter device จาก settings)
- **ไฟ/สวิตช์** → `gateway /api/tasmota/:deviceId/power` (switch device)
- **แอร์** → `gateway /api/tuya/:deviceId/ir/ac` (ir-remote device) *(หรือ fallback momaybuu)*
- **กล้อง** → `wsUrl`/`camId` ของ camera device
- **จอง/เช็คอิน** → `gateway /api/bookings`, `/api/active-booking`, `/checkin`

ดูภาพรวมการใช้งานทั้งระบบที่ [USAGE.md](USAGE.md)

---

## แถวล่าง — 2 เลเยอร์อัลกอริทึม (ฝังใน /momaymodel)
render ที่ `3009`–`3018` (ซ้าย = LayerGreedy, ขวา = LayerDP) แสดงด้วย `zoom: 0.72`
เป็น **คอมโพเนนต์หน้าเต็มที่ deploy เดี่ยวได้ด้วย** (`main-greedy.jsx`/`main-dp.jsx`, `Dockerfile.greedy`/`.dp`, route `/layer-greedy`/`/layer-dp`)

### LayerGreedy — [`frontend/src/pages/LayerGreedy.jsx`](frontend/src/pages/LayerGreedy.jsx) (371 บรรทัด)
วิเคราะห์ **ความหนาแน่นโซนแบบ Greedy** จากกล้องนับคน
| ส่วน | บรรทัด | หมายเหตุ |
|---|---|---|
| นิยามคอมโพเนนต์ | `39` `export default function LayerGreedy()` | |
| **ที่มาข้อมูล** | `41`,`55` | `apiBase` จาก `?gateway=` หรือ `VITE_GATEWAY_URL` → `GET /api/cameras` (api-gateway person-counter) |
| fallback ถ้าไม่มี gateway | `9` `MOCK_CAMS` | กล้อง mock + % |
| สีตาม % | `25` `camColor` / `31` `camLabel` | <40 เขียว, <70 เหลือง, <85 ส้ม, ≥85 แดง |
| หัวข้อ (h1) | `128` | |
| section **"ความหนาแน่นของโซน"** | `144` | การ์ดกล้อง + % |
| section **"ระดับความหนาแน่น"** | `217` | |
| section **"แผนที่ความหนาแน่น"** | `275` | |
> ⚠️ ใช้กล้องจาก **api-gateway** (ระบบนับคน) ไม่ใช่ cctv — ถ้าไม่ตั้ง `VITE_GATEWAY_URL` จะโชว์ MOCK_CAMS

### LayerDP — [`frontend/src/pages/LayerDP.jsx`](frontend/src/pages/LayerDP.jsx) (331 บรรทัด)
แสดง **heatmap ความหนาแน่นแบบ DP (Dynamic Programming)** — ปัจจุบัน **ข้อมูล mock/static**
| ส่วน | บรรทัด | หมายเหตุ |
|---|---|---|
| นิยามคอมโพเนนต์ | `36` `export default function LayerDP()` | ไม่มี fetch — ข้อมูลคงที่ |
| **ข้อมูลโซน (mock)** | `19` `DP_ZONE_ROWS` | grid 3×16 ค่าความหนาแน่น 0–1 |
| สี gradient ตามค่า | `4` `heatColor` | น้ำเงิน→เขียว→เหลือง→แดง |
| เส้น smooth (Catmull-Rom) | `27` `smooth` | |
| หัวข้อ (h1) | `100` | ไอคอน Brain |
| SVG heatmap (gradient/grid/cells) | `241`–`278` | วาดจาก `DP_ZONE_ROWS` |
> ⚠️ LayerDP **ยังไม่ต่อข้อมูลจริง** (ใช้ `DP_ZONE_ROWS` คงที่) — ถ้าจะทำให้ live ต้องดึงค่าจาก backend แล้วแทน `DP_ZONE_ROWS`

### สรุปความต่าง
| | LayerGreedy | LayerDP |
|---|---|---|
| อัลกอริทึม | Greedy (จัดโซนตาม % กล้อง) | Dynamic Programming |
| ข้อมูล | **live** จาก api-gateway `/api/cameras` (มี mock fallback) | **mock คงที่** (`DP_ZONE_ROWS`) |
| fetch | มี (`55`) | ไม่มี |
