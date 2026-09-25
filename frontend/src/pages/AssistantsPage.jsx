import { useEffect, useState, useMemo } from 'react'
import { getAssistants, createAssistant, updateAssistant, deleteAssistant } from '../api'
import Pagination from '../components/Pagination'

const PERMISSION_OPTIONS = [
  { id: 'students', label: 'إدارة الطلاب' },
  { id: 'groups', label: 'إدارة المجموعات' },
  { id: 'sessions', label: 'إدارة الحصص' },
  { id: 'attendance', label: 'الحضور والغياب' },
  { id: 'payments', label: 'إدارة المدفوعات' },
  { id: 'exams', label: 'الامتحانات والدرجات' },
  { id: 'books', label: 'الكتب والمذكرات' }
]

export default function AssistantsPage() {
  const [assistants, setAssistants] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)

  const [modal, setModal] = useState(null) // 'create' | 'edit' | 'delete'
  const [editing, setEditing] = useState(null)

  // Form State
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [permissions, setPermissions] = useState([])

  const [currentPage, setCurrentPage] = useState(1);
  
  const PER_PAGE = 10;

  const load = () => {
    setLoading(true)
    getAssistants()
      .then(r => setAssistants(r.data))
      .catch(() => setMsg({ type: 'error', text: 'فشل تحميل المساعدين' }))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditing(null)
    setUsername('')
    setPassword('')
    setPermissions([])
    setModal('create')
  }

  const openEdit = (assistant) => {
    setEditing(assistant)
    setUsername(assistant.username)
    setPassword('')
    setPermissions(assistant.permissions || [])
    setModal('edit')
  }

  const togglePermission = (permId) => {
    setPermissions(prev =>
      prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]
    )
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      if (modal === 'create') {
        await createAssistant({ username, password, permissions })
        setMsg({ type: 'success', text: 'تم إضافة المساعد بنجاح' })
      } else if (modal === 'edit') {
        const payload = { username, permissions }
        if (password) payload.password = password
        await updateAssistant(editing.id, payload)
        setMsg({ type: 'success', text: 'تم تعديل المساعد بنجاح' })
      }
      setModal(null)
      load()
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'حدث خطأ' })
    }
  }

  const handleDelete = async () => {
    try {
      await deleteAssistant(editing.id)
      setMsg({ type: 'success', text: 'تم حذف المساعد' })
      setModal(null)
      load()
    } catch (err) {
      setMsg({ type: 'error', text: 'فشل الحذف' })
    }
  }

  const paginatedAssistants = useMemo(() => {
    const start = (currentPage - 1) * PER_PAGE;
    return assistants.slice(start, start + PER_PAGE);
  }, [assistants, currentPage]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">إدارة المساعدين</h1>
          <p className="page-subtitle">أضف مساعدين وحدد صلاحيات كل منهم</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <i className="pi pi-plus" /> إضافة مساعد
        </button>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type === 'success' ? 'success' : 'error'}`}>
          {msg.text}
          <button style={{ marginRight: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      {loading ? <div className="spinner-wrapper"><div className="spinner" /></div>
        : (
          <div className="card">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>تاريخ الإضافة</th>
                    <th>الصلاحيات</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAssistants.map(a => (
                    <tr key={a.id}>
                      <td className="font-bold">{a.username}</td>
                      <td>{new Date(a.dateJoined).toLocaleDateString('ar-EG')}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {a.permissions?.length > 0 ? (
                            a.permissions.map(p => {
                              const label = PERMISSION_OPTIONS.find(o => o.id === p)?.label || p;
                              return <span key={p} className="badge badge-info">{label}</span>
                            })
                          ) : (
                            <span className="text-muted text-sm">لا يوجد صلاحيات</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(a)}>
                            <i className="pi pi-pencil" /> تعديل
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => { setEditing(a); setModal('delete') }}>
                            <i className="pi pi-trash" /> حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {assistants.length === 0 && (
                    <tr>
                      <td colSpan="4" className="text-center" style={{ padding: '2rem' }}>لا يوجد مساعدين</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <Pagination 
              totalItems={assistants.length} 
              itemsPerPage={PER_PAGE} 
              currentPage={currentPage} 
              onPageChange={setCurrentPage} 
            />
          </div>
        )}

      {/* Modal: Create/Edit */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{modal === 'create' ? 'إضافة مساعد جديد' : 'تعديل المساعد'}</h3>
              <button className="modal-close" onClick={() => setModal(null)}><i className="pi pi-times" /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label">اسم المستخدم (للدخول)</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{modal === 'edit' ? 'كلمة المرور الجديدة (اتركها فارغة إذا لم ترد تغييرها)' : 'كلمة المرور'}</label>
                <input
                  type="password"
                  className="form-control"
                  required={modal === 'create'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ marginBottom: '0.75rem' }}>الصلاحيات الممنوحة</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  {PERMISSION_OPTIONS.map(opt => (
                    <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={permissions.includes(opt.id)}
                        onChange={() => togglePermission(opt.id)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
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

      {/* Modal: Delete */}
      {modal === 'delete' && editing && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">تأكيد الحذف</h3>
              <button className="modal-close" onClick={() => setModal(null)}><i className="pi pi-times" /></button>
            </div>
            <p>هل أنت متأكد من حذف المساعد <strong>{editing.username}</strong>؟ لن يمكن التراجع عن هذا الإجراء.</p>
            <div className="modal-footer">
              <button className="btn btn-danger" onClick={handleDelete}><i className="pi pi-trash" /> نعم، احذف</button>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
