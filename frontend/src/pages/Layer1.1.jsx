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
  return 'ค่อนข้างว่าง'
}
const FLOOR_T = 'matrix(0,-.75,.75,0,-.000061035159,595.32)'

function heatColor(ratio, alpha = 0.45) {
  let r, g, b
  if (ratio < 0.4) {
    const t = ratio / 0.4
    r = Math.round(59  + t * (34  - 59));  g = Math.round(130 + t * (197 - 130)); b = Math.round(246 + t * (94  - 246))
  } else if (ratio < 0.7) {
    const t = (ratio - 0.4) / 0.3
    r = Math.round(34  + t * (234 - 34));  g = Math.round(197 + t * (179 - 197)); b = Math.round(94  + t * (8   - 94))
  } else {
    const t = (ratio - 0.7) / 0.3
    r = Math.round(234 + t * (239 - 234)); g = Math.round(179 + t * (68  - 179)); b = Math.round(8   + t * (68  - 8))
  }
  return `rgba(${r},${g},${b},${alpha})`
}

function centroid(pts) {
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
}

const L11_ZONE_ROWS = [
  [0.10,0.15,0.25,0.45,0.60,0.72,0.82,0.90,0.85,0.75,0.60,0.48,0.35,0.20,0.12,0.08],
  [0.10,0.12,0.20,0.30,0.42,0.55,0.65,0.72,0.75,0.82,0.65,0.52,0.40,0.25,0.15,0.10],
  [0.20,0.32,0.50,0.72,0.88,0.82,0.75,0.65,0.72,0.85,0.90,0.72,0.55,0.38,0.25,0.18],
]

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
  const gaugeLabel   = gaugeScore >= 85 ? 'หนาแน่นมาก' : gaugeScore >= 70 ? 'หนาแน่น' : gaugeScore >= 40 ? 'เริ่มหนาแน่น' : 'ค่อนข้างว่าง'
  const isCritical   = gaugeScore >= 85

  return (
    <div className="min-h-screen w-full bg-[#030d0c] text-[#e2f1ee] font-sans px-2 py-6 sm:px-4 sm:py-8 md:px-6 md:py-8 select-none flex flex-col justify-center">

      {/* ── Rotate overlay: tablet/iPad portrait only (md = 768px+) ── */}
      <div className="hidden md:portrait:flex fixed inset-0 z-[200] bg-[#030d0c]/95 backdrop-blur-sm flex-col items-center justify-center gap-8 pointer-events-none">
        {/* Tablet + rotation arrow icon */}
        <div className="relative">
          <svg xmlns="http://www.w3.org/2000/svg" width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="#1f7a68" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            {/* tablet body portrait */}
            <rect x="7" y="2" width="10" height="16" rx="1.5" />
            <circle cx="12" cy="16.5" r="0.6" fill="#1f7a68" />
          </svg>
          {/* rotation arc arrow */}
          <svg xmlns="http://www.w3.org/2000/svg" width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
            className="absolute inset-0"
            style={{animation:'rotateHint 2s ease-in-out infinite'}}>
            <path d="M4.5 10.5 A8.5 8.5 0 0 1 19.5 10.5" />
            <polyline points="19.5 6.5 19.5 10.5 15.5 10.5" />
          </svg>
        </div>
        <div className="text-center px-8">
          <p className="text-[#10b981] text-2xl font-bold tracking-wide">โปรดหมุนหน้าจอ</p>
          <p className="text-[#e2f1ee]/50 text-sm mt-2 leading-relaxed">
            แดชบอร์ดนี้ออกแบบสำหรับ<br />การแสดงผลแนวนอนเท่านั้น
          </p>
        </div>
        <style>{`@keyframes rotateHint{0%,100%{transform:rotate(0deg)}50%{transform:rotate(15deg)}}`}</style>
      </div>

      <div className="w-full max-w-[1920px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4 xl:gap-6 items-stretch">

      {/* ══════════════ LAYER 1 ══════════════ */}
      <div className="bg-[#041210] rounded-2xl border-2 border-solid border-[#1f7a68] p-5 sm:p-6 shadow-[0_0_32px_rgba(31,122,104,0.4)] relative overflow-hidden flex flex-col">
        
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
                <span className="whitespace-nowrap">LAYER 1: Real-Time</span>
                <span className="text-gray-400 font-medium text-xs whitespace-nowrap">(REAL-TIME DECISION)</span>
              </h1>
              <p className="text-[10px] text-[#6fa39b] font-light mt-0.5">
                เลือกสิ่งที่ดีที่สุด ณ เวลาปัจจุบัน เพื่อการตอบสนองและแจ้งเตือนทันที
              </p>
            </div>
          </div>

        </div>

        {/* MAIN 3 COLUMNS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6 min-h-[330px]">
          
          {/* COLUMN 1: 13-CAMERA DENSITY */}
          <div className="bg-[#051715] border-2 border-solid border-[#258a70] rounded-xl p-4 flex flex-col h-[260px] md:h-0 md:min-h-full overflow-hidden transition-all duration-300 hover:border-[#30ba90]">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xs font-bold text-gray-300 tracking-wider">ความหนาแน่นของโซน</h2>
              <div className={`w-1.5 h-1.5 rounded-full bg-green-500 ${pulse ? 'animate-pulse' : ''}`} />
            </div>

            <div className="flex flex-col gap-2 overflow-y-auto flex-1 min-h-0"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {/* Camera 1 — Real API data */}
              {(() => {
                const pct = cam1Pct
                const color = camColor(pct)
                const live = !!cam1Id && !!apiBase
                return (
                  <div className="flex items-center h-[52px] cursor-default group w-full">
                    <div className="w-[56px] h-[56px] flex-shrink-0 flex items-center justify-center select-none relative z-10">
                      <svg className="w-full h-full" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="48" fill="#051715" className="transition-colors duration-300 group-hover:fill-[#061c18]" />
                        <g transform="rotate(-90 50 50)">
                          <circle cx="50" cy="50" r="36" fill="none" stroke={pct > 0 ? color : '#102620'} strokeWidth="8" strokeDasharray="52.55 173.64" strokeDashoffset="0" />
                          <circle cx="50" cy="50" r="36" fill="none" stroke={pct >= 25 ? color : '#102620'} strokeWidth="8" strokeDasharray="52.55 173.64" strokeDashoffset="-56.55" />
                          <circle cx="50" cy="50" r="36" fill="none" stroke={pct >= 50 ? color : '#102620'} strokeWidth="8" strokeDasharray="52.55 173.64" strokeDashoffset="-113.1" />
                          <circle cx="50" cy="50" r="36" fill="none" stroke={pct >= 75 ? color : '#102620'} strokeWidth="8" strokeDasharray="52.55 173.64" strokeDashoffset="-169.65" />
                        </g>
                        <text x="50" y="56" textAnchor="middle" fill="#ffffff" fontSize="15" fontWeight="bold" fontFamily="system-ui,-apple-system,sans-serif">{pct}%</text>
                      </svg>
                    </div>
                    <div className="flex-1 flex items-center h-full -ml-7 bg-[#041513] border-t border-b border-r border-solid rounded-r-xl pr-3 pl-8 transition-all duration-300 group-hover:bg-[#061c18]" style={{ borderColor: color }}>
                      <div className="flex flex-col justify-center select-none min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] font-bold tracking-wide leading-snug truncate" style={{ color, textShadow: `0 0 8px ${color}80` }}>กล้อง 1</span>
                          {live && <span className="text-[7px] bg-green-500/20 text-green-400 px-1 py-0.5 rounded font-bold tracking-wider flex-shrink-0">LIVE</span>}
                        </div>
                        <span className="text-[9px] font-semibold tracking-wide leading-snug mt-0.5 truncate" style={{ color: `${color}cc` }}>
                          {camLabel(pct)}{cam1Count > 0 ? ` · ${cam1Count} คน` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Cameras 2–13 — Mock data */}
              {MOCK_CAMS.map(cam => {
                const color = camColor(cam.pct)
                return (
                  <div key={cam.id} className="flex items-center h-[52px] cursor-default group w-full">
                    <div className="w-[56px] h-[56px] flex-shrink-0 flex items-center justify-center select-none relative z-10">
                      <svg className="w-full h-full" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="48" fill="#051715" className="transition-colors duration-300 group-hover:fill-[#061c18]" />
                        <g transform="rotate(-90 50 50)">
                          <circle cx="50" cy="50" r="36" fill="none" stroke={cam.pct > 0 ? color : '#102620'} strokeWidth="8" strokeDasharray="52.55 173.64" strokeDashoffset="0" />
                          <circle cx="50" cy="50" r="36" fill="none" stroke={cam.pct >= 25 ? color : '#102620'} strokeWidth="8" strokeDasharray="52.55 173.64" strokeDashoffset="-56.55" />
                          <circle cx="50" cy="50" r="36" fill="none" stroke={cam.pct >= 50 ? color : '#102620'} strokeWidth="8" strokeDasharray="52.55 173.64" strokeDashoffset="-113.1" />
                          <circle cx="50" cy="50" r="36" fill="none" stroke={cam.pct >= 75 ? color : '#102620'} strokeWidth="8" strokeDasharray="52.55 173.64" strokeDashoffset="-169.65" />
                        </g>
                        <text x="50" y="56" textAnchor="middle" fill="#ffffff" fontSize="15" fontWeight="bold" fontFamily="system-ui,-apple-system,sans-serif">{cam.pct}%</text>
                      </svg>
                    </div>
                    <div className="flex-1 flex items-center h-full -ml-7 bg-[#041513] border-t border-b border-r border-solid rounded-r-xl pr-3 pl-8 transition-all duration-300 group-hover:bg-[#061c18]" style={{ borderColor: color }}>
                      <div className="flex flex-col justify-center select-none min-w-0">
                        <span className="text-[11px] font-bold tracking-wide leading-snug truncate" style={{ color, textShadow: `0 0 8px ${color}80` }}>{cam.label}</span>
                        <span className="text-[9px] font-semibold tracking-wide leading-snug mt-0.5 truncate" style={{ color: `${color}cc` }}>{camLabel(cam.pct)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* COLUMN 2: GAUGE (RISK LEVEL) */}
          <div className="bg-[#051715] border-2 border-solid border-[#258a70] rounded-xl p-4 flex flex-col justify-between items-center transition-all duration-300 hover:border-[#30ba90]">
            <div className="w-full text-left">
              <h2 className="text-xs font-bold text-gray-300 tracking-wider">ระดับความหนาแน่น</h2>
            </div>

            {/* Custom High-Fidelity SVG Gauge */}
            <div className="relative w-full flex flex-col items-center">
              <svg className="w-full" viewBox="0 0 200 130">
                <defs>
                  {/* ไล่ระดับเฉดสีความเสี่ยง */}
                  <linearGradient id="gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10b981" />   {/* ค่อนข้างว่าง - เขียว */}
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
              <p className="text-3xl lg:text-5xl font-black leading-none mt-2 lg:mt-1"
                style={{ color: gaugeColor, textShadow: `0 0 20px ${gaugeColor}b3, 0 0 40px ${gaugeColor}59` }}>{gaugeScore}</p>
              <p className="text-[13px] lg:text-[18px] font-bold tracking-wide lg:tracking-[3px] mt-1.5 lg:mt-0.5" style={{ color: gaugeColor }}>{gaugeLabel}</p>
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
            <div className="flex items-center gap-1 text-xs lg:text-sm text-[rgb(233,240,239)] mt-1.5 lg:-mt-3">
              <span>แนวโน้ม: เพิ่มขึ้น</span>
              <span className="text-[#ef4444] font-bold flex items-center">
                <ArrowUpRight size={14} className="stroke-[2.5]" />
              </span>
            </div>
          </div>

          {/* COLUMN 3: HEATMAP (ZONE MAP) */}
          <div className="bg-[#051715] border-2 border-solid border-[#258a70] rounded-xl p-4 flex flex-col transition-all duration-300 hover:border-[#30ba90]">
            <div>
              <h2 className="text-xs font-bold text-gray-300 tracking-wider">แผนที่ความหนาแน่น</h2>
            </div>

            {/* Floor Plan Heatmap */}
            <div className="flex-1 flex items-center justify-center">
            <div className="relative w-full bg-[#030f0e] rounded-lg border border-[#0d2e29]/60 overflow-hidden"
              style={{ aspectRatio: '591/673' }}>
              <svg className="w-full h-full" viewBox="0 0 591 673" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <filter id="neon-red-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur"/>
                    <feMerge>
                      <feMergeNode in="blur"/>
                      <feMergeNode in="blur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                <path d="M13 468.323L386.5 652.323L496.5 542.323L345.5 470.085L334.5 464.823L120.5 360.214L13 468.323Z" fill="#11FB30" fillOpacity="0.47"/>
                <path d="M125.363 355.323L120.5 360.214L334.5 464.823L461 337.806L248 231.991L125.363 355.323Z" fill="#FFFB10" fillOpacity="0.72"/>
                <path d="M579.5 218.823L366 113.323L248 231.991L461 337.806L579.5 218.823Z" fill="#FF1515" filter="url(#neon-red-glow)">
                  <animate attributeName="fill-opacity" values="0.9;0.18;0.9" dur="1.1s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/>
                </path>
                <path d="M120.5 360.214L334.5 464.823L345.5 470.085L496.5 542.323V559.823L386.5 670.323L1.5 481.323V363.823L107.729 258.323M386.5 670.323V652.323M496.5 542.323L386.5 652.323M334.5 464.823L461 337.806M579.5 218.823V121.323M579.5 218.823L589.5 224.323M579.5 218.823L366 113.323M579.5 218.823L461 337.806M246.756 134.736L366 15.3227L579.5 121.323M579.5 121.323L589.5 113.323M366 15.3227V113.323M386.5 652.323L13 468.323V368.823M13 368.823L1.5 363.823M13 368.823L120.5 261.17M13 468.323L120.5 360.214M345.5 470.085L461 353.751L589.5 224.323V113.323L366 1.82266L236.864 130.073L107.729 258.323M366 113.323L248 231.991M120.5 360.214L125.363 355.323L248 231.991M120.5 360.214V261.17M461 337.806L248 231.991M461 337.806V353.751M248 231.991V135.323L246.756 134.736M120.5 261.17L107.729 258.323M120.5 261.17L246.756 134.736M236.864 130.073L246.756 134.736" stroke="#FFFDFD" strokeWidth="3"/>
                <path d="M248.5 233.323L122.5 361.823L336 462.823L461 338.323L248.5 233.323Z" stroke="#E1DE08" strokeOpacity="0.72" strokeWidth="3"/>
                <path d="M121 362.823L17 466.323L387.5 648.323L493.5 542.323L121 362.823Z" stroke="#35E200" strokeWidth="3"/>
                <path d="M163.409 465.448L160.715 468.404L157.758 465.71L152.37 471.623L149.413 468.929L157.496 460.059L163.409 465.448ZM160.715 468.404L163.671 471.098L160.977 474.055L158.02 471.361L160.715 468.404ZM169.322 470.836L172.278 473.53L164.196 482.4L158.283 477.011L160.977 474.055L163.933 476.749L169.322 470.836ZM168.797 459.534L165.841 456.84L168.535 453.884L171.492 456.578L168.797 459.534ZM174.71 464.923L172.016 467.879L166.103 462.491L168.797 459.534L174.71 464.923ZM180.099 459.01L177.405 461.966L171.492 456.578L174.186 453.621L180.099 459.01ZM177.405 461.966L180.361 464.661L177.667 467.617L174.71 464.923L177.405 461.966ZM188.444 455.791L185.75 458.748L173.924 447.971L179.312 442.058L182.269 444.752L179.574 447.708L188.444 455.791ZM193.832 449.878L191.138 452.835L182.269 444.752L184.963 441.795L193.832 449.878ZM196.264 441.271L193.57 444.227L187.657 438.839L190.351 435.882L187.395 433.188L190.089 430.231L193.046 432.926L195.74 429.969L198.696 432.663L193.308 438.577L196.264 441.271ZM199.221 443.965L196.264 441.271L201.653 435.358L204.609 438.052L199.221 443.965ZM199.185 473.697L196.229 471.003L201.617 465.09L204.574 467.784L199.185 473.697ZM211.011 484.474L208.317 487.431L196.491 476.654L199.185 473.697L202.142 476.391L207.53 470.478L204.574 467.784L207.268 464.828L219.094 475.605L216.4 478.561L210.487 473.173L205.098 479.086L211.011 484.474Z" fill="black"/>
                <path d="M262.409 338.448L259.715 341.404L256.758 338.71L251.37 344.623L248.413 341.929L256.496 333.059L262.409 338.448ZM259.715 341.404L262.671 344.098L259.977 347.055L257.02 344.361L259.715 341.404ZM268.322 343.836L271.278 346.53L263.196 355.4L257.283 350.011L259.977 347.055L262.933 349.749L268.322 343.836ZM267.797 332.534L264.841 329.84L267.535 326.884L270.492 329.578L267.797 332.534ZM273.71 337.923L271.016 340.879L265.103 335.491L267.797 332.534L273.71 337.923ZM279.099 332.01L276.405 334.966L270.492 329.578L273.186 326.621L279.099 332.01ZM276.405 334.966L279.361 337.661L276.667 340.617L273.71 337.923L276.405 334.966ZM287.444 328.791L284.75 331.748L272.924 320.971L278.312 315.058L281.269 317.752L278.574 320.708L287.444 328.791ZM292.832 322.878L290.138 325.835L281.269 317.752L283.963 314.795L292.832 322.878ZM295.264 314.271L292.57 317.227L286.657 311.839L289.351 308.882L286.395 306.188L289.089 303.231L292.046 305.926L294.74 302.969L297.696 305.663L292.308 311.577L295.264 314.271ZM298.221 316.965L295.264 314.271L300.653 308.358L303.609 311.052L298.221 316.965ZM307.055 354.78L312.443 348.867L315.4 351.561L307.317 360.431L292.534 346.959L300.617 338.09L303.574 340.784L298.185 346.697L301.142 349.391L306.53 343.478L309.487 346.173L304.098 352.086L307.055 354.78ZM309.224 340.522L306.53 343.478L303.574 340.784L306.268 337.828L309.224 340.522ZM315.137 345.91L312.443 348.867L309.487 346.173L312.181 343.216L315.137 345.91Z" fill="black"/>
                <path d="M375.409 216.448L372.715 219.404L369.758 216.71L364.37 222.623L361.413 219.929L369.496 211.059L375.409 216.448ZM372.715 219.404L375.671 222.098L372.977 225.055L370.02 222.361L372.715 219.404ZM381.322 221.836L384.278 224.53L376.196 233.4L370.283 228.011L372.977 225.055L375.933 227.749L381.322 221.836ZM380.797 210.534L377.841 207.84L380.535 204.884L383.492 207.578L380.797 210.534ZM386.71 215.923L384.016 218.879L378.103 213.491L380.797 210.534L386.71 215.923ZM392.099 210.01L389.405 212.966L383.492 207.578L386.186 204.621L392.099 210.01ZM389.405 212.966L392.361 215.661L389.667 218.617L386.71 215.923L389.405 212.966ZM400.444 206.791L397.75 209.748L385.924 198.971L391.312 193.058L394.269 195.752L391.574 198.708L400.444 206.791ZM405.832 200.878L403.138 203.835L394.269 195.752L396.963 192.795L405.832 200.878ZM408.264 192.271L405.57 195.227L399.657 189.839L402.351 186.882L399.395 184.188L402.089 181.231L405.046 183.926L407.74 180.969L410.696 183.663L405.308 189.577L408.264 192.271ZM411.221 194.965L408.264 192.271L413.653 186.358L416.609 189.052L411.221 194.965ZM411.185 224.697L408.229 222.003L413.617 216.09L416.574 218.784L411.185 224.697ZM420.055 232.78L417.36 235.736L408.491 227.654L411.185 224.697L420.055 232.78ZM419.53 221.478L416.574 218.784L419.268 215.828L422.224 218.522L419.53 221.478ZM428.137 223.91L425.443 226.867L422.487 224.173L425.181 221.216L428.137 223.91ZM425.443 226.867L428.4 229.561L423.011 235.474L420.055 232.78L425.443 226.867Z" fill="black"/>
                <path d="M366 113.823L251 230.323L462.5 336.823L580 218.323L366 113.823Z" stroke="#E10808" strokeOpacity="0.72" strokeWidth="3"/>
              </svg>
            </div>
            </div>
          </div>

        </div>

        {/* BOTTOM SECTION: REAL-TIME NOTIFICATION & PREVENTIVE ALERT */}
        <div className="border-2 border-solid border-[#258a70] rounded-xl pt-3 pb-3 px-3 lg:pt-4 lg:pb-4 lg:px-4">
          {/* หัวข้อส่วนแจ้งเตือน */}
          <div className="flex items-center justify-center gap-3 mb-3 lg:mb-4">
            <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-[#84cc16]/40" />
            <h3 className="text-[9px] lg:text-xs font-bold text-[#84cc16] tracking-[0.15em] lg:tracking-[0.25em] uppercase text-center flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[#84cc16] animate-pulse" />
              REAL-TIME NOTIFICATION & PREVENTIVE ALERT
            </h3>
            <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-[#84cc16]/40" />
          </div>

          {/* แถบการ์ดแจ้งเตือน 3 ใบ */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 lg:gap-3">
            
            {/* ALERT 1: RED ALERT (ZONE C) */}
            <div className="bg-[#180a0a] border-2 border-solid border-[#b91c1c] rounded-lg py-0.5 px-2 lg:py-0.5 lg:px-3 flex flex-col relative min-h-[64px] lg:min-h-[64px] transition-all hover:bg-[#250f0f]">
              <div className="flex-1 flex items-center gap-1 lg:gap-2">
                <div className="relative flex-shrink-0">
                  <div className="absolute inset-0 bg-red-600 rounded-full blur-sm opacity-50 animate-ping" />
                  <div className="w-5 h-5 lg:w-10 lg:h-10 bg-[#7f1d1d]/40 rounded-full flex items-center justify-center text-[#ef4444]">
                    <Bell size={10} className="lg:hidden animate-bounce" />
                    <Bell size={18} className="hidden lg:block animate-bounce" />
                  </div>
                </div>
                <div className="min-w-0">
                  <h4 className="text-[9px] lg:text-[10px] font-bold text-white truncate">โซน C หนาแน่นมาก</h4>
                  <p className="text-[8px] lg:text-[9px] text-gray-400">แนะนำให้ย้ายไปโซน A</p>
                </div>
              </div>
              <span className="absolute bottom-1.5 right-2 text-[8px] lg:text-[9px] text-gray-500 font-medium">07:45</span>
            </div>

            {/* ALERT 2: WARNING ALERT (ZONE B) */}
            <div className="bg-[#1c1205] border-2 border-solid border-[#b45309] rounded-lg py-0.5 px-2 lg:py-0.5 lg:px-3 flex flex-col relative min-h-[64px] lg:min-h-[64px] transition-all hover:bg-[#281a07]">
              <div className="flex-1 flex items-center gap-1 lg:gap-2">
                <div className="w-5 h-5 lg:w-10 lg:h-10 bg-[#78350f]/40 rounded-full flex items-center justify-center text-[#f59e0b] flex-shrink-0">
                  <AlertTriangle size={10} className="lg:hidden" />
                  <AlertTriangle size={18} className="hidden lg:block" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-[9px] lg:text-[10px] font-bold text-white truncate">โซน B ใกล้เต็ม</h4>
                  <p className="text-[8px] lg:text-[9px] text-gray-400">ความหนาแน่น 65%</p>
                </div>
              </div>
              <span className="absolute bottom-1.5 right-2 text-[8px] lg:text-[9px] text-gray-500 font-medium">07:45</span>
            </div>

            {/* ALERT 3: INFO ALERT (ZONE D) */}
            <div className="bg-[#051118] border-2 border-solid border-[#0369a1] rounded-lg py-0.5 px-2 lg:py-0.5 lg:px-3 flex flex-col relative min-h-[64px] lg:min-h-[64px] transition-all hover:bg-[#091b25]">
              <div className="flex-1 flex items-center gap-1 lg:gap-2">
                <div className="w-5 h-5 lg:w-10 lg:h-10 bg-[#0369a1]/30 rounded-full flex items-center justify-center text-[#38bdf8] flex-shrink-0">
                  <Info size={10} className="lg:hidden" />
                  <Info size={18} className="hidden lg:block" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-[9px] lg:text-[10px] font-bold text-white truncate">มีที่ว่างในโซน D</h4>
                  <p className="text-[8px] lg:text-[9px] text-gray-400">แนะนำ 18 ที่นั่ง</p>
                </div>
              </div>
              <span className="absolute bottom-1.5 right-2 text-[8px] lg:text-[9px] text-gray-500 font-medium">07:45</span>
            </div>

          </div>
        </div>

      </div>
      {/* ── End Layer 1 ── */}

      {/* ══════════════ LAYER 2 ══════════════ */}
      <div className="bg-[#040d1c] rounded-2xl border-2 border-solid border-[#1a3d78] p-5 sm:p-6 shadow-[0_0_32px_rgba(26,61,120,0.4)] relative overflow-hidden flex flex-col">

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
                <span className="whitespace-nowrap">LAYER 2: <span className="text-[#3b82f6]">Enlightenment</span></span>
                <span className="text-gray-400 font-medium text-xs whitespace-nowrap">(BEHAVIORAL LEARNING)</span>
              </h1>
              <p className="text-[10px] text-[#4e7aab] font-light mt-0.5">
                เรียนรู้รูปแบบพฤติกรรมจากข้อมูลย้อนหลัง เพื่อคาดการณ์และแนะนำล่วงหน้า
              </p>
            </div>
          </div>
        </div>

        {/* LAYER 2 BODY — 2×2 chart grid */}
        <div className="grid grid-cols-1 sm:flex-1 sm:min-h-0 sm:grid-cols-2 sm:grid-rows-2 gap-3 relative z-10 overflow-y-auto sm:overflow-hidden">

          {/* ──── 1. LINE CHART ──── */}
          <div className="bg-[#020a17] border-2 border-solid border-[#142e66] rounded-xl p-3 flex flex-col gap-1 overflow-hidden min-h-[200px] sm:min-h-0">
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-white leading-tight">
                แนวโน้มการใช้งานโซน <span className="text-gray-500 font-normal normal-case">(HISTORICAL TREND)</span>
              </p>
            </div>
            <div className="flex gap-3 items-center flex-wrap">
              <span className="flex items-center gap-1 text-[8px] text-gray-400">
                <span style={{display:'inline-block',width:14,borderTop:'2px solid #3b82f6'}}/>ข้อมูลประวัติ (Historical)
              </span>
              <span className="flex items-center gap-1 text-[8px] text-gray-400">
                <span style={{display:'inline-block',width:14,borderTop:'2px solid #22c55e'}}/>วันนี้ (Real-time)
              </span>
            </div>
            <svg viewBox="0 0 270 118" className="w-full flex-1" style={{minHeight:72}}>
              <defs>
                <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2"/>
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01"/>
                </linearGradient>
                <linearGradient id="todayGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity="0.18"/>
                  <stop offset="100%" stopColor="#22c55e" stopOpacity="0.01"/>
                </linearGradient>
              </defs>
              {/* Y-axis labels */}
              <text x="2"  y="14"  fill="#4e7aab" fontSize="7">100</text>
              <text x="5"  y="39"  fill="#4e7aab" fontSize="7">75</text>
              <text x="5"  y="64"  fill="#4e7aab" fontSize="7">50</text>
              <text x="5"  y="89"  fill="#4e7aab" fontSize="7">25</text>
              <text x="8"  y="107" fill="#4e7aab" fontSize="7">0</text>
              {/* Horizontal grid lines */}
              {[12,37,62,87,105].map(y=>(
                <line key={y} x1="26" x2="265" y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5"/>
              ))}
              {/* Hourly vertical ticks */}
              {Array.from({length:16},(_,i)=>(
                <line key={i} x1={+(26+i*15.93).toFixed(1)} x2={+(26+i*15.93).toFixed(1)} y1="105" y2="108" stroke="rgba(78,122,171,0.35)" strokeWidth="0.5"/>
              ))}
              {/* X-axis labels every 3 h */}
              {['06','09','12','15','18','21'].map((h,i)=>(
                <text key={h} x={26+i*47.8} y="116" fill="#4e7aab" fontSize="7" textAnchor="middle">{h}:00</text>
              ))}
              {/* Smooth Catmull-Rom curves — hourly data */}
              {(()=>{
                const smooth = pts => {
                  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
                  for(let i=0;i<pts.length-1;i++){
                    const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)]
                    const cp1x=p1[0]+(p2[0]-p0[0])/6, cp1y=p1[1]+(p2[1]-p0[1])/6
                    const cp2x=p2[0]-(p3[0]-p1[0])/6, cp2y=p2[1]-(p3[1]-p1[1])/6
                    d+=` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
                  }
                  return d
                }
                const S = 15.93
                // Historical: 06–21 every hour (bell curve peaking ~14:00)
                const histV = [3,8,20,38,52,65,72,78,82,80,65,50,38,22,12,5]
                // Today: 06–12 (7 pts, current up to now)
                const todayV = [3,12,28,45,60,70,74]
                const hist  = histV.map((v,i) => [26+i*S, 107-v*0.95])
                const today = todayV.map((v,i) => [26+i*S, 107-v*0.95])
                const dH = smooth(hist), dT = smooth(today)
                const [lhx] = hist[hist.length-1]
                const [ltx,lty] = today[today.length-1]
                return (<>
                  {/* Area fills */}
                  <path fill="url(#histGrad)"  stroke="none" d={`${dH} L${lhx.toFixed(1)},107 L26,107 Z`}/>
                  <path fill="url(#todayGrad)" stroke="none" d={`${dT} L${ltx.toFixed(1)},107 L26,107 Z`}/>
                  {/* Lines */}
                  <path fill="none" stroke="#3b82f6" strokeWidth="1.5" d={dH}/>
                  <path fill="none" stroke="#22c55e" strokeWidth="1.5" d={dT}/>
                  {/* Dots every 1 h for historical */}
                  {hist.map(([x,y],i)=>(
                    <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="2" fill="#3b82f6" stroke="#020a17" strokeWidth="0.5"/>
                  ))}
                  {/* Dots every 1 h for today */}
                  {today.map(([x,y],i)=>(
                    <circle key={`t${i}`} cx={x.toFixed(1)} cy={y.toFixed(1)} r="2" fill="#22c55e" stroke="#020a17" strokeWidth="0.5"/>
                  ))}
                  {/* Pulsing tip for today */}
                  <circle cx={ltx.toFixed(1)} cy={lty.toFixed(1)} r="5.5" fill="rgba(34,197,94,0.18)"/>
                  <circle cx={ltx.toFixed(1)} cy={lty.toFixed(1)} r="2.5" fill="#22c55e"/>
                </>)
              })()}
            </svg>
          </div>

          {/* ──── 2. PREDICTIVE TREND ──── */}
          <div className="bg-[#020a17] border-2 border-solid border-[#142e66] rounded-xl p-3 flex flex-col gap-1 overflow-hidden min-h-[200px] sm:min-h-0">
            {/* Header */}
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-white leading-tight">
                คาดการณ์ความหนาแน่น <span className="text-gray-500 font-normal normal-case">(FORECAST)</span>
              </p>
            </div>
            {/* Y-label + Legend row */}
            <div className="flex items-center justify-between gap-1 flex-wrap">
              <span className="text-[8px] text-[#4e7aab]">จำนวนคน ↑</span>
              <div className="flex gap-3 items-center">
                <span className="flex items-center gap-1 text-[8px] text-gray-400">
                  <span style={{display:'inline-block',width:12,borderTop:'2px solid #22c55e'}}/>ข้อมูลจริง (Real-time)
                </span>
                <span className="flex items-center gap-1 text-[8px] text-gray-400">
                  <svg width="12" height="6" style={{display:'inline',verticalAlign:'middle'}}>
                    <line x1="0" y1="3" x2="12" y2="3" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3,2"/>
                  </svg>
                  <span>คาดการณ์ (Predicted)</span>
                </span>
              </div>
            </div>
            {/* Chart SVG */}
            <svg viewBox="0 0 270 118" className="w-full flex-1" style={{minHeight:72}}>
              <defs>
                <linearGradient id="rtGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity="0.2"/>
                  <stop offset="100%" stopColor="#22c55e" stopOpacity="0.01"/>
                </linearGradient>
              </defs>
              {/* Y-axis labels */}
              <text x="2"  y="14"  fill="#4e7aab" fontSize="7">100</text>
              <text x="5"  y="39"  fill="#4e7aab" fontSize="7">75</text>
              <text x="5"  y="64"  fill="#4e7aab" fontSize="7">50</text>
              <text x="5"  y="89"  fill="#4e7aab" fontSize="7">25</text>
              <text x="8"  y="107" fill="#4e7aab" fontSize="7">0</text>
              {/* Grid lines */}
              {[12,37,62,87,105].map(y=>(
                <line key={y} x1="26" x2="265" y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5"/>
              ))}
              {/* Hourly ticks */}
              {Array.from({length:16},(_,i)=>(
                <line key={i} x1={+(26+i*15.93).toFixed(1)} x2={+(26+i*15.93).toFixed(1)} y1="105" y2="108" stroke="rgba(78,122,171,0.35)" strokeWidth="0.5"/>
              ))}
              {/* X-axis labels every 3h */}
              {['06','09','12','15','18','21'].map((h,i)=>(
                <text key={h} x={26+i*47.8} y="116" fill="#4e7aab" fontSize="7" textAnchor="middle">{h}:00</text>
              ))}
              {/* "ตอนนี้" vertical line at 12:00 */}
              <line x1="121.6" x2="121.6" y1="18" y2="105" stroke="#f59e0b" strokeWidth="0.9" strokeDasharray="2.5,2" opacity="0.85"/>
              {/* "ตอนนี้" label tag — top, green */}
              <rect x="105" y="8" width="34" height="11" rx="1.8" fill="rgba(34,197,94,0.18)" stroke="#22c55e" strokeWidth="0.5"/>
              <text x="121.6" y="16.5" fill="#22c55e" fontSize="7" textAnchor="middle" fontWeight="bold">ตอนนี้</text>
              {/* Smooth curves with hourly data */}
              {(()=>{
                const smooth = pts => {
                  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
                  for(let i=0;i<pts.length-1;i++){
                    const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)]
                    const cp1x=p1[0]+(p2[0]-p0[0])/6, cp1y=p1[1]+(p2[1]-p0[1])/6
                    const cp2x=p2[0]-(p3[0]-p1[0])/6, cp2y=p2[1]-(p3[1]-p1[1])/6
                    d+=` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
                  }
                  return d
                }
                const S = 15.93
                const rtV   = [3,12,28,45,60,70,74]                       // 06–12
                const predV = [74,82,88,85,72,55,38,25,14,8]              // 12–21
                const rt   = rtV.map((v,i) => [26+i*S,     107-v*0.95])
                const pred = predV.map((v,j) => [121.6+j*S, 107-v*0.95])
                const dRT   = smooth(rt)
                const dPred = smooth(pred)
                const [ltx,lty] = rt[rt.length-1]
                return (<>
                  {/* Area fill real-time */}
                  <path fill="url(#rtGrad)" stroke="none" d={`${dRT} L${ltx.toFixed(1)},107 L26,107 Z`}/>
                  {/* Lines */}
                  <path fill="none" stroke="#22c55e" strokeWidth="1.5" d={dRT}/>
                  <path fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5,2.5" d={dPred}/>
                  {/* Hourly dots — real-time filled */}
                  {rt.map(([x,y],i)=>(
                    <circle key={`rt${i}`} cx={x.toFixed(1)} cy={y.toFixed(1)} r="2" fill="#22c55e" stroke="#020a17" strokeWidth="0.5"/>
                  ))}
                  {/* Hourly dots — predicted open */}
                  {pred.slice(1).map(([x,y],i)=>(
                    <circle key={`pd${i}`} cx={x.toFixed(1)} cy={y.toFixed(1)} r="2" fill="#020a17" stroke="#f59e0b" strokeWidth="1"/>
                  ))}
                  {/* Current tip — animated pulse */}
                  <circle cx={ltx.toFixed(1)} cy={lty.toFixed(1)} r="5" fill="rgba(34,197,94,0.25)">
                    <animate attributeName="r" values="5;9;5" dur="1.5s" repeatCount="indefinite"/>
                    <animate attributeName="opacity" values="0.5;0.05;0.5" dur="1.5s" repeatCount="indefinite"/>
                  </circle>
                  <circle cx={ltx.toFixed(1)} cy={lty.toFixed(1)} r="2.5" fill="#22c55e"/>
                  {/* Forecast annotation — top-right, yellow */}
                  <rect x="176" y="8" width="89" height="19" rx="3" fill="rgba(245,158,11,0.15)" stroke="#f59e0b" strokeWidth="0.7"/>
                  <text x="220" y="17" fill="#fbbf24" fontSize="7" textAnchor="middle" fontWeight="bold">คาดการณ์จุดพีค</text>
                  <text x="220" y="24" fill="#fde68a" fontSize="7" textAnchor="middle" fontWeight="bold">13:00 – 14:00</text>
                </>)
              })()}
            </svg>
          </div>

          {/* ──── 3. BEHAVIORAL HEATMAP ──── */}
          <div className="bg-[#020a17] border-2 border-solid border-[#142e66] rounded-xl p-3 flex flex-col gap-1 overflow-hidden min-h-[200px] sm:min-h-0">
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-white leading-tight">
                พฤติกรรมการใช้งาน <span className="text-gray-500 font-normal normal-case">(TIME X ZONE)</span>
              </p>
            </div>
            <svg viewBox="0 0 270 130" className="w-full flex-1" style={{minHeight:72}} shapeRendering="crispEdges">
              <defs>
                <linearGradient id="l11CellSheen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.28"/>
                  <stop offset="40%"  stopColor="#ffffff" stopOpacity="0.04"/>
                  <stop offset="100%" stopColor="#000000" stopOpacity="0.28"/>
                </linearGradient>
                <pattern id="l11CellGrid" width="3" height="4" patternUnits="userSpaceOnUse">
                  <line x1="3" y1="0" x2="3" y2="4" stroke="rgba(0,0,0,0.22)" strokeWidth="0.45"/>
                  <line x1="0" y1="4" x2="3" y2="4" stroke="rgba(0,0,0,0.22)" strokeWidth="0.45"/>
                </pattern>
                {L11_ZONE_ROWS.flatMap((row, ri) => row.map((v, ci) => (
                  <linearGradient key={`l11Grad-${ri}-${ci}`} id={`l11Grad-${ri}-${ci}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={heatColor(Math.min(1, v + 0.10), 1)}/>
                    <stop offset="100%" stopColor={heatColor(Math.max(0, v - 0.10), 1)}/>
                  </linearGradient>
                )))}
              </defs>
              {/* Zone labels — right-aligned just before cells */}
              {['A','B','C'].map((z,i)=>(
                <text key={z} x="28" y={18+i*28} fill="#94a3b8" fontSize="7" textAnchor="end" dominantBaseline="middle" shapeRendering="auto">
                  โซน {z}
                </text>
              ))}
              {/* Cells: 3 zones × 16 cols (1 hr each, 06–21) */}
              {L11_ZONE_ROWS.map((row,ri)=>row.map((v,ci)=>(
                <g key={`${ri}-${ci}`}>
                  <rect
                    x={30+ci*15} y={5+ri*28}
                    width="13" height="26" rx="1"
                    fill={`url(#l11Grad-${ri}-${ci})`}
                    stroke="#020a17" strokeWidth="0.8"
                  />
                  <rect
                    x={30+ci*15} y={5+ri*28}
                    width="13" height="26" rx="1"
                    fill="url(#l11CellGrid)" pointerEvents="none"
                  />
                  <rect
                    x={30+ci*15} y={5+ri*28}
                    width="13" height="26" rx="1"
                    fill="url(#l11CellSheen)" pointerEvents="none"
                  />
                </g>
              )))}
              {/* X-axis labels at 06,09,12,15,18,21 → cols 0,3,6,9,12,15 */}
              {['06','09','12','15','18','21'].map((h,i)=>(
                <text key={h} x={37+i*45} y="100" fill="#4e7aab" fontSize="6.5" textAnchor="middle" shapeRendering="auto">{h}:00</text>
              ))}
              {/* Color scale — centered, larger */}
              <text x="87"  y="126" fill="#4e7aab" fontSize="8" textAnchor="end">น้อย</text>
              <defs>
                <linearGradient id="hmGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%"   stopColor="#3b82f6"/>
                  <stop offset="40%"  stopColor="#22c55e"/>
                  <stop offset="70%"  stopColor="#eab308"/>
                  <stop offset="100%" stopColor="#ef4444"/>
                </linearGradient>
              </defs>
              <rect x="90" y="118" width="106" height="7" rx="3" fill="url(#hmGrad)"/>
              <text x="199" y="126" fill="#4e7aab" fontSize="8" textAnchor="start">มาก</text>
            </svg>
          </div>

          {/* ──── 4. COMPARISON BAR CHART ──── */}
          <div className="bg-[#020a17] border-2 border-solid border-[#142e66] rounded-xl p-3 flex flex-col gap-1 overflow-hidden min-h-[200px] sm:min-h-0">
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-white leading-tight">
                การเลือกหนังสือแยกตามหมวดหมู่ <span className="text-gray-500 font-normal normal-case">(COMPARISON BAR CHART)</span>
              </p>
            </div>
            <div className="flex flex-col gap-3 flex-1 justify-center">
              {[
                { label: 'นิยาย วารสาร',                      pct: 35 },
                { label: 'ภาษาไทย',                           pct: 28 },
                { label: 'ภาษาต่างประเทศ',                    pct: 21 },
                { label: 'วิทยานิพนธ์/รายงานการวิจัย',      pct: 16 },
              ].map(({ label, pct }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-300 w-28 text-right leading-tight flex-shrink-0">
                    {label}
                  </span>
                  <div className="flex-1 h-3 rounded-full overflow-hidden" style={{background:'#0a1a35'}}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: 'linear-gradient(90deg,#1e3a8a,#3b82f6)',
                      }}
                    />
                  </div>
                  <span className="text-[9px] text-[#60a5fa] font-bold w-7 text-right flex-shrink-0">
                    {pct}%
                  </span>
                </div>
              ))}
            </div>
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