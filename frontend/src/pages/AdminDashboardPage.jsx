import { useEffect, useState } from 'react'
import { getAdminStats } from '../api'
import { Chart } from 'primereact/chart'

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getAdminStats()
      .then(res => setStats(res.data))
      .catch(() => setError('حدث خطأ أثناء تحميل الإحصائيات'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="spinner-wrapper"><div className="spinner" /></div>
  if (error) return <div className="empty-state"><i className="pi pi-exclamation-triangle" /><p>{error}</p></div>

  const revenueChartData = {
    labels: stats.revenueChart.map(r => r.month),
    datasets: [
      {
        label: 'الإيرادات الشهرية (جنيه)',
        data: stats.revenueChart.map(r => r.revenue),
        fill: true,
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.2)',
        tension: 0.4
      }
    ]
  };

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
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">لوحة الإدارة الشاملة</h1>
          <p className="page-subtitle">إحصائيات الأداء المالي والتعليمي للمنصة</p>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        <div className="stat-card" style={{ borderBottom: '4px solid #4f46e5' }}>
          <div className="stat-icon blue"><i className="pi pi-money-bill" /></div>
          <div>
            <div className="stat-value">{stats.totalRevenue?.toLocaleString()} ج</div>
            <div className="stat-label">إجمالي الإيرادات المحصلة</div>
          </div>
        </div>
        
        <div className="stat-card" style={{ borderBottom: '4px solid #f59e0b' }}>
          <div className="stat-icon orange"><i className="pi pi-exclamation-circle" /></div>
          <div>
            <div className="stat-value">{stats.totalDebt?.toLocaleString()} ج</div>
            <div className="stat-label">إجمالي الديون (المتأخرات)</div>
          </div>
        </div>

        <div className="stat-card" style={{ borderBottom: '4px solid #10b981' }}>
          <div className="stat-icon green"><i className="pi pi-users" /></div>
          <div>
            <div className="stat-value">{stats.studentsCount}</div>
            <div className="stat-label">إجمالي الطلاب</div>
          </div>
        </div>

        <div className="stat-card" style={{ borderBottom: '4px solid #3b82f6' }}>
          <div className="stat-icon blue"><i className="pi pi-check-circle" /></div>
          <div>
            <div className="stat-value">{stats.activeStudentsCount}</div>
            <div className="stat-label">الطلاب النشطين</div>
          </div>
        </div>

        <div className="stat-card" style={{ borderBottom: '4px solid #8b5cf6' }}>
          <div className="stat-icon purple"><i className="pi pi-th-large" /></div>
          <div>
            <div className="stat-value">{stats.groupsCount}</div>
            <div className="stat-label">المجموعات الدراسية</div>
          </div>
        </div>

        <div className="stat-card" style={{ borderBottom: '4px solid #ef4444' }}>
          <div className="stat-icon red"><i className="pi pi-calendar" /></div>
          <div>
            <div className="stat-value">{stats.sessionsCount}</div>
            <div className="stat-label">إجمالي الحصص</div>
          </div>
        </div>

        <div className="stat-card" style={{ borderBottom: '4px solid #64748b' }}>
          <div className="stat-icon gray"><i className="pi pi-user" /></div>
          <div>
            <div className="stat-value">{stats.usersCount}</div>
            <div className="stat-label">طاقم العمل (معلمين ومساعدين)</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <div className="card-header">
          <h2 className="card-title"><i className="pi pi-chart-line" /> الأداء المالي للـ 6 أشهر الأخيرة</h2>
        </div>
        <div style={{ height: '400px', width: '100%', padding: '1rem' }}>
          {stats.revenueChart && stats.revenueChart.length > 0 ? (
            <Chart type="line" data={revenueChartData} options={chartOptions} style={{ height: '100%' }} />
          ) : (
            <div className="empty-state"><p>لا توجد بيانات مالية كافية لعرض الرسم البياني</p></div>
          )}
        </div>
      </div>
    </div>
  )
}
