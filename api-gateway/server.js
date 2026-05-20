/**
 * Person Counter — API Gateway
 * Node.js / Express + WebSocket
 *
 * Flow:
 *   On-site relay  --WS /ws/relay?key=KEY&cam=CAM_ID-->  Gateway (cloud)
 *   Frontend       --GET /stream/:cam_id-->               Gateway MJPEG stream
 *   Frontend       --GET /api/cameras-->                  Metadata
 *   On-site FastAPI--POST /api/push-->                    Gateway metadata update
 *
 * Environment variables:
 *   PORT        – listening port (default 3000)
 *   API_KEY     – secret key for relay WS + /api/push (header X-API-Key or ?key=)
 *   STALE_SEC   – mark camera offline after N seconds without data (default 15)
 */

'use strict';

const http    = require('http');
const express = require('express');
const cors    = require('cors');
const { WebSocketServer } = require('ws');
const { URL } = require('url');

const app     = express();
const PORT    = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';
const STALE   = parseInt(process.env.STALE_SEC || '15', 10) * 1000;

// ─── In-memory stores ─────────────────────────────────────────────────────────
const cameras = {};            // metadata: { [cam_id]: {...} }
const frames  = {};            // latest JPEG frame: { [cam_id]: Buffer }
const viewers = {};            // MJPEG clients: { [cam_id]: Set<res> }
let   plans   = [];            // floor plans: [{ id, name, image, zones, cameraOrder }]

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function checkApiKey(req, res, next) {
  if (!API_KEY) return next();
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function wsKeyValid(key) {
  return !API_KEY || key === API_KEY;
}

// ─── Push frames to all MJPEG viewers ────────────────────────────────────────
function pushFrame(camId, buf) {
  if (!viewers[camId]) return;
  const header = Buffer.from(
    `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${buf.length}\r\n\r\n`
  );
  const tail = Buffer.from('\r\n');
  const chunk = Buffer.concat([header, buf, tail]);
  for (const res of viewers[camId]) {
    try { res.write(chunk); } catch (_) { viewers[camId].delete(res); }
  }
}

// ─── MJPEG stream endpoint (frontend viewer) ─────────────────────────────────
app.get('/stream/:cam_id', (req, res) => {
  const camId = req.params.cam_id;
  res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  if (!viewers[camId]) viewers[camId] = new Set();
  viewers[camId].add(res);

  // Send the most recent frame immediately so there's no blank wait
  if (frames[camId]) pushFrame(camId, frames[camId]);

  req.on('close', () => viewers[camId]?.delete(res));
});

// ─── Snapshot (single JPEG) ───────────────────────────────────────────────────
app.get('/snapshot/:cam_id', (req, res) => {
  const buf = frames[req.params.cam_id];
  if (!buf) return res.status(404).json({ error: 'No frame yet' });
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(buf);
});

// ─── Push endpoint — on-site FastAPI pushes camera metadata ──────────────────
app.post('/api/push', checkApiKey, (req, res) => {
  const body = req.body;
  if (!Array.isArray(body)) return res.status(400).json({ error: 'Body must be array' });
  const now = Date.now();
  body.forEach(cam => {
    if (!cam.id) return;
    cameras[cam.id] = {
      id:           cam.id,
      name:         cam.name         || cam.id,
      running:      cam.running      ?? false,
      fps:          cam.fps          ?? 0,
      total_people: cam.total_people ?? 0,
      counts:       cam.counts       ?? {},
      error:        cam.error        || '',
      has_frame:    cam.has_frame    ?? false,
      streaming:    !!frames[cam.id],
      updatedAt:    now,
    };
  });
  res.json({ ok: true, received: body.length });
});

// ─── Camera list ──────────────────────────────────────────────────────────────
app.get('/api/cameras', (req, res) => {
  const now = Date.now();
  // Merge relay-streamed cams (may not be in metadata yet)
  const allIds = new Set([...Object.keys(cameras), ...Object.keys(frames)]);
  const result = Array.from(allIds).map(id => {
    const cam   = cameras[id];
    const stale = cam ? (now - cam.updatedAt) > STALE : false;
    return {
      id,
      name:         cam?.name         || id,
      running:      stale ? false : (cam?.running ?? false),
      fps:          cam?.fps          ?? 0,
      total_people: cam?.total_people ?? 0,
      counts:       cam?.counts       ?? {},
      error:        stale
        ? `ไม่ได้รับข้อมูลนาน ${Math.round((now - (cam?.updatedAt || 0)) / 1000)} วินาที`
        : (cam?.error || ''),
      streaming:    !!frames[id],
    };
  });
  res.json(result);
});

app.get('/api/cameras/:cam_id/status', (req, res) => {
  const id  = req.params.cam_id;
  const cam = cameras[id];
  if (!cam) return res.json({ running: false, fps: 0, total_people: 0, counts: {}, error: 'ไม่พบกล้อง', streaming: !!frames[id] });
  const stale = (Date.now() - cam.updatedAt) > STALE;
  res.json({
    running:      stale ? false : cam.running,
    fps:          cam.fps,
    total_people: cam.total_people,
    counts:       cam.counts,
    error:        stale ? `ไม่ได้รับข้อมูลนาน ${Math.round((Date.now() - cam.updatedAt) / 1000)} วินาที` : cam.error,
    streaming:    !!frames[id],
  });
});

app.get('/api/summary', (req, res) => {
  const now = Date.now();
  let grandTotal = 0, liveCams = 0;
  Object.values(cameras).forEach(cam => {
    const stale = (now - cam.updatedAt) > STALE;
    if (!stale && cam.running) { grandTotal += cam.total_people || 0; liveCams++; }
  });
  res.json({ grand_total: grandTotal, live_cams: liveCams, total_cams: Object.keys(cameras).length, timestamp: new Date().toISOString() });
});

// ─── Health check ─────────────────────────────────────────────────────────────
// ─── Floor plans endpoints ───────────────────────────────────────────────────
app.get('/api/plans', (_req, res) => res.json(plans));

app.post('/api/plans', (req, res) => {
  const body = req.body;
  if (!Array.isArray(body)) return res.status(400).json({ error: 'Body must be an array' });
  plans = body;
  res.json({ ok: true, count: plans.length });
});

app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ─── HTTP + WebSocket server ──────────────────────────────────────────────────
const server = http.createServer(app);
const wss    = new WebSocketServer({ noServer: true });

// Upgrade: only allow /ws/relay path
server.on('upgrade', (req, socket, head) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws/relay') { socket.destroy(); return; }
    const key = url.searchParams.get('key') || req.headers['x-api-key'] || '';
    if (!wsKeyValid(key)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  } catch (_) { socket.destroy(); }
});

// Relay connection: on-site relay sends JPEG frames
wss.on('connection', (ws, req) => {
  const url   = new URL(req.url, 'http://localhost');
  const camId = url.searchParams.get('cam') || 'cam1';
  console.log(`[WS] relay connected cam=${camId}`);

  // Touch metadata so the camera appears in /api/cameras immediately
  if (!cameras[camId]) {
    cameras[camId] = { id: camId, name: camId, running: true, fps: 0, total_people: 0, counts: {}, error: '', streaming: true, updatedAt: Date.now() };
  }

  ws.on('message', (data) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    frames[camId] = buf;
    if (cameras[camId]) { cameras[camId].streaming = true; cameras[camId].running = true; cameras[camId].updatedAt = Date.now(); }
    pushFrame(camId, buf);
  });

  ws.on('close', () => {
    console.log(`[WS] relay disconnected cam=${camId}`);
    if (cameras[camId]) cameras[camId].streaming = false;
  });

  ws.on('error', err => console.error(`[WS] cam=${camId} error:`, err.message));
});

server.listen(PORT, () => {
  console.log(`[Gateway] listening on port ${PORT}`);
  console.log(`[Gateway] API_KEY auth: ${API_KEY ? 'enabled' : 'disabled'}`);
  console.log(`[Gateway] stale timeout: ${STALE / 1000}s`);
  console.log(`[Gateway] WS relay:  ws://HOST:${PORT}/ws/relay?key=KEY&cam=CAM_ID`);
  console.log(`[Gateway] MJPEG:     http://HOST:${PORT}/stream/:cam_id`);
});


