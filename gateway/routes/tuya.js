/**
 * Tuya IR routes
 *
 * GET  /api/tuya/:deviceId/remotes          - ดูรายการ remotes
 * POST /api/tuya/:deviceId/ir/key           - ส่ง IR key
 * POST /api/tuya/:deviceId/ir/ac            - สั่ง AC (power/mode/temp/fan)
 * POST /api/tuya/:deviceId/ir/custom        - ส่ง custom IR code
 * GET  /api/tuya/:deviceId/status           - ดู device status จาก Tuya cloud
 */
const router  = require('express').Router();
const tuya    = require('../services/tuya');
const Device  = require('../models/device');

// helper: หา device (ต้องมี tuyaDeviceId = IR blaster id); remoteId มาจาก body หรือ meta.remoteId
async function getTuyaDevice(deviceId) {
  const device = await Device.findOne({ deviceId }).lean();
  if (!device) throw Object.assign(new Error('Device not found'), { status: 404 });
  if (!device.tuyaDeviceId) throw Object.assign(new Error('tuyaDeviceId (IR blaster) not configured'), { status: 400 });
  return device;
}

// รายการ IR remotes ที่จับคู่กับ IR blaster
router.get('/:deviceId/remotes', async (req, res) => {
  try {
    const d = await getTuyaDevice(req.params.deviceId);
    const result = await tuya.getIrRemotes(d.tuyaDeviceId);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ส่ง IR key (TV remote ฯลฯ)
router.post('/:deviceId/ir/key', async (req, res) => {
  try {
    const { keyId } = req.body;
    if (!keyId) return res.status(400).json({ ok: false, error: 'keyId required' });
    const d = await getTuyaDevice(req.params.deviceId);
    const remoteId = req.body.remoteId || d.meta?.remoteId;
    if (!remoteId) return res.status(400).json({ ok: false, error: 'remoteId required (body หรือ meta.remoteId)' });
    const result = await tuya.sendIrKey(d.tuyaDeviceId, remoteId, keyId);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// สั่ง AC (scenes — power+mode+temp+wind)
// body: { remoteId?, power, mode, temp, wind }
//   power: 0=off 1=on · mode: 0=cool 1=heat 2=auto 3=fan 4=dry · temp: 16-30 · wind: 0=auto 1=low 2=mid 3=high
router.post('/:deviceId/ir/ac', async (req, res) => {
  try {
    const { power, mode, temp, wind } = req.body;
    const d = await getTuyaDevice(req.params.deviceId);
    const remoteId = req.body.remoteId || d.meta?.remoteId;
    if (!remoteId) return res.status(400).json({ ok: false, error: 'remoteId required (body หรือ meta.remoteId)' });
    const result = await tuya.sendAcCommand(d.tuyaDeviceId, remoteId, { power, mode, temp, wind });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ส่ง custom IR code (base64 encoded)
router.post('/:deviceId/ir/custom', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ ok: false, error: 'code required' });
    const d = await getTuyaDevice(req.params.deviceId);
    const result = await tuya.sendCustomIr(d.tuyaDeviceId, code);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// Device status จาก Tuya cloud
router.get('/:deviceId/status', async (req, res) => {
  try {
    const d = await getTuyaDevice(req.params.deviceId);
    const [info, status] = await Promise.all([
      tuya.getDeviceInfo(d.tuyaDeviceId),
      tuya.getDeviceStatus(d.tuyaDeviceId),
    ]);
    res.json({ ok: true, info, status });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
