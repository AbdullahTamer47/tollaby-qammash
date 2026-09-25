import { useEffect, useState, useMemo, memo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSessions, createSession, updateSession, deleteSession, toggleSessionActive,
         bulkCreateSessions, deleteMonthSessions, deleteMonthLectures, getGroups, notifySession } from '../api'
import { useAuth } from '../context/AuthContext'
import { exportToCSV } from '../utils/csvExport'
import Pagination from '../components/Pagination'

const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
const DAYS_AR = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']
const GRADES = [
  'الصف السادس الابتدائي','الصف الأول الاعدادي','الصف الثاني الاعدادي','الصف الثالث الاعدادي',
  'الصف الأول الثانوي','الصف الثاني الثانوي','الصف الثالث الثانوي','بدون صف محدد'
]

const Accordion = memo(function Accordion({ title, children, defaultOpen = false, icon = '' }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="accordion-item">
      <div className="accordion-header" onClick={() => setOpen(!open)}>
        <span>{icon && <i className={`pi ${icon}`} style={{ marginLeft: '0.5rem' }} />} {title}</span>
        <i className={`pi ${open ? 'pi-chevron-up' : 'pi-chevron-down'}`} />
      </div>
      {open && <div className="accordion-content">{children}</div>}
    </div>
  )
})



export default function SessionsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [modal, setModal] = useState(null)
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState(null)
  const [form, setForm] = useState({ groupId: '', grade: '', title: '', type: 'session', description: '', location: '', duration: 2, price: 100, date: '', active: true })
  const [bulkForm, setBulkForm] = useState({ bulkType: 'monthly', groupId: '', grade: '', sessionName: '', sessionType: 'session', sessionMonth: new Date().getMonth() + 1, sessionDays: [], sessionHour: '09:00', duration: 2, price: 100, startDate: '', endDate: '', numberOfSessions: 4 })
  const [notifyModal, setNotifyModal] = useState(null)
  const [notifyResult, setNotifyResult] = useState(null)
  const [notifySending, setNotifySending] = useState(false)
  const [currentPage, setCurrentPage] = useState(1);

  const PER_PAGE = 10;
  
  const canUseAttendance = user?.role === 'teacher' || user?.permissions?.includes('attendance')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      getSessions({ all: showAll ? 'true' : 'false', per_page: 10000 }),
      getGroups()
    ]).then(([s, g]) => { 
      setSessions(s.data.sessions || s.data) 
      setGroups(g.data) 
    }).catch(() => {}).finally(() => setLoading(false))
  }, [showAll])

  useEffect(() => { load() }, [load])

  // Reset page when showAll changes
  useEffect(() => {
    setCurrentPage(1)
  }, [showAll])

  // Organize: grade → group (أو "محاضرات عامة" للمحاضرات) → month → sessions
  const organized = useMemo(() => {
    const org = {}
    if (Array.isArray(sessions)) {
      sessions.forEach(s => {
        const isLecture = s.type === 'lecture'
        const grade = isLecture ? (s.grade || 'بدون صف محدد') : (s.group?.grade || 'بدون صف محدد')
        const gname = isLecture ? '📚 محاضرات الصف (كل الطلاب)' : (s.group?.name || 'بدون مجموعة')
        const d = new Date(s.date)
        const mk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
        const mname = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
        if (!org[grade]) org[grade] = {}
        if (!org[grade][gname]) org[grade][gname] = {}
        if (!org[grade][gname][mk]) org[grade][gname][mk] = { monthName: mname, sessions: [], groupId: s.group?.id, grade: isLecture ? grade : null, isLecture, year: d.getFullYear(), month: d.getMonth()+1 }
        org[grade][gname][mk].sessions.push(s)
      })
    }
    return org
  }, [sessions])

  // Flat array of all month groups for pagination
  const flatMonthGroups = useMemo(() => {
    const arr = [];
    Object.entries(organized).forEach(([grade, groupsData]) => {
      Object.entries(groupsData).forEach(([gname, monthsData]) => {
        Object.entries(monthsData).forEach(([mk, data]) => {
          arr.push({ grade, gname, mk, data });
        });
      });
    });
    return arr;
  }, [organized]);

  const paginatedMonthGroups = useMemo(() => {
    const start = (currentPage - 1) * PER_PAGE;
    return flatMonthGroups.slice(start, start + PER_PAGE);
  }, [flatMonthGroups, currentPage]);

  const handleExportCSV = useCallback(() => {
    if (!Array.isArray(sessions)) return
    const columns = [
      { header: 'الرقم', key: 'id' },
      { header: 'العنوان', key: 'title' },
      { header: 'المجموعة', key: 'group.name' },
      { header: 'الصف', key: 'group.grade' },
      { header: 'التاريخ', render: s => new Date(s.date).toLocaleDateString('ar-EG') },
      { header: 'الوقت', render: s => new Date(s.date).toLocaleTimeString('ar-EG') },
      { header: 'السعر', key: 'price' },
      { header: 'الحالة', render: s => s.active ? 'نشطة' : 'غير نشطة' }
    ]
    exportToCSV(sessions, columns, 'sessions_export')
  }, [sessions])

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      const action = editing ? 'updated' : 'created'
      const result = editing ? await updateSession(editing.id, form) : await createSession(form)
      const itemLabel = form.type === 'lecture' ? 'المحاضرة' : 'الحصة'
      setMsg({ type: 'success', text: editing ? `تم تعديل ${itemLabel}` : `تم إضافة ${itemLabel}` })
      setModal(null)
      load()
    } catch { setMsg({ type: 'error', text: 'خطأ في الحفظ' }) }
  }

  const handleDelete = async () => {
    try { await deleteSession(editing.id); setMsg({ type: 'success', text: 'تم الحذف' }); setModal(null); load() }
    catch { setMsg({ type: 'error', text: 'فشل الحذف' }) }
  }

  const handleBulk = async (e) => {
    e.preventDefault()
    try {
      const r = await bulkCreateSessions(bulkForm)
      setMsg({ type: 'success', text: `تم إنشاء ${r.data.created} حصة` }); setModal(null); load()
    } catch { setMsg({ type: 'error', text: 'خطأ في الإنشاء' }) }
  }

  const handleDeleteMonth = async (mdata) => {
    if (!confirm(`هل تريد حذف جميع ${mdata.isLecture ? 'محاضرات' : 'حصص'} هذا الشهر؟`)) return
    try {
      if (mdata.isLecture) {
        await deleteMonthLectures(mdata.grade, mdata.year, mdata.month)
      } else {
        await deleteMonthSessions(mdata.groupId, mdata.year, mdata.month)
      }
      setMsg({ type: 'success', text: `تم حذف ${mdata.isLecture ? 'محاضرات' : 'حصص'} الشهر` }); load()
    }
    catch { setMsg({ type: 'error', text: 'فشل الحذف' }) }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">الحصص</h1>
          <p className="page-subtitle">{sessions.length} حصة {showAll ? '(الكل)' : '(النشطة فقط)'}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleExportCSV}>
            <i className="pi pi-download" /> تصدير CSV
          </button>
          <button className={`btn ${showAll ? 'btn-warning' : 'btn-secondary'}`} onClick={() => setShowAll(v => !v)}>
            <i className={`pi pi-${showAll ? 'eye-slash' : 'eye'}`} /> {showAll ? 'النشطة فقط' : 'عرض الكل'}
          </button>
          <button className="btn btn-secondary" onClick={() => setModal('bulk')}>
            <i className="pi pi-calendar-plus" /> إنشاء جماعي
          </button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setForm({ groupId: groups[0]?.id||'', grade: '', title:'', type:'session', description:'', location:'', duration:2, price:100, date:'', active:true }); setModal('form') }}>
            <i className="pi pi-plus" /> إضافة حصة
          </button>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type === 'success' ? 'success' : 'error'}`}>
          <i className={`pi pi-${msg.type === 'success' ? 'check-circle' : 'exclamation-circle'}`} />{msg.text}
          <button style={{ marginRight: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      {loading ? <div className="spinner-wrapper"><div className="spinner" /></div>
        : !Array.isArray(sessions) || sessions.length === 0
          ? <div className="empty-state"><i className="pi pi-calendar" /><p>لا توجد حصص</p></div>
          : (
            <div className="card">
              <div className="card-header"><h2 className="card-title">تصفح الحصص</h2></div>
              {Object.entries(
                paginatedMonthGroups.reduce((acc, { grade, gname, mk, data }) => {
                  if (!acc[grade]) acc[grade] = {}
                  if (!acc[grade][gname]) acc[grade][gname] = {}
                  acc[grade][gname][mk] = data
                  return acc
                }, {})
              ).map(([grade, gradeGroups]) => (
                <Accordion key={grade} title={grade} icon="pi-book">
                  {Object.entries(gradeGroups).map(([gname, months]) => (
                    <Accordion key={gname} title={gname} icon="pi-users">
                      {Object.entries(months).map(([mk, mdata]) => (
                        <div key={mk} style={{ border: '1px solid var(--surface-border)', borderRadius: 'var(--border-radius)', padding: '1rem', marginBottom: '0.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>
                              <i className="pi pi-calendar" style={{ marginLeft: '0.4rem' }} />{mdata.monthName}
                            </span>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteMonth(mdata)}>
                              <i className="pi pi-trash" /> حذف الشهر
                            </button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
                            {mdata.sessions.map(s => (
                              <div key={s.id} style={{
                                background: 'var(--surface-ground)',
                                border: `1px solid ${s.active ? 'var(--surface-border)' : 'rgba(220,53,69,0.5)'}`,
                                borderRadius: 'var(--border-radius)', padding: '0.75rem'
                              }}>
                                 <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.3rem' }}>
                                   {s.title} {s.type === 'lecture' && <span className="badge badge-info" style={{ marginRight: '0.35rem' }}>محاضرة</span>}
                                 </div>
                                <div className="text-muted text-sm">{new Date(s.date).toLocaleDateString('ar-EG')} · {s.price} جنيه</div>
                                <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.75rem' }}>
                                   {canUseAttendance && (
                                     <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/sessions/${s.id}/attendance`)}>
                                       <i className="pi pi-users" />
                                     </button>
                                   )}
                                  <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(s); setForm({ groupId: s.groupId || '', grade: s.grade || '', title: s.title, type: s.type || 'session', description: s.description || '', location: s.location || '', duration: s.duration, price: s.price, date: s.date?.slice(0,16), active: s.active }); setModal('form') }}>
                                    <i className="pi pi-pencil" />
                                  </button>
                                  <button className="btn btn-secondary btn-sm" title="إرسال إشعار لأولياء الأمور"
                                    onClick={() => { setNotifyModal({ session: s, action: 'updated' }); setNotifyResult(null) }}>
                                    <i className="pi pi-bell" />
                                  </button>
                                  {user?.role === 'teacher' && (
                                    <button className={`btn btn-sm ${s.active ? 'btn-warning' : 'btn-success'}`} onClick={async () => { await toggleSessionActive(s.id); load() }}>
                                      <i className={`pi pi-${s.active ? 'ban' : 'check'}`} />
                                    </button>
                                  )}
                                  <button className="btn btn-danger btn-sm" onClick={() => { setEditing(s); setModal('delete') }}>
                                    <i className="pi pi-trash" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </Accordion>
                  ))}
                </Accordion>
              ))}

              <Pagination
                totalItems={flatMonthGroups.length}
                itemsPerPage={PER_PAGE}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
              />
            </div>
          )
      }

      {/* Form modal */}
      {modal === 'form' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'تعديل حصة / محاضرة' : 'إضافة حصة / محاضرة'}</h3>
              <button className="modal-close" onClick={() => setModal(null)}><i className="pi pi-times" /></button>
            </div>
            <form onSubmit={handleSave}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">العنوان</label>
                  <input className="form-control" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">النوع</label>
                  <select
                    className="form-control"
                    value={form.type || 'session'}
                    onChange={e => {
                      const newType = e.target.value
                      setForm(f => ({
                        ...f,
                        type: newType,
                        groupId: newType === 'lecture' ? '' : (f.groupId || groups[0]?.id || ''),
                        grade: newType === 'lecture' ? (f.grade || GRADES[0]) : ''
                      }))
                    }}
                  >
                    <option value="session">حصة دراسية</option>
                    <option value="lecture">محاضرة</option>
                  </select>
                </div>
              </div>

              {form.type === 'lecture' ? (
                <div className="form-group">
                  <label className="form-label">الصف الدراسي (سترسل المحاضرة وحضورها وإشعارها لكل طلاب الصف)</label>
                  <select className="form-control" required value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}>
                    <option value="">-- اختر الصف --</option>
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">المجموعة</label>
                  <select className="form-control" required value={form.groupId} onChange={e => setForm(f => ({ ...f, groupId: parseInt(e.target.value) }))}>
                    <option value="">-- اختر المجموعة --</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.grade})</option>)}
                  </select>
                </div>
              )}

              {form.type === 'lecture' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">الوصف (اختياري)</label>
                    <input className="form-control" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">المكان (اختياري)</label>
                    <input className="form-control" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">المدة (ساعة)</label>
                  <input className="form-control" type="number" step="0.5" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">السعر (جنيه)</label>
                  <input className="form-control" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">التاريخ والوقت</label>
                <input className="form-control" type="datetime-local" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input type="checkbox" id="sess-active" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                <label htmlFor="sess-active" className="form-label" style={{ margin: 0 }}>حصة نشطة</label>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary"><i className="pi pi-check" /> حفظ</button>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {modal === 'delete' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: '#dc3545' }}><i className="pi pi-exclamation-triangle" /> تأكيد الحذف</h3>
              <button className="modal-close" onClick={() => setModal(null)}><i className="pi pi-times" /></button>
            </div>
            <p>هل تريد حذف حصة <strong>{editing?.title}</strong>؟</p>
            <div className="modal-footer">
              <button className="btn btn-danger" onClick={handleDelete}><i className="pi pi-trash" /> حذف</button>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk create modal */}
      {modal === 'bulk' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title"><i className="pi pi-calendar-plus" /> إنشاء حصص جماعي</h3>
              <button className="modal-close" onClick={() => setModal(null)}><i className="pi pi-times" /></button>
            </div>
            <form onSubmit={handleBulk}>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" style={{ fontWeight: 600 }}>نوع الإنشاء</label>
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input type="radio" value="monthly" checked={bulkForm.bulkType === 'monthly'} onChange={e => setBulkForm(f => ({ ...f, bulkType: e.target.value }))} /> 
                    شهري (شهر محدد)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input type="radio" value="weekly" checked={bulkForm.bulkType === 'weekly'} onChange={e => setBulkForm(f => ({ ...f, bulkType: e.target.value }))} /> 
                    أسبوعي (بين تاريخين)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input type="radio" value="number" checked={bulkForm.bulkType === 'number'} onChange={e => setBulkForm(f => ({ ...f, bulkType: e.target.value }))} /> 
                    عدد محدد من الحصص
                  </label>
                </div>
              </div>
              {bulkForm.sessionType === 'lecture' ? (
                <div className="form-group">
                  <label className="form-label">الصف الدراسي</label>
                  <select className="form-control" required value={bulkForm.grade} onChange={e => setBulkForm(f => ({ ...f, grade: e.target.value }))}>
                    <option value="">-- اختر --</option>
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">المجموعة</label>
                  <select className="form-control" required value={bulkForm.groupId} onChange={e => setBulkForm(f => ({ ...f, groupId: parseInt(e.target.value) }))}>
                    <option value="">-- اختر --</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.grade})</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">اسم الحصة (سيرفق بها الترتيب تلقائياً)</label>
                <input className="form-control" required value={bulkForm.sessionName} onChange={e => setBulkForm(f => ({ ...f, sessionName: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">النوع</label>
                <select className="form-control" value={bulkForm.sessionType || 'session'} onChange={e => setBulkForm(f => ({ ...f, sessionType: e.target.value, groupId: '', grade: '' }))}>
                  <option value="session">حصة دراسية</option>
                  <option value="lecture">محاضرة</option>
                </select>
              </div>

              {bulkForm.bulkType === 'monthly' && (
                <div className="form-group">
                  <label className="form-label">الشهر</label>
                  <select className="form-control" value={bulkForm.sessionMonth} onChange={e => setBulkForm(f => ({ ...f, sessionMonth: e.target.value }))}>
                    {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                  </select>
                </div>
              )}

              {bulkForm.bulkType === 'weekly' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">تاريخ البداية</label>
                    <input className="form-control" type="date" required={bulkForm.bulkType === 'weekly'} value={bulkForm.startDate} onChange={e => setBulkForm(f => ({ ...f, startDate: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">تاريخ النهاية</label>
                    <input className="form-control" type="date" required={bulkForm.bulkType === 'weekly'} value={bulkForm.endDate} onChange={e => setBulkForm(f => ({ ...f, endDate: e.target.value }))} />
                  </div>
                </div>
              )}

              {bulkForm.bulkType === 'number' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">تاريخ البداية</label>
                    <input className="form-control" type="date" required={bulkForm.bulkType === 'number'} value={bulkForm.startDate} onChange={e => setBulkForm(f => ({ ...f, startDate: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">عدد الحصص</label>
                    <input className="form-control" type="number" min="1" required={bulkForm.bulkType === 'number'} value={bulkForm.numberOfSessions} onChange={e => setBulkForm(f => ({ ...f, numberOfSessions: parseInt(e.target.value) }))} />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">وقت الحصة</label>
                <input className="form-control" type="time" required value={bulkForm.sessionHour} onChange={e => setBulkForm(f => ({ ...f, sessionHour: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">أيام الأسبوع</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {DAYS_AR.map((day, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={bulkForm.sessionDays.includes(i)}
                        onChange={e => setBulkForm(f => ({
                          ...f, sessionDays: e.target.checked ? [...f.sessionDays, i] : f.sessionDays.filter(d => d !== i)
                        }))} />
                      {day}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">المدة (ساعة)</label>
                  <input className="form-control" type="number" step="0.5" value={bulkForm.duration} onChange={e => setBulkForm(f => ({ ...f, duration: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">السعر (جنيه)</label>
                  <input className="form-control" type="number" value={bulkForm.price} onChange={e => setBulkForm(f => ({ ...f, price: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary"><i className="pi pi-check" /> إنشاء</button>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Notify Modal ===== */}
      {notifyModal && (
        <div className="modal-overlay" onClick={() => setNotifyModal(null)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title"><i className="pi pi-bell" /> إرسال إشعار لأولياء الأمور</h3>
              <button className="modal-close" onClick={() => setNotifyModal(null)}><i className="pi pi-times" /></button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <p style={{ margin: '0 0 0.5rem' }}>
                <strong>{notifyModal.session?.title}</strong>
                {' · '}
                {notifyModal.action === 'created' ? '🆕 حصة جديدة' : '✏️ تم التعديل'}
              </p>
              <p className="text-muted text-sm">
                {notifyModal.session?.type === 'lecture'
                  ? 'سيُرسل إشعار لأولياء أمور كل طلاب الصف الدراسي عبر واتساب.'
                  : 'سيُرسل إشعار لأولياء أمور طلاب المجموعة عبر واتساب.'}
              </p>
            </div>

            {notifyResult && (
              <div className={`alert alert-${notifyResult.sent > 0 || notifyResult.archived > 0 ? 'success' : (notifyResult.error ? 'error' : 'warning')}`} style={{ marginBottom: '1rem' }}>
                <i className={`pi pi-${notifyResult.sent > 0 || notifyResult.archived > 0 ? 'check-circle' : (notifyResult.error ? 'times-circle' : 'exclamation-triangle')}`} />
                {' '}
                {notifyResult.error ? (
                  <span>حدث خطأ أثناء الإرسال. تأكد من اتصالك بالإنترنت.</span>
                ) : (
                  <>
                    {(notifyResult.sent || 0) > 0 && <span>أُرسل لـ <strong>{notifyResult.sent}</strong> ولي أمر. </span>}
                    {(notifyResult.archived || 0) > 0 && <span>تم أرشفة <strong>{notifyResult.archived}</strong> إشعار. </span>}
                    {(notifyResult.skipped || 0) > 0 && <span>تم تخطي <strong>{notifyResult.skipped}</strong> (مكرر). </span>}
                    {(notifyResult.failed || 0) > 0 && <span>فشل <strong>{notifyResult.failed}</strong>.</span>}
                    {(notifyResult.sent || 0) === 0 && (notifyResult.archived || 0) === 0 && (notifyResult.skipped || 0) === 0 && (notifyResult.failed || 0) === 0 && (
                      <span>لم يتم إرسال أو أرشفة أي شيء (تأكد من وجود طلاب مسجلين بأرقام صحيحة).</span>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="modal-footer">
              <button
                className="btn btn-primary"
                disabled={notifySending}
                onClick={async () => {
                  setNotifySending(true)
                  try {
                    const r = await notifySession(notifyModal.session?.id, notifyModal.action)
                    setNotifyResult(r.data || { error: true })
                  } catch { setNotifyResult({ error: true }) }
                  setNotifySending(false)
                }}
              >
                {notifySending ? <><i className="pi pi-spin pi-spinner" /> جاري الإرسال...</> : <><i className="pi pi-send" /> إرسال الإشعار</>}
              </button>
              <button className="btn btn-secondary" onClick={() => setNotifyModal(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
