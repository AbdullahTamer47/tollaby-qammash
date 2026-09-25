import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { getSessionAttendance, editSessionAttendance, scanAttendance } from '../api'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { exportToCSV } from '../utils/csvExport'
import Pagination from '../components/Pagination'

// Audio Chime Synthesizer via Web Audio API (Zero latency, works offline)
function playSuccessBeep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime) // A5
    osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.08) // D6
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.25)
  } catch (e) {}
}

function playErrorBeep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(220, ctx.currentTime)
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.35)
  } catch (e) {}
}

export default function AttendancePage() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [scanId, setScanId] = useState('')
  const [scanMsg, setScanMsg] = useState(null)
  const [msg, setMsg] = useState(null)
  const [filterState, setFilterState] = useState('all') // 'all', 'present', 'absent', 'pending'
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [autoPay, setAutoPay] = useState(false)
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const autoPayRef = useRef(false)

  // Sync ref with state to prevent stale closures in camera callback
  useEffect(() => {
    autoPayRef.current = autoPay
  }, [autoPay])

  const scannerRef = useRef(null)
  const lastScannedRef = useRef('')
  const lastScanTimeRef = useRef(0)

  // Offline queue helpers
  const getOfflineQueue = () => {
    try {
      return JSON.parse(localStorage.getItem(`attendance_queue_${id}`) || '[]')
    } catch {
      return []
    }
  }

  const saveOfflineQueue = (queue) => {
    localStorage.setItem(`attendance_queue_${id}`, JSON.stringify(queue))
    setPendingSyncCount(queue.length)
  }

  const syncOfflineQueue = async () => {
    const queue = getOfflineQueue()
    if (!queue.length) return

    const remaining = []
    let anySuccess = false
    for (const item of queue) {
      try {
        await scanAttendance(id, { student_id: item.studentId, autoPay: item.autoPay })
        anySuccess = true
      } catch (err) {
        remaining.push(item)
      }
    }
    saveOfflineQueue(remaining)
    if (anySuccess) {
      load(false)
    }
  }

  // Auto-sync interval & online listener
  useEffect(() => {
    setPendingSyncCount(getOfflineQueue().length)
    const interval = setInterval(syncOfflineQueue, 5000)
    window.addEventListener('online', syncOfflineQueue)
    return () => {
      clearInterval(interval)
      window.removeEventListener('online', syncOfflineQueue)
    }
  }, [id])

  const load = (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    getSessionAttendance(id).then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => load(true), [id])

  // Camera QR Scanner
  useEffect(() => {
    if (cameraEnabled) {
      const scanner = new Html5QrcodeScanner('qr-reader', { fps: 10, qrbox: { width: 250, height: 250 } }, false)
      scannerRef.current = scanner
      scanner.render((decodedText) => {
        const now = Date.now()
        if (decodedText !== lastScannedRef.current || now - lastScanTimeRef.current > 2500) {
          lastScannedRef.current = decodedText
          lastScanTimeRef.current = now
          handleQRScan(decodedText)
        }
      }, () => {})

      return () => {
        scanner.clear().catch(() => {})
      }
    }
  }, [cameraEnabled])

  // Global Hardware Barcode / QR Scanner Listener (USB / Wireless 2D Gun)
  useEffect(() => {
    let buffer = ''
    let lastKeyTime = Date.now()

    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in form inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return
      }

      const currentTime = Date.now()
      if (currentTime - lastKeyTime > 150) {
        buffer = ''
      }
      lastKeyTime = currentTime

      if (e.key === 'Enter') {
        const trimmed = buffer.trim()
        if (trimmed) {
          e.preventDefault()
          handleQRScan(trimmed)
          buffer = ''
        }
      } else if (e.key && e.key.length === 1) {
        buffer += e.key
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [id])

  const handleQRScan = async (studentIdStr) => {
    const cleanId = String(studentIdStr).trim()
    if (!cleanId) return

    try {
      const r = await scanAttendance(id, { student_id: cleanId, autoPay: autoPayRef.current })
      playSuccessBeep()
      if (autoPayRef.current) {
        const paid = r.data.auto_paid || 0
        setScanMsg({
          type: 'success',
          text: paid > 0
            ? `✅ ${r.data.student_name} — ${r.data.group_name} (تم دفع ${paid} ج.م)`
            : `✅ ${r.data.student_name} — ${r.data.group_name} (لا يوجد مستحق)`
        })
        setAutoPay(false)
      } else {
        setScanMsg({ type: 'success', text: `✅ تم تسجيل حضور: ${r.data.student_name} — ${r.data.group_name}` })
      }
      load(false)
    } catch (err) {
      if (!window.navigator.onLine || !err.response) {
        // Offline or connection dropped: store in offline queue!
        const queue = getOfflineQueue()
        queue.push({ studentId: cleanId, autoPay: autoPayRef.current, timestamp: Date.now() })
        saveOfflineQueue(queue)
        playSuccessBeep()
        setScanMsg({
          type: 'warning',
          text: `⚠️ تم حفظ حضور الطالب #${cleanId} محلياً بدون نت — ستتم المزامنة تلقائياً`
        })
      } else {
        playErrorBeep()
        setScanMsg({ type: 'error', text: err.response?.data?.message || err.response?.data?.error || 'طالب غير موجود أو غير مقيد' })
      }
    }
    setTimeout(() => setScanMsg(null), 3500)
  }

  const handleManualScan = async (e) => {
    e.preventDefault()
    handleQRScan(scanId)
    setScanId('')
  }

  const [currentPage, setCurrentPage] = useState(1)
  const PER_PAGE = 10

  const toggleSelect = (sid) => setSelected(s => { const n = new Set(s); n.has(sid) ? n.delete(sid) : n.add(sid); return n })
  const isPast = data ? Date.now() > new Date(data.session.date).getTime() + (data.session.duration || 2) * 3600000 : false

  const filteredAttendance = data?.attendance.filter(a => {
    if (filterState === 'present') return a.isAttendant
    if (filterState === 'absent') return !a.isAttendant && isPast
    if (filterState === 'pending') return !a.isAttendant && !isPast
    return true
  }) || []

  const paginatedAttendance = filteredAttendance.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE)

  const selectAll = () => setSelected(new Set(filteredAttendance.map(a => a.student.id)))
  const clearAll = () => setSelected(new Set())

  useEffect(() => {
    setCurrentPage(1)
  }, [filterState])

  const bulkAction = async (action) => {
    try {
      await editSessionAttendance(id, { bulk_action: action, selected_students: [...selected] })
      setSelected(new Set())
      load(true)
    } catch { setMsg({ type: 'error', text: 'فشل التنفيذ' }) }
  }

  const toggleOne = async (studentId) => {
    await editSessionAttendance(id, { student_id: studentId })
    load(false)
  }

  const handleExportCSV = () => {
    if (!data) return
    const columns = [
      { header: 'الرقم', key: 'student.id' },
      { header: 'الاسم', key: 'student.name' },
      { header: 'المجموعة', key: 'student.group.name' },
      { header: 'العرض', render: a => a.student.offer ? `${a.student.offer.title} (${a.student.offer.value})` : '-' },
      { header: 'حالة الحضور', render: a => a.isAttendant ? 'حاضر' : (isPast ? 'غائب' : 'قيد الانتظار') }
    ]
    exportToCSV(data.attendance, columns, `attendance_session_${id}`)
  }

  if (loading) return <div className="spinner-wrapper"><div className="spinner" /></div>
  if (!data) return <div className="empty-state"><i className="pi pi-calendar" /><p>الحصة غير موجودة</p></div>

  const { session, attendance } = data
  const presentCount = attendance.filter(a => a.isAttendant).length
  const absentCount = attendance.filter(a => !a.isAttendant && isPast).length
  const pendingCount = attendance.filter(a => !a.isAttendant && !isPast).length

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">حضور: {session.title}</h1>
          <p className="page-subtitle">
            {session.type === 'lecture' ? `📚 محاضرة صف: ${session.grade}` : session.group?.name} · {new Date(session.date).toLocaleDateString('ar-EG')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {pendingSyncCount > 0 ? (
            <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.75rem' }}>
              <i className="pi pi-spin pi-spinner" /> يوجد {pendingSyncCount} حضور بانتظار المزامنة
            </span>
          ) : (
            <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.75rem' }}>
              <i className="pi pi-check" /> مزامن بالكامل
            </span>
          )}
          <button className="btn btn-secondary" onClick={handleExportCSV}>
            <i className="pi pi-download" /> تصدير CSV
          </button>
        </div>
      </div>

      {/* Hardware Scanner & Hotspot status banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(59,130,246,0.1))',
        border: '1px solid rgba(16,185,129,0.25)',
        borderRadius: '12px',
        padding: '0.75rem 1rem',
        marginBottom: '1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 8px #10b981' }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-color)' }}>
            قارئ الـ QR والباركود (USB / ماكينة سلكية أو لاسلكية) جاهز للاستقبال المباشر
          </span>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-color-secondary)' }}>
          مرر الكود أمام القارئ في أي وقت دون الحاجة للضغط على الفأرة
        </div>
      </div>

      <div className="stats-grid">
        {[
          { label: 'إجمالي', value: attendance.length, cls: 'blue' },
          { label: 'حاضر', value: presentCount, cls: 'green' },
          { label: 'غائب', value: absentCount, cls: 'orange' },
          { label: 'قيد الانتظار', value: pendingCount, cls: 'purple' },
          { label: 'نسبة الحضور', value: `${attendance.length ? ((presentCount / attendance.length)*100).toFixed(0) : 0}%`, cls: 'blue' },
        ].map((s, i) => (
          <div className="stat-card" key={i}>
            <div className={`stat-icon ${s.cls}`}><i className="pi pi-users" /></div>
            <div><div className="stat-value">{s.value}</div><div className="stat-label">{s.label}</div></div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button 
            className={`btn ${autoPay ? 'btn-success' : 'btn-secondary'}`} 
            onClick={() => setAutoPay(!autoPay)}
            style={{ fontWeight: 'bold', fontSize: '1rem', padding: '0.75rem 1.5rem' }}
          >
            <i className={`pi ${autoPay ? 'pi-check-circle' : 'pi-money-bill'}`} /> 
            {autoPay ? 'وضع الدفع مفعل (للطالب القادم)' : 'تسجيل دفع للطالب القادم'}
          </button>
        </div>

        {scanMsg && (
          <div className={`alert alert-${scanMsg.type === 'success' ? 'success' : scanMsg.type === 'warning' ? 'warning' : 'error'}`} style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
            {scanMsg.text}
          </div>
        )}
        
        {/* QR Scan Manual / Hardware USB */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <h2 className="card-title"><i className="pi pi-qrcode" /> إدخال يدوي / قارئ USB</h2>
          </div>
          <form onSubmit={handleManualScan} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <input
              className="form-control" style={{ maxWidth: '260px' }}
              placeholder="كود أو رقم الطالب..."
              value={scanId} onChange={e => setScanId(e.target.value)}
            />
            <button type="submit" className="btn btn-primary"><i className="pi pi-check" /> تسجيل</button>
          </form>
        </div>

        {/* QR Scan Camera */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <h2 className="card-title"><i className="pi pi-camera" /> كاميرا الهاتف (أندرويد / آيفون)</h2>
            <button className={`btn ${cameraEnabled ? 'btn-danger' : 'btn-success'}`} onClick={() => setCameraEnabled(!cameraEnabled)}>
              {cameraEnabled ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا'}
            </button>
          </div>
          {cameraEnabled && (
            <div style={{ background: 'var(--surface-ground)', borderRadius: 'var(--border-radius)', overflow: 'hidden', padding: '0.5rem' }}>
              <div id="qr-reader" style={{ width: '100%', maxWidth: '300px', margin: '0 auto' }}></div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk actions & Filters */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: '1rem' }}>
          <h2 className="card-title"><i className="pi pi-list" /> كشف الحضور</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <select className="form-control" style={{ width: '150px' }} value={filterState} onChange={e => setFilterState(e.target.value)}>
              <option value="all">الكل</option>
              <option value="present">الحاضرين فقط</option>
              <option value="absent">الغائبين فقط</option>
              <option value="pending">قيد الانتظار</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={selectAll}>تحديد ظاهر</button>
          <button className="btn btn-secondary btn-sm" onClick={clearAll}>إلغاء التحديد</button>
          {selected.size > 0 && <>
            <button className="btn btn-success btn-sm" onClick={() => bulkAction('mark_present')}>حضور المحددين</button>
            <button className="btn btn-danger btn-sm" onClick={() => bulkAction('mark_absent')}>غياب المحددين</button>
            <button className="btn btn-warning btn-sm" onClick={() => bulkAction('toggle_selected')}>تبديل المحددين</button>
          </>}
          <button className="btn btn-success btn-sm" onClick={() => bulkAction('mark_all_present')}>حضور الكل</button>
          <button className="btn btn-danger btn-sm" onClick={() => bulkAction('mark_all_absent')}>غياب الكل</button>
        </div>

        <div className="table-responsive">
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
            <thead>
              <tr style={{ background: 'var(--surface-ground, #f8fafc)', borderBottom: '1px solid var(--surface-border)' }}>
                <th style={{ width: '40px', padding: '0.75rem' }}>
                  <input type="checkbox" checked={selected.size === filteredAttendance.length && filteredAttendance.length > 0} onChange={e => e.target.checked ? selectAll() : clearAll()} />
                </th>
                <th style={{ padding: '0.75rem' }}>كود الطالب</th>
                <th style={{ padding: '0.75rem' }}>الاسم</th>
                <th style={{ padding: '0.75rem' }}>المجموعة</th>
                <th style={{ padding: '0.75rem' }}>الحالة</th>
                <th style={{ padding: '0.75rem' }}>المبلغ المدفوع</th>
                <th style={{ padding: '0.75rem', textAlign: 'center' }}>تبديل الحضور</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAttendance.map(a => (
                <tr key={a.student.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                  <td style={{ padding: '0.75rem' }}>
                    <input type="checkbox" checked={selected.has(a.student.id)} onChange={() => toggleSelect(a.student.id)} />
                  </td>
                  <td style={{ padding: '0.75rem', fontWeight: 600 }}>#{a.student.id}</td>
                  <td style={{ padding: '0.75rem', fontWeight: 600 }}>{a.student.name}</td>
                  <td style={{ padding: '0.75rem' }}>{a.student.group?.name || '-'}</td>
                  <td style={{ padding: '0.75rem' }}>
                    {a.isAttendant ? (
                      <span className="badge badge-success"><i className="pi pi-check" /> حاضر</span>
                    ) : isPast ? (
                      <span className="badge badge-danger"><i className="pi pi-times" /> غائب</span>
                    ) : (
                      <span className="badge badge-warning">قيد الانتظار</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <span style={{ fontWeight: 600 }}>{a.amountPaid || 0} ج.م</span>
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                    <button
                      className={`btn btn-sm ${a.isAttendant ? 'btn-danger' : 'btn-success'}`}
                      onClick={() => toggleOne(a.student.id)}
                      style={{ padding: '0.3rem 0.75rem' }}
                    >
                      {a.isAttendant ? 'تسجيل غياب' : 'تسجيل حضور'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredAttendance.length > PER_PAGE && (
          <div style={{ padding: '1rem 0', borderTop: '1px solid var(--surface-border)' }}>
            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(filteredAttendance.length / PER_PAGE)}
              onPageChange={p => setCurrentPage(p)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
