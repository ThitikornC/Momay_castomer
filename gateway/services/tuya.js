/**
 * Tuya OpenAPI service
 * Docs: https://developer.tuya.com/en/docs/cloud
 *
 * ใช้ได้กับ:
 *   - IR Blaster (ส่ง IR code ไปยัง AC / TV)
 *   - Smart Switch (ถ้าไม่ได้ใช้ MQTT)
 */
const axios = require('axios');
const crypto = require('crypto');

const BASE_URL    = () => process.env.TUYA_BASE_URL    || 'https://openapi.tuyaus.com';
const ACCESS_ID   = () => process.env.TUYA_ACCESS_ID   || '';
const ACCESS_SECRET = () => process.env.TUYA_ACCESS_SECRET || '';

let _token = null;
let _tokenExpiry = 0;

// ── HMAC-SHA256 signing (Tuya OpenAPI v2) ───────────────────────────
// docs: sign = HMAC-SHA256(client_id [+access_token] + t + nonce + stringToSign, secret)
//   stringToSign = METHOD\n SHA256(body)\n (headers)\n url
const _sha256 = s => crypto.createHash('sha256').update(s || '').digest('hex');
const _hmac   = (s, secret) => crypto.createHmac('sha256', secret).update(s).digest('hex').toUpperCase();

function _stringToSign(method, path, body = '') {
  return [method.toUpperCase(), _sha256(body), '', path].join('\n');
}

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const t     = Date.now().toString();
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const path  = '/v1.0/token?grant_type=1';
  // token request: ไม่มี access_token, HMAC key = secret ล้วน
  const signStr = ACCESS_ID() + t + nonce + _stringToSign('GET', path, '');
  const sig = _hmac(signStr, ACCESS_SECRET());

  const { data } = await axios.get(`${BASE_URL()}${path}`, {
    headers: { client_id: ACCESS_ID(), sign: sig, t, nonce, sign_method: 'HMAC-SHA256' },
  });

  if (!data.success) throw new Error(`Tuya token error: ${data.msg} (code: ${data.code})`);
  _token       = data.result.access_token;
  _tokenExpiry = Date.now() + (data.result.expire_time - 60) * 1000;
  return _token;
}

async function request(method, path, body = null) {
  const token   = await getToken();
  const t       = Date.now().toString();
  const nonce   = crypto.randomUUID().replace(/-/g, '');
  const bodyStr = body ? JSON.stringify(body) : '';
  // business request: ใส่ access_token ใน signStr, HMAC key = secret ล้วน (ไม่ใช่ secret+token)
  const signStr = ACCESS_ID() + token + t + nonce + _stringToSign(method, path, bodyStr);
  const sig = _hmac(signStr, ACCESS_SECRET());

  const { data } = await axios.request({
    method,
    url: `${BASE_URL()}${path}`,
    headers: {
      client_id: ACCESS_ID(),
      access_token: token,
      sign: sig,
      t, nonce,
      sign_method: 'HMAC-SHA256',
      'Content-Type': 'application/json',
    },
    data: body || undefined,
  });

  if (!data.success) throw new Error(`Tuya API error: ${data.msg} (code: ${data.code})`);
  return data.result;
}

// ── Device info ──────────────────────────────────────────────────────
async function getDeviceInfo(deviceId) {
  return request('GET', `/v1.0/devices/${deviceId}`);
}

async function getDeviceStatus(deviceId) {
  return request('GET', `/v1.0/devices/${deviceId}/status`);
}

// ── IR Blaster / AC ──────────────────────────────────────────────────
// endpoint ที่ทดสอบแล้วทำงานจริง (port จาก Momay_Bangkrong/server.js)

// ส่ง AC แบบ scenes (power+mode+temp+wind ในคำสั่งเดียว) — ค่าเป็น string
async function sendAcCommand(irDeviceId, remoteId, ac = {}) {
  const body = {
    power: String(ac.power != null ? ac.power : 1),   // 1=on 0=off
    mode:  String(ac.mode  != null ? ac.mode  : 0),   // 0=cool 1=heat 2=auto 3=fan 4=dry
    temp:  String(ac.temp  != null ? ac.temp  : 25),  // 16-30
    wind:  String(ac.wind  != null ? ac.wind  : 0),   // 0=auto 1=low 2=mid 3=high
  };
  return request('POST', `/v2.0/infrareds/${irDeviceId}/air-conditioners/${remoteId}/scenes/command`, body);
}

// ส่ง AC คำสั่งเดียว เช่น เปิด/ปิด power: sendAcKey(ir, remote, 'power', 1)
async function sendAcKey(irDeviceId, remoteId, code, value) {
  return request('POST', `/v2.0/infrareds/${irDeviceId}/air-conditioners/${remoteId}/command`, { code, value });
}

// ส่ง IR key ของรีโมตทั่วไป (TV ฯลฯ)
async function sendIrKey(irDeviceId, remoteId, keyId) {
  return request('POST', `/v2.0/infrareds/${irDeviceId}/remotes/${remoteId}/raw/command`, { key: keyId });
}

// ดึงรายการ IR remotes ที่ผูกกับ IR blaster
async function getIrRemotes(irDeviceId) {
  return request('GET', `/v2.0/infrareds/${irDeviceId}/remotes`);
}

// ส่ง custom IR code (raw / NEC / etc.)
async function sendCustomIr(irDeviceId, code) {
  return request('POST', `/v1.0/infrareds/${irDeviceId}/learning-codes`, {
    code,
  });
}

// ── Smart switch (Tuya non-MQTT) ────────────────────────────────────
async function sendCommand(deviceId, commands) {
  // commands: [{ code: 'switch_1', value: true }]
  return request('POST', `/v1.0/devices/${deviceId}/commands`, { commands });
}

module.exports = {
  getDeviceInfo,
  getDeviceStatus,
  sendIrKey,
  sendAcCommand,
  sendAcKey,
  getIrRemotes,
  sendCustomIr,
  sendCommand,
};
