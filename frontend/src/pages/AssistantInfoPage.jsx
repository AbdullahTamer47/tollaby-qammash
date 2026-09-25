import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { updateMe } from '../api'

const PERM_LABELS = {
  students: { label: 'إدارة الطلاب', icon: 'pi-users', color: '#3b82f6' },
  groups: { label: 'إدارة المجموعات', icon: 'pi-th-large', color: '#8b5cf6' },
  sessions: { label: 'إدارة الحصص', icon: 'pi-calendar', color: '#10b981' },
  attendance: { label: 'الحضور والغياب', icon: 'pi-check-square', color: '#f59e0b' },
  payments: { label: 'إدارة المدفوعات', icon: 'pi-wallet', color: '#06b6d4' },
  exams: { label: 'الامتحانات والدرجات', icon: 'pi-pencil', color: '#ec4899' },
  books: { label: 'الكتب والمذكرات', icon: 'pi-book', color: '#6366f1' }
}

export default function AssistantInfoPage() {
  const { user, setUser } = useAuth()
  const [form, setForm] = useState({
    username: user?.username || '',
    password: '',
    confirmPassword: ''
  })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  const handleUpdate = async (e) => {
    e.preventDefault()
    setMsg(null)

    if (form.password && form.password !== form.confirmPassword) {
      setMsg({ type: 'error', text: 'كلمة المرور وتأكيدها غير متطابقين' })
      return
    }

    setLoading(true)
    try {
      const payload = { username: form.username }
      if (form.password) {
        payload.password = form.password
      }
      const res = await updateMe(payload)
      setUser(prev => ({ ...prev, username: res.data.username }))
      setMsg({ type: 'success', text: 'تم تحديث البيانات بنجاح' })
      setForm(prev => ({ ...prev, password: '', confirmPassword: '' }))
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'فشل تحديث البيانات' })
    } finally {
      setLoading(false)
    }
  }

  const permissions = Array.isArray(user?.permissions) ? user.permissions : []

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', paddingBottom: '2rem' }}>
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title"><i className="pi pi-user" /> معلوماتي الشخصية</h1>
          <p className="page-subtitle">بيانات الحساب والصلاحيات الممنوحة لك في المنصة</p>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type}`} style={{ marginBottom: '1.5rem' }}>
          <i className={`pi ${msg.type === 'success' ? 'pi-check-circle' : 'pi-exclamation-circle'}`} />
          {msg.text}
          <button
            onClick={() => setMsg(null)}
            style={{ marginRight: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* User Card */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.75rem',
              fontWeight: 700,
              boxShadow: '0 4px 12px rgba(59,130,246,0.3)'
            }}>
              {user?.username?.[0]?.toUpperCase() || 'A'}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>{user?.username}</h2>
              <span className="badge badge-info" style={{ marginTop: '0.25rem', display: 'inline-block' }}>
                {user?.role === 'teacher' ? 'معلم' : 'مساعد معتمد'}
              </span>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              <i className="pi pi-shield" style={{ marginLeft: '0.5rem', color: 'var(--primary-color)' }} />
              الصلاحيات المتاحة لك
            </h3>

            {permissions.length === 0 ? (
              <p className="text-muted" style={{ fontSize: '0.9rem' }}>لا توجد صلاحيات مخصصة حالياً (تواصل مع الأستاذ لتفعيل الصلاحيات المطلوبة).</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {permissions.map(perm => {
                  const item = PERM_LABELS[perm] || { label: perm, icon: 'pi-check', color: '#64748b' }
                  return (
                    <span
                      key={perm}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        padding: '0.4rem 0.75rem',
                        borderRadius: '20px',
                        background: 'var(--surface-ground, #f1f5f9)',
                        color: 'var(--text-color, #1e293b)',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        border: '1px solid var(--surface-border)'
                      }}
                    >
                      <i className={`pi ${item.icon}`} style={{ color: item.color }} />
                      {item.label}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Edit Profile Form */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>
            <i className="pi pi-lock" style={{ marginLeft: '0.5rem', color: 'var(--primary-color)' }} />
            تعديل بيانات الحساب
          </h3>

          <form onSubmit={handleUpdate}>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">اسم المستخدم</label>
              <input
                type="text"
                className="form-control"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">كلمة المرور الجديدة (اتركها فارغة إن لم ترغب في التغيير)</label>
              <input
                type="password"
                className="form-control"
                value={form.password}
                placeholder="••••••••"
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>

            {form.password && (
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">تأكيد كلمة المرور الجديدة</label>
                <input
                  type="password"
                  className="form-control"
                  value={form.confirmPassword}
                  placeholder="••••••••"
                  onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  required
                />
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}
            >
              {loading ? <><i className="pi pi-spin pi-spinner" /> جاري الحفظ...</> : <><i className="pi pi-save" /> حفظ التعديلات</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
