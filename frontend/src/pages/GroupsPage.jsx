import { useEffect, useState } from 'react'
import { getGroups, createGroup, updateGroup, deleteGroup } from '../api'
import { Link } from 'react-router-dom'
import Pagination from '../components/Pagination'

const GRADES = [
  'الصف السادس الابتدائي', 'الصف الأول الاعدادي', 'الصف الثاني الاعدادي',
  'الصف الثالث الاعدادي', 'الصف الأول الثانوي', 'الصف الثاني الثانوي',
  'الصف الثالث الثانوي', 'بدون صف محدد'
]

export default function GroupsPage() {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', grade: GRADES[0] })
  const [msg, setMsg] = useState(null)

  const [currentPage, setCurrentPage] = useState(1);
  
  const PER_PAGE = 10;

  const load = () => {
    setLoading(true)
    getGroups().then(r => setGroups(r.data)).catch(() => { }).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const openAdd = () => { setForm({ name: '', grade: GRADES[0] }); setEditing(null); setModal('form') }
  const openEdit = (g) => { setForm({ name: g.name, grade: g.grade }); setEditing(g); setModal('form') }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      editing ? await updateGroup(editing.id, form) : await createGroup(form)
      setMsg({ type: 'success', text: editing ? 'تم تعديل المجموعة' : 'تم إضافة المجموعة' })
      setModal(null); load()
    } catch { setMsg({ type: 'error', text: 'خطأ في الحفظ' }) }
  }

  const handleDelete = async () => {
    try {
      await deleteGroup(editing.id)
      setMsg({ type: 'success', text: 'تم حذف المجموعة' }); setModal(null); load()
    } catch { setMsg({ type: 'error', text: 'فشل الحذف — تأكد من عدم وجود طلاب في المجموعة' }) }
  }

  const paginatedGroups = groups.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  const byGrade = paginatedGroups.reduce((acc, g) => {
    if (!acc[g.grade]) acc[g.grade] = []
    acc[g.grade].push(g); return acc
  }, {})

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">المجموعات</h1>
          <p className="page-subtitle">{groups.length} مجموعة</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><i className="pi pi-plus" /> إضافة مجموعة</button>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type === 'success' ? 'success' : 'error'}`}>
          <i className={`pi pi-${msg.type === 'success' ? 'check-circle' : 'exclamation-circle'}`} />{msg.text}
          <button style={{ marginRight: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      {loading ? <div className="spinner-wrapper"><div className="spinner" /></div>
        : Object.entries(byGrade).map(([grade, gradeGroups]) => (
          <div className="card" key={grade}>
            <div className="card-header">
              <h2 className="card-title"><i className="pi pi-book" /> {grade}</h2>
              <span className="badge badge-info">{gradeGroups.length} مجموعة</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
              {gradeGroups.map(g => (
                <div key={g.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div style={{ fontWeight: 700, color: '#000000ff' }}>{g.name}</div>
                    <span className="badge badge-success">{g._count?.students ?? 0} طالب</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <Link to={`/groups/${g.id}/students`} className="btn btn-secondary btn-sm" title="إدارة الطلاب">
                      <i className="pi pi-users" />
                    </Link>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(g)}><i className="pi pi-pencil" /></button>
                    <button className="btn btn-danger btn-sm" onClick={() => { setEditing(g); setModal('delete') }}><i className="pi pi-trash" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      }

      <Pagination 
        totalItems={groups.length} 
        itemsPerPage={PER_PAGE} 
        currentPage={currentPage} 
        onPageChange={setCurrentPage} 
      />

      {modal === 'form' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'تعديل مجموعة' : 'إضافة مجموعة'}</h3>
              <button className="modal-close" onClick={() => setModal(null)}><i className="pi pi-times" /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label">اسم المجموعة</label>
                <input className="form-control" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">الصف الدراسي</label>
                <select className="form-control" value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}>
                  {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
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
              <h3 className="modal-title" style={{ color: '#ef9a9a' }}><i className="pi pi-exclamation-triangle" /> تأكيد الحذف</h3>
              <button className="modal-close" onClick={() => setModal(null)}><i className="pi pi-times" /></button>
            </div>
            <p>هل تريد حذف مجموعة <strong>{editing?.name}</strong>؟</p>
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
