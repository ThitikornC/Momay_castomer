import { useState, useEffect, useRef, useMemo } from 'react'

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
  text: '#202124', muted: '#5f6368', border: '#e0e0e0',
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

function todayStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function SolarReportBuilder({ open, onClose, apiBase, device, siteName, initialDate }) {
  const [dates, setDates]       = useState([])
  const [cache, setCache]       = useState({})      // date -> solar json | 'error'
  const [pending, setPending]   = useState([])      // วันที่กำลังโหลด
  const [pickDate, setPickDate] = useState(initialDate || todayStr())
  const [rate, setRate]         = useState(4.4)

  const [showMax, setShowMax] = useState(true)
  const [showMin, setShowMin] = useState(true)
  const [showAvg, setShowAvg] = useState(true)

  const [solarShow, setSolarShow]   = useState({ max: true, min: true, avg: true })
  const [solarRec,  setSolarRec]    = useState('avg')
  const [battShow,  setBattShow]    = useState({ evening: true, night: true, custom: false })
  const [battRec,   setBattRec]     = useState('evening')
  const [battCustom, setBattCustom] = useState({ start: '20:00', end: '04:00' })
  const [rawCache, setRawCache]     = useState({})   // date -> Float64Array(1440) พลังงานรายนาที

  const [images, setImages]         = useState([])
  const [sunIntensity, setSunPct]   = useState(96)
  const [busy, setBusy]             = useState('')

  const reportRef = useRef(null)
  const scaleRef  = useRef(null)

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
      setCache(c => ({ ...c, [ds]: (j && !j.error && j.hourly) ? j : 'error' }))
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
      setCache(c => ({ ...c, [ds]: (j && !j.error && j.hourly) ? j : 'error' }))
      } catch {
        setCache(c => ({ ...c, [ds]: 'error' }))
      } finally {
        setPending(p => p.filter(x => x !== ds))
      }
    }
  }

  // การ์ดแบตคิดจากข้อมูลรายนาที (ตัดค่าติดลบ + รองรับช่วงเวลาที่พิมพ์เอง) → ต้องใช้ข้อมูลดิบ
  // ดึงเฉพาะตอนมีการ์ดแบตโชว์ เพื่อไม่ให้ยิง API เกินจำเป็น
  useEffect(() => {
    const anyBatt = battShow.evening || battShow.night || battShow.custom
    if (!open || !anyBatt || !apiBase) return
    let alive = true
    const missing = dates.filter(ds => cache[ds] && cache[ds] !== 'error' && !rawCache[ds])
    if (!missing.length) return
    ;(async () => {
      for (const ds of missing) {
        try {
          const r = await fetch(`${apiBase}/daily-energy/${device}?date=${ds}`)
          const j = await r.json()
          if (!alive) return
          setRawCache(c => ({ ...c, [ds]: minuteEnergyFromRaw(j?.data || []) }))
        } catch { /* วันไหนดึงไม่ได้ก็ข้ามไป */ }
      }
    })()
    return () => { alive = false }
  }, [open, battShow.evening, battShow.night, battShow.custom, dates, cache, apiBase, device])

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
          battEvening: sumMinutes(rawCache[ds], 18 * 60, 0, true),
          battNight:   sumMinutes(rawCache[ds], 18 * 60, 6 * 60, true),
          battCustom:  sumMinutes(rawCache[ds], toMin(battCustom.start), toMin(battCustom.end), true),
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

  const fileName = `SolarReport-${(siteName || 'report').replace(/[\\/:*?"<>|\s]+/g, '_')}-${todayStr()}.pdf`

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
            <span style={label}>เลือกวันที่ใส่ในตาราง</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="date" value={pickDate} min={DATA_MIN_DATE || undefined}
                     onChange={e => setPickDate(e.target.value)} style={{ ...field, flex: 1 }} />
              <button onClick={() => addDate(pickDate)} style={{ ...btn, padding: '7px 12px' }}>+ เพิ่ม</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {dates.map(ds => {
                const bad = cache[ds] === 'error'
                const busyDs = pending.includes(ds)
                return (
                  <span key={ds} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: DARK_CARD, border: `1px solid ${bad ? '#a33' : 'rgba(255,184,0,0.4)'}`, borderRadius: 20, padding: '4px 6px 4px 10px', fontSize: 11, color: bad ? '#e88' : AMBER_DIM, opacity: busyDs ? 0.5 : 1 }}>
                    {thShort(ds)}{bad ? ' (ไม่มีข้อมูล)' : ''}
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
            <div style={{ ...label, marginTop: 12, fontSize: 11, color: '#999' }}>เลือกอันที่จะติดป้าย “แนะนำ”</div>
            <Radio name="srec" val="max" cur={solarRec} set={setSolarRec} disabled={!solarShow.max}>วันที่ใช้ไฟสูงสุด</Radio>
            <Radio name="srec" val="min" cur={solarRec} set={setSolarRec} disabled={!solarShow.min}>วันที่ใช้ไฟน้อยสุด</Radio>
            <Radio name="srec" val="avg" cur={solarRec} set={setSolarRec} disabled={!solarShow.avg}>ค่าเฉลี่ย</Radio>
            <Radio name="srec" val=""    cur={solarRec} set={setSolarRec}>ไม่แนะนำอันไหน</Radio>
          </div>

          <div style={group}>
            <span style={label}>การ์ดแนะนำแบตเตอรี่</span>
            <Check on={battShow.evening} set={v => setBattShow(s => ({ ...s, evening: v }))}>สำรองช่วงหัวค่ำ (18:00–00:00)</Check>
            <Check on={battShow.night}   set={v => setBattShow(s => ({ ...s, night: v }))}>สำรองทั้งคืน (18:00–06:00)</Check>
            <Check on={battShow.custom}  set={v => setBattShow(s => ({ ...s, custom: v }))}>กำหนดช่วงเวลาเอง</Check>
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
            <Radio name="brec" val=""        cur={battRec} set={setBattRec}>ไม่แนะนำอันไหน</Radio>
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
              siteName={siteName} rows={rows} stats={stats} rate={rate}
              showMax={showMax} showMin={showMin} showAvg={showAvg}
              solarShow={solarShow} solarRec={solarRec}
              battShow={battShow} battRec={battRec} battCustom={battCustom}
              images={images} sunIntensity={sunIntensity}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── เอกสารรายงาน (โทนสว่าง กว้างคงที่ 900px เพื่อให้ PDF ออกมาคมและคาดเดาได้) ──
function ReportDoc({ innerRef, siteName, rows, stats, rate, showMax, showMin, showAvg,
                     solarShow, solarRec, battShow, battRec, battCustom, images, sunIntensity }) {
  const sectionTitle = {
    fontSize: 17, fontWeight: 600, color: R.text, marginBottom: 18,
    display: 'flex', alignItems: 'center', gap: 8,
  }
  const bar = { display: 'inline-block', width: 4, height: 18, background: R.greenBar, borderRadius: 2, flexShrink: 0 }
  const th  = { padding: '10px 12px', border: '1px solid #efefef', background: '#fff', color: R.muted, fontWeight: 500 }
  const td  = { padding: '10px 12px', border: '1px solid #efefef' }
  const divider = { border: 'none', borderTop: `1px solid ${R.border}`, margin: '26px 0 30px' }
  const notice = { background: '#e8f5e9', color: R.teal, padding: '12px 16px', borderRadius: 6, fontSize: 13, marginTop: 24, borderLeft: `4px solid ${R.teal}` }

  const noticeText = <><strong>หมายเหตุ:</strong> คำนวณจากการใช้ไฟจริง {rows.length} วัน · อัตรา {n2(rate)} บาท/Unit</>

  const maxDate = stats?.maxRow?.date
  const minDate = stats?.minRow?.date

  const solarCards = []
  if (stats) {
    if (solarShow.max) solarCards.push({ key: 'max', title: `วันที่ใช้ไฟฟ้าสูงสุด (${thShort(stats.maxRow.date)})`, dayLabel: 'ใช้ไฟกลางวัน', ...stats.maxRow })
    if (solarShow.min) solarCards.push({ key: 'min', title: `วันที่ใช้ไฟฟ้าน้อยสุด (${thShort(stats.minRow.date)})`, dayLabel: 'ใช้ไฟกลางวัน', ...stats.minRow })
    if (solarShow.avg) solarCards.push({ key: 'avg', title: 'ค่าเฉลี่ย', dayLabel: 'ใช้ไฟกลางวันเฉลี่ย', ...stats.avg })
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

  return (
    <div ref={innerRef} style={{ width: 900, background: '#fff', padding: 40, color: R.text, fontFamily: '"Sarabun",sans-serif', fontSize: 14, lineHeight: 1.5, boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 14, color: R.muted }}>ลูกค้า</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1a1a1a', margin: '4px 0' }}>{siteName || '—'}</h1>
        <div style={{ fontSize: 14, color: R.muted }}>วันที่จัดทำรายงาน: {thFull(todayStr())}</div>
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
            <th colSpan={3} style={{ ...th, borderBottom: `1px solid ${R.border}` }}>การใช้ไฟฟ้าจริง</th>
            <th colSpan={3} style={{ ...th, borderBottom: `1px solid ${R.border}` }}>การคำนวณโซลาร์เซลล์</th>
          </tr>
          <tr>
            <th style={th}>24 ชม.</th>
            <th style={th}>กลางวัน<br /><span style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>06:00–18:00</span></th>
            <th style={th}>กลางคืน<br /><span style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>18:00–06:00</span></th>
            <th style={th}>แนะนำการติดตั้ง</th>
            <th style={th}>ประหยัด/วัน<br /><span style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>(THB)</span></th>
            <th style={th}>ประหยัด/ปี<br /><span style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>(THB)</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const isMax = showMax && r.date === maxDate
            const isMin = showMin && r.date === minDate && r.date !== maxDate
            const rowStyle = isMax ? { background: R.lightRed, color: R.red, fontWeight: 600 }
                           : isMin ? { background: R.tealHi, color: R.teal, fontWeight: 600 }
                           : {}
            return (
              <tr key={r.date} style={rowStyle}>
                <td style={td}>{thShort(r.date)}</td>
                <td style={td}>{n2(r.total)}</td>
                <td style={td}>{n2(r.day)}</td>
                <td style={td}>{n2(r.night)}</td>
                <td style={td}>{n2(r.solarKw)} kW</td>
                <td style={td}>{nL(r.savingsDay)}</td>
                <td style={td}>{nL(r.savingsYear)}</td>
              </tr>
            )
          })}
          {showAvg && stats && (() => {
            // html2canvas ไม่ render outline บน <tr> → ต้องตีกรอบที่ td แต่ละช่องแทน
            const cells = [
              'ค่าเฉลี่ย', n2(stats.avg.total), n2(stats.avg.day), n2(stats.avg.night),
              `${n2(stats.avg.solarKw)} kW`, nL(stats.avg.savingsDay), nL(stats.avg.savingsYear),
            ]
            return (
              <tr style={{ color: R.red, fontWeight: 600 }}>
                {cells.map((v, i) => (
                  <td key={i} style={{
                    ...td,
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
        <div style={notice}>
          <strong>หมายเหตุ:</strong> คำนวณจากการใช้ไฟจริง {rows.length} วัน · อัตรา {n2(rate)} บาท/Unit ·
          นับเฉพาะไฟที่ใช้จริง ไม่รวมช่วงที่ไฟไหลย้อน
        </div>
      </>}

      {/* Section 4 — การออกแบบติดตั้ง */}
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
        {note && <div style={{ fontSize: 12, color: R.red, lineHeight: 1.4, marginTop: 12 }}>{note}</div>}
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
