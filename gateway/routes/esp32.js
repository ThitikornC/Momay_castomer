/**
 * ESP32 Modbus routes
 *
 * POST /api/esp32/data      ← ESP32 ส่ง reading
 * GET  /api/esp32/config/:id ← ESP32 ดึง config
 */
const router  = require('express').Router();
const Device  = require('../models/device');
const Reading = require('../models/reading');

// ESP32 ส่ง Modbus reading มา
router.post('/data', async (req, res) => {
  try {
    const { deviceId, firmware, modbusSlaveId, readings } = req.body;
    if (!deviceId) return res.status(400).json({ ok: false, error: 'deviceId required' });

    const now = new Date();
    let device = await Device.findOne({ deviceId });

    if (!device) {
      // auto-register: สร้าง pending device
      device = await Device.create({
        deviceId,
        type: 'esp32-modbus',
        firmware,
        modbusSlaveId,
        status: 'pending',
        lastSeen: now,
      });
      console.log('[ESP32] Auto-registered:', deviceId);
    } else {
      await Device.updateOne({ deviceId }, {
        $set: { lastSeen: now, status: 'active', firmware, modbusSlaveId },
      });
    }

    // บันทึก reading
    if (readings) {
      await Reading.create({
        deviceId,
        type: 'modbus',
        ts: now,
        voltage: readings.voltage,
        current: readings.current,
        power:   readings.power,
        energy:  readings.energy,
        pf:      readings.pf,
        freq:    readings.freq,
        raw:     readings,
      });
    }

    // ส่ง config กลับ (ESP32 ใช้ response นี้อัปเดต config)
    const cfg = device.config || {};
    res.json({
      ok: true,
      status: device.status,
      config: {
        pollIntervalMs: cfg.pollIntervalMs || 5000,
        backendUrl:     cfg.backendUrl     || '',
        modbusMap:      cfg.modbusMap      || null,
      },
    });
  } catch (err) {
    console.error('[ESP32] data error', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ESP32 ดึง config ก่อนเริ่ม (เรียกตอน boot)
router.get('/config/:id', async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: req.params.id }).lean();
    if (!device) return res.status(404).json({ ok: false, error: 'Device not found' });

    res.json({
      ok: true,
      config: device.config || {},
      label: device.label,
      room:  device.room,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
