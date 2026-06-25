const { Schema, model } = require('mongoose');

const roomSchema = new Schema({
  roomId:     { type: String, required: true, unique: true }, // เช่น "ห้อง101โถงชั้น1" | "ทั้งอาคาร"
  label:      { type: String, default: '' },                  // ชื่อแสดงผล เช่น "ห้อง 101"
  shortLabel: { type: String, default: '' },                  // ป้ายปุ่มสั้น เช่น "101" / "รวม"
  order:      { type: Number, default: 0 },                   // ลำดับการแสดง (น้อย = ก่อน)
  kind:       { type: String, enum: ['room', 'building'], default: 'room' }, // building = การ์ดรวมทั้งอาคาร
  img:        { type: String, default: '' },                  // path รูปผัง เช่น /Floorplan/Floor1plan.png
  heatmap:    { type: String, default: '' },                  // path heatmap svg
  // ข้อมูลลูกค้า/มิเตอร์ สำหรับการ์ดมุมซ้าย (แก้ผ่าน seed/DB ได้ ไม่ต้อง hardcode ใน frontend)
  info: {
    siteName:       { type: String, default: '' },            // ชื่อสถานที่ เช่น "สำนักหอสมุด ม.บูรพา"
    userNumber:     { type: String, default: '' },            // เลขผู้ใช้ไฟ
    contractNumber: { type: String, default: '' },            // เลขสัญญา
    dateInstalled:  { type: String, default: '' },            // วันที่ติดตั้ง
    contractExpiry: { type: String, default: '' },            // วันหมดสัญญา
  },
}, { timestamps: true });

module.exports = model('GwRoom', roomSchema, 'gw_rooms');
