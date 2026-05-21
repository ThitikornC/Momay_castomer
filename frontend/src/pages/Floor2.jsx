import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import Header from '../components/Header.jsx'

const STORAGE_KEY = 'floor2_zones'
const PREVIEW_CAM1_KEY = 'preview_cam1_id'
const T = 'matrix(0,-.75,.75,0,-.000061035159,595.32)'
const PALETTE = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7','#06b6d4','#ec4899','#84cc16','#f97316','#14b8a6']

function heatColor(ratio, alpha = 0.45) {
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

function loadZones() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function persistZones(zones) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(zones))
}

/* ── Floor-plan structural paths (same as original SVG, dark-theme colours) ── */
function FloorPlanLines() {
  return (
    <g transform={T} strokeLinecap="round" strokeLinejoin="round" fill="none">
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

export default function Floor2() {
  const [searchParams] = useSearchParams()
  const apiBase = (searchParams.get('gateway') || '').replace(/\/$/, '')
  const svgRef = useRef(null)

  /* ── Persistent zones (localStorage) ─────────────────────────────────────── */
  const [zones, setZones] = useState(loadZones)

  /* ── Camera data ──────────────────────────────────────────────────────────── */
  const [cameras, setCameras] = useState([])
  const [camCounts, setCamCounts] = useState({})   // id → {total, running}
  const [updateTime, setUpdateTime] = useState('—')
  const [maxCount, setMaxCount] = useState(1)

  /* ── Edit mode state ──────────────────────────────────────────────────────── */
  const [editMode, setEditMode] = useState(false)
  /* ── Preview Camera 1 (for Layer1.1 preview page) ─────────────────── */
  const [previewCam1, setPreviewCam1] = useState(() => localStorage.getItem(PREVIEW_CAM1_KEY) || '')  const [drawing, setDrawing] = useState([])        // [[x,y]…] SVG-space points in progress
  const [mousePos, setMousePos] = useState(null)    // live cursor for rubber-band line
  const [pendingPts, setPendingPts] = useState(null) // finished polygon awaiting config
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PALETTE[0])
  const [newCamId, setNewCamId] = useState('')

  /* ── Fetch camera list (always, for dropdowns) ────────────────────────────── */
  useEffect(() => {
    fetch(apiBase + '/api/cameras').then(r => r.ok ? r.json() : []).then(setCameras).catch(() => {})
  }, [apiBase])

  /* ── Fetch counts (view mode, every 2 s) ─────────────────────────────────── */
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(apiBase + '/api/cameras')
      if (!res.ok) return
      const data = await res.json()
      const counts = {}
      data.forEach(c => { counts[c.id] = { total: c.total_people || 0, running: c.running } })
      const peak = Math.max(...data.map(c => c.total_people || 0), 1)
      setMaxCount(prev => Math.max(prev, peak))
      setCamCounts(counts)
      setUpdateTime(new Date().toLocaleTimeString('th-TH'))
    } catch (_) {}
  }, [apiBase])

  useEffect(() => {
    fetchData()
    if (editMode) return
    const id = setInterval(fetchData, 2000)
    return () => clearInterval(id)
  }, [fetchData, editMode])

  /* ── SVG coordinate helper ────────────────────────────────────────────────── */
  const getSVGPt = (e) => {
    const svg = svgRef.current
    if (!svg) return null
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    return pt.matrixTransform(svg.getScreenCTM().inverse())
  }

  /* ── Drawing handlers ─────────────────────────────────────────────────────── */
  const handleSvgClick = useCallback((e) => {
    if (!editMode || pendingPts) return
    const pt = getSVGPt(e)
    if (!pt) return
    const [nx, ny] = [pt.x, pt.y]

    // Close polygon if clicking near first point (≥3 points already)
    if (drawing.length >= 3) {
      const [fx, fy] = drawing[0]
      if (Math.hypot(nx - fx, ny - fy) < 14) {
        setPendingPts([...drawing])
        setNewName(`โซน ${zones.length + 1}`)
        setNewColor(PALETTE[zones.length % PALETTE.length])
        setNewCamId(cameras[0]?.id || '')
        setDrawing([])
        return
      }
    }
    setDrawing(prev => [...prev, [nx, ny]])
  }, [editMode, pendingPts, drawing, zones, cameras])

  const handleSvgMouseMove = useCallback((e) => {
    if (!editMode) return
    const pt = getSVGPt(e)
    if (pt) setMousePos([pt.x, pt.y])
  }, [editMode])

  /* ── Zone CRUD ────────────────────────────────────────────────────────────── */
  const confirmZone = () => {
    if (!pendingPts || !newName.trim()) return
    const z = { id: Date.now().toString(), name: newName.trim(), points: pendingPts, cameraId: newCamId, color: newColor }
    const updated = [...zones, z]
    setZones(updated); persistZones(updated)
    setPendingPts(null)
  }

  const cancelPending = () => { setPendingPts(null); setDrawing([]) }

  const deleteZone = (id) => {
    const updated = zones.filter(z => z.id !== id)
    setZones(updated); persistZones(updated)
  }

  const updateZoneField = (id, patch) => {
    const updated = zones.map(z => z.id === id ? { ...z, ...patch } : z)
    setZones(updated); persistZones(updated)
  }

  const grandTotal = zones.reduce((s, z) => s + (camCounts[z.cameraId]?.total || 0), 0)

  /* ── Render ───────────────────────────────────────────────────────────────── */
  return (
    <div className="page">
      <Header title="FLOOR 2 – HEATMAP">
        {/* Preview Camera 1 selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Preview กล้อง 1:</label>
          <select
            value={previewCam1}
            onChange={e => {
              setPreviewCam1(e.target.value)
              localStorage.setItem(PREVIEW_CAM1_KEY, e.target.value)
            }}
            style={{ fontSize: 11, padding: '3px 6px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}
          >
            <option value="">— ไม่ได้เลือก —</option>
            {cameras.map(c => (
              <option key={c.id} value={c.id}>{c.id}{c.name ? ` – ${c.name}` : ''}</option>
            ))}
          </select>
        </div>
        {/* Edit toggle */}
        <button
          onClick={() => { setEditMode(m => !m); setDrawing([]); setPendingPts(null) }}
          style={{
            marginLeft: 12, padding: '5px 14px', borderRadius: 6, fontSize: 12,
            fontWeight: 600, border: '1px solid', cursor: 'pointer',
            background: editMode ? 'var(--accent)' : 'transparent',
            color: editMode ? '#fff' : 'var(--muted)',
            borderColor: editMode ? 'var(--accent)' : 'var(--border)',
          }}
        >
          {editMode ? '✓ เสร็จแล้ว' : '✎ แก้ไขโซน'}
        </button>
      </Header>

      {/* Summary bar (view mode only) */}
      {!editMode && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 24, padding: '10px 24px',
          background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          flexShrink: 0, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 600, color: 'var(--accent2)', lineHeight: 1 }}>{grandTotal}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>คนทั้งหมด</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 5px var(--success)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            {updateTime}
          </div>
        </div>
      )}

      {/* Body — split layout in edit mode */}
      <div style={{
        flex: 1, overflow: 'hidden',
        display: editMode ? 'grid' : 'flex',
        gridTemplateColumns: editMode ? '1fr 300px' : undefined,
        flexDirection: editMode ? undefined : 'column',
      }}>

        {/* ── SVG floor-plan panel ────────────────────────────────────────────── */}
        <div style={{
          flex: 1, overflow: 'auto', position: 'relative',
          background: editMode ? '#0a0c10' : 'var(--bg)',
          padding: editMode ? 0 : '12px 24px 0',
        }}>
          {/* Drawing hint */}
          {editMode && (
            <div style={{
              position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
              zIndex: 10, background: 'rgba(0,0,0,.75)', color: 'var(--muted)',
              fontSize: 12, padding: '5px 14px', borderRadius: 20,
              pointerEvents: 'none', whiteSpace: 'nowrap',
            }}>
              {pendingPts
                ? 'กรอกชื่อโซนและเลือกกล้อง → กด บันทึกโซน'
                : drawing.length === 0
                  ? 'คลิกบน floor plan เพื่อเริ่มวาดโซน'
                  : drawing.length < 3
                    ? `${drawing.length} จุด — คลิกเพิ่มจุด (ต้องการ ≥ 3)`
                    : `${drawing.length} จุด — คลิกจุดแรก ⚪ หรือกด ✓ เพื่อปิด polygon`}
            </div>
          )}

          {/* Colour legend (view mode) */}
          {!editMode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>ความหนาแน่น:</span>
              <div style={{ width: 140, height: 8, borderRadius: 4, background: 'linear-gradient(to right, rgb(59,130,246), rgb(245,158,11), rgb(239,68,44))' }} />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>น้อย → มาก</span>
            </div>
          )}

          <svg
            ref={svgRef}
            viewBox="0 0 841.92 595.32"
            style={{
              width: '100%',
              height: editMode ? '100%' : 'auto',
              display: 'block',
              cursor: editMode && !pendingPts ? 'crosshair' : 'default',
            }}
            onClick={handleSvgClick}
            onMouseMove={handleSvgMouseMove}
            onMouseLeave={() => setMousePos(null)}
          >
            <FloorPlanLines />

            {/* ── Saved zones ─────────────────────────────────────────────────── */}
            {zones.map(z => {
              const camInfo = camCounts[z.cameraId]
              const cnt = camInfo?.total || 0
              const active = !editMode && z.cameraId && camInfo?.running && cnt > 0
              const ratio = Math.min(cnt / maxCount, 1)
              const fill = editMode
                ? z.color + '2a'
                : cnt > 0 ? heatColor(ratio, 0.42) : 'rgba(255,255,255,0.025)'
              const stroke = editMode
                ? z.color
                : active
                  ? '#22c55e'
                  : cnt > 0 ? heatColor(ratio, 0.9) : 'rgba(255,255,255,0.07)'
              const strokeW = editMode ? '1.8' : active ? '3' : '2.5'
              const pts = z.points.map(p => p.join(',')).join(' ')
              const [cx, cy] = centroid(z.points)
              const numCol = cnt >= 20 ? '#ef4444' : cnt >= 10 ? '#f59e0b' : '#60a5fa'

              return (
                <g key={z.id}>
                  {/* Active glow layer */}
                  {active && (
                    <polygon points={pts} fill="none"
                      stroke="#22c55e" strokeWidth="6" strokeOpacity="0.22" />
                  )}
                  <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={strokeW} />
                  {editMode ? (
                    <text x={cx} y={cy + 5} textAnchor="middle" fill={z.color}
                      fontSize="13" fontWeight="700" fontFamily="var(--mono)"
                      style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.9))' }}>
                      {z.name}
                    </text>
                  ) : (
                    <>
                      {/* Status label: มีคน / ว่าง */}
                      <text x={cx} y={cy + 6} textAnchor="middle"
                        fill={active ? '#22c55e' : 'rgba(255,255,255,0.25)'}
                        fontSize="16" fontWeight="700" fontFamily="var(--sans)"
                        style={{ filter: 'drop-shadow(0 1px 5px rgba(0,0,0,0.95))' }}>
                        {active ? 'มีคน' : 'ว่าง'}
                      </text>
                      <text x={cx} y={cy + 20} textAnchor="middle" fill="rgba(255,255,255,0.45)"
                        fontSize="9" fontFamily="var(--sans)"
                        style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.9))' }}>
                        {z.name}
                      </text>
                    </>
                  )}
                </g>
              )
            })}

            {/* ── Pending polygon (completed, awaiting config) ─────────────────── */}
            {pendingPts && (
              <polygon
                points={pendingPts.map(p => p.join(',')).join(' ')}
                fill={newColor + '2a'} stroke={newColor} strokeWidth="2" strokeDasharray="8,4"
              />
            )}

            {/* ── Drawing in progress ──────────────────────────────────────────── */}
            {drawing.length > 0 && (() => {
              const preview = mousePos ? [...drawing, mousePos] : drawing
              return (
                <g>
                  {preview.length >= 3 && (
                    <polygon
                      points={preview.map(p => p.join(',')).join(' ')}
                      fill={newColor + '18'} stroke={newColor} strokeWidth="1.5" strokeDasharray="8,4"
                    />
                  )}
                  {preview.length === 2 && (
                    <line x1={preview[0][0]} y1={preview[0][1]} x2={preview[1][0]} y2={preview[1][1]}
                      stroke={newColor} strokeWidth="1.5" strokeDasharray="8,4" />
                  )}
                  {mousePos && drawing.length >= 1 && preview.length < 3 && (
                    <line x1={drawing[drawing.length - 1][0]} y1={drawing[drawing.length - 1][1]}
                      x2={mousePos[0]} y2={mousePos[1]}
                      stroke={newColor} strokeWidth="1.5" strokeDasharray="6,4" />
                  )}
                  {drawing.map((p, i) => (
                    <circle key={i} cx={p[0]} cy={p[1]} r={i === 0 ? 8 : 5}
                      fill={i === 0 ? '#fff' : newColor} stroke={newColor} strokeWidth="2" />
                  ))}
                </g>
              )
            })()}
          </svg>
        </div>

        {/* ── Edit sidebar ─────────────────────────────────────────────────────── */}
        {editMode && (
          <aside style={{
            background: 'var(--surface)', borderLeft: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', overflowY: 'auto',
          }}>

            {/* New zone config — appears after polygon is closed */}
            {pendingPts ? (
              <div style={{ padding: 20, borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--accent2)', fontWeight: 600, letterSpacing: '.05em', marginBottom: 14 }}>
                  กำหนดโซนใหม่
                </div>
                <div className="field">
                  <label>ชื่อโซน</label>
                  <input value={newName} onChange={e => setNewName(e.target.value)}
                    placeholder="เช่น ห้องเรียน A" autoFocus />
                </div>
                <div className="field">
                  <label>สีโซน</label>
                  <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} />
                </div>
                <div className="field">
                  <label>เชื่อมกล้อง</label>
                  <select value={newCamId} onChange={e => setNewCamId(e.target.value)}
                    style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', width: '100%' }}>
                    <option value="">— ไม่เชื่อมกล้อง —</option>
                    {cameras.map(c => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn sm primary" style={{ flex: 1 }} onClick={confirmZone} disabled={!newName.trim()}>
                    ✓ บันทึกโซน
                  </button>
                  <button className="btn sm" onClick={cancelPending}>✕ ยกเลิก</button>
                </div>
              </div>
            ) : (
              /* Drawing tools — shown while no pending polygon */
              <div style={{ padding: 20, borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--accent2)', fontWeight: 600, letterSpacing: '.05em', marginBottom: 14 }}>
                  วาดโซนใหม่
                </div>
                <div className="field">
                  <label>สีโซน</label>
                  <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} />
                </div>
                {drawing.length > 0 ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                    {drawing.length >= 3 && (
                      <button className="btn sm primary" onClick={() => {
                        setPendingPts([...drawing])
                        setNewName(`โซน ${zones.length + 1}`)
                        setNewCamId(cameras[0]?.id || '')
                        setDrawing([])
                      }}>✓ ปิด polygon</button>
                    )}
                    <button className="btn sm" onClick={() => setDrawing(p => p.slice(0, -1))}>↩ ถอย</button>
                    <button className="btn sm" onClick={() => setDrawing([])}>✕ ล้าง</button>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.7 }}>
                    คลิกบน floor plan เพื่อเพิ่มจุด<br />
                    คลิกจุดแรก ⚪ หรือกด ✓ ปิด เพื่อสร้างโซน
                  </p>
                )}
              </div>
            )}

            {/* Zone list */}
            <div style={{ padding: 20, flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.05em', marginBottom: 12 }}>
                โซนทั้งหมด ({zones.length})
              </div>
              {zones.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '20px 0', lineHeight: 1.8 }}>
                  ยังไม่มีโซน<br />คลิกบน floor plan เพื่อวาด
                </p>
              ) : (
                zones.map(z => (
                  <div key={z.id} style={{
                    background: 'var(--surface2)', borderRadius: 8, padding: 12,
                    marginBottom: 8, border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <input type="color" value={z.color}
                        onChange={e => updateZoneField(z.id, { color: e.target.value })}
                        style={{ width: 24, height: 24, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 0, background: 'none' }} />
                      <input value={z.name} onChange={e => updateZoneField(z.id, { name: e.target.value })}
                        style={{
                          flex: 1, fontSize: 13, fontWeight: 600, background: 'transparent',
                          border: 'none', borderBottom: '1px solid var(--border2)', color: 'var(--text)',
                          outline: 'none', padding: '2px 0',
                        }} />
                      <button className="btn sm danger" onClick={() => deleteZone(z.id)}
                        style={{ padding: '2px 7px', fontSize: 11 }}>🗑</button>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 5 }}>กล้อง:</div>
                    <select value={z.cameraId || ''} onChange={e => updateZoneField(z.id, { cameraId: e.target.value })}
                      style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 7px', width: '100%', fontSize: 12 }}>
                      <option value="">— ไม่เชื่อมกล้อง —</option>
                      {cameras.map(c => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
                    </select>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ── Zone detail cards (view mode) ───────────────────────────────────── */}
      {!editMode && zones.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: 10, padding: '12px 24px 16px', flexShrink: 0,
        }}>
          {zones.map(z => {
            const camInfo = camCounts[z.cameraId]
            const cnt = camInfo?.total || 0
            const isActive = z.cameraId && camInfo?.running && cnt > 0
            const camName = cameras.find(c => c.id === z.cameraId)?.name
            return (
              <div key={z.id} style={{
                background: 'var(--surface)',
                border: `1px solid ${isActive ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`,
                borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: z.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 70 }}>{z.name}</span>
                  </div>
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    color: isActive ? '#22c55e' : 'rgba(255,255,255,0.25)',
                  }}>{isActive ? 'มีคน' : 'ว่าง'}</span>
                </div>
                {camName && (
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    📷 {camName}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!editMode && zones.length === 0 && (
        <div style={{ textAlign: 'center', padding: '28px 24px', color: 'var(--muted)', fontSize: 13, flexShrink: 0 }}>
          ยังไม่มีโซน — กด{' '}
          <strong style={{ color: 'var(--accent2)' }}>✎ แก้ไขโซน</strong>{' '}
          เพื่อวาดโซนและเชื่อมกล้องบน floor plan
        </div>
      )}
    </div>
  )
}
