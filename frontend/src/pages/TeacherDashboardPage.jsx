import { useEffect, useState } from 'react'
import { getTeacherDashboard, getAdminStats, createAssistant } from '../api'
import { Chart } from 'primereact/chart'
import { Link } from 'react-router-dom'

export default function TeacherDashboardPage() {
  const [data, setData] = useState(null)
  const [adminStats, setAdminStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', password2: '' })
  const [msg, setMsg] = useState(null)

  const load = () => {
    setLoading(true)
    Promise.allSettled([
      getTeacherDashboard(),
      getAdminStats()
    ]).then(([teacherRes, adminRes]) => {
      if (teacherRes.status === 'fulfilled') setData(teacherRes.value.data)
      if (adminRes.status === 'fulfilled') setAdminStats(adminRes.value.data)
    }).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (form.password !== form.password2) return setMsg({ type: 'error', text: 'كلمتا المرور غير متطابقتين' })
    try {
      await createAssistant({ username: form.username, password: form.password })
      setMsg({ type: 'success', text: `تم إنشاء الحساب بنجاح: ${form.username}` })
      setForm({ username: '', password: '', password2: '' })
      setShowCreate(false)
      load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'خطأ' })
    }
  }

  if (loading) return <div className="spinner-wrapper"><div className="spinner" /></div>
  const { stats, assistants, logs } = data || {}

  const revenueChartData = adminStats?.revenueChart ? {
    labels: adminStats.revenueChart.map(r => r.month),
    datasets: [
      {
        label: 'الإيرادات الشهرية (جنيه)',
        data: adminStats.revenueChart.map(r => r.revenue),
        fill: true,
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.2)',
        tension: 0.4
      }
    ]
  } : null

  const chartOptions = {
    maintainAspectRatio: false,
    aspectRatio: 0.6,
    plugins: {
      legend: { labels: { color: 'var(--text-color)' } }
    },
    scales: {
      x: { ticks: { color: 'var(--text-color-secondary)' }, grid: { color: 'var(--surface-border)' } },
      y: { ticks: { color: 'var(--text-color-secondary)' }, grid: { color: 'var(--surface-border)' } }
    }
  }

  return (
    <div>
      <div className="page-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">لوحة التحكم والإحصائيات الشاملة</h1>
          <p className="page-subtitle">متابعة الأداء اليومي والمالي ونشاط المنصة للأستاذ محمد القماش</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={load} title="تحديث البيانات اللحظية">
            <i className="pi pi-refresh" /> تحديث
          </button>
          <button className="btn btn-primary" onClick={() => { setShowCreate(true); setMsg(null) }}>
            <i className="pi pi-user-plus" /> إنشاء مساعد جديد
          </button>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type === 'success' ? 'success' : 'error'}`}>
          <i className={`pi pi-${msg.type === 'success' ? 'check-circle' : 'exclamation-circle'}`} />
          {msg.text}
        </div>
      )}

      {/* القسم 1: نبض اليوم (Today's Live Snapshot) */}
      <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <i className="pi pi-bolt" style={{ color: '#f59e0b' }} /> نبض اليوم اللحظي
      </h3>
      <div className="stats-grid" style={{ marginBottom: '1.75rem' }}>
        <div className="stat-card" style={{ borderRight: '4px solid #3b82f6' }}>
          <div className="stat-icon blue"><i className="pi pi-calendar" /></div>
          <div>
            <div className="stat-value">{stats?.sessionsToday ?? 0}</div>
            <div className="stat-label">حصص اليوم</div>
          </div>
        </div>
        <div className="stat-card" style={{ borderRight: '4px solid #10b981' }}>
          <div className="stat-icon green"><i className="pi pi-money-bill" /></div>
          <div>
            <div className="stat-value">{(stats?.paymentsTodaySum || 0).toLocaleString()} ج</div>
            <div className="stat-label">إيرادات اليوم</div>
          </div>
        </div>
        <div className="stat-card" style={{ borderRight: '4px solid #f97316' }}>
          <div className="stat-icon orange"><i className="pi pi-receipt" /></div>
          <div>
            <div className="stat-value">{(stats?.expensesTodaySum || 0).toLocaleString()} ج</div>
            <div className="stat-label">مصروفات اليوم</div>
          </div>
        </div>
        <div className="stat-card" style={{ borderRight: '4px solid #8b5cf6' }}>
          <div className="stat-icon purple"><i className="pi pi-wallet" /></div>
          <div>
            <div className="stat-value" style={{ color: (stats?.netToday || 0) >= 0 ? '#10b981' : '#ef4444' }}>
              {(stats?.netToday || 0).toLocaleString()} ج
            </div>
            <div className="stat-label">صافي ربح اليوم</div>
          </div>
        </div>
      </div>

      {/* القسم 2: إحصائيات المنصة الكلية والمالية (Merged Admin Stats) */}
      <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <i className="pi pi-chart-pie" style={{ color: '#4f46e5' }} /> إحصائيات الأداء العام والمالي
      </h3>
      <div className="stats-grid" style={{ marginBottom: '1.75rem' }}>
        <div className="stat-card">
          <div className="stat-icon blue"><i className="pi pi-users" /></div>
          <div>
            <div className="stat-value">{adminStats?.studentsCount ?? stats?.totalStudents ?? 0}</div>
            <div className="stat-label">إجمالي الطلاب المقيدين</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><i className="pi pi-check-circle" /></div>
          <div>
            <div className="stat-value">{adminStats?.activeStudentsCount ?? 0}</div>
            <div className="stat-label">الطلاب النشطين</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><i className="pi pi-th-large" /></div>
          <div>
            <div className="stat-value">{adminStats?.groupsCount ?? stats?.totalGroups ?? 0}</div>
            <div className="stat-label">المجموعات الدراسية</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple"><i className="pi pi-id-card" /></div>
          <div>
            <div className="stat-value">{stats?.assistantsCount ?? 0}</div>
            <div className="stat-label">المساعدين في الفريق</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><i className="pi pi-calculator" /></div>
          <div>
            <div className="stat-value">{(adminStats?.totalRevenue || 0).toLocaleString()} ج</div>
            <div className="stat-label">إجمالي الإيرادات الكلية</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><i className="pi pi-exclamation-circle" /></div>
          <div>
            <div className="stat-value" style={{ color: '#f59e0b' }}>{(adminStats?.totalDebt || 0).toLocaleString()} ج</div>
            <div className="stat-label">المتأخرات والديون</div>
          </div>
        </div>
      </div>

      {/* القسم 3: الرسم البياني للأداء المالي */}
      {revenueChartData && (
        <div className="card" style={{ marginBottom: '1.75rem' }}>
          <div className="card-header" style={{ justifyContent: 'space-between' }}>
            <h2 className="card-title"><i className="pi pi-chart-line" /> تطور الإيرادات الشهرية</h2>
            <Link to="/payments" className="btn btn-sm btn-secondary" style={{ fontSize: '0.8rem' }}>
              سجل المدفوعات <i className="pi pi-arrow-left" style={{ marginRight: '0.25rem' }} />
            </Link>
          </div>
          <div style={{ height: '320px', width: '100%', padding: '0.5rem 0' }}>
            <Chart type="line" data={revenueChartData} options={chartOptions} style={{ height: '100%' }} />
          </div>
        </div>
      )}

      {/* القسم 4: المساعدون ونشاطهم الحي */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {/* Assistants List */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header" style={{ justifyContent: 'space-between' }}>
            <h2 className="card-title"><i className="pi pi-users" /> طاقم المساعدين</h2>
            <Link to="/assistants" className="btn btn-sm btn-secondary" style={{ fontSize: '0.8rem' }}>
              إدارة الصلاحيات
            </Link>
          </div>
          {assistants?.length === 0
            ? <div className="empty-state"><i className="pi pi-user-minus" /><p>لا يوجد مساعدون مسجلون بعد</p></div>
            : assistants?.map(a => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem', borderRadius: '10px',
                background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)',
                marginBottom: '0.5rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div className="topbar-avatar" style={{ width: '38px', height: '38px', fontSize: '0.88rem' }}>
                    {a.username[0]?.toUpperCase() || 'A'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{a.username}</div>
                    <div className="text-muted text-sm">
                      انضم {new Date(a.dateJoined).toLocaleDateString('ar-EG')}
                    </div>
                  </div>
                </div>
                <span className="badge badge-info">مساعد</span>
              </div>
            ))
          }
        </div>

        {/* Live Action Logs */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <h2 className="card-title"><i className="pi pi-history" /> سجل نشاط المساعدين اللحظي</h2>
          </div>
          {logs?.length === 0
            ? <div className="empty-state"><i className="pi pi-info-circle" /><p>لا توجد أنشطة مسجلة لليوم</p></div>
            : (
              <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                {logs?.map(log => (
                  <div key={log.id} style={{
                    padding: '0.65rem 0.5rem',
                    borderBottom: '1px solid var(--surface-border)',
                    display: 'flex', alignItems: 'center', gap: '0.75rem'
                  }}>
                    <span className={`badge badge-${log.method === 'POST' ? 'success' : log.method === 'DELETE' ? 'danger' : 'info'}`} style={{ fontSize: '0.72rem' }}>
                      {log.method}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 500 }}>{log.action}</div>
                      <div className="text-muted text-sm" style={{ fontSize: '0.78rem' }}>
                        {log.username} · {new Date(log.createdAt).toLocaleTimeString('ar-EG')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      </div>

      {/* Modal: Create Assistant */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">إنشاء مساعد جديد</h3>
              <button className="modal-close" onClick={() => setShowCreate(false)}><i className="pi pi-times" /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">اسم المستخدم (المساعد)</label>
                <input className="form-control" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="مثال: أحمد_المساعد" required />
              </div>
              <div className="form-group">
                <label className="form-label">كلمة المرور</label>
                <input className="form-control" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">تأكيد كلمة المرور</label>
                <input className="form-control" type="password" value={form.password2} onChange={e => setForm(f => ({ ...f, password2: e.target.value }))} required />
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary"><i className="pi pi-check" /> إنشاء الحساب</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
