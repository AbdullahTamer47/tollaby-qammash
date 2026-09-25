import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { logout, updateMe } from '../api'
import TopBar from './TopBar'

const MENU_ITEMS = [
  { section: 'الرئيسية' },
  { to: '/teacher-dashboard', icon: 'pi pi-chart-bar', label: 'لوحة المعلم', teacher: true },
  { to: '/admin', icon: 'pi pi-chart-line', label: 'إحصائيات الإدارة', teacher: true },
  { to: '/assistants', icon: 'pi pi-id-card', label: 'إدارة المساعدين', teacher: true },
  { to: '/assistant-info', icon: 'pi pi-user', label: 'معلوماتي', assistant: true },
  { to: '/students', icon: 'pi pi-users', label: 'الطلاب', perm: 'students' },
  { to: '/groups', icon: 'pi pi-th-large', label: 'المجموعات', perm: 'groups' },

  { section: 'الحصص والحضور' },
  { to: '/sessions', icon: 'pi pi-calendar', label: 'الحصص', perm: 'sessions' },

  { section: 'المالية' },
  { to: '/payments', icon: 'pi pi-wallet', label: 'المدفوعات', perm: 'payments' },
  { to: '/exams', icon: 'pi pi-pencil', label: 'الامتحانات', perm: 'exams' },

  { section: 'أدوات' },
  { to: '/books', icon: 'pi pi-book', label: 'الكتب والحجوزات', perm: 'books' },
  { to: '/qrcodes', icon: 'pi pi-qrcode', label: 'رموز QR', perm: 'students' },
  { to: '/chat', icon: 'pi pi-whatsapp', label: 'الشات / واتساب', perm: 'chat' },
  { to: '/archive', icon: 'pi pi-inbox', label: 'أرشيف الرسائل', perm: 'chat' },
  { to: '/templates', icon: 'pi pi-file-edit', label: 'قوالب الرسائل', perm: 'chat' },
]

export default function Layout() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
 
  const [profileForm, setProfileForm] = useState({ username: '', password: '' })
  const [msg, setMsg] = useState(null)

  const handleLogout = async () => {
    await logout().catch(() => {})
    setUser(null)
    navigate('/login')
  }

  const handleOpenEditProfile = () => {
    setProfileForm({ username: user?.username || '', password: '' })
    setMsg(null)
    
    setSidebarOpen(false)
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    try {
      const res = await updateMe(profileForm)
      setUser({ ...user, username: res.data.username })
      setMsg({ type: 'success', text: 'تم تحديث البيانات بنجاح' })
      setTimeout(() => setEditProfileModal(false), 1500)
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'حدث خطأ' })
    }
  }

  const visibleItems = MENU_ITEMS.filter(item => {
    if (item.section) return true
    if (item.teacher && user?.role !== 'teacher') return false
    if (item.assistant && user?.role !== 'assistant') return false
    if (item.perm && user?.role === 'assistant') {
      const perms = Array.isArray(user.permissions) ? user.permissions : [];
      if (!perms.includes(item.perm)) return false;
    }
    return true
  }).filter((item, idx, arr) => {
    // Remove empty sections
    if (item.section) {
      const next = arr[idx + 1];
      if (!next || next.section) return false;
    }
    return true;
  })

  return (
    <div className="layout-wrapper">
      {/* Sidebar */}
      <aside className={`layout-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="layout-sidebar-logo">
          <div className="logo-icon"><i className="pi pi-graduation-cap" /></div>
          <span>طلابي</span>
        </div>

        <ul className="layout-menu">
          {visibleItems.map((item, idx) =>
            item.section
              ? <li key={idx} className="menu-section">{item.section}</li>
              : (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) => isActive ? 'active' : ''}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <i className={item.icon} />
                    {item.label}
                  </NavLink>
                </li>
              )
          )}

          <li style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--surface-border)' }}>
            <button className="menu-btn" onClick={handleLogout}>
              <i className="pi pi-sign-out" />
              تسجيل الخروج
            </button>
          </li>
        </ul>
      </aside>

      {/* Main */}
      <div className="layout-main-container">
        <TopBar user={user} onMenuToggle={() => setSidebarOpen(v => !v)} />
        <main className="layout-main">
          <Outlet />
        </main>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}
