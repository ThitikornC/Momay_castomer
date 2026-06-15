import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

const DEVICES_API = (import.meta.env.VITE_DEVICES_API || 'http://localhost:8002').replace(/\/$/, '')

/**
 * หน้าเช็คอิน — เปิดจากการสแกน QR ของการจอง
 *   /checkin?id=<bookingId>  → POST /api/bookings/:id/checkin → firstCheckIn → auto เปิดไฟ
 */
export default function CheckIn() {
  const [sp] = useSearchParams()
  const id = sp.get('id') || ''
  const [state, setState] = useState('loading')   // loading|ok|error
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!id) { setState('error'); setErr('ไม่พบรหัสการจอง'); return }
    fetch(`${DEVICES_API}/api/bookings/${encodeURIComponent(id)}/checkin`, { method: 'POST' })
      .then(r => r.json())
      .then(j => {
        if (!j.success) throw new Error(j.error || 'เช็คอินไม่สำเร็จ')
        setData(j.data); setState('ok')
      })
      .catch(e => { setErr(e.message); setState('error') })
  }, [id])

  const card = { background: 'rgba(20,8,28,0.95)', border: '1.5px solid rgba(255,184,0,0.3)', borderRadius: 16, padding: 28, maxWidth: 380, width: '100%', textAlign: 'center', fontFamily: 'Sarabun, sans-serif' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a020f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={card}>
        {state === 'loading' && <div style={{ color: '#FFB800', fontSize: 16 }}>กำลังเช็คอิน…</div>}

        {state === 'ok' && <>
          <div style={{ fontSize: 48 }}>✅</div>
          <div style={{ color: '#22c55e', fontWeight: 800, fontSize: 20, margin: '8px 0' }}>เช็คอินสำเร็จ</div>
          <div style={{ color: '#e6e6e6', fontSize: 15, fontWeight: 700 }}>{data?.room}</div>
          <div style={{ color: '#aaa', fontSize: 13, marginTop: 4 }}>
            {data?.bookerName} · {data?.startTime}–{data?.endTime}
          </div>
          <div style={{ color: '#FFB800', fontSize: 12, marginTop: 14 }}>💡 ไฟจะเปิดอัตโนมัติในช่วงเวลาจอง</div>
        </>}

        {state === 'error' && <>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <div style={{ color: '#ef4444', fontWeight: 800, fontSize: 18, margin: '8px 0' }}>เช็คอินไม่สำเร็จ</div>
          <div style={{ color: '#aaa', fontSize: 13 }}>{err}</div>
        </>}
      </div>
    </div>
  )
}
