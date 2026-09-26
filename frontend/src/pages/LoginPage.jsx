import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { login, getQuickUsers, setCustomServerUrl } from '../api'
import { useAuth } from '../context/AuthContext'
import { Html5QrcodeScanner } from 'html5-qrcode'

const DEFAULT_USERS = [
  { id: 1, username: 'admin', displayName: 'مستر محمد القماش', role: 'teacher', avatar: '👨‍🏫' },
  { id: 6, username: 'أحمد_المساعد', displayName: 'أحمد المساعد', role: 'assistant', avatar: '🧑‍💼' },
  { id: 10, username: 'سارة_المساعدة', displayName: 'سارة المساعدة', role: 'assistant', avatar: '🧑‍💼' }
]

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setUser, refreshUser } = useAuth()

  // By default: standard login unless opened via QR scan (?connect=true or ?scanned=true)
  const isDirectConnectParam = searchParams.get('connect') === 'true' || searchParams.get('scanned') === 'true'
  const [isScannedMode, setIsScannedMode] = useState(isDirectConnectParam)

  // Users for scanned mode
  const [quickUsers, setQuickUsers] = useState(DEFAULT_USERS)
  const [selectedUser, setSelectedUser] = useState(null)

  // Form state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [scannedAlert, setScannedAlert] = useState(isDirectConnectParam)
  const scannerRef = useRef(null)

  // Fetch live users from server
  const loadUsers = () => {
    getQuickUsers()
      .then(res => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          setQuickUsers(res.data)
        }
      })
      .catch(() => {})
  }

  useEffect(() => {
    loadUsers()
  }, [])

  // QR Scanner for mobile / laptop screen sync
  useEffect(() => {
    if (showScanner) {
      const scanner = new Html5QrcodeScanner(
        'laptop-qr-reader',
        { fps: 12, qrbox: { width: 230, height: 230 } },
        false
      )
      scannerRef.current = scanner

      scanner.render((decodedText) => {
        try {
          const raw = decodedText.trim()
          if (raw.startsWith('http://') || raw.startsWith('https://')) {
            scanner.clear().catch(() => {})
            setShowScanner(false)

            const targetUrl = new URL(raw)

            // Set custom server for Axios API calls
            setCustomServerUrl(targetUrl.origin)

            // Switch to scanned account picker mode
            setIsScannedMode(true)
            setScannedAlert(true)
            loadUsers()
          }
        } catch {
          setShowScanner(false)
        }
      }, () => {})

      return () => {
        scanner.clear().catch(() => {})
      }
    }
  }, [showScanner])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const usernameToLogin = isScannedMode ? selectedUser?.username : username.trim()
    if (!usernameToLogin) {
      setError('يرجى كتابة أو اختيار اسم المستخدم')
      return
    }

    setLoading(true)
    try {
      const res = await login({ username: usernameToLogin, password })
      setUser(res.data)
      await refreshUser().catch(() => res.data)
      let targetRedirect = searchParams.get('redirect') || '/'
      if (res.data?.role === 'assistant' && (
        targetRedirect.includes('teacher-dashboard') ||
        targetRedirect.includes('admin') ||
        targetRedirect.includes('assistants')
      )) {
        targetRedirect = '/'
      }
      navigate(targetRedirect, { replace: true })
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'خطأ في كلمة المرور أو بيانات الدخول')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a1128 0%, #101f42 50%, #070d1f 100%)',
      padding: '1.25rem 1rem'
    }}>
      {/* Ambient glow blobs */}
      <div style={{
        position: 'fixed', top: '-120px', right: '-120px',
        width: '420px', height: '420px',
        background: 'radial-gradient(circle, rgba(30,136,229,0.25) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none'
      }} />
      <div style={{
        position: 'fixed', bottom: '-120px', left: '-120px',
        width: '380px', height: '380px',
        background: 'radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none'
      }} />

      <div style={{
        width: '100%', maxWidth: '440px',
        background: 'linear-gradient(145deg, rgba(17, 34, 68, 0.88), rgba(11, 22, 44, 0.95))',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        borderRadius: '24px',
        padding: '2.25rem 1.85rem',
        backdropFilter: 'blur(24px)',
        boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
        position: 'relative', zIndex: 1
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            width: '72px', height: '72px',
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            borderRadius: '20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 0.85rem',
            boxShadow: '0 10px 25px rgba(29, 78, 216, 0.45)',
            fontSize: '2rem', color: 'white'
          }}>
            <i className="pi pi-graduation-cap" />
          </div>
          <h1 style={{ margin: 0, fontSize: '1.85rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.5px' }}>
            منصة الأستاذ محمد القماش
          </h1>
          <p style={{ margin: '0.4rem 0 0', color: '#94a3b8', fontSize: '0.88rem' }}>
            {isScannedMode ? 'ربط الهاتف وتسجيل الدخول السريع' : 'نظام إدارة الطلاب والدروس والسنتر'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1.25rem', fontSize: '0.9rem', borderRadius: '12px' }}>
            <i className="pi pi-exclamation-circle" />
            {error}
          </div>
        )}

        {/* ======================================================== */}
        {/* CASE 1: SCANNED MODE (AFTER MOBILE SCANS LAPTOP QR)      */}
        {/* ======================================================== */}
        {isScannedMode ? (
          <div>
            {/* Success Banner */}
            <div style={{
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              borderRadius: '14px',
              padding: '0.85rem 1rem',
              color: '#a7f3d0',
              fontSize: '0.88rem',
              marginBottom: '1.35rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem'
            }}>
              <i className="pi pi-check-circle" style={{ color: '#10b981', fontSize: '1.35rem', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, color: '#34d399' }}>تم الاتصال بلاب توب مستر محمد القماش بنجاح!</div>
                <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '2px' }}>
                  اختر حسابك أدناه واكتب الباسورد للربط فوراً
                </div>
              </div>
            </div>

            {/* List of Accounts (if none selected yet) */}
            {!selectedUser && (
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.9rem'
                }}>
                  <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <i className="pi pi-users" style={{ color: '#60a5fa' }} />
                    من أنت؟ اختر حسابك للربط:
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  {quickUsers.map(u => {
                    const isTeacher = u.role === 'teacher'
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => { setSelectedUser(u); setError(''); setPassword(''); }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.95rem 1.1rem',
                          background: isTeacher
                            ? 'linear-gradient(135deg, rgba(37, 99, 235, 0.22), rgba(29, 78, 216, 0.12))'
                            : 'rgba(255, 255, 255, 0.05)',
                          border: isTeacher
                            ? '1.5px solid rgba(59, 130, 246, 0.55)'
                            : '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: '16px',
                          color: '#fff',
                          cursor: 'pointer',
                          textAlign: 'right',
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          width: '100%',
                          boxShadow: isTeacher ? '0 4px 15px rgba(37, 99, 235, 0.15)' : 'none'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = isTeacher
                            ? 'linear-gradient(135deg, rgba(37, 99, 235, 0.35), rgba(29, 78, 216, 0.25))'
                            : 'rgba(255, 255, 255, 0.1)'
                          e.currentTarget.style.transform = 'translateY(-2px)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = isTeacher
                            ? 'linear-gradient(135deg, rgba(37, 99, 235, 0.22), rgba(29, 78, 216, 0.12))'
                            : 'rgba(255, 255, 255, 0.05)'
                          e.currentTarget.style.transform = 'translateY(0)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                          <span style={{
                            fontSize: '1.75rem',
                            width: '44px',
                            height: '44px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: isTeacher ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.07)',
                            borderRadius: '12px'
                          }}>
                            {u.avatar}
                          </span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '1.02rem', color: '#f1f5f9' }}>
                              {u.displayName}
                            </div>
                            <div style={{
                              fontSize: '0.78rem',
                              color: isTeacher ? '#93c5fd' : '#94a3b8',
                              marginTop: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}>
                              <span style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: isTeacher ? '#3b82f6' : '#10b981',
                                display: 'inline-block'
                              }} />
                              {isTeacher ? 'المعلم ورئيس المنصة' : 'مساعد معتمد'}
                            </div>
                          </div>
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          color: '#93c5fd',
                          fontSize: '0.82rem',
                          fontWeight: 600
                        }}>
                          <span>دخول</span>
                          <i className="pi pi-arrow-left" style={{ fontSize: '0.75rem' }} />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Selected User Password Form */}
            {selectedUser && (
              <form onSubmit={handleSubmit}>
                <div style={{
                  background: selectedUser.role === 'teacher' ? 'rgba(37, 99, 235, 0.18)' : 'rgba(16, 185, 129, 0.12)',
                  border: `1.5px solid ${selectedUser.role === 'teacher' ? 'rgba(59, 130, 246, 0.45)' : 'rgba(16, 185, 129, 0.4)'}`,
                  borderRadius: '18px',
                  padding: '1rem 1.15rem',
                  marginBottom: '1.35rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <span style={{ fontSize: '2rem' }}>{selectedUser.avatar}</span>
                    <div>
                      <div style={{ fontWeight: 800, color: '#f8fafc', fontSize: '1.08rem' }}>
                        {selectedUser.displayName}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: selectedUser.role === 'teacher' ? '#93c5fd' : '#86efac', marginTop: '1px' }}>
                        {selectedUser.role === 'teacher' ? 'حساب المعلم الرئيسي' : 'حساب المساعد'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedUser(null); setPassword(''); }}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '8px',
                      color: '#e2e8f0',
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                      padding: '0.35rem 0.65rem'
                    }}
                  >
                    تغيير الحساب
                  </button>
                </div>

                <div className="form-group" style={{ marginBottom: '1.35rem' }}>
                  <label className="form-label" style={{ color: '#e2e8f0', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block' }}>
                    أدخل كلمة المرور لـ ({selectedUser.displayName})
                  </label>
                  <div style={{ position: 'relative' }}>
                    <i className="pi pi-lock" style={{
                      position: 'absolute', right: '1rem', top: '50%',
                      transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.95rem'
                    }} />
                    <input
                      className="form-control"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder={selectedUser.role === 'teacher' ? 'كلمة المرور (مثال: admin 123)' : 'كلمة المرور (مثال: 123)'}
                      required
                      autoFocus
                      style={{
                        paddingRight: '2.6rem',
                        paddingLeft: '2.6rem',
                        fontSize: '16px',
                        height: '48px',
                        borderRadius: '12px',
                        background: 'rgba(255,255,255,0.07)',
                        borderColor: 'rgba(255,255,255,0.15)',
                        color: '#fff'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute', left: '0.85rem', top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none', border: 'none',
                        color: '#94a3b8', cursor: 'pointer', fontSize: '1rem',
                        padding: '0.2rem'
                      }}
                      title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    >
                      <i className={`pi ${showPassword ? 'pi-eye-slash' : 'pi-eye'}`} />
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary w-full"
                  disabled={loading}
                  style={{
                    justifyContent: 'center',
                    padding: '0.9rem',
                    fontSize: '1.02rem',
                    borderRadius: '14px',
                    fontWeight: 700,
                    boxShadow: '0 8px 20px rgba(59, 130, 246, 0.4)'
                  }}
                >
                  {loading ? (
                    <><i className="pi pi-spin pi-spinner" style={{ marginLeft: '0.5rem' }} /> جاري الدخول...</>
                  ) : (
                    <><i className="pi pi-sign-in" style={{ marginLeft: '0.5rem' }} /> دخول وربط الحساب الآن</>
                  )}
                </button>
              </form>
            )}

            {/* Switch back to Standard Login */}
            <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
              <button
                type="button"
                onClick={() => { setIsScannedMode(false); setSelectedUser(null); setError(''); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#93c5fd',
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                ← العودة لتسجيل الدخول العادي
              </button>
            </div>
          </div>
        ) : (
          /* ======================================================== */
          /* CASE 2: STANDARD LOGIN FORM (DEFAULT FOR PC & MOBILE)    */
          /* ======================================================== */
          <div>
            <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: '1.1rem' }}>
                <label className="form-label" style={{ color: '#e2e8f0', fontSize: '0.9rem' }}>اسم المستخدم</label>
                <div style={{ position: 'relative' }}>
                  <i className="pi pi-user" style={{
                    position: 'absolute', right: '1rem', top: '50%',
                    transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.95rem'
                  }} />
                  <input
                    className="form-control"
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="ادخل اسم المستخدم (مثال: admin)"
                    required
                    autoFocus
                    style={{
                      paddingRight: '2.6rem', fontSize: '16px', height: '48px',
                      borderRadius: '12px', background: 'rgba(255,255,255,0.07)',
                      borderColor: 'rgba(255,255,255,0.15)', color: '#fff'
                    }}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.35rem' }}>
                <label className="form-label" style={{ color: '#e2e8f0', fontSize: '0.9rem' }}>كلمة المرور</label>
                <div style={{ position: 'relative' }}>
                  <i className="pi pi-lock" style={{
                    position: 'absolute', right: '1rem', top: '50%',
                    transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.95rem'
                  }} />
                  <input
                    className="form-control"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="ادخل كلمة المرور"
                    required
                    style={{
                      paddingRight: '2.6rem', paddingLeft: '2.6rem', fontSize: '16px',
                      height: '48px', borderRadius: '12px', background: 'rgba(255,255,255,0.07)',
                      borderColor: 'rgba(255,255,255,0.15)', color: '#fff'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute', left: '0.85rem', top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none', border: 'none',
                      color: '#94a3b8', cursor: 'pointer', fontSize: '1rem',
                      padding: '0.2rem'
                    }}
                    title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    <i className={`pi ${showPassword ? 'pi-eye-slash' : 'pi-eye'}`} />
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={loading}
                style={{
                  justifyContent: 'center', padding: '0.9rem',
                  fontSize: '1.02rem', borderRadius: '14px', fontWeight: 700,
                  boxShadow: '0 8px 20px rgba(59, 130, 246, 0.4)'
                }}
              >
                {loading ? <><i className="pi pi-spin pi-spinner" style={{ marginLeft: '0.5rem' }} /> جاري الدخول...</> : <><i className="pi pi-sign-in" style={{ marginLeft: '0.5rem' }} /> تسجيل الدخول</>}
              </button>
            </form>

            {/* Quick Switch to User Picker */}
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={() => { setIsScannedMode(true); setError(''); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#93c5fd',
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                أو الدخول السريع باختيار الحساب (معلم / مساعد)
              </button>
            </div>
          </div>
        )}

        {/* Quick Connect Scanner for Mobile Phone */}
        <div style={{ marginTop: '1.35rem', paddingTop: '1.15rem', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => setShowScanner(true)}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              color: '#f8fafc',
              borderRadius: '14px',
              padding: '0.8rem 1rem',
              fontSize: '0.88rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.6rem',
              width: '100%',
              justifyContent: 'center',
              transition: 'all 0.2s',
              fontWeight: 600
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
          >
            <i className="pi pi-qrcode" style={{ color: '#60a5fa', fontSize: '1.1rem' }} />
            مسح كود شاشة اللاب توب للربط الفوري
          </button>
        </div>

        <p style={{ textAlign: 'center', color: 'rgba(148, 163, 184, 0.6)', fontSize: '0.78rem', marginTop: '1.5rem', marginBottom: 0 }}>
          منصة الأستاذ محمد القماش &copy; {new Date().getFullYear()}
        </p>
      </div>

      {/* QR Scanner Modal for Phone */}
      {showScanner && (
        <div className="modal-overlay" onClick={() => setShowScanner(false)} style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: '380px', textAlign: 'center', background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '20px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem', justifyContent: 'space-between' }}>
              <h3 className="modal-title" style={{ color: '#fff', fontSize: '1.02rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="pi pi-camera" style={{ color: '#3b82f6' }} />
                وجّه الكاميرا نحو كود اللاب توب
              </h3>
              <button className="modal-close" onClick={() => setShowScanner(false)} style={{ color: '#fff' }}>×</button>
            </div>
            <div style={{ padding: '1rem 0' }}>
              <div id="laptop-qr-reader" style={{ width: '100%', margin: '0 auto', overflow: 'hidden', borderRadius: '12px' }}></div>
              <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '0.85rem', lineHeight: 1.6, padding: '0 0.5rem' }}>
                اضغط على زر <strong>"📱 ربط الموبايل"</strong> في أعلى شاشة المنصة باللاب توب، ثم وجّه كاميرا الموبايل نحو الكود ليتم الربط فوراً!
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
