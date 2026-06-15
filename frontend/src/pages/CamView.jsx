import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Standalone camera viewer — เปิดเป็นลิงก์เดี่ยวได้
 *   /cam?kind=ws&url=<wss://.../ws/stream?cam=101>&label=...
 *   /cam?kind=mjpeg&base=<gatewayURL>&cam=<camId>&label=...
 */
export default function CamView() {
  const [sp] = useSearchParams()
  const kind  = sp.get('kind') || 'ws'
  const url   = sp.get('url') || ''
  const base  = (sp.get('base') || '').replace(/\/+$/, '')
  const cam   = sp.get('cam') || ''
  const label = sp.get('label') || cam || 'CCTV'

  const imgRef = useRef(null)
  const wsRef  = useRef(null)
  const [status, setStatus] = useState('connecting')  // connecting|live|offline

  const mjpegUrl = (kind === 'mjpeg' && base && cam) ? `${base}/stream/${encodeURIComponent(cam)}` : ''

  // MJPEG: ใส่ src ให้ <img> ตรงๆ
  useEffect(() => {
    if (kind !== 'mjpeg' || !mjpegUrl || !imgRef.current) return
    const el = imgRef.current
    el.onload = () => setStatus('live')
    el.onerror = () => setStatus('offline')
    el.src = mjpegUrl
    return () => { el.onload = null; el.onerror = null; el.src = '' }
  }, [kind, mjpegUrl])

  // WebSocket: รับ JPEG frames → blob → <img>
  useEffect(() => {
    if (kind !== 'ws' || !url) return
    let stale
    setStatus('connecting')
    let ws
    try { ws = new WebSocket(url) } catch { setStatus('offline'); return }
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws
    let last = 0
    ws.onmessage = ev => {
      if (typeof ev.data === 'string') { if (ev.data === 'relay_offline') setStatus('offline'); return }
      last = Date.now()
      const u = URL.createObjectURL(new Blob([ev.data], { type: 'image/jpeg' }))
      if (imgRef.current) { const old = imgRef.current.src; imgRef.current.src = u; if (old?.startsWith('blob:')) URL.revokeObjectURL(old) }
      setStatus('live')
    }
    ws.onclose = () => setStatus('offline')
    ws.onerror = () => setStatus('offline')
    stale = setInterval(() => { if (last && Date.now() - last > 4000) setStatus('offline') }, 1500)
    return () => { clearInterval(stale); try { ws.close() } catch {} ; wsRef.current = null }
  }, [kind, url])

  const dot = status === 'live' ? '#22c55e' : status === 'connecting' ? '#f59e0b' : '#ef4444'
  const stTxt = status === 'live' ? 'LIVE' : status === 'connecting' ? 'กำลังเชื่อมต่อ…' : 'ออฟไลน์'

  const noSrc = (kind === 'ws' && !url) || (kind === 'mjpeg' && !mjpegUrl)

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', color: '#FFB800', fontFamily: 'Sarabun, sans-serif', background: 'linear-gradient(#0a020f,transparent)' }}>
        <span style={{ fontWeight: 800, fontSize: 16 }}>📷 {label}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#ccc', fontSize: 12 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, boxShadow: `0 0 6px ${dot}` }} />
          {stTxt}
        </span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {noSrc
          ? <div style={{ color: '#888', fontFamily: 'monospace' }}>พารามิเตอร์ไม่ครบ (ต้องมี url หรือ base+cam)</div>
          : <img ref={imgRef} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} draggable={false} />}
      </div>
    </div>
  )
}
