// ── แปลงหน่วยกำลังไฟที่มิเตอร์ส่งมา (W → kW) ก่อนเอาไปแสดงผล ─────────────────────
//
// ปัญหา: EM96 (momay_ESP/) อ่าน active power จาก Modbus มาเป็น "W" แต่ Momay_BUU_Backend
// คิดพลังงานจากค่านั้นตรงๆ (`energy_kwh = avgPower × ชั่วโมง`) คือถือว่าค่าที่ส่งมาเป็น kW อยู่แล้ว
// ⇒ ทั้งกราฟ Power, หน่วย (kWh), ค่าไฟ และตัวเลข solar ที่ backend ตอบกลับมา เกินจริง 1000 เท่า
//
// ทำไมแก้ที่ frontend: ค่าใน Mongo ถูกเก็บเป็น W ไปแล้ว (รวมข้อมูลย้อนหลัง) และ backend ตัวเดียวกัน
// ยังต้องใช้ได้กับมิเตอร์ที่ส่ง kW จริงๆ ด้วย (momay_ESP_pm3250/ ส่ง kW ดิบ) → หารตอนแสดงผลปลอดภัยสุด
// ไม่ต้องแก้ข้อมูลเก่า ไม่ต้อง redeploy backend และย้อนกลับได้ด้วยการเปลี่ยนค่าเดียว
//
// ตั้งค่าต่อมิเตอร์ได้ที่ /settings → อุปกรณ์ประเภท "มิเตอร์ไฟ" → meta.powerUnit
//   'W'  = มิเตอร์ส่งเป็นวัตต์      → หาร 1000
//   'kW' = ส่งเป็นกิโลวัตต์อยู่แล้ว → ไม่แปลง

// ตัวเลือกในหน้า /settings
export const POWER_UNITS = [
  { value: 'W',  label: 'W — วัตต์ (หาร 1000 ให้เป็น kW) เช่น EM96' },
  { value: 'kW', label: 'kW — กิโลวัตต์อยู่แล้ว (ไม่แปลง) เช่น PM3250' },
]

// ค่าเริ่มต้นเมื่อมิเตอร์ยังไม่ได้ตั้ง meta.powerUnit
// ตั้ง env `VITE_METER_POWER_UNIT=kW` แยกต่อ Railway service ได้ (repo เดียวกันแต่คนละ build)
// default = 'W' เพราะมิเตอร์ที่ใช้อยู่ตอนนี้ (EM96 / IP Power Meter) ส่งเป็น W ทั้งคู่
export const DEFAULT_POWER_UNIT = (import.meta.env.VITE_METER_POWER_UNIT || 'W').trim()

// ตัวหารสำหรับค่าที่ backend ส่งกลับมา: 'W' → 1000, 'kW' → 1 (ไม่แปลง)
export function powerDivisor(unit) {
  return String(unit ?? DEFAULT_POWER_UNIT).trim().toLowerCase() === 'w' ? 1000 : 1
}

// null/undefined/'' ต้องคง null ไว้ (ไม่ใช่ 0) — กราฟใช้ null เป็น "ช่วงที่ไม่มีข้อมูล"
const _num = v => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
// หารเฉพาะค่าที่เป็นตัวเลขจริง — ค่าที่เป็น null/string แปลกๆ คงไว้เหมือนเดิม
const _div = (v, d) => {
  const n = _num(v)
  return n === null ? v : n / d
}
const _divKeys = (obj, keys, d) => {
  const out = { ...obj }
  for (const k of keys) if (out[k] !== undefined && out[k] !== null) out[k] = _div(out[k], d)
  return out
}

// ── /daily-energy/:source → แถวข้อมูลดิบจาก ESP ────────────────────────────────
// แปลงเฉพาะ field กำลังไฟ (power, active/reactive/apparent_power_*)
// ไม่แตะ power_factor_*, voltage, current, frequency — พวกนี้หน่วยถูกอยู่แล้ว
const POWER_FIELD = /^power$|^(active|reactive|apparent)_power(_|$)/

export function scaleEnergyRows(rows, unit) {
  const d = powerDivisor(unit)
  if (!Array.isArray(rows)) return []
  if (d === 1) return rows
  return rows.map(row => {
    if (!row || typeof row !== 'object') return row
    const out = { ...row }
    for (const k of Object.keys(out)) if (POWER_FIELD.test(k)) out[k] = _div(out[k], d)
    return out
  })
}

// ── /daily-bill ───────────────────────────────────────────────────────────────
// rate_per_kwh / samples ไม่ใช่ค่าที่ scale ตามกำลังไฟ → ไม่แตะ
const DAILY_BILL_KEYS = ['total_energy_kwh', 'avg_power_kw', 'max_power_kw', 'min_power_kw', 'electricity_bill']

export function scaleDailyBill(json, unit) {
  const d = powerDivisor(unit)
  if (!json || typeof json !== 'object' || d === 1) return json
  return _divKeys(json, DAILY_BILL_KEYS, d)
}

// ── /solar-size ───────────────────────────────────────────────────────────────
// sunHours เป็นค่าคงที่ (ชั่วโมงแดด) → ไม่แตะ
const SOLAR_KEYS = [
  'dayEnergy', 'nightEnergy', 'dayCost', 'nightCost', 'totalEnergyKwh', 'totalCost',
  'solarCapacity_kW', 'peakPowerDay', 'savingsDay', 'savingsMonth', 'savingsYear',
]
const SOLAR_HOUR_KEYS = ['energy_kwh', 'electricity_bill', 'peak_power']

export function scaleSolar(json, unit) {
  const d = powerDivisor(unit)
  if (!json || typeof json !== 'object' || d === 1) return json
  const out = _divKeys(json, SOLAR_KEYS, d)
  if (Array.isArray(json.hourly)) out.hourly = json.hourly.map(h => _divKeys(h, SOLAR_HOUR_KEYS, d))
  return out
}

// ── /calendar ─────────────────────────────────────────────────────────────────
// events เป็นข้อความสำเร็จรูป ("12.34 Unit" / "543.21฿") → แทนตัวเลขตัวแรกด้วยค่าที่หารแล้ว
export function scaleCalendarEvents(events, unit) {
  const d = powerDivisor(unit)
  if (!Array.isArray(events)) return []
  if (d === 1) return events
  const fix = s => String(s ?? '').replace(/-?\d+(\.\d+)?/, m => (Number(m) / d).toFixed(2))
  return events.map(e => ({
    ...e,
    title: fix(e?.title),
    extendedProps: e?.extendedProps
      ? { ...e.extendedProps, display_text: fix(e.extendedProps.display_text) }
      : e?.extendedProps,
  }))
}

// ── /api/notifications/all ────────────────────────────────────────────────────
// title/body เป็นข้อความที่ backend ประกอบไว้ตอนบันทึก → หารตัวเลขที่ตามด้วยหน่วยพลังงาน/เงิน
// (?![A-Za-z0-9]) : ใช้แทน \b เพราะ ฿ / บาท ไม่ใช่ word character → \b ไม่ทำงาน
// (?!\/)          : ข้ามเรตต่อหน่วย เช่น "4.4 THB/kWh" (ค่าคงที่ ไม่ได้ scale ตามกำลังไฟ)
//                   แต่ยัง scale "1234.5 Unit / 5432.1 บาท" ปกติ เพราะตัวคั่นมีเว้นวรรค
const TEXT_NUMBER = /(-?\d+(?:\.\d+)?)(\s*)(kWh|kW|W|Unit|THB|฿|บาท)(?![A-Za-z0-9])(?!\/)/gi

function scaleText(s, d) {
  if (typeof s !== 'string' || d === 1) return s
  return s.replace(TEXT_NUMBER, (_full, numStr, gap, unit) => `${(Number(numStr) / d).toFixed(2)}${gap}${unit}`)
}

const NOTI_KEYS = ['power', 'energy_kwh', 'electricity_bill']
const NOTI_DAY_KEYS = ['energy_kwh', 'electricity_bill']
const NOTI_DIFF_KEYS = ['kWh', 'electricity_bill']

export function scaleNotifications(list, unit) {
  const d = powerDivisor(unit)
  if (!Array.isArray(list)) return []
  if (d === 1) return list
  return list.map(n => {
    if (!n || typeof n !== 'object') return n
    const out = _divKeys(n, NOTI_KEYS, d)
    out.title = scaleText(n.title, d)
    out.body  = scaleText(n.body, d)
    if (n.yesterday) out.yesterday = _divKeys(n.yesterday, NOTI_DAY_KEYS, d)
    if (n.dayBefore) out.dayBefore = _divKeys(n.dayBefore, NOTI_DAY_KEYS, d)
    if (n.diff)      out.diff      = _divKeys(n.diff, NOTI_DIFF_KEYS, d)
    return out
  })
}
