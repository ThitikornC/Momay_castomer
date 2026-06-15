/**
 * Seed/cleanup script (รันซ้ำได้)
 *   node seed.js
 *
 * - ลบ Tasmota ที่ auto-register แบบ pending ทิ้ง (กรณีเผลอต่อ public broker)
 * - สร้าง/อัปเดต 4 ห้อง (ทั้งอาคาร, 101, 200, 300) + meter device ของแต่ละห้อง
 * - สร้าง switch device (ยุบจาก Control ROOM_DEVICE_MAP)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Room   = require('./models/room');
const Device = require('./models/device');

const ROOMS = [
  { roomId: 'ทั้งอาคาร', label: 'ทั้งอาคาร', shortLabel: 'รวม', order: 0, kind: 'building',
    img: '/Floorplan/Floor4plan.png', heatmap: '/Floorplan/HeatmapgridFloor4.svg',
    meter: { apiBase: 'https://your-building-meter.up.railway.app', source: 'pm_building' } },
  { roomId: 'ห้อง101โถงชั้น1', label: 'ห้อง 101', shortLabel: '101', order: 1, kind: 'room',
    img: '/Floorplan/Floor1plan.png', heatmap: '/Floorplan/HeatmapgridFloor1.svg',
    meter: { apiBase: 'https://momatdeerbn-production.up.railway.app', source: 'pm_101' } },
  { roomId: 'ห้อง200', label: 'ห้อง 200', shortLabel: '200', order: 2, kind: 'room',
    img: '/Floorplan/Floor2plan.png', heatmap: '/Floorplan/HeatmapgridFloor2.svg',
    meter: { apiBase: 'https://momaysandbn-production.up.railway.app', source: 'pm_200' } },
  { roomId: 'ห้อง300', label: 'ห้อง 300', shortLabel: '300', order: 3, kind: 'room',
    img: '/Floorplan/Floor3plan.png', heatmap: '/Floorplan/HeatmapgridFloor3.svg',
    meter: { apiBase: 'https://momaysandbn-production.up.railway.app', source: 'pm_300' } },
];

// switch devices (ยุบจาก Control ROOM_DEVICE_MAP) — channel ว่าง = รีเลย์เดียว (Power)
const SWITCHES = [
  { deviceId: 'switch_ห้อง101', room: 'ห้อง101โถงชั้น1', label: 'สวิตช์ ห้อง 101', mqttTopic: 'tasmota_0B1B0E' },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[seed] connected');

  const del = await Device.deleteMany({ type: 'tasmota', status: 'pending' });
  console.log(`[seed] removed ${del.deletedCount} stray pending Tasmota devices`);

  for (const r of ROOMS) {
    const { meter, ...room } = r;
    await Room.updateOne({ roomId: room.roomId }, { $set: room }, { upsert: true });

    const deviceId = `meter_${room.roomId}`;
    await Device.updateOne(
      { deviceId },
      { $set: { type: 'meter', category: 'meter', label: `มิเตอร์ ${room.label}`,
                room: room.roomId, status: 'active', meta: meter } },
      { upsert: true }
    );
    console.log(`[seed] room "${room.roomId}" + meter ok`);
  }

  for (const s of SWITCHES) {
    await Device.updateOne(
      { deviceId: s.deviceId },
      { $set: { type: 'tasmota', category: 'switch', label: s.label,
                room: s.room, mqttTopic: s.mqttTopic, status: 'active' } },
      { upsert: true }
    );
    console.log(`[seed] switch "${s.deviceId}" → ${s.mqttTopic} ok`);
  }

  const rooms = await Room.countDocuments();
  const devices = await Device.countDocuments();
  console.log(`[seed] done — rooms=${rooms} devices=${devices}`);
  await mongoose.connection.close();
}

main().catch(err => { console.error('[seed] error', err); process.exit(1); });
