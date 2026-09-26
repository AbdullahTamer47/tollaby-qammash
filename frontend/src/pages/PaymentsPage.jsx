import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPayments, addPayment, getGroups } from '../api'
import { exportToCSV } from '../utils/csvExport'
import Pagination from '../components/Pagination'

export default function PaymentsPage() {
  const [state, setState] = useState({ payments: [], total: 0, page: 1 })
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  
  const [paymentModal, setPaymentModal] = useState(null)
  const [paymentForm, setPaymentForm] = useState({ amount: '', type: 'sessions' })

  const [searchQ, setSearchQ] = useState('')
  const [filterGroupId, setFilterGroupId] = useState('')
  const [debtFilter, setDebtFilter] = useState('all') // 'all' | 'debtors' | 'paid'

  const PER_PAGE = 10;

  const load = (page = 1) => {
    setLoading(true)
    const params = { page, per_page: PER_PAGE }
    if (searchQ) params.q = searchQ
    if (filterGroupId) params.groupId = filterGroupId

    getPayments(params)
      .then(r => setState({ payments: r.data.payments, total: r.data.total, page }))
      .catch(() => {}).finally(() => setLoading(false))
  }
  
  useEffect(() => { load(1) }, [searchQ, filterGroupId])

  useEffect(() => {
    getGroups().then(r => setGroups(r.data))
  }, [])

  const handleAddPayment = async (e) => {
    e.preventDefault()
    if (!paymentModal) return
    const sessionsRem = Math.max(0, (paymentModal.sessionsDue || 0) - (paymentModal.sessionsPaid || 0))
    const bookingsRem = Math.max(0, (paymentModal.bookingsDue || 0) - (paymentModal.bookingsPaid || 0))

    if (paymentForm.type === 'sessions' && sessionsRem <= 0) {
      setMsg({ type: 'error', text: 'الطالب سدد جميع مستحقات الحصص بالكامل (خالص). لا يمكن إضافة مبالغ حصص زائدة.' })
      return
    }

    if (paymentForm.type === 'book' && bookingsRem <= 0) {
      setMsg({ type: 'error', text: 'الطالب لا توجد عليه أي مديونيات لكتب أو مذكرات (خالص).' })
      return
    }

    try {
      await addPayment(paymentModal.studentId, paymentForm)
      setMsg({ type: 'success', text: `تم تسجيل دفعة بقيمة ${paymentForm.amount} جنيه بنجاح` })
      setPaymentModal(null)
      load(state.page)
    } catch (err) {
      setMsg({ type: 'error', text: err?.response?.data?.error || 'فشل إضافة الدفعة' })
    }
  }

  const handleCSV = async () => {
    getPayments({ q: searchQ, groupId: filterGroupId, per_page: 10000 }).then(r => {
      const columns = [
        { header: 'كود الطالب', key: 'studentId' },
        { header: 'اسم الطالب', key: 'student.name' },
        { header: 'المجموعة', key: 'student.group.name' },
        { header: 'المستحق (حصص)', render: p => (p.sessionsDue || 0).toFixed(2) },
        { header: 'المستحق (كتب)', render: p => (p.bookingsDue || 0).toFixed(2) },
        { header: 'إجمالي المستحق', render: p => (p.amountDue || 0).toFixed(2) },
        { header: 'إجمالي المسدد', render: p => (p.amountPaid || 0).toFixed(2) },
        { header: 'المتبقي (مديونية)', render: p => {
          const rem = Math.max(0, (p.sessionsDue || 0) - (p.sessionsPaid || 0)) + Math.max(0, (p.bookingsDue || 0) - (p.bookingsPaid || 0))
          return rem.toFixed(2)
        }},
        { header: 'آخر دفعة', key: 'lastPayment' }
      ]
      exportToCSV(r.data.payments, columns, 'tollaby_payments')
    }).catch(() => setMsg({ type: 'error', text: 'فشل تصدير البيانات' }))
  }

  const cleanPhone = (p) => (p || '').replace(/\D/g, '').replace(/^0+/, '')

  const sendWhatsAppDebtReminder = (p, totalRemaining) => {
    const dadPhone = p.student?.dadPhoneNumber || p.student?.phoneNumber
    const clean = cleanPhone(dadPhone)
    if (!clean) {
      alert('لا يوجد رقم هاتف مسجل لولي الأمر أو الطالب')
      return
    }

    const text = `السلام عليكم ورحمة الله وبركاته،\nنود إحاطتكم علماً بأن الطالب (${p.student?.name}) متبقي عليه مستحقات بمبلغ (${totalRemaining.toFixed(2)}) جنيه في منصة الأستاذ محمد القماش.\nيرجى التكرم بالسداد في الحصة القادمة.\nشاكرين ومقدرين حسن تعاونكم.`
    window.open(`https://wa.me/20${clean}?text=${encodeURIComponent(text)}`, '_blank')
  }

  // Filter payments by debt status in the current page
  const filteredPayments = state.payments.filter(p => {
    const sessionsRemaining = Math.max(0, (p.sessionsDue || 0) - (p.sessionsPaid || 0))
    const bookingsRemaining = Math.max(0, (p.bookingsDue || 0) - (p.bookingsPaid || 0))
    const totalRemaining = sessionsRemaining + bookingsRemaining

    if (debtFilter === 'debtors') return totalRemaining > 0
    if (debtFilter === 'paid') return totalRemaining === 0
    return true
  })

  // Quick summary stats for the current loaded view
  const totalDueSum = state.payments.reduce((acc, p) => acc + (p.amountDue || 0), 0)
  const totalPaidSum = state.payments.reduce((acc, p) => acc + (p.amountPaid || 0), 0)
  const totalDebtSum = state.payments.reduce((acc, p) => {
    const rem = Math.max(0, (p.sessionsDue || 0) - (p.sessionsPaid || 0)) + Math.max(0, (p.bookingsDue || 0) - (p.bookingsPaid || 0))
    return acc + rem
  }, 0)
  const debtorsCount = state.payments.filter(p => {
    const rem = Math.max(0, (p.sessionsDue || 0) - (p.sessionsPaid || 0)) + Math.max(0, (p.bookingsDue || 0) - (p.bookingsPaid || 0))
    return rem > 0
  }).length

  const totalPages = Math.ceil(state.total / PER_PAGE)

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">المدفوعات والمستحقات</h1>
          <p className="page-subtitle">إدارة تحصيلات الحصص والكتب وتتبع مديونيات الطلاب بسهولة</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleCSV}><i className="pi pi-download" /> تصدير CSV</button>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type === 'success' ? 'success' : 'error'}`}>
          <i className={`pi pi-${msg.type === 'success' ? 'check-circle' : 'exclamation-circle'}`} />{msg.text}
          <button style={{ marginRight: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      {/* KPI Financial Overview Cards */}
      <div className="stats-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-card">
          <div className="stat-icon blue"><i className="pi pi-dollar" /></div>
          <div>
            <div className="stat-value">{totalDueSum.toFixed(0)} <span style={{ fontSize: '0.8rem' }}>ج</span></div>
            <div className="stat-label">إجمالي المطلوب</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green"><i className="pi pi-check-circle" /></div>
          <div>
            <div className="stat-value" style={{ color: '#10b981' }}>{totalPaidSum.toFixed(0)} <span style={{ fontSize: '0.8rem' }}>ج</span></div>
            <div className="stat-label">المحصل الفعلي</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange"><i className="pi pi-exclamation-triangle" /></div>
          <div>
            <div className="stat-value" style={{ color: '#ef4444' }}>{totalDebtSum.toFixed(0)} <span style={{ fontSize: '0.8rem' }}>ج</span></div>
            <div className="stat-label">إجمالي المتبقي (مديونيات)</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple"><i className="pi pi-users" /></div>
          <div>
            <div className="stat-value">{debtorsCount}</div>
            <div className="stat-label">طلاب عليهم متبقي</div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 className="card-title" style={{ margin: 0 }}><i className="pi pi-wallet" /> جدول السداد</h2>
            
            {/* Quick Filter Tabs */}
            <div style={{ display: 'flex', background: 'var(--surface-ground)', borderRadius: '8px', padding: '0.2rem', border: '1px solid var(--surface-border)' }}>
              <button
                type="button"
                className={`btn btn-sm ${debtFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.65rem' }}
                onClick={() => setDebtFilter('all')}
              >
                الكل
              </button>
              <button
                type="button"
                className={`btn btn-sm ${debtFilter === 'debtors' ? 'btn-danger' : 'btn-secondary'}`}
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.65rem', fontWeight: debtFilter === 'debtors' ? 'bold' : 'normal' }}
                onClick={() => setDebtFilter('debtors')}
              >
                ⚠️ عليهم متبقي فقط
              </button>
              <button
                type="button"
                className={`btn btn-sm ${debtFilter === 'paid' ? 'btn-success' : 'btn-secondary'}`}
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.65rem' }}
                onClick={() => setDebtFilter('paid')}
              >
                ✅ خالصين تماماً
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              className="form-control"
              style={{ width: '220px' }}
              placeholder="بحث باسم أو رقم الطالب..."
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
            />
            <select
              className="form-control"
              style={{ width: '200px' }}
              value={filterGroupId}
              onChange={e => setFilterGroupId(e.target.value)}
            >
              <option value="">-- كل المجموعات --</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.grade})</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="spinner-wrapper"><div className="spinner" /></div>
        ) : filteredPayments.length === 0 ? (
          <div className="empty-state">
            <i className="pi pi-check-circle" style={{ fontSize: '2.5rem', color: '#10b981' }} />
            <p>لا توجد سجلات مطابقة للبحث أو التصفية الحالية</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th>المجموعة / الصف</th>
                  <th>المطلوب</th>
                  <th>المدفوع</th>
                  <th>المتبقي (مديونية)</th>
                  <th>آخر حركة دفع</th>
                  <th>إجراءات التحصيل والتواصل</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map(p => {
                  const sessionsRemaining = Math.max(0, (p.sessionsDue || 0) - (p.sessionsPaid || 0))
                  const bookingsRemaining = Math.max(0, (p.bookingsDue || 0) - (p.bookingsPaid || 0))
                  const totalRemaining = sessionsRemaining + bookingsRemaining

                  const sessionsCredit = Math.max(0, p.sessionsBalance || 0)
                  const bookingsCredit = Math.max(0, p.bookingsBalance || 0)
                  const totalCredit = sessionsCredit + bookingsCredit

                  const hasDebt = totalRemaining > 0

                  return (
                    <tr key={p.id}>
                      <td>
                        <Link to={`/students/${p.studentId}/dashboard`} style={{ color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 700 }}>
                          {p.student?.name}
                        </Link>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-color-secondary)' }}>
                          كود: #{p.studentId}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 600 }}>{p.student?.group?.name || '-'}</div>
                        <span className="text-muted text-sm">{p.student?.group?.grade || '-'}</span>
                      </td>

                      <td style={{ fontWeight: 600 }}>
                        {(p.amountDue || 0).toFixed(0)} ج
                      </td>

                      <td>
                        <span className="badge badge-success">
                          {(p.amountPaid || 0).toFixed(0)} ج
                        </span>
                      </td>

                      <td>
                        {hasDebt ? (
                          <div>
                            <span className="badge badge-danger" style={{ fontSize: '0.85rem', fontWeight: 800, padding: '0.3rem 0.6rem' }}>
                              {totalRemaining.toFixed(0)} ج متبقي
                            </span>
                            <div className="text-muted text-xs" style={{ marginTop: '0.2rem' }}>
                              {sessionsRemaining > 0 && <span>حصص: {sessionsRemaining.toFixed(0)} ج </span>}
                              {bookingsRemaining > 0 && <span>كتب: {bookingsRemaining.toFixed(0)} ج</span>}
                            </div>
                          </div>
                        ) : totalCredit > 0 ? (
                          <span className="badge badge-info">
                            رصيد فايض: {totalCredit.toFixed(0)} ج
                          </span>
                        ) : (
                          <span className="badge badge-success">
                            خالص ✅
                          </span>
                        )}
                      </td>

                      <td className="text-sm text-muted">
                        {p.lastPayment ? `${p.lastPayment} ج` : 'لا يوجد'}
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                          <button
                            className="btn btn-success btn-sm"
                            style={{ fontWeight: 700, padding: '0.3rem 0.65rem' }}
                            title="إضافة دفعة سداد"
                            onClick={() => {
                              const sRem = Math.max(0, (p.sessionsDue || 0) - (p.sessionsPaid || 0))
                              const bRem = Math.max(0, (p.bookingsDue || 0) - (p.bookingsPaid || 0))
                              if (sRem > 0) {
                                setPaymentForm({ amount: String(sRem), type: 'sessions' })
                              } else if (bRem > 0) {
                                setPaymentForm({ amount: String(bRem), type: 'book' })
                              } else {
                                setPaymentForm({ amount: '', type: 'sessions' })
                              }
                              setPaymentModal(p)
                            }}
                          >
                            <i className="pi pi-plus" /> تحصيل
                          </button>

                          {hasDebt && (
                            <button
                              className="btn btn-sm btn-icon"
                              title="إرسال تذكير بالمديونية لولي الأمر عبر واتساب"
                              style={{ background: '#25D366', color: '#ffffff', border: '1px solid #1ebe5d' }}
                              onClick={() => sendWhatsAppDebtReminder(p, totalRemaining)}
                            >
                              <i className="pi pi-whatsapp" />
                            </button>
                          )}

                          <Link
                            to={`/payments/${p.studentId}/history`}
                            className="btn btn-secondary btn-sm btn-icon"
                            title="سجل المدفوعات التاريخي"
                          >
                            <i className="pi pi-history" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <Pagination 
            totalItems={state.total} 
            itemsPerPage={PER_PAGE} 
            currentPage={state.page} 
            onPageChange={page => load(page)} 
          />
        )}
      </div>

      {/* Modal: Add Payment */}
      {paymentModal && (() => {
        const sessionsRem = Math.max(0, (paymentModal.sessionsDue || 0) - (paymentModal.sessionsPaid || 0))
        const bookingsRem = Math.max(0, (paymentModal.bookingsDue || 0) - (paymentModal.bookingsPaid || 0))
        const isCompletelyPaid = sessionsRem <= 0 && bookingsRem <= 0

        return (
          <div className="modal-overlay" onClick={() => setPaymentModal(null)}>
            <div className="modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title"><i className="pi pi-plus-circle" /> تسجيل دفعة: {paymentModal.student?.name}</h3>
                <button className="modal-close" onClick={() => setPaymentModal(null)}><i className="pi pi-times" /></button>
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
                <div style={{ background: sessionsRem > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)', padding: '0.5rem', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-color-secondary)' }}>متبقي الحصص</div>
                  <div style={{ fontWeight: 800, color: sessionsRem > 0 ? '#ef4444' : '#15803d', fontSize: '1.05rem' }}>
                    {sessionsRem > 0 ? `${sessionsRem} ج` : 'خالص ✅'}
                  </div>
                </div>
                <div style={{ background: bookingsRem > 0 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(34, 197, 94, 0.1)', padding: '0.5rem', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-color-secondary)' }}>متبقي المذكرات</div>
                  <div style={{ fontWeight: 800, color: bookingsRem > 0 ? '#b45309' : '#15803d', fontSize: '1.05rem' }}>
                    {bookingsRem > 0 ? `${bookingsRem} ج` : 'خالص ✅'}
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
                    value={paymentForm.type}
                    onChange={e => {
                      const newType = e.target.value
                      setPaymentForm({
                        type: newType,
                        amount: newType === 'sessions' ? (sessionsRem > 0 ? String(sessionsRem) : '') : (bookingsRem > 0 ? String(bookingsRem) : '')
                      })
                    }}
                  >
                    <option value="sessions" disabled={sessionsRem <= 0}>
                      سداد حصص / محاضرات {sessionsRem <= 0 ? '(خالص بالكامل - 0 ج)' : `(مطلوب: ${sessionsRem} ج)`}
                    </option>
                    <option value="book" disabled={bookingsRem <= 0}>
                      سداد مذكرات / كتب {bookingsRem <= 0 ? '(خالص بالكامل - 0 ج)' : `(مطلوب: ${bookingsRem} ج)`}
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
                    value={paymentForm.amount}
                    onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                  />
                  {paymentForm.type === 'sessions' && sessionsRem > 0 && (
                    <span className="text-xs text-muted" style={{ display: 'block', marginTop: '0.25rem' }}>
                      المبلغ المتبقي والمستحق لسداد الحصص هو {sessionsRem} جنيه.
                    </span>
                  )}
                </div>

                <div className="modal-footer">
                  <button type="submit" className="btn btn-primary" disabled={isCompletelyPaid}>
                    <i className="pi pi-check" /> حفظ الدفعة
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setPaymentModal(null)}>إلغاء</button>
                </div>
              </form>
            </div>
          </div>
        )
      })()}
    </div>
  )
}