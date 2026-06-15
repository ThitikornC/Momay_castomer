/**
 * Room registry routes
 *
 * GET    /api/rooms            - list rooms (เรียงตาม order)
 * POST   /api/rooms            - สร้างห้อง
 * PATCH  /api/rooms/:roomId    - แก้ไขห้อง
 * DELETE /api/rooms/:roomId    - ลบห้อง (อุปกรณ์ที่ผูกจะกลายเป็น orphan — แจ้งจำนวนกลับ)
 */
const router  = require('express').Router();
const Room    = require('../models/room');
const Device  = require('../models/device');

// List
router.get('/', async (_req, res) => {
  try {
    const rooms = await Room.find().sort({ order: 1, createdAt: 1 }).lean();
    res.json({ ok: true, rooms });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create
router.post('/', async (req, res) => {
  try {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ ok: false, error: 'roomId required' });

    const exists = await Room.findOne({ roomId });
    if (exists) return res.status(409).json({ ok: false, error: 'roomId already exists' });

    const allowed = ['roomId', 'label', 'shortLabel', 'order', 'kind', 'img', 'heatmap'];
    const doc = {};
    for (const k of allowed) if (req.body[k] !== undefined) doc[k] = req.body[k];

    const room = await Room.create(doc);
    res.json({ ok: true, room });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update
router.patch('/:roomId', async (req, res) => {
  try {
    const allowed = ['label', 'shortLabel', 'order', 'kind', 'img', 'heatmap'];
    const update = {};
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
    if (!Object.keys(update).length) return res.status(400).json({ ok: false, error: 'No fields to update' });

    const room = await Room.findOneAndUpdate(
      { roomId: req.params.roomId },
      { $set: update },
      { new: true }
    ).lean();
    if (!room) return res.status(404).json({ ok: false, error: 'Not found' });

    res.json({ ok: true, room });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete
router.delete('/:roomId', async (req, res) => {
  try {
    const result = await Room.deleteOne({ roomId: req.params.roomId });
    if (!result.deletedCount) return res.status(404).json({ ok: false, error: 'Not found' });
    const orphaned = await Device.countDocuments({ room: req.params.roomId });
    res.json({ ok: true, orphanedDevices: orphaned });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
