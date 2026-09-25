import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { login } from '../api'
import { useAuth } from '../context/AuthContext'
import { Html5QrcodeScanner } from 'html5-qrcode'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setUser, refreshUser } = useAuth()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const scannerRef = useRef(null)

  useEffect(() => {
    if (showScanner) {
      const scanner = new Html5QrcodeScanner('laptop-qr-reader', { fps: 10, qrbox: { width: 220, height: 220 } }, false)
      scannerRef.current = scanner
      scanner.render((decodedText) => {
        if (decodedText.startsWith('http://') || decodedText.startsWith('https://')) {
          scanner.clear().catch(() => {})
          setShowScanner(false)
          window.location.href = decodedText
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
    setLoading(true)
    try {
      const res = await login(form)
      setUser(res.data)
      await refreshUser().catch(() => res.data)
      navigate(searchParams.get('redirect') || '/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'خطأ في تسجيل الدخول')
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
      background: 'linear-gradient(135deg, #0d1b3e 0%, #1a1a2e 50%, #0d1b3e 100%)',
      padding: '1rem'
    }}>
      {/* Decorative blobs */}
      <div style={{
        position: 'fixed', top: '-100px', right: '-100px',
        width: '400px', height: '400px',
        background: 'radial-gradient(circle, rgba(21,101,192,0.3) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none'
      }} />
      <div style={{
        position: 'fixed', bottom: '-100px', left: '-100px',
        width: '350px', height: '350px',
        background: 'radial-gradient(circle, rgba(66,165,245,0.2) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none'
      }} />

      <div style={{
        width: '100%', maxWidth: '420px',
        background: 'linear-gradient(135deg, rgba(15,52,96,0.7), rgba(13,27,62,0.9))',
        border: '1px solid rgba(30,64,128,0.6)',
        borderRadius: '20px',
        padding: '2.5rem',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        position: 'relative', zIndex: 1
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '72px', height: '72px',
            background: 'linear-gradient(135deg, #42a5f5, #1565c0)',
            borderRadius: '18px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1rem',
            boxShadow: '0 8px 24px rgba(21,101,192,0.4)',
            fontSize: '2rem', color: 'white'
          }}>
            <i className="pi pi-graduation-cap" />
          </div>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: '#e3f2fd' }}>الأستاذ القماش</h1>
          <p style={{ margin: '0.4rem 0 0', color: '#90caf9', fontSize: '0.9rem' }}>نظام إدارة الطلاب والدروس</p>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1.25rem' }}>
            <i className="pi pi-exclamation-circle" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" style={{ color: '#e3f2fd' }}>اسم المستخدم</label>
            <div style={{ position: 'relative' }}>
              <i className="pi pi-user" style={{
                position: 'absolute', right: '0.9rem', top: '50%',
                transform: 'translateY(-50%)', color: '#90caf9', fontSize: '0.9rem'
              }} />
              <input
                className="form-control"
                type="text"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="ادخل اسم المستخدم"
                required
                autoFocus
                style={{ paddingRight: '2.5rem' }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ color: '#e3f2fd' }}>كلمة المرور</label>
            <div style={{ position: 'relative' }}>
              <i className="pi pi-lock" style={{
                position: 'absolute', right: '0.9rem', top: '50%',
                transform: 'translateY(-50%)', color: '#90caf9', fontSize: '0.9rem'
              }} />
              <input
                className="form-control"
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="ادخل كلمة المرور"
                required
                style={{ paddingRight: '2.5rem' }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={loading}
            style={{ justifyContent: 'center', padding: '0.85rem', fontSize: '1rem', marginTop: '0.5rem', borderRadius: '10px' }}
          >
            {loading ? <><i className="pi pi-spin pi-spinner" /> جاري الدخول...</> : <><i className="pi pi-sign-in" /> تسجيل الدخول</>}
          </button>

          {/* Quick Connect Scanner for Mobile APK / Phone */}
          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#e3f2fd',
                borderRadius: '8px',
                padding: '0.65rem 1rem',
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                width: '100%',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
            >
              <i className="pi pi-qrcode" style={{ color: '#42a5f5' }} />
              مسح كود شاشة اللاب توب للربط الفوري
            </button>
          </div>
        </form>

        <p style={{ textAlign: 'center', color: 'rgba(144,202,249,0.5)', fontSize: '0.8rem', marginTop: '1.5rem', marginBottom: 0 }}>
          منصة الأستاذ القماش &copy; {new Date().getFullYear()}
        </p>
      </div>

      {/* QR Scanner Modal for Phone / APK */}
      {showScanner && (
        <div className="modal-overlay" onClick={() => setShowScanner(false)} style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: '380px', textAlign: 'center', background: '#1a1a2e', color: '#fff', border: '1px solid #30475e' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem', justifyContent: 'space-between' }}>
              <h3 className="modal-title" style={{ color: '#fff', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <i className="pi pi-camera" style={{ color: '#42a5f5' }} />
                وجّه الكاميرا نحو كود اللاب توب
              </h3>
              <button className="modal-close" onClick={() => setShowScanner(false)} style={{ color: '#fff' }}>×</button>
            </div>
            <div style={{ padding: '1rem 0' }}>
              <div id="laptop-qr-reader" style={{ width: '100%', margin: '0 auto' }}></div>
              <p style={{ fontSize: '0.8rem', color: '#90caf9', marginTop: '0.75rem', lineHeight: 1.5 }}>
                افتح زر "📱 ربط الموبايل" في اللاب توب ووجّه كاميرا الهاتف نحو الكود للاتصال التلقائي بدون إنترنت
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
