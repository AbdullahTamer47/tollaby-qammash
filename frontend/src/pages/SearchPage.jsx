import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { globalSearch } from '../api'
import { useAuth } from '../context/AuthContext'

export default function SearchPage() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!query) { setLoading(false); return }
    setLoading(true)
    globalSearch(query).then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [query])

  if (loading) return <div className="spinner-wrapper"><div className="spinner" /></div>
  
  if (!query) {
    return (
      <div className="empty-state">
        <i className="pi pi-search" />
        <p>قم بكتابة مصطلح البحث في شريط البحث العلوي</p>
      </div>
    )
  }

  if (!data) return <div className="empty-state"><p>حدث خطأ أثناء البحث</p></div>

  const can = (permission) => user?.role === 'teacher' || user?.permissions?.includes(permission)

  const totalResults = data.students_count + data.groups_count + data.sessions_count + data.exams_count + data.payments_count + data.books_count

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">نتائج البحث عن: "{query}"</h1>
          <p className="page-subtitle">تم العثور على {totalResults} نتيجة</p>
        </div>
      </div>

      {totalResults === 0 && (
        <div className="empty-state">
          <i className="pi pi-search" />
          <p>لم يتم العثور على أي نتائج مطابقة لبحثك</p>
        </div>
      )}

      {/* Students */}
      {data.students_count > 0 && (
        <div className="card">
          <div className="card-header"><h2 className="card-title"><i className="pi pi-users" /> الطلاب ({data.students_count})</h2></div>
          <div className="table-container">
            <table>
              <thead><tr><th>الرقم</th><th>الاسم</th><th>المجموعة</th><th>الحالة</th></tr></thead>
              <tbody>
                {data.students.map(s => (
                  <tr key={s.id}>
                    <td><span className="badge badge-info">{s.id}</span></td>
                    <td><Link to={`/students/${s.id}/dashboard`} style={{ color: '#42a5f5', textDecoration: 'none', fontWeight: 600 }}>{s.name}</Link></td>
                    <td>{s.group?.name}</td>
                    <td><span className={`badge badge-${s.active ? 'success' : 'danger'}`}>{s.active ? 'نشط' : 'غير نشط'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Groups */}
      {data.groups_count > 0 && (
        <div className="card">
          <div className="card-header"><h2 className="card-title"><i className="pi pi-th-large" /> المجموعات ({data.groups_count})</h2></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {data.groups.map(g => (
              <div key={g.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontWeight: 600 }}>{g.name}</div>
                <div className="text-muted text-sm">{g.grade}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sessions */}
      {data.sessions_count > 0 && (
        <div className="card">
          <div className="card-header"><h2 className="card-title"><i className="pi pi-calendar" /> الحصص ({data.sessions_count})</h2></div>
          <div className="table-container">
            <table>
              <thead><tr><th>العنوان</th><th>المجموعة</th><th>التاريخ</th><th>الحضور</th></tr></thead>
              <tbody>
                {data.sessions.map(s => (
                  <tr key={s.id}>
                    <td>{s.title}</td>
                    <td>{s.group?.name}</td>
                    <td>{new Date(s.date).toLocaleDateString('ar-EG')}</td>
                    <td>
                      {can('attendance')
                        ? <Link to={`/sessions/${s.id}/attendance`} className="btn btn-secondary btn-sm"><i className="pi pi-users" /> سجل الحضور</Link>
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Exams */}
      {data.exams_count > 0 && (
        <div className="card">
          <div className="card-header"><h2 className="card-title"><i className="pi pi-pencil" /> الامتحانات ({data.exams_count})</h2></div>
          <div className="table-container">
            <table>
              <thead><tr><th>العنوان</th><th>المجموعة</th><th>الدرجة النهائية</th><th>الرصد</th></tr></thead>
              <tbody>
                {data.exams.map(e => (
                  <tr key={e.id}>
                    <td>{e.title}</td>
                    <td>{e.group?.name}</td>
                    <td>{e.totalDegree}</td>
                    <td><Link to={`/exams/${e.id}/degrees`} className="btn btn-secondary btn-sm"><i className="pi pi-list" /> الدرجات</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payments */}
      {data.payments_count > 0 && (
        <div className="card">
          <div className="card-header"><h2 className="card-title"><i className="pi pi-wallet" /> المدفوعات ({data.payments_count})</h2></div>
          <div className="table-container">
            <table>
              <thead><tr><th>الطالب</th><th>المستحق</th><th>المدفوع</th><th>المتبقي / الرصيد</th><th>السجل</th></tr></thead>
              <tbody>
                {data.payments.map(p => {
                  const remaining = (p.amountDue || 0) - (p.amountPaid || 0)
                  return (
                    <tr key={p.studentId}>
                      <td>{p.student?.name}</td>
                      <td>{p.amountDue?.toFixed(2)} ج</td>
                      <td>{p.amountPaid?.toFixed(2)} ج</td>
                      <td>{remaining >= 0 ? `${remaining.toFixed(2)} ج` : `رصيد ${Math.abs(remaining).toFixed(2)} ج`}</td>
                      <td><Link to={`/payments/${p.studentId}/history`} className="btn btn-secondary btn-sm"><i className="pi pi-history" /> السجل</Link></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Books */}
      {data.books_count > 0 && (
        <div className="card">
          <div className="card-header"><h2 className="card-title"><i className="pi pi-book" /> الكتب ({data.books_count})</h2></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {data.books.map(b => (
              <div key={b.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontWeight: 600 }}>{b.title}</div>
                <div className="text-muted text-sm">{b.grade || 'بدون صف'} - {b.price} ج</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
