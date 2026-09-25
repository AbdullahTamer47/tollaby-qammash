import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getPaymentHistory } from '../api'
import Pagination from '../components/Pagination'

export default function PaymentHistoryPage() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deletePayModal, setDeletePayModal] = useState(null)
  const [msg, setMsg] = useState(null)

  const [currentPage, setCurrentPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortBy, setSortBy] = useState('date_desc')

  const PER_PAGE = 10;

  const load = () => {
    setLoading(true)
    getPaymentHistory(id)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  const handleDeletePayment = async () => {
    try {
      const { deleteEachPayment } = await import('../api')
      await deleteEachPayment(deletePayModal.id)
      setMsg({ type: 'success', text: 'تم حذف الدفعة بنجاح' })
      setDeletePayModal(null)
      load()
    } catch { setMsg({ type: 'error', text: 'فشل حذف الدفعة' }) }
  }

  const filteredPayments = useMemo(() => {
    if (!data?.eachPayments) return [];
    let list = [...data.eachPayments];

    if (typeFilter !== 'all') {
      list = list.filter(p => p.type === typeFilter);
    }

    list.sort((a, b) => {
      switch (sortBy) {
        case 'date_asc':
          return new Date(a.lastPaymentDate) - new Date(b.lastPaymentDate);
        case 'amount_desc':
          return (b.amount || 0) - (a.amount || 0);
        case 'amount_asc':
          return (a.amount || 0) - (b.amount || 0);
        case 'date_desc':
        default:
          return new Date(b.lastPaymentDate) - new Date(a.lastPaymentDate);
      }
    });

    return list;
  }, [data, typeFilter, sortBy]);

  const paginatedPayments = useMemo(() => {
    const start = (currentPage - 1) * PER_PAGE;
    return filteredPayments.slice(start, start + PER_PAGE);
  }, [filteredPayments, currentPage]);

  const handleTypeFilterChange = (value) => {
    setTypeFilter(value);
    setCurrentPage(1);
  };

  const handleSortChange = (value) => {
    setSortBy(value);
    setCurrentPage(1);
  };

  if (loading) return <div className="spinner-wrapper"><div className="spinner" /></div>
  if (!data) return <div className="empty-state"><i className="pi pi-wallet" /><p>تاريخ الدفع غير متاح</p></div>

  const { student, payment, eachPayments } = data
  const sessionsRemaining = payment?.sessionsDue - payment?.sessionsPaid
  const bookingsRemaining = payment?.bookingsDue - payment?.bookingsPaid

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">سجل المدفوعات</h1>
          <p className="page-subtitle">
            <Link to={`/students/${student.id}/dashboard`} style={{ color: '#42a5f5', textDecoration: 'none' }}>{student.name}</Link>
            <span className="badge badge-info" style={{ marginLeft: '0.5rem', marginRight: '0.5rem' }}>#{student.id}</span>
            {student.group?.name}
          </p>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type === 'success' ? 'success' : 'error'}`}>
          <i className={`pi pi-${msg.type === 'success' ? 'check-circle' : 'exclamation-circle'}`} />
          {msg.text}
          <button style={{ marginRight: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setMsg(null)}>
            <i className="pi pi-times" />
          </button>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue"><i className="pi pi-book" /></div>
          <div>
            <div className="stat-value">{payment?.sessionsDue?.toFixed(0)}</div>
            <div className="stat-label">مستحق الحصص (جنيه)</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><i className="pi pi-check-circle" /></div>
          <div>
            <div className="stat-value">{Math.abs(sessionsRemaining || 0).toFixed(0)}</div>
            <div className="stat-label">{sessionsRemaining < 0 ? 'رصيد حصص فايض (جنيه)' : 'متبقي الحصص (جنيه)'}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple"><i className="pi pi-book" /></div>
          <div>
            <div className="stat-value">{payment?.bookingsDue?.toFixed(0)}</div>
            <div className="stat-label">مستحق الكتب (جنيه)</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><i className="pi pi-wallet" /></div>
          <div>
            <div className="stat-value">{Math.abs(bookingsRemaining || 0).toFixed(0)}</div>
            <div className="stat-label">{bookingsRemaining < 0 ? 'رصيد كتب فايض (جنيه)' : 'متبقي الكتب (جنيه)'}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <h2 className="card-title"><i className="pi pi-list" /> الدفعات المسجلة</h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <select
                className="form-control"
                value={typeFilter}
                onChange={e => handleTypeFilterChange(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="all">كل الأنواع</option>
                <option value="sessions">حصص</option>
                <option value="book">كتب</option>
              </select>
              <select
                className="form-control"
                value={sortBy}
                onChange={e => handleSortChange(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="date_desc">الأحدث أولاً</option>
                <option value="date_asc">الأقدم أولاً</option>
                <option value="amount_desc">المبلغ (الأعلى)</option>
                <option value="amount_asc">المبلغ (الأقل)</option>
              </select>
            </div>
        </div>
        {eachPayments.length === 0
          ? <div className="empty-state"><i className="pi pi-money-bill" /><p>لا توجد دفعات مسجلة</p></div>
          : filteredPayments.length === 0
          ? <div className="empty-state"><i className="pi pi-filter-slash" /><p>لا توجد دفعات مطابقة للفلتر المحدد</p></div>
          : (
            <>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>المبلغ (جنيه)</th>
                      <th>النوع</th>
                      <th>التاريخ</th>
                      <th>الوقت</th>
                      <th>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPayments.map(p => {
                      const date = new Date(p.lastPaymentDate)
                      return (
                        <tr key={p.id}>
                          <td><span className="badge badge-success">{p.amount?.toFixed(0)} ج</span></td>
                          <td>
                            {p.targetName && (
                              <div className="text-muted text-sm" style={{ marginTop: '0.2rem' }}>{p.targetName}</div>
                            )}
                          </td>
                          <td>{date.toLocaleDateString('ar-EG')}</td>
                          <td className="text-muted text-sm">{date.toLocaleTimeString('ar-EG')}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeletePayModal(p)}>
                                <i className="pi pi-trash" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination 
                totalItems={filteredPayments.length} 
                itemsPerPage={PER_PAGE} 
                currentPage={currentPage} 
                onPageChange={setCurrentPage} 
              />
            </>
          )
        }
      </div>

      {/* Delete Payment Confirm */}
      {deletePayModal && (
        <div className="modal-overlay" onClick={() => setDeletePayModal(null)}>
          <div className="modal" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: 'var(--danger-color)' }}><i className="pi pi-exclamation-triangle" /> تأكيد الحذف</h3>
              <button className="modal-close" onClick={() => setDeletePayModal(null)}><i className="pi pi-times" /></button>
            </div>
            <p>هل أنت متأكد من حذف دفعة <strong>{deletePayModal.amount} جنيه</strong> ({deletePayModal.type === 'book' ? 'كتب' : 'حصص'})؟ سيتم تعديل المتبقي أوتوماتيكياً.</p>
            <div className="modal-footer">
              <button className="btn btn-danger" onClick={handleDeletePayment}><i className="pi pi-trash" /> حذف</button>
              <button className="btn btn-secondary" onClick={() => setDeletePayModal(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}