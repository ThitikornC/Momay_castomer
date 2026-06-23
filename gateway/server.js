require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const connectDB = require('./db');
const mqttSvc  = require('./services/mqtt');

const app  = express();
const PORT = process.env.PORT || process.env.GATEWAY_PORT || 8002;

// ── Middleware ──────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Routes ──────────────────────────────────────────────────────────
app.use('/api/esp32',    require('./routes/esp32'));
app.use('/api/sensor',   require('./routes/sensor'));   // ESP ฝุ่น PM2.5 (PMS3003)
app.use('/api/tasmota',  require('./routes/tasmota'));
app.use('/api/tuya',     require('./routes/tuya'));
app.use('/api/devices',  require('./routes/devices'));
app.use('/api/rooms',    require('./routes/rooms'));
app.use('/api',          require('./routes/cameraCount')); // /api/camera-count, /api/camera-counts (live → heatmap)
app.use('/api',          require('./routes/bookings'));   // /api/bookings, /api/active-booking (ยุบจาก momaybuu)

// Combined config: rooms + อุปกรณ์ของแต่ละห้อง (ให้ dashboard ดึงครั้งเดียว)
const Room   = require('./models/room');
const Device = require('./models/device');
const { evaluate } = require('./services/deviceStatus');
app.get('/api/config', async (_req, res) => {
  try {
    const [rooms, devices] = await Promise.all([
      Room.find().sort({ order: 1, createdAt: 1 }).lean(),
      Device.find().lean(),
    ]);
    // คำนวณสถานะจริงจากความสด (lastSeen) + แนบเหตุผล/คำแนะนำเมื่อ offline
    const now = Date.now();
    const withStatus = d => {
      const { status, reason, hint } = evaluate(d, now);
      return { ...d, status, statusReason: reason || null, statusHint: hint || null };
    };
    const byRoom = {};
    for (const d of devices) (byRoom[d.room] ||= []).push(withStatus(d));
    res.json({
      ok: true,
      rooms: rooms.map(r => ({ ...r, devices: byRoom[r.roomId] || [] })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    uptime: Math.floor(process.uptime()),
    mqtt: mqttSvc.isConnected(),
    time: new Date().toISOString(),
  });
});

// ── Global guards: error ตัวเดียวต้องไม่ทำให้ทั้ง gateway ล่ม ──────────
process.on('uncaughtException',  e => console.error('[guard] uncaughtException:', e));
process.on('unhandledRejection', e => console.error('[guard] unhandledRejection:', e));

// ── Startup ─────────────────────────────────────────────────────────
function start() {
  // เปิด HTTP server ก่อนเสมอ — แม้ DB/MQTT ยังไม่พร้อม (rooms/devices/config สำคัญสุด)
  app.listen(PORT, () => {
    console.log(`[Gateway] running on port ${PORT}`);
    console.log(`  Admin  → GET  http://localhost:${PORT}/api/devices`);
    console.log(`  Config → GET  http://localhost:${PORT}/api/config`);
    console.log(`  Health → GET  http://localhost:${PORT}/health`);
  });

  // DB: non-blocking + retry เอง (ดู db.js)
  connectDB();

  // MQTT: ถ้า broker ใช้ไม่ได้ ห้ามทำให้ส่วนอื่นล่ม
  try { mqttSvc.init(); }
  catch (e) { console.error('[MQTT] init failed (non-fatal):', e.message); }

  // Auto control (booking → เปิด/ปิดสวิตช์) — ยุบมาจาก Control
  try { require('./services/autoControl').init(); }
  catch (e) { console.error('[auto] init failed (non-fatal):', e.message); }

  // Meter heartbeat poller (อัปเดต lastSeen/สถานะมิเตอร์จาก backend)
  try { require('./services/meterPoll').init(); }
  catch (e) { console.error('[meterPoll] init failed (non-fatal):', e.message); }
}

start();
