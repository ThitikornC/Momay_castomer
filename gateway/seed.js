/**
 * Seed/cleanup script (รันซ้ำได้)
 *   node seed.js
 *
 * - ลบ Tasmota ที่ auto-register แบบ pending ทิ้ง (กรณีเผลอต่อ public broker)
 * - สร้าง/อัปเดต ห้อง (เวอร์ชันนี้: เฉพาะ "ทั้งอาคาร") + meter device ของแต่ละห้อง
 * - ลบห้อง/มิเตอร์เก่าที่ไม่อยู่ในลิสต์ทิ้ง (เช่น 101/200/300)
 * - สร้าง switch device (ยุบจาก Control ROOM_DEVICE_MAP)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Room   = require('./models/room');
const Device = require('./models/device');

const ROOMS = [
  { roomId: 'ทั้งอาคาร', label: 'ทั้งอาคาร', shortLabel: 'รวม', order: 0, kind: 'building',
    img: '/Floorplan/Floor4plan.png', heatmap: '/Floorplan/HeatmapgridFloor4.svg',
    meter: { apiBase: 'https://metera-production.up.railway.app', source: 'pm_building' } },
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

  // ลบห้อง/มิเตอร์เก่าที่ไม่อยู่ในลิสต์ ROOMS แล้ว (เช่น 101/200/300 ใน version ก่อน)
  const keepRoomIds = ROOMS.map(r => r.roomId);
  const keepMeterIds = ROOMS.map(r => `meter_${r.roomId}`);
  const delRooms = await Room.deleteMany({ roomId: { $nin: keepRoomIds } });
  const delMeters = await Device.deleteMany({ category: 'meter', deviceId: { $nin: keepMeterIds } });
  console.log(`[seed] pruned ${delRooms.deletedCount} old rooms, ${delMeters.deletedCount} old meters`);

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
