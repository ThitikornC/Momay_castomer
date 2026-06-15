/**
 * Tasmota control routes (ผ่าน MQTT service)
 *
 * POST /api/tasmota/:deviceId/power   { state: true|false|"toggle" }
 * GET  /api/tasmota/:deviceId/status
 */
const router = require('express').Router();
const mqttSvc = require('../services/mqtt');
const Device  = require('../models/device');
const Reading = require('../models/reading');

// สั่ง relay
router.post('/:deviceId/power', async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: req.params.deviceId, type: 'tasmota' }).lean();
    if (!device) return res.status(404).json({ ok: false, error: 'Device not found' });
    if (!device.mqttTopic) return res.status(400).json({ ok: false, error: 'mqttTopic not configured' });

    const { state } = req.body;
    if (state === undefined) return res.status(400).json({ ok: false, error: 'state required' });

    // channel: จาก body (override) หรือจาก device.channel ที่ตั้งไว้
    const channel = req.body.channel !== undefined ? req.body.channel : device.channel;
    mqttSvc.setRelay(device.mqttTopic, state, channel);

    // แจ้ง auto-control ว่าเป็นคำสั่ง manual → กัน auto loop มาทับ (เฉพาะ ON/OFF ไม่ใช่ toggle)
    if (typeof state === 'boolean') {
      try { require('../services/autoControl').markManual(device.deviceId, state); } catch { /* ignore */ }
    }

    res.json({ ok: true, sent: state, channel: channel ?? null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ดู status + reading ล่าสุด
router.get('/:deviceId/status', async (req, res) => {
  try {
    const device  = await Device.findOne({ deviceId: req.params.deviceId }).lean();
    if (!device) return res.status(404).json({ ok: false, error: 'Device not found' });

    const latest = await Reading.findOne({ deviceId: req.params.deviceId })
      .sort({ ts: -1 }).lean();

    res.json({ ok: true, device, latest });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
