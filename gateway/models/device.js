const { Schema, model } = require('mongoose');

const deviceSchema = new Schema({
  deviceId:  { type: String, required: true, unique: true }, // "ESP32-A3F1" | "tasmota_abc" | "tuya-ir-xxx"
  type:      { type: String, enum: ['esp32-modbus', 'esp32-sensor', 'tasmota', 'tuya-ir', 'camera', 'meter', 'manual'], required: true }, // โปรโตคอล/ที่มา
  category:  { type: String, enum: ['meter', 'switch', 'ir-remote', 'camera', 'sensor', 'other'], default: 'other' }, // บทบาทที่ UI ใช้จัดกลุ่ม
  label:     { type: String, default: '' },        // ชื่อที่ admin ตั้ง
  room:      { type: String, default: '' },        // = Room.roomId
  status:    { type: String, enum: ['pending', 'active', 'offline'], default: 'pending' },
  lastSeen:  { type: Date },
  firmware:  { type: String },                     // ESP32
  modbusSlaveId: { type: Number },                 // ESP32
  mqttTopic: { type: String },                     // Tasmota: "tasmota_abc123" (1 เครื่องอาจมีหลายรีเลย์)
  channel:   { type: Number },                     // เลขรีเลย์ Tasmota (1,2,…) — ว่าง = Power (รีเลย์เดียว)
  tuyaDeviceId: { type: String },                  // Tuya
  irModel:   { type: String },                     // Tuya: AC brand/model key
  config: {                                        // dashboard push → device pull
    pollIntervalMs: { type: Number, default: 5000 },
    backendUrl:     { type: String, default: '' },
    modbusMap:      { type: Schema.Types.Mixed },
  },
  meta: { type: Schema.Types.Mixed },              // arbitrary extra fields
}, { timestamps: true });

module.exports = model('GwDevice', deviceSchema, 'gw_devices');
