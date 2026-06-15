/**
 * Auto control (ยุบมาจาก Control/server.js)
 * เปิด/ปิดสวิตช์อัตโนมัติตาม booking:
 *   - มี booking active + firstCheckIn → เปิด, ตั้ง timer ปิดตอน endTime
 *   - ไม่มี booking active → ปิด
 *   - manual override (สั่งจาก dashboard/gateway) → ข้าม auto จนกว่าจะสั่ง OFF
 *
 * ต่างจาก Control เดิม: อ่าน "switch device" จาก registry (category=switch, type=tasmota)
 * → รองรับหลายสวิตช์/ห้อง + channel (multi-relay) ผ่าน mqttSvc.setRelay(topic, state, channel)
 */
const mongoose = require('mongoose');
const Device  = require('../models/device');
const mqttSvc = require('./mqtt');

const ENABLED             = (process.env.AUTO_CONTROL_ENABLED || 'true').toLowerCase() === 'true';
const BOOKINGS_DB         = process.env.BOOKINGS_DB || 'momay_buu';
const BOOKINGS_COLLECTION = process.env.BOOKINGS_COLLECTION || 'bookings';
const EARLY_ALLOWANCE_MIN = parseInt(process.env.EARLY_ALLOWANCE_MIN || '15', 10);
const CHECK_INTERVAL      = parseInt(process.env.CHECK_INTERVAL || '10000', 10);
const COMMAND_COOLDOWN    = 5000;

const desired = {};          // deviceId → 'ON'|'OFF'
const lastCmd = {};          // deviceId → ts
const timers  = {};          // deviceId → timeout
const manualOverride = {};   // deviceId → true (manual ON ค้างจนกว่าจะ OFF)

function bookingsColl() {
  return mongoose.connection.useDb(BOOKINGS_DB).collection(BOOKINGS_COLLECTION);
}

function _send(dev, on) {
  const id = dev.deviceId;
  if (desired[id] === (on ? 'ON' : 'OFF')) return;          // ไม่ส่งซ้ำ
  const now = Date.now();
  if (lastCmd[id] && now - lastCmd[id] < COMMAND_COOLDOWN) return;
  lastCmd[id] = now;
  desired[id] = on ? 'ON' : 'OFF';
  try {
    mqttSvc.setRelay(dev.mqttTopic, on, dev.channel);
    console.log(`[auto] ${on ? '🟢 ON ' : '🔴 OFF'} ${dev.room} (${dev.mqttTopic}${dev.channel ? ':'+dev.channel : ''})`);
  } catch (e) {
    desired[id] = null;
    console.error('[auto] send failed:', e.message);
  }
}

// เรียกจาก route /api/tasmota/:id/power เมื่อ user สั่งเอง → กัน auto มาทับ
function markManual(deviceId, on) {
  if (on) manualOverride[deviceId] = true;
  else    delete manualOverride[deviceId];
  if (timers[deviceId]) { clearTimeout(timers[deviceId]); delete timers[deviceId]; }
  desired[deviceId] = on ? 'ON' : 'OFF';
}

async function tick() {
  if (mongoose.connection.readyState !== 1) return;

  let switches;
  try { switches = await Device.find({ category: 'switch', type: 'tasmota' }).lean(); }
  catch { return; }
  if (!switches.length) return;

  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 3600 * 1000);
  const today = bkk.toISOString().split('T')[0];
  const curSecs = bkk.getUTCHours() * 3600 + bkk.getUTCMinutes() * 60 + bkk.getUTCSeconds();

  let bookings = [];
  try { bookings = await bookingsColl().find({ date: today }).toArray(); }
  catch (e) { /* ไม่มี booking/อ่านไม่ได้ → ถือว่าไม่มี active */ }

  for (const dev of switches) {
    if (!dev.mqttTopic || !dev.room) continue;
    if (dev.meta && dev.meta.autoControl === false) continue;   // ปิด auto ราย device ได้
    if (manualOverride[dev.deviceId]) continue;

    const active = bookings.find(b => {
      const r = (b.room || '').replace(/\s*▼\s*/, '').trim();
      if (r !== dev.room) return false;
      const [sh, sm] = (b.startTime || '0:0').split(':').map(Number);
      const [eh, em] = (b.endTime   || '0:0').split(':').map(Number);
      const s = sh * 3600 + sm * 60, e = eh * 3600 + em * 60, early = EARLY_ALLOWANCE_MIN * 60;
      return curSecs >= s - early && curSecs <= e;
    });

    if (active && active.firstCheckIn) {
      _send(dev, true);
      const [eh, em] = active.endTime.split(':').map(Number);
      const remain = (eh * 3600 + em * 60) - curSecs;
      if (timers[dev.deviceId]) { clearTimeout(timers[dev.deviceId]); delete timers[dev.deviceId]; }
      if (remain > 0) {
        timers[dev.deviceId] = setTimeout(() => { _send(dev, false); delete timers[dev.deviceId]; }, remain * 1000);
      }
    } else if (!active) {
      _send(dev, false);
      if (timers[dev.deviceId]) { clearTimeout(timers[dev.deviceId]); delete timers[dev.deviceId]; }
    }
    // มี booking แต่ยังไม่ check-in → ไม่ทำอะไร
  }
}

function init() {
  if (!ENABLED) { console.log('[auto] booking auto-control disabled'); return; }
  console.log(`[auto] booking auto-control ON (ทุก ${CHECK_INTERVAL / 1000}s, bookings=${BOOKINGS_DB}.${BOOKINGS_COLLECTION})`);
  setInterval(() => tick().catch(e => console.error('[auto] tick error:', e.message)), CHECK_INTERVAL);
  tick().catch(() => {});
}

module.exports = { init, markManual };
