import { useState, useEffect, useCallback } from 'react'
import { useToast } from '../components/Toast.jsx'

const API = (import.meta.env.VITE_DEVICES_API || 'http://localhost:8002').replace(/\/$/, '')
const CACHE_KEY = 'momay_config_cache'
const CAM_BASE = (import.meta.env.VITE_GATEWAY_URL || '').replace(/\/$/, '')   // person-counter gateway (mjpeg)
// cctv server (ws) — ใช้ gen wsUrl ของกล้องอัตโนมัติจาก camId
const CCTV_WS_BASE = (import.meta.env.VITE_CCTV_WS_BASE || 'wss://cctv-production-c602.up.railway.app/ws/stream').replace(/\/$/, '')

// สร้าง URL หน้า viewer กล้อง (เปิดเป็นลิงก์เดี่ยว/ฝังได้)
function camViewerUrl(dev) {
  const origin = window.location.origin
  const label = encodeURIComponent(dev.label || dev.deviceId)
  const m = dev.meta || {}
  if (m.streamKind === 'mjpeg' && m.camId) {
    return `${origin}/cam?kind=mjpeg&base=${encodeURIComponent(CAM_BASE)}&cam=${encodeURIComponent(m.camId)}&label=${label}`
  }
  if ((m.streamKind || 'ws') === 'ws' && m.wsUrl) {   // ว่าง = ws (default)
    return `${origin}/cam?kind=ws&url=${encodeURIComponent(m.wsUrl)}&label=${label}`
  }
  return null
}

const CATEGORIES = [
  { value: 'meter',     label: 'มิเตอร์ไฟ' },
  { value: 'switch',    label: 'สวิตช์ WiFi' },
  { value: 'ir-remote', label: 'IR Remote' },
  { value: 'camera',    label: 'กล้อง' },
  { value: 'sensor',    label: 'เซนเซอร์' },
  { value: 'other',     label: 'อื่นๆ' },
]
// บทบาท → โปรโตคอล/ที่มา (type) เริ่มต้น
const TYPE_BY_CATEGORY = {
  meter: 'meter', switch: 'tasmota', 'ir-remote': 'tuya-ir', camera: 'camera', sensor: 'manual', other: 'manual',
}
const catLabel = v => CATEGORIES.find(c => c.value === v)?.label || v
// สี ต่อประเภทอุปกรณ์ — ใช้ในการ์ดอุปกรณ์
const CAT_META = {
  meter:       { color: '#FFB800' },
  switch:      { color: '#60a5fa' },
  'ir-remote': { color: '#a78bfa' },
  camera:      { color: '#f472b6' },
  sensor:      { color: '#34d399' },
  other:       { color: '#9ca3af' },
}
const catMeta = v => CAT_META[v] || CAT_META.other
// แบ่งอุปกรณ์เป็นหมวดย่อย (มิเตอร์ / สวิตช์ / … ) เรียงตาม CATEGORIES แล้วเรียงชื่อในหมวด
// → คืน [{ cat, items }] เพื่อ render เป็นแถวแยกต่อหมวด
const groupByCategory = list => {
  const buckets = {}
  for (const d of (list || [])) (buckets[d.category || 'other'] ||= []).push(d)
  const byName = (a, b) => String(a.label || a.deviceId).localeCompare(String(b.label || b.deviceId), 'th')
  const known = CATEGORIES.map(c => c.value).filter(v => buckets[v]?.length)
  const unknown = Object.keys(buckets).filter(v => !CATEGORIES.some(c => c.value === v))
  return [...known, ...unknown].map(cat => ({ cat, items: buckets[cat].sort(byName) }))
}

// ── styles ──────────────────────────────────────────────────────────
const S = {
  page:   { minHeight: '100vh', background: 'radial-gradient(1200px 600px at 50% -10%, rgba(255,184,0,0.06), transparent 60%), #0a020f', color: '#e6e6e6', fontFamily: 'Sarabun, sans-serif', padding: '24px 16px' },
  wrap:   { maxWidth: 980, margin: '0 auto' },
  // header row (title + actions) ─ แบบการ์ด Device Management
  headRow:{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 },
  h1:     { color: '#fff', fontSize: 24, fontWeight: 800, margin: '0 0 4px', letterSpacing: 0.3 },
  sub:    { color: '#8a8a96', fontSize: 13 },
  // summary stat cards
  statGrid:{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 22 },
  statCard:{ position: 'relative', background: 'linear-gradient(160deg, rgba(28,14,40,0.95) 0%, rgba(16,7,24,0.95) 100%)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 18, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' },
  statHd: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, color: '#cfcfda', fontSize: 14, fontWeight: 600 },
  statNum:{ fontSize: 38, fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: 0.5 },
  statSub:{ marginTop: 12, fontSize: 12, color: '#7d7d8a' },
  badge:  { display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, marginRight: 6 },
  card:   { background: 'rgba(20,8,28,0.8)', border: '1px solid rgba(255,184,0,0.18)', borderRadius: 16, padding: 16, marginBottom: 14, boxShadow: '0 6px 18px rgba(0,0,0,0.3)' },
  roomHd: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  tag:    { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,184,0,0.15)', color: '#FFB800' },
  btn:    { cursor: 'pointer', border: 'none', background: 'linear-gradient(135deg,#FFB800,#ff9500)', color: '#1a1004', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 800, boxShadow: '0 4px 14px rgba(255,184,0,0.3)' },
  btnGhost:{ cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)', color: '#bbb', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600 },
  btnDanger:{ cursor: 'pointer', border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700 },
  input:  { width: '100%', boxSizing: 'border-box', background: '#160a20', border: '1px solid rgba(255,184,0,0.25)', borderRadius: 8, color: '#eee', padding: '8px 10px', fontSize: 13, marginTop: 4 },
  label:  { fontSize: 11, color: '#FFB800', fontWeight: 700 },
  grid2:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  devRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' },
  // device cards grid
  devGrid:{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 },
  // หัวข้อหมวดย่อยในห้อง (มิเตอร์ / กล้อง / …)
  devGroupHd:{ display: 'flex', alignItems: 'center', gap: 7, margin: '14px 2px 8px', fontSize: 12, fontWeight: 700, letterSpacing: 0.3 },
  devCard:{ position: 'relative', minHeight: 132, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 11, padding: 10, display: 'flex', flexDirection: 'column', gap: 7 },
  // ไอคอนแจ้งเตือน offline มุมขวาบน (กดดูเหตุผล)
  alertBtn:{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: '50%', border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: 12, lineHeight: 1, cursor: 'pointer', display: 'grid', placeItems: 'center', zIndex: 2 },
  alertPop:{ position: 'absolute', top: 34, right: 8, width: 220, background: '#1a0a12', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 10, padding: '9px 11px', fontSize: 11, lineHeight: 1.5, boxShadow: '0 10px 30px rgba(0,0,0,0.6)', zIndex: 5 },
  statusDot:{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  // ปุ่มเล็กในการ์ดอุปกรณ์
  miniBtn:{ cursor: 'pointer', border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)', color: '#aaa', borderRadius: 7, padding: '3px 10px', fontSize: 11, fontWeight: 600 },
  miniDanger:{ cursor: 'pointer', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', borderRadius: 7, padding: '3px 10px', fontSize: 11, fontWeight: 600 },
  // popup modal
  overlay:{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' },
  modal:  { width: '100%', maxWidth: 760, maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', background: '#120516', border: '1px solid rgba(255,184,0,0.22)', borderRadius: 18, padding: 18, boxShadow: '0 24px 60px rgba(0,0,0,0.6)' },
  modalHd:{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  modalX: { cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#bbb', borderRadius: 8, width: 30, height: 30, fontSize: 13, lineHeight: 1 },
}

// เช็คจอมือถือ (responsive ผ่าน JS เพราะ style เป็น inline)
function useIsMobile(bp = 640) {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth < bp)
  useEffect(() => {
    const on = () => setM(window.innerWidth < bp)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [bp])
  return m
}

// การ์ดสรุปด้านบน (ตัวเลข + badge) แบบ Device Management
// alert = true → เน้นสำคัญ (ขอบ+เงาเรืองแสงสี color, มีจุดกะพริบ) · compact = ย่อสำหรับมือถือ
function StatCard({ color, label, value, sub, alert, compact }) {
  const alertStyle = alert ? {
    border: `1px solid ${color}`,
    background: `linear-gradient(160deg, ${color}1f 0%, rgba(16,7,24,0.95) 70%)`,
    boxShadow: `0 0 0 1px ${color}55, 0 8px 30px ${color}40`,
  } : {}
  const cmp = compact ? { padding: 12 } : {}
  return (
    <div style={{ ...S.statCard, ...cmp, borderTop: `${alert ? 3 : 2}px solid ${color}`, ...alertStyle }}>
      <div style={{ position: 'absolute', top: -30, right: -30, width: 110, height: 110, borderRadius: '50%', background: color, opacity: alert ? 0.18 : 0.08 }} />
      <div style={{ ...S.statHd, marginBottom: compact ? 8 : 14, fontSize: compact ? 12 : 14, color: alert ? color : S.statHd.color }}>
        {alert && value > 0 && <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}`, animation: 'momayPulse 1.2s ease-in-out infinite' }} />}
        {alert && '⚠ '}{label}
      </div>
      <div style={{ ...S.statNum, fontSize: compact ? 28 : 38, color }}>{value}</div>
      {sub && <div style={{ ...S.statSub, marginTop: compact ? 8 : 12 }}>{sub}</div>}
    </div>
  )
}

// popup modal ครอบฟอร์มเพิ่ม/แก้ไข
function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])
  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.modalHd}>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{title}</span>
          <button style={S.modalX} onClick={onClose} aria-label="ปิด">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={S.label}>{label}</span>
      <input style={S.input} type={type} value={value ?? ''} placeholder={placeholder}
        onChange={e => onChange(type === 'number' ? Number(e.target.value) : e.target.value)} />
    </label>
  )
}

// ── Room editor form ────────────────────────────────────────────────
function RoomForm({ initial, onSave, onCancel }) {
  const [r, setR] = useState(initial)
  const set = (k, v) => setR(p => ({ ...p, [k]: v }))
  const isNew = !initial._id
  return (
    <div>
      <div style={S.grid2}>
        {isNew && <Field label="roomId (เฉพาะ/ห้ามซ้ำ)" value={r.roomId} onChange={v => set('roomId', v)} placeholder="เช่น ห้อง400" />}
        <Field label="ชื่อแสดง (label)" value={r.label} onChange={v => set('label', v)} placeholder="ห้อง 400" />
        <Field label="ป้ายสั้น (shortLabel)" value={r.shortLabel} onChange={v => set('shortLabel', v)} placeholder="400" />
        <Field label="ลำดับ (order)" type="number" value={r.order} onChange={v => set('order', v)} />
        <label style={{ display: 'block' }}>
          <span style={S.label}>ชนิด (kind)</span>
          <select style={S.input} value={r.kind} onChange={e => set('kind', e.target.value)}>
            <option value="room">room (ห้องปกติ)</option>
            <option value="building">building (รวมทั้งอาคาร)</option>
          </select>
        </label>
        <Field label="รูปผัง (img)" value={r.img} onChange={v => set('img', v)} placeholder="/Floorplan/Floor4plan.png" />
        <Field label="heatmap (svg)" value={r.heatmap} onChange={v => set('heatmap', v)} placeholder="/Floorplan/HeatmapgridFloor4.svg" />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button style={S.btn} onClick={() => onSave(r)}>บันทึก</button>
        <button style={S.btnGhost} onClick={onCancel}>ยกเลิก</button>
      </div>
    </div>
  )
}

// ── Device editor form ──────────────────────────────────────────────
function DeviceForm({ initial, roomId, onSave, onCancel }) {
  const [d, setD] = useState({ category: 'meter', meta: {}, ...initial, room: roomId })
  const [adv, setAdv] = useState(false)        // ตั้งค่าขั้นสูง (ซ่อนช่องที่มี default/auto)
  const set = (k, v) => setD(p => ({ ...p, [k]: v }))
  const setMeta = (k, v) => setD(p => ({ ...p, meta: { ...p.meta, [k]: v } }))
  const isNew = !initial._id
  const cat = d.category

  return (
    <div>
      <div style={S.grid2}>
        <label style={{ display: 'block' }}>
          <span style={S.label}>ประเภท (category)</span>
          <select style={S.input} value={cat} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        {/* กล้อง: deviceId auto จาก camId → ไม่ต้องกรอก (ย้ายไปขั้นสูง) */}
        {isNew && cat !== 'camera' && <Field label="deviceId (เฉพาะ/ห้ามซ้ำ)" value={d.deviceId} onChange={v => set('deviceId', v)} placeholder="เช่น cam_101" />}
        <Field label="ชื่อ (label)" value={d.label} onChange={v => set('label', v)} placeholder="ชื่ออุปกรณ์" />

        {cat === 'meter' && <>
          <Field label="apiBase (URL backend มิเตอร์)" value={d.meta?.apiBase} onChange={v => setMeta('apiBase', v)} placeholder="https://xxx.up.railway.app" />
          <Field label="source (device)" value={d.meta?.source} onChange={v => setMeta('source', v)} placeholder="pm_deer / pm_sand / pm_building" />
        </>}
        {cat === 'switch' && <>
          <Field label="mqttTopic (Tasmota)" value={d.mqttTopic} onChange={v => set('mqttTopic', v)} placeholder="tasmota_xxx" />
          <Field label="channel/รีเลย์ (1,2,… ว่าง=รีเลย์เดียว)" type="number" value={d.channel} onChange={v => set('channel', v)} placeholder="เช่น 1" />
          <Field label="tuyaDeviceId (ถ้าใช้ Tuya)" value={d.tuyaDeviceId} onChange={v => set('tuyaDeviceId', v)} />
        </>}
        {cat === 'ir-remote' && <>
          <Field label="tuyaDeviceId (IR blaster)" value={d.tuyaDeviceId} onChange={v => set('tuyaDeviceId', v)} />
          <Field label="irModel (ยี่ห้อ/รุ่น)" value={d.irModel} onChange={v => set('irModel', v)} />
          <Field label="remoteId" value={d.meta?.remoteId} onChange={v => setMeta('remoteId', v)} />
        </>}
        {cat === 'camera' && <>
          <Field label="camId (id กล้อง — ใช้ทั้ง relay + viewer)" value={d.meta?.camId} onChange={v => setD(p => {
            const meta = { ...p.meta, camId: v }
            // gen wsUrl อัตโนมัติจาก camId (ถ้ายังว่าง หรือเป็นค่า auto เดิม)
            if ((p.meta?.streamKind || 'ws') === 'ws' && (!p.meta?.wsUrl || p.meta.wsUrl.startsWith(CCTV_WS_BASE)))
              meta.wsUrl = v ? `${CCTV_WS_BASE}?cam=${encodeURIComponent(v)}` : ''
            return { ...p, meta }
          })} placeholder="เช่น 101" />
          <Field label="rtspUrl (ให้ relay ดึงภาพ — ไม่ต้อง hardcode)" value={d.meta?.rtspUrl} onChange={v => setMeta('rtspUrl', v)} placeholder="rtsp://user:pass@ip:554/..." />
          <label style={{ display: 'block' }}>
            <span style={S.label}>ตรวจจับคน (นับ + % พื้นที่ → heatmap/เกจ)</span>
            <select style={S.input} value={d.meta?.detect ? '1' : '0'} onChange={e => setMeta('detect', e.target.value === '1')}>
              <option value="0">ปิด</option>
              <option value="1">เปิด</option>
            </select>
          </label>

          {/* ── ตั้งค่าขั้นสูง (มี default/auto อยู่แล้ว ไม่ต้องกรอกก็ได้) ── */}
          <button type="button" style={{ ...S.btnGhost, gridColumn: '1 / -1', textAlign: 'left', marginTop: 4 }} onClick={() => setAdv(a => !a)}>
            {adv ? '▾' : '▸'} ตั้งค่าขั้นสูง (deviceId, สตรีม, FPS) — ไม่กรอกก็ได้ ระบบเติมให้
          </button>
          {adv && <>
            {isNew && <Field label="deviceId (ว่าง = auto: cam_<camId>)" value={d.deviceId} onChange={v => set('deviceId', v)} placeholder={d.meta?.camId ? `cam_${d.meta.camId}` : 'เช่น cam_101'} />}
            <label style={{ display: 'block' }}>
              <span style={S.label}>streamKind (วิธีดูฝั่งหน้าเว็บ)</span>
              <select style={S.input} value={d.meta?.streamKind || 'ws'} onChange={e => setMeta('streamKind', e.target.value)}>
                <option value="ws">ws (cctv)</option>
                <option value="mjpeg">mjpeg (api-gateway)</option>
              </select>
            </label>
            <Field label="wsUrl (auto จาก camId — แก้เองได้)" value={d.meta?.wsUrl} onChange={v => setMeta('wsUrl', v)} placeholder="wss://.../ws/stream?cam=101" />
            <Field label="FPS (relay, ว่าง=15)" type="number" value={d.meta?.fps} onChange={v => setMeta('fps', v)} placeholder="15" />
            <Field label="JPEG quality (relay, ว่าง=40)" type="number" value={d.meta?.jpegQuality} onChange={v => setMeta('jpegQuality', v)} placeholder="40" />
          </>}
        </>}
        {cat === 'sensor' && <>
          <label style={{ display: 'block' }}>
            <span style={S.label}>ชนิดเซนเซอร์</span>
            <select style={S.input} value={d.meta?.kind || 'pm25'} onChange={e => setMeta('kind', e.target.value)}>
              <option value="pm25">ฝุ่น PM2.5 (PMS3003)</option>
            </select>
          </label>
          <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#888', marginTop: 4 }}>
            ตั้ง <b>deviceId</b> ให้ตรงกับที่ ESP ส่งมา (ESP POST → <code>{API}/api/sensor/data</code>) ·
            ค่าฝุ่นล่าสุดอ่านจาก reading ของ deviceId นี้
          </div>
        </>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button style={S.btn} onClick={() => {
          const dd = { ...d, type: d.type || TYPE_BY_CATEGORY[cat] }
          if (cat === 'camera') {
            const meta = { ...dd.meta }
            if (!meta.streamKind) meta.streamKind = 'ws'                  // default ws (กันค่าว่าง)
            // deviceId ว่าง → auto จาก camId (cam_<camId>)
            if (isNew && !dd.deviceId && meta.camId) dd.deviceId = `cam_${meta.camId}`
            // กันลืม: กล้อง ws ที่มี camId แต่ wsUrl ว่าง → เติม auto ให้ตอนบันทึก
            if (meta.streamKind === 'ws' && meta.camId && !meta.wsUrl)
              meta.wsUrl = `${CCTV_WS_BASE}?cam=${encodeURIComponent(meta.camId)}`
            dd.meta = meta
          }
          onSave(dd)
        }}>บันทึก</button>
        <button style={S.btnGhost} onClick={onCancel}>ยกเลิก</button>
      </div>
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────────
export default function Settings() {
  const toast = useToast()
  const isMobile = useIsMobile()
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [offline, setOffline] = useState(false)
  const [addingRoom, setAddingRoom] = useState(false)
  const [editRoom, setEditRoom] = useState(null)        // roomId being edited
  const [deviceForm, setDeviceForm] = useState(null)    // { roomId, device }
  const [alertOpen, setAlertOpen] = useState(null)      // dev._id ที่เปิด popover เหตุผล offline

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const r = await fetch(`${API}/api/config`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'load failed')
      setRooms(j.rooms || [])
      setOffline(false)
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(j.rooms || [])) } catch {}
    } catch (e) {
      // gateway ล่ม → ใช้ข้อมูลล่าสุดที่ cache ไว้ (อ่านได้ แต่แก้ยังไม่บันทึกจนกว่าจะกลับมา)
      let cached = null
      try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') } catch {}
      if (cached) { setRooms(cached); setOffline(true); setErr('') }
      else { setErr(e.message); setOffline(false) }
    }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const api = async (method, path, body) => {
    const r = await fetch(`${API}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.ok === false) throw new Error(j.error || `${method} ${path} failed`)
    return j
  }

  // Room ops
  const saveRoom = async (room) => {
    try {
      if (room._id) await api('PATCH', `/api/rooms/${encodeURIComponent(room.roomId)}`, room)
      else          await api('POST', '/api/rooms', room)
      toast('บันทึกห้องแล้ว'); setAddingRoom(false); setEditRoom(null); load()
    } catch (e) { toast(e.message, true) }
  }
  const deleteRoom = async (room) => {
    if (!confirm(`ลบห้อง "${room.label || room.roomId}"?`)) return
    try {
      const j = await api('DELETE', `/api/rooms/${encodeURIComponent(room.roomId)}`)
      toast(`ลบแล้ว${j.orphanedDevices ? ` (อุปกรณ์กำพร้า ${j.orphanedDevices})` : ''}`); load()
    } catch (e) { toast(e.message, true) }
  }

  // Device ops
  const saveDevice = async (dev) => {
    try {
      if (dev._id) await api('PATCH', `/api/devices/${encodeURIComponent(dev.deviceId)}`, dev)
      else         await api('POST', '/api/devices', dev)
      toast('บันทึกอุปกรณ์แล้ว'); setDeviceForm(null); load()
    } catch (e) { toast(e.message, true) }
  }
  const deleteDevice = async (dev) => {
    if (!confirm(`ลบอุปกรณ์ "${dev.label || dev.deviceId}"?`)) return
    try { await api('DELETE', `/api/devices/${encodeURIComponent(dev.deviceId)}`); toast('ลบอุปกรณ์แล้ว'); load() }
    catch (e) { toast(e.message, true) }
  }

  // ── สรุปจำนวนสำหรับการ์ดด้านบน ───────────────────────────────────
  const allDevices = rooms.flatMap(r => r.devices || [])
  const totalDevices = allDevices.length
  const activeDevices = allDevices.filter(d => d.status === 'active').length
  const offlineDevices = totalDevices - activeDevices
  const camCount = allDevices.filter(d => d.category === 'camera').length
  const pct = (n, d) => d ? Math.round((n / d) * 100) : 0

  // การ์ดอุปกรณ์หนึ่งใบ (ใช้ซ้ำในทุกหมวด)
  const renderDeviceCard = (dev, roomId) => {
    const m = catMeta(dev.category)
    const isActive = dev.status === 'active'
    const isOffline = dev.status === 'offline'
    const stColor = isActive ? '#10b981' : isOffline ? '#ef4444' : '#f59e0b'
    const camUrl = dev.category === 'camera' && camViewerUrl(dev)
    return (
      <div key={dev._id} style={{ ...S.devCard, borderLeft: `3px solid ${m.color}` }}>
        {/* offline → ไอคอน info มุมขวาบน กดดูเหตุผล + คำแนะนำ */}
        {isOffline && dev.statusReason && (
          <>
            <button style={S.alertBtn} title="ทำไมออฟไลน์?"
              onClick={() => setAlertOpen(o => o === dev._id ? null : dev._id)}>ℹ</button>
            {alertOpen === dev._id && (
              <div style={S.alertPop} onClick={e => e.stopPropagation()}>
                <div style={{ color: '#f87171', fontWeight: 700, marginBottom: 4 }}>⚠ {dev.statusReason}</div>
                {dev.statusHint && <div style={{ color: '#cbb' }}>💡 {dev.statusHint}</div>}
              </div>
            )}
          </>
        )}
        <div style={{ minWidth: 0, paddingRight: isOffline ? 22 : 0 }}>
          <div style={{ color: '#eee', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dev.label || dev.deviceId}</div>
          <div style={{ color: '#777', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dev.deviceId}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ ...S.tag, background: `${m.color}1f`, color: m.color }}>{catLabel(dev.category)}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: stColor }}>
            <span style={{ ...S.statusDot, background: stColor }} />
            {dev.status || 'unknown'}
          </span>
        </div>
        {camUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
            <a href={camUrl} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: 600 }}>🔗 เปิดดูกล้อง</a>
            <button style={{ ...S.miniBtn, flex: 'none', padding: '3px 8px' }} onClick={() => { navigator.clipboard?.writeText(camUrl); toast('คัดลอกลิงก์แล้ว') }}>คัดลอกลิงก์</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
          <button style={S.miniBtn} onClick={() => setDeviceForm({ roomId, device: dev })}>แก้ไข</button>
          <button style={S.miniDanger} onClick={() => deleteDevice(dev)}>ลบ</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...S.page, padding: isMobile ? '14px 10px' : S.page.padding }}>
      <style>{`@keyframes momayPulse { 0%,100% { opacity: 1; transform: scale(1) } 50% { opacity: 0.35; transform: scale(0.7) } }`}</style>
      <div style={S.wrap}>
        {/* header — title + actions */}
        <div style={S.headRow}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ ...S.h1, fontSize: isMobile ? 20 : 24 }}>Momay Settings</h1>
            <div style={{ ...S.sub, fontSize: isMobile ? 11 : 13 }}>จัดการห้องและอุปกรณ์ (มิเตอร์ / สวิตช์ / IR remote / กล้อง)</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button style={S.btnGhost} onClick={load}>↻{isMobile ? '' : ' รีเฟรช'}</button>
            <button style={S.btn} onClick={() => { setAddingRoom(true); setEditRoom(null) }}>+ เพิ่มห้อง</button>
          </div>
        </div>

        {/* summary stat cards — มือถือ 2×2 */}
        <div style={{ ...S.statGrid, ...(isMobile ? { gridTemplateColumns: '1fr 1fr', gap: 10 } : {}) }}>
          <StatCard compact={isMobile} color="#FFB800" label="ห้องทั้งหมด" value={rooms.length}
            sub={`${totalDevices} อุปกรณ์ (รวม ${camCount} กล้อง)`} />
          <StatCard compact={isMobile} color="#60a5fa" label="อุปกรณ์ทั้งหมด" value={totalDevices}
            sub={<span><span style={{ ...S.badge, background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>{pct(activeDevices, totalDevices)}%</span>ออนไลน์</span>} />
          <StatCard compact={isMobile} color="#10b981" label="กำลังทำงาน" value={activeDevices}
            sub={<span><span style={{ ...S.badge, background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>{pct(activeDevices, totalDevices)}%</span>ของทั้งหมด</span>} />
          <StatCard compact={isMobile} color="#ef4444" alert label="ออฟไลน์ / รอตรวจ" value={offlineDevices}
            sub={<span><span style={{ ...S.badge, background: 'rgba(239,68,68,0.2)', color: '#f87171', fontWeight: 800 }}>{pct(offlineDevices, totalDevices)}%</span>ของทั้งหมด</span>} />
        </div>

        {addingRoom && (
          <Modal title="เพิ่มห้องใหม่" onClose={() => setAddingRoom(false)}>
            <RoomForm initial={{ roomId: '', label: '', shortLabel: '', order: rooms.length, kind: 'room', img: '', heatmap: '' }}
              onSave={saveRoom} onCancel={() => setAddingRoom(false)} />
          </Modal>
        )}

        {loading && <div style={{ color: '#888' }}>กำลังโหลด…</div>}
        {err && <div style={{ color: '#ef4444', marginBottom: 12 }}>โหลดไม่ได้: {err}</div>}
        {offline && <div style={{ color: '#f59e0b', marginBottom: 12, fontSize: 13 }}>
          ⚠ ออฟไลน์ — gateway ติดต่อไม่ได้ แสดงข้อมูลล่าสุดที่บันทึกไว้ (การแก้ไขจะยังไม่ถูกบันทึกจนกว่าจะเชื่อมต่อได้ กด “รีเฟรช” เพื่อลองใหม่)
        </div>}

        {rooms.map(room => (
          <div key={room.roomId} style={S.card}>
            <div style={S.roomHd}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{room.label || room.roomId}</span>
              <span style={S.tag}>{room.shortLabel}</span>
              {room.kind === 'building' && <span style={{ ...S.tag, background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>รวมอาคาร</span>}
              <span style={{ ...S.tag, background: 'rgba(255,255,255,0.06)', color: '#aaa' }}>{(room.devices || []).length} อุปกรณ์</span>
              <span style={{ color: '#666', fontSize: 11 }}>order {room.order}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button style={S.btnGhost} onClick={() => setEditRoom(room.roomId)}>แก้ไข</button>
                <button style={S.btnDanger} onClick={() => deleteRoom(room)}>ลบห้อง</button>
              </div>
            </div>

            {/* devices — แยกเป็นหมวดย่อย แต่ละหมวดเป็นแถวกริดของตัวเอง */}
            <div>
              {groupByCategory(room.devices).map(({ cat, items }) => {
                const m = catMeta(cat)
                return (
                  <div key={cat}>
                    <div style={{ ...S.devGroupHd, color: m.color }}>
                      <span style={{ ...S.statusDot, width: 8, height: 8, background: m.color }} />
                      {catLabel(cat)}
                      <span style={{ color: '#666', fontWeight: 600 }}>({items.length})</span>
                    </div>
                    <div style={S.devGrid}>
                      {items.map(dev => renderDeviceCard(dev, room.roomId))}
                    </div>
                  </div>
                )
              })}

              {/* ปุ่ม “เพิ่มอุปกรณ์” — มุมขวาล่าง */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <button style={{ cursor: 'pointer', color: '#FFB800', border: '1px dashed rgba(255,184,0,0.45)', background: 'rgba(255,184,0,0.06)', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700 }}
                  onClick={() => setDeviceForm({ roomId: room.roomId, device: {} })}>
                  + เพิ่มอุปกรณ์
                </button>
              </div>
            </div>
          </div>
        ))}

        {!loading && !rooms.length && !err && <div style={{ color: '#888' }}>ยังไม่มีห้อง — กด “เพิ่มห้อง”</div>}
      </div>

      {/* popup: แก้ไขห้อง */}
      {editRoom && (() => {
        const room = rooms.find(r => r.roomId === editRoom)
        if (!room) return null
        return (
          <Modal title={`แก้ไขห้อง — ${room.label || room.roomId}`} onClose={() => setEditRoom(null)}>
            <RoomForm initial={room} onSave={saveRoom} onCancel={() => setEditRoom(null)} />
          </Modal>
        )
      })()}

      {/* popup: เพิ่ม/แก้ไขอุปกรณ์ */}
      {deviceForm && (
        <Modal title={deviceForm.device?._id ? `แก้ไขอุปกรณ์ — ${deviceForm.device.label || deviceForm.device.deviceId}` : 'เพิ่มอุปกรณ์ใหม่'}
          onClose={() => setDeviceForm(null)}>
          <DeviceForm initial={deviceForm.device || {}} roomId={deviceForm.roomId} onSave={saveDevice} onCancel={() => setDeviceForm(null)} />
        </Modal>
      )}
    </div>
  )
}
