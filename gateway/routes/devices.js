/**
 * Device Registry routes (admin)
 *
 * GET    /api/devices              - list all (+ filter by type/status)
 * GET    /api/devices/:deviceId    - detail + latest reading
 * PATCH  /api/devices/:deviceId    - approve / ตั้งชื่อ / ตั้ง config
 * DELETE /api/devices/:deviceId    - ลบ
 * GET    /api/devices/:deviceId/readings - reading history
 */
const router  = require('express').Router();
const Device  = require('../models/device');
const Reading = require('../models/reading');
const mqttSvc = require('../services/mqtt');

// Create device (manual — เพิ่มเองจากหน้า Settings เช่น camera/meter/switch/ir-remote)
router.post('/', async (req, res) => {
  try {
    const { deviceId, type } = req.body;
    if (!deviceId) return res.status(400).json({ ok: false, error: 'deviceId required' });
    if (!type)     return res.status(400).json({ ok: false, error: 'type required' });

    const exists = await Device.findOne({ deviceId });
    if (exists) return res.status(409).json({ ok: false, error: 'deviceId already exists' });

    const allowed = ['deviceId', 'type', 'category', 'label', 'room', 'status',
      'mqttTopic', 'channel', 'tuyaDeviceId', 'irModel', 'modbusSlaveId', 'config', 'meta'];
    const doc = {};
    for (const k of allowed) if (req.body[k] !== undefined) doc[k] = req.body[k];
    if (!doc.status) doc.status = 'active';

    const device = await Device.create(doc);

    // ถ้าเป็น Tasmota ที่ active แล้ว rebuild topic cache
    if (device.type === 'tasmota' && device.status === 'active') {
      await mqttSvc.rebuildTopicCache();
    }

    res.json({ ok: true, device });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// List all devices
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.type)     filter.type     = req.query.type;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.status)   filter.status   = req.query.status;
    if (req.query.room)     filter.room     = req.query.room;

    const devices = await Device.find(filter).sort({ updatedAt: -1 }).lean();

    // แนบ reading ล่าสุดให้แต่ละ device
    const ids = devices.map(d => d.deviceId);
    const latestReadings = await Reading.aggregate([
      { $match: { deviceId: { $in: ids } } },
      { $sort:  { ts: -1 } },
      { $group: { _id: '$deviceId', doc: { $first: '$$ROOT' } } },
    ]);
    const latestMap = Object.fromEntries(latestReadings.map(r => [r._id, r.doc]));

    res.json({
      ok: true,
      devices: devices.map(d => ({ ...d, latest: latestMap[d.deviceId] || null })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Device detail
router.get('/:deviceId', async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: req.params.deviceId }).lean();
    if (!device) return res.status(404).json({ ok: false, error: 'Not found' });

    const latest = await Reading.findOne({ deviceId: req.params.deviceId })
      .sort({ ts: -1 }).lean();

    res.json({ ok: true, device, latest });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update device (approve / label / config)
router.patch('/:deviceId', async (req, res) => {
  try {
    const allowed = ['label', 'room', 'category', 'type', 'status', 'mqttTopic', 'channel', 'tuyaDeviceId', 'irModel', 'modbusSlaveId', 'config', 'meta'];
    const update = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    }
    if (!Object.keys(update).length) return res.status(400).json({ ok: false, error: 'No fields to update' });

    const device = await Device.findOneAndUpdate(
      { deviceId: req.params.deviceId },
      { $set: update },
      { new: true }
    ).lean();

    if (!device) return res.status(404).json({ ok: false, error: 'Not found' });

    // ถ้าเพิ่ง approve Tasmota device ให้ rebuild topic cache
    if (update.status === 'active' && device.type === 'tasmota') {
      await mqttSvc.rebuildTopicCache();
    }

    res.json({ ok: true, device });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete device
router.delete('/:deviceId', async (req, res) => {
  try {
    await Device.deleteOne({ deviceId: req.params.deviceId });
    await Reading.deleteMany({ deviceId: req.params.deviceId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Reading history
router.get('/:deviceId/readings', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
    const from  = req.query.from ? new Date(req.query.from) : null;
    const filter = { deviceId: req.params.deviceId };
    if (from) filter.ts = { $gte: from };

    const readings = await Reading.find(filter)
      .sort({ ts: -1 }).limit(limit).lean();

    res.json({ ok: true, readings: readings.reverse() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
