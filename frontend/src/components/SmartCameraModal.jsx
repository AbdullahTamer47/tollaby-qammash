import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSessions, scanAttendance, addPayment, editSessionAttendance } from '../api'

// Audio Chime Synthesizer via Web Audio API (Zero latency, works offline)
function playBeep(type = 'success') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    if (type === 'success') {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime) // A5
      osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.08) // D6
      gain.gain.setValueAtTime(0.18, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.25)
    } else {
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(220, ctx.currentTime)
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.35)
    }
  } catch (e) {}
}

export default function SmartCameraModal({ mode = 'live_attendance', initialSessionId = null, onClose }) {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId ? String(initialSessionId) : '')
  const [selectedSession, setSelectedSession] = useState(null)
  const [loadingSessions, setLoadingSessions] = useState(mode === 'live_attendance')

  // Scanner state
  const [lastScannedResult, setLastScannedResult] = useState(null) // holds { studentId, studentName, groupName, autoPaid, time }
  const [manualInput, setManualInput] = useState('')
  const [scanError, setScanError] = useState(null)
  const [partialAmount, setPartialAmount] = useState('')
  const [showPartialInput, setShowPartialInput] = useState(false)

  const scannerRef = useRef(null)
  const lastScannedCodeRef = useRef('')
  const lastScannedTimeRef = useRef(0)
  const timerRef = useRef(null)

  // 1. If in live_attendance mode: fetch sessions and pick active one
  useEffect(() => {
    if (mode !== 'live_attendance') return

    getSessions({ all: 'true', per_page: 50 }).then(r => {
      const list = r.data.sessions || r.data || []
      setSessions(list)

      if (initialSessionId) {
        const found = list.find(s => String(s.id) === String(initialSessionId))
        if (found) {
          setSelectedSessionId(String(found.id))
          setSelectedSession(found)
          return
        }
      }

      // Find session happening today
      const todayStr = new Date().toDateString()
      const todaySessions = list.filter(s => new Date(s.date).toDateString() === todayStr)

      if (todaySessions.length > 0) {
        // Pick the closest to current hour
        const now = Date.now()
        const sorted = [...todaySessions].sort((a, b) => Math.abs(new Date(a.date).getTime() - now) - Math.abs(new Date(b.date).getTime() - now))
        setSelectedSessionId(String(sorted[0].id))
        setSelectedSession(sorted[0])
      } else if (list.length > 0) {
        // Fallback to first session
        setSelectedSessionId(String(list[0].id))
        setSelectedSession(list[0])
      }
    }).finally(() => setLoadingSessions(false))
  }, [mode, initialSessionId])

  // Update selectedSession when selectedSessionId changes
  useEffect(() => {
    if (selectedSessionId && sessions.length > 0) {
      const found = sessions.find(s => String(s.id) === String(selectedSessionId))
      setSelectedSession(found || null)
    }
  }, [selectedSessionId, sessions])

  // 2. Initialize Camera Scanner
  useEffect(() => {
    let html5QrScanner = null

    const initScanner = async () => {
      try {
        const { Html5QrcodeScanner } = await import('html5-qrcode')
        html5QrScanner = new Html5QrcodeScanner(
          'smart-camera-viewport',
          { fps: 10, qrbox: { width: 240, height: 240 } },
          false
        )
        scannerRef.current = html5QrScanner

        html5QrScanner.render((decodedText) => {
          const now = Date.now()
          const clean = decodedText.trim()
          // Prevent multiple scans of the same code within 3 seconds
          if (clean === lastScannedCodeRef.current && now - lastScannedTimeRef.current < 3000) {
            return
          }
          lastScannedCodeRef.current = clean
          lastScannedTimeRef.current = now

          handleCodeScanned(clean)
        }, () => {})
      } catch (err) {
        console.error('Camera init error:', err)
      }
    }

    // Delay slightly to ensure DOM element exists
    const t = setTimeout(initScanner, 200)

    return () => {
      clearTimeout(t)
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {})
      }
    }
  }, [selectedSessionId, mode])

  // Process code (Attendance or Search)
  const handleCodeScanned = async (code) => {
    const cleanId = code.replace(/\D/g, '')
    if (!cleanId) {
      playBeep('error')
      setScanError('كود غير صالح')
      return
    }

    if (mode === 'search_lookup') {
      playBeep('success')
      onClose()
      navigate(`/students/${cleanId}/dashboard`)
      return
    }

    // Mode: live_attendance
    if (!selectedSessionId) {
      playBeep('error')
      setScanError('يرجى اختيار الحصة أولاً')
      return
    }

    setScanError(null)
    setShowPartialInput(false)
    try {
      // By default: student is marked present and paid!
      const res = await scanAttendance(selectedSessionId, { student_id: cleanId, autoPay: true })
      playBeep('success')

      const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
      const paid = res.data.auto_paid || 0

      setLastScannedResult({
        studentId: cleanId,
        studentName: res.data.student_name,
        groupName: res.data.group_name,
        autoPaid: paid,
        time: timeStr,
        price: selectedSession?.price || 0,
        postponed: false,
        customPaid: null
      })

      // Reset auto dismiss timer
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        // Keep result until next scan or 10 seconds
      }, 10000)
    } catch (err) {
      playBeep('error')
      setScanError(err.response?.data?.message || err.response?.data?.error || 'الطالب غير مسجل في هذه المجموعة أو الحصة')
    }
  }

  // Quick Action: Postpone Payment (لم يدفع / تأجيل الدفع)
  const handlePostponePayment = async () => {
    if (!lastScannedResult || !selectedSessionId) return
    try {
      // Set attendance record payment to 0
      await editSessionAttendance(selectedSessionId, {
        student_id: lastScannedResult.studentId,
        is_attendant: true,
        amount_paid: 0
      })
      setLastScannedResult(prev => ({ ...prev, postponed: true, customPaid: 0 }))
      playBeep('success')
    } catch (err) {
      alert('فشل تعديل حالة الدفع')
    }
  }

  // Quick Action: Partial Payment (دفع جزء من الحصة)
  const handleSavePartialPayment = async (e) => {
    e.preventDefault()
    const amt = parseFloat(partialAmount)
    if (isNaN(amt) || amt < 0 || !lastScannedResult) return

    try {
      await editSessionAttendance(selectedSessionId, {
        student_id: lastScannedResult.studentId,
        is_attendant: true,
        amount_paid: amt
      })
      setLastScannedResult(prev => ({ ...prev, customPaid: amt, postponed: false }))
      setShowPartialInput(false)
      setPartialAmount('')
      playBeep('success')
    } catch {
      alert('فشل تسجيل المبلغ الجزئي')
    }
  }

  const handleManualSubmit = (e) => {
    e.preventDefault()
    if (manualInput.trim()) {
      handleCodeScanned(manualInput.trim())
      setManualInput('')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: '480px', width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header" style={{ borderBottom: `2px solid ${mode === 'live_attendance' ? '#10b981' : '#3b82f6'}` }}>
          <div>
            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: mode === 'live_attendance' ? '#059669' : '#2563eb' }}>
              <i className={`pi ${mode === 'live_attendance' ? 'pi-camera' : 'pi-search'}`} style={{ fontSize: '1.3rem' }} />
              {mode === 'live_attendance' ? 'تسجيل حضور الحصة الجارية والدفع السريع' : 'مسح كود QR للبحث عن الطالب'}
            </h3>
            <p className="text-muted text-sm" style={{ margin: '0.2rem 0 0' }}>
              {mode === 'live_attendance'
                ? 'يتم تسجيل الطالب كحاضر ومدفوع تلقائياً مع خيار التعديل السريع'
                : 'وجه الكاميرا لبطاقة الطالب ليتم فتح ملفه مباشرة'}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}><i className="pi pi-times" /></button>
        </div>

        {/* Live Attendance: Session Picker */}
        {mode === 'live_attendance' && (
          <div style={{ padding: '0.75rem 1rem', background: 'var(--surface-ground)', borderBottom: '1px solid var(--surface-border)' }}>
            <label className="form-label" style={{ fontSize: '0.82rem', marginBottom: '0.25rem' }}>
              اختر الحصة الجارية المراد تسجيل حضورها:
            </label>
            <select
              className="form-control"
              value={selectedSessionId}
              onChange={e => setSelectedSessionId(e.target.value)}
              style={{ fontWeight: 600 }}
            >
              {sessions.map(s => {
                const sDate = new Date(s.date).toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'numeric' })
                return (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.group?.name || s.grade}) · {sDate} · {s.price} ج
                  </option>
                )
              })}
            </select>
          </div>
        )}

        {/* Content Body */}
        <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
          {/* Camera Viewport Container */}
          <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '2px solid var(--surface-border)', background: '#000000' }}>
            <div id="smart-camera-viewport" style={{ width: '100%', minHeight: '260px' }} />
          </div>

          {/* Error Message Alert */}
          {scanError && (
            <div className="alert alert-error" style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}>
              <i className="pi pi-exclamation-circle" style={{ marginLeft: '0.4rem' }} />
              {scanError}
            </div>
          )}

          {/* Flash Confirmation Card of Scanned Student (Attendance Mode) */}
          {mode === 'live_attendance' && lastScannedResult && (
            <div style={{
              marginTop: '1rem',
              background: lastScannedResult.postponed ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              border: `2px solid ${lastScannedResult.postponed ? '#f59e0b' : '#10b981'}`,
              borderRadius: '12px',
              padding: '1rem',
              boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-color)' }}>
                    {lastScannedResult.studentName}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-color-secondary)' }}>
                    {lastScannedResult.groupName} · كود: #{lastScannedResult.studentId} · 🕒 {lastScannedResult.time}
                  </div>
                </div>
                <span className={`badge ${lastScannedResult.postponed ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '0.82rem', padding: '0.25rem 0.6rem' }}>
                  {lastScannedResult.postponed ? 'حاضر (مؤجل الدفع)' : 'حاضر ومدفوع ✅'}
                </span>
              </div>

              {/* Payment Summary in Card */}
              <div style={{ fontSize: '0.88rem', margin: '0.5rem 0', fontWeight: 600 }}>
                {lastScannedResult.postponed ? (
                  <span style={{ color: '#d97706' }}>⚠️ لم يسدد ثمن الحصة (تم تسجيل مديونية: {lastScannedResult.price} ج)</span>
                ) : lastScannedResult.customPaid !== null ? (
                  <span style={{ color: '#10b981' }}>💵 تم دفع جزء: {lastScannedResult.customPaid} ج (متبقي: {Math.max(0, lastScannedResult.price - lastScannedResult.customPaid)} ج)</span>
                ) : (
                  <span style={{ color: '#10b981' }}>💵 تم تسديد ثمن الحصة كاملاً: {lastScannedResult.price} جنيه تلقائياً</span>
                )}
              </div>

              {/* Quick Override Buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap', borderTop: '1px dashed var(--surface-border)', paddingTop: '0.5rem' }}>
                {!lastScannedResult.postponed && (
                  <button
                    type="button"
                    className="btn btn-sm btn-warning"
                    style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem' }}
                    onClick={handlePostponePayment}
                  >
                    <i className="pi pi-clock" /> تأجيل الدفع / لم يدفع
                  </button>
                )}
                
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem' }}
                  onClick={() => setShowPartialInput(!showPartialInput)}
                >
                  <i className="pi pi-pencil" /> دفع جزء / تعديل المبلغ
                </button>
              </div>

              {/* Partial Amount Input Form */}
              {showPartialInput && (
                <form onSubmit={handleSavePartialPayment} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="المبلغ المدفوع ج.م"
                    className="form-control"
                    style={{ fontSize: '0.85rem', padding: '0.25rem 0.5rem' }}
                    value={partialAmount}
                    onChange={e => setPartialAmount(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" className="btn btn-sm btn-primary">حفظ</button>
                </form>
              )}
            </div>
          )}

          {/* Manual Student Code Input (Fallback for manual registration before/during/after session) */}
          <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--surface-border)' }}>
            <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                className="form-control"
                placeholder={mode === 'live_attendance' ? 'أو اكتب كود الطالب للحضور يدوياً...' : 'اكتب كود أو رقم الطالب للبحث...'}
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                style={{ fontSize: '0.88rem' }}
              />
              <button type="submit" className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap' }}>
                <i className="pi pi-check" /> {mode === 'live_attendance' ? 'تسجيل' : 'بحث'}
              </button>
            </form>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-color-secondary)' }}>
            يدعم الكاميرا والماسح الضوئي اللاسلكي
          </span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>إغلاق الكاميرا</button>
        </div>
      </div>
    </div>
  )
}
