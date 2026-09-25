import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getGroups, changeStudentGroup, getGroupStudents } from '../api'
import Pagination from '../components/Pagination'

export default function GroupStudentsPage() {
  const { id } = useParams()
  const [group, setGroup] = useState(null)
  const [students, setStudents] = useState([])
  const [allGroups, setAllGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)

  // Move Modal
  const [moveModal, setMoveModal] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [targetGroupId, setTargetGroupId] = useState('')

  // Add Student Modal (Search by ID or Name)
  const [addModal, setAddModal] = useState(false)
  const [addStudentId, setAddStudentId] = useState('')

  const [currentPage, setCurrentPage] = useState(1);
  
  const PER_PAGE = 10;

  const load = async () => {
    setLoading(true)
    try {
      const [groupsRes, studentsRes] = await Promise.all([
        getGroups(),
        getGroupStudents(id)
      ])
      
      const currentGroup = groupsRes.data.find(g => g.id === parseInt(id))
      setGroup(currentGroup)
      setAllGroups(groupsRes.data)
      setStudents(studentsRes.data)
    } catch (err) {
      setMsg({ type: 'error', text: 'فشل تحميل بيانات المجموعة' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const handleRemove = async (studentId) => {
    if (!window.confirm('هل أنت متأكد من إزالة هذا الطالب من المجموعة؟')) return
    try {
      const noGroup = allGroups.find(g => g.grade === 'بدون صف محدد')
      if (!noGroup) {
        setMsg({ type: 'error', text: 'يرجى إنشاء مجموعة "بدون صف محدد" أولاً لاستخدامها كمجموعة افتراضية.' })
        return
      }
      await changeStudentGroup(studentId, noGroup.id)
      setMsg({ type: 'success', text: 'تمت إزالة الطالب بنجاح' })
      load()
    } catch {
      setMsg({ type: 'error', text: 'فشل إزالة الطالب' })
    }
  }

  const handleMove = async (e) => {
    e.preventDefault()
    if (!targetGroupId) return
    try {
      await changeStudentGroup(selectedStudent.id, targetGroupId)
      setMsg({ type: 'success', text: 'تم نقل الطالب بنجاح' })
      setMoveModal(false)
      load()
    } catch {
      setMsg({ type: 'error', text: 'فشل نقل الطالب' })
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!addStudentId) return
    try {
      await changeStudentGroup(addStudentId, id)
      setMsg({ type: 'success', text: 'تم إضافة الطالب للمجموعة' })
      setAddModal(false)
      setAddStudentId('')
      load()
    } catch {
      setMsg({ type: 'error', text: 'تأكد من رقم الطالب أو تأكد أنه مسجل' })
    }
  }

  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * PER_PAGE;
    return students.slice(start, start + PER_PAGE);
  }, [students, currentPage]);

  if (loading) return <div className="spinner-wrapper"><div className="spinner" /></div>
  if (!group) return <div className="empty-state"><p>المجموعة غير موجودة</p></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">إدارة طلاب: {group.name}</h1>
          <p className="page-subtitle">{group.grade} · {students.length} طلاب</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-primary" onClick={() => setAddModal(true)}>
            <i className="pi pi-user-plus" /> إضافة طالب موجود
          </button>
          <Link to="/groups" className="btn btn-secondary">عودة للمجموعات</Link>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type === 'success' ? 'success' : 'error'}`}>
          {msg.text}
          <button style={{ marginRight: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>الرقم</th>
                <th>الاسم</th>
                <th>الهاتف</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {paginatedStudents.map(s => (
                <tr key={s.id}>
                  <td><span className="badge badge-info">{s.id}</span></td>
                  <td><Link to={`/students/${s.id}/dashboard`}>{s.name}</Link></td>
                  <td>{s.phoneNumber || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedStudent(s); setTargetGroupId(''); setMoveModal(true) }}>
                        <i className="pi pi-arrow-right-arrow-left" /> نقل
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleRemove(s.id)}>
                        <i className="pi pi-times" /> إزالة
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedStudents.length === 0 && (
                <tr><td colSpan="4" className="text-center" style={{ padding: '2rem' }}>لا يوجد طلاب في هذه المجموعة</td></tr>
              )}
            </tbody>
          </table>
        </div>
        
        <Pagination 
          totalItems={students.length} 
          itemsPerPage={PER_PAGE} 
          currentPage={currentPage} 
          onPageChange={setCurrentPage} 
        />
      </div>

      {/* Move Student Modal */}
      {moveModal && selectedStudent && (
        <div className="modal-overlay" onClick={() => setMoveModal(false)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">نقل الطالب {selectedStudent.name}</h3>
              <button className="modal-close" onClick={() => setMoveModal(false)}><i className="pi pi-times" /></button>
            </div>
            <form onSubmit={handleMove}>
              <div className="form-group">
                <label className="form-label">المجموعة الوجهة</label>
                <select className="form-control" required value={targetGroupId} onChange={e => setTargetGroupId(e.target.value)}>
                  <option value="">-- اختر مجموعة --</option>
                  {allGroups.filter(g => g.id !== group.id).map(g => (
                    <option key={g.id} value={g.id}>{g.name} ({g.grade})</option>
                  ))}
                </select>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary" disabled={!targetGroupId}><i className="pi pi-check" /> نقل</button>
                <button type="button" className="btn btn-secondary" onClick={() => setMoveModal(false)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {addModal && (
        <div className="modal-overlay" onClick={() => setAddModal(false)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">إضافة طالب موجود للمجموعة</h3>
              <button className="modal-close" onClick={() => setAddModal(false)}><i className="pi pi-times" /></button>
            </div>
            <form onSubmit={handleAdd}>
              <div className="form-group">
                <label className="form-label">رقم الطالب</label>
                <input 
                  type="number" 
                  className="form-control" 
                  required 
                  value={addStudentId} 
                  onChange={e => setAddStudentId(e.target.value)} 
                  placeholder="أدخل رقم الطالب للبحث والنقل..."
                />
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-success" disabled={!addStudentId}><i className="pi pi-check" /> إضافة للمجموعة</button>
                <button type="button" className="btn btn-secondary" onClick={() => setAddModal(false)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
