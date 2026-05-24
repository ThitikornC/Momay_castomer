import { useState, useEffect, useRef, useCallback } from 'react'
import { Layers, Building2 } from 'lucide-react'
import LayerGreedy from './LayerGreedy.jsx'
import LayerDP from './LayerDP.jsx'

// ── Animated heatmap ───────────────────────────────────────────────────────
const HEAT_PALETTE = [
  '#000066','#0000cc','#0033ff','#0077ff','#00aaff',
  '#00ddcc','#00cc88','#44dd00','#aaee00','#ffff00',
  '#ffcc00','#ff8800','#ff4400','#ff0000','#cc0000',
]

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

function HeatmapAnimatedCanvas({ floorIdx, opacity }) {
  const [cells, setCells] = useState([])
  const polyRefs = useRef([])
  const raf = useRef(null)

  // Load cells once (shared promise — all floors reuse same data)
  useEffect(() => {
    _CELLS_PROMISE.then(setCells)
  }, [])

  // Start/restart animation when cells are ready or floorIdx changes
  useEffect(() => {
    if (!cells.length) return
    let t = floorIdx * 17.3
    let running = true
    function draw() {
      t += 0.013
      for (let idx = 0; idx < cells.length; idx++) {
        const [r, c] = cells[idx]
        const h = (
          Math.sin(r*0.28 + c*0.21 + t)               * 0.40 +
          Math.cos(r*0.14 - c*0.33 + t*1.3)            * 0.35 +
          Math.sin((r-c)*0.09 + t*0.75 + floorIdx*0.9) * 0.25 + 1
        ) / 2
        const poly = polyRefs.current[idx]
        if (poly) poly.setAttribute('fill', HEAT_PALETTE[Math.round(h*(HEAT_PALETTE.length-1))])
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

const FLOORS = [
  { id: 1, img: '/Floorplan/Floor1plan.png', heatmap: '/Floorplan/HeatmapgridFloor1.svg' },
  { id: 2, img: '/Floorplan/Floor2plan.png', heatmap: '/Floorplan/HeatmapgridFloor2.svg' },
  { id: 3, img: '/Floorplan/Floor3plan.png', heatmap: '/Floorplan/HeatmapgridFloor3.svg' },
  { id: 4, img: '/Floorplan/Floor4plan.png', heatmap: '/Floorplan/HeatmapgridFloor4.svg' },
  { id: 5, img: '/Floorplan/Floor5plan.png', heatmap: '/Floorplan/HeatmapgridFloor5.svg' },
  { id: 6, img: '/Floorplan/Floor6plan.png', heatmap: '/Floorplan/HeatmapgridFloor6.svg' },
]

// Stage configs
const STAGES = [
  { key: 'stacked',  label: 'ทุกชั้น',    gap: 18,  desc: 'All floors stacked'   },
  { key: 'exploded', label: 'แต่ละชั้น',  gap: 44,  desc: 'Exploded view'        },
  { key: 'single',   label: 'เฉพาะชั้น',  gap: 44,  desc: 'Selected floor only'  },
]

const FLOOR_W   = 180   // px — width of each floor image in the viewer
const IMG_RATIO = 1.0   // PNG images are square (1024×1024)

export default function RelationshipLayer() {
  const [stage, setStage]           = useState('stacked')
  const [selectedFloor, setSelected] = useState(2)   // 0-based index
  const idleTimer = useRef(null)
  const viewerRef = useRef(null)

  // Reset to stacked after 10s of inactivity (only when not already stacked)
  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setStage('stacked'), 10000)
  }, [])

  // Non-passive wheel listener so preventDefault() actually stops page scroll
  useEffect(() => {
    const el = viewerRef.current
    if (!el) return
    const onWheel = e => {
      e.preventDefault()
      const dir = e.deltaY > 0 ? -1 : 1
      setSelected(prev => Math.max(0, Math.min(FLOORS.length - 1, prev + dir)))
      setStage('single')
      resetIdle()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [resetIdle])

  useEffect(() => {
    if (stage !== 'stacked') resetIdle()
    else if (idleTimer.current) clearTimeout(idleTimer.current)
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current) }
  }, [stage, resetIdle])

  const cfg = STAGES.find(s => s.key === stage)

  // Fixed height based on max (exploded) gap — container never resizes
  const imgH      = Math.round(FLOOR_W * IMG_RATIO)
  const numFloors = FLOORS.length
  const MAX_GAP   = 44
  const FIXED_H   = imgH + (numFloors - 1) * MAX_GAP + 32  // constant height
  const totalH    = FIXED_H  // always the same regardless of stage

  // Y position of floor i — stack centered vertically with upward bias
  const stackH  = imgH + (numFloors - 1) * cfg.gap   // total visual height of stack
  const topPad  = Math.max(8, Math.round((FIXED_H - stackH) / 2) - 40) // center - 40px shift up

  function floorY(i) {
    // floor i=5 (ชั้น 6) at topPad, floor i=0 (ชั้น 1) at topPad + (numFloors-1)*gap
    return topPad + (numFloors - 1 - i) * cfg.gap
  }

  function handleFloorClick(i) {
    if (stage === 'single' && i === selectedFloor) {
      setStage('exploded')  // click same floor → back to exploded (all floors visible)
    } else {
      setSelected(i)
      if (stage === 'exploded') setStage('single')
      // single: just switch selected floor, stay in single mode
    }
  }

  return (
    <div
      className="min-h-screen w-full flex flex-col gap-4 px-2 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8"
      style={{ background: '#030d0c', fontFamily: 'Inter,sans-serif' }}
    >
      {/* ══ Relationship Layer — กรอบบน ══ */}
      <div
        className="w-full rounded-2xl flex flex-col"
        style={{
          border: '2px solid rgba(217,70,239,0.55)',
          background: '#0a020f',
          boxShadow: '0 0 40px rgba(217,70,239,0.12), inset 0 1px 0 rgba(217,70,239,0.1)',
          overflow: 'hidden',
          height: FIXED_H + 104,  // header(~56) + py-4 viewer padding(32) + extra(16)
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(217,70,239,0.2)', background: 'rgba(217,70,239,0.06)' }}
        >
          <div
            className="flex items-center justify-center rounded-lg flex-shrink-0"
            style={{ width: 32, height: 32, background: 'rgba(217,70,239,0.12)', border: '1px solid rgba(217,70,239,0.35)' }}
          >
            <Layers size={16} color="#d946ef" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-wider text-white flex flex-wrap items-baseline gap-1.5">
              RELATIONSHIP LAYER
            </h1>
            <p className="text-[10px] font-light mt-0.5" style={{ color: '#d946ef' }}>
              การเชื่อมข้อมูลหลายประเภทเข้าด้วยกัน เพื่ออธิบายเหตุ ผล กระทบ และพฤติกรรมของอาคาร
            </p>
          </div>

        </div>

        {/* ── Floor Plan Viewer ── */}
        <div
          className="flex items-center justify-center py-4 px-6"
          style={{ height: FIXED_H + 48 }}
        >
          <div ref={viewerRef} className="relative" style={{ width: FLOOR_W, height: FIXED_H }}>
            {/* Render floors bottom (ชั้น 1) first so upper floors overlap correctly */}
            {FLOORS.map((floor, i) => {
              const isSelected  = i === selectedFloor
              const isSingle    = stage === 'single'
              const isInactive  = isSingle && !isSelected
              const isHighlight = stage === 'exploded' && isSelected

              return (
                <div
                  key={floor.id}
                  onClick={() => stage === 'stacked' ? setStage('exploded') : handleFloorClick(i)}
                  style={{
                    position: 'absolute',
                    left: isSingle && isSelected ? '50%' : 0,
                    top: isSingle && isSelected ? Math.round((FIXED_H - imgH) / 2) : floorY(i),
                    transform: isSingle && isSelected
                      ? 'translateX(-50%) scale(1.7)'
                      : 'scale(1)',
                    width: FLOOR_W,
                    zIndex: isSingle && isSelected ? 20 : i + 1,
                    transition: 'top 0.5s ease, left 0.5s ease, opacity 0.4s ease, transform 0.5s ease, filter 0.4s ease',
                    opacity: isInactive ? 0 : 1,
                    cursor: 'pointer',
                    filter: isHighlight
                      ? 'drop-shadow(0 0 10px #d946ef) drop-shadow(0 0 20px rgba(217,70,239,0.5))'
                      : isSelected && isSingle
                        ? 'drop-shadow(0 0 18px #d946ef) brightness(1.1)'
                        : 'none',
                    pointerEvents: isInactive ? 'none' : 'auto',
                  }}
                >
                  <img
                    src={floor.img}
                    alt={floor.label}
                    style={{ width: '100%', display: 'block', imageRendering: 'auto', transform: 'scale(1.03)', transformOrigin: 'top left' }}
                    draggable={false}
                  />
                  {/* Animated heatmap colors (multiply under grid lines) */}
                  <HeatmapAnimatedCanvas
                    floorIdx={i}
                    opacity={stage === 'stacked' ? 0.4 : isInactive ? 0 : 0.88}
                  />
                  {/* Heatmap grid overlay */}
                  <img
                    src={floor.heatmap}
                    alt=""
                    draggable={false}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'fill',
                      transform: 'translateX(2%) translateY(9%)',
                      pointerEvents: 'none',
                      opacity: stage === 'stacked' ? 0.4 : isInactive ? 0 : 0.9,
                      transition: 'opacity 0.4s ease',
                    }}
                  />

                </div>
              )
            })}
          </div>


        </div>
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

