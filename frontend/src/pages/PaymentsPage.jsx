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
    try {
      await addPayment(paymentModal.studentId, paymentForm)
      setMsg({ type: 'success', text: 'تمت إضافة الدفعة بنجاح وتوزيعها تلقائياً' })
      setPaymentModal(null)
      load(state.page)
    } catch {
      setMsg({ type: 'error', text: 'فشل إضافة الدفعة' })
    }
  }

  const handleCSV = async () => {
    getPayments({ q: searchQ, groupId: filterGroupId, per_page: 10000 }).then(r => {
      const columns = [
        { header: 'رقم الطالب', key: 'studentId' },
        { header: 'اسم الطالب', key: 'student.name' },
        { header: 'المجموعة', key: 'student.group.name' },
        { header: 'المستحق (حصص)', render: p => (p.sessionsDue || 0).toFixed(2) },
        { header: 'المستحق (كتب)', render: p => (p.bookingsDue || 0).toFixed(2) },
        { header: 'المستحق الكلي', render: p => (p.amountDue || 0).toFixed(2) },
        { header: 'المدفوع الكلي', render: p => (p.amountPaid || 0).toFixed(2) },
        { header: 'المتبقي (حصص)', render: p => Math.max(0, (p.sessionsDue || 0) - (p.sessionsPaid || 0)).toFixed(2) },
        { header: 'المتبقي (كتب)', render: p => Math.max(0, (p.bookingsDue || 0) - (p.bookingsPaid || 0)).toFixed(2) },
        { header: 'المتبقي الكلي الحقيقي', render: p =>
          (Math.max(0, (p.sessionsDue || 0) - (p.sessionsPaid || 0)) + Math.max(0, (p.bookingsDue || 0) - (p.bookingsPaid || 0))).toFixed(2)
        },
        { header: 'رصيد فايض (حصص)', render: p => Math.max(0, p.sessionsBalance || 0).toFixed(2) },
        { header: 'رصيد فايض (كتب)', render: p => Math.max(0, p.bookingsBalance || 0).toFixed(2) },
        { header: 'آخر دفعة', key: 'lastPayment' }
      ]
      exportToCSV(r.data.payments, columns, 'payments_export')
    }).catch(() => setMsg({ type: 'error', text: 'فشل تصدير البيانات' }))
  }

  const totalPages = Math.ceil(state.total / PER_PAGE)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">المدفوعات</h1>
          <p className="page-subtitle">إجمالي: {state.total} سجل</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleCSV}><i className="pi pi-download" /> تحميل CSV</button>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type === 'success' ? 'success' : 'error'}`}>
          <i className={`pi pi-${msg.type === 'success' ? 'check-circle' : 'exclamation-circle'}`} />{msg.text}
          <button style={{ marginRight: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title"><i className="pi pi-wallet" /> قائمة المدفوعات</h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input className="form-control" style={{ width: '220px' }} placeholder="بحث برقم أو اسم الطالب..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
            <select className="form-control" style={{ width: '200px' }} value={filterGroupId} onChange={e => setFilterGroupId(e.target.value)}>
              <option value="">-- جميع المجموعات --</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.grade})</option>)}
            </select>
          </div>
        </div>
        {loading ? <div className="spinner-wrapper"><div className="spinner" /></div>
          : state.payments.length === 0
            ? <div className="empty-state"><i className="pi pi-wallet" /><p>لا توجد سجلات مدفوعات</p></div>
            : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>الطالب</th>
                      <th>المجموعة / الصف</th>
                      <th>المستحق</th>
                      <th>المدفوع</th>
                      <th>المتبقي</th>
                      <th>آخر دفعة</th>
                      <th>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.payments.map(p => {
                      // متبقي كل نوع لوحده، منها الرقم الحقيقي مش المطروح من إجمالي مختلط
                      const sessionsRemaining = Math.max(0, (p.sessionsDue || 0) - (p.sessionsPaid || 0))
                      const bookingsRemaining = Math.max(0, (p.bookingsDue || 0) - (p.bookingsPaid || 0))
                      const totalRemaining = sessionsRemaining + bookingsRemaining

                      const sessionsCredit = Math.max(0, p.sessionsBalance || 0)
                      const bookingsCredit = Math.max(0, p.bookingsBalance || 0)
                      const totalCredit = sessionsCredit + bookingsCredit

                      return (
                        <tr key={p.id}>
                          <td>
                            <Link to={`/students/${p.studentId}/dashboard`} style={{ color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 600 }}>
                              {p.student?.name}
                            </Link>
                          </td>
                          <td>
                            {p.student?.group?.name}
                            <span className="text-muted text-sm" style={{ display: 'block' }}>{p.student?.group?.grade}</span>
                          </td>
                          <td>{p.amountDue?.toFixed(2)} ج</td>
                          <td><span className="badge badge-success">{p.amountPaid?.toFixed(2)} ج</span></td>
                          <td>
                            {totalRemaining > 0 ? (
                              <span className="badge badge-danger">{totalRemaining.toFixed(2)} ج</span>
                            ) : totalCredit > 0 ? (
                              <span className="badge badge-success">رصيد: {totalCredit.toFixed(2)} ج</span>
                            ) : (
                              <span className="badge badge-success">0 ج</span>
                            )}
                            {(sessionsCredit > 0 || bookingsCredit > 0) && (
                              <div className="text-muted text-sm" style={{ marginTop: '0.2rem' }}>
                                {sessionsCredit > 0 && <div>رصيد حصص: {sessionsCredit.toFixed(2)} ج</div>}
                                {bookingsCredit > 0 && <div>رصيد كتب: {bookingsCredit.toFixed(2)} ج</div>}
                              </div>
                            )}
                          </td>
                          <td className="text-sm text-muted">{p.lastPayment ? `${p.lastPayment} ج` : '-'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button className="btn btn-success btn-sm" onClick={() => { setPaymentModal(p); setPaymentForm({ amount: '', type: 'sessions' }) }}>
                                <i className="pi pi-plus" /> دفعة
                              </button>
                              <Link to={`/payments/${p.studentId}/history`} className="btn btn-secondary btn-sm">
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
            )
        }
        <Pagination
          totalItems={state.total}
          itemsPerPage={PER_PAGE}
          currentPage={state.page}
          onPageChange={page => load(page)}
        />
      </div>

      {paymentModal && (
        <div className="modal-overlay" onClick={() => setPaymentModal(null)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title"><i className="pi pi-money-bill" /> إضافة دفعة سريعة</h3>
              <button className="modal-close" onClick={() => setPaymentModal(null)}><i className="pi pi-times" /></button>
            </div>
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--surface-ground)', borderRadius: 'var(--border-radius)', fontSize: '0.9rem' }}>
              <strong>الطالب:</strong> {paymentModal.student?.name} <br />
              <strong>المتبقي (حصص):</strong> {Math.max(0, (paymentModal.sessionsDue - paymentModal.sessionsPaid)).toFixed(2)} ج <br />
              <strong>المتبقي (كتب):</strong> {Math.max(0, (paymentModal.bookingsDue - paymentModal.bookingsPaid)).toFixed(2)} ج

              {paymentModal.sessionsBalance > 0 && (
                <div style={{ marginTop: '0.5rem', color: 'var(--success-color)', fontWeight: 'bold' }}>
                  رصيد حصص فايض (لسه محجزتش عليه): {paymentModal.sessionsBalance.toFixed(2)} ج
                </div>
              )}
              {paymentModal.bookingsBalance > 0 && (
                <div style={{ marginTop: '0.3rem', color: 'var(--success-color)', fontWeight: 'bold' }}>
                  رصيد كتب فايض (لسه محجزتش عليه): {paymentModal.bookingsBalance.toFixed(2)} ج
                </div>
              )}
            </div>
            <form onSubmit={handleAddPayment}>
              <div className="form-group">
                <label className="form-label">المبلغ (جنيه)</label>
                <input className="form-control" type="number" min="1" required autoFocus value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">نوع الدفعة</label>
                <select className="form-control" value={paymentForm.type} onChange={e => setPaymentForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="sessions">حصص</option>
                  <option value="book">كتب / مذكرات</option>
                </select>
                <small className="text-muted" style={{ display: 'block', marginTop: '0.5rem' }}>
                  سيتم توزيع المبلغ تلقائياً على مستحقات نفس النوع فقط، وإذا تبقى مبلغ سيُحفظ كرصيد لنفس النوع للمستقبل.
                </small>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary"><i className="pi pi-check" /> دفع</button>
                <button type="button" className="btn btn-secondary" onClick={() => setPaymentModal(null)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}