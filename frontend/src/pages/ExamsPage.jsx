import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getExams, createExam, updateExam, deleteExam, getGroups } from '../api'
import { exportToCSV } from '../utils/csvExport'
import Pagination from '../components/Pagination'

export default function ExamsPage() {
  const navigate = useNavigate()
  const [state, setState] = useState({ exams: [], total: 0, page: 1 })
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState(null)
  const [form, setForm] = useState({ title: '', totalDegree: '', targetType: 'group', groupId: '', grade: '' })
  
  const GRADES = [
    'الصف السادس الابتدائي','الصف الأول الاعدادي','الصف الثاني الاعدادي','الصف الثالث الاعدادي',
    'الصف الأول الثانوي','الصف الثاني الثانوي','الصف الثالث الثانوي','بدون صف محدد'
  ]

  const [filterGroupId, setFilterGroupId] = useState('')

  const PER_PAGE = 10;

  const load = (page = 1) => {
    setLoading(true)
    const params = { page, per_page: PER_PAGE }
    if (filterGroupId) params.groupId = filterGroupId

    getExams(params)
      .then(r => setState({ exams: r.data.exams, total: r.data.total, page }))
      .catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [filterGroupId])

  useEffect(() => {
    getGroups().then(r => setGroups(r.data))
  }, [])

  const handleExportCSV = () => {
    getExams({ groupId: filterGroupId, per_page: 10000 }).then(r => {
      const columns = [
        { header: 'الرقم', key: 'id' },
        { header: 'العنوان', key: 'title' },
        { header: 'المجموعة', key: 'group.name' },
        { header: 'الدرجة النهائية', key: 'totalDegree' }
      ]
      exportToCSV(r.data.exams, columns, 'exams_export')
    })
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      const payload = {
        title: form.title,
        totalDegree: form.totalDegree,
        minPassDegree: form.minPassDegree,
        groupId: form.targetType === 'group' ? form.groupId : null,
        grade: form.targetType === 'grade' ? form.grade : null
      }
      if (editing) await updateExam(editing.id, payload)
      else await createExam(payload)
      setMsg({ type: 'success', text: editing ? 'تم تعديل الامتحان' : 'تم إضافة الامتحان' })
      setModal(null); load(state.page)
    } catch { setMsg({ type: 'error', text: 'فشل الحفظ' }) }
  }

  const handleDelete = async () => {
    try { await deleteExam(editing.id); setMsg({ type: 'success', text: 'تم الحذف' }); setModal(null); load(1) }
    catch { setMsg({ type: 'error', text: 'فشل الحذف' }) }
  }

  const totalPages = Math.ceil(state.total / PER_PAGE)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">الامتحانات</h1>
          <p className="page-subtitle">إجمالي: {state.total} امتحان</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleExportCSV}>
            <i className="pi pi-download" /> تصدير CSV
          </button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setForm({ title: '', totalDegree: '', minPassDegree: '', targetType: 'group', groupId: groups[0]?.id || '', grade: GRADES[0] }); setModal('form') }}>
            <i className="pi pi-plus" /> إضافة امتحان
          </button>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type === 'success' ? 'success' : 'error'}`}>
          <i className={`pi pi-${msg.type === 'success' ? 'check-circle' : 'exclamation-circle'}`} />{msg.text}
          <button style={{ marginRight: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title"><i className="pi pi-pencil" /> قائمة الامتحانات</h2>
          <select className="form-control" style={{ width: '200px' }} value={filterGroupId} onChange={e => setFilterGroupId(e.target.value)}>
            <option value="">-- جميع المجموعات --</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.grade})</option>)}
          </select>
        </div>
        {loading ? <div className="spinner-wrapper"><div className="spinner" /></div>
          : state.exams.length === 0
            ? <div className="empty-state"><i className="pi pi-pencil" /><p>لا توجد امتحانات مسجلة</p></div>
            : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>العنوان</th>
                      <th>المجموعة</th>
                      <th>الدرجة النهائية</th>
                      <th>معيار الضعف</th>
                      <th>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.exams.map(e => (
                      <tr key={e.id}>
                        <td><span className="badge badge-info">{e.id}</span></td>
                        <td style={{ fontWeight: 600 }}>{e.title}</td>
                        <td>
                          {e.groupId ? `${e.group?.name} (${e.group?.grade})` : e.grade ? `كل ${e.grade}` : 'كل المجموعات والصفوف'}
                        </td>
                        <td><span className="badge badge-success">{e.totalDegree}</span></td>
                        <td><span className="badge badge-error">{e.minPassDegree}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/exams/${e.id}/degrees`)}>
                              <i className="pi pi-list" /> الدرجات
                            </button>
                            <button className="btn btn-secondary btn-sm btn-icon" onClick={() => { setEditing(e); setForm({ title: e.title, totalDegree: e.totalDegree, minPassDegree: e.minPassDegree || '', targetType: e.groupId ? 'group' : e.grade ? 'grade' : 'all', groupId: e.groupId || groups[0]?.id || '', grade: e.grade || GRADES[0] }); setModal('form') }}>
                              <i className="pi pi-pencil" />
                            </button>
                            <button className="btn btn-danger btn-sm btn-icon" onClick={() => { setEditing(e); setModal('delete') }}>
                              <i className="pi pi-trash" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        }
        <Pagination
          totalItems={state.total}
          itemsPerPage={PER_PAGE}
          currentPage={state.page}
          onPageChange={page => load(page)}
        />
      </div>

      {modal === 'form' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'تعديل امتحان' : 'إضافة امتحان'}</h3>
              <button className="modal-close" onClick={() => setModal(null)}><i className="pi pi-times" /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label">الاستهداف (لمن هذا الامتحان؟)</label>
                <select className="form-control" value={form.targetType} onChange={e => setForm(f => ({ ...f, targetType: e.target.value }))}>
                  <option value="group">مجموعة محددة</option>
                  <option value="grade">صف دراسي كامل</option>
                  <option value="all">جميع الطلاب (الكل)</option>
                </select>
              </div>
              
              {form.targetType === 'group' && (
                <div className="form-group">
                  <label className="form-label">المجموعة</label>
                  <select className="form-control" required value={form.groupId} onChange={e => setForm(f => ({ ...f, groupId: parseInt(e.target.value) }))}>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.grade})</option>)}
                  </select>
                </div>
              )}

              {form.targetType === 'grade' && (
                <div className="form-group">
                  <label className="form-label">الصف الدراسي</label>
                  <select className="form-control" required value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}>
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">عنوان الامتحان</label>
                <input className="form-control" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">الدرجة النهائية</label>
                  <input className="form-control" type="number" step="0.5" min="1" required value={form.totalDegree} onChange={e => setForm(f => ({ ...f, totalDegree: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">معيار الضعف (أقل درجة)</label>
                  <input className="form-control" type="number" step="0.5" min="0" required value={form.minPassDegree} onChange={e => setForm(f => ({ ...f, minPassDegree: e.target.value }))} placeholder="مثال: 10" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary"><i className="pi pi-check" /> حفظ</button>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'delete' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: '#dc3545' }}><i className="pi pi-exclamation-triangle" /> تأكيد الحذف</h3>
              <button className="modal-close" onClick={() => setModal(null)}><i className="pi pi-times" /></button>
            </div>
            <p>هل تريد حذف امتحان <strong>{editing?.title}</strong>؟</p>
            <div className="modal-footer">
              <button className="btn btn-danger" onClick={handleDelete}><i className="pi pi-trash" /> حذف</button>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
