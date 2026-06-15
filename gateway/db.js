const mongoose = require('mongoose');

// เชื่อม MongoDB แบบ non-fatal: ถ้าเชื่อมไม่ได้ จะ retry เรื่อยๆ โดยไม่ทำให้ HTTP server ล่ม
// (mongoose buffer คำสั่งไว้ระหว่างรอ connect; route จะ error เป็นราย request แต่ server ไม่ตาย)
function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('[DB] MONGODB_URI not set — ทำงานต่อแต่ DB ใช้ไม่ได้'); return; }

  mongoose.connection.on('connected',    () => console.log('[DB] MongoDB connected'));
  mongoose.connection.on('error',        e  => console.error('[DB] error:', e.message));
  mongoose.connection.on('disconnected', () => console.warn('[DB] disconnected — mongoose จะ reconnect ให้'));

  const tryConnect = () => {
    mongoose.connect(uri).catch(e => {
      console.error('[DB] connect failed, retry in 5s:', e.message);
      setTimeout(tryConnect, 5000);
    });
  };
  tryConnect();   // ไม่ await — ปล่อยให้ server start ได้ทันที
}

module.exports = connectDB;
