import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { getExamDegrees, editExamDegrees, notifyExamGrades } from '../api'
import { exportToCSV } from '../utils/csvExport'
import Pagination from '../components/Pagination'

export default function ExamDegreesPage() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [degrees, setDegrees] = useState({}) // studentId -> degree
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  const [currentPage, setCurrentPage] = useState(1);
  
  const PER_PAGE = 10;

  const load = () => {
    setLoading(true)
    getExamDegrees(id).then(r => {
      setData(r.data)
      const initial = {}
      r.data.degrees.forEach(res => { initial[res.student.id] = res.studentDegree ?? '' })
      setDegrees(initial)
    }).catch((err) => { console.error(err); setMsg({ type: 'error', text: 'فشل تحميل بيانات الامتحان' }) }).finally(() => setLoading(false))
  }
  useEffect(load, [id])

  const handleExportCSV = () => {
    if (!data) return
    const columns = [
      { header: 'رقم الطالب', key: 'student.id' },
      { header: 'اسم الطالب', key: 'student.name' },
      { header: 'الدرجة', render: r => degrees[r.student.id] !== '' ? degrees[r.student.id] : 'غائب' }
    ]
    exportToCSV(data.degrees, columns, `exam_degrees_${id}`)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = Object.entries(degrees).map(([sId, deg]) => ({
        studentId: parseInt(sId),
        degree: deg === '' ? null : parseFloat(deg)
      }))
      await editExamDegrees(id, { degrees: payload })
      setMsg({ type: 'success', text: 'تم حفظ الدرجات بنجاح' })
      load()
    } catch { setMsg({ type: 'error', text: 'فشل حفظ الدرجات' }) }
    finally { setSaving(false) }
  }

  const paginatedResults = useMemo(() => {
    if (!data?.degrees) return [];
    const start = (currentPage - 1) * PER_PAGE;
    return data.degrees.slice(start, start + PER_PAGE);
  }, [data, currentPage]);

  if (loading) return <div className="spinner-wrapper"><div className="spinner" /></div>
  if (!data) return <div className="empty-state"><i className="pi pi-pencil" /><p>الامتحان غير موجود</p></div>

  const { exam, degrees: results } = data
  const gradedCount = results.filter(r => degrees[r.student.id] !== '').length

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">درجات: {exam.title}</h1>
          <p className="page-subtitle">{exam.group?.name} · الدرجة النهائية: {exam.totalDegree}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={handleExportCSV}>
            <i className="pi pi-download" /> تصدير CSV
          </button>
          <button className="btn btn-primary" onClick={async () => {
            if (!confirm('هل تريد إرسال الدرجات المسجلة لأولياء الأمور؟')) return;
            try {
              const r = await notifyExamGrades(id);
              const stats = r.data;
              const text = `تم إرسال/أرشفة الإشعارات بنجاح. ` + 
                           (stats.sent ? `(أُرسل: ${stats.sent}) ` : '') +
                           (stats.archived ? `(أؤرشف: ${stats.archived}) ` : '') +
                           (stats.skipped ? `(تخطى مكرر: ${stats.skipped})` : '');
              setMsg({ type: 'success', text });
            } catch {
              setMsg({ type: 'error', text: 'فشل إرسال الدرجات' });
            }
          }}>
            <i className="pi pi-send" /> إرسال الدرجات
          </button>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-icon blue"><i className="pi pi-users" /></div>
          <div><div className="stat-value">{results.length}</div><div className="stat-label">إجمالي الطلاب</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><i className="pi pi-check" /></div>
          <div><div className="stat-value">{gradedCount}</div><div className="stat-label">تم الرصد</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><i className="pi pi-minus" /></div>
          <div><div className="stat-value">{results.length - gradedCount}</div><div className="stat-label">بانتظار الرصد</div></div>
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
          <h2 className="card-title"><i className="pi pi-list" /> رصد الدرجات</h2>
        </div>
        <form onSubmit={handleSave}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>رقم الطالب</th>
                  <th>الاسم</th>
                  <th style={{ width: '150px' }}>الدرجة</th>
                </tr>
              </thead>
              <tbody>
                {paginatedResults.map(r => (
                  <tr key={r.student.id}>
                    <td><span className="badge badge-info">{r.student.id}</span></td>
                    <td style={{ fontWeight: 600 }}>{r.student.name}</td>
                    <td>
                      <input
                        className="form-control"
                        type="number"
                        step="0.5"
                        min="0"
                        max={exam.totalDegree}
                        placeholder={`من ${exam.totalDegree}`}
                        value={degrees[r.student.id] ?? ''}
                        onChange={e => setDegrees(prev => ({ ...prev, [r.student.id]: e.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <Pagination 
            totalItems={results.length} 
            itemsPerPage={PER_PAGE} 
            currentPage={currentPage} 
            onPageChange={setCurrentPage} 
          />
          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><i className="pi pi-spin pi-spinner" /> جاري الحفظ...</> : <><i className="pi pi-save" /> حفظ التعديلات</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
