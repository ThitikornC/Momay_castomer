/**
 * ประเมินสถานะอุปกรณ์ "ตามความสด" (lastSeen) แทนการเชื่อ field status ดิบใน DB
 *
 * เหตุผล: status ใน DB ถูกตั้งครั้งเดียวตอน seed/สร้าง (เช่น มิเตอร์ = active เสมอ)
 * ไม่ได้สะท้อนว่าอุปกรณ์ยังส่งข้อมูลอยู่จริงไหม → ที่นี่คำนวณ active/offline จาก
 * lastSeen ว่าเก่ากว่าเกณฑ์ไหม + แนบ "เหตุผล + คำแนะนำ" เวลา offline
 *
 * lastSeen มาจาก heartbeat จริง:
 *   - tasmota  → MQTT (services/mqtt.js)
 *   - esp32    → routes/esp32.js
 *   - sensor   → routes/sensor.js
 *   - meter    → services/meterPoll.js (poll backend มิเตอร์)
 */
const STALE_MIN = Number(process.env.DEVICE_STALE_MIN) || 15;     // เกิน N นาที = offline
const STALE_MS  = STALE_MIN * 60 * 1000;

// เหตุผล/คำแนะนำเริ่มต้น แยกตามชนิดอุปกรณ์ (ใช้เมื่อ poller ไม่ได้เขียน meta.health ไว้)
function genericReason(d, ageMin) {
  const old = `ไม่มีสัญญาณเกิน ${ageMin} นาที`;
  switch (d.category) {
    case 'switch':
      return { reason: `${old} — สวิตช์หลุดจาก MQTT`, hint: 'เช็คไฟ/Wi-Fi ของปลั๊ก Tasmota และว่า MQTT broker ทำงานอยู่' };
    case 'sensor':
      return { reason: `${old} — เซนเซอร์ไม่ได้ส่งค่า`, hint: 'เช็คไฟ/เน็ตของบอร์ดเซนเซอร์ และว่ามัน POST เข้า gateway อยู่' };
    case 'meter':
      return { reason: `${old} — มิเตอร์ไม่ส่งข้อมูล`, hint: 'เช็คไฟ/เน็ตของ ESP มิเตอร์ และ backend (apiBase) ออนไลน์ไหม' };
    default:
      return { reason: old, hint: 'เช็คไฟและการเชื่อมต่อเครือข่ายของอุปกรณ์' };
  }
}

/**
 * @returns {{ status:'active'|'offline'|'pending', reason?:string, hint?:string }}
 */
function evaluate(d, now = Date.now()) {
  if (d.status === 'pending') return { status: 'pending' };           // ยังไม่จับคู่ → คงไว้
  // อุปกรณ์ที่ไม่มี heartbeat เข้า gateway (เช่น กล้อง) → ไม่ตัดสินจากความสด คงค่าเดิม
  if (!d.lastSeen) return { status: d.status || 'pending' };

  const age = now - new Date(d.lastSeen).getTime();
  if (age <= STALE_MS) return { status: 'active' };

  const ageMin = Math.round(age / 60000);
  // มิเตอร์: ใช้เหตุผลละเอียดที่ poller เขียนไว้ (เน็ตหลุด / backend ล่ม / ESP เงียบ)
  const h = d.meta && d.meta.health;
  if (h && h.reason) return { status: 'offline', reason: h.reason, hint: h.hint };
  return { status: 'offline', ...genericReason(d, ageMin) };
}

module.exports = { evaluate, STALE_MS, STALE_MIN };
