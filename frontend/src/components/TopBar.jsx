import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { getNetworkInfo } from '../api'

export default function TopBar({ user, onMenuToggle }) {
  const [searchQ, setSearchQ] = useState('')
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? window.navigator.onLine : true)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [networkAddresses, setNetworkAddresses] = useState([])
  const [selectedIp, setSelectedIp] = useState('')
  const [copied, setCopied] = useState(false)
  const navigate = useNavigate()
  const inputRef = useRef(null)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    const q = searchQ.trim()
    if (q) {
      navigate(`/search?q=${encodeURIComponent(q)}`)
      setSearchQ('')
      inputRef.current?.blur()
    }
  }

  const openConnectModal = async () => {
    setShowConnectModal(true)
    try {
      const res = await getNetworkInfo()
      const addrs = res.data.addresses || []
      setNetworkAddresses(addrs)
      if (addrs.length > 0) {
        setSelectedIp(addrs[0].address)
      } else {
        setSelectedIp(window.location.hostname || 'localhost')
      }
    } catch {
      setSelectedIp(window.location.hostname || 'localhost')
    }
  }

  const port = window.location.port || '5173'
  const baseUrl = selectedIp ? `http://${selectedIp}:${port}` : window.location.origin
  const connectUrl = `${baseUrl}/login?connect=true`

  const copyUrl = () => {
    navigator.clipboard.writeText(connectUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <header className="layout-topbar">
      <div className="topbar-left">
        <button
          className="menu-btn-toggle"
          onClick={onMenuToggle}
          style={{ background: 'none', border: 'none', color: 'var(--text-color)', cursor: 'pointer', fontSize: '1.25rem', padding: '0.25rem' }}
        >
          <i className="pi pi-bars" />
        </button>
      </div>

      <form className="topbar-search" onSubmit={handleSearch}>
        <i className="pi pi-search" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }} />
        <input
          ref={inputRef}
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          placeholder="بحث شامل... (اسم / رقم / مجموعة)"
          type="text"
        />
      </form>

      <div className="topbar-right">
        <button
          className="btn btn-sm btn-secondary"
          onClick={openConnectModal}
          title="ربط كاميرا هاتف المساعد باللاب توب بدون نت"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
        >
          <i className="pi pi-mobile" style={{ color: 'var(--primary-color)' }} />
          <span>ربط الموبايل</span>
        </button>

        <span
          title={isOnline ? 'متصل بالسحابة والإنترنت' : 'أوفلاين - يعمل على الشبكة المحلية'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.25rem 0.6rem',
            borderRadius: '12px',
            fontSize: '0.78rem',
            fontWeight: 600,
            background: isOnline ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.15)',
            color: isOnline ? '#10b981' : '#b45309',
            border: `1px solid ${isOnline ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`
          }}
        >
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isOnline ? '#10b981' : '#f59e0b' }} />
          {isOnline ? 'سحابي ومحلي' : 'محلي (أوفلاين)'}
        </span>

        <span style={{ color: 'var(--text-color-secondary)', fontSize: '0.85rem' }}>
          {user?.role === 'teacher' ? '👨‍🏫 معلم' : '🧑‍💼 مساعد'}
        </span>

        <div className="topbar-avatar" title={user?.username}>
          {user?.username?.[0]?.toUpperCase() || 'U'}
        </div>
      </div>

      {/* Modal: Connect Mobile */}
      {showConnectModal && (
        <div className="modal-overlay" onClick={() => setShowConnectModal(false)}>
          <div className="modal" style={{ maxWidth: '440px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ justifyContent: 'space-between' }}>
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="pi pi-mobile" style={{ color: 'var(--primary-color)' }} />
                ربط الهاتف باللاب توب (بدون نت)
              </h3>
              <button className="modal-close" onClick={() => setShowConnectModal(false)}>
                <i className="pi pi-times" />
              </button>
            </div>

            <div style={{ padding: '1rem 0' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-color-secondary)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                امسح الـ QR بكاميرا الهاتف أو ادخل الرابط لفتح المنصة مباشرة من الموبايل وإرسال الحضور للاب توب بدون إنترنت:
              </p>

              {/* QR Code Container */}
              <div style={{
                background: '#ffffff',
                padding: '1rem',
                borderRadius: '16px',
                display: 'inline-block',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                border: '1px solid var(--surface-border)',
                marginBottom: '1.25rem'
              }}>
                <QRCodeSVG value={connectUrl} size={190} level="M" />
              </div>

              {/* IP Selection if multiple interfaces */}
              {networkAddresses.length > 1 && (
                <div style={{ marginBottom: '1rem', textAlign: 'right' }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>اختر عنوان الشبكة:</label>
                  <select
                    className="form-control"
                    value={selectedIp}
                    onChange={e => setSelectedIp(e.target.value)}
                    style={{ fontSize: '0.85rem' }}
                  >
                    {networkAddresses.map(a => (
                      <option key={a.address} value={a.address}>
                        {a.interface}: {a.address}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Link Box */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'var(--surface-ground)',
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--surface-border)',
                marginBottom: '1rem'
              }}>
                <span style={{ direction: 'ltr', fontSize: '0.85rem', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {connectUrl}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={copyUrl}
                  style={{ padding: '0.35rem 0.75rem' }}
                >
                  <i className={`pi ${copied ? 'pi-check' : 'pi-copy'}`} />
                  {copied ? ' تم النسخ' : ' نسخ'}
                </button>
              </div>

              <div style={{
                background: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.2)',
                borderRadius: '8px',
                padding: '0.75rem',
                fontSize: '0.82rem',
                color: 'var(--text-color)',
                textAlign: 'right',
                lineHeight: 1.6
              }}>
                <i className="pi pi-info-circle" style={{ color: '#3b82f6', marginLeft: '0.35rem' }} />
                <strong>شروط الربط السريع:</strong>
                <ul style={{ margin: '0.35rem 0 0', paddingRight: '1.25rem' }}>
                  <li>أن يكون الموبايل متصلاً بنفس راوتر الواي فاي (حتى لو الراوتر بدون نت).</li>
                  <li>أو يفتح اللاب توب <strong>Mobile Hotspot (نقطة اتصال)</strong> ويتصل بها الهاتف.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
