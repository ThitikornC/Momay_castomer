import { useState, useEffect, useRef, useMemo } from 'react'
import { DEFAULT_POWER_UNIT, scaleSolar, scaleEnergyRows, scaleCalendarEvents } from '../lib/meterScale.js'

// ── ตัวสร้างรายงานโซล่าเซลล์ — เลือกวัน/หัวข้อเอง แล้ว Export PDF หรือแชร์ให้ลูกค้า ──

const DARK_BG      = '#111'
const DARK_CARD    = '#1a1a1a'
const AMBER        = '#FFB800'
const AMBER_DIM    = '#e8c97a'
const AMBER_BORDER = '1.5px solid rgba(255,184,0,0.4)'

// สีของตัวรายงาน (โทนสว่าง สำหรับพิมพ์/ส่งลูกค้า)
const R = {
  red: '#d93025', lightRed: '#fcdbdc', teal: '#00897b', tealHi: '#aee2d9',
  greenBar: '#0f8a5f', lightGreen: '#9ae2c3', darkGreen: '#116149',
  text: '#202124', muted: '#5f6368', border: '#e0e0e0', line: '#aeb6bd',
}

const TH_MONTH_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
const TH_MONTH_FULL  = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

const _d = ds => new Date(ds + 'T00:00:00')
const thShort = ds => { const d = _d(ds); return `${d.getDate()} ${TH_MONTH_SHORT[d.getMonth()]} ${d.getFullYear() + 543}` }
const thFull  = ds => { const d = _d(ds); return `${d.getDate()} ${TH_MONTH_FULL[d.getMonth()]} ${d.getFullYear() + 543}` }

const n2 = v => (v === null || v === undefined || Number.isNaN(v)) ? '--' : Number(v).toFixed(2)
const nL = v => (v === null || v === undefined || Number.isNaN(v)) ? '--'
  : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// แบตเตอรี่ใช้งานได้จริงแค่ ~80% ของความจุ (Depth of Discharge) → ต้องซื้อความจุมากกว่าพลังงานที่ใช้
const BATTERY_DOD = 0.8

// ค่าไฟรายเดือน/รายปีในตารางสรุป ประมาณจากการใช้ไฟของวันนั้นวันเดียว
// คิดเดือนละ 30 วัน ปีละ 12 เดือน (ฐานเดียวกับตารางจุดคุ้มทุน) → รายเดือน × 12 = รายปี เสมอ
const BILL_DAYS_PER_MONTH  = 30
const BILL_MONTHS_PER_YEAR = 12

// ซ่อนข้อมูลก่อนวันติดตั้ง เหมือนหน้าอื่นในแอป (ดู DATA_MIN_DATE ใน MomayRelationshipLayer)
const DATA_MIN_DATE = (import.meta.env.VITE_DATA_MIN_DATE || '').trim()

// รวมพลังงานในช่วงชั่วโมง [start, end) — end <= start คือช่วงที่คร่อมเที่ยงคืน (เช่น 20:00–04:00)
function sumWindow(hours, start, end) {
  if (!hours.length) return 0
  const pick = h => hours[h] || 0
  let sum = 0
  if (end > start) for (let h = start; h < end; h++) sum += pick(h)
  else {
    for (let h = start; h < 24; h++) sum += pick(h)
    for (let h = 0; h < end; h++) sum += pick(h)
  }
  return sum
}

const hhmm = h => `${String(h).padStart(2, '0')}:00`
const toMin = s => { const [h, m] = String(s).split(':').map(Number); return (h || 0) * 60 + (m || 0) }

// timestamp ที่ backend ส่งมาไม่มี timezone และเป็นเวลาไทย — ตีความเป็น +07:00 แล้วอ่านเป็น UTC
// จะได้ "นาฬิกา" ชุดเดียวกับที่ /solar-size ใช้แบ่งชั่วโมง (ตรวจแล้วตรงกันทุกช่อง)
const parseTs = ts => new Date(/[Zz]|[+-]\d\d:?\d\d$/.test(ts) ? ts : ts + '+07:00')

// กระจายพลังงานลงถังรายนาที ด้วยอัลกอริทึมเดียวกับ backend (เฉลี่ยกำลังไฟระหว่างจุดอ่าน)
function minuteEnergyFromRaw(readings) {
  const out = new Float64Array(1440)
  const pts = readings
    .map(d => ({ t: parseTs(d.timestamp), p: d.active_power_total ?? 0 }))
    .filter(d => !Number.isNaN(+d.t))
    .sort((a, b) => a.t - b.t)

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1], curr = pts[i]
    const avg = (prev.p + curr.p) / 2
    let t = new Date(prev.t)
    while (t < curr.t) {
      const next = new Date(t)
      next.setUTCMinutes(next.getUTCMinutes() + 1, 0, 0)
      const end = next < curr.t ? next : curr.t
      const idx = t.getUTCHours() * 60 + t.getUTCMinutes()
      out[idx] += avg * ((end - t) / 3600000)
      t = end
    }
  }
  return out
}

// รวมพลังงานช่วง [startMin, endMin) รองรับช่วงที่คร่อมเที่ยงคืน
// posOnly = นับเฉพาะนาทีที่ใช้ไฟจริง ตัดค่าติดลบ (ไฟไหลย้อน) ทิ้ง — ใช้กับการ์ดแบต
// ถ้าไม่ตัด ช่วงที่ยาวกว่าอาจได้ค่าน้อยกว่าช่วงสั้น เพราะค่าลบไปหักกลบ
function sumMinutes(mins, startMin, endMin, posOnly = false) {
  if (!mins) return 0
  const val = i => (posOnly ? Math.max(0, mins[i]) : mins[i])
  let sum = 0
  if (endMin > startMin) for (let i = startMin; i < endMin; i++) sum += val(i)
  else {
    for (let i = startMin; i < 1440; i++) sum += val(i)
    for (let i = 0; i < endMin; i++) sum += val(i)
  }
  return sum
}

// กำลังไฟเฉลี่ยรายนาที ไว้วาดกราฟตรวจข้อมูล — null = นาทีที่ไม่มีจุดอ่านเลย (กราฟจะขาดตรงนั้น)
// เก็บแค่ 1440 ค่า/วัน แทนแถวดิบทั้งหมด (~8,000 แถว) จะได้ cache หลายวันพร้อมกันได้
function minutePowerFromRaw(readings) {
  const sum = new Float64Array(1440), cnt = new Int32Array(1440)
  readings.forEach(d => {
    const t = parseTs(d.timestamp)
    if (Number.isNaN(+t)) return
    const i = t.getUTCHours() * 60 + t.getUTCMinutes()
    sum[i] += d.active_power_total ?? 0
    cnt[i] += 1
  })
  return Array.from({ length: 1440 }, (_, i) => (cnt[i] ? sum[i] / cnt[i] : null))
}

// ── ตรวจความครบของข้อมูลรายวัน ────────────────────────────────────────────────
// ปกติมิเตอร์ส่งทุกไม่กี่วินาที → ห่างกันเกิน 5 นาทีถือว่าข้อมูลขาดช่วง
const GAP_MS = 5 * 60 * 1000
// backend query เป็น "วัน UTC" และแบ่งชั่วโมงด้วย getUTCHours() ของ timestamp ที่เก็บไว้
// → ขอบวันฝั่งนี้ต้องใช้ UTC ให้ตรงกัน ไม่งั้นตัวเลขจะเหลื่อมกัน 7 ชม.
const dayStartMs = ds => Date.parse(ds + 'T00:00:00Z')
const hhmmOf     = ms => new Date(ms).toISOString().slice(11, 16)

// กระจายช่วงเวลา [a,b) ลงถังรายชั่วโมง (หน่วย ms)
function addSpan(buckets, a, b, day0) {
  let t = a
  while (t < b) {
    const idx = Math.floor((t - day0) / 3600000)
    if (idx < 0 || idx > 23) break
    const end = Math.min(b, day0 + (idx + 1) * 3600000)
    buckets[idx] += end - t
    t = end
  }
}

function coverageOf(rows, ds) {
  const day0   = dayStartMs(ds)
  const dayEnd = day0 + 86400000
  // วันนี้ยังไม่จบ → คิดความครบแค่ถึงตอนนี้ ไม่งั้นจะขึ้นว่าขาดข้อมูลทั้งที่ยังไม่ถึงเวลา
  const until    = Math.min(dayEnd, Date.now())
  const expected = Math.max(0, until - day0)
  const hourMs   = new Float64Array(24)
  const gaps     = []
  let covered = 0

  const ts = rows
    .map(r => +parseTs(r.timestamp))
    .filter(t => Number.isFinite(t) && t >= day0 && t <= dayEnd)
    .sort((a, b) => a - b)

  // นับช่วงก่อนจุดแรกและหลังจุดสุดท้ายด้วย ไม่งั้นวันที่มีข้อมูลแค่ชั่วโมงเดียวจะขึ้น 100%
  const marks = [day0, ...ts, until]
  for (let i = 1; i < marks.length; i++) {
    const a = marks[i - 1], b = marks[i]
    if (b <= a) continue
    if (b - a <= GAP_MS) { covered += b - a; addSpan(hourMs, a, b, day0) }
    else gaps.push({ from: a, to: b, mins: (b - a) / 60000 })
  }
  gaps.sort((x, y) => y.mins - x.mins)

  const elapsedH = expected / 3600000
  return {
    points: ts.length,
    truncated: rows.length >= 10000,     // backend จำกัด 10,000 จุด/วัน → เกินนั้นข้อมูลท้ายวันถูกตัด
    partialDay: until < dayEnd,
    pct: expected > 0 ? covered / expected : 0,
    first: ts.length ? hhmmOf(ts[0]) : null,
    last:  ts.length ? hhmmOf(ts[ts.length - 1]) : null,
    maxGapMin: gaps.length ? gaps[0].mins : 0,
    gaps: gaps.slice(0, 5).map(g => ({ ...g, fromStr: hhmmOf(g.from), toStr: hhmmOf(g.to) })),
    // สัดส่วนข้อมูลรายชั่วโมง — null = ชั่วโมงที่ยังไม่ถึง (ของวันนี้) เทียบเฉพาะเวลาที่ผ่านไปจริง
    hourPct: Array.from({ length: 24 }, (_, h) => {
      const avail = Math.max(0, Math.min(1, elapsedH - h))
      return avail <= 0 ? null : Math.min(1, hourMs[h] / (avail * 3600000))
    }),
  }
}

// สีบอกความครบ — เขียว/เหลือง/แดง ใช้ทั้งชิปวันที่ แถบรายชั่วโมง และตัวเลขสรุป
const covColor = p => (p === null || p === undefined) ? '#333' : p >= 0.95 ? '#2ecc71' : p >= 0.7 ? '#f1c40f' : '#e74c3c'

function todayStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function SolarReportBuilder({ open, onClose, apiBase, device, siteName, initialDate, powerUnit = DEFAULT_POWER_UNIT }) {
  const [dates, setDates]       = useState([])
  const [cache, setCache]       = useState({})      // date -> solar json | 'error'
  const [pending, setPending]   = useState([])      // วันที่กำลังโหลด
  const [pickDate, setPickDate] = useState(initialDate || todayStr())
  const [rate, setRate]         = useState(4.4)

  const [showMax, setShowMax] = useState(true)
  const [showMin, setShowMin] = useState(true)
  const [showAvg, setShowAvg] = useState(true)

  const [solarShow, setSolarShow]   = useState({ max: true, min: true, avg: true, manual: false })
  const [solarRec,  setSolarRec]    = useState('avg')
  const [battShow,  setBattShow]    = useState({ evening: true, night: true, custom: false, manual: false })
  const [battRec,   setBattRec]     = useState('evening')

  // การ์ดที่กรอกตัวเลขเอง — ไว้เสนอขนาดที่ลูกค้าอยากได้ ไม่ต้องอิงสูงสุด/ต่ำสุด/เฉลี่ย
  const [solarManual, setSolarManual] = useState({ label: 'ตามที่ลูกค้าต้องการ', kw: '', note: '' })
  const [battManual,  setBattManual]  = useState({ label: 'ตามที่ลูกค้าต้องการ', kwh: '', note: '' })
  const [battCustom, setBattCustom] = useState({ start: '20:00', end: '04:00' })
  const [rawCache, setRawCache]     = useState({})   // date -> { mins, power, cov } จากข้อมูลดิบ

  // ตารางจุดคุ้มทุน — แยกโซล่าเซลล์กับแบตเตอรี่คนละตาราง เงินลงทุนคนละก้อน
  // ฝั่งโซล่า: เว้นขนาดว่างไว้ = ใช้ค่าที่ระบบแนะนำจากการใช้ไฟจริง
  // ฝั่งแบต: กรอกความจุเองทั้งหมด (เลือกรุ่นแบตตามที่จะเสนอ ไม่ผูกกับตัวเลขที่ระบบแนะนำ)
  const [showPaySolar, setShowPaySolar] = useState(true)
  const [payKw, setPayKw]               = useState('')
  const [paySun, setPaySun]             = useState(4)
  const [payInvest, setPayInvest]       = useState(200000)

  const [showPayBatt, setShowPayBatt]     = useState(true)
  const [payBattKwh, setPayBattKwh]       = useState(10)
  const [payBattDod, setPayBattDod]       = useState(BATTERY_DOD * 100)
  const [payBattInvest, setPayBattInvest] = useState(150000)

  const [reportDate, setReportDate] = useState(todayStr())   // วันที่จัดทำรายงานบนหัวเอกสาร
  const [checkDate, setCheckDate]   = useState(null)  // วันที่กำลังเปิดกราฟตรวจความครบข้อมูล
  const [clientName, setClientName] = useState('')    // ว่าง = ใช้ชื่อจากทะเบียนห้อง (siteName)
  const [reportNote, setReportNote] = useState('')    // หมายเหตุท้ายรายงาน พิมพ์เอง
  const [images, setImages]         = useState([])
  const [sunIntensity, setSunPct]   = useState(96)
  const [busy, setBusy]             = useState('')

  const reportRef = useRef(null)
  const scaleRef  = useRef(null)
  const rawReqRef = useRef({})                        // กันยิง /daily-energy ซ้ำวันเดียวกัน

  useEffect(() => {
    if (open && dates.length === 0 && initialDate) addDate(initialDate)
  }, [open])

  async function addDate(ds) {
    if (!ds || dates.includes(ds)) return
    setDates(prev => [...prev, ds].sort())
    if (cache[ds]) return
    setPending(p => [...p, ds])
    try {
      const r = await fetch(`${apiBase}/solar-size?date=${ds}&ratePerKwh=${rate}`)
      const j = await r.json()
      // วันที่ไม่มีข้อมูลยังตอบ hourly เป็น 0 ทั้งวันมาด้วย → ต้องเช็ค error ไม่งั้นได้แถวศูนย์
      setCache(c => ({ ...c, [ds]: (j && !j.error && j.hourly) ? scaleSolar(j, powerUnit) : 'error' }))
    } catch {
      setCache(c => ({ ...c, [ds]: 'error' }))
    } finally {
      setPending(p => p.filter(x => x !== ds))
    }
  }

  function removeDate(ds) {
    setDates(prev => prev.filter(d => d !== ds))
  }

  // เปลี่ยนอัตราค่าไฟ → ต้องดึงใหม่ทุกวัน เพราะ backend คำนวณค่าเงินให้
  async function applyRate(newRate) {
    setRate(newRate)
    setCache({})
    const all = [...dates]
    setPending(all)
    for (const ds of all) {
      try {
        const r = await fetch(`${apiBase}/solar-size?date=${ds}&ratePerKwh=${newRate}`)
        const j = await r.json()
        // วันที่ไม่มีข้อมูลยังตอบ hourly เป็น 0 ทั้งวันมาด้วย → ต้องเช็ค error ไม่งั้นได้แถวศูนย์
      setCache(c => ({ ...c, [ds]: (j && !j.error && j.hourly) ? scaleSolar(j, powerUnit) : 'error' }))
      } catch {
        setCache(c => ({ ...c, [ds]: 'error' }))
      } finally {
        setPending(p => p.filter(x => x !== ds))
      }
    }
  }

  // ข้อมูลดิบรายวัน ใช้ร่วมกัน 3 อย่าง: การ์ดแบต (พลังงานรายนาที), ป้ายความครบบนชิปวันที่
  // และกราฟตรวจข้อมูล → ดึงครั้งเดียวต่อวัน แล้ว cache ไว้
  async function ensureRaw(ds) {
    if (!apiBase || rawCache[ds] || rawReqRef.current[ds]) return
    rawReqRef.current[ds] = true
    try {
      const r = await fetch(`${apiBase}/daily-energy/${device}?date=${ds}`)
      const j = await r.json()
      const rows = scaleEnergyRows(j?.data || [], powerUnit)
      setRawCache(c => ({
        ...c,
        [ds]: { mins: minuteEnergyFromRaw(rows), power: minutePowerFromRaw(rows), cov: coverageOf(rows, ds) },
      }))
    } catch {
      delete rawReqRef.current[ds]                    // ให้ลองใหม่ได้ถ้าดึงพลาด
    }
  }

  // โหลดข้อมูลดิบของทุกวันที่เลือก (ทีละวัน ไม่ยิงพร้อมกันทั้งหมด)
  useEffect(() => {
    if (!open || !apiBase) return
    let alive = true
    const missing = dates.filter(ds => cache[ds] && cache[ds] !== 'error' && !rawCache[ds])
    if (!missing.length) return
    ;(async () => {
      for (const ds of missing) {
        if (!alive) return
        await ensureRaw(ds)
      }
    })()
    return () => { alive = false }
  }, [open, dates, cache, apiBase, device, powerUnit])

  // เปลี่ยนมิเตอร์/หน่วยกำลังไฟ → ข้อมูลดิบที่ cache ไว้ใช้ไม่ได้แล้ว
  useEffect(() => {
    setRawCache({})
    rawReqRef.current = {}
  }, [apiBase, device, powerUnit])

  function onPickImages(e) {
    const files = Array.from(e.target.files || [])
    files.forEach(f => {
      const fr = new FileReader()
      fr.onload = () => setImages(prev => [...prev, { id: `${f.name}-${Date.now()}-${Math.random()}`, name: f.name, url: fr.result }])
      fr.readAsDataURL(f)
    })
    e.target.value = ''
  }

  const rows = useMemo(() => {
    return dates
      .map(ds => {
        const j = cache[ds]
        if (!j || j === 'error') return null
        const hours = (j.hourly || []).map(h => h.energy_kwh || 0)
        return {
          date: ds,
          total: j.totalEnergyKwh, day: j.dayEnergy, night: j.nightEnergy,
          solarKw: j.solarCapacity_kW, savingsDay: j.savingsDay, savingsYear: j.savingsYear,
          hours,
          // การ์ดแบตทั้งหมดคิดจากข้อมูลรายนาทีชุดเดียวกัน + ตัดค่าติดลบ
          // (คิดคนละฐานกันเมื่อไหร่ ช่วงย่อยจะเกินช่วงใหญ่ได้)
          battEvening: sumMinutes(rawCache[ds]?.mins, 18 * 60, 0, true),
          battNight:   sumMinutes(rawCache[ds]?.mins, 18 * 60, 6 * 60, true),
          battCustom:  sumMinutes(rawCache[ds]?.mins, toMin(battCustom.start), toMin(battCustom.end), true),
          hasRaw: !!rawCache[ds],
        }
      })
      .filter(Boolean)
  }, [dates, cache, battCustom, rawCache])

  const stats = useMemo(() => {
    if (!rows.length) return null
    const totals = rows.map(r => r.total)
    const maxRow = rows[totals.indexOf(Math.max(...totals))]
    const minRow = rows[totals.indexOf(Math.min(...totals))]
    const mean = k => rows.reduce((s, r) => s + (r[k] || 0), 0) / rows.length
    const avg = {
      total: mean('total'), day: mean('day'), night: mean('night'),
      solarKw: mean('solarKw'), savingsDay: mean('savingsDay'),
      savingsYear: mean('savingsYear'),
    }
    // การ์ดแบตเฉลี่ยเฉพาะวันที่โหลดข้อมูลรายนาทีมาแล้ว ไม่งั้นวันที่ยังไม่มาจะถูกนับเป็น 0
    // และต้องใช้ตัวหารชุดเดียวกันทั้ง 3 ใบ ไม่งั้นเทียบกันไม่ได้
    const withRaw = rows.filter(r => r.hasRaw)
    const meanRaw = k => withRaw.length ? withRaw.reduce((s, r) => s + (r[k] || 0), 0) / withRaw.length : 0
    avg.battEvening = meanRaw('battEvening')
    avg.battNight   = meanRaw('battNight')
    avg.battCustom  = meanRaw('battCustom')
    return { maxRow, minRow, avg, customDays: withRaw.length }
  }, [rows])

  // ── ตารางจุดคุ้มทุน ────────────────────────────────────────────────────────
  // ทั้งสองตารางคิดแบบเดียวกัน: พลังงานที่ได้ต่อวัน × ค่าไฟ → ประหยัด/วัน → ×30 → ×12
  // ต่างกันแค่ที่มาของพลังงาน (แผงผลิตเอง vs แบตคายประจุ) และเงินลงทุนคนละก้อน
  const saveOf = (energyPerDay, invest) => {
    const saveDay   = energyPerDay * rate
    const saveMonth = saveDay * 30              // คิดเดือนละ 30 วัน / ปีละ 12 เดือน (= 360 วัน)
    const saveYear  = saveMonth * 12
    return { saveDay, saveMonth, saveYear, years: saveYear > 0 ? invest / saveYear : null }
  }

  // เว้นขนาดระบบไว้ = ใช้ค่าที่แนะนำจากการใช้ไฟจริง (ค่าเฉลี่ยกลางวัน ÷ ชั่วโมงแดด)
  const payKwAuto = stats ? stats.avg.solarKw : 0
  const paybackSolar = useMemo(() => {
    const kw      = Number(payKw) > 0 ? Number(payKw) : payKwAuto
    const sun     = Number(paySun) || 0
    const invest  = Number(payInvest) || 0
    const prodDay = kw * sun                    // พลังงานที่ผลิตได้ต่อวัน (หน่วย/วัน)
    return { kw, sun, invest, prodDay, auto: !(Number(payKw) > 0), ...saveOf(prodDay, invest) }
  }, [payKw, paySun, payInvest, rate, payKwAuto])

  const paybackBatt = useMemo(() => {
    const kwh    = Number(payBattKwh) || 0
    const dod    = Number(payBattDod) || 0
    const invest = Number(payBattInvest) || 0
    const usable = kwh * (dod / 100)             // ใช้ได้จริงต่อรอบ = ความจุ × DoD
    return { kwh, dod, invest, usable, ...saveOf(usable, invest) }
  }, [payBattKwh, payBattDod, payBattInvest, rate])

  if (!open) return null

  const loading = pending.length > 0

  // ── Export ────────────────────────────────────────────────────────────────
  const CAPTURE_SCALE = 2

  async function capture() {
    const el = reportRef.current
    if (!el) return null
    const wrap = scaleRef.current
    const prev = wrap ? wrap.style.transform : null
    if (wrap) wrap.style.transform = 'none'        // html2canvas วัดขนาดผิดถ้า parent ถูก scale
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    // ตำแหน่งหัวข้อแต่ละส่วน (พิกัดใน canvas) ไว้ใช้เลือกจุดตัดหน้า — ต้องวัดตอนยังไม่ scale
    const top = el.getBoundingClientRect().top
    const breaks = [...el.querySelectorAll('[data-break]')]
      .map(n => (n.getBoundingClientRect().top - top) * CAPTURE_SCALE)
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(el, { scale: CAPTURE_SCALE, useCORS: true, logging: false, backgroundColor: '#ffffff' })
    if (wrap) wrap.style.transform = prev
    return { canvas, breaks }
  }

  async function buildPdf() {
    const captured = await capture()
    if (!captured) return null
    const { canvas, breaks } = captured
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const margin = 8
    const imgW = 210 - margin * 2
    const pxPerMm = canvas.width / imgW
    const pageHpx = Math.floor((297 - margin * 2) * pxPerMm)

    let y = 0, page = 0
    while (y < canvas.height) {
      let sliceH = Math.min(pageHpx, canvas.height - y)
      if (y + sliceH < canvas.height) {
        // ตัดหน้าที่ขอบ section แทนที่จะตัดกลางการ์ด/ปล่อยหัวข้อค้างท้ายหน้า
        // จำกัดไม่ให้ต่ำกว่า 35% ของหน้า กันหน้าโล่งเกินไป
        const fits = breaks.filter(b => b > y + pageHpx * 0.35 && b < y + sliceH)
        if (fits.length) sliceH = Math.max(...fits) - y
      }
      const slice = document.createElement('canvas')
      slice.width = canvas.width; slice.height = sliceH
      const ctx = slice.getContext('2d')
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, slice.width, slice.height)
      ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
      if (page > 0) pdf.addPage()
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, sliceH / pxPerMm)
      y += sliceH; page++
    }
    return pdf
  }

  const fileName = `SolarReport-${(siteName || 'report').replace(/[\\/:*?"<>|\s]+/g, '_')}-${reportDate || todayStr()}.pdf`

  async function exportPdf() {
    setBusy('pdf')
    try {
      const pdf = await buildPdf()
      if (pdf) pdf.save(fileName)
    } catch (err) { console.error('export pdf failed:', err) }
    finally { setBusy('') }
  }

  async function sharePdf() {
    setBusy('share')
    try {
      const pdf = await buildPdf()
      if (!pdf) return
      const blob = pdf.output('blob')
      const file = new File([blob], fileName, { type: 'application/pdf' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'รายงานการใช้ไฟฟ้า', text: siteName || '' })
      } else {
        pdf.save(fileName)                         // เบราว์เซอร์ไม่รองรับแชร์ไฟล์ → ดาวน์โหลดแทน
      }
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('share failed:', err)
    } finally { setBusy('') }
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  const label = { fontSize: 12, fontWeight: 700, color: AMBER, marginBottom: 6, display: 'block' }
  const field = { background: DARK_CARD, border: AMBER_BORDER, borderRadius: 8, color: AMBER_DIM, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
  const btn   = { background: DARK_CARD, border: AMBER_BORDER, borderRadius: 8, color: AMBER_DIM, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
  const group = { marginBottom: 20 }
  const sub   = { fontSize: 11, color: '#999', marginBottom: 4 }

  const Check = ({ on, set, children }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: AMBER_DIM, cursor: 'pointer', padding: '4px 0' }}>
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} style={{ accentColor: AMBER, width: 15, height: 15 }} />
      {children}
    </label>
  )
  const Radio = ({ name, val, cur, set, children, disabled }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: disabled ? '#666' : AMBER_DIM, cursor: disabled ? 'not-allowed' : 'pointer', padding: '4px 0' }}>
      <input type="radio" name={name} checked={cur === val} disabled={disabled} onChange={() => set(val)} style={{ accentColor: AMBER, width: 15, height: 15 }} />
      {children}
    </label>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000000, background: 'rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column', fontFamily: '"Sarabun",sans-serif' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', background: DARK_BG, borderBottom: AMBER_BORDER, flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: AMBER, flex: 1 }}>สร้างรายงานสรุปการใช้ไฟฟ้า</div>
        <button onClick={exportPdf} disabled={!rows.length || !!busy}
                style={{ ...btn, opacity: (!rows.length || busy) ? 0.45 : 1, borderColor: AMBER, color: AMBER }}>
          {busy === 'pdf' ? 'กำลังสร้าง…' : 'Export PDF'}
        </button>
        <button onClick={sharePdf} disabled={!rows.length || !!busy}
                style={{ ...btn, opacity: (!rows.length || busy) ? 0.45 : 1 }}>
          {busy === 'share' ? 'กำลังสร้าง…' : 'แชร์ให้ลูกค้า'}
        </button>
        <button onClick={onClose} style={{ ...btn, borderColor: '#666', color: '#999' }}>ปิด</button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* ── Config panel ── */}
        <div style={{ width: 320, flexShrink: 0, background: DARK_BG, borderRight: AMBER_BORDER, overflowY: 'auto', padding: 18 }}>

          <div style={group}>
            <span style={label}>ชื่อลูกค้าบนหัวรายงาน</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="text" value={clientName} placeholder={siteName || 'พิมพ์ชื่อลูกค้า'}
                     onChange={e => setClientName(e.target.value)} style={{ ...field, flex: 1 }} />
              <button onClick={() => setClientName('')} disabled={!clientName}
                      style={{ ...btn, padding: '7px 10px', fontSize: 11, opacity: clientName ? 1 : 0.45 }}>ค่าเดิม</button>
            </div>
            <div style={{ fontSize: 10, color: '#777', marginTop: 4 }}>
              เว้นว่าง = ใช้ชื่อจากทะเบียนห้อง{siteName ? ` (${siteName})` : ''}
            </div>
          </div>

          <div style={group}>
            <span style={label}>วันที่จัดทำรายงาน</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="date" value={reportDate}
                     onChange={e => setReportDate(e.target.value || todayStr())} style={{ ...field, flex: 1 }} />
              <button onClick={() => setReportDate(todayStr())} disabled={reportDate === todayStr()}
                      style={{ ...btn, padding: '7px 10px', fontSize: 11, opacity: reportDate === todayStr() ? 0.45 : 1 }}>วันนี้</button>
            </div>
            <div style={{ fontSize: 10, color: '#777', marginTop: 4 }}>
              โชว์บนหัวรายงาน — ย้อนวันได้ถ้าออกรายงานให้ลูกค้าย้อนหลัง
            </div>
          </div>

          <div style={group}>
            <span style={label}>เลือกวันที่ใส่ในตาราง</span>

            {/* ปฏิทิน — วันไหนมีข้อมูลจะโชว์หน่วยที่ใช้ กดเลือก/เอาออกได้เลย */}
            <MiniCalendar apiBase={apiBase} powerUnit={powerUnit} selected={dates}
                          onToggle={ds => (dates.includes(ds) ? removeDate(ds) : addDate(ds))} />

            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <input type="date" value={pickDate} min={DATA_MIN_DATE || undefined}
                     onChange={e => setPickDate(e.target.value)} style={{ ...field, flex: 1 }} />
              <button onClick={() => addDate(pickDate)} style={{ ...btn, padding: '7px 12px' }}>+ เพิ่ม</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {dates.map(ds => {
                const bad = cache[ds] === 'error'
                const busyDs = pending.includes(ds)
                const cov = rawCache[ds]?.cov
                return (
                  <span key={ds} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: DARK_CARD, border: `1px solid ${bad ? '#a33' : 'rgba(255,184,0,0.4)'}`, borderRadius: 20, padding: '4px 6px 4px 8px', fontSize: 11, color: bad ? '#e88' : AMBER_DIM, opacity: busyDs ? 0.5 : 1 }}>
                    {/* จุดสีบอกความครบของข้อมูลวันนั้น — เทา = ยังโหลดไม่เสร็จ */}
                    <span title={cov ? `ข้อมูลครบ ${Math.round(cov.pct * 100)}%` : 'กำลังตรวจข้อมูล…'}
                          style={{ width: 7, height: 7, borderRadius: '50%', background: cov ? covColor(cov.pct) : '#555', flexShrink: 0 }} />
                    {thShort(ds)}{bad ? ' (ไม่มีข้อมูล)' : ''}
                    {!bad && (
                      <button onClick={() => { setCheckDate(ds); ensureRaw(ds) }} title="ดูกราฟ / เช็คความครบของข้อมูล"
                              style={{ background: 'none', border: 'none', color: AMBER, cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: '0 1px' }}>📈</button>
                    )}
                    <button onClick={() => removeDate(ds)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }}>×</button>
                  </span>
                )
              })}
              {!dates.length && <span style={{ fontSize: 11, color: '#666' }}>ยังไม่ได้เลือกวัน</span>}
            </div>
          </div>

          <div style={group}>
            <span style={label}>อัตราค่าไฟ (บาท/Unit)</span>
            <input type="number" step="0.01" min="0" defaultValue={rate}
                   onBlur={e => { const v = Number(e.target.value); if (v > 0 && v !== rate) applyRate(v) }}
                   style={field} />
          </div>

          <div style={group}>
            <span style={label}>แถวสรุปในตาราง</span>
            <Check on={showMax} set={setShowMax}>แสดงแถว “สูงสุด”</Check>
            <Check on={showMin} set={setShowMin}>แสดงแถว “ต่ำสุด”</Check>
            <Check on={showAvg} set={setShowAvg}>แสดงแถว “ค่าเฉลี่ย”</Check>
          </div>

          <div style={group}>
            <span style={label}>การ์ดแนะนำโซล่าเซลล์</span>
            <Check on={solarShow.max} set={v => setSolarShow(s => ({ ...s, max: v }))}>วันที่ใช้ไฟสูงสุด</Check>
            <Check on={solarShow.min} set={v => setSolarShow(s => ({ ...s, min: v }))}>วันที่ใช้ไฟน้อยสุด</Check>
            <Check on={solarShow.avg} set={v => setSolarShow(s => ({ ...s, avg: v }))}>ค่าเฉลี่ย</Check>
            <Check on={solarShow.manual} set={v => setSolarShow(s => ({ ...s, manual: v }))}>กรอกเอง</Check>
            {solarShow.manual && (
              <div style={{ margin: '4px 0 0 23px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input type="text" value={solarManual.label} placeholder="ชื่อการ์ด"
                       onChange={e => setSolarManual(s => ({ ...s, label: e.target.value }))}
                       style={{ ...field, padding: '5px 8px', fontSize: 12 }} />
                <input type="number" step="0.01" min="0" value={solarManual.kw} placeholder="ขนาดที่จะติดตั้ง (kW)"
                       onChange={e => setSolarManual(s => ({ ...s, kw: e.target.value }))}
                       style={{ ...field, padding: '5px 8px', fontSize: 12 }} />
                <textarea value={solarManual.note} rows={2}
                          placeholder="หมายเหตุบนการ์ด (เคสพิเศษ) — เว้นว่างได้"
                          onChange={e => setSolarManual(s => ({ ...s, note: e.target.value }))}
                          style={{ ...field, padding: '5px 8px', fontSize: 12, resize: 'vertical', lineHeight: 1.5 }} />
                <div style={{ fontSize: 10, color: '#777', lineHeight: 1.5 }}>
                  ผลิตได้ = ขนาด × ชั่วโมงแดด {n2(Number(paySun) || 0)} ชม. → ประหยัด = ผลิตได้ × {n2(rate)} บาท/Unit
                  {Number(solarManual.kw) > 0 && ` = ${nL((Number(solarManual.kw) || 0) * (Number(paySun) || 0) * rate)} ฿/วัน`}
                  <br />(ชั่วโมงแดดใช้ค่าเดียวกับตารางจุดคุ้มทุนด้านล่าง)
                </div>
              </div>
            )}
            <div style={{ ...label, marginTop: 12, fontSize: 11, color: '#999' }}>เลือกอันที่จะติดป้าย “แนะนำ”</div>
            <Radio name="srec" val="max" cur={solarRec} set={setSolarRec} disabled={!solarShow.max}>วันที่ใช้ไฟสูงสุด</Radio>
            <Radio name="srec" val="min" cur={solarRec} set={setSolarRec} disabled={!solarShow.min}>วันที่ใช้ไฟน้อยสุด</Radio>
            <Radio name="srec" val="avg" cur={solarRec} set={setSolarRec} disabled={!solarShow.avg}>ค่าเฉลี่ย</Radio>
            <Radio name="srec" val="manual" cur={solarRec} set={setSolarRec} disabled={!solarShow.manual}>ที่กรอกเอง</Radio>
            <Radio name="srec" val=""    cur={solarRec} set={setSolarRec}>ไม่แนะนำอันไหน</Radio>
          </div>

          <div style={group}>
            <span style={label}>การ์ดแนะนำแบตเตอรี่</span>
            <Check on={battShow.evening} set={v => setBattShow(s => ({ ...s, evening: v }))}>สำรองช่วงหัวค่ำ (18:00–00:00)</Check>
            <Check on={battShow.night}   set={v => setBattShow(s => ({ ...s, night: v }))}>สำรองทั้งคืน (18:00–06:00)</Check>
            <Check on={battShow.custom}  set={v => setBattShow(s => ({ ...s, custom: v }))}>กำหนดช่วงเวลาเอง</Check>
            <Check on={battShow.manual}  set={v => setBattShow(s => ({ ...s, manual: v }))}>กรอกเอง</Check>
            {battShow.manual && (
              <div style={{ margin: '4px 0 6px 23px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input type="text" value={battManual.label} placeholder="ชื่อการ์ด"
                       onChange={e => setBattManual(s => ({ ...s, label: e.target.value }))}
                       style={{ ...field, padding: '5px 8px', fontSize: 12 }} />
                <input type="number" step="0.01" min="0" value={battManual.kwh} placeholder="ความจุที่จะติดตั้ง (kWh)"
                       onChange={e => setBattManual(s => ({ ...s, kwh: e.target.value }))}
                       style={{ ...field, padding: '5px 8px', fontSize: 12 }} />
                <textarea value={battManual.note} rows={2}
                          placeholder="หมายเหตุบนการ์ด (เคสพิเศษ) — เว้นว่างได้"
                          onChange={e => setBattManual(s => ({ ...s, note: e.target.value }))}
                          style={{ ...field, padding: '5px 8px', fontSize: 12, resize: 'vertical', lineHeight: 1.5 }} />
              </div>
            )}
            {battShow.custom && (
              <div style={{ margin: '4px 0 0 23px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="time" value={battCustom.start}
                         onChange={e => setBattCustom(c => ({ ...c, start: e.target.value }))}
                         style={{ ...field, padding: '5px 6px', flex: 1 }} />
                  <span style={{ color: AMBER_DIM, fontSize: 12 }}>ถึง</span>
                  <input type="time" value={battCustom.end}
                         onChange={e => setBattCustom(c => ({ ...c, end: e.target.value }))}
                         style={{ ...field, padding: '5px 6px', flex: 1 }} />
                </div>
                <div style={{ fontSize: 10, color: '#777', marginTop: 4 }}>
                  พิมพ์เวลาเองได้ ละเอียดระดับนาที · ข้ามเที่ยงคืนได้ (เช่น 19:30 ถึง 04:15)
                </div>
                {battCustom.start === battCustom.end && (
                  <div style={{ fontSize: 11, color: '#e88', marginTop: 6 }}>เวลาเริ่มกับสิ้นสุดต้องไม่ซ้ำกัน</div>
                )}
              </div>
            )}
            {stats && stats.customDays < rows.length && (
              <div style={{ fontSize: 11, color: AMBER_DIM, marginTop: 8 }}>
                กำลังโหลดข้อมูลรายนาที {stats.customDays}/{rows.length} วัน…
              </div>
            )}
            <div style={{ fontSize: 10, color: '#777', marginTop: 8, lineHeight: 1.5 }}>
              การ์ดแบตนับเฉพาะไฟที่ใช้จริง ไม่รวมช่วงที่ไฟไหลย้อน (ค่าติดลบ)
            </div>
            <div style={{ ...label, marginTop: 12, fontSize: 11, color: '#999' }}>เลือกอันที่จะติดป้าย “แนะนำ”</div>
            <Radio name="brec" val="evening" cur={battRec} set={setBattRec} disabled={!battShow.evening}>สำรองช่วงหัวค่ำ</Radio>
            <Radio name="brec" val="night"   cur={battRec} set={setBattRec} disabled={!battShow.night}>สำรองทั้งคืน</Radio>
            <Radio name="brec" val="custom"  cur={battRec} set={setBattRec} disabled={!battShow.custom}>ช่วงเวลาที่กำหนดเอง</Radio>
            <Radio name="brec" val="manual"  cur={battRec} set={setBattRec} disabled={!battShow.manual}>ที่กรอกเอง</Radio>
            <Radio name="brec" val=""        cur={battRec} set={setBattRec}>ไม่แนะนำอันไหน</Radio>
          </div>

          <div style={group}>
            <span style={label}>ตารางจุดคุ้มทุน</span>

            <Check on={showPaySolar} set={setShowPaySolar}>ตารางคืนทุน — โซล่าเซลล์</Check>
            {showPaySolar && (
              <div style={{ margin: '6px 0 14px 23px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <div style={sub}>ขนาดกำลังการติดตั้ง (kW)</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="number" step="0.01" min="0" value={payKw}
                           placeholder={payKwAuto ? `แนะนำ ${n2(payKwAuto)}` : 'แนะนำอัตโนมัติ'}
                           onChange={e => setPayKw(e.target.value)} style={{ ...field, flex: 1 }} />
                    <button onClick={() => setPayKw('')} disabled={paybackSolar.auto}
                            style={{ ...btn, padding: '7px 8px', fontSize: 10, opacity: paybackSolar.auto ? 0.45 : 1 }}>ค่าแนะนำ</button>
                  </div>
                </div>
                <div>
                  <div style={sub}>ชั่วโมงแดดต่อวัน (ชม.)</div>
                  <input type="number" step="0.1" min="0" value={paySun}
                         onChange={e => setPaySun(e.target.value)} style={field} />
                </div>
                <div>
                  <div style={sub}>เงินลงทุนค่าโซล่าเซลล์ (บาท)</div>
                  <input type="number" step="1000" min="0" value={payInvest}
                         onChange={e => setPayInvest(e.target.value)} style={field} />
                </div>
              </div>
            )}

            <Check on={showPayBatt} set={setShowPayBatt}>ตารางคืนทุน — แบตเตอรี่</Check>
            {showPayBatt && (
              <div style={{ margin: '6px 0 10px 23px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <div style={sub}>ความจุแบตเตอรี่ที่จะติดตั้ง (kWh)</div>
                  <input type="number" step="0.01" min="0" value={payBattKwh}
                         onChange={e => setPayBattKwh(e.target.value)} style={field} />
                  {stats && (
                    <div style={{ fontSize: 10, color: '#777', marginTop: 4 }}>
                      อ้างอิง: การ์ดแนะนำแบตด้านบนคำนวณได้ {n2(stats.avg.battEvening / BATTERY_DOD)} kWh (หัวค่ำ)
                      / {n2(stats.avg.battNight / BATTERY_DOD)} kWh (ทั้งคืน)
                    </div>
                  )}
                </div>
                <div>
                  <div style={sub}>ใช้งานได้จริงต่อรอบ — DoD (%)</div>
                  <input type="number" step="1" min="1" max="100" value={payBattDod}
                         onChange={e => setPayBattDod(e.target.value)} style={field} />
                </div>
                <div>
                  <div style={sub}>เงินลงทุนค่าแบตเตอรี่ (บาท)</div>
                  <input type="number" step="1000" min="0" value={payBattInvest}
                         onChange={e => setPayBattInvest(e.target.value)} style={field} />
                </div>
              </div>
            )}

            <div style={{ fontSize: 10, color: '#777', lineHeight: 1.5 }}>
              ฝั่งโซล่าเซลล์เว้นช่องขนาดไว้ = ใช้ค่าที่คำนวณจากการใช้ไฟจริง · ฝั่งแบตเตอรี่กรอกความจุเอง ·
              ใช้อัตราค่าไฟ {n2(rate)} บาท/Unit จากช่องด้านบน · คิดเดือนละ 30 วัน ปีละ 12 เดือน
            </div>
          </div>

          <div style={group}>
            <span style={label}>หมายเหตุท้ายรายงาน</span>
            <textarea value={reportNote} onChange={e => setReportNote(e.target.value)} rows={4}
                      placeholder="พิมพ์หมายเหตุที่จะให้ขึ้นท้ายรายงาน เช่น เงื่อนไขราคา ระยะเวลารับประกัน…"
                      style={{ ...field, resize: 'vertical', lineHeight: 1.6 }} />
            <div style={{ fontSize: 10, color: '#777', marginTop: 4 }}>
              เว้นว่าง = ไม่ขึ้นหัวข้อนี้ในรายงาน · ขึ้นบรรทัดใหม่ได้
            </div>
          </div>

          <div style={group}>
            <span style={label}>รูปแบบการติดตั้ง (เลือกได้หลายรูป)</span>
            <input type="file" accept="image/*" multiple onChange={onPickImages}
                   style={{ ...field, padding: 7, fontSize: 11, cursor: 'pointer' }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {images.map(img => (
                <div key={img.id} style={{ position: 'relative', width: 70, height: 52, borderRadius: 6, overflow: 'hidden', border: AMBER_BORDER }}>
                  <img src={img.url} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={() => setImages(p => p.filter(x => x.id !== img.id))}
                          style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.75)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '2px 5px' }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <span style={label}>ความเข้มแสง (%)</span>
              <input type="number" min="0" max="100" value={sunIntensity}
                     onChange={e => setSunPct(e.target.value)} style={field} />
            </div>
          </div>
        </div>

        {/* ── Preview ── */}
        <div style={{ flex: 1, overflow: 'auto', background: '#4a4a4a', padding: 24, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
          <div ref={scaleRef} style={{ transformOrigin: 'top center' }}>
            {loading && <div style={{ color: AMBER, fontSize: 13, marginBottom: 10, textAlign: 'center' }}>กำลังโหลดข้อมูล…</div>}
            <ReportDoc
              innerRef={reportRef}
              siteName={clientName.trim() || siteName} rows={rows} stats={stats} rate={rate} reportDate={reportDate}
              solarManual={solarManual} battManual={battManual} reportNote={reportNote}
              sunHours={Number(paySun) || 0} battDod={Number(payBattDod) || 0}
              showMax={showMax} showMin={showMin} showAvg={showAvg}
              solarShow={solarShow} solarRec={solarRec}
              battShow={battShow} battRec={battRec} battCustom={battCustom}
              showPaySolar={showPaySolar} paybackSolar={paybackSolar}
              showPayBatt={showPayBatt}  paybackBatt={paybackBatt}
              images={images} sunIntensity={sunIntensity}
            />
          </div>
        </div>
      </div>

      {checkDate && (
        <DayCheckModal date={checkDate} raw={rawCache[checkDate]} solar={cache[checkDate]}
                       onClose={() => setCheckDate(null)} />
      )}
    </div>
  )
}

// ── เอกสารรายงาน (โทนสว่าง กว้างคงที่ 900px เพื่อให้ PDF ออกมาคมและคาดเดาได้) ──
function ReportDoc({ innerRef, siteName, rows, stats, rate, reportDate, showMax, showMin, showAvg,
                     solarShow, solarRec, battShow, battRec, battCustom,
                     solarManual, battManual, reportNote, sunHours, battDod,
                     showPaySolar, paybackSolar, showPayBatt, paybackBatt,
                     images, sunIntensity }) {
  const sectionTitle = {
    fontSize: 17, fontWeight: 600, color: R.text, marginBottom: 18,
    display: 'flex', alignItems: 'center', gap: 8,
  }
  const bar = { display: 'inline-block', width: 4, height: 18, background: R.greenBar, borderRadius: 2, flexShrink: 0 }
  const th  = { padding: '10px 12px', border: `1px solid ${R.line}`, background: '#fff', color: R.muted, fontWeight: 500 }
  const td  = { padding: '10px 12px', border: `1px solid ${R.line}` }
  const divider = { border: 'none', borderTop: `1px solid ${R.border}`, margin: '26px 0 30px' }
  const notice = { background: '#e8f5e9', color: R.teal, padding: '12px 16px', borderRadius: 6, fontSize: 13, marginTop: 24, borderLeft: `4px solid ${R.teal}` }

  const noticeText = <><strong>หมายเหตุ:</strong> คำนวณจากการใช้ไฟจริง {rows.length} วัน · อัตรา {n2(rate)} บาท/Unit</>

  // ค่าไฟของแต่ละวัน แล้วขยายเป็นรายเดือน/รายปีจากวันนั้น (ไม่ใช่ยอดสะสมจริง)
  const bill = kwh => {
    const day   = (kwh || 0) * rate
    const month = day * BILL_DAYS_PER_MONTH
    return { day, month, year: month * BILL_MONTHS_PER_YEAR }
  }
  // คอลัมน์รายเดือนคือตัวเลขที่ลูกค้าดูจริง → เน้นด้วยพื้นเขียวอ่อน + ตัวหนา
  // แถวสูงสุด/ต่ำสุด/ค่าเฉลี่ยมีสีพื้นของตัวเองอยู่แล้ว ทับไปจะอ่านไม่ออก เหลือแค่ตัวหนา
  const billHiHead = { background: '#e8f5e9', color: R.darkGreen, fontWeight: 700 }
  const billHiCell = tinted => tinted ? { fontWeight: 700 } : { background: '#e8f5e9', color: R.darkGreen, fontWeight: 700 }

  const maxDate = stats?.maxRow?.date
  const minDate = stats?.minRow?.date

  // ขนาดระบบเป็น 0 (ยังไม่เลือกวัน และไม่ได้พิมพ์เอง) → ตารางคืนทุนจะเป็นศูนย์ทั้งใบ ซ่อนไว้ดีกว่า
  const paySolarOn = showPaySolar && paybackSolar.kw  > 0
  const payBattOn  = showPayBatt  && paybackBatt.kwh > 0

  const solarCards = []
  if (stats) {
    if (solarShow.max) solarCards.push({ key: 'max', title: `วันที่ใช้ไฟฟ้าสูงสุด (${thShort(stats.maxRow.date)})`, dayLabel: 'ใช้ไฟกลางวัน', ...stats.maxRow })
    if (solarShow.min) solarCards.push({ key: 'min', title: `วันที่ใช้ไฟฟ้าน้อยสุด (${thShort(stats.minRow.date)})`, dayLabel: 'ใช้ไฟกลางวัน', ...stats.minRow })
    if (solarShow.avg) solarCards.push({ key: 'avg', title: 'ค่าเฉลี่ย', dayLabel: 'ใช้ไฟกลางวันเฉลี่ย', ...stats.avg })
  }
  // การ์ดกรอกเองไม่ต้องรอ stats — ตัวเลขมาจากช่องกรอกล้วนๆ
  if (solarShow.manual && Number(solarManual?.kw) > 0) {
    // การ์ดใบนี้เริ่มจาก "ขนาดที่จะติดตั้ง" → ผลิตได้ = ขนาด × ชั่วโมงแดด → ประหยัด = ผลิตได้ × ค่าไฟ
    // (ใบอื่นเดินย้อนทาง: ใช้ไฟกลางวันจริง → ขนาดที่เหมาะสม) สูตรจึงต่างกัน แต่ได้ตัวเลขชุดเดียวกัน
    const kw   = Number(solarManual.kw) || 0
    const prod = kw * sunHours
    solarCards.push({
      key: 'manual', title: solarManual.label || 'กรอกเอง', dayLabel: 'ผลิตไฟได้',
      day: prod, solarKw: kw,
      savingsDay: prod * rate, savingsYear: prod * rate * 365,
      note: solarManual.note?.trim() || null,
    })
  }

  const battCards = []
  if (stats) {
    if (battShow.evening) battCards.push({
      key: 'evening', label: 'สำรองช่วงหัวค่ำ (18:00 – 00:00)', sub: 'ใช้ไฟกลางคืนเฉลี่ย',
      energy: stats.avg.battEvening, kwh: stats.avg.battEvening / BATTERY_DOD,
      note: <><strong>ระบบ Hybrid</strong> รองรับการเพิ่มความจุแบตเตอรี่ในภายหลังได้ โดยไม่ต้องเปลี่ยน Inverter</>,
    })
    if (battShow.night) battCards.push({
      key: 'night', label: 'สำรองทั้งคืน (18:00 – 06:00)', sub: 'ใช้ไฟกลางคืนเฉลี่ย',
      energy: stats.avg.battNight, kwh: stats.avg.battNight / BATTERY_DOD, note: null,
    })
    if (battShow.custom && battCustom.start !== battCustom.end) battCards.push({
      key: 'custom', label: `ช่วงเวลาที่กำหนดเอง (${battCustom.start} – ${battCustom.end})`,
      sub: 'ใช้ไฟช่วงเวลานี้เฉลี่ย',
      energy: stats.avg.battCustom, kwh: stats.avg.battCustom / BATTERY_DOD, note: null,
    })
  }
  // การ์ดกรอกเองไม่ต้องรอ stats — ตัวเลขมาจากช่องกรอกล้วนๆ
  // แบตก็เดินทางเดียวกัน: ความจุที่จะติดตั้ง → ใช้ได้จริง = ความจุ × DoD → ประหยัด = ใช้ได้จริง × ค่าไฟ
  if (battShow.manual && Number(battManual?.kwh) > 0) {
    const kwh = Number(battManual.kwh) || 0
    battCards.push({
      key: 'manual', label: battManual.label || 'กรอกเอง', sub: `ใช้ได้จริงต่อรอบ (DoD ${n2(battDod)}%)`,
      energy: kwh * (battDod / 100), kwh,
      note: battManual.note?.trim() || null,
    })
  }

  return (
    <div ref={innerRef} style={{ width: 900, background: '#fff', padding: 40, color: R.text, fontFamily: '"Sarabun",sans-serif', fontSize: 14, lineHeight: 1.5, boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 14, color: R.muted }}>ลูกค้า</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1a1a1a', margin: '4px 0' }}>{siteName || '—'}</h1>
        <div style={{ fontSize: 14, color: R.muted }}>วันที่จัดทำรายงาน: {thFull(reportDate || todayStr())}</div>
      </div>

      <hr style={divider} />

      {/* Section 1 — ตาราง */}
      <div style={sectionTitle}><span style={bar} />ตารางสรุปการใช้ไฟฟ้า</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 14, marginBottom: 16 }}>
        {showMax && <Legend color={R.lightRed}>สูงสุด</Legend>}
        {showMin && <Legend color={R.tealHi}>ต่ำสุด</Legend>}
        {showAvg && <Legend outline>ค่าเฉลี่ย</Legend>}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, textAlign: 'center' }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...th, verticalAlign: 'bottom', width: '15%' }}>วันที่</th>
            <th colSpan={3} style={{ ...th, borderBottom: `1px solid ${R.line}` }}>การใช้ไฟฟ้าจริง</th>
            <th colSpan={3} style={{ ...th, borderBottom: `1px solid ${R.line}` }}>ค่าไฟฟ้าโดยประมาณ<span style={{ fontSize: 12, color: '#888', fontWeight: 400 }}> (THB)</span></th>
          </tr>
          <tr>
            <th style={th}>24 ชม.</th>
            <th style={th}>กลางวัน<br /><span style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>06:00–18:00</span></th>
            <th style={th}>กลางคืน<br /><span style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>18:00–06:00</span></th>
            <th style={th}>รายวัน<br /><span style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>วันนั้น</span></th>
            <th style={{ ...th, ...billHiHead }}>รายเดือน<br /><span style={{ fontSize: 12, color: R.darkGreen, fontWeight: 400 }}>× {BILL_DAYS_PER_MONTH} วัน</span></th>
            <th style={th}>รายปี<br /><span style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>× {BILL_MONTHS_PER_YEAR} เดือน</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const isMax = showMax && r.date === maxDate
            const isMin = showMin && r.date === minDate && r.date !== maxDate
            const rowStyle = isMax ? { background: R.lightRed, color: R.red, fontWeight: 600 }
                           : isMin ? { background: R.tealHi, color: R.teal, fontWeight: 600 }
                           : {}
            const b = bill(r.total)
            return (
              <tr key={r.date} style={rowStyle}>
                <td style={td}>{thShort(r.date)}</td>
                <td style={td}>{n2(r.total)}</td>
                <td style={td}>{n2(r.day)}</td>
                <td style={td}>{n2(r.night)}</td>
                <td style={td}>{nL(b.day)}</td>
                <td style={{ ...td, ...billHiCell(isMax || isMin) }}>{nL(b.month)}</td>
                <td style={td}>{nL(b.year)}</td>
              </tr>
            )
          })}
          {showAvg && stats && (() => {
            // html2canvas ไม่ render outline บน <tr> → ต้องตีกรอบที่ td แต่ละช่องแทน
            const avgBill = bill(stats.avg.total)
            const cells = [
              'ค่าเฉลี่ย', n2(stats.avg.total), n2(stats.avg.day), n2(stats.avg.night),
              nL(avgBill.day), nL(avgBill.month), nL(avgBill.year),
            ]
            return (
              <tr style={{ color: R.red, fontWeight: 600 }}>
                {cells.map((v, i) => (
                  <td key={i} style={{
                    ...td,
                    ...(i === 5 ? billHiCell(true) : null),
                    borderTop: `2px solid ${R.red}`, borderBottom: `2px solid ${R.red}`,
                    borderLeft: i === 0 ? `2px solid ${R.red}` : td.border,
                    borderRight: i === cells.length - 1 ? `2px solid ${R.red}` : td.border,
                  }}>{v}</td>
                ))}
              </tr>
            )
          })()}
          {!rows.length && <tr><td colSpan={7} style={{ ...td, padding: 24, color: R.muted }}>ยังไม่ได้เลือกวันที่</td></tr>}
        </tbody>
      </table>

      <div style={notice}>{noticeText}</div>

      {/* Section 2 — โซล่าเซลล์ */}
      {solarCards.length > 0 && <>
        <hr style={divider} data-break />
        <div style={sectionTitle}><span style={bar} />แนะนำการติดตั้งโซลาร์เซลล์ (กลางวัน 06:00–18:00)</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(solarCards.length, 3)}, 1fr)`, gap: 16 }}>
          {solarCards.map(c => (
            <Card key={c.key} recommended={solarRec === c.key} title={c.title}
                  subs={[`${c.dayLabel} ${n2(c.day)} Unit`, 'กำลังการติดตั้งแผงโซลาร์ที่เหมาะสม']}
                  value={`${n2(c.solarKw)} kW`}
                  note={c.note}
                  perDay={c.savingsDay} perYear={c.savingsYear} />
          ))}
        </div>
        <div style={notice}>{noticeText}</div>
      </>}

      {/* Section 3 — แบตเตอรี่ */}
      {battCards.length > 0 && <>
        <hr style={divider} data-break />
        <div style={sectionTitle}><span style={bar} />แนะนำการติดตั้งแบตเตอรี่</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(battCards.length, 3)}, 1fr)`, gap: 16 }}>
          {battCards.map((c, i) => (
            <Card key={c.key} recommended={battRec === c.key} title={`ตัวเลือกที่ ${i + 1}: ${c.label}`}
                  subs={[`${c.sub} ${n2(c.energy)} Unit`, 'ความจุแบตเตอรี่ที่แนะนำ']}
                  value={`${n2(c.kwh)} kWh`} note={c.note}
                  perDay={c.energy * rate} perYear={c.energy * rate * 365} />
          ))}
        </div>
        <div style={notice}>{noticeText}</div>
      </>}

      {/* Section 4 — จุดคุ้มทุน (โซล่าเซลล์ / แบตเตอรี่ แยกตาราง เงินลงทุนคนละก้อน) */}
      {(paySolarOn || payBattOn) && <>
        <hr style={divider} data-break />
        <div style={sectionTitle}><span style={bar} />การประหยัดไฟฟ้าและจุดคุ้มทุน</div>

        {paySolarOn && (
          <PaybackTable
            title="คำนวณการประหยัดไฟฟ้าและการคืนทุน — ระบบโซล่าเซลล์"
            invest={paybackSolar.invest} years={paybackSolar.years}
            rows={[
              { label: 'ขนาดกำลังการติดตั้งระบบโซล่าเซลล์', value: n2(paybackSolar.kw),      unit: 'กิโลวัตต์',  color: R.red, bold: true },
              { label: 'คำนวณชั่วโมงแดดต่อวัน',              value: n2(paybackSolar.sun),     unit: 'ชั่วโมง/วัน' },
              { label: 'กำลังการผลิตของโซล่าเซลล์ต่อวัน',     value: n2(paybackSolar.prodDay), unit: 'หน่วย/วัน' },
              { label: 'อัตราค่าไฟฟ้าเฉลี่ยต่อหน่วย',         value: n2(rate),                 unit: 'บาท/หน่วย' },
              { label: 'อัตราการประหยัดต่อวัน',              value: nL(paybackSolar.saveDay),   unit: 'บาท/วัน' },
              { label: 'อัตราการประหยัดต่อเดือน',            value: nL(paybackSolar.saveMonth), unit: 'บาท/เดือน' },
              { label: 'อัตราการประหยัดต่อปี',               value: nL(paybackSolar.saveYear),  unit: 'บาท/ปี' },
            ]} />
        )}

        {payBattOn && (
          <div style={{ marginTop: paySolarOn ? 22 : 0 }} data-break>
            <PaybackTable
              title="คำนวณการประหยัดไฟฟ้าและการคืนทุน — ระบบแบตเตอรี่"
              invest={paybackBatt.invest} years={paybackBatt.years}
              note="คิดจากการเก็บไฟส่วนเกินที่โซล่าเซลล์ผลิตได้ตอนกลางวัน มาใช้แทนไฟจากการไฟฟ้าในช่วงกลางคืน"
              rows={[
                { label: 'ขนาดความจุแบตเตอรี่ที่ติดตั้ง',       value: n2(paybackBatt.kwh),  unit: 'kWh', color: R.red, bold: true },
                { label: 'ใช้งานได้จริงต่อรอบ (DoD)',           value: n2(paybackBatt.dod),  unit: '%' },
                { label: 'พลังงานที่ใช้จากแบตเตอรี่ต่อวัน',      value: n2(paybackBatt.usable), unit: 'หน่วย/วัน' },
                { label: 'อัตราค่าไฟฟ้าเฉลี่ยต่อหน่วย',         value: n2(rate),                  unit: 'บาท/หน่วย' },
                { label: 'อัตราการประหยัดต่อวัน',              value: nL(paybackBatt.saveDay),   unit: 'บาท/วัน' },
                { label: 'อัตราการประหยัดต่อเดือน',            value: nL(paybackBatt.saveMonth), unit: 'บาท/เดือน' },
                { label: 'อัตราการประหยัดต่อปี',               value: nL(paybackBatt.saveYear),  unit: 'บาท/ปี' },
              ]} />
          </div>
        )}
      </>}

      {/* Section 5 — การออกแบบติดตั้ง */}
      {images.length > 0 && <>
        <hr style={divider} data-break />
        <div style={sectionTitle}><span style={bar} />การออกแบบการติดตั้งแผงโซลาร์เซลล์</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, alignItems: 'start' }}>
          <div style={{ display: 'grid', gridTemplateColumns: images.length > 1 ? '1fr 1fr' : '1fr', gap: 10 }}>
            {images.map(img => (
              <div key={img.id} style={{ width: '100%', height: images.length > 1 ? 150 : 250, borderRadius: 12, overflow: 'hidden', border: `1px solid ${R.border}` }}>
                <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
            ))}
          </div>
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: R.muted }}>ความเข้มแสง</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: R.teal }}>{sunIntensity}%</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>คำอธิบายแผงผัง</div>
              <LegendRow color="#ffeb3b">พื้นที่หลังคาอาคารสำนักงาน (ออกทิศ) ที่ติดตั้ง</LegendRow>
              <LegendRow color="#1a237e">แผงโซลาร์เซลล์</LegendRow>
            </div>
          </div>
        </div>
      </>}

      {/* Section 6 — หมายเหตุที่พิมพ์เอง */}
      {reportNote?.trim() && <>
        <hr style={divider} data-break />
        <div style={sectionTitle}><span style={bar} />หมายเหตุ</div>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.8, color: R.text }}>{reportNote.trim()}</div>
      </>}
    </div>
  )
}

function Legend({ color, outline, children }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 16, height: 16, borderRadius: 4, background: outline ? 'transparent' : color, border: outline ? `1.5px solid ${R.red}` : 'none' }} />
      {children}
    </span>
  )
}

function LegendRow({ color, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 18, height: 18, borderRadius: 3, background: color, flexShrink: 0 }} />
      <span>{children}</span>
    </div>
  )
}

// ── ตารางจุดคุ้มทุน ───────────────────────────────────────────────────────────
// เดิมลอกสี Excel มาตรงๆ (ส้ม/เขียวนีออน/เหลืองล้วน + เส้นดำ) ตัดกับส่วนอื่นของรายงาน
// ตอนนี้ใช้โทนเดียวกับทั้งเอกสาร: หัวเขียวเข้ม เส้นบาง แถวสลับสีอ่อน แถวสรุปเป็นพื้นพาสเทล
const PAY_HEAD    = R.darkGreen      // #116149
const PAY_LINE    = R.line
const PAY_ZEBRA   = '#fafbfc'
const PAY_INVEST  = '#eaf6ef'
const PAY_PAYBACK = '#fff5e6'
const PAY_AMBER   = '#a15c00'

function PaybackTable({ title, rows, invest, years, note }) {
  const cell  = { padding: '10px 16px', borderBottom: `1px solid ${PAY_LINE}` }
  const num   = { ...cell, textAlign: 'right', fontWeight: 700, width: '22%', fontVariantNumeric: 'tabular-nums' }
  const unitC = { ...cell, textAlign: 'left', width: '22%', fontSize: 13 }

  const Row = ({ label, value, unit, bg, color, bold, zebra }) => (
    <tr style={{ background: bg || (zebra ? PAY_ZEBRA : '#fff') }}>
      <td style={{ ...cell, fontWeight: bold ? 700 : 400 }}>{label}</td>
      <td style={{ ...num, color: color || R.text }}>{value}</td>
      <td style={{ ...unitC, color: color ? color : R.muted, opacity: color ? 0.85 : 1 }}>{unit}</td>
    </tr>
  )

  return (
    <>
      {/* borderRadius ต้องอยู่บน wrapper + overflow hidden — html2canvas ไม่ตัดมุมให้ที่ <table> */}
      <div style={{ border: `1px solid ${PAY_LINE}`, borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              <th colSpan={3} style={{ background: PAY_HEAD, color: '#fff', fontWeight: 600, padding: '12px 16px', textAlign: 'left', letterSpacing: 0.2 }}>
                {title}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => <Row key={i} {...r} zebra={i % 2 === 1} />)}
            <Row label="เงินลงทุน" value={nL(invest)} unit="บาท" bg={PAY_INVEST} color={R.darkGreen} bold />
            {/* วันที่ไม่มีข้อมูล → ประหยัดได้ ~0 แล้วคืนทุนจะเป็นเลขหลักล้านปี ตัดเป็น "> 100" แทน */}
            <Row label="ระยะเวลาคืนทุน"
                 value={years === null ? '--' : years > 100 ? '> 100' : n2(years)}
                 unit="ปี" bg={PAY_PAYBACK} color={PAY_AMBER} bold />
          </tbody>
        </table>
      </div>
      {note && <div style={{ fontSize: 12, color: R.muted, marginTop: 8 }}>* {note}</div>}
    </>
  )
}

// ── ปฏิทินย่อในแผงตั้งค่า — โชว์ว่าวันไหนมีข้อมูล กดเลือกใส่รายงานได้เลย ──────
function MiniCalendar({ apiBase, powerUnit, selected, onToggle }) {
  const now = new Date()
  const [year, setYear]       = useState(now.getFullYear())
  const [month, setMonth]     = useState(now.getMonth() + 1)
  const [days, setDays]       = useState({})       // 'YYYY-MM-DD' -> { energy, bill }
  const [loading, setLoading] = useState(false)
  const cache = useRef({})

  const mp = String(month).padStart(2, '0')

  useEffect(() => {
    if (!apiBase) return
    const key = `${year}-${mp}`
    if (cache.current[key]) { setDays(cache.current[key]); setLoading(false); return }
    let alive = true
    setLoading(true)
    fetch(`${apiBase}/calendar?year=${year}&month=${mp}`)
      .then(r => r.json())
      .then(list => {
        const map = {}
        scaleCalendarEvents(Array.isArray(list) ? list : [], powerUnit).forEach(e => {
          const ds = String(e.start || '').slice(0, 10)
          // backend ตอบมาทีละ 2 เดือน (เดือนนี้ + เดือนก่อน) → กรองเฉพาะเดือนที่กำลังดู
          if (!ds.startsWith(`${year}-${mp}`)) return
          if (!map[ds]) map[ds] = { energy: null, bill: null }
          const v = parseFloat(String(e.title ?? '').replace(/[฿,\s]/g, ''))
          if (e.extendedProps?.type === 'energy') map[ds].energy = Number.isFinite(v) ? v : null
          if (e.extendedProps?.type === 'bill')   map[ds].bill   = Number.isFinite(v) ? v : null
        })
        cache.current[key] = map
        if (alive) setDays(map)
      })
      .catch(() => { if (alive) setDays({}) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [apiBase, year, mp, powerUnit])

  const prev = () => (month === 1 ? (setMonth(12), setYear(y => y - 1)) : setMonth(m => m - 1))
  const next = () => (month === 12 ? (setMonth(1), setYear(y => y + 1)) : setMonth(m => m + 1))

  const firstDow    = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const nav = { background: DARK_CARD, border: AMBER_BORDER, borderRadius: 6, color: AMBER, fontWeight: 700, fontSize: 13, padding: '2px 10px', cursor: 'pointer', lineHeight: 1.6 }

  return (
    <div style={{ background: DARK_CARD, border: AMBER_BORDER, borderRadius: 8, padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <button onClick={prev} style={nav}>&lt;</button>
        <span style={{ fontSize: 12, fontWeight: 700, color: AMBER }}>
          {TH_MONTH_FULL[month - 1]} {year + 543}
        </span>
        <button onClick={next} style={nav}>&gt;</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((d, i) => (
          <div key={i} style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,184,0,0.6)', textAlign: 'center', padding: '2px 0' }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const ds       = `${year}-${mp}-${String(d).padStart(2, '0')}`
          const ev       = days[ds]
          const hasData  = !!ev && ev.energy !== null
          const locked   = DATA_MIN_DATE && ds < DATA_MIN_DATE
          const isSel    = selected.includes(ds)
          const clickable = hasData && !locked
          return (
            <div key={i} onClick={() => clickable && onToggle(ds)}
                 title={hasData ? `${n2(ev.energy)} Unit${ev.bill !== null ? ` · ${n2(ev.bill)} ฿` : ''}` : 'ไม่มีข้อมูล'}
                 style={{
                   minHeight: 32, borderRadius: 4, padding: '2px 3px', boxSizing: 'border-box',
                   background: isSel ? 'rgba(255,184,0,0.22)' : hasData ? 'rgba(255,184,0,0.06)' : 'transparent',
                   border: isSel ? `1px solid ${AMBER}` : hasData ? '1px solid rgba(255,184,0,0.25)' : '1px solid rgba(255,255,255,0.05)',
                   cursor: clickable ? 'pointer' : 'default',
                   opacity: locked ? 0.25 : 1,
                   display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                 }}>
              <span style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.1, color: isSel ? AMBER : hasData ? AMBER_DIM : '#555' }}>{d}</span>
              {hasData && <span style={{ fontSize: 7.5, lineHeight: 1.2, color: isSel ? AMBER_DIM : '#8a8a8a' }}>{n2(ev.energy)}</span>}
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 10, color: '#777', marginTop: 6, lineHeight: 1.5 }}>
        {loading ? 'กำลังโหลดปฏิทิน…'
                 : Object.keys(days).length ? 'วันที่มีตัวเลข = มีข้อมูล · กดเพื่อเลือก/เอาออก'
                 : 'เดือนนี้ยังไม่มีข้อมูล'}
      </div>
    </div>
  )
}

// ── กราฟตรวจความครบของข้อมูลรายวัน ────────────────────────────────────────────
function DayCheckModal({ date, raw, solar, onClose }) {
  const canvasRef = useRef(null)
  const instRef   = useRef(null)
  const cov   = raw?.cov
  const power = raw?.power

  useEffect(() => {
    if (!power || !canvasRef.current) return
    let alive = true
    ;(async () => {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)
      if (!alive || !canvasRef.current) return
      instRef.current?.destroy()
      const labels = Array.from({ length: 1440 }, (_, i) => `${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`)
      instRef.current = new Chart(canvasRef.current.getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'กำลังไฟ (kW)', data: power,
            borderColor: AMBER, backgroundColor: 'rgba(255,184,0,0.12)',
            borderWidth: 1, pointRadius: 0, fill: true, tension: 0.25,
            spanGaps: false,          // นาทีที่ไม่มีข้อมูล = เส้นขาด เห็นช่วงที่หายทันที
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false }, tooltip: { intersect: false, mode: 'index' } },
          scales: {
            x: { ticks: { color: '#888', font: { size: 9 }, maxTicksLimit: 13, autoSkip: true }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#888', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          },
        },
      })
    })()
    return () => { alive = false; instRef.current?.destroy(); instRef.current = null }
  }, [power])

  const Tile = ({ title, value, color }) => (
    <div style={{ flex: 1, background: DARK_CARD, border: AMBER_BORDER, borderRadius: 8, padding: '8px 10px', minWidth: 0 }}>
      <div style={{ fontSize: 10, color: '#8a8a8a', marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: color || AMBER, whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  )

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
         style={{ position: 'fixed', inset: 0, zIndex: 1000001, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: DARK_BG, border: AMBER_BORDER, borderRadius: 14, width: '100%', maxWidth: 760, maxHeight: '92vh', overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: AMBER }}>
            ตรวจความครบของข้อมูล · {thFull(date)}
          </div>
          <button onClick={onClose} style={{ background: DARK_CARD, border: '1.5px solid #666', borderRadius: 8, color: '#999', padding: '6px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>ปิด</button>
        </div>

        {!cov ? (
          <div style={{ color: AMBER_DIM, fontSize: 13, padding: '40px 0', textAlign: 'center' }}>กำลังโหลดข้อมูลดิบ…</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <Tile title="ข้อมูลครบ" value={`${(cov.pct * 100).toFixed(1)}%`} color={covColor(cov.pct)} />
              <Tile title="จำนวนจุดข้อมูล" value={cov.points.toLocaleString('en-US')} />
              <Tile title="ช่วงข้อมูล" value={cov.first ? `${cov.first}–${cov.last}` : '--'} />
              <Tile title="ขาดนานสุด"
                    value={cov.maxGapMin >= 1 ? `${Math.round(cov.maxGapMin)} นาที` : 'ไม่มี'}
                    color={cov.maxGapMin >= 30 ? '#e74c3c' : cov.maxGapMin >= 5 ? '#f1c40f' : '#2ecc71'} />
            </div>

            {cov.partialDay && (
              <div style={{ fontSize: 11, color: AMBER_DIM }}>ℹ วันนี้ยังไม่จบวัน — คิด % จากเวลาที่ผ่านไปแล้วเท่านั้น</div>
            )}
            {cov.truncated && (
              <div style={{ fontSize: 11, color: '#e88' }}>⚠ backend ส่งข้อมูลมาสูงสุด 10,000 จุด/วัน — ข้อมูลท้ายวันอาจถูกตัด</div>
            )}

            {/* แถบรายชั่วโมง — เห็นทันทีว่าชั่วโมงไหนข้อมูลหาย */}
            <div>
              <div style={{ fontSize: 11, color: '#8a8a8a', marginBottom: 4 }}>ความครบรายชั่วโมง (00–23)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24,1fr)', gap: 2 }}>
                {cov.hourPct.map((p, h) => (
                  <div key={h} title={p === null ? `${hhmm(h)} ยังไม่ถึงเวลา` : `${hhmm(h)} · ${(p * 100).toFixed(0)}%`}
                       style={{ height: 22, borderRadius: 3, background: p === null ? '#262626' : covColor(p), opacity: p === null ? 1 : 0.35 + p * 0.65 }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#666', marginTop: 2 }}>
                <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
              </div>
            </div>

            <div style={{ height: 220, background: DARK_CARD, border: AMBER_BORDER, borderRadius: 8, padding: 8 }}>
              <canvas ref={canvasRef} />
            </div>

            {solar && solar !== 'error' && (
              <div style={{ fontSize: 12, color: AMBER_DIM }}>
                รวมทั้งวัน {n2(solar.totalEnergyKwh)} Unit · กลางวัน {n2(solar.dayEnergy)} · กลางคืน {n2(solar.nightEnergy)}
              </div>
            )}

            {cov.gaps.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: '#8a8a8a', marginBottom: 4 }}>ช่วงที่ข้อมูลขาด (เกิน 5 นาที)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {cov.gaps.map((g, i) => (
                    <span key={i} style={{ fontSize: 11, color: '#e88', background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.35)', borderRadius: 6, padding: '3px 8px' }}>
                      {g.fromStr}–{g.toStr} ({Math.round(g.mins)} นาที)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Card({ recommended, title, subs, value, note, perDay, perYear }) {
  return (
    <div style={{ border: recommended ? `2px solid ${R.red}` : `1px solid ${R.border}`, borderRadius: 12, padding: '20px 16px 16px', background: '#fff', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      {recommended && (
        <div style={{ position: 'absolute', top: 0, right: 0, background: R.red, color: '#fff', fontSize: 11, fontWeight: 500, padding: '3px 12px', borderBottomLeftRadius: 8, borderTopRightRadius: 9 }}>แนะนำ</div>
      )}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 13, color: R.muted, marginBottom: 4 }}>{title}</div>
        {subs.map((s, i) => <div key={i} style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{s}</div>)}
        <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, lineHeight: 1.2, color: recommended ? R.red : R.text }}>{value}</div>
        {/* pre-wrap เพราะหมายเหตุที่พิมพ์เองขึ้นบรรทัดใหม่ได้ */}
        {note && <div style={{ fontSize: 12, color: R.red, lineHeight: 1.4, marginTop: 12, whiteSpace: 'pre-wrap' }}>{note}</div>}
      </div>
      <hr style={{ border: 'none', borderTop: '1px solid #f0f0f0', margin: '16px 0' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 11, color: R.muted, marginBottom: 2 }}>ประหยัด/วัน</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{nL(perDay)} ฿</span>
        </div>
        <div style={{ background: R.lightGreen, color: R.darkGreen, padding: '6px 10px', borderRadius: 8 }}>
          <div style={{ fontSize: 11, opacity: 0.95 }}>ประหยัด/ปี</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{nL(perYear)} ฿</div>
        </div>
      </div>
    </div>
  )
}
