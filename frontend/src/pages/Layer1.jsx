import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Zap, Bell, AlertTriangle, Info, ArrowUpRight } from 'lucide-react'

// ── Constants ──────────────────────────────────────────────────────────────
const FP_STORAGE = 'heatmap_floor_plans'
const DEFAULT_CAPACITY = 20

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
  if (score > 80) return { label: 'ความเสี่ยงสูง', short: 'CRITICAL', color: '#ef4444', bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.35)' }
  if (score > 60) return { label: 'หนาแน่น',       short: 'HIGH',     color: '#f97316', bg: 'rgba(249,115,22,0.15)',  border: 'rgba(249,115,22,0.35)' }
  if (score > 40) return { label: 'ปานกลาง',       short: 'MEDIUM',   color: '#eab308', bg: 'rgba(234,179,8,0.15)',   border: 'rgba(234,179,8,0.35)' }
  if (score > 20) return { label: 'ใช้งานน้อย',    short: 'LOW',      color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)' }
  return           { label: 'ว่างมาก',         short: 'SAFE',     color: '#16a34a', bg: 'rgba(22,163,74,0.12)',   border: 'rgba(22,163,74,0.3)' }
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

// ── Donut Item (Layer1.1 style) ──────────────────────────────────────────
function DonutItem({ name, ratio, selected, onClick }) {
  const pct = Math.round(Math.min(ratio, 1) * 100)
  const color = ratio > 0 ? densityColor(ratio) : '#3b82f6'
  const label = densityLabel(ratio)
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all"
      style={{
        border: `1px solid ${selected ? color : '#0d2a25'}`,
        background: selected ? '#08221f' : 'rgba(4,21,19,0.6)',
      }}
    >
      <div className="relative flex-shrink-0 flex items-center justify-center" style={{ width: 56, height: 56 }}>
        <svg width="56" height="56" style={{ transform: 'rotate(-90deg)' }} viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.915" fill="none" stroke="#0b221f" strokeWidth="3.5" />
          <circle cx="18" cy="18" r="15.915" fill="none" stroke={color} strokeWidth="3.5"
            strokeDasharray={`${pct} 100`} strokeLinecap="round" />
        </svg>
        <span className="absolute text-white font-bold" style={{ fontSize: 11 }}>{pct}%</span>
      </div>
      <div>
        <div className="text-sm font-bold" style={{ color }}>{name}</div>
        <div style={{ fontSize: 11, color: color + 'bb' }}>{label}</div>
      </div>
    </div>
  )
}

// ── Risk Gauge (Layer1.1 style) ───────────────────────────────────────────
function RiskGauge({ score, trend }) {
  const { label, short, color } = riskMeta(score)
  // 0% = ซ้าย (-90deg from top), 100% = ขวา (+90deg from top)
  // needle line points left from center; rotate 0°→180° for 0→100
  const needleDeg = (Math.min(score, 100) / 100) * 180
  const trendLabel = trend > 0 ? 'เพิ่มขึ้น' : trend < 0 ? 'ลดลง' : 'คงที่'
  const trendColor = trend > 0 ? '#ef4444' : trend < 0 ? '#22c55e' : '#6b7280'
  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="relative w-full mx-auto" style={{ maxWidth: 220 }}>
        <svg className="w-full" viewBox="0 0 200 140">
          <defs>
            <linearGradient id="gauge-grad-l1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#10b981" />
              <stop offset="40%"  stopColor="#f59e0b" />
              <stop offset="75%"  stopColor="#f97316" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>
          {/* Track */}
          <path d="M 18 115 A 82 82 0 0 1 182 115" fill="none" stroke="#082320" strokeWidth="18" strokeLinecap="round" />
          {/* Gradient arc */}
          <path d="M 18 115 A 82 82 0 0 1 182 115" fill="none" stroke="url(#gauge-grad-l1)" strokeWidth="14" strokeLinecap="round" />
          {/* Tick labels */}
          <text x="10"  y="130" fill="#56817a" fontSize="10" textAnchor="middle" fontWeight="700">0</text>
          <text x="40"  y="58"  fill="#56817a" fontSize="10" textAnchor="middle" fontWeight="700">25</text>
          <text x="100" y="20"  fill="#56817a" fontSize="10" textAnchor="middle" fontWeight="700">50</text>
          <text x="160" y="58"  fill="#56817a" fontSize="10" textAnchor="middle" fontWeight="700">75</text>
          <text x="190" y="130" fill="#56817a" fontSize="10" textAnchor="middle" fontWeight="700">100</text>
          {/* Needle */}
          <g transform={`rotate(${needleDeg}, 100, 115)`}>
            <line x1="100" y1="115" x2="22" y2="115" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
            <polygon points="20,115 30,111 30,119" fill="#ffffff" />
          </g>
          {/* Pivot */}
          <circle cx="100" cy="115" r="7" fill="#041210" stroke="#ffffff" strokeWidth="2.5" />
          {/* Score */}
          <text x="100" y="98" textAnchor="middle" fontSize="38" fontWeight="900" fill={color}
            style={{ transition: 'fill 0.5s' }}>{score}</text>
        </svg>
      </div>
      {/* Label */}
      <div className="text-base font-bold tracking-wide" style={{ color, marginTop: -6 }}>{label}</div>
      {/* Badge */}
      <div className="px-5 py-1 rounded-md text-xs font-bold tracking-widest uppercase"
        style={{ border: `1px solid ${color}99`, background: color + '18', color }}>
        {short}
      </div>
      {/* Trend */}
      <div className="flex items-center gap-1.5 text-xs" style={{ color: '#56817a' }}>
        <span>แนวโน้ม: {trendLabel}</span>
        {trend !== 0 && <ArrowUpRight size={13} style={{ color: trendColor, transform: trend < 0 ? 'scaleY(-1)' : 'none' }} />}
      </div>
    </div>
  )
}

// ── Zone Heatmap SVG ─────────────────────────────────────────────────────
function ZoneHeatmap({ plan, camCounts, maxCount }) {
  if (!plan) {
    return (
      <div className="flex items-center justify-center h-full text-xs" style={{ color: '#56817a' }}>
        ยังไม่มีแผนผัง — ตั้งค่าใน Heatmap Editor
      </div>
    )
  }
  const vbox = plan.vbox || '0 0 841.92 595.32'
  return (
    <div className="w-full h-full relative">
      <svg viewBox={vbox} className="w-full h-full block">
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
                fontFamily="sans-serif" style={{ filter: 'drop-shadow(0 1px 5px rgba(0,0,0,0.9))' }}>
                {z.name}
              </text>
              {cnt > 0 && (
                <text x={px} y={py + 10} textAnchor="middle" fill={heatColor(ratio, 1)} fontSize="11" fontWeight="600"
                  fontFamily="monospace" style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.9))' }}>
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

// ── Alert Card (Layer1.1 style) ──────────────────────────────────────────
function AlertCard({ level, title, detail, time }) {
  const cfg = {
    critical: { bg: '#180a0a', border: '#7f1d1dcc', iconBg: 'rgba(127,29,29,0.4)',  iconColor: '#ef4444', Icon: Bell },
    warn:     { bg: '#1c1205', border: '#78350fcc', iconBg: 'rgba(120,53,15,0.4)',  iconColor: '#f59e0b', Icon: AlertTriangle },
    info:     { bg: '#051118', border: '#0369a1cc', iconBg: 'rgba(3,105,161,0.3)',  iconColor: '#38bdf8', Icon: Info },
  }
  const s = cfg[level] || cfg.info
  const { Icon } = s
  return (
    <div className="rounded-lg p-3 flex justify-between items-center transition-all"
      style={{ background: s.bg, border: `1px solid ${s.border}` }}>
      <div className="flex items-center gap-3">
        <div className="rounded-full flex items-center justify-center flex-shrink-0"
          style={{ width: 36, height: 36, background: s.iconBg }}>
          <Icon size={18} style={{ color: s.iconColor }} />
        </div>
        <div>
          <div className="text-xs font-bold text-white">{title}</div>
          <div className="text-gray-400 mt-0.5" style={{ fontSize: 10 }}>{detail}</div>
        </div>
      </div>
      <span className="text-gray-500 font-medium flex-shrink-0 ml-2" style={{ fontSize: 10 }}>{time}</span>
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
  const [selectedZone, setSelectedZone] = useState(null)
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
      setPrevTotal(data.reduce((s, c) => s + (c.total_people || 0), 0))
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
    const ratio = Math.min(count / DEFAULT_CAPACITY, 1)
    return { name: `กล้อง ${i + 1}`, count, ratio, running: cam?.running || false }
  })

  const totalCount    = zoneSummary.reduce((s, z) => s + z.count, 0)
  const totalCapacity = zoneSummary.length * DEFAULT_CAPACITY
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
    <div className="min-h-screen w-full select-none"
      style={{ background: '#030d0c', color: '#e2f1ee', fontFamily: "'Sarabun', sans-serif" }}>

      <div className="w-full min-h-screen flex items-start justify-center p-2 sm:p-4 md:p-6">
        <div className="w-full max-w-[1200px] rounded-2xl border-2 p-5 sm:p-6 relative overflow-hidden"
          style={{ background: '#041210', borderColor: '#123933', boxShadow: '0 0 40px rgba(4,30,26,0.8)' }}>

          {/* Background glow blobs */}
          <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full pointer-events-none"
            style={{ background: 'rgba(16,185,129,0.05)', filter: 'blur(120px)' }} />
          <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full pointer-events-none"
            style={{ background: 'rgba(0,163,255,0.05)', filter: 'blur(120px)' }} />

          {/* ── HEADER ───────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4"
            style={{ borderBottom: '1px solid rgba(13,46,41,0.5)' }}>
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center flex-shrink-0">
                <div className="absolute w-12 h-12 rounded-full opacity-75"
                  style={{ background: 'rgba(16,185,129,0.15)',
                    animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite' }} />
                <div className="w-11 h-11 rounded-full flex items-center justify-center z-10 relative"
                  style={{ background: '#10b981', boxShadow: '0 0 20px rgba(16,185,129,0.5)' }}>
                  <Zap size={22} fill="black" color="black" strokeWidth={1.5} />
                </div>
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-extrabold tracking-wider text-white flex flex-wrap items-center gap-2">
                  <span>LAYER 1: GREEDY</span>
                  <span className="font-medium text-sm sm:text-base" style={{ color: '#9ca3af' }}>(REAL-TIME DECISION)</span>
                </h1>
                <p className="text-xs font-light mt-0.5" style={{ color: '#6fa39b' }}>
                  เลือกสิ่งที่ดีที่สุด ณ เวลาปัจจุบัน เพื่อการตอบสนองและแจ้งเตือนทันที
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 self-end sm:self-auto flex-wrap justify-end">
              <span className="text-xs font-mono" style={{ color: '#56817a' }}>ทั้งหมด {grandTotal} คน</span>
              <span className="text-xs font-semibold tracking-widest border px-2.5 py-1 rounded-md uppercase"
                style={{ color: '#06b6d4', borderColor: 'rgba(6,182,212,0.3)', background: 'rgba(6,182,212,0.05)' }}>
                ระบบเชิงคาดการณ์และป้องกันล่วงหน้า
              </span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block"
                  style={{ background: '#22c55e', boxShadow: '0 0 5px #22c55e' }} />
                <span className="text-xs font-mono" style={{ color: '#56817a' }}>{updateTime}</span>
              </div>
            </div>
          </div>

          {/* ── MAIN 3-COLUMN GRID ────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">

            {/* COL 1: DONUT CHART */}
            <div className="rounded-xl p-4 flex flex-col gap-3 transition-all duration-300"
              style={{ background: '#051715', border: '1px solid #0d2e29' }}>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <div className="text-xs font-bold tracking-wider" style={{ color: '#d1d5db' }}>1. DONUT CHART</div>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />
                </div>
                <div className="text-[10px] mb-2" style={{ color: '#56817a' }}>ความหนาแน่นของกล้อง (Real-time)</div>
              </div>
              <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: 400, scrollbarWidth: 'none' }}>
                {zoneSummary.map(z => (
                  <DonutItem key={z.name} name={z.name} ratio={z.ratio}
                    selected={selectedZone === z.name}
                    onClick={() => setSelectedZone(selectedZone === z.name ? null : z.name)} />
                ))}
              </div>
            </div>

            {/* COL 2: GAUGE */}
            <div className="rounded-xl p-4 flex flex-col items-center transition-all duration-300"
              style={{ background: '#051715', border: '1px solid #0d2e29' }}>
              <div className="w-full text-left mb-2">
                <div className="text-xs font-bold tracking-wider" style={{ color: '#d1d5db' }}>2. GAUGE (RISK LEVEL)</div>
                <div className="text-[10px]" style={{ color: '#56817a' }}>ระดับความเสี่ยง (Real-time)</div>
              </div>
              <div className="flex-1 flex items-center justify-center w-full py-2">
                <RiskGauge score={riskScore} trend={trend} />
              </div>
            </div>

            {/* COL 3: HEATMAP */}
            <div className="rounded-xl p-4 flex flex-col gap-3 transition-all duration-300"
              style={{ background: '#051715', border: '1px solid #0d2e29' }}>
              <div>
                <div className="text-xs font-bold tracking-wider" style={{ color: '#d1d5db' }}>3. HEATMAP (ZONE MAP)</div>
                <div className="text-[10px] mb-1" style={{ color: '#56817a' }}>แผนที่ความหนาแน่น (Real-time)</div>
              </div>
              <div className="flex-1 rounded-lg overflow-hidden"
                style={{ background: '#030f0e', border: '1px solid rgba(13,46,41,0.6)', minHeight: 260 }}>
                <ZoneHeatmap plan={activePlan} camCounts={camCounts} maxCount={maxCount} />
              </div>
            </div>

          </div>

          {/* ── ALERTS ──────────────────────────────────────────────── */}
          <div style={{ borderTop: '1px solid #0d2e29', paddingTop: 20 }}>
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="h-px flex-1"
                style={{ background: 'linear-gradient(to right, transparent, rgba(132,204,22,0.4))' }} />
              <div className="text-xs font-bold tracking-[0.25em] uppercase flex items-center gap-2"
                style={{ color: '#84cc16' }}>
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#84cc16' }} />
                REAL-TIME NOTIFICATION &amp; PREVENTIVE ALERT
              </div>
              <div className="h-px flex-1"
                style={{ background: 'linear-gradient(to left, transparent, rgba(132,204,22,0.4))' }} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {alerts.slice(0, 3).map((a, i) => (
                <AlertCard key={i} level={a.level} title={a.title} detail={a.detail} time={a.time} />
              ))}
            </div>
          </div>

        </div>
      </div>

      <style>{`@keyframes ping { 75%,100% { transform:scale(2); opacity:0 } }`}</style>
    </div>
  )
}
