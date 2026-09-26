import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { getNetworkInfo } from '../api'

export default function TopBar({ user, onMenuToggle }) {
  const [searchQ, setSearchQ] = useState('')
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? window.navigator.onLine : true)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const isCloudHost = typeof window !== 'undefined' && (
    window.location.hostname.includes('vercel.app') ||
    window.location.protocol === 'https:'
  )
  const [connectMode, setConnectMode] = useState(isCloudHost ? 'cloud' : 'local')
  const [networkAddresses, setNetworkAddresses] = useState([])
  const [selectedIp, setSelectedIp] = useState('192.168.1.12')
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
    if (isCloudHost) {
      setConnectMode('cloud')
    } else {
      setConnectMode('local')
    }
    try {
      const res = await getNetworkInfo()
      if (res.data?.isCloud) {
        setConnectMode('cloud')
      }
      const rawAddrs = res.data.addresses || []
      // Strictly exclude any link-local 169.254.x.x addresses
      const addrs = rawAddrs.filter(a => a.address && !a.address.startsWith('169.254.'))
      setNetworkAddresses(addrs)

      const primary = res.data.primaryAddress && !res.data.primaryAddress.startsWith('169.254.')
        ? res.data.primaryAddress
        : (addrs.length > 0 ? addrs[0].address : '')

      if (primary) {
        setSelectedIp(primary)
      } else if (window.location.hostname && !window.location.hostname.startsWith('169.254.') && !window.location.hostname.includes('vercel.app') && window.location.hostname !== 'localhost') {
        setSelectedIp(window.location.hostname)
      } else {
        setSelectedIp('192.168.1.12')
      }
    } catch {
      setSelectedIp('192.168.1.12')
    }
  }

  // Local network URL (LAN / Hotspot)
  const port = window.location.port || '5173'
  const localUrl = selectedIp ? `http://${selectedIp}:${port}` : window.location.origin
  const localConnectUrl = `${localUrl}/login?connect=true`

  // Cloud URL (Vercel production)
  const cloudUrl = (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app'))
    ? window.location.origin
    : 'https://tollaby-qammash-web.vercel.app'
  const cloudConnectUrl = `${cloudUrl}/login?connect=true`

  // Active URL based on mode
  const connectUrl = connectMode === 'cloud' ? cloudConnectUrl : localConnectUrl

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
          title="ربط كاميرا هاتف المساعد باللاب توب"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
        >
          <i className="pi pi-mobile" style={{ color: 'var(--primary-color)' }} />
          <span>ربط الموبايل</span>
        </button>

        <span
          title={isOnline ? 'متصل بالإنترنت والسحابة' : 'غير متصل بالإنترنت - يعمل على الشبكة المحلية فقط'}
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
          {isOnline ? 'متصل' : 'غير متصل'}
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
          <div className="modal" style={{ maxWidth: '460px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ justifyContent: 'space-between' }}>
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="pi pi-mobile" style={{ color: 'var(--primary-color)' }} />
                ربط الهاتف بالمنصة
              </h3>
              <button className="modal-close" onClick={() => setShowConnectModal(false)}>
                <i className="pi pi-times" />
              </button>
            </div>

            <div style={{ padding: '1rem 0' }}>
              {/* Mode Switcher */}
              <div style={{
                display: 'flex',
                gap: '0.5rem',
                marginBottom: '1.25rem',
                background: 'var(--surface-ground)',
                borderRadius: '12px',
                padding: '0.35rem',
                border: '1px solid var(--surface-border)'
              }}>
                <button
                  type="button"
                  onClick={() => setConnectMode('local')}
                  style={{
                    flex: 1,
                    padding: '0.6rem 0.5rem',
                    borderRadius: '10px',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    background: connectMode === 'local' ? 'var(--primary-color)' : 'transparent',
                    color: connectMode === 'local' ? '#fff' : 'var(--text-color-secondary)',
                    transition: 'all 0.2s'
                  }}
                >
                  <i className="pi pi-wifi" style={{ marginLeft: '0.35rem' }} />
                  شبكة محلية (واي فاي)
                </button>
                <button
                  type="button"
                  onClick={() => setConnectMode('cloud')}
                  style={{
                    flex: 1,
                    padding: '0.6rem 0.5rem',
                    borderRadius: '10px',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    background: connectMode === 'cloud' ? 'var(--primary-color)' : 'transparent',
                    color: connectMode === 'cloud' ? '#fff' : 'var(--text-color-secondary)',
                    transition: 'all 0.2s'
                  }}
                >
                  <i className="pi pi-cloud" style={{ marginLeft: '0.35rem' }} />
                  عبر الإنترنت (سحابي)
                </button>
              </div>

              <p style={{ fontSize: '0.88rem', color: 'var(--text-color-secondary)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                {connectMode === 'local'
                  ? 'امسح الـ QR بكاميرا الهاتف لفتح المنصة مباشرة في متصفح كروم على اللاب توب (Host):'
                  : 'امسح الـ QR بكاميرا الهاتف لفتح المنصة عبر الإنترنت (يعمل من أي مكان):'}
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

              {/* IP Selection if local mode */}
              {connectMode === 'local' && (
                <div style={{ marginBottom: '1rem', textAlign: 'right' }}>
                  <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                    عنوان اللاب توب (Host IP):
                  </label>
                  {networkAddresses.length > 1 ? (
                    <select
                      className="form-control"
                      value={selectedIp}
                      onChange={e => setSelectedIp(e.target.value)}
                      style={{ fontSize: '0.88rem' }}
                    >
                      {networkAddresses.map(a => (
                        <option key={a.address} value={a.address}>
                          {a.interface}: {a.address}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        className="form-control"
                        value={selectedIp}
                        onChange={e => setSelectedIp(e.target.value)}
                        placeholder="192.168.1.12"
                        style={{ fontSize: '0.88rem', direction: 'ltr', textAlign: 'left' }}
                      />
                      <span className="badge badge-success" style={{ whiteSpace: 'nowrap', padding: '0.5rem 0.65rem' }}>
                        متصل بالواي فاي
                      </span>
                    </div>
                  )}
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
                <span style={{ direction: 'ltr', fontSize: '0.82rem', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {connectUrl}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={copyUrl}
                  style={{ padding: '0.35rem 0.75rem', flexShrink: 0 }}
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
                {connectMode === 'local' ? (
                  <>
                    <strong>الشبكة المحلية:</strong>
                    <ul style={{ margin: '0.35rem 0 0', paddingRight: '1.25rem' }}>
                      <li>الموبايل لازم يكون متصل بنفس شبكة الواي فاي.</li>
                      <li>أو افتح <strong>Hotspot</strong> من اللاب توب ووصّل بيه الموبايل.</li>
                      <li>يعمل حتى لو مفيش إنترنت — المهم نفس الشبكة.</li>
                    </ul>
                  </>
                ) : (
                  <>
                    <strong>الربط السحابي:</strong>
                    <ul style={{ margin: '0.35rem 0 0', paddingRight: '1.25rem' }}>
                      <li>يعمل من أي مكان — الموبايل محتاج إنترنت فقط.</li>
                      <li>بيانات المنصة متزامنة في السحابة.</li>
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
