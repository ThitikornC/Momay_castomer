/**
 * MQTT service สำหรับ Tasmota devices
 *
 * Topics ที่ subscribe:
 *   stat/<topic>/POWER          → relay state (ON/OFF)
 *   tele/<topic>/SENSOR         → energy readings (HLW8012/CSE7766)
 *   tele/<topic>/LWT            → Last Will (Online/Offline)
 *
 * Topics ที่ publish (control):
 *   cmnd/<topic>/Power          → "ON" | "OFF" | "TOGGLE"
 *   cmnd/<topic>/Backlog        → หลายคำสั่งพร้อมกัน
 */
const mqtt = require('mqtt');
const Device  = require('../models/device');
const Reading = require('../models/reading');

let client = null;

// deviceId → mqttTopic map (cache ไม่ต้อง query DB ทุก message)
const topicToId = {};

function init() {
  const broker = process.env.MQTT_BROKER || 'mqtt://localhost';
  const opts = {
    clientId:  process.env.MQTT_CLIENT_ID || 'momay-gateway',
    username:  process.env.MQTT_USERNAME  || undefined,
    password:  process.env.MQTT_PASSWORD  || undefined,
    reconnectPeriod: 5000,
    clean: true,
  };

  client = mqtt.connect(broker, opts);

  client.on('connect', async () => {
    console.log('[MQTT] Connected to', broker);
    // subscribe wildcard
    client.subscribe(['stat/+/+', 'tele/+/SENSOR', 'tele/+/LWT'], (err) => {   // stat/+/+ เพื่อรับ POWER, POWER1, POWER2…
      if (err) console.error('[MQTT] Subscribe error', err.message);
    });
    // สร้าง topic→deviceId cache จาก DB
    await rebuildTopicCache();
  });

  client.on('message', (t, p) => handleMessage(t, p).catch(e => console.error('[MQTT] handler error:', e.message)));
  client.on('error', (err) => console.error('[MQTT] Error', err.message));
  client.on('offline', () => console.warn('[MQTT] Offline'));
}

async function rebuildTopicCache() {
  const devices = await Device.find({ type: 'tasmota' }).lean();
  for (const d of devices) {
    if (d.mqttTopic) topicToId[d.mqttTopic] = d.deviceId;
  }
}

async function handleMessage(topic, payload) {
  const str = payload.toString();
  // topic format: stat/<mqttTopic>/POWER  or  tele/<mqttTopic>/SENSOR
  const parts = topic.split('/');
  if (parts.length < 3) return;
  const mqttTopic = parts[1];
  const kind      = parts[2];

  // auto-register ถ้ายังไม่รู้จัก device (upsert atomic กัน race → ไม่เกิด E11000 ตอนข้อความเข้าพร้อมกัน)
  let deviceId = topicToId[mqttTopic];
  if (!deviceId) {
    deviceId = `tasmota_${mqttTopic}`;
    const r = await Device.updateOne(
      { deviceId },
      { $setOnInsert: { deviceId, type: 'tasmota', category: 'switch', mqttTopic, status: 'pending' },
        $set: { lastSeen: new Date() } },
      { upsert: true }
    );
    if (r.upsertedCount) console.log('[MQTT] Auto-registered new Tasmota device:', deviceId);
    topicToId[mqttTopic] = deviceId;
  }

  const now = new Date();

  if (kind.startsWith('POWER')) {
    // POWER | POWER1 | POWER2 … (รองรับหลายรีเลย์ต่อเครื่อง)
    const ch = kind.slice(5) || '0';              // '' → '0' (รีเลย์เดียว/รวม)
    const relay = str.trim().toUpperCase() === 'ON';
    // เก็บสถานะแยกตามรีเลย์ใน meta.relays[ch]
    await Device.updateOne({ deviceId }, { $set: { lastSeen: now, status: 'active', 'meta.relay': relay, [`meta.relays.${ch}`]: relay } });
    await Reading.create({ deviceId, type: 'tasmota', ts: now, relay, raw: { [kind]: str } });

  } else if (kind === 'SENSOR') {
    // Tasmota SENSOR JSON: {"Time":"...","ENERGY":{"Voltage":220,"Current":1.2,"Power":265,...}}
    try {
      const json = JSON.parse(str);
      const e = json.ENERGY || {};
      const reading = {
        deviceId, type: 'tasmota', ts: now,
        voltage: e.Voltage, current: e.Current, power: e.Power,
        energy:  e.Total,   pf: e.Factor,   freq: e.Frequency,
        raw: json,
      };
      await Device.updateOne({ deviceId }, { $set: { lastSeen: now, status: 'active' } });
      await Reading.create(reading);
    } catch { /* ignore parse errors */ }

  } else if (kind === 'LWT') {
    const status = str.trim() === 'Online' ? 'active' : 'offline';
    await Device.updateOne({ deviceId }, { $set: { status, lastSeen: now } });
  }
}

// ── Control API ──────────────────────────────────────────────────────
// channel: เลขรีเลย์ Tasmota (1,2,…) — ว่าง/0 = Power (รีเลย์เดียว)
function setRelay(mqttTopic, state, channel) {
  if (!client?.connected) throw new Error('MQTT not connected');
  const cmd = state === 'toggle' ? 'TOGGLE' : (state ? 'ON' : 'OFF');
  const suffix = (channel === undefined || channel === null || channel === '' || Number(channel) === 0) ? '' : Number(channel);
  client.publish(`cmnd/${mqttTopic}/Power${suffix}`, cmd);
}

function sendBacklog(mqttTopic, commands) {
  // e.g. commands = "Power ON; Delay 100; Power OFF"
  if (!client?.connected) throw new Error('MQTT not connected');
  client.publish(`cmnd/${mqttTopic}/Backlog`, commands);
}

function isConnected() { return client?.connected || false; }

module.exports = { init, setRelay, sendBacklog, isConnected, rebuildTopicCache };
