import React from 'react';
import { Brain } from 'lucide-react';

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

const smooth = pts => {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6, cp1y = p1[1] + (p2[1] - p0[1]) / 6
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6, cp2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

export default function LayerDP() {
  const S = 15.93

  // Line chart data
  const histV  = [3, 8, 20, 38, 52, 65, 72, 78, 82, 80, 65, 50, 38, 22, 12, 5]
  const todayV = [3, 12, 28, 45, 60, 70, 74]
  const hist   = histV.map((v, i)  => [26 + i * S, 107 - v * 0.95])
  const today  = todayV.map((v, i) => [26 + i * S, 107 - v * 0.95])
  const dHist  = smooth(hist)
  const dToday = smooth(today)
  const [lhx]       = hist[hist.length - 1]
  const [ltx, lty]  = today[today.length - 1]

  // Forecast data
  const rtV   = [3, 12, 28, 45, 60, 70, 74]
  const predV = [74, 82, 88, 85, 72, 55, 38, 25, 14, 8]
  const rt    = rtV.map((v, i)   => [26 + i * S,      107 - v * 0.95])
  const pred  = predV.map((v, j) => [121.6 + j * S,   107 - v * 0.95])
  const dRT   = smooth(rt)
  const dPred = smooth(pred)
  const [rtx, rty] = rt[rt.length - 1]

  return (
    <div className="min-h-screen w-full bg-[#030d0c] text-[#e2f1ee] font-sans px-2 py-6 sm:px-4 sm:py-8 md:px-6 md:py-8 select-none flex flex-col justify-center">

      {/* Rotate overlay: tablet portrait */}
      <div className="hidden md:portrait:flex fixed inset-0 z-[200] bg-[#040d1c]/95 backdrop-blur-sm flex-col items-center justify-center gap-8 pointer-events-none">
        <div className="relative">
          <svg xmlns="http://www.w3.org/2000/svg" width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="#1a3d78" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="7" y="2" width="10" height="16" rx="1.5" />
            <circle cx="12" cy="16.5" r="0.6" fill="#1a3d78" />
          </svg>
          <svg xmlns="http://www.w3.org/2000/svg" width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
            className="absolute inset-0"
            style={{ animation: 'rotateHint 2s ease-in-out infinite' }}>
            <path d="M4.5 10.5 A8.5 8.5 0 0 1 19.5 10.5" />
            <polyline points="19.5 6.5 19.5 10.5 15.5 10.5" />
          </svg>
        </div>
        <div className="text-center px-8">
          <p className="text-[#3b82f6] text-2xl font-bold tracking-wide">โปรดหมุนหน้าจอ</p>
          <p className="text-[#e2f1ee]/50 text-sm mt-2 leading-relaxed">แดชบอร์ดนี้ออกแบบสำหรับ<br />การแสดงผลแนวนอนเท่านั้น</p>
        </div>
        <style>{`@keyframes rotateHint{0%,100%{transform:rotate(0deg)}50%{transform:rotate(15deg)}}`}</style>
      </div>

      <div className="w-full max-w-[960px] mx-auto">

      {/* Main card */}
      <div className="bg-[#040d1c] rounded-2xl border-2 border-solid border-[#1a3d78] p-5 sm:p-6 shadow-[0_0_32px_rgba(26,61,120,0.4)] relative overflow-hidden flex flex-col">

        {/* glow blobs */}
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#3b82f6]/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#6366f1]/5 rounded-full blur-[120px] pointer-events-none" />

        {/* HEADER */}
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#0f2244]/60 flex-shrink-0 relative z-10">
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

        {/* LAYER 2 BODY — 2×2 chart grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-rows-2 gap-3 relative z-10 overflow-y-auto sm:overflow-hidden">

          {/* ──── 1. LINE CHART ──── */}
          <div className="bg-[#020a17] border-2 border-solid border-[#142e66] rounded-xl p-3 flex flex-col gap-1 overflow-hidden min-h-[200px] sm:min-h-0">
            <div className="flex-shrink-0">
              <p className="text-[10px] font-bold tracking-widest uppercase text-white leading-tight">
                แนวโน้มการใช้งานโซน <span className="text-gray-500 font-normal normal-case">(HISTORICAL TREND)</span>
              </p>
            </div>
            <div className="flex gap-3 items-center flex-wrap flex-shrink-0">
              <span className="flex items-center gap-1 text-[8px] text-gray-400">
                <span style={{ display: 'inline-block', width: 14, borderTop: '2px solid #3b82f6' }} />ข้อมูลประวัติ (Historical)
              </span>
              <span className="flex items-center gap-1 text-[8px] text-gray-400">
                <span style={{ display: 'inline-block', width: 14, borderTop: '2px solid #22c55e' }} />วันนี้ (Real-time)
              </span>
            </div>
            <svg viewBox="0 0 270 118" className="w-full flex-1" style={{ minHeight: 0 }}>
              <defs>
                <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#3b82f6" stopOpacity="0.2"/>
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01"/>
                </linearGradient>
                <linearGradient id="todayGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#22c55e" stopOpacity="0.18"/>
                  <stop offset="100%" stopColor="#22c55e" stopOpacity="0.01"/>
                </linearGradient>
              </defs>
              <text x="2"  y="14"  fill="#4e7aab" fontSize="7">100</text>
              <text x="5"  y="39"  fill="#4e7aab" fontSize="7">75</text>
              <text x="5"  y="64"  fill="#4e7aab" fontSize="7">50</text>
              <text x="5"  y="89"  fill="#4e7aab" fontSize="7">25</text>
              <text x="8"  y="107" fill="#4e7aab" fontSize="7">0</text>
              {[12, 37, 62, 87, 105].map(y => (
                <line key={y} x1="26" x2="265" y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5"/>
              ))}
              {Array.from({ length: 16 }, (_, i) => (
                <line key={i} x1={+(26 + i * S).toFixed(1)} x2={+(26 + i * S).toFixed(1)} y1="105" y2="108" stroke="rgba(78,122,171,0.35)" strokeWidth="0.5"/>
              ))}
              {['06', '09', '12', '15', '18', '21'].map((h, i) => (
                <text key={h} x={26 + i * 47.8} y="116" fill="#4e7aab" fontSize="7" textAnchor="middle">{h}:00</text>
              ))}
              <path fill="url(#histGrad)"  stroke="none" d={`${dHist}  L${lhx.toFixed(1)},107 L26,107 Z`}/>
              <path fill="url(#todayGrad)" stroke="none" d={`${dToday} L${ltx.toFixed(1)},107 L26,107 Z`}/>
              <path fill="none" stroke="#3b82f6" strokeWidth="1.5" d={dHist}/>
              <path fill="none" stroke="#22c55e" strokeWidth="1.5" d={dToday}/>
              {hist.map(([x, y], i) => (
                <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="2" fill="#3b82f6" stroke="#020a17" strokeWidth="0.5"/>
              ))}
              {today.map(([x, y], i) => (
                <circle key={`t${i}`} cx={x.toFixed(1)} cy={y.toFixed(1)} r="2" fill="#22c55e" stroke="#020a17" strokeWidth="0.5"/>
              ))}
              <circle cx={ltx.toFixed(1)} cy={lty.toFixed(1)} r="5.5" fill="rgba(34,197,94,0.18)"/>
              <circle cx={ltx.toFixed(1)} cy={lty.toFixed(1)} r="2.5" fill="#22c55e"/>
            </svg>
          </div>

          {/* ──── 2. PREDICTIVE TREND ──── */}
          <div className="bg-[#020a17] border-2 border-solid border-[#142e66] rounded-xl p-3 flex flex-col gap-1 overflow-hidden min-h-[200px] sm:min-h-0">
            <div className="flex-shrink-0">
              <p className="text-[10px] font-bold tracking-widest uppercase text-white leading-tight">
                คาดการณ์ความหนาแน่น <span className="text-gray-500 font-normal normal-case">(FORECAST)</span>
              </p>
            </div>
            <div className="flex items-center justify-between gap-1 flex-wrap flex-shrink-0">
              <span className="text-[8px] text-[#4e7aab]">จำนวนคน ↑</span>
              <div className="flex gap-3 items-center">
                <span className="flex items-center gap-1 text-[8px] text-gray-400">
                  <span style={{ display: 'inline-block', width: 12, borderTop: '2px solid #22c55e' }} />ข้อมูลจริง (Real-time)
                </span>
                <span className="flex items-center gap-1 text-[8px] text-gray-400">
                  <svg width="12" height="6" style={{ display: 'inline', verticalAlign: 'middle' }}>
                    <line x1="0" y1="3" x2="12" y2="3" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3,2"/>
                  </svg>
                  <span>คาดการณ์ (Predicted)</span>
                </span>
              </div>
            </div>
            <svg viewBox="0 0 270 118" className="w-full flex-1" style={{ minHeight: 0 }}>
              <defs>
                <linearGradient id="rtGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#22c55e" stopOpacity="0.2"/>
                  <stop offset="100%" stopColor="#22c55e" stopOpacity="0.01"/>
                </linearGradient>
              </defs>
              <text x="2"  y="14"  fill="#4e7aab" fontSize="7">100</text>
              <text x="5"  y="39"  fill="#4e7aab" fontSize="7">75</text>
              <text x="5"  y="64"  fill="#4e7aab" fontSize="7">50</text>
              <text x="5"  y="89"  fill="#4e7aab" fontSize="7">25</text>
              <text x="8"  y="107" fill="#4e7aab" fontSize="7">0</text>
              {[12, 37, 62, 87, 105].map(y => (
                <line key={y} x1="26" x2="265" y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5"/>
              ))}
              {Array.from({ length: 16 }, (_, i) => (
                <line key={i} x1={+(26 + i * S).toFixed(1)} x2={+(26 + i * S).toFixed(1)} y1="105" y2="108" stroke="rgba(78,122,171,0.35)" strokeWidth="0.5"/>
              ))}
              {['06', '09', '12', '15', '18', '21'].map((h, i) => (
                <text key={h} x={26 + i * 47.8} y="116" fill="#4e7aab" fontSize="7" textAnchor="middle">{h}:00</text>
              ))}
              <line x1="121.6" x2="121.6" y1="18" y2="105" stroke="#f59e0b" strokeWidth="0.9" strokeDasharray="2.5,2" opacity="0.85"/>
              <rect x="105" y="8" width="34" height="11" rx="1.8" fill="rgba(34,197,94,0.18)" stroke="#22c55e" strokeWidth="0.5"/>
              <text x="121.6" y="16.5" fill="#22c55e" fontSize="7" textAnchor="middle" fontWeight="bold">ตอนนี้</text>
              <path fill="url(#rtGrad)" stroke="none" d={`${dRT} L${rtx.toFixed(1)},107 L26,107 Z`}/>
              <path fill="none" stroke="#22c55e" strokeWidth="1.5" d={dRT}/>
              <path fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5,2.5" d={dPred}/>
              {rt.map(([x, y], i) => (
                <circle key={`rt${i}`} cx={x.toFixed(1)} cy={y.toFixed(1)} r="2" fill="#22c55e" stroke="#020a17" strokeWidth="0.5"/>
              ))}
              {pred.slice(1).map(([x, y], i) => (
                <circle key={`pd${i}`} cx={x.toFixed(1)} cy={y.toFixed(1)} r="2" fill="#020a17" stroke="#f59e0b" strokeWidth="1"/>
              ))}
              <circle cx={rtx.toFixed(1)} cy={rty.toFixed(1)} r="5" fill="rgba(34,197,94,0.25)">
                <animate attributeName="r"       values="5;9;5"       dur="1.5s" repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0.5;0.05;0.5" dur="1.5s" repeatCount="indefinite"/>
              </circle>
              <circle cx={rtx.toFixed(1)} cy={rty.toFixed(1)} r="2.5" fill="#22c55e"/>
              <rect x="176" y="8" width="89" height="19" rx="3" fill="rgba(245,158,11,0.15)" stroke="#f59e0b" strokeWidth="0.7"/>
              <text x="220" y="17" fill="#fbbf24" fontSize="7" textAnchor="middle" fontWeight="bold">คาดการณ์จุดพีค</text>
              <text x="220" y="24" fill="#fde68a" fontSize="7" textAnchor="middle" fontWeight="bold">13:00 – 14:00</text>
            </svg>
          </div>

          {/* ──── 3. BEHAVIORAL HEATMAP ──── */}
          <div className="bg-[#020a17] border-2 border-solid border-[#142e66] rounded-xl p-3 flex flex-col gap-1 overflow-hidden min-h-[200px] sm:min-h-0">
            <div className="flex-shrink-0">
              <p className="text-[10px] font-bold tracking-widest uppercase text-white leading-tight">
                พฤติกรรมการใช้งาน <span className="text-gray-500 font-normal normal-case">(TIME X ZONE)</span>
              </p>
            </div>
            <svg viewBox="0 0 270 130" className="w-full flex-1" style={{ minHeight: 0 }}>
              {['A', 'B', 'C'].map((z, i) => (
                <text key={z} x="28" y={18 + i * 28} fill="#94a3b8" fontSize="7" textAnchor="end" dominantBaseline="middle">
                  โซน {z}
                </text>
              ))}
              {[
                [0.10, 0.15, 0.25, 0.45, 0.60, 0.72, 0.82, 0.90, 0.85, 0.75, 0.60, 0.48, 0.35, 0.20, 0.12, 0.08],
                [0.10, 0.12, 0.20, 0.30, 0.42, 0.55, 0.65, 0.72, 0.75, 0.82, 0.65, 0.52, 0.40, 0.25, 0.15, 0.10],
                [0.20, 0.32, 0.50, 0.72, 0.88, 0.82, 0.75, 0.65, 0.72, 0.85, 0.90, 0.72, 0.55, 0.38, 0.25, 0.18],
              ].map((row, ri) => row.map((v, ci) => (
                <rect key={`${ri}-${ci}`}
                  x={30 + ci * 15} y={5 + ri * 28}
                  width="14.5" height="27"
                  rx="2"
                  fill={heatColor(v, 0.88)}
                />
              )))}
              {['06', '09', '12', '15', '18', '21'].map((h, i) => (
                <text key={h} x={37.25 + i * 45} y="100" fill="#4e7aab" fontSize="6.5" textAnchor="middle">{h}:00</text>
              ))}
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
            <div className="flex-shrink-0">
              <p className="text-[10px] font-bold tracking-widest uppercase text-white leading-tight">
                การเลือกหนังสือแยกตามหมวดหมู่ <span className="text-gray-500 font-normal normal-case">(COMPARISON BAR CHART)</span>
              </p>
            </div>
            <div className="flex flex-col gap-4 flex-1 justify-center">
              {[
                { label: 'นิยาย วารสาร',                 pct: 35 },
                { label: 'ภาษาไทย',                      pct: 28 },
                { label: 'ภาษาต่างประเทศ',               pct: 21 },
                { label: 'วิทยานิพนธ์/รายงานการวิจัย', pct: 16 },
              ].map(({ label, pct }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-300 w-32 text-right leading-tight flex-shrink-0">{label}</span>
                  <div className="flex-1 h-3.5 rounded-full overflow-hidden" style={{ background: '#0a1a35' }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#1e3a8a,#3b82f6)' }}
                    />
                  </div>
                  <span className="text-[9px] text-[#60a5fa] font-bold w-8 text-right flex-shrink-0">{pct}%</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
      </div>
    </div>
  );
}
