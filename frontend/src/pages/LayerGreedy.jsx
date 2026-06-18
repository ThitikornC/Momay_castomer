import React, { useState, useEffect } from 'react';
import { Bell, AlertTriangle, Info, Zap, ArrowUpRight } from 'lucide-react';

// gateway (registry + จำนวนคนสด) — ชุดเดียวกับ dashboard
const DEVICES_API = (import.meta.env.VITE_DEVICES_API || 'http://localhost:8002').replace(/\/$/, '')

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

export default function LayerGreedy() {
  const [pulse, setPulse] = useState(true);

  // ── ข้อมูลจริง: กล้องจาก registry + จำนวนคนสด (ชุดเดียวกับ heatmap/เกจของ dashboard) ──
  const [cams, setCams]     = useState([])   // [{ camId, label, roomId }]
  const [rooms, setRooms]   = useState([])   // [{ roomId, label }]
  const [counts, setCounts] = useState({})   // camId -> { count, pct, stale }
  // ห้องที่เลือก — ตามแปลนหน้า momaymodel ผ่าน localStorage ('' = ทุกห้อง)
  const [selRoom, setSelRoom] = useState(() => localStorage.getItem('momay_room') || '')

  useEffect(() => {
    const read = () => setSelRoom(localStorage.getItem('momay_room') || '')
    window.addEventListener('storage', read)        // ข้ามแท็บ (เปลี่ยนห้องบน momaymodel)
    const id = setInterval(read, 1000)              // แท็บเดียวกัน
    return () => { window.removeEventListener('storage', read); clearInterval(id) }
  }, [])

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const r = await fetch(`${DEVICES_API}/api/config`)
        const j = await r.json()
        const list = [], rs = []
        for (const room of (j.rooms || [])) {
          rs.push({ roomId: room.roomId, label: room.label || room.roomId })
          for (const d of (room.devices || []))
            if (d.category === 'camera' && d.meta?.camId)
              list.push({ camId: String(d.meta.camId), label: d.label || `กล้อง ${d.meta.camId}`, roomId: room.roomId })
        }
        if (alive) { setCams(list); setRooms(rs) }
      } catch { /* keep */ }
    }
    load()
    const id = setInterval(load, 30000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  useEffect(() => {
    let alive = true
    async function poll() {
      try {
        const r = await fetch(`${DEVICES_API}/api/camera-counts`)
        const j = await r.json()
        if (alive) setCounts(j.counts || {})
      } catch { /* keep */ }
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setPulse(p => !p), 2000)
    return () => clearInterval(interval)
  }, [])

  // กรองตามห้องที่เลือก (ห้องนั้นไม่มีกล้อง → fallback แสดงทุกห้อง)
  const inRoom = selRoom ? cams.filter(c => c.roomId === selRoom) : cams
  const visibleCams = inRoom.length ? inRoom : cams
  const selRoomLabel = rooms.find(r => r.roomId === selRoom)?.label || ''
  const camRows = visibleCams.map(c => {
    const cc = counts[c.camId]
    const live = !!cc && !cc.stale
    const count = cc?.count ?? 0
    const pct = (live && cc.pct != null) ? cc.pct : null   // % พื้นที่ที่มีคน (relay คำนวณ)
    return { ...c, live, count, pct }
  })
  const livePcts = camRows.filter(r => r.pct != null).map(r => r.pct)
  const hasData = livePcts.length > 0
  const gaugeScore  = hasData ? Math.round(livePcts.reduce((a, b) => a + b, 0) / livePcts.length) : 0
  const needleAngle = (gaugeScore / 100) * 180
  const gaugeColor  = gaugeScore >= 85 ? '#ef4444' : gaugeScore >= 70 ? '#f97316' : gaugeScore >= 40 ? '#f59e0b' : '#10b981'
  const gaugeLabel  = hasData ? camLabel(gaugeScore) : 'ยังไม่มีข้อมูล'
  const isCritical  = hasData && gaugeScore >= 85

  return (
    <div className="min-h-screen w-full bg-[#030d0c] text-[#e2f1ee] font-sans px-2 py-6 sm:px-4 sm:py-8 md:px-6 md:py-8 select-none flex flex-col justify-center">

      {/* Rotate overlay: tablet portrait */}
      <div className="hidden md:portrait:flex fixed inset-0 z-[200] bg-[#030d0c]/95 backdrop-blur-sm flex-col items-center justify-center gap-8 pointer-events-none">
        <div className="relative">
          <svg xmlns="http://www.w3.org/2000/svg" width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="#1f7a68" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="7" y="2" width="10" height="16" rx="1.5" />
            <circle cx="12" cy="16.5" r="0.6" fill="#1f7a68" />
          </svg>
          <svg xmlns="http://www.w3.org/2000/svg" width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
            className="absolute inset-0"
            style={{animation:'rotateHint 2s ease-in-out infinite'}}>
            <path d="M4.5 10.5 A8.5 8.5 0 0 1 19.5 10.5" />
            <polyline points="19.5 6.5 19.5 10.5 15.5 10.5" />
          </svg>
        </div>
        <div className="text-center px-8">
          <p className="text-[#10b981] text-2xl font-bold tracking-wide">โปรดหมุนหน้าจอ</p>
          <p className="text-[#e2f1ee]/50 text-sm mt-2 leading-relaxed">แดชบอร์ดนี้ออกแบบสำหรับ<br />การแสดงผลแนวนอนเท่านั้น</p>
        </div>
        <style>{`@keyframes rotateHint{0%,100%{transform:rotate(0deg)}50%{transform:rotate(15deg)}}`}</style>
      </div>

      <div className="w-full max-w-[960px] mx-auto">
      {/* Main card */}
      <div className="bg-[#041210] rounded-2xl border-2 border-solid border-[#1f7a68] p-5 sm:p-6 shadow-[0_0_32px_rgba(31,122,104,0.4)] relative overflow-hidden flex flex-col">

        {/* glow blobs */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#10b981]/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-[#00a3ff]/5 rounded-full blur-[120px] pointer-events-none" />

        {/* HEADER */}
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
              {selRoomLabel && <span className="whitespace-nowrap text-[#10b981] text-sm font-bold">· {selRoomLabel}</span>}
            </h1>
            <p className="text-[10px] text-[#6fa39b] font-light mt-0.5">
              เลือกสิ่งที่ดีที่สุด ณ เวลาปัจจุบัน เพื่อการตอบสนองและแจ้งเตือนทันที
            </p>
          </div>
          </div>
        </div>

        {/* MAIN 3 COLUMNS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6 min-h-[330px]">

          {/* COL 1: Camera density list */}
          <div className="bg-[#051715] border-2 border-solid border-[#258a70] rounded-xl p-4 flex flex-col h-[260px] md:h-0 md:min-h-full overflow-hidden transition-all duration-300 hover:border-[#30ba90]">
            <div className="flex justify-between items-center mb-3 flex-shrink-0">
              <h2 className="text-xs font-bold text-gray-300 tracking-wider">ความหนาแน่นของโซน</h2>
              <div className={`w-1.5 h-1.5 rounded-full bg-green-500 ${pulse ? 'animate-pulse' : ''}`} />
            </div>

            <div className="flex flex-col gap-2 overflow-y-auto flex-1 min-h-0"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>

              {camRows.length === 0 && (
                <div className="text-[10px] text-[#6fa39b] px-2 py-6 text-center leading-relaxed">
                  ยังไม่มีกล้องใน registry<br />เพิ่มกล้องที่หน้า /settings
                </div>
              )}
              {camRows.map(cam => {
                const pct = cam.pct
                const color = camColor(pct ?? 0)
                return (
                  <div key={cam.camId} className="flex items-center h-[52px] cursor-default group w-full">
                    <div className="w-[56px] h-[56px] flex-shrink-0 flex items-center justify-center select-none relative z-10">
                      <svg className="w-full h-full" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="48" fill="#051715" className="transition-colors duration-300 group-hover:fill-[#061c18]" />
                        <g transform="rotate(-90 50 50)">
                          <circle cx="50" cy="50" r="36" fill="none" stroke={(pct ?? 0) > 0 ? color : '#102620'} strokeWidth="8" strokeDasharray="52.55 173.64" strokeDashoffset="0" />
                          <circle cx="50" cy="50" r="36" fill="none" stroke={(pct ?? 0) >= 25 ? color : '#102620'} strokeWidth="8" strokeDasharray="52.55 173.64" strokeDashoffset="-56.55" />
                          <circle cx="50" cy="50" r="36" fill="none" stroke={(pct ?? 0) >= 50 ? color : '#102620'} strokeWidth="8" strokeDasharray="52.55 173.64" strokeDashoffset="-113.1" />
                          <circle cx="50" cy="50" r="36" fill="none" stroke={(pct ?? 0) >= 75 ? color : '#102620'} strokeWidth="8" strokeDasharray="52.55 173.64" strokeDashoffset="-169.65" />
                        </g>
                        <text x="50" y="56" textAnchor="middle" fill="#ffffff" fontSize="15" fontWeight="bold" fontFamily="system-ui,-apple-system,sans-serif">{pct == null ? '--' : `${pct}%`}</text>
                      </svg>
                    </div>
                    <div className="flex-1 flex items-center h-full -ml-7 bg-[#041513] border-t border-b border-r border-solid rounded-r-xl pr-3 pl-8 transition-all duration-300 group-hover:bg-[#061c18]" style={{ borderColor: color }}>
                      <div className="flex flex-col justify-center select-none min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] font-bold tracking-wide leading-snug truncate" style={{ color, textShadow: `0 0 8px ${color}80` }}>{cam.label}</span>
                          {cam.live && <span className="text-[7px] bg-green-500/20 text-green-400 px-1 py-0.5 rounded font-bold tracking-wider flex-shrink-0">LIVE</span>}
                        </div>
                        <span className="text-[9px] font-semibold tracking-wide leading-snug mt-0.5 truncate" style={{ color: `${color}cc` }}>
                          {pct == null ? 'รอข้อมูลกล้อง' : `${camLabel(pct)} · ${cam.count} คน`}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* COL 2: Gauge */}
          <div className="bg-[#051715] border-2 border-solid border-[#258a70] rounded-xl p-4 flex flex-col justify-between items-center transition-all duration-300 hover:border-[#30ba90]">
            <div className="w-full text-left">
              <h2 className="text-xs font-bold text-gray-300 tracking-wider">ระดับความหนาแน่น</h2>
            </div>

            <div className="relative w-full flex flex-col items-center">
              <svg className="w-full max-w-[280px]" viewBox="0 0 200 130">
                <defs>
                  <linearGradient id="gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="50%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </linearGradient>
                  <filter id="needle-glow">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                    <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                </defs>
                <path d="M 20 110 A 80 80 0 0 1 180 110" fill="none" stroke="#082320" strokeWidth="16" strokeLinecap="round" />
                <path d="M 20 110 A 80 80 0 0 1 180 110" fill="none" stroke="url(#gauge-grad)" strokeWidth="14" strokeLinecap="round" />
                <line x1="28" y1="102" x2="38" y2="98" stroke="#041210" strokeWidth="2" />
                <line x1="43" y1="65" x2="52" y2="65" stroke="#041210" strokeWidth="2" />
                <line x1="100" y1="30" x2="100" y2="40" stroke="#041210" strokeWidth="2" />
                <line x1="157" y1="65" x2="148" y2="65" stroke="#041210" strokeWidth="2" />
                <line x1="172" y1="102" x2="162" y2="98" stroke="#041210" strokeWidth="2" />
                <text x="24"  y="124" fill="#56817a" fontSize="9" textAnchor="middle" fontWeight="bold">0</text>
                <text x="57"  y="77"  fill="#56817a" fontSize="9" textAnchor="middle" fontWeight="bold">25</text>
                <text x="100" y="50"  fill="#56817a" fontSize="9" textAnchor="middle" fontWeight="bold">50</text>
                <text x="143" y="77"  fill="#56817a" fontSize="9" textAnchor="middle" fontWeight="bold">75</text>
                <text x="176" y="124" fill="#56817a" fontSize="9" textAnchor="middle" fontWeight="bold">100</text>
                <g transform={`rotate(${needleAngle}, 100, 110)`} filter="url(#needle-glow)">
                  <line x1="100" y1="110" x2="22" y2="110" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
                  <polygon points="20,110 30,107 30,113" fill="#ffffff" />
                </g>
                <circle cx="100" cy="110" r="7" fill="#041210" stroke="#ffffff" strokeWidth="2.5" />
              </svg>
              <p className="text-3xl lg:text-5xl font-black leading-none mt-2 lg:mt-1"
                style={{ color: gaugeColor, textShadow: `0 0 20px ${gaugeColor}b3, 0 0 40px ${gaugeColor}59` }}>{gaugeScore}</p>
              <p className="text-[13px] lg:text-[18px] font-bold tracking-wide lg:tracking-[3px] mt-1.5 lg:mt-0.5" style={{ color: gaugeColor }}>{gaugeLabel}</p>
            </div>

            {isCritical && (
              <div className="mt-2">
                <div className="border border-[#ef4444]/60 bg-[#ef4444]/5 text-[#ef4444] text-[10px] font-bold px-4 py-1.5 rounded-md tracking-widest uppercase animate-pulse">
                  CRITICAL
                </div>
              </div>
            )}

            <div className="flex items-center gap-1 text-xs lg:text-sm text-[rgb(233,240,239)] mt-1.5 lg:-mt-3">
              <span>แนวโน้ม: เพิ่มขึ้น</span>
              <span className="text-[#ef4444] font-bold flex items-center">
                <ArrowUpRight size={14} className="stroke-[2.5]" />
              </span>
            </div>
          </div>

          {/* COL 3: Heatmap floor plan */}
          <div className="bg-[#051715] border-2 border-solid border-[#258a70] rounded-xl p-4 flex flex-col transition-all duration-300 hover:border-[#30ba90]">
            <div className="flex-shrink-0 mb-2">
              <h2 className="text-xs font-bold text-gray-300 tracking-wider">แผนที่ความหนาแน่น</h2>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="relative w-full bg-[#030f0e] rounded-lg border border-[#0d2e29]/60 overflow-hidden"
                style={{ aspectRatio: '591/673' }}>
                <svg className="w-full h-full" viewBox="0 0 591 673" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <filter id="neon-red-glow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur"/>
                      <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                  </defs>
                  <path d="M13 468.323L386.5 652.323L496.5 542.323L345.5 470.085L334.5 464.823L120.5 360.214L13 468.323Z" fill="#11FB30" fillOpacity="0.47"/>
                  <path d="M125.363 355.323L120.5 360.214L334.5 464.823L461 337.806L248 231.991L125.363 355.323Z" fill="#FFFB10" fillOpacity="0.72"/>
                  <path d="M579.5 218.823L366 113.323L248 231.991L461 337.806L579.5 218.823Z" fill="#FF1515" filter="url(#neon-red-glow)">
                    <animate attributeName="fill-opacity" values="0.9;0.18;0.9" dur="1.1s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/>
                  </path>
                  <path d="M120.5 360.214L334.5 464.823L345.5 470.085L496.5 542.323V559.823L386.5 670.323L1.5 481.323V363.823L107.729 258.323M386.5 670.323V652.323M496.5 542.323L386.5 652.323M334.5 464.823L461 337.806M579.5 218.823V121.323M579.5 218.823L589.5 224.323M579.5 218.823L366 113.323M579.5 218.823L461 337.806M246.756 134.736L366 15.3227L579.5 121.323M579.5 121.323L589.5 113.323M366 15.3227V113.323M386.5 652.323L13 468.323V368.823M13 368.823L1.5 363.823M13 368.823L120.5 261.17M13 468.323L120.5 360.214M345.5 470.085L461 353.751L589.5 224.323V113.323L366 1.82266L236.864 130.073L107.729 258.323M366 113.323L248 231.991M120.5 360.214L125.363 355.323L248 231.991M120.5 360.214V261.17M461 337.806L248 231.991M461 337.806V353.751M248 231.991V135.323L246.756 134.736M120.5 261.17L107.729 258.323M120.5 261.17L246.756 134.736M236.864 130.073L246.756 134.736" stroke="#FFFDFD" strokeWidth="3"/>
                  <path d="M248.5 233.323L122.5 361.823L336 462.823L461 338.323L248.5 233.323Z" stroke="#E1DE08" strokeOpacity="0.72" strokeWidth="3"/>
                  <path d="M121 362.823L17 466.323L387.5 648.323L493.5 542.323L121 362.323Z" stroke="#35E200" strokeWidth="3"/>
                  <path d="M163.409 465.448L160.715 468.404L157.758 465.71L152.37 471.623L149.413 468.929L157.496 460.059L163.409 465.448ZM160.715 468.404L163.671 471.098L160.977 474.055L158.02 471.361L160.715 468.404ZM169.322 470.836L172.278 473.53L164.196 482.4L158.283 477.011L160.977 474.055L163.933 476.749L169.322 470.836ZM168.797 459.534L165.841 456.84L168.535 453.884L171.492 456.578L168.797 459.534ZM174.71 464.923L172.016 467.879L166.103 462.491L168.797 459.534L174.71 464.923ZM180.099 459.01L177.405 461.966L171.492 456.578L174.186 453.621L180.099 459.01ZM177.405 461.966L180.361 464.661L177.667 467.617L174.71 464.923L177.405 461.966ZM188.444 455.791L185.75 458.748L173.924 447.971L179.312 442.058L182.269 444.752L179.574 447.708L188.444 455.791ZM193.832 449.878L191.138 452.835L182.269 444.752L184.963 441.795L193.832 449.878ZM196.264 441.271L193.57 444.227L187.657 438.839L190.351 435.882L187.395 433.188L190.089 430.231L193.046 432.926L195.74 429.969L198.696 432.663L193.308 438.577L196.264 441.271ZM199.221 443.965L196.264 441.271L201.653 435.358L204.609 438.052L199.221 443.965ZM199.185 473.697L196.229 471.003L201.617 465.09L204.574 467.784L199.185 473.697ZM211.011 484.474L208.317 487.431L196.491 476.654L199.185 473.697L202.142 476.391L207.53 470.478L204.574 467.784L207.268 464.828L219.094 475.605L216.4 478.561L210.487 473.173L205.098 479.086L211.011 484.474Z" fill="black"/>
                  <path d="M262.409 338.448L259.715 341.404L256.758 338.71L251.37 344.623L248.413 341.929L256.496 333.059L262.409 338.448ZM259.715 341.404L262.671 344.098L259.977 347.055L257.02 344.361L259.715 341.404ZM268.322 343.836L271.278 346.53L263.196 355.4L257.283 350.011L259.977 347.055L262.933 349.749L268.322 343.836ZM267.797 332.534L264.841 329.84L267.535 326.884L270.492 329.578L267.797 332.534ZM273.71 337.923L271.016 340.879L265.103 335.491L267.797 332.534L273.71 337.923ZM279.099 332.01L276.405 334.966L270.492 329.578L273.186 326.621L279.099 332.01ZM276.405 334.966L279.361 337.661L276.667 340.617L273.71 337.923L276.405 334.966ZM287.444 328.791L284.75 331.748L272.924 320.971L278.312 315.058L281.269 317.752L278.574 320.708L287.444 328.791ZM292.832 322.878L290.138 325.835L281.269 317.752L283.963 314.795L292.832 322.878ZM295.264 314.271L292.57 317.227L286.657 311.839L289.351 308.882L286.395 306.188L289.089 303.231L292.046 305.926L294.74 302.969L297.696 305.663L292.308 311.577L295.264 314.271ZM298.221 316.965L295.264 314.271L300.653 308.358L303.609 311.052L298.221 316.965ZM307.055 354.78L312.443 348.867L315.4 351.561L307.317 360.431L292.534 346.959L300.617 338.09L303.574 340.784L298.185 346.697L301.142 349.391L306.53 343.478L309.487 346.173L304.098 352.086L307.055 354.78ZM309.224 340.522L306.53 343.478L303.574 340.784L306.268 337.828L309.224 340.522ZM315.137 345.91L312.443 348.867L309.487 346.173L312.181 343.216L315.137 345.91Z" fill="black"/>
                  <path d="M375.409 216.448L372.715 219.404L369.758 216.71L364.37 222.623L361.413 219.929L369.496 211.059L375.409 216.448ZM372.715 219.404L375.671 222.098L372.977 225.055L370.02 222.361L372.715 219.404ZM381.322 221.836L384.278 224.53L376.196 233.4L370.283 228.011L372.977 225.055L375.933 227.749L381.322 221.836ZM380.797 210.534L377.841 207.84L380.535 204.884L383.492 207.578L380.797 210.534ZM386.71 215.923L384.016 218.879L378.103 213.491L380.797 210.534L386.71 215.923ZM392.099 210.01L389.405 212.966L383.492 207.578L386.186 204.621L392.099 210.01ZM389.405 212.966L392.361 215.661L389.667 218.617L386.71 215.923L389.405 212.966ZM400.444 206.791L397.75 209.748L385.924 198.971L391.312 193.058L394.269 195.752L391.574 198.708L400.444 206.791ZM405.832 200.878L403.138 203.835L394.269 195.752L396.963 192.795L405.832 200.878ZM408.264 192.271L405.57 195.227L399.657 189.839L402.351 186.882L399.395 184.188L402.089 181.231L405.046 183.926L407.74 180.969L410.696 183.663L405.308 189.577L408.264 192.271ZM411.221 194.965L408.264 192.271L413.653 186.358L416.609 189.052L411.221 194.965ZM411.185 224.697L408.229 222.003L413.617 216.09L416.574 218.784L411.185 224.697ZM420.055 232.78L417.36 235.736L408.491 227.654L411.185 224.697L420.055 232.78ZM419.53 221.478L416.574 218.784L419.268 215.828L422.224 218.522L419.53 221.478ZM428.137 223.91L425.443 226.867L422.487 224.173L425.181 221.216L428.137 223.91ZM425.443 226.867L428.4 229.561L423.011 235.474L420.055 232.78L425.443 226.867Z" fill="black"/>
                  <path d="M366 113.823L251 230.323L462.5 336.823L580 218.323L366 113.823Z" stroke="#E10808" strokeOpacity="0.72" strokeWidth="3"/>
                </svg>
              </div>
            </div>
          </div>

        </div>

        {/* BOTTOM: Real-time notification & alerts */}
        <div className="border-2 border-solid border-[#258a70] rounded-xl pt-3 pb-3 px-3 flex-shrink-0">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-[#84cc16]/40" />
            <h3 className="text-[9px] lg:text-xs font-bold text-[#84cc16] tracking-[0.15em] lg:tracking-[0.25em] uppercase text-center flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[#84cc16] animate-pulse" />
              REAL-TIME NOTIFICATION &amp; PREVENTIVE ALERT
            </h3>
            <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-[#84cc16]/40" />
          </div>

          <div className="grid grid-cols-3 gap-3">

            {/* ALERT 1 */}
            <div className="bg-[#180a0a] border-2 border-solid border-[#b91c1c] rounded-lg py-2 px-3 flex flex-col relative min-h-[64px] transition-all hover:bg-[#250f0f]">
              <div className="flex-1 flex items-center gap-2">
                <div className="relative flex-shrink-0">
                  <div className="absolute inset-0 bg-red-600 rounded-full blur-sm opacity-50 animate-ping" />
                  <div className="w-10 h-10 bg-[#7f1d1d]/40 rounded-full flex items-center justify-center text-[#ef4444]">
                    <Bell size={18} className="animate-bounce" />
                  </div>
                </div>
                <div className="min-w-0">
                  <h4 className="text-[10px] font-bold text-white truncate">โซน C หนาแน่นมาก</h4>
                  <p className="text-[9px] text-gray-400">แนะนำให้ย้ายไปโซน A</p>
                </div>
              </div>
              <span className="absolute bottom-1.5 right-2 text-[9px] text-gray-500 font-medium">07:45</span>
            </div>

            {/* ALERT 2 */}
            <div className="bg-[#1c1205] border-2 border-solid border-[#b45309] rounded-lg py-2 px-3 flex flex-col relative min-h-[64px] transition-all hover:bg-[#281a07]">
              <div className="flex-1 flex items-center gap-2">
                <div className="w-10 h-10 bg-[#78350f]/40 rounded-full flex items-center justify-center text-[#f59e0b] flex-shrink-0">
                  <AlertTriangle size={18} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-[10px] font-bold text-white truncate">โซน B ใกล้เต็ม</h4>
                  <p className="text-[9px] text-gray-400">ความหนาแน่น 65%</p>
                </div>
              </div>
              <span className="absolute bottom-1.5 right-2 text-[9px] text-gray-500 font-medium">07:45</span>
            </div>

            {/* ALERT 3 */}
            <div className="bg-[#051118] border-2 border-solid border-[#0369a1] rounded-lg py-2 px-3 flex flex-col relative min-h-[64px] transition-all hover:bg-[#091b25]">
              <div className="flex-1 flex items-center gap-2">
                <div className="w-10 h-10 bg-[#0369a1]/30 rounded-full flex items-center justify-center text-[#38bdf8] flex-shrink-0">
                  <Info size={18} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-[10px] font-bold text-white truncate">มีที่ว่างในโซน D</h4>
                  <p className="text-[9px] text-gray-400">แนะนำ 18 ที่นั่ง</p>
                </div>
              </div>
              <span className="absolute bottom-1.5 right-2 text-[9px] text-gray-500 font-medium">07:45</span>
            </div>

          </div>
        </div>

      </div>
      </div>
    </div>
  );
}
