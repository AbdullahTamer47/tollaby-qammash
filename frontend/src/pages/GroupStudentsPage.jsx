import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getGroups, changeStudentGroup, getGroupStudents, deleteStudent } from '../api'
import Pagination from '../components/Pagination'

export default function GroupStudentsPage() {
  const { id } = useParams()
  const [group, setGroup] = useState(null)
  const [students, setStudents] = useState([])
  const [groupSessions, setGroupSessions] = useState([])
  const [groupStats, setGroupStats] = useState(null)
  const [allGroups, setAllGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [attendanceFilter, setAttendanceFilter] = useState('all') // 'all' | 'high' | 'low' | 'last_absent'

  // Move Modal
  const [moveModal, setMoveModal] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [targetGroupId, setTargetGroupId] = useState('')
  const [isSubmittingMove, setIsSubmittingMove] = useState(false)

  // Delete Modal
  const [deleteModal, setDeleteModal] = useState(false)
  const [studentToDelete, setStudentToDelete] = useState(null)
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false)

  // Attendance History Modal
  const [historyModal, setHistoryModal] = useState(false)
  const [studentForHistory, setStudentForHistory] = useState(null)

  // Add Existing Student Modal
  const [addModal, setAddModal] = useState(false)
  const [addStudentId, setAddStudentId] = useState('')
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false)

  // Sessions Log Tab / Modal
  const [showSessionsModal, setShowSessionsModal] = useState(false)

  const [currentPage, setCurrentPage] = useState(1)
  const PER_PAGE = 10

  const cleanPhone = (p) => (p || '').replace(/\D/g, '').replace(/^0+/, '')

  const openWhatsApp = (phone, studentName) => {
    const clean = cleanPhone(phone)
    if (!clean) {
      alert('لا يوجد رقم هاتف مسجل للتواصل')
      return
    }
    const text = `السلام عليكم ورحمة الله وبركاته، بخصوص الطالب (${studentName}) المقيد في مجموعة (${group?.name || ''}).`
    window.open(`https://wa.me/20${clean}?text=${encodeURIComponent(text)}`, '_blank')
  }

  const load = async () => {
    setLoading(true)
    try {
      const [groupsRes, studentsRes] = await Promise.all([
        getGroups(),
        getGroupStudents(id)
      ])

      const currentGroup = groupsRes.data.find(g => g.id === parseInt(id))
      setGroup(currentGroup || null)
      setAllGroups(groupsRes.data || [])

      const studentsData = Array.isArray(studentsRes.data)
        ? studentsRes.data
        : (studentsRes.data?.students || [])

      setStudents(studentsData)
      setGroupSessions(studentsRes.data?.groupSessions || [])
      setGroupStats(studentsRes.data?.stats || null)
    } catch (err) {
      setMsg({ type: 'error', text: 'فشل تحميل بيانات المجموعة والطلاب' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  // Move Student Handler
  const handleMove = async (e) => {
    e.preventDefault()
    if (!targetGroupId || !selectedStudent) return
    setIsSubmittingMove(true)
    try {
      await changeStudentGroup(selectedStudent.id, targetGroupId)
      const targetGroup = allGroups.find(g => String(g.id) === String(targetGroupId))
      setMsg({ type: 'success', text: `تم نقل الطالب (${selectedStudent.name}) إلى مجموعة (${targetGroup?.name || targetGroupId}) بنجاح!` })
      setMoveModal(false)
      setSelectedStudent(null)
      load()
    } catch {
      setMsg({ type: 'error', text: 'فشل نقل الطالب إلى المجموعة المحددة' })
    } finally {
      setIsSubmittingMove(false)
    }
  }

  // Delete Student Handler
  const handleDeleteStudent = async () => {
    if (!studentToDelete) return
    setIsSubmittingDelete(true)
    try {
      await deleteStudent(studentToDelete.id)
      setMsg({ type: 'success', text: `تم حذف قيد الطالب (${studentToDelete.name}) نهائياً من النظام بنجاح.` })
      setDeleteModal(false)
      setStudentToDelete(null)
      load()
    } catch {
      setMsg({ type: 'error', text: 'فشل حذف الطالب، يرجى المحاولة لاحقاً' })
    } finally {
      setIsSubmittingDelete(false)
    }
  }

  // Add Existing Student Handler
  const handleAdd = async (e) => {
    e.preventDefault()
    const cleanId = String(addStudentId).trim()
    if (!cleanId) return
    setIsSubmittingAdd(true)
    try {
      await changeStudentGroup(cleanId, id)
      setMsg({ type: 'success', text: `تمت إضافة الطالب #${cleanId} إلى مجموعة (${group?.name}) بنجاح!` })
      setAddModal(false)
      setAddStudentId('')
      load()
    } catch {
      setMsg({ type: 'error', text: 'تأكد من كود الطالب أو أنه مسجل مسبقاً في النظام' })
    } finally {
      setIsSubmittingAdd(false)
    }
  }

  // Filtered & Paginated Students
  const filteredStudents = useMemo(() => {
    let list = [...students]

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(s =>
        s.name?.toLowerCase().includes(q) ||
        String(s.id).includes(q) ||
        s.phoneNumber?.includes(q) ||
        s.dadPhoneNumber?.includes(q)
      )
    }

    if (attendanceFilter === 'high') {
      list = list.filter(s => (s.attendanceStats?.attendanceRate ?? 0) >= 75)
    } else if (attendanceFilter === 'low') {
      list = list.filter(s => (s.attendanceStats?.attendanceRate ?? 0) < 60)
    } else if (attendanceFilter === 'last_absent') {
      list = list.filter(s => s.attendanceStats?.lastStatus === 'absent')
    }

    return list
  }, [students, searchQuery, attendanceFilter])

  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * PER_PAGE
    return filteredStudents.slice(start, start + PER_PAGE)
  }, [filteredStudents, currentPage])

  if (loading) return <div className="spinner-wrapper"><div className="spinner" /></div>
  if (!group) return <div className="empty-state"><p>المجموعة المطلوبة غير موجودة</p></div>

  const totalSessionsCount = groupStats?.totalSessions ?? groupSessions.length
  const overallRate = groupStats?.overallAttendanceRate ?? 0

  return (
    <div style={{ paddingBottom: '3rem' }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.5rem' }}>👥</span>
            <h1 className="page-title" style={{ margin: 0 }}>مجموعة: {group.name}</h1>
          </div>
          <p className="page-subtitle" style={{ marginTop: '0.35rem' }}>
            الصف: <strong style={{ color: 'var(--primary-color)' }}>{group.grade}</strong> · إجمالي المقيدين: <strong>{students.length} طالب</strong>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setAddModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
          >
            <i className="pi pi-user-plus" />
            <span>نقل طالب موجود للمجموعة</span>
          </button>

          <Link
            to={`/students?create=true&groupId=${group.id}`}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <i className="pi pi-plus" />
            <span>تسجيل طالب جديد</span>
          </Link>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowSessionsModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            title="عرض حصص هذه المجموعة وكشوف الحضور"
          >
            <i className="pi pi-calendar" />
            <span>حصص المجموعة ({totalSessionsCount})</span>
          </button>

          <Link to="/groups" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            <i className="pi pi-arrow-right" />
            <span>المجموعات</span>
          </Link>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type}`} style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <i className={`pi ${msg.type === 'success' ? 'pi-check-circle' : 'pi-exclamation-circle'}`} />
          <span>{msg.text}</span>
          <button style={{ marginRight: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      {/* Group Attendance & Statistics Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {/* Stat 1: Total Enrolled */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(59,130,246,0.12)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.35rem' }}>
            <i className="pi pi-users" />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-color-secondary)', fontWeight: 600 }}>إجمالي الطلاب المقيدين</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.2rem' }}>{students.length} <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>طالب</span></div>
          </div>
        </div>

        {/* Stat 2: Total Sessions */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(16,185,129,0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.35rem' }}>
            <i className="pi pi-calendar-check" />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-color-secondary)', fontWeight: 600 }}>الحصص المنعقدة للمجموعة</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.2rem' }}>{totalSessionsCount} <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>حصة</span></div>
          </div>
        </div>

        {/* Stat 3: Group Average Attendance */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: overallRate >= 75 ? 'rgba(16,185,129,0.12)' : overallRate >= 50 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
            color: overallRate >= 75 ? '#10b981' : overallRate >= 50 ? '#f59e0b' : '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.35rem'
          }}>
            <i className="pi pi-chart-pie" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-color-secondary)', fontWeight: 600 }}>متوسط نسبة حضور المجموعة</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.2rem' }}>
              <span style={{ fontSize: '1.4rem', fontWeight: 800, color: overallRate >= 75 ? '#10b981' : overallRate >= 50 ? '#f59e0b' : '#ef4444' }}>
                {overallRate}%
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-color-secondary)' }}>
                {totalSessionsCount > 0 ? `(عبر ${totalSessionsCount} حصص)` : 'لا توجد حصص بعد'}
              </span>
            </div>
          </div>
        </div>

        {/* Stat 4: Last Session Quick Info */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(139,92,246,0.12)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.35rem' }}>
            <i className="pi pi-clock" />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-color-secondary)', fontWeight: 600 }}>آخر حصة مسجلة</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
              {groupSessions.length > 0 ? groupSessions[groupSessions.length - 1].title : 'لم تُسجل حصص بعد'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card" style={{ padding: '1.5rem' }}>
        {/* Filters and Search Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <div style={{ position: 'relative', minWidth: '280px', flex: '1 1 300px' }}>
            <i className="pi pi-search" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-color-secondary)' }} />
            <input
              type="text"
              className="form-control"
              placeholder="بحث باسم الطالب، الكود، أو رقم الهاتف..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1) }}
              style={{ paddingRight: '2.5rem' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-color-secondary)', fontWeight: 600 }}>تصفية الحضور:</span>
            <button
              type="button"
              className={`btn btn-sm ${attendanceFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setAttendanceFilter('all'); setCurrentPage(1) }}
            >
              الكل ({students.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${attendanceFilter === 'high' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setAttendanceFilter('high'); setCurrentPage(1) }}
              title="نسبة حضور 75% فما فوق"
            >
              🟢 ملتزمون (≥75%)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${attendanceFilter === 'low' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setAttendanceFilter('low'); setCurrentPage(1) }}
              title="نسبة حضور أقل من 60%"
            >
              🔴 كثيرو الغياب (&lt;60%)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${attendanceFilter === 'last_absent' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setAttendanceFilter('last_absent'); setCurrentPage(1) }}
              title="الطلاب الذين غابوا في آخر حصة"
            >
              ⚠️ غياب آخر حصة
            </button>
          </div>
        </div>

        {/* Students Table */}
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: '80px' }}>الكود</th>
                <th>اسم الطالب</th>
                <th>الهاتف والتواصل</th>
                <th style={{ minWidth: '220px' }}>الحضور والغياب في المجموعة</th>
                <th style={{ width: '110px' }}>آخر حصة</th>
                <th style={{ width: '230px', textAlign: 'center' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {paginatedStudents.map(s => {
                const stats = s.attendanceStats || { totalSessions: 0, attendedCount: 0, absentCount: 0, attendanceRate: 0, lastStatus: 'none' }
                const rate = stats.attendanceRate
                const rateColor = rate >= 75 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444'
                const rateBg = rate >= 75 ? 'rgba(16,185,129,0.1)' : rate >= 50 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)'

                return (
                  <tr key={s.id}>
                    {/* ID */}
                    <td>
                      <span className="badge badge-info" style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                        #{s.id}
                      </span>
                    </td>

                    {/* Name & Dashboard link */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.9rem',
                          fontWeight: 700
                        }}>
                          {s.name?.[0] || 'ط'}
                        </div>
                        <div>
                          <Link
                            to={`/students/${s.id}/dashboard`}
                            style={{ fontWeight: 700, color: 'var(--text-color)', textDecoration: 'none' }}
                            title="فتح البروفايل الشامل للطالب"
                          >
                            {s.name}
                          </Link>
                          {s.offer && s.offer.value > 0 && (
                            <span style={{ fontSize: '0.72rem', display: 'block', color: 'var(--primary-color)' }}>
                              خصم: {s.offer.title}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Phones & WhatsApp */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        {s.phoneNumber && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                            <span>{s.phoneNumber}</span>
                            <button
                              type="button"
                              onClick={() => openWhatsApp(s.phoneNumber, s.name)}
                              title="محادثة واتساب مع الطالب"
                              style={{ background: 'none', border: 'none', color: '#25D366', cursor: 'pointer', padding: 0 }}
                            >
                              <i className="pi pi-whatsapp" style={{ fontSize: '1rem' }} />
                            </button>
                          </div>
                        )}
                        {s.dadPhoneNumber && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-color-secondary)' }}>
                            <span>ولي الأمر: {s.dadPhoneNumber}</span>
                            <button
                              type="button"
                              onClick={() => openWhatsApp(s.dadPhoneNumber, s.name)}
                              title="محادثة واتساب مع ولي الأمر"
                              style={{ background: 'none', border: 'none', color: '#25D366', cursor: 'pointer', padding: 0 }}
                            >
                              <i className="pi pi-whatsapp" style={{ fontSize: '0.9rem' }} />
                            </button>
                          </div>
                        )}
                        {!s.phoneNumber && !s.dadPhoneNumber && <span className="text-muted">-</span>}
                      </div>
                    </td>

                    {/* Attendance Stats Column */}
                    <td>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '12px',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              color: rateColor,
                              background: rateBg,
                              border: `1px solid ${rateColor}33`
                            }}
                          >
                            <span>{rate}% حضور</span>
                          </span>

                          <span style={{ fontSize: '0.8rem', color: 'var(--text-color-secondary)', fontWeight: 600 }}>
                            {stats.attendedCount} من {stats.totalSessions} حصص
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div style={{ width: '100%', height: '6px', background: 'var(--surface-ground, #e2e8f0)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, rate)}%`, height: '100%', background: rateColor, transition: 'width 0.3s ease' }} />
                        </div>

                        {/* Quick View Attendance History Link */}
                        <button
                          type="button"
                          onClick={() => { setStudentForHistory(s); setHistoryModal(true) }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--primary-color)',
                            cursor: 'pointer',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            padding: '0.25rem 0 0',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                        >
                          <i className="pi pi-history" style={{ fontSize: '0.72rem' }} />
                          <span>عرض سجل الحصص بالتاريخ</span>
                        </button>
                      </div>
                    </td>

                    {/* Last Session Status */}
                    <td>
                      {stats.lastStatus === 'present' ? (
                        <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <i className="pi pi-check" style={{ fontSize: '0.7rem' }} />
                          <span>حاضر</span>
                        </span>
                      ) : stats.lastStatus === 'absent' ? (
                        <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <i className="pi pi-times" style={{ fontSize: '0.7rem' }} />
                          <span>غائب</span>
                        </span>
                      ) : (
                        <span className="badge" style={{ background: 'var(--surface-ground)', color: 'var(--text-color-secondary)' }}>
                          لا يوجد
                        </span>
                      )}
                    </td>

                    {/* Actions: Transfer & Remove & Profile */}
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                        {/* Transfer */}
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => { setSelectedStudent(s); setTargetGroupId(''); setMoveModal(true) }}
                          title="نقل الطالب إلى مجموعة أخرى"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                        >
                          <i className="pi pi-arrow-right-arrow-left" style={{ color: 'var(--primary-color)' }} />
                          <span>نقل</span>
                        </button>

                        {/* Remove / Delete */}
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => { setStudentToDelete(s); setDeleteModal(true) }}
                          title="إزالة أو حذف الطالب"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                        >
                          <i className="pi pi-trash" />
                          <span>إزالة</span>
                        </button>

                        {/* Profile Link */}
                        <Link
                          to={`/students/${s.id}/dashboard`}
                          className="btn btn-secondary btn-sm"
                          title="كشف الحساب والتقرير الشامل"
                          style={{ padding: '0.35rem 0.55rem' }}
                        >
                          <i className="pi pi-user" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {paginatedStudents.length === 0 && (
                <tr>
                  <td colSpan="6" className="text-center" style={{ padding: '3rem 1rem' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem', opacity: 0.5 }}>🔍</div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-color)' }}>لا توجد نتائج مطابقة</div>
                    <div style={{ color: 'var(--text-color-secondary)', fontSize: '0.88rem', marginTop: '0.25rem' }}>
                      {searchQuery ? 'جرب البحث بكلمات أخرى أو إزالة الفلتر' : 'لا يوجد طلاب مسجلون في هذه المجموعة حالياً'}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredStudents.length > PER_PAGE && (
          <div style={{ marginTop: '1rem' }}>
            <Pagination
              totalItems={filteredStudents.length}
              itemsPerPage={PER_PAGE}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>

      {/* Modal 1: Move Student to Another Group */}
      {moveModal && selectedStudent && (
        <div className="modal-overlay" onClick={() => setMoveModal(false)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="pi pi-arrow-right-arrow-left" style={{ color: 'var(--primary-color)' }} />
                نقل الطالب لمجموعة أخرى
              </h3>
              <button className="modal-close" onClick={() => setMoveModal(false)}><i className="pi pi-times" /></button>
            </div>

            <form onSubmit={handleMove}>
              <div style={{ background: 'var(--surface-ground, #f8fafc)', padding: '0.85rem 1rem', borderRadius: '10px', marginBottom: '1rem', border: '1px solid var(--surface-border)' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-color-secondary)' }}>الطالب المحدد:</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-color)', marginTop: '0.2rem' }}>
                  {selectedStudent.name} (#{selectedStudent.id})
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-color-secondary)', marginTop: '0.2rem' }}>
                  المجموعة الحالية: <strong>{group.name}</strong>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ fontWeight: 600 }}>اختر المجموعة البديلة (الوجهة):</label>
                <select
                  className="form-control"
                  required
                  value={targetGroupId}
                  onChange={e => setTargetGroupId(e.target.value)}
                >
                  <option value="">-- اضغط لاختيار المجموعة --</option>
                  {allGroups.filter(g => g.id !== group.id).map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.grade})
                    </option>
                  ))}
                </select>
                {allGroups.filter(g => g.id !== group.id).length === 0 && (
                  <small style={{ color: '#ef4444', display: 'block', marginTop: '0.35rem' }}>
                    لا توجد مجموعات أخرى متاحة حالياً. يمكنك إنشاء مجموعة جديدة أولاً من صفحة المجموعات.
                  </small>
                )}
              </div>

              <div className="modal-footer" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!targetGroupId || isSubmittingMove}
                  style={{ minWidth: '110px', justifyContent: 'center' }}
                >
                  {isSubmittingMove ? <><i className="pi pi-spin pi-spinner" /> جاري النقل...</> : <><i className="pi pi-check" /> تأكيد النقل</>}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setMoveModal(false)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Delete / Remove Student Confirmation */}
      {deleteModal && studentToDelete && (
        <div className="modal-overlay" onClick={() => setDeleteModal(false)}>
          <div className="modal" style={{ maxWidth: '460px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="pi pi-exclamation-triangle" />
                خيارات إزالة الطالب
              </h3>
              <button className="modal-close" onClick={() => setDeleteModal(false)}><i className="pi pi-times" /></button>
            </div>

            <div style={{ padding: '0.5rem 0' }}>
              <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', padding: '1rem', borderRadius: '10px', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#b91c1c' }}>
                  هل تريد إزالة الطالب: {studentToDelete.name} (#{studentToDelete.id})؟
                </div>
                <div style={{ fontSize: '0.82rem', color: '#7f1d1d', marginTop: '0.35rem', lineHeight: 1.5 }}>
                  لديك خياران: إما نقل الطالب إلى مجموعة أخرى لحفظ سجلاته، أو حذف قيد الطالب نهائياً من السيستم.
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Option 1: Move to another group */}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setDeleteModal(false)
                    setSelectedStudent(studentToDelete)
                    setTargetGroupId('')
                    setMoveModal(true)
                  }}
                  style={{ justifyContent: 'center', padding: '0.75rem', fontWeight: 600 }}
                >
                  <i className="pi pi-arrow-right-arrow-left" style={{ color: 'var(--primary-color)' }} />
                  <span>نقل الطالب إلى مجموعة أخرى بدلاً من الحذف</span>
                </button>

                {/* Option 2: Delete completely */}
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleDeleteStudent}
                  disabled={isSubmittingDelete}
                  style={{ justifyContent: 'center', padding: '0.75rem', fontWeight: 700 }}
                >
                  {isSubmittingDelete ? (
                    <><i className="pi pi-spin pi-spinner" /> جاري الحذف...</>
                  ) : (
                    <><i className="pi pi-trash" /> حذف الطالب نهائياً من المنصة</>
                  )}
                </button>
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: '1rem', justifyContent: 'flex-start' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteModal(false)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Detailed Student Attendance History */}
      {historyModal && studentForHistory && (
        <div className="modal-overlay" onClick={() => setHistoryModal(false)}>
          <div className="modal" style={{ maxWidth: '580px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="pi pi-calendar-check" style={{ color: 'var(--primary-color)' }} />
                سجل حضور: {studentForHistory.name}
              </h3>
              <button className="modal-close" onClick={() => setHistoryModal(false)}><i className="pi pi-times" /></button>
            </div>

            <div style={{ padding: '0.5rem 0' }}>
              {/* Quick Summary Pill */}
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ flex: 1, padding: '0.75rem', background: 'rgba(16,185,129,0.1)', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.2)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#047857', fontWeight: 600 }}>الحصص الحاضرة</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>{studentForHistory.attendanceStats?.attendedCount || 0}</div>
                </div>
                <div style={{ flex: 1, padding: '0.75rem', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: 600 }}>مرات الغياب</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#dc2626' }}>{studentForHistory.attendanceStats?.absentCount || 0}</div>
                </div>
                <div style={{ flex: 1, padding: '0.75rem', background: 'rgba(59,130,246,0.1)', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.2)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#1d4ed8', fontWeight: 600 }}>نسبة الالتزام</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563eb' }}>{studentForHistory.attendanceStats?.attendanceRate || 0}%</div>
                </div>
              </div>

              {/* Sessions List */}
              <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>الحصة</th>
                      <th>التاريخ</th>
                      <th>حالة الحضور</th>
                      <th>سداد الحصة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(studentForHistory.attendanceHistory || []).map((att, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{att.sessionTitle}</td>
                        <td style={{ fontSize: '0.85rem' }}>{new Date(att.sessionDate).toLocaleDateString('ar-EG')}</td>
                        <td>
                          {att.isAttendant ? (
                            <span className="badge badge-success">حاضر 🟢</span>
                          ) : (
                            <span className="badge badge-danger">غائب 🔴</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                          {att.amountPaid > 0 ? `${att.amountPaid} ج.م` : <span style={{ color: '#ef4444' }}>لم يُسدد</span>}
                        </td>
                      </tr>
                    ))}
                    {(!studentForHistory.attendanceHistory || studentForHistory.attendanceHistory.length === 0) && (
                      <tr>
                        <td colSpan="4" className="text-center" style={{ padding: '2rem' }}>
                          لم يتم تسجيل حضور لأي حصة لهذه المجموعة بعد
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: '1rem', justifyContent: 'space-between' }}>
              <Link to={`/students/${studentForHistory.id}/dashboard`} className="btn btn-secondary">
                <i className="pi pi-external-link" /> فتح التقرير الشامل للطالب
              </Link>
              <button type="button" className="btn btn-primary" onClick={() => setHistoryModal(false)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Add Existing Student to this Group */}
      {addModal && (
        <div className="modal-overlay" onClick={() => setAddModal(false)}>
          <div className="modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="pi pi-user-plus" style={{ color: 'var(--primary-color)' }} />
                نقل طالب موجود إلى هذه المجموعة
              </h3>
              <button className="modal-close" onClick={() => setAddModal(false)}><i className="pi pi-times" /></button>
            </div>

            <form onSubmit={handleAdd}>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" style={{ fontWeight: 600 }}>رقم / كود الطالب:</label>
                <input
                  type="number"
                  className="form-control"
                  required
                  value={addStudentId}
                  onChange={e => setAddStudentId(e.target.value)}
                  placeholder="أدخل كود الطالب (مثال: 12)"
                  autoFocus
                />
                <small style={{ color: 'var(--text-color-secondary)', fontSize: '0.78rem', display: 'block', marginTop: '0.35rem' }}>
                  سيتم سحب الطالب من مجموعته السابقة ونقله فوراً لمجموعة: <strong>{group.name}</strong>.
                </small>
              </div>

              <div className="modal-footer" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!addStudentId || isSubmittingAdd}
                  style={{ minWidth: '110px', justifyContent: 'center' }}
                >
                  {isSubmittingAdd ? <><i className="pi pi-spin pi-spinner" /> جاري الإضافة...</> : <><i className="pi pi-check" /> إضافة للمجموعة</>}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setAddModal(false)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 5: Group Sessions List & Quick Links */}
      {showSessionsModal && (
        <div className="modal-overlay" onClick={() => setShowSessionsModal(false)}>
          <div className="modal" style={{ maxWidth: '580px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="pi pi-calendar" style={{ color: 'var(--primary-color)' }} />
                حصص مجموعة: {group.name}
              </h3>
              <button className="modal-close" onClick={() => setShowSessionsModal(false)}><i className="pi pi-times" /></button>
            </div>

            <div style={{ padding: '0.5rem 0' }}>
              <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>عنوان الحصة</th>
                      <th>التاريخ</th>
                      <th>الإجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupSessions.map((sess, idx) => (
                      <tr key={sess.id}>
                        <td><span className="badge badge-info">{idx + 1}</span></td>
                        <td style={{ fontWeight: 600 }}>{sess.title}</td>
                        <td style={{ fontSize: '0.85rem' }}>{new Date(sess.date).toLocaleDateString('ar-EG')}</td>
                        <td>
                          <Link
                            to={`/sessions/${sess.id}/attendance`}
                            className="btn btn-primary btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem' }}
                          >
                            <i className="pi pi-check-square" />
                            <span>كشف الحضور</span>
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {groupSessions.length === 0 && (
                      <tr>
                        <td colSpan="4" className="text-center" style={{ padding: '2rem' }}>
                          لم يتم إنشاء حصص لهذه المجموعة حتى الآن
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: '1rem', justifyContent: 'space-between' }}>
              <Link to="/sessions" className="btn btn-secondary">
                <i className="pi pi-plus" /> إنشاء حصة جديدة
              </Link>
              <button type="button" className="btn btn-primary" onClick={() => setShowSessionsModal(false)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
