import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import Header from '../components/Header.jsx'

// ── Constants ──────────────────────────────────────────────────────────────
const FP_STORAGE = 'heatmap_floor_plans'
const DEFAULT_CAPACITY = 20
const PALETTE = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6']

// ── Helpers ────────────────────────────────────────────────────────────────
function heatColor(ratio, alpha = 0.55) {
  let r, g, b
  if (ratio < 0.5) {
    const t = ratio * 2
    r = Math.round(59 + t * (245 - 59)); g = Math.round(130 + t * (158 - 130)); b = Math.round(246 + t * (11 - 246))
  } else {
    const t = (ratio - 0.5) * 2
    r = Math.round(245 + t * (239 - 245)); g = Math.round(158 + t * (68 - 158)); b = Math.round(11 + t * (44 - 11))
  }
  return `rgba(${r},${g},${b},${alpha})`
}

function centroid(pts) {
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
}

function loadPlans() {
  try {
    const stored = JSON.parse(localStorage.getItem(FP_STORAGE) || 'null')
    if (stored && stored.length > 0) return stored
    const old = JSON.parse(localStorage.getItem('floor2_zones') || 'null')
    if (old && old.length > 0) {
      const plan = { id: 'floor2_migrated', name: 'ชั้น 2', bg: 'builtin:floor2', vbox: '0 0 841.92 595.32', zones: old }
      localStorage.setItem(FP_STORAGE, JSON.stringify([plan]))
      return [plan]
    }
    const defaultPlan = { id: 'floor2_default', name: 'ชั้น 2', bg: 'builtin:floor2', vbox: '0 0 841.92 595.32', zones: [] }
    localStorage.setItem(FP_STORAGE, JSON.stringify([defaultPlan]))
    return [defaultPlan]
  } catch { return [] }
}

function riskMeta(score) {
  if (score > 80) return { label: 'เต็ม/แออัด',   color: '#ef4444', bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.35)' }
  if (score > 60) return { label: 'หนาแน่น',      color: '#f97316', bg: 'rgba(249,115,22,0.15)',  border: 'rgba(249,115,22,0.35)' }
  if (score > 40) return { label: 'ปานกลาง',      color: '#eab308', bg: 'rgba(234,179,8,0.15)',   border: 'rgba(234,179,8,0.35)' }
  if (score > 20) return { label: 'ใช้งานน้อย',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)' }
  return           { label: 'ว่างมาก',        color: '#16a34a', bg: 'rgba(22,163,74,0.12)',   border: 'rgba(22,163,74,0.3)' }
}

function densityLabel(ratio) {
  if (ratio > 0.80) return 'เต็ม/แออัด'
  if (ratio > 0.60) return 'หนาแน่น'
  if (ratio > 0.40) return 'ปานกลาง'
  if (ratio > 0.20) return 'ใช้งานน้อย'
  return 'ว่างมาก'
}

function densityColor(ratio) {
  if (ratio > 0.80) return '#ef4444'  // แดง
  if (ratio > 0.60) return '#f97316'  // ส้ม
  if (ratio > 0.40) return '#eab308'  // เหลือง
  if (ratio > 0.20) return '#22c55e'  // เขียว
  return '#16a34a'                    // เขียวเข้ม
}

// ── Built-in Floor 2 SVG ───────────────────────────────────────────────────
const BF2_T = 'matrix(0,-.75,.75,0,-.000061035159,595.32)'
function BuiltinFloor2() {
  return (
    <g transform={BF2_T} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path stroke="rgba(255,255,255,0.08)" strokeWidth="1" d="M.16 0V1121.76H791.04V0" />
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M672.16 208.8V959.52" />
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M235.68 959.52V208.8" />
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M664.8 129.6V959.2H242.88V216.16" />
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M588.48 208.8H235.68M588.48 216.16H242.88" />
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M672.16 208.8V129.6H588.48V208.8 216.16" />
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M672.16 959.52V1116.16H387.2V1085.44" />
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M235.68 959.52V1085.44H387.2" />
      <path stroke="rgba(255,255,255,0.55)" strokeWidth="1" d="M665.76 963.52V1109.76H393.6V964.32L665.76 963.52Z" />
      <path stroke="rgba(255,255,255,0.55)" strokeWidth="1" d="M240.32 964.32V1080.8H387.04V964.32H240.32Z" />
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M505.6 5.76H109.92V208.8H588.48" />
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M672.16 208.8V20.96H505.6V5.76" />
      <path stroke="rgba(255,255,255,0.45)" strokeWidth=".8" d="M501.76 9.44H113.6V205.12H588.48" />
      <path stroke="rgba(255,255,255,0.45)" strokeWidth=".8" d="M668.32 129.6V24.64H501.76V9.44" />
      <path stroke="rgba(255,255,255,0.18)" strokeWidth=".8" strokeDasharray="10,7" d="M664.8 589.44H242.88M459.04 216.16V959.2" />
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M569.28 248.96V275.84H543.68V248.96H569.28Z" />
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M375.84 248.96V275.84H350.08V248.96H375.84Z" />
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M569.28 415.68V442.56H543.68V415.68H569.28Z" />
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M375.84 415.68V442.56H350.08V415.68H375.84Z" />
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M569.28 573.44V600.32H543.68V573.44H569.28Z" />
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M375.84 573.44V600.32H350.08V573.44H375.84Z" />
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M569.28 731.2V758.08H543.68V731.2H569.28Z" />
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M375.84 731.2V758.08H350.08V731.2H375.84Z" />
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M569.28 880V906.88H543.68V880H569.28Z" />
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M375.84 880V906.88H350.08V880H375.84Z" />
    </g>
  )
}

// ── Donut Chart ────────────────────────────────────────────────────────────
function DonutChart({ zones }) {
  if (zones.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: 13 }, (_, i) => `กล้อง ${i + 1}`).map((name, i) => (
          <ZoneDonut key={name} name={name} ratio={0} color="#3b82f6" />
        ))}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {zones.map((z, i) => (
        <ZoneDonut key={z.name + i} name={z.name} ratio={z.ratio} color="#3b82f6" />
      ))}
    </div>
  )
}

function ZoneDonut({ name, ratio, color }) {
  const pct = Math.round(Math.min(ratio, 1) * 100)
  const r = 20, circ = 2 * Math.PI * r
  const dash = Math.min(ratio, 1) * circ
  const fillColor = ratio > 0 ? densityColor(ratio) : color

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <svg width={48} height={48} viewBox="0 0 48 48">
          <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
          <circle
            cx="24" cy="24" r={r} fill="none"
            stroke={fillColor}
            strokeWidth="5"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeLinecap="round"
            transform="rotate(-90 24 24)"
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
          <text x="24" y="28" textAnchor="middle" fontSize="10" fill={fillColor} fontFamily="var(--mono)" fontWeight="700">
            {pct}%
          </text>
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>{name}</div>
        <div style={{ fontSize: 11, color: fillColor, marginTop: 2 }}>{densityLabel(ratio)}</div>
      </div>
      <div style={{
        fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600,
        color: fillColor, background: `${fillColor}18`,
        border: `1px solid ${fillColor}33`, borderRadius: 5, padding: '2px 8px', flexShrink: 0,
      }}>
        {pct}%
      </div>
    </div>
  )
}

// ── Risk Gauge ─────────────────────────────────────────────────────────────
function RiskGauge({ score, trend }) {
  const risk = riskMeta(score)
  // cx=130 centred in 260px viewBox; R=85; cy=108 leaves room below for score
  const cx = 130, cy = 108, R = 85
  const toRad = d => d * Math.PI / 180

  function arc(a1, a2) {
    const x1 = cx + R * Math.cos(toRad(a1)), y1 = cy + R * Math.sin(toRad(a1))
    const x2 = cx + R * Math.cos(toRad(a2)), y2 = cy + R * Math.sin(toRad(a2))
    return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`
  }

  const zones = [
    { from: -180, to: -144, color: '#16a34a' },
    { from: -144, to: -108, color: '#22c55e' },
    { from: -108, to:  -72, color: '#eab308' },
    { from:  -72, to:  -36, color: '#f97316' },
    { from:  -36, to:    0, color: '#ef4444' },
  ]

  const needleAngle = -180 + (Math.min(score, 100) / 100) * 180
  // needle tip near arc edge
  const nx = cx + (R - 6) * Math.cos(toRad(needleAngle))
  const ny = cy + (R - 6) * Math.sin(toRad(needleAngle))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%' }}>
      {/* viewBox 260×204 (top padded 14px): score at cy+54=176, fits all labels */}
      <svg width="100%" viewBox="0 -14 260 204" style={{ display: 'block' }}>
        {/* BG track */}
        <path d={arc(-180, 0)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="16" />
        {/* Colour zones */}
        {zones.map((z, i) => (
          <path key={i} d={arc(z.from, z.to)} fill="none" stroke={z.color + 'cc'} strokeWidth="16" />
        ))}
        {/* Active glow progress */}
        {score > 0 && (
          <path d={arc(-180, needleAngle)} fill="none" stroke={risk.color} strokeWidth="4"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${risk.color})`, transition: 'all 0.5s ease' }} />
        )}
        {/* Tick marks + labels outside arc */}
        {[0, 25, 50, 75, 100].map(v => {
          const a = -180 + (v / 100) * 180
          const t1x = cx + (R + 2)  * Math.cos(toRad(a)), t1y = cy + (R + 2)  * Math.sin(toRad(a))
          const t2x = cx + (R + 12) * Math.cos(toRad(a)), t2y = cy + (R + 12) * Math.sin(toRad(a))
          const lx  = cx + (R + 24) * Math.cos(toRad(a)), ly  = cy + (R + 24) * Math.sin(toRad(a))
          const anchor = v === 0 ? 'end' : v === 100 ? 'start' : 'middle'
          return (
            <g key={v}>
              <line x1={t1x} y1={t1y} x2={t2x} y2={t2y}
                stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
              <text x={lx} y={ly + 4} textAnchor={anchor}
                fontSize="10" fill="rgba(255,255,255,0.55)" fontFamily="var(--mono)">{v}</text>
            </g>
          )
        })}
        {/* Needle — white, thin */}
        <line x1={cx} y1={cy} x2={nx} y2={ny}
          stroke="rgba(255,255,255,0.92)" strokeWidth="2.5" strokeLinecap="round"
          style={{ transition: 'all 0.5s ease' }} />
        {/* Pivot */}
        <circle cx={cx} cy={cy} r={9} fill={risk.color}
          style={{ transition: 'fill 0.5s ease' }} />
        <circle cx={cx} cy={cy} r={4} fill="#0b0d11" />
        {/* Large score — pushed well below pivot so it doesn't overlap needle */}
        <text x={cx} y={cy + 54} textAnchor="middle" fontSize="42" fontWeight="700"
          fill={risk.color} fontFamily="var(--mono)"
          style={{ transition: 'fill 0.5s ease' }}>{score}</text>
      </svg>
      {/* Status badge */}
      <div style={{
        background: risk.bg, border: `1px solid ${risk.border}`,
        borderRadius: 8, padding: '5px 22px', fontSize: 14, fontWeight: 700,
        color: risk.color, letterSpacing: '.08em', marginTop: -14,
      }}>
        {risk.label}
      </div>
    </div>
  )
}

// ── Zone Heatmap SVG ───────────────────────────────────────────────────────
function ZoneHeatmap({ plan, camCounts, maxCount }) {
  if (!plan) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 13 }}>
        ยังไม่มีแผนผัง — ตั้งค่าใน Heatmap Editor
      </div>
    )
  }

  const vbox = plan.vbox || '0 0 841.92 595.32'

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>

      <svg viewBox={vbox} style={{ width: '100%', height: '100%', display: 'block' }}>
        {plan.bg === 'builtin:floor2' && <BuiltinFloor2 />}
        {plan.bg !== 'builtin:floor2' && plan.bg !== 'blank' && (
          <image href={plan.bg} x="0" y="0" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
        )}
        {plan.zones.map(z => {
          const camInfo = camCounts[z.cameraId]
          const cnt = camInfo?.total || 0
          const ratio = Math.min(cnt / Math.max(maxCount, 1), 1)
          const active = z.cameraId && camInfo?.running && cnt > 0
          const fill = cnt > 0 ? heatColor(ratio, 0.52) : 'rgba(255,255,255,0.03)'
          const stroke = active ? heatColor(ratio, 0.95) : 'rgba(255,255,255,0.1)'
          const pts = z.points.map(p => p.join(',')).join(' ')
          const [px, py] = centroid(z.points)
          return (
            <g key={z.id}>
              {active && <polygon points={pts} fill="none" stroke={heatColor(ratio, 0.3)} strokeWidth="8" />}
              <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={active ? '2.5' : '1.5'} />
              <text x={px} y={py - 6} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize="13" fontWeight="700"
                fontFamily="var(--sans)" style={{ filter: 'drop-shadow(0 1px 5px rgba(0,0,0,0.9))' }}>
                {z.name}
              </text>
              {cnt > 0 && (
                <text x={px} y={py + 10} textAnchor="middle" fill={heatColor(ratio, 1)} fontSize="11" fontWeight="600"
                  fontFamily="var(--mono)" style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.9))' }}>
                  {cnt} คน
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Alert Card ─────────────────────────────────────────────────────────────
function AlertCard({ level, title, detail, time }) {
  const cfg = {
    critical: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.40)', color: '#ef4444', icon: '🔔' },
    warn:     { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.40)', color: '#f59e0b', icon: '⚠' },
    info:     { bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.30)',  color: '#22c55e', icon: 'ℹ' },
  }
  const s = cfg[level] || cfg.info
  return (
    <div style={{
      background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10,
      padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: `${s.color}22`, border: `1.5px solid ${s.color}88`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
      }}>{s.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: s.color, lineHeight: 1.3 }}>{title}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)', flexShrink: 0 }}>{time}</div>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 3, lineHeight: 1.4 }}>{detail}</div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function Layer1() {
  const [searchParams] = useSearchParams()
  const apiBase = (searchParams.get('gateway') || import.meta.env.VITE_GATEWAY_URL || '').replace(/\/$/, '')
  const planIdParam = searchParams.get('plan') || null

  const [plans, setPlans]         = useState(loadPlans)
  const [cameras, setCameras]     = useState([])
  const [camCounts, setCamCounts] = useState({})
  const [updateTime, setUpdateTime] = useState('—')
  const [maxCount, setMaxCount]   = useState(1)
  const [prevTotal, setPrevTotal] = useState(0)
  const abortRef = useRef(null)

  // Fetch plans from gateway (overrides localStorage when available)
  useEffect(() => {
    if (!apiBase) return
    fetch(apiBase + '/api/plans')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data) && data.length > 0) setPlans(data) })
      .catch(() => {})
  }, [apiBase])

  // Reload plans when localStorage changes from Heatmap editor
  useEffect(() => {
    const onStorage = () => setPlans(loadPlans())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const fetchData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    try {
      const res = await fetch(apiBase + '/api/cameras', { signal: abortRef.current.signal })
      if (!res.ok) return
      const data = await res.json()
      abortRef.current = null
      const counts = {}
      data.forEach(c => { counts[c.id] = { total: c.total_people || 0, running: c.running } })
      const peak = Math.max(...data.map(c => c.total_people || 0), 1)
      setMaxCount(prev => Math.max(prev * 0.97, peak, 1))
      setCameras(data)
      setCamCounts(counts)
      setUpdateTime(new Date().toLocaleTimeString('th-TH'))
      setPrevTotal(prev => {
        const newTotal = data.reduce((s, c) => s + (c.total_people || 0), 0)
        setPrevTotal(newTotal)
        return prev
      })
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('fetch error', e)
    }
  }, [apiBase])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 2000)
    return () => { clearInterval(id); if (abortRef.current) abortRef.current.abort() }
  }, [fetchData])

  // ── Derived data ──────────────────────────────────────────────────────────
  const activePlan = (planIdParam ? plans.find(p => p.id === planIdParam) : null) || plans[0] || null

  // Apply cameraOrder from floor plan if set, otherwise use API order
  const orderedCameras = (() => {
    const order = activePlan?.cameraOrder
    if (!order || order.length === 0) return cameras
    const mapped = order.map(id => cameras.find(c => c.id === id)).filter(Boolean)
    const rest = cameras.filter(c => !order.includes(c.id))
    return [...mapped, ...rest]
  })()

  // Build summary: เสมอ 13 ช่อง — ใช้ข้อมูล API ถ้ามี ไม่มีใช้ 0
  const zoneSummary = Array.from({ length: 13 }, (_, i) => {
    const cam = orderedCameras[i]
    const count = cam?.total_people || 0
    const capacity = DEFAULT_CAPACITY
    const ratio = Math.min(count / capacity, 1)
    return { name: `กล้อง ${i + 1}`, color: '#3b82f6', count, capacity, ratio, running: cam?.running || false }
  })

  // Risk score = รวมทุกกล้อง / ความจุรวมทั้งหมด × 100
  const totalCount    = zoneSummary.reduce((s, z) => s + z.count, 0)
  const totalCapacity = zoneSummary.reduce((s, z) => s + z.capacity, 0)
  const riskScore     = totalCapacity > 0 ? Math.round((totalCount / totalCapacity) * 100) : 0

  const grandTotal = cameras.reduce((s, c) => s + (c.total_people || 0), 0)
  const trend = grandTotal - prevTotal

  // ── Smart Alerts ────────────────────────────────────────────────────────
  const now = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  const safeZones   = zoneSummary.filter(z => z.ratio <= 0.20)
  const criticalZones = zoneSummary.filter(z => z.ratio > 0.80)
  const warnZones     = zoneSummary.filter(z => z.ratio > 0.60 && z.ratio <= 0.80)
  const alerts = []
  // Critical: กล้องแออัด + แนะนำย้าย
  criticalZones.forEach(z => {
    const redirect = safeZones.find(s => s.name !== z.name)
    alerts.push({ level: 'critical', time: now,
      title: `${z.name} เต็ม/แออัด`,
      detail: redirect ? `แนะนำ: ย้ายไป ${redirect.name} (ว่าง ${DEFAULT_CAPACITY - redirect.count} คน)` : `ความหนาแน่น ${Math.round(z.ratio*100)}%` })
  })
  // Warning: กล้องใกล้เต็ม
  warnZones.forEach(z => {
    alerts.push({ level: 'warn', time: now,
      title: `${z.name} ใกล้เต็ม`,
      detail: `ความหนาแน่น ${Math.round(z.ratio*100)}% — ควรเฝ้าระวัง` })
  })
  // Info: โซนว่างที่แนะนำ (เฉพาะเมื่อมี critical/warn)
  if (criticalZones.length > 0 || warnZones.length > 0) {
    safeZones.slice(0, 3).forEach(z => {
      alerts.push({ level: 'info', time: now,
        title: `มีที่ว่างใน ${z.name}`,
        detail: `รองรับได้อีก ${DEFAULT_CAPACITY - z.count} คน` })
    })
  }
  // Fallback: ถ้าไม่มีอะไร แสดง top 3 กล้องที่มีคนมากสุด
  if (alerts.length === 0) {
    ;[...zoneSummary].sort((a, b) => b.ratio - a.ratio).slice(0, 3).forEach(z => {
      const pct = Math.round(z.ratio * 100)
      alerts.push({ level: 'info', time: now,
        title: z.name,
        detail: pct > 0 ? `ความหนาแน่น ${pct}%` : 'ไม่มีผู้ใช้งาน — ระบบปกติ' })
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <Header title="LAYER 1: GREEDY — REAL-TIME DECISION">
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
            ทั้งหมด {grandTotal} คน
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 5px var(--success)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            {updateTime}
          </div>
        </div>
      </Header>

      {/* ── Responsive styles ──────────────────────────────────────────── */}
      <style>{`
        .l1-donut::-webkit-scrollbar { display: none; }
        .l1-grid {
          flex: 1; overflow: hidden;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: 1fr auto;
          gap: 12px;
          padding: 12px 14px;
          min-height: 0;
          align-content: start;
        }
        .l1-alert { grid-column: 1 / -1; }
        /* Tablet: donut + gauge บน, heatmap เต็มแถวล่าง */
        @media (max-width: 860px) {
          .l1-grid { grid-template-columns: repeat(2, 1fr); padding: 10px; gap: 10px; }
          .l1-col-heatmap { grid-column: 1 / -1; max-height: 300px; }
        }
        /* Mobile: สแตกทั้งหมด */
        @media (max-width: 540px) {
          .l1-grid { grid-template-columns: 1fr; padding: 8px; gap: 8px; }
          .l1-col-heatmap { grid-column: 1; max-height: 240px; }
          .l1-col-donut { max-height: 300px; }
          .l1-col-gauge { max-height: 300px; overflow: hidden; }
        }
      `}</style>

      {/* Subtitle bar */}
      <div style={{
        padding: '0 24px', height: 32, display: 'flex', alignItems: 'center',
        background: 'rgba(59,130,246,0.06)', borderBottom: '1px solid rgba(59,130,246,0.12)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, color: 'rgba(96,165,250,0.8)', letterSpacing: '.08em', fontWeight: 500 }}>
          เลือกสิ่งที่ดีที่สุด ณ เวลาปัจจุบัน เพื่อตอบสนองและแจ้งเตือนทันที
        </span>
      </div>

      {/* ── Main grid ─────────────────────────────────────────────────────── */}
      <div className="l1-grid">

          {/* ── Col 1: Donut Charts ───────────────────────────────────────── */}
          <div className="l1-donut l1-col-donut" style={{
            background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)',
            padding: '16px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14,
            scrollbarWidth: 'none', minHeight: 0,
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>
                1. DONUT CHART
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 10 }}>ความหนาแน่นของกล้อง (Real-time)</div>
            </div>
            <DonutChart zones={zoneSummary} />
            {zoneSummary.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>
                ตั้งค่าโซนใน Heatmap Editor
              </div>
            )}
          </div>

          {/* ── Col 2: Gauge ──────────────────────────────────────────────── */}
          <div className="l1-col-gauge" style={{
            background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)',
            padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden',
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>
                2. GAUGE (RISK LEVEL)
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 10 }}>ระดับความเสี่ยง (Real-time)</div>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
              <div style={{ width: '100%', maxWidth: 320 }}>
                <RiskGauge score={riskScore} trend={trend} />
              </div>
            </div>
          </div>

          {/* ── Col 3: Heatmap ────────────────────────────────────────────── */}
          <div className="l1-col-heatmap" style={{
            background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)',
            padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden',
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>
                3. HEATMAP (ZONE MAP)
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>แผนที่ความหนาแน่น (Real-time)</div>
            </div>
            <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', minHeight: 0 }}>
              <ZoneHeatmap plan={activePlan} camCounts={camCounts} maxCount={maxCount} />
            </div>
          </div>

        {/* ── Notification & Alert Section ──────────────────────────── */}
        <div className="l1-alert" style={{
          background: 'var(--surface)', borderRadius: 12,
          border: '1px solid var(--border)', padding: '10px 16px 14px',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase',
            color: '#f59e0b', textAlign: 'center', marginBottom: 8,
            padding: '4px 0', borderBottom: '1px solid rgba(245,158,11,0.2)',
          }}>
            REAL-TIME NOTIFICATION &amp; PREVENTIVE ALERT
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {alerts.map((a, i) => (
              <div key={i} style={{ flex: '1 1 260px', maxWidth: 360 }}>
                <AlertCard level={a.level} title={a.title} detail={a.detail} time={a.time} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
