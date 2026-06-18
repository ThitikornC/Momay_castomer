/**
 * Camera people-count (live, in-memory) — ป้อน heatmap ของ dashboard
 *
 *   POST /api/camera-count    { camId, count }     ← relay ส่งเข้ามาเป็นระยะ
 *   GET  /api/camera-counts                        → { camId: { count, ts }, ... }
 *
 * เก็บใน memory พอ (ข้อมูล "สด" ไม่ต้องเข้า DB) — รีสตาร์ท gateway = เริ่มนับใหม่
 */
const router = require('express').Router();

const counts = new Map();          // camId → { count, ts(ms) }
const STALE_MS = 30_000;           // ไม่ได้อัปเดตเกินนี้ = ถือว่ากล้องเงียบ/ดับ

router.post('/camera-count', (req, res) => {
  const { camId, count, pct } = req.body || {};
  if (camId == null || count == null) {
    return res.status(400).json({ ok: false, error: 'camId & count required' });
  }
  const n = Math.max(0, parseInt(count, 10) || 0);
  const p = pct == null ? null : Math.max(0, Math.min(100, parseInt(pct, 10) || 0)); // % พื้นที่ที่มีคน
  counts.set(String(camId), { count: n, pct: p, ts: Date.now() });
  res.json({ ok: true });
});

router.get('/camera-counts', (_req, res) => {
  const now = Date.now();
  const out = {};
  for (const [camId, v] of counts) {
    out[camId] = { count: v.count, pct: v.pct ?? null, ts: v.ts, stale: now - v.ts > STALE_MS };
  }
  res.json({ ok: true, counts: out });
});

module.exports = router;
