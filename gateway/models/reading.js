const { Schema, model } = require('mongoose');

const readingSchema = new Schema({
  deviceId: { type: String, required: true, index: true },
  type:     { type: String },           // 'modbus' | 'tasmota' | 'tuya'
  ts:       { type: Date, default: Date.now },   // index มาจาก TTL index ด้านล่างแล้ว
  // power meter fields (ESP32 Modbus / Tasmota energy)
  voltage:  Number,
  current:  Number,
  power:    Number,   // W
  energy:   Number,   // kWh
  pf:       Number,   // power factor
  freq:     Number,
  // switch state
  relay:    { type: Boolean },  // true = ON
  // raw fallback
  raw: { type: Schema.Types.Mixed },
}, { timeseries: undefined, versionKey: false });

// TTL: เก็บ reading 90 วัน
readingSchema.index({ ts: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = model('GwReading', readingSchema, 'gw_readings');
