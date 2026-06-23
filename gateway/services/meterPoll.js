/**
 * Meter heartbeat poller
 *
 * มิเตอร์ไม่ได้ส่งข้อมูลเข้า gateway โดยตรง (dashboard ดึงจาก backend มิเตอร์ = meta.apiBase)
 * → gateway เลยไม่เคยรู้ว่ามิเตอร์ออนไลน์ไหม ทำให้ status ค้างที่ 'active' ตลอด
 *
 * service นี้ poll backend มิเตอร์เป็นระยะ แล้วอัปเดต lastSeen + meta.health
 * จากนั้น /api/config จะคำนวณ active/offline จาก lastSeen (ดู services/deviceStatus.js)
 *
 * ⚠ เรื่อง timezone: backend มิเตอร์เก็บ timestamp เป็นเวลาไทย (UTC+7) แล้วส่งออกเป็น ISO+Z
 *   → เทียบค่าสัมบูรณ์กับ Date.now() ไม่ได้ (เพี้ยน 7 ชม.)
 *   วิธีแก้: ดูแค่ว่า timestamp ของ reading ล่าสุด "ขยับ" จากรอบก่อนไหม
 *   ถ้าขยับ = มิเตอร์ยังส่งข้อมูล → บันทึก lastSeen เป็นนาฬิกาจริงของ gateway
 */
const axios  = require('axios');
const Device = require('../models/device');

const ENABLED   = (process.env.METER_POLL_ENABLED || 'true').toLowerCase() === 'true';
const INTERVAL  = parseInt(process.env.METER_POLL_INTERVAL_MS || '120000', 10); // 2 นาที
const TIMEOUT   = parseInt(process.env.METER_POLL_TIMEOUT_MS  || '8000', 10);
const STALE_MIN = Number(process.env.DEVICE_STALE_MIN) || 15;

const lastReadingTs = {};   // deviceId → timestamp string ของ reading ล่าสุดที่เคยเห็น

async function setHealth(deviceId, fields) {
  try { await Device.updateOne({ deviceId }, { $set: fields }); }
  catch (e) { console.error('[meterPoll] update fail', deviceId, e.message); }
}

async function pollOne(d) {
  const base   = (d.meta && d.meta.apiBase ? d.meta.apiBase : '').replace(/\/+$/, '');
  const source = ((d.meta && d.meta.source) || 'pm_building').trim();

  if (!base) {
    return setHealth(d.deviceId, {
      'meta.health': { reason: 'ยังไม่ได้ตั้งค่า apiBase ของมิเตอร์', hint: 'ไปที่ Settings → แก้ไขอุปกรณ์ → ใส่ apiBase ของ backend มิเตอร์', checkedAt: new Date() },
    });
  }

  let docs;
  try {
    const r = await axios.get(`${base}/esp/${encodeURIComponent(source)}?limit=1`, {
      timeout: TIMEOUT, headers: { accept: 'application/json' },
    });
    docs = r.data;
  } catch (e) {
    // backend ติดต่อไม่ได้ → ไม่อัปเดต lastSeen (ปล่อยให้เก่าจน offline) + บอกเหตุผล
    return setHealth(d.deviceId, {
      'meta.health': { reason: `ติดต่อ backend มิเตอร์ไม่ได้ (${e.code || e.message})`, hint: 'เช็คว่า backend (apiBase) ออนไลน์ และ URL ถูกต้อง', checkedAt: new Date() },
    });
  }

  const ts = Array.isArray(docs) && docs[0] && docs[0].timestamp ? String(docs[0].timestamp) : null;
  if (!ts) {
    return setHealth(d.deviceId, {
      'meta.health': { reason: 'backend ตอบแต่ไม่มีข้อมูลมิเตอร์เลย', hint: 'เช็คว่า ESP มิเตอร์เคย POST เข้า backend หรือยัง (source ตรงไหม)', checkedAt: new Date() },
    });
  }

  const advanced = lastReadingTs[d.deviceId] !== ts;   // reading ใหม่ตั้งแต่รอบก่อน?
  lastReadingTs[d.deviceId] = ts;

  if (advanced) {
    // มิเตอร์ยังส่งข้อมูล → สด: บันทึก lastSeen เป็นนาฬิกาจริงของ gateway + ล้าง health
    return setHealth(d.deviceId, { lastSeen: new Date(), status: 'active', 'meta.health': null });
  }
  // ไม่มี reading ใหม่ตั้งแต่รอบก่อน → ปล่อยให้ deviceStatus ตัดสินจาก lastSeen
  // ถ้าเก่าพอจะเป็น offline พร้อมเหตุผลนี้
  return setHealth(d.deviceId, {
    'meta.health': { reason: `มิเตอร์ไม่ส่งข้อมูลใหม่ (เกิน ${STALE_MIN} นาทีถือว่าออฟไลน์)`, hint: 'เช็คไฟ/เน็ตของ ESP มิเตอร์ ว่ายัง POST เข้า backend อยู่ไหม', checkedAt: new Date() },
  });
}

async function tick() {
  try {
    const meters = await Device.find({ category: 'meter' }).lean();
    await Promise.allSettled(meters.map(pollOne));
  } catch (e) {
    console.error('[meterPoll] tick error:', e.message);
  }
}

function init() {
  if (!ENABLED) { console.log('[meterPoll] disabled'); return; }
  console.log(`[meterPoll] polling meters every ${INTERVAL}ms (stale > ${STALE_MIN} min = offline)`);
  setTimeout(tick, 5000);          // เริ่มหลัง DB เชื่อมต่อ
  setInterval(tick, INTERVAL);
}

module.exports = { init, tick };
