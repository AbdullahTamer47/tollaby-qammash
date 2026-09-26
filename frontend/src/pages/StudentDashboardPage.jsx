import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getStudentDashboard, changeStudentGroup, addPayment, toggleBooking, toggleDelivery, getStudentArchivedMessages } from '../api'
import StudentReportModal from '../components/StudentReportModal'

export default function StudentDashboardPage() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showReportModal, setShowReportModal] = useState(false)
  const [payModal, setPayModal] = useState(false)
  const [payForm, setPayForm] = useState({ amount: '', type: 'sessions' })
  const [deletePayModal, setDeletePayModal] = useState(null)
  const [groupModal, setGroupModal] = useState(false)
  const [newGroupId, setNewGroupId] = useState('')
  const [bookDiscountModal, setBookDiscountModal] = useState(null) // holds the book id
  const [bookDiscountForm, setBookDiscountForm] = useState({ type: 'percentage', value: '' })
  const [msg, setMsg] = useState(null)

  const [archivedMsgs, setArchivedMsgs] = useState([])

  const load = () => {
    setLoading(true)
    Promise.all([
      getStudentDashboard(id),
      getStudentArchivedMessages(id).catch(() => [])
    ]).then(([r, msgs]) => {
      setData(r.data)
      setArchivedMsgs(msgs || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [id])

  const openAddPaymentModal = () => {
    const sessionRem = Math.max(0, Math.round(((data?.payment?.sessionsDue || 0) - (data?.payment?.sessionsPaid || 0)) * 100) / 100)
    const bookRem = Math.max(0, Math.round(((data?.payment?.bookingsDue || 0) - (data?.payment?.bookingsPaid || 0)) * 100) / 100)

    if (sessionRem > 0) {
      setPayForm({ amount: String(sessionRem), type: 'sessions' })
    } else if (bookRem > 0) {
      setPayForm({ amount: String(bookRem), type: 'book' })
    } else {
      setPayForm({ amount: '', type: 'sessions' })
    }
    setPayModal(true)
  }

  const handleAddPayment = async (e) => {
    e.preventDefault()
    const sessionRem = Math.max(0, Math.round(((data?.payment?.sessionsDue || 0) - (data?.payment?.sessionsPaid || 0)) * 100) / 100)
    const bookRem = Math.max(0, Math.round(((data?.payment?.bookingsDue || 0) - (data?.payment?.bookingsPaid || 0)) * 100) / 100)

    if (payForm.type === 'sessions' && sessionRem <= 0) {
      setMsg({ type: 'error', text: 'الطالب سدد جميع مستحقات الحصص بالكامل (خالص). لا يمكن إضافة مبالغ حصص زائدة.' })
      return
    }

    if (payForm.type === 'book' && bookRem <= 0) {
      setMsg({ type: 'error', text: 'الطالب لا توجد عليه أي مديونيات لكتب أو مذكرات (خالص).' })
      return
    }

    try {
      await addPayment(id, payForm)
      setMsg({ type: 'success', text: `تم إضافة دفعة ${payForm.amount} جنيه بنجاح` })
      setPayModal(false)
      setPayForm({ amount: '', type: 'sessions' })
      load()
    } catch (err) {
      setMsg({ type: 'error', text: err?.response?.data?.error || 'فشل إضافة الدفعة' })
    }
  }

  const handleDeletePayment = async () => {
    try {
      const { deleteEachPayment } = await import('../api')
      await deleteEachPayment(deletePayModal.id)
      setMsg({ type: 'success', text: 'تم حذف الدفعة بنجاح' })
      setDeletePayModal(null)
      load()
    } catch { setMsg({ type: 'error', text: 'فشل حذف الدفعة' }) }
  }

  const handleChangeGroup = async (e) => {
    e.preventDefault()
    try {
      await changeStudentGroup(id, newGroupId)
      setMsg({ type: 'success', text: 'تم تغيير المجموعة' })
      setGroupModal(false)
      load()
    } catch { setMsg({ type: 'error', text: 'فشل تغيير المجموعة' }) }
  }

  if (loading) return <div className="spinner-wrapper"><div className="spinner" /></div>
  if (!data) return <div className="empty-state"><i className="pi pi-user" /><p>الطالب غير موجود</p></div>

  const handleToggleBooking = async (bookId) => {
    try {
      await toggleBooking({ studentId: id, bookId })
      load()
    } catch { setMsg({ type: 'error', text: 'فشل تغيير حجز الكتاب' }) }
  }

  const handleToggleDelivery = async (bookId) => {
    try {
      await toggleDelivery({ studentId: id, bookId })
      setMsg({ type: 'success', text: 'تم تحديث حالة تسليم المذكرة بنجاح' })
      load()
    } catch {
      setMsg({ type: 'error', text: 'فشل تحديث تسليم المذكرة' })
    }
  }

  const handleApplyBookDiscount = async (e) => {
    e.preventDefault()
    try {
      const { setBookBookingDiscount } = await import('../api')
      await setBookBookingDiscount({
        studentId: id,
        bookId: bookDiscountModal,
        discountType: bookDiscountForm.type,
        discountValue: bookDiscountForm.value
      })
      setMsg({ type: 'success', text: 'تم تطبيق خصم الكتاب' })
      setBookDiscountModal(null)
      load()
    } catch { setMsg({ type: 'error', text: 'فشل تطبيق خصم الكتاب' }) }
  }

  const { student, allAttendance, totalAttended, totalGroupSessions, attendancePercentage,
    payment, eachPayments, examResults, allGroups,
    availableBooks, bookedBookIds } = data

  const handleExportStudentCSV = async () => {
    const { exportToCSV } = await import('../utils/csvExport')
    const columns = [
      { header: 'الرقم', key: 'id' },
      { header: 'المبلغ', key: 'amount' },
      { header: 'النوع', render: p => p.type === 'sessions' ? 'حصص' : 'كتب/مذكرات' },
      { header: 'البيان', key: 'targetName' },
      { header: 'تاريخ الدفعة', render: p => new Date(p.lastPaymentDate).toLocaleString('ar-EG') }
    ]
    exportToCSV(eachPayments, columns, `payments_${student.name}`)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{student.name}</h1>
          <p className="page-subtitle">
            <span className="badge badge-info" style={{ marginLeft: '0.5rem' }}>#{student.id}</span>
            {student.group?.name} · {student.group?.grade}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowReportModal(true)}
            style={{ background: '#0284c7', borderColor: '#0284c7', fontWeight: 600 }}
          >
            <i className="pi pi-file-pdf" /> تقرير ولي الأمر (واتساب / PDF)
          </button>
          <Link to={`/qrcodes?student_id=${student.id}`} className="btn btn-secondary">
            <i className="pi pi-id-card" /> كارت الهوية
          </Link>
          <button className="btn btn-secondary" onClick={() => { setNewGroupId(student.groupId); setGroupModal(true) }}>
            <i className="pi pi-arrow-right-arrow-left" /> تغيير المجموعة
          </button>
          <button className="btn btn-success" onClick={openAddPaymentModal}>
            <i className="pi pi-plus" /> إضافة دفعة
          </button>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type === 'success' ? 'success' : 'error'}`}>
          <i className={`pi pi-${msg.type === 'success' ? 'check-circle' : 'exclamation-circle'}`} />
          {msg.text}
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue"><i className="pi pi-check-square" /></div>
          <div>
            <div className="stat-value">{totalAttended}</div>
            <div className="stat-label">حصص حضر</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><i className="pi pi-times-circle" /></div>
          <div>
            <div className="stat-value">{totalGroupSessions - totalAttended}</div>
            <div className="stat-label">حصص غاب</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><i className="pi pi-percentage" /></div>
          <div>
            <div className="stat-value">{attendancePercentage.toFixed(0)}%</div>
            <div className="stat-label">نسبة الحضور</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple"><i className="pi pi-wallet" /></div>
          <div>
            <div className="stat-value">
              {payment.amountDue - payment.amountPaid > 0 
                ? (payment.amountDue - payment.amountPaid).toFixed(2) 
                : 0}
            </div>
            <div className="stat-label">المتبقي (جنيه)</div>
          </div>
        </div>
        {payment.amountPaid - payment.amountDue > 0 && (
          <div className="stat-card" style={{ border: '1px solid var(--success-color)' }}>
            <div className="stat-icon green"><i className="pi pi-money-bill" /></div>
            <div>
              <div className="stat-value text-success">{(payment.amountPaid - payment.amountDue).toFixed(2)}</div>
              <div className="stat-label text-success">رصيد المحفظة</div>
            </div>
          </div>
        )}
      </div>

      {/* Attendance progress */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title"><i className="pi pi-chart-bar" /> نسبة الحضور</h2>
          <span className="text-muted text-sm">{totalAttended} / {totalGroupSessions}</span>
        </div>
        <div className="progress" style={{ height: '12px' }}>
          <div className="progress-bar" style={{ width: `${attendancePercentage}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', color: 'var(--text-color-secondary)', fontSize: '0.8rem' }}>
          <span>حضر: {totalAttended}</span>
          <span>غاب: {totalGroupSessions - totalAttended}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        {/* Payment info */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title"><i className="pi pi-money-bill" /> المدفوعات</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary btn-sm" onClick={handleExportStudentCSV}>
                <i className="pi pi-download" /> تصدير
              </button>
              <Link to={`/payments/${student.id}/history`} className="btn btn-secondary btn-sm">
                <i className="pi pi-history" /> السجل
              </Link>
            </div>
          </div>
          {[
            { label: 'إجمالي المستحق (حصص)', value: payment.sessionsDue.toFixed(2), cls: '' },
            { label: 'المدفوع (حصص)', value: payment.sessionsPaid.toFixed(2), cls: 'text-success' },
            { label: 'المتبقي (حصص)', value: (payment.sessionsDue - payment.sessionsPaid).toFixed(2), cls: 'font-bold' },
            { label: 'إجمالي المستحق (كتب)', value: payment.bookingsDue.toFixed(2), cls: '' },
            { label: 'المدفوع (كتب)', value: payment.bookingsPaid.toFixed(2), cls: 'text-success' },
            { label: 'المتبقي (كتب)', value: (payment.bookingsDue - payment.bookingsPaid).toFixed(2), cls: 'font-bold' },
            { label: '---', value: '---', cls: '' },
            ...(payment.amountDue - payment.amountPaid > 0 
              ? [{ label: 'المتبقي الكلي', value: (payment.amountDue - payment.amountPaid).toFixed(2), cls: 'font-bold text-danger' }]
              : payment.amountPaid - payment.amountDue > 0
                ? [{ label: 'رصيد المحفظة المتاح', value: (payment.amountPaid - payment.amountDue).toFixed(2), cls: 'font-bold text-success' }]
                : [{ label: 'المتبقي الكلي', value: '0.00', cls: 'font-bold text-success' }]
            )
          ].map((row, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.6rem 0', borderBottom: '1px solid var(--surface-border)'
            }}>
              <span style={{ color: 'var(--text-color-secondary)' }}>{row.label}</span>
              <span className={row.cls} style={{ color: 'var(--text-color)' }}>{row.value} جنيه</span>
            </div>
          ))}

          {/* All payments */}
          <div style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '0.5rem' }}>
            {eachPayments.length === 0 ? (
              <div className="text-muted text-sm text-center" style={{ padding: '1rem' }}>لا توجد مدفوعات مسجلة</div>
            ) : (
              eachPayments.map(p => (
                <div key={p.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.6rem 0', fontSize: '0.85rem', borderBottom: '1px solid var(--surface-border)'
                }}>
                  <div>
                    <span className="badge badge-success" style={{ fontSize: '0.9rem', marginLeft: '0.5rem' }}>{p.amount} جنيه</span>
                    <span className="text-muted" style={{ display: 'block', marginTop: '0.2rem' }}>
                      {p.targetName} ({p.type === 'sessions' ? 'حصص' : 'كتب'})
                    </span>
                    <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                      {new Date(p.lastPaymentDate).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeletePayModal(p)}>
                      <i className="pi pi-trash" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Books info */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 className="card-title"><i className="pi pi-book" /> الكتب والمذكرات الدراسية للدفعة</h2>
            <span className="badge badge-info" style={{ fontSize: '0.82rem' }}>
              الكتب المحجوزة: {bookedBookIds?.length || 0}
            </span>
          </div>
          {availableBooks?.length === 0 ? (
            <div className="empty-state"><i className="pi pi-book" /><p>لا توجد كتب متاحة لصف هذا الطالب</p></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
              {availableBooks?.map(b => {
                const isBooked = bookedBookIds?.includes(b.id)
                const booking = (data.bookBookings || []).find(bb => bb.bookId === b.id)
                const isDelivered = Boolean(booking?.delivered)

                return (
                  <div key={b.id} style={{
                    background: 'var(--surface-ground)',
                    border: isDelivered ? '2px solid #10b981' : isBooked ? '1px solid #3b82f6' : '1px solid var(--surface-border)',
                    borderRadius: '10px',
                    padding: '0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '0.75rem'
                  }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                        <strong style={{ fontSize: '0.95rem', color: 'var(--text-color)' }}>{b.title}</strong>
                        <span className="badge badge-info">{b.price} ج.م</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
                        <span className={`badge badge-${isBooked ? 'success' : 'secondary'}`}>
                          {isBooked ? '📌 محجوز' : 'غير محجوز'}
                        </span>
                        <span className={`badge badge-${isDelivered ? 'success' : 'warning'}`}>
                          {isDelivered ? '✅ تم التسليم' : '⏳ لم تُسلّم بعد'}
                        </span>
                        {booking?.discountValue > 0 && (
                          <span className="badge badge-warning">
                            خصم: {booking.discountValue} {booking.discountType === 'percentage' ? '%' : 'ج'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', borderTop: '1px solid var(--surface-border)', paddingTop: '0.5rem' }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${isBooked ? 'btn-secondary' : 'btn-primary'}`}
                        style={{ flex: 1, minWidth: '90px', fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                        onClick={() => handleToggleBooking(b.id)}
                      >
                        <i className={`pi pi-${isBooked ? 'times' : 'bookmark'}`} />
                        {isBooked ? 'إلغاء الحجز' : 'حجز المذكرة'}
                      </button>

                      <button
                        type="button"
                        className={`btn btn-sm ${isDelivered ? 'btn-success' : 'btn-warning'}`}
                        style={{ flex: 1, minWidth: '90px', fontSize: '0.8rem', padding: '0.35rem 0.5rem', fontWeight: 700 }}
                        onClick={() => handleToggleDelivery(b.id)}
                        title={isDelivered ? 'اضغط لإلغاء حالة التسليم' : 'اضغط لتسليم المذكرة للطالب فوراً'}
                      >
                        <i className={`pi pi-${isDelivered ? 'check-circle' : 'box'}`} />
                        {isDelivered ? 'مُسلّمة ✅' : 'تسليم المذكرة'}
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                        title="تخصيص خصم للكتاب"
                        onClick={() => { setBookDiscountModal(b.id); setBookDiscountForm({ type: 'percentage', value: booking?.discountValue || '' }) }}
                      >
                        <i className="pi pi-tag" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Exam results */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title"><i className="pi pi-pencil" /> نتائج الامتحانات</h2>
          </div>
          {examResults.length === 0
            ? <div className="empty-state"><i className="pi pi-pencil" /><p>لا توجد امتحانات</p></div>
            : examResults.map(r => (
              <div key={r.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.6rem 0', borderBottom: '1px solid var(--surface-border)'
              }}>
                <span>{r.exam?.title}</span>
                <div style={{ textAlign: 'left' }}>
                  <span className="badge badge-info">
                    {r.studentDegree ?? '-'} / {r.exam?.totalDegree}
                  </span>
                  {r.studentDegree !== null && (
                    <div className="progress" style={{ width: '80px', height: '4px', marginTop: '4px' }}>
                      <div className="progress-bar" style={{ width: `${(r.studentDegree / r.exam?.totalDegree) * 100}%` }} />
                    </div>
                  )}
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* Attendance details */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title"><i className="pi pi-calendar-times" /> سجل الحضور</h2>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>الحصة</th>
                <th>المجموعة</th>
                <th>التاريخ</th>
                <th>السعر</th>
                <th>الحضور</th>
              </tr>
            </thead>
            <tbody>
              {allAttendance.map(a => {
                const sessionEnd = new Date(new Date(a.session?.date).getTime() + (a.session?.duration || 0) * 3600000)
                const isPast = new Date() > sessionEnd
                
                let badgeClass = 'warning'
                let badgeText = '⏳ قيد الانتظار'
                
                if (isPast) {
                  badgeClass = a.isAttendant ? 'success' : 'danger'
                  badgeText = a.isAttendant ? 'حاضر' : 'غائب'
                } else if (a.isAttendant) {
                  badgeClass = 'success'
                  badgeText = 'حاضر'
                }

                return (
                  <tr key={a.id}>
                    <td>{a.session?.title}</td>
                    <td>{a.session?.group?.name}</td>
                    <td>{new Date(a.session?.date).toLocaleDateString('ar-EG')}</td>
                    <td>{a.session?.price} جنيه</td>
                    <td>
                      <span className={`badge badge-${badgeClass}`}>
                        {badgeText}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Payment Modal */}
      {payModal && (() => {
        const sessionRem = Math.max(0, Math.round(((payment?.sessionsDue || 0) - (payment?.sessionsPaid || 0)) * 100) / 100)
        const bookRem = Math.max(0, Math.round(((payment?.bookingsDue || 0) - (payment?.bookingsPaid || 0)) * 100) / 100)
        const isCompletelyPaid = sessionRem <= 0 && bookRem <= 0

        return (
          <div className="modal-overlay" onClick={() => { setPayModal(false); setPayForm({ amount: '', type: 'sessions' }) }}>
            <div className="modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title"><i className="pi pi-wallet" /> تسجيل دفعة - {student.name}</h3>
                <button className="modal-close" onClick={() => { setPayModal(false); setPayForm({ amount: '', type: 'sessions' }) }}><i className="pi pi-times" /></button>
              </div>

              {/* Debt overview card */}
              <div style={{
                background: 'var(--surface-ground)',
                padding: '0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--surface-border)',
                marginBottom: '1rem',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.5rem',
                textAlign: 'center'
              }}>
                <div style={{ background: sessionRem > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)', padding: '0.5rem', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-color-secondary)' }}>متبقي الحصص</div>
                  <div style={{ fontWeight: 800, color: sessionRem > 0 ? '#ef4444' : '#15803d', fontSize: '1.05rem' }}>
                    {sessionRem > 0 ? `${sessionRem} ج` : 'خالص ✅'}
                  </div>
                </div>
                <div style={{ background: bookRem > 0 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(34, 197, 94, 0.1)', padding: '0.5rem', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-color-secondary)' }}>متبقي المذكرات</div>
                  <div style={{ fontWeight: 800, color: bookRem > 0 ? '#b45309' : '#15803d', fontSize: '1.05rem' }}>
                    {bookRem > 0 ? `${bookRem} ج` : 'خالص ✅'}
                  </div>
                </div>
              </div>

              {isCompletelyPaid && (
                <div className="alert alert-info" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                  <i className="pi pi-check-circle" />
                  الطالب خالص تماماً وسدد جميع الحصص والمذكرات المطلوبة حتى الآن.
                </div>
              )}

              <form onSubmit={handleAddPayment}>
                <div className="form-group">
                  <label className="form-label">نوع الدفعة</label>
                  <select
                    className="form-control"
                    value={payForm.type}
                    onChange={e => {
                      const newType = e.target.value
                      setPayForm({
                        type: newType,
                        amount: newType === 'sessions' ? (sessionRem > 0 ? String(sessionRem) : '') : (bookRem > 0 ? String(bookRem) : '')
                      })
                    }}
                  >
                    <option value="sessions" disabled={sessionRem <= 0}>
                      سداد حصص {sessionRem <= 0 ? '(خالص بالكامل - 0 ج)' : `(مطلوب: ${sessionRem} ج)`}
                    </option>
                    <option value="book" disabled={bookRem <= 0}>
                      سداد مذكرات / كتب {bookRem <= 0 ? '(خالص بالكامل - 0 ج)' : `(مطلوب: ${bookRem} ج)`}
                    </option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">المبلغ المدفوع (جنيه)</label>
                  <input
                    className="form-control"
                    type="number"
                    min="1"
                    required
                    placeholder="المبلغ بالجنيه"
                    disabled={isCompletelyPaid}
                    value={payForm.amount}
                    onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                  />
                  {payForm.type === 'sessions' && sessionRem > 0 && (
                    <span className="text-xs text-muted" style={{ display: 'block', marginTop: '0.25rem' }}>
                      المبلغ المتبقي والمستحق لسداد الحصص هو {sessionRem} جنيه.
                    </span>
                  )}
                </div>

                <div className="modal-footer">
                  <button type="submit" className="btn btn-success" disabled={isCompletelyPaid}>
                    <i className="pi pi-check" /> حفظ الدفعة
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => { setPayModal(false); setPayForm({ amount: '', type: 'sessions' }) }}>إلغاء</button>
                </div>
              </form>
            </div>
          </div>
        )
      })()}

      {/* Delete Payment Confirm */}
      {deletePayModal && (
        <div className="modal-overlay" onClick={() => setDeletePayModal(null)}>
          <div className="modal" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: 'var(--danger-color)' }}><i className="pi pi-exclamation-triangle" /> تأكيد الحذف</h3>
              <button className="modal-close" onClick={() => setDeletePayModal(null)}><i className="pi pi-times" /></button>
            </div>
            <p>هل أنت متأكد من حذف دفعة <strong>{deletePayModal.amount} جنيه</strong> ({deletePayModal.targetName})؟ سيتم إرجاع المديونية أوتوماتيكياً للحصص/الكتب بدقة.</p>
            <div className="modal-footer">
              <button className="btn btn-danger" onClick={handleDeletePayment}><i className="pi pi-trash" /> حذف</button>
              <button className="btn btn-secondary" onClick={() => setDeletePayModal(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Change Group Modal */}
      {groupModal && (() => {
        const targetGroup = allGroups.find(g => String(g.id) === String(newGroupId))
        const isGradeDifferent = Boolean(targetGroup && student?.group?.grade && targetGroup.grade !== student.group.grade)

        return (
          <div className="modal-overlay" onClick={() => setGroupModal(false)}>
            <div className="modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title"><i className="pi pi-arrows-h" /> نقل / تغيير المجموعة</h3>
                <button className="modal-close" onClick={() => setGroupModal(false)}><i className="pi pi-times" /></button>
              </div>
              <form onSubmit={handleChangeGroup}>
                <div style={{ marginBottom: '1rem', background: 'var(--surface-ground)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-color-secondary)' }}>المجموعة الحالية:</div>
                  <div style={{ fontWeight: 700, color: 'var(--primary-color)' }}>
                    {student?.group?.name} <span className="badge badge-info">{student?.group?.grade}</span>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">اختر المجموعة الجديدة</label>
                  <select className="form-control" value={newGroupId} onChange={e => setNewGroupId(e.target.value)} required>
                    {allGroups.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.grade}) {g.id === student?.groupId ? '— (الحالية)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {isGradeDifferent && (
                  <div className="alert alert-warning" style={{ margin: '1rem 0', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <i className="pi pi-exclamation-triangle" style={{ fontSize: '1.4rem', color: '#d97706', marginTop: '0.15rem' }} />
                    <div style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
                      <strong style={{ color: '#b45309' }}>تحذير: اختلاف الصف الدراسي!</strong>
                      <div>
                        الطالب حالياً في <strong>({student.group.grade})</strong> بينما المجموعة الجديدة مخصصة لـ <strong>({targetGroup.grade})</strong>.
                      </div>
                    </div>
                  </div>
                )}

                <div className="modal-footer">
                  <button type="submit" className="btn btn-primary">
                    <i className="pi pi-check" /> تأكيد النقل
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setGroupModal(false)}>إلغاء</button>
                </div>
              </form>
            </div>
          </div>
        )
      })()}

      {/* Book Discount Modal */}
      {bookDiscountModal && (
        <div className="modal-overlay" onClick={() => setBookDiscountModal(null)}>
          <div className="modal" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">تخصيص خصم للكتاب</h3>
              <button className="modal-close" onClick={() => setBookDiscountModal(null)}><i className="pi pi-times" /></button>
            </div>
            <form onSubmit={handleApplyBookDiscount}>
              <div className="form-group">
                <label className="form-label">نوع الخصم</label>
                <select className="form-control" value={bookDiscountForm.type} onChange={e => setBookDiscountForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="percentage">نسبة مئوية (%)</option>
                  <option value="amount">مبلغ ثابت (جنيه)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">قيمة الخصم</label>
                <input className="form-control" type="number" min="0" required value={bookDiscountForm.value} onChange={e => setBookDiscountForm(f => ({ ...f, value: e.target.value }))} />
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary"><i className="pi pi-check" /> تطبيق الخصم</button>
                <button type="button" className="btn btn-secondary" onClick={() => setBookDiscountModal(null)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Archived Messages */}
      {archivedMsgs.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title" style={{ color: 'var(--warning-color)' }}>
              <i className="pi pi-inbox" /> رسائل مؤرشفة معلقة ({archivedMsgs.length})
            </h2>
          </div>
          <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
            <table style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>تاريخ الإرسال</th>
                  <th>نص الرسالة</th>
                </tr>
              </thead>
              <tbody>
                {archivedMsgs.map(msg => (
                  <tr key={msg.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(msg.createdAt).toLocaleString('ar-EG')}</td>
                    <td style={{ whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>{msg.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Comprehensive Student Report for Parent Modal */}
      {showReportModal && (
        <StudentReportModal
          studentId={id}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  )
}
