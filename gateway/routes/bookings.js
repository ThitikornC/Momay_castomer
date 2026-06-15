/**
 * Booking routes (ยุบมาจาก momaybuu) — อ่าน/เขียน collection เดียวกับ autoControl
 *   GET  /api/bookings?date=&room=     - รายการจอง
 *   POST /api/bookings                 - สร้างการจอง
 *   POST /api/bookings/:id/checkin     - เช็คอิน (→ autoControl เปิดไฟ)
 *   GET  /api/active-booking?room=      - การจองที่กำลัง active ของห้อง
 */
const router   = require('express').Router();
const mongoose = require('mongoose');

const BOOKINGS_DB         = process.env.BOOKINGS_DB || 'momay_buu';
const BOOKINGS_COLLECTION = process.env.BOOKINGS_COLLECTION || 'bookings';

function coll() { return mongoose.connection.useDb(BOOKINGS_DB).collection(BOOKINGS_COLLECTION); }
function cleanRoom(r) { return (r || '').replace(/\s*▼\s*/, '').trim(); }
function toSecs(hhmm) { const [h, m] = (hhmm || '0:0').split(':').map(Number); return h * 3600 + (m || 0) * 60; }
function bkkNow() {
  const b = new Date(Date.now() + 7 * 3600 * 1000);
  return { today: b.toISOString().split('T')[0], secs: b.getUTCHours() * 3600 + b.getUTCMinutes() * 60 + b.getUTCSeconds() };
}

// list
router.get('/bookings', async (req, res) => {
  try {
    const q = {};
    if (req.query.date) q.date = req.query.date;
    if (req.query.room) q.room = cleanRoom(req.query.room);
    const data = await coll().find(q).sort({ startTime: 1 }).toArray();
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// create
router.post('/bookings', async (req, res) => {
  try {
    const { room, date, startTime, endTime, bookerName, purpose } = req.body || {};
    if (!room || !date || !startTime || !endTime || !bookerName) return res.status(400).json({ success: false, error: 'missing fields' });
    if (startTime >= endTime) return res.status(400).json({ success: false, error: 'startTime must be < endTime' });
    const doc = { room: cleanRoom(room), date, startTime, endTime, bookerName, purpose: purpose || '', firstCheckIn: null, createdAt: new Date() };
    const r = await coll().insertOne(doc);
    res.json({ success: true, data: { _id: r.insertedId, ...doc } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// check-in → ตั้ง firstCheckIn (autoControl จะเปิดไฟห้องนั้น)
router.post('/bookings/:id/checkin', async (req, res) => {
  try {
    const _id = new mongoose.Types.ObjectId(req.params.id);
    const u = await coll().updateOne({ _id }, { $set: { firstCheckIn: new Date() } });
    if (!u.matchedCount) return res.status(404).json({ success: false, error: 'not found' });
    const doc = await coll().findOne({ _id });
    res.json({ success: true, data: doc });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// active booking (วันนี้ + อยู่ในช่วงเวลา)
router.get('/active-booking', async (req, res) => {
  try {
    const room = cleanRoom(req.query.room);
    if (!room) return res.status(400).json({ hasActiveBooking: false, error: 'room required' });
    const { today, secs } = bkkNow();
    const list = await coll().find({ date: today, room }).toArray();
    const active = list.find(b => secs >= toSecs(b.startTime) && secs <= toSecs(b.endTime));
    if (!active) return res.json({ hasActiveBooking: false });
    res.json({ hasActiveBooking: true, ...active, checkedIn: !!active.firstCheckIn });
  } catch (e) { res.status(500).json({ hasActiveBooking: false, error: e.message }); }
});

module.exports = router;
