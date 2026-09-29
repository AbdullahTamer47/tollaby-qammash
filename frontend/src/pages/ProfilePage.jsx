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

export default function ProfilePage() {
  const { user, setUser } = useAuth()
  const isTeacher = user?.role === 'teacher'

  const [form, setForm] = useState({
    username: user?.username || '',
    currentPassword: '',
    password: '',
    confirmPassword: ''
  })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  const handleUpdate = async (e) => {
    e.preventDefault()
    setMsg(null)

    if (form.password) {
      if (form.password.length < 4) {
        setMsg({ type: 'error', text: 'كلمة المرور يجب أن لا تقل عن 4 أحرف أو أرقام' })
        return
      }
      if (form.password !== form.confirmPassword) {
        setMsg({ type: 'error', text: 'كلمة المرور وتأكيدها غير متطابقين' })
        return
      }
    }

    setLoading(true)
    try {
      const payload = {
        username: form.username
      }
      if (form.currentPassword) {
        payload.currentPassword = form.currentPassword
      }
      if (form.password) {
        payload.password = form.password
      }

      const res = await updateMe(payload)
      setUser(prev => ({ ...prev, username: res.data.username }))
      setMsg({ type: 'success', text: 'تم تحديث بيانات الحساب وكلمة المرور بنجاح!' })
      setForm(prev => ({ ...prev, currentPassword: '', password: '', confirmPassword: '' }))
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'فشل تحديث البيانات، يرجى المحاولة لاحقاً' })
    } finally {
      setLoading(false)
    }
  }

  const permissions = Array.isArray(user?.permissions) ? user.permissions : []

  return (
    <div style={{ maxWidth: '950px', margin: '0 auto', paddingBottom: '2.5rem' }}>
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <i className={`pi ${isTeacher ? 'pi-shield' : 'pi-user'}`} style={{ color: 'var(--primary-color)' }} />
            {isTeacher ? 'حساب المعلم وإعدادات كلمة المرور' : 'معلوماتي الشخصية'}
          </h1>
          <p className="page-subtitle">
            {isTeacher
              ? 'تغيير كلمة المرور وتحديث بيانات حساب الأستاذ محمد القماش للدخول للمنصة'
              : 'بيانات الحساب وتغيير كلمة السر والصلاحيات الممنوحة لك في المنصة'}
          </p>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type}`} style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <i className={`pi ${msg.type === 'success' ? 'pi-check-circle' : 'pi-exclamation-circle'}`} style={{ fontSize: '1.2rem' }} />
          <span style={{ fontWeight: 600 }}>{msg.text}</span>
          <button
            onClick={() => setMsg(null)}
            style={{ marginRight: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.2rem' }}
          >
            ×
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
        {/* User Card */}
        <div className="card" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: isTeacher ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
              fontWeight: 700,
              boxShadow: isTeacher ? '0 4px 15px rgba(16,185,129,0.35)' : '0 4px 15px rgba(59,130,246,0.35)'
            }}>
              {isTeacher ? '👨‍🏫' : (user?.username?.[0]?.toUpperCase() || 'U')}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-color)' }}>
                {isTeacher ? 'مستر محمد القماش' : user?.username}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
                <span className={`badge ${isTeacher ? 'badge-success' : 'badge-info'}`} style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}>
                  {isTeacher ? 'المعلم الرئيسي (مدير المنصة)' : 'مساعد معتمد'}
                </span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-color-secondary)' }}>
                  @{user?.username}
                </span>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '1.25rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <i className="pi pi-verified" style={{ color: isTeacher ? '#10b981' : '#3b82f6' }} />
              صلاحيات الحساب
            </h3>

            {isTeacher ? (
              <div style={{
                background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.25)',
                borderRadius: '12px',
                padding: '0.85rem 1rem',
                color: '#047857',
                fontSize: '0.88rem',
                lineHeight: 1.6
              }}>
                <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>✨ صلاحيات كاملة ومطلقة (Full Admin)</div>
                <span>الوصول الكامل لإحصائيات المنصة، الحصص، المالية، الطلاب، وتعيين المساعدين والتحكم في كلمات المرور.</span>
              </div>
            ) : permissions.length === 0 ? (
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

        {/* Change Password & Profile Form */}
        <div className="card" style={{ padding: '1.75rem' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <i className="pi pi-key" style={{ color: 'var(--primary-color)' }} />
            تغيير كلمة المرور وبيانات الدخول
          </h3>

          <form onSubmit={handleUpdate}>
            <div className="form-group" style={{ marginBottom: '1.1rem' }}>
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.88rem' }}>اسم المستخدم (Username)</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="form-control"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  required
                  placeholder="اسم المستخدم للدخول"
                />
              </div>
              <small style={{ color: 'var(--text-color-secondary)', fontSize: '0.75rem', display: 'block', marginTop: '0.25rem' }}>
                هذا هو الاسم المستخدم لتسجيل الدخول إلى النظام.
              </small>
            </div>

            <div className="form-group" style={{ marginBottom: '1.1rem' }}>
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                كلمة المرور الحالية (اختياري)
              </label>
              <input
                type={showPass ? 'text' : 'password'}
                className="form-control"
                value={form.currentPassword}
                placeholder="أدخل كلمة المرور الحالية لتأكيد الهوية"
                onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1.1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.88rem', margin: 0 }}>
                  كلمة المرور الجديدة
                </label>
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <i className={`pi ${showPass ? 'pi-eye-slash' : 'pi-eye'}`} />
                  <span>{showPass ? 'إخفاء' : 'إظهار'}</span>
                </button>
              </div>
              <input
                type={showPass ? 'text' : 'password'}
                className="form-control"
                value={form.password}
                placeholder="اتركها فارغة إذا كنت لا تريد تغييرها"
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>

            {form.password && (
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                  تأكيد كلمة المرور الجديدة
                </label>
                <input
                  type={showPass ? 'text' : 'password'}
                  className="form-control"
                  value={form.confirmPassword}
                  placeholder="أعد كتابة كلمة المرور الجديدة"
                  onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  required
                />
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '0.75rem',
                fontSize: '0.95rem',
                fontWeight: 700,
                marginTop: '0.5rem',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                boxShadow: '0 4px 12px rgba(37,99,235,0.25)'
              }}
            >
              {loading ? (
                <>
                  <i className="pi pi-spin pi-spinner" />
                  <span>جاري حفظ كلمة المرور...</span>
                </>
              ) : (
                <>
                  <i className="pi pi-save" />
                  <span>حفظ التعديلات وكلمة المرور</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
