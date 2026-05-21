import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell, AlertTriangle, Info, Zap, ArrowUpRight, Shield, Flame, Activity, Brain } from 'lucide-react';

/* ── Floor2 plan constants ──────────────────────────────────────────────── */
const FLOOR2_KEY = 'floor2_zones'
const PREVIEW_CAM1_KEY = 'preview_cam1_id'
const CAM1_CAPACITY = 50  // default max capacity for pct calculation

const MOCK_CAMS = [
  { id: '2',  label: 'กล้อง 2',  pct: 45 },
  { id: '3',  label: 'กล้อง 3',  pct: 72 },
  { id: '4',  label: 'กล้อง 4',  pct: 30 },
  { id: '5',  label: 'กล้อง 5',  pct: 88 },
  { id: '6',  label: 'กล้อง 6',  pct: 55 },
  { id: '7',  label: 'กล้อง 7',  pct: 19 },
  { id: '8',  label: 'กล้อง 8',  pct: 63 },
  { id: '9',  label: 'กล้อง 9',  pct: 41 },
  { id: '10', label: 'กล้อง 10', pct: 77 },
  { id: '11', label: 'กล้อง 11', pct: 93 },
  { id: '12', label: 'กล้อง 12', pct: 36 },
  { id: '13', label: 'กล้อง 13', pct: 58 },
]

function camColor(pct) {
  if (pct >= 85) return '#ef4444'
  if (pct >= 70) return '#f97316'
  if (pct >= 40) return '#f59e0b'
  return '#10b981'
}
function camLabel(pct) {
  if (pct >= 85) return 'หนาแน่นมาก'
  if (pct >= 70) return 'หนาแน่น'
  if (pct >= 40) return 'เริ่มหนาแน่น'
  return 'ปลอดภัย'
}
const FLOOR_T = 'matrix(0,-.75,.75,0,-.000061035159,595.32)'

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

function FloorPlanLines() {
  return (
    <g transform={FLOOR_T} strokeLinecap="round" strokeLinejoin="round" fill="none">
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

export default function App() {
  const [searchParams] = useSearchParams()
  const apiBase = (searchParams.get('gateway') || import.meta.env.VITE_GATEWAY_URL || '').replace(/\/$/, '')

  const [selectedZone, setSelectedZone] = useState(null);
  const [pulse, setPulse] = useState(true);

  // โซนจาก Floor2 editor (localStorage)
  const [zones] = useState(() => {
    try { return JSON.parse(localStorage.getItem(FLOOR2_KEY) || '[]') } catch { return [] }
  });

  // กล้อง 1 — real API
  const cam1Id = localStorage.getItem(PREVIEW_CAM1_KEY) || ''
  const [cam1Pct, setCam1Pct] = useState(0)
  const [cam1Count, setCam1Count] = useState(0)
  const abortRef = useRef(null)

  const fetchCam1 = useCallback(async () => {
    if (!apiBase || !cam1Id) return
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    try {
      const res = await fetch(apiBase + '/api/cameras', { signal: abortRef.current.signal })
      if (!res.ok) return
      const data = await res.json()
      const cam = data.find(c => String(c.id) === String(cam1Id))
      if (cam) {
        const count = cam.total_people || 0
        setCam1Count(count)
        setCam1Pct(Math.min(Math.round(count / CAM1_CAPACITY * 100), 100))
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('cam1 fetch error', e)
    }
  }, [apiBase, cam1Id])

  useEffect(() => {
    fetchCam1()
    const id = setInterval(fetchCam1, 2000)
    return () => { clearInterval(id); if (abortRef.current) abortRef.current.abort() }
  }, [fetchCam1])

  // เอฟเฟกต์ไฟกะพริบเพื่อแสดงความเป็น Real-time
  useEffect(() => {
    const interval = setInterval(() => {
      setPulse(p => !p);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // ── Gauge derived values ──────────────────────────────────────────────
  const gaugeScore   = cam1Id ? cam1Pct : 60
  const needleAngle  = (gaugeScore / 100) * 180
  const gaugeColor   = gaugeScore >= 85 ? '#ef4444' : gaugeScore >= 70 ? '#f97316' : gaugeScore >= 40 ? '#f59e0b' : '#10b981'
  const gaugeLabel   = gaugeScore >= 85 ? 'ความเสี่ยงสูง' : gaugeScore >= 70 ? 'หนาแน่น' : gaugeScore >= 40 ? 'เริ่มหนาแน่น' : 'ปลอดภัย'
  const isCritical   = gaugeScore >= 85

  return (
    <div className="min-h-screen w-full bg-[#030d0c] text-[#e2f1ee] font-sans p-2 sm:p-4 md:p-6 select-none">
      <div className="w-full max-w-[1920px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4 xl:gap-6 items-stretch">

      {/* ══════════════ LAYER 1 ══════════════ */}
      <div className="bg-[#041210] rounded-2xl border-2 border-[#123933] p-5 sm:p-6 shadow-[0_0_40px_rgba(4,30,26,0.8)] relative overflow-hidden flex flex-col">
        
        {/* แสงสีเขียวฟุ้งด้านหลังแบบไซไฟ */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#10b981]/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-[#00a3ff]/5 rounded-full blur-[120px] pointer-events-none" />

        {/* HEADER SECTION */}
        <div className="flex justify-between items-center gap-3 mb-5 pb-3 border-b border-[#0d2e29]/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex items-center justify-center flex-shrink-0">
              <div className="absolute w-12 h-12 rounded-full bg-[#10b981]/15 animate-ping opacity-75" />
              <div className="w-11 h-11 bg-[#10b981] rounded-full flex items-center justify-center text-black shadow-[0_0_20px_rgba(16,185,129,0.5)] z-10">
                <Zap size={22} className="fill-black stroke-black stroke-[1.5]" />
              </div>
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-extrabold tracking-wider text-white flex flex-wrap items-baseline gap-1.5">
                <span className="whitespace-nowrap">LAYER 1: GREEDY</span>
                <span className="text-gray-400 font-medium text-xs whitespace-nowrap">(REAL-TIME DECISION)</span>
              </h1>
              <p className="text-[10px] text-[#6fa39b] font-light mt-0.5">
                เลือกสิ่งที่ดีที่สุด ณ เวลาปัจจุบัน เพื่อการตอบสนองและแจ้งเตือนทันที
              </p>
            </div>
          </div>
          <span className="flex-shrink-0 text-[10px] text-[#06b6d4] font-semibold tracking-wider border border-[#06b6d4]/30 bg-[#06b6d4]/5 px-2 py-1 rounded-md uppercase whitespace-nowrap">
            ระบบเชิงคาดการณ์ฯ
          </span>
        </div>

        {/* MAIN 3 COLUMNS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
          
          {/* COLUMN 1: 13-CAMERA DENSITY */}
          <div className="bg-[#051715] border border-[#0d2e29] rounded-xl p-4 flex flex-col h-0 min-h-full overflow-hidden transition-all duration-300 hover:border-[#13443d]">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xs font-bold text-gray-300 tracking-wider">ความหนาแน่นของโซน</h2>
              <div className={`w-1.5 h-1.5 rounded-full bg-green-500 ${pulse ? 'animate-pulse' : ''}`} />
            </div>

            <div className="flex flex-col gap-1.5 overflow-y-auto flex-1 min-h-0"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {/* Camera 1 — Real API data */}
              {(() => {
                const pct = cam1Pct
                const color = camColor(pct)
                const live = !!cam1Id && !!apiBase
                return (
                  <div className="flex items-center justify-center gap-3 p-2.5 rounded-lg border bg-[#041513]/60 border-[#0d2a25] hover:bg-[#06201c] cursor-default transition-all">
                    <div className="relative w-14 h-14 flex-shrink-0 flex items-center justify-center">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#0b221f" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke={color} strokeWidth="3"
                          strokeDasharray={`${pct} 100`} strokeLinecap="round" />
                      </svg>
                      <span className="absolute text-[9px] font-bold text-white">{pct}%</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-bold" style={{ color }}>กล้อง 1</h3>
                        {live && <span className="text-[8px] bg-green-500/20 text-green-400 px-1 py-0.5 rounded font-bold tracking-wider">LIVE</span>}
                      </div>
                      <p className="text-[9px] mt-0.5" style={{ color: `${color}cc` }}>
                        {camLabel(pct)}{cam1Count > 0 ? ` · ${cam1Count} คน` : ''}
                      </p>
                    </div>
                  </div>
                )
              })()}

              {/* Cameras 2–13 — Mock data */}
              {MOCK_CAMS.map(cam => {
                const color = camColor(cam.pct)
                return (
                  <div key={cam.id} className="flex items-center justify-center gap-3 p-2.5 rounded-lg border bg-[#041513]/60 border-[#0d2a25] hover:bg-[#06201c] cursor-default transition-all">
                    <div className="relative w-14 h-14 flex-shrink-0 flex items-center justify-center">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#0b221f" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke={color} strokeWidth="3"
                          strokeDasharray={`${cam.pct} 100`} strokeLinecap="round" />
                      </svg>
                      <span className="absolute text-[9px] font-bold text-white">{cam.pct}%</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs font-bold" style={{ color }}>{cam.label}</h3>
                      <p className="text-[9px] mt-0.5" style={{ color: `${color}cc` }}>{camLabel(cam.pct)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* COLUMN 2: GAUGE (RISK LEVEL) */}
          <div className="bg-[#051715] border border-[#0d2e29] rounded-xl p-4 flex flex-col justify-between items-center transition-all duration-300 hover:border-[#13443d]">
            <div className="w-full text-left">
              <h2 className="text-xs font-bold text-gray-300 tracking-wider">ระดับความเสี่ยง</h2>
            </div>

            {/* Custom High-Fidelity SVG Gauge */}
            <div className="relative w-full flex flex-col items-center">
              <svg className="w-full" viewBox="0 0 200 130">
                <defs>
                  {/* ไล่ระดับเฉดสีความเสี่ยง */}
                  <linearGradient id="gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10b981" />   {/* ปลอดภัย - เขียว */}
                    <stop offset="50%" stopColor="#f59e0b" />  {/* เริ่มแน่น - เหลืองส้ม */}
                    <stop offset="100%" stopColor="#ef4444" /> {/* หนาแน่นมาก - แดง */}
                  </linearGradient>
                  
                  {/* เงาเรืองแสงสำหรับเข็มวัด */}
                  <filter id="needle-glow">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                  <filter id="score-glow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>

                {/* แถบมาตรวัดด้านหลัง (พื้นหลังสีทึบ) */}
                <path 
                  d="M 20 110 A 80 80 0 0 1 180 110" 
                  fill="none" 
                  stroke="#082320" 
                  strokeWidth="16" 
                  strokeLinecap="round" 
                />

                {/* แถบมาตรวัดระดับสีจริงไล่เฉด */}
                <path 
                  d="M 20 110 A 80 80 0 0 1 180 110" 
                  fill="none" 
                  stroke="url(#gauge-grad)" 
                  strokeWidth="14" 
                  strokeLinecap="round" 
                />

                {/* ขีดสเกล (Ticks) */}
                {/* 0, 25, 50, 75, 100 */}
                <line x1="28" y1="102" x2="38" y2="98" stroke="#041210" strokeWidth="2" />
                <line x1="43" y1="65" x2="52" y2="65" stroke="#041210" strokeWidth="2" />
                <line x1="100" y1="30" x2="100" y2="40" stroke="#041210" strokeWidth="2" />
                <line x1="157" y1="65" x2="148" y2="65" stroke="#041210" strokeWidth="2" />
                <line x1="172" y1="102" x2="162" y2="98" stroke="#041210" strokeWidth="2" />

                {/* ตัวเลขกำกับสเกล */}
                <text x="24" y="124" fill="#56817a" fontSize="9" textAnchor="middle" fontWeight="bold">0</text>
                <text x="57" y="77" fill="#56817a" fontSize="9" textAnchor="middle" fontWeight="bold">25</text>
                <text x="100" y="50" fill="#56817a" fontSize="9" textAnchor="middle" fontWeight="bold">50</text>
                <text x="143" y="77" fill="#56817a" fontSize="9" textAnchor="middle" fontWeight="bold">75</text>
                <text x="176" y="124" fill="#56817a" fontSize="9" textAnchor="middle" fontWeight="bold">100</text>

                {/* เข็มชี้วัดระดับ (คำนวณชี้ไปที่ 82) */}
                {/* มุมเข็มสำหรับ 82 จากช่วงสเกล 0-100 คือประมาณ 147.6 องศา จากจุดเริ่มซ้ายสุด */}
                {/* ใน SVG มุมเริ่มต้นทางซ้ายสุดเริ่มที่ประมาณ 180 องศา (หมุนตามเข็มนาฬิกา) */}
                {/* ค่า 82 = (82 / 100) * 180 = 147.6 องศา. จุดหมุนคือ (100, 110) */}
                <g transform={`rotate(${needleAngle}, 100, 110)`} filter="url(#needle-glow)">
                  <line 
                    x1="100" 
                    y1="110" 
                    x2="22" 
                    y2="110" 
                    stroke="#ffffff" 
                    strokeWidth="3.5" 
                    strokeLinecap="round" 
                  />
                  <polygon points="20,110 30,107 30,113" fill="#ffffff" />
                </g>

                {/* จุดหมุนตรงกลางของเข็ม */}
                <circle cx="100" cy="110" r="7" fill="#041210" stroke="#ffffff" strokeWidth="2.5" />

              </svg>
              {/* ตัวเลขคะแนน — HTML ใต้ SVG */}
              <p className="text-5xl font-black leading-none -mt-2"
                style={{ color: gaugeColor, textShadow: `0 0 20px ${gaugeColor}b3, 0 0 40px ${gaugeColor}59` }}>{gaugeScore}</p>
              <p className="text-[11px] font-bold tracking-[3px] mt-1" style={{ color: gaugeColor }}>{gaugeLabel}</p>
            </div>

            {/* ป้ายเตือน — แสดงเมื่อ score >= 85 */}
            {isCritical && (
            <div className="mt-3 mb-2">
              <div className="border border-[#ef4444]/60 bg-[#ef4444]/5 text-[#ef4444] text-[10px] font-bold px-4 py-1.5 rounded-md tracking-widest uppercase animate-pulse">
                CRITICAL
              </div>
            </div>
            )}

            {/* แสดงแนวโน้มด้านล่างการ์ด */}
            <div className="flex items-center gap-1.5 text-xs text-[#56817a] mt-1">
              <span>แนวโน้ม: เพิ่มขึ้น</span>
              <span className="text-[#ef4444] font-bold flex items-center">
                <ArrowUpRight size={14} className="stroke-[2.5]" />
              </span>
            </div>
          </div>

          {/* COLUMN 3: HEATMAP (ZONE MAP) */}
          <div className="bg-[#051715] border border-[#0d2e29] rounded-xl p-4 flex flex-col transition-all duration-300 hover:border-[#13443d]">
            <div>
              <h2 className="text-xs font-bold text-gray-300 tracking-wider">แผนที่ความหนาแน่น</h2>
            </div>

            {/* Floor2 Plan */}
            <div className="flex-1 flex items-center justify-center">
            <div className="relative w-full bg-[#030f0e] rounded-lg border border-[#0d2e29]/60 overflow-hidden"
              style={{ aspectRatio: '841.92/595.32' }}>
              <svg className="w-full h-full" viewBox="0 0 841.92 595.32">
                <FloorPlanLines />

                {/* โซนจาก Floor2 editor */}
                {zones.length > 0 ? zones.map(z => {
                  const pts = z.points.map(p => p.join(',')).join(' ')
                  const [cx, cy] = centroid(z.points)
                  return (
                    <g key={z.id} className="transition-all duration-300"
                      opacity={selectedZone === z.id ? 1 : selectedZone ? 0.2 : 0.85}
                      onClick={() => setSelectedZone(v => v === z.id ? null : z.id)}
                      style={{ cursor: 'pointer' }}>
                      <polygon points={pts} fill={z.color + '40'} stroke={z.color}
                        strokeWidth="2.5" strokeLinejoin="round" />
                      <text x={cx} y={cy} fill={z.color} fontSize="16" fontWeight="800"
                        textAnchor="middle" dominantBaseline="middle"
                        style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: '#030f0e', strokeWidth: 4, strokeLinejoin: 'round' }}>
                        {z.name}
                      </text>
                    </g>
                  )
                }) : (
                  /* fallback เมื่อยังไม่มีโซน — แสดงข้อความ */
                  <text x="421" y="297" fill="rgba(255,255,255,0.2)" fontSize="18" textAnchor="middle"
                    dominantBaseline="middle">ยังไม่มีโซน — เพิ่มใน Floor 2</text>
                )}
              </svg>

              {selectedZone && (
                <button
                  onClick={() => setSelectedZone(null)}
                  className="absolute bottom-2 right-2 bg-[#041210] hover:bg-[#0c2e29] border border-[#123933] text-white text-[10px] px-2 py-0.5 rounded transition-all">
                  แสดงทั้งหมด
                </button>
              )}
            </div>
            </div>
          </div>

        </div>

        {/* BOTTOM SECTION: REAL-TIME NOTIFICATION & PREVENTIVE ALERT */}
        <div className="border-t border-[#0d2e29] pt-5">
          {/* หัวข้อส่วนแจ้งเตือน */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-[#84cc16]/40" />
            <h3 className="text-xs font-bold text-[#84cc16] tracking-[0.25em] uppercase text-center flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[#84cc16] animate-pulse" />
              REAL-TIME NOTIFICATION & PREVENTIVE ALERT
            </h3>
            <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-[#84cc16]/40" />
          </div>

          {/* แถบการ์ดแจ้งเตือน 3 ใบ */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            
            {/* ALERT 1: RED ALERT (ZONE C) */}
            <div className="bg-[#180a0a] border border-[#7f1d1d]/80 rounded-lg p-3 flex justify-between items-center transition-all hover:bg-[#250f0f]">
              <div className="flex items-center gap-3">
                {/* ไอคอนระฆังสีแดงกะพริบ */}
                <div className="relative">
                  <div className="absolute inset-0 bg-red-600 rounded-full blur-sm opacity-50 animate-ping" />
                  <div className="w-9 h-9 bg-[#7f1d1d]/40 rounded-full flex items-center justify-center text-[#ef4444]">
                    <Bell size={18} className="animate-bounce" />
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">โซน C หนาแน่นมาก</h4>
                  <p className="text-[10px] text-gray-400 mt-0.5">แนะนำให้ย้ายไปโซน D</p>
                </div>
              </div>
              <span className="text-[10px] text-gray-500 font-medium self-end">07:45</span>
            </div>

            {/* ALERT 2: WARNING ALERT (ZONE B) */}
            <div className="bg-[#1c1205] border border-[#78350f]/80 rounded-lg p-3 flex justify-between items-center transition-all hover:bg-[#281a07]">
              <div className="flex items-center gap-3">
                {/* ไอคอนสามเหลี่ยมเตือนสีส้ม */}
                <div className="w-9 h-9 bg-[#78350f]/40 rounded-full flex items-center justify-center text-[#f59e0b]">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">โซน B ใกล้เต็ม</h4>
                  <p className="text-[10px] text-gray-400 mt-0.5">ความหนาแน่น 65%</p>
                </div>
              </div>
              <span className="text-[10px] text-gray-500 font-medium self-end">07:45</span>
            </div>

            {/* ALERT 3: INFO ALERT (ZONE D) */}
            <div className="bg-[#051118] border border-[#0369a1]/80 rounded-lg p-3 flex justify-between items-center transition-all hover:bg-[#091b25]">
              <div className="flex items-center gap-3">
                {/* ไอคอนกลมสีเขียวแจ้งข้อมูล */}
                <div className="w-9 h-9 bg-[#0369a1]/30 rounded-full flex items-center justify-center text-[#38bdf8]">
                  <Info size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">มีที่ว่างในโซน D</h4>
                  <p className="text-[10px] text-gray-400 mt-0.5">แนะนำ 18 ที่นั่ง</p>
                </div>
              </div>
              <span className="text-[10px] text-gray-500 font-medium self-end">07:45</span>
            </div>

          </div>
        </div>

      </div>
      {/* ── End Layer 1 ── */}

      {/* ══════════════ LAYER 2 ══════════════ */}
      <div className="bg-[#040d1c] rounded-2xl border-2 border-[#0f2244] p-5 sm:p-6 shadow-[0_0_40px_rgba(4,13,28,0.8)] relative overflow-hidden flex flex-col">

        {/* glow blobs */}
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#3b82f6]/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#6366f1]/5 rounded-full blur-[120px] pointer-events-none" />

        {/* LAYER 2 HEADER */}
        <div className="flex justify-between items-center gap-3 mb-5 pb-3 border-b border-[#0f2244]/60 relative z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex items-center justify-center flex-shrink-0">
              <div className="absolute w-12 h-12 rounded-full bg-[#3b82f6]/15 animate-pulse opacity-75" />
              <div className="w-11 h-11 bg-[#1d4ed8] rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.4)] z-10">
                <Brain size={22} className="text-white" strokeWidth={1.5} />
              </div>
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-extrabold tracking-wider text-white flex flex-wrap items-baseline gap-1.5">
                <span className="whitespace-nowrap">LAYER 2: <span className="text-[#3b82f6]">DYNAMIC PROGRAMMING</span></span>
                <span className="text-gray-400 font-medium text-xs whitespace-nowrap">(BEHAVIORAL LEARNING)</span>
              </h1>
              <p className="text-[10px] text-[#4e7aab] font-light mt-0.5">
                เรียนรู้รูปแบบพฤติกรรมจากข้อมูลย้อนหลัง เพื่อคาดการณ์และแนะนำล่วงหน้า
              </p>
            </div>
          </div>
          <span className="flex-shrink-0 text-[10px] text-[#818cf8] font-semibold tracking-wider border border-[#818cf8]/30 bg-[#818cf8]/5 px-2 py-1 rounded-md uppercase whitespace-nowrap">
            ระบบเรียนรู้อัจฉริยะ
          </span>
        </div>

        {/* PLACEHOLDER BODY */}
        <div className="flex-1 flex items-center justify-center relative z-10">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-[#1e3a6e] flex items-center justify-center mx-auto">
              <Brain size={28} className="text-[#1e3a6e]" />
            </div>
            <p className="text-xs tracking-widest uppercase" style={{ color: '#1e3a6e' }}>กำลังพัฒนา</p>
          </div>
        </div>

      </div>
      {/* ── End Layer 2 ── */}

      </div>
    </div>
  );
}

// คอมโพเนนต์ลูกศรชี้เมื่อโฮเวอร์/คลิกเลือกแต่ละแถวโซน
function ChevronIndicator({ color, active }) {
  return (
    <div 
      className="w-5 h-5 rounded-full flex items-center justify-center transition-all"
      style={{
        backgroundColor: active ? color : 'transparent',
        color: active ? '#000000' : color
      }}
    >
      <ArrowUpRight size={13} className={`transform transition-transform ${active ? 'rotate-45' : 'rotate-90 opacity-60'}`} />
    </div>
  );
}