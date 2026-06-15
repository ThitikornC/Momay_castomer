import { useState, useEffect, useCallback } from 'react'
import { useToast } from '../components/Toast.jsx'

const API = (import.meta.env.VITE_DEVICES_API || 'http://localhost:8002').replace(/\/$/, '')
const CACHE_KEY = 'momay_config_cache'
const CAM_BASE = (import.meta.env.VITE_GATEWAY_URL || '').replace(/\/$/, '')   // person-counter gateway (mjpeg)

// สร้าง URL หน้า viewer กล้อง (เปิดเป็นลิงก์เดี่ยว/ฝังได้)
function camViewerUrl(dev) {
  const origin = window.location.origin
  const label = encodeURIComponent(dev.label || dev.deviceId)
  const m = dev.meta || {}
  if (m.streamKind === 'mjpeg' && m.camId) {
    return `${origin}/cam?kind=mjpeg&base=${encodeURIComponent(CAM_BASE)}&cam=${encodeURIComponent(m.camId)}&label=${label}`
  }
  if (m.streamKind === 'ws' && m.wsUrl) {
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

// ── styles ──────────────────────────────────────────────────────────
const S = {
  page:   { minHeight: '100vh', background: '#0a020f', color: '#e6e6e6', fontFamily: 'Sarabun, sans-serif', padding: '24px 16px' },
  wrap:   { maxWidth: 880, margin: '0 auto' },
  h1:     { color: '#FFB800', fontSize: 22, fontWeight: 800, margin: '0 0 4px', letterSpacing: 1 },
  sub:    { color: '#888', fontSize: 12, marginBottom: 20 },
  card:   { background: 'rgba(20,8,28,0.8)', border: '1px solid rgba(255,184,0,0.25)', borderRadius: 12, padding: 16, marginBottom: 14 },
  roomHd: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  tag:    { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,184,0,0.15)', color: '#FFB800' },
  btn:    { cursor: 'pointer', border: '1px solid rgba(255,184,0,0.4)', background: 'rgba(255,184,0,0.12)', color: '#FFB800', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700 },
  btnGhost:{ cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#aaa', borderRadius: 8, padding: '6px 10px', fontSize: 12 },
  btnDanger:{ cursor: 'pointer', border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.12)', color: '#ef4444', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700 },
  input:  { width: '100%', boxSizing: 'border-box', background: '#160a20', border: '1px solid rgba(255,184,0,0.25)', borderRadius: 8, color: '#eee', padding: '8px 10px', fontSize: 13, marginTop: 4 },
  label:  { fontSize: 11, color: '#FFB800', fontWeight: 700 },
  grid2:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  devRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' },
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
    <div style={{ ...S.card, background: 'rgba(255,184,0,0.05)' }}>
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
  const set = (k, v) => setD(p => ({ ...p, [k]: v }))
  const setMeta = (k, v) => setD(p => ({ ...p, meta: { ...p.meta, [k]: v } }))
  const isNew = !initial._id
  const cat = d.category

  return (
    <div style={{ ...S.card, background: 'rgba(255,184,0,0.05)' }}>
      <div style={S.grid2}>
        <label style={{ display: 'block' }}>
          <span style={S.label}>ประเภท (category)</span>
          <select style={S.input} value={cat} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        {isNew && <Field label="deviceId (เฉพาะ/ห้ามซ้ำ)" value={d.deviceId} onChange={v => set('deviceId', v)} placeholder="เช่น cam_101" />}
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
          <Field label="camId (id กล้อง — ใช้ทั้ง relay + viewer)" value={d.meta?.camId} onChange={v => setMeta('camId', v)} placeholder="เช่น 101" />
          <Field label="rtspUrl (ให้ relay ดึงภาพ — ไม่ต้อง hardcode)" value={d.meta?.rtspUrl} onChange={v => setMeta('rtspUrl', v)} placeholder="rtsp://user:pass@ip:554/..." />
          <label style={{ display: 'block' }}>
            <span style={S.label}>streamKind (วิธีดูฝั่งหน้าเว็บ)</span>
            <select style={S.input} value={d.meta?.streamKind || 'ws'} onChange={e => setMeta('streamKind', e.target.value)}>
              <option value="ws">ws (cctv)</option>
              <option value="mjpeg">mjpeg (api-gateway)</option>
            </select>
          </label>
          <Field label="wsUrl (viewer ฝั่งเว็บ)" value={d.meta?.wsUrl} onChange={v => setMeta('wsUrl', v)} placeholder="wss://.../ws/stream?cam=101" />
          <Field label="FPS (relay, ว่าง=15)" type="number" value={d.meta?.fps} onChange={v => setMeta('fps', v)} placeholder="15" />
          <Field label="JPEG quality (relay, ว่าง=40)" type="number" value={d.meta?.jpegQuality} onChange={v => setMeta('jpegQuality', v)} placeholder="40" />
        </>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button style={S.btn} onClick={() => onSave({ ...d, type: d.type || TYPE_BY_CATEGORY[cat] })}>บันทึก</button>
        <button style={S.btnGhost} onClick={onCancel}>ยกเลิก</button>
      </div>
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────────
export default function Settings() {
  const toast = useToast()
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [offline, setOffline] = useState(false)
  const [addingRoom, setAddingRoom] = useState(false)
  const [editRoom, setEditRoom] = useState(null)        // roomId being edited
  const [deviceForm, setDeviceForm] = useState(null)    // { roomId, device }

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

  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <h1 style={S.h1}>⚙ ตั้งค่ากลาง — ห้อง & อุปกรณ์</h1>
        <div style={S.sub}>จัดการห้องและอุปกรณ์ (มิเตอร์ / สวิตช์ / IR remote / กล้อง) · API: {API}</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button style={S.btn} onClick={() => { setAddingRoom(true); setEditRoom(null) }}>+ เพิ่มห้อง</button>
          <button style={S.btnGhost} onClick={load}>↻ รีเฟรช</button>
        </div>

        {addingRoom && (
          <RoomForm initial={{ roomId: '', label: '', shortLabel: '', order: rooms.length, kind: 'room', img: '', heatmap: '' }}
            onSave={saveRoom} onCancel={() => setAddingRoom(false)} />
        )}

        {loading && <div style={{ color: '#888' }}>กำลังโหลด…</div>}
        {err && <div style={{ color: '#ef4444', marginBottom: 12 }}>โหลดไม่ได้: {err}</div>}
        {offline && <div style={{ color: '#f59e0b', marginBottom: 12, fontSize: 13 }}>
          ⚠ ออฟไลน์ — gateway ติดต่อไม่ได้ แสดงข้อมูลล่าสุดที่บันทึกไว้ (การแก้ไขจะยังไม่ถูกบันทึกจนกว่าจะเชื่อมต่อได้ กด “รีเฟรช” เพื่อลองใหม่)
        </div>}

        {rooms.map(room => (
          <div key={room.roomId} style={S.card}>
            {editRoom === room.roomId ? (
              <RoomForm initial={room} onSave={saveRoom} onCancel={() => setEditRoom(null)} />
            ) : (
              <div style={S.roomHd}>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{room.label || room.roomId}</span>
                <span style={S.tag}>{room.shortLabel}</span>
                {room.kind === 'building' && <span style={{ ...S.tag, background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>รวมอาคาร</span>}
                <span style={{ color: '#666', fontSize: 11 }}>order {room.order}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button style={S.btnGhost} onClick={() => { setEditRoom(room.roomId); setAddingRoom(false) }}>แก้ไข</button>
                  <button style={S.btnDanger} onClick={() => deleteRoom(room)}>ลบห้อง</button>
                </div>
              </div>
            )}

            {/* devices */}
            <div style={{ marginTop: 12 }}>
              {(room.devices || []).map(dev => (
                deviceForm && deviceForm.device?._id === dev._id ? (
                  <DeviceForm key={dev._id} initial={dev} roomId={room.roomId} onSave={saveDevice} onCancel={() => setDeviceForm(null)} />
                ) : (
                  <div key={dev._id}>
                    <div style={S.devRow}>
                      <span style={S.tag}>{catLabel(dev.category)}</span>
                      <span style={{ color: '#ddd', fontSize: 13 }}>{dev.label || dev.deviceId}</span>
                      <span style={{ color: '#666', fontSize: 11 }}>{dev.deviceId}</span>
                      <span style={{ color: dev.status === 'active' ? '#10b981' : '#f59e0b', fontSize: 11 }}>{dev.status}</span>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button style={S.btnGhost} onClick={() => setDeviceForm({ roomId: room.roomId, device: dev })}>แก้</button>
                        <button style={S.btnDanger} onClick={() => deleteDevice(dev)}>ลบ</button>
                      </div>
                    </div>
                    {dev.category === 'camera' && camViewerUrl(dev) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 8px 4px', fontSize: 11, flexWrap: 'wrap' }}>
                        <span style={{ color: '#888' }}>🔗 ลิงก์ดูกล้อง:</span>
                        <a href={camViewerUrl(dev)} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', wordBreak: 'break-all' }}>{camViewerUrl(dev)}</a>
                        <button style={S.btnGhost} onClick={() => { navigator.clipboard?.writeText(camViewerUrl(dev)); toast('คัดลอกลิงก์แล้ว') }}>คัดลอก</button>
                        <a href={camViewerUrl(dev)} target="_blank" rel="noreferrer" style={{ ...S.btn, textDecoration: 'none' }}>เปิดดู</a>
                      </div>
                    )}
                  </div>
                )
              ))}

              {deviceForm && deviceForm.roomId === room.roomId && !deviceForm.device?._id && (
                <DeviceForm initial={{}} roomId={room.roomId} onSave={saveDevice} onCancel={() => setDeviceForm(null)} />
              )}

              <button style={{ ...S.btnGhost, marginTop: 8 }} onClick={() => setDeviceForm({ roomId: room.roomId, device: {} })}>+ เพิ่มอุปกรณ์</button>
            </div>
          </div>
        ))}

        {!loading && !rooms.length && !err && <div style={{ color: '#888' }}>ยังไม่มีห้อง — กด “เพิ่มห้อง”</div>}
      </div>
    </div>
  )
}
