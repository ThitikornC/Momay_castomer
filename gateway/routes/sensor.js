/**
 * Air-quality sensor routes (Plantower PMS3003 บน ESP32)
 *
 * POST /api/sensor/data       ← ESP ฝุ่นส่ง reading (pm1_0/pm2_5/pm10)
 * GET  /api/sensor/:id/latest ← อ่านค่าฝุ่นล่าสุดของ device (สะดวกเทสต์ — dashboard ใช้ /api/devices/:id ก็ได้)
 *
 * ออกแบบให้เหมือน /api/esp32/data: auto-register device (category 'sensor') แล้วเก็บลง gw_readings
 * dashboard อ่านค่าล่าสุดผ่าน GET /api/devices/:deviceId (field latest) — ไม่ต้องมี backend แยก
 */
const router  = require('express').Router();
const Device  = require('../models/device');
const Reading = require('../models/reading');

// ESP ฝุ่นส่งค่ามา
router.post('/data', async (req, res) => {
  try {
    const { deviceId, firmware } = req.body || {};
    if (!deviceId) return res.status(400).json({ ok: false, error: 'deviceId required' });

    const num = v => (v === undefined || v === null || v === '' ? undefined : Number(v));
    const pm1_0 = num(req.body.pm1_0);
    const pm2_5 = num(req.body.pm2_5);
    const pm10  = num(req.body.pm10);
    const aqi   = num(req.body.aqi_us ?? req.body.aqi);

    const now = new Date();
    let device = await Device.findOne({ deviceId });
    if (!device) {
      // auto-register: pending → admin ค่อยตั้งห้อง/ชื่อที่หน้า Settings
      device = await Device.create({
        deviceId, type: 'esp32-sensor', category: 'sensor',
        firmware, status: 'pending', lastSeen: now,
      });
      console.log('[Sensor] Auto-registered:', deviceId);
    } else {
      await Device.updateOne({ deviceId }, { $set: { lastSeen: now, status: 'active', firmware } });
    }

    await Reading.create({
      deviceId, type: 'sensor', ts: now,
      pm1_0, pm2_5, pm10, aqi,
      raw: req.body,
    });

    const cfg = device.config || {};
    res.json({
      ok: true,
      status: device.status,
      config: { pollIntervalMs: cfg.pollIntervalMs || 60000 },
    });
  } catch (err) {
    console.error('[Sensor] data error', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ค่าฝุ่นล่าสุด (เทสต์ง่าย ๆ)
router.get('/:id/latest', async (req, res) => {
  try {
    const r = await Reading.findOne({ deviceId: req.params.id }).sort({ ts: -1 }).lean();
    if (!r) return res.json({ ok: true, latest: null });
    res.json({ ok: true, latest: { pm1_0: r.pm1_0, pm2_5: r.pm2_5, pm10: r.pm10, aqi: r.aqi, ts: r.ts } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
