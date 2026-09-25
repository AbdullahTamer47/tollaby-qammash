import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

export default function TopBar({ user, onMenuToggle }) {
  const [searchQ, setSearchQ] = useState('')
  const navigate = useNavigate()
  const inputRef = useRef(null)

  const handleSearch = (e) => {
    e.preventDefault()
    const q = searchQ.trim()
    if (q) {
      navigate(`/search?q=${encodeURIComponent(q)}`)
      setSearchQ('')
      inputRef.current?.blur()
    }
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
        <span style={{ color: 'var(--text-color-secondary)', fontSize: '0.85rem' }}>
          {user?.role === 'teacher' ? '👨‍🏫 معلم' : '🧑‍💼 مساعد'}
        </span>
        <div className="topbar-avatar" title={user?.username}>
          {user?.username?.[0]?.toUpperCase() || 'U'}
        </div>
      </div>
    </header>
  )
}
