import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getStudents, getGroups, getSessions, getPayments } from '../api'
import { useAuth } from '../context/AuthContext'

export default function DashboardPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const can = (permission) => user?.role === 'teacher' || user?.permissions?.includes(permission)

  useEffect(() => {
    const requests = {
      students: can('students') ? getStudents({ per_page: 1, skipGlobalError: true }) : Promise.resolve(null),
      groups: can('groups') ? getGroups({ skipGlobalError: true }) : Promise.resolve(null),
      sessions: can('sessions') ? getSessions({ all: true, skipGlobalError: true }) : Promise.resolve(null),
      payments: can('payments') ? getPayments({ per_page: 1, skipGlobalError: true }) : Promise.resolve(null)
    }
    Promise.allSettled(Object.values(requests)).then(results => {
      const [s, g, sess, p] = results.map(result => result.status === 'fulfilled' ? result.value : null)
      setStats({
        students: s?.data?.total ?? null,
        groups: g?.data?.length ?? null,
        sessions: Array.isArray(sess?.data) ? sess.data.length : sess?.data?.sessions?.length ?? null,
        payments: p?.data?.total ?? null
      })
    }).finally(() => setLoading(false))
  }, [user])

  if (loading) return <div className="spinner-wrapper"><div className="spinner" /></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">لوحة التحكم</h1>
          <p className="page-subtitle">مرحباً بك في نظام إدارة الطلاب</p>
        </div>
      </div>

      <div className="stats-grid">
        {can('students') && <Link to="/students" style={{ textDecoration: 'none' }}>
          <div className="stat-card">
            <div className="stat-icon blue"><i className="pi pi-users" /></div>
            <div>
              <div className="stat-value">{stats?.students ?? '-'}</div>
              <div className="stat-label">إجمالي الطلاب</div>
            </div>
          </div>
        </Link>}
        {can('groups') && <Link to="/groups" style={{ textDecoration: 'none' }}>
          <div className="stat-card">
            <div className="stat-icon green"><i className="pi pi-th-large" /></div>
            <div>
              <div className="stat-value">{stats?.groups ?? '-'}</div>
              <div className="stat-label">المجموعات</div>
            </div>
          </div>
        </Link>}
        {can('sessions') && <Link to="/sessions" style={{ textDecoration: 'none' }}>
          <div className="stat-card">
            <div className="stat-icon orange"><i className="pi pi-calendar" /></div>
            <div>
              <div className="stat-value">{stats?.sessions ?? '-'}</div>
              <div className="stat-label">الحصص</div>
            </div>
          </div>
        </Link>}
        {can('payments') && <Link to="/payments" style={{ textDecoration: 'none' }}>
          <div className="stat-card">
            <div className="stat-icon purple"><i className="pi pi-wallet" /></div>
            <div>
              <div className="stat-value">{stats?.payments ?? '-'}</div>
              <div className="stat-label">سجلات المدفوعات</div>
            </div>
          </div>
        </Link>}
      </div>

      {/* Quick links */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title"><i className="pi pi-bolt" /> وصول سريع</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
          {[
            { to: '/students', icon: 'pi pi-user-plus', label: 'إضافة طالب', color: '#1565c0', permission: 'students' },
            { to: '/sessions', icon: 'pi pi-calendar-plus', label: 'إدارة الحصص', color: '#2e7d32', permission: 'sessions' },
            { to: '/payments', icon: 'pi pi-money-bill', label: 'المدفوعات', color: '#e65100', permission: 'payments' },
            { to: '/exams', icon: 'pi pi-pencil', label: 'الامتحانات', color: '#6a1b9a', permission: 'exams' },
            { to: '/books', icon: 'pi pi-book', label: 'الكتب', color: '#00695c', permission: 'books' },
            { to: '/qrcodes', icon: 'pi pi-barcode', label: 'الباركود', color: '#37474f', permission: 'students' },
          ].filter(item => !item.permission || can(item.permission)).map(item => (
            <Link key={item.to} to={item.to} style={{ textDecoration: 'none' }}>
              <div style={{
                background: `linear-gradient(135deg, ${item.color}33, ${item.color}11)`,
                border: `1px solid ${item.color}44`,
                borderRadius: '12px',
                padding: '1.25rem',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                onMouseLeave={e => e.currentTarget.style.transform = ''}
              >
                <i className={item.icon} style={{ fontSize: '1.5rem', color: item.color, display: 'block', marginBottom: '0.5rem' }} />
                <span style={{ color: 'var(--text-color)', fontWeight: 600 }}>{item.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
