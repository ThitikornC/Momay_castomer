import { useState, useEffect, useRef, Component } from 'react'
import { Layers, Users, Zap, Calendar, Bell, TrendingUp, TrendingDown, Coins, Home, BookOpen, Lightbulb, Wind, Camera, Cpu, ChevronDown } from 'lucide-react'
import { Chart, registerables } from 'chart.js'
import LayerGreedy from './LayerGreedy.jsx'
import LayerDP from './LayerDP.jsx'

Chart.register(...registerables)

// ── Animated heatmap ───────────────────────────────────────────────────────
const HEAT_PALETTE = [
  '#000066','#0000cc','#0033ff','#0077ff','#00aaff',
  '#00ddcc','#00cc88','#44dd00','#aaee00','#ffff00',
  '#ffcc00','#ff8800','#ff4400','#ff0000','#cc0000',
]

const _clamp01 = v => Math.max(0, Math.min(1, v))

function _pip(px, py, poly) {
  let inside = false, j = poly.length - 1
  for (let i = 0; i < poly.length; i++) {
    const [xi,yi]=poly[i], [xj,yj]=poly[j]
    if ((yi>py)!==(yj>py) && px<(xj-xi)*(py-yi)/(yj-yi)+xi) inside=!inside
    j=i
  }
  return inside
}

function _intersect(x1,y1,dx1,dy1, x2,y2,dx2,dy2) {
  const det = dx1*(-dy2) - dy1*(-dx2)
  if (Math.abs(det) < 1e-8) return null
  const s = ((x2-x1)*(-dy2) - (y2-y1)*(-dx2)) / det
  return [x1+s*dx1, y1+s*dy1]
}

function _computeCells(gridPath, boundary) {
  const re = /M\s*([\d.]+)\s+([\d.]+)\s*L\s*([\d.]+)\s+([\d.]+)/g
  const setA = [], setB = []
  let m
  while ((m = re.exec(gridPath)) !== null) {
    const x1=+m[1],y1=+m[2],x2=+m[3],y2=+m[4]
    const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy)
    if (len < 300) continue
    const sa = Math.abs(dy/dx)
    if (dx>0 && dy<0 && sa>0.7 && sa<1.3) setA.push([x1,y1,dx,dy])
    else if (dx<0 && sa>0.35 && sa<0.65)   setB.push([x1,y1,dx,dy])
  }
  setA.sort((a,b) => (a[0]+a[1])-(b[0]+b[1]))
  setB.sort((a,b) => {
    const ya=a[1]+(-a[0])*(a[3]/a[2]), yb=b[1]+(-b[0])*(b[3]/b[2])
    return ya-yb
  })
  const grid = new Map()
  for (let i=0; i<setA.length; i++)
    for (let j=0; j<setB.length; j++) {
      const pt = _intersect(...setA[i], ...setB[j])
      if (pt) grid.set(`${i},${j}`, pt)
    }
  const out = []
  for (let r=0; r<setA.length-1; r++)
    for (let c=0; c<setB.length-1; c++) {
      const p0=grid.get(`${r},${c}`),   p1=grid.get(`${r},${c+1}`)
      const p2=grid.get(`${r+1},${c+1}`), p3=grid.get(`${r+1},${c}`)
      if (!p0||!p1||!p2||!p3) continue
      const cx=(p0[0]+p2[0])/2, cy=(p0[1]+p2[1])/2
      if (_pip(cx,cy,boundary)) out.push([r,c,...p0,...p1,...p2,...p3])
    }
  return out
}

function _buildCellZoneMap(cells) {
  if (!cells.length) return new Map()

  function axisGroups(kind) {
    const groups = new Map()
    for (const cell of cells) {
      const [r, c, x0, y0, x1, y1, x2, y2, x3, y3] = cell
      const key = kind === 'r' ? r : c
      const cy = (y0 + y1 + y2 + y3) / 4
      const g = groups.get(key) ?? { sumY: 0, count: 0 }
      g.sumY += cy
      g.count += 1
      groups.set(key, g)
    }
    const items = [...groups.entries()].map(([key, g]) => ({ key, avgY: g.sumY / g.count }))
    const spread = items.length ? Math.max(...items.map(i => i.avgY)) - Math.min(...items.map(i => i.avgY)) : 0
    return { items, spread }
  }

  const byR = axisGroups('r')
  const byC = axisGroups('c')
  const axis = byC.spread > byR.spread ? 'c' : 'r'
  const axisItems = (axis === 'c' ? byC.items : byR.items).sort((a, b) => b.avgY - a.avgY) // front (near viewer) -> back

  const aEnd = Math.max(1, Math.floor(axisItems.length / 3))
  const bEnd = Math.max(aEnd + 1, Math.floor((axisItems.length * 2) / 3))
  const bandZone = new Map()
  axisItems.forEach((it, i) => {
    bandZone.set(it.key, i < aEnd ? 'A' : i < bEnd ? 'B' : 'C')
  })

  const cellZone = new Map()
  for (const cell of cells) {
    const [r, c] = cell
    const bandKey = axis === 'c' ? c : r
    cellZone.set(`${r},${c}`, bandZone.get(bandKey) ?? 'B')
  }
  return cellZone
}

// ── Per-floor seeds — each floor is truly independent ─────────────────────
// (different frequencies + starting phase → no visual correlation between floors)
const FLOOR_SEEDS = [
  { fa:0.28, fb:0.21, fc:0.14, fd:0.33, fe:0.09, t0:0.0  },
  { fa:0.31, fb:0.17, fc:0.19, fd:0.27, fe:0.13, t0:41.7 },
  { fa:0.22, fb:0.25, fc:0.11, fd:0.38, fe:0.07, t0:83.2 },
  { fa:0.35, fb:0.18, fc:0.16, fd:0.29, fe:0.11, t0:17.5 },
  { fa:0.19, fb:0.30, fc:0.23, fd:0.21, fe:0.15, t0:62.4 },
  { fa:0.26, fb:0.23, fc:0.12, fd:0.31, fe:0.08, t0:55.1 },
]

const ZONE_PROFILES = {
  A: { center: 0.55, amp: 0.24, wave: 0.04, drift: 0.90 },
  B: { center: 0.69, amp: 0.20, wave: 0.04, drift: 1.00 },
  C: { center: 0.88, amp: 0.15, wave: 0.03, drift: 1.12 },
}

// Fetch SVG once → parse exact boundary polygon + grid lines → compute cells
const _CELLS_PROMISE = fetch('/Floorplan/HeatmapgridFloor1.svg')
  .then(r => r.text())
  .then(text => {
    // SVG has two <path d="...">: [0] = L-shape fill polygon, [1] = grid lines
    const paths = [...text.matchAll(/\bd="([^"]+)"/g)]
    // Parse full boundary polygon from the fill path (M x y L x y ... Z)
    const boundary = [...(paths[0]?.[1] ?? '').matchAll(/[ML]\s*([\d.]+)\s+([\d.]+)/g)]
      .map(m => [+m[1], +m[2]])
    const gridPath = paths[1]?.[1] ?? ''
    return _computeCells(gridPath, boundary)
  })

// ─────────────────────────────────────────────────────────────────────────────
// HeatmapAnimatedCanvas
//
// Props:
//   floorIdx  — 0-based floor index
//   apiValues — Float32Array | null
//               null  → animated mock data (each floor independent)
//               array → real data: one value per cell, normalized 0..1
//                       (set from API response when ready)
//   opacity   — SVG overlay opacity
// ─────────────────────────────────────────────────────────────────────────────
function HeatmapAnimatedCanvas({ floorIdx, apiValues = null, opacity }) {
  const [cells, setCells] = useState([])
  const polyRefs = useRef([])
  const raf = useRef(null)
  const simRef = useRef(null)
  // Use ref so animation loop always reads latest API data without restarting
  const apiRef = useRef(apiValues)
  useEffect(() => { apiRef.current = apiValues }, [apiValues])

  // Load cells once (shared promise — all floors reuse same grid geometry)
  useEffect(() => {
    _CELLS_PROMISE.then(setCells)
  }, [])

  // Animation loop — restarts only when cells or floorIdx changes
  useEffect(() => {
    if (!cells.length) return
    const seed = FLOOR_SEEDS[floorIdx] ?? FLOOR_SEEDS[0]
    const cellZone = _buildCellZoneMap(cells)
    const rowVals = [...new Set(cells.map(([r]) => r))]
    const colVals = [...new Set(cells.map(([,c]) => c))]
    const minR = Math.min(...rowVals), maxR = Math.max(...rowVals)
    const minC = Math.min(...colVals), maxC = Math.max(...colVals)

    simRef.current = {
      zones: {
        A: 0.44 + floorIdx * 0.01,
        B: 0.62 + floorIdx * 0.008,
        C: 0.79 + floorIdx * 0.006,
      },
      cellNoise: cells.map((_, i) =>
        Math.sin((i + 3) * 12.9898 + (floorIdx + 1) * 78.233) * 0.5 + 0.5
      ),
      minR, maxR, minC, maxC,
    }

    let t = seed.t0
    let running = true
    function draw() {
      t += 0.013
      const ext = apiRef.current   // real API data (null while not yet available)
      const sim = simRef.current
      const hasCellPayload = !!(ext && (Array.isArray(ext) || ArrayBuffer.isView(ext)))
      const zonePayload = ext && !Array.isArray(ext) && !ArrayBuffer.isView(ext) ? (ext.zones ?? ext) : null
      const hasZonePayload = !!(zonePayload && ['A', 'B', 'C'].some(k => Number.isFinite(zonePayload[k])))
      const isCellPayloadSparse = (() => {
        if (!hasCellPayload) return false
        const n = Math.min(cells.length, ext.length ?? 0)
        if (n <= 0) return true
        let count = 0, nonZero = 0, sum = 0
        for (let i = 0; i < n; i++) {
          const v = Number(ext[i])
          if (!Number.isFinite(v)) continue
          const vv = _clamp01(v)
          sum += vv
          count += 1
          if (vv > 0.03) nonZero += 1
        }
        if (count === 0) return true
        return (sum / count) < 0.08 || (nonZero / count) < 0.08
      })()

      if (!ext && sim) {
        // Camera-like behavior: zones drift slowly and react like occupancy waves.
        const pulse1 = Math.max(0, Math.sin(t * 0.22 + floorIdx * 0.7))
        const pulse2 = Math.max(0, Math.sin(t * 0.16 + 1.8 + floorIdx * 0.55))
        const targets = {
          A: _clamp01(0.40 + 0.18 * pulse1 + 0.07 * Math.sin(t * 0.41 + 0.5)),
          B: _clamp01(0.58 + 0.16 * pulse2 + 0.05 * Math.sin(t * 0.37 + 1.1)),
          C: _clamp01(0.76 + 0.12 * pulse1 + 0.04 * Math.sin(t * 0.29 + 2.2)),
        }
        const follow = 0.05
        sim.zones.A += (targets.A - sim.zones.A) * follow
        sim.zones.B += (targets.B - sim.zones.B) * follow
        sim.zones.C += (targets.C - sim.zones.C) * follow
      }

      for (let idx = 0; idx < cells.length; idx++) {
        let h
        if (hasCellPayload && !zonePayload && !isCellPayloadSparse) {
          // ── REAL DATA: value already normalized 0..1 ──────────────────
          // TODO: replace mock with: const res = await fetch(`/api/heatmap/floor/${floorIdx}`)
          //       then setFloorApiData(floorIdx, new Float32Array(res.json().values))
          h = _clamp01(ext[idx] ?? 0)
        } else if (hasZonePayload || sim) {
          // Zone payload path (ready for camera API): { A:0..1, B:0..1, C:0..1 } or { zones:{...} }
          const [r, c] = cells[idx]
          const zone = cellZone.get(`${r},${c}`) ?? 'B'
          const srcZones = hasZonePayload ? {
            A: _clamp01(Number.isFinite(zonePayload.A) ? zonePayload.A : sim.zones.A),
            B: _clamp01(Number.isFinite(zonePayload.B) ? zonePayload.B : sim.zones.B),
            C: _clamp01(Number.isFinite(zonePayload.C) ? zonePayload.C : sim.zones.C),
          } : sim.zones

          const nr = sim.maxR === sim.minR ? 0 : (r - sim.minR) / (sim.maxR - sim.minR)
          const nc = sim.maxC === sim.minC ? 0 : (c - sim.minC) / (sim.maxC - sim.minC)
          const travel = Math.sin((nr * 6.2 - t * 1.35) + nc * 1.8 + floorIdx * 0.35) * 0.05
          const swirl = Math.cos((nc * 8.4 + t * 0.95) - nr * 2.1) * 0.04
          const grain = (sim.cellNoise[idx] - 0.5) * 0.035
          h = _clamp01(srcZones[zone] + travel + swirl + grain)

          // Keep floor 1 readable if API for this floor is sparse/incomplete.
          if (floorIdx === 0 && (!hasZonePayload && (!hasCellPayload || isCellPayloadSparse))) {
            h = _clamp01(h + 0.08)
          }
        } else {
          // Fallback legacy mock.
          const [r, c] = cells[idx]
          const zone = cellZone.get(`${r},${c}`) ?? 'B'
          const zp = ZONE_PROFILES[zone]
          const base = (
            Math.sin(r*seed.fa + c*seed.fb + t)      * 0.40 +
            Math.cos(r*seed.fc - c*seed.fd + t*1.3)  * 0.35 +
            Math.sin((r-c)*seed.fe + t*0.75)          * 0.25 + 1
          ) / 2
          const zoneWave = Math.sin((r + c) * 0.08 + t * zp.drift) * zp.wave
          h = _clamp01(zp.center + (base - 0.5) * zp.amp + zoneWave)
        }

        if (!Number.isFinite(h)) h = 0.55
        if (floorIdx === 0) h = Math.max(h, 0.20)
        const poly = polyRefs.current[idx]
        if (poly) {
          const paletteIdx = Math.max(0, Math.min(HEAT_PALETTE.length - 1, Math.round(h * (HEAT_PALETTE.length - 1))))
          poly.setAttribute('fill', HEAT_PALETTE[paletteIdx])
        }
      }
      if (running) raf.current = requestAnimationFrame(draw)
    }
    draw()
    return () => { running = false; cancelAnimationFrame(raf.current) }
  }, [cells, floorIdx])

  // Inline SVG — same viewBox as the source SVG → exact coordinate match, no scaling
  return (
    <svg
      viewBox="0 0 2547 2398"
      style={{
        position:'absolute', top:0, left:0,
        width:'100%', height:'100%',
        transform:'translateX(2%) translateY(9%)',
        pointerEvents:'none',
        opacity, transition:'opacity 0.4s ease',
        mixBlendMode:'multiply',
        overflow:'visible',
      }}
    >
      {cells.map(([r,c,x0,y0,x1,y1,x2,y2,x3,y3], idx) => (
        <polygon
          key={`${r}-${c}`}
          ref={el => { polyRefs.current[idx] = el }}
          points={`${x0},${y0} ${x1},${y1} ${x2},${y2} ${x3},${y3}`}
          fill="transparent"
        />
      ))}
    </svg>
  )
}

// ── 8-bit pixel skeleton (shown while floor images load) ────────────────────
function PixelSkeleton({ show }) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 50,
        transition: 'opacity 0.7s ease',
        opacity: show ? 1 : 0,
        pointerEvents: show ? 'auto' : 'none',
        overflow: 'hidden',
        borderRadius: 4,
      }}
    >
      {/* Checkerboard pixel background */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'repeating-conic-gradient(#17031d 0% 25%, #0b0213 0% 50%)',
        backgroundSize: '8px 8px',
      }}/>
      {/* Scan line sweep */}
      <div className="pixel-scan" style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, transparent 0%, rgba(255,184,0,0.18) 50%, transparent 100%)',
        backgroundSize: '100% 60px',
      }}/>
      {/* Floor placeholder bars */}
      {[0,1,2,3,4,5].map(i => (
        <div key={i} style={{
          position: 'absolute',
          left: '8%',
          top: `${10 + i * 14}%`,
          width: '84%',
          height: '9%',
          backgroundImage: 'repeating-conic-gradient(#25063a 0% 25%, #160330 0% 50%)',
          backgroundSize: '4px 4px',
          border: '1px solid rgba(255,184,0,0.3)',
        }}/>
      ))}
      {/* 8-bit loading text */}
      <div className="pixel-blink" style={{
        position: 'absolute', bottom: 10, left: '50%',
        transform: 'translateX(-50%)',
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: 10,
        color: '#FFB800',
        letterSpacing: 4,
        textShadow: '0 0 6px rgba(255,184,0,0.8)',
        whiteSpace: 'nowrap',
      }}>
        ▓ LOADING ▓
      </div>
    </div>
  )
}

const BUU_ROOMS = [
  { id: 'ห้อง101โถงชั้น1', label: 'ห้อง 101', shortLabel: '101',
    img: '/Floorplan/Floor1plan.png', heatmap: '/Floorplan/HeatmapgridFloor1.svg',
    apiBase: 'https://momatdeerbn-production.up.railway.app', device: 'pm_deer' },
  { id: 'ห้อง200', label: 'ห้อง 200', shortLabel: '200',
    img: '/Floorplan/Floor2plan.png', heatmap: '/Floorplan/HeatmapgridFloor2.svg',
    apiBase: 'https://momaysandbn-production.up.railway.app', device: 'pm_sand' },
  { id: 'ห้อง300', label: 'ห้อง 300', shortLabel: '300',
    img: '/Floorplan/Floor3plan.png', heatmap: '/Floorplan/HeatmapgridFloor3.svg',
    apiBase: 'https://momaysandbn-production.up.railway.app', device: 'pm_sand' },
]
const FLOORS = BUU_ROOMS

const FLOOR_TRACK_PRESET = {
  'ห้อง101โถงชั้น1': { people: 55 },
  'ห้อง200':          { people: 63 },
  'ห้อง300':          { people: 70 },
}

function getDonutColor(value) {
  const pct = Number(value) || 0
  if (pct >= 85) return '#ef4444'
  if (pct >= 70) return '#f97316'
  if (pct >= 40) return '#f59e0b'
  return '#10b981'
}

function DonutMetric({ color, value, Icon, size = 86 }) {
  const svgSize = 100
  const ringSize = size

  return (
    <div
      style={{
        width: size + 6,
        height: size + 6,
        position: 'relative',
        filter: `drop-shadow(0 0 8px ${color}66)`,
      }}
    >
      <svg viewBox="0 0 100 100" width={size + 6} height={size + 6} style={{ display: 'block' }}>
        <circle cx="50" cy="50" r="48" fill="#051715" className="transition-colors duration-300" />
        <g transform="rotate(-90 50 50)">
          <circle cx="50" cy="50" r="36" fill="none" stroke={color} strokeWidth="7" strokeDasharray="52.55 173.64" strokeDashoffset="0" />
          <circle cx="50" cy="50" r="36" fill="none" stroke={color} strokeWidth="7" strokeDasharray="52.55 173.64" strokeDashoffset="-56.55" opacity={value >= 25 ? 1 : 0.25} />
          <circle cx="50" cy="50" r="36" fill="none" stroke={color} strokeWidth="7" strokeDasharray="52.55 173.64" strokeDashoffset="-113.1" opacity={value >= 50 ? 1 : 0.25} />
          <circle cx="50" cy="50" r="36" fill="none" stroke={color} strokeWidth="7" strokeDasharray="52.55 173.64" strokeDashoffset="-169.65" opacity={value >= 75 ? 1 : 0.25} />
        </g>
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 0,
          pointerEvents: 'none',
        }}
      >
        <div style={{ width: ringSize * 0.42, height: ringSize * 0.42, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={Math.round(ringSize * 0.34)} color={color} strokeWidth={2.2} style={{ filter: `drop-shadow(0 0 6px ${color}77)` }} />
        </div>
        <div style={{ color: color, fontSize: Math.max(11, Math.round(size * 0.13)), fontWeight: 900, lineHeight: 1, marginTop: -1, textShadow: `0 0 8px ${color}66` }}>
          {value}%
        </div>
      </div>
    </div>
  )
}

function FloorTrackCard({ floorLabel, people, side, donutSize = 86, isSingle = false, connectorLength = 24 }) {
  const color = getDonutColor(people)
  const labelLineOffset = 28
  const labelVerticalOffset = -6
  const labelStyle = side === 'left'
    ? { position: 'absolute', top: '50%', transform: `translateY(calc(-50% + ${labelVerticalOffset}px))`, left: donutSize + labelLineOffset, color: '#d1d5db', fontSize: 10, letterSpacing: 0.5, whiteSpace: 'nowrap' }
    : { position: 'absolute', top: '50%', transform: `translateY(calc(-50% + ${labelVerticalOffset}px))`, right: donutSize + labelLineOffset, color: '#d1d5db', fontSize: 10, letterSpacing: 0.5, textAlign: 'right', whiteSpace: 'nowrap' }

  if (isSingle) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ color: '#d1d5db', fontSize: 10, letterSpacing: 0.5 }}>{floorLabel}</div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <DonutMetric color={color} value={people} Icon={Users} size={donutSize} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minHeight: donutSize + 6 }}>
      <div style={labelStyle}>{floorLabel}</div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
      {side === 'right' && <div style={{ width: connectorLength, height: 1, background: color, opacity: 0.65 }} />}
      <DonutMetric color={color} value={people} Icon={Users} size={donutSize} />
      {side === 'left' && <div style={{ width: connectorLength, height: 1, background: color, opacity: 0.65 }} />}
      </div>
    </div>
  )
}

function TotalTrackCard({ people }) {
  const color = getDonutColor(people)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ color: '#d1d5db', fontSize: 10, letterSpacing: 0.5 }}>Total</div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <DonutMetric color={color} value={people} Icon={Users} size={104} />
      </div>
    </div>
  )
}

// ── Momay shared helpers (ported exactly from script.js) ─────────────────
const MOMAY_API = 'https://momatdeerbn-production.up.railway.app'

function _localDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
function _bkkToday() { return _localDateStr(new Date()) }
function _addDaysStr(d, n) {
  const dt = new Date(d + 'T00:00:00'); dt.setDate(dt.getDate() + n)
  return _localDateStr(dt)
}

// In-memory cache keyed by local date (same as script.js dailyDataCache)
const _dailyCache = {}

// Exact port of script.js fetchDailyData — UTC window fetch + localStorage TTL cache
async function _fetchEnergyForDate(date) {
  // accept both Date object and YYYY-MM-DD string
  const dateObj = (date instanceof Date) ? date : new Date(date + 'T00:00:00')
  const localKey = _localDateStr(dateObj)
  const storageKey = `momayDailyData-${localKey}`
  const STORAGE_TTL = 1000 * 60 * 15 // 15 min

  if (_dailyCache[localKey]) return _dailyCache[localKey]

  // localStorage fast-path (same as script.js)
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.ts && (Date.now() - parsed.ts < STORAGE_TTL)) {
        _dailyCache[localKey] = parsed.data || []
        // background refresh
        ;(async () => {
          try {
            const fresh = await _fetchFromNetwork(dateObj)
            _dailyCache[localKey] = fresh
            localStorage.setItem(storageKey, JSON.stringify({ ts: Date.now(), data: fresh }))
          } catch { /* ignore */ }
        })()
        return _dailyCache[localKey]
      }
    }
  } catch { /* ignore storage errors */ }

  // network fetch
  try {
    const data = await _fetchFromNetwork(dateObj)
    _dailyCache[localKey] = data
    try { localStorage.setItem(storageKey, JSON.stringify({ ts: Date.now(), data })) } catch { /* ignore */ }
    return data
  } catch {
    return []
  }
}

// Fetch the UTC date window covering this local date (exact script.js logic)
async function _fetchFromNetwork(dateObj) {
  const localMidnight = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())
  const utcStart = new Date(localMidnight.getTime() - (localMidnight.getTimezoneOffset() * 60000))
  const utcEnd   = new Date(utcStart.getTime() + 24 * 3600 * 1000 - 1)
  const startUTC = utcStart.toISOString().split('T')[0]
  const endUTC   = utcEnd.toISOString().split('T')[0]
  const fetchDates = (startUTC === endUTC) ? [startUTC] : [startUTC, endUTC]

  let combined = []
  for (const ds of fetchDates) {
    try {
      const r = await fetch(`${MOMAY_API}/daily-energy/pm_deer?date=${ds}`)
      const j = await r.json()
      combined = combined.concat(j.data ?? [])
    } catch { /* ignore per-day failure */ }
  }
  return combined.filter(it => {
    try { const ts = new Date(it.timestamp); return ts >= utcStart && ts <= utcEnd } catch { return false }
  })
}

// ── Power Chart — exact script.js logic, dark purple styled ──────────────
// datasets: [0]=Total [1]=Max [2]=Avg [3]=PhaseA [4]=PhaseB [5]=PhaseC
function _downsample1440(raw1440) {
  const factor = Math.ceil(1440 / 360)
  const out = []
  for (let i = 0; i < 1440; i += factor) {
    let peak = null
    for (let j = i; j < Math.min(i + factor, 1440); j++) {
      const v = raw1440[j]
      if (v !== null && (peak === null || v > peak)) peak = v
    }
    out.push(peak)
  }
  return out
}

function _buildLabels360() {
  const factor = Math.ceil(1440 / 360)
  const out = []
  for (let i = 0; i < 1440; i += factor)
    out.push(`${String(Math.floor(i/60)).padStart(2,'0')}:${String(i%60).padStart(2,'0')}`)
  return out
}

// ── Booking Popup ─────────────────────────────────────────────────────────────
const BOOKING_SLOTS = []
for (let h = 7; h <= 21; h++) {
  for (const m of ['00', '30']) BOOKING_SLOTS.push(`${String(h).padStart(2,'0')}:${m}`)
}
const BOOKING_TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, '0')
  const m = i % 2 === 0 ? '00' : '30'
  return `${h}:${m}`
})

function _bkkTodayStr() {
  const now = new Date(Date.now() + 7 * 3600000)
  return now.toISOString().split('T')[0]
}
function _addDay(d, n) {
  const dt = new Date(d + 'T00:00:00')
  dt.setDate(dt.getDate() + n)
  return dt.toISOString().split('T')[0]
}
function _fmtBookingDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Calendar Popup — original MomayBUUV.pm cream/gold style ─────────────────
const MOMAY_CREAM_BG   = 'linear-gradient(180deg,#f8f6f0 0%,#fffef8 45%,#fff8e8 55%,#f5f0e5 100%)'
const MOMAY_GOLD_BORDER = '3px solid #74640a'
const MOMAY_SHADOW      = '1px 1px 0 #000,-4px 3px #3b3305,0 0 12px rgba(255,230,160,0.55)'
const MOMAY_SHADOW_BIG  = '1px 1px 0 #000,-8px 6px #3b3305,0 0 20px rgba(255,230,160,0.55)'
const MOMAY_TEXT_COLOR  = '#2c1810'
const MOMAY_TEXT_SHADOW = '0 1px 0 rgba(255,255,255,0.3),0 -1px 0 rgba(0,0,0,0.1)'

function MomayCalendarPopup({ open, onClose, room }) {
  const today = new Date()
  const [year, setYear]       = useState(today.getFullYear())
  const [month, setMonth]     = useState(today.getMonth() + 1)
  const [events, setEvents]   = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected]   = useState(null)
  const [dayDetail, setDayDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const base = BUU_ROOMS.find(r => r.id === room)?.apiBase ?? MOMAY_API

  useEffect(() => {
    if (!open) return
    setLoading(true)
    const monthParam = String(month).padStart(2, '0')
    fetch(`${base}/calendar?year=${year}&month=${monthParam}`)
      .then(r => r.json())
      .then(data => {
        const normalized = (data || []).map(e => {
          let parsed = {}
          try { parsed = typeof e.body === 'string' ? JSON.parse(e.body) : (e.body || {}) } catch {}
          const billRaw   = parsed.electricity_bill ?? parsed.bill   ?? e.electricity_bill ?? e.bill   ?? null
          const energyRaw = parsed.energy_kwh        ?? parsed.energy ?? e.energy_kwh        ?? e.energy ?? null
          const bill   = billRaw   !== null ? Number(billRaw)   : null
          const energy = energyRaw !== null ? Number(energyRaw) : null
          let startVal = e.start || e.date || e.datetime || e.timestamp || e.day || parsed.date || null
          if (startVal) { const t = new Date(startVal); if (!isNaN(t)) startVal = t.toISOString() }
          return { start: startVal, bill, energy }
        })
        setEvents(normalized)
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }, [open, year, month, base])

  if (!open) return null

  const DAYS_EN   = ['SUN','MON','TUE','WED','THU','FRI','SAT']
  const MONTHS_EN = ['','January','February','March','April','May','June','July','August','September','October','November','December']
  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y-1) } else setMonth(m => m-1) }
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y+1) } else setMonth(m => m+1) }
  const firstDay   = new Date(year, month-1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells = [...Array(firstDay).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const eventForDay = d => {
    if (!d) return null
    const ds = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    return events.find(e => e.start?.startsWith(ds)) ?? null
  }

  const clickDay = async d => {
    if (!d) return
    const ds = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    setSelected(ds); setDayDetail(null); setDetailLoading(true)
    try {
      const r = await fetch(`${base}/daily-bill?date=${ds}`)
      const j = await r.json()
      const bill = j.electricity_bill ?? 0
      setDayDetail({ bill: bill.toFixed(2), unit: (bill / 4.4).toFixed(2), date: ds })
    } catch {
      setDayDetail({ bill: '--', unit: '--', date: ds })
    }
    setDetailLoading(false)
  }

  const navBtn = { background:MOMAY_CREAM_BG, border:MOMAY_GOLD_BORDER, borderRadius:10, color:MOMAY_TEXT_COLOR, fontWeight:700, fontSize:16, padding:'4px 14px', cursor:'pointer', boxShadow:MOMAY_SHADOW, textShadow:MOMAY_TEXT_SHADOW }

  return (
    <div style={{ position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',padding:12 }}>
      <div style={{ background:MOMAY_CREAM_BG, border:'6px solid #74640a', borderRadius:12, width:'100%', maxWidth:520, maxHeight:'90vh', overflow:'auto', padding:'18px 16px', display:'flex', flexDirection:'column', gap:12, boxShadow:MOMAY_SHADOW_BIG, fontFamily:'"Roboto",sans-serif' }}>

        {/* Month nav */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <button onClick={prevMonth} style={navBtn}>&lt;</button>
          <span style={{ background:MOMAY_CREAM_BG, border:MOMAY_GOLD_BORDER, borderRadius:10, padding:'4px 18px', fontWeight:700, fontSize:15, color:MOMAY_TEXT_COLOR, boxShadow:MOMAY_SHADOW, textShadow:MOMAY_TEXT_SHADOW }}>
            {MONTHS_EN[month]} {year}
          </span>
          <button onClick={nextMonth} style={navBtn}>&gt;</button>
        </div>

        {loading && <div style={{ color:'#74640a',textAlign:'center',padding:16,fontWeight:700 }}>Loading...</div>}

        {!loading && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
            {DAYS_EN.map(d => (
              <div key={d} style={{ background:'#e8e0c0', border:'1px solid #c4a84a', color:MOMAY_TEXT_COLOR, fontSize:9, fontWeight:800, textAlign:'center', padding:'4px 0', letterSpacing:0.5 }}>{d}</div>
            ))}
            {cells.map((d,i) => {
              const ev = eventForDay(d)
              const isToday    = d===today.getDate()&&month===today.getMonth()+1&&year===today.getFullYear()
              const ds         = d ? `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}` : ''
              const isSelected = selected === ds
              const hasBill    = ev && ev.bill !== null
              const hasEnergy  = ev && ev.energy !== null
              return (
                <div key={i} onClick={() => clickDay(d)} style={{
                  minHeight: 60,
                  background: isSelected ? '#fff3cc' : isToday ? '#fffbe6' : '#fff',
                  border: isSelected ? '2px solid #74640a' : isToday ? '2px solid #c4a84a' : '1px solid #d4c47a',
                  cursor: d ? 'pointer' : 'default',
                  display: 'flex', flexDirection: 'column', padding: '4px 3px',
                  boxSizing: 'border-box',
                }}>
                  {d && (
                    <>
                      <span style={{ color: hasBill?'#5a2b00':isToday?'#74640a':'#888', fontSize:13, fontWeight:700, lineHeight:1.2, alignSelf:'flex-end', paddingRight:2 }}>{d}</span>
                      {hasEnergy && <div style={{ color:'#333', fontSize:9, fontWeight:600, lineHeight:1.3, marginTop:'auto' }}>{Number(ev.energy).toFixed(2)} Unit</div>}
                      {hasBill   && <div style={{ color:'#5a2b00', fontSize:9, fontWeight:800, lineHeight:1.3 }}>{Number(ev.bill).toFixed(2)} B</div>}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {selected && (
          <div style={{ background:MOMAY_CREAM_BG, border:'6px solid #74640a', borderRadius:10, padding:'12px 18px', boxShadow:MOMAY_SHADOW, display:'flex', gap:20, justifyContent:'center', alignItems:'center' }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:11, color:'#8a6030', marginBottom:2 }}>ค่าไฟฟ้า</div>
              {detailLoading
                ? <div style={{ fontSize:13, color:'#74640a', fontWeight:700 }}>Loading...</div>
                : <div style={{ fontSize:22, fontWeight:800, color:'#5a2b00', textShadow:MOMAY_TEXT_SHADOW }}>{dayDetail?.bill} <span style={{fontSize:12}}>THB</span></div>}
            </div>
            <div style={{ width:1, height:40, background:'#c4a84a' }} />
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:11, color:'#8a6030', marginBottom:2 }}>พลังงาน</div>
              {!detailLoading && <div style={{ fontSize:22, fontWeight:800, color:'#5a2b00', textShadow:MOMAY_TEXT_SHADOW }}>{dayDetail?.unit} <span style={{fontSize:12}}>Unit</span></div>}
            </div>
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'center' }}>
          <button onClick={onClose} style={{ ...navBtn, fontSize:13, padding:'6px 24px' }}>ปิด</button>
        </div>
      </div>
    </div>
  )
}

// ── Solar Popup — original MomayBUUV.pm kwangPopup circles style ────────────
function MomaySolarPopup({ open, onClose, room }) {
  const [date, setDate]             = useState(_bkkTodayStr)
  const [data, setData]             = useState(null)
  const [loading, setLoading]       = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportData, setReportData] = useState(null)
  const [generating, setGenerating] = useState(false)
  const reportRef  = useRef(null)
  const chartRef   = useRef(null)
  const chartInstRef = useRef(null)

  const base = BUU_ROOMS.find(r => r.id === room)?.apiBase ?? MOMAY_API

  useEffect(() => {
    if (!open) return
    setLoading(true); setData(null)
    fetch(`${base}/solar-size?date=${date}`)
      .then(r => r.json()).then(json => setData(json))
      .catch(() => setData(null)).finally(() => setLoading(false))
  }, [open, room, date, base])

  useEffect(() => {
    return () => { if (chartInstRef.current) { chartInstRef.current.destroy(); chartInstRef.current = null } }
  }, [])

  if (!open) return null

  const fmt2 = v => (v !== null && v !== undefined) ? Number(v).toFixed(2) : '--'
  const fmtL = v => (v !== null && v !== undefined) ? Number(v).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '--'

  const dayEnergy   = fmt2(data?.dayEnergy)
  const solarCap    = fmt2(data?.solarCapacity_kW)
  const savingsDay  = fmtL(data?.savingsDay)
  const savingsMonth = fmtL(data?.savingsMonth)

  function addDay(d, n) {
    const dt = new Date(d + 'T00:00:00'); dt.setDate(dt.getDate() + n); return dt.toISOString().split('T')[0]
  }

  const dateStr = (() => {
    const d = new Date(date+'T00:00:00')
    const pad = n => String(n).padStart(2,'0')
    const mm = ['January','February','March','April','May','June','July','August','September','October','November','December'][d.getMonth()]
    return `${pad(d.getDate())} - ${mm} - ${d.getFullYear()}`
  })()

  async function openReport() {
    setReportData(null)
    setReportOpen(true)
    try {
      const [solar, energyJson] = await Promise.all([
        fetch(`${base}/solar-size?date=${date}`).then(r => r.json()),
        fetch(`${base}/daily-energy/pm_deer?date=${date}`).then(r => r.json()),
      ])
      setReportData({ solar, energyData: energyJson?.data || [] })
    } catch (err) { console.error('prepareReportData failed:', err) }
  }

  async function captureReport() {
    if (!reportRef.current) return null
    const el = reportRef.current

    if (chartRef.current && reportData?.energyData) {
      if (chartInstRef.current) { chartInstRef.current.destroy(); chartInstRef.current = null }
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)
      const energyData = reportData.energyData
      const chartData = new Array(1440).fill(null)
      energyData.forEach(item => {
        const t = new Date(item.timestamp)
        const idx = t.getUTCHours() * 60 + t.getUTCMinutes()
        if (idx >= 0 && idx < 1440) chartData[idx] = item.active_power_total ?? item.power ?? item.power_active ?? null
      })
      let maxVal = null, maxIdx = null, sum = 0, count = 0
      chartData.forEach((v, i) => {
        if (v !== null) { if (maxVal === null || v > maxVal) { maxVal = v; maxIdx = i }; sum += v; count++ }
      })
      const avgVal = count > 0 ? sum / count : null
      const labels = Array.from({length:1440}, (_,i) => `${String(Math.floor(i/60)).padStart(2,'0')}:${String(i%60).padStart(2,'0')}`)
      const ctx = chartRef.current.getContext('2d')
      const grad = ctx.createLinearGradient(0,0,0,300)
      grad.addColorStop(0,'rgba(139,69,19,0.4)'); grad.addColorStop(0.5,'rgba(210,180,140,0.3)'); grad.addColorStop(1,'rgba(245,222,179,0.1)')
      chartInstRef.current = new Chart(ctx, {
        type:'line', data:{ labels, datasets:[
          { label:'Power', data:chartData, borderColor:'#8B4513', backgroundColor:grad, fill:true, borderWidth:0.5, tension:0.3, pointRadius:0.1 },
          { label:'Max', data:chartData.map((_,i)=>i===maxIdx?maxVal:null), borderColor:'#ff9999', pointRadius:5, pointBackgroundColor:'#ff9999', fill:false, showLine:false },
          { label:'Average', data:new Array(1440).fill(avgVal), borderColor:'#000', borderDash:[5,5], fill:false, pointRadius:0, borderWidth:1 },
        ]},
        options:{ responsive:false, animation:false, plugins:{legend:{display:true},tooltip:{enabled:false}},
          scales:{
            x:{type:'category',grid:{display:false},ticks:{autoSkip:false,color:'#000',maxRotation:0,callback:function(v){const l=this.getLabelForValue(v);if(!l)return'';const[h,m]=l.split(':');return m==='00'&&parseInt(h)%3===0?l:''}},title:{display:true,text:'Time (HH:MM)',color:'#000',font:{size:12,weight:'bold'}}},
            y:{grid:{display:false},beginAtZero:true,ticks:{color:'#000'},title:{display:true,text:'Power (kW)',color:'#000',font:{size:12,weight:'bold'}}},
          }
        }
      })
    }

    await new Promise(r => setTimeout(r, 500))
    el.style.position = 'fixed'; el.style.left = '-9999px'; el.style.top = '0'
    el.style.visibility = 'visible'; el.style.opacity = '1'
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(el, { scale:1.5, useCORS:true, logging:false, allowTaint:false })
    el.style.position = 'absolute'; el.style.left = '-9999px'
    el.style.visibility = 'hidden'; el.style.opacity = '0'
    return canvas
  }

  async function downloadReport() {
    setGenerating(true); setReportOpen(false)
    try {
      const canvas = await captureReport()
      if (!canvas) return
      canvas.toBlob(blob => {
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob); link.download = `KwangReport-${date}.png`
        link.click(); URL.revokeObjectURL(link.href)
      })
    } catch (err) { console.error('Download failed:', err) }
    finally { setGenerating(false) }
  }

  async function shareReport() {
    setGenerating(true); setReportOpen(false)
    try {
      const canvas = await captureReport()
      if (!canvas) return
      canvas.toBlob(async blob => {
        const file = new File([blob], `KwangReport-${date}.png`, { type:'image/png' })
        if (navigator.canShare && navigator.canShare({ files:[file] })) {
          await navigator.share({ files:[file], title:'Kwang Solar Report' })
        } else {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a'); a.href = url; a.download = `KwangReport-${date}.png`
          a.click(); URL.revokeObjectURL(url)
        }
      })
    } catch (err) { console.error('Share failed:', err) }
    finally { setGenerating(false) }
  }

  const s = reportData?.solar
  const hourly = s?.hourly || []

  const navBtn = { background:MOMAY_CREAM_BG, border:MOMAY_GOLD_BORDER, borderRadius:10, color:MOMAY_TEXT_COLOR, fontWeight:700, fontSize:18, padding:'4px 12px', cursor:'pointer', boxShadow:MOMAY_SHADOW, textShadow:MOMAY_TEXT_SHADOW }
  const pillStyle = { background:MOMAY_CREAM_BG, border:'6px solid #74640a', borderRadius:10, padding:'6px 14px', fontWeight:700, fontSize:16, color:MOMAY_TEXT_COLOR, textAlign:'center', boxShadow:'inset 0 0 5px rgba(0,0,0,0.15),2px 2px 4px rgba(0,0,0,0.6),-4px 3px #3b3305,0 0 12px rgba(255,230,160,0.55)', textShadow:'0 1px 0 rgba(255,255,255,0.3),1px 2px 4px rgba(0,0,0,0.6)', width:'100%', boxSizing:'border-box' }
  const circleStyle = { width:130, height:130, borderRadius:'50%', background:'radial-gradient(circle at 30% 30%,#f8f6f0,#fffef8 45%,#fff8e8 55%,#f5f0e5 100%)', border:'3px solid #74640a', boxShadow:'inset 0 0 5px rgba(0,0,0,0.15),1px 1px 0 #000,-4px 3px #3b3305,0 0 12px rgba(255,230,160,0.55)', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', color:MOMAY_TEXT_COLOR, fontWeight:'bold', textAlign:'center', textShadow:MOMAY_TEXT_SHADOW, cursor:'default' }

  return (
    <>
      <div style={{ position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
        <div style={{ position:'relative', background:MOMAY_CREAM_BG, border:'6px solid #74640a', borderRadius:12, width:'100%', maxWidth:320, padding:'20px 22px', display:'flex', flexDirection:'column', alignItems:'center', gap:14, boxShadow:MOMAY_SHADOW_BIG, fontFamily:'"Roboto",sans-serif', overflow:'visible' }}>

          {/* KWANG logo badge (top-right) */}
          <div style={{ position:'absolute', top:-6, right:-6, zIndex:1 }}>
            <img src="/images/Kwang_icon.png" alt="Kwang" style={{ width:52, height:52, objectFit:'contain', filter:'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }} />
          </div>

          {/* Date nav */}
          <div style={{ display:'flex', alignItems:'center', gap:6, width:'100%', justifyContent:'center' }}>
            <button onClick={() => setDate(d => addDay(d,-1))} style={navBtn}>&lt;</button>
            <span
              onClick={() => {
                const inp = Object.assign(document.createElement('input'),{type:'date',value:date})
                Object.assign(inp.style,{position:'absolute',opacity:'0'})
                document.body.appendChild(inp); inp.focus(); inp.click()
                inp.onchange = () => { setDate(inp.value); document.body.removeChild(inp) }
              }}
              style={{ background:MOMAY_CREAM_BG, border:MOMAY_GOLD_BORDER, borderRadius:10, padding:'4px 8px', fontWeight:700, fontSize:13, color:MOMAY_TEXT_COLOR, textAlign:'center', boxShadow:MOMAY_SHADOW, textShadow:MOMAY_TEXT_SHADOW, cursor:'pointer', flex:1 }}
            >{dateStr}</span>
            <button onClick={() => setDate(d => addDay(d,1))} style={navBtn}>&gt;</button>
          </div>

          {loading ? (
            <div style={{ color:'#74640a', fontWeight:700, padding:20 }}>Loading...</div>
          ) : (
            <>
              {/* Two circles */}
              <div style={{ display:'flex', gap:18, justifyContent:'center', alignItems:'center', width:'100%' }}>
                <div style={circleStyle}>
                  <img src="/images/home-icon.png" alt="home" style={{ width:30, height:30, objectFit:'contain', marginBottom:4 }} />
                  <div style={{ fontSize:13, fontWeight:800 }}>{dayEnergy} Unit</div>
                </div>
                <div style={circleStyle}>
                  <img src="/images/solar-cell-icon.png" alt="solar" style={{ width:36, height:36, objectFit:'contain', marginBottom:4 }} />
                  <div style={{ fontSize:13, fontWeight:800 }}>{solarCap} kW</div>
                </div>
              </div>

              {/* Daily / Monthly savings pills */}
              <div style={pillStyle}>Daily Savings: {savingsDay} THB</div>
              <div style={pillStyle}>Monthly Savings: {savingsMonth} THB</div>
            </>
          )}

          {/* Kwang banner */}
          <img src="/images/Kwang_baner.png" alt="Kwang" width="64" height="113" style={{ objectFit:'contain' }} />

          {/* Share / Generate Report icon */}
          <img
            src="/images/share.png"
            alt="Generate Report"
            onClick={openReport}
            style={{ width:30, height:30, cursor:'pointer', paddingTop:4 }}
          />
        </div>
      </div>

      {/* Report Action Modal */}
      {reportOpen && (
        <div
          style={{ position:'fixed',inset:0,zIndex:999999,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}
          onClick={e => { if (e.target === e.currentTarget) setReportOpen(false) }}
        >
          <div style={{ background:MOMAY_CREAM_BG, border:'6px solid #74640a', borderRadius:12, width:'100%', maxWidth:280, padding:'20px 22px', boxShadow:MOMAY_SHADOW_BIG, fontFamily:'"Roboto",sans-serif', display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ textAlign:'center', fontWeight:700, fontSize:16, color:MOMAY_TEXT_COLOR }}>Export Report</div>
            <div style={{ fontSize:12, color:'#74640a', textAlign:'center' }}>
              {reportData ? 'Choose how you want to export your report' : 'Preparing report data…'}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button
                onClick={downloadReport}
                disabled={!reportData || generating}
                style={{ flex:1, background:MOMAY_CREAM_BG, border:'3px solid #74640a', borderRadius:8, padding:'10px 6px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4, color:MOMAY_TEXT_COLOR, fontWeight:700, fontSize:12, boxShadow:MOMAY_SHADOW, opacity:(!reportData||generating)?0.5:1 }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <span>{generating ? 'Generating…' : 'Download'}</span>
                <span style={{ fontSize:10, fontWeight:400 }}>Save to device</span>
              </button>
              <button
                onClick={shareReport}
                disabled={!reportData || generating}
                style={{ flex:1, background:MOMAY_CREAM_BG, border:'3px solid #74640a', borderRadius:8, padding:'10px 6px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4, color:MOMAY_TEXT_COLOR, fontWeight:700, fontSize:12, boxShadow:MOMAY_SHADOW, opacity:(!reportData||generating)?0.5:1 }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
                <span>Share</span>
                <span style={{ fontSize:10, fontWeight:400 }}>Send to others</span>
              </button>
            </div>
            <button onClick={() => setReportOpen(false)} style={{ background:'none', border:'2px solid #74640a', borderRadius:8, padding:'6px 0', cursor:'pointer', color:MOMAY_TEXT_COLOR, fontWeight:700, fontSize:13 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Hidden report wrapper for html2canvas capture */}
      <div
        ref={reportRef}
        style={{ position:'absolute', left:'-9999px', top:0, visibility:'hidden', opacity:0, width:600, background:'#fffef5', padding:'16px 20px', fontFamily:'sans-serif', color:'#2c1810', fontSize:13, lineHeight:1.5 }}
      >
        <img src="/images/kwang_logo_report.png" alt="Kwang Report" crossOrigin="anonymous" style={{ width:'100%', maxWidth:213, height:'auto', display:'block', marginLeft:-20 }} />
        <p>Client Name: <span>Naresuan University Library</span></p>
        <p>Date: <span>{dateStr}</span></p>
        <p>Electricity usage (within 1 day): <strong>{fmt2(s?.totalEnergyKwh ?? data?.totalEnergyKwh)} Unit</strong></p>
        <p style={{ paddingBottom:10 }}>Electricity Bill (within 1 day): <strong>{fmt2(s?.totalCost ?? data?.totalCost)} THB</strong></p>
        <div style={{ display:'flex', gap:10 }}>
          <div style={{ flex:1 }}>
            <p>Electricity usage (06:00AM–18:00PM): <strong>{fmt2(s?.dayEnergy ?? data?.dayEnergy)} Unit</strong></p>
            <p>Recommended Solar Cell Installation: <strong>{fmt2(s?.solarCapacity_kW ?? data?.solarCapacity_kW)} kW</strong></p>
            <p>Daily savings: <strong>{fmt2(s?.savingsDay ?? data?.savingsDay)} THB</strong></p>
            <p>Monthly savings: <strong>{fmtL(s?.savingsMonth ?? data?.savingsMonth)} THB</strong></p>
          </div>
          <div style={{ flex:1 }}>
            <p>Electricity usage (18:00PM–6:00AM): <strong>{fmt2(s?.nightEnergy ?? data?.nightEnergy)} Unit</strong></p>
          </div>
        </div>
        <div style={{ marginTop:20 }}>
          <canvas ref={chartRef} width="600" height="300" style={{ display:'block' }} />
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse', marginTop:10, fontSize:12 }}>
          <thead>
            <tr style={{ background:'#74640a', color:'#fff' }}>
              <th style={{ padding:'4px 8px', textAlign:'center' }}>Hour</th>
              <th style={{ padding:'4px 8px', textAlign:'center' }}>Energy (Unit)</th>
            </tr>
          </thead>
          <tbody>
            {hourly.length > 0
              ? hourly.map((h, i) => (
                  <tr key={i} style={{ background: i%2===0 ? '#fffef8' : '#f5f0e5' }}>
                    <td style={{ padding:'3px 8px', textAlign:'center' }}>{h.hour}</td>
                    <td style={{ padding:'3px 8px', textAlign:'center' }}>{h.energy_kwh}</td>
                  </tr>
                ))
              : <tr><td colSpan={2} style={{ textAlign:'center', padding:8 }}>No data</td></tr>
            }
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── Notification Popup — ported from script.js loadNotifications / renderNotifications ──
function MomayNotifPopup({ open, onClose, room }) {
  const [items, setItems]     = useState([])
  const [unread, setUnread]   = useState(0)
  const [loading, setLoading] = useState(false)

  const base = BUU_ROOMS.find(r => r.id === room)?.apiBase ?? MOMAY_API

  const load = () => {
    setLoading(true)
    fetch(`${base}/api/notifications/all?limit=50`)
      .then(r => r.json())
      .then(data => {
        if (data.success) { setItems(data.data || []); setUnread(data.unreadCount || 0) }
        else setItems([])
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (open) load() }, [open, base])

  const markRead = async (type, id) => {
    try {
      await fetch(`${base}/api/notifications/mark-read`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({type, ids:[id]})
      })
      load()
    } catch {}
  }

  const markAllRead = async () => {
    try { await fetch(`${base}/api/notifications/mark-all-read`,{method:'PATCH'}); load() } catch {}
  }

  if (!open) return null

  const fmtTs = iso => {
    if (!iso) return '-'
    const d = new Date(iso)
    const pad = n => String(n).padStart(2,'0')
    const MM = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]
    return `${pad(d.getUTCDate())} ${MM} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  }

  const renderBody = n => {
    let parsed = {}
    try { parsed = JSON.parse(n.body || '{}') } catch {}
    if (parsed.power !== undefined) {
      const val = Number(parsed.power) || 0
      return (
        <div style={{ marginTop:8 }}>
          <div style={{ fontSize:11,color:'#999',marginBottom:6 }}>Current peak power is {val.toFixed(2)} kW</div>
          <div style={{ background:'#fff2cc',padding:'10px 12px',borderRadius:8,border:'1px solid #f1dca3' }}>
            <div style={{ fontWeight:800,color:'#7b4f00',fontSize:16 }}>Peak Power: {val.toFixed(2)} kW</div>
          </div>
        </div>
      )
    }
    if (parsed.energy_kwh !== undefined || parsed.electricity_bill !== undefined) {
      const e    = Number(parsed.energy_kwh || 0).toFixed(2)
      const bill = Number(parsed.electricity_bill || 0).toFixed(2)
      const date = parsed.date || '-'
      return (
        <div style={{ marginTop:8 }}>
          <div style={{ fontSize:11,color:'#999',marginBottom:6 }}>Yesterday ({date})</div>
          <div style={{ background:'#dff0d8',padding:'10px 12px',borderRadius:8,border:'1px solid #c3e6cb',color:'#155724',fontSize:12 }}>
            <div style={{ fontSize:11 }}>Total Bill</div>
            <div style={{ fontWeight:800,fontSize:16,marginBottom:6 }}>{bill} THB</div>
            <div style={{ fontSize:11 }}>Energy</div>
            <div style={{ fontWeight:700,fontSize:14 }}>{e} Unit</div>
            <div style={{ marginTop:6,paddingTop:6,borderTop:'1px solid rgba(0,0,0,0.08)',fontSize:11,color:'#888' }}>Date: <strong style={{color:'#155724'}}>{date}</strong></div>
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div style={{ position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
      <div style={{ background:'#111',border:'1.5px solid rgba(255,184,0,0.4)',borderRadius:14,width:'100%',maxWidth:400,maxHeight:'85vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 0 40px rgba(0,0,0,0.8)' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 18px',borderBottom:'1px solid rgba(255,184,0,0.2)',flexShrink:0 }}>
          <div style={{ display:'flex',alignItems:'center',gap:10 }}>
            <img src="/images/Bell_icon.png" alt="" style={{ width:28,height:28,objectFit:'contain',filter:'drop-shadow(0 0 4px rgba(74,222,128,0.6))' }} />
            <span style={{ color:'#FFB800',fontWeight:800,fontSize:15 }}>การแจ้งเตือน</span>
            {unread > 0 && <span style={{ background:'#667eea',color:'#fff',borderRadius:'50%',width:18,height:18,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700 }}>{unread}</span>}
          </div>
          <div style={{ display:'flex',gap:8,alignItems:'center' }}>
            {unread > 0 && <button onClick={markAllRead} style={{ fontSize:10,color:'#667eea',background:'none',border:'none',cursor:'pointer' }}>อ่านทั้งหมด</button>}
            <button onClick={onClose} style={{ background:'none',border:'none',color:'#999',fontSize:18,cursor:'pointer' }}>✕</button>
          </div>
        </div>

        <div style={{ overflowY:'auto',padding:'10px 14px',display:'flex',flexDirection:'column',gap:8 }}>
          {loading && <div style={{ color:'#FFB800',fontSize:13,textAlign:'center',padding:20 }}>กำลังโหลด...</div>}
          {!loading && items.length === 0 && (
            <div style={{ textAlign:'center',padding:30,color:'#8a7060',fontSize:13 }}>
              <div style={{ fontSize:24,marginBottom:8 }}>🔔</div>
              ไม่มีการแจ้งเตือน
            </div>
          )}
          {items.map(n => (
            <div key={n._id}
              onClick={() => { if (!n.read) markRead(n.type, n._id) }}
              style={{ padding:'12px 14px',background:n.read?'#1a1a1a':'#1a1c2a',border:'1px solid',borderColor:n.read?'#2a2a2a':'#4a5a8a',borderRadius:12,cursor:'pointer',transition:'background .15s' }}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8 }}>
                <div style={{ fontFamily:'Georgia,serif',fontWeight:700,color:'#e8c97a',fontSize:14,marginBottom:2,flex:1 }}>{n.title||'(ไม่มีชื่อ)'}</div>
                {!n.read && <span style={{ width:9,height:9,background:'#667eea',borderRadius:'50%',display:'inline-block',marginTop:4,flexShrink:0 }} />}
              </div>
              {n.subtitle && <div style={{ fontSize:11,color:'#8a7f77' }}>{n.subtitle}</div>}
              {renderBody(n)}
              <div style={{ marginTop:8,textAlign:'right' }}>
                <small style={{ color:'#555',fontSize:10 }}>{fmtTs(n.timestamp)}</small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MomayBookingPopup({ open, onClose, room }) {
  const [date, setDate]       = useState(_bkkTodayStr)
  const [startTime, setStart] = useState('09:00')
  const [endTime, setEnd]     = useState('17:00')
  const [name, setName]       = useState('')
  const [purpose, setPurpose] = useState('')
  const [error, setError]     = useState('')
  const [busy, setBusy]       = useState(false)
  const [bookings, setBookings] = useState([])

  useEffect(() => {
    if (!open) return
    setError(''); setBusy(false)
    fetch(`${MOMAY_SERVER}/api/bookings?date=${date}&room=${encodeURIComponent(room)}`)
      .then(r => r.json()).then(j => setBookings(j.success ? j.data : [])).catch(() => setBookings([]))
  }, [open, date, room])

  if (!open) return null

  function slotBooked(slot) {
    return bookings.find(b => b.startTime <= slot && slot < b.endTime)
  }

  async function handleConfirm() {
    if (!name.trim()) { setError('กรุณากรอกชื่อผู้จอง'); return }
    if (startTime >= endTime) { setError('เวลาเริ่มต้องน้อยกว่าเวลาสิ้นสุด'); return }
    setBusy(true); setError('')
    try {
      const res = await fetch(`${MOMAY_SERVER}/api/bookings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room, date, startTime, endTime, bookerName: name.trim(), purpose: purpose.trim() }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'เกิดข้อผิดพลาด')
      setBookings(prev => [...prev, json.data])
      setName(''); setPurpose(''); setError('')
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const inp = { background: '#1a1a1a', border: '1px solid rgba(255,184,0,0.35)', borderRadius: 6, color: '#e8c97a', padding: '5px 8px', fontSize: 12, width: '100%', outline: 'none' }
  const btn = (accent) => ({ padding: '7px 18px', borderRadius: 8, border: `1px solid ${accent}`, background: `${accent}22`, color: accent, fontSize: 12, fontWeight: 700, cursor: 'pointer' })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#111', border: '1.5px solid rgba(255,184,0,0.4)', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 0 40px rgba(0,0,0,0.8)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: '#FFB800', fontWeight: 800, fontSize: 15 }}>จองห้อง: {BUU_ROOMS.find(r => r.id === room)?.label ?? room}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#999', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* Date nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
          <button onClick={() => setDate(d => _addDay(d, -1))} style={{ ...btn('#FFB800'), padding: '4px 10px' }}>&lt;</button>
          <span style={{ color: '#e8c97a', fontSize: 12, minWidth: 160, textAlign: 'center' }}>{_fmtBookingDate(date)}</span>
          <button onClick={() => setDate(d => _addDay(d, 1))} style={{ ...btn('#FFB800'), padding: '4px 10px' }}>&gt;</button>
        </div>

        {/* Schedule grid */}
        <div style={{ border: '1px solid rgba(255,184,0,0.2)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'flex', background: 'rgba(255,184,0,0.1)', padding: '6px 12px', borderBottom: '1px solid rgba(255,184,0,0.2)' }}>
            <span style={{ width: 52, color: '#FFB800', fontSize: 11, fontWeight: 700 }}>เวลา</span>
            <span style={{ flex: 1, color: '#FFB800', fontSize: 11, fontWeight: 700 }}>{BUU_ROOMS.find(r => r.id === room)?.label ?? room}</span>
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {BOOKING_SLOTS.map(slot => {
              const hit = slotBooked(slot)
              return (
                <div key={slot} style={{ display: 'flex', alignItems: 'center', padding: '5px 12px', borderBottom: '1px solid rgba(255,184,0,0.08)', background: hit ? 'rgba(255,100,0,0.12)' : 'transparent' }}>
                  <span style={{ width: 52, color: '#aaa', fontSize: 11 }}>{slot}</span>
                  <span style={{ flex: 1, color: hit ? '#f97316' : '#444', fontSize: 11 }}>{hit ? `${hit.bookerName} — ${hit.purpose || '-'}` : ''}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Form */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ color: '#8a7060', fontSize: 11 }}>เวลาเริ่ม</label>
            <select value={startTime} onChange={e => setStart(e.target.value)} style={inp}>
              {BOOKING_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ color: '#8a7060', fontSize: 11 }}>เวลาสิ้นสุด</label>
            <select value={endTime} onChange={e => setEnd(e.target.value)} style={inp}>
              {[...BOOKING_TIMES, '24:00'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ color: '#8a7060', fontSize: 11 }}>ชื่อผู้จอง</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="กรอกชื่อ" style={inp} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ color: '#8a7060', fontSize: 11 }}>วัตถุประสงค์</label>
            <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="กรอกวัตถุประสงค์" style={inp} />
          </div>
        </div>

        {error && <div style={{ color: '#f87171', fontSize: 12 }}>{error}</div>}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btn('#888')}>ยกเลิก</button>
          <button onClick={handleConfirm} disabled={busy} style={{ ...btn('#FFB800'), opacity: busy ? 0.6 : 1 }}>
            {busy ? 'กำลังจอง...' : 'ยืนยันการจอง'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MomayPowerChart({ onBookingClick, roomLabel = 'BUU Library' }) {
  const chartRef   = useRef(null)
  const chartInst  = useRef(null)
  const [curDate, setCurDate]       = useState(() => new Date())
  const [loading, setLoading]       = useState(false)
  const [phaseView, setPhaseView]   = useState(false)  // false=Total, true=Phase A/B/C

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const rows = await _fetchEnergyForDate(curDate)
        if (cancelled || !chartRef.current) return

        // 1440-pt arrays — exact script.js logic
        const rawTotal = new Array(1440).fill(null)
        const rawA     = new Array(1440).fill(null)
        const rawB     = new Array(1440).fill(null)
        const rawC     = new Array(1440).fill(null)
        let maxVal = null, maxIdx = 0, sum = 0, cnt = 0
        rows.forEach(item => {
          const t   = new Date(item.timestamp)
          // use UTC hours/minutes so data aligns with API timestamps (no local +7 shift) — exact script.js comment
          const idx = t.getUTCHours() * 60 + t.getUTCMinutes()
          if (idx < 0 || idx >= 1440) return
          const tv = item.active_power_total ?? item.power ?? item.power_active ?? null
          rawTotal[idx] = tv
          rawA[idx] = item.active_power_a !== undefined ? item.active_power_a : null
          rawB[idx] = item.active_power_b !== undefined ? item.active_power_b : null
          rawC[idx] = item.active_power_c !== undefined ? item.active_power_c : null
          if (tv !== null) { if (maxVal === null || tv > maxVal) { maxVal = tv; maxIdx = idx } sum += tv; cnt++ }
        })
        const avgVal = cnt > 0 ? sum / cnt : null

        // Downsample to 360 pts
        const factor = Math.ceil(1440 / 360)
        const labels  = _buildLabels360()
        const sTotal  = _downsample1440(rawTotal)
        const sA      = _downsample1440(rawA)
        const sB      = _downsample1440(rawB)
        const sC      = _downsample1440(rawC)
        const sMax    = sTotal.map((_, si) => {
          const wStart = si * factor, wEnd = Math.min(wStart + factor - 1, 1439)
          return (maxIdx >= wStart && maxIdx <= wEnd) ? maxVal : null
        })
        const sAvg = new Array(labels.length).fill(avgVal)

        // Canvas gradient for total power fill (exact script.js style)
        const canvas = chartRef.current
        const ctx2 = canvas.getContext('2d')
        const chartGradient = ctx2.createLinearGradient(0, 0, 0, 280)
        chartGradient.addColorStop(0, 'rgba(139,69,19,0.45)')
        chartGradient.addColorStop(0.5, 'rgba(210,180,140,0.3)')
        chartGradient.addColorStop(1, 'rgba(245,222,179,0.05)')

        const pv = phaseView
        if (chartInst.current) chartInst.current.destroy()
        chartInst.current = new Chart(chartRef.current, {
          type: 'line',
          data: {
            labels,
            datasets: [
              // [0] Total — brown/gold like script.js
              { label: 'Power',   data: sTotal, borderColor: '#C8860A', backgroundColor: chartGradient, fill: true,  borderWidth: 1.2, pointRadius: 0, tension: 0.3, spanGaps: true, hidden: pv },
              // [1] Max point — red dot like script.js
              { label: 'Max',     data: sMax,   borderColor: '#ff9999', backgroundColor: '#ff9999',     fill: false, borderWidth: 0,   pointRadius: 5, pointBackgroundColor: '#ff9999', showLine: false, hidden: pv },
              // [2] Average — dashed golden
              { label: 'Average', data: sAvg,   borderColor: 'rgba(218,165,32,0.75)', fill: false, borderWidth: 1, borderDash: [5,4], pointRadius: 0, hidden: pv },
              // [3] Phase A
              { label: 'Phase A', data: sA,     borderColor: '#ff4444', backgroundColor: 'rgba(255,68,68,0.06)', fill: false, borderWidth: 1.4, pointRadius: 0, tension: 0.3, spanGaps: true, hidden: !pv },
              // [4] Phase B
              { label: 'Phase B', data: sB,     borderColor: '#ffd700', backgroundColor: 'rgba(255,215,0,0.06)', fill: false, borderWidth: 1.4, pointRadius: 0, tension: 0.3, spanGaps: true, hidden: !pv },
              // [5] Phase C
              { label: 'Phase C', data: sC,     borderColor: '#1e90ff', backgroundColor: 'rgba(30,144,255,0.06)', fill: false, borderWidth: 1.4, pointRadius: 0, tension: 0.3, spanGaps: true, hidden: !pv },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false } },
            scales: {
              x: {
                type: 'category',
                grid: { display: false },
                ticks: {
                  autoSkip: false, maxRotation: 0, minRotation: 0,
                  color: '#888', font: { size: 10 },
                  callback: function(v) {
                    const l = this.getLabelForValue(v)
                    if (!l) return ''
                    const [h, m] = l.split(':')
                    const hour = parseInt(h, 10)
                    const idx = Number(v)
                    const len = this.chart?.data?.labels?.length ?? null
                    if (len !== null && idx === len - 1) return '24.00'
                    if (m === '00' && (hour % 3) === 0) return `${String(h).padStart(2,'0')}.00`
                    return ''
                  }
                }
              },
              y: {
                beginAtZero: true, min: 0,
                grid: { color: 'rgba(255,255,255,0.07)' },
                ticks: { color: '#888', font: { size: 10 } },
                title: { display: true, text: 'Power (kW)', color: '#888', font: { size: 10 } }
              },
            },
          },
        })
      } catch { /* ignore */ } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [curDate])

  // Toggle without re-fetch
  useEffect(() => {
    const c = chartInst.current
    if (!c) return
    const pv = phaseView
    c.data.datasets[0].hidden = pv   // Total
    c.data.datasets[1].hidden = pv   // Max
    c.data.datasets[2].hidden = pv   // Avg
    c.data.datasets[3].hidden = !pv  // Phase A
    c.data.datasets[4].hidden = !pv  // Phase B
    c.data.datasets[5].hidden = !pv  // Phase C
    c.update('none')
  }, [phaseView])

  useEffect(() => () => { if (chartInst.current) chartInst.current.destroy() }, [])

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  function fmtDisplay(d) { return `${String(d.getDate()).padStart(2,'0')} - ${months[d.getMonth()]} - ${d.getFullYear()}` }
  function shift(n) { setCurDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd }) }

  return (
    <div style={{ background: '#111111', borderRadius: 14, padding: '14px 16px' }}>
      {/* Top header row: House selector + Booking button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.35)',
          borderRadius: 8, color: '#FFB800', cursor: 'pointer', padding: '5px 12px', fontSize: 11, fontWeight: 600,
        }}>
          <Home size={13} color="#FFB800" />
          {roomLabel}
        </button>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.35)',
          borderRadius: 8, color: '#FFB800', cursor: 'pointer', padding: '5px 12px', fontSize: 11, fontWeight: 600,
        }} onClick={onBookingClick}>
          <BookOpen size={13} color="#FFB800" />
          Booking
        </button>
      </div>

      {/* Date navigation row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10 }}>
        <button onClick={() => shift(-1)} style={{ background: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.3)', borderRadius: 6, color: '#FFB800', cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>&lt;</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.25)', borderRadius: 8, padding: '5px 14px' }}>
          <Calendar size={13} color="#c9a96e" />
          <span style={{ color: '#c9a96e', fontSize: 11, fontWeight: 600, minWidth: 130, textAlign: 'center' }}>{fmtDisplay(curDate)}</span>
        </div>
        <button onClick={() => shift(1)} style={{ background: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.3)', borderRadius: 6, color: '#FFB800', cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>&gt;</button>
      </div>

      <div style={{ position: 'relative', height: 220 }}>
        {loading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: 11, zIndex: 10 }}>กำลังโหลด…</div>}
        <canvas ref={chartRef} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <div style={{ color: '#555', fontSize: 9 }}>Time (HH:MM)</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Phase legend */}
          {phaseView && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {[['Phase A','#ff4444'],['Phase B','#ffd700'],['Phase C','#1e90ff']].map(([label, color]) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#888', fontSize: 9 }}>
                  <span style={{ width: 10, height: 3, background: color, borderRadius: 2, display: 'inline-block' }} />
                  {label}
                </span>
              ))}
            </div>
          )}
          <button
            onClick={() => setPhaseView(v => !v)}
            style={{ background: 'rgba(255,184,0,0.12)', border: '1px solid rgba(255,184,0,0.4)', borderRadius: 6, color: '#FFB800', cursor: 'pointer', padding: '4px 16px', fontSize: 10, fontWeight: 600 }}
          >
            {phaseView ? 'Phase balance' : 'Total power'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Device control — momaybuu server (proxies to control server + CCTV relay) ──
const MOMAY_SERVER  = 'https://momaybuu-production.up.railway.app'
const CONTROL_API   = 'https://controlbuu-production.up.railway.app'  // fallback for /room-state, /health
const PRIMARY_ROOM  = 'ห้อง101โถงชั้น1'

async function _fetchWithTimeout(url, ms = 5000) {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { signal: ctrl.signal }) }
  finally { clearTimeout(tid) }
}

const AC_MODES = ['เย็น (Cool)', 'ร้อน (Heat)', 'อัตโนมัติ (Auto)', 'พัดลม (Fan)', 'ลดความชื้น (Dry)']
const AC_WINDS = ['อัตโนมัติ', 'แรงลม 1', 'แรงลม 2', 'แรงลม 3']

// PM2.5 µg/m³ → AQI level (Thai label + color) — thresholds from MomayBUUV.pm index.html
function _pm25Level(v) {
  if (v === null || v === undefined) return { label: '--',             color: '#74640a', bg: 'linear-gradient(135deg,#fffef8,#f5f0e5)' }
  if (v <= 25)  return { label: 'คุณภาพดี',        color: '#2ecc40', bg: 'linear-gradient(135deg,#fffef8,#f5f0e5)' }
  if (v <= 37)  return { label: 'ปานกลาง',         color: '#ffb700', bg: 'linear-gradient(135deg,#fffef8,#f5f0e5)' }
  if (v <= 75)  return { label: 'มีผลต่อสุขภาพ',  color: '#ff6600', bg: 'linear-gradient(135deg,#fffef8,#f5f0e5)' }
  return               { label: 'อันตราย',          color: '#cc0000', bg: 'linear-gradient(135deg,#fffef8,#f5f0e5)' }
}

function MomayStatusRow() {
  const [bulb, setBulb]   = useState(null)
  const [ac, setAc]       = useState(null)
  const [cctvOk, setCctv] = useState(null)
  const [apiOk, setApi]   = useState(null)
  const [pm25, setPm25]   = useState(null)   // µg/m³ float or null

  // AC panel
  const [acOpen, setAcOpen]   = useState(false)
  const [acState, setAcState] = useState({ temp: 25, mode: 0, wind: 0 })
  const [acSending, setAcSending] = useState(false)

  // CCTV popup
  const [cctvOpen, setCctvOpen] = useState(false)
  const [cctvStatus, setCctvStatus] = useState('idle')  // idle|connecting|live|offline
  const [cctvFps, setCctvFps] = useState('')
  const cctvImgRef = useRef(null)
  const cctvWsRef  = useRef(null)
  const cctvFpsRef = useRef(0)
  const cctvTimerRef = useRef(null)
  const cctvStaleRef = useRef(null)
  const cctvLastRef  = useRef(0)

  // ── Polling room state ────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    async function fetchStates() {
      // room-state → try momaybuu server first (has /api/room-state proxy), fallback to control direct
      try {
        const r = await _fetchWithTimeout(`${MOMAY_SERVER}/api/room-state`)
        if (!r.ok) throw new Error('not ok')
        const j = await r.json()
        if (alive && j?.roomState) {
          const st = j.roomState[PRIMARY_ROOM]
          if (typeof st === 'string') setBulb(st.toUpperCase() === 'ON')
        }
      } catch {
        try {
          const r = await _fetchWithTimeout(`${CONTROL_API}/room-state`)
          if (!r.ok) throw new Error('not ok')
          const j = await r.json()
          if (alive && j?.roomState) {
            const st = j.roomState[PRIMARY_ROOM]
            if (typeof st === 'string') setBulb(st.toUpperCase() === 'ON')
          }
        } catch { if (alive) setBulb(null) }
      }

      // health → MQTT status (control server has CORS *)
      try {
        const r = await _fetchWithTimeout(`${CONTROL_API}/health`, 4000)
        if (r.ok) { const j = await r.json(); if (alive) setCctv(j?.mqtt === 'connected') }
        else if (alive) setCctv(false)
      } catch { if (alive) setCctv(false) }

      // energy API health
      try {
        const r = await _fetchWithTimeout(`${MOMAY_API}/daily-diff`, 4000)
        if (alive) setApi(r.ok)
      } catch { if (alive) setApi(false) }

      // PM2.5 sensor
      try {
        const r = await _fetchWithTimeout(`${MOMAY_API}/pm25`, 4000)
        if (r.ok) {
          const j = await r.json()
          if (alive) setPm25(j?.pm25 ?? j?.value ?? j?.pm2_5 ?? null)
        }
      } catch { /* endpoint not yet available */ }
    }
    fetchStates()
    const id = setInterval(fetchStates, 8000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // ── PM2.5 mock (สุ่มทุก 30 นาที เหมือน MomayBUUV.pm) ─────────────────────
  useEffect(() => {
    function refreshPm25() { setPm25(Math.round(25 + Math.random() * 30)) }
    refreshPm25()
    const id = setInterval(refreshPm25, 30 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // ── Bulb toggle → momaybuu /api/toggle-device → control /toggle → MQTT ──
  async function toggleBulb() {
    const action = bulb ? 'OFF' : 'ON'
    setBulb(v => !v)   // optimistic — light only
    try {
      await fetch(`${MOMAY_SERVER}/api/toggle-device`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: PRIMARY_ROOM, action }),
      })
    } catch { /* ignore */ }
  }

  // ── AC command → momaybuu /api/ac-command → control → MQTT ──────────────
  async function sendAcCommand(overrides = {}) {
    const payload = { room: PRIMARY_ROOM, swing: 0, ...acState, ...overrides }
    setAcState(s => ({ ...s, ...overrides }))
    setAcSending(true)
    try {
      await fetch(`${MOMAY_SERVER}/api/ac-command`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch { /* ignore */ } finally { setAcSending(false) }
  }

  // ── CCTV WebSocket — relay อยู่บน momaybuu main server ───────────────────
  const CCTV_WS = 'wss://momaybuu-production.up.railway.app/ws/stream'
  function cctvConnect() {
    if (cctvWsRef.current) return
    setCctvStatus('connecting')
    const ws = new WebSocket(CCTV_WS)
    ws.binaryType = 'arraybuffer'
    cctvWsRef.current = ws
    ws.onopen = () => {
      cctvFpsRef.current = 0; cctvLastRef.current = 0
      cctvTimerRef.current = setInterval(() => { setCctvFps(cctvFpsRef.current > 0 ? `${cctvFpsRef.current} fps` : ''); cctvFpsRef.current = 0 }, 1000)
      cctvStaleRef.current = setInterval(() => { if (cctvLastRef.current > 0 && Date.now() - cctvLastRef.current > 3000) setCctvStatus('offline') }, 1500)
    }
    ws.onmessage = ev => {
      if (typeof ev.data === 'string') { if (ev.data === 'relay_offline') setCctvStatus('offline'); return }
      cctvLastRef.current = Date.now()
      const blob = new Blob([ev.data], { type: 'image/jpeg' })
      const url  = URL.createObjectURL(blob)
      if (cctvImgRef.current) { const old = cctvImgRef.current.src; cctvImgRef.current.src = url; if (old?.startsWith('blob:')) URL.revokeObjectURL(old) }
      cctvFpsRef.current++
      setCctvStatus('live')
    }
    ws.onclose = () => { cctvWsRef.current = null; clearInterval(cctvTimerRef.current); clearInterval(cctvStaleRef.current); setCctvStatus('offline'); setCctvFps('') }
    ws.onerror = () => setCctvStatus('offline')
  }

  function cctvDisconnect() {
    if (cctvWsRef.current) { cctvWsRef.current.close(); cctvWsRef.current = null }
    clearInterval(cctvTimerRef.current); clearInterval(cctvStaleRef.current)
    setCctvStatus('idle'); setCctvFps('')
  }

  useEffect(() => {
    if (cctvOpen) cctvConnect()
    else cctvDisconnect()
    return () => cctvDisconnect()
  }, [cctvOpen])

  // ── Helpers ───────────────────────────────────────────────────────────────
  function StatusDot({ on }) {
    if (on === null) return <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#444', display: 'inline-block', flexShrink: 0 }} />
    return <span style={{ width: 7, height: 7, borderRadius: '50%', background: on ? '#4ade80' : '#ef4444', boxShadow: on ? '0 0 6px #4ade80' : '0 0 4px #ef4444', display: 'inline-block', flexShrink: 0 }} />
  }

  function StatusText({ on, onLabel, offLabel, color }) {
    if (on === null) return <span style={{ color: '#555', fontSize: 11, fontWeight: 700 }}>…</span>
    const c = color || (on ? '#4ade80' : '#ef4444')
    return <span style={{ color: c, fontSize: 11, fontWeight: 700 }}>{on ? onLabel : offLabel}</span>
  }

  // Bulb SVG — ลอกจาก MomayBUUV.pm/index.html
  const bulbSvg = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48" width="42" height="42" style={{ pointerEvents:'none' }}>
      <ellipse cx="32" cy="20" rx="14" ry="16"
        fill={bulb ? '#ffe97a' : '#e0d8c0'} stroke="#74640a" strokeWidth="2" />
      <rect x="27" y="34" width="10" height="8" rx="2" fill="#b5a76c" stroke="#74640a" strokeWidth="1.5"/>
      <line x1="27" y1="37" x2="37" y2="37" stroke="#74640a" strokeWidth="1"/>
      <line x1="27" y1="40" x2="37" y2="40" stroke="#74640a" strokeWidth="1"/>
      <rect x="29" y="42" width="6" height="3" rx="1.5" fill="#74640a"/>
    </svg>
  )

  // AC SVG — ลอกจาก MomayBUUV.pm/index.html
  const acSvg = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 52" width="42" height="42" style={{ pointerEvents:'none' }}>
      <rect x="4" y="4" width="56" height="26" rx="4" fill="#e0d8c0" stroke="#74640a" strokeWidth="2"/>
      <line x1="10" y1="20" x2="54" y2="20" stroke="#74640a" strokeWidth="1.5"/>
      <line x1="10" y1="24" x2="54" y2="24" stroke="#74640a" strokeWidth="1"/>
      <circle cx="13" cy="12" r="2.5" fill={ac ? '#2ecc40' : '#999'}/>
      <path d="M18 34 Q21 40 18 46" stroke="#74640a" strokeWidth="1.5" fill="none" opacity={ac ? 1 : 0}/>
      <path d="M32 34 Q35 40 32 46" stroke="#74640a" strokeWidth="1.5" fill="none" opacity={ac ? 1 : 0}/>
      <path d="M46 34 Q49 40 46 46" stroke="#74640a" strokeWidth="1.5" fill="none" opacity={ac ? 1 : 0}/>
    </svg>
  )

  // CCTV SVG — ลอกจาก MomayBUUV.pm/index.html
  const cctvSvg = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 60" width="42" height="42" style={{ pointerEvents:'none' }}>
      <rect x="38" y="0" width="16" height="5" fill="#e0d8c0" stroke="#74640a" strokeWidth="1.5"/>
      <rect x="43" y="5" width="6" height="16" fill="#e0d8c0" stroke="#74640a" strokeWidth="1.5"/>
      <circle cx="46" cy="24" r="5" fill="#e0d8c0" stroke="#74640a" strokeWidth="1.5"/>
      <g transform="rotate(-12, 46, 24)">
        <rect x="14" y="19" width="32" height="14" rx="2" fill="#e0d8c0" stroke="#74640a" strokeWidth="2"/>
        <rect x="4" y="21" width="12" height="10" rx="2" fill="#e0d8c0" stroke="#74640a" strokeWidth="1.5"/>
      </g>
      <circle cx="22" cy="30" r="1.5" fill={cctvStatus === 'live' ? '#2ecc40' : '#cc0000'}/>
    </svg>
  )

  const cctvOn = cctvStatus === 'live' ? true : cctvStatus === 'connecting' ? null : false

  const items = [
    {
      label: 'แสงสว่าง', on: bulb, onLabel: 'เปิด', offLabel: 'ปิด', iconColor: '#e8c840',
      iconEl: bulbSvg,
      onClick: toggleBulb,
    },
    {
      label: 'แอร์', on: ac, onLabel: 'เปิด', offLabel: 'ปิด', iconColor: '#74b8c8',
      iconEl: acSvg,
      onClick: () => setAcOpen(true),
    },
    {
      label: 'กล้องวงจรปิด', on: cctvOn, onLabel: 'ออนไลน์', offLabel: 'ออฟไลน์', iconColor: '#a89030',
      iconEl: cctvSvg,
      onClick: () => setCctvOpen(true),
    },
    (() => {
      const lv = _pm25Level(pm25)
      return {
        label: 'PM2.5', iconColor: lv.color,
        on: pm25 !== null ? true : null,
        onLabel: lv.label, offLabel: '--',
        statusColor: lv.color,
        iconEl: (
          <span style={{
            fontSize: 28, fontWeight: 900, color: lv.color, lineHeight: 1,
            filter: `drop-shadow(0 0 6px ${lv.color}99)`,
            letterSpacing: -1,
          }}>
            {pm25 !== null ? Math.round(pm25) : '--'}
          </span>
        ),
        onClick: null,
      }
    })(),
  ]

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%' }}>
        {items.map(({ label, on, onLabel, offLabel, iconColor, iconEl, onClick, statusColor }) => (
          <div key={label}
            onClick={onClick || undefined}
            style={{
              flex: '1 1 140px',
              background: on === null
                ? 'linear-gradient(135deg,#181818 0%,#0d0d0d 100%)'
                : on
                  ? `linear-gradient(135deg,${iconColor}14 0%,#0d0d0d 100%)`
                  : 'linear-gradient(135deg,#1f0808 0%,#0d0d0d 100%)',
              border: `1.5px solid ${on === null ? 'rgba(255,255,255,0.08)' : on ? `${iconColor}55` : 'rgba(239,68,68,0.35)'}`,
              borderRadius: 10, padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: 12,
              cursor: onClick ? 'pointer' : 'default',
              transition: 'border-color 0.25s, background 0.25s',
              boxShadow: on ? `0 0 10px ${iconColor}18` : 'none',
            }}
            onMouseEnter={e => { if (onClick) e.currentTarget.style.borderColor = `${iconColor}88` }}
            onMouseLeave={e => { if (onClick) e.currentTarget.style.borderColor = on === null ? 'rgba(255,255,255,0.08)' : on ? `${iconColor}55` : 'rgba(239,68,68,0.35)' }}
          >
            <div style={{
              flexShrink: 0, width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center',
              filter: statusColor ? 'none' : on === null ? 'grayscale(1) opacity(0.4)' : on ? `drop-shadow(0 0 6px ${iconColor}88)` : 'none',
            }}>
              {iconEl}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <div style={{ color: on === null ? '#555' : on ? '#d1d5db' : '#9ca3af', fontSize: 11, fontWeight: 600, letterSpacing: 0.3 }}>{label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <StatusDot on={on} />
                <StatusText on={on} onLabel={onLabel} offLabel={offLabel} color={statusColor} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── AC Panel Popup ── */}
      {acOpen && (
        <div onClick={e => { if (e.target === e.currentTarget) setAcOpen(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)', border: '1.5px solid rgba(34,211,238,0.4)', borderRadius: 16, padding: 24, minWidth: 300, boxShadow: '0 0 40px rgba(34,211,238,0.15)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Wind size={18} color="#22d3ee" />
                <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 14 }}>ควบคุมแอร์</span>
              </div>
              <button onClick={() => setAcOpen(false)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%', width: 28, height: 28, color: '#aaa', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            {/* Power toggle */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <button onClick={toggleBulb} style={{
                background: ac ? 'rgba(34,211,238,0.15)' : 'rgba(239,68,68,0.1)',
                border: `1.5px solid ${ac ? '#22d3ee' : '#ef4444'}`,
                borderRadius: 10, padding: '8px 28px', color: ac ? '#22d3ee' : '#ef4444',
                fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 16 }}>⏻</span>
                {ac ? 'เปิดอยู่' : 'ปิดอยู่'}
              </button>
            </div>
            {/* Temperature */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 20 }}>
              <button onClick={() => setAcState(s => ({ ...s, temp: Math.max(16, s.temp - 1) }))} style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)', color: '#22d3ee', fontSize: 20, cursor: 'pointer', fontWeight: 700 }}>−</button>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: 32, minWidth: 80, textAlign: 'center' }}>{acState.temp}°C</span>
              <button onClick={() => setAcState(s => ({ ...s, temp: Math.min(30, s.temp + 1) }))} style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)', color: '#22d3ee', fontSize: 20, cursor: 'pointer', fontWeight: 700 }}>+</button>
            </div>
            {/* Mode */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: '#666', fontSize: 10, marginBottom: 6 }}>โหมด</div>
              <select value={acState.mode} onChange={e => setAcState(s => ({ ...s, mode: Number(e.target.value) }))}
                style={{ width: '100%', background: '#111', border: '1px solid rgba(34,211,238,0.3)', borderRadius: 8, color: '#22d3ee', padding: '7px 10px', fontSize: 12 }}>
                {AC_MODES.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            {/* Wind */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ color: '#666', fontSize: 10, marginBottom: 6 }}>ความแรงลม</div>
              <select value={acState.wind} onChange={e => setAcState(s => ({ ...s, wind: Number(e.target.value) }))}
                style={{ width: '100%', background: '#111', border: '1px solid rgba(34,211,238,0.3)', borderRadius: 8, color: '#22d3ee', padding: '7px 10px', fontSize: 12 }}>
                {AC_WINDS.map((w, i) => <option key={i} value={i}>{w}</option>)}
              </select>
            </div>
            {/* Send */}
            <button onClick={() => { sendAcCommand(); setAcOpen(false) }} disabled={acSending}
              style={{ width: '100%', background: 'rgba(34,211,238,0.15)', border: '1.5px solid #22d3ee', borderRadius: 10, color: '#22d3ee', padding: '10px', fontWeight: 700, fontSize: 13, cursor: acSending ? 'wait' : 'pointer' }}>
              {acSending ? 'กำลังส่ง…' : 'ตั้งค่าแอร์'}
            </button>
          </div>
        </div>
      )}

      {/* ── CCTV Popup ── */}
      {cctvOpen && (
        <div onClick={e => { if (e.target === e.currentTarget) setCctvOpen(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#0a0a0a', border: '1.5px solid rgba(167,139,250,0.4)', borderRadius: 14, overflow: 'hidden', width: 440, maxWidth: '94vw', boxShadow: '0 0 40px rgba(167,139,250,0.15)' }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, rgba(167,139,250,0.2), rgba(167,139,250,0.08))', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(167,139,250,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cctvStatus === 'live' ? '#ff3b3b' : cctvStatus === 'connecting' ? '#ffaa00' : '#666', display: 'inline-block' }} />
                <Camera size={14} color="#a78bfa" />
                <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: 13 }}>กล้องวงจรปิด</span>
                <span style={{ color: '#666', fontSize: 10 }}>— {cctvStatus === 'live' ? '● LIVE' : cctvStatus === 'connecting' ? 'กำลังเชื่อมต่อ…' : 'ไม่มีสัญญาณ'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {cctvFps && <span style={{ color: '#555', fontSize: 10 }}>{cctvFps}</span>}
                <button onClick={() => setCctvOpen(false)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: 26, height: 26, color: '#aaa', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
            </div>
            {/* Video feed */}
            <div style={{ position: 'relative', background: '#000', aspectRatio: '4/3' }}>
              <img ref={cctvImgRef} alt="CCTV" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />
              {cctvStatus !== 'live' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#555', fontSize: 13 }}>
                  <Camera size={32} color="#333" />
                  <span>{cctvStatus === 'connecting' ? 'กำลังเชื่อมต่อกล้อง…' : 'ไม่มีสัญญาณ'}</span>
                </div>
              )}
            </div>
            {/* Footer */}
            <div style={{ padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(167,139,250,0.15)' }}>
              <span style={{ color: '#555', fontSize: 10 }}>สำนักหอสมุด ม.บูรพา</span>
              <span style={{ color: '#a78bfa', fontSize: 10 }}>BUU Library CCTV</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Bill Panel — ported from script.js energyChart + bill circles ─────────
function MomayBillPanel({ todayBill, yesterdayBill }) {
  const chartRef    = useRef(null)
  const chartInst   = useRef(null)
  const [endDate, setEndDate] = useState(() => new Date())
  const [loading, setLoading] = useState(false)
  const [chartTitle, setChartTitle] = useState('')
  const [bpW, setBpW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280))
  useEffect(() => { const fn = () => setBpW(window.innerWidth); window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn) }, [])
  const sm = bpW < 900

  const todayThb   = todayBill?.electricity_bill
  const todayUnit  = todayBill?.total_energy_kwh
  const yesterThb  = yesterdayBill?.electricity_bill
  const yesterUnit = yesterdayBill?.total_energy_kwh
  const diffRaw    = (todayThb ?? 0) - (yesterThb ?? 0)
  const diffArrow  = diffRaw >= 0 ? ' ▲' : ' ▼'
  const diffStr    = yesterThb != null ? `Daily Bill Change: ${Math.abs(diffRaw).toFixed(2)}฿${diffArrow}` : 'Daily Bill Change: --'
  const diffColor  = diffRaw >= 0 ? '#ef4444' : '#22c55e'

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        // 7-day window ending at endDate (exact script.js logic)
        const days = []
        for (let i = 6; i >= 0; i--) {
          const d = new Date(endDate); d.setDate(d.getDate() - i)
          days.push(d)
        }
        const fmtLabel = d => d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })
        const results = await Promise.all(
          days.map(d => fetch(`${MOMAY_API}/daily-bill?date=${_localDateStr(d)}`).then(r => r.json()).catch(() => null))
        )
        if (cancelled || !chartRef.current) return

        const labels    = days.map(fmtLabel)
        const dayData   = results.map(r => {
          if (!r) return null
          // API may return day_bill, bill_day, or dayCost
          const v = r.day_bill ?? r.bill_day ?? r.dayCost ?? null
          if (v != null) return Number(v) || 0
          // fall back: estimate 60% of total bill
          const total = typeof r.electricity_bill === 'number' ? r.electricity_bill : parseFloat(r.electricity_bill) || 0
          return total > 0 ? +(total * 0.6).toFixed(4) : null
        })
        const nightData = results.map(r => {
          if (!r) return null
          const v = r.night_bill ?? r.bill_night ?? r.nightCost ?? null
          if (v != null) return Number(v) || 0
          const total = typeof r.electricity_bill === 'number' ? r.electricity_bill : parseFloat(r.electricity_bill) || 0
          return total > 0 ? +(total * 0.4).toFixed(4) : null
        })
        setChartTitle(`${fmtLabel(days[0])} – ${fmtLabel(days[days.length - 1])}`)

        if (chartInst.current) chartInst.current.destroy()
        chartInst.current = new Chart(chartRef.current, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { label: 'Day (THB)',   data: dayData,   backgroundColor: 'rgba(245,166,35,0.85)', borderColor: '#d4920a', borderWidth: 1, borderRadius: 3 },
              { label: 'Night (THB)', data: nightData, backgroundColor: 'rgba(74,111,165,0.85)', borderColor: '#35577a', borderWidth: 1, borderRadius: 3 },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: '#888', font: { size: 10 } }, grid: { display: false } },
              y: { ticks: { color: '#888', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.07)' } },
            },
          },
        })
      } catch { /* ignore */ } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [endDate])

  useEffect(() => () => { if (chartInst.current) chartInst.current.destroy() }, [])

  function Circle({ dateLabel, thb, unit }) {
    const sz = sm ? 72 : 100
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <div style={{ color: '#666', fontSize: sm ? 8 : 9 }}>{dateLabel}</div>
        <div style={{ width: sz, height: sz, borderRadius: '50%', border: `${sm ? 2 : 3}px solid #FFB800`, background: 'linear-gradient(135deg,#1a1a1a,#0d0d0d)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 16px rgba(255,184,0,0.3)' }}>
          <div style={{ color: '#FFB800', fontWeight: 700, fontSize: sm ? 10 : 12, lineHeight: 1.3, textAlign: 'center', padding: '0 4px' }}>
            {thb != null ? `${Number(thb).toFixed(2)} THB.` : '--'}
          </div>
          <div style={{ color: '#666', fontSize: sm ? 8 : 9 }}>
            {unit != null ? `${Number(unit).toFixed(2)} Unit` : '--'}
          </div>
        </div>
      </div>
    )
  }

  const today     = _localDateStr(new Date())
  const yesterday = _addDaysStr(today, -1)

  return (
    <div style={{ background: '#111111', border: '1.5px solid rgba(255,184,0,0.2)', borderRadius: 14, padding: '14px 18px' }}>
      {/* Circles */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: sm ? 12 : 32, marginBottom: 12 }}>
        <Circle dateLabel={yesterday} thb={yesterThb} unit={yesterUnit} />
        <div style={{ textAlign: 'center', border: '1px solid rgba(255,184,0,0.35)', borderRadius: 8, padding: sm ? '5px 8px' : '8px 16px', background: '#0a0a0a', maxWidth: sm ? 100 : 160 }}>
          <div style={{ color: diffColor, fontWeight: 700, fontSize: sm ? 9 : 12, lineHeight: 1.4 }}>{diffStr}</div>
        </div>
        <Circle dateLabel={today} thb={todayThb} unit={todayUnit} />
      </div>
      {/* Bar chart */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <button onClick={() => setEndDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() - 7); return nd })} style={{ background: 'none', border: '1px solid rgba(255,184,0,0.3)', borderRadius: 4, color: '#FFB800', cursor: 'pointer', padding: '2px 8px', fontSize: 12 }}>&lt;</button>
        <span style={{ color: '#888', fontSize: 10 }}>{chartTitle}</span>
        <button onClick={() => setEndDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + 7); return nd })} style={{ background: 'none', border: '1px solid rgba(255,184,0,0.3)', borderRadius: 4, color: '#FFB800', cursor: 'pointer', padding: '2px 8px', fontSize: 12 }}>&gt;</button>
      </div>
      <div style={{ position: 'relative', height: 130 }}>
        {loading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: 11 }}>กำลังโหลด…</div>}
        <canvas ref={chartRef} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#888', fontSize: 9 }}>
          <span style={{ width: 12, height: 10, background: 'rgba(245,166,35,0.85)', borderRadius: 2, display: 'inline-block' }} />
          Day (THB)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#888', fontSize: 9 }}>
          <span style={{ width: 12, height: 10, background: 'rgba(74,111,165,0.85)', borderRadius: 2, display: 'inline-block' }} />
          Night (THB)
        </span>
      </div>
    </div>
  )
}

// Stage configs
const STAGES = [
  { key: 'stacked',  label: 'ทุกชั้น',    gap: 18,  desc: 'All floors stacked'   },
  { key: 'exploded', label: 'แต่ละชั้น',  gap: 44,  desc: 'Exploded view'        },
  { key: 'single',   label: 'เฉพาะชั้น',  gap: 44,  desc: 'Selected floor only'  },
]

const FLOOR_W   = 180   // px — width of each floor image in the viewer
const IMG_RATIO = 1.0   // PNG images are square (1024×1024)
const TRACK_TOTAL_X = '27%'
const TRACK_TOTAL_Y = '50%'
const TRACK_SPREAD_RIGHT_X = '43%'
const TRACK_LEFT_NUDGE_X = '4%'
const MOBILE_TRACK_LEFT_X = 18
const MOBILE_TRACK_TOP_Y = '19%'
const TRACK_VIEWER_TOP_OFFSET = 24
const TRACK_CONNECTOR_EXPLODED = 'clamp(90px, 11vw, 160px)'
const TRACK_FLOOR_ANCHOR_RATIO = 0.34
const TRACK_FLOOR_Y_NUDGE = -12
const TRACK_LEFT_FLOOR_Y_NUDGE = 80
const TRACK_LEFT_ALL_Y_NUDGE_PX = 0
const TRACK_FLOOR_Y_ADJUST = {
  'ห้อง101โถงชั้น1': 0,
  'ห้อง200': 0,
  'ห้อง300': 0,
}
const TRACK_LAYOUT = [
  { floorId: 'ห้อง300',          side: 'left', row: 0 },
  { floorId: 'ห้อง200',          side: 'left', row: 1 },
  { floorId: 'ห้อง101โถงชั้น1', side: 'left', row: 2 },
]

class MomayErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{ background: '#0a0a0a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <pre style={{ color: '#f97316', fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap', maxWidth: 900 }}>
          {String(this.state.error)}{'\n\n'}{this.state.error?.stack}
        </pre>
      </div>
    )
    return this.props.children
  }
}

function MomayRelationshipLayerInner() {
  const [selectedFloor, setSelected] = useState(0)   // 0-based index — opens on ห้อง 101
  const [bookingOpen, setBookingOpen] = useState(false)
  const [calOpen, setCalOpen]         = useState(false)
  const [solarOpen, setSolarOpen]     = useState(false)
  const [notifOpen, setNotifOpen]     = useState(false)
  const [notifCount, setNotifCount]   = useState(0)
  const calIconRef   = useRef(null)
  const solarIconRef = useRef(null)
  const bellIconRef  = useRef(null)

  useEffect(() => {
    if (!document.getElementById('momay-shake-style')) {
      const s = document.createElement('style'); s.id = 'momay-shake-style'
      s.textContent = `@keyframes momay-shake{0%,100%{transform:rotate(0deg)}10%,30%,50%,70%,90%{transform:rotate(-10deg)}20%,40%,60%,80%{transform:rotate(10deg)}}`
      document.head.appendChild(s)
    }
    const shake = ref => {
      if (!ref.current) return
      ref.current.style.animation = 'momay-shake 0.5s 3'
      setTimeout(() => { if (ref.current) ref.current.style.animation = '' }, 1500)
    }
    const id = setInterval(() => {
      shake(bellIconRef)
      setTimeout(() => shake(calIconRef), 500)
      setTimeout(() => shake(solarIconRef), 1000)
    }, 10000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const roomBase = BUU_ROOMS[selectedFloor]?.apiBase ?? MOMAY_API
    const load = () => {
      fetch(`${roomBase}/api/notifications/all?limit=50`)
        .then(r => r.json())
        .then(j => setNotifCount(j.success ? (j.unreadCount || 0) : 0))
        .catch(() => {})
    }
    load()
    const id = setInterval(load, 60000)
    return () => clearInterval(id)
  }, [selectedFloor])

  // ── API gateway ──────────────────────────────────────────────────────────
  const apiBase = (new URLSearchParams(window.location.search).get('gateway') || import.meta.env.VITE_GATEWAY_URL || '').replace(/\/$/, '')

  // ── Cameras from API ──────────────────────────────────────────────────────
  const [cameras, setCameras] = useState([])
  const abortRef = useRef(null)

  useEffect(() => {
    const fetchCameras = async () => {
      if (!apiBase) return
      if (abortRef.current) abortRef.current.abort()
      abortRef.current = new AbortController()
      try {
        const res = await fetch(apiBase + '/api/cameras', { signal: abortRef.current.signal })
        if (!res.ok) return
        const data = await res.json()
        setCameras(data)
      } catch (e) {
        if (e.name !== 'AbortError') console.warn('cameras fetch error', e)
      }
    }
    fetchCameras()
    const id = setInterval(fetchCameras, 2000)
    return () => { clearInterval(id); if (abortRef.current) abortRef.current.abort() }
  }, [apiBase])

  // ── Momay energy panel ───────────────────────────────────────────────────
  const [energyToday, setEnergyToday]         = useState(null)
  const [energyYesterday, setEnergyYesterday] = useState(null)

  useEffect(() => {
    const roomApi = BUU_ROOMS[selectedFloor]?.apiBase ?? MOMAY_API
    const today     = _bkkToday()
    const yesterday = _addDaysStr(today, -1)
    setEnergyToday(null); setEnergyYesterday(null)
    Promise.all([
      fetch(`${roomApi}/daily-bill?date=${today}`).then(r => r.json()).catch(() => null),
      fetch(`${roomApi}/daily-bill?date=${yesterday}`).then(r => r.json()).catch(() => null),
    ]).then(([t, y]) => { setEnergyToday(t); setEnergyYesterday(y) })
    const id = setInterval(() => {
      fetch(`${roomApi}/daily-bill?date=${_bkkToday()}`).then(r => r.json()).then(setEnergyToday).catch(() => {})
    }, 60000)
    return () => clearInterval(id)
  }, [selectedFloor])

  const todayBill  = energyToday?.electricity_bill ?? null
  const todayUnit  = energyToday?.total_energy_kwh ?? null
  const yesterBill = energyYesterday?.electricity_bill ?? null
  const trendPct = (todayBill != null && yesterBill != null && yesterBill > 0)
    ? ((todayBill - yesterBill) / yesterBill * 100)
    : null
  const trendStr = trendPct != null
    ? `${trendPct >= 0 ? '+' : ''}${trendPct.toFixed(1)}%`
    : '--'
  const trendUp = trendPct == null || trendPct >= 0

  // ── Active booking for selected room ────────────────────────────────────
  const [activeBooking, setActiveBooking] = useState(null)
  useEffect(() => {
    const room = BUU_ROOMS[selectedFloor]?.id ?? BUU_ROOMS[0].id
    setActiveBooking(null)
    let alive = true
    async function poll() {
      try {
        const r = await fetch(`${MOMAY_SERVER}/api/active-booking?room=${encodeURIComponent(room)}`)
        const j = await r.json()
        if (alive) setActiveBooking(j.hasActiveBooking ? j : null)
      } catch { if (alive) setActiveBooking(null) }
    }
    poll()
    const id = setInterval(poll, 30000)
    return () => { alive = false; clearInterval(id) }
  }, [selectedFloor])
  // ─────────────────────────────────────────────────────────────────────────

  // ── Per-floor API data (null = use mock animation) ──────────────────────
  // When real API is ready, replace null entries with Float32Array(cells.length)
  // Example fetch:
  //   const res = await fetch(`/api/heatmap/floor/${floorIdx}`)
  //   const { values } = await res.json()  // values: number[] normalized 0..1
  //   setFloorApiData(prev => { const n=[...prev]; n[floorIdx]=new Float32Array(values); return n })
  const [floorApiData] = useState(() => Array(FLOORS.length).fill(null))
  // ────────────────────────────────────────────────────────────────────────

  // Track how many floor plan images have loaded → show skeleton until all ready
  const [loadedCount, setLoadedCount] = useState(0)
  const allLoaded = loadedCount >= BUU_ROOMS.length
  const trackRows = BUU_ROOMS.map(room => {
    const people = FLOOR_TRACK_PRESET[room.id]?.people ?? 50
    return {
      floorId: room.id,
      floorLabel: room.label,
      people,
    }
  })
  const selectedFloorId = BUU_ROOMS[selectedFloor]?.id
  const selectedTrackRow = trackRows.find(row => row.floorId === selectedFloorId) ?? null
  const totalPeople = Math.ceil(trackRows.reduce((sum, row) => sum + row.people, 0) / Math.max(trackRows.length, 1))
  const stackedTracks = trackRows.filter(row => row.floorId !== 0)

  const [winW, setWinW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280))
  useEffect(() => {
    const fn = () => setWinW(window.innerWidth)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  const isMobile = winW < 900

  const viewerRef = useRef(null)

  // Non-passive wheel listener so preventDefault() actually stops page scroll
  useEffect(() => {
    const el = viewerRef.current
    if (!el) return
    const onWheel = e => {
      e.preventDefault()
      const dir = e.deltaY > 0 ? -1 : 1
      setSelected(prev => Math.max(0, Math.min(FLOORS.length - 1, prev + dir)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Non-passive touch listener for mobile swipe (vertical swipe = change floor)
  useEffect(() => {
    const el = viewerRef.current
    if (!el) return
    let startY = 0
    const onTouchStart = e => { startY = e.touches[0].clientY }
    const onTouchMove = e => {
      e.preventDefault()
      const dy = startY - e.touches[0].clientY
      if (Math.abs(dy) > 18) {
        const dir = dy > 0 ? -1 : 1
        setSelected(prev => Math.max(0, Math.min(FLOORS.length - 1, prev + dir)))
        startY = e.touches[0].clientY
      }
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
    }
  }, [])

  const imgH      = Math.round(FLOOR_W * IMG_RATIO)
  const numFloors = FLOORS.length
  const MAX_GAP   = 44
  const FIXED_H   = imgH + (numFloors - 1) * MAX_GAP + 160
  const topPad    = Math.max(8, Math.round((FIXED_H - (imgH + (numFloors - 1) * MAX_GAP)) / 2) - 40)

  function floorY(i) {
    return topPad + (numFloors - 1 - i) * MAX_GAP
  }

  function handleFloorClick(i) {
    setSelected(i)
  }

  return (
    <div
      className="min-h-screen w-full flex flex-col gap-4 px-2 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8"
      style={{ background: '#0a0a0a', fontFamily: 'Inter,sans-serif' }}
    >
      {/* ══ Relationship Layer — กรอบบน ══ */}
      <div
        className="w-full rounded-2xl flex flex-col"
        style={{
          border: '1.5px solid rgba(255,184,0,0.35)',
          background: '#111111',
          boxShadow: '0 0 32px rgba(255,184,0,0.08), inset 0 1px 0 rgba(255,184,0,0.08)',
          overflow: 'hidden',
          height: FIXED_H + 104,  // header(~56) + py-4 viewer padding(32) + extra(16)
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,184,0,0.2)', background: 'rgba(255,184,0,0.06)' }}
        >
          <div
            className="flex items-center justify-center rounded-lg flex-shrink-0"
            style={{ width: 32, height: 32, background: 'rgba(255,184,0,0.12)', border: '1px solid rgba(255,184,0,0.35)' }}
          >
            <Layers size={16} color="#FFB800" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-wider text-white flex flex-wrap items-baseline gap-1.5">
              Momay
            </h1>
         
          </div>

        </div>

        {/* ── Floor Plan Viewer ── */}
        <div
          className="relative flex items-center justify-center py-4 px-6"
          style={{ height: FIXED_H + 48 }}
        >
          {/* Client info card — top-left (compact on mobile) */}
          <div
            style={{
              position: 'absolute',
              left: isMobile ? 8 : 80,
              top: isMobile ? 10 : '50%',
              transform: isMobile ? 'none' : 'translateY(-50%)',
              zIndex: 40,
              background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
              border: '1.5px solid rgba(180,130,60,0.6)',
              borderRadius: isMobile ? 8 : 12,
              padding: isMobile ? '5px 7px' : '12px 14px',
              width: isMobile ? 118 : 210,
              boxShadow: '0 0 18px rgba(180,130,60,0.2), inset 0 1px 0 rgba(180,130,60,0.12)',
              display: 'flex',
              flexDirection: 'column',
              gap: isMobile ? 2 : 6,
            }}
          >
            {/* Avatar + Name row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 8, marginBottom: isMobile ? 1 : 4 }}>
              <div style={{
                width: isMobile ? 20 : 34, height: isMobile ? 20 : 34, borderRadius: '50%',
                background: 'rgba(180,130,60,0.18)',
                border: '1.5px solid rgba(180,130,60,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Users size={isMobile ? 10 : 18} color="#b4823c" strokeWidth={2} />
              </div>
              <span style={{ color: '#e8c97a', fontWeight: 700, fontSize: isMobile ? 9 : 13, letterSpacing: 0.3, lineHeight: 1.2 }}>
                {isMobile ? 'ม.บูรพา' : 'สำนักหอสมุด ม.บูรพา'}
              </span>
            </div>
            {(isMobile
              ? [['User No.', 'No.014'], ['Date', '15-05-26']]
              : [['User Number', 'No.014'], ['Contract Number', '-'], ['Date Installed', '15-05-26'], ['Contract Expiry', '-']]
            ).map(([label, value]) => (
              <div key={label} style={{ display: 'flex', gap: 3, fontSize: isMobile ? 8 : 10, lineHeight: 1.4 }}>
                <span style={{ color: '#8a7060', whiteSpace: 'nowrap' }}>{label} :</span>
                <span style={{ color: '#c9a96e', fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>
          {/* Energy panel — right side, desktop only */}
          <div
            style={{
              display: isMobile ? 'none' : 'flex',
              position: 'absolute',
              right: 80,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 40,
              flexDirection: 'column',
              gap: 8,
              width: 210,
            }}
          >
            {/* Donut — selected room occupancy */}
            {selectedTrackRow && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
                border: `1.5px solid ${getDonutColor(selectedTrackRow.people)}44`,
                borderRadius: 12,
                padding: '10px 14px',
                boxShadow: `0 0 18px ${getDonutColor(selectedTrackRow.people)}22`,
                transition: 'all 0.35s ease',
              }}>
                <DonutMetric
                  color={getDonutColor(selectedTrackRow.people)}
                  value={selectedTrackRow.people}
                  Icon={Users}
                  size={72}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ color: getDonutColor(selectedTrackRow.people), fontWeight: 800, fontSize: 14, letterSpacing: 0.4 }}>
                    {selectedTrackRow.floorLabel}
                  </div>
                  <div style={{ color: '#8a7060', fontSize: 10 }}>การใช้งานพื้นที่</div>
                </div>
              </div>
            )}

            {/* Top row: 3 icon-only buttons */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {/* ปฏิทินพลังงาน */}
              <button onClick={() => setCalOpen(true)} title="ปฏิทินพลังงาน" style={{
                width: 56, height: 56, borderRadius: 14,
                background: 'linear-gradient(135deg,#1a1a1a,#0d0d0d)',
                border: '1.5px solid rgba(255,184,0,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'border-color 0.2s, box-shadow 0.2s',
                boxShadow: '0 0 10px rgba(0,0,0,0.5)',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(255,184,0,0.7)'; e.currentTarget.style.boxShadow='0 0 16px rgba(255,184,0,0.2)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(255,184,0,0.35)'; e.currentTarget.style.boxShadow='0 0 10px rgba(0,0,0,0.5)' }}
              >
                {/* Calendar SVG */}
                <svg ref={calIconRef} viewBox="0 0 24 24" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter:'drop-shadow(0 0 5px rgba(255,184,0,0.8))' }}>
                  <rect x="2" y="4" width="20" height="18" rx="2.5" stroke="#FFB800" strokeWidth="1.5"/>
                  <line x1="2" y1="9" x2="22" y2="9" stroke="#FFB800" strokeWidth="1.5"/>
                  <line x1="7" y1="2" x2="7" y2="6" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="17" y1="2" x2="17" y2="6" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/>
                  <rect x="5" y="12" width="3" height="2.5" rx="0.5" fill="#FFB800"/>
                  <rect x="10.5" y="12" width="3" height="2.5" rx="0.5" fill="#FFB800" opacity="0.8"/>
                  <rect x="16" y="12" width="3" height="2.5" rx="0.5" fill="#FFB800" opacity="0.5"/>
                  <rect x="5" y="16.5" width="3" height="2.5" rx="0.5" fill="#FFB800" opacity="0.8"/>
                  <rect x="10.5" y="16.5" width="3" height="2.5" rx="0.5" fill="#FFB800" opacity="0.5"/>
                </svg>
              </button>

              {/* โซล่าเซลล์ */}
              <button onClick={() => setSolarOpen(true)} title="โซล่าเซลล์" style={{
                width: 56, height: 56, borderRadius: 14,
                background: 'linear-gradient(135deg,#1a1a1a,#0d0d0d)',
                border: '1.5px solid rgba(255,184,0,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'border-color 0.2s, box-shadow 0.2s',
                boxShadow: '0 0 10px rgba(0,0,0,0.5)',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(255,184,0,0.7)'; e.currentTarget.style.boxShadow='0 0 16px rgba(255,184,0,0.2)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(255,184,0,0.35)'; e.currentTarget.style.boxShadow='0 0 10px rgba(0,0,0,0.5)' }}
              >
                {/* Solar SVG */}
                <svg ref={solarIconRef} viewBox="0 0 24 24" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter:'drop-shadow(0 0 5px rgba(255,184,0,0.7))' }}>
                  <circle cx="12" cy="9" r="3.5" fill="#FFB800" opacity="0.9"/>
                  <line x1="12" y1="2" x2="12" y2="4" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="12" y1="14" x2="12" y2="16" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="5" y1="9" x2="7" y2="9" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="17" y1="9" x2="19" y2="9" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="7.05" y1="4.05" x2="8.46" y2="5.46" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="15.54" y1="12.54" x2="16.95" y2="13.95" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="16.95" y1="4.05" x2="15.54" y2="5.46" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="8.46" y1="12.54" x2="7.05" y2="13.95" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/>
                  <rect x="3" y="18" width="18" height="4" rx="1" fill="#FFB800" opacity="0.25" stroke="#FFB800" strokeWidth="1"/>
                  <line x1="9" y1="18" x2="9" y2="22" stroke="#FFB800" strokeWidth="0.8" opacity="0.7"/>
                  <line x1="15" y1="18" x2="15" y2="22" stroke="#FFB800" strokeWidth="0.8" opacity="0.7"/>
                  <line x1="3" y1="20" x2="21" y2="20" stroke="#FFB800" strokeWidth="0.8" opacity="0.7"/>
                </svg>
              </button>

              {/* การแจ้งเตือน */}
              <button onClick={() => setNotifOpen(true)} title="การแจ้งเตือน" style={{
                width: 56, height: 56, borderRadius: 14,
                background: 'linear-gradient(135deg,#1a1a1a,#0d0d0d)',
                border: '1.5px solid rgba(255,184,0,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'border-color 0.2s, box-shadow 0.2s',
                boxShadow: '0 0 10px rgba(0,0,0,0.5)',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(255,184,0,0.7)'; e.currentTarget.style.boxShadow='0 0 16px rgba(255,184,0,0.2)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(255,184,0,0.35)'; e.currentTarget.style.boxShadow='0 0 10px rgba(0,0,0,0.5)' }}
              >
                {/* Bell SVG */}
                <svg ref={bellIconRef} viewBox="0 0 24 24" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter:'drop-shadow(0 0 5px rgba(255,184,0,0.8))' }}>
                  <path d="M5 10a7 7 0 0 1 14 0v3.5l2 2.5H3l2-2.5V10z" fill="#FFB800" opacity="0.75" stroke="#FFB800" strokeWidth="1" strokeLinejoin="round"/>
                  <path d="M10 18.5a2 2 0 0 0 4 0" stroke="#FFB800" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                  <line x1="12" y1="2" x2="12" y2="4" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Bottom row: 2 energy cards */}
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                {
                  icon: <Zap size={18} color="#FFB800" />,
                  label: 'พลังงานวันนี้',
                  lines: [
                    todayBill != null ? `${todayBill.toFixed(2)} THB` : '--',
                    todayUnit != null ? `${todayUnit.toFixed(2)} Unit` : '-- Unit',
                  ],
                  valueColor: '#FFB800',
                  bg: 'rgba(255,184,0,0.06)',
                  border: 'rgba(255,184,0,0.3)',
                },
                {
                  icon: trendUp
                    ? <TrendingUp size={18} color="#FFB800" />
                    : <TrendingDown size={18} color="#FFB800" />,
                  label: 'แนวโน้มวันนี้',
                  lines: [trendStr, 'เทียบเมื่อวาน'],
                  valueColor: trendPct == null ? '#FFB800' : trendPct >= 0 ? '#ef4444' : '#4ade80',
                  bg: 'rgba(255,184,0,0.06)',
                  border: 'rgba(255,184,0,0.3)',
                },
              ].map(({ icon, label, lines, valueColor, bg, border }) => (
                <div key={label} style={{
                  flex: 1,
                  background: `linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)`,
                  border: `1.5px solid ${border}`,
                  borderRadius: 10,
                  padding: '10px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                  boxShadow: `0 0 14px ${bg}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {icon}
                    <span style={{ color: '#8a7060', fontSize: 10, letterSpacing: 0.3 }}>{label}</span>
                  </div>
                  {lines.map((line, idx) => (
                    <div key={idx} style={{ color: idx === 0 ? valueColor : '#8a7060', fontSize: idx === 0 ? 15 : 11, fontWeight: idx === 0 ? 700 : 400, lineHeight: 1.3 }}>{line}</div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Floor selector buttons — centered below viewer */}
          <div
            style={{
              position: 'absolute',
              bottom: 10,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 8,
              zIndex: 40,
            }}
          >
            {BUU_ROOMS.map((room, i) => {
              const isActive = i === selectedFloor
              return (
                <button
                  key={room.id}
                  onClick={() => setSelected(i)}
                  style={{
                    width: 40,
                    height: 32,
                    borderRadius: 8,
                    border: isActive ? '2px solid #FFB800' : '1.5px solid rgba(255,184,0,0.35)',
                    background: isActive ? 'rgba(255,184,0,0.22)' : 'rgba(10,2,15,0.7)',
                    color: isActive ? '#FFB800' : '#999',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: isActive ? '0 0 10px rgba(255,184,0,0.5)' : 'none',
                    transition: 'all 0.25s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {room.shortLabel}
                </button>
              )
            })}
          </div>

          <div ref={viewerRef} className="relative" style={{ width: FLOOR_W, height: FIXED_H }}>
            <div style={{ position: 'absolute', inset: 0 }}>
              {BUU_ROOMS.map((room, i) => {
                const isSelected = i === selectedFloor
                const isInactive = !isSelected
                const ty = isSelected ? Math.round((FIXED_H - imgH) / 2) : floorY(i)
                const sc = isSelected ? 1.7 : 1

                return (
                  <div
                    key={room.id}
                    style={{
                      position: 'absolute',
                      left: 0, top: 0,
                      width: FLOOR_W,
                      zIndex: isSelected ? 20 : i + 1,
                      transform: `translate(0, ${ty}px) scale(${sc})`,
                      transformOrigin: '50% 50%',
                      willChange: 'transform, opacity',
                      transition: 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.4s ease, filter 0.4s ease',
                      opacity: isInactive ? 0 : 1,
                      filter: isSelected ? 'drop-shadow(0 0 18px #FFB800) brightness(1.1)' : 'none',
                      pointerEvents: isInactive ? 'none' : 'auto',
                    }}
                  >
                    <img
                      src={room.img}
                      alt={room.label}
                      onLoad={() => setLoadedCount(c => c + 1)}
                      style={{
                        width: '100%', display: 'block', imageRendering: 'auto',
                        transform: 'scale(1.03)', transformOrigin: 'top left',
                        outline: 'none', border: 'none',
                        WebkitTouchCallout: 'none', WebkitUserSelect: 'none', WebkitFocusRingColor: 'transparent',
                      }}
                      draggable={false}
                    />
                    <HeatmapAnimatedCanvas
                      floorIdx={i}
                      apiValues={floorApiData[i]}
                      opacity={isInactive ? 0 : (i === 0 ? 1 : 0.88)}
                    />
                    <img
                      src={room.heatmap}
                      alt=""
                      draggable={false}
                      style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        objectFit: 'fill',
                        transform: 'translateX(2%) translateY(9%)',
                        pointerEvents: 'none',
                        opacity: isInactive ? 0 : (i === 0 ? 0.45 : 0.9),
                        transition: 'opacity 0.4s ease',
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ══ Mobile Control Panel (< 900px only) ══ */}
      {isMobile && (
        <div style={{ border: '1.5px solid rgba(255,184,0,0.3)', background: '#111111', borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Donut + room name */}
          {selectedTrackRow && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <DonutMetric color={getDonutColor(selectedTrackRow.people)} value={selectedTrackRow.people} Icon={Users} size={56} />
              <div>
                <div style={{ color: getDonutColor(selectedTrackRow.people), fontWeight: 800, fontSize: 14 }}>{selectedTrackRow.floorLabel}</div>
                <div style={{ color: '#8a7060', fontSize: 10 }}>การใช้งานพื้นที่</div>
                <div style={{ color: '#d1d5db', fontSize: 10 }}>{selectedTrackRow.people}% Occupied</div>
              </div>
            </div>
          )}
          {/* 3 icon buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setCalOpen(true)} style={{ flex: 1, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#1a1a1a,#0d0d0d)', border: '1.5px solid rgba(255,184,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" style={{ filter:'drop-shadow(0 0 4px rgba(255,184,0,0.8))' }}>
                <rect x="2" y="4" width="20" height="18" rx="2.5" stroke="#FFB800" strokeWidth="1.5"/><line x1="2" y1="9" x2="22" y2="9" stroke="#FFB800" strokeWidth="1.5"/><line x1="7" y1="2" x2="7" y2="6" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/><line x1="17" y1="2" x2="17" y2="6" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/><rect x="5" y="12" width="3" height="2.5" rx="0.5" fill="#FFB800"/><rect x="10.5" y="12" width="3" height="2.5" rx="0.5" fill="#FFB800" opacity="0.8"/><rect x="16" y="12" width="3" height="2.5" rx="0.5" fill="#FFB800" opacity="0.5"/><rect x="5" y="16.5" width="3" height="2.5" rx="0.5" fill="#FFB800" opacity="0.8"/><rect x="10.5" y="16.5" width="3" height="2.5" rx="0.5" fill="#FFB800" opacity="0.5"/>
              </svg>
            </button>
            <button onClick={() => setSolarOpen(true)} style={{ flex: 1, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#1a1a1a,#0d0d0d)', border: '1.5px solid rgba(255,184,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" style={{ filter:'drop-shadow(0 0 4px rgba(255,184,0,0.7))' }}>
                <circle cx="12" cy="9" r="3.5" fill="#FFB800" opacity="0.9"/><line x1="12" y1="2" x2="12" y2="4" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/><line x1="12" y1="14" x2="12" y2="16" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/><line x1="5" y1="9" x2="7" y2="9" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/><line x1="17" y1="9" x2="19" y2="9" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/><line x1="7.05" y1="4.05" x2="8.46" y2="5.46" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/><line x1="15.54" y1="12.54" x2="16.95" y2="13.95" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/><line x1="16.95" y1="4.05" x2="15.54" y2="5.46" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/><line x1="8.46" y1="12.54" x2="7.05" y2="13.95" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/><rect x="3" y="18" width="18" height="4" rx="1" fill="#FFB800" opacity="0.25" stroke="#FFB800" strokeWidth="1"/>
              </svg>
            </button>
            <button onClick={() => setNotifOpen(true)} style={{ flex: 1, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#1a1a1a,#0d0d0d)', border: '1.5px solid rgba(255,184,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" style={{ filter:'drop-shadow(0 0 4px rgba(255,184,0,0.8))' }}>
                <path d="M5 10a7 7 0 0 1 14 0v3.5l2 2.5H3l2-2.5V10z" fill="#FFB800" opacity="0.75" stroke="#FFB800" strokeWidth="1" strokeLinejoin="round"/><path d="M10 18.5a2 2 0 0 0 4 0" stroke="#FFB800" strokeWidth="1.5" fill="none" strokeLinecap="round"/><line x1="12" y1="2" x2="12" y2="4" stroke="#FFB800" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          {/* Energy cards */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, background: 'linear-gradient(135deg,#1a1a1a,#0d0d0d)', border: '1.5px solid rgba(255,184,0,0.3)', borderRadius: 10, padding: '10px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <Zap size={14} color="#FFB800" />
                <span style={{ color: '#8a7060', fontSize: 10 }}>พลังงานวันนี้</span>
              </div>
              <div style={{ color: '#FFB800', fontSize: 15, fontWeight: 700 }}>{todayBill != null ? `${todayBill.toFixed(2)} THB` : '--'}</div>
              <div style={{ color: '#8a7060', fontSize: 10 }}>{todayUnit != null ? `${todayUnit.toFixed(2)} Unit` : '-- Unit'}</div>
            </div>
            <div style={{ flex: 1, background: 'linear-gradient(135deg,#1a1a1a,#0d0d0d)', border: '1.5px solid rgba(255,184,0,0.3)', borderRadius: 10, padding: '10px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                {trendUp ? <TrendingUp size={14} color="#FFB800" /> : <TrendingDown size={14} color="#FFB800" />}
                <span style={{ color: '#8a7060', fontSize: 10 }}>แนวโน้มวันนี้</span>
              </div>
              <div style={{ color: trendPct == null ? '#FFB800' : trendPct >= 0 ? '#ef4444' : '#4ade80', fontSize: 15, fontWeight: 700 }}>{trendStr}</div>
              <div style={{ color: '#8a7060', fontSize: 10 }}>เทียบเมื่อวาน</div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Power Chart ══ */}
      <div className="w-full rounded-2xl overflow-hidden" style={{ border: '1.5px solid rgba(255,184,0,0.25)' }}>
        <MomayPowerChart
          onBookingClick={() => setBookingOpen(true)}
          roomLabel={BUU_ROOMS[selectedFloor]?.label ?? 'BUU Library'}
        />
      </div>

      <MomayBookingPopup
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        room={BUU_ROOMS[selectedFloor]?.id ?? BUU_ROOMS[0].id}
      />
      <MomayCalendarPopup
        open={calOpen}
        onClose={() => setCalOpen(false)}
        room={BUU_ROOMS[selectedFloor]?.id ?? BUU_ROOMS[0].id}
      />
      <MomaySolarPopup
        open={solarOpen}
        onClose={() => setSolarOpen(false)}
        room={BUU_ROOMS[selectedFloor]?.id ?? BUU_ROOMS[0].id}
      />
      <MomayNotifPopup
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        room={BUU_ROOMS[selectedFloor]?.id ?? BUU_ROOMS[0].id}
      />

      {/* ══ Status Row ══ */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ border: '1.5px solid rgba(255,184,0,0.2)', background: '#111111', padding: '8px 12px', borderRadius: 12, width: '100%', maxWidth: 720 }}>
          <MomayStatusRow />
        </div>
      </div>

      {/* ══ Bill Compare ══ */}
      <div className="w-full rounded-2xl overflow-hidden" style={{ border: '1.5px solid rgba(255,184,0,0.25)' }}>
        <MomayBillPanel todayBill={energyToday} yesterdayBill={energyYesterday} />
      </div>

      {/* ══ Bottom row — Layer 1 + Layer 2 ══ */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl overflow-hidden" style={{ border: '2px solid #1f7a68' }}>
          <div style={{ zoom: 0.72 }}>
            <LayerGreedy />
          </div>
        </div>
        <div className="rounded-2xl overflow-hidden" style={{ border: '2px solid #1a3d78' }}>
          <div style={{ zoom: 0.72 }}>
            <LayerDP />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MomayRelationshipLayer() {
  return (
    <MomayErrorBoundary>
      <MomayRelationshipLayerInner />
    </MomayErrorBoundary>
  )
}

