import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { getSessionAttendance, editSessionAttendance, scanAttendance } from '../api'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { exportToCSV } from '../utils/csvExport'
import Pagination from '../components/Pagination'

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
  const autoPayRef = useRef(false)

  // Sync ref with state to prevent stale closures in camera callback
  useEffect(() => {
    autoPayRef.current = autoPay
  }, [autoPay])

  const scannerRef = useRef(null)
  const lastScannedRef = useRef('')
  const lastScanTimeRef = useRef(0)

  const load = (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    getSessionAttendance(id).then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => load(true), [id])

  useEffect(() => {
    if (cameraEnabled) {
      const scanner = new Html5QrcodeScanner('qr-reader', { fps: 10, qrbox: { width: 250, height: 250 } }, false)
      scannerRef.current = scanner
      scanner.render((decodedText) => {
        const now = Date.now()
        // Prevent continuous scanning of the same code within 3 seconds
        if (decodedText !== lastScannedRef.current || now - lastScanTimeRef.current > 3000) {
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

  const handleQRScan = async (studentIdStr) => {
    try {
      const r = await scanAttendance(id, { student_id: studentIdStr, autoPay: autoPayRef.current })
      if (autoPayRef.current) {
        const paid = r.data.auto_paid || 0
        setScanMsg({
          type: 'success',
          text: paid > 0
            ? `✅ ${r.data.student_name} — ${r.data.group_name} (تم دفع ${paid})`
            : `✅ ${r.data.student_name} — ${r.data.group_name} (لا يوجد مستحق للدفع)`
        })
        setAutoPay(false) // reset toggle
      } else {
        setScanMsg({ type: 'success', text: `✅ ${r.data.student_name} — ${r.data.group_name}` })
      }

      load(false)
    } catch (err) {
      setScanMsg({ type: 'error', text: err.response?.data?.message || 'طالب غير موجود' })
    }
    setTimeout(() => setScanMsg(null), 3000)
  }

  const handleManualScan = async (e) => {
    e.preventDefault()
    handleQRScan(scanId)
    setScanId('')
  }

  const [currentPage, setCurrentPage] = useState(1);
  
  const PER_PAGE = 10;

  const toggleSelect = (sid) => setSelected(s => { const n = new Set(s); n.has(sid) ? n.delete(sid) : n.add(sid); return n })
  const isPast = data ? Date.now() > new Date(data.session.date).getTime() + (data.session.duration || 2) * 3600000 : false

  const filteredAttendance = data?.attendance.filter(a => {
    if (filterState === 'present') return a.isAttendant
    if (filterState === 'absent') return !a.isAttendant && isPast
    if (filterState === 'pending') return !a.isAttendant && !isPast
    return true
  }) || []

  const paginatedAttendance = filteredAttendance.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  const selectAll = () => setSelected(new Set(filteredAttendance.map(a => a.student.id)))
  const clearAll = () => setSelected(new Set())

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterState]);

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
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">حضور: {session.title}</h1>
          <p className="page-subtitle">
            {session.type === 'lecture' ? `📚 محاضرة صف: ${session.grade}` : session.group?.name} · {new Date(session.date).toLocaleDateString('ar-EG')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={handleExportCSV}>
            <i className="pi pi-download" /> تصدير CSV
          </button>
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
        
        {/* QR Scan Manual */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <h2 className="card-title"><i className="pi pi-qrcode" /> إدخال يدوي / قارئ USB</h2>
          </div>
          <form onSubmit={handleManualScan} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <input
              className="form-control" style={{ maxWidth: '260px' }}
              placeholder="رقم الطالب..."
              value={scanId} onChange={e => setScanId(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn btn-primary"><i className="pi pi-check" /> تسجيل</button>
          </form>
        </div>

        {/* QR Scan Camera */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <h2 className="card-title"><i className="pi pi-camera" /> كاميرا الموبايل</h2>
            <button className={`btn ${cameraEnabled ? 'btn-danger' : 'btn-success'}`} onClick={() => setCameraEnabled(!cameraEnabled)}>
              {cameraEnabled ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا'}
            </button>
          </div>
          {cameraEnabled && (
            <div style={{ background: 'var(--surface-ground)', borderRadius: 'var(--border-radius)', overflow: 'hidden' }}>
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

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th>الرقم</th>
                <th>الاسم</th>
                {session.type === 'lecture' && <th>المجموعة</th>}
                <th>الخصم</th>
                <th>الحالة</th>
                <th>تبديل</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAttendance.map(a => (
                <tr key={a.id} style={{ background: selected.has(a.student.id) ? 'var(--surface-hover)' : '' }}>
                  <td>
                    <input type="checkbox" checked={selected.has(a.student.id)} onChange={() => toggleSelect(a.student.id)} />
                  </td>
                  <td><span className="badge badge-info">{a.student.id}</span></td>
                  <td style={{ fontWeight: 600 }}>{a.student.name}</td>
                  {session.type === 'lecture' && <td className="text-muted text-sm">{a.student.group?.name || '-'}</td>}
                  <td className="text-muted text-sm">{a.student.offer ? `${a.student.offer.title} (${a.student.offer.value})` : '-'}</td>
                  <td>
                    <span className={`badge badge-${a.isAttendant ? 'success' : (isPast ? 'danger' : 'warning')}`}>
                      {a.isAttendant ? '✓ حاضر' : (isPast ? '✗ غائب' : '⏳ قيد الانتظار')}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`btn btn-sm ${a.isAttendant ? 'btn-danger' : 'btn-success'}`}
                      onClick={() => toggleOne(a.student.id)}
                    >
                      <i className={`pi pi-${a.isAttendant ? 'times' : 'check'}`} />
                    </button>
                  </td>
                </tr>
              ))}
              {paginatedAttendance.length === 0 && (
                <tr><td colSpan={session.type === 'lecture' ? 7 : 6} className="text-center text-muted" style={{ padding: '2rem' }}>لا يوجد طلاب مطابقين للفلتر</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination 
          totalItems={filteredAttendance.length} 
          itemsPerPage={PER_PAGE} 
          currentPage={currentPage} 
          onPageChange={setCurrentPage} 
        />
      </div>
    </div>
  )
}
