import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { getNetworkInfo, getOfflineQueue, syncOfflineNow } from '../api'
import SmartCameraModal from './SmartCameraModal'

export default function TopBar({ user, onMenuToggle }) {
  const [searchQ, setSearchQ] = useState('')
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? window.navigator.onLine : true)
  const [pendingCount, setPendingCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [cameraModalMode, setCameraModalMode] = useState(null) // null | 'live_attendance' | 'search_lookup'
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
    const updateStatus = () => {
      setIsOnline(typeof window !== 'undefined' ? window.navigator.onLine : true)
      setPendingCount(getOfflineQueue().length)
    }
    updateStatus()

    const handleQueueChanged = (e) => setPendingCount(e.detail?.count ?? getOfflineQueue().length)
    const handleSyncStarted = () => setIsSyncing(true)
    const handleSynced = () => {
      setIsSyncing(false)
      setPendingCount(getOfflineQueue().length)
    }

    window.addEventListener('online', updateStatus)
    window.addEventListener('offline', updateStatus)
    window.addEventListener('offline-queue-changed', handleQueueChanged)
    window.addEventListener('offline-sync-started', handleSyncStarted)
    window.addEventListener('offline-synced', handleSynced)

    return () => {
      window.removeEventListener('online', updateStatus)
      window.removeEventListener('offline', updateStatus)
      window.removeEventListener('offline-queue-changed', handleQueueChanged)
      window.removeEventListener('offline-sync-started', handleSyncStarted)
      window.removeEventListener('offline-synced', handleSynced)
    }
  }, [])

  const handleManualSync = async () => {
    if (isSyncing || pendingCount === 0) return
    setIsSyncing(true)
    try {
      await syncOfflineNow()
    } finally {
      setIsSyncing(false)
      setPendingCount(getOfflineQueue().length)
    }
  }

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
  // Ensure HTTPS is used for LAN so mobile browsers allow camera permissions (Secure Context)
  const isSslHost = typeof window !== 'undefined' && (window.location.protocol === 'https:' || window.location.port === '5173')
  const protocol = isSslHost ? 'https:' : (typeof window !== 'undefined' ? window.location.protocol : 'https:')
  const port = typeof window !== 'undefined' && window.location.port ? window.location.port : '5173'
  const localUrl = selectedIp ? `${protocol}//${selectedIp}:${port}` : (typeof window !== 'undefined' ? window.location.origin : '')
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
          placeholder="بحث شامل... (اسم / كود / هاتف الطالب أو ولي الأمر)"
          type="text"
        />
      </form>

      <div className="topbar-right">
        {/* Camera 1: Live Attendance & Fast Pay */}
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setCameraModalMode('live_attendance')}
          title="كاميرا تسجيل حضور الحصة الجارية مع دفع تلقائي وسريع"
          style={{
            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
            color: '#ffffff',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.35rem 0.75rem',
            fontSize: '0.82rem',
            border: 'none',
            boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
          }}
        >
          <i className="pi pi-camera" />
          <span>حضور الحصة</span>
        </button>

        {/* Camera 2: QR Search Lookup */}
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => setCameraModalMode('search_lookup')}
          title="مسح كود QR للبحث عن الطالب وفتح بروفايله مباشرة"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
        >
          <i className="pi pi-qrcode" style={{ color: 'var(--primary-color)' }} />
          <span>بحث QR</span>
        </button>

        <button
          className="btn btn-sm btn-secondary"
          onClick={openConnectModal}
          title="ربط كاميرا هاتف المساعد باللاب توب"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
        >
          <i className="pi pi-mobile" style={{ color: 'var(--primary-color)' }} />
          <span>ربط الموبايل</span>
        </button>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <span
            title={
              !isOnline
                ? 'أوفلاين: التطبيق يعمل بكفاءة بدون إنترنت ويحفظ العمليات محلياً'
                : pendingCount > 0
                  ? `يوجد ${pendingCount} عمليات محفوظة محلياً بانتظار المزامنة`
                  : 'متصل بالسيرفر والسحابة'
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.28rem 0.65rem',
              borderRadius: '14px',
              fontSize: '0.78rem',
              fontWeight: 600,
              background: !isOnline
                ? 'rgba(239, 68, 68, 0.12)'
                : pendingCount > 0
                  ? 'rgba(245, 158, 11, 0.15)'
                  : 'rgba(16, 185, 129, 0.12)',
              color: !isOnline
                ? '#ef4444'
                : pendingCount > 0
                  ? '#d97706'
                  : '#10b981',
              border: `1px solid ${
                !isOnline
                  ? 'rgba(239, 68, 68, 0.25)'
                  : pendingCount > 0
                    ? 'rgba(245, 158, 11, 0.3)'
                    : 'rgba(16, 185, 129, 0.25)'
              }`
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: !isOnline ? '#ef4444' : pendingCount > 0 ? '#f59e0b' : '#10b981'
              }}
            />
            <span>
              {!isOnline
                ? `أوفلاين ${pendingCount > 0 ? `(${pendingCount} معلق)` : ''}`
                : pendingCount > 0
                  ? `${pendingCount} معلق`
                  : 'متصل'}
            </span>
          </span>

          {pendingCount > 0 && isOnline && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={handleManualSync}
              disabled={isSyncing}
              title="مزامنة التغييرات المعلقة مع السيرفر فوراً"
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: '#fff',
                fontSize: '0.75rem',
                padding: '0.25rem 0.55rem',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              <i className={`pi ${isSyncing ? 'pi-spin pi-spinner' : 'pi-sync'}`} style={{ fontSize: '0.75rem' }} />
              <span>{isSyncing ? 'جاري...' : 'مزامنة'}</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate('/profile')}
          title="إعدادات الحساب وتغيير كلمة المرور"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0.2rem 0.4rem',
            borderRadius: '8px',
            transition: 'background 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <span style={{ color: 'var(--text-color-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
            {user?.role === 'teacher' ? '👨‍🏫 مستر محمد' : `🧑‍💼 ${user?.username || 'مساعد'}`}
          </span>
          <div className="topbar-avatar" title={`حساب ${user?.username} - انقر لتغيير كلمة المرور`}>
            {user?.role === 'teacher' ? '👨‍🏫' : (user?.username?.[0]?.toUpperCase() || 'U')}
          </div>
        </button>
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
                    <strong>الشبكة المحلية (واي فاي / هوتسبوت):</strong>
                    <ul style={{ margin: '0.35rem 0 0', paddingRight: '1.25rem' }}>
                      <li>الموبايل لازم يكون متصل بنفس شبكة الواي فاي أو الهوتسبوت.</li>
                      <li>الرابط مشفر بـ <strong>HTTPS</strong> لتشغيل كاميرا الهاتف.</li>
                      <li>إذا ظهرت في كروم رسالة (الاتصال ليس خاصاً): اضغط <strong>خيارات متقدمة (Advanced)</strong> ثم <strong>متابعة إلى 192.168.x.x</strong> لتسمح بالكاميرا.</li>
                      <li>أو استخدم تبويب <strong>عبر الإنترنت (سحابي)</strong> للدخول بدون أي رسائل أمان.</li>
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

      {/* Smart Camera Modal (Live Attendance or QR Search) */}
      {cameraModalMode && (
        <SmartCameraModal
          mode={cameraModalMode}
          onClose={() => setCameraModalMode(null)}
        />
      )}
    </header>
  )
}
