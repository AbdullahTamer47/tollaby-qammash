import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getGroups, getStudents, getStudent } from '../api'
import { QRCodeSVG } from 'qrcode.react'

export default function QRCodesPage() {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedGroup, setSelectedGroup] = useState('')
  const [students, setStudents] = useState([])
  const [fetching, setFetching] = useState(false)

  const [studentIdInput, setStudentIdInput] = useState('')
  const [searchParams] = useSearchParams()

  useEffect(() => {
    getGroups().then(r => setGroups(r.data)).finally(() => setLoading(false))
    
    const sid = searchParams.get('student_id')
    if (sid) {
      setStudentIdInput(sid)
      handleFetchSingleStudent(sid)
    }
  }, [])

  const handleFetchSingleStudent = async (sid) => {
    setFetching(true)
    try {
      const r = await getStudent(sid)
      setStudents([r.data])
    } catch {
      alert('الطالب غير موجود')
    } finally {
      setFetching(false)
    }
  }

  const handleFetchStudents = async () => {
    if (!selectedGroup) return
    setFetching(true)
    try {
      const r = await getStudents({ groupId: selectedGroup, per_page: 1000 })
      setStudents(r.data.students)
    } catch {
      alert('فشل جلب الطلاب')
    } finally {
      setFetching(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div>
      <div className="page-header no-print">
        <h1 className="page-title">طباعة رموز QR</h1>
        <p className="page-subtitle">توليد وطباعة بطاقات QR للطلاب</p>
      </div>

      <div className="card no-print" style={{ maxWidth: '600px', marginBottom: '2rem' }}>
        <div className="card-header">
          <h2 className="card-title"><i className="pi pi-qrcode" /> إعدادات الطباعة</h2>
        </div>
        
        {loading ? <div className="spinner-wrapper"><div className="spinner" /></div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="alert alert-info">
              <i className="pi pi-info-circle" />
              قم باختيار المجموعة لعرض رموز QR للطلاب، ثم اضغط على زر الطباعة.
            </div>
            
            <div className="form-group">
              <label className="form-label">اختر المجموعة</label>
              <select className="form-control" value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
                <option value="">-- اختر مجموعة --</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.grade})</option>)}
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">أو بحث برقم الطالب</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  className="form-control" 
                  type="number" 
                  placeholder="رقم الطالب..." 
                  value={studentIdInput} 
                  onChange={e => setStudentIdInput(e.target.value)} 
                />
                <button 
                  className="btn btn-secondary" 
                  onClick={() => handleFetchSingleStudent(studentIdInput)} 
                  disabled={!studentIdInput || fetching}
                >
                  بحث الطالب
                </button>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn btn-primary" onClick={handleFetchStudents} disabled={!selectedGroup || fetching}>
                <i className={`pi ${fetching ? 'pi-spin pi-spinner' : 'pi-search'}`} /> عرض الرموز
              </button>
              {students.length > 0 && (
                <button className="btn btn-success" onClick={handlePrint}>
                  <i className="pi pi-print" /> طباعة الصفحة
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {students.length > 0 && (
        <div className="print-only-container">
          <style>{`
            @media print {
              body * { visibility: hidden; }
              .print-only-container, .print-only-container * { visibility: visible; }
              .print-only-container { position: absolute; left: 0; top: 0; width: 100%; display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
              .no-print { display: none !important; }
              .qr-card { border: 2px dashed #000; padding: 15px; text-align: center; page-break-inside: avoid; }
              .qr-card h3 { font-size: 14px; margin: 10px 0 5px; }
              .qr-card p { font-size: 12px; margin: 0; }
            }
            @media screen {
              .print-only-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
              .qr-card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: var(--border-radius); padding: 1rem; text-align: center; }
              .qr-card h3 { font-size: 1rem; margin: 0.5rem 0 0.25rem; color: var(--text-color); }
              .qr-card p { font-size: 0.8rem; margin: 0; color: var(--text-color-secondary); }
            }
          `}</style>
          {students.map(s => (
            <div key={s.id} className="qr-card">
              <QRCodeSVG value={s.id.toString()} size={120} />
              <h3>{s.name}</h3>
              <p>رقم الطالب: {s.id}</p>
              <p>{s.group?.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
