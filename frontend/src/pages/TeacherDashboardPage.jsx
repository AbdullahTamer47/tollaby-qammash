import { useEffect, useState } from 'react'
import { getTeacherDashboard, createAssistant } from '../api'

export default function TeacherDashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', password2: '' })
  const [msg, setMsg] = useState(null)

  const load = () => {
    setLoading(true)
    getTeacherDashboard().then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false))
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">لوحة المعلم</h1>
          <p className="page-subtitle">نظرة عامة على اليوم ونشاط المساعدين</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowCreate(true); setMsg(null) }}>
          <i className="pi pi-user-plus" /> إنشاء مساعد
        </button>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type === 'success' ? 'success' : 'error'}`}>
          <i className={`pi pi-${msg.type === 'success' ? 'check-circle' : 'exclamation-circle'}`} />
          {msg.text}
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        {[
          { label: 'إجمالي الطلاب', value: stats?.totalStudents, icon: 'pi pi-users', cls: 'blue' },
          { label: 'المجموعات', value: stats?.totalGroups, icon: 'pi pi-th-large', cls: 'green' },
          { label: 'المساعدون', value: stats?.assistantsCount, icon: 'pi pi-user', cls: 'purple' },
          { label: 'حصص اليوم', value: stats?.sessionsToday, icon: 'pi pi-calendar', cls: 'orange' },
          { label: 'إيرادات اليوم', value: `${(stats?.paymentsTodaySum || 0).toLocaleString()} ج`, icon: 'pi pi-chart-line', cls: 'blue' },
          { label: 'مصروفات اليوم', value: `${(stats?.expensesTodaySum || 0).toLocaleString()} ج`, icon: 'pi pi-money-bill', cls: 'orange' },
          { label: 'صافي اليوم', value: `${(stats?.netToday || 0).toLocaleString()} ج`, icon: 'pi pi-wallet', cls: 'green' },
        ].map((s, i) => (
          <div className="stat-card" key={i}>
            <div className={`stat-icon ${s.cls}`}><i className={s.icon} /></div>
            <div>
              <div className="stat-value">{s.value ?? 0}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        {/* Assistants */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title"><i className="pi pi-users" /> المساعدون</h2>
          </div>
          {assistants?.length === 0
            ? <div className="empty-state"><i className="pi pi-user-minus" /><p>لا يوجد مساعدون</p></div>
            : assistants?.map(a => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.75rem', borderRadius: '8px',
                background: 'rgba(255,255,255,0.04)', marginBottom: '0.5rem'
              }}>
                <div className="topbar-avatar" style={{ width: '36px', height: '36px', fontSize: '0.85rem' }}>
                  {a.username[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{a.username}</div>
                  <div className="text-muted text-sm">
                    انضم {new Date(a.dateJoined).toLocaleDateString('ar-EG')}
                  </div>
                </div>
              </div>
            ))
          }
        </div>

        {/* Recent Logs */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title"><i className="pi pi-history" /> نشاط المساعدين اليوم</h2>
          </div>
          {logs?.length === 0
            ? <div className="empty-state"><i className="pi pi-info-circle" /><p>لا توجد أنشطة اليوم</p></div>
            : (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {logs?.map(log => (
                  <div key={log.id} style={{
                    padding: '0.6rem 0.75rem',
                    borderBottom: '1px solid var(--surface-border)',
                    display: 'flex', alignItems: 'flex-start', gap: '0.75rem'
                  }}>
                    <span className={`badge badge-${log.method === 'POST' ? 'success' : log.method === 'DELETE' ? 'danger' : 'info'}`}>
                      {log.method}
                    </span>
                    <div>
                      <div style={{ fontSize: '0.875rem' }}>{log.action}</div>
                      <div className="text-muted text-sm">
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

      {/* Create Assistant Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">إنشاء مساعد جديد</h3>
              <button className="modal-close" onClick={() => setShowCreate(false)}><i className="pi pi-times" /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">اسم المستخدم</label>
                <input className="form-control" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
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
                <button type="submit" className="btn btn-primary"><i className="pi pi-check" /> إنشاء</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
