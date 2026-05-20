import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import Header from '../components/Header.jsx'

// ─── Constants ────────────────────────────────────────────────────────────────
const FP_STORAGE = 'heatmap_floor_plans'
const PALETTE = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7','#06b6d4','#ec4899','#84cc16','#f97316','#14b8a6']
const ZONE_COLORS = PALETTE

// ─── Helpers ─────────────────────────────────────────────────────────────────
function colorForZone(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return PALETTE[h % PALETTE.length]
}

function heatColor(ratio, alpha) {
  const a = alpha ?? 1
  let r, g, b
  if (ratio < 0.5) {
    const t = ratio * 2
    r = Math.round(59 + t*(245-59)); g = Math.round(130 + t*(158-130)); b = Math.round(246 + t*(11-246))
  } else {
    const t = (ratio - 0.5) * 2
    r = Math.round(245 + t*(239-245)); g = Math.round(158 + t*(68-158)); b = Math.round(11 + t*(44-11))
  }
  return `rgba(${r},${g},${b},${a})`
}

function centroid(pts) {
  return [pts.reduce((s,p)=>s+p[0],0)/pts.length, pts.reduce((s,p)=>s+p[1],0)/pts.length]
}

function pointInPoly(px, py, pts) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j]
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

// ─── Floor-plan persistence ───────────────────────────────────────────────────
function loadPlans() {
  try {
    const stored = JSON.parse(localStorage.getItem(FP_STORAGE) || 'null')
    if (stored && stored.length > 0) return stored
    // Migrate old floor2_zones
    const old = JSON.parse(localStorage.getItem('floor2_zones') || 'null')
    if (old && old.length > 0) {
      const plan = { id: 'floor2_migrated', name: 'ชั้น 2', bg: 'builtin:floor2', vbox: '0 0 841.92 595.32', zones: old }
      savePlans([plan])
      return [plan]
    }
    // Default: create built-in Floor 2 plan automatically
    const defaultPlan = { id: 'floor2_default', name: 'ชั้น 2', bg: 'builtin:floor2', vbox: '0 0 841.92 595.32', zones: [] }
    savePlans([defaultPlan])
    return [defaultPlan]
  } catch { return [] }
}
function savePlans(plans) { localStorage.setItem(FP_STORAGE, JSON.stringify(plans)) }

// ─── Built-in Floor 2 SVG ─────────────────────────────────────────────────────
const BF2_T = 'matrix(0,-.75,.75,0,-.000061035159,595.32)'
function BuiltinFloor2() {
  return (
    <g transform={BF2_T} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path stroke="rgba(255,255,255,0.08)" strokeWidth="1" d="M.16 0V1121.76H791.04V0"/>
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M672.16 208.8V959.52"/>
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M235.68 959.52V208.8"/>
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M664.8 129.6V959.2H242.88V216.16"/>
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M588.48 208.8H235.68M588.48 216.16H242.88"/>
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M672.16 208.8V129.6H588.48V208.8 216.16"/>
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M672.16 959.52V1116.16H387.2V1085.44"/>
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M235.68 959.52V1085.44H387.2"/>
      <path stroke="rgba(255,255,255,0.55)" strokeWidth="1" d="M665.76 963.52V1109.76H393.6V964.32L665.76 963.52Z"/>
      <path stroke="rgba(255,255,255,0.55)" strokeWidth="1" d="M240.32 964.32V1080.8H387.04V964.32H240.32Z"/>
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M505.6 5.76H109.92V208.8H588.48"/>
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M672.16 208.8V20.96H505.6V5.76"/>
      <path stroke="rgba(255,255,255,0.45)" strokeWidth=".8" d="M501.76 9.44H113.6V205.12H588.48"/>
      <path stroke="rgba(255,255,255,0.45)" strokeWidth=".8" d="M668.32 129.6V24.64H501.76V9.44"/>
      <path stroke="rgba(255,255,255,0.18)" strokeWidth=".8" strokeDasharray="10,7" d="M664.8 589.44H242.88M459.04 216.16V959.2"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M569.28 248.96V275.84H543.68V248.96H569.28Z"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M375.84 248.96V275.84H350.08V248.96H375.84Z"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M569.28 415.68V442.56H543.68V415.68H569.28Z"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M375.84 415.68V442.56H350.08V415.68H375.84Z"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M569.28 573.44V600.32H543.68V573.44H569.28Z"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M375.84 573.44V600.32H350.08V573.44H375.84Z"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M569.28 731.2V758.08H543.68V731.2H569.28Z"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M375.84 731.2V758.08H350.08V731.2H375.84Z"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M569.28 880V906.88H543.68V880H569.28Z"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M375.84 880V906.88H350.08V880H375.84Z"/>
    </g>
  )
}

// ─── Tab button style ─────────────────────────────────────────────────────────
function tabStyle(active) {
  return {
    padding: '10px 18px', fontSize: 13, border: 'none', cursor: 'pointer',
    background: 'transparent', color: active ? 'var(--text)' : 'var(--muted)',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    fontWeight: active ? 600 : 400, transition: 'all .15s', whiteSpace: 'nowrap',
  }
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Heatmap() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const gatewayUrl = searchParams.get('gateway') || import.meta.env.VITE_GATEWAY_URL || ''
  const apiBase = gatewayUrl.replace(/\/$/, '')

  const svgRef      = useRef(null)
  const floorImgRef = useRef(null)

  // Floor plans
  const [plans, setPlans]       = useState(loadPlans)
  const [activeFloor, setActiveFloor] = useState(null)  // null = overview, plan.id = editing

  // Camera data
  const [cameras, setCameras]     = useState([])
  const [camCounts, setCamCounts] = useState({})  // id → { total, running }
  const [updateTime, setUpdateTime] = useState('—')
  const [maxSeen, setMaxSeen]     = useState(1)   // camera cards normalizer
  const [maxCount, setMaxCount]   = useState(1)   // floor plan normalizer

  // Floor plan edit mode
  const [editMode, setEditMode]     = useState(false)
  const [drawing, setDrawing]       = useState([])
  const [mousePos, setMousePos]     = useState(null)
  const [pendingPts, setPendingPts] = useState(null)
  const [newName, setNewName]       = useState('')
  const [newColor, setNewColor]     = useState(PALETTE[0])
  const [newCamId, setNewCamId]     = useState('')
  const [drawTool, setDrawTool]         = useState('draw')  // 'draw' | 'erase'
  const [hoveredZoneId, setHoveredZoneId] = useState(null)

  // Add-floor modal
  const [showModal, setShowModal]         = useState(false)
  const [modalName, setModalName]         = useState('')
  const [modalBgType, setModalBgType]     = useState('builtin:floor2')
  const [modalBgData, setModalBgData]     = useState(null)
  const [modalSnapCam, setModalSnapCam]   = useState('')
  const [modalLoading, setModalLoading]   = useState(false)

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const abortRef = useRef(null)

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
      setMaxSeen(prev => Math.max(prev * 0.98, ...data.map(c => c.total_people || 0), 1))
      setMaxCount(prev => Math.max(prev * 0.98, peak, 1))
      setCameras(data)
      setCamCounts(counts)
      setUpdateTime(new Date().toLocaleTimeString('th-TH'))
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('fetch error', e)
    }
  }, [apiBase])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 2000)
    return () => {
      clearInterval(id)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [fetchData])

  // Reset drawing when switching floors or toggling edit mode
  useEffect(() => { setDrawing([]); setPendingPts(null); setHoveredZoneId(null) }, [activeFloor, editMode])
  useEffect(() => { if (!editMode) setDrawTool('draw') }, [editMode])

  // ── Derived ────────────────────────────────────────────────────────────────
  const activePlan    = plans.find(p => p.id === activeFloor) || null
  const grandTotal    = cameras.reduce((s, c) => s + (c.total_people || 0), 0)
  const liveCount     = cameras.filter(c => c.running).length

  // ── Floor plan CRUD ────────────────────────────────────────────────────────
  const _setPlans = (p) => {
    setPlans(p)
    savePlans(p)
    if (apiBase) {
      fetch(apiBase + '/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      }).catch(() => {})
    }
  }

  const createPlan = async () => {
    if (!modalName.trim()) return
    setModalLoading(true)
    let bg = 'builtin:floor2', vbox = '0 0 841.92 595.32'

    if (modalBgType === 'image' && modalBgData) {
      bg = modalBgData; vbox = '0 0 1000 562.5'
    } else if (modalBgType === 'snapshot' && modalSnapCam) {
      try {
        const r = await fetch(apiBase + `/api/cameras/${modalSnapCam}/snapshot`)
        const d = await r.json()
        if (d.ok) { bg = d.image; vbox = '0 0 1000 562.5' }
      } catch (_) {}
    } else if (modalBgType === 'blank') {
      bg = 'blank'; vbox = '0 0 1000 562.5'
    }

    const plan = { id: Date.now().toString(), name: modalName.trim(), bg, vbox, zones: [] }
    _setPlans([...plans, plan])
    setActiveFloor(plan.id)
    setEditMode(false)
    setShowModal(false)
    setModalName(''); setModalBgType('builtin:floor2'); setModalBgData(null); setModalSnapCam('')
    setModalLoading(false)
  }

  const deletePlan = (id) => {
    if (!window.confirm('ลบ floor plan นี้?')) return
    _setPlans(plans.filter(p => p.id !== id))
    if (activeFloor === id) setActiveFloor(null)
  }

  const renamePlan = (id, name) => _setPlans(plans.map(p => p.id === id ? { ...p, name } : p))

  const updatePlanZones = (planId, zones) => _setPlans(plans.map(p => p.id === planId ? { ...p, zones } : p))

  const updateCameraOrder = (planId, order) => _setPlans(plans.map(p => p.id === planId ? { ...p, cameraOrder: order } : p))

  const updateZoneField = (planId, zoneId, patch) => {
    const plan = plans.find(p => p.id === planId)
    if (!plan) return
    updatePlanZones(planId, plan.zones.map(z => z.id === zoneId ? { ...z, ...patch } : z))
  }

  const deleteZone = (planId, zoneId) => {
    const plan = plans.find(p => p.id === planId)
    if (!plan) return
    updatePlanZones(planId, plan.zones.filter(z => z.id !== zoneId))
  }

  // ── SVG drawing ────────────────────────────────────────────────────────────
  const getSVGPt = (e) => {
    const svg = svgRef.current; if (!svg) return null
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    return pt.matrixTransform(svg.getScreenCTM().inverse())
  }

  const handleSvgClick = useCallback((e) => {
    if (!editMode || !activePlan || pendingPts) return
    const pt = getSVGPt(e); if (!pt) return
    const [nx, ny] = [pt.x, pt.y]

    if (drawTool === 'erase') {
      const hit = [...activePlan.zones].reverse().find(z => pointInPoly(nx, ny, z.points))
      if (hit) deleteZone(activePlan.id, hit.id)
      return
    }

    if (drawing.length >= 3) {
      const [fx, fy] = drawing[0]
      if (Math.hypot(nx - fx, ny - fy) < 14) {
        setPendingPts([...drawing])
        setNewName(`โซน ${activePlan.zones.length + 1}`)
        setNewColor(PALETTE[activePlan.zones.length % PALETTE.length])
        setNewCamId(cameras[0]?.id || '')
        setDrawing([])
        return
      }
    }
    setDrawing(prev => [...prev, [nx, ny]])
  }, [editMode, pendingPts, drawing, activePlan, cameras, drawTool])

  const handleSvgDblClick = useCallback((e) => {
    if (!editMode || drawTool !== 'draw' || pendingPts || drawing.length < 3 || !activePlan) return
    e.preventDefault()
    setPendingPts([...drawing])
    setNewName(`โซน ${activePlan.zones.length + 1}`)
    setNewColor(PALETTE[activePlan.zones.length % PALETTE.length])
    setNewCamId(cameras[0]?.id || '')
    setDrawing([])
  }, [editMode, drawTool, pendingPts, drawing, activePlan, cameras])

  const handleSvgContextMenu = useCallback((e) => {
    if (!editMode || drawTool !== 'draw') return
    e.preventDefault()
    setDrawing(prev => prev.slice(0, -1))
  }, [editMode, drawTool])

  const handleSvgMouseMove = useCallback((e) => {
    if (!editMode) return
    const pt = getSVGPt(e); if (!pt) return
    setMousePos([pt.x, pt.y])
    if (drawTool === 'erase' && activePlan) {
      const hit = [...activePlan.zones].reverse().find(z => pointInPoly(pt.x, pt.y, z.points))
      setHoveredZoneId(hit?.id || null)
    } else {
      setHoveredZoneId(null)
    }
  }, [editMode, drawTool, activePlan])

  const confirmZone = () => {
    if (!pendingPts || !newName.trim() || !activePlan) return
    const z = { id: Date.now().toString(), name: newName.trim(), points: pendingPts, cameraId: newCamId, color: newColor }
    updatePlanZones(activePlan.id, [...activePlan.zones, z])
    setPendingPts(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <Header>
        {activeFloor && (
          <button
            onClick={() => { setActiveFloor(null); setEditMode(false) }}
            style={{ marginLeft: 12, padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent', color: 'var(--muted)' }}
          >
            ← กลับ
          </button>
        )}
        {activePlan && (
          <button
            onClick={() => setEditMode(m => !m)}
            style={{
              marginLeft: 8, padding: '5px 14px', borderRadius: 6, fontSize: 12,
              fontWeight: 600, border: '1px solid', cursor: 'pointer',
              background: editMode ? 'var(--accent)' : 'transparent',
              color: editMode ? '#fff' : 'var(--muted)',
              borderColor: editMode ? 'var(--accent)' : 'var(--border)',
            }}
          >
            {editMode ? '✓ เสร็จแล้ว' : '✎ แก้ไขโซน'}
          </button>
        )}
        {activePlan && editMode && (
          <button onClick={() => deletePlan(activePlan.id)}
            style={{ marginLeft: 6, padding: '5px 10px', borderRadius: 6, fontSize: 12, border: '1px solid var(--danger)', cursor: 'pointer', background: 'transparent', color: 'var(--danger)' }}>
            🗑 ลบ
          </button>
        )}
        {activePlan && (
          <button
            onClick={e => { e.stopPropagation(); navigate(`/layer1?plan=${activePlan.id}${gatewayUrl ? '&gateway=' + encodeURIComponent(gatewayUrl) : ''}`) }}
            style={{ marginLeft: 8, padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1px solid var(--accent)', cursor: 'pointer', background: 'rgba(59,130,246,0.12)', color: 'var(--accent)' }}
          >
            ▶ Layer 1
          </button>
        )}
        {gatewayUrl && (
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)', marginLeft: 12 }}>
            {gatewayUrl}
          </span>
        )}
      </Header>

      {/* ── Status bar ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', height: 34, background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {activePlan ? (
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{activePlan.name}</span>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>ภาพรวม</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 5px var(--success)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
          {updateTime}
        </div>
      </div>

      {/* ── Floor plans ───────────────────────────────────────────────── */}
      {!activeFloor && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>

            {/* Floor plan cards section */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: '.06em', fontWeight: 600, textTransform: 'uppercase' }}>แผนผังชั้น</span>
                <button onClick={() => setShowModal(true)}
                  style={{ padding: '5px 14px', borderRadius: 7, border: '1px dashed var(--border2)', background: 'transparent', color: 'var(--accent2)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                  + เพิ่มแผนผัง
                </button>
              </div>
              {plans.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 10 }}>
                  ยังไม่มีแผนผัง — กด <strong style={{ color: 'var(--accent2)' }}>+ เพิ่มแผนผัง</strong> เพื่อสร้าง
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                  {plans.map(plan => (
                    <div key={plan.id}
                      onClick={() => { setActiveFloor(plan.id); setEditMode(false) }}
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
                        overflow: 'hidden', cursor: 'pointer', transition: 'border-color .15s, box-shadow .15s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
                    >
                      {/* Mini SVG preview */}
                      <div style={{ background: 'var(--bg)', aspectRatio: '16/9', position: 'relative', overflow: 'hidden' }}>
                        <svg viewBox={plan.vbox || '0 0 841.92 595.32'} style={{ width: '100%', height: '100%', display: 'block' }}>
                          {plan.bg === 'builtin:floor2' && <BuiltinFloor2 />}
                          {plan.bg !== 'builtin:floor2' && plan.bg !== 'blank' && (
                            <image href={plan.bg} x="0" y="0" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
                          )}
                          {plan.zones.map(z => {
                            const ci = camCounts[z.cameraId]
                            const cnt = ci?.total || 0
                            const active = z.cameraId && ci?.running && cnt > 0
                            const pts = z.points.map(p => p.join(',')).join(' ')
                            return (
                              <g key={z.id}>
                                <polygon points={pts} fill={active ? 'rgba(34,197,94,0.3)' : z.color + '22'} stroke={active ? '#22c55e' : z.color} strokeWidth="2" />
                              </g>
                            )
                          })}
                        </svg>
                      </div>
                      {/* Card footer */}
                      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{plan.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{plan.zones.length} โซน</div>
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/layer1?plan=${plan.id}${gatewayUrl ? '&gateway=' + encodeURIComponent(gatewayUrl) : ''}`) }}
                            style={{ marginTop: 6, padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, border: '1px solid var(--accent)', cursor: 'pointer', background: 'rgba(59,130,246,0.12)', color: 'var(--accent)' }}
                          >
                            ▶ ดู Layer 1
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {plan.zones.slice(0, 4).map(z => {
                            const ci = camCounts[z.cameraId]
                            const active = z.cameraId && ci?.running && (ci?.total || 0) > 0
                            return (
                              <span key={z.id} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10,
                                background: active ? 'rgba(34,197,94,0.15)' : 'var(--surface2)',
                                color: active ? '#22c55e' : 'var(--muted)',
                                border: `1px solid ${active ? 'rgba(34,197,94,0.35)' : 'var(--border)'}` }}>
                                {active ? '• มีคน' : z.name}
                              </span>
                            )
                          })}
                          {plan.zones.length > 4 && <span style={{ fontSize: 10, color: 'var(--muted)' }}>+{plan.zones.length - 4}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Floor plan editor ──────────────────────────────────────────── */}
      {activeFloor && activePlan && (
        <div style={{ flex: 1, overflow: 'hidden', display: editMode ? 'grid' : 'flex', gridTemplateColumns: editMode ? '1fr 300px' : undefined, flexDirection: 'column' }}>

          {/* SVG panel */}
          <div style={{ flex: 1, overflow: 'auto', position: 'relative', background: 'var(--bg)', padding: editMode ? 0 : '12px 24px 0' }}>

            {/* Colour legend */}
            {!editMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>ความหนาแน่น:</span>
                <div style={{ width: 130, height: 8, borderRadius: 4, background: 'linear-gradient(to right, rgb(59,130,246), rgb(245,158,11), rgb(239,68,44))' }} />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>น้อย → มาก</span>
              </div>
            )}

            <svg
              ref={svgRef}
              viewBox={activePlan.vbox || '0 0 841.92 595.32'}
              style={{ width: '100%', height: editMode ? '100%' : 'auto', display: 'block',
                cursor: !editMode ? 'default'
                  : drawTool === 'erase' ? (hoveredZoneId ? 'pointer' : 'crosshair')
                  : pendingPts ? 'default' : 'crosshair' }}
              onClick={handleSvgClick}
              onDblClick={handleSvgDblClick}
              onContextMenu={handleSvgContextMenu}
              onMouseMove={handleSvgMouseMove}
              onMouseLeave={() => { setMousePos(null); setHoveredZoneId(null) }}
            >
              {/* Background */}
              {activePlan.bg === 'builtin:floor2' && <BuiltinFloor2 />}
              {activePlan.bg !== 'builtin:floor2' && activePlan.bg !== 'blank' && (
                <image href={activePlan.bg} x="0" y="0" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
              )}

              {/* Saved zones */}
              {activePlan.zones.map(z => {
                const camInfo = camCounts[z.cameraId]
                const cnt     = camInfo?.total || 0
                const active  = !editMode && z.cameraId && camInfo?.running && cnt > 0
                const ratio   = Math.min(cnt / maxCount, 1)
                const isEraseHover = editMode && drawTool === 'erase' && hoveredZoneId === z.id
                const fill    = editMode ? (isEraseHover ? 'rgba(239,68,68,0.35)' : z.color + '2a') : cnt > 0 ? heatColor(ratio, 0.42) : 'rgba(255,255,255,0.025)'
                const stroke  = editMode ? (isEraseHover ? '#ef4444' : z.color) : active ? '#22c55e' : cnt > 0 ? heatColor(ratio, 0.9) : 'rgba(255,255,255,0.07)'
                const pts     = z.points.map(p => p.join(',')).join(' ')
                const [cx, cy] = centroid(z.points)
                return (
                  <g key={z.id}>
                    {active && <polygon points={pts} fill="none" stroke="#22c55e" strokeWidth="6" strokeOpacity="0.22" />}
                    <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={editMode ? '1.8' : active ? '3' : '2.5'} />
                    {editMode ? (
                      <text x={cx} y={cy + 5} textAnchor="middle" fill={z.color} fontSize="13" fontWeight="700" fontFamily="var(--mono)" style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.9))' }}>{z.name}</text>
                    ) : (
                      <>
                        <text x={cx} y={cy + 6} textAnchor="middle" fill={active ? '#22c55e' : 'rgba(255,255,255,0.25)'} fontSize="16" fontWeight="700" fontFamily="var(--sans)" style={{ filter: 'drop-shadow(0 1px 5px rgba(0,0,0,0.95))' }}>{active ? 'มีคน' : 'ว่าง'}</text>
                        <text x={cx} y={cy + 20} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="9" fontFamily="var(--sans)" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.9))' }}>{z.name}</text>
                      </>
                    )}
                  </g>
                )
              })}

              {/* Pending polygon */}
              {pendingPts && <polygon points={pendingPts.map(p=>p.join(',')).join(' ')} fill={newColor+'2a'} stroke={newColor} strokeWidth="2" strokeDasharray="8,4" />}

              {/* Drawing in progress */}
              {drawing.length > 0 && (() => {
                const preview = mousePos ? [...drawing, mousePos] : drawing
                return (
                  <g>
                    {preview.length >= 3 && <polygon points={preview.map(p=>p.join(',')).join(' ')} fill={newColor+'18'} stroke={newColor} strokeWidth="1.5" strokeDasharray="8,4" />}
                    {preview.length === 2 && <line x1={preview[0][0]} y1={preview[0][1]} x2={preview[1][0]} y2={preview[1][1]} stroke={newColor} strokeWidth="1.5" strokeDasharray="8,4" />}
                    {drawing.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i===0?8:5} fill={i===0?'#fff':newColor} stroke={newColor} strokeWidth="2" />)}
                  </g>
                )
              })()}
            </svg>

            {/* ── Inline new-zone popover (at polygon centroid) ─────────── */}
            {pendingPts && activePlan && (() => {
              const [cx, cy] = centroid(pendingPts)
              const [,, vw, vh] = (activePlan.vbox || '0 0 841.92 595.32').split(' ').map(Number)
              const pctX = Math.max(5, Math.min(72, cx / vw * 100))
              const pctY = Math.max(5, Math.min(80, cy / vh * 100))
              return (
                <div style={{
                  position: 'absolute', left: `${pctX}%`, top: `${pctY}%`,
                  transform: 'translate(-50%, -50%)',
                  background: 'rgba(14,14,22,0.97)', border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: 12, padding: '14px 16px', minWidth: 230, zIndex: 40,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)',
                  pointerEvents: 'all',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--accent2)', fontWeight: 700, letterSpacing: '.06em', marginBottom: 10 }}>ตั้งชื่อโซนใหม่</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
                      style={{ width: 30, height: 30, border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0, flexShrink: 0 }} />
                    <input
                      value={newName} onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') confirmZone(); if (e.key === 'Escape') setPendingPts(null) }}
                      placeholder="ชื่อโซน…" autoFocus
                      style={{ flex: 1, fontSize: 13, fontWeight: 600, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', outline: 'none', padding: '6px 10px' }}
                    />
                  </div>
                  <select value={newCamId} onChange={e => setNewCamId(e.target.value)}
                    style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', width: '100%', fontSize: 12, marginBottom: 12 }}>
                    <option value="">— ไม่เชื่อมกล้อง —</option>
                    {cameras.map((c, i) => <option key={c.id} value={c.id}>#{i + 1} {c.name || c.id}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn sm primary" style={{ flex: 1 }} onClick={confirmZone} disabled={!newName.trim()}>✓ บันทึก</button>
                    <button className="btn sm" onClick={() => setPendingPts(null)}>✕</button>
                  </div>
                </div>
              )
            })()}

            {/* ── Floating draw toolbar ────────────────────────────────── */}
            {editMode && (
              <div style={{
                position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
                display: 'flex', alignItems: 'center', gap: 4, zIndex: 30,
                background: 'rgba(14,14,22,0.93)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 14, padding: '8px 12px', backdropFilter: 'blur(10px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)', pointerEvents: 'all',
              }}>
                <button
                  onClick={() => { setDrawTool('draw'); setDrawing([]); setPendingPts(null); setHoveredZoneId(null) }}
                  title="วาด polygon (คลิกขวา = ถอย)"
                  style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', transition: 'all .15s',
                    background: drawTool === 'draw' ? 'var(--accent)' : 'rgba(255,255,255,0.07)',
                    color: drawTool === 'draw' ? '#fff' : 'var(--muted)', fontSize: 13, fontWeight: 600 }}>
                  ✏️ วาด
                </button>
                <button
                  onClick={() => { setDrawTool('erase'); setDrawing([]); setPendingPts(null) }}
                  title="คลิกบนโซนเพื่อลบ"
                  style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', transition: 'all .15s',
                    background: drawTool === 'erase' ? '#ef4444' : 'rgba(255,255,255,0.07)',
                    color: drawTool === 'erase' ? '#fff' : 'var(--muted)', fontSize: 13, fontWeight: 600 }}>
                  🗑 ลบ
                </button>
                <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} title="สีโซนใหม่">
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>สี</span>
                  <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
                    style={{ width: 26, height: 26, border: 'none', borderRadius: 5, cursor: 'pointer', padding: 0, background: 'none' }} />
                </label>
                <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />
                <button
                  onClick={() => setDrawing(p => p.slice(0, -1))}
                  disabled={drawing.length === 0}
                  title="ถอยจุดสุดท้าย (หรือคลิกขวาบน map)"
                  style={{ padding: '4px 10px', borderRadius: 8, border: 'none', fontSize: 18, lineHeight: 1,
                    cursor: drawing.length > 0 ? 'pointer' : 'default', background: 'transparent',
                    color: drawing.length > 0 ? 'var(--text)' : 'rgba(255,255,255,0.2)' }}>
                  ↩
                </button>
                <span style={{ fontSize: 11, color: 'var(--muted)', paddingLeft: 4, whiteSpace: 'nowrap', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {drawTool === 'erase'
                    ? (hoveredZoneId ? 'คลิกเพื่อลบโซน' : 'hover โซน → คลิกลบ')
                    : pendingPts ? ''
                    : drawing.length === 0 ? 'คลิกบน map เพื่อเริ่มวาด'
                    : drawing.length < 3 ? `${drawing.length} จุด (ต้องการ ≥ 3)`
                    : `${drawing.length} จุด — ดับเบิลคลิก หรือคลิก ⚪ ปิด`}
                </span>
              </div>
            )}
          </div>

          {/* ── Edit sidebar — zone list only ──────────────────────────── */}
          {editMode && (
            <aside style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto', width: 260, flexShrink: 0 }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', letterSpacing: '.06em', fontWeight: 600 }}>
                โซนทั้งหมด ({activePlan.zones.length})
              </div>
              {activePlan.zones.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '30px 16px', lineHeight: 1.9 }}>
                  ยังไม่มีโซน<br />เลือก ✏️ วาด<br />แล้วคลิกบน map
                </p>
              ) : (
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {activePlan.zones.map(z => (
                    <div key={z.id} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                        <input type="color" value={z.color} onChange={e => updateZoneField(activePlan.id, z.id, { color: e.target.value })}
                          style={{ width: 22, height: 22, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 0, background: 'none', flexShrink: 0 }} />
                        <input value={z.name} onChange={e => updateZoneField(activePlan.id, z.id, { name: e.target.value })}
                          style={{ flex: 1, fontSize: 13, fontWeight: 600, background: 'transparent', border: 'none', borderBottom: '1px solid var(--border2)', color: 'var(--text)', outline: 'none', padding: '2px 0' }} />
                        <button onClick={() => deleteZone(activePlan.id, z.id)}
                          style={{ border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 15, padding: '2px 4px', borderRadius: 4, lineHeight: 1 }}
                          title="ลบโซน">✕</button>
                      </div>
                      <select value={z.cameraId || ''} onChange={e => updateZoneField(activePlan.id, z.id, { cameraId: e.target.value })}
                        style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 7px', width: '100%', fontSize: 11 }}>
                        <option value="">— ไม่เชื่อมกล้อง —</option>
                        {cameras.map((c, i) => <option key={c.id} value={c.id}>#{i + 1} {c.name || c.id}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Camera order for Layer 1 ───────────────── */}
              {cameras.length > 0 && (() => {
                const order = activePlan.cameraOrder || cameras.map(c => c.id)
                return (
                  <div>
                    <div style={{ padding: '12px 18px 8px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', letterSpacing: '.06em', fontWeight: 600 }}>
                      ลำดับกล้อง Layer 1
                    </div>
                    <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {order.map((camId, idx) => {
                        const cam = cameras.find(c => c.id === camId)
                        if (!cam) return null
                        return (
                          <div key={camId} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface2)', borderRadius: 6, padding: '5px 8px', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--mono)', fontWeight: 700, minWidth: 22 }}>#{idx + 1}</span>
                            <span style={{ flex: 1, fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cam.name || cam.id}</span>
                            <button
                              disabled={idx === 0}
                              onClick={() => {
                                const o = [...order]; [o[idx - 1], o[idx]] = [o[idx], o[idx - 1]]
                                updateCameraOrder(activePlan.id, o)
                              }}
                              style={{ border: 'none', background: 'transparent', color: idx === 0 ? 'rgba(255,255,255,0.15)' : 'var(--muted)', cursor: idx === 0 ? 'default' : 'pointer', fontSize: 13, padding: '1px 3px', lineHeight: 1 }}>&#8593;</button>
                            <button
                              disabled={idx === order.length - 1}
                              onClick={() => {
                                const o = [...order]; [o[idx], o[idx + 1]] = [o[idx + 1], o[idx]]
                                updateCameraOrder(activePlan.id, o)
                              }}
                              style={{ border: 'none', background: 'transparent', color: idx === order.length - 1 ? 'rgba(255,255,255,0.15)' : 'var(--muted)', cursor: idx === order.length - 1 ? 'default' : 'pointer', fontSize: 13, padding: '1px 3px', lineHeight: 1 }}>&#8595;</button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

            </aside>
          )}

          {/* Zone detail cards (view mode) */}
          {!editMode && activePlan.zones.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, padding: '12px 24px 16px', flexShrink: 0 }}>
              {activePlan.zones.map(z => {
                const camInfo  = camCounts[z.cameraId]
                const cnt      = camInfo?.total || 0
                const isActive = z.cameraId && camInfo?.running && cnt > 0
                const camName  = cameras.find(c => c.id === z.cameraId)?.name
                return (
                  <div key={z.id} style={{ background: 'var(--surface)', border: `1px solid ${isActive ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`, borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: z.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 70 }}>{z.name}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? '#22c55e' : 'rgba(255,255,255,0.25)' }}>{isActive ? 'มีคน' : 'ว่าง'}</span>
                    </div>
                    {camName && <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📷 {camName}</div>}
                  </div>
                )
              })}
            </div>
          )}
          {!editMode && activePlan.zones.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: 13, flexShrink: 0 }}>
              ยังไม่มีโซน — กด <strong style={{ color: 'var(--accent2)' }}>✎ แก้ไขโซน</strong> เพื่อวาดและเชื่อมกล้อง
            </div>
          )}
        </div>
      )}

      {/* ── Add floor modal ────────────────────────────────────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 28, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: 'var(--text)' }}>เพิ่ม Floor Plan ใหม่</div>

            <div className="field">
              <label>ชื่อ Floor</label>
              <input value={modalName} onChange={e => setModalName(e.target.value)} placeholder="เช่น ชั้น 1, ชั้น 2, อาคาร A" autoFocus />
            </div>

            <div className="field">
              <label>พื้นหลัง Map</label>
              <select value={modalBgType} onChange={e => setModalBgType(e.target.value)} style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', width: '100%' }}>
                <option value="builtin:floor2">แผนผัง Floor 2 (built-in)</option>
                <option value="snapshot">ถ่าย Snapshot จากกล้อง</option>
                <option value="image">อัปโหลดรูปภาพ</option>
                <option value="blank">ว่าง (ไม่มีพื้นหลัง)</option>
              </select>
            </div>

            {modalBgType === 'snapshot' && (
              <div className="field">
                <label>เลือกกล้อง</label>
                <select value={modalSnapCam} onChange={e => setModalSnapCam(e.target.value)} style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', width: '100%' }}>
                  <option value="">— เลือกกล้อง —</option>
                  {cameras.map(c => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
                </select>
              </div>
            )}

            {modalBgType === 'image' && (
              <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="btn sm" onClick={() => floorImgRef.current?.click()}>🖼 เลือกไฟล์</button>
                <input ref={floorImgRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files[0]; if (!file) return
                    const reader = new FileReader()
                    reader.onload = ev => setModalBgData(ev.target.result)
                    reader.readAsDataURL(file)
                  }} />
                {modalBgData && <span style={{ fontSize: 11, color: 'var(--success)' }}>✓ โหลดแล้ว</span>}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
              <button
                className="btn sm primary" style={{ flex: 1 }}
                onClick={createPlan}
                disabled={!modalName.trim() || modalLoading}
              >
                {modalLoading ? '...' : '✓ สร้าง Floor'}
              </button>
              <button className="btn sm" onClick={() => { setShowModal(false); setModalName(''); setModalBgType('builtin:floor2'); setModalBgData(null); setModalSnapCam('') }}>
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
